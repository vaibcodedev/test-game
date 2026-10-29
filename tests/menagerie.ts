/**
 * Зверинец (задача 150): данные 10 питомцев, цены от дохода, покупка у смотрителя (атомарно), «Печать питомца» — передаётся
 * до изучения, после — питомец привязан; опыт и уровень питомца (≤ уровня героя, прирост по формуле); миграция старых питомцев
 * в server/src/db.ts; PvP — питомец не бьёт героев в открытом мире, его лечение в PvP режется как любое.
 * Запуск: npx tsx tests/menagerie.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { Pet, petXp, updatePet } from "../server/src/game/Pet";
import { keeperBuy, makePetSeal } from "../server/src/game/menagerie";
import { useItem } from "../server/src/game/inventory";
import { GameDB } from "../server/src/db";
import { WorldState } from "../server/src/rooms/schema";
import { isBound } from "../shared/items";
import { CLASSES, type ClassId } from "../shared/classes";
import { xpToNext } from "../shared/formulas";
import { BAL, pvpHealMult } from "../shared/balance";
import { keeperOffer, migratePets, petNextGain, petSealBase, petStats, petUnitId, petXpToNext, PET_IDS, PET_KEEPERS, PET_MIGRATE, PETS, sealPet } from "../shared/pets";
import { WORLD_NPCS } from "../shared/npcs";

let ok = 0;
const t = (name: string, fn: () => void) => { fn(); ok++; console.log(`  ok   ${name}`); };

// ---------- данные ----------
t("10 питомцев, по 2 умения, старые убраны, замены есть", () => {
  assert.equal(PET_IDS.length, 10);
  for (const old of ["wolf", "ember", "turtle"]) {
    assert.ok(!PETS[old], `${old} ещё в данных`);
    assert.ok(PETS[PET_MIGRATE[old]], `${old}: замена ${PET_MIGRATE[old]} не найдена`);
  }
  for (const d of Object.values(PETS)) {
    assert.equal(d.skills.length, 2, `${d.id}: умений ${d.skills.length}`);
    assert.ok(d.price > 0 && d.level > 0 && d.tier && d.role, `${d.id}: цена, уровень, ярус, роль`);
    assert.equal(sealPet(petSealBase(d.id)), d.id);
  }
  assert.equal(PET_KEEPERS.length, 2, "смотрители в Аурелионе и Мортхейме");
  assert.equal(WORLD_NPCS.filter((n) => n.kind === "pets").length, 2);
});
t("цены от дохода героя своего уровня (≈504·L золота в час)", () => {
  const rows: string[] = [];
  for (const d of Object.values(PETS)) {
    const h = d.price / (504 * d.level);
    rows.push(`${d.name} ${d.level} ур.: ${d.price} з = ${h.toFixed(1)} ч`);
    if (d.tier === "common") assert.ok(h >= 2 && h <= 4, `${d.id}: обычный ${h.toFixed(1)} ч`);
    else if (d.tier === "uncommon") assert.ok(h >= 4 && h <= 6, `${d.id}: необычный ${h.toFixed(1)} ч`);
    else assert.ok(h >= 4.5 && !!d.need, `${d.id}: редкий без условия или дёшев (${h.toFixed(1)} ч)`);
  }
  console.log("       " + rows.join("\n       "));
});

// ---------- мир ----------
const w = new World(new WorldState(), () => {});
let uid = 0;
function hero(cls: ClassId, level: number, at: { x: number; y: number }): Player {
  const save = newSave(cls, at);
  save.level = level;
  const p = new Player(`m${++uid}`, `Звер${uid}`, save, () => {});
  w.addPlayer(p);
  p.unit.x = at.x; p.unit.y = at.y;
  p.recalc();
  return p;
}
const solCls = (Object.keys(CLASSES) as ClassId[]).find((c) => CLASSES[c].faction === "solgard")!;
const umbCls = (Object.keys(CLASSES) as ClassId[]).find((c) => CLASSES[c].faction === "umbrath")!;
const keeper = PET_KEEPERS.find((k) => k.id === "aurelion_pets")!;
const at = { x: keeper.x + 20, y: keeper.y + 10 };
const seals = (p: Player, id: string) => p.save.inventory.filter((it) => it?.base === petSealBase(id)).length;

t("покупка: золото списывается, печать в сумке, не привязана", () => {
  const p = hero(solCls, 20, at);
  p.save.gold = 100000;
  keeperBuy(w, p, "iron_boar");
  assert.equal(p.save.gold, 100000 - PETS.iron_boar.price);
  assert.equal(seals(p, "iron_boar"), 1);
  const it = p.save.inventory.find((x) => x?.base === petSealBase("iron_boar"))!;
  assert.ok(!isBound(it), "печать до изучения передаётся");
  keeperBuy(w, p, "iron_boar");
  assert.equal(seals(p, "iron_boar"), 1, "вторая печать, пока первая в сумке");
});
t("покупка атомарна: нет золота, нет места, нет условий, далеко — ничего не списано", () => {
  const p = hero(solCls, 40, at);
  p.save.gold = 1000;
  keeperBuy(w, p, "ash_bear");
  assert.equal(p.save.gold, 1000);
  assert.equal(seals(p, "ash_bear"), 0);
  p.save.gold = 10_000_000;
  const inv = p.save.inventory.map(() => makePetSeal("cliff_lynx"));
  p.save.inventory = inv;
  keeperBuy(w, p, "ash_bear");
  assert.equal(p.save.gold, 10_000_000, "полная сумка — золото не списано");
  p.save.inventory = inv.map(() => null);
  keeperBuy(w, p, "rune_golem"); // 45 ур., репутация и знаки
  assert.equal(p.save.gold, 10_000_000);
  p.save.level = 45; p.recalc(); p.save.rep = 1500; p.save.marks = 160;
  keeperBuy(w, p, "rune_golem");
  assert.equal(p.save.gold, 10_000_000 - PETS.rune_golem.price);
  assert.equal(p.save.marks, 10, "знаки списаны");
  keeperBuy(w, p, "bone_hound");
  assert.equal(seals(p, "bone_hound"), 0, "гончая Умбрата — не для Сольгарда");
  const far = hero(solCls, 20, { x: keeper.x + 2000, y: keeper.y });
  far.save.gold = 100000;
  keeperBuy(w, far, "ash_bear");
  assert.equal(far.save.gold, 100000, "далеко от смотрителя");
});
t("изучение: питомец в коллекции с уровня продажи, печать исчезает; повтор — отказ; передать нечего", () => {
  const low = hero(solCls, 8, at);
  low.save.inventory[5] = makePetSeal("ash_bear");
  useItem(w, low, 5);
  assert.ok(!low.save.pets?.ash_bear && low.save.inventory[5], "8 ур. не изучит медведя (10 ур.)");
  const p = hero(solCls, 30, at);
  p.save.inventory[5] = makePetSeal("ash_bear");
  useItem(w, p, 5);
  assert.deepEqual(p.save.pets?.ash_bear, { level: PETS.ash_bear.level, xp: 0 });
  assert.equal(p.save.inventory[5], null);
  assert.equal(p.save.pet, "ash_bear");
  assert.equal(seals(p, "ash_bear"), 0, "после изучения печати нет — передать нечего");
  p.save.inventory[6] = makePetSeal("ash_bear");
  useItem(w, p, 6);
  assert.ok(p.save.inventory[6], "второй раз не изучается (печать можно продать)");
  assert.ok(keeperOffer(PETS.ash_bear, { ...p.save, faction: p.faction, level: p.level }).owned);
  const u = hero(umbCls, 40, at);
  u.save.inventory[5] = makePetSeal("sol_falcon");
  useItem(w, u, 5);
  assert.ok(!u.save.pets?.sol_falcon, "сокол Сольгарда — не для Умбрата");
});
t("уровень питомца: опыт за бой хозяина, до уровня героя, прирост по формуле", () => {
  const p = hero(solCls, 14, at);
  p.save.pets = { ash_bear: { level: 10, xp: 0 } };
  p.save.pet = "ash_bear";
  assert.equal(petXpToNext(10), Math.round(0.5 * xpToNext(10)));
  const pet = new Pet(PETS.ash_bear, p, 10);
  w.pets.set(pet.id, pet);
  w.state.mobs.set(pet.id, pet.unit);
  const hp10 = pet.unit.maxHp;
  petXp(w, p, petXpToNext(10) + 1);
  assert.equal(p.save.pets.ash_bear.level, 11);
  assert.equal(pet.unit.maxHp - hp10, petNextGain(PETS.ash_bear, 10).hp, "прирост здоровья — как в окне");
  petXp(w, p, 10_000_000);
  assert.equal(p.save.pets.ash_bear.level, 14, "не выше уровня героя");
  assert.ok(p.save.pets.ash_bear.xp < petXpToNext(14));
  const g = petNextGain(PETS.ash_bear, 14);
  assert.ok(g.dmg > 0 && g.hp > 0, "следующий уровень что-то даёт");
  w.pets.delete(pet.id); w.state.mobs.delete(pet.id);
});
t("миграция: Волчонок/Огонёк/Черепашка → новые, уровень и выбор сохраняются; запись в базу", () => {
  const save = { pets: { wolf: { level: 12, xp: 30 }, turtle: { level: 9, xp: 0 } } as Record<string, { level: number; xp: number }>, pet: "turtle" };
  assert.ok(migratePets(save));
  assert.deepEqual(save.pets, { cliff_lynx: { level: 12, xp: 30 }, ash_bear: { level: 9, xp: 0 } });
  assert.equal(save.pet, "ash_bear");
  assert.ok(!migratePets(save), "повторно ничего не меняет");
  const file = path.join(os.tmpdir(), `menagerie-${process.pid}.sqlite`);
  const db = new GameDB(file);
  try {
    const s = newSave(solCls, at);
    s.pets = { ember: { level: 20, xp: 5 } };
    s.pet = "ember";
    (db.raw.prepare("PRAGMA foreign_keys = OFF") as { run: () => void }).run();
    db.createChar(1, "Миграция", s);
    const a = db.load("Миграция")!;
    assert.deepEqual(a.pets, { ash_salamander: { level: 20, xp: 5 } });
    assert.equal(a.pet, "ash_salamander");
    const raw = JSON.parse((db.raw.prepare("SELECT data FROM players WHERE name_key = ?").get("миграция") as { data: string }).data);
    assert.deepEqual(raw.pets, { ash_salamander: { level: 20, xp: 5 } }, "замена записана сразу");
  } finally {
    db.close();
    fs.rmSync(file, { force: true });
  }
});
t("PvP: питомец в открытом мире не бьёт героя другой фракции; лечение питомца в PvP режется", () => {
  const p = hero(solCls, 40, at), e = hero(umbCls, 40, { x: at.x + 40, y: at.y });
  p.targetId = e.id;
  const pet = new Pet(PETS.bone_hound, p, 40);
  pet.unit.x = at.x + 30; pet.unit.y = at.y;
  w.pets.set(pet.id, pet);
  w.state.mobs.set(pet.id, pet.unit);
  const hp = e.unit.hp;
  for (let i = 0; i < 100; i++) { updatePet(w, pet, 0.1); w.time += 100; }
  assert.equal(e.unit.hp, hp, "урон питомца по герою");
  assert.equal(pet.unit.target, "");
  w.pets.delete(petUnitId(p.id)); w.state.mobs.delete(pet.id);
  // лечение «Призрачного света» (12%) в окне PvP — × pvpHealMult (40 ур.)
  const k = pvpHealMult(40);
  console.log(`       лечение питомца в PvP: ×${k.toFixed(3)} (12% → ${(12 * k).toFixed(2)}% здоровья), окно ${BAL.pvp.healWindowMs / 1000} с`);
  assert.ok(k < 0.2);
  const st = petStats(PETS.bone_hound, 40);
  console.log(`       гончая 40 ур.: здоровье ${st.maxHp}, урон ${Math.round(st.dmg)}; герой 40 ур.: здоровье ${e.unit.maxHp}`);
});
console.log(`\n${ok} ok`);
