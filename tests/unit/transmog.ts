/**
 * Перековка без сервера (server/src/game/transmog.ts): tm:extract, tm:apply, tm:reset — цены, отказы, дюп оболочки, блокировка
 * окна обмена, бой, граничные индексы; оболочка в обмене и выбросе. Сценарий с сервером — tests/transmog.ts.
 * Инвариант: при отказе сумка, экипировка и золото не меняются.
 * Запуск: npx tsx tests/unit/transmog.ts
 */
import { tmApply, tmExtract, tmReset } from "../../server/src/game/transmog";
import { TradeManager } from "../../server/src/trade/TradeManager";
import { dropItem, groundBags } from "../../server/src/game/drop";
import type { Player } from "../../server/src/game/Player";
import { applyPrice, extractPrice, isShell, REFORGER, resetPrice } from "../../shared/transmog";
import { BASE_ITEMS, isBound, makeItem, Rarity } from "../../shared/items";
import { makeLegendary, LEGENDARIES } from "../../shared/legendary";
import { QUESTS } from "../../shared/quests";
import { TRADE_CONFIRM_DELAY_MS } from "../../shared/trade";
import { assert, done, knownFail, section, test } from "./lib";
import { at, drop, emptyBag, hero, memDb, register, shiftNow, uids, world, type Hero } from "./fixtures";

const w = world();
const free = () => false;
function smith(gold = 100_000): Hero {
  const p = hero(w, "warrior", undefined, 60);
  emptyBag(p);
  p.save.gold = gold;
  at(p, REFORGER, 0, 20);
  return p;
}
const snap = (p: Player) => JSON.stringify({ inv: p.save.inventory, eq: p.save.equip, gold: p.save.gold });
/** Оболочка с двуручного меча в ячейке i (через tm:extract). */
function shellAt(p: Hero, i: number, base = "greatsword", ilvl = 30, r = Rarity.Rare) {
  p.save.inventory[i] = makeItem(base, ilvl, r);
  tmExtract(w, p, i, free);
  assert.ok(isShell(p.save.inventory[i]), "оболочка не получена: " + p.box.errors().join(" | "));
  return p.save.inventory[i]!;
}
const questBase = Object.values(QUESTS).find((q) => q.kind === "gather" && BASE_ITEMS[q.target])?.target;

// ---------------------------------------------------------------- снять
section("Перековка: снять оболочку");

await test("снять: на месте донора оболочка с его видом, золото списано по цене донора, uid новый", () => {
  const p = smith();
  const donor = makeItem("greatsword", 30, Rarity.Rare);
  p.save.inventory[4] = donor;
  tmExtract(w, p, 4, free);
  const sh = p.save.inventory[4]!;
  assert.ok(isShell(sh));
  assert.equal(sh.appearance?.base, "greatsword");
  assert.equal(sh.appearance?.name, donor.name);
  assert.notEqual(sh.uid, donor.uid);
  assert.equal(p.save.gold, 100_000 - extractPrice(donor));
  assert.ok(p.box.msgs.some((m) => m.type === "tm:done"));
  drop(w, p);
});

await test("дюп: повторное снятие с той же ячейки (уже оболочка) — отказ, золото не списано", () => {
  const p = smith();
  shellAt(p, 0);
  const s = snap(p);
  tmExtract(w, p, 0, free);
  tmExtract(w, p, 0, free);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("отказ: расходник, квестовая вещь, вещь с наложенным видом, пустая ячейка", () => {
  const p = smith();
  p.save.inventory[0] = { ...makeItem("hp_potion", 1, 0), qty: 3 };
  if (questBase) p.save.inventory[1] = makeItem(questBase, 1, 0);
  shellAt(p, 2);
  p.save.inventory[3] = makeItem("hammer", 20, Rarity.Common);
  tmApply(w, p, 2, 3, undefined, free);
  assert.ok(p.save.inventory[3]!.appearance, "вид не наложен: " + p.box.errors().join(" | "));
  const s = snap(p);
  for (const i of [0, 1, 3, 5]) tmExtract(w, p, i, free);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("нехватка золота на 1 — отказ; ровно на цену — можно", () => {
  const donor = makeItem("greatsword", 50, Rarity.Epic);
  const price = extractPrice(donor);
  const p = smith(price - 1);
  p.save.inventory[0] = donor;
  const s = snap(p);
  tmExtract(w, p, 0, free);
  assert.equal(snap(p), s);
  p.save.gold = price;
  tmExtract(w, p, 0, free);
  assert.ok(isShell(p.save.inventory[0]));
  assert.equal(p.save.gold, 0);
  drop(w, p);
});

await test("вещь в окне обмена (заблокирована) — отказ", () => {
  const p = smith();
  p.save.inventory[0] = makeItem("greatsword", 30, Rarity.Rare);
  const s = snap(p);
  tmExtract(w, p, 0, (i) => i === 0);
  assert.equal(snap(p), s);
  assert.equal(p.box.errors().length, 1);
  drop(w, p);
});

await test("граничные индексы: -1, длина сумки, дробь, строка, NaN, null, объект — ничего не меняется", () => {
  const p = smith();
  p.save.inventory[0] = makeItem("greatsword", 30, Rarity.Rare);
  const s = snap(p);
  for (const i of [-1, p.save.inventory.length, 0.5, "0", NaN, null, undefined, { i: 0 }, Infinity]) {
    tmExtract(w, p, i, free);
    tmApply(w, p, i, 0, undefined, free);
    tmApply(w, p, 0, i, undefined, free);
    tmReset(w, p, i, undefined, free);
  }
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("далеко от Перековщика, мёртвый, на арене (team ≠ 0) — отказ", () => {
  const p = smith();
  p.save.inventory[0] = makeItem("greatsword", 30, Rarity.Rare);
  const s = snap(p);
  p.unit.x += 3000;
  tmExtract(w, p, 0, free);
  at(p, REFORGER, 0, 20);
  p.dead = true;
  tmExtract(w, p, 0, free);
  p.dead = false;
  p.team = 1;
  tmExtract(w, p, 0, free);
  p.team = 0;
  assert.equal(snap(p), s);
  drop(w, p);
});

// ---------------------------------------------------------------- наложить
section("Перековка: наложить");

await test("наложить на вещь из сумки: вид донора, свои характеристики и uid, оболочка исчезает, цена applyPrice", () => {
  const p = smith();
  const sh = shellAt(p, 0);
  const t = makeItem("hammer", 12, Rarity.Common);
  p.save.inventory[1] = t;
  const stats = JSON.stringify(t.stats), g = p.save.gold;
  tmApply(w, p, 0, 1, undefined, free);
  const it = p.save.inventory[1]!;
  assert.equal(it.appearance?.base, "greatsword");
  assert.equal(it.base, "hammer");
  assert.equal(it.uid, t.uid);
  assert.equal(JSON.stringify(it.stats), stats);
  assert.equal(p.save.inventory[0], null);
  assert.equal(p.save.gold, g - applyPrice(sh, t));
  drop(w, p);
});

await test("дюп: одна оболочка на две вещи подряд — вторая отказ", () => {
  const p = smith();
  shellAt(p, 0);
  p.save.inventory[1] = makeItem("hammer", 12, Rarity.Common);
  p.save.inventory[2] = makeItem("greataxe", 12, Rarity.Common);
  tmApply(w, p, 0, 1, undefined, free);
  const s = snap(p);
  tmApply(w, p, 0, 2, undefined, free);
  assert.equal(snap(p), s);
  assert.ok(!p.save.inventory[2]!.appearance);
  drop(w, p);
});

await test("неверное семейство (двуручный вид на одноручное, на доспех), на саму себя, на другую оболочку — отказ", () => {
  const p = smith();
  shellAt(p, 0);
  shellAt(p, 3, "plate_armor", 20, Rarity.Common);
  p.save.inventory[1] = makeItem("axe", 10, Rarity.Common);
  p.save.inventory[2] = makeItem("plate_armor", 10, Rarity.Common);
  const s = snap(p);
  for (const t of [0, 1, 2, 3]) tmApply(w, p, 0, t, undefined, free);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("не оболочка в роли оболочки — отказ", () => {
  const p = smith();
  p.save.inventory[0] = makeItem("greatsword", 30, Rarity.Rare);
  p.save.inventory[1] = makeItem("hammer", 12, Rarity.Common);
  const s = snap(p);
  tmApply(w, p, 0, 1, undefined, free);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("заблокированная оболочка или цель (окно обмена) — отказ", () => {
  const p = smith();
  shellAt(p, 0);
  p.save.inventory[1] = makeItem("hammer", 12, Rarity.Common);
  const s = snap(p);
  tmApply(w, p, 0, 1, undefined, (i) => i === 0);
  tmApply(w, p, 0, 1, undefined, (i) => i === 1);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("надетая вещь: вне боя — вид меняется; в бою — отказ; неверное имя слота — ничего", () => {
  const p = smith();
  shellAt(p, 0);
  shellAt(p, 1);
  p.save.equip.weapon = makeItem("hammer", 12, Rarity.Common);
  p.combatAt = w.time;
  const s = snap(p);
  tmApply(w, p, 0, undefined, "weapon", free);
  assert.equal(snap(p), s, "перековано в бою");
  p.combatAt = -1e12;
  for (const slot of ["__proto__", "constructor", "bank", 5, {}]) tmApply(w, p, 0, undefined, slot, free);
  assert.equal(snap(p), s);
  tmApply(w, p, 0, undefined, "weapon", free);
  assert.equal(p.save.equip.weapon!.appearance?.base, "greatsword");
  assert.equal(p.save.inventory[0], null);
  assert.ok(p.unit.hp >= 1);
  drop(w, p);
});

await test("пустой слот экипировки — отказ", () => {
  const p = smith();
  shellAt(p, 0);
  p.save.equip.helmet = null;
  const s = snap(p);
  tmApply(w, p, 0, undefined, "helmet", free);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("нехватка золота на наложение — отказ, оболочка и вещь на месте", () => {
  const p = smith();
  const sh = shellAt(p, 0);
  const t = makeItem("hammer", 12, Rarity.Common);
  p.save.inventory[1] = t;
  p.save.gold = applyPrice(sh, t) - 1;
  const s = snap(p);
  tmApply(w, p, 0, 1, undefined, free);
  assert.equal(snap(p), s);
  drop(w, p);
});

// ---------------------------------------------------------------- сбросить
section("Перековка: сбросить вид");

await test("сбросить: вид пропадает, цена resetPrice; повторный сброс — отказ; без вида — отказ; оболочку — нельзя", () => {
  const p = smith();
  shellAt(p, 0);
  const t = makeItem("hammer", 12, Rarity.Common);
  p.save.inventory[1] = t;
  tmApply(w, p, 0, 1, undefined, free);
  const g = p.save.gold;
  tmReset(w, p, 1, undefined, free);
  assert.equal(p.save.inventory[1]!.appearance, undefined);
  assert.equal(p.save.gold, g - resetPrice(t));
  const s = snap(p);
  tmReset(w, p, 1, undefined, free);
  assert.equal(snap(p), s, "повторный сброс списал золото");
  shellAt(p, 2);
  const s2 = snap(p);
  tmReset(w, p, 2, undefined, free);
  assert.equal(snap(p), s2);
  drop(w, p);
});

await test("сбросить надетую в бою — отказ; вне боя — проходит", () => {
  const p = smith();
  shellAt(p, 0);
  p.save.equip.weapon = makeItem("hammer", 12, Rarity.Common);
  tmApply(w, p, 0, undefined, "weapon", free);
  p.combatAt = w.time;
  const s = snap(p);
  tmReset(w, p, undefined, "weapon", free);
  assert.equal(snap(p), s);
  p.combatAt = -1e12;
  tmReset(w, p, undefined, "weapon", free);
  assert.equal(p.save.equip.weapon!.appearance, undefined);
  drop(w, p);
});

await test("нехватка золота на сброс — отказ, вид остаётся", () => {
  const p = smith();
  shellAt(p, 0);
  const t = makeItem("hammer", 12, Rarity.Common);
  p.save.inventory[1] = t;
  tmApply(w, p, 0, 1, undefined, free);
  p.save.gold = resetPrice(t) - 1;
  const s = snap(p);
  tmReset(w, p, 1, undefined, free);
  assert.equal(snap(p), s);
  drop(w, p);
});

// ---------------------------------------------------------------- оболочка как предмет
section("Перековка: оболочка в обмене и выбросе");

await test("оболочка передаётся обменом вместе с видом; у отдавшего её не остаётся", () => {
  const db = memDb();
  const tm = new TradeManager(() => w, () => db, () => false, () => w.map.playerSpawn);
  const a = smith(), b = smith();
  register(db, a);
  register(db, b);
  const sh = shellAt(a, 0);
  b.unit.x = a.unit.x + 30;
  b.unit.y = a.unit.y;
  tm.request(a, b.id);
  tm.respond(b, true);
  tm.add(a, 0, 0);
  tm.ready(a);
  tm.ready(b);
  const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
  try { tm.confirm(a); tm.confirm(b); } finally { restore(); }
  const got = b.save.inventory.find((it) => it?.uid === sh.uid);
  assert.ok(got, "оболочки нет у второго: " + [...a.box.toasts(), ...b.box.toasts()].join(" | "));
  assert.equal(got!.appearance?.base, "greatsword");
  assert.ok(!uids(a.save.inventory).includes(sh.uid));
  drop(w, a, b);
});

await test("оболочку можно выбросить: она уходит из сумки в мешок на земле один раз (без дюпа)", () => {
  const db = memDb();
  const p = smith();
  register(db, p);
  const sh = shellAt(p, 0);
  const before = groundBags(w).length;
  dropItem(w, db, w.map.playerSpawn, p, { index: 0 });
  assert.equal(p.save.inventory[0], null, p.box.errors().join(" | "));
  const bags = groundBags(w).filter((b) => b.items.some((it) => it.uid === sh.uid));
  assert.equal(bags.length, 1);
  assert.equal(groundBags(w).length, before + 1);
  drop(w, p);
});

await test("B8 (не баг, решение владельца 2026-10-30): оболочка с легендарки не привязана — её можно передать и продать", () => {
  const p = smith(10_000_000);
  const l = Object.values(LEGENDARIES).find((x) => BASE_ITEMS[x.base]?.slot !== "consumable")!;
  p.save.inventory[0] = makeLegendary(l.id);
  tmExtract(w, p, 0, free);
  try {
    const sh = p.save.inventory[0]!;
    assert.ok(isShell(sh), "оболочка не снята: " + p.box.errors().join(" | "));
    assert.ok(!isBound(sh), "оболочка с легендарки привязана, а должна передаваться");
  } finally { drop(w, p); }
});

done();
