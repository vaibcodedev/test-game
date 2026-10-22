/**
 * Геометрия умений (задача 133, шаг 1; docs/aim-and-pick.md, «Шаг 4. Проверка»), без сети и браузера: превью (castResolve → castAim, shared/skillShape.ts)
 * и серверный каст (castSkill в мире) дают одну точку, форму и размер, список задетых и решение (каст или отказ). Все прицельные умения (ground, dir, dash),
 * ранги 1 и 5 (на 5 — с пассивками из plus), случайные точки у стен подземелий и у воды. Обе стороны зовут одну функцию (placeSkill), поэтому превью
 * сверяется ещё и с независимым эталоном — формулами до шага 1 (HEAD): прижим точки, точка шара, луч до стены, рывок до препятствия на длину по рангу.
 * Отдельно: допуск точки ground у каждого площадного (сервер отстал на 20 px), угол и вектор с клиента от позиции сервера (и из очереди), шар по цели
 * при сдвиге сервера, мерцание 5 ранга и рывок к воде, кого задевают линии (края коридоров), решение пользователя 3 (метеор, «Круг света»,
 * «Чумной туман», «Град стрел» — только в прямой видимости) и бот-лекарь арены, когда самый раненый союзник за стеной.
 * Расхождения шага 2 (правила модулей, стена огня, линии и веера) — в таблицах STEP2_* с причиной: шаг 2 их убирает.
 * Запуск: npx tsx tests/skill-shape.ts
 */
import assert from "node:assert/strict";
import { CELL_WALL, lineClear, walkable, type WorldMap } from "../shared/map";
import { PLAYER_RADIUS, TILE } from "../shared/constants";
import { CLASSES } from "../shared/classes";
import { MOBS } from "../shared/mobs";
import { activeSkills, SKILLS, type SkillDef } from "../shared/skills";
import { aimSpec, DASH_MIN, GROUND_TOL, groundPoint, HIT_EDGE, NO_LOS, placeSkill, RAY_MIN, shapeHits, shapeSize, skillDims, type HitUnit, type Placed } from "../shared/skillShape";
import { castAim, resolveCast, type CastIn } from "../client/src/game/castResolve";
import type { Fx } from "../shared/protocol";
import { World, type Actor, type HitOpts } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { Mob } from "../server/src/game/Mob";
import { castSkill } from "../server/src/game/skills";
import { requestSkill } from "../server/src/game/skillQueue";
import { botThink } from "../server/src/arena/bots";
import { WorldState } from "../server/src/rooms/schema";

// ---------- шаг 2: известные расхождения (умение → причина) ----------
/** Отказы модулей, которых превью шага 1 не предсказывает (сервер отказал, превью — «каст»). */
const STEP2_REFUSE: Record<string, string[]> = {
  hr_trap: ["В городе ловушки ставить нельзя", "Сюда ловушку не поставить", "Слишком близко к другому капкану"], // trapRadius, проходимость, город — шаг 2
  dr_hexswarm: ["В области нет целей"], // подсветка n целей роя — шаг 2
  rv_throw: ["Путь прегражден"], // топор — reachable, а не луч до стены; превью линии без отказа — шаг 2
};
/** Задетые: eq — ровно круг превью (enemiesInCircle по точке и радиусу), sub — часть круга (случайные удары, удар 70 внутри ауры 130, капкан — первый вошедший, рой — n ближних);
 *  skip — не сверяем: союзники (лечение и щиты), стена огня (капсула поперёк прицела — шаг 2), призыв. */
const HITS: Record<string, "eq" | "sub" | "skip"> = {
  meteor: "eq", rain: "eq", wl_doom: "eq", dr_veil: "eq", bw_blood_burst: "eq", bw_crimson_pool: "eq", wl_skeletons: "eq",
  mg_storm: "sub", tp_banner: "sub", hr_trap: "sub", dr_hexswarm: "sub",
  circle: "skip", cl_aegis: "skip", mg_firewall: "skip", wl_demon: "skip",
};
/** Размер круга превью ≠ радиус эффекта на сервере: стена огня (отрезок v.len поперёк прицела — шаг 2), метка призыва демона. */
const STEP2_SIZE = new Set(["mg_firewall", "wl_demon"]);
/** Линии: point — точка сервера (взрыв шара, конец луча) = точка превью; angle — сверяем только угол (полоса до reachable, веер, конус — шаг 2). */
const LINE: Record<string, "point" | "angle"> = { fireball: "point", hr_pierce: "point", volley: "angle", as_fan: "angle", cl_radiance: "angle", rv_throw: "angle" };

// ---------- мир ----------
const sent: Fx[] = [];
const w = new World(new WorldState(), (type, msg) => { if (type === "fx") sent.push(...(msg as Fx[])); });
const map: WorldMap = w.map;
const clearMobs = (keep?: Set<string>) => { for (const m of [...w.mobs.values()]) if (!keep?.has(m.id)) w.removeMob(m); };
clearMobs();

/** Журнал fx с умением, которое шло в момент emit (w.fxSkill), и удары героя (src — текущий кастер). */
const log: (Fx & { s?: string })[] = [];
const emit0 = w.emit.bind(w) as (...a: unknown[]) => unknown;
(w as unknown as { emit: (...a: unknown[]) => unknown }).emit = (f: unknown, ...rest: unknown[]) => { log.push({ ...(f as Fx), s: w.fxSkill ?? undefined }); return emit0(f, ...rest); };
let caster: Player | null = null;
const hitIds = new Set<string>();
const hitEx0 = w.hitEx.bind(w);
w.hitEx = (src: Actor, dst: Actor, o?: HitOpts) => { if (caster && src === caster) hitIds.add(dst.id); return hitEx0(src, dst, o); };
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

// ---------- кастер и манекены ----------
let uid = 0;
function hero(def: SkillDef, rank: number, at: { x: number; y: number }, passives: boolean): Player {
  const save = newSave(def.cls, at);
  save.level = 60;
  save.skills = { [def.id]: rank };
  if (passives) for (const pid of Object.values(aimSpec(def).plus)) save.skills[pid] = SKILLS[pid].maxRank;
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
const RADII = [10, 16, 28];
/** Координаты манекена — сразу в десятых пикселя: World.moveMob округляет позицию моба до 0,1 px даже при скорости 0, и манекен на краю круга
 *  или у угла стены «переезжал» бы через границу (тест падал примерно раз в 15–20 прогонов). */
const r01 = (n: number) => Math.round(n * 10) / 10;
/** Неподвижный моб без агро: скорость 0, не бродит. */
function dummy(x: number, y: number, r: number): Mob {
  const mob = w.addMob(new Mob(w.uid("m"), { ...MOBS.goblin, speed: 0, aggro: 0, radius: r }, 20, { x: r01(x), y: r01(y) }));
  mob.wanderAt = Infinity;
  return mob;
}
/** Манекены вокруг точки: внутри круга, на кайме и снаружи. */
function dummies(g: Placed, n: number): { mob: Mob; u: HitUnit }[] {
  const out: { mob: Mob; u: HitUnit }[] = [];
  for (let i = 0; i < n; i++) {
    const r = RADII[i % RADII.length], a = rnd() * Math.PI * 2, d = rnd() * (g.r + r + 30);
    const mob = dummy(g.x + Math.cos(a) * d, g.y + Math.sin(a) * d, r);
    out.push({ mob, u: { id: mob.id, x: mob.x, y: mob.y, r } });
  }
  return out;
}
const dropMobs = (ms: Mob[]) => { for (const m of ms) if (w.mobs.has(m.id)) w.removeMob(m); };

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
const mine = (id: string) => log.filter((f) => f.s === id);
/** fx умения с центром в точке (aoe, tele, hazard): где сервер поставил круг. */
const fxAt = (id: string, x: number, y: number) => mine(id).filter((f) => (f.t === "aoe" || f.t === "tele" || f.t === "hazard") && near(f.x, x) && near(f.y, y));
const projOf = (id: string) => mine(id).find((f) => f.t === "proj") as Extract<Fx, { t: "proj" }> | undefined;
/** Вход resolveCast: курсор над картой, без интерфейса; hover — юнит под курсором. */
const castIn = (def: SkillDef, from: { x: number; y: number }, cursor: { x: number; y: number }, hover: CastIn["hover"] = null): CastIn => ({
  skill: { aim: def.aim!, target: def.target, range: def.range }, self: { id: "me", x: from.x, y: from.y }, cursor, overUi: false,
  hover, selected: null, units: hover ? [hover] : [], facing: { x: 0, y: 1 }, alt: false, hoverCast: true, autoTarget: false,
});
/** Превью: план по курсору (без наведения и интерфейса) и castAim от позиции героя — как GameScene.castNow. */
function preview(def: SkillDef, rank: number, ranks: Record<string, number>, from: { x: number; y: number }, cursor: { x: number; y: number }) {
  const plan = resolveCast(castIn(def, from, cursor));
  assert.ok(plan.ok, `${def.id}: план не построен`);
  return castAim(map, def, rank, ranks, from, plan);
}

// ---------- эталон: формулы до шага 1 (HEAD), без shared/skillShape.ts ----------
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
/** Луч HEAD («Пронзающая стрела», archers.ts): по 10 px до первой стены. */
function refRay(x0: number, y0: number, a: number, range: number): number {
  let len = 0;
  for (let d = 10; d <= range; d += 10) {
    if (!lineClear(map, x0, y0, x0 + Math.cos(a) * d, y0 + Math.sin(a) * d)) break;
    len = d;
  }
  return len;
}
/** Куда ляжет умение по курсору (без наведения) по формулам HEAD: ground — курсор, прижатый к дальности; шар и линии — по направлению на курсор
 *  на расстоянии до него, не дальше дальности; луч — до стены, короче 30 — отказ; рывок — до препятствия на v(ранг).dist, короче 16 — отказ.
 *  Видимость — решение пользователя 3: у ground и шара точка вне прямой видимости — отказ. */
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
  if (def.id === "hr_pierce") { const len = refRay(from.x, from.y, a, full); return { ...at(len), err: len < 30 ? NO_LOS : null }; }
  const q = at(Math.min(full, dist || full));
  return { ...q, err: def.id === "fireball" && !seen(q) ? NO_LOS : null };
}
/** Радиус круга в HEAD: v(ранг).radius, у капкана — плюс «Ловец» (archers.ts trapRadius). */
const refRadius = (def: SkillDef, rank: number, ranks: Record<string, number>) =>
  def.v(rank).radius + (def.id === "hr_trap" && ranks.hr_trapper ? SKILLS.hr_trapper.v(ranks.hr_trapper).radius : 0);

// ---------- 1. размеры по рангу и пассивкам, поля данных ----------
assert.equal(shapeSize(SKILLS.blink, 1), 200); assert.equal(shapeSize(SKILLS.blink, 5), 280, "мерцание на 5 ранге длиннее на 80 px");
assert.equal(shapeSize(SKILLS.roll, 5), 170); assert.equal(shapeSize(SKILLS.meteor, 1), 110); assert.equal(shapeSize(SKILLS.mg_firewall, 3), 90);
assert.equal(shapeSize(SKILLS.fireball, 1), SKILLS.fireball.range, "линия — во всю дальность");
const trap1 = SKILLS.hr_trap.v(1).radius, trapper = SKILLS.hr_trapper.v(SKILLS.hr_trapper.maxRank).radius;
assert.ok(trapper > 0, "«Ловец» прибавляет радиус капкана");
assert.equal(shapeSize(SKILLS.hr_trap, 1), trap1, "без пассивок");
assert.equal(shapeSize(SKILLS.hr_trap, 1, { hr_trap: 1, hr_trapper: SKILLS.hr_trapper.maxRank }), trap1 + trapper, "пассивка из plus");
assert.equal(skillDims(SKILLS.hr_trap, 1, { hr_trapper: 0 }).radius, trap1);
assert.equal(SKILLS.hr_pierce.v(1).width, 28, "v.width — полная ширина (hr_pierce: коридор ±14)");
assert.equal(SKILLS.rv_throw.v(1).width, 40);
// постоянные — значения HEAD: рывок короче 16 и луч короче 30 — отказ; допуск точки ground — 32
assert.deepEqual([GROUND_TOL, DASH_MIN, RAY_MIN], [32, 16, 30], "GROUND_TOL, DASH_MIN, RAY_MIN");
let aimed = 0;
for (const cls of Object.keys(CLASSES) as (keyof typeof CLASSES)[]) for (const s of activeSkills(cls)) {
  const sp = aimSpec(s);
  if (s.aim === "ground") { aimed++; assert.ok(sp.shape === "circle" && sp.los && sp.oor === "clamp", `${s.id}: ground — круг, видимость, прижим`); assert.ok(shapeSize(s, 1) > 0, `${s.id}: радиус`); }
  if (s.aim === "dir") { aimed++; assert.equal(sp.shape, "line", s.id); assert.equal(sp.oor, "clamp", s.id); assert.equal(sp.home, s.id === "fireball", `${s.id}: самонаведение — только у шара`); }
  if (s.aim === "dash") { aimed++; assert.equal(sp.shape, "dash", s.id); assert.ok(shapeSize(s, 1) > 0, `${s.id}: длина рывка`); }
  if (s.aim === "unit") assert.equal(sp.oor, "walk", s.id);
}
assert.equal(aimSpec(SKILLS.blink).stuck, STUCK.blink); assert.equal(aimSpec(SKILLS.roll).stuck, STUCK.roll);
assert.ok(aimSpec(SKILLS.mg_firewall).turn && aimSpec(SKILLS.hr_pierce).ray);
// допуск: клиент прижимает ровно к дальности, сервер — к дальности + GROUND_TOL
assert.deepEqual(groundPoint({ x: 0, y: 0 }, { x: 500, y: 0 }, 340), { x: 340, y: 0 });
assert.deepEqual(groundPoint({ x: 0, y: 0 }, { x: 360, y: 0 }, 340, GROUND_TOL), { x: 360, y: 0 });
assert.deepEqual(groundPoint({ x: 0, y: 0 }, { x: 500, y: 0 }, 340, GROUND_TOL), { x: 340 + GROUND_TOL, y: 0 });
console.log(`ok размеры и поля прицела: ${aimed} прицельных умений`);

// ---------- 2. превью = эталон HEAD = сервер: случайные точки, ранги 1 и 5 ----------
const ids = [...new Set((Object.keys(CLASSES) as (keyof typeof CLASSES)[]).flatMap((c) => activeSkills(c)).filter((s) => s.aim === "ground" || s.aim === "dir" || s.aim === "dash").map((s) => s.id))];
const stat = { casts: 0, refused: 0, los: 0, stuck: 0, step2: 0, hitsEq: 0, hitsSub: 0, mobs: 0, stopped: 0 };
const step2Seen = new Map<string, number>();
for (const id of ids) {
  const def = SKILLS[id], sp = aimSpec(def);
  for (const rank of [1, Math.min(5, def.maxRank)]) {
    for (const at of SPOTS) {
      const p = hero(def, rank, at, rank > 1);
      caster = p;
      const size = sp.shape === "dash" ? shapeSize(def, rank, p.save.skills) : (def.range ?? 300);
      const a = rnd() * Math.PI * 2, dist = rnd() * size * 1.5;
      const cursor = { x: at.x + Math.cos(a) * dist, y: at.y + Math.sin(a) * dist };
      const { g, msg } = preview(def, rank, p.save.skills, at, cursor);
      const ctx = `${id} ранг ${rank} из (${at.x}, ${at.y}) в (${cursor.x.toFixed(0)}, ${cursor.y.toFixed(0)})`;
      // эталон HEAD: та же точка и тот же отказ, размер — по рангу и пассивкам
      const rf = refPlace(def, rank, at, cursor);
      assert.ok(near(g.x, rf.x) && near(g.y, rf.y), `${ctx}: превью в (${g.x.toFixed(2)}, ${g.y.toFixed(2)}), эталон HEAD — (${rf.x.toFixed(2)}, ${rf.y.toFixed(2)})`);
      assert.equal(g.err, rf.err, `${ctx}: отказ превью «${g.err}», эталон HEAD — «${rf.err}»`);
      if (g.shape === "circle" && !STEP2_SIZE.has(id)) assert.equal(g.r, refRadius(def, rank, p.save.skills), `${ctx}: радиус`);
      if (g.shape === "dash") assert.equal(g.r, def.v(rank).dist, `${ctx}: длина рывка по рангу`);
      const dm = g.shape === "circle" && !g.err ? dummies(g, 8) : [];
      const keep = new Set(dm.map((d) => d.mob.id));
      clearMobs(keep);
      log.length = 0; hitIds.clear();
      const err = castSkill(w, p, id, msg.x, msg.y, null, msg);
      run(3000);
      // решение
      if (g.err) {
        assert.equal(err, g.err, `${ctx}: превью отказало «${g.err}», сервер — ${err === null ? "каст" : `«${err}»`}`);
        stat.refused++;
        if (g.err === NO_LOS) stat.los++; else stat.stuck++;
      } else if (err !== null) {
        assert.ok(STEP2_REFUSE[id]?.includes(err), `${ctx}: превью — каст, сервер отказал «${err}»`);
        stat.step2++; step2Seen.set(`${id}: ${err}`, (step2Seen.get(`${id}: ${err}`) ?? 0) + 1);
      } else {
        stat.casts++;
        const fx = mine(id);
        if (g.shape === "circle") {
          // точка и размер: fx умения в центре круга превью, радиус — по рангу и пассивкам
          const at2 = fxAt(id, g.x, g.y);
          assert.ok(at2.length, `${ctx}: нет эффекта в точке превью (${g.x.toFixed(1)}, ${g.y.toFixed(1)}): ${JSON.stringify(fx.slice(0, 4))}`);
          if (!STEP2_SIZE.has(id)) assert.ok(at2.some((f) => near((f as { r: number }).r, g.r)), `${ctx}: радиус превью ${g.r}, на сервере ${at2.map((f) => (f as { r: number }).r).join(", ")}`);
          // задетые: манекены не двигались (скорость 0, не бродят, координаты в десятых) — круг превью по их позициям
          assert.deepEqual(dm.filter((d) => d.mob.x !== d.u.x || d.mob.y !== d.u.y).map((d) => d.u.id), [], `${ctx}: манекены сдвинулись`);
          const mode = HITS[id] ?? "skip", want = shapeHits(map, g, dm.map((d) => d.u))!, got = dm.filter((d) => hitIds.has(d.mob.id)).map((d) => d.u.id);
          stat.mobs += dm.length;
          if (mode === "eq") { assert.deepEqual(got, want, `${ctx}: задетые сервером ≠ круг превью`); stat.hitsEq++; }
          else if (mode === "sub") { for (const h of got) assert.ok(want.includes(h), `${ctx}: сервер задел ${h} вне круга превью`); stat.hitsSub++; }
        } else if (g.shape === "dash") {
          if (g.len < Math.min(g.r, Math.hypot(g.tx - at.x, g.ty - at.y)) - 9) stat.stopped++; // рывок остановила вода, дерево или стена
          const b = fx.find((f) => f.t === "blink") as Extract<Fx, { t: "blink" }> | undefined;
          assert.ok(b && near(b.x1, g.x) && near(b.y1, g.y), `${ctx}: рывок сервера в ${b && `(${b.x1}, ${b.y1})`}, превью — (${g.x}, ${g.y})`);
          assert.ok(near(p.unit.x, g.x) && near(p.unit.y, g.y), `${ctx}: герой не там, где показало превью`);
        } else if (g.shape === "line") {
          const projs = fx.filter((f) => f.t === "proj") as Extract<Fx, { t: "proj" }>[];
          if (LINE[id] === "point") {
            const pr = projs[0];
            assert.ok(pr && near(pr.tx, g.x) && near(pr.ty, g.y), `${ctx}: снаряд в ${pr && `(${pr.tx}, ${pr.ty})`}, превью — (${g.x.toFixed(2)}, ${g.y.toFixed(2)})`);
          } else {
            let sa: number | null = null;
            const cone = fx.find((f) => f.t === "cone") as Extract<Fx, { t: "cone" }> | undefined, chain = fx.find((f) => f.t === "chain") as Extract<Fx, { t: "chain" }> | undefined;
            if (cone) sa = cone.a;
            else if (id === "volley" && projs.length > 1) {
              const a0 = Math.atan2(projs[0].ty - at.y, projs[0].tx - at.x), a1 = Math.atan2(projs[projs.length - 1].ty - at.y, projs[projs.length - 1].tx - at.x);
              sa = a0 + (((a1 - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / 2;
            } else if (chain && Math.hypot(chain.pts[2] - chain.pts[0], chain.pts[3] - chain.pts[1]) > 1) sa = Math.atan2(chain.pts[3] - chain.pts[1], chain.pts[2] - chain.pts[0]);
            else if (projs[0] && Math.hypot(projs[0].tx - at.x, projs[0].ty - at.y) > 1) sa = Math.atan2(projs[0].ty - at.y, projs[0].tx - at.x);
            if (sa !== null) assert.ok(angDiff(sa, g.a) < 1e-6, `${ctx}: угол сервера ${sa.toFixed(4)}, превью ${g.a.toFixed(4)}`);
          }
        }
      }
      dropMobs(dm.map((d) => d.mob));
      caster = null;
      w.removePlayer(p.id);
    }
  }
}
assert.ok(stat.los > 0 && stat.stopped > 0, `точки не проверили препятствия: отказов по видимости ${stat.los}, рывков, остановленных препятствием, ${stat.stopped}`);
assert.ok(stat.hitsEq > 20 && stat.mobs > 200, `мало сверок задетых: ${stat.hitsEq}`);
console.log(`ok превью = эталон HEAD = сервер: ${ids.length} умений × 2 ранга × ${SPOTS.length} точек — кастов ${stat.casts}, отказов по превью ${stat.refused} (видимость ${stat.los}, луч и рывок ${stat.stuck}), ` +
  `рывков до препятствия ${stat.stopped}, задетые сверены ${stat.hitsEq} раз точно и ${stat.hitsSub} — подмножеством (${stat.mobs} манекенов)`);
if (step2Seen.size) console.log(`   шаг 2 (отказы модулей, превью их пока не знает): ${[...step2Seen].map(([k, n]) => `${k} ×${n}`).join("; ")}`);

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
  const plan = resolveCast(castIn(SKILLS.fireball, K.c, { x: foe.x, y: foe.y }, { id: foe.id, x: foe.x, y: foe.y, enemy: true, friend: false }));
  assert.ok(plan.ok && plan.target === foe.id, "курсор на враге — шар по нему");
  // как GameScene.aimOf: цель плана — для самонаведения (радиус — как у героя)
  const { g, msg } = castAim(map, SKILLS.fireball, 1, p.save.skills, K.c, plan, { x: plan.x, y: plan.y, r: HIT_EDGE });
  assert.ok(!g.err && near(g.x, foe.x) && near(g.y, foe.y), `превью шара по цели: (${g.x}, ${g.y}) «${g.err}»`);
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
  const b = mine("blink").find((f) => f.t === "blink") as Extract<Fx, { t: "blink" }>;
  assert.ok(near(b.x1, O.x + 150) && near(b.y1, O.y + 30), `мерцание не по вектору: (${b.x1}, ${b.y1})`);
  // без вектора (боты, старый клиент) — к точке, как раньше
  place(p, O);
  log.length = 0;
  assert.equal(castSkill(w, p, "blink", O.x - 120, O.y, null), null);
  const b2 = mine("blink").find((f) => f.t === "blink") as Extract<Fx, { t: "blink" }>;
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
{
  // рывок к воде останавливается у берега: последний шаг, где герой стоит; следующий — в воде или деревьях (видимость есть — не стена)
  const dist = shapeSize(SKILLS.blink, 1);
  const K = search((s) => {
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2, cur = { x: s.x + Math.cos(a) * 300, y: s.y + Math.sin(a) * 300 };
      const dx = cur.x - s.x, dy = cur.y - s.y, d = Math.hypot(dx, dy);
      for (let st = 8; st <= dist; st += 8) {
        const x = s.x + (dx / d) * st, y = s.y + (dy / d) * st;
        if (!lineClear(map, s.x, s.y, x, y)) break;
        if (!walkable(map, x, y, PLAYER_RADIUS)) { if (st >= 32) return { s, cur, dw: st, x, y }; break; }
      }
    }
    return null;
  });
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
for (const [id, half, along] of [["hr_pierce", 14, 120], ["rv_throw", 20, 100]] as const) {
  // «Пронзающая стрела» — ±14 + радиус цели (v.width — полная ширина 28), «Метнуть топор» — ±20 + радиус (40): внутри на 1 px задеты, снаружи — нет
  const def = SKILLS[id], p = hero(def, 1, O, false), r = 10;
  caster = p;
  const inner = [-1, 1].map((s) => dummy(O.x + along, O.y + s * (half + r - 1), r));
  const outer = [-1, 1].map((s) => dummy(O.x + along + 30, O.y + s * (half + r + 1), r));
  const { g, msg } = preview(def, 1, p.save.skills, O, { x: O.x + 300, y: O.y });
  assert.ok(!g.err && near(g.a, 0), `${id}: превью на восток`);
  hitIds.clear();
  assert.equal(castSkill(w, p, id, msg.x, msg.y, null, msg), null, `${id}: отказ на открытом месте`);
  run(1000);
  assert.deepEqual([...inner, ...outer].map((m) => hitIds.has(m.id)), [true, true, false, false], `${id}: коридор ±${half} + радиус цели`);
  dropMobs([...inner, ...outer]);
  caster = null;
  w.removePlayer(p.id);
}
console.log("ok линии: края коридоров «Пронзающей стрелы» и «Метнуть топор»");

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
  const ally = (at: { x: number; y: number }, hp: number) => { const q = hero(SKILLS.heal, 1, at, false); q.unit.hp = Math.round(q.unit.maxHp * hp); return q; };
  const seenAt: { x: number; y: number }[] = [];
  for (let k = 0; k < 32 && seenAt.length < 2; k++) {
    const a = (k / 32) * Math.PI * 2, q = { x: WP.p.x + Math.cos(a) * 60, y: WP.p.y + Math.sin(a) * 60 };
    if (lineClear(map, WP.p.x, WP.p.y, q.x, q.y) && Math.hypot(q.x - WP.q.x, q.y - WP.q.y) > 60 && !seenAt.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 30)) seenAt.push(q);
  }
  assert.equal(seenAt.length, 2, "нет видимых мест рядом с лекарем");
  const hidden = ally(WP.q, 0.3), vis = ally(seenAt[0], 0.5);
  const foe = hero(SKILLS.fireball, 1, { x: WP.p.x + 400, y: WP.p.y }, false); // цель бота — дальше 300 px, в союзники не попадает
  botThink(w, bot, [foe]);
  assert.ok(hidden.shieldUntil > w.time, "бот-лекарь застрял на «Круге света» за стеной: самый раненый без щита");
  const vis2 = ally(seenAt[1], 0.6);
  bot.cds.clear(); bot.gcdUntil = 0;
  botThink(w, bot, [foe]);
  assert.ok((bot.cds.get("circle") ?? 0) > w.time, "два видимых раненых — бот не поставил «Круг света»");
  for (const q of [bot, hidden, vis, vis2, foe]) w.removePlayer(q.id);
}
console.log("ok решение 3: метеор, «Круг света», «Чумной туман», «Град стрел» за стеной — отказ сервера и красное превью; бот-лекарь не стоит на отказе");
console.log("skill-shape: ok");
process.exit(0);
