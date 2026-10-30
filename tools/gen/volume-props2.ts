/**
 * Объём мелких вещей мира, второй проход 1030: бочка, ящик, жаровня, жаровня душ, костёр.
 * Подключено в volume-world.ts (RAW). Размеры кадров прежние (манифест не меняется). Правила: docs/art-perspective.md.
 */
import {
  PC, hash01, ramp, type Ramp,
  WOOD, IRON, STONE, FRONT, TOP, RIGHT,
  box, ellipseFace, log, shadowBox, shadowDisc, depth, litC, planksV, planksH, grain, finish,
} from "./volume-lib";

const FIRE = ramp("#7a1c0c", "#d8501c", "#ff9a2c", "#ffd25a", "#fff4b0");
const SOUL = ramp("#2a1060", "#5a2aa8", "#9a5ae8", "#d0a8ff", "#f4e8ff");
const EMBER = ramp("#2a0c08", "#6a1c0c", "#b8381a", "#e8641e", "#ffa43c");
const ASH = ramp("#1c1a1e", "#2e2c32", "#46444c", "#605e68");
const BONE = ramp("#3a3630", "#6a665c", "#a8a294", "#d8d2c0", "#f2ecd8");

/** Язык пламени: ось cx, основание baseY, высота h, ширина w; жар ярче у оси и внизу. */
function flame(pc: PC, cx: number, baseY: number, h: number, w: number, r: Ramp, seed: number) {
  for (let t = 0; t < h; t++) {
    const u = t / h, y = Math.round(baseY - t);
    const sway = Math.round(Math.sin(u * 3.1 + seed) * 1.2 * u);
    const hw = w * Math.pow(1 - u, 0.75) * (1 + 0.18 * Math.sin(u * 7 + seed));
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const e = Math.abs(x + 0.5 - cx) / Math.max(0.5, hw);
      if (e > 1) continue;
      pc.set(x + sway, y, litC(r, FRONT, (1 - e) * 2.4 - u * 1.6 - 1.4 + (hash01(x, y, seed) - 0.5) * 0.5));
    }
  }
}

/** Бочка: клёпка, три обруча, светлая крышка-эллипс с досками, контактная и брошенная тень. */
function barrel(): PC {
  const pc = new PC(32, 32), cx = 15.5, r = 11, top = 9, bot = 26;
  shadowDisc(pc, cx + 1, bot + 1, r + 1, 3.6, 22);
  for (let y = top; y <= bot + 4; y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    const yn = Math.min(1, (y - top) / (bot - top)), rr = r * (0.93 + Math.sin(yn * Math.PI) * 0.1);
    const u = (x + 0.5 - cx) / rr;
    if (Math.abs(u) > 1) continue;
    const c = Math.sqrt(1 - u * u), yb = bot + 2.7 * c;
    if (y + 0.5 > yb) continue;
    const phi = Math.asin(u), sv = (phi + 1.6) * 3.4, stave = Math.floor(sv);
    let off = (stave % 2 ? -0.35 : 0.1) + (hash01(stave, Math.floor(y / 3), 7) - 0.5) * 0.35;
    if (sv % 1 < 0.14) off -= 0.9;
    if (yb - (y + 0.5) < 2) off -= 0.7;
    let hoop = false;
    for (const hy of [top + 3, top + 8, bot - 3]) if (y >= hy && y < hy + 2) { hoop = true; off = (y === hy ? 0.7 : -0.5) + (u < -0.2 ? 0.4 : 0); }
    pc.set(x, y, litC(hoop ? IRON : WOOD, [u, 0, c], off));
  }
  ellipseFace(pc, cx, top, r * 0.93, r * 0.36, WOOD, TOP, (x, y) => (Math.floor((x + 40) / 4) % 2 ? -0.25 : 0.2) + (Math.abs(y - top) < 0.7 && Math.abs(x - cx) < 1 ? -0.9 : 0));
  return finish(pc);
}

/** Ящик: рама из брусьев по фасаду, раскосина, гвозди, крышка из досок видна сверху, боковина в тени. */
function crate(): PC {
  const pc = new PC(32, 32), x = 3, y = 12, w = 19, h = 15, d = 8, D = depth(d);
  shadowBox(pc, x, x + w, y + h, D, 18);
  box(pc, x, y, w, h, d, { r: WOOD, tex: planksV(4, 3, 0.3) }, { r: WOOD, tex: planksH(4, 5, 0.3) }, { r: WOOD, tex: planksH(3, 7, 0.35) });
  const bar = (x0: number, y0: number, bw: number, bh: number, off: number) => { for (let yy = y0; yy < y0 + bh; yy++) for (let xx = x0; xx < x0 + bw; xx++) pc.set(xx, yy, litC(WOOD, FRONT, off + (yy === y0 ? 0.6 : yy === y0 + bh - 1 ? -0.7 : 0) + (xx === x0 ? 0.3 : 0))); };
  bar(x, y, w, 3, 0.1); bar(x, y + h - 3, w, 3, 0); bar(x, y + 3, 3, h - 6, 0.1); bar(x + w - 3, y + 3, 3, h - 6, -0.3);
  for (let k = 0; k < w - 5; k++) { const yy = y + h - 4 - Math.round((k * (h - 8)) / (w - 6)); pc.set(x + 3 + k, yy, litC(WOOD, FRONT, 0.5)); pc.set(x + 3 + k, yy + 1, litC(WOOD, FRONT, -0.9)); }
  for (const [nx, ny] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]]) pc.set(nx, ny, litC(IRON, FRONT, 1.4));
  for (let k = 0; k < w; k++) pc.set(x + k, y, litC(WOOD, TOP, 1.6));
  for (let k = 0; k <= Math.abs(D[0]); k++) pc.set(x + w + k, y + Math.round((D[1] * k) / D[0]), litC(WOOD, TOP, 1.2));
  return finish(pc);
}

/** Жаровня: каменная пята, кованый треножник с обручем, чаша с рёбрами и каймой, угли и пламя. */
function brazierGen(soul: boolean, k = 1): PC {
  const pc = new PC(32, 48), cx = 15.5, base = 45, FL = soul ? SOUL : FIRE;
  shadowDisc(pc, cx + 2, base - 1, 11, 3.8, 24);
  box(pc, cx - 8, base - 4, 16, 4, 5, { r: STONE, tex: grain(3, 0.25) }, { r: STONE }, { r: STONE, tex: grain(4, 0.3) });
  const leg = (x0: number, y0: number, x1: number, y1: number, th: number, off: number) => {
    const n = Math.max(Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) { const xx = x0 + ((x1 - x0) * i) / n, yy = y0 + i; for (let q = 0; q < th; q++) pc.set(Math.round(xx + q), yy, litC(IRON, q === 0 ? FRONT : RIGHT, off + (q === 0 ? 0.6 : -0.6))); }
  };
  leg(cx + 1, 24, cx + 5.5, base - 5, 2, -0.5);
  leg(cx - 3, 24, cx - 8, base - 5, 3, 0.2); leg(cx + 3, 24, cx + 8, base - 5, 3, 0);
  for (let x = -5; x <= 6; x++) { const yy = 36 + Math.round(Math.sqrt(Math.max(0, 1 - (x / 7) ** 2)) * 1.5); pc.set(Math.round(cx + x), yy, litC(IRON, FRONT, x < 0 ? 0.9 : 0.1)); pc.set(Math.round(cx + x), yy + 1, litC(IRON, FRONT, -0.8)); }
  for (let y = 19; y <= 28; y++) { const t = (y - 19) / 9, rr = 10 - t * 3.6; for (let x = Math.floor(cx - rr); x <= cx + rr; x++) { const u = (x + 0.5 - cx) / rr; if (Math.abs(u) > 1) continue; const c = Math.sqrt(1 - u * u); const rib = Math.floor((Math.asin(u) + 1.6) * 2.6) % 2; pc.set(x, y + Math.round(c * 2), litC(IRON, [u, 0.1, c], rib ? -1.2 : -0.5 - t * 0.6)); } }
  ellipseFace(pc, cx, 19, 10.5, 3.4, IRON, TOP);
  ellipseFace(pc, cx, 19.5, 8.2, 2.5, soul ? SOUL : EMBER, FRONT, (x, y) => (hash01(x, y, 5) - 0.5) * 1.4 + (y < 19 ? -0.9 : 0.2));
  flame(pc, cx, 19, Math.round((soul ? 17 : 14) * k), (soul ? 4.4 : 5.2) * Math.min(k, 1.15), FL, 2);
  flame(pc, cx - 3, 19, Math.round((soul ? 9 : 8) * k), 2.2, FL, 5); flame(pc, cx + 3.5, 19, Math.round((soul ? 11 : 9) * k), 2.2, FL, 7);
  if (soul) for (const [bx, by] of [[cx - 9, 40], [cx + 9, 41]]) {
    for (let y = -3; y <= 1; y++) for (let x = -2; x <= 2; x++) if ((x / 2.4) ** 2 + ((y + 1) / 2.4) ** 2 < 1) pc.set(Math.round(bx + x), by + y, litC(BONE, FRONT, y < -1 ? 0.5 : -0.3));
    pc.set(Math.round(bx - 1), by - 1, litC(IRON, FRONT, -2)); pc.set(Math.round(bx + 1), by - 1, litC(IRON, FRONT, -2));
  }
  return finish(pc);
}

/** Костёр: кольцо круглых валунов с бликами, два скрещённых полена с торцами, зольная подушка, угли и пламя. */
function campfire(): PC {
  const pc = new PC(32, 32), cx = 15.5, cy = 24;
  shadowDisc(pc, cx + 2, cy + 2, 14, 5, 22);
  ellipseFace(pc, cx, cy, 12, 5, ASH, TOP, grain(2, 0.5));
  const stones: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3; stones.push([cx + Math.cos(a) * 12.5, cy + Math.sin(a) * 5.2, 2.6 + hash01(i, 1, 4) * 1.2]); }
  stones.sort((a, b) => a[1] - b[1]);
  const drawStone = (sx: number, sy: number, r: number) => {
    for (let y = Math.floor(sy - r); y <= sy + r * 0.8; y++) for (let x = Math.floor(sx - r); x <= sx + r; x++) {
      const dx = (x + 0.5 - sx) / r, dy = (y + 0.5 - sy) / (r * 0.8), e = dx * dx + dy * dy; if (e > 1) continue;
      pc.set(x, y, litC(STONE, [dx * 0.9, -dy, Math.sqrt(1 - e)], (hash01(x, y, 3) - 0.5) * 0.5 + (e > 0.7 && dy > 0 ? -0.5 : 0)));
    }
  };
  stones.filter((s) => s[1] < cy).forEach((s) => drawStone(...s));
  ellipseFace(pc, cx, cy, 8, 3, EMBER, FRONT, (x, y) => (hash01(x, y, 9) - 0.5) * 1.6 + 0.2);
  log(pc, cx - 9, cy - 1, cx + 5, cy + 3, 2.2, WOOD, { end: WOOD });
  log(pc, cx - 5, cy + 3, cx + 9, cy - 2, 2.2, WOOD, { end: WOOD });
  flame(pc, cx, cy, 17, 6, FIRE, 3); flame(pc, cx - 4, cy, 9, 2.6, FIRE, 6); flame(pc, cx + 4.5, cy, 11, 2.6, FIRE, 9);
  for (const [px, py] of [[cx - 5, cy - 8], [cx + 6, cy - 11], [cx + 1, cy - 19]]) pc.set(Math.round(px), Math.round(py), litC(FIRE, FRONT, 2.2));
  stones.filter((s) => s[1] >= cy).forEach((s) => drawStone(...s));
  return finish(pc);
}


const WAX = ramp("#5a4a38", "#8a7860", "#b8a888", "#dccfb0", "#f6ecd0");
/** Свечи на латунной тарелке: лужицы воска, свечи разной высоты с бликом и пламенем, контактная тень. */
function candles(n: number): PC {
  const pc = new PC(32, 32), cx = 15.5, by = 26;
  shadowDisc(pc, cx + 1, by + 1, 11, 3.4, 22);
  ellipseFace(pc, cx, by - 1, 10, 3.6, IRON, TOP, (x, y) => (y > by ? 0.5 : 0) + (hash01(x, y, 4) - 0.5) * 0.4);
  ellipseFace(pc, cx, by - 1.5, 7.5, 2.4, WAX, TOP);
  for (let i = 0; i < n; i++) {
    const x0 = Math.round(cx - ((n - 1) * 3.4) / 2 + i * 3.4 - 1), h = 7 + ((i * 5) % 4) * 2 + (n === 2 ? 2 : 0), y0 = by - 2 - h + (i % 2);
    for (let y = y0; y < by - 1 + (i % 2); y++) for (let q = 0; q < 3; q++) pc.set(x0 + q, y, litC(WAX, [q - 1, 0, 1], q === 0 ? 0.5 : q === 2 ? -0.6 : 0));
    pc.set(x0 + 1, y0 - 1, litC(IRON, FRONT, -2));
    for (let t = 0; t < 4; t++) for (let q = -1; q <= 1; q++) if (Math.abs(q) < 2 - t * 0.5 && !(t === 3 && q)) pc.set(x0 + 1 + q, y0 - 2 - t, litC(FIRE, FRONT, 1.2 - t * 0.5 - Math.abs(q) * 0.9));
  }
  return finish(pc);
}

export const PROPS2: Record<string, () => PC> = { barrel, crate, brazier: () => brazierGen(false), soul_brazier: () => brazierGen(true), campfire, dg_brazier_a: () => brazierGen(false, 1.05), dg_brazier_b: () => brazierGen(false, 1.4), dg_candles_a: () => candles(3), dg_candles_b: () => candles(5), dg_candles_c: () => candles(2) };
