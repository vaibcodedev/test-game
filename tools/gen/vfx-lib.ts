/** Помощники для tools/gen/vfx.ts и vfx-gen.ts (задача 127): чтение кадров паков, обрезка по якорю, прореживание, перекраска, превью.
 *  Паки эффектов — пиксель-арт с жёсткой альфой и крошечной палитрой (7–27 цветов), поэтому перекраска идёт по яркости цвета
 *  (градиентная карта по рампе стихии), а не по оттенку: форма и тени остаются теми, что нарисовал автор. */
import fs from "node:fs";
import path from "node:path";
import { PC, hex, mix, type RGBA, type Ramp } from "./canvas";
import { readPng, crop, luma, scaleNN, downscaleMode, tidy, drawText, textWidth, fill, groundTile, paintGround, BG, BEIGE, GOLD } from "./vendor-lib";

export { readPng, crop, luma, scaleNN, downscaleMode, tidy, drawText, textWidth, fill, paintGround, groundTile, BG, BEIGE, GOLD };

export const natCmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Кадры из каталога отдельных PNG (порядок — по числу в имени). */
export function loadDir(dir: string, re: RegExp = /\.png$/i): PC[] {
  return fs.readdirSync(dir).filter((f) => re.test(f)).sort(natCmp).map((f) => readPng(path.join(dir, f)));
}

/** Кадры из листа: сетка fw×fh, читается слева направо, сверху вниз; n — сколько взять (по умолчанию все). */
export function sliceSheet(sheet: PC, fw: number, fh: number, n?: number): PC[] {
  const cols = Math.floor(sheet.w / fw), rows = Math.floor(sheet.h / fh);
  const out: PC[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(crop(sheet, c * fw, r * fh, fw, fh));
  return n ? out.slice(0, n) : out;
}

/** Пустой кадр (ни одного видимого пикселя). */
export const isBlank = (f: PC) => { for (let i = 3; i < f.data.length; i += 4) if (f.data[i]) return false; return true; };

/** Обрезка пустых кадров: в конце всегда, в начале — если lead. */
export function trimBlank(frames: PC[], lead = true): PC[] {
  let a = 0, b = frames.length;
  while (b > a + 1 && isBlank(frames[b - 1])) b--;
  while (lead && a < b - 1 && isBlank(frames[a])) a++;
  return frames.slice(a, b);
}

/** Рамка видимых пикселей по всем кадрам: [x0, y0, x1, y1) или null. */
export function unionBox(frames: PC[]): [number, number, number, number] | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const f of frames) for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    if (!f.data[(y * f.w + x) * 4 + 3]) continue;
    if (x < x0) x0 = x; if (x + 1 > x1) x1 = x + 1; if (y < y0) y0 = y; if (y + 1 > y1) y1 = y + 1;
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

export interface Norm { frames: PC[]; w: number; h: number; anchor: [number, number] }

/** Обрезка кадров по общей рамке эффекта с привязкой к якорю: (ax, ay) — пиксель исходного кадра, который встанет в точку применения.
 *  По оси, где якорь ближе к середине (доля 0.15–0.85), обрезка симметрична относительно якоря (якорь точно в центре, доля 0.5);
 *  у края (земля под ногами, точка удара на краю кадра) — по рамке, якорь остаётся на краю. Размеры целые, якорь на целом пикселе. */
export function cropToAnchor(frames: PC[], ax: number, ay: number, fw: number, fh: number): Norm {
  const box = unionBox(frames) ?? [0, 0, fw, fh];
  const [x0, y0, x1, y1] = box;
  const symX = ax / fw > 0.15 && ax / fw < 0.85, symY = ay / fh > 0.15 && ay / fh < 0.85;
  let xa: number, xb: number, ya: number, yb: number;
  if (symX) { const hh = Math.max(ax - x0, x1 - ax, 1); xa = ax - hh; xb = ax + hh; } else { xa = Math.min(x0, ax); xb = Math.max(x1, ax); }
  if (symY) { const hh = Math.max(ay - y0, y1 - ay, 1); ya = ay - hh; yb = ay + hh; } else { ya = Math.min(y0, ay); yb = Math.max(y1, ay); }
  const w = xb - xa, h = yb - ya;
  return { frames: frames.map((f) => crop(f, xa, ya, w, h)), w, h, anchor: [(ax - xa) / w, (ay - ya) / h] };
}

/** Равномерная выборка k индексов из n (первый и последний сохраняются). */
export function pickIdx(n: number, k: number): number[] {
  if (k >= n) return [...Array(n).keys()];
  return [...Array(k).keys()].map((i) => Math.round((i * (n - 1)) / Math.max(1, k - 1)));
}

/** Кадр-пик: больше всего видимых пикселей (для вспышек и всплесков это самый выразительный момент). */
export function peakIndex(frames: PC[]): number {
  let best = 0, bv = -1;
  frames.forEach((f, i) => {
    let n = 0, white = 0;
    for (let k = 0; k < f.data.length; k += 4) if (f.data[k + 3]) { n++; if (f.data[k] > 245 && f.data[k + 1] > 245 && f.data[k + 2] > 245) white++; }
    if (white > 0.8 * n) n = Math.round(n * 0.2); // кадр-вспышка из сплошного белого пятна — не пик
    if (n > bv) { bv = n; best = i; }
  });
  return best;
}

/** Склейка в одну строку кадров. */
export function toRow(frames: PC[], w: number, h: number): PC {
  const out = new PC(frames.length * w, h);
  frames.forEach((f, i) => out.blit(f, i * w, 0));
  return out;
}

export function flipH(f: PC): PC {
  const out = new PC(f.w, f.h);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const s = (y * f.w + x) * 4, d = (y * f.w + (f.w - 1 - x)) * 4; for (let k = 0; k < 4; k++) out.data[d + k] = f.data[s + k]; }
  return out;
}

// ---------- рампы стихий (тёмный → светлый), цвета из tools/gen/palette.ts и KIND_COLOR клиента ----------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
export const RAMPS: Record<string, Ramp> = {
  /** Огонь: P.magic.fire с белёсой вершиной. */
  fire: R("#4a1410", "#8a2a12", "#d04a14", "#f48a24", "#ffc84a", "#fff4c0"),
  /** Кровь: тёмный багрянец → алый (0xe0304a) → розовый блик. */
  blood: R("#2a0710", "#5a0f1e", "#9a1a2c", "#d22a40", "#ff6a7a", "#ffc8d0"),
  /** Лёд: синий → голубой (0x8ad0ff) → иней. */
  frost: R("#14305e", "#2a5aa8", "#4a90e0", "#86c8ff", "#c8ecff", "#ffffff"),
  /** Тьма: фиолетовый (0xa070ff) с чёрным дном. */
  shadow: R("#140a24", "#341058", "#5a24a0", "#8a4ee0", "#b890ff", "#e8dcff"),
  /** Чистая магия: сиреневый (0xc08aff). */
  arcane: R("#2a1660", "#5a34b0", "#8a5ce8", "#b890ff", "#e0c8ff", "#ffffff"),
  /** Свет: янтарь → золото → тёплый белый (0xfff0a0). */
  holy: R("#a8622a", "#d89030", "#f4c048", "#ffe27a", "#fff4b8", "#ffffff"),
  /** Яд: P.magic.green и лаймовый блик (0x9aff5a). */
  poison: R("#10340e", "#1e6a1a", "#3ea02a", "#7ad04a", "#b8f070", "#eaffc8"),
  /** Природа: листва и свежая трава. */
  nature: R("#1c3a1e", "#2e5a2c", "#4f873c", "#7cb04e", "#aadf6a", "#d8ffb0"),
  /** Сталь: холодные серые с белым бликом (физический урон). */
  steel: R("#2a2e3a", "#4f586a", "#8f99ad", "#c8d0de", "#f2f6ff", "#ffffff"),
  /** Молния: тёмно-синий → электрик (0xa8e8ff) → белая вспышка. */
  bolt: R("#10206a", "#2a56c8", "#58a8ff", "#a8e8ff", "#e0f8ff", "#ffffff"),
  /** Кость: P.bone. */
  bone: R("#3a3228", "#6a6258", "#9e968a", "#cfc8b8", "#f1ecdf", "#ffffff"),
};

function rampAt(r: Ramp, t: number): RGBA {
  const x = Math.max(0, Math.min(1, t)) * (r.length - 1), i = Math.min(r.length - 2, Math.floor(x));
  return mix(r[i], r[i + 1], x - i);
}

/** Градиентная карта: яркость цвета (нормированная по всем кадрам эффекта) → точка рампы. Альфа не трогается.
 *  gamma < 1 приподнимает середину (эффект светлее), > 1 — темнее. Палитра остаётся маленькой: сколько цветов было, столько и будет. */
export function gradientMap(frames: PC[], ramp: Ramp, gamma = 1): PC[] {
  let lo = 255, hi = 0;
  for (const f of frames) for (let i = 0; i < f.data.length; i += 4) if (f.data[i + 3]) { const L = luma(f.data[i], f.data[i + 1], f.data[i + 2]); if (L < lo) lo = L; if (L > hi) hi = L; }
  const span = Math.max(1, hi - lo);
  const cache = new Map<number, RGBA>();
  return frames.map((f) => {
    const o = f.clone();
    for (let i = 0; i < o.data.length; i += 4) {
      if (!o.data[i + 3]) continue;
      const key = (o.data[i] << 16) | (o.data[i + 1] << 8) | o.data[i + 2];
      let c = cache.get(key);
      if (!c) { c = rampAt(ramp, Math.pow((luma(o.data[i], o.data[i + 1], o.data[i + 2]) - lo) / span, gamma)); cache.set(key, c); }
      o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2];
    }
    return o;
  });
}

// ---------- превью ----------
/** Рамка и якорь кадра на раскадровке (рисуются поверх, чтобы видеть границы и точку привязки). */
const FRAME_BG: RGBA = [30, 26, 38, 255];
const FRAME_EDGE: RGBA = [64, 56, 80, 255];

/** Раскадровка одного эффекта: кадры в ряд ×k, подпись над рядом. Возвращает холст. */
export function storyboard(frames: PC[], w: number, h: number, anchor: [number, number], label: string, k = 2, markPeak = -1): PC {
  const pad = 2, lab = 9;
  const out = new PC(frames.length * (w * k + pad) + pad, h * k + lab + pad * 2);
  fill(out, BG);
  drawText(out, label, 2, 2, GOLD);
  frames.forEach((f, i) => {
    const x = pad + i * (w * k + pad), y = lab + pad;
    out.rect(x, y, w * k, h * k, FRAME_BG);
    out.blit(scaleNN(f, k), x, y);
    // рамка кадра
    for (let t = 0; t < w * k; t++) { out.set(x + t, y, FRAME_EDGE); out.set(x + t, y + h * k - 1, FRAME_EDGE); }
    for (let t = 0; t < h * k; t++) { out.set(x, y + t, FRAME_EDGE); out.set(x + w * k - 1, y + t, FRAME_EDGE); }
    // якорь — красная точка-крестик
    const ax = x + Math.round(anchor[0] * w * k), ay = y + Math.round(anchor[1] * h * k);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) out.set(ax + dx, ay + dy, [255, 64, 80, 255]);
    drawText(out, String(i + 1), x + 2, y + 2, i === markPeak ? [255, 220, 90, 255] : [150, 140, 160, 255]);
  });
  return out;
}

/** Вертикальная склейка холстов с одинаковым фоном. */
export function stackV(parts: PC[], gap = 3): PC {
  const W = Math.max(...parts.map((p) => p.w)), H = parts.reduce((s, p) => s + p.h + gap, gap);
  const out = new PC(W, H); fill(out, BG);
  let y = gap;
  for (const p of parts) { out.blit(p, 0, y); y += p.h + gap; }
  return out;
}

export { hex, mix, PC };
export type { RGBA, Ramp };
