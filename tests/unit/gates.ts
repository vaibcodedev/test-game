/**
 * Все ворота игры (2026-11-02): единая модель shared/gates.ts; ворота фортов и столиц (shared/siege.ts: gateBlocks, moveGated, gateBlocker в A*,
 * crossesGate, trappedOut, gateVisTarget) — права, коллизия по всей ширине проёма, поиск пути, бойцы, питомцы, мобы, таран;
 * двери подземелья (server/src/game/dungeonGates.ts) — автомат, занятый проём, проходимость = клетки, зеркало клиента по dg:gate/dg:gates;
 * всегда открытые проёмы (поселения) — проходимы, частокол рядом без щелей.
 * Запуск: npx tsx tests/unit/gates.ts
 */
import { assert, done, section, test } from "./lib";
import { world, hero, drop } from "./fixtures";
import { World } from "../../server/src/game/World";
import { WorldState } from "../../server/src/rooms/schema";
import { Mob } from "../../server/src/game/Mob";
import { Pet, petStep } from "../../server/src/game/Pet";
import { Player, newSave } from "../../server/src/game/Player";
import { Soldiers } from "../../server/src/game/soldiers";
import { DungeonGates, DG_NEAR, dgBusy, type DgGateMsg } from "../../server/src/game/dungeonGates";
import { GATE_CLOSE_MS, GATE_HOLD_MS, GATE_OPEN_MS, gateAllows, gatePassable, newGate, stepGate } from "../../shared/gates";
import { GATE_BROKEN, GATES, crossesGate, gateBlocker, gateBlocks, gateCellBlocks, gateVisTarget, moveGated, trappedOut, type GateDef } from "../../shared/siege";
import { CELL_BLOCK, moveWithCollision, walkable } from "../../shared/map";
import { findPath, Nav, segmentWalkable } from "../../shared/path";
import { DUNGEON_GATES, generateDungeonMap } from "../../shared/dungeon";
import { SETTLEMENTS, gateCells } from "../../shared/settlements";
import { PLAYER_RADIUS, TILE } from "../../shared/constants";
import { CLASSES, classFaction, type ClassId } from "../../shared/classes";
import { MOBS, MOB_AI } from "../../shared/mobs";
import { PETS } from "../../shared/pets";
import { GP } from "../../shared/gameplay";
import { readFileSync } from "node:fs";

const R = PLAYER_RADIUS;
const w = world();
const M = w.map;
// мир тестов без мобов (mobs: false) — без осады; ворота городов в мире держит FortSiege: подставляем заглушку, чтобы World.move/place/gateBlk работали как в игре
(w as unknown as { siege: unknown }).siege = { update() {}, onKill() {} };
const clsOf = (f: string) => (Object.keys(CLASSES) as ClassId[]).find((c) => classFaction(c) === f)!;
const foeOf = (f: string) => (f === "solgard" ? "umbrath" : "solgard");
/** Где точка относительно ряда стены ворот: −1 выше, +1 ниже, 0 — в ряду. */
const rowSide = (g: GateDef, y: number) => (y < g.y0 ? -1 : y >= g.y1 ? 1 : 0);
/** Наружу и внутрь от ворот (px): out — перед воротами снаружи, inn — во дворе. */
const outIn = (g: GateDef) => {
  const s = g.side === "n" ? -1 : 1;
  return { out: { x: g.x, y: g.y + s * 2 * TILE }, inn: { x: g.x, y: g.y - s * 2 * TILE }, s };
};
const withBroken = <T>(id: string, fn: () => T): T => { GATE_BROKEN.add(id); try { return fn(); } finally { GATE_BROKEN.delete(id); } };

section("модель ворот (shared/gates.ts)");
await test("gateAllows: своя/чужая/нейтральные, без фракции, сломанные — всем, запертые — никому", () => {
  assert.ok(gateAllows("solgard", "solgard") && gateAllows(null, "umbrath") && gateAllows(null, undefined));
  assert.ok(!gateAllows("solgard", "umbrath") && !gateAllows("solgard", undefined) && !gateAllows("solgard", ""));
  assert.ok(gateAllows("solgard", "umbrath", true) && gateAllows("solgard", undefined, true, true), "сломанные пропускают всех, даже запертые");
  assert.ok(!gateAllows("solgard", "solgard", false, true) && !gateAllows(null, "umbrath", false, true), "запертые — никого, и нейтральные");
});
await test("gatePassable: открытие с t ≥ 0,6, закрытие до t ≥ 0,34; закрытые — нет, открытые и сломанные — да", () => {
  assert.ok(!gatePassable({ state: "closed", t: 0 }) && gatePassable({ state: "open", t: 1 }) && gatePassable({ state: "broken", t: 0 }));
  assert.ok(!gatePassable({ state: "opening", t: 0.59 }) && gatePassable({ state: "opening", t: 0.6 }));
  assert.ok(gatePassable({ state: "closing", t: 0.34 }) && !gatePassable({ state: "closing", t: 0.33 }));
});
await test("stepGate: полный цикл по времени closed → opening → open → (выдержка) → closing → closed", () => {
  const g = newGate("t", "doors", 3);
  assert.ok(stepGate(g, 50, true, false) && g.state === "opening");
  let ms = 0;
  while (g.state === "opening") { stepGate(g, 50, true, false); ms += 50; }
  assert.equal(g.state, "open");
  assert.ok(Math.abs(ms - GATE_OPEN_MS) <= 50, `ход открытия ${ms} мс`);
  ms = 0;
  while (g.state === "open") { stepGate(g, 50, false, false); ms += 50; }
  assert.ok(Math.abs(ms - GATE_HOLD_MS) <= 50, `выдержка ${ms} мс`);
  ms = 0;
  while (g.state === "closing") { stepGate(g, 50, false, false); ms += 50; }
  assert.equal(g.state, "closed");
  assert.ok(Math.abs(ms - GATE_CLOSE_MS) <= 100, `ход закрытия ${ms} мс`);
});
await test("stepGate: занятый проём (busy) не закрывается, сколько бы ни стоял; подход при закрытии — снова открытие", () => {
  const g = newGate("t", "portcullis", 3);
  for (let t = 0; t < GATE_OPEN_MS + 100; t += 50) stepGate(g, 50, true, false);
  for (let t = 0; t < GATE_HOLD_MS * 4; t += 50) stepGate(g, 50, false, true);
  assert.equal(g.state, "open", "закрылись на юните в проёме");
  stepGate(g, 50, false, false);
  assert.equal(g.state, "closing");
  stepGate(g, 50, true, false);
  assert.equal(g.state, "opening", "подошедший при закрытии снова открывает");
  assert.ok(g.t > 0.9, "створки идут обратно с места, а не с нуля");
});
await test("stepGate: запертые не открываются; запертые открытыми — закрываются после выдержки; сломанные не меняются", () => {
  const g = newGate("t", "leaves", 3, "solgard");
  g.locked = true;
  for (let t = 0; t < 3000; t += 50) stepGate(g, 50, true, false);
  assert.equal(g.state, "closed");
  g.locked = false;
  for (let t = 0; t < GATE_OPEN_MS + 100; t += 50) stepGate(g, 50, true, false);
  g.locked = true; // бой с боссом начался, пока открыто
  for (let t = 0; t < GATE_HOLD_MS + GATE_CLOSE_MS + 200; t += 50) stepGate(g, 50, true, false);
  assert.equal(g.state, "closed", "запертые остались открытыми");
  const b = newGate("b", "leaves", 3); b.state = "broken";
  for (let t = 0; t < 3000; t += 50) assert.ok(!stepGate(b, 50, t % 100 === 0, false));
  assert.ok(gatePassable(b) && b.state === "broken");
});

section("ворота фортов и столиц: карта и коллизия (shared/siege.ts)");
await test("у каждых ворот: проём на карте проходим, столбы стены по бокам непроходимы — щели у края нет", () => {
  assert.ok(GATES.length >= 8, `ворот ${GATES.length}`);
  for (const g of GATES) {
    for (let tx = g.tx0; tx <= g.tx1; tx++) assert.ok(!(M.cell[g.ty * M.w + tx] & CELL_BLOCK), `${g.id}: клетка проёма ${tx},${g.ty} закрыта картой`);
    for (const tx of [g.tx0 - 1, g.tx1 + 1]) assert.ok(M.cell[g.ty * M.w + tx] & CELL_BLOCK, `${g.id}: стена у проёма ${tx},${g.ty} проходима — щель`);
    assert.ok(walkable(M, g.x, g.y, R), `${g.id}: середина проёма непроходима для своих`);
  }
});
await test("gateBlocks: чужому закрыта вся ширина проёма (каждый px), своему — открыта; без фракции — закрыта", () => {
  for (const g of GATES) {
    const foe = foeOf(g.faction);
    for (let x = g.x0 + R; x <= g.x1 - R; x += 1) {
      assert.ok(gateBlocks(x, g.y, R, foe) && gateBlocks(x, g.y, R, ""), `${g.id}: чужой проходит в x=${x}`);
      assert.ok(!gateBlocks(x, g.y, R, g.faction), `${g.id}: свой упирается в x=${x}`);
    }
  }
});
await test("moveGated: чужой не проходит прямо ни по одной полосе проёма и упирается вплотную (зазор ≤ 2 px)", () => {
  for (const g of GATES) {
    const foe = foeOf(g.faction), { out, s } = outIn(g);
    for (let x = g.x0 + R; x < g.x1 - R; x += 2) { // x1 − R ровно — тело на границе клетки стены: держит карта, не ворота
      let p = { x, y: out.y };
      for (let i = 0; i < 80; i++) p = moveGated(M, p.x, p.y, 0, -s * 4, R, foe);
      assert.equal(rowSide(g, p.y), rowSide(g, out.y), `${g.id}: чужой прошёл по полосе x=${x}`);
      const gap = s < 0 ? g.y0 - (p.y + R * 0.5) : p.y - R * 0.5 - g.y1;
      assert.ok(gap >= 0 && gap <= 2, `${g.id}: встал в ${gap.toFixed(2)} px от ворот`);
    }
  }
});
await test("moveGated: по диагонали и вдоль ворот, у угла проёма — чужой не пролезает; свой проходит насквозь", () => {
  for (const g of GATES) {
    const foe = foeOf(g.faction), { out, inn, s } = outIn(g);
    for (const [dx, dy] of [[3, -3], [-3, -3], [4, -1], [-4, -1], [1, -4], [-1, -4]]) for (const x0 of [g.x0 - 20, g.x0 + R, g.x - 4, g.x1 - R, g.x1 + 20]) {
      let p = { x: x0, y: out.y };
      for (let i = 0; i < 120; i++) {
        const n = moveGated(M, p.x, p.y, dx, -s * Math.abs(dy), R, foe); // внутрь двора, вбок
        p = n;
        assert.ok(!gateBlocks(p.x, p.y, R, foe), `${g.id}: чужой влез в ворота (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
      }
      assert.notEqual(rowSide(g, p.y), -rowSide(g, out.y), `${g.id}: чужой пролез по диагонали ${dx},${dy} от x=${x0}`);
    }
    let q = { ...out };
    for (let i = 0; i < 60; i++) q = moveGated(M, q.x, q.y, 0, -s * 4, R, g.faction);
    assert.equal(rowSide(g, q.y), rowSide(g, inn.y), `${g.id}: свой не прошёл ворота (${q.x}, ${q.y})`);
  }
});
await test("сломанные ворота: чужой проходит насквозь; починили, пока стоял в проёме, — выходит в любую сторону", () => {
  const g = GATES.find((q) => q.siege)!, foe = foeOf(g.faction), { out, inn, s } = outIn(g);
  withBroken(g.id, () => {
    let p = { ...out };
    for (let i = 0; i < 60; i++) p = moveGated(M, p.x, p.y, 0, -s * 4, R, foe);
    assert.equal(rowSide(g, p.y), rowSide(g, inn.y), "через пролом не прошёл");
  });
  for (const dir of [1, -1]) {
    let p = { x: g.x, y: g.y };
    assert.ok(gateBlocks(p.x, p.y, R, foe));
    for (let i = 0; i < 20; i++) p = moveGated(M, p.x, p.y, 0, dir * 4, R, foe);
    assert.ok(!gateBlocks(p.x, p.y, R, foe), `застрял в починенных воротах (шаг ${dir})`);
  }
});
await test("moveGated = moveWithCollision, где ворот нет или они свои (то же предсказание у клиента, выход из воды тоже)", () => {
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 7919) % (M.w * TILE - 200)) + 100, y = ((i * 104729) % (M.h * TILE - 200)) + 100;
    const dx = ((i % 9) - 4) * 1.7, dy = (((i * 3) % 9) - 4) * 1.7;
    for (const f of ["solgard", "umbrath"]) {
      if (gateBlocks(x, y, R, f) || gateBlocks(x + dx, y + dy, R, f)) continue;
      const a = moveGated(M, x, y, dx, dy, R, f), b = moveWithCollision(M, x, y, dx, dy, R);
      if (gateBlocks(b.x, b.y, R, f)) continue;
      assert.deepEqual(a, b, `(${x}, ${y}) шаг ${dx},${dy} ${f}`);
      n++;
    }
  }
  assert.ok(n > 1000, `проверок ${n}`);
});
await test("crossesGate: рывок сквозь закрытые чужому ворота пойман; свой, сломанные, мимо проёма — нет", () => {
  for (const g of GATES) {
    const foe = foeOf(g.faction), { out, inn } = outIn(g);
    assert.equal(crossesGate(out.x, out.y, inn.x, inn.y, foe)?.id, g.id);
    assert.equal(crossesGate(out.x, out.y, inn.x, inn.y, g.faction), null);
    withBroken(g.id, () => assert.equal(crossesGate(out.x, out.y, inn.x, inn.y, foe), null));
    assert.equal(crossesGate(out.x + 6 * TILE, out.y, inn.x + 6 * TILE, inn.y, foe), null, "сквозь стену рядом — не ворота");
  }
});

section("поиск пути учитывает ворота (shared/path.ts PathBlock)");
/** Пересекает ли ломаная ряд стены ворот в пределах проёма. */
const pathCrosses = (g: GateDef, from: { x: number; y: number }, pts: { x: number; y: number }[]) => {
  let a = from;
  for (const b of pts) {
    if (rowSide(g, a.y) !== rowSide(g, b.y) && Math.min(a.x, b.x) < g.x1 + 4 && Math.max(a.x, b.x) > g.x0 - 4) return true;
    a = b;
  }
  return false;
};
await test("gateCellBlocks совпадает с gateBlocks в центрах клеток проёма; соседние клетки не закрыты", () => {
  for (const g of GATES) {
    const foe = foeOf(g.faction);
    for (let tx = g.tx0; tx <= g.tx1; tx++) {
      assert.ok(gateCellBlocks(tx, g.ty, foe) && gateBlocks((tx + 0.5) * TILE, (g.ty + 0.5) * TILE, R, foe));
      assert.ok(!gateCellBlocks(tx, g.ty, g.faction));
      withBroken(g.id, () => assert.ok(!gateCellBlocks(tx, g.ty, foe)));
    }
    for (const [cx, cy] of [[g.tx0, g.ty - 1], [g.tx0, g.ty + 1], [g.tx1 + 2, g.ty]]) assert.ok(!gateCellBlocks(cx, cy, foe));
  }
});
await test("findPath: чужому путь во двор не идёт через ворота (с gateBlocker), своему — идёт; без ворот A* вёл в ворота", () => {
  for (const g of GATES) {
    const foe = foeOf(g.faction), { out, inn } = outIn(g);
    const raw = findPath(M, out.x, out.y, inn.x, inn.y, R, 6000);
    assert.ok(raw && pathCrosses(g, out, raw), `${g.id}: без ворот путь не через проём — тест не про то`);
    const own = findPath(M, out.x, out.y, inn.x, inn.y, R, 6000, gateBlocker(g.faction));
    assert.ok(own && pathCrosses(g, out, own), `${g.id}: своему путь не через ворота`);
    const fp = findPath(M, out.x, out.y, inn.x, inn.y, R, 6000, gateBlocker(foe)) ?? [];
    assert.ok(!pathCrosses(g, out, fp), `${g.id}: чужому путь через закрытые ворота`);
    for (const p of fp) assert.ok(!gateBlocks(p.x, p.y, R, foe), `${g.id}: точка пути в воротах`);
    withBroken(g.id, () => assert.ok(pathCrosses(g, out, findPath(M, out.x, out.y, inn.x, inn.y, R, 6000, gateBlocker(foe)) ?? []), `${g.id}: через пролом путь не идёт`));
  }
});
await test("segmentWalkable и Nav.next: прямая сквозь закрытые ворота не видна чужому, видна своему", () => {
  const g = GATES[0], foe = foeOf(g.faction), { out, inn } = outIn(g);
  assert.ok(segmentWalkable(M, out.x, out.y, inn.x, inn.y, R) && segmentWalkable(M, out.x, out.y, inn.x, inn.y, R, gateBlocker(g.faction)));
  assert.ok(!segmentWalkable(M, out.x, out.y, inn.x, inn.y, R, gateBlocker(foe)));
  const nav = new Nav();
  const wp = nav.next(M, out.x, out.y, inn.x, inn.y, R, 0, gateBlocker(foe));
  assert.ok(!wp || !(wp.x === inn.x && wp.y === inn.y), "Nav ведёт чужого прямо в ворота");
});

section("кто проходит в мире: герой, моб, питомец, боец фракции (World.move / gateBlk)");
const fortGate = GATES.find((q) => q.siege)!;
const FG = outIn(fortGate);
await test("герой: чужой (WASD) упирается в ворота, свой проходит; клик во двор — чужой не лезет в ворота, свой доходит", () => {
  const foe = foeOf(fortGate.faction);
  for (const [f, through] of [[foe, false], [fortGate.faction, true]] as const) {
    const p = hero(w, clsOf(f), FG.out);
    try {
      p.input.mx = 0; p.input.my = -FG.s;
      for (let i = 0; i < 40; i++) w.updatePlayer(p, 0.05);
      assert.equal(rowSide(fortGate, p.unit.y) === rowSide(fortGate, FG.inn.y), through, `${f}: WASD ${through ? "не прошёл" : "прошёл"}`);
      p.input.my = 0;
      p.unit.x = FG.out.x; p.unit.y = FG.out.y; p.nav.reset();
      for (let i = 0; i < 60; i++) {
        w.stepToward(p, FG.inn.x, FG.inn.y, 0.05, 0);
        assert.ok(!gateBlocks(p.unit.x, p.unit.y, R, f), `${f}: клик-ход влез в ворота`);
      }
      assert.equal(Math.hypot(p.unit.x - FG.inn.x, p.unit.y - FG.inn.y) < 4, through, `${f}: клик-ход ${through ? "не дошёл" : "прошёл"} (${p.unit.x}, ${p.unit.y})`);
    } finally { drop(w, p); }
  }
});
const plainDef = Object.values(MOBS).find((d) => !d.boss && !MOB_AI[d.id]?.weak)!;
await test("моб без фракции и моб чужой фракции не проходят ворота и не влезают в них (World.moveMob)", () => {
  for (const f of ["", foeOf(fortGate.faction)]) {
    const m = new Mob(w.uid("m"), plainDef, 30, FG.out);
    m.faction = f;
    w.addMob(m);
    m.unit.x = FG.out.x; m.unit.y = FG.out.y;
    try {
      const mv = (w as never as { moveMob(m: Mob, gx: number, gy: number, dt: number, s: number, st?: number): boolean });
      const r = Math.min(12, plainDef.radius * 0.6);
      for (let i = 0; i < 80; i++) {
        mv.moveMob(m, FG.inn.x, FG.inn.y, 0.05, 200, 0);
        assert.ok(!gateBlocks(m.unit.x, m.unit.y, r, f), `моб «${f}» влез в ворота`);
      }
      assert.equal(rowSide(fortGate, m.unit.y), rowSide(fortGate, FG.out.y), `моб «${f}» прошёл`);
    } finally { w.mobs.delete(m.id); }
  }
  // мобы фракции ворот (отряды) в города не заходят вовсе (World.inTown), их шаг — Soldiers.move ниже; сам шаг World.move своим открыт
  const n = w.move(FG.out.x, FG.out.y, 0, -FG.s * 40, 10, fortGate.faction);
  assert.ok(Math.abs(n.y - FG.out.y) > 30);
});
await test("питомец идёт по фракции хозяина: питомец чужого не проходит, питомец своего — проходит (раньше шёл сквозь все ворота)", () => {
  for (const [f, through] of [[foeOf(fortGate.faction), false], [fortGate.faction, true]] as const) {
    const p = hero(w, clsOf(f), { x: FG.out.x, y: FG.out.y + FG.s * 40 });
    const pet = new Pet(Object.values(PETS)[0], p, 10);
    pet.unit.x = FG.out.x; pet.unit.y = FG.out.y;
    try {
      for (let i = 0; i < 80; i++) petStep(w, pet, FG.inn.x, FG.inn.y, 0.05, 200, 0);
      assert.equal(rowSide(fortGate, pet.unit.y) === rowSide(fortGate, FG.inn.y), through, `питомец ${f} (${pet.unit.x}, ${pet.unit.y})`);
      assert.ok(!gateBlocks(pet.unit.x, pet.unit.y, GP.misc.petMoveRadius, f));
    } finally { drop(w, p); }
  }
});
await test("боец фракции (Soldiers.move): чужой отряд не проходит ворота, свой — проходит (раньше бойцы шли сквозь чужие ворота)", () => {
  const S = Object.assign(Object.create(Soldiers.prototype), { w }) as { move(m: Mob, gx: number, gy: number, dt: number, s: number, st?: number): boolean };
  for (const [f, through] of [[foeOf(fortGate.faction), false], [fortGate.faction, true]] as const) {
    const m = new Mob(w.uid("m"), plainDef, 30, FG.out);
    m.faction = f;
    m.unit.x = FG.out.x; m.unit.y = FG.out.y;
    const sv = { px: FG.out.x, py: FG.out.y, wx: FG.out.x, wy: FG.out.y, syncAt: 0, foe: null, mobFoe: null };
    m.soldier = sv as never;
    for (let i = 0; i < 80; i++) S.move(m, FG.inn.x, FG.inn.y, 0.05, 200, 0);
    assert.equal(rowSide(fortGate, sv.py) === rowSide(fortGate, FG.inn.y), through, `боец ${f} (${sv.px}, ${sv.py})`);
  }
});
await test("таран нападающих идёт к воротам по пути с воротами, жители — только своих городов (код)", () => {
  const src = readFileSync("server/src/game/siege.ts", "utf8");
  assert.match(src, /unTrap\(p\)/, "конец осады не выводит чужих из форта");
  assert.match(readFileSync("server/src/rooms/WorldRoom.ts", "utf8"), /this\.world\.unTrap\(p\)/, "вход в мир не выводит запертых");
  assert.match(src, /nav\.next\([^)]*gateBlk\(this\.att\)\)/, "таран: путь без ворот");
  assert.match(src, /this\.w\.move\(.*this\.att\)/, "таран: шаг без ворот");
  for (const f of ["server/src/game/Pet.ts", "server/src/game/soldiers.ts"]) assert.doesNotMatch(readFileSync(f, "utf8"), /moveWithCollision\(/, `${f}: шаг мимо ворот`);
});

section("взаперти и картинка ворот");
await test("trappedOut: чужой во дворе форта при целых воротах — выход перед воротами снаружи; свой, пролом, вне стен — нет", () => {
  for (const g of GATES) {
    const foe = foeOf(g.faction), { inn } = outIn(g);
    const o = trappedOut(inn.x, inn.y, foe);
    assert.ok(o, `${g.id}: чужой во дворе не заперт`);
    assert.ok(walkable(M, o!.x, o!.y, R) && !gateBlocks(o!.x, o!.y, R, foe) && !trappedOut(o!.x, o!.y, foe), `${g.id}: точка выхода (${o!.x}, ${o!.y}) плохая`);
    assert.equal(trappedOut(inn.x, inn.y, g.faction), null);
    withBroken(g.id, () => assert.equal(trappedOut(inn.x, inn.y, foe), null, "в пролом может выйти сам"));
    assert.equal(trappedOut(outIn(g).out.x, outIn(g).out.y, foe), null);
  }
});
await test("World.unTrap (вход в мир, WorldRoom.onJoin; конец осады): чужой в форте — у ворот снаружи; свой — где был", () => {
  for (const [f, moved] of [[foeOf(fortGate.faction), true], [fortGate.faction, false]] as const) {
    const save = newSave(clsOf(f), FG.inn);
    const p = new Player(`gt_${f}`, `Ворота_${f}`, save, () => {});
    p.unit.x = FG.inn.x; p.unit.y = FG.inn.y;
    w.addPlayer(p);
    try {
      assert.equal(w.unTrap(p), moved);
      assert.equal(p.unit.x !== FG.inn.x || p.unit.y !== FG.inn.y, moved, f);
      if (moved) assert.equal(trappedOut(p.unit.x, p.unit.y, f), null);
    } finally { drop(w, p); }
  }
});
await test("gateVisTarget: створки открываются только смотрящему, кто сам пройдёт; пролом — кадр пролома (0)", () => {
  assert.equal(gateVisTarget("solgard", "solgard", false, true), 1);
  assert.equal(gateVisTarget("solgard", "solgard", false, false), 0);
  assert.equal(gateVisTarget("solgard", "umbrath", false, true), 0, "чужой видит открытые ворота, в которые упирается");
  assert.equal(gateVisTarget("solgard", undefined, false, true), 0);
  assert.equal(gateVisTarget("solgard", "solgard", true, true), 0);
  assert.match(readFileSync("client/src/game/siegeView.ts", "utf8"), /gateVisTarget\(v\.g\.faction, net\.self\?\.faction/, "siegeView не по gateVisTarget");
});

section("двери подземелья (server/src/game/dungeonGates.ts)");
const dw = new World(new WorldState(), () => {}, { map: generateDungeonMap(), dungeon: true, quiet: true, mobs: false } as never);
const DM = dw.map;
const DG = new DungeonGates(dw);
const blocked = (id: string) => DUNGEON_GATES.find((g) => g.id === id)!.cells.every(([cx, cy]) => !!(DM.cell[cy * DM.w + cx] & CELL_BLOCK));
const freeCells = (id: string) => DUNGEON_GATES.find((g) => g.id === id)!.cells.every(([cx, cy]) => !(DM.cell[cy * DM.w + cx] & CELL_BLOCK));
/** Клиент: копия клеток карты, правится только сообщениями dg:gate / dg:gates (как GameScene). */
const client = new Uint8Array(DM.cell.length);
client.set(DM.cell as never);
const clientApply = (m: DgGateMsg) => { for (const [cx, cy] of DUNGEON_GATES.find((g) => g.id === m.id)!.cells) { const i = cy * DM.w + cx; if (m.pass) client[i] &= ~CELL_BLOCK; else client[i] |= CELL_BLOCK; } };
const mirrorOk = () => DUNGEON_GATES.every((g) => g.cells.every(([cx, cy]) => (client[cy * DM.w + cx] & CELL_BLOCK) === (DM.cell[cy * DM.w + cx] & CELL_BLOCK)));
const tick = (ms: number) => { for (let t = 0; t < ms; t += 50) for (const m of DG.tick(50)) clientApply(m); };
const G0 = DUNGEON_GATES[0];
const before = (g: typeof G0, k = 2) => ({ x: g.cx, y: g.cy - k * TILE });
await test("при создании все двери закрыты: клетки просвета непроходимы, снимок — пустой", () => {
  assert.ok(DUNGEON_GATES.length >= 2);
  for (const g of DUNGEON_GATES) assert.ok(blocked(g.id), g.id);
  assert.deepEqual(DG.snapshot(), { open: [], pass: [] });
});
await test("герой подошёл: open сразу, pass — с середины хода; клетки = pass у сервера и у клиента в каждый момент (без «резинки»)", () => {
  const p = hero(dw, "warrior", before(G0));
  try {
    const msgs: DgGateMsg[] = [];
    for (let t = 0; t < GATE_OPEN_MS + 200; t += 50) for (const m of DG.tick(50)) { msgs.push(m); clientApply(m); assert.ok(mirrorOk(), `клиент ≠ сервер на ${t} мс`); }
    const mine = msgs.filter((m) => m.id === G0.id);
    assert.ok(mine[0]?.open && !mine[0].pass, "первое сообщение: створки пошли, проход ещё закрыт");
    assert.ok(mine.some((m) => m.open && m.pass), "проход открылся");
    assert.ok(freeCells(G0.id));
    assert.ok(DG.snapshot().open.includes(G0.id) && DG.snapshot().pass.includes(G0.id));
    // ушёл: выдержка, закрытие, клетки закрыты; клиент так же
    p.unit.x = G0.cx; p.unit.y = G0.cy - 10 * TILE;
    for (let t = 0; t < GATE_HOLD_MS + GATE_CLOSE_MS + 400; t += 50) for (const m of DG.tick(50)) { clientApply(m); assert.ok(mirrorOk(), `закрытие: клиент ≠ сервер на ${t} мс`); }
    assert.ok(blocked(G0.id) && !DG.snapshot().open.includes(G0.id));
  } finally { drop(dw, p); }
});
await test("мёртвый герой не открывает; далеко (за DG_NEAR) — не открывает", () => {
  const p = hero(dw, "warrior", before(G0));
  try {
    p.dead = true;
    tick(1500);
    assert.ok(blocked(G0.id), "мёртвый открыл");
    p.dead = false;
    p.unit.x = G0.cx + DG_NEAR.x + 40; p.unit.y = G0.cy;
    tick(1500);
    assert.ok(blocked(G0.id), "дальний открыл");
  } finally { drop(dw, p); }
});
await test("не закрываются на юните в просвете: герой, моб, питомец; ушёл — закрываются", () => {
  const cell = G0.cells[Math.floor(G0.cells.length / 2)], mid = { x: (cell[0] + 0.5) * TILE, y: (cell[1] + 0.5) * TILE };
  const p = hero(dw, "warrior", before(G0));
  tick(GATE_OPEN_MS + 200);
  assert.ok(freeCells(G0.id));
  p.unit.x = G0.cx; p.unit.y = G0.cy - 10 * TILE;
  const m = new Mob(dw.uid("m"), plainDef, 30, mid);
  dw.addMob(m); m.unit.x = mid.x; m.unit.y = mid.y;
  try {
    assert.ok(dgBusy(G0, m.unit));
    tick(GATE_HOLD_MS * 3);
    assert.ok(freeCells(G0.id), "закрылись на мобе в проёме");
    dw.mobs.delete(m.id);
    const pet = new Pet(Object.values(PETS)[0], p, 10);
    pet.unit.x = mid.x; pet.unit.y = mid.y;
    dw.pets.set(pet.id, pet);
    tick(GATE_HOLD_MS * 3);
    assert.ok(freeCells(G0.id), "закрылись на питомце в проёме");
    dw.pets.delete(pet.id);
    p.unit.x = mid.x; p.unit.y = mid.y + 6;
    tick(GATE_HOLD_MS * 3);
    assert.ok(freeCells(G0.id), "закрылись на герое в проёме");
    p.unit.x = G0.cx; p.unit.y = G0.cy - 10 * TILE;
    tick(GATE_HOLD_MS + GATE_CLOSE_MS + 400);
    assert.ok(blocked(G0.id) && mirrorOk());
  } finally { dw.mobs.delete(m.id); drop(dw, p); }
});
await test("закрытая дверь держит по всей ширине (шаг и A*), открытая проходима целиком", () => {
  const g = G0, ys = g.cy - 2 * TILE, ye = g.cy + 2 * TILE;
  const x0 = (g.cells[0][0]) * TILE + R, x1 = (g.cells[g.cells.length - 1][0] + 1) * TILE - R;
  assert.ok(blocked(g.id));
  for (let x = x0; x <= x1; x += 2) {
    let p = { x, y: ys };
    for (let i = 0; i < 60; i++) p = moveWithCollision(DM, p.x, p.y, 0, 4, R);
    assert.ok(p.y < g.cy - TILE / 2, `сквозь закрытую дверь по полосе x=${x}`);
  }
  assert.ok(!segmentWalkable(DM, g.cx, ys, g.cx, ye, R));
  const h = hero(dw, "warrior", before(g));
  try {
    tick(GATE_OPEN_MS + 200);
    for (let x = g.cx - 4; x <= g.cx + 4; x += 2) { // середина: у краёв просвета коридор за дверью уже — держит карта, не дверь
      let p = { x, y: ys };
      for (let i = 0; i < 60; i++) p = moveWithCollision(DM, p.x, p.y, 0, 4, R);
      assert.ok(p.y > g.cy + TILE / 2, `открытая дверь держит полосу x=${x} (${p.x}, ${p.y})`);
    }
  } finally { drop(dw, h); tick(GATE_HOLD_MS + GATE_CLOSE_MS + 400); }
});
await test("вход в подземелье при открытой двери: снимок dg:gates = текущее состояние (переподключение)", () => {
  const h = hero(dw, "warrior", before(G0));
  try {
    tick(GATE_OPEN_MS + 200);
    const snap = DG.snapshot(), fresh = new Uint8Array(DM.cell.length);
    fresh.set(DM.cell as never);
    for (const g of DUNGEON_GATES) for (const [cx, cy] of g.cells) { const i = cy * DM.w + cx; if (snap.pass.includes(g.id)) fresh[i] &= ~CELL_BLOCK; else fresh[i] |= CELL_BLOCK; }
    assert.ok(DUNGEON_GATES.every((g) => g.cells.every(([cx, cy]) => fresh[cy * DM.w + cx] === DM.cell[cy * DM.w + cx])));
    assert.ok(snap.open.includes(G0.id) && snap.pass.includes(G0.id));
  } finally { drop(dw, h); }
});

section("всегда открытые проёмы: поселения");
await test("ворота поселений: проём из 3 клеток проходим, частокол сразу за ним непроходим", () => {
  assert.ok(SETTLEMENTS.length > 0);
  for (const s of SETTLEMENTS) {
    const cells = gateCells(s);
    assert.equal(cells.length, 3, s.id);
    for (const [x, y] of cells) assert.ok(walkable(M, (x + 0.5) * TILE, (y + 0.5) * TILE, R), `${s.id}: проём ${x},${y} закрыт`);
    const [a, b] = [cells[0], cells[2]], horiz = a[1] === b[1];
    const outer = horiz ? [[Math.min(a[0], b[0]) - 1, a[1]], [Math.max(a[0], b[0]) + 1, a[1]]] : [[a[0], Math.min(a[1], b[1]) - 1], [a[0], Math.max(a[1], b[1]) + 1]];
    for (const [x, y] of outer) assert.ok(M.cell[y * M.w + x] & CELL_BLOCK, `${s.id}: частокол ${x},${y} проходим`);
  }
});

done();
