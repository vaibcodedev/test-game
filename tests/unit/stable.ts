/**
 * Конюшня и зверинец без сервера: покупка печатей, сборка маунта из деталей, изучение печати.
 * Инвариант: при любом отказе сумка, золото, знаки и коллекция не меняются; повтор и два запроса подряд не дают лишнего.
 * Основы (печать передаётся, рейдовые трофеи, рейтинг арены) — tests/mount-awards.ts и tests/menagerie.ts; здесь — края и откаты.
 * Запуск: npx tsx tests/unit/stable.ts
 */
import { buySeal, giveItem, learnSeal, makePart, makeSeal, stableBuy, stableCraft } from "../../server/src/game/stable";
import { givePetSeal, keeperBuy, learnPetSeal, makePetSeal } from "../../server/src/game/menagerie";
import type { Player } from "../../server/src/game/Player";
import { MOUNTS, partBase, sealBase, canRide } from "../../shared/mounts";
import { PETS, PET_KEEPERS, petSealBase } from "../../shared/pets";
import { STABLEMASTERS } from "../../shared/stables";
import { serviceRefusal } from "../../shared/npcs";
import { MERCHANT_RANGE } from "../../shared/constants";
import { isBound } from "../../shared/items";
import { assert, done, knownFail, section, test } from "./lib";
import { at, countIn, drop, emptyBag, fillBag, hero, world, type Hero } from "./fixtures";

const w = world();
type Npc = { x: number; y: number };
/** NPC своей фракции (без отказа обслуживания). */
function ownNpc(list: Npc[], kind: "stable" | "pets", p: Player): Npc {
  const n = list.find((n) => serviceRefusal(kind, n.x, n.y + 24, p.faction, MERCHANT_RANGE) === null);
  if (!n) throw new Error(`нет ${kind} для фракции ${p.faction}`);
  return n;
}
function rider(level = 70, gold = 1_000_000): Hero {
  const p = hero(w, "warrior", undefined, level);
  emptyBag(p);
  p.save.gold = gold;
  p.save.mounts = [];
  p.save.mount = "";
  at(p, ownNpc(STABLEMASTERS, "stable", p));
  return p;
}
const snap = (p: Player) => JSON.stringify({ inv: p.save.inventory, gold: p.save.gold, marks: p.save.marks ?? 0, mounts: p.save.mounts, pending: p.save.pendingItems ?? null, pets: p.save.pets ?? null });
const seals = (p: Player, id: string) => countIn(p.save.inventory, sealBase(id));
const parts = (p: Player, part: string) => countIn(p.save.inventory, partBase(part));
const repMount = (p: Player) => Object.values(MOUNTS).find((d) => d.source === "rep" && d.rep && canRide(d, p.faction) && d.faction)!;
const craftMount = (p: Player) => Object.values(MOUNTS).find((d) => d.id === "bear")!; // 4 седла + 1 доспех + 100 000, любая фракция

// ---------------------------------------------------------------- покупка
section("Конюшня: покупка печати");

await test("покупка: печать в сумке, золото списано ровно на цену, печать не привязана", () => {
  const p = rider();
  stableBuy(w, p, "boar");
  assert.equal(seals(p, "boar"), 1);
  assert.equal(p.save.gold, 1_000_000 - MOUNTS.boar.price);
  assert.ok(!isBound(p.save.inventory.find((it) => it?.base === sealBase("boar"))!));
  drop(w, p);
});

await test("не хватает золота на 1 — отказ, ничего не меняется", () => {
  const p = rider(70, MOUNTS.boar.price - 1);
  const s = snap(p);
  stableBuy(w, p, "boar");
  assert.equal(snap(p), s);
  assert.equal(p.box.errors().length, 1);
  p.save.gold = MOUNTS.boar.price;
  stableBuy(w, p, "boar");
  assert.equal(p.save.gold, 0, "ровно на цену — можно");
  assert.equal(seals(p, "boar"), 1);
  drop(w, p);
});

await test("полная сумка — отказ до списания золота", () => {
  const p = rider();
  fillBag(p);
  const s = snap(p);
  stableBuy(w, p, "boar");
  assert.equal(snap(p), s);
  assert.ok(p.box.errors().length >= 1);
  drop(w, p);
});

await test("два запроса подряд (двойной клик): одна печать, золото списано один раз", () => {
  const p = rider();
  stableBuy(w, p, "boar");
  stableBuy(w, p, "boar");
  assert.equal(seals(p, "boar"), 1);
  assert.equal(p.save.gold, 1_000_000 - MOUNTS.boar.price);
  drop(w, p);
});

await test("маунт уже в коллекции — отказ; ниже уровня — отказ", () => {
  const p = rider();
  p.save.mounts = ["boar"];
  const s = snap(p);
  stableBuy(w, p, "boar");
  assert.equal(snap(p), s);
  const low = rider(MOUNTS.raptor.level - 1);
  const s2 = snap(low);
  stableBuy(w, low, "raptor");
  assert.equal(snap(low), s2);
  drop(w, p, low);
});

await test("далеко от конюшего, мёртвый герой, неверный id (__proto__, constructor, число, маунт без продажи) — без изменений", () => {
  const p = rider();
  const s = snap(p);
  for (const id of ["__proto__", "constructor", "toString", 5, null, { id: "boar" }, "no_such", "horse", "nightmare"]) stableBuy(w, p, id);
  assert.equal(snap(p), s);
  p.dead = true;
  stableBuy(w, p, "boar");
  assert.equal(snap(p), s, "мёртвый купил");
  p.dead = false;
  p.unit.x += 2000;
  stableBuy(w, p, "boar");
  assert.equal(snap(p), s, "далеко купил");
  drop(w, p);
});

await test("боевой маунт за репутацию: знаки списываются, репутация — нет; знаков на 1 меньше — отказ", () => {
  const p = rider();
  const d = repMount(p);
  p.save.rep = d.rep!.rep;
  p.save.marks = d.rep!.marks - 1;
  const s = snap(p);
  stableBuy(w, p, d.id);
  assert.equal(snap(p), s);
  p.save.marks = d.rep!.marks + 7;
  stableBuy(w, p, d.id);
  assert.equal(seals(p, d.id), 1);
  assert.equal(p.save.marks, 7);
  assert.equal(p.save.rep, d.rep!.rep);
  assert.equal(p.save.gold, 1_000_000 - d.price);
  drop(w, p);
});

await test("buySeal для маунта не из продажи (рейд, босс) — отказ", () => {
  const p = rider();
  const s = snap(p);
  buySeal(p, "nightmare");
  buySeal(p, "bear");
  assert.equal(snap(p), s);
  drop(w, p);
});

// ---------------------------------------------------------------- сборка
section("Конюшня: сборка из деталей");

function withParts(p: Player, list: [string, number][]) {
  let i = 0;
  for (const [part, qty] of list) p.save.inventory[i++] = makePart(part, qty);
}

await test("сборка: детали и золото списаны ровно по рецепту, остаток деталей в стопке, печать в сумке", () => {
  const p = rider();
  const d = craftMount(p);
  withParts(p, [["saddle", 6], ["barding", 3]]);
  stableCraft(w, p, d.id);
  assert.equal(seals(p, d.id), 1, p.box.errors().join(" | "));
  assert.equal(parts(p, "saddle"), 2);
  assert.equal(parts(p, "barding"), 2);
  assert.equal(p.save.gold, 1_000_000 - d.craft!.gold);
  drop(w, p);
});

await test("детали в нескольких стопках — списываются из всех", () => {
  const p = rider();
  const d = craftMount(p);
  withParts(p, [["saddle", 1], ["saddle", 1], ["saddle", 3], ["barding", 1]]);
  stableCraft(w, p, d.id);
  assert.equal(seals(p, d.id), 1);
  assert.equal(parts(p, "saddle"), 1);
  assert.equal(parts(p, "barding"), 0);
  drop(w, p);
});

await test("не хватает одной детали или золота — отказ, ничего не списано", () => {
  const p = rider();
  const d = craftMount(p);
  withParts(p, [["saddle", 3], ["barding", 1]]);
  const s = snap(p);
  stableCraft(w, p, d.id);
  assert.equal(snap(p), s);
  withParts(p, [["saddle", 4], ["barding", 1]]);
  p.save.gold = d.craft!.gold - 1;
  const s2 = snap(p);
  stableCraft(w, p, d.id);
  assert.equal(snap(p), s2);
  drop(w, p);
});

await test("полная сумка, детали не освобождают ячейку — отказ и детали возвращаются на место (откат)", () => {
  const p = rider();
  const d = craftMount(p);
  fillBag(p);
  withParts(p, [["saddle", 5], ["barding", 2]]);
  const s = snap(p);
  stableCraft(w, p, d.id);
  assert.equal(snap(p), s, "детали или золото изменились при отказе");
  assert.ok(p.box.errors().length >= 1);
  drop(w, p);
});

await test("полная сумка, но стопка деталей уходит целиком — ячейка освобождается, сборка проходит", () => {
  const p = rider();
  const d = craftMount(p);
  fillBag(p);
  withParts(p, [["saddle", 4], ["barding", 1]]);
  stableCraft(w, p, d.id);
  assert.equal(seals(p, d.id), 1, p.box.errors().join(" | "));
  assert.equal(p.save.gold, 1_000_000 - d.craft!.gold);
  drop(w, p);
});

await test("гонка: два запроса сборки при деталях на одну — вторая отказ, детали не уходят в минус", () => {
  const p = rider();
  const d = craftMount(p);
  withParts(p, [["saddle", 4], ["barding", 1]]);
  stableCraft(w, p, d.id);
  stableCraft(w, p, d.id);
  assert.equal(seals(p, d.id), 1);
  assert.equal(parts(p, "saddle"), 0);
  assert.equal(p.save.gold, 1_000_000 - d.craft!.gold);
  assert.ok(p.save.inventory.every((it) => !it || (it.qty ?? 1) > 0));
  drop(w, p);
});

await test("B7: сборка при печати того же маунта в сумке — отказ без списания (как у покупки)", () => {
  const p = rider();
  const d = craftMount(p);
  withParts(p, [["saddle", 8], ["barding", 2]]);
  stableCraft(w, p, d.id);
  try {
    const s = snap(p);
    stableCraft(w, p, d.id);
    assert.equal(snap(p), s, `печатей ${seals(p, d.id)}, сёдел ${parts(p, "saddle")}`);
  } finally { drop(w, p); }
});

await test("сборка у не-конюшего маунта (без рецепта) и уже изученного — отказ", () => {
  const p = rider();
  withParts(p, [["saddle", 10], ["barding", 10]]);
  const s = snap(p);
  stableCraft(w, p, "boar");
  assert.equal(snap(p), s);
  p.save.mounts = ["bear"];
  const s2 = snap(p);
  stableCraft(w, p, "bear");
  assert.equal(snap(p), s2);
  drop(w, p);
});

await test("аренный маунт из привязанных печатей гладиатора — печать привязана; рейтинг ниже — отказ", () => {
  const p = rider();
  const d = Object.values(MOUNTS).find((m) => m.source === "arena" && canRide(m, p.faction) && m.craft)!;
  const [part, n] = Object.entries(d.craft!.parts)[0];
  p.save.inventory[0] = makePart(part, n);
  const s = snap(p);
  stableCraft(w, p, d.id, d.craft!.arenaRating! - 1);
  assert.equal(snap(p), s);
  stableCraft(w, p, d.id, d.craft!.arenaRating!);
  const seal = p.save.inventory.find((it) => it?.base === sealBase(d.id));
  assert.ok(seal && isBound(seal), "печать не привязана");
  drop(w, p);
});

// ---------------------------------------------------------------- изучение печати и выдача
section("Конюшня: изучение печати и выдача при полной сумке");

await test("изучение: печать исчезает, маунт в коллекции и выбран; вторая печать того же — отказ, печать остаётся", () => {
  const p = rider();
  p.save.inventory[2] = makeSeal("boar");
  p.save.inventory[3] = makeSeal("boar");
  learnSeal(p, 2);
  assert.equal(p.save.inventory[2], null);
  assert.deepEqual(p.save.mounts, ["boar"]);
  assert.equal(p.save.mount, "boar");
  learnSeal(p, 3);
  assert.ok(p.save.inventory[3], "вторая печать пропала");
  assert.deepEqual(p.save.mounts, ["boar"]);
  drop(w, p);
});

await test("изучение: ниже уровня и маунт чужой фракции — отказ; не печать и пустая ячейка — ничего", () => {
  const p = rider(10);
  p.save.inventory[0] = makeSeal("raptor");
  const foe = Object.values(MOUNTS).find((d) => d.faction && !canRide(d, p.faction))!;
  p.save.inventory[1] = makeSeal(foe.id);
  p.save.inventory[2] = makePart("saddle", 1);
  const s = snap(p);
  for (const i of [0, 1, 2, 3, -1, 999]) learnSeal(p, i);
  assert.equal(snap(p), s);
  drop(w, p);
});

await test("giveItem при полной сумке: вещь в pendingItems, ничего не теряется", () => {
  const p = rider();
  fillBag(p);
  const seal = makeSeal("boar");
  giveItem(p, seal);
  assert.equal(p.save.pendingItems?.length, 1);
  assert.equal(p.save.pendingItems![0].uid, seal.uid);
  drop(w, p);
});

// ---------------------------------------------------------------- зверинец
section("Зверинец: покупка и изучение печати питомца");

function keeperHero(level = 70, gold = 1_000_000): Hero {
  const p = hero(w, "warrior", undefined, level);
  emptyBag(p);
  p.save.gold = gold;
  p.save.pets = {};
  p.save.pet = "";
  at(p, ownNpc(PET_KEEPERS, "pets", p));
  return p;
}
const petSeals = (p: Player, id: string) => countIn(p.save.inventory, petSealBase(id));

await test("гонка: два запроса покупки подряд — одна печать, золото списано один раз", () => {
  const p = keeperHero();
  keeperBuy(w, p, "cliff_lynx");
  keeperBuy(w, p, "cliff_lynx");
  assert.equal(petSeals(p, "cliff_lynx"), 1);
  assert.equal(p.save.gold, 1_000_000 - PETS.cliff_lynx.price);
  drop(w, p);
});

await test("золота ровно на цену — можно (0 после), на 1 меньше — отказ без изменений", () => {
  const p = keeperHero(70, PETS.cliff_lynx.price - 1);
  const s = snap(p);
  keeperBuy(w, p, "cliff_lynx");
  assert.equal(snap(p), s);
  p.save.gold = PETS.cliff_lynx.price;
  keeperBuy(w, p, "cliff_lynx");
  assert.equal(p.save.gold, 0);
  assert.equal(petSeals(p, "cliff_lynx"), 1);
  drop(w, p);
});

await test("условие «побеждённые боссы»: меньше нужного — отказ, хватает — покупка", () => {
  const d = Object.values(PETS).find((x) => x.need?.bosses)!;
  const p = keeperHero();
  p.save.rep = d.need!.rep ?? 0;
  p.save.marks = d.need!.marks ?? 0;
  p.save.bossKills = Object.fromEntries(Array.from({ length: d.need!.bosses! - 1 }, (_, i) => [`boss${i}`, 1]));
  const s = snap(p);
  keeperBuy(w, p, d.id);
  assert.equal(snap(p), s);
  p.save.bossKills[`boss_last`] = 3;
  keeperBuy(w, p, d.id);
  assert.equal(petSeals(p, d.id), 1, p.box.errors().join(" | "));
  drop(w, p);
});

await test("мёртвый, далеко, неверный id (__proto__, constructor, число), питомец уже в коллекции, полная сумка — без изменений", () => {
  const p = keeperHero();
  const s = snap(p);
  for (const id of ["__proto__", "constructor", "hasOwnProperty", 7, null, "nope"]) keeperBuy(w, p, id);
  assert.equal(snap(p), s);
  p.dead = true;
  keeperBuy(w, p, "cliff_lynx");
  p.dead = false;
  assert.equal(snap(p), s, "мёртвый купил");
  p.unit.x += 2000;
  keeperBuy(w, p, "cliff_lynx");
  assert.equal(snap(p), s, "далеко купил");
  drop(w, p);
  const q = keeperHero();
  q.save.pets = { cliff_lynx: { level: 5, xp: 0 } };
  const s2 = snap(q);
  keeperBuy(w, q, "cliff_lynx");
  assert.equal(snap(q), s2, "уже в коллекции");
  fillBag(q);
  const s3 = snap(q);
  keeperBuy(w, q, "ash_bear");
  assert.equal(snap(q), s3, "полная сумка");
  drop(w, q);
});

await test("изучение: уровень питомца = уровень продажи, но не выше героя; текущий питомец сохраняется, если он есть", () => {
  const p = keeperHero(PETS.ash_bear.level);
  p.save.inventory[0] = makePetSeal("cliff_lynx");
  p.save.inventory[1] = makePetSeal("ash_bear");
  learnPetSeal(p, 0);
  assert.deepEqual(p.save.pets!.cliff_lynx, { level: PETS.cliff_lynx.level, xp: 0 });
  assert.equal(p.save.pet, "cliff_lynx");
  learnPetSeal(p, 1);
  assert.equal(p.save.pets!.ash_bear.level, Math.min(p.level, PETS.ash_bear.level));
  assert.equal(p.save.pet, "cliff_lynx", "выбранный питомец сменился");
  assert.equal(p.save.inventory[0], null);
  assert.equal(p.save.inventory[1], null);
  drop(w, p);
});

await test("печать питомца при полной сумке (находка) — в pendingItems", () => {
  const p = keeperHero();
  fillBag(p);
  const before = JSON.stringify(p.save.inventory);
  givePetSeal(p, "cliff_lynx");
  assert.equal(JSON.stringify(p.save.inventory), before);
  assert.equal(p.save.pendingItems?.[0]?.base, petSealBase("cliff_lynx"));
  drop(w, p);
});

done();
