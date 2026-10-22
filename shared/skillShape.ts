/**
 * Геометрия умений (задача 133, шаг 1; docs/aim-and-pick.md): форма и размеры по рангу и пассивкам, «куда ляжет» (placeSkill) и «кого заденет»
 * (shapeHits) — одни функции для превью (client/src/game/castResolve.ts → aim.ts), подсветки и сервера (server/src/game/skills.ts зовёт placeSkill
 * до модулей классов). Препятствия тоже общие: reachable — рывок до воды, деревьев и стен, rayLen — луч до первой стены, behindSpot — место за спиной цели.
 * Данные прицела — data/skills_aim.json (aim, shape, los, oor, r, plus, ray, turn, home, stuck). Сервер мерит Math.hypot — формы круглые, без сплющивания.
 * Точка отсчёта: точку ground сервер берёт как есть (с допуском GROUND_TOL), модули её не пересчитывают; линию и рывок — углом и вектором от своей позиции героя.
 * Шаг 2 добавляет формы (стена, снаряд, полоса, веер, конус): значение ShapeKind, ветку в placeSkill и inShape и поля в данных — остальное не меняется.
 */
import { PLAYER_RADIUS } from "./constants";
import { lineClear, walkable, type WorldMap } from "./map";
import { SKILLS, type SkillAim, type SkillDef } from "./skills";
import aimData from "../data/skills_aim.json";

/** Форма прицела: circle — круг у точки (ground); line — линия по углу (dir; шаг 2 разведёт на снаряд, полосу, веер и конус);
 *  dash — рывок к точке до препятствия; unit — по цели; self — на себя. */
export type ShapeKind = "circle" | "line" | "dash" | "unit" | "self";
/** Точка дальше дальности: clamp — сервер прижимает к дальности (каст проходит), walk — подход (опция «Подходить к цели»), deny — отказ. */
export type OutOfRange = "clamp" | "walk" | "deny";

export interface AimSpec {
  aim: SkillAim;
  shape: ShapeKind;
  /** Нужна прямая видимость от героя до точки: иначе сервер отказывает «Нет прямой видимости» (по умолчанию — у ground, решение пользователя 3). */
  los: boolean;
  oor: OutOfRange;
  /** Размер формы: число или поле v(ранг) — радиус круга, длина рывка; у линии — дальность умения. */
  size: number | string;
  /** Прибавки пассивок к полям v(ранг): { radius: "hr_trapper" } — к radius прибавляется v(ранг пассивки).radius. */
  plus: Record<string, string>;
  /** Луч до первой стены: линия обрывается у стены, короче RAY_MIN — отказ. */
  ray: boolean;
  /** Поворот формы задаёт угол с клиента (стена огня — поперёк прицела), а не направление от героя на сервере. */
  turn: boolean;
  /** Самонаведение линии (огненный шар): живая цель запроса (req.unit) в дальности + её радиус — снаряд летит в неё, точка и видимость — по цели. */
  home: boolean;
  /** Текст отказа рывка, если сдвиг меньше DASH_MIN. */
  stuck: string;
}

/** Сервер принимает точку ground до дальности + GROUND_TOL от своей позиции героя (дальше — прижимает): превью считает от предсказанной позиции,
 *  сервер — от своей в момент исполнения (расхождение — пинг × скорость 150 px/с). Клиент прижимает ровно к дальности. */
export const GROUND_TOL = 32;
/** Рывок короче — отказ («Туда не переместиться», «Некуда отскочить»). */
export const DASH_MIN = 16;
/** Луч короче — отказ «Нет прямой видимости» («Пронзающая стрела»). */
export const RAY_MIN = 30;
/** Линии рисуются на уровне груди (y − CHEST), круги — по ногам; сервер мерит от ног. */
export const CHEST = 12;
/** Бледная кайма превью круга: край попадания по герою (радиус цели; у мобов — свой). */
export const HIT_EDGE = PLAYER_RADIUS;
export const NO_LOS = "Нет прямой видимости";

type RawAim = Partial<{ aim: SkillAim; shape: ShapeKind; los: boolean; oor: OutOfRange; r: number | string; plus: Record<string, string>; ray: boolean; turn: boolean; home: boolean; stuck: string }>;
const RAW = aimData as unknown as Record<string, RawAim>;
const SHAPE_OF: Record<SkillAim, ShapeKind> = { ground: "circle", dir: "line", dash: "dash", unit: "unit", self: "self" };
const specs = new Map<string, AimSpec>();

/** Прицел умения из data/skills_aim.json; не заданное — по aim: круг у точки с видимостью, линия, рывок; за дальностью — прижать (у умений на цель — подход). */
export function aimSpec(def: SkillDef): AimSpec {
  let s = specs.get(def.id);
  if (s) return s;
  const o = RAW[def.id] ?? {}, aim = def.aim ?? "self", shape = o.shape ?? SHAPE_OF[aim];
  s = {
    aim, shape, los: o.los ?? aim === "ground", oor: o.oor ?? (aim === "unit" ? "walk" : "clamp"),
    size: o.r ?? (shape === "dash" ? "dist" : shape === "circle" ? "radius" : 0),
    plus: o.plus ?? {}, ray: o.ray === true, turn: o.turn === true, home: o.home === true, stuck: o.stuck ?? "Туда не переместиться",
  };
  specs.set(def.id, s);
  return s;
}

/** Числа умения на ранге rank с прибавками пассивок героя (ranks — ранги всех его умений; без них — без пассивок). */
export function skillDims(def: SkillDef, rank: number, ranks?: Readonly<Record<string, number>>): Record<string, number> {
  const v = { ...def.v(Math.max(1, rank)) };
  for (const [k, pid] of Object.entries(aimSpec(def).plus)) {
    const pr = ranks?.[pid] ?? 0, p = SKILLS[pid];
    if (pr > 0 && p) v[k] = (v[k] ?? 0) + (p.v(pr)[k] ?? 0);
  }
  return v;
}

/** Размер формы: радиус круга, длина рывка (по рангу и пассивкам); у линии — дальность (без дальности — 300). */
export function shapeSize(def: SkillDef, rank: number, ranks?: Readonly<Record<string, number>>): number {
  const s = aimSpec(def);
  if (s.shape === "line") return (def.range ?? 0) > 0 ? def.range! : 300;
  if (typeof s.size === "number") return s.size;
  return s.size ? skillDims(def, rank, ranks)[s.size] ?? 0 : 0;
}

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

/** Длина луча под углом a до первой стены (шаг step, не дальше range); вода луч не режет. */
export function rayLen(map: WorldMap, x0: number, y0: number, a: number, range: number, step = 10): number {
  const cx = Math.cos(a), cy = Math.sin(a);
  let len = 0;
  for (let d = step; d <= range; d += step) {
    if (!lineClear(map, x0, y0, x0 + cx * d, y0 + cy * d)) break;
    len = d;
  }
  return len;
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

// ---------- куда ляжет ----------
/** Точка to, прижатая к дальности range + tol от from (range ≤ 0 — без прижима). Клиент — tol 0, сервер — GROUND_TOL. */
export function groundPoint(from: { x: number; y: number }, to: { x: number; y: number }, range: number, tol = 0): { x: number; y: number } {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy), max = range + tol;
  if (!(range > 0) || d <= max) return { x: to.x, y: to.y };
  return { x: from.x + (dx / d) * max, y: from.y + (dy / d) * max };
}

/** Запрос прицела: точка мира; a — угол с клиента (линии и повёрнутые формы); dx, dy — вектор от героя: у рывка — до цели рывка,
 *  у линии — до её точки (взрыв шара); unit — живая цель (ноги и радиус) для самонаведения (home). */
export interface AimReq { x: number; y: number; a?: number; dx?: number; dy?: number; unit?: { x: number; y: number; r: number } }
/** Где и как ляжет умение и откажет ли сервер. */
export interface Placed {
  /** Отказ сервера (текст тоста) или null. Мана, перезарядка, цель и правила модулей (город, арена, соседний капкан) — не здесь. */
  err: string | null;
  shape: ShapeKind;
  /** Центр круга, конец рывка, точка линии (у снаряда — где взорвётся, у луча — конец у стены). */
  x: number;
  y: number;
  /** Угол от героя (у turn и линий — с клиента, если пришёл). */
  a: number;
  /** Радиус круга или длина рывка (по рангу и пассивкам). */
  r: number;
  /** Длина линии (у луча — до стены) или сдвиг рывка. */
  len: number;
  /** Куда целились до прижима и препятствий (курсор; у рывка — герой + вектор). */
  tx: number;
  ty: number;
}

const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * Куда ляжет умение героя в from (клиент — предсказанная позиция, сервер — своя в момент исполнения) по запросу req; tol — допуск точки ground (сервер — GROUND_TOL).
 * circle: точка, прижатая к дальности (+ tol), без прямой видимости — отказ (los); угол — на точку (у turn — с клиента).
 * line: угол req.a (иначе на точку); точка — по углу на длину вектора req.dx, dy (иначе до точки запроса), не дальше дальности (огненный шар):
 * та же точка относительно героя, что у превью; у ray — конец луча до стены, короче RAY_MIN — отказ. У home с живой целью req.unit в дальности + радиус — точка и видимость по цели.
 * dash: цель — герой + вектор (иначе точка), reachable на длину рывка по рангу; сдвиг меньше DASH_MIN — отказ.
 */
export function placeSkill(map: WorldMap, def: SkillDef, rank: number, ranks: Readonly<Record<string, number>> | undefined, from: { x: number; y: number }, req: AimReq, tol = 0): Placed {
  const s = aimSpec(def), range = def.range ?? 0;
  const down = Math.PI / 2;
  const angTo = (x: number, y: number, dflt: number) => (x === from.x && y === from.y ? dflt : Math.atan2(y - from.y, x - from.x));
  switch (s.shape) {
    case "circle": {
      const p = groundPoint(from, req, range, tol);
      const a = s.turn && fin(req.a) ? req.a : angTo(p.x, p.y, fin(req.a) ? req.a : down);
      const err = s.los && !lineClear(map, from.x, from.y, p.x, p.y) ? NO_LOS : null;
      return { err, shape: s.shape, x: p.x, y: p.y, a, r: shapeSize(def, rank, ranks), len: Math.hypot(p.x - from.x, p.y - from.y), tx: req.x, ty: req.y };
    }
    case "line": {
      const full = shapeSize(def, rank, ranks);
      // самонаведение (огненный шар): живая цель в дальности + радиус — снаряд летит в неё, точка и видимость — по цели (как модуль сервера), а не по углу
      const t = s.home ? req.unit : undefined;
      if (t && Math.hypot(t.x - from.x, t.y - from.y) <= full + t.r) {
        const err = s.los && !lineClear(map, from.x, from.y, t.x, t.y) ? NO_LOS : null;
        return { err, shape: s.shape, x: t.x, y: t.y, a: angTo(t.x, t.y, fin(req.a) ? req.a : down), r: 0, len: full, tx: t.x, ty: t.y };
      }
      const a = fin(req.a) ? req.a : angTo(req.x, req.y, down);
      let len = full, err: string | null = null;
      if (s.ray) { len = rayLen(map, from.x, from.y, a, full); if (len < RAY_MIN) err = NO_LOS; }
      // точка — по углу на расстоянии до курсора, не дальше дальности (снаряд взрывается там); курсор на герое — во всю длину.
      // Расстояние — длина вектора с клиента (сервер откладывает тот же вектор от своей позиции: пинг, очередь), без вектора — до точки запроса
      const want = fin(req.dx) && fin(req.dy) ? Math.hypot(req.dx!, req.dy!) : Math.hypot(req.x - from.x, req.y - from.y);
      const d = s.ray ? len : Math.min(full, want || full);
      const x = from.x + Math.cos(a) * d, y = from.y + Math.sin(a) * d;
      if (!err && s.los && !lineClear(map, from.x, from.y, x, y)) err = NO_LOS;
      return { err, shape: s.shape, x, y, a, r: 0, len, tx: req.x, ty: req.y };
    }
    case "dash": {
      const vec = fin(req.dx) && fin(req.dy);
      const tx = vec ? from.x + req.dx! : req.x, ty = vec ? from.y + req.dy! : req.y;
      const dist = shapeSize(def, rank, ranks);
      const p = reachable(map, from.x, from.y, tx, ty, dist);
      const len = Math.hypot(p.x - from.x, p.y - from.y);
      return { err: len < DASH_MIN ? s.stuck : null, shape: s.shape, x: p.x, y: p.y, a: angTo(tx, ty, down), r: dist, len, tx, ty };
    }
    default:
      return { err: null, shape: s.shape, x: req.x, y: req.y, a: angTo(req.x, req.y, down), r: 0, len: Math.hypot(req.x - from.x, req.y - from.y), tx: req.x, ty: req.y };
  }
}

/** Что слать серверу кроме точки: угол (линии и повёрнутые формы), вектор рывка и вектор до точки линии — сервер применит их от своей позиции героя. */
export function aimExtras(def: SkillDef, g: Placed, from: { x: number; y: number }): { a?: number; dx?: number; dy?: number } {
  const s = aimSpec(def);
  if (s.shape === "dash") return { dx: g.tx - from.x, dy: g.ty - from.y };
  if (s.shape === "line") return { a: g.a, dx: g.x - from.x, dy: g.y - from.y };
  if (s.turn) return { a: g.a };
  return {};
}

// ---------- кого заденет ----------
export interface HitUnit { id: string; x: number; y: number; r: number }
/** Попадает ли юнит (ноги x, y, радиус r) в форму: круг — центр ближе g.r + r и прямая видимость от центра (как World.enemiesInCircle);
 *  остальные формы — шаг 2 (null: «не знаем»). */
export function inShape(map: WorldMap, g: Placed, x: number, y: number, r: number): boolean | null {
  if (g.shape !== "circle") return null;
  return Math.hypot(x - g.x, y - g.y) <= g.r + r && lineClear(map, g.x, g.y, x, y);
}
/** Кого заденет форма (id по порядку units); null — форма ещё без проверки попадания (шаг 2). */
export function shapeHits(map: WorldMap, g: Placed, units: readonly HitUnit[]): string[] | null {
  if (g.shape !== "circle") return null;
  const out: string[] = [];
  for (const u of units) if (inShape(map, g, u.x, u.y, u.r)) out.push(u.id);
  return out;
}
