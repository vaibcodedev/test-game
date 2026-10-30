/**
 * Геометрия умений (задача 133, шаги 1–2; docs/systems/combat.md, «Шаг 4. Проверка»), без сети и браузера: превью (castResolve → castAim, shared/skillShape.ts)
 * и серверный каст (castSkill в мире) дают одну точку, форму и размер, список задетых и решение (каст или отказ). Все прицельные умения (ground, dir, dash)
 * и рывки к цели (Рывок, «Прыжок с разрезом», «Теневой шаг», «Хватка смерти»), ранги 1 и 5 (на 5 — с пассивками из plus, mul и chains), случайные точки
 * у стен подземелий и у воды. Обе стороны зовут одну функцию (placeSkill), поэтому превью сверяется ещё и с независимым эталоном — формулами HEAD и решениями
 * шага 2: прижим точки, точка шара, луч до стены у стрелы, топора и «Сияния» (вода и деревья не режут), рывок до препятствия на длину по рангу, рывок к цели,
 * место за спиной, притягивание.
 * Задетые — по форме: круг, стена огня (капсула поперёк прицела), брызги шара, полоса, веер (ближний враг в коридоре каждой стрелы), конус, нова, рой (n ближних),
 * капкан (один из попавших — первый вошедший), шторм (случайные из попавших), лечение и щиты союзникам (герои той же фракции), всплеск прыжка, «Железные цепи».
 * Отдельно: допуск точки ground, угол и вектор с клиента от позиции сервера (и из очереди), шар по цели, мерцание 5 ранга и рывок к воде, края коридоров,
 * решение пользователя 3, правила модулей, которые превью знает заранее (капкан: город, вода, соседний капкан по fx сервера, капканы погибшего героя гаснут
 * молча; рой без целей), призыв у воды, рывок к цели через воду — отказ, «Теневой шаг» без места за спиной — отказ, площадные вокруг себя, все умения на цель
 * (за стеной, дальше дальности + радиус цели, рядом: флаг los = проверка модуля), союзники по данным сцены (hitUnitsOf: скрытый враг и питомец врага
 * не метятся, alliesAround — своей фракции, «Эгида» — только герои).
 * Исключений шага 2 нет: каждое прицельное умение сверяется целиком (капкан и шторм по природе бьют одного и случайных из попавших — так и сверяются).
 * Убранные мобы помечаются мёртвыми (стража не гонится за удалёнными), манекены не погибают: тест идёт секунды, а не 13 минут.
 * Запуск: npx tsx tests/skill-shape.ts
 */
import assert from "node:assert/strict";
import { CELL_WALL, isTownZone, lineClear, walkable, zoneAtPx, type WorldMap } from "../shared/map";
import { generateDungeonMap } from "../shared/dungeon";
import { PLAYER_RADIUS, TILE } from "../shared/constants";
import { CLASSES } from "../shared/classes";
import { MOBS } from "../shared/mobs";
import { PETS } from "../shared/pets";
import { activeSkills, SKILLS, type SkillDef } from "../shared/skills";
import {
  aimSpec, behindSpot, BLOCKED, DASH_MIN, GROUND_TOL, groundPoint, HIT_EDGE, NO_BEHIND, NO_LOS, NO_TARGETS, placeSkill, RAY_MIN, shapeHits, shapeSize, skillDims,
  trapRadius, wallMark, type AimWorld, type HitUnit, type Placed,
} from "../shared/skillShape";
import { aimUnit, castAim, hitUnitsOf, resolveCast, TRAP_GRACE, TrapWatch, type CastIn, type CastUnit, type HitView } from "../client/src/game/castResolve";
import type { Fx } from "../shared/protocol";
import { World, type Actor, type HitOpts } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { Mob } from "../server/src/game/Mob";
import { Pet } from "../server/src/game/Pet";
import { castSkill } from "../server/src/game/skills";
import { requestSkill } from "../server/src/game/skillQueue";
import { botThink } from "../server/src/arena/bots";
import { WorldState } from "../server/src/rooms/schema";

// ---------- мир ----------
const sent: Fx[] = [];
const w = new World(new WorldState(), (type, msg) => { if (type === "fx") sent.push(...(msg as Fx[])); });
const map: WorldMap = w.map;
/** Стены (CELL_WALL, непрозрачны для лучей и видимости) с 20164bc есть только в инстансах: подземелье — своя карта, в открытом мире их нет.
 *  Проверкам «у стены», «за стеной», «луч до стены» нужны стены рядом с городом и водой, поэтому в мир теста вставлен план подземелья
 *  (клетки и зона: залы, перегородки, лавовые ямы) на свободный от городов участок. Сервер, превью и эталон читают одну и ту же w.map. */
{
  const dg = generateDungeonMap(), M = 4;
  const free = (x0: number, y0: number) => {
    for (let y = y0 - M; y < y0 + dg.h + M; y++) for (let x = x0 - M; x < x0 + dg.w + M; x++)
      if (x < 6 || y < 6 || x >= map.w - 6 || y >= map.h - 6 || isTownZone(map.zone[y * map.w + x])) return false;
    return true;
  };
  let at: { x: number; y: number } | null = null;
  for (let y = 10; y < map.h && !at; y += 8) for (let x = 10; x < map.w && !at; x += 8) if (free(x, y)) at = { x, y };
  assert.ok(at, "нет участка вне городов под план подземелья");
  for (let y = 0; y < dg.h; y++) for (let x = 0; x < dg.w; x++) { const i = (at.y + y) * map.w + at.x + x; map.cell[i] = dg.cell[y * dg.w + x]; map.zone[i] = dg.zone[y * dg.w + x]; }
}
/** Убрать моба из мира мёртвым: живого удалённого стража города держит целью навсегда (townfolk.ts assignFoes проверяет только dead) и, если до него
 *  нет пути, считает A* каждый такт — такт мира дорожал в 30–100 раз, и тест шёл 13 минут. */
const drop1 = (m: Mob) => { m.state = "dead"; w.removeMob(m); };
const clearMobs = (keep?: Set<string>) => { for (const m of [...w.mobs.values()]) if (!keep?.has(m.id)) drop1(m); };
clearMobs();

/** Журнал fx с умением, которое шло в момент emit (w.fxSkill), удары героя умением (src — текущий кастер, идёт его умение — не автоатака) и его лечение. */
const log: (Fx & { s?: string })[] = [];
const emit0 = w.emit.bind(w) as (...a: unknown[]) => unknown;
(w as unknown as { emit: (...a: unknown[]) => unknown }).emit = (f: unknown, ...rest: unknown[]) => { log.push({ ...(f as Fx), s: w.fxSkill ?? undefined }); return emit0(f, ...rest); };
let caster: Player | null = null;
const hitIds = new Set<string>(), healed = new Set<string>();
const hitEx0 = w.hitEx.bind(w);
w.hitEx = (src: Actor, dst: Actor, o?: HitOpts) => { if (caster && src === caster && w.fxSkill) hitIds.add(dst.id); return hitEx0(src, dst, o); };
const heal0 = w.heal.bind(w);
w.heal = (q: Player, v: number, show?: boolean, by?: Player) => { if (caster && by === caster && v > 0 && w.fxSkill) healed.add(q.id); return heal0(q, v, show, by); };
const run = (ms: number) => { for (let t = 0; t < ms; t += 50) w.update(50); };

// детерминированный ГСЧ (mulberry32)
let seed = 133;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------- точки на карте: у стен подземелий и у воды (вода и деревья мешают ходить, но не видеть) ----------
const freeSpot = (x: number, y: number) => walkable(map, x, y, PLAYER_RADIUS + 2) && !w.inTown(x, y);
function spots(kind: "wall" | "water", n: number): { x: number; y: number }[] {
  const all: { x: number; y: number }[] = [];
  for (let ty = 6; ty < map.h - 6; ty += 3) for (let tx = 6; tx < map.w - 6; tx += 3) {
    const x = tx * TILE + 16, y = ty * TILE + 16;
    if (!freeSpot(x, y)) continue;
    let hit = false;
    for (let k = 0; k < 16 && !hit; k++) {
      const a = (k / 16) * Math.PI * 2, d = 40 + (k % 4) * 30, qx = x + Math.cos(a) * d, qy = y + Math.sin(a) * d;
      const cell = map.cell[Math.floor(qy / TILE) * map.w + Math.floor(qx / TILE)] ?? 0;
      hit = kind === "wall" ? (cell & CELL_WALL) !== 0 : !(cell & CELL_WALL) && !walkable(map, qx, qy, 8) && lineClear(map, x, y, qx, qy);
    }
    if (hit) all.push({ x, y });
  }
  assert.ok(all.length >= n, `мало точек «${kind}»: ${all.length}`);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) out.push(all.splice(Math.floor(rnd() * all.length), 1)[0]);
  return out;
}
const SPOTS = [...spots("wall", 12), ...spots("water", 12)];
/** Первое место (сначала среди SPOTS, потом по всей карте), где find что-то нашёл. */
function search<T>(find: (s: { x: number; y: number }) => T | null): T | null {
  for (const s of SPOTS) { const k = find(s); if (k) return k; }
  for (let ty = 6; ty < map.h - 6; ty += 2) for (let tx = 6; tx < map.w - 6; tx += 2) {
    const x = tx * TILE + 16, y = ty * TILE + 16;
    if (!freeSpot(x, y)) continue;
    const k = find({ x, y });
    if (k) return k;
  }
  return null;
}

// ---------- кастер, союзники и манекены ----------
let uid = 0;
/** Пассивки умения, которые меняют его форму: plus, mul («Ловец», «Широкий замах») и chains («Железные цепи»). */
const passivesOf = (def: SkillDef) => { const s = aimSpec(def); return [...Object.values(s.plus), ...Object.values(s.mul), ...(s.chains ? [s.chains] : [])]; };
function hero(def: SkillDef, rank: number, at: { x: number; y: number }, passives: boolean): Player {
  const save = newSave(def.cls, at);
  save.level = 60;
  save.skills = { [def.id]: rank };
  if (passives) for (const pid of passivesOf(def)) save.skills[pid] = SKILLS[pid].maxRank;
  const p = new Player(`sh${++uid}`, `Форма${uid}`, save, () => {});
  w.addPlayer(p);
  place(p, at);
  return p;
}
function place(p: Player, at: { x: number; y: number }) {
  p.unit.x = at.x; p.unit.y = at.y;
  p.unit.maxMp = Math.max(p.unit.maxMp, 100000); p.unit.mp = p.unit.maxMp;
  p.unit.maxHp = Math.max(p.unit.maxHp, 1e7); p.unit.hp = p.unit.maxHp;
  p.cds.clear(); p.gcdUntil = 0; p.castUntil = 0; p.stunUntil = 0; p.moveTo = null; p.targetId = null;
}
/** Союзник героя (тот же класс — та же фракция) на половине здоровья: его лечат и закрывают щитом. */
function ally(def: SkillDef, at: { x: number; y: number }): { p: Player; u: HitUnit } {
  const q = new Player(`al${++uid}`, `Союзник${uid}`, newSave(def.cls, at), () => {});
  w.addPlayer(q);
  place(q, at);
  q.unit.hp = Math.round(q.unit.maxHp / 2);
  return { p: q, u: { id: q.id, x: q.x, y: q.y, r: PLAYER_RADIUS, ally: true, kin: true } };
}
const RADII = [10, 16, 28];
/** Координаты манекена — сразу в десятых пикселя: World.moveMob округляет позицию моба до 0,1 px даже при скорости 0, и манекен на краю формы
 *  или у угла стены «переезжал» бы через границу. */
const r01 = (n: number) => Math.round(n * 10) / 10;
/** Неподвижный моб без агро: скорость 0, не бродит, не погибает от умений (смерть, добыча и возрождение — лишняя работа мира); boss — босс (его не притягивают). */
function dummy(x: number, y: number, r: number, boss = false): Mob {
  const mob = w.addMob(new Mob(w.uid("m"), { ...MOBS.goblin_slasher, speed: 0, aggro: 0, radius: r, boss }, 20, { x: r01(x), y: r01(y) }));
  mob.wanderAt = Infinity;
  mob.unit.maxHp = mob.unit.hp = 1e9;
  return mob;
}
type Dm = { mob: Mob; u: HitUnit };
const asUnit = (mob: Mob, r: number): HitUnit => ({ id: mob.id, x: mob.x, y: mob.y, r, boss: !!mob.def.boss });
/** Места манекенов вокруг формы: внутри, на кайме и снаружи (круг и брызги — у центра; стена — вдоль отрезка; полоса — вдоль луча; веер, конус, нова — у героя). */
function spotsFor(g: Placed, n: number): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = RADII[i % RADII.length];
    if (g.shape === "band" || g.shape === "wall") {
      // полоса — от героя по углу; стена — поперёк угла через центр
      const along = g.shape === "band" ? -20 + rnd() * (g.len + 60) : (rnd() - 0.5) * (g.len + 2 * (g.w + r + 20)), side = (rnd() * 2 - 1) * (g.w + r + 20);
      const [ox, oy, a] = g.shape === "band" ? [g.ox, g.oy, g.a] : [g.x, g.y, g.a + Math.PI / 2];
      out.push({ x: ox + Math.cos(a) * along - Math.sin(a) * side, y: oy + Math.sin(a) * along + Math.cos(a) * side, r });
    } else if (g.shape === "fan" || g.shape === "cone") {
      const a = g.a + (rnd() * 2 - 1) * (g.arc / 2 + 0.35), d = 15 + rnd() * (g.r + 30);
      out.push({ x: g.ox + Math.cos(a) * d, y: g.oy + Math.sin(a) * d, r });
    } else {
      const a = rnd() * Math.PI * 2, d = rnd() * (g.r + r + 30);
      out.push({ x: g.x + Math.cos(a) * d, y: g.y + Math.sin(a) * d, r });
    }
  }
  return out;
}
const dummiesAt = (list: { x: number; y: number; r: number }[]): Dm[] => list.map((s) => { const mob = dummy(s.x, s.y, s.r); return { mob, u: asUnit(mob, s.r) }; });
const dropMobs = (ms: Mob[]) => { for (const m of ms) if (w.mobs.has(m.id)) drop1(m); };

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const mine = (id: string) => log.filter((f) => f.s === id);
/** fx умения с центром в точке (aoe, tele, hazard): где сервер поставил круг. */
const fxAt = (id: string, x: number, y: number) => mine(id).filter((f) => (f.t === "aoe" || f.t === "tele" || f.t === "hazard") && near(f.x, x) && near(f.y, y));
const projOf = (id: string) => mine(id).find((f) => f.t === "proj") as Extract<Fx, { t: "proj" }> | undefined;
const blinks = (id: string) => mine(id).filter((f) => f.t === "blink") as Extract<Fx, { t: "blink" }>[];
/** Вход resolveCast: курсор над картой, без интерфейса; hover — юнит под курсором. */
const castIn = (def: SkillDef, from: { x: number; y: number }, cursor: { x: number; y: number }, hover: CastIn["hover"] = null): CastIn => ({
  skill: { aim: def.aim!, target: def.target, range: def.range }, self: { id: "me", x: from.x, y: from.y }, cursor, overUi: false,
  hover, selected: null, units: hover ? [hover] : [], facing: { x: 0, y: 1 }, alt: false, hoverCast: true, autoTarget: false,
});
/** План построен (иначе — падение с причиной). */
const okPlan = (p: ReturnType<typeof resolveCast>) => { assert.ok(p.ok, `план не построен: ${JSON.stringify(p)}`); return p as Extract<typeof p, { ok: true }>; };
/** Превью: план по курсору (без наведения и интерфейса) и castAim от позиции героя — как GameScene.castNow; wd — мир (капканы, видимые юниты). */
function preview(def: SkillDef, rank: number, ranks: Record<string, number>, from: { x: number; y: number }, cursor: { x: number; y: number }, wd?: AimWorld) {
  const plan = resolveCast(castIn(def, from, cursor));
  assert.ok(plan.ok, `${def.id}: план не построен`);
  return castAim(map, def, rank, ranks, from, plan, undefined, wd);
}

// ---------- эталон: формулы HEAD и решения шага 2, без shared/skillShape.ts ----------
/** Тексты отказа рывка в HEAD. */
const STUCK: Record<string, string> = { blink: "Туда не переместиться", roll: "Некуда отскочить" };
/** Рывок HEAD (server/src/game/skills.ts reachable): шаги по 8 px, каждый проходим кругом героя и виден от начала. */
function refReach(x0: number, y0: number, x1: number, y1: number, maxDist: number): { x: number; y: number } {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  const L = Math.min(maxDist, d);
  let best = { x: x0, y: y0 };
  for (let s = 8; s <= L; s += 8) {
    const x = x0 + (dx / d) * s, y = y0 + (dy / d) * s;
    if (!walkable(map, x, y, PLAYER_RADIUS) || !lineClear(map, x0, y0, x, y)) break;
    best = { x, y };
  }
  const ex = x0 + (dx / d) * L, ey = y0 + (dy / d) * L;
  if (walkable(map, ex, ey, PLAYER_RADIUS) && lineClear(map, x0, y0, ex, ey) && Math.hypot(ex - best.x, ey - best.y) < 9) best = { x: ex, y: ey };
  return best;
}
/** Луч HEAD («Пронзающая стрела», archers.ts): по 10 px до первой стены. Шаг 2: так же летят топор и «Сияние». */
function refRay(x0: number, y0: number, a: number, range: number): number {
  let len = 0;
  for (let d = 10; d <= range; d += 10) {
    if (!lineClear(map, x0, y0, x0 + Math.cos(a) * d, y0 + Math.sin(a) * d)) break;
    len = d;
  }
  return len;
}
/** Лучи шага 2: минимальная длина и отказ (стрела — 30 и «Нет прямой видимости», топор — 24 и «Путь прегражден»). «Сияние» — решение пользователя:
 *  тоже до первой стены (вода и деревья не режут), без минимума и отказа. */
const RAYS: Record<string, [number, string | null]> = { hr_pierce: [30, NO_LOS], rv_throw: [24, "Путь прегражден"], cl_radiance: [0, null] };
/** Куда ляжет умение по курсору (без наведения): ground — курсор, прижатый к дальности; шар — по направлению на курсор на расстоянии до него,
 *  не дальше дальности; лучи — до стены, короче минимума — отказ; веер и конус — на всю дальность; рывок — до препятствия на v(ранг).dist, короче 16 — отказ.
 *  Видимость — решение пользователя 3: у ground и шара точка вне прямой видимости — отказ. Правила модулей (капкан, рой) — не здесь. */
function refPlace(def: SkillDef, rank: number, from: { x: number; y: number }, cursor: { x: number; y: number }): { x: number; y: number; err: string | null } {
  const range = def.range ?? 0, dx = cursor.x - from.x, dy = cursor.y - from.y, dist = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const at = (d: number) => ({ x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d });
  const seen = (q: { x: number; y: number }) => lineClear(map, from.x, from.y, q.x, q.y);
  if (def.aim === "ground") { const q = at(range > 0 ? Math.min(range, dist) : dist); return { ...q, err: seen(q) ? null : NO_LOS }; }
  if (def.aim === "dash") {
    const q = refReach(from.x, from.y, cursor.x, cursor.y, def.v(rank).dist);
    return { ...q, err: Math.hypot(q.x - from.x, q.y - from.y) < 16 ? STUCK[def.id] : null };
  }
  const full = range > 0 ? range : 300;
  if (RAYS[def.id]) { const len = refRay(from.x, from.y, a, full), [min, e] = RAYS[def.id]; return { ...at(len), err: len < min ? e : null }; }
  if (def.id === "volley" || def.id === "as_fan") return { ...at(full), err: null };
  const q = at(Math.min(full, dist || full));
  return { ...q, err: def.id === "fireball" && !seen(q) ? NO_LOS : null };
}
/** Размеры формы по рангу и пассивкам (числа из данных умений): круг — v.radius (капкан + «Ловец»), стена — v.len поперёк и ±26, шар — брызги v.splash
 *  и прямое попадание 20, полосы — ±v.width/2 (у «Сияния» ±24), веер — v.arrows стрел на v.arc° и коридор ±10, конус — ±v.arc/2 на дальность. */
function refSize(def: SkillDef, rank: number, ranks: Record<string, number>, g: Placed, ctx: string) {
  const v = def.v(rank), deg = (x: number) => (x * Math.PI) / 180;
  switch (def.id) {
    case "mg_firewall": return assert.deepEqual([g.len, g.r, g.w], [v.len, v.len / 2, 26], `${ctx}: стена`);
    case "fireball": return assert.deepEqual([g.r, g.r2], [v.splash, 20], `${ctx}: брызги и прямое попадание`);
    case "hr_pierce": case "rv_throw": return assert.equal(g.w, v.width / 2, `${ctx}: полуширина полосы`);
    case "cl_radiance": return assert.equal(g.w, 24, `${ctx}: полуширина «Сияния»`);
    case "volley": return assert.deepEqual([g.n, g.arc, g.w, g.r], [v.arrows, deg(v.arc), 10, def.range], `${ctx}: веер`);
    case "as_fan": return assert.ok(near(g.arc, deg(v.arc)) && g.r === def.range, `${ctx}: конус`);
    case "wl_demon": return assert.equal(g.r, 30, `${ctx}: метка демона`);
    case "tp_banner": return assert.deepEqual([g.r, g.r2], [v.radius, v.impact], `${ctx}: аура и удар знамени`);
  }
  if (g.shape === "circle") assert.equal(g.r, v.radius + (def.id === "hr_trap" && ranks.hr_trapper ? SKILLS.hr_trapper.v(ranks.hr_trapper).radius : 0), `${ctx}: радиус`);
  if (g.shape === "dash") assert.equal(g.r, v.dist, `${ctx}: длина рывка по рангу`);
}

// ---------- 1. размеры по рангу и пассивкам, поля данных ----------
assert.equal(shapeSize(SKILLS.blink, 1), 200); assert.equal(shapeSize(SKILLS.blink, 5), 280, "мерцание на 5 ранге длиннее на 80 px");
assert.equal(shapeSize(SKILLS.roll, 5), 170); assert.equal(shapeSize(SKILLS.meteor, 1), 110); assert.equal(shapeSize(SKILLS.mg_firewall, 3), 180, "стена — полная длина v.len");
assert.equal(shapeSize(SKILLS.fireball, 1), 55, "шар — радиус брызг"); assert.equal(shapeSize(SKILLS.hr_pierce, 1), SKILLS.hr_pierce.range, "полоса — во всю дальность");
const trap1 = SKILLS.hr_trap.v(1).radius, trapper = SKILLS.hr_trapper.v(SKILLS.hr_trapper.maxRank).radius;
assert.ok(trapper > 0, "«Ловец» прибавляет радиус капкана");
assert.equal(shapeSize(SKILLS.hr_trap, 1), trap1, "без пассивок");
assert.equal(shapeSize(SKILLS.hr_trap, 1, { hr_trap: 1, hr_trapper: SKILLS.hr_trapper.maxRank }), trap1 + trapper, "пассивка из plus");
assert.equal(trapRadius(1, { hr_trapper: SKILLS.hr_trapper.maxRank }), trap1 + trapper, "trapRadius — общий с сервером");
assert.equal(skillDims(SKILLS.hr_trap, 1, { hr_trapper: 0 }).radius, trap1);
const sweep = SKILLS.rv_sweep.v(SKILLS.rv_sweep.maxRank).radius;
assert.equal(skillDims(SKILLS.rv_leap, 1, { rv_sweep: SKILLS.rv_sweep.maxRank }).radius, SKILLS.rv_leap.v(1).radius * (1 + sweep / 100), "«Широкий замах» — mul");
assert.equal(SKILLS.hr_pierce.v(1).width, 28, "v.width — полная ширина (hr_pierce: коридор ±14)");
assert.equal(SKILLS.rv_throw.v(1).width, 40);
// постоянные — значения HEAD: рывок короче 16 и луч короче 30 — отказ; допуск точки ground — 32
assert.deepEqual([GROUND_TOL, DASH_MIN, RAY_MIN], [32, 16, 30], "GROUND_TOL, DASH_MIN, RAY_MIN");
const DIR_SHAPES: Record<string, string> = { fireball: "bolt", volley: "fan", cl_radiance: "band", hr_pierce: "band", as_fan: "cone", rv_throw: "band" };
let aimed = 0;
for (const cls of Object.keys(CLASSES) as (keyof typeof CLASSES)[]) for (const s of activeSkills(cls)) {
  const sp = aimSpec(s);
  if (s.aim === "ground") {
    aimed++;
    assert.ok((sp.shape === "circle" || (sp.shape === "wall" && s.id === "mg_firewall")) && sp.los && sp.oor === "clamp", `${s.id}: ground — круг (стена огня — стена), видимость, прижим`);
    assert.ok(shapeSize(s, 1) > 0, `${s.id}: размер`);
  }
  if (s.aim === "dir") { aimed++; assert.equal(sp.shape, DIR_SHAPES[s.id], s.id); assert.equal(sp.oor, "clamp", s.id); assert.equal(sp.home, s.id === "fireball", `${s.id}: самонаведение — только у шара`); }
  if (s.aim === "dash") { aimed++; assert.equal(sp.shape, "dash", s.id); assert.ok(shapeSize(s, 1) > 0, `${s.id}: длина рывка`); }
  if (s.aim === "unit") { assert.equal(sp.oor, "walk", s.id); assert.equal(sp.los, !["taunt", "heal", "renew", "holyshield", "bw_blood_bond", "bw_sacrifice", "dr_raven"].includes(s.id), `${s.id}: los`); }
}
assert.deepEqual(["charge", "rv_leap", "shadowstep", "dk_death_grip"].map((i) => aimSpec(SKILLS[i]).shape), ["leap", "leap", "behind", "pull"]);
assert.deepEqual(["frostnova", "quake", "tp_glare", "mg_timewarp", "cl_hymn", "bw_blood_circle"].map((i) => aimSpec(SKILLS[i]).shape), Array(6).fill("nova"));
assert.equal(aimSpec(SKILLS.blink).stuck, STUCK.blink); assert.equal(aimSpec(SKILLS.roll).stuck, STUCK.roll);
assert.ok(aimSpec(SKILLS.mg_firewall).turn && aimSpec(SKILLS.hr_pierce).ray && aimSpec(SKILLS.rv_throw).ray && aimSpec(SKILLS.cl_radiance).ray);
// союзники — по отбору модулей: «Круг света» — любые не враждебные; alliesAround — своей фракции; «Эгида» и купель — только герои
assert.deepEqual(["circle", "cl_aegis", "cl_hymn", "bw_blood_circle", "cl_radiance", "bw_crimson_pool"].map((i) => [aimSpec(SKILLS[i]).kin, aimSpec(SKILLS[i]).heroes]),
  [[false, false], [true, true], [true, false], [true, false], [true, false], [true, true]], "kin и heroes");
// допуск: клиент прижимает ровно к дальности, сервер — к дальности + GROUND_TOL
assert.deepEqual(groundPoint({ x: 0, y: 0 }, { x: 500, y: 0 }, 340), { x: 340, y: 0 });
assert.deepEqual(groundPoint({ x: 0, y: 0 }, { x: 360, y: 0 }, 340, GROUND_TOL), { x: 360, y: 0 });
assert.deepEqual(groundPoint({ x: 0, y: 0 }, { x: 500, y: 0 }, 340, GROUND_TOL), { x: 340 + GROUND_TOL, y: 0 });
console.log(`ok размеры и поля прицела: ${aimed} прицельных умений`);

// ---------- 2. превью = эталон = сервер: случайные точки, ранги 1 и 5, все прицельные умения ----------
const ids = [...new Set((Object.keys(CLASSES) as (keyof typeof CLASSES)[]).flatMap((c) => activeSkills(c)).filter((s) => s.aim === "ground" || s.aim === "dir" || s.aim === "dash").map((s) => s.id))];
const stat = { casts: 0, refused: 0, los: 0, stuck: 0, rules: 0, eq: 0, one: 0, sub: 0, allies: 0, mobs: 0, hit: 0, healed: 0, stopped: 0, summons: 0, shore: 0, ray: 0 };
const ruleSeen = new Map<string, number>();
/** Где сервер поставил форму: круг — fx в центре с радиусом превью; стена — 5 луж огня в метках превью; шар — снаряд и взрыв с брызгами в точке превью;
 *  полоса — снаряд или луч до конца превью; веер — столько стрел, сколько в превью; конус — fx конуса с углом, дальностью и раствором превью; рывок — куда встал герой. */
function checkPlace(def: SkillDef, g: Placed, p: Player, ctx: string) {
  const id = def.id, fx = mine(id), sp = aimSpec(def);
  switch (g.shape) {
    case "circle": {
      const at2 = fxAt(id, g.x, g.y);
      assert.ok(at2.length, `${ctx}: нет эффекта в точке превью (${g.x.toFixed(1)}, ${g.y.toFixed(1)}): ${JSON.stringify(fx.slice(0, 4))}`);
      // радиус эффекта = радиус превью (у знамени — аура; у призыва демона площади нет — метка)
      if (sp.who !== "none") assert.ok(at2.some((f) => near((f as { r: number }).r, g.r)), `${ctx}: радиус превью ${g.r}, на сервере ${at2.map((f) => (f as { r: number }).r).join(", ")}`);
      return;
    }
    case "wall": {
      const hz = fx.filter((f) => f.t === "hazard") as Extract<Fx, { t: "hazard" }>[];
      assert.equal(hz.length, 5, `${ctx}: луж огня`);
      hz.forEach((f, i) => { const q = wallMark(g.x, g.y, g.a, g.len, i); assert.ok(near(f.x, q.x) && near(f.y, q.y), `${ctx}: лужа ${i} в (${f.x}, ${f.y}), превью — (${q.x}, ${q.y})`); });
      return;
    }
    case "bolt": {
      const pr = projOf(id), boom = fx.find((f) => f.t === "aoe" && near(f.x, g.x) && near(f.y, g.y)) as Extract<Fx, { t: "aoe" }> | undefined;
      assert.ok(pr && near(pr.tx, g.x) && near(pr.ty, g.y), `${ctx}: снаряд в ${pr && `(${pr.tx}, ${pr.ty})`}, превью — (${g.x.toFixed(2)}, ${g.y.toFixed(2)})`);
      assert.ok(boom && near(boom.r, g.r), `${ctx}: взрыв не в точке превью или не того радиуса: ${JSON.stringify(boom)}`);
      return;
    }
    case "band": {
      const ch = fx.find((f) => f.t === "chain") as Extract<Fx, { t: "chain" }> | undefined, pr = projOf(id);
      const ex = ch ? ch.pts[2] : pr?.tx, ey = ch ? ch.pts[3] + 12 : pr?.ty;
      assert.ok(ex !== undefined && ey !== undefined && near(ex, g.x) && near(ey, g.y), `${ctx}: конец луча на сервере (${ex}, ${ey}), превью — (${g.x}, ${g.y})`);
      if (g.len < SKILLS[id].range!) stat.ray++;
      return;
    }
    case "fan":
      assert.equal(fx.filter((f) => f.t === "proj").length, g.n, `${ctx}: стрел`);
      return;
    case "cone": {
      const c = fx.find((f) => f.t === "cone") as Extract<Fx, { t: "cone" }> | undefined;
      assert.ok(c && near(c.a, g.a) && near(c.r, g.r) && near(c.w, g.arc), `${ctx}: конус на сервере ${JSON.stringify(c)}, превью a ${g.a} r ${g.r} раствор ${g.arc}`);
      return;
    }
    case "dash": {
      if (g.len < Math.min(g.r, Math.hypot(g.tx - g.ox, g.ty - g.oy)) - 9) stat.stopped++; // рывок остановила вода, дерево или стена
      const b = blinks(id)[0];
      assert.ok(b && near(b.x1, g.x) && near(b.y1, g.y), `${ctx}: рывок сервера в ${b && `(${b.x1}, ${b.y1})`}, превью — (${g.x}, ${g.y})`);
      assert.ok(near(p.unit.x, g.x) && near(p.unit.y, g.y), `${ctx}: герой не там, где показало превью`);
      return;
    }
  }
}
/** Кого задел сервер: враги (удары героя) — ровно форма превью; капкан — один из попавших; шторм — часть попавших; союзники (лечение героя, его щиты) — ровно. */
function checkHits(def: SkillDef, g: Placed, fs: Dm[], as: { p: Player; u: HitUnit }[], ctx: string) {
  const sp = aimSpec(def);
  assert.deepEqual(fs.filter((d) => d.mob.x !== d.u.x || d.mob.y !== d.u.y).map((d) => d.u.id), [], `${ctx}: манекены сдвинулись`);
  const want = shapeHits(map, g, fs.map((d) => d.u)), got = fs.filter((d) => hitIds.has(d.mob.id)).map((d) => d.u.id);
  stat.mobs += fs.length; stat.hit += got.length;
  if (sp.pick === "first") { assert.ok(got.length === Math.min(1, want.length) && got.every((h) => want.includes(h)), `${ctx}: капкан задел ${got}, в круге превью ${want}`); stat.one++; }
  else if (sp.pick === "random") { for (const h of got) assert.ok(want.includes(h), `${ctx}: сервер задел ${h} вне круга превью`); stat.sub++; }
  else { assert.deepEqual(got, want, `${ctx}: задетые сервером ≠ форма превью`); stat.eq++; }
  if (!as.length) return;
  const wantA = shapeHits(map, g, as.map((q) => q.u)), gotA = as.filter((q) => healed.has(q.p.id) || (q.p.shieldBy === caster && q.p.shieldUntil > w.time)).map((q) => q.u.id);
  assert.deepEqual(gotA, wantA, `${ctx}: союзники — сервер лечил или закрыл щитом ${gotA}, превью — ${wantA}`);
  stat.allies++; stat.healed += gotA.length;
}
for (const id of ids) {
  const def = SKILLS[id], sp = aimSpec(def);
  for (const rank of [1, Math.min(5, def.maxRank)]) {
    for (const at of SPOTS) {
      const p = hero(def, rank, at, rank > 1);
      caster = p;
      const size = sp.shape === "dash" ? shapeSize(def, rank, p.save.skills) : (def.range ?? 300);
      const a = rnd() * Math.PI * 2, dist = rnd() * size * 1.5;
      const cursor = { x: at.x + Math.cos(a) * dist, y: at.y + Math.sin(a) * dist };
      const ctx = `${id} ранг ${rank} из (${at.x}, ${at.y}) в (${cursor.x.toFixed(0)}, ${cursor.y.toFixed(0)})`;
      // форма без мира — эталон: та же точка и тот же отказ, размеры по рангу и пассивкам
      const g0 = preview(def, rank, p.save.skills, at, cursor).g;
      const rf = refPlace(def, rank, at, cursor);
      assert.ok(near(g0.x, rf.x) && near(g0.y, rf.y), `${ctx}: превью в (${g0.x.toFixed(2)}, ${g0.y.toFixed(2)}), эталон — (${rf.x.toFixed(2)}, ${rf.y.toFixed(2)})`);
      assert.equal(g0.err, rf.err, `${ctx}: отказ превью «${g0.err}», эталон — «${rf.err}»`);
      refSize(def, rank, p.save.skills, g0, ctx);
      // манекены-враги и союзники вокруг формы; превью с миром — свои капканы (их нет) и видимые юниты (цели роя): правила модулей
      const fs = g0.err || sp.shape === "dash" ? [] : dummiesAt(spotsFor(g0, sp.shape === "fan" ? 12 : 8));
      const as = !g0.err && (sp.who === "ally" || sp.who === "both") ? spotsFor(g0, 4).map((s) => ally(def, s)) : [];
      const { g, msg } = preview(def, rank, p.save.skills, at, cursor, { traps: [], units: [...fs.map((d) => d.u), ...as.map((q) => q.u)] });
      assert.ok(near(g.x, g0.x) && near(g.y, g0.y), `${ctx}: мир сдвинул форму`);
      clearMobs(new Set(fs.map((d) => d.mob.id)));
      log.length = 0; hitIds.clear(); healed.clear();
      const err = castSkill(w, p, id, msg.x, msg.y, null, msg);
      // призыв встаёт в метку превью (на воде — у берега на линии к герою); дальше он пойдёт за героем
      if (!err && sp.summon) {
        // с задачи 149 у призыва свой id (sum_<герой>_<вид>), не id постоянного питомца
        const pet = [...w.pets.values()].find((q) => q.owner === p && q.def.temp);
        assert.ok(pet && near(pet.unit.x, g.sx) && near(pet.unit.y, g.sy), `${ctx}: призыв в ${pet && `(${pet.unit.x}, ${pet.unit.y})`}, превью — (${g.sx}, ${g.sy})`);
        stat.summons++;
        if (Math.hypot(g.sx - g.x, g.sy - g.y) > 1) stat.shore++;
      }
      run(3000);
      if (g.err) {
        assert.equal(err, g.err, `${ctx}: превью отказало «${g.err}», сервер — ${err === null ? "каст" : `«${err}»`}`);
        stat.refused++;
        if (g.err === NO_LOS) stat.los++; else if (g0.err) stat.stuck++; else { stat.rules++; ruleSeen.set(`${id}: ${g.err}`, (ruleSeen.get(`${id}: ${g.err}`) ?? 0) + 1); }
      } else {
        assert.equal(err, null, `${ctx}: превью — каст, сервер отказал «${err}»`);
        stat.casts++;
        checkPlace(def, g, p, ctx);
        if (sp.shape !== "dash") checkHits(def, g, fs, as, ctx);
      }
      dropMobs(fs.map((d) => d.mob));
      for (const q of as) w.removePlayer(q.p.id);
      caster = null;
      w.removePlayer(p.id);
    }
  }
}
assert.ok(stat.los > 0 && stat.stopped > 0 && stat.ray > 0, `точки не проверили препятствия: видимость ${stat.los}, рывков до препятствия ${stat.stopped}, лучей до стены ${stat.ray}`);
assert.ok(stat.eq > 200 && stat.hit > 100 && stat.healed > 20 && stat.one > 5 && stat.summons > 5, `мало сверок: ${JSON.stringify(stat)}`);
console.log(`ok превью = эталон = сервер: ${ids.length} умений × 2 ранга × ${SPOTS.length} точек — кастов ${stat.casts}, отказов ${stat.refused} (видимость ${stat.los}, луч и рывок ${stat.stuck}, ` +
  `правила модулей ${stat.rules}), рывков до препятствия ${stat.stopped}, лучей до стены ${stat.ray}; задетые сверены ${stat.eq} раз точно, ${stat.one} — капкан, ${stat.sub} — шторм ` +
  `(${stat.mobs} манекенов, ударов ${stat.hit}); союзники ${stat.allies} раз (лечение и щиты ${stat.healed}); призывов ${stat.summons}, у берега ${stat.shore}`);
if (ruleSeen.size) console.log(`   правила модулей, известные превью: ${[...ruleSeen].map(([k, n]) => `${k} ×${n}`).join("; ")}`);

// ---------- 3. точка отсчёта: допуск ground, угол и вектор с клиента от позиции сервера, очередь, шар по цели, рывки ----------
const GROUND = ids.filter((i) => SKILLS[i].aim === "ground");
/** На восток от открытого места: точки площадных на дальности, луч «Пронзающей стрелы», топор, мерцание 5 ранга. */
const FAR = Math.max(...GROUND.map((i) => SKILLS[i].range ?? 0), SKILLS.hr_pierce.range ?? 0, SKILLS.rv_throw.range ?? 0, shapeSize(SKILLS.blink, 5)) + 40;
/** Нет стен в прямоугольнике (клетки карты). */
function noWalls(x0: number, y0: number, x1: number, y1: number): boolean {
  for (let cy = Math.floor(y0 / TILE); cy <= Math.floor(y1 / TILE); cy++)
    for (let cx = Math.floor(x0 / TILE); cx <= Math.floor(x1 / TILE); cx++) if ((map.cell[cy * map.w + cx] ?? CELL_WALL) & CELL_WALL) return false;
  return true;
}
/** Открытое место: проходимо и видно во все стороны на 420 px; на восток — проходимо до FAR (и не город), без стен там, где манекены коридоров. */
function openSpot(): { x: number; y: number } {
  for (let i = 0; i < 40000; i++) {
    const x = (8 + Math.floor(rnd() * (map.w - 16))) * TILE + 16, y = (8 + Math.floor(rnd() * (map.h - 16))) * TILE + 16;
    if (!freeSpot(x, y) || !lineClear(map, x, y, x + FAR, y) || !noWalls(x - 40, y - 60, x + 200, y + 60)) continue;
    let ok = true;
    for (let k = 0; k < 16 && ok; k++) {
      const a = (k / 16) * Math.PI * 2;
      ok = lineClear(map, x, y, x + Math.cos(a) * 420, y + Math.sin(a) * 420) && walkable(map, x + Math.cos(a) * 300, y + Math.sin(a) * 300, PLAYER_RADIUS + 2) &&
        walkable(map, x + Math.cos(a) * 150, y + Math.sin(a) * 150, PLAYER_RADIUS + 2);
    }
    for (let d = 8; d <= FAR && ok; d += 8) ok = freeSpot(x + d, y);
    if (ok) return { x, y };
  }
  throw new Error("нет открытого места");
}
const O = openSpot();
clearMobs();
{
  // допуск у каждого площадного: превью прижало курсор к дальности от O, сервер на 20 px позади по линии прицела (пинг, очередь) —
  // эффект ровно в точке превью; модули точку не пересчитывают (раньше 6 из 15 прижимали её заново и ставили на 20 px ближе)
  for (const id of GROUND) {
    const def = SKILLS[id], range = def.range ?? 0, p = hero(def, 1, O, false);
    caster = p;
    const { g, msg } = preview(def, 1, p.save.skills, O, { x: O.x + range + 300, y: O.y });
    assert.ok(!g.err && near(g.x, O.x + range) && near(g.y, O.y), `${id}: превью не прижало курсор к дальности: (${g.x}, ${g.y}) «${g.err}»`);
    const dm = id === "dr_hexswarm" ? [dummy(g.x, g.y, 10)] : []; // рою нужна цель в области
    place(p, { x: O.x - 20, y: O.y });
    log.length = 0;
    assert.equal(castSkill(w, p, id, msg.x, msg.y, null, msg), null, `${id}: отказ при отставании сервера на 20 px`);
    run(1500);
    assert.ok(fxAt(id, g.x, g.y).length, `${id}: сервер на 20 px позади — эффект не в точке превью (${g.x}, ${g.y}): ${JSON.stringify(mine(id).slice(0, 3))}`);
    dropMobs(dm);
    caster = null;
    w.removePlayer(p.id);
  }
}
{
  // метеор: сервер отстал на 60 px (больше допуска) — прижим к дальности + допуск от своей позиции
  const p = hero(SKILLS.meteor, 1, O, false);
  const { g, msg } = preview(SKILLS.meteor, 1, p.save.skills, O, { x: O.x + 600, y: O.y });
  assert.deepEqual([g.x, g.y, g.err], [O.x + 340, O.y, null]);
  place(p, { x: O.x - 60, y: O.y });
  log.length = 0;
  assert.equal(castSkill(w, p, "meteor", msg.x, msg.y, null, msg), null);
  const t2 = mine("meteor").find((f) => f.t === "tele") as Extract<Fx, { t: "tele" }>;
  assert.ok(near(t2.x, O.x - 60 + 340 + GROUND_TOL) && near(t2.y, O.y), `метеор за допуском: (${t2.x}, ${t2.y})`);
  run(1500);
  w.removePlayer(p.id);
}
{
  // огненный шар: угол и вектор до точки взрыва с клиента — сервер откладывает тот же вектор от своей позиции (а не угол клиента на расстояние до старой точки)
  const p = hero(SKILLS.fireball, 1, O, false);
  const { g, msg } = preview(SKILLS.fireball, 1, p.save.skills, O, { x: O.x + 200, y: O.y });
  assert.ok(near(g.a, 0) && near(msg.a!, 0) && near(msg.dx!, 200) && near(msg.dy!, 0), `угол и вектор линии в запросе: ${JSON.stringify(msg)}`);
  place(p, { x: O.x, y: O.y + 30 });
  log.length = 0;
  assert.equal(castSkill(w, p, "fireball", msg.x, msg.y, null, msg), null);
  const pr = projOf("fireball")!;
  assert.ok(pr && near(pr.tx, O.x + 200) && near(pr.ty, O.y + 30), `шар не по вектору от позиции сервера: (${pr?.tx}, ${pr?.ty}), ждали (${O.x + 200}, ${O.y + 30})`);
  run(1500);
  // из очереди (общий откат): вектор применяется от позиции героя в момент исполнения
  place(p, O);
  p.gcdUntil = w.time + 200;
  log.length = 0;
  requestSkill(w, p, { id: "fireball", x: msg.x, y: msg.y, target: null, ap: false, until: 0, a: msg.a, dx: msg.dx, dy: msg.dy }, 400);
  assert.equal(mine("fireball").filter((f) => f.t === "proj").length, 0, "шар ушёл до конца общего отката");
  p.unit.y = O.y + 40;
  run(600);
  const q = projOf("fireball");
  assert.ok(q && near(q.tx, O.x + 200) && near(q.ty, O.y + 40), `из очереди шар ушёл не по вектору от новой позиции: (${q?.tx}, ${q?.ty})`);
  run(1500);
  // без угла и вектора (боты, старый клиент) — в точку запроса, как раньше
  place(p, { x: O.x, y: O.y + 30 });
  log.length = 0;
  assert.equal(castSkill(w, p, "fireball", O.x + 200, O.y, null), null);
  const b = projOf("fireball");
  assert.ok(b && near(b.tx, O.x + 200) && near(b.ty, O.y), `шар без угла — не в точку: (${b?.tx}, ${b?.ty})`);
  run(1500);
  w.removePlayer(p.id);
}
{
  // шар по цели: сервер стоит на 20 px в стороне от позиции клиента; угол клиента, отложенный от позиции сервера, упирается в угол стены,
  // а цель сервер видит — самонаведение (home): точка и видимость по цели, каст проходит (до исправления — «Нет прямой видимости»)
  const K = search((s) => {
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2, t = { x: r01(s.x + Math.cos(a) * 200), y: r01(s.y + Math.sin(a) * 200) };
      if (w.inTown(t.x, t.y) || !lineClear(map, s.x, s.y, t.x, t.y)) continue;
      for (const sd of [-1, 1]) {
        const c = { x: s.x - Math.sin(a) * 20 * sd, y: s.y + Math.cos(a) * 20 * sd };
        if (!lineClear(map, c.x, c.y, t.x, t.y)) continue;
        const ac = Math.atan2(t.y - c.y, t.x - c.x), d = Math.hypot(t.x - s.x, t.y - s.y);
        if (!lineClear(map, s.x, s.y, s.x + Math.cos(ac) * d, s.y + Math.sin(ac) * d)) return { s, t, c };
      }
    }
    return null;
  });
  assert.ok(K, "нет места для шара по цели у угла стены");
  const p = hero(SKILLS.fireball, 1, K.s, false);
  caster = p;
  const foe = dummy(K.t.x, K.t.y, 10);
  const hv: CastUnit = { id: foe.id, x: foe.x, y: foe.y, enemy: true, friend: false, r: 10 };
  const plan = resolveCast(castIn(SKILLS.fireball, K.c, { x: foe.x, y: foe.y }, hv));
  assert.ok(plan.ok && plan.target === foe.id, "курсор на враге — шар по нему");
  // как GameScene.aimOf: цель плана — для самонаведения (радиус — как у сервера)
  const { g, msg } = castAim(map, SKILLS.fireball, 1, p.save.skills, K.c, plan, aimUnit(hv));
  assert.ok(!g.err && g.home && g.tid === foe.id && near(g.x, foe.x) && near(g.y, foe.y), `превью шара по цели: (${g.x}, ${g.y}) «${g.err}»`);
  log.length = 0;
  assert.equal(castSkill(w, p, "fireball", msg.x, msg.y, foe.id, msg), null, `шар по цели при сдвиге сервера на 20 px: из (${K.s.x}, ${K.s.y}) в (${K.t.x}, ${K.t.y})`);
  const pr = projOf("fireball");
  assert.ok(pr && pr.to === foe.id && near(pr.tx, foe.x) && near(pr.ty, foe.y), `шар не в цель: ${JSON.stringify(pr)}`);
  run(1500);
  dropMobs([foe]);
  caster = null;
  w.removePlayer(p.id);
}
{
  // мерцание: вектор от героя — сервер стоит на 30 px ниже, рывок на тот же вектор от своей позиции
  const p = hero(SKILLS.blink, 1, O, false);
  const { g, msg } = preview(SKILLS.blink, 1, p.save.skills, O, { x: O.x + 150, y: O.y });
  assert.deepEqual([msg.dx, msg.dy, g.x, g.y], [150, 0, O.x + 150, O.y]);
  place(p, { x: O.x, y: O.y + 30 });
  log.length = 0;
  assert.equal(castSkill(w, p, "blink", msg.x, msg.y, null, msg), null);
  const b = blinks("blink")[0];
  assert.ok(near(b.x1, O.x + 150) && near(b.y1, O.y + 30), `мерцание не по вектору: (${b.x1}, ${b.y1})`);
  // без вектора (боты, старый клиент) — к точке, как раньше
  place(p, O);
  log.length = 0;
  assert.equal(castSkill(w, p, "blink", O.x - 120, O.y, null), null);
  const b2 = blinks("blink")[0];
  assert.ok(near(b2.x1, O.x - 120) && near(b2.y1, O.y), "мерцание к точке без вектора");
  // рывок в упор (длина меньше DASH_MIN) — отказ и в превью, и на сервере
  const tiny = placeSkill(map, SKILLS.blink, 1, undefined, O, { x: O.x + DASH_MIN / 2, y: O.y });
  assert.equal(tiny.err, STUCK.blink);
  place(p, O);
  assert.equal(castSkill(w, p, "blink", O.x + DASH_MIN / 2, O.y, null), STUCK.blink);
  w.removePlayer(p.id);
}
{
  // мерцание 5 ранга на открытом месте — ровно 280 px (длина по рангу, а не с 1 ранга)
  const p = hero(SKILLS.blink, 5, O, false);
  const { g, msg } = preview(SKILLS.blink, 5, p.save.skills, O, { x: O.x + 400, y: O.y });
  assert.ok(!g.err && near(g.len, 280) && near(g.x, O.x + 280) && near(g.y, O.y), `мерцание 5 ранга в превью: ${g.len}`);
  assert.equal(castSkill(w, p, "blink", msg.x, msg.y, null, msg), null);
  assert.ok(near(p.unit.x, O.x + 280) && near(p.unit.y, O.y), `мерцание 5 ранга на сервере: (${p.unit.x}, ${p.unit.y})`);
  w.removePlayer(p.id);
}
/** Берег: от s по прямой до воды (видимость есть — не стена) не ближе 32 px; dw — первый шаг в воде. */
function shoreFrom(s: { x: number; y: number }, maxD: number) {
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2, cur = { x: s.x + Math.cos(a) * 300, y: s.y + Math.sin(a) * 300 };
    for (let st = 8; st <= maxD; st += 8) {
      const x = s.x + Math.cos(a) * st, y = s.y + Math.sin(a) * st;
      if (!lineClear(map, s.x, s.y, x, y)) break;
      if (!walkable(map, x, y, PLAYER_RADIUS)) { if (st >= 32) return { s, cur, a, dw: st, x, y }; break; }
    }
  }
  return null;
}
{
  // рывок к воде останавливается у берега: последний шаг, где герой стоит; следующий — в воде или деревьях (видимость есть — не стена)
  const K = search((s) => shoreFrom(s, shapeSize(SKILLS.blink, 1)));
  assert.ok(K, "нет берега для рывка");
  const p = hero(SKILLS.blink, 1, K.s, false);
  const { g, msg } = preview(SKILLS.blink, 1, p.save.skills, K.s, K.cur);
  assert.ok(!g.err && near(g.len, K.dw - 8), `рывок к воде: ${g.len.toFixed(1)} px, берег — ${K.dw} px`);
  assert.ok(walkable(map, g.x, g.y, PLAYER_RADIUS) && !walkable(map, K.x, K.y, PLAYER_RADIUS) && lineClear(map, K.s.x, K.s.y, K.x, K.y), "стоп у воды, а не у стены");
  assert.equal(castSkill(w, p, "blink", msg.x, msg.y, null, msg), null);
  assert.ok(near(p.unit.x, g.x) && near(p.unit.y, g.y), `сервер: рывок не у берега (${p.unit.x}, ${p.unit.y})`);
  w.removePlayer(p.id);
}
console.log("ok точка отсчёта: допуск у всех площадных, угол и вектор с клиента — от позиции сервера и из очереди, шар по цели, мерцание 5 ранга, рывок у воды");

// ---------- 4. кого задевают линии: края коридоров ----------
for (const [id, half, along] of [["hr_pierce", 14, 120], ["rv_throw", 20, 100], ["cl_radiance", 24, 100]] as const) {
  // «Пронзающая стрела» — ±14 + радиус цели (v.width — полная ширина 28), «Метнуть топор» — ±20 + радиус (40), «Сияние» — ±24 + радиус: внутри на 1 px задеты, снаружи — нет
  const def = SKILLS[id], p = hero(def, 1, O, false), r = 10;
  caster = p;
  const inner = [-1, 1].map((s) => dummy(O.x + along, O.y + s * (half + r - 1), r));
  const outer = [-1, 1].map((s) => dummy(O.x + along + 30, O.y + s * (half + r + 1), r));
  const { g, msg } = preview(def, 1, p.save.skills, O, { x: O.x + 300, y: O.y });
  assert.ok(!g.err && near(g.a, 0) && g.w === half, `${id}: превью на восток, полуширина ${g.w}`);
  assert.deepEqual(shapeHits(map, g, [...inner, ...outer].map((m) => asUnit(m, r))), inner.map((m) => m.id), `${id}: превью — края коридора`);
  hitIds.clear();
  assert.equal(castSkill(w, p, id, msg.x, msg.y, null, msg), null, `${id}: отказ на открытом месте`);
  run(1000);
  assert.deepEqual([...inner, ...outer].map((m) => hitIds.has(m.id)), [true, true, false, false], `${id}: коридор ±${half} + радиус цели`);
  dropMobs([...inner, ...outer]);
  caster = null;
  w.removePlayer(p.id);
}
console.log("ok линии: края коридоров «Пронзающей стрелы», «Метнуть топор» и «Сияния»");
{
  // решение пользователя: луч «Сияния» останавливают только стены — над водой и деревьями (непроходимо, но видно) он идёт дальше, у стены обрывается;
  // превью = сервер (конец луча в fx chain), = эталон refRay
  const R = SKILLS.cl_radiance, full = R.range && R.range > 0 ? R.range : 300;
  /** Направление из s: луч проходит над непроходимой не-стеной (вода, дерево) на расстоянии over и обрывается у стены (короче полной дальности). */
  const find = (s: { x: number; y: number }) => {
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2, len = refRay(s.x, s.y, a, full);
      if (len + 10 > full || len < 60) continue;
      let over = 0;
      for (let d = 16; d < len - 8 && !over; d += 8) {
        const x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
        if (!walkable(map, x, y, 8) && !(map.cell[Math.floor(y / TILE) * map.w + Math.floor(x / TILE)] & CELL_WALL)) over = d;
      }
      if (over) return { s, a, len, over };
    }
    return null;
  };
  const K = search(find);
  assert.ok(K, "нет места: луч над водой или деревьями до стены");
  const p = hero(R, 1, K.s, false);
  caster = p;
  const { g, msg } = preview(R, 1, p.save.skills, K.s, { x: K.s.x + Math.cos(K.a) * 400, y: K.s.y + Math.sin(K.a) * 400 });
  assert.ok(!g.err && near(g.len, K.len) && g.len > K.over && g.len < full, `превью «Сияния»: ${g.len.toFixed(1)} px, эталон ${K.len}, над препятствием на ${K.over}`);
  const ex = K.s.x + Math.cos(K.a) * (K.len + 10), ey = K.s.y + Math.sin(K.a) * (K.len + 10);
  assert.ok(!lineClear(map, K.s.x, K.s.y, ex, ey), "за концом луча — стена");
  const rq = refReach(K.s.x, K.s.y, K.s.x + Math.cos(K.a) * full, K.s.y + Math.sin(K.a) * full, full);
  assert.ok(Math.hypot(rq.x - K.s.x, rq.y - K.s.y) < g.len - 8, "рывок (reachable) остановился бы раньше — у воды или деревьев");
  log.length = 0;
  assert.equal(castSkill(w, p, "cl_radiance", msg.x, msg.y, null, msg), null, "«Сияние» над водой и деревьями — без отказа");
  const ch = mine("cl_radiance").find((f) => f.t === "chain") as Extract<Fx, { t: "chain" }> | undefined;
  assert.ok(ch && near(ch.pts[2], g.x) && near(ch.pts[3], g.y - 12), `сервер: конец луча (${ch?.pts[2]}, ${ch?.pts[3]}) ≠ превью (${g.x}, ${g.y - 12})`);
  run(600);
  caster = null;
  w.removePlayer(p.id);
}
console.log("ok «Сияние»: над водой и деревьями луч идёт, у стены обрывается, превью = сервер");

// ---------- 5. решение пользователя 3: площадные — только в прямой видимости ----------
function wallPair(): { p: { x: number; y: number }; q: { x: number; y: number } } {
  for (const s of SPOTS) for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2, q = { x: s.x + Math.cos(a) * 150, y: s.y + Math.sin(a) * 150 };
    if (walkable(map, q.x, q.y, 8) && !lineClear(map, s.x, s.y, q.x, q.y)) return { p: s, q };
  }
  throw new Error("нет пары точек за стеной");
}
const WP = wallPair();
for (const id of ["meteor", "circle", "wl_doom", "rain"]) {
  const def = SKILLS[id], p = hero(def, 1, WP.p, false);
  const { g, msg } = preview(def, 1, p.save.skills, WP.p, WP.q);
  assert.equal(g.err, NO_LOS, `${id}: превью за стеной не красное`);
  assert.equal(castSkill(w, p, id, msg.x, msg.y, null, msg), NO_LOS, `${id}: сервер кастует за стену`);
  w.removePlayer(p.id);
}
// луч «Пронзающей стрелы» в упор в стену — отказ в обоих
{
  const s = WP.p, a = Math.atan2(WP.q.y - s.y, WP.q.x - s.x);
  const g = placeSkill(map, SKILLS.hr_pierce, 1, undefined, s, { x: s.x + Math.cos(a) * 300, y: s.y + Math.sin(a) * 300 });
  assert.ok(g.len < SKILLS.hr_pierce.range! && g.len >= 0, "луч обрывается у стены");
  if (g.len < RAY_MIN) assert.equal(g.err, NO_LOS);
}
{
  // бот-лекарь арены (server/src/arena/bots.ts): самый раненый союзник за стеной — «Круг света» туда не встанет; бот не стоит на отказе,
  // а вешает щит (видимость не нужна), а при двух видимых раненых ставит круг по видимым
  const bot = hero(SKILLS.circle, 1, WP.p, false);
  Object.assign(bot.save.skills, { heal: 1, renew: 1, holyshield: 1 });
  const allyAt = (at: { x: number; y: number }, hp: number) => { const q = hero(SKILLS.heal, 1, at, false); q.unit.hp = Math.round(q.unit.maxHp * hp); return q; };
  const seenAt: { x: number; y: number }[] = [];
  for (let k = 0; k < 32 && seenAt.length < 2; k++) {
    const a = (k / 32) * Math.PI * 2, q = { x: WP.p.x + Math.cos(a) * 60, y: WP.p.y + Math.sin(a) * 60 };
    if (lineClear(map, WP.p.x, WP.p.y, q.x, q.y) && Math.hypot(q.x - WP.q.x, q.y - WP.q.y) > 60 && !seenAt.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 30)) seenAt.push(q);
  }
  assert.equal(seenAt.length, 2, "нет видимых мест рядом с лекарем");
  const hidden = allyAt(WP.q, 0.3), vis = allyAt(seenAt[0], 0.5);
  const foe = hero(SKILLS.fireball, 1, { x: WP.p.x + 400, y: WP.p.y }, false); // цель бота — дальше 300 px, в союзники не попадает
  botThink(w, bot, [foe]);
  assert.ok(hidden.shieldUntil > w.time, "бот-лекарь застрял на «Круге света» за стеной: самый раненый без щита");
  const vis2 = allyAt(seenAt[1], 0.6);
  // бот решает не чаще раза в botReactMs (data/balance.json, до 400 мс): второе решение — через полсекунды мира, а не в тот же такт
  w.time += 500;
  bot.cds.clear(); bot.gcdUntil = 0;
  botThink(w, bot, [foe]);
  assert.ok((bot.cds.get("circle") ?? 0) > w.time, "два видимых раненых — бот не поставил «Круг света»");
  for (const q of [bot, hidden, vis, vis2, foe]) w.removePlayer(q.id);
}
console.log("ok решение 3: метеор, «Круг света», «Чумной туман», «Град стрел» за стеной — отказ сервера и красное превью; бот-лекарь не стоит на отказе");

// ---------- 6. рывки к цели: Рывок, «Прыжок с разрезом», «Теневой шаг», «Хватка смерти» ----------
/** Эталон рывков к цели по формулам модулей HEAD: дальность + радиус цели (иначе — подход, модуль ответит «Цель слишком далеко»), видимость
 *  (у Рывка — «Путь прегражден»), Рывок и прыжок — до радиуса цели + 14 по reachable, раньше на 16 px и больше — «Путь прегражден» (шаг 2);
 *  за спину — первое проходимое место из 8 углов от спины цели; притягивание — цель к герою до радиуса + 16 (босса не тянет). */
function refUnit(id: string, from: { x: number; y: number }, t: { x: number; y: number; r: number; fx: number; fy: number; boss: boolean }): { x: number; y: number; err: string | null; far: boolean } {
  const range = SKILLS[id].range ?? 0, d = Math.hypot(t.x - from.x, t.y - from.y);
  if (d > range + t.r) return { x: t.x, y: t.y, err: null, far: true };
  if (!lineClear(map, from.x, from.y, t.x, t.y)) return { x: t.x, y: t.y, err: id === "charge" ? BLOCKED : NO_LOS, far: false };
  if (id === "charge" || id === "rv_leap") {
    const L = Math.max(0, d - (t.r + PLAYER_RADIUS + 4)), q = refReach(from.x, from.y, t.x, t.y, L);
    return { ...q, err: L - Math.hypot(q.x - from.x, q.y - from.y) >= 16 ? BLOCKED : null, far: false };
  }
  if (id === "shadowstep") {
    const off = t.r + PLAYER_RADIUS + 2, base = Math.atan2(-t.fy, -t.fx);
    for (const da of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, Math.PI]) {
      const x = t.x + Math.cos(base + da) * off, y = t.y + Math.sin(base + da) * off;
      if (walkable(map, x, y, PLAYER_RADIUS) && lineClear(map, x, y, t.x, t.y)) return { x, y, err: null, far: false };
    }
    return { x: t.x, y: t.y, err: NO_BEHIND, far: false };
  }
  if (t.boss) return { x: t.x, y: t.y, err: null, far: false };
  return { ...refReach(t.x, t.y, from.x, from.y, Math.max(0, d - (t.r + PLAYER_RADIUS + 6))), err: null, far: false };
}
const FACE: [number, number][] = [[0, 1], [0, -1], [-1, 0], [1, 0]];
const ust = { casts: 0, far: 0, los: 0, blocked: 0, behind: 0, boss: 0, splash: 0, chains: 0 };
for (const id of ["charge", "rv_leap", "shadowstep", "dk_death_grip"]) {
  const def = SKILLS[id], range = def.range ?? 0;
  for (const rank of [1, Math.min(5, def.maxRank)]) for (const at of SPOTS) {
    const p = hero(def, rank, at, rank > 1);
    caster = p;
    const r = RADII[Math.floor(rnd() * RADII.length)], a = rnd() * Math.PI * 2, d = 20 + rnd() * (range + 60), boss = id === "dk_death_grip" && rnd() < 0.25;
    const t = dummy(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d, r, boss);
    t.unit.dir = Math.floor(rnd() * 4);
    // соседи цели — для всплеска прыжка и «Железных цепей»
    const nb = dummiesAt(Array.from({ length: 6 }, (_, i) => { const b = rnd() * Math.PI * 2, e = 8 + rnd() * 130; return { x: t.x + Math.cos(b) * e, y: t.y + Math.sin(b) * e, r: RADII[i % 3] }; }));
    const tu: CastUnit = { id: t.id, x: t.x, y: t.y, enemy: true, friend: false, r, dir: t.unit.dir, boss };
    const plan = resolveCast(castIn(def, at, { x: t.x, y: t.y - 10 }, tu));
    assert.ok(plan.ok && plan.target === t.id, `${id}: курсор на цели`);
    const units = [asUnit(t, r), ...nb.map((q) => q.u)];
    const { g, msg } = castAim(map, def, rank, p.save.skills, at, plan, aimUnit(tu), { units });
    const ctx = `${id} ранг ${rank} из (${at.x}, ${at.y}) в (${t.x}, ${t.y}) r ${r}${boss ? " босс" : ""}`;
    const [fx, fy] = FACE[t.unit.dir];
    const rf = refUnit(id, at, { x: t.x, y: t.y, r, fx, fy, boss });
    assert.equal(plan.far, rf.far, `${ctx}: «далеко» — дальность + радиус цели`);
    assert.deepEqual([g.far, g.err], [rf.far, rf.err], `${ctx}: превью — далеко ${g.far}, отказ «${g.err}»; эталон — ${rf.far}, «${rf.err}»`);
    if (!rf.far && !rf.err) assert.ok(near(g.x, rf.x) && near(g.y, rf.y), `${ctx}: превью в (${g.x}, ${g.y}), эталон — (${rf.x}, ${rf.y})`);
    clearMobs(new Set([t.id, ...nb.map((q) => q.mob.id)]));
    log.length = 0; hitIds.clear();
    const err = castSkill(w, p, id, msg.x, msg.y, t.id, msg);
    run(1500);
    if (g.far) { assert.equal(err, "Цель слишком далеко", `${ctx}: вне дальности`); ust.far++; }
    else if (g.err) {
      assert.equal(err, g.err, `${ctx}: превью отказало «${g.err}», сервер — ${err === null ? "каст" : `«${err}»`}`);
      if (g.err === BLOCKED && lineClear(map, at.x, at.y, t.x, t.y)) ust.blocked++; else if (g.err === NO_BEHIND) ust.behind++; else ust.los++;
    } else {
      assert.equal(err, null, `${ctx}: превью — каст, сервер отказал «${err}»`);
      ust.casts++;
      const bl = blinks(id), who = id === "dk_death_grip" ? t.id : p.id, b = bl.find((f) => f.id === who);
      if (id === "dk_death_grip" && boss) { assert.ok(!b, `${ctx}: босса притянуло`); ust.boss++; }
      else assert.ok(b && near(b.x1, g.x) && near(b.y1, g.y), `${ctx}: ${id === "dk_death_grip" ? "цель" : "герой"} встал в ${b && `(${b.x1}, ${b.y1})`}, превью — (${g.x}, ${g.y})`);
      // задетые: удары героя и притянутые цепями — ровно превью (всплеск у цели, «Железные цепи» у притянутой)
      const pulled = new Set(bl.map((f) => f.id)), want = shapeHits(map, g, units);
      const got = [t, ...nb.map((q) => q.mob)].filter((m) => hitIds.has(m.id) || (pulled.has(m.id) && m.id !== p.id)).map((m) => m.id);
      assert.deepEqual(got, want, `${ctx}: задеты ${got}, превью — ${want}`);
      if (want.length > 1) { if (id === "rv_leap") ust.splash++; else ust.chains++; }
    }
    dropMobs([t, ...nb.map((q) => q.mob)]);
    caster = null;
    w.removePlayer(p.id);
  }
}
assert.ok(ust.blocked > 0 && ust.far > 0 && ust.casts > 50 && ust.splash > 0 && ust.chains > 0 && ust.boss > 0, `мало сверок рывков к цели: ${JSON.stringify(ust)}`);
{
  // Рывок и прыжок через воду: цель видно, а путь — по воде; герой раньше вставал у берега и бил через воду — теперь отказ и красное превью
  const K = search((s) => {
    const sh = shoreFrom(s, 200);
    if (!sh) return null;
    for (let e = sh.dw + 40; e <= 240; e += 8) {
      const t = { x: s.x + Math.cos(sh.a) * e, y: s.y + Math.sin(sh.a) * e };
      if (walkable(map, t.x, t.y, 12) && lineClear(map, s.x, s.y, t.x, t.y) && !w.inTown(t.x, t.y)) return { s, t };
    }
    return null;
  });
  assert.ok(K, "нет цели за водой");
  for (const id of ["charge", "rv_leap"]) {
    const p = hero(SKILLS[id], 1, K.s, false), t = dummy(K.t.x, K.t.y, 12);
    const tu: CastUnit = { id: t.id, x: t.x, y: t.y, enemy: true, friend: false, r: 12 };
    const plan = okPlan(resolveCast(castIn(SKILLS[id], K.s, { x: t.x, y: t.y }, tu)));
    const { g } = castAim(map, SKILLS[id], 1, p.save.skills, K.s, plan, aimUnit(tu));
    assert.equal(g.err, BLOCKED, `${id}: превью через воду — не красное`);
    assert.equal(castSkill(w, p, id, t.x, t.y, t.id), BLOCKED, `${id}: сервер бьёт через воду`);
    dropMobs([t]);
    w.removePlayer(p.id);
  }
}
{
  // «Теневой шаг» к цели посреди воды: видимость есть, но ни одно из 8 мест вокруг (за спиной и по сторонам, тело цели + герой + 2 px) не проходимо —
  // «Нет места за спиной цели» и в превью (красное), и на сервере; случайные точки раздела 6 этот отказ не ловят
  const range = SKILLS.shadowstep.range ?? 0;
  const K = search((s) => {
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      for (let e = 40; e <= range; e += 8) {
        const t = { x: r01(s.x + Math.cos(a) * e), y: r01(s.y + Math.sin(a) * e) };
        if (!w.inTown(t.x, t.y) && lineClear(map, s.x, s.y, t.x, t.y) && !behindSpot(map, t.x, t.y, 0, 1, 10)) return { s, t };
      }
    }
    return null;
  });
  assert.ok(K, "нет цели без места за спиной");
  const p = hero(SKILLS.shadowstep, 1, K.s, false), t = dummy(K.t.x, K.t.y, 10);
  t.unit.dir = 0; // смотрит вниз — как в поиске места
  const tu: CastUnit = { id: t.id, x: t.x, y: t.y, enemy: true, friend: false, r: 10, dir: 0 };
  const rf = refUnit("shadowstep", K.s, { x: t.x, y: t.y, r: 10, fx: 0, fy: 1, boss: false });
  const { g } = castAim(map, SKILLS.shadowstep, 1, p.save.skills, K.s, okPlan(resolveCast(castIn(SKILLS.shadowstep, K.s, { x: t.x, y: t.y }, tu))), aimUnit(tu));
  assert.deepEqual([rf.err, g.err], [NO_BEHIND, NO_BEHIND], "«Теневой шаг»: эталон и превью — нет места за спиной");
  assert.equal(castSkill(w, p, "shadowstep", t.x, t.y, t.id), NO_BEHIND, "«Теневой шаг»: сервер — нет места за спиной");
  ust.behind++;
  dropMobs([t]);
  w.removePlayer(p.id);
}
assert.ok(ust.behind > 0, "отказ «Нет места за спиной цели» не проверен");
console.log(`ok рывки к цели: Рывок, прыжок, «Теневой шаг», «Хватка смерти» — превью = эталон = сервер (кастов ${ust.casts}, вне дальности ${ust.far}, без видимости ${ust.los}, ` +
  `через воду ${ust.blocked}, за спиной нет места ${ust.behind}, босс не притянут ${ust.boss}, всплеск ${ust.splash}, цепи ${ust.chains}); через воду — отказ`);

// ---------- 7. площадные вокруг себя: круг v(ранг).radius у героя = радиус эффекта сервера, задетые ----------
const NOVA: Record<string, string> = { frostnova: "frost", quake: "quake", tp_glare: "glare", mg_timewarp: "timewarp", cl_hymn: "hymn", bw_blood_circle: "pact" };
for (const [id, k] of Object.entries(NOVA)) {
  const def = SKILLS[id], p = hero(def, 1, O, false);
  caster = p;
  const plan = okPlan(resolveCast(castIn(def, O, { x: O.x + 50, y: O.y })));
  const { g } = castAim(map, def, 1, p.save.skills, O, plan);
  assert.ok(g.shape === "nova" && near(g.x, O.x) && near(g.y, O.y) && g.r === def.v(1).radius, `${id}: превью — круг ${g.r} у героя`);
  // манекены: случайные и на краю (радиус круга + радиус цели ∓ 4 px — внутри и снаружи)
  const edge = Array.from({ length: 8 }, (_, i) => { const r = RADII[i % RADII.length], a = (i / 8) * Math.PI * 2, d = g.r + r + (i % 2 ? 4 : -4); return { x: O.x + Math.cos(a) * d, y: O.y + Math.sin(a) * d, r }; });
  const fs = dummiesAt([...spotsFor(g, 8), ...edge]), as = aimSpec(def).who === "ally" ? spotsFor(g, 4).map((s) => ally(def, s)) : [];
  log.length = 0; hitIds.clear(); healed.clear();
  assert.equal(castSkill(w, p, id, O.x, O.y, null), null, `${id}: отказ`);
  run(1500);
  const f = mine(id).find((q) => q.t === "aoe" && q.k === k) as Extract<Fx, { t: "aoe" }> | undefined;
  assert.ok(f && near(f.x, O.x) && near(f.y, O.y) && near(f.r, g.r), `${id}: круг сервера ${JSON.stringify(f)}, превью r ${g.r}`);
  if (id === "frostnova" || id === "quake") assert.deepEqual(fs.filter((d) => hitIds.has(d.mob.id)).map((d) => d.u.id), shapeHits(map, g, fs.map((d) => d.u)), `${id}: задетые`);
  if (as.length) assert.deepEqual(as.filter((q) => healed.has(q.p.id)).map((q) => q.u.id), shapeHits(map, g, as.map((q) => q.u)), `${id}: союзники`);
  dropMobs(fs.map((d) => d.mob));
  for (const q of as) w.removePlayer(q.p.id);
  caster = null;
  w.removePlayer(p.id);
}
console.log("ok площадные вокруг себя: нова, сотрясение, ослепление, искажение времени, гимн, кровный круг — круг превью = круг сервера");

// ---------- 8. правила модулей, которые превью знает заранее: капкан (город, вода, соседний капкан по fx), рой без целей ----------
{
  const trapAt = (from: { x: number; y: number }, to: { x: number; y: number }, watch: TrapWatch, p: Player) =>
    preview(SKILLS.hr_trap, 1, p.save.skills, from, to, { traps: watch.live(w.time) });
  // город: точка в городе, видна от героя
  const T = search((s) => {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      for (let e = 40; e <= 240; e += 20) {
        const q = { x: s.x + Math.cos(a) * e, y: s.y + Math.sin(a) * e };
        if (isTownZone(zoneAtPx(map, q.x, q.y)) && walkable(map, q.x, q.y, 6) && lineClear(map, s.x, s.y, q.x, q.y)) return { s, q };
      }
    }
    return null;
  });
  assert.ok(T, "нет города рядом с проходимым местом");
  const W = search((s) => {
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      for (let e = 40; e <= 240; e += 10) {
        const q = { x: s.x + Math.cos(a) * e, y: s.y + Math.sin(a) * e };
        if (!w.inTown(q.x, q.y) && !walkable(map, q.x, q.y, 6) && lineClear(map, s.x, s.y, q.x, q.y)) return { s, q };
      }
    }
    return null;
  });
  assert.ok(W, "нет воды рядом");
  for (const [K, text] of [[T, "В городе ловушки ставить нельзя"], [W, "Сюда ловушку не поставить"]] as const) {
    const p = hero(SKILLS.hr_trap, 1, K.s, false), watch = new TrapWatch();
    assert.equal(trapAt(K.s, K.q, watch, p).g.err, text, `капкан: превью — «${text}»`);
    assert.equal(castSkill(w, p, "hr_trap", K.q.x, K.q.y, null), text, `капкан: сервер — «${text}»`);
    w.removePlayer(p.id);
  }
  // соседний капкан: клиент знает свои капканы по fx сервера (лужа «holy» ставит, удар r 52 снимает; сверх предела уходят старые)
  const p = hero(SKILLS.hr_trap, 1, O, false), watch = new TrapWatch(), r = trapRadius(1);
  // fx уходят клиентам пачкой в конце такта мира (World.update) — кормим наблюдателя после такта
  const feed = () => { run(50); watch.note(sent.splice(0), p.id, w.time, p.save.skills); };
  sent.length = 0;
  const cast = (x: number) => { place(p, O); const err = castSkill(w, p, "hr_trap", O.x + x, O.y, null); feed(); return err; };
  assert.equal(cast(100), null);
  assert.equal(watch.live(w.time).length, 1, "клиент увидел свой капкан");
  const crowded = trapAt(O, { x: O.x + 100 + 2 * r - 1, y: O.y }, watch, p).g;
  assert.equal(crowded.err, "Слишком близко к другому капкану", "превью: соседний капкан");
  assert.equal(cast(100 + 2 * r - 1), "Слишком близко к другому капкану", "сервер: соседний капкан");
  assert.equal(trapAt(O, { x: O.x + 100 + 2 * r + 1, y: O.y }, watch, p).g.err, null, "превью: дальше суммы радиусов — можно");
  // предел: у 1 ранга 2 капкана — третий снимает самый старый (и на сервере, и у клиента)
  assert.equal(cast(100 + 2 * r + 1), null);
  assert.equal(cast(100 + 4 * r + 2), null);
  assert.equal(watch.live(w.time).length, 2, "сверх предела ушёл старый капкан");
  assert.equal(trapAt(O, { x: O.x + 100, y: O.y }, watch, p).g.err, null, "превью: место старого капкана свободно");
  assert.equal(cast(100), null, "сервер: место старого капкана свободно");
  feed();
  // сработавший капкан снимается: моб вошёл — удар r 52 в точке капкана
  const foe = dummy(O.x + 100, O.y, 10);
  run(400);
  feed();
  assert.ok(!watch.live(w.time).some((t) => near(t.x, O.x + 100)), "сработавший капкан остался у клиента");
  assert.equal(trapAt(O, { x: O.x + 100, y: O.y }, watch, p).g.err, null);
  dropMobs([foe]);
  w.removePlayer(p.id);
  // капкан жив у клиента, пока сервер повторяет его лужу (раз в 7,5 с); с гибелью героя сервер гасит его капканы молча (archers.ts: w.gone) —
  // клиент чистит список (GameScene.updateAim: me.dead → clear), иначе после воскрешения на месте превью отказывало бы, а сервер ставил бы
  const q = hero(SKILLS.hr_trap, 1, O, false), wq = new TrapWatch();
  const feedQ = (ms = 50) => { for (let t = 0; t < ms; t += 50) { run(50); wq.note(sent.splice(0), q.id, w.time, q.save.skills); } };
  sent.length = 0;
  assert.equal(castSkill(w, q, "hr_trap", O.x + 100, O.y, null), null);
  feedQ(12000);
  assert.equal(wq.live(w.time).length, 1, "повтор лужи в 7,5 с держит капкан у клиента (без повтора ушёл бы на 9,5 с)");
  w.killPlayer(q);
  feedQ(300);
  wq.clear();
  q.dead = false; place(q, O); // воскрешение на месте
  assert.equal(trapAt(O, { x: O.x + 100 + r, y: O.y }, wq, q).g.err, null, "после гибели превью не держит старый капкан");
  assert.equal(castSkill(w, q, "hr_trap", O.x + 100 + r, O.y, null), null, "сервер: капкан погас с гибелью героя");
  feedQ(50);
  assert.equal(wq.live(w.time).length, 1);
  // и без очистки: повторов погасшего капкана нет — клиент сам отпускает его через срок лужи и запас (а не через весь срок капкана)
  w.killPlayer(q);
  feedQ(8000 + TRAP_GRACE + 7500);
  assert.equal(wq.live(w.time).length, 0, "погасший без fx капкан остался у клиента");
  w.removePlayer(q.id);
}
{
  // рой без целей: превью знает отказ (видимые враги в области), сервер — тот же; цели есть — n ближних к точке подсвечены
  const p = hero(SKILLS.dr_hexswarm, 1, O, false);
  caster = p;
  const to = { x: O.x + 150, y: O.y };
  assert.equal(preview(SKILLS.dr_hexswarm, 1, p.save.skills, O, to, { units: [] }).g.err, NO_TARGETS);
  assert.equal(castSkill(w, p, "dr_hexswarm", to.x, to.y, null), NO_TARGETS);
  const n = SKILLS.dr_hexswarm.v(1).n, fs = dummiesAt(Array.from({ length: n + 3 }, (_, i) => ({ x: to.x + 12 * i - 30, y: to.y + (i % 2 ? 20 : -20), r: 10 })));
  const { g, msg } = preview(SKILLS.dr_hexswarm, 1, p.save.skills, O, to, { units: fs.map((d) => d.u) });
  const want = shapeHits(map, g, fs.map((d) => d.u));
  assert.ok(!g.err && want.length === n, `рой: подсвечено ${want.length} из ${n}`);
  hitIds.clear();
  assert.equal(castSkill(w, p, "dr_hexswarm", msg.x, msg.y, null, msg), null);
  run(2000);
  assert.deepEqual(fs.filter((d) => hitIds.has(d.mob.id)).map((d) => d.u.id), want, "рой: задеты n ближних к точке");
  dropMobs(fs.map((d) => d.mob));
  caster = null;
  w.removePlayer(p.id);
}
console.log("ok правила модулей в превью: капкан — город, вода, соседний капкан (по fx сервера, предел, сработавший), рой — без целей и n ближних");

// ---------- 9. умения на цель: «далеко» — дальность + радиус цели (как сервер), видимость — по флагу los («Ворон» без неё) ----------
{
  const p = hero(SKILLS.aimed, 1, O, false), range = SKILLS.aimed.range!;
  for (const [r, d, far] of [[28, range + 27, false], [28, range + 29, true], [10, range + 9, false], [10, range + 11, true]] as const) {
    const t = dummy(O.x + d, O.y, r), tu: CastUnit = { id: t.id, x: t.x, y: t.y, enemy: true, friend: false, r };
    const plan = resolveCast(castIn(SKILLS.aimed, O, { x: t.x, y: t.y }, tu));
    assert.ok(plan.ok && plan.far === far, `прицельный выстрел: цель r ${r} в ${d} px — «далеко» ${far}`);
    place(p, O);
    const err = castSkill(w, p, "aimed", t.x, t.y, t.id);
    assert.equal(err, far ? "Цель слишком далеко" : null, `сервер: цель r ${r} в ${d} px`);
    run(600);
    dropMobs([t]);
  }
  w.removePlayer(p.id);
  // за стеной: «Прицельный выстрел» — отказ и в превью, «Ворон» (los: false) — каст в обоих
  for (const [id, want] of [["aimed", NO_LOS], ["dr_raven", null]] as const) {
    const q = hero(SKILLS[id], 1, WP.p, false), t = dummy(WP.q.x, WP.q.y, 10), tu: CastUnit = { id: t.id, x: t.x, y: t.y, enemy: true, friend: false, r: 10 };
    const plan = okPlan(resolveCast(castIn(SKILLS[id], WP.p, { x: t.x, y: t.y }, tu)));
    assert.equal(castAim(map, SKILLS[id], 1, q.save.skills, WP.p, plan, aimUnit(tu)).g.err, want, `${id}: превью за стеной`);
    assert.equal(castSkill(w, q, id, t.x, t.y, t.id), want, `${id}: сервер за стеной`);
    run(600);
    dropMobs([t]);
    w.removePlayer(q.id);
  }
}
// все умения на цель: цель за стеной в дальности, дальше дальности + радиус (видимость есть) и рядом. Отказ превью (видимость — по флагу los,
// «далеко») = отказ модуля сервера; рядом превью не отказывает, а сервер не отвечает видимостью или дальностью. Флаг los сверяется с модулями,
// а не со списком: уберут проверку видимости в модуле — превью станет отказывать зря (клиент не пошлёт каст), и тест упадёт
const UNIT = [...new Set((Object.keys(CLASSES) as (keyof typeof CLASSES)[]).flatMap((c) => activeSkills(c)).filter((s) => s.aim === "unit").map((s) => s.id))];
const hiddenAt = new Map<number, { s: { x: number; y: number }; t: { x: number; y: number } } | null>();
/** Пара «герой — цель» без прямой видимости, ближе maxD (у ближнего боя — за углом или тонкой стеной). */
function hiddenPair(maxD: number) {
  if (!hiddenAt.has(maxD)) hiddenAt.set(maxD, search((s) => {
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      for (let e = 24; e <= maxD; e += 4) {
        const t = { x: r01(s.x + Math.cos(a) * e), y: r01(s.y + Math.sin(a) * e) };
        if (!lineClear(map, s.x, s.y, t.x, t.y) && walkable(map, t.x, t.y, 12) && !w.inTown(t.x, t.y)) return { s, t };
      }
    }
    return null;
  }));
  return hiddenAt.get(maxD)!;
}
const u9 = { los: 0, nolos: 0, far: 0, near: 0 };
for (const id of UNIT) {
  const def = SKILLS[id], sp = aimSpec(def), range = def.range ?? 0, foeT = def.target === "enemy", r = foeT ? 28 : PLAYER_RADIUS;
  const hp = hiddenPair(range + r - 2);
  assert.ok(hp, `${id}: нет цели за стеной ближе ${range + r - 2} px`);
  const cases = [["за стеной", hp.s, hp.t], ["далеко", O, { x: O.x + range + r + 4, y: O.y }], ["рядом", O, { x: O.x + Math.max(30, range / 2), y: O.y }]] as const;
  for (const [kind, from, to] of cases) {
    const p = hero(def, 1, from, false);
    caster = p;
    let tu: CastUnit, drop: () => void;
    if (foeT) {
      const m = dummy(to.x, to.y, r);
      m.unit.dir = 0;
      tu = { id: m.id, x: m.x, y: m.y, enemy: true, friend: false, r, dir: 0 };
      drop = () => dropMobs([m]);
    } else {
      const a = ally(def, to);
      tu = { id: a.p.id, x: a.p.x, y: a.p.y, enemy: false, friend: true, r };
      drop = () => w.removePlayer(a.p.id);
    }
    const plan = okPlan(resolveCast(castIn(def, from, { x: tu.x, y: tu.y }, tu)));
    const { g } = castAim(map, def, 1, p.save.skills, from, plan, aimUnit(tu));
    const err = castSkill(w, p, id, tu.x, tu.y, tu.id);
    const ctx = `${id} (${kind}) из (${from.x}, ${from.y}) в (${tu.x}, ${tu.y})`;
    if (kind === "далеко") {
      assert.ok(plan.far && g.far, `${ctx}: превью не «далеко»`);
      assert.equal(err, "Цель слишком далеко", `${ctx}: сервер`);
      u9.far++;
    } else if (kind === "за стеной") {
      assert.ok(!plan.far && !g.far, `${ctx}: «далеко»`);
      assert.equal(g.err, sp.los ? sp.losErr : null, `${ctx}: превью без видимости`);
      assert.equal(err, g.err, `${ctx}: превью — ${g.err === null ? "каст" : `«${g.err}»`}, сервер — ${err === null ? "каст" : `«${err}»`}`);
      if (sp.los) u9.los++; else u9.nolos++;
    } else {
      assert.ok(!plan.far && !g.far && !g.err, `${ctx}: превью рядом отказало «${g.err}»`);
      assert.ok(err === null || !/видимост|прегражд|далеко/i.test(err), `${ctx}: сервер рядом отказал «${err}»`);
      u9.near++;
    }
    run(600);
    drop();
    caster = null;
    w.removePlayer(p.id);
  }
}
assert.ok(u9.los > 25 && u9.nolos >= 7 && u9.far === UNIT.length && u9.near === UNIT.length, `мало сверок умений на цель: ${JSON.stringify(u9)}`);
console.log(`ok умения на цель (${UNIT.length}): «далеко» — дальность + радиус цели, видимость по флагу los = проверка модуля (за стеной: отказ ${u9.los}, ` +
  `каст без флага ${u9.nolos}; далеко ${u9.far}; рядом без отказа ${u9.near})`);
// ---------- 10. союзники — по отбору модулей и по данным сцены (hitUnitsOf, как GameScene.hitUnits) ----------
// «Круг света» берёт не враждебных героев и питомцев не враждебных хозяев (в мирном городе — и чужой фракции); alliesAround («Эгида», кровный круг,
// «Сияние») — только своей фракции, «Эгида» — только героев. Скрытый враг и питомец врага не метятся никогда: метка выдала бы невидимку, а сервер
// их не лечит (скрытого союзника сервер лечит, но превью его не знает — он невидим и клиенту)
/** Сцена глазами клиента по серверу: скрыт — в скрытности (не я), враждебен — w.hostile, задевают площадные — враг и canAffect (без скрытых). */
function sceneViews(p: Player): HitView[] {
  const out: HitView[] = [];
  for (const q of w.players.values()) {
    const hostile = w.hostile(p, q), hidden = q !== p && w.stealthed(q);
    out.push({ id: q.id, x: q.x, y: q.y, r: PLAYER_RADIUS, dead: q.dead, unseen: hidden, hero: true, pet: false, boss: false,
      foe: hostile && !hidden && w.canAffect(p, q), hostile, kin: q.faction === p.faction, owner: "" });
  }
  for (const pet of w.pets.values())
    out.push({ id: pet.id, x: pet.x, y: pet.y, r: PLAYER_RADIUS, dead: pet.dead, unseen: false, hero: false, pet: true, boss: false, foe: false, hostile: false, kin: false, owner: pet.owner.id });
  return out;
}
/** Герой другой фракции, чем класс cls (на половине здоровья). */
function stranger(cls: keyof typeof CLASSES, at: { x: number; y: number }): Player {
  const oc = (Object.keys(CLASSES) as (keyof typeof CLASSES)[]).find((c) => CLASSES[c].faction !== CLASSES[cls].faction)!;
  const q = new Player(`st${++uid}`, `Чужак${uid}`, newSave(oc, at), () => {});
  w.addPlayer(q);
  place(q, at);
  q.unit.hp = Math.round(q.unit.maxHp / 2);
  return q;
}
/** Питомец героя в точке (на половине здоровья — лечение видно по fx). */
function petOf(owner: Player, at: { x: number; y: number }): Pet {
  const pet = new Pet(Object.values(PETS)[0], owner, 1);
  pet.unit.x = at.x; pet.unit.y = at.y; pet.unit.hp = Math.round(pet.unit.maxHp / 2);
  w.pets.set(pet.id, pet);
  w.state.mobs.set(pet.id, pet.unit);
  return pet;
}
/** Сцена на открытом месте O: герой в O, союзники и чужаки у C = O + (120, 0) — внутри круга, «Эгиды», луча и новы, всё видно от героя. */
const AROUND = [[20, 0], [-20, 10], [0, -20], [25, 25], [-25, -25], [0, 30], [5, -30]];
// truce — чужая фракция без вражды (рейд; мирных городов на нынешней карте нет): в тесте — команда чужака (World.hostile: team ≠ 0 — не враги)
const al = { cmp: 0, truce: 0 };
for (const kind of ["pvp", "truce"] as const) {
  const S = O;
  for (const id of ["circle", "cl_aegis", "cl_radiance", "bw_blood_circle"]) {
    const def = SKILLS[id], p = hero(def, 1, S, false), C = { x: S.x + 120, y: S.y };
    caster = p;
    clearMobs();
    const at = (i: number) => ({ x: C.x + AROUND[i][0], y: C.y + AROUND[i][1] });
    const kin = ally(def, at(0)).p, other = stranger(def.cls, at(1));
    if (kind === "truce") other.team = 7;
    const spy = kind === "pvp" ? stranger(def.cls, at(2)) : null;
    if (spy) spy.stealthUntil = w.time + 60000;
    assert.equal(w.hostile(p, other), kind === "pvp", `${id}: вражда чужака в сцене ${kind}`);
    const pets = { kin: petOf(kin, at(3)), other: petOf(other, at(4)), mine: petOf(p, at(5)), spy: spy ? petOf(spy, at(6)) : null };
    const units = hitUnitsOf(sceneViews(p), p.id);
    const plan = okPlan(resolveCast(castIn(def, S, C)));
    const { g, msg, hits } = castAim(map, def, 1, p.save.skills, S, plan, undefined, { units });
    assert.ok(!g.err, `${id} (${kind}): превью отказало «${g.err}»`);
    log.length = 0; healed.clear();
    assert.equal(castSkill(w, p, id, msg.x, msg.y, null, msg), null, `${id} (${kind}): сервер отказал`);
    // задетые сервером: лечение героев (w.heal) и питомцев (fx dmg heal), отметки кровного круга и «Сияния» (buff), щиты «Эгиды»
    const got = new Set<string>(healed);
    for (const f of mine(id)) if ((f.t === "dmg" && f.heal) || (f.t === "buff" && (f.k === "renew" || f.k === "heal"))) got.add(f.id);
    for (const q of w.players.values()) if (q.shieldBy === p && q.shieldUntil > w.time) got.add(q.id);
    got.delete(p.id);
    const ctx = `${id} (${kind})`;
    // союзники из «кого заденет» («Сияние» ещё и бьёт врагов в луче — их сверяет раздел 2)
    const mates = hits.filter((h) => units.some((u) => u.id === h && u.ally));
    assert.deepEqual([...mates].sort(), [...got].sort(), `${ctx}: превью по данным сцены ${mates}, сервер ${[...got]}`);
    // правила словами: скрытый враг и питомец врага — никогда; чужая фракция без вражды — только «Круг света»; «Эгида» — без питомцев
    assert.ok(!spy || !hits.includes(spy.id), `${ctx}: метка у скрытого врага`);
    const has = (x: { id: string } | null) => !!x && mates.includes(x.id);
    assert.ok(!has(spy) && !has(pets.spy), `${ctx}: метка у скрытого врага или его питомца`);
    assert.equal(has(other), kind === "truce" && id === "circle", `${ctx}: чужая фракция`);
    assert.equal(has(pets.other), kind === "truce" && id === "circle", `${ctx}: питомец чужой фракции`);
    assert.ok(has(kin), `${ctx}: союзник своей фракции`);
    assert.equal(has(pets.kin) && has(pets.mine), id !== "cl_aegis", `${ctx}: питомцы своих («Эгида» — только герои)`);
    al.cmp++;
    if (kind === "truce") al.truce++;
    run(200);
    for (const q of [kin, other, spy]) if (q) w.removePlayer(q.id);
    caster = null;
    w.removePlayer(p.id);
  }
}
console.log(`ok союзники по правилам сервера (данные сцены, hitUnitsOf): «Круг света», «Эгида», «Сияние», кровный круг — ${al.cmp} сцен (чужая фракция без вражды — ${al.truce}): ` +
  "скрытый враг и питомец врага не метятся, чужая фракция без вражды — только «Круг света», «Эгида» — без питомцев");
console.log("skill-shape: ok");
process.exit(0);
