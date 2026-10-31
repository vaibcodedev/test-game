/**
 * Тёмный следопыт (darkranger): все активные умения (типовой набор classes-kit) и механики — проклятие (DoT, не складывается,
 * снимается со смертью), ослабление, ворон (безмолвие, без линии видимости), слияние с тенью, детонация проклятия,
 * рой (нет целей — отказ, не больше n), путы (корни, босс — замедление), пелена, вороньё. Запуск: npx tsx tests/unit/classes-darkranger.ts
 */
import { allBasics, bossDef, cast, dummy, learn, meter, mkHero, mkWorld, ready, run, PILLAR, type Prep } from "./classes-kit";
import { assert, done, knownFail, section, test } from "./lib";
import { addDot, dotsOf } from "../../server/src/game/umbrath";

const C = "darkranger";
const cursed: Prep = (w, p, m) => addDot(w, p, m, "curse", 50, 8, "shadow");
section("Тёмный следопыт: типовые проверки всех активных умений");
await allBasics(C, { dr_detonate: { prep: cursed }, dr_shadowmeld: { grow: "none" } });

section("Тёмный следопыт: проклятия");

await test("dr_cursed_arrow: проклятие тикает раз в секунду dur секунд; повтор не складывает тики", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200);
  learn(p, "dr_cursed_arrow", 1);
  assert.equal(cast(w, p, "dr_cursed_arrow", m), null);
  p.engaged = false; p.targetId = null;
  run(w, 400);
  assert.ok(m.curseUntil > w.time, "проклятия нет");
  const mt = meter(w);
  run(w, 2000);
  const two = mt.taken(m);
  assert.ok(two > 0);
  ready(p); p.unit.mp = p.unit.maxMp;
  assert.equal(cast(w, p, "dr_cursed_arrow", m), null);
  p.engaged = false; p.targetId = null;
  run(w, 300);
  mt.reset();
  run(w, 2000);
  assert.ok(Math.abs(mt.taken(m) - two) <= 2, `после повтора за 2 с ${mt.taken(m)}, раньше ${two}`);
});

await test("проклятие обрывается со смертью цели (тики по трупу не идут)", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 100, 0, { hp: 1e6 });
  cursed(w, p, m);
  run(w, 1100);
  w.hit(p, m, { flat: 1e9 });
  assert.ok(m.dead);
  const mt = meter(w);
  run(w, 3000);
  assert.equal(mt.taken(m), 0);
});

await test("dr_detonate: с проклятием — взрыв (урон больше) и проклятие снято; без проклятия — только выстрел", () => {
  const dmg = (curse: boolean) => {
    const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200);
    if (curse) cursed(w, p, m);
    learn(p, "dr_detonate", 1);
    const mt = meter(w);
    assert.equal(cast(w, p, "dr_detonate", m), null);
    p.engaged = false; p.targetId = null;
    run(w, 400);
    if (curse) assert.equal(dotsOf(w, p, m).length, 0, "проклятие не снято");
    return mt.taken(m);
  };
  const plain = dmg(false), boom = dmg(true);
  // взрыв = тик (50) × стаки × оставшиеся секунды (8) × burst % (100 на 1-м ранге)
  assert.ok(Math.abs(boom - plain - 400) <= 2, `с проклятием ${boom}, без ${plain}`);
});

await test("dr_hexswarm: нет врагов в круге — отказ без списаний; иначе не больше n целей, все прокляты", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "dr_hexswarm", 1);
  const mp = p.unit.mp;
  assert.ok(cast(w, p, "dr_hexswarm", undefined, { ax: p.x + 200, ay: p.y, tid: null }));
  assert.equal(p.unit.mp, mp);
  const ms = [0, 1, 2, 3, 4].map((i) => dummy(w, p, 200, -60 + i * 30));
  const mt = meter(w);
  assert.equal(cast(w, p, "dr_hexswarm", undefined, { ax: p.x + 200, ay: p.y, tid: null }), null);
  run(w, 1000);
  const hit = ms.filter((m) => mt.taken(m) > 0);
  assert.equal(hit.length, 3, `задето ${hit.length} при n = 3`);
  for (const m of hit) assert.ok(m.curseUntil > w.time);
});

await test("dr_veil: враги в пелене — урон, замедление, ослабление и проклятие", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200);
  learn(p, "dr_veil", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "dr_veil", m), null);
  run(w, 1100);
  assert.ok(mt.taken(m) > 0 && m.slowUntil > w.time && m.weakUntil > w.time && m.curseUntil > w.time);
});

await test("dr_ravens: птицы бьют врагов вокруг; по проклятой цели — урон +bonus %", () => {
  const dmg = (curse: boolean) => {
    const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
    if (curse) addDot(w, p, m, "curse", 1, 30, "shadow");
    learn(p, "dr_ravens", 1);
    const mt = meter(w);
    assert.equal(cast(w, p, "dr_ravens"), null);
    run(w, 500); // только первая птица: 250 мс + полёт 150 px (следующие летят уже в проклятую ею цель)
    return mt.taken(m);
  };
  const a = dmg(false), b = dmg(true);
  assert.ok(a > 0 && Math.abs(b / a - 1.5) < 0.03, `проклятая ${b}, чистая ${a}`);
});

await test("B23: значок проклятия цели не зависит от проклятий в другом мире (арена, подземелье) с тем же id моба", () => {
  const w1 = mkWorld(), a = mkHero(w1, C), m1 = dummy(w1, a, 200);
  const w2 = mkWorld(), b = mkHero(w2, C), m2 = dummy(w2, b, 200);
  assert.equal(m1.id, m2.id, "id мобов в разных мирах различаются — тест не воспроизводит условие");
  addDot(w1, a, m1, "curse", 50, 30, "shadow");
  addDot(w2, b, m2, "curse", 50, 8, "shadow");
  learn(b, "dr_detonate", 1);
  assert.equal(cast(w2, b, "dr_detonate", m2), null);
  b.engaged = false; b.targetId = null;
  run(w2, 400);
  assert.ok(m2.curseUntil <= w2.time, `флаг проклятия остался до ${m2.curseUntil} (чужая запись другого мира)`);
});

section("Тёмный следопыт: контроль и тень");

await test("dr_raven: первый клевок — безмолвие; ворону не нужна линия видимости (los: false)", () => {
  const w = mkWorld(), p = mkHero(w, C, PILLAR.a), m = dummy(w, p, PILLAR.b.x - PILLAR.a.x, PILLAR.b.y - PILLAR.a.y);
  learn(p, "dr_raven", 1);
  assert.equal(cast(w, p, "dr_raven", m), null, "ворон не летит за колонну");
  run(w, 700);
  assert.ok(m.silenceUntil > w.time);
});

await test("dr_weakening: ослабление weak % и замедление", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200);
  learn(p, "dr_weakening", 5);
  assert.equal(cast(w, p, "dr_weakening", m), null);
  run(w, 400);
  assert.ok(m.weakUntil > w.time && m.weakPct === 28 && m.slowUntil > w.time);
});

await test("dr_snare: корни root с; по боссу — замедление вместо корней", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200), b = dummy(w, p, 200, 60, { def: bossDef });
  learn(p, "dr_snare", 1);
  assert.equal(cast(w, p, "dr_snare", m), null);
  run(w, 400);
  assert.ok(m.rootUntil > w.time, "нет корней");
  ready(p); p.unit.mp = p.unit.maxMp;
  assert.equal(cast(w, p, "dr_snare", b), null);
  run(w, 400);
  assert.ok(b.rootUntil <= w.time && b.slowUntil > w.time);
});

await test("dr_shadowmeld: скрытность и крит после выхода; снимает корни; цель сброшена", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 100);
  learn(p, "dr_shadowmeld", 1);
  p.targetId = m.id;
  p.rootUntil = w.time + 5000;
  assert.equal(cast(w, p, "dr_shadowmeld"), null);
  assert.ok(p.stealthUntil > w.time && p.critNextUntil > p.stealthUntil);
  assert.equal(p.targetId, null);
  assert.ok(p.rootUntil <= w.time, "корни не сняты");
});

done();
