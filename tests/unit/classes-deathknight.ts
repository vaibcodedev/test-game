/**
 * Рыцарь смерти (deathknight): все активные умения (типовой набор classes-kit) и механики — вампиризм, хватка (притяжение и провокация),
 * костяная броня, ледяное касание (корни по замедленному), казнь «Жатвы душ», рунный клинок, цепи, антимагия; угроза танка.
 * Запуск: npx tsx tests/unit/classes-deathknight.ts
 */
import { allBasics, bossDef, cast, dummy, learn, meter, mkHero, mkWorld, ready, run, withRandom, MID } from "./classes-kit";
import { assert, done, section, test } from "./lib";
import { TILE } from "../../shared/constants";

const C = "deathknight";
section("Рыцарь смерти: типовые проверки всех активных умений");
await allBasics(C, { dk_anti_magic: { grow: "none" } }); // антимагия лечит только от поглощённого урона — отдельный тест ниже

section("Рыцарь смерти: вампиризм и лечение от урона");

await test("dk_rune_strike: лечит на долю нанесённого урона; на ранге 5 доля больше", () => {
  const frac = (rank: number) => {
    const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
    learn(p, "dk_rune_strike", rank);
    p.unit.maxHp = 1e7; p.unit.hp = 1;
    const mt = meter(w);
    assert.equal(cast(w, p, "dk_rune_strike", m), null);
    assert.ok(mt.dealt(p) > 0);
    return mt.healed(p) / mt.dealt(p);
  };
  const a = frac(1), b = frac(5);
  assert.ok(a > 0, "не лечит");
  assert.ok(b > a, `доля ${b} ≤ ${a}`);
});

await test("dk_blood_drain: бьёт всех в радиусе и лечит от суммы урона; без врагов не лечит", () => {
  const w = mkWorld(), p = mkHero(w, C), a = dummy(w, p, 60), b = dummy(w, p, -60);
  learn(p, "dk_blood_drain", 1);
  p.unit.maxHp = 1e7; p.unit.hp = 1;
  const mt = meter(w);
  assert.equal(cast(w, p, "dk_blood_drain"), null);
  assert.ok(mt.taken(a) > 0 && mt.taken(b) > 0);
  assert.ok(mt.healed(p) > 0);
  const w2 = mkWorld(), q = mkHero(w2, C);
  learn(q, "dk_blood_drain", 1);
  q.unit.hp = 10;
  const mt2 = meter(w2);
  assert.equal(cast(w2, q, "dk_blood_drain"), null);
  assert.equal(mt2.healed(q), 0);
});

section("Рыцарь смерти: хватка, цепи, угроза");

await test("dk_death_grip: моб притянут вплотную, спровоцирован и замедлен; герой атакует его", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 220);
  learn(p, "dk_death_grip", 1);
  assert.equal(cast(w, p, "dk_death_grip", m), null);
  assert.ok(Math.hypot(m.x - p.x, m.y - p.y) < 60, `не притянут: ${Math.hypot(m.x - p.x, m.y - p.y)}`);
  assert.ok(m.tauntUntil > w.time && m.targetId === p.id);
  assert.ok(m.slowUntil > w.time);
  assert.ok(p.engaged && p.targetId === m.id);
});

await test("dk_death_grip по боссу: не притягивает и не провоцирует", () => {
  const w = mkWorld(), p = mkHero(w, C), b = dummy(w, p, 220, 0, { def: bossDef });
  const x0 = b.x;
  learn(p, "dk_death_grip", 1);
  assert.equal(cast(w, p, "dk_death_grip", b), null);
  assert.equal(b.x, x0);
  assert.equal(b.tauntUntil, 0);
});

await test("dk_death_grip по герою в PvP: притягивает и сбивает его путь (moveTo)", () => {
  const w = mkWorld(), p = mkHero(w, C), e = mkHero(w, "mage", { x: p.x + 220, y: p.y });
  p.team = 1; e.team = 2; w.pvpActive = true;
  e.moveTo = { x: e.x + 100, y: e.y };
  learn(p, "dk_death_grip", 1);
  assert.equal(cast(w, p, "dk_death_grip", e), null);
  assert.ok(Math.hypot(e.x - p.x, e.y - p.y) < 60);
  assert.equal(e.moveTo, null);
});

await test("dk_chain_storm: притягивает до max целей, босса не тянет, всех замедляет", () => {
  const w = mkWorld(), p = mkHero(w, C, { x: 22 * TILE, y: 18 * TILE });
  const ms = [0, 1, 2, 3, 4, 5, 6].map((i) => dummy(w, p, Math.cos(i) * 140, Math.sin(i) * 60));
  const b = dummy(w, p, 0, 120, { def: bossDef });
  const bx = b.x, by = b.y;
  learn(p, "dk_chain_storm", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "dk_chain_storm"), null);
  const hit = [...ms, b].filter((m) => mt.taken(m) > 0);
  assert.equal(hit.length, 6, `задето ${hit.length} (max 6)`);
  assert.ok(b.x === bx && b.y === by, "босс сдвинут");
  for (const m of hit) assert.ok(m.slowUntil > w.time);
});

await test("угроза: рыцарь смерти — танк (×3,5 к угрозе от урона)", () => {
  const w = mkWorld(), p = mkHero(w, C), q = mkHero(w, "rogue", { x: p.x, y: p.y + 30 }), m = dummy(w, p);
  withRandom(MID, () => { w.hit(p, m, { flat: 100, canCrit: false }); w.hit(q, m, { flat: 100, canCrit: false }); });
  assert.ok(Math.abs(m.threat.get(p.id)! / m.threat.get(q.id)! - 3.5) < 0.01);
});

section("Рыцарь смерти: лёд, казнь, клинок, броня, антимагия");

await test("dk_icy_touch: первое — замедление; второе по замедленному — корни; по боссу корней нет", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
  learn(p, "dk_icy_touch", 1);
  assert.equal(cast(w, p, "dk_icy_touch", m), null);
  run(w, 400);
  assert.ok(m.slowUntil > w.time && m.rootUntil <= w.time, "первое касание: нужны замедление без корней");
  ready(p); p.unit.mp = p.unit.maxMp;
  assert.equal(cast(w, p, "dk_icy_touch", m), null);
  run(w, 400);
  assert.ok(m.rootUntil > w.time, "второе касание не дало корней");
  const b = dummy(w, p, 150, 60, { def: bossDef });
  b.slowUntil = w.time + 5000; b.slowPct = 30;
  ready(p); p.unit.mp = p.unit.maxMp;
  assert.equal(cast(w, p, "dk_icy_touch", b), null);
  run(w, 400);
  assert.ok(b.rootUntil <= w.time, "босс в корнях");
});

await test("dk_soul_reap: по цели ниже 35 % здоровья — урон ×mult", () => {
  const hit = (frac: number) => {
    const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 40, 0, { hp: 1e9 });
    m.unit.hp = m.unit.maxHp * frac;
    learn(p, "dk_soul_reap", 1);
    const mt = meter(w);
    assert.equal(cast(w, p, "dk_soul_reap", m), null);
    return mt.taken(m);
  };
  const full = hit(0.9), low = hit(0.2);
  assert.ok(Math.abs(low / full - 2) < 0.02, `казнь ${low} / обычный ${full}`);
});

await test("dk_soul_reap: убийство цели — откат 2 с и лечение healKill % здоровья", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 40, 0, { hp: 1 });
  m.unit.maxHp = 1e6; m.unit.hp = 1;
  learn(p, "dk_soul_reap", 1);
  p.unit.hp = Math.round(p.unit.maxHp / 2);
  const hp = p.unit.hp;
  assert.equal(cast(w, p, "dk_soul_reap", m), null);
  assert.ok(m.dead, "цель жива");
  assert.equal(p.cds.get("dk_soul_reap"), w.time + 2000);
  assert.ok(p.unit.hp - hp >= Math.round(p.unit.maxHp * 0.12) - 1, `лечение ${p.unit.hp - hp}`);
});

await test("dk_rune_blade: автоатака сильнее на bonus % на время клинка", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  const a = withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  learn(p, "dk_rune_blade", 5);
  assert.equal(cast(w, p, "dk_rune_blade"), null);
  const b = withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  assert.ok(Math.abs(b / a - 1.27) < 0.03, `клинок ×${(b / a).toFixed(3)}, ждали ×1.27`);
  run(w, 10500);
  const c = withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  assert.ok(Math.abs(c - a) <= 1, "клинок не кончился");
});

await test("dk_bone_armor: щит absorb % здоровья; бьющий вплотную замедлен", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "dk_bone_armor", 1);
  assert.equal(cast(w, p, "dk_bone_armor"), null);
  assert.equal(p.shieldAmt, Math.round(p.unit.maxHp * 0.2));
  withRandom(MID, () => w.hit(m, p, { flat: 10 }));
  assert.ok(m.slowUntil > w.time, "атакующий не замедлен");
});

await test("dk_anti_magic: магический урон −60 % и лечит, физический — без изменений", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  p.unit.hp = p.unit.maxHp = 1e6;
  const fire0 = withRandom(MID, () => w.hit(m, p, { flat: 1000, canCrit: false, kind: "fire" }));
  const phys0 = withRandom(MID, () => w.hit(m, p, { flat: 1000, canCrit: false }));
  learn(p, "dk_anti_magic", 1);
  p.unit.hp = p.unit.maxHp = 1e6;
  assert.equal(cast(w, p, "dk_anti_magic"), null);
  const fire1 = withRandom(MID, () => w.hit(m, p, { flat: 1000, canCrit: false, kind: "fire" }));
  const phys1 = withRandom(MID, () => w.hit(m, p, { flat: 1000, canCrit: false }));
  assert.ok(Math.abs(fire1 - fire0 * 0.4) <= 2, `огонь ${fire1} при ${fire0}`);
  assert.equal(phys1, phys0);
});

done();
