/**
 * Босс зоны (задача 136, шаг 3): поганище Многорот — Умбрат, Гнилые топи, 30–40 (data/zone-bosses.json,
 * id umb_marsh_abomination; образец tools/out/refs/bosses/20.png — только для сравнения, в игру и в git не идёт).
 * Тем же способом и на том же уровне, что пилот-древень (tools/gen/zone-bosses-art.ts): скелет в 3D с IK, тело — объёмные
 * примитивы в поле расстояний, луч на пиксель (наклон камеры 14°), свет сверху слева → 5 тонов на материал, контур 1 px.
 * В игру пока не подключён: механика — шаг 4.
 *
 * Лист: кадр 64×64, пиксель листа = пиксель мира; строки 0 — вниз, 1 — вверх, 2 — вбок вправо (влево — отражение);
 * столбцы — анимации подряд (ABOM_ANIMS). Ступни на y = 60. Сгорбленная туша: рост с шипами ≈ 46 px, ширина с лапами ≈ 46 px —
 * вдвое массивнее героя 32×32, меньше рейд-босса.
 *
 * Сшит из разных тел: туловище — заплаты мясисто-бурой и тёмной бурой трупной шкуры (у каждой заплаты свой номер patch), по границе
 * заплат — тёмно-зелёный шов 1 px со стежками через 3 px; стежки привязаны к телу (якорь детали), поэтому при сдвиге на
 * целый пиксель не ползут. Правая лапа — толстая, мясная; левая — тоньше, из трупной шкуры. Шипы на горбу, когти по три.
 * Пасти — штампы в целых пикселях: большая на брюхе (15 px), две малые (на правом плече и на левом боку со спины),
 * ухмылка головы; раскрытие 0–3 ступенями (0 — сомкнутые зубы-иглы, 3 — настежь, со слюной). Корпус и голова в покое и
 * ходьбе сдвигаются только на целые пиксели (snapPx) — швы и пасти не «кипят»; заново считаются лапы и ноги.
 * «Трупный газ»: швы разгораются ядовито-зелёным, туша раздувается, газ бьёт из швов клубами.
 *
 * Эффекты мира — отдельные листы: umb_marsh_abomination-mawfx.png («Пасти из топи»: кадр 96×96, пасть раскрывается из
 * трясины под героем, кусает, раскрывается вдвое шире и кусает снова; строка 0 — под юнитами, 1 — над ними) и
 * -gasfx.png (клуб трупного газа 64×64, клиент ставит его по кольцу 120–320 px; строка 0 — стелющаяся дымка, 1 — клуб).
 *
 * Запуск: npx tsx tools/gen/zone-bosses.ts art → tools/out/zone-bosses/umb_marsh_abomination-*.png и umb_marsh_abomination.html.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "./canvas";

const ID = "umb_marsh_abomination";
const N = 64;
const CX = 32, GY = 60;
const CAM = (14 * Math.PI) / 180;
const CS = Math.cos(CAM), SN = Math.sin(CAM);
const PX = 1 / CS;

type ZView = "down" | "up" | "side";
const VIEWS: ZView[] = ["down", "up", "side"];

// ---------------- палитра ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Мясисто-бурая шкура: тени краснее, свет теплее (мокрый блик — только верхний тон). */
const FLESH = R("#2a120f", "#53241a", "#7d3b26", "#a75c35", "#d08c55");
/** Тёмная трупная шкура (заплаты, ноги, левая лапа) — «чужое» тело: бурая с синюшным отливом, холоднее мяса, но не серая. */
const HIDE = R("#150f12", "#291d21", "#403035", "#5a4647", "#786261");
/** Кость: зубы, когти, шипы. */
const BONE = R("#2c261d", "#5f553f", "#9c8f6e", "#d3c8a3", "#f4eed9");
/** Швы: тёмно-зелёная щель, стежки светлее. */
const SEAM = R("#0d1a10", "#1d3923", "#3b603b");
/** Пасть изнутри: глубина → дёсны. */
const MAW = R("#0e0508", "#2c0b11", "#5a1820", "#8e2d31", "#bb5548");
/** Ядовито-зелёный газ и слюна. */
const GAS = R("#1b2e17", "#36561f", "#5c8a2c", "#93bc48", "#cfe68c");
/** Глаза: болотный жёлто-зелёный. */
const EYE = R("#5c6c10", "#a8c42c", "#e2fa6a", "#fbffd2");
/** Гибель: шкура сереет и буреет. */
const DEADF = R("#181412", "#2a2420", "#3e362e", "#544a3e", "#6e6352");
/** Трясина: брызги и комья (плоские, непрозрачные, низ тёмный). */
const DUST = R("#1d1b12", "#353222", "#504b32", "#6d6644");
const MUD = R("#141209", "#2a2615", "#423c20", "#5e562e", "#7e7440");
/** След когтей: бледная кость, без полупрозрачности. */
const SMEAR = R("#7a7860", "#bdbb98", "#ecebd2");
const FLASH = R("#a8c048", "#e8f4a8", "#fbffee");
const OUT = hex("#120a0b");

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

/** Поворот вектора: крен (вокруг Y, верх уходит вправо), наклон (вокруг X, верх уходит вперёд), разворот (вокруг Z, правый бок вперёд). */
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
/** Составляющая v, перпендикулярная оси. */
function perp(axis: V3, v: V3): V3 {
  const w = norm(axis);
  const q = sub(v, mul(w, dot(v, w)));
  return vlen(q) < 1e-3 ? norm(cross(w, Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])) : norm(q);
}
/** Две кости из A в B, локоть/колено в сторону pole (как у рейд-босса). */
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
/** Модель → вид: Xv вправо по экрану, Yv к зрителю, Zv вверх. Вниз — лицом к зрителю, вверх — спиной, вбок — лицом вправо. */
function toView(view: ZView, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
function fromView(view: ZView, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
const scr = (p: V3): [number, number] => [CX + p[0], GY + SN * p[1] - CS * p[2]];
/** Глубина вдоль луча: меньше — ближе к зрителю. */
const depthOf = (p: V3) => -(CS * p[1] + SN * p[2]);
/** Свет сверху слева и чуть спереди (в пространстве вида). */
const LIGHT: V3 = norm([-0.58, 0.42, 0.7]);
/**
 * Сдвиг в мире → сдвиг ровно на целые пиксели кадра в этом виде (без составляющей вдоль луча). Ортографическая камера:
 * тело, сдвинутое на целый пиксель, даёт тот же рисунок, сдвинутый на пиксель, — кора и лицо не перерисовываются.
 */
function snapPx(view: ZView, w: V3): V3 {
  const v = toView(view, w);
  const sx = Math.round(v[0]), sy = Math.round(SN * v[1] - CS * v[2]);
  return fromView(view, [sx, 0, -sy * PX]);
}
/** Сдвиг на целые пиксели кадра [вправо, вниз] → мир. */
const pxToWorld = (view: ZView, dx: number, dy: number): V3 => fromView(view, [dx, 0, -dy * PX]);

// ---------------- материалы и примитивы ----------------
const M_FLESH = 0, M_HIDE = 1, M_BONE = 2;
interface MatDef { ramp: Ramp; base: number; gain: number; lo: number; hi: number }
/** Тон = base + gain·(n·L), как у пилота: к зрителю — середина, к свету — свет, блик — только у направления света. */
const MATS: MatDef[] = [
  { ramp: FLESH, base: 1.45, gain: 2.4, lo: 1, hi: 4 },
  { ramp: HIDE, base: 1.5, gain: 2.4, lo: 1, hi: 4 },
  { ramp: BONE, base: 1.8, gain: 2.2, lo: 1, hi: 4 },
];

interface Prim {
  /** 0 — конус со скруглёнными концами (шар, если a = b), 1 — эллипсоид */
  k: number;
  a: V3; b: V3; ra: number; rb: number;
  ax: [V3, V3, V3]; r: V3;
  mat: number; g: number; part: number;
  /** заплата: по границе двух заплат одной группы — шов со стежками (−1 — без швов) */
  patch: number;
  tone: number; ref: V3;
  /** якорь жёсткого слоя (мир): стежки шва и складки считаются от него — при сдвиге на целый пиксель не ползут */
  anc: V3;
  /** складки мяса поперёк туши: шаг в px (0 — без складок) */
  fold: number;
  sph: boolean; ba: V3; l2: number; rr: number; a2: number; il2: number; len: number; bc: V3; br: number;
}
interface Opt { mat?: number; part?: number; patch?: number; tone?: number; anc?: V3; fold?: number }

/** Штамп: пасть (ширина w, раскрытие 0–3; profile — вид сбоку, от уголка к переднему краю) или глаза. */
interface Stamp { kind: "mouth" | "eyes"; at: V3; n: V3; g: number; w?: number; open?: number; profile?: boolean; drool?: boolean; glow?: number }
interface Mote { p: V3; col: RGBA; dark?: RGBA; size?: number }
interface Puff { c: V3; k: number; seed: number }
/** Клуб газа у тела (мир), радиус в px кадра. */
interface GasPuff { c: V3; r: number; seed: number }

class Scene {
  prims: Prim[] = [];
  gk: number[] = [];
  stamps: Stamp[] = [];
  motes: Mote[] = [];
  puffs: Puff[] = [];
  gas: GasPuff[] = [];
  /** точки и нормали пастей (мир) — для брызг слюны */
  mouths: [V3, V3][] = [];
  smears: { pts: V3[]; arm: number }[] = [];
  flash: { at: V3; k: number } | null = null;
  armG: [number, number] = [-1, -1];
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
      mat: o.mat ?? M_FLESH, g, part: o.part ?? g, patch: o.patch ?? -1, tone: o.tone ?? 0, ref: perp(ax, [0, 1, 0.01]), anc: o.anc ?? [0, 0, 0], fold: o.fold ?? 0,
      sph: false, ba: [0, 0, 0], l2: 0, rr: 0, a2: 0, il2: 0, len: 0, bc: a, br: 0,
    });
  }
  ball(g: number, c: V3, r: number, o: Opt = {}): Prim {
    return this.cone(g, c, r, c, r, o);
  }
  ell(g: number, c: V3, r: V3, ax: [V3, V3, V3], o: Opt = {}): Prim {
    return this.push({
      k: 1, a: c, b: c, ra: 0, rb: 0, ax, r,
      mat: o.mat ?? M_FLESH, g, part: o.part ?? g, patch: o.patch ?? -1, tone: o.tone ?? 0, ref: ax[0], anc: o.anc ?? [0, 0, 0], fold: o.fold ?? 0,
      sph: false, ba: [0, 0, 0], l2: 0, rr: 0, a2: 0, il2: 0, len: 0, bc: c, br: 0,
    });
  }
  newPart() {
    return 1000 + this.parts++;
  }
}

/** Примитив в пространство вида (null — уже в нём, как у эффекта мира) + производные для поля расстояний. */
function prepare(q: Prim, view: ZView | null) {
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
    // одна сфера внутри другой: остаётся бóльшая
    if (q.ra < q.rb) q.a = q.b;
    q.ra = Math.max(q.ra, q.rb);
  }
  q.il2 = q.sph ? 0 : 1 / q.l2;
  q.bc = q.sph ? q.a : lerpV(q.a, q.b, 0.5);
  q.br = q.sph ? q.ra : q.len / 2 + Math.max(q.ra, q.rb);
}
/** Крупная форма: ей одной даётся светлая кромка к свету. */
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
  // конус со скруглёнными концами (И. Квилес)
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
/** Поле сцены по кандидатам (идут по группам): внутри группы — гладкое слияние, между группами — минимум; земля срезает всё ниже z = 0. */
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
  /** сдвиг тела: x — вправо, y — вперёд (в кадре — на целые пиксели) */
  root: V3;
  /** таз выше/ниже покоя (мир; в кадре — на целые пиксели) */
  bob: number;
  /** дыхание: подъём груди с плечами и головы сверх груди — целые пиксели кадра */
  chest: number; headZ: number;
  /** корпус: наклон вперёд, разворот, крен (рад); голова относительно корпуса */
  pitch: number; yaw: number; roll: number;
  hp: number; hy: number; hr: number;
  /** запястья в мире [правое, левое]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** щиколотки в мире и наклон ступни */
  foot: [V3, V3]; toe: [number, number];
  /** подъём лапы целиком — целые пиксели кадра («дрожь» в удержании без пересчёта лапы) */
  armLift: [number, number];
  /** раскрытие пастей 0–3 (ступени): брюхо, правое плечо, левый бок; ухмылка головы; слюна */
  open: number; openR: number; openL: number; grin: number; drool: number;
  /** свечение глаз; свечение швов (газ) 0..1.5; раздутие 0..1.2; когти растопырены; когти в землю */
  glow: number; seamGlow: number; swell: number; claw: number; dig: number;
  /** брызги от шага [пр, лев]; вспышка удара; комья трясины у кистей; газ из швов (размер и возраст 0..1); слюна 0..1; увядание */
  dust: [number, number]; flash: number; clods: number; gas: number; gasT: number; spit: number; wither: number;
  trail?: V3[]; trailArm?: number; trail2?: V3[];
  puff?: number;
  t: number; seed: number;
}

const REST_HAND: [V3, V3] = [[18.2, 8.0, 8.6], [-17.6, 7.4, 8.6]];
const REST: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.24, yaw: 0, roll: 0, hp: -0.05, hy: 0, hr: 0,
  hand: REST_HAND, pole: [[0.9, -1, 0.1], [-0.9, -1, 0.1]],
  foot: [[8.2, 1.4, 3.4], [-8.2, -0.8, 3.4]], toe: [0, 0], armLift: [0, 0],
  open: 1, openR: 1, openL: 1, grin: 1, drool: 1,
  glow: 0.8, seamGlow: 0, swell: 0, claw: 0, dig: 0,
  dust: [0, 0], flash: 0, clods: 0, gas: 0, gasT: 0, spit: 0, wither: 0, t: 0, seed: 1,
};

const HIP0 = 15;
/** Длины костей лапы: плечо, предплечье (кисть на земле — ходит на костяшках). */
const ARM: [number, number] = [12.5, 13.5];
/** Центр раздутия туши (координаты корпуса). */
const SW0: V3 = [0, 1, 27];
/** Точки на швах, откуда бьёт газ (координаты корпуса) и нормаль наружу. */
const GAS_SPOTS: [V3, V3][] = [
  [[-5.5, 11.0, 26.5], [-0.3, 1, 0.1]],
  [[6.5, 10.6, 25.0], [0.4, 1, 0]],
  [[10.0, 3.0, 40.0], [0.4, 0.2, 1]],
  [[-9.0, -1.0, 39.0], [-0.4, 0, 1]],
  [[0, -11.0, 30.0], [0, -1, 0.3]],
  [[-12.0, 3.0, 22.0], [-1, 0.2, 0]],
  [[12.0, 3.0, 20.0], [1, 0.2, 0]],
  [[2.0, 4.0, 41.0], [0, 0, 1]],
];

/** Вбок: сдвиг опорных кистей вперёд [ближняя, дальняя], направление локтей, доворот корпуса к зрителю. */
const SIDE_FWD: [number, number] = [-12, 8], SIDE_POLE: [V3, V3] = [[0.5, -1, 0.5], [-0.4, 1, 0.3]];
const SIDE_YAW = -0.22;
/**
 * Вбок: корпус и голова чуть повёрнуты к зрителю — видно брюхо с пастью в профиль и морда; корпус наклонён вперёд.
 * Опорные кисти (у земли): ближняя толстая лапа отведена назад (не закрывает брюхо, между ней и брюхом видны ноги),
 * дальняя — вперёд, под пастью брюха.
 */
function sidePose(p0: Pose): Pose {
  const ground = (h: V3) => 1 - smooth(12, 20, h[2]);
  const fwd = (i: number): V3 => {
    const h = p0.hand[i];
    return [h[0], h[1] + SIDE_FWD[i] * ground(h), h[2]];
  };
  const pole = (i: number): V3 => norm(lerpV(p0.pole[i], SIDE_POLE[i], ground(p0.hand[i])));
  return { ...p0, yaw: p0.yaw + SIDE_YAW, hy: p0.hy - 0.3, pitch: p0.pitch + 0.06, hand: [fwd(0), fwd(1)], pole: [pole(0), pole(1)] };
}

/** Длина морды-пасти (полуось вперёд). */
const SNOUT_L = 5.6;
/** Многорот в координатах модели. */
function abom(p0: Pose, view: ZView): Scene {
  const S = new Scene();
  // вбок: корпус и голова чуть повёрнуты к зрителю (три четверти) — видны брюхо с пастью и морда
  const p: Pose = view === "side" ? sidePose(p0) : p0;
  const pel: V3 = add([0, 0, HIP0], snapPx(view, [p.root[0], p.root[1], p.bob + p.root[2]]));
  const up = p.chest * PX, hz = p.headZ * PX;
  const sw = 1 + 0.12 * p.swell;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  /** Точка корпуса: верх (выше 27) поднимается при вдохе целиком — жёстко, без растяжения. */
  const T = (v: V3, lift = v[2] >= 27): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  /** Раздутие: точка корпуса отодвигается от центра туши. */
  const SW = (v: V3): V3 => add(SW0, mul(sub(v, SW0), sw));
  const PV = (v: V3): V3 => add(pel, rot(sub(v, [0, 0, HIP0]), 0, p.yaw * 0.35, p.roll * 0.5));
  const NECK: V3 = [0, 6, 33];
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, 0, roll)), f(rot([0, 1, 0], pitch, 0, roll)), f(rot([0, 0, 1], pitch, 0, roll)),
  ];
  const ancLo: V3 = pel, ancHi: V3 = add(pel, [0, 0, up]), ancHead: V3 = add(pel, [0, 0, up + hz]);
  const sides: [number, number][] = [[0, 1], [1, -1]];

  // ---------- туловище: вздутая туша из заплат ----------
  const gBody = S.group(2.6);
  const tor = (c: V3, r: V3, mat: number, patch: number, tone = 0) =>
    S.ell(gBody, T(SW(c), c[2] >= 27), mul(r, sw) as V3, axes(TV), { mat, patch, tone, anc: c[2] >= 27 ? ancHi : ancLo, fold: mat === M_FLESH ? 4.2 : 0 });
  tor([0, 3.4, 30.6], [12.6, 8.8, 9.0], M_FLESH, 1);
  tor([0, 4.8, 21.0], [11.0, 8.2, 7.8], M_FLESH, 2, -0.2);
  // брюхо: вываливается вперёд мешком — сбоку туша подаётся вперёд, на нём большая пасть
  tor([0, 9.8, 21.6], [8.6, 6.2, 6.8], M_FLESH, 2, 0.05);
  tor([0, -5.6, 31.6], [10.6, 7.4, 8.4], M_FLESH, 3, -0.25);
  // горб: мясной вал над лопатками — выпирает назад и вверх, на нём шипы
  tor([0, -8.0, 37.0], [7.6, 6.0, 5.4], M_FLESH, 10, -0.1);
  tor([-6.4, -6.6, 22.4], [4.6, 4.2, 5.2], M_FLESH, 9, 0.15);
  // наросты: ломают гладкий овал силуэта
  const lumps: [V3, number, number, number][] = [
    [[13.6, 2.0, 30.6], 3.2, M_FLESH, 5], [[-12.8, 1.0, 27.6], 2.8, M_FLESH, 7], [[9.4, 7.8, 31.6], 2.6, M_FLESH, 1],
    [[-10.0, -4.4, 37.0], 3.0, M_HIDE, 6], [[8.0, -7.8, 33.0], 2.8, M_HIDE, 11], [[-4.6, 9.0, 16.6], 2.6, M_FLESH, 2],
  ];
  for (const [c, r, mat, patch] of lumps) S.ball(gBody, T(SW(c), c[2] >= 27), r * sw, { mat, patch, anc: c[2] >= 27 ? ancHi : ancLo });
  S.cone(gBody, PV([0, -1.2, 15.4]), 8.6, T(SW([0, -1.6, 23.0])), 9.6 * sw, { mat: M_FLESH, patch: 4, tone: -0.35, anc: ancLo });
  tor([10.8, 1.0, 34.4], [6.6, 6.4, 6.0], M_FLESH, 5, 0.2);
  tor([-10.6, -0.4, 33.4], [6.0, 6.0, 5.4], M_HIDE, 6);
  tor([-7.6, 5.4, 23.4], [4.6, 4.6, 5.6], M_FLESH, 7, 0.3);
  tor([7.0, -6.2, 25.8], [4.4, 4.0, 5.0], M_FLESH, 8, 0.1);

  // ---------- ноги: короткие, толстые, кривые; по три когтя ----------
  for (const [i, s] of sides) {
    const g = S.group(1.6);
    const hip = PV([s * 6.4, -0.6, 15.6]);
    const an = p.foot[i];
    const kn = ik(hip, an, 7.0, 7.2, [s * 0.5, 1, 0.1]);
    S.cone(g, hip, 5.2, kn, 4.4, { mat: M_HIDE, patch: 30 });
    S.cone(g, kn, 4.2, an, 3.6, { mat: i === 0 ? M_HIDE : M_FLESH, patch: 31, tone: 0.1 });
    const tp = p.toe[i];
    const fc = add(an, rot([0, 1.4, -1.6], tp, 0));
    S.ell(g, fc, [4.0, 5.0, 2.4], axes((v) => v, 0, tp), { mat: i === 0 ? M_HIDE : M_FLESH, patch: 31 });
    [-2.2, 0, 2.2].forEach((o) => {
      const b0 = add(fc, [o, 3.4, -0.2]);
      S.cone(g, b0, 1.15, add(b0, [o * 0.3, 2.6, -1.2]), 0.45, { mat: M_BONE, part: S.newPart() });
    });
  }

  // ---------- лапы: правая — толстая мясная, левая — тоньше, трупная; кисть с тремя крючьями-когтями ----------
  for (const [i, s] of sides) {
    const big = i === 0;
    // вбок ближняя (толстая) лапа чуть тоньше: не заслоняет брюхо и ноги
    const kk = big ? (view === "side" ? 0.95 : 1.12) : 0.9;
    const mat = big ? M_FLESH : M_HIDE;
    const g = S.group(1.3);
    S.armG[i] = g;
    const lift = pxToWorld(view, 0, -p.armLift[i]);
    const sh = add(T(SW([s * 12.4, 0.8, 33.4]), true), lift);
    const wr = add(p.hand[i], lift);
    const el = ik(sh, wr, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, sh, 4.6 * kk, el, 3.6 * kk, { mat, patch: 20 });
    S.cone(g, el, 3.8 * kk, wr, 4.9 * kk, { mat, patch: 21, tone: big ? -0.1 : 0.2 });
    const dir = norm(sub(wr, el));
    const e0 = perp(dir, TV([s, 0.5, 0]));
    const hc = add(wr, mul(dir, 2.0));
    const pH = S.newPart();
    S.ell(g, hc, [4.0 * kk, 3.4 * kk, 3.5 * kk], [e0, cross(dir, e0), dir], { mat, part: pH, patch: 21 });
    [-1.9, 0, 1.9].forEach((o) => {
      const b0 = add(hc, add(mul(dir, 2.2 * kk), mul(e0, o * kk)));
      let fd = norm(add(dir, mul(e0, o * (0.12 + 0.28 * p.claw))));
      if (p.dig > 0) fd = norm(lerpV(fd, [0, 0, -1], 0.7 * p.dig));
      const L = (big ? 4.8 : 3.8) + 1.4 * p.claw + 2.5 * p.dig;
      const hook = mul(perp(fd, TV([0, 1, -0.2])), big ? 1.8 : 1.4);
      const m = add(b0, mul(fd, L * 0.55));
      const tip = add(add(b0, mul(fd, L)), hook);
      const pc = S.newPart();
      S.cone(g, b0, big ? 1.4 : 1.2, m, 1.0, { mat: M_BONE, part: pc });
      S.cone(g, m, 1.0, tip, 0.45, { mat: M_BONE, part: pc });
    });
  }

  // ---------- голова: сгорбленная, низко впереди; лоб-валик, тяжёлая челюсть ----------
  const gHead = S.group(1.2);
  const hd = (x: number, y: number, z: number) => H([x, y, z]);
  S.ell(gHead, hd(0, 8.8, 37.0), [5.2, 4.8, 4.2], axes(HV), { mat: M_FLESH, patch: 40, tone: 0.2, anc: ancHead });
  S.ell(gHead, hd(0, 10.2, 34.2), [5.6, 4.0, 3.0], axes(HV), { mat: M_FLESH, patch: 41, tone: -0.1, anc: ancHead });
  S.cone(gHead, hd(-3.4, 11.8, 38.8), 1.4, hd(3.4, 11.8, 38.8), 1.4, { mat: M_FLESH, part: S.newPart() });
  // морда-пасть: вытянута вперёд и задрана вверх (как у крокодила) — верхняя челюсть над овалом туши, нижняя под ней
  S.ell(gHead, hd(0, 14.4, 36.6), [4.6, SNOUT_L, 2.5], axes(HV, 0, -0.38), { mat: M_FLESH, patch: 42, tone: 0.15, anc: ancHead });
  S.ell(gHead, hd(0, 13.8, 33.6), [4.2, SNOUT_L - 0.6, 1.9], axes(HV, 0, -0.12), { mat: M_FLESH, patch: 41, tone: -0.15, anc: ancHead });

  // ---------- шипы на горбу и плече ----------
  const gSpine = S.group(0.5);
  const spines: [V3, V3, number][] = [
    [[0, -6.0, 41.4], [0, -8.6, 46.6], 1.8],
    [[0, -11.4, 39.4], [0, -15.0, 43.6], 1.8],
    [[0, -13.8, 34.6], [0, -18.2, 37.2], 1.6],
    [[0, -12.6, 28.6], [0, -16.6, 29.6], 1.3],
    [[4.8, -4.0, 39.6], [6.6, -6.2, 44.0], 1.35],
    [[-4.8, -4.0, 39.2], [-6.6, -6.2, 43.4], 1.35],
    [[12.4, -1.6, 39.4], [15.2, -3.2, 43.2], 1.25],
  ];
  for (const [a, b, r] of spines) S.cone(gSpine, T(SW(a), true), r * sw, T(SW(b), true), 0.45, { mat: M_BONE, part: S.newPart() });

  // ---------- пасти и глаза: штампы ----------
  const mouth = (at: V3, n: V3, w: number, open: number, g: number, drool = false, profile = false) => {
    S.stamps.push({ kind: "mouth", at, n, g, w, open, drool, profile });
    S.mouths.push([at, n]);
  };
  // большая пасть на брюхе: в три четверти — уже и смещена к ближнему (правому) боку
  // вбок — в профиль: от переднего края брюха назад
  if (view === "side") mouth(T(SW([2.0, 16.2, 22.4]), false), TV([0.2, 1, 0.05]), 11, p.open, gBody, p.drool > 0.5, true);
  else mouth(T(SW([0, 15.6, 22.6]), false), TV([0, 1, 0.12]), 17, p.open, gBody, p.drool > 0.5);
  mouth(T(SW([11.0, 4.4, 38.4]), true), TV(norm([0.45, 0.45, 0.77])), 9, p.openR, gBody);
  mouth(T(SW([-8.4, -8.6, 33.0]), true), TV(norm([-0.5, -0.7, 0.5])), 9, p.openL, gBody);
  mouth(hd(0, 14.0 + SNOUT_L * 0.8, 35.3), HV([0, 1, 0.15]), view === "side" ? 10 : 13, p.grin, gHead, false, view === "side");
  S.stamps.push({ kind: "eyes", at: hd(0, 12.6, 39.4), n: HV([0, 1, 0.2]), g: gHead, glow: p.glow });

  // ---------- газ из швов ----------
  if (p.gas > 0.04) {
    GAS_SPOTS.forEach(([c, n], k) => {
      const nn = norm(TV(n));
      const at = add(add(T(SW(c)), mul(nn, 1.5 + 7 * p.gasT)), [0, 0, 10 * p.gasT * p.gasT]);
      const r = (1.1 + 3.1 * p.gas) * (1 - 0.25 * p.gasT) * (0.8 + 0.4 * hash01(k, 3, 77));
      S.gas.push({ c: at, r, seed: k });
    });
  }
  particles(S, p);
  return S;
}

/** Частицы: брызги трясины от шага и у кистей, слюна из пастей, след когтей и вспышка. */
function particles(S: Scene, p: Pose) {
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) S.puffs.push({ c: [p.foot[i][0], p.foot[i][1] + 1, 0], k: p.dust[i], seed: i });
  if (p.clods > 0.02) {
    for (let i = 0; i < 2; i++) {
      const hnd = p.hand[i];
      if (hnd[2] > 12) continue;
      const c: V3 = [hnd[0], hnd[1] + 2, 0];
      S.puffs.push({ c, k: p.clods, seed: 10 + i });
      const f = 1 - p.clods;
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI + 0.3 + i * 0.5;
        S.motes.push({
          p: [c[0] + Math.cos(ang) * (2 + 6 * f) * (i ? -1 : 1), c[1] + Math.sin(ang) * 2, 1.5 + 8 * f * (1 - f) * 2.2],
          col: DUST[2], dark: DUST[0], size: 2,
        });
      }
    }
  }
  // слюна: капли летят из пастей наружу и вниз
  if (p.spit > 0.02) {
    const f = 1 - p.spit;
    S.mouths.forEach(([m, n], k) => {
      for (let j = 0; j < 2; j++) {
        const sp = 3 + 6 * f + j * 2.5;
        const side: V3 = [(hash01(k, j, 5) - 0.5) * 3, 0, 0];
        const q = add(add(m, add(mul(n, sp), side)), [0, 0, 3 * Math.sin(Math.PI * Math.min(1, f * 1.3)) - 6 * f * f]);
        if (q[2] < 0.5) continue;
        S.motes.push({ p: q, col: j ? GAS[3] : BONE[4], dark: GAS[1], size: 1 });
      }
    });
  }
  if (p.trail && p.trail.length > 1) S.smears.push({ pts: p.trail, arm: p.trailArm ?? 0 });
  if (p.trail2 && p.trail2.length > 1) S.smears.push({ pts: p.trail2, arm: 1 });
  if ((p.puff ?? 0) > 0.02) {
    const hnd = p.hand[p.trailArm ?? 0];
    S.puffs.push({ c: [hnd[0], hnd[1] + 2, 0], k: p.puff!, seed: 30 });
  }
  if (p.flash > 0.02) {
    const hnd = p.hand[p.trailArm ?? 0];
    S.flash = { at: [hnd[0], hnd[1] + 3, Math.max(1.5, hnd[2] - 4)], k: p.flash };
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

/** Тень от света: луч из точки к свету задевает другие детали. */
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

interface Look { mat: Uint8Array; idx: Int8Array; part: Int32Array; lum: Float32Array; seam: Uint8Array }

function shade(prims: Prim[], gk: number[], gb: GBuf): Look {
  const L: Look = {
    mat: new Uint8Array(N * N), idx: new Int8Array(N * N).fill(-1), part: new Int32Array(N * N).fill(-1),
    lum: new Float32Array(N * N), seam: new Uint8Array(N * N),
  };
  const tone = new Float32Array(N * N);
  const deep = new Uint8Array(N * N);
  const band = new Float32Array(N * N);
  const fok = new Uint8Array(N * N);
  const cand = new Int32Array(prims.length);
  for (let i = 0; i < N * N; i++) {
    const pi = gb.prim[i];
    if (pi < 0) continue;
    const q = prims[pi];
    const n: V3 = [gb.n[i * 3], gb.n[i * 3 + 1], gb.n[i * 3 + 2]];
    const p: V3 = [gb.p[i * 3], gb.p[i * 3 + 1], gb.p[i * 3 + 2]];
    const md = MATS[q.mat];
    const lum = dot(n, LIGHT);
    L.lum[i] = lum;
    let tn = md.base + md.gain * lum + q.tone;
    if (shadowAt(prims, gk, cand, p, n)) tn -= 1.0;
    // затенение складок; где закрыто с обеих проб — глубокая щель
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
    L.mat[i] = q.mat;
    L.part[i] = q.part;
    // складки: кольца поперёк туши (дугой вниз к середине — объём бочки), координаты от якоря детали
    if (q.fold > 0) {
      const l = sub(p, q.anc);
      band[i] = (l[2] - 0.03 * l[0] * l[0]) / q.fold;
      fok[i] = 1;
    }
  }
  // сглаживание тона внутри детали и материала: ровные границы светотени без зубцов
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
  const bgAt = (x: number, y: number) => x < 0 || y < 0 || x >= N || y >= N || gb.prim[y * N + x] < 0;
  const edgeAt = (x: number, y: number) => bgAt(x - 1, y) || bgAt(x + 1, y) || bgAt(x, y - 1) || bgAt(x, y + 1);
  const T2 = new Float32Array(tone);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0) continue;
    const md = MATS[L.mat[i]];
    let tn = tone[i];
    const edge = edgeAt(x, y);
    if (!edge && fok[i] && y > 0 && fok[i - N] && gb.prim[i - N] >= 0 && prims[gb.prim[i - N]].g === prims[gb.prim[i]].g) {
      const b0 = Math.floor(band[i]), b1 = Math.floor(band[i - N]);
      if (b0 !== b1 && tn > 1.6 && tn < 3.4) {
        const [ax] = scr(prims[gb.prim[i]].anc);
        const seg = Math.floor((x - ax + 300) / 5);
        if (hash01(b0, seg, 61) > 0.3) tn -= 1.0;
      }
    }
    if (!edge) {
      // шов между деталями: соседняя деталь ближе к зрителю — тон тени (selout); почти чёрный — только в глубокой щели
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
    // светлая кромка к свету — только у крупных форм, слева и сверху
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
    L.idx[i] = clamp(Math.round(T2[i]), 0, MATS[L.mat[i]].ramp.length - 1);
  }
  // швы-заплаты: граница двух заплат одной группы — щель 1 px; стежки поперёк через 3 px от якоря детали
  const ticks: number[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0 || edgeAt(x, y)) continue;
    const q = prims[gb.prim[i]];
    if (q.patch < 0) continue;
    let hor = false, ver = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (y + dy) * N + x + dx;
      const o = prims[gb.prim[j]];
      if (o.g !== q.g || o.patch < 0 || o.patch <= q.patch) continue;
      if (Math.abs(gb.t[i] - gb.t[j]) > 1.6) continue;
      if (dx) ver = true;
      else hor = true;
    }
    if (!hor && !ver) continue;
    L.seam[i] = 1;
    const [ax, ay] = scr(q.anc);
    const lx = Math.floor(x - ax + 300), ly = Math.floor(y - ay + 300);
    if (hor && lx % 3 === 0) ticks.push(x, y - 1, x, y + 1);
    else if (ver && !hor && ly % 3 === 0) ticks.push(x - 1, y, x + 1, y);
  }
  for (let k = 0; k < ticks.length; k += 2) {
    const x = ticks[k], y = ticks[k + 1];
    if (bgAt(x, y) || edgeAt(x, y)) continue;
    const j = y * N + x;
    if (!L.seam[j]) L.seam[j] = 2;
  }
  despeckle(L, gb);
  return L;
}

/** Одиночный пиксель (ни одного соседа того же тона и материала в 8 направлениях) принимает тон большинства соседей. */
function despeckle(L: Look, gb: GBuf) {
  for (let pass = 0; pass < 2; pass++) {
    const src = new Int8Array(L.idx);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0 || L.seam[i]) continue;
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
  const target = mat === M_BONE ? BONE.map((c, k) => mix(c, DEADF[k], 0.45)) : DEADF;
  return base.map((c, k) => mix(c, target[k], wither * (mat === M_HIDE ? 0.6 : 1)));
}
/** Цвет шва и стежка: тёмно-зелёный; при «трупном газе» — разгорается ядовито-зелёным ступенями. */
function seamColor(kind: number, idx: number, glow: number, wither: number): RGBA {
  let c: RGBA;
  if (glow > 0.15) {
    const lv = glow > 1.2 ? 2 : glow > 0.6 ? 1 : 0;
    c = kind === 1 ? GAS[2 + lv] : GAS[1 + lv];
  } else c = kind === 1 ? SEAM[idx >= 2 ? 1 : 0] : SEAM[idx >= 2 ? 2 : 1];
  return wither > 0 ? mix(c, DEADF[0], wither * 0.5) : c;
}

// ---------------- штампы: пасти и глаза ----------------
type StampPx = [number, number, string];
/**
 * Пасть в целых пикселях (dx вправо, dy вниз от точки привязки). Ключи: K — глубина, G — тёмные дёсны, g — дёсны/язык,
 * W/w — зуб (свет/середина), L/D — губа сверху (свет) и снизу (тень, по материалу под пастью), s/S — слюна.
 * Раскрытие 0 — сомкнутые зубы-иглы через пиксель; 1–3 — щель растёт к середине (у профиля — к переднему краю),
 * зубы сверху и снизу через столбец, длиной 1–2 px.
 */
function mouthPx(w: number, open: number, profile: boolean, drool: boolean): StampPx[] {
  const out: StampPx[] = [];
  const lv = clamp(Math.round(open), 0, 3);
  const H = (w >= 13 ? [0, 3, 5, 7] : w >= 9 ? [0, 2, 3, 5] : [0, 1, 2, 3])[lv];
  const half = (w - 1) / 2;
  for (let c = 0; c < w; c++) {
    const x = profile ? c - (w - 1) : c - half;
    const u = profile ? c / (w - 1) : 1 - Math.abs(x) / (half + 0.5);
    const corner = profile ? c === 0 : Math.abs(x) >= half;
    const hh = corner ? 0 : Math.max(lv > 0 ? 1 : 0, Math.round(H * Math.pow(Math.max(0, u), profile ? 0.7 : 0.6)));
    const upT = c % 2 === 0;
    if (hh <= 0) {
      out.push([x, 0, "K"]);
      if (!corner) {
        out.push([x, -1, upT ? "W" : "L"]);
        out.push([x, 1, upT ? "D" : "w"]);
      }
      continue;
    }
    const top = -Math.floor((hh - 1) / 2), bot = top + hh - 1;
    for (let y = top; y <= bot; y++) out.push([x, y, "K"]);
    // зубы-иглы: сверху и снизу почти в каждом столбце (просвет через 3), длинные клыки — через 3 со сдвигом
    const m3 = c % 3;
    if (m3 !== 2) out.push([x, top, m3 === 0 ? "W" : "w"]);
    if (m3 === 0 && hh >= 4) out.push([x, top + 1, "w"]);
    if (hh >= 2 && m3 !== 0) out.push([x, bot, m3 === 1 ? "w" : "v"]);
    if (hh >= 2 && m3 === 1 && hh >= 4) out.push([x, bot - 1, "W"]);
    // оскал: при широком раскрытии видны дёсны над и под зубами, губы — снаружи
    if (hh >= 3 && lv >= 2) {
      out.push([x, top - 1, "g"]);
      out.push([x, top - 2, "L"]);
      out.push([x, bot + 1, "G"]);
      out.push([x, bot + 2, "D"]);
    } else {
      out.push([x, top - 1, "L"]);
      out.push([x, bot + 1, "D"]);
    }
    if (drool && hh >= 3 && (c === Math.floor(w * 0.3) || c === Math.floor(w * 0.72))) {
      const d0 = bot + (lv >= 2 ? 3 : 2);
      out.push([x, d0, "s"]);
      if (lv >= 3) out.push([x, d0 + 1, "S"]);
    }
  }
  return out;
}
/** Глаза: вниз — два узких под валиком лба; вбок — ближний; вверх — не видны. */
const EYES_DOWN: StampPx[] = [[-3, -1, "d"], [-2, -1, "d"], [2, -1, "d"], [3, -1, "d"], [-3, 0, "e2"], [-2, 0, "e3"], [2, 0, "e3"], [3, 0, "e2"]];
const EYES_SIDE: StampPx[] = [[-1, -1, "d"], [0, -1, "d"], [1, -1, "d"], [0, 0, "e3"], [1, 0, "e2"]];

function drawStamps(body: PC, sc: Scene, view: ZView, gb: GBuf, L: Look, prims: Prim[], wither: number) {
  for (const st of sc.stamps) {
    const a = toView(view, st.at), nv = toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < 0.12) continue;
    const [sx, sy] = scr(a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    const da = depthOf(a);
    if (gb.prim[i0] < 0 || gb.t[i0] < da - 2.4) continue;
    const pxs = st.kind === "eyes" ? (view === "down" ? EYES_DOWN : view === "side" ? EYES_SIDE : []) : mouthPx(st.w!, st.open ?? 0, !!st.profile, !!st.drool);
    const g = clamp(st.glow ?? 1, 0, 1.5);
    for (const [dx, dy, key] of pxs) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (gb.prim[i] < 0) continue;
      // заслонено другой деталью (лапой) — не рисуем
      if (prims[gb.prim[i]].g !== st.g && gb.t[i] < da - 1.5) continue;
      const rmp = rampFor(L.mat[i], wither);
      let c: RGBA;
      switch (key) {
        case "K": c = MAW[0]; break;
        case "G": c = MAW[2]; break;
        case "g": c = MAW[3]; break;
        case "W": c = BONE[4]; break;
        case "w": c = BONE[3]; break;
        case "v": c = BONE[2]; break;
        case "L": c = rmp[clamp(L.idx[i] + 1, 2, 4)]; break;
        case "D": c = rmp[1]; break;
        case "s": c = GAS[3]; break;
        case "S": c = GAS[2]; break;
        case "d": c = FLESH[0]; break;
        default: {
          const k = +key[1] - Math.round((1 - Math.min(1, g)) * 3);
          if (k < 0) continue;
          c = EYE[clamp(k + (g > 1.2 ? 1 : 0), 0, 3)];
        }
      }
      if (wither > 0 && key !== "L" && key !== "D") c = mix(c, DEADF[key === "W" || key === "w" ? 3 : 0], wither * 0.5);
      body.set(x, y, c);
    }
  }
}

/** Кадр Многорота в виде view. */
function renderAbom(view: ZView, pose: Pose): PC {
  const sc = abom(pose, view);
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) {
    prepare(q, view);
    q.anc = toView(view, q.anc);
  }
  const gb = raster(prims, sc.gk);
  const L = shade(prims, sc.gk, gb);
  const body = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    const c = L.seam[i] ? seamColor(L.seam[i], L.idx[i], pose.seamGlow, pose.wither) : rampFor(L.mat[i], pose.wither)[L.idx[i]];
    body.set(i % N, Math.floor(i / N), c);
  }
  drawStamps(body, sc, view, gb, L, prims, pose.wither);
  body.outline(OUT);
  sealPinholes(body);

  // ---------- сборка: тело, след когтей позади лапы, брызги, газ, капли, вспышка ----------
  const out = new PC(N, N);
  out.blit(body, 0, 0);
  for (const sm of sc.smears) drawSmear(out, sm, view, gb, prims, sc.armG[sm.arm]);
  for (const f of sc.puffs) drawPuff(out, f, view);
  for (const gp of sc.gas) drawGas(out, gp, view, gb);
  for (const m of sc.motes) drawMote(out, m, view, gb);
  if (sc.flash) drawFlash(out, sc.flash, view);
  sealPinholes(out, true);
  return out;
}

/** Клуб газа: круг с рваным краем, свет сверху слева, 3–4 тона GAS; за телом не виден. */
function drawGas(o: PC, gp: GasPuff, view: ZView, gb: GBuf) {
  const c = toView(view, gp.c);
  const [cx, cy] = scr(c);
  const dc = depthOf(c);
  const r = gp.r;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
    const d = Math.hypot(dx, dy);
    if (d > 1) continue;
    if (d > 0.72 && hash01(x - Math.floor(cx), y - Math.floor(cy), 50 + gp.seed) < 0.35) continue;
    const i = y * N + x;
    if (gb.prim[i] >= 0 && gb.t[i] < dc - 1) continue;
    const l = -0.6 * dx - 0.8 * dy;
    o.set(x, y, GAS[l > 0.45 && r > 2.5 ? 4 : l > 0.05 ? 3 : l > -0.45 ? 2 : 1]);
  }
}

/**
 * Прозрачные «проколы» внутри силуэта (≤3 px, без выхода к краю кадра по сторонам): у тела — цветом контура, в собранном
 * кадре (между следом, пылью и телом) — цветом большинства соседей.
 */
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
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const tone = dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2;
      o.set(x, y, DUST[tone]);
    }
  }
}

function drawMote(o: PC, m: Mote, view: ZView, gb: GBuf) {
  const p = toView(view, m.p);
  const [sx, sy] = scr(p);
  const x = Math.floor(sx), y = Math.floor(sy);
  if (x < 0 || y < 0 || x >= N - 1 || y >= N - 1) return;
  const i = y * N + x;
  if (gb.prim[i] >= 0 && gb.t[i] < depthOf(p) - 0.5) return; // за телом
  o.set(x, y, m.col);
  if ((m.size ?? 1) > 1) o.set(x + 1, y, m.col);
  if (m.dark) o.set(x + ((m.size ?? 1) > 1 ? 1 : 0), y + 1, m.dark);
}

/**
 * След удара: чёткий серп в 3 тона по пути кулака — позади руки (пиксели самой руки и её контура не трогает),
 * светлая кромка — с внешней стороны дуги, к хвосту серп сужается до пикселя.
 */
function drawSmear(o: PC, sm: { pts: V3[]; arm: number }, view: ZView, gb: GBuf, prims: Prim[], armG: number) {
  const pts = sm.pts.map((v) => scr(toView(view, v)));
  const arm = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && prims[gb.prim[i]].g === armG) arm[i] = 1;
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && arm[yy * N + xx]) return true;
    }
    return false;
  };
  // центр дуги: середина хорды, смещённая к телу — светлая кромка снаружи
  const total = pts.length - 1;
  const put = new Map<number, number>();
  for (let k = 0; k < total; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
    const dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy) || 1;
    let nx = -dy / dl, ny = dx / dl;
    // светлая кромка — снаружи дуги: нормаль от середины тела
    if (nx * (x0 - CX) + ny * (y0 - 38) < 0) { nx = -nx; ny = -ny; }
    for (let s = 0; s <= steps; s++) {
      const u = (k + s / steps) / total;
      const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
      // серп: от хвоста в пиксель — шире к кулаку, у самого кулака его закрывает рука
      const w = 0.4 + 2.0 * Math.sin(Math.PI * Math.min(1, u * 0.62 + 0.06));
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
    o.set(x, y, SMEAR[tone]);
  }
}

/** Вспышка удара: один кадр, крестом с короткими лучами по диагоналям — непрозрачные пиксели в 3 тона. */
function drawFlash(o: PC, f: { at: V3; k: number }, view: ZView) {
  const [sx, sy] = scr(toView(view, f.at));
  const x = Math.floor(sx), y = Math.floor(Math.min(sy, 61));
  const L = Math.round(2 + 3 * f.k);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 2 : r <= L - 1 ? 1 : 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) o.set(x + dx * r, y + dy * Math.min(r, 2), FLASH[tone]);
  }
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (f.k > 0.5) o.set(x + dx * 2, y + dy, FLASH[0]);
  o.set(x, y, FLASH[2]);
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
/** Поза в дробном кадре f: ключевые позы с плавными переходами (ease на входе в ключ). */
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
/** Целые пиксели: смещения корпуса и головы в позах всегда целые — без «ползущих» пикселей. */
const ipx = (v: number) => Math.round(v);

/**
 * Покой: дыхание волной снизу вверх — грудь с плечами поднимается на 1 px, голова кадром позже; пасти «жуют» вразнобой
 * ступенями (брюхо 1→2→1→0, плечо и бок — со сдвигом фазы), со слюной; глаза мерцают. Всё — на целые пиксели.
 */
function idlePoses(n = 12): Pose[] {
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const big = [1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 0, 0];
  const r = [0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 0];
  const l = [1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n, ph = t * TAU;
    return {
      ...REST, t, seed: 100 + i,
      chest: chest[i], headZ: head[i] - chest[i], open: big[i], openR: r[i], openL: l[i],
      glow: 0.8 + 0.2 * Math.sin(ph),
    } as Pose;
  });
}

/**
 * Ходьба: тяжёлая перевалка на костяшках. Корпус с головой — жёсткий слой: проседает после касания и перевешивается на
 * опорную ногу ровно на целые пиксели; лапа идёт вместе с противоположной ногой (как у гориллы), брызги — при касании.
 */
function walkPoses(n = 12): Pose[] {
  const A = 4.4, LIFT = 3.6, DUTY = 0.56;
  const footAt = (u: number) => {
    u = ((u % 1) + 1) % 1;
    if (u < DUTY) return { y: A - (2 * A * u) / DUTY, z: 0, toe: 0, strike: u < 0.2 ? 1 - u / 0.2 : 0 };
    const s = (u - DUTY) / (1 - DUTY);
    return { y: -A + 2 * A * easeInOut(s), z: LIFT * Math.sin(Math.PI * s), toe: 0.3 * Math.sin(Math.PI * s), strike: 0 };
  };
  const bob = [-1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0];
  const sway = [0, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1];
  const r = [1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1];
  const l = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const fr = footAt(t), fl = footAt(t + 0.5);
    const handAt = (f: { y: number; z: number }, s: number, x0: number): V3 => [s * x0 + sway[i], 8.0 + f.y * 1.1, 8.6 + f.z * 1.1];
    return {
      ...REST, t, seed: 150 + i,
      root: [ipx(sway[i]), 0, 0], bob: bob[i] * PX,
      hand: [handAt(fl, 1, 18.2), handAt(fr, -1, 17.6)],
      foot: [[8.2, 0.4 + fr.y, 3.4 + fr.z], [-8.2, 0.4 + fl.y, 3.4 + fl.z]], toe: [fr.toe, fl.toe],
      open: 1, openR: r[i], openL: l[i],
      dust: [fr.strike, fl.strike],
    } as Pose;
  });
}

/**
 * Удар правой лапой: замах вверх-в-сторону, когти растопырены, пасти скалятся; быстрый удар сверху наискосок к цели,
 * след когтей — серп позади лапы, кадр вспышки и брызги трясины; отдача и возврат.
 */
function attackPoses(view: ZView): Pose[] {
  const ready: Partial<Pose> = {};
  const up: Partial<Pose> = {
    yaw: -0.3, pitch: 0.1, roll: -0.04, bob: 1 * PX, hp: -0.2,
    hand: [[18.0, -2.0, 42.0], [-17.6, 9.0, 8.6]], pole: [[1, -0.3, 0.5], [-0.9, -1, 0.1]], claw: 1, open: 2, grin: 2, glow: 1.1,
  };
  const peak: Partial<Pose> = { ...up, yaw: -0.36, hand: [[19.0, -3.0, 44.0], [-17.6, 9.4, 8.6]], open: 2 };
  const hitHand: V3 = view === "side" ? [8.0, 17.0, 9.0] : view === "up" ? [9.0, 13.0, 9.0] : [6.0, 15.0, 9.0];
  const mid: Partial<Pose> = {
    yaw: 0.08, pitch: 0.3, bob: -1 * PX, hp: -0.12,
    hand: [[23.0, 12.0, 30.0], [-17.6, 6.0, 8.6]], pole: [[1, -0.4, 0.5], [-0.9, -1, 0.1]], claw: 1, open: 3, grin: 2, glow: 1.15,
  };
  const hit: Partial<Pose> = {
    yaw: 0.34, pitch: 0.44, roll: 0.04, bob: -2 * PX, hp: 0,
    hand: [hitHand, [-17.8, 3.0, 9.0]], pole: [[1, -0.7, 0.3], [-0.9, -1, 0.1]], claw: 0.6, open: 3, openR: 2, grin: 2, glow: 1.25, flash: 1,
  };
  const settle: Partial<Pose> = { ...hit, pitch: 0.4, bob: -1 * PX, hand: [add(hitHand, [0.3, -0.4, 0.8]), [-17.8, 3.6, 8.8]], flash: 0, open: 2 };
  const keys: Key[] = [
    { f: 0, p: ready },
    { f: 3, p: up, ease: easeInOut },
    { f: 4, p: peak, ease: linear },
    { f: 5, p: mid, ease: easeIn },
    { f: 6, p: hit, ease: easeOut },
    { f: 7, p: settle, ease: easeOut },
    { f: 9, p: ready, ease: easeInOut },
  ];
  const poses = keyed(keys, 10, 400);
  const P0 = peak.hand![0], M = mid.hand![0], P2 = hitHand;
  const C = sub(mul(M, 2), mul(add(P0, P2), 0.5));
  const arc = (u: number): V3 => add(add(mul(P0, (1 - u) * (1 - u)), mul(C, 2 * u * (1 - u))), mul(P2, u * u));
  const fist = (w: V3) => add(w, mul(norm(sub(w, [12.4, 4, 33])), 4.6));
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => fist(arc(lerp(u0, u1, k / (n - 1)))));
  poses[5].hand = [arc(0.5), poses[5].hand[1]];
  poses[5].trail = path(0, 0.5);
  poses[6].trail = path(0.22, 1);
  poses[7].trail = path(0.72, 1, 4);
  for (const k of [5, 6, 7]) poses[k].trailArm = 0;
  poses[6].flash = 1;
  poses[6].puff = 1;
  poses[7].puff = 0.5;
  return poses;
}

// ---------- «Все пасти разом»: оскал → удержание → укус; поворот на 45° → удержание → второй укус ----------
/** Оскал: туша приседает, лапы в стороны, все пасти настежь, слюна. */
const GAPE: Partial<Pose> = {
  pitch: 0.2, bob: -1 * PX, chest: 1, hp: -0.15, hand: [[20.6, 6.4, 8.6], [-20.0, 6.0, 8.6]], pole: [[1, -0.6, 0.2], [-1, -0.6, 0.2]],
  claw: 1, open: 3, openR: 3, openL: 3, grin: 2, glow: 1.25,
};
/** Разворот для второго укуса: тот же оскал, корпус провёрнут на ~45°. */
const TURN: Partial<Pose> = { ...GAPE, yaw: 0.7 };
const SHUT: Partial<Pose> = { open: 0, openR: 0, openL: 0, grin: 0, claw: 0.3, glow: 1.3 };

function gapePoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: GAPE, ease: easeOut }], 4, 500);
}
function holdOf(base: Partial<Pose>, seed: number): Pose[] {
  const b = poseAt([{ f: 0, p: base }, { f: 1, p: base }], 0);
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...b, t: i / 4, seed: seed + i,
    armLift: [tremble[i], -tremble[i]] as [number, number],
    glow: [1.2, 1.4, 1.25, 1.4][i],
  }));
}
/** Укус: кадр 1 — все пасти захлопываются (конец предупреждения), туша дёргается вниз, слюна летит; затем назад к покою. */
function snapPoses(from: Partial<Pose>, seed: number): Pose[] {
  const yaw = from.yaw ?? 0;
  const keys: Key[] = [
    { f: 0, p: { ...from, bob: 0, chest: 1, pitch: 0.12 } },
    { f: 1, p: { ...from, ...SHUT, yaw, pitch: 0.32, bob: -2 * PX, chest: 0 }, ease: easeIn },
    { f: 3, p: { ...from, ...SHUT, yaw, pitch: 0.3, bob: -1 * PX, chest: 0 }, ease: easeOut },
    { f: 7, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 8, seed);
  [0, 1, 0.66, 0.33].forEach((s, k) => (poses[k].spit = s));
  return poses;
}
function turnPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: TURN, ease: easeInOut }], 4, 560);
}

// ---------- «Пасти из топи»: зов → удержание → лапы в трясину ----------
const CALL: Partial<Pose> = {
  pitch: -0.04, bob: 1 * PX, chest: 1, hp: -0.34, hand: [[19.0, 3.0, 40.0], [-19.0, 3.0, 40.0]], pole: [[1, -0.3, -0.5], [-1, -0.3, -0.5]],
  claw: 1, open: 3, openR: 2, openL: 2, grin: 2, glow: 1.35,
};
function callPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: CALL, ease: easeInOut }], 4, 600);
}
function callHoldPoses(): Pose[] {
  // утробное бульканье: брюхо 3→2→3, плечо и бок — вразнобой
  return holdOf(CALL, 620).map((p, i) => ({ ...p, open: [3, 2, 3, 3][i], openR: [2, 2, 1, 2][i], openL: [1, 2, 2, 2][i] }));
}
/** Удар: кадр 2 — лапы в трясину перед собой (конец предупреждения), когти уходят в землю, брызги и комья; затем распрямляется. */
function plungePoses(): Pose[] {
  const low: Partial<Pose> = {
    pitch: 0.42, bob: -2 * PX, hp: 0.1, hand: [[13.0, 11.0, 8.0], [-13.0, 11.0, 8.0]], pole: [[1, -0.2, 0.6], [-1, -0.2, 0.6]],
    claw: 0.4, open: 2, openR: 0, openL: 0, grin: 2, glow: 1.3,
  };
  const dug: Partial<Pose> = { ...low, pitch: 0.4, dig: 1, claw: 0, open: 1, glow: 1.2 };
  const keys: Key[] = [
    { f: 0, p: CALL },
    { f: 2, p: { ...low, clods: 1 }, ease: easeIn },
    { f: 3, p: { ...dug, clods: 0.75 }, ease: easeOut },
    { f: 5, p: { ...dug, clods: 0.25 }, ease: linear },
    { f: 9, p: {}, ease: easeInOut },
  ];
  return keyed(keys, 10, 640);
}

// ---------- «Трупный газ»: раздувается → швы горят → газ бьёт из швов ----------
const SWELL: Partial<Pose> = {
  swell: 1, seamGlow: 1, open: 0, openR: 0, openL: 0, grin: 0, pitch: 0.12, bob: 1 * PX, chest: 1,
  hand: [[21.0, 5.0, 12.0], [-20.4, 5.0, 12.0]], pole: [[1, -0.6, 0.2], [-1, -0.6, 0.2]], claw: 0.6, glow: 1.3,
};
function swellPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: SWELL, ease: easeIn }], 4, 700);
}
/** Удержание: туша пульсирует (два состояния через кадр), швы мигают, из швов сочатся струйки газа. */
function swellHoldPoses(): Pose[] {
  const b = poseAt([{ f: 0, p: SWELL }, { f: 1, p: SWELL }], 0);
  return [0, 1, 2, 3].map((i) => ({
    ...b, t: i / 4, seed: 720 + i,
    swell: i % 2 ? 1.1 : 1, seamGlow: i % 2 ? 1.5 : 1, gas: i % 2 ? 0.22 : 0.12, gasT: 0.1,
    glow: i % 2 ? 1.45 : 1.3,
  }));
}
/** Выброс: кадр 1 — швы лопаются, газ бьёт клубами, туша опадает и выдыхает всеми пастями; клубы уходят вверх и тают. */
function burstPoses(): Pose[] {
  const keys: Key[] = [
    { f: 0, p: { ...SWELL, swell: 1.2, seamGlow: 1.5, glow: 1.5 } },
    { f: 1, p: { ...SWELL, swell: 0.15, seamGlow: 1.5, open: 3, openR: 3, openL: 3, grin: 2, bob: -1 * PX, chest: 0, pitch: 0.3, gas: 1, gasT: 0 }, ease: easeOut },
    { f: 5, p: { swell: 0, seamGlow: 0.3, open: 2, openR: 2, openL: 2, grin: 1, gas: 0.45, gasT: 1 }, ease: linear },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 10, 740);
  // газ виден до кадра 5, после — исчезает (клиент продолжает эффектом мира)
  for (let k = 6; k < 10; k++) poses[k].gas = 0;
  return poses;
}

/** Гибель: отшатнулся, пасти настежь; швы рвутся и сочат газ; оседает на колени и валится брюхом в трясину, сереет. */
function deathPoses(): Pose[] {
  const recoil: Partial<Pose> = {
    pitch: 0.1, bob: 1 * PX, hp: -0.3, open: 3, openR: 3, openL: 3, grin: 2, hand: [[20.0, 4.0, 12.0], [-20.0, 4.0, 12.0]], glow: 1.5,
  };
  const stagger: Partial<Pose> = {
    pitch: 0.2, roll: 0.08, yaw: 0.1, open: 2, openR: 3, openL: 2, grin: 2, hand: [[19.4, 8.0, 8.6], [-18.4, 6.0, 9.4]], glow: 0.9,
    seamGlow: 0.8, gas: 0.5, gasT: 0.15,
  };
  const kneel: [V3, V3] = [[7.0, -5.0, 3.0], [-7.0, -5.0, 3.0]];
  const sag: Partial<Pose> = {
    root: [0, 1.5, 0], pitch: 0.55, bob: -5 * PX, hp: 0.15, foot: kneel, toe: [-0.8, -0.8], hand: [[18.0, 12.0, 6.0], [-18.0, 12.0, 6.0]],
    pole: [[1, -0.6, 0.2], [-1, -0.6, 0.2]], open: 3, openR: 3, openL: 3, grin: 2, glow: 0.5, seamGlow: 0.5, gas: 0.7, gasT: 0.5, dust: [1, 1], wither: 0.3,
  };
  const flop: Partial<Pose> = {
    ...sag, root: [0, 3, 0], pitch: 0.95, bob: -9 * PX, hp: 0.35, hand: [[20.0, 13.0, 3.6], [-20.0, 12.0, 3.6]],
    glow: 0.1, seamGlow: 0.15, gas: 0.35, gasT: 0.9, dust: [0.3, 0.3], wither: 0.8, claw: 0.4,
  };
  const dead: Partial<Pose> = { ...flop, pitch: 1.0, bob: -9 * PX, glow: 0, seamGlow: 0, gas: 0, dust: [0, 0], wither: 1, open: 3, openR: 2, openL: 2, grin: 1, drool: 0 };
  const keys: Key[] = [
    { f: 0, p: { glow: 1.0 } },
    { f: 2, p: recoil, ease: easeOut },
    { f: 4, p: stagger, ease: easeInOut },
    { f: 6, p: sag, ease: easeIn },
    { f: 9, p: flop, ease: easeInOut },
    { f: 11, p: dead, ease: easeOut },
  ];
  // оседание разнесено на кадры 6→9 (easing), цвет гаснет ступенями палитры по кадру — без скачка на одном стыке
  const WITHER = [0, 0, 0, 0, 0, 0.1, 0.22, 0.36, 0.5, 0.66, 0.84, 1];
  return keyed(keys, 12, 800).map((p, i) => ({ ...p, wither: WITHER[i] }));
}

export type AbomAnim =
  | "idle" | "walk" | "attack" | "gape" | "gapeHold" | "snap" | "turn" | "turnHold" | "snap2"
  | "call" | "callHold" | "plunge" | "swell" | "swellHold" | "burst" | "death";
/**
 * Анимации: первый столбец листа, число кадров, кадров в секунду, по кругу ли, что дальше, кадр удара. Замахи умений —
 * связки «замах → удержание по кругу до конца предупреждения → удар» (кадр hit — ровно на конец предупреждения).
 */
export const ABOM_ANIMS: Record<AbomAnim, { col: number; n: number; fps: number; loop: boolean; ru: string; next?: AbomAnim; hit?: number }> = {
  idle: { col: 0, n: 12, fps: 12, loop: true, ru: "покой" },
  walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
  attack: { col: 24, n: 10, fps: 15, loop: false, ru: "атака", hit: 6 },
  gape: { col: 34, n: 4, fps: 12, loop: false, ru: "оскал всех пастей", next: "gapeHold" },
  gapeHold: { col: 38, n: 4, fps: 12, loop: true, ru: "удержание оскала", next: "snap" },
  snap: { col: 42, n: 8, fps: 12, loop: false, ru: "укус всеми пастями", hit: 1 },
  turn: { col: 50, n: 4, fps: 12, loop: false, ru: "поворот на 45", next: "turnHold" },
  turnHold: { col: 54, n: 4, fps: 12, loop: true, ru: "удержание поворота", next: "snap2" },
  snap2: { col: 58, n: 8, fps: 12, loop: false, ru: "второй укус", hit: 1 },
  call: { col: 66, n: 4, fps: 12, loop: false, ru: "зов топи", next: "callHold" },
  callHold: { col: 70, n: 4, fps: 12, loop: true, ru: "удержание зова", next: "plunge" },
  plunge: { col: 74, n: 10, fps: 12, loop: false, ru: "лапы в трясину", hit: 2 },
  swell: { col: 84, n: 4, fps: 12, loop: false, ru: "раздувается", next: "swellHold" },
  swellHold: { col: 88, n: 4, fps: 12, loop: true, ru: "швы горят", next: "burst" },
  burst: { col: 92, n: 10, fps: 12, loop: false, ru: "выброс газа", hit: 1 },
  death: { col: 102, n: 12, fps: 12, loop: false, ru: "гибель" },
};
export const ABOM_COLS = 114;
/**
 * Умения карточки → анимации. «Все пасти разом»: укус и затем (then) поворот с повторным укусом; «Пасти из топи» — эффект
 * мира maw в метках (мелкая пасть, затем вдвое шире); «Трупный газ» — эффект мира gas по кольцу.
 */
export const ABOM_SKILLS: Record<string, { windup: [AbomAnim, AbomAnim]; strike: AbomAnim; then?: { windup: [AbomAnim, AbomAnim]; strike: AbomAnim }; fx?: "maw" | "gas" }> = {
  bite: { windup: ["gape", "gapeHold"], strike: "snap", then: { windup: ["turn", "turnHold"], strike: "snap2" } },
  swamp_maws: { windup: ["call", "callHold"], strike: "plunge", fx: "maw" },
  corpse_gas: { windup: ["swell", "swellHold"], strike: "burst", fx: "gas" },
};
const POSES: Record<AbomAnim, (view: ZView) => Pose[]> = {
  idle: () => idlePoses(), walk: () => walkPoses(), attack: attackPoses,
  gape: gapePoses, gapeHold: () => holdOf(GAPE, 520), snap: () => snapPoses(GAPE, 540),
  turn: turnPoses, turnHold: () => holdOf(TURN, 570), snap2: () => snapPoses(TURN, 580),
  call: callPoses, callHold: callHoldPoses, plunge: plungePoses,
  swell: swellPoses, swellHold: swellHoldPoses, burst: burstPoses, death: deathPoses,
};

/** Лист одной анимации: 3 строки (вниз, вверх, вбок), столбцы — кадры. */
export function buildAbomAnim(anim: AbomAnim): PC {
  const A = ABOM_ANIMS[anim];
  const out = new PC(N * A.n, N * 3);
  VIEWS.forEach((v, row) => POSES[anim](v).forEach((p, i) => out.blit(renderAbom(v, p), i * N, row * N)));
  return out;
}
export function buildAbomSheet(parts?: Partial<Record<AbomAnim, PC>>): PC {
  const out = new PC(N * ABOM_COLS, N * 3);
  for (const a of Object.keys(ABOM_ANIMS) as AbomAnim[]) out.blit(parts?.[a] ?? buildAbomAnim(a), ABOM_ANIMS[a].col * N, 0);
  return out;
}
/** Один кадр для отладки. */
export function abomFrame(view: ZView, anim: AbomAnim, i: number): PC {
  return renderAbom(view, POSES[anim](view)[i]);
}


// ---------------- эффект мира: пасть из топи ----------------
/** Кадр эффекта пасти 96×96; центр метки — (48, 60). Пасть на земле чуть сжата по вертикали (вид сверху под углом). */
const MF = 96, MCX = 48, MCY = 60, MSQ = 0.72;
interface MawState {
  /** внешний радиус губ и радиус зева (px); 0 — пасти ещё нет */
  lip: number; pit: number;
  /** зубов по кругу, длина зуба, насколько зубы встали из трясины 0..1 */
  teeth: number; tl: number; rise: number;
  /** ширина кольца взбитой трясины вокруг; пузыри 0..1; брызги — кадров от укуса (undefined — нет); бледнеет к концу */
  mud: number; bubbles?: number; splash?: number; pale?: boolean; seed: number;
}

/** Кадр пасти: [нижний слой — под юнитами: трясина, губы, зев, задние зубы; верхний — передние зубы и летящие брызги]. */
function mawFrame(s: MawState): [PC, PC] {
  const back = new PC(MF, MF), front = new PC(MF, MF);
  const L2: [number, number] = [-0.6, -0.8];
  const outer = s.lip + s.mud;
  // трясина: тёмное взбитое кольцо, рваный край, светлее сверху слева
  if (outer > 0.5) {
    for (let y = Math.floor(MCY - outer * MSQ - 1); y <= MCY + outer * MSQ + 1; y++) for (let x = Math.floor(MCX - outer - 1); x <= MCX + outer + 1; x++) {
      const ux = x + 0.5 - MCX, uy = (y + 0.5 - MCY) / MSQ;
      const r = Math.hypot(ux, uy);
      if (r > outer || r <= s.lip) continue;
      const f = (r - s.lip) / Math.max(1, s.mud);
      if (f > 0.7 && hash01(x, y, 91 + s.seed) < 0.45) continue;
      const lit = (ux * L2[0] + uy * L2[1]) / (r || 1);
      let t = f > 0.8 ? 1 : lit > 0.4 ? 4 : 3;
      if (hash01(x >> 1, y, 17) < 0.12) t = Math.max(0, t - 1);
      back.set(x, y, s.pale ? MUD[Math.max(0, t - 1)] : MUD[t]);
    }
  }
  if (s.lip > 0.5) {
    for (let y = Math.floor(MCY - s.lip * MSQ - 1); y <= MCY + s.lip * MSQ + 1; y++) for (let x = Math.floor(MCX - s.lip - 1); x <= MCX + s.lip + 1; x++) {
      const ux = x + 0.5 - MCX, uy = (y + 0.5 - MCY) / MSQ;
      const r = Math.hypot(ux, uy);
      if (r > s.lip) continue;
      const dir: [number, number] = [ux / (r || 1), uy / (r || 1)];
      const lit = dir[0] * L2[0] + dir[1] * L2[1];
      if (r <= s.pit) {
        // зев: глубина тёмная, освещена дальняя (нижняя правая) стенка
        const e = r / Math.max(1, s.pit);
        back.set(x, y, e > 0.72 ? (lit < -0.3 ? MAW[2] : MAW[1]) : MAW[0]);
        continue;
      }
      // губы — валик: внешняя половина к свету светлее, внутренняя — наоборот; складки-морщины к центру
      const f = (r - s.pit) / Math.max(1, s.lip - s.pit);
      const sg = 2 * f - 1;
      let t = Math.round(2.3 + 1.3 * sg * lit + 0.7 * (1 - sg * sg));
      const ang = Math.atan2(uy, ux);
      const k = (ang / TAU + 1) * s.teeth * 2;
      if (Math.abs(k - Math.round(k)) < 0.12 + 0.1 * (1 - f) && Math.round(k) % 2 === 1 && s.lip - s.pit > 3) t -= 1;
      back.set(x, y, FLESH[clamp(t, 1, 4)]);
    }
    // контур губ снаружи и у зева
    for (let y = 0; y < MF; y++) for (let x = 0; x < MF; x++) {
      const ux = x + 0.5 - MCX, uy = (y + 0.5 - MCY) / MSQ;
      const r = Math.hypot(ux, uy);
      if ((r > s.lip && r <= s.lip + 1.05) || (s.pit > 1.5 && r > s.pit - 1 && r <= s.pit)) back.set(x, y, OUT);
    }
  }
  // зубы: по кругу на кромке зева, остриём к центру; встают из трясины (кончик выше на rise·tl)
  if (s.teeth > 0 && s.lip > 0.5) {
    const tb = new PC(MF, MF), tf = new PC(MF, MF);
    for (let k = 0; k < s.teeth; k++) {
      const a = (k / s.teeth) * TAU + 0.2 + s.seed * 0.1;
      const ca = Math.cos(a), sa = Math.sin(a);
      // корень зуба — на кромке зева; когда пасть сомкнута, зубы сходятся к середине частоколом
      const rb = Math.max(s.pit + 0.8, s.lip * 0.5), rt = Math.max(0, rb - s.tl);
      const bx = MCX + ca * rb, by = MCY + sa * rb * MSQ;
      const tx = MCX + ca * rt, ty = MCY + sa * rt * MSQ - s.rise * s.tl * 1.1;
      const layer = sa > 0.2 && s.rise > 0.25 ? tf : tb;
      const len = Math.hypot(tx - bx, ty - by);
      const steps = Math.max(2, Math.ceil(len * 2));
      const nx = -(ty - by) / (len || 1), ny = (tx - bx) / (len || 1);
      for (let j = 0; j <= steps; j++) {
        const u = j / steps;
        const w = 1.3 * (1 - u) + 0.3;
        for (let o = -w; o <= w + 0.01; o += 0.5) {
          const x = Math.round(lerp(bx, tx, u) + nx * o), y = Math.round(lerp(by, ty, u) + ny * o);
          const lit = nx * o * L2[0] + ny * o * L2[1] > 0;
          layer.set(x, y, u > 0.8 ? BONE[3] : lit ? BONE[4] : u < 0.25 ? BONE[2] : BONE[3]);
        }
      }
    }
    for (const l of [tb, tf]) l.outline(OUT);
    back.blit(tb, 0, 0);
    front.blit(tf, 0, 0);
  }
  // пузыри трясины: зелёная слизь, блик сверху слева
  if ((s.bubbles ?? 0) > 0.05) {
    const n = Math.round(9 * s.bubbles!);
    for (let k = 0; k < n; k++) {
      const a = hash01(k, 3, s.seed) * TAU, r = (s.lip + s.mud * 0.5) * (0.4 + 0.6 * hash01(k, 5, s.seed));
      const x = Math.round(MCX + Math.cos(a) * r), y = Math.round(MCY + Math.sin(a) * r * MSQ);
      back.set(x, y, GAS[3]);
      back.set(x + 1, y, GAS[2]);
      back.set(x, y + 1, GAS[2]);
      back.set(x + 1, y + 1, GAS[1]);
      if (hash01(k, 9, s.seed) > 0.5) back.set(x - 1, y - 1, GAS[4]);
    }
  }
  // брызги: комья трясины разлетаются от губ дугой и ложатся
  if (s.splash !== undefined) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.3;
      const v = 1.4 + 0.9 * hash01(k, 1, s.seed), vz = 1.6 + 1.2 * hash01(k, 2, s.seed);
      const land = (2 * vz) / 1.1;
      const t = Math.min(s.splash, land);
      const h = vz * t - 0.55 * t * t;
      const r0 = s.lip + 1;
      const x = Math.round(MCX + Math.cos(a) * (r0 + v * t)), y = Math.round(MCY + Math.sin(a) * (r0 + v * t) * MSQ - Math.max(0, h));
      const l = s.splash >= land ? back : front;
      l.set(x, y, DUST[3]);
      l.set(x + 1, y, DUST[2]);
      l.set(x, y + 1, DUST[1]);
      l.set(x + 1, y + 1, DUST[0]);
    }
  }
  return [back, front];
}

/**
 * Эффект мира «Пасти из топи» (umb_marsh_abomination-mawfx.png): кадр 96×96, центр метки — (48, 60). Строка 0 — под юнитами,
 * строка 1 — над ними. mawIn — трясина вскипает, пасть встаёт из неё и кусает (кадр hit — конец предупреждения 1,3 с);
 * mawWide — та же пасть раскрывается вдвое шире; mawWideHold — по кругу до конца второго предупреждения (1 с);
 * mawWideSnap — второй укус (hit) и пасть уходит в трясину.
 */
export const MAWFX_ANIMS = {
  mawIn: { col: 0, n: 6, fps: 12, loop: false, hit: 2, next: "mawWide" },
  mawWide: { col: 6, n: 4, fps: 12, loop: false, next: "mawWideHold" },
  mawWideHold: { col: 10, n: 4, fps: 12, loop: true, next: "mawWideSnap" },
  mawWideSnap: { col: 14, n: 8, fps: 12, loop: false, hit: 1 },
} as const;
export const MAWFX_COLS = 22;
export const MAWFX_FRAME = MF;

export function buildMawFx(): PC {
  const out = new PC(MF * MAWFX_COLS, MF * 2);
  const put = (col: number, s: MawState) => {
    const [b, f] = mawFrame(s);
    out.blit(b, col * MF, 0);
    out.blit(f, col * MF, MF);
  };
  const T1 = 10, T2 = 16;
  // укус малой пастью
  const inF: Partial<MawState>[] = [
    { lip: 0, pit: 0, mud: 9, bubbles: 1 },
    { lip: 13, pit: 9, tl: 4, rise: 0.8, mud: 4, bubbles: 0.6 },
    { lip: 14, pit: 2, tl: 7, rise: 1, mud: 4, splash: 0.5 },
    { lip: 13, pit: 2, tl: 6.5, rise: 0.7, mud: 4, splash: 2 },
    { lip: 12, pit: 2, tl: 6, rise: 0.5, mud: 4, splash: 3.5 },
    { lip: 12, pit: 2, tl: 5, rise: 0.4, mud: 4, splash: 6 },
  ];
  inF.forEach((s, i) => put(MAWFX_ANIMS.mawIn.col + i, { teeth: T1, tl: 4, rise: 0, mud: 4, seed: 3, ...s } as MawState));
  // раскрытие вдвое шире
  const lips = [17, 23, 29, 33], pits = [9, 15, 21, 25];
  lips.forEach((l, i) => put(MAWFX_ANIMS.mawWide.col + i, { lip: l, pit: pits[i], teeth: T2, tl: 4 + i, rise: 0.3 + 0.12 * i, mud: 4, bubbles: 0.5, seed: 5 }));
  for (let i = 0; i < 4; i++) {
    put(MAWFX_ANIMS.mawWideHold.col + i, { lip: 33 + (i % 2), pit: 25 + (i % 2), teeth: T2, tl: 7, rise: [0.65, 0.8, 0.7, 0.85][i], mud: 4, bubbles: [0.4, 0.8, 0.5, 0.9][i], seed: 7 + i });
  }
  // второй укус и уход в трясину
  const sn: Partial<MawState>[] = [
    { lip: 35, pit: 27, tl: 8, rise: 1 },
    { lip: 34, pit: 3, tl: 17, rise: 0.9, splash: 0.5 },
    { lip: 32, pit: 3, tl: 15, rise: 0.6, splash: 2 },
    { lip: 30, pit: 3, tl: 13, rise: 0.4, splash: 3.5 },
    { lip: 24, pit: 2, tl: 10, rise: 0.2, splash: 6 },
    { lip: 16, pit: 1.5, tl: 6, rise: 0, splash: 6, pale: true },
    { lip: 8, pit: 1, tl: 3, rise: 0, mud: 6, splash: 6, pale: true, bubbles: 0.4 },
    { lip: 0, pit: 0, mud: 8, teeth: 0, pale: true, bubbles: 0.2 },
  ];
  sn.forEach((s, i) => put(MAWFX_ANIMS.mawWideSnap.col + i, { teeth: T2, tl: 4, rise: 0, mud: 4, seed: 11, ...s } as MawState));
  return out;
}

// ---------------- эффект мира: трупный газ ----------------
/**
 * Клуб трупного газа (umb_marsh_abomination-gasfx.png): кадр 64×64, основание — (32, 52). Клиент ставит клубы по кольцу
 * 120–320 px вокруг Многорота. Строка 0 — стелющаяся дымка (под юнитами, шахматкой — земля сквозь неё видна),
 * строка 1 — сам клуб (над юнитами). Без полупрозрачности: клиент может рисовать слой с альфой.
 * gasRise — клуб поднимается из трясины за предупреждение (2,8 с: удержание — gasHold по кругу), gasHold — клубится,
 * gasFade — рассеивается после удара.
 */
export const GASFX_ANIMS = {
  gasRise: { col: 0, n: 6, fps: 12, loop: false, next: "gasHold" },
  gasHold: { col: 6, n: 6, fps: 8, loop: true },
  gasFade: { col: 12, n: 6, fps: 12, loop: false },
} as const;
export const GASFX_COLS = 18;

const GAS_BLOBS: [number, number, number][] = [[-10, -7, 7], [1, -12, 9], [11, -6, 7], [-3, -3, 8], [8, 1, 6], [-13, 0, 5], [4, -20, 5]];
function gasFrame(grow: number, ph: number, fade: number, seed: number): [PC, PC] {
  const haze = new PC(N, N), cloud = new PC(N, N);
  const bx = 32, by = 52;
  const blobs = GAS_BLOBS.map(([x, y, r], k) => {
    const a = ph * TAU + k * 1.3;
    return [
      bx + x * (0.6 + 0.4 * grow) + Math.round(1.4 * Math.cos(a)),
      by + y * grow - 4 * (1 - grow) - 6 * fade + Math.round(1.2 * Math.sin(a)),
      r * (0.25 + 0.75 * grow) * (1 - 0.35 * fade) + 0.6 * Math.sin(a * 2),
    ];
  });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let best = -1, bk = -1;
    for (let k = 0; k < blobs.length; k++) {
      const [cx, cy, r] = blobs[k];
      if (r <= 0.5) continue;
      const v = 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (v > best) { best = v; bk = k; }
    }
    if (best < 0) continue;
    // рваный край, при рассеивании — дыры шахматкой
    if (best < 0.22 && hash01(x, y, 70 + seed) < 0.4) continue;
    if (best < 0.3 && (x + y) % 2 === 1) continue;
    if (fade > 0 && ((x + y) % 2 === 0 ? hash01(x >> 1, y >> 1, 80) < fade * 1.2 - 0.2 : hash01(x, y, 81) < fade - 0.3)) continue;
    const [cx, cy, r] = blobs[bk];
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
    const l = -0.6 * dx - 0.8 * dy;
    const t = best < 0.18 ? 1 : l > 0.5 && r > 4 ? 4 : l > 0.1 ? 3 : l > -0.35 ? 2 : 1;
    cloud.set(x, y, GAS[t]);
  }
  // дымка по земле: плоский овал шахматкой
  const hr = 18 * (0.4 + 0.6 * grow) * (1 - 0.3 * fade);
  for (let y = by - 6; y <= by + 6; y++) for (let x = Math.floor(bx - hr); x <= bx + hr; x++) {
    const d = Math.hypot((x + 0.5 - bx) / hr, (y + 0.5 - by) / 5);
    if (d > 1 || (x + y) % 2) continue;
    if (fade > 0 && hash01(x, y, 90) < fade) continue;
    haze.set(x, y, d > 0.7 ? GAS[1] : GAS[2]);
  }
  return [haze, cloud];
}
export function buildGasFx(): PC {
  const out = new PC(N * GASFX_COLS, N * 2);
  const put = (col: number, [h, c]: [PC, PC]) => {
    out.blit(h, col * N, 0);
    out.blit(c, col * N, N);
  };
  const g = [0.15, 0.35, 0.55, 0.75, 0.9, 1];
  g.forEach((v, i) => put(GASFX_ANIMS.gasRise.col + i, gasFrame(v, i / 6, 0, 1)));
  for (let i = 0; i < 6; i++) put(GASFX_ANIMS.gasHold.col + i, gasFrame(1, i / 6, 0, 1));
  for (let i = 0; i < 6; i++) put(GASFX_ANIMS.gasFade.col + i, gasFrame(1, i / 6, (i + 1) / 6, 1));
  return out;
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
/** Строки атласа tiles/terrain.png (shared/map.ts, TERRAIN_KEYS): трава, лесная земля, земля, трясина. */
const GROUND_ROW = { grass: 6, forest: 7, dirt: 5, bog: 3 } as const;
type Ground = keyof typeof GROUND_ROW;
/** Подложка из земли игры (tiles/terrain.png), тайл 32 × масштаб. */
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

// подписи: моноширинный пиксельный шрифт 5×7 (кириллица, цифры)
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

/** Ряды кадров эффекта с переносом: frames — [столбец листа], слои снизу вверх: нижний, герой (если есть), верхний. */
function fxRows(c: PC, y0: number, W: number, fx: PC, fw: number, cols: number[], k: number, hero: PC | null, heroAt: [number, number], terrain: PC, g: Ground): number {
  const per = Math.floor((W - 48) / (fw * k));
  let y = y0;
  for (let s = 0; s < cols.length; s += per) {
    groundBg(c, terrain, 16, y, W - 32, fw * k, k, g);
    let x = 24;
    for (const col of cols.slice(s, s + per)) {
      c.blit(scaleNN(crop(fx, col * fw, 0, fw, fw), k), x, y);
      if (hero) {
        shadowBlob(c, x + heroAt[0] * k, y + heroAt[1] * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(hero, k), x + (heroAt[0] - 16) * k, y + (heroAt[1] - 30) * k);
      }
      c.blit(scaleNN(crop(fx, col * fw, fw, fw, fw), k), x, y);
      x += fw * k;
    }
    y += fw * k + 6;
  }
  return y - y0;
}

/** Монтаж: Многорот рядом с героем 32×32 на траве, земле и трясине (×3), раскадровки анимаций (×2), эффекты мира с героем. */
function buildPreview(sheets: Record<AbomAnim, PC>, maw: PC, gas: PC, hero: PC, terrain: PC): PC {
  const W = 1660;
  const rows: { h: number; draw: (c: PC, y: number) => void }[] = [];
  const BG: RGBA = [24, 20, 26, 255];
  const frameOf = (a: AbomAnim, view: number, i: number) => crop(sheets[a], i * N, view * N, N, N);
  const heroDown = crop(hero, 0, 0, 32, 32);
  const heroSide = crop(hero, 0, 64, 32, 32);
  const names: Record<string, string> = { grass: "ТРАВА", dirt: "ЗЕМЛЯ", bog: "ТРЯСИНА" };
  for (const g of ["grass", "dirt", "bog"] as Ground[]) {
    rows.push({
      h: 64 * 3 + 40,
      draw: (c, y0) => {
        const k = 3;
        text(c, `×3 · ГЕРОЙ 32 И МНОГОРОТ 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · ${names[g]}`, 16, y0 + 8);
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
  for (const a of Object.keys(ABOM_ANIMS) as AbomAnim[]) {
    const A = ABOM_ANIMS[a];
    rows.push({
      h: 64 * 2 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.next ? ` · → ${ABOM_ANIMS[A.next].ru}` : ""}${A.hit !== undefined ? ` · УДАР — КАДР ${A.hit + 1}` : ""}`, 16, y0 + 8);
        for (const v of [0, 2]) {
          const y = y0 + 34 + (v === 0 ? 0 : 64 * k);
          groundBg(c, terrain, 16, y, W - 32, 64 * k, k, v === 2 ? "bog" : "grass");
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
  // эффекты мира с героем: пасть под ним, газ рядом
  const mawCols = Array.from({ length: MAWFX_COLS }, (_, i) => i);
  const per = Math.floor((W - 48) / (MF * 2));
  const mawH = Math.ceil(MAWFX_COLS / per) * (MF * 2 + 6);
  rows.push({
    h: mawH + 34,
    draw: (c, y0) => {
      text(c, "×2 · ЭФФЕКТ МИРА · ПАСТИ ИЗ ТОПИ 96: УКУС 6 · ШИРЕ 4 · УДЕРЖАНИЕ 4 · ВТОРОЙ УКУС 8 · 12 К/С", 16, y0 + 8);
      fxRows(c, y0 + 34, W, maw, MF, mawCols, 2, heroDown, [MCX, MCY], terrain, "bog");
    },
  });
  const gasCols = Array.from({ length: GASFX_COLS }, (_, i) => i);
  const perG = Math.floor((W - 48) / (N * 2));
  const gasH = Math.ceil(GASFX_COLS / perG) * (N * 2 + 6);
  rows.push({
    h: gasH + 34,
    draw: (c, y0) => {
      text(c, "×2 · ЭФФЕКТ МИРА · ТРУПНЫЙ ГАЗ 64: ПОДЪЁМ 6 · КЛУБИТСЯ 6 ПО КРУГУ · РАССЕИВАНИЕ 6", 16, y0 + 8);
      fxRows(c, y0 + 34, W, gas, N, gasCols, 2, heroDown, [22, 58], terrain, "bog");
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

/** «Наш | референс»: Многорот вниз и вбок (покой, кадр с открытой пастью) крупно и образец 20 той же высоты. */
function buildCompare(sheets: Record<AbomAnim, PC>, ref: PC | null): PC {
  const k = 6;
  const ours = crop(sheets.idle, 4 * N, 0, N, N);
  const side = crop(sheets.idle, 4 * N, 2 * N, N, N);
  const H = N * k;
  const refS = ref ? scaleBox(ref, Math.round((ref.w * H) / ref.h), H) : null;
  const W = 24 + N * k + 16 + N * k + 24 + (refS ? refS.w + 24 : 0);
  const c = new PC(W, H + 72);
  fill(c, 0, 0, W, H + 72, [36, 32, 38, 255]);
  text(c, "НАШ", 24, 14, 3);
  if (refS) text(c, "РЕФЕРЕНС 20", 24 + 2 * N * k + 40, 14, 3);
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

type SkillCard = { id: string; name: string; windupMs: number; r?: number; r2?: number; arc?: number; count?: number; then?: { windupMs: number; r?: number }[] };

/** Просмотр с анимацией: листы встроены в страницу (data:); умения — по таймингам карточки, метки рисует страница, как клиент. */
function buildHtml(sheet: PC, maw: PC, gas: PC, hero: PC, terrain: PC, skills: SkillCard[]): string {
  const png = (c: PC) => {
    const p = new PNG({ width: c.w, height: c.h });
    Buffer.from(c.data.buffer).copy(p.data);
    return "data:image/png;base64," + PNG.sync.write(p).toString("base64");
  };
  const grounds = (["grass", "bog"] as Ground[]).map((g) => png(crop(terrain, 14 * 32, GROUND_ROW[g] * 32, 128, 32)));
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Многорот — анимации</title>
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
<h1>Многорот — поганище Гнилых топей</h1>
<p>Кадр 64×64, рядом герой 32×32; масштаб игры. Вниз, вверх, вбок, влево (отражение). Скорость — как в листе.</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0"> трава</label><label><input type="radio" name="g" value="1" checked> трясина</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Замах длится windupMs из карточки (связка «замах → удержание по кругу»), кадр удара — ровно на конец предупреждения. Зелёные метки рисует страница (в игре — клиент). «Все пасти разом»: четыре конуса, затем поворот на 45° и второй укус; «Пасти из топи»: пасть под тремя героями, затем вдвое шире; «Трупный газ»: кольцо от 120 px до края, клубы газа по кольцу.</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const ANIMS = ${JSON.stringify(ABOM_ANIMS)};
const MAW = ${JSON.stringify(MAWFX_ANIMS)}, MF = ${MF};
const GAS = ${JSON.stringify(GASFX_ANIMS)};
const SKILLS = ${JSON.stringify(skills.map((s) => ({ ...s, ...ABOM_SKILLS[s.id] })))};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${png(sheet)}"), mawImg = img("${png(maw)}"), gasImg = img("${png(gas)}"), hero = img("${png(hero)}");
const grounds = [img("${grounds[0]}"), img("${grounds[1]}")];
let anim = "idle", zoom = 3, ground = 1, frame = 0, last = 0, held = 0;
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
  const a = document.getElementById("arena"); a.width = 420 * zoom; a.height = 260 * zoom;
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
function draw() {
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
// ---- умения: связки анимаций по времени, метки и эффекты мира ----
const sbar = document.getElementById("skills");
let skill = null, t0 = 0;
for (const s of SKILLS) {
  const b = document.createElement("button");
  b.textContent = s.name + " · замах " + (s.windupMs / 1000).toFixed(1).replace(".", ",") + " с";
  b.onclick = () => { skill = s; t0 = performance.now(); };
  sbar.appendChild(b);
}
/** Кадр связки «замах → удержание → удар» в момент t от её начала; null — связка кончилась. */
function chainAt(windup, strike, wMs, t) {
  const W = ANIMS[windup[0]], Hd = ANIMS[windup[1]], St = ANIMS[strike];
  const strikeAt = wMs - (St.hit / St.fps) * 1000;
  if (t < Math.min(strikeAt, (W.n / W.fps) * 1000)) return W.col + Math.min(W.n - 1, Math.floor((t / 1000) * W.fps));
  if (t < strikeAt) return Hd.col + (Math.floor(((t - (W.n / W.fps) * 1000) / 1000) * Hd.fps) % Hd.n);
  const k = Math.floor(((t - strikeAt) / 1000) * St.fps);
  return k < St.n ? St.col + k : null;
}
function bossFrameAt(s, t) {
  if (t < 0) return ANIMS.idle.col;
  const idle = ANIMS.idle.col + (Math.floor((t / 1000) * 12) % 12);
  // второй шаг «Всех пастей»: укус показан до кадра 3, затем поворот на 45° и удержание; второй удар — через thenMs после первого
  const cut = 250;
  if (s.then && t >= s.windupMs + cut) { const b = chainAt(s.then.windup, s.then.strike, s.thenMs - cut, t - s.windupMs - cut); return b !== null ? b : idle; }
  const a = chainAt(s.windup, s.strike, s.windupMs, t);
  return a !== null ? a : idle;
}
function cone(g, x, y, r, ang, arc) {
  g.fillStyle = "rgba(90,200,70,.25)"; g.strokeStyle = "#5ad04a"; g.lineWidth = zoom; g.beginPath(); g.moveTo(x * zoom, y * zoom);
  g.arc(x * zoom, y * zoom, r * zoom, ang - arc / 2, ang + arc / 2); g.closePath(); g.fill(); g.stroke();
}
function circle(g, x, y, r) { g.fillStyle = "rgba(90,200,70,.25)"; g.strokeStyle = "#5ad04a"; g.lineWidth = zoom; g.beginPath(); g.arc(x * zoom, y * zoom, r * zoom, 0, 7); g.fill(); g.stroke(); }
function mawFrameAt(t, s) {
  // пасть: выход (hit — конец первого предупреждения), шире, удержание до конца второго, второй укус
  const k = Math.floor(((t - s.windupMs) / 1000) * 12) + MAW.mawIn.hit;
  if (k < 0) return -1;
  if (k < MAW.mawIn.n) return MAW.mawIn.col + k;
  const k2 = k - MAW.mawIn.n;
  if (k2 < MAW.mawWide.n) return MAW.mawWide.col + k2;
  const snapAt = Math.round((s.thenMs / 1000) * 12) + MAW.mawIn.hit - MAW.mawIn.n - MAW.mawWideSnap.hit;
  if (k2 < snapAt) return MAW.mawWideHold.col + ((k2 - MAW.mawWide.n) % MAW.mawWideHold.n);
  const j = k2 - snapAt;
  return j < MAW.mawWideSnap.n ? MAW.mawWideSnap.col + j : -1;
}
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  const bx = 178, by = 70, foot = [bx + 32, by + 60];
  const t = skill ? ts - t0 : -1;
  const heroes = [[foot[0] - 90, foot[1] + 50], [foot[0] + 110, foot[1] + 40], [foot[0] + 40, foot[1] - 60]];
  const tele1 = skill && t >= 0 && t < skill.windupMs;
  const tele2 = skill && skill.then && t >= skill.windupMs && t < skill.windupMs + skill.thenMs;
  if (skill && skill.id === "bite" && (tele1 || tele2)) for (const d of [0, 90, 180, 270]) cone(g, foot[0], foot[1], skill.r, (d + (tele2 ? 45 : 0)) * Math.PI / 180, skill.arc * Math.PI / 180);
  if (skill && skill.id === "swamp_maws" && (tele1 || tele2)) for (const h of heroes) circle(g, h[0], h[1], tele2 ? skill.then[0].r : skill.r);
  if (skill && skill.id === "corpse_gas" && tele1) {
    g.fillStyle = "rgba(90,200,70,.22)"; g.beginPath(); g.rect(0, 0, a.width, a.height); g.arc(foot[0] * zoom, foot[1] * zoom, skill.r * zoom, 0, 7, true); g.fill("evenodd");
    g.strokeStyle = "#5ad04a"; g.lineWidth = zoom; g.beginPath(); g.arc(foot[0] * zoom, foot[1] * zoom, skill.r * zoom, 0, 7); g.stroke();
  }
  const gasPts = [];
  if (skill && skill.id === "corpse_gas") for (let i = 0; i < 14; i++) { const ang = i / 14 * Math.PI * 2 + 0.2, r = 140 + (i % 3) * 40; gasPts.push([foot[0] + Math.cos(ang) * r, foot[1] + Math.sin(ang) * r * 0.8]); }
  const gasCol = () => {
    const k = Math.floor((t / 1000) * 12);
    const rise = GAS.gasRise.n;
    if (t < 0) return -1;
    if (k < rise) return GAS.gasRise.col + k;
    if (t < skill.windupMs) return GAS.gasHold.col + (Math.floor((t / 1000) * GAS.gasHold.fps) % GAS.gasHold.n);
    const j = Math.floor(((t - skill.windupMs - 4000) / 1000) * 12);
    if (j < 0) return GAS.gasHold.col + (Math.floor((t / 1000) * GAS.gasHold.fps) % GAS.gasHold.n);
    return j < GAS.gasFade.n ? GAS.gasFade.col + j : -1;
  };
  const fxLayer = (row) => {
    if (!skill) return;
    if (skill.id === "swamp_maws") { const c = mawFrameAt(t, skill); if (c >= 0) for (const h of heroes) g.drawImage(mawImg, c * MF, row * MF, MF, MF, (h[0] - 48) * zoom, (h[1] - 60) * zoom, MF * zoom, MF * zoom); }
    if (skill.id === "corpse_gas") { const c = gasCol(); if (c >= 0) for (const p of gasPts) g.drawImage(gasImg, c * 64, row * 64, 64, 64, (p[0] - 32) * zoom, (p[1] - 52) * zoom, 64 * zoom, 64 * zoom); }
  };
  fxLayer(0);
  shadow(g, foot[0], foot[1], 20, 5);
  drawBoss(g, skill ? bossFrameAt(skill, t) : ANIMS.idle.col + (Math.floor(ts / 1000 * 12) % 12), 0, false, bx, by);
  for (const h of heroes) { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); }
  fxLayer(1);
  if (skill && t > skill.windupMs + (skill.thenMs || 0) + 5000) skill = null;
}
requestAnimationFrame(function loop(ts) {
  const A = ANIMS[anim];
  if (ts - last >= 1000 / A.fps) {
    last = ts;
    if (frame < A.n - 1) frame++;
    else if (A.loop) frame = 0;
    else if (++held > A.fps) { held = 0; frame = 0; }
  }
  draw();
  drawArena(ts);
  requestAnimationFrame(loop);
});
</script>
</body>
</html>
`;
}

/** Всё для утверждения: листы анимаций, общий лист, эффекты мира, монтажи и страница просмотра. */
export function writeAbominationArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => {
    const f = path.join(outDir, name);
    c.save(f);
    files.push(f);
    return c;
  };
  const sheets = {} as Record<AbomAnim, PC>;
  for (const a of Object.keys(ABOM_ANIMS) as AbomAnim[]) sheets[a] = save(buildAbomAnim(a), `${ID}-${a}.png`);
  const sheet = save(buildAbomSheet(sheets), `${ID}-sheet.png`);
  const maw = save(buildMawFx(), `${ID}-mawfx.png`);
  const gas = save(buildGasFx(), `${ID}-gasfx.png`);
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "bosses", "20.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  save(buildPreview(sheets, maw, gas, hero, terrain), `${ID}-preview.png`);
  save(buildCompare(sheets, ref), `${ID}-compare.png`);
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "zone-bosses.json"), "utf8")) as { bosses: { id: string; abilities: SkillCard[] }[] };
  const skills = (data.bosses.find((b) => b.id === ID)?.abilities ?? []).map(({ id, name, windupMs, r, r2, arc, count, then }) => ({
    id, name, windupMs, r, r2, arc, count, then: then?.map((t) => ({ windupMs: t.windupMs, r: t.r })), thenMs: then?.[0]?.windupMs,
  }));
  const html = path.join(outDir, `${ID}.html`);
  fs.writeFileSync(html, buildHtml(sheet, maw, gas, hero, terrain, skills), "utf8");
  files.push(html);
  return files;
}
