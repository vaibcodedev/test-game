/**
 * Боссы стартовых земель (задача 136, шаг 3): Ардрик Вернувшийся, серпоносец Курганов Мёртвых (data/zone-bosses.json,
 * id umb_revenant_reaper; образец tools/out/refs/bosses/07.png — только для сравнения, в игру и в git не идёт).
 * Тем же способом и по тем же правилам, что пилот-древень (tools/gen/zone-bosses-art.ts). В игру пока не подключён: механика — шаг 4.
 *
 * Лист: кадр 64×64, пиксель листа = пиксель мира. Строки: 0 — вниз, 1 — вверх, 2 — вбок вправо (влево — отражение).
 * Столбцы — анимации подряд: REAPER_ANIMS (первый столбец, кадров, кадров/с, что дальше); общий лист — …-sheet.png (98 столбцов).
 * Ступни на y = 60 (точка опоры 30/32 кадра, как у всех юнитов); рост с гребнем шлема ≈ 55 px — почти вдвое выше героя
 * (29 px в кадре 32×32), как древень; ниже рейд-босса.
 *
 * Как устроено: движок пилота — скелет в 3D (X — вправо от ревенанта, Y — вперёд, Z — вверх), IK рук и ног, тело из объёмных
 * примитивов в поле расстояний, луч на пиксель (ортографическая камера, наклон 14°), свет сверху слева → 5 тонов на материал,
 * тень от света, затенение складок, швы между деталями тоном тени, контур 1 px. В общем файле движок не экспортирован, а правится
 * там только строка регистрации, поэтому он повторён здесь и дополнен тремя деталями:
 *  - лист ткани по дуге вокруг тела (плащ, подол кольчуги, набедренник): контур из точек (угол, высота), складки, лохмотья;
 *  - лезвие-полумесяц косы: круг минус круг, выдавленный в толщину; тоны по ширине — тёмная внутренняя кромка, светлая режущая
 *    снаружи (правило, а не свет: лезвие читается в любом повороте);
 *  - плита надгробия (эффект мира).
 * Кольчуга — шахматка двух тонов, привязанная к опорной точке детали в целых пикселях: при сдвиге тела на пиксель рисунок
 * едет вместе с ним и не «кипит». Корпус, голова, плащ и коса в покое и ходьбе сдвигаются только на целые пиксели кадра (snapPx);
 * лохмотья плаща качаются по пикселю (меняется только край); визор с фиолетовыми глазами и пряжка-череп — штампы.
 * Коса — главный узнаваемый элемент, как на образце: древко 50 (почти в рост), полумесяц с хордой 32 (≈ 30 px в кадре, верх —
 * выше плеча), лезвие скошено к древку (RAKE) и сидит гнездом чуть ниже середины дуги (OFF). Вниз и вверх — наискосок перед
 * телом в двух руках: полумесяц стоит почти отвесно сбоку от тела (вниз — слева), древко через пояс и грудь, навершие выходит
 * за левый наплечник; вбок — в правой руке, полумесяц впереди, древко наискось назад за плечо. В замахах лезвие наклонено
 * (дугой над плечом или головой), чтобы не выходить за кадр.
 * Гибель: коса падает назад или вбок, от зрителя; тело на коленях отходит от зрителя и уходит в курган, широкий по кадру и
 * неглубокий к зрителю, — ни один кадр не доходит до нижнего края. Проверка frameEdgeCuts при каждом прогоне: края кадра
 * (всех листов и эффектов мира) касается только цвет контура, иначе — предупреждение со списком кадров и код выхода 1.
 * Эффекты мира — отдельными листами: руки мертвецов из курганов (…-handsfx.png) и падающее надгробие (…-stonefx.png).
 *
 * Запуск: npx tsx tools/gen/zone-bosses.ts art → tools/out/zone-bosses/umb_revenant_reaper-*.png и umb_revenant_reaper.html.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "./canvas";
import type { ZView } from "./zone-bosses-art";

const ID = "umb_revenant_reaper";
/** = ZB_FRAME пилота (значение не импортируется: модули ссылаются друг на друга, константа нужна при загрузке). */
const N = 64;
const CX = 32, GY = 60;
/** Наклон камеры: чуть сверху — как у пилота. */
const CAM = (14 * Math.PI) / 180;
const CS = Math.cos(CAM), SN = Math.sin(CAM);
/** Подъём в мире на PX — ровно 1 px кадра по вертикали. */
const PX = 1 / CS;
const VIEWS: ZView[] = ["down", "up", "side"];
/** Метка кадра для отладочных предупреждений (REAPER_REACH=1: кулак не дотянулся до хвата). */
let dbgTag = "";

// ---------------- палитра ----------------
const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
/** Пыльная сталь: шлем, наплечники, наручи, поножи. Тени холоднее, свет — пыльно-тёплый. */
const STEEL = R("#1c1d23", "#363941", "#595c62", "#85857f", "#b9b5a6");
/** Кольчуга — темнее стали; шахматка двух соседних тонов. */
const MAIL = R("#17171c", "#2a2b31", "#43454a", "#626260", "#86847b");
/** Рваная пепельно-коричневая ткань плаща и набедренника. */
const CLOTH = R("#161110", "#2a201d", "#3f322b", "#574739", "#72604d");
const LEATHER = R("#170f0b", "#2b1d14", "#43301f", "#5d432b", "#7a5c3b");
const WOOD = R("#1f150d", "#3b2817", "#5a3f23", "#7b5932", "#9f7946");
/** Лезвие — холодное серебро, светлее стали: главный блик силуэта. */
const BLADE = R("#252b33", "#525c67", "#8b949c", "#c7cdcd", "#f4f7f2");
const BONE = R("#37302a", "#665b48", "#968a6d", "#c3b893", "#e8e0c0");
const STONE = R("#1b1c22", "#34363d", "#53555b", "#7a7a76", "#a6a497");
/** Руки мертвецов: серо-зелёная мёртвая кожа, костяшки светлее. */
const CORPSE = R("#1a1f1b", "#323a31", "#4e5947", "#717c61", "#99a183");
/** Фиолетовый свет глаз и чар Умбрата (тёмный → светлый). */
const EYE = R("#3a145c", "#7a34c2", "#b06eff", "#ecd8ff");
const GLOW_P = hex("#9c5ce6");
/** Пустота под визором. */
const VOID = hex("#0d0a11");
const OUT = hex("#110d12");
/** Гибель: всё выцветает в пепел. */
const DEAD = R("#151418", "#28262b", "#3d3a3e", "#565254", "#736d6a");
/** Пыль и земля курганов: плоские непрозрачные тоны, низ тёмный. */
const DUST = R("#3d3530", "#685c50", "#91836f", "#bbad93");
const EARTH = R("#1c1612", "#372a20", "#55432f", "#755f45", "#9a8261");
/** След косы и вспышка: бледное серебро с фиолетовой кромкой, без полупрозрачности. */
const SMEAR = R("#4b3e6a", "#a59bc8", "#efebf8");
const FLASH = R("#9a5ce0", "#dbc6ff", "#fbf7ff");

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
/** Сдвиг в мире → сдвиг ровно на целые пиксели кадра в этом виде (без составляющей вдоль луча): рисунок тела не перерисовывается. */
function snapPx(view: ZView, w: V3): V3 {
  const v = toView(view, w);
  const sx = Math.round(v[0]), sy = Math.round(SN * v[1] - CS * v[2]);
  return fromView(view, [sx, 0, -sy * PX]);
}
/** Сдвиг на целые пиксели кадра [вправо, вниз] → мир. */
const pxToWorld = (view: ZView, dx: number, dy: number): V3 => fromView(view, [dx, 0, -dy * PX]);

// ---------------- материалы и примитивы ----------------
const M_STEEL = 0, M_MAIL = 1, M_CLOTH = 2, M_LEATHER = 3, M_WOOD = 4, M_BLADE = 5, M_BONE = 6, M_STONE = 7, M_CORPSE = 8, M_EARTH = 9, M_RUNE = 10;
interface MatDef { ramp: Ramp; base: number; gain: number; lo: number; hi: number }
/** Тон = base + gain·(n·L): обращённое к зрителю — середина, к свету — свет, блик (4) — только близко к направлению света. */
const MATS: MatDef[] = [
  { ramp: STEEL, base: 1.55, gain: 2.7, lo: 1, hi: 4 },
  { ramp: MAIL, base: 1.6, gain: 2.3, lo: 1, hi: 4 },
  { ramp: CLOTH, base: 1.5, gain: 2.3, lo: 1, hi: 4 },
  { ramp: LEATHER, base: 1.45, gain: 2.3, lo: 1, hi: 4 },
  { ramp: WOOD, base: 1.7, gain: 2.3, lo: 1, hi: 4 },
  { ramp: BLADE, base: 2.0, gain: 2.0, lo: 1, hi: 4 },
  { ramp: BONE, base: 1.8, gain: 2.3, lo: 1, hi: 4 },
  { ramp: STONE, base: 1.55, gain: 2.5, lo: 1, hi: 4 },
  { ramp: CORPSE, base: 1.55, gain: 2.4, lo: 1, hi: 4 },
  { ramp: EARTH, base: 1.5, gain: 2.4, lo: 1, hi: 4 },
  /** светящаяся резьба надгробия (тон задаёт правило, не свет) */
  { ramp: [EYE[0], EYE[1], EYE[2], EYE[3], EYE[3]], base: 2, gain: 0, lo: 0, hi: 4 },
];

/**
 * Лист ткани по дуге вокруг оси: радиус от r0 (верх, h0) к r1 (низ, h1), складки fa·sin(fk·θ+fp), отлёт назад flare; контур —
 * (u = θ·R, h). ex > 1 — сечение вытянуто вбок (накидка на плечи); оценка расстояния при этом остаётся снизу.
 */
interface SheetDef { h0: number; h1: number; r0: number; r1: number; fa: number; fk: number; fp: number; th: number; flare: number; ex?: number; poly: [number, number][] }
/** Полумесяц: круг ra в начале координат минус круг rb в (d, 0); выпуклая сторона — к −x; полутолщина th. */
interface MoonDef { ra: number; rb: number; d: number; th: number }
/** Плита надгробия: прямоугольник 2w × h со скруглённым верхом радиуса w, полутолщина th, скругление кромок rr. */
interface SlabDef { w: number; h: number; th: number; rr: number }

interface Prim {
  /** 0 — конус со скруглёнными концами (шар, если a = b), 1 — эллипсоид, 2 — лист ткани, 3 — полумесяц, 4 — плита */
  k: number;
  a: V3; b: V3; ra: number; rb: number;
  ax: [V3, V3, V3]; r: V3;
  mat: number; g: number; part: number;
  /** текстура: 0 — гладко, 3 — кольчуга (шахматка от опорной точки anc), 5 — лезвие */
  tex: number; ref: V3; seed: number;
  /** пояс другого материала: доля длины конуса */
  band?: [number, number]; bandMat: number;
  /** поправка тона; у листа — поправка тона изнанки */
  tone: number; inner: number;
  anc: V3;
  /** резьба на лицевой стороне плиты: −1 — нет, 0 — тёмный желобок, > 0 — светится фиолетовым */
  eng: number;
  sh?: SheetDef; mo?: MoonDef; sl?: SlabDef;
  /** производные (в пространстве вида) */
  sph: boolean; ba: V3; l2: number; rr: number; a2: number; il2: number; len: number; bc: V3; br: number;
}
interface Opt { mat?: number; tex?: number; ref?: V3; seed?: number; band?: [number, number]; bandMat?: number; part?: number; tone?: number; inner?: number; anc?: V3; eng?: number }

/** Штамп: визор с глазами, пряжка-череп — готовый рисунок в целых пикселях у точки на поверхности. */
interface Stamp { kind: "visor" | "skull"; at: V3; n: V3; glow: number }
/** Частица в мире: ком земли, огонёк; size 2 — пиксель и тёмный под ним. */
interface Mote { p: V3; col: RGBA; dark?: RGBA; size?: number }
/** Плоский клуб пыли у земли (координаты модели). */
interface Puff { c: V3; k: number; seed: number }

class Scene {
  prims: Prim[] = [];
  gk: number[] = [];
  stamps: Stamp[] = [];
  motes: Mote[] = [];
  puffs: Puff[] = [];
  /** след косы: точки пути кромки лезвия (мир); группы, поверх которых след не рисуется */
  smears: { pts: V3[]; protect: number[] }[] = [];
  flash: { at: V3; k: number } | null = null;
  /** блик на кромке лезвия; огонёк чар над ладонью; волна удара о землю */
  sparks: { at: V3; k: number }[] = [];
  orbs: { at: V3; k: number }[] = [];
  rings: { c: V3; r: number; k: number }[] = [];
  armG: [number, number] = [-1, -1];
  scyG = -1;
  parts = 0;
  group(k: number): number {
    this.gk.push(k);
    return this.gk.length - 1;
  }
  private push(q: Prim) {
    this.prims.push(q);
    return q;
  }
  private base(k: number, g: number, a: V3, b: V3, ax: [V3, V3, V3], o: Opt): Prim {
    return {
      k, a, b, ra: 0, rb: 0, ax, r: [0, 0, 0],
      mat: o.mat ?? M_STEEL, g, part: o.part ?? g, tex: o.tex ?? 0, ref: o.ref ?? ax[0], seed: o.seed ?? 0,
      band: o.band, bandMat: o.bandMat ?? M_LEATHER, tone: o.tone ?? 0, inner: o.inner ?? 0, anc: o.anc ?? a, eng: o.eng ?? -1,
      sph: false, ba: [0, 0, 0], l2: 0, rr: 0, a2: 0, il2: 0, len: 0, bc: a, br: 0,
    };
  }
  cone(g: number, a: V3, ra: number, b: V3, rb: number, o: Opt = {}): Prim {
    const q = this.base(0, g, a, b, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o);
    q.ra = ra;
    q.rb = rb;
    q.r = [ra, ra, ra];
    q.ref = o.ref ?? perp(sub(b, a), [0, 1, 0.01]);
    return this.push(q);
  }
  ball(g: number, c: V3, r: number, o: Opt = {}): Prim {
    return this.cone(g, c, r, c, r, o);
  }
  ell(g: number, c: V3, r: V3, ax: [V3, V3, V3], o: Opt = {}): Prim {
    const q = this.base(1, g, c, c, ax, o);
    q.r = r;
    return this.push(q);
  }
  /** Лист ткани: a — точка оси на высоте 0 листа, ax — [вбок (θ > 0), наружу при θ = 0, вверх]. */
  sheet(g: number, a: V3, ax: [V3, V3, V3], sh: SheetDef, o: Opt = {}): Prim {
    const q = this.base(2, g, a, a, ax, o);
    q.sh = sh;
    return this.push(q);
  }
  /** Полумесяц: a — центр внешнего круга, ax — [x (к вогнутой стороне), y (вдоль размаха), нормаль]. */
  moon(g: number, a: V3, ax: [V3, V3, V3], mo: MoonDef, o: Opt = {}): Prim {
    const q = this.base(3, g, a, a, ax, o);
    q.mo = mo;
    return this.push(q);
  }
  /** Плита: a — середина низа, ax — [вправо, вверх, к лицевой стороне]. */
  slab(g: number, a: V3, ax: [V3, V3, V3], sl: SlabDef, o: Opt = {}): Prim {
    const q = this.base(4, g, a, a, ax, o);
    q.sl = sl;
    return this.push(q);
  }
  newPart() {
    return 1000 + this.parts++;
  }
}

/** Контур листа из точек (θ, h) → (u = θ·R(h), h): так длина дуги считается на своём радиусе. */
function sheetDef(d: Omit<SheetDef, "poly">, pts: [number, number][]): SheetDef {
  const Rb = (h: number) => d.r0 + (d.r1 - d.r0) * clamp((d.h0 - h) / (d.h0 - d.h1), 0, 1);
  return { ...d, poly: pts.map(([t, h]) => [t * Rb(h), h] as [number, number]) };
}

/** Примитив в пространство вида (null — уже в нём, как у эффектов мира) + производные для поля расстояний. */
function prepare(q: Prim, view: ZView | null) {
  if (view) {
    q.a = toView(view, q.a);
    q.b = toView(view, q.b);
    q.ref = toView(view, q.ref);
    q.anc = toView(view, q.anc);
    q.ax = [toView(view, q.ax[0]), toView(view, q.ax[1]), toView(view, q.ax[2])];
  }
  if (q.k === 1) {
    q.bc = q.a;
    q.br = Math.max(q.r[0], q.r[1], q.r[2]);
    q.len = 2 * q.r[2];
    return;
  }
  if (q.k === 2) {
    const S = q.sh!;
    q.bc = add(q.a, mul(q.ax[2], (S.h0 + S.h1) / 2));
    q.br = Math.hypot((S.h0 - S.h1) / 2, Math.max(S.r0, S.r1) + S.fa + S.flare + S.th) + 0.3;
    return;
  }
  if (q.k === 3) {
    q.bc = q.a;
    q.br = q.mo!.ra + q.mo!.th + 0.3;
    return;
  }
  if (q.k === 4) {
    const L = q.sl!;
    q.bc = add(q.a, mul(q.ax[1], (L.h + L.w) / 2));
    q.br = Math.hypot(L.w, (L.h + L.w) / 2) + L.th + 0.3;
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
/** Крупная форма: ей одной даётся светлая кромка к свету. */
const bigPrim = (q: Prim) =>
  q.k === 2 || q.k === 4 ? true : q.k === 3 ? false : q.k === 1 ? [...q.r].sort((a, b) => b - a)[1] >= 3.6 : Math.max(q.ra, q.rb) >= 3.4;

/** Расстояние до многоугольника на плоскости (И. Квилес). */
function sdPoly(x: number, y: number, v: [number, number][]): number {
  let d = (x - v[0][0]) ** 2 + (y - v[0][1]) ** 2;
  let s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1];
    const wx = x - v[i][0], wy = y - v[i][1];
    const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    const bx = wx - ex * h, by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = y >= v[i][1], c2 = y < v[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
/** Полумесяц на плоскости (И. Квилес, sdMoon). */
function sdMoon2(px: number, py: number, d: number, ra: number, rb: number): number {
  py = Math.abs(py);
  const a = (ra * ra - rb * rb + d * d) / (2 * d);
  const b = Math.sqrt(Math.max(ra * ra - a * a, 0));
  if (d * (px * b - py * a) > d * d * Math.max(b - py, 0)) return Math.hypot(px - a, py - b);
  return Math.max(Math.hypot(px, py) - ra, -(Math.hypot(px - d, py) - rb));
}
/** Выдавливание фигуры на плоскости в толщину. */
const extrude = (d2: number, dz: number) => Math.min(Math.max(d2, dz), 0) + Math.hypot(Math.max(d2, 0), Math.max(dz, 0));

function sheetLocal(q: Prim, px: number, py: number, pz: number) {
  const S = q.sh!, A = q.ax;
  const lx = (px * A[0][0] + py * A[0][1] + pz * A[0][2]) / (S.ex ?? 1);
  const ly = px * A[1][0] + py * A[1][1] + pz * A[1][2];
  const lz = px * A[2][0] + py * A[2][1] + pz * A[2][2];
  const th = Math.atan2(lx, ly);
  const r = Math.sqrt(lx * lx + ly * ly);
  const t = clamp((S.h0 - lz) / (S.h0 - S.h1), 0, 1);
  const Rb = S.r0 + (S.r1 - S.r0) * t;
  const R = Rb + S.fa * t * Math.sin(S.fk * th + S.fp) + S.flare * t * t * Math.max(0, Math.cos(th));
  return { th, r, R, Rb, lz, t };
}

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
  if (q.k === 2) {
    const { th, r, R, Rb, lz } = sheetLocal(q, px, py, pz);
    // расстояние по контуру — в длине дуги на радиусе листа; ближе к оси дуга короче — оценка остаётся снизу
    const d2 = sdPoly(th * Rb, lz, q.sh!.poly) * Math.min(1, r / Rb);
    return extrude(d2, Math.abs(r - R) - q.sh!.th);
  }
  if (q.k === 3) {
    const M = q.mo!, A = q.ax;
    const lx = px * A[0][0] + py * A[0][1] + pz * A[0][2];
    const ly = px * A[1][0] + py * A[1][1] + pz * A[1][2];
    const lz = px * A[2][0] + py * A[2][1] + pz * A[2][2];
    return extrude(sdMoon2(lx, ly, M.d, M.ra, M.rb), Math.abs(lz) - M.th);
  }
  if (q.k === 4) {
    const L = q.sl!, A = q.ax;
    const lx = px * A[0][0] + py * A[0][1] + pz * A[0][2];
    const ly = px * A[1][0] + py * A[1][1] + pz * A[1][2];
    const lz = px * A[2][0] + py * A[2][1] + pz * A[2][2];
    const w = L.w - L.rr;
    const bx = Math.abs(lx) - w, by = Math.abs(ly - L.h / 2) - L.h / 2;
    const dBox = Math.min(Math.max(bx, by), 0) + Math.hypot(Math.max(bx, 0), Math.max(by, 0));
    const dTop = Math.hypot(lx, ly - L.h) - w;
    return extrude(Math.min(dBox, dTop), Math.abs(lz) - (L.th - L.rr)) - L.rr;
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
/** Коса: [хват правой руки (от покоя тела, едет вместе с ним), направление древка к навершию, размах лезвия]. */
type Scy = [V3, V3, V3];
interface Pose {
  /** сдвиг тела: x — вправо, y — вперёд (в кадре — на целые пиксели); руки и коса едут вместе с ним */
  root: V3;
  /** таз выше/ниже покоя (мир; в кадре — на целые пиксели) */
  bob: number;
  /** дыхание: подъём груди с плечами и головой и головы сверх груди — целые пиксели кадра */
  chest: number; headZ: number;
  /** корпус: наклон вперёд, разворот, крен (рад); голова относительно корпуса */
  pitch: number; yaw: number; roll: number;
  hp: number; hy: number; hr: number;
  /** кулаки [правый, левый] (правый — хват косы, пока held); локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** щиколотки в мире и наклон ступни (носок вверх > 0) */
  foot: [V3, V3]; toe: [number, number];
  /** коса; lb — от кулака до конца древка у лезвия (хват скользит по древку); held — в правой руке; lgrip — левый кулак на древке (< −50 — рука свободна) */
  scy: Scy; lb: number; held: number; lgrip: number;
  /** подъём руки целиком — целые пиксели кадра («дрожь» в удержании без пересчёта руки) */
  armLift: [number, number];
  /** лохмотья плаща [правое, среднее, левое]: подъём кончика и сдвиг по дуге — целые пиксели; отлёт подола назад */
  cape: [number, number, number]; capeU: [number, number, number]; flare: number;
  /** боковые лохмотья плаща [правое, левое]: подъём кончика — целые пиксели */
  rag: [number, number];
  /** подол плаща собран к телу 0..1 (на коленях при гибели плащ ложится вокруг, а не стоит колоколом к зрителю) */
  hem: number;
  /** свечение глаз 0..1.5; увядание 0..1; уход в землю (px) */
  glow: number; wither: number; sink: number;
  /** тело дальше от зрителя (мир, вдоль луча вида, без привязки к пикселям): на коленях при гибели широкие плечи, руки и
   *  подол плаща не дотягиваются до нижнего края кадра */
  away: number;
  /** пыль от шага [пр, лев]; вспышка удара; комья земли у навершия */
  dust: [number, number]; flash: number; clods: number;
  /** огонёк чар над левой ладонью; волна от удара навершием о землю 0..1; блик на кромке 0..1 (0 — нет); души-огоньки 0..1 */
  orb: number; ring: number; glint: number; wisps: number;
  /** лезвие налито фиолетовым светом 0..1 (ступенями); левая перчатка раскрыта 0..1; курган земли поверх ушедшего тела 0..1 */
  charge: number; lopen: number; mound: number;
  /** след кромки лезвия (мир, от покоя тела) */
  trail?: V3[];
  /** пыль у лезвия при ударе 0..1; где вспышка (мир) */
  puff?: number; flashAt?: V3;
  /** фаза кадра 0..1 и номер — для частиц */
  t: number; seed: number;
}

const HIP0 = 21;
const NECK: V3 = [0, 0.3, 38.6];
/** Плечо, предплечье до середины кулака; бедро, голень. */
const ARM: [number, number] = [8.0, 8.8];
const LEG: [number, number] = [9.2, 9.4];
/** Длина древка: от конца у лезвия до навершия (почти в рост, как на образце: в покое навершие выходит за наплечник). */
const SHAFT = 50;
/**
 * Полумесяц по полухорде, стреле дуги и ширине посередине → внешний круг ra, вырез rb со сдвигом d (вырез больше круга —
 * дуга пологая, кончики острые). Хорда 32 — в кадре ≈ 30 px, от плеча до голени: главный узнаваемый элемент, как на образце 07.
 */
function moonOf(half: number, sag: number, mid: number, th: number): MoonDef {
  const ra = (half * half + sag * sag) / (2 * sag);
  const d = (mid * (2 * ra - mid)) / (2 * (sag - mid));
  return { ra, rb: ra - mid + d, d, th };
}
const MOON: MoonDef = moonOf(16, 9.2, 3.4, 0.55);
/**
 * Лезвие на древке: скошено к древку на RAKE (ось полумесяца повёрнута от древка к стороне −размаха — когда древко идёт
 * наискось вверх, хорда стоит почти отвесно, как на образце); древко входит в вогнутую кромку на OFF ниже середины дуги —
 * верхний рог длиннее нижнего.
 */
const RAKE = -0.33, OFF = 3;

/**
 * Покой, вниз и вверх: коса наискосок перед телом в двух руках, как на образце — гнездо лезвия у правого бедра далеко в стороне,
 * полумесяц стоит почти отвесно от плеча до голени (вниз — слева от тела), древко через пояс и грудь, навершие выходит
 * за левый наплечник.
 */
const SCY_FRONT: Scy = scyAt([24.5, 8, 22.6], [-0.92, -0.03, 0.39], [0.39, 0, 0.92], 12);
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.06, yaw: 0, roll: 0, hp: -0.06, hy: 0, hr: 0,
  hand: [SCY_FRONT[0], add(SCY_FRONT[0], mul(SCY_FRONT[1], 12.5))], pole: [[1, -0.6, -0.7], [-0.4, 0.2, -1]],
  foot: [[3.9, 1.4, 3.6], [-3.9, -1.0, 3.6]], toe: [0, 0],
  scy: SCY_FRONT, lb: 12, held: 1, lgrip: 12.5,
  armLift: [0, 0], cape: [0, 0, 0], capeU: [0, 0, 0], rag: [0, 0], flare: 0, hem: 0,
  glow: 0.9, wither: 0, sink: 0, away: 0, dust: [0, 0], flash: 0, clods: 0, orb: 0, ring: 0, glint: 0, wisps: 0, charge: 0, lopen: 0, mound: 0, t: 0, seed: 1,
};
/** Покой, вбок: коса в правой руке — полумесяц стоит впереди от плеча до голени, древко наискось назад за плечо; левая рука висит. */
const SCY_SIDE: Scy = scyAt([10, 22.5, 22.6], [0, -0.9, 0.43], [0, 0.43, 0.9], 12);
const REST_SIDE: Pose = {
  ...REST_FRONT,
  hand: [SCY_SIDE[0], [-10.6, 1.0, 19.6]], pole: [[1, -0.6, -0.3], [-1, -0.3, -0.4]],
  foot: [[3.9, 2.0, 3.6], [-3.9, -1.6, 3.6]],
  scy: SCY_SIDE, lgrip: -99,
};
const restOf = (view: ZView): Pose => (view === "side" ? REST_SIDE : REST_FRONT);

/** Всё выше щиколоток поднято на 2 px кадра (ноги длиннее, силуэт стройнее, как на образце) — ровно на целые пиксели. */
const LIFT0 = 2 * PX;
/** Отступ тела от зрителя (гибель) — вдоль луча вида, не на целые пиксели: с телом едут ступни и пыль. */
const awayOf = (view: ZView, p: Pose): V3 => fromView(view, [0, -p.away, 0]);
/** Сдвиг тела в кадре: шаг корня и проседание — на целые пиксели вида, плюс подъём LIFT0 и отступ; с ним едут руки и коса. */
const bodyShift = (view: ZView, p: Pose): V3 =>
  add(add(snapPx(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.sink]), [0, 0, LIFT0]), awayOf(view, p));

/** Нормированная коса: древко — единичное, размах — перпендикулярен ему. */
function scyOf(s: Scy): Scy {
  const d = norm(s[1]);
  return [s[0], d, perp(d, s[2])];
}
/** Оси полумесяца: x — к вогнутой стороне (древко, скошенное на RAKE), y — к длинному рогу (+размах), z — нормаль. */
function bladeAxes(s: Scy): [V3, V3, V3] {
  const [, d, sp] = s;
  const c = Math.cos(RAKE), sn = Math.sin(RAKE);
  const x = norm(add(mul(d, c), mul(sp, sn)));
  const y = norm(add(mul(d, -sn), mul(sp, c)));
  return [x, y, norm(cross(x, y))];
}
/** Точки косы в мире: конец у лезвия (гнездо на вогнутой кромке), навершие, центр внешнего круга полумесяца. */
function scyPoints(s: Scy, lb: number) {
  const [g, d] = s;
  const [bx, by] = bladeAxes(s);
  const bEnd = sub(g, mul(d, lb));
  const ctr = add(bEnd, add(mul(bx, Math.sqrt(MOON.rb * MOON.rb - OFF * OFF) - MOON.d), mul(by, OFF)));
  return { bEnd, pom: add(g, mul(d, SHAFT - lb)), ctr };
}
/** Точка на внешней (режущей) кромке полумесяца: u = 0 — середина, ±1 — у кончиков (+1 — длинный рог). */
function edgePoint(s: Scy, lb: number, u: number): V3 {
  const [bx, by] = bladeAxes(s);
  const { ctr } = scyPoints(s, lb);
  const a = (MOON.ra * MOON.ra - MOON.rb * MOON.rb + MOON.d * MOON.d) / (2 * MOON.d);
  const tip = Math.atan2(Math.sqrt(MOON.ra * MOON.ra - a * a), a);
  const phi = Math.PI - u * (Math.PI - tip) * 0.92;
  return add(ctr, add(mul(bx, MOON.ra * Math.cos(phi)), mul(by, MOON.ra * Math.sin(phi))));
}

/**
 * Контур плаща (θ, h; θ = 0 — середина спины): верх по плечам; по бокам, у самого края (θ ≈ ±2,3, ближе к груди), — по
 * длинному острому лохмотью ниже колен: лист расширяется книзу, и они расходятся наружу и ломают силуэт и спереди, по обе
 * стороны ног. Подол зубчатый: три длинных языка разной длины (середина — до земли, правый короче) и короткие зубцы между
 * ними. Кончики качаются на целые пиксели со сдвигом фазы (cape, capeU — языки, rag — боковые лохмотья).
 */
function cloakPoly(p: Pose): [number, number][] {
  const [cr, cc, cl] = p.cape.map((v) => v * PX);
  const [ur, uc, ul] = p.capeU.map((v) => v / 12.4);
  const [sr, sl] = p.rag.map((v) => v * PX);
  return [
    [-1.9, 17.4], [1.9, 17.4],
    [1.88, 6], [1.86, 0], [2.06, -4.2],
    // правое боковое лохмотье: от края у груди наискось наружу, к боку
    [2.44, -6.6], [2.0, -17.6 + sr], [2.16, -11.2], [1.96, -10.2],
    [1.82, -14.0], [1.7, -11.4],
    // правый язык (короче)
    [1.5, -12.0], [1.3 + ur, -17.0 + cr], [1.08, -11.4], [0.92, -8.8],
    [0.76, -13.0], [0.58, -8.6],
    // средний язык (длиннее всех)
    [0.32, -13.4], [0.06 + uc, -19.6 + cc], [-0.2, -12.8], [-0.42, -8.4],
    [-0.6, -12.4], [-0.78, -9.0],
    // левый язык
    [-1.0, -12.6], [-1.26 + ul, -18.4 + cl], [-1.48, -12.4], [-1.64, -15.0], [-1.8, -11.4],
    // левое боковое лохмотье
    [-1.98, -10.4], [-2.18, -11.6], [-1.96, -16.4 + sl], [-2.42, -6.4],
    [-2.04, -3.8], [-1.86, 0], [-1.88, 6],
  ];
}

/** Ревенант в координатах модели. */
function revenant(p0: Pose, view: ZView): Scene {
  const S = new Scene();
  // вбок: корпус и голова чуть повёрнуты к зрителю (три четверти) — видны грудь, визор и оба глаза
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.3, hy: p0.hy - 0.2 } : p0;
  const shift = bodyShift(view, p);
  const pel: V3 = add([0, 0, HIP0], shift);
  const up = p.chest * PX, hz = p.headZ * PX;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  /** Точка корпуса: верх тела (выше пояса) поднимается при вдохе целиком — жёстко, без растяжения. */
  const T = (v: V3, lift = v[2] >= 25): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PR = (v: V3): V3 => rot(v, p.pitch * 0.3, p.yaw * 0.35, p.roll * 0.5);
  const PV = (v: V3): V3 => add(pel, PR(sub(v, [0, 0, HIP0])));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0, yaw = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, yaw, roll)), f(rot([0, 1, 0], pitch, yaw, roll)), f(rot([0, 0, 1], pitch, yaw, roll)),
  ];
  const sides: [number, number][] = [[0, 1], [1, -1]];
  const ancChest = T([0, 0, 30], true), ancHip = PV([0, 0, HIP0]);

  // ---------- корпус: кольчуга (бочка груди, перемычка плеч, ворот) ----------
  const gBody = S.group(2.0);
  S.cone(gBody, PV([0, 0, 19.4]), 5.0, T([0, 0.3, 25.6]), 5.5, { mat: M_MAIL, tex: 3, anc: ancHip, seed: 1 });
  S.ell(gBody, T([0, 0.5, 30.2]), [7.0, 4.8, 5.8], axes(TV), { mat: M_MAIL, tex: 3, anc: ancChest, seed: 2 });
  // кожаный нагрудник поверх кольчуги: кольчуга видна у ворота и по бокам, между ними — шов
  {
    const g = S.group(0);
    S.ell(g, T([0, 1.3, 28.4]), [6.5, 4.5, 4.8], axes(TV), { mat: M_LEATHER, seed: 14, tone: 0.3 });
  }
  S.cone(gBody, T([-6.8, 0, 34.0]), 3.3, T([6.8, 0, 34.0]), 3.3, { mat: M_MAIL, tex: 3, anc: ancChest, seed: 3 });
  S.cone(gBody, T([0, 0.2, 33.6]), 3.1, T([0, 0.3, 37.6]), 2.7, { mat: M_MAIL, tex: 3, anc: ancChest, seed: 4 });

  // пояс
  {
    const g = S.group(0);
    S.ell(g, PV([0, 0.3, 22.2]), [5.8, 5.4, 1.4], axes(PR), { mat: M_LEATHER, seed: 5 });
    S.stamps.push({ kind: "skull", at: PV([0, 5.6, 22.2]), n: PR([0, 1, 0]), glow: p.glow });
  }
  // подол кольчуги: рваный край, спереди разрез
  {
    const g = S.group(0);
    const f = axes(PR);
    S.sheet(g, PV([0, 0.2, HIP0]), [f[0], mul(f[1], -1), f[2]], sheetDef({ h0: 1.6, h1: -10, r0: 5.5, r1: 7.0, fa: 0.22, fk: 9, fp: 0, th: 0.55, flare: 0 }, [
      [-2.72, 1.6], [2.72, 1.6], [2.72, -8.2], [2.3, -9.6], [1.7, -8.4], [1.05, -9.8], [0.35, -8.6], [-0.35, -9.7], [-1.05, -8.3], [-1.75, -9.5], [-2.35, -8.4], [-2.72, -9.4],
    ]), { mat: M_MAIL, tex: 3, anc: ancHip, seed: 6 });
  }
  // набедренник: рваная полоса ткани спереди, от пояса до колен
  {
    const g = S.group(0);
    const f = axes(PR);
    S.sheet(g, PV([0, 0.2, HIP0]), [mul(f[0], -1), f[1], f[2]], sheetDef({ h0: 1.4, h1: -12.5, r0: 6.0, r1: 7.4, fa: 0, fk: 0, fp: 0, th: 0.6, flare: 0 }, [
      [-0.46, 1.4], [0.46, 1.4], [0.44, -8.6], [0.33, -12.6], [0.15, -9.8], [-0.04, -11.6], [-0.26, -9.2], [-0.44, -10.8],
    ]), { mat: M_CLOTH, seed: 7, tone: 0.15 });
  }

  // ---------- ноги: штаны, наколенник, поножи, сапоги ----------
  for (const [i, s] of sides) {
    const g = S.group(1.0);
    const hip = PV([s * 3.6, 0, 19.6]);
    const an = add(p.foot[i], awayOf(view, p));
    const kn = ik(hip, an, LEG[0], LEG[1], [s * 0.15, 1, 0.05]);
    S.cone(g, hip, 2.9, kn, 2.4, { mat: M_LEATHER, seed: 30 + i, tone: -0.3 });
    const sd = norm(sub(an, kn));
    S.ball(g, add(kn, mul(perp(sd, [0, 1, 0]), 0.9)), 2.15, { mat: M_STEEL, part: S.newPart(), seed: 32 + i });
    S.cone(g, kn, 2.3, add(an, [0, 0, 1.6]), 2.05, { mat: M_STEEL, part: S.newPart(), seed: 34 + i });
    const tp = p.toe[i];
    const fc = add(an, rot([0, 1.3, -1.7], tp, 0));
    const pb = S.newPart();
    S.cone(g, add(an, [0, 0, -0.6]), 2.45, add(an, [0, 0, 2.2]), 2.5, { mat: M_LEATHER, part: pb, seed: 36 + i });
    S.ell(g, fc, [2.3, 3.5, 1.9], axes((v) => v, 0, tp), { mat: M_LEATHER, part: pb, seed: 38 + i });
  }

  // ---------- коса ----------
  const scy = scyOf(p.scy);
  const liftR = pxToWorld(view, 0, -p.armLift[0]);
  const held = p.held >= 0.5;
  const sg: V3 = add(add(scy[0], held ? shift : [0, 0, 0]), held ? liftR : [0, 0, 0]);
  const scyW: Scy = [sg, scy[1], scy[2]];
  {
    const g = S.group(0.35);
    S.scyG = g;
    const d = scyW[1];
    const { bEnd, pom, ctr } = scyPoints(scyW, p.lb);
    S.cone(g, sub(bEnd, mul(d, 0.8)), 0.95, pom, 0.95, { mat: M_WOOD, seed: 50 });
    S.cone(g, add(bEnd, mul(d, 0.2)), 1.3, add(bEnd, mul(d, 2.8)), 1.25, { mat: M_LEATHER, part: S.newPart(), seed: 51 });
    S.ball(g, add(pom, mul(d, 0.3)), 1.4, { mat: M_STEEL, part: S.newPart(), seed: 52 });
    S.moon(g, ctr, bladeAxes(scyW), MOON, { mat: M_BLADE, tex: 5, part: S.newPart(), seed: 53 });
    if (p.glint > 0) S.sparks.push({ at: edgePoint(scyW, p.lb, lerp(0.85, -0.85, p.glint)), k: Math.sin(Math.PI * p.glint) });
  }

  // ---------- руки: рукав кольчуги, стальной наруч, латный кулак ----------
  for (const [i, s] of sides) {
    const g = S.group(1.0);
    S.armG[i] = g;
    const two = i === 1 && held && p.lgrip > -50;
    const lift = pxToWorld(view, 0, -(two ? p.armLift[0] : p.armLift[i]));
    const sh = add(T([s * 9.0, 0.2, 34.2]), lift);
    let fist: V3;
    if (i === 0 && held) fist = sg;
    else if (two) {
      // левый кулак на древке; не дотянуться — скользит по древку к ближней точке, до которой рука достаёт
      const reach = ARM[0] + ARM[1] - 0.3;
      const at = (l: number) => add(sg, mul(scyW[1], l));
      let best = p.lgrip, bd = 1e9;
      for (let l = 4.5; l <= SHAFT - p.lb - 1; l += 0.25) {
        const d = vlen(sub(at(l), sh));
        const cost = d <= reach ? Math.abs(l - p.lgrip) : 100 + d;
        if (cost < bd) { bd = cost; best = l; }
      }
      fist = at(best);
    } else fist = add(add(p.hand[i], shift), lift);
    if (process.env.REAPER_REACH && vlen(sub(fist, sh)) > ARM[0] + ARM[1] + 0.1) console.warn(`  ${dbgTag} ${view} рука ${i}: ${vlen(sub(fist, sh)).toFixed(1)} > ${ARM[0] + ARM[1]}`);
    const el = ik(sh, fist, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, sh, 2.6, el, 2.2, { mat: M_MAIL, tex: 3, anc: sh, seed: 20 + i });
    const fd = norm(sub(fist, el));
    S.cone(g, el, 2.1, sub(fist, mul(fd, 1.5)), 2.55, { mat: M_LEATHER, part: S.newPart(), seed: 22 + i });
    const e0 = perp(fd, [0, 0, 1]);
    const pf = S.newPart();
    S.ell(g, fist, [2.15, 2.0, 2.3], [e0, cross(fd, e0), fd], { mat: M_STEEL, tone: -0.35, part: pf, seed: 24 + i });
    // раскрытая латная перчатка (чары): три пальца-когтя веером по направлению предплечья
    if (i === 1 && p.lopen > 0.05) {
      const e1 = cross(fd, e0);
      [-1, 0, 1].forEach((o, k) => {
        const dir = norm(add(add(fd, mul(e0, o * 0.55 * p.lopen)), mul(e1, 0.25)));
        const b0 = add(fist, mul(fd, 1.4));
        S.cone(g, b0, 0.8, add(b0, mul(dir, 1.2 + 2.4 * p.lopen - Math.abs(o) * 0.4)), 0.45, { mat: M_STEEL, tone: -0.2, part: pf, seed: 26 + k });
      });
    }
    if (i === 1 && p.orb > 0.02) S.orbs.push({ at: add(fist, add(mul(fd, 2.2), [0, 0, 2.4])), k: p.orb });
  }

  // ---------- наплечник — один, на левом плече (как на образце): пластина и две ламы, швы между ними ----------
  {
    const g = S.group(0.7);
    S.ell(g, T([-9.8, -0.3, 36.6]), [4.8, 4.6, 3.3], axes(TV, -0.45), { mat: M_STEEL, seed: 10 });
    S.ell(g, T([-11.6, -0.2, 33.6]), [3.7, 4.2, 1.9], axes(TV, -0.68), { mat: M_STEEL, seed: 11, part: S.newPart() });
    S.ell(g, T([-12.7, -0.1, 31.4]), [2.8, 3.6, 1.4], axes(TV, -0.85), { mat: M_STEEL, seed: 12, part: S.newPart() });
  }
  // ---------- накидка на плечи: рваная ткань от шеи, спереди открыта; длинные лохмотья свисают по рукам ----------
  {
    const g = S.group(0);
    const f = axes(TV);
    S.sheet(g, T([0, -0.4, 34], true), [f[0], mul(f[1], -1), f[2]], sheetDef({ h0: 7.0, h1: -12, r0: 3.3, r1: 11.4 - 3.5 * p.hem, fa: 0.5, fk: 7, fp: 0.3, th: 0.6, flare: 0, ex: 1.55 - 0.4 * p.hem }, [
      [-2.45, 7.0], [2.45, 7.0], [2.25, 2.0], [2.1, -3.6], [1.95, -6.6],
      [1.76, -5.0], [1.6, -17.4], [1.34, -6.0], [1.0, -8.4], [0.68, -5.2], [0.34, -7.6], [0.0, -5.0],
      [-0.36, -8.0], [-0.7, -5.4], [-1.02, -8.8], [-1.32, -5.8], [-1.58, -16.6], [-1.78, -5.4], [-1.95, -6.8],
      [-2.1, -3.6], [-2.25, 2.0],
    ]), { mat: M_CLOTH, seed: 9, inner: -0.8, tone: 0.2 });
  }

  // ---------- шлем: купол, нащёчники, гребень ----------
  const gHead = S.group(1.0);
  S.ell(gHead, H([0, 0.5, 44.4]), [4.2, 4.6, 4.2], axes(HV), { mat: M_STEEL, seed: 40 });
  S.cone(gHead, H([0, 0.9, 43.2]), 4.0, H([0, 1.3, 40.4]), 3.4, { mat: M_STEEL, seed: 41 });
  {
    // гребень: костяной плавник от лба к затылку, заострён и заломлен назад — вниз и вверх это светлая точка над шлемом,
    // вбок — гребень, выше к затылку
    const g = S.group(1.0);
    S.ell(g, H([0, -0.9, 48.0]), [0.65, 3.2, 1.35], axes(HV, 0, 0.16), { mat: M_BONE, tone: -0.2, seed: 42 });
    S.cone(g, H([0, 0.8, 48.4]), 0.85, H([0, -1.2, 53.6]), 0.3, { mat: M_BONE, seed: 43 });
  }
  S.stamps.push({ kind: "visor", at: H([0, 5.0, 43.6]), n: HV([0, 1, 0]), glow: p.glow });

  // ---------- плащ: от плеч до земли, три лохмотья подола; изнанка темнее ----------
  {
    const g = S.group(0);
    const f = axes(TV);
    S.sheet(g, T([0, -1.0, HIP0], true), [f[0], mul(f[1], -1), f[2]], sheetDef({ h0: 17.4, h1: -18.4, r0: 6.4, r1: 12.4 - 3.5 * p.hem, fa: 1.4 * (1 - 0.5 * p.hem), fk: 6, fp: 0.6, th: 0.6, flare: p.flare }, cloakPoly(p)), { mat: M_CLOTH, seed: 8, inner: -0.8 });
  }

  // ---------- курган: земля поднимается над уходящим телом (гибель) ----------
  // В осях вида: широкий по кадру и неглубокий к зрителю — передний край на земле не ниже y = 61, контур не ниже 62.
  if (p.mound > 0.02) {
    const g = S.group(1.6);
    const m = p.mound;
    // курган — на месте, где стоял ревенант; тело при этом отходит от зрителя (away) и уходит в землю за его передним краем
    const c: V3 = add([p.root[0], p.root[1], 0], fromView(view, [0, -0.2, -3.2 + 2.2 * m]));
    const ax: [V3, V3, V3] = [fromView(view, [1, 0, 0]), fromView(view, [0, 1, 0]), [0, 0, 1]];
    S.ell(g, c, [8 + 8 * m, 2.6 + 2.6 * m, 3 + 7.5 * m], ax, { mat: M_EARTH, seed: 90 });
  }

  particles(S, p, scyW, awayOf(view, p));
  return S;
}

/** Частицы: пыль от шага, комья и волна у навершия, вспышка, огоньки душ. */
function particles(S: Scene, p: Pose, scy: Scy, away: V3) {
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) S.puffs.push({ c: [p.foot[i][0] + away[0], p.foot[i][1] + away[1] + 1, 0], k: p.dust[i], seed: i });
  const { pom } = scyPoints(scy, p.lb);
  if (p.ring > 0.02) S.rings.push({ c: [pom[0], pom[1], 0], r: 3 + 12.5 * p.ring, k: 1 - p.ring });
  if (p.clods > 0.02) {
    const c: V3 = [pom[0], pom[1], 0];
    S.puffs.push({ c, k: p.clods, seed: 10 });
    const f = 1 - p.clods;
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * TAU + 0.4;
      S.motes.push({ p: [c[0] + Math.cos(ang) * (2 + 6 * f), c[1] + Math.sin(ang) * 2, 1.5 + 8 * f * (1 - f) * 2.2], col: DUST[1], dark: DUST[0], size: 2 });
    }
  }
  if (p.trail && p.trail.length > 1) S.smears.push({ pts: p.trail, protect: [S.scyG, S.armG[0], S.armG[1]] });
  if (p.flash > 0.02) S.flash = { at: p.flashAt ?? edgePoint(scy, p.lb, 0), k: p.flash };
  if ((p.puff ?? 0) > 0.02) {
    const e = edgePoint(scy, p.lb, 0);
    S.puffs.push({ c: [e[0], e[1] + 2, 0], k: p.puff!, seed: 30 });
  }
  // огоньки душ: поднимаются от тела, гаснут ступенями
  if (p.wisps > 0) {
    for (let k = 0; k < 8; k++) {
      const st = hash01(k, 3, 9) * 0.55;
      const f = clamp((p.wisps - st) / 0.45, 0, 1);
      if (f <= 0 || f >= 1) continue;
      const x = -10 + 20 * hash01(k, 1, 9) + 1.5 * Math.sin(f * 6 + k), y = -2 + 4 * hash01(k, 2, 9);
      const z = 8 + 32 * f + 6 * hash01(k, 4, 9);
      S.motes.push({ p: [x, y, z], col: EYE[f < 0.6 ? 3 : 2], dark: EYE[f < 0.6 ? 1 : 0], size: 1 });
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

/** Местные координаты точки на примитиве: u — вдоль оси (доля), l — местные координаты (у листа — [дуга, от поверхности, высота]). */
function texAt(q: Prim, p: V3): { u: number; l: V3; fold?: number } {
  const pa = sub(p, q.a);
  if (q.k === 1 || q.k === 3 || q.k === 4) {
    const l: V3 = [dot(pa, q.ax[0]), dot(pa, q.ax[1]), dot(pa, q.ax[2])];
    return { u: q.k === 1 ? l[2] / q.r[2] : 0, l };
  }
  if (q.k === 2) {
    const { th, r, R, Rb, lz, t } = sheetLocal(q, pa[0], pa[1], pa[2]);
    return { u: t, l: [th * Rb, r - R, lz], fold: (q.sh!.fk * th + q.sh!.fp) / TAU };
  }
  if (q.sph) return { u: 0, l: pa };
  const w = mul(q.ba, 1 / q.len);
  const ref = q.ref, bin = cross(w, ref);
  const l: V3 = [dot(pa, ref), dot(pa, bin), dot(pa, w)];
  return { u: l[2] / q.len, l };
}

interface Look { mat: Uint8Array; idx: Int8Array; part: Int32Array; lum: Float32Array; pat: Uint8Array }

/** Крест на надгробии (местные координаты плиты: x вправо, y вверх от низа): столб и перекладина по 2 px. */
function carved(x: number, y: number, L: SlabDef): boolean {
  const top = L.h + L.w * 0.55;
  const v = Math.abs(x) < 1.05 && y > L.h * 0.3 && y < top;
  const hb = Math.abs(y - (top - 3.2)) < 1.05 && Math.abs(x) < L.w * 0.52;
  return v || hb;
}
/** Трещина на лицевой стороне надгробия: ломаная от правого плеча вниз (доли ширины и высоты; до креста не доходит). */
const SLAB_CRACK: [number, number][] = [[0.9, 0.68], [0.7, 0.59], [0.79, 0.5], [0.59, 0.39], [0.67, 0.3]];
function slabCrack(x: number, y: number, L: SlabDef): boolean {
  const H = L.h + L.w;
  for (let k = 0; k + 1 < SLAB_CRACK.length; k++) {
    const [ax, ay] = [SLAB_CRACK[k][0] * L.w, SLAB_CRACK[k][1] * H], [bx, by] = [SLAB_CRACK[k + 1][0] * L.w, SLAB_CRACK[k + 1][1] * H];
    const ex = bx - ax, ey = by - ay;
    const h = clamp(((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey), 0, 1);
    if (Math.hypot(x - ax - ex * h, y - ay - ey * h) < 0.55) return true;
  }
  return false;
}

function shade(prims: Prim[], gk: number[], gb: GBuf): Look {
  const L: Look = { mat: new Uint8Array(N * N), idx: new Int8Array(N * N).fill(-1), part: new Int32Array(N * N).fill(-1), lum: new Float32Array(N * N), pat: new Uint8Array(N * N) };
  const tone = new Float32Array(N * N);
  const crisp = new Uint8Array(N * N);
  const deep = new Uint8Array(N * N);
  /** складки ткани: фаза (впадина — целое + 0,75, гребень — + 0,25) и где их рисовать */
  const fold = new Float32Array(N * N);
  const foldOk = new Uint8Array(N * N);
  const cand = new Int32Array(prims.length);
  const anc = prims.map((q) => scr(q.anc).map(Math.floor) as [number, number]);
  for (let i = 0; i < N * N; i++) {
    const pi = gb.prim[i];
    if (pi < 0) continue;
    const q = prims[pi];
    const n: V3 = [gb.n[i * 3], gb.n[i * 3 + 1], gb.n[i * 3 + 2]];
    const p: V3 = [gb.p[i * 3], gb.p[i * 3 + 1], gb.p[i * 3 + 2]];
    let mat = q.mat;
    const tx = texAt(q, p);
    if (q.band && tx.u >= q.band[0] && tx.u <= q.band[1]) mat = q.bandMat;
    const md = MATS[mat];
    const lum = dot(n, LIGHT);
    L.lum[i] = lum;
    let tn = md.base + md.gain * lum + (mat === q.mat ? q.tone : 0);
    // изнанка листа (плащ за телом) — темнее
    if (q.k === 2 && q.inner && tx.l[1] < 0) tn += q.inner;
    if (q.k === 2 && q.sh!.fa > 0 && tx.fold !== undefined) {
      fold[i] = tx.fold;
      foldOk[i] = tx.u > 0.1 ? 1 : 0;
    }
    const lit = tn;
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
    // лезвие: тоны по ширине — тёмная вогнутая кромка, светлая режущая снаружи; свет и тень — вполсилы
    if (mat === M_BLADE && q.mo) {
      const M = q.mo, x = tx.l[0], y = tx.l[1];
      const eo = M.ra - Math.hypot(x, y), ei = Math.hypot(x - M.d, y) - M.rb;
      const w = clamp(ei / Math.max(0.01, ei + eo), 0, 1);
      let bt = 1.75 + 1.3 * lum + (w - 0.4) * 2.2 + (tn - lit) * 0.5;
      if (eo < 0.95) bt = Math.max(bt, lum > -0.3 ? 3.6 : 2.6);
      else if (ei < 0.9) bt = Math.min(bt, 1.4);
      tn = bt;
      crisp[i] = 1;
      deep[i] = 0;
    }
    // резьба на лицевой стороне надгробия: крест — желобок темнее или фиолетовый свет из него
    if (q.k === 4 && q.eng >= 0 && tx.l[2] > q.sl!.th - 0.5 && carved(tx.l[0], tx.l[1], q.sl!)) {
      if (q.eng > 0) {
        mat = M_RUNE;
        tn = 1.3 + 1.9 * Math.min(1, q.eng) + (tx.l[0] + tx.l[1] < 9 ? 0.4 : 0);
        crisp[i] = 1;
        deep[i] = 0;
      } else tn = Math.min(tn - 1.2, 1.4);
    } else if (q.k === 4 && q.eng >= 0 && tx.l[2] > q.sl!.th - 0.5 && slabCrack(tx.l[0], tx.l[1], q.sl!)) tn = Math.min(tn - 1.2, 1.3);
    const mdF = MATS[mat];
    tn = Math.min(tn, mdF.hi + 0.49);
    tn = Math.max(tn, (deep[i] ? mdF.lo - 1 : mdF.lo) - 0.4);
    tone[i] = tn;
    L.mat[i] = mat;
    L.part[i] = q.part;
  }
  // сглаживание тона внутри детали: ровные границы светотени без зубцов (лезвие — по правилу, без сглаживания)
  {
    const src = new Float32Array(tone);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0 || crisp[i]) continue;
      let sum = src[i] * 4, w = 4;
      for (const [dx, dy, k] of [[1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2], [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const j = yy * N + xx;
        if (gb.prim[j] < 0 || L.part[j] !== L.part[i] || L.mat[j] !== L.mat[i] || crisp[j]) continue;
        sum += src[j] * k;
        w += k;
      }
      tone[i] = sum / w;
    }
  }
  // второй проход: кольчуга, швы между деталями, светлая кромка к свету
  const T2 = new Float32Array(tone);
  const bgAt = (x: number, y: number) => x < 0 || y < 0 || x >= N || y >= N || gb.prim[y * N + x] < 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (gb.prim[i] < 0) continue;
    const q = prims[gb.prim[i]];
    const md = MATS[L.mat[i]];
    let tn = tone[i];
    // у самого контура — без тёмных линий и не темнее тени: иначе край читается как контур в 2 px
    const edge = bgAt(x - 1, y) || bgAt(x + 1, y) || bgAt(x, y - 1) || bgAt(x, y + 1);
    // кольчуга: шахматка двух соседних тонов от опорной точки детали (целые пиксели — рисунок едет вместе с телом)
    if (L.mat[i] === M_MAIL && q.tex === 3 && !edge) {
      const [ax, ay] = anc[gb.prim[i]];
      const ry = y - ay + 64, rx = x - ax + 64;
      // кольца рядами: светлая точка через пиксель в каждом втором ряду, ряды со сдвигом — два тона серого
      if (!(ry & 1) && !((rx + (ry >> 1)) & 1) && tn > 1.2 && tn < 3.4) {
        tn += 0.85;
        L.pat[i] = 1;
      }
    }
    // складки ткани: впадина — линия на тон темнее, гребень на свету — на полтона светлее (длинные, от плеч к подолу)
    if (foldOk[i] && !edge) {
      const vi = Math.floor(fold[i] - 0.75), ri = Math.floor(fold[i] - 0.25);
      let valley = false, ridge = false;
      for (const j of [i - 1, i - N]) {
        if (j < 0 || gb.prim[j] !== gb.prim[i] || !foldOk[j]) continue;
        if (Math.floor(fold[j] - 0.75) !== vi) valley = true;
        if (Math.floor(fold[j] - 0.25) !== ri) ridge = true;
      }
      if (valley && tn > 1.2) tn -= 1.0;
      else if (ridge && L.lum[i] > 0.1 && tn < 3.2) tn += 0.6;
    }
    if (!edge) {
      // шов: соседняя деталь ближе к зрителю — тон тени (selout); почти чёрный — только в глубокой щели
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
    // светлая кромка к свету — только у крупных форм, слева и сверху; не выше света
    if (!crisp[i]) {
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

/** Одиночный пиксель (ни одного соседа того же тона и материала в 8 направлениях) принимает тон большинства соседей. */
function despeckle(L: Look, gb: GBuf) {
  for (let pass = 0; pass < 2; pass++) {
    const src = new Int8Array(L.idx);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (gb.prim[i] < 0 || L.mat[i] === M_BLADE || L.mat[i] === M_RUNE || L.pat[i]) continue;
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
  if (wither <= 0 || mat === M_EARTH) return base;
  // ткань и кожа (плащ, табард) выцветают лишь отчасти: на холмике до конца остаются бурыми, материал не меняется скачком
  const k0 = mat === M_BLADE ? 0.6 : mat === M_CLOTH || mat === M_LEATHER ? 0.35 : 0.85;
  return base.map((c, k) => mix(c, DEAD[Math.min(k, DEAD.length - 1)], wither * k0));
}

// ---------------- штампы: визор с глазами, пряжка-череп ----------------
/**
 * Рисунки в целых пикселях от точки привязки (dx вправо, dy вниз). Ключи: d — пустота под визором, 1–3 — свечение глаза
 * (ярче — больше), b/k — светлая и тёмная кость. Визор вниз — Т-образная прорезь: глаза в горизонтальной щели, ниже — щель
 * для дыхания; вбок (три четверти) — ближний глаз ярче, дальний у края.
 */
type StampPx = [number, number, string];
const rows = (rs: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  const key: Record<string, string> = { d: "d", "1": "e1", "2": "e2", "3": "e3", b: "b", k: "k", c: "c" };
  rs.forEach((r, j) => [...r].forEach((ch, i) => { if (key[ch]) out.push([x0 + i, y0 + j, key[ch]]); }));
  return out;
};
const ST_VISOR_DOWN = rows([
  "ddddddd",
  "d3ddd3d",
  "..ddd..",
  "...d...",
], -3, -1);
const ST_VISOR_SIDE = rows([
  "dddd.",
  "dd3d2",
  ".ddd.",
  "..d..",
], -2, -1);
const ST_SKULL = rows([
  "bbb",
  "kbk",
  ".c.",
], -1, -1);

function stampOf(st: Stamp, view: ZView): StampPx[] {
  if (st.kind === "skull") return view === "up" ? [] : ST_SKULL;
  return view === "side" ? ST_VISOR_SIDE : view === "down" ? ST_VISOR_DOWN : [];
}

function drawStamps(body: PC, sc: Scene, view: ZView, gb: GBuf, wither: number) {
  const glow = new Float32Array(N * N);
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
      if (key === "d") {
        if (!emis[i]) body.set(x, y, mix(VOID, DEAD[0], wither));
        emis[i] = 2;
        continue;
      }
      if (key === "b" || key === "k" || key === "c") {
        body.set(x, y, mix(key === "b" ? BONE[3] : key === "c" ? BONE[2] : BONE[0], DEAD[key === "k" ? 0 : 3], wither * 0.8));
        emis[i] = 3;
        continue;
      }
      // глаз: гаснет при гибели — каждая ступень ниже на тон, ниже нуля — пустота
      const lv = +key[1];
      const k = lv - Math.round((1 - Math.min(1, g)) * 3);
      if (k < 0) continue;
      body.set(x, y, EYE[clamp(k + (g > 1.2 ? 1 : 0), 0, 3)]);
      glow[i] = Math.max(glow[i], Math.min(1, g) * (lv / 3));
      emis[i] = 1;
    }
  }
  // отсвет вокруг глаз: размытая карта свечения, цвет — ступенями (2 уровня); пустота визора у глаз тоже чуть светится
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      v += glow[yy * N + xx] * (dx === 0 || dy === 0 ? 1 : 0.6);
    }
    out[y * N + x] = v / 3.2;
  }
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0 || emis[i] === 1 || emis[i] === 3) continue;
    const g = out[i];
    const lv = g > 0.42 ? 2 : g > 0.2 ? 1 : 0;
    if (!lv) continue;
    const x = i % N, y = Math.floor(i / N);
    const c = body.get(x, y)!;
    body.set(x, y, mix(c, [GLOW_P[0], GLOW_P[1], GLOW_P[2], 255], (emis[i] === 2 ? [0, 0.3, 0.5] : [0, 0.22, 0.4])[lv]));
  }
}

/**
 * Прозрачные «проколы» внутри силуэта (≤3 px, без выхода к краю кадра): у тела — цветом контура, в собранном кадре —
 * цветом большинства соседей.
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

/** Сцена → кадр: луч на пиксель, тоны, штампы, контур. */
function renderScene(sc: Scene, view: ZView | null, wither: number): { body: PC; gb: GBuf; prims: Prim[]; L: Look } {
  const order = sc.prims.map((q, i) => [q.g, i] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const prims = order.map(([, i]) => sc.prims[i]);
  for (const q of prims) prepare(q, view);
  const gb = raster(prims, sc.gk);
  const L = shade(prims, sc.gk, gb);
  const body = new PC(N, N);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    body.set(i % N, Math.floor(i / N), rampFor(L.mat[i], wither)[L.idx[i]]);
  }
  return { body, gb, prims, L };
}

/** Кадр ревенанта в виде view. */
export function renderReaper(view: ZView, pose: Pose): PC {
  const sc = revenant(pose, view);
  const { body, gb, prims, L } = renderScene(sc, view, pose.wither);
  // лезвие, налитое чарами: фиолетовый отлив ступенями (2 уровня), кромка остаётся светлой
  if (pose.charge > 0.15) {
    const k = pose.charge > 0.6 ? 0.42 : 0.24;
    for (let i = 0; i < N * N; i++) {
      if (gb.prim[i] < 0 || L.mat[i] !== M_BLADE || L.idx[i] >= 4) continue;
      const x = i % N, y = (i / N) | 0;
      body.set(x, y, mix(body.get(x, y)!, [GLOW_P[0], GLOW_P[1], GLOW_P[2], 255], k));
    }
  }
  drawStamps(body, sc, view, gb, pose.wither);
  body.outline(OUT);
  sealPinholes(body);

  // ---------- сборка: холм земли (уход в землю), тело, волна и пыль, след косы позади лезвия, частицы, блик, вспышка ----------
  const out = new PC(N, N);
  for (const r of sc.rings) drawRing(out, r, view, gb, true);
  out.blit(body, 0, 0);
  for (const r of sc.rings) drawRing(out, r, view, gb, false);
  for (const sm of sc.smears) drawSmear(out, sm, view, gb, prims);
  for (const f of sc.puffs) drawPuff(out, f, view);
  for (const m of sc.motes) drawMote(out, m, view, gb);
  for (const o of sc.orbs) drawOrb(out, o, view, gb);
  for (const s of sc.sparks) drawSpark(out, s, view, gb, prims, sc.scyG);
  if (sc.flash) drawFlash(out, sc.flash, view, gb);
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
      if (dx * dx + dy * dy > 1) continue;
      o.set(x, y, DUST[dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2]);
    }
  }
}

function drawMote(o: PC, m: Mote, view: ZView, gb: GBuf) {
  const p = toView(view, m.p);
  const [sx, sy] = scr(p);
  const x = Math.floor(sx), y = Math.floor(sy);
  // частица и тёмный пиксель под ней — не на краю кадра
  if (x < 1 || y < 1 || x >= N - 2 || y >= N - 2) return;
  const i = y * N + x;
  if (gb.prim[i] >= 0 && gb.t[i] < depthOf(p) - 0.5) return;
  o.set(x, y, m.col);
  if ((m.size ?? 1) > 1) o.set(x + 1, y, m.col);
  if (m.dark) o.set(x + ((m.size ?? 1) > 1 ? 1 : 0), y + 1, m.dark);
}

/** Огонёк чар над ладонью: ядро и крест, по силе — крупнее и ярче; за телом не виден. */
function drawOrb(o: PC, f: { at: V3; k: number }, view: ZView, gb: GBuf) {
  const p = toView(view, f.at);
  const [sx, sy] = scr(p);
  const x = Math.floor(sx), y = Math.floor(sy);
  const i = y * N + x;
  if (x < 0 || y < 0 || x >= N || y >= N) return;
  if (gb.prim[i] >= 0 && gb.t[i] < depthOf(p) - 1) return;
  // шар: ядро, светлое кольцо, тёмная кайма; на пике — лучи-искры крестом
  const r = 1.2 + 1.3 * Math.min(1.4, f.k);
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > r + 0.75) continue;
    const c = d < r - 1.2 ? EYE[3] : d < r - 0.2 ? EYE[2] : EYE[1];
    o.set(x + dx, y + dy, (dx + dy < -1 && d < r - 0.6) ? EYE[3] : c);
  }
  if (f.k > 1.2) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const L = Math.ceil(r + 1.6);
    o.set(x + dx * L, y + dy * L, EYE[2]);
    o.set(x + dx * (L + 1), y + dy * (L + 1), EYE[1]);
  }
}

/** Блик на кромке лезвия: звёздочка в 4 луча; только если в этой точке видно само лезвие. */
function drawSpark(o: PC, s: { at: V3; k: number }, view: ZView, gb: GBuf, prims: Prim[], scyG: number) {
  if (s.k < 0.25) return;
  const p = toView(view, s.at);
  const [sx, sy] = scr(p);
  const x = Math.floor(sx), y = Math.floor(sy);
  if (x < 3 || y < 3 || x >= N - 3 || y >= N - 3) return;
  let ok = false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const j = (y + dy) * N + x + dx;
    if (gb.prim[j] >= 0 && prims[gb.prim[j]].g === scyG && prims[gb.prim[j]].mat === M_BLADE) ok = true;
  }
  if (!ok) return;
  const L = s.k > 0.7 ? 2 : 1;
  for (let r = 1; r <= L; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) o.set(x + dx * r, y + dy * r, BLADE[r === 1 ? 4 : 3]);
  o.set(x, y, [255, 255, 255, 255]);
}

/** Волна от удара навершием о землю: прерывистое кольцо на земле в 2 тона; задняя половина — под телом. */
function drawRing(o: PC, r: { c: V3; r: number; k: number }, view: ZView, gb: GBuf, back: boolean) {
  const steps = Math.ceil(r.r * 10);
  const cv = toView(view, r.c);
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * TAU;
    // кольцо рвётся по мере того, как расходится
    if (Math.sin(a * 5 + r.r * 0.5) < -1.2 + 1.3 * (1 - r.k)) continue;
    const w: V3 = [r.c[0] + Math.cos(a) * r.r, r.c[1] + Math.sin(a) * r.r, 0];
    const p = toView(view, w);
    // дальняя половина (дальше от зрителя, чем центр) — под телом
    if (p[1] < cv[1] !== back) continue;
    const [sx, sy] = scr(p);
    const x = Math.floor(sx), y = Math.floor(Math.min(sy, 62));
    if (x < 0 || y < 1 || x >= N || y >= N) continue;
    const i = y * N + x;
    if (!back && gb.prim[i] >= 0 && gb.t[i] < depthOf(p) - 0.5) continue;
    // гребень волны светлый, под ним тёмная кайма — две строки, без полупрозрачности
    o.set(x, y - 1, EYE[r.k > 0.55 ? 3 : 2]);
    o.set(x, y, EYE[r.k > 0.3 ? 1 : 0]);
  }
}

/**
 * След косы: чёткий серп в 3 тона по пути кромки лезвия — позади лезвия и рук (их пиксели не трогает), за телом не виден;
 * светлая кромка — с внешней стороны дуги, к хвосту серп сужается до пикселя.
 */
function drawSmear(o: PC, sm: { pts: V3[]; protect: number[] }, view: ZView, gb: GBuf, prims: Prim[]) {
  const vp = sm.pts.map((v) => toView(view, v));
  const pts = vp.map((v) => scr(v));
  const dep = vp.map((v) => depthOf(v));
  const prot = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) if (gb.prim[i] >= 0 && sm.protect.includes(prims[gb.prim[i]].g)) prot[i] = 1;
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && prot[yy * N + xx]) return true;
    }
    return false;
  };
  const total = pts.length - 1;
  const put = new Map<number, [number, number]>();
  for (let k = 0; k < total; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
    const dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy) || 1;
    let nx = -dy / dl, ny = dx / dl;
    if (nx * (x0 - CX) + ny * (y0 - 38) < 0) { nx = -nx; ny = -ny; }
    for (let s = 0; s <= steps; s++) {
      const u = (k + s / steps) / total;
      const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps), dz = lerp(dep[k], dep[k + 1], s / steps);
      const w = 0.4 + 1.9 * Math.sin(Math.PI * Math.min(1, u * 0.62 + 0.06));
      for (let j = -w; j <= w + 0.01; j += 0.5) {
        const xx = Math.round(x + nx * j), yy = Math.round(y + ny * j);
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const tone = j > w - 0.9 ? 2 : j < -w + 0.9 ? 0 : 1;
        const id = yy * N + xx;
        const prev = put.get(id);
        if (!prev || prev[0] < tone) put.set(id, [tone, dz]);
      }
    }
  }
  for (const [id, [tone, dz]] of put) {
    const x = id % N, y = (id / N) | 0;
    if (near(x, y)) continue;
    if (gb.prim[id] >= 0 && gb.t[id] < dz - 1.5) continue;
    o.set(x, y, SMEAR[tone]);
  }
}

/** Вспышка удара: один кадр, крестом с короткими лучами по диагоналям — непрозрачные пиксели в 3 тона. */
function drawFlash(o: PC, f: { at: V3; k: number }, view: ZView, gb: GBuf) {
  const p = toView(view, f.at);
  const [sx, sy] = scr(p);
  // лучи (до 5 px вбок, 2 px вниз) — не до края кадра: середина вспышки сдвигается внутрь
  const L = Math.round(2 + 3 * f.k);
  const x = clamp(Math.floor(sx), L + 1, N - 2 - L), y = clamp(Math.floor(sy), 3, 60);
  // за телом (удар перед ревенантом, вид со спины) вспышку закрывает тело
  const dz = depthOf(p);
  const put = (xx: number, yy: number, c: RGBA) => {
    if (xx < 0 || yy < 0 || xx >= N || yy >= N) return;
    const i = yy * N + xx;
    if (gb.prim[i] >= 0 && gb.t[i] < dz - 1) return;
    o.set(xx, yy, c);
  };
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 2 : r <= L - 1 ? 1 : 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) put(x + dx * r, y + dy * Math.min(r, 2), FLASH[tone]);
  }
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) if (f.k > 0.5) put(x + dx * 2, y + dy, FLASH[0]);
  put(x, y, FLASH[2]);
}

// ---------------- анимации ----------------
type Num = number | V3 | [V3, V3] | [number, number] | [number, number, number] | V3[] | Scy | undefined;
function lerpAny(a: Num, b: Num, t: number): Num {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return (a as unknown[]).map((v, k) => lerpAny(v as Num, (b as unknown[])[k] as Num, t)) as Num;
  return t < 0.5 ? a : b;
}
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    if (k === "trail" || k === "flashAt") continue;
    o[k] = lerpAny(a[k] as Num, b[k] as Num, t);
  }
  return o as unknown as Pose;
}
interface Key { f: number; p: Partial<Pose>; ease?: (t: number) => number }
/** Поза в дробном кадре f: ключевые позы с плавными переходами (ease на входе в ключ). */
function poseAt(base: Pose, keys: Key[], f: number): Pose {
  const full = keys.map((k) => ({ ...base, ...k.p }) as Pose);
  let j = 0;
  while (j < keys.length - 2 && f >= keys[j + 1].f) j++;
  const a = keys[j], b = keys[j + 1];
  const u = clamp((f - a.f) / (b.f - a.f), 0, 1);
  return lerpPose(full[j], full[j + 1], (b.ease ?? easeInOut)(u));
}
function keyed(base: Pose, keys: Key[], n: number, seed: number): Pose[] {
  return Array.from({ length: n }, (_, i) => ({ ...poseAt(base, keys, i), t: i / n, seed: seed + i }));
}
/** Сдвиг косы и рук вверх на целые пиксели кадра. */
const liftScy = (s: Scy, px: number): Scy => [add(s[0], [0, 0, px * PX]), s[1], s[2]];

/**
 * Покой: дыхание волной снизу вверх — грудь с плечами поднимается на 1 px, голова кадром позже, руки с косой — ещё позже;
 * лохмотья плаща качаются по пикселю вразнобой; глаза мерцают ступенями, по кромке лезвия раз за цикл пробегает блик.
 */
function idlePoses(view: ZView, n = 12): Pose[] {
  const R0 = restOf(view);
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const hands = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0];
  const cr = [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0];
  const uc = [0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0];
  const cl = [1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1];
  const sr = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0];
  const sl = [0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n, ph = t * TAU;
    return {
      ...R0, t, seed: 100 + i,
      chest: chest[i], headZ: head[i] - chest[i],
      scy: liftScy(R0.scy, hands[i]),
      hand: R0.hand.map((v) => add(v, [0, 0, hands[i] * PX])) as [V3, V3],
      cape: [cr[i], 0, cl[i]], capeU: [0, -uc[i], 0], rag: [sr[i], sl[i]],
      glow: 0.9 + 0.2 * Math.sin(ph),
      glint: i >= 5 && i <= 8 ? (i - 4) / 5 : 0,
    } as Pose;
  });
}

/** Коса по концу древка у лезвия: хват правой руки = конец + древко·lb. */
function scyAt(bEnd: V3, d: V3, s: V3, lb: number): Scy {
  const dn = norm(d);
  return [add(bEnd, mul(dn, lb)), dn, s];
}
/** Где левый кулак в покое (от покоя тела): на древке или свободно — чтобы отпустить и вернуть руку без рывка. */
const gripPoint = (P: Pose): V3 => (P.lgrip > -50 ? add(P.scy[0], mul(norm(P.scy[1]), P.lgrip)) : P.hand[1]);
/** Левая рука отпустила древко и стоит там, где держала. */
const freeLeft = (P: Pose): Partial<Pose> => ({ lgrip: -99, hand: [P.hand[0], gripPoint(P)] });
/** Кромка лезвия в мире (с учётом сдвига тела). */
function edgeW(p: Pose, view: ZView, u = 0): V3 {
  const s = scyOf(p.scy);
  const sh: V3 = p.held >= 0.5 ? bodyShift(view, p) : [0, 0, 0];
  return edgePoint([add(s[0], sh), s[1], s[2]], p.lb, u);
}
/** След кромки по пути между дробными кадрами f0..f1. */
const trailOf = (base: Pose, keys: Key[], view: ZView, f0: number, f1: number, n = 8): V3[] =>
  Array.from({ length: n }, (_, k) => edgeW(poseAt(base, keys, lerp(f0, f1, k / (n - 1))), view));

/**
 * Ходьба: тяжёлый шаг. Корпус, голова, плащ и коса — один жёсткий слой: проседает после касания и перевешивается на опорную
 * ногу ровно на целые пиксели (без поворотов). Двигаются ноги и свободная рука; лохмотья плаща отлетают назад и подрагивают
 * по пикселю; пыль — у ступни при касании.
 */
function walkPoses(view: ZView, n = 12): Pose[] {
  const R0 = restOf(view);
  const A = 4.4, LIFT = 3.4, DUTY = 0.56;
  const footAt = (u: number) => {
    u = ((u % 1) + 1) % 1;
    if (u < DUTY) return { y: A - (2 * A * u) / DUTY, z: 0, toe: 0, strike: u < 0.2 ? 1 - u / 0.2 : 0 };
    const s = (u - DUTY) / (1 - DUTY);
    return { y: -A + 2 * A * easeInOut(s), z: LIFT * Math.sin(Math.PI * s), toe: 0.3 * Math.sin(Math.PI * s), strike: 0 };
  };
  const bob = [-1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0];
  const sway = [0, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1];
  const flut = [0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const fr = footAt(t), fl = footAt(t + 0.5);
    const swing = -fl.y / A;
    return {
      ...R0, t, seed: 150 + i,
      root: [view === "side" ? 0 : sway[i], 0, 0], bob: bob[i] * PX,
      foot: [[3.9, 0.4 + fr.y, 3.6 + fr.z], [-3.9, 0.4 + fl.y, 3.6 + fl.z]], toe: [fr.toe, fl.toe],
      hand: [R0.hand[0], add(R0.hand[1], [0, 3.4 * swing, 0.8 * Math.abs(swing)])],
      cape: [flut[i], flut[(i + 4) % 12], flut[(i + 8) % 12]], capeU: [0, 0, 0], rag: [flut[(i + 2) % 12], flut[(i + 6) % 12]],
      flare: view === "side" ? 2.2 : 1.0,
      dust: [fr.strike, fl.strike],
    } as Pose;
  });
}

/**
 * Атака: рубящий удар наискось. Замах — коса над правым плечом, лезвие позади дугой над плечом (наклонено: рог к земле, а не
 * в небо — большой полумесяц не выходит за кадр); удар — лезвие сверху наискось вниз перед собой (кадр 6 — удар, вспышка);
 * след кромки — серп позади лезвия; назад — лезвие низом у ног, навершие за спиной. Вбок — через голову вперёд, к земле.
 */
function attackPoses(view: ZView): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const up: Partial<Pose> = side
    ? { yaw: 0.1, pitch: -0.08, hp: -0.18, bob: PX, scy: scyAt([9, -13, 47], [0.03, 0.75, -0.66], [0, -0.85, -0.5], 14), lb: 14, glow: 1.1, pole: [[1, -0.6, 0.4], R0.pole[1]] }
    : { yaw: -0.28, pitch: -0.04, hp: -0.16, bob: PX, scy: scyAt([14, -6, 45.5], [-0.44, 0.57, -0.7], [0.8, -0.2, -0.4], 14), lb: 14, lgrip: 9, glow: 1.1, pole: [[1, -0.3, 0.3], [-0.3, 0.6, -1]] };
  const peak: Partial<Pose> = side
    ? { ...up, scy: scyAt([9, -14, 46.5], [0.03, 0.77, -0.64], [0, -0.85, -0.5], 14) }
    : { ...up, yaw: -0.34, scy: scyAt([15, -7, 46], [-0.43, 0.59, -0.69], [0.8, -0.2, -0.4], 14) };
  const mid: Partial<Pose> = side
    ? { yaw: -0.05, pitch: 0.12, hp: -0.1, bob: 0, scy: scyAt([9, 9, 49], [0, -0.55, -0.83], [0, 0.83, -0.55], 14), lb: 14, glow: 1.2, pole: [[1, -0.4, 0.4], R0.pole[1]] }
    : { yaw: 0.0, pitch: 0.1, hp: -0.1, bob: 0, scy: scyAt([5, 13, 48], [0, -0.35, -0.94], [1, 0, 0], 14), lb: 14, lgrip: 9, glow: 1.2, pole: [[1, -0.4, 0.2], [-0.5, 0.5, -1]] };
  const hit: Partial<Pose> = side
    ? { yaw: 0.0, pitch: 0.32, hp: 0.0, bob: -2 * PX, scy: scyAt([9.5, 17, 12.6], [0, -0.66, 0.75], [0, 0.75, 0.66], 14), lb: 14, glow: 1.3, flash: 1, pole: [[1, -0.2, 0.3], R0.pole[1]] }
    : { yaw: 0.22, pitch: 0.3, hp: 0.0, bob: -2 * PX, scy: scyAt([-7, 12, 12], [0.5, -0.3, 0.8], [0.85, 0, -0.5], 14), lb: 14, lgrip: 9, glow: 1.3, flash: 1, pole: [[1, -0.3, 0.1], [-0.6, 0.4, -1]] };
  const settle: Partial<Pose> = { ...hit, pitch: (hit.pitch ?? 0) - 0.04, bob: -1 * PX, flash: 0, scy: liftScy(hit.scy!, 1) };
  // возврат: лезвие низом перед ногами обратно к правому боку, навершие — за спиной (поверх головы древко не идёт)
  const back: Partial<Pose> = side
    ? { ...settle, pitch: 0.12, bob: 0 }
    : { yaw: 0.08, pitch: 0.12, hp: -0.04, bob: 0, scy: scyAt([12, 12, 17], [-0.5, -0.75, 0.43], [0.6, 0, 0.8], 13), lb: 13, lgrip: 10, glow: 1.0, pole: R0.pole };
  const keys: Key[] = [
    { f: 0, p: {} },
    { f: 3, p: up, ease: easeInOut },
    { f: 4, p: peak, ease: linear },
    { f: 5, p: mid, ease: easeIn },
    { f: 6, p: hit, ease: easeOut },
    { f: 7, p: settle, ease: easeOut },
    { f: 8, p: back, ease: easeInOut },
    { f: 9, p: {}, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 10, 400);
  poses[5].trail = trailOf(R0, keys, view, 4, 5);
  poses[6].trail = trailOf(R0, keys, view, 4.3, 6);
  poses[7].trail = trailOf(R0, keys, view, 5.5, 6, 4);
  poses[6].flashAt = edgeW(poses[6], view, 0.35);
  poses[6].puff = 1;
  poses[7].puff = 0.5;
  return poses;
}

/**
 * «Жатва»: замах — коса отведена назад вправо, корпус развёрнут, лезвие стоймя на уровне пояса; удержание — дрожь на пиксель,
 * по кромке бежит блик; удар — лезвие проходит полукругом перед собой справа налево (кадр 3 — удар прямо перед ревенантом),
 * плашмя, с широким серпом следа; затем возврат в покой. Коса в одной руке: левая отведена для равновесия.
 */
function reapKeys(view: ZView): { R0: Pose; wind: Partial<Pose>; keys: Key[] } {
  const R0 = restOf(view);
  const wind: Partial<Pose> = {
    yaw: -0.45, pitch: 0.06, hp: 0.08, hy: 0.36, bob: -1 * PX,
    scy: scyAt([19.9, -13.9, 22.9], [-0.6, 0.78, 0.15], [0, 0, 1], 14), lb: 14, lgrip: -99,
    hand: [R0.hand[0], [-14, 6, 26]], pole: [[1, -0.8, -0.3], [-1, 0.5, -0.3]], glow: 1.2,
    foot: [[4.6, -1.2, 3.6], [-3.6, 2.8, 3.6]], cape: [1, 0, 0],
  };
  const start: Partial<Pose> = {
    ...wind, yaw: -0.2, hy: 0.2, bob: -1 * PX,
    scy: scyAt([22, 0, 21], [-0.84, 0.53, 0.08], norm([0.27, 0.42, 0.5]), 13), lb: 13, hand: [R0.hand[0], [-14, 2, 25]],
  };
  const hit: Partial<Pose> = {
    ...wind, yaw: 0.25, hy: -0.15, pitch: 0.16, bob: -2 * PX,
    scy: scyAt([0, 21.5, 19], [0.47, -0.87, 0.13], [0.87, 0.47, 0], 14), lb: 14, hand: [R0.hand[0], [-13, -4, 25]], glow: 1.35,
    foot: [[3.9, -0.6, 3.6], [-3.9, 2.0, 3.6]], cape: [0, 0, 1],
  };
  const follow: Partial<Pose> = {
    ...hit, yaw: 0.5, hy: -0.3, pitch: 0.12, bob: -1 * PX,
    scy: scyAt([-15, 16, 21], [0.85, -0.5, 0.1], [0.5, 0.85, 0], 16), lb: 16, hand: [R0.hand[0], [-12, -6, 26]], glow: 1.2,
  };
  const keys: Key[] = [
    { f: 0, p: wind },
    { f: 1, p: start, ease: easeIn },
    { f: 3, p: hit, ease: linear },
    { f: 5, p: follow, ease: easeOut },
    { f: 9, p: freeLeft(R0), ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function reapWindPoses(view: ZView): Pose[] {
  const { R0, wind } = reapKeys(view);
  return keyed(R0, [{ f: 0, p: freeLeft(R0) }, { f: 3, p: wind, ease: easeInOut }], 4, 500);
}
function reapHoldPoses(view: ZView): Pose[] {
  const { R0, wind } = reapKeys(view);
  const base = { ...R0, ...wind } as Pose;
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 520 + i,
    armLift: [tremble[i], 0] as [number, number],
    glow: [1.2, 1.45, 1.3, 1.45][i], glint: (i + 0.5) / 4,
  }));
}
function reapPoses(view: ZView): Pose[] {
  const { R0, keys } = reapKeys(view);
  const poses = keyed(R0, keys, 10, 540);
  poses[1].trail = trailOf(R0, keys, view, 0.3, 1, 5);
  poses[2].trail = trailOf(R0, keys, view, 0.4, 2);
  poses[3].trail = trailOf(R0, keys, view, 1, 3);
  poses[4].trail = trailOf(R0, keys, view, 2, 4);
  poses[5].trail = trailOf(R0, keys, view, 3.6, 5, 5);
  poses[3].flash = 1;
  poses[3].flashAt = edgeW(poses[3], view, 0);
  poses[9] = { ...poses[9], ...REST_OF_GRIP(R0) };
  return poses;
}
/** Последний кадр возврата: левая рука снова на древке. */
const REST_OF_GRIP = (R0: Pose): Partial<Pose> => ({ lgrip: R0.lgrip, hand: R0.hand });

/**
 * «Руки из курганов»: замах — коса поднята стоймя в правой руке, лезвие полумесяцем над головой налито фиолетовым светом;
 * удержание — дрожь и свет ступенями; удар — навершие древка в землю (кадр 2): фиолетовая волна по земле, комья, вспышка.
 */
function handsKeys(view: ZView): { R0: Pose; wind: Partial<Pose>; keys: Key[] } {
  const R0 = restOf(view);
  const side = view === "side";
  // коса стоймя у правого плеча, навершие чуть над землёй: полумесяц дугой над плечом и шлемом, длинный рог — к голове
  const g: V3 = side ? [8, 12, 38] : [13, 5, 37];
  const lb = 13;
  const sp: V3 = side ? [0, -1, 0] : [-1, 0, 0];
  const wind: Partial<Pose> = {
    yaw: side ? 0.25 : -0.1, pitch: -0.06, hp: -0.2, bob: 1 * PX,
    scy: [g, [0, 0.04, -1], sp], lb, lgrip: -99,
    hand: [R0.hand[0], side ? [-12, 4, 24] : [-14.5, 7, 27]], pole: [[1, -0.3, -0.6], [-1, 0.3, -0.5]],
    glow: 1.3, charge: 0.5, lopen: 1,
  };
  const rise: Partial<Pose> = { ...wind, pitch: -0.1, bob: 2 * PX, scy: liftScy(wind.scy!, 1), glow: 1.45, charge: 1 };
  const drop = 6;
  const hit: Partial<Pose> = {
    ...wind, pitch: 0.14, hp: 0.05, bob: -2 * PX, scy: liftScy(wind.scy!, -drop), hand: [R0.hand[0], side ? [-11, 7, 19.5] : [-13, 8, 20]],
    glow: 1.5, charge: 1, ring: 0.12, clods: 1, flash: 1,
  };
  const keys: Key[] = [
    { f: 0, p: wind },
    { f: 1, p: rise, ease: easeOut },
    { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, ring: 0.42, clods: 0.7, flash: 0, charge: 0.6 }, ease: linear },
    { f: 4, p: { ...hit, ring: 0.7, clods: 0.4, flash: 0, charge: 0.3, bob: -1 * PX }, ease: linear },
    { f: 5, p: { ...hit, ring: 0.95, clods: 0.15, flash: 0, charge: 0, bob: -1 * PX }, ease: linear },
    // волна и комья остаются там, где ударило навершие, и гаснут до того, как коса пойдёт обратно
    { f: 6, p: { ...hit, ring: 0, clods: 0, flash: 0, charge: 0, bob: -1 * PX }, ease: linear },
    { f: 9, p: freeLeft(R0), ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function handsWindPoses(view: ZView): Pose[] {
  const { R0, wind } = handsKeys(view);
  return keyed(R0, [{ f: 0, p: freeLeft(R0) }, { f: 3, p: wind, ease: easeInOut }], 4, 600);
}
function handsHoldPoses(view: ZView): Pose[] {
  const { R0, wind } = handsKeys(view);
  const base = { ...R0, ...wind } as Pose;
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 620 + i,
    armLift: [tremble[i], 0] as [number, number],
    glow: [1.3, 1.5, 1.35, 1.5][i], charge: [0.5, 1, 0.5, 1][i],
  }));
}
function handsSlamPoses(view: ZView): Pose[] {
  const { R0, keys } = handsKeys(view);
  const poses = keyed(R0, keys, 10, 640);
  // вспышка — у навершия, где древко ударило в землю
  const p2 = poses[2], s = scyOf(p2.scy);
  const sh = bodyShift(view, p2);
  const pom = add(scyPoints([add(s[0], sh), s[1], s[2]], p2.lb).pom, [0, 0, 0]);
  p2.flashAt = [pom[0], pom[1], 1.5];
  poses[9] = { ...poses[9], ...REST_OF_GRIP(R0) };
  return poses;
}

/**
 * «Надгробие»: замах — левая рука отпускает древко и поднимается над головой, над ладонью разгорается фиолетовый огонёк;
 * удержание — огонёк пульсирует, рука дрожит; удар — кулак сжимается и рывком опускается (кадр 2): камень падает на цель.
 */
function stoneKeys(view: ZView): { R0: Pose; wind: Partial<Pose>; keys: Key[] } {
  const R0 = restOf(view);
  const wind: Partial<Pose> = {
    yaw: 0.08, pitch: -0.1, hp: -0.3, bob: 0, lgrip: -99,
    hand: [R0.hand[0], view === "side" ? [-11.5, 8.5, 43.6] : [-11.5, 3.5, 44.4]], pole: [R0.pole[0], [-1, -0.2, 0.2]], orb: 1.0, glow: 1.3, lopen: 1,
  };
  const clench: Partial<Pose> = { ...wind, hand: [R0.hand[0], view === "side" ? [-11.5, 8.5, 44.6] : [-11.5, 3.5, 45.4]], orb: 0.6, glow: 1.45, lopen: 0.3 };
  const hit: Partial<Pose> = { ...wind, pitch: 0.16, hp: 0.05, bob: -1 * PX, hand: [R0.hand[0], [-10.5, 8, 25]], orb: 0, glow: 1.5, flash: 1, lopen: 0 };
  const keys: Key[] = [
    { f: 0, p: wind },
    { f: 1, p: clench, ease: easeOut },
    { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, bob: 0, pitch: 0.12 }, ease: easeOut },
    { f: 7, p: freeLeft(R0), ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function stoneWindPoses(view: ZView): Pose[] {
  const { R0, wind } = stoneKeys(view);
  return keyed(R0, [{ f: 0, p: freeLeft(R0) }, { f: 3, p: wind, ease: easeInOut }], 4, 700).map((p, i) => ({ ...p, orb: [0, 0.3, 0.7, 1][i] }));
}
function stoneHoldPoses(view: ZView): Pose[] {
  const { R0, wind } = stoneKeys(view);
  const base = { ...R0, ...wind } as Pose;
  const tremble = [0, 1, 0, -1];
  return [0, 1, 2, 3].map((i) => ({
    ...base, t: i / 4, seed: 720 + i,
    armLift: [0, tremble[i]] as [number, number],
    orb: [1.0, 1.4, 1.1, 1.4][i], glow: [1.3, 1.5, 1.35, 1.5][i],
  }));
}
function stoneCastPoses(view: ZView): Pose[] {
  const { R0, keys } = stoneKeys(view);
  const poses = keyed(R0, keys, 8, 740);
  // след кулака: сверху вниз по дуге
  const fistW = (p: Pose): V3 => add(p.hand[1], bodyShift(view, p));
  const path = (f0: number, f1: number, n = 6) => Array.from({ length: n }, (_, k) => fistW(poseAt(R0, keys, lerp(f0, f1, k / (n - 1)))));
  poses[2].trail = path(1, 2);
  poses[3].trail = path(1.6, 2.4, 4);
  poses[2].flashAt = add(fistW(poses[2]), [0, 1, -2]);
  poses[7] = { ...poses[7], ...REST_OF_GRIP(R0) };
  return poses;
}

/**
 * Гибель: стоит один кадр, отшатнулся (кадр 1), качнулся (2); коса выскальзывает из руки (3), падает назад, от камеры (4),
 * и с кадра 5 лежит за ревенантом поперёк кадра — лезвие со своей стороны, рогом вверх; колени подгибаются, корпус
 * опускается по 4–5 px за кадр (3 → 5), склоняется (6) и за пять кадров уходит в землю курганов; глаза гаснут, сталь
 * выцветает в пепел, плащ и табард — лишь отчасти (бурые до конца), вверх уходят фиолетовые огоньки душ. Всё, что ложится на землю, — за телом или вбок,
 * курган широкий и неглубокий к зрителю: ни в одном виде кадр не доходит до нижнего края (последний кадр остаётся трупом).
 */
function deathPoses(view: ZView): Pose[] {
  const R0 = restOf(view);
  // коса после падения — в осях вида (Xv вправо, Yv к зрителю, Zv вверх): вниз лезвие слева, вверх и вбок — справа;
  // падает от зрителя: вниз и вбок — из-перед тела назад, вверх (коса и так перед ним, то есть дальше от зрителя) — ещё дальше
  const sx = view === "down" ? -1 : 1;
  const W = (v: V3): V3 => fromView(view, v);
  const yFall = view === "up" ? -10 : 1, yLie = view === "up" ? -9 : -4;
  const fall = scyAt(W([sx * 25, yFall, 12]), W([-sx * 0.95, -0.1, 0.3]), W([0, -0.25, 0.97]), R0.lb);
  const lying = scyAt(W([sx * 23, yLie, 1.2]), W([-sx, -0.15, 0]), W([0, -0.5, 0.86]), R0.lb);
  // отшатнулся: коса в руке уходит назад вместе с телом
  const recoil: Partial<Pose> = { ...freeLeft(R0), pitch: -0.14, bob: 1 * PX, hp: -0.3, glow: 1.5, hand: [R0.hand[0], add(gripPoint(R0), [-4, -2, 3])], scy: [add(R0.scy[0], [0, -1.5, 0]), R0.scy[1], R0.scy[2]] };
  const stagger: Partial<Pose> = { ...recoil, pitch: 0.1, roll: 0.06, yaw: -0.1, bob: 0, hp: -0.1, glow: 0.9 };
  const kneel: [V3, V3] = [[4.4, -5.2, 3.0], [-4.4, -4.8, 3.0]];
  /** уходя в землю, ноги уходят вместе с телом (иначе колени и сапоги торчат из кургана к зрителю) */
  const sunk = (s: number): [V3, V3] => [add(kneel[0], [0, 0, -s]), add(kneel[1], [0, 0, -s])];
  /** руки уходят в землю по бокам, у колен, а не тянутся вперёд к зрителю */
  const SUNK_HANDS: [V3, V3] = [[9.5, 3.5, 18], [-9.5, 3.5, 18]];
  // на коленях тело отходит от зрителя (away): вниз на 4, вверх и вбок на 9 — там к зрителю обращены подол плаща и плечо с рукой,
  // и на уровне земли они иначе доходят до нижнего края кадра
  const knees: Partial<Pose> = {
    ...recoil, root: [0, -1.6, 0], pitch: 0.3, roll: 0.03, yaw: 0, bob: -7 * PX, hp: 0.15, foot: kneel, toe: [-0.9, -0.9],
    held: 0, scy: lying, hand: [[10, 8, 21], [-10, 8, 21]], pole: [[1, -0.4, 0.2], [-1, -0.4, 0.2]], glow: 0.6, wither: 0.15, dust: [1, 1], hem: 0.55, away: view === "down" ? 4 : 9,
  };
  const slump: Partial<Pose> = { ...knees, pitch: 0.42, bob: -8 * PX, hp: 0.5, hand: [[8, 8.4, 17.2], [-8, 8.4, 17.2]], glow: 0.3, wither: 0.4, dust: [0.3, 0.3], wisps: 0.15 };
  const keys: Key[] = [
    // стояние — один кадр: сразу отшатнулся
    { f: 0, p: { glow: 1.0 } },
    { f: 1, p: recoil, ease: easeOut },
    { f: 2, p: stagger, ease: easeInOut },
    // коса выскальзывает, колени подгибаются; дальше корпус опускается на 4–5 px за кадр (к коленям — кадр 5)
    { f: 3, p: { ...stagger, held: 0, scy: fall, bob: -2.5 * PX, pitch: 0.18, glow: 0.8 }, ease: easeIn },
    { f: 5, p: knees, ease: linear },
    { f: 6, p: slump, ease: easeOut },
    // уходя в землю, корпус выпрямляется: голова остаётся над серединой кургана, а не нависает над краем к зрителю;
    // плащ и табард уходят вместе с телом, курган растёт поверх
    { f: 7, p: { ...slump, pitch: 0.36, sink: 4, foot: sunk(4), hand: SUNK_HANDS, mound: 0.3, glow: 0.15, wither: 0.55, wisps: 0.25, dust: [0, 0] }, ease: easeIn },
    { f: 8, p: { ...slump, pitch: 0.3, sink: 9, foot: sunk(9), hand: SUNK_HANDS, mound: 0.55, glow: 0.05, wither: 0.7, wisps: 0.45, dust: [0, 0] }, ease: linear },
    { f: 9, p: { ...slump, pitch: 0.24, sink: 14, foot: sunk(14), hand: SUNK_HANDS, mound: 0.8, glow: 0, wither: 0.85, wisps: 0.65, dust: [0, 0] }, ease: linear },
    { f: 10, p: { ...slump, pitch: 0.2, sink: 18, foot: sunk(18), hand: SUNK_HANDS, mound: 0.93, glow: 0, wither: 0.95, wisps: 0.85, dust: [0, 0] }, ease: linear },
    { f: 11, p: { ...slump, pitch: 0.16, sink: 21, foot: sunk(21), hand: SUNK_HANDS, mound: 1, glow: 0, wither: 1, wisps: 1, dust: [0, 0] }, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 12, 800);
  // коса: до кадра 2 в руке, с кадра 3 — сама по себе (мир): в кадре 4 падает, лежит с кадра 5
  for (let i = 3; i < 12; i++) poses[i].held = 0;
  for (let i = 5; i < 12; i++) poses[i].scy = lying;
  return poses;
}

export type ReaperAnim =
  | "idle" | "walk" | "attack" | "reapWind" | "reapHold" | "reap" | "handsWind" | "handsHold" | "handsSlam"
  | "stoneWind" | "stoneHold" | "stoneCast" | "death";
/**
 * Анимации: первый столбец листа, число кадров, кадров в секунду, по кругу ли, что играть следом; hit — кадр удара.
 * Замахи умений — связки: «замах» → «удержание» по кругу до конца предупреждения → «удар» (кадр hit — ровно в конце).
 */
export const REAPER_ANIMS: Record<ReaperAnim, { col: number; n: number; fps: number; loop: boolean; ru: string; next?: ReaperAnim; hit?: number }> = {
  idle: { col: 0, n: 12, fps: 12, loop: true, ru: "покой" },
  walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
  attack: { col: 24, n: 10, fps: 15, loop: false, ru: "атака", hit: 6 },
  reapWind: { col: 34, n: 4, fps: 12, loop: false, ru: "замах жатвы", next: "reapHold" },
  reapHold: { col: 38, n: 4, fps: 12, loop: true, ru: "удержание жатвы", next: "reap" },
  reap: { col: 42, n: 10, fps: 12, loop: false, ru: "жатва", hit: 3 },
  handsWind: { col: 52, n: 4, fps: 12, loop: false, ru: "замах рук", next: "handsHold" },
  handsHold: { col: 56, n: 4, fps: 12, loop: true, ru: "удержание рук", next: "handsSlam" },
  handsSlam: { col: 60, n: 10, fps: 12, loop: false, ru: "удар оземь", hit: 2 },
  stoneWind: { col: 70, n: 4, fps: 12, loop: false, ru: "замах надгробия", next: "stoneHold" },
  stoneHold: { col: 74, n: 4, fps: 12, loop: true, ru: "удержание надгробия", next: "stoneCast" },
  stoneCast: { col: 78, n: 8, fps: 12, loop: false, ru: "бросок надгробия", hit: 2 },
  death: { col: 86, n: 12, fps: 12, loop: false, ru: "гибель" },
};
export const REAPER_COLS = 98;
/** Умения карточки → анимации и эффекты мира (кадр hit удара — ровно в конце предупреждения windupMs). */
export const REAPER_SKILLS: Record<string, { windup: [ReaperAnim, ReaperAnim]; strike: ReaperAnim; fx?: "hands" | "stone" }> = {
  scythe_arc: { windup: ["reapWind", "reapHold"], strike: "reap" },
  grave_hands: { windup: ["handsWind", "handsHold"], strike: "handsSlam", fx: "hands" },
  gravestone: { windup: ["stoneWind", "stoneHold"], strike: "stoneCast", fx: "stone" },
};
const POSES: Record<ReaperAnim, (view: ZView) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v), attack: attackPoses,
  reapWind: reapWindPoses, reapHold: reapHoldPoses, reap: reapPoses,
  handsWind: handsWindPoses, handsHold: handsHoldPoses, handsSlam: handsSlamPoses,
  stoneWind: stoneWindPoses, stoneHold: stoneHoldPoses, stoneCast: stoneCastPoses,
  death: deathPoses,
};

/** Один кадр для отладки: вид, анимация, номер. */
export function reaperFrame(view: ZView, anim: ReaperAnim, i: number): PC {
  return renderReaper(view, POSES[anim](view)[i]);
}

// ---------------- эффекты мира: руки из курганов, надгробие ----------------
/** Центр метки в кадре эффекта 64×64 (как у пилота). Земля в игре — без сжатия: смещение по экрану → мир вида (y / SN). */
const FX_AY = 44;
const ground = (ox: number, oy: number): V3 => [ox, (FX_AY - GY + oy) / SN, 0];

/** Трещина: изломанный отрезок; ширина от w0 к 1,2 px. */
interface Crack { pts: [number, number][]; w0: number }
function crack(x0: number, y0: number, a: number, len: number, w0: number, seed: number): Crack {
  let x = x0, y = y0;
  const pts: [number, number][] = [[x, y]];
  for (let s = 0; s < len; s += 1) {
    if (s % 3 === 2) a += (hash01(seed, s, 3) - 0.5) * 1.0;
    // трещина с кромкой не доходит до края кадра
    if (x + Math.cos(a) < 3.5 || x + Math.cos(a) > 60.5 || y + Math.sin(a) < 3.5 || y + Math.sin(a) > 59.5) break;
    x += Math.cos(a);
    y += Math.sin(a);
    pts.push([x, y]);
  }
  return { pts, w0 };
}
/**
 * Трещины в земле: щель, светлая кромка снизу-справа, бурая сверху-слева; grow — доля длины от начала. glow > 0 — из щели
 * бьёт фиолетовый свет курганов (тон по силе). Без полупрозрачности.
 */
function drawCracks(o: PC, cracks: Crack[], grow: number, glow = 0, pale = false) {
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
    if (inner[y * N + x]) { o.set(x, y, glow > 0.15 ? EYE[glow > 0.6 ? 2 : 1] : EARTH[pale ? 1 : 0]); continue; }
    if (at(x - 1, y) || at(x, y - 1)) o.set(x, y, EARTH[pale ? 3 : 4]);
    else if (at(x + 1, y) || at(x, y + 1)) o.set(x, y, EARTH[2]);
  }
}
/** Яма: тёмная глубина (или фиолетовый свет в ней), освещённая дальняя стенка, рваный вывороченный край. */
function drawHole(o: PC, cx: number, cy: number, open: number, k: number, glow = 0, pale = false) {
  if (open <= 0.05) return;
  const rx = 1.2 + 2.6 * open, ry = 0.7 + 1.4 * open;
  const RX = rx + 1.8, RY = ry + 1.3;
  for (let y = Math.floor(cy - RY); y <= cy + RY; y++) for (let x = Math.floor(cx - RX); x <= cx + RX; x++) {
    const ux = x + 0.5 - cx, uy = y + 0.5 - cy;
    const dout = (ux / RX) ** 2 + (uy / RY) ** 2;
    if (dout > 1) continue;
    const din = (ux / rx) ** 2 + (uy / ry) ** 2;
    if (din <= 1) {
      if (glow > 0.15) o.set(x, y, din < 0.35 ? EYE[glow > 0.6 ? 3 : 2] : uy < -0.25 * ry ? EARTH[1] : EYE[glow > 0.6 ? 1 : 0]);
      else o.set(x, y, uy < -0.25 * ry ? EARTH[pale ? 2 : 1] : EARTH[pale ? 1 : 0]);
      continue;
    }
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
/** Плоский клуб пыли в точке кадра: 2 клуба в стороны, 3 тона, низ тёмный. */
function drawPuffAt(o: PC, cx: number, cy: number, k: number, spread = 1, size = 1) {
  const t = 1 - k;
  for (let j = 0; j < 2; j++) {
    const dir = j ? 1 : -1;
    const px = cx + dir * (2.5 + 3.5 * t) * spread, py = cy - t;
    const rx = (1.5 + 1.2 * k) * size, ry = Math.max(0.9, rx * 0.55);
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry;
      if (dx * dx + dy * dy > 1) continue;
      o.set(x, y, DUST[dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2]);
    }
  }
}
/** Сцена эффекта → два слоя по признаку детали (front[i] — поверх юнитов). */
function fxLayers(S: Scene, front: (q: Prim) => boolean): [PC, PC] {
  const layers: [PC, PC] = [new PC(N, N), new PC(N, N)];
  if (!S.prims.length) return layers;
  const { gb, prims, L } = renderScene(S, null, 0);
  for (let i = 0; i < N * N; i++) {
    if (gb.prim[i] < 0) continue;
    layers[front(prims[gb.prim[i]]) ? 1 : 0].set(i % N, (i / N) | 0, MATS[L.mat[i]].ramp[L.idx[i]]);
  }
  for (const l of layers) {
    l.outline(OUT);
    sealPinholes(l);
  }
  return layers;
}

/** Руки мертвецов: основание (угол на экране, радиус), наклон к центру, рост, задержка. */
interface HandDef { th: number; r: number; lean: number; h: number; delay: number }
const GRAVE_HANDS: HandDef[] = [
  { th: 198, r: 15, lean: 3.0, h: 11.5, delay: 0.1 },
  { th: 342, r: 15, lean: -3.0, h: 12.5, delay: 0 },
  { th: 128, r: 12.5, lean: 2.2, h: 10.5, delay: 0.18 },
  { th: 52, r: 12.5, lean: -2.2, h: 11, delay: 0.06 },
];
const handBase = (d: HandDef): [number, number] => [Math.cos((d.th * Math.PI) / 180) * d.r, Math.sin((d.th * Math.PI) / 180) * d.r];
const handFront = (d: HandDef) => Math.sin((d.th * Math.PI) / 180) > 0.2;

/** Рука из земли: предплечье, ладонь к центру, четыре пальца-когтя и большой; grow — насколько вышла, spread — растопырены, curl — сжаты. */
function graveHand(S: Scene, d: HandDef, k: number, grow: number, spread: number, curl: number) {
  const [ox, oy] = handBase(d);
  const g = S.group(0.9);
  const sink = (1 - grow) * (d.h + 9);
  const base = add(ground(ox, oy), [0, 0, -3 - sink]);
  const wrist = add(ground(ox, oy), [d.lean * 0.55, 0, d.h - sink]);
  const pal = add(wrist, [d.lean * 0.2, 0.3, 2.3]);
  const part = S.newPart();
  // кости предплечья в лохмотьях истлевшей кожи (тёмный пояс у земли), кисть — кость
  S.cone(g, base, 2.3, wrist, 1.7, { mat: M_BONE, seed: 120 + k, tone: -0.35, band: [0, 0.45], bandMat: M_CORPSE });
  S.ell(g, pal, [2.5, 1.3, 2.3], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], { mat: M_BONE, seed: 121 + k, part, tone: -0.15 });
  // пальцы-когти: веером вверх и в стороны, последняя фаланга загнута к центру метки (к герою); сжатие — когти внутрь и вниз
  const toC = -Math.sign(ox || 1);
  [-1.5, -0.5, 0.5, 1.5].forEach((fx, j) => {
    const b0 = add(pal, [fx * 1.1, 0, 1.5 - Math.abs(fx) * 0.35]);
    const dir1 = norm([fx * (0.35 + 0.6 * spread) + toC * 0.25 * curl, 0.15 + 0.3 * curl, 1]);
    const l1 = 2.7 + (j === 1 || j === 2 ? 0.7 : 0) - 0.5 * curl;
    const b1 = add(b0, mul(dir1, l1));
    const dir2 = norm(lerpV([fx * 0.45 + toC * 0.55, 0.2, 0.75], [toC * 1.1, 0.6, -0.7], curl));
    S.cone(g, b0, 0.9, b1, 0.72, { mat: M_BONE, seed: 130 + j, part });
    S.cone(g, b1, 0.72, add(b1, mul(dir2, 2.4)), 0.42, { mat: M_BONE, seed: 134 + j, part, tone: 0.2 });
  });
  const sd = -Math.sign(d.lean || 1);
  const tb = add(pal, [sd * 2.2, 0.2, -0.3]);
  S.cone(g, tb, 0.9, add(tb, [sd * (1.2 + 1.0 * spread), 0.4 + 0.9 * curl, 1.5]), 0.55, { mat: M_BONE, seed: 138, part });
  return g;
}

/**
 * Эффект мира «Руки из курганов» (…-handsfx.png): кадр 64×64, центр метки — (32, 44). Строка 0 — нижний слой (под юнитами:
 * трещины с фиолетовым светом, ямы, задние руки), строка 1 — верхний (передняя рука, летящие комья). 10 кадров, 12 к/с,
 * кадр hit (2) — руки вырываются из земли ровно в конце предупреждения; затем хватают (сжимаются) и уходят обратно.
 */
export const HANDSFX = { n: 10, fps: 12, hit: 2, ay: FX_AY };
export function buildHandsFx(): PC {
  const out = new PC(N * HANDSFX.n, N * 2);
  const grow = [0, 0.32, 1, 1.06, 1, 0.96, 0.72, 0.44, 0.14, 0];
  const spread = [0, 0.4, 1, 1, 0.5, 0.3, 0.3, 0.2, 0.1, 0];
  const curl = [0, 0.15, 0.05, 0.35, 1, 1, 0.9, 0.75, 0.5, 0];
  const hole = [0.35, 0.8, 1, 1, 1, 1, 0.95, 0.8, 0.5, 0.22];
  const crk = [0.45, 0.85, 1, 1, 1, 1, 0.9, 0.7, 0.45, 0.2];
  const glow = [1, 1, 0.9, 0.7, 0.55, 0.45, 0.35, 0.25, 0.1, 0];
  const cracks: Crack[] = [];
  GRAVE_HANDS.forEach((d, k) => {
    const [ox, oy] = handBase(d);
    for (let j = 0; j < 2; j++) {
      const a = Math.atan2(oy, ox) + (j ? 0.9 : -0.9) + (hash01(k, j, 5) - 0.5) * 0.6;
      cracks.push(crack(CX + ox + Math.cos(a) * 3, FX_AY + oy + Math.sin(a) * 2, a, 5 + 3 * hash01(k, j, 6), 2.6, 40 + k * 3 + j));
    }
  });
  for (let i = 0; i < HANDSFX.n; i++) {
    const S = new Scene();
    const owner = new Map<number, HandDef>();
    GRAVE_HANDS.forEach((d, k) => {
      const g = clamp(grow[i] - d.delay * (i <= 2 ? 1 : 0), 0, 1.1);
      if (g > 0.03) owner.set(graveHand(S, d, k, g, spread[i], curl[i]), d);
    });
    const [lb, lf] = fxLayers(S, (q) => handFront(owner.get(q.g)!));
    const back = new PC(N, N), front = new PC(N, N);
    drawCracks(back, cracks, crk[i], glow[i], i >= 8);
    GRAVE_HANDS.forEach((d, k) => { const [ox, oy] = handBase(d); drawHole(back, CX + ox, FX_AY + oy + 0.5, hole[i], k + 3, glow[i], i >= 8); });
    // комья: летят из ям с кадра удара, ложатся вокруг и тают
    if (i >= 2) GRAVE_HANDS.forEach((d, k) => {
      const [ox, oy] = handBase(d);
      for (let j = 0; j < 2; j++) {
        const n = k * 2 + j;
        if (i >= 7 && n >= (9 - i) * 2) continue;
        const [x, y, rest] = clodPos(CX + ox + (j ? 2 : -3), FX_AY + oy, (j ? 1 : -1) * (1.1 + 0.7 * hash01(k, j, 8)), 1.8 + 1.2 * hash01(k, j, 9), (i - 2) * 1.7);
        drawClodAt(rest ? back : front, x, y + (rest ? 1 : 0), n);
      }
    });
    back.blit(lb, 0, 0);
    front.blit(lf, 0, 0);
    // пыль у ям в кадр удара и после; огоньки курганов поднимаются из ям
    if (i >= 2 && i <= 4) GRAVE_HANDS.forEach((d) => { const [ox, oy] = handBase(d); drawPuffAt(handFront(d) ? front : back, CX + ox, FX_AY + oy + 1, 1 - (i - 2) / 3, 0.8); });
    if (i >= 1 && i <= 7) GRAVE_HANDS.forEach((d, k) => {
      const [ox, oy] = handBase(d);
      const f = (i - 1 + k * 0.7) / 6;
      const x = Math.round(CX + ox + 2.5 * Math.sin(f * 7 + k)), y = Math.round(FX_AY + oy - 4 - 16 * f);
      front.set(x, y, EYE[f < 0.5 ? 3 : 2]);
      front.set(x, y + 1, EYE[f < 0.5 ? 1 : 0]);
    });
    sealPinholes(back, true);
    sealPinholes(front, true);
    out.blit(back, i * N, 0);
    out.blit(front, i * N, N);
  }
  return out;
}

/**
 * Эффект мира «Надгробие» (…-stonefx.png): кадр 64×64, центр метки — (32, 44); строки — нижний и верхний слой, как у рук.
 * 14 кадров, 12 к/с: камень падает сверху (кадры 0–1, следы скорости), под ним на земле растёт тень; кадр hit (2) — удар
 * в конце предупреждения: камень входит в землю, пыль, трещины; от основания по дугам разлетаются осколки и комья, за 3–5
 * кадров падают, лежат и исчезают; стоит, крест на нём светится фиолетовым; затем уходит в землю, остаётся холмик.
 */
export const STONEFX = { n: 14, fps: 12, hit: 2, ay: FX_AY };
const TOMB: SlabDef = { w: 10, h: 17, th: 2.6, rr: 1.0 };
export function buildStoneFx(): PC {
  const out = new PC(N * STONEFX.n, N * 2);
  const zOf = [16, 6, -2, -2.6, -3.2, -3.2, -3.2, -3.2, -3.2, -6.5, -12, -18.5, -25.5, -32];
  const roll = [-0.04, -0.03, 0.07, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.05, 0.04, 0.03, 0.02, 0.02];
  const eng = [0, 0, 0, 0, 0.35, 0.8, 1, 0.75, 1, 0.6, 0.35, 0.2, 0, 0];
  const mound = [0, 0, 0.25, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.45, 0.6, 0.75, 0.8, 0.6];
  const crk = [0, 0, 1, 1, 1, 1, 1, 1, 1, 0.85, 0.7, 0.55, 0.4, 0.25];
  const cracks: Crack[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.35 + (hash01(k, 1, 77) - 0.5) * 0.6;
    cracks.push(crack(CX + Math.cos(a) * 10.5, FX_AY + 1 + Math.sin(a) * 3.8, a, 4 + 4 * hash01(k, 2, 77), 2.4, 60 + k));
  }
  for (let i = 0; i < STONEFX.n; i++) {
    const S = new Scene();
    const z = zOf[i];
    if (z > -TOMB.h - TOMB.w) {
      const g = S.group(0);
      const ax: [V3, V3, V3] = [rot([1, 0, 0], 0, 0, roll[i]), rot([0, 0, 1], 0, 0, roll[i]), [0, 1, 0]];
      S.slab(g, add(ground(0, 0.5), [0, 0, z]), ax, TOMB, { mat: M_STONE, seed: 150, eng: eng[i] });
    }
    if (mound[i] > 0.02) {
      const g = S.group(1.4);
      const m = mound[i];
      S.ell(g, add(ground(0, 0.5), [0, 0, -1.6]), [7.5 + 3 * m, 3.4 + 1.4 * m, 1.8 + 3.6 * m], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], { mat: M_EARTH, seed: 151 });
    }
    const [, lf] = fxLayers(S, () => true);
    const back = new PC(N, N), front = new PC(N, N);
    drawCracks(back, cracks, crk[i], 0, i >= 11);
    // тень падающего камня на земле: растёт и темнеет по мере падения (до удара)
    if (i <= 1) {
      const k = i === 0 ? 0.6 : 0.9;
      const rx = 4 + 7 * k, ry = 1.4 + 2.2 * k;
      for (let y = Math.floor(FX_AY + 1 - ry); y <= FX_AY + 1 + ry; y++) for (let x = Math.floor(CX - rx); x <= CX + rx; x++) {
        const dx = (x + 0.5 - CX) / rx, dy = (y + 0.5 - (FX_AY + 1)) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1) back.set(x, y, [12, 10, 16, Math.round((d < 0.45 ? 150 : 95) * k)]);
      }
    }
    // следы скорости над падающим камнем: три штриха, светлые к низу
    if (i <= 1) {
      const top = Math.round(FX_AY - (z + TOMB.h + TOMB.w) * CS);
      for (const [dx, len] of [[-5, 7 + 5 * i], [0, 10 + 6 * i], [5, 7 + 5 * i]] as [number, number][]) {
        for (let s = 0; s < len; s++) {
          const y = top - 2 - s;
          if (y < 1) break;
          front.set(CX + dx, y, SMEAR[s < len * 0.35 ? 2 : s < len * 0.75 ? 1 : 0]);
        }
      }
    }
    front.blit(lf, 0, 0);
    // удар: пыль в стороны и комья
    if (i >= 2 && i <= 5) drawPuffAt(front, CX, FX_AY + 2, 1 - (i - 2) / 4, 2.6, 1.5);
    // обломки камня и комья земли: вылетают от основания в кадре удара по дугам, за 3–5 кадров падают, лежат и исчезают
    if (i >= 2 && i <= 9) for (let k = 0; k < 8; k++) {
      const side = k % 2 ? 1 : -1;
      const dir = side * (1.0 + 0.6 * hash01(k, 1, 33));
      const [x, y, rest] = clodPos(CX + side * (9 + (k >> 2)), FX_AY - (k >> 2) * 2, dir, 3.2 + 1.6 * hash01(k, 2, 33), (i - 2) * 1.8);
      if (rest && i >= 7 + (k % 3)) continue;
      if (k % 2 === 0) {
        // осколок камня: светлый верх, тёмный низ — виден на пыли и траве
        const L = rest ? back : front;
        L.set(x, y, STONE[4]); L.set(x + 1, y, STONE[3]); L.set(x, y + 1, STONE[2]); L.set(x + 1, y + 1, STONE[0]);
      } else drawClodAt(rest ? back : front, x, y + (rest ? 1 : 0), k);
    }
    sealPinholes(back, true);
    sealPinholes(front, true);
    out.blit(back, i * N, 0);
    out.blit(front, i * N, N);
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
/** Строки атласа tiles/terrain.png (shared/map.ts, TERRAIN_KEYS): трава и земля. */
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
  "—": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  ",":["     ", "     ", "     ", "     ", "     ", "  #  ", " #   "],
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

type Row = { h: number; draw: (c: PC, y: number) => void };
/** ×3: герой, ревенант вниз, вверх, вбок, влево (кадр покоя) — на траве или на земле. */
function sceneRow(idle: PC, hero: PC, terrain: PC, g: Ground, W: number, frame = 0): Row {
  const frameOf = (view: number) => crop(idle, frame * N, view * N, N, N);
  return {
    h: 64 * 3 + 40,
    draw: (c, y0) => {
      const k = 3;
      text(c, `×3 · ГЕРОЙ 32 И РЕВЕНАНТ 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · ${g === "grass" ? "ТРАВА" : "ЗЕМЛЯ"}`, 16, y0 + 8);
      const y = y0 + 36;
      groundBg(c, terrain, 16, y, W - 32, 64 * k, k, g);
      let x = 40;
      const hy = y + (64 - 32) * k;
      shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
      c.blit(scaleNN(crop(hero, 0, 0, 32, 32), k), x, hy);
      x += 30 * k;
      for (const [v, flip] of [[0, false], [1, false], [2, false], [2, true]] as [number, boolean][]) {
        shadowBlob(c, x + 32 * k, y + 60 * k, 15 * k, 4.5 * k);
        c.blit(scaleNN(frameOf(v), k, flip), x, y);
        x += 64 * k;
      }
      shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
      c.blit(scaleNN(crop(hero, 0, 64, 32, 32), k, true), x, hy);
    },
  };
}
function stackRows(rows: Row[], W: number): PC {
  const H = rows.reduce((s, r) => s + r.h + 12, 12);
  const c = new PC(W, H);
  fill(c, 0, 0, W, H, [24, 20, 26, 255]);
  let y = 12;
  for (const r of rows) {
    r.draw(c, y);
    y += r.h + 12;
  }
  return c;
}
/** Анимация в лист: 3 строки (вниз, вверх, вбок), столбцы — кадры. */
function animSheet(anim: ReaperAnim): PC {
  const A = REAPER_ANIMS[anim];
  const out = new PC(N * A.n, N * 3);
  VIEWS.forEach((v, row) => POSES[anim](v).forEach((p, i) => { dbgTag = `${anim}:${i}`; out.blit(renderReaper(v, p), i * N, row * N); }));
  return out;
}

/** ×2: анимация — кадры вниз и вбок, рядом герой. */
function animRow(a: ReaperAnim, sheet: PC, hero: PC, terrain: PC, W: number): Row {
  const A = REAPER_ANIMS[a];
  return {
    h: 64 * 2 * 2 + 40,
    draw: (c, y0) => {
      const k = 2;
      text(c, `×2 · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.next ? ` · → ${REAPER_ANIMS[A.next].ru}` : ""}${A.hit !== undefined ? ` · УДАР — КАДР ${A.hit + 1}` : ""}`, 16, y0 + 8);
      for (const v of [0, 2]) {
        const y = y0 + 34 + (v === 0 ? 0 : 64 * k);
        groundBg(c, terrain, 16, y, W - 32, 64 * k, k, a === "walk" && v === 2 ? "dirt" : "grass");
        let x = 24;
        const hy = y + (64 - 32) * k;
        shadowBlob(c, x + 16 * k, hy + 30 * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(crop(hero, 0, v === 0 ? 0 : 64, 32, 32), k, v === 2), x, hy);
        x += 30 * k;
        for (let i = 0; i < A.n; i++) {
          shadowBlob(c, x + 32 * k, y + 60 * k, 15 * k, 4.5 * k);
          c.blit(scaleNN(crop(sheet, i * N, v * N, N, N), k), x, y);
          x += 64 * k;
        }
      }
    },
  };
}
/** ×2: эффект мира с героем в метке — нижний слой, герой, верхний слой. */
function fxRow(title: string, fx: PC, n: number, hero: PC, terrain: PC, W: number, step: number): Row {
  return {
    h: 64 * 2 + 40,
    draw: (c, y0) => {
      const k = 2;
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, terrain, 16, y, W - 32, 64 * k, k, "grass");
      let x = 24;
      for (let i = 0; i < n; i++) {
        c.blit(scaleNN(crop(fx, i * N, 0, N, N), k), x, y);
        shadowBlob(c, x + 32 * k, y + (FX_AY - 1) * k, 7 * k, 2.4 * k);
        c.blit(scaleNN(crop(hero, 0, 0, 32, 32), k), x + 16 * k, y + (FX_AY - 31) * k);
        c.blit(scaleNN(crop(fx, i * N, N, N, N), k), x, y);
        x += step * k;
      }
    },
  };
}

function buildPreview(sheets: Record<ReaperAnim, PC>, hands: PC, stone: PC, hero: PC, terrain: PC): PC {
  const W = 1660;
  const rows: Row[] = [sceneRow(sheets.idle, hero, terrain, "grass", W), sceneRow(sheets.idle, hero, terrain, "dirt", W)];
  for (const a of Object.keys(REAPER_ANIMS) as ReaperAnim[]) rows.push(animRow(a, sheets[a], hero, terrain, W));
  rows.push(fxRow(`×2 · ЭФФЕКТ МИРА · РУКИ ИЗ КУРГАНОВ · ${HANDSFX.n} КАДРОВ · ${HANDSFX.fps} К/С · УДАР — КАДР ${HANDSFX.hit + 1}`, hands, HANDSFX.n, hero, terrain, W, 60));
  rows.push(fxRow(`×2 · ЭФФЕКТ МИРА · НАДГРОБИЕ · ${STONEFX.n} КАДРОВ · ${STONEFX.fps} К/С · УДАР — КАДР ${STONEFX.hit + 1}`, stone, STONEFX.n, hero, terrain, W, 56));
  return stackRows(rows, W);
}

/** «Наш | референс»: ревенант вниз и вбок (покой) крупно и образец 07 той же высоты. */
function buildCompare(idle: PC, ref: PC | null): PC {
  const k = 6;
  const ours = crop(idle, 0, 0, N, N);
  const side = crop(idle, 0, 2 * N, N, N);
  const H = N * k;
  const R0 = [86, 104, 346, 378] as const;
  const refC = ref ? crop(ref, R0[0], R0[1], R0[2], R0[3]) : null;
  const refS = refC ? scaleBox(refC, Math.round((R0[2] * H) / R0[3]), H) : null;
  const W = 24 + N * k + 16 + N * k + 24 + (refS ? refS.w + 24 : 0);
  const c = new PC(W, H + 72);
  fill(c, 0, 0, W, H + 72, [36, 32, 38, 255]);
  text(c, "НАШ", 24, 14, 3);
  if (refS) text(c, "РЕФЕРЕНС 07", 24 + 2 * N * k + 40, 14, 3);
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

type SkillCard = { id: string; name: string; windupMs: number; r?: number; arc?: number; spots?: [number, number][] };
/** Просмотр с анимацией: листы встроены в страницу (data:); умения — по таймингам карточки, с метками и эффектами мира. */
function buildHtml(sheet: PC, hands: PC, stone: PC, hero: PC, terrain: PC, skills: SkillCard[]): string {
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
<title>Ардрик Вернувшийся — анимации</title>
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
<h1>Ардрик Вернувшийся — серпоносец Курганов Мёртвых</h1>
<p>Кадр 64×64, рядом герой 32×32; масштаб игры. Вниз, вверх, вбок, влево (отражение). Скорость — как в листе.</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0" checked> трава</label><label><input type="radio" name="g" value="1"> земля</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Замах длится windupMs из карточки (связка «замах → удержание по кругу»), кадр удара приходится ровно на конец предупреждения. Фиолетовые фигуры — метки предупреждения (в игре их рисует клиент): дуга «Жатвы» к танку, четыре круга «Рук из курганов» крестом (первый — под танком), круг «Надгробия» над дальним героем. Руки и камень — эффекты мира в метках.</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const ANIMS = ${JSON.stringify(REAPER_ANIMS)};
const HFX = ${JSON.stringify(HANDSFX)}, SFX = ${JSON.stringify(STONEFX)};
const SKILLS = ${JSON.stringify(skills.map((s) => ({ ...s, ...REAPER_SKILLS[s.id] })))};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${png(sheet)}"), handsImg = img("${png(hands)}"), stoneImg = img("${png(stone)}"), hero = img("${png(hero)}");
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
function draw() {
  const A = ANIMS[anim];
  for (const [c, [name, row, flip]] of canvases) {
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    paintGround(g, c.width, c.height);
    const bx = 40, by = 4;
    shadow(g, bx + 32, by + 60, 15, 4.5); shadow(g, 18, by + 62, 7, 2.4);
    drawBoss(g, A.col + frame, row, flip, bx, by);
    g.drawImage(hero, 0, row === 1 ? 32 : row === 2 ? 64 : 0, 32, 32, 2 * zoom, (by + 32) * zoom, 32 * zoom, 32 * zoom);
    g.fillStyle = "#efe6d2"; g.font = (6 * zoom) + "px system-ui"; g.fillText(name, 4 * zoom, 10 * zoom);
  }
}
// ---- умения: связка анимаций по времени, метки и эффекты мира ----
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
function fxAt(F, t, s) { const k = Math.floor(((t - s.windupMs) / 1000) * F.fps) + F.hit; return k >= 0 && k < F.n ? k : -1; }
function tele(g, path) { g.fillStyle = "rgba(150,90,230,.25)"; g.strokeStyle = "#b06eff"; g.lineWidth = zoom; g.beginPath(); path(); g.fill(); g.stroke(); }
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  const bx = 158, by = 40, foot = [bx + 32, by + 60];
  const t = skill ? ts - t0 : -1;
  const heroes = [[foot[0] + 6, foot[1] + 40], [foot[0] - 130, foot[1] + 66], [foot[0] + 120, foot[1] + 44]];
  const tank = heroes[0], ang = Math.atan2(tank[1] - foot[1], tank[0] - foot[0]);
  let far = heroes[0];
  for (const h of heroes) if (Math.hypot(h[0] - foot[0], h[1] - foot[1]) > Math.hypot(far[0] - foot[0], far[1] - foot[1])) far = h;
  const live = skill && t >= 0 && t < skill.windupMs;
  const spots = skill && skill.spots ? skill.spots.map(([x, y]) => { const r = Math.hypot(x, y), a0 = Math.atan2(y, x) + ang; return [foot[0] + r * Math.cos(a0), foot[1] + r * Math.sin(a0)]; }) : [];
  if (live && skill.id === "scythe_arc") tele(g, () => { const h = (skill.arc / 2) * Math.PI / 180; g.moveTo(foot[0] * zoom, foot[1] * zoom); g.arc(foot[0] * zoom, foot[1] * zoom, skill.r * zoom, ang - h, ang + h); g.closePath(); });
  if (live && skill.id === "grave_hands") for (const p of spots) tele(g, () => g.arc(p[0] * zoom, p[1] * zoom, skill.r * zoom, 0, 7));
  if (live && skill.id === "gravestone") tele(g, () => g.arc(far[0] * zoom, far[1] * zoom, skill.r * zoom, 0, 7));
  const fxLayer = (row) => {
    if (!skill) return;
    if (skill.fx === "hands") { const k = fxAt(HFX, t, skill); if (k >= 0) for (const p of spots) g.drawImage(handsImg, k * 64, row * 64, 64, 64, (p[0] - 32) * zoom, (p[1] - HFX.ay) * zoom, 64 * zoom, 64 * zoom); }
    if (skill.fx === "stone") { const k = fxAt(SFX, t, skill); if (k >= 0) g.drawImage(stoneImg, k * 64, row * 64, 64, 64, (far[0] - 32) * zoom, (far[1] - SFX.ay) * zoom, 64 * zoom, 64 * zoom); }
  };
  fxLayer(0);
  shadow(g, foot[0], foot[1], 15, 4.5);
  drawBoss(g, skill ? bossFrameAt(skill, t) : ANIMS.idle.col + (Math.floor(ts / 1000 * 12) % 12), 0, false, bx, by);
  for (const h of heroes) { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); }
  fxLayer(1);
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
  draw();
  drawArena(ts);
  requestAnimationFrame(loop);
});
</script>
</body>
</html>
`;
}

/**
 * Проверка листа: края каждого кадра 64×64 касается только цвет контура. Любой другой цвет на крайнем ряду или столбце —
 * деталь срезана рамкой кадра прямой линией без контура (в игре это видно, особенно на последнем кадре гибели).
 */
export function frameEdgeCuts(sheet: PC, name: string, rows: string[]): string[] {
  const bad: string[] = [];
  for (let r = 0; r < sheet.h / N; r++) for (let c = 0; c < sheet.w / N; c++) {
    const hits = new Set<string>();
    for (let k = 0; k < N; k++) for (const [x, y] of [[k, 0], [k, N - 1], [0, k], [N - 1, k]]) {
      const q = sheet.get(c * N + x, r * N + y)!;
      if (q[3] && (q[0] !== OUT[0] || q[1] !== OUT[1] || q[2] !== OUT[2])) hits.add(`${x},${y}`);
    }
    if (hits.size) bad.push(`${name}, ${rows[r] ?? `строка ${r}`}, кадр ${c + 1}: ${hits.size} px не цветом контура на краю (${[...hits].slice(0, 4).join(" ")})`);
  }
  return bad;
}

/** Всё для утверждения: листы анимаций, общий лист, эффекты мира, монтажи и страница просмотра. */
export function writeRevenantArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => {
    const f = path.join(outDir, name);
    c.save(f);
    files.push(f);
    return c;
  };
  const sheets = {} as Record<ReaperAnim, PC>;
  for (const a of Object.keys(REAPER_ANIMS) as ReaperAnim[]) sheets[a] = save(animSheet(a), `${ID}-${a}.png`);
  const sheet = new PC(N * REAPER_COLS, N * 3);
  for (const a of Object.keys(REAPER_ANIMS) as ReaperAnim[]) sheet.blit(sheets[a], REAPER_ANIMS[a].col * N, 0);
  save(sheet, `${ID}-sheet.png`);
  const hands = save(buildHandsFx(), `${ID}-handsfx.png`);
  const stone = save(buildStoneFx(), `${ID}-stonefx.png`);
  // проверка: края кадра касается только контур — в листах ревенанта и в эффектах мира
  const views = ["вниз", "вверх", "вбок"], layers = ["нижний слой", "верхний слой"];
  const cuts = [
    ...(Object.keys(REAPER_ANIMS) as ReaperAnim[]).flatMap((a) => frameEdgeCuts(sheets[a], a, views)),
    ...frameEdgeCuts(hands, "handsfx", layers), ...frameEdgeCuts(stone, "stonefx", layers),
  ];
  if (cuts.length) {
    console.warn(`  ${ID}: деталь срезана краем кадра — ${cuts.length}:\n${cuts.map((s) => `    ${s}`).join("\n")}`);
    process.exitCode = 1;
  } else console.log(`  ${ID}: край кадра чист — касается только контур (${Object.keys(REAPER_ANIMS).length} анимаций × 3 вида, 2 эффекта мира)`);
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "bosses", "07.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  save(buildPreview(sheets, hands, stone, hero, terrain), `${ID}-preview.png`);
  save(buildCompare(sheets.idle, ref), `${ID}-compare.png`);
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", "zone-bosses.json"), "utf8")) as { bosses: { id: string; abilities: SkillCard[] }[] };
  const skills = (data.bosses.find((b) => b.id === ID)?.abilities ?? []).map(({ id, name, windupMs, r, arc, spots }) => ({ id, name, windupMs, r, arc, spots }));
  const html = path.join(outDir, `${ID}.html`);
  fs.writeFileSync(html, buildHtml(sheet, hands, stone, hero, terrain, skills), "utf8");
  files.push(html);
  return files;
}
