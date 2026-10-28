/**
 * Задача 139, босс кольца: латный великан с молотом грома (запад, слот r75n, ур. 75, группа 4–5; референс 02 — только для сравнения: чужой арт в игру и в git не идёт).
 * Метод — как у минотавра и Мидаса: 2D-пиксель-арт слоями-штампами, тело в 2× (160×160) сводится в кадр 80×80, ступни y=76, контур 1 px;
 * общий код — mino_lib.ts. Руки по IK, сутулость — сдвиг рядов выше пояса. Молния — ломаная в 2–3 px: белое ядро, голубая кромка, ореол в листе glow.
 * Виды: вниз, вверх, вбок (строки листа), влево — зеркало вбок (в игре).
 *
 * Запуск (низкий приоритет, под замком tools/out/scenario.lock):
 *   npx tsx tools/gen/bosses139/sol_storm_colossus.ts --sketch          → tools/out/bosses139/colossus-sketch.png
 *   npx tsx tools/gen/bosses139/sol_storm_colossus.ts [--quick] [--only=idle,walk]
 *     → colossus-sheet.png, colossus-glow.png, r75n-w-compare.png («наш | референс 02»), r75n-w-sheet.png (превью листа)
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { C, Cv, F, Mk, OUTL, hash, hx, label, paint } from "./mino_lib";
F["0"] ??= "111,101,101,101,111"; F["6"] ??= "011,100,111,101,111"; F["9"] ??= "111,101,111,001,110"; F["7"] ??= "111,001,010,010,010"; F["8"] ??= "111,101,111,101,111";

export const ID = "sol_storm_colossus";
export const FRAME = 80;
export const FRAME_H = 80;
const Z = 2, W = 160, FR = 80;
const PI = Math.PI, SIN = Math.sin, COS = Math.cos;
type V2 = [number, number];

// ---------------- палитры ----------------
const R = (...s: string[]): C[] => s.map(hx);
/** Латы: холодная сталь, как на ледяном референсе. */
const STEEL = R("#0b0e13", "#1b2129", "#2f3843", "#4a5664", "#6f7e8d", "#a0afbb", "#d8e2e8");
/** Тёмное железо: боёк молота, цепь, шар. */
const IRON = R("#08090c", "#16191f", "#272c34", "#3e454f", "#5f6873", "#8b939c");
/** Кожа: синяя, как у огра на референсе. */
const SKIN = R("#0a0f1e", "#162039", "#243458", "#364b7c", "#4f659c", "#7187bb");
const PAINTR = R("#4c0c10", "#7c1618", "#ac2a20");
const FUR = R("#120b06", "#28190c", "#412a15", "#61401f", "#85592d");
const LEATH = R("#1a0a08", "#33130f", "#521e16", "#76301f", "#985030");
const CLOTH = R("#100509", "#250b0f", "#3f1317", "#5c1c1e", "#7c2a27");
const WOOD = R("#160c06", "#2f1c0d", "#4c2f17", "#6e4622", "#916031");
const BONE = R("#2a2018", "#5c4a38", "#9a8466", "#cdb890", "#efe4c6");
/** Молния: тёмная синь ореола → голубая кромка → белое ядро. */
const LT = R("#1b3c8e", "#2d70e2", "#62b8ff", "#b8eaff", "#ffffff");
const EYE = hx("#ff3a2c"), EYE2 = hx("#ffb6a0");

// ---------------- маски в координатах 1×, рисуются в сетке 2× ----------------
class Mz extends Mk {
  constructor() { super(W, W); }
  private fill(x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean) {
    const a = Math.max(0, Math.floor(x0)), b = Math.min(W - 1, Math.ceil(x1)), c = Math.max(0, Math.floor(y0)), d = Math.min(W - 1, Math.ceil(y1));
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (inside(x + 0.5, y + 0.5)) this.set(x, y);
  }
  L(a: V2, b: V2, t0: number, t1 = t0) { this.line(a[0] * Z, a[1] * Z, b[0] * Z, b[1] * Z, t0 * Z, t1 * Z); return this; }
  D(p: V2, r: number) { this.disc(p[0] * Z, p[1] * Z, r * Z); return this; }
  P(pts: V2[]) {
    const q = pts.map(([x, y]) => [x * Z, y * Z] as V2);
    const xs = q.map((v) => v[0]), ys = q.map((v) => v[1]);
    this.fill(Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1, (x, y) => {
      let ins = false;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, yi] = q[i], [xj, yj] = q[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; }
      return ins;
    });
    return this;
  }
  E(c: V2, rx: number, ry: number) {
    const cx = c[0] * Z, cy = c[1] * Z, ax = rx * Z, ay = ry * Z;
    this.fill(cx - ax - 1, cy - ay - 1, cx + ax + 1, cy + ay + 1, (x, y) => { const dx = (x - cx) / ax, dy = (y - cy) / ay; return dx * dx + dy * dy <= 1; });
    return this;
  }
}
const M = () => new Mz();
const add = (a: V2, b: V2, k = 1): V2 => [a[0] + b[0] * k, a[1] + b[1] * k];
const lerp = (a: V2, b: V2, u: number): V2 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const nrm = (v: V2): V2 => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const perpOf = (v: V2): V2 => [-v[1], v[0]];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const px2 = (c: Cv, p: V2, col: C) => { const x = Math.floor(p[0]) * Z, y = Math.floor(p[1]) * Z; c.set(x, y, col); c.set(x + 1, y, col); c.set(x, y + 1, col); c.set(x + 1, y + 1, col); };
const pxo = (c: Cv, b: V2, dx: number, dy: number, col: C) => px2(c, [Math.floor(b[0]) + dx, Math.floor(b[1]) + dy], col);
const LIGHT: V2 = [-0.6, -0.8];

// ---------------- части ----------------
const plate = (c: Cv, m: Mk, bias = 0, amp = 2) => paint(c, m, STEEL, { amp, dome: 3, dith: 0.06, bias });
/** Шип: треугольник от основания по направлению, освещённая грань — светлой полосой. */
function spike(c: Cv, base: V2, dir: V2, len: number, w: number, bias = 0.3, ramp = STEEL) {
  const d = nrm(dir), n = perpOf(d);
  const m = M().P([add(base, n, -w), add(base, n, w), add(base, d, len)]);
  paint(c, m, ramp, { amp: 2.2, dome: 1, dith: 0, bias });
  const s = n[0] * LIGHT[0] + n[1] * LIGHT[1] > 0 ? 1 : -1;
  if (len > 4) for (let u = 0.15; u <= 0.6; u += 0.08) px2(c, add(add(base, d, len * u), n, s * w * 0.4 * (1 - u)), ramp[ramp.length - 2]);
}
/** Заклёпка 2×2 (в 1×): блик, полутон, тень снизу. */
const rivet = (c: Cv, p: V2) => { const x = Math.floor(p[0]), y = Math.floor(p[1]); px2(c, [x, y], STEEL[6]); px2(c, [x + 1, y], STEEL[5]); px2(c, [x, y + 1], STEEL[4]); px2(c, [x + 1, y + 1], STEEL[3]); px2(c, [x, y + 2], STEEL[1]); px2(c, [x + 1, y + 2], STEEL[1]); };
/** Блик-дуга на выпуклой пластине (свет сверху-слева). */
function spec(c: Cv, ctr: V2, rx: number, ry: number, a0: number, a1: number, col = STEEL[6], col2 = STEEL[5]) {
  const n = Math.max(3, Math.round(Math.abs(a1 - a0) * Math.max(rx, ry)));
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; px2(c, [ctr[0] + COS(a) * rx, ctr[1] + SIN(a) * ry], i === 0 || i === n ? col2 : col); }
}
/** Мех: штрихи прядей вниз. */
function furTex(c: Cv, m: Mk, d: Int16Array) {
  for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) {
    if (!m.has(x, y) || !m.has(x + 1, y + 1) || d[y * W + x] < 2) continue;
    const h = hash(x >> 1, Math.floor(y / 5));
    const col = h < 0.14 ? FUR[4] : h < 0.32 ? FUR[3] : h > 0.86 ? FUR[0] : null;
    if (col) { c.set(x, y, col); c.set(x + 1, y, col); c.set(x, y + 1, col); c.set(x + 1, y + 1, col); }
  }
}
function furBlob(c: Cv, ctr: V2, rx: number, ry: number, seed: number, bias = 0) {
  const pts: V2[] = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * 2 * PI, k = i % 2 ? 0.72 + 0.2 * hash(i, seed) : 1.05 + 0.2 * hash(seed, i); pts.push([ctr[0] + COS(a) * rx * k, ctr[1] + SIN(a) * ry * k]); }
  const m = M().P(pts); furTex(c, m, paint(c, m, FUR, { amp: 1.6, dome: 2, dith: 0.3, bias }));
}
/** Кожаные обмотки поперёк сегмента. */
function wraps(c: Cv, a: V2, b: V2, half: number, us: number[], ramp = LEATH, bias = 0) {
  const d = nrm([b[0] - a[0], b[1] - a[1]]), n = perpOf(d);
  for (const u of us) { const p = lerp(a, b, u); const m = M().L(add(add(p, n, -half), d, -0.3), add(add(p, n, half), d, 0.3), 1.4); paint(c, m, ramp, { amp: 1.6, dome: 1, dith: 0, bias }); }
}
const limb = (c: Cv, a: V2, b: V2, t0: number, t1: number, bias = 0, ramp = SKIN) => { const m = M().L(a, b, t0, t1); return { m, d: paint(c, m, ramp, { amp: 1.6, dome: 3, dith: 0.28, bias }) }; };
/** Ткань с рваным подолом: точки подола справа налево. */
function ragged(x1: number, x0: number, y: number, n: number, amp: number, seed: number, sway = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = x1 + (x0 - x1) * u;
    const deep = i % 2 === 0 ? amp * (0.5 + hash(i, seed)) : -amp * 0.3 * hash(seed, i);
    out.push([x + sway * (0.5 + u) * 0.6, y + deep + SIN(u * PI) * 0.8]);
  }
  return out;
}
function folds(c: Cv, m: Mk, lines: [V2, V2][], ramp = CLOTH) {
  for (const [a, b] of lines) for (let i = 0; i <= 40; i++) {
    const p = lerp(a, b, i / 40), x = Math.round(p[0] * Z), y = Math.round(p[1] * Z);
    if (m.has(x, y) && m.has(x + 1, y)) { c.set(x, y, ramp[1]); c.set(x + 1, y, ramp[4]); }
  }
}
function ik2(s: V2, f: V2, l1: number, l2: number, pole: V2): V2 {
  let dx = f[0] - s[0], dy = f[1] - s[1], d = Math.hypot(dx, dy) || 0.01;
  const mx = l1 + l2 - 0.05;
  if (d > mx) { f = [s[0] + (dx * mx) / d, s[1] + (dy * mx) / d]; dx = f[0] - s[0]; dy = f[1] - s[1]; d = mx; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  let pxv = -uy, pyv = ux; if (pxv * pole[0] + pyv * pole[1] < 0) { pxv = -pxv; pyv = -pyv; }
  return [s[0] + ux * a + pxv * h, s[1] + uy * a + pyv * h];
}
const L1 = 12.5, L2 = 13;
const reach = (s: V2, f: V2): V2 => { const d = Math.hypot(f[0] - s[0], f[1] - s[1]); return d > L1 + L2 - 0.05 ? lerp(s, f, (L1 + L2 - 0.05) / d) : f; };

/** Плечо: синяя кожа с ремнём. */
function upperArm(c: Cv, s: V2, el: V2, bias: number) {
  limb(c, s, el, 8, 7, bias);
  wraps(c, s, el, 3.6, [0.55, 0.7], LEATH, bias);
}
/** Рука-латница: шипастый наруч, огромный кулак; out — наружная сторона (шипы). */
function gauntletArm(c: Cv, el: V2, h: V2, bias: number, out: V2) {
  const d = nrm([h[0] - el[0], h[1] - el[1]]); let n = perpOf(d); if (n[0] * out[0] + n[1] * out[1] < 0) n = [-n[0], -n[1]];
  const cop = M().D(el, 3); plate(c, cop, bias + 0.2);
  const v0 = add(el, d, 0.8), v1 = lerp(el, h, 0.86);
  const vm = M().L(v0, v1, 8.8, 8.0); const dv = plate(c, vm, bias);
  for (const u of [0.15, 0.85]) { const p = lerp(v0, v1, u); const b = M().L(add(p, n, -4.4), add(p, n, 4.4), 1.5); plate(c, b, bias + 0.5, 1.6); }
  for (const u of [0.28, 0.52, 0.76]) spike(c, add(lerp(v0, v1, u), n, 3.6), add(n, d, -0.25), 4.2, 1.5, bias + 0.4);
  rivet(c, add(lerp(v0, v1, 0.5), n, -2));
  // кулак: синие пальцы, стальная накладка на костяшках
  const fc = add(h, d, 1.6);
  const fm = M().D(fc, 4.0); paint(c, fm, SKIN, { amp: 1.8, dome: 3, dith: 0.25, bias: bias + 0.2 });
  for (let k = -1; k <= 1; k++) { const q = add(add(fc, n, k * 1.5), d, 1.4); px2(c, q, SKIN[1]); px2(c, add(q, d, 1), SKIN[1]); }
  const kn = M().L(add(add(fc, d, 1.5), n, -3), add(add(fc, d, 1.5), n, 3), 1.6); plate(c, kn, bias + 0.4, 1.6);
  for (const k of [-2, 0, 2]) spike(c, add(add(fc, d, 2.4), n, k), d, 2.2, 0.8, bias + 0.5);
}
/** Рука с молотом: обмотки, стальной браслет, кулак на древке. */
function hammerForearm(c: Cv, el: V2, h: V2, bias: number) {
  limb(c, el, h, 7.2, 6.2, bias);
  wraps(c, el, h, 3.4, [0.25, 0.4], LEATH, bias);
  const d = nrm([h[0] - el[0], h[1] - el[1]]), n = perpOf(d);
  const br = M().L(lerp(el, h, 0.58), lerp(el, h, 0.84), 7.6, 7.0); plate(c, br, bias + 0.1);
  const cop = M().D(el, 2.6); plate(c, cop, bias + 0.2);
}
function hammerFist(c: Cv, h: V2, haft: V2, bias: number) {
  const fm = M().D(h, 3.3); paint(c, fm, SKIN, { amp: 1.8, dome: 3, dith: 0.25, bias: bias + 0.2 });
  const n = perpOf(nrm(haft));
  for (let k = -1; k <= 1; k++) { const q = add(add(h, haft, k * 1.3 / Math.max(0.3, Math.hypot(haft[0], haft[1]))), n, 1.2); px2(c, q, SKIN[1]); }
}
/** Молот грома. dir — вектор древка от кисти к бойку (длина < 1 — ракурс). */
interface Ham { head: V2; u: V2; perp: V2; hh: number; hl: number; top: V2 }
function hammer(c: Cv, hand: V2, dir: V2, bias = 0, faceK = 1): Ham {
  const k = Math.max(0.35, Math.hypot(dir[0], dir[1])), u = nrm(dir), perp = nrm(perpOf(u));
  const LH = 28, PM = 7;
  const head = add(hand, u, LH * k), pom = add(hand, u, -PM * k);
  const hm = M().L(pom, add(head, u, -2), 3); const dh = paint(c, hm, WOOD, { amp: 1.6, dome: 2, dith: 0.3, bias });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (hm.has(x, y) && dh[y * W + x] > 1 && hash(x >> 1, y) < 0.18) c.set(x, y, WOOD[1]);
  const grip = M().L(add(hand, u, -3.2 * k), add(hand, u, 3.2 * k), 3.3); const dg = paint(c, grip, LEATH, { amp: 1.5, dome: 2, dith: 0, bias });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (grip.has(x, y) && dg[y * W + x] > 1 && (Math.round(x * u[1] - y * u[0]) + Math.round(x * u[0] + y * u[1])) % 4 === 0) c.set(x, y, LEATH[1]);
  for (const t of [LH - 4.5]) { const p = add(hand, u, t * k); const r = M().L(add(p, perp, -2), add(p, perp, 2), 1.4); plate(c, r, bias + 0.4, 1.6); }
  const pc = M().D(pom, 1.8); plate(c, pc, bias + 0.3); spike(c, add(pom, u, -1.2), [-u[0], -u[1]], 2.4, 1, bias + 0.4);
  // боёк: тёмное железо, стальные торцы с ободами, шипы
  const hl = 6.6, hh = 4.8 * Math.max(0.55, k) * faceK;
  const ch = 1.3, q = (a: number, b: number): V2 => add(add(head, perp, a), u, b);
  const blk = M().P([q(-hl + ch, -hh), q(hl - ch, -hh), q(hl, -hh + ch), q(hl, hh - ch), q(hl - ch, hh), q(-hl + ch, hh), q(-hl, hh - ch), q(-hl, -hh + ch)]);
  paint(c, blk, IRON, { amp: 2, dome: 3, dith: 0.2, bias: bias - 0.1 });
  for (const s of [-1, 1]) {
    const cap = M().P([q(s * (hl - 2.4), -hh - 0.7), q(s * (hl + 0.4), -hh - 0.3), q(s * (hl + 0.4), hh + 0.3), q(s * (hl - 2.4), hh + 0.7)]);
    plate(c, cap, bias + 0.25);
    for (let t = -hh + 1; t <= hh - 1; t += 2) px2(c, q(s * (hl - 2.6), t), IRON[0]);
    spike(c, q(s * (hl + 0.3), 0), [perp[0] * s, perp[1] * s], 2.8, 1.5, bias + 0.4);
    spike(c, q(s * (hl - 1.2), -hh + 0.2), add(u, perp, s * 0.9), 2.6, 1.0, bias + 0.4);
    spike(c, q(s * (hl - 1.2), hh - 0.2), add([-u[0], -u[1]], perp, s * 0.9), 2.2, 0.9, bias + 0.3);
  }
  spike(c, q(0, hh - 0.2), u, 4.2, 1.6, bias + 0.4);
  return { head, u, perp, hh, hl, top: q(0, hh + 4) };
}
/** Корона из стальных шипов на ободе. */
function crown(c: Cv, band: V2[], spikes: [V2, number, number, number][]) {
  for (const [b, h, w, lean] of spikes) {
    const m = M().P([[b[0] - w, b[1] + 0.6], [b[0] + w, b[1] + 0.6], [b[0] + lean, b[1] - h]]);
    paint(c, m, STEEL, { amp: 2.2, dome: 1, dith: 0, bias: 0.5 });
    if (h > 4.5) { px2(c, [b[0] + lean * 0.45 - 0.4, b[1] - h * 0.35], STEEL[6]); px2(c, [b[0] + lean * 0.6 - 0.4, b[1] - h * 0.5], STEEL[5]); }
  }
  const m = M().P(band); const d = paint(c, m, STEEL, { amp: 1.8, dome: 2, dith: 0.1, bias: 0 });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m.has(x, y) && d[y * W + x] === 2 && !m.has(x, y - 3)) c.set(x, y, STEEL[5]);
  // терновое кольцо поверх обода
  for (let i = 0; i < band.length - 1; i++) if (i % 2 === 0) for (let t = 0; t <= 1; t += 0.14) px2(c, lerp(band[0], band[1], t + 0.07 * (i % 3)), (Math.round(t * 7) % 2) ? LEATH[2] : LEATH[0]);
}
/** Наплечник: два яруса, шипы, заклёпки, блик. */
function pauldron(c: Cv, ctr: V2, rx: number, ry: number, s: number, spikes: [V2, V2, number][], bias: number, lower = true) {
  if (lower) { const lo = M().E(add(ctr, [s * 1.8, 6.6]), rx * 0.82, ry * 0.62); plate(c, lo, bias - 0.25); }
  const m = M().E(ctr, rx, ry); const d = plate(c, m, bias + 0.1);
  spec(c, ctr, rx * 0.55, ry * 0.55, -2.35, -1.75);
  for (const [o, dir, len] of spikes) spike(c, add(ctr, o), dir, len, 1.8, bias + 0.4);
  for (const a of [0.3 * PI, 0.7 * PI]) rivet(c, [ctr[0] + COS(a) * rx * 0.72 - 1, ctr[1] + SIN(a) * ry * 0.62 - 1]);
}
/** Нога: синее бедро с обмотками, наколенник с шипами, поножь, босая стопа. side — вид вбок (вперёд — минус x). */
function leg(c: Cv, hip: V2, knee: V2, ank: V2, s: number, bias: number, side: boolean, back: boolean) {
  limb(c, hip, knee, 10.4, 9, bias);
  wraps(c, hip, knee, 5, [0.42, 0.62], LEATH, bias);
  const sh = limb(c, knee, ank, 8, 6.8, bias - 0.1, LEATH);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (sh.m.has(x, y) && sh.d[y * W + x] > 1 && (y + Math.round(x * 0.4)) % 5 === 0) c.set(x, y, LEATH[0]);
  if (!back) {
    const off: V2 = side ? [-1.8, 0] : [0, 0];
    const g = M().L(add(lerp(knee, ank, 0.18), off), add(lerp(knee, ank, 0.8), off), side ? 3.8 : 5, side ? 3.2 : 4); plate(c, g, bias + 0.1);
    spike(c, add(lerp(knee, ank, 0.5), side ? [-3.2, 0] : [s * 2.4, 0]), side ? [-1, -0.25] : [s, -0.3], 2.8, 1.1, bias + 0.4);
  }
  const ab = M().L(add(ank, [-4, 0.2]), add(ank, [4, 0.2]), 1.6); paint(c, ab, LEATH, { amp: 1.5, dome: 1, dith: 0, bias: bias + 0.3 });
  const kg = M().E(knee, side ? 4.4 : 5, 4.6); plate(c, kg, bias + 0.2);
  spec(c, add(knee, [-1, -1]), 2, 2, -2.6, -1.7);
  if (side) { spike(c, add(knee, [-3.6, -0.6]), [-1, -0.45], 4.4, 1.6, bias + 0.4); spike(c, add(knee, [-0.6, -3.6]), [-0.3, -1], 3, 1.2, bias + 0.4); }
  else if (!back) { spike(c, add(knee, [s * 3.8, -1]), [s, -0.55], 4.2, 1.6, bias + 0.4); spike(c, add(knee, [0, -3.8]), [s * 0.15, -1], 3.2, 1.3, bias + 0.4); }
  else spike(c, add(knee, [s * 4, -0.5]), [s, -0.4], 3.6, 1.4, bias);
  // стопа
  const a = ank;
  const fp: V2[] = side ? [[a[0] - 6.6, a[1] + 4.5], [a[0] - 6.2, a[1] + 1.6], [a[0] - 2, a[1] - 0.2], [a[0] + 2.8, a[1] + 0.4], [a[0] + 3, a[1] + 4.5]]
    : back ? [[a[0] - 4.2, a[1] + 0.4], [a[0] + 4.2, a[1] + 0.4], [a[0] + 4.6, a[1] + 4.5], [a[0] - 4.6, a[1] + 4.5]]
      : [[a[0] - 4.2, a[1] + 0.4], [a[0] + 4.2, a[1] + 0.4], [a[0] + 5.4, a[1] + 4.5], [a[0] - 5.4, a[1] + 4.5]];
  const f = M().P(fp); paint(c, f, SKIN, { amp: 1.5, dome: 2, dith: 0.25, bias: bias + 0.1 });
  if (side) { for (const t of [-5.4, -3.6]) { pxo(c, [a[0] + t, a[1] + 3.6], 0, 0, SKIN[1]); } pxo(c, [a[0] - 6.4, a[1] + 3.5], 0, 0, BONE[3]); pxo(c, [a[0] - 4.6, a[1] + 3.6], 0, 0, BONE[2]); }
  else if (!back) for (const t of [-3, -1, 1, 3]) { pxo(c, [a[0] + t * 1.15 + 0.3, a[1] + 3], 0, 0, SKIN[1]); pxo(c, [a[0] + t * 1.15 - 0.6, a[1] + 3.6], 0, 0, BONE[2]); }
}
/** Цепь с шипастым шаром — свисает с кулака латницы. */
function flail(c: Cv, from: V2, sw: number, floor = 74) {
  let p = from;
  const n = 9;
  for (let k = 0; k < n; k++) {
    const q: V2 = [from[0] + sw * k * 0.35 + SIN(k * 0.7) * 0.3 * sw, Math.min(floor - 3, from[1] + 1.3 * (k + 1))];
    px2(c, q, k % 2 ? IRON[2] : IRON[4]); if (k % 2 === 0) px2(c, [q[0] + 1, q[1]], IRON[1]);
    p = q;
  }
  const ball: V2 = [p[0] + sw * 0.4, p[1] + 2.6];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * 2 * PI + 0.3; spike(c, add(ball, [COS(a) * 2, SIN(a) * 2]), [COS(a), SIN(a)], 2.2, 0.9, 0.2, IRON); }
  const bm = M().D(ball, 2.7); paint(c, bm, IRON, { amp: 2, dome: 2, dith: 0.2, bias: 0.2 });
  px2(c, add(ball, [-1, -1]), IRON[5]);
}

// ---------------- поза ----------------
export interface Pose {
  bob: number; squat: number; lean: number; dx: number; tilt: number; sy: number;
  head: V2;
  /** кисти: с молотом и латница — сдвиг от покоя в координатах вида вбок (вперёд — минус x); ha — угол древка (0 — вверх, минус — вперёд) */
  hh: V2; gh: V2; ha: number;
  /** латница берётся за древко 0..1 */
  two: number;
  legA: V2; legB: V2; kneel: number; sw: number;
  /** поклон корпуса в поясе (рад, минус — вперёд): кулак до земли */
  bend: number;
  /** молния: треск на бойке 0..2, удар с неба в молот, цепная молния вперёд, кольцо удара по земле (shockAt 0 — у бойка, 1 — у кулака), гроза вокруг, столбы-громоотводы */
  bolt: number; sky: number; arc: number; shock: number; shockAt: number; storm: number; pillars: number;
  flash: number; dust: V2; stars: number; seed: number;
}
export const REST: Pose = {
  bob: 0, squat: 0, lean: 0.1, dx: 0, tilt: 0, sy: 1, head: [0, 0], hh: [0, 0], gh: [0, 0], ha: -0.28, two: 0,
  legA: [0, 0], legB: [0, 0], kneel: 0, sw: 0, bend: 0, bolt: 0.5, sky: 0, arc: 0, shock: 0, shockAt: 0, storm: 0, pillars: 0,
  flash: 0, dust: [0, 0], stars: 0, seed: 0,
};
export type ViewId = "side" | "front" | "back";
interface Frame { img: Cv; ham: Ham; fist: V2; head: V2; feet: V2; fwd: V2; eyes: V2[] }

const SIDE_H: V2 = [24, 50], SIDE_G: V2 = [52, 50];

/** Вид вбок: лицом влево, сутулый, молот в ближней руке, латница — дальняя. */
function renderSide(p: Pose): Frame {
  const c = new Cv(W, W), K = p.lean, bs = p.bob + p.squat, sq = p.squat;
  const piv: V2 = [44 + p.dx, 47 + bs];
  const U = (x: number, y: number): V2 => {
    const q: V2 = [x - K * Math.max(0, 46 - y) + p.dx, y + bs];
    if (!p.bend || y >= 47) return q;
    const a = p.bend * clamp((47 - y) / 6, 0, 1), v: V2 = [q[0] - piv[0], q[1] - piv[1]];
    return [piv[0] + v[0] * COS(a) - v[1] * SIN(a), piv[1] + v[0] * SIN(a) + v[1] * COS(a)];
  };
  const Hd = (x: number, y: number): V2 => { const q = U(x - 0.5, y - 1.5); return [q[0] + p.head[0], q[1] + p.head[1]]; };
  const sN = U(41, 27), sF = U(47.5, 26);
  const hH = reach(sN, [SIDE_H[0] + p.hh[0] + p.dx, SIDE_H[1] + p.hh[1] + bs * 0.6]);
  const dir: V2 = [SIN(p.ha), -COS(p.ha)];
  let gT: V2 = [SIDE_G[0] + p.gh[0] + p.dx, SIDE_G[1] + p.gh[1] + bs * 0.6];
  if (p.two > 0) gT = lerp(gT, add(hH, dir, -5.5), p.two);
  gT = reach(sF, gT);
  const elF = ik2(sF, gT, L1, L2, [1, 0.5]);
  const elN = ik2(sN, hH, L1, L2, [0.5, 1]);
  const behind = dir[0] > 0.45;
  // дальняя рука-латница и дальний наплечник
  const farArm = () => {
    upperArm(c, sF, elF, -0.9);
    gauntletArm(c, elF, gT, -0.8, [0.6, -0.4]);
    if (p.two < 0.5) flail(c, add(gT, nrm([gT[0] - elF[0], gT[1] - elF[1]]), 3.5), 0.6 + p.sw * 0.5);
  };
  /** в поклоне кулак-латница идёт к земле перед корпусом — рисуется поверх */
  const armFront = p.bend < -0.3;
  if (!armFront) farArm();
  pauldron(c, U(50, 23.5), 6.8, 5.4, 1, [[[1, -4.6], [0.3, -1], 4.2], [[5.2, -2], [0.9, -0.5], 4.2]], -1.0, false);
  let ham: Ham | null = null;
  if (behind) ham = hammer(c, hH, dir, -0.3);
  // ноги
  const lg = (hip: V2, knee: V2, ank: V2, off: V2, bias: number) => {
    const kn = p.kneel, h: V2 = [hip[0] + p.dx, hip[1] + sq + p.bob * 0.3];
    const k: V2 = lerp([knee[0] - sq * 0.75 + off[0] * 0.5, knee[1] + sq * 0.45 + off[1] * 0.5], [h[0] - 5, 71.5], kn);
    const a: V2 = lerp([ank[0] + off[0], ank[1] + off[1]], [k[0] + 10, 71.5], kn);
    leg(c, h, k, a, -1, bias, true, false);
  };
  lg([46.5, 49], [48, 61.5], [49, 71.5], p.legB, -0.6);
  // юбка из меха, набедренник
  const skirt = M().P([U(32, 43), U(53, 42), ...ragged(54.5, 30.5, 51 + sq, 9, 2.2, 5, p.sw).map(([x, y]) => [x + p.dx, y] as V2)]);
  furTex(c, skirt, paint(c, skirt, FUR, { amp: 1.4, dome: 3, dith: 0.3, bias: -0.2 }));
  lg([38.5, 49], [36, 61.5], [35, 71.5], p.legA, 0);
  const flapB = M().P([U(48, 44), U(53, 44), ...ragged(54 + p.sw * 0.4, 48.5 + p.sw * 0.4, 56 + sq, 3, 1.6, 9).map(([x, y]) => [x + p.dx, y] as V2)]);
  paint(c, flapB, CLOTH, { amp: 1.3, dome: 2, dith: 0.3, bias: -0.4 });
  const flapF = M().P([U(30.5, 44), U(37.5, 44), ...ragged(37 - p.sw * 0.5, 29.5 - p.sw * 0.6, 58 + sq, 4, 1.8, 3).map(([x, y]) => [x + p.dx, y] as V2)]);
  paint(c, flapF, CLOTH, { amp: 1.3, dome: 2, dith: 0.3, bias: 0.1 }); folds(c, flapF, [[U(33, 45), [32 + p.dx - p.sw * 0.5, 57 + sq]]]);
  // туловище: мех, горб, грудные пластины ёлочкой
  const torso = M().P([U(34, 21), U(45, 18.5), U(53.5, 21), U(56.5, 28), U(55, 37), U(51.5, 45), U(33, 45), U(30.5, 39), U(30, 30)]);
  furTex(c, torso, paint(c, torso, FUR, { amp: 1.8, dome: 5, dith: 0.3 }));
  for (let i = 2; i >= 0; i--) {
    const y0 = 21.5 + i * 6.3;
    const pl = M().P([U(30 + i * 0.3, y0), U(37.5, y0 - 1.6), U(41.5, y0 + 3), U(39.5, y0 + 8), U(30.6 + i * 0.4, y0 + 7.4)]);
    plate(c, pl, 0.15 - i * 0.15); for (let t = 0; t < 3; t++) px2(c, U(31 + t * 0.9, y0 + 1.4 - t * 0.3), STEEL[t ? 5 : 6]);
  }
  for (const [o, d, l] of [[[54, 23.5], [0.6, -0.8], 5.5], [[56.3, 29.5], [0.9, -0.42], 5], [[55.2, 36], [0.97, -0.1], 4]] as [V2, V2, number][]) spike(c, U(o[0], o[1]), d, l, 1.7, -0.1);
  // пояс: верёвка, топор-пряжка, клыки
  const belt = M().L(U(30.6, 43.2), U(52.5, 43.6), 3.4); const db = paint(c, belt, LEATH, { amp: 1.5, dome: 2, dith: 0, bias: 0.2 });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (belt.has(x, y) && db[y * W + x] > 1 && (x + y) % 3 === 0) c.set(x, y, LEATH[1]);
  const bk = M().P([U(29.6, 41.2), U(33.4, 41.8), U(33.4, 45), U(29.6, 45.8)]); plate(c, bk, 0.3); px2(c, U(31, 43), STEEL[1]);
  for (const x of [35, 38]) { pxo(c, U(x, 45.6), 0, 0, BONE[4]); pxo(c, U(x, 46.6), 0, 0, BONE[2]); }
  // ближнее плечо, наплечник, голова
  upperArm(c, sN, elN, 0);
  const coll = U(36.5, 21.5); furBlob(c, coll, 5, 3.4, 4, 0.2);
  pauldron(c, U(45, 25.5), 8.4, 6.6, 1, [[[-3.8, -4.8], [-0.4, -0.92], 4.2], [[0.4, -6.2], [0.05, -1], 5.6], [[4.8, -4.4], [0.62, -0.78], 5], [[8, -1], [0.96, -0.28], 4.2]], 0);
  furBlob(c, U(49.5, 31), 3.6, 2.6, 7, -0.3);
  if (armFront) farArm();
  // голова в профиль влево: тяжёлая челюсть, клык, корона-шипы
  const skull = M().E(Hd(33.2, 16.4), 5, 5.4).P([Hd(27, 18), Hd(31, 15.4), Hd(35.6, 19.5), Hd(33.6, 22.6), Hd(28.4, 22.9), Hd(26.4, 21)]);
  paint(c, skull, SKIN, { amp: 1.9, dome: 2, dith: 0.25, bias: 0.4 });
  const ear = M().P([Hd(35.4, 14.4), Hd(39.6, 12.8), Hd(36.6, 17)]); paint(c, ear, SKIN, { amp: 1.6, dome: 1, dith: 0, bias: 0 });
  const eb = Hd(29.2, 15.2);
  for (let x = -2; x <= 2; x++) { pxo(c, eb, x, -2, SKIN[5]); pxo(c, eb, x, -1, SKIN[1]); }
  pxo(c, eb, 0, 0, EYE); pxo(c, eb, 1, 0, SKIN[0]); pxo(c, eb, -1, 0, SKIN[1]);
  for (let y = 1; y <= 4; y++) pxo(c, eb, 1, y, PAINTR[y % 2 ? 2 : 1]);
  pxo(c, Hd(26.8, 16.8), 0, 0, SKIN[5]); pxo(c, Hd(26.8, 16.8), 0, 1, SKIN[0]);
  for (let x = 0; x < 5; x++) pxo(c, Hd(27.3, 20.6), x, 0, x % 2 ? SKIN[0] : BONE[2]);
  pxo(c, Hd(27.6, 19.6), 0, 0, BONE[4]); pxo(c, Hd(27.6, 19.6), 0, -1, BONE[3]); pxo(c, Hd(27.6, 19.6), 0, 1, BONE[2]);
  for (let y = 0; y < 3; y++) pxo(c, Hd(34.5, 18.5), 0, y, PAINTR[1]);
  crown(c, [Hd(28.4, 11.8), Hd(37.6, 11.0), Hd(37.8, 13.4), Hd(28.6, 14.1)],
    [[Hd(29, 12), 3.2, 0.8, -0.8], [Hd(30.6, 11.8), 4.8, 0.9, -0.6], [Hd(32.2, 11.6), 6.2, 1.0, -0.3], [Hd(33.8, 11.4), 6.8, 1.05, 0.1], [Hd(35.4, 11.2), 5.6, 0.95, 0.6], [Hd(37, 11.1), 3.8, 0.8, 1]]);
  for (let i = 0; i < 4; i++) { const q = Hd(29.8 + i * 1.2, 23.2 + (i % 2) * 0.6); px2(c, q, i % 2 ? BONE[3] : PAINTR[2]); }
  // ближнее предплечье и молот
  hammerForearm(c, elN, hH, 0);
  if (!ham) ham = hammer(c, hH, dir, 0);
  hammerFist(c, hH, ham.u, 0);
  return { img: c, ham, fist: add(gT, nrm([gT[0] - elF[0], gT[1] - elF[1]]), 2), head: Hd(33, 6), feet: [41 + p.dx, 76], fwd: [-1, 0], eyes: [eb] };
}

/** Вид спереди / сзади. Молот — в его левой руке: справа на экране спереди, слева — со спины. */
function renderFront(p: Pose, back: boolean): Frame {
  const c = new Cv(W, W), hS = back ? -1 : 1, gS = -hS, sq = p.squat, bs = p.bob + p.squat;
  const droop = Math.max(-1, (p.lean - 0.1) * 9);
  const U = (x: number, y: number): V2 => {
    let yy = y + (y < 32 ? droop * (32 - y) / 20 : 0);
    if (p.bend && y < 47) yy = 47 - (47 - yy) * COS(p.bend * clamp((47 - y) / 6, 0, 1));
    return [x + p.dx, yy + bs];
  };
  const Hd = (x: number, y: number): V2 => { const q = U(x, y - (back ? 1.5 : 0.5)); return [q[0] + p.head[0] * 0.25, q[1] + p.head[1] + Math.max(0, -p.head[0]) * 0.15]; };
  const mapF = (rest: V2, v: V2, s: number, upK = 9): V2 => {
    const up = clamp(-v[1] / 30, 0, 1), fw = Math.max(0, -v[0]), bw = Math.max(0, v[0]);
    return [rest[0] - s * (up * upK + fw * 0.25) + p.dx, rest[1] + v[1] * (v[1] < 0 ? 0.82 : 1) + (back ? -1 : 1) * (fw * 0.2 - bw * 0.15) + bs * 0.6];
  };
  const sH = U(40 + hS * 16.5, 27), sG = U(40 + gS * 16.5, 27);
  let hH = mapF([40 + hS * 25, 40], p.hh, hS);
  hH = lerp(hH, [40 + hS * 4 + p.dx, hH[1]], p.two);
  hH = reach(sH, hH);
  const Fw = -SIN(p.ha), Uc = COS(p.ha);
  const dir: V2 = [hS * 0.04 * (1 - p.two), -Uc + (back ? -0.35 : 0.35) * Fw];
  let gT = mapF([40 + gS * 24, 50], p.gh, gS);
  if (p.two > 0) gT = lerp(gT, add(hH, nrm(dir), -5.5 * Math.hypot(dir[0], dir[1])), p.two);
  gT = reach(sG, gT);
  const elH = ik2(sH, hH, L1, L2, [hS, 0.4]), elG = ik2(sG, gT, L1, L2, [gS, 0.3]);
  const behind = back ? Fw > 0.25 : Fw < -0.25;
  let ham: Ham | null = null;
  if (behind) ham = hammer(c, hH, dir, -0.3);
  // ноги
  for (const s of [-1, 1]) {
    const off = s < 0 ? p.legA : p.legB, oy = off[1] - off[0] * 0.15;
    const a: V2 = [40 + s * 12 + p.dx * 0.3, 71.5 + oy];
    const hip: V2 = [40 + s * 6.8 + p.dx, 49 + sq + p.bob * 0.3];
    const knee: V2 = lerp([40 + s * (10 + sq * 0.2) + p.dx * 0.6, Math.min(70, 61.5 + sq * 0.7 + oy * 0.5)], [40 + s * 10.5 + p.dx, 71], p.kneel);
    if (p.kneel > 0) { const t = lerp(a, [knee[0] + s * 1.5, 72], p.kneel); a[0] = t[0]; a[1] = t[1]; }
    leg(c, hip, knee, a, s, s === hS ? -0.15 : 0.1, false, back);
  }
  // меховая юбка и набедренник
  const skirt = M().P([U(28.5, 43), U(51.5, 43), ...ragged(53, 27, 51 + sq, 12, 2.2, 11, p.sw * 0.5).map(([x, y]) => [x + p.dx, y] as V2)]);
  furTex(c, skirt, paint(c, skirt, FUR, { amp: 1.4, dome: 4, dith: 0.3, bias: back ? -0.3 : -0.1 }));
  const lc = M().P([U(34, 44), U(46, 44), ...ragged(46.5, 33.5, 59 + sq, 6, 2.2, back ? 13 : 2, p.sw * 0.5).map(([x, y]) => [x + p.dx, y] as V2)]);
  paint(c, lc, CLOTH, { amp: 1.3, dome: 3, dith: 0.3, bias: back ? -0.3 : 0 });
  folds(c, lc, [[U(37, 45), [36.5 + p.dx, 58 + sq]], [U(40.5, 45), [40.5 + p.dx, 59 + sq]], [U(43.5, 45), [44 + p.dx, 58 + sq]]]);
  // туловище
  const torso = M().P([U(27, 21), U(53, 21), U(54.5, 32), U(51.5, 45), U(28.5, 45), U(25.5, 32)]);
  furTex(c, torso, paint(c, torso, FUR, { amp: 1.8, dome: 6, dith: 0.3, bias: back ? -0.2 : 0 }));
  if (!back) {
    for (let i = 2; i >= 0; i--) {
      const y0 = 21.5 + i * 6.3, hw = 12 - i * 1.7;
      const pl = M().P([U(40 - hw, y0), U(40, y0 + 3.6), U(40 + hw, y0), U(40 + hw - 0.6, y0 + 5.2), U(40, y0 + 9.2), U(40 - hw + 0.6, y0 + 5.2)]);
      plate(c, pl, 0.15 - i * 0.12);
      for (let y = y0 + 4; y < y0 + 8.6; y++) { px2(c, U(39.4, y), STEEL[5]); px2(c, U(40.6, y), STEEL[2]); }
      spec(c, U(40 - hw * 0.55, y0 + 3), 2.2, 0.6, PI, 1.6 * PI);
    }
    // ожерелье из клыков и бусин
    for (let i = 0; i <= 9; i++) { const t = i / 9, q = U(35 + 10 * t, 21.8 + 2.4 * SIN(PI * t)); px2(c, q, [LEATH[3], BONE[3], PAINTR[2]][i % 3]); if (i % 2 === 1) { px2(c, [q[0], q[1] + 1], BONE[4]); px2(c, [q[0], q[1] + 2], BONE[2]); } }
  } else {
    const bp = M().P([U(29.5, 22), U(50.5, 22), U(52, 30), U(48.5, 40.5), U(31.5, 40.5), U(28, 30)]); const dbp = plate(c, bp, -0.15);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (bp.has(x, y) && dbp[y * W + x] > 2 && (y === Math.round((28.5 + bs) * Z) || y === Math.round((34.5 + bs) * Z))) c.set(x, y, STEEL[1]);
    for (const y of [24.5, 30.5, 36.5]) spike(c, U(40, y + 1), [0, -1], 3.2, 1.4, 0.2);
    spec(c, U(34, 27), 3, 2, PI, 1.5 * PI);
  }
  if (!back) {
    const belt = M().L(U(29, 43.4), U(51, 43.4), 3.3); const db = paint(c, belt, LEATH, { amp: 1.5, dome: 2, dith: 0, bias: 0.2 });
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (belt.has(x, y) && db[y * W + x] > 1 && (x + y) % 3 === 0) c.set(x, y, LEATH[1]);
    const bk = M().P([U(36.6, 41.4), U(43.4, 41.4), U(45.2, 40), U(45.2, 46.6), U(43.4, 45.2), U(36.6, 45.2), U(34.8, 46.6), U(34.8, 40)]);
    plate(c, bk, 0.3); px2(c, U(40, 43), STEEL[1]); px2(c, U(36, 41), STEEL[6]);
    for (const x of [31.5, 33.5, 46.5, 48.5]) { pxo(c, U(x, 45.4), 0, 0, BONE[4]); pxo(c, U(x, 46.4), 0, 0, BONE[3]); pxo(c, U(x, 47.4), 0, 0, BONE[1]); }
  } else {
    const belt = M().L(U(29, 43.4), U(51, 43.4), 3.3); const db = paint(c, belt, LEATH, { amp: 1.5, dome: 2, dith: 0, bias: -0.1 });
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (belt.has(x, y) && db[y * W + x] > 1 && (x + y) % 3 === 0) c.set(x, y, LEATH[1]);
  }
  // плечи, наплечники
  upperArm(c, sH, elH, back ? -0.3 : -0.1);
  upperArm(c, sG, elG, back ? -0.2 : 0);
  for (const s of [-1, 1]) {
    pauldron(c, U(40 + s * 16.5, 25), 9.4, 7.2, s, [
      [[s * 5, -6], [s * 0.18, -1], 5.4], [[s * 9.5, -4], [s * 0.66, -0.76], 6], [[s * 12.4, 0.8], [s, -0.28], 4.8], [[s * 1.2, -3], [s * 0.25, -0.97], 3.2],
    ], back ? -0.25 : (s < 0 ? 0.1 : -0.1));
    furBlob(c, U(40 + s * 22.5, 31.5), 3.8, 2.8, 5 + s, -0.2);
  }
  // голова
  let eyes: V2[] = [];
  if (!back) {
    for (const s of [-1, 1]) { const ear = M().P([Hd(40 + s * 4.6, 14.2), Hd(40 + s * 8, 12.2), Hd(40 + s * 5, 17.4)]); paint(c, ear, SKIN, { amp: 1.6, dome: 1, dith: 0, bias: s < 0 ? 0.4 : -0.2 }); }
    const face = M().E(Hd(40, 16.6), 5.2, 5.4).P([Hd(34.8, 17.5), Hd(45.2, 17.5), Hd(44.8, 21.6), Hd(40, 23.4), Hd(35.2, 21.6)]);
    paint(c, face, SKIN, { amp: 1.9, dome: 2, dith: 0.25, bias: 0.4 });
    // брови, глаза, боевая раскраска
    for (let x = -4; x <= 3; x++) { pxo(c, Hd(40, 13.6), x, 0, x === -4 || x === 3 ? SKIN[3] : SKIN[5]); pxo(c, Hd(40, 14.6), x, 0, SKIN[1]); }
    eyes = [Hd(37.6, 15.6), Hd(42.4, 15.6)];
    for (const e of eyes) { pxo(c, e, 0, 0, EYE); pxo(c, e, 1, 0, SKIN[0]); for (let y = 1; y <= 4; y++) pxo(c, e, 0, y, PAINTR[y % 2 ? 2 : 1]); }
    pxo(c, eyes[1], -1, 0, SKIN[0]); pxo(c, eyes[1], 0, 0, EYE); pxo(c, eyes[1], 1, 0, SKIN[1]);
    for (let y = 11.6; y < 13.6; y++) pxo(c, Hd(39.6, y), 0, 0, PAINTR[1]);
    const nb = Hd(39.6, 17.2); pxo(c, nb, 0, -1, SKIN[4]); pxo(c, nb, -1, 0, SKIN[0]); pxo(c, nb, 1, 0, SKIN[0]); pxo(c, nb, 0, 0, SKIN[5]);
    const mb = Hd(36.8, 20.4);
    for (let x = 0; x < 7; x++) pxo(c, mb, x, 0, x === 0 || x === 6 ? SKIN[1] : x % 2 ? BONE[3] : SKIN[0]);
    for (const x of [0, 6]) { pxo(c, mb, x, -1, BONE[4]); pxo(c, mb, x, -2, BONE[3]); }
    for (let x = 1; x < 6; x++) pxo(c, mb, x, 1, SKIN[2]);
    crown(c, [Hd(34.6, 11.4), Hd(45.4, 11.4), Hd(45.2, 13.6), Hd(34.8, 13.6)],
      [[Hd(35.2, 11.6), 3.4, 0.8, -1.2], [Hd(36.9, 11.4), 5, 0.9, -0.8], [Hd(38.5, 11.3), 6.4, 1.0, -0.3], [Hd(40, 11.2), 7.2, 1.1, 0], [Hd(41.5, 11.3), 6.4, 1.0, 0.3], [Hd(43.1, 11.4), 5, 0.9, 0.8], [Hd(44.8, 11.6), 3.4, 0.8, 1.2]]);
  } else {
    for (const s of [-1, 1]) { const ear = M().P([Hd(40 + s * 4.6, 14.6), Hd(40 + s * 7.8, 12.6), Hd(40 + s * 5, 17.6)]); paint(c, ear, SKIN, { amp: 1.6, dome: 1, dith: 0, bias: -0.2 }); }
    const nape = M().E(Hd(40, 16.8), 5.3, 5.8); paint(c, nape, SKIN, { amp: 1.9, dome: 3, dith: 0.25, bias: 0.1 });
    for (let y = 15; y < 22; y++) pxo(c, Hd(40, y), 0, 0, y % 2 ? PAINTR[1] : PAINTR[2]);
    for (let x = -3; x <= 3; x++) pxo(c, Hd(40, 21.6), x, 0, SKIN[1]);
    crown(c, [Hd(34.6, 11.8), Hd(45.4, 11.8), Hd(45.2, 14), Hd(34.8, 14)],
      [[Hd(35.2, 12), 3.2, 0.8, -1.2], [Hd(36.9, 11.8), 4.6, 0.9, -0.8], [Hd(38.5, 11.7), 6, 1.0, -0.3], [Hd(40, 11.6), 6.8, 1.1, 0], [Hd(41.5, 11.7), 6, 1.0, 0.3], [Hd(43.1, 11.8), 4.6, 0.9, 0.8], [Hd(44.8, 12), 3.2, 0.8, 1.2]]);
  }
  // предплечья: латница с цепом, рука с молотом
  gauntletArm(c, elG, gT, back ? -0.3 : 0, [gS, 0]);
  const fdir = nrm([gT[0] - elG[0], gT[1] - elG[1]]);
  if (p.two < 0.5) flail(c, add(gT, fdir, 3.5), gS * 0.5 + p.sw * 0.4);
  hammerForearm(c, elH, hH, back ? -0.3 : -0.05);
  if (!ham) ham = hammer(c, hH, dir, back ? -0.2 : 0);
  hammerFist(c, hH, ham.u, back ? -0.3 : 0);
  return { img: c, ham, fist: add(gT, fdir, 2), head: Hd(40, 6), feet: [40 + p.dx, 76], fwd: back ? [0, -1] : [0, 1], eyes };
}

// ---------------- сведение 2× → 1×, эффекты ----------------
function rotCv(src: Cv, ang: number, cx: number, cy: number, sy = 1): Cv {
  if (Math.abs(ang) < 1e-3 && sy === 1) return src;
  const o = new Cv(src.w, src.h), cs = COS(ang), sn = SIN(ang);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const vx = x - cx, vy = (y - cy) / sy;
    const sx = Math.round(cx + vx * cs - vy * sn), sy2 = Math.round(cy + vx * sn + vy * cs);
    if (src.has(sx, sy2)) o.set(x, y, src.get(sx, sy2));
  }
  return o;
}
function down(c: Cv): Cv {
  const o = new Cv(FR, FR);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    const cnt = new Map<string, { n: number; col: C }>(); let op = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      if (!c.has(x * 2 + i, y * 2 + j)) continue; op++;
      const col = c.get(x * 2 + i, y * 2 + j), k = col.join(","); const e = cnt.get(k); if (e) e.n++; else cnt.set(k, { n: 1, col });
    }
    if (op < 2) continue;
    let best: { n: number; col: C } | null = null;
    for (const e of cnt.values()) if (!best || e.n > best.n || (e.n === best.n && e.col[0] + e.col[1] + e.col[2] > best.col[0] + best.col[1] + best.col[2])) best = e;
    o.set(x, y, best!.col);
  }
  o.outline(OUTL);
  return o;
}
export const flip = (c: Cv): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(c.w - 1 - x, y, c.get(x, y)); return o; };
const DUST = R("#4a4a52", "#6a6c74", "#90939a", "#b8bcc2");

/** Ломаная молнии: середины отрезков смещаются поперёк (рекурсивно). */
function boltPath(a: V2, b: V2, seed: number, rough: number, depth = 4): V2[] {
  let pts: V2[] = [a, b];
  for (let d = 0; d < depth; d++) {
    const out: V2[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n = nrm(perpOf([q[0] - p[0], q[1] - p[1]]));
      out.push(add(lerp(p, q, 0.5), n, (hash(seed * 7.13 + d * 3.31 + i * 1.71, seed * 0.37 + i) - 0.5) * len * rough), q);
    }
    pts = out;
  }
  return pts;
}

/** Один кадр 80×80: рисунок + свечение (emis). */
export function renderFrame(view: ViewId, pose: Pose): { img: Cv; emis: Cv } {
  const f = view === "side" ? renderSide(pose) : renderFront(pose, view === "back");
  let big = f.img;
  if (Math.abs(pose.tilt) > 1e-3 || pose.sy !== 1) big = rotCv(big, pose.tilt * (view === "side" ? 1 : view === "front" ? 0.25 : -0.25), 40 * Z, 76 * Z, pose.sy);
  const o = down(big), emis = new Cv(FR, FR);
  const ok = (x: number, y: number) => x >= 1 && y >= 1 && x <= FR - 2 && y <= FR - 2;
  const put = (x: number, y: number, col: C, glow = true) => { x = Math.round(x); y = Math.round(y); if (!ok(x, y)) return; o.set(x, y, col); if (glow) emis.set(x, y, col); };
  const glowOnly = (x: number, y: number, col: C) => { x = Math.round(x); y = Math.round(y); if (ok(x, y) && !emis.has(x, y)) emis.set(x, y, col); };
  const hs = (a: number, b: number) => hash(a + pose.seed * 13.7, b + pose.seed * 3.1);
  const tl = Math.abs(pose.tilt) < 0.3;
  // молнии: сначала ореол и кромка всех веток, затем ядра — ядро не перекрывается чужой кромкой
  const bolts: { pts: V2[]; w: number }[] = [];
  const addBolt = (a: V2, b: V2, seed: number, w: number, rough = 0.45, depth = 4, branches = 0) => {
    const pts = boltPath(a, b, seed, rough, depth); bolts.push({ pts, w });
    for (let k = 0; k < branches; k++) {
      const i = Math.floor(pts.length * (0.25 + 0.5 * hash(seed, k + 3))), s = pts[i], d = nrm([b[0] - a[0], b[1] - a[1]]);
      const side = hash(k, seed) > 0.5 ? 1 : -1, len = Math.hypot(b[0] - a[0], b[1] - a[1]) * (0.18 + 0.15 * hash(seed + 1, k));
      const e = add(s, nrm(add(d, perpOf(d), side * 0.9)), len);
      bolts.push({ pts: boltPath(s, e, seed + 17 + k, 0.5, 3), w: Math.max(1, w - 0.6) });
    }
  };
  const flushBolts = () => {
    for (const b of bolts) for (let i = 0; i < b.pts.length - 1; i++) {
      const p = b.pts[i], q = b.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 2));
      for (let s = 0; s <= n; s++) {
        const x = p[0] + ((q[0] - p[0]) * s) / n, y = p[1] + ((q[1] - p[1]) * s) / n, r = b.w + 1.2;
        for (let j = -3; j <= 3; j++) for (let ii = -3; ii <= 3; ii++) { const d = Math.hypot(ii, j); if (d <= r) glowOnly(x + ii, y + j, LT[0]); }
        for (let j = -2; j <= 2; j++) for (let ii = -2; ii <= 2; ii++) { const d = Math.hypot(ii, j); if (d <= b.w) put(x + ii, y + j, d > b.w - 0.6 ? LT[1] : LT[2]); }
      }
    }
    for (const b of bolts) for (let i = 0; i < b.pts.length - 1; i++) {
      const p = b.pts[i], q = b.pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) * 2));
      for (let s = 0; s <= n; s++) {
        const x = p[0] + ((q[0] - p[0]) * s) / n, y = p[1] + ((q[1] - p[1]) * s) / n;
        put(x, y, LT[4]);
        if (b.w >= 1.4) { put(x + 0.5, y, LT[3]); put(x, y + 0.5, LT[3]); }
      }
    }
    bolts.length = 0;
  };
  const H = f.ham, hd = H.head;
  // руна на бойке (светится всегда), глаза
  if (tl) {
    const rr: V2[] = [add(add(hd, H.u, -H.hh + 1.2), H.perp, -0.8), add(hd, H.perp, 0.8), add(add(hd, H.u, H.hh - 1.2), H.perp, -0.4)];
    for (let i = 0; i < rr.length - 1; i++) for (let t = 0; t <= 1; t += 0.2) { const q = lerp(rr[i], rr[i + 1], t); put(q[0], q[1], pose.bolt > 0.9 ? LT[4] : LT[3]); glowOnly(q[0] + 1, q[1], LT[1]); glowOnly(q[0] - 1, q[1], LT[1]); }
    for (const e of f.eyes) { put(e[0], e[1], EYE2); glowOnly(e[0] + 1, e[1], EYE); glowOnly(e[0], e[1] - 1, EYE); }
  }
  // треск на бойке
  if (pose.bolt > 0.05 && tl) {
    const n = Math.floor(pose.bolt * 2.2 + hs(1, 2));
    for (let i = 0; i < n; i++) {
      const s = hs(i, 5) > 0.5 ? 1 : -1, along = (hs(i, 7) - 0.5) * 2 * H.hh;
      const st = add(add(hd, H.perp, s * (H.hl + 0.5)), H.u, along);
      const a = Math.atan2(H.perp[1] * s, H.perp[0] * s) + (hs(i, 9) - 0.5) * 2.2;
      addBolt(st, add(st, [COS(a), SIN(a)], 3.5 + 4.5 * pose.bolt * (0.5 + hs(i, 11))), pose.seed * 5 + i, 1, 0.6, 3);
    }
    for (let i = 0; i < Math.round(3 * pose.bolt); i++) { const a = hs(i, 13) * 2 * PI, r = H.hl + 2 + hs(i, 15) * 5; const x = hd[0] + COS(a) * r, y = hd[1] + SIN(a) * r; put(x, y, LT[4]); put(x + 1, y, LT[3]); put(x, y + 1, LT[2]); }
  }
  // удар с неба в молот
  if (pose.sky > 0.05) {
    const top = H.top, x0 = clamp(top[0] + (hs(3, 3) - 0.5) * 14, 3, 76);
    addBolt([x0, 1], top, pose.seed * 11 + 3, 1.6, 0.35, 5, 2);
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const d = Math.hypot(i, j), r = 2.5 + 2 * pose.sky; if (d <= r) { if (d < r * 0.5) put(top[0] + i, top[1] + j, LT[4]); else glowOnly(top[0] + i, top[1] + j, LT[2]); } }
  }
  // цепная молния: от бойка вперёд, на развилке делится на три
  if (pose.arc > 0.05) {
    const fw = f.fwd, st = H.top, k = pose.arc;
    const split = add(st, fw[1] === 0 ? [fw[0] * 12, 3] : [st[0] > 40 ? 2 : -2, fw[1] * 14], k);
    addBolt(st, split, pose.seed * 3 + 1, 1.6, 0.4, 3);
    const ends: V2[] = fw[1] === 0 ? [[2, st[1] - 6], [2, st[1] + 12], [6, st[1] + 30]] : fw[1] > 0 ? [[clamp(st[0] - 8, 3, 76), 77], [clamp(st[0] + 6, 3, 76), 77], [clamp(st[0] + 10, 3, 76), 62]] : [[clamp(st[0] - 10, 3, 76), 2], [clamp(st[0] + 8, 3, 76), 2], [clamp(st[0] - 12, 3, 76), 18]];
    ends.forEach((e, i) => { const end = lerp(split, e, clamp((k - 0.25) / 0.75, 0, 1)); if (k > 0.3) { addBolt(split, end, pose.seed * 9 + i * 5, 1.2, 0.45, 4); for (let q = 0; q < 4; q++) { const a = q * PI / 2 + pose.seed; put(end[0] + COS(a) * 2, end[1] + SIN(a) * 2, LT[3]); } put(end[0], end[1], LT[4]); } });
  }
  // гроза: удары с неба вокруг
  if (pose.storm > 0.05) {
    const n = Math.round(1 + 2 * pose.storm);
    for (let i = 0; i < n; i++) {
      const sd = (i + pose.seed) % 2 ? 1 : -1, x = 40 + sd * (24 + hs(i, 31) * 13), y1 = 66 + hs(i, 33) * 9;
      addBolt([x - sd * hs(i, 35) * 8, 1], [x, y1], pose.seed * 13 + i * 7, 1.1, 0.35, 4, 1);
      for (let a = 0; a < 16; a++) { const t = (a / 16) * 2 * PI; if (hs(a, i) < 0.7) put(x + COS(t) * 4, y1 + SIN(t) * 1.3, a % 2 ? LT[2] : LT[3]); }
    }
  }
  // громоотводы: молния ползёт по земле от кулака и бьёт вверх в трёх местах
  if (pose.pillars > 0.05) {
    const fp: V2 = [f.fist[0], 74], k = pose.pillars;
    const spots: V2[] = view === "side" ? [[6, 74], [20, 72], [66, 75]] : [[8, 73], [40, 77], [72, 73]];
    spots.forEach((sp, i) => {
      addBolt(fp, lerp(fp, sp, clamp(k * 1.6, 0, 1)), pose.seed * 17 + i, 1, 0.35, 3);
      if (k > 0.5) { const h = 60 * clamp((k - 0.5) * 2.4, 0, 1); addBolt([sp[0], sp[1]], [sp[0] + (hs(i, 41) - 0.5) * 4, sp[1] - h], pose.seed * 19 + i * 3, 1.5, 0.3, 4, 1); }
    });
  }
  // кольцо удара по земле
  if (pose.shock > 0.02) {
    const ctr: V2 = pose.shockAt < 0.5 ? [hd[0], 74] : [f.fist[0], 74], r = 4 + 32 * pose.shock, ry = 0.3, fade = pose.shock > 0.7;
    for (let a = 0; a < 120; a++) {
      const t = (a / 120) * 2 * PI, x = ctr[0] + COS(t) * r, y = ctr[1] + SIN(t) * r * ry;
      if (hs(a >> 2, 51) < 0.82 - 0.3 * pose.shock) { put(x, y, fade ? LT[1] : LT[3]); put(x, y + 1, fade ? LT[0] : LT[2]); glowOnly(x, y - 1, LT[1]); }
    }
    if (pose.shock < 0.75) for (let i = 0; i < 6; i++) { const t = hs(i, 53) * 2 * PI, b: V2 = [ctr[0] + COS(t) * r, ctr[1] + SIN(t) * r * ry]; addBolt(b, [b[0] + (hs(i, 55) - 0.5) * 4, b[1] - 4 - 6 * (1 - pose.shock)], pose.seed * 23 + i, 1, 0.5, 2); }
    if (pose.shock < 0.3) for (let j = -3; j <= 3; j++) for (let i = -6; i <= 6; i++) if ((i / 6) ** 2 + (j / 3) ** 2 <= 1) put(ctr[0] + i, ctr[1] + j * 0.6, Math.abs(i) < 3 ? LT[4] : LT[3]);
  }
  flushBolts();
  // вспышка у бойка
  if (pose.flash > 0.05) {
    const k = pose.flash, L = Math.round(6 * k);
    for (let q = -L; q <= L; q++) for (const v of [H.u, H.perp]) { const x = hd[0] + v[0] * q, y = hd[1] + v[1] * q; put(x, y, Math.abs(q) < L * 0.5 ? LT[4] : LT[3]); put(x + 1, y, LT[2]); }
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.hypot(i, j) <= 2) put(hd[0] + i, hd[1] + j, LT[4]);
  }
  // оглушение: искры кружат над короной
  if (pose.stars > 0.05) { const hp = f.head; for (let i = 0; i < 3; i++) { const a = pose.seed * 0.8 + i * 2.1, x = hp[0] + COS(a) * 8, y = hp[1] + SIN(a) * 2.2; put(x, y, LT[4]); put(x + 1, y, LT[3]); for (const [i2, j2] of [[-1, 0], [2, 0], [0, -1], [1, 1], [0, 1], [1, -1]]) put(x + i2, y + j2, LT[2]); } }
  // пыль
  const puff = (x: number, y: number, k: number) => { for (let i = 0; i < 16 * k; i++) { const a = hash(i, x) * 6.28, r = hash(y, i) * 6 * k + 1; put(x + COS(a) * r * 1.4, y - Math.abs(SIN(a)) * r * 0.9, DUST[(i % 3) + 1], false); } };
  if (pose.dust[0] > 0.05) puff(f.feet[0] + 9, 75, pose.dust[0]);
  if (pose.dust[1] > 0.05) puff(f.feet[0] - 9, 75, pose.dust[1]);
  for (let k = 0; k < FR; k++) for (const [x, y] of [[0, k], [FR - 1, k], [k, 0], [k, FR - 1]] as V2[]) if (o.has(x, y) && o.get(x, y).join() !== OUTL.join()) o.set(x, y, OUTL);
  return { img: o, emis };
}

// ---------------- анимации ----------------
const easeIO = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
function blend(a: Pose, b: Pose, t: number): Pose {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    const x = a[k] as unknown, y = b[k] as unknown;
    if (typeof x === "number") o[k] = x + ((y as number) - x) * t;
    else if (Array.isArray(x)) o[k] = (x as number[]).map((v, i) => v + ((y as number[])[i] - v) * t);
  }
  return o as unknown as Pose;
}
const P = (o: Partial<Pose>) => o;
const keyed = (keys: { f: number; p: Partial<Pose> }[], n: number, extra?: (i: number, p: Pose) => Partial<Pose>): Pose[] => {
  const out: Pose[] = [];
  for (let i = 0; i < n; i++) {
    let a = keys[0], b = keys[keys.length - 1];
    for (let k = 0; k < keys.length - 1; k++) if (i >= keys[k].f && i <= keys[k + 1].f) { a = keys[k]; b = keys[k + 1]; break; }
    const t = a.f === b.f ? 0 : easeIO((i - a.f) / (b.f - a.f));
    const q = blend({ ...REST, ...a.p }, { ...REST, ...b.p }, t);
    q.shockAt = (t < 0.5 ? { ...REST, ...a.p } : { ...REST, ...b.p }).shockAt;
    q.seed = i;
    out.push(extra ? { ...q, ...extra(i, q) } : q);
  }
  return out;
};
const loop = (n: number, f: (ph: number, i: number) => Partial<Pose>): Pose[] => Array.from({ length: n }, (_, i) => ({ ...REST, seed: i, ...f((2 * PI * i) / n, i) }));
const TR = [0, 1, 0, -1];

// замахи и стойки умений
const HAM_UP = P({ hh: [8, -22], ha: 1.25, two: 1, lean: 0.02, bob: -1, head: [1, -0.5], bolt: 1.3, legB: [1.5, 0] });
const CHAIN_UP = P({ hh: [6, -10], ha: -0.75, gh: [-4, -18], lean: 0.06, bob: -0.5, head: [0.5, -1], bolt: 1.6, legA: [-1.5, 0] });
const ROD_UP = P({ gh: [-10, -30], hh: [3, 2], ha: -0.1, lean: 0.04, bob: -1, head: [0, -1], bolt: 0.9 });
const STORM_UP = P({ hh: [8, -20], ha: 1.0, two: 0, gh: [-6, -26], lean: -0.02, bob: -1.5, head: [1, -1.5], bolt: 2 });

export type ColossusAnim = "idle" | "walk" | "attack" | "hammerWind" | "hammerHold" | "hammerStrike" | "chainWind" | "chainHold" | "chainCast"
  | "rodWind" | "rodHold" | "rodStrike" | "stormWind" | "stormHold" | "stormCast" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: ColossusAnim; hit?: number };
const POSES: Record<ColossusAnim, () => Pose[]> = {
  idle: () => loop(12, (ph, i) => ({ bob: 0.6 * SIN(ph), head: [0, 0.5 * SIN(ph - 0.6)], hh: [0.4 * SIN(ph + 1), 0.7 * SIN(ph)], gh: [0, 0.6 * SIN(ph - 1)], sw: 0.8 * SIN(ph + 0.5), bolt: 0.45 + 0.35 * (i % 3 === 0 ? 1 : 0.4 + 0.3 * SIN(ph * 2)), lean: 0.1 + 0.012 * SIN(ph) })),
  walk: () => loop(12, (f) => ({
    legA: [-3.4 * COS(f), -2.6 * Math.max(0, SIN(f))], legB: [3.4 * COS(f), -2.6 * Math.max(0, -SIN(f))],
    bob: 0.9 * COS(2 * f) - 0.3, lean: 0.14 + 0.02 * COS(f), head: [0.4 * COS(f), -0.4 * COS(2 * f)],
    hh: [2.2 * COS(f), -1 + 0.8 * SIN(2 * f)], ha: -0.28 + 0.06 * COS(f), gh: [-2.8 * COS(f), 0], sw: 2 * SIN(f), bolt: 0.6,
  })),
  attack: () => keyed([
    { f: 0, p: {} },
    { f: 2, p: P({ hh: [8, -10], ha: 0.6, lean: 0.06, head: [1, -0.5], bolt: 0.9 }) },
    { f: 4, p: P({ hh: [10, -18], ha: 1.4, lean: 0.03, head: [1.5, -1], bolt: 1.2, legB: [1.5, 0] }) },
    { f: 6, p: P({ hh: [8, -2], ha: -2.3, lean: 0.3, head: [-2, 1.5], bob: 1, legA: [-3, 0], bolt: 1.6, flash: 0.8, dust: [0, 0.6] }) },
    { f: 8, p: P({ hh: [8, -2], ha: -1.9, lean: 0.24, head: [-1.5, 1], bolt: 0.9 }) },
    { f: 9, p: {} },
  ], 10),
  hammerWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: HAM_UP }], 4),
  hammerHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...HAM_UP, seed: i, hh: [8, -22 + 0.5 * TR[i]] as V2, bolt: 1.4 + 0.4 * (i % 2), bob: -1 + 0.3 * TR[i] } as Pose)),
  hammerStrike: () => keyed([
    { f: 0, p: HAM_UP },
    { f: 1, p: P({ hh: [3, -14], ha: -0.4, two: 1, lean: 0.15, head: [-0.5, 0], bolt: 1.8 }) },
    { f: 2, p: P({ hh: [9, -3], ha: -2.3, two: 1, lean: 0.36, squat: 2, head: [-3, 2.5], legA: [-3, 0], bolt: 2, flash: 1, shock: 0.12, dust: [0.8, 0.8] }) },
    { f: 4, p: P({ hh: [9, -3], ha: -2.3, two: 1, lean: 0.36, squat: 2, head: [-3, 2.5], legA: [-3, 0], bolt: 1.4, flash: 0.3, shock: 0.4, dust: [0.5, 0.5] }) },
    { f: 6, p: P({ hh: [9, -3], ha: -2.2, two: 0.8, lean: 0.32, squat: 1.5, head: [-2.5, 2], legA: [-3, 0], bolt: 1.2, shock: 0.7 }) },
    { f: 8, p: P({ hh: [7, -2], ha: -1.6, two: 0.3, lean: 0.22, squat: 0.5, bolt: 0.8, shock: 0.95 }) },
    { f: 9, p: P({ bolt: 0.6 }) },
  ], 10, (i) => (i === 9 ? { shock: 0 } : {})),
  chainWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: CHAIN_UP }], 4),
  chainHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...CHAIN_UP, seed: i, bolt: 1.6 + 0.4 * (i % 2), sky: i % 2 ? 1 : 0.5, bob: -0.5 + 0.3 * TR[i], hh: [6, -10 + 0.4 * TR[i]] as V2 } as Pose)),
  chainCast: () => keyed([
    { f: 0, p: { ...CHAIN_UP, sky: 1 } },
    { f: 2, p: P({ hh: [8, -6], ha: -0.95, gh: [2, -6], lean: 0.26, head: [-2, 1], legA: [-3, 0], bolt: 2, arc: 0.45, flash: 0.9 }) },
    { f: 4, p: P({ hh: [8, -6], ha: -0.95, gh: [3, -3], lean: 0.28, head: [-2, 1], legA: [-3, 0], bolt: 1.8, arc: 1, flash: 0.4, dust: [0, 0.4] }) },
    { f: 6, p: P({ hh: [7, -4], ha: -0.8, lean: 0.2, head: [-1, 0.5], bolt: 1.0, arc: 0.6 }) },
    { f: 7, p: P({ bolt: 0.6 }) },
  ], 8, (i) => (i === 7 ? { arc: 0 } : {})),
  rodWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: ROD_UP }], 4),
  rodHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...ROD_UP, seed: i, gh: [-10, -30 + 0.6 * TR[i]] as V2, bolt: 0.9 + 0.5 * (i % 2), bob: -1 + 0.3 * TR[i] } as Pose)),
  rodStrike: () => keyed([
    { f: 0, p: ROD_UP },
    { f: 1, p: P({ gh: [-20, -4], hh: [8, 2], ha: 0.4, lean: 0.15, bend: -0.45, squat: 3, head: [-1, 1], bolt: 1 }) },
    { f: 2, p: P({ gh: [-32, 24], hh: [10, 6], ha: 0.7, lean: 0.1, bend: -0.95, squat: 6, head: [3, 1], legA: [-3, 0], bolt: 1.2, shock: 0.04, shockAt: 1, dust: [0.9, 0.6], pillars: 0.1 }) },
    { f: 4, p: P({ gh: [-32, 24], hh: [10, 6], ha: 0.7, lean: 0.1, bend: -0.95, squat: 6, head: [3, 1], legA: [-3, 0], bolt: 1.2, shock: 0.35, shockAt: 1, pillars: 0.6 }) },
    { f: 6, p: P({ gh: [-22, 12], hh: [8, 4], ha: 0.5, lean: 0.12, bend: -0.6, squat: 3, head: [-2, 2], shock: 0.75, shockAt: 1, pillars: 1 }) },
    { f: 7, p: P({ gh: [-4, 2], lean: 0.12, bend: -0.1, squat: 1, shockAt: 1, pillars: 0.6 }) },
  ], 8, (i) => (i === 7 ? { shock: 0, pillars: 0 } : {})),
  stormWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: STORM_UP }], 4),
  stormHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...STORM_UP, seed: i, sky: i % 2 ? 0.8 : 0, storm: 0.2 + 0.2 * (i % 2), bob: -1.5 + 0.4 * TR[i], gh: [-6, -26 + 0.6 * TR[i]] as V2 } as Pose)),
  stormCast: () => keyed([
    { f: 0, p: { ...STORM_UP, sky: 1 } },
    { f: 2, p: P({ hh: [6, -22], ha: 0.8, gh: [-8, -28], lean: -0.04, bob: -2, head: [1.5, -2], bolt: 2, sky: 1, storm: 0.5, flash: 0.7 }) },
    { f: 4, p: P({ hh: [6, -22], ha: 0.8, gh: [-8, -28], lean: -0.04, bob: -2, head: [1.5, -2], bolt: 2, sky: 0.6, storm: 1 }) },
    { f: 6, p: P({ hh: [7, -21], ha: 0.9, gh: [-7, -27], lean: -0.02, bob: -1.5, head: [1, -1.5], bolt: 1.8, sky: 0.3, storm: 1 }) },
    { f: 8, p: P({ hh: [3, -8], ha: 0.2, gh: [-3, -8], lean: 0.08, bob: -0.5, bolt: 1.2, storm: 0.5 }) },
    { f: 9, p: P({ bolt: 0.7 }) },
  ], 10, (i) => (i === 9 ? { storm: 0, sky: 0 } : {})),
  stun: () => loop(8, (ph) => ({ lean: 0.3, squat: 2, tilt: 0.04 * SIN(ph), head: [-1 + SIN(ph), 3], hh: [12, 2], ha: -2.3, gh: [-2, 4], sw: 1.5 * SIN(ph), legA: [SIN(ph) * 0.6, 0], legB: [-SIN(ph) * 0.6, 0], bolt: 0.2 + 0.2 * (SIN(ph * 3) > 0 ? 1 : 0), stars: 1 })),
  death: () => keyed([
    { f: 0, p: {} },
    { f: 2, p: P({ lean: 0.3, head: [-2, 2], bolt: 2, flash: 0.7, hh: [3, 0], ha: -0.8 }) },
    { f: 5, p: P({ squat: 5, kneel: 0.4, lean: 0.45, head: [-4, 5], hh: [12, 2], ha: -2.3, gh: [-2, 4], bolt: 1, legA: [3, 0], tilt: 0.1 }) },
    { f: 8, p: P({ squat: 9, kneel: 1, lean: 0.6, tilt: 0.25, sy: 0.9, head: [-5, 8], hh: [12, 2], ha: -2.3, bolt: 0.6, dust: [1, 1] }) },
    { f: 11, p: P({ squat: 11, kneel: 1, lean: 0.7, tilt: 0.45, sy: 0.75, head: [-5, 9], hh: [12, 2], ha: -2.3, bolt: 0.2, dust: [0.5, 0.5] }) },
    { f: 13, p: P({ squat: 12, kneel: 1, lean: 0.7, tilt: 0.5, sy: 0.65, head: [-5, 9], hh: [12, 2], ha: -2.3, bolt: 0 }) },
  ], 14),
};
const ANIM_ORDER: [ColossusAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар молотом", hit: 6 }],
  ["hammerWind", { n: 4, fps: 12, loop: false, ru: "молот над плечом", next: "hammerHold" }],
  ["hammerHold", { n: 4, fps: 12, loop: true, ru: "молот трещит", next: "hammerStrike" }],
  ["hammerStrike", { n: 10, fps: 12, loop: false, ru: "молот грома", hit: 2 }],
  ["chainWind", { n: 4, fps: 12, loop: false, ru: "молот к небу", next: "chainHold" }],
  ["chainHold", { n: 4, fps: 12, loop: true, ru: "ловит молнию", next: "chainCast" }],
  ["chainCast", { n: 8, fps: 12, loop: false, ru: "цепная молния", hit: 2 }],
  ["rodWind", { n: 4, fps: 12, loop: false, ru: "кулак вверх", next: "rodHold" }],
  ["rodHold", { n: 4, fps: 12, loop: true, ru: "кулак занесён", next: "rodStrike" }],
  ["rodStrike", { n: 8, fps: 12, loop: false, ru: "громоотводы", hit: 2 }],
  ["stormWind", { n: 4, fps: 12, loop: false, ru: "руки к туче", next: "stormHold" }],
  ["stormHold", { n: 4, fps: 12, loop: true, ru: "зовёт грозу", next: "stormCast" }],
  ["stormCast", { n: 10, fps: 12, loop: false, ru: "гроза", hit: 2 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const COLOSSUS_ANIMS = {} as Record<ColossusAnim, AnimDef>;
{ let col = 0; for (const [k, a] of ANIM_ORDER) { COLOSSUS_ANIMS[k] = { ...a, col }; col += a.n; } }
export const COLOSSUS_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
/** Умения → клипы (для to-game на следующем этапе). */
export const COLOSSUS_SKILLS: Record<string, { windup: [ColossusAnim, ColossusAnim]; strike: ColossusAnim }> = {
  thunder_maul: { windup: ["hammerWind", "hammerHold"], strike: "hammerStrike" },
  split_lightning: { windup: ["chainWind", "chainHold"], strike: "chainCast" },
  lightning_rods: { windup: ["rodWind", "rodHold"], strike: "rodStrike" },
  ridge_storm: { windup: ["stormWind", "stormHold"], strike: "stormCast" },
};
const VIEWS: ViewId[] = ["front", "back", "side"];
/** Поза кадра i анимации a (для превью и проверок). */
export const colossusPose = (a: ColossusAnim, i: number): Pose => POSES[a]()[i];

// ---------------- листы ----------------
const savePng = (c: Cv, f: string) => { const p = new PNG({ width: c.w, height: c.h }); p.data = Buffer.from(c.d); fs.writeFileSync(f, PNG.sync.write(p)); };
function refCrop(root: string, h: number): Cv | null {
  const f = path.join(root, "tools", "out", "bosses139", "ref-02.png");
  if (!fs.existsSync(f)) return null;
  const p = PNG.sync.read(fs.readFileSync(f));
  const x0 = Math.round(p.width * 0.02), x1 = Math.round(p.width * 0.98), y0 = Math.round(p.height * 0.03), y1 = Math.round(p.height * 0.94);
  const sc = (y1 - y0) / h, w = Math.round((x1 - x0) / sc), o = new Cv(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = Math.floor(y * sc); j < Math.max(Math.floor(y * sc) + 1, Math.floor((y + 1) * sc)); j++) for (let i = Math.floor(x * sc); i < Math.max(Math.floor(x * sc) + 1, Math.floor((x + 1) * sc)); i++) { const q = ((y0 + j) * p.width + x0 + i) * 4; r += p.data[q]; g += p.data[q + 1]; b += p.data[q + 2]; n++; }
    o.set(x, y, [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  }
  return o;
}
const blitSub = (dst: Cv, src: Cv, sx: number, sy: number, w: number, h: number, ox: number, oy: number, k = 1) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src.has(sx + x, sy + y)) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) dst.set(ox + x * k + a, oy + y * k + b, src.get(sx + x, sy + y));
};
const GROUND = hx("#6f6a62"), PANEL = hx("#322f38"), NIGHT = hx("#161c34"), BG = hx("#26242b");
function nightTint(c: Cv, x: number, y: number, w: number, h: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (c.has(x + i, y + j)) { const q = c.get(x + i, y + j); c.set(x + i, y + j, [Math.round(q[0] * 0.45), Math.round(q[1] * 0.5), Math.round(q[2] * 0.75)]); } }
const silc = (c: Cv, col: C): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(x, y, col); return o; };

/** Эскиз: покой в трёх видах ×3, ×1, силуэт, ночь со свечением, референс. */
export function writeSketch(root: string, outDir: string): string {
  const rs = (v: ViewId) => renderFrame(v, { ...REST, bolt: 1 });
  const R3 = [rs("front"), rs("back"), rs("side")];
  const frames: Cv[] = [R3[0].img, R3[1].img, R3[2].img, flip(R3[2].img)];
  const c = new Cv(1300, 600); c.rect(0, 0, c.w, c.h, BG);
  label(c, 10, 8, "ЭСКИЗ ВЕЛИКАН ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 2", 2);
  frames.forEach((f, i) => { c.rect(10 + i * 248, 30, 240, 240, GROUND); c.blit(f, 10 + i * 248, 30, 3); });
  const ref = refCrop(root, 240); if (ref) { c.rect(1002, 30, ref.w + 4, 240, PANEL); c.blit(ref, 1004, 30, 1); }
  c.rect(10, 280, 4 * 248 - 8, 90, GROUND); frames.forEach((f, i) => c.blit(f, 10 + i * 248 + 80, 285, 1));
  label(c, 10, 382, "СИЛУЭТ ×2 | НОЧЬ + СВЕЧЕНИЕ ×2", 2);
  c.blit(silc(frames[0], hx("#d8d8e0")), 10, 400, 2); c.blit(silc(frames[2], hx("#d8d8e0")), 180, 400, 2);
  [R3[0], R3[2]].forEach((r, i) => { const x = 380 + i * 170; c.rect(x, 400, 160, 160, NIGHT); c.blit(r.img, x, 400, 2); nightTint(c, x, 400, 160, 160); c.blit(r.emis, x, 400, 2); });
  const out = path.join(outDir, "colossus-sketch.png"); savePng(c, out); return out;
}

export function writeColossusArt(root: string, outDir: string, only?: ColossusAnim[], quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const N = FRAME, FH = FRAME_H;
  const sheet = new Cv(N * COLOSSUS_COLS, FH * 3), glow = new Cv(N * COLOSSUS_COLS, FH * 3);
  const bad: string[] = [];
  for (const [a, d] of ANIM_ORDER) {
    if (only && !only.includes(a)) continue;
    const poses = POSES[a]();
    VIEWS.forEach((v, row) => poses.slice(0, quick ? 1 : d.n).forEach((p, i) => {
      const r = renderFrame(v, p), x0 = (COLOSSUS_ANIMS[a].col + i) * N, y0 = row * FH;
      blitSub(sheet, r.img, 0, 0, N, FH, x0, y0); blitSub(glow, r.emis, 0, 0, N, FH, x0, y0);
      let hits = 0;
      const nz = (x: number, y: number) => r.img.has(x, y) && r.img.get(x, y).join() !== OUTL.join();
      for (let k = 0; k < FH; k++) { if (nz(0, k)) hits++; if (nz(N - 1, k)) hits++; if (nz(k, 0)) hits++; if (nz(k, FH - 1)) hits++; }
      if (hits) bad.push(`${a} ${v} кадр ${i + 1}: ${hits}`);
    }));
  }
  const fSheet = path.join(outDir, "colossus-sheet.png"), fGlow = path.join(outDir, "colossus-glow.png");
  savePng(sheet, fSheet); savePng(glow, fGlow);
  // сравнение «наш | референс»: покой ×3 во всех видах, ×1, ночь со свечением; затем анимации вбок (4 кадра ×2)
  const ref = refCrop(root, 240);
  const shown = ANIM_ORDER.filter(([a]) => !only || only.includes(a));
  const rows = Math.ceil(shown.length / 2), RW = 1360, rowH = 176;
  const c = new Cv(Math.max(RW, 990 + (ref ? ref.w + 12 : 0)), 340 + 40 + rows * rowH);
  c.rect(0, 0, c.w, c.h, BG);
  label(c, 10, 8, "ВЕЛИКАН ПОКОЙ ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 2", 2);
  const idle = (row: number, fl = false): Cv => { const f = new Cv(N, FH); blitSub(f, sheet, 0, row * FH, N, FH, 0, 0); return fl ? flip(f) : f; };
  const idles = [idle(0), idle(1), idle(2), idle(2, true)];
  idles.forEach((f, i) => { c.rect(10 + i * 244, 30, 240, 240, GROUND); c.blit(f, 10 + i * 244, 30, 3); });
  c.rect(10, 280, 4 * 244 - 4, 84, GROUND); idles.forEach((f, i) => c.blit(f, 10 + i * 244 + 80, 282, 1));
  if (ref) { c.rect(990, 30, ref.w + 8, 240, PANEL); c.blit(ref, 994, 30, 1); }
  c.rect(990, 280, 360, 84, NIGHT);
  for (let k = 0; k < 2; k++) { const row = k ? 2 : 0, x = 1000 + k * 100; blitSub(c, sheet, 0, row * FH, N, FH, x, 282); nightTint(c, x, 282, N, FH); blitSub(c, glow, 0, row * FH, N, FH, x, 282); }
  const y0 = 380;
  shown.forEach(([a, d], idx) => {
    const col = idx % 2, row = Math.floor(idx / 2), ox = 10 + col * 680, oy = y0 + row * rowH;
    c.rect(ox, oy, 670, rowH - 6, PANEL);
    label(c, ox + 4, oy + 3, COLOSSUS_ANIMS[a].ru.toUpperCase(), 2);
    const nShow = Math.min(4, d.n), step = (d.n - 1) / Math.max(1, nShow - 1);
    for (let k = 0; k < nShow; k++) {
      const fi = Math.round(k * step), fx = ox + 4 + k * 166;
      c.rect(fx, oy + 18, 162, 150, GROUND);
      blitSub(c, sheet, (COLOSSUS_ANIMS[a].col + fi) * N, 2 * FH, N, FH, fx + 1, oy + 18 - 5, 2);
    }
  });
  const fCmp = path.join(outDir, "r75n-w-compare.png"); savePng(c, fCmp);
  // превью листа: каждая анимация — три ряда (вниз, вверх, вбок), все кадры ×1
  const PW = 16 * 82 + 20, blocks = shown.map(([a, d]) => ({ a, d, lines: Math.ceil(d.n / 16) }));
  const ph = blocks.reduce((s, b) => s + 16 + b.lines * 3 * 82 + 6, 10);
  const pv = new Cv(PW, ph); pv.rect(0, 0, PW, ph, BG);
  let yy = 6;
  for (const b of blocks) {
    label(pv, 10, yy, `${b.d.ru}`.toUpperCase(), 2); yy += 14;
    for (let ln = 0; ln < b.lines; ln++) for (let v = 0; v < 3; v++) {
      for (let k = ln * 16; k < Math.min(b.d.n, ln * 16 + 16); k++) { const x = 10 + (k - ln * 16) * 82; pv.rect(x, yy, 80, 80, GROUND); blitSub(pv, sheet, (COLOSSUS_ANIMS[b.a].col + k) * N, v * FH, N, FH, x, yy); }
      yy += 82;
    }
    yy += 8;
  }
  const fPrev = path.join(outDir, "r75n-w-sheet.png"); savePng(pv, fPrev);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 40).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; } else console.log("  проверки: край кадра чист");
  console.log(`  ${ID}: ${COLOSSUS_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  return [fSheet, fGlow, fCmp, fPrev];
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/sol_storm_colossus.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const out = path.join(root, "tools", "out", "bosses139"), t = Date.now();
  if (process.argv.includes("--sketch")) console.log("  эскиз:", writeSketch(root, out));
  else {
    const onlyArg = process.argv.find((a) => a.startsWith("--only="));
    const only = onlyArg ? (onlyArg.slice(7).split(",") as ColossusAnim[]) : undefined;
    const files = writeColossusArt(root, out, only, process.argv.includes("--quick"));
    console.log(`  ${files.length} файлов`);
  }
  console.log(`  ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
