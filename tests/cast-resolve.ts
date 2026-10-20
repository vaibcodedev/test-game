/** Выбор адресата каста и поля прицела умений (задача 115, шаг 6). Запуск: npx tsx tests/cast-resolve.ts */
import assert from "node:assert/strict";
import { clampToRange, resolveCast, type CastIn, type CastUnit } from "../client/src/game/castResolve";
import { activeSkills } from "../shared/skills";
import { CLASSES } from "../shared/classes";

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
assert.equal(ok(resolveCast({ ...en, selected: u("w", 250, 0, true) })).far, true, "цель вне дальности помечена");

// self
const sf = ok(resolveCast(base({ skill: { aim: "self", target: "self", range: 0 }, selected: foe })));
assert.deepEqual([sf.x, sf.y, sf.target], [0, 0, "f"]);

// точка: курсор, зажатый дальностью
const g = ok(resolveCast(base({ skill: { aim: "ground", target: "point", range: 340 }, cursor: { x: 1000, y: 0 } })));
assert.deepEqual([g.x, g.y, g.far, g.target], [340, 0, true, null]);
const g2 = ok(resolveCast(base({ skill: { aim: "ground", target: "point", range: 340 }, cursor: { x: 0, y: 120 } })));
assert.deepEqual([g2.x, g2.y, g2.far], [0, 120, false]);
assert.deepEqual(clampToRange({ x: 10, y: 10 }, { x: 10, y: 410 }, 100), { x: 10, y: 110, far: true });
assert.equal(clampToRange({ x: 0, y: 0 }, { x: 5000, y: 0 }, 0).far, false, "дальность 0 — без зажима");

// направление: курсор; над интерфейсом — цель, иначе вперёд
const dir = base({ skill: { aim: "dir", target: "point", range: 340 }, cursor: { x: -200, y: 0 } });
assert.deepEqual([ok(resolveCast(dir)).x, ok(resolveCast(dir)).y], [-200, 0]);
const ui = ok(resolveCast({ ...dir, overUi: true, selected: u("t", 0, -80, true) }));
assert.deepEqual([ui.x, ui.y, ui.target], [0, -80, "t"]);
const fw = ok(resolveCast({ ...dir, overUi: true, facing: { x: 1, y: 0 } }));
assert.deepEqual([fw.x, fw.y, fw.target], [340, 0, null]);

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
assert.equal(by("meteor").aim, "ground"); assert.equal(by("meteor").area, 110);
assert.equal(by("fireball").aim, "dir"); assert.equal(by("blink").aim, "dash"); assert.equal(by("blink").area, 200); assert.ok(by("blink").offGcd);
console.log(`cast-resolve: ok (${n} умений)`);
