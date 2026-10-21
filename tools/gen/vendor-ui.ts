/** Интерфейс из сторонних паков (CC0, раздавать можно): рамки Kenney Fantasy UI Borders и курсоры Kenney Cursor Pixel Pack.
 *  Вход: vendor/kenney-borders/src, vendor/kenney-cursors/src. Выход: tools/out/vendor/ui, tools/out/vendor/cursors, tools/out/vendor-preview.
 *  Цвета берутся из shared/palette.ts (--gold, --line-hi, --fg, --dim, --panel) и canvas.ts (OUTLINE), своих не добавляется.
 *
 *  Рамки. В паке они белые, 1 бит: штрих 2 px (папка Default) — это уже «×2» от сетки 24×24 единицы; папка Double — ещё ×2 (штрих 4 px).
 *  Фаска из двух тонов: верхний и левый край штриха — --gold, нижний и правый — --line-hi (свет слева сверху, как у наших объектов).
 *  Заливка берётся из варианта Panel того же номера (форма с вырезанными углами) и красится в --panel, поэтому PNG годится
 *  для border-image с ключевым словом fill: фон под рамкой повторяет её контур, углы не торчат квадратом.
 *  Разделитель заголовка режется на растягиваемую линию и правое украшение (cap): в CSS это два слоя фона у h2. */
import fs from "node:fs";
import path from "node:path";
import { PC, OUTLINE, hex, type RGBA } from "./canvas";
import { P as UI } from "../../shared/palette";
import { ROOT, OUT_DIR, PREVIEW_DIR, BG, BEIGE, readPng, writePng, crop, scaleNN, fill, drawText, chipText, textWidth, paintGround } from "./vendor-lib";

const KB = path.join(ROOT, "vendor/kenney-borders/src/PNG/Default");
const KC = path.join(ROOT, "vendor/kenney-cursors/src/Tilemap/tilemap_packed.png");
const UI_DIR = path.join(OUT_DIR, "ui");
/** В игру (CC0, раздавать можно): рамка и разделитель окон, золотые курсоры. */
const GAME_UI = path.join(ROOT, "client/public/ui");
const CUR_DIR = path.join(OUT_DIR, "cursors");

const css = (s: string): RGBA => {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return hex(s);
  const [r, g, b, a = "1"] = m[1].split(",").map((v) => v.trim());
  return [+r, +g, +b, Math.round(+a * 255)];
};
const C_GOLD = hex(UI.gold), C_SHADE = hex(UI.lineHi), C_PANEL = css(UI.panel), C_FG = hex(UI.fg), C_DIM = hex(UI.dim), C_LINE = hex(UI.line);
const C_WELL = hex(UI.well);

/** Выбор для демо: номера рамок и разделителей из каталога (ui-catalog.png). Ключ a/b/c — имя файла frame-<ключ>.png. */
const PICKS: { key: string; name: string; frame: number; divider: number }[] = [
  { key: "a", name: "A: тихая", frame: 1, divider: 2 },
  { key: "b", name: "B: угловые скобки", frame: 11, divider: 0 },
  { key: "c", name: "C: двойная", frame: 3, divider: 4 },
];

// ---------- рамки ----------
/** Фаска из двух тонов по соседям: нижний/правый край штриха — тень, остальное — свет. */
function bevel(src: PC, light: RGBA, shade: RGBA): PC {
  const out = new PC(src.w, src.h);
  const solid = (x: number, y: number) => src.alpha(x, y) > 0;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const a = src.alpha(x, y);
    if (!a) continue;
    const sh = !solid(x, y + 1) || !solid(x + 1, y), li = !solid(x, y - 1) || !solid(x - 1, y);
    const c = sh && !li ? shade : light;
    const i = (y * src.w + x) * 4;
    out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = a;
  }
  return out;
}
const num3 = (i: number) => String(i).padStart(3, "0");
/** Наименьший размер угла (px картинки), после которого середина рамки однородна: это slice для border-image. */
function sliceOf(p: PC): number {
  const a = (x: number, y: number) => (p.alpha(x, y) > 0 ? 1 : 0);
  for (let s = 2; s <= p.w / 2 - 2; s += 2) {
    let ok = true;
    for (let x = s; x <= p.w - 1 - s && ok; x++) for (let y = 0; y < p.h; y++) if (a(x, y) !== a(s, y)) { ok = false; break; }
    for (let y = s; y <= p.h - 1 - s && ok; y++) for (let x = 0; x < p.w; x++) if (a(x, y) !== a(x, s)) { ok = false; break; }
    if (ok) return s;
  }
  return p.w / 2 - 2;
}
/** Прозрачные пиксели, до которых можно дойти от края картинки, не пересекая штрих: «снаружи» рамки. */
function outsideOf(stroke: PC): Uint8Array {
  const { w, h } = stroke, out = new Uint8Array(w * h), st: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h || out[y * w + x] || stroke.alpha(x, y) > 0) return;
    out[y * w + x] = 1; st.push(x, y);
  };
  for (let i = 0; i < w; i++) { push(i, 0); push(i, h - 1); }
  for (let i = 0; i < h; i++) { push(0, i); push(w - 1, i); }
  while (st.length) { const y = st.pop()!, x = st.pop()!; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  return out;
}
interface Frame { n: number; line: PC; filled: PC; slice: number }
function frame(n: number): Frame {
  const stroke = readPng(path.join(KB, "Border", `panel-border-${num3(n)}.png`));
  const panel = readPng(path.join(KB, "Panel", `panel-${num3(n)}.png`));
  const line = bevel(stroke, C_GOLD, C_SHADE);
  const filled = new PC(panel.w, panel.h);
  // заливка: форма Panel плюс всё, что замкнуто внешним штрихом (зазор между двойными рейками, дырки угловых накладок)
  const outside = outsideOf(stroke);
  for (let y = 0; y < panel.h; y++) for (let x = 0; x < panel.w; x++) if (panel.alpha(x, y) > 0 || !outside[y * panel.w + x]) filled.set(x, y, C_PANEL);
  filled.blit(line, 0, 0);
  // угол берём по большему из штриха и заливки: вырез заливки (Panel) бывает шире угловой накладки штриха
  return { n, line, filled, slice: Math.max(sliceOf(stroke), sliceOf(panel)) };
}

// ---------- разделители заголовков ----------
interface Divider { n: number; plain: PC; fade: PC; /** ширина украшения справа */ cap: number }
function divider(n: number): Divider {
  const plainSrc = readPng(path.join(KB, "Divider", `divider-${num3(n)}.png`));
  const fadeSrc = readPng(path.join(KB, "Divider Fade", `divider-fade-${num3(n)}.png`));
  // начало украшения справа: первая колонка, чья форма отличается от самой левой
  const col = (p: PC, x: number) => Array.from({ length: p.h }, (_, y) => (p.alpha(x, y) > 0 ? 1 : 0)).join("");
  let c0 = plainSrc.w - 1;
  for (let x = 1; x < plainSrc.w; x++) if (col(plainSrc, x) !== col(plainSrc, 0)) { c0 = x; break; }
  return { n, plain: bevel(plainSrc, C_GOLD, C_SHADE), fade: bevel(fadeSrc, C_GOLD, C_SHADE), cap: plainSrc.w - c0 };
}
const lineOf = (d: PC, cap: number) => crop(d, 0, 0, d.w - cap, d.h);
const capOf = (d: PC, cap: number) => crop(d, d.w - cap, 0, cap, d.h);

// ---------- 9-slice как у border-image ----------
function nineSlice(img: PC, slice: number, w: number, h: number): PC {
  const out = new PC(w, h);
  const map = (v: number, size: number, src: number) => {
    if (v < slice) return v;
    if (v >= size - slice) return src - (size - v);
    return slice + Math.floor(((v - slice) * (src - 2 * slice)) / Math.max(1, size - 2 * slice));
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = img.get(map(x, w, img.w), map(y, h, img.h));
    if (c && c[3]) out.set(x, y, c);
  }
  return out;
}

/** Макет окна для превью: рамка, заголовок, кнопка закрытия, разделитель, три строки списка и кнопки. Размеры в CSS px (1×). */
function mockWindow(f: Frame, d: Divider, title: string, w = 300, h = 214): PC {
  const win = nineSlice(f.filled, f.slice, w, h);
  const pad = Math.max(2, 14 - f.slice), ins = f.slice + pad;
  const dv = d.plain, lineW = w - 2 * ins - d.cap;
  // заголовок и кнопка закрытия (как .x: 28×28, рамка --line-hi)
  drawText(win, title, ins, ins + 3, C_GOLD, 3);
  win.rect(w - ins - 28, ins - 2, 28, 28, [42, 33, 48, 255]);
  win.rect(w - ins - 28, ins - 2, 28, 1, C_SHADE); win.rect(w - ins - 28, ins + 25, 28, 1, C_SHADE);
  win.rect(w - ins - 28, ins - 2, 1, 28, C_SHADE); win.rect(w - ins - 1, ins - 2, 1, 28, C_SHADE);
  drawText(win, "X", w - ins - 28 + 9, ins + 3, C_DIM, 3);
  // разделитель под заголовком: растянутая линия + украшение справа
  const dy = ins + 30;
  for (let y = 0; y < dv.h; y++) for (let x = 0; x < lineW; x++) {
    const c = dv.get(Math.min(dv.w - d.cap - 1, Math.floor((x * (dv.w - d.cap)) / lineW)), y);
    if (c && c[3]) win.set(ins + x, dy + y, c);
  }
  win.blit(capOf(dv, d.cap), ins + lineW, dy);
  // список
  let y = dy + dv.h + 6;
  win.rect(ins, y, w - 2 * ins, 3 * 30 + 2, C_WELL);
  const rows: [string, string][] = [["RUSTY SWORD", "LV 3"], ["LEATHER CAP", "LV 5"], ["HEALTH POTION", "X12"]];
  rows.forEach(([a, b], i) => {
    const ry = y + 1 + i * 30;
    if (i) win.rect(ins + 1, ry, w - 2 * ins - 2, 1, C_LINE);
    drawText(win, a, ins + 8, ry + 9, C_FG, 2);
    drawText(win, b, w - ins - 8 - textWidth(b, 2), ry + 9, C_DIM, 2);
  });
  y += 3 * 30 + 10;
  // кнопки: .btn.primary и .btn
  const by = Math.min(h - ins - 28, y);
  win.rect(ins, by, 84, 28, [94, 58, 22, 255]); win.rect(ins, by, 84, 1, C_GOLD); win.rect(ins, by + 27, 84, 1, C_GOLD);
  win.rect(ins, by, 1, 28, C_GOLD); win.rect(ins + 83, by, 1, 28, C_GOLD);
  drawText(win, "OK", ins + 84 / 2 - 8, by + 7, C_FG, 3);
  win.rect(ins + 92, by, 84, 28, [42, 33, 48, 255]);
  win.rect(ins + 92, by, 84, 1, C_SHADE); win.rect(ins + 92, by + 27, 84, 1, C_SHADE); win.rect(ins + 92, by, 1, 28, C_SHADE); win.rect(ins + 175, by, 1, 28, C_SHADE);
  drawText(win, "NO", ins + 92 + 84 / 2 - 8, by + 7, C_FG, 3);
  return win;
}

// ---------- каталог всех рамок и разделителей ----------
function catalog(frames: Frame[], dividers: Divider[]): PC {
  const CELL = 58, cols = 8;
  const rows = Math.ceil(frames.length / cols);
  const W = cols * CELL + 16, H = rows * (CELL + 12) + 14 + dividers.length * 34 + 30;
  const sheet = new PC(W, H);
  fill(sheet, BG);
  drawText(sheet, "KENNEY FANTASY UI BORDERS - RECOLORED GOLD / LINE-HI (1 PX = 2 SCREEN PX)", 8, 5, C_GOLD);
  const picked = new Set(PICKS.map((p) => p.frame));
  frames.forEach((f, i) => {
    const x = 8 + (i % cols) * CELL, y = 16 + Math.floor(i / cols) * (CELL + 12);
    sheet.blit(f.filled, x + 5, y);
    chipText(sheet, `${f.n}  S${f.slice}`, x + 5, y + 50, picked.has(f.n) ? BEIGE : C_DIM);
  });
  const y0 = 16 + rows * (CELL + 12) + 4;
  drawText(sheet, "DIVIDERS (PLAIN | FADE), CAP WIDTH IN PX", 8, y0 - 8, C_GOLD);
  const pickedD = new Set(PICKS.map((p) => p.divider));
  dividers.forEach((d, i) => {
    const y = y0 + i * 34;
    sheet.blit(d.plain, 8, y);
    sheet.blit(d.fade, 8 + 110, y);
    chipText(sheet, `${d.n}  CAP ${d.cap}`, 8 + 220, y + 6, pickedD.has(d.n) ? BEIGE : C_DIM);
  });
  return scaleNN(sheet, 2);
}

// ---------- курсоры ----------
interface CursorDef { id: string; tile: [number, number]; hot: "tl" | "top" | "center"; what: string }
const CURSORS: CursorDef[] = [
  { id: "arrow", tile: [6, 1], hot: "tl", what: "обычный" },
  { id: "talk", tile: [14, 6], hot: "top", what: "поговорить (рука)" },
  { id: "take", tile: [15, 6], hot: "center", what: "взять (перчатка)" },
  { id: "attack", tile: [6, 5], hot: "tl", what: "атаковать (меч)" },
  { id: "wait", tile: [10, 0], hot: "center", what: "ожидание (песочные часы)" },
  { id: "aim", tile: [15, 2], hot: "center", what: "прицел: выбрать точку (кольцо с засечками)" },
  { id: "text", tile: [0, 7], hot: "center", what: "ввод текста" },
  { id: "grabbing", tile: [16, 6], hot: "center", what: "тащить (сжатая рука)" },
];
const mixC = (a: RGBA, b: RGBA, t: number): RGBA => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)).concat(255) as RGBA;
/** Scale2x по меткам пикселей (0 — пусто, 1 — контур, 2 — заливка, 3 — штриховка): диагонали ступенькой в 1 px, а не в 2, как при простом удвоении. */
function scale2xLabels(l: Uint8Array, w: number, h: number): Uint8Array {
  const W = w * 2, o = new Uint8Array(W * h * 2), at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : l[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y), a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
    o[2 * y * W + 2 * x] = c === a && c !== d && a !== b ? a : p;
    o[2 * y * W + 2 * x + 1] = a === b && a !== c && b !== d ? b : p;
    o[(2 * y + 1) * W + 2 * x] = d === c && d !== b && c !== a ? c : p;
    o[(2 * y + 1) * W + 2 * x + 1] = b === d && b !== a && d !== c ? d : p;
  }
  return o;
}
/**
 * Курсор 32 px из клетки пака 16 px (выбор пользователя 2026-10-21: прежние, удвоенные, были толстыми и грубыми). Увеличение — Scale2x.
 * Контур пака после увеличения шириной 2 px: внешний пиксель снимается (фигура тоньше на пиксель с каждой стороны), внутренний остаётся
 * контуром в 1 px — не чёрным, а тёмной бронзой: светлее на верхней и левой кромке, темнее на нижней и правой. Заливка — цвет варианта
 * в 3 тона: блик у верхней и левой кромки, тень у нижней и правой; штриховка пака — тон detail.
 */
function recolorCursor(src: PC, fillC: RGBA, detail: RGBA): PC {
  const sw = src.w, sh = src.h, lab = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const c = src.get(x, y)!; lab[y * sw + x] = !c[3] ? 0 : c[0] > 230 ? 2 : c[0] > 100 ? 3 : 1; }
  const w = sw * 2, h = sh * 2, l = scale2xLabels(lab, sw, sh), out = new PC(w, h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : l[y * w + x]);
  const cream = hex(UI.fg), bronze = hex(UI.lineHi);
  const T = {
    lineLit: mixC(bronze, OUTLINE, 0.45), lineDark: mixC(bronze, OUTLINE, 0.72), lineIn: mixC(bronze, OUTLINE, 0.6),
    spec: mixC(fillC, cream, 0.85), light: mixC(fillC, cream, 0.5), base: fillC, shade: mixC(fillC, bronze, 0.55), detail,
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = at(x, y);
    if (!v) continue;
    const up = at(x, y - 1), left = at(x - 1, y), right = at(x + 1, y), down = at(x, y + 1);
    if (v === 1) {
      if (!up || !left || !right || !down) continue; // внешний пиксель двойного контура
      // внутренний — контур 1 px: смотрит наружу вверх или влево — светлее, вниз или вправо — темнее, линии внутри фигуры — средний тон
      const outUL = !at(x, y - 2) || !at(x - 2, y), outDR = !at(x, y + 2) || !at(x + 2, y);
      out.set(x, y, outDR ? T.lineDark : outUL ? T.lineLit : T.lineIn);
      continue;
    }
    if (v === 3) { out.set(x, y, T.detail); continue; }
    const edge = (q: number) => q <= 1, topLeft = edge(up) || edge(left), botRight = edge(down) || edge(right);
    const near = edge(at(x - 1, y - 1)) || edge(at(x, y - 2)) || edge(at(x - 2, y));
    out.set(x, y, topLeft && !botRight ? T.spec : near && !botRight ? T.light : botRight && !topLeft ? T.shade : T.base);
  }
  return out;
}
function hotspot(c: PC, mode: CursorDef["hot"]): [number, number] {
  if (mode === "center") return [c.w / 2, c.h / 2];
  if (mode === "tl") {
    let best: [number, number] = [0, 0], bv = Infinity;
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.alpha(x, y) && x + y < bv) { bv = x + y; best = [x, y]; }
    return best;
  }
  for (let y = 0; y < c.h; y++) {
    const xs = Array.from({ length: c.w }, (_, x) => x).filter((x) => c.alpha(x, y));
    if (xs.length) return [xs[Math.floor(xs.length / 2)], y];
  }
  return [0, 0];
}
function cursors(): PC {
  const tiles = readPng(KC);
  const variants: [string, RGBA, RGBA][] = [["beige", C_FG, C_DIM], ["gold", C_GOLD, C_SHADE]];
  const made: Record<string, Record<string, PC>> = {};
  const hot: Record<string, [number, number]> = {};
  for (const [vn, fc, dc] of variants) {
    made[vn] = {};
    for (const d of CURSORS) {
      const c = recolorCursor(crop(tiles, d.tile[0] * 16, d.tile[1] * 16, 16, 16), fc, dc);
      made[vn][d.id] = c;
      writePng(c, path.join(CUR_DIR, vn, `cursor_${d.id}.png`));
      if (vn === "gold") writePng(c, path.join(GAME_UI, "cursors", `cursor_${d.id}.png`)); // курсоры игры — золотые
      hot[d.id] = hotspot(c, d.hot);
    }
  }
  const lines = CURSORS.map((d) => `/* ${d.what} */\n.cur-${d.id} { cursor: url("cursor_${d.id}.png") ${hot[d.id][0]} ${hot[d.id][1]}, auto; }`);
  fs.writeFileSync(path.join(CUR_DIR, "cursors.css"), `/* Курсоры 32×32 (×2 от 16 px пака). Точка нажатия — в пикселях картинки. Варианты: beige/ и gold/. */\n${lines.join("\n")}\n`);
  // лист: 4 строки (бежевый и золотой, на тёмном и на траве), крупно ×2 и 1:1 рядом
  const cell = 64 + 40, rowH = 64 + 22;
  const sheet = new PC(CURSORS.length * cell + 16, 22 + rowH * 4);
  fill(sheet, BG);
  drawText(sheet, "KENNEY CURSOR PIXEL PACK - 32 PX (X2 OF 16 PX), OUTLINE #1B1422", 8, 6, C_GOLD);
  let y = 20;
  for (const ground of ["dark", "grass"]) for (const [vn] of variants) {
    if (ground === "grass") paintGround(sheet, 0, y - 2, sheet.w, rowH);
    chipText(sheet, `${vn.toUpperCase()} ON ${ground.toUpperCase()}`, 8, y, ground === "grass" ? BEIGE : C_DIM);
    CURSORS.forEach((d, i) => {
      const x = 8 + i * cell, c = made[vn][d.id];
      sheet.blit(scaleNN(c, 2), x, y + 10);
      sheet.blit(c, x + 68, y + 10 + 32);
      if (vn === "beige" && ground === "dark") chipText(sheet, d.id, x, y + 10 + 66, BEIGE);
    });
    y += rowH;
  }
  return scaleNN(sheet, 2);
}

// ---------- демо-страница с border-image ----------
const px = (n: number) => `${n}px`;
function demoHtml(picks: { p: (typeof PICKS)[number]; f: Frame; d: Divider }[]): string {
  const font = fs.readFileSync(path.join(ROOT, "client/src/fonts/ark-pixel-10px.woff2")).toString("base64");
  const frameCss = picks.map(({ p, f, d }) => {
    const s = f.slice, pad = Math.max(2, 14 - s), dh = d.plain.h, cw = d.cap;
    return `
/* ${p.name}: рамка ${f.n} (угол ${s} px), разделитель ${d.n} (высота ${dh} px, украшение ${cw} px) */
.panel.fx-${p.key} { border: ${px(s)} solid transparent; border-image: url("../vendor/ui/frame-${p.key}.png") ${s} fill / ${px(s)} stretch; padding: ${px(pad)}; }
.panel.fx2-${p.key} { border: ${px(s * 2)} solid transparent; border-image: url("../vendor/ui/frame-${p.key}@2x.png") ${s * 2} fill / ${px(s * 2)} stretch; padding: ${px(Math.max(0, pad - s))}; }
.win.dv-${p.key} > h2 {
  border-bottom: 0; padding-bottom: ${px(dh + 6)};
  background: url("../vendor/ui/divider-${p.key}-cap.png") right bottom / ${px(cw)} ${px(dh)} no-repeat, url("../vendor/ui/divider-${p.key}-line.png") left bottom / calc(100% - ${px(cw)}) ${px(dh)} no-repeat;
}
.win.dv2-${p.key} > h2 {
  border-bottom: 0; padding-bottom: ${px(dh * 2 + 8)};
  background: url("../vendor/ui/divider-${p.key}-cap@2x.png") right bottom / ${px(cw * 2)} ${px(dh * 2)} no-repeat, url("../vendor/ui/divider-${p.key}-line@2x.png") left bottom / calc(100% - ${px(cw * 2)}) ${px(dh * 2)} no-repeat;
}`;
  }).join("\n");
  const win = (cls: string, title: string) => `
    <div class="panel win s ${cls}">
      <h2><span>${title}</span><button class="x" type="button" aria-label="Закрыть">×</button></h2>
      <div class="body">
        <div class="sec flat">
          <div class="sec-head"><h3 class="sec-h">Экипировка</h3><span class="sec-aside">3 / 24</span></div>
          <ul class="list boxed">
            <li class="row"><span class="row-main"><span class="row-title">Ржавый меч <span class="meta">ур. 3</span></span><span class="row-sub">Урон 12–18</span></span><span class="row-end"><button class="btn small" type="button">Надеть</button></span></li>
            <li class="row" aria-selected="true"><span class="row-main"><span class="row-title">Кожаный шлем <span class="meta">ур. 5</span></span><span class="row-sub">Броня 4</span></span><span class="row-end"><button class="btn small" type="button">Снять</button></span></li>
            <li class="row"><span class="row-main"><span class="row-title">Зелье здоровья</span><span class="row-sub">Лечит 120 HP</span></span><span class="row-end"><span class="meta">×12</span></span></li>
          </ul>
        </div>
        <div style="display:flex;gap:8px"><button class="btn primary" type="button">Принять</button><button class="btn" type="button">Отмена</button></div>
      </div>
    </div>`;
  const cell = (cap: string, cls: string, title: string) => `<figure><figcaption>${cap}</figcaption>${win(cls, title)}</figure>`;
  const ones = [cell("Сейчас (kit.css, border 2px)", "", "Инвентарь"), ...picks.map(({ p, f }) => cell(`${p.name}, ×1 (рамка ${f.n})`, `fx-${p.key} dv-${p.key}`, "Инвентарь"))].join("\n");
  const twos = picks.map(({ p, f }) => cell(`${p.name}, ×2 (рамка ${f.n}, штрих 4 px)`, `fx2-${p.key} dv2-${p.key}`, "Инвентарь")).join("\n");
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Рамки Kenney в нашем золоте: демо окна</title>
<!-- Настоящие стили проекта (только чтение): окно .panel.win > h2 + .body и компоненты из kit.css. В client/src ничего не подключено. -->
<link rel="stylesheet" href="../../../client/src/styles/tokens.css">
<link rel="stylesheet" href="../../../client/src/styles/fonts.css">
<link rel="stylesheet" href="../../../client/src/styles/base.css">
<link rel="stylesheet" href="../../../client/src/styles/kit.css">
<style>
/* шрифт заголовков вшит: из file:// браузеры не всегда грузят woff2 из соседних папок */
@font-face { font-family: "Ark Pixel 10"; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; font-style: normal; font-display: block; }
html, body { height: auto; overflow: auto; }
body { padding: 20px 24px 48px; }
h1 { margin: 0 0 6px; font-family: var(--font-head); font-size: 20px; font-weight: 400; color: var(--gold); }
.note { max-width: 880px; margin: 0 0 18px; color: var(--dim); font-size: var(--fs-sm); line-height: 1.5; }
.note code { color: var(--fg); }
.stage { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; margin: 0 0 22px; padding: 26px; border: 1px solid var(--line); }
.stage.grass { background: url("../vendor/ui/grass.png"); image-rendering: pixelated; }
.stage.dark { background: var(--bg); image-rendering: pixelated; }
figure { margin: 0; display: flex; flex-direction: column; gap: 8px; }
figcaption { padding: 2px 6px; background: #120f16e6; color: var(--dim); font-size: var(--fs-xs); align-self: flex-start; }
/* окна из kit.css позиционируются абсолютно (их двигает мышь): в демо кладём в поток */
.stage .win { position: relative; max-height: none; }
.stage .win > h2 { font-size: 20px; cursor: default; }
/* рамка из PNG: заливка и контур внутри картинки (border-image-slice … fill), у панели убираем свои border-radius, тень и фон */
.panel[class*="fx"] { border-radius: 0; box-shadow: none; background: none; image-rendering: pixelated; }
.win[class*="dv"] > h2 { image-rendering: auto; }
${frameCss}
</style>
</head>
<body>
<h1>Рамки Kenney Fantasy UI Borders в нашем золоте</h1>
<p class="note">Шаг 1 из 2, на утверждение. Окна — настоящая разметка проекта (<code>.panel.win &gt; h2 + .body</code> из <code>client/src/styles/kit.css</code>), рамка — <code>border-image</code> с PNG из <code>tools/out/vendor/ui/</code>.
Цвета: штрих <code>--gold #d6a84b</code>, тень (нижний и правый край штриха) <code>--line-hi #8a6a4a</code>, заливка <code>--panel</code>. Лицензия пака CC0 (Kenney), PNG можно класть в репозиторий.
«×1» — штрих 2 px, как у нынешней рамки окна; «×2» — штрих 4 px (то же в два раза крупнее, как и пиксель шрифта заголовков Ark Pixel 10px).
Заголовок: линия растягивается, украшение остаётся справа у кнопки закрытия.</p>
<section class="stage grass">
${ones}
</section>
<section class="stage dark">
${twos}
</section>
</body>
</html>
`;
}

export function buildVendorUi() {
  if (!fs.existsSync(KB) || !fs.existsSync(KC)) {
    console.log("[vendor] нет vendor/kenney-borders или vendor/kenney-cursors: интерфейс пропущен (архивы — в vendor/<пак>/LICENSE.txt)");
    return;
  }
  fs.rmSync(UI_DIR, { recursive: true, force: true });
  fs.rmSync(CUR_DIR, { recursive: true, force: true });
  const frames = Array.from({ length: 32 }, (_, i) => frame(i));
  const dividers = Array.from({ length: 6 }, (_, i) => divider(i));
  writePng(catalog(frames, dividers), path.join(PREVIEW_DIR, "ui-catalog.png"));
  // все рамки и разделители: 1× (штрих 2 px) и @2x
  for (const f of frames) {
    writePng(f.filled, path.join(UI_DIR, "all", `frame-${num3(f.n)}.png`));
    writePng(f.line, path.join(UI_DIR, "all", `frame-${num3(f.n)}-line.png`));
  }
  fs.writeFileSync(path.join(UI_DIR, "all", "slices.json"), JSON.stringify(Object.fromEntries(frames.map((f) => [num3(f.n), { slice: f.slice, slice2x: f.slice * 2 }]))));
  for (const d of dividers) {
    writePng(d.plain, path.join(UI_DIR, "all", `divider-${num3(d.n)}.png`));
    writePng(d.fade, path.join(UI_DIR, "all", `divider-fade-${num3(d.n)}.png`));
  }
  // выбранные: для border-image и фона заголовка
  const picks = PICKS.map((p) => ({ p, f: frames[p.frame], d: dividers[p.divider] }));
  for (const { p, f, d } of picks) {
    writePng(f.filled, path.join(UI_DIR, `frame-${p.key}.png`));
    writePng(scaleNN(f.filled, 2), path.join(UI_DIR, `frame-${p.key}@2x.png`));
    writePng(lineOf(d.plain, d.cap), path.join(UI_DIR, `divider-${p.key}-line.png`));
    writePng(capOf(d.plain, d.cap), path.join(UI_DIR, `divider-${p.key}-cap.png`));
    writePng(scaleNN(lineOf(d.plain, d.cap), 2), path.join(UI_DIR, `divider-${p.key}-line@2x.png`));
    writePng(scaleNN(capOf(d.plain, d.cap), 2), path.join(UI_DIR, `divider-${p.key}-cap@2x.png`));
    writePng(lineOf(d.fade, d.cap), path.join(UI_DIR, `divider-${p.key}-line-fade.png`));
  }
  fs.writeFileSync(path.join(UI_DIR, "frames.json"), JSON.stringify(picks.map(({ p, f, d }) => ({
    key: p.key, name: p.name, frame: f.n, size: [f.filled.w, f.filled.h], slice: f.slice, slice2x: f.slice * 2, divider: d.n, dividerSize: [d.plain.w, d.plain.h], dividerCap: d.cap,
  })), null, 1));
  // в игру (client/public/ui): вариант B — рамка 11 и разделитель 0. Рамка — только штрихи (заливку даёт CSS-фон окна), ×1 (штрих 2 px,
  // это уже «×2» к сетке пака) и @2x; разделитель — растягиваемая линия и украшение справа. Размеры — токены --frame-w, --frame-slice, --div-h, --div-cap.
  const fb = frames[11], db = dividers[0];
  fs.mkdirSync(GAME_UI, { recursive: true });
  for (const f of fs.readdirSync(GAME_UI)) if (f.endsWith(".png")) fs.unlinkSync(path.join(GAME_UI, f));
  writePng(fb.line, path.join(GAME_UI, "frame-b.png"));
  writePng(scaleNN(fb.line, 2), path.join(GAME_UI, "frame-b@2x.png"));
  writePng(lineOf(db.plain, db.cap), path.join(GAME_UI, "divider-b-line.png"));
  writePng(capOf(db.plain, db.cap), path.join(GAME_UI, "divider-b-cap.png"));
  writePng(scaleNN(lineOf(db.plain, db.cap), 2), path.join(GAME_UI, "divider-b-line@2x.png"));
  writePng(scaleNN(capOf(db.plain, db.cap), 2), path.join(GAME_UI, "divider-b-cap@2x.png"));
  console.log(`[vendor] client/public/ui: рамка B ${fb.filled.w}×${fb.filled.h}, угол ${fb.slice} px; разделитель ${db.plain.w}×${db.plain.h}, украшение ${db.cap} px`);
  const grass = new PC(64, 64);
  paintGround(grass, 0, 0, 64, 64);
  writePng(grass, path.join(UI_DIR, "grass.png"));
  // превью макетов окон (браузер не запускаем: 9-slice собран тем же правилом, что у border-image)
  const W = 300, H = 214, M = 14;
  const sheet = new PC(M + picks.length * (W + M), M * 3 + H * 2 + 24);
  fill(sheet, BG);
  paintGround(sheet, 0, 0, sheet.w, M + H + M / 2 + 10);
  picks.forEach(({ p, f, d }, i) => {
    const x = M + i * (W + M);
    sheet.blit(mockWindow(f, d, "INVENTORY", W, H), x, M);
    sheet.blit(mockWindow(f, d, "INVENTORY", W, H), x, M * 2 + H + 8);
    chipText(sheet, `${p.key.toUpperCase()}  FRAME ${f.n}  DIVIDER ${d.n}`, x, M * 2 + H + H + 12, BEIGE);
  });
  writePng(scaleNN(sheet, 2), path.join(PREVIEW_DIR, "ui-borders.png"));
  fs.writeFileSync(path.join(PREVIEW_DIR, "ui-borders.html"), demoHtml(picks));
  writePng(cursors(), path.join(PREVIEW_DIR, "cursors.png"));
}
