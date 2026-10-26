/**
 * Задача 141 (правки): рыночная и дворовая мелочь в объёме 3/4 — прилавки, бочка, ящик, стойка с оружием, котёл, тюк сена.
 * Свет сверху слева: видна верхняя и правая боковая грань (в тени), навесы с толщиной и тенью на прилавок, тень у основания вправо-вниз.
 * Размеры и опора прежние (нижняя середина), следы на карте не меняются.
 */
import { PC, hash01, hex, mix, ramp, shade, withA, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { OUT, pnoise, tone } from "./walls141-lib";
import { shadowBox, shadowDisc } from "./shadow";

const W = P.wood, IRON = P.darkSteel;
const SH: RGBA = [12, 8, 18, 255];
const SD = (k: number) => [Math.round(k * 0.6), -Math.round(k * 0.55)] as [number, number];
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
  shadowDisc(c, 15.5, 27, 8, 2.5, 20);
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
  shadowBox(c, 5, 22, 29, [6, -4], 16);
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
  shadowBox(c, 3, 53, 67, [8, -5], 60);
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
  shadowBox(c, 3, 29, 45, [3, -2], 44);
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
  shadowDisc(c, 15.5, 31, 10, 3, 24);
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
  shadowBox(c, 5, 23, 29, [6, -5], 16);
  for (let j = 0; j < 5; j++) for (let x = 5 + j; x < 23 + j + 1; x++) c.set(x, 13 - j, tone(H, 3.4 + (pnoise(x * 2, j, 2, 64, 3) - 0.5) * 1.4));
  for (let i = 0; i < 6; i++) { const off = Math.round(((i + 1) * 5) / 6); for (let y = 14 - off; y < 29 - off; y++) c.set(23 + i, y, tone(H, 1.2 + (pnoise(i, y * 2, 2, 64, 5) - 0.5))); }
  for (let y = 14; y < 29; y++) for (let x = 5; x < 23; x++) c.set(x, y, tone(H, 2.4 + (pnoise(x * 3, y * 0.6, 2, 128, 9) - 0.5) * 1.6 + (x === 5 ? 0.6 : 0)));
  for (const x of [10, 17]) { for (let y = 14; y < 29; y++) c.set(x, y, W[1]); for (let j = 0; j < 5; j++) c.set(x + j, 13 - j, W[2]); }
  return c.outline(OUT);
}

// ---------------- правки 6: колодец, камень телепорта, статуи героев ----------------
const STONE_R = P.stone, MARB = ramp("#8a8478", "#b4ae9e", "#d6d0c0", "#eeeadc", "#fffcf2"), GOLD_R = P.gold;
/** Брусок в 3/4: лицо x0..x1 × y0..y1, верх глубиной k (сдвиг вправо d), правый бок в тени. */
/** Холст-посредник с масштабом (правки 7: статуи крупнее): примитивы рисуются в масштабе S со сдвигом, без «ступенек» у фигур. */
type Draw = Pick<PC, "set" | "rect" | "ellipse" | "poly" | "line">;
class Scaled {
  constructor(readonly dst: PC, readonly S: number, readonly ox: number, readonly oy: number) {}
  private X = (x: number) => this.ox + x * this.S;
  private Y = (y: number) => this.oy + y * this.S;
  set(x: number, y: number, c: RGBA) { this.dst.rect(this.X(x), this.Y(y), this.S, this.S, c); }
  rect(x: number, y: number, w: number, h: number, c: RGBA) { this.dst.rect(this.X(x), this.Y(y), w * this.S, h * this.S, c); }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA) { this.dst.ellipse(this.X(cx), this.Y(cy), rx * this.S, ry * this.S, c); }
  poly(pts: [number, number][], c: RGBA | ((x: number, y: number) => RGBA)) {
    this.dst.poly(pts.map(([x, y]) => [this.X(x), this.Y(y)] as [number, number]), typeof c === "function" ? (x, y) => c((x - this.ox) / this.S, (y - this.oy) / this.S) : c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA, w = 1) { this.dst.line(this.X(x0), this.Y(y0), this.X(x1), this.Y(y1), c, Math.max(1.5, w * this.S)); }
}
/** Статуя на круглом мощёном постаменте-площадке 64×152 (след 2×2): фигура и пьедестал в 1,5 раза крупнее прежних, клумбы по кругу. */
function bigStatue(draw: (c: Draw) => void, flowers: RGBA[]): PC {
  const c = new PC(64, 152), cx = 32, cy = 141;
  c.ellipse(cx + 3, cy + 2, 31, 8, withA(SH, 90));
  for (let y = cy - 8; y <= cy + 8; y++) for (let x = 1; x < 63; x++) {
    const d = Math.hypot((x + 0.5 - cx) / 30, (y + 0.5 - cy) / 7.5);
    if (d > 1) continue;
    const ring = d > 0.86, seg = Math.floor(Math.atan2(y - cy, (x - cx) / 4) * 4 + 10), row = Math.floor(d * 4);
    let v = ring ? 1.6 : 2.6 + (hash01(seg, row, 9) - 0.5) * 0.7;
    if (!ring && (Math.abs(((Math.atan2(y - cy, (x - cx) / 4) * 4 + 10) % 1) - 0.5) > 0.45 || Math.abs(d * 4 - row - 0.5) > 0.42)) v -= 0.9;
    c.set(x, y, tone(STONE_R, v + (y < cy ? 0.3 : -0.2)));
  }
  for (let a = 0; a < 18; a++) { const t = (a / 18) * Math.PI * 2, fx = Math.round(cx + Math.cos(t) * 27), fy = Math.round(cy + Math.sin(t) * 6.2); if (Math.sin(t) < -0.2) continue; c.set(fx, fy, hex("#3c7230")); c.set(fx + 1, fy, hex("#56903c")); c.set(fx, fy - 1, flowers[a % flowers.length]); }
  draw(new Scaled(c, 1.5, 8, 0) as unknown as Draw);
  return c.outline(OUT);
}
import { solStatue, umbStatue } from "./statues";
export const solHeroStatue = (): PC => solStatue();
export const umbHeroStatue = (): PC => umbStatue();

function block3(c: Draw, x0: number, y0: number, x1: number, y1: number, d: number, k: number, R: Ramp, tx?: (x: number, y: number) => number) {
  for (let j = 0; j < k; j++) { const sh = Math.round(((j + 1) * d) / k); for (let x = x0 + sh; x < x1 + sh; x++) c.set(x, y0 - 1 - j, tone(R, R.length - 1.4 - j * 0.1)); }
  for (let i = 0; i < d; i++) { const off = Math.round(((i + 1) * k) / d); for (let y = y0 - off; y < y1 - off; y++) c.set(x1 + i, y, tone(R, 1.2 + (tx ? tx(x1 + i, y) * 0.5 : 0))); }
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) c.set(x, y, tone(R, R.length / 2 + (x === x0 ? 0.8 : 0) + (y === y0 ? 0.7 : 0) - (y === y1 - 1 ? 0.8 : 0) + (tx ? tx(x, y) : 0)));
}

/** Колодец 36×50: сруб-цилиндр из камня, вода; стойки стоят на кромке сруба (низ спрятан за передней кромкой), на них — двускатный козырёк
 *  с толщиной и тенью; ворот с верёвкой и ведром. Один цельный предмет без зазоров. */
export function well(): PC {
  const c = new PC(36, 50), cx = 16, base = 46, r = 11, top = 30, ry = 4.5;
  shadowDisc(c, cx, base - 4, r, 2.5, 30);
  c.ellipse(cx, top, r, ry, STONE_R[3]); c.ellipse(cx, top + 0.5, r - 2.5, ry - 1.6, hex("#10243a")); c.ellipse(cx - 2, top - 0.5, 3, 1, hex("#2a5478"));
  for (const sx of [cx - r + 2, cx + r - 4]) for (let y = top - 19; y < top + 3; y++) { c.set(sx, y, W[3]); c.set(sx + 1, y, W[2]); c.set(sx + 2, y, W[0]); }
  for (let x = cx - r + 2; x < cx + r - 1; x++) { c.set(x, top - 12, W[3]); c.set(x, top - 11, W[1]); }
  for (let y = top - 10; y < top - 2; y++) c.set(cx + 1, y, hex("#c8b890"));
  c.rect(cx - 1, top - 3, 5, 4, W[2]); c.rect(cx - 1, top - 3, 5, 1, W[3]); c.rect(cx - 1, top - 2, 5, 1, IRON[2]);
  for (let x = Math.round(cx - r); x < cx + r; x++) {
    const u = (x + 0.5 - cx) / r, z = Math.sqrt(Math.max(0, 1 - u * u)), k = 0.55 + 0.6 * Math.max(0, -0.6 * u + 0.8 * z);
    const yt = Math.round(top + ry * z);
    for (let y = yt - 1; y < base - 4 + Math.round(2 * z); y++) {
      const row = Math.floor((y - yt) / 4), seg = Math.floor((Math.asin(u) + 2) * 3 + row * 0.5);
      const v = 2.4 + (hash01(seg, row, 2) - 0.5) * 0.6 + ((y - yt) % 4 === 3 ? -1.2 : 0) + (y < yt + 1 ? 1.2 : 0);
      c.set(x, y, shade(tone(STONE_R, v), k));
    }
  }
  const RF = P.roofRed, yE = top - 18, x0 = cx - r - 2, x1 = cx + r + 1, ridge = yE - 8;
  for (let y = ridge; y <= yE; y++) { const t = (y - ridge) / (yE - ridge); for (let x = x0 + Math.round((1 - t) * 3); x < x1 - Math.round(1 - t); x++) c.set(x, y, tone(RF, 2.6 + ((x - x0) % 4 === 0 ? -0.8 : 0) - t * 0.6)); }
  for (let x = x0; x < x1; x++) { c.set(x, yE + 1, RF[3]); c.set(x, yE + 2, RF[0]); }
  c.poly([[x1 - 1, yE + 2], [x1 + 3, ridge + 2], [x1 + 3, yE - 1]], RF[1]);
  for (let x = x0 + 1; x < x1; x++) c.set(x, ridge - 1, RF[4]);
  for (let x = cx - r; x < cx + r; x++) for (let y = yE + 3; y < yE + 6; y++) { const p = c.get(x, y); if (p && p[3]) c.set(x, y, shade(p, 0.68)); }
  return c.outline(OUT);
}

/** Камень телепорта 48×80: огранённый кристалл (освещённая левая грань, средняя, тёмная правая, блики на рёбрах, свечение изнутри)
 *  на каменном постаменте в 3/4 (верх, бок, руны), контактная тень. Ореол даёт клиент (terrain.ts, y − 34). */
export function teleportStone(): PC {
  const c = new PC(48, 80), B = P.magic.blue;
  shadowBox(c, 6, 38, 75, [6, -4], 70);
  block3(c, 6, 66, 38, 75, 6, 4, STONE_R, (x, y) => (hash01(x >> 2, y >> 2, 3) - 0.5) * 0.6);
  block3(c, 11, 58, 33, 66, 5, 3, STONE_R, (x, y) => (hash01(x >> 2, y >> 1, 5) - 0.5) * 0.5);
  for (const rx of [14, 20, 26]) { c.set(rx, 61, B[3]); c.set(rx + 1, 62, B[2]); c.set(rx, 63, B[3]); }
  for (const rx of [10, 18, 26, 32]) { c.set(rx, 70, B[2]); c.set(rx + 1, 70, B[3]); }
  const cx = 24, yb = 57, yt = 8, hw = 9;
  for (let y = yt; y < yb; y++) {
    const t = Math.min(1, (y - yt) / 16), w = Math.round(hw * t);
    for (let x = cx - w; x <= cx + w; x++) {
      const u = (x - cx) / Math.max(1, w), fi = u < -0.35 ? 0 : u < 0.35 ? 1 : 2;
      let col = tone(B, [3.2, 2.2, 1.1][fi] - ((y - yt) / (yb - yt)) * 0.6);
      const core = Math.hypot((x - cx) / 4, (y - 30) / 14);
      if (core < 1) col = mix(col, B[4], 0.55 * (1 - core));
      if (Math.abs(u + 0.35) < 0.12 || Math.abs(u - 0.35) < 0.12) col = mix(col, fi === 0 ? B[4] : B[3], 0.6);
      c.set(x, y, col);
    }
  }
  c.line(cx - 6, 22, cx - 3, 12, B[4]); c.set(cx - 5, 20, hex("#ffffff")); c.set(cx, yt, hex("#ffffff"));
  // гнездо-оправа (правки 7: «кристалл висит»): отсвет на верху постамента, железное кольцо с четырьмя лапками, обхватывающими низ кристалла
  for (let y = yb - 2; y <= yb + 3; y++) for (let x = cx - 15; x <= cx + 17; x++) { const d = Math.hypot((x - cx - 1) / 15, (y - yb - 0.5) / 3.5); if (d < 1) { const p = c.get(x, y); if (p && p[3] && y > yb) c.set(x, y, mix(p, B[3], 0.35 * (1 - d))); } }
  const IR = IRON;
  c.ellipse(cx + 0.5, yb + 1, hw + 3, 3, IR[1]); c.ellipse(cx + 0.5, yb, hw + 2, 2.2, IR[3]); c.ellipse(cx + 0.5, yb, hw - 1, 1.4, shade(B[1], 0.7));
  for (let x = cx - hw - 3; x <= cx + hw + 3; x++) { const p = c.get(x, yb + 3); if (p && p[3]) c.set(x, yb + 3, shade(p, 0.6)); }
  for (const [px, dir] of [[cx - hw + 1, -1], [cx - 3, 0], [cx + 3, 0], [cx + hw - 1, 1]] as const) {
    for (let k = 0; k < 7; k++) { const x = Math.round(px - dir * k * 0.3); c.set(x, yb - 1 - k, k > 4 ? IR[4] : dir < 0 || (dir === 0 && px < cx) ? IR[3] : IR[2]); }
    c.set(Math.round(px - dir * 2.4), yb - 8, IR[4]);
  }
  return c.outline(OUT);
}

/** Пьедестал статуи 32×96: три уступа с карнизом, боком в тени и табличкой. Возвращает верх площадки. */
function pedestal(c: Draw, R: Ramp, plaque: RGBA, trim: RGBA): number {
  c.ellipse(19, 92, 15, 3, withA(SH, 100));
  block3(c, 3, 84, 26, 93, 4, 3, R);
  block3(c, 6, 70, 23, 84, 4, 3, R, (x, y) => (hash01(x >> 2, y >> 2, 4) - 0.5) * 0.4);
  block3(c, 4, 66, 25, 70, 4, 3, R);
  for (let x = 4; x < 25; x++) c.set(x, 69, trim);
  c.rect(10, 74, 9, 6, plaque); c.rect(10, 74, 9, 1, shade(plaque, 1.3)); c.rect(11, 76, 7, 1, shade(plaque, 0.6)); c.rect(11, 78, 5, 1, shade(plaque, 0.6));
  return 63;
}
/** Статуя героя Сольгарда 32×96: паладин из белого мрамора с позолотой — поднятый меч, щит с солнцем, плащ; свет слева. */
function drawSol(c: Draw) {
  const M = MARB, G = GOLD_R;
  const top = pedestal(c, MARB, G[2], G[3]);
  const sh = (x: number, cx: number, hw: number, v = 2.6) => tone(M, v + 1.1 * Math.max(-1, Math.min(1, -(x + 0.5 - cx) / hw)));
  c.poly([[8, top], [21, top], [19, 30], [10, 30]], (x) => sh(x, 14.5, 6, 1.8));
  for (let y = 44; y < top; y++) for (let x = 11; x < 18; x++) c.set(x, y, x === 14 ? tone(M, 1.4) : sh(x, 14.5, 3.5));
  for (let y = 28; y < 46; y++) { const hw = y < 32 ? 5 : 4; for (let x = 14 - hw; x <= 14 + hw; x++) c.set(x, y, sh(x, 14, hw)); }
  c.rect(10, 38, 9, 2, G[2]); c.set(10, 38, G[4]);
  c.ellipse(14, 23, 3.5, 4, M[3]); c.ellipse(13, 22, 2, 2.5, M[4]); c.rect(11, 23, 7, 1, M[1]); c.rect(13, 18, 2, 2, G[3]);
  c.line(18, 29, 22, 20, M[3], 2); c.rect(21, 18, 3, 3, M[3]);
  c.rect(20, 16, 5, 2, G[2]); c.line(22, 15, 22, 2, M[4]); c.line(23, 15, 23, 3, M[2]); c.set(22, 1, hex("#ffffff"));
  c.poly([[4, 30], [11, 30], [11, 40], [7.5, 45], [4, 40]], (x) => sh(x, 7.5, 4, 2.8));
  c.ellipse(7.5, 36, 2.2, 2.2, G[3]); c.set(7, 35, G[4]);
  for (const [dx, dy] of [[0, -3.5], [0, 3.5], [-3, 0], [3, 0]]) c.set(Math.round(7.5 + dx), Math.round(36 + dy), G[2]);
}
/** Статуя героя Умбрата 32×96: рыцарь смерти в капюшоне из тёмного камня, меч остриём вниз, фиолетовые руны и глаза; свет слева. */
function drawUmb(c: Draw) {
  const D = ramp("#141018", "#221c28", "#342c3c", "#4a4054", "#62586e", "#7e7488"), V = P.magic.purple;
  const top = pedestal(c, D, V[1], V[2]);
  for (const [x, y] of [[9, 79], [13, 77], [17, 79], [21, 77]]) { c.set(x, y, V[3]); c.set(x, y + 1, V[2]); }
  const sh = (x: number, cx: number, hw: number, v = 2.6) => tone(D, v + 1.2 * Math.max(-1, Math.min(1, -(x + 0.5 - cx) / hw)));
  c.poly([[6, top], [23, top], [19, 28], [10, 28]], (x, y) => (Math.abs(x - 14.5) < 1 && y > 40 ? tone(D, 1) : sh(x, 14.5, 8, 2.3)));
  for (let y = 48; y < top; y += 5) c.set(14, y, V[2]);
  // широкие наплечники с шипами и руки в латных перчатках на навершии меча
  for (const sx of [5, 19]) { c.ellipse(sx + 2.5, 31, 4.5, 3, sx < 14 ? D[4] : D[2]); c.rect(sx, 31, 6, 1, sx < 14 ? D[5] : D[3]); c.poly([[sx + 1, 29], [sx + 2.5, 22], [sx + 4, 29]], sx < 14 ? D[5] : D[3]); c.set(sx + 2, 26, V[3]); }
  c.poly([[7, 33], [11, 33], [12, 36], [8, 40]], D[3]); c.poly([[18, 33], [22, 33], [21, 40], [17, 36]], D[2]);
  c.poly([[9, 30], [14.5, 14], [20, 30]], (x) => sh(x, 14.5, 5, 2.4)); c.ellipse(14.5, 25, 3, 3.5, D[0]); c.set(13, 25, V[4]); c.set(16, 25, V[4]);
  c.line(14, 34, 14, 56, D[5]); c.line(15, 34, 15, 56, D[2]); c.rect(11, 33, 8, 2, D[4]); c.rect(12, 30, 6, 3, D[3]);
  for (let y = 38; y < 54; y += 4) c.set(14, y, V[3]);
}
