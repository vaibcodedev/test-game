/**
 * Экономика и предметы без сервера: сумка (addItem, swap, подбор), торговец (покупка, продажа, спрос), кузнец (материалы, заточка),
 * сумочник. Главный инвариант — ничего не появляется из воздуха и не пропадает: золото и предметы сохраняются при любом отказе.
 * Запуск: npx tsx tests/unit/economy.ts
 */
import { addItem, buy, buyFood, pickup, sell, swap, useItem, equip, unequip } from "../../server/src/game/inventory";
import { buyMaterial, upgradeItem } from "../../server/src/game/smith";
import { sellPrice, recordSale, demandMult } from "../../server/src/game/market";
import { expandBag } from "../../server/src/game/bags";
import { BASE_ITEMS, Rarity, makeItem, isBound, canEquip, effStats, baseSellValue, makeUnique, UNIQUES } from "../../shared/items";
import { MATERIALS, MAX_PLUS, REF_PLUS, SMITH, failLevel, stepFor } from "../../shared/upgrade";
import { BAGMAN, BAG_MAX, BAG_STEP, bagPrice } from "../../shared/bags";
import { FOOD, COOKS } from "../../shared/food";
import { QUESTS } from "../../shared/quests";
import { assert, done, section, test, withRandom } from "./lib";
import { at, countIn, drop, emptyBag, fillBag, gear, hero, memDb, register, stack, uids, world } from "./fixtures";

const w = world();
const merchant = w.map.merchants[0];
const questBase = Object.values(QUESTS).find((q) => q.kind === "gather" && BASE_ITEMS[q.target])?.target;
const snap = (p: { save: { gold: number; inventory: unknown; equip: unknown } }) => JSON.stringify({ g: p.save.gold, i: p.save.inventory, e: p.save.equip });

section("Сумка: addItem и swap");

await test("обычный предмет ложится в первую пустую ячейку; полная сумка — false и сумка не меняется", () => {
  const p = hero(w);
  emptyBag(p);
  const s = gear();
  assert.equal(addItem(p, s), true);
  assert.equal(p.save.inventory[0], s);
  fillBag(p);
  const before = JSON.stringify(p.save.inventory);
  assert.equal(addItem(p, gear()), false);
  assert.equal(JSON.stringify(p.save.inventory), before);
  drop(w, p);
});

await test("стопки: добор до предела, остаток — в новую ячейку, сумма qty сохраняется", () => {
  const p = hero(w);
  emptyBag(p);
  const max = BASE_ITEMS.hp_potion.stack!;
  p.save.inventory[3] = stack("hp_potion", max - 2);
  assert.equal(addItem(p, stack("hp_potion", 7)), true);
  assert.equal(countIn(p.save.inventory, "hp_potion"), max + 5);
  assert.ok(p.save.inventory.every((it) => !it || (it.qty ?? 1) <= max), "стопка больше предела");
  assert.equal(p.save.inventory[3]!.qty, max);
  // большая партия раскладывается по нескольким ячейкам
  assert.equal(addItem(p, stack("hp_potion", max * 2 + 1)), true);
  assert.equal(countIn(p.save.inventory, "hp_potion"), max * 3 + 6);
  drop(w, p);
});

await test("addItem: неудача (нет места) не должна менять сумку", () => {
  const p = hero(w);
  fillBag(p);
  const max = BASE_ITEMS.hp_potion.stack!;
  p.save.inventory[0] = stack("hp_potion", max - 2);
  const before = countIn(p.save.inventory, "hp_potion");
  const ok = addItem(p, stack("hp_potion", 5));
  drop(w, p);
  assert.equal(ok, false);
  assert.equal(countIn(p.save.inventory, "hp_potion"), before, "после отказа зелий стало больше");
});

await test("подбор мешка с зельями в полную сумку: зелья не дублируются", () => {
  const p = hero(w);
  fillBag(p);
  const max = BASE_ITEMS.hp_potion.stack!;
  p.save.inventory[0] = stack("hp_potion", max - 2);
  p.bags.set("bag1", { id: "bag1", x: p.x, y: p.y, items: [stack("hp_potion", 5)] } as never);
  pickup(w, p, "bag1");
  const inBag = (p.bags.get("bag1")?.items ?? []).reduce((n, it) => n + (it.qty ?? 1), 0);
  const total = countIn(p.save.inventory, "hp_potion") + inBag;
  drop(w, p);
  assert.equal(total, max - 2 + 5, `всего зелий ${total}, было ${max + 3}`);
});

await test("подбор стопки частично: в сумке долито до предела, в мешке — точный остаток", () => {
  const p = hero(w);
  fillBag(p);
  const max = BASE_ITEMS.hp_potion.stack!;
  p.save.inventory[0] = stack("hp_potion", max - 2);
  p.bags.set("bag2", { id: "bag2", x: p.x, y: p.y, items: [stack("hp_potion", 5)] } as never);
  pickup(w, p, "bag2");
  const rest = p.bags.get("bag2")?.items ?? [];
  drop(w, p);
  assert.equal(p.save.inventory[0]!.qty, max);
  assert.equal(rest.length, 1);
  assert.equal(rest[0].qty, 3);
});

await test("подбор: далеко — отказ, рядом — всё в сумку и мешок исчезает; мёртвый не подбирает", () => {
  const p = hero(w);
  emptyBag(p);
  const it = gear();
  p.bags.set("b", { id: "b", x: p.x + 500, y: p.y, items: [it] } as never);
  pickup(w, p, "b");
  assert.ok(p.bags.has("b") && !uids(p.save.inventory).includes(it.uid), "подобрал издалека");
  p.bags.get("b")!.x = p.x + 10;
  p.dead = true;
  pickup(w, p, "b");
  assert.ok(p.bags.has("b"), "мёртвый подобрал");
  p.dead = false;
  pickup(w, p, "b");
  assert.ok(!p.bags.has("b") && uids(p.save.inventory).includes(it.uid));
  pickup(w, p, "b"); // повторный подбор того же мешка — ничего
  assert.equal(uids(p.save.inventory).filter((u) => u === it.uid).length, 1);
  drop(w, p);
});

await test("swap: обмен местами, слияние стопок без превышения предела и без потери, мусорные индексы игнорируются", () => {
  const p = hero(w);
  emptyBag(p);
  const a = gear(), b = gear("axe");
  p.save.inventory[0] = a;
  p.save.inventory[1] = b;
  swap(p, 0, 1);
  assert.equal(p.save.inventory[0], b);
  assert.equal(p.save.inventory[1], a);
  const max = BASE_ITEMS.mp_potion.stack!;
  p.save.inventory[2] = stack("mp_potion", max - 3);
  p.save.inventory[3] = stack("mp_potion", 10);
  swap(p, 3, 2);
  assert.equal(countIn(p.save.inventory, "mp_potion"), max + 7);
  assert.equal(p.save.inventory[2]!.qty, max);
  const before = JSON.stringify(p.save.inventory);
  for (const [x, y] of [[-1, 0], [0, p.save.inventory.length], [0.5, 1], ["0", 1], [NaN, 1], [null, 1], [1, 1], [{}, 0]] as unknown[][]) swap(p, x, y);
  assert.equal(JSON.stringify(p.save.inventory), before);
  drop(w, p);
});

section("Торговец: покупка и продажа");

await test("покупка зелий: цена × количество, количество 1…20, мусор — 1; другие базы не продаются", () => {
  const p = hero(w);
  emptyBag(p);
  at(p, merchant);
  const price = BASE_ITEMS.hp_potion.price!;
  p.save.gold = 10_000;
  buy(w, p, "hp_potion", 3);
  assert.equal(p.save.gold, 10_000 - price * 3);
  assert.equal(countIn(p.save.inventory, "hp_potion"), 3);
  for (const [q, n] of [[-5, 1], [0, 1], [2.5, 1], ["7", 1], [1e9, 20]] as [unknown, number][]) {
    const g = p.save.gold, c = countIn(p.save.inventory, "hp_potion");
    buy(w, p, "hp_potion", q);
    assert.equal(countIn(p.save.inventory, "hp_potion") - c, n, `qty ${String(q)}`);
    assert.equal(g - p.save.gold, price * n, `цена при qty ${String(q)}`);
  }
  const g = p.save.gold, inv = JSON.stringify(p.save.inventory);
  for (const base of ["sword", "ash_ore", "__proto__", "constructor", 5, null]) buy(w, p, base, 1);
  assert.equal(p.save.gold, g);
  assert.equal(JSON.stringify(p.save.inventory), inv);
  drop(w, p);
});

await test("покупка: денег ровно впритык — проходит до 0; не хватает 1 — отказ без изменений; далеко от торговца — отказ", () => {
  const p = hero(w);
  emptyBag(p);
  at(p, merchant);
  const price = BASE_ITEMS.mp_potion.price!;
  p.save.gold = price * 2;
  buy(w, p, "mp_potion", 2);
  assert.equal(p.save.gold, 0);
  p.save.gold = price - 1;
  const s = JSON.stringify(p.save.inventory);
  buy(w, p, "mp_potion", 1);
  assert.equal(p.save.gold, price - 1);
  assert.equal(JSON.stringify(p.save.inventory), s);
  p.save.gold = 1000;
  p.unit.x += 2000;
  buy(w, p, "mp_potion", 1);
  assert.equal(p.save.gold, 1000, "купил издалека");
  drop(w, p);
});

await test("покупка в полную сумку: золото не списано, сумка как была (и при частично доливаемой стопке)", () => {
  const p = hero(w);
  at(p, merchant);
  fillBag(p);
  p.save.inventory[0] = stack("hp_potion", BASE_ITEMS.hp_potion.stack! - 1);
  p.save.gold = 1000;
  const s = snap(p);
  buy(w, p, "hp_potion", 5);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("продажа: золото = цена × qty, ячейка пустеет; далеко или пустая ячейка — ничего; квестовый предмет не продаётся", () => {
  const p = hero(w);
  emptyBag(p);
  at(p, merchant);
  p.save.gold = 0;
  const it = gear("sword", 20, Rarity.Epic);
  p.save.inventory[4] = it;
  const expect = sellPrice(it);
  sell(w, p, 4);
  assert.equal(p.save.gold, expect);
  assert.equal(p.save.inventory[4], null);
  sell(w, p, 4); // повторная продажа пустой ячейки
  assert.equal(p.save.gold, expect);
  p.save.inventory[5] = stack("hp_potion", 4);
  const per = sellPrice(p.save.inventory[5]!);
  sell(w, p, 5);
  assert.equal(p.save.gold, expect + per * 4);
  if (questBase) {
    p.save.inventory[6] = makeItem(questBase, 1, Rarity.Common);
    const g = p.save.gold;
    sell(w, p, 6);
    assert.equal(p.save.gold, g);
    assert.ok(p.save.inventory[6], "квестовый предмет продан");
  }
  p.save.inventory[7] = gear();
  p.unit.x += 3000;
  const g = p.save.gold;
  sell(w, p, 7);
  assert.equal(p.save.gold, g);
  assert.ok(p.save.inventory[7]);
  drop(w, p);
});

await test("спрос: каждая продажа не дороже предыдущей, цена ≥ 1 и не уходит в минус даже после 10 000 продаж", () => {
  const it = gear("mace", 30, Rarity.Rare);
  let prev = sellPrice(it);
  for (let i = 0; i < 50; i++) {
    recordSale(it, 200);
    const now = sellPrice(it);
    assert.ok(now <= prev && now >= 1 && Number.isFinite(now), `цена ${now} после ${prev}`);
    prev = now;
  }
  assert.ok(demandMult(it) > 0);
});

await test("нет арбитража: всё, что продают NPC (зелья, еда, материалы), торговцу сдаётся дешевле цены покупки", () => {
  const goods: [string, number][] = [
    ["hp_potion", BASE_ITEMS.hp_potion.price!],
    ["mp_potion", BASE_ITEMS.mp_potion.price!],
    ...Object.values(MATERIALS).map((m) => [m.id, m.price] as [string, number]),
    ...Object.values(FOOD).map((d) => [`food_${d.id}`, d.price] as [string, number]),
  ];
  for (const [base, buyPrice] of goods) {
    const v = baseSellValue(makeItem(base, 1, Rarity.Common));
    assert.ok(v < buyPrice, `${base}: продажа ${v} ≥ покупка ${buyPrice}`);
  }
});

await test("заточка повышает цену продажи, а не понижает", () => {
  const it = gear("sword", 40, Rarity.Rare);
  const v0 = baseSellValue(it);
  it.plus = 5;
  assert.ok(baseSellValue(it) > v0);
});

await test("еда у повара: цена × qty, полная сумка — откат без списания", () => {
  const dish = Object.values(FOOD).find((d) => d.price > 0)!;
  const p = hero(w);
  emptyBag(p);
  at(p, COOKS[0]);
  p.save.gold = dish.price * 3;
  buyFood(w, p, dish.id, 3);
  if (p.box.errors().length) {
    // повар чужой фракции — тест на другом классе не нужен: проверяем только, что отказ ничего не списал
    assert.equal(p.save.gold, dish.price * 3);
  } else {
    assert.equal(p.save.gold, 0);
    assert.equal(countIn(p.save.inventory, `food_${dish.id}`), 3);
  }
  fillBag(p);
  const fb = `food_${dish.id}`;
  p.save.inventory[0] = stack(fb, BASE_ITEMS[fb].stack! - 1);
  p.save.gold = 10_000;
  const s = snap(p);
  buyFood(w, p, dish.id, 2); // 1 долилось бы в стопку, второму места нет — откат целиком
  assert.equal(snap(p), s);
  drop(w, p);
});

section("Кузнец: материалы и заточка");

const ore = MATERIALS.ash_ore, dust = MATERIALS.star_dust;
function smithHero() {
  const p = hero(w);
  emptyBag(p);
  at(p, SMITH);
  return p;
}
function giveMats(p: ReturnType<typeof hero>, n = 99) {
  addItem(p, stack("ash_ore", n));
  addItem(p, stack("star_dust", n));
}
const noLock = () => false;

await test("кузнец рядом и обслуживает героя (иначе остальные проверки кузнеца бессмысленны)", () => {
  const p = smithHero();
  p.save.gold = 1e6;
  buyMaterial(w, p, "ash_ore", 1);
  assert.deepEqual(p.box.errors(), []);
  assert.equal(countIn(p.save.inventory, "ash_ore"), 1);
  drop(w, p);
});

await test("покупка материалов: цена × qty (1…99), полная сумка — откат; не материал — игнор", () => {
  const p = smithHero();
  p.save.gold = 1e6;
  buyMaterial(w, p, "star_dust", 150);
  assert.equal(countIn(p.save.inventory, "star_dust"), 99);
  assert.equal(p.save.gold, 1e6 - dust.price * 99);
  fillBag(p);
  const s = snap(p);
  buyMaterial(w, p, "ash_ore", 1);
  buyMaterial(w, p, "hp_potion", 1);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("ключи прототипа в покупках («__proto__», «constructor») отбрасываются без исключения", () => {
  const p = smithHero();
  p.save.gold = 1e6;
  const s = snap(p);
  try {
    for (const id of ["__proto__", "constructor", "toString"]) buyMaterial(w, p, id, 1);
    at(p, COOKS[0]);
    for (const id of ["__proto__", "constructor", "toString"]) buyFood(w, p, id, 1);
  } finally {
    assert.equal(snap(p), s, "состояние изменилось");
    drop(w, p);
  }
});

await test("заточка удачная: +1, списаны ровно золото и материалы шага", () => {
  const p = smithHero();
  giveMats(p);
  const it = gear();
  p.save.inventory[10] = it;
  p.save.gold = 1e6;
  const st = stepFor(0)!;
  withRandom([0], () => upgradeItem(w, p, 10, undefined, noLock));
  assert.equal(it.plus, 1);
  assert.equal(p.save.gold, 1e6 - st.gold);
  assert.equal(countIn(p.save.inventory, "ash_ore"), 99 - st.ore);
  assert.equal(countIn(p.save.inventory, "star_dust"), 99 - st.dust);
  drop(w, p);
});

await test("заточка неудачная: до +5 уровень сохраняется, выше — падает на 1 (failLevel); ресурсы списаны", () => {
  for (const plus of [0, 3, 5, 6, 9]) {
    assert.equal(failLevel(plus), plus + 1 <= 5 ? plus : plus - 1);
    const p = smithHero();
    giveMats(p);
    const it = gear();
    if (plus) it.plus = plus;
    p.save.inventory[10] = it;
    p.save.gold = 1e7;
    const st = stepFor(plus)!;
    withRandom([0.999999], () => upgradeItem(w, p, 10, undefined, noLock));
    if (st.chance >= 100) assert.equal(it.plus ?? 0, plus + 1);
    else assert.equal(it.plus ?? 0, failLevel(plus), `с +${plus}`);
    assert.equal(p.save.gold, 1e7 - st.gold);
    drop(w, p);
  }
});

await test("заточка до +15 (владелец 2026-10-31): +11…+15 рискованные — шанс ниже +10 и падает, цена растёт, бонус по той же кривой; эталон ботов +10", () => {
  assert.equal(MAX_PLUS, 15);
  assert.equal(stepFor(15), undefined);
  for (let p = 1; p < MAX_PLUS; p++) {
    const a = stepFor(p - 1)!, b = stepFor(p)!;
    assert.ok(b.gold > a.gold && b.ore >= a.ore && b.dust >= a.dust, `цена +${p + 1} выше +${p}`);
    assert.ok(b.chance <= a.chance, `шанс +${p + 1} не выше +${p}`);
  }
  for (let p = 10; p < MAX_PLUS; p++) assert.ok(stepFor(p)!.chance < stepFor(9)!.chance && stepFor(p)!.chance > 0, `+${p + 1} рискованнее +10`);
  assert.equal(failLevel(14), 13);
  const it = gear();
  const base = effStats(it).armor || effStats(it).dmgMax || 0;
  it.plus = 15; const v15 = effStats(it).armor || effStats(it).dmgMax || 0;
  it.plus = 10; const v10 = effStats(it).armor || effStats(it).dmgMax || 0;
  assert.ok(v15 > v10 && v10 > base, "бонус растёт и после +10");
  assert.equal(REF_PLUS, 10);
});

await test("заточка: максимум, нехватка золота или материалов, расходник, пустая ячейка, чужой индекс — ничего не списано", () => {
  const p = smithHero();
  giveMats(p, 1);
  const it = gear();
  it.plus = MAX_PLUS;
  p.save.inventory[10] = it;
  p.save.inventory[11] = gear();
  p.save.inventory[12] = stack("hp_potion", 3);
  p.save.gold = 1e6;
  const s = snap(p);
  upgradeItem(w, p, 10, undefined, noLock); // максимум
  upgradeItem(w, p, 12, undefined, noLock); // расходник
  upgradeItem(w, p, 13, undefined, noLock); // пусто
  for (const bad of [-1, 999, 1.5, "10", NaN]) upgradeItem(w, p, bad, undefined, noLock);
  upgradeItem(w, p, undefined, "__proto__", noLock);
  upgradeItem(w, p, undefined, "consumable", noLock);
  assert.equal(snap(p), s);
  // материалов мало (по 1 штуке) — для шага +1 нужно больше?
  const st = stepFor(0)!;
  if (st.ore > 1 || st.dust > 1) {
    upgradeItem(w, p, 11, undefined, noLock);
    assert.equal(snap(p), s);
  }
  p.save.gold = st.gold - 1;
  giveMats(p);
  const s2 = snap(p);
  upgradeItem(w, p, 11, undefined, noLock);
  assert.equal(snap(p), s2, "заточка без золота");
  drop(w, p);
});

await test("заточка: предмет в окне обмена, мёртвый герой, герой на арене, далеко от кузнеца — отказ без списаний", () => {
  const p = smithHero();
  giveMats(p);
  p.save.inventory[10] = gear();
  p.save.gold = 1e6;
  const s = snap(p);
  upgradeItem(w, p, 10, undefined, (i) => i === 10);
  p.dead = true;
  upgradeItem(w, p, 10, undefined, noLock);
  p.dead = false;
  p.team = 1;
  upgradeItem(w, p, 10, undefined, noLock);
  p.team = 0;
  p.unit.x += 3000;
  upgradeItem(w, p, 10, undefined, noLock);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("заточка надетого оружия: урон героя растёт, здоровье не выше максимума", () => {
  const p = smithHero();
  giveMats(p);
  p.save.gold = 1e7;
  p.save.equip.weapon = gear("sword", 30, Rarity.Rare);
  p.recalc();
  const before = p.derived.dmgMax;
  for (let i = 0; i < 4; i++) withRandom([0], () => upgradeItem(w, p, undefined, "weapon", noLock));
  assert.equal(p.save.equip.weapon!.plus, 4);
  assert.ok(p.derived.dmgMax > before, `урон ${p.derived.dmgMax} ≤ ${before}`);
  assert.ok(p.unit.hp <= p.unit.maxHp && p.unit.hp >= 1);
  drop(w, p);
});

await test("effStats: заточка увеличивает урон, броню и главную характеристику, не трогает остальное; +0 — те же статы", () => {
  const it = gear("sword", 40, Rarity.Epic);
  assert.deepEqual(effStats(it), it.stats);
  const up = effStats({ ...it, plus: 10 });
  assert.ok(up.dmgMin! > it.stats.dmgMin! && up.dmgMax! > it.stats.dmgMax!);
  for (const k of ["crit", "hp"] as const) if (it.stats[k] !== undefined) assert.equal(up[k], it.stats[k], k);
});

section("Сумочник");

await test("расширение сумки: +BAG_STEP ячеек и минус цена; нет денег — отказ; предел — отказ; в бою на арене — отказ", () => {
  const db = memDb();
  const p = hero(w);
  register(db, p);
  at(p, BAGMAN);
  const size = p.save.inventory.length;
  const price = bagPrice(size);
  assert.ok(price !== null && price > 0, "у новичка есть куда расширять");
  p.save.gold = price! - 1;
  expandBag(w, db, w.map.playerSpawn, p, false);
  assert.equal(p.save.inventory.length, size);
  assert.equal(p.save.gold, price! - 1);
  p.save.gold = price!;
  expandBag(w, db, w.map.playerSpawn, p, true);
  assert.equal(p.save.inventory.length, size, "занятый (арена) расширил");
  expandBag(w, db, w.map.playerSpawn, p, false);
  assert.equal(p.save.inventory.length, size + BAG_STEP);
  assert.equal(p.save.gold, 0);
  assert.equal(db.load(p.name)!.inventory.length, size + BAG_STEP, "в базе прежний размер");
  while (p.save.inventory.length < BAG_MAX) p.save.inventory.push(null);
  p.save.gold = 1e9;
  expandBag(w, db, w.map.playerSpawn, p, false);
  assert.equal(p.save.inventory.length, BAG_MAX);
  assert.equal(p.save.gold, 1e9);
  drop(w, p);
});

await test("расширение сумки: ошибка базы — золото и размер откатываются", () => {
  const db = memDb();
  const p = hero(w);
  register(db, p);
  at(p, BAGMAN);
  p.save.gold = 1e6;
  const size = p.save.inventory.length;
  const orig = db.save.bind(db);
  db.save = () => { throw new Error("диск полон"); };
  const err = console.error;
  console.error = () => {};
  try { expandBag(w, db, w.map.playerSpawn, p, false); } finally { db.save = orig; console.error = err; }
  assert.equal(p.save.inventory.length, size);
  assert.equal(p.save.gold, 1e6);
  drop(w, p);
});

section("Экипировка и расходники");

await test("надеть/снять: предмет не дублируется и не теряется; в бою — нельзя; чужой класс и уровень — отказ", () => {
  const p = hero(w, "warrior");
  emptyBag(p);
  const sw = gear("sword", 10, Rarity.Rare);
  p.save.inventory[0] = sw;
  const old = p.save.equip.weapon!;
  equip(w, p, 0);
  assert.equal(p.save.equip.weapon, sw);
  assert.equal(p.save.inventory[0], old);
  const all = () => [...uids(p.save.inventory), ...Object.values(p.save.equip).filter(Boolean).map((x) => x!.uid)];
  const before = all().sort();
  p.combatAt = w.time;
  unequip(w, p, "weapon");
  equip(w, p, 0);
  assert.equal(p.save.equip.weapon, sw, "сменил оружие в бою");
  p.combatAt = -1e12;
  unequip(w, p, "weapon");
  assert.deepEqual(all().sort(), before);
  assert.equal(p.save.equip.weapon, null);
  const hi = gear("sword", 90, Rarity.Common);
  p.save.inventory[5] = hi;
  equip(w, p, 5);
  assert.equal(p.save.inventory[5], hi, "надел вещь не по уровню");
  assert.ok(canEquip(hi, "warrior", 30));
  drop(w, p);
});

await test("снять в полную сумку — отказ, вещь остаётся надетой", () => {
  const p = hero(w);
  fillBag(p);
  const wpn = p.save.equip.weapon;
  unequip(w, p, "weapon");
  assert.equal(p.save.equip.weapon, wpn);
  for (const bad of ["__proto__", "consumable", 5, null]) unequip(w, p, bad);
  drop(w, p);
});

await test("зелье: −1 из стопки, последнее — ячейка пустеет; полное здоровье — не тратится; откат 1,5 с", () => {
  const p = hero(w);
  emptyBag(p);
  p.save.inventory[0] = stack("hp_potion", 1);
  useItem(w, p, 0);
  assert.equal(p.save.inventory[0]!.qty, 1, "выпил при полном здоровье");
  p.unit.hp = 1;
  useItem(w, p, 0);
  assert.equal(p.save.inventory[0], null);
  assert.ok(p.unit.hp > 1);
  p.save.inventory[1] = stack("hp_potion", 5);
  p.unit.hp = 1;
  useItem(w, p, 1);
  assert.equal(p.save.inventory[1]!.qty, 5, "откат зелья не сработал");
  drop(w, p);
});

section("Привязка");

await test("уникальные, легендарные и помеченные bound вещи привязаны, обычные — нет", () => {
  const u = Object.keys(UNIQUES)[0];
  assert.ok(isBound(makeUnique(u)));
  assert.ok(isBound({ ...gear(), legendary: "x" }));
  assert.ok(isBound({ ...gear(), bound: true }));
  assert.ok(!isBound(gear()));
  assert.ok(!isBound(stack("hp_potion", 3)));
});

done();
