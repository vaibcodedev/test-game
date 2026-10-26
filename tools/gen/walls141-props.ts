/**
 * Задача 141 (правки): рыночная и дворовая мелочь в объёме 3/4 — прилавки, бочка, ящик, стойка с оружием, котёл, тюк сена.
 * Свет сверху слева: видна верхняя и правая боковая грань (в тени), навесы с толщиной и тенью на прилавок, тень у основания вправо-вниз.
 * Размеры и опора прежние (нижняя середина), следы на карте не меняются.
 */
import { PC, hex, mix, shade, withA, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { OUT, pnoise, tone } from "./walls141-lib";

const W = P.wood, IRON = P.darkSteel;
const SH: RGBA = [12, 8, 18, 255];
const shadowBlob = (c: PC, cx: number, cy: number, rx: number, ry: number, a = 90) => c.ellipse(cx, cy, rx, ry, withA(SH, a));
/** Цилиндр: освещённость столбца по Ламберту (свет слева). */
const lam = (u: number) => Math.max(0, -0.6 * u + 0.8 * Math.sqrt(Math.max(0, 1 - u * u)));

/** Ящик-коробка в 3/4: лицевая грань (x0..x1, y0..y1), боковая шириной d со сдвигом вверх k, верх; доски, рёбра, гвозди. */
function box(c: PC, x0: number, y0: number, x1: number, y1: number, d: number, k: number, R: Ramp, plank = 4) {
  // верхняя грань
  for (let j = 0; j < k; j++) for (let x = x0 + Math.round((d * (j + 1)) / k) - 1; x < x1 + Math.round((d * (j + 1)) / k); x++) c.set(x, y0 - 1 - j, tone(R, 3.2 - j * 0.1 + ((x + j) % plank === 0 ? -0.6 : 0)));
  // боковая грань в тени
  for (let i = 0; i < d; i++) { const off = Math.round(((i + 1) * k) / d); for (let y = y0 - off; y < y1 - off; y++) c.set(x1 + i, y, tone(R, 1.2 + ((y + 1) % plank === 0 ? -0.6 : 0))); }
  // лицевая грань: доски
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) c.set(x, y, tone(R, 2.3 + ((y - y0) % plank === plank - 1 ? -1 : 0) + (x === x0 ? 0.7 : 0) + (pnoise(x, y, 3, 64, 7) - 0.5) * 0.5));
}

/** Бочка 32×32: клёпки, обручи по окружности, крышка-эллипс, тень. */
export function barrel(): PC {
  const c = new PC(32, 32), cx = 15.5, r = 8, top = 9, bot = 28;
  shadowBlob(c, 19, 29, 11, 3);
  for (let x = Math.round(cx - r); x < cx + r; x++) {
    const u = (x + 0.5 - cx) / r, z = Math.sqrt(Math.max(0, 1 - u * u)), bulge = Math.round(z * 1.5);
    for (let y = top + Math.round(z * 2) - bulge + 1; y < bot + Math.round(z * 2) - 2 + bulge; y++) {
      const stave = Math.floor((Math.asin(u) + 2) * 4) % 2;
      let v = 0.7 + lam(u) * 2.8 + (stave ? -0.25 : 0);
      const yy = y - Math.round(z * 2);
      if ([top + 4, bot - 6].some((hy) => yy >= hy && yy < hy + 2)) { c.set(x, y, shade(yy % 2 ? IRON[2] : IRON[3], 0.7 + lam(u) * 0.6)); continue; }
      c.set(x, y, tone(W, v));
    }
  }
  c.ellipse(cx, top + 1, r - 0.5, 2.8, W[1]);
  c.ellipse(cx, top + 1, r - 1.6, 2, W[3]);
  for (const dx of [-3, 1]) c.rect(Math.round(cx + dx), top, 1, 3, W[2]);
  return c.outline(OUT);
}

/** Ящик 32×32 с верхом и боковиной в тени, рамой и диагональю. */
export function crate(): PC {
  const c = new PC(32, 32);
  shadowBlob(c, 19, 28, 12, 3);
  box(c, 5, 13, 22, 29, 6, 4, W);
  for (const [x0, y0, x1, y1] of [[5, 13, 22, 14], [5, 28, 22, 29]]) c.rect(x0, y0, x1 - x0, y1 - y0, W[1]);
  c.rect(5, 13, 2, 16, W[3]); c.rect(20, 13, 2, 16, W[1]);
  c.line(7, 27, 19, 15, W[1], 1); c.line(7, 26, 19, 14, W[3], 1);
  for (const [x, y] of [[6, 14], [20, 14], [6, 27], [20, 27]]) c.set(x, y, P.steel[3]);
  return c.outline(OUT);
}

/** Прилавок 64×72: короб-стойка с боковиной, товар на столешнице, навес с толщиной, фестонами и тенью, задние стойки. */
export function stall(awning: RGBA, goods: "potion" | "food" | "cloth" = "potion"): PC {
  const c = new PC(64, 72), A2 = hex("#ece4d2");
  shadowBlob(c, 36, 68, 30, 4, 100);
  // задние стойки
  for (const x of [10, 52]) for (let y = 16; y < 50; y++) { c.set(x, y, W[1]); c.set(x + 1, y, W[0]); }
  // короб-стойка
  box(c, 3, 50, 53, 67, 8, 5, W, 4);
  for (let x = 3; x < 53; x++) { c.set(x, 50, W[4] ?? W[3]); c.set(x, 51, W[2]); }
  // товар на столешнице
  const cols = [P.magic.fire[2], P.magic.blue[2], P.magic.green[2], P.magic.purple[2], P.magic.fire[3]];
  for (let i = 0; i < 6; i++) {
    const gx = 8 + i * 8 + (i % 2), gy = 46 - (i % 2);
    if (goods === "potion") {
      const col = cols[i % cols.length];
      c.ellipse(gx + 0.5, gy, 3, 3.4, shade(col, 0.6)); c.ellipse(gx, gy - 0.5, 2.2, 2.6, col); c.set(gx - 1, gy - 2, hex("#ffffff"));
      c.rect(gx, gy - 6, 1, 2, P.wood[3]); darken3(c, gx + 3, gy + 1);
    } else if (goods === "food") {
      c.ellipse(gx + 0.5, gy, 3.4, 2.6, i % 2 ? hex("#c85030") : hex("#e0a040")); c.set(gx - 1, gy - 1, hex("#fff0c0")); darken3(c, gx + 3, gy + 1);
    } else { c.rect(gx - 3, gy - 2, 7, 4, i % 2 ? P.cloth.blue[2] : P.cloth.red[2]); c.rect(gx - 3, gy - 2, 7, 1, mix(i % 2 ? P.cloth.blue[3] : P.cloth.red[3], hex("#ffffff"), 0.2)); darken3(c, gx + 4, gy); }
  }
  // передние стойки
  for (const x of [4, 50]) { for (let y = 20; y < 52; y++) { c.set(x, y, W[3]); c.set(x + 1, y, W[2]); c.set(x + 2, y, W[0]); c.set(x + 3, y, withA(SH, 90)); } }
  // навес: скат (полосы), толщина, фестоны, боковой клин
  const top = 4, eave = 20;
  for (let y = top; y < eave; y++) {
    const t = (y - top) / (eave - top), x0 = Math.round(8 - t * 8), x1 = Math.round(56 + t * 6);
    for (let x = x0; x < x1; x++) {
      const stripe = Math.floor(((x - 32) / (1 + t * 0.25) + 64) / 7) % 2;
      const base = stripe ? A2 : awning;
      c.set(x, y, shade(base, 0.88 + t * 0.2 + (x > x1 - 3 ? -0.2 : 0)));
    }
  }
  for (let x = 0; x < 62; x++) {
    const stripe = Math.floor((x - 32 + 64) / 7.5) % 2, base = stripe ? A2 : awning;
    c.set(x, eave, shade(base, 1.15)); c.set(x, eave + 1, shade(base, 0.8));
    const f = x % 7, d = f === 0 || f === 6 ? 2 : 4;
    for (let k = 2; k < d + 2; k++) c.set(x, eave + k, shade(base, 0.72));
    for (let k = d + 2; k < d + 6; k++) { const p = c.get(x, eave + k); if (p && p[3]) c.set(x, eave + k, shade(p, 0.7)); }
  }
  for (let j = 0; j < 14; j++) for (let i = 0; i < 4; i++) c.set(62 + i - Math.round(j / 4), eave - j, shade(awning, 0.55));
  return c.outline(OUT);
}
function darken3(c: PC, x: number, y: number) { for (let i = 0; i < 3; i++) { const p = c.get(x + i, y); if (p && p[3]) c.set(x + i, y, shade(p, 0.75)); } }

/** Стойка с оружием 32×48: рама с глубиной (поперечины, боковина), меч, копьё, топор с бликами, тень. */
export function weaponRack(): PC {
  const c = new PC(32, 48);
  shadowBlob(c, 18, 45, 13, 3);
  // задняя поперечина, оружие, передняя рама
  for (let x = 4; x < 28; x++) { c.set(x, 14, W[1]); c.set(x, 15, W[0]); }
  const S = P.steel;
  c.line(9, 10, 9, 42, S[3], 1); c.line(10, 10, 10, 42, S[1], 1); c.rect(7, 30, 6, 2, P.gold[2]); c.rect(9, 32, 2, 6, W[2]); // меч
  c.line(16, 3, 16, 44, W[2], 1); c.line(17, 4, 17, 44, W[1], 1); c.poly([[14, 8], [16.5, 1], [19, 8]], (x) => (x < 16.5 ? S[3] : S[1])); // копьё
  c.line(23, 12, 23, 44, W[2], 1); c.line(24, 12, 24, 44, W[1], 1); c.poly([[24, 12], [29, 9], [30, 16], [24, 18]], (x) => (x < 27 ? S[3] : S[2])); // топор
  for (const y of [26, 38]) { for (let x = 3; x < 29; x++) { c.set(x, y, W[3]); c.set(x, y + 1, W[2]); c.set(x, y + 2, W[0]); } for (let x = 3; x < 29; x++) { const p = c.get(x, y + 3); if (p && p[3]) c.set(x, y + 3, shade(p, 0.7)); } }
  for (const x of [3, 27]) { for (let y = 12; y < 45; y++) { c.set(x, y, W[3]); c.set(x + 1, y, W[2]); c.set(x + 2, y, W[0]); } }
  for (let y = 12; y < 44; y++) c.set(30, y - 2, W[1]);
  return c.outline(OUT);
}

/** Котёл 32×36: чугунный шар на ножках с отсветом огня, ободок и варево, поленья и угли, тень. */
export function cauldron(): PC {
  const c = new PC(32, 36), cx = 15.5, cy = 20, r = 10;
  shadowBlob(c, 19, 33, 13, 3, 100);
  // поленья и огонь
  c.line(8, 32, 24, 29, W[2], 2); c.line(9, 29, 23, 33, W[1], 2);
  c.poly([[11, 31], [13, 25], [15, 28], [17, 24], [20, 31]], (_x, y) => (y < 28 ? P.magic.fire[4] : P.magic.fire[2]));
  for (const lx of [8, 22]) c.line(lx, cy + 4, lx + (lx < 15 ? -2 : 2), 32, IRON[1], 2);
  for (let y = cy - r; y <= cy + r; y++) for (let x = Math.round(cx - r); x <= cx + r; x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d2 = dx * dx + dy * dy;
    if (d2 > 1 || y < cy - 4) continue;
    const nz = Math.sqrt(1 - d2);
    let v = 0.4 + Math.max(0, -0.55 * dx - 0.45 * dy + 0.7 * nz) * 3.6;
    if (dy > 0.4) v = Math.max(v, 1.2 + (dy - 0.4) * 2); // отсвет огня снизу
    const col = tone(IRON, v);
    c.set(x, y, dy > 0.5 ? mix(col, P.magic.fire[2], 0.25 * (dy - 0.5) * 2) : col);
  }
  c.ellipse(cx, cy - 4, r + 0.5, 3.4, IRON[3]);
  c.ellipse(cx, cy - 4, r - 1.5, 2.4, hex("#3c6a2c"));
  c.ellipse(cx - 2, cy - 4.6, 3, 1, hex("#7ab04a"));
  c.set(Math.round(cx + 3), cy - 5, hex("#a8d870"));
  return c.outline(OUT);
}

/** Тюк сена 32×32: брусок с соломенной фактурой (верх светлее, боковина в тени), перевязь. */
export function hay(): PC {
  const c = new PC(32, 32), H = [hex("#6a4a18"), hex("#9a7428"), hex("#c89c3c"), hex("#e2c060"), hex("#f4dc8a")] as Ramp;
  shadowBlob(c, 19, 29, 13, 3);
  for (let j = 0; j < 5; j++) for (let x = 5 + j; x < 23 + j + 1; x++) c.set(x, 13 - j, tone(H, 3.4 + (pnoise(x * 2, j, 2, 64, 3) - 0.5) * 1.4));
  for (let i = 0; i < 6; i++) { const off = Math.round(((i + 1) * 5) / 6); for (let y = 14 - off; y < 29 - off; y++) c.set(23 + i, y, tone(H, 1.2 + (pnoise(i, y * 2, 2, 64, 5) - 0.5))); }
  for (let y = 14; y < 29; y++) for (let x = 5; x < 23; x++) c.set(x, y, tone(H, 2.4 + (pnoise(x * 3, y * 0.6, 2, 128, 9) - 0.5) * 1.6 + (x === 5 ? 0.6 : 0)));
  for (const x of [10, 17]) { for (let y = 14; y < 29; y++) c.set(x, y, W[1]); for (let j = 0; j < 5; j++) c.set(x + j, 13 - j, W[2]); }
  return c.outline(OUT);
}
