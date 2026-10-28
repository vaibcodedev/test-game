/**
 * Боссы стартовых земель (задача 136, шаг 2): процедурный пиксель-арт. Пилот — древень Торнвель, страж Королевской пущи
 * (data/zone-bosses.json, id sol_forest_warden; образец tools/out/refs/bosses/15.png — только для сравнения).
 * В игру пока не подключён: механика — шаг 4.
 *
 * Лист: кадр 64×64, пиксель листа = пиксель мира. Строки — как у рейд-босса (tools/gen/raidboss.ts): 0 — вниз, 1 — вверх,
 * 2 — вбок вправо (влево — отражение). Столбцы — анимации подряд: TREANT_ANIMS (первый столбец, кадров, кадров/с, что дальше).
 * Ступни на y = 60 (точка опоры 30/32 кадра, как у всех юнитов); рост с кроной ≈ 55 px — почти вдвое выше героя 32×32.
 *
 * Как устроено: скелет в 3D (X — вправо от древня, Y — вперёд, Z — вверх), IK рук и ног; тело — объёмные примитивы
 * (конусы со скруглёнными концами, эллипсоиды, шары), сглаженно слитые внутри одной детали (поле расстояний).
 * Кадр — луч на пиксель (ортографическая камера, наклон 14°), затем свет сверху слева по нормали → тоны материала
 * (верхний тон — только блик на крупных формах), тень от света, затенение складок; швы между деталями — тоном тени (selout),
 * почти чёрный — только контур 1 px и глубокие щели; редкие длинные борозды коры — только в полутонах.
 * Корпус, голова и крона — жёсткий слой: между кадрами он сдвигается только на целые пиксели кадра (snapPx), поэтому кора
 * не «кипит»; заново двигаются только руки и ноги. Глаза, брови, рот и руны — готовые штампы в целых пикселях; золотая
 * кромка наплечников — по краю детали в кадре. Светлячков в листе нет: облёт считает клиент (TREANT_MOTES, treant-mote.png).
 * Выход корней из земли — отдельный эффект мира (treant-rootfx.png) в метках «Корней-ловушек» и по «Корневой борозде».
 *
 * Запуск: npx tsx tools/gen/zone-bosses.ts art → tools/out/zone-bosses/ (листы, монтажи, сравнение, просмотр treant.html).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "./canvas";
import { writeRaiderArt } from "./zone-bosses-art-sol_raider_chief";
import { writeRevenantArt } from "./zone-bosses-art-umb_revenant_reaper";
import { writeGolemArt } from "./zone-bosses-art-sol_rune_golem";
import { writeFogTreantArt } from "./zone-bosses-art-umb_fog_treant";
import { writeChainedBeastArt } from "./zone-bosses-art-sol_chained_beast";
import { writeMinotaurArt } from "./zone-bosses-art-umb_ash_minotaur";
import { writeAbominationArt } from "./zone-bosses-art-umb_marsh_abomination";

export const ZB_FRAME = 64;
const N = ZB_FRAME;
const CX = 32, GY = 60;
/** Наклон камеры: чуть сверху — видны верх наплечников и кроны. */
const CAM = (14 * Math.PI) / 180;
const CS = Math.cos(CAM), SN = Math.sin(CAM);
/** Подъём в мире на PX — ровно 1 px кадра по вертикали. */
const PX = 1 / CS;

export type ZView = "down" | "up" | "side";
export const ZB_VIEWS: ZView[] = ["down", "up", "side"];

// ---------------- палитра ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Тёмный дуб: глубокая щель → тень → середина → свет → блик. Тени краснее, свет теплее. */
const BARK = R("#1c120d", "#352419", "#503724", "#6e4f30", "#94713f");
/** Золото рун и оковки — от золотой рампы tools/gen/palette.ts, акцент Сольгарда (shared/palette.ts, gold). */
const GOLD = R("#5a380e", "#9a6418", "#d6a030", "#f6d05a", "#fff0b0");
const LEAF = R("#0f2416", "#1c4325", "#2b6331", "#418437", "#68a848");
/** Лицо — светлее коры, как на образце. */
const FACE = R("#2f2016", "#553d2a", "#7a5b3c", "#9e7d53", "#c3a16c");
/** Борода из корней — между корой и лицом; пряди чередуются тоном. */
const BEARD = R("#23160e", "#3d2a1c", "#5b412a", "#7c5d3b", "#a27f50");
/** Корни из земли (эффект мира): светлее коры, чтобы читались на траве. */
const ROOT = R("#24170e", "#47311d", "#6c4e2e", "#927246", "#b8985e");
const MOSS = R("#1c3818", "#325a24", "#4c7c2e", "#6c9e3a");
/** Сухое дерево (гибель): серо-бурое, без золота и зелени. */
const DEAD = R("#1c1612", "#30261d", "#47392b", "#5f4f3c", "#7a6a52");
const LEAF_DRY = R("#2a1f10", "#4a3618", "#6e5020", "#93702a", "#b89236");
const EYE = R("#2c8a24", "#8ee05a", "#d8ff9a", "#f6ffe0");
const RUNE = R("#9a5a14", "#e09a2a", "#ffd25a", "#fff4c8");
/** Пыль и комья земли: плоские, непрозрачные, низ тёмный. */
const DUST = R("#4a3a28", "#7a6448", "#a48c66", "#c8b48c");
/** След удара и вспышка: кремовое золото, без полупрозрачности. */
const SMEAR = R("#9c845a", "#d8c48e", "#f8ecc4");
const FLASH = R("#e8b850", "#fff0b0", "#fffbea");
const OUT = hex("#140c09");

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
const M_BARK = 0, M_GOLD = 1, M_LEAF = 2, M_MOSS = 3, M_TWIG = 4, M_BEARD = 5, M_ROOT = 6, M_FACE = 7;
interface MatDef { ramp: Ramp; base: number; gain: number; lo: number; hi: number }
/**
 * Тон = base + gain·(n·L). Обращённое к зрителю — середина (2), к свету — свет (3), блик (4) — только близко к направлению
 * света; lo/hi — пределы тона (ниже lo — только глубокие щели).
 */
const MATS: MatDef[] = [
  { ramp: BARK, base: 1.42, gain: 2.4, lo: 1, hi: 4 },
  { ramp: GOLD, base: 1.5, gain: 2.4, lo: 1, hi: 4 },
  { ramp: LEAF, base: 1.3, gain: 2.5, lo: 1, hi: 4 },
  { ramp: MOSS, base: 1.0, gain: 2.3, lo: 0, hi: 3 },
  { ramp: BARK, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: BEARD, base: 1.45, gain: 2.4, lo: 1, hi: 4 },
  { ramp: ROOT, base: 1.5, gain: 2.4, lo: 1, hi: 4 },
  { ramp: FACE, base: 1.2, gain: 2.4, lo: 1, hi: 4 },
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
      mat: o.mat ?? M_BARK, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, ref: o.ref ?? perp(ax, [0, 1, 0.01]),
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
      mat: o.mat ?? M_BARK, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, ref: ax[0],
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
  /** сдвиг тела: x — вправо от древня, y — вперёд (в кадре — на целые пиксели) */
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
  /** отставание листвы кроны: целые пиксели кадра [вправо, вниз] */
  crown: [number, number];
  /** подъём руки целиком (плечо, локоть, кисть) — целые пиксели кадра: «дрожь» в удержании без пересчёта руки */
  armLift: [number, number];
  /** свечение глаз и рун 0..1.5; увядание 0..1; сколько листвы на ветвях 0..1; сжатие пальцев 0..1 */
  glow: number; wither: number; leaves: number; fist: number;
  /** пальцы-ветви растопырены (замах «Ветвей-плетей»); пальцы-корни уходят в землю (удар «Корней») */
  spread: number; dig: number;
  /** пыль от шага [пр, лев] 0..1 (1 — касание); листопад 0..1; вспышка удара 0..1 */
  dust: [number, number]; fall: number; flash: number;
  /** пыль и комья у кистей после удара о землю 0..1 */
  clods: number;
  /** след удара: путь кулака (мир) и чья рука; trail2 — след левой руки, когда бьют обе */
  trail?: V3[]; trailArm?: number; trail2?: V3[];
  /** пыль у кулака при ударе 0..1 */
  puff?: number;
  /** фаза кадра 0..1 и номер кадра — для частиц */
  t: number; seed: number;
}

const REST_HAND: [V3, V3] = [[16.8, 5.0, 17.0], [-16.8, 5.0, 17.0]];
const REST: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.2, yaw: 0, roll: 0, hp: -0.14, hy: 0, hr: 0,
  hand: REST_HAND, pole: [[0.8, -1, -0.2], [-0.8, -1, -0.2]],
  foot: [[7.2, 2.4, 4.4], [-7.2, -1.4, 4.4]], toe: [0, 0],
  crown: [0, 0], armLift: [0, 0], glow: 0.85, wither: 0, leaves: 1, fist: 0, spread: 0, dig: 0,
  dust: [0, 0], fall: 0, flash: 0, clods: 0, t: 0, seed: 1,
};

const HIP0 = 18;
const NECK: V3 = [0, 3.4, 37];
/** Длины костей руки: плечо, предплечье-наруч. */
const ARM: [number, number] = [10.2, 10.8];

/** Древень в координатах модели. */
function treant(p0: Pose, view: ZView): Scene {
  const S = new Scene();
  // вбок: корпус и голова чуть повёрнуты к зрителю (три четверти) — видны грудь, борода и оба глаза
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.2, hy: p0.hy - 0.32 } : p0;
  const pel: V3 = add([0, 0, HIP0], snapPx(view, [p.root[0], p.root[1], p.bob + p.root[2]]));
  const up = p.chest * PX, hz = p.headZ * PX;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  /** Точка корпуса: верх тела (выше пояса) поднимается при вдохе целиком — жёстко, без растяжения. */
  const T = (v: V3, lift = v[2] >= 25): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PV = (v: V3): V3 => add(pel, rot(sub(v, [0, 0, HIP0]), 0, p.yaw * 0.35, p.roll * 0.5));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, 0, roll)), f(rot([0, 1, 0], pitch, 0, roll)), f(rot([0, 0, 1], pitch, 0, roll)),
  ];
  const sides: [number, number][] = [[0, 1], [1, -1]];

  // ---------- туловище: ствол-бочка, широкие плечи ----------
  const gBody = S.group(2.4);
  S.cone(gBody, PV([0, 0.2, 16.5]), 8.2, T([0, 0.6, 24.5]), 9.4, { tex: 1, ng: 5, ref: TV([1, 0, 0]), seed: 1 });
  S.ell(gBody, T([0, 0.8, 30.6]), [11.6, 9.2, 8.8], axes(TV), { tex: 1, ng: 6, seed: 2 });
  S.cone(gBody, T([-8.4, 0.2, 35.0]), 5.4, T([8.4, 0.2, 35.0]), 5.4, {});
  S.cone(gBody, T([0, 1.0, 33.5]), 5.0, T([0, 1.6, 37.4]), 4.4, {});
  S.ell(gBody, T([0, -4.4, 33.0]), [9.8, 7.6, 8.2], axes(TV), { tex: 1, ng: 5, seed: 3 });

  // пласты коры на груди (как латы на образце): отдельные детали — между ними швы тоном тени
  for (const [, s] of sides) {
    const g = S.group(0);
    S.ell(g, T([s * 5.8, 7.4, 31.2]), [5.4, 2.8, 4.8], axes((v) => TV(rot(v, 0, s * 0.42))), { tex: 1, ng: 3, seed: 5 + s });
  }
  {
    const g = S.group(0);
    S.ell(g, T([0, 8.0, 23.4]), [7.6, 2.6, 3.4], axes(TV), { tex: 1, ng: 3, seed: 7 });
  }

  // ---------- ноги-пни с корневищами ----------
  for (const [i, s] of sides) {
    const g = S.group(1.6);
    const hip = PV([s * 5.6, 0.3, 16.4]);
    const an = p.foot[i];
    const kn = ik(hip, an, 7.4, 7.6, [s * 0.3, 1, 0.1]);
    S.cone(g, hip, 5.0, kn, 4.4, { tex: 1, ng: 4, ref: perp(sub(kn, hip), TV([s, 0, 0])), seed: 30 + i });
    S.cone(g, kn, 4.3, an, 4.7, { tex: 1, ng: 4, ref: perp(sub(an, kn), [s, 0, 0]), seed: 32 + i });
    const tp = p.toe[i];
    const fc = add(an, rot([0, 1.0, -2.0], tp, 0));
    S.ell(g, fc, [4.8, 5.6, 2.7], axes((v) => v, 0, tp), { moss: 1, seed: 34 + i });
    const lift = Math.max(0, an[2] - 4.4);
    const dirs = [-28, 14, 62, 118];
    dirs.forEach((deg, k) => {
      const a = (s * deg * Math.PI) / 180;
      const d: V3 = [Math.sin(a), Math.cos(a), 0];
      const l = [6.4, 5.6, 5.0, 4.2][k];
      const b0 = add(fc, add(mul(d, 2.4), [0, 0, 0.5]));
      let b1 = add(fc, add(mul(d, 2.4 + l), [0, 0, 0]));
      // корень не выходит за «след» 11 px от центра: при наклоне камеры дальше он ушёл бы под нижний край кадра
      const lim = 11;
      const over = Math.max(Math.abs(b1[0] - p.root[0]) / lim, Math.abs(b1[1] - p.root[1]) / lim);
      if (over > 1) b1 = add(b0, mul(sub(b1, b0), Math.max(0.35, 1 - (over - 1) * (lim / Math.max(1e-3, vlen(sub(b1, b0)))))));
      b1[2] = Math.max(0.35, fc[2] - 2.3 - 0.45 * lift);
      S.cone(g, b0, 1.8, b1, 0.65, { moss: 0.8, seed: 36 + k });
    });
  }

  // ---------- руки: плечо, предплечье-наруч с золотым кольцом, кисть с пальцами-корнями ----------
  for (const [i, s] of sides) {
    const g = S.group(1.3);
    S.armG[i] = g;
    const lift = pxToWorld(view, 0, -p.armLift[i]);
    const sh = add(T([s * 13, 0.4, 35.2]), lift);
    const wr = add(p.hand[i], lift);
    const el = ik(sh, wr, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, sh, 4.2, el, 3.3, { tex: 1, ng: 4, ref: perp(sub(el, sh), TV([0, 1, 0])), seed: 20 + i });
    const fa = sub(wr, el);
    S.cone(g, el, 3.5, wr, 5.3, { tex: 1, ng: 4, ref: perp(fa, TV([0, 1, 0])), seed: 22 + i, band: [0.74, 0.9] });
    const dir = norm(fa);
    const e0 = perp(dir, TV([s * 0.7, 1, 0]));
    const e1 = cross(dir, e0);
    const hc = add(wr, mul(dir, 2.2));
    const pH = S.newPart();
    S.ell(g, hc, [3.9, 3.6, 3.9], [e0, e1, dir], { part: pH });
    const fl = 5.2 - 2.2 * p.fist + 3.4 * p.spread + 6.5 * p.dig;
    [-2.0, 0, 2.0].forEach((o, k) => {
      const b0 = add(hc, add(mul(dir, 1.8), mul(e0, o)));
      let fd = norm(add(add(dir, mul(e0, o * (0.11 + 0.2 * p.spread))), mul(e1, -s * 0.22 * p.fist)));
      if (p.dig > 0) fd = norm(lerpV(fd, [0, 0, -1], 0.75 * p.dig));
      const tip = add(b0, mul(fd, fl - Math.abs(o) * 0.4));
      S.cone(g, b0, 1.7, tip, 0.75, { seed: 24 + k, part: pH });
    });
  }

  // ---------- наплечники: крупные изогнутые пласты коры выше линии плеч, золотая кромка по нижнему и верхнему краю ----------
  // вбок кромка только снизу: сверху и снизу вместе она замыкается в кольцо и наплечник читается как круглый щит
  const rim = view === "side" ? 1 : 3;
  for (const [i, s] of sides) {
    const g = S.group(0.9);
    S.ell(g, T([s * 14.6, -0.4, 39.4]), [7.8, 6.6, 5.2], axes(TV, s * 0.42), { tex: 1, ng: 3, seed: 10 + i, rim });
    // внешний край пласта приподнят, как на образце: наплечник не шар, а изогнутая пластина
    S.ell(g, T([s * 18.0, -0.8, 42.0]), [3.4, 5.0, 3.6], axes(TV, s * 0.75), { tex: 1, ng: 2, seed: 12 + i, rim });
  }

  // ---------- голова-пень: кора, спереди — светлая маска лица с тяжёлыми бровями и длинным носом-сучком ----------
  const gHead = S.group(1.1);
  const HY = 2.6;
  const h = (x: number, y: number, z: number) => H([x, y + HY, z]);
  S.ell(gHead, h(0, 3.2, 42.4), [5.4, 5.0, 6.6], axes(HV), { tex: 1, ng: 3, seed: 40 });
  S.ell(gHead, h(0, 5.6, 41.6), [4.8, 3.4, 5.4], axes(HV), { mat: M_FACE, seed: 41 });
  const pBrow = S.newPart(), pNose = S.newPart();
  for (const s of [-1, 1]) S.cone(gHead, h(s * 5.0, 6.4, 46.8), 1.3, h(s * 0.6, 8.8, 44.0), 1.7, { mat: M_FACE, part: pBrow });
  S.cone(gHead, h(0, 8.6, 43.6), 1.15, h(0, 10.9, 40.0), 1.7, { mat: M_FACE, part: pNose });
  // сколы на макушке-спиле
  S.cone(gHead, h(-2.8, 2.6, 47.8), 1.5, h(-3.2, 2.0, 50.0), 0.7, {});
  S.cone(gHead, h(2.8, 3.4, 47.8), 1.3, h(3.0, 3.6, 49.6), 0.6, {});
  // лицо — штамп у переносицы: брови «\ /», глаза с наклоном к носу, хмурый рот
  S.stamps.push({ kind: "face", at: h(0, 9.0, 42.4), n: HV([0, 1, 0]), glow: p.glow });

  // ---------- борода из корней: шириной с лицо, до живота, 5 прядей, тоны чередуются, два золотых кольца ----------
  const gBeard = S.group(0.5);
  [-4.4, -2.2, 0, 2.2, 4.4].forEach((x0, k) => {
    const c = Math.abs(k - 2);
    const top = h(x0 * 0.95, 9.2 - c * 0.5, 38.2 + c * 0.7);
    const m1 = T([x0 * 1.08, 11.6 - c * 0.3, 31.2], true);
    const m2 = T([x0 * 1.16 + (k % 2 ? 0.3 : -0.3), 11.4 - c * 0.3, 25.8], true);
    const e = T([x0 * 1.24, 10.8 - c * 0.3, [19.4, 20.8, 23.0][c]], true);
    const ps = S.newPart();
    const tone = k % 2 ? -0.5 : 0.45;
    S.cone(gBeard, top, 1.55, m1, 1.4, { mat: M_BEARD, part: ps, tone, seed: 50 + k, band: c === 1 ? [0.38, 0.58] : undefined });
    S.cone(gBeard, m1, 1.4, m2, 1.0, { mat: M_BEARD, part: ps, tone, seed: 55 + k });
    S.cone(gBeard, m2, 1.0, e, 0.5, { mat: M_BEARD, part: ps, tone, seed: 60 + k });
  });

  // ---------- крона: 4–5 толстых ветвей-рогов в силуэте, на концах — небольшие грозди листвы ----------
  const gTwig = S.group(0.6);
  const branch = (pts: V3[], r: number[]) => {
    for (let k = 0; k + 1 < pts.length; k++) S.cone(gTwig, h(...pts[k]), r[k], h(...pts[k + 1]), r[k + 1], { mat: M_TWIG, tex: 1, ng: 2, seed: 80 + k });
  };
  for (const s of [-1, 1]) {
    branch([[s * 2.2, 2.6, 47.6], [s * 5.4, 1.6, 50.8], [s * 8.2, 1.0, 53.4], [s * 10.0, 0.8, 55.4]], [1.8, 1.45, 1.1, 0.75]);
    branch([[s * 5.4, 1.6, 50.8], [s * 9.2, 2.2, 51.0], [s * 12.0, 2.6, 52.2]], [1.15, 0.9, 0.6]);
    branch([[s * 1.4, 0.2, 47.4], [s * 3.6, -2.4, 50.4], [s * 4.6, -4.2, 52.6]], [1.2, 0.85, 0.55]);
  }
  branch([[0, 2.4, 48.2], [0.4, 1.4, 52.0], [-0.2, 0.6, 55.2]], [1.5, 1.1, 0.7]);
  const lag = pxToWorld(view, p.crown[0], p.crown[1]);
  /** гроздья: центр (в координатах головы), радиус, доп. шарики (смещение, радиус) */
  const leaves: [V3, number, [V3, number][]][] = [
    [[10.4, 0.6, 55.8], 2.3, [[[1.4, 0.4, -1.0], 1.6], [[-1.2, -0.6, 0.9], 1.5]]],
    [[-10.4, 0.6, 55.8], 2.3, [[[-1.4, 0.4, -1.0], 1.6], [[1.2, -0.6, 0.9], 1.5]]],
    [[12.4, 2.7, 52.4], 1.9, [[[0.8, -0.6, -0.9], 1.3]]],
    [[-12.4, 2.7, 52.4], 1.9, [[[-0.8, -0.6, -0.9], 1.3]]],
    [[4.8, -4.4, 53.0], 1.8, [[[0.6, -0.6, 0.8], 1.2]]],
    [[-4.8, -4.4, 53.0], 1.8, [[[-0.6, -0.6, 0.8], 1.2]]],
    [[-0.2, 0.4, 55.8], 2.1, [[[1.2, -0.4, -0.7], 1.4], [[-1.3, 0.2, -0.6], 1.3]]],
  ];
  leaves.forEach(([c, r, extra], k) => {
    const hh = hash01(k, 7, 91);
    const keep = smooth(0, 0.18, p.leaves - hh * 0.82);
    if (keep < 0.15) return;
    const g = S.group(0.8);
    const sc = 0.55 + 0.45 * keep;
    const at = (o: V3) => add(h(c[0] + o[0], c[1] + o[1], c[2] + o[2]), lag);
    S.ball(g, at([0, 0, 0]), r * sc, { mat: M_LEAF, tex: 2, seed: 60 + k });
    for (const [o, rr] of extra) S.ball(g, at(o), rr * sc, { mat: M_LEAF, tex: 2, seed: 70 + k });
  });

  // ---------- руны: три на груди, одна на спине ----------
  const runes: [V3, V3, number][] = [
    [[-7.6, 9.6, 32.6], [-0.3, 1, 0], 0],
    [[7.6, 9.6, 32.6], [0.3, 1, 0], 1],
    [[7.2, 9.6, 25.4], [0.2, 1, 0], 2],
    [[0, -11.8, 34.0], [0, -1, 0], 0],
  ];
  for (const [a, n, v] of runes) S.stamps.push({ kind: "rune", at: T(a), n: TV(n), glow: p.glow, v });

  particles(S, p);
  return S;
}

/** Частицы: листопад (гибель), пыль от шага, комья у кистей, след удара и вспышка. */
function particles(S: Scene, p: Pose) {
  // листопад: листья кружат вниз и ложатся на землю (по пикселю и тёмный под ним)
  if (p.fall > 0) {
    for (let k = 0; k < 7; k++) {
      const st = hash01(k, 3, 5) * 0.45;
      const f = clamp((p.fall - st) / 0.55, 0, 1);
      if (f <= 0) continue;
      const x0 = -11 + 22 * hash01(k, 1, 5), y0 = -3 + 6 * hash01(k, 2, 5);
      const z = lerp(50 - 8 * hash01(k, 4, 5), 0.6, easeIn(Math.min(1, f * 1.05)));
      const x = clamp(x0 * (1 + 0.5 * f) + 1.6 * Math.sin(f * 7 + k), -12, 12);
      const y = clamp(y0 + 5 * f * hash01(k, 6, 5), -11, 8);
      const dry = p.wither > 0.5;
      S.motes.push({ p: [x, y, z], col: dry ? LEAF_DRY[3] : LEAF[3], dark: dry ? LEAF_DRY[1] : LEAF[1], size: 2 });
    }
  }
  // пыль от шага: у ступни, коснувшейся земли
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) S.puffs.push({ c: [p.foot[i][0], p.foot[i][1] + 1, 0], k: p.dust[i], seed: i });
  // удар кистями о землю: пыль и комья земли
  if (p.clods > 0.02) {
    for (let i = 0; i < 2; i++) {
      const hnd = p.hand[i];
      if (hnd[2] > 12) continue;
      const c: V3 = [hnd[0], hnd[1] + 1, 0];
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
    // золотой пояс
    const bu = q.k === 1 && q.bandAx !== undefined ? tx.l[q.bandAx] / q.r[q.bandAx] : tx.u;
    if (q.band && bu >= q.band[0] && bu <= q.band[1]) mat = M_GOLD;
    // мох на верхних гранях корневищ
    if (mat === M_BARK && q.moss > 0 && n[2] > 0.3) {
      const m = hash01(Math.floor(tx.l[0] * 0.5 + 40), Math.floor(tx.l[1] * 0.5 + 40), 300 + q.seed) * 0.5 + 0.5 * Math.sin(tx.l[0] * 0.9 + tx.l[1] * 0.7 + q.seed);
      if (m * q.moss > 0.38 - n[2] * 0.3) mat = M_MOSS;
    }
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
    if (q.tex === 1 && (mat === M_BARK || mat === M_FACE)) {
      const facing = n[1] * CS + n[2] * SN;
      const wob = 0.14 * Math.sin(tx.u * q.len * 0.25 + q.seed * 1.7);
      gcoord[i] = (tx.ang * q.ng) / TAU + wob;
      gok[i] = facing > 0.4 && Math.abs(n[2]) < 0.72 ? 1 : 0;
      ulen[i] = tx.u * q.len;
    }
    // листва: кромки листьев — линии уровня волнистого поля в местных координатах грозди
    if (q.tex === 2 && mat === M_LEAF) {
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

function rampFor(mat: number, wither: number): Ramp {
  const base = MATS[mat].ramp;
  if (wither <= 0) return base;
  const target = mat === M_LEAF ? LEAF_DRY : mat === M_GOLD ? DEAD.map((c, k) => mix(c, GOLD[Math.min(k, 4)], 0.25)) : mat === M_MOSS ? DEAD.slice(0, 4) : DEAD;
  return base.map((c, k) => mix(c, target[Math.min(k, target.length - 1)], wither));
}

// ---------------- штампы: глаза, брови, рот, руны ----------------
/**
 * Рисунки в целых пикселях от точки привязки (dx вправо, dy вниз). Ключи: d — тёмная бровь над глазом, e3–e1 — свечение
 * глаза (ярче — выше), m — складка рта, r3–r1 — руна. Лицо привязано к переносице на линии глаз: брови «\ /» (внутренние
 * концы ниже, сходятся над носом), глаза под ними с наклоном к носу, рот — хмурая дуга под носом.
 */
type StampPx = [number, number, string];
const faceRows = (rows: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  const key: Record<string, string> = { D: "d", "1": "e1", "2": "e2", "3": "e3", m: "m" };
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (key[ch]) out.push([x0 + i, y0 + j, key[ch]]); }));
  return out;
};
/** Вниз: лицом к зрителю (столбец 5 — переносица). */
const ST_FACE_DOWN = faceRows([
  "DD.......DD",
  "DDDD...DDDD",
  ".123D.D321.",
  "...........",
  "...........",
  "....mmm....",
  "...m...m...",
], -5, -2);
/** Вбок (три четверти, лицом вправо): ближний глаз под бровью, дальний — пиксель за переносицей. */
const ST_FACE_SIDE = faceRows([
  "DD.....",
  "DDDD.D.",
  ".123D2.",
  ".......",
  ".......",
  "...mm..",
  "..m....",
], -4, -2);
/** Руны 2×3: три разных знака. */
const ST_RUNES: StampPx[][] = [
  [[0, -1, "r3"], [0, 0, "r2"], [1, 0, "r3"], [0, 1, "r1"]],
  [[1, -1, "r3"], [0, 0, "r3"], [1, 0, "r2"], [1, 1, "r1"]],
  [[0, -1, "r2"], [1, -1, "r3"], [0, 0, "r3"], [0, 1, "r1"]],
];

function stampOf(st: Stamp, view: ZView): StampPx[] {
  if (st.kind === "rune") return ST_RUNES[st.v ?? 0];
  return view === "side" ? ST_FACE_SIDE : view === "down" ? ST_FACE_DOWN : [];
}

function drawStamps(body: PC, sc: Scene, view: ZView, gb: GBuf, wither: number) {
  const glowG = new Float32Array(N * N), glowY = new Float32Array(N * N);
  const emis = new Uint8Array(N * N);
  for (const st of sc.stamps) {
    const a = toView(view, st.at), nv = toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < 0.12) continue;
    const [sx, sy] = scr(a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    if (gb.prim[i0] < 0 || gb.t[i0] < depthOf(a) - 2.4) continue;
    const g = clamp(st.glow, 0, 1.5);
    for (const [dx, dy, key] of stampOf(st, view)) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (gb.prim[i] < 0) continue;
      if (key === "d" || key === "m") {
        // тёмные черты лица: подсветка глаз их не трогает
        if (!emis[i]) body.set(x, y, mix(key === "d" ? FACE[0] : BEARD[0], DEAD[0], wither));
        emis[i] = 2;
        continue;
      }
      const lv = +key[1];
      if (key[0] === "e") {
        // свечение гаснет при гибели: каждая ступень ниже — на тон темнее, ниже нуля — кора
        const k = lv - Math.round((1 - Math.min(1, g)) * 3);
        if (k < 0) continue;
        body.set(x, y, EYE[clamp(k + (g > 1.2 ? 1 : 0), 0, 3)]);
        glowG[i] = Math.max(glowG[i], Math.min(1, g) * (lv / 3));
      } else {
        const k = lv - Math.round((1 - Math.min(1, g)) * 3);
        if (k < 0) continue;
        body.set(x, y, RUNE[clamp(k + (g > 1.2 ? 1 : 0), 0, 3)]);
        glowY[i] = Math.max(glowY[i], Math.min(1, g) * (lv / 3) * 0.8);
      }
      emis[i] = 1;
    }
  }
  // подсветка коры вокруг меток: размытая карта свечения, но цвет — ступенями (2 уровня), чтобы не было россыпи оттенков
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
  const bG = blurOf(glowG), bY = blurOf(glowY);
  const GLOW_G = hex("#7ad04a"), GLOW_Y = hex("#ffb43a");
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0 || emis[i]) continue;
    const g = bG[i], y = bY[i];
    const lvG = g > 0.42 ? 2 : g > 0.2 ? 1 : 0, lvY = y > 0.42 ? 2 : y > 0.2 ? 1 : 0;
    if (!lvG && !lvY) continue;
    const c = body.get(i % N, Math.floor(i / N))!;
    const t = lvG >= lvY ? GLOW_G : GLOW_Y;
    const k = [0, 0.24, 0.42][Math.max(lvG, lvY)];
    body.set(i % N, Math.floor(i / N), mix(c, [t[0], t[1], t[2], 255], k));
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

/** Кадр древня в виде view. */
export function renderTreant(view: ZView, pose: Pose): PC {
  const sc = treant(pose, view);
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) prepare(q, view);
  const gb = raster(prims, sc.gk);
  const L = shade(prims, sc.gk, gb);
  const body = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    body.set(i % N, Math.floor(i / N), rampFor(L.mat[i], pose.wither)[L.idx[i]]);
  }
  drawStamps(body, sc, view, gb, pose.wither);
  body.outline(OUT);
  sealPinholes(body);

  // ---------- сборка: тело, след удара позади руки, пыль, частицы, вспышка ----------
  const out = new PC(N, N);
  out.blit(body, 0, 0);
  for (const sm of sc.smears) drawSmear(out, sm, view, gb, prims, sc.armG[sm.arm]);
  for (const f of sc.puffs) drawPuff(out, f, view);
  for (const m of sc.motes) drawMote(out, m, view, gb);
  if (sc.flash) drawFlash(out, sc.flash, view);
  sealPinholes(out, true);
  return out;
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
 * Покой: дыхание волной снизу вверх — грудь с плечами поднимается на 1 px, голова кадром позже, листва кроны отстаёт
 * ещё на кадр и опускается последней; кисти догоняют плечи. Всё — ровно на пиксель кадра; глаза и руны мерцают ступенями.
 */
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
      glow: 0.85 + 0.2 * Math.sin(ph),
    } as Pose;
  });
}

/**
 * Ходьба: тяжёлый шаг. Корпус, голова и крона — один жёсткий слой: проседает после касания и перевешивается на опорную
 * ногу ровно на целые пиксели (без поворотов — они перерисовывали бы кору каждый кадр). Двигаются ноги и руки:
 * руки качаются навстречу ногам; пыль — у ступни при касании.
 */
function walkPoses(n = 12): Pose[] {
  const A = 5.2, LIFT = 4.4, DUTY = 0.56;
  const footAt = (u: number) => {
    u = ((u % 1) + 1) % 1;
    if (u < DUTY) return { y: A - (2 * A * u) / DUTY, z: 0, toe: 0, strike: u < 0.2 ? 1 - u / 0.2 : 0 };
    const s = (u - DUTY) / (1 - DUTY);
    return { y: -A + 2 * A * easeInOut(s), z: LIFT * Math.sin(Math.PI * s), toe: 0.3 * Math.sin(Math.PI * s), strike: 0 };
  };
  // проседание после касания и подъём на проходе; перевал на опорную ногу
  const bob = [-1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0];
  const sway = [0, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const fr = footAt(t), fl = footAt(t + 0.5);
    const armAt = (f: { y: number }, s: number): V3 => {
      const fw = -f.y / A; // рука вперёд, когда своя нога сзади
      return [s * (16.6 - 1.0 * Math.max(0, fw)) + sway[i], 5.0 + 4.4 * fw, 17.4 + 1.8 * Math.max(0, fw) + 0.8 * Math.max(0, -fw)];
    };
    return {
      ...REST, t, seed: 150 + i,
      root: [ipx(sway[i]), 0, 0], bob: bob[i] * PX,
      hand: [armAt(fr, 1), armAt(fl, -1)],
      foot: [[7.2, 0.6 + fr.y, 4.4 + fr.z], [-7.2, 0.6 + fl.y, 4.4 + fl.z]], toe: [fr.toe, fl.toe],
      glow: 0.85,
      dust: [fr.strike, fl.strike],
    } as Pose;
  });
}

/**
 * Удар правой рукой сверху вниз, к цели: замах за голову, пик, быстрый удар перед собой, отдача. Камера под 14° сжимает
 * «вперёд» вчетверо, поэтому в видах вниз и вверх кулак опускается ближе к середине и ниже — перед телом, к цели;
 * локоть согнут, кулак — отдельным комом. След — чёткий серп позади руки, удар — кадр вспышки.
 */
function attackPoses(view: ZView): Pose[] {
  const ready: Partial<Pose> = {};
  // замах — вверх и в сторону: путь кулака в кадре — дуга сверху-сбоку к середине, а не вертикальная черта
  const up: Partial<Pose> = {
    yaw: -0.3, pitch: 0.08, roll: -0.04, bob: 1 * PX, hp: -0.22,
    hand: [[17.4, -3.4, 46.4], [-15.8, 8.4, 19.0]], pole: [[1, -0.3, 0.5], [-0.8, -1, -0.2]], glow: 1.1, fist: 1,
  };
  const peak: Partial<Pose> = { ...up, yaw: -0.36, hand: [[18.2, -4.4, 48.0], [-15.6, 9.0, 19.4]] };
  const hitHand: V3 = view === "side" ? [7.0, 15.5, 12.0] : view === "up" ? [9.0, 12.0, 12.0] : [6.0, 13.5, 12.0];
  const mid: Partial<Pose> = {
    yaw: 0.08, pitch: 0.26, bob: -1 * PX, hp: -0.12,
    hand: [[22.0, 12.0, 34.0], [-15.6, 4.0, 18.4]], pole: [[1, -0.4, 0.5], [-0.8, -1, -0.2]], glow: 1.15, fist: 1,
  };
  const hit: Partial<Pose> = {
    yaw: 0.34, pitch: 0.42, roll: 0.04, bob: -3 * PX, hp: -0.04,
    hand: [hitHand, [-16.2, -2.4, 20.4]], pole: [[1, -0.7, 0.3], [-0.8, -1, -0.2]], glow: 1.25, fist: 1, flash: 1,
  };
  const settle: Partial<Pose> = { ...hit, pitch: 0.38, bob: -2 * PX, hand: [add(hitHand, [0.3, -0.4, 0.8]), [-16.2, -1.6, 19.6]], flash: 0 };
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
  // кулак идёт дугой (кривая Безье через вынос руки в сторону), а не прямой между ключами: след — серп снаружи руки
  const P0 = peak.hand![0], M = mid.hand![0], P2 = hitHand;
  const C = sub(mul(M, 2), mul(add(P0, P2), 0.5));
  const arc = (u: number): V3 => add(add(mul(P0, (1 - u) * (1 - u)), mul(C, 2 * u * (1 - u))), mul(P2, u * u));
  const fist = (w: V3) => add(w, mul(norm(sub(w, [13, 0.4, 35])), 3.2));
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => fist(arc(lerp(u0, u1, k / (n - 1)))));
  poses[5].hand = [arc(0.5), poses[5].hand[1]];
  poses[5].trail = path(0, 0.5);
  poses[6].trail = path(0.22, 1);
  poses[7].trail = path(0.72, 1, 4);
  for (const k of [5, 6, 7]) poses[k].trailArm = 0;
  poses[6].flash = 1;
  poses[6].puff = 1;
  poses[7].puff = 0.5;
  poses[7].trailArm = 0;
  return poses;
}

/** Замах «Корней»: руки вверх, пальцы-корни растопырены, глаза и руны разгораются. */
const RAISE: Partial<Pose> = {
  pitch: -0.04, bob: 1 * PX, hp: -0.26, hand: [[18.0, 3.0, 49.0], [-18.0, 3.0, 49.0]], pole: [[1, -0.4, -0.5], [-1, -0.4, -0.5]],
  glow: 1.35, fist: 0, spread: 0.7, crown: [0, 0],
};
/** Начало замаха «Корней»: 4 кадра от покоя к рукам вверх (дальше — «удержание» по кругу до конца предупреждения). */
function castPoses(): Pose[] {
  const keys: Key[] = [{ f: 0, p: {} }, { f: 3, p: RAISE, ease: easeInOut }];
  return keyed(keys, 4, 200).map((p, i) => ({ ...p, crown: [0, i === 2 ? 1 : 0] as [number, number] }));
}
/** Удержание замаха «Корней» (по кругу, пока не истечёт предупреждение): руки дрожат на пиксель целиком, свечение пульсирует. */
function holdPoses(): Pose[] {
  const keys: Key[] = [{ f: 0, p: RAISE }, { f: 1, p: RAISE }];
  const base = poseAt(keys, 0);
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 220 + i,
    armLift: [tremble[i], -tremble[i]] as [number, number],
    glow: [1.3, 1.5, 1.35, 1.5][i], crown: [0, [0, 0, 1, 0][i]] as [number, number],
  }));
}
/**
 * Удар «Корней»: кисти — в землю перед собой (кадр 2 — касание, ровно в конце предупреждения), пальцы-корни уходят в землю,
 * пыль и комья у кистей; затем древень плавно распрямляется за 4 кадра (без рывка в покой). Сами корни выходят из земли
 * в метках — это эффект мира (treant-rootfx.png), не часть листа.
 */
function slamPoses(): Pose[] {
  const low: Partial<Pose> = {
    pitch: 0.36, bob: -3 * PX, hp: 0.12, hand: [[12.4, 8.0, 10.6], [-12.4, 8.0, 10.6]], pole: [[1, -0.2, 0.6], [-1, -0.2, 0.6]],
    glow: 1.3, fist: 0, spread: 0.3, dig: 0, crown: [0, -1],
  };
  const dug: Partial<Pose> = { ...low, pitch: 0.34, bob: -3 * PX, dig: 1, spread: 0, glow: 1.2, crown: [0, 0], clods: 1 };
  const keys: Key[] = [
    { f: 0, p: RAISE },
    { f: 2, p: { ...low, clods: 1 }, ease: easeIn },
    { f: 3, p: { ...dug, clods: 0.75 }, ease: easeOut },
    { f: 5, p: { ...dug, clods: 0.25 }, ease: linear },
    // распрямляется 4 кадра, с плавным началом и концом: без рывка в покой
    { f: 9, p: {}, ease: easeInOut },
  ];
  return keyed(keys, 10, 240);
}

/** Замах «Ветвей-плетей»: руки в стороны и чуть назад, пальцы-ветви растопырены. */
const SPREAD: Partial<Pose> = {
  pitch: 0.12, bob: 0, hp: -0.18, hand: [[23.0, -3.4, 34.0], [-23.0, -3.4, 34.0]], pole: [[0.2, -1, -0.5], [-0.2, -1, -0.5]],
  glow: 1.25, fist: 0, spread: 1,
};
function spreadPoses(): Pose[] {
  const keys: Key[] = [{ f: 0, p: {} }, { f: 3, p: SPREAD, ease: easeOut }];
  return keyed(keys, 4, 300);
}
function spreadHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: SPREAD }, { f: 1, p: SPREAD }], 0);
  const sway = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 320 + i,
    armLift: [sway[i], -sway[i]] as [number, number],
    glow: [1.2, 1.4, 1.25, 1.4][i],
  }));
}
/**
 * Хлёст: обе руки разом бьют по бокам — из замаха вверх-в-стороны вниз и вперёд по широкой дуге (кадр 2 — удар),
 * у каждой руки свой серп; затем возврат к покою. Опасно по бокам, спереди и сзади — нет, как в карточке.
 */
function lashPoses(): Pose[] {
  const whip: Partial<Pose> = {
    pitch: 0.3, bob: -1 * PX, hp: -0.06, hand: [[20.0, 9.0, 17.0], [-20.0, 9.0, 17.0]], pole: [[0.4, -1, 0.3], [-0.4, -1, 0.3]],
    glow: 1.2, fist: 0, spread: 0.8,
  };
  const keys: Key[] = [
    { f: 0, p: SPREAD },
    { f: 1, p: { ...SPREAD, hand: [[25.0, 3.0, 31.0], [-25.0, 3.0, 31.0]], spread: 1 }, ease: easeIn },
    { f: 2, p: whip, ease: easeOut },
    { f: 3, p: { ...whip, pitch: 0.28, hand: [[19.4, 9.6, 16.4], [-19.4, 9.6, 16.4]] }, ease: easeOut },
    { f: 7, p: {}, ease: easeInOut },
  ];
  const poses = keyed(keys, 8, 340);
  // путь кисти — дуга через вынос в сторону (Безье): серп снаружи руки, по обе стороны
  const P0 = SPREAD.hand![0], P2 = whip.hand![0], M: V3 = [26.5, 4.0, 29.0];
  const C = sub(mul(M, 2), mul(add(P0, P2), 0.5));
  const arc = (u: number): V3 => add(add(mul(P0, (1 - u) * (1 - u)), mul(C, 2 * u * (1 - u))), mul(P2, u * u));
  const tip = (w: V3) => add(w, mul(norm(sub(w, [13, 0.4, 35])), 4.5));
  const path = (u0: number, u1: number, n = 8) => Array.from({ length: n }, (_, k) => tip(arc(lerp(u0, u1, k / (n - 1)))));
  const mirror = (v: V3): V3 => [-v[0], v[1], v[2]];
  poses[1].hand = [arc(0.5), mirror(arc(0.5))];
  const tr: [number, number, number][] = [[1, 0, 0.5], [2, 0.18, 1], [3, 0.7, 1]];
  for (const [k, u0, u1] of tr) {
    poses[k].trail = path(u0, u1, k === 3 ? 4 : 8);
    poses[k].trail2 = poses[k].trail!.map(mirror);
    poses[k].trailArm = 0;
  }
  return poses;
}

/**
 * Гибель: кадр 0 — почти покой, отшатнулся на 2 px к кадру 2, опускается на колени, кланяется до земли и засыхает —
 * листва облетает, глаза и руны гаснут.
 */
function deathPoses(): Pose[] {
  const recoil: Partial<Pose> = {
    pitch: 0.15, bob: 1 * PX, hp: -0.24, hand: [[18.4, 1.4, 18.6], [-18.4, 1.4, 18.6]], crown: [0, 1], glow: 1.5,
  };
  const stagger: Partial<Pose> = {
    pitch: 0.14, roll: 0.06, yaw: 0.08, bob: 0, hp: -0.12, hand: [[18.0, 2.4, 16.0], [-17.4, 3.4, 15.6]], crown: [0, -1], glow: 0.9, fall: 0.08,
  };
  const kneel: [V3, V3] = [[5.2, -9.0, 3.4], [-5.2, -8.4, 3.4]];
  const knees: Partial<Pose> = {
    root: [0, -2.4, 0], pitch: 0.3, roll: 0.03, bob: -8 * PX, hp: 0.1, foot: kneel, toe: [-0.9, -0.9], hand: [[17.0, 3.6, 6.0], [-17.0, 3.6, 6.0]],
    pole: [[1, -0.6, 0.2], [-1, -0.6, 0.2]], crown: [0, 1], glow: 0.6, fall: 0.35, dust: [1, 1], leaves: 0.85,
  };
  const bow: Partial<Pose> = {
    ...knees, root: [0, -4, 0], pitch: 0.56, bob: -9 * PX, hp: 0.36, hand: [[8.4, 6.6, 4.2], [-8.4, 6.6, 4.2]], crown: [0, 0], glow: 0.3, fall: 0.6, dust: [0.3, 0.3], leaves: 0.55, wither: 0.25,
  };
  const dead: Partial<Pose> = { ...bow, pitch: 0.62, bob: -9 * PX, hp: 0.42, glow: 0, fall: 1, dust: [0, 0], leaves: 0.1, wither: 1 };
  const keys: Key[] = [
    { f: 0, p: { glow: 1.0 } },
    { f: 2, p: recoil, ease: easeOut },
    { f: 4, p: stagger, ease: easeInOut },
    { f: 6.4, p: knees, ease: easeIn },
    { f: 8, p: bow, ease: easeInOut },
    { f: 11, p: dead, ease: easeOut },
  ];
  return keyed(keys, 12, 700);
}

export type TreantAnim = "idle" | "walk" | "attack" | "cast" | "hold" | "slam" | "spread" | "spreadHold" | "lash" | "death";
/**
 * Анимации: первый столбец листа, число кадров, кадров в секунду, по кругу ли, что играть следом. Замахи умений —
 * связки: «cast» → «hold» по кругу до конца предупреждения → «slam» (касание земли — кадр hit); так же «spread» →
 * «spreadHold» → «lash».
 */
export const TREANT_ANIMS: Record<TreantAnim, { col: number; n: number; fps: number; loop: boolean; ru: string; next?: TreantAnim; hit?: number }> = {
  idle: { col: 0, n: 12, fps: 12, loop: true, ru: "покой" },
  walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
  attack: { col: 24, n: 10, fps: 15, loop: false, ru: "атака", hit: 6 },
  cast: { col: 34, n: 4, fps: 12, loop: false, ru: "замах корней", next: "hold" },
  hold: { col: 38, n: 4, fps: 12, loop: true, ru: "удержание корней", next: "slam" },
  slam: { col: 42, n: 10, fps: 12, loop: false, ru: "удар корней", hit: 2 },
  spread: { col: 52, n: 4, fps: 12, loop: false, ru: "замах ветвей", next: "spreadHold" },
  spreadHold: { col: 56, n: 4, fps: 12, loop: true, ru: "удержание ветвей", next: "lash" },
  lash: { col: 60, n: 8, fps: 12, loop: false, ru: "хлёст ветвей", hit: 2 },
  death: { col: 68, n: 12, fps: 12, loop: false, ru: "гибель" },
};
export const TREANT_COLS = 80;
/**
 * Умения карточки → анимации: замах (связка) длится windupMs, удар начинается так, чтобы кадр hit пришёлся ровно на конец
 * предупреждения. Корни выходят из земли эффектом мира fx в метках (snare) или по борозде (furrow) — тоже в конце замаха.
 */
export const TREANT_SKILLS: Record<string, { windup: [TreantAnim, TreantAnim]; strike: TreantAnim; fx?: "snare" | "furrow" }> = {
  root_snare: { windup: ["cast", "hold"], strike: "slam", fx: "snare" },
  root_furrow: { windup: ["cast", "hold"], strike: "slam", fx: "furrow" },
  branch_sweep: { windup: ["spread", "spreadHold"], strike: "lash" },
};
const POSES: Record<TreantAnim, (view: ZView) => Pose[]> = {
  idle: () => idlePoses(), walk: () => walkPoses(), attack: attackPoses, cast: castPoses, hold: holdPoses, slam: slamPoses,
  spread: spreadPoses, spreadHold: spreadHoldPoses, lash: lashPoses, death: deathPoses,
};

/** Лист одной анимации: 3 строки (вниз, вверх, вбок), столбцы — кадры. */
export function buildTreantAnim(anim: TreantAnim): PC {
  const A = TREANT_ANIMS[anim];
  const out = new PC(N * A.n, N * 3);
  ZB_VIEWS.forEach((v, row) => POSES[anim](v).forEach((p, i) => out.blit(renderTreant(v, p), i * N, row * N)));
  return out;
}

/** Весь лист: TREANT_COLS столбцов × 3 строки. */
export function buildTreantSheet(parts?: Partial<Record<TreantAnim, PC>>): PC {
  const out = new PC(N * TREANT_COLS, N * 3);
  for (const a of Object.keys(TREANT_ANIMS) as TreantAnim[]) out.blit(parts?.[a] ?? buildTreantAnim(a), TREANT_ANIMS[a].col * N, 0);
  return out;
}

/** Один кадр для отладки: вид, анимация, номер. */
export function treantFrame(view: ZView, anim: TreantAnim, i: number): PC {
  return renderTreant(view, POSES[anim](view)[i]);
}

// ---------------- эффект мира: корни из земли ----------------
/** Земля и комья: 5 непрозрачных тонов, без полупрозрачности. */
const EARTH = R("#20160f", "#3a2a1c", "#5a442e", "#7c6345", "#a3875f");
/** Центр метки в кадре эффекта 64×64. Земля в игре — без сжатия (круги меток круглые), корни растут вверх. */
const FX_AY = 44;
/** Корень: угол основания в кадре (0° — вправо, 90° — вниз), радиус от центра, высота, отгиб наружу, загиб к центру, толщина, задержка. */
interface RootDef { th: number; r: number; h: number; lean: number; hook: number; rad: number; delay: number }
/** «Корни-ловушки»: пять толстых корней кольцом вокруг ступней героя, загнуты к нему, как когти; передние два — поверх героя. */
const SNARE_ROOTS: RootDef[] = [
  { th: 205, r: 12.5, h: 21, lean: 2.0, hook: 7.0, rad: 3.2, delay: 0.12 },
  { th: 268, r: 11.5, h: 24, lean: 1.4, hook: 6.0, rad: 3.4, delay: 0 },
  { th: 335, r: 12.5, h: 21, lean: 2.0, hook: 7.0, rad: 3.2, delay: 0.18 },
  { th: 38, r: 13, h: 16, lean: 2.2, hook: 5.6, rad: 3.0, delay: 0.06 },
  { th: 142, r: 13, h: 16, lean: 2.2, hook: 5.6, rad: 3.0, delay: 0.24 },
];
/** «Корневая борозда»: в каждой метке из ямы бьют три кола-корня и уходят обратно. */
const FURROW_ROOTS: RootDef[] = [
  { th: 265, r: 3, h: 20, lean: 2.2, hook: -1.0, rad: 3.4, delay: 0 },
  { th: 15, r: 4.5, h: 14, lean: 3.6, hook: -0.8, rad: 2.6, delay: 0.12 },
  { th: 165, r: 4.5, h: 13, lean: 3.6, hook: -0.8, rad: 2.5, delay: 0.2 },
];
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Передний корень (основание ниже центра метки) рисуется поверх героя. */
const isFront = (d: RootDef) => Math.sin(rad(d.th)) > 0.2;

/** Корень в пространстве вида: из-под земли целиком (сперва кончик), кривая — вверх, чуть наружу, к концу загиб к центру. Возвращает кончик. */
function rootPrims(S: Scene, d: RootDef, k: number, g: number, flex: number): V3 {
  const c = Math.cos(rad(d.th)), s = Math.sin(rad(d.th));
  // экранный сдвиг по земле → вид (ось к зрителю сжата камерой в SN раз)
  const ground = (ox: number, oy: number): V3 => [ox, oy / SN, 0];
  const base: V3 = ground(c * d.r, FX_AY - GY + s * d.r);
  const H = d.h * PX, sink = (1 - g) * (H + 3);
  const grp = S.group(0.9);
  const pts: V3[] = [];
  const seg = 7;
  for (let j = 0; j <= seg; j++) {
    const u = j / seg;
    const out = d.lean * Math.sin(Math.PI * u * 0.85) - (d.hook + flex) * u * u * u;
    pts.push(add(add(base, ground(c * out, s * out)), [0, 0, H * u - sink]));
  }
  const rr = (u: number) => lerp(d.rad, 0.55, Math.pow(u, 0.9));
  for (let j = 0; j < seg; j++) S.cone(grp, pts[j], rr(j / seg), pts[j + 1], rr((j + 1) / seg), { mat: M_ROOT, tex: 1, ng: 2, seed: 300 + k });
  // боковой корешок наружу-вверх
  if (d.h > 15) {
    const m = pts[2];
    S.cone(grp, m, 1.3, add(add(m, ground(c * 3.4, s * 3.4)), [0, 0, 2.8]), 0.5, { mat: M_ROOT, seed: 300 + k });
  }
  return pts[seg];
}

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

interface FxState {
  grow: (d: RootDef) => number; flex: number;
  /** ямы и трещины 0..1; бледнеют к концу; комья: кадры от выброса (undefined — нет); пыль 0..1; огоньки на кончиках */
  hole: number; crack: number; pale?: boolean; clodT?: number; clodsLeft?: number; puff?: number; tips?: number;
}
/** Кадр эффекта: [нижний слой — под юнитами: ямы, трещины, задние корни; верхний — над юнитами: передние корни, летящие комья]. */
function rootFxFrame(defs: RootDef[], st: FxState, seed: number, furrow: boolean): [PC, PC] {
  const S = new Scene();
  const tips: [V3, RootDef][] = [];
  defs.forEach((d, k) => {
    const g = st.grow(d);
    if (g > 0.03) tips.push([rootPrims(S, d, k, g, st.flex), d]);
  });
  const back = new PC(N, N), front = new PC(N, N);
  const cx = CX, cy = FX_AY;
  const baseOf = (d: RootDef): [number, number] => [cx + Math.cos(rad(d.th)) * d.r, cy + Math.sin(rad(d.th)) * d.r];
  // трещины: у «борозды» — лучами от общей ямы, у «ловушки» — по две от каждой ямы наружу
  const cracks: Crack[] = [];
  if (furrow) for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.5 + (hash01(k, seed, 1) - 0.5) * 0.7;
    cracks.push(crack(cx + Math.cos(a) * 4.5, cy + Math.sin(a) * 2.6, a, 7 + 4 * hash01(k, seed, 2), 2.8, seed + k));
  }
  else defs.forEach((d, k) => {
    const [bx, by] = baseOf(d);
    const a = rad(d.th + (hash01(k, 2, seed) - 0.5) * 50);
    cracks.push(crack(bx + Math.cos(a) * 3.6, by + Math.sin(a) * 2.2, a, 5 + 3 * hash01(k, 5, seed), 2.6, seed + k * 3));
  });
  drawCracks(back, cracks, st.crack, st.pale);
  if (furrow) drawHole(back, cx, cy, st.hole * 1.25, seed, st.pale);
  else defs.forEach((d, k) => { const [bx, by] = baseOf(d); drawHole(back, bx, by, st.hole, k + seed, st.pale); });
  // комья: летят из ям, падают и лежат вокруг; к концу исчезают по одному
  const clods: [number, number, number][] = [];
  defs.forEach((d, k) => {
    for (let j = 0; j < (furrow ? 2 : 1); j++) {
      const dir = (j || (!furrow && Math.cos(rad(d.th)) > 0) ? 1 : -1) * (0.9 + 0.8 * hash01(k, j, seed));
      clods.push([k * 2 + j, dir, 1.8 + 1.4 * hash01(k, j, seed + 1)]);
    }
  });
  if (st.clodT !== undefined) {
    const left = st.clodsLeft ?? clods.length;
    clods.forEach(([n, vx, vz]) => {
      if (n >= left) return;
      const d = defs[Math.floor(n / 2)];
      const [bx, by] = furrow ? [cx, cy] : baseOf(d);
      const [x, y, rest] = clodPos(bx + (n % 2 ? 2 : -3), by + (furrow ? 1 : 0), vx * (furrow ? 2 : 1.4), vz, st.clodT!);
      drawClodAt(rest ? back : front, x, y + (rest ? 1 : 0), n + seed);
    });
  }
  if (S.prims.length) {
    const order = S.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const prims = order.map(([, i]) => S.prims[i]);
    for (const q of prims) prepare(q, null);
    const gb = raster(prims, S.gk);
    const L = shade(prims, S.gk, gb);
    const layers = [new PC(N, N), new PC(N, N)];
    for (let i = 0; i < N * N; i++) {
      if (gb.prim[i] < 0) continue;
      const d = defs[prims[gb.prim[i]].seed - 300];
      layers[isFront(d) ? 1 : 0].set(i % N, (i / N) | 0, MATS[L.mat[i]].ramp[L.idx[i]]);
    }
    for (const l of layers) {
      l.outline(OUT);
      sealPinholes(l);
    }
    // огоньки на кончиках: зелёный свет силы древня (как глаза), ступенями
    if ((st.tips ?? 0) > 0.05) for (const [tip, d] of tips) {
      const [tx, ty] = scr(tip);
      const x = Math.floor(tx), y = Math.floor(ty);
      const l = layers[isFront(d) ? 1 : 0];
      if (l.alpha(x, y) === 0 && l.alpha(x, y + 1) === 0) continue;
      l.set(x, y, EYE[st.tips! > 0.7 ? 3 : 2]);
      l.set(x, y + 1, EYE[st.tips! > 0.7 ? 2 : 1]);
    }
    back.blit(layers[0], 0, 0);
    front.blit(layers[1], 0, 0);
  }
  if (st.puff !== undefined && st.puff > 0) {
    if (furrow) drawPuffAt(front, cx, cy + 1, { c: [0, 0, 0], k: st.puff, seed });
    else defs.forEach((d, k) => { const [bx, by] = baseOf(d); drawPuffAt(isFront(d) ? front : back, bx, by + 1, { c: [0, 0, 0], k: st.puff!, seed: k + seed }); });
  }
  sealPinholes(back, true);
  sealPinholes(front, true);
  return [back, front];
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

/**
 * Эффект мира «корни из земли» (treant-rootfx.png): кадр 64×64, центр метки — (32, 44). Строка 0 — нижний слой (под юнитами),
 * строка 1 — верхний (над юнитами). Столбцы — ROOTFX_ANIMS: «ловушка» — выход (корни вырываются на кадре hit — в конце
 * предупреждения), удержание по кругу на время rootMs, уход в землю; «борозда» — один выброс на метку.
 */
export const ROOTFX_ANIMS = {
  snareIn: { col: 0, n: 6, fps: 12, loop: false, hit: 2, next: "snareHold" },
  snareHold: { col: 6, n: 4, fps: 12, loop: true, next: "snareOut" },
  snareOut: { col: 10, n: 6, fps: 12, loop: false },
  furrow: { col: 16, n: 8, fps: 12, loop: false, hit: 1 },
} as const;
export const ROOTFX_COLS = 24;

export function buildRootFx(): PC {
  const out = new PC(N * ROOTFX_COLS, N * 2);
  const put = (col: number, [b, f]: [PC, PC]) => {
    out.blit(b, col * N, 0);
    out.blit(f, col * N, N);
  };
  const growAt = (x: number) => (d: RootDef) => clamp((x - d.delay) / (1 - d.delay * 0.6), 0, 1);
  const NCL = SNARE_ROOTS.length * 2;
  // выход: ямы раскрываются, корни вырываются с перехлёстом загиба, комья летят и ложатся вокруг
  const inGrow = [0, 0.32, 0.74, 1, 1, 1], inFlex = [0, -0.5, -1.6, 1.3, 0.4, 0], inHole = [0.45, 0.85, 1, 1, 1, 1], inCrack = [0.3, 0.7, 1, 1, 1, 1];
  for (let i = 0; i < 6; i++) {
    put(ROOTFX_ANIMS.snareIn.col + i, rootFxFrame(SNARE_ROOTS, {
      grow: (d) => easeOut(growAt(inGrow[i])(d)), flex: inFlex[i], hole: inHole[i], crack: inCrack[i],
      clodT: i >= 1 ? (i - 1) * 1.7 : undefined, puff: i >= 1 && i <= 3 ? 1 - (i - 1) / 3 : undefined, tips: i >= 3 ? 0.6 : 0,
    }, 11, false));
  }
  // удержание: кончики сжимаются и разжимаются на пиксель, огоньки мерцают
  const holdFlex = [0, 0.8, 1.4, 0.8], holdTips = [0.6, 0.8, 1, 0.8];
  for (let i = 0; i < 4; i++) {
    put(ROOTFX_ANIMS.snareHold.col + i, rootFxFrame(SNARE_ROOTS, {
      grow: () => 1, flex: holdFlex[i], hole: 1, crack: 1, clodT: 99, tips: holdTips[i],
    }, 11, false));
  }
  // уход: хватка разжимается, корни уходят в землю (ускоряясь), ямы и трещины затягиваются, комья тают по одному
  const outGrow = [0.94, 0.74, 0.44, 0.14, 0, 0], outHole = [1, 1, 0.9, 0.7, 0.45, 0.2], outCrack = [1, 1, 0.8, 0.55, 0.3, 0.1];
  for (let i = 0; i < 6; i++) {
    put(ROOTFX_ANIMS.snareOut.col + i, rootFxFrame(SNARE_ROOTS, {
      grow: () => outGrow[i], flex: -1.2 * (1 - outGrow[i]) - 0.6, hole: outHole[i], crack: outCrack[i], pale: i >= 4,
      clodT: 99, clodsLeft: Math.round(NCL * (1 - i / 5)), tips: i < 2 ? 0.4 : 0,
    }, 11, false));
  }
  // борозда: выброс кольев и обратно, яма и комья остаются и тают
  const fGrow = [0, 0.8, 1, 0.74, 0.4, 0.1, 0, 0], fHole = [0.5, 1, 1, 1, 1, 0.85, 0.55, 0.25], fCrack = [0.4, 1, 1, 1, 1, 0.75, 0.45, 0.2];
  for (let i = 0; i < 8; i++) {
    put(ROOTFX_ANIMS.furrow.col + i, rootFxFrame(FURROW_ROOTS, {
      grow: (d) => easeOut(clamp(fGrow[i] - d.delay * (i <= 1 ? 1 : 0), 0, 1)), flex: 0, hole: fHole[i], crack: fCrack[i], pale: i >= 6,
      clodT: i >= 1 ? (i - 1) * 1.8 : undefined, clodsLeft: i >= 6 ? FURROW_ROOTS.length * 2 - (i - 5) * 2 : undefined, puff: i >= 1 && i <= 3 ? 1 - (i - 1) / 3 : undefined,
    }, 23, true));
  }
  return out;
}

// ---------------- светлячки: частицы клиента ----------------
/**
 * Светлячки вокруг кроны и плеч — не кадры листа: клиент двигает их каждый кадр экрана (как ореол рейд-босса — отдельная
 * текстура), шаг — пиксель холста. Спрайт treant-mote.png: 4 кадра 5×5 мерцания. Петли: центр (px от точки опоры,
 * вверх — минус), полуоси, период, сдвиг фазы.
 */
export const TREANT_MOTES = {
  sprite: "treant-mote.png", size: 5, frames: 4, fps: 8,
  orbits: [
    { c: [-19, -44], r: [4, 2.5], period: 3.2, phase: 0 },
    { c: [20, -38], r: [3.5, 3], period: 2.8, phase: 1.7 },
    { c: [-4, -59], r: [5, 2], period: 3.6, phase: 3.1 },
    { c: [22, -20], r: [3, 4], period: 3.0, phase: 4.4 },
    { c: [-23, -18], r: [3.5, 3.5], period: 3.4, phase: 2.2 },
  ],
};
export function buildMote(): PC {
  const S = TREANT_MOTES.size;
  const out = new PC(S * TREANT_MOTES.frames, S);
  const draw = (f: number, px: [number, number, RGBA][]) => px.forEach(([x, y, c]) => out.set(f * S + 2 + x, 2 + y, c));
  const cross = (r: number, c: RGBA): [number, number, RGBA][] => [[r, 0, c], [-r, 0, c], [0, r, c], [0, -r, c]];
  draw(0, [[0, 0, RUNE[3]], ...cross(1, RUNE[2])]);
  draw(1, [[0, 0, RUNE[2]], ...cross(1, RUNE[1])]);
  draw(2, [[0, 0, RUNE[3]], ...cross(1, RUNE[2]), ...cross(2, RUNE[1])]);
  draw(3, [[0, 0, RUNE[2]], ...cross(1, RUNE[0])]);
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

/** Монтаж: кадры древня рядом с героем 32×32 на траве и лесной земле (×3 и ×2, масштаб игры), эффект корней с героем. */
function buildPreview(sheets: Record<TreantAnim, PC>, fx: PC, hero: PC, terrain: PC): PC {
  const W = 1660;
  const rows: { h: number; draw: (c: PC, y: number) => void }[] = [];
  const BG: RGBA = [24, 20, 26, 255];
  const frameOf = (a: TreantAnim, view: number, i: number) => crop(sheets[a], i * N, view * N, N, N);
  const heroDown = crop(hero, 0, 0, 32, 32);
  const heroSide = crop(hero, 0, 64, 32, 32);
  // ×3: герой, древень вниз, вверх, вбок, влево — на траве и на лесной земле
  for (const g of ["grass", "forest"] as Ground[]) {
    rows.push({
      h: 64 * 3 + 40,
      draw: (c, y0) => {
        const k = 3;
        text(c, `×3 · ГЕРОЙ 32 И ДРЕВЕНЬ 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · ${g === "grass" ? "ТРАВА" : "ЛЕСНАЯ ЗЕМЛЯ"}`, 16, y0 + 8);
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
  // ×2: каждая анимация — кадры вниз и вбок
  for (const a of Object.keys(TREANT_ANIMS) as TreantAnim[]) {
    const A = TREANT_ANIMS[a];
    rows.push({
      h: 64 * 2 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.next ? ` · → ${TREANT_ANIMS[A.next].ru}` : ""}`, 16, y0 + 8);
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
  // эффект мира: корни под героем (нижний слой, герой, верхний слой) и выброс «борозды»
  rows.push({
    h: 64 * 2 * 2 + 40,
    draw: (c, y0) => {
      const k = 2;
      text(c, "×2 · ЭФФЕКТ МИРА · КОРНИ-ЛОВУШКИ: ВЫХОД 6 · УДЕРЖАНИЕ 4 · УХОД 6 · КОРНЕВАЯ БОРОЗДА 8 · 12 К/С", 16, y0 + 8);
      const cols = [[0, 6], [6, 4], [10, 6]] as [number, number][];
      const y = y0 + 34;
      groundBg(c, terrain, 16, y, W - 32, 64 * k * 2, k, "grass");
      let x = 24;
      for (const [c0, n] of cols) for (let i = 0; i < n; i++) {
        const col = c0 + i;
        c.blit(scaleNN(crop(fx, col * N, 0, N, N), k), x, y);
        shadowBlob(c, x + 32 * k, y + 43 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroDown, k), x + 16 * k, y + 13 * k);
        c.blit(scaleNN(crop(fx, col * N, N, N, N), k), x, y);
        x += 50 * k;
      }
      const y2 = y + 64 * k;
      x = 24;
      for (let i = 0; i < 8; i++) {
        const col = ROOTFX_ANIMS.furrow.col + i;
        c.blit(scaleNN(crop(fx, col * N, 0, N, N), k), x, y2);
        c.blit(scaleNN(crop(fx, col * N, N, N, N), k), x, y2);
        x += 64 * k;
      }
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

/** «Наш | референс»: древень вниз и вбок (покой) крупно и образец 15 той же высоты. */
function buildCompare(sheets: Record<TreantAnim, PC>, ref: PC | null): PC {
  const k = 6;
  const ours = crop(sheets.idle, 0, 0, N, N);
  const side = crop(sheets.idle, 0, 2 * N, N, N);
  const H = N * k;
  const refC = ref ? crop(ref, 848, 163, 660, 367) : null;
  const refS = refC ? scaleBox(refC, Math.round((660 * H) / 367), H) : null;
  const W = 24 + N * k + 16 + N * k + 24 + (refS ? refS.w + 24 : 0);
  const c = new PC(W, H + 72);
  fill(c, 0, 0, W, H + 72, [36, 32, 38, 255]);
  text(c, "НАШ", 24, 14, 3);
  if (refS) text(c, "РЕФЕРЕНС 15", 24 + 2 * N * k + 40, 14, 3);
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

/** Просмотр с анимацией: листы встроены в страницу (data:); светлячки — частицы в коде, как у клиента; умения — по таймингам карточки. */
function buildHtml(sheet: PC, fx: PC, mote: PC, hero: PC, terrain: PC, skills: { id: string; name: string; windupMs: number; after?: { rootMs?: number } }[]): string {
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
<title>Древень Торнвель — анимации</title>
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
<h1>Древень Торнвель — страж Королевской пущи</h1>
<p>Кадр 64×64, рядом герой 32×32; масштаб игры. Вниз, вверх, вбок, влево (отражение). Скорость — как в листе. Светлячки — не кадры листа: их облёт считается в коде каждый кадр экрана с шагом в пиксель холста, как это будет делать клиент.</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0" checked> трава</label><label><input type="radio" name="g" value="1"> лесная земля</label>
<label><input type="checkbox" id="motes" checked> светлячки</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Замах длится windupMs из карточки (связка «замах → удержание по кругу»), кадр удара приходится ровно на конец предупреждения; корни выходят из земли эффектом мира в метках — под двумя героями или рядом к дальнему герою. Зелёные круги — метки предупреждения (в игре их рисует клиент).</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const ANIMS = ${JSON.stringify(TREANT_ANIMS)};
const FX = ${JSON.stringify(ROOTFX_ANIMS)};
const MOTES = ${JSON.stringify(TREANT_MOTES)};
const SKILLS = ${JSON.stringify(skills.map((s) => ({ ...s, ...TREANT_SKILLS[s.id] })))};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${png(sheet)}"), fxImg = img("${png(fx)}"), moteImg = img("${png(mote)}"), hero = img("${png(hero)}");
const grounds = [img("${grounds[0]}"), img("${grounds[1]}")];
let anim = "idle", zoom = 3, ground = 0, frame = 0, last = 0, held = 0, showMotes = true;
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
document.getElementById("motes").onchange = (e) => { showMotes = e.target.checked; };
let canvases = [];
function build() {
  const st = document.getElementById("stage"); st.innerHTML = ""; canvases = [];
  for (const v of views) {
    const c = document.createElement("canvas"); c.width = 112 * zoom; c.height = 72 * zoom; c.title = v[0];
    st.appendChild(c); canvases.push([c, v]);
  }
  const a = document.getElementById("arena"); a.width = 360 * zoom; a.height = 200 * zoom;
}
build();
function paintGround(g, w, h) {
  for (let y = 0; y < h; y += 32 * zoom) for (let x = 0; x < w; x += 32 * zoom) g.drawImage(grounds[ground], ((x / zoom / 32 + y / zoom / 32) % 4) * 32, 0, 32, 32, x, y, 32 * zoom, 32 * zoom);
}
/** Светлячки: петли вокруг точки опоры (fx, fy — в пикселях мира), позиция — с шагом в пиксель холста. */
function drawMotes(g, fx, fy, flip, ts) {
  if (!showMotes) return;
  const S = MOTES.size;
  MOTES.orbits.forEach((o, k) => {
    const a = (ts / 1000) * Math.PI * 2 / o.period + o.phase;
    const x = (flip ? -o.c[0] : o.c[0]) + o.r[0] * Math.cos(a), y = o.c[1] + o.r[1] * Math.sin(a * 2) * 0.6 + 1.2 * Math.sin(a * 0.5);
    const f = Math.floor((ts / 1000) * MOTES.fps + k * 1.7) % MOTES.frames;
    const px = Math.round((fx + x - S / 2) * zoom), py = Math.round((fy + y - S / 2) * zoom);
    g.drawImage(moteImg, f * S, 0, S, S, px, py, S * zoom, S * zoom);
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
    const bx = 40, by = 4;
    shadow(g, bx + 32, by + 60, 17, 5); shadow(g, 18, by + 62, 7, 2.4);
    drawBoss(g, A.col + frame, row, flip, bx, by);
    drawMotes(g, bx + 32, by + 60, flip, ts);
    g.drawImage(hero, 0, row === 1 ? 32 : row === 2 ? 64 : 0, 32, 32, 2 * zoom, (by + 32) * zoom, 32 * zoom, 32 * zoom);
    g.fillStyle = "#efe6d2"; g.font = (6 * zoom) + "px system-ui"; g.fillText(name, 4 * zoom, 10 * zoom);
  }
}
// ---- умения: связка анимаций по времени, эффект корней в метках ----
const sbar = document.getElementById("skills");
let skill = null, t0 = 0;
for (const s of SKILLS) {
  const b = document.createElement("button");
  b.textContent = s.name + " · замах " + (s.windupMs / 1000).toFixed(1).replace(".", ",") + " с";
  b.onclick = () => { skill = s; t0 = performance.now(); };
  sbar.appendChild(b);
}
function bossFrameAt(s, t) {
  // замах: первая анимация связки один раз, затем удержание по кругу; удар — так, чтобы кадр hit пришёлся на windupMs
  const W = ANIMS[s.windup[0]], Hd = ANIMS[s.windup[1]], St = ANIMS[s.strike];
  const strikeAt = s.windupMs - (St.hit / St.fps) * 1000;
  if (t < 0) return ANIMS.idle.col;
  if (t < Math.min(strikeAt, (W.n / W.fps) * 1000)) return W.col + Math.min(W.n - 1, Math.floor((t / 1000) * W.fps));
  if (t < strikeAt) return Hd.col + (Math.floor(((t - (W.n / W.fps) * 1000) / 1000) * Hd.fps) % Hd.n);
  const k = Math.floor(((t - strikeAt) / 1000) * St.fps);
  return k < St.n ? St.col + k : ANIMS.idle.col + (Math.floor((t / 1000) * 12) % 12);
}
function fxFrameAt(s, t) {
  // корни: «ловушка» — выход (кадр hit — в конце замаха), удержание rootMs, уход; «борозда» — по метке через 160 мс
  const hitT = t - s.windupMs;
  if (s.fx === "snare") {
    const I = FX.snareIn, Hd = FX.snareHold, O = FX.snareOut;
    const k = Math.floor((hitT / 1000) * 12) + I.hit;
    if (k < 0) return -1;
    if (k < I.n) return I.col + k;
    const holdN = Math.round(((s.after && s.after.rootMs) || 1500) / 1000 * 12) - (I.n - I.hit);
    if (k < I.n + holdN) return Hd.col + ((k - I.n) % Hd.n);
    const j = k - I.n - holdN;
    return j < O.n ? O.col + j : -1;
  }
  return -1;
}
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  const bx = 150, by = 30, foot = [bx + 32, by + 60];
  const t = skill ? ts - t0 : -1;
  const heroes = [[foot[0] - 120, foot[1] + 60], [foot[0] + 110, foot[1] + 70], [foot[0] + 44, foot[1] + 4]];
  const tele = skill && t >= 0 && t < skill.windupMs;
  if (skill && skill.fx === "snare" && tele) for (const h of heroes.slice(0, 2)) { g.fillStyle = "rgba(90,200,70,.28)"; g.strokeStyle = "#5ad04a"; g.lineWidth = zoom; g.beginPath(); g.arc(h[0] * zoom, h[1] * zoom, 48 * zoom, 0, 7); g.fill(); g.stroke(); }
  const furrowPts = [];
  if (skill && skill.fx === "furrow") {
    const far = heroes[1], dx = far[0] - foot[0], dy = far[1] - foot[1], l = Math.hypot(dx, dy);
    for (let i = 1; i <= 5; i++) furrowPts.push([foot[0] + dx / l * 56 * i, foot[1] + dy / l * 56 * i]);
    if (tele) for (const p of furrowPts) { g.fillStyle = "rgba(90,200,70,.28)"; g.strokeStyle = "#5ad04a"; g.lineWidth = zoom; g.beginPath(); g.arc(p[0] * zoom, p[1] * zoom, 32 * zoom, 0, 7); g.fill(); g.stroke(); }
  }
  if (skill && skill.id === "branch_sweep" && tele) for (const d of [Math.PI / 2, -Math.PI / 2]) {
    const ang = Math.atan2(heroes[2][1] - foot[1], heroes[2][0] - foot[0]) + d;
    g.fillStyle = "rgba(90,200,70,.28)"; g.strokeStyle = "#5ad04a"; g.lineWidth = zoom; g.beginPath(); g.moveTo(foot[0] * zoom, foot[1] * zoom);
    g.arc(foot[0] * zoom, foot[1] * zoom, 120 * zoom, ang - 50 * Math.PI / 180, ang + 50 * Math.PI / 180); g.closePath(); g.fill(); g.stroke();
  }
  const fxLayer = (row) => {
    if (!skill) return;
    if (skill.fx === "snare") { const c = fxFrameAt(skill, t); if (c >= 0) for (const h of heroes.slice(0, 2)) g.drawImage(fxImg, c * 64, row * 64, 64, 64, (h[0] - 32) * zoom, (h[1] - 44) * zoom, 64 * zoom, 64 * zoom); }
    if (skill.fx === "furrow") furrowPts.forEach((p, i) => {
      const k = Math.floor(((t - skill.windupMs - i * 160) / 1000) * 12) + FX.furrow.hit;
      if (k >= 0 && k < FX.furrow.n) g.drawImage(fxImg, (FX.furrow.col + k) * 64, row * 64, 64, 64, (p[0] - 32) * zoom, (p[1] - 44) * zoom, 64 * zoom, 64 * zoom);
    });
  };
  fxLayer(0);
  shadow(g, foot[0], foot[1], 17, 5);
  drawBoss(g, skill ? bossFrameAt(skill, t) : ANIMS.idle.col + (Math.floor(ts / 1000 * 12) % 12), 0, false, bx, by);
  drawMotes(g, foot[0], foot[1], false, ts);
  for (const h of heroes) { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); }
  fxLayer(1);
  if (skill && t > skill.windupMs + 3500) skill = null;
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

/** Всё для утверждения: листы анимаций, общий лист, эффект корней, светлячок, монтажи и страница просмотра. */
export function writeTreantArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => {
    const f = path.join(outDir, name);
    c.save(f);
    files.push(f);
    return c;
  };
  const sheets = {} as Record<TreantAnim, PC>;
  for (const a of Object.keys(TREANT_ANIMS) as TreantAnim[]) sheets[a] = save(buildTreantAnim(a), `treant-${a}.png`);
  const sheet = save(buildTreantSheet(sheets), "treant.png");
  const fx = save(buildRootFx(), "treant-rootfx.png");
  const mote = save(buildMote(), "treant-mote.png");
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "bosses", "15.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  save(buildPreview(sheets, fx, hero, terrain), "treant-preview.png");
  save(buildCompare(sheets, ref), "treant-compare.png");
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "zone-bosses.json"), "utf8")) as { bosses: { id: string; abilities: { id: string; name: string; windupMs: number; after?: { rootMs?: number } }[] }[] };
  const skills = (data.bosses.find((b) => b.id === "sol_forest_warden")?.abilities ?? []).map(({ id, name, windupMs, after }) => ({ id, name, windupMs, after }));
  const html = path.join(outDir, "treant.html");
  fs.writeFileSync(html, buildHtml(sheet, fx, mote, hero, terrain, skills), "utf8");
  files.push(html);
  return files;
}

/** Арт боссов по id карточки (data/zone-bosses.json): шаг 2 — пилот-древень, шаг 3 — остальные семь тем же способом. */
export const ZONE_BOSS_ART: Record<string, { name: string; write: (root: string, outDir: string) => string[] }> = {
  sol_forest_warden: { name: "treant", write: writeTreantArt },
  sol_raider_chief: { name: "sol_raider_chief", write: writeRaiderArt },
  umb_revenant_reaper: { name: "umb_revenant_reaper", write: writeRevenantArt },
  sol_rune_golem: { name: "sol_rune_golem", write: writeGolemArt },
  umb_fog_treant: { name: "umb_fog_treant", write: writeFogTreantArt },
  umb_ash_minotaur: { name: "umb_ash_minotaur", write: writeMinotaurArt },
  sol_chained_beast: { name: "sol_chained_beast", write: writeChainedBeastArt },
  umb_marsh_abomination: { name: "umb_marsh_abomination", write: writeAbominationArt },
};
