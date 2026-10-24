/**
 * Рунолит Безмолвный, страж древних курганов (задача 136, шаг 3): процедурный пиксель-арт тем же способом и на том же
 * уровне, что пилот-древень (tools/gen/zone-bosses-art.ts). Карточка — data/zone-bosses.json, id sol_rune_golem; образец
 * tools/out/refs/bosses/16.png — только для сравнения. В игру пока не подключён: механика — шаг 4.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "./canvas";
import type { ZView } from "./zone-bosses-art";

const N = 64;
const CX = 32, GY = 60;
/** Наклон камеры, как у пилота: чуть сверху — видны верхние грани глыб. */
const CAM = (14 * Math.PI) / 180;
const CS = Math.cos(CAM), SN = Math.sin(CAM);
/** Подъём в мире на PX — ровно 1 px кадра по вертикали. */
const PX = 1 / CS;
const VIEWS: ZView[] = ["down", "up", "side"];

// ---------------- палитра ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Серо-бежевый камень: глубокая щель → тень → середина → свет → блик. Тени холоднее (лиловее), свет теплее. */
/**
 * Камень — четыре глыбы разного тона (карточка): голова и плечи — самые светлые и тёплые, руки — нейтральные,
 * корпус — холоднее и глуше (руки на его фоне читаются и вбок), ноги и таз — тёмные: низ тяжелее.
 */
const STONE_HEAD = R("#2a2428", "#5a5050", "#938671", "#bfb18f", "#e2d6b2");
const STONE_ARMS = R("#28232a", "#544c4f", "#887e6d", "#b1a68c", "#d6cbab");
const STONE_BODY = R("#252128", "#4d464b", "#7a7166", "#a0957e", "#c5ba9c");
const STONE_LEGS = R("#211d22", "#443e43", "#6b6259", "#918774", "#b4aa8f");
/** Бирюзовый свет глаз (акцент чар — P.enchant). */
const EYE = R("#14706c", "#2ccdbd", "#8ef6e4", "#eafffb");
/** Светло-золотые руны. */
const RUNE = R("#8c6420", "#d6a443", "#f7d97a", "#fff7d6");
const DUST = R("#4b4640", "#7b7368", "#a69c89", "#cdc4ad");
const OUT = hex("#17131b");

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
const lerpV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

/** Поворот вектора: крен (вокруг Y, верх уходит вправо), наклон (вокруг X, верх уходит вперёд), разворот (вокруг Z). */
function rot(v: V3, pitch: number, yaw: number, roll = 0): V3 {
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
function perp(axis: V3, v: V3): V3 {
  const w = norm(axis);
  const q = sub(v, mul(w, dot(v, w)));
  return vlen(q) < 1e-3 ? norm(cross(w, Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])) : norm(q);
}
function ik(a: V3, b: V3, l1: number, l2: number, pole: V3): V3 {
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

// ---------------- вид и камера ----------------
function toView(view: ZView, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
function fromView(view: ZView, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
const scr = (p: V3): [number, number] => [CX + p[0], GY + SN * p[1] - CS * p[2]];
const depthOf = (p: V3) => -(CS * p[1] + SN * p[2]);
/** Свет сверху слева и чуть спереди (в пространстве вида) — как у пилота. */
const LIGHT: V3 = norm([-0.58, 0.42, 0.7]);
function snapPx(view: ZView, w: V3): V3 {
  const v = toView(view, w);
  const sx = Math.round(v[0]), sy = Math.round(SN * v[1] - CS * v[2]);
  return fromView(view, [sx, 0, -sy * PX]);
}
const pxToWorld = (view: ZView, dx: number, dy: number): V3 => fromView(view, [dx, 0, -dy * PX]);

// ---------------- примитивы ----------------
const M_HEAD = 0, M_ARMS = 1, M_BODY = 2, M_LEGS = 3;
interface MatDef { ramp: Ramp; base: number; gain: number; lo: number; hi: number }
/**
 * Тон = base + gain·(n·L): грань к зрителю — середина (2), левая и верхняя — свет (3), фаска сверху слева — блик (4),
 * правая — тень (1). Ниже lo — только глубокие щели.
 */
const MATS: MatDef[] = [
  { ramp: STONE_HEAD, base: 0.7, gain: 3.3, lo: 1, hi: 4 },
  { ramp: STONE_ARMS, base: 0.7, gain: 3.3, lo: 1, hi: 4 },
  { ramp: STONE_BODY, base: 0.7, gain: 3.3, lo: 1, hi: 4 },
  { ramp: STONE_LEGS, base: 0.7, gain: 3.3, lo: 1, hi: 4 },
];
/** Верхние грани глыб светлее (свет сверху): к тону прибавка до TOP_UP при n·z вида выше 0,55. */
const TOP_UP = 0.75;
/** Падающая тень от глыб (плечи нависают над руками): на тон с небольшим. */
const SHADOW = 0.85;
/** Тень падает только от близких граней: плечо затеняет верх руки, а не всю руку до кулака. */
const SHADOW_LEN = 7;

interface Prim {
  /** 0 — конус со скруглёнными концами, 1 — эллипсоид, 2 — гранёный блок (скруглённый параллелепипед со срезами) */
  k: number;
  a: V3; b: V3; ra: number; rb: number;
  ax: [V3, V3, V3]; r: V3;
  /** блок: радиус скругления рёбер и срезы — плоскости [nx, ny, nz, d] в местных осях */
  round: number; cuts: number[][];
  mat: number; g: number; part: number; tone: number; seed: number;
  sph: boolean; ba: V3; l2: number; rr: number; a2: number; il2: number; len: number; bc: V3; br: number;
}
/** Срез блока: [sx, sy, sz, глубина] — угол или ребро в сторону (sx, sy, sz) срезается плоскостью на глубину. */
type Cut = [number, number, number, number];
interface Opt { mat?: number; part?: number; tone?: number; seed?: number; round?: number; cuts?: Cut[]; chips?: number }

/** Штамп в целых пикселях у точки на поверхности: глаза, руна, трещина. */
interface Stamp { kind: "eyes" | "rune" | "crack"; at: V3; n: V3; part: number; glow: number; v: number; halo?: number; alt?: number }
interface Mote { p: V3; col: RGBA; dark?: RGBA; size?: number }
interface Puff { c: V3; k: number; seed: number }

class Scene {
  prims: Prim[] = [];
  gk: number[] = [];
  stamps: Stamp[] = [];
  motes: Mote[] = [];
  puffs: Puff[] = [];
  smears: { pts: V3[]; arm: number; rune: boolean }[] = [];
  flash: { at: V3; k: number; kind: number } | null = null;
  armG: [number, number] = [-1, -1];
  parts = 0;
  seeds = 0;
  group(k = 0): number {
    this.gk.push(k);
    return this.gk.length - 1;
  }
  newPart() {
    return 1000 + this.parts++;
  }
  private base(k: number, g: number, o: Opt): Prim {
    return {
      k, a: [0, 0, 0], b: [0, 0, 0], ra: 0, rb: 0, ax: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], r: [0, 0, 0], round: 0, cuts: [],
      mat: o.mat ?? M_BODY, g, part: o.part ?? this.newPart(), tone: o.tone ?? 0, seed: o.seed ?? 0,
      sph: false, ba: [0, 0, 0], l2: 0, rr: 0, a2: 0, il2: 0, len: 0, bc: [0, 0, 0], br: 0,
    };
  }
  /** Гранёный блок: центр, полуразмеры по местным осям ax (X, Y, Z), срезы углов и рёбер. */
  box(g: number, c: V3, h: V3, ax: [V3, V3, V3], o: Opt = {}): Prim {
    const q = this.base(2, g, o);
    q.a = c;
    q.b = c;
    q.ax = ax;
    q.r = h;
    q.round = o.round ?? 0.55;
    q.seed = o.seed ?? ++this.seeds;
    // сколы: 1–2 случайных угла крупной глыбы срезаны — камень рваный, а не кубик
    const cuts: Cut[] = [...(o.cuts ?? [])];
    const big = [...h].sort((a, b) => b - a)[1];
    const nChips = o.chips ?? (big >= 3 ? 2 : 0);
    for (let k = 0; k < nChips; k++) {
      const r3 = (j: number) => hash01(q.seed, k * 5 + j, 913);
      const sg = (j: number) => (r3(j) < 0.5 ? -1 : 1);
      cuts.push([sg(0), sg(1) * (r3(4) < 0.3 ? 0 : 1), sg(2), (0.7 + 1.3 * r3(3)) * Math.min(1.6, big / 4)]);
    }
    q.cuts = cuts.map(([sx, sy, sz, depth]) => {
      const n = norm([sx, sy, sz]);
      return [n[0], n[1], n[2], dot(n, [sx * h[0], sy * h[1], sz * h[2]]) - depth];
    });
    this.prims.push(q);
    return q;
  }
  cone(g: number, a: V3, ra: number, b: V3, rb: number, o: Opt = {}): Prim {
    const q = this.base(0, g, o);
    q.a = a;
    q.b = b;
    q.ra = ra;
    q.rb = rb;
    q.r = [ra, ra, ra];
    this.prims.push(q);
    return q;
  }
}

function prepare(q: Prim, view: ZView | null) {
  if (view) {
    q.a = toView(view, q.a);
    q.b = toView(view, q.b);
    q.ax = [toView(view, q.ax[0]), toView(view, q.ax[1]), toView(view, q.ax[2])];
  }
  if (q.k === 2 || q.k === 1) {
    q.bc = q.a;
    q.br = q.k === 2 ? Math.hypot(q.r[0], q.r[1], q.r[2]) : Math.max(q.r[0], q.r[1], q.r[2]);
    q.len = 2 * q.r[2];
    return;
  }
  q.ba = sub(q.b, q.a);
  q.l2 = dot(q.ba, q.ba);
  q.len = Math.sqrt(q.l2);
  q.rr = q.ra - q.rb;
  q.a2 = q.l2 - q.rr * q.rr;
  q.sph = q.l2 < 1e-4 || q.a2 < 0.05;
  if (q.sph && q.l2 >= 1e-4) {
    if (q.ra < q.rb) q.a = q.b;
    q.ra = Math.max(q.ra, q.rb);
  }
  q.il2 = q.sph ? 0 : 1 / q.l2;
  q.bc = q.sph ? q.a : lerpV(q.a, q.b, 0.5);
  q.br = q.sph ? q.ra : q.len / 2 + Math.max(q.ra, q.rb);
}
/** Крупная глыба: ей одной даётся светлая кромка к свету. */
const bigPrim = (q: Prim) => (q.k === 2 ? [...q.r].sort((a, b) => b - a)[1] >= 3.4 : Math.max(q.ra, q.rb) >= 4);

function sdPrim(q: Prim, x: number, y: number, z: number): number {
  const px = x - q.a[0], py = y - q.a[1], pz = z - q.a[2];
  if (q.k === 2) {
    const A = q.ax, r = q.r, rr = q.round;
    const lx = px * A[0][0] + py * A[0][1] + pz * A[0][2];
    const ly = px * A[1][0] + py * A[1][1] + pz * A[1][2];
    const lz = px * A[2][0] + py * A[2][1] + pz * A[2][2];
    const qx = Math.abs(lx) - r[0] + rr, qy = Math.abs(ly) - r[1] + rr, qz = Math.abs(lz) - r[2] + rr;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    let d = Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - rr;
    for (const c of q.cuts) d = Math.max(d, c[0] * lx + c[1] * ly + c[2] * lz - c[3]);
    return d;
  }
  if (q.k === 1) {
    const A = q.ax, r = q.r;
    const lx = (px * A[0][0] + py * A[0][1] + pz * A[0][2]) / r[0];
    const ly = (px * A[1][0] + py * A[1][1] + pz * A[1][2]) / r[1];
    const lz = (px * A[2][0] + py * A[2][1] + pz * A[2][2]) / r[2];
    const k0 = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const k1 = Math.sqrt((lx / r[0]) ** 2 + (ly / r[1]) ** 2 + (lz / r[2]) ** 2);
    return k1 < 1e-6 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
  }
  if (q.sph) return Math.sqrt(px * px + py * py + pz * pz) - q.ra;
  const bx = q.ba[0], by = q.ba[1], bz = q.ba[2], l2 = q.l2;
  const yy = px * bx + py * by + pz * bz;
  const zz = yy - l2;
  const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yy * yy * l2, z2 = zz * zz * l2;
  const k = Math.sign(q.rr) * q.rr * q.rr * x2;
  if (Math.sign(zz) * q.a2 * z2 > k) return Math.sqrt(x2 + z2) * q.il2 - q.rb;
  if (Math.sign(yy) * q.a2 * y2 < k) return Math.sqrt(x2 + y2) * q.il2 - q.ra;
  return (Math.sqrt(x2 * q.a2 * q.il2) + yy * q.rr) * q.il2 - q.ra;
}

let lastBest = -1;
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

/** Глыбы эффекта мира (земля сверху без сжатия): верхние грани тоже «смотрят» на зрителя — пятна и штампы на них. */
let fxMode = false;
/** Тон по глубине: доля тона на пиксель глубины и глубина середины фигуры (передняя грань груди). */
const DEPTH_K = 0.045, DEPTH_REF = -12.5;
/** Пятна камня: размер пятна (px). */
const MOTTLE = 2.4;
/** Гладкий шум 0..1 по целочисленной решётке (трилинейно). */
function vnoise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const hv = (i: number, j: number, k: number) => hash01(x0 + i + 97 * (z0 + k), y0 + j, seed * 31 + 7);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(hv(0, 0, 0), hv(1, 0, 0), sx), l(hv(0, 1, 0), hv(1, 1, 0), sx), sy),
    l(l(hv(0, 0, 1), hv(1, 0, 1), sx), l(hv(0, 1, 1), hv(1, 1, 1), sx), sy),
    sz,
  );
}

// ---------------- кадр ----------------
interface GBuf { prim: Int32Array; t: Float32Array; n: Float32Array; p: Float32Array }

function raster(prims: Prim[], gk: number[]): GBuf {
  const n = prims.length;
  const rx0 = new Float32Array(n), ry0 = new Float32Array(n), rx1 = new Float32Array(n), ry1 = new Float32Array(n), tc = new Float32Array(n), tr = new Float32Array(n);
  prims.forEach((q, i) => {
    const [sx, sy] = scr(q.bc);
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
    const X = sx - CX, Y0 = SN * (sy - GY), Z0 = -CS * (sy - GY);
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
    const e = 0.4;
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
  const o = add(p, add(mul(n, 0.7), mul(LIGHT, 0.5)));
  let nc = 0;
  for (let i = 0; i < prims.length; i++) {
    const q = prims[i];
    const w = sub(q.bc, o);
    const s = clamp(dot(w, LIGHT), 0, SHADOW_LEN);
    const d = vlen(sub(w, mul(LIGHT, s)));
    if (d < q.br + gk[q.g] + 0.3) cand[nc++] = i;
  }
  if (!nc) return false;
  let s = 0;
  for (let it = 0; it < 60; it++) {
    const d = sdScene(prims, gk, cand, nc, o[0] + LIGHT[0] * s, o[1] + LIGHT[1] * s, o[2] + LIGHT[2] * s);
    if (d < 0.04) return true;
    s += Math.max(d * 0.9, 0.08);
    if (s > SHADOW_LEN) break;
  }
  return false;
}

interface Look { mat: Uint8Array; idx: Int8Array; part: Int32Array; lum: Float32Array }

function shade(prims: Prim[], gk: number[], gb: GBuf): Look {
  const L: Look = { mat: new Uint8Array(N * N), idx: new Int8Array(N * N).fill(-1), part: new Int32Array(N * N).fill(-1), lum: new Float32Array(N * N) };
  const tone = new Float32Array(N * N);
  const deep = new Uint8Array(N * N);
  const cand = new Int32Array(prims.length);
  for (let i = 0; i < N * N; i++) {
    const pi = gb.prim[i];
    if (pi < 0) continue;
    const q = prims[pi];
    const n: V3 = [gb.n[i * 3], gb.n[i * 3 + 1], gb.n[i * 3 + 2]];
    const p: V3 = [gb.p[i * 3], gb.p[i * 3 + 1], gb.p[i * 3 + 2]];
    const mat = q.mat;
    const md = MATS[mat];
    const lum = dot(n, LIGHT);
    L.lum[i] = lum;
    let tn = md.base + md.gain * lum + q.tone + TOP_UP * clamp((n[2] - 0.55) / 0.3, 0, 1);
    // пятна камня: шум в местных осях глыбы — при сдвиге глыбы на целые пиксели рисунок тот же, не «кипит»
    if (q.k === 2 && n[1] * CS + n[2] * SN > (fxMode ? 0.1 : 0.3)) {
      const d = sub(p, q.a);
      const lx = dot(d, q.ax[0]), ly = dot(d, q.ax[1]), lz = dot(d, q.ax[2]);
      const m = vnoise3(lx / MOTTLE, ly / MOTTLE, lz / MOTTLE, q.seed);
      if (m > 0.66) tn -= 0.6;
      else if (m < 0.24) tn += 0.4;
    }
    if (shadowAt(prims, gk, cand, p, n)) tn -= SHADOW;
    let ao = 0;
    for (const hh of [1.1, 2.4]) {
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
    // глубина: ближнее к зрителю чуть светлее, дальнее темнее — рука отделяется от корпуса, верх светлее низа
    if (!fxMode) tn += clamp(-DEPTH_K * (gb.t[i] - DEPTH_REF), -0.5, 0.5);
    deep[i] = ao > 1.3 ? 1 : 0;
    tn = Math.min(tn, md.hi + 0.49);
    tn = Math.max(tn, (deep[i] ? md.lo - 1 : md.lo) - 0.4);
    tone[i] = tn;
    L.mat[i] = mat;
    L.part[i] = q.part;
  }
  {
    const src = new Float32Array(tone);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0) continue;
      let sum = src[i] * 4, w = 4;
      for (const [dx, dy, k] of [[1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2], [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const j = yy * N + xx;
        if (gb.prim[j] < 0 || L.part[j] !== L.part[i] || L.mat[j] !== L.mat[i]) continue;
        sum += src[j] * k;
        w += k;
      }
      tone[i] = sum / w;
    }
  }
  const T2 = new Float32Array(tone);
  const bgAt = (x: number, y: number) => x < 0 || y < 0 || x >= N || y >= N || gb.prim[y * N + x] < 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0) continue;
    const md = MATS[L.mat[i]];
    let tn = tone[i];
    const edge = bgAt(x - 1, y) || bgAt(x + 1, y) || bgAt(x, y - 1) || bgAt(x, y + 1);
    if (!edge) {
      let seam = 99;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * N + x + dx;
        const other = L.part[j] !== L.part[i];
        const dz = gb.t[i] - gb.t[j];
        // шов: соседняя глыба ближе — тон тени; глыба намного ближе (рука перед корпусом) — глубокая щель
        if (other && dz > 5) seam = Math.min(seam, 0.45);
        else if (other && (dz > 0.6 || (Math.abs(dz) <= 0.6 && L.part[i] < L.part[j]))) seam = Math.min(seam, 1.3);
        else if (!other && dz > 4.5) seam = Math.min(seam, 1.3);
      }
      tn = Math.min(tn, seam);
      // почти чёрный — только щель между разными глыбами (сустав внутри одной детали — не темнее тени)
      if (deep[i] && seam < 99) tn = Math.min(tn, 0.3);
    }
    {
      const q = prims[gb.prim[i]];
      let rimL = false;
      for (const [xx, yy] of [[x - 1, y], [x, y - 1]]) {
        if (bgAt(xx, yy)) { rimL = true; continue; }
        const j = yy * N + xx;
        if (L.part[j] !== L.part[i] && gb.t[j] > gb.t[i] + 1.2) rimL = true;
      }
      if (rimL && bigPrim(q) && L.lum[i] > 0.2 && tn > 1.2) tn = Math.max(tn, Math.min(tn + 1, 3.45));
    }
    if (edge) tn = Math.max(tn, md.lo - 0.4);
    T2[i] = tn;
  }
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    const md = MATS[L.mat[i]];
    L.idx[i] = clamp(Math.round(T2[i]), 0, md.ramp.length - 1);
  }
  despeckle(L, gb);
  return L;
}

function despeckle(L: Look, gb: GBuf) {
  for (let pass = 0; pass < 2; pass++) {
    const src = new Int8Array(L.idx);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0) continue;
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

function sealPinholes(c: PC, byNeighbors = false) {
  const A = (x: number, y: number) => c.alpha(x, y) >= 128;
  const seen = new Uint8Array(N * N);
  const stack: number[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if ((x === 0 || y === 0 || x === N - 1 || y === N - 1) && !A(x, y)) { seen[y * N + x] = 1; stack.push(y * N + x); }
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % N, y = (i / N) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      const j = yy * N + xx;
      if (seen[j] || A(xx, yy)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  for (let i = 0; i < N * N; i++) {
    if (seen[i] || A(i % N, (i / N) | 0)) continue;
    const comp: number[] = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) {
      const x = comp[k] % N, y = (comp[k] / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const j = yy * N + xx;
        if (seen[j] || A(xx, yy)) continue;
        seen[j] = 1;
        comp.push(j);
      }
    }
    if (comp.length > 3) continue;
    for (const j of comp) {
      const x = j % N, y = (j / N) | 0;
      let col: RGBA = OUT;
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
}

// ---------------- поза ----------------
interface Pose {
  /** сдвиг тела: x — вправо от голема, y — вперёд (в кадре — на целые пиксели) */
  root: V3;
  /** таз выше/ниже покоя (мир; в кадре — на целые пиксели) */
  bob: number;
  /** дыхание: подъём груди с плечами и головой и головы сверх груди — целые пиксели кадра */
  chest: number; headZ: number;
  /** корпус: наклон вперёд, разворот, крен (рад); голова относительно корпуса */
  pitch: number; yaw: number; roll: number;
  hp: number; hy: number; hr: number;
  /** запястья в мире: [правое, левое]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** щиколотки в мире и наклон ступни (носок вверх > 0) */
  foot: [V3, V3]; toe: [number, number];
  /** подъём руки целиком — целые пиксели кадра (дрожь в удержании без пересчёта руки) */
  armLift: [number, number];
  /** свечение глаз и рун 0..1.5; руна груди сверх общего (пульс) 0..1; руна правого кулака 0..1.5 */
  glow: number; chestGlow: number; fistGlow: number;
  /** пыль от шага [пр, лев] 0..1 (1 — касание); вспышка удара 0..1; крошка и пыль у кулаков после удара о землю 0..1 */
  dust: [number, number]; flash: number; clods: number;
  /** камешки сыплются с поднятого кулака (удержание) 0..1 */
  pebbles: number;
  /** гибель: распад на глыбы 0..1 */
  crumble: number;
  /** след удара: путь кулака (мир) и чья рука; trail2 — след левой руки, когда бьют обе; золотой след — кулак рун */
  trail?: V3[]; trailArm?: number; trail2?: V3[]; trailRune?: boolean;
  /** пыль у кулака при ударе 0..1 */
  puff?: number;
  /** где вспышка: 0 — у кулака trailArm, 1 — между кулаками (хлопок), 2 — на руне груди (пульс) */
  flashAt?: number;
  /** фаза кадра 0..1 и номер кадра — для частиц */
  t: number; seed: number;
}
const REST_HAND: [V3, V3] = [[21.0, 4.2, 16.6], [-21.0, 4.2, 16.6]];
const REST: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.1, yaw: 0, roll: 0, hp: -0.06, hy: 0, hr: 0,
  hand: REST_HAND, pole: [[0.5, -1, 0], [-0.5, -1, 0]],
  foot: [[7.4, 2.8, 4.6], [-7.4, -2.2, 4.6]], toe: [0, 0],
  armLift: [0, 0], glow: 0.9, chestGlow: 0, fistGlow: 0, dust: [0, 0], flash: 0, clods: 0, pebbles: 0, crumble: 0, t: 0, seed: 1,
};

const HIP0 = 17;
/** Вбок: корпус и голова повёрнуты к зрителю (три четверти). */
let SIDE_YAW = 0.4, SIDE_HEAD = 0.15, SIDE_HAND = 1.5, SIDE_PITCH = 0.1, SIDE_ARMS = 1;
/**
 * Вбок ближняя рука висит под плечом по центру корпуса, а не за спиной (иначе она читается горбом): ближнее плечо
 * сдвинуто вперёд по корпусу на SIDE_NEAR_FWD, кисть — туда же и выше на SIDE_NEAR_UP (кулак на уровне таза, как у древня).
 */
let SIDE_NEAR_FWD = 7, SIDE_NEAR_UP = 7, SIDE_NEAR_BACK = 2;
/** Вбок корпус светлее на столько тона: грудь, плечи-руки и ноги — четыре разные глыбы, а не одна тёмная масса. */
let SIDE_BODY_TONE = 0.45;
export function setSide(a: number, b: number, c = 2, d = 0.1, e = 1, f = SIDE_NEAR_FWD, g = SIDE_NEAR_UP, h = SIDE_NEAR_BACK, k = SIDE_BODY_TONE) {
  SIDE_YAW = a; SIDE_HEAD = b; SIDE_HAND = c; SIDE_PITCH = d; SIDE_ARMS = e; SIDE_NEAR_FWD = f; SIDE_NEAR_UP = g; SIDE_NEAR_BACK = h; SIDE_BODY_TONE = k;
}
const NECK: V3 = [0, 4.2, 41.5];
const ARM: [number, number] = [10.4, 10.4];
const LEG: [number, number] = [6.6, 6.6];

/** Оси блока вдоль кости a → b: Z — вдоль кости, X — наружу, Y — вперёд. */
function boneAxes(a: V3, b: V3, outward: V3, fwd: V3): [V3, V3, V3] {
  const z = norm(sub(b, a));
  const x = perp(z, outward);
  let y = cross(z, x);
  if (dot(y, fwd) < 0) y = mul(y, -1);
  return [x, y, z];
}

/** Лёгкий наклон глыбы (детерминированный): грани не по линейке, тон граней разный — камень, а не кирпич. */
const tilt = (seed: number, amt = 0.1): [number, number, number] => [
  (hash01(seed, 1, 71) - 0.5) * 2 * amt, (hash01(seed, 2, 71) - 0.5) * 2 * amt, (hash01(seed, 3, 71) - 0.5) * 2 * amt,
];
/**
 * Трещины на грани блока: грань (ось 0/1/2 и знак), точка на ней в долях полуразмеров (u — по первой из оставшихся осей,
 * v — по второй), рисунок. Штамп ляжет только на пиксели этого блока.
 */
type CrackDef = [number, number, number, number, number];
function addCracks(S: Scene, q: Prim, defs: CrackDef[]) {
  for (const [axis, sign, u, v, pat] of defs) {
    const o = [0, 1, 2].filter((k) => k !== axis);
    let at: V3 = add(q.a, mul(q.ax[axis], sign * q.r[axis]));
    at = add(at, mul(q.ax[o[0]], u * q.r[o[0]]));
    at = add(at, mul(q.ax[o[1]], v * q.r[o[1]]));
    S.stamps.push({ kind: "crack", at, n: mul(q.ax[axis], sign), part: q.part, glow: 0, v: pat });
  }
}

function golem(p0: Pose, view: ZView): Scene {
  const S = new Scene();
  // вбок: кисти чуть дальше вперёд — кулак выступает перед ногами, а не ложится на бедро
  const p: Pose = view === "side"
    ? {
      ...p0, yaw: p0.yaw - SIDE_YAW, hy: p0.hy - SIDE_HEAD, pitch: p0.pitch + SIDE_PITCH, hp: p0.hp - SIDE_PITCH * 0.6,
      // кисти и локти поворачиваются вместе с корпусом (руки висят от плеч, а не тянутся к прежним точкам); ноги — в профиль
      // поворачивается только точка покоя кисти; смещение удара от неё — нет (удар вбок идёт вправо, к цели)
      hand: p0.hand.map((v, i) => {
        const h = add(add(v, sub(rot(REST_HAND[i], 0, -SIDE_YAW * SIDE_ARMS), REST_HAND[i])), [0, SIDE_HAND, 0]);
        // подъём — только опущенной кисти (у поднятого кулака руки и так над тазом)
        return i === 0 ? add(add(h, rot([0, SIDE_NEAR_FWD - SIDE_NEAR_BACK, 0], 0, -SIDE_YAW)), [0, 0, SIDE_NEAR_UP * clamp((30 - v[2]) / 13, 0, 1)]) : h;
      }) as [V3, V3],
      pole: p0.pole.map((v) => rot(v, 0, -SIDE_YAW * SIDE_ARMS)) as [V3, V3],
    }
    : p0;
  const pel: V3 = add([0, 0, HIP0], snapPx(view, [p.root[0], p.root[1], p.bob + p.root[2]]));
  const up = p.chest * PX, hz = p.headZ * PX;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  const T = (v: V3, lift = v[2] >= 24): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PR = (v: V3): V3 => rot(v, 0, p.yaw * 0.35, p.roll * 0.5);
  const PV = (v: V3): V3 => add(pel, PR(sub(v, [0, 0, HIP0])));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  /** Оси блока: поворот f (корпус, голова) и собственный наклон блока [наклон, разворот, крен]. */
  const axes = (f: (v: V3) => V3, tl: [number, number, number] = [0, 0, 0]): [V3, V3, V3] => [
    f(rot([1, 0, 0], tl[0], tl[1], tl[2])), f(rot([0, 1, 0], tl[0], tl[1], tl[2])), f(rot([0, 0, 1], tl[0], tl[1], tl[2])),
  ];
  const sides: [number, number][] = [[0, 1], [1, -1]];
  /** вбок: ближнее (правое) плечо — вперёд по корпусу */
  const nf = (s: number) => (view === "side" && s > 0 ? SIDE_NEAR_FWD : 0);
  const bt = view === "side" ? SIDE_BODY_TONE : 0;

  // ---------- ноги-столбы и таз: тёмный камень ----------
  const gLeg = S.group();
  S.box(gLeg, PV([0, -0.4, 18.6]), [8.0, 5.8, 3.0], axes(PR), { mat: M_LEGS, cuts: [[1, 0, -1, 2.2], [-1, 0, -1, 2.2], [0, 1, 1, 1.0]] });
  for (const [i, s] of sides) {
    const hip = PV([s * 6.8, 0.2, 16.2]);
    const an = p.foot[i];
    const kn = ik(hip, an, LEG[0], LEG[1], [s * 0.15, 1, 0.1]);
    const ax1 = boneAxes(hip, kn, [s, 0, 0], [0, 1, 0]);
    const legPart = S.newPart();
    const th = S.box(gLeg, lerpV(hip, kn, 0.45), [5.0, 5.0, LEG[0] / 2 + 1.4], ax1, { mat: M_LEGS, part: legPart, cuts: [[1, 1, 0, 1.4], [-1, 1, 0, 1.4], [0, 1, -1, 1.4]] });
    addCracks(S, th, [[1, 1, s * 0.25, 0.1, 1]]);
    const ax2 = boneAxes(kn, an, [s, 0, 0], [0, 1, 0]);
    S.box(gLeg, lerpV(kn, an, 0.55), [4.5, 4.6, LEG[1] / 2 + 0.4], ax2, { mat: M_LEGS, part: legPart, cuts: [[1, 1, 0, 1.2], [-1, 1, 0, 1.2]], tone: 0.15 });
    const tp = p.toe[i];
    const fax = axes((v) => v, [tp, s * 0.06, 0]);
    S.box(gLeg, add(an, rot([0, 1.8, -2.3], tp, 0)), [5.4, 6.6, 2.3], fax, { mat: M_LEGS, cuts: [[0, 1, 1, 1.9], [1, 1, 0, 1.8], [-1, 1, 0, 1.8]], tone: 0.25 });
  }

  // ---------- корпус: глыба груди, две пластины груди, пластины спины ----------
  const gBody = S.group();
  const torso = S.box(gBody, T([0, 0.2, 30.4]), [11.2, 8.0, 8.4], axes(TV), {
    mat: M_BODY, cuts: [[1, 0, -1, 4.8], [-1, 0, -1, 4.8], [0, 1, 1, 1.6], [0, -1, 1, 1.6], [1, 1, 0, 1.6], [-1, 1, 0, 1.6], [1, -1, 0, 1.4], [-1, -1, 0, 1.4]], tone: bt,
  });
  addCracks(S, torso, [[1, 1, 0.1, -0.55, 4], [0, 1, 0.2, -0.2, 3], [1, 1, -0.45, -0.35, 0]]);
  const pecs: number[] = [];
  for (const [i, s] of sides) {
    const pp = S.box(gBody, T([s * 5.7, 7.9, 33.4]), [5.2, 1.7, 4.2], axes(TV, tilt(10 + i, 0.07)), {
      mat: M_BODY, cuts: [[s, 0, -1, 2.6], [0, 1, 1, 1.0], [s, 1, 0, 1.0], [-s, 1, -1, 1.0]], tone: 0.2 + bt,
    });
    pecs.push(pp.part);
    if (s > 0) addCracks(S, pp, [[1, 1, 0.3, 0.35, 0]]);
  }
  const blades: number[] = [];
  for (const [i, s] of sides) {
    const bp = S.box(gBody, T([s * 5.6, -7.8, 33.0]), [5.0, 1.6, 4.4], axes(TV, tilt(14 + i, 0.07)), {
      mat: M_BODY, cuts: [[s, 0, -1, 2.4], [0, -1, 1, 1.0], [s, -1, 0, 1.0]], tone: 0.15 + bt,
    });
    blades.push(bp.part);
    if (s < 0) addCracks(S, bp, [[1, -1, -0.2, 0.3, 0]]);
  }

  // ---------- столбы за плечами: торчат вверх и наружу (как на образце), справа два, слева один ----------
  const gBack = S.group();
  const pillar = (x: number, y: number, z: number, len: number, w: number, roll: number, pitch: number, tone: number) =>
    S.box(gBack, T([x, y, z + len * 0.5]), [w, w * 0.85, len], axes(TV, [pitch, 0, roll]), {
      mat: M_BODY, cuts: [[Math.sign(roll) || 1, 0, 1, w * 0.95], [-(Math.sign(roll) || 1), 0, 1, w * 0.4], [0, 1, 1, w * 0.4]], tone,
    });
  pillar(12.4, -7.4, 44.2, 6.8, 2.4, 0.26, -0.3, 0.35);
  pillar(19.6, -6.2, 43.4, 4.4, 2.0, 0.6, -0.25, 0.2);
  pillar(-14.0, -7.2, 44.0, 6.0, 2.6, -0.42, -0.32, 0.3);

  // ---------- голова: узкая угловатая глыба, макушка расколота на два острия, тяжёлая бровь, прорезь глаз ----------
  const gHead = S.group();
  /** голова выдвинута вперёд, лицо — вровень с пластинами груди (как на образце: голова «утоплена» между плеч) */
  const h = (x: number, y: number, z: number) => H([x, y + 3.0, z + 1.6]);
  // клин к подбородку, верхние углы сколоты; бровь — отдельная плита, чуть к свету
  const head = S.box(gHead, h(0, 3.0, 45.6), [4.4, 4.0, 4.6], axes(HV), {
    mat: M_HEAD, cuts: [[1, 0, -1, 2.4], [-1, 0, -1, 2.4], [1, 0, 1, 1.4], [-1, 0, 1, 1.4], [0, -1, 1, 1.4], [0, 1, -1, 1.0]],
  });
  S.box(gHead, h(0, 6.8, 47.7), [5.0, 1.3, 1.1], axes(HV, [0.18, 0, 0]), { mat: M_HEAD, cuts: [[1, 1, 0, 0.8], [-1, 1, 0, 0.8]] });
  // корона из трёх осколков (как на образце): средний выше, крайние отклонены наружу
  S.box(gHead, h(0.3, 2.6, 52.2), [1.9, 2.3, 3.6], axes(HV, [0.06, 0, -0.08]), { mat: M_HEAD, cuts: [[1, 0, 1, 1.9], [-1, 0, 1, 1.2], [0, 1, 1, 1.3]], tone: 0.15, chips: 0 });
  S.box(gHead, h(-3.1, 2.2, 50.4), [1.5, 1.9, 2.5], axes(HV, [0.05, 0, -0.42]), { mat: M_HEAD, cuts: [[-1, 0, 1, 1.4], [1, 0, 1, 0.7], [0, 1, 1, 0.8]], tone: 0.1, chips: 0 });
  S.box(gHead, h(3.3, 2.0, 50.0), [1.4, 1.8, 2.2], axes(HV, [0, 0, 0.48]), { mat: M_HEAD, cuts: [[1, 0, 1, 1.3], [-1, 0, 1, 0.6], [0, 1, 1, 0.8]], tone: 0.1, chips: 0 });
  // шея: перемычка до корпуса (сзади голова не висит в воздухе)
  S.box(gHead, h(0, -0.8, 41.4), [3.2, 3.0, 2.6], axes(HV), { mat: M_BODY, tone: -0.1, chips: 0 });
  S.stamps.push({ kind: "eyes", at: h(0, 7.0, 46.0), n: HV([0, 1, 0]), part: head.part, glow: p.glow, v: 0 });

  // ---------- плечи: две кубические глыбы, выше основания головы ----------
  const shoulders: number[] = [];
  for (const [i, s] of sides) {
    const g = S.group();
    const sq = S.box(g, T([s * 17.0, -1.4 + nf(s), 39.6]), [6.4, 5.8, 5.6], axes(TV, tilt(20 + i, 0.07)), {
      mat: M_HEAD, cuts: [[s, 0, 1, 2.8], [0, 1, 1, 2.0], [0, -1, 1, 1.8], [s, 0, -1, 1.6], [s, 1, 0, 1.5], [s, -1, 0, 1.4], [-s, 1, 1, 1.4]], tone: -0.1,
    });
    shoulders.push(sq.part);
    if (s < 0) addCracks(S, sq, [[1, 1, 0.3, -0.3, 2]]);
  }

  // ---------- руки: плечо (почти скрыто глыбой плеча), предплечье-плита, кулак-глыба ----------
  for (const [i, s] of sides) {
    const g = S.group();
    S.armG[i] = g;
    const lift = pxToWorld(view, 0, -p.armLift[i]);
    const sh = add(T([s * 18.0, nf(s), 37.2]), lift);
    const wr = add(p.hand[i], lift);
    const el = ik(sh, wr, ARM[0], ARM[1], p.pole[i]);
    const a1 = boneAxes(sh, el, TV([s, 0, 0]), TV([0, 1, 0]));
    const armPart = S.newPart();
    S.box(g, lerpV(sh, el, 0.55), [3.9, 3.9, ARM[0] / 2 + 0.4], a1, { mat: M_ARMS, part: armPart, cuts: [[1, 1, 0, 1.0], [-1, 1, 0, 1.0]], tone: -0.2 });
    const a2 = boneAxes(el, wr, TV([s, 0, 0]), TV([0, 1, 0]));
    const fore = S.box(g, lerpV(el, wr, 0.45), [4.6, 4.5, ARM[1] / 2 + 0.2], a2, { mat: M_ARMS, part: armPart, cuts: [[1, 0, -1, 2.2], [-1, 0, -1, 2.2], [0, 1, -1, 1.8], [0, -1, -1, 1.6], [1, 1, 0, 1.0]] });
    addCracks(S, fore, [[1, 1, s * 0.3, -0.1, s > 0 ? 3 : 4]]);
    const fc = add(wr, mul(a2[2], 4.8));
    const fist = S.box(g, fc, [6.4, 5.8, 4.9], a2, { mat: M_ARMS, cuts: [[1, 0, 1, 1.6], [-1, 0, 1, 1.6], [0, 1, 1, 1.6], [0, -1, 1, 1.3], [1, 1, 0, 1.2]], tone: 0.15 });
    addCracks(S, fist, [[1, 1, -0.3, 0.45, 6], [1, 1, 0.25, 0.45, 6]]);
    // руна правого кулака («Кулак рун»): спереди и снаружи; тлеет всегда, разгорается в замахе
    if (s > 0) for (const [ax, u, v] of [[1, 0.1, -0.25], [0, 0.0, -0.25]] as [number, number, number][]) {
      const o = [0, 1, 2].filter((k) => k !== ax);
      let at: V3 = add(fist.a, mul(fist.ax[ax], fist.r[ax]));
      at = add(add(at, mul(fist.ax[o[0]], u * fist.r[o[0]])), mul(fist.ax[o[1]], v * fist.r[o[1]]));
      S.stamps.push({ kind: "rune", at, n: fist.ax[ax], part: fist.part, glow: p.fistGlow, v: 2, alt: 2 });
    }
  }

  // ---------- руны: круг на груди (левая пластина) и на правом плече; на спине — печать ----------
  S.stamps.push({ kind: "rune", at: T([-5.7, 9.6, 33.6]), n: TV([0, 1, 0]), part: pecs[1], glow: p.glow + p.chestGlow * 0.6, v: 0, halo: p.chestGlow });
  // руна плеча — на лицевой или на боковой грани: рисуется та, что сильнее смотрит на зрителя (alt)
  S.stamps.push({ kind: "rune", at: T([17.0, 4.4 + nf(1), 39.2]), n: TV([0, 1, 0]), part: shoulders[0], glow: p.glow, v: 1, alt: 1 });
  S.stamps.push({ kind: "rune", at: T([23.4, -1.4 + nf(1), 39.2]), n: TV([1, 0, 0]), part: shoulders[0], glow: p.glow, v: 1, alt: 1 });
  S.stamps.push({ kind: "rune", at: T([5.6, -9.4, 33.2]), n: TV([0, -1, 0]), part: blades[0], glow: p.glow * 0.85 + p.chestGlow * 0.4, v: 0 });
  if (p.crumble > 0) crumbleScene(S, p.crumble);
  particles(S, p);
  return S;
}

/**
 * Гибель: глыбы разваливаются в груду — каждая падает со своей задержкой (сперва оседают нижние), поворачивается и ложится
 * у основания; верхние глыбы ложатся поверх. Руны и трещины на падающих глыбах не рисуются (свечение уже погасло).
 */
function crumbleScene(S: Scene, k: number) {
  for (const q of S.prims) {
    if (q.k !== 2) continue;
    const h1 = hash01(q.seed, 11, 5), h2 = hash01(q.seed, 12, 5), h3 = hash01(q.seed, 13, 5);
    const zr = clamp(q.a[2] / 56, 0, 1);
    const delay = 0.04 + 0.26 * zr + 0.08 * h1;
    const t = clamp((k - delay) / (1 - delay), 0, 1);
    if (t <= 0) continue;
    // падает с ускорением и ложится чуть раньше конца — последние кадры груда лежит, оседает пыль
    const f = Math.min(1, t / 0.85) ** 2;
    const lie = Math.min(q.r[0], q.r[1], q.r[2]) * 0.9 + 0.3 + zr * 4.5;
    const tgt: V3 = [q.a[0] * 0.9 + (h2 - 0.5) * 4, q.a[1] * 0.7 + 2.5 + (h3 - 0.5) * 6, lie];
    q.a = lerpV(q.a, tgt, f);
    q.b = q.a;
    const a1 = f * (h2 - 0.5) * 1.5, a2 = f * (h3 - 0.5) * 1.1;
    q.ax = q.ax.map((v) => rot(v, a1, 0, a2)) as [V3, V3, V3];
  }
  if (k > 0.3) S.stamps = S.stamps.filter((st) => st.kind === "eyes");
}

// ---------------- штампы ----------------
type StampPx = [number, number, string];
const rows = (rs: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  rs.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") out.push([x0 + i, y0 + j, ch]); }));
  return out;
};
/** Глаза: прорезь (D) с двумя бирюзовыми огнями (3 — ярче, 2 — тусклее). */
const ST_EYES_DOWN = rows(["D32D23D"], -3, 0);
const ST_EYES_SIDE = rows(["D32D2"], -2, 0);
/** Руны: 0 — большой круг на груди, 1 — малый круг на плече. */
const ST_RUNES: StampPx[][] = [
  rows([".222.", "2.3.2", "23332", "2.3.2", ".222."], -2, -2),
  rows([".22.", "2..2", "2.32", ".22."], -2, -2),
  rows([".2.", "232", ".2."], -1, -1),
];

/** Трещины: x — щель (на 1–2 тона темнее грани), l — освещённая кромка щели (на тон светлее). */
const ST_CRACKS: StampPx[][] = [
  // 0 — косая сверху вниз с изломом
  rows(["x..", "x..", ".x.", ".x.", "..x"], -1, -2),
  // 1 — косая в другую сторону
  rows(["..x", ".x.", ".x.", "x.."], -1, -2),
  // 2 — от ребра вниз и вбок
  rows(["x...", ".x..", ".xx.", "...x"], -1, -1),
  // 3 — короткая косая
  rows(["x.", "x.", ".x"], 0, -1),
  // 4 — пологая
  rows(["xx..", "..xx"], -2, 0),
  // 5 — короткая пологая
  rows(["xx.", "..x"], -1, 0),
  // 6 — бороздка между пальцами кулака
  rows(["x", "x"], 0, -1),
];

/** Трещины ложатся в тоны (до перевода в цвет): только на пиксели своей глыбы, грань должна смотреть на зрителя. */
function applyCracks(L: Look, sc: Scene, view: ZView, gb: GBuf, raw = false) {
  for (const st of sc.stamps) {
    if (st.kind !== "crack") continue;
    const a = raw ? st.at : toView(view, st.at), nv = raw ? st.n : toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < (raw ? 0.1 : 0.45)) continue;
    const [sx, sy] = scr(a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    if (gb.prim[i0] < 0 || L.part[i0] !== st.part) continue;
    for (const [dx, dy, key] of ST_CRACKS[st.v]) {
      const x = ax + dx, y = ay + dy;
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      const i = y * N + x;
      if (gb.prim[i] < 0 || L.part[i] !== st.part) continue;
      // у контура не рисуем: щель у края читалась бы вторым тёмным рядом
      if (gb.prim[i - 1] < 0 || gb.prim[i + 1] < 0 || gb.prim[i - N] < 0 || gb.prim[i + N] < 0) continue;
      const v = L.idx[i];
      if (key === "x") L.idx[i] = v >= 3 ? v - 2 : Math.max(0, v - 1);
      else if (key === "l") L.idx[i] = Math.min(4, v + 1);
    }
  }
}

function stampOf(st: Stamp, view: ZView): StampPx[] {
  if (st.kind === "rune") return ST_RUNES[st.v];
  if (st.kind === "eyes") return view === "side" ? ST_EYES_SIDE : view === "down" ? ST_EYES_DOWN : [];
  return [];
}

/** Руны и глаза поверх тона; возвращает точку руны груди в кадре (для вспышки «Пульса»), если она видна. */
function drawStamps(body: PC, sc: Scene, view: ZView, gb: GBuf, L: Look, raw = false): [number, number] | null {
  let chestAt: [number, number] | null = null;
  const glowE = new Float32Array(N * N), glowR = new Float32Array(N * N);
  const emis = new Uint8Array(N * N);
  /** широкий ореол руны груди в «Пульсе»: центр в кадре и сила */
  const halos: [number, number, number][] = [];
  const facing = (st: Stamp) => { const nv = raw ? st.n : toView(view, st.n); return nv[1] * CS + nv[2] * SN; };
  for (const st of sc.stamps) {
    if (st.kind === "crack") continue;
    if (st.alt !== undefined && sc.stamps.some((o) => o !== st && o.alt === st.alt && facing(o) > facing(st))) continue;
    const a = raw ? st.at : toView(view, st.at), nv = raw ? st.n : toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < (raw ? 0.1 : 0.3)) continue;
    const [sx, sy] = scr(a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    // глаза — как у пилота: точка не закрыта ничем ближе; руны — только на своей глыбе
    if (gb.prim[i0] < 0) continue;
    if (st.kind === "eyes" ? gb.t[i0] < depthOf(a) - 2.4 : L.part[i0] !== st.part) continue;
    const g = clamp(st.glow, 0, 1.5);
    if ((st.halo ?? 0) > 0.25) halos.push([ax + 0.5, ay + 0.5, st.halo!]);
    if (st.halo !== undefined) chestAt = [ax + 0.5, ay + 0.5];
    for (const [dx, dy, key] of stampOf(st, view)) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (gb.prim[i] < 0) continue;
      if (key === "D") {
        if (!emis[i]) body.set(x, y, STONE_HEAD[0]);
        emis[i] = 2;
        continue;
      }
      const lv = +key;
      if (st.kind === "rune" && g < 0.35) {
        // погасшая руна — вырезана в камне: на тон темнее грани
        if (L.part[i] === st.part) body.set(x, y, MATS[L.mat[i]].ramp[Math.max(0, L.idx[i] - 1)]);
        emis[i] = 2;
        continue;
      }
      const k = lv - Math.round((1 - Math.min(1, g)) * 3);
      if (k < 0) continue;
      if (st.kind === "eyes") {
        body.set(x, y, EYE[clamp(k + (g > 1.2 ? 1 : 0), 0, 3)]);
        glowE[i] = Math.max(glowE[i], Math.min(1, g) * (lv / 3));
      } else {
        body.set(x, y, RUNE[clamp(k + (g > 1.2 ? 1 : 0), 0, 3)]);
        glowR[i] = Math.max(glowR[i], Math.min(1, g) * (lv / 3) * 0.8);
      }
      emis[i] = 1;
    }
  }
  const blurOf = (m: Float32Array) => {
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        v += m[yy * N + xx] * (dx === 0 || dy === 0 ? 1 : 0.6);
      }
      out[y * N + x] = v / 3.2;
    }
    return out;
  };
  const bE = blurOf(glowE), bR = blurOf(glowR);
  // ореол руны груди: круг света на камне, две ступени, растёт с зарядом
  for (const [hx, hy, k] of halos) {
    const r1 = 2.5 + 3.5 * k, r2 = 1.5 + 2.2 * k;
    for (let y = Math.floor(hy - r1); y <= hy + r1; y++) for (let x = Math.floor(hx - r1); x <= hx + r1; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy);
      if (d > r1) continue;
      const i = y * N + x;
      bR[i] = Math.max(bR[i], d < r2 ? 0.5 : 0.3);
    }
  }
  const GE = hex("#3fe8d4"), GR = hex("#ffcc5a");
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0 || emis[i]) continue;
    const e = bE[i], r = bR[i];
    const lvE = e > 0.42 ? 2 : e > 0.2 ? 1 : 0, lvR = r > 0.42 ? 2 : r > 0.2 ? 1 : 0;
    if (!lvE && !lvR) continue;
    const c = body.get(i % N, Math.floor(i / N))!;
    const t = lvE >= lvR ? GE : GR;
    const k = [0, 0.24, 0.42][Math.max(lvE, lvR)];
    body.set(i % N, Math.floor(i / N), mix(c, [t[0], t[1], t[2], 255], k));
  }
  return chestAt;
}

/** Отладка: каждая глыба своим цветом (номер детали → оттенок). */
export function debugParts(view: ZView, pose: Pose): PC {
  const sc = golem(pose, view);
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) prepare(q, view);
  const gb = raster(prims, sc.gk);
  const out = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    const q = prims[gb.prim[i]];
    const hsh = hash01(q.part, 7, 3), l = 0.45 + 0.4 * Math.max(0, dot([gb.n[i * 3], gb.n[i * 3 + 1], gb.n[i * 3 + 2]], LIGHT));
    const c: RGBA = [Math.round(255 * l * (0.5 + 0.5 * Math.sin(hsh * 6.28))), Math.round(255 * l * (0.5 + 0.5 * Math.sin(hsh * 6.28 + 2.1))), Math.round(255 * l * (0.5 + 0.5 * Math.sin(hsh * 6.28 + 4.2))), 255];
    out.set(i % N, (i / N) | 0, c);
  }
  return out;
}

// ---------------- частицы и вспышки ----------------
/** След удара: каменная пыль (обычный удар, хлопок) и золото рун («Кулак рун»). */
const SMEAR = R("#8e8574", "#d0c7ad", "#f2eddb");
const SMEAR_RUNE = R("#a0762c", "#ecc56c", "#fff4cc");
/** Вспышка удара: кремовое золото, без полупрозрачности. */
const FLASH = R("#e8b850", "#fff0b0", "#fffbea");
/** Каменная крошка: светлый верх, тёмный низ. */
const CHIP: [RGBA, RGBA] = [hex("#a9a18b"), hex("#4c494f")];

/** Частицы: пыль от шага, крошка у кулаков после удара о землю, камешки с поднятого кулака, след, вспышка. */
function particles(S: Scene, p: Pose) {
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) S.puffs.push({ c: [p.foot[i][0], p.foot[i][1] + 1.6, 0], k: p.dust[i], seed: i });
  if (p.clods > 0.02) {
    for (let i = 0; i < 2; i++) {
      const hnd = p.hand[i];
      if (hnd[2] > 14) continue;
      const c: V3 = [hnd[0], hnd[1] + 3, 0];
      S.puffs.push({ c, k: p.clods, seed: 10 + i });
      const f = 1 - p.clods;
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI + 0.25 + i * 0.5;
        const sx = i ? -1 : 1;
        S.motes.push({
          p: [c[0] + Math.cos(ang) * (3 + 8 * f) * sx, c[1] + Math.sin(ang) * 3, 1.5 + 9 * f * (1 - f) * 2.4],
          col: CHIP[0], dark: CHIP[1], size: 2,
        });
      }
    }
  }
  // камешки с поднятого кулака: два, в разной фазе, падают до земли за цикл удержания
  if (p.pebbles > 0.02) {
    const hnd = p.hand[0];
    for (let k = 0; k < 2; k++) {
      const u = (p.t + k * 0.5) % 1;
      const z = Math.max(0.5, hnd[2] - 3 - u * u * (hnd[2] + 2));
      S.motes.push({ p: [hnd[0] + (k ? 3.5 : -2.5), hnd[1] + (k ? 1 : 3), z], col: CHIP[0], dark: CHIP[1], size: 1 });
    }
  }
  if (p.trail && p.trail.length > 1) S.smears.push({ pts: p.trail, arm: p.trailArm ?? 0, rune: !!p.trailRune });
  if (p.trail2 && p.trail2.length > 1) S.smears.push({ pts: p.trail2, arm: 1, rune: !!p.trailRune });
  if ((p.puff ?? 0) > 0.02) {
    const hnd = p.hand[p.trailArm ?? 0];
    S.puffs.push({ c: [hnd[0], hnd[1] + 3, 0], k: p.puff!, seed: 30 });
  }
  if (p.flash > 0.02) {
    const at = p.flashAt ?? 0;
    if (at === 1) S.flash = { at: lerpV(p.hand[0], p.hand[1], 0.5), k: p.flash, kind: 1 };
    else if (at === 2) S.flash = { at: [0, 0, 0], k: p.flash, kind: 2 };
    else {
      const hnd = p.hand[p.trailArm ?? 0];
      S.flash = { at: [hnd[0], hnd[1] + 3, Math.max(1.5, hnd[2] - 4)], k: p.flash, kind: 0 };
    }
  }
}

/** Плоский клуб пыли у земли: 2–3 непрозрачных тона, низ тёмный; расходится в стороны и тает по клубу. */
function drawPuff(o: PC, f: Puff, view: ZView) {
  const [cx, cy0] = scr(toView(view, f.c));
  const cy = Math.min(cy0, 61);
  const t = 1 - f.k;
  for (let k = 0; k < 3; k++) {
    if (hash01(k, f.seed, 6) > f.k * 1.6 - 0.1) continue;
    const dir = k === 0 ? -1 : k === 1 ? 1 : (hash01(f.seed, 2, 9) > 0.5 ? 1 : -1);
    const px = cx + dir * (2.5 + 4.5 * t) + (k === 2 ? dir * -1.5 : 0), py = cy - (k === 2 ? 1.2 : 0) - t * 1.2;
    const rx = 1.6 + 1.2 * f.k + (k === 2 ? -0.4 : 0), ry = Math.max(0.9, rx * 0.55);
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry;
      if (dx * dx + dy * dy > 1) continue;
      o.set(x, y, DUST[dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2]);
    }
  }
}

function drawMote(o: PC, m: Mote, view: ZView, gb: GBuf) {
  const p = toView(view, m.p);
  const [sx, sy] = scr(p);
  const x = Math.floor(sx), y = Math.floor(sy);
  if (x < 0 || y < 0 || x >= N - 1 || y >= N - 1) return;
  const i = y * N + x;
  if (gb.prim[i] >= 0 && gb.t[i] < depthOf(p) - 0.5) return;
  o.set(x, y, m.col);
  if ((m.size ?? 1) > 1) o.set(x + 1, y, m.col);
  if (m.dark) o.set(x + ((m.size ?? 1) > 1 ? 1 : 0), y + 1, m.dark);
}

/**
 * След удара: чёткий серп в 3 тона по пути кулака — позади руки (пиксели самой руки и её контура не трогает),
 * светлая кромка — с внешней стороны дуги, к хвосту серп сужается до пикселя.
 */
function drawSmear(o: PC, sm: { pts: V3[]; arm: number; rune: boolean }, view: ZView, gb: GBuf, prims: Prim[], armG: number) {
  const pts = sm.pts.map((v) => scr(toView(view, v)));
  const col = sm.rune ? SMEAR_RUNE : SMEAR;
  const arm = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && prims[gb.prim[i]].g === armG) arm[i] = 1;
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && arm[yy * N + xx]) return true;
    }
    return false;
  };
  const total = pts.length - 1;
  const put = new Map<number, number>();
  for (let k = 0; k < total; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
    const dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy) || 1;
    let nx = -dy / dl, ny = dx / dl;
    if (nx * (x0 - CX) + ny * (y0 - 36) < 0) { nx = -nx; ny = -ny; }
    for (let s = 0; s <= steps; s++) {
      const u = (k + s / steps) / total;
      const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
      const w = 0.4 + 2.2 * Math.sin(Math.PI * Math.min(1, u * 0.62 + 0.06));
      for (let j = -w; j <= w + 0.01; j += 0.5) {
        const xx = Math.round(x + nx * j), yy = Math.round(y + ny * j);
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const tone = j > w - 0.9 ? 2 : j < -w + 0.9 ? 0 : 1;
        const id = yy * N + xx;
        put.set(id, Math.max(put.get(id) ?? -1, tone));
      }
    }
  }
  for (const [id, tone] of put) {
    const x = id % N, y = (id / N) | 0;
    if (near(x, y)) continue;
    o.set(x, y, col[tone]);
  }
}

/**
 * Вспышка: 0 — удар кулаком (крест с короткими лучами), 1 — хлопок (крест шире, искры в стороны),
 * 2 — пульс рун: лучи из руны груди во все стороны (рисует renderGolem по точке руны).
 */
function drawFlash(o: PC, f: { at: V3; k: number; kind: number }, view: ZView, at?: [number, number]) {
  const [sx, sy] = at ?? scr(toView(view, f.at));
  const x = Math.floor(sx), y = Math.floor(Math.min(sy, 61));
  if (f.kind === 2) {
    const L = Math.round(3 + 4 * f.k), Ld = Math.round(2 + 3 * f.k);
    const ray = (dx: number, dy: number, len: number) => {
      for (let r = 2; r <= len; r++) o.set(x + dx * r, y + dy * r, RUNE[r <= 3 ? 3 : r <= len - 1 ? 2 : 1]);
    };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) ray(dx, dy, L);
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) ray(dx, dy, Ld);
    return;
  }
  const L = Math.round((f.kind === 1 ? 3 : 2) + 3 * f.k);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 2 : r <= L - 1 ? 1 : 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) o.set(x + dx * r, y + dy * Math.min(r, f.kind === 1 ? 3 : 2), FLASH[tone]);
  }
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (f.k > 0.5) o.set(x + dx * 2, y + dy * (f.kind === 1 ? 2 : 1), FLASH[0]);
  o.set(x, y, FLASH[2]);
}

/** Кадр голема в виде view: тело, руны и глаза, контур; затем след удара, пыль, крошка, вспышка. */
export function renderGolem(view: ZView, pose: Pose): PC {
  const sc = golem(pose, view);
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) prepare(q, view);
  const gb = raster(prims, sc.gk);
  const L = shade(prims, sc.gk, gb);
  applyCracks(L, sc, view, gb);
  const body = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    body.set(i % N, Math.floor(i / N), MATS[L.mat[i]].ramp[L.idx[i]]);
  }
  const runeAt = drawStamps(body, sc, view, gb, L);
  body.outline(OUT);
  sealPinholes(body);

  const out = new PC(N, N);
  out.blit(body, 0, 0);
  for (const sm of sc.smears) drawSmear(out, sm, view, gb, prims, sc.armG[sm.arm]);
  for (const f of sc.puffs) drawPuff(out, f, view);
  for (const m of sc.motes) drawMote(out, m, view, gb);
  if (sc.flash) {
    if (sc.flash.kind === 2) { if (runeAt) drawFlash(out, sc.flash, view, runeAt); }
    else drawFlash(out, sc.flash, view);
  }
  sealPinholes(out, true);
  return out;
}

// ---------------- анимации ----------------
const easeInOut = (t: number) => t * t * (3 - 2 * t);
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const linear = (t: number) => t;
type Num = number | boolean | V3 | [V3, V3] | [number, number] | V3[] | undefined;
function lerpAny(a: Num, b: Num, t: number): Num {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return (a as unknown[]).map((v, k) => lerpAny(v as Num, (b as unknown[])[k] as Num, t)) as Num;
  return t < 0.5 ? a : b;
}
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    if (k === "trail" || k === "trailArm" || k === "trail2" || k === "trailRune" || k === "flashAt") continue;
    o[k] = lerpAny(a[k] as Num, b[k] as Num, t);
  }
  return o as unknown as Pose;
}
interface Key { f: number; p: Partial<Pose>; ease?: (t: number) => number }
function poseAt(keys: Key[], f: number): Pose {
  const full = keys.map((k) => ({ ...REST, ...k.p }) as Pose);
  let j = 0;
  while (j < keys.length - 2 && f >= keys[j + 1].f) j++;
  const a = keys[j], b = keys[j + 1];
  const u = clamp((f - a.f) / (b.f - a.f), 0, 1);
  return lerpPose(full[j], full[j + 1], (b.ease ?? easeInOut)(u));
}
function keyed(keys: Key[], n: number, seed: number): Pose[] {
  return Array.from({ length: n }, (_, i) => ({ ...poseAt(keys, i), t: i / n, seed: seed + i }));
}
/** Безье через вынос (кулак идёт дугой, а не по прямой между ключами). */
function arcOf(P0: V3, M: V3, P2: V3) {
  const C = sub(mul(M, 2), mul(add(P0, P2), 0.5));
  return (u: number): V3 => add(add(mul(P0, (1 - u) * (1 - u)), mul(C, 2 * u * (1 - u))), mul(P2, u * u));
}
/** Центр кулака по запястью (кулак — на 4,6 px дальше по предплечью; для следа удара). */
const fistOf = (w: V3, sh: V3) => add(w, mul(norm(sub(w, sh)), 4.8));

/**
 * Покой: тяжёлое дыхание волной снизу вверх — грудь с плечами поднимается на 1 px, голова кадром позже, руки целиком
 * (жёстко, без пересчёта) ещё кадром позже и опускаются последними. Глаза и руны мерцают ступенями.
 */
function idlePoses(n = 12): Pose[] {
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const arms = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n, ph = t * TAU;
    return {
      ...REST, t, seed: 100 + i,
      chest: chest[i], headZ: head[i] - chest[i], armLift: [arms[i], arms[i]] as [number, number],
      glow: 0.85 + 0.2 * Math.sin(ph),
    };
  });
}

/**
 * Ходьба: тяжёлый шаг. Корпус, голова и плечи — один жёсткий слой: после касания проседает на 2 px и перевешивается на
 * опорную ногу ровно на целые пиксели (без поворотов — они перерисовывали бы камень). Руки качаются навстречу ногам;
 * пыль — у ступни при касании.
 */
function walkPoses(view: ZView, n = 12): Pose[] {
  // вбок шаг виден только выносом ног: шаг длиннее, руки качаются меньше — ширина силуэта не прыгает
  const side = view === "side";
  const A = side ? 6.4 : 4.6, LIFT = 3.8, DUTY = 0.58, SWING = side ? 2.2 : 5.0;
  const footAt = (u: number) => {
    u = ((u % 1) + 1) % 1;
    if (u < DUTY) return { y: A - (2 * A * u) / DUTY, z: 0, toe: 0, strike: u < 0.2 ? 1 - u / 0.2 : 0 };
    const s = (u - DUTY) / (1 - DUTY);
    return { y: -A + 2 * A * easeInOut(s), z: LIFT * Math.sin(Math.PI * s), toe: 0.28 * Math.sin(Math.PI * s), strike: 0 };
  };
  const bob = [-2, -1, 0, 1, 1, 0, -2, -1, 0, 1, 1, 0];
  const sway = [0, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const fr = footAt(t), fl = footAt(t + 0.5);
    const armAt = (f: { y: number }, s: number): V3 => {
      const fw = -f.y / A;
      return [s * (21.0 - 0.8 * Math.max(0, fw)) + sway[i], 4.2 + SWING * fw, 17.6 + 1.8 * Math.max(0, fw) + 0.6 * Math.max(0, -fw)];
    };
    return {
      ...REST, t, seed: 150 + i,
      root: [sway[i], 0, 0] as V3, bob: bob[i] * PX,
      hand: [armAt(fr, 1), armAt(fl, -1)] as [V3, V3],
      foot: [[7.4, 0.6 + fr.y, 4.6 + fr.z], [-7.4, 0.6 + fl.y, 4.6 + fl.z]] as [V3, V3], toe: [fr.toe, fl.toe] as [number, number],
      dust: [fr.strike, fl.strike] as [number, number],
    };
  });
}

/**
 * Атака: размашистый хук правым кулаком. Замах — корпус разворачивается, кулак уходит назад-в-сторону; удар — дугой
 * вперёд-поперёк, перед собой (к цели); отдача и возврат. След — серп позади руки, удар — кадр вспышки.
 */
function attackPoses(view: ZView): Pose[] {
  const back: Partial<Pose> = {
    yaw: -0.34, pitch: 0.06, roll: -0.04, bob: 1 * PX, hp: -0.12,
    hand: [[21.4, -5.0, 27.0], [-19.4, 8.0, 19.0]], pole: [[0.8, -0.6, -0.2], [-0.5, -1, 0]], glow: 1.05,
  };
  const peak: Partial<Pose> = { ...back, yaw: -0.42, hand: [[21.6, -6.6, 28.4], [-18.8, 9.0, 19.4]] };
  const hitHand: V3 = view === "side" ? [6.0, 21.0, 24.0] : view === "up" ? [13.0, 15.0, 24.0] : [3.0, 18.5, 24.0];
  const mid: Partial<Pose> = {
    yaw: -0.05, pitch: 0.16, bob: 0, hp: -0.08,
    hand: [[21.4, 12.0, 26.0], [-19.4, 3.0, 18.4]], pole: [[1, -0.6, 0.2], [-0.5, -1, 0]], glow: 1.15,
  };
  const hit: Partial<Pose> = {
    yaw: 0.36, pitch: 0.24, roll: 0.05, bob: -2 * PX, hp: 0,
    hand: [hitHand, [-20.0, -2.0, 19.0]], pole: [[0.6, -1, 0.3], [-0.5, -1, 0]], glow: 1.25, flash: 1,
  };
  const settle: Partial<Pose> = { ...hit, yaw: 0.3, pitch: 0.2, bob: -1 * PX, hand: [add(hitHand, [0.6, -0.8, -0.6]), [-20.0, -1.0, 18.6]], flash: 0 };
  const keys: Key[] = [
    { f: 0, p: {} },
    { f: 3, p: back, ease: easeInOut },
    { f: 4, p: peak, ease: linear },
    { f: 5, p: mid, ease: easeIn },
    { f: 6, p: hit, ease: easeOut },
    { f: 7, p: settle, ease: easeOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 10, 400);
  const arc = arcOf(peak.hand![0], mid.hand![0], hitHand);
  const sh: V3 = [18, 0, 37];
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => fistOf(arc(lerp(u0, u1, k / (n - 1))), sh));
  poses[5].hand = [arc(0.5), poses[5].hand[1]];
  poses[5].trail = path(0, 0.5);
  poses[6].trail = path(0.2, 1);
  poses[7].trail = path(0.72, 1, 4);
  for (const k of [5, 6, 7]) poses[k].trailArm = 0;
  poses[6].flash = 1;
  return poses;
}

// ---- «Кулак рун»: правый кулак над головой (руна кулака разгорается) → удержание → удар в землю перед собой ----
const FIST_UP: Partial<Pose> = {
  pitch: -0.08, yaw: -0.14, roll: -0.03, bob: 1 * PX, hp: -0.2,
  hand: [[12.6, 1.0, 48.4], [-20.4, 7.0, 20.4]], pole: [[1, -0.3, -0.3], [-0.5, -1, 0]],
  glow: 1.2, fistGlow: 1.2,
};
function fistUpPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: FIST_UP, ease: easeInOut }], 4, 200);
}
function fistHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: FIST_UP }, { f: 1, p: FIST_UP }], 0);
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 220 + i,
    armLift: [tremble[i], 0] as [number, number],
    fistGlow: [1.2, 1.5, 1.3, 1.5][i], glow: [1.2, 1.35, 1.25, 1.35][i], pebbles: 1,
  }));
}
/** Удар: кадр 2 — кулак в земле (ровно в конце предупреждения), вспышка, крошка и пыль; голем распрямляется 4 кадра. */
function fistSlamPoses(view: ZView): Pose[] {
  const hitHand: V3 = view === "up" ? [12.0, 11.0, 9.6] : view === "side" ? [6.0, 17.0, 9.6] : [8.0, 15.0, 9.6];
  const mid: Partial<Pose> = { ...FIST_UP, pitch: 0.18, yaw: 0, bob: 0, hand: [[15.0, 11.0, 36.0], [-20.4, 5.0, 19.6]], pole: [[1, -0.4, 0.4], [-0.5, -1, 0]], fistGlow: 1.5, glow: 1.3 };
  const down: Partial<Pose> = {
    pitch: 0.42, yaw: 0.1, roll: 0.03, bob: -3 * PX, hp: 0.12,
    hand: [hitHand, [-20.6, 1.0, 19.0]], pole: [[1, -0.3, 0.6], [-0.5, -1, 0]], glow: 1.4, fistGlow: 1.5, flash: 1, clods: 1,
  };
  const keys: Key[] = [
    { f: 0, p: FIST_UP },
    { f: 1, p: mid, ease: easeIn },
    { f: 2, p: down, ease: easeIn },
    { f: 3, p: { ...down, flash: 0, clods: 0.7, fistGlow: 1.0 }, ease: easeOut },
    { f: 5, p: { ...down, flash: 0, clods: 0.25, fistGlow: 0.5, glow: 1.0 }, ease: linear },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 10, 240);
  const sh: V3 = [18, 0, 37];
  const arc = arcOf(FIST_UP.hand![0], mid.hand![0], hitHand);
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => fistOf(arc(lerp(u0, u1, k / (n - 1))), sh));
  poses[1].hand = [arc(0.5), poses[1].hand[1]];
  poses[1].trail = path(0, 0.5);
  poses[2].trail = path(0.2, 1);
  poses[3].trail = path(0.7, 1, 4);
  for (const k of [1, 2, 3]) { poses[k].trailArm = 0; poses[k].trailRune = true; }
  poses[2].puff = 1;
  poses[3].puff = 0.55;
  return poses;
}

// ---- «Каменный мешок»: руки в стороны (плиты встают) → удержание → хлопок перед грудью (плиты бьют) ----
/** Руки в стороны — на ширину покоя: кулаки остаются в кадре с полем 1 px. */
const CAGE_X = 21.0;
const CLAP_SIDE = 8.0;
const CAGE_OPEN: Partial<Pose> = {
  pitch: -0.04, bob: 1 * PX, hp: -0.22,
  hand: [[CAGE_X, 3.0, 33.0], [-CAGE_X, 3.0, 33.0]], pole: [[0.3, -1, -0.6], [-0.3, -1, -0.6]],
  glow: 1.3,
};
function cageCastPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: CAGE_OPEN, ease: easeOut }], 4, 300);
}
function cageHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: CAGE_OPEN }, { f: 1, p: CAGE_OPEN }], 0);
  const sway = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 320 + i,
    armLift: [sway[i], -sway[i]] as [number, number],
    glow: [1.25, 1.45, 1.3, 1.45][i],
  }));
}
/** Хлопок: кадр 2 — кулаки сошлись перед грудью, вспышка между ними; затем возврат. */
function cageSlamPoses(view: ZView): Pose[] {
  // вбок хлопок ближе к груди: кулаки вытянуты к зрителю-вправо и иначе уходят за край кадра
  const fw = view === "side" ? CLAP_SIDE : 14.0;
  const mid: Partial<Pose> = { ...CAGE_OPEN, pitch: 0.06, hand: [[16.0, fw - 2, 32.0], [-16.0, fw - 2, 32.0]], pole: [[0.6, -1, -0.2], [-0.6, -1, -0.2]] };
  const clap: Partial<Pose> = {
    pitch: 0.16, bob: -1 * PX, hp: -0.06,
    hand: [[6.4, fw, 30.0], [-6.4, fw, 30.0]], pole: [[0.8, -1, 0.1], [-0.8, -1, 0.1]], glow: 1.4, flash: 1,
  };
  const keys: Key[] = [
    { f: 0, p: CAGE_OPEN },
    { f: 1, p: mid, ease: easeIn },
    { f: 2, p: clap, ease: easeIn },
    { f: 3, p: { ...clap, flash: 0, hand: [[6.6, fw - 0.4, 29.6], [-6.6, fw - 0.4, 29.6]], glow: 1.2 }, ease: easeOut },
    { f: 7, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 8, 340);
  const sh: V3 = [18, 0, 37];
  const arc = arcOf(CAGE_OPEN.hand![0], mid.hand![0], clap.hand![0]);
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => fistOf(arc(lerp(u0, u1, k / (n - 1))), sh));
  const mirror = (v: V3): V3 => [-v[0], v[1], v[2]];
  poses[1].hand = [arc(0.5), mirror(arc(0.5))];
  for (const [k, u0, u1] of [[1, 0, 0.5], [2, 0.2, 1]] as [number, number, number][]) {
    poses[k].trail = path(u0, u1);
    poses[k].trail2 = poses[k].trail!.map(mirror);
    poses[k].trailArm = 0;
  }
  poses[2].flashAt = 1;
  return poses;
}

// ---- «Пульс рун»: руки назад, грудь вперёд, руна груди копит свет → удержание → вспышка, руки вниз-в-стороны ----
const PULSE_DRAW: Partial<Pose> = {
  pitch: -0.14, bob: 0, hp: -0.24,
  hand: [[19.0, -8.0, 17.0], [-19.0, -8.0, 17.0]], pole: [[0.4, -1, 0.3], [-0.4, -1, 0.3]],
  glow: 1.25, chestGlow: 0.8,
};
function pulseCastPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: PULSE_DRAW, ease: easeInOut }], 4, 500);
}
function pulseHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: PULSE_DRAW }, { f: 1, p: PULSE_DRAW }], 0);
  const tr = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 520 + i,
    armLift: [tr[i], tr[i]] as [number, number],
    chestGlow: [0.8, 1.0, 0.85, 1.0][i], glow: [1.25, 1.4, 1.3, 1.4][i],
  }));
}
/** Вспышка: кадр 1 — присел, кадр 2 — руна груди бьёт светом, руки вниз-в-стороны (земля бьёт кольцом); свет гаснет. */
/** Руки вниз-в-стороны на вспышке — не шире кадра. */
const BURST_X = 21.0;
function pulseBurstPoses(): Pose[] {
  const crouch: Partial<Pose> = { ...PULSE_DRAW, pitch: 0.06, bob: -2 * PX, hp: -0.1, hand: [[17.0, 1.0, 21.0], [-17.0, 1.0, 21.0]], chestGlow: 1.0, glow: 1.4 };
  const burst: Partial<Pose> = {
    pitch: -0.06, bob: 1 * PX, hp: -0.3,
    hand: [[BURST_X, 6.0, 13.0], [-BURST_X, 6.0, 13.0]], pole: [[0.2, -1, -0.4], [-0.2, -1, -0.4]], glow: 1.5, chestGlow: 1.0, flash: 1,
  };
  const keys: Key[] = [
    { f: 0, p: PULSE_DRAW },
    { f: 1, p: crouch, ease: easeIn },
    { f: 2, p: burst, ease: easeOut },
    { f: 3, p: { ...burst, flash: 0.5, chestGlow: 0.7 }, ease: linear },
    { f: 5, p: { ...burst, flash: 0, chestGlow: 0.25, glow: 1.1, bob: 0 }, ease: easeOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 10, 540);
  for (const k of [2, 3]) poses[k].flashAt = 2;
  poses[4].flash = 0;
  return poses;
}

/**
 * Гибель: вздрогнул (глаза и руны вспыхивают), шатнулся, оседает на колени и опирается кулаками о землю, руны гаснут;
 * затем глыбы разваливаются в груду, пыль.
 */
function deathPoses(): Pose[] {
  const recoil: Partial<Pose> = { pitch: -0.1, bob: 1 * PX, hp: -0.26, hand: [[22.4, 2.0, 21.0], [-22.4, 2.0, 21.0]], glow: 1.5, chestGlow: 0.5 };
  const stagger: Partial<Pose> = { pitch: 0.14, roll: 0.06, yaw: 0.08, bob: 0, hp: -0.04, hand: [[21.6, 4.0, 16.0], [-20.6, 5.0, 15.6]], glow: 0.7 };
  const kneel: [V3, V3] = [[7.0, -6.0, 4.0], [-7.0, -5.0, 4.0]];
  const knees: Partial<Pose> = {
    root: [0, -1.5, 0], pitch: 0.34, roll: 0.03, bob: -6 * PX, hp: 0.14, foot: kneel, toe: [-0.6, -0.6],
    hand: [[19.6, 8.0, 9.4], [-19.6, 8.0, 9.4]], pole: [[1, -0.6, 0.2], [-1, -0.6, 0.2]], glow: 0.4, dust: [1, 1],
  };
  const cracking: Partial<Pose> = { ...knees, glow: 0.2, dust: [0.5, 0.5], crumble: 0.12 };
  const dead: Partial<Pose> = { ...knees, glow: 0, dust: [0, 0], crumble: 1 };
  const keys: Key[] = [
    { f: 0, p: { glow: 1.0 } },
    { f: 1.5, p: recoil, ease: easeOut },
    { f: 3, p: stagger, ease: easeInOut },
    { f: 5, p: knees, ease: easeIn },
    { f: 6, p: cracking, ease: linear },
    { f: 11, p: dead, ease: linear },
  ];
  const poses = keyed(keys, 12, 700);
  // пыль от падения глыб — у основания груды
  poses[8].clods = 1;
  poses[9].clods = 0.75;
  poses[10].clods = 0.5;
  poses[11].clods = 0.25;
  return poses;
}

export type GolemAnim =
  | "idle" | "walk" | "attack" | "fistUp" | "fistHold" | "fistSlam" | "cageCast" | "cageHold" | "cageSlam"
  | "pulseCast" | "pulseHold" | "pulseBurst" | "death";
/**
 * Анимации: первый столбец листа, число кадров, кадров в секунду, по кругу ли, что играть следом. Замахи умений —
 * связки «замах → удержание по кругу до конца предупреждения → удар» (кадр hit — ровно конец предупреждения).
 */
export const GOLEM_ANIMS: Record<GolemAnim, { col: number; n: number; fps: number; loop: boolean; ru: string; next?: GolemAnim; hit?: number }> = {
  idle: { col: 0, n: 12, fps: 12, loop: true, ru: "покой" },
  walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
  attack: { col: 24, n: 10, fps: 15, loop: false, ru: "атака", hit: 6 },
  fistUp: { col: 34, n: 4, fps: 12, loop: false, ru: "замах кулака рун", next: "fistHold" },
  fistHold: { col: 38, n: 4, fps: 12, loop: true, ru: "удержание кулака", next: "fistSlam" },
  fistSlam: { col: 42, n: 10, fps: 12, loop: false, ru: "кулак рун", hit: 2 },
  cageCast: { col: 52, n: 4, fps: 12, loop: false, ru: "замах мешка", next: "cageHold" },
  cageHold: { col: 56, n: 4, fps: 12, loop: true, ru: "удержание мешка", next: "cageSlam" },
  cageSlam: { col: 60, n: 8, fps: 12, loop: false, ru: "каменный мешок", hit: 2 },
  pulseCast: { col: 68, n: 4, fps: 12, loop: false, ru: "замах пульса", next: "pulseHold" },
  pulseHold: { col: 72, n: 4, fps: 12, loop: true, ru: "удержание пульса", next: "pulseBurst" },
  pulseBurst: { col: 76, n: 10, fps: 12, loop: false, ru: "пульс рун", hit: 2 },
  death: { col: 86, n: 12, fps: 12, loop: false, ru: "гибель" },
};
export const GOLEM_COLS = 98;
/** Умения карточки → анимации (замах длится windupMs, кадр hit удара — в конце предупреждения) и эффект мира. */
export const GOLEM_SKILLS: Record<string, { windup: [GolemAnim, GolemAnim]; strike: GolemAnim; fx: "fist" | "cage" | "pulse" }> = {
  rune_fist: { windup: ["fistUp", "fistHold"], strike: "fistSlam", fx: "fist" },
  slab_cage: { windup: ["cageCast", "cageHold"], strike: "cageSlam", fx: "cage" },
  rune_pulse: { windup: ["pulseCast", "pulseHold"], strike: "pulseBurst", fx: "pulse" },
};
const POSES: Record<GolemAnim, (view: ZView) => Pose[]> = {
  idle: () => idlePoses(), walk: (v) => walkPoses(v), attack: attackPoses,
  fistUp: fistUpPoses, fistHold: fistHoldPoses, fistSlam: fistSlamPoses,
  cageCast: cageCastPoses, cageHold: cageHoldPoses, cageSlam: cageSlamPoses,
  pulseCast: pulseCastPoses, pulseHold: pulseHoldPoses, pulseBurst: pulseBurstPoses,
  death: deathPoses,
};

/** Лист одной анимации: 3 строки (вниз, вверх, вбок), столбцы — кадры. */
export function buildGolemAnim(anim: GolemAnim): PC {
  const A = GOLEM_ANIMS[anim];
  const out = new PC(N * A.n, N * 3);
  VIEWS.forEach((v, row) => POSES[anim](v).forEach((p, i) => out.blit(renderGolem(v, p), i * N, row * N)));
  return out;
}
/** Весь лист: GOLEM_COLS столбцов × 3 строки. */
export function buildGolemSheet(parts?: Partial<Record<GolemAnim, PC>>): PC {
  const out = new PC(N * GOLEM_COLS, N * 3);
  for (const a of Object.keys(GOLEM_ANIMS) as GolemAnim[]) out.blit(parts?.[a] ?? buildGolemAnim(a), GOLEM_ANIMS[a].col * N, 0);
  return out;
}

// ---------------- эффекты мира ----------------
/** Земля и комья: 5 непрозрачных тонов (как у пилота). */
const EARTH = R("#20160f", "#3a2a1c", "#5a442e", "#7c6345", "#a3875f");
/** Кадр эффекта 64×64; точка метки (центр на земле) — FX_AX, FX_AY. Земля без сжатия: круги меток круглые. */
const FX_AX = 32, FX_AY = 46;
/** Экранный сдвиг по земле от точки метки → мир эффекта (ось к зрителю сжата камерой в SN раз). */
const ground = (ox: number, oy: number): V3 => [ox, (FX_AY - GY + oy) / SN, 0];

/** Трещина: изломанная линия, ширина от w0 к 1. */
interface Crack { pts: [number, number][]; w0: number }
/** Трещина с отростком: излом каждые 2 px, одна короткая ветка в середине. */
function crackTree(x0: number, y0: number, a0: number, len: number, w0: number, seed: number): Crack[] {
  const out: Crack[] = [];
  const walk = (x: number, y: number, a: number, n: number, w: number, sd: number, branch: boolean) => {
    const pts: [number, number][] = [[x, y]];
    const at = Math.floor(n * (0.35 + 0.3 * hash01(sd, 9, 4)));
    for (let s = 0; s < n; s++) {
      if (s % 2 === 1) a += (hash01(sd, s, 3) - 0.5) * 0.9;
      x += Math.cos(a);
      y += Math.sin(a);
      pts.push([x, y]);
      if (branch && s === at) {
        const side = hash01(sd, 7, 5) < 0.5 ? -1 : 1;
        walk(x, y, a + side * (0.7 + 0.4 * hash01(sd, 8, 6)), Math.max(2, Math.round(n * 0.4)), Math.max(1.2, w * 0.55), sd + 17, false);
      }
    }
    out.push({ pts, w0: w });
  };
  walk(x0, y0, a0, len, w0, seed, true);
  return out;
}
/**
 * Трещины в земле: тёмная щель, светлая кромка снизу-справа (освещённая стенка), бурая сверху-слева; grow — доля длины.
 * vein 1–3 — по оси щели светится рунная жила (3 — ярче всего), края щели остаются тёмными.
 */
function drawGroundCracks(o: PC, cracks: Crack[], grow: number, pale = false, vein = 0) {
  if (grow <= 0.02) return;
  const inner = new Uint8Array(N * N), axis = new Uint8Array(N * N);
  for (const cr of cracks) {
    const n = Math.floor((cr.pts.length - 1) * grow);
    for (let k = 0; k <= n; k++) {
      const u = k / Math.max(1, cr.pts.length - 1);
      const w = lerp(cr.w0, 1.0, u);
      const [px, py] = cr.pts[k];
      const r = w / 2;
      const fx = Math.floor(px), fy = Math.floor(py);
      if (fx >= 0 && fy >= 0 && fx < N && fy < N) { inner[fy * N + fx] = 1; axis[fy * N + fx] = 1; }
      for (let yy = Math.floor(py - r); yy <= py + r; yy++) for (let xx = Math.floor(px - r); xx <= px + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        if (w >= 1.6 && Math.hypot(xx + 0.5 - px, yy + 0.5 - py) <= r) inner[yy * N + xx] = 1;
      }
    }
  }
  const at = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < N && yy < N && inner[yy * N + xx] === 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (inner[i]) {
      o.set(x, y, vein > 0 && axis[i] ? RUNE[clamp(vein, 1, 3)] : EARTH[pale ? 1 : 0]);
      continue;
    }
    if (at(x - 1, y) || at(x, y - 1)) o.set(x, y, EARTH[pale ? 3 : 4]);
    else if (at(x + 1, y) || at(x, y + 1)) o.set(x, y, EARTH[2]);
  }
}

/** Камешки и комья: формы 2–3 px; тона рампы (светлый верх-лево, тёмный низ). */
const CHUNKS: string[][] = [["43", "21"], ["432", "321", ".1."], [".43", "321"], ["43.", "321", ".1."], ["32", "1."]];
function drawChunk(o: PC, x: number, y: number, shape: number, ramp: Ramp = STONE_ARMS) {
  CHUNKS[shape % CHUNKS.length].forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") o.set(Math.round(x) + i, Math.round(y) + j, ramp[+ch]); }));
}
/** Летящий ком: дуга от точки (время в кадрах), падает и остаётся лежать (rest — уже лежит). */
function chunkPos(bx: number, by: number, vx: number, vz: number, t: number): [number, number, boolean] {
  const g = 1.1;
  const land = (2 * vz) / g;
  const tt = Math.min(t, land);
  const h = vz * tt - 0.5 * g * tt * tt;
  return [Math.round(bx + vx * tt), Math.round(by - Math.max(0, h)), t >= land];
}
/** Плоский клуб пыли в точке кадра: 2 клуба расходятся в стороны и тают. */
function drawPuffAt(o: PC, cx: number, cy: number, k: number, seed: number, spread = 3.5) {
  const t = 1 - k;
  for (let j = 0; j < 2; j++) {
    const dir = j ? 1 : -1;
    const px = cx + dir * (2.5 + spread * t), py = cy - t;
    const rx = 1.5 + 1.2 * k, ry = Math.max(0.9, rx * 0.55);
    if (hash01(j, seed, 6) > k * 1.8) continue;
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry;
      if (dx * dx + dy * dy > 1) continue;
      o.set(x, y, DUST[dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2]);
    }
  }
}
/** Кольцо пыли на земле радиуса r (вид сверху, без сжатия): клубы по окружности; передняя половина — в верхний слой. */
function drawDustRing(back: PC, front: PC, cx: number, cy: number, r: number, k: number, seed: number) {
  const n = Math.max(7, Math.round(r * 0.55));
  for (let j = 0; j < n; j++) {
    const a = (j / n) * TAU + hash01(j, seed, 2) * 0.4;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    const rr = (1.2 + 1.5 * k) * (0.8 + 0.4 * hash01(j, seed, 3));
    if (hash01(j, seed, 4) > 0.3 + k) continue;
    const o = Math.sin(a) > 0.15 ? front : back;
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
      const dx = (xx + 0.5 - x) / rr, dy = (yy + 0.5 - y) / (rr * 0.7);
      if (dx * dx + dy * dy > 1) continue;
      o.set(xx, yy, DUST[dy > 0.3 ? 1 : dx + dy < -0.6 ? 3 : 2]);
    }
  }
}
/** Рунный круг на земле: кольцо радиуса r и четыре засечки внутрь; lv — яркость 0–3. */
function drawRuneRing(o: PC, cx: number, cy: number, r: number, lv: number) {
  if (lv <= 0) return;
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (Math.abs(d - r) < 0.55) o.set(x, y, RUNE[clamp(lv, 0, 3)]);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    for (let rr = r - 3; rr <= r - 1; rr++) o.set(Math.floor(cx + Math.cos(a) * rr), Math.floor(cy + Math.sin(a) * rr), RUNE[clamp(lv - 1, 0, 3)]);
  }
}
/** Вспышка удара: крест в 3 тона с короткими диагоналями. */
function drawImpactFlash(o: PC, cx: number, cy: number, L: number) {
  for (let r = 1; r <= L; r++) {
    const tone = r <= 2 ? 2 : r <= L - 2 ? 1 : 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) o.set(cx + dx * r, cy + dy * r, FLASH[tone]);
  }
  const D = Math.max(1, Math.round(L / 2.5));
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (let r = 1; r <= D; r++) o.set(cx + dx * r, cy + dy * r, FLASH[r === 1 ? 2 : 1]);
  o.set(cx, cy, FLASH[2]);
}

/** Глыбы эффекта (плиты, шипы, осколки) — тем же движком, что голем: свет, тоны, трещины, руны, контур. */
function renderFxPrims(S: Scene): PC {
  const order = S.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => S.prims[i]);
  for (const q of prims) prepare(q, null);
  fxMode = true;
  const gb = raster(prims, S.gk);
  const L = shade(prims, S.gk, gb);
  fxMode = false;
  applyCracks(L, S, "down", gb, true);
  const img = new PC(N, N);
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0) img.set(i % N, (i / N) | 0, MATS[L.mat[i]].ramp[L.idx[i]]);
  drawStamps(img, S, "down", gb, L, true);
  img.outline(OUT);
  sealPinholes(img);
  return img;
}
const rotAxes = (pitch: number, yaw: number, roll: number): [V3, V3, V3] => [rot([1, 0, 0], pitch, yaw, roll), rot([0, 1, 0], pitch, yaw, roll), rot([0, 0, 1], pitch, yaw, roll)];

// ---- «Кулак рун»: кратер под танком и каменные шипы по кругу ----
/**
 * Кратер (центр метки): кадр 0 — удар (кадр hit «кулака рун»): вспышка, круг-руна на земле, трещины с рунными жилами
 * бегут лучами; комья взлетают и ложатся вокруг, кольцо пыли расходится; жилы и руна гаснут, кратер и трещины тают.
 */
function fistCraterFrame(i: number): [PC, PC] {
  const back = new PC(N, N), front = new PC(N, N);
  const cx = FX_AX, cy = FX_AY;
  const grow = [0.3, 0.7, 1, 1, 1, 1, 1, 1, 1, 0.6][i];
  const vein = [3, 3, 3, 2, 2, 1, 1, 0, 0, 0][i];
  const ring = [3, 3, 2, 2, 1, 1, 0, 0, 0, 0][i];
  const pale = i >= 8;
  const cracks: Crack[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.25 + (hash01(k, 3, 1) - 0.5) * 0.7;
    cracks.push(...crackTree(cx + Math.cos(a) * 5, cy + Math.sin(a) * 4, a, 8 + Math.round(7 * hash01(k, 3, 2)), 2.6, 40 + k * 7));
  }
  drawGroundCracks(back, cracks, grow, pale, vein);
  // чаша кратера: тёмная середина, освещённый дальний край, вывороченный ободок
  const open = [0.7, 1, 1, 1, 1, 1, 1, 0.9, 0.75, 0.5][i];
  {
    const rx = 2.6 + 3.4 * open, ry = 2.0 + 2.5 * open, RX = rx + 2, RY = ry + 1.6;
    for (let y = Math.floor(cy - RY); y <= cy + RY; y++) for (let x = Math.floor(cx - RX); x <= cx + RX; x++) {
      const ux = x + 0.5 - cx, uy = y + 0.5 - cy;
      const dout = (ux / RX) ** 2 + (uy / RY) ** 2;
      if (dout > 1) continue;
      if ((ux / rx) ** 2 + (uy / ry) ** 2 <= 1) {
        back.set(x, y, uy < -0.3 * ry ? EARTH[pale ? 2 : 1] : EARTH[pale ? 1 : 0]);
        continue;
      }
      if (dout > 0.75 && hash01(x, y, 31) < 0.3) continue;
      back.set(x, y, ux / RX + uy / RY < -0.45 ? EARTH[4] : uy > 0.35 * RY ? EARTH[2] : EARTH[3]);
    }
  }
  drawRuneRing(back, cx, cy, 11, ring);
  // комья: из кратера во все стороны, падают и лежат; к концу их меньше
  const n = 10;
  for (let k = 0; k < n; k++) {
    if (i >= 7 && k >= n - (i - 6) * 3) continue;
    const a = (k / n) * TAU + hash01(k, 7, 1) * 0.5;
    const sp = 1.0 + 1.3 * hash01(k, 7, 2);
    const [x, y, rest] = chunkPos(cx + Math.cos(a) * 3, cy + Math.sin(a) * 2.5, Math.cos(a) * sp, 2.2 + 1.6 * hash01(k, 7, 3), i * 1.5 + 0.7);
    const fly = Math.min(i * 1.5 + 0.7, (2 * (2.2 + 1.6 * hash01(k, 7, 3))) / 1.1);
    const yy = y + Math.round(Math.sin(a) * sp * fly * 0.8);
    drawChunk(rest ? back : front, x - 1, yy - 1, k, k % 3 === 0 ? STONE_HEAD : STONE_ARMS);
  }
  if (i >= 1 && i <= 5) drawDustRing(back, front, cx, cy, 9 + i * 4, 1 - (i - 1) / 5, 5);
  if (i === 0) drawImpactFlash(front, cx, cy - 3, 8);
  if (i === 1) drawImpactFlash(front, cx, cy - 3, 4);
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
}

/** Острые камни из земли (ударная волна кулака): три шипа наружу; h — доля высоты над землёй. */
function spikesScene(h: number, seed: number): Scene {
  const S = new Scene();
  const defs: [number, number, number, number, number][] = [
    [0.5, 0.5, 11, 2.5, 0.08], [-4.6, 1.6, 7.5, 2.0, -0.5], [4.4, -1.2, 8.5, 2.1, 0.42],
  ];
  defs.forEach(([x, y, H, w, roll], k) => {
    const g = S.group();
    const hk = clamp(h * (1.15 - 0.15 * k), 0, 1);
    if (hk <= 0.02) return;
    const ax = rotAxes(0.1 * (k - 1), 0.4 * k, roll);
    const c = add(ground(x, y), mul(ax[2], (hk - 0.5) * H));
    S.box(g, c, [w, w * 0.85, H / 2], ax, {
      mat: M_BODY, seed: seed + k, tone: 0.2, chips: 0, cuts: [[1, 0, 1, w * 1.15], [-1, 0, 1, w * 0.7], [0, 1, 1, w * 0.75], [0, -1, 1, w * 0.6]],
    });
  });
  return S;
}
/**
 * Каменный выброс (по кругу «Кулака рун» — волна доходит до края круга): кадр 1 — из треснувшей земли выбивает три
 * острых камня, крошка и пыль; камни осыпаются обратно, остаются трещина и камешки.
 */
function burstFrame(i: number, seed: number): [PC, PC] {
  const back = new PC(N, N), front = new PC(N, N);
  const cx = FX_AX, cy = FX_AY;
  const cracks: Crack[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.9 + (hash01(k, seed, 1) - 0.5) * 0.8;
    cracks.push(...crackTree(cx + Math.cos(a) * 3, cy + Math.sin(a) * 2, a, 5 + Math.round(3 * hash01(k, seed, 2)), 2.2, seed + k * 5));
  }
  drawGroundCracks(back, cracks, [0.5, 1, 1, 1, 1, 0.7][i], i >= 4);
  const h = [0.15, 1.05, 1, 0.62, 0.28, 0][i];
  if (h > 0.02) front.blit(renderFxPrims(spikesScene(h, seed)), 0, 0);
  // крошка: из-под шипов вверх и в стороны
  for (let k = 0; k < 6; k++) {
    if (i === 0) break;
    if (i >= 4 && k >= 6 - (i - 3) * 2) continue;
    const a = (k / 6) * TAU + hash01(k, seed, 3) * 0.6;
    const sp = 0.8 + 1.0 * hash01(k, seed, 4);
    const [x, y, rest] = chunkPos(cx + Math.cos(a) * 2, cy + Math.sin(a) * 1.5, Math.cos(a) * sp, 2.6 + 1.2 * hash01(k, seed, 5), (i - 1) * 1.6 + 0.8);
    drawChunk(rest ? back : front, x - 1, y - 1 + Math.round(Math.sin(a) * 3), k + seed, k % 2 ? STONE_BODY : STONE_ARMS);
  }
  if (i >= 1 && i <= 4) drawPuffAt(front, cx, cy + 2, 1 - (i - 1) / 4, seed, 4);
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
}

// ---- «Каменный мешок»: плиты кольца и плита-крышка ----
/** Плита-менгир кольца: отбитый косой верх, на лицевой грани — руна печати. up — доля высоты над землёй. */
function slabScene(up: number, glow: number, shake: number, seed: number): Scene {
  const S = new Scene();
  const g = S.group();
  const H = 10.5, W = 6.2, D = 2.8;
  const c = add(ground(shake, 0), [0, 0, (up - 1) * H * 2 + H]);
  const q = S.box(g, c, [W, D, H], rotAxes(-0.04, 0.24, 0.05), {
    mat: M_HEAD, seed, cuts: [[1, 0, 1, 4.2], [-1, 0, 1, 1.2], [0, 1, 1, 1.0], [-1, 1, 0, 0.9], [1, 0, -1, 1.0]], chips: 1,
  });
  addCracks(S, q, [[1, 1, 0.45, -0.45, 1], [1, 1, -0.55, 0.5, 3]]);
  S.stamps.push({ kind: "rune", at: add(c, rot([0.6, D, 0.6], -0.04, 0.24, 0.05)), n: q.ax[1], part: q.part, glow, v: 0 });
  return S;
}
/** Осколки плиты: от мест в плите летят наружу по дуге, падают и лежат (время — кадры после удара). */
function slabShardsScene(t: number, seed: number): Scene {
  const S = new Scene();
  const parts: [number, number, number, number, number, number, V3][] = [
    // x, z старта; vx, vy (по земле, px/кадр); vz; вращение; полуразмеры
    [-3.0, 15, -1.6, -0.5, 2.4, 0.9, [3.0, 2.4, 3.6]],
    [3.2, 15, 1.7, -0.3, 2.1, -0.8, [2.8, 2.3, 3.4]],
    [-3.2, 6, -1.9, 0.5, 1.6, 0.6, [3.2, 2.5, 3.2]],
    [3.0, 6, 1.8, 0.6, 1.4, -0.5, [3.0, 2.4, 3.0]],
  ];
  const gz = 1.1;
  parts.forEach(([x0, z0, vx, vy, vz, spin, hs], k) => {
    const g = S.group();
    const rest = hs[2] * 0.75;
    // время приземления: z0 + vz·t − gz·t²/2 = rest
    const land = (vz + Math.sqrt(vz * vz + 2 * gz * (z0 - rest))) / gz;
    const tt = Math.min(t, land);
    const z = Math.max(rest, z0 + vz * tt - 0.5 * gz * tt * tt);
    const c = add(ground(x0 + vx * tt, vy * tt), [0, 0, z]);
    const r = Math.min(1, tt / land);
    S.box(g, c, hs, rotAxes(spin * r * 1.3, 0.2 + 0.3 * k, spin * r * 1.9), { mat: M_HEAD, seed: seed + k, chips: 1 });
  });
  return S;
}
/** Яма у основания плиты: тёмная середина, кромка с комьями. */
function drawSlabPit(back: PC, cx: number, cy: number, k: number) {
  if (k <= 0.05) return;
  const rx = 4 + 5 * k, ry = 1.6 + 1.2 * k;
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const ux = (x + 0.5 - cx) / (rx + 1), uy = (y + 0.5 - cy) / (ry + 1);
    const d = ux * ux + uy * uy;
    if (d > 1) continue;
    const inner = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
    if (!inner && hash01(x, y, 17) < 0.25) continue;
    back.set(x, y, inner ? (uy < -0.2 ? EARTH[1] : EARTH[0]) : ux + uy < -0.5 ? EARTH[4] : uy > 0.3 ? EARTH[2] : EARTH[3]);
  }
}
function slabFrame(kind: "rise" | "hold" | "strike", i: number): [PC, PC] {
  const back = new PC(N, N), front = new PC(N, N);
  const cx = FX_AX, cy = FX_AY;
  const seed = 61;
  const cracks: Crack[] = [];
  for (const [k, a] of [[0, 0.15], [1, 2.95], [2, -0.6], [3, 3.7]] as [number, number][]) {
    cracks.push(...crackTree(cx + Math.cos(a) * 8, cy + Math.sin(a) * 2.5, a, 4 + Math.round(4 * hash01(k, seed, 2)), 2.2, seed + k * 3));
  }
  if (kind === "rise") {
    const up = [0.1, 0.38, 0.74, 1.08, 0.97, 1][i];
    const glow = [0, 0, 0.3, 0.6, 0.85, 0.95][i];
    drawGroundCracks(back, cracks, [0.4, 0.8, 1, 1, 1, 1][i]);
    drawSlabPit(back, cx, cy, [0.5, 0.8, 1, 1, 1, 1][i]);
    back.blit(renderFxPrims(slabScene(up, glow, 0, seed)), 0, 0);
    // передний край ямы — поверх плиты, пока она выходит из земли
    if (up < 1) for (let x = cx - 10; x <= cx + 10; x++) for (let y = cy; y <= cy + 3; y++) {
      const ux = (x + 0.5 - cx) / 10, uy = (y + 0.5 - cy) / 2.8;
      if (ux * ux + uy * uy <= 1 && uy > 0) front.set(x, y, uy > 0.55 ? EARTH[2] : EARTH[3]);
    }
    if (i >= 1 && i <= 4) for (let k = 0; k < 4; k++) {
      const dir = k < 2 ? -1 : 1;
      const [x, y] = chunkPos(cx + dir * (5 + k % 2 * 2), cy, dir * (0.8 + 0.6 * hash01(k, 2, 3)), 2.0 + hash01(k, 2, 4), (i - 1) * 1.6 + 0.6);
      drawChunk(front, x - 1, y - 1, k + 1, EARTH);
    }
    if (i >= 1 && i <= 3) drawPuffAt(front, cx, cy + 1, 1 - (i - 1) / 3, 3, 6);
  } else if (kind === "hold") {
    drawGroundCracks(back, cracks, 1);
    drawSlabPit(back, cx, cy, 1);
    back.blit(renderFxPrims(slabScene(1, [0.95, 1.25, 1.05, 1.35][i], 0, seed)), 0, 0);
  } else {
    // удар: кадр 0 — плита вздрагивает, руна вспыхивает; кадр 1 — плита лопается: осколки наружу, вспышка, кольцо пыли
    drawGroundCracks(back, cracks, 1, i >= 6);
    drawSlabPit(back, cx, cy, [1, 1, 1, 1, 0.9, 0.75, 0.55, 0.3][i]);
    if (i === 0) back.blit(renderFxPrims(slabScene(1.06, 1.5, 1, seed)), 0, 0);
    else {
      const t = (i - 1) * 1.35 + 0.5;
      (i <= 3 ? front : back).blit(renderFxPrims(slabShardsScene(t, seed)), 0, 0);
    }
    if (i === 1) drawImpactFlash(front, cx, cy - 9, 6);
    if (i >= 1 && i <= 5) drawDustRing(back, front, cx, cy, 6 + i * 3, 1 - (i - 1) / 5, 9);
    // крошка
    if (i >= 1 && i <= 6) for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      const [x, y, rest] = chunkPos(cx + Math.cos(a) * 3, cy - 6, Math.cos(a) * (1.2 + hash01(k, 4, 1)), 1.8 + hash01(k, 4, 2), (i - 1) * 1.5 + 0.5);
      drawChunk(rest ? back : front, x - 1, y + (rest ? 6 + Math.round(Math.sin(a) * 4) : 0), k, STONE_HEAD);
    }
  }
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
}

/** Плита-крышка: толстая, плоская, падает сверху в середину кольца; на верхней грани — печать кургана. */
function dropScene(z: number, tiltA: number, glow: number, sink: number, cracked: number): Scene {
  const S = new Scene();
  const g = S.group();
  const T = 3.2;
  const c = add(ground(0, -1), [0, 0, z + T - sink]);
  const q = S.box(g, c, [12.5, 9.0 / SN, T], rotAxes(tiltA, 0.1, tiltA * 0.5), {
    mat: M_HEAD, seed: 77, tone: -0.85, cuts: [[1, 1, 0, 3.2], [-1, -1, 0, 2.6], [1, -1, 0, 1.6], [-1, 1, 0, 1.2]], chips: 0,
  });
  const cr: CrackDef[] = [[2, 1, 0.5, -0.45, 4], [2, 1, -0.55, 0.35, 0]];
  if (cracked > 0.3) cr.push([2, 1, 0.1, 0.55, 2], [2, 1, -0.2, -0.6, 1]);
  if (cracked > 0.7) cr.push([2, 1, 0.6, 0.3, 3], [2, 1, -0.65, -0.2, 5]);
  addCracks(S, q, cr);
  S.stamps.push({ kind: "rune", at: add(c, [0.5, 0, T]), n: [0, 0, 1], part: q.part, glow, v: 0 });
  return S;
}
function dropFrame(kind: "warn" | "fall", i: number): [PC, PC] {
  const back = new PC(N, N), front = new PC(N, N);
  const cx = FX_AX, cy = FX_AY;
  // тень падающей плиты: растёт к удару (полупрозрачная — она под юнитами)
  const shadow = (k: number) => {
    const rx = 5 + 8.5 * k, ry = 4 + 6 * k;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d <= 1) back.set(x, y, [16, 12, 20, d < 0.5 ? 125 : 80]);
    }
  };
  if (kind === "warn") {
    shadow([0.5, 0.58, 0.66, 0.58][i]);
    // сверху сыплются камешки и пыль — над этим местом что-то висит
    for (let k = 0; k < 3; k++) {
      const u = (i / 4 + k / 3) % 1;
      const x = cx + [-6, 2, 7][k], y = Math.round(2 + u * u * (cy - 6));
      drawChunk(front, x, y, k + 2, STONE_ARMS);
    }
  } else {
    const z = [36, 14, 0, 0, 0, 0, 0, 0, 0, 0][i];
    const sink = [0, 0, 0, 0.6, 0.6, 0.6, 1.2, 2.4, 4.0, 5.8][i];
    const glow = [1.0, 1.2, 1.5, 1.35, 1.1, 0.9, 0.6, 0.3, 0, 0][i];
    if (i <= 1) shadow([0.85, 1][i]);
    const cracks: Crack[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.4 + (hash01(k, 8, 1) - 0.5) * 0.6;
      cracks.push(...crackTree(cx + Math.cos(a) * 12.5, cy - 1 + Math.sin(a) * 9, a, 4 + Math.round(4 * hash01(k, 8, 2)), 2.4, 80 + k * 3));
    }
    if (i >= 2) drawGroundCracks(back, cracks, i === 2 ? 0.6 : 1, i >= 7);
    if (i < 9) {
      const img = renderFxPrims(dropScene(z, i === 0 ? 0.1 : i === 1 ? 0.04 : 0, glow, sink, [0, 0, 0, 0, 0, 0.2, 0.5, 0.8, 1][i] ?? 1));
      // в полёте плита — над юнитами; легла — под ними
      (i <= 1 ? front : back).blit(img, 0, 0);
      // штрихи падения над плитой
      if (i <= 1) for (const dx of [-9, -3, 4, 10]) for (let k = 0; k < (i === 0 ? 5 : 3); k++) {
        const [sx, sy] = scr(add(ground(dx, -1), [0, 0, z + 9 + k * 2]));
        front.set(Math.floor(sx), Math.floor(sy), DUST[k < 2 ? 3 : 2]);
      }
    }
    if (i >= 2 && i <= 6) drawDustRing(back, front, cx, cy - 1, 15 + (i - 2) * 3, 1 - (i - 2) / 5, 13);
    if (i >= 2 && i <= 6) for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.2;
      const [x, y, rest] = chunkPos(cx + Math.cos(a) * 13, cy - 1 + Math.sin(a) * 9, Math.cos(a) * 1.2, 1.8 + hash01(k, 9, 1), (i - 2) * 1.5 + 0.6);
      drawChunk(rest ? back : front, x - 1, y - 1 + Math.round(Math.sin(a) * 2), k, STONE_HEAD);
    }
    if (i >= 8) for (let k = 0; k < (i === 8 ? 7 : 4); k++) drawChunk(back, cx - 10 + Math.round(20 * hash01(k, 6, 1)), cy - 4 + Math.round(7 * hash01(k, 6, 2)), k, k % 2 ? STONE_HEAD : STONE_ARMS);
  }
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
}

// ---- «Пульс рун»: выброс рунного света по кольцу ----
/** Столб рунного света: ядро светлое, края золотые, края дрожат по строкам, верх сужается; base — нижняя строка. */
function drawBeam(o: PC, cx: number, base: number, H: number, W: number, seed: number) {
  for (let h = 0; h < H; h++) {
    const u = h / Math.max(1, H - 1);
    const wob = Math.round(Math.sin(h * 0.9 + seed) * 0.7);
    const w = Math.max(0, Math.round(W * (1 - u * u * 0.85)) + (h % 3 === 0 ? wob : 0));
    for (let dx = -w; dx <= w; dx++) {
      const e = Math.abs(dx) / Math.max(1, w);
      o.set(cx + dx, base - h, RUNE[e < 0.34 ? 3 : e < 0.75 ? 2 : 1]);
    }
  }
}
/**
 * Выброс «Пульса» (по кольцу 56–150 px вокруг голема): кадр 0 — на земле вспыхивает знак, трещины с жилами; кадр 1–2 —
 * из земли бьёт столб рунного света и камни; столб рвётся на искры вверх, жилы гаснут, остаются трещина и камешки.
 */
function pulseFrame(i: number, seed: number): [PC, PC] {
  const back = new PC(N, N), front = new PC(N, N);
  const cx = FX_AX, cy = FX_AY;
  const cracks: Crack[] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.5 + (hash01(k, seed, 1) - 0.5) * 0.7;
    cracks.push(...crackTree(cx + Math.cos(a) * 2.5, cy + Math.sin(a) * 2, a, 4 + Math.round(4 * hash01(k, seed, 2)), 2.2, seed + k * 4));
  }
  const vein = [3, 3, 3, 2, 2, 1, 0, 0][i];
  drawGroundCracks(back, cracks, [0.6, 1, 1, 1, 1, 1, 1, 0.6][i], i >= 6, vein);
  drawRuneRing(back, cx, cy, 6, [3, 3, 2, 1, 0, 0, 0, 0][i]);
  // столб: растёт, держится, рвётся
  const H = [7, 17, 22, 14, 0, 0, 0, 0][i], W = [1, 3, 3, 2, 0, 0, 0, 0][i];
  if (H) drawBeam(front, cx, cy - 1, H, W, seed + i);
  if (i === 3) for (let k = 0; k < 3; k++) {
    // оторвавшиеся куски света
    const y = cy - 17 - k * 4;
    for (let dx = -1; dx <= 1; dx++) front.set(cx + dx + (k % 2 ? 1 : -1), y, RUNE[dx ? 2 : 3]);
  }
  // искры вверх и в стороны, гаснут ступенями
  if (i >= 1 && i <= 6) for (let k = 0; k < 6; k++) {
    const u = (i - 1) / 5;
    const x = cx + Math.round((hash01(k, seed, 7) - 0.5) * (5 + 14 * u));
    const y = cy - 6 - Math.round(hash01(k, seed, 8) * 8 + 16 * u);
    if (hash01(k, seed, 9) < u * 0.75) continue;
    front.set(x, y, RUNE[i <= 2 ? 3 : i <= 4 ? 2 : 1]);
    if (i <= 3) front.set(x, y + 1, RUNE[1]);
  }
  // камни из выброса
  for (let k = 0; k < 4; k++) {
    if (i === 0 || (i >= 6 && k >= 4 - (i - 5) * 2)) continue;
    const a = (k / 4) * TAU + 0.6 + hash01(k, seed, 3) * 0.5;
    const [x, y, rest] = chunkPos(cx + Math.cos(a) * 2, cy + Math.sin(a) * 1.5, Math.cos(a) * (0.8 + hash01(k, seed, 4)), 2.6 + hash01(k, seed, 5), (i - 1) * 1.5 + 0.8);
    drawChunk(rest ? back : front, x - 1, y - 1 + Math.round(Math.sin(a) * 3), k + seed, k % 2 ? STONE_BODY : STONE_ARMS);
  }
  if (i === 0) drawImpactFlash(front, cx, cy - 2, 4);
  if (i >= 1 && i <= 3) drawPuffAt(front, cx, cy + 2, 1 - (i - 1) / 3, seed, 4);
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
}

/** Листы эффектов: строка 0 — нижний слой (под юнитами), строка 1 — верхний (над юнитами); столбцы — анимации подряд. */
export const FIST_FX = {
  crater: { col: 0, n: 10, fps: 12, loop: false, hit: 0 },
  burst: { col: 10, n: 6, fps: 12, loop: false, hit: 1 },
} as const;
export const FIST_FX_COLS = 16;
export const SLAB_FX = {
  slabRise: { col: 0, n: 6, fps: 12, loop: false, next: "slabHold" },
  slabHold: { col: 6, n: 4, fps: 12, loop: true, next: "slabStrike" },
  slabStrike: { col: 10, n: 8, fps: 12, loop: false, hit: 1 },
  dropWarn: { col: 18, n: 4, fps: 12, loop: true, next: "dropFall" },
  dropFall: { col: 22, n: 10, fps: 12, loop: false, hit: 2 },
} as const;
export const SLAB_FX_COLS = 32;
export const PULSE_FX = {
  pulse: { col: 0, n: 8, fps: 12, loop: false, hit: 0 },
} as const;
export const PULSE_FX_COLS = 8;

function fxSheet(cols: number, frames: [number, [PC, PC]][]): PC {
  const out = new PC(N * cols, N * 2);
  for (const [col, [b, f]] of frames) {
    out.blit(b, col * N, 0);
    out.blit(f, col * N, N);
  }
  return out;
}
export function buildFistFx(): PC {
  const fr: [number, [PC, PC]][] = [];
  for (let i = 0; i < FIST_FX.crater.n; i++) fr.push([FIST_FX.crater.col + i, fistCraterFrame(i)]);
  for (let i = 0; i < FIST_FX.burst.n; i++) fr.push([FIST_FX.burst.col + i, burstFrame(i, 21)]);
  return fxSheet(FIST_FX_COLS, fr);
}
export function buildSlabFx(): PC {
  const fr: [number, [PC, PC]][] = [];
  for (let i = 0; i < SLAB_FX.slabRise.n; i++) fr.push([SLAB_FX.slabRise.col + i, slabFrame("rise", i)]);
  for (let i = 0; i < SLAB_FX.slabHold.n; i++) fr.push([SLAB_FX.slabHold.col + i, slabFrame("hold", i)]);
  for (let i = 0; i < SLAB_FX.slabStrike.n; i++) fr.push([SLAB_FX.slabStrike.col + i, slabFrame("strike", i)]);
  for (let i = 0; i < SLAB_FX.dropWarn.n; i++) fr.push([SLAB_FX.dropWarn.col + i, dropFrame("warn", i)]);
  for (let i = 0; i < SLAB_FX.dropFall.n; i++) fr.push([SLAB_FX.dropFall.col + i, dropFrame("fall", i)]);
  return fxSheet(SLAB_FX_COLS, fr);
}
export function buildPulseFx(): PC {
  const fr: [number, [PC, PC]][] = [];
  for (let i = 0; i < PULSE_FX.pulse.n; i++) fr.push([PULSE_FX.pulse.col + i, pulseFrame(i, 33)]);
  return fxSheet(PULSE_FX_COLS, fr);
}

// ---------------- монтажи для утверждения ----------------
function loadPC(file: string): PC {
  const png = PNG.sync.read(fs.readFileSync(file));
  const c = new PC(png.width, png.height);
  c.data.set(png.data);
  return c;
}
function crop(src: PC, x: number, y: number, w: number, h: number): PC {
  const o = new PC(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = src.get(x + i, y + j);
    if (c && c[3]) o.set(i, j, c);
  }
  return o;
}
function scaleNN(src: PC, k: number, flip = false): PC {
  const o = new PC(src.w * k, src.h * k);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const sx = Math.floor(x / k);
    const c = src.get(flip ? src.w - 1 - sx : sx, Math.floor(y / k))!;
    if (c[3]) {
      const i = (y * o.w + x) * 4;
      o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2]; o.data[i + 3] = c[3];
    }
  }
  return o;
}
/** Уменьшение с усреднением (для образца). */
function scaleBox(src: PC, w: number, h: number): PC {
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
function fill(c: PC, x: number, y: number, w: number, h: number, col: RGBA) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (c.inside(i, j)) c.data.set(col, (j * c.w + i) * 4);
}
/** Строки атласа tiles/terrain.png (как у пилота): трава и земля. */
const GROUND_ROW = { grass: 6, earth: 5 } as const;
type Ground = keyof typeof GROUND_ROW;
function groundBg(c: PC, terrain: PC, x0: number, y0: number, w: number, h: number, k: number, g: Ground = "grass") {
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
function shadowBlob(c: PC, cx: number, cy: number, rx: number, ry: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d < 1) c.set(x, y, [10, 20, 8, Math.round(90 * (1 - d * d))]);
  }
}
/** Метка предупреждения (как рисует клиент): красный круг или кольцо, полупрозрачная заливка, обод. Масштаб k. */
function teleMark(c: PC, cx: number, cy: number, r1: number, r2: number, k: number) {
  const R = Math.max(r1, r2);
  for (let y = Math.floor(cy - R * k - 2); y <= cy + R * k + 2; y++) for (let x = Math.floor(cx - R * k - 2); x <= cx + R * k + 2; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / k;
    const inRing = r2 > 0 ? d >= r1 && d <= r2 : d <= r1;
    const edge = r2 > 0 ? Math.abs(d - r1) < 0.5 || Math.abs(d - r2) < 0.5 : Math.abs(d - r1) < 0.5;
    if (edge) c.set(x, y, [235, 70, 50, 230]);
    else if (inRing) c.set(x, y, [220, 60, 40, 46]);
  }
}

// подписи: моноширинный пиксельный шрифт 5×7 (кириллица, цифры) — как у пилота
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
  "→": ["     ", "  #  ", "   # ", "#####", "   # ", "  #  ", "     "],
  ",": ["     ", "     ", "     ", "     ", "     ", "  #  ", " #   "],
  "(": ["   # ", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   # "],
  ")": [" #   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", " #   "],
  "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
};
function text(c: PC, s: string, x: number, y: number, k = 2, col: RGBA = [240, 232, 214, 255]) {
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

/** Кадр эффекта (нижний и верхний слой) из листа. */
const fxLayer = (sheet: PC, col: number, row: number) => crop(sheet, col * N, row * N, N, N);

/**
 * Монтаж: голем рядом с героем 32×32 на траве и на земле (×3), раскадровки каждой анимации (×2, вниз и вбок), эффекты
 * мира по кадрам с героем для масштаба и три сцены умений (×2) — метки, голем и эффекты в момент удара.
 */
function buildPreview(sheets: Record<GolemAnim, PC>, fist: PC, slab: PC, pulse: PC, hero: PC, terrain: PC): PC {
  const W = 1660;
  const rows: { h: number; draw: (c: PC, y: number) => void }[] = [];
  const BG: RGBA = [24, 20, 26, 255];
  const frameOf = (a: GolemAnim, view: number, i: number) => crop(sheets[a], i * N, view * N, N, N);
  const heroDown = crop(hero, 0, 0, 32, 32);
  const heroSide = crop(hero, 0, 64, 32, 32);
  for (const g of ["grass", "earth"] as Ground[]) {
    rows.push({
      h: 64 * 3 + 40,
      draw: (c, y0) => {
        const k = 3;
        text(c, `×3 · ГЕРОЙ 32 И ГОЛЕМ 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · ${g === "grass" ? "ТРАВА" : "ЗЕМЛЯ"}`, 16, y0 + 8);
        const y = y0 + 36;
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, g);
        let x = 40;
        const hy = y + (64 - 32) * k;
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroDown, k), x, hy);
        x += 30 * k;
        for (const [v, flip] of [[0, false], [1, false], [2, false], [2, true]] as [number, boolean][]) {
          shadowBlob(c, x + 32 * k, y + 60 * k, 20 * k, 5 * k);
          c.blit(scaleNN(frameOf("idle", v, 0), k, flip), x, y);
          x += 64 * k;
        }
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroSide, k, true), x, hy);
      },
    });
  }
  for (const a of Object.keys(GOLEM_ANIMS) as GolemAnim[]) {
    const A = GOLEM_ANIMS[a];
    rows.push({
      h: 64 * 2 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.next ? ` · → ${GOLEM_ANIMS[A.next].ru}` : ""}`, 16, y0 + 8);
        for (const v of [0, 2]) {
          const y = y0 + 34 + (v === 0 ? 0 : 64 * k);
          groundBg(c, terrain, 16, y, W - 32, 64 * k, k, a === "walk" && v === 2 ? "earth" : "grass");
          let x = 24;
          const hy = y + (64 - 32) * k;
          shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
          c.blit(scaleNN(v === 0 ? heroDown : heroSide, k, v === 2), x, hy);
          x += 30 * k;
          for (let i = 0; i < A.n; i++) {
            shadowBlob(c, x + 32 * k, y + 60 * k, 20 * k, 5 * k);
            c.blit(scaleNN(frameOf(a, v, i), k), x, y);
            x += 64 * k;
          }
        }
      },
    });
  }
  // эффекты мира по кадрам: нижний слой, герой (для масштаба), верхний слой
  const fxRow = (title: string, items: { sheet: PC; col: number; heroAt?: [number, number] }[], bg: Ground = "grass") => rows.push({
    h: 64 * 2 + 40,
    draw: (c, y0) => {
      const k = 2;
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, terrain, 16, y, W - 32, 64 * k, k, bg);
      let x = 24;
      for (const it of items) {
        c.blit(scaleNN(fxLayer(it.sheet, it.col, 0), k), x, y);
        if (it.heroAt) {
          shadowBlob(c, x + it.heroAt[0] * k, y + it.heroAt[1] * k, 7 * k, 2.4 * k);
          c.blit(scaleNN(heroDown, k), x + (it.heroAt[0] - 16) * k, y + (it.heroAt[1] - 30) * k);
        }
        c.blit(scaleNN(fxLayer(it.sheet, it.col, 1), k), x, y);
        x += 50 * k;
        if (x + 64 * k > W - 16) break;
      }
    },
  });
  const range = (col: number, n: number, heroAt?: [number, number]) => Array.from({ length: n }, (_, i) => ({ col: col + i, heroAt }));
  fxRow("×2 · ЭФФЕКТ МИРА · КУЛАК РУН: КРАТЕР ПОД ТАНКОМ 10 · КАМЕННЫЕ ШИПЫ ПО КРУГУ 6 · 12 К/С",
    [...range(FIST_FX.crater.col, FIST_FX.crater.n, [FX_AX, FX_AY]), ...range(FIST_FX.burst.col, FIST_FX.burst.n)].map((it) => ({ sheet: fist, ...it })));
  fxRow("×2 · ЭФФЕКТ МИРА · КАМЕННЫЙ МЕШОК: ПЛИТА КОЛЬЦА — ВЫХОД 6 · УДЕРЖАНИЕ 4 · УДАР 8 · 12 К/С",
    [...range(SLAB_FX.slabRise.col, SLAB_FX.slabRise.n), ...range(SLAB_FX.slabHold.col, SLAB_FX.slabHold.n), ...range(SLAB_FX.slabStrike.col, SLAB_FX.slabStrike.n)].map((it) => ({ sheet: slab, ...it })));
  fxRow("×2 · ЭФФЕКТ МИРА · КАМЕННЫЙ МЕШОК: ПЛИТА-КРЫШКА — ТЕНЬ 4 (ПО КРУГУ) · ПАДЕНИЕ 10 · 12 К/С",
    [...range(SLAB_FX.dropWarn.col, SLAB_FX.dropWarn.n, [FX_AX, FX_AY]), ...range(SLAB_FX.dropFall.col, SLAB_FX.dropFall.n)].map((it) => ({ sheet: slab, ...it })));
  fxRow("×2 · ЭФФЕКТ МИРА · ПУЛЬС РУН: ВЫБРОС ПО КОЛЬЦУ 8 · 12 К/С",
    range(PULSE_FX.pulse.col, PULSE_FX.pulse.n).map((it) => ({ sheet: pulse, ...it })), "earth");
  // сцены умений: метки (как у клиента), голем, герои, эффекты — в один момент времени
  rows.push({
    h: 220 * 2 + 40,
    draw: (c, y0) => {
      const k = 2, SH = 220;
      text(c, "×2 · СЦЕНЫ: КУЛАК РУН (УДАР) · КАМЕННЫЙ МЕШОК (ПЛИТЫ ДЕРЖАТ, ТЕНЬ КРЫШКИ) · ПУЛЬС РУН (УДАР)", 16, y0 + 8);
      // каждая сцена рисуется в свой холст и обрезается по нему: метки и эффекты не вылезают за рамку
      const scene = (sx: number, SW: number, draw: (put: (img: PC, x: number, y: number) => void, mark: (x: number, y: number, r1: number, r2: number) => void) => void) => {
        const p = new PC(SW * k, SH * k);
        groundBg(p, terrain, 0, 0, SW * k, SH * k, k, "grass");
        const put = (img: PC, x: number, yy: number) => p.blit(scaleNN(img, k), x * k, yy * k);
        const mark = (x: number, yy: number, r1: number, r2: number) => teleMark(p, x * k, yy * k, r1, r2, k);
        draw(put, mark);
        c.blit(p, sx, y0 + 34);
      };
      const S1 = 244, S2 = 226, S3 = 326;
      const heroAt = (put: (img: PC, x: number, y: number) => void, x: number, y: number, img = heroDown) => {
        put(img, x - 16, y - 30);
      };
      // 1: кулак рун — голем бьёт, у танка кратер, по кругу шипы
      scene(24, S1, (put, mark) => {
        const bx = 64, by = 104, tank: [number, number] = [134, 126];
        mark(tank[0], tank[1], 72, 0);
        put(fxLayer(fist, FIST_FX.crater.col + 2, 0), tank[0] - FX_AX, tank[1] - FX_AY);
        const bursts = [[0.3, 36], [1.4, 36], [2.5, 36], [3.6, 36], [4.7, 36], [5.8, 36]].map(([a, r]) => [tank[0] + Math.cos(a) * r, tank[1] + Math.sin(a) * r]);
        for (const [x, y] of bursts) put(fxLayer(fist, FIST_FX.burst.col + 1, 0), x - FX_AX, y - FX_AY);
        put(frameOf("fistSlam", 0, 3), bx - 32, by - 60);
        heroAt(put, tank[0], tank[1]);
        for (const [x, y] of bursts) put(fxLayer(fist, FIST_FX.burst.col + 1, 1), x - FX_AX, y - FX_AY);
        put(fxLayer(fist, FIST_FX.crater.col + 2, 1), tank[0] - FX_AX, tank[1] - FX_AY);
      });
      // 2: каменный мешок — плиты кольцом вокруг дальнего героя, в середине тень крышки
      scene(24 + S1 * k + 12, S2, (put, mark) => {
        const h: [number, number] = [134, 108];
        mark(h[0], h[1], 40, 100);
        mark(h[0], h[1], 40, 0);
        put(fxLayer(slab, SLAB_FX.dropWarn.col + 2, 0), h[0] - FX_AX, h[1] - FX_AY);
        const n = 10, pts: [number, number][] = [];
        for (let j = 0; j < n; j++) { const a = (j / n) * TAU + 0.2; pts.push([h[0] + Math.cos(a) * 70, h[1] + Math.sin(a) * 70]); }
        pts.sort((p, q) => p[1] - q[1]);
        put(frameOf("cageHold", 0, 1), 22 - 32, 196 - 60);
        for (const [x, y] of pts.filter((p) => p[1] <= h[1])) put(fxLayer(slab, SLAB_FX.slabHold.col + 1, 0), x - FX_AX, y - FX_AY);
        heroAt(put, h[0], h[1]);
        for (const [x, y] of pts.filter((p) => p[1] > h[1])) put(fxLayer(slab, SLAB_FX.slabHold.col + 1, 0), x - FX_AX, y - FX_AY);
        put(fxLayer(slab, SLAB_FX.dropWarn.col + 2, 1), h[0] - FX_AX, h[1] - FX_AY);
      });
      // 3: пульс рун — кольцо вокруг голема, выбросы по кольцу; герой прижался к голему
      scene(24 + (S1 + S2) * k + 24, S3, (put, mark) => {
        const b: [number, number] = [163, 116];
        mark(b[0], b[1], 56, 150);
        const pts: [number, number][] = [];
        for (const [r, n, o] of [[78, 12, 0], [118, 16, 0.2]] as [number, number, number][]) for (let j = 0; j < n; j++) {
          const a = (j / n) * TAU + o;
          pts.push([b[0] + Math.cos(a) * r, b[1] + Math.sin(a) * r]);
        }
        pts.sort((p, q) => p[1] - q[1]);
        for (const [x, y] of pts) put(fxLayer(pulse, PULSE_FX.pulse.col + 2, 0), x - FX_AX, y - FX_AY);
        put(frameOf("pulseBurst", 0, 2), b[0] - 32, b[1] - 60);
        heroAt(put, b[0] + 36, b[1] + 10);
        for (const [x, y] of pts) put(fxLayer(pulse, PULSE_FX.pulse.col + 2, 1), x - FX_AX, y - FX_AY);
      });
    },
  });
  const H = rows.reduce((s, r) => s + r.h + 12, 12);
  const c = new PC(W, H);
  fill(c, 0, 0, W, H, BG);
  let y = 12;
  for (const r of rows) {
    r.draw(c, y);
    y += r.h + 12;
  }
  return c;
}

/** «Наш | референс»: голем вниз и вбок (покой) крупно и образец 16 той же высоты. */
function buildCompare(sheets: Record<GolemAnim, PC>, ref: PC | null): PC {
  const k = 6;
  const ours = crop(sheets.idle, 0, 0, N, N);
  const side = crop(sheets.idle, 0, 2 * N, N, N);
  const H = N * k;
  const refC = ref ? crop(ref, 60, 30, 900, 960) : null;
  const refS = refC ? scaleBox(refC, Math.round((900 * H) / 960), H) : null;
  const W = 24 + N * k + 16 + N * k + 24 + (refS ? refS.w + 24 : 0);
  const c = new PC(W, H + 72);
  fill(c, 0, 0, W, H + 72, [36, 32, 38, 255]);
  text(c, "НАШ", 24, 14, 3);
  if (refS) text(c, "РЕФЕРЕНС 16", 24 + 2 * N * k + 40, 14, 3);
  const y = 52;
  fill(c, 24, y, 2 * N * k + 16, H, [214, 208, 196, 255]);
  c.blit(scaleNN(ours, k), 24, y);
  c.blit(scaleNN(side, k), 24 + N * k + 16, y);
  if (refS) {
    fill(c, 24 + 2 * N * k + 16 + 8, y, 4, H, [240, 232, 214, 255]);
    c.blit(refS, 24 + 2 * N * k + 40, y);
  }
  return c;
}

/** Просмотр с анимацией: листы встроены в страницу (data:); умения — по таймингам карточки, метки — как рисует клиент. */
function buildHtml(sheet: PC, fist: PC, slab: PC, pulse: PC, hero: PC, terrain: PC, skills: { id: string; name: string; windupMs: number; r?: number; r2?: number; then?: { r: number; windupMs: number }[] }[]): string {
  const png = (c: PC) => {
    const p = new PNG({ width: c.w, height: c.h });
    Buffer.from(c.data.buffer).copy(p.data);
    return "data:image/png;base64," + PNG.sync.write(p).toString("base64");
  };
  const grounds = (["grass", "earth"] as Ground[]).map((g) => png(crop(terrain, 14 * 32, GROUND_ROW[g] * 32, 128, 32)));
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Рунолит Безмолвный — анимации</title>
<style>
:root { --bg: #18141a; --fg: #efe6d2; --dim: #bdb09c; --line: #4d3f4a; --gold: #d6a84b; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, "Segoe UI", sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 20px 0 6px; }
p { color: var(--dim); margin: 0 0 12px; max-width: 900px; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; align-items: center; }
button { background: #2a2230; color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 12px; font: inherit; cursor: pointer; }
button.on { border-color: var(--gold); color: var(--gold); }
.stage { display: flex; flex-wrap: wrap; gap: 12px; }
canvas { image-rendering: pixelated; border-radius: 6px; max-width: 100%; }
label { color: var(--dim); }
</style>
</head>
<body>
<h1>Рунолит Безмолвный — страж древних курганов</h1>
<p>Кадр 64×64, рядом герой 32×32; масштаб игры. Вниз, вверх, вбок, влево (отражение). Скорость — как в листе.</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0" checked> трава</label><label><input type="radio" name="g" value="1"> земля</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Замах длится windupMs из карточки (связка «замах → удержание по кругу»), кадр удара — ровно в конце предупреждения. Красные круги и кольца — метки предупреждения (в игре их рисует клиент). «Кулак рун» — кратер под танком и каменные шипы волной до края круга; «Каменный мешок» — плиты кольцом вокруг дальнего героя, удар, затем тень и падение плиты-крышки в середину; «Пульс рун» — выбросы света волной по кольцу.</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const ANIMS = ${JSON.stringify(GOLEM_ANIMS)};
const SKILLS = ${JSON.stringify(skills.map((s) => ({ ...s, ...GOLEM_SKILLS[s.id] })))};
const FIST = ${JSON.stringify(FIST_FX)}, SLAB = ${JSON.stringify(SLAB_FX)}, PULSE = ${JSON.stringify(PULSE_FX)};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${png(sheet)}"), fistImg = img("${png(fist)}"), slabImg = img("${png(slab)}"), pulseImg = img("${png(pulse)}"), hero = img("${png(hero)}");
const grounds = [img("${grounds[0]}"), img("${grounds[1]}")];
let anim = "idle", zoom = 3, ground = 0, frame = 0, last = 0, held = 0;
const views = [["вниз", 0, false], ["вверх", 1, false], ["вбок", 2, false], ["влево", 2, true]];
const bar = document.getElementById("anims");
for (const k of Object.keys(ANIMS)) {
  const b = document.createElement("button");
  b.textContent = ANIMS[k].ru + " · " + ANIMS[k].n + " · " + ANIMS[k].fps + " к/с";
  b.onclick = () => { anim = k; frame = 0; held = 0; [...bar.children].forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
  if (k === anim) b.classList.add("on");
  bar.appendChild(b);
}
document.querySelectorAll("input[name=z]").forEach((r) => r.onchange = () => { zoom = +r.value; build(); });
document.querySelectorAll("input[name=g]").forEach((r) => r.onchange = () => { ground = +r.value; });
let canvases = [];
function build() {
  const st = document.getElementById("stage"); st.innerHTML = ""; canvases = [];
  for (const v of views) {
    const c = document.createElement("canvas"); c.width = 112 * zoom; c.height = 72 * zoom; c.title = v[0];
    st.appendChild(c); canvases.push([c, v]);
  }
  const a = document.getElementById("arena"); a.width = 380 * zoom; a.height = 300 * zoom;
}
build();
function paintGround(g, w, h) {
  for (let y = 0; y < h; y += 32 * zoom) for (let x = 0; x < w; x += 32 * zoom) g.drawImage(grounds[ground], ((x / zoom / 32 + y / zoom / 32) % 4) * 32, 0, 32, 32, x, y, 32 * zoom, 32 * zoom);
}
function drawBoss(g, col, row, flip, bx, by) {
  g.save();
  if (flip) { g.translate((bx + 64) * zoom, by * zoom); g.scale(-1, 1); } else g.translate(bx * zoom, by * zoom);
  g.drawImage(sheet, col * 64, row * 64, 64, 64, 0, 0, 64 * zoom, 64 * zoom);
  g.restore();
}
function shadow(g, x, y, rx, ry) { g.fillStyle = "rgba(10,20,8,.35)"; g.beginPath(); g.ellipse(x * zoom, y * zoom, rx * zoom, ry * zoom, 0, 0, 7); g.fill(); }
function draw(ts) {
  const A = ANIMS[anim];
  for (const [c, [name, row, flip]] of canvases) {
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    paintGround(g, c.width, c.height);
    const bx = 40, by = 4;
    shadow(g, bx + 32, by + 60, 20, 5); shadow(g, 18, by + 62, 7, 2.4);
    drawBoss(g, A.col + frame, row, flip, bx, by);
    g.drawImage(hero, 0, row === 1 ? 32 : row === 2 ? 64 : 0, 32, 32, 2 * zoom, (by + 32) * zoom, 32 * zoom, 32 * zoom);
    g.fillStyle = "#efe6d2"; g.font = (6 * zoom) + "px system-ui"; g.fillText(name, 4 * zoom, 10 * zoom);
  }
}
// ---- умения: связка анимаций по времени, эффекты мира в метках ----
const sbar = document.getElementById("skills");
let skill = null, t0 = 0;
for (const s of SKILLS) {
  const b = document.createElement("button");
  b.textContent = s.name + " · замах " + (s.windupMs / 1000).toFixed(1).replace(".", ",") + " с";
  b.onclick = () => { skill = s; t0 = performance.now(); };
  sbar.appendChild(b);
}
function bossFrameAt(s, t) {
  const W = ANIMS[s.windup[0]], Hd = ANIMS[s.windup[1]], St = ANIMS[s.strike];
  const strikeAt = s.windupMs - (St.hit / St.fps) * 1000;
  if (t < 0) return ANIMS.idle.col;
  if (t < Math.min(strikeAt, (W.n / W.fps) * 1000)) return W.col + Math.min(W.n - 1, Math.floor((t / 1000) * W.fps));
  if (t < strikeAt) return Hd.col + (Math.floor(((t - (W.n / W.fps) * 1000) / 1000) * Hd.fps) % Hd.n);
  const k = Math.floor(((t - strikeAt) / 1000) * St.fps);
  return k < St.n ? St.col + k : ANIMS.idle.col + (Math.floor((t / 1000) * 12) % 12);
}
/** Кадр одноразовой анимации эффекта A, чей кадр hit приходится на момент tHit (мс); -1 — нет кадра. */
function oneShot(A, t, tHit) { const k = Math.floor(((t - tHit) / 1000) * A.fps) + (A.hit || 0); return k >= 0 && k < A.n ? A.col + k : -1; }
function mark(g, x, y, r1, r2) {
  g.fillStyle = "rgba(220,60,40,.18)"; g.strokeStyle = "#eb4632"; g.lineWidth = zoom;
  g.beginPath(); g.arc(x * zoom, y * zoom, (r2 || r1) * zoom, 0, 7);
  if (r2) g.arc(x * zoom, y * zoom, r1 * zoom, 7, 0, true);
  g.fill("evenodd"); g.stroke();
  if (r2) { g.beginPath(); g.arc(x * zoom, y * zoom, r1 * zoom, 0, 7); g.stroke(); }
}
function fxAt(g, im, col, row, x, y) { if (col >= 0) g.drawImage(im, col * 64, row * 64, 64, 64, (x - 32) * zoom, (y - 46) * zoom, 64 * zoom, 64 * zoom); }
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  const bx = 120, by = 70, foot = [bx + 32, by + 60];
  const t = skill ? ts - t0 : -1;
  const tank = [foot[0] + 34, foot[1] + 22], far = [foot[0] + 150, foot[1] + 70], side = [foot[0] - 110, foot[1] + 60];
  const heroes = [tank, far, side];
  const W = skill ? skill.windupMs : 0;
  const fx = [];
  if (skill && skill.fx === "fist") {
    if (t >= 0 && t < W) mark(g, tank[0], tank[1], skill.r);
    fx.push([fistImg, oneShot(FIST.crater, t, W), tank]);
    for (const [r, n, d] of [[36, 6, 90], [60, 9, 180]]) for (let j = 0; j < n; j++) {
      const ang = (j / n) * Math.PI * 2 + r * 0.01;
      fx.push([fistImg, oneShot(FIST.burst, t, W + d), [tank[0] + Math.cos(ang) * r, tank[1] + Math.sin(ang) * r]]);
    }
  }
  if (skill && skill.fx === "cage") {
    const T2 = W + (skill.then && skill.then[0] ? skill.then[0].windupMs : 1000);
    if (t >= 0 && t < W) mark(g, far[0], far[1], skill.r, skill.r2);
    if (t >= W && t < T2) mark(g, far[0], far[1], skill.then[0].r);
    const R = (skill.r + skill.r2) / 2, n = 10;
    for (let j = 0; j < n; j++) {
      const ang = (j / n) * Math.PI * 2 + 0.2;
      const p = [far[0] + Math.cos(ang) * R, far[1] + Math.sin(ang) * R];
      const strikeAt = W - (SLAB.slabStrike.hit / 12) * 1000;
      let col = -1;
      if (t >= 0 && t < strikeAt) { const k = Math.floor((t / 1000) * 12); col = k < SLAB.slabRise.n ? SLAB.slabRise.col + k : SLAB.slabHold.col + ((k - SLAB.slabRise.n) % SLAB.slabHold.n); }
      else col = oneShot(SLAB.slabStrike, t, W);
      fx.push([slabImg, col, p]);
    }
    let dc = -1;
    if (t >= W && t < T2 - (SLAB.dropFall.hit / 12) * 1000) dc = SLAB.dropWarn.col + (Math.floor(((t - W) / 1000) * 12) % SLAB.dropWarn.n);
    else dc = oneShot(SLAB.dropFall, t, T2);
    fx.push([slabImg, dc, far]);
  }
  if (skill && skill.fx === "pulse") {
    if (t >= 0 && t < W) mark(g, foot[0], foot[1], skill.r, skill.r2);
    for (const [r, n] of [[70, 12], [98, 16], [126, 20]]) for (let j = 0; j < n; j++) {
      const ang = (j / n) * Math.PI * 2 + r * 0.013;
      const d = ((r - skill.r) / (skill.r2 - skill.r)) * 220;
      fx.push([pulseImg, oneShot(PULSE.pulse, t, W + d), [foot[0] + Math.cos(ang) * r, foot[1] + Math.sin(ang) * r]]);
    }
  }
  fx.sort((p, q) => p[2][1] - q[2][1]);
  for (const [im, col, p] of fx) fxAt(g, im, col, 0, p[0], p[1]);
  const units = [[foot[1], () => { shadow(g, foot[0], foot[1], 20, 5); drawBoss(g, skill ? bossFrameAt(skill, t) : ANIMS.idle.col + (Math.floor(ts / 1000 * 12) % 12), 0, false, bx, by); }]];
  for (const h of heroes) units.push([h[1], () => { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); }]);
  units.sort((p, q) => p[0] - q[0]);
  for (const [, f] of units) f();
  for (const [im, col, p] of fx) fxAt(g, im, col, 1, p[0], p[1]);
  if (skill && t > W + 3200) skill = null;
}
requestAnimationFrame(function loop(ts) {
  const A = ANIMS[anim];
  if (ts - last >= 1000 / A.fps) {
    last = ts;
    if (frame < A.n - 1) frame++;
    else if (A.loop) frame = 0;
    else if (++held > A.fps) { held = 0; frame = 0; }
  }
  draw(ts);
  drawArena(ts);
  requestAnimationFrame(loop);
});
</script>
</body>
</html>
`;
}

/** Всё для утверждения: листы анимаций, общий лист, эффекты мира, монтажи и страница просмотра. */
/**
 * Проверка поля: в каждом кадре 64×64 столбцы x = 0 и x = 63 и ряд y = 0 прозрачны — иначе часть фигуры обрезана ровной
 * линией без контура (а на листе слипается с соседним кадром). Возвращает «вид кадр: край (пикселей)».
 */
export function frameEdgeHits(sheet: PC): string[] {
  const out: string[] = [];
  for (let row = 0; row < sheet.h / N; row++) for (let col = 0; col < sheet.w / N; col++) {
    const ox = col * N, oy = row * N;
    let l = 0, r = 0, t = 0;
    for (let k = 0; k < N; k++) {
      if (sheet.alpha(ox, oy + k) > 0) l++;
      if (sheet.alpha(ox + N - 1, oy + k) > 0) r++;
      if (sheet.alpha(ox + k, oy) > 0) t++;
    }
    if (l || r || t) out.push(`${VIEWS[row] ?? row} ${col}: ${[l && `x=0 (${l})`, r && `x=63 (${r})`, t && `y=0 (${t})`].filter(Boolean).join(", ")}`);
  }
  return out;
}

export function writeGolemArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => {
    const f = path.join(outDir, name);
    c.save(f);
    files.push(f);
    return c;
  };
  const id = "sol_rune_golem";
  const sheets = {} as Record<GolemAnim, PC>;
  for (const a of Object.keys(GOLEM_ANIMS) as GolemAnim[]) sheets[a] = save(buildGolemAnim(a), `${id}-${a}.png`);
  const clipped = Object.entries(sheets).flatMap(([a, c]) => frameEdgeHits(c).map((h) => `${a} ${h}`));
  if (clipped.length) throw new Error(`Рунолит выходит за кадр (крайний столбец/верхний ряд непрозрачны): ${clipped.join("; ")}`);
  const sheet = save(buildGolemSheet(sheets), `${id}-sheet.png`);
  const fist = save(buildFistFx(), `${id}-fistfx.png`);
  const slab = save(buildSlabFx(), `${id}-slabfx.png`);
  const pulse = save(buildPulseFx(), `${id}-pulsefx.png`);
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "bosses", "16.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  save(buildPreview(sheets, fist, slab, pulse, hero, terrain), `${id}-preview.png`);
  save(buildCompare(sheets, ref), `${id}-compare.png`);
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "zone-bosses.json"), "utf8")) as {
    bosses: { id: string; abilities: { id: string; name: string; windupMs: number; r?: number; r2?: number; then?: { r: number; windupMs: number }[] }[] }[];
  };
  const skills = (data.bosses.find((b) => b.id === id)?.abilities ?? []).map(({ id: sid, name, windupMs, r, r2, then }) => ({ id: sid, name, windupMs, r, r2, then }));
  const html = path.join(outDir, `${id}-anim.html`);
  fs.writeFileSync(html, buildHtml(sheet, fist, slab, pulse, hero, terrain, skills), "utf8");
  files.push(html);
  return files;
}

export const GOLEM_TEST = { REST, VIEWS, POSES };
