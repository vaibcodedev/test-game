/**
 * Геометрия умений (задача 133, шаги 1–2; docs/aim-and-pick.md): форма и размеры по рангу и пассивкам, «куда ляжет» (placeSkill), правила модулей,
 * которые превью знает заранее (ruleErr: капкан, рой), и «кого заденет» (shapeHits) — одни функции для превью (client/src/game/castResolve.ts → aim.ts),
 * подсветки и сервера: server/src/game/skills.ts зовёт placeSkill до модулей классов, модули — общие помощники (leapDest, pullDest, summonSpot, trapErr,
 * wallEnds, facingOf). Препятствия: reachable — рывок до воды, деревьев и стен, rayLen — луч до первой стены (вода его не режет), behindSpot — место
 * за спиной цели. Данные прицела — data/skills_aim.json. Сервер мерит Math.hypot — формы круглые, без сплющивания.
 * Союзники в «кого заденет» — по правилам модулей: «Круг света» берёт не враждебных героев и их питомцев, alliesAround (kin) — только своей фракции,
 * «Эгида» и купель (heroes) — только героев; скрытых превью не знает (их не показывают — метка выдала бы невидимку).
 * Точка отсчёта: точку ground сервер берёт как есть (с допуском GROUND_TOL), модули её не пересчитывают; линии и рывок — углом и вектором от своей позиции героя.
 */
import { PLAYER_RADIUS } from "./constants";
import { isTownZone, lineClear, walkable, zoneAtPx, type WorldMap } from "./map";
import { SKILLS, type SkillAim, type SkillDef } from "./skills";
import aimData from "../data/skills_aim.json";

/**
 * Форма прицела. circle — круг у точки (ground); wall — стена поперёк прицела (капсула); bolt — снаряд до точки или цели со взрывом;
 * band — полоса до первой стены; fan — веер лучей-коридоров; cone — конус; dash — рывок к точке до препятствия; nova — круг вокруг героя;
 * leap — рывок к цели; behind — за спину цели; pull — цель притягивается к герою; unit — по цели; self — на себя.
 */
export type ShapeKind = "circle" | "wall" | "bolt" | "band" | "fan" | "cone" | "dash" | "nova" | "leap" | "behind" | "pull" | "unit" | "self";
/** Точка дальше дальности: clamp — сервер прижимает к дальности (каст проходит), walk — подход (опция «Подходить к цели»), deny — отказ. */
export type OutOfRange = "clamp" | "walk" | "deny";
/** Кого задевает форма: врагов, союзников (лечение, щиты), тех и других, никого (призыв). */
export type Who = "foe" | "ally" | "both" | "none";
/** Кого из попавших в форму берёт сервер: all — всех; near — n ближних к точке (рой); first — первого вошедшего (капкан); random — случайных (шторм). */
export type Pick = "all" | "near" | "first" | "random";

export interface AimSpec {
  aim: SkillAim;
  shape: ShapeKind;
  /** Нужна прямая видимость от героя до точки (ground) или до цели (unit): иначе сервер отказывает (по умолчанию — у ground и unit). */
  los: boolean;
  /** Текст отказа без видимости цели (у Рывка — «Путь прегражден»). */
  losErr: string;
  oor: OutOfRange;
  /** Размер формы: число или поле v(ранг) — радиус круга и новы, полная длина стены, длина рывка, радиус брызг снаряда и всплеска прыжка. */
  size: number | string;
  /** Внутренний круг: удар знамени внутри ауры, прямое попадание шара внутри брызг. */
  inner: number | string;
  /** Попадание — по внутреннему кругу (знамя бьёт ударом древка 70, аура 130 — только защита союзникам). */
  hitInner: boolean;
  /** Полная ширина стены, полосы, коридора стрелы веера (число или поле v). */
  width: number | string;
  /** Полоса-капсула: попадание по расстоянию до отрезка (круглые торцы, «Сияние»), иначе прямоугольник от героя до конца + радиус цели. */
  cap: boolean;
  /** Прибавки пассивок к полям v(ранг): { radius: "hr_trapper" } — к radius прибавляется v(ранг пассивки).radius. */
  plus: Record<string, string>;
  /** Множители пассивок в процентах: { radius: "rv_sweep" } — radius × (1 + v(ранг пассивки).radius / 100) («Широкий замах»). */
  mul: Record<string, string>;
  /** Луч до первой стены (rayLen): полоса обрывается у стены, вода и деревья её не режут (стрела, топор, «Сияние»). */
  ray: boolean;
  /** Луч короче — отказ minErr. */
  min: number;
  minErr: string;
  /** Поворот формы задаёт угол с клиента (стена огня — поперёк прицела), а не направление от героя на сервере. */
  turn: boolean;
  /** Самонаведение снаряда (огненный шар): живая цель запроса в дальности + её радиус — снаряд летит в неё, точка и видимость — по цели. */
  home: boolean;
  /** Текст отказа рывка, если сдвиг меньше DASH_MIN. */
  stuck: string;
  /** Веер — число стрел, рой — число целей (число или поле v). */
  n: number | string;
  /** Раствор веера и конуса, градусы (число или поле v). */
  arc: number | string;
  /** Призыв: встаёт в точке, а на воде или дереве — в ближайшей проходимой точке на линии к герою (summonSpot). */
  summon: boolean;
  /** Капкан: правила модуля (город, проходимость, соседний капкан) — trapErr. */
  trap: boolean;
  who: Who;
  pick: Pick;
  /** Союзников задевает, только если их видно от героя (щиты «Эгиды», гимн, кровный круг — alliesAround). */
  seen: boolean;
  /** Союзники — только своей фракции (alliesAround: «Эгида», гимн, кровный круг, «Сияние», купель); иначе — любые не враждебные («Круг света»). */
  kin: boolean;
  /** Союзники — только герои, без питомцев («Эгида» щитует героев, купель лечит героев). */
  heroes: boolean;
  /** Пассивка, чей круг (поле radius) действует у притянутой цели («Железные цепи»). */
  chains: string;
}

/** Сервер принимает точку ground до дальности + GROUND_TOL от своей позиции героя (дальше — прижимает): превью считает от предсказанной позиции,
 *  сервер — от своей в момент исполнения (расхождение — пинг × скорость 150 px/с). Клиент прижимает ровно к дальности. */
export const GROUND_TOL = 32;
/** Рывок короче — отказ («Туда не переместиться», «Некуда отскочить»); рывок к цели, вставший раньше на столько и больше, — «Путь прегражден». */
export const DASH_MIN = 16;
/** Луч короче — отказ «Нет прямой видимости» («Пронзающая стрела»; у «Метнуть топор» — 24 и «Путь прегражден», поля min и minErr). */
export const RAY_MIN = 30;
/** Линии рисуются на уровне груди (y − CHEST), круги и полосы — по ногам; сервер мерит от ног. */
export const CHEST = 12;
/** Бледная кайма превью: край попадания по герою (радиус цели; у мобов — свой). */
export const HIT_EDGE = PLAYER_RADIUS;
/** Призыв встаёт там, где проходим кругом этого радиуса. */
export const SUMMON_R = 8;
export const NO_LOS = "Нет прямой видимости";
export const BLOCKED = "Путь прегражден";
export const NO_BEHIND = "Нет места за спиной цели";
export const NO_TARGETS = "В области нет целей";

type RawAim = Partial<{
  aim: SkillAim; shape: ShapeKind; los: boolean; losErr: string; oor: OutOfRange; r: number | string; inner: number | string; hitInner: boolean; w: number | string; cap: boolean;
  plus: Record<string, string>; mul: Record<string, string>; ray: boolean; min: number; minErr: string; turn: boolean; home: boolean; stuck: string;
  n: number | string; arc: number | string; summon: boolean; trap: boolean; who: Who; pick: Pick; seen: boolean; kin: boolean; heroes: boolean; chains: string;
}>;
const RAW = aimData as unknown as Record<string, RawAim>;
const SHAPE_OF: Record<SkillAim, ShapeKind> = { ground: "circle", dir: "bolt", dash: "dash", unit: "unit", self: "self" };
const specs = new Map<string, AimSpec>();

/** Прицел умения из data/skills_aim.json; не заданное — по aim: круг у точки с видимостью, снаряд до точки, рывок, цель с видимостью;
 *  за дальностью — прижать (у умений на цель — подход). */
export function aimSpec(def: SkillDef): AimSpec {
  let s = specs.get(def.id);
  if (s) return s;
  const o = RAW[def.id] ?? {}, aim = def.aim ?? "self", shape = o.shape ?? SHAPE_OF[aim];
  s = {
    aim, shape, los: o.los ?? (aim === "ground" || aim === "unit"), losErr: o.losErr ?? NO_LOS, oor: o.oor ?? (aim === "unit" ? "walk" : "clamp"),
    size: o.r ?? (shape === "dash" ? "dist" : shape === "circle" || shape === "nova" ? "radius" : 0),
    inner: o.inner ?? 0, hitInner: o.hitInner === true, width: o.w ?? 0, cap: o.cap === true,
    plus: o.plus ?? {}, mul: o.mul ?? {}, ray: o.ray === true, min: o.min ?? 0, minErr: o.minErr ?? NO_LOS,
    turn: o.turn === true, home: o.home === true, stuck: o.stuck ?? "Туда не переместиться",
    n: o.n ?? 0, arc: o.arc ?? 0, summon: o.summon === true, trap: o.trap === true,
    who: o.who ?? "foe", pick: o.pick ?? "all", seen: o.seen === true, kin: o.kin === true, heroes: o.heroes === true, chains: o.chains ?? "",
  };
  specs.set(def.id, s);
  return s;
}

/** Числа умения на ранге rank с прибавками и множителями пассивок героя (ranks — ранги всех его умений; без них — без пассивок). */
export function skillDims(def: SkillDef, rank: number, ranks?: Readonly<Record<string, number>>): Record<string, number> {
  const v = { ...def.v(Math.max(1, rank)) }, s = aimSpec(def);
  for (const [k, pid] of Object.entries(s.plus)) {
    const pr = ranks?.[pid] ?? 0, p = SKILLS[pid];
    if (pr > 0 && p) v[k] = (v[k] ?? 0) + (p.v(pr)[k] ?? 0);
  }
  for (const [k, pid] of Object.entries(s.mul)) {
    const pr = ranks?.[pid] ?? 0, p = SKILLS[pid];
    if (pr > 0 && p) v[k] = (v[k] ?? 0) * (1 + (p.v(pr)[k] ?? 0) / 100);
  }
  return v;
}

/** Число из поля прицела: число как есть, строка — поле v(ранг) с пассивками. */
function field(def: SkillDef, rank: number, ranks: Readonly<Record<string, number>> | undefined, f: number | string): number {
  return typeof f === "number" ? f : f ? skillDims(def, rank, ranks)[f] ?? 0 : 0;
}

/** Размер формы: радиус круга и новы, полная длина стены, длина рывка, радиус брызг и всплеска (по рангу и пассивкам);
 *  у полосы, веера и конуса — дальность (без дальности — 300). */
export function shapeSize(def: SkillDef, rank: number, ranks?: Readonly<Record<string, number>>): number {
  const s = aimSpec(def);
  if (s.shape === "band" || s.shape === "fan" || s.shape === "cone") return (def.range ?? 0) > 0 ? def.range! : 300;
  return field(def, rank, ranks, s.size);
}

/** Радиус капкана: ранг капкана + «Ловец» (plus в data/skills_aim.json) — у превью и у сервера (server/src/game/archers.ts). */
export const trapRadius = (rank: number, ranks?: Readonly<Record<string, number>>) => skillDims(SKILLS.hr_trap, rank, ranks).radius;

// ---------- препятствия ----------
/** Дальше всего достижимая по прямой точка (рывки): шаги по 8 px, каждый проходим кругом r и виден от начала; вода, деревья и стены останавливают. */
export function reachable(map: WorldMap, x0: number, y0: number, x1: number, y1: number, maxDist: number, r = PLAYER_RADIUS): { x: number; y: number } {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  const L = Math.min(maxDist, d);
  let best = { x: x0, y: y0 };
  for (let s = 8; s <= L; s += 8) {
    const x = x0 + (dx / d) * s, y = y0 + (dy / d) * s;
    if (!walkable(map, x, y, r) || !lineClear(map, x0, y0, x, y)) break;
    best = { x, y };
  }
  const ex = x0 + (dx / d) * L, ey = y0 + (dy / d) * L;
  if (walkable(map, ex, ey, r) && lineClear(map, x0, y0, ex, ey) && Math.hypot(ex - best.x, ey - best.y) < 9) best = { x: ex, y: ey };
  return best;
}

/** Длина луча под углом a до первой стены (шаг step, не дальше range); вода и деревья луч не режут. */
export function rayLen(map: WorldMap, x0: number, y0: number, a: number, range: number, step = 10): number {
  const cx = Math.cos(a), cy = Math.sin(a);
  let len = 0;
  for (let d = step; d <= range; d += step) {
    if (!lineClear(map, x0, y0, x0 + cx * d, y0 + cy * d)) break;
    len = d;
  }
  return len;
}

/** Единичный вектор взгляда по направлению юнита (Dir: 0 — вниз, 1 — вверх, 2 — влево, 3 — вправо). */
export function facingOf(dir: number): [number, number] {
  return dir === 1 ? [0, -1] : dir === 2 ? [-1, 0] : dir === 3 ? [1, 0] : [0, 1];
}

/** Место за спиной цели (tx, ty) радиуса tr, смотрящей в (fx, fy): куда можно встать и видеть цель; null — места нет. */
export function behindSpot(map: WorldMap, tx: number, ty: number, fx: number, fy: number, tr: number): { x: number; y: number } | null {
  const off = tr + PLAYER_RADIUS + 2, base = Math.atan2(-fy, -fx);
  for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
    const x = tx + Math.cos(base + da) * off, y = ty + Math.sin(base + da) * off;
    if (walkable(map, x, y, PLAYER_RADIUS) && lineClear(map, x, y, tx, ty)) return { x, y };
  }
  return null;
}

/** Куда встанет герой рывком к цели (Рывок, «Прыжок с разрезом»): по прямой до радиуса цели + PLAYER_RADIUS + 4 (reachable);
 *  blocked — вода, дерево или стена остановили его раньше на DASH_MIN и больше: удар через препятствие — отказ «Путь прегражден». */
export function leapDest(map: WorldMap, from: { x: number; y: number }, t: { x: number; y: number; r: number }): { x: number; y: number; blocked: boolean } {
  const L = Math.max(0, Math.hypot(t.x - from.x, t.y - from.y) - (t.r + PLAYER_RADIUS + 4));
  const q = reachable(map, from.x, from.y, t.x, t.y, L);
  return { x: q.x, y: q.y, blocked: L - Math.hypot(q.x - from.x, q.y - from.y) >= DASH_MIN };
}

/** Куда притянет цель (t, радиус r) к герою в to («Хватка смерти», «Железные цепи», «Цепной шторм»): до радиуса цели + PLAYER_RADIUS + 6, reachable от цели. */
export function pullDest(map: WorldMap, t: { x: number; y: number; r: number }, to: { x: number; y: number }): { x: number; y: number } {
  return reachable(map, t.x, t.y, to.x, to.y, Math.max(0, Math.hypot(to.x - t.x, to.y - t.y) - (t.r + PLAYER_RADIUS + 6)));
}

/** Где встанет призыв (скелет, демон): в точке, а на воде или дереве — в ближайшей проходимой точке на линии от неё к герою (шаг 4 px);
 *  нигде — у героя. Точка ground видна от героя (los), стен на линии нет. */
export function summonSpot(map: WorldMap, x: number, y: number, hx: number, hy: number): { x: number; y: number } {
  const d = Math.hypot(hx - x, hy - y);
  for (let s = 0; s < d; s += 4) {
    const px = x + ((hx - x) * s) / d, py = y + ((hy - y) * s) / d;
    if (walkable(map, px, py, SUMMON_R)) return { x: px, y: py };
  }
  return { x: hx, y: hy };
}

/** Отказ модуля капкана: город, непроходимая точка (вода, дерево), свой живой капкан ближе суммы радиусов. traps — свои живые капканы. */
export function trapErr(map: WorldMap, x: number, y: number, r: number, traps: readonly { x: number; y: number; r: number }[]): string | null {
  if (isTownZone(zoneAtPx(map, x, y))) return "В городе ловушки ставить нельзя";
  if (!walkable(map, x, y, 6)) return "Сюда ловушку не поставить";
  if (traps.some((t) => Math.hypot(t.x - x, t.y - y) < r + t.r)) return "Слишком близко к другому капкану";
  return null;
}

/** Концы стены огня: отрезок длины len через центр (x, y) поперёк угла прицела a. */
export function wallEnds(x: number, y: number, a: number, len: number): { ax: number; ay: number; bx: number; by: number } {
  const nx = -Math.sin(a), ny = Math.cos(a), h = len / 2;
  return { ax: x - nx * h, ay: y - ny * h, bx: x + nx * h, by: y + ny * h };
}
/** Метки огня стены (места луж hazard): k-я из n — равномерно от конца до конца. */
export function wallMark(x: number, y: number, a: number, len: number, k: number, n = 5): { x: number; y: number } {
  const t = (k / (n - 1) - 0.5) * len;
  return { x: x - Math.sin(a) * t, y: y + Math.cos(a) * t };
}

/** Расстояние от точки до отрезка. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// ---------- куда ляжет ----------
/** Точка to, прижатая к дальности range + tol от from (range ≤ 0 — без прижима). Клиент — tol 0, сервер — GROUND_TOL. */
export function groundPoint(from: { x: number; y: number }, to: { x: number; y: number }, range: number, tol = 0): { x: number; y: number } {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy), max = range + tol;
  if (!(range > 0) || d <= max) return { x: to.x, y: to.y };
  return { x: from.x + (dx / d) * max, y: from.y + (dy / d) * max };
}

/** Цель запроса: ноги, радиус (как World.radiusOf), взгляд (за спину) и босс (его не притягивают). */
export interface AimUnit { id?: string; x: number; y: number; r: number; fx?: number; fy?: number; boss?: boolean }
/** Запрос прицела: точка мира; a — угол с клиента (линии и повёрнутые формы); dx, dy — вектор от героя: у рывка — до цели рывка,
 *  у линии — до её точки (взрыв шара); unit — цель запроса: самонаведение (home) и умения на цель. */
export interface AimReq { x: number; y: number; a?: number; dx?: number; dy?: number; unit?: AimUnit }
/** Где и как ляжет умение и откажет ли сервер. */
export interface Placed {
  id: string;
  /** Отказ сервера (текст тоста) или null. Мана, перезарядка, цель и правила модулей (город, капканы, цели роя — ruleErr) — не здесь. */
  err: string | null;
  shape: ShapeKind;
  /** Откуда считали: клиент — предсказанная позиция героя, сервер — своя в момент исполнения. */
  ox: number;
  oy: number;
  /** Центр круга, стены и новы, конец полосы и рывка, точка взрыва снаряда, место приземления (leap, behind), куда притянет цель (pull). */
  x: number;
  y: number;
  /** Угол: на точку или с клиента (линии, стена), у умений на цель — на цель. */
  a: number;
  /** Радиус круга, новы, брызг снаряда, всплеска прыжка, «Железных цепей» у притянутой цели; половина длины стены; длина рывка; дальность веера и конуса. */
  r: number;
  /** Внутренний круг (удар знамени, прямое попадание шара); 0 — нет. */
  r2: number;
  /** Половина ширины стены, полосы и коридора стрелы веера. */
  w: number;
  /** Длина: полосы (у луча — до стены), веера и конуса, стены; путь снаряда до взрыва; сдвиг рывка; путь притянутой цели; у круга — от героя до центра. */
  len: number;
  /** Стрел в веере, целей роя. */
  n: number;
  /** Раствор веера и конуса, радианы. */
  arc: number;
  /** Полоса-капсула (круглые торцы). */
  cap: boolean;
  /** Снаряд летит в цель (самонаведение). */
  home: boolean;
  /** Куда целились до прижима и препятствий (курсор; у рывка — герой + вектор); у умений на цель — сама цель. */
  tx: number;
  ty: number;
  /** Где встанет призыв (иначе — центр). */
  sx: number;
  sy: number;
  /** Умение на цель: цель дальше дальности + её радиус — сервер не откажет сразу, а подведёт героя («Подходить к цели»). */
  far: boolean;
  /** id цели запроса (умения на цель). */
  tid: string | null;
}

const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Куда ляжет умение героя в from (клиент — предсказанная позиция, сервер — своя в момент исполнения) по запросу req; tol — допуск точки ground (сервер — GROUND_TOL).
 * circle, wall: точка, прижатая к дальности (+ tol), без прямой видимости — отказ (los); угол — на точку, у turn — с клиента (стена поперёк прицела); призыв — summonSpot.
 * bolt: угол req.a (иначе на точку); точка — по углу на длину вектора req.dx, dy (иначе до точки запроса), не дальше дальности: та же точка относительно героя,
 * что у превью. У home с живой целью req.unit в дальности + радиус — точка и видимость по цели.
 * band: луч по углу до первой стены (ray: rayLen, вода и деревья не режут), короче min — отказ minErr. fan, cone: угол и дальность. dash: цель — герой + вектор (иначе точка), reachable
 * на длину рывка по рангу; сдвиг меньше DASH_MIN — отказ. nova — круг у героя.
 * leap, behind, pull, unit: цель req.unit; дальше дальности + радиус — без отказа (подход, модуль ответит «Цель слишком далеко»); иначе без видимости — losErr
 * (если los), рывок через воду, дерево или стену — «Путь прегражден», за спиной нет места — отказ; pull — куда притянет (босса не тянет).
 */
export function placeSkill(map: WorldMap, def: SkillDef, rank: number, ranks: Readonly<Record<string, number>> | undefined, from: { x: number; y: number }, req: AimReq, tol = 0): Placed {
  const s = aimSpec(def), range = def.range ?? 0, full = range > 0 ? range : 300;
  const down = Math.PI / 2;
  const angTo = (x: number, y: number, dflt: number) => (x === from.x && y === from.y ? dflt : Math.atan2(y - from.y, x - from.x));
  const num = (f: number | string) => field(def, rank, ranks, f);
  const g: Placed = {
    id: def.id, err: null, shape: s.shape, ox: from.x, oy: from.y, x: req.x, y: req.y, a: angTo(req.x, req.y, fin(req.a) ? req.a : down),
    r: 0, r2: 0, w: num(s.width) / 2, len: Math.hypot(req.x - from.x, req.y - from.y), n: 0, arc: 0, cap: s.cap, home: false,
    tx: req.x, ty: req.y, sx: req.x, sy: req.y, far: false, tid: null,
  };
  const at = (len: number) => { g.len = len; g.x = from.x + Math.cos(g.a) * len; g.y = from.y + Math.sin(g.a) * len; };
  switch (s.shape) {
    case "circle":
    case "wall": {
      const p = groundPoint(from, req, range, tol);
      g.x = g.sx = p.x; g.y = g.sy = p.y;
      g.a = s.turn && fin(req.a) ? req.a : angTo(p.x, p.y, fin(req.a) ? req.a : down);
      g.len = Math.hypot(p.x - from.x, p.y - from.y);
      if (s.shape === "wall") { g.len = num(s.size); g.r = g.len / 2; } else { g.r = num(s.size); g.r2 = num(s.inner); g.n = Math.floor(num(s.n)); }
      if (s.los && !lineClear(map, from.x, from.y, p.x, p.y)) g.err = NO_LOS;
      if (s.summon) { const q = summonSpot(map, p.x, p.y, from.x, from.y); g.sx = q.x; g.sy = q.y; }
      return g;
    }
    case "bolt": {
      g.r = num(s.size); g.r2 = num(s.inner);
      // самонаведение (огненный шар): живая цель в дальности + радиус — снаряд летит в неё, точка и видимость — по цели (как модуль сервера), а не по углу
      const t = s.home ? req.unit : undefined;
      if (t && Math.hypot(t.x - from.x, t.y - from.y) <= full + t.r) {
        g.home = true; g.tid = t.id ?? null;
        g.x = g.tx = t.x; g.y = g.ty = t.y; g.a = angTo(t.x, t.y, fin(req.a) ? req.a : down); g.len = Math.hypot(t.x - from.x, t.y - from.y);
        if (s.los && !lineClear(map, from.x, from.y, t.x, t.y)) g.err = NO_LOS;
        return g;
      }
      g.a = fin(req.a) ? req.a : angTo(req.x, req.y, down);
      // точка — по углу на расстоянии до курсора, не дальше дальности (снаряд взрывается там); курсор на герое — во всю длину.
      // Расстояние — длина вектора с клиента (сервер откладывает тот же вектор от своей позиции: пинг, очередь), без вектора — до точки запроса
      const want = fin(req.dx) && fin(req.dy) ? Math.hypot(req.dx!, req.dy!) : Math.hypot(req.x - from.x, req.y - from.y);
      at(Math.min(full, want || full));
      if (s.los && !lineClear(map, from.x, from.y, g.x, g.y)) g.err = NO_LOS;
      return g;
    }
    case "band": {
      g.a = fin(req.a) ? req.a : angTo(req.x, req.y, down);
      // стрела, топор и «Сияние» — до первой стены (rayLen); вода и деревья луч не режут; модули берут эту точку как есть
      at(s.ray ? rayLen(map, from.x, from.y, g.a, full) : full);
      if (g.len < s.min) g.err = s.minErr;
      return g;
    }
    case "fan":
    case "cone": {
      g.a = fin(req.a) ? req.a : angTo(req.x, req.y, down);
      at(full);
      g.r = full;
      g.n = Math.max(1, Math.round(num(s.n)));
      g.arc = (num(s.arc) * Math.PI) / 180;
      return g;
    }
    case "dash": {
      const vec = fin(req.dx) && fin(req.dy);
      const tx = vec ? from.x + req.dx! : req.x, ty = vec ? from.y + req.dy! : req.y;
      const dist = num(s.size);
      const p = reachable(map, from.x, from.y, tx, ty, dist);
      g.x = p.x; g.y = p.y; g.tx = tx; g.ty = ty; g.a = angTo(tx, ty, down); g.r = dist;
      g.len = Math.hypot(p.x - from.x, p.y - from.y);
      if (g.len < DASH_MIN) g.err = s.stuck;
      return g;
    }
    case "nova":
      g.x = from.x; g.y = from.y; g.r = num(s.size); g.r2 = num(s.inner); g.len = 0;
      return g;
    case "leap":
    case "behind":
    case "pull":
    case "unit": {
      const t = req.unit;
      if (!t) return g; // цели нет — модуль ответит «Нужна цель»
      g.tid = t.id ?? null;
      g.x = g.tx = g.sx = t.x; g.y = g.ty = g.sy = t.y; g.a = angTo(t.x, t.y, down);
      const d = Math.hypot(t.x - from.x, t.y - from.y);
      g.len = 0;
      // порядок отказов — как у модулей: дальность (её решает подход), видимость, путь, место
      g.far = range > 0 && d > range + t.r;
      if (g.far) return g;
      if (s.los && !lineClear(map, from.x, from.y, t.x, t.y)) g.err = s.losErr;
      if (s.shape === "leap") {
        const q = leapDest(map, from, t);
        g.x = g.sx = q.x; g.y = g.sy = q.y; g.len = Math.hypot(q.x - from.x, q.y - from.y); g.r = num(s.size);
        if (!g.err && q.blocked) g.err = BLOCKED;
      } else if (s.shape === "behind") {
        const q = behindSpot(map, t.x, t.y, t.fx ?? 0, t.fy ?? 1, t.r);
        if (q) { g.x = g.sx = q.x; g.y = g.sy = q.y; g.len = Math.hypot(q.x - from.x, q.y - from.y); }
        else if (!g.err) g.err = NO_BEHIND;
      } else if (s.shape === "pull") {
        if (!t.boss) { const q = pullDest(map, t, from); g.x = g.sx = q.x; g.y = g.sy = q.y; g.len = Math.hypot(q.x - t.x, q.y - t.y); }
        const cr = s.chains ? ranks?.[s.chains] ?? 0 : 0;
        g.r = cr > 0 && SKILLS[s.chains] ? SKILLS[s.chains].v(cr).radius ?? 0 : 0;
      }
      return g;
    }
    default:
      g.x = from.x; g.y = from.y; g.len = 0;
      return g;
  }
}

/** Что слать серверу кроме точки: угол (линии и повёрнутые формы), вектор рывка и вектор до точки линии — сервер применит их от своей позиции героя. */
export function aimExtras(def: SkillDef, g: Placed, from: { x: number; y: number }): { a?: number; dx?: number; dy?: number } {
  const s = aimSpec(def);
  if (s.shape === "dash") return { dx: g.tx - from.x, dy: g.ty - from.y };
  if (s.shape === "bolt" || s.shape === "band" || s.shape === "fan" || s.shape === "cone") return { a: g.a, dx: g.x - from.x, dy: g.y - from.y };
  if (s.turn) return { a: g.a };
  return {};
}

// ---------- кого заденет ----------
/** Юнит для попадания: ноги, радиус (как World.radiusOf); ally — не враждебный герою герой или питомец (лечение, щиты), иначе враг; kin — союзник
 *  его фракции (alliesAround); pet — питомец; boss — не притягивается цепями. Скрытых и павших в списке нет (client/src/game/castResolve.ts hitUnitsOf). */
export interface HitUnit { id: string; x: number; y: number; r: number; ally?: boolean; kin?: boolean; pet?: boolean; boss?: boolean }
/** Питомец в «Круге света»: сервер берёт его в радиусе круга + 12 (герою — + его радиус 10). */
export const PET_TOL = 12;

/** Попадает ли враг в форму без отбора (как enemiesInCircle и проверки модулей): круг, стена, брызги, полоса, конус, нова — с видимостью
 *  от центра (у полос, конуса и новы — от героя, у «Сияния» — от середины луча). Веер — в коридоре хотя бы одной стрелы. */
function foeIn(map: WorldMap, g: Placed, u: HitUnit): boolean {
  const seen = (x: number, y: number) => lineClear(map, x, y, u.x, u.y);
  const d = (x: number, y: number) => Math.hypot(u.x - x, u.y - y);
  switch (g.shape) {
    case "circle": {
      const s = aimSpec(SKILLS[g.id]), r = s.hitInner ? g.r2 : g.r;
      if (!(d(g.x, g.y) <= r + u.r && seen(g.x, g.y))) return false;
      // рой: только те, до кого от героя не дальше дальности + радиус роя и видно
      return s.pick !== "near" || (d(g.ox, g.oy) <= (SKILLS[g.id].range ?? 0) + g.r && seen(g.ox, g.oy));
    }
    case "wall": {
      const e = wallEnds(g.x, g.y, g.a, g.len);
      return segDist(u.x, u.y, e.ax, e.ay, e.bx, e.by) <= g.w + u.r && d(g.x, g.y) <= g.r + 30 + u.r && seen(g.x, g.y);
    }
    case "bolt":
    case "nova":
      return d(g.x, g.y) <= g.r + u.r && seen(g.x, g.y);
    case "band": {
      if (g.cap) {
        // «Сияние»: враги в круге вокруг середины луча (половина длины + 70) с видимостью от середины, у луча — ближе w + радиус
        const mx = (g.ox + g.x) / 2, my = (g.oy + g.y) / 2;
        return segDist(u.x, u.y, g.ox, g.oy, g.x, g.y) <= g.w + u.r && d(mx, my) <= g.len / 2 + 70 + u.r && seen(mx, my);
      }
      // «Пронзающая стрела», «Метнуть топор»: прямоугольник от героя до конца луча + радиус цели (круг отбора модулей — len + 40 и дальность + 30 —
      // при радиусах до 44 шире прямоугольника), видимость от героя
      const cx = Math.cos(g.a), cy = Math.sin(g.a), dx = u.x - g.ox, dy = u.y - g.oy;
      const along = dx * cx + dy * cy, perp = Math.abs(dx * cy - dy * cx);
      return along >= 0 && along <= g.len + u.r && perp <= g.w + u.r && seen(g.ox, g.oy);
    }
    case "cone": {
      const dd = d(g.ox, g.oy);
      if (dd > g.r + u.r || !seen(g.ox, g.oy)) return false;
      let da = Math.atan2(u.y - g.oy, u.x - g.ox) - g.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      return Math.abs(da) <= g.arc / 2 + Math.asin(Math.min(1, u.r / Math.max(1, dd)));
    }
    case "fan":
      return fanRays(g).some((a) => onRay(map, g, u, a));
    default:
      return false;
  }
}
/** Углы стрел веера: от a − раствор/2 до a + раствор/2 равномерно. */
export function fanRays(g: Placed): number[] {
  const out: number[] = [];
  for (let i = 0; i < g.n; i++) out.push(g.n > 1 ? g.a - g.arc / 2 + (g.arc * i) / (g.n - 1) : g.a);
  return out;
}
/** Враг в коридоре стрелы a («Залп»): впереди, центр ближе дальности, смещение от луча меньше радиуса + половины ширины, виден от героя. */
function onRay(map: WorldMap, g: Placed, u: HitUnit, a: number): boolean {
  const d = Math.hypot(u.x - g.ox, u.y - g.oy), b = Math.atan2(u.y - g.oy, u.x - g.ox) - a;
  return d < g.r && Math.cos(b) > 0 && Math.abs(Math.sin(b)) * d < u.r + g.w && lineClear(map, g.ox, g.oy, u.x, u.y);
}

/**
 * Союзник в форме — как отбор модулей: kin — только своей фракции (alliesAround), heroes — без питомцев («Эгида», купель). Запас к радиусу формы:
 * герою — его радиус (playersInCircle), питомцу у alliesAround — 0 (центром в круге), у «Круга света» — PET_TOL. Видимость от героя — только у seen
 * и после расстояния (лучи видимости — лишь тем, кто в форме). Лечение «Круга света», купели и «Сияния» видимости не требует.
 */
function allyIn(map: WorldMap, g: Placed, u: HitUnit): boolean {
  const s = aimSpec(SKILLS[g.id]);
  if ((s.kin && !u.kin) || (s.heroes && u.pet)) return false;
  const pr = u.pet ? (s.kin ? 0 : PET_TOL) : u.r;
  const d = (x: number, y: number) => Math.hypot(u.x - x, u.y - y);
  let inside: boolean;
  switch (g.shape) {
    case "circle":
    case "nova":
      inside = d(g.x, g.y) <= g.r + pr;
      break;
    case "band": {
      // «Сияние»: союзники в круге вокруг середины луча (половина длины + 70), у луча — ближе w + радиус героя (и у питомца — тоже 10)
      const mx = (g.ox + g.x) / 2, my = (g.oy + g.y) / 2;
      inside = segDist(u.x, u.y, g.ox, g.oy, g.x, g.y) <= g.w + u.r && d(mx, my) <= g.len / 2 + 70 + pr;
      break;
    }
    default:
      return false;
  }
  return inside && (!s.seen || lineClear(map, g.ox, g.oy, u.x, u.y));
}

/**
 * Кого заденет форма g (id по порядку units): враги — по форме и видимости, союзники — у лечения и щитов (who). Отбор как у сервера: рой — n ближних
 * к точке; веер — у каждой стрелы ближний враг в её коридоре; рывок к цели — цель и всплеск вокруг неё; притягивание — цель и «Железные цепи»
 * (кроме боссов); умение на цель — цель. Капкан (first) и шторм (random) берут из попавших одного или случайных — здесь все кандидаты.
 */
export function shapeHits(map: WorldMap, g: Placed, units: readonly HitUnit[]): string[] {
  const s = aimSpec(SKILLS[g.id]);
  if (g.err || s.who === "none") return [];
  const foes = s.who === "ally" ? [] : units.filter((u) => !u.ally), allies = s.who === "foe" ? [] : units.filter((u) => u.ally);
  const hit = new Set<string>();
  switch (g.shape) {
    case "fan": {
      for (const a of fanRays(g)) {
        let best: HitUnit | null = null, bd = g.r;
        for (const u of foes) { const d = Math.hypot(u.x - g.ox, u.y - g.oy); if (d < bd && onRay(map, g, u, a)) { bd = d; best = u; } }
        if (best) hit.add(best.id);
      }
      break;
    }
    case "leap":
    case "behind":
    case "pull":
    case "unit": {
      if (!g.tid || g.far) break;
      hit.add(g.tid);
      const tu = units.find((u) => u.id === g.tid);
      if (g.shape === "leap" && g.r > 0 && tu) {
        for (const u of foes) if (u !== tu && Math.hypot(u.x - tu.x, u.y - tu.y) <= g.r + u.r && lineClear(map, tu.x, tu.y, u.x, u.y)) hit.add(u.id);
      } else if (g.shape === "pull" && g.r > 0) {
        for (const u of foes) if (u.id !== g.tid && !u.boss && Math.hypot(u.x - g.x, u.y - g.y) <= g.r + u.r && lineClear(map, g.x, g.y, u.x, u.y)) hit.add(u.id);
      }
      break;
    }
    default: {
      let list = foes.filter((u) => foeIn(map, g, u));
      if (s.pick === "near") list = list.sort((a, b) => Math.hypot(a.x - g.x, a.y - g.y) - Math.hypot(b.x - g.x, b.y - g.y)).slice(0, g.n);
      for (const u of list) hit.add(u.id);
      for (const u of allies) if (allyIn(map, g, u)) hit.add(u.id);
    }
  }
  return units.filter((u) => hit.has(u.id)).map((u) => u.id);
}

/** Попадает ли юнит в форму (без отбора роя и стрел веера): кандидат на удар или лечение. */
export function inShape(map: WorldMap, g: Placed, u: HitUnit): boolean {
  return u.ally ? allyIn(map, g, u) : foeIn(map, g, u);
}

/** Мир для правил модулей, которые превью повторяет за сервером: свои живые капканы и видимые юниты (цели роя). */
export interface AimWorld { traps?: readonly { x: number; y: number; r: number }[]; units?: readonly HitUnit[] }
/** Отказы модулей, которые зависят от мира: капкан (город, проходимость, соседний капкан — trapErr), рой без целей («В области нет целей»).
 *  hits — уже посчитанные shapeHits по wd.units (превью считает их раз за кадр: и для отказа, и для меток). */
export function ruleErr(map: WorldMap, def: SkillDef, g: Placed, wd: AimWorld, hits?: readonly string[]): string | null {
  const s = aimSpec(def);
  if (s.trap) return trapErr(map, g.x, g.y, g.r, wd.traps ?? []);
  if (s.pick === "near" && !(hits ?? shapeHits(map, g, wd.units ?? [])).length) return NO_TARGETS;
  return null;
}
