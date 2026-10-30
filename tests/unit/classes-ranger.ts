/**
 * Егерь (ranger): все активные умения (типовой набор classes-kit) и механики — снаряд и смерть цели в полёте, веер с замедлением,
 * перекат (рывок, ускорение, выход из корней), град, капканы (корни, лимит, босс — замедление), метка, пронзающая стрела по
 * обездвиженным, зверь-призыв (бьёт босса), шквал. Запуск: npx tsx tests/unit/classes-ranger.ts
 */
import { allBasics, bossDef, cast, dummy, learn, meter, mkHero, mkWorld, ready, run, withRandom, MID } from "./classes-kit";
import { assert, done, section, test } from "./lib";

const C = "ranger";
section("Егерь: типовые проверки всех активных умений");
await allBasics(C, {
  hr_beast: { grow: "none" }, // ранг — срок жизни зверя; урон зверя — отдельный тест
  hr_trap: { grow: "none" }, // капкан срабатывает от шага врага — отдельный тест
});

section("Егерь: выстрелы");

await test("aimed: урон по прилёту; цель погибла в полёте — урона по трупу нет, мана и откат уже списаны", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 300, 0, { hp: 1e6 });
  learn(p, "aimed", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "aimed", m), null);
  assert.equal(mt.taken(m), 0, "урон до прилёта");
  w.hit(p, m, { flat: 1e9 });
  assert.ok(m.dead);
  mt.reset();
  run(w, 1000);
  assert.equal(mt.taken(m), 0, "стрела ударила труп");
  assert.ok(p.cds.get("aimed")! > 0);
});

await test("aimed: стрелок погиб, пока стрела летела, — урона нет", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 300);
  run(w, 100);
  learn(p, "aimed", 1);
  assert.equal(cast(w, p, "aimed", m), null);
  w.hit(m, p, { flat: 1e9 });
  assert.ok(p.dead);
  const mt = meter(w);
  run(w, 1000);
  assert.equal(mt.taken(m), 0);
});

await test("volley: замедляет задетых, больше стрел на 5-м ранге", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
  learn(p, "volley", 1);
  assert.equal(cast(w, p, "volley", m), null);
  run(w, 500);
  assert.ok(m.slowUntil > w.time && m.slowPct > 0);
});

await test("rain: тики бьют врагов в круге и замедляют; вне круга — нет", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200), far = dummy(w, p, 200, 200);
  learn(p, "rain", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "rain", m), null);
  run(w, 1300);
  assert.ok(mt.taken(m) > 0 && m.slowUntil > w.time);
  assert.equal(mt.taken(far), 0);
});

await test("hr_mark: меченая цель получает от Егеря больше урона на bonus %", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
  const a = withRandom(MID, () => w.hit(p, m, { canCrit: false, mult: 30 })); // крупный удар: без ошибки округления
  learn(p, "hr_mark", 5);
  assert.equal(cast(w, p, "hr_mark", m), null);
  run(w, 300);
  const b = withRandom(MID, () => w.hit(p, m, { canCrit: false, mult: 30 }));
  assert.ok(Math.abs(b / a - 1.27) < 0.03, `метка ×${(b / a).toFixed(3)}`);
});

await test("hr_pierce: пробивает ряд врагов; по обездвиженному — урон +rootBonus %", () => {
  const dmg = (rooted: boolean) => {
    const w = mkWorld(), p = mkHero(w, C), a = dummy(w, p, 100), b = dummy(w, p, 200);
    if (rooted) b.rootUntil = w.time + 5000;
    learn(p, "hr_pierce", 1);
    const mt = meter(w);
    assert.equal(cast(w, p, "hr_pierce", b), null);
    run(w, 500);
    assert.ok(mt.taken(a) > 0, "первый в ряду не задет");
    return mt.taken(b);
  };
  const free = dmg(false), held = dmg(true);
  assert.ok(Math.abs(held / free - 1.5) < 0.03, `в корнях ${held}, свободен ${free}`);
});

await test("hr_barrage: сам стреляет в ближайшего врага shots раз; под станом — пропуск", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
  learn(p, "hr_barrage", 1);
  const mt = meter(w);
  p.attackAt = 1e15;
  assert.equal(cast(w, p, "hr_barrage"), null);
  p.stunUntil = w.time + 1200;
  for (let t = 0; t < 5000; t += 50) { p.attackAt = 1e15; w.update(50); }
  assert.ok(mt.taken(m) > 0, "шквал не стрелял");
});

section("Егерь: перекат, капканы, зверь");

await test("roll: рывок по направлению, ускорение атаки haste %; снимает корни (breaksRoot)", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "roll", 1);
  p.rootUntil = w.time + 5000;
  const x0 = p.x;
  assert.equal(cast(w, p, "roll"), null);
  assert.ok(p.x - x0 > 50, `сдвиг ${p.x - x0}`);
  assert.ok(p.rootUntil <= w.time, "корни не сняты");
  assert.ok(p.hasteUntil > w.time && p.hastePct === 40, `ускорение атаки ${p.hastePct}`);
});

await test("hr_trap: враг в круге — урон и корни; капкан одноразовый", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 120);
  learn(p, "hr_trap", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "hr_trap", undefined, { ax: m.x, ay: m.y, tid: null }), null);
  run(w, 300);
  assert.ok(mt.taken(m) > 0 && m.rootUntil > w.time, "капкан не сработал");
  const got = mt.taken(m);
  m.rootUntil = 0;
  run(w, 2000);
  assert.equal(mt.taken(m), got, "сработал второй раз");
});

await test("hr_trap по боссу: корней нет — замедление", () => {
  const w = mkWorld(), p = mkHero(w, C), b = dummy(w, p, 120, 0, { def: bossDef });
  learn(p, "hr_trap", 1);
  assert.equal(cast(w, p, "hr_trap", undefined, { ax: b.x, ay: b.y, tid: null }), null);
  run(w, 300);
  assert.ok(b.rootUntil <= w.time, "босс в корнях");
  assert.ok(b.slowUntil > w.time);
});

await test("hr_trap: не больше cap капканов — старый исчезает; капкан на капкан — отказ", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "hr_trap", 1);
  const spots = [p.x + 80, p.x + 160, p.x + 240];
  for (const x of spots) { ready(p); p.unit.mp = p.unit.maxMp; assert.equal(cast(w, p, "hr_trap", undefined, { ax: x, ay: p.y, tid: null }), null); }
  ready(p); p.unit.mp = p.unit.maxMp;
  const mp = p.unit.mp;
  assert.ok(cast(w, p, "hr_trap", undefined, { ax: spots[2], ay: p.y, tid: null }), "капкан на капкан прошёл");
  assert.equal(p.unit.mp, mp);
  // первый капкан снят лимитом (cap 2): враг на его месте не попадает
  const m = dummy(w, p, 80);
  const mt = meter(w);
  run(w, 500);
  assert.equal(mt.taken(m), 0, "старый капкан сверх лимита сработал");
});

await test("hr_beast: призыв временного зверя; зверь бьёт босса; через dur — исчезает", () => {
  const w = mkWorld(), p = mkHero(w, C), b = dummy(w, p, 60, 0, { def: bossDef });
  learn(p, "hr_beast", 1);
  assert.equal(cast(w, p, "hr_beast"), null);
  const pets = [...w.pets.values()].filter((x) => x.owner === p);
  assert.equal(pets.length, 1);
  assert.ok(pets[0].def.temp);
  p.targetId = b.id;
  p.unit.hp = p.unit.maxHp = 1e9;
  const mt = meter(w);
  run(w, 5000);
  assert.ok(mt.dealt(p) > 0, "зверь не ранил босса");
  run(w, 26000);
  assert.equal([...w.pets.values()].filter((x) => x.owner === p).length, 0, "зверь не исчез");
});

done();
