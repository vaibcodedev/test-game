/**
 * Боссы стартовых земель (задача 136, шаг 3): Хрольф Ненасытный, вожак северных ватаг (Золотые нивы, Сольгард, 1–10).
 * Карточка — data/zone-bosses.json (id sol_raider_chief); образец tools/out/refs/bosses/04.png — только для сравнения,
 * в игру и в git не идёт. Тем же способом, что пилот-древень (tools/gen/zone-bosses-art.ts). В игру пока не подключён:
 * механика — шаг 4.
 *
 * Лист: кадр 64×64, пиксель листа = пиксель мира. Строки: 0 — вниз, 1 — вверх, 2 — вбок вправо (влево — отражение).
 * Столбцы — анимации подряд: RAIDER_ANIMS (первый столбец, кадров, кадров/с, что дальше). Ступни на y = 60 (точка опоры
 * 30/32 кадра, как у всех юнитов); рост ≈ 54 px (1,85 роста героя 32×32): высокий северянин клином — широкие плечи,
 * узкие талия и бёдра, длинные ноги, кожаная юбка до середины бедра; топор на древке 38 px.
 *
 * Как устроено (как у древня): скелет в 3D (X — вправо от вожака, Y — вперёд, Z — вверх), IK рук и ног; тело — объёмные
 * примитивы (конусы со скруглёнными концами, эллипсоиды, шары, усечённые конусы и плоское лезвие топора), сглаженно
 * слитые внутри детали. Кадр — луч на пиксель (ортографическая камера, наклон 14°), свет сверху слева → 5 тонов на
 * материал (кожа, бронза, мех, седина, красный плащ, кожа ремней, железо, древко, шерсть штанов); швы между деталями —
 * тоном тени, контур 1 px. Седина — тёплая пепельно-белая (светлее холодного железа лезвия и бурого меха): высокий голый
 * лоб, волосы зачёсаны назад и гривой лежат на спине, борода светлая до середины груди — тёмное только снизу и с теневой
 * стороны. Плащ — одно полотнище: складки полосами тона, подол — одна волнистая кромка.
 * Корпус, мех и верх плаща — жёсткий слой: в покое и ходьбе он сдвигается только на целые пиксели кадра (snapPx), поэтому
 * кожа и мех не «кипят»; голова с волосами и бородой — свой жёсткий слой (затенение — только от себя), при дыхании
 * под ней поднимаются плечи и грудь. Топор в покое стоит торцом в земле, в ходьбе едет с кулаком на целые пиксели.
 * Брови, глаза и раскрытый в рыке рот — штампы в целых пикселях. Пламя факела — язык из 5 тонов огня. Перед сохранением
 * все кадры проверяются (checkFrames): ничего на краях кадра, ни одной щели шириной 1 px в силуэте.
 *
 * Эффекты мира — отдельными листами: факел в полёте (sol_raider_chief-torch.png, кадр 20×20 — клиент ведёт его по дуге от
 * руки к метке), огонь в нивах (sol_raider_chief-fire.png — пятно не меньше круга урона r = 44, горит hazardMs, нижний и
 * верхний слой), волна рыка (sol_raider_chief-roar.png — кольцо до 84 px).
 *
 * Запуск: npx tsx tools/gen/zone-bosses.ts art → tools/out/zone-bosses/sol_raider_chief-*.png и просмотр
 * sol_raider_chief-anim.html.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, type RGBA, type Ramp } from "./canvas";
import type { ZView } from "./zone-bosses-art";

const BOSS = "sol_raider_chief";
const N = 64;
const CX = 32, GY = 60;
/** Наклон камеры, как у древня: чуть сверху — видны верх меха и наплечника. */
const CAM = (14 * Math.PI) / 180;
const CS = Math.cos(CAM), SN = Math.sin(CAM);
/** Подъём в мире на PX — ровно 1 px кадра по вертикали. */
const PX = 1 / CS;
const VIEWS: ZView[] = ["down", "up", "side"];

// ---------------- палитра ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Тёплая обветренная кожа: тени красноватые, свет персиковый. */
const SKIN = R("#3a1d15", "#6d3926", "#a05d3d", "#cc8a5e", "#eebd8f");
/** Бронза наплечника, наручей, пряжки и колец древка: темнее и рыжее золота Сольгарда. */
const BRONZE = R("#3a200c", "#6e4216", "#a86e28", "#d8a24a", "#f6d890");
/** Мех накидки: серо-бурый волчий, темнее седины — клочья с тёмными кончиками, светлый верх плеч. */
const FUR = R("#3b322b", "#66594d", "#948676", "#bdb09d", "#e2d7c4");
/**
 * Седина волос и бороды: тёплая пепельно-белая — светлее железа лезвия (оно холодное сине-серое) и светлее меха;
 * борода и волосы в основном в тонах 3–4, тёмные тона — только снизу и с теневой стороны.
 */
const HAIR = R("#3a3632", "#6e6760", "#a8a198", "#d8d3cb", "#f4f1ec");
/** Красный плащ — один яркий мазок. */
const RED = R("#3a0c10", "#6e1719", "#a62522", "#cc3b2b", "#e85a40");
const LEATHER = R("#22150e", "#3f2819", "#5f3f26", "#815935", "#a5784a");
const IRON = R("#24272d", "#4a5059", "#7c8691", "#b5bec8", "#eef3f6");
const WOOD = R("#2a160d", "#4a2816", "#6d3e22", "#925730", "#b47846");
/** Шерстяные штаны: холодный серо-синий — отделяет ноги от кожаной юбки и сапог. */
const CLOTH = R("#1b1b23", "#2f2f3b", "#464757", "#606274", "#7f8295");
/** Огонь: красная кромка → белое ядро. */
const FIRE = R("#5c1508", "#a8320c", "#e0661a", "#f8aa30", "#ffe47a", "#fffbe0");
const DUST = R("#4a3a28", "#7a6448", "#a48c66", "#c8b48c");
/** След топора: холодное железо, без полупрозрачности. */
const SMEAR = R("#7d8794", "#c3cbd4", "#f2f6f8");
/** След факела. */
const FIRESMEAR = R("#a8320c", "#f0821e", "#ffd25a");
const FLASH = R("#e8b850", "#fff0b0", "#fffbea");
/** Выжженная стерня и угли. */
const ASH = R("#171210", "#2a201b", "#3f3229", "#564537");
const EMBER = R("#7a1e08", "#d04a10", "#ff9a30", "#ffd870");
/** Травинки, срезанные волной рыка. */
const GRASS = R("#2d5a24", "#4a8a32", "#78b848");
const OUT = hex("#160e0b");
const EYE = hex("#1a100d");
const TEETH = hex("#e8dfcc");
const MOUTH = hex("#3a0d0c");
/** Пыль и волна рыка: светлый передний край. */
const WAVE = hex("#f4ecd8");

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
/** Две кости из A в B, локоть/колено в сторону pole. */
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
/** Оси детали вдоль направления d (третья ось — d). */
function frameAlong(d: V3): [V3, V3, V3] {
  const w = norm(d);
  const u = perp(w, Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  return [u, cross(w, u), w];
}

// ---------------- вид и камера ----------------
/** Модель → вид: Xv вправо по экрану, Yv к зрителю, Zv вверх. Вниз — лицом к зрителю, вверх — спиной, вбок — лицом вправо. */
function toView(view: ZView, v: V3): V3 {
  return view === "down" ? [-v[0], v[1], v[2]] : view === "up" ? [v[0], -v[1], v[2]] : [v[1], v[0], v[2]];
}
function fromView(view: ZView, v: V3): V3 {
  return toView(view, v);
}
const scr = (p: V3): [number, number] => [CX + p[0], GY + SN * p[1] - CS * p[2]];
/** Глубина вдоль луча: меньше — ближе к зрителю. */
const depthOf = (p: V3) => -(CS * p[1] + SN * p[2]);
/** Свет сверху слева и чуть спереди (в пространстве вида). */
const LIGHT: V3 = norm([-0.58, 0.42, 0.7]);
/** Сдвиг в мире → сдвиг ровно на целые пиксели кадра в этом виде (без составляющей вдоль луча). */
function snapPx(view: ZView, w: V3): V3 {
  const v = toView(view, w);
  const sx = Math.round(v[0]), sy = Math.round(SN * v[1] - CS * v[2]);
  return fromView(view, [sx, 0, -sy * PX]);
}
/** Сдвиг на целые пиксели кадра [вправо, вниз] → мир. */
const pxToWorld = (view: ZView, dx: number, dy: number): V3 => fromView(view, [dx, 0, -dy * PX]);
/** Точка модели → пиксель кадра. */
const toScreen = (view: ZView, p: V3) => scr(toView(view, p));

// ---------------- примитивы ----------------
const M_SKIN = 0, M_BRONZE = 1, M_FUR = 2, M_HAIR = 3, M_RED = 4, M_LEATHER = 5, M_IRON = 6, M_WOOD = 7, M_CLOTH = 8;
interface MatDef { ramp: Ramp; base: number; gain: number; lo: number; hi: number; sh?: number; ao?: number }
/** Тон = base + gain·(n·L): обращённое к зрителю — середина (2), к свету — свет (3), блик (4) — только близко к свету. */
const MATS: MatDef[] = [
  { ramp: SKIN, base: 1.55, gain: 2.3, lo: 1, hi: 4 },
  { ramp: BRONZE, base: 1.6, gain: 2.5, lo: 1, hi: 4 },
  { ramp: FUR, base: 2.0, gain: 1.9, lo: 1, hi: 4 },
  { ramp: HAIR, base: 2.7, gain: 1.8, lo: 1, hi: 4, sh: 0.6, ao: 0.3 },
  { ramp: RED, base: 1.75, gain: 2.3, lo: 1, hi: 4, sh: 0.25, ao: 0.35 },
  { ramp: LEATHER, base: 1.45, gain: 2.3, lo: 1, hi: 4 },
  { ramp: IRON, base: 1.25, gain: 2.4, lo: 1, hi: 4 },
  { ramp: WOOD, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: CLOTH, base: 1.4, gain: 2.3, lo: 1, hi: 4 },
];

interface Prim {
  /**
   * 0 — конус со скруглёнными концами (шар, если a = b), 1 — эллипсоид, 2 — лезвие (плоский контур poly в осях u, w
   * толщиной 2·th), 3 — усечённый конус с плоскими торцами (кромки скруглены на th): юбка и ремень без полушарий на концах
   */
  k: number;
  a: V3; b: V3; ra: number; rb: number;
  ax: [V3, V3, V3]; r: V3;
  poly?: [number, number][]; th: number; edge?: number[]; umax: number;
  mat: number; g: number; part: number;
  /** текстура: 0 — гладко, 1 — полосы вдоль оси (кожаная юбка), 2 — клочья (мех) */
  tex: number; ng: number; ref: V3; seed: number;
  /** пояса другого материала: доли длины конуса */
  bands?: [number, number][]; bandMat: number;
  /** поправка тона (пряди бороды) */
  tone: number;
  /** слой: 1 — голова с волосами и бородой (затенение складок и тень — только от своего слоя, чтобы лицо не «кипело» при дыхании) */
  layer: number;
  /** производные (в пространстве вида) */
  sph: boolean; ba: V3; l2: number; rr: number; a2: number; il2: number; len: number; bc: V3; br: number;
}
interface Opt { mat?: number; tex?: number; ng?: number; ref?: V3; seed?: number; bands?: [number, number][]; bandMat?: number; part?: number; tone?: number; layer?: number }

/** Штамп: лицо (брови, глаза) или раскрытый рот — готовый рисунок в целых пикселях у точки на поверхности. */
interface Stamp { kind: "face" | "mouth"; at: V3; n: V3; blink?: number }
/** Частица в мире: ком земли, щепка; size 2 — пиксель и тёмный под ним. */
interface Mote { p: V3; col: RGBA; dark?: RGBA; size?: number }
/** Плоский клуб пыли у земли (координаты модели). */
interface Puff { c: V3; k: number; seed: number }

class Scene {
  prims: Prim[] = [];
  gk: number[] = [];
  stamps: Stamp[] = [];
  motes: Mote[] = [];
  puffs: Puff[] = [];
  /** след удара: путь (мир), чьи пиксели след не трогает (группы), палитра */
  smears: { pts: V3[]; groups: number[]; pal: Ramp }[] = [];
  flash: { at: V3; k: number } | null = null;
  /** пламя факела в руке: основание языка (мир), размер 0..2, фаза */
  flames: { at: V3; size: number; ph: number }[] = [];
  /** волны рыка у рта: точка, фаза 0..1 */
  roar: { at: V3; k: number } | null = null;
  /** втягиваемый воздух у рта: точка, фаза */
  air: { at: V3; k: number } | null = null;
  /** блик на носке лезвия */
  glint: V3 | null = null;
  armG: [number, number] = [-1, -1];
  axeG = -1;
  parts = 0;
  group(k: number): number {
    this.gk.push(k);
    return this.gk.length - 1;
  }
  private push(q: Prim) {
    this.prims.push(q);
    return q;
  }
  private base(o: Opt, g: number) {
    return {
      mat: o.mat ?? M_SKIN, g, part: o.part ?? g, tex: o.tex ?? 0, ng: o.ng ?? 4, seed: o.seed ?? 0,
      bands: o.bands, bandMat: o.bandMat ?? M_BRONZE, tone: o.tone ?? 0, layer: o.layer ?? 0, th: 0, umax: 1,
      sph: false, ba: [0, 0, 0] as V3, l2: 0, rr: 0, a2: 0, il2: 0, len: 0, br: 0,
    };
  }
  cone(g: number, a: V3, ra: number, b: V3, rb: number, o: Opt = {}): Prim {
    const ax = sub(b, a);
    return this.push({ ...this.base(o, g), k: 0, a, b, ra, rb, ax: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], r: [ra, ra, ra], ref: o.ref ?? perp(ax, [0, 1, 0.01]), bc: a });
  }
  ball(g: number, c: V3, r: number, o: Opt = {}): Prim {
    return this.cone(g, c, r, c, r, o);
  }
  /** Усечённый конус: плоские торцы в a и b, радиусы ra и rb, кромки скруглены на rnd. */
  capped(g: number, a: V3, ra: number, b: V3, rb: number, rnd: number, o: Opt = {}): Prim {
    const q = this.cone(g, a, ra, b, rb, o);
    q.k = 3;
    q.th = rnd;
    return q;
  }
  ell(g: number, c: V3, r: V3, ax: [V3, V3, V3], o: Opt = {}): Prim {
    return this.push({ ...this.base(o, g), k: 1, a: c, b: c, ra: 0, rb: 0, ax, r, ref: ax[0], bc: c });
  }
  /** Лезвие: контур poly в плоскости осей ax[0] (u — к кромке) и ax[2] (w — вдоль древка), толщина 2·th, скругление rr. */
  blade(g: number, o0: V3, ax: [V3, V3, V3], poly: [number, number][], th: number, rr: number, edge: number[], o: Opt = {}): Prim {
    const q = this.push({ ...this.base(o, g), k: 2, a: o0, b: o0, ra: rr, rb: rr, ax, r: [1, 1, 1], ref: ax[0], bc: o0, poly, edge });
    q.th = th;
    q.umax = Math.max(...poly.map((v) => v[0]));
    return q;
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
  if (q.k === 2) {
    const us = q.poly!.map((v) => v[0]), ws = q.poly!.map((v) => v[1]);
    const cu = (Math.min(...us) + Math.max(...us)) / 2, cw = (Math.min(...ws) + Math.max(...ws)) / 2;
    q.bc = add(q.a, add(mul(q.ax[0], cu), mul(q.ax[2], cw)));
    q.br = Math.max(...q.poly!.map(([u, w]) => Math.hypot(u - cu, w - cw))) + q.th + q.ra;
    q.len = 1;
    return;
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
  q.sph = q.k === 0 && (q.l2 < 1e-4 || q.a2 < 0.05);
  if (q.sph && q.l2 >= 1e-4) {
    if (q.ra < q.rb) q.a = q.b;
    q.ra = Math.max(q.ra, q.rb);
  }
  q.il2 = q.sph ? 0 : 1 / q.l2;
  q.bc = q.sph ? q.a : lerpV(q.a, q.b, 0.5);
  q.br = q.sph ? q.ra : q.len / 2 + Math.max(q.ra, q.rb);
}
/** Крупная форма: ей одной даётся светлая кромка к свету. */
const bigPrim = (q: Prim) => (q.k === 2 ? true : q.k === 1 ? [...q.r].sort((a, b) => b - a)[1] >= 4.2 : Math.max(q.ra, q.rb) >= 3.4);

/** Расстояние до многоугольника на плоскости (И. Квилес), со знаком: внутри — минус. */
function sdPoly(v: [number, number][], px: number, py: number): number {
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2;
  let s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1];
    const wx = px - v[i][0], wy = py - v[i][1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
/** Расстояние от точки до отрезка на плоскости. */
function segDist(px: number, py: number, a: [number, number], b: [number, number]) {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const t = clamp(((px - a[0]) * ex + (py - a[1]) * ey) / (ex * ex + ey * ey || 1), 0, 1);
  return Math.hypot(px - a[0] - ex * t, py - a[1] - ey * t);
}

function sdPrim(q: Prim, x: number, y: number, z: number): number {
  const px = x - q.a[0], py = y - q.a[1], pz = z - q.a[2];
  if (q.k === 2) {
    const A = q.ax;
    const lu = px * A[0][0] + py * A[0][1] + pz * A[0][2];
    const lv = px * A[1][0] + py * A[1][1] + pz * A[1][2];
    const lw = px * A[2][0] + py * A[2][1] + pz * A[2][2];
    const d2 = sdPoly(q.poly!, lu, lw);
    // лезвие тоньше к кромке
    const dv = Math.abs(lv) - q.th * (1 - 0.45 * clamp(lu / q.umax, 0, 1));
    const ox = Math.max(d2, 0), oy = Math.max(dv, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(d2, dv), 0) - q.ra;
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
  if (q.k === 3) {
    // усечённый конус с плоскими торцами (И. Квилес), кромки скруглены на th
    const baba = q.l2;
    const paba = (px * q.ba[0] + py * q.ba[1] + pz * q.ba[2]) / baba;
    const xr = Math.sqrt(Math.max(0, px * px + py * py + pz * pz - paba * paba * baba));
    const ra = q.ra - q.th, rb = q.rb - q.th, rba = rb - ra;
    const cax = Math.max(0, xr - (paba < 0.5 ? ra : rb));
    const cay = Math.abs(paba - 0.5) - 0.5;
    const f = clamp((rba * (xr - ra) + paba * baba) / (rba * rba + baba), 0, 1);
    const cbx = xr - ra - f * rba, cby = paba - f;
    const s = cbx < 0 && cay < 0 ? -1 : 1;
    return s * Math.sqrt(Math.min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba)) - q.th;
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
  /** сдвиг тела: x — вправо от вожака, y — вперёд (в кадре — на целые пиксели) */
  root: V3;
  /** таз выше/ниже покоя (мир; в кадре — на целые пиксели) */
  bob: number;
  /** дыхание: подъём груди с плечами и головой и головы сверх груди — целые пиксели кадра */
  chest: number; headZ: number;
  /** корпус: наклон вперёд, разворот, крен (рад); таз: свой наклон и крен сверх половины крена корпуса */
  pitch: number; yaw: number; roll: number; ppitch: number; proll: number;
  /** голова относительно корпуса */
  hp: number; hy: number; hr: number;
  /** запястья в мире: [правое, левое]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** щиколотки в мире и наклон ступни (носок вверх > 0) */
  foot: [V3, V3]; toe: [number, number];
  /**
   * Топор в правой руке: направление древка (от торца к лезвию), куда смотрит кромка (вниз и вверх — axeEdge, вбок —
   * axeEdgeSide), хват — от торца до кулака. plant 1 — торец на земле (на высоте plantZ) прямо под кулаком, древко отвесно.
   * twoHand 1 — левая рука на древке ниже правой. drop 1 — топор выпал: лежит торцом в dropAt по dropDir, кромкой в dropEdge.
   */
  axeDir: V3; axeEdge: V3; axeEdgeSide: V3; axeGrip: number; plant: number; plantZ: number; twoHand: number;
  drop: number; dropAt: V3; dropDir: V3; dropEdge: V3;
  /**
   * подол плаща: сдвиг (мир, в кадре — на целые пиксели) и размах по ветру 0..1; drape 1 — лёжа на левом боку плащ
   * накрывает тело сверху (правый бок), а не стоит стенкой за спиной
   */
  cloak: V3; billow: number; drape: number;
  /** подъём руки целиком — целые пиксели кадра: «дрожь» в удержании без пересчёта руки */
  armLift: [number, number];
  /** рот открыт 0..1; моргание 0..1 */
  mouth: number; blink: number;
  /** факел в левой руке: 0 — нет, 1 — в руке; направление от кулака к огню; пламя 0..2 (нет, малое, полное) */
  torch: number; torchDir: V3; flame: number;
  /** пыль от шага [пр, лев] 0..1 (1 — касание); вспышка удара 0..1; пыль у лезвия 0..1; волны рыка 0..1; блик на лезвии */
  dust: [number, number]; flash: number; puff: number; roar: number; glint: number;
  /** вдох: штрихи воздуха ко рту, фаза (по кругу 0..1); −1 — нет */
  air: number;
  /** след: путь (мир) и чей — топора или факела */
  trail?: V3[]; trailKind?: "axe" | "fire";
  /** фаза кадра 0..1 и номер кадра — для частиц */
  t: number; seed: number;
}

/**
 * Высота таза в координатах корпуса: точки корпуса, головы и рук в позах заданы от неё. Ноги длиннее на LEGX — таз,
 * корпус, голова и запястья в мире выше на столько же (рост ≈ 54 px, юбка до середины бедра, силуэт клином).
 */
const HIP0 = 19.5;
const LEGX = 4.4;
const NECK: V3 = [0, 1.0, 36.4];
/** Длины костей: плечо и предплечье, бедро и голень. */
const ARM: [number, number] = [8.8, 8.4];
const LEG: [number, number] = [11.0, 10.7];
/** Древко от торца до верхнего конца; лезвие — у верхнего конца. */
const AXE_LEN = 38;
/** Лезвие: контур в плоскости (u — к кромке, w — вдоль древка от верхнего конца вниз). Бородовидное, с носком вверх. */
const BLADE: [number, number][] = ([
  [0.6, -1.6], [2.6, -2.7], [4.8, -1.0], [6.4, -2.2], [7.6, -4.9], [7.9, -7.4], [7.3, -9.9], [5.8, -12.2], [4.1, -11.3], [2.5, -9.7], [0.6, -9.1],
] as [number, number][]).map(([u, w]) => [u === 0.6 ? u : u * 1.15, w * 1.12] as [number, number]);
/** Кромка: отрезки контура от вершины i к i+1 (носок → борода). */
const BLADE_EDGE = [2, 3, 4, 5, 6];
/** Середина кромки — точка удара (u, w). */
const BLADE_HIT: [number, number] = [7.9 * 1.15, -7.4 * 1.12];
const BLADE_TOE: [number, number] = [4.8 * 1.15, -1.0 * 1.12];

const REST: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.05, yaw: 0, roll: 0, ppitch: 0, proll: 0, hp: -0.05, hy: 0, hr: 0,
  hand: [[15.0, 2.6, 21.0], [-12.6, 1.6, 20.0]], pole: [[0.9, -0.7, -0.1], [-0.9, -0.7, -0.1]],
  foot: [[4.8, 1.0, 2.6], [-4.8, -0.6, 2.6]], toe: [0, 0],
  axeDir: [0, 0, 1], axeEdge: [1, 0, 0], axeEdgeSide: [0, 1, 0], axeGrip: 20, plant: 1, plantZ: 0, twoHand: 0,
  drop: 0, dropAt: [0, 0, 0], dropDir: [1, 0, 0], dropEdge: [0, 0, 1],
  cloak: [0, 0, 0], billow: 1, drape: 0, armLift: [0, 0], mouth: 0, blink: 0, torch: 0, torchDir: [0, 0, 1], flame: 0,
  dust: [0, 0], flash: 0, puff: 0, roar: 0, glint: 0, air: -1, t: 0, seed: 1,
};
/** Покой в виде: вбок топор стоит перед вожаком (иначе древко режет корпус пополам), вниз и вверх — сбоку. */
function base(view: ZView): Pose {
  // вбок: топор на 2 px впереди груди (не перекрывает торс), ноги широкой стойкой — передняя вперёд, задняя назад
  return view === "side"
    ? { ...REST, hand: [[8.6, 10.9, 21.0], REST.hand[1]], pole: [[1, -0.3, -0.2], REST.pole[1]], foot: [[4.8, 3.4, 2.6], [-4.8, -2.4, 2.6]] }
    : REST;
}
/** Вбок: бедро и голень короче — в стойке колено почти прямое (вид сбоку не сутулится), в шаге сгибается. */
const LEG_SIDE: [number, number] = [10.4, 10.2];
/** Вбок: корпус выпрямлен (наклон назад сверх позы), голова поднята и отведена назад — осанка вожака, а не старика. */
const SIDE_PITCH = -0.1, SIDE_HP = -0.14;
/** Насколько поза стоячая (1 — стоит, 0 — лежит ничком): выпрямление и веер плаща вбок — только стоя, лёжа поза как есть. */
const upright = (p: Pose) => clamp((1.0 - p.pitch) / 0.8, 0, 1);

interface AxeAt { fist: V3; butt: V3; top: V3; ad: V3; ed: V3; bn: V3 }
/** Где топор: торец, верх древка, оси лезвия. */
function axePlace(p: Pose, view: ZView, fist: V3): AxeAt {
  let ad = norm(p.axeDir);
  let ed = perp(ad, view === "side" ? p.axeEdgeSide : p.axeEdge);
  let butt = sub(fist, mul(ad, p.axeGrip));
  if (p.plant > 0) {
    // торец на земле под кулаком, древко отвесно
    const pb: V3 = [fist[0], fist[1], p.plantZ];
    butt = lerpV(butt, pb, p.plant);
    ad = norm(lerpV(ad, [0, 0, 1], p.plant));
    ed = perp(ad, view === "side" ? p.axeEdgeSide : p.axeEdge);
  }
  if (p.drop > 0) {
    // выпал из руки: заваливается вокруг торца от того, как стоял, к лежащему в dropAt по dropDir кромкой в dropEdge
    const t = Math.min(1, p.drop);
    butt = lerpV(butt, p.dropAt, t);
    const ed0 = ed;
    ad = norm(lerpV(ad, norm(p.dropDir), t));
    ed = perp(ad, lerpV(ed0, norm(p.dropEdge), t));
  }
  const top = add(butt, mul(ad, AXE_LEN));
  return { fist, butt, top, ad, ed, bn: cross(ad, ed) };
}
/** Точка лезвия (u, w) в мире. */
const bladePt = (a: AxeAt, uw: [number, number]): V3 => add(a.top, add(mul(a.ed, uw[0]), mul(a.ad, uw[1])));

/** Скелет позы: точки корпуса, плеч, кулаков, топора — общий для модели и для следа удара. */
interface Rig {
  p: Pose; pel: V3;
  T: (v: V3, lift?: boolean) => V3; TV: (v: V3) => V3; PV: (v: V3) => V3; PR: (v: V3) => V3; H: (v: V3) => V3; HV: (v: V3) => V3;
  sh: [V3, V3]; wr: [V3, V3]; el: [V3, V3]; fist: [V3, V3]; axe: AxeAt;
}
function rig(p0: Pose, view: ZView): Rig {
  // вбок: корпус чуть, голова сильнее повёрнуты к зрителю (три четверти) — видны грудь, лицо и борода перед мехом
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.22, hy: p0.hy - 0.38, pitch: p0.pitch + SIDE_PITCH * upright(p0), hp: p0.hp + SIDE_HP * upright(p0) } : p0;
  const pel: V3 = add([0, 0, HIP0 + LEGX], snapPx(view, [p.root[0], p.root[1], p.bob + p.root[2]]));
  const up = p.chest * PX, hz = p.headZ * PX;
  /** Запястья поз заданы от корпуса: в мире выше на LEGX. */
  const hand: [V3, V3] = [add(p.hand[0], [0, 0, LEGX]), add(p.hand[1], [0, 0, LEGX])];
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  /** Точка корпуса: верх тела (выше пояса) поднимается при вдохе целиком — жёстко, без растяжения. */
  const T = (v: V3, lift = v[2] >= 25): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PR = (v: V3): V3 => rot(v, p.ppitch, p.yaw * 0.35, p.roll * 0.5 + p.proll);
  const PV = (v: V3): V3 => add(pel, PR(sub(v, [0, 0, HIP0])));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const lift = (i: number) => pxToWorld(view, 0, -p.armLift[i]);
  const shoulder = (s: number, i: number) => add(T([s * 10.4, 0.2, 33.2]), lift(i));
  const arm = (i: number, s: number, w: V3) => {
    const sh = shoulder(s, i);
    const wr = add(w, lift(i));
    const el = ik(sh, wr, ARM[0], ARM[1], p.pole[i]);
    const fist = add(wr, mul(norm(sub(wr, el)), 1.5));
    return { sh, wr, el, fist };
  };
  const rA = arm(0, 1, hand[0]);
  const axe = axePlace(p, view, rA.fist);
  let wl = hand[1];
  if (p.twoHand > 0) {
    // левая рука на древке ниже правой
    const tgt = sub(rA.fist, mul(axe.ad, 5.0));
    const shL = shoulder(-1, 1);
    const wt = add(tgt, mul(norm(sub(shL, tgt)), 1.5));
    wl = lerpV(wl, sub(wt, lift(1)), p.twoHand);
  }
  const lA = arm(1, -1, wl);
  return { p, pel, T, TV, PV, PR, H, HV, sh: [rA.sh, lA.sh], wr: [rA.wr, lA.wr], el: [rA.el, lA.el], fist: [rA.fist, lA.fist], axe };
}

/** Вожак в координатах модели. */
function raider(p0: Pose, view: ZView): Scene {
  const S = new Scene();
  const G = rig(p0, view);
  const { p, T, TV, PV, PR, H, HV } = G;
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, 0, roll)), f(rot([0, 1, 0], pitch, 0, roll)), f(rot([0, 0, 1], pitch, 0, roll)),
  ];
  const sides: [number, number][] = [[0, 1], [1, -1]];

  // ---------- корпус клином: широкая грудь и спина, узкий живот ----------
  const gBody = S.group(2.0);
  S.cone(gBody, PV([0, 0.3, 20.6]), 4.9, T([0, 0.5, 26.8]), 6.2, { seed: 1 });
  S.ell(gBody, T([0, 0.7, 30.8]), [9.2, 5.2, 5.2], axes(TV), { seed: 2 });
  S.ell(gBody, T([0, -1.5, 33.0]), [8.0, 4.4, 3.8], axes(TV), { seed: 3 });
  S.cone(gBody, T([0, 0.9, 34.0]), 3.0, T([0, 1.0, 37.0]), 2.6, { seed: 4 });
  // грудные мышцы — отдельные детали: под ними шов тоном тени
  for (const s of [-1, 1]) S.ell(gBody, T([s * 4.2, 3.5, 31.6]), [4.4, 2.4, 3.0], axes((v) => TV(rot(v, 0, s * 0.3))), { part: S.newPart(), seed: 8 });

  // ---------- пояс с бронзовой пряжкой и кожаная юбка полосами до середины бедра ----------
  const gBelt = S.group(0);
  S.capped(gBelt, PV([0, 0.3, 21.0]), 5.7, PV([0, 0.4, 23.2]), 5.9, 0.6, { mat: M_LEATHER, tone: -0.2, seed: 5 });
  S.ell(gBelt, PV([0, 5.9, 22.1]), [1.8, 0.9, 1.4], axes(PR), { mat: M_BRONZE, part: S.newPart(), seed: 6 });
  const gKilt = S.group(1.0);
  S.capped(gKilt, PV([0, 0.3, 21.6]), 5.6, PV([0, 0.6, 13.6]), 6.9, 0.8, { mat: M_LEATHER, tex: 1, ng: 9, tone: -0.2, seed: 7 });

  // ---------- ноги: шерстяные штаны, сапоги с меховой опушкой ----------
  for (const [i, s] of sides) {
    const g = S.group(1.0);
    const hip = PV([s * 3.5, 0.2, 18.6]);
    const an = p.foot[i];
    const LG = view === "side" ? LEG_SIDE : LEG;
    const kn = ik(hip, an, LG[0], LG[1], PR([s * 0.12, 1, 0.05]));
    S.cone(g, hip, 3.2, kn, 2.8, { mat: M_CLOTH, seed: 30 + i });
    const mid = lerpV(kn, an, 0.36);
    S.cone(g, kn, 2.8, mid, 2.7, { mat: M_CLOTH, seed: 32 + i });
    const pBoot = S.newPart();
    S.cone(g, mid, 2.8, an, 2.4, { mat: M_LEATHER, part: pBoot, seed: 34 + i });
    S.ell(g, mid, [3.7, 3.7, 1.9], frameAlong(sub(kn, an)), { mat: M_FUR, part: S.newPart(), tex: 2, seed: 36 + i });
    const fc = add(an, rot([0, 1.3, -1.2], p.toe[i], 0));
    S.ell(g, fc, [2.6, 3.8, 1.7], axes((v) => v, 0, p.toe[i]), { mat: M_LEATHER, part: pBoot, seed: 38 + i });
  }

  // ---------- руки: могучие плечи, бронзовые наручи, кулаки ----------
  for (const [i, s] of sides) {
    const g = S.group(1.1);
    S.armG[i] = g;
    const sh = G.sh[i], el = G.el[i], wr = G.wr[i];
    S.ball(g, add(sh, TV([s * 0.6, 0, 0.6])), 3.9, { seed: 20 + i });
    S.cone(g, sh, 3.5, el, 2.8, { seed: 22 + i });
    S.cone(g, el, 2.9, wr, 2.3, { bands: [[0.52, 0.9]], bandMat: M_BRONZE, seed: 24 + i });
    S.ell(g, G.fist[i], [2.3, 2.1, 2.5], frameAlong(sub(wr, el)), { part: S.newPart(), seed: 26 + i });
  }

  // ---------- топор: древко с бронзовыми кольцами, железная обойма, широкое бородовидное лезвие ----------
  {
    const A = G.axe;
    const g = S.group(0);
    S.axeG = g;
    S.cone(g, A.butt, 0.95, sub(A.top, mul(A.ad, 1.0)), 0.95, { mat: M_WOOD, bands: [[0, 0.04], [0.44, 0.49]], bandMat: M_BRONZE, seed: 60 });
    const pHead = S.newPart();
    S.cone(g, sub(A.top, mul(A.ad, 9.6)), 1.5, sub(A.top, mul(A.ad, 1.4)), 1.5, { mat: M_IRON, part: pHead, tone: -0.5, seed: 61 });
    S.cone(g, sub(A.top, mul(A.ad, 1.4)), 1.1, add(A.top, mul(A.ad, 1.6)), 0.4, { mat: M_IRON, part: pHead, seed: 62 });
    S.blade(g, A.top, [A.ed, A.bn, A.ad], BLADE, 0.42, 0.42, BLADE_EDGE, { mat: M_IRON, part: S.newPart(), seed: 63 });
    if (p.glint > 0.5) S.glint = bladePt(A, BLADE_TOE);
  }

  // ---------- факел в левой руке ----------
  if (p.torch > 0.5) {
    const g = S.group(0);
    const td = norm(p.torchDir);
    const f = G.fist[1];
    const tip = add(f, mul(td, 6.4));
    S.cone(g, sub(f, mul(td, 2.6)), 0.7, tip, 0.8, { mat: M_WOOD, seed: 70 });
    S.cone(g, tip, 1.3, add(tip, mul(td, 1.8)), 1.3, { mat: M_LEATHER, part: S.newPart(), tone: -0.7, seed: 71 });
    if (p.flame > 0.2) S.flames.push({ at: add(tip, mul(td, 2.2)), size: p.flame, ph: p.seed });
  }

  // ---------- меховая накидка: толстый валик вокруг шеи и по плечам ----------
  const gFur = S.group(1.4);
  const fur: [V3, number][] = [
    [[10.0, 0.4, 36.0], 3.3], [[7.0, -2.6, 37.4], 3.6], [[2.5, -4.3, 38.0], 3.7], [[-2.5, -4.3, 38.0], 3.7],
    [[-7.0, -2.6, 37.4], 3.6], [[-9.6, 0.4, 36.2], 3.1], [[7.0, 1.0, 36.4], 2.6], [[-7.0, 1.0, 36.4], 2.6], [[12.4, 0.6, 34.4], 2.6],
  ];
  fur.forEach(([c, r], k) => S.ball(gFur, T(c, true), r, { mat: M_FUR, tex: 2, seed: 10 + k }));
  // клочья: рваный край накидки по плечам и сверху
  const tufts: V3[] = [[13.4, 0.2, 37.0], [11.0, -1.6, 39.6], [8.0, -4.2, 40.6], [4.2, -6.2, 41.2], [-4.2, -6.2, 41.2], [-8.0, -4.2, 40.6], [14.6, 1.8, 33.0], [9.2, 1.4, 38.6], [-9.2, 1.4, 38.6]];
  tufts.forEach((c, k) => S.ball(gFur, T(c, true), 1.5 + 0.4 * hash01(k, 3, 7), { mat: M_FUR, tex: 2, seed: 20 + k }));

  // ---------- бронзовый наплечник на левом плече: купол, нижний пласт, выпуклая шишка ----------
  const gPld = S.group(0.6);
  S.ell(gPld, T([-11.6, 0.2, 36.6], true), [5.2, 4.8, 3.0], axes(TV, -0.5), { mat: M_BRONZE, seed: 14 });
  // нижний пласт — отдельной деталью: шов под куполом
  S.ell(gPld, T([-14.0, 0.2, 33.4], true), [3.4, 4.4, 2.0], axes(TV, -0.9), { mat: M_BRONZE, part: S.newPart(), seed: 15 });
  // выпуклая шишка узора — своя группа: отдельный бугор со светом и тенью
  S.ball(S.group(0), T([-11.2, 2.6, 39.0], true), 1.35, { mat: M_BRONZE, seed: 16 });

  // ---------- голова: лицо, челюсть, нос ----------
  const gHead = S.group(1.0);
  const h = (x: number, y: number, z: number) => H([x, y, z]);
  S.ell(gHead, h(0, 1.2, 41.2), [4.0, 4.0, 4.7], axes(HV), { layer: 1, seed: 40 });
  S.ell(gHead, h(0, 2.0, 38.4), [3.3, 3.0, 2.2], axes(HV), { layer: 1, seed: 41 });
  S.cone(gHead, h(0, 4.8, 41.6), 0.85, h(0, 6.1, 39.7), 1.15, { part: S.newPart(), layer: 1, seed: 42 });

  // ---------- седые волосы: высокий голый лоб, волосы зачёсаны назад, космы по спине — одна деталь без швов ----------
  // всё в слое головы: двигается только с головой, на целые пиксели; пряди гривы — чередованием тона, без тёмных бороздок
  const gHair = S.group(1.2);
  const pHair = S.newPart();
  // шапка волос: от линии волос над лбом назад к затылку (лоб и темя спереди — кожа)
  S.ell(gHair, h(0, -1.5, 42.7), [4.3, 4.0, 4.4], axes(HV, 0, -0.55), { mat: M_HAIR, part: pHair, layer: 1, seed: 43 });
  // виски за скулами: короткие пряди назад-вниз, сходятся с бородой у челюсти
  for (const s of [-1, 1]) S.cone(gHair, h(s * 3.6, -1.6, 42.6), 1.5, h(s * 3.8, -1.2, 38.8), 1.2, { mat: M_HAIR, part: pHair, layer: 1, seed: 44 });
  // грива: от затылка по спине поверх меха, к концам уже — три пряди внахлёст, средняя светлее и длиннее
  [-2.0, 0, 2.0].forEach((x, k) => {
    const tone = k === 1 ? 0.3 : -0.25;
    const a = h(x * 0.8, -3.8, 41.2), m = h(x * 0.8, -8.0, 36.8), e = h(x * 0.55, -9.4, k === 1 ? 31.0 : 32.6);
    S.cone(gHair, a, 2.2, m, 1.7, { mat: M_HAIR, part: pHair, tone, layer: 1, seed: 45 + k });
    S.cone(gHair, m, 1.7, e, 0.6, { mat: M_HAIR, part: pHair, tone, layer: 1, seed: 48 + k });
  });

  // ---------- борода до середины груди: одна светлая деталь в слое головы; тёмное — только снизу и с теневой стороны ----------
  const gBeard = S.group(1.1);
  const pBeard = S.newPart();
  const bo = { mat: M_HAIR, part: pBeard, tex: 3, ng: 3, layer: 1 };
  // середина: от подбородка к острию на груди
  S.cone(gBeard, h(0, 4.6, 37.6), 2.5, h(0, 6.8, 33.6), 2.1, { ...bo, seed: 50 });
  S.cone(gBeard, h(0, 6.8, 33.6), 2.1, h(0, 7.3, 30.6), 0.9, { ...bo, seed: 51 });
  // бока: от скул, клином к острию
  for (const s of [-1, 1]) {
    S.cone(gBeard, h(s * 2.6, 3.2, 38.6), 1.7, h(s * 1.9, 6.4, 34.4), 1.6, { ...bo, seed: 52 });
    S.cone(gBeard, h(s * 1.9, 6.4, 34.4), 1.6, h(s * 0.7, 7.1, 31.4), 0.9, { ...bo, seed: 53 });
    // бакенбарды: от висков к скулам
    S.cone(gBeard, h(s * 3.6, 1.0, 40.0), 1.2, h(s * 2.9, 2.6, 38.2), 1.5, { ...bo, seed: 54 });
  }
  // усы: от носа в стороны и вниз, светлее бороды
  for (const s of [-1, 1]) S.cone(gBeard, h(s * 0.4, 5.6, 39.3), 0.95, h(s * 2.6, 5.4, 37.4), 0.8, { ...bo, tone: 0.35, seed: 66 });

  // ---------- красный плащ: одно полотнище от плеч до икр; складки — полосами тона, подол — одна волнистая кромка ----------
  // 9 прядей одной детали внахлёст (соседи ближе двух радиусов на любой высоте) — без просветов и контуров между ними;
  // через одну прядь чуть глубже — складка
  const gCloak = S.group(2.6);
  const lag = snapPx(view, p.cloak);
  const bw = p.billow;
  const pCloak = S.newPart();
  // вниз видна подкладка за спиной: она ловит свет — иначе «один яркий красный мазок» в главном виде уходит в тень
  const lining = view === "down" ? 0.55 : 0;
  const NCL = 9;
  const dr = p.drape;
  for (let k = 0; k < NCL; k++) {
    const u = k / (NCL - 1);
    /** Точка полотнища: висит за спиной (x поперёк, y — назад) или, лёжа, накрывает правый бок (поперёк — от спины к груди). */
    const cl = (x: number, y: number, z: number, xd: number): V3 => [lerp(x, xd, dr), lerp(y, lerp(-7.5, 2.5, u), dr), z];
    const xs = lerp(-7.4, 7.4, u);
    const left = Math.max(0, -xs / 7.4);
    const deep = k % 2 ? 1.3 : 0;
    // вбок полотнище висит с плеч, а не стоит плитой: середина и подол отходят от спины на 2–3 px, пряди веером — дальние
    // по глубине уходят назад и выше, подол косой волной назад-вверх (в этом виде пряди различаются только глубиной)
    const sd = view === "side" ? (1 - dr) * upright(p0) : 0;
    const fan = 0.5 + 0.5 * Math.sin(u * 7.0 + 0.4);
    const top = T(cl(xs, -6.3 - deep * 0.3 - sd * 0.4, 35.0, 8.6 + deep * 0.4), true);
    const mid = PV(cl(xs * 1.12 - bw * (1.0 + 2.2 * left), -8.0 - deep - bw * 1.0 - sd * (1.6 + 0.9 * fan), 19.0 + bw * 1.4 * left, 7.8 + deep * 0.5));
    // подол: одна волнистая кромка
    const hem = 0.8 * Math.sin(u * 9.4 + 0.6);
    const bot = add(PV(cl(xs * 1.3 - bw * (2.2 + 4.6 * left), -9.0 - deep - bw * 2.0 - sd * (2.6 + 2.8 * fan), 4.6 + hem + bw * 3.6 * left + sd * (0.8 + 3.4 * fan), 6.6 + deep * 0.5)), lag);
    // лёжа полотнище тоньше: ткань на теле, а не бревно
    const th = 1 - 0.32 * dr;
    S.cone(gCloak, top, 2.1 * th, mid, 2.4 * th, { mat: M_RED, part: pCloak, tone: lining, seed: 80 + k });
    S.cone(gCloak, mid, 2.4 * th, bot, 2.4 * th, { mat: M_RED, part: pCloak, tone: lining, seed: 90 + k });
  }

  // ---------- лицо (штамп у переносицы) и рот ----------
  S.stamps.push({ kind: "face", at: h(0, 5.0, 41.7), n: HV([0, 1, 0]), blink: p.blink });
  if (p.mouth > 0.5) S.stamps.push({ kind: "mouth", at: h(0, 5.4, 38.6), n: HV([0, 1, 0]) });
  if (p.roar > 0.02) S.roar = { at: h(0, 6.0, 38.6), k: p.roar };
  if (p.air >= 0) S.air = { at: h(0, 5.8, 38.8), k: p.air };

  particles(S, p, G);
  return S;
}

/** Частицы: пыль от шага, след удара, пыль и вспышка у лезвия. */
function particles(S: Scene, p: Pose, G: Rig) {
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) S.puffs.push({ c: [p.foot[i][0], p.foot[i][1] + 1, 0], k: p.dust[i], seed: i });
  if (p.trail && p.trail.length > 1) {
    const fire = p.trailKind === "fire";
    S.smears.push({ pts: p.trail, groups: fire ? [S.armG[1]] : [S.axeG, S.armG[0], S.armG[1]], pal: fire ? FIRESMEAR : SMEAR });
  }
  const hit = bladePt(G.axe, BLADE_HIT);
  if (p.puff > 0.02) S.puffs.push({ c: [hit[0], hit[1] + 1, 0], k: p.puff, seed: 30 });
  if (p.flash > 0.02) S.flash = { at: [hit[0], hit[1] + 1, Math.max(1.2, hit[2])], k: p.flash };
  if (p.puff > 0.5) {
    // комья земли из-под лезвия
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI + 0.4;
      const f = 1 - p.puff;
      S.motes.push({ p: [hit[0] + Math.cos(ang) * (2 + 5 * f), hit[1] + Math.sin(ang) * 2, 1.5 + 6 * f * (1 - f) * 2.2], col: DUST[1], dark: DUST[0], size: 2 });
    }
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

/** Тень от света: луч из точки к свету задевает другие детали (only ≥ 0 — только детали этого слоя). */
function shadowAt(prims: Prim[], gk: number[], cand: Int32Array, p: V3, n: V3, only = -1): boolean {
  const o = add(p, add(mul(n, 0.7), mul(LIGHT, 0.5)));
  let nc = 0;
  for (let i = 0; i < prims.length; i++) {
    const q = prims[i];
    if (only >= 0 && q.layer !== only) continue;
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

/** Текстурные координаты точки на примитиве: u — вдоль оси, ang — вокруг неё, l — местные координаты. */
function texAt(q: Prim, p: V3): { u: number; ang: number; l: V3 } {
  const pa = sub(p, q.a);
  if (q.k === 1 || q.k === 2) {
    const l: V3 = [dot(pa, q.ax[0]), dot(pa, q.ax[1]), dot(pa, q.ax[2])];
    return q.k === 1 ? { u: l[2] / q.r[2], ang: Math.atan2(l[1] / q.r[1], l[0] / q.r[0]), l } : { u: l[0] / q.umax, ang: 0, l };
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
  const bevel = new Uint8Array(N * N);
  const cand = new Int32Array(prims.length);
  for (let i = 0; i < N * N; i++) {
    const pi = gb.prim[i];
    if (pi < 0) continue;
    const q = prims[pi];
    const n: V3 = [gb.n[i * 3], gb.n[i * 3 + 1], gb.n[i * 3 + 2]];
    const p: V3 = [gb.p[i * 3], gb.p[i * 3 + 1], gb.p[i * 3 + 2]];
    let mat = q.mat;
    const tx = texAt(q, p);
    if (q.bands) for (const [b0, b1] of q.bands) if (tx.u >= b0 && tx.u <= b1) mat = q.bandMat;
    const md = MATS[mat];
    const lum = dot(n, LIGHT);
    L.lum[i] = lum;
    let tn = md.base + md.gain * lum + (mat === q.mat ? q.tone : 0);
    // слой головы затеняется только сам собой: грудь и мех, поднимаясь при вдохе, не пересчитывают тона лица и седины
    const only = q.layer === 1 ? 1 : -1;
    if (shadowAt(prims, gk, cand, p, n, only)) tn -= md.sh ?? 1.0;
    // затенение складок; где закрыто с обеих проб — глубокая щель
    let ao = 0;
    for (const hh of [1.1, 2.4]) {
      const ps = add(p, mul(n, hh));
      let nc = 0;
      for (let k = 0; k < prims.length; k++) {
        const qq = prims[k];
        if (only >= 0 && qq.layer !== only) continue;
        if (vlen(sub(qq.bc, ps)) < qq.br + hh + gk[qq.g]) cand[nc++] = k;
      }
      const d = sdScene(prims, gk, cand, nc, ps[0], ps[1], ps[2]);
      ao += Math.max(0, hh - d) / hh;
    }
    tn -= ao * (md.ao ?? 0.45);
    // складки плаща — только полосами тона: почти чёрной щели (она читается как контур между «трубами») у красного нет
    deep[i] = ao > 1.3 && mat !== M_RED && mat !== M_HAIR ? 1 : 0;
    // лезвие: светлая заточка вдоль кромки, к обуху — темнее
    if (q.k === 2) {
      const lu = tx.l[0], lw = tx.l[2];
      let de = 1e9;
      for (const e of q.edge ?? []) de = Math.min(de, segDist(lu, lw, q.poly![e], q.poly![e + 1]));
      if (de < 1.25) {
        bevel[i] = 1;
        tn = lum > -0.05 ? 4.2 : 3.2;
      } else tn += (lu / q.umax) * 0.9 - 0.45;
    }
    tn = Math.min(tn, md.hi + 0.49);
    tn = Math.max(tn, (deep[i] ? md.lo - 1 : md.lo) - 0.4);
    tone[i] = tn;
    L.mat[i] = mat;
    L.part[i] = q.part;
    // полосы кожаной юбки: линии уровня вокруг оси, только где поверхность смотрит на зрителя
    if (q.tex === 1 && mat === q.mat) {
      const facing = n[1] * CS + n[2] * SN;
      gcoord[i] = (tx.ang * q.ng) / TAU;
      gok[i] = facing > 0.3 ? 1 : 0;
      ulen[i] = tx.u * q.len;
    }
    // пряди седины: линии вдоль пряди (вокруг её оси), только на обращённом к зрителю
    if (q.tex === 3 && mat === q.mat) {
      const facing = n[1] * CS + n[2] * SN;
      gcoord[i] = (tx.ang * q.ng) / TAU;
      gok[i] = facing > 0.15 ? 3 : 0;
      ulen[i] = tx.u * q.len;
    }
    // мех: кромки клочьев — линии уровня волнистого поля в местных координатах
    if (q.tex === 2 && mat === M_FUR) {
      const l = sub(p, q.a);
      const sd = q.seed;
      gcoord[i] = (Math.sin(l[0] * 1.5 + sd) + Math.sin(l[1] * 1.2 + l[2] * 1.1 + sd * 2) + Math.sin(l[2] * 1.6 - l[0] * 0.8 + sd)) * 0.9;
      gok[i] = tn > 1.9 ? 2 : 0;
      ulen[i] = 0;
    }
  }
  // сглаживание тона внутри детали: ровные границы светотени без зубцов (заточку лезвия не трогает)
  {
    const src = new Float32Array(tone);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0 || bevel[i]) continue;
      let sum = src[i] * 4, w = 4;
      for (const [dx, dy, k] of [[1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2], [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const j = yy * N + xx;
        if (gb.prim[j] < 0 || L.part[j] !== L.part[i] || L.mat[j] !== L.mat[i] || bevel[j]) continue;
        sum += src[j] * k;
        w += k;
      }
      tone[i] = sum / w;
    }
  }
  // второй проход: полосы, швы между деталями, светлая кромка к свету
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
      else if (crossed && gok[i] === 3) {
        // прядь — на тон темнее, только в светлых тонах (седина остаётся светлой), длинными отрезками
        const k = Math.round(gcoord[i]);
        const seg = Math.floor(ulen[i] / 6 + hash01(k, 7, 19) * 3);
        if (tone[i] > 2.8 && hash01(k, seg, 43 + prims[gb.prim[i]].seed) > 0.3) tn -= 0.75;
      } else if (crossed && tone[i] > 1.6 && tone[i] < 3.4) {
        // полоса — только в полутонах; длинные отрезки с редкими разрывами
        const k = Math.round(gcoord[i]);
        const seg = Math.floor(ulen[i] / 16 + hash01(k, 5, 17) * 3);
        if (hash01(k, seg, 31 + prims[gb.prim[i]].seed) > 0.25) tn -= 1.0;
      }
    }
    if (!edge && !bevel[i]) {
      // шов: соседняя деталь ближе к зрителю — тон тени (selout); почти чёрный — только в глубокой щели (ниже)
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
      if (rimL && bigPrim(q) && L.lum[i] > 0.2 && tn > 1.2 && !bevel[i]) tn = Math.max(tn, Math.min(tn + 1, 3.45));
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

/** Одиночный пиксель (ни одного соседа того же тона и материала в 8 направлениях) принимает тон большинства соседей. */
function despeckle(L: Look, gb: GBuf) {
  for (let pass = 0; pass < 2; pass++) {
    const src = new Int8Array(L.idx);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0 || L.mat[i] === M_IRON) continue;
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

// ---------------- штампы: брови, глаза, рот ----------------
/**
 * Рисунки в целых пикселях от точки привязки (dx вправо, dy вниз). Ключи: B — седая бровь, E — глаз, S — тень глазницы
 * (моргание), t — зубы, M — глотка. Лицо привязано к переносице на линии глаз: густые брови «\ /» над глазами.
 */
type StampPx = [number, number, string];
const rows = (rs: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  rs.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") out.push([x0 + i, y0 + j, ch]); }));
  return out;
};
/** Вниз: лицом к зрителю (переносица — между столбцами −1 и 0). */
const ST_FACE_DOWN = rows([
  "BB..BB",
  ".E..E.",
], -3, -1);
/** Вбок (три четверти, лицом вправо): ближний глаз под бровью, дальний — у переносицы. */
const ST_FACE_SIDE = rows([
  "BBB",
  ".E.",
], -3, -1);
const ST_MOUTH_DOWN = rows([".tt.", "MMMM", ".MM."], -2, 0);
const ST_MOUTH_SIDE = rows(["tt", "MM", "M."], 0, 0);

function stampOf(st: Stamp, view: ZView): StampPx[] {
  if (view === "up") return [];
  if (st.kind === "mouth") return view === "side" ? ST_MOUTH_SIDE : ST_MOUTH_DOWN;
  return view === "side" ? ST_FACE_SIDE : ST_FACE_DOWN;
}

function drawStamps(body: PC, sc: Scene, view: ZView, gb: GBuf) {
  for (const st of sc.stamps) {
    const a = toView(view, st.at), nv = toView(view, st.n);
    if (nv[1] * CS + nv[2] * SN < 0.12) continue;
    const [sx, sy] = scr(a);
    const ax = Math.floor(sx), ay = Math.floor(sy);
    if (ax < 0 || ay < 0 || ax >= N || ay >= N) continue;
    const i0 = ay * N + ax;
    if (gb.prim[i0] < 0 || gb.t[i0] < depthOf(a) - 2.4) continue;
    for (const [dx, dy, key] of stampOf(st, view)) {
      const x = ax + dx, y = ay + dy;
      if (x < 0 || y < 0 || x >= N || y >= N || gb.prim[y * N + x] < 0) continue;
      const col = key === "B" ? HAIR[4] : key === "E" ? ((st.blink ?? 0) > 0.5 ? SKIN[1] : EYE) : key === "S" ? SKIN[1] : key === "t" ? TEETH : MOUTH;
      body.set(x, y, col);
    }
  }
}

/**
 * Прозрачные «проколы» внутри силуэта без выхода к краю кадра — до 3 px, а также щели шириной 1 px длиной до 12 px
 * (между рукой и телом: иначе читаются как светлая царапина между двумя контурами): у тела — цветом контура,
 * в собранном кадре — цветом большинства соседей.
 */
function sealPinholes(c: PC, byNeighbors = false) {
  const W = c.w;
  for (const comp of holes(c)) {
    if (comp.length > 3 && !isSlit(comp, W)) continue;
    for (const j of comp) {
      const x = j % W, y = (j / W) | 0;
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

/** Замкнутые прозрачные области внутри силуэта (без выхода к краю кадра): индексы пикселей каждой области. */
function holes(c: PC): number[][] {
  const W = c.w, Hh = c.h;
  const A = (x: number, y: number) => c.alpha(x, y) >= 128;
  const seen = new Uint8Array(W * Hh);
  const stack: number[] = [];
  const near = (i: number, f: (j: number) => void) => {
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) continue;
      const j = yy * W + xx;
      if (seen[j] || A(xx, yy)) continue;
      seen[j] = 1;
      f(j);
    }
  };
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    if ((x === 0 || y === 0 || x === W - 1 || y === Hh - 1) && !A(x, y)) { seen[y * W + x] = 1; stack.push(y * W + x); }
  }
  while (stack.length) near(stack.pop()!, (j) => stack.push(j));
  const out: number[][] = [];
  for (let i = 0; i < W * Hh; i++) {
    if (seen[i] || A(i % W, (i / W) | 0)) continue;
    const comp: number[] = [i];
    seen[i] = 1;
    for (let k = 0; k < comp.length; k++) near(comp[k], (j) => comp.push(j));
    out.push(comp);
  }
  return out;
}

/** Щель шириной 1 px (прямая или ступенькой) длиной до 12 px: компонента — индексы пикселей в кадре шириной W. */
function isSlit(comp: number[], W: number): boolean {
  const xs = comp.map((j) => j % W), ys = comp.map((j) => (j / W) | 0);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  return Math.max(w, h) <= 12 && (Math.min(w, h) === 1 || comp.length <= Math.max(w, h) + 1);
}

/** Кадр вожака в виде view. */
function renderRaider(view: ZView, pose: Pose): PC {
  const sc = raider(pose, view);
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
  body.outline(OUT);
  sealPinholes(body);

  // ---------- сборка: тело, след удара позади руки и топора, пыль, частицы, вспышка, пламя, волны рыка ----------
  const out = new PC(N, N);
  out.blit(body, 0, 0);
  for (const sm of sc.smears) drawSmear(out, sm, view, gb, prims);
  for (const f of sc.puffs) drawPuff(out, f, view);
  for (const m of sc.motes) drawMote(out, m, view, gb);
  if (sc.flash) drawFlash(out, sc.flash, view);
  for (const f of sc.flames) drawHandFlame(out, f, view, gb);
  if (sc.roar) drawRoar(out, sc.roar, view);
  if (sc.air) drawAir(out, sc.air, view);
  if (sc.glint) drawGlint(out, sc.glint, view);
  sealPinholes(out, true);
  return out;
}

/** Плоский клуб пыли у земли: 2–3 непрозрачных тона, низ тёмный; расходится в стороны и тает по клубу. */
function drawPuff(o: PC, f: Puff, view: ZView) {
  const [cx, cy0] = toScreen(view, f.c);
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
  if (x < 1 || y < 1 || x >= N - 2 || y >= N - 2) return;
  const i = y * N + x;
  if (gb.prim[i] >= 0 && gb.t[i] < depthOf(p) - 0.5) return;
  o.set(x, y, m.col);
  if ((m.size ?? 1) > 1) o.set(x + 1, y, m.col);
  if (m.dark) o.set(x + ((m.size ?? 1) > 1 ? 1 : 0), y + 1, m.dark);
}

/**
 * След удара: чёткий серп в 3 тона по пути лезвия — позади руки и топора (их пиксели и контур не трогает), светлая
 * кромка — с внешней стороны дуги, к хвосту серп сужается до пикселя. Где тело ближе к зрителю, чем путь лезвия
 * (вверх — размах проходит перед вожаком, за его спиной для камеры), серп скрыт телом.
 */
function drawSmear(o: PC, sm: { pts: V3[]; groups: number[]; pal: Ramp }, view: ZView, gb: GBuf, prims: Prim[]) {
  const pts = sm.pts.map((v) => toScreen(view, v));
  const dep = sm.pts.map((v) => depthOf(toView(view, v)));
  const own = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && sm.groups.includes(prims[gb.prim[i]].g)) own[i] = 1;
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && own[yy * N + xx]) return true;
    }
    return false;
  };
  const total = pts.length - 1;
  const put = new Map<number, number>();
  const hidden = new Set<number>();
  for (let k = 0; k < total; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
    const dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy) || 1;
    let nx = -dy / dl, ny = dx / dl;
    if (nx * (x0 - CX) + ny * (y0 - 36) < 0) { nx = -nx; ny = -ny; }
    for (let s = 0; s <= steps; s++) {
      const u = (k + s / steps) / total;
      const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
      const w = 0.4 + 2.0 * Math.sin(Math.PI * Math.min(1, u * 0.62 + 0.06));
      for (let j = -w; j <= w + 0.01; j += 0.5) {
        const xx = Math.round(x + nx * j), yy = Math.round(y + ny * j);
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const tone = j > w - 0.9 ? 2 : j < -w + 0.9 ? 0 : 1;
        const id = yy * N + xx;
        const d = lerp(dep[k], dep[k + 1], s / steps);
        if (gb.prim[id] >= 0 && gb.t[id] < d - 1.5) hidden.add(id);
        put.set(id, Math.max(put.get(id) ?? -1, tone));
      }
    }
  }
  for (const [id, tone] of put) {
    const x = id % N, y = (id / N) | 0;
    if (near(x, y) || hidden.has(id)) continue;
    o.set(x, y, sm.pal[tone]);
  }
}

/** Вспышка удара: один кадр, крестом с короткими лучами по диагоналям — непрозрачные пиксели в 3 тона. */
function drawFlash(o: PC, f: { at: V3; k: number }, view: ZView) {
  const [sx, sy] = toScreen(view, f.at);
  const x = Math.floor(sx), y = Math.floor(Math.min(sy, 60));
  const L = Math.round(2 + 3 * f.k);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 2 : r <= L - 1 ? 1 : 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) o.set(x + dx * r, y + dy * Math.min(r, 2), FLASH[tone]);
  }
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (f.k > 0.5) o.set(x + dx * 2, y + dy, FLASH[0]);
  o.set(x, y, FLASH[2]);
}

/** Блик на носке лезвия: звёздочка 5 px (кадр «топор занесён — сейчас ударит»). */
function drawGlint(o: PC, at: V3, view: ZView) {
  const [sx, sy] = toScreen(view, at);
  const x = Math.floor(sx), y = Math.floor(sy);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.set(x + dx, y + dy, FLASH[1]);
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) o.set(x + dx, y + dy, FLASH[0]);
  o.set(x, y, FLASH[2]);
}

/**
 * Язык пламени: основание в (bx, by), высота h, ширина w, фаза ph (цикл 0..1). Широкий у основания, кончик колышется;
 * белое ядро в нижней трети, к краям и кончику — жёлтый, оранжевый, красная кромка. mask — пропустить пиксель (за телом).
 */
function drawFlame(o: PC, bx: number, by: number, h: number, w: number, ph: number, mask?: (x: number, y: number) => boolean, lick = true) {
  const hh = h * (1 + 0.12 * Math.sin(TAU * ph * 2 + bx));
  const sway = Math.min(2.2, w * 0.4);
  for (let y = Math.floor(by - hh - 1); y <= Math.ceil(by); y++) {
    const v = (by - (y + 0.5)) / hh;
    if (v < -0.12 || v > 1) continue;
    const vv = clamp(v, 0, 1);
    const c = bx + Math.sin(TAU * ph + vv * 2.2) * vv * vv * sway;
    const hw = (w / 2) * Math.pow(1 - vv, 0.75) * (vv < 0.15 ? 0.85 + vv : 1);
    for (let x = Math.floor(c - hw - 1); x <= Math.ceil(c + hw + 1); x++) {
      const d = Math.abs(x + 0.5 - c) / Math.max(0.5, hw);
      if (d > 1) continue;
      if (mask && mask(x, y)) continue;
      const s = d * 0.7 + Math.max(0, vv - 0.3) * 0.95 + Math.max(0, 0.12 - vv) * 2.5;
      const tone = v < 0.04 ? (d < 0.55 ? 2 : 1) : s < 0.26 ? 5 : s < 0.44 ? 4 : s < 0.62 ? 3 : s < 0.82 ? 2 : 1;
      o.set(x, y, FIRE[tone]);
    }
  }
  // отрывающийся язычок над кончиком
  if (lick && Math.sin(TAU * ph + 1.3) > 0.55) {
    const c = bx + Math.sin(TAU * ph + 2.2) * sway;
    const x = Math.round(c - 0.5), y = Math.round(by - hh - 2);
    if (!mask || !mask(x, y)) o.set(x, y, FIRE[2]);
  }
}

/** Пламя факела в руке: язык 5×8 (полное) или 3×5 (только занялось), позади тела не рисуется. */
function drawHandFlame(o: PC, f: { at: V3; size: number; ph: number }, view: ZView, gb: GBuf) {
  const a = toView(view, f.at);
  const [sx, sy] = scr(a);
  const dep = depthOf(a);
  const mask = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return true;
    const i = y * N + x;
    return gb.prim[i] >= 0 && gb.t[i] < dep - 1.5;
  };
  const big = f.size > 1.5;
  drawFlame(o, sx, sy + 1, big ? 10 : 6, big ? 6 : 4, (f.ph % 4) / 4, mask);
}

/** Волны рыка: дуги у рта — вбок вперёд, вниз и вверх по обе стороны головы; расходятся по фазе k. */
function drawRoar(o: PC, r: { at: V3; k: number }, view: ZView) {
  const [cx, cy] = toScreen(view, r.at);
  const arcs: [number, number][] = view === "side" ? [[-0.9, 0.9]] : [[-0.75, 0.75], [Math.PI - 0.75, Math.PI + 0.75]];
  for (let j = 0; j < 3; j++) {
    const rad = 6.5 + 3.4 * j + 4.5 * r.k;
    if (rad > 24) continue;
    const col = j === 0 ? WAVE : j === 1 ? SMEAR[1] : SMEAR[0];
    const seen = new Set<number>();
    for (const [a0, a1] of arcs) {
      const n = Math.ceil((a1 - a0) * rad * 1.5);
      for (let s = 0; s <= n; s++) {
        const a = lerp(a0, a1, s / n);
        const x = Math.round(cx + Math.cos(a) * rad - 0.5), y = Math.round(cy + Math.sin(a) * rad * 0.9 - 0.5);
        const id = y * 1000 + x;
        if (seen.has(id)) continue;
        seen.add(id);
        o.set(x, y, col);
      }
    }
  }
}

/**
 * Втягиваемый воздух: штрихи в 4 px по две дорожки с каждой стороны сходятся ко рту (вниз — слева и справа, вбок —
 * спереди; вверх рот не виден). Голова штриха у рта светлая, хвост — тоном следа; ближе 5 px ко рту не подходят.
 */
function drawAir(o: PC, a: { at: V3; k: number }, view: ZView) {
  if (view === "up") return;
  const [cx, cy] = toScreen(view, a.at);
  const sides = view === "side" ? [1] : [-1, 1];
  for (const s of sides) for (let j = 0; j < 2; j++) {
    const ph = (((a.k + j * 0.5 + (s > 0 ? 0.25 : 0)) % 1) + 1) % 1;
    const r = 13 - 8 * ph;
    const lane = j ? 2 : -3;
    for (let t = 0; t < 4; t++) {
      const x = Math.floor(cx + s * (r + t)), y = Math.floor(cy + lane + (j ? 0.07 : -0.07) * (r + t));
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      o.set(x, y, t < 2 ? WAVE : SMEAR[t === 2 ? 1 : 0]);
    }
  }
}

// ---------------- анимации ----------------
type Num = number | V3 | [V3, V3] | [number, number] | V3[] | string | undefined;
function lerpAny(a: Num, b: Num, t: number): Num {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return (a as unknown[]).map((v, k) => lerpAny(v as Num, (b as unknown[])[k] as Num, t)) as Num;
  return t < 0.5 ? a : b;
}
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    if (k === "trail" || k === "trailKind") continue;
    o[k] = lerpAny(a[k] as Num, b[k] as Num, t);
  }
  return o as unknown as Pose;
}
interface Key { f: number; p: Partial<Pose>; ease?: (t: number) => number }
/** Поза в дробном кадре f: ключевые позы с плавными переходами (ease на входе в ключ). */
function poseAt(B: Pose, keys: Key[], f: number): Pose {
  const full = keys.map((k) => ({ ...B, ...k.p }) as Pose);
  let j = 0;
  while (j < keys.length - 2 && f >= keys[j + 1].f) j++;
  const a = keys[j], b = keys[j + 1];
  const u = clamp((f - a.f) / (b.f - a.f), 0, 1);
  return lerpPose(full[j], full[j + 1], (b.ease ?? easeInOut)(u));
}
function keyed(B: Pose, keys: Key[], n: number, seed: number): Pose[] {
  return Array.from({ length: n }, (_, i) => ({ ...poseAt(B, keys, i), t: i / n, seed: seed + i }));
}
/** Путь точки лезвия между дробными кадрами f0..f1 (по тем же ключам) — для серпа следа. */
function bladeTrail(B: Pose, keys: Key[], view: ZView, f0: number, f1: number, n = 8, uw: [number, number] = BLADE_HIT): V3[] {
  return Array.from({ length: n }, (_, k) => {
    const p = poseAt(B, keys, lerp(f0, f1, k / (n - 1)));
    return bladePt(rig(p, view).axe, uw);
  });
}

/**
 * Покой: дыхание волной снизу вверх — грудь с плечами и правой рукой на древке поднимается на 1 px, голова кадром позже,
 * левый кулак догоняет; подол плаща колышет ветер на пиксель. Всё — ровно на пиксель кадра; моргание — штамп.
 */
function idlePoses(view: ZView): Pose[] {
  const B = base(view);
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const handL = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const wind = [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0];
  return Array.from({ length: 12 }, (_, i) => ({
    ...B, t: i / 12, seed: 100 + i,
    chest: chest[i], headZ: head[i] - chest[i],
    hand: [add(B.hand[0], [0, 0, chest[i] * PX]), add(B.hand[1], [0, 0, handL[i] * PX])] as [V3, V3],
    cloak: [-1.2 * wind[i], -1.2 * wind[i], 0] as V3,
    blink: i === 10 ? 1 : 0,
  }));
}

/**
 * Ходьба: тяжёлый шаг. Корпус, голова, мех и топор в правой руке — жёсткий слой: проседает после касания и перевешивается
 * на опорную ногу ровно на целые пиксели. Двигаются ноги, левая рука (навстречу левой ноге) и подол плаща.
 */
function walkPoses(view: ZView): Pose[] {
  const B = base(view);
  // вбок шаг шире и нога выше: разнос стоп в крайних кадрах 8+ px, проходящая нога заметно поднята (вниз и вверх шаг идёт к зрителю — как был)
  const side = view === "side";
  const A = side ? 6.4 : 4.6, LIFT = side ? 4.6 : 3.6, DUTY = 0.56;
  const footAt = (u: number) => {
    u = ((u % 1) + 1) % 1;
    if (u < DUTY) return { y: A - (2 * A * u) / DUTY, z: 0, toe: 0, strike: u < 0.2 ? 1 - u / 0.2 : 0 };
    const s = (u - DUTY) / (1 - DUTY);
    return { y: -A + 2 * A * easeInOut(s), z: LIFT * Math.sin(Math.PI * s), toe: 0.3 * Math.sin(Math.PI * s), strike: 0 };
  };
  const bob = [-1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0];
  const sway = [0, 1, 1, 1, 1, 0, 0, -1, -1, -1, -1, 0];
  const cl = [0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1];
  return Array.from({ length: 12 }, (_, i) => {
    const t = i / 12;
    const fr = footAt(t), fl = footAt(t + 0.5);
    const fw = -fl.y / A; // левая рука вперёд, когда левая нога сзади
    const lift = 2.4 + bob[i] * PX;
    return {
      ...B, t, seed: 150 + i,
      root: [sway[i], 0, 0] as V3, bob: bob[i] * PX,
      hand: [add(B.hand[0], [sway[i], 0, lift]), [-12.4 + sway[i] + 0.8 * Math.max(0, fw), 1.6 + 4.6 * fw, 20.4 + 1.6 * Math.max(0, fw) + 0.6 * Math.max(0, -fw)]] as [V3, V3],
      plantZ: lift,
      foot: [[4.8, 0.6 + fr.y, 2.6 + fr.z], [-4.8, 0.6 + fl.y, 2.6 + fl.z]] as [V3, V3], toe: [fr.toe, fl.toe] as [number, number],
      cloak: [-0.6 * cl[i], -1.3 - 1.2 * cl[i], 0] as V3,
      dust: [fr.strike * 0.6, fl.strike * 0.6] as [number, number],
    } as Pose;
  });
}

/**
 * Дуга следа: точки ключей переводятся в полярные координаты вокруг оси axis через центр c (угол, радиус, высота вдоль
 * оси) и интерполируются кусочно — серп идёт по окружности, а не ломаной между ключами.
 */
function arcPath(keys: V3[], c: V3, axis: V3, n: number): V3[] {
  const w = norm(axis);
  const e1 = perp(w, Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]);
  const e2 = cross(w, e1);
  const pol = keys.map((p) => {
    const v = sub(p, c);
    const h = dot(v, w);
    const q = sub(v, mul(w, h));
    return [Math.atan2(dot(q, e2), dot(q, e1)), vlen(q), h];
  });
  for (let i = 1; i < pol.length; i++) {
    while (pol[i][0] - pol[i - 1][0] > Math.PI) pol[i][0] -= TAU;
    while (pol[i][0] - pol[i - 1][0] < -Math.PI) pol[i][0] += TAU;
  }
  return Array.from({ length: n }, (_, k) => {
    const u = (k / (n - 1)) * (pol.length - 1);
    const i = Math.min(pol.length - 2, Math.floor(u)), t = u - i;
    const a = lerp(pol[i][0], pol[i + 1][0], t), r = lerp(pol[i][1], pol[i + 1][1], t), h = lerp(pol[i][2], pol[i + 1][2], t);
    return add(c, add(mul(w, h), add(mul(e1, Math.cos(a) * r), mul(e2, Math.sin(a) * r))));
  });
}
/** Точка удара лезвия в позе ключа. */
const hitAt = (B: Pose, p: Partial<Pose>, view: ZView) => bladePt(rig({ ...B, ...p } as Pose, view).axe, BLADE_HIT);

/**
 * Атака: удар топором сверху — замах над правым плечом (лезвие высоко над головой), рубит вниз перед собой, лезвие
 * у самой земли (кадр 6 — удар: вспышка, пыль, комья); отдача и возврат к покою. Вниз и вверх топор ходит в плоскости
 * кадра, вбок — в плоскости вида: лезвие всегда видно плашмя, а не ребром.
 */
function attackPoses(view: ZView): Pose[] {
  const B = base(view);
  const side = view === "side";
  const ready: Partial<Pose> = {
    plant: 0, axeGrip: 12, axeDir: [0.08, 0.1, 1], hand: side ? [[8.6, 9.0, 23.0], B.hand[1]] : [[14.4, 3.6, 23.0], B.hand[1]],
  };
  // замах — топор за головой, лезвие не выше 2 px от верхнего края кадра
  const up: Partial<Pose> = {
    plant: 0, axeGrip: 21, yaw: -0.26, pitch: -0.08, roll: -0.03, bob: 1 * PX, hp: -0.2,
    hand: side ? [[7.0, -2.4, 37.6], [-10.6, 8.6, 27.0]] : [[9.4, -1.0, 35.6], [-10.6, 8.6, 27.0]],
    pole: [[1, -0.3, 0.4], [-0.8, 0.4, -0.6]],
    axeDir: side ? [0, -0.62, 0.78] : [0.42, -0.26, 0.87], axeEdge: [1, 0, 0.2], axeEdgeSide: [0, 1, 0.5],
  };
  const peak: Partial<Pose> = { ...up, yaw: -0.32, hand: side ? [[7.0, -3.2, 38.0], up.hand![1]] : [[9.0, -1.8, 36.0], up.hand![1]], axeDir: side ? [0, -0.78, 0.62] : [0.42, -0.36, 0.83] };
  const mid: Partial<Pose> = {
    plant: 0, axeGrip: 18, yaw: 0.04, pitch: 0.2, bob: -1 * PX, hp: -0.08,
    hand: [[8.6, 8.0, 36.0], [-12.0, 2.0, 22.0]], pole: [[1, -0.2, 0.3], [-0.8, -1, -0.2]],
    axeDir: side ? [0, 0.95, 0.3] : [0.16, 0.9, 0.4], axeEdge: [1, 0, 0], axeEdgeSide: [0, 0.2, -1],
  };
  const hit: Partial<Pose> = {
    plant: 0, axeGrip: 18, yaw: 0.22, pitch: 0.42, roll: 0.04, bob: -3 * PX, hp: 0.04,
    hand: side ? [[6.0, 12.0, 21.0], [-14.0, -2.0, 21.0]] : [[6.4, 10.0, 22.0], [-14.0, -2.0, 21.0]],
    pole: [[1, -0.6, 0.2], [-0.8, -1, -0.2]],
    axeDir: side ? [0, 0.62, -0.78] : [0.08, 0.55, -0.83], axeEdge: [1, 0, 0], axeEdgeSide: [0, -0.8, -0.6], flash: 1, puff: 1,
  };
  const settle: Partial<Pose> = { ...hit, pitch: 0.38, bob: -2 * PX, hand: [add(hit.hand![0], [0.3, -0.4, 0.8]), [-14.0, -1.4, 20.6]], flash: 0, puff: 0.5 };
  // кадр 0 и последний — кадр 0 покоя пиксель в пиксель (топор в земле): стык без рывка; подъём — в кадрах 1–2
  const keys: Key[] = [
    { f: 0, p: {} },
    { f: 1.4, p: ready, ease: easeInOut },
    { f: 3, p: up, ease: easeInOut },
    { f: 4, p: peak, ease: linear },
    { f: 5, p: mid, ease: easeIn },
    { f: 6, p: hit, ease: easeOut },
    { f: 7, p: settle, ease: easeOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(B, keys, 10, 400);
  // серп — по дуге вокруг правого плеча (ось — вбок), через лезвие в ключах
  const sh: V3 = [10.4, 0.5, 34 + LEGX];
  const P = [hitAt(B, peak, view), hitAt(B, mid, view), hitAt(B, hit, view)];
  const arc = (u0: number, u1: number, n = 8) => {
    const full = arcPath(P, sh, [1, 0, 0], 33);
    return full.slice(Math.round(u0 * 32), Math.round(u1 * 32) + 1).filter((_, k, a) => k % Math.max(1, Math.floor(a.length / n)) === 0 || k === a.length - 1);
  };
  poses[5].trail = arc(0, 0.5);
  poses[6].trail = arc(0.2, 1);
  poses[7].trail = arc(0.7, 1, 4);
  for (const k of [5, 6, 7]) poses[k].trailKind = "axe";
  return poses;
}

/**
 * Замах «Размаха топором»: обеими руками топор отведён к правому боку и вверх, корпус довёрнут вправо. Вниз и вверх древко
 * лежит в плоскости кадра (лезвие видно плашмя, носком вверх), вбок — за плечом назад.
 */
function sweepRaise(view: ZView): Partial<Pose> {
  const side = view === "side";
  return {
    plant: 0, twoHand: 1, axeGrip: side ? 12 : 15, yaw: -0.45, pitch: -0.04, roll: -0.04, bob: 0, hp: -0.12, hy: 0.15,
    hand: side ? [[8.0, -2.0, 31.0], [0, 0, 0]] : [[9.6, -1.0, 29.0], [0, 0, 0]], pole: [[1, -0.3, -0.4], [-0.2, 1, -0.6]],
    axeDir: side ? [0.2, -0.75, 0.6] : [0.8, -0.24, 0.56], axeEdge: [-0.5, 0, 1], axeEdgeSide: [0, 0.6, 0.75], cloak: [-1, -1, 0],
  };
}
function sweepUpPoses(view: ZView): Pose[] {
  const B = base(view);
  const keys: Key[] = [{ f: 0, p: {} }, { f: 3, p: sweepRaise(view), ease: easeInOut }];
  return keyed(B, keys, 4, 200);
}
/** Удержание замаха: руки с топором дрожат на пиксель целиком, на носке лезвия вспыхивает блик. */
function sweepHoldPoses(view: ZView): Pose[] {
  const B = base(view);
  const base0 = { ...B, ...sweepRaise(view) } as Pose;
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base0, t: i / 4, seed: 220 + i,
    armLift: [tremble[i], tremble[i]] as [number, number],
    glint: i === 1 ? 1 : 0,
    cloak: [-1 - (i % 2), -1, 0] as V3,
  }));
}
/**
 * «Размах топором»: обеими руками широкой дугой справа налево перед собой на высоте пояса (кадр 2 — удар), серп через весь
 * перед; по инерции топор уходит влево-назад, вожак держит дожим и возвращается к покою.
 */
function sweepPoses(view: ZView): Pose[] {
  const B = base(view);
  const side = view === "side";
  const raise = sweepRaise(view);
  const swing: Partial<Pose> = {
    plant: 0, twoHand: 1, axeGrip: 13, yaw: -0.1, pitch: 0.16, bob: -1 * PX, hp: -0.04, hy: 0,
    hand: [[11.0, 8.0, 26.0], [0, 0, 0]], pole: [[1, -0.4, -0.2], [-0.2, 1, -0.4]],
    axeDir: side ? [0.75, 0.6, 0.06] : [0.62, 0.76, 0.1], axeEdge: [0, 0.2, -1], axeEdgeSide: [0, 0.2, -1],
  };
  const hit: Partial<Pose> = {
    plant: 0, twoHand: 1, axeGrip: 14, yaw: 0.5, pitch: 0.22, roll: 0.04, bob: -2 * PX, hp: 0.02, hy: -0.1,
    hand: side ? [[2.0, 8.0, 23.0], [0, 0, 0]] : [[-2.0, 10.0, 23.0], [0, 0, 0]], pole: [[0.6, -0.3, -0.6], [-0.6, 0.6, -0.4]],
    axeDir: side ? [-0.62, 0.74, -0.1] : [-0.8, 0.56, -0.1], axeEdge: [0, 0.2, -1], axeEdgeSide: [0, 0.2, -1],
    cloak: [1, -1, 0],
  };
  const follow: Partial<Pose> = {
    ...hit, axeGrip: 15, yaw: 0.66, pitch: 0.2, bob: -2 * PX,
    hand: [[-6.0, 7.0, 22.0], [0, 0, 0]], axeDir: [-0.76, -0.42, -0.45], cloak: [1, -1, 0],
  };
  const keys: Key[] = [
    { f: 0, p: raise },
    { f: 1, p: swing, ease: easeIn },
    { f: 2, p: hit, ease: linear },
    { f: 3, p: follow, ease: easeOut },
    { f: 5, p: { ...follow, yaw: 0.6, hand: [[-5.4, 7.4, 22.6], [0, 0, 0]] }, ease: easeInOut },
    { f: 9, p: { twoHand: 0 }, ease: easeInOut },
  ];
  const poses = keyed(B, keys, 10, 240);
  // серп — по дуге вокруг вожака (ось — вверх), через лезвие в ключах замаха, проноса, удара и дожима
  const c: V3 = [0, 2, 24 + LEGX];
  const P = [hitAt(B, raise, view), hitAt(B, swing, view), hitAt(B, hit, view), hitAt(B, follow, view)];
  const full = arcPath(P, c, [0, 0, 1], 31);
  const part = (u0: number, u1: number, n = 8) => {
    const a = Math.round(u0 * 30), b = Math.round(u1 * 30);
    return Array.from({ length: n }, (_, k) => full[Math.round(lerp(a, b, k / (n - 1)))]);
  };
  poses[1].trail = part(0.08, 0.33);
  poses[2].trail = part(0.12, 0.67);
  poses[3].trail = part(0.5, 1, 6);
  for (const k of [1, 2, 3]) poses[k].trailKind = "axe";
  return poses;
}

/**
 * Факел занесён: локоть согнут и отведён, кулак у плеча, факел вверх у виска — огонь на уровне макушки, до верхнего края
 * кадра не меньше 1 px и с дрожью руки; корпус откинут и довёрнут влево.
 */
const TORCH_UP: Partial<Pose> = {
  yaw: 0.34, pitch: -0.12, roll: 0.06, hp: -0.12, hand: [REST.hand[0], [-14.0, -3.0, 30.6]], pole: [REST.pole[0], [-1, -0.2, 0.35]],
  // стойка для броска: правая нога вперёд, левая назад
  foot: [[5.4, 2.6, 2.6], [-5.6, -2.8, 2.6]],
  torch: 1, torchDir: [-0.22, -0.2, 0.95], flame: 2,
};
/** Факел занесён в виде: вбок рука отведена назад (бросок из-за спины) — пламя над плечом позади головы, а не за ней. */
function torchUp(view: ZView): Partial<Pose> {
  const B = base(view);
  return view === "side"
    ? { ...TORCH_UP, hand: [B.hand[0], [-10.0, -9.4, 29.4]], pole: [B.pole[0], [-0.6, -1, -0.4]], torchDir: [-0.1, -0.5, 0.86] }
    : { ...TORCH_UP, hand: [B.hand[0], TORCH_UP.hand![1]] };
}
/** «Факел в нивы»: левая рука к поясу за факелом, факел вспыхивает и уходит за плечо. */
function torchUpPoses(view: ZView): Pose[] {
  const B = base(view);
  const grab: Partial<Pose> = { yaw: 0.12, hand: [B.hand[0], [-9.0, -4.6, 22.0]], pole: [B.pole[0], [-0.8, -0.4, -0.2]], torch: 1, torchDir: [-0.3, -0.5, 0.8], flame: 1 };
  const keys: Key[] = [{ f: 0, p: {} }, { f: 1, p: grab, ease: easeInOut }, { f: 3, p: torchUp(view), ease: easeInOut }];
  const poses = keyed(B, keys, 4, 260);
  poses[0].torch = 0;
  poses[1].torch = 1;
  poses[1].flame = 1;
  return poses;
}
function torchHoldPoses(view: ZView): Pose[] {
  const B = base(view);
  const b0 = { ...B, ...torchUp(view) } as Pose;
  const tremble = [0, 1, 0, 1];
  return [0, 1, 2, 3].map((i) => ({ ...b0, t: i / 4, seed: 280 + i, armLift: [0, tremble[i]] as [number, number] }));
}
/**
 * Бросок: рука хлёстом через плечо вперёд-вверх, кадр 2 — факел срывается с руки (дальше его ведёт клиент по дуге к метке,
 * лист — только рука); огненный след за кистью; рука уходит вниз поперёк тела, возврат к покою.
 */
function throwPoses(view: ZView): Pose[] {
  const B = base(view);
  const over: Partial<Pose> = { ...TORCH_UP, yaw: 0.05, pitch: 0.05, hand: [B.hand[0], [-9.0, 5.0, 33.6]], torchDir: [0, 0.6, 0.8] };
  const release: Partial<Pose> = {
    yaw: -0.3, pitch: 0.26, roll: -0.02, bob: -1 * PX, hp: 0.05, hand: [B.hand[0], [-5.0, 14.0, 33.0]], pole: [B.pole[0], [-1, 0, -0.3]], torch: 0, flame: 0,
  };
  const follow: Partial<Pose> = { ...release, yaw: -0.36, pitch: 0.3, bob: -2 * PX, hand: [B.hand[0], [-1.0, 10.0, 21.0]] };
  const keys: Key[] = [
    { f: 0, p: torchUp(view) },
    { f: 1, p: over, ease: easeIn },
    { f: 2, p: release, ease: linear },
    { f: 3, p: follow, ease: easeOut },
    { f: 4, p: { ...follow, hand: [B.hand[0], [-1.6, 9.4, 21.4]] }, ease: easeOut },
    { f: 7, p: {}, ease: easeInOut },
  ];
  const poses = keyed(B, keys, 8, 300);
  for (let i = 0; i < poses.length; i++) if (i >= 2) { poses[i].torch = 0; poses[i].flame = 0; }
  poses[1].trail = handTrail(B, keys, view, 0, 1);
  poses[2].trail = handTrail(B, keys, view, 0.4, 2);
  for (const k of [1, 2]) poses[k].trailKind = "fire";
  return poses;
}
/** Путь левого кулака между дробными кадрами — для огненного следа броска. */
function handTrail(B: Pose, keys: Key[], view: ZView, f0: number, f1: number, n = 8): V3[] {
  return Array.from({ length: n }, (_, k) => rig(poseAt(B, keys, lerp(f0, f1, k / (n - 1))), view).fist[1]);
}

/**
 * Вдох перед рыком — поза крупно, видна все 2,6 с предупреждения: грудь вперёд и вверх (+1 px), корпус откинут, голова
 * запрокинута — борода поднята, лицо видно; левый локоть широко назад, кулак у бедра; топор отставлен в сторону, ноги
 * шире; плащ раздувается. Воздух втягивается ко рту — штрихи по бокам (air).
 */
const INHALE: Partial<Pose> = {
  chest: 1, pitch: -0.2, bob: 1 * PX, hp: -0.3, armLift: [1, 1],
  hand: [[18.6, 0.6, 21.6], [-9.4, -2.6, 21.4]], pole: [[1, -0.5, 0.2], [-1, -1.1, 0.25]],
  foot: [[6.4, 1.0, 2.6], [-6.4, -0.6, 2.6]], cloak: [-2, -1, 0], billow: 1.6,
};
/** Вдох в виде: вбок топор отставлен вперёд (к зрителю нельзя — торец уйдёт за нижний край кадра). */
function inhalePose(view: ZView): Partial<Pose> {
  return view === "side" ? { ...INHALE, hand: [[7.2, 12.6, 21.6], INHALE.hand![1]], pole: [[1, -0.3, -0.2], INHALE.pole![1]] } : INHALE;
}
function inhalePoses(view: ZView): Pose[] {
  const B = base(view);
  const keys: Key[] = [{ f: 0, p: {} }, { f: 3, p: inhalePose(view), ease: easeInOut }];
  return keyed(B, keys, 4, 320).map((p, i) => ({
    ...p, chest: Math.round(p.chest), armLift: [Math.round(p.armLift[0]), Math.round(p.armLift[1])] as [number, number], air: i >= 2 ? (i - 2) / 4 : -1,
  }));
}
function inhaleHoldPoses(view: ZView): Pose[] {
  const B = base(view);
  const b0 = { ...B, ...inhalePose(view) } as Pose;
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({ ...b0, t: i / 4, seed: 340 + i, armLift: [1, 1 + tremble[i]] as [number, number], cloak: [-2 - (i % 2), -1, 0] as V3, air: 0.5 + i / 4 }));
}
/**
 * Рык: рывок вперёд, рот раскрыт (штамп), левая рука выброшена вниз-в сторону, кулак сжат (кадр 2 — волна, дальше её
 * ведёт эффект мира); волны у рта расходятся 4 кадра, вожак трясётся на пиксель; рот закрывается, возврат к покою.
 */
function roarPoses(view: ZView): Pose[] {
  const B = base(view);
  const shout: Partial<Pose> = {
    chest: 0, armLift: [0, 0], pitch: 0.3, hp: 0.24, bob: -1 * PX, hand: [B.hand[0], [-19.0, 3.0, 20.0]], pole: [B.pole[0], [-0.6, -1, 0.2]], mouth: 1, roar: 0,
    foot: INHALE.foot, cloak: [-2, -1, 0],
  };
  const keys: Key[] = [
    { f: 0, p: { ...inhalePose(view), cloak: [-2, -1, 0] } },
    { f: 1, p: { ...shout, pitch: 0.16, hp: 0.05 }, ease: easeIn },
    { f: 2, p: shout, ease: easeOut },
    { f: 6, p: { ...shout, hp: 0.16 }, ease: linear },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(B, keys, 10, 360);
  const shake = [0, 0, 1, -1, 1, -1, 0, 0, 0, 0];
  poses.forEach((p, i) => {
    p.chest = Math.round(p.chest);
    p.armLift = [Math.round(p.armLift[0]), Math.round(p.armLift[1])];
    p.mouth = i >= 1 && i <= 7 ? 1 : 0;
    p.roar = i >= 2 && i <= 6 ? (i - 2) / 4 + 0.05 : 0;
    p.root = [shake[i], 0, 0];
  });
  return poses;
}

/**
 * Гибель: отшатнулся (кадр 2), опёрся на топор, падает на колено, топор выпадает из руки, валится на бок (вниз и вверх —
 * влево от себя, поперёк кадра, колени согнуты; вбок — ничком вперёд) и остаётся лежать, плащ сверху. Последний кадр
 * остаётся на экране трупом, поэтому тело и топор целиком в кадре с запасом не меньше 1 px: топор ложится рядом с телом
 * лезвием вверх — по ту сторону тела от камеры (вниз и вверх — за спиной и перед грудью соответственно, вбок — дальним
 * боком), выглядывает над лежащим телом.
 */
function deathPoses(view: ZView): Pose[] {
  const B = base(view);
  const side = view === "side";
  /** Запястье на земле: в позах запястья задаются от корпуса (+LEGX), здесь нужна высота в мире. */
  const gnd = (x: number, y: number, z: number): V3 => [x, y, z - LEGX];
  const recoil: Partial<Pose> = { pitch: -0.14, bob: 1 * PX, hp: -0.3, hand: [B.hand[0], [-15.0, -2.0, 24.0]], mouth: 1, cloak: [-1, -1, 0] };
  const lean: Partial<Pose> = { pitch: 0.2, roll: side ? 0 : -0.06, bob: -1 * PX, hp: 0.15, hand: [B.hand[0], [-12.0, 4.0, 17.0]], mouth: 0 };
  // на правое колено: голень назад по земле, левая нога вперёд
  const kneelFeet: [V3, V3] = [[4.8, -9.6, 2.8], [-4.8, 3.6, 2.6]];
  const kneel: Partial<Pose> = {
    root: [0, -1, 0], pitch: 0.3, roll: side ? 0 : -0.1, bob: -9.6, hp: 0.3, foot: kneelFeet, toe: [-0.9, 0], cloak: [0, 3, 7], billow: 0.6,
    hand: [add(B.hand[0], [0, 0, -8]), gnd(-11.0, 6.0, 11.0)],
  };
  // топор: перед телом вдоль него, торец у руки, лезвие у ног, наклонено к камере — над нижним краем кадра
  const fwd = view === "down" ? 1 : view === "up" ? -1 : 0;
  const dropAt: V3 = side ? [3.4, 22.0, 0.9] : [-14.0, 3.2 * fwd, 0.9];
  const dropDir: V3 = side ? [0, -1, 0] : [1, 0, 0];
  const dropEdge: V3 = side ? [0.6, 0, 0.8] : [0, 0.6 * fwd, 0.8];
  const lie: Partial<Pose> = side
    ? {
        root: [-4, -8, 0], pitch: 1.42, ppitch: 1.3, roll: 0, bob: -19.6, hp: 0.2, hy: 0.6,
        foot: [[3.2, -17.0, 2.6], [-3.2, -18.0, 2.0]], toe: [-1.2, -1.2], hand: [gnd(1.2, 5.0, 1.6), gnd(-7.0, 9.0, 1.6)],
        pole: [[1, 0, 0.4], [-1, 0, 0.4]], billow: 0.2, cloak: [0, 0, 0],
      }
    : {
        root: [5, view === "down" ? -4 : 4, 0], roll: -1.42, proll: -0.7, pitch: 0.1, bob: -19.4, hp: 0.15, hr: -0.2,
        foot: [[12.5, view === "down" ? 2.0 : 5.0, 2.0], [11.5, view === "down" ? -2.0 : 1.0, 4.4]], toe: [0, 0],
        hand: [gnd(-6.0, view === "down" ? 3.0 : 8.0, 1.6), gnd(-17.0, view === "down" ? 1.0 : 6.0, 1.4)],
        pole: [[0, 1, 0.6], [0, 1, 0.4]], billow: 0.2, drape: 1, cloak: [0, 0, 0],
      };
  // куда ляжет топор — во всех ключах (иначе место интерполируется от нуля); выпадает между кадрами 6 и 7
  const D = { dropAt, dropDir, dropEdge };
  const keys: Key[] = [
    { f: 0, p: D },
    { f: 2, p: { ...recoil, ...D }, ease: easeOut },
    { f: 4, p: { ...lean, ...D }, ease: easeInOut },
    { f: 6, p: { ...kneel, ...D }, ease: easeIn },
    { f: 7, p: { ...kneel, pitch: 0.45, bob: -10.6, drop: 1, cloak: [0, 2, 10], ...D }, ease: easeInOut },
    { f: 10, p: { ...lie, drop: 1, ...D }, ease: easeIn },
    { f: 11, p: { ...lie, drop: 1, ...D }, ease: easeOut },
  ];
  const poses = keyed(B, keys, 12, 700);
  poses.forEach((p, i) => {
    if (i === 10) p.dust = [1, 1];
    if (i === 11) p.dust = [0.4, 0.4];
  });
  return poses;
}

export type RaiderAnim =
  | "idle" | "walk" | "attack" | "sweepUp" | "sweepHold" | "sweep" | "torchUp" | "torchHold" | "throw" | "inhale" | "inhaleHold" | "roar" | "death";
/**
 * Анимации: первый столбец листа, число кадров, кадров в секунду, по кругу ли, что играть следом. Замахи умений — связки:
 * «sweepUp» → «sweepHold» по кругу до конца предупреждения → «sweep» (удар — кадр hit); так же факел и рык.
 */
export const RAIDER_ANIMS: Record<RaiderAnim, { col: number; n: number; fps: number; loop: boolean; ru: string; next?: RaiderAnim; hit?: number }> = {
  idle: { col: 0, n: 12, fps: 12, loop: true, ru: "покой" },
  walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
  attack: { col: 24, n: 10, fps: 15, loop: false, ru: "атака", hit: 6 },
  sweepUp: { col: 34, n: 4, fps: 12, loop: false, ru: "замах топора", next: "sweepHold" },
  sweepHold: { col: 38, n: 4, fps: 12, loop: true, ru: "удержание топора", next: "sweep" },
  sweep: { col: 42, n: 10, fps: 12, loop: false, ru: "размах топором", hit: 2 },
  torchUp: { col: 52, n: 4, fps: 12, loop: false, ru: "замах факела", next: "torchHold" },
  torchHold: { col: 56, n: 4, fps: 12, loop: true, ru: "удержание факела", next: "throw" },
  throw: { col: 60, n: 8, fps: 12, loop: false, ru: "бросок факела", hit: 2 },
  inhale: { col: 68, n: 4, fps: 12, loop: false, ru: "вдох", next: "inhaleHold" },
  inhaleHold: { col: 72, n: 4, fps: 12, loop: true, ru: "удержание вдоха", next: "roar" },
  roar: { col: 76, n: 10, fps: 12, loop: false, ru: "рык", hit: 2 },
  death: { col: 86, n: 12, fps: 12, loop: false, ru: "гибель" },
};
export const RAIDER_COLS = 98;
/**
 * Умения карточки → анимации: замах (связка) длится windupMs, удар начинается так, чтобы кадр hit пришёлся ровно на конец
 * предупреждения. У факела кадр hit — бросок: он раньше конца на flyMs (столько факел летит к метке), огонь — в конце.
 */
export const RAIDER_SKILLS: Record<string, { windup: [RaiderAnim, RaiderAnim]; strike: RaiderAnim; flyMs?: number; fx?: "fire" | "roar" }> = {
  axe_sweep: { windup: ["sweepUp", "sweepHold"], strike: "sweep" },
  torch_throw: { windup: ["torchUp", "torchHold"], strike: "throw", flyMs: 450, fx: "fire" },
  war_roar: { windup: ["inhale", "inhaleHold"], strike: "roar", fx: "roar" },
};
const POSES: Record<RaiderAnim, (view: ZView) => Pose[]> = {
  idle: idlePoses, walk: walkPoses, attack: attackPoses, sweepUp: sweepUpPoses, sweepHold: sweepHoldPoses, sweep: sweepPoses,
  torchUp: torchUpPoses, torchHold: torchHoldPoses, throw: throwPoses, inhale: inhalePoses, inhaleHold: inhaleHoldPoses, roar: roarPoses,
  death: deathPoses,
};

/** Лист одной анимации: 3 строки (вниз, вверх, вбок), столбцы — кадры. */
export function buildRaiderAnim(anim: RaiderAnim): PC {
  const A = RAIDER_ANIMS[anim];
  const out = new PC(N * A.n, N * 3);
  VIEWS.forEach((v, row) => POSES[anim](v).forEach((p, i) => out.blit(renderRaider(v, p), i * N, row * N)));
  return out;
}
/** Весь лист: RAIDER_COLS столбцов × 3 строки. */
export function buildRaiderSheet(parts?: Partial<Record<RaiderAnim, PC>>): PC {
  const out = new PC(N * RAIDER_COLS, N * 3);
  for (const a of Object.keys(RAIDER_ANIMS) as RaiderAnim[]) out.blit(parts?.[a] ?? buildRaiderAnim(a), RAIDER_ANIMS[a].col * N, 0);
  return out;
}
/** Один кадр для отладки: вид, анимация, номер. */
export function raiderFrame(view: ZView, anim: RaiderAnim, i: number): PC {
  return renderRaider(view, POSES[anim](view)[i]);
}
/** Где кулак отпускает факел (кадр hit броска): пиксели от точки опоры (вправо, вверх — минус) по видам. */
export function torchRelease(): Record<ZView, [number, number]> {
  const out = {} as Record<ZView, [number, number]>;
  for (const v of VIEWS) {
    const p = POSES.throw(v)[RAIDER_ANIMS.throw.hit!];
    const [x, y] = toScreen(v, rig(p, v).fist[1]);
    out[v] = [Math.round(x - CX), Math.round(y - GY)];
  }
  return out;
}

// ---------------- эффекты мира ----------------
/**
 * Факел в полёте (sol_raider_chief-torch.png): 8 кадров 20×20 (в 16 px пламя поднятого конца срезалось краем) — палка
 * крутится на 45° за кадр, пламя на конце всегда тянется вверх. Клиент ведёт его по дуге от кулака (torchRelease, кадр hit
 * броска) к центру метки за flyMs.
 */
export const TORCH_FX = { size: 20, frames: 8, fps: 16 };
export function buildTorchFx(): PC {
  const S = TORCH_FX.size;
  const out = new PC(S * TORCH_FX.frames, S);
  for (let f = 0; f < TORCH_FX.frames; f++) {
    const c = new PC(S, S);
    const a = (f / TORCH_FX.frames) * TAU;
    const dx = Math.cos(a), dy = Math.sin(a);
    const cx = 9.5, cy = 10.5;
    // палка: светлая сторона сверху-слева, тёмная — снизу-справа
    const nx = -dy, ny = dx;
    const lit = nx * -0.6 + ny * -0.8 > 0 ? 1 : -1;
    for (let t = -4.5; t <= 2.5; t += 0.25) {
      c.set(Math.round(cx + dx * t - 0.5), Math.round(cy + dy * t - 0.5), WOOD[3]);
      c.set(Math.round(cx + dx * t - nx * lit * 0.9 - 0.5), Math.round(cy + dy * t - ny * lit * 0.9 - 0.5), WOOD[1]);
    }
    // намотка
    for (let t = 2.5; t <= 4.0; t += 0.25) for (const o of [-0.6, 0.6]) c.set(Math.round(cx + dx * t + nx * o - 0.5), Math.round(cy + dy * t + ny * o - 0.5), LEATHER[1]);
    c.outline(OUT);
    // пламя у намотки: капля вверх
    drawFlame(c, cx + dx * 4.6, cy + dy * 4.6 + 1.5, 6, 4.2, f / TORCH_FX.frames, undefined, false);
    out.blit(c, f * S, 0);
  }
  return out;
}

/** Кадр огня в нивах: 112×112, центр метки (56, 62), круг r = 44 без сжатия, как метка в игре. */
const FW = 112, FCX = 56, FCY = 62, FIRE_R = 44;
interface Tongue { dx: number; h: number; w: number; ph: number }
interface FireBush { x: number; y: number; d: number; tongues: Tongue[] }
/**
 * Кусты пламени по кругу: детерминированно, не ближе 13 px друг к другу; в кусте главный язык и 1–2 боковых пониже,
 * у центра — выше. Между кустами — одиночные язычки.
 */
const BUSHES: FireBush[] = (() => {
  const out: FireBush[] = [];
  for (let k = 0; out.length < 11 && k < 600; k++) {
    const a = hash01(k, 1, 79) * TAU, r = Math.sqrt(hash01(k, 2, 79)) * (FIRE_R - 6);
    const x = FCX + Math.cos(a) * r, y = FCY + Math.sin(a) * r;
    if (out.some((t) => Math.hypot(t.x - x, (t.y - y) * 1.3) < 15)) continue;
    const big = 1 - r / FIRE_R;
    const h = 10 + 8 * big + 2 * hash01(k, 3, 79);
    const tongues: Tongue[] = [{ dx: 0, h, w: 6.4 + 2 * big, ph: hash01(k, 5, 79) }];
    const sides = hash01(k, 6, 79) < 0.5 ? [-1, 1] : [hash01(k, 7, 79) < 0.5 ? -1 : 1];
    for (const s of sides) tongues.push({ dx: s * (3.0 + hash01(k, 8 + s, 79)), h: h * (0.5 + 0.18 * hash01(k, 9 + s, 79)), w: 4.6 + big, ph: hash01(k, 11 + s, 79) });
    out.push({ x, y, d: r, tongues });
  }
  for (let k = 0; out.length < 19 && k < 600; k++) {
    const a = hash01(k, 21, 79) * TAU, r = Math.sqrt(hash01(k, 22, 79)) * (FIRE_R - 4);
    const x = FCX + Math.cos(a) * r, y = FCY + Math.sin(a) * r;
    if (out.some((t) => Math.hypot(t.x - x, (t.y - y) * 1.3) < 10)) continue;
    out.push({ x, y, d: r, tongues: [{ dx: 0, h: 5.5 + 2 * hash01(k, 23, 79), w: 4, ph: hash01(k, 24, 79) }] });
  }
  return out;
})();
/** Край выжженного пятна: радиус по углу — рваный наружу, всюду не меньше круга урона r = 44 (44,2…48,2 px). */
const scorchR = (a: number) => FIRE_R + 2.2 + 1.2 * Math.sin(3 * a + 1) + 0.8 * Math.sin(7 * a + 2.3);
/** Язычки по кромке: горит вся граница круга урона, а не только середина. */
const RIM: FireBush[] = Array.from({ length: 14 }, (_, k) => {
  const a = (k / 14) * TAU + (hash01(k, 1, 83) - 0.5) * 0.25;
  const r = scorchR(a) - 2.6;
  return { x: FCX + Math.cos(a) * r, y: FCY + Math.sin(a) * r, d: r, tongues: [{ dx: 0, h: 4 + 2.2 * hash01(k, 2, 83), w: 3.2, ph: hash01(k, 3, 83) }] };
});

interface FireState {
  /**
   * обуглено стерни 0..1 (пятнами по всей площади круга сразу, кромка — с кадра 0), сила языков 0..1, фаза цикла,
   * вспышка падения факела, угли, рассыпание пепла 0..1
   */
  char: number; size: number; ph: number; impact?: number; embers: number; fade?: number;
}
/** Кадр огня: [нижний слой — под юнитами: стерня, угли, факел, задние кусты; верхний — передние кусты и искры над юнитами]. */
function fireFrame(st: FireState, f: number): [PC, PC] {
  const back = new PC(FW, FW), front = new PC(FW, FW);
  const fade = st.fade ?? 0;
  // кромка тлеет, пока горят языки (и в кадре падения факела); потом — остывший тёмный пепел
  const hot = st.size > 0.25 || (st.impact ?? 0) > 0;
  // выжженная стерня: борозды поля (ряды через 4 px), по краю — тлеющая кромка, в бороздах — угли
  for (let y = 0; y < FW; y++) for (let x = 0; x < FW; x++) {
    const dx = x + 0.5 - FCX, dy = y + 0.5 - FCY;
    const d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    const R = scorchR(a);
    if (d > R) continue;
    // угасание: пепел рассыпается пятнами по всему кругу, без сжатия
    if (fade > 0 && hash01(x >> 1, y >> 1, 91) < fade) continue;
    const ring = d > R - 1.5, ring2 = d > R - 3;
    // стерня занимается пятнами сразу по всей площади, кромка тлеет с первого кадра
    if (!ring2 && hash01(x >> 1, y >> 1, 57) >= st.char) {
      // ещё не занялось: редкие искры по сухой стерне
      if (hot && hash01(x, y, 60 + (f % 3)) < 0.035 * st.embers) back.set(x, y, EMBER[1]);
      continue;
    }
    const row = (y + Math.round(1.2 * Math.sin(x * 0.21))) & 3;
    const n = hash01(x >> 1, y >> 1, 13);
    let col = row === 0 ? ASH[2] : row === 3 ? ASH[0] : n < 0.6 ? ASH[1] : ASH[0];
    if (row === 0 && hash01(x, y, 15) < 0.25) col = ASH[3];
    if (ring) col = hot ? EMBER[hash01(x, y, (f % 4) + 3) < 0.55 ? 1 : 2] : ASH[2];
    else if (ring2) col = hot ? EMBER[0] : ASH[1];
    else if (st.embers > 0 && row === 0 && hash01(x, y, 40 + (f % 4)) < 0.16 * st.embers) col = EMBER[hash01(x, y, 8 + (f % 2)) < 0.35 ? 2 : 1];
    back.set(x, y, col);
  }
  // факел посередине: догорает палкой
  if (fade < 0.6) {
    for (let t = -3; t <= 3; t++) back.set(FCX + t, FCY + Math.round(t * 0.3), t > 1 ? EMBER[2] : WOOD[2]);
    back.set(FCX + 3, FCY, EMBER[3]);
  }
  // кусты пламени по всей площади и язычки по кромке: позади центра метки — под юнитами, впереди — над ними;
  // разгораются все сразу, с небольшим разбросом
  [...BUSHES, ...RIM].forEach((b, k) => {
    const grow = clamp(st.size * 1.3 - 0.3 * hash01(k, 3, 81), 0, 1) * (0.85 + 0.15 * (1 - b.d / FIRE_R));
    if (grow < 0.12) return;
    const layer = b.y > FCY + 3 ? front : back;
    // сперва боковые языки, главный — поверх
    for (const t of [...b.tongues].reverse()) {
      drawFlame(layer, b.x + t.dx * Math.sqrt(grow), b.y, t.h * grow, Math.max(2.4, t.w * Math.sqrt(grow)), (st.ph + t.ph) % 1);
    }
    // искры: поднимаются над кустом по кругу цикла
    if (st.size > 0.5 && b.tongues.length > 1) {
      const u = (st.ph * 2 + b.tongues[0].ph) % 1;
      const sx = Math.round(b.x + Math.sin(u * TAU + b.x) * 2), sy = Math.max(2, Math.round(b.y - b.tongues[0].h * grow - 2 - u * 9));
      front.set(sx, sy, u < 0.5 ? EMBER[3] : EMBER[2]);
    }
  });
  // падение факела: вспышка и разлёт искр
  if (st.impact) {
    const L = Math.round(3 + 4 * st.impact);
    for (let r = 1; r <= L; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) front.set(FCX + dx * r, FCY - 3 + dy * Math.min(r, 3), FLASH[r <= 2 ? 2 : r < L ? 1 : 0]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.4, r = 6 + 9 * (1 - st.impact);
      front.set(FCX + Math.cos(a) * r, FCY - 3 + Math.sin(a) * r * 0.7 - 3, EMBER[k % 2 ? 2 : 3]);
    }
  }
  return [back, front];
}

/**
 * Огонь в нивах (sol_raider_chief-fire.png): кадр 112×112, центр метки — (56, 62), строка 0 — нижний слой (под юнитами),
 * строка 1 — верхний (над юнитами). Столбцы — FIRE_ANIMS: «занялось» (кадр hit — факел упал, ровно в конце
 * предупреждения: вспышка и тлеющая кромка сразу по всему кругу r ≥ 44 — урон бьёт по всему кругу; стерня обугливается
 * пятнами по всей площади, языки растут следом), «горит» по кругу hazardMs, «гаснет» (языки опадают, угли гаснут —
 * темнеет, пепел рассыпается пятнами по всему кругу, без сжатия).
 */
export const FIRE_FX = { size: FW, cx: FCX, cy: FCY, r: FIRE_R };
export const FIRE_ANIMS = {
  ignite: { col: 0, n: 6, fps: 12, loop: false, hit: 0, next: "burn" },
  burn: { col: 6, n: 8, fps: 12, loop: true, next: "out" },
  out: { col: 14, n: 6, fps: 12, loop: false },
} as const;
export const FIRE_COLS = 20;
export function buildFireFx(): PC {
  const out = new PC(FW * FIRE_COLS, FW * 2);
  const put = (col: number, [b, f]: [PC, PC]) => {
    out.blit(b, col * FW, 0);
    out.blit(f, col * FW, FW);
  };
  const ig = { char: [0.14, 0.38, 0.62, 0.82, 0.95, 1], size: [0, 0.35, 0.56, 0.76, 0.9, 1], embers: [0.5, 0.6, 0.72, 0.85, 1, 1] };
  for (let i = 0; i < 6; i++) put(FIRE_ANIMS.ignite.col + i, fireFrame({ char: ig.char[i], size: ig.size[i], ph: i / 8, impact: i === 0 ? 1 : i === 1 ? 0.45 : 0, embers: ig.embers[i] }, i));
  for (let i = 0; i < 8; i++) put(FIRE_ANIMS.burn.col + i, fireFrame({ char: 1, size: 1, ph: i / 8, embers: 1 }, i));
  const size = [0.75, 0.5, 0.28, 0.1, 0, 0], embers = [0.8, 0.5, 0.25, 0.1, 0, 0], fade = [0, 0.08, 0.22, 0.42, 0.62, 0.84];
  for (let i = 0; i < 6; i++) put(FIRE_ANIMS.out.col + i, fireFrame({ char: 1, size: size[i], ph: (i + 2) / 8, embers: embers[i], fade: fade[i] }, i));
  return out;
}

/**
 * Волна рыка (sol_raider_chief-roar.png): кадр 184×184, центр — точка опоры вожака (92, 92); кольцо без сжатия, как метка,
 * разлетается до 84 px за 8 кадров с замедлением (кадр 0 — удар, конец предупреждения). Передний край светлый, тело
 * волны — пыль, к хвосту темнее; толщина 6 → 2 px; за ней — внутреннее эхо и короткие штрихи разлёта; кольцо рвётся
 * на дуги и гаснет; комья и срезанные травинки летят с кромки и опадают.
 */
const RW = 184, RCX = 92, RCY = 92;
export const ROAR_FX = { size: RW, cx: RCX, cy: RCY, frames: 8, fps: 15, r: 84 };
export function buildRoarFx(): PC {
  const out = new PC(RW * ROAR_FX.frames, RW);
  const rad = [16, 30, 42, 53, 63, 72, 79, 84];
  const thick = [6, 5, 5, 4, 4, 3, 3, 2];
  const gap = [0, 0, 0.03, 0.07, 0.12, 0.22, 0.38, 0.58];
  const band = (c: PC, r: number, th0: number, f: number, gapP: number, tones: RGBA[], seed: number) => {
    for (let y = 0; y < RW; y++) for (let x = 0; x < RW; x++) {
      const d = Math.hypot(x + 0.5 - RCX, y + 0.5 - RCY);
      const a = Math.atan2(y + 0.5 - RCY, x + 0.5 - RCX);
      // толщина гуляет по кругу: волна неровная, местами пыль гуще
      const th = Math.max(1, th0 * (0.75 + 0.3 * Math.sin(5 * a + f + seed) + 0.2 * Math.sin(9 * a - 2 * f)));
      const u = d - (r - th);
      if (u < 0 || u > th) continue;
      const seg = Math.floor(((a + Math.PI) / TAU) * 36);
      if (hash01(seg, f, seed) < gapP) continue;
      // передний край — светлый, тело — пыль, хвост — темнее
      const k = u / th;
      c.set(x, y, tones[Math.min(tones.length - 1, Math.floor((1 - k) * tones.length))]);
    }
  };
  for (let f = 0; f < ROAR_FX.frames; f++) {
    const c = new PC(RW, RW);
    const r = rad[f];
    // эхо: тонкое, отстаёт на треть радиуса
    if (f >= 2 && f <= 4) band(c, r * 0.62, 1, f, gap[f] + 0.3, [DUST[2]], 7);
    // штрихи разлёта: короткие радиальные чёрточки сразу за кромкой
    if (f <= 5) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + hash01(k, f, 21) * 0.3;
      const r0 = r - thick[f] - 2 - 3 * hash01(k, f, 22), len = 2 + Math.round(2 * hash01(k, f, 23));
      for (let j = 0; j < len; j++) c.set(Math.round(RCX + Math.cos(a) * (r0 - j) - 0.5), Math.round(RCY + Math.sin(a) * (r0 - j) - 0.5), j === 0 ? DUST[3] : DUST[2]);
    }
    band(c, r, thick[f], f, gap[f], [WAVE, DUST[3], DUST[3], DUST[2], DUST[2], DUST[1]].slice(0, Math.max(3, thick[f])), 5);
    // клубы пыли на кромке: плоские, светлый верх, тёмный низ
    if (f >= 1 && f <= 5) for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + hash01(k, 4, 36) * 0.5;
      if (hash01(Math.floor(((a + Math.PI) / TAU) * 36), f, 5) < gap[f]) continue;
      const px = RCX + Math.cos(a) * (r + 0.5), py = RCY + Math.sin(a) * (r + 0.5) - 1;
      const rx = 2.6 - f * 0.25, ry = 1.6;
      for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
        const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry;
        if (dx * dx + dy * dy > 1) continue;
        c.set(x, y, dy > 0.3 ? DUST[1] : dx + dy < -0.4 ? WAVE : DUST[3]);
      }
    }
    // комья и травинки: вылетают с кромки, к концу опадают
    for (let k = 0; k < 22; k++) {
      if (f >= 5 && hash01(k, f, 35) < (f - 4) * 0.25) continue;
      const a = hash01(k, 1, 33) * TAU;
      const rr = r + 2 + 5 * hash01(k, 2, 34);
      const lift = Math.max(0, Math.sin(Math.min(1, f / 7) * Math.PI)) * 3 * hash01(k, 3, 34);
      const x = Math.round(RCX + Math.cos(a) * rr - 0.5), y = Math.round(RCY + Math.sin(a) * rr - 0.5 - lift);
      if (k % 3 === 0) {
        c.set(x, y, GRASS[2]);
        c.set(x + 1, y - 1, GRASS[1]);
      } else {
        c.set(x, y, DUST[3]);
        c.set(x + 1, y, DUST[2]);
        c.set(x, y + 1, DUST[1]);
        c.set(x + 1, y + 1, DUST[0]);
      }
    }
    out.blit(c, f * RW, 0);
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
/** Строки атласа tiles/terrain.png: трава и земля (Золотые нивы — поля и пашня). */
const GROUND_ROW = { grass: 6, dirt: 5 } as const;
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
/** Метка предупреждения для монтажа: круг цветом стихии (в игре её рисует клиент). */
function ring(c: PC, cx: number, cy: number, r: number, col: RGBA) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d <= r) c.set(x, y, [col[0], col[1], col[2], d > r - 2 ? 200 : 60]);
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
  ",": ["     ", "     ", "     ", "     ", "     ", "  #  ", " #   "],
  "—": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
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

/**
 * Монтаж: кадры вожака рядом с героем 32×32 на траве и на земле (×3 и ×2, масштаб игры), эффекты мира с героем:
 * огонь в нивах (нижний слой, герой, верхний слой), волна рыка, полёт факела от руки до метки.
 */
function buildPreview(sheets: Record<RaiderAnim, PC>, torch: PC, fire: PC, roar: PC, hero: PC, terrain: PC): PC {
  const W = 1880;
  const rows: { h: number; draw: (c: PC, y: number) => void }[] = [];
  const BG: RGBA = [24, 20, 26, 255];
  const frameOf = (a: RaiderAnim, view: number, i: number) => crop(sheets[a], i * N, view * N, N, N);
  const heroDown = crop(hero, 0, 0, 32, 32);
  const heroSide = crop(hero, 0, 64, 32, 32);
  // ×3: герой, вожак вниз, вверх, вбок, влево — на траве и на земле
  for (const g of ["grass", "dirt"] as Ground[]) {
    rows.push({
      h: 64 * 3 + 40,
      draw: (c, y0) => {
        const k = 3;
        text(c, `×3 · ГЕРОЙ 32 И ХРОЛЬФ 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · ${g === "grass" ? "ТРАВА" : "ЗЕМЛЯ"}`, 16, y0 + 8);
        const y = y0 + 36;
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, g);
        let x = 40;
        const hy = y + (64 - 32) * k;
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroDown, k), x, hy);
        x += 30 * k;
        for (const [v, flip] of [[0, false], [1, false], [2, false], [2, true]] as [number, boolean][]) {
          shadowBlob(c, x + 32 * k, y + 60 * k, 14 * k, 4.4 * k);
          c.blit(scaleNN(frameOf("idle", v, 0), k, flip), x, y);
          x += 64 * k;
        }
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroSide, k, true), x, hy);
      },
    });
  }
  // ×2: каждая анимация — кадры вниз и вбок
  for (const a of Object.keys(RAIDER_ANIMS) as RaiderAnim[]) {
    const A = RAIDER_ANIMS[a];
    rows.push({
      h: 64 * 2 * 2 + 40,
      draw: (c, y0) => {
        const k = 2;
        text(c, `×2 · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.next ? ` · → ${RAIDER_ANIMS[A.next].ru}` : ""}${A.hit !== undefined ? ` · УДАР — КАДР ${A.hit + 1}` : ""}`, 16, y0 + 8);
        for (const v of [0, 2]) {
          const y = y0 + 34 + (v === 0 ? 0 : 64 * k);
          groundBg(c, terrain, 16, y, W - 32, 64 * k, k, a === "walk" && v === 2 ? "dirt" : "grass");
          let x = 24;
          const hy = y + (64 - 32) * k;
          shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
          c.blit(scaleNN(v === 0 ? heroDown : heroSide, k, v === 2), x, hy);
          x += 30 * k;
          for (let i = 0; i < A.n; i++) {
            shadowBlob(c, x + 32 * k, y + 60 * k, 14 * k, 4.4 * k);
            c.blit(scaleNN(frameOf(a, v, i), k), x, y);
            x += 64 * k;
          }
        }
      },
    });
  }
  // огонь в нивах: нижний слой, герой в центре метки, верхний слой
  const fireRow = (title: string, c0: number, n: number) => rows.push({
    h: FW * 2 + 40,
    draw: (c, y0) => {
      const k = 2;
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, terrain, 16, y, W - 32, FW * k, k, "dirt");
      let x = 24;
      for (let i = 0; i < n; i++) {
        const col = c0 + i;
        c.blit(scaleNN(crop(fire, col * FW, 0, FW, FW), k), x, y);
        shadowBlob(c, x + FCX * k, y + FCY * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(heroDown, k), x + (FCX - 16) * k, y + (FCY - 30) * k);
        c.blit(scaleNN(crop(fire, col * FW, FW, FW, FW), k), x, y);
        x += FW * k + 4;
      }
    },
  });
  fireRow("×2 · ЭФФЕКТ МИРА · ОГОНЬ В НИВАХ: ЗАНЯЛОСЬ · 6 КАДРОВ · 12 К/С · КАДР 1 — ФАКЕЛ УПАЛ", FIRE_ANIMS.ignite.col, 6);
  fireRow("×2 · ОГОНЬ В НИВАХ: ГОРИТ · 8 КАДРОВ · 12 К/С · ПО КРУГУ 6 С", FIRE_ANIMS.burn.col, 8);
  fireRow("×2 · ОГОНЬ В НИВАХ: ГАСНЕТ · 6 КАДРОВ · 12 К/С", FIRE_ANIMS.out.col, 6);
  // волна рыка: вожак в центре (кадр рыка), волна по кадрам
  rows.push({
    h: RW + 40,
    draw: (c, y0) => {
      text(c, "×1 · ЭФФЕКТ МИРА · ВОЛНА РЫКА · 8 КАДРОВ · 15 К/С · КРУГ РАДИУСОМ 84 · ВОЖАК И ГЕРОИ ДЛЯ МАСШТАБА", 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, terrain, 16, y, W - 32, RW, 2, "grass");
      let x = 24;
      for (let f = 0; f < ROAR_FX.frames; f++) {
        c.blit(crop(roar, f * RW, 0, RW, RW), x, y);
        const bf = frameOf("roar", 0, Math.min(RAIDER_ANIMS.roar.n - 1, RAIDER_ANIMS.roar.hit! + Math.floor((f * 12) / 15)));
        c.blit(bf, x + RCX - 32, y + RCY - 60);
        c.blit(heroDown, x + RCX + 40 - 16, y + RCY + 20 - 30);
        c.blit(heroDown, x + RCX - 70 - 16, y + RCY - 10 - 30);
        x += RW + 40;
      }
    },
  });
  // факел: кадры крупно и полёт по дуге от руки (кадр броска) к метке, где стерня уже горит
  rows.push({
    h: FW * 2 + 40,
    draw: (c, y0) => {
      text(c, "×4 · ФАКЕЛ В ПОЛЁТЕ · 8 КАДРОВ · 16 К/С    ×2 · ПОЛЁТ ПО ДУГЕ ОТ РУКИ К МЕТКЕ ЗА 450 МС → ОГОНЬ", 16, y0 + 8);
      const y = y0 + 34;
      fill(c, 16, y, TORCH_FX.size * 4 * TORCH_FX.frames + 16, TORCH_FX.size * 4 + 16, [60, 70, 50, 255]);
      c.blit(scaleNN(torch, 4), 24, y + 8);
      const k = 2;
      const gx = 24 + TORCH_FX.size * 4 * TORCH_FX.frames + 40;
      const gw = W - 16 - gx;
      groundBg(c, terrain, gx, y, gw, FW * k, k, "grass");
      // вожак: ступни на y + 150
      const bx = gx + 8, by = y + 150 - GY * k;
      const rel = torchRelease().down;
      shadowBlob(c, bx + CX * k, by + GY * k, 14 * k, 4.4 * k);
      c.blit(scaleNN(frameOf("throw", 0, RAIDER_ANIMS.throw.hit!), k), bx, by);
      const sx = bx + (CX + rel[0]) * k, sy = by + (GY + rel[1]) * k;
      // метка: центр огня
      const tx = gx + gw - FCX * k - 8, ty = y + FCY * k;
      const fr = FIRE_ANIMS.burn.col + 2;
      ring(c, tx, ty, FIRE_R * k, [255, 130, 50, 255]);
      c.blit(scaleNN(crop(fire, fr * FW, 0, FW, FW), k), tx - FCX * k, ty - FCY * k);
      c.blit(scaleNN(heroDown, k), tx - 16 * k, ty - 30 * k);
      c.blit(scaleNN(crop(fire, fr * FW, FW, FW, FW), k), tx - FCX * k, ty - FCY * k);
      for (let i = 1; i < 8; i++) {
        const u = i / 8;
        const px = lerp(sx, tx, u), py = lerp(sy, ty, u) - Math.sin(Math.PI * u) * 70;
        c.blit(scaleNN(crop(torch, (i % TORCH_FX.frames) * TORCH_FX.size, 0, TORCH_FX.size, TORCH_FX.size), k), Math.round(px - (TORCH_FX.size / 2) * k), Math.round(py - (TORCH_FX.size / 2) * k));
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

/** «Наш | референс»: вожак вниз, вбок и вверх (покой) крупно и образец 04 той же высоты. */
function buildCompare(sheets: Record<RaiderAnim, PC>, ref: PC | null): PC {
  const k = 6;
  const views = [0, 2, 1].map((v) => crop(sheets.idle, 0, v * N, N, N));
  const H = N * k;
  const refC = ref ? crop(ref, 88, 36, 372, 492) : null;
  const refS = refC ? scaleBox(refC, Math.round((372 * H) / 492), H) : null;
  const ourW = views.length * N * k + (views.length - 1) * 16;
  const W = 24 + ourW + 24 + (refS ? refS.w + 24 : 0);
  const c = new PC(W, H + 72);
  fill(c, 0, 0, W, H + 72, [36, 32, 38, 255]);
  text(c, "НАШ", 24, 14, 3);
  if (refS) text(c, "РЕФЕРЕНС 04", 24 + ourW + 24, 14, 3);
  const y = 52;
  fill(c, 24, y, ourW, H, [214, 208, 196, 255]);
  views.forEach((v, i) => c.blit(scaleNN(v, k), 24 + i * (N * k + 16), y));
  if (refS) {
    fill(c, 24 + ourW + 8, y, 4, H, [240, 232, 214, 255]);
    c.blit(refS, 24 + ourW + 24, y);
  }
  return c;
}

/** Просмотр с анимацией: листы встроены в страницу (data:); умения — по таймингам карточки, факел ведётся по дуге в коде. */
interface SkillDoc { id: string; name: string; windupMs: number; r?: number; arc?: number; after?: { hazardMs?: number } }
function buildHtml(sheet: PC, torch: PC, fire: PC, roar: PC, hero: PC, terrain: PC, skills: SkillDoc[]): string {
  const png = (c: PC) => {
    const p = new PNG({ width: c.w, height: c.h });
    Buffer.from(c.data.buffer).copy(p.data);
    return "data:image/png;base64," + PNG.sync.write(p).toString("base64");
  };
  const grounds = (["grass", "dirt"] as Ground[]).map((g) => png(crop(terrain, 14 * 32, GROUND_ROW[g] * 32, 128, 32)));
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Хрольф Ненасытный — анимации</title>
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
<h1>Хрольф Ненасытный — вожак северных ватаг</h1>
<p>Кадр 64×64, рядом герой 32×32; масштаб игры. Вниз, вверх, вбок, влево (отражение). Скорость — как в листе.</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0" checked> трава</label><label><input type="radio" name="g" value="1"> земля</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Замах длится windupMs из карточки (связка «замах → удержание по кругу»), кадр удара приходится на конец предупреждения. Факел срывается с руки раньше на время полёта и падает в метку ровно в конце предупреждения — стерня горит hazardMs. Рык — волна от вожака до края круга. Метки предупреждения в игре рисует клиент.</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const ANIMS = ${JSON.stringify(RAIDER_ANIMS)};
const FIRE = ${JSON.stringify({ ...FIRE_FX, anims: FIRE_ANIMS })};
const ROAR = ${JSON.stringify(ROAR_FX)};
const TORCH = ${JSON.stringify({ ...TORCH_FX, release: torchRelease() })};
const SKILLS = ${JSON.stringify(skills.map((s) => ({ ...s, ...RAIDER_SKILLS[s.id] })))};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${png(sheet)}"), torchImg = img("${png(torch)}"), fireImg = img("${png(fire)}"), roarImg = img("${png(roar)}"), hero = img("${png(hero)}");
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
  const a = document.getElementById("arena"); a.width = 380 * zoom; a.height = 230 * zoom;
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
    shadow(g, bx + 32, by + 60, 14, 4.4); shadow(g, 18, by + 62, 7, 2.4);
    drawBoss(g, A.col + frame, row, flip, bx, by);
    g.drawImage(hero, 0, row === 1 ? 32 : row === 2 ? 64 : 0, 32, 32, 2 * zoom, (by + 32) * zoom, 32 * zoom, 32 * zoom);
    g.fillStyle = "#efe6d2"; g.font = (6 * zoom) + "px system-ui"; g.fillText(name, 4 * zoom, 10 * zoom);
  }
}
// ---- умения: связка анимаций по времени, факел по дуге, огонь и волна — эффекты мира ----
const sbar = document.getElementById("skills");
let skill = null, t0 = 0;
for (const s of SKILLS) {
  const b = document.createElement("button");
  b.textContent = s.name + " · замах " + (s.windupMs / 1000).toFixed(1).replace(".", ",") + " с";
  b.onclick = () => { skill = s; t0 = performance.now(); };
  sbar.appendChild(b);
}
/** Когда начинается удар: кадр hit — в конце предупреждения (у факела — раньше на время полёта). */
function strikeAt(s) { const St = ANIMS[s.strike]; return s.windupMs - (s.flyMs || 0) - (St.hit / St.fps) * 1000; }
function bossFrameAt(s, t) {
  const W = ANIMS[s.windup[0]], Hd = ANIMS[s.windup[1]], St = ANIMS[s.strike];
  const sa = strikeAt(s);
  if (t < 0) return ANIMS.idle.col;
  if (t < Math.min(sa, (W.n / W.fps) * 1000)) return W.col + Math.min(W.n - 1, Math.floor((t / 1000) * W.fps));
  if (t < sa) return Hd.col + (Math.floor(((t - (W.n / W.fps) * 1000) / 1000) * Hd.fps) % Hd.n);
  const k = Math.floor(((t - sa) / 1000) * St.fps);
  return k < St.n ? St.col + k : ANIMS.idle.col + (Math.floor((t / 1000) * 12) % 12);
}
function fireFrameAt(s, t) {
  const k = Math.floor(((t - s.windupMs) / 1000) * 12);
  const I = FIRE.anims.ignite, B = FIRE.anims.burn, O = FIRE.anims.out;
  if (k < 0) return -1;
  if (k < I.n) return I.col + k;
  const burnN = Math.round((((s.after && s.after.hazardMs) || 6000) / 1000) * 12) - I.n;
  if (k < I.n + burnN) return B.col + ((k - I.n) % B.n);
  const j = k - I.n - burnN;
  return j < O.n ? O.col + j : -1;
}
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  const bx = 150, by = 40, foot = [bx + 32, by + 60];
  const t = skill ? ts - t0 : -1;
  const heroes = [[foot[0] + 40, foot[1] + 6], [foot[0] - 130, foot[1] + 60], [foot[0] + 140, foot[1] + 80]];
  const tank = heroes[0], target = heroes[2];
  const tele = skill && t >= 0 && t < skill.windupMs;
  const paint = (k) => { g.fillStyle = k === "fire" ? "rgba(255,120,40,.25)" : "rgba(255,70,50,.22)"; g.strokeStyle = k === "fire" ? "#ff8a3a" : "#ff5a40"; g.lineWidth = zoom; };
  if (skill && tele && skill.id === "axe_sweep") {
    const ang = Math.atan2(tank[1] - foot[1], tank[0] - foot[0]), w = (skill.arc || 90) * Math.PI / 360;
    paint("phys"); g.beginPath(); g.moveTo(foot[0] * zoom, foot[1] * zoom); g.arc(foot[0] * zoom, foot[1] * zoom, (skill.r || 96) * zoom, ang - w, ang + w); g.closePath(); g.fill(); g.stroke();
  }
  if (skill && tele && skill.id === "torch_throw") { paint("fire"); g.beginPath(); g.arc(target[0] * zoom, target[1] * zoom, (skill.r || 44) * zoom, 0, 7); g.fill(); g.stroke(); }
  if (skill && tele && skill.id === "war_roar") { paint("phys"); g.beginPath(); g.arc(foot[0] * zoom, foot[1] * zoom, (skill.r || 84) * zoom, 0, 7); g.fill(); g.stroke(); }
  const fireCol = skill && skill.fx === "fire" ? fireFrameAt(skill, t) : -1;
  const fireAt = (row) => { if (fireCol >= 0) g.drawImage(fireImg, fireCol * FIRE.size, row * FIRE.size, FIRE.size, FIRE.size, (target[0] - FIRE.cx) * zoom, (target[1] - FIRE.cy) * zoom, FIRE.size * zoom, FIRE.size * zoom); };
  fireAt(0);
  if (skill && skill.fx === "roar") {
    const k = Math.floor(((t - skill.windupMs) / 1000) * ROAR.fps);
    if (k >= 0 && k < ROAR.frames) g.drawImage(roarImg, k * ROAR.size, 0, ROAR.size, ROAR.size, (foot[0] - ROAR.cx) * zoom, (foot[1] - ROAR.cy) * zoom, ROAR.size * zoom, ROAR.size * zoom);
  }
  shadow(g, foot[0], foot[1], 14, 4.4);
  drawBoss(g, skill ? bossFrameAt(skill, t) : ANIMS.idle.col + (Math.floor(ts / 1000 * 12) % 12), 0, false, bx, by);
  for (const h of heroes) { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); }
  fireAt(1);
  // факел: от кулака (кадр броска) по дуге к метке за flyMs, кадр — оборот палки
  if (skill && skill.id === "torch_throw") {
    const rel = skill.windupMs - skill.flyMs, u = (t - rel) / skill.flyMs;
    if (u >= 0 && u < 1) {
      const sx = foot[0] + TORCH.release.down[0], sy = foot[1] + TORCH.release.down[1];
      const x = sx + (target[0] - sx) * u, y = sy + (target[1] - sy) * u - Math.sin(Math.PI * u) * 40;
      const f = Math.floor(((t - rel) / 1000) * TORCH.fps) % TORCH.frames;
      g.drawImage(torchImg, f * TORCH.size, 0, TORCH.size, TORCH.size, Math.round(x - TORCH.size / 2) * zoom, Math.round(y - TORCH.size / 2) * zoom, TORCH.size * zoom, TORCH.size * zoom);
    }
  }
  if (skill && t > skill.windupMs + ((skill.after && skill.after.hazardMs) || 0) + 1600) skill = null;
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

/**
 * Проверка листа по кадрам fw×fh: ни одного непрозрачного пикселя на краях кадра (иначе спрайт срезан краем) и, если
 * slits, ни одной замкнутой щели шириной 1 px и прокола до 3 px внутри силуэта. Возвращает список нарушений.
 */
export function checkFrames(name: string, sheet: PC, fw: number, fh: number, slits: boolean): string[] {
  const bad: string[] = [];
  for (let row = 0; row < sheet.h / fh; row++) for (let col = 0; col < sheet.w / fw; col++) {
    const cell = crop(sheet, col * fw, row * fh, fw, fh);
    const A = (x: number, y: number) => cell.alpha(x, y) >= 128;
    let edge = 0;
    for (let k = 0; k < fw; k++) edge += (A(k, 0) ? 1 : 0) + (A(k, fh - 1) ? 1 : 0);
    for (let k = 1; k < fh - 1; k++) edge += (A(0, k) ? 1 : 0) + (A(fw - 1, k) ? 1 : 0);
    if (edge) bad.push(`${name}: столбец ${col}, строка ${row} — ${edge} px на краю кадра`);
    if (slits) {
      const n = holes(cell).filter((c) => c.length <= 3 || isSlit(c, fw)).length;
      if (n) bad.push(`${name}: столбец ${col}, строка ${row} — щелей в силуэте: ${n}`);
    }
  }
  return bad;
}

/** Всё для утверждения: листы анимаций, общий лист, эффекты мира, монтажи и страница просмотра. */
export function writeRaiderArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => {
    const f = path.join(outDir, `${BOSS}-${name}.png`);
    c.save(f);
    files.push(f);
    return c;
  };
  const sheets = {} as Record<RaiderAnim, PC>;
  for (const a of Object.keys(RAIDER_ANIMS) as RaiderAnim[]) sheets[a] = save(buildRaiderAnim(a), a);
  const sheet = save(buildRaiderSheet(sheets), "sheet");
  const torch = save(buildTorchFx(), "torch");
  const fire = save(buildFireFx(), "fire");
  const roar = save(buildRoarFx(), "roar");
  // проверка всех кадров: края и щели — у вожака, края — у эффектов мира
  const problems = [
    ...checkFrames("вожак", sheet, N, N, true),
    ...checkFrames("факел в полёте", torch, TORCH_FX.size, TORCH_FX.size, false),
    ...checkFrames("огонь в нивах", fire, FW, FW, false),
    ...checkFrames("волна рыка", roar, RW, RW, false),
  ];
  if (problems.length) {
    console.error(`${BOSS}: проверка кадров — ${problems.length} нарушений`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else console.log(`${BOSS}: проверка кадров — края и щели чистые (${RAIDER_COLS * 3} кадров вожака, эффекты мира)`);
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "bosses", "04.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  save(buildPreview(sheets, torch, fire, roar, hero, terrain), "preview");
  save(buildCompare(sheets, ref), "compare");
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "zone-bosses.json"), "utf8")) as { bosses: { id: string; abilities: SkillDoc[] }[] };
  const skills = (data.bosses.find((b) => b.id === BOSS)?.abilities ?? []).map(({ id, name, windupMs, r, arc, after }) => ({ id, name, windupMs, r, arc, after }));
  const html = path.join(outDir, `${BOSS}-anim.html`);
  fs.writeFileSync(html, buildHtml(sheet, torch, fire, roar, hero, terrain, skills), "utf8");
  files.push(html);
  return files;
}
