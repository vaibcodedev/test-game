/**
 * Добыча и мешки без сервера (дополнение к unit/rewards.ts и unit/drop.ts): деление золота обычного моба в группе
 * (поровну, остаток — первым, сумма не теряется, малые суммы меньше размера группы), личный мешок добычи (хозяин, срок жизни),
 * мешок с выброшенным золотом (хозяин сразу, чужой — после срока, золото один раз, мешок исчезает по сроку; что видит каждый в lootFor).
 * Подсказка мешка (LootRow) — клиент с DOM, здесь не проверяется.
 * Запуск: npx tsx tests/unit/loot-bags.ts
 */
import { World } from "../../server/src/game/World";
import { WorldState } from "../../server/src/rooms/schema";
import { Mob } from "../../server/src/game/Mob";
import { grantKillRewards } from "../../server/src/game/rewards";
import { dropItem, groundBags, lootFor, pickupBag } from "../../server/src/game/drop";
import type { Player } from "../../server/src/game/Player";
import { MOBS } from "../../shared/mobs";
import { DROP } from "../../shared/drop";
import { LOOT_BAG_TTL_MS } from "../../shared/constants";
import { assert, done, section, test, withRandom } from "./lib";
import { drop, emptyBag, hero, memDb, register, world, type Hero } from "./fixtures";

const base = world();
const fresh = () => new World(new WorldState(), () => {}, { mobs: false, quiet: true, map: base.map } as never);
const NORMAL = Object.values(MOBS).find((d) => !d.boss && !d.level)!;
const tick = (w: World, ms: number) => { (w as { time: number }).time += ms; (w as unknown as { runTimers(): void }).runTimers(); };

function party(w: World, n: number): Hero[] {
  return Array.from({ length: n }, (_, i) => {
    const p = hero(w, "warrior", undefined, 30);
    p.unit.x += i * 10;
    p.save.gold = 0;
    p.save.xp = 0;
    emptyBag(p);
    return p;
  });
}
function mob(w: World, near: Player, gold: number): Mob {
  const m = new Mob(w.uid("m"), NORMAL, 30, { x: near.unit.x + 40, y: near.unit.y });
  m.unit.x = near.unit.x + 40;
  m.unit.y = near.unit.y;
  (m.stats as { gold: [number, number] }).gold = [gold, gold];
  return m;
}
/** Без случайных находок (бросок 0.99 мимо всех шансов). */
const noLuck = <T>(fn: () => T) => withRandom([0.99], fn);

// ---------------------------------------------------------------- золото группы
section("Добыча: золото в группе");

await test("суммы 0…12 на группу 1…5: сумма долей = броску, доли отличаются не больше чем на 1, остаток — первым по списку", () => {
  const w = fresh();
  for (let n = 1; n <= 5; n++) for (let total = 0; total <= 12; total++) {
    const ps = party(w, n);
    const m = mob(w, ps[0], total);
    for (const p of ps) m.damageBy.set(p.id, 100);
    noLuck(() => grantKillRewards(w, m, ps[0]));
    const got = ps.map((p) => p.save.gold);
    assert.equal(got.reduce((a, b) => a + b, 0), total, `${total} на ${n}: ${got}`);
    assert.ok(Math.max(...got) - Math.min(...got) <= 1, `${total} на ${n}: ${got}`);
    for (let i = 1; i < n; i++) assert.ok(got[i - 1] >= got[i], `остаток не первым: ${got}`);
    drop(w, ...ps);
  }
});

await test("участник далеко (вне contribRange) доли не получает и не уменьшает доли остальных", () => {
  const w = fresh();
  const ps = party(w, 3);
  ps[2].unit.x += 100_000;
  const m = mob(w, ps[0], 10);
  for (const p of ps) m.damageBy.set(p.id, 100);
  noLuck(() => grantKillRewards(w, m, ps[0]));
  assert.deepEqual(ps.map((p) => p.save.gold), [5, 5, 0]);
  drop(w, ...ps);
});

await test("убийца без урона в списке — тоже участник и получает долю", () => {
  const w = fresh();
  const ps = party(w, 2);
  const m = mob(w, ps[0], 9);
  m.damageBy.set(ps[1].id, 100);
  noLuck(() => grantKillRewards(w, m, ps[0]));
  assert.equal(ps[0].save.gold + ps[1].save.gold, 9);
  assert.ok(ps[0].save.gold >= 4 && ps[1].save.gold >= 4);
  drop(w, ...ps);
});

// ---------------------------------------------------------------- личный мешок добычи
section("Добыча: личный мешок");

await test("личный мешок: виден и поднимается только хозяином; чужой id мешка — ничего; мешок исчезает по сроку", () => {
  const w = fresh();
  const [a, b] = party(w, 2);
  a.forceDrop = true;
  const m = mob(w, a, 0);
  m.damageBy.set(a.id, 100);
  withRandom([0], () => grantKillRewards(w, m, a));
  const bag = [...a.bags.values()][0];
  assert.ok(bag && bag.items.length, "мешка нет");
  assert.ok(!lootFor(w, b).some((x) => x.id === bag.id), "чужой видит личный мешок");
  b.unit.x = bag.x; b.unit.y = bag.y;
  pickupBag(w, memDb(), b, bag.id);
  assert.equal(b.save.inventory.filter(Boolean).length, 0, "чужой поднял личный мешок");
  tick(w, LOOT_BAG_TTL_MS + 1);
  assert.ok(!a.bags.has(bag.id), "мешок не исчез по сроку");
  drop(w, a, b);
});

await test("личный мешок: хозяин рядом поднимает всё один раз; повторный подбор — ничего", () => {
  const w = fresh();
  const [a] = party(w, 1);
  a.forceDrop = true;
  const m = mob(w, a, 0);
  m.damageBy.set(a.id, 100);
  withRandom([0], () => grantKillRewards(w, m, a));
  const bag = [...a.bags.values()][0];
  const n = bag.items.length, before = a.save.inventory.filter(Boolean).length; // бросок 0 мог дать и печать питомца прямо в сумку
  a.unit.x = bag.x; a.unit.y = bag.y;
  const db = memDb();
  pickupBag(w, db, a, bag.id);
  const have = a.save.inventory.filter(Boolean).length;
  assert.equal(have, before + n, a.box.errors().join(" | "));
  pickupBag(w, db, a, bag.id);
  assert.equal(a.save.inventory.filter(Boolean).length, have);
  drop(w, a);
});

// ---------------------------------------------------------------- мешок с выброшенным золотом
section("Добыча: мешок с золотом на земле");

await test("выброшенное золото: хозяин видит мешок без замка, чужой — с замком на ownerLockSec; чужой до срока не берёт, после — берёт ровно сумму", () => {
  const w = fresh();
  const db = memDb();
  const [a, b] = party(w, 2);
  register(db, a);
  register(db, b);
  a.save.gold = 500;
  dropItem(w, db, w.map.playerSpawn, a, { gold: 120 });
  assert.equal(a.save.gold, 380, a.box.errors().join(" | "));
  const bag = groundBags(w)[0];
  assert.equal(bag.gold, 120);
  assert.equal(lootFor(w, a).find((x) => x.id === bag.id)?.lock, undefined);
  assert.equal(lootFor(w, b).find((x) => x.id === bag.id)?.lock, DROP.ownerLockSec);
  b.unit.x = bag.x; b.unit.y = bag.y;
  pickupBag(w, db, b, bag.id);
  assert.equal(b.save.gold, 0);
  tick(w, DROP.ownerLockSec * 1000 + 1);
  assert.equal(lootFor(w, b).find((x) => x.id === bag.id)?.lock, undefined);
  pickupBag(w, db, b, bag.id);
  pickupBag(w, db, b, bag.id);
  assert.equal(b.save.gold, 120);
  assert.equal(a.save.gold + b.save.gold, 500, "золото не сохранилось");
  assert.equal(groundBags(w).length, 0);
  drop(w, a, b);
});

await test("хозяин поднимает своё золото сразу; невзятый мешок исчезает через ttlSec (золото выводится из игры)", () => {
  const w = fresh();
  const db = memDb();
  const [a] = party(w, 1);
  register(db, a);
  a.save.gold = 100;
  dropItem(w, db, w.map.playerSpawn, a, { gold: 40 });
  const bag = groundBags(w)[0];
  a.unit.x = bag.x; a.unit.y = bag.y;
  pickupBag(w, db, a, bag.id);
  assert.equal(a.save.gold, 100);
  (w as { time: number }).time += DROP.minGapMs + 1;
  dropItem(w, db, w.map.playerSpawn, a, { gold: 30 });
  assert.equal(groundBags(w).length, 1);
  tick(w, DROP.ttlSec * 1000 + 1);
  assert.equal(groundBags(w).length, 0, "мешок не исчез");
  assert.equal(a.save.gold, 70);
  drop(w, a);
});

done();
