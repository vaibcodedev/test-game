/** Выбор адресата каста и поля прицела умений (задача 115, шаг 6; задача 133, шаг 1 — точка по ногам врага, «далеко» только у умений на цель, размеры по рангу);
 *  выбор цели мышью: допуск, магнит, порядок (задача 134, шаг 1). Геометрия превью против сервера — tests/skill-shape.ts. Запуск: npx tsx tests/cast-resolve.ts */
import assert from "node:assert/strict";
import { bodyDist, clampToRange, pickOrder, pickReach, PICK_MAGNET, PICK_TOL, resolveCast, type CastIn, type CastUnit, type PickCtx, type PickKind, type PickOut, type PickSource } from "../client/src/game/castResolve";
import { activeSkills } from "../shared/skills";
import { aimSpec, shapeSize } from "../shared/skillShape";
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

// зона тела — круг: радиус 14 (кадр больше 32 — 30), центр на 12 px выше ног (крупные и всадники — на 28); reach прибавляется к радиусу
const hit = (large: boolean, mounted: boolean, wx: number, wy: number, reach = 0) => Number.isFinite(bodyDist(100, 100, large, mounted, wx, wy, reach));
assert.ok(hit(false, false, 113.9, 88) && !hit(false, false, 114.1, 88), "радиус 14, центр на 12 выше ног");
assert.ok(hit(true, false, 129.9, 72) && !hit(true, false, 130.1, 72), "крупный кадр: радиус 30, центр на 28");
assert.ok(hit(false, true, 100, 85.9) && !hit(false, true, 100, 86.1), "всадник: центр на 28 выше ног");
assert.ok(hit(false, false, 119.9, 88, 6) && !hit(false, false, 120.1, 88, 6), "допуск 6 px мира: до 20 от центра");
assert.equal(bodyDist(100, 100, false, false, 100, 88, 0), 0);

// мир для проверок: юниты (ноги x, y), мешки/узлы/NPC (центр зоны и радиус); те же правила «ближайший к курсору побеждает», что в GameScene
// me — мой герой, pet — питомец, own — мой питомец, town — герой чужой фракции в нейтральном городе (бой запрещён)
interface W { id: string; x: number; y: number; foe?: boolean; large?: boolean; me?: boolean; unseen?: boolean; pet?: boolean; own?: boolean; town?: boolean }
interface It { kind: "bag" | "node" | "npc"; id?: string; x: number; y: number; r: number }
/** Ближайший по центру тела; мой герой и мои питомцы берутся с запасом own (по умолчанию — как остальные). */
const nearest = (list: W[], wx: number, wy: number, reach: number, own = reach): string | null => {
  let best: string | null = null, bd = Infinity;
  for (const w of list) { const d = bodyDist(w.x, w.y, !!w.large, false, wx, wy, w.me || w.own ? own : reach); if (d < bd) { bd = d; best = w.id; } }
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
assert.deepEqual(click([mob], [bagNear], 222, cy), ["magnet", "m"], "«Экшен»: ЛКМ мешок не берёт — враг магнитом");
assert.deepEqual(click([], [bagNear], 222, cy), ["ground", null], "«Экшен»: ЛКМ по мешку без врага — земля, героя не двигает");
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
