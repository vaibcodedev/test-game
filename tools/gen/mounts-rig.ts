/**
 * Каркас маунтов (задача 118): примитивы в 3D (X вправо от существа, Y вперёд, Z вверх) -> проекция на три вида
 * (0 вниз, 1 вверх, 2 вбок — вправо; влево делает клиент отражением) с объёмной заливкой по палитре и глубиной.
 * Часть примитивов помечается «передним слоем»: он рисуется ПОВЕРХ всадника (голова и шея при взгляде вниз, подпруга сбоку).
 */
import { PC, hash01, type RGBA, type Ramp } from "./canvas";

export type V3 = [number, number, number];
export const V = (x: number, y: number, z: number): V3 => [x, y, z];
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const VIEW_DOWN = 1, VIEW_UP = 2, VIEW_SIDE = 4, VIEW_ALL = 7;
const BIT = [1, 2, 4];

export interface Prim {
  k: "cap" | "poly" | "dot";
  a: V3;
  b?: V3;
  ra: number;
  rb: number;
  wa: number;
  wb: number;
  pts?: V3[];
  ramp: Ramp;
  /** виды, в которых примитив рисуется поверх всадника */
  front: number;
  /** виды, в которых примитив виден вообще */
  views: number;
  bias: number;
  tone: number;
  noise: number;
  /** собственный цвет точки: (x, y, индекс тона 0..n-1) -> цвет или null (оставить по палитре) */
  fx?: (x: number, y: number, i: number, lx: number, ly: number) => RGBA | null;
  col?: RGBA;
}
export type PrimOpts = Partial<Pick<Prim, "wa" | "wb" | "front" | "views" | "bias" | "tone" | "noise" | "fx" | "col">>;

export class Rig {
  prims: Prim[] = [];
  /** Капсула a->b с радиусами ra->rb (вид сбоку/сверху: r — высота, w — ширина). */
  cap(a: V3, b: V3, ra: number, rb: number, ramp: Ramp, o: PrimOpts = {}) {
    this.prims.push({ k: "cap", a, b, ra, rb, wa: o.wa ?? ra * 0.85, wb: o.wb ?? rb * 0.85, ramp, front: o.front ?? 0, views: o.views ?? VIEW_ALL, bias: o.bias ?? 0, tone: o.tone ?? 0, noise: o.noise ?? 0.12, fx: o.fx });
  }
  /** Шар. */
  ball(a: V3, r: number, ramp: Ramp, o: PrimOpts = {}) {
    this.cap(a, a, r, r, ramp, { wa: r, wb: r, ...o });
  }
  /** Плоский многоугольник в 3D (крыло, огонь, попона). */
  poly(pts: V3[], ramp: Ramp, o: PrimOpts = {}) {
    this.prims.push({ k: "poly", a: pts[0], ra: 0, rb: 0, wa: 0, wb: 0, pts, ramp, front: o.front ?? 0, views: o.views ?? VIEW_ALL, bias: o.bias ?? 0, tone: o.tone ?? 0, noise: o.noise ?? 0.08, fx: o.fx });
  }
  /** Точка-деталь (глаз, заклёпка). */
  dot(a: V3, r: number, col: RGBA, o: PrimOpts = {}) {
    this.prims.push({ k: "dot", a, ra: r, rb: r, wa: r, wb: r, ramp: [col], front: o.front ?? 0, views: o.views ?? VIEW_ALL, bias: o.bias ?? 2, tone: 0, noise: 0, col });
  }
  /** Цепочка капсул по точкам (грива, хвост, шея). */
  chain(pts: V3[], r0: number, r1: number, ramp: Ramp, o: PrimOpts = {}) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
      this.cap(pts[i], pts[i + 1], lerp(r0, r1, t0), lerp(r0, r1, t1), ramp, o);
    }
  }
  /** Симметричная пара по X. */
  pair(fn: (s: number) => void) {
    fn(-1);
    fn(1);
  }
}

/** Растяжение ширины при взгляде спереди/сзади (иначе зверь выглядит палкой). */
export const cfg = { lat: 1.85, yk: 0.72, ex: 0 };

/** Проекция точки: [экранный сдвиг x, экранный сдвиг y (вниз +), глубина]. */
export function proj(view: number, p: V3): [number, number, number] {
  const [x, y, z] = p;
  if (view === 0) return [-x * cfg.lat, -z + cfg.yk * y + cfg.ex * Math.max(0, y - 10), y];
  if (view === 1) return [x * cfg.lat, -z - cfg.yk * y - cfg.ex * Math.max(0, y - 10), -y];
  return [y + 0.35 * x, -z + 0.3 * x, x];
}

const L0 = -0.55, L1 = -0.65, L2 = 0.55, LL = Math.hypot(L0, L1, L2);

function shadeIdx(n: number, lum: number, tone: number) {
  return clamp(Math.floor(((lum + 0.5) / 1.4) * n) + tone, 0, n - 1);
}

interface P2 { tone: number; x: number; y: number; d: number; p: Prim; ra: number; rb: number; x2: number; y2: number; pts?: [number, number][] }

function drawCap(pc: PC, q: P2) {
  const { p, x, y, x2, y2, ra, rb } = q;
  const n = p.ramp.length;
  const R = Math.max(ra, rb);
  const x0 = Math.floor(Math.min(x, x2) - R - 1), x1 = Math.ceil(Math.max(x, x2) + R + 1);
  const y0 = Math.floor(Math.min(y, y2) - R - 1), y1 = Math.ceil(Math.max(y, y2) + R + 1);
  const dx = x2 - x, dy = y2 - y, len2 = dx * dx + dy * dy;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const cx = px + 0.5, cy = py + 0.5;
    let t = len2 > 1e-6 ? ((cx - x) * dx + (cy - y) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const qx = x + dx * t, qy = y + dy * t, r = lerp(ra, rb, t);
    if (r < 0.3) continue;
    const ox = cx - qx, oy = cy - qy;
    const d2 = (ox * ox + oy * oy) / (r * r);
    if (d2 > 1) continue;
    const nx = ox / r, ny = oy / r, nz = Math.sqrt(1 - d2);
    const lum = (nx * L0 + ny * L1 + nz * L2) / LL;
    let i = shadeIdx(n, lum, q.tone);
    if (p.noise > 0 && hash01(px * 7 + 3, py * 13 + 5, 1) < p.noise) i = clamp(i + (hash01(px, py, 2) < 0.5 ? -1 : 1), 0, n - 1);
    const c = p.fx?.(px, py, i, t, ny) ?? p.ramp[i];
    pc.set(px, py, c);
  }
}

function drawPoly(pc: PC, q: P2) {
  const p = q.p, n = p.ramp.length;
  const pts = q.pts!;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const t of pts) { minX = Math.min(minX, t[0]); maxX = Math.max(maxX, t[0]); minY = Math.min(minY, t[1]); maxY = Math.max(maxY, t[1]); }
  pc.poly(pts, (x, y) => {
    const u = (y - minY) / Math.max(1, maxY - minY), v = (x - minX) / Math.max(1, maxX - minX);
    let i = clamp(Math.floor((1 - u * 0.6 - v * 0.2 + 0.05) * n * 0.9) + p.tone, 0, n - 1);
    if (p.noise > 0 && hash01(x * 5 + 1, y * 11 + 2, 3) < p.noise) i = clamp(i + 1, 0, n - 1);
    return p.fx?.(x, y, i, u, v) ?? p.ramp[i];
  });
}

/** Рисует один слой одного вида в кадр F×F: центр по X — F/2, земля — на строке gy. */
export function renderLayer(prims: Prim[], view: number, F: number, gy: number, front: boolean, ox = 0, oy = 0): PC {
  const pc = new PC(F, F);
  const cx = F / 2 + ox, cy = gy + oy;
  const list: P2[] = [];
  const bit = BIT[view];
  for (const p of prims) {
    if (!(p.views & bit)) continue;
    const isFront = !!(p.front & bit);
    if (isFront !== front) continue;
    if (p.k === "poly") {
      const ps = p.pts!.map((v) => proj(view, v));
      const d = ps.reduce((s, t) => s + t[2], 0) / ps.length + p.bias;
      list.push({ tone: 0, x: 0, y: 0, x2: 0, y2: 0, ra: 0, rb: 0, d, p, pts: ps.map((t) => [cx + t[0], cy + t[1]] as [number, number]) });
      continue;
    }
    const a = proj(view, p.a), b = p.b ? proj(view, p.b) : a;
    const side = view === 2;
    const ra = side ? p.ra : p.wa * cfg.lat * 0.92, rb = side ? p.rb : p.wb * cfg.lat * 0.92;
    const far = side && (p.a[0] + (p.b ? p.b[0] : p.a[0])) / 2 < -0.8 ? -1 : 0;
    list.push({ tone: p.tone + far, x: cx + a[0], y: cy + a[1], x2: cx + b[0], y2: cy + b[1], ra, rb, d: (a[2] + b[2]) / 2 + p.bias, p });
  }
  list.sort((u, v) => u.d - v.d);
  for (const q of list) {
    if (q.p.k === "poly") drawPoly(pc, q);
    else if (q.p.k === "dot") pc.ellipse(q.x, q.y, Math.max(0.7, q.ra), Math.max(0.7, q.ra), q.p.col!);
    else drawCap(pc, q);
  }
  return pc;
}

/** Двухсегментная IK в плоскости (Y, Z): возвращает колено; pole = +1 колено вперёд (+Y), −1 назад. */
export function ik2(hip: V3, foot: V3, l1: number, l2: number, pole: number): V3 {
  const dy = foot[1] - hip[1], dz = foot[2] - hip[2];
  let d = Math.hypot(dy, dz);
  const dd = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  d = d || 1;
  const ux = dy / d, uz = dz / d;
  // перпендикуляр: (−uz, ux) смотрит «вперёд» при направлении вниз
  let py = -uz, pz = ux;
  if (py * pole < 0) { py = -py; pz = -pz; }
  return [lerp(hip[0], foot[0], 0.5), hip[1] + ux * a + py * h, hip[2] + uz * a + pz * h];
}
