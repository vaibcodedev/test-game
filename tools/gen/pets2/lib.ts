/**
 * Питомцы, проход 4 (пилот): 2D-штампы по скелету, как у боссов кольца (tools/gen/bosses139), но с тоном вместо цвета.
 * Каждая часть — маска в сетке 2× (координаты задаются в 1×), её объём — поле тона (свет сверху-слева, купол по расстоянию до края,
 * тёмная кромка на теневой стороне, рефлекс снизу). Кадр сводится в 1×: часть — по большинству 2×2, тон — среднее.
 * В 1× уже по чистым пикселям: пряди шерсти клиньями (светлая грань к свету, тёмная складка), разделение частей (задняя часть
 * темнеет у края передней), штампы (глаза, нос, когти), квантование в рампу 5–6 тонов, контур 1 px тёмным тоном материала.
 */
import { Cv, Mk, hash, hx, type C } from "../bosses139/mino_lib";
export { Cv, Mk, hash, hx, type C };

export type V2 = [number, number];
export const Z = 2;
export const R = (...s: string[]): C[] => s.map(hx);
export const PI = Math.PI, SIN = Math.sin, COS = Math.cos;
export const add = (a: V2, b: V2, k = 1): V2 => [a[0] + b[0] * k, a[1] + b[1] * k];
export const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
export const lerp = (a: V2, b: V2, u: number): V2 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
export const nrm = (v: V2): V2 => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
export const perp = (v: V2): V2 => [-v[1], v[0]];
export const rot = (p: V2, c: V2, a: number): V2 => { const x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * COS(a) - y * SIN(a), c[1] + x * SIN(a) + y * COS(a)]; };
export const dir = (a: number): V2 => [COS(a), SIN(a)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export function ik2(s: V2, f: V2, l1: number, l2: number, pole: V2): V2 {
  let dx = f[0] - s[0], dy = f[1] - s[1], d = Math.hypot(dx, dy) || 0.01;
  const mx = l1 + l2 - 0.05;
  if (d > mx) { f = [s[0] + (dx * mx) / d, s[1] + (dy * mx) / d]; dx = f[0] - s[0]; dy = f[1] - s[1]; d = mx; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  let px = -uy, py = ux; if (px * pole[0] + py * pole[1] < 0) { px = -px; py = -py; }
  return [s[0] + ux * a + px * h, s[1] + uy * a + py * h];
}

/** Маска в 2×, координаты — 1× (как в кадре). */
export class Sh extends Mk {
  constructor(n: number) { super(n * Z, n * Z); }
  private fillB(x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean) {
    const a = Math.max(0, Math.floor(x0)), b = Math.min(this.w - 1, Math.ceil(x1)), c = Math.max(0, Math.floor(y0)), d = Math.min(this.h - 1, Math.ceil(y1));
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (inside(x + 0.5, y + 0.5)) this.set(x, y);
  }
  /** отрезок с толщиной t0→t1 (круглые концы) */
  L(a: V2, b: V2, t0: number, t1 = t0) { this.line(a[0] * Z, a[1] * Z, b[0] * Z, b[1] * Z, t0 * Z, t1 * Z); return this; }
  D(p: V2, r: number) { this.disc(p[0] * Z, p[1] * Z, r * Z); return this; }
  P(pts: V2[]) {
    const q = pts.map(([x, y]) => [x * Z, y * Z] as V2), xs = q.map((v) => v[0]), ys = q.map((v) => v[1]);
    this.fillB(Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1, (x, y) => {
      let ins = false;
      for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, yi] = q[i], [xj, yj] = q[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; }
      return ins;
    });
    return this;
  }
  /** эллипс с поворотом a */
  E(c: V2, rx: number, ry: number, a = 0) {
    const cx = c[0] * Z, cy = c[1] * Z, ax = rx * Z, ay = ry * Z, r = Math.max(ax, ay), cs = COS(a), sn = SIN(a);
    this.fillB(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => { const dx = x - cx, dy = y - cy, u = (dx * cs + dy * sn) / ax, v = (-dx * sn + dy * cs) / ay; return u * u + v * v <= 1; });
    return this;
  }
  /** перо/клин: от основания a к концу b, ширина w0→w1, кончик скруглён */
  F(a: V2, b: V2, w0: number, w1: number) { return this.L(a, b, w0, w1); }
  and(o: Mk) { for (let i = 0; i < this.d.length; i++) if (!o.d[i]) this.d[i] = 0; return this; }
  cut(o: Mk) { for (let i = 0; i < this.d.length; i++) if (o.d[i]) this.d[i] = 0; return this; }
  or(o: Mk) { for (let i = 0; i < this.d.length; i++) if (o.d[i]) this.d[i] = 1; return this; }
  /** Пучки шерсти по краю: где нормаль края смотрит по потоку flow, наружу торчат клинья длиной len (1×). */
  tufts(flow: V2, len: number, seed: number, step = 2.2, minDot = 0.25) {
    const f = nrm(flow), dd = this.dist(), W = this.w, add2: [V2, V2, number][] = [];
    const g = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= this.h ? 0 : dd[y * W + x]);
    let acc = 0;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < W; x++) {
      if (dd[y * W + x] !== 1) continue;
      const gx = g(x + 1, y) - g(x - 1, y), gy = g(x, y + 1) - g(x, y - 1), l = Math.hypot(gx, gy) || 1;
      const n: V2 = [-gx / l, -gy / l];
      if (n[0] * f[0] + n[1] * f[1] < minDot) continue;
      acc += 1;
      if (hash(x * 0.37 + seed, y * 0.51) * step * Z * 1.6 > 1.0 || acc < step * Z) continue;
      acc = 0;
      const L = len * (0.55 + 0.6 * hash(x + seed * 3, y)) * Z, d2 = nrm(add(n, f, 1.6));
      add2.push([[x, y], [x + d2[0] * L, y + d2[1] * L], 1.7 * Z * (0.8 + 0.4 * hash(y, x + seed))]);
    }
    for (const [a, b, w] of add2) this.line(a[0], a[1], b[0], b[1], w, 0.6);
    return this;
  }
}
export const sh = (n: number) => new Sh(n);

export interface Fur { flow: V2; len?: number; k?: number; gx?: number; gy?: number; seed?: number }
export interface PO {
  amp?: number; dome?: number; bias?: number; grp?: string; occ?: number; reflex?: number; rim?: number;
  glow?: boolean; fur?: Fur; scales?: { k: number; s: number }; light?: V2; flat?: boolean;
  /** взять объём уже нарисованного под маской (другой материал на той же форме) */
  inherit?: boolean;
}
interface Part { ramp: C[]; o: PO }
const LIGHT: V2 = [-0.6, -0.8];

/** Кадр: части в 2× → 1×. */
export class Frame2 {
  W: number; pid: Int16Array; tone: Float32Array; parts: Part[] = [];
  stamps: { x: number; y: number; z: number; col: C; glow: boolean; halo?: C }[] = [];
  halos: { x: number; y: number; col: C }[] = [];
  constructor(public N: number) { this.W = N * Z; this.pid = new Int16Array(this.W * this.W).fill(-1); this.tone = new Float32Array(this.W * this.W); }

  /** часть: маска + рампа (0 тёмный … n-1 светлый) */
  add(m: Mk, ramp: C[], o: PO = {}): number {
    const id = this.parts.length; this.parts.push({ ramp, o });
    const d = m.dist(), n = ramp.length - 1, W = this.W;
    const amp = o.amp ?? 1.5, dome = (o.dome ?? 3) * Z, bias = o.bias ?? 0, L = o.light ?? LIGHT;
    const g = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? 0 : d[y * W + x]);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const v = d[y * W + x]; if (!v) continue;
      const gx = g(x + 1, y) - g(x - 1, y), gy = g(x, y + 1) - g(x, y - 1), len = Math.hypot(gx, gy) || 1;
      const lit = (-gx / len) * L[0] + (-gy / len) * L[1];
      const h = Math.min(v, dome) / dome;
      let t = o.flat ? n / 2 + bias : n / 2 + bias + lit * amp * (1 - 0.5 * h) + (h - 0.5) * 1.0;
      if (!o.flat) {
        if (v <= 2 && lit < 0.15) t -= 0.8;
        else if (v <= 2 && lit > 0.55) t += o.rim ?? 0.35;
        if (v >= 3 && v <= 5 && lit < -0.45) t += o.reflex ?? 0.55;
      }
      if (o.inherit && this.pid[y * W + x] >= 0) t = this.tone[y * W + x] * (n / (this.parts[this.pid[y * W + x]].ramp.length - 1)) + bias;
      this.pid[y * W + x] = id; this.tone[y * W + x] = t;
    }
    return id;
  }
  /** пиксель 1× поверх всего, что нарисовано до сих пор (позже нарисованные части перекроют) */
  px(p: V2, col: C, glow = false) { this.stamps.push({ x: Math.floor(p[0]), y: Math.floor(p[1]), z: this.parts.length - 1, col, glow }); }
  pxs(p: V2, pts: [number, number, C][], glow = false) { for (const [dx, dy, col] of pts) this.px([p[0] + dx, p[1] + dy], col, glow); }
  /** ореол (только в листе свечения) */
  halo(p: V2, col: C) { this.halos.push({ x: Math.floor(p[0]), y: Math.floor(p[1]), col }); }

  resolve(): { img: Cv; emis: Cv; pid: Int16Array } {
    const N = this.N, W = this.W, P = this.parts;
    const pid = new Int16Array(N * N).fill(-1), tone = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cnt = new Map<number, number>();
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const q = this.pid[(y * 2 + j) * W + x * 2 + i]; if (q >= 0) cnt.set(q, (cnt.get(q) ?? 0) + 1); }
      let tot = 0, best = -1, bn = 0;
      for (const [q, c] of cnt) { tot += c; if (c > bn || (c === bn && q > best)) { best = q; bn = c; } }
      if (tot < 2) continue;
      let s = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const k = (y * 2 + j) * W + x * 2 + i; if (this.pid[k] === best) s += this.tone[k]; }
      pid[y * N + x] = best; tone[y * N + x] = s / bn;
    }
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : pid[y * N + x]);
    const grp = (q: number) => P[q].o.grp ?? `#${q}`;
    // разделение: задняя часть темнеет у края передней (кроме своей группы)
    const t2 = Float32Array.from(tone);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const q = pid[y * N + x]; if (q < 0 || P[q].o.glow) continue;
      let hit = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = at(x + dx, y + dy); if (r > q && grp(r) !== grp(q) && !P[r].o.glow) hit = true; }
      if (hit) t2[y * N + x] -= P[q].o.occ ?? 1.1;
    }
    // пряди шерсти клиньями
    const own = (q: number, x: number, y: number) => at(x, y) === q;
    for (let q = 0; q < P.length; q++) {
      const f = P[q].o.fur; if (!f) continue;
      const fl = nrm(f.flow), pp0 = perp(fl), lightSide: V2 = pp0[0] * LIGHT[0] + pp0[1] * LIGHT[1] > 0 ? pp0 : [-pp0[0], -pp0[1]];
      const darkSide: V2 = [-lightSide[0], -lightSide[1]];
      const gx = f.gx ?? 3, gy = f.gy ?? 3, Lm = f.len ?? 3, k = f.k ?? 0.9, seed = f.seed ?? q * 7;
      for (let yy = -gy; yy < N + gy; yy += gy) for (let xx = -gx; xx < N + gx; xx += gx) {
        const row = Math.round(yy / gy);
        const sx = Math.round(xx + (row & 1 ? gx / 2 : 0) + (hash(xx + seed, yy) - 0.5) * 1.4), sy = Math.round(yy + (hash(yy + seed, xx) - 0.5) * 1.2);
        if (!own(q, sx, sy)) continue;
        const L = Math.max(2, Math.round(Lm * (0.7 + 0.6 * hash(sx * 1.3 + seed, sy * 0.7))));
        for (let i = 0; i < L; i++) {
          const c = add([sx, sy], fl, i), w = (1 - i / L) * 1.2;
          const cx = Math.round(c[0]), cy = Math.round(c[1]);
          const hl: V2 = [Math.round(c[0] + lightSide[0] * w), Math.round(c[1] + lightSide[1] * w)];
          const dk: V2 = [Math.round(c[0] + darkSide[0] * (w + 1)), Math.round(c[1] + darkSide[1] * (w + 1))];
          const nn = P[q].ramp.length - 1;
          if (own(q, hl[0], hl[1])) { const t0 = tone[hl[1] * N + hl[0]]; t2[hl[1] * N + hl[0]] += k * 0.85 * (1 - i / L) * clamp((t0 - nn * 0.25) / (nn * 0.35), 0, 1); }
          if (own(q, cx, cy) && i > 0) t2[cy * N + cx] += k * 0.3;
          if (own(q, dk[0], dk[1])) t2[dk[1] * N + dk[0]] -= k * (i === L - 1 ? 0.6 : 1);
        }
      }
    }
    // чешуя/перья рядами (scales): тёмная нижняя кромка каждой пластины
    for (let q = 0; q < P.length; q++) {
      const s = P[q].o.scales; if (!s) continue;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (pid[y * N + x] !== q) continue;
        const row = Math.floor(y / s.s), off = row & 1 ? s.s / 2 : 0, u = ((x + off) % s.s) / s.s, v = (y % s.s) / s.s;
        const edge = v > 1 - 1 / s.s || (u < 1 / s.s && v > 0.4);
        if (edge) t2[y * N + x] -= s.k; else if (v < 1 / s.s + 0.01) t2[y * N + x] += s.k * 0.5;
      }
    }
    const img = new Cv(N, N), emis = new Cv(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const q = pid[y * N + x]; if (q < 0) continue;
      const r = P[q].ramp, i = clamp(Math.round(t2[y * N + x]), 0, r.length - 1);
      img.set(x, y, r[i]); if (P[q].o.glow) emis.set(x, y, r[i]);
    }
    const sp = Int16Array.from(pid);
    for (const s of this.stamps) {
      if (s.x < 0 || s.y < 0 || s.x >= N || s.y >= N) continue;
      const q = pid[s.y * N + s.x];
      if (q > s.z) continue;
      img.set(s.x, s.y, s.col); if (s.glow) emis.set(s.x, s.y, s.col);
      if (q < 0) sp[s.y * N + s.x] = s.z >= 0 ? s.z : 0;
    }
    for (const h of this.halos) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = h.x + dx, y = h.y + dy; if (x >= 0 && y >= 0 && x < N && y < N && !emis.has(x, y)) emis.set(x, y, h.col); }
    // контур: тёмный тон материала соседа
    const add2: [number, number, C][] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (img.has(x, y)) continue;
      let best: C | null = null, bl = 1e9;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const xx = x + dx, yy = y + dy; if (!img.has(xx, yy)) continue;
        const q = sp[yy * N + xx]; const col = q >= 0 ? outl(P[q].ramp) : outl([img.get(xx, yy)]);
        const l = col[0] + col[1] + col[2]; if (l < bl) { bl = l; best = col; }
      }
      if (best) add2.push([x, y, best]);
    }
    for (const [x, y, c] of add2) img.set(x, y, c);
    return { img, emis, pid };
  }
}
/** тон контура: самый тёмный тон рампы, ещё темнее, но не чёрный */
export const outl = (r: C[]): C => { const c = r[0]; return [Math.round(c[0] * 0.7 + 3), Math.round(c[1] * 0.7 + 2), Math.round(c[2] * 0.7 + 4)]; };

export const shiftCv = (c: Cv, dx: number, dy = 0): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(x + dx, y + dy, c.get(x, y)); return o; };
export const flipCv = (c: Cv): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(c.w - 1 - x, y, c.get(x, y)); return o; };
/** лучи-штрихи (вспышка удара, след когтей) — пиксели 1× */
export function streak(f: Frame2, a: V2, b: V2, cols: C[], glow = false) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i <= n; i++) { const p = lerp(a, b, i / n); f.px(p, cols[Math.min(cols.length - 1, Math.floor((i / (n + 1)) * cols.length))], glow); }
}
