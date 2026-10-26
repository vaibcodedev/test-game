/** Выбор адресата каста и поля прицела умений (задача 115, шаг 6; задача 133, шаг 1 — точка по ногам врага, «далеко» только у умений на цель, размеры по рангу;
 *  шаг 2 — «далеко» = дальность + радиус цели, радиус юнита как у сервера, свои капканы по fx для превью капкана);
 *  выбор цели мышью: допуск, магнит, порядок (задача 134, шаг 1). Геометрия превью против сервера — tests/skill-shape.ts. Запуск: npx tsx tests/cast-resolve.ts */
import assert from "node:assert/strict";
import {
  clampToRange, hitUnitsOf, pickOrder, pickReach, PICK_MAGNET, PICK_TOL, resolveCast, TRAP_GRACE, TrapWatch, unitRadius,
  type CastIn, type CastUnit, type HitView, type PickCtx, type PickKind, type PickOut, type PickSource,
} from "../client/src/game/castResolve";
import { activeSkills, SKILLS } from "../shared/skills";
import { aimSpec, shapeSize, type HitUnit } from "../shared/skillShape";
import { CLASSES } from "../shared/classes";
import { PLAYER_RADIUS } from "../shared/constants";
import { MOBS } from "../shared/mobs";
import type { Fx } from "../shared/protocol";

const u = (id: string, x: number, y: number, enemy: boolean, extra: Partial<CastUnit> = {}): CastUnit => ({ id, x, y, enemy, friend: !enemy, ...extra });
const base = (over: Partial<CastIn>): CastIn => ({
  skill: { aim: "unit", target: "ally", range: 300 }, self: { id: "me", x: 0, y: 0 }, cursor: { x: 100, y: 0 }, overUi: false,
  hover: null, selected: null, units: [], facing: { x: 0, y: 1 }, alt: false, hoverCast: true, autoTarget: false, ...over,
});
const ok = (p: ReturnType<typeof resolveCast>) => { assert.ok(p.ok, "ожидался успех: " + JSON.stringify(p)); return p as Extract<typeof p, { ok: true }>; };

// ally: наведение > цель > на себя; Alt — всегда на себя
const a1 = u("a1", 50, 0, false), a2 = u("a2", 90, 0, false), foe = u("f", 60, 0, true);
assert.equal(ok(resolveCast(base({ hover: a1, selected: a2 }))).target, "a1");
assert.equal(ok(resolveCast(base({ hover: null, selected: a2 }))).target, "a2");
assert.equal(ok(resolveCast(base({ selected: foe }))).target, "me", "враг в цели — лечим себя");
assert.equal(ok(resolveCast(base({ hover: foe }))).target, "me", "враг под курсором не подходит для ally");
assert.equal(ok(resolveCast(base({ hover: a1, selected: a2, alt: true }))).target, "me");
assert.equal(ok(resolveCast(base({ hover: a1, hoverCast: false, selected: a2 }))).target, "a2", "каст по наведению выключен");
assert.equal(ok(resolveCast(base({ hover: a1, overUi: true, selected: a2 }))).target, "a2", "курсор над интерфейсом — наведения нет");

// enemy: наведение > цель > автоцель > ошибка
const en = base({ skill: { aim: "unit", target: "enemy", range: 200 } });
assert.equal(ok(resolveCast({ ...en, hover: foe, selected: u("f2", 10, 0, true) })).target, "f");
assert.equal(ok(resolveCast({ ...en, selected: u("f2", 10, 0, true) })).target, "f2");
assert.deepEqual(resolveCast(en), { ok: false, err: "Нет цели" });
const near = u("n", 40, 0, true), far = u("z", 500, 0, true), dead = u("d", 5, 0, true, { dead: true });
assert.deepEqual(resolveCast({ ...en, units: [far, near, dead] }), { ok: false, err: "Нет цели" });
assert.equal(ok(resolveCast({ ...en, autoTarget: true, units: [far, near, dead, u("m", 90, 0, true)] })).target, "n");
assert.deepEqual(resolveCast({ ...en, autoTarget: true, units: [far] }), { ok: false, err: "Нет цели" });
// задача 134, шаг 3: без точного наведения — выбранная цель; враг у курсора (магнитом или ближайший в 80 px экрана) — только если цели нет
{
  const nr = 80 / 2, sel = u("s", 150, 0, true), mag = u("mg", 120, 10, true), c1 = u("c1", 130, 0, true), c2 = u("c2", 60, 0, true);
  assert.equal(ok(resolveCast({ ...en, selected: sel, hoverNear: mag, nearReach: nr, units: [c1] })).target, "s", "цель важнее врага у курсора");
  assert.equal(ok(resolveCast({ ...en, hover: foe, selected: sel, hoverNear: mag, nearReach: nr })).target, "f", "точное наведение важнее цели");
  assert.equal(ok(resolveCast({ ...en, hoverNear: mag, nearReach: nr, units: [c1] })).target, "mg", "без цели — подсвеченный магнитом");
  assert.equal(ok(resolveCast({ ...en, nearReach: nr, units: [c2, c1, dead] })).target, "c1", "без цели — ближайший к курсору");
  assert.deepEqual(resolveCast({ ...en, nearReach: nr, units: [u("x", 100, 60, true)] }), { ok: false, err: "Нет цели" }, "дальше 80 px экрана + радиус — нет");
  assert.equal(ok(resolveCast({ ...en, nearReach: nr, units: [u("x", 100, 50, true)] })).target, "x", "40 + радиус 14 на зуме 2");
  assert.deepEqual(resolveCast({ ...en, nearReach: nr, hoverCast: false, units: [c1] }), { ok: false, err: "Нет цели" }, "без каста по наведению — нет");
  assert.deepEqual(resolveCast({ ...en, nearReach: nr, overUi: true, units: [c1] }), { ok: false, err: "Нет цели" }, "над интерфейсом — нет");
  assert.equal(ok(resolveCast({ ...en, selected: u("al", 50, 0, false), nearReach: nr, units: [c1] })).target, "c1", "в цели союзник — для удара цели нет");
  assert.equal(ok(resolveCast(base({ nearReach: nr, units: [u("me", 100, 0, false), u("a9", 110, 0, false)] }))).target, "a9", "лечение: союзник у курсора, не себя");
  assert.equal(ok(resolveCast(base({ nearReach: nr, units: [u("a9", 300, 0, false)] }))).target, "me", "лечение: никого у курсора — себя");
}
assert.equal(ok(resolveCast({ ...en, selected: u("w", 250, 0, true) })).far, true, "цель вне дальности помечена");
// «далеко» — как у сервера: дальше дальности + радиус цели (у боссов до 44; задача 133, шаг 2); без радиуса — как у героя (10)
assert.equal(ok(resolveCast({ ...en, selected: u("b", 243, 0, true, { r: 44 }) })).far, false, "босс r 44 в 243 px при дальности 200 — не далеко");
assert.equal(ok(resolveCast({ ...en, selected: u("b", 245, 0, true, { r: 44 }) })).far, true);
assert.equal(ok(resolveCast({ ...en, selected: u("w", 209, 0, true) })).far, false);
assert.equal(ok(resolveCast({ ...en, selected: u("w", 211, 0, true) })).far, true);
assert.equal(ok(resolveCast({ ...en, autoTarget: true, units: [u("z", 205, 0, true), u("b", 230, 0, true, { r: 44 })] })).target, "z", "автоцель: ближайший в дальности + радиус");
assert.equal(ok(resolveCast({ ...en, autoTarget: true, units: [u("z", 215, 0, true), u("b", 230, 0, true, { r: 44 })] })).target, "b", "автоцель: босс в дальности + свой радиус");
assert.equal(ok(resolveCast(base({ selected: u("a3", 340, 0, false, { r: 10 }) }))).far, true, "союзник: дальность + радиус героя");
assert.equal(ok(resolveCast(base({ selected: u("a3", 309, 0, false, { r: 10 }) }))).far, false);
// радиус юнита — как World.radiusOf: моб и босс — из MOBS по спрайту и имени (элита — с приставкой), остальные — PLAYER_RADIUS
assert.equal(unitRadius({ kind: 1, sprite: MOBS.golem_lava.sprite, name: MOBS.golem_lava.name }), MOBS.golem_lava.radius);
assert.equal(unitRadius({ kind: 1, sprite: MOBS.golem_lava.sprite, name: `Свирепый ${MOBS.golem_lava.name}` }), MOBS.golem_lava.radius, "элита");
assert.equal(unitRadius({ kind: 1, sprite: MOBS.golem_lava.eliteSprite!, name: MOBS.golem_lava.eliteName! }), MOBS.golem_lava.radius, "усиленный — свой лист и имя");
assert.equal(unitRadius({ kind: 2, sprite: MOBS.chaos_knight.sprite, name: MOBS.chaos_knight.name }), 44, "рейд-босс");
assert.equal(unitRadius({ kind: 0, sprite: "warrior", name: "Герой" }), PLAYER_RADIUS);
assert.equal(unitRadius({ kind: 3, sprite: "wolf", name: "Волк" }), PLAYER_RADIUS, "питомец — как герой");
// свои капканы по fx сервера (превью отказа «Слишком близко к другому капкану»): лужа «holy» ставит, удар r 52 снимает, сверх предела уходят старые
const tw = new TrapWatch(), trapFx = (x: number, c = "me", s = "hr_trap"): Fx => ({ t: "hazard", id: `h${x}`, k: "holy", x, y: 0, r: 38, ms: 8000, s, c });
tw.note([trapFx(10), trapFx(10), trapFx(90, "other"), trapFx(200, "me", "tp_banner")], "me", 0, { hr_trap: 1 });
assert.deepEqual(tw.live(0).map((t) => t.x), [10], "свой капкан один раз; чужой и не капкан — мимо");
tw.note([trapFx(100, "me", "roll"), trapFx(300)], "me", 1000, { hr_trap: 1 });
assert.deepEqual(tw.live(1000).map((t) => t.x), [100, 300], "предел 2 на 1 ранге: старый ушёл; «Ловкий отскок» тоже ставит капкан");
tw.note([{ t: "aoe", k: "phys", x: 100, y: 0, r: 52, s: "roll", c: "me" }], "me", 2000, { hr_trap: 1 });
assert.deepEqual(tw.live(2000).map((t) => t.x), [300], "сработавший снят");
// капкан жив, пока сервер повторяет его лужу (раз в 7,5 с, срок 8 с): с гибелью героя сервер гасит капканы молча — повторов нет, капкан уходит сам
for (let t = 7500; t < SKILLS.hr_trap.v(1).dur * 1000; t += 7500) tw.note([trapFx(300)], "me", 1000 + t, { hr_trap: 1 });
assert.deepEqual(tw.live(1000 + SKILLS.hr_trap.v(1).dur * 1000 - 1).length, 1, "повторы лужи держат капкан до конца срока");
assert.deepEqual(tw.live(1000 + SKILLS.hr_trap.v(1).dur * 1000).length, 0, "истёк срок");
const tw2 = new TrapWatch();
tw2.note([trapFx(10)], "me", 0, { hr_trap: 1 });
tw2.note([trapFx(10)], "me", 7500, { hr_trap: 1 });
assert.equal(tw2.live(7500 + 8000 + TRAP_GRACE - 1).length, 1, "повтор продлил капкан на срок лужи");
assert.equal(tw2.live(7500 + 8000 + TRAP_GRACE).length, 0, "повторов нет (герой погиб или ушёл) — капкан ушёл через срок лужи и запас");
// первым увиденный повтор (после входа в сцену) держит капкан не дольше своей лужи, а не весь срок капкана
const tw3 = new TrapWatch();
tw3.note([trapFx(10)], "me", 30000, { hr_trap: 1 });
assert.equal(tw3.live(30000 + 8000 + TRAP_GRACE).length, 0);
// гибель своего героя (GameScene.updateAim: me.dead) — список пуст сразу
tw3.note([trapFx(20)], "me", 40000, { hr_trap: 1 });
tw3.clear();
assert.equal(tw3.live(40000).length, 0, "гибель героя гасит его капканы");

// «кого заденет» по данным сцены (GameScene.hitUnits → hitUnitsOf), как у сервера: скрытые и павшие — никуда (метка выдала бы невидимку);
// питомец — по хозяину (свой — союзник своей фракции, хозяин-враг или не виден — не метим); герой чужой фракции без вражды (мирный город) — союзник,
// но не своей фракции (alliesAround его не берёт); враг в нейтральном городе (foe false: canAffect) — ни враг, ни союзник
const hv = (id: string, x: number, o: Partial<HitView>): HitView =>
  ({ id, x, y: 0, r: 10, dead: false, unseen: false, hero: false, pet: false, boss: false, foe: false, hostile: false, kin: false, owner: "", ...o });
const sceneUnits = [
  hv("me", 0, { hero: true, kin: true }), hv("ally", 20, { hero: true, kin: true }), hv("peace", 30, { hero: true }),
  hv("spy", 40, { hero: true, hostile: true, unseen: true }), hv("foeHero", 50, { hero: true, hostile: true, foe: true }), hv("guest", 60, { hero: true, hostile: true }),
  hv("allyDead", 65, { hero: true, kin: true, dead: true }), hv("allyHidden", 66, { hero: true, kin: true, unseen: true }),
  hv("myPet", 70, { pet: true, owner: "me" }), hv("allyPet", 80, { pet: true, owner: "ally" }), hv("peacePet", 90, { pet: true, owner: "peace" }),
  hv("spyPet", 100, { pet: true, owner: "spy" }), hv("foePet", 105, { pet: true, owner: "foeHero" }), hv("lostPet", 110, { pet: true, owner: "nobody" }),
  hv("mob", 120, { foe: true, r: 16 }), hv("boss", 125, { foe: true, boss: true, r: 44 }), hv("deadMob", 130, { foe: true, dead: true }), hv("guard", 140, {}),
];
const tag = (u: HitUnit) => `${u.id}${u.ally ? (u.kin ? "+" : "~") : "!"}${u.pet ? "p" : ""}${u.boss ? "b" : ""}`;
assert.deepEqual(hitUnitsOf(sceneUnits, "me").map(tag), ["ally+", "peace~", "foeHero!", "myPet+p", "allyPet+p", "peacePet~p", "mob!", "boss!b"],
  "союзники и враги — как у сервера: без скрытых, павших, питомцев врага и незнакомых хозяев, без чужака в нейтральном городе");

// self
const sf = ok(resolveCast(base({ skill: { aim: "self", target: "self", range: 0 }, selected: foe })));
assert.deepEqual([sf.x, sf.y, sf.target], [0, 0, "f"]);

// точка: курсор, зажатый дальностью; «далеко» нет — сервер прижимает точку так же и кастует (красное превью — только его отказ)
const g = ok(resolveCast(base({ skill: { aim: "ground", target: "point", range: 340 }, cursor: { x: 1000, y: 0 } })));
assert.deepEqual([g.x, g.y, g.far, g.target], [340, 0, false, null]);
const g2 = ok(resolveCast(base({ skill: { aim: "ground", target: "point", range: 340 }, cursor: { x: 0, y: 120 } })));
assert.deepEqual([g2.x, g2.y, g2.far], [0, 120, false]);
assert.deepEqual(clampToRange({ x: 10, y: 10 }, { x: 10, y: 410 }, 100), { x: 10, y: 110, far: true });
assert.equal(clampToRange({ x: 0, y: 0 }, { x: 5000, y: 0 }, 0).far, false, "дальность 0 — без зажима");
// курсор на враге (каст по наведению) — точка по его ногам, а не в курсоре над ним; без наведения, над интерфейсом и на мёртвом — курсор
const gh = base({ skill: { aim: "ground", target: "point", range: 340 }, cursor: { x: 60, y: 8 }, hover: u("h", 60, 20, true) });
assert.deepEqual([ok(resolveCast(gh)).x, ok(resolveCast(gh)).y, ok(resolveCast(gh)).target], [60, 20, null], "ground: по ногам врага");
assert.deepEqual([ok(resolveCast({ ...gh, hoverCast: false })).x, ok(resolveCast({ ...gh, hoverCast: false })).y], [60, 8], "без каста по наведению — курсор");
assert.deepEqual([ok(resolveCast({ ...gh, hover: u("h", 60, 20, true, { dead: true }) })).y], [8], "мёртвый — курсор");
assert.deepEqual([ok(resolveCast({ ...gh, hover: u("a", 60, 20, false) })).y], [8], "союзник — курсор");
assert.deepEqual([ok(resolveCast({ ...gh, hover: u("h", 900, 20, true) })).x, ok(resolveCast({ ...gh, hover: u("h", 900, 20, true) })).far], [340 * (900 / Math.hypot(900, 20)), false], "враг за дальностью — его ноги, прижатые к дальности");

// направление: курсор; над интерфейсом — цель, иначе вперёд; «далеко» нет — снаряд летит до дальности
const dir = base({ skill: { aim: "dir", target: "point", range: 340 }, cursor: { x: -200, y: 0 } });
assert.deepEqual([ok(resolveCast(dir)).x, ok(resolveCast(dir)).y], [-200, 0]);
assert.equal(ok(resolveCast({ ...dir, cursor: { x: -900, y: 0 } })).far, false, "курсор дальше дальности — не «далеко»");
const ui = ok(resolveCast({ ...dir, overUi: true, selected: u("t", 0, -80, true) }));
assert.deepEqual([ui.x, ui.y, ui.target], [0, -80, "t"]);
assert.equal(ok(resolveCast({ ...dir, overUi: true, selected: u("t", 0, -800, true) })).far, false, "цель за дальностью над интерфейсом — не «далеко»");
const fw = ok(resolveCast({ ...dir, overUi: true, facing: { x: 1, y: 0 } }));
assert.deepEqual([fw.x, fw.y, fw.target], [340, 0, null]);
const dh = ok(resolveCast({ ...dir, cursor: { x: -60, y: 8 }, hover: u("h", -60, 20, true) }));
assert.deepEqual([dh.x, dh.y, dh.target], [-60, 20, "h"], "dir: курсор на враге — по его ногам, снаряд наводится на него");

// рывок: к курсору
const dash = ok(resolveCast(base({ skill: { aim: "dash", target: "point", range: 0 }, cursor: { x: 7, y: 9 } })));
assert.deepEqual([dash.x, dash.y], [7, 9]);

// поля прицела всех активных умений всех классов
const AIMS = ["unit", "ground", "dir", "dash", "self"];
let n = 0;
for (const cls of Object.keys(CLASSES) as (keyof typeof CLASSES)[]) for (const s of activeSkills(cls)) {
  n++;
  assert.ok(s.aim && AIMS.includes(s.aim), `${s.id}: aim`);
  if (s.target === "enemy" || s.target === "ally") assert.equal(s.aim, "unit", s.id);
  if (s.target === "self") assert.equal(s.aim, "self", s.id);
  if (s.aim === "ground" || s.aim === "dir") assert.equal(s.target, "point", s.id);
  if (s.aim === "ground") assert.ok((s.range ?? 0) > 0, `${s.id}: у точечного умения нужна дальность`);
}
const by = (id: string) => activeSkills("mage").find((s) => s.id === id)!;
// размер формы — по рангу (shared/skillShape.ts), а не с 1 ранга: мерцание на 5 ранге длиннее на 80 px
assert.equal(by("meteor").aim, "ground"); assert.equal(shapeSize(by("meteor"), 1), 110); assert.equal(aimSpec(by("meteor")).shape, "circle");
assert.equal(by("fireball").aim, "dir"); assert.equal(by("blink").aim, "dash"); assert.ok(by("blink").offGcd);
assert.equal(shapeSize(by("blink"), 1), 200); assert.equal(shapeSize(by("blink"), 5), 280);

// ---------- выбор цели мышью (задача 134, шаг 1) ----------
// запас к зоне тела в пикселях мира: допуск 12 и магнит 40 px экрана делятся на масштаб CSS; «Крупные цели» — оба вдвое
assert.equal(PICK_TOL, 12); assert.equal(PICK_MAGNET, 40);
assert.equal(pickReach(2, false, false), 6); assert.equal(pickReach(2, true, false), 20);
assert.equal(pickReach(3, false, false), 4); assert.ok(Math.abs(pickReach(3, true, false) - 40 / 3) < 1e-9);
assert.equal(pickReach(2, false, true), 12, "«Крупные цели»: допуск ×2"); assert.equal(pickReach(2, true, true), 40, "«Крупные цели»: магнит ×2");
assert.equal(pickReach(0, false, false), 12, "масштаб 0 — как 1");

// Источник целей ниже — заглушка для порядка pickOrder: зона тела — круг (радиус 14, у крупного кадра 30; центр на 12 px выше ног, у крупных — на 28),
// reach прибавляется к радиусу. Настоящая зона клика игры (силуэт кадра, плашка, след) — client/src/game/hit.ts, её проверяет tests/pick.ts.
const bodyDist = (x: number, y: number, large: boolean, wx: number, wy: number, reach: number): number => {
  const d = Math.hypot(wx - x, wy - (y - (large ? 28 : 12)));
  return d < (large ? 30 : 14) + reach ? d : Infinity;
};

// мир для проверок: юниты (ноги x, y), мешки/узлы/NPC (центр зоны и радиус); те же правила «ближайший к курсору побеждает», что в GameScene
// me — мой герой, pet — питомец, own — мой питомец, town — герой чужой фракции в нейтральном городе (бой запрещён)
interface W { id: string; x: number; y: number; foe?: boolean; large?: boolean; me?: boolean; unseen?: boolean; pet?: boolean; own?: boolean; town?: boolean }
interface It { kind: "bag" | "node" | "npc"; id?: string; x: number; y: number; r: number }
/** Ближайший по центру тела; мой герой и мои питомцы берутся с запасом own (по умолчанию — как остальные). */
const nearest = (list: W[], wx: number, wy: number, reach: number, own = reach): string | null => {
  let best: string | null = null, bd = Infinity;
  for (const w of list) { const d = bodyDist(w.x, w.y, !!w.large, wx, wy, w.me || w.own ? own : reach); if (d < bd) { bd = d; best = w.id; } }
  return best;
};
const source = (units: W[], items: It[], wx: number, wy: number): PickSource => ({
  foe: (r) => nearest(units.filter((w) => w.foe && !w.town), wx, wy, r),
  townFoe: (r) => nearest(units.filter((w) => w.foe && w.town), wx, wy, r),
  item: (out) => {
    const it = items.find((i) => Math.hypot(i.x - wx, i.y - wy) < i.r);
    if (!it) return false;
    out.kind = it.kind; out.id = it.id ?? null; out.ref = it.id ? null : it;
    return true;
  },
  menu: (r) => nearest(units.filter((w) => !w.foe && !w.me && !w.pet && !w.unseen), wx, wy, r),
  friend: (r, own) => nearest(units.filter((w) => !w.foe && !w.unseen), wx, wy, r, own),
});
/** Клик в точке (wx, wy): по умолчанию ЛКМ в «Экшене», масштаб 2, мир. */
const click = (units: W[], items: It[], wx: number, wy: number, o: Partial<PickCtx> = {}): [PickKind, string | null] => {
  const c: PickCtx = { aim: false, right: false, action: true, world: true, css: 2, bigTargets: false, ...o };
  const r = pickOrder(c, source(units, items, wx, wy), { kind: "ground", id: null, ref: null });
  return [r.kind, r.id];
};
const mob: W = { id: "m", x: 200, y: 200, foe: true }, cy = 188; // центр тела моба (200, 188)

// допуск и магнит (масштаб 2: допуск 6, магнит 20 px мира; зона тела 14): «точно» до 20 от центра, магнит ЛКМ в «Экшене» — до 34
for (const [dx, lmb, tolOnly] of [[0, "foe", "foe"], [19.9, "foe", "foe"], [20.1, "magnet", "ground"], [33.9, "magnet", "ground"], [34.1, "ground", "ground"]] as [number, PickKind, PickKind][]) {
  const id = (k: PickKind) => (k === "ground" ? null : "m");
  assert.deepEqual(click([mob], [], 200 + dx, cy), [lmb, id(lmb)], `«Экшен» ЛКМ, ${dx} px от центра`);
  assert.deepEqual(click([mob], [], 200 + dx, cy, { right: true }), [tolOnly, id(tolOnly)], `«Экшен» ПКМ: только допуск, ${dx} px`);
  assert.deepEqual(click([mob], [], 200 + dx, cy, { action: false }), [tolOnly, id(tolOnly)], `«Классика» ЛКМ: только допуск, ${dx} px`);
  assert.deepEqual(click([mob], [], 200 + dx, cy, { action: false, right: true }), [tolOnly, id(tolOnly)], `«Классика» ПКМ: только допуск, ${dx} px`);
}
// масштаб 3: допуск 4, магнит 13,3 px мира — «точно» до 18, магнит до 27,3
assert.deepEqual(click([mob], [], 217.9, cy, { css: 3, right: true }), ["foe", "m"]);
assert.deepEqual(click([mob], [], 218.1, cy, { css: 3, right: true }), ["ground", null]);
assert.deepEqual(click([mob], [], 227.2, cy, { css: 3 }), ["magnet", "m"]);
assert.deepEqual(click([mob], [], 227.5, cy, { css: 3 }), ["ground", null]);
// «Крупные цели» (масштаб 2): допуск 12 → «точно» до 26, магнит 40 → до 54
assert.deepEqual(click([mob], [], 225.9, cy, { right: true, bigTargets: true }), ["foe", "m"]);
assert.deepEqual(click([mob], [], 226.1, cy, { right: true, bigTargets: true }), ["ground", null]);
assert.deepEqual(click([mob], [], 253.9, cy, { bigTargets: true }), ["magnet", "m"]);
assert.deepEqual(click([mob], [], 254.1, cy, { bigTargets: true }), ["ground", null]);
// крупный кадр (рейд-босс): радиус 30 + допуск 6, центр на 28 выше ног
const boss: W = { id: "b", x: 500, y: 400, foe: true, large: true };
assert.deepEqual(click([boss], [], 535.9, 372, { right: true }), ["foe", "b"]);
assert.deepEqual(click([boss], [], 536.1, 372, { right: true }), ["ground", null]);
// из нескольких побеждает ближайший к курсору: «точно» — по центру тела, магнит — тоже
const two = [mob, { id: "m2", x: 250, y: 200, foe: true }];
assert.deepEqual(click(two, [], 214, cy, { right: true }), ["foe", "m"]);
assert.deepEqual(click(two, [], 236, cy, { right: true }), ["foe", "m2"]);
assert.deepEqual(click(two, [], 226, cy), ["magnet", "m2"], "магнит берёт ближайшего из двух (26 и 24 px)");
// точное попадание по телу — раньше допуска соседа: приспешник (центр (530, 388), тело 14, допуск 6) не отбирает клик у тела босса (центр (500, 372), тело 30)
const minion: W = { id: "w", x: 530, y: 400, foe: true };
assert.deepEqual(click([boss, minion], [], 515, 394, { right: true }), ["foe", "b"], "по телу босса (26,6 от центра), приспешник ближе (16,2), но лишь в допуске: босс");
assert.deepEqual(click([boss, minion], [], 515, 394), ["foe", "b"], "ЛКМ: то же");
assert.deepEqual(click([boss, minion], [], 544, 394, { right: true }), ["foe", "w"], "вне тела босса приспешник берётся в допуске");
assert.deepEqual(click([boss, minion], [], 520, 385, { right: true }), ["foe", "w"], "в теле обоих — ближний центр, как раньше");

// порядок: прицел → враг точно → мешок, узел, NPC → чужой герой в нейтральном городе → меню союзника → союзник точно → враг магнитом → земля
assert.deepEqual(click([mob], [], 200, cy, { aim: true }), ["aim", null], "прицел перебивает всё");
assert.deepEqual(click([mob], [], 200, cy, { aim: true, right: true }), ["aim", null]);
// мешок под мобом: клик по мобу бьёт моба, а не берёт мешок; мешок рядом (вне допуска моба) берётся
const bagUnder: It = { kind: "bag", id: "bag1", x: 200, y: 190, r: 16 }, bagNear: It = { kind: "bag", id: "bag1", x: 224, y: 190, r: 16 };
assert.deepEqual(click([mob], [bagUnder], 200, cy, { right: true }), ["foe", "m"], "мешок под мобом: враг важнее");
assert.deepEqual(click([mob], [bagNear], 222, cy, { right: true }), ["bag", "bag1"], "мешок вне допуска моба берётся");
assert.deepEqual(click([mob], [bagNear], 222, cy), ["bag", "bag1"], "«Экшен»: ЛКМ по мешку вне допуска моба — подбор (мешок раньше магнита)");
assert.deepEqual(click([mob], [bagUnder], 200, cy), ["foe", "m"], "«Экшен»: ЛКМ по мобу над мешком — только выбор врага");
assert.deepEqual(click([], [bagNear], 222, cy), ["bag", "bag1"], "«Экшен»: ЛКМ по мешку без врага — подбор");
assert.deepEqual(click([], [{ kind: "node", x: 224, y: 172, r: 24 }], 222, cy), ["node", null], "«Экшен»: ЛКМ по узлу добычи — сбор");
assert.deepEqual(click([mob], [{ kind: "npc", x: 230, y: cy, r: 18 }], 230, cy), ["npc", null], "«Экшен»: ЛКМ берёт NPC, как мешок");
assert.deepEqual(click([], [{ kind: "npc", x: 230, y: cy, r: 18 }], 230, cy), ["npc", null], "«Экшен»: ЛКМ по NPC без врага — NPC");
assert.deepEqual(click([mob], [bagNear], 222, cy, { action: false }), ["bag", "bag1"], "«Классика»: мешок берут обе кнопки");
// NPC рядом с врагом: клик по NPC (25–30 px от центра моба, вне допуска) — NPC, а не враг-магнит; клик на враге, залезшем в зону NPC, — враг
const npc: It = { kind: "npc", x: 230, y: cy, r: 18 };
assert.equal(click([mob], [npc], 230, cy, { right: true })[0], "npc");
assert.equal(click([mob], [npc], 230, cy, { action: false })[0], "npc");
assert.deepEqual(click([mob], [npc], 214, cy, { right: true }), ["foe", "m"], "враг точно — раньше NPC, даже в зоне NPC");
// узлы добычи — наравне с мешками: тот же порядок
assert.equal(click([mob], [{ kind: "node", x: 224, y: 172, r: 24 }], 222, cy, { right: true })[0], "node");
// союзник на мобе (танк стоит на мобе): по месту, где оба, — враг; по союзнику вне допуска моба — меню (ПКМ в мире) или выбор
const tank: W = { id: "t", x: 230, y: 200 };
assert.deepEqual(click([mob, { ...tank, x: 200 }], [], 200, cy, { right: true }), ["foe", "m"], "союзник на мобе: враг важнее меню");
assert.deepEqual(click([mob, { ...tank, x: 200 }], [], 200, cy), ["foe", "m"], "союзник на мобе: враг важнее выбора союзника");
assert.deepEqual(click([mob, tank], [], 240, cy, { right: true }), ["menu", "t"]);
assert.deepEqual(click([mob, tank], [], 240, cy), ["friend", "t"], "ЛКМ по союзнику — выбор");
assert.deepEqual(click([mob, tank], [], 240, cy, { right: true, world: false }), ["friend", "t"], "на арене меню нет — выбор");
assert.deepEqual(click([mob, tank], [], 222, cy), ["friend", "t"], "союзник точно — раньше врага магнитом");
assert.deepEqual(click([mob, tank], [], 250.1, cy), ["ground", null], "союзнику допуск, магнита нет");
assert.equal(click([tank], [{ kind: "npc", x: 232, y: cy, r: 18 }], 232, cy, { right: true })[0], "npc", "NPC раньше меню союзника");
assert.deepEqual(click([{ id: "me", x: 300, y: 200, me: true }], [], 300, cy, { right: true }), ["friend", "me"], "себе меню не даём — выбор себя");
assert.deepEqual(click([{ ...tank, unseen: true }], [], 230, cy, { right: true }), ["ground", null], "скрытого игрока не видно и не выбрать");
// герой чужой фракции в нейтральном городе: бой запрещён (удар клеймит нарушителем), поэтому его допуск не перебивает NPC и мешок.
// Торговка: ноги (230, 202), зона клика — круг r 18 с центром (230, 188). Чужак стоит на месте разговора — на 26 px ниже ног торговки: центр тела (230, 216)
const trader: It = { kind: "npc", x: 230, y: 188, r: 18 }, guest: W = { id: "g", x: 230, y: 228, foe: true, town: true };
assert.deepEqual(click([guest], [trader], 230, 200, { right: true }), ["npc", null], "клик по ногам торговки (12 от центра зоны, 16 от центра чужака — только допуск): торговка, а не удар по чужаку");
assert.deepEqual(click([guest], [trader], 230, 200, { action: false }), ["npc", null], "«Классика»: то же");
assert.deepEqual(click([{ ...guest, town: false }], [trader], 230, 200, { right: true }), ["foe", "g"], "обычный враг (спорная зона) на том же месте: враг точно — раньше NPC");
assert.deepEqual(click([guest], [trader], 230, 204, { right: true }), ["npc", null], "по телу чужака, но в зоне торговки: торговка раньше");
assert.deepEqual(click([guest], [], 230, 216, { right: true }), ["foe", "g"], "по телу чужака без NPC: ПКМ бьёт, как раньше");
assert.deepEqual(click([guest], [], 230, 216), ["foe", "g"], "ЛКМ по телу чужака: выбор");
assert.deepEqual(click([guest], [], 230, 232, { right: true }), ["ground", null], "чужак только в допуске (16 от центра): шаг, а не удар и клеймо");
assert.deepEqual(click([{ ...guest, town: false }], [], 230, 232, { right: true }), ["foe", "g"], "обычный враг там же: допуск работает");
assert.deepEqual(click([guest], [], 255, 216), ["ground", null], "магнит чужака в нейтральном городе не берёт");
assert.deepEqual(click([guest], [trader], 230, 200, { right: true, bigTargets: true }), ["npc", null], "«Крупные цели»: допуск чужака не растёт и под NPC");
// свой герой и свой питомец — только по телу (допуска нет): камера держит героя в центре экрана, и клик-шаг рядом с ним не должен выбирать его
const self: W = { id: "me", x: 300, y: 200, me: true }, mine: W = { id: "p", x: 340, y: 200, pet: true, own: true };
const other: W = { id: "o", x: 400, y: 200 }, theirs: W = { id: "q", x: 460, y: 200, pet: true };
assert.deepEqual(click([self], [], 317, cy, { right: true }), ["ground", null], "17 от центра героя (тело 14, допуск 6): шаг, а не выбор себя");
assert.deepEqual(click([self], [], 313.9, cy, { right: true }), ["friend", "me"], "по телу героя — выбор себя, как раньше");
assert.deepEqual(click([self], [], 317, cy, { action: false }), ["ground", null], "«Классика»: клик-шаг рядом с героем");
assert.deepEqual(click([self], [], 317, cy, { css: 3, right: true }), ["ground", null], "зум 3");
assert.deepEqual(click([self], [], 325, cy, { right: true, bigTargets: true }), ["ground", null], "«Крупные цели» (допуск 12): у героя допуска нет и с ними");
assert.deepEqual(click([mine], [], 357, cy, { right: true }), ["ground", null], "свой питомец: тоже только по телу");
assert.deepEqual(click([mine], [], 353.9, cy), ["friend", "p"], "по телу питомца — выбор");
assert.deepEqual(click([other], [], 417, cy, { right: true }), ["menu", "o"], "чужому игроку допуск остаётся: меню обмена");
assert.deepEqual(click([other], [], 417, cy), ["friend", "o"], "ЛКМ рядом с чужим игроком: выбор");
assert.deepEqual(click([theirs], [], 477, cy, { right: true }), ["friend", "q"], "чужому питомцу допуск остаётся");
assert.deepEqual(click([self, { id: "o2", x: 336, y: 200 }], [], 317, cy), ["friend", "o2"], "ЛКМ между героем (17, только допуск) и чужим игроком (19, допуск): чужой — у героя допуска нет");
// результат пишется в переданный объект, старые id и ref сбрасываются (наведение считается каждый кадр без аллокаций)
const keep: PickOut = { kind: "foe", id: "stale", ref: {} };
assert.equal(pickOrder({ aim: false, right: false, action: true, world: true, css: 2, bigTargets: false }, source([], [], 0, 0), keep), keep);
assert.deepEqual([keep.kind, keep.id, keep.ref], ["ground", null, null]);
console.log(`cast-resolve: ok (${n} умений, выбор мышью)`);
