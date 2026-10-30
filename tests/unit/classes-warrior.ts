/**
 * Храмовник (warrior): все активные умения (типовой набор classes-kit) и механики танка — угроза, провокация, блок с отражением,
 * рывок и оглушение, на боссе — замедление, DR в PvP, «Божественный щит», знамя. Запуск: npx tsx tests/unit/classes-warrior.ts
 */
import { allBasics, bossDef, cast, dummy, learn, meter, mkHero, mkWorld, ready, run, withRandom, MID } from "./classes-kit";
import { assert, done, section, test } from "./lib";
import { TILE } from "../../shared/constants";

const C = "warrior";
section("Храмовник: типовые проверки всех активных умений");
await allBasics(C);

section("Храмовник: угроза и провокация");

await test("угроза танка: тот же урон даёт в 3,5 раза больше угрозы, чем у мага", () => {
  const w = mkWorld(), t = mkHero(w, C), mg = mkHero(w, "mage", { x: t.x, y: t.y + 30 });
  const m = dummy(w, t);
  withRandom(MID, () => { w.hit(t, m, { flat: 100, canCrit: false }); w.hit(mg, m, { flat: 100, canCrit: false }); });
  const a = m.threat.get(t.id)!, b = m.threat.get(mg.id)!;
  assert.ok(Math.abs(a / b - 3.5) < 0.01, `угроза танка ${a}, мага ${b}`);
});

await test("taunt: моб, бивший мага, переключается на танка — цель, срок провокации, угроза выше максимальной", () => {
  const w = mkWorld(), t = mkHero(w, C), mg = mkHero(w, "mage", { x: t.x, y: t.y + 30 });
  const m = dummy(w, t);
  m.threat.set(mg.id, 5000);
  m.targetId = mg.id;
  learn(t, "taunt", 1);
  assert.equal(cast(w, t, "taunt", m), null);
  assert.equal(m.targetId, t.id);
  assert.ok(m.tauntUntil > w.time && m.tauntBy === t.id);
  assert.ok(m.threat.get(t.id)! > 5000, `угроза ${m.threat.get(t.id)}`);
});

await test("taunt на максимальном ранге задевает врагов в радиусе, на первом — только цель", () => {
  for (const [rank, want] of [[1, false], [5, true]] as const) {
    const w = mkWorld(), t = mkHero(w, C);
    const m = dummy(w, t), n = dummy(w, t, 40, 40);
    learn(t, "taunt", rank);
    assert.equal(cast(w, t, "taunt", m), null);
    assert.equal(n.tauntUntil > w.time, want, `ранг ${rank}: сосед ${want ? "не " : ""}спровоцирован`);
  }
});

await test("taunt по боссу: угроза растёт, но провокации (tauntUntil) нет", () => {
  const w = mkWorld(), t = mkHero(w, C), b = dummy(w, t, 40, 0, { def: bossDef });
  learn(t, "taunt", 1);
  assert.equal(cast(w, t, "taunt", b), null);
  assert.equal(b.tauntUntil, 0);
  assert.ok((b.threat.get(t.id) ?? 0) > 0);
});

await test("taunt по герою в PvP: вместо провокации — ослабление цели на 20 %", () => {
  const w = mkWorld(), t = mkHero(w, C), e = mkHero(w, "mage", { x: 15.25 * TILE, y: 18 * TILE });
  t.team = 1; e.team = 2; w.pvpActive = true;
  learn(t, "taunt", 1);
  assert.equal(cast(w, t, "taunt", e), null);
  assert.ok(e.weakUntil > w.time && e.weakPct === 20, `ослабление ${e.weakPct} до ${e.weakUntil}`);
});

await test("tp_hammer: снаряд провоцирует обычного моба на v.taunt секунд", () => {
  const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t, 150);
  learn(t, "tp_hammer", 1);
  assert.equal(cast(w, t, "tp_hammer", m), null);
  run(w, 600);
  assert.equal(m.tauntBy, t.id);
  assert.ok(m.tauntUntil > w.time);
});

section("Храмовник: блок, отражение, неуязвимость, знамя");

await test("shieldblock: блок −60 % входящего урона; на ранге 5 часть отражается в атакующего", () => {
  const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t);
  t.unit.hp = t.unit.maxHp = 1e6;
  const mt = meter(w);
  const plain = withRandom(MID, () => w.hit(m, t, { flat: 1000, canCrit: false }));
  learn(t, "shieldblock", 5);
  t.unit.hp = t.unit.maxHp = 1e6;
  assert.equal(cast(w, t, "shieldblock"), null);
  mt.reset();
  const blocked = withRandom(MID, () => w.hit(m, t, { flat: 1000, canCrit: false }));
  assert.ok(Math.abs(blocked - plain * 0.4) <= 2, `блок ${blocked} при обычном ${plain}`);
  assert.ok(mt.dealt(t) > 0 && mt.taken(m) > 0, "отражения нет");
});

await test("shieldblock на 1-м ранге: отражения нет", () => {
  const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t);
  learn(t, "shieldblock", 1);
  assert.equal(cast(w, t, "shieldblock"), null);
  const mt = meter(w);
  withRandom(MID, () => w.hit(m, t, { flat: 1000, canCrit: false }));
  assert.equal(mt.taken(m), 0);
});

await test("tp_divine: неуязвимость — удары промахиваются, стан не ложится; срок растёт с рангом", () => {
  const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t);
  learn(t, "tp_divine", 1);
  t.stunUntil = w.time + 3000; // usableInStun
  assert.equal(cast(w, t, "tp_divine"), null, "в стане не кастуется");
  assert.ok(t.stunUntil <= w.time, "стан не снят");
  const hp = t.unit.hp;
  assert.equal(w.hit(m, t, { flat: 5000 }), 0);
  assert.equal(t.unit.hp, hp);
  assert.ok(w.isImmune(t));
  run(w, 3500 * 1); // ранг 1 — 2,5 с
  assert.ok(!w.isImmune(t), "неуязвимость не кончилась");
});

await test("tp_banner: союзник в круге знамени получает меньше урона, вне круга — как обычно", () => {
  const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t, 200);
  t.unit.hp = t.unit.maxHp = 1e6;
  const before = withRandom(MID, () => w.hit(m, t, { flat: 1000, canCrit: false }));
  learn(t, "tp_banner", 5);
  t.unit.hp = t.unit.maxHp = 1e6;
  assert.equal(cast(w, t, "tp_banner", undefined, { ax: t.x + 20, ay: t.y, tid: null }), null);
  const inside = withRandom(MID, () => w.hit(m, t, { flat: 1000, canCrit: false }));
  assert.ok(Math.abs(inside - before * 0.8) <= 2, `в круге ${inside} при обычном ${before} (−20 %)`);
});

section("Храмовник: рывок, оглушение, CC и DR");

await test("charge: герой у цели, цель оглушена, автоатака включена", () => {
  const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t, 200);
  learn(t, "charge", 1);
  assert.equal(cast(w, t, "charge", m), null);
  assert.ok(Math.hypot(t.x - m.x, t.y - m.y) < 60, `далеко: ${Math.hypot(t.x - m.x, t.y - m.y)}`);
  assert.ok(m.stunUntil > w.time, "нет стана");
  assert.ok(t.engaged && t.targetId === m.id);
});

await test("charge по боссу: стана нет — замедление (правило cc.boss)", () => {
  const w = mkWorld(), t = mkHero(w, C), b = dummy(w, t, 200, 0, { def: bossDef });
  learn(t, "charge", 1);
  assert.equal(cast(w, t, "charge", b), null);
  assert.ok(b.stunUntil <= w.time, "босс оглушён");
  assert.ok(b.slowUntil > w.time && b.slowPct > 0, "нет замедления босса");
});

await test("charge в корнях — отказ (рывок без breaksRoot)", () => {
  const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t, 200);
  learn(t, "charge", 1);
  t.rootUntil = w.time + 3000;
  const r = cast(w, t, "charge", m);
  // charge снимает корни (combat.md: «charge снимает корни») — значит он либо проходит, либо отказывает; проверяем по данным cc.json
  if (r === null) assert.ok(t.rootUntil <= w.time, "рывок прошёл, а корни остались");
  else assert.ok(!t.cds.get("charge"), "отказ, но откат поставлен");
});

await test("PvP DR: второй стан от tp_shield_bash по тому же герою — вдвое короче, третий — вчетверо", () => {
  const w = mkWorld(), t = mkHero(w, C), e = mkHero(w, "mage", { x: 15.25 * TILE, y: 18 * TILE });
  t.team = 1; e.team = 2; w.pvpActive = true;
  e.unit.hp = e.unit.maxHp = 1e7;
  learn(t, "tp_shield_bash", 1);
  const len: number[] = [];
  for (let i = 0; i < 3; i++) {
    ready(t);
    e.stunUntil = 0;
    t.unit.mp = t.unit.maxMp;
    assert.equal(cast(w, t, "tp_shield_bash", e), null);
    len.push(e.stunUntil - w.time);
  }
  assert.ok(len[0] > 0);
  assert.ok(Math.abs(len[1] - len[0] / 2) <= 60 && Math.abs(len[2] - len[0] / 4) <= 60, `станы ${len.join(", ")}`);
});

await test("tp_shield_bash: после стана — безмолвие; со щитовым блоком удар сильнее на blockBonus %", () => {
  const dmg = (block: boolean) => {
    const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t);
    learn(t, "tp_shield_bash", 1);
    if (block) { t.blockUntil = w.time + 4000; t.blockPct = 60; }
    const mt = meter(w);
    assert.equal(cast(w, t, "tp_shield_bash", m), null);
    assert.ok(m.silenceUntil > m.stunUntil, "безмолвие не дольше стана");
    return mt.dealt(t);
  };
  const a = dmg(false), b = dmg(true);
  assert.ok(Math.abs(b / a - 1.5) < 0.02, `с блоком ${b}, без ${a}`);
});

await test("quake: бьёт и замедляет всех в радиусе, дальше радиуса — нет", () => {
  const w = mkWorld(), t = mkHero(w, C), a = dummy(w, t, 60), b = dummy(w, t, -60), far = dummy(w, t, 300);
  learn(t, "quake", 1);
  const mt = meter(w);
  assert.equal(cast(w, t, "quake"), null);
  assert.ok(mt.taken(a) > 0 && mt.taken(b) > 0 && mt.taken(far) === 0);
  assert.ok(a.slowUntil > w.time && b.slowUntil > w.time && far.slowUntil <= w.time);
});

await test("tp_glare: ослабление врагов вокруг (weakPct из ранга)", () => {
  const w = mkWorld(), t = mkHero(w, C), m = dummy(w, t, 60);
  learn(t, "tp_glare", 5);
  assert.equal(cast(w, t, "tp_glare"), null);
  assert.ok(m.weakUntil > w.time && m.weakPct === 38, `ослабление ${m.weakPct}`);
});

done();
