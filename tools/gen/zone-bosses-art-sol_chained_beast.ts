/**
 * Босс зоны (задача 136, шаг 3): Лютобор Цепной, зверь Шепчущего леса (Сольгард, 30–40; data/zone-bosses.json,
 * id sol_chained_beast; образец tools/out/refs/bosses/12.png — только для сравнения, в игру и в git не идёт).
 * Тем же способом, что пилот-древень (tools/gen/zone-bosses-art.ts): скелет в 3D, объёмные примитивы, луч на пиксель,
 * свет сверху слева → 5 тонов на материал, контур 1 px; корпус и голова — жёсткий слой, сдвигается целыми пикселями
 * (snapPx), глаза, клыки и нос — штампы. В игру пока не подключён: механика — шаг 4.
 *
 * Лист: кадр 64×64, ступни на y = 60, строки — вниз, вверх, вбок вправо (влево — отражение); столбцы — BEAST_ANIMS.
 * Зверь сутулый, косматый: грива и шипы на плечах и предплечьях в силуэте, руки длинные — кисти у колен, на запястьях
 * ржавые кандалы, от них к земле — две цепи (одно звено правой — с выцветшим золотым знаком Солнечного Щита).
 * Цепи — не примитивы, а звенья в целых пикселях вдоль ломаной в мире (с проверкой глубины по телу): так звено
 * не «кипит» и читается при любом положении.
 *
 * Умения карточки — связки «замах → удержание по кругу → удар» (BEAST_SKILLS): «Цепной круг» (раскрутка, удар вплотную,
 * цепи на всю длину, удар кольцом), «Шипастый прыжок» (пригнулся, прыжок, приземление шипами вниз — кадр hit),
 * «Травля» (вой — метит добычу, затем три удара когтями по меткам). Эффекты мира — отдельные листы:
 * sol_chained_beast-chainfx.png (удар цепи о землю: дуга 56 px, ими выкладывается кольцо), -lungefx.png (приземление),
 * -huntfx.png (следы когтей в метке). В удержании «Цепного круга» обе цепи по кольцу вокруг корпуса (ringPair), над головой —
 * кольцо шире плеч, кисти разведены — морда открыта. Вбок: вытянутая морда с двумя клыками, узкие шипы веером по плечу,
 * ноги разведены и в два тона, ближняя лапа с цепью и когтями вынесена вперёд.
 *
 * Запуск: npx tsx tools/gen/zone-bosses.ts art → tools/out/zone-bosses/sol_chained_beast-*.png и sol_chained_beast.html.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "./canvas";
import type { ZView } from "./zone-bosses-art";

const ID = "sol_chained_beast";
const N = 64;
const CX = 32, GY = 60;
/** Наклон камеры — как у пилота. */
const CAM = (14 * Math.PI) / 180;
const CS = Math.cos(CAM), SN = Math.sin(CAM);
/** Подъём в мире на PX — ровно 1 px кадра по вертикали. */
const PX = 1 / CS;
const VIEWS: ZView[] = ["down", "up", "side"];

// ---------------- палитра: 5 тонов на материал (глубокая щель → тень → середина → свет → блик) ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Тёмная шерсть: почти чёрная, тёплая; свет — бурый. */
const FUR = R("#120e10", "#221a1b", "#352a28", "#4d3d35", "#6a5644");
/** Серо-коричневая кожа: грудь, плечи, морда. */
const SKIN = R("#2a221e", "#4a3e35", "#6c5c4d", "#8e7b65", "#b1a084");
/** Кожаные ремни и обмотки — темнее и краснее кожи. */
const LEATHER = R("#1c120e", "#352119", "#503322", "#6c482d", "#8c6339");
/** Шипы: вороная сталь с холодным бликом. */
const HORN = R("#131218", "#272730", "#42434c", "#686a73", "#a2a4aa");
/** Ржавое железо: цепи и кандалы. */
const RUST = R("#1c130f", "#3a271d", "#5c3c29", "#835a39", "#a87c52");
/** Кость: когти, клыки, амулеты. */
const BONE = R("#4a4034", "#7b6f5a", "#ac9f80", "#d6cbab", "#f4eedb");
/** Золото знака Солнечного Щита (выцветшее — без блика). */
const GOLD = R("#5a380e", "#9a6418", "#d6a030", "#f6d05a", "#fff0b0");
const EYE = R("#5a0c08", "#b81c12", "#ff4628", "#ffb48c");
/** Пыль и земля. */
const DUST = R("#4a3a28", "#7a6448", "#a48c66", "#c8b48c");
const EARTH = R("#20160f", "#3a2a1c", "#5a442e", "#7c6345", "#a3875f");
/** След удара и вспышка: холодная сталь (когти и цепи), без полупрозрачности. */
const SMEAR = R("#7d7468", "#c9c0ae", "#f4efe2");
/** След конца цепи: ржавая сталь, темнее следа когтей. */
const CHAIN_SMEAR = R("#2a1c15", "#4a3224", "#6e4c33");
const FLASH = R("#e0a050", "#fff0c0", "#fffbea");
const SPARK = R("#b0461c", "#ff9a3a", "#ffe08a");
const OUT = hex("#110b0b");

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

// ---------------- примитивы ----------------
const M_FUR = 0, M_GOLD = 1, M_SKIN = 2, M_LEATHER = 3, M_HORN = 4, M_RUST = 5, M_BONE = 6, M_MANE = 7;
interface MatDef { ramp: Ramp; base: number; gain: number; lo: number; hi: number }
/**
 * Тон = base + gain·(n·L). Обращённое к зрителю — середина (2), к свету — свет (3), блик (4) — только близко к направлению
 * света; lo/hi — пределы тона (ниже lo — только глубокие щели). Шерсть и грива темнее кожи: силуэт зверя — тёмная масса,
 * светлые — грудь, морда, кость и сталь шипов.
 */
const MATS: MatDef[] = [
  { ramp: FUR, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: GOLD, base: 1.5, gain: 2.4, lo: 1, hi: 3 },
  { ramp: SKIN, base: 1.45, gain: 2.4, lo: 1, hi: 4 },
  { ramp: LEATHER, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: HORN, base: 1.6, gain: 2.6, lo: 1, hi: 4 },
  { ramp: RUST, base: 1.5, gain: 2.4, lo: 1, hi: 4 },
  { ramp: BONE, base: 1.6, gain: 2.2, lo: 1, hi: 4 },
  { ramp: FUR, base: 1.3, gain: 2.4, lo: 1, hi: 4 },
];

interface Prim {
  /** 0 — конус со скруглёнными концами (шар, если a = b), 1 — эллипсоид */
  k: number;
  a: V3; b: V3; ra: number; rb: number;
  ax: [V3, V3, V3]; r: V3;
  mat: number; g: number; part: number;
  /** текстура: 0 — гладко, 1 — кора (борозды вдоль оси), 2 — листва */
  tex: number; ng: number; ref: V3; seed: number;
  /** золотой пояс: доля длины конуса или координата эллипсоида −1..1 по оси bandAx (по умолчанию — высота) */
  band?: [number, number]; bandAx?: number;
  /** мох на верхних гранях 0..1; поправка тона (пряди бороды); золотая кромка по краю в кадре: 1 — нижний, 2 — верхний */
  moss: number; tone: number; rim: number;
  /** производные (в пространстве вида) */
  sph: boolean; ba: V3; l2: number; rr: number; a2: number; il2: number; len: number; bc: V3; br: number;
}
interface Opt { mat?: number; tex?: number; ng?: number; ref?: V3; seed?: number; band?: [number, number]; bandAx?: number; moss?: number; part?: number; tone?: number; rim?: number }

/** Штамп: лицо (брови, глаза, рот) или руна — готовый рисунок в целых пикселях у точки на поверхности. */
interface Stamp { kind: "face" | "rune"; at: V3; n: V3; glow: number; v?: number }
/** Частица в мире: лист, ком земли, щепка; size 2 — пиксель и тёмный под ним. */
interface Mote { p: V3; col: RGBA; dark?: RGBA; size?: number }
/** Плоский клуб пыли у земли (координаты модели, z — высота клуба над землёй). */
interface Puff { c: V3; k: number; seed: number }

class Scene {
  prims: Prim[] = [];
  gk: number[] = [];
  stamps: Stamp[] = [];
  motes: Mote[] = [];
  puffs: Puff[] = [];
  /** след удара: точки пути кулака (мир), рука; вспышка удара */
  smears: { pts: V3[]; arm: number; chain?: boolean }[] = [];
  flash: { at: V3; k: number } | null = null;
  /** цепи: от кандалов a (мир) — своя ломаная pts (мир) или висит к земле и ложится остатком по drag */
  chains: { a: V3; pts: V3[] | null; s: number; drag: V3; len: number; flip: number }[] = [];
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
      mat: o.mat ?? M_FUR, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, ref: o.ref ?? perp(ax, [0, 1, 0.01]),
      seed: o.seed ?? 0, band: o.band, moss: o.moss ?? 0, tone: o.tone ?? 0, rim: o.rim ?? 0,
      sph: false, ba: [0, 0, 0], l2: 0, rr: 0, a2: 0, il2: 0, len: 0, bc: a, br: 0,
    });
  }
  ball(g: number, c: V3, r: number, o: Opt = {}): Prim {
    return this.cone(g, c, r, c, r, o);
  }
  ell(g: number, c: V3, r: V3, ax: [V3, V3, V3], o: Opt = {}): Prim {
    return this.push({
      k: 1, a: c, b: c, ra: 0, rb: 0, ax, r,
      mat: o.mat ?? M_FUR, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, ref: ax[0],
      seed: o.seed ?? 0, band: o.band, bandAx: o.bandAx, moss: o.moss ?? 0, tone: o.tone ?? 0, rim: o.rim ?? 0,
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
  /** сдвиг тела: x — вправо от зверя, y — вперёд, z — вверх (прыжок); в кадре — на целые пиксели */
  root: V3;
  /** таз выше/ниже покоя (мир; в кадре — на целые пиксели) */
  bob: number;
  /** дыхание: подъём груди с плечами и головой и головы сверх груди — целые пиксели кадра */
  chest: number; headZ: number;
  /** корпус: наклон вперёд, разворот, крен (рад) */
  pitch: number; yaw: number; roll: number;
  /** голова относительно корпуса */
  hp: number; hy: number; hr: number;
  /** запястья в мире: [правое, левое]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** щиколотки в мире и наклон ступни (носок вверх > 0) */
  foot: [V3, V3]; toe: [number, number];
  /** отставание гривы: целые пиксели кадра [вправо, вниз] */
  mane: [number, number];
  /** подъём руки целиком — целые пиксели кадра («дрожь» в удержании без пересчёта руки) */
  armLift: [number, number];
  /** свечение глаз 0..1.5; сжатие когтей 0..1; пасть 0..1 (рык) */
  glow: number; fist: number; jaw: number;
  /**
   * Цепи: свои ломаные в мире (null — висят от кандалов к земле и лежат концом по направлению drag).
   * chainLen — длина цепи (мир); на земле лежит остаток.
   */
  chain: [V3[] | null, V3[] | null]; drag: [V3, V3]; chainLen: number;
  /** пыль от шага [пр, лев] 0..1; вспышка удара 0..1; пыль и комья у кистей / у ступней 0..1 */
  dust: [number, number]; flash: number; clods: number;
  /** искры у концов цепей (удар о землю) 0..1 */
  sparks: number;
  /** след удара: путь кисти (мир) и чья рука; trail2 — след второй руки или конца цепи */
  trail?: V3[]; trailArm?: number; trail2?: V3[]; trail2Arm?: number;
  /** след — от конца цепи: ржавый, узкий, за телом прячется */
  trailChain?: boolean;
  /** цепи по кругу: смена чётности звеньев (0/1) — звенья «бегут» по кольцу без сдвига самой цепи */
  chainFlip?: number;
  puff?: number;
  /** фаза кадра 0..1 и номер кадра — для частиц */
  t: number; seed: number;
}

const REST_HAND: [V3, V3] = [[19.0, 6.4, 15.0], [-19.0, 6.4, 15.0]];
const REST_DRAG: [V3, V3] = [norm([0.55, -0.85, 0]), norm([-0.55, -0.85, 0])];
const REST: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.3, yaw: 0, roll: 0, hp: -0.22, hy: 0, hr: 0,
  hand: REST_HAND, pole: [[0.9, -1, 0.1], [-0.9, -1, 0.1]],
  foot: [[7.6, 1.8, 3.6], [-7.6, -0.8, 3.6]], toe: [0, 0],
  mane: [0, 0], armLift: [0, 0], glow: 1, fist: 0.2, jaw: 0,
  chain: [null, null], drag: REST_DRAG, chainLen: 23,
  dust: [0, 0], flash: 0, clods: 0, sparks: 0, t: 0, seed: 1,
};

const HIP0 = 17;
const NECK: V3 = [0, 2.0, 39];
/** Длины костей руки: плечо, предплечье — длинные, кисти у колен. */
const ARM: [number, number] = [11.6, 12.4];
/** Вбок: шипы ближнего плеча — основание (модель), направление, длина; веер в плоскости профиля. */
const SIDE_SPIKES: [V3, V3, number][] = [
  [[11.0, -1.0, 42.4], [0.05, -0.2, 1], 8.6],
  [[13.0, -3.0, 41.6], [0.05, -0.8, 1], 9.6],
  [[14.0, -4.6, 39.0], [0.05, -1.25, 0.5], 9.4],
  [[14.4, -5.4, 35.4], [0.05, -1, 0.0], 7.6],
];
/** Звено цепи со знаком Солнечного Щита (правая цепь, считая от кандалов). */
const SIGN_LINK = 1;

/** Зверь в координатах модели. */
function beast(p0: Pose, view: ZView): Scene {
  const S = new Scene();
  // вбок: корпус и голова чуть повёрнуты к зрителю (три четверти) — видны грудь, морда и оба глаза
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.22, hy: p0.hy - 0.3 } : p0;
  const pel: V3 = add([0, 0, HIP0], snapPx(view, [p.root[0], p.root[1], p.bob + p.root[2]]));
  const up = p.chest * PX, hz = p.headZ * PX;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  /** Точка корпуса: верх тела (выше пояса) поднимается при вдохе целиком — жёстко, без растяжения. */
  const T = (v: V3, lift = v[2] >= 25): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PV = (v: V3): V3 => add(pel, rot(sub(v, [0, 0, HIP0]), 0.06, p.yaw * 0.35, p.roll * 0.5));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0, yaw = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, yaw, roll)), f(rot([0, 1, 0], pitch, yaw, roll)), f(rot([0, 0, 1], pitch, yaw, roll)),
  ];
  const sides: [number, number][] = [[0, 1], [1, -1]];
  /** Шип: от основания наружу, вороная сталь; основание утоплено в деталь. */
  const spike = (g: number, base: V3, dir: V3, len: number, r = 1.7, seed = 0) =>
    S.cone(g, base, r, add(base, mul(norm(dir), len)), 0.3, { mat: M_HORN, seed, part: S.newPart() });
  /**
   * Вбок «наружу» (±X) уходит вдоль луча: шип смотрит на зрителя и в силуэт не выходит. Вбок шипы плеч и предплечий
   * клонятся назад (−Y модели) — гребнем по спине и рукам, как на образце в профиль; спереди и сзади — как были.
   */
  const SIDE = view === "side";

  // ---------- туловище: голый торс, широкая грудь, тяжёлые трапеции ----------
  const gBody = S.group(2.2);
  S.cone(gBody, PV([0, 0.2, 18.5]), 7.0, T([0, 0.6, 26.0]), 8.0, { mat: M_SKIN, seed: 1 });
  S.ell(gBody, T([0, 0.6, 31.8]), [11.4, 8.2, 7.6], axes(TV), { mat: M_SKIN, seed: 2 });
  S.cone(gBody, T([-9.0, -0.6, 36.0]), 5.4, T([9.0, -0.6, 36.0]), 5.4, { mat: M_SKIN });
  // спина под шерстью: косматый горб от загривка до лопаток
  S.ell(S.group(0), T([0, -5.6, 34.6]), [10.6, 4.4, 6.8], axes(TV), { mat: M_MANE, tex: 1, ng: 9, seed: 4 });
  // грудные мышцы и пресс — отдельные детали: между ними складки тоном тени
  for (const [, s] of sides) {
    const g = S.group(0);
    S.ell(g, T([s * 4.8, 6.2, 32.4]), [5.0, 2.6, 3.6], axes((v) => TV(rot(v, 0, s * 0.3))), { mat: M_SKIN, seed: 5 + s });
  }
  {
    const g = S.group(0.6);
    for (const [z, w] of [[27.6, 2.4], [24.4, 2.2]] as [number, number][]) for (const s of [-1, 1]) S.ell(g, T([s * 1.9, 6.6 - (28 - z) * 0.08, z]), [w, 1.6, 1.5], axes(TV), { mat: M_SKIN, seed: 8, part: S.newPart() });
  }

  // ---------- пояс: тёмная полоса с мехом, костяные амулеты, рваная набедренная повязка ----------
  {
    const g = S.group(0.8);
    S.ell(g, PV([0, 0.4, 19.6]), [8.4, 6.8, 2.0], axes((v) => rot(v, 0.06, p.yaw * 0.35, p.roll * 0.5)), { mat: M_LEATHER, seed: 9 });
    const gF = S.group(0.5);
    const flap = (x: number, y: number, z0: number, z1: number, w: number, k: number) =>
      S.cone(gF, PV([x, y, z0]), w, PV([x * 1.05, y + 0.6 * Math.sign(y), z1]), w * 0.7, { mat: M_LEATHER, seed: 90 + k, part: S.newPart(), tone: k % 2 ? -0.4 : 0.2 });
    flap(-2.0, 6.6, 18.4, 9.6, 1.9, 0);
    flap(1.4, 6.8, 18.4, 8.0, 1.8, 1);
    flap(4.2, 5.8, 18.2, 11.0, 1.5, 2);
    flap(0, -6.6, 18.4, 10.4, 3.0, 3);
    // амулеты: костяшки на шнурках
    for (const [x, z] of [[-4.6, 15.6], [3.2, 14.6]] as [number, number][]) {
      const ga = S.group(0);
      S.cone(ga, PV([x, 7.8, z + 1.2]), 0.9, PV([x, 8.0, z - 1.0]), 0.7, { mat: M_BONE, seed: 95 });
    }
  }

  // ---------- ноги: бёдра в кожаных обмотках, косматые голени, когтистые лапы ----------
  for (const [i, s] of sides) {
    const g = S.group(1.4);
    const hip = PV([s * 5.4, 0.2, 17.0]);
    // вбок ноги разведены шагом (ближняя вперёд, дальняя назад) и дальняя темнее — две ноги, а не один ком
    const an = SIDE ? add(p.foot[i], [0, i ? -2.6 : 2.6, 0]) : p.foot[i];
    const far = SIDE && i === 1 ? -0.8 : 0;
    const kn = ik(hip, an, 7.4, 7.6, [s * 0.35, 1, 0.1]);
    S.cone(g, hip, 5.0, kn, 4.0, { mat: M_LEATHER, tex: 1, ng: 4, ref: perp(sub(kn, hip), [s, 0, 0]), seed: 30 + i, tone: far });
    const gS = S.group(1.0);
    S.cone(gS, add(kn, [0, 0.3, -0.6]), 4.3, an, 3.6, { mat: M_FUR, tex: 1, ng: 6, ref: perp(sub(an, kn), [s, 0, 0]), seed: 32 + i, tone: far });
    const tp = p.toe[i];
    const fc = add(an, rot([0, 1.6, -1.6], tp, 0));
    S.ell(gS, fc, [3.8, 4.6, 2.2], axes((v) => v, 0, tp), { mat: M_FUR, seed: 34 + i, tone: far });
    // когти ног: три вперёд
    [-1.8, 0, 1.8].forEach((o, k) => {
      const b0 = add(fc, rot([o, 3.4, -0.4], tp, 0));
      const tip = add(b0, rot([o * 0.3, 2.0, -1.0], tp, 0));
      if (tip[2] < 0.3) tip[2] = 0.3;
      const gc = S.group(0);
      S.cone(gc, b0, 0.85, tip, 0.3, { mat: M_BONE, seed: 37 + k });
    });
    // шип у колена — наружу
    if (!(SIDE && i === 1)) spike(S.group(0), add(kn, [s * 3.2, 0.6, 0.4]), SIDE ? [0.3, -1, 0.5] : [s * 1, 0.25, 0.35], 4.2, SIDE ? 1.0 : 1.3, 38);
  }

  // ---------- руки: плечо — кожа, предплечье — обмотки с шипами, на запястье — ржавые кандалы, лапа с когтями ----------
  const wristOf: [V3, V3] = [[0, 0, 0], [0, 0, 0]];
  for (const [i, s] of sides) {
    const g = S.group(1.3);
    S.armG[i] = g;
    const lift = pxToWorld(view, 0, -p.armLift[i]);
    const sh = add(T([s * 13.4, 0.0, 35.4]), lift);
    // вбок ближняя лапа выносится вперёд — с когтями и цепью на фоне, а не на бедре; дальняя — чуть назад
    const wr = add(add(p.hand[i], lift), SIDE ? (i ? [0, -1.5, 0] : [0, 6.0, 2.0]) : [0, 0, 0]);
    const el = ik(sh, wr, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, sh, 4.6, el, 3.4, { mat: M_SKIN, seed: 20 + i });
    const fa = sub(wr, el);
    const dir = norm(fa);
    // обмотки: три кожаных витка — отдельные детали, между ними швы
    const gW = S.group(0.4);
    for (let k = 0; k < 3; k++) {
      const a = add(el, mul(fa, 0.08 + k * 0.25)), b = add(el, mul(fa, 0.3 + k * 0.25));
      S.cone(gW, a, 3.1 + k * 0.3, b, 3.3 + k * 0.3, { mat: M_LEATHER, seed: 22 + k, part: S.newPart(), tone: k === 1 ? -0.9 : -0.45 });
    }
    // кандалы: ржавое кольцо у запястья
    const gM = S.group(0.3);
    S.cone(gM, add(el, mul(fa, 0.83)), 4.5, add(el, mul(fa, 0.98)), 4.5, { mat: M_RUST, seed: 26, tone: 0.3 });
    wristOf[i] = add(add(el, mul(fa, 0.95)), mul(perp(dir, TV([s, 0.3, 0])), 4.6));
    // шипы на предплечье — наружу и назад
    const outw = perp(dir, TV(view === "side" ? [s * 0.2, -0.7, 1] : [s, -0.5, 0.2]));
    // вбок шипы дальней руки не рисуем (за телом они сливаются с ближними в плиту), ближние — узкие
    if (!(SIDE && i === 1)) for (const [u, l, up] of [[0.12, 4.4, 0.6], [0.38, 5.6, 0.2], [0.62, 5.0, -0.2]] as [number, number, number][]) spike(S.group(0), add(add(el, mul(fa, u)), mul(outw, 2.8)), add(add(outw, mul(dir, -0.45)), [0, 0, up]), SIDE ? l * 0.95 : l, SIDE ? 1.05 : 1.5, 27);
    // лапа: ком с когтями — два белых когтя вниз
    const e0 = perp(dir, TV([s * 0.6, 1, 0]));
    const e1 = cross(dir, e0);
    const hc = add(wr, mul(dir, 2.6));
    const pH = S.newPart();
    S.ell(g, hc, [3.9, 3.4, 3.8], [e0, e1, dir], { mat: M_SKIN, part: pH, seed: 28 });
    const fl = 4.4 - 1.6 * p.fist;
    [-1.6, 1.2].forEach((o, k) => {
      const b0 = add(hc, add(mul(dir, 2.4), mul(e0, o)));
      const fd = norm(add(add(dir, mul(e0, o * 0.12)), mul(e1, -s * 0.5 * p.fist)));
      const gc = S.group(0);
      S.cone(gc, b0, 1.05, add(b0, mul(fd, fl)), 0.3, { mat: M_BONE, seed: 29 + k });
    });
  }

  // ---------- плечи: косматые наплечья из шерсти, по три шипа (вверх-наружу) ----------
  for (const [i, s] of sides) {
    const g = S.group(1.6);
    const c = T([s * 13.6, -0.8, 37.6]);
    S.ell(g, c, [6.4, 6.0, 4.6], axes(TV, s * 0.4), { mat: M_MANE, tex: 1, ng: 7, seed: 10 + i });
    S.ell(g, T([s * 9.0, -2.4, 40.0]), [4.6, 4.6, 3.4], axes(TV, s * 0.25), { mat: M_MANE, tex: 1, ng: 5, seed: 12 + i });
    const sp: [V3, V3, number][] = [
      [[s * 11.0, -2.0, 41.6], [s * 0.45, -0.25, 1], 6.2],
      [[s * 15.2, -1.6, 40.6], [s * 0.85, -0.2, 0.75], 6.8],
      [[s * 18.4, -0.6, 37.4], [s * 1, 0.1, 0.25], 5.6],
    ];
    if (!SIDE) sp.forEach(([b, d, l], k) => spike(S.group(0), T(b), TV(d), l, 1.8, 14 + k + i * 3));
    // вбок: 4 узких треугольника веером по плечу — вверх, вверх-назад, назад (в плоскости профиля), только ближнее плечо
    else if (i === 0) SIDE_SPIKES.forEach(([b, d, l], k) => spike(S.group(0), T(b), TV(d), l, 1.3, 14 + k));
  }

  // ---------- голова: косматый череп, светлая морда вперёд, грива в силуэте, острые уши ----------
  const gHead = S.group(1.2);
  const h = (x: number, y: number, z: number) => H([x, y, z]);
  S.ell(gHead, h(0, 5.0, 44.2), [5.6, 5.0, 5.0], axes(HV), { mat: M_FUR, tex: 1, ng: 6, seed: 40 });
  // морда: светлая, тяжёлая нижняя челюсть
  // вбок морда вытянута вперёд (профиль зверя, а не плоское лицо)
  const snout = SIDE ? 2.4 : 0;
  S.ell(gHead, h(0, 9.4 + snout, 42.4), [3.9, 3.4 + snout * 0.8, 2.9], axes(HV), { mat: M_SKIN, seed: 41 });
  S.ell(gHead, h(0, 8.8 + snout, 40.2 - 0.9 * p.jaw), [3.7, 3.0 + snout * 0.7, 1.8], axes(HV), { mat: M_SKIN, seed: 42, part: S.newPart(), tone: -0.2 });
  // надбровья
  const pBrow = S.newPart();
  for (const s of [-1, 1]) S.cone(gHead, h(s * 4.2, 8.0, 46.6), 1.3, h(s * 0.8, 10.0, 44.9), 1.4, { mat: M_SKIN, part: pBrow, tone: -0.3 });
  S.stamps.push({ kind: "face", at: h(0, 10.8, 44.6), n: HV([0, 1, 0.15]), glow: p.glow, v: p.jaw });
  // уши: короткие острые, чуть назад
  for (const s of [-1, 1]) S.cone(S.group(0), h(s * 4.0, 3.4, 47.8), 1.6, h(s * 6.4, 1.4, 51.8), 0.3, { mat: M_FUR, seed: 44 });

  // грива: космы вокруг головы и по загривку, концами наружу и назад; отстаёт на целые пиксели
  const gMane = S.group(0.9);
  const lag = pxToWorld(view, p.mane[0], p.mane[1]);
  S.ell(gMane, add(T([0, -3.4, 42.0], true), [0, 0, hz]), [9.0, 5.6, 5.6], axes(TV), { mat: M_MANE, tex: 1, ng: 8, seed: 46 });
  const lock = (from: V3, to: V3, r: number, k: number) =>
    S.cone(gMane, h(...from), r, add(h(...to), lag), 0.4, { mat: M_MANE, tex: 1, ng: 2, seed: 50 + k, tone: k % 2 ? -0.35 : 0.2 });
  const locks: [V3, V3, number][] = [
    [[0, 1.6, 47.8], [0.6, -2.4, 53.4], 2.1],
    [[2.8, 1.8, 47.4], [5.8, -2.0, 52.2], 1.9],
    [[-2.8, 1.8, 47.4], [-5.6, -2.2, 52.4], 1.9],
    [[4.8, 2.6, 45.2], [10.0, -0.4, 47.6], 1.9],
    [[-4.8, 2.6, 45.2], [-10.0, -0.6, 47.8], 1.9],
    [[5.2, 4.0, 42.2], [9.6, 2.6, 40.6], 1.7],
    [[-5.2, 4.0, 42.2], [-9.6, 2.4, 40.8], 1.7],
    [[0, -1.6, 46.6], [0, -7.0, 49.8], 2.1],
    [[3.8, -1.4, 45.6], [7.6, -6.0, 47.6], 1.9],
    [[-3.8, -1.4, 45.6], [-7.6, -5.8, 47.8], 1.9],
  ];
  locks.forEach(([a, b, r], k) => lock(a, b, r, k));

  particles(S, p);
  // цепи: от кандалов (wristOf — уже со сдвигом руки)
  S.chains = [0, 1].map((i) => ({ a: wristOf[i], pts: p.chain[i], s: i ? -1 : 1, drag: p.drag[i], len: p.chainLen, flip: Math.round(p.chainFlip ?? 0) % 2 }));
  return S;
}

/** Ближе к зрителю, чем на FOOT_Y (вид), цепь на земле не ложится: при наклоне камеры ушла бы под нижний край кадра. */
const FOOT_Y = 10;
/**
 * Цепь висит от кандалов к земле дугой наружу и ложится остатком по направлению drag. Всё — в пространстве вида
 * (s — наружу по экрану), шаг ≈ 1 px. Гибкая цепь: где ей лечь, решает вид, а не мир.
 */
function hangChain(W: V3, s: number, drag: V3, len: number): V3[] {
  const h = Math.max(0.5, W[2]);
  const G: V3 = [W[0] + s * 1.2 + drag[0] * 1.5, Math.min(FOOT_Y, W[1] + 1.4 + drag[1] * 1.5), 0.5];
  const pts: V3[] = [];
  const nh = Math.max(3, Math.ceil(h));
  for (let k = 0; k <= nh; k++) {
    const u = k / nh;
    const q = lerpV(W, G, u);
    // к зрителю цепь уходит только у самой земли: висит перед ногой, а не за ней
    pts.push([q[0] + s * 1.6 * Math.sin(Math.PI * u) * Math.min(1, h / 8), lerp(W[1], G[1], u * u * u), 0.5 + (h - 0.5) * Math.pow(1 - u, 1.15)]);
  }
  let rest = len - h * 1.1;
  let c = G;
  while (rest > 0) {
    const st = Math.min(1, rest);
    c = add(c, mul(drag, st));
    c[1] = Math.min(FOOT_Y, c[1]);
    c[0] = clamp(c[0], -29, 29);
    pts.push(c);
    rest -= st;
  }
  return pts;
}

/** Частицы: пыль от шага, пыль и комья у кистей, искры у концов цепей, след удара и вспышка. */
function particles(S: Scene, p: Pose) {
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) S.puffs.push({ c: [p.foot[i][0], p.foot[i][1] + 1, 0], k: p.dust[i], seed: i });
  if (p.clods > 0.02) {
    for (let i = 0; i < 2; i++) {
      const c: V3 = [p.foot[i][0] * 1.3, p.foot[i][1] + 2, 0];
      S.puffs.push({ c, k: p.clods, seed: 10 + i });
      const f = 1 - p.clods;
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI + 0.3 + i * 0.5;
        S.motes.push({
          p: [c[0] + Math.cos(ang) * (2 + 6 * f) * (i ? -1 : 1), c[1] + Math.sin(ang) * 2, 1.5 + 8 * f * (1 - f) * 2.2],
          col: DUST[1], dark: DUST[0], size: 2,
        });
      }
    }
  }
  if (p.trail && p.trail.length > 1) S.smears.push({ pts: p.trail, arm: p.trailArm ?? 0, chain: p.trailChain });
  if (p.trail2 && p.trail2.length > 1) S.smears.push({ pts: p.trail2, arm: p.trail2Arm ?? 1, chain: p.trailChain });
  if ((p.puff ?? 0) > 0.02) {
    const hnd = p.hand[p.trailArm ?? 0];
    S.puffs.push({ c: [hnd[0], hnd[1] + 2, 0], k: p.puff!, seed: 30 });
  }
  if (p.flash > 0.02) {
    const hnd = p.hand[p.trailArm ?? 0];
    S.flash = { at: [hnd[0], hnd[1] + 3, Math.max(1.5, hnd[2] - 2)], k: p.flash };
  }
}

// ---------------- штампы морды: брови, глаза, нос, пасть, клыки ----------------
/**
 * Рисунки в целых пикселях от точки привязки (dx вправо, dy вниз) — переносица на линии глаз. Ключи: D — тёмная бровь,
 * 1–3 — свечение глаза (ярче — выше), n — нос, m — пасть, f — клык (кость, светлый), g — клык в тени.
 * Три клыка: два верхних по краям пасти вниз, нижний — посередине вверх.
 */
type StampPx = [number, number, string];
const faceRows = (rows: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") out.push([x0 + i, y0 + j, ch]); }));
  return out;
};
const ST_FACE_DOWN = [
  faceRows([
    "DD.....DD",
    ".DD...DD.",
    "..23.32..",
    ".........",
    "...nnn...",
    ".........",
    "..mmmmm..",
    "..f.g.f..",
  ], -4, -2),
  faceRows([
    "DD.....DD",
    ".DD...DD.",
    "..23.32..",
    ".........",
    "...nnn...",
    "..fmmmf..",
    "..fmmmf..",
    "...mgm...",
  ], -4, -2),
];
/** Вбок: морда вытянута — нос на конце (nn), пасть вдоль морды, два верхних клыка по 2 px вниз. */
const ST_FACE_SIDE = [
  faceRows([
    "DD........",
    ".DD..D....",
    "..23.2....",
    "..........",
    "........nn",
    "..........",
    "...mmmmmm.",
    "...f...f..",
    "...f...f..",
  ], -3, -2),
  faceRows([
    "DD........",
    ".DD..D....",
    "..23.2....",
    "..........",
    "........nn",
    "...fmmmmf.",
    "...fmmmmf.",
    "....mmmgm.",
  ], -3, -2),
];

function drawStamps(body: PC, sc: Scene, view: ZView, gb: GBuf) {
  const glow = new Float32Array(N * N);
  const emis = new Uint8Array(N * N);
  for (const st of sc.stamps) {
    if (view === "up") continue;
    const a = toView(view, st.at), nv = toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < 0.12) continue;
    const [sx, sy] = scr(a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    if (gb.prim[i0] < 0 || gb.t[i0] < depthOf(a) - (view === "side" ? 7 : 2.4)) continue;
    const g = clamp(st.glow, 0, 1.5);
    const set = view === "side" ? ST_FACE_SIDE : ST_FACE_DOWN;
    for (const [dx, dy, key] of set[(st.v ?? 0) > 0.5 ? 1 : 0]) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (gb.prim[i] < 0) continue;
      if (key === "D") body.set(x, y, SKIN[0]);
      else if (key === "n") body.set(x, y, FUR[0]);
      else if (key === "m") body.set(x, y, OUT);
      else if (key === "f") body.set(x, y, BONE[4]);
      else if (key === "g") body.set(x, y, BONE[2]);
      else {
        // глаз: при гибели гаснет ступенями — ниже нуля остаётся тёмная глазница
        const lv = +key;
        const k = lv - Math.round((1 - Math.min(1, g)) * 3);
        body.set(x, y, k < 0 ? FUR[0] : EYE[clamp(k + (g > 1.2 ? 1 : 0), 0, 3)]);
        if (k >= 0) glow[i] = Math.max(glow[i], Math.min(1, g) * (lv / 3));
      }
      emis[i] = 1;
    }
  }
  // красный отсвет глаз на морде и шерсти — ступенями (2 уровня)
  const GLOW_R = hex("#ff3a20");
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0 || emis[i]) continue;
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      v += glow[yy * N + xx] * (dx === 0 || dy === 0 ? 1 : 0.6);
    }
    v /= 3.2;
    const lv = v > 0.42 ? 2 : v > 0.2 ? 1 : 0;
    if (!lv) continue;
    body.set(x, y, mix(body.get(x, y)!, GLOW_R, [0, 0.22, 0.4][lv]));
  }
}

// ---------------- цепи: звенья в целых пикселях ----------------
/**
 * Звенья чередуются: кольцо «плашмя» (ромб 3×3 с дыркой) и звено «на ребре» (штрих 3 px). Шаблон — по направлению цепи
 * в кадре (вертикаль, горизонталь, две диагонали); тон: верх-лево — свет, низ-право — тень. Шаг — 3 px.
 */
type LinkPx = [number, number, number];
const LINK_T: Record<string, [LinkPx[], LinkPx[]]> = {
  v: [[[0, -2, 4], [-1, -1, 3], [1, -1, 2], [-1, 0, 2], [1, 0, 1], [0, 1, 1]], [[0, -1, 3], [0, 0, 2], [0, 1, 2]]],
  h: [[[-2, 0, 4], [-1, -1, 3], [-1, 1, 2], [0, -1, 2], [0, 1, 1], [1, 0, 1]], [[-1, 0, 3], [0, 0, 2], [1, 0, 2]]],
  d1: [[[-1, -1, 4], [0, -1, 3], [-1, 0, 3], [1, 0, 1], [0, 1, 1], [1, 1, 1]], [[-1, -1, 3], [0, 0, 2], [1, 1, 2]]],
  d2: [[[0, -1, 4], [1, -1, 2], [-1, 0, 3], [1, 0, 1], [-1, 1, 2], [0, 1, 1]], [[1, -1, 3], [0, 0, 2], [-1, 1, 2]]],
};

/** Звенья цепей поверх тела (с проверкой глубины): [x, y, цвет]. Конец каждой цепи — для искр. */
function chainPixels(chains: Scene["chains"], view: ZView, gb: GBuf): { px: [number, number, RGBA][]; ends: [number, number][]; front: Uint8Array } {
  const px: [number, number, RGBA][] = [];
  /** звено перед телом — ему нужен свой контур поверх шерсти */
  const front = new Uint8Array(N * N);
  const ends: [number, number][] = [];
  chains.forEach((c, ci) => {
    const flip = c.flip;
    const a = toView(view, c.a);
    // наружу по экрану: в виде вверх (со спины) правая рука — слева
    const sx = view === "down" ? -c.s : view === "up" ? c.s : 0;
    const pts: V3[] = c.pts
      ? [a, ...c.pts.map((w) => { const v = toView(view, w); return [v[0], Math.min(Math.max(FOOT_Y, (2 + CS * v[2]) / SN), v[1]), v[2]] as V3; })]
      : hangChain(a, sx, toView(view, c.drag), c.len);
    const sp = pts.map((v) => { const [x, y] = scr(v); return { x, y, d: depthOf(v) }; });
    // длина ломаной в кадре
    const acc = [0];
    for (let k = 1; k < sp.length; k++) acc.push(acc[k - 1] + Math.hypot(sp[k].x - sp[k - 1].x, sp[k].y - sp[k - 1].y));
    const total = acc[acc.length - 1];
    const at = (s: number) => {
      let k = 1;
      while (k < sp.length - 1 && acc[k] < s) k++;
      const u = clamp((s - acc[k - 1]) / Math.max(1e-3, acc[k] - acc[k - 1]), 0, 1);
      const a = sp[k - 1], b = sp[k];
      return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), d: lerp(a.d, b.d, u), dx: b.x - a.x, dy: b.y - a.y };
    };
    let li = 0;
    let last: [number, number] = [Math.floor(sp[0].x), Math.floor(sp[0].y)];
    for (let s = 2; s <= total + 0.5; s += 3, li++) {
      const q = at(Math.min(s, total));
      const cx = Math.floor(q.x), cy = Math.floor(q.y);
      const ang = Math.atan2(q.dy, q.dx);
      const c = Math.abs(Math.cos(ang)), sn = Math.abs(Math.sin(ang));
      const kind = sn > 0.86 ? "v" : c > 0.86 ? "h" : q.dx * q.dy > 0 ? "d1" : "d2";
      const tpl = LINK_T[kind][(li + flip) % 2];
      const gold = ci === 0 && li === SIGN_LINK * 2;
      for (const [dx, dy, tone] of tpl) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const i = y * N + x;
        if (gb.prim[i] >= 0 && gb.t[i] < q.d - 0.8) continue;
        px.push([x, y, gold ? GOLD[clamp(tone, 1, 3)] : RUST[tone]]);
        front[i] = 1;
      }
      last = [cx, cy];
    }
    ends.push(last);
  });
  return { px, ends, front };
}

/** Искры у конца цепи, ударившей о землю: короткие лучи вверх-в-стороны, 3 тона. */
function drawSparks(o: PC, x: number, y: number, k: number, seed: number) {
  const L = Math.round(1 + 3 * k);
  for (let j = 0; j < 4; j++) {
    const a = -Math.PI * (0.15 + 0.7 * (j / 3)) + (hash01(j, seed, 3) - 0.5) * 0.4;
    for (let r = 1; r <= L; r++) {
      const xx = Math.round(x + Math.cos(a) * (r + 1)), yy = Math.round(y + Math.sin(a) * (r + 1) * 0.8);
      o.set(xx, yy, SPARK[r === 1 ? 2 : r < L ? 1 : 0]);
    }
  }
}

/** Кадр зверя в виде view. */
function renderBeast(view: ZView, pose: Pose): PC {
  const sc = beast(pose, view);
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) prepare(q, view);
  const gb = raster(prims, sc.gk);
  const L = shade(prims, sc.gk, gb);
  const body = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    body.set(i % N, Math.floor(i / N), MATS[L.mat[i]].ramp[L.idx[i]]);
  }
  drawStamps(body, sc, view, gb);
  const ch = chainPixels(sc.chains, view, gb);
  // контур звеньев поверх тела: 1 px тёмным там, где звено граничит с шерстью (снаружи тела — общий контур ниже)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (ch.front[i] || gb.prim[i] < 0) continue;
    let nb = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && ch.front[yy * N + xx]) nb = true;
    }
    if (nb) body.set(x, y, OUT);
  }
  for (const [x, y, c] of ch.px) body.set(x, y, c);
  body.outline(OUT);
  sealPinholes(body);

  // ---------- сборка: тело с цепями, след удара, пыль, частицы, искры, вспышка ----------
  const out = new PC(N, N);
  out.blit(body, 0, 0);
  for (const sm of sc.smears) drawSmear(out, sm, view, gb, prims, sc.armG[sm.arm]);
  for (const f of sc.puffs) drawPuff(out, f, view);
  for (const m of sc.motes) drawMote(out, m, view, gb);
  if (pose.sparks > 0.02) ch.ends.forEach(([x, y], k) => drawSparks(out, x, y, pose.sparks, pose.seed + k));
  if (sc.flash) drawFlash(out, sc.flash, view);
  sealPinholes(out, true);
  return out;
}

// ---------------- кадр: луч на пиксель, свет, тон ----------------
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

/** Текстурные координаты точки на примитиве: u — вдоль оси, ang — вокруг неё, l — местные координаты для шума. */
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
    const tx = texAt(q, p);
    // железный пояс (кольцо кандалов по доле длины)
    const bu = q.k === 1 && q.bandAx !== undefined ? tx.l[q.bandAx] / q.r[q.bandAx] : tx.u;
    if (q.band && bu >= q.band[0] && bu <= q.band[1]) mat = M_RUST;
    const md = MATS[mat];
    const lum = dot(n, LIGHT);
    L.lum[i] = lum;
    let tn = md.base + md.gain * lum + (mat === q.mat ? q.tone : 0);
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
    L.mat[i] = mat;
    L.part[i] = q.part;
    // борозды коры: поле уровня, видно там, где поверхность смотрит на зрителя; редкие и длинные
    if (q.tex === 1 && (mat === M_FUR || mat === M_MANE || mat === M_LEATHER)) {
      const facing = n[1] * CS + n[2] * SN;
      const wob = 0.14 * Math.sin(tx.u * q.len * 0.25 + q.seed * 1.7);
      gcoord[i] = (tx.ang * q.ng) / TAU + wob;
      gok[i] = facing > 0.4 && Math.abs(n[2]) < 0.72 ? 1 : 0;
      ulen[i] = tx.u * q.len;
    }
    // листва: кромки листьев — линии уровня волнистого поля в местных координатах грозди
    if (q.tex === 2 && mat === M_MANE) {
      const l = sub(p, q.a);
      const sd = q.seed;
      gcoord[i] = (Math.sin(l[0] * 1.35 + sd) + Math.sin(l[1] * 1.1 + l[2] * 0.95 + sd * 2) + Math.sin(l[2] * 1.5 - l[0] * 0.75 + sd)) * 0.9;
      gok[i] = tn > 2.1 ? 2 : 0;
      ulen[i] = 0;
    }
  }
  // сглаживание тона внутри детали: ровные границы светотени без зубцов
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
  // второй проход: борозды, швы между деталями, светлая кромка к свету
  const T2 = new Float32Array(tone);
  const bgAt = (x: number, y: number) => x < 0 || y < 0 || x >= N || y >= N || gb.prim[y * N + x] < 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0) continue;
    const md = MATS[L.mat[i]];
    let tn = tone[i];
    // у самого контура — без тёмных линий и не темнее тени: иначе край читается как контур в 2 px
    const edge = bgAt(x - 1, y) || bgAt(x + 1, y) || bgAt(x, y - 1) || bgAt(x, y + 1);
    if (gok[i] && !edge) {
      const s = Math.sin(Math.PI * gcoord[i]) >= 0;
      let crossed = false;
      for (const j of [i - 1, i - N]) {
        if ((j === i - 1 && x === 0) || j < 0) continue;
        if (gb.prim[j] !== gb.prim[i] || !gok[j]) continue;
        if (Math.sin(Math.PI * gcoord[j]) >= 0 !== s) crossed = true;
      }
      if (crossed && gok[i] === 2) tn -= 1.0;
      else if (crossed && tone[i] > 1.6 && tone[i] < 3.3) {
        // борозда — только в полутонах; длинные отрезки с редкими разрывами
        const k = Math.round(gcoord[i]);
        const seg = Math.floor(ulen[i] / 16 + hash01(k, 5, 17) * 3);
        if (hash01(k, seg, 31 + prims[gb.prim[i]].seed) > 0.3) tn -= 1.0;
      }
    }
    if (!edge) {
      // шов: соседняя деталь ближе к зрителю — тон тени (selout) при любом перепаде; почти чёрный — только в глубокой щели (ниже)
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
    // светлая кромка к свету — только у крупных форм, слева и сверху; не выше света (блик — только от формы)
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
  // золотая кромка: край детали в кадре (снизу — нижний край наплечника над рукой и грудью, сверху — верхний)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0) continue;
    const q = prims[gb.prim[i]];
    if (!q.rim) continue;
    const at = (dy: number) => {
      const yy = y + dy;
      if (yy < 0 || yy >= N) return true;
      const j = yy * N + x;
      return gb.prim[j] < 0 || (L.part[j] !== L.part[i] && gb.t[j] > gb.t[i] - 0.3);
    };
    if (((q.rim & 1) && at(1)) || ((q.rim & 2) && at(-1))) {
      L.mat[i] = M_GOLD;
      L.idx[i] = L.lum[i] > 0.45 ? 3 : L.lum[i] > -0.1 ? 2 : 1;
    }
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
      if (gb.prim[i] < 0 || L.mat[i] === M_GOLD) continue;
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
function drawSmear(o: PC, sm: { pts: V3[]; arm: number; chain?: boolean }, view: ZView, gb: GBuf, prims: Prim[], armG: number) {
  const pts = sm.pts.map((v) => scr(toView(view, v)));
  const dep = sm.pts.map((v) => depthOf(toView(view, v)));
  const pal = sm.chain ? CHAIN_SMEAR : SMEAR;
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
      const w = sm.chain ? 0.3 + 0.9 * u : 0.4 + 2.0 * Math.sin(Math.PI * Math.min(1, u * 0.62 + 0.06));
      const d = lerp(dep[k], dep[k + 1], s / steps);
      for (let j = -w; j <= w + 0.01; j += 0.5) {
        const xx = Math.round(x + nx * j), yy = Math.round(y + ny * j);
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        if (sm.chain && gb.prim[yy * N + xx] >= 0 && gb.t[yy * N + xx] < d - 0.8) continue;
        const tone = j > w - 0.9 ? 2 : j < -w + 0.9 ? 0 : 1;
        const id = yy * N + xx;
        put.set(id, Math.max(put.get(id) ?? -1, tone));
      }
    }
  }
  for (const [id, tone] of put) {
    const x = id % N, y = (id / N) | 0;
    if (near(x, y)) continue;
    o.set(x, y, pal[tone]);
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
    if (k === "trail" || k === "trailArm" || k === "trail2" || k === "trail2Arm") continue;
    // цепи и направление их волочения — ступенью: свои ломаные задаются по кадрам
    if (k === "chain") { o[k] = t < 0.5 ? a.chain : b.chain; continue; }
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


const hands = (r: V3, mirror = true, l?: V3): [V3, V3] => [r, l ?? (mirror ? [-r[0], r[1], r[2]] : r)];
const shL = (h: V3): V3 => [-h[0], h[1], h[2]];

/**
 * Покой: тяжёлое дыхание волной снизу вверх — грудь с плечами поднимается на 1 px, голова кадром позже, грива отстаёт
 * ещё на кадр; лапы с цепями догоняют плечи. Глаза тлеют ступенями.
 */
function idlePoses(n = 12): Pose[] {
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const mane = [0, 0, 0, 1, 0, 0, 0, 0, 0, -1, -1, 0];
  const hand = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0];
  return Array.from({ length: n }, (_, i) => ({
    ...REST, t: i / n, seed: 100 + i,
    chest: chest[i], headZ: head[i] - chest[i], mane: [0, mane[i]] as [number, number],
    hand: REST_HAND.map((v) => add(v, [0, 0, hand[i] * PX])) as [V3, V3],
    glow: [1, 1, 1.15, 1.25, 1.25, 1.15, 1, 1, 0.9, 0.9, 0.95, 1][i],
  }));
}

/**
 * Ходьба: сутулый тяжёлый шаг. Корпус и голова — жёсткий слой: проседает после касания и перевешивается на опорную ногу
 * ровно на целые пиксели. Длинные руки качаются навстречу ногам, цепи волочатся следом; пыль — у ступни при касании.
 */
function walkPoses(n = 12): Pose[] {
  const A = 4.8, LIFT = 4.0, DUTY = 0.56;
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
      return [s * (18.6 - 0.8 * Math.max(0, fw)) + sway[i], 6.0 + 4.4 * fw, 15.4 + 2.2 * Math.max(0, fw) + 0.6 * Math.max(0, -fw)];
    };
    return {
      ...REST, t, seed: 150 + i,
      root: [ipx(sway[i]), 0, 0], bob: bob[i] * PX, mane: [0, -bob[i]] as [number, number],
      hand: [armAt(fr, 1), armAt(fl, -1)],
      foot: [[7.6, 0.8 + fr.y, 3.6 + fr.z], [-7.6, 0.8 + fl.y, 3.6 + fl.z]], toe: [fr.toe, fl.toe],
      drag: [norm([0.35, -1, 0]), norm([-0.35, -1, 0])] as [V3, V3],
      dust: [fr.strike, fl.strike],
    };
  });
}

/** Путь кисти дугой (Безье через вынос) и след когтей по нему. */
function arcPath(P0: V3, M: V3, P2: V3) {
  const C = sub(mul(M, 2), mul(add(P0, P2), 0.5));
  const arc = (u: number): V3 => add(add(mul(P0, (1 - u) * (1 - u)), mul(C, 2 * u * (1 - u))), mul(P2, u * u));
  return arc;
}
const clawTip = (w: V3, s: number) => add(w, mul(norm(sub(w, [s * 13.4, 0, 35])), 4.6));

/**
 * Атака: удар правой лапой наискось сверху — замах за плечо, когти вперёд, быстрый удар перед собой к цели, отдача.
 * Цепь правой руки летит за лапой; след когтей — серп позади руки, удар — кадр вспышки.
 */
function attackPoses(view: ZView): Pose[] {
  const up: Partial<Pose> = {
    yaw: -0.32, pitch: 0.16, bob: 1 * PX, hp: -0.3, jaw: 1,
    hand: [[18.6, -3.0, 40.0], [-17.6, 8.6, 15.8]], pole: [[1, -0.4, 0.4], [-0.9, -1, 0.1]], glow: 1.2, fist: 0,
  };
  const peak: Partial<Pose> = { ...up, yaw: -0.38, hand: [[19.4, -4.0, 42.0], [-17.4, 9.0, 16.2]] };
  const hitHand: V3 = view === "side" ? [6.0, 15.0, 10.0] : view === "up" ? [8.0, 11.5, 10.0] : [5.0, 12.5, 10.0];
  const mid: Partial<Pose> = {
    yaw: 0.06, pitch: 0.36, bob: -1 * PX, hp: -0.2, jaw: 1,
    hand: [[22.0, 11.0, 30.0], [-17.4, 4.0, 15.0]], pole: [[1, -0.4, 0.5], [-0.9, -1, 0.1]], glow: 1.25, fist: 0,
  };
  const hit: Partial<Pose> = {
    yaw: 0.34, pitch: 0.5, roll: 0.04, bob: -3 * PX, hp: -0.1, jaw: 1,
    hand: [hitHand, [-18.0, -1.6, 16.6]], pole: [[1, -0.7, 0.3], [-0.9, -1, 0.1]], glow: 1.35, fist: 0, flash: 1,
  };
  const settle: Partial<Pose> = { ...hit, pitch: 0.46, bob: -2 * PX, jaw: 0, hand: [add(hitHand, [0.3, -0.4, 0.8]), [-18.0, -1.0, 16.0]], flash: 0 };
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
  const arc = arcPath(peak.hand![0], mid.hand![0], hitHand);
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => clawTip(arc(lerp(u0, u1, k / (n - 1))), 1));
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

// ---------------- «Цепной круг» ----------------
/**
 * Кольцо вокруг зверя: центр C, нормаль ax (мир). Угол 0 — вправо (+X модели), π/2 — вперёд (+Y), π — влево, 3π/2 — назад.
 * Цепь по кольцу (ringChain): от кандалов спиралью выходит на радиус R и дальше лежит по кольцу до угла ph1 —
 * обе цепи вместе описывают вокруг корпуса широкий эллипс. Звенья — те же штампы, глубина — по телу: перед зверем цепь
 * поверх (со своим контуром), за ним — прячется за корпус.
 */
function ringBasis(ax: V3): [V3, V3] {
  const a = norm(ax);
  const u = perp(a, [1, 0, 0]);
  return [u, cross(a, u)];
}
const ringAt = (C: V3, ax: V3, R: number, ph: number): V3 => {
  const [u, v] = ringBasis(ax);
  return add(C, add(mul(u, R * Math.cos(ph)), mul(v, R * Math.sin(ph))));
};
function ringChain(hand: V3, C: V3, ax: V3, R: number, ph1: number, out = 0.3): V3[] {
  const [u, v] = ringBasis(ax);
  const a = norm(ax);
  const h = sub(hand, C);
  const hu = dot(h, u), hv = dot(h, v), ha = dot(h, a);
  const th = Math.atan2(hv, hu), rh = Math.hypot(hu, hv);
  const len = Math.abs(ph1 - th) * R + Math.abs(R - rh);
  const n = Math.max(6, Math.ceil(len / 1.2));
  const pts: V3[] = [];
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const th1 = lerp(th, ph1, t);
    const e = smooth(0, out, t);
    const r = lerp(rh, R, e), z = lerp(ha, 0, e);
    pts.push(add(C, add(add(mul(u, r * Math.cos(th1)), mul(v, r * Math.sin(th1))), mul(a, z))));
  }
  return pts;
}
/** След по кольцу: дуга чуть снаружи цепи, от угла ph назад на span (тонкая ржавая полоса — скорость). */
function ringTrail(C: V3, ax: V3, R: number, ph: number, span: number): V3[] {
  return Array.from({ length: 8 }, (_, k) => ringAt(C, ax, R, ph - span * (1 - k / 7)));
}
/** Угол кисти на кольце (начало цепи). */
const ringAngle = (hand: V3, C: V3, ax: V3) => {
  const [u, v] = ringBasis(ax);
  const h = sub(hand, C);
  return Math.atan2(dot(h, v), dot(h, u));
};
/**
 * Обе цепи по кольцу: правая от правой кисти идёт вперёд (через +Y) почти до левой, левая от левой — назад (через −Y)
 * почти до правой (cover — доля полукруга). Вращение — против часовой сверху: звенья меняют чётность через кадр, по кольцу
 * бегут две тонкие полосы следа (полтора оборота за цикл).
 */
function ringPair(p: Pose, C: V3, ax: V3, R: number, cover: number, i: number, nFrames = 8, trail = true) {
  const tr = ringAngle(p.hand[0], C, ax), tl0 = ringAngle(p.hand[1], C, ax);
  const tl = tl0 < tr ? tl0 + TAU : tl0;
  p.chain = [ringChain(p.hand[0], C, ax, R, tr + cover * (Math.PI - 0.35)), ringChain(p.hand[1], C, ax, R, tl + cover * (Math.PI - 0.35))];
  p.chainFlip = Math.floor(i / 2) % 2;
  if (trail) {
    const ph = (i / nFrames) * TAU * 1.5 + 0.6;
    p.trail = ringTrail(C, ax, R + 1.6, ph, 0.8);
    p.trailArm = 0;
    p.trail2 = ringTrail(C, ax, R + 1.6, ph + Math.PI, 0.8);
    p.trail2Arm = 1;
    p.trailChain = true;
  }
}

/** Замах «Цепного круга»: руки в стороны на уровне пояса, цепи отрываются от земли и вместе с руками уходят в круг. */
const WHIRL: Partial<Pose> = {
  pitch: 0.24, bob: -1 * PX, hp: -0.24, jaw: 1, hand: hands([19.6, 6.0, 24.0]), pole: [[0.6, -1, -0.4], [-0.6, -1, -0.4]], glow: 1.3, fist: 0.8,
};
/** Кольцо удержания: вокруг пояса, перед зверем ниже, за спиной выше — в кадре широкий эллипс от бёдер до плеч. */
const WHIRL_C: V3 = [0, 1, 22];
const WHIRL_AX: V3 = [0, 0.34, 1];
const WHIRL_R = 29;
function whirlUpPoses(): Pose[] {
  const poses = keyed([{ f: 0, p: {} }, { f: 3, p: WHIRL, ease: easeInOut }], 4, 500);
  // цепи: висят (0) → кисти поднимаются, цепи отлетают наружу и вниз (1) → выходят на круг (2, 3) — без рывка
  poses.forEach((p, i) => {
    if (i === 0) return;
    if (i === 1) {
      p.chain = [0, 1].map((s) => {
        const h = p.hand[s], sx = s ? -1 : 1;
        return Array.from({ length: 10 }, (_, j) => {
          const t = (j + 1) / 10;
          return [h[0] + sx * 9 * t, h[1] - 3 * t, Math.max(0.8, h[2] - 14 * t + 4 * t * t)] as V3;
        });
      }) as [V3[], V3[]];
      return;
    }
    const C: V3 = add(WHIRL_C, [0, 0, i === 2 ? -6 : -2]);
    ringPair(p, C, WHIRL_AX, [0, 0, 22, 25.5][i], [0, 0, 0.35, 0.7][i], i, 8, false);
  });
  return poses;
}
/** Удержание: две цепи по кругу вокруг корпуса — 8 кадров на цикл; корпус покачивается на пиксель, глаза горят. */
function whirlHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: WHIRL }, { f: 1, p: WHIRL }], 0);
  return Array.from({ length: 8 }, (_, i) => {
    const sway = [0, 0, 1, 1, 0, 0, -1, -1][i];
    const p: Pose = { ...base, t: i / 8, seed: 520 + i, root: [sway, 0, 0], glow: [1.3, 1.45, 1.3, 1.45, 1.3, 1.45, 1.3, 1.45][i], mane: [-sway, 0] };
    p.hand = [add(p.hand[0], [sway, 0, 0]), add(p.hand[1], [sway, 0, 0])];
    ringPair(p, add(WHIRL_C, [sway, 0, 0]), WHIRL_AX, WHIRL_R, 1, i);
    return p;
  });
}
/**
 * Удар вплотную: обе цепи хлещут о землю у ног (кадр 2 — конец предупреждения), искры и пыль у концов; затем руки
 * поднимаются над головой — цепи отпущены на всю длину (дальше — «whirlWide»).
 * Над головой: кисти разведены выше макушки — лицо, глаза и клыки открыты; кольцо шире плеч, до краёв кадра.
 */
const OVER: Partial<Pose> = {
  pitch: 0.06, bob: 1 * PX, hp: -0.3, jaw: 1, hand: [[11.5, 3.0, 52.0], [-11.5, 3.0, 52.0]], pole: [[1, 0.1, -0.5], [-1, 0.1, -0.5]], glow: 1.4, fist: 0.8,
};
const WIDE_C: V3 = [0, 1, 54];
const WIDE_AX: V3 = [0, -0.1, 1];
const WIDE_R = 29.5;
function whirlSlamPoses(): Pose[] {
  const slam: Partial<Pose> = { ...WHIRL, pitch: 0.42, bob: -3 * PX, hp: -0.12, hand: hands([17.0, 9.0, 17.0]), clods: 1, sparks: 1 };
  const keys: Key[] = [
    { f: 0, p: WHIRL },
    { f: 2, p: slam, ease: easeIn },
    { f: 3, p: { ...slam, clods: 0.6, sparks: 0.4 }, ease: easeOut },
    { f: 5, p: OVER, ease: easeInOut },
  ];
  const poses = keyed(keys, 6, 540);
  const ground = (s: number, k: number): V3[] => {
    // цепь от кисти к земле наружу и вперёд: на ударе — прямая, потом подпрыгивает
    const h = poses[k].hand[s ? 1 : 0];
    const sx = s ? -1 : 1;
    const end: V3 = [sx * 27, 7, 0.6];
    return Array.from({ length: 8 }, (_, j) => {
      const t = (j + 1) / 8;
      const q = lerpV(h, end, t);
      return [q[0], q[1], Math.max(0.6, q[2] * (1 - t * 0.2) + (k === 3 ? 2.2 * Math.sin(Math.PI * t) : 0))] as V3;
    });
  };
  ringPair(poses[0], WHIRL_C, WHIRL_AX, WHIRL_R, 1, 0, 8, false);
  // кадр 1: кольцо кренится вперёд-вниз — цепи идут к земле перед зверем
  ringPair(poses[1], [0, 4, 16], [0, 0.9, 1], 25, 0.8, 4, 8, false);
  for (const k of [2, 3]) poses[k].chain = [ground(0, k), ground(1, k)];
  poses[2].flash = 1;
  // вверх: цепи тянутся за кистями и раскручиваются над головой
  ringPair(poses[4], add(WIDE_C, [0, 0, -8]), [0, 0.3, 1], 22, 0.55, 4, 8, false);
  ringPair(poses[5], WIDE_C, WIDE_AX, WIDE_R, 0.85, 5, 8, false);
  return poses;
}
/** Цепи на всю длину: широким кольцом над головой, 8 кадров на цикл (по кругу до удара кольцом). */
function whirlWidePoses(): Pose[] {
  const base = poseAt([{ f: 0, p: OVER }, { f: 1, p: OVER }], 0);
  return Array.from({ length: 8 }, (_, i) => {
    const p: Pose = { ...base, t: i / 8, seed: 560 + i, armLift: [[0, 1, 0, -1][i % 4], [0, 1, 0, -1][i % 4]] as [number, number], glow: i % 2 ? 1.5 : 1.35 };
    ringPair(p, WIDE_C, WIDE_AX, WIDE_R, 1, i);
    return p;
  });
}
/** Удар кольцом: из-за головы обе цепи на всю длину обрушиваются в стороны (кадр 2), искры у концов; зверь выпрямляется. */
function whirlLashPoses(): Pose[] {
  const lash: Partial<Pose> = { pitch: 0.4, bob: -2 * PX, hp: -0.1, jaw: 1, hand: hands([20.0, 7.0, 22.0]), pole: [[0.8, -1, 0.2], [-0.8, -1, 0.2]], glow: 1.4, fist: 0.8, sparks: 1 };
  const keys: Key[] = [
    { f: 0, p: OVER },
    { f: 1, p: { ...OVER, hand: hands([17.0, -1.0, 46.0]) }, ease: easeIn },
    { f: 2, p: lash, ease: easeOut },
    { f: 3, p: { ...lash, sparks: 0.5 }, ease: easeOut },
    { f: 7, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 8, 580);
  const line = (k: number, s: number, lift: number): V3[] => {
    const h = poses[k].hand[s];
    const sx = s ? -1 : 1;
    const end: V3 = [sx * 30, 4, 0.6];
    return Array.from({ length: 10 }, (_, j) => {
      const t = (j + 1) / 10;
      const q = lerpV(h, end, t);
      return [q[0], q[1], Math.max(0.6, q[2] + lift * Math.sin(Math.PI * t))] as V3;
    });
  };
  ringPair(poses[0], WIDE_C, WIDE_AX, WIDE_R, 1, 0, 8, false);
  poses[1].chain = [line(1, 0, 14), line(1, 1, 14)];
  poses[2].chain = [line(2, 0, 0), line(2, 1, 0)];
  poses[3].chain = [line(3, 0, 2.5), line(3, 1, 2.5)];
  poses[4].chain = [line(4, 0, 0.5), line(4, 1, 0.5)];
  poses[1].trail = [[22, -2, 44], [27, 0, 38], [30, 2, 28], [31, 3, 16]] as V3[];
  poses[1].trailArm = 0;
  poses[1].trail2 = poses[1].trail.map(shL);
  poses[1].trail2Arm = 1;
  poses[1].trailChain = true;
  poses[2].flash = 1;
  poses[2].clods = 1;
  poses[3].clods = 0.6;
  return poses;
}

// ---------------- «Шипастый прыжок» ----------------
/** Пригнулся: таз вниз, корпус вперёд, кулаки в землю, грива дыбом; цепи кучей у кистей. */
const CROUCH: Partial<Pose> = {
  pitch: 0.62, bob: -5 * PX, hp: -0.5, jaw: 1, hand: hands([13.0, 10.0, 4.6]), pole: [[1, -0.4, 0.4], [-1, -0.4, 0.4]],
  foot: [[8.2, 0.4, 3.6], [-8.2, -1.6, 3.6]], glow: 1.35, fist: 1, mane: [0, -1], drag: [norm([0.5, -0.9, 0]), norm([-0.5, -0.9, 0])] as [V3, V3],
};
function crouchPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: CROUCH, ease: easeInOut }], 4, 600);
}
function crouchHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: CROUCH }, { f: 1, p: CROUCH }], 0);
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 620 + i, chest: [0, 0, -1, 0][i],
    armLift: [tremble[i] > 0 ? 1 : 0, tremble[i] < 0 ? 1 : 0] as [number, number], mane: [0, [-1, -2, -1, -2][i]] as [number, number],
    glow: [1.3, 1.5, 1.35, 1.5][i],
  }));
}
/**
 * Прыжок: толчок (кадр 1), в воздухе — свернулся, шипы плеч вперёд-вниз (кадры 2–4; клиент несёт спрайт к метке),
 * приземление в середину круга (кадр 5 — конец предупреждения), пыль, комья, вспышка; затем встаёт.
 */
function lungePoses(): Pose[] {
  const push: Partial<Pose> = { ...CROUCH, root: [0, 1.0, 3.0], bob: -2 * PX, pitch: 0.5, hp: -0.4, hand: hands([14.0, 2.0, 9.0]), foot: [[8.2, -1.6, 3.6 + 3.0], [-8.2, -3.0, 3.6 + 3.0]], toe: [-0.6, -0.6], mane: [0, 1] };
  const air: Partial<Pose> = {
    ...CROUCH, root: [0, 2.0, 12.0], bob: -1 * PX, pitch: 0.92, hp: -0.7, jaw: 1, hand: hands([15.0, 12.0, 14.0 + 10]), pole: [[1, -0.2, 0.6], [-1, -0.2, 0.6]],
    foot: [[8.0, -2.6, 3.6 + 12.0 + 1], [-8.0, -3.2, 3.6 + 12.0 + 1]], toe: [-0.5, -0.5], mane: [0, 2], glow: 1.5, fist: 0,
  };
  const fall: Partial<Pose> = { ...air, root: [0, 1.0, 7.0], pitch: 0.8, hand: hands([16.0, 11.0, 7.0 + 4]), foot: [[8.4, 0.4, 3.6 + 7.0], [-8.4, -1.0, 3.6 + 7.0]], mane: [0, -1] };
  const land: Partial<Pose> = {
    ...CROUCH, root: [0, 0, 0], bob: -6 * PX, pitch: 0.74, hp: -0.4, hand: hands([14.0, 11.0, 4.0]), foot: [[8.6, 0.6, 3.6], [-8.6, -1.4, 3.6]],
    mane: [0, 2], glow: 1.5, fist: 0, clods: 1, dust: [1, 1], flash: 1,
  };
  const keys: Key[] = [
    { f: 0, p: CROUCH },
    { f: 1, p: push, ease: easeIn },
    { f: 2.4, p: air, ease: easeOut },
    { f: 4, p: fall, ease: easeIn },
    { f: 5, p: land, ease: easeIn },
    { f: 6, p: { ...land, bob: -5 * PX, clods: 0.6, dust: [0.6, 0.6], flash: 0, mane: [0, 0] }, ease: easeOut },
    { f: 7, p: { ...land, bob: -5 * PX, clods: 0.3, dust: [0.3, 0.3], flash: 0, mane: [0, 0] }, ease: linear },
    { f: 11, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 12, 640);
  for (const k of [2, 3, 4]) poses[k].drag = [norm([0.3, -1, 0]), norm([-0.3, -1, 0])];
  // в воздухе цепи тянутся следом — назад и вниз
  for (const k of [2, 3]) {
    poses[k].chain = [0, 1].map((s) => {
      const h = poses[k].hand[s];
      const sx = s ? -1 : 1;
      return Array.from({ length: 7 }, (_, j) => add(h, [sx * (1 + j * 0.9), -j * 1.6, -j * 1.6 - 0.25 * j * j])) as V3[];
    }) as [V3[], V3[]];
  }
  return poses;
}

// ---------------- «Травля» ----------------
/** Вой: голова вверх, пасть раскрыта, грудь вперёд, руки разведены вниз — зверь метит добычу. */
const HOWL: Partial<Pose> = {
  pitch: 0.06, bob: 1 * PX, chest: 1, headZ: 1, hp: -0.5, jaw: 1, hand: hands([21.0, 1.0, 17.0]), pole: [[0.8, -1, 0], [-0.8, -1, 0]], glow: 1.5, fist: 0.4, mane: [0, 1],
};
function howlPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: HOWL, ease: easeOut }], 4, 700);
}
function howlHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: HOWL }, { f: 1, p: HOWL }], 0);
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 720 + i, headZ: [1, 2, 1, 2][i], mane: [[0, 1], [0, 2], [0, 1], [0, 2]][i] as [number, number],
    glow: [1.4, 1.5, 1.4, 1.5][i], armLift: [[0, 0], [1, 1], [0, 0], [1, 1]][i] as [number, number],
  }));
}
/**
 * Удар травли: рывок вперёд и взмах лапы сверху вниз к добыче (кадр 2 — удар метки), 7 кадров ≈ 0,6 с — как шаг меток;
 * правая и левая по очереди (huntR → huntL → huntR).
 */
function huntPoses(side: 0 | 1, view: ZView): Pose[] {
  const s = side ? -1 : 1;
  const mir = (v: V3): V3 => [s * v[0], v[1], v[2]];
  const pair = (a: V3, b: V3): [V3, V3] => (side ? [mir(b), mir(a)] : [a, b]);
  const wind: Partial<Pose> = { yaw: -0.3 * s, pitch: 0.2, bob: 1 * PX, hp: -0.36, jaw: 1, hand: pair([20.0, -2.0, 38.0], [-18.0, 8.0, 16.0]), pole: pair([1, -0.4, 0.4], [-0.9, -1, 0.1]), glow: 1.4, fist: 0 };
  const hitH: V3 = view === "side" ? [5.0, 15.0, 9.0] : [5.0, 12.5, 9.0];
  const hit: Partial<Pose> = { yaw: 0.3 * s, pitch: 0.52, bob: -3 * PX, hp: -0.16, jaw: 1, hand: pair(hitH, [-18.0, -1.0, 16.0]), pole: pair([1, -0.7, 0.3], [-0.9, -1, 0.1]), glow: 1.4, fist: 0, flash: 1 };
  const keys: Key[] = [
    { f: 0, p: HOWL },
    { f: 1, p: wind, ease: easeOut },
    { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, bob: -2 * PX, pitch: 0.48 }, ease: easeOut },
    { f: 6, p: { ...HOWL, hp: -0.4, pitch: 0.2, chest: 0 }, ease: easeInOut },
  ];
  const poses = keyed(keys, 7, 740 + side * 20);
  const arc = arcPath(mir([20.0, -2.0, 38.0]), mir([23.0, 9.0, 26.0]), mir(hitH));
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => clawTip(arc(lerp(u0, u1, k / (n - 1))), s));
  poses[2].trail = path(0.1, 1);
  poses[3].trail = path(0.65, 1, 4);
  for (const k of [2, 3]) poses[k].trailArm = side;
  poses[2].puff = 1;
  return poses;
}

// ---------------- гибель ----------------
/** Гибель: отшатнулся с рыком, шатается, падает на колени, валится вперёд на лапы и морду; цепи звенят о землю, глаза гаснут. */
function deathPoses(): Pose[] {
  const recoil: Partial<Pose> = { pitch: 0.08, bob: 1 * PX, hp: -0.7, jaw: 1, hand: hands([20.6, 2.0, 18.0]), mane: [0, 1], glow: 1.5 };
  const stagger: Partial<Pose> = { pitch: 0.3, roll: 0.07, yaw: 0.1, hp: -0.3, jaw: 1, hand: [[19.6, 3.4, 14.6], [-18.6, 5.0, 13.6]], mane: [0, -1], glow: 1.0 };
  const kneel: [V3, V3] = [[6.4, -8.6, 3.2], [-6.4, -8.0, 3.2]];
  const knees: Partial<Pose> = {
    root: [0, -2.0, 0], pitch: 0.5, roll: 0.03, bob: -8 * PX, hp: -0.1, jaw: 0, foot: kneel, toe: [-0.9, -0.9], hand: hands([15.6, 7.0, 4.6]),
    pole: [[1, -0.6, 0.2], [-1, -0.6, 0.2]], mane: [0, 1], glow: 0.6, dust: [1, 1], sparks: 0.6,
  };
  const fall: Partial<Pose> = {
    ...knees, root: [0, -6.0, 0], pitch: 1.08, bob: -10 * PX, hp: 0.15, hand: hands([17.0, 9.0, 3.4]), mane: [0, 0], glow: 0.25, dust: [0.4, 0.4], sparks: 0, clods: 1,
  };
  const dead: Partial<Pose> = { ...fall, pitch: 1.18, bob: -11 * PX, hp: 0.3, hand: hands([18.0, 8.0, 2.8]), glow: 0, dust: [0, 0], clods: 0.2 };
  const keys: Key[] = [
    { f: 0, p: { glow: 1.2 } },
    { f: 2, p: recoil, ease: easeOut },
    { f: 4, p: stagger, ease: easeInOut },
    { f: 6.2, p: knees, ease: easeIn },
    { f: 8, p: fall, ease: easeIn },
    { f: 9, p: { ...fall, bob: -11 * PX, clods: 0.6 }, ease: easeOut },
    { f: 11, p: dead, ease: easeOut },
  ];
  return keyed(keys, 12, 800);
}

export type BeastAnim =
  | "idle" | "walk" | "attack"
  | "whirlUp" | "whirlHold" | "whirlSlam" | "whirlWide" | "whirlLash"
  | "crouch" | "crouchHold" | "lunge"
  | "howl" | "howlHold" | "huntR" | "huntL"
  | "death";
/**
 * Анимации: первый столбец листа, число кадров, кадров в секунду, по кругу ли, что дальше, кадр удара. Замахи — связки
 * «замах → удержание по кругу до конца предупреждения → удар» (кадр hit — ровно в конце предупреждения).
 */
export const BEAST_ANIMS: Record<BeastAnim, { col: number; n: number; fps: number; loop: boolean; ru: string; next?: BeastAnim; hit?: number }> = {
  idle: { col: 0, n: 12, fps: 12, loop: true, ru: "покой" },
  walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
  attack: { col: 24, n: 10, fps: 15, loop: false, ru: "атака", hit: 6 },
  whirlUp: { col: 34, n: 4, fps: 12, loop: false, ru: "замах цепей", next: "whirlHold" },
  whirlHold: { col: 38, n: 8, fps: 16, loop: true, ru: "цепи по кругу", next: "whirlSlam" },
  whirlSlam: { col: 46, n: 6, fps: 12, loop: false, ru: "удар вплотную", hit: 2, next: "whirlWide" },
  whirlWide: { col: 52, n: 8, fps: 16, loop: true, ru: "цепи на всю длину", next: "whirlLash" },
  whirlLash: { col: 60, n: 8, fps: 12, loop: false, ru: "удар кольцом", hit: 2 },
  crouch: { col: 68, n: 4, fps: 12, loop: false, ru: "пригнулся", next: "crouchHold" },
  crouchHold: { col: 72, n: 4, fps: 12, loop: true, ru: "сжался", next: "lunge" },
  lunge: { col: 76, n: 12, fps: 12, loop: false, ru: "прыжок", hit: 5 },
  howl: { col: 88, n: 4, fps: 12, loop: false, ru: "вой", next: "howlHold" },
  howlHold: { col: 92, n: 4, fps: 12, loop: true, ru: "вой держит", next: "huntR" },
  huntR: { col: 96, n: 7, fps: 12, loop: false, ru: "травля правой", hit: 2, next: "huntL" },
  huntL: { col: 103, n: 7, fps: 12, loop: false, ru: "травля левой", hit: 2 },
  death: { col: 110, n: 12, fps: 12, loop: false, ru: "гибель" },
};
export const BEAST_COLS = 122;
/**
 * Умения карточки → анимации. «Цепной круг»: замах windupMs → удар вплотную (hit), затем «цепи на всю длину» по кругу
 * до второго удара (then.windupMs) → удар кольцом. «Шипастый прыжок»: hit — приземление в метку (leap: клиент несёт спрайт
 * в кадрах до hit). «Травля»: вой — замах; удары метками по очереди правой и левой (strikes), шаг — stepMs карточки.
 */
export const BEAST_SKILLS: Record<string, { windup: [BeastAnim, BeastAnim]; strike: BeastAnim; then?: { hold: BeastAnim; strike: BeastAnim }; strikes?: BeastAnim[]; fx: "chain" | "lunge" | "hunt"; leap?: boolean }> = {
  chain_whirl: { windup: ["whirlUp", "whirlHold"], strike: "whirlSlam", then: { hold: "whirlWide", strike: "whirlLash" }, fx: "chain" },
  spike_lunge: { windup: ["crouch", "crouchHold"], strike: "lunge", fx: "lunge", leap: true },
  hunt: { windup: ["howl", "howlHold"], strike: "huntR", strikes: ["huntR", "huntL", "huntR"], fx: "hunt" },
};
const POSES: Record<BeastAnim, (view: ZView) => Pose[]> = {
  idle: () => idlePoses(), walk: () => walkPoses(), attack: attackPoses,
  whirlUp: whirlUpPoses, whirlHold: whirlHoldPoses, whirlSlam: whirlSlamPoses, whirlWide: whirlWidePoses, whirlLash: whirlLashPoses,
  crouch: crouchPoses, crouchHold: crouchHoldPoses, lunge: lungePoses,
  howl: howlPoses, howlHold: howlHoldPoses, huntR: (v) => huntPoses(0, v), huntL: (v) => huntPoses(1, v),
  death: deathPoses,
};

/** Лист одной анимации: 3 строки (вниз, вверх, вбок), столбцы — кадры. */
export function buildBeastAnim(anim: BeastAnim): PC {
  const A = BEAST_ANIMS[anim];
  const out = new PC(N * A.n, N * 3);
  VIEWS.forEach((v, row) => POSES[anim](v).forEach((p, i) => out.blit(renderBeast(v, p), i * N, row * N)));
  return out;
}
/** Весь лист: BEAST_COLS столбцов × 3 строки. */
export function buildBeastSheet(parts?: Partial<Record<BeastAnim, PC>>): PC {
  const out = new PC(N * BEAST_COLS, N * 3);
  for (const a of Object.keys(BEAST_ANIMS) as BeastAnim[]) out.blit(parts?.[a] ?? buildBeastAnim(a), BEAST_ANIMS[a].col * N, 0);
  return out;
}
/** Один кадр для отладки: вид, анимация, номер. */
export function beastFrame(view: ZView, anim: BeastAnim, i: number): PC {
  return renderBeast(view, POSES[anim](view)[i]);
}

// ---------------- земля: трещины, ямы, комья, пыль (как у пилота) ----------------
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Трещина: изломанный отрезок; ширина от w0 к 1,2 px — короткая и толстая, без паутины в 1 px. */
interface Crack { pts: [number, number][]; w0: number }
function crack(x0: number, y0: number, a: number, len: number, w0: number, seed: number): Crack {
  let x = x0, y = y0;
  const pts: [number, number][] = [[x, y]];
  for (let s = 0; s < len; s += 1) {
    if (s % 3 === 2) a += (hash01(seed, s, 3) - 0.5) * 1.0;
    x += Math.cos(a);
    y += Math.sin(a);
    pts.push([x, y]);
  }
  return { pts, w0 };
}
/**
 * Трещины в земле: тёмная щель, светлая кромка снизу-справа (освещённая стенка), бурая сверху-слева; grow — доля длины от начала.
 * Без полупрозрачности.
 */
function drawCracks(o: PC, cracks: Crack[], grow: number, pale = false) {
  if (grow <= 0.02) return;
  const inner = new Uint8Array(N * N);
  for (const cr of cracks) {
    const n = Math.floor((cr.pts.length - 1) * grow);
    for (let k = 0; k <= n; k++) {
      const u = k / Math.max(1, cr.pts.length - 1);
      const w = lerp(cr.w0, 1.2, u);
      const [px, py] = cr.pts[k];
      const r = w / 2;
      for (let yy = Math.floor(py - r); yy <= py + r; yy++) for (let xx = Math.floor(px - r); xx <= px + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        if (w < 1.6 ? xx === Math.floor(px) && yy === Math.floor(py) : Math.hypot(xx + 0.5 - px, yy + 0.5 - py) <= r) inner[yy * N + xx] = 1;
      }
    }
  }
  const at = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < N && yy < N && inner[yy * N + xx] === 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (inner[y * N + x]) { o.set(x, y, EARTH[pale ? 1 : 0]); continue; }
    if (at(x - 1, y) || at(x, y - 1)) o.set(x, y, EARTH[pale ? 3 : 4]);
    else if (at(x + 1, y) || at(x, y + 1)) o.set(x, y, EARTH[2]);
  }
}

/** Яма, из которой выходит корень: тёмная глубина, освещённая дальняя стенка, рваный вывороченный край (свет сверху слева). */
function drawHole(o: PC, cx: number, cy: number, open: number, k: number, pale = false) {
  if (open <= 0.05) return;
  const rx = 1.2 + 2.8 * open, ry = 0.7 + 1.5 * open;
  const RX = rx + 1.8, RY = ry + 1.3;
  for (let y = Math.floor(cy - RY); y <= cy + RY; y++) for (let x = Math.floor(cx - RX); x <= cx + RX; x++) {
    const ux = x + 0.5 - cx, uy = y + 0.5 - cy;
    const dout = (ux / RX) ** 2 + (uy / RY) ** 2;
    if (dout > 1) continue;
    if ((ux / rx) ** 2 + (uy / ry) ** 2 <= 1) {
      o.set(x, y, uy < -0.25 * ry ? EARTH[pale ? 2 : 1] : EARTH[pale ? 1 : 0]);
      continue;
    }
    // край: комья с разрывами, верх-лево освещён, низ — в тени
    if (dout > 0.72 && hash01(x + 64 * k, y, 31) < 0.3) continue;
    o.set(x, y, ux / RX + uy / RY < -0.45 ? EARTH[4] : uy > 0.35 * RY ? EARTH[2] : EARTH[3]);
  }
}

/** Ком земли: несколько форм 2–3 px, верхний-левый пиксель светлый, нижний — тёмный. */
const CLODS: string[][] = [["432", "321", ".1."], ["43.", "321"], [".43", "321", "11."], ["432", ".21"]];
function drawClodAt(o: PC, x: number, y: number, shape: number) {
  CLODS[shape % CLODS.length].forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") o.set(x + i, y + j, EARTH[+ch]); }));
}
/** Летящий ком: дуга от ямы, падает и остаётся лежать (rest = true — уже лежит). */
function clodPos(bx: number, by: number, vx: number, vz: number, t: number): [number, number, boolean] {
  const land = (2 * vz) / 1.1;
  const tt = Math.min(t, land);
  const h = vz * tt - 0.55 * tt * tt;
  return [Math.round(bx + vx * tt), Math.round(by - Math.max(0, h)), t >= land];
}
/** Плоский клуб пыли в точке кадра (для эффекта мира). */
function drawPuffAt(o: PC, cx: number, cy: number, f: Puff) {
  const t = 1 - f.k;
  for (let k = 0; k < 2; k++) {
    const dir = k ? 1 : -1;
    const px = cx + dir * (2.5 + 3.5 * t), py = cy - t;
    const rx = 1.5 + 1.1 * f.k, ry = Math.max(0.9, rx * 0.55);
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry;
      if (dx * dx + dy * dy > 1) continue;
      o.set(x, y, DUST[dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2]);
    }
  }
}

// ---------------- эффекты мира ----------------
/** Центр метки в кадре эффекта 64×64 (как у пилота): земля без сжатия, круги меток круглые. */
const FX_AY = 44;
/** Кадр эффекта: [нижний слой — под юнитами, верхний — над юнитами]. */
type FxPair = [PC, PC];

/** Искры веером вверх: k — сила 0..1, r — разлёт (кадры от удара). */
function sparkBurst(o: PC, cx: number, cy: number, k: number, t: number, n: number, seed: number) {
  for (let j = 0; j < n; j++) {
    const a = -Math.PI * (0.1 + 0.8 * hash01(j, seed, 1));
    const sp = 2 + 3.5 * hash01(j, seed, 2);
    const x = cx + Math.cos(a) * sp * t * 1.6, y = cy + Math.sin(a) * sp * t * 1.2 + 0.5 * t * t;
    if (hash01(j, seed, 3) > k) continue;
    const xi = Math.round(x), yi = Math.round(y);
    o.set(xi, yi, SPARK[t < 1.5 ? 2 : 1]);
    // хвост искры — к месту удара
    o.set(Math.round(x - Math.cos(a)), Math.round(y - Math.sin(a) * 0.8), SPARK[t < 1.5 ? 1 : 0]);
  }
}

/**
 * «Цепной круг» — удар цепи о землю (sol_chained_beast-chainfx.png): дуга кольца 56 px (радиус 96 px — тот же круг, что
 * у умения; дугами клиент выкладывает кольцо). Кадр 0 — удар: цепь лежит в борозде, искры у звеньев, земля трескается;
 * 1 — цепь подпрыгивает; 2–3 — цепь сдёргивают (уходит вбок и вверх, остаётся отпечаток звеньев), пыль волной вдоль дуги,
 * комья; 4–7 — пыль оседает, отпечаток и трещины бледнеют. 8 кадров, 12 к/с, easing на пыли, цепи и угасании.
 */
export const CHAINFX = { n: 8, fps: 12, hit: 0, arc: 56, r: 96 };
/** Дуга кольца в кадре эффекта: центр кольца — к зрителю, дуга выгнута от него. */
const fxArcY = (x: number) => FX_AY - 3 + ((x - CX) * (x - CX)) / (2 * CHAINFX.r);
/** Цепь вдоль дуги в отдельном слое с контуром 1 px: звенья по шаблонам LINK_T, ржавые тона; lift — подъём, x0..x1 — какая часть ещё лежит. */
function fxChain(x0: number, x1: number, lift: number, dx: number): PC {
  const c = new PC(N, N);
  let li = 0;
  for (let x = x0; x <= x1; x += 3, li++) {
    const y = Math.round(fxArcY(x) - lift - 1);
    const slope = (x - CX) / CHAINFX.r;
    const kind = Math.abs(slope) < 0.18 ? "h" : slope > 0 ? "d1" : "d2";
    for (const [ox, oy, tone] of LINK_T[kind][li % 2]) c.set(Math.round(x + dx) + ox, y + oy, RUST[tone]);
  }
  c.outline(OUT);
  return c;
}
function chainFxFrame(i: number): FxPair {
  const back = new PC(N, N), front = new PC(N, N);
  const L = CHAINFX.arc / 2;
  const xs = CX - L, xe = CX + L;
  // отпечаток звеньев: ямки по дуге через 3 px (плашмя — шире, на ребре — уже), трещины от дуги наружу и внутрь
  const grow = [0.55, 0.9, 1, 1, 1, 1, 0.66, 0.33][i];
  const pale = i >= 5;
  const dents: Crack[] = [];
  for (let x = xs + 1, k = 0; x <= xe - 1; x += 3, k++) {
    const y = fxArcY(x);
    dents.push({ pts: [[x - 1, y], [x, y], [x + 1, y]], w0: k % 2 ? 1.5 : 2.4 });
  }
  const cracks: Crack[] = [];
  for (let k = 0; k < 5; k++) {
    const x = xs + 6 + k * 11 + (hash01(k, 11, 1) - 0.5) * 4;
    const up = k % 2 === 1;
    const a = (up ? -Math.PI / 2 : Math.PI / 2) + (k < 2 ? -1 : k > 2 ? 1 : 0) * (up ? -0.55 : 0.55) + (hash01(k, 11, 2) - 0.5) * 0.4;
    cracks.push(crack(x, fxArcY(x) + (up ? -1 : 1), a, 6 + 4 * hash01(k, 11, 3), 2.4, 60 + k));
  }
  drawCracks(back, dents, i === 0 ? 1 : Math.min(1, grow + 0.2), pale);
  drawCracks(back, cracks, grow, pale);
  // пыль: волна клубов вдоль дуги — расходятся (easeOut) и тают
  if (i <= 5) {
    const t = easeOut(i / 5);
    for (let k = 0; k < 6; k++) {
      const x = xs + 4 + k * 9.6;
      drawPuffAt(k % 2 ? front : back, x, fxArcY(x) + (k % 2 ? 2 : -1) - 2 * t, { c: [0, 0, 0], k: 1 - t * 0.9, seed: 3 + k });
    }
  }
  // искры у звеньев в момент удара
  if (i <= 3) for (let k = 0; k < 3; k++) {
    const x = xs + 10 + k * 18;
    sparkBurst(front, x, fxArcY(x) - 1, 1 - i * 0.22, i + 0.6, 7, 21 + k);
  }
  // комья: вылетают из борозды и ложатся
  for (let k = 0; k < 6; k++) {
    if (i >= 6 && k >= 6 - (i - 5) * 3) continue;
    const x = xs + 6 + k * 9;
    const [cx2, cy2, rest] = clodPos(x, fxArcY(x), (k % 2 ? 1 : -1) * (0.8 + 0.3 * (k % 3)), 1.6 + 0.4 * (k % 3), i * 1.6);
    drawClodAt(rest ? back : front, cx2, cy2 + (rest ? 1 : 0), k);
  }
  // цепь: лежит (0), подпрыгивает (1), сдёргивают вбок и вверх (2–3, easeIn), дальше её нет
  const chainAt: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [3, 0.35, -6], [6, 0.8, -16]];
  if (i < chainAt.length) {
    const [lift, cut, dx] = chainAt[i];
    front.blit(fxChain(xs + Math.round(cut * CHAINFX.arc * 0.5), xe, lift, easeIn(Math.min(1, -dx / 16)) * dx * 1.0), 0, 0);
  }
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
}

/**
 * «Шипастый прыжок» — приземление (sol_chained_beast-lungefx.png): воронка с лучами трещин, кольцо проколов от шипов,
 * волна пыли и комья; 10 кадров, кадр 0 — удар (ровно в конце предупреждения), потом оседает и тает.
 */
export const LUNGEFX = { n: 10, fps: 12, hit: 0 };
function lungeFxFrame(i: number): FxPair {
  const back = new PC(N, N), front = new PC(N, N);
  const cx = CX, cy = FX_AY;
  const fade = i >= 7;
  const cracks: Crack[] = [];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + 0.35 + (hash01(k, 4, 1) - 0.5) * 0.5;
    cracks.push(crack(cx + Math.cos(a) * 6, cy + Math.sin(a) * 3.6, a, 8 + 5 * hash01(k, 4, 2), 3.0, 40 + k));
  }
  const grow = i === 0 ? 0.55 : i === 1 ? 0.9 : i < 7 ? 1 : 1 - (i - 6) / 4;
  drawCracks(back, cracks, grow, fade);
  drawHole(back, cx, cy, i === 0 ? 1.4 : i < 7 ? 1.6 : 1.6 - (i - 6) * 0.35, 9, fade);
  // проколы от шипов: кольцо тёмных ямок
  if (i < 9) for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.2;
    drawHole(back, Math.round(cx + Math.cos(a) * 12), Math.round(cy + Math.sin(a) * 7), i < 7 ? 0.32 : 0.2, 20 + k, fade);
  }
  // волна пыли: два клуба расходятся и тают
  if (i <= 5) {
    const t = i / 5;
    for (const [dx, dy, s] of [[-1, 0, 1], [1, 0, 2], [0, 1, 3]] as [number, number, number][]) {
      drawPuffAt(dy ? front : back, cx + dx * (6 + 12 * t), cy + 2 + dy * (2 + 4 * t), { c: [0, 0, 0], k: 1 - t, seed: s });
    }
  }
  for (let k = 0; k < 6; k++) {
    if (i >= 7 && k >= 6 - (i - 6) * 2) continue;
    const dir = (k % 2 ? 1 : -1) * (1.1 + 0.5 * hash01(k, 2, 9));
    const [x, y, rest] = clodPos(cx + (k % 2 ? 4 : -5), cy + (k % 3) - 1, dir * (1.4 + 0.3 * k), 2.2 + 0.5 * (k % 3), i * 1.6);
    drawClodAt(rest ? back : front, x, y + (rest ? 1 : 0), k);
  }
  if (i === 0) {
    // вспышка удара: крест светлой пыли
    for (let r = 1; r <= 4; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) front.set(cx + dx * r, cy - 2 + dy * Math.min(r, 2), DUST[r < 3 ? 3 : 2]);
  }
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
}

/**
 * «Травля» — удар в метке 40 px (sol_chained_beast-huntfx.png): три борозды когтей наискось рвут землю (кадры 0–1),
 * брызги земли, затем борозды бледнеют; 8 кадров, кадр 1 — удар.
 */
export const HUNTFX = { n: 8, fps: 12, hit: 1 };
function huntFxFrame(i: number): FxPair {
  const back = new PC(N, N), front = new PC(N, N);
  const cx = CX, cy = FX_AY;
  const fade = i >= 5;
  const gash = (j: number): Crack => {
    const x0 = cx - 9 + j * 5, y0 = cy - 7 + Math.abs(j - 1);
    const pts: [number, number][] = [];
    for (let s = 0; s <= 14; s++) pts.push([x0 + s * 0.55 + (j - 1) * 0.15 * s, y0 + s * 0.95]);
    return { pts, w0: j === 1 ? 2.8 : 2.4 };
  };
  const grow = i === 0 ? 0.45 : i < 5 ? 1 : 1 - (i - 4) / 4;
  drawCracks(back, [gash(0), gash(1), gash(2)], grow, fade);
  // свежий край борозды: светлая вывороченная земля у начала
  if (i <= 4) for (let j = 0; j < 3; j++) drawClodAt(back, cx - 10 + j * 5, cy - 9 + Math.abs(j - 1), j + 1);
  if (i >= 1 && i <= 4) drawPuffAt(back, cx + 2, cy + 6, { c: [0, 0, 0], k: 1 - (i - 1) / 4, seed: 4 });
  for (let k = 0; k < 4; k++) {
    if (i < 1 || (i >= 6 && k >= 4 - (i - 5) * 2)) continue;
    const [x, y, rest] = clodPos(cx + 4 + (k % 2) * 3, cy + 6, (k % 2 ? 1 : -0.4) * (1 + 0.4 * k), 1.8 + 0.4 * k, (i - 1) * 1.6);
    drawClodAt(rest ? back : front, x, y + (rest ? 1 : 0), k + 2);
  }
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
}

/** Лист эффекта: строка 0 — нижний слой, строка 1 — верхний; столбцы — кадры. */
function buildFx(n: number, frame: (i: number) => FxPair): PC {
  const out = new PC(N * n, N * 2);
  for (let i = 0; i < n; i++) {
    const [b, f] = frame(i);
    out.blit(b, i * N, 0);
    out.blit(f, i * N, N);
  }
  return out;
}
export const buildChainFx = () => buildFx(CHAINFX.n, chainFxFrame);
export const buildLungeFx = () => buildFx(LUNGEFX.n, lungeFxFrame);
export const buildHuntFx = () => buildFx(HUNTFX.n, huntFxFrame);

// ---------------- монтажи для утверждения ----------------
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
/** Строки атласа tiles/terrain.png (shared/map.ts, TERRAIN_KEYS): трава и лесная земля. */
const GROUND_ROW = { grass: 6, forest: 7 } as const;
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

/** Монтаж: кадры зверя рядом с героем 32×32 на траве и лесной земле (×3 и ×2, масштаб игры), эффекты мира с героем. */
function buildPreview(sheets: Record<BeastAnim, PC>, fx: { chain: PC; lunge: PC; hunt: PC }, hero: PC, terrain: PC): PC {
  const W = 1660;
  const rows: { h: number; draw: (c: PC, y: number) => void }[] = [];
  const BG: RGBA = [24, 20, 26, 255];
  const frameOf = (a: BeastAnim, view: number, i: number) => crop(sheets[a], i * N, view * N, N, N);
  const heroDown = crop(hero, 0, 0, 32, 32);
  const heroSide = crop(hero, 0, 64, 32, 32);
  for (const g of ["grass", "forest"] as Ground[]) {
    rows.push({
      h: 64 * 3 + 40,
      draw: (c, y0) => {
        const k = 3;
        text(c, `×3 · ГЕРОЙ 32 И ЗВЕРЬ 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · ${g === "grass" ? "ТРАВА" : "ЛЕСНАЯ ЗЕМЛЯ"}`, 16, y0 + 8);
        const y = y0 + 36;
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, g);
        let x = 40;
        const hy = y + (64 - 32) * k;
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroDown, k), x, hy);
        x += 30 * k;
        for (const [v, flip] of [[0, false], [1, false], [2, false], [2, true]] as [number, boolean][]) {
          shadowBlob(c, x + 32 * k, y + 60 * k, 17 * k, 5 * k);
          c.blit(scaleNN(frameOf("idle", v, 0), k, flip), x, y);
          x += 64 * k;
        }
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroSide, k, true), x, hy);
      },
    });
  }
  for (const a of Object.keys(BEAST_ANIMS) as BeastAnim[]) {
    const A = BEAST_ANIMS[a];
    rows.push({
      h: 64 * 2 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.hit !== undefined ? ` · УДАР ${A.hit}` : ""}${A.next ? ` · → ${BEAST_ANIMS[A.next].ru}` : ""}`, 16, y0 + 8);
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
            x += (A.n > 12 ? 58 : 64) * k;
          }
        }
      },
    });
  }
  // эффекты мира: нижний слой, герой в метке, верхний слой
  const fxRows: [string, PC, number][] = [
    ["ЦЕПНОЙ КРУГ: УДАР ЦЕПИ О ЗЕМЛЮ", fx.chain, CHAINFX.n],
    ["ШИПАСТЫЙ ПРЫЖОК: ПРИЗЕМЛЕНИЕ", fx.lunge, LUNGEFX.n],
    ["ТРАВЛЯ: КОГТИ В МЕТКЕ", fx.hunt, HUNTFX.n],
  ];
  for (const [name, sheet, n] of fxRows) {
    rows.push({
      h: 64 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ЭФФЕКТ МИРА · ${name} · ${n} КАДРОВ · 12 К/С`, 16, y0 + 8);
        const y = y0 + 34;
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, "grass");
        let x = 24;
        for (let i = 0; i < n; i++) {
          c.blit(scaleNN(crop(sheet, i * N, 0, N, N), k), x, y);
          if (i % 2 === 1) {
            shadowBlob(c, x + 32 * k, y + 43 * k, 7 * k, 2.4 * k);
            c.blit(scaleNN(heroDown, k), x + 16 * k, y + 13 * k);
          }
          c.blit(scaleNN(crop(sheet, i * N, N, N, N), k), x, y);
          x += 64 * k;
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

/** «Наш | референс»: зверь вниз и вбок (покой) крупно и образец 12 той же высоты. */
function buildCompare(sheets: Record<BeastAnim, PC>, ref: PC | null): PC {
  const k = 6;
  const ours = crop(sheets.idle, 0, 0, N, N);
  const side = crop(sheets.idle, 0, 2 * N, N, N);
  const H = N * k;
  const refC = ref ? crop(ref, 60, 30, 960, 960) : null;
  const refS = refC ? scaleBox(refC, H, H) : null;
  const W = 24 + N * k + 16 + N * k + 24 + (refS ? refS.w + 24 : 0);
  const c = new PC(W, H + 72);
  fill(c, 0, 0, W, H + 72, [36, 32, 38, 255]);
  text(c, "НАШ", 24, 14, 3);
  if (refS) text(c, "РЕФЕРЕНС 12", 24 + 2 * N * k + 40, 14, 3);
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

type SkillCard = { id: string; name: string; windupMs: number; r: number; count?: number; stepMs?: number; then?: { windupMs: number; r: number; r2?: number }[] };

/** Просмотр с анимацией: листы встроены в страницу (data:); умения — по таймингам карточки. */
function buildHtml(sheet: PC, fx: { chain: PC; lunge: PC; hunt: PC }, hero: PC, terrain: PC, skills: SkillCard[]): string {
  const png = (c: PC) => {
    const p = new PNG({ width: c.w, height: c.h });
    Buffer.from(c.data.buffer).copy(p.data);
    return "data:image/png;base64," + PNG.sync.write(p).toString("base64");
  };
  const grounds = (["grass", "forest"] as Ground[]).map((g) => png(crop(terrain, 14 * 32, GROUND_ROW[g] * 32, 128, 32)));
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Лютобор Цепной — анимации</title>
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
<h1>Лютобор Цепной — зверь Шепчущего леса</h1>
<p>Кадр 64×64, рядом герой 32×32; масштаб игры. Вниз, вверх, вбок, влево (отражение). Скорость — как в листе.</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0" checked> трава</label><label><input type="radio" name="g" value="1"> лесная земля</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Замах длится windupMs из карточки (связка «замах → удержание по кругу»), кадр удара приходится ровно на конец предупреждения. Красные круги — метки предупреждения (в игре их рисует клиент), эффекты мира — в метках.</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const ANIMS = ${JSON.stringify(BEAST_ANIMS)};
const FXA = ${JSON.stringify({ chain: CHAINFX, lunge: LUNGEFX, hunt: HUNTFX })};
const SKILLS = ${JSON.stringify(skills.map((s) => ({ ...s, ...BEAST_SKILLS[s.id] })))};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${png(sheet)}"), hero = img("${png(hero)}");
const fxImg = { chain: img("${png(fx.chain)}"), lunge: img("${png(fx.lunge)}"), hunt: img("${png(fx.hunt)}") };
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
  const a = document.getElementById("arena"); a.width = 480 * zoom; a.height = 240 * zoom;
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
    shadow(g, bx + 32, by + 60, 17, 5); shadow(g, 18, by + 62, 7, 2.4);
    drawBoss(g, A.col + frame, row, flip, bx, by);
    g.drawImage(hero, 0, row === 1 ? 32 : row === 2 ? 64 : 0, 32, 32, 2 * zoom, (by + 32) * zoom, 32 * zoom, 32 * zoom);
    g.fillStyle = "#efe6d2"; g.font = (6 * zoom) + "px system-ui"; g.fillText(name, 4 * zoom, 10 * zoom);
  }
}
// ---- умения ----
const sbar = document.getElementById("skills");
let skill = null, t0 = 0;
for (const s of SKILLS) {
  const b = document.createElement("button");
  b.textContent = s.name + " · замах " + (s.windupMs / 1000).toFixed(1).replace(".", ",") + " с";
  b.onclick = () => { skill = s; t0 = performance.now(); };
  sbar.appendChild(b);
}
const fr = (a, t) => Math.floor((t / 1000) * ANIMS[a].fps);
/** Замах: первая анимация один раз, затем удержание по кругу; удар — так, чтобы кадр hit пришёлся на конец предупреждения. */
function windupStrike(w0, w1, st, windupMs, t) {
  const W = ANIMS[w0], Hd = ANIMS[w1], St = ANIMS[st];
  const strikeAt = windupMs - (St.hit / St.fps) * 1000;
  if (t < Math.min(strikeAt, (W.n / W.fps) * 1000)) return [W.col + Math.min(W.n - 1, fr(w0, t)), false];
  if (t < strikeAt) return [Hd.col + (fr(w1, t - (W.n / W.fps) * 1000) % Hd.n), false];
  const k = fr(st, t - strikeAt);
  return k < St.n ? [St.col + k, false] : [-1, true];
}
function bossAt(s, t) {
  const idle = ANIMS.idle.col + (Math.floor((t / 1000) * 12) % 12);
  if (t < 0) return idle;
  if (s.id === "chain_whirl") {
    const t1 = s.windupMs, t2 = t1 + s.then[0].windupMs;
    if (t < t1 + 3 * 1000 / 12) { const [c] = windupStrike(s.windup[0], s.windup[1], s.strike, s.windupMs, t); if (c >= 0) return c; }
    const Sl = ANIMS.whirlSlam, Wd = ANIMS.whirlWide, La = ANIMS.whirlLash;
    const slamEnd = t1 + ((Sl.n - Sl.hit) / Sl.fps) * 1000, lashAt = t2 - (La.hit / La.fps) * 1000;
    if (t < slamEnd) return Sl.col + Sl.hit + fr("whirlSlam", t - t1);
    if (t < lashAt) return Wd.col + (fr("whirlWide", t - slamEnd) % Wd.n);
    const k = fr("whirlLash", t - lashAt);
    return k < La.n ? La.col + k : idle;
  }
  if (s.id === "hunt") {
    const hits = [0, 1, 2].map((i) => s.windupMs + i * s.stepMs);
    if (t < hits[0] - (ANIMS.huntR.hit / 12) * 1000) { const [c] = windupStrike("howl", "howlHold", "huntR", s.windupMs, t); return c; }
    for (let i = 2; i >= 0; i--) {
      const a = s.strikes[i], A = ANIMS[a], st = hits[i] - (A.hit / A.fps) * 1000;
      if (t >= st) { const k = fr(a, t - st); return k < A.n ? A.col + k : idle; }
    }
    return idle;
  }
  const [c, done] = windupStrike(s.windup[0], s.windup[1], s.strike, s.windupMs, t);
  return done ? idle : c;
}
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  const home = [150, 130];
  const t = skill ? ts - t0 : -1;
  const heroes = [[home[0] + 40, home[1] + 30], [home[0] + 270, home[1] + 60], [home[0] - 110, home[1] + 70]];
  const tele = (x, y, r, r2) => { g.fillStyle = "rgba(220,60,40,.22)"; g.strokeStyle = "#ff5a3a"; g.lineWidth = zoom; g.beginPath(); g.arc(x * zoom, y * zoom, (r2 || r) * zoom, 0, 7); if (r2) g.arc(x * zoom, y * zoom, r * zoom, 0, 7, true); g.fill(); g.stroke(); };
  let foot = home.slice();
  const fxs = [];
  if (skill && t >= 0) {
    const s = skill;
    if (s.id === "chain_whirl") {
      const t2 = s.windupMs + s.then[0].windupMs;
      if (t < s.windupMs) tele(foot[0], foot[1], s.r);
      else if (t < t2) tele(foot[0], foot[1], s.then[0].r, s.then[0].r2);
      for (const [hit, rr] of [[s.windupMs, 60], [t2, 150]]) {
        const n = Math.ceil((2 * Math.PI * rr) / (FXA.chain.arc - 4));
        // дуги эффекта (56 px) выкладывают кольцо по касательной; выпуклостью — наружу
        for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; fxs.push(["chain", hit + i * 15, foot[0] + Math.cos(an) * rr, foot[1] + Math.sin(an) * rr, an + Math.PI / 2]); }
      }
    }
    if (s.id === "spike_lunge") {
      const far = heroes[1];
      if (t < s.windupMs) tele(far[0], far[1], s.r);
      // прыжок: в кадрах толчка и полёта клиент несёт спрайт к метке
      const L = ANIMS.lunge, takeoff = s.windupMs - (L.hit / L.fps) * 1000 + 1000 / L.fps;
      const u = Math.max(0, Math.min(1, (t - takeoff) / (s.windupMs - takeoff)));
      const e = u * u * (3 - 2 * u);
      foot = [home[0] + (far[0] - home[0]) * e, home[1] + (far[1] - home[1]) * e - Math.sin(Math.PI * u) * 30];
      fxs.push(["lunge", s.windupMs, far[0], far[1]]);
    }
    if (s.id === "hunt") {
      const prey = heroes[1];
      for (let i = 0; i < 3; i++) {
        const st = i * s.stepMs, hit = st + s.windupMs;
        const px = prey[0] - 34 * i, py = prey[1] + 8 * i;
        if (t >= st && t < hit) tele(px, py, s.r);
        fxs.push(["hunt", hit, px, py]);
      }
    }
  }
  const fxLayer = (row) => {
    for (const [k, hit, x, y, rot] of fxs) {
      const F = FXA[k], i = Math.floor(((t - hit) / 1000) * F.fps) + F.hit;
      if (i < 0 || i >= F.n) continue;
      if (rot === undefined) { g.drawImage(fxImg[k], i * 64, row * 64, 64, 64, (x - 32) * zoom, (y - 44) * zoom, 64 * zoom, 64 * zoom); continue; }
      g.save(); g.translate(x * zoom, y * zoom); g.rotate(rot);
      g.drawImage(fxImg[k], i * 64, row * 64, 64, 64, -32 * zoom, -44 * zoom, 64 * zoom, 64 * zoom);
      g.restore();
    }
  };
  fxLayer(0);
  shadow(g, foot[0], foot[1], 17, 5);
  const heroesNow = skill && skill.id === "hunt" ? heroes.map((h, i) => i === 1 ? [h[0] - Math.min(68, Math.max(0, t) / 1000 * 30), h[1] + Math.min(16, Math.max(0, t) / 1000 * 7)] : h) : heroes;
  const drawHeroes = () => { for (const h of heroesNow) { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); } };
  drawHeroes();
  drawBoss(g, skill ? bossAt(skill, t) : ANIMS.idle.col + (Math.floor(ts / 1000 * 12) % 12), 0, false, foot[0] - 32, foot[1] - 60);
  fxLayer(1);
  if (skill && t > skill.windupMs + 4500) skill = null;
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
export function writeChainedBeastArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => {
    const f = path.join(outDir, `${ID}-${name}.png`);
    c.save(f);
    files.push(f);
    return c;
  };
  const sheets = {} as Record<BeastAnim, PC>;
  for (const a of Object.keys(BEAST_ANIMS) as BeastAnim[]) sheets[a] = save(buildBeastAnim(a), a);
  const sheet = save(buildBeastSheet(sheets), "sheet");
  const fx = { chain: save(buildChainFx(), "chainfx"), lunge: save(buildLungeFx(), "lungefx"), hunt: save(buildHuntFx(), "huntfx") };
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "bosses", "12.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  save(buildPreview(sheets, fx, hero, terrain), "preview");
  save(buildCompare(sheets, ref), "compare");
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "zone-bosses.json"), "utf8")) as { bosses: { id: string; abilities: SkillCard[] }[] };
  const skills = (data.bosses.find((b) => b.id === ID)?.abilities ?? []).map(({ id, name, windupMs, r, count, stepMs, then }) => ({ id, name, windupMs, r, count, stepMs, then }));
  const html = path.join(outDir, `${ID}.html`);
  fs.writeFileSync(html, buildHtml(sheet, fx, hero, terrain, skills), "utf8");
  files.push(html);
  return files;
}
