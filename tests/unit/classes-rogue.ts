/**
 * Ассасин (rogue): все активные умения (типовой набор classes-kit) и механики — удар в спину и из скрытности, яд (стаки как
 * «комбо-очки», замедление на полных), «Смертельная доза» (сжигает стаки), теневой шаг (за спину, крит, безмолвие),
 * скрытность (снимает цель, недоступен для умений врага), подлый удар (стан, бонус из тени, босс — замедление), дым, танец клинков.
 * Запуск: npx tsx tests/unit/classes-rogue.ts
 */
import { allBasics, bossDef, cast, dummy, learn, meter, mkHero, mkWorld, ready, run, castSkill, withRandom, MID, type Prep } from "./classes-kit";
import { assert, done, section, test } from "./lib";
import { applyPoison } from "../../server/src/game/rogue";
import { Dir } from "../../shared/protocol";

const C = "rogue";
/** Цель смотрит на героя (герой слева, цель справа смотрит влево) — не со спины. */
const faceHero: Prep = (_w, _p, m) => { m.unit.dir = Dir.Left; };
section("Ассасин: типовые проверки всех активных умений");
await allBasics(C, {
  backstab: { prep: faceHero },
  as_cheap: { prep: faceHero },
  venom: { ms: 9000 },
});

section("Ассасин: удары и яд");

await test("backstab: со спины — урон ×behind, в лицо — обычный", () => {
  const dmg = (dir: Dir) => {
    const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
    m.unit.dir = dir;
    learn(p, "backstab", 1);
    const mt = meter(w);
    assert.equal(cast(w, p, "backstab", m), null);
    return mt.taken(m);
  };
  const face = dmg(Dir.Left), back = dmg(Dir.Right);
  assert.ok(Math.abs(back / face - 2) < 0.03, `спина ${back}, лицо ${face}`);
});

await test("backstab из скрытности — ×behind и в лицо; скрытность снимается", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  m.unit.dir = Dir.Left;
  learn(p, "backstab", 1);
  learn(p, "stealth", 1);
  assert.equal(cast(w, p, "stealth"), null);
  ready(p);
  const mt = meter(w);
  assert.equal(cast(w, p, "backstab", m), null);
  assert.ok(p.stealthUntil <= w.time, "скрытность не снята");
  const w2 = mkWorld(), q = mkHero(w2, C), m2 = dummy(w2, q);
  m2.unit.dir = Dir.Left;
  learn(q, "backstab", 1);
  const mt2 = meter(w2);
  assert.equal(cast(w2, q, "backstab", m2), null);
  assert.ok(Math.abs(mt.taken(m) / mt2.taken(m2) - 2) < 0.03, `из тени ${mt.taken(m)}, обычный ${mt2.taken(m2)}`);
});

await test("venom: стаки до maxStacks (3); на полных стаках — замедление; тик растёт со стаками", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "venom", 1);
  for (let i = 0; i < 5; i++) { ready(p); p.unit.mp = p.unit.maxMp; assert.equal(cast(w, p, "venom", m), null); }
  const e = p.poisons.get(m.id)!;
  assert.equal(e.stacks, 3);
  assert.ok(m.slowUntil > w.time, "нет замедления на полных стаках");
  p.engaged = false; p.targetId = null; // без автоатаки: считаем только яд
  const mt = meter(w);
  run(w, 1000);
  assert.equal(mt.taken(m), Math.max(1, Math.round(e.dmg * 3)));
});

await test("as_dose: сжигает стаки яда (урон растёт на burst % за стак), яд снят", () => {
  const dmg = (stacks: number) => {
    const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
    learn(p, "as_dose", 1);
    if (stacks) applyPoison(w, p, m, 1, stacks);
    const mt = meter(w);
    assert.equal(cast(w, p, "as_dose", m), null);
    assert.ok(!p.poisons.has(m.id), "яд не снят");
    return mt.taken(m);
  };
  const d0 = dmg(0), d3 = dmg(3);
  // (150 + 100·3) / 150 = 3
  assert.ok(Math.abs(d3 / d0 - 3) < 0.05, `3 стака ${d3}, без яда ${d0}`);
});

await test("as_fan: веер бьёт и отравляет врагов в конусе, сзади — нет", () => {
  const w = mkWorld(), p = mkHero(w, C), front = dummy(w, p, 120), back = dummy(w, p, -120);
  learn(p, "as_fan", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "as_fan", front), null);
  assert.ok(mt.taken(front) > 0 && p.poisons.has(front.id));
  assert.equal(mt.taken(back), 0);
});

section("Ассасин: тень, контроль, неуязвимость");

await test("shadowstep: герой за спиной цели, следующий удар — крит, цель в безмолвии", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200);
  m.unit.dir = Dir.Left; // смотрит на героя
  learn(p, "shadowstep", 1);
  assert.equal(cast(w, p, "shadowstep", m), null);
  assert.ok(p.x > m.x, `не за спиной: герой ${p.x}, цель ${m.x}`);
  assert.ok(p.critNextUntil > w.time && m.silenceUntil > w.time);
});

await test("stealth: снимает цель; враг-герой не может выбрать скрытого целью умения", () => {
  const w = mkWorld(), p = mkHero(w, C), e = mkHero(w, "ranger", { x: 14 * 32 + 200, y: 18 * 32 });
  p.team = 1; e.team = 2; w.pvpActive = true;
  learn(p, "stealth", 1);
  p.targetId = e.id;
  assert.equal(cast(w, p, "stealth"), null);
  assert.equal(p.targetId, null);
  learn(e, "aimed", 1);
  const mp = e.unit.mp;
  assert.ok(castSkill(w, e, "aimed", p.x, p.y, p.id), "попал умением в скрытого");
  assert.equal(e.unit.mp, mp);
});

await test("stealth: полученный урон снимает скрытность", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "stealth", 1);
  assert.equal(cast(w, p, "stealth"), null);
  withRandom(MID, () => w.hit(m, p, { flat: 10 }));
  assert.ok(p.stealthUntil <= w.time);
});

await test("as_cheap: стан stun с; из тени или со спины — дольше на bonus с; по боссу — замедление", () => {
  const stun = (behind: boolean) => {
    const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
    m.unit.dir = behind ? Dir.Right : Dir.Left;
    learn(p, "as_cheap", 1);
    assert.equal(cast(w, p, "as_cheap", m), null);
    return m.stunUntil - w.time;
  };
  assert.ok(Math.abs(stun(false) - 1800) <= 1 && Math.abs(stun(true) - 3300) <= 1, `${stun(false)} / ${stun(true)}`);
  const w = mkWorld(), p = mkHero(w, C), b = dummy(w, p, 40, 0, { def: bossDef });
  learn(p, "as_cheap", 1);
  assert.equal(cast(w, p, "as_cheap", b), null);
  assert.ok(b.stunUntil <= w.time && b.slowUntil > w.time && b.slowPct === 40);
});

await test("as_cheap: стан не дольше потолка maxMs (4 с) даже с бонусом на 5-м ранге", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  m.unit.dir = Dir.Right;
  learn(p, "as_cheap", 5);
  assert.equal(cast(w, p, "as_cheap", m), null);
  assert.ok(m.stunUntil - w.time <= 4000, `стан ${m.stunUntil - w.time}`);
});

await test("as_smoke: скрытность, ослабление врагов вокруг, мобы забывают угрозу", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 60);
  m.threat.set(p.id, 500);
  learn(p, "as_smoke", 1);
  assert.equal(cast(w, p, "as_smoke"), null);
  assert.ok(p.stealthUntil > w.time && m.weakUntil > w.time);
  assert.ok(!m.threat.has(p.id));
});

await test("as_dance: без врагов рядом — отказ без списаний; во время танца — неуязвим, бьёт hops раз", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "as_dance", 1);
  const mp = p.unit.mp;
  assert.ok(cast(w, p, "as_dance"));
  assert.equal(p.unit.mp, mp);
  const m = dummy(w, p, 100);
  const mt = meter(w);
  assert.equal(cast(w, p, "as_dance"), null);
  assert.ok(w.isImmune(p));
  assert.equal(withRandom(MID, () => w.hit(m, p, { flat: 1000 })), 0);
  run(w, 1500);
  assert.ok(mt.taken(m) > 0);
  assert.ok(!w.isImmune(p), "неуязвимость после танца");
});

done();
