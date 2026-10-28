/**
 * Задача 139, босс кольца: Мидас, проклятый золотом (запад, слот r69s, ур. 69, группа 5; референс 30 — только для сравнения: чужой арт в игру и в git не идёт).
 * Метод — как у минотавра (cliff_minotaur_knight.ts): 2D-пиксель-арт слоями-штампами, тело в 2× (160×160) сводится в кадр 80×80, ступни y=76, контур 1 px;
 * общий код — mino_lib.ts. Руки по IK, сутулость — сдвиг рядов выше пояса. Золото — игровая рампа (#4a2c0c … #ffffe6), руки светятся (лист glow).
 * Виды: вниз, вверх, вбок (строки листа), влево — зеркало вбок (в игре). Гибель — позолота ползёт от ступней, он застывает золотой статуей на коленях.
 *
 * Запуск (низкий приоритет, под замком tools/out/scenario.lock):
 *   npx tsx tools/gen/bosses139/sol_gilded_midas.ts --sketch          → tools/out/bosses139/midas-sketch.png (эскиз: покой ×1/×3, силуэт, референс)
 *   npx tsx tools/gen/bosses139/sol_gilded_midas.ts [--quick] [--only=idle,walk]
 *     → midas-sheet.png, midas-glow.png, r69s-w-compare.png («наш | референс 30»), r69s-w-sheet.png (превью листа: все кадры, три вида)
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { C, Cv, F, Mk, OUTL, hash, hx, label, paint } from "./mino_lib";
F["0"] ??= "111,101,101,101,111"; F["6"] ??= "011,100,111,101,111"; F["9"] ??= "111,101,111,001,110";

export const ID = "sol_gilded_midas";
export const FRAME = 80;
export const FRAME_H = 80;
const Z = 2, W = 160, FR = 80;
const PI = Math.PI, SIN = Math.sin, COS = Math.cos;
type V2 = [number, number];

// ---------------- палитры (3–6 тонов на материал) ----------------
const R = (...s: string[]): C[] => s.map(hx);
/** Кожа: серо-землистая, исхудалая. */
const SKIN = R("#121211", "#2b2a25", "#48463c", "#6a6656", "#8f8a75", "#b5ae95", "#d9d3bc");
const HAIR = R("#050505", "#0f0d0c", "#1d1917", "#2f2925", "#483f37", "#655849");
/** Тёмное железо кандалов и цепей. */
const IRON = R("#0b0c0e", "#24272c", "#454a52", "#727982", "#a9b0b8");
/** Туника: тёмная синь, как на референсе. */
const CLOTH = R("#05070d", "#0b1220", "#142036", "#1f3150", "#2e4770", "#43628f");
const ROPE = R("#120b06", "#2a1a0e", "#46301a", "#664a2a", "#86663e");
const WRAP = R("#151210", "#2e2822", "#4b4238", "#6b6050", "#8c806c");
/** Игровое золото (bf-props.ts / bf-horses.ts). */
const GOLD = R("#4a2c0c", "#85521a", "#c98a28", "#f0c040", "#fff0a0", "#ffffe6");
/** Тусклое золото каймы туники. */
const TGOLD = R("#3a240c", "#6a4416", "#a06e22", "#c99a3a");

// ---------------- маски в координатах 1×, рисуются в сетке 2× ----------------
class Mz extends Mk {
  constructor() { super(W, W); }
  private fill(x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean) {
    const a = Math.max(0, Math.floor(x0)), b = Math.min(W - 1, Math.ceil(x1)), c = Math.max(0, Math.floor(y0)), d = Math.min(W - 1, Math.ceil(y1));
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (inside(x + 0.5, y + 0.5)) this.set(x, y);
  }
  L(a: V2, b: V2, t0: number, t1 = t0) { this.line(a[0] * Z, a[1] * Z, b[0] * Z, b[1] * Z, t0 * Z, t1 * Z); return this; }
  D(p: V2, r: number) { this.disc(p[0] * Z, p[1] * Z, r * Z); return this; }
  B(p0: V2, p1: V2, p2: V2, t0: number, t1 = t0) { this.bez([p0[0] * Z, p0[1] * Z], [p1[0] * Z, p1[1] * Z], [p2[0] * Z, p2[1] * Z], t0 * Z, t1 * Z); return this; }
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
const rot = (v: V2, a: number): V2 => [v[0] * COS(a) - v[1] * SIN(a), v[0] * SIN(a) + v[1] * COS(a)];
/** Пиксель в сетке 2× по координатам 1×. */
const px = (c: Cv, p: V2, col: C) => c.set(p[0] * Z, p[1] * Z, col);
/** Пиксель 1× (блок 2×2 по сетке) — мелкие черты, которые не должны теряться при сведении. */
const px2 = (c: Cv, p: V2, col: C) => { const x = Math.floor(p[0]) * Z, y = Math.floor(p[1]) * Z; c.set(x, y, col); c.set(x + 1, y, col); c.set(x, y + 1, col); c.set(x + 1, y + 1, col); };
/** Пиксель 1× со сдвигом в целых пикселях от опорной точки. */
const pxo = (c: Cv, b: V2, dx: number, dy: number, col: C) => px2(c, [Math.floor(b[0]) + dx, Math.floor(b[1]) + dy], col);

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

// ---------------- части ----------------
/** Цепь: звенья по 1 px (1×) вниз от точки, лёгкий увод вбок; у земли ложится вбок. */
function chain(c: Cv, p: V2, n: number, side: number, floor = 76) {
  for (let k = 0; k < n; k++) {
    let x = p[0] + side * k * 0.45, y = p[1] + k * 1.0;
    if (y > floor) { x += (y - floor) * side * 1.6; y = floor; }
    px2(c, [x, y], k % 2 ? IRON[1] : IRON[3]);
    if (k % 2 === 0) px2(c, [x + side, y], IRON[2]);
  }
}
/** Кандалы: железная полоса поперёк конечности. */
function shackle(c: Cv, p: V2, dir: V2, w: number) {
  const nv: V2 = [-dir[1], dir[0]], m = M().L(add(p, nv, -w), add(p, nv, w), 1.3);
  paint(c, m, IRON, { amp: 1.8, dome: 1, dith: 0, bias: 0.3 });
}
/** Жилы и кости: светлая кромка и тень вдоль сегмента. */
function sinew(c: Cv, a: V2, b: V2, off: number, u0 = 0.15, u1 = 0.85) {
  const dir = nrm([b[0] - a[0], b[1] - a[1]]); let nv: V2 = [-dir[1], dir[0]]; if (nv[1] > 0 || (nv[1] === 0 && nv[0] > 0)) nv = [-nv[0], -nv[1]];
  for (let u = u0; u <= u1; u += 0.12) { const q = lerp(a, b, u); px2(c, add(q, nv, off), SKIN[5]); if (u > u0 + 0.2 && u < u1 - 0.1) px2(c, add(q, nv, -off * 1.1), SKIN[1]); }
}
/** Кожа-конечность с объёмом. */
const limb = (c: Cv, a: V2, b: V2, t0: number, t1: number, bias = 0, ramp = SKIN) => { const m = M().L(a, b, t0, t1); paint(c, m, ramp, { amp: 1.5, dome: 3, dith: 0.3, bias }); return m; };
/** Предплечье: кожа у локтя, к кисти — золото с рваной границей; браслеты. */
function forearm(c: Cv, el: V2, h: V2, from: number, bias: number, kind: "glow" | "hang") {
  const mid = lerp(el, h, from);
  limb(c, el, mid, 3.0, 2.8, bias);
  const g = M().L(mid, h, 2.8, 2.5); paint(c, g, GOLD, { amp: 1.7, dome: 2, dith: 0.25, bias: bias * 0.6 });
  // языки позолоты на коже выше границы
  const dir = nrm([h[0] - el[0], h[1] - el[1]]), nv: V2 = [-dir[1], dir[0]];
  for (let k = -2; k <= 2; k++) {
    const len = 0.6 + 1.6 * hash(k, from * 10);
    const p0 = add(add(mid, nv, k * 0.55), dir, 0.2), p1 = add(p0, dir, -len);
    const t = M().L(p0, p1, 0.7, 0.5); paint(c, t, GOLD, { amp: 1, dome: 1, dith: 0, bias: -0.5 + bias * 0.5 });
  }
  const band = (u: number, col: C, col2: C, w = 1.6) => {
    const p = lerp(el, h, u);
    const m = M().L(add(p, nv, -w), add(p, nv, w), 0.9); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m.has(x, y)) c.set(x, y, (x + y) % 3 ? col : col2);
  };
  sinew(c, el, mid, 0.7, 0.1, 0.9);
  if (kind === "hang") { shackle(c, lerp(el, h, 0.6), dir, 2.0); chain(c, add(lerp(el, h, 0.6), nv, -1.4), 5, 1); band(0.74, GOLD[4], GOLD[2], 1.8); band(0.87, GOLD[3], GOLD[1], 1.7); }
  else { band(0.3, ROPE[3], ROPE[1], 1.9); band(0.4, ROPE[2], ROPE[0], 1.9); shackle(c, lerp(el, h, 0.62), dir, 2.0); chain(c, add(lerp(el, h, 0.62), nv, 1.4), 4, -1); band(0.84, GOLD[4], GOLD[2], 1.7); }
}
/** Золотая кисть: «claw» — растопыренные пальцы (тянется), «droop» — пальцы свисают. */
function hand(c: Cv, h: V2, dir: V2, kind: "claw" | "droop", bias: number) {
  const d = nrm(dir);
  const pm = M().D(add(h, d, 0.5), 2.3); paint(c, pm, GOLD, { amp: 1.6, dome: 2, dith: 0.2, bias: bias + 0.3 });
  const sp = kind === "claw" ? [-0.85, -0.3, 0.2, 0.7] : [-0.3, -0.1, 0.1, 0.3];
  const ln = kind === "claw" ? [3.2, 4.1, 4.1, 3.5] : [3.6, 4.3, 4.2, 3.5];
  sp.forEach((a, i) => {
    const base = add(h, d, 1.5), tip = add(base, rot(d, a), ln[i]);
    const knuckle = add(base, rot(d, a * (kind === "claw" ? 0.6 : 1)), ln[i] * 0.55);
    const f = M().L(base, knuckle, 1.3, 1.15).L(knuckle, tip, 1.15, 0.75);
    paint(c, f, GOLD, { amp: 1.4, dome: 1, dith: 0.1, bias: bias + (i === 1 || i === 2 ? 0.4 : 0) });
  });
  const th = add(h, rot(d, kind === "claw" ? 1.35 : 0.9), 2.2), tm = M().L(add(h, d, 0.6), th, 1.1, 0.8);
  paint(c, tm, GOLD, { amp: 1.4, dome: 1, dith: 0.1, bias });
  // натёки: золото стекает с пальцев и капает
  sp.forEach((a, i) => {
    if (kind === "claw" && (i === 0 || i === 3)) return;
    const tip = add(add(h, d, 1.5), rot(d, a), ln[i]), n = kind === "droop" ? 2 + (i % 2) : 1 + (i % 2);
    for (let k = 1; k <= n; k++) px2(c, [tip[0], tip[1] + k], k === n ? GOLD[4] : GOLD[3]);
    const hv = hash(Math.round(tip[0] * 3), Math.round(tip[1] * 3));
    if (hv > 0.35) px2(c, [tip[0], tip[1] + n + 1.5 + hv * 2], GOLD[5]);
  });
  px2(c, add(h, d, 0.2), GOLD[5]);
}
/** Нога: тощее бедро, колено, обмотки на голени с золотыми кольцами, обмотанная стопа. */
function leg(c: Cv, hip: V2, knee: V2, ank: V2, foot: V2[], bias: number) {
  limb(c, hip, knee, 5.0, 3.8, bias);
  limb(c, knee, ank, 3.6, 3.0, bias - 0.1);
  const kn = M().D(knee, 1.8); paint(c, kn, SKIN, { amp: 1.6, dome: 2, dith: 0.2, bias: bias + 0.4 });
  const w0 = lerp(knee, ank, 0.22), wm = M().L(w0, ank, 4.2, 3.8); const d = paint(c, wm, WRAP, { amp: 1.4, dome: 2, dith: 0.3, bias });
  // витки обмотки: тёмная бороздка через 3 px (2×)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (wm.has(x, y) && d[y * W + x] > 1 && (y + Math.round(x * 0.5)) % 4 === 0) c.set(x, y, WRAP[1]);
  for (const u of [0.3, 0.6]) {
    const p = lerp(w0, ank, u), dir = nrm([ank[0] - w0[0], ank[1] - w0[1]]), nv: V2 = [-dir[1], dir[0]];
    const r = M().L(add(p, nv, -2.4), add(p, nv, 2.4), 1.3); paint(c, r, GOLD, { amp: 1.8, dome: 1, dith: 0, bias: bias + 0.6 });
  }
  sinew(c, hip, knee, 1.3, 0.2, 0.8);
  { const dir = nrm([ank[0] - w0[0], ank[1] - w0[1]]), q = lerp(w0, ank, 0.9); shackle(c, q, dir, 2.6); chain(c, [q[0] + 1.6, q[1] + 0.6], 5, 1, 76); }
  const f = M().P(foot); const df = paint(c, f, WRAP, { amp: 1.3, dome: 2, dith: 0.3, bias: bias - 0.3 });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (f.has(x, y) && df[y * W + x] > 1 && (x + y) % 5 === 0) c.set(x, y, WRAP[1]);
}
/** Корона: обод и зубцы (гребень пяти шипов, средний выше). pts — обод (4 точки), spikes — [основание, высота, ширина]. */
function crown(c: Cv, band: V2[], spikes: [V2, number, number, number][]) {
  for (const [b, h, w, lean] of spikes) {
    const m = M().P([[b[0] - w, b[1] + 0.5], [b[0] + w, b[1] + 0.5], [b[0] + lean, b[1] - h]]);
    paint(c, m, GOLD, { amp: 1.8, dome: 1, dith: 0, bias: 0.3 });
    if (h > 3) px2(c, [b[0] + lean, b[1] - h + 0.6], GOLD[5]);
  }
  const m = M().P(band); const d = paint(c, m, GOLD, { amp: 1.8, dome: 2, dith: 0.1, bias: 0.2 });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m.has(x, y) && d[y * W + x] === 2 && x % 3 === 0) c.set(x, y, GOLD[5]);
}
/** Кайма подола: нижние 3 px (2×) — тусклое золото, ещё полоска выше. */
function hemTrim(c: Cv, m: Mk, minY: number) {
  for (let y = Math.ceil(minY * Z); y < W; y++) for (let x = 0; x < W; x++) {
    if (!m.has(x, y)) continue;
    if (!m.has(x, y + 1) || !m.has(x, y + 2)) c.set(x, y, TGOLD[(x >> 1) % 3 === 0 ? 3 : 2]);
    else if (!m.has(x, y + 3)) c.set(x, y, TGOLD[0]);
    else if (!m.has(x, y + 5) && m.has(x, y + 6) === false) c.set(x, y, TGOLD[(x % 4) ? 1 : 2]);
  }
}
/** Складки ткани: тёмная борозда и светлая кромка. */
function folds(c: Cv, m: Mk, lines: [V2, V2][]) {
  for (const [a, b] of lines) {
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const p = lerp(a, b, i / n), x = Math.round(p[0] * Z), y = Math.round(p[1] * Z);
      if (m.has(x, y) && m.has(x + 1, y)) { c.set(x, y, CLOTH[1]); c.set(x + 1, y, CLOTH[4]); }
    }
  }
}
/** Верёвка: цепочка дисков 1 px (1×) с витками. */
function rope(c: Cv, p0: V2, p1: V2, p2: V2, t = 1.1) {
  const m = M().B(p0, p1, p2, t, t * 0.9); const d = paint(c, m, ROPE, { amp: 1.3, dome: 1, dith: 0.2, bias: 0.2 });
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (m.has(x, y) && d[y * W + x] >= 1 && (x + y) % 3 === 0) c.set(x, y, ROPE[1]);
}
function ropeLoop(c: Cv, ctr: V2, rx: number, ry: number, a0: number, gap: number) {
  const n = 80;
  for (let i = 0; i <= n; i++) {
    const a = a0 + gap / 2 + (i / n) * (2 * PI - gap), p: V2 = [ctr[0] + COS(a) * rx, ctr[1] + SIN(a) * ry];
    const m = M().D(p, 0.55); paint(c, m, ROPE, { amp: 1, dome: 1, dith: 0, bias: SIN(a) < 0 ? -0.6 : 0.6 });
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
/** Рука по IK; возвращает фактическую кисть и локоть. */
function arm(c: Cv, s: V2, f: V2, pole: V2, kind: "glow" | "hang", bias: number): { el: V2; h: V2 } {
  const L1 = 10.6, L2 = 10.6;
  const el = ik2(s, f, L1, L2, pole);
  const d = Math.hypot(f[0] - s[0], f[1] - s[1]), h = d > L1 + L2 - 0.05 ? lerp(s, f, (L1 + L2 - 0.05) / d) : f;
  limb(c, s, el, 3.7, 3.1, bias);
  const sh = M().D(s, 2.6); paint(c, sh, SKIN, { amp: 1.8, dome: 3, dith: 0.3, bias: bias + 0.2 });
  sinew(c, s, el, 1.0);
  px2(c, el, SKIN[5]);
  forearm(c, el, h, kind === "glow" ? 0.42 : 0.55, bias, kind);
  hand(c, h, [h[0] - el[0], h[1] - el[1]], kind === "glow" ? "claw" : "droop", bias);
  return { el, h };
}

// ---------------- поза ----------------
export interface Pose {
  /** подъём тела (минус — вверх), присед, сутулость (сдвиг рядов вперёд выше пояса), сдвиг по x, наклон/сжатие фигуры вокруг ступней */
  bob: number; squat: number; lean: number; dx: number; tilt: number; sy: number;
  head: V2;
  /** кисти: светящаяся (тянется вперёд), свисающая — сдвиг от покоя в координатах вида вбок (вперёд — минус x) */
  nh: V2; fh: V2;
  legA: V2; legB: V2;
  /** на колени 0..1 (гибель) */
  kneel: number;
  /** свечение рук 0..2; позолота от ступней 0..1 (гибель) */
  glow: number; gild: number;
  /** верёвка: 0 висит, 1 крутится над головой, 2 брошена (ropeT — вылет 0..1); sw — раскачивание; ra — угол витка */
  ropeMode: number; ropeT: number; sw: number; ra: number;
  /** эффекты: монеты (вылет 0..1), золотые пылинки вокруг (0..1), кольцо-корни у ступней (0..1), вспышка у кисти, пыль, звёзды оглушения */
  coins: number; aura: number; ring: number; flash: number; dust: V2; stars: number;
  /** номер кадра для мерцания */
  seed: number;
}
export const REST: Pose = {
  bob: 0, squat: 0, lean: 0.16, dx: 0, tilt: 0, sy: 1, head: [0, 0], nh: [0, 0], fh: [0, 0], legA: [0, 0], legB: [0, 0], kneel: 0,
  glow: 1, gild: 0, ropeMode: 0, ropeT: 0, sw: 0, ra: 0, coins: 0, aura: 0, ring: 0, flash: 0, dust: [0, 0], stars: 0, seed: 0,
};
export type ViewId = "side" | "front" | "back";
interface Frame { img: Cv; anchors: { hG: V2; hH: V2; head: V2; feet: V2; fwd: V2 }; eyes: V2[] }

const GLOW_REST_SIDE: V2 = [20.5, 35], HANG_REST_SIDE: V2 = [48, 49];

/** Вид вбок: лицом влево, сутулый, светящаяся рука тянется вперёд. */
function renderSide(p: Pose): Frame {
  const c = new Cv(W, W), K = p.lean, bs = p.bob + p.squat, sq = p.squat;
  const U = (x: number, y: number): V2 => [x - K * Math.max(0, 46 - y) + p.dx, y + bs];
  const HS = 1.12, Hd = (x: number, y: number): V2 => { const q = U(33 + (x - 33) * HS, 8 + (y - 8) * HS); return [q[0] + p.head[0], q[1] + p.head[1]]; };
  const fG: V2 = [GLOW_REST_SIDE[0] + p.nh[0] + p.dx, GLOW_REST_SIDE[1] + p.nh[1] + bs * 0.5];
  const fH: V2 = [HANG_REST_SIDE[0] + p.fh[0] + p.dx, HANG_REST_SIDE[1] + p.fh[1] + bs * 0.7];
  // дальняя рука (за телом)
  const far = arm(c, U(46, 22), fH, [1, 0.1], "hang", -0.9);
  // ноги
  const lg = (hip: V2, knee: V2, ank: V2, off: V2, bias: number) => {
    const kn = p.kneel, h: V2 = [hip[0] + p.dx, hip[1] + sq + p.bob * 0.3];
    const k: V2 = lerp([knee[0] - sq * 0.75 + off[0] * 0.5, knee[1] + sq * 0.45 + off[1] * 0.5], [h[0] - 4, 72], kn);
    const a: V2 = lerp([ank[0] + off[0], ank[1] + off[1]], [k[0] + 8.5, 73], kn);
    leg(c, h, k, a, [[a[0] - 4.8, a[1] + 1.6], [a[0] - 0.5, a[1] - 0.6], [a[0] + 1.8, a[1] + 0.6], [a[0] + 1.6, a[1] + 3.5], [a[0] - 4.8, a[1] + 3.5]], bias);
  };
  lg([44, 51], [44.5, 62], [45.5, 73], p.legB, -0.6);
  lg([39.5, 51], [37, 62], [36, 73], p.legA, 0);
  // висящая верёвка (за ногой ближе к зрителю — перед туловищем рисуется позже рука)
  // туловище
  const torso = M().P([U(36, 18), U(44, 17), U(49, 20.5), U(50, 27), U(48.5, 36), U(46.5, 43), U(38, 43), U(38.2, 37.5), U(36, 33), U(34.5, 28), U(34.5, 22)]);
  paint(c, torso, SKIN, { amp: 2.0, dome: 5, dith: 0.3 });
  // рёбра, впалый живот, позвонки
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5 - (i > 2 ? 1 : 0); j++) { const q = U(35.4 + j * 0.95 + i * 0.3, 24.2 + i * 2.2 + j * 0.45); px2(c, q, j < 2 ? SKIN[6] : SKIN[5]); px2(c, [q[0], q[1] + 1], SKIN[1]); }
  for (let y = 34; y < 41; y++) { px2(c, U(38.6 + (y - 34) * 0.05, y), y < 36 ? SKIN[1] : SKIN[2]); px2(c, U(40, y), SKIN[4]); }
  for (let i = 0; i < 8; i++) { const q = U(48.6 - i * 0.2, 21 + i * 2.2); px2(c, q, i % 2 ? SKIN[3] : SKIN[6]); px2(c, [q[0] - 1, q[1]], SKIN[2]); }
  for (let i = 0; i < 4; i++) px2(c, U(44.5 + i * 0.6, 23 + i * 1.2), SKIN[2]);
  const neck = M().L(U(37.5, 15), U(39, 20), 3.6, 4); paint(c, neck, SKIN, { amp: 1.5, dome: 2, dith: 0.3, bias: -0.3 });
  // туника
  const tunic = M().P([U(37.5, 37), U(48, 33), U(48.8, 37), ...ragged(51, 32, 50.5, 9, 2.6, 3, p.sw).map(([x, y]) => [x + p.dx, y + sq] as V2), U(33.5, 46), U(35.8, 38)]);
  paint(c, tunic, CLOTH, { amp: 1.3, dome: 4, dith: 0.35 });
  folds(c, tunic, [[U(38, 42), [35 + p.dx, 52 + sq]], [U(42, 42), [41 + p.dx, 53 + sq]], [U(46, 41), [47.5 + p.dx, 52 + sq]]]);
  hemTrim(c, tunic, 44 + sq);
  const strap = M().L(U(46.5, 19), U(39.5, 31), 3.4, 3.8); paint(c, strap, CLOTH, { amp: 1.4, dome: 2, dith: 0.3, bias: 0.3 });
  rope(c, U(35.5, 40), U(42, 41.5), U(49, 40), 1.9);
  rope(c, U(47, 20), U(43, 28), U(37, 33), 1.3);
  { const kn = M().D(U(37, 41), 1.4); paint(c, kn, ROPE, { amp: 1.2, dome: 1, bias: 0.3 }); rope(c, U(37, 41.5), U(36.5 + p.sw * 0.4, 44.5), U(36 + p.sw * 0.8, 48), 1); }
  // волосы за головой — до лопаток, локонами
  for (let k = 2; k >= 0; k--) {
    const L = M().P([Hd(33 + k * 1.2, 7.8 + k * 0.5), Hd(36.5 + k * 0.6, 8.4 + k), Hd(39 + k * 0.8, 14), Hd(40.5 + k * 0.9 + p.sw * 0.3, 21 + k * 1.8), Hd(38.8 + k * 0.8, 22 + k * 2), Hd(36.4 + k * 0.5, 16)]);
    const dh = paint(c, L, HAIR, { amp: 1.8, dome: 2, dith: 0.3, bias: 0.5 - k * 0.45 }); strands(c, L, dh, 0.6);
  }
  // голова: профиль влево, впалая щека
  const skull = M().E(Hd(32.6, 12), 3.9, 4.8).P([Hd(29.3, 10), Hd(28.2, 13.2), Hd(29.4, 14), Hd(30.5, 16), Hd(33, 16)]);
  paint(c, skull, SKIN, { amp: 1.9, dome: 2, dith: 0.25, bias: 0.4 });
  const eyeP = Hd(30.6, 12.2), eb = Hd(30.4, 12);
  pxo(c, eb, 0, -2, SKIN[6]); pxo(c, eb, 1, -2, SKIN[5]); pxo(c, eb, -1, -1, SKIN[4]);
  pxo(c, eb, 0, -1, SKIN[1]); pxo(c, eb, 1, -1, SKIN[0]);
  pxo(c, eb, 0, 0, GOLD[4]); pxo(c, eb, 1, 0, SKIN[0]); pxo(c, eb, -1, 0, SKIN[2]);
  pxo(c, eb, 0, 1, SKIN[1]); pxo(c, eb, 1, 1, SKIN[2]);
  pxo(c, eb, 1, 2, SKIN[6]); pxo(c, eb, 2, 2, SKIN[5]); pxo(c, eb, 1, 3, SKIN[1]); pxo(c, eb, 2, 3, SKIN[1]);
  pxo(c, eb, -2, 1, SKIN[6]); pxo(c, eb, -2, 2, SKIN[4]);
  pxo(c, eb, 3, -1, SKIN[2]); pxo(c, eb, 4, 0, SKIN[3]); pxo(c, eb, 4, 1, SKIN[1]);
  const hairT = M().P([Hd(30.6, 8.4), Hd(33.5, 7.2), Hd(36.5, 8.2), Hd(37.4, 12), Hd(36.2, 15.5), Hd(35, 11.5), Hd(32.5, 9.4)]);
  const dht = paint(c, hairT, HAIR, { amp: 1.8, dome: 2, dith: 0.3, bias: 0.6 }); strands(c, hairT, dht, 0.6);
  for (let k = 1; k >= 0; k--) {
    const B = k ? M().P([Hd(31.5, 15.4), Hd(34, 16.2), Hd(34.4, 19.5), Hd(33.6, 24), Hd(32.6, 22)])
      : M().P([Hd(29, 15.2), Hd(31.8, 15.8), Hd(33, 19), Hd(32.4, 24), Hd(31.4 - p.sw * 0.2, 29.5), Hd(30.4, 24.5), Hd(29.3, 19)]);
    const db = paint(c, B, HAIR, { amp: 1.8, dome: 2, dith: 0.3, bias: k ? -0.2 : 0.5 }); strands(c, B, db, 0.7);
  }
  pxo(c, Hd(29.1, 14.6), 0, 0, HAIR[0]); pxo(c, Hd(29.1, 14.6), 1, 0, HAIR[4]); pxo(c, Hd(29.1, 14.6), 0, 1, HAIR[3]);
  crown(c, [Hd(29.2, 8.1), Hd(36.8, 7.0), Hd(37, 9.3), Hd(29.4, 10.4)],
    [[Hd(29.9, 8.4), 3.0, 0.75, -0.5], [Hd(31.3, 8.1), 2.0, 0.55, -0.3], [Hd(32.7, 7.9), 4.0, 0.85, -0.2], [Hd(34.2, 7.6), 5.0, 1.0, 0], [Hd(35.7, 7.3), 3.4, 0.8, 0.3], [Hd(36.8, 7.1), 2.0, 0.55, 0.4]]);
  // ближняя рука — тянется вперёд
  const near = arm(c, U(41, 22), fG, [0.25, 1], "glow", 0);
  drawRope(c, p, near.h, near.el, [-1, 0.15]);
  const headA = Hd(32.6, 4);
  return { img: c, anchors: { hG: near.h, hH: far.h, head: headA, feet: [40.5 + p.dx, 76], fwd: [-1, 0] }, eyes: [eyeP] };
}

/** Пряди: светлые штрихи вниз по маске. */
function strands(c: Cv, m: Mk, d: Int16Array, dens: number) {
  for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) {
    if (!m.has(x, y) || !m.has(x + 1, y + 1) || d[y * W + x] < 2) continue;
    const h = hash(x >> 1, Math.floor(y / 6));
    const col = h < dens * 0.25 ? HAIR[5] : h < dens * 0.55 ? HAIR[4] : h < dens * 0.85 ? HAIR[3] : h > 1 - dens * 0.4 ? HAIR[0] : null;
    if (col) { c.set(x, y, col); c.set(x + 1, y, col); c.set(x, y + 1, col); c.set(x + 1, y + 1, col); }
  }
}

/** Верёвка в руке: висит петлёй, крутится над головой или летит арканом вперёд (fwd — направление «вперёд» в кадре). */
function drawRope(c: Cv, p: Pose, h: V2, el: V2, fwd: V2) {
  const wr = lerp(el, h, 0.78);
  if (p.ropeMode < 0.5) {
    const s = p.sw;
    const ly = Math.min(12, (74 - wr[1]) / 2 - 1);
    ropeLoop(c, [wr[0] - 1.5 + s * 0.6, wr[1] + ly], 3.2, ly, -PI / 2 + s * 0.05, 0.35);
    rope(c, wr, [wr[0] + 3 + s * 1.5, 74], [wr[0] + 10 + s * 2, 75.5], 0.95);
  } else if (p.ropeMode < 1.5) {
    const ctr: V2 = [h[0] + fwd[0] * 1.5, h[1] - 2.5];
    rope(c, wr, [h[0], h[1] - 1], [ctr[0] + COS(p.ra) * 10, ctr[1] + SIN(p.ra) * 2.2], 1.1);
    ropeLoop(c, ctr, 10, 2.3, p.ra, 0.5);
  } else {
    const t = p.ropeT, far: V2 = fwd[1] > 0.5 ? [h[0] - 4, 63] : fwd[1] < -0.5 ? [h[0] + 6, 8] : [5, 52];
    const end = lerp(wr, far, t), sag = 6 * (1 - t) + 2;
    rope(c, wr, [(wr[0] + end[0]) / 2, Math.max(wr[1], end[1]) + sag], end, 1.1);
    const lr = fwd[1] > 0.5 ? 5.5 : fwd[1] < -0.5 ? 3 : 3.6;
    ropeLoop(c, [end[0] + fwd[0] * lr * 0.8, end[1] + 1 + Math.abs(fwd[1]) * lr * 0.3], lr * (0.4 + 0.6 * t), lr * (fwd[1] ? 0.45 : 0.9) * (0.4 + 0.6 * t), p.ra, 0.3);
  }
}

/** Вид спереди / сзади. Светящаяся рука — его правая: слева на экране спереди, справа — со спины. */
function renderFront(p: Pose, back: boolean): Frame {
  const c = new Cv(W, W), g = back ? 1 : -1, hS = -g, sq = p.squat, bs = p.bob + p.squat;
  const droop = Math.max(-1, (p.lean - 0.16) * 9);
  const U = (x: number, y: number): V2 => [x + p.dx, y + bs + (y < 30 ? droop * (30 - y) / 20 : 0)];
  const hdx = -p.head[0] * 0.3 * g * (back ? -1 : 1) * 0;
  const HS = 1.12, Hd = (x: number, y: number): V2 => { const q = U(40 + (x - 40) * HS, 8 + (y - 8) * HS); return [q[0] + hdx + p.head[0] * 0.25, q[1] + p.head[1] + Math.max(0, -p.head[0]) * 0.15]; };
  const mapH = (v: V2): V2 => [-v[0] * 0.35 * g, v[1] + Math.max(0, -v[0]) * 0.1];
  const fG: V2 = add([40 + g * 21.5 + p.dx, 38.5 + bs * 0.5], mapH(p.nh));
  const fH: V2 = add([40 + hS * 13.5 + p.dx, 50 + bs * 0.7], [-p.fh[0] * 0.35 * hS, p.fh[1]]);
  // ноги
  const fr = (v: V2): V2 => [0, v[1] - v[0] * 0.15];
  for (const s of [-1, 1]) {
    const off = fr(s < 0 ? p.legA : p.legB), a: V2 = [40 + s * 4.6 + p.dx * 0.3, 73 + off[1]];
    const hip: V2 = [40 + s * 3.6 + p.dx, 51 + sq + p.bob * 0.3];
    const knee: V2 = lerp([40 + s * (4.4 + sq * 0.15) + p.dx * 0.6, Math.min(71, 62 + sq * 0.7 + off[1] * 0.5)], [40 + s * 5 + p.dx, 71.5], p.kneel);
    if (p.kneel > 0) { const t: V2 = lerp(a, [knee[0], 73.5], p.kneel); a[0] = t[0]; a[1] = t[1]; }
    const foot: V2[] = back ? [[a[0] - 2.6, a[1] + 0.8], [a[0] + 2.6, a[1] + 0.8], [a[0] + 2.8, a[1] + 3.5], [a[0] - 2.8, a[1] + 3.5]]
      : [[a[0] - 2.4, a[1] + 0.5], [a[0] + 2.4, a[1] + 0.5], [a[0] + 3.3 * (s * 0.3 + 1), a[1] + 3.6], [a[0] - 3.3 * (1 - s * 0.3), a[1] + 3.6]];
    leg(c, hip, knee, a, foot, s === g ? -0.1 : 0.1);
  }
  // туловище
  const torso = M().P([U(31, 20), U(49, 20), U(48.5, 26), U(46.5, 33), U(45.5, 41), U(34.5, 41), U(33.5, 33), U(31.5, 26)]);
  paint(c, torso, SKIN, { amp: 2.0, dome: 6, dith: 0.3, bias: back ? -0.2 : 0 });
  if (!back) {
    // ключицы, грудина, рёбра, впалый живот
    for (const s of [-1, 1]) {
      for (let j = 1; j < 8; j++) { const q = U(40 + s * j, 21 - j * 0.08); px2(c, q, j < 5 ? SKIN[6] : SKIN[5]); px2(c, [q[0], q[1] + 1], SKIN[2]); }
      for (let j = 1; j < 6; j++) px2(c, U(40 + s * (1 + j), 24.4 + j * 0.15), SKIN[2]);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 6 - i; j++) {
        const q = U(40 + s * (1.6 + j), 26 + i * 2.2 + j * 0.42); px2(c, q, j > 3 - i * 0.5 ? SKIN[4] : SKIN[5]); px2(c, [q[0], q[1] + 1], i === 0 || j > 2 ? SKIN[1] : SKIN[2]);
      }
      for (let y = 34.5; y < 40; y++) px2(c, U(40 + s * (3.2 - (y - 34.5) * 0.25), y), SKIN[1]);
    }
    for (let y = 22; y < 33; y++) px2(c, U(40, y), y % 2 ? SKIN[2] : SKIN[3]);
    for (let x = -3; x <= 3; x++) px2(c, U(40 + x, 34.4 + Math.abs(x) * 0.2), SKIN[1]);
    for (let y = 35.5; y < 40; y++) px2(c, U(40, y), SKIN[4]);
  } else {
    for (let y = 21; y < 40; y++) { px2(c, U(40, y), y % 2 ? SKIN[1] : SKIN[2]); if (y % 2 === 0) px2(c, U(40, y - 0.5), SKIN[5]); }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 9; i++) { const u = i / 8, q = U(40 + s * (2.5 + 4.2 * SIN(u * PI)), 22.5 + u * 7.5); px2(c, q, SKIN[1]); px2(c, [q[0] - s, q[1]], SKIN[5]); }
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const q = U(40 + s * (6 + j), 31 + i * 2 + j * 0.4); px2(c, q, SKIN[4]); px2(c, [q[0], q[1] + 1], SKIN[1]); }
    }
  }
  for (const s of [-1, 1]) { const sh = M().D(U(40 + s * 9.8, 21.6), 3.1); paint(c, sh, SKIN, { amp: 1.6, dome: 3, dith: 0.3, bias: 0.15 }); }
  const neck = M().L(U(40, 15), U(40, 20.5), 4.2, 4.6); paint(c, neck, SKIN, { amp: 1.4, dome: 2, dith: 0.3, bias: -0.4 });
  // туника: срезана по диагонали с плеча
  const tg = g; // ремень туники — через плечо светящейся руки
  const tunic = M().P([U(40 + tg * 8.5, 31), U(40 - tg * 1, 36.5), U(40 - tg * 8, 38.5), U(40 - tg * 8.2, 41), U(40 - tg * 9.5, 46),
    ...ragged(51.5, 28.5, 50.5, 11, 2.8, 7, p.sw * 0.5).map(([x, y]) => [x + p.dx, y + sq] as V2), U(40 + tg * 9.5, 46), U(40 + tg * 8.6, 40)]);
  paint(c, tunic, CLOTH, { amp: 1.3, dome: 5, dith: 0.35, bias: back ? -0.3 : 0 });
  folds(c, tunic, [[U(35, 42), [33.5 + p.dx, 53 + sq]], [U(39, 42), [38.5 + p.dx, 54 + sq]], [U(42.5, 42), [43 + p.dx, 54 + sq]], [U(46, 42), [48 + p.dx, 53 + sq]]]);
  hemTrim(c, tunic, 44 + sq);
  const strap = M().L(U(40 + tg * 9.6, 20.2), U(40 + tg * 5, 33), 3.2, 3.6); paint(c, strap, CLOTH, { amp: 1.4, dome: 2, dith: 0.3, bias: 0.3 });
  rope(c, U(40 + tg * 9, 20.5), U(40 + tg * 1, 28), U(40 - tg * 8, 35), 1.3);
  rope(c, U(33.5, 40.5), U(40, 42), U(46.5, 40.5), 1.9);
  { const kx = 40 + hS * 3.4, kn = M().D(U(kx, 41.5), 1.4); paint(c, kn, ROPE, { amp: 1.2, dome: 1, bias: 0.3 }); rope(c, U(kx, 42), U(kx + p.sw * 0.3, 45), U(kx - 0.6 + p.sw * 0.6, 49), 1); }
  // руки
  const armG = arm(c, U(40 + g * 10.2, 22), fG, [g, 0.35], "glow", back ? -0.2 : 0);
  const armH = arm(c, U(40 + hS * 10.2, 22), fH, [hS, 0], "hang", back ? -0.3 : -0.1);
  drawRope(c, p, armG.h, armG.el, back ? [0, -1] : [0, 1]);
  // голова
  let eyes: V2[] = [];
  if (!back) {
    // пряди по бокам — отдельные локоны
    for (const s of [-1, 1]) for (let k = 2; k >= 0; k--) {
      const o = k * 0.8, L = M().P([Hd(40 + s * (3.3 + o * 0.3), 8.8 + k * 0.4), Hd(40 + s * (5.3 + o * 0.5), 10.5 + k), Hd(40 + s * (5.9 + o * 0.6) + p.sw * 0.2, 17 + k), Hd(40 + s * (5.4 + o * 0.6), 22.5 + k * 1.2), Hd(40 + s * (4.4 + o * 0.4), 23 + k * 0.8), Hd(40 + s * (4.2 + o * 0.3), 15)]);
      const dh = paint(c, L, HAIR, { amp: 1.8, dome: 2, dith: 0.3, bias: 0.6 - k * 0.5 }); strands(c, L, dh, 0.6);
    }
    const face = M().E(Hd(40, 12.4), 3.8, 4.7).P([Hd(36.8, 13.5), Hd(43.2, 13.5), Hd(41.6, 17.6), Hd(38.4, 17.6)]);
    paint(c, face, SKIN, { amp: 1.9, dome: 2, dith: 0.25, bias: 0.5 });
    eyes = [Hd(37.9, 12.2), Hd(42.1, 12.2)];
    for (const s of [-1, 1]) {
      const b = Hd(40 + s * 2.1, 12.2), o = (dx: number, dy: number, col: C) => pxo(c, b, dx * s, dy, col);
      o(0, -2, SKIN[6]); o(-1, -2, SKIN[5]); o(1, -2, SKIN[4]);
      o(-1, -1, SKIN[1]); o(0, -1, SKIN[0]); o(1, -1, SKIN[1]);
      o(-1, 0, SKIN[0]); o(0, 0, GOLD[4]); o(1, 0, SKIN[0]);
      o(0, 1, SKIN[1]); o(1, 1, SKIN[2]);
      o(1, 2, SKIN[6]); o(2, 2, SKIN[4]); o(1, 3, SKIN[1]); o(0, 3, SKIN[2]);
      o(2, -1, SKIN[2]);
    }
    const nb = Hd(39.6, 12.4);
    pxo(c, nb, 0, -1, SKIN[5]); pxo(c, nb, 0, 0, SKIN[6]); pxo(c, nb, 0, 1, SKIN[5]); pxo(c, nb, 1, 1, SKIN[2]); pxo(c, nb, 0, 2, SKIN[1]); pxo(c, nb, 1, 2, SKIN[1]);
    pxo(c, Hd(39.6, 9.8), 0, 0, SKIN[6]); pxo(c, Hd(39.6, 9.8), 1, 0, SKIN[5]);
    const hairT = M().P([Hd(36.2, 9.4), Hd(40, 7.6), Hd(43.8, 9.4), Hd(42.5, 9.8), Hd(40, 9), Hd(37.5, 9.8)]); paint(c, hairT, HAIR, { amp: 1.6, dome: 1, dith: 0.3, bias: 0.6 });
    // борода тремя локонами
    for (const k of [-1, 1, 0]) {
      const B = k === 0 ? M().P([Hd(38.2, 16), Hd(41.8, 16), Hd(41.9, 21), Hd(40.8 + p.sw * 0.2, 30.5), Hd(39.6, 30.5), Hd(38.3, 22)])
        : M().P([Hd(40 + k * 3.4, 14.6), Hd(40 + k * 1.2, 16), Hd(40 + k * 1, 21), Hd(40 + k * 1.8, 27), Hd(40 + k * 2.8, 24), Hd(40 + k * 3.6, 19)]);
      const db = paint(c, B, HAIR, { amp: 1.8, dome: 2, dith: 0.3, bias: k === 0 ? 0.6 : 0.1 }); strands(c, B, db, 0.7);
    }
    const mb = Hd(38.4, 16.2);
    for (let x = 0; x < 4; x++) pxo(c, mb, x, 0, x === 0 || x === 3 ? HAIR[4] : HAIR[0]);
    pxo(c, mb, -1, 1, HAIR[3]); pxo(c, mb, 4, 1, HAIR[3]);
    crown(c, [Hd(35.4, 7.9), Hd(44.6, 7.9), Hd(44.4, 10.3), Hd(35.6, 10.3)],
      [[Hd(35.9, 8.2), 3.0, 0.75, -0.6], [Hd(37.4, 8.0), 1.8, 0.55, -0.3], [Hd(38.7, 7.9), 3.8, 0.85, -0.2], [Hd(40, 7.9), 5.0, 1.05, 0], [Hd(41.3, 7.9), 3.8, 0.85, 0.2], [Hd(42.6, 8.0), 1.8, 0.55, 0.3], [Hd(44.1, 8.2), 3.0, 0.75, 0.6]]);
  } else {
    // со спины: макушка и локоны с просветами
    const cap = M().E(Hd(40, 11.5), 5.4, 4.6); const dc = paint(c, cap, HAIR, { amp: 1.8, dome: 3, dith: 0.3, bias: 0.6 }); strands(c, cap, dc, 0.6);
    for (let k = 0; k < 6; k++) {
      const x0 = 34.4 + k * 1.95, sk = k - 2.5, len = 22.5 + hash(k, 3) * 4;
      const L = M().P([Hd(x0, 10), Hd(x0 + 2.4, 10), Hd(x0 + 2.6 + sk * 0.25 + p.sw * 0.2, 17), Hd(x0 + 1.9 + sk * 0.5 + p.sw * 0.3, len), Hd(x0 + 0.9 + sk * 0.45, len - 1.6), Hd(x0 - 0.2 + sk * 0.2, 16)]);
      const dh = paint(c, L, HAIR, { amp: 1.8, dome: 2, dith: 0.3, bias: k % 2 ? -0.2 : 0.5 }); strands(c, L, dh, 0.65);
    }
    crown(c, [Hd(35.2, 8.3), Hd(44.8, 8.3), Hd(44.6, 10.6), Hd(35.4, 10.6)],
      [[Hd(35.7, 8.6), 2.8, 0.75, -0.6], [Hd(37.2, 8.4), 1.7, 0.55, -0.3], [Hd(38.6, 8.3), 3.4, 0.85, -0.2], [Hd(40, 8.3), 4.4, 1.05, 0], [Hd(41.4, 8.3), 3.4, 0.85, 0.2], [Hd(42.8, 8.4), 1.7, 0.55, 0.3], [Hd(44.3, 8.6), 2.8, 0.75, 0.6]]);
  }
  return { img: c, anchors: { hG: armG.h, hH: armH.h, head: Hd(40, 3.5), feet: [40 + p.dx, 76], fwd: back ? [0, -1] : [0, 1] }, eyes };
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
/** Позолота: всё ниже линии (ползёт от ступней) перекрашивается по яркости в золото. */
function gilded(c: Cv, k: number): Cv {
  if (k <= 0.001) return c;
  const o = new Cv(c.w, c.h), line = (77 - k * 80) * Z;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    if (!c.has(x, y)) continue;
    const col = c.get(x, y), edge = line + (hash(x >> 1, 9) - 0.5) * 7 + SIN(x * 0.3) * 2;
    if (y < edge) { o.set(x, y, col); continue; }
    const lum = (col[0] * 0.3 + col[1] * 0.59 + col[2] * 0.11) / 255;
    const i = Math.max(0, Math.min(5, Math.round(lum * 9 - 0.4)));
    o.set(x, y, y - edge < 2 ? GOLD[5] : GOLD[i]);
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
const DUST = R("#4a4038", "#6e6050", "#9a8a74", "#c4b49a");

/** Один кадр 80×80: рисунок + свечение (emis). */
export function renderFrame(view: ViewId, pose: Pose): { img: Cv; emis: Cv } {
  const f = view === "side" ? renderSide(pose) : renderFront(pose, view === "back");
  let big = gilded(f.img, pose.gild);
  if (Math.abs(pose.tilt) > 1e-3 || pose.sy !== 1) big = rotCv(big, pose.tilt * (view === "side" ? 1 : view === "front" ? 0.25 : -0.25), 40 * Z, 76 * Z, pose.sy);
  const o = down(big), emis = new Cv(FR, FR);
  const ok = (x: number, y: number) => x >= 1 && y >= 1 && x <= FR - 2 && y <= FR - 2;
  const put = (x: number, y: number, col: C, glow = true) => { x = Math.round(x); y = Math.round(y); if (!ok(x, y)) return; o.set(x, y, col); if (glow) emis.set(x, y, col); };
  const glowOnly = (x: number, y: number, col: C) => { x = Math.round(x); y = Math.round(y); if (ok(x, y) && !emis.has(x, y)) emis.set(x, y, col); };
  const hs = (a: number, b: number) => hash(a + pose.seed * 13.7, b);
  const tl = Math.abs(pose.tilt) < 0.3;
  // свечение золотых рук: ядро, ореол (только в glow), искры
  const gl = pose.glow * (1 - pose.gild);
  if (gl > 0.1 && tl) for (const [h, k] of [[f.anchors.hG, 1], [f.anchors.hH, 0.55]] as [V2, number][]) {
    const r = (1.2 + 1.6 * gl) * k;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const d = Math.hypot(i, j); if (d <= r) glowOnly(h[0] + i, h[1] + j, d < r * 0.4 ? GOLD[5] : d < r * 0.75 ? GOLD[4] : GOLD[3]); }
    if (gl * k > 0.9) for (let i = 0; i < Math.round(5 * gl * k); i++) {
      const a = hs(i, 3) * 2 * PI, rr = 2.5 + hs(5, i) * 4 * gl;
      put(h[0] + COS(a) * rr, h[1] + SIN(a) * rr - hs(i, 8) * 2, hs(i, 11) > 0.5 ? GOLD[5] : GOLD[4]);
    }
  }
  if (tl && pose.gild < 0.5) for (const e of f.eyes) glowOnly(e[0], e[1] + 0.3, GOLD[3]);
  // монеты: веер из кисти вперёд по дуге
  if (pose.coins > 0.02) {
    const h = f.anchors.hG, fw = f.anchors.fwd, k = pose.coins;
    for (let i = 0; i < 9; i++) {
      const spread = (i / 8 - 0.5) * 1.6, v = 10 + hs(i, 21) * 22;
      let x: number, y: number;
      if (fw[1] === 0) { x = h[0] + fw[0] * v * k * COS(spread * 0.4); y = h[1] - 14 * k * (1 - k) * 2 + spread * 10 * k + k * k * 14; }
      else { x = h[0] + spread * 24 * k; y = h[1] + fw[1] * v * k * 0.8 - 10 * k * (1 - k) * 2 + (fw[1] > 0 ? k * k * 12 : 0); }
      const lit = (i + pose.seed) % 2 === 0;
      put(x, y, lit ? GOLD[5] : GOLD[3]); put(x + 1, y, GOLD[2]); put(x, y + 1, GOLD[1], false); put(x + 1, y + 1, lit ? GOLD[3] : GOLD[2]);
    }
  }
  // пылинки золота, поднимающиеся вокруг
  if (pose.aura > 0.02) for (let i = 0; i < Math.round(22 * pose.aura); i++) {
    const x = 40 + (hash(i, 31) - 0.5) * 46, y = 76 - ((hash(i, 37) * 70 + pose.seed * 4 * (0.6 + hash(i, 5))) % 70);
    put(x, y, hash(i, 41) > 0.6 ? GOLD[5] : GOLD[3]);
  }
  // кольцо-корни: золотое кольцо от ступней и вскочившие из земли корни
  if (pose.ring > 0.02) {
    const fp = f.anchors.feet, r = 7 + 30 * pose.ring, ry = 0.28;
    for (let a = 0; a < 96; a++) {
      const t = (a / 96) * 2 * PI, x = fp[0] + COS(t) * r, y = 74 + SIN(t) * r * ry;
      if (hash(a, 3) < 0.9 - pose.ring * 0.4) put(x, y, pose.ring < 0.5 ? GOLD[4] : GOLD[3]);
      if (a % 8 === 0) { const hgt = Math.round((3 + hash(a, 9) * 4) * SIN(Math.min(1, pose.ring * 1.6) * PI)); for (let q = 0; q < hgt; q++) put(x + (q > hgt / 2 ? (a % 16 ? 1 : -1) : 0), y - q, q === hgt - 1 ? GOLD[5] : GOLD[2 + (q % 2)]); }
    }
  }
  // вспышка у кисти
  if (pose.flash > 0.05) { const a = f.anchors.hG, k = pose.flash; for (let q = -Math.round(5 * k); q <= Math.round(5 * k); q++) { put(a[0] + q, a[1], GOLD[q % 2 ? 4 : 5]); put(a[0], a[1] + q, GOLD[q % 2 ? 3 : 4]); if (Math.abs(q) < 3 * k) { put(a[0] + q, a[1] + q, GOLD[4]); put(a[0] + q, a[1] - q, GOLD[4]); } } put(a[0], a[1], GOLD[5]); }
  // звёзды оглушения над короной
  if (pose.stars > 0.05) { const hp = f.anchors.head; for (let i = 0; i < 3; i++) { const a = pose.seed * 0.8 + i * 2.1, x = hp[0] + COS(a) * 7, y = hp[1] - 1 + SIN(a) * 2; put(x, y, GOLD[5]); for (const [i2, j2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + i2, y + j2, GOLD[3]); } }
  // пыль
  const puff = (x: number, y: number, k: number) => { for (let i = 0; i < 14 * k; i++) { const a = hash(i, x) * 6.28, r = hash(y, i) * 5 * k + 1; put(x + COS(a) * r * 1.3, y - Math.abs(SIN(a)) * r * 0.9, DUST[(i % 3) + 1], false); } };
  if (pose.dust[0] > 0.05) puff(f.anchors.feet[0] + 7, 75, pose.dust[0]);
  if (pose.dust[1] > 0.05) puff(f.anchors.feet[0] - 7, 75, pose.dust[1]);
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
    // дискретные поля берём из ближайшего ключа
    q.ropeMode = (t < 0.5 ? { ...REST, ...a.p } : { ...REST, ...b.p }).ropeMode;
    q.seed = i;
    out.push(extra ? { ...q, ...extra(i, q) } : q);
  }
  return out;
};
const loop = (n: number, f: (ph: number, i: number) => Partial<Pose>): Pose[] => Array.from({ length: n }, (_, i) => ({ ...REST, seed: i, ...f((2 * PI * i) / n, i) }));
const TR = [0, 1, 0, -1];

// замахи и стойки умений
const PALM_UP = P({ nh: [-1, -26], lean: 0.05, bob: -1, head: [1, -0.5], glow: 1.7, fh: [-1, -2], legB: [1, 0] });
const COIN_CUP = P({ nh: [9, -8], fh: [-14, -7], lean: 0.2, squat: 1, head: [-1, 1.5], glow: 1.3 });
const ROPE_UP = P({ nh: [5, -28], lean: 0.06, bob: -0.5, head: [1, -0.5], ropeMode: 1, glow: 1.2, fh: [0, -1] });
const CURSE_UP = P({ nh: [8, -26], fh: [-10, -24], lean: 0.02, bob: -1.5, head: [0.5, -1], glow: 2, aura: 0.5 });

export type MidasAnim = "idle" | "walk" | "attack" | "palmWind" | "palmHold" | "palmStrike" | "coinWind" | "coinHold" | "coinThrow"
  | "ropeWind" | "ropeHold" | "ropeThrow" | "curseWind" | "curseHold" | "curseCast" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: MidasAnim; hit?: number };
const POSES: Record<MidasAnim, () => Pose[]> = {
  idle: () => loop(12, (ph) => ({ bob: 0.6 * SIN(ph), head: [0, 0.5 * SIN(ph - 0.6)], nh: [0.6 * SIN(ph + 1), 0.8 * SIN(ph)], fh: [0, 0.4 * SIN(ph - 1)], sw: 0.8 * SIN(ph + 0.5), glow: 1 + 0.25 * SIN(ph), lean: 0.12 + 0.015 * SIN(ph) })),
  walk: () => loop(12, (f) => ({
    legA: [-3.5 * COS(f), -2.6 * Math.max(0, SIN(f))], legB: [3.5 * COS(f), -2.6 * Math.max(0, -SIN(f))],
    bob: 0.8 * COS(2 * f) - 0.3, lean: 0.17 + 0.02 * COS(f), head: [0.4 * COS(f), -0.4 * COS(2 * f)],
    nh: [2.5 * COS(f) - 2, -2 + 1 * SIN(2 * f)], fh: [-3 * COS(f), 0], sw: 2 * SIN(f), glow: 1.1,
  })),
  attack: () => keyed([
    { f: 0, p: {} },
    { f: 2, p: P({ nh: [12, -14], lean: 0.08, head: [1, -0.5], glow: 1.4, sw: 1 }) },
    { f: 4, p: P({ nh: [15, -20], lean: 0.05, head: [1.5, -1], glow: 1.6, legB: [1, 0], sw: 1.5 }) },
    { f: 6, p: P({ nh: [-6, 6], lean: 0.28, head: [-2, 1.5], bob: 1, legA: [-2.5, 0], glow: 1.8, flash: 0.8, sw: -2 }) },
    { f: 8, p: P({ nh: [-3, 4], lean: 0.22, head: [-1.5, 1], glow: 1.3, sw: -1 }) },
    { f: 9, p: {} },
  ], 10),
  palmWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: PALM_UP }], 4),
  palmHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...PALM_UP, seed: i, nh: [-1 + 0.4 * TR[i], -26 + 0.5 * TR[i]] as V2, glow: 1.7 + 0.25 * (i % 2), bob: -1 + 0.3 * TR[i] } as Pose)),
  palmStrike: () => keyed([
    { f: 0, p: PALM_UP },
    { f: 2, p: P({ nh: [-8, -4], lean: 0.3, head: [-2, 1], bob: 0.5, legA: [-3, 0], glow: 2 }) },
    { f: 3, p: P({ nh: [-11, -2], lean: 0.34, head: [-2.5, 1.5], bob: 1, legA: [-3.5, 0], glow: 2, flash: 1, dust: [0, 0.6] }) },
    { f: 5, p: P({ nh: [-10, -1], lean: 0.32, head: [-2, 1.5], bob: 1, legA: [-3, 0], glow: 1.6, flash: 0.4 }) },
    { f: 7, p: P({ nh: [-2, 0], lean: 0.18, glow: 1.2 }) },
  ], 8),
  coinWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: COIN_CUP }], 4),
  coinHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...COIN_CUP, seed: i, squat: 1 + 0.3 * TR[i], glow: 1.3 + 0.2 * (i % 2), aura: 0.15 } as Pose)),
  coinThrow: () => keyed([
    { f: 0, p: COIN_CUP },
    { f: 2, p: P({ nh: [-6, -22], fh: [-16, -18], lean: 0.05, bob: -1.5, head: [0, -1], glow: 1.7, coins: 0.15 }) },
    { f: 3, p: P({ nh: [-8, -24], fh: [-17, -20], lean: 0.04, bob: -1.5, head: [0, -1], glow: 1.8, coins: 0.35, flash: 0.5 }) },
    { f: 5, p: P({ nh: [-7, -18], fh: [-14, -14], lean: 0.08, bob: -1, glow: 1.5, coins: 0.75 }) },
    { f: 7, p: P({ nh: [-2, -4], fh: [-3, -2], lean: 0.12, glow: 1.2, coins: 1 }) },
  ], 8, (i) => (i === 7 ? { coins: 0 } : {})),
  ropeWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: ROPE_UP }], 4),
  ropeHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...ROPE_UP, seed: i, ra: (i / 4) * 2 * PI, nh: [5 + 1.2 * COS((i / 4) * 2 * PI), -28 + 0.8 * SIN((i / 4) * 2 * PI)] as V2 } as Pose)),
  ropeThrow: () => keyed([
    { f: 0, p: ROPE_UP },
    { f: 1, p: P({ nh: [2, -16], lean: 0.25, head: [-1.5, 0.5], ropeMode: 2, ropeT: 0.35, glow: 1.4 }) },
    { f: 2, p: P({ nh: [-8, -6], lean: 0.32, head: [-2, 1], legA: [-3, 0], ropeMode: 2, ropeT: 0.8, glow: 1.5 }) },
    { f: 3, p: P({ nh: [-10, -4], lean: 0.34, head: [-2, 1], legA: [-3, 0], ropeMode: 2, ropeT: 1, glow: 1.5, dust: [0, 0.4] }) },
    { f: 5, p: P({ nh: [6, -6], lean: 0.05, bob: -0.5, legA: [-1, 0], ropeMode: 2, ropeT: 0.45, glow: 1.3, legB: [2, 0] }) },
    { f: 7, p: P({ nh: [2, -1], ropeMode: 0, glow: 1.1 }) },
  ], 8),
  curseWind: () => keyed([{ f: 0, p: {} }, { f: 3, p: CURSE_UP }], 4),
  curseHold: () => Array.from({ length: 4 }, (_, i) => ({ ...REST, ...CURSE_UP, seed: i, bob: -1.5 + 0.4 * TR[i], glow: 1.9 + 0.2 * (i % 2), aura: 0.6 + 0.15 * (i % 2), nh: [8, -26 + 0.6 * TR[i]] as V2, fh: [-10, -24 - 0.6 * TR[i]] as V2 } as Pose)),
  curseCast: () => keyed([
    { f: 0, p: CURSE_UP },
    { f: 2, p: P({ nh: [-4, 10], fh: [-12, 4], lean: 0.3, squat: 2, head: [-2, 2], glow: 2, aura: 0.7, flash: 0.6, dust: [0.6, 0.6] }) },
    { f: 3, p: P({ nh: [-4, 12], fh: [-12, 6], lean: 0.32, squat: 2.5, head: [-2, 2.5], glow: 2, aura: 0.6, ring: 0.15, flash: 1, dust: [1, 1] }) },
    { f: 5, p: P({ nh: [-4, 12], fh: [-12, 6], lean: 0.32, squat: 2.5, head: [-2, 2.5], glow: 1.7, aura: 0.4, ring: 0.45, dust: [0.5, 0.5] }) },
    { f: 7, p: P({ nh: [-2, 6], fh: [-6, 2], lean: 0.24, squat: 1, glow: 1.4, aura: 0.2, ring: 0.8 }) },
    { f: 9, p: P({ glow: 1.1, ring: 1 }) },
  ], 10, (i) => (i === 9 ? { ring: 0 } : {})),
  stun: () => loop(8, (ph) => ({ lean: 0.3, squat: 1.5, tilt: 0.04 * SIN(ph), head: [-1 + SIN(ph), 3], nh: [6, 12], fh: [-2, 4], sw: 1.5 * SIN(ph), legA: [SIN(ph) * 0.6, 0], legB: [-SIN(ph) * 0.6, 0], glow: 0.4 + 0.3 * SIN(ph), stars: 1 })),
  death: () => keyed([
    { f: 0, p: {} },
    { f: 2, p: P({ lean: 0.3, head: [-2, 2], glow: 2, nh: [6, -10], flash: 0.6 }) },
    { f: 4, p: P({ lean: 0.34, head: [-2.5, 2.5], glow: 1.6, nh: [2, -8], squat: 2, gild: 0.15, kneel: 0.15 }) },
    { f: 7, p: P({ squat: 5, kneel: 0.6, lean: 0.36, head: [-3, 4], nh: [2, -10], fh: [-1, 0], glow: 1.2, gild: 0.45 }) },
    { f: 10, p: P({ squat: 8, kneel: 1, lean: 0.34, head: [-3, 5], nh: [0, -12], fh: [-1, 2], glow: 0.6, gild: 0.85, dust: [0.7, 0.7] }) },
    { f: 13, p: P({ squat: 8, kneel: 1, lean: 0.34, head: [-3, 5.5], nh: [0, -12], fh: [-1, 2], glow: 0, gild: 1, aura: 0.25 }) },
  ], 14),
};
const ANIM_ORDER: [MidasAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар золотой лапой", hit: 6 }],
  ["palmWind", { n: 4, fps: 12, loop: false, ru: "вскинул ладонь", next: "palmHold" }],
  ["palmHold", { n: 4, fps: 12, loop: true, ru: "ладонь горит", next: "palmStrike" }],
  ["palmStrike", { n: 8, fps: 12, loop: false, ru: "золотая длань", hit: 3 }],
  ["coinWind", { n: 4, fps: 12, loop: false, ru: "горсть у груди", next: "coinHold" }],
  ["coinHold", { n: 4, fps: 12, loop: true, ru: "пересыпает золото", next: "coinThrow" }],
  ["coinThrow", { n: 8, fps: 12, loop: false, ru: "россыпь монет", hit: 3 }],
  ["ropeWind", { n: 4, fps: 12, loop: false, ru: "аркан над головой", next: "ropeHold" }],
  ["ropeHold", { n: 4, fps: 12, loop: true, ru: "крутит аркан", next: "ropeThrow" }],
  ["ropeThrow", { n: 8, fps: 12, loop: false, ru: "бросок аркана", hit: 3 }],
  ["curseWind", { n: 4, fps: 12, loop: false, ru: "руки вверх", next: "curseHold" }],
  ["curseHold", { n: 4, fps: 12, loop: true, ru: "каст проклятия", next: "curseCast" }],
  ["curseCast", { n: 10, fps: 12, loop: false, ru: "золото корни", hit: 3 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель в золото" }],
];
export const MIDAS_ANIMS = {} as Record<MidasAnim, AnimDef>;
{ let col = 0; for (const [k, a] of ANIM_ORDER) { MIDAS_ANIMS[k] = { ...a, col }; col += a.n; } }
export const MIDAS_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
/** Умения → клипы (для to-game на следующем этапе). */
export const MIDAS_SKILLS: Record<string, { windup: [MidasAnim, MidasAnim]; strike: MidasAnim }> = {
  golden_palm: { windup: ["palmWind", "palmHold"], strike: "palmStrike" },
  coin_scatter: { windup: ["coinWind", "coinHold"], strike: "coinThrow" },
  greed_lasso: { windup: ["ropeWind", "ropeHold"], strike: "ropeThrow" },
  midas_curse: { windup: ["curseWind", "curseHold"], strike: "curseCast" },
};
const VIEWS: ViewId[] = ["front", "back", "side"];

// ---------------- листы ----------------
const savePng = (c: Cv, f: string) => { const p = new PNG({ width: c.w, height: c.h }); p.data = Buffer.from(c.d); fs.writeFileSync(f, PNG.sync.write(p)); };
function refCrop(root: string, h: number): Cv | null {
  const f = path.join(root, "tools", "out", "bosses139", "ref-30.png");
  if (!fs.existsSync(f)) return null;
  const p = PNG.sync.read(fs.readFileSync(f));
  const x0 = Math.round(p.width * 0.05), x1 = Math.round(p.width * 0.76), y0 = Math.round(p.height * 0.03), y1 = Math.round(p.height * 0.975);
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
const GROUND = hx("#7d6a52"), PANEL = hx("#322f38"), NIGHT = hx("#161c34"), BG = hx("#26242b");
function nightTint(c: Cv, x: number, y: number, w: number, h: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (c.has(x + i, y + j)) { const q = c.get(x + i, y + j); c.set(x + i, y + j, [Math.round(q[0] * 0.45), Math.round(q[1] * 0.5), Math.round(q[2] * 0.75)]); } }
const silc = (c: Cv, col: C): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(x, y, col); return o; };

/** Эскиз: покой в трёх видах ×1/×3, силуэт ×3, референс. */
export function writeSketch(root: string, outDir: string): string {
  const fr = (v: ViewId) => renderFrame(v, REST).img;
  const frames: Cv[] = [fr("front"), fr("back"), fr("side"), flip(fr("side"))];
  const c = new Cv(1280, 600); c.rect(0, 0, c.w, c.h, BG);
  label(c, 10, 8, "ЭСКИЗ МИДАС ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 30", 2);
  frames.forEach((f, i) => { c.rect(10 + i * 248, 30, 240, 240, GROUND); c.blit(f, 10 + i * 248, 30, 3); });
  const ref = refCrop(root, 240); if (ref) { c.rect(1002, 30, ref.w + 4, 240, PANEL); c.blit(ref, 1004, 30, 1); }
  c.rect(10, 280, 4 * 248 - 8, 90, GROUND); frames.forEach((f, i) => c.blit(f, 10 + i * 248 + 80, 285, 1));
  label(c, 10, 382, "СИЛУЭТ ×3 | НОЧЬ + СВЕЧЕНИЕ ×2", 2);
  c.blit(silc(frames[0], hx("#d8d8e0")), 10, 400, 2); c.blit(silc(frames[2], hx("#d8d8e0")), 180, 400, 2);
  const sideR = renderFrame("side", REST), frR = renderFrame("front", REST);
  [frR, sideR].forEach((r, i) => { const x = 380 + i * 170; c.rect(x, 400, 160, 160, NIGHT); c.blit(r.img, x, 400, 2); nightTint(c, x, 400, 160, 160); c.blit(r.emis, x, 400, 2); });
  const out = path.join(outDir, "midas-sketch.png"); savePng(c, out); return out;
}

export function writeMidasArt(root: string, outDir: string, only?: MidasAnim[], quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const N = FRAME, FH = FRAME_H;
  const sheet = new Cv(N * MIDAS_COLS, FH * 3), glow = new Cv(N * MIDAS_COLS, FH * 3);
  const bad: string[] = [];
  for (const [a, d] of ANIM_ORDER) {
    if (only && !only.includes(a)) continue;
    const poses = POSES[a]();
    VIEWS.forEach((v, row) => poses.slice(0, quick ? 1 : d.n).forEach((p, i) => {
      const r = renderFrame(v, p), x0 = (MIDAS_ANIMS[a].col + i) * N, y0 = row * FH;
      blitSub(sheet, r.img, 0, 0, N, FH, x0, y0); blitSub(glow, r.emis, 0, 0, N, FH, x0, y0);
      let hits = 0;
      const nz = (x: number, y: number) => r.img.has(x, y) && r.img.get(x, y).join() !== OUTL.join();
      for (let k = 0; k < FH; k++) { if (nz(0, k)) hits++; if (nz(N - 1, k)) hits++; if (nz(k, 0)) hits++; if (nz(k, FH - 1)) hits++; }
      if (hits) bad.push(`${a} ${v} кадр ${i + 1}: ${hits}`);
    }));
  }
  const fSheet = path.join(outDir, "midas-sheet.png"), fGlow = path.join(outDir, "midas-glow.png");
  savePng(sheet, fSheet); savePng(glow, fGlow);
  // сравнение «наш | референс»: покой ×3 во всех видах, ×1, ночь со свечением; затем анимации вбок (4 кадра ×2)
  const ref = refCrop(root, 240);
  const shown = ANIM_ORDER.filter(([a]) => !only || only.includes(a));
  const rows = Math.ceil(shown.length / 2), RW = 1360, rowH = 176;
  const c = new Cv(RW, 340 + 40 + rows * rowH);
  c.rect(0, 0, RW, c.h, BG);
  label(c, 10, 8, "МИДАС ПОКОЙ ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 30", 2);
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
    label(c, ox + 4, oy + 3, MIDAS_ANIMS[a].ru.toUpperCase(), 2);
    const nShow = Math.min(4, d.n), step = (d.n - 1) / Math.max(1, nShow - 1);
    for (let k = 0; k < nShow; k++) {
      const fi = Math.round(k * step), fx = ox + 4 + k * 166;
      c.rect(fx, oy + 18, 162, 150, GROUND);
      blitSub(c, sheet, (MIDAS_ANIMS[a].col + fi) * N, 2 * FH, N, FH, fx + 1, oy + 18 - 5, 2);
    }
  });
  const fCmp = path.join(outDir, "r69s-w-compare.png"); savePng(c, fCmp);
  // превью листа: каждая анимация — три ряда (вниз, вверх, вбок), все кадры ×1
  const PW = 16 * 82 + 20, blocks = shown.map(([a, d]) => ({ a, d, lines: Math.ceil(d.n / 16) }));
  const ph = blocks.reduce((s, b) => s + 16 + b.lines * 3 * 82 + 6, 10);
  const pv = new Cv(PW, ph); pv.rect(0, 0, PW, ph, BG);
  let yy = 6;
  for (const b of blocks) {
    label(pv, 10, yy, `${b.a} ${b.d.ru}`.toUpperCase().replace(/[A-Z]/g, ""), 2); yy += 14;
    for (let ln = 0; ln < b.lines; ln++) for (let v = 0; v < 3; v++) {
      for (let k = ln * 16; k < Math.min(b.d.n, ln * 16 + 16); k++) { const x = 10 + (k - ln * 16) * 82; pv.rect(x, yy, 80, 80, GROUND); blitSub(pv, sheet, (MIDAS_ANIMS[b.a].col + k) * N, v * FH, N, FH, x, yy); }
      yy += 82;
    }
    yy += 8;
  }
  const fPrev = path.join(outDir, "r69s-w-sheet.png"); savePng(pv, fPrev);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 40).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; } else console.log("  проверки: край кадра чист");
  console.log(`  ${ID}: ${MIDAS_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  return [fSheet, fGlow, fCmp, fPrev];
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/sol_gilded_midas.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const out = path.join(root, "tools", "out", "bosses139"), t = Date.now();
  if (process.argv.includes("--sketch")) console.log("  эскиз:", writeSketch(root, out));
  else {
    const onlyArg = process.argv.find((a) => a.startsWith("--only="));
    const only = onlyArg ? (onlyArg.slice(7).split(",") as MidasAnim[]) : undefined;
    const files = writeMidasArt(root, out, only, process.argv.includes("--quick"));
    console.log(`  ${files.length} файлов`);
  }
  console.log(`  ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
