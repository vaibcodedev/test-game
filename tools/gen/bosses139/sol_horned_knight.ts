/**
 * Задача 139, босс кольца: рогатый тёмный рыцарь с секирой (запад, слот r79s, ур. 79, группа 5; референс 03 — только для сравнения: чужой арт в игру и в git не идёт).
 * Метод — как у Гурдана и Мидаса: 2D-пиксель-арт слоями-штампами, тело в 2× (160×160) сводится в кадр 80×80, ступни y=76,
 * контур 1 px — тёмный тон соседнего материала; общий код — mino_lib.ts. Руки по IK, секира — вектор в «3D» (вперёд, вверх, вбок)
 * с проекцией на три вида; вихрь — смена видов по кругу (вниз → вбок → вверх → зеркало) со шлейфом и спиралью ветра.
 * Виды: вниз, вверх, вбок (строки листа), влево — зеркало вбок (в игре).
 *
 * Запуск (низкий приоритет, под замком tools/out/scenario.lock):
 *   npx tsx tools/gen/bosses139/sol_horned_knight.ts --sketch          → tools/out/bosses139/knight-sketch.png
 *   npx tsx tools/gen/bosses139/sol_horned_knight.ts [--quick] [--only=idle,walk]
 *     → knight-sheet.png, knight-glow.png, r79s-w-compare.png («наш | референс 03»), r79s-w-sheet.png (превью листа)
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { C, Cv, F, Mk, hash, hx, label, paint } from "./mino_lib";
F["0"] ??= "111,101,101,101,111"; F["6"] ??= "011,100,111,101,111"; F["9"] ??= "111,101,111,001,110"; F["7"] ??= "111,001,010,010,010"; F["8"] ??= "111,101,111,101,111";
F["Щ"] ??= "101,101,101,111,001";

export const ID = "sol_horned_knight";
export const FRAME = 80;
export const FRAME_H = 80;
const Z = 2, W = 160, FR = 80;
const PI = Math.PI, SIN = Math.sin, COS = Math.cos;
type V2 = [number, number];

// ---------------- палитры (свои: воронёная сталь Предела, медь кромок, лоза и мох Хребта, бледно-зелёный огонь в шлеме) ----------------
const R = (...s: string[]): C[] => s.map(hx);
/** Латы: воронёная сталь с холодным бликом. */
const STEEL = R("#07080b", "#101318", "#1a1f26", "#272e37", "#39434e", "#566370", "#8796a2");
/** Медная кромка лат. */
const TRIM = R("#150c07", "#2a180c", "#432a16", "#5e3d22", "#7a5530");
/** Лезвие: светлая сталь. */
const BLADE = R("#14171c", "#262b33", "#3f4751", "#636e7a", "#95a1ac", "#cdd7de");
const ANTLER = R("#0e0c0b", "#1d1916", "#2e2823", "#433a32", "#5c5045", "#7d6e5e");
const VINE = R("#10110a", "#222614", "#353b1e", "#4b5228", "#646c34");
const LEAF = R("#0a1810", "#133020", "#1f4c33", "#2f6a46", "#4a8c5e");
const MOSS = R("#0d1208", "#19230f", "#283616", "#3a4c1f", "#536628");
const CLOTH = R("#0b0c0a", "#161a13", "#22281c", "#2f3726", "#404a33");
const LEATH = R("#140b07", "#28160d", "#3f2414", "#5a361f", "#77502e");
const WOOD = R("#120b06", "#24170d", "#3a2615", "#54391f", "#6f4f2c");
/** Огонь в шлеме и рунах секиры. */
const GL = R("#0c3a24", "#16703f", "#2fb866", "#8cf2b0", "#e8fff0");
const EYE = hx("#3cf07c"), EYE2 = hx("#d8ffe6");
/** Ветер вихря: грозовая серость → бледная кромка. */
const WIND = R("#2a3436", "#4a5a5c", "#7a8e8c", "#b4c8c0", "#e6f2ec");
const DUST = R("#3e3a36", "#5c5650", "#7e7770", "#a49c92");

// ---------------- маски в координатах 1×, рисуются в сетке 2× ----------------
class Mz extends Mk {
  constructor() { super(W, W); }
  private fill(x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean) {
    const a = Math.max(0, Math.floor(x0)), b = Math.min(W - 1, Math.ceil(x1)), c = Math.max(0, Math.floor(y0)), d = Math.min(W - 1, Math.ceil(y1));
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (inside(x + 0.5, y + 0.5)) this.set(x, y);
  }
  L(a: V2, b: V2, t0: number, t1 = t0) { this.line(a[0] * Z, a[1] * Z, b[0] * Z, b[1] * Z, t0 * Z, t1 * Z); return this; }
  B(a: V2, c: V2, b: V2, t0: number, t1 = t0) { this.bez([a[0] * Z, a[1] * Z], [c[0] * Z, c[1] * Z], [b[0] * Z, b[1] * Z], t0 * Z, t1 * Z); return this; }
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
const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const bezP = (a: V2, c: V2, b: V2, u: number): V2 => [(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]];
const px2 = (c: Cv, p: V2, col: C) => { const x = Math.floor(p[0]) * Z, y = Math.floor(p[1]) * Z; c.set(x, y, col); c.set(x + 1, y, col); c.set(x, y + 1, col); c.set(x + 1, y + 1, col); };
const LIGHT: V2 = [-0.6, -0.8];
/** Корпус выше ног на 2 px (длинные ноги рыцаря); у бёдер — плавно. */
const yo = (y: number) => (y < 46 ? -2 : y < 50 ? (-2 * (50 - y)) / 4 : 0);

// ---------------- части ----------------
/** Латная пластина: объём по рампе + тёмный кант 1 px (в 1×) с теневой стороны — части не сливаются друг с другом. */
function plate(c: Cv, m: Mk, bias = 0, amp = 2, dome = 3): Int16Array {
  const d = paint(c, m, STEEL, { amp, dome, dith: 0.05, bias });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const v = d[y * W + x]; if (!v || v > 2) continue;
    if (!m.has(x + 2, y) || !m.has(x, y + 2) || !m.has(x + 2, y + 2)) c.set(x, y, v === 1 ? STEEL[0] : STEEL[1]);
  }
  return d;
}
/** Отбивка: части ближней руки (вид вбок) отделяются от кирасы тёмным ободом 1 px (в 1×) и падающей тенью вниз-вправо. */
let HALO = false;
function halo(c: Cv, m: Mk) {
  if (!HALO) return;
  const out: number[] = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (m.has(x, y) || !c.has(x, y)) continue;
    let near = false, shade = false;
    for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2; i++) if (m.has(x + i, y + j)) { near = true; break; }
    if (!near) for (const [i, j] of [[-3, -3], [-4, -2], [-2, -4], [-4, -4]]) if (m.has(x + i, y + j)) { shade = true; break; }
    if (near) out.push(x, y, 0); else if (shade) out.push(x, y, 1);
  }
  for (let k = 0; k < out.length; k += 3) { const x = out[k], y = out[k + 1]; if (out[k + 2] === 0) c.set(x, y, STEEL[0]); else { const q = c.get(x, y); c.set(x, y, [Math.round(q[0] * 0.55), Math.round(q[1] * 0.55), Math.round(q[2] * 0.6)]); } }
}
/** Медная кромка по верхнему (освещённому) краю пластины. */
function trimTop(c: Cv, m: Mk, d: Int16Array, depth = 3) {
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    if (!m.has(x, y)) continue; const v = d[y * W + x];
    if (v <= 2 && !m.has(x, y - depth)) c.set(x, y, v === 1 ? TRIM[2] : (x >> 1) % 3 === 0 ? TRIM[4] : TRIM[3]);
  }
}
/** Блик-дуга на выпуклой пластине. */
function spec(c: Cv, ctr: V2, rx: number, ry: number, a0: number, a1: number, col = STEEL[6], col2 = STEEL[5]) {
  const n = Math.max(3, Math.round(Math.abs(a1 - a0) * Math.max(rx, ry)));
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; px2(c, [ctr[0] + COS(a) * rx, ctr[1] + SIN(a) * ry], i === 0 || i === n ? col2 : col); }
}
const rivet = (c: Cv, p: V2) => { px2(c, p, STEEL[6]); px2(c, add(p, [0, 1]), STEEL[1]); };
/** Шов между ламами: тёмная линия и светлая кромка под ней (только внутри маски). */
function seam(c: Cv, m: Mk, a: V2, b: V2, mid?: V2) {
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const p = mid ? bezP(a, mid, b, i / n) : lerp(a, b, i / n), x = Math.floor(p[0]) * Z, y = Math.floor(p[1]) * Z;
    if (!m.has(x, y) || !m.has(x, y + 3)) continue;
    c.set(x, y, STEEL[0]); c.set(x + 1, y, STEEL[0]); c.set(x, y + 1, STEEL[1]); c.set(x + 1, y + 1, STEEL[1]);
    c.set(x, y + 2, STEEL[5]); c.set(x + 1, y + 2, STEEL[5]); c.set(x, y + 3, STEEL[4]); c.set(x + 1, y + 3, STEEL[4]);
  }
}
/** Мох: рваное пятно с объёмом. */
function moss(c: Cv, ctr: V2, rx: number, ry: number, seed: number, bias = 0) {
  const pts: V2[] = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * PI, k = i % 2 ? 0.65 + 0.25 * hash(i, seed) : 1 + 0.2 * hash(seed, i); pts.push([ctr[0] + COS(a) * rx * k, ctr[1] + SIN(a) * ry * k]); }
  const m = M().P(pts); const d = paint(c, m, MOSS, { amp: 1.5, dome: 2, dith: 0.25, bias });
  for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) if (m.has(x, y) && d[y * W + x] > 1 && hash(x >> 1, y >> 1 ^ seed) < 0.16) { const col = MOSS[4]; c.set(x, y, col); c.set(x + 1, y, col); c.set(x, y + 1, col); c.set(x + 1, y + 1, col); }
}
/** Лист плюща: ромб 3–4 px с жилкой. */
function leaf(c: Cv, p: V2, dir: V2, s = 1, bias = 0) {
  const d = nrm(dir), n = perpOf(d);
  const m = M().P([p, add(add(p, d, 1.3 * s), n, 1.25 * s), add(p, d, 2.8 * s), add(add(p, d, 1.3 * s), n, -1.25 * s)]);
  paint(c, m, LEAF, { amp: 2.2, dome: 1, dith: 0, bias });
}
/** Лоза: кривая Безье 1–1.6 px, листья через шаг. */
function vine(c: Cv, a: V2, ctl: V2, b: V2, w = 1.3, leaves: number[] = [], seed = 0, bias = 0) {
  const m = M().B(a, ctl, b, w, w * 0.8); paint(c, m, VINE, { amp: 1.8, dome: 1, dith: 0, bias });
  // тонкая светлая кромка сверху — читается «шнуром»
  for (let i = 0; i <= 30; i++) { const q = bezP(a, ctl, b, i / 30), x = Math.floor(q[0]) * Z, y = Math.floor(q[1]) * Z; if (m.has(x, y - 1) && !m.has(x, y - 2 - Math.round(w))) c.set(x, y - 1, VINE[4]); }
  leaves.forEach((t, i) => { const q = bezP(a, ctl, b, t), side = (i + seed) % 2 ? 1 : -1, tg = nrm([bezP(a, ctl, b, Math.min(1, t + 0.05))[0] - q[0], bezP(a, ctl, b, Math.min(1, t + 0.05))[1] - q[1]]); leaf(c, q, add(perpOf(tg), [0, 0.9], side), 0.95 + 0.3 * hash(i, seed), bias + (side < 0 ? 0.3 : -0.1)); });
}
const limbPlate = (c: Cv, a: V2, b: V2, t0: number, t1: number, bias = 0) => { const m = M().L(a, b, t0, t1); return { m, d: plate(c, m, bias, 2, 2) }; };
function ik2(s: V2, f: V2, l1: number, l2: number, pole: V2): V2 {
  let dx = f[0] - s[0], dy = f[1] - s[1], d = Math.hypot(dx, dy) || 0.01;
  const mx = l1 + l2 - 0.05;
  if (d > mx) { f = [s[0] + (dx * mx) / d, s[1] + (dy * mx) / d]; dx = f[0] - s[0]; dy = f[1] - s[1]; d = mx; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  let pxv = -uy, pyv = ux; if (pxv * pole[0] + pyv * pole[1] < 0) { pxv = -pxv; pyv = -pyv; }
  return [s[0] + ux * a + pxv * h, s[1] + uy * a + pyv * h];
}
const L1 = 10.5, L2 = 11;
const reach = (s: V2, f: V2): V2 => { const d = Math.hypot(f[0] - s[0], f[1] - s[1]); return d > L1 + L2 - 0.05 ? lerp(s, f, (L1 + L2 - 0.05) / d) : f; };

/** Наплечник: три ламы снизу вверх, медная кромка, мох. */
function pauldron(c: Cv, ctr: V2, rx: number, ry: number, s: number, bias: number, mossy: boolean, back = false) {
  const all = M().E(ctr, rx, ry);
  for (let k = 2; k >= 1; k--) all.E(add(ctr, [s * 1.2 * k, 3.1 * k]), rx * (1 - 0.12 * k), ry * (0.78 - 0.08 * k));
  halo(c, all);
  for (let k = 2; k >= 1; k--) { const lo = M().E(add(ctr, [s * 1.2 * k, 3.1 * k]), rx * (1 - 0.12 * k), ry * (0.78 - 0.08 * k)); plate(c, lo, bias - 0.15 * k); }
  const m = M().E(ctr, rx, ry); const d = plate(c, m, bias + 0.15, 2.1, 4); trimTop(c, m, d, 3);
  if (!back) spec(c, add(ctr, [-rx * 0.25, -ry * 0.2]), rx * 0.45, ry * 0.4, -2.4, -1.6);
  rivet(c, add(ctr, [s * rx * 0.5, ry * 0.35])); rivet(c, add(ctr, [-s * rx * 0.25, ry * 0.5]));
  if (mossy) moss(c, add(ctr, [-s * 1, -ry * 0.55]), rx * 0.55, ry * 0.3, 3 + s, 0.1);
}
/** Нога в латах: набедренник, наколенник с крылом, поножь, сабатон. mode: 0 спереди, 1 сзади, 2 вбок (носок влево). */
function leg(c: Cv, hip: V2, knee: V2, ank: V2, s: number, bias: number, mode: 0 | 1 | 2, vines = true) {
  const th = limbPlate(c, hip, knee, 7.8, 6.6, bias - 0.05);
  seam(c, th.m, add(lerp(hip, knee, 0.3), [-4, 0]), add(lerp(hip, knee, 0.3), [4, 0]));
  const gr = limbPlate(c, knee, ank, 6.2, 5, bias);
  if (mode !== 1) for (let t = 0.2; t <= 0.85; t += 0.08) { const q = add(lerp(knee, ank, t), mode === 2 ? [-1.6, 0] : [-0.8, 0]); px2(c, q, STEEL[5]); px2(c, add(q, [1, 0]), STEEL[2]); }
  else seam(c, gr.m, add(lerp(knee, ank, 0.35), [-3, 0]), add(lerp(knee, ank, 0.35), [3, 0]));
  // наколенник
  const wing = mode === 2 ? M().E(add(knee, [1.6, 0.4]), 2, 2.8) : M().E(add(knee, [s * 3.2, 0.4]), 2, 2.8);
  plate(c, wing, bias - 0.1, 2, 2);
  const kc = M().E(knee, mode === 2 ? 3.4 : 4, 3.5); const dk = plate(c, kc, bias + 0.3, 2.2, 3); trimTop(c, kc, dk, 2);
  if (mode !== 1) spec(c, add(knee, [-1, -0.8]), 1.6, 1.5, -2.7, -1.6);
  // сабатон
  const a = ank;
  const fp: V2[] = mode === 2 ? [[a[0] - 7.4, a[1] + 4.6], [a[0] - 6.6, a[1] + 2.8], [a[0] - 2.4, a[1] + 0.2], [a[0] + 3, a[1] - 0.2], [a[0] + 3.4, a[1] + 4.6]]
    : mode === 1 ? [[a[0] - 3.8, a[1] - 0.2], [a[0] + 3.8, a[1] - 0.2], [a[0] + 4.2, a[1] + 4.6], [a[0] - 4.2, a[1] + 4.6]]
      : [[a[0] - 3.8, a[1] - 0.2], [a[0] + 3.8, a[1] - 0.2], [a[0] + 4.6, a[1] + 3.4], [a[0] + 2, a[1] + 5], [a[0] - 2, a[1] + 5], [a[0] - 4.6, a[1] + 3.4]];
  const f = M().P(fp); const df = plate(c, f, bias + 0.1, 2, 2);
  if (mode === 2) { seam(c, f, [a[0] - 5, a[1] + 1.4], [a[0] - 5.8, a[1] + 4]); seam(c, f, [a[0] - 2.6, a[1] + 0.6], [a[0] - 3.2, a[1] + 4]); }
  else if (mode === 0) { seam(c, f, [a[0] - 3.6, a[1] + 1.6], [a[0] + 3.6, a[1] + 1.6]); px2(c, [a[0] - 0.5, a[1] + 3.2], STEEL[6]); }
  void df;
  if (vines && mode !== 1) {
    const o = mode === 2 ? -1 : s;
    vine(c, add(lerp(hip, knee, 0.15), [o * 4, 0]), add(lerp(hip, knee, 0.6), [-o * 3, 1]), add(lerp(knee, ank, 0.2), [o * 3.2, 0]), 1.1, [0.3], Math.round(hip[0]));
    vine(c, add(lerp(knee, ank, 0.25), [o * 3, 0]), add(lerp(knee, ank, 0.55), [-o * 3.6, 0]), add(lerp(knee, ank, 0.85), [o * 2.6, 0]), 1.0, [0.6], Math.round(knee[0]) + 1);
  }
}
/** Предплечье в латах и латная перчатка. */
function gauntlet(c: Cv, el: V2, h: V2, bias: number, out: V2, vineOn = false) {
  const d = nrm([h[0] - el[0], h[1] - el[1]]); let n = perpOf(d); if (dot(n, out) < 0) n = [-n[0], -n[1]];
  const v0 = add(el, d, 0.6), v1 = lerp(el, h, 0.78);
  const vm = M().L(v0, v1, 5.8, 5);
  if (HALO) { const hm = M().L(v0, v1, 5.8, 5).D(el, 2.9).D(add(h, d, 0.6), 3.0); hm.L(add(add(v1, n, -3.6), d, -0.2), add(add(v1, n, 3.6), d, 0.4), 2.6); halo(c, hm); }
  plate(c, vm, bias, 2, 2);
  // раструб перчатки
  const cuff = M().L(add(add(v1, n, -3.6), d, -0.2), add(add(v1, n, 3.6), d, 0.4), 2.6); plate(c, cuff, bias + 0.3, 2, 1);
  const cop = M().D(el, 2.9); plate(c, cop, bias + 0.25, 2.2, 2);
  if (vineOn) vine(c, add(v0, n, 3), add(lerp(v0, v1, 0.5), n, -4), add(v1, n, 2.5), 1.0, [0.5], 2);
  const fm = M().D(add(h, d, 0.6), 3.0); plate(c, fm, bias + 0.2, 2.2, 2);
  for (let k = -1; k <= 1; k++) px2(c, add(add(h, d, 2), n, k * 1.3), STEEL[1]);
  px2(c, add(add(h, d, -0.4), n, -1.2), STEEL[6]);
}
/** Наплечный сегмент (плечо). */
const upperArm = (c: Cv, s: V2, el: V2, bias: number) => { const m = M().L(s, el, 6, 5.4); halo(c, m); const d = plate(c, m, bias, 2, 2); seam(c, m, lerp(s, el, 0.55), lerp(s, el, 0.56)); return d; };

/** Секира. scr — экранный вектор древка от кисти к обуху (длина < 1 — ракурс). */
interface Axe { head: V2; u: V2; n: V2; k: number; runes: V2[]; edge: V2 }
function axe(c: Cv, hand: V2, scr: V2, hint: V2, bias = 0): Axe {
  const k = clamp(Math.hypot(scr[0], scr[1]), 0.3, 1), u = nrm(scr); let n = perpOf(u); if (dot(n, hint) < 0) n = [-n[0], -n[1]];
  const LH = 21, PM = 6.5, S = 1.25;
  const top = add(hand, u, LH * k), pom = add(hand, u, -PM * k);
  const hm = M().L(pom, add(top, u, 1.2 * k), 2.3); const dh = paint(c, hm, WOOD, { amp: 1.7, dome: 2, dith: 0.15, bias });
  void dh;
  // лоза вьётся по древку
  for (let t = -4; t <= LH - 5; t += 0.5) { const s = SIN(t * 0.9), q = add(add(hand, u, t * k), n, s * 1.0); if (Math.abs(s) < 0.75) px2(c, q, s > 0 ? VINE[3] : VINE[1]); }
  // обмотка рукояти, навершие
  const grip = M().L(add(hand, u, -3.4 * k), add(hand, u, 2.8 * k), 2.8); const dg = paint(c, grip, LEATH, { amp: 1.5, dome: 2, dith: 0, bias });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (grip.has(x, y) && dg[y * W + x] > 1 && (Math.round(x * u[1] - y * u[0]) + Math.round(x * u[0] + y * u[1])) % 4 === 0) c.set(x, y, LEATH[1]);
  const pc = M().D(pom, 1.7); plate(c, pc, bias + 0.3, 2, 2);
  // обух-цилиндр с обратной стороны и лезвие-полумесяц
  const hc = add(hand, u, (LH - 6.5) * k), kb = Math.max(0.6, k);
  const q = (a: number, b: number): V2 => add(add(hc, n, a * S), u, b * kb * S);
  const poll = M().P([q(-1, -1.7), q(-3.3, -1.5), q(-3.6, 0), q(-3.3, 1.5), q(-1, 1.7)]); const dp = plate(c, poll, bias + 0.2, 2, 2); void dp;
  px2(c, q(-3.2, 0), STEEL[1]);
  const sock = M().P([q(-1.3, -2.8), q(1.6, -3.2), q(1.6, 3.2), q(-1.3, 2.8)]); plate(c, sock, bias + 0.1, 2, 2);
  const bl = M().P([q(1.2, 2.9), q(3.6, 3.6), q(6.4, 6.6), q(7.2, 6.3), q(8.6, 3.6), q(9.3, 0.4), q(8.9, -3.2), q(7.9, -6.2), q(7.0, -8.4), q(4.4, -4.8), q(1.2, -2.9)]);
  const db = paint(c, bl, BLADE, { amp: 2, dome: 3, dith: 0.08, bias: bias - 0.35 });
  // скос лезвия: светлая полоса вдоль режущей кромки
  const nn = n, edgeAt = (x: number, y: number) => !bl.has(Math.round(x + nn[0] * 3.2), Math.round(y + nn[1] * 3.2)) || !bl.has(Math.round(x + nn[0] * 1.6), Math.round(y + nn[1] * 1.6));
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (bl.has(x, y) && edgeAt(x, y) && db[y * W + x] >= 1) {
    const deep = !bl.has(Math.round(x + nn[0] * 1.6), Math.round(y + nn[1] * 1.6));
    const lit = dot(nn, LIGHT) > 0 || y < hc[1] * Z;
    c.set(x, y, deep ? (lit ? BLADE[5] : BLADE[4]) : (lit ? BLADE[4] : BLADE[3]));
  }
  // зазубрина на верхнем роге
  px2(c, q(6.6, 5.6), BLADE[1]);
  // вязь-узор (тёмная гравировка); в ней же светятся руны
  const runes: V2[] = [];
  const knot = (pts: V2[]) => { for (let i = 0; i < pts.length - 1; i++) for (let t = 0; t <= 1; t += 0.25) { const p = lerp(q(...pts[i]), q(...pts[i + 1]), t); px2(c, p, BLADE[1]); runes.push(p); } };
  knot([[2.6, 1.6], [4.4, 3.0], [6.4, 1.2], [5.6, -1.4], [3.6, -2.0], [5.2, -4.0], [6.8, -4.6]]);
  knot([[3.0, -0.6], [4.6, 0.8], [6.6, -1.0]]);
  // лоза на обухе
  for (let t = -2.4; t <= 2.4; t += 0.6) px2(c, q(-0.4 + 0.5 * SIN(t * 2), t), Math.round(t * 2) % 2 ? VINE[3] : VINE[2]);
  return { head: hc, u, n, k, runes, edge: q(9, 0) };
}
/** Рог: основной ствол (Безье) с отростками. */
function antler(c: Cv, base: V2, ctl: V2, tip: V2, tines: [number, V2][], bias: number, hang = true) {
  const m = M().B(base, ctl, tip, 1.8, 0.9);
  for (const [t, off] of tines) { const s = bezP(base, ctl, tip, t), e = add(s, off), mid = add(lerp(s, e, 0.5), nrm(perpOf(off)), 0.5); m.B(s, mid, e, 1.25, 0.75); }
  const d = paint(c, m, ANTLER, { amp: 2.2, dome: 2, dith: 0.05, bias });
  // бороздки
  for (let i = 1; i < 6; i++) { const p = bezP(base, ctl, tip, i / 7); const x = Math.floor(p[0]) * Z, y = Math.floor(p[1]) * Z; if (m.has(x, y) && d[y * W + x] > 1) { c.set(x, y, ANTLER[1]); c.set(x + 1, y, ANTLER[2]); } }
  // лоза свисает с ветви
  if (hang) { const p = bezP(base, ctl, tip, 0.45); for (let j = 0; j < 4; j++) px2(c, add(p, [SIN(j) * 0.6, 1 + j]), j % 2 ? VINE[2] : VINE[3]); leaf(c, add(p, [0.3, 4.6]), [0.2, 1], 0.8, 0.2); }
}
/** Рваная ткань: точки подола справа налево. */
function ragged(x1: number, x0: number, y: number, n: number, amp: number, seed: number, sway = 0): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = x1 + (x0 - x1) * u;
    const deep = i % 2 === 0 ? amp * (0.5 + hash(i, seed)) : -amp * 0.3 * hash(seed, i);
    out.push([x + sway * (0.5 + u) * 0.6, y + deep + SIN(u * PI) * 0.8]);
  }
  return out;
}
function folds(c: Cv, m: Mk, lines: [V2, V2][]) {
  for (const [a, b] of lines) for (let i = 0; i <= 40; i++) {
    const p = lerp(a, b, i / 40), x = Math.round(p[0] * Z), y = Math.round(p[1] * Z);
    if (m.has(x, y) && m.has(x + 2, y)) { c.set(x, y, CLOTH[0]); c.set(x + 1, y, CLOTH[0]); c.set(x + 2, y, CLOTH[4]); c.set(x + 3, y, CLOTH[3]); }
  }
}

// ---------------- поза ----------------
export interface Pose {
  bob: number; squat: number; lean: number; dx: number; tilt: number; sy: number;
  head: V2;
  /** кисть с секирой и свободная — сдвиг от покоя в координатах вида вбок (вперёд — минус x); al — вынос кисти вбок (px) */
  ah: V2; oh: V2; al: number;
  /** секира: ha — угол древка в плоскости вбок (0 — вверх, минус — вперёд), ao — вынос вбок (наружу); two — вторая рука на древке */
  ha: number; ao: number; two: number;
  legA: V2; legB: V2; kneel: number; sw: number; bend: number;
  /** вихрь: spin ≥ 0 — доля оборота (вид по кругу), vortex — спираль ветра, ring — кольцо удара; trail — шлейф от угла tha */
  spin: number; vortex: number; ring: number; tha: number; flat: number;
  /** лозы из земли, натиск, трещина под лезвием, свечение рун, вспышка, глаза, пыль, оглушение, зарастание (гибель) */
  vines: number; rush: number; crack: number; rune: number; flash: number; eye: number; dust: V2; stars: number; grow: number; seed: number;
}
export const REST: Pose = {
  bob: 0, squat: 0, lean: 0.06, dx: 0, tilt: 0, sy: 1, head: [0, 0], ah: [0, 0], oh: [0, 0], al: 0, ha: -2.55, ao: 0.42, two: 0,
  legA: [0, 0], legB: [0, 0], kneel: 0, sw: 0, bend: 0, spin: -1, vortex: 0, ring: 0, tha: 99, flat: 0,
  vines: 0, rush: 0, crack: 0, rune: 0.3, flash: 0, eye: 1, dust: [0, 0], stars: 0, grow: 0, seed: 0,
};
export type ViewId = "side" | "front" | "back";
interface Frame { img: Cv; axe: Axe; hand: V2; pivot: V2; head: V2; feet: V2; eyes: V2[]; fist: V2 }

/** Вектор древка в «3D» → экран вида. */
function axeVec(p: Pose, view: ViewId, hS: number, ha = p.ha) {
  const f0 = -SIN(ha), u0 = COS(ha), l0 = p.ao, L = Math.hypot(f0, u0, l0) || 1, f = f0 / L, up = u0 / L, lat = l0 / L;
  const scr: V2 = view === "side" ? [-f, -up + 0.3 * lat] : view === "front" ? [hS * lat, -up + 0.35 * f] : [hS * lat, -up - 0.35 * f];
  const behind = view === "side" ? lat < -0.3 || scr[0] > 0.55 : view === "front" ? f < -0.3 : f > 0.3;
  return { scr, behind };
}

/** Вид вбок: лицом влево, секира в ближней руке. */
function renderSide(p: Pose): Frame {
  const c = new Cv(W, W), K = p.lean, bs = p.bob + p.squat, sq = p.squat;
  const piv: V2 = [41 + p.dx, 45 + bs];
  const U = (x: number, y: number): V2 => {
    const q: V2 = [x - K * Math.max(0, 45 - y) + p.dx, y + bs + yo(y)];
    if (!p.bend || y >= 45) return q;
    const a = p.bend * clamp((45 - y) / 6, 0, 1), v: V2 = [q[0] - piv[0], q[1] - piv[1]];
    return [piv[0] + v[0] * COS(a) - v[1] * SIN(a), piv[1] + v[0] * SIN(a) + v[1] * COS(a)];
  };
  const Hd = (x: number, y: number): V2 => { const q = U(x, y); return [q[0] + p.head[0], q[1] + p.head[1]]; };
  const sN = U(41.5, 28.5), sF = U(46.5, 27.5);
  const hN = reach(sN, [28.5 + p.ah[0] + p.dx, 46.5 + p.ah[1] + bs * 0.6 + 0.3 * p.al]);
  const av = axeVec(p, "side", 1), k = clamp(Math.hypot(av.scr[0], av.scr[1]), 0.3, 1), u = nrm(av.scr);
  let gT: V2 = [49 + p.oh[0] + p.dx, 46 + p.oh[1] + bs * 0.6];
  if (p.two > 0) gT = lerp(gT, add(hN, u, -5 * k), p.two);
  gT = reach(sF, gT);
  const elF = ik2(sF, gT, L1, L2, [1, 0.6]), elN = ik2(sN, hN, L1, L2, [0.5, 1]);
  const armFront = p.bend < -0.3 || p.two > 0.5;
  const farArm = () => { upperArm(c, sF, elF, -0.9); gauntlet(c, elF, gT, -0.8, [0.6, -0.4]); };
  if (!armFront) farArm();
  // дальний рог
  antler(c, Hd(37, 12.8), Hd(28, 13.4), Hd(31, 6.8), [[0.32, [1, -5]], [0.66, [-2.2, -2.4]]], -0.8, false);
  let A: Axe | null = null;
  if (av.behind) A = axe(c, hN, av.scr, [-1, 0.1], -0.3);
  // ноги
  const lg = (hip: V2, knee: V2, ank: V2, off: V2, bias: number, near: boolean) => {
    const kn = p.kneel, h: V2 = [hip[0] + p.dx, hip[1] + sq + p.bob * 0.3];
    let kk: V2 = [knee[0] - sq * 0.75 + off[0] * 0.5, knee[1] + sq * 0.45 + off[1] * 0.5], a: V2 = [ank[0] + off[0], ank[1] + off[1]];
    if (kn > 0) {
      if (near) { kk = lerp(kk, [h[0] + 3, 70.5], kn); a = lerp(a, [kk[0] + 9, 71.5], kn); }
      else { kk = lerp(kk, [h[0] - 8, h[1] + 3], kn); a = lerp(a, [kk[0] + 1, 71], kn); }
    }
    leg(c, h, kk, a, -1, bias, 2, near);
  };
  lg([44, 46.5], [45.5, 58.5], [46, 71], p.legB, -0.6, false);
  // юбка из лам сзади, задний клапан
  const flapB = M().P([U(45, 43), U(49.5, 43), ...ragged(50 + p.sw * 0.4, 45 + p.sw * 0.4, 55 + sq, 3, 1.6, 9).map(([x, y]) => [x + p.dx, y] as V2)]);
  paint(c, flapB, CLOTH, { amp: 1.3, dome: 2, dith: 0.25, bias: -0.5 });
  lg([38.5, 46.5], [37, 58.5], [37, 71], p.legA, 0, true);
  const fauld = M().P([U(32, 42.5), U(49, 42.5), U(50, 47), U(31, 47.5)]); const dfa = plate(c, fauld, -0.1, 2, 2); trimTop(c, fauld, dfa, 2);
  seam(c, fauld, U(31.5, 44.8), U(49.5, 44.8));
  const tas = M().E(U(39.5, 48), 4.4, 3.8); const dts = plate(c, tas, 0.1, 2, 3); trimTop(c, tas, dts, 2);
  // табард: передний клапан
  const flapF = M().P([U(31.2, 43), U(37.5, 43), ...ragged(37.5 - p.sw * 0.5, 30.2 - p.sw * 0.6, 57 + sq, 4, 1.8, 3).map(([x, y]) => [x + p.dx, y] as V2)]);
  paint(c, flapF, CLOTH, { amp: 1.3, dome: 2, dith: 0.25, bias: 0.1 }); folds(c, flapF, [[U(33.4, 44), [32.8 + p.dx - p.sw * 0.5, 55 + sq]]]);
  moss(c, U(34.5, 44.5), 2.6, 1.2, 8, 0);
  // кираса: грудь вперёд, спина прямая
  const torso = M().P([U(34, 24.5), U(45, 24), U(48, 29), U(47.6, 39), U(45.8, 43), U(34, 43), U(31.6, 36), U(31.6, 29)]);
  const dto = plate(c, torso, 0.05, 2, 6);
  seam(c, torso, U(31.5, 36.5), U(46, 38.5), U(38, 39.5));
  for (let y = 25.5; y < 35; y += 1) px2(c, U(31.8 + (y - 25.5) * 0.02, y), STEEL[5]);
  spec(c, U(35, 30), 2.4, 2, PI, 1.6 * PI);
  for (let x = 34; x < 45; x += 1) px2(c, U(x, 24.6 + (x - 34) * 0.02), x % 3 ? TRIM[3] : TRIM[4]);
  void dto;
  const belt = M().L(U(31, 42), U(48.5, 42), 2.4); const dbl = paint(c, belt, LEATH, { amp: 1.5, dome: 2, dith: 0, bias: 0.2 }); void dbl;
  const bk = M().P([U(30.4, 40.6), U(33.4, 40.8), U(33.4, 43.4), U(30.4, 43.6)]); const dbk = paint(c, bk, TRIM, { amp: 2, dome: 1, dith: 0, bias: 0.3 }); void dbk;
  // лоза поперёк кирасы и на поясе
  vine(c, U(44, 25), U(36, 31), U(34, 41.5), 1.3, [0.25, 0.5, 0.72], 4);
  vine(c, U(31, 41.2), U(40, 44.6), U(48.8, 41.4), 1.2, [0.4], 6);
  moss(c, U(46, 27), 2.6, 1.6, 5, -0.2);
  // плечо, наплечник, горжет, голова
  HALO = true;
  upperArm(c, sN, elN, 0.25);
  pauldron(c, U(42.5, 27), 6.6, 5.6, -1, 0.3, true);
  HALO = false;
  const gor = M().E(U(38.6, 24.6), 4.6, 2.2); const dgo = plate(c, gor, 0.1, 2, 2); trimTop(c, gor, dgo, 2);
  if (armFront) farArm();
  // шлем-ведро в профиль: лицевая пластина слева, щель визора
  const helm = M().E(Hd(38.6, 17), 5, 6.1).P([Hd(33.6, 16.6), Hd(43.6, 16.6), Hd(43.4, 23.4), Hd(34.2, 23.4)]);
  const dhm = plate(c, helm, 0.35, 2.2, 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (helm.has(x, y) && dhm[y * W + x] <= 2 && !helm.has(x, y + 3)) c.set(x, y, TRIM[2 + ((x >> 1) % 2)]);
  spec(c, Hd(38, 15.5), 3.2, 3.6, -2.7, -1.8);
  const eb = Hd(33.8, 17.2);
  for (let x = 0; x < 4; x++) { px2(c, add(eb, [x, 0]), STEEL[0]); px2(c, add(eb, [x, -1]), STEEL[5]); }
  for (let y = 18.6; y < 22.4; y += 1.3) { px2(c, Hd(34.6, y), STEEL[1]); }
  rivet(c, Hd(41.6, 18.6));
  // ближний рог
  antler(c, Hd(41.2, 13), Hd(52, 13.6), Hd(49, 6.6), [[0.3, [-1.2, -5.4]], [0.64, [2.4, -2.4]]], 0.2);
  // ближнее предплечье, секира, кулак
  HALO = true; gauntlet(c, elN, hN, 0.25, [0, -1], true); HALO = false;
  if (!A) A = axe(c, hN, av.scr, [-1, 0.1], 0);
  const fm = M().D(hN, 2.9); plate(c, fm, 0.3, 2.2, 2); for (let kk = -1; kk <= 1; kk++) px2(c, add(add(hN, A.u, kk * 1.2), A.n, -1.6), STEEL[1]);
  return { img: c, axe: A, hand: hN, pivot: sN, head: Hd(38.6, 4), feet: [41 + p.dx, 76], eyes: [add(eb, [0.5, 0]), add(eb, [2, 0])], fist: gT };
}

/** Вид спереди / сзади. Секира — в его левой руке: справа на экране спереди, слева — со спины. */
function renderFront(p: Pose, back: boolean): Frame {
  const c = new Cv(W, W), hS = back ? -1 : 1, gS = -hS, sq = p.squat, bs = p.bob + p.squat;
  const droop = Math.max(-1, (p.lean - 0.06) * 9) * (1 - 0.75 * p.kneel);
  const U = (x: number, y: number): V2 => {
    let yy = y + yo(y) + (y < 30 ? droop * (30 - y) / 20 : 0);
    if (p.bend && y < 45) yy = 45 - (45 - yy) * COS(p.bend * clamp((45 - y) / 6, 0, 1));
    return [x + p.dx, yy + bs];
  };
  const Hd = (x: number, y: number): V2 => { const q = U(x, y); return [q[0] + p.head[0] * 0.25, q[1] + (p.head[1] + Math.max(0, -p.head[0]) * 0.15) * (1 - 0.6 * p.kneel)]; };
  const mapF = (rest: V2, v: V2, s: number, upK = 9): V2 => {
    const up = clamp(-v[1] / 30, 0, 1), fw = Math.max(0, -v[0]), bw = Math.max(0, v[0]);
    return [rest[0] - s * (up * upK + fw * 0.25) + p.dx, rest[1] + v[1] * (v[1] < 0 ? 0.82 : 1) + (back ? -1 : 1) * (fw * 0.2 - bw * 0.15) + bs * 0.6];
  };
  const sH = U(40 + hS * 13, 28.5), sG = U(40 + gS * 13, 28.5);
  let hH = mapF([40 + hS * 16, 46.5], p.ah, hS); hH[0] += hS * p.al;
  hH = lerp(hH, [40 + hS * 3 + p.dx, hH[1]], p.two);
  hH = reach(sH, hH);
  const av = axeVec(p, back ? "back" : "front", hS), k = clamp(Math.hypot(av.scr[0], av.scr[1]), 0.3, 1), u = nrm(av.scr);
  let gT = mapF([40 + gS * 16, 46.5], p.oh, gS);
  if (p.two > 0) gT = lerp(gT, add(hH, u, -5 * k), p.two);
  gT = reach(sG, gT);
  const elH = ik2(sH, hH, L1, L2, [hS, 0.4]), elG = ik2(sG, gT, L1, L2, [gS, 0.3]);
  let A: Axe | null = null;
  if (av.behind) A = axe(c, hH, av.scr, [hS, 0], -0.3);
  // ноги
  for (const s of [-1, 1]) {
    const off = s < 0 ? p.legA : p.legB, oy = off[1] - off[0] * 0.15;
    let a: V2 = [40 + s * 7.2 + p.dx * 0.3, 71 + oy];
    const hip: V2 = [40 + s * 5.2 + p.dx, 46.5 + sq + p.bob * 0.3];
    let knee: V2 = [40 + s * (6.4 + sq * 0.2) + p.dx * 0.6, Math.min(69, 58.5 + sq * 0.7 + oy * 0.5)];
    if (p.kneel > 0) {
      const down = s === (back ? 1 : -1);
      if (down) { knee = lerp(knee, [40 + s * 7 + p.dx, 70.5], p.kneel); a = lerp(a, [knee[0], 72.5], p.kneel); }
      else { knee = lerp(knee, [40 + s * 8 + p.dx, hip[1] + 5], p.kneel); a = lerp(a, [knee[0] + s * 0.5, 71], p.kneel); }
    }
    leg(c, hip, knee, a, s, s === hS ? -0.15 : 0.1, back ? 1 : 0);
  }
  // фартук лам, набедренные щитки, табард
  const fauld = M().P([U(31, 42.5), U(49, 42.5), U(50.4, 47), U(29.6, 47)]); const dfa = plate(c, fauld, back ? -0.3 : -0.1, 2, 2); trimTop(c, fauld, dfa, 2);
  seam(c, fauld, U(28.8, 44.8), U(51.2, 44.8));
  for (const s of [-1, 1]) { const t = M().E(U(40 + s * 8, 48.4), 4.2, 3.8); const d = plate(c, t, (s < 0 ? 0.15 : -0.15) + (back ? -0.2 : 0), 2, 3); trimTop(c, t, d, 2); if (!back) { rivet(c, U(40 + s * 8, 46.5)); spec(c, U(40 + s * 8 - 1, 47.6), 2, 1.6, -2.6, -1.8); } }
  const tab = M().P([U(34.5, 42.6), U(45.5, 42.6), ...ragged(46 + p.sw * 0.3, 34 + p.sw * 0.3, 58.5 + sq, 6, 2.2, back ? 13 : 2, p.sw * 0.5).map(([x, y]) => [x + p.dx, y] as V2)]);
  paint(c, tab, CLOTH, { amp: 1.3, dome: 3, dith: 0.25, bias: back ? -0.3 : 0 });
  folds(c, tab, [[U(37, 44), [36.6 + p.dx + p.sw * 0.3, 56 + sq]], [U(42.5, 44), [43 + p.dx + p.sw * 0.3, 56 + sq]]]);
  if (!back) moss(c, U(39.5, 44.2), 4, 1.3, 11, 0);
  // кираса
  const torso = M().P([U(30, 25), U(50, 25), U(51.6, 31), U(48.4, 42.6), U(31.6, 42.6), U(28.4, 31)]);
  const dto = plate(c, torso, back ? -0.15 : 0.05, 2, 7); void dto;
  if (!back) {
    for (let y = 26; y < 36.5; y += 1) { px2(c, U(39.5, y), STEEL[5]); px2(c, U(40.5, y), STEEL[2]); }
    seam(c, torso, U(30, 35), U(50, 35), U(40, 39.8));
    seam(c, torso, U(30.4, 40.2), U(49.6, 40.2));
    spec(c, U(34.5, 30), 3, 2, PI * 1.05, 1.6 * PI); spec(c, U(45.5, 30), 2.4, 1.6, PI * 1.4, 1.7 * PI, STEEL[5], STEEL[4]);
    for (let x = 33; x <= 47; x++) px2(c, U(x, 25.2 + Math.abs(x - 40) * 0.05), x % 3 ? TRIM[3] : TRIM[4]);
  } else {
    for (let y = 26; y < 41; y += 1) { px2(c, U(39.5, y), STEEL[1]); px2(c, U(40.5, y), STEEL[4]); }
    seam(c, torso, U(29.6, 37.5), U(50.4, 37.5)); seam(c, torso, U(30, 40.4), U(50, 40.4));
    spec(c, U(34, 29.5), 3, 2, PI, 1.5 * PI, STEEL[5], STEEL[4]);
  }
  const belt = M().L(U(31, 42), U(49, 42), 2.4); paint(c, belt, LEATH, { amp: 1.5, dome: 2, dith: 0, bias: back ? -0.1 : 0.2 });
  if (!back) { const bk = M().P([U(37.6, 40.6), U(42.4, 40.6), U(42.4, 43.4), U(37.6, 43.4)]); paint(c, bk, TRIM, { amp: 2, dome: 1, dith: 0, bias: 0.3 }); px2(c, U(39.6, 41.6), TRIM[0]); }
  // лоза и плющ
  if (!back) {
    vine(c, U(30.5, 27.5), U(37.5, 32), U(46, 42.2), 1.6, [0.18, 0.4, 0.62], 1);
    vine(c, U(49.5, 27), U(44.5, 30.5), U(45.2, 38), 1.1, [0.3, 0.55, 0.8], 2);
    vine(c, U(29, 41.4), U(40, 45), U(51, 41.4), 1.2, [0.7], 3);
    moss(c, U(33, 27.6), 2.8, 1.4, 7, 0.1);
  } else {
    vine(c, U(30, 27), U(41, 33), U(49.5, 41.6), 1.3, [0.3, 0.7], 5, -0.2);
    vine(c, U(29, 41.4), U(40, 45), U(51, 41.4), 1.2, [], 3, -0.2);
  }
  // плечи, наплечники
  upperArm(c, sH, elH, back ? -0.3 : -0.1);
  upperArm(c, sG, elG, back ? -0.2 : 0.05);
  for (const s of [-1, 1]) pauldron(c, U(40 + s * 12.6, 26.8), 6.6, 5.2, s, back ? -0.25 : (s < 0 ? 0.1 : -0.1), s === (back ? 1 : -1), back);
  const gor = M().E(U(40, 24.6), 5.8, 2.4); const dgo = plate(c, gor, back ? -0.1 : 0.15, 2, 2); trimTop(c, gor, dgo, 2);
  // рога и шлем
  for (const s of [-1, 1]) antler(c, Hd(40 + s * 4.6, 13.2), Hd(40 + s * 19.5, 14.6), Hd(40 + s * 17, 6.6), [[0.3, [-s * 0.9, -5.4]], [0.64, [s * 2.4, -2.6]]], s < 0 ? 0.25 : -0.2, s === 1);
  const helm = M().E(Hd(40, 17), 5.4, 6.1).P([Hd(34.6, 16.6), Hd(45.4, 16.6), Hd(44.8, 23.4), Hd(35.2, 23.4)]);
  const dhm = plate(c, helm, back ? 0 : 0.3, 2.2, 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (helm.has(x, y) && dhm[y * W + x] <= 2 && !helm.has(x, y + 3)) c.set(x, y, TRIM[2 + ((x >> 1) % 2)]);
  let eyes: V2[] = [];
  if (!back) {
    for (let y = 11.4; y < 16.4; y += 1) { px2(c, Hd(39.5, y), STEEL[6]); px2(c, Hd(40.5, y), STEEL[2]); }
    spec(c, Hd(38, 15.2), 2.6, 3.4, -2.8, -2.0);
    const sl = Hd(36.2, 17);
    for (let x = 0; x < 8; x++) { px2(c, add(sl, [x, 0]), STEEL[0]); px2(c, add(sl, [x, -1]), x < 4 ? STEEL[5] : STEEL[4]); }
    for (let y = 1; y < 5; y++) { px2(c, add(sl, [3.8, y]), STEEL[0]); px2(c, add(sl, [2.8, y]), STEEL[5]); }
    eyes = [add(sl, [2, 0]), add(sl, [5.6, 0])];
    rivet(c, Hd(36, 20.6)); rivet(c, Hd(43.6, 20.6));
  } else {
    for (let y = 11.4; y < 22; y += 1) { px2(c, Hd(39.5, y), STEEL[2]); px2(c, Hd(40.5, y), STEEL[4]); }
    seam(c, helm, Hd(35, 19.6), Hd(45, 19.6));
  }
  // предплечья: свободная рука, рука с секирой
  gauntlet(c, elG, gT, back ? -0.3 : 0, [gS, 0], !back);
  gauntlet(c, elH, hH, back ? -0.3 : -0.05, [hS, 0]);
  if (!A) A = axe(c, hH, av.scr, [hS, 0], back ? -0.2 : 0);
  const fm = M().D(hH, 2.9); plate(c, fm, 0.2, 2.2, 2); for (let kk = -1; kk <= 1; kk++) px2(c, add(add(hH, A.u, kk * 1.2), A.n, -1.5), STEEL[1]);
  return { img: c, axe: A, hand: hH, pivot: sH, head: Hd(40, 4), feet: [40 + p.dx, 76], eyes, fist: gT };
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
/** Контур — тёмный тон соседнего материала (не чистый чёрный). */
function outlineMat(o: Cv) {
  const add2: [number, number, C][] = [];
  for (let y = -1; y <= o.h; y++) for (let x = -1; x <= o.w; x++) {
    if (o.has(x, y)) continue;
    let r = 0, g = 0, b = 0, n = 0;
    for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (o.has(x + i, y + j)) { const q = o.get(x + i, y + j); r += q[0]; g += q[1]; b += q[2]; n++; }
    if (n) add2.push([x, y, [Math.round((r / n) * 0.26 + 3), Math.round((g / n) * 0.26 + 3), Math.round((b / n) * 0.3 + 5)]]);
  }
  for (const [x, y, col] of add2) o.set(x, y, col);
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
  outlineMat(o);
  return o;
}
export const flip = (c: Cv): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(c.w - 1 - x, y, c.get(x, y)); return o; };

const SPIN_VIEWS: ViewId[] = ["front", "side", "back", "side"];
/** Один кадр 80×80: рисунок + свечение (emis) + число непрозрачных пикселей тела на краю кадра. */
export function renderFrame(view0: ViewId, pose0: Pose): { img: Cv; emis: Cv; edge: number } {
  let view = view0, pose = pose0, flipped = false;
  if (pose0.spin >= 0) {
    const base = view0 === "front" ? 0 : view0 === "side" ? 1 : 2, q = (base + Math.floor(pose0.spin * 4 + 1e-6)) % 4;
    view = SPIN_VIEWS[q]; flipped = q === 3;
    pose = { ...pose0, ao: q === 3 ? -Math.abs(pose0.ao) : Math.abs(pose0.ao), tha: 99 };
  }
  const f = view === "side" ? renderSide(pose) : renderFront(pose, view === "back");
  let big = f.img;
  if (Math.abs(pose.tilt) > 1e-3 || pose.sy !== 1) big = rotCv(big, pose.tilt * (view === "side" ? 1 : view === "front" ? 0.25 : -0.25), 40 * Z, 76 * Z, pose.sy);
  let o = down(big), emis = new Cv(FR, FR);
  let edge = 0;
  for (let k = 0; k < FR; k++) for (const [x, y] of [[0, k], [FR - 1, k], [k, 0], [k, FR - 1]] as V2[]) if (o.has(x, y)) edge++;
  const ok = (x: number, y: number) => x >= 1 && y >= 1 && x <= FR - 2 && y <= FR - 2;
  const put = (x: number, y: number, col: C, glow = true) => { x = Math.round(x); y = Math.round(y); if (!ok(x, y)) return; o.set(x, y, col); if (glow) emis.set(x, y, col); };
  const glowOnly = (x: number, y: number, col: C) => { x = Math.round(x); y = Math.round(y); if (ok(x, y) && !emis.has(x, y)) emis.set(x, y, col); };
  const hs = (a: number, b: number) => hash(a + pose.seed * 13.7, b + pose.seed * 3.1);
  const tl = Math.abs(pose.tilt) < 0.3;
  const H = f.axe;
  // ---- эффекты, привязанные к телу (до зеркала) ----
  // глаза: зелёный огонь в щели визора
  if (pose.eye > 0.05) for (const e of f.eyes) {
    const x = e[0], y = e[1], br = pose.eye > 0.6;
    put(x, y, br ? EYE2 : GL[2]); put(x + 1, y, br ? EYE : GL[1]);
    glowOnly(x - 1, y, GL[1]); glowOnly(x + 2, y, GL[1]); glowOnly(x, y - 1, GL[0]); glowOnly(x + 1, y + 1, GL[0]);
  }
  // руны в вязи лезвия
  if (pose.rune > 0.35 && tl) {
    const lim = Math.round(H.runes.length * clamp(pose.rune, 0, 1));
    for (let i = 0; i < lim; i += 2) { const q = H.runes[i]; put(q[0], q[1], pose.rune > 0.8 ? GL[3] : GL[2]); glowOnly(q[0] + 1, q[1], GL[1]); glowOnly(q[0], q[1] + 1, GL[0]); }
    if (pose.rune > 1.2) for (let i = 0; i < 4; i++) { const a = hs(i, 3) * 2 * PI, r = 6 + hs(i, 5) * 4, x = H.head[0] + COS(a) * r, y = H.head[1] + SIN(a) * r; put(x, y, GL[3]); put(x + 1, y, GL[2]); glowOnly(x, y + 1, GL[1]); }
  }
  // шлейф секиры: дуга от прежнего угла древка к нынешнему
  if (pose.tha < 50 && tl) {
    const hS = view === "back" ? -1 : 1;
    const av0 = axeVec(pose, view, hS, pose.tha), k0 = clamp(Math.hypot(av0.scr[0], av0.scr[1]), 0.3, 1);
    const prev = add(f.hand, nrm(av0.scr), 14 * k0), cur = add(f.hand, H.u, 14 * H.k), pv = f.pivot;
    const a0 = Math.atan2(prev[1] - pv[1], prev[0] - pv[0]), r0 = Math.hypot(prev[0] - pv[0], prev[1] - pv[1]);
    let a1 = Math.atan2(cur[1] - pv[1], cur[0] - pv[0]); const r1 = Math.hypot(cur[0] - pv[0], cur[1] - pv[1]);
    while (a1 - a0 > PI) a1 -= 2 * PI; while (a1 - a0 < -PI) a1 += 2 * PI;
    if (Math.abs(a1 - a0) > 0.35) for (let s = 0; s <= 1; s += 0.02) {
      const a = a1 + (a0 - a1) * s, r = r1 + (r0 - r1) * s, w = 3.2 * (1 - s) + 0.8;
      for (let j = -Math.ceil(w); j <= Math.ceil(w); j++) {
        const rr = r + j * 0.8 - 1, x = pv[0] + COS(a) * rr, y = pv[1] + SIN(a) * rr, e = Math.abs(j) / w;
        if (e > 1) continue;
        const col = s < 0.25 ? (e < 0.5 ? WIND[4] : WIND[3]) : s < 0.6 ? (e < 0.5 ? WIND[3] : WIND[2]) : WIND[1];
        if (s > 0.6 && hs(Math.round(a * 20), j) > 0.6) continue;
        put(x, y, col, s < 0.4);
      }
    }
  }
  // вспышка на лезвии
  if (pose.flash > 0.05) {
    const e = H.edge, L = Math.round(5 * pose.flash);
    for (let q = -L; q <= L; q++) { put(e[0] + q, e[1], Math.abs(q) < L * 0.5 ? WIND[4] : WIND[3]); put(e[0], e[1] + q * 0.7, Math.abs(q) < L * 0.5 ? WIND[4] : WIND[3]); }
  }
  // оглушение: зелёные искры кружат меж рогов
  if (pose.stars > 0.05) { const hp = f.head; for (let i = 0; i < 3; i++) { const a = pose.seed * 0.8 + i * 2.1, x = hp[0] + COS(a) * 9, y = hp[1] + 4 + SIN(a) * 2.4; put(x, y, GL[4]); put(x + 1, y, GL[3]); for (const [i2, j2] of [[-1, 0], [2, 0], [0, -1], [1, 1]]) put(x + i2, y + j2, GL[2]); } }
  // зарастание при гибели: лоза и листья ползут по латам
  if (pose.grow > 0.02) {
    // плети лозы ползут от земли вверх по силуэту, на них — листья кучками 3×2
    const top = 76 - 34 * pose.grow;
    for (let v = 0; v < 4; v++) {
      let x = f.feet[0] - 11 + v * 7.3 + (hash(v, 7) - 0.5) * 3;
      for (let y = 74; y > top; y--) {
        x += SIN(y * 0.45 + v * 1.7) * 0.7;
        if (!o.has(Math.round(x), y) || !o.has(Math.round(x), y - 1)) continue;
        put(x, y, VINE[3], false); put(x + 1, y, VINE[1], false);
        if ((y + v * 3) % 8 === 0) { const sd = v % 2 ? 1 : -1; put(x + sd, y - 1, LEAF[4], false); put(x + sd * 2, y - 1, LEAF[3], false); put(x + sd, y, LEAF[2], false); put(x + sd * 2, y, LEAF[1], false); }
      }
    }
  }
  // ---- зеркало (оборот вихря) ----
  if (flipped) { o = flip(o); emis = flip(emis); }
  const body = new Cv(FR, FR); for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (o.has(x, y)) body.set(x, y, [1, 1, 1]);
  const putB = (x: number, y: number, col: C, glow = false) => { if (!body.has(Math.round(x), Math.round(y))) put(x, y, col, glow); };
  const feet: V2 = flipped ? [FR - 1 - f.feet[0], f.feet[1]] : f.feet;
  // ---- эффекты мира ----
  // вихрь: спираль ветра по земле сходится к центру + витки вокруг тела
  if (pose.vortex > 0.02) {
    const V = pose.vortex, cx = feet[0], cy = 71.5, rot = -pose.seed * 0.5;
    for (let arm = 0; arm < 5; arm++) for (let i = 0; i <= 90; i++) {
      const t = i / 90, r = 4 + 34 * t * (0.55 + 0.45 * V), a = rot + (arm * 2 * PI) / 5 + (1 - t) * 3.4;
      if (hs(arm * 7 + Math.floor(i / 7), 71) > 0.55 + 0.35 * V) continue;
      const x = cx + COS(a) * r, y = cy + SIN(a) * r * 0.34, col = t < 0.3 ? WIND[4] : t < 0.6 ? WIND[3] : WIND[2];
      const front = SIN(a) > 0, P = front ? put : putB;
      P(x, y, col, t < 0.4); P(x, y + 1, t < 0.5 ? WIND[2] : WIND[1], false);
    }
    // витки на уровне пояса и плеч (воронка шире кверху)
    for (const [hy, rr, ph] of [[60, 18, 0.4], [46, 22, 1.7], [32, 26, 3.1]] as [number, number, number][]) {
      if (V < 0.4 && hy < 50) continue;
      for (let i = 0; i < 70; i++) {
        const a = rot * 1.3 + ph + (i / 70) * 2 * PI * 0.62, x = cx + COS(a) * rr, y = hy + SIN(a) * rr * 0.3;
        const col = i > 52 ? WIND[4] : i > 30 ? WIND[3] : WIND[2];
        (SIN(a) > 0 ? put : putB)(x, y, col, i > 40); if (i > 30) (SIN(a) > 0 ? put : putB)(x, y + 1, WIND[1], false);
      }
    }
    // сорванные листья и пыль летят к центру
    for (let i = 0; i < 8; i++) {
      const a = rot * 1.6 + hs(i, 73) * 2 * PI, r = 8 + hs(i, 75) * 26, x = cx + COS(a) * r, y = cy - 4 - hs(i, 77) * 30 + SIN(a) * r * 0.3;
      const P = SIN(a) > 0 ? put : putB;
      if (i % 3) { P(x, y, LEAF[3], false); P(x + 1, y, LEAF[2], false); P(x, y + 1, LEAF[1], false); }
      else { P(x, y, DUST[3], false); P(x + 1, y, DUST[2], false); }
    }
  }
  // кольцо удара вихря по земле
  if (pose.ring > 0.02) {
    const r = 6 + 32 * pose.ring, cx = feet[0], cy = 72, fade = pose.ring > 0.7;
    for (let a = 0; a < 140; a++) {
      const t = (a / 140) * 2 * PI, x = cx + COS(t) * r, y = cy + SIN(t) * r * 0.32;
      if (hs(a >> 2, 81) > 0.85 - 0.3 * pose.ring) continue;
      const P = SIN(t) > 0 ? put : putB;
      P(x, y, fade ? WIND[2] : WIND[4], !fade); P(x, y + 1, fade ? WIND[1] : WIND[3], false); P(x, y - 1, WIND[2], false);
    }
    if (pose.ring < 0.6) for (let i = 0; i < 10; i++) { const t = hs(i, 83) * 2 * PI, x = cx + COS(t) * r * 0.9, y = cy + SIN(t) * r * 0.29 - 1 - hs(i, 85) * 4; put(x, y, DUST[3], false); put(x + 1, y, DUST[2], false); }
  }
  // лозы рвутся из земли кольцом
  if (pose.vines > 0.02) {
    const V = pose.vines, n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * PI + 0.35, bx = feet[0] + COS(a) * 32, by = 71 + SIN(a) * 6.5, front = SIN(a) > 0, P = front ? put : putB;
      const grow = clamp(V * 1.5 - hs(i, 61) * 0.3, 0, 1), sink = V > 0.8 ? 1 - (V - 0.8) * 3.5 : 1, h = (7 + 6 * hs(i, 63)) * grow * Math.max(0, sink);
      if (h < 0.5) continue;
      for (let t = 0; t <= 1; t += 0.06) {
        const x = bx + SIN(t * 3 + i) * 1.6 * t, y = by - h * t, w = t < 0.5 ? 1 : 0;
        P(x, y, VINE[3], false); P(x + 1, y, VINE[1], false); if (w) P(x - 1, y, VINE[2], false);
        if (t > 0.3 && Math.round(t * 16) % 5 === 0) { const sd = i % 2 ? 1 : -1; P(x + sd * 2, y - 1, LEAF[3], false); P(x + sd * 2, y, LEAF[1], false); }
      }
      const tx = bx + SIN(3 + i) * 1.6, ty = by - h; P(tx, ty, GL[3]); glowOnly(tx + 1, ty, GL[1]); glowOnly(tx, ty - 1, GL[1]);
      for (let j = -2; j <= 2; j++) { P(bx + j, by + 1, DUST[j === 0 ? 0 : 1], false); glowOnly(bx + j, by, GL[0]); }
    }
    // зелёная черта круга
    if (V > 0.2 && V < 0.9) for (let a = 0; a < 120; a++) { const t = (a / 120) * 2 * PI; if (hs(a >> 3, 65) < 0.6) glowOnly(feet[0] + COS(t) * 32, 71 + SIN(t) * 6.5, GL[1]); }
  }
  // натиск: полосы скорости и пыль позади
  if (pose.rush > 0.05) {
    const dir = view === "side" ? (flipped ? -1 : 1) : 0;
    for (let i = 0; i < 9; i++) {
      const y = 22 + hs(i, 91) * 50, x0 = feet[0] + (dir ? dir * (10 + hs(i, 93) * 6) : (hs(i, 95) - 0.5) * 40), len = 6 + 10 * pose.rush * hs(i, 97);
      for (let t = 0; t < len; t++) { const x = dir ? x0 + dir * t : x0, yy = dir ? y : y - t * 0.6; putB(x, yy, t < 2 ? WIND[3] : WIND[2]); }
    }
    for (let i = 0; i < 12 * pose.rush; i++) { const a = hs(i, 99) * PI, r = 3 + hs(99, i) * 8, x = feet[0] + (dir || 1) * (8 + COS(a) * r), y = 74 - SIN(a) * r * 0.5; put(x, y, DUST[(i % 3) + 1], false); put(x + 1, y, DUST[1], false); }
  }
  // трещина под лезвием
  if (pose.crack > 0.05) {
    const e = flipped ? [FR - 1 - H.edge[0], H.edge[1]] : H.edge, gx = clamp(e[0], 8, 72), gy = clamp(Math.max(e[1], 70), 66, 76), L = 4 + 10 * pose.crack;
    for (let b = 0; b < 4; b++) { let x = gx, y = gy; const a = (b / 4) * 2 * PI + 0.4; for (let t = 0; t < L; t++) { x += COS(a + (hs(b, t) - 0.5) * 1.2); y += SIN(a) * 0.35; put(x, y, DUST[0], false); put(x, y + 1, DUST[2], false); } }
    for (let i = 0; i < 10 * pose.crack; i++) { const a = PI + hs(i, 101) * PI, r = 2 + hs(101, i) * 7, x = gx + COS(a) * r * 1.4, y = gy + SIN(a) * r; put(x, y, DUST[(i % 3) + 1], false); put(x + 1, y, DUST[1], false); }
  }
  // пыль
  const puff = (x: number, y: number, k: number) => { for (let i = 0; i < 14 * k; i++) { const a = hash(i, x) * 6.28, r = hash(y, i) * 5 * k + 1; const px = x + COS(a) * r * 1.4, py = y - Math.abs(SIN(a)) * r * 0.9; put(px, py, DUST[(i % 3) + 1], false); put(px + 1, py, DUST[1], false); } };
  if (pose.dust[0] > 0.05) puff(feet[0] + 9, 75, pose.dust[0]);
  if (pose.dust[1] > 0.05) puff(feet[0] - 9, 75, pose.dust[1]);
  return { img: o, emis, edge };
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
/** Ключевые позы с плавным переходом; swing — шлейф секиры от угла прошлого кадра. */
const keyed = (keys: { f: number; p: Partial<Pose> }[], n: number, extra?: (i: number, p: Pose) => Partial<Pose>, swing = false): Pose[] => {
  const out: Pose[] = [];
  for (let i = 0; i < n; i++) {
    let a = keys[0], b = keys[keys.length - 1];
    for (let k = 0; k < keys.length - 1; k++) if (i >= keys[k].f && i <= keys[k + 1].f) { a = keys[k]; b = keys[k + 1]; break; }
    const t = a.f === b.f ? 0 : easeIO((i - a.f) / (b.f - a.f));
    const q = blend({ ...REST, ...a.p }, { ...REST, ...b.p }, t);
    q.seed = i; q.tha = 99;
    if (q.spin < 0 && (a.p.spin === undefined || b.p.spin === undefined)) q.spin = -1;
    if (swing && i > 0 && Math.abs(out[i - 1].ha - q.ha) > 0.45) q.tha = out[i - 1].ha;
    out.push(extra ? { ...q, ...extra(i, q) } : q);
  }
  return out;
};
const loop = (n: number, f: (ph: number, i: number) => Partial<Pose>): Pose[] => Array.from({ length: n }, (_, i) => ({ ...REST, seed: i, ...f((2 * PI * i) / n, i) }));
const TR = [0, 1, 0, -1];

// замахи и стойки умений
/** Раскол: секира за головой двумя руками. */
const CLEAVE_UP = P({ ah: [12, -25], ha: 1.15, ao: 0.1, two: 1, lean: 0.0, bob: -1, head: [1, -0.5], legA: [-2.5, 0], legB: [2, 0], rune: 0.9 });
/** Лозовая петля: свободный кулак вверх, лоза светится. */
const VINE_UP = P({ oh: [-6, -21], ah: [2, 0], lean: 0.02, bob: -1, head: [0, -1], rune: 0.6 });
/** Вихрь: секира вынесена вбок, корпус скручен. */
const WHIRL_UP = P({ ah: [6, -6], al: 1, ha: -1.75, ao: 1.15, lean: 0.1, squat: 2, head: [0.5, 0], legA: [-3, 0], legB: [3, 0], rune: 1.1 });
/** Натиск: голова и рога опущены, секира отведена назад. */
const CHARGE_UP = P({ ah: [10, -2], ha: 2.2, ao: 0.3, lean: 0.36, squat: 2.5, head: [-3, 3], legA: [-4, 0], legB: [4, 0], rune: 0.7 });

export type KnightAnim = "idle" | "walk" | "attack" | "cleaveWind" | "cleaveHold" | "cleaveStrike" | "vineWind" | "vineHold" | "vineCast"
  | "whirlWind" | "whirlHold" | "whirlStrike" | "chargeWind" | "chargeHold" | "chargeStrike" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: KnightAnim; hit?: number };
const POSES: Record<KnightAnim, () => Pose[]> = {
  idle: () => loop(12, (ph, i) => ({ bob: 0.5 * SIN(ph), head: [0, 0.4 * SIN(ph - 0.6)], ah: [0.3 * SIN(ph + 1), 0.6 * SIN(ph)], ha: -2.55 + 0.04 * SIN(ph), oh: [0, 0.5 * SIN(ph - 1)], sw: 0.8 * SIN(ph + 0.5), lean: 0.06 + 0.01 * SIN(ph), eye: i % 6 === 3 ? 0.55 : 1, rune: 0.2 })),
  walk: () => loop(12, (f) => ({
    legA: [-3.4 * COS(f), -2.4 * Math.max(0, SIN(f))], legB: [3.4 * COS(f), -2.4 * Math.max(0, -SIN(f))],
    bob: 0.8 * COS(2 * f) - 0.3, lean: 0.1 + 0.02 * COS(f), head: [0.3 * COS(f), -0.3 * COS(2 * f)],
    ah: [2 * COS(f), -0.5 + 0.6 * SIN(2 * f)], ha: -2.55 + 0.08 * COS(f), oh: [-2.6 * COS(f), 0], sw: 2 * SIN(f),
  })),
  attack: () => keyed([
    { f: 0, p: {} },
    { f: 2, p: P({ ah: [8, -14], ha: 0.2, ao: 0.3, lean: 0.03, head: [1, -0.5] }) },
    { f: 4, p: P({ ah: [11, -26], ha: 1.2, ao: 0.2, lean: 0.0, head: [1.5, -1], legB: [1.5, 0], rune: 0.7 }) },
    { f: 6, p: P({ ah: [-1, -6], ha: -2.2, ao: 0.3, lean: 0.26, head: [-2, 1.5], bob: 1, legA: [-3, 0], flash: 0.8, crack: 0.4, dust: [0, 0.6] }) },
    { f: 8, p: P({ ah: [0, -4], ha: -2.4, ao: 0.4, lean: 0.2, head: [-1.5, 1], crack: 0.2 }) },
    { f: 9, p: {} },
  ], 10, undefined, true),
  cleaveWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: CLEAVE_UP }], 4, undefined, true),
  cleaveHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...CLEAVE_UP, seed: i, ah: [12, -25 + 0.5 * TR[i]] as V2, rune: 1.0 + 0.3 * (i % 2), bob: -1 + 0.3 * TR[i] } as Pose)),
  /** двойной раскол: рубит вперёд, затем разворотом — назад */
  cleaveStrike: () => keyed([
    { f: 0, p: CLEAVE_UP },
    { f: 1, p: P({ ah: [4, -24], ha: -0.5, two: 1, lean: 0.14, head: [-0.5, 0], rune: 1.2 }) },
    { f: 3, p: P({ ah: [-2, -7], ha: -2.15, two: 1, ao: 0.1, lean: 0.34, squat: 2, head: [-3, 2.5], legA: [-3.5, 0], flash: 1, crack: 0.6, dust: [0.8, 0.6] }) },
    { f: 5, p: P({ ah: [0, -8], ha: -2.1, two: 0.6, ao: 0.6, lean: 0.28, squat: 2, head: [-2, 2], legA: [-3.5, 0], crack: 1 }) },
    { f: 7, p: P({ ah: [16, -10], ha: 2.0, two: 0, ao: 0.9, lean: 0.0, squat: 1.5, head: [2, 0], legB: [3, 0], dust: [0.6, 0], rune: 0.8 }) },
    { f: 9, p: P({ ah: [4, -2], ha: -2.5, lean: 0.06, squat: 0 }) },
  ], 10, undefined, true),
  vineWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: VINE_UP }], 4),
  vineHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...VINE_UP, seed: i, oh: [-6, -21 + 0.6 * TR[i]] as V2, rune: 0.8 + 0.6 * (i % 2), bob: -1 + 0.3 * TR[i], vines: 0.08 * (i % 2) } as Pose)),
  vineCast: () => keyed([
    { f: 0, p: VINE_UP },
    { f: 1, p: P({ oh: [-18, -4], ah: [4, 2], lean: 0.15, bend: -0.45, squat: 3, head: [-1, 1], rune: 1 }) },
    { f: 2, p: P({ oh: [-26, 22], ah: [6, 4], lean: 0.1, bend: -0.9, squat: 6, head: [2, 1], legA: [-3, 0], dust: [0.9, 0.6], vines: 0.15 }) },
    { f: 4, p: P({ oh: [-26, 22], ah: [6, 4], lean: 0.1, bend: -0.9, squat: 6, head: [2, 1], legA: [-3, 0], vines: 0.6, rune: 1.3 }) },
    { f: 6, p: P({ oh: [-14, 10], ah: [4, 2], lean: 0.12, bend: -0.5, squat: 3, head: [-1, 1.5], vines: 0.85 }) },
    { f: 7, p: P({ oh: [-2, 2], lean: 0.08, bend: -0.1, squat: 1, vines: 1 }) },
  ], 8, (i) => (i === 7 ? { vines: 0 } : {})),
  whirlWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: WHIRL_UP }], 4, undefined, true),
  /** вихрь: полный оборот за 8 кадров, вид по кругу, спираль тянет к центру */
  whirlHold: () => Array.from({ length: 8 }, (_, i) => ({ ...REST, ...WHIRL_UP, seed: i, spin: i / 8, vortex: 0.75 + 0.25 * (i % 2), bob: 2 + 0.4 * TR[i % 4], legA: [-3 + TR[i % 4], 0] as V2, legB: [3 - TR[i % 4], 0] as V2, sw: 2 * SIN(i), tha: 99 } as Pose)),
  whirlStrike: () => keyed([
    { f: 0, p: { ...WHIRL_UP, vortex: 1 } },
    { f: 2, p: P({ ah: [6, -6], al: 1, ha: -1.75, ao: 1.15, squat: 3, lean: 0.12, vortex: 1, rune: 1.4, head: [0.5, 0.5] }) },
    { f: 4, p: P({ ah: [-3, -2], al: 0.5, ha: -2.2, ao: 0.5, squat: 3.5, lean: 0.24, head: [-2, 1.5], legA: [-4, 0], vortex: 0.3, ring: 0.2, flash: 0.9, dust: [0.9, 0.9] }) },
    { f: 6, p: P({ ah: [-3, -2], al: 0, ha: -2.3, ao: 0.4, squat: 3, lean: 0.24, head: [-2, 1.5], legA: [-4, 0], ring: 0.6, dust: [0.5, 0.5] }) },
    { f: 8, p: P({ ah: [-2, 0], ha: -2.3, squat: 1, lean: 0.12, ring: 0.95 }) },
    { f: 9, p: {} },
  ], 10, (i) => (i === 9 ? { ring: 0, vortex: 0 } : i === 3 ? { tha: -0.4 } : {}), true),
  chargeWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: CHARGE_UP }], 4),
  chargeHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...CHARGE_UP, seed: i, legA: [-4 + (i % 2 ? 1.2 : 0), i % 2 ? -1.5 : 0] as V2, dust: [0, i % 2 ? 0.5 : 0.2] as V2, bob: 0.3 * TR[i], rune: 0.8 + 0.3 * (i % 2) } as Pose)),
  chargeStrike: () => keyed([
    { f: 0, p: CHARGE_UP },
    { f: 2, p: P({ ...CHARGE_UP, dx: -3, rush: 1, legA: [-5, -2], legB: [5, 0], bob: -1, dust: [0.8, 0.8] }) },
    { f: 3, p: P({ ah: [-2, -8], ha: -2.05, ao: 0.4, lean: 0.3, squat: 2, head: [-2.5, 2.5], dx: -1, rush: 0.8, legA: [-5, 0], legB: [4, 0], flash: 0.9 }) },
    { f: 5, p: P({ ah: [0, -4], ha: -2.4, ao: 0.5, lean: 0.22, squat: 1.5, head: [-1.5, 1.5], dx: -0.5, rush: 0.3, crack: 0.5, dust: [0.5, 0.5] }) },
    { f: 7, p: P({ dx: 0, crack: 0 }) },
  ], 8, (i) => (i === 7 ? { rush: 0 } : {}), true),
  stun: () => loop(8, (ph) => ({ lean: 0.26, squat: 2.5, tilt: 0.04 * SIN(ph), head: [-1 + SIN(ph), 2.5], ah: [-2, 4], ha: -2.9, ao: 0.2, oh: [-4, -8], sw: 1.5 * SIN(ph), legA: [SIN(ph) * 0.6, 0], legB: [-SIN(ph) * 0.6, 0], stars: 1, eye: 0.5, rune: 0.1 })),
  /** гибель: шатается, падает на колено, опирается на секиру, свет в шлеме гаснет, лоза затягивает латы */
  death: () => keyed([
    { f: 0, p: {} },
    { f: 2, p: P({ lean: -0.04, head: [1.5, -0.4], bob: 0, flash: 0.5, ah: [2, -2], ha: -2.7, eye: 1.2 }) },
    { f: 5, p: P({ squat: 5, kneel: 0.6, lean: 0.18, head: [-1.5, 2], ah: [-3, 1], ha: -3.05, ao: 0.3, oh: [-4, 4], eye: 0.8 }) },
    { f: 8, p: P({ squat: 9, kneel: 1, lean: 0.26, head: [-2.5, 3], ah: [-4, -0.5], ha: -3.1, ao: 0.35, oh: [-6, 7], eye: 0.5, dust: [0.8, 0.8], grow: 0.2 }) },
    { f: 11, p: P({ squat: 9.5, kneel: 1, lean: 0.34, head: [-3.5, 4], ah: [-4, -1], ha: -3.1, ao: 0.35, oh: [-6, 8], eye: 0.15, rune: 0, grow: 0.65 }) },
    { f: 13, p: P({ squat: 10, kneel: 1, lean: 0.38, head: [-4, 4.5], ah: [-4, -1.5], ha: -3.1, ao: 0.35, oh: [-6, 8.5], eye: 0, rune: 0, grow: 1 }) },
], 14),
};
const ANIM_ORDER: [KnightAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар секирой", hit: 6 }],
  ["cleaveWind", { n: 4, fps: 12, loop: false, ru: "секира за голову", next: "cleaveHold" }],
  ["cleaveHold", { n: 4, fps: 12, loop: true, ru: "раскол занесён", next: "cleaveStrike" }],
  ["cleaveStrike", { n: 10, fps: 12, loop: false, ru: "двойной раскол", hit: 3 }],
  ["vineWind", { n: 4, fps: 12, loop: false, ru: "кулак вверх", next: "vineHold" }],
  ["vineHold", { n: 4, fps: 12, loop: true, ru: "лоза зовёт", next: "vineCast" }],
  ["vineCast", { n: 8, fps: 12, loop: false, ru: "лозовая петля", hit: 2 }],
  ["whirlWind", { n: 4, fps: 12, loop: false, ru: "секира вбок", next: "whirlHold" }],
  ["whirlHold", { n: 8, fps: 14, loop: true, ru: "вихрь тянет", next: "whirlStrike" }],
  ["whirlStrike", { n: 10, fps: 12, loop: false, ru: "вихрь секиры", hit: 4 }],
  ["chargeWind", { n: 4, fps: 12, loop: false, ru: "рога вниз", next: "chargeHold" }],
  ["chargeHold", { n: 4, fps: 12, loop: true, ru: "роет землю", next: "chargeStrike" }],
  ["chargeStrike", { n: 8, fps: 12, loop: false, ru: "рогатый натиск", hit: 3 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const KNIGHT_ANIMS = {} as Record<KnightAnim, AnimDef>;
{ let col = 0; for (const [k, a] of ANIM_ORDER) { KNIGHT_ANIMS[k] = { ...a, col }; col += a.n; } }
export const KNIGHT_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
/** Умения → клипы (для to-game на следующем этапе). */
export const KNIGHT_SKILLS: Record<string, { windup: [KnightAnim, KnightAnim]; strike: KnightAnim }> = {
  twin_cleave: { windup: ["cleaveWind", "cleaveHold"], strike: "cleaveStrike" },
  vine_snare: { windup: ["vineWind", "vineHold"], strike: "vineCast" },
  axe_vortex: { windup: ["whirlWind", "whirlHold"], strike: "whirlStrike" },
  antler_charge: { windup: ["chargeWind", "chargeHold"], strike: "chargeStrike" },
};
const VIEWS: ViewId[] = ["front", "back", "side"];
export const knightPose = (a: KnightAnim, i: number): Pose => POSES[a]()[i];

// ---------------- листы ----------------
const savePng = (c: Cv, f: string) => { const p = new PNG({ width: c.w, height: c.h }); p.data = Buffer.from(c.d); fs.writeFileSync(f, PNG.sync.write(p)); };
function refCrop(root: string, h: number): Cv | null {
  const f = path.join(root, "tools", "out", "bosses139", "ref-03.png");
  if (!fs.existsSync(f)) return null;
  const p = PNG.sync.read(fs.readFileSync(f));
  const x0 = Math.round(p.width * 0.06), x1 = Math.round(p.width * 0.94), y0 = Math.round(p.height * 0.015), y1 = Math.round(p.height * 0.99);
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
/** Тень под ногами в превью: контактная полоса + мягкий овал (в игре — общая тень). */
function shadow(c: Cv, x: number, y: number, k: number) {
  for (let j = -3; j <= 3; j++) for (let i = -16; i <= 16; i++) { const d = (i / 16) ** 2 + (j / 3) ** 2; if (d > 1) continue; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { const px = x + (40 + i) * k + a, py = y + (75 + j) * k + b; if (px < 0 || py < 0 || px >= c.w || py >= c.h) continue; const q = c.get(px, py), m = d < 0.35 ? 0.55 : 0.75; c.set(px, py, [Math.round(q[0] * m), Math.round(q[1] * m), Math.round(q[2] * m)]); } }
}

/** Эскиз: покой в трёх видах ×3, ×1, силуэт, ночь со свечением, референс. */
export function writeSketch(root: string, outDir: string, anim: KnightAnim = "idle", fi = 0): string {
  const pose = POSES[anim]()[fi];
  const rs = (v: ViewId) => renderFrame(v, pose);
  const R3 = [rs("front"), rs("back"), rs("side")];
  const frames: Cv[] = [R3[0].img, R3[1].img, R3[2].img, flip(R3[2].img)];
  const c = new Cv(1300, 600); c.rect(0, 0, c.w, c.h, BG);
  label(c, 10, 8, "ЭСКИЗ РЫЦАРЬ ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 3", 2);
  frames.forEach((f, i) => { c.rect(10 + i * 248, 30, 240, 240, GROUND); shadow(c, 10 + i * 248, 30, 3); c.blit(f, 10 + i * 248, 30, 3); });
  const ref = refCrop(root, 240); if (ref) { c.rect(1002, 30, ref.w + 4, 240, PANEL); c.blit(ref, 1004, 30, 1); }
  c.rect(10, 280, 4 * 248 - 8, 90, GROUND); frames.forEach((f, i) => c.blit(f, 10 + i * 248 + 80, 285, 1));
  label(c, 10, 382, "СИЛУЭТ ×2 | НОЧЬ + СВЕЧЕНИЕ ×2", 2);
  c.blit(silc(frames[0], hx("#d8d8e0")), 10, 400, 2); c.blit(silc(frames[2], hx("#d8d8e0")), 180, 400, 2);
  [R3[0], R3[2]].forEach((r, i) => { const x = 380 + i * 170; c.rect(x, 400, 160, 160, NIGHT); c.blit(r.img, x, 400, 2); nightTint(c, x, 400, 160, 160); c.blit(r.emis, x, 400, 2); });
  const out = path.join(outDir, "knight-sketch.png"); savePng(c, out); return out;
}

export function writeKnightArt(root: string, outDir: string, only?: KnightAnim[], quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const N = FRAME, FH = FRAME_H;
  const sheet = new Cv(N * KNIGHT_COLS, FH * 3), glow = new Cv(N * KNIGHT_COLS, FH * 3);
  const bad: string[] = [];
  for (const [a, d] of ANIM_ORDER) {
    if (only && !only.includes(a)) continue;
    const poses = POSES[a]();
    VIEWS.forEach((v, row) => poses.slice(0, quick ? 1 : d.n).forEach((p, i) => {
      const r = renderFrame(v, p), x0 = (KNIGHT_ANIMS[a].col + i) * N, y0 = row * FH;
      blitSub(sheet, r.img, 0, 0, N, FH, x0, y0); blitSub(glow, r.emis, 0, 0, N, FH, x0, y0);
      if (r.edge) bad.push(`${a} ${v} кадр ${i + 1}: ${r.edge}`);
    }));
  }
  const fSheet = path.join(outDir, "knight-sheet.png"), fGlow = path.join(outDir, "knight-glow.png");
  savePng(sheet, fSheet); savePng(glow, fGlow);
  // сравнение «наш | референс»: покой ×3 во всех видах, ×1, ночь со свечением; затем анимации вбок (4 кадра ×2)
  const ref = refCrop(root, 240);
  const shown = ANIM_ORDER.filter(([a]) => !only || only.includes(a));
  const rows = Math.ceil(shown.length / 2), RW = 1360, rowH = 176;
  const c = new Cv(Math.max(RW, 990 + (ref ? ref.w + 12 : 0)), 340 + 40 + rows * rowH);
  c.rect(0, 0, c.w, c.h, BG);
  label(c, 10, 8, "РЫЦАРЬ ПОКОЙ ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 3", 2);
  const idle = (row: number, fl = false): Cv => { const f = new Cv(N, FH); blitSub(f, sheet, 0, row * FH, N, FH, 0, 0); return fl ? flip(f) : f; };
  const idles = [idle(0), idle(1), idle(2), idle(2, true)];
  idles.forEach((f, i) => { c.rect(10 + i * 244, 30, 240, 240, GROUND); shadow(c, 10 + i * 244, 30, 3); c.blit(f, 10 + i * 244, 30, 3); });
  c.rect(10, 280, 4 * 244 - 4, 84, GROUND); idles.forEach((f, i) => { shadow(c, 10 + i * 244 + 80, 282, 1); c.blit(f, 10 + i * 244 + 80, 282, 1); });
  if (ref) { c.rect(990, 30, ref.w + 8, 240, PANEL); c.blit(ref, 994, 30, 1); }
  c.rect(990, 280, 360, 84, NIGHT);
  for (let k = 0; k < 2; k++) { const row = k ? 2 : 0, x = 1000 + k * 100; blitSub(c, sheet, 0, row * FH, N, FH, x, 282); nightTint(c, x, 282, N, FH); blitSub(c, glow, 0, row * FH, N, FH, x, 282); }
  const y0 = 380;
  shown.forEach(([a, d], idx) => {
    const col = idx % 2, row = Math.floor(idx / 2), ox = 10 + col * 680, oy = y0 + row * rowH;
    c.rect(ox, oy, 670, rowH - 6, PANEL);
    label(c, ox + 4, oy + 3, KNIGHT_ANIMS[a].ru.toUpperCase(), 2);
    const nShow = Math.min(4, d.n), step = (d.n - 1) / Math.max(1, nShow - 1);
    for (let k = 0; k < nShow; k++) {
      const fi = Math.round(k * step), fx = ox + 4 + k * 166;
      c.rect(fx, oy + 18, 162, 150, GROUND); shadow(c, fx + 1, oy + 18 - 5, 2);
      blitSub(c, sheet, (KNIGHT_ANIMS[a].col + fi) * N, 2 * FH, N, FH, fx + 1, oy + 18 - 5, 2);
    }
  });
  const fCmp = path.join(outDir, "r79s-w-compare.png"); savePng(c, fCmp);
  // превью листа: каждая анимация — три ряда (вниз, вверх, вбок), все кадры ×1
  const PW = 16 * 82 + 20, blocks = shown.map(([a, d]) => ({ a, d, lines: Math.ceil(d.n / 16) }));
  const ph = blocks.reduce((s, b) => s + 16 + b.lines * 3 * 82 + 6, 10);
  const pv = new Cv(PW, ph); pv.rect(0, 0, PW, ph, BG);
  let yy = 6;
  for (const b of blocks) {
    label(pv, 10, yy, `${b.d.ru}`.toUpperCase(), 2); yy += 14;
    for (let ln = 0; ln < b.lines; ln++) for (let v = 0; v < 3; v++) {
      for (let k = ln * 16; k < Math.min(b.d.n, ln * 16 + 16); k++) { const x = 10 + (k - ln * 16) * 82; pv.rect(x, yy, 80, 80, GROUND); shadow(pv, x, yy, 1); blitSub(pv, sheet, (KNIGHT_ANIMS[b.a].col + k) * N, v * FH, N, FH, x, yy); }
      yy += 82;
    }
    yy += 8;
  }
  const fPrev = path.join(outDir, "r79s-w-sheet.png"); savePng(pv, fPrev);
  if (bad.length) { console.warn(`  проверки: тело на краю кадра — ${bad.length}\n${bad.slice(0, 40).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; } else console.log("  проверки: край кадра чист");
  console.log(`  ${ID}: ${KNIGHT_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  return [fSheet, fGlow, fCmp, fPrev];
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/sol_horned_knight.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const out = path.join(root, "tools", "out", "bosses139"), t = Date.now();
  const sk = process.argv.find((a) => a.startsWith("--sketch"));
  if (sk) { const [an, fi] = (sk.split("=")[1] ?? "idle:0").split(":"); console.log("  эскиз:", writeSketch(root, out, an as KnightAnim, Number(fi ?? 0))); }
  else {
    const onlyArg = process.argv.find((a) => a.startsWith("--only="));
    const only = onlyArg ? (onlyArg.slice(7).split(",") as KnightAnim[]) : undefined;
    const files = writeKnightArt(root, out, only, process.argv.includes("--quick"));
    console.log(`  ${files.length} файлов`);
  }
  console.log(`  ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
