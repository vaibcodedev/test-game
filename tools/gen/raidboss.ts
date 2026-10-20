/**
 * Рейд-босс «Рогатый Рыцарь Хаоса» (задача 114): процедурный пиксель-арт.
 *
 * Лист units/chaos_knight.png: кадр 128×128, 24 столбца × 3 строки (вид: 0 вниз, 1 вверх, 2 вбок вправо; влево — отражение).
 * Столбцы по 4 кадра: 0–3 шаг, 4–7 удар мечом (Рассечение), 8–11 смерть, 12–15 удар в землю, 16–19 рёв на смене фазы, 20–23 стойка.
 * Ступни стоят на y = 120 (точка опоры 30/32 кадра, как у всех юнитов); рост корпуса ≈ 100 px (герой 26), рога выше.
 * Ореол за спиной — отдельная текстура fx/chaos_halo.png (160×160): движок рисует её под боссом (ADD) и вращает.
 *
 * Как устроено: скелет в 3D (X вправо от героя, Y вперёд, Z вверх), IK рук и ног, детали — выпуклые оболочки сечений,
 * проекция на три вида. Объём даёт поле расстояний (скос света сверху-слева), швы светятся и подсвечивают соседнюю сталь.
 */
import { PC, hash01, hex, rng, type RGBA, type Ramp } from "./canvas";

export const KNIGHT_FRAME = 128;
export const KNIGHT_COLS = 24;
/** Первый столбец каждой анимации (по 4 кадра). */
export const KNIGHT_ANIMS = { walk: 0, attack: 4, death: 8, slam: 12, roar: 16, idle: 20 } as const;
export type KnightAnim = keyof typeof KNIGHT_ANIMS;
export type KView = "down" | "up" | "side";
export const KNIGHT_VIEWS: KView[] = ["down", "up", "side"];
const N = KNIGHT_FRAME;

// ---------------- палитра ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
const STEEL = R("#0a060c", "#150f18", "#221a25", "#352b37", "#4d404c", "#7a6879");
const OBS = R("#06040a", "#0f0b15", "#19141f", "#272031", "#3c3248", "#675873");
const CLOTH = R("#0f0608", "#1b0b10", "#2b1319", "#401e27", "#582b33");
const HORN = R("#0d090b", "#181113", "#27191a", "#3b271f", "#58392a");
const LEATHER = R("#0d0707", "#1a0d0c", "#2b1713", "#43251d");
const SEAM = R("#4a0c04", "#9a1e06", "#e0540f", "#ff9a28", "#ffe070", "#fff8d8");
const DARK: RGBA = hex("#08040a");
const dimRamp = (r: Ramp, k: number): Ramp => r.map((c) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k), c[3]] as RGBA);
const STEEL_FAR = dimRamp(STEEL, 0.7);
const STEEL_LIMB = dimRamp(STEEL, 0.86);

// ---------------- математика ----------------
type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / (vlen(a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Две кости из A в B (длины l1, l2), локоть/колено в сторону pole. Недосягаемую цель звенья догоняют растяжением. */
function ik(a: V3, b: V3, l1: number, l2: number, pole: V3): V3 {
  const ab = sub(b, a);
  const d = vlen(ab);
  if (d < 1e-3) return a;
  const u = mul(ab, 1 / d);
  if (d >= l1 + l2 - 0.05) return add(a, mul(u, d * (l1 / (l1 + l2))));
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let q = sub(pole, mul(u, dot(pole, u)));
  const ql = vlen(q);
  q = ql < 1e-3 ? [0, 0, 1] : mul(q, 1 / ql);
  return add(a, add(mul(u, x), mul(q, h)));
}

const CX = 64, GY = 120, TILT = 0.12, STILT = 0.12;
/** Проекция: вниз — герой лицом к зрителю (его правая сторона слева на экране), вверх — спиной, вбок — лицом вправо. */
function proj(view: KView, p: V3): [number, number] {
  if (view === "down") return [CX - p[0], GY - p[2] + TILT * p[1]];
  if (view === "up") return [CX + p[0], GY - p[2] - TILT * p[1]];
  return [CX + p[1], GY - p[2] + STILT * p[0]];
}

function hull(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}
const ringPts = (cx: number, cy: number, z: number, rx: number, ry: number, n = 12): V3[] =>
  Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2), z] as V3);

// ---------------- маски и заливка ----------------
class Shape {
  m = new Uint8Array(N * N);
  x0 = N; y0 = N; x1 = -1; y1 = -1;
  put(x: number, y: number) {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    this.m[y * N + x] = 1;
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }
  has(x: number, y: number) {
    return x >= 0 && y >= 0 && x < N && y < N && this.m[y * N + x] === 1;
  }
  get empty() {
    return this.x1 < 0;
  }
  poly(pts: [number, number][]) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(N - 1, Math.ceil(maxY)); y++) {
      const sy = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x < Math.ceil(xs[k + 1] - 0.5); x++) this.put(x, y);
    }
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y);
      }
    return this;
  }
  capsule(ax: number, ay: number, bx: number, by: number, ra: number, rb = ra, tmap?: Float32Array, t0 = 0, t1 = 1) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const r = Math.max(ra, rb) + 1;
    for (let y = Math.floor(Math.min(ay, by) - r); y <= Math.max(ay, by) + r; y++)
      for (let x = Math.floor(Math.min(ax, bx) - r); x <= Math.max(ax, bx) + r; x++) {
        const t = clamp(((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / l2, 0, 1);
        const rr = ra + (rb - ra) * t;
        if (Math.hypot(x + 0.5 - (ax + dx * t), y + 0.5 - (ay + dy * t)) <= rr) {
          this.put(x, y);
          if (tmap && x >= 0 && y >= 0 && x < N && y < N) tmap[y * N + x] = t0 + (t1 - t0) * t;
        }
      }
    return this;
  }
  rect(x: number, y: number, w: number, h: number) {
    for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) this.put(i, j);
    return this;
  }
}

/** Контекст одного кадра: холст, карта свечения для подсветки соседней стали, мерцание швов. */
class G {
  c = new PC(N, N);
  emis = new Float32Array(N * N);
  constructor(public heat: number, public seed: number) {}
  mark(x: number, y: number, v: number) {
    if (x >= 0 && y >= 0 && x < N && y < N) this.emis[y * N + x] = Math.max(this.emis[y * N + x], v);
  }
  /** Цвет шва в точке: нагрев heat (0..1.4) с мерцанием по пикселям. */
  seam(x: number, y: number, heat = this.heat, boost = 0): RGBA {
    const f = hash01(x, y, this.seed);
    const i = clamp(Math.round((heat * (0.7 + 0.6 * f) + boost) * 5), 0, 5);
    this.mark(x, y, 0.35 + i * 0.13);
    return SEAM[i];
  }
  /** Светящаяся линия (только поверх уже нарисованного, если over). */
  line(x0: number, y0: number, x1: number, y1: number, heat = this.heat, over = true, boost = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= n; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / n), y = Math.round(y0 + ((y1 - y0) * s) / n);
      if (over && this.c.alpha(x, y) === 0) continue;
      this.c.set(x, y, this.seam(x, y, heat, boost));
    }
  }
  dot(x: number, y: number, col: RGBA, mark = 1) {
    x = Math.round(x);
    y = Math.round(y);
    this.c.set(x, y, col);
    this.mark(x, y, mark);
  }
}

interface ShadeOpts {
  bw?: number;
  flat?: number;
  gp?: number;
  gn?: number;
  tone?: (x: number, y: number) => number;
}
const LIGHT: V3 = norm([-0.5, -0.75, 0.55]);
/** Объёмная заливка маски: фаска у краёв по полю расстояний, свет сверху-слева. */
function shadeShape(c: PC, s: Shape, ramp: Ramp, o: ShadeOpts = {}) {
  if (s.empty) return;
  const bw = o.bw ?? 3, flat = o.flat ?? 2.15, gp = o.gp ?? 7.4, gn = o.gn ?? 1.35;
  const px0 = s.x0 - 2, py0 = s.y0 - 2, w = s.x1 - s.x0 + 5, h = s.y1 - s.y0 + 5;
  const d = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = s.has(px0 + x, py0 + y) ? 999 : 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (d[i]) d[i] = Math.min(d[i], d[i - 1] + 1, d[i - w] + 1, d[i - w - 1] + 1.414, d[i - w + 1] + 1.414);
  }
  for (let y = h - 2; y >= 1; y--) for (let x = w - 2; x >= 1; x--) {
    const i = y * w + x;
    if (d[i]) d[i] = Math.min(d[i], d[i + 1] + 1, d[i + w] + 1, d[i + w + 1] + 1.414, d[i + w - 1] + 1.414);
  }
  const ds = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let a = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) a += Math.min(d[(y + j) * w + x + i], bw + 3);
    ds[y * w + x] = a / 9;
  }
  const lumFlat = LIGHT[2];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, dd = d[i];
    if (!dd) continue;
    let nx = 0, ny = 0, tilt = 0;
    if (dd < bw + 1) {
      const gx = ds[i + 1] - ds[i - 1], gy = ds[i + w] - ds[i - w], gl = Math.hypot(gx, gy);
      if (gl > 0.04) {
        nx = -gx / gl;
        ny = -gy / gl;
        tilt = clamp(1 - (dd - 1) / bw, 0, 1) * 0.93;
      }
    }
    const nz = Math.sqrt(1 - tilt * tilt);
    const v = nx * tilt * LIGHT[0] + ny * tilt * LIGHT[1] + nz * LIGHT[2] - lumFlat;
    let idx = flat + (v > 0 ? v * gp : v * gn);
    if (o.tone) idx += o.tone(px0 + x, py0 + y);
    c.set(px0 + x, py0 + y, ramp[clamp(Math.round(idx), 0, ramp.length - 1)]);
  }
}

/** Кольцо вокруг маски поверх уже нарисованного: разделительная линия между деталями. */
function ring(c: PC, s: Shape, col: (x: number, y: number) => RGBA) {
  for (let y = s.y0 - 1; y <= s.y1 + 1; y++) for (let x = s.x0 - 1; x <= s.x1 + 1; x++) {
    if (s.has(x, y) || !(s.has(x - 1, y) || s.has(x + 1, y) || s.has(x, y - 1) || s.has(x, y + 1))) continue;
    if (c.alpha(x, y) === 0) continue;
    c.set(x, y, col(x, y));
  }
}
interface PlateOpts extends ShadeOpts {
  /** dark — тёмная окантовка, seam — раскалённый шов между пластинами. */
  edge?: "dark" | "seam" | "none";
  heat?: number;
}
function plate(g: G, s: Shape, ramp: Ramp, o: PlateOpts = {}) {
  if (s.empty) return;
  const edge = o.edge ?? "dark";
  if (edge === "dark") ring(g.c, s, () => DARK);
  else if (edge === "seam") ring(g.c, s, (x, y) => (hash01(x, y, 77) < 0.62 ? g.seam(x, y, (o.heat ?? g.heat) * 0.85) : DARK));
  shadeShape(g.c, s, ramp, o);
  // шов под новой деталью больше не виден: убираем его свечение
  for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) if (s.has(x, y)) g.emis[y * N + x] = 0;
}

const hullShape = (view: KView, pts: V3[]) => new Shape().poly(hull(pts.map((p) => proj(view, p))));

// ---------------- поза ----------------
interface LegT { x?: number; y?: number; z?: number; knee?: V3 }
interface SwordT {
  /** верх навершия */
  P: V3;
  /** от навершия к острию */
  D: V3;
  G?: V3;
  /** где правая/левая рука на рукояти (вдоль D от навершия; отрицательное — над навершием) и боковой сдвиг */
  gr: number; gl: number; latR: number; latL: number;
}
interface Pose {
  bob: number;
  lean: number;
  yaw: number;
  hipY?: number;
  headDz: number; headDy: number; headRot: number;
  legs: [LegT, LegT];
  sword: SwordT;
  handR?: V3;
  handL?: V3;
  cloak: number;
  heat: number;
  flare: number;
  seed: number;
  ash?: number;
  glow?: number;
  /** боковой сдвиг корпуса и головы (шаг) */
  sway?: number;
  /** след клинка: лента по ключевым положениям меча, a — яркость в конце */
  sweep?: { path: SwordT[]; a: number };
  /** меч для отдельных видов (замах за спину виден сбоку, в стороне — спереди) */
  swordView?: Partial<Record<KView, SwordT>>;
  /** всплеск у острия при ударе в землю 0..1 */
  burst?: number;
  embers?: number;
}

const SW_LEN = 60;
const swordG = (sw: SwordT): V3 => {
  if (sw.G) return norm(sw.G);
  const g = cross(sw.D, [0, 0, 1]);
  return vlen(g) < 0.2 ? [1, 0, 0] : norm(g);
};
const swordAt = (sw: SwordT, s: number, u = 0): V3 => add(add(sw.P, mul(sw.D, s)), mul(swordG(sw), u));

interface Skel {
  hip: [V3, V3]; knee: [V3, V3]; ankle: [V3, V3];
  sh: [V3, V3]; el: [V3, V3]; hand: [V3, V3];
  head: V3;
  lean: (z: number) => number;
  swayX: (z: number) => number;
}
export function skeleton(p: Pose): Skel {
  const lean = (z: number) => p.lean * clamp((z - 50) / 30, 0, 1.3);
  const swayX = (z: number) => (p.sway ?? 0) * clamp((z - 50) / 30, 0, 1.3);
  const hipZ = 52 + p.bob;
  const sides: [number, number][] = [[0, 1], [1, -1]];
  const out = { hip: [] as V3[], knee: [] as V3[], ankle: [] as V3[], sh: [] as V3[], el: [] as V3[], hand: [] as V3[] };
  for (const [i, s] of sides) {
    const hip: V3 = [s * 10, p.hipY ?? 0, hipZ];
    const lg = p.legs[i];
    const ankle: V3 = [s * 14 + (lg.x ?? 0), lg.y ?? 2, 9 + (lg.z ?? 0)];
    out.hip.push(hip);
    out.ankle.push(ankle);
    out.knee.push(lg.knee ?? ik(hip, ankle, 23, 23, [s * 0.12, 1, 0.12]));
    const sh: V3 = [s * 22 * Math.cos(p.yaw) + swayX(77), lean(77) + s * 22 * Math.sin(p.yaw), 77 + p.bob - Math.abs(p.lean) * 0.1];
    out.sh.push(sh);
    const sw = p.sword;
    const hand = (i === 0 ? p.handR : p.handL) ?? add(add(sw.P, mul(sw.D, i === 0 ? sw.gr : sw.gl)), mul(swordG(sw), i === 0 ? sw.latR : sw.latL));
    out.hand.push(hand);
    out.el.push(ik(sh, hand, 20, 19, [s * 1, -0.4, -0.6]));
  }
  const head: V3 = [swayX(90), lean(90) + p.headDy, 90.5 + p.bob + p.headDz - Math.abs(p.lean) * 0.1];
  return { hip: out.hip as [V3, V3], knee: out.knee as [V3, V3], ankle: out.ankle as [V3, V3], sh: out.sh as [V3, V3], el: out.el as [V3, V3], hand: out.hand as [V3, V3], head, lean, swayX };
}

// ---------------- рисование ----------------
/** Тряпичная заливка с вертикальными складками. */
const folds = (x: number, k = 1) => (Math.sin(x * 0.46 + 0.8) * 0.6 + Math.sin(x * 0.93 + 2.1) * 0.4) * k;

function render(view: KView, p0: Pose): PC {
  const p: Pose = p0.swordView?.[view] ? { ...p0, sword: p0.swordView[view]! } : p0;
  const g = new G(p.heat, p.seed);
  const sk = skeleton(p);
  const pr = (v: V3) => proj(view, v);
  const side = view === "side", front = view === "down", back = view === "up";
  const bob = p.bob;
  const lean = sk.lean, swayX = sk.swayX;
  const rnd = rng(p.seed * 131 + 7);

  // вращение головы вокруг шеи (рёв — запрокинута, смерть — опущена)
  const neckY = lean(82), neckZ = 82 + bob;
  const headT = (v: V3): V3 => {
    const dy = v[1] - neckY, dz = v[2] - neckZ, ca = Math.cos(p.headRot), sa = Math.sin(p.headRot);
    return [v[0] + sk.head[0], neckY + dy * ca - dz * sa, neckZ + dy * sa + dz * ca];
  };

  const nearCam = (v: V3) => (front ? v[1] > 4 : back ? v[1] < -4 : true);
  const swMid = swordAt(p.sword, SW_LEN * 0.55);
  const swordNear = side ? true : nearCam(swMid);

  // ---------- плащ ----------
  const cloak = () => {
    const sway = p.cloak;
    const pts: [number, number][] = [];
    const teeth = (ax: number, ay: number, bx: number, by: number, n: number, seed: number) => {
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = lerp(ax, bx, t), y = lerp(ay, by, t);
        pts.push([x, y - 2]);
        if (k < n) pts.push([lerp(ax, bx, (k + 0.5) / n), y + 2 + 6 * hash01(k, seed, 11)]);
      }
    };
    if (!side) {
      const sp = 1 + sway * 0.012;
      const X = (x: number, z: number): [number, number] => pr([x * sp, -10 + lean(z) - sway * 0.5 * (1 - z / 90), z + bob * (z / 83)]);
      pts.push(X(-15, 83), X(15, 83), X(22, 80), X(25.5, 62), X(28, 38), X(29.5, 19));
      if (back) {
        const h1 = X(29.5, 17), h2 = X(8.5, 17);
        teeth(h1[0], h1[1], h2[0], h2[1], 6, 3);
        pts.push(X(5.5, 40), X(2.6, 67), X(-2.6, 67), X(-5.5, 40));
        const h3 = X(-8.5, 17), h4 = X(-29.5, 17);
        teeth(h3[0], h3[1], h4[0], h4[1], 6, 9);
      } else {
        const h1 = X(29.5, 17), h2 = X(-29.5, 17);
        teeth(h1[0], h1[1], h2[0], h2[1], 12, 3);
      }
      pts.push(X(-28, 38), X(-25.5, 62), X(-22, 80));
      if (front) pts.reverse();
    } else {
      const Y = (y: number, z: number): [number, number] => pr([0, y + lean(z) - sway * (1 - z / 90) * 1.3, z + bob * (z / 83)]);
      pts.push(Y(-3, 84), Y(-11, 82), Y(-14, 62), Y(-17.5, 38), Y(-19, 19));
      const h1 = Y(-19, 17), h2 = Y(-6, 17);
      teeth(h1[0], h1[1], h2[0], h2[1], 4, 5);
      pts.push(Y(-5, 40), Y(-5, 64));
    }
    const s = new Shape().poly(pts);
    const hemY = new Float32Array(N); // нижняя кромка по столбцам для тлеющего подола
    plate(g, s, CLOTH, { bw: 3, edge: "none", tone: (x) => folds(x, 0.95) });
    for (let x = s.x0; x <= s.x1; x++) {
      let yb = -1;
      for (let y = s.y1; y >= s.y0; y--) if (s.has(x, y)) { yb = y; break; }
      hemY[x] = yb;
      if (yb < 0) continue;
      const hh = hash01(x, 3, p.seed);
      g.dot(x, yb, SEAM[hh < 0.3 ? 3 : hh < 0.75 ? 2 : 1], 0.8);
      if (yb - 1 >= 0 && hash01(x, 5, p.seed) < 0.65) g.dot(x, yb - 1, SEAM[hh < 0.4 ? 2 : 1], 0.6);
      if (hash01(x, 6, p.seed) < 0.3 && yb - 2 >= 0) g.dot(x, yb - 2, SEAM[0], 0.4);
    }
    // прогары
    for (let k = 0; k < 4; k++) {
      const r2 = rng(k * 77 + 5);
      const x = s.x0 + 3 + Math.floor(r2() * (s.x1 - s.x0 - 6)), y = Math.round(lerp(s.y0 + (s.y1 - s.y0) * 0.45, s.y1 - 6, r2()));
      if (!s.has(x, y)) continue;
      g.dot(x, y, SEAM[1 + (k & 1)], 0.5);
      if (s.has(x + 1, y)) g.dot(x + 1, y, SEAM[0], 0.4);
      if (s.has(x, y + 1) && k % 2) g.dot(x, y + 1, SEAM[0], 0.4);
    }
  };

  // ---------- ноги ----------
  const sabaton = (a: V3): V3[] => {
    const z0 = a[2] - 9 + 0.4, zt = a[2] - 1.6, x = a[0], y = a[1];
    return [
      [x - 6.4, y - 6, z0], [x + 6.4, y - 6, z0], [x - 6, y - 6, zt], [x + 6, y - 6, zt],
      [x - 7.2, y + 4, z0], [x + 7.2, y + 4, z0], [x - 6.4, y + 4, a[2] - 3.4], [x + 6.4, y + 4, a[2] - 3.4],
      [x - 4.4, y + 12.5, z0], [x + 4.4, y + 12.5, z0], [x - 3.6, y + 12, z0 + 3], [x + 3.6, y + 12, z0 + 3],
    ];
  };
  const leg = (i: number) => {
    const ramp = side && i === 1 ? STEEL_FAR : STEEL_LIMB;
    const [hx, hy] = pr(sk.hip[i]), [kx, ky] = pr(sk.knee[i]), [ax, ay] = pr(sk.ankle[i]);
    plate(g, new Shape().capsule(hx, hy, kx, ky, 8.6, 7.2), ramp, { bw: 4 });
    plate(g, new Shape().capsule(kx, ky, ax, ay - 1, 7, 5.9), ramp, { bw: 3.6 });
    // наколенник
    if (!back) {
      const [qx, qy] = pr(add(sk.knee[i], [0, 6.5, 1]));
      const kr = side && i === 1 ? STEEL_FAR : STEEL;
      if (side) plate(g, new Shape().poly([[qx + 2, qy - 4.5], [qx + 11, qy + 0.5], [qx + 2, qy + 5]]), kr, { bw: 2 });
      else for (const dx of [-1, 1]) plate(g, new Shape().poly([[qx + dx * 5, qy - 2.6], [qx + dx * 12, qy - 0.4], [qx + dx * 5, qy + 3]]), kr, { bw: 1.6 });
      plate(g, new Shape().ellipse(qx, qy, 6.6, 5.6), kr, { bw: 3, edge: "seam", heat: g.heat * 0.9 });
    }
    // поножа: светящаяся полоса
    const t = 0.55;
    const mx = lerp(kx, ax, t), my = lerp(ky, ay, t);
    if (!side) g.line(mx - 5.5, my, mx + 5.5, my, g.heat * 0.75);
    else g.line(mx - 1, my - 3, mx - 1, my + 3, g.heat * 0.75);
    // сабатон
    const sb = hullShape(view, sabaton(sk.ankle[i]));
    plate(g, sb, ramp === STEEL_FAR ? STEEL_FAR : STEEL, { bw: 3.2, edge: "dark" });
  };

  // ---------- тело ----------
  const ringAt = (z: number, rx: number, ry: number, n = 12) => ringPts(swayX(z), lean(z), z + bob, rx, ry, n);
  const lame = (z1: number, z0: number, rx1: number, rx0: number, ry1: number, ry0: number, edge: PlateOpts["edge"] = "seam", heat = g.heat * 0.9) =>
    plate(g, hullShape(view, ringAt(z1, rx1, ry1).concat(ringAt(z0, rx0, ry0))), STEEL, { bw: 3, edge, heat });

  const tabard = () => {
    if (back) return;
    const sw2 = p.cloak * 0.4;
    let pts: [number, number][];
    if (front) {
      const Q = (x: number, z: number): [number, number] => pr([x, 10.5 + lean(z), z + bob * (z / 55)]);
      pts = [Q(8.5, 52), Q(-8.5, 52), Q(-9, 34), Q(-6.5, 28), Q(-4, 33), Q(-1.5, 22), Q(1.5, 31), Q(4, 25), Q(6.5, 32), Q(9, 29)];
    } else {
      const Q = (y: number, z: number): [number, number] => pr([0, y + lean(z), z + bob * (z / 55)]);
      pts = [Q(8.5, 52), Q(12, 52), Q(12.5 - sw2, 32), Q(10 - sw2, 25), Q(8.5 - sw2, 31)];
    }
    const s = new Shape().poly(pts);
    plate(g, s, CLOTH, { bw: 2.5, edge: "dark", tone: (x) => folds(x * 1.3, 0.9) });
    for (let x = s.x0; x <= s.x1; x++) {
      for (let y = s.y1; y >= s.y0; y--) if (s.has(x, y)) { g.dot(x, y, SEAM[hash01(x, 4, p.seed) < 0.4 ? 3 : 2], 0.8); if (s.has(x, y - 1)) g.dot(x, y - 1, SEAM[1], 0.5); break; }
    }
  };

  const torso = () => {
    // набедренники — три пластины внахлёст, нижняя рисуется первой
    for (let k = 2; k >= 0; k--) lame(51.5 - 3.8 * k, 47.4 - 3.8 * k, 15.4 + 1.5 * k, 16.8 + 1.5 * k, 11 + 0.5 * k, 11.8 + 0.5 * k, k === 2 ? "seam" : "dark", g.heat * 0.8);
    // пояс
    lame(56, 51.5, 13.4, 14.8, 10.4, 10.9, "dark");
    // живот — две пластины
    lame(60.2, 56, 13.5, 13.3, 10.3, 10.2, "seam", g.heat * 0.8);
    lame(64.5, 60.2, 14.4, 13.5, 10.6, 10.3, "seam", g.heat * 0.8);
    // нагрудник
    const chest = ringAt(64, 14.4, 10.6).concat(ringAt(69, 17.8, 12.6), ringAt(75, 19.8, 14), ringAt(80, 16.6, 12), ringAt(83, 11.5, 8.6));
    plate(g, hullShape(view, chest), STEEL, { bw: 4.2, edge: "seam", heat: g.heat * 0.8 });
    // швы на груди (спереди) и позвоночник (сзади)
    const surf = (x: number, z: number): [number, number] => pr([x, lean(z) + (front ? 1 : -1) * (11.2 - Math.abs(x) * 0.18), z + bob]);
    if (front) {
      let [a, b] = surf(0, 82), [c, d] = surf(0, 65.5);
      g.line(a, b, c, d, g.heat);
      for (const s of [-1, 1]) {
        [a, b] = surf(s * 16, 79); [c, d] = surf(s * 9, 71);
        g.line(a, b, c, d, g.heat * 0.9);
        const [e, f] = surf(s * 2, 67.5);
        g.line(c, d, e, f, g.heat * 0.9);
        [a, b] = surf(s * 11, 66.5); [c, d] = surf(s * 14.5, 71.5);
        g.line(a, b, c, d, g.heat * 0.7);
      }
    } else if (back) {
      const [a, b] = surf(0, 82), [c, d] = surf(0, 52);
      g.line(a, b, c, d, g.heat);
      for (const s of [-1, 1]) {
        const [e, f] = surf(s * 14, 77), [h, k] = surf(s * 3, 68);
        g.line(e, f, h, k, g.heat * 0.85);
      }
    }
    // медальон-«солнце» на поясе
    if (front) {
      const [mx, my] = pr([0, lean(53) + 10.8, 53 + bob]);
      plate(g, new Shape().ellipse(mx, my, 4.6, 4.2), STEEL, { bw: 2, edge: "seam", heat: g.heat * 1.1 });
      g.dot(mx, my, SEAM[4], 1);
      for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) g.dot(mx + dx, my + dy, SEAM[3], 0.9);
    } else if (side) {
      const [mx, my] = pr([0, lean(53) + 11.4, 53 + bob]);
      plate(g, new Shape().ellipse(mx, my, 2.6, 4.2), STEEL, { bw: 2, edge: "seam", heat: g.heat });
      g.dot(mx, my, SEAM[4], 1);
    }
  };

  const gorget = () => {
    const pts = ringAt(78.5, 14.4, 11).concat(ringAt(84, 12.4, 9.6));
    plate(g, hullShape(view, pts), STEEL, { bw: 3, edge: "dark" });
  };

  // ---------- голова и рога ----------
  const head = () => {
    const hz = sk.head[2], hy = sk.head[1];
    const rings: [number, number, number][] = [[hz - 12.5, 5.5, 5.5], [hz - 8, 9.8, 9], [hz - 2, 13.2, 12], [hz + 2, 14, 12.8], [hz + 7, 13.6, 12.4], [hz + 11, 10.6, 10], [hz + 13, 6, 6.4]];
    const pts: V3[] = [];
    for (const [z, rx, ry] of rings) for (const q of ringPts(0, hy, z, rx, ry, 12)) pts.push(headT(q));
    pts.push(headT([0, hy + 15.5, hz - 4.5]), headT([0, hy + 14.8, hz + 3]));
    plate(g, hullShape(view, pts), STEEL, { bw: 4.8, edge: "dark" });
    // надбровная пластина: козырёк над прорезью
    const brow: V3[] = [];
    for (const [z, rx, ry] of [[hz + 3.4, 14.9, 13.4], [hz + 6.6, 14.6, 13]] as [number, number, number][]) for (const q of ringPts(0, hy + 0.6, z, rx, ry, 14)) brow.push(headT(q));
    if (!back) plate(g, hullShape(view, brow), STEEL, { bw: 2.2, edge: "dark" });
    if (back) {
      // затылок: гребень-шов
      const [a, b] = pr(headT([0, hy - 9.5, hz + 10]));
      const [c, d] = pr(headT([0, hy - 10.5, hz - 7]));
      g.line(a, b, c, d, g.heat);
      return;
    }
    // забрало: узкая светящаяся прорезь
    const flare = p.flare;
    const visor: [number, number][] = [];
    const xs = side ? Array.from({ length: 12 }, (_, i) => i) : Array.from({ length: 21 }, (_, i) => i - 10);
    for (const x of xs) {
      const xx = Math.min(11.4, Math.abs(x) * 1.0);
      const yy = hy + 11 * Math.sqrt(Math.max(0, 1 - (x / 12.6) ** 2)) + 0.4;
      visor.push(pr(headT([x, yy, hz + 1.2 + (Math.abs(x) / 10) * 1.7])));
      void xx;
    }
    const th = flare > 0.6 ? 3 : 2;
    for (const [vx, vy] of visor) {
      const x = Math.round(vx), y = Math.round(vy);
      for (let k = -1; k <= th; k++) if (g.c.alpha(x, y + k) > 0) g.c.set(x, y + k, DARK);
    }
    visor.forEach(([vx, vy], i) => {
      const x = Math.round(vx), y = Math.round(vy), e = Math.abs(i - (visor.length - 1) / 2) / ((visor.length - 1) / 2);
      const col = side ? (i < 4 ? SEAM[5] : i < 8 ? SEAM[4] : SEAM[3]) : e < 0.3 ? SEAM[5] : e < 0.7 ? SEAM[4] : SEAM[3];
      for (let k = 0; k < th; k++) g.dot(x, y + k, k === 0 && th === 3 ? SEAM[4] : col, 1.2);
    });
    // вентиляция лицевой пластины и лоб
    if (front) {
      for (const x of [-4.5, 0, 4.5]) {
        const [vx, vy] = pr(headT([x, hy + 12.6, hz - 4.5]));
        g.c.set(Math.round(vx), Math.round(vy), DARK);
        g.c.set(Math.round(vx), Math.round(vy) + 1, DARK);
        g.dot(vx, vy + 2, SEAM[Math.min(3, 1 + Math.round(g.heat * 2))], 0.7);
      }
      const [a, b] = pr(headT([0, hy + 9, hz + 9.5])), [c, d] = pr(headT([0, hy + 11.5, hz + 5.5]));
      g.line(a, b, c, d, g.heat);
      const [e, f] = pr(headT([0, hy + 13.6, hz - 8]));
      g.line(e, f, e, f - 3, g.heat * 0.8);
    } else {
      const [vx, vy] = pr(headT([11.5, hy + 4.5, hz - 4.5]));
      g.line(vx, vy, vx + 4, vy, g.heat * 0.8);
      const [a, b] = pr(headT([11.7, hy + 2, hz + 7])), [c, d] = pr(headT([11.7, hy + 6, hz + 3]));
      g.line(a, b, c, d, g.heat * 0.9);
    }
  };

  const hornCurve = (s: number): { pts: V3[]; r: number[] } => {
    const hz = sk.head[2], hy = sk.head[1];
    const P0: V3 = [s * 13, hy - 1, hz + 4.5], P1: V3 = [s * 31, hy - 15, hz + 1], P2: V3 = [s * 38, hy - 9, hz + 16], P3: V3 = [s * 28, hy + 11, hz + 25.5];
    const pts: V3[] = [], r: number[] = [];
    const M = 30;
    for (let i = 0; i <= M; i++) {
      const t = i / M, u = 1 - t;
      const q: V3 = [0, 1, 2].map((k) => u * u * u * P0[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * P3[k]) as V3;
      pts.push(headT(q));
      r.push(5.3 * Math.pow(1 - t, 0.9) + 0.6);
    }
    return { pts, r };
  };
  const horn = (s: number, far = false) => {
    const { pts, r } = hornCurve(s);
    const sh = new Shape();
    const tmap = new Float32Array(N * N);
    const off: [number, number] = far ? [-5, 2] : [0, 0];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pr(pts[i]), [bx, by] = pr(pts[i + 1]);
      sh.capsule(ax + off[0], ay + off[1], bx + off[0], by + off[1], r[i], r[i + 1], tmap, i / (pts.length - 1), (i + 1) / (pts.length - 1));
    }
    const ramp = far ? dimRamp(HORN, 0.75) : HORN;
    plate(g, sh, ramp, { bw: 3, edge: "dark", tone: (x, y) => (((tmap[y * N + x] * 7.2) % 1) < 0.11 ? -1.1 : 0) });
    // тлеющие кончики и трещины
    for (let y = sh.y0; y <= sh.y1; y++) for (let x = sh.x0; x <= sh.x1; x++) {
      if (!sh.has(x, y)) continue;
      const t = tmap[y * N + x];
      const gl = smooth(0.42, 1, t) * (0.55 + 0.6 * p.flare) * (far ? 0.7 : 1);
      if (gl < 0.12) continue;
      const f = hash01(x, y, p.seed + 3);
      const i = clamp(Math.round((gl * (0.65 + 0.7 * f) * 4.3)), 0, 5);
      if (i >= 1) { g.c.set(x, y, SEAM[t > 0.94 ? 5 : t > 0.86 ? Math.max(i, 4) : i]); g.mark(x, y, 0.3 + i * 0.12); }
    }
    // гнездо рога

  };

  // ---------- руки ----------
  const uarm = (i: number) => {
    const [sx, sy] = pr(sk.sh[i]), [ex, ey] = pr(sk.el[i]);
    plate(g, new Shape().capsule(sx, sy + 2, ex, ey, 6.4, 5.4), side && i === 1 ? STEEL_FAR : STEEL_LIMB, { bw: 4 });
  };
  const forearm = (i: number) => {
    const ramp = side && i === 1 ? STEEL_FAR : STEEL_LIMB;
    const [ex, ey] = pr(sk.el[i]), [hx, hy] = pr(sk.hand[i]);
    plate(g, new Shape().capsule(ex, ey, hx, hy, 5.7, 4.9), ramp, { bw: 3.6 });
    // светящийся пояс наруча
    const mx = lerp(ex, hx, 0.62), my = lerp(ey, hy, 0.62);
    const dx = hx - ex, dy = hy - ey, dl = Math.hypot(dx, dy) || 1;
    g.line(mx - (dy / dl) * 5, my + (dx / dl) * 5, mx + (dy / dl) * 5, my - (dx / dl) * 5, g.heat * 0.8);
    // налокотник с шипом
    plate(g, new Shape().ellipse(ex, ey, 5.1, 4.7), ramp === STEEL_FAR ? STEEL_FAR : STEEL, { bw: 3, edge: "seam", heat: g.heat * 0.9 });
    const ox = side ? -1 : front ? (i === 0 ? 1 : -1) : i === 0 ? -1 : 1;
    plate(g, new Shape().poly([[ex + ox * 3, ey - 3], [ex + ox * 10, ey - 8], [ex + ox * 5, ey + 1]]), ramp === STEEL_FAR ? STEEL_FAR : STEEL, { bw: 2 });
  };
  const hand = (i: number) => {
    const [hx, hy] = pr(sk.hand[i]);
    const ramp = side && i === 1 ? STEEL_FAR : STEEL;
    plate(g, new Shape().ellipse(hx, hy, 5.8, 5.2), ramp, { bw: 3, edge: "dark" });
    g.line(hx - 3, hy + 1, hx + 3, hy + 1, 0.3, true, 0);
    g.c.set(Math.round(hx - 2), Math.round(hy - 2), STEEL[5]);
  };

  const pauldron = (i: number) => {
    const s = i === 0 ? 1 : -1;
    const [sx, sy] = pr(sk.sh[i]);
    const ramp = side && i === 1 ? STEEL_FAR : STEEL;
    const out = side ? 0 : front ? -s : s;
    const layers: [number, number, number, number][] = side
      ? [[8.6, 5, 0, 11], [10, 6.2, 0, 6], [11.6, 9.2, 0, 0]]
      : [[9, 4.4, out * 4, 10], [10.6, 5.4, out * 3, 5.5], [12.6, 8, out * 1.5, 0]];
    for (const [rx, ry, dx, dy] of layers) plate(g, new Shape().ellipse(sx + dx, sy + dy - 1, rx, ry), ramp, { bw: 3.6, edge: "seam", heat: g.heat * 0.85 });
    // шипы наплечника
    const spikes: [number, number][][] = side
      ? [[[-5, -6], [5, -8], [-9, -17]], [[3, -8], [10, -2], [15, -11]]]
      : [[[out * 5, -7], [out * 13, -3], [out * 20, -14]], [[out * 10, -4], [out * 16, 3], [out * 26, -2]]];
    for (const sp of spikes) {
      plate(g, new Shape().poly(sp.map(([x, y]) => [sx + x, sy + y] as [number, number])), ramp, { bw: 2, edge: "dark" });
      const tip = sp[2];
      g.dot(sx + tip[0], sy + tip[1] + 1, hex("#ffe9d0"), 0.4);
    }
  };

  // ---------- меч ----------
  /** Меч на экране: ось, ширина клинка не меньше 0.85 (читается в любом ракурсе), перекрестия — не меньше 0.45. */
  const swordFrame = (sw: SwordT) => {
    const base = (s: number): [number, number] => pr(swordAt(sw, s));
    const a0 = base(0), a1 = base(10);
    const axis: [number, number] = [a1[0] - a0[0], a1[1] - a0[1]];
    const al = Math.hypot(axis[0], axis[1]) || 1;
    const perp: [number, number] = [-axis[1] / al, axis[0] / al];
    const q0 = pr(sw.P), q1 = pr(add(sw.P, swordG(sw)));
    const comp = (q1[0] - q0[0]) * perp[0] + (q1[1] - q0[1]) * perp[1];
    const fit = (min: number): [number, number] => {
      const k = Math.max(Math.abs(comp), min) * (comp < 0 ? -1 : 1);
      return [perp[0] * k, perp[1] * k];
    };
    const at = (l: [number, number]) => (s: number, u: number): [number, number] => {
      const b = base(s);
      return [b[0] + l[0] * u, b[1] + l[1] * u];
    };
    return { base, blade: at(fit(0.85)), guard: at(fit(0.45)) };
  };
  /** След клинка: полупрозрачная лента, площадь, которую задел клинок; к концу пути ярче, кромка острия — светлая. */
  const drawSweep = (o: PC, sw: { path: SwordT[]; a: number }) => {
    const K = 10, segs = sw.path.length - 1;
    const pts: { i: [number, number]; e: [number, number] }[] = [];
    for (let sI = 0; sI < segs; sI++) for (let k = sI === 0 ? 0 : 1; k <= K; k++) {
      const f = swordFrame(lerpSword(sw.path[sI], sw.path[sI + 1], k / K));
      pts.push({ i: f.blade(46, 0), e: f.blade(61, 0) });
    }
    const n = pts.length - 1;
    const quads = Array.from({ length: n }, (_, k) => new Shape().poly([pts[k].i, pts[k].e, pts[k + 1].e, pts[k + 1].i]));
    // в проекции вдоль взгляда лента вырождается в линию: такой след не рисуем
    if (quads.reduce((s, q) => s + (q.empty ? 0 : q.m.reduce((a, v) => a + v, 0)), 0) < 120) return;
    const fade = (y: number) => smooth(2, 16, y);
    quads.forEach((q, k) => {
      const t = (k + 1) / n, a = sw.a * t * t;
      for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) if (q.has(x, y)) o.set(x, y, [255, Math.round(80 + 100 * t), Math.round(18 + 40 * t), Math.round(a * fade(y))]);
    });
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / n;
      const [x0, y0] = pts[k].e, [x1, y1] = pts[k + 1].e;
      const m = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let s = 0; s <= m; s++) {
        const y = y0 + ((y1 - y0) * s) / m;
        o.set(x0 + ((x1 - x0) * s) / m, y, [255, 238, 180, Math.round(255 * t * t * fade(y))]);
      }
    }
  };
  const sword = () => {
    const sw = p.sword, f = swordFrame(sw), sp = f.blade, gp = f.guard, base = f.base;
    // клинок
    const bs = new Shape().poly(BLADE.map(([s, u]) => sp(s, u)));
    plate(g, bs, OBS, { bw: 2.4, edge: "dark" });
    // долы и огненная кромка
    g.line(...sp(25, 0), ...sp(50, 0), 0.25, true);
    for (const u of [-1, 1]) {
      for (let s = 23; s <= 57; s += 1) {
        const [x, y] = sp(s, u * (s < 48 ? 4.1 : 4.1 - (s - 48) * 0.33));
        if (!bs.has(Math.round(x), Math.round(y))) continue;
        const tip = smooth(30, 60, s);
        g.c.set(Math.round(x), Math.round(y), g.seam(Math.round(x), Math.round(y), g.heat * (0.85 + 0.35 * tip), 0.1));
      }
    }
    for (const s of [31, 39]) g.line(...sp(s, -2.2), ...sp(s + 1.5, 2.2), g.heat * 0.9);
    g.dot(...sp(58.8, 0), SEAM[5], 1);
    // перекрестие с загнутыми к клинку рогами
    const top: [number, number][] = [], bot: [number, number][] = [];
    for (let k = -8; k <= 8; k++) {
      const u = (k / 8) * 24.5, e = Math.abs(k) / 8;
      top.push(gp(16.6 + e * e * 6.5, u));
      bot.unshift(gp(22.4 + e * e * 6.5 - e * 2.2, u));
    }
    plate(g, new Shape().poly(top.concat(bot)), STEEL, { bw: 2.2, edge: "seam", heat: g.heat * 0.85 });
    g.line(...gp(19.3, -12), ...gp(19.3, 12), g.heat * 0.7);
    // рукоять с обмоткой и навершие
    plate(g, new Shape().poly([sp(5, -2.4), sp(17.2, -2.4), sp(17.2, 2.4), sp(5, 2.4)]), LEATHER, { bw: 1.6, edge: "dark" });
    for (let s = 6.5; s < 17; s += 3) g.line(...sp(s, -2.2), ...sp(s + 1.2, 2.2), 0.18, true);
    const [px, py] = base(2.6);
    plate(g, new Shape().ellipse(px, py, 3.9, 3.9), STEEL, { bw: 2.2, edge: "seam", heat: g.heat });
    g.dot(px, py, SEAM[4], 0.9);
  };

  // ---------- порядок слоёв ----------
  /** Руки в стороне от туловища (раскинуты) всегда поверх него. */
  const armIsNear = (i: number) => nearCam(sk.hand[i]) || Math.abs(sk.hand[i][0]) > 25;
  const armsBehind = () => {
    for (const i of [1, 0]) if (!armIsNear(i)) forearm(i), hand(i);
  };
  const armsNear = () => {
    for (const i of [1, 0]) if (armIsNear(i)) forearm(i), hand(i);
  };
  const drawLegs = () => (side ? [1, 0] : [0, 1]).forEach(leg);
  const horns = () => {
    if (side) { horn(-1, true); horn(1); } else { horn(1); horn(-1); }
  };

  if (front) {
    cloak();
    if (!swordNear) sword();
    armsBehind();
    drawLegs();
    tabard();
    torso();
    gorget();
    head();
    uarm(0); uarm(1);
    pauldron(0); pauldron(1);
    if (swordNear) sword();
    armsNear();
    horns();
  } else if (back) {
    if (!swordNear) sword();
    armsBehind();
    drawLegs();
    torso();
    gorget();
    cloak();
    uarm(0); uarm(1);
    head();
    pauldron(0); pauldron(1);
    if (swordNear) sword();
    armsNear();
    horns();
  } else {
    uarm(1); forearm(1); hand(1); pauldron(1); horn(-1, true);
    cloak();
    drawLegs();
    torso();
    tabard();
    gorget();
    head();
    sword();
    uarm(0); pauldron(0); forearm(0); hand(0);
    horn(1);
  }

  // ---------- сборка кадра: свет и земля под телом, тело, следы и искры поверх ----------
  const body = finishBody(g, p);
  const out = new PC(N, N);
  const tipW = swordAt(p.sword, SW_LEN);
  const tipS = pr([tipW[0], tipW[1], Math.max(0, tipW[2])]);
  const gl = p.glow ?? 0;
  if (gl > 0) {
    // вспышка рёва: мягкий оранжевый диск и лучи за телом
    const cx = 64, cy = 56, Rr = 28 + 36 * gl;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 0.92) / Rr;
      if (d >= 1) continue;
      out.set(x, y, [255, Math.round(90 + 70 * (1 - d)), 28, Math.round(135 * gl * (1 - d) * (1 - d))]);
    }
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + 0.2, len = Rr * (0.95 + 0.55 * hash01(k, 3, 8));
      for (let r = Rr * 0.45; r < len; r++) out.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.92, [255, 170, 60, Math.round(80 * gl * (1 - r / len))]);
    }
  }
  const burst = p.burst ?? 0;
  if (burst > 0) {
    // раскалённая земля вокруг острия
    for (let y = Math.floor(tipS[1] - 12); y <= tipS[1] + 12; y++) for (let x = Math.floor(tipS[0] - 32); x <= tipS[0] + 32; x++) {
      const d = Math.hypot((x + 0.5 - tipS[0]) / (28 * burst), (y + 0.5 - tipS[1]) / (8 * burst));
      if (d >= 1) continue;
      out.set(x, y, [255, Math.round(110 + 90 * (1 - d)), 30, Math.round(150 * burst * (1 - d))]);
    }
  }
  if (p.ash) {
    // куча пепла у колена
    const r2 = rng(p.seed + 31);
    const rx = 16 + 34 * p.ash, ry = 3 + 7 * p.ash;
    for (let y = 100; y < N; y++) for (let x = 20; x < 118; x++) {
      const d = Math.hypot((x + 0.5 - 66) / rx, (y + 0.5 - 117.5) / ry);
      if (d >= 1) continue;
      const k = r2();
      out.set(x, y, k < 0.2 ? [86, 70, 70, 235] : k < 0.65 ? [52, 42, 48, 235] : [34, 27, 33, 235]);
      if (k > 0.985) out.set(x, y, SEAM[1 + (x % 2)]);
    }
  }
  if (p.sweep && !swordNear) drawSweep(out, p.sweep);
  out.blit(body, 0, 0);
  if (p.sweep && swordNear) drawSweep(out, p.sweep);
  if (burst > 0) {
    // искры веером от острия
    const r2 = rng(p.seed * 17 + 3);
    for (let k = 0; k < 18 * burst; k++) {
      const ang = -Math.PI * (0.06 + 0.88 * r2()), len = (8 + 24 * r2()) * (0.6 + 0.6 * burst);
      for (let r = 2; r < len; r++) {
        const t = r / len;
        out.set(tipS[0] + Math.cos(ang) * r * 1.25, tipS[1] + Math.sin(ang) * r - r * r * 0.012, [255, Math.round(235 - 120 * t), Math.round(130 - 100 * t), Math.round(255 * (1 - t * 0.85))]);
      }
    }
  }
  if (p.ash) {
    // хлопья пепла над телом
    for (let k = 0; k < 34 * p.ash; k++) {
      const x = 28 + Math.floor(rnd() * 72), y = 30 + Math.floor(rnd() * 88);
      if (body.alpha(x, y) === 0 && body.alpha(x, y + 1) > 0) out.set(x, y - 1 - Math.floor(rnd() * 6), hex(k % 3 ? "#3a3036" : "#6a5a54"));
    }
  }
  // искры
  for (let k = 0; k < (p.embers ?? 5); k++) {
    const x = 20 + Math.floor(rnd() * 88), y = 6 + Math.floor(rnd() * 108);
    if (body.alpha(x, y) !== 0) continue;
    const col = SEAM[2 + Math.floor(rnd() * 3)];
    out.set(x, y, col);
    if (rnd() < 0.3) out.set(x, y + 1, [col[0], col[1], col[2], 140]);
  }
  return out;
}

const BLADE: [number, number][] = [[21, -4.9], [24, -5.1], [48, -4.7], [56, -3.1], [60.5, 0], [56, 3.1], [48, 4.7], [24, 5.1], [21, 4.9]];

/** Подсветка стали от швов, распад в пепел, контровой свет и контур. */
function finishBody(g: G, p: Pose): PC {
  const c = g.c;
  // подсветка соседней стали от швов (размытая карта свечения)
  const a = g.emis, b = new Float32Array(N * N), t = new Float32Array(N * N);
  const R = 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (let k = -R; k <= R; k++) if (x + k >= 0 && x + k < N) s += a[y * N + x + k];
    b[y * N + x] = s / (R * 2 + 1);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0;
    for (let k = -R; k <= R; k++) if (y + k >= 0 && y + k < N) s += b[(y + k) * N + x];
    t[y * N + x] = s / (R * 2 + 1);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    if (c.data[i + 3] === 0) continue;
    const k = clamp(t[y * N + x] * 4, 0, 1) * 0.22;
    if (k < 0.02) continue;
    c.data[i] = Math.min(255, c.data[i] + 200 * k);
    c.data[i + 1] = Math.min(255, c.data[i + 1] + 70 * k);
    c.data[i + 2] = Math.min(255, c.data[i + 2] + 18 * k);
  }
  // распад в пепел: блоками 2×2, сверху сильнее
  if (p.ash) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (c.alpha(x, y) === 0) continue;
      const h = hash01(x >> 1, y >> 1, 901 + p.seed);
      if (h < p.ash * (0.25 + smooth(118, 30, y)) * 0.62) c.clear(x, y);
    }
  }
  // контровой свет от ореола: верхняя и боковая кромка силуэта чуть теплее
  const edgeA = (x: number, y: number) => (x >= 0 && y >= 0 && x < N && y < N ? c.data[(y * N + x) * 4 + 3] : 0);
  const rim: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (edgeA(x, y) === 0) continue;
    if (edgeA(x, y - 1) === 0 || edgeA(x - 1, y) === 0 || edgeA(x + 1, y) === 0) rim.push([x, y]);
  }
  for (const [x, y] of rim) {
    const i = (y * N + x) * 4;
    c.data[i] = Math.min(255, c.data[i] * 0.7 + 150 * 0.3);
    c.data[i + 1] = Math.min(255, c.data[i + 1] * 0.7 + 62 * 0.3);
    c.data[i + 2] = Math.min(255, c.data[i + 2] * 0.7 + 26 * 0.3);
  }
  c.outline(DARK);
  return c;
}

// ---------------- позы по анимациям ----------------
const V = (x: number, y: number, z: number): V3 => [x, y, z];
/** Меч воткнут перед героем остриём вниз, обе кисти лежат на навершии. */
const planted = (y = 18, top = 60): SwordT => ({ P: V(0, y, top), D: V(0, 0, -1), G: V(1, 0, 0), gr: -3.5, gl: -3.5, latR: 2.6, latL: -2.6 });
/** Меч в двух руках: M — середина между кистями, D — от навершия к острию. */
const twoHand = (M: V3, D: V3, gm = 9): SwordT => {
  const d = norm(D);
  return { P: sub(M, mul(d, gm)), D: d, gr: gm + 4, gl: gm - 4, latR: 0, latL: 0 };
};
/** Промежуточное положение меча между двумя позами (для следа). */
const lerpSword = (a: SwordT, b: SwordT, t: number): SwordT => ({
  P: V(lerp(a.P[0], b.P[0], t), lerp(a.P[1], b.P[1], t), lerp(a.P[2], b.P[2], t)),
  D: norm(V(lerp(a.D[0], b.D[0], t), lerp(a.D[1], b.D[1], t), lerp(a.D[2], b.D[2], t))),
  gr: a.gr, gl: a.gl, latR: 0, latL: 0,
});
const base = (o: Partial<Pose> & { seed: number }): Pose => ({
  bob: 0, lean: 0, yaw: 0, headDz: 0, headDy: 0, headRot: 0, legs: [{}, {}], sword: planted(), cloak: 0, heat: 0.46, flare: 0.5, ...o,
});

function idlePoses(): Pose[] {
  return [0, 1, 2, 3].map((i) =>
    base({
      seed: 200 + i,
      bob: [0, 0.7, 1.3, 0.7][i], headDz: [0, 0.3, 0.7, 0.3][i], heat: [0.44, 0.58, 0.5, 0.7][i], flare: [0.5, 0.6, 0.55, 0.7][i],
      cloak: [0, 1, 1.6, 0.8][i], legs: [{ y: 3 }, { y: 3 }], embers: 5,
    }),
  );
}

/** Шаг: меч на отлёте в правой руке, левая рука качается, корпус переваливается, плащ тянется назад. */
function walkPoses(): Pose[] {
  return [0, 1, 2, 3].map((i) => {
    const bob = [-2.2, 1.4, -2.2, 1.4][i];
    const ry = [9, 1, -8, 1][i], ly = [-8, 1, 9, 1][i], rz = [0, 0, 0, 9][i], lz = [0, 9, 0, 0][i];
    const H = V(20, 9, 67 + bob * 0.5);
    const carry = (d: V3): SwordT => {
      const D = norm(d);
      return { P: sub(H, mul(D, 10)), D, gr: 10, gl: 4, latR: 0, latL: 0 };
    };
    const dz = [0, 0.04, 0, 0.04][i];
    return base({
      seed: 100 + i, bob, lean: 2.5, yaw: [0.1, 0, -0.1, 0][i], sway: [2.2, 0, -2.2, 0][i], legs: [{ y: ry, z: rz }, { y: ly, z: lz }],
      sword: carry(V(0.72, -0.2, 0.62 + dz)), swordView: { side: carry(V(0.25, -0.85, 0.46 + dz)) },
      handL: V(-26, [8, 2, -8, 2][i], 55 + [0.5, 0, 0.5, 0][i]), cloak: 4 + [0, 1, 0, 1][i], heat: 0.5 + [0, 0.1, 0, 0.1][i], embers: 6,
    });
  });
}

/** Рассечение: замах вправо-назад, пик, косой удар слева-вниз, проводка. Кадры: замах, пик, удар, конец. */
function attackPoses(): Pose[] {
  const T = [
    { M: V(10, -3, 84), D: V(0.75, -0.45, 0.45), yaw: -0.5, lean: -3, bob: -0.5, legs: [{ y: -3 }, { y: 5 }] as [LegT, LegT], cloak: 2, heat: 0.6 },
    { M: V(14, -8, 86), D: V(0.9, -0.3, 0.3), yaw: -0.75, lean: -4, bob: 0, legs: [{ y: -4, x: 1 }, { y: 6 }] as [LegT, LegT], cloak: 3, heat: 0.75 },
    { M: V(0, 22, 70), D: V(-0.7, 0.55, -0.45), yaw: 0.5, lean: 5, bob: -2, legs: [{ y: 11 }, { y: -7 }] as [LegT, LegT], cloak: -2, heat: 1.0 },
    { M: V(-10, 14, 56), D: V(-0.9, 0.3, -0.3), yaw: 0.8, lean: 6, bob: -2.5, legs: [{ y: 12 }, { y: -6 }] as [LegT, LegT], cloak: 1, heat: 0.8 },
  ];
  const sw = T.map((t) => twoHand(t.M, t.D));
  // сбоку замах уходит за спину: клинок виден позади головы
  const swSide = [twoHand(V(8, -2, 84), V(0.15, -0.9, 0.4)), twoHand(V(10, -6, 86), V(0.15, -0.95, 0.3))];
  return T.map((t, i) =>
    base({
      seed: 400 + i, sword: sw[i], yaw: t.yaw, lean: t.lean, bob: t.bob, legs: t.legs, cloak: t.cloak, heat: t.heat, flare: 0.7, headDy: i > 1 ? 2 : 0, embers: 6,
      swordView: i < 2 ? { side: swSide[i] } : undefined,
      sweep: i === 2 ? { path: [sw[1], sw[2]], a: 150 } : i === 3 ? { path: [sw[2], sw[3]], a: 110 } : undefined,
    }),
  );
}

/** Удар в землю (Сотрясение): меч за голову, пик, вбивание в землю, отдача. */
function slamPoses(): Pose[] {
  const s0 = twoHand(V(3, -3, 94), V(0.1, -0.9, 0.35));
  const s1 = twoHand(V(3, -4, 96), V(0.1, -0.9, 0.33));
  const s2 = twoHand(V(0, 24, 52), V(0, 0.08, -1));
  const s3 = twoHand(V(0, 21, 57), V(0, 0.04, -1));
  // спереди и сзади меч поднят в сторону, чтобы клинок не прятался за головой
  const f0 = twoHand(V(8, -2, 94), V(0.7, -0.4, 0.42));
  const f1 = twoHand(V(8, -3, 95), V(0.7, -0.4, 0.4));
  // дуга удара: от замаха через «вперёд-вверх» к воткнутому мечу
  const arc1 = twoHand(V(2, 4, 84), V(0, -0.3, 0.95));
  const arc2 = twoHand(V(1, 16, 70), V(0, 0.8, 0.6));
  return [
    base({ seed: 500, sword: s0, swordView: { down: f0, up: f0 }, lean: -4, bob: 1, legs: [{ y: 2, x: 1 }, { y: 2, x: -1 }], cloak: 3, heat: 0.7, flare: 0.8, headRot: 0.12, embers: 6 }),
    base({ seed: 501, sword: s1, swordView: { down: f1, up: f1 }, lean: -6, bob: 2, legs: [{ y: 1, x: 2 }, { y: 1, x: -2 }], cloak: 4, heat: 0.95, flare: 1, headRot: 0.2, embers: 8 }),
    base({
      seed: 502, sword: s2, lean: 10, bob: -6, headDy: 3, headDz: -2, headRot: -0.15, legs: [{ y: 8, x: 3 }, { y: -1, x: -3 }], cloak: -3, heat: 1.2, flare: 1, embers: 14, glow: 0.45, burst: 1,
      sweep: { path: [s1, arc1, arc2, s2], a: 170 },
    }),
    base({ seed: 503, sword: s3, lean: 5, bob: -2, headDy: 1.5, legs: [{ y: 5, x: 2 }, { y: 1, x: -2 }], cloak: -1, heat: 0.85, flare: 0.8, embers: 10, burst: 0.5 }),
  ];
}

/** Рёв на смене фазы: пригнуться, выпрямиться с раскинутыми руками, пик с запрокинутой головой, удержание. */
function roarPoses(): Pose[] {
  return [
    base({ seed: 600, bob: -3, lean: 7, headDz: -2, headDy: 2, headRot: -0.25, legs: [{ y: 4, x: 2 }, { y: 0, x: -2 }], cloak: -1, heat: 0.8, flare: 0.8, embers: 6 }),
    base({ seed: 601, bob: 0.5, lean: 1, headRot: 0.1, handR: V(34, 14, 76), handL: V(-34, 14, 76), legs: [{ y: 3, x: 3 }, { y: 3, x: -3 }], cloak: 2, heat: 1.05, flare: 0.95, embers: 10, glow: 0.35 }),
    base({ seed: 602, bob: 2.5, lean: -7, headDz: 1.5, headRot: 0.42, handR: V(38, 10, 96), handL: V(-38, 10, 96), legs: [{ y: 2, x: 4 }, { y: 2, x: -4 }], cloak: 5, heat: 1.45, flare: 1.15, embers: 16, glow: 0.8 }),
    base({ seed: 603, bob: 2, lean: -5, headDz: 1, headRot: 0.3, handR: V(36, 12, 90), handL: V(-36, 12, 90), legs: [{ y: 2, x: 4 }, { y: 2, x: -4 }], cloak: 4, heat: 1.25, flare: 1.05, embers: 14, glow: 0.6 }),
  ];
}

/** Смерть: удар, падение на колено, оседание на меч, распад в пепел. */
function deathPoses(): Pose[] {
  const kneel: [LegT, LegT] = [{ knee: V(10, 9, 3), y: -14, z: -3 }, { y: 15 }];
  return [
    base({ seed: 700, bob: -6, lean: 4, headRot: -0.15, headDy: 1, sword: planted(18, 56), legs: [{ y: 4 }, { y: -2 }], cloak: 1, heat: 1.1, flare: 0.8, embers: 10 }),
    base({ seed: 701, bob: -24, lean: 14, hipY: -4, headRot: -0.5, headDy: 4, sword: planted(20, 48), legs: kneel, cloak: -2, heat: 0.55, flare: 0.5, embers: 8 }),
    base({ seed: 702, bob: -28, lean: 18, hipY: -4, headRot: -0.7, headDy: 5, sword: planted(21, 43), legs: kneel, cloak: -3, heat: 0.32, flare: 0.35, ash: 0.2, embers: 10 }),
    base({ seed: 703, bob: -30, lean: 20, hipY: -4, headRot: -0.8, headDy: 5, sword: planted(21, 40), legs: kneel, cloak: -3, heat: 0.18, flare: 0.2, ash: 0.45, embers: 12 }),
  ];
}

export const KNIGHT_POSES: Record<KnightAnim, () => Pose[]> = {
  walk: walkPoses,
  idle: idlePoses,
  attack: attackPoses,
  slam: slamPoses,
  roar: roarPoses,
  death: deathPoses,
};

export function chaosKnightFrame(view: KView, anim: KnightAnim, i: number): PC {
  return render(view, KNIGHT_POSES[anim]()[i]);
}

/** Весь лист: 24 столбца × 3 строки (вниз, вверх, вбок). */
export function buildChaosKnightSheet(): PC {
  const out = new PC(KNIGHT_FRAME * KNIGHT_COLS, KNIGHT_FRAME * 3);
  const cache = new Map<string, Pose[]>();
  (Object.keys(KNIGHT_ANIMS) as KnightAnim[]).forEach((a) => cache.set(a, KNIGHT_POSES[a]()));
  KNIGHT_VIEWS.forEach((v, row) => {
    for (const a of Object.keys(KNIGHT_ANIMS) as KnightAnim[])
      for (let i = 0; i < 4; i++) out.blit(render(v, cache.get(a)![i]), (KNIGHT_ANIMS[a] + i) * KNIGHT_FRAME, row * KNIGHT_FRAME);
  });
  return out;
}

/** Ореол за спиной босса: диск-солнце, кольцо, огненные языки и лучи. Цвета рассчитаны на режим ADD (прозрачность задаёт яркость), без белого. */
export function buildChaosHalo(): PC {
  const S = 160, c = new PC(S, S), cx = S / 2, cy = S / 2;
  // ступени огня: тёмно-красный, красный, оранжевый, ярко-оранжевый, золотой
  const FIRE: [RGBA, number][] = [
    [hex("#7a1608"), 62], [hex("#b02a0c"), 104], [hex("#e0540f"), 150], [hex("#ff8a1c"), 200], [hex("#ffc23a"), 236],
  ];
  const TONGUES = 16;
  const tongueLen = Array.from({ length: TONGUES }, (_, q) => 10 + 19 * hash01(q, 17, 5));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    if (r > 79.5) continue;
    const ang = Math.atan2(dy, dx);
    let v = 0;
    let fade = 1;
    if (r < 51) v = (r < 13 ? 0.19 : r < 40 ? 0.3 : 0.5) + (hash01(x, y, 3) < 0.05 ? 0.2 : 0); // диск: тёмный центр, ярче к краю
    else if (r < 58) v = r >= 53.5 && r < 55.6 ? 0.95 : 0.78;                          // кольцо с золотой жилой
    else if (r < 63) v = 0.58 - 0.04 * (r - 58);                                       // свечение за кольцом
    else { v = 0.18; fade = 1 - (r - 63) / 17; }                                        // мягкий край
    // огненные языки: изогнутые, разной длины, с колыханием кромки
    const k = Math.round((ang / (Math.PI * 2)) * TONGUES);
    for (let q = k - 1; q <= k + 1; q++) {
      const qi = ((q % TONGUES) + TONGUES) % TONGUES;
      const len = tongueLen[qi], t = (r - 58) / len;
      if (t < 0 || t > 1) continue;
      let da = ang - ((q / TONGUES) * Math.PI * 2 + 0.55 * t * t);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      const half = ((Math.PI / TONGUES) * 0.92) * (1 - t) ** 0.75 * (1 + 0.18 * Math.sin(t * 9 + qi * 1.7));
      if (Math.abs(da) < half) { v = Math.max(v, t < 0.16 ? 0.92 : 0.84 - 0.5 * t); fade = 1; }
    }
    // тонкие лучи
    const rayA = ((ang / (Math.PI * 2)) * 8 + 0.3) % 1;
    if (r > 30 && Math.abs(rayA - 0.5) < 0.03) v = Math.max(v, 0.36);
    if (v <= 0.02) continue;
    const [col, a] = FIRE[clamp(Math.ceil(v * 5), 1, 5) - 1];
    c.set(x, y, [col[0], col[1], col[2], Math.round(a * fade)]);
  }
  // искры за кольцом
  const r2 = rng(77);
  for (let k = 0; k < 26; k++) {
    const a = r2() * Math.PI * 2, rr = 64 + r2() * 13;
    const x = Math.floor(cx + Math.cos(a) * rr), y = Math.floor(cy + Math.sin(a) * rr);
    c.set(x, y, [255, 194, 58, 215]);
    if (k % 3 === 0) c.set(x + 1, y, [255, 138, 28, 170]);
  }
  return c;
}
