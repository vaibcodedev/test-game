/**
 * Задача 139, босс кольца: жнец с двумя серпами (восток, слот r79s, Грозовой хребет, ур. 79, группа 5; референс 20 — только для сравнения: чужой арт в игру и в git не идёт).
 * Метод — как у марионетки (umb_bone_marionette.ts): 2D-штампы по скелету в «теле» (x — вбок, y — вниз, z — к зрителю), тело в 2× (160×160) сводится в кадр 80×80, ступни y≈76, контур 1 px.
 * Вид 3/4: точки ближе к зрителю чуть ниже (y + z·TILT), поворот вида: вниз (анфас), вверх (спина), вбок (три четверти); влево — зеркало вбок (в игре); вращение «размаха» — тот же поворот по кадрам.
 * Образ: высокий поджарый мертвец серо-пепельной кожи, острый капюшон и костяная маска-оскал с глазами-огнями души, рваная мантия с костяными рогами на плечах,
 * накрест цепи по груди, рваный плащ-хвост за спиной (развевается), набедренник, обмотки на голенях, босые ступни; четыре руки: верхние держат два серпа
 * (короткое древко в кулаке, крупное лезвие-полумесяц изогнуто наружу над плечом, зазубренный обух, светлая кромка), нижние — раскрытые ладони с холодным огнём души.
 * Оглушение — поник, серпы клинками вниз, над головой звёзды-искры и дым; гибель — серпы падают наземь, тело осыпается в прах сверху вниз, остаются пепел и маска.
 * Свечение (глаза, огонь душ, метка) — лист reaper-glow.png (по цветам свечения). Ночью — тот же лист поверх затемнения.
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/umb_twin_reaper.ts [--quick] [--only=idle,walk]
 *   → reaper-sheet.png, reaper-glow.png, reaper-fx-duel.png, r79s-e-compare.png («наш | референс 20»), r79s-e-sheet.png (превью листа), r79s-e-anims.png
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { C, Cv, F, Mk, BAY, OUTL, SIL, hash, hx, label } from "./mino_lib";
F["0"] ??= "111,101,101,101,111"; F["6"] ??= "011,100,111,101,111"; F["9"] ??= "111,101,111,001,110"; F["7"] ??= "111,001,010,010,010"; F["8"] ??= "111,101,111,101,111";

export const ID = "umb_twin_reaper";
export const FRAME = 80;
export const FRAME_H = 80;
const Z = 2, W = 160, FR = 80, TILT = 0.22;
/** масштаб тела в кадре (вокруг точки опоры 40, 76) */
const K = 1.06;
const SIN = Math.sin, COS = Math.cos, PI = Math.PI;
type V2 = [number, number];
type V3 = [number, number, number];
export type ViewId = "front" | "back" | "side";
const VIEWS: ViewId[] = ["front", "back", "side"];

// ---------------- палитры ----------------
/** кожа: пепельно-серая, холодная (тёмный тон — фиолетово-серый, не чёрный) */
const FLESH: C[] = ["#16141b", "#2b2832", "#45414c", "#625e68", "#857f88", "#aaa3a8"].map(hx);
/** ткань: угольно-бурая, теплее кожи — читается отдельно от тела */
const CLOTH: C[] = ["#0b090b", "#181316", "#271f22", "#382c2f", "#4c3d3e", "#62504e"].map(hx);
const BONE: C[] = ["#2a2520", "#554b42", "#8a7f70", "#bcb19d", "#e2d9c6"].map(hx);
const IRON: C[] = ["#08070a", "#171419", "#2a252b", "#433b42", "#655b62", "#928790", "#cbc2c4"].map(hx);
const WOOD: C[] = ["#110c0a", "#221813", "#36271e", "#4f3a2b", "#6a503b"].map(hx);
const LEATH: C[] = ["#140f0d", "#28201b", "#3f322a", "#5a4838", "#74604a"].map(hx);
const EDGE = hx("#e6e0dc");
const ASH: C[] = ["#2c2a2e", "#46434a", "#646068", "#8a858c", "#b0abae"].map(hx);
const MIST: C[] = ["#2e3844", "#46525e", "#64707c", "#8894a0", "#b2bcc4"].map(hx);
// свечение (уникальные цвета — по ним собирается лист свечения)
const SOUL3 = hx("#f2fbff"), SOUL2 = hx("#bfe9fa"), SOUL1 = hx("#74c4e6"), SOUL0 = hx("#3a7fa6"), SOULOFF = hx("#22323e");
const MARK1 = hx("#ffd2a0"), MARK0 = hx("#e0703c");
const GLOWSET = new Set([SOUL3, SOUL2, SOUL1, SOUL0, MARK1, MARK0].map((c) => c.join()));

// ---------------- маска с рамкой ----------------
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
  ellR(cx: number, cy: number, rx: number, ry: number, ang = 0, v = 1) {
    const R = Math.max(rx, ry) + 1, cs = COS(ang), sn = SIN(ang);
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(this.h - 1, Math.ceil(cy + R)); y++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(this.w - 1, Math.ceil(cx + R)); x++) {
      const px = x + 0.5 - cx, py = y + 0.5 - cy, u = (px * cs + py * sn) / rx, w = (-px * sn + py * cs) / ry;
      if (u * u + w * w <= 1) this.set(x, y, v);
    }
  }
  empty() { return this.bx1 < 0; }
  override dist(): Int16Array {
    const w = this.w, h = this.h, d = new Int16Array(w * h);
    if (this.empty()) return d;
    const g = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
    for (let y = this.by0; y <= this.by1; y++) for (let x = this.bx0; x <= this.bx1; x++) { const i = y * w + x; if (this.d[i]) d[i] = Math.min(g(x - 1, y), g(x, y - 1)) + 1; }
    for (let y = this.by1; y >= this.by0; y--) for (let x = this.bx1; x >= this.bx0; x--) { const i = y * w + x; if (this.d[i]) d[i] = Math.min(d[i], g(x + 1, y) + 1, g(x, y + 1) + 1); }
    return d;
  }
}
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
    // дизеринг только блоками 2×2 (после сведения — без однопиксельного шума)
    t += (BAY[((x >> 1) & 1) + ((y >> 1) & 1) * 2] - 0.5) * dith * 0.3;
    cv.set(x, y, ramp[Math.max(0, Math.min(n, Math.round(t)))]);
  }
  return d;
}
const mk = () => new Mb();
const capM = (a: V2, b: V2, t0: number, t1 = t0) => { const m = mk(); m.line(a[0] * Z, a[1] * Z, b[0] * Z, b[1] * Z, t0 * Z * K, t1 * Z * K); return m; };
const discM = (c: V2, r: number) => { const m = mk(); m.disc(c[0] * Z, c[1] * Z, r * Z * K); return m; };
const dot1 = (c: Cv, x: number, y: number, col: C) => { const X = Math.round(x) * Z, Y = Math.round(y) * Z; c.set(X, Y, col); c.set(X + 1, Y, col); c.set(X, Y + 1, col); c.set(X + 1, Y + 1, col); };
const in1 = (m: Mb, x: number, y: number) => m.has(Math.round(x) * Z, Math.round(y) * Z) || m.has(Math.round(x) * Z + 1, Math.round(y) * Z + 1);
const polyM = (pts: V2[]) => { const m = mk(); m.poly(pts.map(([x, y]) => [x * Z, y * Z] as [number, number])); return m; };

// ---------------- вектор ----------------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V3): V3 => mul(a, 1 / (len3(a) || 1));
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rotY = (q: V3, a: number): V3 => [q[0] * COS(a) + q[2] * SIN(a), q[1], -q[0] * SIN(a) + q[2] * COS(a)];
const rotX = (q: V3, a: number): V3 => [q[0], q[1] * COS(a) - q[2] * SIN(a), q[1] * SIN(a) + q[2] * COS(a)];
const rotZ = (q: V3, a: number): V3 => [q[0] * COS(a) - q[1] * SIN(a), q[0] * SIN(a) + q[1] * COS(a), q[2]];
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
/** серп: поворот вокруг вертикали тела (yw), наклон древка наружу (rl), вперёд/назад (pt, минус — верх к зрителю), сдвиг хвата, скольжение хвата вверх по древку (sl), разворот клинка вокруг древка (bt) */
export interface Scy { yw: number; rl: number; pt: number; g: V3; sl: number; bt: number }
export interface Pose {
  bx: number; by: number; bz: number; lean: number; roll: number; tw: number; yaw: number; sy: number;
  head: V2; htilt: number;
  /** серпы: L — левый на экране спереди (s = −1), R — правый */
  sL: Scy; sR: Scy;
  /** ладони нижних рук: сдвиг от покоя; огонь души 0..1,5 */
  pL: V3; pR: V3; fire: number; fireL: number; fireR: number;
  fL: V3; fR: V3;
  /** плащ: ветер (сдвиг подола), взлёт подола (вращение) */
  wind: number; flare: number;
  /** глаза 0..1,5; фаза мерцания; туман у ног 0..1 */
  glow: number; ph: number; mist: number;
  /** эффекты: след клинка (L/R/оба), вспышка удара оземь, души к клинкам, метка в ладони, круг размаха */
  trail: number; trailAt: "L" | "R" | "LR"; stars: number; slam: number; souls: number; orb: number; ring: number;
  /** гибель: распад в прах снизу вверх 0..1, кучка пепла 0..1, серпы отдельным слоем */
  dis: number; ash: number;
}
const SC0: Scy = { yw: 0, rl: 0, pt: 0, g: [0, 0, 0], sl: 0, bt: 0 };
export const REST: Pose = {
  bx: 0, by: 0, bz: 0, lean: 0.06, roll: 0, tw: 0, yaw: 0, sy: 1, head: [0, 0], htilt: 0,
  sL: SC0, sR: SC0, pL: [0, 0, 0], pR: [0, 0, 0], fire: 1, fireL: 1, fireR: 1, fL: [0, 0, 0], fR: [0, 0, 0],
  wind: 0, flare: 0, glow: 1, ph: 0, mist: 0,
  trail: 0, trailAt: "R", stars: 0, slam: 0, souls: 0, orb: 0, ring: 0, dis: 0, ash: 0,
};
const easeIO = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
function blendAny(x: unknown, y: unknown, t: number): unknown {
  if (typeof x === "number") return x + ((y as number) - x) * t;
  if (Array.isArray(x)) return (x as number[]).map((v, i) => v + ((y as number[])[i] - v) * t);
  if (x && typeof x === "object") { const o: Record<string, unknown> = {}; for (const k of Object.keys(x)) o[k] = blendAny((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], t); return o; }
  return t < 0.5 ? x : y;
}
const blend = (a: Pose, b: Pose, t: number) => blendAny(a, b, t) as Pose;
const mkPose = (p: Partial<Pose>): Pose => ({ ...REST, ...p, sL: { ...SC0, ...(p.sL ?? {}) }, sR: { ...SC0, ...(p.sR ?? {}) } });
type PP = Omit<Partial<Pose>, "sL" | "sR"> & { sL?: Partial<Scy>; sR?: Partial<Scy> };
const keyed = (keys: { f: number; p: PP }[], n: number, ease = easeIO, base: PP = {}): Pose[] => {
  const out: Pose[] = [];
  const full = (p: PP) => mkPose({ ...base, ...p, sL: { ...SC0, ...(base.sL ?? {}), ...(p.sL ?? {}) }, sR: { ...SC0, ...(base.sR ?? {}), ...(p.sR ?? {}) } } as Partial<Pose>);
  for (let i = 0; i < n; i++) {
    let a = keys[0], b = keys[keys.length - 1];
    for (let k = 0; k < keys.length - 1; k++) if (i >= keys[k].f && i <= keys[k + 1].f) { a = keys[k]; b = keys[k + 1]; break; }
    const t = a.f === b.f ? 0 : ease((i - a.f) / (b.f - a.f));
    const p = blend(full(a.p), full(b.p), t); p.ph = i; out.push(p);
  }
  return out;
};

// ---------------- проекция ----------------
interface View { a: number; cs: number; sn: number; id: ViewId }
const VIEW = (id: ViewId, extra = 0): View => { const a = (id === "front" ? 0 : id === "back" ? PI : 0.82) + extra; return { id, a, cs: COS(a), sn: SIN(a) }; };
/** тело → кадр: [x, y (ближе к зрителю — ниже, вид 3/4), глубина к зрителю] */
const prj = (v: View, q: V3): V3 => { const z = q[0] * v.sn + q[2] * v.cs; return [40 + (q[0] * v.cs - q[2] * v.sn) * K, 76 + (q[1] + z * TILT - 76) * K, z]; };
const facing = (v: View, n: V3) => n[0] * v.sn + n[2] * v.cs;
const HIPY = 47.5;
/** верх тела: скрутка вокруг вертикали, наклон вокруг таза, крен, сдвиг */
function upT(p: Pose, q: V3): V3 {
  const t = rotY(q, p.tw);
  const x = t[0], y = t[1] - HIPY, z = t[2], cl = COS(p.lean), sl = SIN(p.lean), cr = COS(p.roll), sr = SIN(p.roll);
  const y1 = y * cl + z * sl, z1 = z * cl - y * sl;
  return [x * cr - y1 * sr + p.bx, x * sr + y1 * cr + HIPY + p.by, z1 + p.bz];
}
const lowT = (p: Pose, q: V3): V3 => { const t = rotY(q, p.tw * 0.35); return [t[0] + p.bx + p.roll * 3, t[1] + p.by, t[2] + p.bz]; };

// ---------------- серп ----------------
const SH_UP = 13, SH_DN = 4.5, BL = 16;
interface ScyGeo { s: number; grip: V3; u: V3; b: V3; top: V3; bot: V3; blade: V3[]; tip: V3 }
function scythe(p: Pose, s: number): ScyGeo {
  const c = s < 0 ? p.sL : p.sR;
  const u0 = nrm([s * 0.12, -1, -0.06]), b0: V3 = [s, 0, 0.18];
  const R = (q: V3) => rotY(rotX(rotZ(q, c.rl * s), c.pt), c.yw * s);
  const u = nrm(R(u0));
  // клинок: разворот вокруг древка (bt), затем перпендикуляр к древку
  let b = R(b0);
  if (c.bt) { const w = nrm([u[1] * b[2] - u[2] * b[1], u[2] * b[0] - u[0] * b[2], u[0] * b[1] - u[1] * b[0]]); b = add(mul(b, COS(c.bt)), mul(w, SIN(c.bt) * s)); }
  b = nrm(sub(b, mul(u, dot(b, u))));
  const g0: V3 = [s * (14 + c.g[0]), 40 + c.g[1], 3 + c.g[2]], grip = add(rotY(g0, c.yw * s), [p.bx, p.by, p.bz]);
  const top = add(grip, mul(u, SH_UP - c.sl)), bot = sub(grip, mul(u, SH_DN + c.sl));
  const blade: V3[] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; blade.push(add(add(top, mul(b, BL * Math.pow(t, 0.8))), mul(u, 7 * SIN(PI * t) - 15 * t * t))); }
  return { s, grip, u, b, top, bot, blade, tip: blade[16] };
}

// ---------------- части ----------------
type Part = { z: number; w?: boolean; tag?: string; f: (c: Cv) => void };
const TORSO = [
  { c: [0, 28.6, 0] as V3, r: [7.4, 5.4, 4.4] as V3 },
  { c: [0, 25.6, -0.4] as V3, r: [8.4, 2.8, 3.8] as V3 },
  { c: [0, 37.8, 0.2] as V3, r: [4.4, 5.4, 3.2] as V3 },
  { c: [0, 32.6, 0.1] as V3, r: [6.1, 3.4, 3.9] as V3 },
  { c: [0, 43.5, 0] as V3, r: [5.4, 3.6, 3.6] as V3 },
];
function surf(x: number, y: number, front: boolean): { q: V3; n: V3 } {
  const E = y < 34 ? TORSO[0] : TORSO[2];
  const k = 1 - ((x - E.c[0]) / E.r[0]) ** 2 - ((y - E.c[1]) / E.r[1]) ** 2, zs = E.r[2] * Math.sqrt(Math.max(0, k)) * (front ? 1 : -1);
  return { q: [x, y, E.c[2] + zs], n: [(x - E.c[0]) / E.r[0] ** 2, 0, zs / E.r[2] ** 2] };
}
function horn(c: Cv, a: V2, b: V2, t = 1.6) { const m = capM(a, b, t, 0.5); paintB(c, m, BONE, { amp: 1.4, dome: 1.2, dith: 0, bias: 0.2 }); }

/** Один кадр. layer: all — всё; body — без серпов; weap — только серпы. */
export function render(view: ViewId, p: Pose, opts: { layer?: "all" | "body" | "weap"; skip?: string[]; big?: (c: Cv) => void } = {}): { img: Cv; emis: Cv; tips: V2[]; palms: V2[] } {
  const v = VIEW(view, p.yaw), parts: Part[] = [];
  const P = (q: V3) => prj(v, q), S = (q: V3): V2 => { const r = P(q); return [r[0], r[1]]; };
  const layer = opts.layer ?? "all";
  const ec = p.glow > 0.6 ? SOUL3 : p.glow > 0.25 ? SOUL1 : SOULOFF;
  // суставы
  const sh = (s: number) => upT(p, [s * 9, 24.8, 0]);
  const lsh = (s: number) => upT(p, [s * 6.8, 31.5, -1.3]);
  const hip = (s: number) => lowT(p, [s * 4.4, HIPY, 0]);
  const ankle = (s: number): V3 => { const f = s < 0 ? p.fL : p.fR; return [s * 6.2 + f[0] + p.bx * 0.3, 71.5 + f[1], 0.5 + f[2]]; };
  const palm = (s: number): V3 => { const q = s < 0 ? p.pL : p.pR; return upT(p, [s * 20 + q[0], 44 + q[1], -1.5 + q[2]]); };
  const scy = [scythe(p, -1), scythe(p, 1)];
  const legs = [-1, 1].map((s) => { const H = hip(s), k = ik3(H, ankle(s), 12.8, 12.6, [s * 0.15, 0, 1]); return { s, H, K: k.el, A: k.end }; });
  const arms = [-1, 1].map((s, i) => { const Sh = sh(s), k = ik3(Sh, scy[i].grip, 11.8, 11.8, [s, 0.25, -0.7]); return { s, Sh, E: k.el, Wr: k.end }; });
  const larms = [-1, 1].map((s) => { const Sh = lsh(s), k = ik3(Sh, palm(s), 9.6, 9.6, [s * 0.3, 1, -0.7]); return { s, Sh, E: k.el, Wr: k.end }; });
  const dz = (q: V3) => P(q)[2];

  // ---- плащ-хвост за спиной: полосы ткани от лопаток к земле, рваный подол, ветер ----
  parts.push({ z: -200, tag: "cape", f: (c) => {
    const N = 11, m = mk(), hem: V3[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N - 0.5, top = upT(p, [u * 13, 24, -4.6]);
      const sway = p.wind * (1 + 0.5 * SIN(i * 1.7 + p.ph * 0.9)) * (0.6 + Math.abs(u));
      const tat = (i % 2 ? 5 : 0) + hash(i, 7) * 3.5;
      const bot = lowT(p, [u * (17 + p.flare * 12) + sway, 72 - tat - p.flare * 9 + Math.abs(sway) * 0.4, -7.5 - p.flare * 6 - Math.abs(u) * 2]);
      hem.push(top, bot);
    }
    for (let i = 0; i < N; i++) m.poly([hem[i * 2], hem[i * 2 + 2], hem[i * 2 + 3], hem[i * 2 + 1]].map((q) => { const r = P(q); return [r[0] * Z, r[1] * Z] as [number, number]; }));
    paintB(c, m, CLOTH, { amp: 1.3, dome: 4, dith: 0.3, bias: -0.4 });
    // складки-пелены: полосы через одну светлее (объём ткани), край полосы — тень
    for (let i = 0; i < N; i += 2) { const sm = mk(); sm.poly([hem[i * 2], hem[i * 2 + 2], hem[i * 2 + 3], hem[i * 2 + 1]].map((q) => { const r = P(q); return [r[0] * Z, r[1] * Z] as [number, number]; })); paintB(c, sm, CLOTH, { amp: 1.4, dome: 3, dith: 0.1, bias: 0.1 }); }
    // складки: тёмные борозды
    for (let i = 1; i < N; i += 2) { const a = S(hem[i * 2]), b = S(hem[i * 2 + 1]); for (let k = 4; k <= 30; k++) { const x = a[0] + (b[0] - a[0]) * k / 36, y = a[1] + (b[1] - a[1]) * k / 36; if (in1(m, x, y)) dot1(c, x, y, CLOTH[0]); } }
  } });

  // ---- нижние руки с огнём души (за торсом спереди) ----
  const palms2: V2[] = [[0, 0], [0, 0]];
  for (const A of larms) {
    const zz = (dz(A.E) + dz(A.Wr)) / 2 - 0.8;
    parts.push({ z: zz, tag: "larm", f: (c) => {
      const Sh = S(A.Sh), E = S(A.E), Wr = S(A.Wr), b = A.s * v.cs < 0 && v.id === "side" ? -0.6 : -0.25;
      let m = capM(Sh, E, 2.4, 2); paintB(c, m, FLESH, { amp: 1.5, dome: 3, dith: 0.3, bias: b });
      m = capM(E, Wr, 2, 1.6); paintB(c, m, FLESH, { amp: 1.4, dome: 3, dith: 0.3, bias: b });
      // наруч: кожа с железным кольцом
      const fx = Wr[0] - E[0], fy = Wr[1] - E[1], fl = Math.hypot(fx, fy) || 1;
      const w0: V2 = [E[0] + fx * 0.45, E[1] + fy * 0.45], w1: V2 = [E[0] + fx * 0.85, E[1] + fy * 0.85];
      m = capM(w0, w1, 2.4, 2.2); paintB(c, m, LEATH, { amp: 1.4, dome: 2, dith: 0.2, bias: 0.2 });
      dot1(c, w0[0] + fx / fl, w0[1] + fy / fl, IRON[5]);
      // раскрытая ладонь вверх: пальцы веером
      m = discM(Wr, 1.5); paintB(c, m, FLESH, { amp: 1.5, dome: 2, dith: 0.1, bias: 0.6 });
      for (let k = 0; k < 4; k++) { const a = -PI / 2 + A.s * (0.2 + k * 0.42), q: V2 = [Wr[0] + COS(a) * 2.8 + A.s * 0.6, Wr[1] + SIN(a) * 1.6 - 0.4]; const mm = capM(Wr, q, 1.1, 0.6); paintB(c, mm, FLESH, { amp: 1.2, dome: 1, dith: 0, bias: 0.8 }); }
      palms2[A.s < 0 ? 0 : 1] = [Wr[0], Wr[1] - 1.2];
    } });
  }

  // ---- ноги: бедро, голень в обмотках, босая ступня с пальцами ----
  for (const L of legs) parts.push({ z: -100 + dz(L.K), tag: "leg", f: (c) => {
    const H = S(L.H), K = S(L.K), A = S(L.A), b = L.s * v.cs * (v.id === "side" ? 1 : 0) < 0 ? -0.5 : (v.id === "side" && L.s < 0 ? -0.5 : 0);
    let m = capM(H, K, 3.4, 2.5); paintB(c, m, FLESH, { amp: 1.5, dome: 3, dith: 0.3, bias: b });
    m = discM(K, 2.2); paintB(c, m, FLESH, { amp: 1.7, dome: 3, dith: 0.2, bias: b + 0.5 });
    m = capM(K, A, 2.4, 1.8); paintB(c, m, FLESH, { amp: 1.4, dome: 3, dith: 0.3, bias: b - 0.2 });
    // обмотки: кожаные ремни на нижней половине голени, железное кольцо
    const g0: V2 = [K[0] + (A[0] - K[0]) * 0.42, K[1] + (A[1] - K[1]) * 0.42];
    m = capM(g0, A, 2.9, 2.5); const d = paintB(c, m, LEATH, { amp: 1.4, dome: 2, dith: 0.25, bias: b + 0.1 }); void d;
    for (let k = 1; k <= 3; k++) { const t = k / 4, x = g0[0] + (A[0] - g0[0]) * t, y = g0[1] + (A[1] - g0[1]) * t; for (let q = -2; q <= 2; q++) if (in1(m, x + q, y + q * 0.3)) dot1(c, x + q, y + q * 0.3, LEATH[0]); }
    { const y = g0[1] + 0.5; for (let q = -2; q <= 2; q++) if (in1(m, g0[0] + q, y)) dot1(c, g0[0] + q, y, q < 0 ? IRON[5] : IRON[3]); }
    // ступня: от лодыжки вперёд, пальцы когтями
    const toe: V3 = add(L.A, [L.s * 0.6, 3.4, 3.4]), heel: V3 = add(L.A, [0, 3.2, -1.2]);
    m = capM(S(heel), S(toe), 2.6, 2.2); m.line(A[0] * Z, A[1] * Z, S(heel)[0] * Z, S(heel)[1] * Z, 2.4 * Z, 2.6 * Z);
    paintB(c, m, FLESH, { amp: 1.4, dome: 2, dith: 0.2, bias: b - 0.1 });
    const T = S(toe);
    for (let k = -1; k <= 1; k++) { const x = T[0] + k * 1.1, y = T[1] + 0.6; dot1(c, x, y, FLESH[1]); }
    dot1(c, T[0] - 1, T[1] - 1, FLESH[4]);
  } });

  // ---- набедренник: пояс, длинный рваный клапан спереди и сзади, боковые лоскуты ----
  parts.push({ z: 0.6, tag: "loin", f: (c) => {
    const ring = (y: number, rx: number, rz: number, th: number): V3 => lowT(p, [rx * SIN(th), y, rz * COS(th)]);
    const N = 20, m = mk();
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * 2 * PI, t1 = ((i + 1) / N) * 2 * PI, hem = (k: number) => 50.5 + (k % 2 ? 2 : 0) + hash(k, 5) * 1.5;
      m.poly([ring(43.6, 5.9, 4, t0), ring(43.6, 5.9, 4, t1), ring(hem(i + 1), 7, 5, t1), ring(hem(i), 7, 5, t0)].map((x) => { const r = P(x); return [r[0] * Z, r[1] * Z] as [number, number]; }));
    }
    paintB(c, m, CLOTH, { amp: 1.3, dome: 3, dith: 0.3, bias: 0.1 });
    for (const fz of [1, -1]) {
      const sway = p.wind * 0.4 * fz;
      const pts: V2[] = ([[-2.8, 44], [2.8, 44], [3, 53], [1.8, 56], [0.9, 54.5], [0, 58.5 + p.flare * -3], [-1, 55], [-2.1, 56.5], [-3, 53]] as V2[])
        .map(([x, y]) => { const r = P(lowT(p, [x * fz + sway * (y - 44) / 18, y - p.flare * (y - 44) * 0.3, fz * (4.4 + (y - 44) * 0.08 + p.flare * (y - 44) * 0.25)])); return [r[0], r[1]] as V2; });
      const fm = polyM(pts);
      paintB(c, fm, CLOTH, { amp: 1.4, dome: 3, dith: 0.3, bias: fz * facing(v, [0, 0, 1]) > 0 ? 0.6 : -0.3 });
      // костяная пластина на клапане (спереди)
      if (fz > 0 && facing(v, [0, 0, 1]) > 0.2) { const q = S(lowT(p, [0, 48.5, fz * 5.2])); const bm = polyM([[q[0] - 2, q[1] - 2], [q[0] + 2, q[1] - 2], [q[0] + 1.3, q[1] + 2.8], [q[0], q[1] + 4], [q[0] - 1.3, q[1] + 2.8]]); paintB(c, bm, BONE, { amp: 1.4, dome: 2, dith: 0.2, bias: -0.3 }); dot1(c, q[0], q[1], BONE[0]); }
    }
    // пояс
    const bm = mk();
    for (let i = 0; i < N; i++) { const t0 = (i / N) * 2 * PI, t1 = ((i + 1) / N) * 2 * PI; bm.poly([ring(42.4, 6, 4.2, t0), ring(42.4, 6, 4.2, t1), ring(44.6, 6.2, 4.4, t1), ring(44.6, 6.2, 4.4, t0)].map((x) => { const r = P(x); return [r[0] * Z, r[1] * Z] as [number, number]; })); }
    paintB(c, bm, LEATH, { amp: 1.4, dome: 2, dith: 0.2, bias: -0.2 });
  } });

  // ---- торс: эллипсоиды одной маской, рёбра, грудина, пресс; цепи накрест ----
  const tmask = mk();
  for (const E of TORSO) {
    const c0 = upT(p, E.c), q = P(c0), rx = Math.hypot(E.r[0] * COS(v.a + p.tw), E.r[2] * SIN(v.a + p.tw)), ry = Math.hypot(E.r[1] * COS(p.lean), E.r[2] * SIN(p.lean) * 0.6);
    tmask.ellR(q[0] * Z, q[1] * Z, rx * Z, ry * Z, p.roll);
  }
  // дельты
  for (const s of [-1, 1]) { const q = S(upT(p, [s * 8.8, 25.2, 0])); tmask.disc(q[0] * Z, q[1] * Z, 2.7 * Z); }
  parts.push({ z: 0, tag: "torso", f: (c) => {
    paintB(c, tmask, FLESH, { amp: 2, dome: 8, dith: 0.1, bias: 0.15 });
    const pt = (x: number, y: number, front: boolean) => { const s = surf(x, y, front), q = P(upT(p, s.q)); return { x: q[0], y: q[1], ok: facing(v, rotY(s.n, p.tw)) > 0.02 && in1(tmask, q[0], q[1]) }; };
    const line = (pts: V2[], front: boolean, col: C, colL?: C, step = 0.4) => {
      for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step);
        for (let k = 0; k <= n; k++) { const q = pt(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, front); if (!q.ok) continue; if (colL) dot1(c, q.x, q.y - 1, colL); dot1(c, q.x, q.y, col); } }
    };
    const front = facing(v, rotY([0, 0, 1], p.tw)) > -0.3;
    if (front) {
      // грудные: тень под ними, грудина
      line([[-7, 28.2], [-3.5, 29.4], [-0.8, 28.6]], true, FLESH[1], FLESH[4]); line([[0.8, 28.6], [3.5, 29.4], [7, 28.2]], true, FLESH[1], FLESH[4]);
      line([[0, 25.5], [0, 33]], true, FLESH[1]);
      for (const [i, y] of [31.5].entries()) for (const sx of [-1, 1]) line([[sx * 2.5, y], [sx * (6.2 - i * 0.5), y + 1.6]], true, FLESH[1], FLESH[4]);
      // пресс: две колонки
      { const q = pt(0, 41.5, true); if (q.ok) dot1(c, q.x, q.y, FLESH[1]); }
      line([[0, 35], [0, 40]], true, FLESH[2]);
      line([[-4.2, 35], [-3, 39.5], [-2, 43]], true, FLESH[2], FLESH[4]); line([[4.2, 35], [3, 39.5], [2, 43]], true, FLESH[2], FLESH[4]);
    } else {
      for (let y = 23; y <= 42; y += 1) { const q = pt(0, y, false); if (q.ok) dot1(c, q.x, q.y, Math.round(y) % 3 === 0 ? FLESH[4] : FLESH[1]); }
      line([[-6, 25], [-3, 30]], false, FLESH[1], FLESH[4]); line([[6, 25], [3, 30]], false, FLESH[1], FLESH[4]);
    }
    // цепи накрест (спереди и сзади): звенья светлое/тёмное
    for (const fr of [true, false]) for (const sx of [-1, 1]) {
      const n = 14;
      for (let k = 0; k <= n; k++) { const t = k / n, x = sx * (7.2 - 14 * t), y = 24.5 + 9.5 * t + SIN(t * PI) * 0.8, q = pt(x, y, fr); if (!q.ok) continue; if (k % 2) dot1(c, q.x, q.y, IRON[5]); else dot1(c, q.x, q.y, IRON[3]); }
    }
  } });

  // ---- мантия: рваная пелерина на плечах (спереди открыта), костяные рога ----
  parts.push({ z: 3, tag: "mantle", f: (c) => {
    const ring = (y: number, rx: number, rz: number, th: number): V3 => upT(p, [rx * SIN(th), y, rz * COS(th) - 0.6]);
    const N = 26, m = mk();
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * 2 * PI, t1 = ((i + 1) / N) * 2 * PI, tc = (t0 + t1) / 2;
      const fr = COS(tc); if (fr > 0.8) continue;  // разрез спереди — видна грудь и цепи
      const hem = (k: number, t: number) => 29 + (1 - COS(t)) * 1.6 + (k % 2 ? 2.4 : 0) + hash(k, 11) * 1.4 + p.wind * 0.3 * (1 - COS(t));
      m.poly([ring(21.8, 4.8, 3.8, t0), ring(21.8, 4.8, 3.8, t1), ring(hem(i + 1, t1), 11.6 + p.flare * 2, 7, t1), ring(hem(i, t0), 11.6 + p.flare * 2, 7, t0)].map((x) => { const r = P(x); return [r[0] * Z, r[1] * Z] as [number, number]; }));
    }
    const d = paintB(c, m, CLOTH, { amp: 1.5, dome: 4, dith: 0.3, bias: 0.25 }); void d;
    // складки от шеи к подолу
    for (let i = 0; i < 12; i++) { const th = (i / 12) * 2 * PI + 0.2; if (COS(th) > 0.75) continue; const a = P(ring(23, 6, 4.5, th)), b = P(ring(30, 11, 6.6, th)); if (facing(v, rotY([SIN(th), 0, COS(th)], p.tw)) < 0.25) continue;
      for (let k = 0; k <= 8; k++) { const x = a[0] + (b[0] - a[0]) * k / 8, y = a[1] + (b[1] - a[1]) * k / 8; if (in1(m, x, y)) dot1(c, x, y, CLOTH[1]); } }
    // рога: по два на плечо, наружу-вверх
    for (const s of [-1, 1]) for (const [ox, len, ang] of [[6.8, 5.5, 0.55], [9.6, 4.2, 0.95]] as [number, number, number][]) {
      const b0 = upT(p, [s * ox, 22.4, 0.5]), tipq = upT(p, [s * (ox + SIN(ang) * len), 22.4 - COS(ang) * len, 0.2]);
      const B = S(b0), T = S(tipq), mid: V2 = [(B[0] + T[0]) / 2 + s * 0.5, (B[1] + T[1]) / 2 + 0.4];
      const hm = mk(); hm.bez([B[0] * Z, B[1] * Z], [mid[0] * Z, mid[1] * Z], [T[0] * Z, T[1] * Z], 2.2 * Z, 0.6 * Z); paintB(c, hm, BONE, { amp: 1.5, dome: 1.5, dith: 0, bias: 0.1 });
    }
  } });

  // ---- капюшон с острым верхом и маской-оскалом ----
  const neck = upT(p, [0, 20.5, 0.6]), NP = P(neck);
  const hx0 = NP[0] + p.head[0], hy0 = NP[1] + p.head[1];
  parts.push({ z: 3.5, f: (c) => {
    const hc = new Cv(W, W), a = v.a + p.tw * 0.8, fa = COS(a), sa = SIN(a), H = 1.12;
    // силуэт: купол + острие назад-вверх + спад на плечи
    const tipX = hx0 + sa * 2.6 * H, tipY = hy0 - 12.6 * H;
    const sil: V2[] = [];
    for (let k = 0; k <= 20; k++) { const t = PI * (k / 20); sil.push([hx0 - COS(t) * 5.7 * H - sa * 0.4, hy0 - 6.2 * H - SIN(t) * 5.6 * H]); }
    const hm = polyM([[hx0 - 7 * H, hy0 + 1.2], ...sil.slice(0, 9), [tipX, tipY], ...sil.slice(12), [hx0 + 7 * H, hy0 + 1.2], [hx0 + 4.8 * H, hy0 + 2.6], [hx0 - 4.8 * H, hy0 + 2.6]]);
    paintB(hc, hm, CLOTH, { amp: 1.7, dome: 4, dith: 0.3, bias: 0.4 });
    // складка вдоль острия
    for (let k = 0; k < 8; k++) { const t = k / 8; dot1(hc, tipX + (hx0 + 2.2 * fa - tipX) * t + 0.4, tipY + 2 + (hy0 - 7 * H - tipY) * t, CLOTH[1]); }
    if (fa > 0.12) {
      // отверстие: тьма, внутри — крупная костяная маска-оскал со смещением к виду
      const ox = hx0 - sa * 2.4, oy = hy0 - 5.4 * H, rw = 4.5 * H * (0.55 + 0.45 * fa);
      const om = mk(); om.ellR(ox * Z, oy * Z, rw * Z, 5.6 * H * Z); paintB(hc, om, CLOTH, { amp: 0.5, dome: 3, dith: 0.2, bias: -1.8 });
      const mx = ox + sa * 0.4, my = oy + 0.8, mw = 3.4 * H * (0.55 + 0.45 * fa);
      const mm = polyM([[mx - mw * 0.9, my - 3.4], [mx + mw * 0.9, my - 3.4], [mx + mw + 0.2, my - 1], [mx + mw * 0.85, my + 2.4], [mx + mw * 0.55, my + 4.6], [mx - mw * 0.55, my + 4.6], [mx - mw * 0.85, my + 2.4], [mx - mw - 0.2, my - 1]]);
      paintB(hc, mm, BONE, { amp: 1.4, dome: 2, dith: 0.1, bias: 0.9 });
      // глазницы: тёмная впадина и яркий огонь 2 px
      for (const ex of [-1, 1]) { const x = mx + ex * mw * 0.45; if (ex * sa > 0.6) continue;
        dot1(hc, x - 1, my - 1.2, BONE[0]); dot1(hc, x, my - 1.2, BONE[0]); dot1(hc, x + 1, my - 1.2, BONE[1]); dot1(hc, x - 1, my - 0.2, BONE[1]); dot1(hc, x + 1, my - 0.2, BONE[1]);
        dot1(hc, x, my - 0.2, ec); dot1(hc, x + ex * -0, my - 0.2, ec); dot1(hc, x - ex, my - 0.2, p.glow > 0.25 ? SOUL1 : BONE[1]); }
      // носовая впадина
      dot1(hc, mx, my + 1.1, BONE[0]);
      // оскал: светлые зубы с тёмными щелями, тёмная губа снизу
      for (let k = -2; k <= 2; k++) { const x = mx + k * mw * 0.3; dot1(hc, x, my + 2.4, BONE[4]); dot1(hc, x, my + 3.4, BONE[3]); }
      for (let k = -1; k <= 2; k++) { const x = mx + (k - 0.5) * mw * 0.3; dot1(hc, x, my + 2.4, BONE[1]); }
      for (let k = -2; k <= 2; k++) dot1(hc, mx + k * mw * 0.3, my + 4.2, BONE[1]);
      // тень капюшона на маске сверху
      for (let k = -2; k <= 2; k++) dot1(hc, mx + k * mw * 0.4, my - 3.4, CLOTH[0]);
    } else {
      // спина: шов капюшона
      for (let y = tipY + 3; y < hy0 + 1; y += 1) dot1(hc, hx0 + sa * 1.2, y, CLOTH[1]);
    }
    const r = rot(hc, p.htilt + p.roll, hx0 * Z, hy0 * Z);
    stamp(c, r);
  } });

  // ---- верхние руки (держат серпы): плечо — под мантией, предплечье и кулак — над ----
  for (const [i, A] of arms.entries()) {
    const s = A.s, zU = (dz(A.Sh) + dz(A.E)) / 2 + 1.5, zF = (dz(A.E) + dz(A.Wr)) / 2 + 1.6;
    const b = v.id === "side" && s < 0 ? -0.6 : 0;
    parts.push({ z: Math.min(zU, 2.6), tag: "arm", f: (c) => {
      const Sh = S(A.Sh), E = S(A.E);
      let m = capM(Sh, E, 3.2, 2.5); paintB(c, m, FLESH, { amp: 1.5, dome: 3, dith: 0.3, bias: b });
      const bi: V2 = [Sh[0] + (E[0] - Sh[0]) * 0.45, Sh[1] + (E[1] - Sh[1]) * 0.45]; m = discM(bi, 2); paintB(c, m, FLESH, { amp: 1.5, dome: 4, dith: 0.3, bias: b + 0.2 });
    } });
    parts.push({ z: zF > 2.6 ? Math.max(zF, 3.2) : zF, tag: "arm", f: (c) => {
      const E = S(A.E), Wr = S(A.Wr);
      let m = discM(E, 2.2); paintB(c, m, FLESH, { amp: 1.6, dome: 3, dith: 0.2, bias: b + 0.4 });
      m = capM(E, Wr, 2.5, 2); paintB(c, m, FLESH, { amp: 1.4, dome: 3, dith: 0.3, bias: b - 0.1 });
      const fx = Wr[0] - E[0], fy = Wr[1] - E[1];
      const w0: V2 = [E[0] + fx * 0.4, E[1] + fy * 0.4], w1: V2 = [E[0] + fx * 0.86, E[1] + fy * 0.86];
      m = capM(w0, w1, 3.1, 2.8); paintB(c, m, IRON, { amp: 1.6, dome: 2, dith: 0.2, bias: 0.3 });
      // заклёпки и кожаный край наруча
      dot1(c, (w0[0] + w1[0]) / 2, (w0[1] + w1[1]) / 2, IRON[6]);
      m = capM(w1, [w1[0] + fx * 0.06, w1[1] + fy * 0.06], 3, 2.8); paintB(c, m, LEATH, { amp: 1.2, dome: 2, dith: 0, bias: 0 });
      // кулак на древке
      m = discM(Wr, 2); paintB(c, m, FLESH, { amp: 1.5, dome: 2, dith: 0.1, bias: b + 0.3 });
      const sc = scy[i], du = S(add(sc.grip, mul(sc.u, 1))), ux = du[0] - Wr[0], uy = du[1] - Wr[1];
      for (const k of [-0.9, 0, 0.9]) dot1(c, Wr[0] + ux * k + s * 0.9, Wr[1] + uy * k, FLESH[1]);
    } });
  }

  // ---- серпы ----
  const tips2: V2[] = [];
  for (const sc of scy) {
    const Gp = P(sc.grip), Tp = P(sc.top), Bp = P(sc.bot);
    tips2.push(S(sc.tip));
    // древко: нижняя часть и верхняя (отдельная глубина)
    const shaft = (a: V3, b: V3, c: Cv) => { const m = capM(S(a), S(b), 1.8, 1.7); paintB(c, m, WOOD, { amp: 1.6, dome: 1.5, dith: 0.1, bias: 0.3 }); };
    parts.push({ z: (Gp[2] + Bp[2]) / 2 + 0.2, w: true, f: (c) => {
      shaft(sc.bot, sc.grip, c);
      // обмотки у хвата и железный наконечник снизу
      { const q = S(lerp3(sc.bot, sc.grip, 0.15)); dot1(c, q[0], q[1], IRON[5]); }
      const m = capM(S(sc.bot), S(sub(sc.bot, mul(sc.u, 1.6))), 1.6, 0.5); paintB(c, m, IRON, { amp: 1.4, dome: 1, dith: 0, bias: 0.4 });
    } });
    parts.push({ z: (Gp[2] + Tp[2]) / 2 + 0.3, w: true, f: (c) => {
      shaft(sc.grip, sc.top, c);
      for (const t of [0.5, 0.72]) { const q = S(lerp3(sc.grip, sc.top, t)); dot1(c, q[0], q[1], LEATH[3]); }
    } });
    // клинок: полумесяц, зазубренный обух, светлая кромка, дол, ржавчина
    const Bz = sc.blade.reduce((a, q) => a + P(q)[2], 0) / sc.blade.length;
    parts.push({ z: Math.max(Bz, Tp[2]) + 0.4, w: true, f: (c) => {
      const n = sc.blade.length, back: V2[] = [], edge: V2[] = [], mid: V2[] = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), q = sc.blade[i], q2 = sc.blade[Math.min(n - 1, i + 1)], q1 = sc.blade[Math.max(0, i - 1)];
        const tg = nrm(sub(q2, q1)), down = nrm(sub(mul(sc.u, -1), mul(tg, dot(mul(sc.u, -1), tg))));
        const w = 6 * Math.pow(1 - t, 0.6) * (0.75 + 0.25 * SIN(PI * Math.min(1, t * 2.2))) + 0.35;
        back.push(S(add(q, mul(down, -w * 0.38)))); edge.push(S(add(q, mul(down, w * 0.62)))); mid.push(S(add(q, mul(down, w * 0.1))));
      }
      const m = polyM([...back, ...edge.slice().reverse()]);
      // обух: зубья
      for (let i = 3; i < n - 3; i += 3) { const a = back[i], e = edge[i], dx = a[0] - e[0], dy = a[1] - e[1], l = Math.hypot(dx, dy) || 1; m.line(a[0] * Z, a[1] * Z, (a[0] + dx / l * 1.6 + (back[i + 1][0] - a[0]) * 0.8) * Z, (a[1] + dy / l * 1.6 + (back[i + 1][1] - a[1]) * 0.8) * Z, 1.4, 0.6); }
      // загнутый крюк у вершины древка (в обратную сторону) и навершие
      const hk1 = S(add(sc.top, add(mul(sc.b, -3.2), mul(sc.u, 1.2)))), hk2 = S(add(sc.top, add(mul(sc.b, -4.4), mul(sc.u, -1.4))));
      m.bez([S(sc.top)[0] * Z, S(sc.top)[1] * Z], [hk1[0] * Z, hk1[1] * Z], [hk2[0] * Z, hk2[1] * Z], 2 * Z, 0.5 * Z);
      const fin = S(add(sc.top, mul(sc.u, 3.4)));
      m.line(S(sc.top)[0] * Z, S(sc.top)[1] * Z, fin[0] * Z, fin[1] * Z, 2 * Z, 0.5 * Z);
      paintB(c, m, IRON, { amp: 1.7, dome: 2, dith: 0.25, bias: 0.2 });
      // дол — тёмная борозда, кромка — светлая линия
      for (let i = 1; i < n - 3; i++) { const q = mid[i]; if (in1(m, q[0], q[1])) dot1(c, q[0], q[1], IRON[1]); }
      for (let i = 0; i < n; i++) { const q = edge[i], k = Math.max(0, i - 1), inner: V2 = [q[0] + (mid[k][0] - q[0]) * 0.25, q[1] + (mid[k][1] - q[1]) * 0.25]; dot1(c, inner[0], inner[1], i > n - 4 ? IRON[5] : EDGE); }
      // ржавчина и кровь у обуха
      // обмотка у вершины
      const wr = S(sub(sc.top, mul(sc.u, 1.6))), wm = discM(wr, 1.7); paintB(c, wm, LEATH, { amp: 1.3, dome: 2, dith: 0, bias: 0.3 });
    } });
  }

  // ---- сборка ----
  const use = parts.filter((q) => (layer === "all" || (layer === "weap" ? q.w : !q.w)) && !(opts.skip && q.tag && opts.skip.includes(q.tag)));
  use.sort((x, y) => x.z - y.z);
  const big = new Cv(W, W);
  for (const pt of use) pt.f(big);
  if (opts.big) opts.big(big);
  const fin = p.sy !== 1 ? rot(big, 0, 80, 76 * Z, p.sy) : big;
  const o = down(fin);

  // ---- эффекты 1× ----
  if (layer !== "weap") {
    // огонь души в ладонях нижних рук
    for (const [i, s] of [[0, -1], [1, 1]] as const) { const k = p.fire * (i === 0 ? p.fireL : p.fireR); if (k > 0.05) flame(o, palms2[i][0], palms2[i][1], k, p.ph + i * 3); void s; }
    // туман у ног: клубы за телом
    if (p.mist > 0.05) mist(o, p.mist, p.ph, 0);
  }
  if (layer === "all") {
    // след клинков
    if (p.trail > 0.05) for (const [i, on] of [[0, p.trailAt !== "R"], [1, p.trailAt !== "L"]] as const) if (on) trail(o, tips2[i], p.trail, i === 0 ? -1 : 1, v);
    if (p.ring > 0.05) groundRing(o, p.ring);
    if (p.slam > 0.05) slam(o, p.slam);
    if (p.souls > 0.05) souls(o, p.souls, p.ph, tips2);
    if (p.orb > 0.05) orb(o, palms2[1], p.orb, p.ph);
    if (p.stars > 0.05) stars(o, hx0, hy0 - 16, p.ph);
  }

  const emis = new Cv(FR, FR);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (o.has(x, y) && GLOWSET.has(o.get(x, y).join())) emis.set(x, y, o.get(x, y));
  // нижняя строка — земля: древко уходит в грунт, контур по кромке
  for (let x = 0; x < FR; x++) { if (o.has(x, FR - 1)) { o.d[((FR - 1) * FR + x) * 4 + 3] = 0; if (o.has(x, FR - 2)) o.set(x, FR - 2, OUTL); } }
  for (let k = 0; k < FR; k++) for (const [x, y] of [[0, k], [FR - 1, k], [k, 0], [k, FR - 1]] as [number, number][]) if (o.has(x, y) && o.get(x, y).join() !== OUTL.join()) o.set(x, y, OUTL);
  return { img: o, emis, tips: tips2, palms: palms2 };
}

// ---------------- эффекты (1×) ----------------
/** огонь души: язык 3–4 px шириной, 6–8 высотой; ядро белое, кромка синяя; мерцание по фазе */
function flame(o: Cv, x: number, y: number, k: number, ph: number) {
  const h = (5 + 2.2 * k) * (0.92 + 0.12 * SIN(ph * 1.3)), w = 1.5 + 0.7 * k, sway = SIN(ph * 0.9) * 0.9;
  for (let j = 0; j < h; j++) {
    const t = j / h, ww = w * Math.sqrt(Math.max(0, 1 - t)) * (t < 0.15 ? 0.7 + t * 2 : 1), cx = x + sway * t * t;
    for (let i = -Math.ceil(ww); i <= Math.ceil(ww); i++) {
      if (Math.abs(i) > ww + 0.2) continue;
      const e = Math.abs(i) / (ww + 0.01), col = e > 0.7 ? SOUL0 : t > 0.6 ? SOUL1 : e > 0.35 ? SOUL1 : t < 0.5 ? SOUL3 : SOUL2;
      o.set(cx + i, y - j, col);
    }
  }
  // язычок-искра над огнём
  if (k > 0.6) { const sy = y - h - 1 - (ph % 3); o.set(x + sway, sy, SOUL1); o.set(x + sway, sy - 1, SOUL0); }
}
/** туман у ног: клубы 2–3 px за телом (только в пустых пикселях), дрейфуют по фазе */
function mist(o: Cv, k: number, ph: number, dy: number) {
  const puffs = 7;
  for (let i = 0; i < puffs; i++) {
    const sd = hash(i, 3), x = 40 + (sd - 0.5) * 40 + SIN(ph * 0.52 + i * 1.3) * 1.6, y = 72 + hash(3, i) * 3 - dy + COS(ph * 0.52 + i) * 0.5, r = (1.4 + hash(i, 9) * 1.1) * k;
    for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let q = -Math.ceil(r * 1.4); q <= Math.ceil(r * 1.4); q++) {
      if ((q / 1.4) ** 2 + j * j > r * r + 0.3) continue;
      const X = Math.round(x + q), Y = Math.round(y + j); if (o.has(X, Y) || Y > 77) continue;
      const t = (j + q * 0.3) / (r + 0.01);
      o.set(X, Y, MIST[t < -0.45 ? 3 : t < 0.35 ? 2 : 1]);
    }
  }
}
/** след кончика клинка: дуга 2 px, к концу тоньше и темнее; рисуется по прошлым положениям (rot вида) */
function trail(o: Cv, tip: V2, k: number, s: number, v: View) {
  const R = 22 + 6 * k, cx = 40, cy = tip[1] + 2;
  const a0 = Math.atan2((tip[1] - cy) / 0.5, tip[0] - cx);
  void v;
  for (let q = 0; q < 26 * k; q++) {
    const a = a0 + s * q * 0.06, x = cx + COS(a) * R, y = cy + SIN(a) * R * 0.5;
    if (x < 2 || x > 77 || y < 2 || y > 76) continue;
    const col = q < 6 ? SOUL3 : q < 13 ? SOUL2 : SOUL1;
    o.set(x, y, col); if (q < 16) o.set(x, y + 1, q < 8 ? SOUL2 : SOUL0);
    if (q < 6) o.set(x, y - 1, SOUL1);
  }
}
/** круг размаха по земле */
function groundRing(o: Cv, k: number) {
  const R = 18 + 18 * k;
  for (let q = 0; q < 160; q++) { const a = (q / 160) * 2 * PI, x = 40 + COS(a) * R, y = 68 + SIN(a) * R * 0.27; if (x < 2 || x > 77 || y > 76) continue; if (q % 11 === 5) continue; o.set(x, y, SIN(a) > 0 ? SOUL2 : SOUL1); if (SIN(a) > 0) o.set(x, y + 1, SOUL0); }
}
/** удар оземь: вспышка и трещины-лучи впереди */
function slam(o: Cv, k: number) {
  const cx = 40, cy = 72;
  for (let r = 0; r < 8; r++) { const a = -PI / 2 + (r - 3.5) * 0.42, L = (8 + hash(r, 2) * 7) * k; for (let q = 2; q < L; q++) { const x = cx + COS(a) * q * 1.6, y = cy + 2 + Math.abs(SIN(a)) * q * 0.25 + (r % 2); if (x > 1 && x < 78 && y < 78) o.set(x, y, q < L * 0.4 ? SOUL3 : SOUL1); } }
  for (let j = -2; j <= 2; j++) for (let i = -4; i <= 4; i++) if (i * i / 16 + j * j / 4 <= 1) o.set(cx + i, cy + j, Math.abs(i) < 2 ? SOUL3 : SOUL2);
}
/** души стекаются к клинкам: светлые запятые по спирали */
function souls(o: Cv, k: number, ph: number, tips: V2[]) {
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + ph * 0.5, r = 26 * (1 - ((k + i * 0.17) % 1)), x = 40 + COS(a) * r, y = 40 + SIN(a) * r * 0.6 - 10;
    const tgt = tips[i % 2], mx = x + (tgt[0] - x) * 0.15, my = y + (tgt[1] - y) * 0.15;
    if (mx < 2 || mx > 77 || my < 2 || my > 77) continue;
    o.set(mx, my, SOUL3); o.set(mx + 1, my, SOUL2); o.set(mx, my + 1, SOUL1); o.set(mx - COS(a + 1.6), my - SIN(a + 1.6) * 0.6, SOUL0);
  }
}
/** метка дуэли: шар-клеймо в ладони (огонь меняет цвет на тёплый) */
function orb(o: Cv, at: V2, k: number, ph: number) {
  const r = 1.5 + 1.6 * k, x = at[0], y = at[1] - 3;
  for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) { const d = Math.hypot(i, j); if (d > r) continue; o.set(x + i, y + j, d < r * 0.45 ? MARK1 : MARK0); }
  for (let q = 0; q < 4; q++) { const a = q * PI / 2 + ph * 0.6; o.set(x + COS(a) * (r + 2), y + SIN(a) * (r + 2), MARK0); }
}

/** оглушение: две звезды и три искры души по кругу над головой, клубы дыма */
function stars(o: Cv, cx: number, cy: number, ph: number) {
  for (let i = 0; i < 2; i++) { const a = ph * 0.785 + i * PI, x = cx + COS(a) * 7, y = cy + 1 + SIN(a) * 1.8; if (SIN(a) < -0.2 && o.has(Math.round(x), Math.round(y))) continue; for (const [dx, dy, c] of [[0, 0, MARK1], [1, 0, MARK0], [-1, 0, MARK0], [0, 1, MARK0], [0, -1, MARK0]] as [number, number, C][]) o.set(x + dx, y + dy, c); }
  for (let i = 0; i < 3; i++) { const a = ph * 0.785 + i * 2.09 + 0.5, x = cx + COS(a) * 8.5, y = cy + 2 + SIN(a) * 2.2; if (SIN(a) < 0 && o.has(Math.round(x), Math.round(y))) continue; o.set(x, y, SOUL3); o.set(x + 1, y, SOUL2); o.set(x, y + 1, SOUL1); }
  for (let i = 0; i < 3; i++) { const x = cx - 5 + i * 5 + SIN(ph * 0.8 + i) * 1.2, y = cy - 3 - ((ph + i * 3) % 8) * 0.5; for (let j = -1; j <= 1; j++) for (let q = -2; q <= 2; q++) { if (q * q / 4 + j * j > 1.2) continue; const X = Math.round(x + q), Y = Math.round(y + j); if (Y < 1 || o.has(X, Y)) continue; o.set(X, Y, MIST[j < 0 ? 3 : 2]); } }
}

// ---------------- сведение 2× → 1× ----------------
function rot(src: Cv, ang: number, px: number, py: number, sy = 1): Cv {
  if (Math.abs(ang) < 1e-3 && sy === 1) return src;
  const o = new Cv(src.w, src.h), cs = COS(ang), sn = SIN(ang);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const vx = x - px, vy = (y - py) / sy, sx = Math.round(px + vx * cs + vy * sn), sy2 = Math.round(py - vx * sn + vy * cs);
    if (src.has(sx, sy2)) o.set(x, y, src.get(sx, sy2));
  }
  return o;
}
const stamp = (dst: Cv, src: Cv) => { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.has(x, y)) dst.set(x, y, src.get(x, y)); };
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
  // контур тёмным тоном соседнего материала, а не чёрным: смешиваем с самым тёмным соседом
  const out = new Cv(FR, FR); out.d.set(o.d);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    if (!o.has(x, y) || o.get(x, y).join() !== OUTL.join()) continue;
    let best: C | null = null, bl = 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (!o.has(X, Y)) continue; const q = o.get(X, Y); if (q.join() === OUTL.join()) continue; const l = q[0] + q[1] + q[2]; if (l < bl) { bl = l; best = q; } }
    if (best) out.set(x, y, [Math.round(best[0] * 0.3 + 4), Math.round(best[1] * 0.3 + 3), Math.round(best[2] * 0.3 + 6)]);
  }
  return out;
}
export const flip = (c: Cv): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(c.w - 1 - x, y, c.get(x, y)); return o; };

// ---------------- анимации ----------------
function idlePoses(): Pose[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (2 * PI * i) / 12;
    return mkPose({ by: 0.45 * SIN(ph) - 0.1, lean: 0.06 + 0.015 * SIN(ph), head: [0.25 * SIN(ph - 0.8), 0.3 * SIN(ph)] as V2, htilt: 0.04 * SIN(ph - 1.2),
      sL: { ...SC0, rl: 0.025 * SIN(ph + 0.6), g: [0, 0.4 * SIN(ph), 0] }, sR: { ...SC0, rl: 0.025 * SIN(ph + 2.2), g: [0, 0.4 * SIN(ph + 0.5), 0] },
      pL: [0.4 * SIN(ph + 1), -0.6 * SIN(ph), 0] as V3, pR: [-0.4 * SIN(ph + 2), -0.6 * SIN(ph + 0.6), 0] as V3,
      wind: 1.4 * SIN(ph) + 0.6 * SIN(2 * ph + 1), glow: 1 + 0.2 * SIN(ph), ph: i, mist: 0 });
  });
}
function walkPoses(): Pose[] {
  return Array.from({ length: 12 }, (_, i) => {
    const f = (2 * PI * i) / 12, la = Math.max(0, SIN(f)), lb = Math.max(0, -SIN(f));
    return mkPose({ fL: [0, -4.5 * la - 0.6 * Math.max(0, COS(f)), 3 * COS(f)] as V3, fR: [0, -4.5 * lb - 0.6 * Math.max(0, -COS(f)), -3 * COS(f)] as V3,
      by: 0.8 * COS(2 * f) - 0.3, roll: 0.035 * SIN(f), lean: 0.12, bx: 0.3 * SIN(f), tw: 0.06 * SIN(f),
      sL: { ...SC0, pt: 0.08 * COS(f), g: [0, -0.6 * lb, -1.2 * COS(f)] }, sR: { ...SC0, pt: -0.08 * COS(f), g: [0, -0.6 * la, 1.2 * COS(f)] },
      pL: [0, 0, -2 * COS(f)] as V3, pR: [0, 0, 2 * COS(f)] as V3,
      head: [0, -0.3 * COS(2 * f)] as V2, wind: -2 + 0.8 * SIN(2 * f), flare: 0.15, ph: i, mist: 0 });
  });
}
// удар одним серпом: правый взлетает над плечом и рубит наискось вниз через тело
const attackPoses = (): Pose[] => keyed([
  { f: 0, p: {} },
  { f: 3, p: { sR: { g: [-7, -17, -4], rl: 0.55, pt: 0.5 }, tw: -0.3, lean: -0.06, head: [0.4, -0.4], htilt: -0.08, wind: 1 } },
  { f: 5, p: { sR: { g: [-24, 6, 9], rl: -2, pt: -0.2 }, tw: 0.4, lean: 0.34, by: 1.4, head: [-0.8, 1], trail: 1, trailAt: "R", wind: -1.6 } },
  { f: 7, p: { sR: { g: [-20, 4, 7], rl: -1.7, pt: -0.1 }, tw: 0.3, lean: 0.26, by: 1, trail: 0.3, trailAt: "R", wind: -1 } },
  { f: 9, p: {} },
], 10);
// двойной взмах: оба серпа заведены вправо-вверх, корпус скручен; удар правым (справа налево вниз), сразу левым
const TW_UP: PP = { tw: -0.5, lean: -0.06, by: 0.6, sR: { g: [-3, -15, -5], rl: 0.75, pt: 0.5 }, sL: { g: [-24, -11, -2], rl: -1.35, pt: 0.3 }, head: [0.7, -0.4], htilt: -0.1, wind: 1.4 };
const twinWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: TW_UP }], 4);
const twinHold = (): Pose[] => [0, 1, 0, -1].map((q, i) => { const p = keyed([{ f: 0, p: TW_UP }], 1)[0]; p.sR = { ...p.sR, rl: p.sR.rl + 0.05 * q }; p.sL = { ...p.sL, rl: p.sL.rl - 0.05 * q }; p.by += 0.2 * q; p.glow = 1.2 + 0.2 * Math.abs(q); p.ph = i; p.wind = 1.2 + 0.4 * q; return p; });
const twinStrike = (): Pose[] => keyed([
  { f: 0, p: TW_UP },
  { f: 2, p: { tw: 0.5, lean: 0.36, by: 1.6, sR: { g: [-25, 6, 9], rl: -2.1, pt: -0.2 }, sL: { g: [-24, -11, -2], rl: -1.35, pt: 0.3 }, trail: 1, trailAt: "R", wind: -1.8, head: [-0.8, 1], htilt: 0.1 } },
  { f: 4, p: { tw: 0.3, lean: 0.2, by: 1, sR: { g: [-18, 4, 6], rl: -1.6, pt: -0.1 }, sL: { g: [-26, -12, -3], rl: -1.5, pt: 0.4 }, trail: 0.3, trailAt: "R", wind: -0.6 } },
  { f: 6, p: { tw: -0.5, lean: 0.36, by: 1.6, sR: { g: [-6, -2, 3], rl: -0.4 }, sL: { g: [0, 4, 9], rl: 1.25, pt: -0.2 }, trail: 1, trailAt: "L", wind: 1.8, head: [0.8, 1], htilt: -0.1 } },
  { f: 8, p: { tw: -0.3, lean: 0.2, by: 0.8, sL: { g: [0, 3, 6], rl: 0.9 }, sR: { g: [-3, -1, 2], rl: -0.2 }, trail: 0.3, trailAt: "L", wind: 0.6 } },
  { f: 9, p: {} },
], 10);
// метка дуэли: правый серп нацелен вперёд на танка, правая нижняя ладонь зажигает клеймо, бросок
const DU_UP: PP = { sR: { g: [-6, -9, 12], rl: -0.5, pt: -1.0 }, pR: [-4, -9, 6], orb: 0.6, fireR: 0, lean: 0.06, tw: 0.2, head: [-0.3, -0.4], htilt: 0.06 };
const duelWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: DU_UP }], 4);
const duelHold = (): Pose[] => [0, 1, 2, 3].map((i) => { const p = keyed([{ f: 0, p: DU_UP }], 1)[0]; p.orb = 0.7 + 0.25 * SIN(i * PI / 2); p.glow = 1.3 + 0.2 * SIN(i * PI / 2); p.ph = i; p.pR = [-4, -9 + 0.5 * SIN(i * PI / 2), 6]; return p; });
const duelCast = (): Pose[] => keyed([
  { f: 0, p: { ...DU_UP, orb: 1 } },
  { f: 2, p: { sR: { g: [-6, -8, 13], rl: -0.5, pt: -1.1 }, pR: [-6, -6, 14], orb: 1.2, fireR: 0, lean: 0.24, by: 0.9, tw: 0.3, head: [-0.3, 0.5] } },
  { f: 3, p: { sR: { g: [-6, -8, 13], rl: -0.5, pt: -1.1 }, pR: [-6, -5, 15], orb: 0, fireR: 0, lean: 0.26, by: 1, tw: 0.3, glow: 1.5 } },
  { f: 6, p: { fireR: 0.6 } },
  { f: 7, p: {} },
], 8);
// размах: присед, серпы отведены назад; полный оборот на месте, руки раскинуты, клинки наружу, круг по земле
const SW_UP: PP = { by: 2.4, lean: 0.22, sL: { g: [2, -4, -8], rl: 0.4, pt: 0.7 }, sR: { g: [2, -4, -8], rl: 0.4, pt: 0.7 }, fL: [-1.5, 0, 0], fR: [1.5, 0, 0], wind: 1.5, flare: 0.3, head: [0, 0.8] };
const sweepWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: SW_UP }], 4);
const sweepHold = (): Pose[] => [0, 1, 0, -1].map((q, i) => { const p = keyed([{ f: 0, p: SW_UP }], 1)[0]; p.by += 0.3 * q; p.glow = 1.2 + 0.2 * Math.abs(q); p.ph = i; p.wind = 1.5 + 0.5 * q; return p; });
const sweepStrike = (): Pose[] => {
  const SPN: PP = { by: 1.2, lean: 0.1, sL: { g: [4, -9, 0], rl: 0.35, pt: 0, bt: 0.5 }, sR: { g: [4, -9, 0], rl: 0.35, pt: 0, bt: 0.5 }, fL: [-1.5, 0, 0], fR: [1.5, 0, 0], flare: 1, wind: 0 };
  const out: Pose[] = [];
  for (let i = 0; i < 12; i++) {
    const t = i / 11, spin = easeIO(Math.min(1, i / 9)) * 2 * PI;
    const p = i === 0 ? keyed([{ f: 0, p: SW_UP }, { f: 1, p: SPN }], 2)[1] : i < 10 ? keyed([{ f: 0, p: SPN }], 1)[0] : keyed([{ f: 0, p: SPN }, { f: 2, p: {} }], 3)[i - 9];
    p.yaw = i < 10 ? spin : 0; p.trail = i >= 2 && i <= 8 ? 0.8 : 0; p.trailAt = "LR"; p.ring = i >= 2 && i <= 9 ? Math.min(1, (i - 1) / 5) : 0; p.flare = i < 10 ? 1 - 0.3 * t : p.flare; p.ph = i;
    out.push(p);
  }
  return out;
};
// жатва: серпы скрещены высоко над головой, души стекаются; удар крест-накрест в землю перед собой с глубоким поклоном
const HV_UP: PP = { by: 0.6, lean: -0.04, sL: { g: [-6, -4, 8], rl: -0.7, pt: 0.1 }, sR: { g: [-6, -4, 9], rl: -0.7, pt: 0.1 }, pL: [3, -10, 2], pR: [-3, -10, 2], fire: 1.3, head: [0, 0], htilt: 0, wind: 1, glow: 1.4 };
const harvWind = (): Pose[] => keyed([{ f: 0, p: {} }, { f: 3, p: HV_UP }], 4);
const harvHold = (): Pose[] => [0, 1, 2, 3].map((i) => { const p = keyed([{ f: 0, p: HV_UP }], 1)[0]; p.souls = 0.25 * (i + 1); p.ph = i; p.fire = 1.3 + 0.2 * SIN(i * PI / 2); p.glow = 1.4 + 0.1 * i; p.by = 0.6 - 0.3 * SIN(i * PI / 2); return p; });
const harvStrike = (): Pose[] => keyed([
  { f: 0, p: { ...HV_UP, souls: 1, glow: 1.5 } },
  { f: 2, p: { by: 4, lean: 0.55, sL: { g: [-6, 12, 13], rl: -0.3, pt: -1.9 }, sR: { g: [-6, 12, 13], rl: -0.3, pt: -1.9 }, pL: [3, 4, 4], pR: [-3, 4, 4], fire: 0.6, slam: 1, head: [0, 2], wind: -2.2, flare: 0.5, glow: 1.5 } },
  { f: 4, p: { by: 3.8, lean: 0.52, sL: { g: [-6, 12, 13], rl: -0.3, pt: -1.85 }, sR: { g: [-6, 12, 13], rl: -0.3, pt: -1.85 }, pL: [3, 4, 4], pR: [-3, 4, 4], fire: 0.6, slam: 0.6, head: [0, 1.8], wind: -1, glow: 1.3 } },
  { f: 7, p: { by: 1.4, lean: 0.2, sL: { g: [-2, 3, 4], rl: -0.1, pt: -0.5 }, sR: { g: [-2, 3, 4], rl: -0.1, pt: -0.5 }, slam: 0 } },
  { f: 9, p: {} },
], 10);
// оглушение: поникший, голова на груди, руки висят, серпы клинками вниз; над головой кружат искры, дым
const stunPoses = (): Pose[] => Array.from({ length: 8 }, (_, i) => { const ph = (2 * PI * i) / 8; return mkPose({
  by: 4.5, lean: 0.5, roll: 0.06 * SIN(ph), head: [0.6 * SIN(ph), 3.4] as V2, htilt: 0.3 * SIN(ph + 1),
  sL: { ...SC0, g: [-3, 13, 3], rl: 2.5 + 0.08 * SIN(ph), pt: -0.2 }, sR: { ...SC0, g: [-3, 13, 3], rl: 2.5 - 0.08 * SIN(ph), pt: -0.2 },
  pL: [4, 8, 2] as V3, pR: [-4, 8, 2] as V3, fire: 0.3 + 0.1 * SIN(ph), glow: 0.3 + 0.2 * SIN(ph), wind: 0.4 * SIN(ph), ph: i, stars: 1 }); });
// гибель: отшатнулся, серпы выпадают из рук и ложатся наземь, тело осыпается в прах сверху вниз, остаются кучка пепла с маской и серпы
const LIE = (by: number, s: number): PP["sL"] => ({ g: [-7, 33.5 - by, 8], rl: 1.55, pt: 0, yw: 1.1 });
const deathPoses = (): Pose[] => keyed([
  { f: 0, p: {} },
  { f: 2, p: { lean: -0.14, by: 0.5, head: [0, -1], htilt: -0.2, glow: 1.5, fire: 1.4, sL: { g: [3, -4, 0], rl: 0.4 }, sR: { g: [3, -4, 0], rl: 0.4 } } },
  { f: 4, p: { lean: 0.22, by: 2, head: [0, 1.5], htilt: 0.15, glow: 0.8, fire: 0.5, dis: 0.05, sL: { g: [-3, 14, 6], rl: 0.8, yw: 0.5 }, sR: { g: [-3, 14, 6], rl: 0.8, yw: 0.5 }, wind: 1 } },
  { f: 6, p: { lean: 0.34, by: 3.4, head: [0, 2.6], htilt: 0.28, glow: 0.3, fire: 0, dis: 0.3, ash: 0.25, sL: LIE(3.4, -1), sR: LIE(3.4, 1), mist: 0.8 } },
  { f: 10, p: { lean: 0.46, by: 5.5, head: [0, 3.5], htilt: 0.35, glow: 0, fire: 0, dis: 0.85, ash: 0.85, sL: LIE(5.5, -1), sR: LIE(5.5, 1), mist: 0.8 } },
  { f: 13, p: { lean: 0.5, by: 6, glow: 0, fire: 0, dis: 1.2, ash: 1, sL: LIE(6, -1), sR: LIE(6, 1), mist: 0.25 } },
], 14);

export type ReaperAnim = "idle" | "walk" | "attack" | "twinWind" | "twinHold" | "twinStrike" | "duelWind" | "duelHold" | "duelCast"
  | "sweepWind" | "sweepHold" | "sweepStrike" | "harvWind" | "harvHold" | "harvStrike" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: ReaperAnim; hit?: number };
const ANIM_ORDER: [ReaperAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой, плащ на ветру" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар серпом", hit: 5 }],
  ["twinWind", { n: 4, fps: 12, loop: false, ru: "серпы заведены", next: "twinHold" }],
  ["twinHold", { n: 4, fps: 12, loop: true, ru: "замах", next: "twinStrike" }],
  ["twinStrike", { n: 10, fps: 15, loop: false, ru: "двойной взмах", hit: 2 }],
  ["duelWind", { n: 4, fps: 12, loop: false, ru: "серп на цель", next: "duelHold" }],
  ["duelHold", { n: 4, fps: 12, loop: true, ru: "клеймо в ладони", next: "duelCast" }],
  ["duelCast", { n: 8, fps: 12, loop: false, ru: "метка дуэли", hit: 3 }],
  ["sweepWind", { n: 4, fps: 12, loop: false, ru: "присед", next: "sweepHold" }],
  ["sweepHold", { n: 4, fps: 12, loop: true, ru: "серпы назад", next: "sweepStrike" }],
  ["sweepStrike", { n: 12, fps: 15, loop: false, ru: "размах вкруговую", hit: 5 }],
  ["harvWind", { n: 4, fps: 12, loop: false, ru: "серпы над головой", next: "harvHold" }],
  ["harvHold", { n: 4, fps: 12, loop: true, ru: "души к клинкам", next: "harvStrike" }],
  ["harvStrike", { n: 10, fps: 12, loop: false, ru: "жатва", hit: 2 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель, прах и туман" }],
];
export const REAPER_ANIMS = {} as Record<ReaperAnim, AnimDef>;
{ let col = 0; for (const [k, a] of ANIM_ORDER) { REAPER_ANIMS[k] = { ...a, col }; col += a.n; } }
export const REAPER_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
/** связки умений (имена — рабочие, по карточке) */
export const REAPER_SKILLS: Record<string, { windup: [ReaperAnim, ReaperAnim]; strike: ReaperAnim }> = {
  twin_reap: { windup: ["twinWind", "twinHold"], strike: "twinStrike" },
  duel_mark: { windup: ["duelWind", "duelHold"], strike: "duelCast" },
  reaper_sweep: { windup: ["sweepWind", "sweepHold"], strike: "sweepStrike" },
  soul_harvest: { windup: ["harvWind", "harvHold"], strike: "harvStrike" },
};
const POSES: Record<ReaperAnim, () => Pose[]> = {
  idle: idlePoses, walk: walkPoses, attack: attackPoses, twinWind, twinHold, twinStrike, duelWind, duelHold, duelCast,
  sweepWind, sweepHold, sweepStrike, harvWind, harvHold, harvStrike, stun: stunPoses, death: deathPoses,
};

/** кадр с учётом гибели: тело распадается (снизу вверх уходит в прах, частицы — клубы вверх), серпы — отдельным слоем, кучка пепла */
function frame(view: ViewId, p: Pose): { img: Cv; emis: Cv } {
  if (p.dis <= 0 && p.ash <= 0) return render(view, p);
  const body = render(view, { ...p, mist: 0 }, { layer: "body" }), weap = render(view, p, { layer: "weap" });
  const o = new Cv(FR, FR);
  // серпы — под телом
  stamp(o, weap.img);
  // кучка пепла у ног: холмик с тёмным основанием, сверху лежит маска-оскал
  if (p.ash > 0.02) {
    const c = new Cv(W, W), a = p.ash, m = mk();
    m.ellR(80, 148, (8 + 5 * a) * Z, (1.5 + 1 * a) * Z);
    for (let k = 0; k < 3; k++) m.ellR((40 + (k - 1) * 5) * Z, (75 - 2.2 * a - (k === 1 ? 1.4 * a : 0)) * Z, (3.4 + 1.5 * a) * Z, (1.4 + 1.6 * a) * Z);
    paintB(c, m, ASH, { amp: 1.6, dome: 4, dith: 0.1, bias: 0.3 });
    if (a > 0.6) { const mx = 41, my = 72.5 - 2.6 * a, mm = polyM([[mx - 2.4, my - 1.6], [mx + 2.4, my - 1.6], [mx + 2.6, my + 0.6], [mx + 1.4, my + 2], [mx - 1.4, my + 2], [mx - 2.6, my + 0.6]]);
      paintB(c, mm, BONE, { amp: 1.5, dome: 2, dith: 0, bias: 0.2 }); dot1(c, mx - 1.2, my - 0.4, BONE[0]); dot1(c, mx + 1.2, my - 0.4, BONE[0]); for (let k = -1; k <= 1; k++) dot1(c, mx + k * 1.1, my + 1.2, k ? BONE[0] : BONE[4]); }
    stamp(o, down(c));
  }
  // тело: снизу вверх (линия распада поднимается), край — пепельная корка, выше линии — тело
  const line = 2 + p.dis * 74;
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    if (!body.img.has(x, y)) continue;
    const n = hash(x * 0.37, y * 0.53) * 6, yy = y + n;
    if (yy > line + 3) o.set(x, y, body.img.get(x, y));
    else if (yy > line) { const q = body.img.get(x, y), l = (q[0] + q[1] + q[2]) / 3; o.set(x, y, ASH[Math.min(4, Math.round(l / 40))]); }
  }
  o.outline(OUTL);
  // прах и туман: клубы, поднимаются от линии распада
  if (p.dis > 0.05 && p.dis < 1.15) for (let i = 0; i < 16; i++) {
    const x = 26 + hash(i, 1) * 28 + SIN(p.ph + i) * 2, y = line - 1 - hash(2, i) * 12 - (p.ph % 3) * 1.5, r = 1 + hash(i, 4) * 1.6;
    for (let j = -2; j <= 2; j++) for (let q = -3; q <= 3; q++) { if ((q / 1.5) ** 2 + j * j > r * r) continue; const X = Math.round(x + q), Y = Math.round(y + j); if (X < 1 || X > 78 || Y < 1 || Y > 77 || o.has(X, Y)) continue; o.set(X, Y, (i % 3 === 0 ? MIST : ASH)[j < 0 ? 3 : 2]); }
  }
  if (p.mist > 0.05) mist(o, p.mist, p.ph, 0);
  for (let x = 0; x < FR; x++) if (o.has(x, FR - 1)) { o.d[((FR - 1) * FR + x) * 4 + 3] = 0; if (o.has(x, FR - 2)) o.set(x, FR - 2, OUTL); }
  const emis = new Cv(FR, FR);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (o.has(x, y) && GLOWSET.has(o.get(x, y).join())) emis.set(x, y, o.get(x, y));
  return { img: o, emis };
}

// ---------------- эффект мира: метка дуэли на танке ----------------
/** Метка дуэли (64×32, 2 строки — рисунок и свечение): знак под танком — кольцо с двумя скрещёнными серпами; 0–2 появляется, 3–5 держится (пульс), 6–7 гаснет. */
export const GAME_FX = {
  duel: { w: 64, h: 32, ax: 32, ay: 16, n: 8, fps: 12, hit: 2, anims: { duelIn: { col: 0, n: 3, loop: false, hit: 2 }, duelHold: { col: 3, n: 3, loop: true }, duelOut: { col: 6, n: 2, loop: false } } },
};
function duelFx(i: number): Cv {
  const o = new Cv(64, 32), cx = 32, cy = 16, k = [0.4, 0.75, 1, 1, 1.08, 1, 0.8, 0.5][i], fade = i >= 6;
  const R = 26 * k, c1 = fade ? MARK0 : MARK1, c0 = MARK0;
  for (let q = 0; q < 200; q++) { const a = (q / 200) * 2 * PI, x = cx + COS(a) * R, y = cy + SIN(a) * R * 0.42; if (fade && hash(q, i) < 0.4) continue; o.set(x, y, SIN(a) > 0 ? c1 : c0); if (SIN(a) > 0.2) o.set(x, y + 1, OUTL); }
  for (let q = 0; q < 120; q++) { const a = (q / 120) * 2 * PI, x = cx + COS(a) * R * 0.74, y = cy + SIN(a) * R * 0.74 * 0.42; if (q % 10 < 6 && !(fade && hash(q, i + 3) < 0.5)) o.set(x, y, c0); }
  // два скрещённых серпа внутри (знак), в перспективе пола
  if (k > 0.6) for (const s of [-1, 1]) {
    for (let t = -1; t <= 1; t += 0.04) { const x = cx + t * R * 0.55 * s, y = cy + t * R * 0.55 * 0.42; o.set(x, y, c1); }
    for (let t = 0; t <= 1; t += 0.05) { const a = PI * 0.15 + t * PI * 0.65, bx = cx + s * R * 0.55, by = cy - R * 0.55 * 0.42 * s * -1; const x = bx - s * COS(a) * R * 0.32, y = by + SIN(a) * R * 0.32 * 0.42 * -s; if (x > 0 && x < 64) o.set(x, y, c1); }
  }
  return o;
}

// ---------------- листы и превью ----------------
const cvToPng = (c: Cv): PNG => { const p = new PNG({ width: c.w, height: c.h }); p.data = Buffer.from(c.d); return p; };
const savePng = (c: Cv, f: string) => fs.writeFileSync(f, PNG.sync.write(cvToPng(c)));
/** кроп референса 20 (фигура с серпами по ширине кадра) */
function refCrop(root: string, h: number): Cv | null {
  const f = path.join(root, "tools", "out", "bosses139", "ref-20.png");
  if (!fs.existsSync(f)) return null;
  const p = PNG.sync.read(fs.readFileSync(f)), x0 = Math.round(p.width * 0.0), x1 = Math.round(p.width * 1), y0 = Math.round(p.height * 0.21), y1 = Math.round(p.height * 0.86);
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
const GROUND = hx("#6a6560"), PANEL = hx("#322f38"), NIGHT = hx("#161c34"), BG = hx("#26242b");
function nightTint(c: Cv, x: number, y: number, w: number, h: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (c.has(x + i, y + j)) { const q = c.get(x + i, y + j); c.set(x + i, y + j, [Math.round(q[0] * 0.45), Math.round(q[1] * 0.5), Math.round(q[2] * 0.75)]); } }
const silc = (c: Cv, col: C): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(x, y, col); return o; };
/** земля с контактной тенью под ступнями (как в игре: тень от основания) */
function groundTile(c: Cv, x: number, y: number, w: number, h: number, k: number, footY: number) {
  c.rect(x, y, w, h, GROUND);
  const cx = x + w / 2, cy = footY, rx = 15 * k, ry = 4 * k;
  for (let j = -Math.ceil(ry); j <= ry; j++) for (let i = -Math.ceil(rx); i <= rx; i++) { const d = (i / rx) ** 2 + (j / ry) ** 2; if (d <= 1) c.set(cx + i, cy + j, d < 0.45 ? hx("#3e3a36") : hx("#504b46")); }
}

export function writeReaperArt(root: string, outDir: string, only?: ReaperAnim[], quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const N = FRAME, FH = FRAME_H, sheet = new Cv(N * REAPER_COLS, FH * 3), glow = new Cv(N * REAPER_COLS, FH * 3);
  const bad: string[] = [];
  for (const [a, d] of ANIM_ORDER) {
    if (only && !only.includes(a)) continue;
    const poses = POSES[a]();
    VIEWS.forEach((v, row) => poses.slice(0, quick ? 1 : d.n).forEach((p, i) => {
      const r = frame(v, p), x0 = (REAPER_ANIMS[a].col + i) * N, y0 = row * FH;
      blitSub(sheet, r.img, 0, 0, N, FH, x0, y0); blitSub(glow, r.emis, 0, 0, N, FH, x0, y0);
      let body = 0;
      for (let k = 0; k < FH; k++) for (const x of [0, N - 1]) if (r.img.has(x, k)) body++;
      for (let k = 0; k < N; k++) for (const y of [0, FH - 1]) if (r.img.has(k, y)) body++;
      if (body) { const e = [0, N - 1].map((x) => { let n = 0; for (let k = 0; k < FH; k++) if (r.img.has(x, k)) n++; return n; }), t = [0, FH - 1].map((y) => { let n = 0; for (let k = 0; k < N; k++) if (r.img.has(k, y)) n++; return n; }); bad.push(`${a} ${v} кадр ${i + 1}: Л${e[0]} П${e[1]} В${t[0]} Н${t[1]}`); }
    }));
  }
  savePng(sheet, path.join(outDir, "reaper-sheet.png")); savePng(glow, path.join(outDir, "reaper-glow.png"));
  { const F2 = GAME_FX.duel, fx = new Cv(F2.w * F2.n, F2.h * 2);
    for (let j = 0; j < F2.n; j++) { const f = duelFx(j); for (let y = 0; y < F2.h; y++) for (let x = 0; x < F2.w; x++) { if (!f.has(x, y)) continue; const q = f.get(x, y); fx.set(j * F2.w + x, y, q); if (GLOWSET.has(q.join())) fx.set(j * F2.w + x, F2.h + y, q); } }
    savePng(fx, path.join(outDir, "reaper-fx-duel.png")); }

  // сравнение: покой ×3 в 4 видах | референс; ×1 день и ночь; по две анимации в ряд (вниз, 4 кадра ×2)
  const ref = refCrop(root, 240);
  const shown = ANIM_ORDER.filter(([a]) => !only || only.includes(a));
  const rows = Math.ceil(shown.length / 2), rowH = 176;
  const RW = Math.max(1360, 990 + (ref ? ref.w + 12 : 0));
  const c = new Cv(RW, 340 + 40 + rows * rowH + 90);
  c.rect(0, 0, c.w, c.h, BG);
  label(c, 10, 8, "ЖНЕЦ ПОКОЙ ВНИЗ ВВЕРХ ВБОК ВЛЕВО ×3 | РЕФЕРЕНС 20", 2);
  const idle = (row: number, fl = false, col = 0): Cv => { const f = new Cv(N, FH); blitSub(f, sheet, col * N, row * FH, N, FH, 0, 0); return fl ? flip(f) : f; };
  const idles = [idle(0), idle(1), idle(2), idle(2, true)];
  idles.forEach((f, i) => { groundTile(c, 10 + i * 244, 30, 240, 240, 3, 30 + 76 * 3); c.blit(f, 10 + i * 244, 30, 3); });
  c.rect(10, 280, 4 * 244 - 4, 84, GROUND); idles.forEach((f, i) => { groundTile(c, 10 + i * 244 + 80, 282, 80, 80, 1, 282 + 76); c.blit(f, 10 + i * 244 + 80, 282, 1); });
  if (ref) { c.rect(990, 30, ref.w + 8, 240, PANEL); c.blit(ref, 994, 30, 1); }
  c.rect(990, 280, 360, 84, NIGHT);
  for (let k = 0; k < 3; k++) { const row = k === 1 ? 2 : 0, col = k === 2 ? REAPER_ANIMS.harvHold.col + 3 : 0, x = 1000 + k * 112; blitSub(c, sheet, col * N, row * FH, N, FH, x, 282); nightTint(c, x, 282, N, FH); blitSub(c, glow, col * N, row * FH, N, FH, x, 282); }
  const y0 = 380;
  shown.forEach(([a, d], idx) => {
    const col = idx % 2, row = Math.floor(idx / 2), ox = 10 + col * 680, oy = y0 + row * rowH;
    c.rect(ox, oy, 670, rowH - 6, PANEL);
    label(c, ox + 4, oy + 3, REAPER_ANIMS[a].ru.toUpperCase(), 2);
    const nShow = Math.min(4, d.n), step = (d.n - 1) / Math.max(1, nShow - 1);
    for (let k = 0; k < nShow; k++) {
      const fi = Math.round(k * step), fx = ox + 4 + k * 166;
      c.rect(fx, oy + 18, 162, 150, GROUND);
      blitSub(c, sheet, (REAPER_ANIMS[a].col + fi) * N, 0, N, FH, fx + 1, oy + 18 - 10, 2);
    }
  });
  { const oy = y0 + rows * rowH; c.rect(10, oy, RW - 20, 84, PANEL); label(c, 14, oy + 3, "МЕТКА ДУЭЛИ ПОД ТАНКОМ ×2", 2); c.rect(14, oy + 18, RW - 28, 62, GROUND);
    for (let j = 0; j < 8; j++) { const f = duelFx(j); c.blit(f, 18 + j * 134, oy + 16, 2); } }
  const fCmp = path.join(outDir, "r79s-e-compare.png"); savePng(c, fCmp);

  // превью листа: каждая анимация — три ряда (вниз, вверх, вбок), все кадры ×1
  const PW = 14 * 82 + 20, blocks = shown.map(([a, d]) => ({ a, d, lines: Math.ceil(d.n / 14) }));
  const ph = blocks.reduce((s, b) => s + 16 + b.lines * 3 * 82 + 6, 10);
  const pv = new Cv(PW, ph); pv.rect(0, 0, PW, ph, BG);
  let yy = 6;
  for (const b of blocks) {
    label(pv, 10, yy, `${b.d.ru}`.toUpperCase(), 2); yy += 14;
    for (let ln = 0; ln < b.lines; ln++) for (let v = 0; v < 3; v++) {
      for (let k = ln * 14; k < Math.min(b.d.n, ln * 14 + 14); k++) { const x = 10 + (k - ln * 14) * 82; pv.rect(x, yy, 80, 80, GROUND); blitSub(pv, sheet, (REAPER_ANIMS[b.a].col + k) * N, v * FH, N, FH, x, yy); }
      yy += 82;
    }
    yy += 8;
  }
  const fPrev = path.join(outDir, "r79s-e-sheet.png"); savePng(pv, fPrev);
  // силуэт ×4 (проверка читаемости)
  { const s = new Cv(4 * 330, 330); s.rect(0, 0, s.w, s.h, BG); idles.forEach((f, i) => s.blit(silc(f, SIL), 5 + i * 330, 5, 4)); savePng(s, path.join(outDir, "r79s-e-sil.png")); }
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 40).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; } else console.log("  проверки: край кадра чист");
  console.log(`  ${ID}: ${REAPER_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  return [path.join(outDir, "reaper-sheet.png"), path.join(outDir, "reaper-glow.png"), path.join(outDir, "reaper-fx-duel.png"), fCmp, fPrev];
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/umb_twin_reaper.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const out = path.join(root, "tools", "out", "bosses139"), t = Date.now();
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? (onlyArg.slice(7).split(",") as ReaperAnim[]) : undefined;
  const files = writeReaperArt(root, out, only, process.argv.includes("--quick"));
  console.log(`  ${files.length} файлов`);
  console.log(`  ${((Date.now() - t) / 1000).toFixed(1)} с`);
}
