/**
 * Чернокнижник (warlock): все активные умения (типовой набор classes-kit) и механики — агония (DoT; страх рвётся уроном),
 * высасывание маны (у героя-врага отнимает), скелеты и демон (призывы: бьют боссов, на арене только от умения, исчезают по сроку,
 * один демон), рок, порча (+amp % урона по цели, страх; босс не боится), сифон, взрыв проклятий (без проклятий — отказ),
 * метаморфоза (урон, иммунитет к страху и корням). Запуск: npx tsx tests/unit/classes-warlock.ts
 */
import { allBasics, bossDef, cast, dummy, learn, meter, mkHero, mkWorld, ready, run, withRandom, MID, type Prep } from "./classes-kit";
import { assert, done, section, test } from "./lib";
import { addDot, dotsOf } from "../../server/src/game/umbrath";
import { applyFear, applyRoot } from "../../server/src/game/effects";
import type { World } from "../../server/src/game/World";
import type { Player } from "../../server/src/game/Player";

const C = "warlock";
const agony: Prep = (w, p, m) => addDot(w, p, m, "agony", 60, 8, "shadow");
section("Чернокнижник: типовые проверки всех активных умений");
await allBasics(C, {
  wl_detonate: { prep: agony },
  wl_drain_mana: { manaFree: true }, // цена 0, мана возвращается
  wl_demon: { ms: 8000 }, // урон демона (ранг — сила)
  wl_meta: { grow: "none" }, // бафф урона — отдельный тест
  wl_hex: { grow: "none" }, // amp — множитель урона, своего урона нет
});

const summons = (w: World, p: Player) => [...w.pets.values()].filter((x) => x.owner === p);

section("Чернокнижник: призывы");

await test("на арене (без мобов мира) у чернокнижника нет питомца, пока он не призовёт его умением", () => {
  const w = mkWorld(), p = mkHero(w, C);
  run(w, 4000);
  assert.equal(summons(w, p).length, 0, "питомец появился сам");
  learn(p, "wl_demon", 1);
  assert.equal(cast(w, p, "wl_demon", undefined, { ax: p.x + 60, ay: p.y, tid: null }), null);
  assert.equal(summons(w, p).length, 1);
  assert.ok(summons(w, p)[0].def.temp);
});

await test("wl_demon: демон бьёт босса; повторный призыв заменяет (демон один); через dur исчезает", () => {
  const w = mkWorld(), p = mkHero(w, C), b = dummy(w, p, 80, 0, { def: bossDef });
  learn(p, "wl_demon", 1);
  assert.equal(cast(w, p, "wl_demon", undefined, { ax: p.x + 40, ay: p.y, tid: null }), null);
  p.targetId = b.id;
  p.unit.hp = p.unit.maxHp = 1e9;
  const mt = meter(w);
  run(w, 4000);
  assert.ok(mt.dealt(p) > 0, "демон не ранил босса");
  ready(p); p.unit.mp = p.unit.maxMp;
  assert.equal(cast(w, p, "wl_demon", undefined, { ax: p.x + 40, ay: p.y, tid: null }), null);
  assert.equal(summons(w, p).length, 1, "два демона сразу");
  run(w, 26000);
  assert.equal(summons(w, p).length, 0, "демон не исчез по сроку");
});

await test("wl_demon: сила демона растёт с рангом (здоровье и урон × power)", () => {
  const hp = (rank: number) => {
    const w = mkWorld(), p = mkHero(w, C);
    learn(p, "wl_demon", rank);
    assert.equal(cast(w, p, "wl_demon", undefined, { ax: p.x + 40, ay: p.y, tid: null }), null);
    return summons(w, p)[0].unit.maxHp;
  };
  assert.ok(hp(5) > hp(1) * 1.5, `${hp(5)} / ${hp(1)}`);
});

await test("wl_skeletons: корни врагам в круге, скелет-прислужник; скелет бьёт неуязвимого босса — нет", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150), b = dummy(w, p, 150, 40, { def: bossDef });
  learn(p, "wl_skeletons", 1);
  assert.equal(cast(w, p, "wl_skeletons", m), null);
  assert.ok(m.rootUntil > w.time, "нет корней");
  assert.ok(b.rootUntil <= w.time, "босс в корнях");
  assert.equal(summons(w, p).length, 1);
  b.immune = true;
  p.targetId = b.id;
  p.unit.hp = p.unit.maxHp = 1e9;
  const mt = meter(w);
  run(w, 3000);
  assert.equal(mt.taken(b), 0, "скелет ранил неуязвимого");
});

await test("призыв погибшего чернокнижника не переживает хозяина (временный призыв убран или не бьёт)", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 80);
  learn(p, "wl_demon", 1);
  assert.equal(cast(w, p, "wl_demon", undefined, { ax: p.x + 40, ay: p.y, tid: null }), null);
  p.targetId = m.id;
  run(w, 2000);
  withRandom(MID, () => w.hit(m, p, { flat: 1e9 }));
  assert.ok(p.dead);
  const mt = meter(w);
  run(w, 3000);
  assert.equal(mt.taken(m), 0, "демон мёртвого хозяина бьёт");
});

section("Чернокнижник: проклятия и страх");

await test("wl_agony: агония тикает; мелкий тик страх не рвёт, урон ≥ breakHp здоровья — рвёт", () => {
  const w = mkWorld(), p = mkHero(w, C), e = dummy(w, p, 150, 0, { hp: 1e5 });
  learn(p, "wl_agony", 1);
  assert.equal(cast(w, p, "wl_agony", e), null);
  p.engaged = false; p.targetId = null;
  run(w, 400);
  assert.equal(dotsOf(w, p, e).length, 1);
  assert.ok(applyFear(w, p, e, 4000));
  const mt = meter(w);
  run(w, 1100);
  assert.ok(mt.taken(e) > 0, "агония не тикала");
  assert.ok(e.fearUntil > w.time, "мелкий тик сорвал страх");
  withRandom(MID, () => w.hit(p, e, { flat: 2e4, canCrit: false }));
  assert.ok(e.fearUntil <= w.time, "крупный удар не сорвал страх");
});

await test("wl_drain_mana: мана чернокнижника +mana %; у героя-врага столько же отнято", () => {
  const w = mkWorld(), p = mkHero(w, C), e = mkHero(w, "mage", { x: 14 * 32 + 150, y: 18 * 32 });
  p.team = 1; e.team = 2; w.pvpActive = true;
  learn(p, "wl_drain_mana", 1);
  p.unit.mp = 0;
  const emp = e.unit.mp;
  assert.equal(cast(w, p, "wl_drain_mana", e), null, "без маны не кастуется (цена 0)");
  const got = Math.round(p.unit.maxMp * 0.12);
  assert.equal(p.unit.mp, got);
  assert.equal(e.unit.mp, Math.max(0, emp - got));
});

await test("wl_hex: урон чернокнижника по цели +amp %, страх; босс не боится", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150), b = dummy(w, p, 150, 60, { def: bossDef });
  const a = withRandom(MID, () => w.hit(p, m, { canCrit: false, mult: 30 }));
  learn(p, "wl_hex", 5);
  assert.equal(cast(w, p, "wl_hex", m), null);
  run(w, 400);
  const h = withRandom(MID, () => w.hit(p, m, { canCrit: false, mult: 30 }));
  assert.ok(Math.abs(h / a - 1.24) < 0.03, `порча ×${(h / a).toFixed(3)}`);
  assert.ok(m.fearUntil > w.time, "нет страха");
  ready(p); p.unit.mp = p.unit.maxMp;
  assert.equal(cast(w, p, "wl_hex", b), null);
  run(w, 400);
  assert.ok(b.fearUntil <= w.time, "босс боится");
});

await test("wl_doom: чума (DoT), ослабление и замедление врагов в круге", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
  learn(p, "wl_doom", 1);
  assert.equal(cast(w, p, "wl_doom", m), null);
  assert.ok(dotsOf(w, p, m).some((d) => d.key === "plague"));
  assert.ok(m.weakUntil > w.time && m.slowUntil > w.time);
});

await test("wl_detonate: без проклятий — отказ без списаний; с ними — взрыв, проклятия сняты", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
  learn(p, "wl_detonate", 1);
  const mp = p.unit.mp;
  assert.ok(cast(w, p, "wl_detonate", m));
  assert.equal(p.unit.mp, mp);
  assert.ok(!p.cds.get("wl_detonate"));
  agony(w, p, m);
  const mt = meter(w);
  assert.equal(cast(w, p, "wl_detonate", m), null);
  assert.ok(mt.taken(m) > 0);
  assert.equal(dotsOf(w, p, m).length, 0);
});

await test("wl_siphon: проклятие-сифон тикает dur раз", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150);
  learn(p, "wl_siphon", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "wl_siphon", m), null);
  p.engaged = false; p.targetId = null;
  run(w, 7500);
  const tick = mt.taken(m) / 6;
  assert.ok(tick > 0);
  run(w, 3000);
  assert.ok(Math.abs(mt.taken(m) / 6 - tick) < 0.01, "тиков больше dur");
});

await test("wl_meta: урон +dmg %, снимает корни, иммунитет к страху и корням на срок", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 100);
  const a = withRandom(MID, () => w.hit(p, m, { canCrit: false, mult: 30 }));
  learn(p, "wl_meta", 1);
  p.rootUntil = w.time + 5000;
  assert.equal(cast(w, p, "wl_meta"), null);
  assert.ok(p.rootUntil <= w.time, "корни не сняты");
  const b = withRandom(MID, () => w.hit(p, m, { canCrit: false, mult: 30 }));
  assert.ok(Math.abs(b / a - 1.4) < 0.03, `метаморфоза ×${(b / a).toFixed(3)}`);
  const e = mkHero(w, "warrior", { x: p.x + 40, y: p.y });
  p.team = 1; e.team = 2; w.pvpActive = true;
  assert.equal(applyFear(w, e, p, 2000), false, "страх лёг");
  assert.equal(applyRoot(w, e, p, 2000), false, "корни легли");
});

done();
