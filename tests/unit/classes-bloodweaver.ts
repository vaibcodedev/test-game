/**
 * Кровотворец (bloodweaver): все активные умения (типовой набор classes-kit) и механики — кровавая стрела (лечит самого раненого),
 * узы (без союзника и питомца — отказ, доля урона союзника на себя), жертва крови (здоровье → мана или лечение, в безмолвии,
 * мало здоровья — отказ), купель, пиявка, кровавый взрыв (страх, боссы не боятся), переливание (не на себя), круг, алый прилив.
 * Запуск: npx tsx tests/unit/classes-bloodweaver.ts
 */
import { allBasics, bossDef, cast, castSkill, dummy, learn, meter, mkHero, mkWorld, run, withRandom, MID, type Aim } from "./classes-kit";
import { assert, done, knownFail, section, test } from "./lib";
import { skillMana, SKILLS } from "./classes-kit";
import { addDot } from "../../server/src/game/umbrath";

const C = "bloodweaver";
/** Союзник той же фракции (Рыцарь смерти, Умбрат) в 80 px — цель умений «на союзника». */
const ally: Aim = (w, p) => {
  const a = mkHero(w, "deathknight", { x: p.x + 80, y: p.y + 40 });
  return { ax: a.x, ay: a.y, tid: a.id };
};
section("Кровотворец: типовые проверки всех активных умений");
await allBasics(C, {
  bw_blood_bond: { aim: ally, grow: "heal" },
  bw_transfusion: { aim: ally },
  bw_sacrifice: { aim: ally },
  bw_tide: { grow: "none" }, // лечит от нанесённого урона — отдельный тест
  bw_leech: { grow: "dmg" },
});

/** Кровотворец, союзник (Рыцарь смерти) в 80 px. */
function duo() {
  const w = mkWorld(), p = mkHero(w, C), a = mkHero(w, "deathknight", { x: 14 * 32 + 80, y: 18 * 32 });
  return { w, p, a };
}

section("Кровотворец: лечение кровью");

await test("bw_blood_bolt: урон врагу и лечение самого раненого союзника рядом", () => {
  const { w, p, a } = duo();
  const m = dummy(w, p, 200);
  a.unit.maxHp = 1e7; a.unit.hp = 1;
  learn(p, "bw_blood_bolt", 1);
  assert.equal(cast(w, p, "bw_blood_bolt", m), null);
  run(w, 700);
  assert.ok(a.unit.hp > 1, "союзник не вылечен");
});

await test("bw_leech: тики тянут здоровье врага и лечат раненого союзника", () => {
  const { w, p, a } = duo();
  const m = dummy(w, p, 150);
  a.unit.maxHp = 1e7; a.unit.hp = 1;
  learn(p, "bw_leech", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "bw_leech", m), null);
  p.engaged = false; p.targetId = null;
  run(w, 3100);
  assert.ok(mt.taken(m) > 0 && mt.healed(a) > 0);
});

await test("bw_blood_bond: без союзника и без питомца — отказ без списаний", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "bw_blood_bond", 1);
  const mp = p.unit.mp;
  assert.ok(cast(w, p, "bw_blood_bond"));
  assert.equal(p.unit.mp, mp);
  assert.ok(!p.cds.get("bw_blood_bond"));
});

await test("bw_blood_bond: часть урона по союзнику (share %) принимает Кровотворец", () => {
  const { w, p, a } = duo();
  const m = dummy(w, a, 40);
  a.unit.hp = a.unit.maxHp = 1e6;
  learn(p, "bw_blood_bond", 1);
  const plain = withRandom(MID, () => w.hit(m, a, { flat: 1000, canCrit: false }));
  assert.equal(castSkill(w, p, "bw_blood_bond", a.x, a.y, a.id), null);
  const mt = meter(w);
  const bonded = withRandom(MID, () => w.hit(m, a, { flat: 1000, canCrit: false }));
  assert.ok(bonded < plain, `с узами ${bonded}, без ${plain}`);
  assert.ok(mt.taken(p) > 0, "Кровотворец не принял долю");
});

await test("bw_sacrifice на себя: цена здоровьем, мана +mana %, снимает корни, замедление и безмолвие; работает в безмолвии", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "bw_sacrifice", 1);
  p.unit.mp = skillMana(SKILLS.bw_sacrifice, 1, p.level); // ровно на цену (при 0 маны — баг B22 ниже)
  p.silenceUntil = p.rootUntil = p.slowUntil = w.time + 5000;
  p.slowPct = 50;
  const hp = p.unit.hp;
  assert.equal(cast(w, p, "bw_sacrifice"), null, "в безмолвии не кастуется");
  assert.ok(p.unit.hp < hp, "здоровье не списано");
  assert.ok(p.unit.mp >= Math.round(p.unit.maxMp * 0.25) - 1, `мана ${p.unit.mp} — не пришло 25 %`);
  assert.ok(p.silenceUntil <= w.time && p.rootUntil <= w.time && p.slowUntil <= w.time);
});

await test("B22: bw_sacrifice на себя при 0 маны: кровь превращается в ману (умение для восстановления маны)", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "bw_sacrifice", 1);
  p.unit.mp = 0;
  assert.equal(cast(w, p, "bw_sacrifice"), null);
  assert.ok(p.unit.mp > 0);
});

await test("bw_sacrifice: здоровья не больше цены — отказ без списаний", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "bw_sacrifice", 1);
  p.unit.hp = Math.round(p.unit.maxHp * 0.1);
  const hp = p.unit.hp, mp = p.unit.mp;
  assert.ok(cast(w, p, "bw_sacrifice"));
  assert.equal(p.unit.hp, hp);
  assert.equal(p.unit.mp, mp);
  assert.ok(!p.cds.get("bw_sacrifice"));
});

await test("bw_transfusion: на себя — отказ; здоровый Кровотворец отдаёт здоровье раненому союзнику", () => {
  const { w, p, a } = duo();
  learn(p, "bw_transfusion", 1);
  assert.ok(cast(w, p, "bw_transfusion"), "переливание на себя прошло");
  a.unit.hp = Math.round(a.unit.maxHp * 0.2);
  const hp = p.unit.hp, ha = a.unit.hp;
  assert.equal(castSkill(w, p, "bw_transfusion", a.x, a.y, a.id), null);
  assert.ok(p.unit.hp < hp && a.unit.hp > ha, `кастер ${hp}→${p.unit.hp}, союзник ${ha}→${a.unit.hp}`);
});

await test("bw_crimson_pool: тики бьют и замедляют врагов, лечат союзников в купели", () => {
  const { w, p, a } = duo();
  const m = dummy(w, p, 100);
  a.unit.maxHp = 1e7; a.unit.hp = 1;
  learn(p, "bw_crimson_pool", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "bw_crimson_pool", undefined, { ax: p.x + 80, ay: p.y, tid: null }), null);
  run(w, 2100);
  assert.ok(mt.taken(m) > 0 && m.slowUntil > w.time, "враг не задет");
  assert.ok(mt.healed(a) > 0, "союзник не вылечен");
});

await test("bw_blood_circle: союзники в круге лечатся каждую секунду и связаны узами", () => {
  const { w, p, a } = duo();
  a.unit.maxHp = 1e7; a.unit.hp = 1;
  learn(p, "bw_blood_circle", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "bw_blood_circle"), null);
  assert.equal(a.bondBy, p);
  run(w, 3100);
  assert.ok(mt.healed(a) > 0);
});

await test("bw_tide: на время прилива урон Кровотворца лечит", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "bw_tide", 1);
  p.unit.maxHp = 1e7; p.unit.hp = 1;
  const mt = meter(w);
  withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  const before = mt.healed(p);
  assert.equal(cast(w, p, "bw_tide"), null);
  withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  assert.ok(mt.healed(p) > before, "урон не лечит под приливом");
});

section("Кровотворец: страх");

await test("bw_blood_burst: страх врагов в круге; истекающие кровью — дольше (fearBleed); урон ×1.5 по проклятым", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150), b = dummy(w, p, 150, 30);
  addDot(w, p, b, "bleed", 1, 10, "blood");
  learn(p, "bw_blood_burst", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "bw_blood_burst", undefined, { ax: m.x, ay: m.y + 15, tid: null }), null);
  run(w, 650);
  assert.ok(m.fearUntil > w.time && b.fearUntil > m.fearUntil, `страх ${m.fearUntil - w.time} / кровь ${b.fearUntil - w.time}`);
  assert.ok(mt.taken(b) > mt.taken(m) * 1.3, `по кровоточащему ${mt.taken(b)}, обычному ${mt.taken(m)}`);
});

await test("bw_blood_burst по боссу: страх не ложится (иммунитет боссов)", () => {
  const w = mkWorld(), p = mkHero(w, C), b = dummy(w, p, 150, 0, { def: bossDef });
  learn(p, "bw_blood_burst", 1);
  assert.equal(cast(w, p, "bw_blood_burst", undefined, { ax: b.x, ay: b.y, tid: null }), null);
  run(w, 650);
  assert.ok(b.fearUntil <= w.time);
});

await test("bw_blood_burst: Кровотворец погиб до взрыва (0,6 с) — взрыва нет", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
  run(w, 100);
  learn(p, "bw_blood_burst", 1);
  assert.equal(cast(w, p, "bw_blood_burst", undefined, { ax: m.x, ay: m.y, tid: null }), null);
  w.hit(m, p, { flat: 1e9 });
  const mt = meter(w);
  run(w, 700);
  assert.equal(mt.taken(m), 0);
});

done();
