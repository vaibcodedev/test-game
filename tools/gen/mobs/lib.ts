/**
 * Мобы под новую карту (задача 140): общая библиотека процедурного пиксель-арта — тот же метод, что у боссов стартовых
 * земель (tools/gen/zone-bosses-art*.ts), но в кадре моба 32×32 (ступни на линии героя) и с переиспользуемыми частями.
 *
 * Метод: тело в 3D (X — вправо от моба, Y — вперёд, Z — вверх), объёмные примитивы в поле расстояний (конус со
 * скруглёнными концами, эллипсоид, скруглённый брусок; срез плоскостью), гладкое слияние внутри группы; луч на пиксель
 * (ортографическая камера, наклон 14°), свет сверху слева → 5 тонов на материал, тень от света, затенение складок, швы
 * между деталями тоном тени, светлая кромка к свету у крупных форм, контур 1 px. Узор (рёбра, ржавчина, кольчуга) —
 * функцией текстуры детали: в местных координатах (едет вместе с деталью) или в пикселях от опорной точки (целые пиксели).
 * Лицо, глазницы, свечение глаз — штампы в целых пикселях. Жёсткие части тела между кадрами сдвигаются только на целые
 * пиксели кадра (snapPx) — рисунок не «кипит».
 *
 * Оружие — отдельные слои: функция WeaponFn строит примитивы от хвата (Grip: точка, направление к острию, плоскость),
 * поэтому роль моба меняется сменой оружия, тело общее. Части для гибели помечаются piece — их можно сдвинуть и повернуть
 * как целое (rigidPieces), так тело «рассыпается».
 *
 * Проверки кадров: frameEdgeCuts (края кадра касается только контур), frameHoles (нет прозрачных дыр внутри силуэта),
 * thinLines (нет однопиксельных линий: полоса в 1 px между контуром с двух сторон длиной ≥ 3).
 * Монтаж: земля игры (tiles/terrain.png), тень, ночь (затемнение, светящееся не гаснет), подписи пиксельным шрифтом.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "../canvas";

// ---------------- математика ----------------
export type V3 = [number, number, number];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vlen = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => mul(a, 1 / (vlen(a) || 1));
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const TAU = Math.PI * 2;
export const rad = (d: number) => (d * Math.PI) / 180;
export const easeInOut = (t: number) => t * t * (3 - 2 * t);
export const easeIn = (t: number) => t * t;
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const linear = (t: number) => t;

/** Поворот вектора: крен (вокруг Y), наклон (вокруг X, верх уходит вперёд), разворот (вокруг Z, правый бок вперёд). */
export function rot(v: V3, pitch: number, yaw: number, roll = 0): V3 {
  let [x, y, z] = v;
  let c = Math.cos(roll), s = Math.sin(roll);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(pitch);
  s = Math.sin(pitch);
  [y, z] = [y * c + z * s, -y * s + z * c];
  c = Math.cos(yaw);
  s = Math.sin(yaw);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}
/** Поворот вокруг произвольной оси (Родриг). */
export function rotAxis(v: V3, axis: V3, ang: number): V3 {
  const k = norm(axis), c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}
/** Составляющая v, перпендикулярная оси. */
export function perp(axis: V3, v: V3): V3 {
  const w = norm(axis);
  const q = sub(v, mul(w, dot(v, w)));
  return vlen(q) < 1e-3 ? norm(cross(w, Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])) : norm(q);
}
/** Две кости из A в B, локоть/колено в сторону pole. */
export function ik(a: V3, b: V3, l1: number, l2: number, pole: V3): V3 {
  const ab = sub(b, a);
  const d = vlen(ab);
  if (d < 1e-3) return a;
  const u = mul(ab, 1 / d);
  if (d >= l1 + l2 - 0.05) return add(a, mul(u, d * (l1 / (l1 + l2))));
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const q = perp(u, pole);
  return add(a, add(mul(u, x), mul(q, h)));
}
/** Тройка осей от направления и подсказки «вбок». */
export function frameOf(dir: V3, sideHint: V3): [V3, V3, V3] {
  const w = norm(dir);
  const s = perp(w, sideHint);
  return [s, cross(w, s), w];
}

// ---------------- вид и камера ----------------
export type View = "down" | "up" | "side";
export const VIEWS: View[] = ["down", "up", "side"];
export const VIEW_RU: Record<View, string> = { down: "вниз", up: "вверх", side: "вбок" };
export interface Cam { N: number; CX: number; GY: number }
/** Кадр моба: 32×32, как у героя; ступни (z = 0) — в 30-м ряду: последний ряд тела — 30, контур — 31, как у героя. */
export const MOB_CAM: Cam = { N: 32, CX: 16, GY: 30.4 };
const CAM = rad(14);
export const CS = Math.cos(CAM), SN = Math.sin(CAM);
/** Подъём в мире на PX — ровно 1 px кадра по вертикали. */
export const PX = 1 / CS;
/** Модель → вид: Xv вправо по экрану, Yv к зрителю, Zv вверх. Вниз — лицом к зрителю, вверх — спиной, вбок — лицом вправо. */
export function toView(view: View, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
export function fromView(view: View, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
export const scr = (cam: Cam, p: V3): [number, number] => [cam.CX + p[0], cam.GY + SN * p[1] - CS * p[2]];
/** Глубина вдоль луча: меньше — ближе к зрителю. */
export const depthOf = (p: V3) => -(CS * p[1] + SN * p[2]);
/** Свет сверху слева и чуть спереди (в пространстве вида). */
export const LIGHT: V3 = norm([-0.58, 0.42, 0.7]);
/** Сдвиг в мире → ровно целые пиксели кадра в этом виде. */
export function snapPx(view: View, w: V3): V3 {
  const v = toView(view, w);
  const sx = Math.round(v[0]), sy = Math.round(SN * v[1] - CS * v[2]);
  return fromView(view, [sx, 0, -sy * PX]);
}
/** Сдвиг на целые пиксели кадра [вправо, вниз] → мир. */
export const pxToWorld = (view: View, dx: number, dy: number): V3 => fromView(view, [dx, 0, -dy * PX]);

// ---------------- материалы ----------------
export const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Тон = base + gain·(n·L); lo/hi — пределы; crisp — без сглаживания и без затенения (тон задаёт правило); glow — светится ночью. */
export interface Mat { name: string; ramp: Ramp; base: number; gain: number; lo: number; hi: number; crisp?: boolean; glow?: boolean; big?: boolean }
export const mat = (name: string, ramp: Ramp, o: Partial<Mat> = {}): Mat => ({ name, ramp, base: 1.7, gain: 2.3, lo: 1, hi: 4, ...o });

// ---------------- примитивы и сцена ----------------
/** Текстура: поправка тона (или "void" — пустота-щель, тон 0) по местным координатам и пикселю. */
export interface TexCtx { l: V3; u: number; x: number; y: number; ax: number; ay: number; lum: number; edge: boolean; tone: number; view: View }
export type TexFn = (c: TexCtx) => number | { mat: Mat; d: number };

export interface Prim {
  /** 0 — конус со скруглёнными концами (шар, если a = b), 1 — эллипсоид, 5 — скруглённый брусок */
  k: number;
  a: V3; b: V3; ra: number; rb: number;
  ax: [V3, V3, V3]; r: V3; rr: number;
  mat: Mat; g: number; part: number; piece: number;
  tex?: TexFn; ref: V3; anc: V3;
  /** срез плоскостью в местных осях (эллипсоид, брусок): оставить dot(l, n) ≤ d */
  cut?: { n: V3; d: number };
  tone: number;
  big?: boolean;
  sph: boolean; ba: V3; l2: number; rd: number; a2: number; il2: number; len: number; bc: V3; br: number;
}
export interface Opt { tex?: TexFn; ref?: V3; part?: number; piece?: number; tone?: number; anc?: V3; cut?: { n: V3; d: number }; big?: boolean }

/** Штамп в целых пикселях у точки поверхности: ключ → цвет; glow — ключи со свечением (ореол цветом halo). */
export interface Stamp { at: V3; n: V3; px: Partial<Record<View, StampPx[]>>; colors: Record<string, RGBA>; glow?: string[]; halo?: RGBA; minFacing?: number; overBg?: boolean; depthTol?: number; piece?: number }
export type StampPx = [number, number, string];
export const stampRows = (rs: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  rs.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") out.push([x0 + i, y0 + j, ch]); }));
  return out;
};

export class Scene {
  prims: Prim[] = [];
  gk: number[] = [];
  stamps: Stamp[] = [];
  parts = 0;
  group(k = 0): number {
    this.gk.push(k);
    return this.gk.length - 1;
  }
  newPart() {
    return 1000 + this.parts++;
  }
  private base(k: number, g: number, m: Mat, a: V3, b: V3, ax: [V3, V3, V3], o: Opt): Prim {
    const q: Prim = {
      k, a, b, ra: 0, rb: 0, ax, r: [0, 0, 0], rr: 0, mat: m, g, part: o.part ?? g, piece: o.piece ?? -1, tex: o.tex, ref: o.ref ?? ax[0], anc: o.anc ?? a,
      cut: o.cut, tone: o.tone ?? 0, big: o.big,
      sph: false, ba: [0, 0, 0], l2: 0, rd: 0, a2: 0, il2: 0, len: 0, bc: a, br: 0,
    };
    this.prims.push(q);
    return q;
  }
  cone(g: number, m: Mat, a: V3, ra: number, b: V3, rb: number, o: Opt = {}): Prim {
    const q = this.base(0, g, m, a, b, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o);
    q.ra = ra;
    q.rb = rb;
    q.ref = o.ref ?? perp(sub(b, a), [0, 1, 0.01]);
    return q;
  }
  ball(g: number, m: Mat, c: V3, r: number, o: Opt = {}): Prim {
    return this.cone(g, m, c, r, c, r, o);
  }
  ell(g: number, m: Mat, c: V3, r: V3, ax: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o: Opt = {}): Prim {
    const q = this.base(1, g, m, c, c, ax, o);
    q.r = r;
    return q;
  }
  /** Брусок: полуразмеры r по осям ax, скругление rr. */
  box(g: number, m: Mat, c: V3, r: V3, ax: [V3, V3, V3], rr = 0.2, o: Opt = {}): Prim {
    const q = this.base(5, g, m, c, c, ax, o);
    q.r = r;
    q.rr = rr;
    return q;
  }
}

/** Части piece → жёсткий сдвиг и поворот (вокруг центра c0, затем перенос в c1). */
export function rigidPieces(sc: Scene, tf: (piece: number) => { c0: V3; c1: V3; axis: V3; ang: number } | null) {
  for (const q of sc.prims) {
    if (q.piece < 0) continue;
    const T = tf(q.piece);
    if (!T) continue;
    const P = (p: V3) => add(T.c1, rotAxis(sub(p, T.c0), T.axis, T.ang));
    const D = (v: V3) => rotAxis(v, T.axis, T.ang);
    q.a = P(q.a);
    q.b = P(q.b);
    q.anc = P(q.anc);
    q.ref = D(q.ref);
    q.ax = [D(q.ax[0]), D(q.ax[1]), D(q.ax[2])];
  }
  for (const st of sc.stamps) {
    const pc = st.piece;
    if (pc === undefined) continue;
    const T = tf(pc);
    if (!T) continue;
    st.at = add(T.c1, rotAxis(sub(st.at, T.c0), T.axis, T.ang));
    st.n = rotAxis(st.n, T.axis, T.ang);
  }
}

function prepare(q: Prim, view: View) {
  q.a = toView(view, q.a);
  q.b = toView(view, q.b);
  q.ref = toView(view, q.ref);
  q.anc = toView(view, q.anc);
  q.ax = [toView(view, q.ax[0]), toView(view, q.ax[1]), toView(view, q.ax[2])];
  if (q.k === 1 || q.k === 5) {
    q.bc = q.a;
    q.br = q.k === 5 ? vlen(q.r) + 0.1 : Math.max(q.r[0], q.r[1], q.r[2]);
    q.len = 2 * q.r[2];
    return;
  }
  q.ba = sub(q.b, q.a);
  q.l2 = dot(q.ba, q.ba);
  q.len = Math.sqrt(q.l2);
  q.rd = q.ra - q.rb;
  q.a2 = q.l2 - q.rd * q.rd;
  q.sph = q.l2 < 1e-4 || q.a2 < 0.05;
  if (q.sph && q.l2 >= 1e-4) {
    if (q.ra < q.rb) q.a = q.b;
    q.ra = Math.max(q.ra, q.rb);
  }
  q.il2 = q.sph ? 0 : 1 / q.l2;
  q.bc = q.sph ? q.a : lerpV(q.a, q.b, 0.5);
  q.br = q.sph ? q.ra : q.len / 2 + Math.max(q.ra, q.rb);
}
/** Крупная форма: ей одной даётся светлая кромка к свету. */
const bigPrim = (q: Prim) => q.big ?? (q.k === 0 ? Math.max(q.ra, q.rb) >= 2.4 : [...q.r].sort((a, b) => b - a)[1] >= 2.4);

function local(q: Prim, px: number, py: number, pz: number): V3 {
  const A = q.ax;
  return [px * A[0][0] + py * A[0][1] + pz * A[0][2], px * A[1][0] + py * A[1][1] + pz * A[1][2], px * A[2][0] + py * A[2][1] + pz * A[2][2]];
}

function sdPrim(q: Prim, x: number, y: number, z: number): number {
  const px = x - q.a[0], py = y - q.a[1], pz = z - q.a[2];
  if (q.k === 1 || q.k === 5) {
    const l = local(q, px, py, pz);
    let d: number;
    if (q.k === 1) {
      const r = q.r;
      const lx = l[0] / r[0], ly = l[1] / r[1], lz = l[2] / r[2];
      const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
      const k1 = Math.sqrt((lx / r[0]) ** 2 + (ly / r[1]) ** 2 + (lz / r[2]) ** 2);
      d = k1 < 1e-6 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
    } else {
      const qx = Math.abs(l[0]) - (q.r[0] - q.rr), qy = Math.abs(l[1]) - (q.r[1] - q.rr), qz = Math.abs(l[2]) - (q.r[2] - q.rr);
      d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - q.rr;
    }
    if (q.cut) d = Math.max(d, dot(l, q.cut.n) - q.cut.d);
    return d;
  }
  if (q.sph) return Math.sqrt(px * px + py * py + pz * pz) - q.ra;
  // конус со скруглёнными концами (И. Квилес)
  const bx = q.ba[0], by = q.ba[1], bz = q.ba[2], l2 = q.l2;
  const yy = px * bx + py * by + pz * bz;
  const zz = yy - l2;
  const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = Math.sign(q.rd) * q.rd * q.rd * x2;
  if (Math.sign(zz) * q.a2 * z2 > k) return Math.sqrt(x2 + z2) * q.il2 - q.rb;
  if (Math.sign(yy) * q.a2 * y2 < k) return Math.sqrt(x2 + y2) * q.il2 - q.ra;
  return (Math.sqrt(x2 * q.a2 * q.il2) + yy * q.rd) * q.il2 - q.ra;
}

let lastBest = -1;
/** Поле сцены: внутри группы — гладкое слияние, между группами — минимум; земля срезает всё ниже z = 0. */
function sdScene(prims: Prim[], gk: number[], cand: Int32Array, nc: number, x: number, y: number, z: number): number {
  let d = 1e9, dg = 1e9, g = -1, bd = 1e9, best = -1;
  for (let i = 0; i < nc; i++) {
    const qi = cand[i], q = prims[qi];
    const di = sdPrim(q, x, y, z);
    if (di < bd) {
      bd = di;
      best = qi;
    }
    if (q.g !== g) {
      if (dg < d) d = dg;
      dg = di;
      g = q.g;
    } else {
      const k = gk[g];
      if (k > 0) {
        const h = Math.max(k - Math.abs(dg - di), 0) / k;
        dg = Math.min(dg, di) - h * h * k * 0.25;
      } else dg = Math.min(dg, di);
    }
  }
  if (dg < d) d = dg;
  lastBest = best;
  return Math.max(d, -z);
}

export interface GBuf { prim: Int32Array; t: Float32Array; n: Float32Array; p: Float32Array }

function raster(cam: Cam, prims: Prim[], gk: number[]): GBuf {
  const N = cam.N;
  const n = prims.length;
  const rx0 = new Float32Array(n), ry0 = new Float32Array(n), rx1 = new Float32Array(n), ry1 = new Float32Array(n), tc = new Float32Array(n), tr = new Float32Array(n);
  prims.forEach((q, i) => {
    const [sx, sy] = scr(cam, q.bc);
    const r = q.br + gk[q.g] + 0.6;
    rx0[i] = sx - r; rx1[i] = sx + r; ry0[i] = sy - r; ry1[i] = sy + r;
    tc[i] = depthOf(q.bc); tr[i] = r;
  });
  const out: GBuf = { prim: new Int32Array(N * N).fill(-1), t: new Float32Array(N * N), n: new Float32Array(N * N * 3), p: new Float32Array(N * N * 3) };
  const cand = new Int32Array(n);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const sx = px + 0.5, sy = py + 0.5;
    let nc = 0, t0 = 1e9, t1 = -1e9;
    for (let i = 0; i < n; i++) {
      if (sx < rx0[i] || sx > rx1[i] || sy < ry0[i] || sy > ry1[i]) continue;
      cand[nc++] = i;
      t0 = Math.min(t0, tc[i] - tr[i]);
      t1 = Math.max(t1, tc[i] + tr[i]);
    }
    if (!nc) continue;
    const X = sx - cam.CX, Y0 = SN * (sy - cam.GY), Z0 = -CS * (sy - cam.GY);
    let t = t0, hit = false;
    for (let it = 0; it < 200; it++) {
      const d = sdScene(prims, gk, cand, nc, X, Y0 - CS * t, Z0 - SN * t);
      if (d < 0.01) { hit = true; break; }
      t += Math.max(d * 0.85, 0.01);
      if (t > t1) break;
    }
    if (!hit) continue;
    const y = Y0 - CS * t, z = Z0 - SN * t;
    sdScene(prims, gk, cand, nc, X, y, z);
    const best = lastBest;
    const e = 0.3;
    const f0 = sdScene(prims, gk, cand, nc, X + e, y - e, z - e);
    const f1 = sdScene(prims, gk, cand, nc, X - e, y - e, z + e);
    const f2 = sdScene(prims, gk, cand, nc, X - e, y + e, z - e);
    const f3 = sdScene(prims, gk, cand, nc, X + e, y + e, z + e);
    const nn = norm([f0 - f1 - f2 + f3, -f0 - f1 + f2 + f3, -f0 + f1 - f2 + f3]);
    const i = py * N + px;
    out.prim[i] = best;
    out.t[i] = t;
    out.n.set(nn, i * 3);
    out.p.set([X, y, z], i * 3);
  }
  return out;
}

function shadowAt(prims: Prim[], gk: number[], cand: Int32Array, p: V3, n: V3): boolean {
  const o = add(p, add(mul(n, 0.6), mul(LIGHT, 0.4)));
  let nc = 0;
  for (let i = 0; i < prims.length; i++) {
    const q = prims[i];
    const w = sub(q.bc, o);
    const s = clamp(dot(w, LIGHT), 0, 24);
    const d = vlen(sub(w, mul(LIGHT, s)));
    if (d < q.br + gk[q.g] + 0.3) cand[nc++] = i;
  }
  if (!nc) return false;
  let s = 0;
  for (let it = 0; it < 50; it++) {
    const d = sdScene(prims, gk, cand, nc, o[0] + LIGHT[0] * s, o[1] + LIGHT[1] * s, o[2] + LIGHT[2] * s);
    if (d < 0.04) return true;
    s += Math.max(d * 0.9, 0.08);
    if (s > 24) break;
  }
  return false;
}

/** Местные координаты точки на детали: u — доля вдоль оси, l — [вбок, вперёд, вдоль оси] (у эллипсоида и бруска — по ax). */
function texAt(q: Prim, p: V3): { u: number; l: V3 } {
  const pa = sub(p, q.a);
  if (q.k === 1 || q.k === 5) {
    const l: V3 = [dot(pa, q.ax[0]), dot(pa, q.ax[1]), dot(pa, q.ax[2])];
    return { u: l[2] / (q.r[2] || 1), l };
  }
  if (q.sph) return { u: 0, l: pa };
  const w = mul(q.ba, 1 / q.len);
  const ref = q.ref, bin = cross(w, ref);
  const l: V3 = [dot(pa, ref), dot(pa, bin), dot(pa, w)];
  return { u: l[2] / q.len, l };
}

export interface Look { mat: Int16Array; idx: Int8Array; part: Int32Array; lum: Float32Array; mats: Mat[] }

function shade(cam: Cam, view: View, prims: Prim[], gk: number[], gb: GBuf): Look {
  const N = cam.N, NN = N * N;
  const mats: Mat[] = [];
  const mi = new Map<Mat, number>();
  const idOf = (m: Mat) => {
    let v = mi.get(m);
    if (v === undefined) { v = mats.length; mats.push(m); mi.set(m, v); }
    return v;
  };
  const L: Look = { mat: new Int16Array(NN).fill(-1), idx: new Int8Array(NN).fill(-1), part: new Int32Array(NN).fill(-1), lum: new Float32Array(NN), mats };
  const tone = new Float32Array(NN);
  const deep = new Uint8Array(NN);
  const crisp = new Uint8Array(NN);
  const cand = new Int32Array(prims.length);
  const tl: { u: number; l: V3 }[] = new Array(NN);
  for (let i = 0; i < NN; i++) {
    const pi = gb.prim[i];
    if (pi < 0) continue;
    const q = prims[pi];
    const n: V3 = [gb.n[i * 3], gb.n[i * 3 + 1], gb.n[i * 3 + 2]];
    const p: V3 = [gb.p[i * 3], gb.p[i * 3 + 1], gb.p[i * 3 + 2]];
    const md = q.mat;
    tl[i] = texAt(q, p);
    const lum = dot(n, LIGHT);
    L.lum[i] = lum;
    let tn = md.base + md.gain * lum + q.tone;
    if (md.crisp) {
      crisp[i] = 1;
    } else {
      if (shadowAt(prims, gk, cand, p, n)) tn -= 1.0;
      let ao = 0;
      for (const hh of [0.9, 1.9]) {
        const ps = add(p, mul(n, hh));
        let nc = 0;
        for (let k = 0; k < prims.length; k++) {
          const qq = prims[k];
          if (vlen(sub(qq.bc, ps)) < qq.br + hh + gk[qq.g]) cand[nc++] = k;
        }
        const d = sdScene(prims, gk, cand, nc, ps[0], ps[1], ps[2]);
        ao += Math.max(0, hh - d) / hh;
      }
      tn -= ao * 0.45;
      deep[i] = ao > 1.3 ? 1 : 0;
    }
    tn = Math.min(tn, md.hi + 0.49);
    tn = Math.max(tn, (deep[i] ? md.lo - 1 : md.lo) - 0.4);
    tone[i] = tn;
    L.mat[i] = idOf(md);
    L.part[i] = q.part;
  }
  // сглаживание тона внутри детали
  {
    const src = new Float32Array(tone);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0 || crisp[i]) continue;
      let sum = src[i] * 4, w = 4;
      for (const [dx, dy, k] of [[1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2], [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const j = yy * N + xx;
        if (gb.prim[j] < 0 || L.part[j] !== L.part[i] || L.mat[j] !== L.mat[i] || crisp[j]) continue;
        sum += src[j] * k;
        w += k;
      }
      tone[i] = sum / w;
    }
  }
  const anc = prims.map((q) => scr(cam, q.anc).map(Math.floor) as [number, number]);
  const T2 = new Float32Array(tone);
  const bgAt = (x: number, y: number) => x < 0 || y < 0 || x >= N || y >= N || gb.prim[y * N + x] < 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0) continue;
    const q = prims[gb.prim[i]];
    let tn = tone[i];
    const edge = bgAt(x - 1, y) || bgAt(x + 1, y) || bgAt(x, y - 1) || bgAt(x, y + 1);
    let md = q.mat;
    if (q.tex) {
      const [ax, ay] = anc[gb.prim[i]];
      const r = q.tex({ l: tl[i].l, u: tl[i].u, x, y, ax, ay, lum: L.lum[i], edge, tone: tn, view });
      if (typeof r === "number") tn += r;
      else {
        md = r.mat;
        L.mat[i] = idOf(md);
        tn += r.d;
      }
    }
    if (!edge && !crisp[i]) {
      // шов: соседняя деталь ближе к зрителю — тон тени (selout); почти чёрный — только в глубокой щели
      let seam = 99;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * N + x + dx;
        const other = L.part[j] !== L.part[i];
        const dz = gb.t[i] - gb.t[j];
        if (other && (dz > 0.6 || (Math.abs(dz) <= 0.6 && L.part[i] < L.part[j]))) seam = Math.min(seam, 1.3);
        else if (!other && dz > 3.5) seam = Math.min(seam, 1.3);
      }
      tn = Math.min(tn, seam);
      if (deep[i]) tn = Math.min(tn, 0.6);
    }
    if (!crisp[i]) {
      let rimL = false;
      for (const [xx, yy] of [[x - 1, y], [x, y - 1]]) {
        if (bgAt(xx, yy)) { rimL = true; continue; }
        const j = yy * N + xx;
        if (L.part[j] !== L.part[i] && gb.t[j] > gb.t[i] + 1.2) rimL = true;
      }
      if (rimL && bigPrim(q) && L.lum[i] > 0.2 && tn > 1.2) tn = Math.max(tn, Math.min(tn + 1, 3.45));
    }
    if (edge && !crisp[i]) tn = Math.max(tn, md.lo - 0.4);
    T2[i] = Math.min(tn, md.hi + 0.49);
  }
  for (let i = 0; i < NN; i++) {
    if (gb.prim[i] < 0) continue;
    const md = mats[L.mat[i]];
    L.idx[i] = clamp(Math.round(T2[i]), 0, md.ramp.length - 1);
  }
  despeckle(cam, L, gb, crisp);
  return L;
}

/** Одиночный пиксель (ни одного соседа того же тона и материала) принимает тон большинства соседей. */
function despeckle(cam: Cam, L: Look, gb: GBuf, crisp: Uint8Array) {
  const N = cam.N;
  for (let pass = 0; pass < 2; pass++) {
    const src = new Int8Array(L.idx);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0 || crisp[i]) continue;
      const m = L.mat[i], v = src[i];
      let same = 0;
      const cnt = new Map<number, number>();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const j = i + dy * N + dx;
        if (gb.prim[j] < 0 || L.mat[j] !== m) continue;
        if (src[j] === v) same++;
        if (dx === 0 || dy === 0) cnt.set(src[j], (cnt.get(src[j]) ?? 0) + 1);
      }
      if (same > 0 || cnt.size === 0) continue;
      let bv = v, bc = -1;
      for (const [k, c] of cnt) if (c > bc || (c === bc && Math.abs(k - v) < Math.abs(bv - v))) { bv = k; bc = c; }
      L.idx[i] = bv;
    }
  }
}

/** Прозрачные «проколы» внутри силуэта (≤ 3 px): у тела — цветом контура, в собранном кадре — цветом большинства соседей. */
export function sealPinholes(c: PC, out: RGBA, byNeighbors = false, maxPx = 3) {
  const N = c.w, M = c.h;
  const A = (x: number, y: number) => c.alpha(x, y) >= 128;
  const comps = holeComponents(c);
  for (const comp of comps) {
    if (comp.length > maxPx) continue;
    for (const j of comp) {
      const x = j % N, y = (j / N) | 0;
      let col: RGBA = out;
      if (byNeighbors) {
        const cnt = new Map<string, [number, RGBA]>();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const q = c.get(x + dx, y + dy);
          if (!q || q[3] < 128) continue;
          const key = q.join(",");
          const e = cnt.get(key);
          cnt.set(key, [(e?.[0] ?? 0) + 1, q]);
        }
        let best = 0;
        for (const [n, q] of cnt.values()) if (n > best) { best = n; col = [q[0], q[1], q[2], 255]; }
      }
      c.set(x, y, col);
    }
  }
  void M;
  void A;
}
/** Замкнутые прозрачные области внутри силуэта (не связанные с краем кадра). */
export function holeComponents(c: PC): number[][] {
  const N = c.w, M = c.h;
  const A = (x: number, y: number) => c.alpha(x, y) >= 128;
  const seen = new Uint8Array(N * M);
  const stack: number[] = [];
  for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
    if ((x === 0 || y === 0 || x === N - 1 || y === M - 1) && !A(x, y)) { seen[y * N + x] = 1; stack.push(y * N + x); }
  }
  const flood = (st: number[], comp?: number[]) => {
    while (st.length) {
      const i = st.pop()!;
      comp?.push(i);
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= M) continue;
        const j = yy * N + xx;
        if (seen[j] || A(xx, yy)) continue;
        seen[j] = 1;
        st.push(j);
      }
    }
  };
  flood(stack);
  const comps: number[][] = [];
  for (let i = 0; i < N * M; i++) {
    if (seen[i] || A(i % N, (i / N) | 0)) continue;
    seen[i] = 1;
    const comp: number[] = [];
    flood([i], comp);
    comps.push(comp);
  }
  return comps;
}

/**
 * Полосы в 1 px (контур с двух сторон, длина ≥ 3: древко ребром, край щита из-за тела) — дорисовать второй ряд тоном тени
 * справа или снизу и снова обвести: линия становится деталью в 2 px с контуром.
 */
/**
 * Контур 1 px по силуэту; узкие щели (до gaps px между двумя частями по горизонтали или вертикали) остаются
 * прозрачными — в них виден фон (просветы между рёбрами, руками и телом, ногами).
 */
export function outlineGaps(c: PC, out: RGBA, gaps: number) {
  if (gaps <= 0) { c.outline(out); return; }
  const N = c.w, M = c.h;
  const A = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < M && c.alpha(x, y) > 120;
  const keep = new Uint8Array(N * M);
  for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
    if (A(x, y)) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      let a = 0, b = 0;
      for (let k = 1; k <= gaps; k++) if (A(x - dx * k, y - dy * k)) { a = k; break; }
      for (let k = 1; k <= gaps; k++) if (A(x + dx * k, y + dy * k)) { b = k; break; }
      if (a && b && a + b - 1 <= gaps) keep[y * N + x] = 1;
    }
  }
  const src = new Uint8ClampedArray(c.data);
  c.outline(out);
  for (let i = 0; i < N * M; i++) if (keep[i]) c.data.set(src.subarray(i * 4, i * 4 + 4), i * 4);
}
export function thicken(c: PC, out: RGBA, minLen = 3, skip: RGBA[] = [], gaps = 0) {
  const sk = new Set(skip.map((q) => q.slice(0, 3).join(",")));
  const N = c.w, M = c.h;
  const isOut = (x: number, y: number) => {
    const q = c.get(x, y);
    return !q || q[3] < 128 || (q[0] === out[0] && q[1] === out[1] && q[2] === out[2]);
  };
  const v = new Uint8Array(N * M), h = new Uint8Array(N * M);
  for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
    if (isOut(x, y) || sk.has(c.get(x, y)!.slice(0, 3).join(","))) continue;
    if (isOut(x - 1, y) && isOut(x + 1, y)) v[y * N + x] = 1;
    if (isOut(x, y - 1) && isOut(x, y + 1)) h[y * N + x] = 1;
  }
  const put: [number, number, RGBA][] = [];
  const dark = (q: RGBA): RGBA => mix(q, [out[0], out[1], out[2], 255], 0.3);
  for (let x = 0; x < N; x++) for (let y = 0; y < M; ) {
    let e = y;
    while (e < M && v[e * N + x]) e++;
    if (e - y >= minLen) {
      const dx = x + 2 < N ? 1 : -1;
      for (let k = y; k < e; k++) put.push([x + dx, k, dark(c.get(x, k)!)]);
    }
    y = e > y ? e : y + 1;
  }
  for (let y = 0; y < M; y++) for (let x = 0; x < N; ) {
    let e = x;
    while (e < N && h[y * N + e]) e++;
    if (e - x >= minLen) {
      const dy = y + 2 < M ? 1 : -1;
      for (let k = x; k < e; k++) put.push([k, y + dy, dark(c.get(k, y)!)]);
    }
    x = e > x ? e : x + 1;
  }
  if (!put.length) return;
  for (const [x, y, q] of put) c.data.set([q[0], q[1], q[2], 255], (y * N + x) * 4);
  // новые пиксели обвести (контур не стирает уже нарисованное)
  outlineGaps(c, out, gaps);
}

export interface Rendered { body: PC; emis: PC; gb: GBuf; prims: Prim[]; L: Look }

/** Сцена → кадр: луч на пиксель, тоны, штампы, контур. emis — маска светящегося (ночью не гаснет). */
export interface RenderOpt { thinOk?: RGBA[]; gaps?: number }
export function renderScene(cam: Cam, sc: Scene, view: View, outCol: RGBA, opt: RenderOpt = {}): Rendered {
  const N = cam.N;
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) prepare(q, view);
  const gb = raster(cam, prims, sc.gk);
  const L = shade(cam, view, prims, sc.gk, gb);
  const body = new PC(N, N);
  const emis = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    const m = L.mats[L.mat[i]];
    const c = m.ramp[L.idx[i]];
    body.set(i % N, Math.floor(i / N), c);
    if (m.glow) emis.set(i % N, Math.floor(i / N), c);
  }
  drawStamps(cam, body, emis, sc, view, gb);
  outlineGaps(body, outCol, opt.gaps ?? 0);
  thicken(body, outCol, 3, opt.thinOk ?? [], opt.gaps ?? 0);
  sealPinholes(body, outCol, false, opt.gaps ? 1 : 8);
  return { body, emis, gb, prims, L };
}

function drawStamps(cam: Cam, body: PC, emis: PC, sc: Scene, view: View, gb: GBuf) {
  const N = cam.N;
  const glow = new Float32Array(N * N);
  const haloCol = new Array<RGBA | undefined>(N * N);
  const mark = new Uint8Array(N * N);
  for (const st of sc.stamps) {
    const pxs = st.px[view];
    if (!pxs) continue;
    const a = toView(view, st.at), nv = toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < (st.minFacing ?? 0.12)) continue;
    const [sx, sy] = scr(cam, a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    if (!st.overBg && (gb.prim[i0] < 0 || gb.t[i0] < depthOf(a) - (st.depthTol ?? 1.6))) continue;
    for (const [dx, dy, key] of pxs) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (gb.prim[i] < 0 && !st.overBg) continue;
      const col = st.colors[key];
      if (!col) continue;
      body.set(x, y, col);
      mark[i] = 1;
      if (st.glow?.includes(key)) {
        emis.set(x, y, col);
        glow[i] = 1;
        haloCol[i] = st.halo;
      }
    }
  }
  // ореол вокруг светящихся точек: ступенями, только по телу
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0 || mark[i]) continue;
    let v = 0;
    let hc: RGBA | undefined;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const j = yy * N + xx;
      if (glow[j]) { v += dx === 0 || dy === 0 ? 1 : 0.6; hc = haloCol[j] ?? hc; }
    }
    if (v < 0.6 || !hc) continue;
    const c = body.get(x, y)!;
    const k = v >= 1.6 ? 0.32 : 0.18;
    const m = mix(c, [hc[0], hc[1], hc[2], 255], k);
    body.set(x, y, m);
    emis.set(x, y, m);
  }
}

// ---------------- оружие как слой ----------------
/** Хват: точка в руке, направление к острию (навершию), «плашмя» — нормаль к плоскости клинка/щита. */
export interface Grip { at: V3; dir: V3; flat: V3 }
export type WeaponFn = (S: Scene, grip: Grip, o: { elite: boolean; k: number; piece: number }) => void;

// ---------------- проверки ----------------
/** Края кадра касается только цвет контура. */
export function frameEdgeCuts(sheet: PC, N: number, out: RGBA, name: string, rows: string[]): string[] {
  const bad: string[] = [];
  for (let r = 0; r < sheet.h / N; r++) for (let c = 0; c < sheet.w / N; c++) {
    const hits = new Set<string>();
    for (let k = 0; k < N; k++) for (const [x, y] of [[k, 0], [k, N - 1], [0, k], [N - 1, k]]) {
      const q = sheet.get(c * N + x, r * N + y)!;
      if (q[3] && (q[0] !== out[0] || q[1] !== out[1] || q[2] !== out[2])) hits.add(`${x},${y}`);
    }
    if (hits.size) bad.push(`${name}, ${rows[r] ?? `строка ${r}`}, кадр ${c + 1}: ${hits.size} px не цветом контура на краю`);
  }
  return bad;
}
/**
 * Дыры: мелкие (≤ maxPx) замкнутые прозрачные области внутри силуэта — прокол, а не задуманный просвет (между рукой
 * и телом, луком и тетивой просвет крупнее и допустим).
 */
export function frameHoles(sheet: PC, N: number, name: string, rows: string[], maxPx = 8): string[] {
  const bad: string[] = [];
  for (let r = 0; r < sheet.h / N; r++) for (let c = 0; c < sheet.w / N; c++) {
    const f = crop(sheet, c * N, r * N, N, N);
    const h = holeComponents(f).filter((q) => q.length <= maxPx);
    if (h.length) bad.push(`${name}, ${rows[r] ?? `строка ${r}`}, кадр ${c + 1}: ${h.length} дыр(ы) (${h.map((x) => x.length).join(",")} px)`);
  }
  return bad;
}
/**
 * Однопиксельные линии: непрерывная полоса шириной 1 px (не контур) с контуром или пустотой с обеих сторон — по
 * горизонтали или вертикали, длиной ≥ minLen. exempt — цвета, которым можно (тетива).
 */
export function thinLines(sheet: PC, N: number, out: RGBA, name: string, rows: string[], minLen = 3, exempt: RGBA[] = []): string[] {
  const bad: string[] = [];
  const isOut = (q: RGBA | null) => !q || q[3] < 128 || (q[0] === out[0] && q[1] === out[1] && q[2] === out[2]);
  const ex = new Set(exempt.map((c) => c.slice(0, 3).join(",")));
  for (let r = 0; r < sheet.h / N; r++) for (let c = 0; c < sheet.w / N; c++) {
    const thin = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const q = sheet.get(c * N + x, r * N + y)!;
      if (isOut(q) || ex.has(q.slice(0, 3).join(","))) continue;
      const g = (dx: number, dy: number) => (x + dx < 0 || y + dy < 0 || x + dx >= N || y + dy >= N ? null : sheet.get(c * N + x + dx, r * N + y + dy));
      const h = isOut(g(-1, 0)) && isOut(g(1, 0));
      const v = isOut(g(0, -1)) && isOut(g(0, 1));
      if (h || v) thin[y * N + x] = h && v ? 3 : h ? 1 : 2;
    }
    // вертикальная полоса: подряд по y пиксели с пустотой слева и справа; горизонтальная — наоборот; диагональ — шагом по 1
    let worst = 0, at = "";
    for (let x = 0; x < N; x++) {
      let run = 0;
      for (let y = 0; y < N; y++) { run = thin[y * N + x] & 1 ? run + 1 : 0; if (run > worst) { worst = run; at = `${x},${y}`; } }
    }
    for (let y = 0; y < N; y++) {
      let run = 0;
      for (let x = 0; x < N; x++) { run = thin[y * N + x] & 2 ? run + 1 : 0; if (run > worst) { worst = run; at = `${x},${y}`; } }
    }
    if (worst >= minLen) bad.push(`${name}, ${rows[r] ?? `строка ${r}`}, кадр ${c + 1}: линия в 1 px длиной ${worst} (до ${at})`);
  }
  return bad;
}

// ---------------- монтаж ----------------
export function loadPC(file: string): PC {
  const png = PNG.sync.read(fs.readFileSync(file));
  const c = new PC(png.width, png.height);
  c.data.set(png.data);
  return c;
}
export function crop(src: PC, x: number, y: number, w: number, h: number): PC {
  const o = new PC(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = src.get(x + i, y + j);
    if (c && c[3]) o.data.set(c, (j * w + i) * 4);
  }
  return o;
}
export function scaleNN(src: PC, k: number, flip = false): PC {
  const o = new PC(src.w * k, src.h * k);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const sx = Math.floor(x / k);
    const c = src.get(flip ? src.w - 1 - sx : sx, Math.floor(y / k))!;
    if (c[3]) o.data.set(c, (y * o.w + x) * 4);
  }
  return o;
}
export function scaleBox(src: PC, w: number, h: number): PC {
  const o = new PC(w, h);
  const kx = src.w / w, ky = src.h / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let j = Math.floor(y * ky); j < Math.max(Math.floor(y * ky) + 1, Math.floor((y + 1) * ky)); j++)
      for (let i = Math.floor(x * kx); i < Math.max(Math.floor(x * kx) + 1, Math.floor((x + 1) * kx)); i++) {
        const c = src.get(Math.min(src.w - 1, i), Math.min(src.h - 1, j))!;
        r += c[0]; g += c[1]; b += c[2]; a += c[3]; n++;
      }
    o.data.set([r / n, g / n, b / n, a / n], (y * w + x) * 4);
  }
  return o;
}
export function fill(c: PC, x: number, y: number, w: number, h: number, col: RGBA) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (c.inside(i, j)) c.data.set(col, (j * c.w + i) * 4);
}
/** Строки атласа tiles/terrain.png: трава и земля. */
export const GROUND_ROW = { grass: 6, dirt: 5 } as const;
export type Ground = keyof typeof GROUND_ROW;
export function groundBg(c: PC, terrain: PC, x0: number, y0: number, w: number, h: number, k: number, g: Ground = "grass") {
  const T = 32;
  for (let ty = 0; ty * T * k < h; ty++) for (let tx = 0; tx * T * k < w; tx++) {
    const v = Math.floor(hash01(tx, ty, 41) * 4);
    const big = scaleNN(crop(terrain, (14 + v) * T, GROUND_ROW[g] * T, T, T), k);
    for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) {
      const X = x0 + tx * T * k + x, Y = y0 + ty * T * k + y;
      if (X >= x0 + w || Y >= y0 + h) continue;
      if (c.inside(X, Y)) c.data.set(big.get(x, y)!, (Y * c.w + X) * 4);
    }
  }
}
export function shadowBlob(c: PC, cx: number, cy: number, rx: number, ry: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d < 1) c.set(x, y, [10, 20, 8, Math.round(90 * (1 - d * d))]);
  }
}
/** Ночь в области: затемнение с синевой; пиксели маски emis (светящееся) возвращаются как днём. */
export const NIGHT: [number, number, number] = [0.3, 0.36, 0.6];
export function nightRect(c: PC, x0: number, y0: number, w: number, h: number) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!c.inside(x, y)) continue;
    const i = (y * c.w + x) * 4;
    for (let k = 0; k < 3; k++) c.data[i + k] = c.data[i + k] * NIGHT[k];
  }
}

// подписи: моноширинный пиксельный шрифт 5×7 (кириллица, цифры) — как у боссов
const FONT: Record<string, string[]> = {
  "А": [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  "Б": ["#####", "#    ", "#    ", "#### ", "#   #", "#   #", "#### "],
  "В": ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  "Г": ["#####", "#    ", "#    ", "#    ", "#    ", "#    ", "#    "],
  "Д": ["  ## ", " #  #", " #  #", " #  #", " #  #", "#####", "#   #"],
  "Е": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  "Ё": [" # # ", "     ", "#####", "#    ", "#### ", "#    ", "#####"],
  "Ж": ["# # #", "# # #", " ### ", "  #  ", " ### ", "# # #", "# # #"],
  "З": [" ### ", "#   #", "    #", "  ## ", "    #", "#   #", " ### "],
  "И": ["#   #", "#   #", "#  ##", "# # #", "##  #", "#   #", "#   #"],
  "Й": ["  #  ", "#   #", "#  ##", "# # #", "##  #", "#   #", "#   #"],
  "К": ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  "Л": ["  ###", " #  #", " #  #", " #  #", " #  #", " #  #", "#   #"],
  "М": ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  "Н": ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  "О": [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  "П": ["#####", "#   #", "#   #", "#   #", "#   #", "#   #", "#   #"],
  "Р": ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  "С": [" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "],
  "Т": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  "У": ["#   #", "#   #", "#   #", " ####", "    #", "#   #", " ### "],
  "Ф": ["  #  ", " ### ", "# # #", "# # #", " ### ", "  #  ", "  #  "],
  "Х": ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  "Ц": ["#  # ", "#  # ", "#  # ", "#  # ", "#  # ", "#####", "    #"],
  "Ч": ["#   #", "#   #", "#   #", " ####", "    #", "    #", "    #"],
  "Ш": ["#   #", "#   #", "# # #", "# # #", "# # #", "# # #", "#####"],
  "Щ": ["# #  ", "# #  ", "# #  ", "# #  ", "# #  ", "#####", "    #"],
  "Ъ": ["##   ", " #   ", " #   ", " ### ", " #  #", " #  #", " ### "],
  "Ы": ["#   #", "#   #", "#   #", "### #", "#  ##", "#  ##", "### #"],
  "Ь": ["#    ", "#    ", "#    ", "#### ", "#   #", "#   #", "#### "],
  "Э": [" ### ", "#   #", "    #", "  ###", "    #", "#   #", " ### "],
  "Ю": ["#  # ", "# # #", "# # #", "### #", "# # #", "# # #", "#  # "],
  "Я": [" ####", "#   #", "#   #", " ####", "  # #", " #  #", "#   #"],
  "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],
  "×": ["     ", "#   #", " # # ", "  #  ", " # # ", "#   #", "     "],
  "|": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
  "·": ["     ", "     ", "     ", "  #  ", "     ", "     ", "     "],
  ":": ["     ", "  #  ", "     ", "     ", "     ", "  #  ", "     "],
  "-": ["     ", "     ", "     ", " ### ", "     ", "     ", "     "],
  "—": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  ",": ["     ", "     ", "     ", "     ", "     ", "  #  ", " #   "],
  "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
  "→": ["     ", "  #  ", "   # ", "#####", "   # ", "  #  ", "     "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
};
export function text(c: PC, s: string, x: number, y: number, k = 2, col: RGBA = [240, 232, 214, 255]) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT[" "];
    for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {
      if (g[j][i] !== "#") continue;
      fill(c, cx + i * k + k, y + j * k + k, k, k, [16, 12, 10, 200]);
      fill(c, cx + i * k, y + j * k, k, k, col);
    }
    cx += 6 * k;
  }
}
export type Row = { h: number; draw: (c: PC, y: number) => void };
export function stackRows(rows: Row[], W: number): PC {
  const H = rows.reduce((s, r) => s + r.h + 12, 12);
  const c = new PC(W, H);
  fill(c, 0, 0, W, H, [24, 20, 26, 255]);
  let y = 12;
  for (const r of rows) {
    r.draw(c, y);
    y += r.h + 12;
  }
  return c;
}
export function pngDataUrl(c: PC): string {
  const p = new PNG({ width: c.w, height: c.h });
  Buffer.from(c.data.buffer).copy(p.data);
  return "data:image/png;base64," + PNG.sync.write(p).toString("base64");
}
export function saveTo(dir: string, files: string[]) {
  return (c: PC, name: string) => {
    const f = path.join(dir, name);
    c.save(f);
    files.push(f);
    return c;
  };
}
export { PC, hex, mix, hash01 };
export type { RGBA, Ramp };
