/** Общие помощники для tools/gen/vendor.ts и vendor-ui.ts: чтение листов, вырезка, масштаб, земля из атласа, текст 3×5. */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, hex, type RGBA } from "./canvas";
import { TERRAIN_KEYS } from "../../shared/map";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** Перекрашенные спрайты: tools/out в .gitignore, раздавать их нельзя (лицензии Schwarnhild и Graveyard). */
export const OUT_DIR = path.join(ROOT, "tools/out/vendor");
export const PREVIEW_DIR = path.join(ROOT, "tools/out/vendor-preview");
/** Фон игры (--bg). */
export const BG = hex("#120f16");
export const BEIGE = hex("#efe6d2");
export const GOLD = hex("#d6a84b");

export function readPng(file: string): PC {
  const png = PNG.sync.read(fs.readFileSync(file));
  const pc = new PC(png.width, png.height);
  pc.data.set(png.data);
  return pc;
}

export function writePng(pc: PC, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  pc.save(file);
}

/** Вырезка прямоугольника листа. */
export function crop(src: PC, x: number, y: number, w: number, h: number): PC {
  const out = new PC(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!src.inside(x + i, y + j)) continue;
    const s = ((y + j) * src.w + x + i) * 4, d = (j * w + i) * 4;
    out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1]; out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = src.data[s + 3];
  }
  return out;
}

/** Рамка непрозрачных пикселей (альфа ≥ amin): [x, y, w, h] или null для пустого. */
export function opaqueBox(src: PC, amin = 1): [number, number, number, number] | null {
  let x0 = src.w, y0 = src.h, x1 = -1, y1 = -1;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    if (src.data[(y * src.w + x) * 4 + 3] < amin) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

export function trim(src: PC, amin = 1): { pc: PC; box: [number, number, number, number] } {
  const box = opaqueBox(src, amin) ?? [0, 0, 1, 1];
  return { pc: crop(src, box[0], box[1], box[2], box[3]), box };
}

/** Масштаб ближайшим соседом: размер пикселя остаётся целым. */
export function scaleNN(src: PC, k: number): PC {
  const out = new PC(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const s = (Math.floor(y / k) * src.w + Math.floor(x / k)) * 4, d = (y * out.w + x) * 4;
    out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1]; out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = src.data[s + 3];
  }
  return out;
}

/** Пиксель-арт-уменьшение без сглаживания. Каждому пикселю результата соответствует блок исходника (дробный, с весами перекрытия);
 *  берётся преобладающий цвет блока (ничья — в пользу центрального пикселя исходника). Пиксель непрозрачен, если закрашено не меньше cover
 *  площади блока. Цвета результата — только цвета исходника (палитра не размывается). */
export function downscaleMode(src: PC, w2: number, h2: number, cover = 0.5): PC {
  const out = new PC(w2, h2);
  const kx = src.w / w2, ky = src.h / h2;
  for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) {
    const x0 = i * kx, x1 = x0 + kx, y0 = j * ky, y1 = y0 + ky;
    const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
    const votes = new Map<number, number>();
    let solid = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      const wgt = (Math.min(x + 1, x1) - Math.max(x, x0)) * (Math.min(y + 1, y1) - Math.max(y, y0));
      const c = src.get(x, y);
      if (wgt <= 0 || !c || c[3] < 128) continue;
      solid += wgt;
      const key = (c[0] << 16) | (c[1] << 8) | c[2];
      votes.set(key, (votes.get(key) ?? 0) + wgt + (x === cx && y === cy ? 0.05 : 0));
    }
    if (solid < cover * kx * ky) continue;
    let best = 0, bv = -1;
    for (const [k, v] of votes) if (v > bv) { bv = v; best = k; }
    out.set(i, j, [best >> 16, (best >> 8) & 255, best & 255, 255]);
  }
  return out;
}

/** Чистка после уменьшения: срезает выступы силуэта в один пиксель, заполняет дырки в один пиксель и перекрашивает пиксель,
 *  у которого нет ни одного соседа своего цвета, если по 8 соседям явно преобладает другой цвет (≥5 из 8). */
export function tidy(src: PC, passes = 2): PC {
  let cur = src.clone();
  const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const N8: [number, number][] = [...N4, [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const key = (c: RGBA) => (c[0] << 16) | (c[1] << 8) | c[2];
  for (let p = 0; p < passes; p++) {
    const next = cur.clone();
    for (let y = 0; y < cur.h; y++) for (let x = 0; x < cur.w; x++) {
      const solid = cur.alpha(x, y) > 0;
      let n4 = 0;
      for (const [dx, dy] of N4) if (cur.alpha(x + dx, y + dy) > 0) n4++;
      if (solid && n4 <= 1) { next.clear(x, y); continue; }
      const around = new Map<number, number>();
      const col = new Map<number, RGBA>();
      let same4 = 0;
      const mine = solid ? key(cur.get(x, y)!) : -1;
      for (const [dx, dy] of N8) {
        const q = cur.get(x + dx, y + dy);
        if (!q || !q[3]) continue;
        const k = key(q);
        around.set(k, (around.get(k) ?? 0) + 1);
        col.set(k, q);
      }
      for (const [dx, dy] of N4) { const q = cur.get(x + dx, y + dy); if (q && q[3] && key(q) === mine) same4++; }
      let best = -1, bv = 0;
      for (const [k, v] of around) if (v > bv || (v === bv && luma(col.get(k)![0], col.get(k)![1], col.get(k)![2]) < luma(col.get(best)![0], col.get(best)![1], col.get(best)![2]))) { bv = v; best = k; }
      if (!solid && n4 >= 3 && best >= 0) next.set(x, y, [col.get(best)![0], col.get(best)![1], col.get(best)![2], 255]);
      else if (solid && same4 === 0 && best >= 0 && best !== mine && bv >= 5) next.set(x, y, [col.get(best)![0], col.get(best)![1], col.get(best)![2], 255]);
    }
    cur = next;
  }
  return cur;
}

export function fill(pc: PC, c: RGBA) {
  for (let i = 0; i < pc.data.length; i += 4) { pc.data[i] = c[0]; pc.data[i + 1] = c[1]; pc.data[i + 2] = c[2]; pc.data[i + 3] = c[3]; }
}

export const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
export function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

// ---------- земля из нашего тайлового атласа (client/public/assets/tiles/terrain.png) ----------
let atlas: PC | null = null;
/** Тайл 32×32 поверхности: центральный (маска 15) в колонке 14, варианты 1–3 в колонках 15–17. */
export function groundTile(name: string, variant = 0): PC {
  atlas ??= readPng(path.join(ROOT, "client/public/assets/tiles/terrain.png"));
  const row = TERRAIN_KEYS.indexOf(name);
  if (row < 0) throw new Error(`нет поверхности ${name}`);
  return crop(atlas, (14 + variant) * 32, (row + 0) * 32, 32, 32);
}
/** Заливка прямоугольника нашей землёй: варианты тайлов по детерминированному хешу. */
export function paintGround(dst: PC, x: number, y: number, w: number, h: number, name = "grass") {
  const tiles = [0, 1, 2, 3].map((v) => groundTile(name, v));
  for (let ty = 0; ty < Math.ceil(h / 32); ty++) for (let tx = 0; tx < Math.ceil(w / 32); tx++) {
    const hsh = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const v = hsh % 7 < 4 ? 0 : 1 + (hsh % 3); // чаще чистый тайл, реже вариант
    const t = tiles[v];
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const X = x + tx * 32 + i, Y = y + ty * 32 + j;
      if (X >= x + w || Y >= y + h || !dst.inside(X, Y)) continue;
      const s = (j * 32 + i) * 4, d = (Y * dst.w + X) * 4;
      dst.data[d] = t.data[s]; dst.data[d + 1] = t.data[s + 1]; dst.data[d + 2] = t.data[s + 2]; dst.data[d + 3] = 255;
    }
  }
}

// ---------- мелкий шрифт 3×5 для подписей ----------
const GLYPHS: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111",
  "0": "111101101101111", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110", "4": "101101111001001",
  "5": "111100110001110", "6": "011100110101010", "7": "111001010010010", "8": "010101010101010", "9": "010101011001110",
  _: "000000000000111", "-": "000000111000000", ".": "000000000000010", ":": "000010000010000", "/": "001001010100100",
  "|": "010010010010010", ">": "100010001010100", "+": "000010111010000", " ": "000000000000000", "(": "001010010010001", ")": "100010010010100",
  x: "000101010101000", "=": "000111000111000", "×": "000101010101000",
};
export const textWidth = (s: string, k = 1) => (s.length * 4 - 1) * k;
/** Надпись шрифтом 3×5 (верхний левый угол x, y); k — размер пикселя шрифта. */
export function drawText(dst: PC, text: string, x: number, y: number, color: RGBA, k = 1) {
  let cx = x;
  for (const chRaw of text) {
    const ch = GLYPHS[chRaw] ? chRaw : chRaw.toUpperCase();
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === "1") for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) dst.set(cx + c * k + i, y + r * k + j, color);
    cx += 4 * k;
  }
}
/** Подпись на тёмной плашке (читается на траве). */
export function chipText(dst: PC, text: string, x: number, y: number, color: RGBA = BEIGE) {
  dst.rect(x - 1, y - 1, textWidth(text) + 2, 7, [18, 15, 22, 235]);
  drawText(dst, text, x, y, color);
}
