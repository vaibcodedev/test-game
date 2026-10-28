/**
 * Задача 139, босс кольца: костяная марионетка (восток, слот r69s, Костяной хребет, ур. 69, группа 5; референс 32 — только для сравнения: чужой арт в игру и в git не идёт).
 * Метод — 2D-пиксель-арт штампами по скелету (как минотавр, mino_lib.ts): тело в 2× (160×160) сводится в кадр 80×80, ступни y≈76, контур 1 px.
 * Скелет в «теле» (x — вбок, y — вниз, z — к зрителю) проецируется поворотом: вниз (анфас), вверх (со спины), вбок (три четверти влево); влево — зеркало вбок (в игре).
 * Части рисуются по глубине: ноги, юбка, торс (эллипсоиды одной маской), голова-баллон (цилиндр), механическое плечо с трубкой, руки по IK с когтями-ветками.
 * Кукловод: над головой парит терновая крестовина, к ней — нити из колючей проволоки (2 px: светлая жила и тень, узелки-шипы) к голове, запястьям и коленям.
 * Свечение (руны, синие точки, зелёная линза плеча, нити-эффекты) — лист marion-glow.png (по цветам свечения).
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/umb_bone_marionette.ts [--sketch] [--quick] [--only=idle,walk]
 *   --sketch → tools/out/bosses139/r69s-e-sketch.png (покой, три вида ×1/×3, силуэт | референс 32)
 *   иначе → marion-sheet.png, marion-glow.png, marion-fx.png (кокон на герое, сеть на земле), r69s-e-compare.png, r69s-e-anims.png
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { C, Cv, Mk, BAY, OUTL, SIL, hash, hx, label } from "./mino_lib";

export const ID = "umb_bone_marionette";
export const FRAME = 80;
export const FRAME_H = 80;
const Z = 2, W = 160, FR = 80;
const SIN = Math.sin, COS = Math.cos, PI = Math.PI;
type V2 = [number, number];
type V3 = [number, number, number];
export type ViewId = "front" | "back" | "side";
const VIEWS: ViewId[] = ["front", "back", "side"];

// ---------------- палитры ----------------
const FLESH: C[] = ["#1c1320", "#3c2a3a", "#68505e", "#987e86", "#c4aaa8", "#e8d4ca"].map(hx);
const IRON: C[] = ["#070609", "#141117", "#251f26", "#3b3239", "#5a4f54", "#877b7c", "#b6aca8"].map(hx);
const CLOTH: C[] = ["#090c1c", "#121a38", "#1e2c5e", "#2f4486", "#4862ac", "#6e8cc8"].map(hx);
const THORN: C[] = ["#040305", "#0d090d", "#1a1319", "#2b2027", "#43333b"].map(hx);
/** пальцы-ветки: светлее, чтобы сердцевина читалась внутри контура */
const TWIG: C[] = ["#120c12", "#2a1f28", "#463640", "#6a5462", "#8c7684"].map(hx);
const COCOON: C[] = ["#2e2836", "#5a5066", "#8e849e", "#c0b8cc", "#e6e0ee"].map(hx);
const WOUND = hx("#5c1820"), WOUND2 = hx("#9a3036");
// свечение (уникальные цвета — по ним собирается лист свечения)
const RUNE1 = hx("#d27cf6"), RUNE0 = hx("#9440c4"), RUNEOFF = hx("#3a2840");
const BLU1 = hx("#bde0ff"), BLU0 = hx("#4f8cf2"), BLUOFF = hx("#22304a");
const GRN1 = hx("#e2ffc8"), GRN0 = hx("#62e04a"), GRNOFF = hx("#24382a");
const THR1 = hx("#efe8ff"), THR0 = hx("#a898c8");
const GLOWSET = new Set([RUNE1, RUNE0, BLU1, BLU0, GRN1, GRN0, THR1, THR0].map((c) => c.join()));
// нити (колючая проволока)
const STR = hx("#c6bcd2"), STRD = hx("#2a2230"), STRB = hx("#7c7088");
const DUST: C[] = ["#4a4038", "#6e6050", "#9a8a74", "#c4b49a"].map(hx);
const SPARK: C[] = ["#5a2a7a", "#b070e0", "#e8c4ff", "#ffffff"].map(hx);

// ---------------- маска с рамкой (быстро: работа только в bbox) ----------------
class Mb extends Mk {
  bx0 = 1e9; by0 = 1e9; bx1 = -1; by1 = -1;
  constructor() { super(W, W); }
  override set(x: number, y: number, v = 1) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = v;
    if (v) { if (x < this.bx0) this.bx0 = x; if (x > this.bx1) this.bx1 = x; if (y < this.by0) this.by0 = y; if (y > this.by1) this.by1 = y; }
  }
  override poly(pts: [number, number][], v = 1) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.w - 1, Math.ceil(x1)); x++) {
      let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) this.set(x, y, v);
    }
  }
  /** эллипс с поворотом */
  ellR(cx: number, cy: number, rx: number, ry: number, ang = 0, v = 1) {
    const R = Math.max(rx, ry) + 1, cs = COS(ang), sn = SIN(ang);
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(this.h - 1, Math.ceil(cy + R)); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(this.w - 1, Math.ceil(cx + R)); x++) {
      const px = x + 0.5 - cx, py = y + 0.5 - cy, u = (px * cs + py * sn) / rx, w = (-px * sn + py * cs) / ry;
      if (u * u + w * w <= 1) this.set(x, y, v);
    }
  }
  empty() { return this.bx1 < 0; }
  /** L1-расстояние до края внутри маски (1 = крайний пиксель), два прохода */
  override dist(): Int16Array {
    const w = this.w, h = this.h, d = new Int16Array(w * h);
    if (this.empty()) return d;
    const g = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
    for (let y = this.by0; y <= this.by1; y++) for (let x = this.bx0; x <= this.bx1; x++) { const i = y * w + x; if (this.d[i]) d[i] = Math.min(g(x - 1, y), g(x, y - 1)) + 1; }
    for (let y = this.by1; y >= this.by0; y--) for (let x = this.bx1; x >= this.bx0; x--) { const i = y * w + x; if (this.d[i]) d[i] = Math.min(d[i], g(x + 1, y) + 1, g(x, y + 1) + 1); }
    return d;
  }
}
/** Закраска маски рампой с объёмом по расстоянию до края (как paint из mino_lib, только в bbox). */
function paintB(cv: Cv, m: Mb, ramp: C[], o: { amp?: number; dome?: number; dith?: number; bias?: number; light?: V2 } = {}): Int16Array {
  const d = m.dist(), n = ramp.length - 1;
  if (m.empty()) return d;
  const amp = o.amp ?? 1.5, dome = o.dome ?? 3, dith = o.dith ?? 0.35, bias = o.bias ?? 0, L = o.light ?? [-0.6, -0.8];
  const g = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : d[y * m.w + x]);
  for (let y = m.by0; y <= m.by1; y++) for (let x = m.bx0; x <= m.bx1; x++) {
    const v = d[y * m.w + x]; if (!v) continue;
    const gx = g(x + 1, y) - g(x - 1, y), gy = g(x, y + 1) - g(x, y - 1), len = Math.hypot(gx, gy) || 1;
    const lit = (-gx / len) * L[0] + (-gy / len) * L[1], hh = Math.min(v, dome) / dome;
    let t = n / 2 + bias + lit * amp * (1 - 0.55 * hh) + (hh - 0.5) * 0.9;
    if (v === 1 && lit < 0.2) t -= 0.8;
    t += (BAY[(x & 1) + (y & 1) * 2] - 0.5) * dith * 2;
    cv.set(x, y, ramp[Math.max(0, Math.min(n, Math.round(t)))]);
  }
  return d;
}
const mk = () => new Mb();
/** капсула в координатах кадра 1× */
const capM = (a: V2, b: V2, t0: number, t1 = t0) => { const m = mk(); m.line(a[0] * Z, a[1] * Z, b[0] * Z, b[1] * Z, t0 * Z, t1 * Z); return m; };
const discM = (c: V2, r: number) => { const m = mk(); m.disc(c[0] * Z, c[1] * Z, r * Z); return m; };
/** точка-деталь 1× (блок 2×2 ровно на пиксель кадра) */
const dot1 = (c: Cv, x: number, y: number, col: C) => { const X = Math.round(x) * Z, Y = Math.round(y) * Z; c.set(X, Y, col); c.set(X + 1, Y, col); c.set(X, Y + 1, col); c.set(X + 1, Y + 1, col); };
const in1 = (m: Mb, x: number, y: number) => m.has(Math.round(x) * Z, Math.round(y) * Z) || m.has(Math.round(x) * Z + 1, Math.round(y) * Z + 1);

// ---------------- вектор ----------------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function ik3(s: V3, f: V3, l1: number, l2: number, pole: V3): { el: V3; end: V3 } {
  let d = sub(f, s), L = len3(d);
  const mx = l1 + l2 - 0.05;
  if (L > mx) { f = add(s, mul(d, mx / L)); d = sub(f, s); L = mx; }
  L = Math.max(L, 0.01);
  const u = mul(d, 1 / L), a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let q = sub(pole, mul(u, dot(pole, u))); q = mul(q, 1 / (len3(q) || 1));
  return { el: add(add(s, mul(u, a)), mul(q, h)), end: f };
}

// ---------------- поза ----------------
export interface Pose {
  /** сдвиг верха тела и таза (by — вниз), наклон корпуса вперёд (рад), крен вбок (рад), сжатие и наклон всей фигуры вокруг ступней */
  bx: number; by: number; bz: number; lean: number; roll: number; sy: number; tilt: number;
  head: V2; htilt: number;
  /** запястья (L — правая рука куклы, слева на экране спереди; R — левая): сдвиг от покоя в «теле»; раскрытие когтей 0..1 */
  hL: V3; hR: V3; cL: number; cR: number;
  /** лодыжки: сдвиг от покоя */
  fL: V3; fR: V3;
  /** крестовина: сдвиг, наклон (минус — правый конец вверх), видимость; провис нитей 0..1; обрыв нитей [голова, Lзап., Rзап., Lкол., Rкол.] 0..1 */
  bar: V2; barT: number; barV: number; slack: number; cut: number[];
  /** свет рун 0..1,5 */
  glow: number;
  /** эффекты: нити-плевки из рук к земле, клубок кокона в руках, кокон в полёте, сеть по земле, вспышка у когтей, пыль */
  thread: number; spin: number; ball: number; web: number; flash: number; flashAt: "L" | "R" | "LR"; dust: number;
}
export const REST: Pose = {
  bx: 0, by: 0, bz: 0, lean: 0.12, roll: 0, sy: 1, tilt: 0, head: [0, 0], htilt: 0,
  hL: [0, 0, 0], hR: [0, 0, 0], cL: 0.45, cR: 0.45, fL: [0, 0, 0], fR: [0, 0, 0],
  bar: [0, 0], barT: 0, barV: 1, slack: 0.25, cut: [0, 0, 0, 0, 0], glow: 1,
  thread: 0, spin: 0, ball: 0, web: 0, flash: 0, flashAt: "R", dust: 0,
};
const easeIO = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
function blend(a: Pose, b: Pose, t: number): Pose {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    const x = a[k] as unknown, y = b[k] as unknown;
    if (typeof x === "number") o[k] = x + ((y as number) - x) * t;
    else if (Array.isArray(x)) o[k] = (x as number[]).map((v, i) => v + ((y as number[])[i] - v) * t);
    else o[k] = t < 0.5 ? x : y;
  }
  return o as unknown as Pose;
}
const keyed = (keys: { f: number; p: Partial<Pose> }[], n: number, ease = easeIO): Pose[] => {
  const out: Pose[] = [];
  for (let i = 0; i < n; i++) {
    let a = keys[0], b = keys[keys.length - 1];
    for (let k = 0; k < keys.length - 1; k++) if (i >= keys[k].f && i <= keys[k + 1].f) { a = keys[k]; b = keys[k + 1]; break; }
    const t = a.f === b.f ? 0 : ease((i - a.f) / (b.f - a.f));
    out.push(blend({ ...REST, ...a.p }, { ...REST, ...b.p }, t));
  }
  return out;
};

// ---------------- проекция ----------------
interface View { id: ViewId; cs: number; sn: number }
const VIEW = (id: ViewId): View => { const a = id === "front" ? 0 : id === "back" ? PI : 0.82; return { id, cs: COS(a), sn: SIN(a) }; };
/** тело → кадр: [x экрана, y экрана, глубина к зрителю] */
const prj = (v: View, q: V3): V3 => [40 + q[0] * v.cs - q[2] * v.sn, q[1], q[0] * v.sn + q[2] * v.cs];
/** верх тела: наклон вокруг таза (0,44,0) в y–z, крен в x–y, сдвиг */
function upT(p: Pose, q: V3): V3 {
  const x = q[0], y = q[1] - 44, z = q[2], cl = COS(p.lean), sl = SIN(p.lean), cr = COS(p.roll), sr = SIN(p.roll);
  const y1 = y * cl + z * sl, z1 = z * cl - y * sl;
  return [x * cr - y1 * sr + p.bx, x * sr + y1 * cr + 44 + p.by, z1 + p.bz];
}
const lowT = (p: Pose, q: V3): V3 => [q[0] + p.bx + p.roll * 3, q[1] + p.by, q[2] + p.bz];
/** видимость точки на поверхности с нормалью n (в «теле») */
const facing = (v: View, n: V3) => n[0] * v.sn + n[2] * v.cs;

// ---------------- части ----------------
type Part = { z: number; f: (c: Cv) => void };
const TORSO = [
  { c: [0, 28.5, 0] as V3, r: [7.2, 7, 4.8] as V3 },
  { c: [0, 23.6, -1] as V3, r: [7.6, 2.8, 3.8] as V3 },
  { c: [0, 37.8, 0.2] as V3, r: [4.6, 6.4, 3.6] as V3 },
  { c: [8, 25, 0] as V3, r: [2.6, 2.6, 2.6] as V3 },
];
/** точка на поверхности торса (front: передняя, иначе задняя) и нормаль */
function surf(x: number, y: number, front: boolean): { q: V3; n: V3 } {
  const E = y < 33.5 ? TORSO[0] : TORSO[2];
  const k = 1 - ((x - E.c[0]) / E.r[0]) ** 2 - ((y - E.c[1]) / E.r[1]) ** 2, zs = E.r[2] * Math.sqrt(Math.max(0, k)) * (front ? 1 : -1);
  return { q: [x, y, E.c[2] + zs], n: [(x - E.c[0]) / E.r[0] ** 2, 0, zs / E.r[2] ** 2] };
}
/** шип (гвоздь): от основания к острию, тёмное железо с бликом */
function spike(c: Cv, a: V2, b: V2, t = 1.4) {
  const m = capM(a, b, t, 0.45);
  paintB(c, m, IRON, { amp: 1.3, dome: 1, dith: 0.1, bias: -0.6 });
}
/** колючая ветка (палец когтя): квадратичная кривая, шипы по бокам */
function twig(c: Cv, p0: V2, p1: V2, p2: V2, t0: number, t1: number, thorns: number) {
  const m = mk(); m.bez([p0[0] * Z, p0[1] * Z], [p1[0] * Z, p1[1] * Z], [p2[0] * Z, p2[1] * Z], t0 * Z, t1 * Z);
  for (let k = 0; k < thorns; k++) {
    const u = 0.38 + k * 0.3, a = (1 - u) * (1 - u), b2 = 2 * u * (1 - u), cc = u * u;
    const x = a * p0[0] + b2 * p1[0] + cc * p2[0], y = a * p0[1] + b2 * p1[1] + cc * p2[1];
    const dx = 2 * (1 - u) * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]), dy = 2 * (1 - u) * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]), l = Math.hypot(dx, dy) || 1;
    const sd = k % 2 ? 1 : -1, nx = (-dy / l) * sd, ny = (dx / l) * sd;
    m.line(x * Z, y * Z, (x + nx * 2.2 + (dx / l) * 1.2) * Z, (y + ny * 2.2 + (dy / l) * 1.2) * Z, 1.6, 0.8);
  }
  paintB(c, m, TWIG, { amp: 1.3, dome: 1.5, dith: 0.1 });
}

/** голова-клетка: колпак из железных прутьев с куполом и шипами, внутри тьма и два синих огня; воротник с шипами. Рисует в 2×, возвращает точку нити (1×). */
function head(c: Cv, v: View, nx: number, ny: number, p: Pose): V2 {
  const r = 4.4, top = ny - 10.5, bot = ny - 0.8, a = Math.atan2(v.sn, v.cs);
  const shape = (y: number) => { const t = (y - top) / (bot - top); return t < 0.32 ? r * Math.sqrt(Math.max(0, 1 - ((0.32 - t) / 0.32) ** 2)) : r * (1 - (t - 0.32) * 0.18); };
  // воротник
  { const m = mk(); m.ellR(nx * Z, (ny + 0.6) * Z, 5.6 * Z, 2.2 * Z); paintB(c, m, THORN, { amp: 1.3, dome: 2, dith: 0.2, bias: 0.4 });
    for (let k = 0; k < 5; k++) { const ph = -1.2 + k * 0.6, x = nx + SIN(ph) * 5.2, y = ny + 1 + COS(ph) * 1.2; spike(c, [x, y - 0.4], [x + SIN(ph) * 2.6, y - 2 + Math.abs(SIN(ph)) * 1.2], 1.2); } }
  // шипы купола: задние — до клетки, передние — после
  const spikes: { ph: number; el: number; l: number }[] = [{ ph: 0, el: 1.35, l: 5.5 }, { ph: 1.3, el: 0.75, l: 5.2 }, { ph: -1.3, el: 0.75, l: 5.2 }, { ph: 2.6, el: 0.8, l: 3.6 }, { ph: -2.6, el: 0.8, l: 3.6 }, { ph: 0.6, el: 0.35, l: 3.4 }, { ph: -0.6, el: 0.35, l: 3.4 }, { ph: PI, el: 0.4, l: 3.4 }];
  const spk = (front: boolean) => { for (const q of spikes) { const s = q.ph - a, dep = COS(s) * COS(q.el); if ((dep >= -0.05) !== front) continue;
    const dx = SIN(s) * COS(q.el), dy = -SIN(q.el), by = top + (bot - top) * 0.32 * (1 - SIN(q.el)), bx = nx + dx * r * 0.95;
    spike(c, [bx, by + 0.6], [bx + dx * q.l, by + dy * q.l], 1.5); } };
  spk(false);
  // тёмная внутренность
  const m = mk();
  for (let y = top; y <= bot; y += 0.25) { const w = shape(y); m.line((nx - w) * Z, y * Z, (nx + w) * Z, y * Z, 1); }
  paintB(c, m, THORN, { amp: 0.8, dome: 3, dith: 0.3, bias: -0.6 });
  // два синих огня внутри (смотрят вперёд)
  const ef = COS(a);
  if (ef > 0.1) { const bc = p.glow > 0.6 ? BLU1 : p.glow > 0.2 ? BLU0 : BLUOFF; for (const ex of [-1.6, 1.6]) dot1(c, nx + ex * ef - SIN(a) * r * 0.45, ny - 5, bc); }
  // прутья: меридианы клетки
  for (let k = 0; k < 6; k++) {
    const ph = (k / 6) * 2 * PI + 0.52, s = ph - a, dep = COS(s); if (dep < -0.05) continue;
    const lt = COS(s + 0.75), col = IRON[lt > 0.4 ? 5 : lt > -0.1 ? 4 : 2];
    for (let y = top + 0.5; y <= bot; y += 0.5) dot1(c, nx + SIN(s) * shape(y), y, col);
  }
  // обручи: нижний, средний, кромка купола
  for (const [yy, w2] of [[bot, 1], [top + (bot - top) * 0.62, 0], [top + (bot - top) * 0.32, 0]] as [number, number][]) {
    const w = shape(yy);
    for (let x = -w; x <= w; x += 0.5) { const t = x / w, lt = COS(Math.asin(Math.max(-1, Math.min(1, t))) + 0.75), y = yy + 0.9 * Math.sqrt(Math.max(0, 1 - t * t)); dot1(c, nx + x, y, IRON[lt > 0.3 ? 5 : lt > -0.2 ? 4 : 2]); if (w2) dot1(c, nx + x, y + 1, IRON[1]); }
  }
  spk(true);
  // крюк на макушке
  { const mm = capM([nx, top - 0.2], [nx, top - 2.6], 1.5); mm.disc(nx * Z, (top - 3.3) * Z, 1.1 * Z); paintB(c, mm, IRON, { amp: 1.3, dome: 1, dith: 0, bias: 0.6 }); }
  return [nx, top - 3.6];
}

/** механическое плечо: железная сфера с обручами, шипы, зелёная линза; труба к поясу — отдельной частью */
function mechShoulder(c: Cv, v: View, C3: V3, p: Pose) {
  const P = prj(v, C3), r = 4.4;
  for (let k = 0; k < 6; k++) { const ph = -2.6 + k * 0.62, d: V3 = [COS(ph) * 0.9, SIN(ph), 0.25]; const t = prj(v, add(C3, mul(d, r + 3.5 + (k % 2) * 1.6))), b = prj(v, add(C3, mul(d, r - 1))); spike(c, [b[0], b[1]], [t[0], t[1]], 1.6); }
  const m = discM([P[0], P[1]], r); paintB(c, m, IRON, { amp: 2, dome: 9, dith: 0.3, bias: 0.9 });
  // обручи: экватор и меридиан, проекцией окружности
  const ring = (ax: V3, bx: V3, col: C, colL: C) => { for (let k = 0; k < 64; k++) { const t = (k / 64) * 2 * PI, d = add(mul(ax, COS(t)), mul(bx, SIN(t))); if (facing(v, d) < 0.05) continue; const q = prj(v, add(C3, mul(d, r * 0.98))); dot1(c, q[0], q[1], k % 8 === 0 ? colL : col); } };
  ring([1, 0, 0], [0, 0, 1], IRON[1], IRON[6]);
  ring([0, 1, 0], [0.3, 0, 0.95], IRON[2], IRON[5]);
  // линза
  const L: V3 = [0.25, 0.25, 0.93];
  if (facing(v, L) > 0.15) {
    const q = prj(v, add(C3, mul(L, r * 0.85))), gc = p.glow > 0.6 ? GRN1 : p.glow > 0.2 ? GRN0 : GRNOFF;
    for (let a = 0; a < 12; a++) dot1(c, q[0] + COS(a * 0.52) * 1.6, q[1] + SIN(a * 0.52) * 1.6, a < 6 ? IRON[5] : IRON[0]);
    dot1(c, q[0], q[1], gc); dot1(c, q[0] + 1, q[1], GRN0); dot1(c, q[0], q[1] + 1, GRN0);
  }
}

/** Один кадр: части по глубине в 2×, сведение в 1×, контур, эффекты и нити. */
function render(view: ViewId, p: Pose, opts: { strings?: boolean } = {}): { img: Cv; emis: Cv } {
  const v = VIEW(view), parts: Part[] = [];
  const P = (q: V3) => prj(v, q), S = (q: V3): V2 => { const r = P(q); return [r[0], r[1]]; };
  const glowC = (hi: C, lo: C, off: C) => (p.glow > 0.6 ? hi : p.glow > 0.2 ? lo : off);
  // суставы
  const sh = (s: number) => upT(p, [s * 8.4, 24.4, 0]);
  const hip = (s: number) => lowT(p, [s * 4.2, 45.5, 0]);
  const wrist = (s: number): V3 => { const h = s < 0 ? p.hL : p.hR; return [s * 21 + h[0] + p.bx, 60 + h[1] + p.by, 4 + h[2] + p.bz]; };
  const ankle = (s: number): V3 => { const f = s < 0 ? p.fL : p.fR; return [s * 15 + f[0], 72 + f[1], 1 + f[2]]; };
  const legs = [-1, 1].map((s) => { const H = hip(s), k = ik3(H, ankle(s), 15, 14.6, [s, 0, 0.9]); return { s, H, K: k.el, A: k.end }; });
  const arms = [-1, 1].map((s) => { const Sh = sh(s), k = ik3(Sh, wrist(s), 19.5, 19.5, [s, 0.2, -0.5]); return { s, Sh, E: k.el, Wr: k.end }; });

  // ноги: бедро, голень темнеет книзу, шипастая лодыжка, когти-корни на земле
  for (const L of legs) parts.push({ z: -100 + P(L.K)[2], f: (c) => {
    const H = S(L.H), K = S(L.K), A = S(L.A), b = L.s * v.cs < 0 ? -0.25 : 0;
    let m = capM(H, K, 3, 2.2); paintB(c, m, FLESH, { amp: 1.5, dome: 3, dith: 0.3, bias: b });
    m = capM(K, A, 2.2, 1.7); paintB(c, m, FLESH, { amp: 1.4, dome: 3, dith: 0.4, bias: b - 0.4 });
    const mid: V2 = [K[0] + (A[0] - K[0]) * 0.7, K[1] + (A[1] - K[1]) * 0.7];
    m = capM(mid, A, 1.9, 2.1); paintB(c, m, THORN, { amp: 1.3, dome: 2, dith: 0.3, bias: 0.5 });
    // колено: тёмный обруч и кольцо нити
    m = discM(K, 2.2); paintB(c, m, FLESH, { amp: 1.7, dome: 3, dith: 0.2, bias: b + 0.7 });
    m = discM([K[0] + (A[0] - K[0]) * 0.5, K[1] + (A[1] - K[1]) * 0.5], 1.3); paintB(c, m, FLESH, { amp: 1.6, dome: 2, dith: 0.2, bias: b + 0.2 });
    m = discM([H[0] + (K[0] - H[0]) * 0.55, H[1] + (K[1] - H[1]) * 0.55], 1.6); paintB(c, m, FLESH, { amp: 1.6, dome: 2, dith: 0.2, bias: b + 0.3 });
    // шипы у лодыжки
    for (let k = 0; k < 3; k++) { const ph = -2.2 + k * 0.7 + (L.s > 0 ? 0 : 0.2), d: V3 = [L.s * COS(ph) * 0.7, SIN(ph), 0.4 - k * 0.25]; const q = add(L.A, [0, -2.5, 0]); spike(c, S(q), S(add(q, mul(d, 3.6 + (k % 2) * 1.6))), 1.2); }
    // ступня-корень: три когтя по земле и шпора назад
    const lifted = L.A[1] < 69.5, gy = L.A[1] + 4.3, base: V3 = [L.A[0], gy - 1.6, L.A[2]];
    const toes: V3[] = [[L.s * 0.25, 0, 1], [L.s * 0.85, 0, 0.6], [L.s * 1, 0, -0.1]];
    for (const [i, d] of toes.entries()) {
      const ln = [6.5, 6, 4.8][i], tip = add(base, add(mul(d, ln), [0, lifted ? 3 : 1.4, 0])), md = add(base, add(mul(d, ln * 0.5), [0, lifted ? 0.6 : -0.6, 0]));
      twig(c, S(base), S(md), S(tip), 1.8, 0.6, 0);
    }
    twig(c, S(base), S(add(base, [-L.s * 1.2, -0.4, -2])), S(add(base, [-L.s * 1.6, 1.2, -4])), 2, 0.8, 0);
    m = discM(S(add(base, [0, -0.8, 0])), 1.7); paintB(c, m, THORN, { amp: 1.2, dome: 2, dith: 0.2, bias: 0.6 });
  } });

  // юбка: синяя рваная ткань по кольцу, пояс, передний клапан
  parts.push({ z: 0.5, f: (c) => {
    const N = 24, ring = (y: number, rx: number, rz: number, th: number): V3 => lowT(p, [rx * 0.66 * SIN(th), y, rz * 0.7 * COS(th)]);
    const m = mk();
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * 2 * PI, t1 = ((i + 1) / N) * 2 * PI, hem = (k: number) => 52.5 + (k % 2 ? 2.6 : 0) + hash(k, 3) * 1.6;
      const q = [ring(42.2, 9.2, 6.2, t0), ring(42.2, 9.2, 6.2, t1), ring(hem(i + 1), 11.8, 8, t1), ring(hem(i), 11.8, 8, t0)].map((x) => { const r = P(x); return [r[0] * Z, r[1] * Z] as [number, number]; });
      m.poly(q);
    }
    const d = paintB(c, m, CLOTH, { amp: 1.3, dome: 5, dith: 0.4, bias: -0.1 });
    // складки: тёмные вертикальные борозды
    for (let i = 0; i < 9; i++) { const th = -1.3 + i * 0.32 + (v.id === "back" ? PI : 0); const a = P(ring(45, 10, 7, th)), b = P(ring(53, 11.5, 8, th)); if (COS(th - Math.atan2(v.sn, v.cs)) < 0.2) continue;
      for (let k = 0; k <= 8; k++) { const x = a[0] + (b[0] - a[0]) * k / 8, y = a[1] + (b[1] - a[1]) * k / 8; if (in1(m, x, y) && d[Math.round(y) * Z * W + Math.round(x) * Z] > 1) dot1(c, x, y, CLOTH[i % 2 ? 1 : 0]); } }
    // клапан спереди или сзади (по виду)
    const fz = v.id === "back" ? -1 : 1, fl = mk();
    fl.poly([[-2.8, 43], [2.8, 43], [3.3, 55.5], [1.6, 54], [0.5, 58.5], [-0.8, 55], [-2.2, 57.5], [-3.3, 54]].map(([x, y]) => { const r = P(lowT(p, [x, y, fz * (4.6 + (y - 43) * 0.1)])); return [r[0] * Z, r[1] * Z] as [number, number]; }));
    paintB(c, fl, CLOTH, { amp: 1.4, dome: 3, dith: 0.4, bias: 0.5 });
    // пояс
    const bm = mk();
    for (let i = 0; i < N; i++) { const t0 = (i / N) * 2 * PI, t1 = ((i + 1) / N) * 2 * PI; bm.poly([ring(41.2, 9.5, 6.5, t0), ring(41.2, 9.5, 6.5, t1), ring(43.6, 9.7, 6.7, t1), ring(43.6, 9.7, 6.7, t0)].map((x) => { const r = P(x); return [r[0] * Z, r[1] * Z] as [number, number]; })); }
    paintB(c, bm, IRON, { amp: 1.4, dome: 2, dith: 0.2, bias: -0.3 });
    for (let i = 0; i < 12; i++) { const th = (i / 12) * 2 * PI; if (facing(v, [SIN(th), 0, COS(th)]) < 0.3) continue; const q = P(ring(42.4, 9.8, 6.9, th)); dot1(c, q[0], q[1], IRON[5]); }
  } });
  // пряжка-механизм на поясе (спереди) и труба от плеча к ней
  { const B = lowT(p, [-1.2, 42.8, 5.2]), PB = P(B);
    parts.push({ z: PB[2] > 0 ? 1 + PB[2] : -60, f: (c) => {
      const m = mk(); m.poly([[PB[0] - 3.2, PB[1] - 2.4], [PB[0] + 3.2, PB[1] - 2.4], [PB[0] + 2.6, PB[1] + 2.8], [PB[0] - 2.6, PB[1] + 2.8]].map(([x, y]) => [x * Z, y * Z] as [number, number]));
      paintB(c, m, IRON, { amp: 1.6, dome: 3, dith: 0.2, bias: 0.4 });
      const bc = glowC(BLU1, BLU0, BLUOFF); dot1(c, PB[0] - 1, PB[1], bc); dot1(c, PB[0] + 1, PB[1], BLU0); dot1(c, PB[0], PB[1] + 1.5, IRON[0]);
    } });
    const A0 = upT(p, [-9.6, 28.6, 2]), A1 = lowT(p, [-10, 37, 5]), pts: V3[] = [];
    for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push(lerp3(lerp3(A0, A1, u), lerp3(A1, B, u), u)); }
    const zz = pts.reduce((s, q) => s + P(q)[2], 0) / pts.length;
    parts.push({ z: zz > 0 ? 1 + zz * 0.5 : -0.5, f: (c) => {
      pts.forEach((q, k) => { const r = S(q); const m = discM(r, 1.8); paintB(c, m, IRON, { amp: 1.5, dome: 2, dith: 0, bias: k % 2 ? 1.2 : 0 }); });
    } });
  }

  // торс: эллипсоиды одной маской, мышцы, руны, точки, рана, шипы-гвозди
  const tmask = mk();
  for (const E of TORSO) {
    const q = P(upT(p, E.c)), rx = Math.hypot(E.r[0] * v.cs, E.r[2] * v.sn), ry = Math.hypot(E.r[1] * COS(p.lean), E.r[2] * SIN(p.lean) * 0.6);
    tmask.ellR(q[0] * Z, q[1] * Z, rx * Z, ry * Z, p.roll);
  }
  const SPK: { x: number; y: number; front: boolean; d: V3; l: number }[] = [
    { x: -2, y: 23.5, front: true, d: [-0.3, -1, 0.35], l: 4 }, { x: 6, y: 23, front: true, d: [0.35, -1, 0.15], l: 3.5 },
    { x: 3.5, y: 37, front: true, d: [1, 0.08, 0.35], l: 9 }, { x: -6.5, y: 32, front: true, d: [-1, 0.2, 0.2], l: 4 },
    { x: -4, y: 26, front: false, d: [-0.4, -0.6, -1], l: 4.5 }, { x: 3, y: 30, front: false, d: [0.3, -0.3, -1], l: 5 },
    { x: 0.5, y: 36, front: false, d: [0, -0.2, -1], l: 4 }, { x: -6, y: 31, front: false, d: [-0.8, 0, -0.6], l: 4.5 },
  ];
  const spikeOf = (sp: (typeof SPK)[number]) => { const s = surf(sp.x, sp.y, sp.front); return { a: S(upT(p, s.q)), b: S(upT(p, add(s.q, mul(sp.d, sp.l)))), vis: facing(v, s.n) > 0 }; };
  parts.push({ z: -0.3, f: (c) => { for (const sp of SPK) { const o = spikeOf(sp); if (!o.vis) spike(c, o.a, o.b, 1.6); } } });
  parts.push({ z: 0, f: (c) => {
    const d = paintB(c, tmask, FLESH, { amp: 1.6, dome: 7, dith: 0.3, bias: 0.1 }); void d;
    const pt = (x: number, y: number, front: boolean) => { const s = surf(x, y, front), q = P(upT(p, s.q)); return { x: q[0], y: q[1], ok: facing(v, s.n) > 0.02 && in1(tmask, q[0], q[1]) }; };
    const line = (pts: V2[], front: boolean, col: C, colL?: C, step = 0.35) => {
      for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
        for (let k = 0; k <= n; k++) { const q = pt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, front); if (!q.ok) continue; if (colL) dot1(c, q.x, q.y - 1, colL); dot1(c, q.x, q.y, col); } }
    };
    if (v.id !== "back") {
      // ключицы, грудина, рёбра (светлый гребень над тёмной бороздой), впалый живот
      line([[-7.5, 23.2], [-3, 24.2], [-0.8, 23.8]], true, FLESH[5], undefined, 0.5); line([[0.8, 23.8], [3, 24.2], [7.5, 23.2]], true, FLESH[5], undefined, 0.5);
      line([[0, 24.5], [0, 32]], true, FLESH[1]);
      for (const [i, y] of [24.5, 27, 29.5, 32].entries()) for (const sx of [-1, 1]) { const w = 6.6 - i * 0.3; line([[sx * 1.2, y], [sx * w * 0.6, y + 0.8], [sx * w, y + 2.6 + i * 0.3]], true, FLESH[1], FLESH[4], 0.4); }
      line([[-4, 34.5], [-3, 39], [-2.4, 42.5]], true, FLESH[1]); line([[4, 34.5], [3, 39], [2.4, 42.5]], true, FLESH[1]);
      line([[0, 34.5], [0, 41.5]], true, FLESH[2]);
      // синие точки-гвозди
      const bc = glowC(BLU1, BLU0, BLUOFF);
      for (const [x, y] of [[2.6, 36.5]]) { const q = pt(x, y, true); if (q.ok) { dot1(c, q.x, q.y, bc); dot1(c, q.x + 1, q.y, IRON[0]); } }
      // рана у механического плеча
      line([[-4.2, 29.2], [-3.2, 29.8]], true, WOUND, WOUND2, 0.5);
      // пупок
      { const q = pt(0, 42.4, true); if (q.ok) dot1(c, q.x, q.y, FLESH[0]); }
    } else {
      // спина: позвоночник с гвоздями, лопатки, руны
      for (let y = 22.5; y <= 42; y += 1) { const q = pt(0, y, false); if (q.ok) dot1(c, q.x, q.y, (Math.round(y) % 3 === 0) ? FLESH[5] : FLESH[1]); }
      for (const [i, y] of [25, 27.5, 30, 32.5].entries()) for (const sx of [-1, 1]) line([[sx * 1.2, y], [sx * (6.4 - i * 0.3), y + 2.2]], false, FLESH[1], FLESH[4], 0.4);
      line([[-5.5, 23.5], [-3.5, 26.5]], false, FLESH[5], undefined, 0.5); line([[5.5, 23.5], [3.5, 26.5]], false, FLESH[5], undefined, 0.5);
    }
    for (const sp of SPK) { const o = spikeOf(sp); if (o.vis) spike(c, o.a, o.b, 1.6); }
  } });

  // механическое плечо (на правом плече куклы, x−)
  { const C3 = upT(p, [-9.4, 23.6, 0.6]); parts.push({ z: P(C3)[2] + 6, f: (c) => mechShoulder(c, v, C3, p) }); }

  // голова
  const neck = upT(p, [0, 21.5, 1]), NP = P(neck);
  const hnx = NP[0] + p.head[0], hny = NP[1] + p.head[1];
  let headTop: V2 = [hnx, hny - 15];
  parts.push({ z: 1.2, f: (c) => {
    const hc = new Cv(W, W); headTop = head(hc, v, hnx, hny, p);
    const ang = p.htilt + p.roll, r = rotCv(hc, ang, hnx * Z, hny * Z);
    stamp(c, r, 0, 0);
    const dx = headTop[0] - hnx, dy = headTop[1] - hny; headTop = [hnx + dx * COS(ang) - dy * SIN(ang), hny + dx * SIN(ang) + dy * COS(ang)];
  } });

  // руки: плечо → локоть → запястье, тёмная кисть, когти-ветки
  const clawTips: V2[] = [[0, 0], [0, 0]];
  for (const A of arms) parts.push({ z: (P(A.E)[2] + P(A.Wr)[2]) / 2 + (v.id === "back" ? 0 : 1.5), f: (c) => {
    const s = A.s, Sh = S(A.Sh), E = S(A.E), Wr = S(A.Wr), b = s * v.cs * (v.id === "side" ? -1 : 0) > 0 ? -0.6 : (v.id === "side" && s < 0 ? -0.6 : 0);
    let m = capM(Sh, E, 3, 2.2); paintB(c, m, FLESH, { amp: 1.5, dome: 3, dith: 0.3, bias: b });
    // бицепс
    const bi: V2 = [Sh[0] + (E[0] - Sh[0]) * 0.4, Sh[1] + (E[1] - Sh[1]) * 0.4]; m = discM(bi, 1.8); paintB(c, m, FLESH, { amp: 1.5, dome: 4, dith: 0.35, bias: b + 0.2 });
    m = capM(E, Wr, 2.2, 1.7); paintB(c, m, FLESH, { amp: 1.4, dome: 3, dith: 0.35, bias: b - 0.2 });
    const mid: V2 = [E[0] + (Wr[0] - E[0]) * 0.62, E[1] + (Wr[1] - E[1]) * 0.62];
    m = capM(mid, Wr, 1.9, 1.8); paintB(c, m, THORN, { amp: 1.3, dome: 2, dith: 0.3, bias: 0.6 });
    m = discM(E, 2.1); paintB(c, m, FLESH, { amp: 1.7, dome: 3, dith: 0.2, bias: b + 0.7 });
    // руны на руке: кольца поперёк плеча (левая рука куклы) или точки (правая, механическая)
    const ux = E[0] - Sh[0], uy = E[1] - Sh[1], ul = Math.hypot(ux, uy) || 1, nx = -uy / ul, ny = ux / ul;
    const rc = glowC(RUNE1, RUNE0, RUNEOFF);
    if (s > 0) for (const t of [0.3, 0.55]) for (let q = -1; q <= 1; q++) dot1(c, Sh[0] + ux * t + nx * q, Sh[1] + uy * t + ny * q, rc);
    else for (const t of [0.35, 0.6]) dot1(c, E[0] + (Wr[0] - E[0]) * t, E[1] + (Wr[1] - E[1]) * t, glowC(GRN0, GRN0, GRNOFF));
    // шипы: локоть и предплечье
    const ex = E[0] - (Sh[0] + Wr[0]) / 2, ey = E[1] - (Sh[1] + Wr[1]) / 2, el = Math.hypot(ex, ey) || 1;
    spike(c, E, [E[0] + (ex / el) * 4.6, E[1] + (ey / el) * 4.6 - 1], 1.6);
    const fx = Wr[0] - E[0], fy = Wr[1] - E[1], fl = Math.hypot(fx, fy) || 1, fnx = -fy / fl * s, fny = fx / fl * s;
    for (const t of [0.3, 0.62]) { const q: V2 = [E[0] + fx * t, E[1] + fy * t]; spike(c, q, [q[0] + fnx * 3.4 + fx / fl * 1.4, q[1] + fny * 3.4 + fy / fl * 1.4], 1.3); }
    // кисть и когти-ветки
    const dx = fx / fl, dy = fy / fl, cl = s < 0 ? p.cL : p.cR, sp = 0.3 + 0.75 * cl, curl = (1 - cl) * 0.55 * -s;
    m = discM(Wr, 1.4); paintB(c, m, THORN, { amp: 1.3, dome: 2, dith: 0.2, bias: 0.5 });
    const rot = (ang: number): V2 => [dx * COS(ang) - dy * SIN(ang), dx * SIN(ang) + dy * COS(ang)];
    const fing = [-0.95, -0.32, 0.32, 0.95], LN = [10, 13, 12, 9];
    let tipSum: V2 = [0, 0];
    fing.forEach((f0, i) => {
      const a0 = f0 * sp, d1 = rot(a0), d2 = rot(a0 * 1.35 + curl), L = LN[i] * (0.8 + 0.2 * cl);
      const kink = (i - 1.5) * -s * 0.4 + (i === 1 ? s * 0.35 : 0), dk = rot(a0 + kink);
      const p0: V2 = [Wr[0] + d1[0] * 1.2, Wr[1] + d1[1] * 1.2], p1: V2 = [Wr[0] + d1[0] * L * 0.5 + dk[0] * 1.5, Wr[1] + d1[1] * L * 0.5 + dk[1] * 1.5], p2: V2 = [Wr[0] + d2[0] * L, Wr[1] + d2[1] * L];
      twig(c, p0, p1, p2, 1.4, 0.5, i === 1 || i === 2 ? 1 : 0);
      tipSum = [tipSum[0] + p2[0] / 4, tipSum[1] + p2[1] / 4];
    });
    { const d1 = rot(-s * 1.4 - 0.2); twig(c, Wr, [Wr[0] + d1[0] * 2.5, Wr[1] + d1[1] * 2.5], [Wr[0] + d1[0] * 4.5 + dx * 1.5, Wr[1] + d1[1] * 4.5 + dy * 1.5], 1.8, 0.7, 0); }
    clawTips[s < 0 ? 0 : 1] = tipSum;
  } });

  // кокон: клубок между рук или в полёте
  if (p.spin > 0.03 || (p.ball > 0.03 && p.ball < 0.97)) {
    const mid = lerp3(wrist(-1), wrist(1), 0.5), mc = add(mid, [0, 1, 3]);
    const C3 = p.ball > 0.03 ? lerp3(mc, [0, 64, 38], p.ball) : mc, r = p.ball > 0.03 ? 4.2 - 1.2 * p.ball : 1.4 + 3.4 * p.spin;
    const q = P(C3);
    parts.push({ z: q[2] + 2, f: (c) => {
      const m = mk(); m.ellR(q[0] * Z, q[1] * Z, r * 0.85 * Z, r * 1.15 * Z, 0.4); const d = paintB(c, m, COCOON, { amp: 1.5, dome: 4, dith: 0.3, bias: 0.3 }); void d;
      for (let k = -3; k <= 3; k++) for (let t = -1; t <= 1; t += 0.08) { const x = q[0] + t * r * 0.9, y = q[1] + k * r * 0.32 + t * r * 0.45 + SIN(t * 3 + k) * 0.4; if (in1(m, x, y)) dot1(c, x, y, k % 2 ? COCOON[1] : COCOON[2]); }
      dot1(c, q[0] - r * 0.35, q[1] - r * 0.5, THR1);
    } });
  }

  // крестовина кукловода
  const barP = (q: V3): V3 => { const cs = COS(p.barT), sn = SIN(p.barT), x = q[0] * cs - (q[1] - 4) * sn, y = 4 + q[0] * sn + (q[1] - 4) * cs; return P([x + p.bar[0], y + 1 + p.bar[1], q[2]]); };
  const ATT: V3[] = [[0, 5.2, 0], [-14, 5.4, 0], [14, 5.4, 0]];
  if (p.barV > 0.5) parts.push({ z: 200, f: (c) => {
    const a = barP([-17, 4, 0]), b = barP([17, 4, 0]), e = barP([0, 4, -6]), f = barP([0, 4, 6]);
    let m = capM([e[0], e[1]], [f[0], f[1]], 2.2); paintB(c, m, IRON, { amp: 1.4, dome: 2, dith: 0.1, bias: -0.3 });
    m = capM([a[0], a[1]], [b[0], b[1]], 2.6, 2.6); const d = paintB(c, m, IRON, { amp: 1.5, dome: 2, dith: 0.1, bias: 0 }); void d;
    // шипы-колючки по крестовине
    for (let k = 0; k < 7; k++) { const u = 0.08 + k * 0.14, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u, up = k % 2 ? -1 : 1; spike(c, [x, y], [x + (k % 3 - 1) * 0.8, y - up * 2.4], 1.1); }
    // навершия-крюки на концах и узел в центре
    for (const q of [a, b]) { m = discM([q[0], q[1]], 1.9); paintB(c, m, IRON, { amp: 1.5, dome: 2, dith: 0, bias: 0.6 }); }
    m = discM([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], 2.2); paintB(c, m, IRON, { amp: 1.6, dome: 3, dith: 0, bias: 0.4 });
    const gc = glowC(RUNE1, RUNE0, RUNEOFF); dot1(c, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, gc);
  } });

  // сборка
  parts.sort((x, y) => x.z - y.z);
  const big = new Cv(W, W);
  for (const pt of parts) pt.f(big);
  const fin = Math.abs(p.tilt) > 1e-3 || p.sy !== 1 ? rotCv(big, p.tilt, 80, 76 * Z, p.sy) : big;
  const o = down(fin);

  // ---- эффекты 1× ----
  const fp: V2 = [40, 75];
  const hs = (a: number, b: number) => hash(a, b);
  const puff = (x: number, y: number, k: number) => { for (let i = 0; i < 14 * k; i++) { const a = hs(i, x) * 6.28, r = hs(y, i) * 5 * k + 1; o.set(x + COS(a) * r * 1.3, y - Math.abs(SIN(a)) * r * 0.9, DUST[(i % 3) + 1]); } };
  if (p.dust > 0.05) { puff(fp[0] - 12, 75, p.dust); puff(fp[0] + 12, 75, p.dust); }
  // сеть по земле: кольца и спицы
  if (p.web > 0.03) {
    const R = 6 + 31 * p.web, col = p.web > 0.85 ? THR0 : THR1;
    for (const rr of [R, R * 0.62, R * 0.3]) for (let k = 0; k < 120; k++) { const t = (k / 120) * 2 * PI, x = fp[0] + COS(t) * rr, y = 74.5 + SIN(t) * rr * 0.26; if (x > 1 && x < 78 && y < 78 && (k % 9 !== 4)) o.set(x, y, rr === R ? col : THR0); }
    for (let k = 0; k < 10; k++) { const t = (k / 10) * 2 * PI + 0.15; for (let q = 0; q <= R; q += 0.7) { const x = fp[0] + COS(t) * q, y = 74.5 + SIN(t) * q * 0.26; if (x > 1 && x < 78 && y < 78) o.set(x, y, q > R * 0.7 ? THR0 : THR1); } }
  }
  // нити-плевки из когтей к земле
  if (p.thread > 0.03) for (const [i, s] of [[0, -1], [1, 1]] as const) {
    const a = clawTips[i], gx = Math.max(4, Math.min(75, a[0] + s * (v.id === "side" ? 10 : 12) - (v.id === "side" ? 10 : 0))), b: V2 = [gx, 76];
    const n = 40, kk = Math.min(1, p.thread);
    for (let q = 0; q <= n * kk; q++) { const u = q / n, x = a[0] + (b[0] - a[0]) * u + SIN(u * PI) * s * 2.5, y = a[1] + (b[1] - a[1]) * u - SIN(u * PI) * 3; o.set(x + 1, y, STRD); o.set(x, y, q % 6 === 3 ? THR0 : THR1); }
    if (kk >= 0.99) for (const [dx, dy] of [[-2, 0], [2, 0], [-1, -1], [1, -1], [0, 0], [-3, 0], [3, 0]]) o.set(b[0] + dx, b[1] - 1 + dy, THR1);
  }
  // вспышка у когтей
  if (p.flash > 0.05) for (const [i, on] of [[0, p.flashAt !== "R"], [1, p.flashAt !== "L"]] as const) {
    if (!on) continue; const anc = clawTips[i], k = p.flash;
    for (let q = -Math.round(4 * k); q <= Math.round(4 * k); q++) { o.set(anc[0] + q, anc[1], SPARK[q % 2 ? 2 : 3]); o.set(anc[0], anc[1] + q, SPARK[q % 2 ? 1 : 2]); }
    o.set(anc[0], anc[1], SPARK[3]);
  }

  // ---- свечение: по цветам ----
  const emis = new Cv(FR, FR);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (o.has(x, y) && GLOWSET.has(o.get(x, y).join())) emis.set(x, y, o.get(x, y));

  // ---- нити кукловода: колючая проволока, 2 px (жила и тень), узелки-шипы ----
  if (opts.strings !== false && p.barV > 0.5) {
    const ends: V2[] = [headTop, ...[-1, 1].map((s) => { const A = arms[s < 0 ? 0 : 1]; return S(A.Wr); })];
    // запястье: точка нити чуть выше кисти, колено — на обруче
    ATT.forEach((q, i) => {
      const a = barP(q), b = ends[i], cut = p.cut[i] ?? 0;
      wire(o, [a[0], a[1] + 1], [b[0], b[1] - (i === 1 || i === 2 ? 1 : 0)], p.slack, cut, i >= 3);
    });
  }
  // край кадра: чужие пиксели на кромке — в цвет контура
  for (let k = 0; k < FR; k++) for (const [x, y] of [[0, k], [FR - 1, k], [k, 0], [k, FR - 1]] as [number, number][]) if (o.has(x, y) && o.get(x, y).join() !== OUTL.join()) o.set(x, y, OUTL);
  return { img: o, emis };
}

/** Нить: светлая жила с тенью справа, узелки-шипы через 6 px; провис; обрыв — нить втягивается к крестовине и закручивается. */
function wire(o: Cv, a: V2, b: V2, slack: number, cut: number, faint: boolean) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1) return;
  const keep = cut > 0.01 ? Math.max(0.12, (1 - cut) * (1 - cut)) : 1, sag = slack * Math.min(5, L * 0.1) + (cut > 0.01 ? 3 * cut : 0);
  const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, sgn = ny < 0 ? -1 : 1; // провис — вниз/наружу
  const pts: V2[] = [];
  const n = Math.ceil(L * 2);
  for (let i = 0; i <= n * keep; i++) {
    const u = i / n, bow = 4 * u * (1 - u) * sag * sgn, curl = cut > 0.01 ? SIN(u * 9) * cut * 1.4 * u : 0;
    const x = Math.round(a[0] + (b[0] - a[0]) * u + nx * bow + curl), y = Math.round(a[1] + (b[1] - a[1]) * u + ny * bow);
    const l = pts[pts.length - 1]; if (!l || l[0] !== x || l[1] !== y) pts.push([x, y]);
  }
  const core = faint ? STRB : STR;
  for (const [x, y] of pts) if (!o.has(x + 1, y) || o.get(x + 1, y).join() !== core.join()) o.set(x + 1, y, STRD);
  pts.forEach(([x, y], i) => { o.set(x, y, core); if (i % 6 === 3 && i > 2) { o.set(x - 1, y, STRB); o.set(x + 1, y, STRD); o.set(x, y - 1, faint ? STRB : STR); } });
}

// ---------------- сведение 2× → 1× ----------------
function rotCv(src: Cv, ang: number, px: number, py: number, sy = 1): Cv {
  if (Math.abs(ang) < 1e-3 && sy === 1) return src;
  const o = new Cv(src.w, src.h), cs = COS(ang), sn = SIN(ang);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const vx = x - px, vy = (y - py) / sy, sx = Math.round(px + vx * cs + vy * sn), sy2 = Math.round(py - vx * sn + vy * cs);
    if (src.has(sx, sy2)) o.set(x, y, src.get(sx, sy2));
  }
  return o;
}
const stamp = (dst: Cv, src: Cv, ox: number, oy: number) => { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.has(x, y)) dst.set(ox + x, oy + y, src.get(x, y)); };
function down(c: Cv): Cv {
  const o = new Cv(FR, FR);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    const cnt = new Map<string, { n: number; col: C }>();
    let op = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      if (!c.has(x * 2 + i, y * 2 + j)) continue; op++;
      const col = c.get(x * 2 + i, y * 2 + j), k = col.join(","), e = cnt.get(k); if (e) e.n++; else cnt.set(k, { n: 1, col });
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

// ---------------- анимации ----------------
const P = (o: Partial<Pose>): Partial<Pose> => o;
/** дёрганье: резкий рывок и затухающая отдача */
const JERK = [0, 0, 1, 0.55, -0.22, 0.07, 0, 0, 0, 0, 0, 0];
const JERK2 = [0, 0, 0, 0, 0, 0, 0, 1, 0.5, -0.25, 0.08, 0];
function idlePoses(): Pose[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (2 * PI * i) / 12, j = JERK[i], k = JERK2[i];
    return { ...REST,
      bar: [0.8 * SIN(ph), -0.6 * j - 0.4 * k] as V2, barT: 0.04 * SIN(ph + 0.4) - 0.07 * j + 0.05 * k,
      bx: 0.5 * SIN(ph - 0.7), by: 0.35 * SIN(2 * ph) - 0.4 * j, roll: 0.025 * SIN(ph - 0.9) - 0.03 * k,
      head: [0.3 * SIN(ph - 1.2), -0.5 * k] as V2, htilt: 0.05 * SIN(ph - 1) + 0.22 * k,
      hR: [-1.2 * j, -4.5 * j + 0.5 * SIN(ph), 0.6 * SIN(ph + 1)] as V3, hL: [0.8 * k, -3.2 * k + 0.5 * SIN(ph + PI), 0.6 * SIN(ph + 2)] as V3,
      cR: 0.45 + 0.5 * j, cL: 0.45 + 0.45 * k, fR: [0, -0.8 * Math.max(0, j), 0] as V3,
      slack: 0.25 - 0.2 * Math.max(j, k), glow: 1 + 0.25 * SIN(ph) + 0.3 * Math.max(j, k) };
  });
}
function walkPoses(): Pose[] {
  return Array.from({ length: 12 }, (_, i) => {
    const f = (2 * PI * i) / 12, la = Math.max(0, SIN(f)), lb = Math.max(0, -SIN(f));
    return { ...REST,
      fL: [0.6 * la, -6.5 * la, 5 * COS(f)] as V3, fR: [-0.6 * lb, -6.5 * lb, -5 * COS(f)] as V3,
      barT: 0.05 * SIN(f), bar: [0.6 * COS(f), -0.2 * Math.abs(SIN(f))] as V2,
      by: 0.9 * COS(2 * f) - 0.2, roll: 0.05 * SIN(f), lean: 0.16, bx: 0.4 * SIN(f),
      hL: [0, -1.5 * lb - 0.5, -4 * COS(f - 0.5)] as V3, hR: [0, -1.5 * la - 0.5, 4 * COS(f - 0.5)] as V3,
      head: [0, -0.4 * COS(2 * f)] as V2, htilt: -0.08 * SIN(f - 0.6), cL: 0.4 + 0.2 * lb, cR: 0.4 + 0.2 * la, slack: 0.15, glow: 1.1 };
  });
}
const attackPoses = (): Pose[] => keyed([
  { f: 0, p: {} },
  { f: 2, p: P({ hR: [-1, -24, -3], barT: -0.06, bar: [0.5, 0.3], cR: 1, lean: 0.05, roll: -0.04, head: [0.5, -0.5], slack: 0, glow: 1.3 }) },
  { f: 4, p: P({ hR: [-2, -29, -5], barT: -0.07, bar: [0.8, 0.4], cR: 1, lean: 0.02, roll: -0.06, head: [0.8, -0.8], slack: 0, glow: 1.4 }) },
  { f: 6, p: P({ hR: [-13, -2, 12], barT: 0.08, bar: [-1, 0.4], cR: 1, lean: 0.3, roll: 0.06, head: [-1, 1], by: 1, flash: 0.9, flashAt: "R", glow: 1.5, slack: 0.4 }) },
  { f: 8, p: P({ hR: [-10, -2, 8], barT: 0.04, cR: 0.7, lean: 0.24, by: 0.6, slack: 0.4 }) },
  { f: 9, p: {} },
], 10);
const SW_UP = P({ hL: [1, -22, -6], hR: [-1, -22, -6], cL: 1, cR: 1, lean: -0.04, by: -0.6, bar: [0, -1], slack: 0, head: [0, -0.6], glow: 1.3 });
const swipeWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: SW_UP }], 4);
const swipeHold = (): Pose[] => Array.from({ length: 4 }, (_, i) => { const q = [0, 1, 0, -1][i]; return { ...REST, ...SW_UP, hL: [1, -22 + 0.6 * q, -6] as V3, hR: [-1, -22 - 0.6 * q, -6] as V3, glow: [1.3, 1.5, 1.35, 1.5][i], bar: [0.3 * q, -1] as V2 } as Pose; });
const swipeStrike = (): Pose[] => keyed([
  { f: 0, p: SW_UP },
  { f: 2, p: P({ hL: [12, 0, 13], hR: [-12, 0, 13], cL: 1, cR: 1, lean: 0.34, by: 1.2, bar: [0, 0.6], slack: 0.5, head: [0, 1.2], flash: 1, flashAt: "LR", dust: 0.6, glow: 1.5 }) },
  { f: 4, p: P({ hL: [10, -1, 11], hR: [-10, -1, 11], cL: 0.8, cR: 0.8, lean: 0.3, by: 1, slack: 0.5, head: [0, 1], flash: 0.2, flashAt: "LR", dust: 0.3 }) },
  { f: 6, p: P({ hL: [3, -1, 4], hR: [-3, -1, 4], lean: 0.18, by: 0.3 }) },
  { f: 7, p: {} },
], 8);
const TH_UP = P({ hL: [3, -40, 1], hR: [-3, -40, 1], cL: 1, cR: 1, lean: -0.06, by: -1, bar: [0, -1.2], slack: 0, head: [0, -1], htilt: 0, glow: 1.5 });
const threadWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: TH_UP }], 4);
const threadHold = (): Pose[] => Array.from({ length: 4 }, (_, i) => { const q = [0, 1, 0, -1][i]; return { ...REST, ...TH_UP, cL: 0.7 + 0.3 * q, cR: 0.7 - 0.3 * q, hL: [3, -40 + 0.7 * q, 1] as V3, hR: [-3, -40 - 0.7 * q, 1] as V3, glow: [1.4, 1.6, 1.45, 1.6][i], htilt: 0.06 * q } as Pose; });
const threadCast = (): Pose[] => keyed([
  { f: 0, p: TH_UP },
  { f: 2, p: P({ hL: [-2, 3, 7], hR: [2, 3, 7], cL: 1, cR: 1, lean: 0.22, by: 0.8, slack: 0.4, thread: 0.55, glow: 1.6, head: [0, 0.8] }) },
  { f: 4, p: P({ hL: [-2.5, 4, 8], hR: [2.5, 4, 8], cL: 1, cR: 1, lean: 0.25, by: 1, slack: 0.4, thread: 1, glow: 1.5, head: [0, 1] }) },
  { f: 5, p: P({ hL: [-2, 3, 7], hR: [2, 3, 7], cL: 0.8, cR: 0.8, lean: 0.22, by: 0.8, slack: 0.4, thread: 1, glow: 1.3 }) },
  { f: 7, p: P({ thread: 0 }) },
], 8);
const CO_IN = P({ hL: [17, -24, 11], hR: [-17, -24, 11], cL: 0.25, cR: 0.25, lean: 0.12, slack: 0.1, spin: 0.25, head: [0, 0.6], htilt: 0.1, glow: 1.3 });
const cocoonWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: CO_IN }], 4);
const cocoonHold = (): Pose[] => Array.from({ length: 4 }, (_, i) => { const a = (i / 4) * 2 * PI; return { ...REST, ...CO_IN, hL: [17 + COS(a), -24 + SIN(a) * 1.4, 11] as V3, hR: [-17 - COS(a), -24 - SIN(a) * 1.4, 11] as V3, spin: 0.35 + 0.15 * i, glow: [1.3, 1.5, 1.35, 1.5][i], htilt: 0.1 + 0.05 * SIN(a) } as Pose; });
const cocoonCast = (): Pose[] => keyed([
  { f: 0, p: { ...CO_IN, spin: 0.85 } },
  { f: 2, p: P({ hL: [14, -17, 17], hR: [-14, -17, 17], cL: 1, cR: 1, lean: 0.3, by: 0.6, spin: 0, ball: 0.3, slack: 0.4, glow: 1.6, head: [0, 1] }) },
  { f: 4, p: P({ hL: [12, -15, 15], hR: [-12, -15, 15], cL: 1, cR: 1, lean: 0.28, by: 0.6, ball: 0.85, slack: 0.4, glow: 1.4 }) },
  { f: 5, p: P({ hL: [8, -10, 10], hR: [-8, -10, 10], lean: 0.22, ball: 0 }) },
  { f: 7, p: {} },
], 8, (t) => easeIO(t));
const NET_UP = P({ by: -2.6, fL: [3, -8, 1], fR: [-3, -8, 1], hL: [2, -22, 0], hR: [-2, -22, 0], cL: 0.9, cR: 0.9, bar: [0, -1.2], slack: 0, lean: 0.04, head: [0, -0.5], glow: 1.3 });
const netWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: NET_UP }], 4);
const netHold = (): Pose[] => Array.from({ length: 4 }, (_, i) => { const q = [0, 1, 0, -1][i]; return { ...REST, ...NET_UP, roll: 0.05 * q, fL: [3 + q, -8, 1 + q * 1.5] as V3, fR: [-3 + q, -8, 1 - q * 1.5] as V3, bar: [0.5 * q, -1.2] as V2, glow: [1.3, 1.5, 1.35, 1.5][i] } as Pose; });
const netStrike = (): Pose[] => keyed([
  { f: 0, p: NET_UP },
  { f: 1, p: P({ by: 2.4, fL: [-3, 0, 1], fR: [3, 0, 1], hL: [-3, 5, 6], hR: [3, 5, 6], cL: 1, cR: 1, lean: 0.24, slack: 0.7, dust: 1, web: 0.12, flash: 0.6, flashAt: "LR", glow: 1.6, head: [0, 1.4] }) },
  { f: 3, p: P({ by: 2, fL: [-3, 0, 1], fR: [3, 0, 1], hL: [-3, 4.5, 6], hR: [3, 4.5, 6], cL: 1, cR: 1, lean: 0.24, slack: 0.6, dust: 0.6, web: 0.5, glow: 1.5, head: [0, 1.2] }) },
  { f: 5, p: P({ by: 1, fL: [-2, 0, 1], fR: [2, 0, 1], hL: [-1, 2, 3], hR: [1, 2, 3], lean: 0.18, slack: 0.4, web: 0.88, glow: 1.2 }) },
  { f: 6, p: P({ by: 0.4, web: 1, lean: 0.14 }) },
  { f: 7, p: P({ web: 0 }) },
], 8);
const stunPoses = (): Pose[] => Array.from({ length: 8 }, (_, i) => { const ph = (2 * PI * i) / 8; return { ...REST,
  by: 3, lean: 0.36, roll: 0.05 * SIN(ph), head: [0.6 * SIN(ph), 3] as V2, htilt: 0.28 * SIN(ph + 1), hL: [3, 5, 2 + SIN(ph)] as V3, hR: [-3, 5, 2 - SIN(ph)] as V3,
  cL: 0.1, cR: 0.1, slack: 1, barT: 0.08 * SIN(ph + 0.5), bar: [0.6 * SIN(ph), 0] as V2, glow: 0.4 + 0.3 * SIN(ph) } as Pose; });
const deathPoses = (): Pose[] => keyed([
  { f: 0, p: {} },
  { f: 2, p: P({ cut: [0, 0, 1, 0, 0], hR: [-3, 5, 3], cR: 0.1, roll: 0.06, barT: -0.06, glow: 0.8 }) },
  { f: 4, p: P({ cut: [0, 1, 1, 0, 0], hR: [-3, 5, 4], hL: [3, 5, 3], cL: 0.1, cR: 0.1, roll: 0.02, barT: 0.08, lean: 0.25, glow: 0.6, by: 1 }) },
  { f: 6, p: P({ cut: [1, 1, 1, 0, 0], hR: [-4, 6, 5], hL: [4, 6, 4], cL: 0, cR: 0, lean: 0.45, by: 3, head: [0, 4], htilt: 0.5, glow: 0.4, barT: -0.06 }) },
  { f: 9, p: P({ cut: [1, 1, 1, 1, 1], hR: [-6, 10, 9], hL: [6, 10, 8], cL: 0, cR: 0, lean: 0.7, by: 11, fL: [-4, 0, 2], fR: [4, 0, 2], head: [1, 7], htilt: 0.8, glow: 0.15, slack: 1, dust: 0.8 }) },
  { f: 11, p: P({ cut: [1, 1, 1, 1, 1], hR: [-7, 11, 10], hL: [7, 11, 9], cL: 0, cR: 0, lean: 0.8, by: 15, fL: [-5, 0, 2], fR: [5, 0, 2], head: [2, 9], htilt: 1.0, glow: 0, sy: 0.92, dust: 0.4, barV: 0 }) },
  { f: 13, p: P({ cut: [1, 1, 1, 1, 1], hR: [-7, 11, 10], hL: [7, 11, 9], cL: 0, cR: 0, lean: 0.82, by: 16, fL: [-5, 0, 2], fR: [5, 0, 2], head: [2, 9.5], htilt: 1.05, glow: 0, sy: 0.9, barV: 0 }) },
], 14);

export type MarAnim = "idle" | "walk" | "attack" | "swipeWind" | "swipeHold" | "swipeStrike" | "threadWind" | "threadHold" | "threadCast"
  | "cocoonWind" | "cocoonHold" | "cocoonCast" | "netWind" | "netHold" | "netStrike" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: MarAnim; hit?: number };
const ANIM_ORDER: [MarAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой на нитях" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар когтем", hit: 6 }],
  ["swipeWind", { n: 4, fps: 12, loop: false, ru: "когти вскинуты", next: "swipeHold" }],
  ["swipeHold", { n: 4, fps: 12, loop: true, ru: "дрожь на нитях", next: "swipeStrike" }],
  ["swipeStrike", { n: 8, fps: 12, loop: false, ru: "терновый взмах", hit: 2 }],
  ["threadWind", { n: 4, fps: 12, loop: false, ru: "руки вверх", next: "threadHold" }],
  ["threadHold", { n: 4, fps: 12, loop: true, ru: "перебирает нити", next: "threadCast" }],
  ["threadCast", { n: 8, fps: 12, loop: false, ru: "нити к земле", hit: 4 }],
  ["cocoonWind", { n: 4, fps: 12, loop: false, ru: "руки к груди", next: "cocoonHold" }],
  ["cocoonHold", { n: 4, fps: 12, loop: true, ru: "мотает клубок", next: "cocoonCast" }],
  ["cocoonCast", { n: 8, fps: 12, loop: false, ru: "бросок кокона", hit: 4 }],
  ["netWind", { n: 4, fps: 12, loop: false, ru: "вздёрнут нитями", next: "netHold" }],
  ["netHold", { n: 4, fps: 12, loop: true, ru: "висит", next: "netStrike" }],
  ["netStrike", { n: 8, fps: 12, loop: false, ru: "падение, сеть", hit: 1 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение, нити провисли" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель, нити рвутся" }],
];
export const MAR_ANIMS = {} as Record<MarAnim, AnimDef>;
{ let col = 0; for (const [k, a] of ANIM_ORDER) { MAR_ANIMS[k] = { ...a, col }; col += a.n; } }
export const MAR_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
/** связки умений (имена умений — рабочие, по карточке) */
export const MAR_SKILLS: Record<string, { windup: [MarAnim, MarAnim]; strike: MarAnim }> = {
  thorn_sweep: { windup: ["swipeWind", "swipeHold"], strike: "swipeStrike" },
  puppet_threads: { windup: ["threadWind", "threadHold"], strike: "threadCast" },
  cocoon: { windup: ["cocoonWind", "cocoonHold"], strike: "cocoonCast" },
  web_drop: { windup: ["netWind", "netHold"], strike: "netStrike" },
};
const POSES: Record<MarAnim, () => Pose[]> = {
  idle: idlePoses, walk: walkPoses, attack: attackPoses, swipeWind, swipeHold, swipeStrike, threadWind, threadHold, threadCast,
  cocoonWind, cocoonHold, cocoonCast, netWind, netHold, netStrike, stun: stunPoses, death: deathPoses,
};

// ---------------- эффекты мира: кокон на герое, сеть на земле ----------------
export const FX = { cocoon: { w: 32, h: 48, n: 6 }, web: { w: 96, h: 48, n: 6 } };
/** Эффект мира для игры: сеть на земле (96×48, 2 строки — рисунок и свечение): растёт 0–2, держит 3–5 (мерцает), тает 6–7. */
export const GAME_FX = {
  web: { w: 96, h: 48, ax: 48, ay: 24, n: 8, fps: 12, hit: 2, anims: { webIn: { col: 0, n: 3, loop: false, hit: 2 }, webHold: { col: 3, n: 3, loop: true }, webOut: { col: 6, n: 2, loop: false } } },
};
/** Кокон на герое — моб-спутник `<босс>_cage` (лист как у мобов: 12 столбцов × 3 вида; 0–3 покой — дрожит, 4–7 «атака» — трещины, 8–11 гибель — разлетается), кадр 32×48, низ на y = 44. */
export const COCOON_UNIT = { frame: 32, frameH: 48, cols: 12 };
/** кокон 32×48: 0–1 обматывает, 2 целый (держит), 3–4 трещины (бьют союзники), 5 разлетается */
function cocoonFx(i: number): Cv {
  const c = new Cv(64, 96), cx = 32, cy = 54;
  const h = [0.45, 0.8, 1, 1, 1, 0.9][i], m = mk();
  m.ellR(cx, cy + 30 * (1 - h), 22, 36 * h);
  if (i < 5) {
    paintB(c, m, COCOON, { amp: 1.6, dome: 10, dith: 0.35, bias: 0.2 });
    for (let k = -8; k <= 8; k++) for (let t = -1; t <= 1; t += 0.02) { const x = cx + t * 22, y = cy + k * 8 + t * 10 + SIN(t * 4 + k) * 2; if (m.has(Math.round(x), Math.round(y))) { c.set(x, y, k % 2 ? COCOON[1] : COCOON[2]); c.set(x, y - 1, COCOON[4]); } }
    if (i >= 3) for (let q = 0; q < (i === 3 ? 1 : 3); q++) { let x = cx - 8 + q * 9, y = cy - 20 + q * 10; for (let s = 0; s < 14; s++) { x += (hash(q, s) - 0.5) * 6; y += 3; if (m.has(Math.round(x), Math.round(y))) { c.set(x, y, THORN[1]); c.set(x + 1, y, RUNE0); } } }
    for (let k = 0; k < 6; k++) { const x = cx - 14 + k * 5.6, y0 = cy - 36 * h - 4; for (let y = y0; y < y0 + 8; y++) c.set(x + SIN(y) * 0.8, y, THR0); }
  } else {
    for (let k = 0; k < 26; k++) { const a = hash(k, 1) * 2 * PI, r = 10 + hash(1, k) * 22, x = cx + COS(a) * r, y = cy + SIN(a) * r * 1.2; const s = mk(); s.ellR(x, y, 3 + hash(k, 2) * 3, 2, a); paintB(c, s, COCOON, { amp: 1.2, dome: 2, dith: 0.3 }); }
  }
  const o = new Cv(32, 48);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) { const q = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => [x * 2 + a, y * 2 + b]).filter(([a, b]) => c.has(a, b)); if (q.length >= 2) o.set(x, y, c.get(q[0][0], q[0][1])); }
  o.outline(OUTL);
  return o;
}
/** сеть на земле 96×48 (вид сверху в перспективе): растёт 0–2, держит 3–4 (мерцает), тает 5 */
function webFx(i: number): Cv {
  const o = new Cv(96, 48), cx = 48, cy = 24, k = [0.35, 0.7, 1, 1, 1, 1][i], R = 44 * k;
  const col = (q: number) => (i === 5 ? (q % 3 ? THR0 : STRB) : i === 4 && q % 4 === 0 ? THR1 : q % 2 ? THR0 : THR1);
  const SP = 12;
  const spoke = (t: number) => t * 2 * PI / SP + 0.13;
  for (let s = 0; s < SP; s++) { const t = spoke(s); for (let q = 2; q <= R; q += 0.6) { const x = cx + COS(t) * q, y = cy + SIN(t) * q * 0.48; if (i === 5 && hash(s, q) < 0.4) continue; o.set(x, y, col(Math.round(q))); } }
  for (let ring = 1; ring <= 5; ring++) { const rr = (ring / 5) * R; for (let s = 0; s < SP; s++) { const t0 = spoke(s), t1 = spoke(s + 1); for (let u = 0; u <= 1; u += 0.05) { const sag = SIN(u * PI) * rr * 0.08; const x = cx + COS(t0) * rr * (1 - u) + COS(t1) * rr * u, y = cy + SIN(t0) * rr * 0.48 * (1 - u) + SIN(t1) * rr * 0.48 * u; const dx = x - cx, dy = (y - cy) / 0.48, dl = Math.hypot(dx, dy) || 1; if (i === 5 && hash(ring * 13 + s, u * 20) < 0.45) continue; o.set(x - (dx / dl) * sag, y - (dy / dl) * sag * 0.48, col(ring + s)); } } }
  // (тень под нитями)
  for (let y = 0; y < 48; y++) for (let x = 0; x < 96; x++) if (o.has(x, y) && !o.has(x, y + 1) && GLOWSET.has(o.get(x, y).join())) o.set(x, y + 1, STRD);
  return o;
}

// ---------------- листы и превью ----------------
const cvToPng = (c: Cv): PNG => { const p = new PNG({ width: c.w, height: c.h }); p.data = Buffer.from(c.d); return p; };
const savePng = (c: Cv, f: string) => fs.writeFileSync(f, PNG.sync.write(cvToPng(c)));
const loadPng = (p: string) => PNG.sync.read(fs.readFileSync(p));
/** кроп референса 32 (логотип справа сверху закрашен цветом фона) */
function refCrop(root: string, h: number): Cv | null {
  const f = path.join(root, "tools", "out", "bosses139", "ref-32.png");
  if (!fs.existsSync(f)) return null;
  const p = loadPng(f), x0 = Math.round(p.width * 0.0), x1 = Math.round(p.width * 1), y0 = Math.round(p.height * 0.035), y1 = Math.round(p.height * 0.96);
  const bgq = (Math.round(p.height * 0.2) * p.width + Math.round(p.width * 0.93)) * 4;
  const sc = (y1 - y0) / h, w = Math.round((x1 - x0) / sc), o = new Cv(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = Math.floor(y * sc); j < Math.max(Math.floor(y * sc) + 1, Math.floor((y + 1) * sc)); j++) for (let i = Math.floor(x * sc); i < Math.max(Math.floor(x * sc) + 1, Math.floor((x + 1) * sc)); i++) {
      const X = x0 + i, Y = y0 + j, logo = X > p.width * 0.68 && Y < p.height * 0.105, q = logo ? bgq : (Y * p.width + X) * 4;
      r += p.data[q]; g += p.data[q + 1]; b += p.data[q + 2]; n++;
    }
    o.set(x, y, [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  }
  return o;
}
const blitSub = (dst: Cv, src: Cv, sx: number, sy: number, w: number, h: number, ox: number, oy: number, k = 1) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src.has(sx + x, sy + y)) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) dst.set(ox + x * k + a, oy + y * k + b, src.get(sx + x, sy + y));
};
const GROUND = hx("#6e6252"), PANEL = hx("#322f38"), NIGHT = hx("#161c34"), BG = hx("#26242b");
function nightTint(c: Cv, x: number, y: number, w: number, h: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (c.has(x + i, y + j)) { const q = c.get(x + i, y + j); c.set(x + i, y + j, [Math.round(q[0] * 0.45), Math.round(q[1] * 0.5), Math.round(q[2] * 0.75)]); } }
const silc = (c: Cv, col: C): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(x, y, col); return o; };

export function writeSketch(root: string, outDir: string): string {
  const fr = (v: ViewId) => render(v, REST).img;
  const side = fr("side"), frames: Cv[] = [fr("front"), fr("back"), side, flip(side)];
  const SW = 1290, SH = 780, s = new Cv(SW, SH);
  s.rect(0, 0, SW, SH, BG);
  s.rect(8, 8, 4 * 88 + 140, 110, PANEL); label(s, 14, 12, "ЭСКИЗ ×1 ВНИЗ ВВЕРХ ВБОК ВЛЕВО | РЕФЕРЕНС 32");
  frames.forEach((f, i) => { s.rect(16 + i * 88, 30, 80, 80, GROUND); s.blit(f, 16 + i * 88, 30, 1); });
  const r76 = refCrop(root, 80); if (r76) s.blit(r76, 16 + 4 * 88 + 20, 30, 1);
  s.rect(8, 126, 4 * 248 + 8, 270, PANEL); label(s, 14, 130, "ЭСКИЗ ×3");
  frames.forEach((f, i) => { s.rect(16 + i * 248, 150, 240, 240, GROUND); s.blit(f, 16 + i * 248, 150, 3); });
  const ref = refCrop(root, 240); if (ref) { s.rect(1008, 126, ref.w + 16, 270, PANEL); s.blit(ref, 1016, 150, 1); }
  s.rect(8, 404, 1274, 368, PANEL); label(s, 14, 410, "СИЛУЭТ ВНИЗ ×4 | РЕФЕРЕНС");
  s.blit(silc(frames[0], SIL), 24, 430, 4);
  if (ref) { const r2 = refCrop(root, 336)!; s.blit(r2, 380, 430, 1); }
  const f = path.join(outDir, "r69s-e-sketch.png"); savePng(s, f); return f;
}

export function writeMarionetteArt(root: string, outDir: string, only?: MarAnim[], quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const N = FRAME, FH = FRAME_H, sheet = new Cv(N * MAR_COLS, FH * 3), glow = new Cv(N * MAR_COLS, FH * 3);
  const bad: string[] = [];
  for (const [a, d] of ANIM_ORDER) {
    if (only && !only.includes(a)) continue;
    const poses = POSES[a]();
    VIEWS.forEach((v, row) => poses.slice(0, quick ? 1 : d.n).forEach((p, i) => {
      const r = render(v, p), x0 = (MAR_ANIMS[a].col + i) * N, y0 = row * FH;
      blitSub(sheet, r.img, 0, 0, N, FH, x0, y0); blitSub(glow, r.emis, 0, 0, N, FH, x0, y0);
      // край кадра: по краю только контур; тело не должно упираться (нити и эффекты — можно)
      let hits = 0;
      for (let k = 0; k < FH; k++) for (const x of [0, N - 1]) if (r.img.has(x, k) && r.img.get(x, k).join() !== OUTL.join()) hits++;
      for (let k = 0; k < N; k++) for (const y of [0, FH - 1]) if (r.img.has(k, y) && r.img.get(k, y).join() !== OUTL.join()) hits++;
      let body = 0; for (let k = 0; k < FH; k++) for (const x of [0, N - 1]) if (r.img.has(x, k)) body++;
      for (let k = 0; k < N; k++) if (r.img.has(k, 0)) body++;
      if (hits || body) bad.push(`${a} ${v} кадр ${i + 1}: край ${hits}, контур на краю ${body}`);
    }));
  }
  savePng(sheet, path.join(outDir, "marion-sheet.png")); savePng(glow, path.join(outDir, "marion-glow.png"));
  // эффекты мира
  const fx = new Cv(FX.cocoon.w * FX.cocoon.n + 8 + FX.web.w * FX.web.n, 48);
  for (let i = 0; i < 6; i++) { fx.blit(cocoonFx(i), i * 32, 0); fx.blit(webFx(i), 6 * 32 + 8 + i * 96, 0); }
  savePng(fx, path.join(outDir, "marion-fx.png"));
  // в игру: сеть (рисунок + свечение) и лист кокона-моба
  { const F = GAME_FX.web, web = new Cv(F.w * F.n, F.h * 2), MAP = [0, 1, 2, 3, 4, 3, 5, 5];
    for (let j = 0; j < F.n; j++) { const f = webFx(MAP[j]);
      for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) { if (!f.has(x, y) || (j === 7 && hash(x, y + 7) < 0.5)) continue; const q = f.get(x, y); web.set(j * F.w + x, y, q); if (GLOWSET.has(q.join())) web.set(j * F.w + x, F.h + y, q); } }
    savePng(web, path.join(outDir, "marion-fx-web.png"));
    const U = COCOON_UNIT, unit = new Cv(U.frame * U.cols, U.frameH * 3);
    const cols: [number, number, number][] = [[2, 0, 0], [2, 1, 0], [2, 0, 0], [2, -1, 0], [3, 0, 0], [4, 1, 0], [3, 0, 0], [4, -1, 0], [4, 0, 0], [5, 0, 0], [5, 0, 0.4], [5, 0, 0.8]];
    for (let row = 0; row < 3; row++) cols.forEach(([fi, dx, drop], i) => { const f = cocoonFx(fi);
      for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) if (f.has(x, y) && !(drop && hash(x + i, y) < drop)) unit.set(i * U.frame + x + dx, row * U.frameH + y - 1, f.get(x, y)); });
    savePng(unit, path.join(outDir, "marion-cocoon-unit.png")); }

  // сравнение: покой ×3 в 4 видах | референс; ночь со свечением; по две анимации в ряд (вбок, 4 кадра ×2); эффекты мира
  const ref = refCrop(root, 240);
  const shown = ANIM_ORDER.filter(([a]) => !only || only.includes(a));
  const rows = Math.ceil(shown.length / 2), RW = 1360, rowH = 176;
  const c = new Cv(RW, 340 + 40 + rows * rowH + 130);
  c.rect(0, 0, RW, c.h, BG);
  label(c, 10, 8, "ПОКОЙ ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 32", 2);
  const idle = (row: number, fl = false): Cv => { const f = new Cv(N, FH); blitSub(f, sheet, 0, row * FH, N, FH, 0, 0); return fl ? flip(f) : f; };
  [idle(0), idle(1), idle(2), idle(2, true)].forEach((f, i) => { c.rect(10 + i * 244, 30, 240, 240, GROUND); c.blit(f, 10 + i * 244, 30, 3); });
  c.rect(10, 280, 4 * 244 - 4, 84, GROUND);
  [idle(0), idle(1), idle(2), idle(2, true)].forEach((f, i) => c.blit(f, 10 + i * 244 + 80, 282, 1));
  if (ref) { c.rect(990, 26, ref.w + 8, 248, PANEL); c.blit(ref, 994, 30, 1); }
  c.rect(990, 280, 360, 84, NIGHT);
  for (let i = 0; i < 3; i++) { const fi = [0, 2, 7][i]; const f = new Cv(N, FH); blitSub(f, sheet, fi * N, 0, N, FH, 0, 0); c.blit(f, 1000 + i * 112, 282, 1); nightTint(c, 1000 + i * 112, 282, N, FH); blitSub(c, glow, fi * N, 0, N, FH, 1000 + i * 112, 282, 1); }
  const y0 = 380;
  shown.forEach(([a, d], idx) => {
    const col = idx % 2, row = Math.floor(idx / 2), ox = 10 + col * 680, oy = y0 + row * rowH;
    c.rect(ox, oy, 670, rowH - 6, PANEL);
    label(c, ox + 4, oy + 3, `${MAR_ANIMS[a].ru}`.toUpperCase(), 2);
    const nShow = Math.min(4, d.n), step = (d.n - 1) / Math.max(1, nShow - 1);
    for (let k = 0; k < nShow; k++) {
      const fi = Math.round(k * step), fx2 = ox + 4 + k * 166;
      c.rect(fx2, oy + 18, 162, 150, GROUND);
      blitSub(c, sheet, (MAR_ANIMS[a].col + fi) * N, 2 * FH, N, FH, fx2 + 1, oy + 18 - 10, 2);
    }
  });
  { const oy = y0 + rows * rowH; c.rect(10, oy, RW - 20, 120, PANEL); label(c, 14, oy + 3, "КОКОН НА ГЕРОЕ ×2 | СЕТЬ НА ЗЕМЛЕ ×1", 2); c.rect(14, oy + 18, RW - 28, 98, GROUND); blitSub(c, fx, 0, 0, 6 * 32, 48, 18, oy + 20, 2); blitSub(c, fx, 6 * 32 + 8, 0, 6 * 96, 48, 18 + 6 * 64 + 20, oy + 44, 1); }
  savePng(c, path.join(outDir, "r69s-e-compare.png"));

  // все кадры всех анимаций: вбок ×2 (плавность), каждая анимация — строка
  { const k = 2, cw = N * k, maxN = Math.max(...shown.map(([, d]) => d.n)), A = new Cv(170 + maxN * (cw + 2), shown.length * (FH * k + 4) + 4);
    A.rect(0, 0, A.w, A.h, BG);
    shown.forEach(([a, d], r) => { const oy = 4 + r * (FH * k + 4); MAR_ANIMS[a].ru.toUpperCase().split(" ").forEach((w, j) => label(A, 4, oy + 4 + j * 14, w.slice(0, 18), 2));
      for (let i = 0; i < d.n; i++) { const ox = 170 + i * (cw + 2); A.rect(ox, oy, cw, FH * k, GROUND); blitSub(A, sheet, (MAR_ANIMS[a].col + i) * N, 2 * FH, N, FH, ox, oy, k); } });
    savePng(A, path.join(outDir, "r69s-e-anims.png")); }
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 40).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; } else console.log("  проверки: край кадра чист");
  console.log(`  ${ID}: ${MAR_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  return ["marion-sheet.png", "marion-glow.png", "marion-fx.png", "r69s-e-compare.png", "r69s-e-anims.png"].map((f) => path.join(outDir, f));
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/umb_bone_marionette.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const out = path.join(root, "tools", "out", "bosses139"), t = Date.now();
  if (process.argv.includes("--sketch")) console.log("  эскиз:", writeSketch(root, out));
  else {
    const onlyArg = process.argv.find((a) => a.startsWith("--only="));
    const only = onlyArg ? (onlyArg.slice(7).split(",") as MarAnim[]) : undefined;
    const files = writeMarionetteArt(root, out, only, process.argv.includes("--quick"));
    console.log(`  ${files.length} файлов`);
  }
  console.log(`  ${((Date.now() - t) / 1000).toFixed(1)} с`);
}
