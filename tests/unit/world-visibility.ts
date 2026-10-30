/**
 * Фильтр видимости открытого мира без сервера (server/src/rooms/visibility.ts): юниты в квадрате VIS_IN клеток видны, дальше — нет;
 * гистерезис (уходит только за VIS_OUT), всегда видны свой герой, цель, группа и питомцы; скачок (телепорт) пересчитывает вид в тот же
 * тик; убранный из состояния юнит пропадает; точки на миникарте — только своей фракции и только вне вида (врагов «радаром» не видно).
 * Запуск: npx tsx tests/unit/world-visibility.ts
 */
import { OpenWorldState, Unit } from "../../server/src/rooms/schema";
import { Visibility, VIS_CELL, VIS_IN, VIS_OUT, VIS_REFRESH_MS, VIS_DOTS_MS } from "../../server/src/rooms/visibility";
import { assert, done, knownFail, section, test } from "./lib";
import { BUFF_STEALTH } from "../../shared/protocol";

type Fake = { id: string; unit: Unit; targetId: string | null };
function setup() {
  const state = new OpenWorldState();
  const players = new Map<string, Fake>(), pets = new Map<string, { id: string; unit: Unit; owner: { id: string } }>();
  const party = new Map<string, string[]>();
  const world = { players, pets, actor: (id: string) => players.get(id) ?? [...pets.values()].find((p) => p.id === id) ?? (state.mobs.get(id) ? { unit: state.mobs.get(id) } : undefined) };
  const vis = new Visibility(state, () => world as never, (p) => (party.get(p.id) ?? []).map((id) => players.get(id) as never));
  let now = 0;
  const dots = new Map<string, number[]>();
  const add = (id: string, x: number, y: number, faction = "solgard", join = true) => {
    const u = new Unit();
    u.x = x; u.y = y; u.faction = faction; u.name = id;
    state.players.set(id, u);
    const p: Fake = { id, unit: u, targetId: null };
    players.set(id, p);
    if (join) vis.attach({ view: undefined } as never, p as never);
    return p;
  };
  const mob = (id: string, x: number, y: number) => { const u = new Unit(); u.x = x; u.y = y; state.mobs.set(id, u); return u; };
  const pet = (id: string, owner: Fake, x: number, y: number) => { const u = new Unit(); u.x = x; u.y = y; state.mobs.set(id, u); pets.set(id, { id, unit: u, owner }); return u; };
  const tick = (ms = VIS_REFRESH_MS) => { now += ms; vis.tick(now, (id, d) => void dots.set(id, d)); };
  return { state, players, pets, party, vis, add, mob, pet, tick, dots };
}
const CELL = VIS_CELL;
const O = 100 * CELL + CELL / 2; // центр клетки вдали от нуля

section("Видимость по клеткам");

await test("враг в VIS_IN клетках виден, дальше — нет; свой герой виден всегда", () => {
  const s = setup();
  const me = s.add("me", O, O);
  const near = s.add("near", O + VIS_IN * CELL, O, "umbrath");
  const far = s.add("far", O + (VIS_IN + 2) * CELL, O, "umbrath");
  s.tick();
  assert.ok(s.vis.sees("me", me.unit));
  assert.ok(s.vis.sees("me", near.unit), "сосед в VIS_IN не виден");
  assert.ok(!s.vis.sees("me", far.unit), "враг вне зоны виден");
  assert.ok(!s.vis.sees("far", me.unit));
});

await test("мобы так же: в зоне — да, вне — нет", () => {
  const s = setup();
  s.add("me", O, O);
  const a = s.mob("m1", O + CELL, O + CELL), b = s.mob("m2", O, O + (VIS_IN + 1) * CELL);
  s.tick();
  assert.ok(s.vis.sees("me", a));
  assert.ok(!s.vis.sees("me", b));
});

await test("гистерезис: ушедший на VIS_OUT клетку остаётся, дальше — пропадает; вернувшийся — снова виден", () => {
  const s = setup();
  s.add("me", O, O);
  const o = s.add("o", O + VIS_IN * CELL, O, "umbrath");
  s.tick();
  assert.ok(s.vis.sees("me", o.unit));
  o.unit.x = O + VIS_OUT * CELL;
  s.tick();
  assert.ok(s.vis.sees("me", o.unit), "мигание на границе");
  o.unit.x = O + (VIS_OUT + 1) * CELL;
  s.tick();
  assert.ok(!s.vis.sees("me", o.unit));
  o.unit.x = O + VIS_OUT * CELL;
  s.tick();
  assert.ok(!s.vis.sees("me", o.unit), "вне VIS_IN не должен появляться снова");
  o.unit.x = O + VIS_IN * CELL;
  s.tick();
  assert.ok(s.vis.sees("me", o.unit));
});

await test("всегда видны: цель, участник группы и питомцы — на любом расстоянии", () => {
  const s = setup();
  const me = s.add("me", O, O);
  const tgt = s.add("tgt", O + 50 * CELL, O, "umbrath");
  const mate = s.add("mate", O, O + 60 * CELL);
  const pu = s.pet("pet1", me as never, O + 30 * CELL, O);
  me.targetId = "tgt";
  s.party.set("me", ["mate"]);
  s.tick();
  assert.ok(s.vis.sees("me", tgt.unit), "цель");
  assert.ok(s.vis.sees("me", mate.unit), "группа");
  assert.ok(s.vis.sees("me", pu), "питомец");
  me.targetId = null;
  s.party.delete("me");
  s.tick();
  assert.ok(!s.vis.sees("me", tgt.unit) && !s.vis.sees("me", mate.unit), "сброшенная цель и вышедший из группы остались видны");
});

await test("новый питомец появляется в виде в тот же тик (не через VIS_REFRESH_MS)", () => {
  const s = setup();
  const me = s.add("me", O, O);
  s.tick();
  const pu = s.pet("pet2", me as never, O + 20 * CELL, O);
  s.tick(1);
  assert.ok(s.vis.sees("me", pu));
});

await test("скачок (телепорт): вид пересчитан в тот же тик", () => {
  const s = setup();
  const me = s.add("me", O, O);
  const there = s.add("there", O + 40 * CELL, O, "umbrath");
  const here = s.add("here", O + CELL, O, "umbrath");
  s.tick();
  me.unit.x = O + 40 * CELL - 10;
  s.tick(1); // меньше VIS_REFRESH_MS
  assert.ok(s.vis.sees("me", there.unit), "после телепорта соседи не видны");
  assert.ok(!s.vis.sees("me", here.unit), "старые соседи остались");
});

await test("новый герой сразу виден соседям при входе, дальним — нет", () => {
  const s = setup();
  s.add("a", O, O);
  s.add("b", O + 20 * CELL, O);
  s.tick();
  const c = s.add("c", O + CELL, O);
  assert.ok(s.vis.sees("a", c.unit));
  assert.ok(!s.vis.sees("b", c.unit));
});

await test("убранный из состояния юнит (вышел, моб убран) исчезает из вида", () => {
  const s = setup();
  s.add("me", O, O);
  const o = s.add("o", O + CELL, O);
  const mu = s.mob("m", O, O + CELL);
  s.tick();
  assert.ok(s.vis.sees("me", o.unit) && s.vis.sees("me", mu));
  s.state.players.delete("o"); s.players.delete("o");
  s.state.mobs.delete("m");
  s.tick();
  assert.ok(!s.vis.sees("me", o.unit) && !s.vis.sees("me", mu));
});

await test("B40: невидимый враг в зоне вида не уходит клиенту чужой фракции",
  () => {
    const s = setup();
    s.add("me", O, O, "solgard");
    const rogue = s.add("rogue", O + CELL, O, "umbrath");
    rogue.unit.buffs |= BUFF_STEALTH;
    s.tick();
    assert.ok(!s.vis.sees("me", rogue.unit), "невидимка в состоянии клиента врага");
  });

section("Точки на миникарте");

await test("точки: только своя фракция и только вне вида; враги — никогда", () => {
  const s = setup();
  s.add("me", O, O, "solgard");
  s.add("allyFar", O + 30 * CELL, O, "solgard");
  s.add("allyNear", O + CELL, O, "solgard");
  s.add("foeFar", O + 30 * CELL, O + CELL, "umbrath");
  s.add("foeNear", O, O + CELL, "umbrath");
  s.tick(VIS_DOTS_MS);
  const d = s.dots.get("me")!;
  assert.ok(d, "точки не пришли");
  const pts = [];
  for (let i = 0; i < d.length; i += 3) pts.push(d.slice(i, i + 3));
  assert.equal(pts.length, 1, JSON.stringify(pts));
  assert.deepEqual(pts[0], [O + 30 * CELL, O, 1]);
  const du = s.dots.get("foeFar")!;
  for (let i = 0; i < du.length; i += 3) assert.equal(du[i + 2], 2, "врагу пришла точка Сольгарда");
});

await test("точки рассылаются не чаще VIS_DOTS_MS; отключённый (detach) их не получает", () => {
  const s = setup();
  s.add("me", O, O);
  s.tick(VIS_DOTS_MS);
  s.dots.clear();
  s.tick(VIS_DOTS_MS / 4);
  assert.equal(s.dots.size, 0);
  s.vis.detach("me");
  s.tick(VIS_DOTS_MS);
  assert.ok(!s.dots.has("me"));
  assert.equal(s.vis.count("me"), 0);
});

done();
