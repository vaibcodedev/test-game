/**
 * PvP в открытом мире без сервера (World.hostile / canAffect / hitEx / noFight, shared/factions.ts, shared/gates.ts, «В форт» в bannerWar.ts):
 * кто кого может атаковать (своя фракция — никогда, чужая — вне городов везде, нейтральный город — удар = нарушение, отпор нарушителю,
 * внутри стен Эмберхолла — без атак), бойцы фракций, арена (команды и фаза боя), автомат ворот и проскок рывком,
 * «В форт» через каст (окно, уровень, бой, прерывание движением — без переноса и без перезарядки, перезарядка после переноса).
 * Мир с картой и мобами, без сети. Запуск: npx tsx tests/unit/pvp-world.ts
 */
import { World } from "../../server/src/game/World";
import { Player, newSave } from "../../server/src/game/Player";
import { WorldState } from "../../server/src/rooms/schema";
import { CITIES, inEmberWalls } from "../../shared/cities";
import { soldierHostile } from "../../shared/factions";
import { generateArenaMap } from "../../shared/arena";
import { GATES, crossesGate, SIEGE } from "../../shared/siege";
import { GATE_CLOSE_MS, GATE_HOLD_MS, GATE_OPEN_MS, gateAllows, gatePassable, newGate, stepGate } from "../../shared/gates";
import { nextWarStart, WAR } from "../../shared/bannerWar";
import { TELEPORT_CAST_MS } from "../../shared/cities";
import { TILE } from "../../shared/constants";
import type { ClassId } from "../../shared/classes";
import { assert, done, inbox, section, test } from "./lib";

const w = new World(new WorldState(), () => {}, { quiet: true } as never);
let uid = 0;
type P = Player & { box: ReturnType<typeof inbox> };
function hero(cls: ClassId, x: number, y: number, level = 90, ww: World = w): P {
  const box = inbox();
  const s = newSave(cls, { x, y });
  s.level = level;
  const p = new Player(`v${++uid}`, `Воин${uid}`, s, box.send) as P;
  p.box = box;
  ww.addPlayer(p);
  p.unit.x = x; p.unit.y = y;
  p.combatAt = -1e12;
  return p;
}
const drop = (...ps: Player[]) => ps.forEach((p) => w.removePlayer(p.id));
const run = (ms: number, ww: World = w) => { for (let t = 0; t < ms; t += 50) ww.update(50); };
const FIELDS = { x: 550 * TILE, y: 250 * TILE };
const ember = CITIES.find((c) => c.id === "ember")!.arrive;

section("Кто кого может атаковать");

await test("своя фракция — не враг нигде (Поля, столица, Эмберхолл)", () => {
  for (const at of [FIELDS, ember, CITIES.find((c) => c.id === "aurelion")!.arrive]) {
    const a = hero("warrior", at.x, at.y), b = hero("mage", at.x + 30, at.y);
    assert.ok(!w.hostile(a, b), `у ${at.x},${at.y}`);
    drop(a, b);
  }
});

await test("чужая фракция на Полях — враг; моб — враг всем героям", () => {
  const a = hero("warrior", FIELDS.x, FIELDS.y), b = hero("deathknight", FIELDS.x + 40, FIELDS.y);
  assert.ok(w.hostile(a, b) && w.hostile(b, a));
  assert.ok(w.canAffect(a, b));
  const mob = [...w.mobs.values()].find((m) => !m.faction && !m.def.boss)!;
  assert.ok(w.hostile(a, mob) && w.hostile(mob, b));
  assert.ok(!w.hostile(a, a));
  drop(a, b);
});

await test("Эмберхолл: удар по врагу не проходит, бьющий становится нарушителем; нарушителю можно дать отпор", () => {
  const a = hero("warrior", ember.x, ember.y), b = hero("deathknight", ember.x + 30, ember.y);
  assert.ok(w.inNeutral(a.x, a.y));
  assert.ok(!w.canAffect(a, b), "в нейтральном городе можно задеть врага");
  const hp = b.unit.hp;
  assert.equal(w.hit(a, b), 0);
  assert.equal(b.unit.hp, hp);
  assert.ok(a.outlawUntil > w.time && a.unit.outlaw === 1, "нарушитель не отмечен");
  assert.ok(w.canAffect(b, a), "отпор нарушителю запрещён");
  assert.ok(!w.canAffect(a, b), "нарушитель продолжает бить");
  drop(a, b);
});

await test("один в Эмберхолле, другой снаружи — не враги", () => {
  const a = hero("warrior", ember.x, ember.y), b = hero("deathknight", FIELDS.x, FIELDS.y);
  assert.ok(!w.hostile(a, b));
  drop(a, b);
});

await test("внутри стен Эмберхолла — запрет атак (noFight), за стенами — нет", () => {
  assert.ok(inEmberWalls(ember.x, ember.y));
  const a = hero("warrior", ember.x, ember.y), b = hero("warrior", FIELDS.x, FIELDS.y);
  assert.ok(w.noFight(a) && !w.noFight(b));
  drop(a, b);
});

await test("бойцы фракции: враг только героям мира чужой фракции", () => {
  assert.ok(soldierHostile("solgard", 0, "umbrath"));
  assert.ok(!soldierHostile("solgard", 0, "solgard"));
  assert.ok(!soldierHostile("solgard", 1, "umbrath"), "герой арены");
  assert.ok(!soldierHostile("", 0, "umbrath") && !soldierHostile("solgard", 0, ""));
  const post = [...w.mobs.values()].find((m) => m.faction === "umbrath");
  if (post) {
    const s = hero("warrior", FIELDS.x, FIELDS.y), u = hero("deathknight", FIELDS.x, FIELDS.y);
    assert.ok(w.hostile(s, post) && !w.hostile(u, post));
    const hp = post.unit.hp;
    assert.equal(w.hit(u, post), 0, "свой ранит бойца");
    assert.equal(post.unit.hp, hp);
    drop(s, u);
  }
});

await test("ушедший из мира герой (на арену) не задевается и не задевает", () => {
  const a = hero("warrior", FIELDS.x, FIELDS.y), b = hero("deathknight", FIELDS.x + 30, FIELDS.y);
  drop(b);
  assert.ok(!w.canAffect(a, b) && !w.canAffect(b, a));
  assert.equal(w.hit(a, b), 0);
  drop(a);
});

section("Арена: команды и фаза");

await test("до боя никто не враг; в бою — только разные команды; команда 0 — не участник", () => {
  const aw = new World(new WorldState(), () => {}, { map: generateArenaMap(), mobs: false, quiet: true } as never);
  const a = hero("warrior", 300, 300, 50, aw), b = hero("warrior", 340, 300, 50, aw), c = hero("deathknight", 380, 300, 50, aw), z = hero("mage", 420, 300, 50, aw);
  a.team = 1; b.team = 1; c.team = 2; z.team = 0;
  aw.pvpActive = false;
  assert.ok(!aw.hostile(a, c), "до начала боя");
  aw.pvpActive = true;
  assert.ok(aw.hostile(a, c) && aw.hostile(c, b));
  assert.ok(!aw.hostile(a, b), "своя команда");
  assert.ok(!aw.hostile(a, z) && !aw.hostile(z, c), "команда 0");
});

section("Ворота");

await test("gateAllows: свои и ничьи — да, чужие — нет, сломанные — все, запертые — никто", () => {
  assert.ok(gateAllows("solgard", "solgard") && gateAllows(null, "umbrath"));
  assert.ok(!gateAllows("solgard", "umbrath") && !gateAllows("solgard", undefined));
  assert.ok(gateAllows("solgard", "umbrath", true));
  assert.ok(!gateAllows("solgard", "solgard", false, true));
});

await test("автомат ворот: открытие → открыто → держит, пока рядом → закрывается; занятый проём не закрывается", () => {
  const g = newGate("t", "doors", 3, "solgard");
  stepGate(g, 50, true, false);
  assert.equal(g.state, "opening");
  assert.ok(!gatePassable(g));
  for (let t = 0; t < GATE_OPEN_MS; t += 50) stepGate(g, 50, true, false);
  assert.equal(g.state, "open");
  for (let t = 0; t < GATE_HOLD_MS * 2; t += 50) stepGate(g, 50, false, true);
  assert.equal(g.state, "open", "закрылись на стоящем в проёме");
  stepGate(g, 50, false, false); // выдержка уже истекла, пока стояли в проёме
  assert.equal(g.state, "closing");
  stepGate(g, 50, true, false);
  assert.equal(g.state, "opening", "подошедший не открыл закрывающиеся");
  for (let t = 0; t < GATE_OPEN_MS + GATE_HOLD_MS + GATE_CLOSE_MS * 2; t += 50) stepGate(g, 50, false, false);
  assert.equal(g.state, "closed");
  g.locked = true;
  stepGate(g, 50, true, false);
  assert.equal(g.state, "closed", "запертые открылись");
  const b = newGate("b", "leaves", 3); b.state = "broken";
  assert.ok(!stepGate(b, 50, false, false) && gatePassable(b));
});

await test("рывок сквозь закрытые чужие ворота пойман; свои, короткий шаг и слишком длинный отрезок — нет", () => {
  const g = GATES.find((x) => x.faction === "umbrath")!;
  const cx = (g.x0 + g.x1) / 2, top = g.y0 - 20, bot = g.y1 + 20;
  assert.ok(crossesGate(cx, bot, cx, top, "solgard"));
  assert.equal(crossesGate(cx, bot, cx, top, "umbrath"), null);
  assert.equal(crossesGate(cx, bot, cx, bot - 0.5, "solgard"), null);
  assert.equal(crossesGate(cx, bot + SIEGE.gates.dashTiles * TILE, cx, top - SIEGE.gates.dashTiles * TILE, "solgard"), null, "отрезок длиннее dashTiles проверяется иначе");
  assert.equal(crossesGate(cx + 10 * TILE, bot, cx + 10 * TILE, top, "solgard"), null, "мимо проёма");
});

section("«В форт» через каст");

const war = w.war!;
const start = nextWarStart(new Date(2026, 9, 28, 12).getTime());
let fake = start - (WAR.schedule.teleportMin - 2) * 60000;
war.now = () => fake;
war.update();
const fortOf = (p: Player) => CITIES.find((c) => c.id === `fort_${p.faction}`)!;
const atFort = (p: Player) => Math.hypot(p.x - fortOf(p).spawn.x, p.y - fortOf(p).spawn.y) < 2;

await test("в окне подготовки: каст 3 с, перенос в свой форт, перезарядка после переноса", () => {
  assert.equal(war.phase, "prep");
  const p = hero("warrior", FIELDS.x, FIELDS.y);
  war.teleport(p);
  assert.ok(p.tele, "каст не начался");
  assert.ok(!atFort(p), "перенос без каста");
  run(TELEPORT_CAST_MS + 200);
  assert.ok(atFort(p), "не перенесло");
  assert.ok(p.box.msgs.some((m) => m.type === "war:tpcd" && m.msg.ms > 0));
  p.unit.x = FIELDS.x; p.unit.y = FIELDS.y; p.box.clear();
  war.teleport(p);
  assert.ok(!p.tele && p.box.errors().length > 0, "перезарядка не держит");
  drop(p);
});

await test("движение рвёт каст: не перенесло и перезарядки нет", () => {
  const p = hero("deathknight", FIELDS.x, FIELDS.y);
  war.teleport(p);
  assert.ok(p.tele);
  p.input = { mx: 1, my: 0 };
  run(TELEPORT_CAST_MS + 200);
  p.input = { mx: 0, my: 0 };
  assert.ok(!atFort(p));
  assert.ok(!p.box.msgs.some((m) => m.type === "war:tpcd"), "перезарядка за прерванный каст");
  p.unit.x = FIELDS.x; p.unit.y = FIELDS.y;
  war.teleport(p);
  assert.ok(p.tele, "после прерывания нельзя снова");
  run(TELEPORT_CAST_MS + 200);
  assert.ok(atFort(p));
  drop(p);
});

await test("отказы: ниже уровня, мёртв, в бою, вне окна — ни каста, ни переноса", () => {
  const low = hero("warrior", FIELDS.x, FIELDS.y, WAR.minLevel - 1);
  const dead = hero("warrior", FIELDS.x, FIELDS.y); dead.dead = true;
  const busy = hero("warrior", FIELDS.x, FIELDS.y); busy.combatAt = w.time;
  for (const p of [low, dead, busy]) { war.teleport(p); assert.ok(!p.tele, p.name); }
  fake = start - (WAR.schedule.teleportMin + 5) * 60000;
  const early = hero("warrior", FIELDS.x, FIELDS.y);
  war.teleport(early);
  assert.ok(!early.tele && early.box.errors().length > 0, "вне окна");
  drop(low, dead, busy, early);
});

done();
