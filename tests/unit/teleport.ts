/**
 * Телепорты между городами без сервера (мир с картой и мобами, без сети): цена списывается один раз и только по прибытии,
 * прерывание (движение, смерть, нехватка золота к концу каста) — без списания, запреты (бой, неизвестный город, вражеская столица).
 * Запуск: npx tsx tests/unit/teleport.ts
 */
import { World } from "../../server/src/game/World";
import { Player, newSave } from "../../server/src/game/Player";
import { WorldState } from "../../server/src/rooms/schema";
import { startTeleport } from "../../server/src/game/cities";
import { CITIES, homeCity, teleportPrice, isEnemyCapital, TELEPORT_CAST_MS, type City } from "../../shared/cities";
import { assert, done, section, test } from "./lib";

const w = new World(new WorldState(), () => {}, { quiet: true } as never);
let uid = 0;
function atStone(c: City, cls: "warrior" | "deathknight" = "warrior"): Player {
  const s = newSave(cls, { x: c.stone.x, y: c.stone.y });
  s.level = 50;
  s.cities = CITIES.map((x) => x.id); // все открыты: проверяем запреты, а не открытие
  const p = new Player(`t${++uid}`, `Путник${uid}`, s, () => {});
  w.addPlayer(p);
  p.unit.x = c.stone.x;
  p.unit.y = c.stone.y - 14;
  p.combatAt = -1e12;
  return p;
}
const run = (ms: number) => { for (let t = 0; t < ms; t += 50) w.update(50); };
const from = homeCity("solgard");
const dest = CITIES.find((c) => c.id !== from.id && !isEnemyCapital(c, "solgard"))!;

section("Телепорты");

await test("цена: 50…200 для любой пары городов, симметрична", () => {
  for (const a of CITIES) for (const b of CITIES) if (a !== b) {
    const v = teleportPrice(a, b);
    assert.ok(v >= 50 && v <= 200, `${a.id}→${b.id}: ${v}`);
    assert.equal(v, teleportPrice(b, a));
  }
});

await test("полный каст: герой в городе назначения, золото списано ровно один раз", () => {
  const p = atStone(from);
  const price = teleportPrice(from, dest);
  p.save.gold = price + 7;
  startTeleport(w, p, dest.id);
  assert.ok(p.tele, "каст не начался");
  startTeleport(w, p, dest.id); // повторный запрос во время каста
  run(TELEPORT_CAST_MS + 200);
  assert.ok(Math.hypot(p.x - dest.arrive.x, p.y - dest.arrive.y) < 2, "не прибыл");
  assert.equal(p.save.gold, 7);
  run(1000);
  assert.equal(p.save.gold, 7, "списано повторно");
  w.removePlayer(p.id);
});

await test("золото потрачено во время каста — телепорт отменяется без списания и без перемещения", () => {
  const p = atStone(from);
  const price = teleportPrice(from, dest);
  p.save.gold = price;
  startTeleport(w, p, dest.id);
  p.save.gold = price - 1;
  const x = p.x;
  run(TELEPORT_CAST_MS + 200);
  assert.equal(p.save.gold, price - 1);
  assert.equal(p.x, x);
  w.removePlayer(p.id);
});

await test("движение и смерть прерывают каст без списания", () => {
  const p = atStone(from);
  p.save.gold = 1000;
  startTeleport(w, p, dest.id);
  p.input.mx = 1;
  run(TELEPORT_CAST_MS + 200);
  p.input.mx = 0;
  assert.equal(p.save.gold, 1000);
  assert.ok(Math.hypot(p.x - dest.arrive.x, p.y - dest.arrive.y) > 100);
  const q = atStone(from);
  q.save.gold = 1000;
  startTeleport(w, q, dest.id);
  w.killPlayer(q);
  run(TELEPORT_CAST_MS + 200);
  assert.equal(q.save.gold, 1000);
  assert.equal(q.tele, null);
  w.removePlayer(p.id);
  w.removePlayer(q.id);
});

await test("отказ: в бою, не у камня, тот же город, несуществующий, вражеская столица, не хватает золота", () => {
  const p = atStone(from);
  p.save.gold = 1e6;
  p.combatAt = w.time;
  startTeleport(w, p, dest.id);
  assert.equal(p.tele, null, "в бою");
  p.combatAt = -1e12;
  for (const id of [from.id, "нет-такого", "__proto__", 5, null]) startTeleport(w, p, id);
  assert.equal(p.tele, null, "плохая цель");
  const enemyCap = CITIES.find((c) => isEnemyCapital(c, "solgard"));
  if (enemyCap) {
    startTeleport(w, p, enemyCap.id);
    assert.equal(p.tele, null, "во вражескую столицу");
  }
  p.save.gold = teleportPrice(from, dest) - 1;
  startTeleport(w, p, dest.id);
  assert.equal(p.tele, null, "без золота");
  p.unit.x += 2000;
  p.save.gold = 1e6;
  startTeleport(w, p, dest.id);
  assert.equal(p.tele, null, "не у камня");
  w.removePlayer(p.id);
});

done();
