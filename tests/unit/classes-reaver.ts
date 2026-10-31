/**
 * Потрошитель (reaver): все активные умения (типовой набор classes-kit) и механики — кровотечение (стаки, «комбо» для «Распора»
 * и «Жатвы»), прыжок (к цели, безмолвие, брызги, из корней), рассечение, бешенство (цена здоровьем, вампиризм, иммунитет
 * к замедлению), подсечка, жатва ран (без кровоточащих — отказ), бросок топора, бойня (стан обрывает, не убивает себя).
 * Запуск: npx tsx tests/unit/classes-reaver.ts
 */
import { allBasics, cast, dummy, learn, meter, mkHero, mkWorld, ready, run, withRandom, MID, type Prep } from "./classes-kit";
import { assert, done, section, test } from "./lib";
import { bleed, clearDots, dotOf } from "../../server/src/game/umbrath";
import { applySlow } from "../../server/src/game/effects";

const C = "reaver";
const bleeding: Prep = (w, p, m) => { bleed(w, p, m); bleed(w, p, m); };
section("Потрошитель: типовые проверки всех активных умений");
await allBasics(C, {
  rv_reap: { prep: bleeding },
  rv_frenzy: { grow: "none" }, // ранг — ускорение и вампиризм, отдельный тест
  rv_lacerate: { ms: 7000 },
});

section("Потрошитель: кровотечение");

await test("rv_lacerate: кровотечение стакается до stacks (3), тик × стаки", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "rv_lacerate", 1);
  for (let i = 0; i < 5; i++) { ready(p); p.unit.mp = p.unit.maxMp; assert.equal(cast(w, p, "rv_lacerate", m), null); }
  const d = dotOf(w, p, m, "bleed")!;
  assert.equal(d.stacks, 3);
  assert.ok(m.bleedUntil > w.time && m.bleedStacks === 3);
  p.engaged = false; p.targetId = null;
  const mt = meter(w);
  run(w, 1000);
  assert.equal(mt.taken(m), Math.max(1, Math.round(d.dmg * 3)));
});

await test("rv_gore: урон растёт на stack % за каждый стак кровотечения и лечит", () => {
  const dmg = (stacks: number) => {
    const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
    for (let i = 0; i < stacks; i++) bleed(w, p, m);
    learn(p, "rv_gore", 1);
    p.unit.maxHp = 1e7; p.unit.hp = 1;
    const mt = meter(w);
    assert.equal(cast(w, p, "rv_gore", m), null);
    assert.ok(mt.healed(p) > 0, "не лечит");
    return mt.taken(m);
  };
  const d0 = dmg(0), d3 = dmg(3);
  assert.ok(Math.abs(d3 / d0 - 290 / 200) < 0.03, `3 стака ${d3}, без ${d0}`);
});

await test("rv_reap: без кровоточащих врагов — отказ без списаний; иначе кровотечения сжигаются и лечат", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 60);
  learn(p, "rv_reap", 1);
  const mp = p.unit.mp;
  assert.ok(cast(w, p, "rv_reap"));
  assert.equal(p.unit.mp, mp);
  assert.ok(!p.cds.get("rv_reap"));
  bleeding(w, p, m);
  p.unit.maxHp = 1e7; p.unit.hp = 1;
  const mt = meter(w);
  assert.equal(cast(w, p, "rv_reap"), null);
  assert.ok(mt.taken(m) > 0 && mt.healed(p) > 0);
  assert.equal(dotOf(w, p, m, "bleed"), undefined, "кровотечение не снято");
});

await test("rv_carve: все враги вокруг получают урон и кровотечение", () => {
  const w = mkWorld(), p = mkHero(w, C), a = dummy(w, p, 50), b = dummy(w, p, -50), far = dummy(w, p, 250);
  learn(p, "rv_carve", 1);
  assert.equal(cast(w, p, "rv_carve"), null);
  assert.ok(dotOf(w, p, a, "bleed") && dotOf(w, p, b, "bleed"));
  assert.equal(dotOf(w, p, far, "bleed"), undefined);
});

await test("rv_hamstring: замедление slow % и кровотечение", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "rv_hamstring", 1);
  assert.equal(cast(w, p, "rv_hamstring", m), null);
  assert.ok(m.slowUntil > w.time && m.slowPct === 60 && dotOf(w, p, m, "bleed"));
});

await test("rv_throw: топор по линии — урон, кровотечение и замедление; сзади — нет", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200), back = dummy(w, p, -100);
  learn(p, "rv_throw", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "rv_throw", m), null);
  run(w, 500);
  assert.ok(mt.taken(m) > 0 && m.slowUntil > w.time && dotOf(w, p, m, "bleed"));
  assert.equal(mt.taken(back), 0);
});

section("Потрошитель: прыжок, бешенство, бойня");

await test("rv_leap: прыжок к цели (из корней), безмолвие цели, брызги по соседям", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200), n = dummy(w, p, 200, 40);
  learn(p, "rv_leap", 1);
  p.rootUntil = w.time + 5000;
  const mt = meter(w);
  assert.equal(cast(w, p, "rv_leap", m), null, "из корней не прыгает");
  assert.ok(Math.hypot(p.x - m.x, p.y - m.y) < 60);
  assert.ok(p.rootUntil <= w.time && m.silenceUntil > w.time);
  assert.ok(mt.taken(n) > 0, "брызг нет");
});

await test("rv_frenzy: цена — cost % текущего здоровья, ускорение, вампиризм; замедление не ложится", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "rv_frenzy", 5);
  const hp = p.unit.hp;
  assert.equal(cast(w, p, "rv_frenzy"), null);
  assert.equal(hp - p.unit.hp, Math.round(hp * 0.1));
  assert.ok(p.hasteUntil > w.time && p.hastePct === 50);
  assert.equal(applySlow(w, m, p, 50, 3000), false, "замедление легло под бешенством");
  p.unit.hp = 1;
  const mt = meter(w);
  withRandom(MID, () => w.hit(p, m, { canCrit: false }));
  assert.ok(mt.healed(p) > 0, "нет вампиризма");
});

await test("rv_frenzy: на 1 HP цена не убивает героя", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "rv_frenzy", 1);
  p.unit.hp = 1;
  assert.equal(cast(w, p, "rv_frenzy"), null);
  assert.ok(!p.dead && p.unit.hp >= 1);
});

await test("rv_massacre: вихрь бьёт врагов вокруг и платит здоровьем, но не ниже 1; стан обрывает", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 50);
  learn(p, "rv_massacre", 1);
  p.unit.hp = 5;
  const mt = meter(w);
  p.engaged = false;
  assert.equal(cast(w, p, "rv_massacre"), null);
  p.engaged = false; p.targetId = null;
  run(w, 1100);
  assert.ok(mt.taken(m) > 0);
  assert.ok(!p.dead && p.unit.hp >= 1, "бойня убила своего");
  p.stunUntil = w.time + 5000;
  run(w, 600);
  clearDots(m); // считаем только удары вихря, без тиков кровотечения
  const got = mt.taken(m);
  run(w, 3000);
  assert.equal(mt.taken(m), got, "вихрь крутится в стане");
});

done();
