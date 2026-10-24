/**
 * Босс зоны (задача 136, шаг 3): минотавр Тавр Пепельный, палач предгорий — Умбрат, Пепельные предгорья, 20–30
 * (data/zone-bosses.json, id umb_ash_minotaur; образец tools/out/refs/bosses/22.png — только для сравнения, в игру не идёт).
 * Тем же способом и на том же уровне, что пилот-древень (tools/gen/zone-bosses-art.ts): скелет в 3D с IK, тело — объёмные
 * примитивы в поле расстояний, луч на пиксель (наклон камеры 14°), свет сверху слева → 5 тонов на материал, контур 1 px.
 * В игру пока не подключён: механика — шаг 4.
 *
 * Лист: кадр 64×64, пиксель листа = пиксель мира; строки 0 — вниз, 1 — вверх, 2 — вбок вправо (влево — отражение);
 * столбцы — анимации подряд (MINO_ANIMS). Ступни на y = 60; рост с рогами ≈ 52 px — заметно выше героя 32×32.
 * Корпус, голова и рога в покое и ходьбе сдвигаются только на целые пиксели (snapPx) — шкура и морда не «кипят»; глаза,
 * ноздри, шрамы, черепа на поясе и руны топора — штампы в целых пикселях. Огонь лезвия — кромка-материал (не мерцает
 * шумом) и языки пламени ступенями по фазе кадра.
 * Эффекты мира — отдельные листы: umb_ash_minotaur-burnfx.png (поджог «Рунного размаха»), -ramfx.png (метки «Тарана»),
 * -ashfx.png (выброс пепла «Пепельной волны» — клиент ставит его по кольцу).
 *
 * Запуск: npx tsx tools/gen/zone-bosses.ts art → tools/out/zone-bosses/umb_ash_minotaur-*.png и umb_ash_minotaur.html.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "./canvas";

const ID = "umb_ash_minotaur";
const N = 64;
const CX = 32, GY = 60;
const CAM = (14 * Math.PI) / 180;
const CS = Math.cos(CAM), SN = Math.sin(CAM);
const PX = 1 / CS;

type ZView = "down" | "up" | "side";
const VIEWS: ZView[] = ["down", "up", "side"];

// ---------------- палитра ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Кожа голого торса и рук: тёплая, светлее шерсти и кожаной сбруи — мышцы читаются бликами (тона 3–4). */
const HIDE = R("#2a130d", "#552c1c", "#82472c", "#ad6a40", "#d4945e");
/** Шерсть головы, загривка и кисточки хвоста — темнее шкуры. */
const FUR = R("#120a09", "#22140f", "#36211a", "#4c3024", "#674433");
/** Морда — в тон шерсти, чуть светлее только на носу (бык тёмный, не маска). */
const MUZZLE = R("#140b09", "#28170f", "#3e2519", "#583626", "#755038");
/** Кожа наплечников, пояса, сапог, ремней — темнее и холоднее кожи торса (серо-лиловая), не сливается с ней. */
const LEATHER = R("#0b090c", "#19151b", "#2a2329", "#3d343a", "#5a4e52");
/** Кольчуга юбки — серое железо, холоднее ржавых кромок. */
const MAILR = R("#18181c", "#303036", "#4c4c54", "#72727a", "#a0a0a6");
/** Ржавое железо: кромки, наручи, кольчуга, обух. */
const IRON = R("#1a1311", "#3b2a22", "#634434", "#8c6146", "#b88a62");
/** Чёрное железо лезвия. */
const BLADE = R("#0e0c10", "#211d26", "#37323c", "#544e58", "#7a737c");
/** Рога — кость: два светлых полумесяца. */
const HORN = R("#3a2f25", "#6c5c48", "#9e8a6a", "#c9b58f", "#ece0bc");
/** Огонь топора: кромка и языки пламени. */
const FIRE = R("#6e1a08", "#b8380e", "#ee6a1c", "#ffb238", "#fff2b0");
/** Древко. */
const HAFT = R("#140c08", "#2c1a10", "#4a2e1a", "#6a4426", "#8c5e36");
/** Угли глаз и рун. */
const EMBER = R("#7a1c08", "#e0501a", "#ffa030", "#fff0a0");
const BONE = R("#4a4034", "#8a7c62", "#c4b48e", "#ece2c2");
/** Пепел и пыль: плоские, непрозрачные, низ тёмный. */
const ASH = R("#2c2828", "#4c4644", "#706864", "#988e86", "#c0b6aa");
const DUST = R("#4a3a2c", "#6e5a46", "#94806a", "#b8a88e");
/** След топора — огненный серп; вспышка удара. */
const SMEAR = R("#b8380e", "#ff9a2a", "#ffe08a");
const FLASH = R("#ff8a2a", "#ffd870", "#fff8e0");
const OUT = hex("#120a08");
/** Земля и комья (эффекты мира). */
const EARTH = R("#1e1612", "#38291f", "#56402f", "#765c44", "#9a7e5e");

// ---------------- математика и камера (как у пилота) ----------------
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
const M_HIDE = 0, M_FUR = 1, M_MUZZLE = 2, M_LEATHER = 3, M_IRON = 4, M_BLADE = 5, M_HORN = 6, M_FIRE = 7, M_HAFT = 8, M_MAIL = 9;
interface MatDef { ramp: Ramp; base: number; gain: number; lo: number; hi: number }
/** Тон = base + gain·(n·L); lo/hi — пределы тона (ниже lo — только глубокие щели). Огонь светится сам: тон не ниже 2. */
const MATS: MatDef[] = [
  { ramp: HIDE, base: 1.8, gain: 2.2, lo: 1, hi: 4 },
  { ramp: FUR, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: MUZZLE, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: LEATHER, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: IRON, base: 1.6, gain: 2.3, lo: 1, hi: 4 },
  { ramp: BLADE, base: 1.6, gain: 2.4, lo: 1, hi: 4 },
  { ramp: HORN, base: 1.9, gain: 2.2, lo: 1, hi: 4 },
  { ramp: FIRE, base: 2.7, gain: 1.4, lo: 2, hi: 4 },
  { ramp: HAFT, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: MAILR, base: 2.0, gain: 1.8, lo: 1, hi: 4 },
];

interface Prim {
  /** 0 — конус со скруглёнными концами (шар, если a = b), 1 — эллипсоид */
  k: number;
  a: V3; b: V3; ra: number; rb: number;
  ax: [V3, V3, V3]; r: V3;
  mat: number; g: number; part: number;
  /** текстура: 0 — гладко, 1 — редкие борозды (шерсть), 3 — кольчуга (штриховка рядами) */
  tex: number; ng: number; ref: V3; seed: number;
  /** пояс другого материала: доля длины конуса или координата эллипсоида −1..1 по оси bandAx */
  band?: [number, number]; bandAx?: number; bandMat?: number;
  /** поправка тона; кромка ржавого железа по краю в кадре: 1 — нижний, 2 — верхний */
  tone: number; rim: number;
  sph: boolean; ba: V3; l2: number; rr: number; a2: number; il2: number; len: number; bc: V3; br: number;
}
interface Opt { mat?: number; tex?: number; ng?: number; ref?: V3; seed?: number; band?: [number, number]; bandAx?: number; bandMat?: number; part?: number; tone?: number; rim?: number }

/** Штамп: глаза и ноздри, шрам, череп на поясе, руна лезвия — рисунок в целых пикселях у точки на поверхности. */
interface Stamp { kind: "face" | "nose" | "scar" | "skull" | "rune"; at: V3; n: V3; glow: number; v?: number }
/** Частица в мире: ком, уголь, пепел; size 2 — пиксель и тёмный под ним; rise — язык пламени вверх на столько пикселей. */
interface Mote { p: V3; col: RGBA; dark?: RGBA; size?: number; rise?: number }
/** Плоский клуб пыли или пепла у земли. */
interface Puff { c: V3; k: number; seed: number; ash?: boolean }

class Scene {
  prims: Prim[] = [];
  gk: number[] = [];
  stamps: Stamp[] = [];
  motes: Mote[] = [];
  puffs: Puff[] = [];
  smears: { pts: V3[]; arm: number }[] = [];
  flash: { at: V3; k: number } | null = null;
  armG: [number, number] = [-1, -1];
  /** группы топора: след удара их не закрашивает — дуга идёт позади лезвия */
  axeG: number[] = [];
  /** примитивы тела — [0, bodyEnd); дальше топор (при падении тело поворачивается, топор лежит на земле) */
  bodyEnd = 0;
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
      mat: o.mat ?? M_HIDE, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, ref: o.ref ?? perp(ax, [0, 1, 0.01]),
      seed: o.seed ?? 0, band: o.band, bandMat: o.bandMat, tone: o.tone ?? 0, rim: o.rim ?? 0,
      sph: false, ba: [0, 0, 0], l2: 0, rr: 0, a2: 0, il2: 0, len: 0, bc: a, br: 0,
    });
  }
  ball(g: number, c: V3, r: number, o: Opt = {}): Prim {
    return this.cone(g, c, r, c, r, o);
  }
  ell(g: number, c: V3, r: V3, ax: [V3, V3, V3], o: Opt = {}): Prim {
    return this.push({
      k: 1, a: c, b: c, ra: 0, rb: 0, ax, r,
      mat: o.mat ?? M_HIDE, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, ref: ax[0],
      seed: o.seed ?? 0, band: o.band, bandAx: o.bandAx, bandMat: o.bandMat, tone: o.tone ?? 0, rim: o.rim ?? 0,
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
  /** сдвиг тела: x — вправо от минотавра, y — вперёд (в кадре — на целые пиксели) */
  root: V3;
  /** таз выше/ниже покоя (мир; в кадре — на целые пиксели) */
  bob: number;
  /** дыхание: подъём груди с плечами и головой и головы сверх груди — целые пиксели кадра */
  chest: number; headZ: number;
  /** корпус: наклон вперёд, разворот, крен (рад) */
  pitch: number; yaw: number; roll: number;
  /** голова относительно корпуса */
  hp: number; hy: number; hr: number;
  /** запястья в мире: [правое — с топором, левое]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** щиколотки в мире и наклон ступни (носок вверх > 0) */
  foot: [V3, V3]; toe: [number, number];
  /** подъём руки целиком — целые пиксели кадра («дрожь» в удержании без пересчёта руки) */
  armLift: [number, number];
  /** топор: направление древка от кулака к лезвию; куда смотрит кромка (берётся перпендикуляр к древку) */
  axeDir: V3; axeEdge: V3;
  /** топор выпущен (гибель) 0..1: хват уходит из кулака в точку axeGround, древко — к axeLie */
  axeFree: number; axeGround: V3; axeLie: V3;
  /** куда смотрит кромка выпущенного топора (по умолчанию — в землю, лезвие воткнуто) */
  axeLieEdge: V3;
  /** вбок: топор вынесен вперёд и повёрнут плашмя (0..1) — для поз, где он опущен в сторону */
  axeSide: number;
  /** лезвие доворачивается плоскостью к камере (0..1): в кадрах удара оно иначе видно ребром и теряет силуэт */
  bladeFace: number;
  /** разворот всего тела вокруг вертикали (рад, + — против часовой сверху): «Рунный размах» → удар за спину */
  turn: number;
  /** гибель: тело (без топора) заваливается на левый бок вокруг опоры у земли (рад) и сдвигается на fallShift px */
  fall: number; fallShift: number;
  /** дымок над тлеющим лезвием 0..1 */
  smoke: number;
  /** свечение глаз и рун 0..1.5; огонь лезвия 0..1.5 (0 — погас) */
  glow: number; fire: number;
  /** пыль от шага [пр, лев] 0..1; вспышка удара 0..1; пепел у копыта 0..1; копыто роет землю 0..1 */
  dust: [number, number]; flash: number; ash: number; scrape: number;
  /** след топора (путь кромки) */
  trail?: V3[]; trailArm?: number;
  /** пыль у лезвия при ударе 0..1 */
  puff?: number;
  t: number; seed: number;
}

const REST_HAND: [V3, V3] = [[14.6, 4.6, 20.4], [-15.6, 2.6, 18.2]];
const REST_AXE: V3 = norm([0.85, 0.08, -0.48]);
const REST: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.12, yaw: 0, roll: 0, hp: 0, hy: 0, hr: 0,
  hand: REST_HAND, pole: [[0.8, -1, -0.2], [-0.8, -1, -0.2]],
  foot: [[6.6, 1.6, 4.6], [-6.6, -0.6, 4.6]], toe: [0, 0],
  armLift: [0, 0], axeDir: REST_AXE, axeEdge: [-0.3, 0, -1], axeSide: 1, bladeFace: 0, turn: 0, fall: 0, fallShift: 0, smoke: 0, axeFree: 0, axeGround: [16, 6, 1.2], axeLie: [0, 1, 0], axeLieEdge: [-0.8, 0, -0.6],
  glow: 0.9, fire: 1, dust: [0, 0], flash: 0, ash: 0, scrape: 0, t: 0, seed: 1,
};

const HIP0 = 19;
const NECK: V3 = [0, 2.4, 37.0];
/** Длины костей: плечо и предплечье, бедро и голень. */
const ARM: [number, number] = [9.4, 9.6];
const LEG: [number, number] = [7.6, 7.8];

/** Геометрия топора: хват, древко, центр обуха, кромка — общая для модели, следа и языков пламени. */
interface AxeGeo { grip: V3; d: V3; e: V3; n: V3; head: V3 }
const AXE_HEAD = 10.8, AXE_POMMEL = 10.0, BLADE_OFF = 6.2, BLADE_W = 3.0, BLADE_L = 8.5;
function axeGeo(grip: V3, dir: V3, edge: V3): AxeGeo {
  const d = norm(dir);
  const e = perp(d, edge);
  return { grip, d, e, n: cross(e, d), head: add(grip, mul(d, AXE_HEAD)) };
}
/** Точка кромки лезвия: a — от −1 (у древка, к кулаку) до 1 (к концу древка), 0 — середина. */
const edgePt = (A: AxeGeo, a: number, out = 0): V3 => {
  const t = a * 1.25;
  return add(A.head, add(mul(A.e, BLADE_OFF + (BLADE_W + out) * Math.cos(t)), mul(A.d, (BLADE_L + out * 0.6) * Math.sin(t))));
};

/** Хват топора в мире для позы (у кулака или выпущенный). */
/** Поворот кромки e вокруг древка d на угол a. */
const twist = (d: V3, e: V3, a: number): V3 => add(mul(e, Math.cos(a)), mul(cross(d, e), Math.sin(a)));
/**
 * Вбок древко, опущенное в сторону (по оси X модели), смотрит прямо в камеру и топор не читается: в позах покоя кисть
 * выносит его вперёд (разворот вокруг хвата на axeSide·yaw) и доворачивает лезвие плашмя к зрителю.
 */
function sideAxe(grip: V3, A: AxeGeo, k: number): AxeGeo {
  if (k <= 0) return axeGeo(grip, A.d, A.e);
  const d = norm(add(rot(A.d, 0, 1.15 * k), [0, 0, 0.5 * k])), e = rot(A.e, 0, 1.15 * k);
  return axeGeo(grip, d, twist(d, e, -0.5 * k));
}
/** Доворот лезвия вокруг древка плоскостью к камере вида на долю k (знак кромки — ближайший к настоящему). */
function faceAxe(A: AxeGeo, view: ZView, k: number): AxeGeo {
  if (k <= 0) return A;
  const cam = fromView(view, [0, CS, SN]);
  const c = cross(A.d, cam);
  if (vlen(c) < 0.08) return A;
  let ef = norm(c);
  if (dot(ef, A.e) < 0) ef = mul(ef, -1);
  return axeGeo(A.grip, A.d, lerpV(A.e, ef, k));
}
/** Топор позы в виде: хват, доворот вбок (sideAxe) и к камере (faceAxe) — общий для модели и следа. */
function viewAxe(p: Pose, view: ZView, grip?: V3): AxeGeo {
  const gp = gripOf(p, view);
  const g = grip ?? gp.grip;
  const A = view === "side" ? sideAxe(g, gp, p.axeSide) : axeGeo(g, gp.d, gp.e);
  return faceAxe(A, view, p.bladeFace);
}
function gripOf(p0: Pose, view: ZView = "down"): AxeGeo {
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.22 } : p0;
  const pel: V3 = [p.root[0], p.root[1], HIP0 + p.bob + p.root[2]];
  const sh = add(add(pel, rot([12.6, 0.2, 34 - HIP0], p.pitch, p.yaw, p.roll)), [0, 0, p.chest * PX]);
  const wr = p.hand[0];
  const fist = add(wr, mul(norm(sub(wr, ik(sh, wr, ARM[0], ARM[1], p.pole[0]))), 2.0));
  const f = p.axeFree;
  return axeGeo(lerpV(fist, p.axeGround, f), norm(lerpV(norm(p.axeDir), p.axeLie, f)), lerpV(p.axeEdge, p.axeLieEdge, f));
}

/** Минотавр в координатах модели. */
function minotaur(p0: Pose, view: ZView): Scene {
  const S = new Scene();
  // вбок: корпус и голова чуть повёрнуты к зрителю (три четверти) — видны грудь, морда и оба рога
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.22, hy: p0.hy - 0.3 } : p0;
  const pel: V3 = add([0, 0, HIP0], snapPx(view, [p.root[0], p.root[1], p.bob + p.root[2]]));
  const up = p.chest * PX, hz = p.headZ * PX;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  const T = (v: V3, lift = v[2] >= 27): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PV = (v: V3): V3 => add(pel, rot(sub(v, [0, 0, HIP0]), 0, p.yaw * 0.35, p.roll * 0.5));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, 0, roll)), f(rot([0, 1, 0], pitch, 0, roll)), f(rot([0, 0, 1], pitch, 0, roll)),
  ];
  const sides: [number, number][] = [[0, 1], [1, -1]];

  // ---------- туловище: широкая грудь, бычий загривок, живот ----------
  const gBody = S.group(2.2);
  S.ell(gBody, T([0, 0.8, 24.6]), [7.0, 5.8, 5.2], axes(TV), {});
  S.ell(gBody, T([0, 0.2, 31.0]), [10.6, 7.6, 6.2], axes(TV), {});
  S.cone(gBody, T([-9.6, -0.2, 34.2]), 4.8, T([9.6, -0.2, 34.2]), 4.8, {});
  S.ell(gBody, T([0, -3.6, 31.0]), [9.6, 5.6, 6.8], axes(TV), {});
  S.cone(gBody, T([0, -1.6, 34.0]), 6.0, T([0, -1.0, 37.0]), 5.2, { mat: M_FUR, tex: 1, ng: 5, seed: 3 });
  // грудные мышцы и пресс: та же деталь, что торс (без швов-«пластин»), складки — только затенением; выпуклости
  // ловят свет сверху слева и дают блики мышц
  const pTorso = gBody;
  for (const [, s] of sides) {
    const g = S.group(0);
    S.ell(g, T([s * 4.9, 5.4, 31.4]), [4.9, 2.7, 3.5], axes((v) => TV(rot(v, 0, s * 0.3))), { seed: 5, part: pTorso, tone: 0.3 });
  }
  for (const [, s] of sides) for (const [z, r] of [[26.6, 1.9], [23.4, 1.7]] as [number, number][]) {
    const g = S.group(0);
    S.ell(g, T([s * 2.1, 5.6, z]), [2.1, 1.5, r], axes(TV), { part: pTorso, tone: 0.15 });
  }
  // ремень наискось через грудь (с левого плеча к правому бедру)
  {
    const g = S.group(0.4);
    S.cone(g, T([-9.4, 3.8, 35.6]), 1.0, T([-1.0, 7.4, 29.2]), 1.0, { mat: M_LEATHER });
    S.cone(g, T([-1.0, 7.4, 29.2]), 1.0, T([6.6, 6.2, 22.6]), 1.0, { mat: M_LEATHER });
    S.cone(g, T([-9.4, -3.0, 35.6]), 1.0, T([6.6, -5.0, 23.0]), 1.0, { mat: M_LEATHER });
  }

  // ---------- пояс, кожаные штаны, кольчужная юбка, набедренники, хвост ----------
  {
    const g = S.group(1.0);
    S.ell(g, PV([0, 0, 18.8]), [7.2, 5.4, 4.0], axes((v) => PV(v), 0), { mat: M_LEATHER });
  }
  {
    const g = S.group(0);
    S.ell(g, PV([0, 0.3, 21.6]), [7.8, 6.0, 1.7], [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => rot(v as V3, 0, p.yaw * 0.35, p.roll * 0.5)) as [V3, V3, V3], { mat: M_LEATHER, tone: 0.2 });
    const pB = S.newPart();
    S.ball(g, PV([0, 6.3, 21.6]), 1.5, { mat: M_IRON, part: pB });
  }
  {
    const g = S.group(0);
    // кольчужная юбка: передний и задний клин — серое железо с рядами колец
    S.ell(g, PV([0, 4.6, 14.6]), [5.8, 1.9, 6.6], [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => rot(v as V3, 0.12, p.yaw * 0.35, 0)) as [V3, V3, V3], { mat: M_MAIL, tex: 3 });
    S.ell(g, PV([0, -4.4, 14.8]), [5.6, 1.8, 6.2], [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v) => rot(v as V3, -0.12, p.yaw * 0.35, 0)) as [V3, V3, V3], { mat: M_MAIL, tex: 3, part: S.newPart() });
  }
  for (const [, s] of sides) {
    const g = S.group(0);
    S.ell(g, PV([s * 5.9, 1.6, 16.2]), [3.1, 3.4, 4.6], axes((v) => rot(v, 0, p.yaw * 0.35, s * 0.22)), { mat: M_LEATHER, tone: -0.2 });
  }
  {
    const g = S.group(0.8);
    S.cone(g, PV([0, -5.0, 18.2]), 1.2, PV([0.8, -7.0, 9.0]), 0.8, {});
    S.ell(g, PV([1.0, -7.2, 7.0]), [1.3, 1.3, 2.2], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], { mat: M_FUR });
  }

  // ---------- ноги: бёдра, сапоги с отворотом, копыто ----------
  for (const [i, s] of sides) {
    const g = S.group(1.4);
    const hip = PV([s * 5.0, 0.2, 17.4]);
    const an = p.foot[i];
    const kn = ik(hip, an, LEG[0], LEG[1], [s * 0.25, 1, 0.1]);
    S.cone(g, hip, 4.6, kn, 3.8, { seed: 30 + i });
    const pBoot = S.newPart();
    S.cone(g, kn, 3.7, an, 3.2, { mat: M_LEATHER, part: pBoot, seed: 32 + i });
    S.cone(g, lerpV(kn, an, 0.02), 4.1, lerpV(kn, an, 0.24), 3.9, { mat: M_LEATHER, part: S.newPart(), tone: 0.35 });
    const tp = p.toe[i];
    const fc = add(an, rot([0, 1.2, -2.2], tp, 0));
    S.ell(g, fc, [3.3, 4.4, 2.4], axes((v) => v, 0, tp), { mat: M_LEATHER, part: pBoot });
    S.ell(g, add(fc, rot([0, 3.6, -0.3], tp, 0)), [2.5, 1.5, 1.9], axes((v) => v, 0, tp), { mat: M_FUR, part: S.newPart(), tone: -0.2 });
  }

  // ---------- руки: плечо, предплечье в кожаном наруче, кулак ----------
  let fist0: V3 = [0, 0, 0];
  for (const [i, s] of sides) {
    const g = S.group(1.3);
    S.armG[i] = g;
    const lift = pxToWorld(view, 0, -p.armLift[i]);
    const sh = add(T([s * 12.6, 0.2, 34.0]), lift);
    const wr = add(p.hand[i], lift);
    const el = ik(sh, wr, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, sh, 4.7, el, 3.8, { seed: 20 + i });
    const fa = sub(wr, el);
    S.cone(g, el, 3.8, wr, 3.3, { seed: 22 + i, band: [0.42, 0.95], bandMat: M_LEATHER });
    const dir = norm(fa);
    const e0 = perp(dir, TV([s * 0.7, 1, 0]));
    const e1 = cross(dir, e0);
    const fc = add(wr, mul(dir, 2.0));
    if (i === 0) fist0 = fc;
    S.ell(g, fc, [3.0, 2.9, 3.1], [e0, e1, dir], { part: S.newPart() });
  }

  // ---------- наплечники: два пласта кожи, кромка ржавого железа ----------
  const rim = view === "side" ? 1 : 3;
  for (const [i, s] of sides) {
    const g = S.group(0.8);
    S.ell(g, T([s * 13.0, -0.2, 37.0]), [6.0, 5.8, 3.7], axes(TV, s * 0.42), { mat: M_LEATHER, seed: 10 + i, rim, tone: 0.2 });
    const g2 = S.group(0);
    S.ell(g2, T([s * 15.6, -0.2, 33.8]), [4.0, 4.8, 2.5], axes(TV, s * 0.85), { mat: M_LEATHER, seed: 12 + i, rim: 1 });
  }

  // ---------- голова быка: шерсть, светлая морда, уши, рога-полумесяцы ----------
  const gHead = S.group(1.2);
  const HY = 0;
  const h = (x: number, y: number, z: number) => H([x, y + HY, z]);
  S.cone(gHead, T([0, -0.6, 35.4], true), 5.8, h(0, 1.6, 41.0), 5.0, { mat: M_FUR, tex: 1, ng: 4, seed: 40 });
  // голова шире и выше: широкий бычий лоб, скулы
  S.ell(gHead, h(0, 3.6, 44.2), [6.0, 5.0, 5.0], axes(HV), { mat: M_FUR, tex: 1, ng: 3, seed: 41 });
  S.ball(gHead, h(0, 3.2, 47.8), 3.0, { mat: M_FUR, seed: 42 });
  // морда: тёмная, вытянута вниз и расширяется к носу (у быка нос шире переносицы); светлее только сам нос
  const pMuz = S.newPart();
  S.cone(gHead, h(0, 6.6, 44.4), 3.0, h(0, 9.2, 39.2), 3.7, { mat: M_MUZZLE, part: pMuz });
  S.ell(gHead, h(0, 10.4, 37.6), [4.4, 3.4, 2.7], axes(HV), { mat: M_MUZZLE, part: pMuz, tone: 0.6 });
  S.cone(gHead, h(0, 9.4, 36.2), 1.3, h(0, 8.8, 33.8), 0.5, { mat: M_FUR, part: S.newPart() });
  for (const s of [-1, 1]) S.cone(gHead, h(s * 5.4, 2.6, 45.0), 1.7, h(s * 9.0, 1.6, 43.4), 0.6, { mat: M_FUR, part: S.newPart(), tone: 0.3 });
  for (const s of [-1, 1]) {
    const g = S.group(0.7);
    const pts: V3[] = [h(s * 4.4, 3.0, 47.6), h(s * 8.0, 3.2, 48.4), h(s * 11.2, 3.6, 50.2), h(s * 13.0, 4.2, 53.0), h(s * 12.8, 5.4, 56.2)];
    const rr = [2.3, 1.9, 1.4, 0.95, 0.45];
    for (let k = 0; k + 1 < pts.length; k++) S.cone(g, pts[k], rr[k], pts[k + 1], rr[k + 1], { mat: M_HORN, tone: [-0.7, -0.2, 0.1, 0.3][k] });
  }
  S.stamps.push({ kind: "face", at: h(0, 8.0, 45.4), n: HV([0, 1, 0.3]), glow: p.glow });
  S.stamps.push({ kind: "nose", at: h(0, 13.6, 37.4), n: HV([0, 1, 0.1]), glow: 0 });
  S.stamps.push({ kind: "scar", at: h(-1.6, 8.6, 43.6), n: HV([0, 1, 0.3]), glow: 0, v: 2 });
  // шрамы на груди, черепа на поясе
  S.stamps.push({ kind: "scar", at: T([-4.4, 7.4, 32.6]), n: TV([0, 1, 0]), glow: 0, v: 0 });
  S.stamps.push({ kind: "scar", at: T([4.6, 6.0, 26.4]), n: TV([0, 1, 0]), glow: 0, v: 1 });
  for (const s of [-1, 1]) S.stamps.push({ kind: "skull", at: PV([s * 4.4, 6.2, 19.4]), n: [s * 0.3, 1, 0], glow: 0 });

  // ---------- рунный топор ----------
  const grip = p.axeFree > 0 ? lerpV(fist0, p.axeGround, p.axeFree) : fist0;
  // вбок кисть доворачивает топор вокруг древка: лезвие к зрителю плашмя, а не ребром; в ударе — плоскостью к камере
  const A = viewAxe(p0, view, grip);
  S.bodyEnd = S.prims.length;
  {
    const g = S.group(0);
    S.cone(g, sub(grip, mul(A.d, AXE_POMMEL)), 0.85, add(grip, mul(A.d, AXE_HEAD + 1.4)), 0.85, { mat: M_HAFT });
    S.ball(g, sub(grip, mul(A.d, AXE_POMMEL + 0.4)), 1.15, { mat: M_IRON, part: S.newPart() });
    const g2 = S.group(0);
    S.axeG.push(g, g2);
    S.cone(g2, sub(A.head, mul(A.d, 1.8)), 1.35, add(A.head, mul(A.d, 1.6)), 1.35, { mat: M_IRON });
    S.cone(g2, sub(A.head, mul(A.e, 0.6)), 1.4, sub(A.head, mul(A.e, 4.4)), 0.35, { mat: M_BLADE, part: S.newPart() });
    // лезвие-полумесяц: узкая шейка у древка расходится в длинную кромку (две детали, гладко слитые)
    const g3 = S.group(1.6);
    S.axeG.push(g3);
    S.ell(g3, add(A.head, mul(A.e, 2.6)), [2.8, 2.4, 0.9], [A.e, A.d, A.n], { mat: M_BLADE });
    S.ell(g3, add(A.head, mul(A.e, BLADE_OFF)), [BLADE_W, BLADE_L, 0.9], [A.e, A.d, A.n], {
      mat: M_BLADE, band: p.fire > 0.15 ? [0.64, 1.05] : undefined, bandAx: 0, bandMat: M_FIRE,
    });
    for (const [a, v] of [[-0.5, 0], [0.5, 1]] as [number, number][]) {
      const at = add(add(A.head, mul(A.e, BLADE_OFF - 0.6)), mul(A.d, a * 5.6));
      for (const sg of [1, -1]) S.stamps.push({ kind: "rune", at: add(at, mul(A.n, sg * 0.9)), n: mul(A.n, sg), glow: p.fire, v });
    }
  }

  particles(S, p, A);
  return S;
}

/** Частицы: языки пламени на кромке, пыль от шага, копыто роет землю, пепел удара, след топора и вспышка. */
function particles(S: Scene, p: Pose, A: AxeGeo) {
  // языки пламени: 5 по кромке, высота ступенями по фазе кадра (у каждого своя фаза) — без шума
  if (p.fire > 0.15) {
    for (let k = 0; k < 3; k++) {
      const a = -0.6 + (k / 2) * 1.2;
      const ph = p.t * TAU + k * 2.3;
      const hgt = Math.round(clamp((1.2 + 1.3 * Math.sin(ph)) * Math.min(1.2, p.fire), 0, 3));
      if (hgt <= 0) continue;
      S.motes.push({ p: edgePt(A, a, 0.6), col: FIRE[3], rise: hgt });
    }
  }
  // дымок над тлеющим лезвием: серые клочки поднимаются ступенями и тают
  if (p.smoke > 0.02) {
    for (let k = 0; k < 3; k++) {
      if (hash01(k, 5, 77) > p.smoke) continue;
      const u = (p.t * 4 + k / 3) % 1;
      const b = edgePt(A, -0.4 + 0.4 * k, 0.4);
      S.motes.push({ p: [b[0] + Math.round(Math.sin(u * TAU + k) * 1.2), b[1], b[2] + 2 + 9 * u], col: ASH[u < 0.5 ? 3 : 2], dark: u < 0.4 ? ASH[1] : undefined, size: u < 0.6 ? 2 : 1 });
    }
  }
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) S.puffs.push({ c: [p.foot[i][0], p.foot[i][1] + 1, 0], k: p.dust[i], seed: i });
  if (p.scrape > 0.05) {
    const f = p.foot[0];
    S.puffs.push({ c: [f[0], f[1] - 2, 0], k: p.scrape, seed: 7 });
    for (let k = 0; k < 3; k++) {
      const u = (p.t * 3 + k / 3) % 1;
      S.motes.push({ p: [f[0] + (k - 1) * 1.6, f[1] - 3 - 7 * u, 1 + 6 * u * (1 - u) * 2], col: EARTH[3], dark: EARTH[1], size: 2 });
    }
  }
  if (p.ash > 0.02) {
    const f = p.foot[0];
    const c: V3 = [f[0], f[1] + 1, 0];
    S.puffs.push({ c, k: p.ash, seed: 20, ash: true });
    S.puffs.push({ c: [c[0] - 6, c[1] - 3, 0], k: p.ash * 0.8, seed: 21, ash: true });
    const t = 1 - p.ash;
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * TAU + 0.4;
      S.motes.push({ p: [c[0] + Math.cos(ang) * (3 + 9 * t), c[1] + Math.sin(ang) * 3, 2 + 14 * t * (1 - t) + 2 * hash01(k, 3, 9)], col: k % 2 ? FIRE[3] : FIRE[2], dark: k % 2 ? FIRE[1] : undefined });
    }
  }
  if (p.trail && p.trail.length > 1) S.smears.push({ pts: p.trail, arm: p.trailArm ?? 0 });
  if ((p.puff ?? 0) > 0.02) {
    const tip = edgePt(A, 0, 0);
    S.puffs.push({ c: [tip[0], tip[1], 0], k: p.puff!, seed: 30 });
  }
  if (p.flash > 0.02) {
    const tip = edgePt(A, 0, 1);
    S.flash = { at: [tip[0], tip[1], Math.max(1.5, tip[2])], k: p.flash };
  }
}

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
    if (q.band && bu >= q.band[0] && bu <= q.band[1]) mat = q.bandMat ?? M_IRON;
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
    if (q.tex === 1 && mat === q.mat) {
      const facing = n[1] * CS + n[2] * SN;
      const wob = 0.14 * Math.sin(tx.u * q.len * 0.25 + q.seed * 1.7);
      gcoord[i] = (tx.ang * q.ng) / TAU + wob;
      gok[i] = facing > 0.4 && Math.abs(n[2]) < 0.72 ? 1 : 0;
      ulen[i] = tx.u * q.len;
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
    // кольчуга: ряды колец — каждый второй ряд темнее, в нём кольца через пиксель
    // кольчуга: ряды колец — в чётном ряду тёмные звенья через пиксель, в нечётном — светлые со сдвигом
    if (prims[gb.prim[i]].tex === 3 && L.mat[i] === M_MAIL && !edge) {
      if (y % 2 === 0 && x % 2 === 0) tn -= 1.0;
      else if (y % 2 === 1 && x % 2 === 1) tn += 0.6;
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
      L.mat[i] = M_IRON;
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
      if (gb.prim[i] < 0 || L.mat[i] === M_FIRE || L.mat[i] === M_IRON || L.mat[i] === M_MAIL) continue;
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

// ---------------- штампы: глаза, ноздри, шрамы, черепа, руны ----------------
/**
 * Рисунки в целых пикселях от точки привязки (dx вправо, dy вниз). d — тёмная бровь, e3–e1 — угли глаз (ярче — выше),
 * n — ноздря, s — светлый шрам, b3–b1 — кость черепа, r3–r1 — руна. Брови «\ /» — хмурый бык, глаза под ними.
 */
type StampPx = [number, number, string];
const rows = (rs: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  const key: Record<string, string> = { D: "d", L: "l", "1": "e1", "2": "e2", "3": "e3" };
  rs.forEach((r, j) => [...r].forEach((ch, i) => { if (key[ch]) out.push([x0 + i, y0 + j, key[ch]]); }));
  return out;
};
/** L — светлый надбровный валик над тёмной бровью: хмурый лоб читается и на тёмной шерсти. */
const ST_FACE_DOWN = rows([
  "LL.....LL",
  "DDL...LDD",
  ".DDD.DDD.",
  ".23D.D32.",
], -4, -2);
const ST_FACE_SIDE = rows([
  "LL....",
  "DDDL.L",
  ".DDD.D",
  ".23D.2",
], -3, -2);
/** Ноздри: два тёмных овала по краям носа, между ними светлая перемычка носа. */
const ST_NOSE_DOWN: StampPx[] = [[-2, 0, "n"], [-2, 1, "n"], [2, 0, "n"], [2, 1, "n"], [-1, -1, "h"], [0, -1, "h"], [1, -1, "h"], [0, 0, "m"], [0, 1, "m"]];
const ST_NOSE_SIDE: StampPx[] = [[0, 0, "n"], [0, 1, "n"], [-1, -1, "h"]];
const ST_SCARS: StampPx[][] = [
  [[0, 0, "s"], [1, 1, "s"], [2, 2, "s"]],
  [[0, 0, "s"], [1, -1, "s"], [2, -1, "s"], [3, -2, "s"]],
  // шрам через переносицу к глазу
  [[0, -1, "s"], [0, 0, "s"], [1, 1, "s"], [1, 2, "s"]],
];
const ST_SKULL: StampPx[] = [[-1, -1, "b2"], [0, -1, "b3"], [1, -1, "b3"], [-1, 0, "k"], [0, 0, "b2"], [1, 0, "k"], [0, 1, "b1"]];
/** Руны лезвия — тонкие знаки: черта в 3 px с отростком (не пятна — иначе две руны читаются как глаза). */
const ST_RUNES: StampPx[][] = [
  [[0, -1, "r3"], [0, 0, "r3"], [0, 1, "r2"], [1, -1, "r2"]],
  [[0, -1, "r2"], [0, 0, "r3"], [0, 1, "r3"], [1, 0, "r2"]],
];
const SCAR = mix(HIDE[4], hex("#c88a78"), 0.5);
const NOSTRIL = hex("#070303");
const BROW = hex("#8a5a3e");

function stampOf(st: Stamp, view: ZView): StampPx[] {
  switch (st.kind) {
    case "rune": return ST_RUNES[st.v ?? 0];
    case "scar": return ST_SCARS[st.v ?? 0];
    case "skull": return ST_SKULL;
    case "nose": return view === "side" ? ST_NOSE_SIDE : view === "down" ? ST_NOSE_DOWN : [];
    default: return view === "side" ? ST_FACE_SIDE : view === "down" ? ST_FACE_DOWN : [];
  }
}

/** Штампы и тёплая подсветка вокруг углей глаз, рун и огненной кромки — ступенями (2 уровня), без россыпи оттенков. */
function drawStamps(body: PC, sc: Scene, view: ZView, gb: GBuf, L: Look, fire: number) {
  const glow = new Float32Array(N * N);
  const emis = new Uint8Array(N * N);
  for (const st of sc.stamps) {
    const a = toView(view, st.at), nv = toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < 0.12) continue;
    const [sx, sy] = scr(a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    if (gb.prim[i0] < 0 || gb.t[i0] < depthOf(a) - (st.kind === "rune" ? 1.2 : 2.4)) continue;
    const g = clamp(st.glow, 0, 1.5);
    for (const [dx, dy, key] of stampOf(st, view)) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (gb.prim[i] < 0) continue;
      if (key === "d" || key === "n") {
        if (!emis[i]) body.set(x, y, key === "d" ? FUR[0] : NOSTRIL);
        emis[i] = 2;
        continue;
      }
      if (key === "l" || key === "h" || key === "m") {
        if (!emis[i]) body.set(x, y, key === "l" ? BROW : MUZZLE[key === "h" ? 4 : 3]);
        emis[i] = 2;
        continue;
      }
      if (key === "s") { body.set(x, y, SCAR); emis[i] = 2; continue; }
      if (key === "k") { body.set(x, y, LEATHER[0]); emis[i] = 2; continue; }
      const lv = +key[1];
      if (key[0] === "b") { body.set(x, y, BONE[lv]); emis[i] = 2; continue; }
      // угли гаснут при гибели: каждая ступень ниже — на тон темнее, ниже нуля — поверхность
      const k = lv - Math.round((1 - Math.min(1, g)) * 3);
      if (k < 0) continue;
      body.set(x, y, EMBER[clamp(k + (g > 1.2 ? 1 : 0), 0, 3)]);
      glow[i] = Math.max(glow[i], Math.min(1, g) * (lv / 3) * (key[0] === "e" ? 1 : 0.45));
      emis[i] = 1;
    }
  }
  // огненная кромка светит на соседнее железо
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && L.mat[i] === M_FIRE) { glow[i] = Math.max(glow[i], 0.75 * Math.min(1, fire)); emis[i] = 1; }
  const bl = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      v += glow[yy * N + xx] * (dx === 0 || dy === 0 ? 1 : 0.6);
    }
    bl[y * N + x] = v / 3.2;
  }
  const GLOW = hex("#ff8a2a");
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0 || emis[i]) continue;
    const lv = bl[i] > 0.42 ? 2 : bl[i] > 0.2 ? 1 : 0;
    if (!lv) continue;
    const c = body.get(i % N, Math.floor(i / N))!;
    body.set(i % N, Math.floor(i / N), mix(c, GLOW, [0, 0.22, 0.4][lv]));
  }
}

function rampFor(mat: number, fire: number): Ramp {
  const base = MATS[mat].ramp;
  if (mat !== M_FIRE || fire >= 1) return base;
  const k = clamp(1 - fire, 0, 1) * 0.85;
  return base.map((c, j) => mix(c, BLADE[Math.min(4, j + 1)], k));
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

/** Кадр минотавра в виде view. */
/** Опора падения на бок: у левого колена на земле (мир). */
const FALL_PIVOT: V3 = [-14, 0, 0];
/** Поворот частей сцены: f — точка, fd — направление; body — только тело (без топора и всего, что на земле). */
function xformScene(sc: Scene, f: (v: V3) => V3, fd: (v: V3) => V3, bodyOnly: boolean) {
  sc.prims.forEach((q, i) => {
    if (bodyOnly && i >= sc.bodyEnd) return;
    q.a = f(q.a);
    q.b = f(q.b);
    q.ref = fd(q.ref);
    q.ax = [fd(q.ax[0]), fd(q.ax[1]), fd(q.ax[2])];
  });
  for (const st of sc.stamps) {
    if (bodyOnly && st.kind === "rune") continue;
    st.at = f(st.at);
    st.n = fd(st.n);
  }
  if (bodyOnly) return;
  for (const m of sc.motes) m.p = f(m.p);
  for (const pf of sc.puffs) pf.c = f(pf.c);
  for (const sm of sc.smears) sm.pts = sm.pts.map(f);
  if (sc.flash) sc.flash.at = f(sc.flash.at);
}
export function renderMinotaur(view: ZView, pose: Pose): PC {
  const sc = minotaur(pose, view);
  if (pose.fall) {
    const sh = snapPx(view, [Math.round(pose.fallShift), 0, 0]);
    const fd = (v: V3) => rot(v, 0, 0, -pose.fall);
    xformScene(sc, (v) => add(add(FALL_PIVOT, fd(sub(v, FALL_PIVOT))), sh), fd, true);
  }
  if (pose.turn) {
    const fd = (v: V3) => rot(v, 0, pose.turn);
    xformScene(sc, fd, fd, false);
  }
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) prepare(q, view);
  const gb = raster(prims, sc.gk);
  const L = shade(prims, sc.gk, gb);
  const body = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    body.set(i % N, Math.floor(i / N), rampFor(L.mat[i], pose.fire)[L.idx[i]]);
  }
  drawStamps(body, sc, view, gb, L, pose.fire);
  body.outline(OUT);
  sealPinholes(body);

  // ---------- сборка: тело, огненный след позади руки, пыль и пепел, языки пламени, угли, вспышка ----------
  const out = new PC(N, N);
  out.blit(body, 0, 0);
  for (const sm of sc.smears) drawSmear(out, sm, view, gb, prims, [sc.armG[sm.arm], ...sc.axeG]);
  for (const f of sc.puffs) drawPuff(out, f, view);
  for (const m of sc.motes) drawMote(out, m, view, gb);
  if (sc.flash) {
    // вспышка за телом (вид со спины) не видна
    const fv = toView(view, sc.flash.at), [fx, fy] = scr(fv);
    const fi = Math.floor(Math.min(fy, 61)) * N + Math.floor(fx);
    if (!(fi >= 0 && fi < N * N && gb.prim[fi] >= 0 && gb.t[fi] < depthOf(fv) - 1.0)) {
      // вспышка не закрывает лезвие: железо, кромка и руны секиры видны и в кадре удара
      const axe = new Uint8Array(N * N);
      for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && sc.axeG.includes(prims[gb.prim[i]].g)) axe[i] = 1;
      drawFlash(out, sc.flash, view, axe);
    }
  }
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
      o.set(x, y, (f.ash ? ASH : DUST)[tone]);
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
  if (m.rise) {
    // язык пламени: столбик снизу вверх — светлое основание, красный кончик
    const col = m.rise === 1 ? [3, 1] : m.rise === 2 ? [3, 2, 1] : [4, 3, 2, 1];
    col.forEach((k, j) => o.set(x, y - j, FIRE[k]));
    return;
  }
  o.set(x, y, m.col);
  if ((m.size ?? 1) > 1) o.set(x + 1, y, m.col);
  if (m.dark) o.set(x + ((m.size ?? 1) > 1 ? 1 : 0), y + 1, m.dark);
}

/**
 * След удара: чёткий серп в 3 тона по пути кулака — позади руки (пиксели самой руки и её контура не трогает),
 * светлая кромка — с внешней стороны дуги, к хвосту серп сужается до пикселя.
 */
function drawSmear(o: PC, sm: { pts: V3[]; arm: number }, view: ZView, gb: GBuf, prims: Prim[], keep: number[]) {
  const pts = sm.pts.map((v) => scr(toView(view, v)));
  const dep = sm.pts.map((v) => depthOf(toView(view, v)));
  const arm = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && keep.includes(prims[gb.prim[i]].g)) arm[i] = 1;
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
    const d0 = dep[k], d1 = dep[k + 1];
    let nx = -dy / dl, ny = dx / dl;
    // светлая кромка — снаружи дуги: нормаль от середины тела
    if (nx * (x0 - CX) + ny * (y0 - 38) < 0) { nx = -nx; ny = -ny; }
    for (let s = 0; s <= steps; s++) {
      const u = (k + s / steps) / total;
      const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
      // серп: от хвоста в пиксель — шире к кулаку, у самого кулака его закрывает рука
      // узкий серп (до 3 px): след позади лезвия, а не плашка размером с лезвие — секира в кадре удара остаётся секирой
      const w = 0.3 + 1.2 * Math.sin(Math.PI * Math.min(1, u * 0.62 + 0.06));
      for (let j = -w; j <= w + 0.01; j += 0.5) {
        const xx = Math.round(x + nx * j), yy = Math.round(y + ny * j);
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const tone = j > w - 0.9 ? 2 : j < -w + 0.9 ? 0 : 1;
        const id = yy * N + xx;
        // за телом (вид со спины, дуга перед грудью) — не рисуется
        if (gb.prim[id] >= 0 && gb.t[id] < lerp(d0, d1, s / steps) - 1.0) continue;
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
function drawFlash(o0: PC, f: { at: V3; k: number }, view: ZView, keep?: Uint8Array) {
  const [sx, sy] = scr(toView(view, f.at));
  const x = Math.floor(sx), y = Math.floor(Math.min(sy, 61));
  const o = { set: (xx: number, yy: number, c: RGBA) => { if (!(keep && xx >= 0 && yy >= 0 && xx < N && yy < N && keep[yy * N + xx])) o0.set(xx, yy, c); } };
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
    if (k === "trail" || k === "trailArm") continue;
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

/** След кромки топора: точки середины кромки в дробных кадрах f0..f1 (по тем же ключам, что и позы). */
function trailFor(keys: Key[], f0: number, f1: number, view: ZView, n = 8, out = 0.6): V3[] {
  return Array.from({ length: n }, (_, k) => {
    const p = poseAt(keys, lerp(f0, f1, k / (n - 1)));
    // путь настоящей кромки (без доворота к камере — он меняет сторону лезвия между ключами и ломает дугу)
    return edgePt(viewAxe({ ...p, bladeFace: 0 }, view), 0, out);
  });
}
/** Кромка, ведущая при горизонтальном размахе справа налево (против часовой сверху). */
const sweepEdge = (d: V3): V3 => {
  const ph = Math.atan2(d[1], d[0]);
  return [-Math.sin(ph), Math.cos(ph), 0];
};

/**
 * Покой: дыхание волной снизу вверх — грудь с плечами на 1 px, голова кадром позже; кулаки догоняют плечи. Огонь лезвия
 * колышется языками по фазе кадра, угли глаз и рун мерцают ступенями. Всё — ровно на пиксель кадра.
 */
function idlePoses(n = 12): Pose[] {
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const hands = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n, ph = t * TAU;
    return {
      ...REST, t, seed: 100 + i,
      chest: chest[i], headZ: head[i] - chest[i],
      hand: REST_HAND.map((v) => add(v, [0, 0, hands[i] * PX])) as [V3, V3],
      glow: 0.9 + 0.2 * Math.sin(ph), fire: 1,
    } as Pose;
  });
}

/**
 * Ходьба: тяжёлый шаг, корпус проседает после касания и перевешивается на опорную ногу на целые пиксели. Левая рука
 * качается навстречу ноге, правая с топором — вдвое меньше; пыль у ступни при касании.
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
    const fwR = -fr.y / A, fwL = -fl.y / A;
    return {
      ...REST, t, seed: 150 + i,
      root: [ipx(sway[i]), 0, 0], bob: bob[i] * PX,
      hand: [
        add(REST_HAND[0], [sway[i], 2.0 * fwR, 0.6 * Math.abs(fwR)]),
        [-15.4 + sway[i], 2.6 + 4.2 * fwL, 18.2 + 1.6 * Math.max(0, fwL) + 0.6 * Math.max(0, -fwL)],
      ],
      foot: [[6.6, 0.6 + fr.y, 4.6 + fr.z], [-6.6, 0.6 + fl.y, 4.6 + fl.z]], toe: [fr.toe, fl.toe],
      dust: [fr.strike, fl.strike],
    } as Pose;
  });
}

/**
 * Атака: рубящий удар сверху обеими руками — замах за голову, пик, топор падает перед собой (кадр 6 — удар о землю),
 * отдача и возврат. Огненный серп — по пути кромки, позади руки; удар — кадр вспышки и пыль.
 */
function attackKeys(view: ZView): Key[] {
  // удар наискось: из-за правого плеча к центру перед собой — путь кромки в кадре дугой, а не вертикальной чертой
  const dUp = norm([0.5, -0.55, 0.65]), dMid = norm([0.35, 0.8, 0.45]), dHit = norm([-0.15, 0.72, -0.68]);
  const lead = (a: V3, b: V3): V3 => sub(b, a);
  const up: Partial<Pose> = {
    yaw: -0.2, pitch: -0.06, bob: 1 * PX, hp: -0.16, axeSide: 0,
    hand: [[12.6, -1.0, 41.0], [1.0, -1.0, 40.0]], pole: [[1, -0.3, 0.4], [-1, -0.3, 0.4]],
    axeDir: dUp, axeEdge: lead(dUp, dMid), glow: 1.2, fire: 1.2,
  };
  const peak: Partial<Pose> = { ...up, hand: [[13.0, -2.0, 42.0], [1.6, -2.0, 41.0]] };
  const hitHand: V3 = view === "side" ? [4.0, 14.0, 16.0] : [4.0, 12.0, 16.0];
  const mid: Partial<Pose> = {
    yaw: 0.06, pitch: 0.22, bob: -1 * PX, hp: -0.06, axeSide: 0,
    hand: [[12.0, 9.0, 36.0], [2.0, 9.0, 34.0]], pole: [[1, -0.4, 0.3], [-1, -0.4, 0.3]],
    axeDir: dMid, axeEdge: lead(dMid, dHit), glow: 1.25, fire: 1.4, bladeFace: 1,
  };
  const hit: Partial<Pose> = {
    yaw: 0.22, pitch: 0.44, bob: -3 * PX, hp: 0.06, axeSide: 0,
    hand: [hitHand, add(hitHand, [-6.0, -1.2, 1.4])], pole: [[1, -0.6, 0.3], [-1, -0.6, 0.3]],
    axeDir: dHit, axeEdge: lead(dMid, dHit), glow: 1.3, fire: 1.5, bladeFace: 1,
  };
  const settle: Partial<Pose> = { ...hit, pitch: 0.4, bob: -2 * PX, hand: [add(hitHand, [0.3, -0.6, 1.0]), add(hitHand, [-5.8, -1.6, 2.4])] };
  return [
    { f: 0, p: {} },
    { f: 3, p: up, ease: easeInOut },
    { f: 4, p: peak, ease: linear },
    { f: 5, p: mid, ease: easeIn },
    { f: 6, p: hit, ease: easeOut },
    { f: 7, p: settle, ease: easeOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
}
function attackPoses(view: ZView): Pose[] {
  const keys = attackKeys(view);
  const poses = keyed(keys, 10, 400);
  poses[5].trail = trailFor(keys, 3.6, 5, view);
  poses[6].trail = trailFor(keys, 4.5, 6, view);
  poses[7].trail = trailFor(keys, 5.6, 6, view, 4);
  poses[6].flash = 1;
  poses[6].puff = 1;
  poses[7].puff = 0.5;
  return poses;
}

// ---------- «Рунный размах»: замах вправо-назад → удержание → размах перед собой справа налево ----------
const SWEEP_D0 = norm([0.4, -0.85, 0.34]);
const AXE_UP: Partial<Pose> = {
  yaw: -0.55, pitch: 0.06, roll: -0.04, bob: -1 * PX, hp: -0.1, hy: 0.3, axeSide: 0,
  hand: [[14.6, -6.0, 31.0], [-12.0, 9.0, 27.0]], pole: [[1, -0.2, -0.3], [-0.6, -1, -0.3]],
  axeDir: SWEEP_D0, axeEdge: sweepEdge(SWEEP_D0), glow: 1.3, fire: 1.3, toe: [0, 0],
  foot: [[7.4, 0.4, 4.6], [-6.2, 2.2, 4.6]],
};
function axeUpPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: AXE_UP, ease: easeInOut }], 4, 500);
}
/** Удержание по кругу до конца предупреждения: рука с топором дрожит на пиксель целиком, огонь разгорается. */
function axeHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: AXE_UP }, { f: 1, p: AXE_UP }], 0);
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 520 + i, armLift: [tremble[i], 0] as [number, number],
    glow: [1.3, 1.5, 1.35, 1.5][i], fire: [1.3, 1.5, 1.4, 1.5][i],
  }));
}
function sweepKeys(): Key[] {
  // дуга наискось: сверху справа-сзади → низко перед собой → влево; в середине древко не смотрит в камеру,
  // а лезвие в ударе доворачивается плоскостью к ней — силуэт секиры не превращается в полосу
  const d1 = norm([0.8, 0.6, -0.1]), d2 = norm([0.1, 0.75, -0.62]), d3 = norm([-0.85, 0.5, -0.2]);
  const mid: Partial<Pose> = { ...AXE_UP, yaw: -0.15, hy: 0.1, hand: [[15.6, 6.0, 27.0], [-13.0, 6.0, 26.0]], axeDir: d1, axeEdge: sweepEdge(d1), fire: 1.5, bladeFace: 0.8 };
  const hit: Partial<Pose> = {
    ...AXE_UP, yaw: 0.35, pitch: 0.16, hy: -0.1, bob: -2 * PX, hand: [[4.0, 13.6, 25.0], [-14.0, 3.0, 25.0]],
    pole: [[1, -0.5, -0.2], [-0.6, -1, -0.3]], axeDir: d2, axeEdge: sweepEdge(d2), fire: 1.5, flash: 1, bladeFace: 1,
  };
  const follow: Partial<Pose> = {
    ...hit, yaw: 0.6, hy: -0.2, hand: [[-9.0, 13.0, 24.0], [-15.0, -1.0, 24.0]], pole: [[0.3, -1, -0.2], [-0.6, -1, -0.3]],
    axeDir: d3, axeEdge: sweepEdge(d3), flash: 0,
  };
  return [
    { f: 0, p: AXE_UP },
    { f: 1, p: mid, ease: easeIn },
    { f: 2, p: hit, ease: linear },
    { f: 3, p: follow, ease: easeOut },
    { f: 4.5, p: { ...follow, yaw: 0.45, fire: 1.2, glow: 1.1 }, ease: easeOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
}
function axeSweepPoses(view: ZView): Pose[] {
  const keys = sweepKeys();
  const poses = keyed(keys, 10, 540);
  poses[1].trail = trailFor(keys, 0.2, 1, view);
  poses[2].trail = trailFor(keys, 0.6, 2, view);
  poses[3].trail = trailFor(keys, 1.4, 3, view);
  poses[4].trail = trailFor(keys, 2.6, 3.2, view, 4);
  poses[2].flash = 1;
  return poses;
}

// ---------- «Таран»: роет землю копытом, наклоняет рога → бег по прямой → торможение ----------
const RAM_LOW: Partial<Pose> = {
  root: [0, -3, 0], pitch: 0.32, bob: -2 * PX, hp: 0.3, axeSide: 0.6,
  hand: [[14.0, -1.0, 16.0], [-13.0, 8.0, 18.0]], pole: [[0.8, -1, 0], [-0.8, -1, -0.2]],
  axeDir: norm([0.4, -0.75, -0.5]), axeEdge: [0.2, 0.3, -1], glow: 1.35, fire: 1.1,
  foot: [[6.8, -4.6, 4.6], [-6.6, 2.4, 4.6]], toe: [-0.2, 0],
};
function ramPawPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: RAM_LOW, ease: easeInOut }], 4, 600);
}
/** Копыто роет землю: правая ступня скребёт назад, комья летят за спину; голова кивает на пиксель. */
function ramHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: RAM_LOW }, { f: 1, p: RAM_LOW }], 0);
  const fy = [-4.6, -1.8, -4.6, -7.2], fz = [6.0, 4.6, 4.6, 5.4], sc = [0.3, 0.6, 1, 0.6], hz = [0, 0, -1, 0];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 620 + i,
    foot: [[6.8, fy[i], fz[i]], base.foot[1]] as [V3, V3], toe: [i === 3 ? -0.4 : 0, 0] as [number, number],
    scrape: sc[i], headZ: hz[i], glow: [1.3, 1.45, 1.5, 1.4][i],
  }));
}
/** Бег тараном (по кругу, пока Тавр несётся по меткам): корпус низко, рога вперёд, длинный шаг, пыль из-под копыт. */
function chargePoses(n = 8): Pose[] {
  const A = 6.6, LIFT = 5.4, DUTY = 0.42;
  const footAt = (u: number) => {
    u = ((u % 1) + 1) % 1;
    if (u < DUTY) return { y: A - (2 * A * u) / DUTY, z: 0, toe: 0, strike: u < 0.18 ? 1 - u / 0.18 : 0 };
    const s = (u - DUTY) / (1 - DUTY);
    return { y: -A + 2 * A * easeInOut(s), z: LIFT * Math.sin(Math.PI * s), toe: 0.35 * Math.sin(Math.PI * s), strike: 0 };
  };
  const bob = [-1, 0, 1, 0, -1, 0, 1, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const fr = footAt(t), fl = footAt(t + 0.5);
    const fwL = -fl.y / A;
    return {
      ...REST, ...RAM_LOW, t, seed: 660 + i,
      root: [0, -2, 0], pitch: 0.46, hp: 0.28, bob: (bob[i] - 1) * PX, glow: 1.4, fire: 1.2,
      hand: [[14.0, -3.0 - 1.4 * fwL, 17.0], [-13.0, 4.0 + 5.0 * fwL, 20.0 + 2.0 * Math.max(0, fwL)]],
      foot: [[6.4, 1.0 + fr.y, 4.6 + fr.z], [-6.4, 1.0 + fl.y, 4.6 + fl.z]], toe: [fr.toe, fl.toe],
      dust: [fr.strike, fl.strike], scrape: 0,
    } as Pose;
  });
}
/** Торможение: копыта упираются вперёд, пыль из-под обеих, корпус откидывается и выпрямляется к покою. */
function ramStopPoses(): Pose[] {
  const run = chargePoses()[0];
  const skid: Partial<Pose> = {
    ...RAM_LOW, root: [0, 1, 0], pitch: 0.1, hp: 0.1, bob: -2 * PX, foot: [[6.8, 5.4, 4.6], [-6.6, 2.0, 4.6]], toe: [0.25, 0.1],
    hand: [[15.0, 2.0, 19.0], [-14.0, 4.0, 22.0]], dust: [1, 1], scrape: 0, glow: 1.2, fire: 1.1,
  };
  const keys: Key[] = [
    { f: 0, p: run },
    { f: 1, p: skid, ease: easeOut },
    { f: 2, p: { ...skid, pitch: 0.02, bob: -1 * PX, dust: [0.6, 0.6] }, ease: easeOut },
    { f: 5, p: { dust: [0, 0] }, ease: easeInOut },
  ];
  return keyed(keys, 6, 700);
}

// ---------- «Пепельная волна»: копыто вверх → удержание → удар копытом, пепел и угли ----------
const STOMP_UP: Partial<Pose> = {
  pitch: -0.08, roll: -0.08, bob: 1 * PX, hp: -0.24, axeSide: 0,
  hand: [[13.0, 1.0, 40.0], [-17.0, 3.0, 31.0]], pole: [[1, -0.4, -0.3], [-1, -0.4, -0.5]],
  axeDir: norm([0.25, 0.1, 1]), axeEdge: [1, 0, -0.2], glow: 1.35, fire: 1.3,
  foot: [[6.4, 4.4, 15.0], [-6.0, 0.4, 4.6]], toe: [0.3, 0],
};
function stompUpPoses(): Pose[] {
  return keyed([{ f: 0, p: {} }, { f: 3, p: STOMP_UP, ease: easeInOut }], 4, 800);
}
function stompHoldPoses(): Pose[] {
  const base = poseAt([{ f: 0, p: STOMP_UP }, { f: 1, p: STOMP_UP }], 0);
  const lift = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 820 + i, armLift: [lift[i], -lift[i]] as [number, number],
    foot: [add(base.foot[0], [0, 0, [0, 1, 1, 0][i] * PX]), base.foot[1]] as [V3, V3],
    glow: [1.3, 1.5, 1.35, 1.5][i], fire: [1.3, 1.5, 1.35, 1.5][i],
  }));
}
function stompPoses(): Pose[] {
  const down: Partial<Pose> = {
    ...STOMP_UP, pitch: 0.32, roll: 0.02, bob: -3 * PX, hp: 0.14,
    hand: [[16.0, 6.0, 26.0], [-17.0, 6.0, 22.0]], pole: [[1, -0.6, 0.2], [-1, -0.6, 0.2]],
    axeDir: norm([0.6, 0.4, -0.7]), axeEdge: [0.4, -0.2, -1], foot: [[6.6, 3.4, 4.6], [-6.4, 0.2, 4.6]], toe: [0, 0], glow: 1.4, fire: 1.5,
  };
  const keys: Key[] = [
    { f: 0, p: STOMP_UP },
    { f: 1, p: { ...STOMP_UP, foot: [[6.6, 4.0, 9.0], STOMP_UP.foot![1]], bob: 0 }, ease: easeIn },
    { f: 2, p: { ...down, ash: 1, flash: 1 }, ease: easeIn },
    { f: 3, p: { ...down, ash: 0.8, flash: 0 }, ease: easeOut },
    { f: 5, p: { ...down, pitch: 0.26, bob: -2 * PX, ash: 0.45 }, ease: easeOut },
    { f: 9, p: { ash: 0 }, ease: easeInOut },
  ];
  const poses = keyed(keys, 10, 840);
  poses[2].flash = 0;
  poses[6].ash = 0.25;
  return poses;
}

/**
 * Гибель: кадр 0 — почти покой; отшатнулся к кадру 2, шатается — топор выскальзывает и втыкается лезвием в землю рядом;
 * падает на колени. Вниз и вверх — заваливается на левый бок (видны голова с рогами, рука и топор рядом), вбок — кланяется
 * вперёд до земли. Последние кадры не повтор: тело оседает на пиксель, огонь лезвия тлеет и гаснет, над ним дымок.
 */
function deathPoses(view: ZView): Pose[] {
  const recoil: Partial<Pose> = {
    pitch: -0.12, bob: 1 * PX, hp: -0.32, hand: [[17.0, 0.4, 24.0], [-17.4, 0.4, 24.0]], glow: 1.5, fire: 1.3,
  };
  const stagger: Partial<Pose> = {
    pitch: 0.1, roll: 0.07, yaw: 0.1, bob: 0, hp: -0.1, hand: [[17.0, 3.4, 16.0], [-16.4, 3.0, 17.0]], glow: 0.9, fire: 0.9, axeFree: 0.25, axeGround: [13.0, 3.0, 12.0], axeLie: norm([0.6, 0.1, -0.8]),
  };
  const kneel: [V3, V3] = [[5.2, -8.8, 3.4], [-5.2, -8.2, 3.4]];
  const knees: Partial<Pose> = {
    root: [0, -2.4, 0], pitch: 0.3, roll: 0.03, bob: -8 * PX, hp: 0.12, foot: kneel, toe: [-0.9, -0.9], hand: [[16.0, 3.6, 7.0], [-16.0, 3.6, 7.0]],
    pole: [[1, -0.6, 0.2], [-1, -0.6, 0.2]], glow: 0.7, fire: 0.8, dust: [1, 1], axeFree: 1,
    axeGround: [13.0, 3.0, 12.0], axeLie: norm([0.6, 0.1, -0.8]),
  };
  // огонь лезвия по кадрам 8–11: тлеет и гаснет; дымок к концу гуще
  const fade = [
    { glow: 0.45, fire: 0.7, smoke: 0.35 }, { glow: 0.25, fire: 0.45, smoke: 0.65 },
    { glow: 0.1, fire: 0.22, smoke: 0.9 }, { glow: 0, fire: 0.06, smoke: 1 },
  ];
  if (view === "side") {
    const bow: Partial<Pose> = {
      ...knees, root: [0, -6, 0], pitch: 0.56, bob: -9 * PX, hp: 0.38, hand: [[8.0, 7.0, 4.2], [-8.0, 7.0, 4.2]], glow: 0.5, fire: 0.75, dust: [0.3, 0.3],
    };
    const keys: Key[] = [
      { f: 0, p: { glow: 1.0 } },
      { f: 2, p: recoil, ease: easeOut },
      { f: 4, p: stagger, ease: easeInOut },
      { f: 6.4, p: knees, ease: easeIn },
      { f: 8, p: bow, ease: easeInOut },
      { f: 9, p: { ...bow, pitch: 0.62, bob: -10 * PX, hp: 0.46, dust: [0.6, 0.6] }, ease: easeIn },
      { f: 11, p: { ...bow, pitch: 0.6, bob: -10 * PX, hp: 0.5, dust: [0, 0] }, ease: easeOut },
    ];
    const poses = keyed(keys, 12, 900);
    fade.forEach((fd, k) => Object.assign(poses[8 + k], fd));
    return poses;
  }
  // вниз и вверх: с колен на левый бок — корпус клонится; правая рука ложится поперёк груди; топор воткнут в землю
  // дальше справа, чтобы тело его не закрыло
  // топор лежит на земле перед телом (со стороны зрителя в этом виде), кромкой вверх — тлеющее лезвие видно
  const fy = view === "up" ? -1 : 1;
  // древко поперёк кадра перед телом (тело лежит во всю ширину кадра — сбоку места нет), лезвие кромкой вверх с
  // наклоном к зрителю — секира читается целиком и не уходит за край кадра
  const axeAt: Partial<Pose> = { axeGround: [6.0, 9.0 * fy, 1.4], axeLie: norm([1, 0.12 * fy, 0.03]), axeLieEdge: [0, 0.3 * fy, 1] };
  const kneesDU: Partial<Pose> = { ...knees, ...axeAt };
  const tip: Partial<Pose> = {
    ...kneesDU, pitch: 0.18, roll: -0.12, hp: -0.1, hy: 0.25, glow: 0.6, fire: 0.75, dust: [0.2, 0.2],
    hand: [[17.0, 6.0, 12.0], [-17.0, 4.0, 14.0]], fall: 0.55, fallShift: 12,
  };
  const down: Partial<Pose> = {
    ...kneesDU, pitch: 0.12, roll: -0.1, hp: -0.2, hy: 0.35, hr: -0.2, glow: 0.5, fire: 0.75, dust: [1, 1],
    hand: [[-3.0, 10.0, 25.0], [-14.0, 9.0, 30.0]], pole: [[1, 0.6, -0.6], [-1, 0.4, -0.4]], fall: 1.3, fallShift: 30,
  };
  const keys: Key[] = [
    { f: 0, p: { glow: 1.0 } },
    { f: 2, p: recoil, ease: easeOut },
    { f: 4, p: { ...stagger, ...axeAt }, ease: easeInOut },
    { f: 6, p: kneesDU, ease: easeIn },
    { f: 7, p: tip, ease: easeIn },
    { f: 8, p: down, ease: easeIn },
    { f: 9, p: { ...down, fall: 1.36, dust: [0.6, 0.6] }, ease: easeOut },
    { f: 11, p: { ...down, fall: 1.36, hp: -0.26, dust: [0, 0] }, ease: easeOut },
  ];
  const poses = keyed(keys, 12, 900);
  fade.forEach((fd, k) => Object.assign(poses[8 + k], fd));
  return poses;
}

/**
 * Разворот на 180° для второго удара «Рунного размаха» (за спину): из выноса после удара (кадр 4 axeSweep) тело
 * продолжает вращение в ту же сторону и встаёт в замах. Рисуется в той же строке вида, что первый удар; последний кадр
 * совпадает с последним кадром axeUp строки «вверх» (из «вниз»), «вниз» (из «вверх») и отражённой «вбок» — дальше
 * axeHold и axeSweep идут в развёрнутой строке.
 */
function axeTurnPoses(view: ZView): Pose[] {
  // вбок корпус повёрнут к зрителю на 0,22: ближе всего к отражённой строке — разворот на π + 0,3 (подобрано по пикселям).
  // Совпасть точно вбок не может: в отражении топор в левой руке — смена строки после разворота даёт перехват рук.
  const END = view === "side" ? Math.PI + 0.3 : Math.PI;
  const from = poseAt(sweepKeys(), 4);
  const keys: Key[] = [
    { f: 0, p: from },
    { f: 3, p: { ...AXE_UP, yaw: 0.1, hy: 0.1, turn: END * 0.55, bob: 0, fire: 1.2, glow: 1.1, axeDir: norm([0.6, -0.4, 0.2]), axeEdge: [0, 0, -1] }, ease: easeInOut },
    { f: 7, p: { ...AXE_UP, turn: END }, ease: easeOut },
  ];
  const poses = keyed(keys, 8, 560);
  poses[7] = { ...poses[7], ...AXE_UP, turn: END } as Pose;
  return poses;
}

export type MinoAnim =
  | "idle" | "walk" | "attack" | "axeUp" | "axeHold" | "axeSweep" | "axeTurn" | "ramPaw" | "ramHold" | "charge" | "ramStop"
  | "stompUp" | "stompHold" | "stomp" | "death";
/**
 * Анимации: первый столбец листа, число кадров, кадров в секунду, по кругу ли, что дальше, кадр удара. Замахи умений —
 * связки «замах → удержание по кругу до конца предупреждения → удар» (кадр hit — ровно в конце предупреждения).
 */
export const MINO_ANIMS: Record<MinoAnim, { col: number; n: number; fps: number; loop: boolean; ru: string; next?: MinoAnim; hit?: number }> = {
  idle: { col: 0, n: 12, fps: 12, loop: true, ru: "покой" },
  walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
  attack: { col: 24, n: 10, fps: 15, loop: false, ru: "атака", hit: 6 },
  axeUp: { col: 34, n: 4, fps: 12, loop: false, ru: "замах топора", next: "axeHold" },
  axeHold: { col: 38, n: 4, fps: 12, loop: true, ru: "удержание топора", next: "axeSweep" },
  axeSweep: { col: 42, n: 10, fps: 15, loop: false, ru: "рунный размах", hit: 2 },
  axeTurn: { col: 52, n: 8, fps: 12, loop: false, ru: "разворот за спину", next: "axeHold" },
  ramPaw: { col: 60, n: 4, fps: 12, loop: false, ru: "рогами вниз", next: "ramHold" },
  ramHold: { col: 64, n: 4, fps: 12, loop: true, ru: "роет копытом", next: "charge" },
  charge: { col: 68, n: 8, fps: 16, loop: true, ru: "таран", next: "ramStop" },
  ramStop: { col: 76, n: 6, fps: 12, loop: false, ru: "торможение" },
  stompUp: { col: 82, n: 4, fps: 12, loop: false, ru: "копыто вверх", next: "stompHold" },
  stompHold: { col: 86, n: 4, fps: 12, loop: true, ru: "удержание копыта", next: "stomp" },
  stomp: { col: 90, n: 10, fps: 12, loop: false, ru: "пепельный удар", hit: 2 },
  death: { col: 100, n: 12, fps: 12, loop: false, ru: "гибель" },
};
export const MINO_COLS = 112;
/**
 * Умения карточки → анимации и эффекты мира. «Рунный размах»: удар вперёд (axeSweep до кадра 4 — вынос), затем
 * axeTurn — разворот на 180° в той же строке вида; после него строка меняется на противоположную (вниз ↔ вверх, вбок —
 * отражение) и идут axeHold и тот же axeSweep — удар за спину (then.windupMs 1300 считается от выноса, кадр 4); поджог —
 * burnfx на задетых героях. «Таран»: замах, затем бег по
 * меткам (charge по кругу count·stepMs), метки бьют эффектом ramfx одна за другой, в конце — торможение. «Пепельная волна»:
 * удар копытом, ashfx — по кругу r64, затем по кольцам 64–128 и 128–192 с шагом 0,9 с.
 */
export const MINO_SKILLS: Record<string, { windup: [MinoAnim, MinoAnim]; strike: MinoAnim; after?: MinoAnim; fx: "burn" | "ram" | "ash"; then?: { turn: number; windup: [MinoAnim, MinoAnim]; strike: MinoAnim } }> = {
  rune_axe: { windup: ["axeUp", "axeHold"], strike: "axeSweep", fx: "burn", then: { turn: 180, windup: ["axeTurn", "axeHold"], strike: "axeSweep" } },
  ram: { windup: ["ramPaw", "ramHold"], strike: "charge", after: "ramStop", fx: "ram" },
  ash_stomp: { windup: ["stompUp", "stompHold"], strike: "stomp", fx: "ash" },
};
const POSES: Record<MinoAnim, (view: ZView) => Pose[]> = {
  idle: () => idlePoses(), walk: () => walkPoses(), attack: attackPoses, axeUp: axeUpPoses, axeHold: axeHoldPoses, axeSweep: axeSweepPoses, axeTurn: axeTurnPoses,
  ramPaw: ramPawPoses, ramHold: ramHoldPoses, charge: () => chargePoses(), ramStop: ramStopPoses,
  stompUp: stompUpPoses, stompHold: stompHoldPoses, stomp: stompPoses, death: deathPoses,
};

/** Лист одной анимации: 3 строки (вниз, вверх, вбок), столбцы — кадры. */
export function buildMinoAnim(anim: MinoAnim): PC {
  const A = MINO_ANIMS[anim];
  const out = new PC(N * A.n, N * 3);
  VIEWS.forEach((v, row) => POSES[anim](v).forEach((p, i) => out.blit(renderMinotaur(v, p), i * N, row * N)));
  return out;
}
export function buildMinoSheet(parts?: Partial<Record<MinoAnim, PC>>): PC {
  const out = new PC(N * MINO_COLS, N * 3);
  for (const a of Object.keys(MINO_ANIMS) as MinoAnim[]) out.blit(parts?.[a] ?? buildMinoAnim(a), MINO_ANIMS[a].col * N, 0);
  return out;
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
 * Без полупрозрачности. hot — щель светится огнём (пепельная волна), 0 — остыла.
 */
function drawCracks(o: PC, cracks: Crack[], grow: number, pale = false, hot = 0) {
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
    if (inner[y * N + x]) { o.set(x, y, hot > 0.05 ? FIRE[hot > 0.66 ? 3 : hot > 0.33 ? 2 : 1] : EARTH[pale ? 1 : 0]); continue; }
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
      o.set(x, y, (f.ash ? ASH : DUST)[dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2]);
    }
  }
}

// ---------------- эффекты мира ----------------
/** Центр метки в кадре эффекта 64×64 (как у пилота): (32, 44). Земля — без сжатия, всё растёт вверх. */
const FX_AY = 44;

/**
 * Язык пламени: капля от основания (bx, by) вверх на h px, полуширина w, кончик уводит sway. Ядро светлое, к краю и
 * к кончику — краснее; тёмно-красный контур 1 px рисуется потом по слою. Непрозрачно, без полутонов.
 */
function drawFlame(o: PC, bx: number, by: number, h: number, w: number, sway: number) {
  for (let yy = 0; yy <= h; yy++) {
    const u = yy / h;
    const hw = w * Math.pow(1 - u, 0.85) * Math.min(1, 0.45 + u * 3.2);
    const cx = bx + sway * u * u;
    for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
      const r = Math.abs(x + 0.5 - cx) / Math.max(0.6, hw);
      if (r > 1) continue;
      let k = r < 0.4 && u < 0.55 ? 4 : r < 0.75 ? 3 : 2;
      if (u > 0.72) k = Math.max(1, k - 1);
      if (u > 0.9) k = 1;
      o.set(x, Math.round(by - yy), FIRE[k]);
    }
  }
}
/** Контур слоя пламени тёмно-красным (не чёрным): огонь читается на траве и на земле. */
const flameOutline = (o: PC) => o.outline(FIRE[0]);

/**
 * Поджог «Рунного размаха» (umb_ash_minotaur-burnfx.png): 6 кадров по кругу, 12 к/с, рисуется поверх героя на время
 * burnMs. Точка опоры — ступни героя в (32, 44). Языки у ног и на теле качаются ступенями, искры уходят вверх.
 */
export const BURNFX = { n: 6, fps: 12, loop: true };
export function buildBurnFx(): PC {
  const out = new PC(N * BURNFX.n, N);
  const flames: [number, number, number, number, number][] = [
    // x, y основания, высота, полуширина, фаза
    [25, 45, 9, 2.6, 0], [38, 45, 8, 2.4, 2], [31, 46, 6, 2.2, 4], [28, 33, 5, 1.8, 1], [36, 30, 5, 1.7, 3],
  ];
  const hk = [1, 1.18, 0.9, 1.1, 0.84, 1.04];
  for (let f = 0; f < BURNFX.n; f++) {
    const o = new PC(N, N);
    flames.forEach(([x, y, h, w, ph], k) => {
      const i = (f + ph) % 6;
      drawFlame(o, x, y, Math.round(h * hk[i]), w, [0, 1, 1, 0, -1, -1][i] * (k % 2 ? -1 : 1));
    });
    flameOutline(o);
    // искры: по две, поднимаются на 3 px за кадр и гаснут
    for (let k = 0; k < 3; k++) {
      const u = ((f + k * 2) % 6) / 6;
      const x = 24 + k * 7 + Math.round(Math.sin(u * TAU + k) * 1.5), y = Math.round(36 - k * 4 - u * 18);
      o.set(x, y, FIRE[u < 0.5 ? 3 : 2]);
      if (u < 0.34) o.set(x, y + 1, FIRE[1]);
    }
    out.blit(o, f * N, 0);
  }
  return out;
}

/** Ком земли или пепла с тенью — та же форма, что у пилота. */
interface FxLayers { back: PC; front: PC }
const layers = (): FxLayers => ({ back: new PC(N, N), front: new PC(N, N) });

/**
 * Метка «Тарана» (umb_ash_minotaur-ramfx.png): 8 кадров, 12 к/с, кадр 0 — удар копыта (метка бьёт). Строка 0 — под
 * юнитами (трещины, след копыт, лежащие комья), строка 1 — над юнитами (летящие комья, пыль). Метки бьют одна за другой
 * через stepMs — клиент ставит этот эффект в каждую.
 */
export const RAMFX = { n: 8, fps: 12, hit: 0 };
export function buildRamFx(): PC {
  const out = new PC(N * RAMFX.n, N * 2);
  const cx = CX, cy = FX_AY;
  const cracks = [0, 1, 2, 3, 4].map((k) => {
    const a = (k / 5) * TAU + 0.6 + (hash01(k, 3, 1) - 0.5) * 0.6;
    return crack(cx + Math.cos(a) * 4, cy + Math.sin(a) * 2.4, a, 7 + 5 * hash01(k, 4, 1), 2.6, 40 + k);
  });
  const grow = [0.5, 1, 1, 1, 1, 1, 1, 1], pale = [0, 0, 0, 0, 0, 1, 1, 1];
  const dust = [1, 0.8, 0.6, 0.4, 0.2, 0, 0, 0];
  for (let f = 0; f < RAMFX.n; f++) {
    const L = layers();
    if (f < 7) drawCracks(L.back, f < 6 ? cracks : cracks.map((c) => ({ ...c, pts: c.pts.slice(0, Math.ceil(c.pts.length * 0.5)) })), grow[f], !!pale[f]);
    // след копыт — две тёмные лунки, к концу бледнеют
    if (f < 7) for (const dx of [-3, 2]) for (const [x, y, c] of [[0, 0, 0], [1, 0, 0], [0, 1, 1], [1, 1, 1], [-1, 0, 2], [2, 0, 2]] as [number, number, number][])
      L.back.set(cx + dx + x, cy - 1 + y, EARTH[c + (pale[f] ? 1 : 0)]);
    // комья: вылетают вперёд-в-стороны, падают и лежат, к концу тают
    for (let k = 0; k < 6; k++) {
      if (f >= 6 && k >= 6 - (f - 5) * 2) continue;
      const dir = (k % 2 ? 1 : -1) * (1.1 + 0.9 * hash01(k, 1, 7));
      const [x, y, rest] = clodPos(cx + (k % 2 ? 2 : -3), cy + (k >> 1) - 1, dir * 1.8, 1.7 + 1.5 * hash01(k, 2, 7), f * 1.8 + 0.6);
      drawClodAt(rest ? L.back : L.front, x, y + (rest ? 1 : 0), k);
    }
    if (dust[f] > 0) {
      drawPuffAt(L.front, cx, cy + 1, { c: [0, 0, 0], k: dust[f], seed: 3 });
      drawPuffAt(L.back, cx, cy - 2, { c: [0, 0, 0], k: dust[f] * 0.8, seed: 4 });
    }
    sealPinholes(L.back, true);
    sealPinholes(L.front, true);
    out.blit(L.back, f * N, 0);
    out.blit(L.front, f * N, N);
  }
  return out;
}

/** Клуб пепла: шар 3 тонов с источником света сверху слева, низ темнее, контур тёмно-серый. */
function drawAshBall(o: PC, cx: number, cy: number, r: number, hot = 0) {
  if (r < 0.8) return;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
    if (dx * dx + dy * dy > 1) continue;
    const l = -0.6 * dx - 0.8 * dy;
    let k = l > 0.45 ? 4 : l > -0.15 ? 3 : 2;
    if (dy > 0.55) k = 1;
    o.set(x, y, hot > 0.5 && dy > 0.3 ? FIRE[1] : ASH[k]);
  }
}

/**
 * Выброс пепла «Пепельной волны» (umb_ash_minotaur-ashfx.png): 10 кадров, 12 к/с, кадр hit 1 — участок кольца бьёт.
 * Клиент ставит его по окружности загоревшегося круга или кольца (шаг ≈ 28 px): из раскалённой трещины бьёт клуб пепла,
 * поднимается и тает, угли летят вверх, трещина остывает. Строка 0 — под юнитами, строка 1 — над.
 */
export const ASHFX = { n: 10, fps: 12, hit: 1, step: 28 };
export function buildAshFx(): PC {
  const out = new PC(N * ASHFX.n, N * 2);
  const cx = CX, cy = FX_AY;
  const cracks = [0, 1, 2, 3].map((k) => {
    const a = (k / 4) * TAU + 0.3 + (hash01(k, 5, 2) - 0.5) * 0.7;
    return crack(cx + Math.cos(a) * 2.5, cy + Math.sin(a) * 1.5, a, 6 + 5 * hash01(k, 6, 2), 2.4, 60 + k);
  });
  const grow = [0.35, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.7];
  const hot = [1, 1, 0.9, 0.75, 0.6, 0.45, 0.3, 0.15, 0, 0];
  // клубы: [сдвиг x, начало (кадр), размер]
  const balls: [number, number, number][] = [[0, 1, 5.2], [-4.5, 1, 4.0], [4.5, 2, 4.2], [-1.5, 3, 3.6], [2.5, 4, 3.0]];
  for (let f = 0; f < ASHFX.n; f++) {
    const L = layers();
    drawCracks(L.back, cracks, grow[f], f >= 8, hot[f]);
    for (const [bx, s0, size] of balls) {
      const t = f - s0;
      if (t < 0) continue;
      const u = t / 7;
      if (u > 1) continue;
      const r = size * (u < 0.25 ? 0.5 + u * 2 : 1 - (u - 0.25) * 1.1);
      const y = cy - 1 - 4 * Math.sqrt(t) - t * 1.6;
      drawAshBall(L.front, cx + bx * (1 + u * 0.4), y, r, u < 0.2 ? 1 : 0);
    }
    L.front.outline(ASH[0]);
    // угли: вылетают из трещины и гаснут
    for (let k = 0; k < 6; k++) {
      const t = f - 1 - (k % 3) * 0.5;
      if (t < 0 || t > 6) continue;
      const a = -Math.PI / 2 + (k - 2.5) * 0.32;
      const v = 4 + 2 * hash01(k, 1, 5);
      const x = Math.round(cx + Math.cos(a) * v * t * 0.8), y = Math.round(cy - 2 + Math.sin(a) * v * t + 0.45 * t * t);
      L.front.set(x, y, FIRE[t < 2 ? 4 : t < 4 ? 3 : 2]);
      if (t < 3) L.front.set(x, y + 1, FIRE[1]);
    }
    if (f >= 1 && f <= 4) drawPuffAt(L.back, cx, cy + 1, { c: [0, 0, 0], k: 1 - (f - 1) / 4, seed: 9, ash: true });
    sealPinholes(L.back, true);
    sealPinholes(L.front, true);
    out.blit(L.back, f * N, 0);
    out.blit(L.front, f * N, N);
  }
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

/** Монтаж (как treant-preview.png): минотавр рядом с героем 32×32 на траве и на земле ×3, анимации ×2, эффекты мира ×2. */
function buildPreview(sheets: Record<MinoAnim, PC>, fx: { burn: PC; ram: PC; ash: PC }, hero: PC, terrain: PC): PC {
  const W = 1660;
  const rows: { h: number; draw: (c: PC, y: number) => void }[] = [];
  const BG: RGBA = [24, 20, 26, 255];
  const frameOf = (a: MinoAnim, view: number, i: number) => crop(sheets[a], i * N, view * N, N, N);
  const heroDown = crop(hero, 0, 0, 32, 32);
  const heroSide = crop(hero, 0, 64, 32, 32);
  for (const g of ["grass", "forest"] as Ground[]) {
    rows.push({
      h: 64 * 3 + 40,
      draw: (c, y0) => {
        const k = 3;
        text(c, `×3 · ГЕРОЙ 32 И ТАВР 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · ${g === "grass" ? "ТРАВА" : "ЗЕМЛЯ"}`, 16, y0 + 8);
        const y = y0 + 36;
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, g);
        let x = 40;
        const hy = y + (64 - 32) * k;
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroDown, k), x, hy);
        x += 30 * k;
        for (const [v, flip] of [[0, false], [1, false], [2, false], [2, true]] as [number, boolean][]) {
          shadowBlob(c, x + 32 * k, y + 60 * k, 16 * k, 4.6 * k);
          c.blit(scaleNN(frameOf("idle", v, 0), k, flip), x, y);
          x += 64 * k;
        }
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroSide, k, true), x, hy);
      },
    });
  }
  for (const a of Object.keys(MINO_ANIMS) as MinoAnim[]) {
    const A = MINO_ANIMS[a];
    rows.push({
      h: 64 * 2 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.next ? ` · → ${MINO_ANIMS[A.next].ru}` : ""}`, 16, y0 + 8);
        for (const v of [0, 2]) {
          const y = y0 + 34 + (v === 0 ? 0 : 64 * k);
          groundBg(c, terrain, 16, y, W - 32, 64 * k, k, (a === "walk" || a === "charge") && v === 2 ? "forest" : "grass");
          let x = 24;
          const hy = y + (64 - 32) * k;
          shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
          c.blit(scaleNN(v === 0 ? heroDown : heroSide, k, v === 2), x, hy);
          x += 30 * k;
          for (let i = 0; i < A.n; i++) {
            shadowBlob(c, x + 32 * k, y + 60 * k, 16 * k, 4.6 * k);
            c.blit(scaleNN(frameOf(a, v, i), k), x, y);
            x += 64 * k;
          }
        }
      },
    });
  }
  // «Рунный размах» целиком: удар вперёд → разворот → удар за спину (строка вида меняется после разворота)
  rows.push({
    h: 64 * 2 * 2 + 40,
    draw: (c, y0) => {
      const k = 2;
      text(c, `×2 · РУННЫЙ РАЗМАХ ЦЕЛИКОМ · УДАР ВПЕРЁД → РАЗВОРОТ 180 → УДАР ЗА СПИНУ · СТРОКА ВНИЗ → ВВЕРХ`, 16, y0 + 8);
      const seq: [MinoAnim, number, number][][] = [
        [...[0, 1, 2, 3, 4].map((i) => ["axeSweep", 0, i] as [MinoAnim, number, number]), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ["axeTurn", 0, i] as [MinoAnim, number, number])],
        [["axeHold", 1, 0], ["axeHold", 1, 1], ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ["axeSweep", 1, i] as [MinoAnim, number, number])],
      ];
      seq.forEach((line, j) => {
        const y = y0 + 34 + j * 64 * k;
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, "grass");
        line.forEach(([a, v, i], n) => {
          const x = 24 + n * 62 * k;
          shadowBlob(c, x + 32 * k, y + 60 * k, 16 * k, 4.6 * k);
          c.blit(scaleNN(frameOf(a, v, i), k), x, y);
        });
      });
    },
  });
  // эффекты мира: поджог на герое, метка тарана с героем, выброс пепла с героем
  rows.push({
    h: 64 * 2 * 3 + 40,
    draw: (c, y0) => {
      const k = 2;
      text(c, `×2 · ЭФФЕКТЫ МИРА · ПОДЖОГ ${BURNFX.n} ПО КРУГУ · МЕТКА ТАРАНА ${RAMFX.n} · ВЫБРОС ПЕПЛА ${ASHFX.n} · 12 К/С`, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, terrain, 16, y, W - 32, 64 * k * 3, k, "grass");
      const drawHero = (x: number, yy: number) => {
        shadowBlob(c, x + 32 * k, yy + 43 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroDown, k), x + 16 * k, yy + 13 * k);
      };
      let x = 24;
      for (let i = 0; i < BURNFX.n; i++) {
        drawHero(x, y);
        c.blit(scaleNN(crop(fx.burn, i * N, 0, N, N), k), x, y);
        x += 64 * k;
      }
      x = 24;
      for (let i = 0; i < RAMFX.n; i++) {
        const yy = y + 64 * k;
        c.blit(scaleNN(crop(fx.ram, i * N, 0, N, N), k), x, yy);
        if (i % 2) drawHero(x + 14 * k, yy);
        c.blit(scaleNN(crop(fx.ram, i * N, N, N, N), k), x, yy);
        x += 64 * k;
      }
      x = 24;
      for (let i = 0; i < ASHFX.n; i++) {
        const yy = y + 64 * k * 2;
        c.blit(scaleNN(crop(fx.ash, i * N, 0, N, N), k), x, yy);
        if (i % 2) drawHero(x + 16 * k, yy);
        c.blit(scaleNN(crop(fx.ash, i * N, N, N, N), k), x, yy);
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

/** «Наш | референс»: Тавр вниз и вбок (покой) крупно и образец 22 той же высоты. */
function buildCompare(sheets: Record<MinoAnim, PC>, ref: PC | null): PC {
  const k = 6;
  const ours = crop(sheets.idle, 0, 0, N, N);
  const side = crop(sheets.idle, 0, 2 * N, N, N);
  const H = N * k;
  let refS: PC | null = null;
  if (ref) {
    const x0 = Math.round(ref.w * 0.08), y0 = Math.round(ref.h * 0.03), w = Math.round(ref.w * 0.76), h = Math.round(ref.h * 0.94);
    refS = scaleBox(crop(ref, x0, y0, w, h), Math.round((w * H) / h), H);
  }
  const W = 24 + N * k + 16 + N * k + 24 + (refS ? refS.w + 24 : 0);
  const c = new PC(W, H + 72);
  fill(c, 0, 0, W, H + 72, [36, 32, 38, 255]);
  text(c, "НАШ", 24, 14, 3);
  if (refS) text(c, "РЕФЕРЕНС 22", 24 + 2 * N * k + 40, 14, 3);
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

interface SkillCard { id: string; name: string; windupMs: number; r?: number; r2?: number; arc?: number; count?: number; step?: number; stepMs?: number; after?: { burnMs?: number }; then?: { windupMs: number; r?: number; r2?: number; turn?: number }[] }

/** Просмотр с анимацией: листы встроены в страницу; умения — по таймингам карточки, с метками и эффектами мира. */
function buildHtml(sheet: PC, fx: { burn: PC; ram: PC; ash: PC }, hero: PC, terrain: PC, skills: SkillCard[]): string {
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
<title>Тавр Пепельный — анимации</title>
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
<h1>Тавр Пепельный — палач предгорий</h1>
<p>Кадр 64×64, рядом герой 32×32; масштаб игры. Вниз, вверх, вбок, влево (отражение). Скорость — как в листе.</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0" checked> трава</label><label><input type="radio" name="g" value="1"> земля</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Замах длится windupMs из карточки (связка «замах → удержание по кругу»), кадр удара — ровно в конце предупреждения. «Рунный размах» — конус вперёд, затем разворот (axeTurn) и конус за спину; задетые горят. «Таран» — ряд меток к дальнему герою, Тавр несётся по ним, метки бьют через stepMs. «Пепельная волна» — круг, потом два кольца, каждое — через 0,9 с. Красные зоны — метки предупреждения (в игре их рисует клиент).</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const ANIMS = ${JSON.stringify(MINO_ANIMS)};
const SK = ${JSON.stringify(MINO_SKILLS)};
const FXI = ${JSON.stringify({ burn: BURNFX, ram: RAMFX, ash: ASHFX })};
const SKILLS = ${JSON.stringify(skills)};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${png(sheet)}"), hero = img("${png(hero)}");
const fxImg = { burn: img("${png(fx.burn)}"), ram: img("${png(fx.ram)}"), ash: img("${png(fx.ash)}") };
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
  const a = document.getElementById("arena"); a.width = 420 * zoom; a.height = 240 * zoom;
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
    shadow(g, bx + 32, by + 60, 16, 4.6); shadow(g, 18, by + 62, 7, 2.4);
    drawBoss(g, A.col + frame, row, flip, bx, by);
    g.drawImage(hero, 0, row === 1 ? 32 : row === 2 ? 64 : 0, 32, 32, 2 * zoom, (by + 32) * zoom, 32 * zoom, 32 * zoom);
    g.fillStyle = "#efe6d2"; g.font = (6 * zoom) + "px system-ui"; g.fillText(name, 4 * zoom, 10 * zoom);
  }
}
// ---- умения: связка анимаций по времени ----
const sbar = document.getElementById("skills");
let skill = null, t0 = 0;
for (const s of SKILLS) {
  const b = document.createElement("button");
  b.textContent = s.name + " · замах " + (s.windupMs / 1000).toFixed(1).replace(".", ",") + " с";
  b.onclick = () => { skill = s; t0 = performance.now(); };
  sbar.appendChild(b);
}
const loopAt = (A, t) => A.col + (Math.floor((t / 1000) * A.fps) % A.n);
/** Кадр связки «замах → удержание → удар» так, чтобы кадр hit пришёлся на windupMs; null — связка кончилась. */
function chainAt(w0, w1, st, windupMs, t) {
  const W = ANIMS[w0], Hd = ANIMS[w1], St = ANIMS[st];
  const strikeAt = windupMs - ((St.hit || 0) / St.fps) * 1000;
  if (t < Math.min(strikeAt, (W.n / W.fps) * 1000)) return W.col + Math.min(W.n - 1, Math.floor((t / 1000) * W.fps));
  if (t < strikeAt) return Hd.col + (Math.floor(((t - (W.n / W.fps) * 1000) / 1000) * Hd.fps) % Hd.n);
  const k = Math.floor(((t - strikeAt) / 1000) * St.fps);
  return k < St.n ? St.col + k : null;
}
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  let foot = [150, 120];
  const t = skill ? ts - t0 : -1;
  const heroes = [[foot[0] + 60, foot[1] + 14], [foot[0] + 230, foot[1] + 70], [foot[0] - 70, foot[1] + 40]];
  let col = loopAt(ANIMS.idle, ts), flip = false;
  const zone = (f) => { g.fillStyle = "rgba(230,70,30,.25)"; g.strokeStyle = "#ff6a2a"; g.lineWidth = zoom; f(); g.fill(); g.stroke(); };
  const fxAt = [];
  if (skill) {
    const S = SK[skill.id];
    if (skill.id === "rune_axe") {
      const ang0 = Math.atan2(heroes[0][1] - foot[1], heroes[0][0] - foot[0]);
      const w2 = skill.then[0].windupMs, sweepMs = (ANIMS.axeSweep.n / ANIMS.axeSweep.fps) * 1000;
      const cone = (ang) => zone(() => { g.beginPath(); g.moveTo(foot[0] * zoom, foot[1] * zoom); g.arc(foot[0] * zoom, foot[1] * zoom, skill.r * zoom, ang - skill.arc / 2 * Math.PI / 180, ang + skill.arc / 2 * Math.PI / 180); g.closePath(); });
      if (t < skill.windupMs) cone(ang0);
      const t2 = t - skill.windupMs;
      if (t2 >= 0 && t2 < w2) cone(ang0 + Math.PI);
      // первый удар идёт до выноса (кадр 4), дальше разворот axeTurn в той же строке, затем удар за спину — в развёрнутой
      const fol = ((4 - ANIMS.axeSweep.hit) / ANIMS.axeSweep.fps) * 1000;
      let c = t < skill.windupMs + fol ? chainAt(S.windup[0], S.windup[1], S.strike, skill.windupMs, t) : null;
      if (c === null && t2 >= fol) {
        c = chainAt(S.then.windup[0], S.then.windup[1], S.then.strike, w2 - fol, t2 - fol);
        const T = ANIMS.axeTurn;
        flip = c !== null && !(c >= T.col && c < T.col + T.n);
      }
      if (c !== null) col = c;
      if (t >= skill.windupMs && t < skill.windupMs + skill.after.burnMs) fxAt.push(["burn", heroes[0], Math.floor((t - skill.windupMs) / 1000 * 12) % FXI.burn.n, true]);
      if (t > skill.windupMs + w2 + sweepMs + 1500) skill = null;
    } else if (skill.id === "ram") {
      const far = heroes[1], dx = far[0] - foot[0], dy = far[1] - foot[1], l = Math.hypot(dx, dy);
      const pts = []; for (let i = 1; i <= skill.count; i++) pts.push([foot[0] + dx / l * skill.step * i, foot[1] + dy / l * skill.step * i]);
      if (t < skill.windupMs) for (const p of pts) zone(() => { g.beginPath(); g.arc(p[0] * zoom, p[1] * zoom, skill.r * zoom, 0, 7); });
      const dashMs = skill.count * skill.stepMs;
      if (t < skill.windupMs) { const c = chainAt(S.windup[0], S.windup[1], S.strike, skill.windupMs, t); if (c !== null) col = c; }
      else if (t < skill.windupMs + dashMs) { col = loopAt(ANIMS.charge, t); const u = (t - skill.windupMs) / dashMs; foot = [foot[0] + dx / l * skill.step * skill.count * u, foot[1] + dy / l * skill.step * skill.count * u]; }
      else { const k = Math.floor((t - skill.windupMs - dashMs) / 1000 * ANIMS.ramStop.fps); foot = [foot[0] + dx / l * skill.step * skill.count, foot[1] + dy / l * skill.step * skill.count]; col = k < ANIMS.ramStop.n ? ANIMS.ramStop.col + k : loopAt(ANIMS.idle, ts); }
      pts.forEach((p, i) => { const k = Math.floor((t - skill.windupMs - i * skill.stepMs) / 1000 * FXI.ram.fps); if (k >= 0 && k < FXI.ram.n) fxAt.push(["ram", p, k, false]); });
      if (t > skill.windupMs + dashMs + 2500) skill = null;
    } else if (skill.id === "ash_stomp") {
      const waves = [[0, skill.r, skill.windupMs], ...skill.then.map((w) => [w.r, w.r2, w.windupMs])];
      let start = 0;
      waves.forEach(([r1, r2, w], i) => {
        const hitT = start + w;
        if (t >= start && t < hitT) zone(() => { g.beginPath(); g.arc(foot[0] * zoom, foot[1] * zoom, r2 * zoom, 0, 7); if (r1 > 0) g.arc(foot[0] * zoom, foot[1] * zoom, r1 * zoom, 7, 0, true); });
        const k = Math.floor((t - hitT) / 1000 * FXI.ash.fps) + FXI.ash.hit;
        if (k >= 0 && k < FXI.ash.n) {
          const rr = r1 > 0 ? (r1 + r2) / 2 : r2 * 0.6, n = Math.max(4, Math.round(2 * Math.PI * rr / FXI.ash.step));
          for (let j = 0; j < n; j++) { const an = j / n * Math.PI * 2 + i * 0.3; fxAt.push(["ash", [foot[0] + Math.cos(an) * rr, foot[1] + Math.sin(an) * rr], k, false]); }
        }
        start = hitT;
      });
      const c = chainAt(S.windup[0], S.windup[1], S.strike, skill.windupMs, t);
      if (c !== null) col = c;
      if (t > start + 1500) skill = null;
    }
  }
  const fxLayer = (row) => {
    for (const [kind, p, k, over] of fxAt) {
      if (kind === "burn") { if (row === 1) g.drawImage(fxImg.burn, k * 64, 0, 64, 64, (p[0] - 32) * zoom, (p[1] - 44) * zoom, 64 * zoom, 64 * zoom); continue; }
      g.drawImage(fxImg[kind], k * 64, row * 64, 64, 64, (p[0] - 32) * zoom, (p[1] - 44) * zoom, 64 * zoom, 64 * zoom);
    }
  };
  fxLayer(0);
  shadow(g, foot[0], foot[1], 16, 4.6);
  // разворот на 180° для удара за спину: строка вида «вверх» (спиной к зрителю)
  drawBoss(g, col, flip ? 1 : 0, false, foot[0] - 32, foot[1] - 60);
  for (const h of heroes) { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); }
  fxLayer(1);
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
export function writeMinotaurArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => {
    const f = path.join(outDir, `${ID}-${name}.png`);
    c.save(f);
    files.push(f);
    return c;
  };
  const sheets = {} as Record<MinoAnim, PC>;
  for (const a of Object.keys(MINO_ANIMS) as MinoAnim[]) sheets[a] = save(buildMinoAnim(a), a);
  const sheet = save(buildMinoSheet(sheets), "sheet");
  const fx = { burn: save(buildBurnFx(), "burnfx"), ram: save(buildRamFx(), "ramfx"), ash: save(buildAshFx(), "ashfx") };
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "bosses", "22.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  save(buildPreview(sheets, fx, hero, terrain), "preview");
  save(buildCompare(sheets, ref), "compare");
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "zone-bosses.json"), "utf8")) as { bosses: { id: string; abilities: SkillCard[] }[] };
  const skills = (data.bosses.find((b) => b.id === ID)?.abilities ?? []).map(({ id, name, windupMs, r, r2, arc, count, step, stepMs, after, then }) => ({ id, name, windupMs, r, r2, arc, count, step, stepMs, after, then }));
  const html = path.join(outDir, `${ID}.html`);
  fs.writeFileSync(html, buildHtml(sheet, fx, hero, terrain, skills), "utf8");
  files.push(html);
  return files;
}

// ---------------- отладка ----------------
export function debugFrame(view: ZView, p: Partial<Pose> = {}): PC {
  return renderMinotaur(view, { ...REST, ...p } as Pose);
}
