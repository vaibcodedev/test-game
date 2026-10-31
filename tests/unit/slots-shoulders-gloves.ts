/**
 * Слоты «Наплечники» и «Перчатки» (задача 147): надеть и снять, класс и материал, миграция старого героя, сохранение после перезахода,
 * обмен, банк, выброс, перековка неверного семейства, добыча, вещи сетов героя Б и строка внешности u.gear.
 * Запуск: npx tsx tests/unit/slots-shoulders-gloves.ts
 */
import { equip, unequip } from "../../server/src/game/inventory";
import { Player } from "../../server/src/game/Player";
import { TradeManager } from "../../server/src/trade/TradeManager";
import { BankService } from "../../server/src/game/bank";
import { dropItem, groundBags } from "../../server/src/game/drop";
import { tmApply, tmExtract } from "../../server/src/game/transmog";
import { BANKER } from "../../shared/bank";
import { affixCount, BASE_ITEMS, canEquip, ITEM_MODELS, lootCategories, makeItem, makeLoot, Rarity, SLOT_NAMES, SLOTS, type Item } from "../../shared/items";
import { gearStrings, isShell, REFORGER } from "../../shared/transmog";
import { TRADE_CONFIRM_DELAY_MS } from "../../shared/trade";
import live from "../../data/hero-b-live.json";
import { assert, done, section, test } from "./lib";
import { at, drop, emptyBag, hero, memDb, register, shiftNow, uids, world, type Hero } from "./fixtures";

const w = world();
const free = () => false;
const idx = (p: Player, it: Item) => p.save.inventory.findIndex((x) => x?.uid === it.uid);

section("Слоты и базы");

await test("слоты объявлены, имена «Наплечники» и «Перчатки», базы лат, кожи и ткани", () => {
  assert.ok(SLOTS.includes("shoulders") && SLOTS.includes("gloves"));
  assert.equal(SLOT_NAMES.shoulders, "Наплечники");
  assert.equal(SLOT_NAMES.gloves, "Перчатки");
  for (const m of ["plate", "leather", "cloth"]) for (const s of ["shoulders", "gloves"] as const) {
    const b = BASE_ITEMS[`${m}_${s}`];
    assert.ok(b && b.slot === s && b.armorType === m, `${m}_${s}`);
    const it = makeItem(b.id, 50, Rarity.Common);
    assert.ok((it.stats.armor || 0) > 0, "без брони: " + b.id);
  }
});

await test("умеренный рост сета: наплечники + перчатки лат на 100 ур. дают 8–20 % брони к шлему, латам, сапогам и плащу; на аффикс меньше", () => {
  const a = (b: string) => makeItem(b, 100, Rarity.Common).stats.armor || 0;
  const body = a("plate_helm") + a("plate_armor") + a("plate_boots") + a("cloak");
  const add = a("plate_shoulders") + a("plate_gloves");
  assert.ok(add / body >= 0.08 && add / body <= 0.2, `доля ${(add / body).toFixed(3)}`);
  assert.ok(a("leather_shoulders") < a("plate_shoulders") && a("cloth_gloves") < a("leather_gloves"));
  assert.equal(affixCount("shoulders", Rarity.Epic), affixCount("helmet", Rarity.Epic) - 1);
  assert.equal(affixCount("gloves", Rarity.Rare), 1);
  assert.equal(affixCount("gloves", Rarity.Common), 0);
});

section("Надеть и снять");

await test("надеть и снять наплечники и перчатки: слот, броня растёт и возвращается, вещь в сумке", () => {
  const p = hero(w, "warrior", undefined, 40);
  emptyBag(p);
  const sh = makeItem("plate_shoulders", 30, Rarity.Rare), gl = makeItem("plate_gloves", 30, Rarity.Rare);
  p.save.inventory[0] = sh;
  p.save.inventory[1] = gl;
  const a0 = p.derived.armor;
  equip(w, p, 0);
  equip(w, p, 1);
  assert.equal(p.save.equip.shoulders?.uid, sh.uid, p.box.errors().join(" | "));
  assert.equal(p.save.equip.gloves?.uid, gl.uid);
  assert.ok(p.derived.armor > a0, "броня не выросла");
  unequip(w, p, "shoulders");
  unequip(w, p, "gloves");
  assert.ok(!p.save.equip.shoulders && !p.save.equip.gloves);
  assert.ok(uids(p.save.inventory).includes(sh.uid) && uids(p.save.inventory).includes(gl.uid));
  assert.equal(p.derived.armor, a0);
  drop(w, p);
});

await test("класс и материал: латы — не для мага, ткань — не для воина; отказ без изменений", () => {
  const mage = hero(w, "mage", undefined, 40), war = hero(w, "warrior", undefined, 40);
  emptyBag(mage);
  emptyBag(war);
  mage.save.inventory[0] = makeItem("plate_shoulders", 10, Rarity.Common);
  war.save.inventory[0] = makeItem("cloth_gloves", 10, Rarity.Common);
  equip(w, mage, 0);
  equip(w, war, 0);
  assert.ok(!mage.save.equip.shoulders && mage.save.inventory[0], "маг надел латы");
  assert.ok(!war.save.equip.gloves && war.save.inventory[0], "воин надел ткань");
  assert.ok(canEquip(makeItem("cloth_shoulders", 10, Rarity.Common), "mage", 40) === null);
  assert.ok(canEquip(makeItem("leather_gloves", 10, Rarity.Common), "rogue", 40) === null);
  drop(w, mage, war);
});

await test("в бою не надеть", () => {
  const p = hero(w, "warrior", undefined, 40);
  emptyBag(p);
  p.save.inventory[0] = makeItem("plate_gloves", 10, Rarity.Common);
  p.combatAt = w.time;
  equip(w, p, 0);
  assert.ok(!p.save.equip.gloves && p.save.inventory[0]);
  drop(w, p);
});

section("Сохранение и миграция");

await test("миграция: старый герой без слотов — пустые слоты, надетое и сумка не теряются", () => {
  const db = memDb();
  const p = hero(w, "warrior", undefined, 20);
  register(db, p);
  const save = p.toSave(w.map.playerSpawn);
  delete (save.equip as Partial<typeof save.equip>).shoulders;
  delete (save.equip as Partial<typeof save.equip>).gloves;
  db.raw.prepare("UPDATE players SET data = ? WHERE name_key = ?").run(JSON.stringify(save), p.name.toLowerCase());
  const loaded = db.load(p.name)!;
  assert.ok("shoulders" in loaded.equip && "gloves" in loaded.equip, "слоты не добавлены");
  assert.equal(loaded.equip.shoulders, null);
  assert.equal(loaded.equip.gloves, null);
  assert.equal(loaded.equip.weapon?.uid, save.equip.weapon?.uid, "оружие потеряно");
  assert.equal(loaded.equip.armor?.uid, save.equip.armor?.uid, "доспех потерян");
  assert.deepEqual(uids(loaded.inventory), uids(save.inventory), "сумка изменилась");
  // и сам Player без записи в базе (сохранение из старого JSON)
  const raw = JSON.parse(JSON.stringify(save));
  const q = new Player("mig", "Мигрант", raw, () => {});
  assert.equal(q.save.equip.shoulders, null);
  assert.equal(q.save.equip.gloves, null);
  drop(w, p);
});

await test("сохранение после перезахода: надетые наплечники и перчатки на месте", () => {
  const db = memDb();
  const p = hero(w, "warrior", undefined, 40);
  register(db, p);
  emptyBag(p);
  const sh = makeItem("plate_shoulders", 30, Rarity.Epic), gl = makeItem("plate_gloves", 30, Rarity.Rare);
  p.save.inventory[0] = sh;
  p.save.inventory[1] = gl;
  equip(w, p, 0);
  equip(w, p, 1);
  db.save(p.name, p.toSave(w.map.playerSpawn));
  drop(w, p);
  const s = db.load(p.name)!;
  const q = new Player("again", p.name, s, () => {});
  assert.equal(q.save.equip.shoulders?.uid, sh.uid);
  assert.equal(q.save.equip.gloves?.uid, gl.uid);
  assert.deepEqual(q.save.equip.shoulders?.stats, sh.stats);
});

section("Обмен, банк, выброс");

await test("обмен: перчатки уходят другому герою один раз", () => {
  const db = memDb();
  const tm = new TradeManager(() => w, () => db, () => false, () => w.map.playerSpawn);
  const a = hero(w), b = hero(w);
  register(db, a);
  register(db, b);
  emptyBag(a);
  emptyBag(b);
  b.unit.x = a.unit.x + 30;
  b.unit.y = a.unit.y;
  const gl = makeItem("leather_gloves", 20, Rarity.Rare);
  a.save.inventory[2] = gl;
  tm.request(a, b.id);
  tm.respond(b, true);
  tm.add(a, 2, 0);
  tm.ready(a);
  tm.ready(b);
  const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
  try { tm.confirm(a); tm.confirm(b); } finally { restore(); }
  assert.ok(!tm.inTrade(a), "обмен не завершился: " + [...a.box.toasts(), ...b.box.toasts()].join(" | "));
  assert.ok(!uids(a.save.inventory).includes(gl.uid));
  assert.equal(uids(b.save.inventory).filter((u) => u === gl.uid).length, 1);
  assert.ok(uids(db.load(b.name)!.inventory).includes(gl.uid), "не в базе");
  drop(w, a, b);
});

await test("банк: наплечники кладутся и забираются", () => {
  const db = memDb();
  const bank = new BankService(() => w, () => db, () => w.map.playerSpawn, () => false, () => false);
  const p = hero(w);
  emptyBag(p);
  at(p, BANKER);
  register(db, p);
  const sh = makeItem("plate_shoulders", 20, Rarity.Common);
  p.save.inventory[0] = sh;
  bank.open(p);
  bank.put(p, 0, 0, undefined);
  assert.equal(p.save.inventory[0], null, p.box.errors().join(" | "));
  bank.take(p, 0, 0, undefined);
  assert.ok(uids(p.save.inventory).includes(sh.uid), p.box.errors().join(" | "));
  drop(w, p);
});

await test("выброс: наплечники уходят в мешок на земле", () => {
  const db = memDb();
  const p = hero(w);
  register(db, p);
  emptyBag(p);
  const sh = makeItem("cloth_shoulders", 20, Rarity.Common);
  p.save.inventory[0] = sh;
  dropItem(w, db, w.map.playerSpawn, p, { index: 0 });
  assert.equal(p.save.inventory[0], null, p.box.errors().join(" | "));
  assert.equal(groundBags(w).filter((b) => b.items.some((it) => it.uid === sh.uid)).length, 1);
  drop(w, p);
});

section("Перековка");

await test("перековка: вид наплечников на наплечники того же материала — да; на перчатки или чужой материал — отказ без изменений", () => {
  const p = hero(w, "warrior", undefined, 60);
  emptyBag(p);
  p.save.gold = 1_000_000;
  at(p, REFORGER, 0, 20);
  p.save.inventory[0] = makeItem("plate_shoulders", 30, Rarity.Rare);
  tmExtract(w, p, 0, free);
  assert.ok(isShell(p.save.inventory[0]), p.box.errors().join(" | "));
  const snap = () => JSON.stringify({ inv: p.save.inventory, gold: p.save.gold });
  // перчатки лат — другой слот
  p.save.inventory[1] = makeItem("plate_gloves", 30, Rarity.Rare);
  let s = snap();
  tmApply(w, p, 0, 1, undefined, free);
  assert.equal(snap(), s, "наложилось на перчатки");
  // кожаные наплечники — другое семейство
  p.save.inventory[1] = makeItem("leather_shoulders", 30, Rarity.Rare);
  s = snap();
  tmApply(w, p, 0, 1, undefined, free);
  assert.equal(snap(), s, "наложилось на кожу");
  // латные наплечники — можно
  p.save.inventory[1] = makeItem("plate_shoulders", 30, Rarity.Common);
  tmApply(w, p, 0, 1, undefined, free);
  assert.equal(p.save.inventory[1]?.appearance?.base, "plate_shoulders", p.box.errors().join(" | "));
  drop(w, p);
});

section("Добыча и вещи сетов");

await test("добыча: наплечники и перчатки падают своему материалу, реже прочей брони, но падают", () => {
  assert.ok(lootCategories("warrior").some((b) => b.id === "plate_shoulders") && lootCategories("mage").some((b) => b.id === "cloth_gloves"));
  assert.ok(!lootCategories("mage").some((b) => b.id === "plate_gloves"));
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const n: Record<string, number> = {};
  for (let i = 0; i < 6000; i++) { const it = makeLoot("warrior", 40, Rarity.Common, rand, 0); const s = BASE_ITEMS[it.base].slot; n[s] = (n[s] || 0) + 1; }
  assert.ok((n.shoulders || 0) > 200 && (n.gloves || 0) > 200, JSON.stringify(n));
  assert.ok(n.shoulders < n.helmet && n.gloves < n.boots, JSON.stringify(n));
  for (let i = 0; i < 300; i++) { const it = makeLoot("mage", 40, Rarity.Rare, rand, 0); const b = BASE_ITEMS[it.base]; if (b.slot === "shoulders" || b.slot === "gloves") assert.equal(b.armorType, "cloth"); }
});

await test("сеты героя Б: наплечники и перчатки — отдельные вещи своих слотов, модели сопоставлены слотам листа", () => {
  const L = live as unknown as { models: Record<string, string>; slotMap: Record<string, string> };
  assert.equal(L.slotMap.shoulders, "pauldrons");
  assert.equal(L.slotMap.gloves, "gloves");
  for (const set of ["chaos", "recruit"]) {
    const sh = ITEM_MODELS[`hb147_${set}_pauldrons`], gl = ITEM_MODELS[`hb147_${set}_gloves`];
    assert.ok(sh && BASE_ITEMS[sh.cat].slot === "shoulders", set + " наплечники");
    assert.ok(gl && BASE_ITEMS[gl.cat].slot === "gloves", set + " перчатки");
    assert.ok(L.models[sh.id] && L.models[sh.id] === L.models[gl.id] && L.models[`hb147_${set}_armor`] === L.models[sh.id]);
  }
});

await test("u.gear: без наплечников и перчаток — 5 кусков (как раньше), с ними — 9-й и 8-й куски", () => {
  const eq: Record<string, Item | null> = { helmet: null, armor: makeItem("plate_armor", 10, Rarity.Common), boots: null, offhand: null, cloak: null };
  assert.equal(gearStrings(eq).gear.split("|").length, 5);
  eq.gloves = makeItem("hb147_chaos_gloves", 100, Rarity.Epic);
  const parts = gearStrings(eq).gear.split("|");
  assert.equal(parts.length, 9);
  assert.equal(parts[7], "");
  assert.ok(parts[8].endsWith(":plate_gloves:hb147_chaos_gloves"), parts[8]);
});

done();
