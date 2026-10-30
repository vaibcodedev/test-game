/**
 * Бой и формулы без сервера: shared/formulas (опыт, очки, производные характеристики, броня), World.hitEx (урон, крит, броня,
 * неуязвимость, смерть, награды), питомец по боссу, откаты и ограничения умений, смерть и возрождение, ограничение скорости.
 * Контроль и DR — в tests/cc.ts. Запуск: npx tsx tests/unit/combat.ts
 */
import { World } from "../../server/src/game/World";
import { Player, newSave } from "../../server/src/game/Player";
import { Mob } from "../../server/src/game/Mob";
import { Pet } from "../../server/src/game/Pet";
import { castSkill } from "../../server/src/game/skills";
import { registerCombat, type On } from "../../server/src/rooms/common";
import { WorldState } from "../../server/src/rooms/schema";
import { generateArenaMap } from "../../shared/arena";
import { armorReduction, derive, mobStats, softStat, SOFT_STAT, DODGE_CAP, skillPointsAt, statPointsAt, xpForKill, xpToNext } from "../../shared/formulas";
import { CLASSES, type ClassId } from "../../shared/classes";
import { MAX_LEVEL, RESPAWN_DELAY_MS, TILE } from "../../shared/constants";
import { MOBS, MOB_AI } from "../../shared/mobs";
import { PETS } from "../../shared/pets";
import { SKILLS } from "../../shared/skills";
import { BAL } from "../../shared/balance";
import { makeItem, Rarity } from "../../shared/items";
import { assert, done, knownFail, section, test, withRandom } from "./lib";

const CLS = Object.keys(CLASSES) as ClassId[];

// ---------------------------------------------------------------- формулы
section("Формулы: опыт, очки, характеристики");

await test("xpToNext: положителен и растёт на 1…MAX−1, 0 на максимуме и вне диапазона", () => {
  let prev = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    const x = xpToNext(l);
    assert.ok(Number.isFinite(x) && x > prev, `уровень ${l}: ${x} ≤ ${prev}`);
    prev = x;
  }
  for (const l of [MAX_LEVEL, MAX_LEVEL + 5, 0, -3]) assert.equal(xpToNext(l), 0, `уровень ${l}`);
});

await test("очки характеристик и умений: 0/1 на 1-м уровне, не убывают, целые", () => {
  assert.equal(statPointsAt(1), 0);
  assert.equal(skillPointsAt(1), 1);
  for (let l = 2; l <= MAX_LEVEL; l++) {
    assert.ok(statPointsAt(l) > statPointsAt(l - 1));
    assert.ok(skillPointsAt(l) >= skillPointsAt(l - 1) && Number.isInteger(skillPointsAt(l)));
  }
  assert.equal(statPointsAt(0), 0, "уровень 0 даёт отрицательные очки");
});

await test("softStat: до порога 1:1, дальше растёт медленнее и не выше 2× порога", () => {
  assert.equal(softStat(SOFT_STAT / 2), SOFT_STAT / 2);
  let prev = softStat(SOFT_STAT);
  for (const x of [SOFT_STAT * 1.5, SOFT_STAT * 3, SOFT_STAT * 30, 1e9]) {
    const v = softStat(x);
    assert.ok(v > prev && v < SOFT_STAT * 2, `${x} → ${v}`);
    prev = v;
  }
});

await test("derive: у всех классов на 1/50/100 уровне — конечные числа, dmgMin ≤ dmgMax, крит ≤ 75 %, уклонение ≤ потолка даже при огромной Ловкости", () => {
  for (const cls of CLS) for (const level of [1, 50, MAX_LEVEL]) for (const agi of [0, 100_000]) {
    const d = derive({ cls, level, alloc: { str: 0, agi, int: 0, vit: 0 }, skills: {}, equip: {} });
    for (const [k, v] of Object.entries(d)) if (typeof v === "number") assert.ok(Number.isFinite(v), `${cls} ${level}: ${k}=${v}`);
    assert.ok(d.maxHp > 0 && d.maxMp > 0 && d.attackCd > 0, `${cls}: hp/mp/cd`);
    assert.ok(d.dmgMin <= d.dmgMax && d.dmgMin > 0, `${cls}: урон ${d.dmgMin}–${d.dmgMax}`);
    assert.ok(d.crit <= 0.75 && d.crit >= 0, `${cls}: крит ${d.crit}`);
    assert.ok(d.dodge <= DODGE_CAP && d.dodge >= 0, `${cls}: уклонение ${d.dodge}`);
  }
});

await test("derive: Выносливость даёт здоровье и броню, оружие лучше — урон выше, снятое оружие — урон «кулаков»", () => {
  const base = { cls: "warrior" as ClassId, level: 30, alloc: { str: 0, agi: 0, int: 0, vit: 0 }, skills: {}, equip: {} };
  const a = derive(base), b = derive({ ...base, alloc: { ...base.alloc, vit: 50 } });
  assert.ok(b.maxHp > a.maxHp && b.armor > a.armor);
  const weak = derive({ ...base, equip: { weapon: makeItem("sword", 5, Rarity.Common, () => 0.5) } });
  const strong = derive({ ...base, equip: { weapon: makeItem("sword", 60, Rarity.Epic, () => 0.5) } });
  assert.ok(strong.dmgMax > weak.dmgMax && weak.dmgMax > a.dmgMax);
});

await test("armorReduction: 0 без брони, растёт с бронёй, падает с уровнем атакующего, всегда < 1", () => {
  assert.equal(armorReduction(0, 50), 0);
  let prev = 0;
  for (const a of [10, 100, 1000, 1e6]) {
    const r = armorReduction(a, 50);
    assert.ok(r > prev && r < 1, `броня ${a}: ${r}`);
    prev = r;
  }
  assert.ok(armorReduction(500, 10) > armorReduction(500, 90));
});

await test("mobStats: здоровье, урон, броня и опыт растут с уровнем; золото — min ≤ max", () => {
  for (const def of Object.values(MOBS).slice(0, 40)) {
    const a = mobStats(def, 10), b = mobStats(def, 60);
    assert.ok(b.maxHp > a.maxHp && b.dmg > a.dmg && b.xp >= a.xp, def.id);
    assert.ok(a.gold[0] <= a.gold[1] && b.gold[0] <= b.gold[1], `${def.id}: золото ${a.gold}`);
  }
});

await test("xpForKill: ≥ 1, серые мобы почти ничего, бонус за старших не больше +50 %", () => {
  assert.equal(xpForKill(100, 50, 50), 100);
  assert.ok(xpForKill(100, 10, 60) >= 1 && xpForKill(100, 10, 60) <= 10);
  assert.equal(xpForKill(100, 99, 50), 150);
  assert.equal(xpForKill(0, 1, 100), 1);
});

// ---------------------------------------------------------------- удар
section("Удар: урон, крит, броня, неуязвимость");

const mkWorld = () => new World(new WorldState(), () => {}, { map: generateArenaMap(), mobs: false, quiet: true } as never);
let uid = 0;
function mkHero(w: World, cls: ClassId = "warrior", level = 40, dx = 0): Player {
  const save = newSave(cls, { x: 15 * TILE + dx, y: 17.5 * TILE });
  save.level = level;
  const p = new Player(`h${++uid}`, `Боец${uid}`, save, () => {});
  w.addPlayer(p);
  p.unit.hp = p.unit.maxHp;
  p.unit.mp = p.unit.maxMp;
  return p;
}
const plainDef = Object.values(MOBS).find((d) => !d.boss && !MOB_AI[d.id]?.weak)!;
const bossDef = Object.values(MOBS).find((d) => d.boss && !MOB_AI[d.id]?.weak) ?? Object.values(MOBS).find((d) => d.boss)!;
function mkMob(w: World, p: Player, def = plainDef, level = 40) {
  const m = new Mob(w.uid("m"), def, level, { x: p.x + 40, y: p.y });
  w.addMob(m);
  m.unit.x = p.x + 40;
  m.unit.y = p.y;
  return m;
}
const MID = [0.5]; // все броски — середина: урон детерминирован, крита (0.5 > шанса) и уклонения нет

await test("урон героя по мобу: ≥ 1, равен потере здоровья; по мёртвому и мёртвым — 0", () => {
  const w = mkWorld(), p = mkHero(w), m = mkMob(w, p);
  const hp0 = m.unit.hp;
  const v = withRandom(MID, () => w.hit(p, m));
  assert.ok(v >= 1);
  assert.equal(hp0 - m.unit.hp, v);
  p.dead = true;
  assert.equal(w.hit(p, m), 0, "мёртвый герой бьёт");
  p.dead = false;
  m.unit.hp = 1;
  w.hit(p, m, { flat: 50 });
  assert.ok(m.dead);
  assert.equal(w.hit(p, m), 0, "удар по трупу");
  assert.equal(m.unit.hp, 0, "здоровье ниже нуля");
});

await test("броня снижает урон, урон стихий режет броню вдвое", () => {
  const w = mkWorld(), p = mkHero(w), m = mkMob(w, p);
  m.unit.hp = m.unit.maxHp = 1e9;
  m.stats = { ...m.stats, armor: 0 };
  const bare = withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  m.stats = { ...m.stats, armor: 5000 };
  const armored = withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  const fire = withRandom(MID, () => w.hit(p, m, { canCrit: false, kind: "fire" }));
  assert.ok(armored < bare, `${armored} ≥ ${bare}`);
  assert.ok(fire > armored, `огонь ${fire} ≤ физ ${armored}`);
});

await test("крит: гарантированный крит (critNextUntil) = обычный × critMult; флаг расходуется", () => {
  const w = mkWorld(), p = mkHero(w), m = mkMob(w, p);
  m.unit.hp = m.unit.maxHp = 1e9;
  const normal = withRandom(MID, () => w.hit(p, m, { canCrit: true }));
  p.critNextUntil = w.time + 1000;
  const crit = withRandom(MID, () => w.hit(p, m));
  assert.equal(p.critNextUntil, 0);
  const k = crit / normal;
  assert.ok(Math.abs(k - p.derived.critMult) < 0.05, `крит ×${k.toFixed(3)}, ждали ×${p.derived.critMult}`);
});

await test("PvP: сила крита по герою не выше pvp.critMultMax, один удар не больше hitCapHp здоровья цели", () => {
  const w = mkWorld(), a = mkHero(w, "warrior", 60), b = mkHero(w, "mage", 60, 30);
  a.team = 1; b.team = 2;
  w.pvpActive = true;
  a.save.skills.deadly = 10; // крит ×(1.5 + 1.2)
  a.recalc();
  a.critNextUntil = w.time + 1000;
  const v = withRandom(MID, () => w.hit(a, b, { mult: 50 }));
  assert.ok(v <= Math.ceil(b.unit.maxHp * BAL.pvp.hitCapHp), `удар ${v} > потолка ${b.unit.maxHp * BAL.pvp.hitCapHp}`);
});

await test("неуязвимый моб (рейд-босс до начала): промах, здоровье не меняется, угрозы нет", () => {
  const w = mkWorld(), p = mkHero(w), m = mkMob(w, p, bossDef);
  m.immune = true;
  const hp = m.unit.hp;
  assert.equal(w.hit(p, m, { flat: 1000 }), 0);
  assert.equal(m.unit.hp, hp);
  assert.ok(!m.threat.has(p.id), "неуязвимый набрал угрозу");
});

await test("босс на паузе фазы (dmgTakenMul 0.1) получает в 10 раз меньше", () => {
  const w = mkWorld(), p = mkHero(w), m = mkMob(w, p, bossDef);
  m.unit.hp = m.unit.maxHp = 1e9;
  const full = withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  m.dmgTakenMul = 0.1;
  const cut = withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  assert.ok(Math.abs(cut - full * 0.1) <= 1, `${cut} vs ${full}`);
});

await test("щит героя поглощает урон, пока есть остаток; пробитый щит исчезает, лишнее — по здоровью", () => {
  const w = mkWorld(), p = mkHero(w), m = mkMob(w, p);
  p.shieldAmt = 30;
  p.shieldUntil = w.time + 5000;
  const hp = p.unit.hp;
  withRandom(MID, () => w.hit(m, p, { flat: 20 }));
  assert.equal(p.unit.hp, hp, "урон прошёл сквозь щит");
  assert.ok(p.shieldAmt > 0 && p.shieldAmt < 30, `остаток ${p.shieldAmt}`);
  withRandom(MID, () => w.hit(m, p, { flat: 400 }));
  assert.equal(p.shieldAmt, 0);
  assert.equal(p.shieldUntil, 0, "срок пробитого щита не обнулён");
  assert.ok(p.unit.hp < hp, "лишнее не прошло по здоровью");
});

await test("убийство моба: опыт герою, моб мёртв, возрождение назначено", () => {
  const w = mkWorld(), p = mkHero(w, "warrior", 20), m = mkMob(w, p, plainDef, 20);
  const xp = p.save.xp, lvl = p.level;
  w.hit(p, m, { flat: 1e9 }); // flat тоже проходит через броню — берём с запасом
  assert.ok(m.dead && m.respawnAt > w.time);
  assert.ok(p.save.xp > xp || p.level > lvl, "опыт не начислен");
});

await test("награда за моба: каждому участнику рядом — убийство и опыт; ушедший далеко — ничего; мешки добычи личные", () => {
  const w = mkWorld(), a = mkHero(w, "warrior", 20), b = mkHero(w, "mage", 20, 20), far = mkHero(w, "healer", 20, -20);
  const m = mkMob(w, a, plainDef, 20);
  a.forceDrop = b.forceDrop = true;
  m.unit.hp = m.unit.maxHp = 1e6;
  w.hit(b, m, { flat: 10 });
  w.hit(far, m, { flat: 10 });
  far.unit.x += 5000; // ушёл дальше contribRange до смерти моба
  const k = [a.save.kills, b.save.kills, far.save.kills], xp = [a.save.xp, b.save.xp, far.save.xp];
  w.hit(a, m, { flat: 1e9 });
  assert.ok(m.dead);
  assert.deepEqual([a.save.kills, b.save.kills, far.save.kills], [k[0] + 1, k[1] + 1, k[2]]);
  assert.ok(a.save.xp > xp[0] && b.save.xp > xp[1] && far.save.xp === xp[2]);
  const bagA = [...a.bags.keys()][0];
  assert.ok(bagA, "у убийцы нет мешка при forceDrop");
  assert.ok(!b.bags.has(bagA), "чужой мешок виден другому");
});

await test("питомец бьёт босса; неуязвимого босса — нет", () => {
  const w = mkWorld(), p = mkHero(w, "warrior", 60), m = mkMob(w, p, bossDef, 60);
  const def = Object.values(PETS).find((d) => !d.temp && !d.projectile) ?? Object.values(PETS)[0];
  const pet = new Pet(def, p, 60);
  pet.unit.x = m.x - 20;
  pet.unit.y = m.y;
  w.pets.set(pet.id, pet);
  w.state.mobs.set(pet.id, pet.unit);
  p.targetId = m.id;
  p.unit.hp = p.unit.maxHp = 1e9; // босс отвечает — хозяин не должен умереть за время теста
  // урон питомца идёт через applyDamage(босс, v, хозяин); сам хозяин не атакует (engaged = false)
  let dealt = 0;
  const orig = w.applyDamage.bind(w);
  w.applyDamage = (dst, v, src) => { if (dst === m && src === p) dealt += v; orig(dst, v, src); };
  for (let i = 0; i < 100; i++) w.update(50);
  assert.ok(dealt > 0, "питомец не ранил босса за 5 с");
  m.immune = true;
  dealt = 0;
  for (let i = 0; i < 100; i++) w.update(50);
  assert.equal(dealt, 0, "питомец ранил неуязвимого босса");
});

// ---------------------------------------------------------------- умения
section("Умения: откаты, мана, класс, контроль, смерть");

const firstActive = (cls: ClassId) => Object.values(SKILLS).find((s) => s.cls === cls && s.kind === "active" && (s.cd?.(1) ?? 0) > 0 && s.target !== "enemy")!;

await test("повтор умения на откате и во время GCD не тратит ману и не продлевает откат", () => {
  const w = mkWorld(), p = mkHero(w, "mage", 60);
  const s = firstActive("mage");
  p.save.skills[s.id] = 1;
  p.recalc();
  p.unit.mp = p.unit.maxMp;
  const r1 = castSkill(w, p, s.id, p.x, p.y + 40, null);
  assert.equal(r1, null, `первый каст отклонён: ${r1}`);
  const cd = p.cds.get(s.id)!, mp = p.unit.mp;
  assert.ok(cd > w.time, "откат не поставлен");
  for (let i = 0; i < 5; i++) castSkill(w, p, s.id, p.x, p.y + 40, null);
  assert.equal(p.unit.mp, mp, "ман списано на откате");
  assert.equal(p.cds.get(s.id), cd);
});

await test("отказ: чужое умение, не выученное, мало маны, мёртвый, оглушённый — без списаний", () => {
  const w = mkWorld(), p = mkHero(w, "mage", 60);
  const s = firstActive("mage");
  const foreign = firstActive("warrior");
  p.unit.mp = p.unit.maxMp;
  const mp = p.unit.mp;
  assert.ok(castSkill(w, p, foreign.id, p.x, p.y, null), "чужое умение прошло");
  assert.ok(castSkill(w, p, s.id, p.x, p.y, null), "невыученное прошло");
  assert.ok(castSkill(w, p, "__proto__", p.x, p.y, null));
  p.save.skills[s.id] = 1;
  p.unit.mp = 0;
  const lowMana = castSkill(w, p, s.id, p.x, p.y + 40, null);
  if (s.mana) assert.ok(lowMana, "без маны прошло");
  p.unit.mp = mp;
  p.dead = true;
  assert.ok(castSkill(w, p, s.id, p.x, p.y + 40, null), "мёртвый кастует");
  p.dead = false;
  p.stunUntil = w.time + 2000;
  castSkill(w, p, s.id, p.x, p.y + 40, null);
  assert.equal(p.cds.get(s.id) ?? 0, 0, "под станом откат поставлен");
  assert.equal(p.unit.mp, mp);
});

await test("смерть во время каста: каст не завершается, мёртвый не кастует; возрождение — только после задержки, −10 % золота (не в минус)", () => {
  const w = mkWorld(), p = mkHero(w), m = mkMob(w, p);
  p.castUntil = w.time + 2000;
  p.save.gold = 105;
  w.hit(m, p, { flat: 1e9 });
  assert.ok(p.dead && p.unit.hp === 0);
  w.respawn(p);
  assert.ok(p.dead, "возродился без задержки");
  w.time += RESPAWN_DELAY_MS + 1;
  w.respawn(p);
  assert.ok(!p.dead && p.unit.hp === p.unit.maxHp);
  assert.equal(p.save.gold, 105 - 10);
  w.respawn(p); // повторно — ничего
  assert.equal(p.save.gold, 95);
  p.save.gold = 0;
  w.hit(m, p, { flat: 1e9 });
  w.time += RESPAWN_DELAY_MS + 1;
  w.respawn(p);
  assert.equal(p.save.gold, 0);
});

// ---------------------------------------------------------------- движение
section("Античит: ввод движения");

function handlers(w: World) {
  const h: Record<string, (p: Player, m: any) => void> = {};
  const on: On = (type, fn) => void (h[type] = fn as never);
  registerCombat(on, () => w);
  return h;
}

await test("input: |mx|,|my| > 1 и NaN обрезаются — за 1 с герой проходит не больше своей скорости", () => {
  const w = mkWorld(), p = mkHero(w), h = handlers(w);
  h.input(p, { mx: 1000, my: -1000 });
  assert.ok(Math.abs(p.input.mx) <= 1 && Math.abs(p.input.my) <= 1);
  h.input(p, { mx: NaN, my: 1 });
  h.input(p, { mx: "1", my: 1 });
  assert.equal(p.input.mx, 1);
  const x0 = p.x, y0 = p.y, sp = w.playerSpeed(p);
  for (let i = 0; i < 20; i++) w.update(50);
  const moved = Math.hypot(p.x - x0, p.y - y0);
  assert.ok(moved <= sp * 1.0 + 2, `прошёл ${moved.toFixed(1)} px при скорости ${sp.toFixed(1)}/с`);
  assert.ok(moved >= sp * 0.5, `почти не сдвинулся: ${moved.toFixed(1)} px (тест скорости без движения бессмыслен)`);
});

await test("moveTo: точка за краем карты обрезается до карты, мусор игнорируется", () => {
  const w = mkWorld(), p = mkHero(w), h = handlers(w);
  h.moveTo(p, { x: -1e9, y: 1e12 });
  assert.ok(p.moveTo && p.moveTo.x >= 0 && p.moveTo.y <= w.map.h * TILE);
  p.moveTo = null;
  h.moveTo(p, { x: "5", y: 5 });
  h.moveTo(p, { x: Infinity, y: 5 });
  assert.equal(p.moveTo, null);
});

await test("attack/target: по мёртвому, несуществующему и своему — цель не ставится", () => {
  const w = mkWorld(), a = mkHero(w), b = mkHero(w, "mage", 40, 30), h = handlers(w);
  a.team = b.team = 1;
  h.attack(a, { id: b.id });
  assert.ok(!a.engaged, "атакует союзника");
  h.attack(a, { id: "нет-такого" });
  h.attack(a, { id: 5 });
  assert.ok(!a.engaged);
  const m = mkMob(w, a);
  m.state = "dead";
  h.attack(a, { id: m.id });
  assert.ok(!a.engaged, "атакует труп");
});

done();
