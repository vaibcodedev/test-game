/**
 * Мглогляд — древень Мглистого бора (Умбрат, 10–20; data/zone-bosses.json, id umb_fog_treant; образец
 * tools/out/refs/bosses/14.png — только для сравнения). Задача 136, шаг 3: тем же способом и на том же уровне, что пилот —
 * древень Торнвель (tools/gen/zone-bosses-art.ts). В игру пока не подключён: механика — шаг 4.
 *
 * Отличие от Торнвеля — силуэт и цвет. Сутулый, тоньше в поясе, без наплечников; голова — череп из выбеленного дерева с одним
 * бирюзовым глазом 4×4 во лбу и пастью-дуплом; крона — пять голых ветвей-рогов (без листвы); руки — длинные ветви с когтями
 * ниже пояса; на груди — бирюзовое ядро в кольце корней; кора холодная, серо-бурая (гниль), мох тёмно-зелёный пятнами;
 * в коре — дупла с бирюзовым огнём. Туман у ног и огоньки — не кадры листа (см. FOG_TREANT_FOG).
 *
 * Лист — как у пилота: кадр 64×64, пиксель листа = пиксель мира; строки 0 — вниз, 1 — вверх, 2 — вбок вправо (влево —
 * отражение); ступни на y = 60 (точка опоры 30/32 кадра). Анимации — FOG_TREANT_ANIMS: покой, ходьба, атака, по связке
 * «замах → удержание по кругу → удар» на каждое умение карточки (Взгляд, Миазмы, Гнилые шишки), гибель.
 *
 * Рендер — копия конвейера пилота (в zone-bosses-art.ts он не экспортирован): скелет в 3D, IK рук и ног, объёмные примитивы,
 * гладко слитые внутри детали; луч на пиксель (наклон камеры 14°), свет сверху слева → 5 тонов материала, тень, затенение
 * складок, швы между деталями тоном тени, контур 1 px. Корпус, голова и крона — жёсткий слой: между кадрами сдвигается только
 * на целые пиксели, кора не «кипит». Глаз, глазница, пасть, дупла и прожилки ядра — штампы в целых пикселях. Ядро — светящийся
 * материал: тон по повороту к зрителю (середина светлее), не по свету; бирюзовый отсвет на коре — двумя ступенями.
 *
 * Эффекты мира умений — отдельными листами (как корни пилота: строка 0 — под юнитами, 1 — над ними): луч «Взгляда»
 * (umb_fog_treant-beamfx.png: тайл полосы и конец луча), мгла «Миазмов» в метке 40 px (umb_fog_treant-miasmafx.png),
 * «Гнилые шишки» — падение, ожидание и разрыв в метке 32 px (umb_fog_treant-sporefx.png).
 *
 * Запуск: npx tsx tools/gen/zone-bosses.ts art → tools/out/zone-bosses/umb_fog_treant-*.png, umb_fog_treant.html.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "./canvas";

const ID = "umb_fog_treant";
const N = 64;
const CX = 32, GY = 60;
/** Наклон камеры — как у пилота. */
const CAM = (14 * Math.PI) / 180;
const CS = Math.cos(CAM), SN = Math.sin(CAM);
/** Подъём в мире на PX — ровно 1 px кадра по вертикали. */
const PX = 1 / CS;

export type FView = "down" | "up" | "side";
const VIEWS: FView[] = ["down", "up", "side"];

// ---------------- палитра ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Гнилое дерево: холодное; тени уходят в сине-зелёный, свет — в серо-бирюзовый (отделяет корпус от тёмной лесной земли). */
const BARK = R("#101514", "#222927", "#3b423d", "#617069", "#93a69d");
/** Мёртвые ветви кроны и когти: светлее и серее коры. */
const TWIG = R("#141918", "#2a2f2b", "#484e47", "#6f7a70", "#a0ae9f");
/** Череп-маска и кольцо корней вокруг ядра: выбеленное дерево. */
const FACE = R("#25241e", "#48443a", "#716a59", "#9d937b", "#c9bea0");
/** Тёмно-зелёный мох. */
const MOSS = R("#0d190b", "#183014", "#26481c", "#386226", "#527c31");
/** Бирюзовый огонь: глаз, ядро, дупла (P.enchant #3ff0d0 — между 2 и 3). */
const GLOW = R("#0a3a3c", "#0f7c78", "#25c6b6", "#86f4e2", "#e8fffa");
/** Гибель: пепельно-серое дерево, мох буреет, огонь гаснет. */
const DEAD = R("#151618", "#2a2a2b", "#424240", "#5d5c56", "#7c7a70");
const MOSS_DEAD = R("#1a1810", "#2e2a1a", "#463f26", "#5e5532", "#786d40");
const GLOW_DEAD = R("#0d1414", "#18292a", "#29403f", "#3c5856", "#56706c");
/** Туман: холодный серо-бирюзовый (выдох, клубы). */
const MIST = R("#25403d", "#41625d", "#6a8d86", "#9cbcb2", "#cfe6dc");
/** Мгла «Миазмов»: ядовитая, зеленее тумана. */
const MIASMA = R("#2b4a43", "#4d7466", "#74a08a", "#a2cbb0", "#d2eed8");
/** Пузырьки яда: жёлто-зелёные. */
const BUBBLE = hex("#cfe68a");
/** След удара когтей: бледная бирюза без полупрозрачности. */
const SMEAR = R("#3c6e68", "#8cc8bc", "#e0fff6");
const OUT = hex("#090d0d");
/** Отсвет огня на коре. */
const TINT = hex("#3ff0d0");

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
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const TAU = Math.PI * 2;
const easeInOut = (t: number) => t * t * (3 - 2 * t);
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const linear = (t: number) => t;

/** Поворот вектора: крен (вокруг Y), наклон (вокруг X, верх уходит вперёд), разворот (вокруг Z). */
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

// ---------------- вид и камера (как у пилота) ----------------
function toView(view: FView, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
function fromView(view: FView, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
const scr = (p: V3): [number, number] => [CX + p[0], GY + SN * p[1] - CS * p[2]];
const depthOf = (p: V3) => -(CS * p[1] + SN * p[2]);
const LIGHT: V3 = norm([-0.58, 0.42, 0.7]);
/** К зрителю (в пространстве вида). */
const EYEDIR: V3 = [0, CS, SN];
function snapPx(view: FView, w: V3): V3 {
  const v = toView(view, w);
  const sx = Math.round(v[0]), sy = Math.round(SN * v[1] - CS * v[2]);
  return fromView(view, [sx, 0, -sy * PX]);
}
const pxToWorld = (view: FView, dx: number, dy: number): V3 => fromView(view, [dx, 0, -dy * PX]);

// ---------------- примитивы ----------------
const M_BARK = 0, M_TWIG = 1, M_FACE = 2, M_MOSS = 3, M_CORE = 4, M_CLAW = 5, M_RING = 6;
interface MatDef { ramp: Ramp; base: number; gain: number; lo: number; hi: number; emis?: boolean }
const MATS: MatDef[] = [
  { ramp: BARK, base: 1.45, gain: 2.4, lo: 1, hi: 4 },
  { ramp: TWIG, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: FACE, base: 1.4, gain: 2.4, lo: 1, hi: 4 },
  { ramp: MOSS, base: 1.35, gain: 2.3, lo: 1, hi: 4 },
  { ramp: GLOW, base: 0, gain: 0, lo: 0, hi: 4, emis: true },
  { ramp: TWIG, base: 1.35, gain: 2.4, lo: 1, hi: 4 },
  { ramp: FACE, base: 1.45, gain: 2.4, lo: 1, hi: 4 },
];

interface Prim {
  k: number;
  a: V3; b: V3; ra: number; rb: number;
  ax: [V3, V3, V3]; r: V3;
  mat: number; g: number; part: number;
  tex: number; ng: number; ref: V3; seed: number;
  band?: [number, number]; bandMat?: number;
  moss: number; tone: number;
  sph: boolean; ba: V3; l2: number; rr: number; a2: number; il2: number; len: number; bc: V3; br: number;
}
interface Opt { mat?: number; tex?: number; ng?: number; ref?: V3; seed?: number; band?: [number, number]; bandMat?: number; moss?: number; part?: number; tone?: number }

/** Штамп в целых пикселях у точки поверхности: лицо (глазница, глаз, пасть), дупло с огнём, огонь ядра. */
interface Stamp { kind: "face" | "hole" | "core"; at: V3; n: V3; glow: number; v?: number; mouth?: number }
/**
 * Частица в мире: щепка, ком, искра, шишка; size 2 — пиксель и тёмный под ним. Искра (to) — яркая головка и тусклый хвост
 * в сторону, обратную полёту; шишка — рисунок 3×3.
 */
interface Mote { p: V3; col: RGBA; dark?: RGBA; size?: number; front?: boolean; to?: V3; shape?: "pod" }
/** Плоский клуб пыли у земли. */
interface Puff { c: V3; k: number; seed: number }
/** Клуб тумана в мире (выдох, рассеивание): радиус в пикселях, тон 0..1 (светлее — свежее). */
interface Wisp { p: V3; r: number; k: number; seed: number; glow?: boolean; poison?: boolean; flat?: number }

class Scene {
  prims: Prim[] = [];
  gk: number[] = [];
  stamps: Stamp[] = [];
  motes: Mote[] = [];
  puffs: Puff[] = [];
  wisps: Wisp[] = [];
  smears: { pts: V3[]; arm: number }[] = [];
  flash: { at: V3; k: number } | null = null;
  /** вспышка у глаза: «Взгляд» (рисуется поверх всего, вокруг глазницы) */
  flare: { at: V3; k: number } | null = null;
  /** глаз в мире — привязка вспышки */
  eye: V3 = [0, 0, 0];
  armG: [number, number] = [-1, -1];
  clawG: [number, number] = [-1, -1];
  core = 1;
  parts = 0;
  group(k: number): number {
    this.gk.push(k);
    return this.gk.length - 1;
  }
  private push(q: Prim) {
    this.prims.push(q);
    return q;
  }
  cone(g: number, a: V3, ra: number, b: V3, rb: number, o: Opt = {}): Prim {
    const ax = sub(b, a);
    return this.push({
      k: 0, a, b, ra, rb, ax: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], r: [ra, ra, ra],
      mat: o.mat ?? M_BARK, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, ref: o.ref ?? perp(ax, [0, 1, 0.01]),
      seed: o.seed ?? 0, band: o.band, bandMat: o.bandMat, moss: o.moss ?? 0, tone: o.tone ?? 0,
      sph: false, ba: [0, 0, 0], l2: 0, rr: 0, a2: 0, il2: 0, len: 0, bc: a, br: 0,
    });
  }
  ball(g: number, c: V3, r: number, o: Opt = {}): Prim {
    return this.cone(g, c, r, c, r, o);
  }
  ell(g: number, c: V3, r: V3, ax: [V3, V3, V3], o: Opt = {}): Prim {
    return this.push({
      k: 1, a: c, b: c, ra: 0, rb: 0, ax, r,
      mat: o.mat ?? M_BARK, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, ref: ax[0],
      seed: o.seed ?? 0, band: o.band, bandMat: o.bandMat, moss: o.moss ?? 0, tone: o.tone ?? 0,
      sph: false, ba: [0, 0, 0], l2: 0, rr: 0, a2: 0, il2: 0, len: 0, bc: c, br: 0,
    });
  }
  newPart() {
    return 1000 + this.parts++;
  }
}

function prepare(q: Prim, view: FView | null) {
  if (view) {
    q.a = toView(view, q.a);
    q.b = toView(view, q.b);
    q.ref = toView(view, q.ref);
    q.ax = [toView(view, q.ax[0]), toView(view, q.ax[1]), toView(view, q.ax[2])];
  }
  if (q.k === 1) {
    q.bc = q.a;
    q.br = Math.max(q.r[0], q.r[1], q.r[2]);
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
const bigPrim = (q: Prim) => (q.k === 1 ? [...q.r].sort((a, b) => b - a)[1] >= 4.5 : Math.max(q.ra, q.rb) >= 4);

function sdPrim(q: Prim, x: number, y: number, z: number): number {
  const px = x - q.a[0], py = y - q.a[1], pz = z - q.a[2];
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

// ---------------- поза ----------------
interface Pose {
  /** сдвиг тела (в кадре — на целые пиксели) */
  root: V3;
  bob: number;
  /** дыхание: грудь с плечами и головой, голова сверх груди — целые пиксели кадра */
  chest: number; headZ: number;
  pitch: number; yaw: number; roll: number;
  hp: number; hy: number; hr: number;
  /** запястья [правое, левое]; локти — по IK к pole */
  hand: [V3, V3]; pole: [V3, V3];
  foot: [V3, V3]; toe: [number, number];
  /** сдвиг кроны относительно головы — целые пиксели кадра [вправо, вниз] */
  crown: [number, number];
  /** подъём руки целиком — целые пиксели кадра */
  armLift: [number, number];
  /** глаз 0..1.6 (выше 1.2 — вспышка «Взгляда»), ядро и дупла 0..1.5; пасть 0 — дупло, 1 — разинута, 2 — во всю ширь */
  eye: number; core: number; mouth: number;
  /** когти: сжаты 0..1, растопырены 0..1; гибель: пепел 0..1 */
  curl: number; spread: number; wither: number;
  /** пыль от шага [пр, лев]; вспышка удара */
  dust: [number, number]; flash: number;
  puff?: number;
  trail?: V3[]; trailArm?: number; trail2?: V3[];
  /** выдох мглы: фаза петли 0..1 (нет — не дышит); выброс мглы 0..1; шишки с кроны — фаза; искры к глазу 0..1 */
  mist?: number; burst?: number; cones?: number; sparks?: number;
  /** гибель: душа из ядра 0..1, щепки 0..1; пыль и комья у кистей после удара о землю 0..1 */
  soul?: number; chips?: number; clods?: number;
  /** вспышка у глаза 0..1 (выстрел «Взгляда») */
  flare?: number;
  t: number; seed: number;
}

const HIP0 = 16;
/** Крона выше CROWN_Z сжата по высоте в CROWN_K раз. */
const CROWN_Z = 50, CROWN_K = 0.72;
/** Шея: голова вынесена вперёд — сутулость. */
const NECK: V3 = [0, 2.6, 33.0];
const ARM: [number, number] = [9.6, 10.0];
const REST_HAND: [V3, V3] = [[17.0, 8.4, 15.4], [-17.4, 7.2, 16.2]];
const REST: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.22, yaw: 0, roll: 0, hp: -0.1, hy: 0, hr: 0,
  hand: REST_HAND, pole: [[1, -0.4, 0.1], [-1, -0.4, 0.1]],
  foot: [[8.6, 2.0, 3.4], [-8.6, -0.4, 3.4]], toe: [0, 0],
  crown: [0, 0], armLift: [0, 0], eye: 1, core: 1, mouth: 0, curl: 0.25, spread: 0, wither: 0,
  dust: [0, 0], flash: 0, t: 0, seed: 1,
};

/** Мглогляд в координатах модели (X — вправо от древня, Y — вперёд, Z — вверх). */
function fogTreant(p0: Pose, view: FView): Scene {
  const S = new Scene();
  // вбок: корпус и голова чуть повёрнуты к зрителю (три четверти) — видны глаз, пасть и ядро
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.24, hy: p0.hy - 0.3 } : p0;
  S.core = p.core;
  const pel: V3 = add([0, 0, HIP0], snapPx(view, [p.root[0], p.root[1], p.bob + p.root[2]]));
  const up = p.chest * PX, hz = p.headZ * PX;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  const T = (v: V3, lift = v[2] >= 24): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PV = (v: V3): V3 => add(pel, rot(sub(v, [0, 0, HIP0]), 0, p.yaw * 0.35, p.roll * 0.5));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, 0, roll)), f(rot([0, 1, 0], pitch, 0, roll)), f(rot([0, 0, 1], pitch, 0, roll)),
  ];
  const sides: [number, number][] = [[0, 1], [1, -1]];

  // ---------- ствол: от бёдер к груди чуть шире, к голове уже; узлы плеч, откуда растут руки-ветви ----------
  const gBody = S.group(2.2);
  S.cone(gBody, PV([0, 0.2, 14.2]), 5.6, T([0, 0.4, 20.0]), 6.2, { tex: 1, ng: 5, ref: TV([1, 0, 0]), seed: 1 });
  S.ell(gBody, T([0, 0.4, 25.6]), [7.4, 5.8, 6.8], axes(TV), { tex: 1, ng: 6, seed: 2 });
  S.cone(gBody, T([0, -0.2, 29.0]), 6.0, T([0, 1.2, 33.4]), 4.6, { tex: 1, ng: 5, ref: TV([1, 0, 0]), seed: 3 });
  S.ball(gBody, T([7.0, -0.6, 30.4]), 3.4, { seed: 4 });
  S.ball(gBody, T([-7.2, -0.8, 31.4]), 3.8, { moss: 1, seed: 5 });

  // ---------- ядро: кольцо корней и бирюзовый шар в нём ----------
  const CC: V3 = [0, 5.7, 25.6];
  const e0 = TV([1, 0, 0]), e1 = TV(norm([0, -0.22, 1]));
  {
    const g = S.group(0.9);
    const pr = S.newPart();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const c = add(T(CC), add(mul(e0, Math.cos(a) * 3.8), mul(e1, Math.sin(a) * 3.8)));
      S.ball(g, c, 1.3, { mat: M_RING, part: pr, seed: 90 + k, tone: k % 2 ? -0.45 : 0.35 });
    }
    // корень вниз от кольца по животу
    S.cone(g, T([0.3, 6.0, 22.2]), 1.15, T([1.0, 5.6, 15.4]), 0.8, { mat: M_RING, part: S.newPart(), seed: 103 });
    const gc = S.group(0);
    S.ball(gc, T([0, 4.9, 25.6]), 2.9, { mat: M_CORE });
    // огонь ядра — штамп: круглое пятно в целых пикселях (сама сфера под ним — тёмная бирюза)
    S.stamps.push({ kind: "core", at: T([0, 7.7, 25.6]), n: TV([0, 1, 0]), glow: p.core });
  }

  // ---------- ноги: узловатые корни, колени наружу, ступни — корни-когти ----------
  for (const [i, s] of sides) {
    const g = S.group(1.4);
    const hip = PV([s * 4.6, 0.2, 14.4]);
    const an = p.foot[i];
    const kn = ik(hip, an, 6.2, 6.2, [s * 0.5, 1, 0]);
    S.cone(g, hip, 3.2, kn, 2.4, { tex: 1, ng: 4, ref: perp(sub(kn, hip), TV([s, 0, 0])), seed: 30 + i });
    S.ball(g, kn, 2.6, { moss: i === 0 ? 0.9 : 0, seed: 32 + i });
    S.cone(g, kn, 2.3, an, 2.4, { tex: 1, ng: 4, ref: perp(sub(an, kn), [s, 0, 0]), seed: 34 + i });
    const tp = p.toe[i];
    const lift = Math.max(0, an[2] - 3.4);
    const dirs = [-76, -32, 8, 48, 150];
    dirs.forEach((deg, k) => {
      const a = (s * deg * Math.PI) / 180;
      const d: V3 = [Math.sin(a), Math.cos(a), 0];
      const l = [5.4, 6.8, 7.2, 6.2, 4.0][k];
      const b0 = add(an, add(mul(d, 1.1), [0, 0, -0.8]));
      let b1 = add(an, mul(d, 1.1 + l));
      const lim = 11;
      const over = Math.max(Math.abs(b1[0] - p.root[0]) / lim, Math.abs(b1[1] - p.root[1]) / lim);
      if (over > 1) b1 = add(b0, mul(sub(b1, b0), Math.max(0.35, 1 - (over - 1) * (lim / Math.max(1e-3, vlen(sub(b1, b0)))))));
      b1[2] = Math.max(0.35, an[2] - 3.0 - 0.4 * lift + tp * 2);
      const bm = add(lerpV(b0, b1, 0.5), [0, 0, 1.1]);
      S.cone(g, b0, 1.7, bm, 1.15, { seed: 36 + k });
      S.cone(g, bm, 1.15, b1, 0.5, { seed: 40 + k, mat: M_CLAW });
    });
  }

  // ---------- руки: тонкие ветви из узлов плеч, локоть наружу, кисть с длинными когтями ----------
  for (const [i, s] of sides) {
    const g = S.group(0.9);
    S.armG[i] = g;
    const lift = pxToWorld(view, 0, -p.armLift[i]);
    const sh = add(T([s * 8.2, -0.6, 30.6]), lift);
    const wr = add(p.hand[i], lift);
    const el = ik(sh, wr, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, sh, 2.3, el, 1.7, { tex: 1, ng: 3, ref: perp(sub(el, sh), TV([0, 1, 0])), seed: 20 + i });
    S.ball(g, el, 2.0, { seed: 22 + i });
    const fa = sub(wr, el);
    S.cone(g, el, 1.8, wr, 1.4, { tex: 1, ng: 3, ref: perp(fa, TV([0, 1, 0])), seed: 24 + i });
    const dir = norm(fa);
    const hc = add(wr, mul(dir, 1.1));
    const pH = S.newPart();
    S.ell(g, hc, [1.9, 1.6, 2.0], [perp(dir, TV([s, 0, 0])), perp(dir, TV([0, 1, 0])), dir], { part: pH });
    // когти: веер поперёк кисти, загиб к ладони (вперёд и внутрь)
    const fan = perp(dir, TV([s * 0.8, 0.6, 0]));
    const palm = perp(dir, TV([-s * 0.45, 1, 0]));
    const L1 = 4.8 + 1.0 * p.spread - 0.9 * p.curl, L2 = 4.4 + 0.6 * p.spread - 0.7 * p.curl;
    const gC = S.group(0.3);
    S.clawG[i] = gC;
    [-1.5, 0, 1.5].forEach((o, k) => {
      const pc = S.newPart();
      const b0 = add(hc, add(mul(dir, 1.0), mul(fan, o)));
      const d1 = norm(add(add(dir, mul(fan, o * (0.26 + 0.34 * p.spread))), mul(palm, 0.12 - 0.2 * p.spread)));
      const m = add(b0, mul(d1, L1 - Math.abs(o) * 0.3));
      const d2 = norm(add(d1, mul(palm, 0.55 + 1.1 * p.curl - 0.35 * p.spread)));
      const tip = add(m, mul(d2, L2 - Math.abs(o) * 0.25));
      S.cone(gC, b0, 0.85, m, 0.7, { mat: M_CLAW, part: pc, seed: 26 + k });
      S.cone(gC, m, 0.7, tip, 0.42, { mat: M_CLAW, part: pc, seed: 26 + k, band: [0.25, 1.01], bandMat: M_FACE });
    });
    // мох свисает с предплечья
    {
      const at = lerpV(el, wr, 0.4);
      S.cone(g, add(at, [0, 0, -0.9]), 0.8, add(at, [s * 0.3, 0.2, -4.6]), 0.45, { mat: M_MOSS, part: S.newPart(), seed: 120 + i });
    }
  }

  // ---------- голова-череп на вершине ствола: выбеленная маска, скулы, челюсть; клин макушки с мхом ----------
  const gHead = S.group(1.2);
  const h = (x: number, y: number, z: number) => H([x, y, z]);
  S.ell(gHead, h(0, 3.4, 39.8), [6.4, 5.0, 6.8], axes(HV), { tex: 1, ng: 3, seed: 60 });
  S.ell(gHead, h(0, 6.1, 40.0), [5.9, 3.1, 6.9], axes(HV), { mat: M_FACE, seed: 61 });
  for (const s of [-1, 1]) S.ball(gHead, h(s * 4.5, 7.0, 37.0), 2.2, { mat: M_FACE, seed: 62 });
  S.ell(gHead, h(0, 6.4, 33.2), [4.3, 2.8, 2.4], axes(HV), { mat: M_FACE, seed: 63 });
  S.cone(gHead, h(0, 3.6, 44.6), 4.6, h(0, 3.0, 48.6), 2.3, { moss: 0.8, seed: 64 });
  const eyeW = h(0, 8.8, 42.2);
  S.eye = eyeW;
  S.stamps.push({ kind: "face", at: eyeW, n: HV([0, 1, 0]), glow: p.eye, mouth: p.mouth });

  // ---------- крона: пять голых ветвей с развилками, шире плеч ----------
  const gTwig = S.group(0.5);
  const lag = pxToWorld(view, p.crown[0], p.crown[1]);
  // верх кроны поджат, чтобы ветви не срезались верхним краем кадра (вид вверх, руки над головой)
  const hc = (x: number, y: number, z: number) => h(x, y, z > CROWN_Z ? CROWN_Z + (z - CROWN_Z) * CROWN_K : z);
  const branch = (pts: V3[], r: number[], seed: number, fixed = true) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = k === 0 && fixed ? hc(...pts[k]) : add(hc(...pts[k]), lag);
      S.cone(gTwig, a, r[k], add(hc(...pts[k + 1]), lag), r[k + 1], { mat: M_TWIG, tex: 1, ng: 2, seed: seed + k });
    }
  };
  branch([[1.8, 4.0, 46.6], [6.2, 5.6, 49.2], [11.4, 7.6, 50.4], [16.2, 9.0, 49.2], [19.0, 9.8, 46.8]], [1.8, 1.4, 1.05, 0.75, 0.55], 70);
  branch([[11.4, 7.6, 50.4], [13.6, 7.6, 53.8], [14.6, 7.4, 56.0]], [0.85, 0.65, 0.55], 75, false);
  branch([[6.2, 5.6, 49.2], [7.6, 7.0, 53.0]], [0.9, 0.55], 78, false);
  branch([[1.0, 3.0, 47.8], [3.6, 0.8, 52.0], [6.4, -1.8, 55.8], [8.8, -3.4, 58.8]], [1.5, 1.15, 0.85, 0.6], 80);
  branch([[6.4, -1.8, 55.8], [4.8, -2.8, 59.6]], [0.7, 0.55], 84, false);
  branch([[0, 2.6, 48.6], [-0.6, 1.0, 53.4], [0.4, -0.2, 57.6], [-0.4, -1.0, 60.4]], [1.3, 1.0, 0.75, 0.55], 86);
  branch([[-1.0, 3.8, 47.8], [-3.8, 5.0, 51.6], [-6.8, 5.6, 54.8], [-8.8, 5.8, 57.6]], [1.5, 1.15, 0.85, 0.6], 90);
  branch([[-6.8, 5.6, 54.8], [-10.6, 6.2, 56.0]], [0.7, 0.55], 94, false);
  branch([[-1.8, 3.2, 46.4], [-6.4, 1.4, 48.4], [-11.6, -1.6, 48.8], [-16.0, -3.6, 51.0], [-18.4, -4.6, 54.2]], [1.8, 1.4, 1.05, 0.75, 0.55], 96);
  branch([[-11.6, -1.6, 48.8], [-14.4, -2.6, 46.2], [-16.8, -3.0, 44.8]], [0.8, 0.6, 0.5], 101, false);
  branch([[-6.4, 1.4, 48.4], [-7.4, 0.2, 52.2]], [0.85, 0.55], 104, false);

  // ---------- дупла с бирюзовым огнём: одно спереди, два на спине ----------
  const holes: [V3, V3, number][] = [
    [[-5.4, 3.8, 30.2], [-0.5, 1, 0.3], 1],
    [[-3.0, -6.2, 29.0], [0, -1, 0], 0],
    [[3.8, -5.8, 19.6], [0.3, -1, 0], 1],
  ];
  for (const [a, n, v] of holes) S.stamps.push({ kind: "hole", at: T(a), n: TV(n), glow: p.core, v });

  const tips = [[19.0, 9.8, 46.8], [14.6, 7.4, 56.0], [8.8, -3.4, 58.8], [-0.4, -1.0, 60.4], [-8.8, 5.8, 57.6], [-18.4, -4.6, 54.2]].map((v) => add(hc(v[0], v[1], v[2]), lag));
  particles(S, p, { eye: eyeW, mouth: h(0, 8.6, 35.4), core: T([0, 6.0, 25.6]), tips });
  return S;
}

/** Шишка: тёмная чешуя, гнилое пятно. */
const CONE = R("#1c140d", "#36281a", "#58432a", "#7c6440", "#8fbf5a");
interface Anchors { eye: V3; mouth: V3; core: V3; tips: V3[] }
/** Частицы: пыль от шага, след удара, вспышка; искры к глазу, мгла из пасти, шишки с кроны, душа из ядра, щепки. */
function particles(S: Scene, p: Pose, a: Anchors) {
  // искры к глазу: сходятся по спирали — головка ярче, хвост наружу
  if ((p.sparks ?? 0) > 0.02) {
    const n = 6;
    for (let k = 0; k < n; k++) {
      const ph = (p.t * 2 + k / n) % 1;
      if (hash01(k, p.seed, 77) > p.sparks! + 0.15) continue;
      const ang = k * (TAU / n) + ph * 1.9 + p.t * 2;
      const r = lerp(13, 3.2, easeIn(ph));
      const off: V3 = [Math.cos(ang) * r, 1.5, Math.sin(ang) * r * 0.85];
      S.motes.push({ p: add(a.eye, off), col: GLOW[ph > 0.55 ? 4 : 3], dark: GLOW[ph > 0.55 ? 2 : 1], to: a.eye });
    }
  }
  if ((p.flare ?? 0) > 0.02) S.flare = { at: a.eye, k: p.flare! };
  // мгла: с растопыренных когтей стекает к земле и копится лужей; из пасти — короткий выдох
  if (p.mist !== undefined) {
    for (let i = 0; i < 2; i++) {
      const hnd = p.hand[i], s = i ? -1 : 1;
      for (let j = 0; j < 3; j++) {
        const u = (p.mist + j / 3) % 1;
        const z = lerp(hnd[2] - 3.5, 1.6, easeIn(u));
        S.wisps.push({ p: [hnd[0] + s * (0.6 + 2.2 * u * u), hnd[1] + 1.5, z], r: 1.0 + 1.4 * u, k: 0.95 - 0.35 * u, seed: j + 3 * i, poison: true });
      }
      // лужа у земли под когтями: два клуба, дышат со сдвигом
      for (let j = 0; j < 2; j++) {
        const ph = (p.mist + j * 0.5) % 1;
        S.wisps.push({ p: [hnd[0] + s * (j ? 3.2 : -1.0), hnd[1] + 2 + j, 1.2], r: 1.7 + 0.5 * Math.sin(ph * TAU), k: 0.55, seed: 20 + j + 2 * i, poison: true, flat: 1.6 });
      }
    }
  }
  // выброс мглы (удар «Миазмов»): из-под когтей у земли — кольцо клубов расходится и тает; из пасти — облако выдоха
  if ((p.burst ?? 0) > 0.02) {
    const k = p.burst!, e = 1 - k;
    for (let i = 0; i < 2; i++) {
      const hnd = p.hand[i], s = i ? -1 : 1;
      for (let j = 0; j < 5; j++) {
        const ang = (j / 4) * Math.PI * 1.1 - 0.35;
        const R0 = 2.5 + 8.6 * easeOut(e);
        S.wisps.push({ p: [hnd[0] + s * Math.cos(ang) * R0, hnd[1] + 2 + Math.sin(ang) * R0 * 0.7, 1.4 + 2.4 * e], r: 2.4 + 0.8 * e - (j % 2) * 0.5, k: 0.3 + 0.7 * k, seed: 40 + j + 5 * i, poison: true, flat: 1.5 });
      }
    }
    for (let j = 0; j < 3; j++) {
      const ang = (j / 3) * TAU + 0.5;
      S.wisps.push({ p: add(a.mouth, [Math.cos(ang) * (1 + 3 * e), 4 + 3 * e, Math.sin(ang) * (1 + 2 * e) + 2.5 * e]), r: 1.6 + 1.0 * e, k: 0.3 + 0.7 * k, seed: 50 + j, poison: true });
    }
  }
  // шишки летят с кончиков кроны вверх и в стороны (уходят за кадр)
  if (p.cones !== undefined) {
    for (let j = 0; j < 4; j++) {
      const u = (p.cones + j / 4) % 1;
      const tip = a.tips[(j * 2 + 1 + Math.floor(p.cones * 3)) % a.tips.length];
      const out = Math.sign(tip[0]) || 1;
      S.motes.push({ p: add(tip, [out * (1 + 5 * u), 0.5, 1 + 14 * u - 2 * u * u]), col: CONE[2], shape: "pod", front: true });
    }
  }
  // душа из ядра: бирюзовый клуб поднимается и тает
  if ((p.soul ?? 0) > 0.02 && p.soul! < 0.98) {
    const u = p.soul!;
    const at = add(a.core, [1.5 * Math.sin(u * 5), 3, 32 * easeOut(u)]);
    S.wisps.push({ p: at, r: 3.4 - 1.4 * u, k: 1 - 0.7 * u, seed: 40, glow: true });
    if (u > 0.12) S.wisps.push({ p: add(at, [-1.2 * Math.sin(u * 5), 0, -4.2]), r: 2.2 - 0.9 * u, k: 0.85 - u * 0.6, seed: 41, glow: true });
    if (u > 0.3) S.wisps.push({ p: add(at, [0.8 * Math.sin(u * 7), 0, -7.6]), r: 1.3 - 0.5 * u, k: 0.6 - u * 0.4, seed: 42, glow: true });
  }
  // когти в землю: пыль и комья у кистей
  if ((p.clods ?? 0) > 0.02) {
    for (let i = 0; i < 2; i++) {
      const hnd = p.hand[i];
      if (hnd[2] > 9) continue;
      const c: V3 = [hnd[0], hnd[1] + 1, 0];
      S.puffs.push({ c, k: p.clods!, seed: 10 + i });
      const fr = 1 - p.clods!;
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI + 0.3 + i * 0.5;
        S.motes.push({ p: [c[0] + Math.cos(ang) * (2 + 6 * fr) * (i ? -1 : 1), c[1] + Math.sin(ang) * 2, 1.5 + 8 * fr * (1 - fr) * 2.2], col: DUST[1], dark: DUST[0], size: 2 });
      }
    }
  }
  // щепки и сучья с кроны и рук падают на землю
  if ((p.chips ?? 0) > 0.02) {
    for (let j = 0; j < 6; j++) {
      const st = hash01(j, 3, 9) * 0.4;
      const fr = clamp((p.chips! - st) / 0.6, 0, 1);
      if (fr <= 0) continue;
      const tip = a.tips[j % a.tips.length];
      const z = lerp(tip[2] - 4, 0.6, easeIn(fr));
      S.motes.push({ p: [clamp(tip[0] * 0.8, -15, 15) + 2 * Math.sin(fr * 6 + j), tip[1] + 2 * fr, z], col: TWIG[3], dark: TWIG[1], size: 2 });
    }
  }
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) S.puffs.push({ c: [p.foot[i][0], p.foot[i][1] + 1, 0], k: p.dust[i], seed: i });
  if (p.trail && p.trail.length > 1) S.smears.push({ pts: p.trail, arm: p.trailArm ?? 0 });
  if (p.trail2 && p.trail2.length > 1) S.smears.push({ pts: p.trail2, arm: 1 });
  if ((p.puff ?? 0) > 0.02) {
    const hnd = p.hand[p.trailArm ?? 0];
    S.puffs.push({ c: [hnd[0], hnd[1] + 2, 0], k: p.puff!, seed: 30 });
  }
  if (p.flash > 0.02) {
    const hnd = p.hand[p.trailArm ?? 0];
    S.flash = { at: [hnd[0], hnd[1] + 3, Math.max(1.5, hnd[2] - 3)], k: p.flash };
  }
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
    for (let it = 0; it < 160; it++) {
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
    const s = clamp(dot(w, LIGHT), 0, 36);
    const d = vlen(sub(w, mul(LIGHT, s)));
    if (d < q.br + gk[q.g] + 0.3) cand[nc++] = i;
  }
  if (!nc) return false;
  let s = 0;
  for (let it = 0; it < 60; it++) {
    const d = sdScene(prims, gk, cand, nc, o[0] + LIGHT[0] * s, o[1] + LIGHT[1] * s, o[2] + LIGHT[2] * s);
    if (d < 0.04) return true;
    s += Math.max(d * 0.9, 0.08);
    if (s > 36) break;
  }
  return false;
}

function texAt(q: Prim, p: V3): { u: number; ang: number; l: V3 } {
  const pa = sub(p, q.a);
  if (q.k === 1) {
    const l: V3 = [dot(pa, q.ax[0]), dot(pa, q.ax[1]), dot(pa, q.ax[2])];
    return { u: l[2] / q.r[2], ang: Math.atan2(l[1] / q.r[1], l[0] / q.r[0]), l };
  }
  if (q.sph) return { u: 0, ang: 0, l: pa };
  const w = mul(q.ba, 1 / q.len);
  const ref = q.ref, bin = cross(w, ref);
  const l: V3 = [dot(pa, ref), dot(pa, bin), dot(pa, w)];
  return { u: l[2] / q.len, ang: Math.atan2(l[1], l[0]), l };
}

interface Look { mat: Uint8Array; idx: Int8Array; part: Int32Array; lum: Float32Array }

function shade(prims: Prim[], gk: number[], gb: GBuf): Look {
  const L: Look = { mat: new Uint8Array(N * N), idx: new Int8Array(N * N).fill(-1), part: new Int32Array(N * N).fill(-1), lum: new Float32Array(N * N) };
  const tone = new Float32Array(N * N);
  const gcoord = new Float32Array(N * N);
  const gok = new Uint8Array(N * N);
  const ulen = new Float32Array(N * N);
  const deep = new Uint8Array(N * N);
  const cand = new Int32Array(prims.length);
  for (let i = 0; i < N * N; i++) {
    const pi = gb.prim[i];
    if (pi < 0) continue;
    const q = prims[pi];
    const n: V3 = [gb.n[i * 3], gb.n[i * 3 + 1], gb.n[i * 3 + 2]];
    const p: V3 = [gb.p[i * 3], gb.p[i * 3 + 1], gb.p[i * 3 + 2]];
    let mat = q.mat;
    L.part[i] = q.part;
    if (MATS[mat].emis) {
      // огонь: тон по повороту к зрителю, без света и тени
      const f = clamp(dot(n, EYEDIR), 0, 1);
      tone[i] = 1 + 0.6 * f;
      L.mat[i] = mat;
      L.lum[i] = 1;
      continue;
    }
    const tx = texAt(q, p);
    if (q.band && tx.u >= q.band[0] && tx.u <= q.band[1]) mat = q.bandMat ?? M_FACE;
    // мох на верхних гранях
    if ((mat === M_BARK || mat === M_TWIG) && q.moss > 0 && n[2] > 0.3) {
      const m = hash01(Math.floor(tx.l[0] * 0.5 + 40), Math.floor(tx.l[1] * 0.5 + 40), 300 + q.seed) * 0.5 + 0.5 * Math.sin(tx.l[0] * 0.9 + tx.l[1] * 0.7 + q.seed);
      if (m * q.moss > 0.38 - n[2] * 0.3) mat = M_MOSS;
    }
    const md = MATS[mat];
    const lum = dot(n, LIGHT);
    L.lum[i] = lum;
    let tn = md.base + md.gain * lum + (mat === q.mat ? q.tone : 0);
    if (shadowAt(prims, gk, cand, p, n)) tn -= 1.0;
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
    deep[i] = ao > 1.3 ? 1 : 0;
    tn = Math.min(tn, md.hi + 0.49);
    tn = Math.max(tn, (deep[i] ? md.lo - 1 : md.lo) - 0.4);
    tone[i] = tn;
    L.mat[i] = mat;
    if (q.tex === 1 && (mat === M_BARK || mat === M_FACE || mat === M_TWIG)) {
      const facing = n[1] * CS + n[2] * SN;
      const wob = 0.14 * Math.sin(tx.u * q.len * 0.25 + q.seed * 1.7);
      gcoord[i] = (tx.ang * q.ng) / TAU + wob;
      gok[i] = facing > 0.4 && Math.abs(n[2]) < 0.72 ? 1 : 0;
      ulen[i] = tx.u * q.len;
    }
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
    if (gok[i] && !edge) {
      const s = Math.sin(Math.PI * gcoord[i]) >= 0;
      let crossed = false;
      for (const j of [i - 1, i - N]) {
        if ((j === i - 1 && x === 0) || j < 0) continue;
        if (gb.prim[j] !== gb.prim[i] || !gok[j]) continue;
        if (Math.sin(Math.PI * gcoord[j]) >= 0 !== s) crossed = true;
      }
      if (crossed && tone[i] > 1.6 && tone[i] < 3.3) {
        const k = Math.round(gcoord[i]);
        const seg = Math.floor(ulen[i] / 16 + hash01(k, 5, 17) * 3);
        if (hash01(k, seg, 31 + prims[gb.prim[i]].seed) > 0.3) tn -= 1.0;
      }
    }
    if (!edge) {
      let seam = 99;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + dy) * N + x + dx;
        const other = L.part[j] !== L.part[i];
        const dz = gb.t[i] - gb.t[j];
        if (other && (dz > 0.6 || (Math.abs(dz) <= 0.6 && L.part[i] < L.part[j]))) seam = Math.min(seam, 1.3);
        else if (!other && dz > 4.5) seam = Math.min(seam, 1.3);
      }
      tn = Math.min(tn, seam);
      if (deep[i]) tn = Math.min(tn, 0.3);
    }
    if (!md.emis) {
      const q = prims[gb.prim[i]];
      let rimL = false;
      for (const [xx, yy] of [[x - 1, y], [x, y - 1]]) {
        if (bgAt(xx, yy)) { rimL = true; continue; }
        const j = yy * N + xx;
        if (L.part[j] !== L.part[i] && gb.t[j] > gb.t[i] + 1.2) rimL = true;
      }
      if (rimL && bigPrim(q) && L.lum[i] > 0.2 && tn > 1.2) tn = Math.max(tn, Math.min(tn + 1, 3.45));
      if (edge) tn = Math.max(tn, md.lo - 0.4);
    }
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
      if (gb.prim[i] < 0 || MATS[L.mat[i]].emis) continue;
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

function rampFor(mat: number, wither: number): Ramp {
  const base = MATS[mat].ramp;
  if (wither <= 0) return base;
  const target = mat === M_CORE ? GLOW_DEAD : mat === M_MOSS ? MOSS_DEAD : DEAD;
  return base.map((c, k) => mix(c, target[Math.min(k, target.length - 1)], wither));
}
/** Огонь по уровню свечения: каждая ступень ниже 1 — на тон темнее, выше 1,2 — на тон светлее. */
const glowStep = (lv: number, g: number) => lv - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.2 ? 1 : 0);

// ---------------- штампы: глазница, глаз, пасть, дупла, прожилки ядра ----------------
/**
 * Рисунки в целых пикселях от точки привязки (dx вправо, dy вниз). Ключи: d — глазница (тёмная), 1–4 — глаз (ярче — выше),
 * m — пасть, t/T — зубы-щепки, g — огонь в глотке; h — дупло, o/O — огонь в дупле; v/w — прожилки ядра (ярко/тускло).
 */
type StampPx = [number, number, string];
const rows = (rs: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  rs.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") out.push([x0 + i, y0 + j, ch]); }));
  return out;
};
/** Вниз: глаз 4×4 в глазнице, ниже — пасть-дупло; три пасти: дупло, разинута, во всю ширь. */
const ST_FACE_DOWN: StampPx[][] = [
  rows([
    "d......d",
    ".d....d.",
    "..dddd..",
    ".d2442d.",
    ".d4554d.",
    ".d4554d.",
    ".d2442d.",
    "..dddd..",
    "........",
    "..mmmm..",
    ".mtmmtm.",
    ".mmggmm.",
    "..mmmm..",
  ], -4, -5),
  rows([
    "d......d",
    ".d....d.",
    "..dddd..",
    ".d2442d.",
    ".d4554d.",
    ".d4554d.",
    ".d2442d.",
    "..dddd..",
    "........",
    "..mmmm..",
    ".mtmmtm.",
    ".mmmmmm.",
    ".mmggmm.",
    ".mmggmm.",
    "..mtmt..",
  ], -4, -5),
  rows([
    "d......d",
    ".d....d.",
    "..dddd..",
    ".d2442d.",
    ".d4554d.",
    ".d4554d.",
    ".d2442d.",
    "..dddd..",
    ".mmmmmm.",
    "mtmmmmtm",
    "mmmggmmm",
    "mmggggmm",
    "mmmggmmm",
    "mtmmmmtm",
    ".mmmmmm.",
  ], -4, -5),
];
/** Вбок (три четверти, лицом вправо): глаз 3×4 у края лба, пасть — у переднего края лица. */
const ST_FACE_SIDE: StampPx[][] = [
  rows([
    "d.....",
    ".d..d.",
    ".ddd..",
    "d244d.",
    "d455d.",
    "d455d.",
    "d244d.",
    ".ddd..",
    "......",
    "......",
    "..mtm.",
    "..mgm.",
    "...m..",
  ], -3, -5),
  rows([
    "d.....",
    ".d..d.",
    ".ddd..",
    "d244d.",
    "d455d.",
    "d455d.",
    "d244d.",
    ".ddd..",
    "......",
    "..mmm.",
    "..tmt.",
    ".mggm.",
    ".mggm.",
    "..mtm.",
  ], -3, -5),
  rows([
    "d.....",
    ".d..d.",
    ".ddd..",
    "d244d.",
    "d455d.",
    "d455d.",
    "d244d.",
    ".ddd..",
    "..mmm.",
    ".mtmt.",
    ".mggm.",
    "mgggm.",
    ".mggm.",
    ".mtmt.",
    "..mm..",
  ], -3, -5),
];
const ST_HOLE: StampPx[][] = [
  rows(["hh", "ho"], 0, 0),
  rows(["hh", "oh"], -1, 0),
];
/** Огонь ядра: белая середина, светлая бирюза крестом, бирюза кругом (рисуется только поверх сферы ядра — кольцо её закрывает). */
const ST_CORE_DOWN = rows([".233.", "23432", "34543", "23432", ".233."], -2, -2);
const ST_CORE_SIDE = rows([".23.", "2343", "3453", "2343", ".23."], -2, -2);

function stampOf(st: Stamp, view: FView): StampPx[] {
  const m = clamp(Math.round(st.mouth ?? 0), 0, 2);
  if (st.kind === "hole") return ST_HOLE[st.v ?? 0];
  if (st.kind === "core") return view === "down" ? ST_CORE_DOWN : view === "side" ? ST_CORE_SIDE : [];
  return view === "side" ? ST_FACE_SIDE[m] : view === "down" ? ST_FACE_DOWN[m] : [];
}

function drawStamps(body: PC, sc: Scene, view: FView, gb: GBuf, L: Look, wither: number) {
  const glowM = new Float32Array(N * N);
  const emis = new Uint8Array(N * N);
  // ядро — источник отсвета
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && MATS[L.mat[i]].emis) {
    emis[i] = 1;
    glowM[i] = Math.min(1, sc.core) * clamp((L.idx[i] - 1) / 3, 0, 1);
  }
  const DARK = mix(BARK[0], FACE[0], 0.4);
  const MOUTH = hex("#070b0b");
  for (const st of sc.stamps) {
    const a = toView(view, st.at), nv = toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < 0.12) continue;
    const [sx, sy] = scr(a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    if (gb.prim[i0] < 0 || gb.t[i0] < depthOf(a) - 2.4) continue;
    const g = clamp(st.glow, 0, 1.6);
    for (const [dx, dy, key] of stampOf(st, view)) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (gb.prim[i] < 0) continue;
      if (st.kind === "core" && L.mat[i] !== M_CORE) continue;
      if (key === "d" || key === "m" || key === "h") {
        if (!emis[i]) body.set(x, y, mix(key === "d" ? DARK : key === "h" ? BARK[0] : MOUTH, DEAD[0], wither * 0.6));
        emis[i] = 2;
        continue;
      }
      if (key === "t" || key === "T") {
        body.set(x, y, mix(FACE[key === "T" ? 4 : 3], DEAD[3], wither));
        emis[i] = 2;
        continue;
      }
      // огонь: глаз, глотка, дупла, прожилки
      const lv = key === "5" ? 4 : key === "g" ? 1 : key === "o" ? 2 : key === "O" ? 3 : key === "v" ? 2 : key === "w" ? 1 : +key - 1;
      const k = glowStep(lv, g);
      if (k < 0) {
        // погасло: глаз — тёмная глазница, прожилки и дупла — кора
        if (key >= "1" && key <= "5") body.set(x, y, mix(GLOW_DEAD[clamp(lv, 0, 4)], DARK, 0.4));
        else if (key === "g" || key === "o" || key === "O") body.set(x, y, MOUTH);
        continue;
      }
      body.set(x, y, mix(GLOW[clamp(k, 0, 4)], GLOW_DEAD[clamp(k, 0, 4)], wither));
      glowM[i] = Math.max(glowM[i], Math.min(1, g) * clamp((k + 1) / 4, 0, 1) * (key === "w" ? 0.5 : 1));
      emis[i] = 1;
    }
  }
  // отсвет на коре: размытая карта, цвет — двумя ступенями
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      v += glowM[yy * N + xx] * (dx === 0 || dy === 0 ? 1 : 0.6);
    }
    out[y * N + x] = v / 3.2;
  }
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0 || emis[i]) continue;
    const g = out[i] * (1 - wither);
    const lv = g > 0.42 ? 2 : g > 0.2 ? 1 : 0;
    if (!lv) continue;
    const c = body.get(i % N, Math.floor(i / N))!;
    body.set(i % N, Math.floor(i / N), mix(c, [TINT[0], TINT[1], TINT[2], 255], [0, 0.22, 0.4][lv]));
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

/** Кадр Мглогляда в виде view. */
export function renderFogTreant(view: FView, pose: Pose): PC {
  const sc = fogTreant(pose, view);
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) prepare(q, view);
  const gb = raster(prims, sc.gk);
  const L = shade(prims, sc.gk, gb);
  // ядро: ступени по уровню свечения
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && MATS[L.mat[i]].emis) L.idx[i] = clamp(glowStep(L.idx[i], sc.core), 0, 4);
  const body = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    body.set(i % N, Math.floor(i / N), rampFor(L.mat[i], pose.wither)[L.idx[i]]);
  }
  drawStamps(body, sc, view, gb, L, pose.wither);
  body.outline(OUT);
  sealPinholes(body);

  const out = new PC(N, N);
  out.blit(body, 0, 0);
  for (const sm of sc.smears) drawRake(out, sm, view, gb, prims, [sc.armG[sm.arm], sc.clawG[sm.arm]], view === "up");
  for (const f of sc.puffs) drawPuff(out, f, view);
  drawWisps(out, sc.wisps, view, gb);
  for (const m of sc.motes) drawMote(out, m, view, gb);
  if (sc.flash) drawFlash(out, sc.flash, view);
  if (sc.flare) {
    const [ex, ey] = scr(toView(view, sc.eye));
    drawFlare(out, Math.floor(ex), Math.floor(ey), sc.flare.k, view, view === "up");
  }
  sealPinholes(out, true);
  return out;
}

/** Пыль и комья земли (как у пилота, тоны холоднее — лесная подстилка). */
const DUST = R("#3a3a30", "#5e5c4a", "#858066", "#aca58a");
function drawPuff(o: PC, f: Puff, view: FView) {
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
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const tone = dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2;
      o.set(x, y, DUST[tone]);
    }
  }
}

/**
 * Облако из клубов (туман, мгла, душа): клубы одной палитры сливаются в одну массу — каждый пиксель берёт клуб, в котором
 * он «глубже»; тон — от свежести клуба и стороны к свету (сверху слева), низ клуба темнее. Непрозрачно; за телом не видно.
 */
function drawWisps(o: PC, ws: Wisp[], view: FView, gb: GBuf) {
  for (const kind of ["mist", "poison", "glow"] as const) {
    const list = ws.filter((w) => (kind === "glow" ? w.glow : kind === "poison" ? w.poison && !w.glow : !w.glow && !w.poison));
    if (!list.length) continue;
    const ramp = kind === "glow" ? GLOW : kind === "poison" ? MIASMA : MIST;
    const sc = list.map((w) => {
      const v = toView(view, w.p);
      const [x, y] = scr(v);
      return { x, y, r: w.r, k: w.k, d: depthOf(v), fl: w.flat ?? 1 };
    });
    let x0 = N, y0 = N, x1 = 0, y1 = 0;
    for (const q of sc) {
      x0 = Math.min(x0, Math.floor(q.x - q.r * q.fl - 1)); x1 = Math.max(x1, Math.ceil(q.x + q.r * q.fl + 1));
      y0 = Math.min(y0, Math.floor(q.y - q.r - 1)); y1 = Math.max(y1, Math.ceil(q.y + q.r + 1));
    }
    for (let y = Math.max(0, y0); y <= Math.min(N - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(N - 1, x1); x++) {
      let best = -1, bf = 0;
      for (let k = 0; k < sc.length; k++) {
        const q = sc[k];
        if (q.r < 0.6) continue;
        const dx = (x + 0.5 - q.x) / (q.r * q.fl + 0.35), dy = (y + 0.5 - q.y) / q.r;
        const fld = 1 - (dx * dx + dy * dy);
        if (fld > bf) { bf = fld; best = k; }
      }
      if (best < 0) continue;
      const q = sc[best];
      const i = y * N + x;
      if (gb.prim[i] >= 0 && gb.t[i] < q.d - 0.5) continue;
      const dx = (x + 0.5 - q.x) / (q.r * q.fl), dy = (y + 0.5 - q.y) / q.r;
      const lit = -dx * 0.6 - dy * 0.8;
      const base = q.k > 0.66 ? 3 : q.k > 0.33 ? 2 : 1;
      const tone = clamp(base + (lit > 0.4 ? 1 : lit < -0.4 ? -1 : 0) + (kind === "glow" && bf > 0.7 ? 1 : 0), 0, 4);
      o.set(x, y, ramp[tone]);
    }
  }
}

/**
 * Вспышка глаза («Взгляд»): лучи крестом шириной в глаз и короткие диагонали, 3 тона бирюзы, середина — белая.
 * behind — глаз за головой (вид вверх): рисуется только вокруг силуэта, свет выбивается из-за головы.
 */
function drawFlare(o: PC, ax: number, ay: number, k: number, view: FView, behind: boolean) {
  const L = Math.round(2 + 7 * k);
  if (behind) {
    // глаз по ту сторону головы: свет обводит силуэт головы и кроны — контур рядом с глазом становится бирюзовым
    const R0 = 7 + 13 * k;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = o.get(x, y);
      if (!c || c[3] < 255 || c[0] !== OUT[0] || c[1] !== OUT[1] || c[2] !== OUT[2]) continue;
      const d = Math.hypot(x + 0.5 - ax, (y + 0.5 - ay) * 1.15);
      if (d < R0) o.set(x, y, GLOW[d < R0 * 0.55 ? 3 : 2]);
    }
  }
  const put = (x: number, y: number, tone: number) => {
    if (behind && o.alpha(x, y) > 0) return;
    o.set(x, y, GLOW[clamp(tone, 0, 4)]);
  };
  // глаз 4×4 (вбок 3×4): от него — лучи
  const x0 = view === "side" ? ax - 2 : ax - 2, x1 = view === "side" ? ax : ax + 1, y0 = ay - 2, y1 = ay + 1;
  const tone = (r: number) => (r <= 1 ? 4 : r <= L - 2 ? 3 : 2);
  for (let r = 1; r <= L + (view === "side" ? 2 : 0); r++) {
    const wide = r <= L - 2;
    for (const y of wide ? [ay - 1, ay] : [ay - 1]) put(x1 + r, y, tone(r - (view === "side" ? 2 : 0)));
    if (r <= L) for (const y of wide ? [ay - 1, ay] : [ay]) put(x0 - r, y, tone(r));
  }
  for (let r = 1; r <= L - 1; r++) {
    const wide = r <= L - 3;
    const cx = view === "side" ? [ax - 1] : wide ? [ax - 1, ax] : [ax];
    for (const x of cx) put(x, y0 - r, tone(r));
    for (const x of view === "side" ? [ax - 1] : wide ? [ax - 1, ax] : [ax - 1]) put(x, y1 + r, tone(r));
  }
  if (k > 0.8 && !behind) {
    // кольцо удара вокруг глаза
    const RR = 5.5;
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * TAU;
      const x = Math.round(ax - 0.5 + Math.cos(t) * RR), y = Math.round(ay - 0.5 + Math.sin(t) * RR);
      if (o.alpha(x, y) && o.get(x, y)![1] > 200) continue;
      put(x, y, 1);
    }
  }
  if (k > 0.45) {
    const D = Math.round(1 + 2 * k);
    for (let r = 1; r <= D; r++) {
      const t = r === 1 ? 3 : 2;
      put(x1 + r, y0 - r, t); put(x0 - r, y0 - r, t); put(x1 + r, y1 + r, t); put(x0 - r, y1 + r, t);
    }
  }
  if (!behind) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, (x === x0 || x === x1) && (y === y0 || y === y1) ? 3 : 4);
}

function drawMote(o: PC, m: Mote, view: FView, gb: GBuf) {
  const p = toView(view, m.p);
  const [sx, sy] = scr(p);
  const x = Math.floor(sx), y = Math.floor(sy);
  if (x < 0 || y < 0 || x >= N - 1 || y >= N - 1) return;
  const i = y * N + x;
  if (!m.front && gb.prim[i] >= 0 && gb.t[i] < depthOf(p) - 0.5) return;
  if (m.shape === "pod") {
    // шишка 3×4 в контуре: светлая чешуя сверху слева, тёмный низ, пятно гнили
    const P = [".ooo.", "o32oo", "o214o", "o211o", ".o1o.", "..o.."];
    P.forEach((row, j) => [...row].forEach((ch, k) => {
      if (ch === ".") return;
      o.set(x - 2 + k, y - 2 + j, ch === "o" ? OUT : CONE[+ch]);
    }));
    return;
  }
  if (m.to) {
    // искра: хвост — на пиксель дальше от цели
    const [tx, ty] = scr(toView(view, m.to));
    const dx = sx - tx, dy = sy - ty, d = Math.hypot(dx, dy) || 1;
    if (m.dark) o.set(Math.round(x + dx / d), Math.round(y + dy / d), m.dark);
    o.set(x, y, m.col);
    return;
  }
  o.set(x, y, m.col);
  if ((m.size ?? 1) > 1) o.set(x + 1, y, m.col);
  if (m.dark) o.set(x + ((m.size ?? 1) > 1 ? 1 : 0), y + 1, m.dark);
}

/**
 * След когтей: три тонкие борозды по пути концов когтей, позади руки; у кисти — ярче, к хвосту гаснут, крайние короче средней.
 */
function drawRake(o: PC, sm: { pts: V3[]; arm: number }, view: FView, gb: GBuf, prims: Prim[], armG: number[], behind = false) {
  const pts = sm.pts.map((v) => scr(toView(view, v)));
  const arm = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && armG.includes(prims[gb.prim[i]].g)) arm[i] = 1;
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
    const nx = -dy / dl, ny = dx / dl;
    for (let st = 0; st <= steps; st++) {
      const u = (k + st / steps) / total;
      const x = lerp(x0, x1, st / steps), y = lerp(y0, y1, st / steps);
      for (const [off, from] of [[-2.2, 0.3], [0, 0], [2.2, 0.18]] as [number, number][]) {
        if (u < from) continue;
        const xx = Math.round(x + nx * off), yy = Math.round(y + ny * off);
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const tone = u > 0.72 ? 2 : u > 0.38 ? 1 : 0;
        const id = yy * N + xx;
        put.set(id, Math.max(put.get(id) ?? -1, tone));
      }
    }
  }
  for (const [id, tone] of put) {
    const x = id % N, y = (id / N) | 0;
    if (near(x, y) || (behind && o.alpha(x, y) > 0)) continue;
    o.set(x, y, SMEAR[tone]);
  }
}

/** Вспышка удара: крест с короткими лучами по диагоналям, 3 тона бирюзы. */
function drawFlash(o: PC, f: { at: V3; k: number }, view: FView) {
  const [sx, sy] = scr(toView(view, f.at));
  const x = Math.floor(sx), y = Math.floor(Math.min(sy, 61));
  const behind = view === "up";
  const put = (xx: number, yy: number, c: RGBA) => { if (!(behind && o.alpha(xx, yy) > 0)) o.set(xx, yy, c); };
  const L = Math.round(2 + 3 * f.k);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 4 : r <= L - 1 ? 3 : 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) put(x + dx * r, y + dy * Math.min(r, 2), GLOW[tone]);
  }
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (f.k > 0.5) put(x + dx * 2, y + dy, GLOW[2]);
  put(x, y, GLOW[4]);
}

// ---------------- анимации ----------------
type Num = number | V3 | [V3, V3] | [number, number] | V3[] | undefined;
function lerpAny(a: Num, b: Num, t: number): Num {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return (a as unknown[]).map((v, k) => lerpAny(v as Num, (b as unknown[])[k] as Num, t)) as Num;
  return t < 0.5 ? a : b;
}
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    if (k === "trail" || k === "trailArm" || k === "trail2") continue;
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
const ipx = (v: number) => Math.round(v);

/** Покой: дыхание волной снизу вверх на 1 px (грудь, кадром позже голова, крона отстаёт), глаз и ядро мерцают ступенями. */
function idlePoses(n = 12): Pose[] {
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const crown = [0, 0, 0, 1, 0, 0, 0, 0, 0, -1, -1, 0];
  const hands = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n, ph = t * TAU;
    return {
      ...REST, t, seed: 100 + i,
      chest: chest[i], headZ: head[i] - chest[i], crown: [0, crown[i]],
      hand: REST_HAND.map((v) => add(v, [0, 0, hands[i] * PX])) as [V3, V3],
      eye: 1 + 0.2 * Math.sin(ph), core: 1 + 0.25 * Math.sin(ph + 1.2),
    } as Pose;
  });
}

/**
 * Ходьба: тяжёлый шаг вразвалку. Корпус, голова и крона — жёсткий слой: проседает после касания и перевешивается на опорную
 * ногу ровно на целые пиксели; двигаются ноги и руки (руки качаются навстречу ногам, когти волочатся); пыль — при касании.
 */
function walkPoses(n = 12): Pose[] {
  const A = 5.0, LIFT = 4.2, DUTY = 0.56;
  const footAt = (u: number) => {
    u = ((u % 1) + 1) % 1;
    if (u < DUTY) return { y: A - (2 * A * u) / DUTY, z: 0, toe: 0, strike: u < 0.2 ? 1 - u / 0.2 : 0 };
    const s = (u - DUTY) / (1 - DUTY);
    return { y: -A + 2 * A * easeInOut(s), z: LIFT * Math.sin(Math.PI * s), toe: 0.3 * Math.sin(Math.PI * s), strike: 0 };
  };
  const bob = [-1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0];
  const sway = [0, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const fr = footAt(t), fl = footAt(t + 0.5);
    const armAt = (f: { y: number }, s: number): V3 => {
      const fw = -f.y / A;
      return [s * (17.0 - 0.8 * Math.max(0, fw)) + sway[i], 7.8 + 5.2 * fw, 15.4 + 1.8 * Math.max(0, fw) + 0.6 * Math.max(0, -fw)];
    };
    return {
      ...REST, t, seed: 150 + i,
      root: [ipx(sway[i]), 0, 0], bob: bob[i] * PX,
      hand: [armAt(fr, 1), armAt(fl, -1)],
      foot: [[8.6, 0.8 + fr.y, 3.4 + fr.z], [-8.6, 0.8 + fl.y, 3.4 + fl.z]], toe: [fr.toe, fl.toe],
      dust: [fr.strike, fl.strike],
    } as Pose;
  });
}

/**
 * Удар когтями правой руки: замах вверх-назад с растопыренными когтями, дуга вперёд, загребающий удар вниз перед собой (кадр 6),
 * отдача и возврат. След — три борозды по пути концов когтей (позади руки), удар — кадр бирюзовой вспышки.
 */
function attackPoses(view: FView): Pose[] {
  const up: Partial<Pose> = {
    yaw: -0.3, pitch: 0.1, roll: -0.04, bob: 1 * PX, hp: -0.3,
    hand: [[15.0, -2.6, 40.0], [-17.6, 8.0, 16.6]], pole: [[1, -0.2, 0.6], [-1, -0.4, 0.1]], eye: 1.2, spread: 1, curl: 0,
  };
  const peak: Partial<Pose> = { ...up, yaw: -0.36, hand: [[15.4, -3.6, 42.0], [-17.4, 8.4, 16.2]] };
  const hitHand: V3 = view === "side" ? [5.0, 15.0, 9.0] : view === "up" ? [8.0, 12.0, 9.0] : [4.0, 13.0, 9.0];
  const mid: Partial<Pose> = {
    yaw: 0.06, pitch: 0.3, bob: -1 * PX, hp: -0.16,
    hand: [[20.0, 10.0, 30.0], [-17.4, 6.0, 16.0]], pole: [[1, -0.3, 0.4], [-1, -0.4, 0.1]], eye: 1.25, spread: 0.9, curl: 0.1,
  };
  const hit: Partial<Pose> = {
    yaw: 0.36, pitch: 0.46, roll: 0.04, bob: -3 * PX, hp: -0.06,
    hand: [hitHand, [-17.8, 2.0, 17.2]], pole: [[1, -0.6, 0.3], [-1, -0.4, 0.1]], eye: 1.3, spread: 0.4, curl: 0.7, flash: 1,
  };
  const settle: Partial<Pose> = { ...hit, pitch: 0.4, bob: -2 * PX, hand: [add(hitHand, [0.4, -0.6, 1.0]), [-17.6, 2.6, 16.8]], flash: 0 };
  const keys: Key[] = [
    { f: 0, p: {} },
    { f: 3, p: up, ease: easeInOut },
    { f: 4, p: peak, ease: linear },
    { f: 5, p: mid, ease: easeIn },
    { f: 6, p: hit, ease: easeOut },
    { f: 7, p: settle, ease: easeOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 10, 400);
  // кисть идёт дугой через вынос руки в сторону; след — по концам когтей (на 6 px дальше запястья)
  const P0 = peak.hand![0], M = mid.hand![0], P2 = hitHand;
  const C = sub(mul(M, 2), mul(add(P0, P2), 0.5));
  const arc = (u: number): V3 => add(add(mul(P0, (1 - u) * (1 - u)), mul(C, 2 * u * (1 - u))), mul(P2, u * u));
  const claw = (w: V3) => add(w, mul(norm(sub(w, [9.8, 4.0, 30.0])), 6.0));
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => claw(arc(lerp(u0, u1, k / (n - 1)))));
  poses[5].hand = [arc(0.5), poses[5].hand[1]];
  poses[5].trail = path(0, 0.5);
  poses[6].trail = path(0.2, 1);
  poses[7].trail = path(0.7, 1, 4);
  for (const k of [5, 6, 7]) poses[k].trailArm = 0;
  poses[6].flash = 1;
  poses[6].puff = 1;
  poses[7].puff = 0.5;
  return poses;
}

/** «Взгляд»: древень выпрямляется, запрокидывает голову, руки разведены — глаз разгорается, к нему стягиваются искры. */
const GAZE: Partial<Pose> = {
  pitch: 0.1, bob: 1 * PX, hp: -0.32, hand: [[19.6, 3.0, 19.0], [-20.0, 2.2, 19.6]], pole: [[1, -0.6, 0], [-1, -0.6, 0]],
  eye: 1.45, core: 1.2, mouth: 1, spread: 0.8, curl: 0, sparks: 1, flare: 0,
};
function gazeInPoses(): Pose[] {
  const keys: Key[] = [{ f: 0, p: { sparks: 0, flare: 0 } }, { f: 3, p: GAZE, ease: easeInOut }];
  return keyed(keys, 4, 500);
}
/** Удержание «Взгляда»: глаз пульсирует и вспыхивает, когти дрожат на пиксель, искры летят к глазу. */
function gazeHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: GAZE }, { f: 1, p: GAZE }], 0);
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 520 + i,
    armLift: [tremble[i], -tremble[i]] as [number, number],
    eye: [1.45, 1.6, 1.5, 1.6][i], flare: [0.15, 0.3, 0.2, 0.3][i], sparks: 1,
  }));
}
/** Выстрел: голова рывком вперёд (кадр 1), кадр 2 — луч: полная вспышка глаза, отдача назад; глаз остывает за 5 кадров. */
function gazeFirePoses(): Pose[] {
  const lunge: Partial<Pose> = { ...GAZE, pitch: 0.3, hp: -0.1, bob: 0, eye: 1.6, flare: 0.5, sparks: 0 };
  const fire: Partial<Pose> = {
    ...GAZE, pitch: 0.2, hp: -0.22, bob: 1 * PX, eye: 1.6, flare: 1, sparks: 0, mouth: 2,
    hand: [[20.0, 0.4, 20.0], [-20.4, -0.4, 20.6]],
  };
  const keys: Key[] = [
    { f: 0, p: { ...GAZE, flare: 0.3 } },
    { f: 1, p: lunge, ease: easeIn },
    { f: 2, p: fire, ease: easeOut },
    { f: 3, p: { ...fire, flare: 0.55, eye: 1.5 }, ease: easeOut },
    { f: 4, p: { ...fire, flare: 0.2, eye: 1.3, mouth: 1 }, ease: easeOut },
    { f: 7, p: { flare: 0, sparks: 0 }, ease: easeInOut },
  ];
  return keyed(keys, 8, 560);
}

/** «Миазмы»: древень сутулится к земле, пасть разинута, когти над землёй — из пасти течёт мгла. */
const BREATHE: Partial<Pose> = {
  pitch: 0.36, bob: -1 * PX, hp: -0.3, hand: [[15.0, 11.0, 12.0], [-15.4, 10.4, 12.6]], pole: [[1, 0.2, 0.5], [-1, 0.2, 0.5]],
  eye: 1.15, core: 1.15, mouth: 1, spread: 0.9, curl: 0.15,
};
function miasmaInPoses(): Pose[] {
  const keys: Key[] = [{ f: 0, p: {} }, { f: 3, p: BREATHE, ease: easeInOut }];
  return keyed(keys, 4, 600).map((p, i) => ({ ...p, mist: i >= 2 ? (i - 2) * 0.25 + 0.5 : undefined }));
}
function miasmaHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: BREATHE }, { f: 1, p: BREATHE }], 0);
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 620 + i, mist: i / 4,
    armLift: [tremble[i], -tremble[i]] as [number, number], eye: [1.15, 1.3, 1.2, 1.3][i],
  }));
}
/** Удар «Миазмов»: вдох назад (кадр 1), кадр 2 — когти в землю и выброс мглы кольцом, мгла тает, древень распрямляется. */
function miasmaBurstPoses(): Pose[] {
  const inhale: Partial<Pose> = { ...BREATHE, pitch: 0.2, hp: -0.36, bob: 1 * PX, hand: [[17.0, 9.0, 22.0], [-17.4, 8.4, 22.6]], mouth: 1, spread: 1 };
  const slam: Partial<Pose> = {
    ...BREATHE, pitch: 0.46, hp: -0.26, bob: -2 * PX, hand: [[12.4, 11.0, 3.6], [-12.8, 10.4, 4.0]], pole: [[1, 0.2, 0.6], [-1, 0.2, 0.6]],
    mouth: 2, eye: 1.3, core: 1.3, spread: 0.6, curl: 0.4, burst: 1,
  };
  const keys: Key[] = [
    { f: 0, p: { ...BREATHE, burst: 0 } },
    { f: 1, p: { ...inhale, burst: 0 }, ease: easeInOut },
    { f: 2, p: slam, ease: easeIn },
    { f: 3, p: { ...slam, burst: 0.7, pitch: 0.48 }, ease: easeOut },
    { f: 4, p: { ...slam, burst: 0.4, pitch: 0.44, bob: -1 * PX }, ease: easeOut },
    { f: 5, p: { ...slam, burst: 0.12, pitch: 0.4, bob: -1 * PX, hand: [[13.4, 10.6, 6.4], [-13.8, 10.0, 6.8]], mouth: 1 }, ease: easeOut },
    { f: 7, p: { burst: 0 }, ease: easeInOut },
  ];
  const poses = keyed(keys, 8, 640);
  poses[2].clods = 1;
  poses[3].clods = 0.6;
  return poses;
}

/** «Гнилые шишки»: руки вверх, когти хватают крону у макушки — древень трясёт крону, шишки летят вверх. */
const SHAKE: Partial<Pose> = {
  pitch: 0.12, bob: 0, hp: 0.12, hand: [[8.6, 3.0, 45.0], [-8.8, 2.4, 45.6]], pole: [[1, -0.3, -0.3], [-1, -0.3, -0.3]],
  eye: 1.15, core: 1.1, curl: 0.85, spread: 0,
};
function sporeInPoses(): Pose[] {
  const keys: Key[] = [{ f: 0, p: {} }, { f: 3, p: SHAKE, ease: easeInOut }];
  return keyed(keys, 4, 700);
}
function sporeHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: SHAKE }, { f: 1, p: SHAKE }], 0);
  const cx = [1, 0, -1, 0];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 720 + i, cones: i / 4,
    crown: [cx[i], 0] as [number, number], armLift: [i % 2, (i + 1) % 2] as [number, number], eye: [1.15, 1.25, 1.15, 1.25][i],
  }));
}
/** Разрыв шишек: руки вскидываются (кадр 1), кадр 2 — когти сжимаются в кулаки, глаз и ядро вспыхивают; затем покой. */
function sporeBurstPoses(): Pose[] {
  const fling: Partial<Pose> = { ...SHAKE, hand: [[18.0, 2.0, 44.0], [-18.4, 1.4, 44.6]], pole: [[1, -0.3, -0.5], [-1, -0.3, -0.5]], spread: 1, curl: 0, crown: [0, -1], eye: 1.3, flare: 0 };
  const clench: Partial<Pose> = {
    pitch: 0.34, bob: -1 * PX, hp: 0.02, hand: [[15.6, 8.6, 24.0], [-16.0, 8.0, 24.6]], pole: [[1, -0.4, 0.2], [-1, -0.4, 0.2]],
    curl: 1, spread: 0, eye: 1.55, core: 1.5, crown: [0, 1], flare: 0,
  };
  const keys: Key[] = [
    { f: 0, p: { ...SHAKE, flare: 0 } },
    { f: 1, p: fling, ease: easeOut },
    { f: 2, p: clench, ease: easeIn },
    { f: 3, p: { ...clench, crown: [0, 0], eye: 1.4, core: 1.3 }, ease: easeOut },
    { f: 7, p: { flare: 0 }, ease: easeInOut },
  ];
  return keyed(keys, 8, 740);
}

/**
 * Гибель: вскрик с запрокинутой головой (глаз вспыхивает), шаг назад, падает на колени и никнет до земли; глаз и ядро
 * гаснут ступенями, из ядра уходит душа — бирюзовый клуб, с кроны сыплются щепки, дерево сереет.
 */
function deathPoses(view: FView = "down"): Pose[] {
  const recoil: Partial<Pose> = {
    pitch: 0.06, bob: 1 * PX, hp: -0.42, hand: [[19.6, 2.0, 21.0], [-20.0, 1.4, 21.6]], eye: 1.6, core: 1.5, mouth: 2, crown: [0, 1], spread: 1,
    soul: 0, chips: 0,
  };
  const stagger: Partial<Pose> = {
    pitch: 0.28, roll: 0.08, yaw: 0.1, bob: 0, hp: -0.12, hand: [[18.6, 4.0, 15.0], [-18.0, 5.0, 14.6]], eye: 0.9, core: 0.8, mouth: 1,
    crown: [0, -1], chips: 0.1, soul: 0,
  };
  const kneel: [V3, V3] = [[5.6, -8.6, 3.2], [-5.6, -8.0, 3.2]];
  const knees: Partial<Pose> = {
    root: [0, -2.4, 0], pitch: 0.36, roll: 0.03, bob: -8 * PX, hp: 0.08, foot: kneel, toe: [-0.9, -0.9],
    hand: [[15.0, 6.0, 4.0], [-15.4, 5.4, 4.4]], pole: [[1, -0.4, 0.3], [-1, -0.4, 0.3]], eye: 0.55, core: 0.5, mouth: 1,
    crown: [0, 1], dust: [1, 1], chips: 0.4, soul: 0.15, wither: 0.15,
  };
  const bow: Partial<Pose> = {
    ...knees, root: [0, -4, 0], pitch: 0.62, bob: -9 * PX, hp: 0.34, hand: [[10.6, 8.0, 2.6], [-10.8, 7.4, 2.8]],
    eye: 0.25, core: 0.25, crown: [0, 1], dust: [0.3, 0.3], chips: 0.75, soul: 0.5, wither: 0.55, curl: 0.6,
  };
  const dead: Partial<Pose> = { ...bow, pitch: 0.7, bob: -9 * PX, hp: 0.42, eye: 0, core: 0, mouth: 0, dust: [0, 0], chips: 1, soul: 1, wither: 1, curl: 0.8 };
  // вбок крона при поклоне уходила за правый край кадра: корпус отводим назад и наклоняем меньше
  const fit = (q: Partial<Pose>, back: number): Partial<Pose> =>
    view !== "side" ? q : { ...q, root: [q.root?.[0] ?? 0, (q.root?.[1] ?? 0) - back, q.root?.[2] ?? 0], pitch: (q.pitch ?? 0) * 0.84 };
  const keys: Key[] = [
    { f: 0, p: { soul: 0, chips: 0 } },
    { f: 2, p: recoil, ease: easeOut },
    { f: 4, p: stagger, ease: easeInOut },
    { f: 6.4, p: fit(knees, 2), ease: easeIn },
    { f: 8, p: fit(bow, 4.4), ease: easeInOut },
    { f: 11, p: fit(dead, 5), ease: easeOut },
  ];
  return keyed(keys, 12, 800);
}

export type FogAnim =
  | "idle" | "walk" | "attack"
  | "gazeIn" | "gazeHold" | "gazeFire"
  | "miasmaIn" | "miasmaHold" | "miasmaBurst"
  | "sporeIn" | "sporeHold" | "sporeBurst"
  | "death";
/**
 * Анимации: первый столбец листа, кадров, кадров/с, по кругу ли, что дальше, кадр удара. Замахи умений — связки
 * «…In» → «…Hold» по кругу до конца предупреждения → удар (кадр hit — ровно в конце предупреждения), как у пилота.
 */
export const FOG_TREANT_ANIMS: Record<FogAnim, { col: number; n: number; fps: number; loop: boolean; ru: string; next?: FogAnim; hit?: number }> = {
  idle: { col: 0, n: 12, fps: 12, loop: true, ru: "покой" },
  walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
  attack: { col: 24, n: 10, fps: 15, loop: false, ru: "атака", hit: 6 },
  gazeIn: { col: 34, n: 4, fps: 12, loop: false, ru: "замах взгляда", next: "gazeHold" },
  gazeHold: { col: 38, n: 4, fps: 12, loop: true, ru: "удержание взгляда", next: "gazeFire" },
  gazeFire: { col: 42, n: 8, fps: 12, loop: false, ru: "луч взгляда", hit: 2 },
  miasmaIn: { col: 50, n: 4, fps: 12, loop: false, ru: "замах миазмов", next: "miasmaHold" },
  miasmaHold: { col: 54, n: 4, fps: 12, loop: true, ru: "удержание миазмов", next: "miasmaBurst" },
  miasmaBurst: { col: 58, n: 8, fps: 12, loop: false, ru: "выброс миазмов", hit: 2 },
  sporeIn: { col: 66, n: 4, fps: 12, loop: false, ru: "замах шишек", next: "sporeHold" },
  sporeHold: { col: 70, n: 4, fps: 12, loop: true, ru: "удержание шишек", next: "sporeBurst" },
  sporeBurst: { col: 74, n: 8, fps: 12, loop: false, ru: "разрыв шишек", hit: 2 },
  death: { col: 82, n: 12, fps: 12, loop: false, ru: "гибель" },
};
export const FOG_TREANT_COLS = 94;
/** Умения карточки → связки анимаций и эффект мира (луч — от глаза по клину, мгла — в метках героев, шишки — в метках). */
export const FOG_TREANT_SKILLS: Record<string, { windup: [FogAnim, FogAnim]; strike: FogAnim; fx: "beam" | "miasma" | "spores" }> = {
  gaze_beam: { windup: ["gazeIn", "gazeHold"], strike: "gazeFire", fx: "beam" },
  miasma: { windup: ["miasmaIn", "miasmaHold"], strike: "miasmaBurst", fx: "miasma" },
  spore_rain: { windup: ["sporeIn", "sporeHold"], strike: "sporeBurst", fx: "spores" },
};
const POSES: Record<FogAnim, (view: FView) => Pose[]> = {
  idle: () => idlePoses(), walk: () => walkPoses(), attack: attackPoses,
  gazeIn: gazeInPoses, gazeHold: gazeHoldPoses, gazeFire: gazeFirePoses,
  miasmaIn: miasmaInPoses, miasmaHold: miasmaHoldPoses, miasmaBurst: miasmaBurstPoses,
  sporeIn: sporeInPoses, sporeHold: sporeHoldPoses, sporeBurst: sporeBurstPoses,
  death: deathPoses,
};

/** Лист одной анимации: 3 строки (вниз, вверх, вбок), столбцы — кадры. */
export function buildFogTreantAnim(anim: FogAnim): PC {
  const A = FOG_TREANT_ANIMS[anim];
  const out = new PC(N * A.n, N * 3);
  VIEWS.forEach((v, row) => POSES[anim](v).forEach((p, i) => out.blit(renderFogTreant(v, p), i * N, row * N)));
  return out;
}
/** Весь лист: FOG_TREANT_COLS столбцов × 3 строки. */
export function buildFogTreantSheet(parts?: Partial<Record<FogAnim, PC>>): PC {
  const out = new PC(N * FOG_TREANT_COLS, N * 3);
  for (const a of Object.keys(FOG_TREANT_ANIMS) as FogAnim[]) out.blit(parts?.[a] ?? buildFogTreantAnim(a), FOG_TREANT_ANIMS[a].col * N, 0);
  return out;
}

/** Один кадр для отладки: вид, анимация, номер. */
export function fogTreantFrame(view: FView, anim: string, i: number): PC {
  return renderFogTreant(view, POSES[anim as FogAnim](view)[i]);
}
export function fogTreantCount(anim: string): number {
  return FOG_TREANT_ANIMS[anim as FogAnim].n;
}
export function fogTreantDevPose(view: FView, over: Partial<Pose>): PC {
  return renderFogTreant(view, { ...REST, ...over });
}

// ---------------- эффекты мира умений ----------------
/** Клуб облака на плоскости кадра эффекта: центр, полуоси, свежесть 0..1. */
interface Blob2 { x: number; y: number; rx: number; ry: number; k: number }
/**
 * Облако из клубов на плоскости: клубы сливаются в одну массу (пиксель берёт клуб, в котором он глубже), тон — от свежести
 * клуба и стороны к свету (сверху слева), низ клуба темнее. Непрозрачно, без контура.
 */
function cloud2(o: PC, bs: Blob2[], ramp: Ramp) {
  if (!bs.length) return;
  let x0 = o.w, y0 = o.h, x1 = 0, y1 = 0;
  for (const b of bs) {
    x0 = Math.min(x0, Math.floor(b.x - b.rx - 1)); x1 = Math.max(x1, Math.ceil(b.x + b.rx + 1));
    y0 = Math.min(y0, Math.floor(b.y - b.ry - 1)); y1 = Math.max(y1, Math.ceil(b.y + b.ry + 1));
  }
  for (let y = Math.max(0, y0); y <= Math.min(o.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(o.w - 1, x1); x++) {
    let best = -1, bf = 0, bx = 0, by = 0;
    for (let k = 0; k < bs.length; k++) {
      const b = bs[k];
      if (b.rx < 0.6 || b.ry < 0.5) continue;
      const dx = (x + 0.5 - b.x) / b.rx, dy = (y + 0.5 - b.y) / b.ry;
      const fld = 1 - (dx * dx + dy * dy);
      if (fld > bf) { bf = fld; best = k; bx = dx; by = dy; }
    }
    if (best < 0) continue;
    const b = bs[best];
    const lit = -bx * 0.6 - by * 0.8;
    const base = b.k > 0.75 ? 3 : b.k > 0.45 ? 2 : b.k > 0.2 ? 1 : 0;
    o.set(x, y, ramp[clamp(base + (lit > 0.4 ? 1 : lit < -0.45 ? -1 : 0), 0, ramp.length - 1)]);
  }
}
/**
 * Облако-поле (метаболы): клубы складываются в поле F = Σ (1 − d²)², внутри — где F выше порога: масса цельная, край бугристый.
 * billow — клубы: свет по градиенту поля (бугор светлее сверху слева, темнее снизу справа); flat — пелена: внутри ровный тон,
 * верхняя кромка светлее, нижняя темнее. Тон — от свежести клубов. alpha — ступень прозрачности (тающее облако), без контура.
 */
function cloudF(o: PC, bs: Blob2[], ramp: Ramp, opt: { T?: number; flat?: boolean; alpha?: number; edgeAlpha?: number } = {}) {
  const T = opt.T ?? 0.45, alpha = opt.alpha ?? 255;
  const live = bs.filter((b) => b.rx >= 0.7 && b.ry >= 0.6);
  if (!live.length || alpha <= 0) return;
  let x0 = o.w, y0 = o.h, x1 = 0, y1 = 0;
  for (const b of live) {
    x0 = Math.min(x0, Math.floor(b.x - b.rx - 2)); x1 = Math.max(x1, Math.ceil(b.x + b.rx + 2));
    y0 = Math.min(y0, Math.floor(b.y - b.ry - 2)); y1 = Math.max(y1, Math.ceil(b.y + b.ry + 2));
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(o.w - 1, x1); y1 = Math.min(o.h - 1, y1);
  const W = x1 - x0 + 3, H = y1 - y0 + 3;
  const F = new Float32Array(W * H), K = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = x0 - 1 + i + 0.5, py = y0 - 1 + j + 0.5;
    let f = 0, kk = 0;
    for (const b of live) {
      const dx = (px - b.x) / b.rx, dy = (py - b.y) / b.ry;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const w = (1 - d2) * (1 - d2);
      f += w;
      kk += w * b.k;
    }
    F[j * W + i] = f;
    K[j * W + i] = f > 0 ? kk / f : 0;
  }
  const inside = (i: number, j: number) => F[j * W + i] >= T;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = x - x0 + 1, j = y - y0 + 1;
    if (!inside(i, j)) continue;
    const k = K[j * W + i];
    const base = k > 0.75 ? 3 : k > 0.45 ? 2 : k > 0.2 ? 1 : 0;
    let t = base;
    if (opt.flat) {
      if (!inside(i, j - 1)) t = base + 1;
      else if (!inside(i, j + 1) || !inside(i + 1, j + 1)) t = base - 1;
    } else {
      const gx = F[j * W + i + 1] - F[j * W + i - 1], gy = F[(j + 1) * W + i] - F[(j - 1) * W + i];
      const gl = Math.hypot(gx, gy);
      const lit = gl > 1e-4 ? (gx * 0.6 + gy * 0.8) / gl : 0;
      if (gl > 0.08 && lit > 0.3) t = base + 1;
      else if (gl > 0.08 && lit < -0.35) t = base - 1;
      if (!inside(i, j + 1)) t = Math.min(t, base - 1);
    }
    const c = ramp[clamp(t, 0, ramp.length - 1)];
    const rim = opt.edgeAlpha !== undefined && (!inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1));
    const a = rim ? Math.min(alpha, opt.edgeAlpha!) : alpha;
    o.set(x, y, a >= 255 ? c : [c[0], c[1], c[2], a]);
  }
}
/** Ступень прозрачности тающего облака: до 55 % пути — плотно, дальше 210 → 150 → 90. */
const fadeA = (v: number) => (v < 0.55 ? 255 : v < 0.7 ? 210 : v < 0.85 ? 150 : 90);

/** Пузырёк яда: колечко 3×3 светлого тона. */
function bubble(o: PC, x: number, y: number, c: RGBA) {
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) o.set(Math.round(x) + dx, Math.round(y) + dy, c);
}

/**
 * Луч «Взгляда» (umb_fog_treant-beamfx.png): кадры 32×16, ось луча — между строками 7 и 8. Строки листа: 0 — тело луча (тайл,
 * повторяется вдоль луча без шва), 1 — конец луча с ледяными осколками, 2 — начало у глаза (вспышка; точка глаза — origin).
 * Клиент поворачивает куски к цели и кладёт: начало у глаза, тайлы тела, конец — на 240 px. Кадр hit — полный луч
 * в конце предупреждения (кадр 2 «луча взгляда» у древня).
 */
export const FOG_BEAMFX = { frame: [32, 16] as const, origin: [6, 8] as const, n: 8, fps: 15, hit: 1, rows: { body: 0, end: 1, start: 2 } };
const BW = 32, BH = 16;
/** Тон пикселя тела луча в кадре f (−1 — пусто): белая середина, бирюза, тёмная кромка; рябь и бегущий блик — с периодом тайла. */
function beamTone(x: number, y: number, f: number, wMul = 1): number {
  const xm = ((x % BW) + BW) % BW;
  const W0 = [1.2, 4.6, 4.0, 4.0, 4.0, 3.0, 2.0, 1.4][f];
  const rip = f >= 2 && f <= 5 ? 0.7 * Math.sin(TAU * (xm / 16 + f / 4)) : 0;
  const w = (W0 + rip * (f >= 5 ? 0.5 : 1)) * wMul;
  const d = Math.abs(y + 0.5 - 8);
  if (d > w) return -1;
  if (f >= 6 && hash01((xm >> 2) & 7, f, 13) < (f === 6 ? 0.25 : 0.5)) return -1;
  let t = d < 1 ? 4 : d < 2 ? 3 : d < w - 1 ? 2 : 1;
  if (f === 0) t = d < 1 ? 3 : 2;
  if (f === 1 && d < 2.6) t = 4;
  if (f >= 2 && f <= 4) {
    const px = (((xm - (f - 2) * 11) % BW) + BW) % BW;
    if (px < 5 && d < 2.5) t = Math.min(4, t + 1);
  }
  if (f >= 6) t = Math.max(1, t - 1);
  return t;
}
function beamFrame(f: number, row: number): PC {
  const o = new PC(BW, BH);
  const taper = (x: number) => (row === 1 ? clamp(1 - (x - 15) / 9, 0, 1) : 1);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    if (row === 2 && x < 6) continue;
    const t = beamTone(x, y, f, taper(x));
    if (t >= 0) o.set(x, y, GLOW[t]);
  }
  // ледяные искры вдоль луча
  if (f >= 1 && f <= 5) for (let x = 0; x < BW; x++) {
    if (row === 2 && x < 9) continue;
    if (row === 1 && x > 22) continue;
    const h = hash01(x, f, 29);
    if (h > 0.09) continue;
    const side = hash01(x, f, 31) > 0.5 ? 1 : -1;
    const y = Math.round(8 + side * (4.6 + 1.6 * hash01(x, f, 37))) - (side > 0 ? 0 : 1);
    o.set(x, y, GLOW[h < 0.04 ? 4 : 3]);
  }
  if (row === 1 && f >= 1) {
    // конец луча: звезда ледяных осколков
    const k = [0, 1, 0.85, 0.75, 0.7, 0.5, 0.3, 0.15][f];
    const cx = 24, cy = 8;
    const rays: [number, number][] = [[0, 1], [-0.7, 0.75], [0.7, 0.75], [-1, 0.45], [1, 0.45], [-0.25, -0.95], [0.3, -0.9]];
    rays.forEach(([ay, ax], j) => {
      const L = Math.round((3 + 3 * hash01(j, 3, 41)) * k + 1);
      for (let r = 1; r <= L; r++) {
        const x = Math.round(cx + ax * r * 1.1), y = Math.round(cy + ay * r);
        o.set(x, y, GLOW[r === L ? 4 : r > L - 3 ? 3 : 2]);
      }
    });
    const R0 = 1 + 2 * k;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y);
      if (d <= R0) o.set(cx + x, cy + y - (y < 0 ? 0 : 0), GLOW[d < R0 * 0.5 ? 4 : 3]);
    }
  }
  if (row === 2) {
    // начало у глаза: вспышка-диск
    const R0 = [2, 5, 4.2, 4, 3.6, 3, 2.2, 1.6][f];
    for (let y = 0; y < BH; y++) for (let x = 0; x < 13; x++) {
      const d = Math.hypot(x + 0.5 - 6.5, y + 0.5 - 8);
      if (d <= R0) o.set(x, y, GLOW[d < R0 * 0.5 ? 4 : 3]);
      else if (d <= R0 + 1 && f >= 1 && f <= 4) o.set(x, y, GLOW[2]);
    }
  }
  return o;
}
export function buildBeamFx(): PC {
  const out = new PC(BW * FOG_BEAMFX.n, BH * 3);
  for (let f = 0; f < FOG_BEAMFX.n; f++) for (let row = 0; row < 3; row++) out.blit(beamFrame(f, row), f * BW, row * BH);
  return out;
}

/**
 * Мгла «Миазмов» (umb_fog_treant-miasmafx.png): кадр 96×104, центр метки (40 px) — (48, 60); земля без сжатия, метка круглая.
 * Строка 0 — под юнитами (стелющаяся мгла, задние клубы), 1 — над юнитами (передние клубы, пузырьки). Связка: «оседает»
 * (6 кадров, клубы опускаются и ложатся) → «стелется» по кругу до конца предупреждения → «густеет» (кадр hit — удар и яд):
 * клубы вздымаются, пузырьки яда, мгла тает.
 */
export const FOG_MIASMAFX = {
  frame: [96, 104] as const, center: [48, 60] as const, cols: 24,
  anims: {
    settle: { col: 0, n: 6, fps: 12, loop: false, next: "hold" },
    hold: { col: 6, n: 8, fps: 12, loop: true, next: "burst" },
    burst: { col: 14, n: 10, fps: 12, loop: false, hit: 1 },
  },
};
const MW = 96, MH = 104, MCX = 48, MCY = 60;
/** Пелена мглы: крупные плоские клубы внахлёст внутри круга 32 px; каждый ходит по своему кружку — петля 8 кадров без шва. */
const MIASMA_GROUND = (() => {
  const out: { x: number; y: number; rx: number; ry: number; ph: number; wr: number; kk: number }[] = [];
  let row = 0;
  for (let gy = -26; gy <= 26; gy += 8, row++) for (let gx = -32; gx <= 32; gx += 13) {
    const ox = gx + (row % 2 ? 6.5 : 0) + (hash01(gx + 50, gy + 50, 3) - 0.5) * 4;
    const oy = gy + (hash01(gx + 50, gy + 50, 4) - 0.5) * 3;
    const R0 = Math.hypot(ox, oy * 1.05);
    if (R0 > 30) continue;
    const pull = R0 > 22 ? 0.9 : 1;
    out.push({
      x: ox * pull, y: oy * pull, rx: 10 + 2 * hash01(gx + 50, gy + 50, 5), ry: 6.6 + hash01(gx + 50, gy + 50, 6),
      ph: hash01(gx + 50, gy + 50, 7) * TAU, wr: 1.2 + 1.0 * hash01(gx + 50, gy + 50, 8), kk: hash01(gx + 50, gy + 50, 9),
    });
  }
  return out;
})();
function groundMist(f8: number, k: number, shrink = 1, size = 1): Blob2[] {
  return MIASMA_GROUND.map((b) => {
    const a = b.ph + (TAU * f8) / 8;
    return {
      x: MCX + (b.x + b.wr * Math.cos(a)) * shrink, y: MCY + (b.y + b.wr * 0.6 * Math.sin(a)) * shrink,
      rx: b.rx * size, ry: b.ry * size, k,
    };
  });
}
/** Светлые завитки в пелене: дуги вокруг центра, поворачиваются за петлю на шаг между собой. */
function mistSwirls(o: PC, f8: number, k = 1) {
  for (let j = 0; j < 5; j++) {
    const R0 = 7 + 5 * j;
    const a0 = (j * 2.4 + ((TAU / 5) * f8) / 8) * (j % 2 ? -1 : 1);
    const len = (7 + j * 1.5) / R0;
    for (let s = 0; s <= 12; s++) {
      const a = a0 + (len * s) / 12;
      const x = Math.round(MCX + Math.cos(a) * R0), y = Math.round(MCY + Math.sin(a) * R0 * 0.8);
      const c = o.get(x, y);
      if (!c || !c[3]) continue;
      o.set(x, y, MIASMA[k > 0.7 ? 4 : 3]);
    }
  }
}
/** Клубы «густеет»: шесть по кругу и два в середине. */
const MIASMA_BILLOWS: { x: number; y: number; r: number; lag: number }[] = [
  ...[0, 1, 2, 3, 4, 5].map((j) => {
    const a = (j / 6) * TAU + 0.35;
    return { x: Math.cos(a) * 17, y: Math.sin(a) * 15, r: 7.5 + 2 * hash01(j, 1, 21), lag: hash01(j, 2, 21) * 0.15 };
  }),
  { x: -5, y: -3, r: 8.5, lag: 0.05 }, { x: 6, y: 2, r: 8, lag: 0.1 },
];
function miasmaFrame(anim: "settle" | "hold" | "burst", f: number): [PC, PC] {
  const back = new PC(MW, MH), front = new PC(MW, MH);
  if (anim === "settle") {
    // мгла опускается сверху клубами и ложится пеленой, со сдвигом по времени
    const bs = groundMist(0, 0.5).map((b, j) => {
      const delay = hash01(j, 4, 7) * 0.5;
      const t = easeOut(clamp((f / 5 - delay) / (1 - delay), 0, 1));
      if (t <= 0.02) return null;
      return { ...b, y: b.y - 14 * (1 - t), rx: lerp(3.6, b.rx, t), ry: lerp(3.4, b.ry, t), k: lerp(0.8, 0.5, t) };
    }).filter((b): b is Blob2 => !!b);
    cloudF(back, bs, MIASMA, { flat: true, T: 0.5, alpha: 215, edgeAlpha: 150 });
    if (f >= 4) mistSwirls(back, 0, 0.5);
    return [back, front];
  }
  if (anim === "hold") {
    cloudF(back, groundMist(f, 0.5), MIASMA, { flat: true, T: 0.5, alpha: 215, edgeAlpha: 150 });
    mistSwirls(back, f, 0.5);
    for (let j = 0; j < 3; j++) {
      const ph = (f / 8 + j / 3) % 1;
      const a = j * 2.1 + 0.6, R0 = 8 + 9 * j;
      if (ph < 0.6) bubble(back, MCX + Math.cos(a) * R0, MCY + Math.sin(a) * R0 * 0.8 - 3 - 6 * ph, BUBBLE);
    }
    return [back, front];
  }
  // «густеет»: кадр 0 — пелена сжимается и светлеет; кадр 1 — клубы вздымаются; дальше растут, поднимаются и тают
  if (f === 0) {
    cloudF(back, groundMist(0, 0.8, 0.9, 1.04), MIASMA, { flat: true, T: 0.5, alpha: 215, edgeAlpha: 150 });
    mistSwirls(back, 0, 1);
    return [back, front];
  }
  const u = (f - 1) / 8;
  cloudF(back, groundMist(0, 0.55, lerp(0.95, 1.1, u), lerp(1, 0.8, u)), MIASMA, { flat: true, T: 0.5, alpha: Math.min(215, fadeA(u * 0.9 + 0.1)), edgeAlpha: 150 });
  const bil = MIASMA_BILLOWS.map((b) => {
    const v = clamp((u - b.lag) / (1 - b.lag), 0, 1);
    const rise = 3 + 15 * easeOut(v);
    const r = b.r * (0.6 + 0.55 * easeOut(Math.min(1, v * 2.2))) * (1 - 0.3 * v);
    return { x: MCX + b.x * (1 + 0.15 * v), y: MCY + b.y - rise, rx: r * 1.1, ry: r, k: 1 - 0.5 * v, gy: b.y, v };
  });
  const a = fadeA(u);
  cloudF(back, bil.filter((b) => b.gy < 0), MIASMA, { alpha: a });
  cloudF(front, bil.filter((b) => b.gy >= 0), MIASMA, { alpha: a });
  // пузырьки яда в клубах
  for (let j = 0; j < 8; j++) {
    const ph = clamp(u * 1.6 - j * 0.08, 0, 1);
    if (ph <= 0 || ph >= 1) continue;
    const an = j * 0.9 + 0.3, R0 = 6 + 3 * j;
    const y = MCY + Math.sin(an) * R0 * 0.8 - 10 - 24 * ph;
    bubble(Math.sin(an) > 0 ? front : back, MCX + Math.cos(an) * R0, y, BUBBLE);
  }
  return [back, front];
}
export function buildMiasmaFx(): PC {
  const A = FOG_MIASMAFX.anims;
  const out = new PC(MW * FOG_MIASMAFX.cols, MH * 2);
  const put = (col: number, [b, fr]: [PC, PC]) => { out.blit(b, col * MW, 0); out.blit(fr, col * MW, MH); };
  for (let f = 0; f < A.settle.n; f++) put(A.settle.col + f, miasmaFrame("settle", f));
  for (let f = 0; f < A.hold.n; f++) put(A.hold.col + f, miasmaFrame("hold", f));
  for (let f = 0; f < A.burst.n; f++) put(A.burst.col + f, miasmaFrame("burst", f));
  return out;
}

/**
 * «Гнилые шишки» (umb_fog_treant-sporefx.png): кадр 64×64, центр метки (32 px) — (32, 44). Строка 0 — под юнитами (тень, шишка
 * на земле, пятно гнили), 1 — над юнитами (падающая шишка, облако спор). Связка: «падает» (6 кадров, касание земли — кадр land)
 * → «лежит» по кругу, набухает → «лопается» (кадр hit — в конце предупреждения): облако спор, чешуйки, пятно гнили.
 */
export const FOG_SPOREFX = {
  frame: [64, 64] as const, center: [32, 44] as const, cols: 18,
  anims: {
    fall: { col: 0, n: 6, fps: 12, loop: false, land: 4, next: "lie" },
    lie: { col: 6, n: 4, fps: 8, loop: true, next: "burst" },
    burst: { col: 10, n: 8, fps: 12, loop: false, hit: 1 },
  },
};
/** Споры: болотно-жёлтая зелень (урон природой). */
const SPORE = R("#4a4318", "#7c7226", "#b0a33e", "#d9cd66", "#f7f0b0");
/** Шишка 7×9 в контуре: чешуя тонами, g — гниль (при набухании — бирюзовый огонь). */
const CONE_BIG = [
  "....o....",
  "...o3o...",
  "..o343o..",
  ".o32g21o.",
  "o3432g21o",
  "o32g2121o",
  "o2321g11o",
  ".o2g211o.",
  ".o32111o.",
  "..o211o..",
  "...o1o...",
  "....o....",
];
function drawCone(o: PC, cx: number, cy: number, glow: number, swell = 0) {
  CONE_BIG.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    const x = cx - 4 + i, y = cy - 11 + j;
    if (ch === "o") o.set(x, y, OUT);
    else if (ch === "g") o.set(x, y, glow > 0 ? GLOW[clamp(Math.round(1 + 2 * glow), 1, 4)] : CONE[4]);
    else o.set(x, y, CONE[clamp(+ch + (swell > 0.5 && +ch < 4 ? 1 : 0), 0, 4)]);
  }));
  if (swell > 0.5) for (const [dx, dy] of [[-5, -6], [5, -6], [-5, -5], [5, -5]]) o.set(cx + dx, cy + dy, OUT);
}
function shadowEll(o: PC, cx: number, cy: number, rx: number, ry: number, a: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d <= 1) o.set(x, y, [12, 18, 10, Math.round(a * (d < 0.5 ? 1 : 0.7))]);
  }
}
/** Пятно гнили на земле: рваная клякса, к концу сжимается. */
function stain(o: PC, cx: number, cy: number, k: number) {
  for (let y = -6; y <= 6; y++) for (let x = -10; x <= 10; x++) {
    const a = Math.atan2(y, x);
    const rr = (7 + 2.2 * Math.sin(a * 5 + 1) + 1.4 * Math.sin(a * 3)) * k;
    const d = Math.hypot(x, y * 1.6);
    if (d > rr) continue;
    o.set(cx + x, cy + y, d > rr - 1.2 ? SPORE[1] : hash01(x + 20, y + 20, 5) < 0.12 ? SPORE[2] : SPORE[0]);
  }
}
function sporeFrame(anim: "fall" | "lie" | "burst", f: number): [PC, PC] {
  const back = new PC(N, N), front = new PC(N, N);
  const cx = 32, cy = 44;
  if (anim === "fall") {
    const t = [0, 0.3, 0.58, 0.82, 1, 1][f];
    const y = lerp(-4, cy, easeIn(t));
    shadowEll(back, cx, cy + 1, 1.5 + 3.5 * t, 0.8 + 1.4 * t, 60 + 60 * t);
    if (f >= 4) {
      // касание: ямка, пыль
      drawCone(back, cx, cy + (f === 4 ? 1 : 0), 0);
      if (f === 4) for (const s of [-1, 1]) cloud2(front, [{ x: cx + s * 6, y: cy, rx: 3, ry: 1.8, k: 0.6 }], DUST);
      if (f === 5) for (const s of [-1, 1]) cloud2(back, [{ x: cx + s * 8, y: cy - 0.5, rx: 2.2, ry: 1.3, k: 0.4 }], DUST);
    } else drawCone(front, cx, Math.round(y), 0);
    return [back, front];
  }
  if (anim === "lie") {
    shadowEll(back, cx, cy + 1, 5, 2.2, 120);
    const sw = f % 2;
    drawCone(back, cx, cy, sw ? 0.7 : 0.25, sw);
    // спора сочится вверх
    const ph = f / 4;
    back.set(cx + 2, cy - 10 - Math.round(4 * ph), SPORE[3]);
    if (f >= 2) back.set(cx - 2, cy - 9 - Math.round(3 * (ph - 0.5)), SPORE[2]);
    return [back, front];
  }
  // лопается
  if (f === 0) {
    shadowEll(back, cx, cy + 1, 5, 2.2, 120);
    drawCone(back, cx, cy, 1.2, 1);
    return [back, front];
  }
  const u = (f - 1) / 6;
  stain(back, cx, cy, f === 1 ? 0.7 : lerp(1, 0.55, clamp((f - 4) / 3, 0, 1)));
  if (f <= 6) {
    const P: [number, number, number][] = [[0, -4, 8.5], [-10, -1, 6.6], [10, 0, 6.6], [-4, -12, 7], [5, -13, 7], [-14, -7, 5.4], [14, -6, 5.4], [-6, 4, 5.4], [7, 4, 5.4]];
    const sc = 0.4 + 0.75 * easeOut(Math.min(1, u * 1.5));
    const bs = P.map(([px, py, r], j) => {
      const rr = r * (0.75 + 0.45 * easeOut(Math.min(1, u * 2.2))) * (1 - 0.25 * u);
      return { x: cx + px * sc, y: cy - 3 + py * sc - 8 * easeOut(u), rx: rr * 1.15, ry: rr, k: clamp(1 - 0.55 * u - 0.1 * (j % 3), 0, 1), gy: cy + py };
    });
    const a = fadeA(u);
    cloudF(back, bs.filter((b) => b.gy < cy - 4), SPORE, { alpha: a });
    cloudF(front, bs.filter((b) => b.gy >= cy - 4), SPORE, { alpha: a });
    // чешуйки летят по дугам, споры — точки вверх
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * TAU + 0.2;
      const v = Math.min(1, u * 1.6);
      const x = cx + Math.cos(a) * (3 + 18 * v), y = cy - 4 + Math.sin(a) * 6 * v - 12 * v * (1 - v) * 2;
      if (v < 1) { front.set(x, y, CONE[3]); front.set(x + 1, y, CONE[1]); }
    }
    for (let j = 0; j < 8; j++) {
      const x = cx + (hash01(j, 1, 5) - 0.5) * 34 * (0.4 + u), y = cy - 6 - 26 * u * (0.5 + hash01(j, 2, 5));
      front.set(x, y, SPORE[4]);
    }
  }
  if (f === 1) {
    // вспышка разрыва: бирюза гнили и споровая звезда
    for (let r = 1; r <= 7; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) front.set(cx + dx * r, cy - 6 + dy * r, r <= 2 ? GLOW[4] : r <= 4 ? SPORE[4] : SPORE[3]);
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (let r = 1; r <= 3; r++) front.set(cx + dx * r, cy - 6 + dy * r, r <= 1 ? GLOW[3] : SPORE[3]);
  }
  return [back, front];
}
export function buildSporeFx(): PC {
  const A = FOG_SPOREFX.anims;
  const out = new PC(N * FOG_SPOREFX.cols, N * 2);
  const put = (col: number, [b, fr]: [PC, PC]) => { out.blit(b, col * N, 0); out.blit(fr, col * N, N); };
  for (let f = 0; f < A.fall.n; f++) put(A.fall.col + f, sporeFrame("fall", f));
  for (let f = 0; f < A.lie.n; f++) put(A.lie.col + f, sporeFrame("lie", f));
  for (let f = 0; f < A.burst.n; f++) put(A.burst.col + f, sporeFrame("burst", f));
  return out;
}

// ---------------- туман у ног и огоньки: частицы клиента ----------------
/**
 * Туман вокруг ног («полупрозрачный ореол» карточки) и бирюзовые огоньки — не кадры листа: клиент ведёт их сам каждый кадр
 * экрана с шагом в пиксель холста, как светлячков пилота. Спрайт umb_fog_treant-fog.png: строка 0 — 4 клуба тумана 24×10
 * (полупрозрачные), ниже — 4 кадра огонька 5×5. Клубы: эллипс вокруг точки опоры (полуоси rx, ry), период обхода, фаза;
 * в верхней половине эллипса клуб рисуется за древнем, в нижней — перед ним. Огоньки: петля вокруг кроны и плеч.
 */
export const FOG_TREANT_FOG = {
  sprite: `${ID}-fog.png`,
  wisp: { w: 32, h: 12, frames: 4, y: 0 },
  mote: { size: 5, frames: 4, y: 12, fps: 8 },
  wisps: [
    { r: [26, 7], period: 14, phase: 0.2, frame: 0, lift: 2 },
    { r: [22, 6], period: 11, phase: 1.1, frame: 1, lift: 1 },
    { r: [29, 8], period: 17, phase: 2.0, frame: 2, lift: 3 },
    { r: [20, 5], period: 12, phase: 2.9, frame: 3, lift: 1 },
    { r: [27, 7], period: 15, phase: 3.8, frame: 1, lift: 2 },
    { r: [24, 6], period: 13, phase: 4.7, frame: 0, lift: 2 },
    { r: [30, 7], period: 19, phase: 5.6, frame: 2, lift: 1 },
  ],
  motes: [
    { c: [-17, -47], r: [4, 2.5], period: 3.4, phase: 0 },
    { c: [18, -42], r: [3.5, 3], period: 2.9, phase: 1.9 },
    { c: [-21, -22], r: [3, 4], period: 3.1, phase: 3.3 },
  ],
};
export function buildFogSprite(): PC {
  const W = FOG_TREANT_FOG.wisp.w, H = FOG_TREANT_FOG.wisp.h;
  const out = new PC(W * 4, H + 5);
  const shapes: Blob2[][] = [
    [{ x: 9, y: 7, rx: 7.5, ry: 3.2, k: 0.6 }, { x: 17, y: 6, rx: 8.5, ry: 3.8, k: 0.65 }, { x: 25, y: 7.5, rx: 6, ry: 2.6, k: 0.55 }],
    [{ x: 10, y: 6.5, rx: 8.5, ry: 3.6, k: 0.65 }, { x: 20, y: 7, rx: 7.5, ry: 3.1, k: 0.6 }, { x: 27, y: 8, rx: 4, ry: 2, k: 0.5 }],
    [{ x: 7, y: 7.5, rx: 5, ry: 2.4, k: 0.55 }, { x: 15, y: 6, rx: 8.5, ry: 4, k: 0.65 }, { x: 24, y: 7, rx: 7, ry: 3, k: 0.6 }],
    [{ x: 12, y: 7, rx: 9.5, ry: 3.4, k: 0.6 }, { x: 23, y: 6.5, rx: 6.5, ry: 3.4, k: 0.65 }],
  ];
  shapes.forEach((bs, f) => {
    const c = new PC(W, H);
    cloudF(c, bs, MIST, { flat: true, T: 0.4 });
    // прозрачность ступенями: верхняя кромка плотнее, тело — дымка, низ и концы — прозрачнее
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = c.get(x, y)!;
      if (!p[3]) continue;
      const tone = MIST.findIndex((m) => m[0] === p[0] && m[1] === p[1] && m[2] === p[2]);
      const end = Math.min(x, W - 1 - x) < 4;
      const a = tone >= 3 ? 150 : tone <= 1 ? 70 : 110;
      out.set(f * W + x, y, [p[0], p[1], p[2], end ? Math.round(a * 0.6) : a]);
    }
  });
  const M = FOG_TREANT_FOG.mote.size, my = FOG_TREANT_FOG.mote.y;
  const draw = (f: number, px: [number, number, RGBA][]) => px.forEach(([x, y, c]) => out.set(f * M + 2 + x, my + 2 + y, c));
  const cross = (r: number, c: RGBA): [number, number, RGBA][] => [[r, 0, c], [-r, 0, c], [0, r, c], [0, -r, c]];
  draw(0, [[0, 0, GLOW[4]], ...cross(1, GLOW[2])]);
  draw(1, [[0, 0, GLOW[3]], ...cross(1, GLOW[1])]);
  draw(2, [[0, 0, GLOW[4]], ...cross(1, GLOW[3]), ...cross(2, GLOW[1])]);
  draw(3, [[0, 0, GLOW[3]], ...cross(1, GLOW[0])]);
  return out;
}

// ---------------- монтажи для утверждения (вспомогательное — как у пилота, там не экспортировано) ----------------
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
/** Строки атласа tiles/terrain.png (shared/map.ts, TERRAIN_KEYS): трава и лесная земля. */
const GROUND_ROW = { grass: 6, forest: 7 } as const;
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

/** Туман и огоньки в момент t (с): как их будет вести клиент — клубы по эллипсу у ног, за древнем (сзади) или перед ним. */
function fogAt(t: number, flip: boolean) {
  const F = FOG_TREANT_FOG;
  const wisps = F.wisps.map((w) => {
    const a = (t / w.period) * TAU + w.phase;
    return { x: (flip ? -1 : 1) * w.r[0] * Math.cos(a), y: w.r[1] * Math.sin(a) - w.lift, frame: w.frame, back: Math.sin(a) < 0 };
  });
  const motes = F.motes.map((m, k) => {
    const a = (t / m.period) * TAU + m.phase;
    return { x: (flip ? -1 : 1) * m.c[0] + m.r[0] * Math.cos(a), y: m.c[1] + m.r[1] * Math.sin(a * 2) * 0.6, frame: Math.floor(t * F.mote.fps + k * 1.7) % F.mote.frames };
  });
  return { wisps, motes };
}
/** Древень с туманом в точке (x, y) — левый верхний угол кадра 64 на холсте, масштаб k. */
function bossWithFog(c: PC, frame: PC, fogSprite: PC, x: number, y: number, k: number, flip: boolean, t: number) {
  const F = FOG_TREANT_FOG;
  const fx = x + 32 * k, fy = y + 60 * k;
  const { wisps, motes } = fogAt(t, flip);
  const wispImg = (f: number) => scaleNN(crop(fogSprite, f * F.wisp.w, F.wisp.y, F.wisp.w, F.wisp.h), k);
  for (const w of wisps) if (w.back) c.blit(wispImg(w.frame), Math.round(fx + (w.x - F.wisp.w / 2) * k), Math.round(fy + (w.y - F.wisp.h / 2) * k));
  c.blit(scaleNN(frame, k, flip), x, y);
  for (const w of wisps) if (!w.back) c.blit(wispImg(w.frame), Math.round(fx + (w.x - F.wisp.w / 2) * k), Math.round(fy + (w.y - F.wisp.h / 2) * k));
  for (const m of motes) c.blit(scaleNN(crop(fogSprite, m.frame * F.mote.size, F.mote.y, F.mote.size, F.mote.size), k), Math.round(fx + (m.x - 2.5) * k), Math.round(fy + (m.y - 2.5) * k));
}

/** Луч на холсте вправо от точки глаза (ex, ey) длиной len (px мира), кадр f, масштаб k: начало, тайлы тела, конец. */
function beamRight(c: PC, beam: PC, ex: number, ey: number, len: number, f: number, k: number) {
  const [BWf, BHf] = FOG_BEAMFX.frame, [ox, oy] = FOG_BEAMFX.origin;
  const piece = (row: number) => scaleNN(crop(beam, f * BWf, row * BHf, BWf, BHf), k);
  const x0 = ex - ox * k, y0 = ey - oy * k;
  c.blit(piece(FOG_BEAMFX.rows.start), x0, y0);
  const end = x0 + (len - BWf + ox) * k;
  for (let x = x0 + BWf * k; x < end; x += BWf * k) {
    const body = piece(FOG_BEAMFX.rows.body);
    const w = Math.min(BWf * k, end - x);
    c.blit(crop(body, 0, 0, w, body.h), x, y0);
  }
  c.blit(piece(FOG_BEAMFX.rows.end), end, y0);
}

/** Монтаж: древень рядом с героем 32×32 на траве и лесной земле (×3, с туманом), раскадровки ×2, эффекты мира с героем. */
function buildPreview(sheets: Record<FogAnim, PC>, fx: { beam: PC; miasma: PC; spore: PC; fog: PC }, hero: PC, terrain: PC): PC {
  const W = 1660;
  const rows: { h: number; draw: (c: PC, y: number) => void }[] = [];
  const BG: RGBA = [24, 20, 26, 255];
  const frameOf = (a: FogAnim, view: number, i: number) => crop(sheets[a], i * N, view * N, N, N);
  const heroDown = crop(hero, 0, 0, 32, 32);
  const heroSide = crop(hero, 0, 64, 32, 32);
  for (const g of ["grass", "forest"] as Ground[]) {
    rows.push({
      h: 64 * 3 + 40,
      draw: (c, y0) => {
        const k = 3;
        text(c, `×3 · ГЕРОЙ 32 И МГЛОГЛЯД 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · ${g === "grass" ? "ТРАВА" : "ЛЕСНАЯ ЗЕМЛЯ"} · ТУМАН И ОГОНЬКИ - ЧАСТИЦЫ КЛИЕНТА`, 16, y0 + 8);
        const y = y0 + 36;
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, g);
        let x = 40;
        const hy = y + (64 - 32) * k;
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroDown, k), x, hy);
        x += 30 * k;
        ([[0, false], [1, false], [2, false], [2, true]] as [number, boolean][]).forEach(([v, flip], j) => {
          shadowBlob(c, x + 32 * k, y + 60 * k, 17 * k, 5 * k);
          bossWithFog(c, frameOf("idle", v, 0), fx.fog, x, y, k, flip, 1.3 + j * 2.1);
          x += 64 * k;
        });
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroSide, k, true), x, hy);
      },
    });
  }
  for (const a of Object.keys(FOG_TREANT_ANIMS) as FogAnim[]) {
    const A = FOG_TREANT_ANIMS[a];
    rows.push({
      h: 64 * 2 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.next ? ` · → ${FOG_TREANT_ANIMS[A.next].ru}` : ""}${A.hit !== undefined ? ` · УДАР - КАДР ${A.hit + 1}` : ""}`, 16, y0 + 8);
        for (const v of [0, 2]) {
          const y = y0 + 34 + (v === 0 ? 0 : 64 * k);
          groundBg(c, terrain, 16, y, W - 32, 64 * k, k, a === "walk" && v === 2 ? "forest" : "grass");
          let x = 24;
          const hy = y + (64 - 32) * k;
          shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
          c.blit(scaleNN(v === 0 ? heroDown : heroSide, k, v === 2), x, hy);
          x += 30 * k;
          for (let i = 0; i < A.n; i++) {
            shadowBlob(c, x + 32 * k, y + 60 * k, 17 * k, 5 * k);
            c.blit(scaleNN(frameOf(a, v, i), k), x, y);
            x += 64 * k;
          }
        }
      },
    });
  }
  // луч «Взгляда»: выстрел вбок (кадр удара) с героями на пути, ниже — 8 кадров луча
  rows.push({
    h: 64 * 2 + 40 + 8 + 4 * 16 * 2 + 3 * 8,
    draw: (c, y0) => {
      const k = 2;
      text(c, `×2 · ЭФФЕКТ МИРА · ЛУЧ ВЗГЛЯДА: ${FOG_BEAMFX.n} КАДРОВ · ${FOG_BEAMFX.fps} К/С · ДЛИНА 240 · НАЧАЛО У ГЛАЗА · ТАЙЛ ТЕЛА 32 · КОНЕЦ`, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, terrain, 16, y, W - 32, 64 * k + 8 + 4 * 16 * k + 3 * 8, k, "grass");
      const bx = 24;
      shadowBlob(c, bx + 32 * k, y + 60 * k, 17 * k, 5 * k);
      const fire = frameOf("gazeFire", 2, FOG_TREANT_ANIMS.gazeFire.hit!);
      c.blit(scaleNN(fire, k), bx, y);
      // глаз в кадре вбок: самый яркий пиксель выше середины кадра
      let ex = 40, ey = 20, best = -1;
      for (let yy = 4; yy < 40; yy++) for (let xx = 0; xx < N; xx++) {
        const p = fire.get(xx, yy)!;
        if (p[3] && p[0] + p[1] + p[2] > best && p[0] > 200) { best = p[0] + p[1] + p[2]; ex = xx; ey = yy; }
      }
      // герои дальше от зрителя, чем древень: луч от глаза проходит у них на уровне груди
      for (const d of [70, 160]) {
        const hx = bx + (ex + d) * k - 16 * k, feet = y + (ey + 15) * k;
        shadowBlob(c, hx + 16 * k, feet, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroSide, k, true), hx, feet - 30 * k);
      }
      beamRight(c, fx.beam, bx + ex * k + k, y + ey * k + k, 240, FOG_BEAMFX.hit, k);
      // кадры луча: начало + 2 тайла + конец, по 4 в ряд
      for (let f = 0; f < FOG_BEAMFX.n; f++) {
        const col = f % 2, row = Math.floor(f / 2);
        const xx = 24 + col * (128 * k + 40) + 0, yy = y + 64 * k + 8 + row * (16 * k + 8);
        text(c, `${f + 1}`, xx, yy + 8, 2);
        beamRight(c, fx.beam, xx + 30 + FOG_BEAMFX.origin[0] * k, yy + FOG_BEAMFX.origin[1] * k, 128, f, k);
      }
    },
  });
  // мгла «Миазмов»: герой в метке (нижний слой, герой, верхний слой)
  const MA = FOG_MIASMAFX.anims;
  const [MWf, MHf] = FOG_MIASMAFX.frame;
  const miRows: [string, number, number][] = [["ОСЕДАЕТ", MA.settle.col, MA.settle.n], ["СТЕЛЕТСЯ ПО КРУГУ", MA.hold.col, MA.hold.n], ["ГУСТЕЕТ - УДАР КАДР 2", MA.burst.col, 5], ["ГУСТЕЕТ", MA.burst.col + 5, 5]];
  for (const [ru, c0, n] of miRows) {
    rows.push({
      h: MHf * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ЭФФЕКТ МИРА · МГЛА МИАЗМОВ · ${ru} · ${n} КАДРОВ · 12 К/С · МЕТКА 40`, 16, y0 + 8);
        const y = y0 + 34;
        groundBg(c, terrain, 16, y, W - 32, MHf * k, k, "grass");
        let x = 24;
        for (let i = 0; i < n; i++) {
          const col = c0 + i;
          c.blit(scaleNN(crop(fx.miasma, col * MWf, 0, MWf, MHf), k), x, y);
          const [cx, cy] = FOG_MIASMAFX.center;
          shadowBlob(c, x + cx * k, y + (cy + 2) * k, 7 * k, 2.4 * k);
          c.blit(scaleNN(heroDown, k), x + (cx - 16) * k, y + (cy - 30) * k);
          c.blit(scaleNN(crop(fx.miasma, col * MWf, MHf, MWf, MHf), k), x, y);
          x += MWf * k + 8;
        }
      },
    });
  }
  // «Гнилые шишки»: падение, ожидание, разрыв; герой рядом с меткой
  const SA = FOG_SPOREFX.anims;
  const spRows: [string, number, number][] = [["ПАДАЕТ 6 · ЛЕЖИТ ПО КРУГУ 4", SA.fall.col, SA.fall.n + SA.lie.n], ["ЛОПАЕТСЯ - УДАР КАДР 2", SA.burst.col, SA.burst.n]];
  for (const [ru, c0, n] of spRows) {
    rows.push({
      h: 64 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ЭФФЕКТ МИРА · ГНИЛЫЕ ШИШКИ · ${ru} · МЕТКА 32`, 16, y0 + 8);
        const y = y0 + 34;
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, "grass");
        let x = 24;
        for (let i = 0; i < n; i++) {
          const col = c0 + i;
          c.blit(scaleNN(crop(fx.spore, col * N, 0, N, N), k), x, y);
          shadowBlob(c, x + 50 * k, y + 50 * k, 7 * k, 2.4 * k);
          c.blit(scaleNN(heroDown, k), x + 34 * k, y + 20 * k);
          c.blit(scaleNN(crop(fx.spore, col * N, N, N, N), k), x, y);
          x += 64 * k + 8;
        }
      },
    });
  }
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

/** «Наш | референс»: Мглогляд вниз и вбок (покой) крупно и образец 14 той же высоты. */
function buildCompare(sheets: Record<FogAnim, PC>, ref: PC | null): PC {
  const k = 6;
  const ours = crop(sheets.idle, 0, 0, N, N);
  const side = crop(sheets.idle, 0, 2 * N, N, N);
  const H = N * k;
  // образец: голова с кроной, ядро и руки — квадрат вокруг существа
  const refC = ref ? crop(ref, 330, 40, 1440, 1440) : null;
  const refS = refC ? scaleBox(refC, H, H) : null;
  const W = 24 + N * k + 16 + N * k + 24 + (refS ? refS.w + 24 : 0);
  const c = new PC(W, H + 72);
  fill(c, 0, 0, W, H + 72, [36, 32, 38, 255]);
  text(c, "НАШ", 24, 14, 3);
  if (refS) text(c, "РЕФЕРЕНС 14", 24 + 2 * N * k + 40, 14, 3);
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

/** Где глаз в кадре (целые пиксели) — привязка луча: вид, поза удара «луча взгляда». */
function eyePixel(view: FView): [number, number] {
  const p = POSES.gazeFire(view)[FOG_TREANT_ANIMS.gazeFire.hit!];
  const sc = fogTreant(p, view);
  const [x, y] = scr(toView(view, sc.eye));
  return [Math.floor(x), Math.floor(y)];
}

type CardSkill = { id: string; name: string; windupMs: number; r?: number; arc?: number; count?: number; spread?: number; at?: string };

/** Просмотр с анимацией: листы встроены в страницу (data:); туман и огоньки — частицы в коде, как у клиента; умения — по карточке. */
function buildHtml(sheet: PC, fx: { beam: PC; miasma: PC; spore: PC; fog: PC }, hero: PC, terrain: PC, skills: CardSkill[]): string {
  const png = (c: PC) => {
    const p = new PNG({ width: c.w, height: c.h });
    Buffer.from(c.data.buffer).copy(p.data);
    return "data:image/png;base64," + PNG.sync.write(p).toString("base64");
  };
  const grounds = (["grass", "forest"] as Ground[]).map((g) => png(crop(terrain, 14 * 32, GROUND_ROW[g] * 32, 128, 32)));
  const eye = { down: eyePixel("down"), side: eyePixel("side") };
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Мглогляд — анимации</title>
<style>
:root { --bg: #18141a; --fg: #efe6d2; --dim: #bdb09c; --line: #4d3f4a; --acc: #3ff0d0; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, "Segoe UI", sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 20px 0 6px; }
p { color: var(--dim); margin: 0 0 12px; max-width: 900px; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; align-items: center; }
button { background: #2a2230; color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 12px; font: inherit; cursor: pointer; }
button.on { border-color: var(--acc); color: var(--acc); }
.stage { display: flex; flex-wrap: wrap; gap: 12px; }
canvas { image-rendering: pixelated; border-radius: 6px; max-width: 100%; }
label { color: var(--dim); }
</style>
</head>
<body>
<h1>Мглогляд — древень Мглистого бора</h1>
<p>Кадр 64×64, рядом герой 32×32; масштаб игры. Вниз, вверх, вбок, влево (отражение). Скорость — как в листе. Туман у ног и бирюзовые огоньки — не кадры листа: клиент ведёт их сам каждый кадр экрана с шагом в пиксель холста (клуб тумана в верхней половине эллипса — за древнем, в нижней — перед ним).</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0"> трава</label><label><input type="radio" name="g" value="1" checked> лесная земля</label>
<label><input type="checkbox" id="fog" checked> туман и огоньки</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Замах длится windupMs карточки (связка «замах → удержание по кругу»), кадр удара приходится ровно на конец предупреждения. «Взгляд» — клин 22° на 240 px к случайному герою, в конце — луч от глаза (куски луча клиент поворачивает к цели); «Миазмы» — мгла оседает в метке 40 px под каждым героем и густеет; «Гнилые шишки» — 6 шишек падают в метки 32 px не дальше 150 px и лопаются. Зелёные фигуры — предупреждения (в игре их рисует клиент).</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const ANIMS = ${JSON.stringify(FOG_TREANT_ANIMS)};
const SKILLS = ${JSON.stringify(skills.map((s) => ({ ...s, ...FOG_TREANT_SKILLS[s.id] })))};
const BEAM = ${JSON.stringify(FOG_BEAMFX)}, MIA = ${JSON.stringify(FOG_MIASMAFX)}, SPO = ${JSON.stringify(FOG_SPOREFX)}, FOG = ${JSON.stringify(FOG_TREANT_FOG)};
const EYE = ${JSON.stringify(eye)};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${png(sheet)}"), beamImg = img("${png(fx.beam)}"), miaImg = img("${png(fx.miasma)}"), spoImg = img("${png(fx.spore)}"), fogImg = img("${png(fx.fog)}"), hero = img("${png(hero)}");
const grounds = [img("${grounds[0]}"), img("${grounds[1]}")];
let anim = "idle", zoom = 3, ground = 1, frame = 0, last = 0, held = 0, showFog = true;
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
document.getElementById("fog").onchange = (e) => { showFog = e.target.checked; };
let canvases = [];
function build() {
  const st = document.getElementById("stage"); st.innerHTML = ""; canvases = [];
  for (const v of views) {
    const c = document.createElement("canvas"); c.width = 112 * zoom; c.height = 76 * zoom; c.title = v[0];
    st.appendChild(c); canvases.push([c, v]);
  }
  const a = document.getElementById("arena"); a.width = 420 * zoom; a.height = 260 * zoom;
}
build();
function paintGround(g, w, h) {
  for (let y = 0; y < h; y += 32 * zoom) for (let x = 0; x < w; x += 32 * zoom) g.drawImage(grounds[ground], ((x / zoom / 32 + y / zoom / 32) % 4) * 32, 0, 32, 32, x, y, 32 * zoom, 32 * zoom);
}
/** Туман: клубы по эллипсу у точки опоры (fx, fy — пиксели мира); back — только задние (за древнем), иначе передние. Шаг — пиксель холста. */
function drawFog(g, fx, fy, flip, ts, back) {
  if (!showFog) return;
  const t = ts / 1000;
  for (const w of FOG.wisps) {
    const a = (t / w.period) * Math.PI * 2 + w.phase;
    if ((Math.sin(a) < 0) !== back) continue;
    const x = (flip ? -1 : 1) * w.r[0] * Math.cos(a), y = w.r[1] * Math.sin(a) - w.lift;
    g.drawImage(fogImg, w.frame * FOG.wisp.w, FOG.wisp.y, FOG.wisp.w, FOG.wisp.h, Math.round((fx + x - FOG.wisp.w / 2) * zoom), Math.round((fy + y - FOG.wisp.h / 2) * zoom), FOG.wisp.w * zoom, FOG.wisp.h * zoom);
  }
  if (back) return;
  FOG.motes.forEach((m, k) => {
    const a = (t / m.period) * Math.PI * 2 + m.phase;
    const x = (flip ? -1 : 1) * m.c[0] + m.r[0] * Math.cos(a), y = m.c[1] + m.r[1] * Math.sin(a * 2) * 0.6;
    const f = Math.floor(t * FOG.mote.fps + k * 1.7) % FOG.mote.frames, S = FOG.mote.size;
    g.drawImage(fogImg, f * S, FOG.mote.y, S, S, Math.round((fx + x - S / 2) * zoom), Math.round((fy + y - S / 2) * zoom), S * zoom, S * zoom);
  });
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
    const bx = 44, by = 6;
    shadow(g, bx + 32, by + 60, 17, 5); shadow(g, 18, by + 62, 7, 2.4);
    drawFog(g, bx + 32, by + 60, flip, ts, true);
    drawBoss(g, A.col + frame, row, flip, bx, by);
    drawFog(g, bx + 32, by + 60, flip, ts, false);
    g.drawImage(hero, 0, row === 1 ? 32 : row === 2 ? 64 : 0, 32, 32, 2 * zoom, (by + 32) * zoom, 32 * zoom, 32 * zoom);
    g.fillStyle = "#efe6d2"; g.font = (6 * zoom) + "px system-ui"; g.fillText(name, 4 * zoom, 10 * zoom);
  }
}
// ---- умения: связка анимаций по времени и эффекты мира ----
const sbar = document.getElementById("skills");
let skill = null, t0 = 0, marks = [];
for (const s of SKILLS) {
  const b = document.createElement("button");
  b.textContent = s.name + " · замах " + (s.windupMs / 1000).toFixed(1).replace(".", ",") + " с";
  b.onclick = () => { skill = s; t0 = performance.now(); marks = s.id === "spore_rain" ? sporeMarks() : []; };
  sbar.appendChild(b);
}
const BX = 178, BY = 60, FOOT = [BX + 32, BY + 60];
const HEROES = [[FOOT[0] - 130, FOOT[1] + 50], [FOOT[0] + 150, FOOT[1] + 40], [FOOT[0] + 40, FOOT[1] + 90]];
function sporeMarks() {
  const out = [];
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + Math.random() * 0.5, d = 50 + Math.random() * 100; out.push([FOOT[0] + Math.cos(a) * d, FOOT[1] + Math.sin(a) * d * 0.8, 0.2 + i * 0.12]); }
  return out;
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
/** Кадр связки эффекта: первая часть один раз, удержание по кругу, удар — так, чтобы кадр hit пришёлся на hitAt (мс от начала). */
function chainFrame(A, B, C, t, hitAt) {
  const tc = hitAt - (C.hit / C.fps) * 1000;
  if (t < 0) return -1;
  const tA = (A.n / A.fps) * 1000;
  if (t < Math.min(tA, tc)) return A.col + Math.floor((t / 1000) * A.fps);
  if (t < tc) return B.col + (Math.floor(((t - tA) / 1000) * B.fps) % B.n);
  const k = Math.floor(((t - tc) / 1000) * C.fps);
  return k < C.n ? C.col + k : -1;
}
function tele(g, f) { g.fillStyle = "rgba(90,200,120,.25)"; g.strokeStyle = "#5ad08a"; g.lineWidth = zoom; f(); g.fill(); g.stroke(); }
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  const t = skill ? ts - t0 : -1;
  const warn = skill && t >= 0 && t < skill.windupMs;
  const target = HEROES[1];
  const ang = Math.atan2(target[1] - FOOT[1], target[0] - FOOT[0]);
  if (skill && skill.id === "gaze_beam" && warn) tele(g, () => { g.beginPath(); g.moveTo(FOOT[0] * zoom, FOOT[1] * zoom); g.arc(FOOT[0] * zoom, FOOT[1] * zoom, skill.r * zoom, ang - skill.arc / 2 * Math.PI / 180, ang + skill.arc / 2 * Math.PI / 180); g.closePath(); });
  if (skill && skill.id === "miasma" && warn) for (const h of HEROES) tele(g, () => { g.beginPath(); g.arc(h[0] * zoom, h[1] * zoom, skill.r * zoom, 0, 7); });
  if (skill && skill.id === "spore_rain" && warn) for (const m of marks) tele(g, () => { g.beginPath(); g.arc(m[0] * zoom, m[1] * zoom, skill.r * zoom, 0, 7); });
  const fxLayer = (row) => {
    if (!skill) return;
    if (skill.id === "miasma") {
      const A = MIA.anims, f = chainFrame(A.settle, A.hold, A.burst, t, skill.windupMs);
      if (f >= 0) for (const h of HEROES) g.drawImage(miaImg, f * MIA.frame[0], row * MIA.frame[1], MIA.frame[0], MIA.frame[1], (h[0] - MIA.center[0]) * zoom, (h[1] - MIA.center[1]) * zoom, MIA.frame[0] * zoom, MIA.frame[1] * zoom);
    }
    if (skill.id === "spore_rain") for (const m of marks) {
      const A = SPO.anims, f = chainFrame(A.fall, A.lie, A.burst, t - m[2] * 1000, skill.windupMs - m[2] * 1000);
      if (f >= 0) g.drawImage(spoImg, f * 64, row * 64, 64, 64, (m[0] - SPO.center[0]) * zoom, (m[1] - SPO.center[1]) * zoom, 64 * zoom, 64 * zoom);
    }
  };
  fxLayer(0);
  shadow(g, FOOT[0], FOOT[1], 17, 5);
  drawFog(g, FOOT[0], FOOT[1], false, ts, true);
  drawBoss(g, skill ? bossFrameAt(skill, t) : ANIMS.idle.col + (Math.floor(ts / 1000 * 12) % 12), 0, false, BX, BY);
  drawFog(g, FOOT[0], FOOT[1], false, ts, false);
  for (const h of HEROES) { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); }
  fxLayer(1);
  // луч: от глаза к цели — начало, тайлы, конец (поворот холста, ближайший сосед)
  if (skill && skill.id === "gaze_beam") {
    const k = Math.floor(((t - skill.windupMs) / 1000) * BEAM.fps) + BEAM.hit;
    if (k >= 0 && k < BEAM.n) {
      const ex = BX + EYE.down[0], ey = BY + EYE.down[1];
      const tx = FOOT[0] + Math.cos(ang) * skill.r, ty = FOOT[1] + Math.sin(ang) * skill.r - 14;
      const len = Math.hypot(tx - ex, ty - ey), an = Math.atan2(ty - ey, tx - ex);
      const W = BEAM.frame[0], H = BEAM.frame[1], ox = BEAM.origin[0], oy = BEAM.origin[1];
      g.save(); g.translate(ex * zoom, ey * zoom); g.rotate(an); g.translate(-ox * zoom, -oy * zoom);
      g.drawImage(beamImg, k * W, BEAM.rows.start * H, W, H, 0, 0, W * zoom, H * zoom);
      const end = len - W + ox;
      for (let x = W; x < end; x += W) { const w = Math.min(W, end - x); g.drawImage(beamImg, k * W, BEAM.rows.body * H, w, H, x * zoom, 0, w * zoom, H * zoom); }
      g.drawImage(beamImg, k * W, BEAM.rows.end * H, W, H, end * zoom, 0, W * zoom, H * zoom);
      g.restore();
    }
  }
  if (skill && t > skill.windupMs + 3000) skill = null;
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

/** Всё для утверждения: листы анимаций, общий лист, эффекты мира, туман, монтажи и страница просмотра. */
export function writeFogTreantArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => {
    const f = path.join(outDir, name);
    c.save(f);
    files.push(f);
    return c;
  };
  const sheets = {} as Record<FogAnim, PC>;
  for (const a of Object.keys(FOG_TREANT_ANIMS) as FogAnim[]) sheets[a] = save(buildFogTreantAnim(a), `${ID}-${a}.png`);
  const sheet = save(buildFogTreantSheet(sheets), `${ID}-sheet.png`);
  const fx = {
    beam: save(buildBeamFx(), `${ID}-beamfx.png`),
    miasma: save(buildMiasmaFx(), `${ID}-miasmafx.png`),
    spore: save(buildSporeFx(), `${ID}-sporefx.png`),
    fog: save(buildFogSprite(), `${ID}-fog.png`),
  };
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "bosses", "14.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  save(buildPreview(sheets, fx, hero, terrain), `${ID}-preview.png`);
  save(buildCompare(sheets, ref), `${ID}-compare.png`);
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "zone-bosses.json"), "utf8")) as { bosses: { id: string; abilities: CardSkill[] }[] };
  const skills = (data.bosses.find((b) => b.id === ID)?.abilities ?? []).map(({ id, name, windupMs, r, arc, count, spread, at }) => ({ id, name, windupMs, r, arc, count, spread, at }));
  const html = path.join(outDir, `${ID}.html`);
  fs.writeFileSync(html, buildHtml(sheet, fx, hero, terrain, skills), "utf8");
  files.push(html);
  return files;
}
