/**
 * Выброс, уничтожение и подбор без сервера (server/src/game/drop.ts) — граничные случаи к tests/drop.ts (сценарий с сервером):
 * количество 0, отрицательное, дробное, строка, больше стопки; золото так же; двойной выброс; выброс и подбор мёртвым,
 * в бою, из окна обмена; подбор при полной сумке; сбой базы — откат сумки и золота.
 * Запуск: npx tsx tests/unit/drop.ts
 */
import { World } from "../../server/src/game/World";
import { WorldState } from "../../server/src/rooms/schema";
import { destroyItem, dropItem, groundBags, pickupBag } from "../../server/src/game/drop";
import type { GameDB } from "../../server/src/db";
import type { Player } from "../../server/src/game/Player";
import { DROP } from "../../shared/drop";
import { BASE_ITEMS, makeUnique, UNIQUES } from "../../shared/items";
import { assert, done, section, test } from "./lib";
import { countIn, emptyBag, fillBag, gear, hero, memDb, register, stack, uids, world, type Hero } from "./fixtures";

const base = world();
/** Свой мир на тест (мешки на земле и лимиты — на мир), карта общая. */
const fresh = () => new World(new WorldState(), () => {}, { mobs: false, quiet: true, map: base.map } as never);
const quiet = <T>(fn: () => T): T => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };
function setup() {
  const w = fresh();
  const db = memDb();
  const mk = (): Hero => { const p = hero(w); emptyBag(p); register(db, p); p.save.gold = 1000; return p; };
  const step = () => { (w as { time: number }).time += DROP.minGapMs + 1; };
  const sp = w.map.playerSpawn;
  const dropIt = (p: Player, m: object, locked?: (i: number) => boolean) => dropItem(w, db, sp, p, m, locked);
  return { w, db, mk, step, dropIt, sp };
}
const logN = (db: GameDB, kind?: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM drop_log${kind ? " WHERE kind = ?" : ""}`).get(...(kind ? [kind] : [])) as { n: number }).n;
const snap = (p: Player) => JSON.stringify({ inv: p.save.inventory, gold: p.save.gold });

section("Выброс: количество и золото");

await test("стопка: qty 0, отрицательное, дробное, строка, NaN, Infinity, больше стопки — отказ, ничего не меняется", () => {
  const { w, db, mk, step, dropIt } = setup();
  const p = mk();
  p.save.inventory[0] = stack("hp_potion", 5);
  const s = snap(p);
  for (const qty of [0, -1, -5, 1.5, "2", NaN, Infinity, 6, null, {}]) { dropIt(p, { index: 0, qty }); step(); }
  assert.equal(snap(p), s);
  assert.equal(groundBags(w).length, 0);
  assert.equal(logN(db), 0);
});

await test("стопка: ровно вся стопка — ячейка пустеет, мешок с тем же uid; часть — новый uid, в сумке остаток", () => {
  const { w, mk, step, dropIt } = setup();
  const p = mk();
  const st = stack("hp_potion", 5);
  p.save.inventory[0] = st;
  dropIt(p, { index: 0, qty: 2 });
  assert.equal(p.save.inventory[0]!.qty, 3);
  const b1 = groundBags(w)[0];
  assert.equal(b1.items[0].qty, 2);
  assert.notEqual(b1.items[0].uid, st.uid);
  step();
  dropIt(p, { index: 0, qty: 3 });
  assert.equal(p.save.inventory[0], null);
  assert.equal(groundBags(w).length, 2);
  assert.equal(countIn(groundBags(w).flatMap((b) => b.items), "hp_potion"), 5, "сумма не сохранилась");
});

await test("золото: 0, отрицательное, дробное, строка, больше, чем есть — отказ; ровно всё — можно", () => {
  const { w, mk, step, dropIt } = setup();
  const p = mk();
  for (const gold of [0, -10, 0.5, "10", NaN, 1001, Infinity]) { dropIt(p, { gold }); step(); }
  assert.equal(p.save.gold, 1000);
  assert.equal(groundBags(w).length, 0);
  dropIt(p, { gold: 1000 });
  assert.equal(p.save.gold, 0);
  assert.equal(groundBags(w)[0].gold, 1000);
});

await test("двойной выброс одной ячейки подряд: второй — ничего (ячейка пуста или пауза), мешок один", () => {
  const { w, mk, dropIt, step } = setup();
  const p = mk();
  p.save.inventory[0] = gear("sword", 10);
  dropIt(p, { index: 0 });
  dropIt(p, { index: 0 });
  step();
  dropIt(p, { index: 0 });
  assert.equal(groundBags(w).length, 1);
  assert.equal(p.save.inventory[0], null);
});

await test("пауза minGapMs: две разные вещи без паузы — вторая отказ и остаётся в сумке", () => {
  const { w, mk, dropIt } = setup();
  const p = mk();
  p.save.inventory[0] = gear("sword", 10);
  p.save.inventory[1] = gear("axe", 10);
  dropIt(p, { index: 0 });
  dropIt(p, { index: 1 });
  assert.equal(groundBags(w).length, 1);
  assert.ok(p.save.inventory[1]);
});

await test("лимит своих мешков на земле maxBagsPerPlayer — следующий отказ", () => {
  const { w, mk, dropIt } = setup();
  const p = mk();
  for (let i = 0; i < DROP.maxBagsPerPlayer + 1; i++) p.save.inventory[i] = gear("sword", 5);
  // окно частоты: rateMax за rateWindowSec — двигаем время на окно, когда упрёмся
  for (let i = 0; i < DROP.maxBagsPerPlayer + 1; i++) { dropIt(p, { index: i }); (w as { time: number }).time += DROP.rateWindowSec * 1000; }
  assert.equal(groundBags(w).length, DROP.maxBagsPerPlayer);
  assert.ok(p.save.inventory[DROP.maxBagsPerPlayer], "лишняя вещь ушла");
});

section("Выброс: состояние героя");

await test("мёртвый, в бою, на арене, вещь в окне обмена — отказ", () => {
  const { w, mk, step, dropIt } = setup();
  const p = mk();
  p.save.inventory[0] = gear("sword", 10);
  const s = snap(p);
  p.dead = true; dropIt(p, { index: 0 }); dropIt(p, { gold: 10 }); p.dead = false; step();
  p.combatAt = w.time; dropIt(p, { index: 0 }); p.combatAt = -1e12; step();
  p.team = 1; dropIt(p, { index: 0 }); p.team = 0; step();
  dropIt(p, { index: 0 }, (i) => i === 0); step();
  assert.equal(snap(p), s);
  assert.equal(groundBags(w).length, 0);
});

await test("привязанное (уникальная вещь) выбросить нельзя; уничтожить — только со словом", () => {
  const { db, mk, step, dropIt, w, sp } = setup();
  const p = mk();
  const uid = Object.keys(UNIQUES)[0];
  p.save.inventory[0] = makeUnique(uid);
  dropIt(p, { index: 0 });
  assert.ok(p.save.inventory[0]);
  step();
  destroyItem(w, db, sp, p, { index: 0, word: "нет" });
  destroyItem(w, db, sp, p, { index: 0, word: 123 });
  assert.ok(p.save.inventory[0]);
  destroyItem(w, db, sp, p, { index: 0, word: " " + DROP.destroyWord.toLowerCase() + " " });
  assert.equal(p.save.inventory[0], null);
  assert.equal(logN(db, "destroy"), 1);
  assert.equal(groundBags(w).length, 0);
});

section("Выброс: сбой базы — откат");

await test("ошибка записи drop_log — сумка и золото возвращаются, мешка нет", () => {
  const { w, db, mk, dropIt, step } = setup();
  const p = mk();
  p.save.inventory[0] = stack("hp_potion", 5);
  const s = snap(p), dbGold = db.load(p.name)!.gold, dbInv = JSON.stringify(db.load(p.name)!.inventory);
  db.raw.exec("CREATE TRIGGER no_drop BEFORE INSERT ON drop_log BEGIN SELECT RAISE(ABORT, 'disk'); END");
  quiet(() => dropIt(p, { index: 0, qty: 2 }));
  step();
  quiet(() => dropIt(p, { gold: 100 }));
  assert.equal(snap(p), s);
  assert.equal(groundBags(w).length, 0);
  assert.equal(db.load(p.name)!.gold, dbGold, "сохранение героя записано без журнала (нет отката)");
  assert.equal(JSON.stringify(db.load(p.name)!.inventory), dbInv);
});

await test("ошибка базы при уничтожении — вещь возвращается", () => {
  const { w, db, mk, sp } = setup();
  const p = mk();
  const it = gear("sword", 10);
  p.save.inventory[0] = it;
  db.raw.exec("CREATE TRIGGER no_drop BEFORE INSERT ON drop_log BEGIN SELECT RAISE(ABORT, 'disk'); END");
  quiet(() => destroyItem(w, db, sp, p, { index: 0, word: DROP.destroyWord }));
  assert.equal(p.save.inventory[0]?.uid, it.uid);
});

section("Подбор");

await test("подбор мёртвым — ничего; после воскрешения — подбирает", () => {
  const { w, db, mk, dropIt } = setup();
  const p = mk();
  p.save.inventory[0] = gear("sword", 10);
  dropIt(p, { index: 0 });
  const id = groundBags(w)[0].id;
  p.dead = true;
  pickupBag(w, db, p, id);
  assert.equal(p.save.inventory[0], null);
  assert.equal(groundBags(w).length, 1);
  p.dead = false;
  pickupBag(w, db, p, id);
  assert.ok(p.save.inventory[0]);
  assert.equal(groundBags(w).length, 0);
  assert.equal(logN(db, "pickup"), 1);
});

await test("чужой до срока не поднимает; после срока — поднимает; повторный подбор того же мешка — ничего", () => {
  const { w, db, mk, dropIt } = setup();
  const a = mk(), b = mk();
  b.unit.x = a.unit.x + 5;
  b.unit.y = a.unit.y;
  const it = gear("sword", 10);
  a.save.inventory[0] = it;
  dropIt(a, { index: 0 });
  const bag = groundBags(w)[0];
  b.unit.x = bag.x;
  b.unit.y = bag.y;
  pickupBag(w, db, b, bag.id);
  assert.ok(!uids(b.save.inventory).includes(it.uid));
  (w as { time: number }).time += DROP.ownerLockSec * 1000 + 1;
  pickupBag(w, db, b, bag.id);
  assert.ok(uids(b.save.inventory).includes(it.uid));
  pickupBag(w, db, b, bag.id);
  pickupBag(w, db, a, bag.id);
  assert.equal(countIn([...a.save.inventory, ...b.save.inventory], "sword"), 1, "дюп при повторном подборе");
});

await test("подбор при полной сумке: вещь остаётся в мешке; золото из мешка берётся", () => {
  const { w, db, mk, dropIt, step } = setup();
  const a = mk();
  a.save.inventory[0] = gear("sword", 10);
  dropIt(a, { index: 0 });
  step();
  dropIt(a, { gold: 300 });
  fillBag(a);
  const [itemBag, goldBag] = groundBags(w);
  pickupBag(w, db, a, itemBag.id);
  assert.equal(groundBags(w).length, 2, "мешок с вещью исчез при полной сумке");
  assert.equal(itemBag.items.length, 1);
  pickupBag(w, db, a, goldBag.id);
  assert.equal(a.save.gold, 1000);
  assert.equal(groundBags(w).length, 1);
});

await test("подбор стопки, когда в сумке места на часть: мешок не теряет и не дублирует количество", () => {
  const { w, db, mk, dropIt } = setup();
  const a = mk();
  const max = BASE_ITEMS.hp_potion.stack!;
  a.save.inventory[0] = stack("hp_potion", 5);
  dropIt(a, { index: 0 });
  fillBag(a);
  a.save.inventory[0] = stack("hp_potion", max - 2);
  const bag = groundBags(w)[0];
  pickupBag(w, db, a, bag.id);
  const total = countIn(a.save.inventory, "hp_potion") + countIn(groundBags(w).flatMap((b) => b.items), "hp_potion");
  assert.equal(total, max - 2 + 5, `всего зелий ${total}`);
});

await test("подбор: неверный id (не строка, чужой, несуществующий) и далеко — ничего", () => {
  const { w, db, mk, dropIt } = setup();
  const a = mk();
  a.save.inventory[0] = gear("sword", 10);
  dropIt(a, { index: 0 });
  const bag = groundBags(w)[0];
  for (const id of [5, null, {}, "nope", "__proto__"]) pickupBag(w, db, a, id);
  a.unit.x += 2000;
  pickupBag(w, db, a, bag.id);
  assert.equal(a.save.inventory[0], null);
  assert.equal(groundBags(w).length, 1);
});

done();
