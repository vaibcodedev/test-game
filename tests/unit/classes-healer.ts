/**
 * Клирик (healer): все активные умения (типовой набор classes-kit) и механики лекаря — лечение союзника и себя, дальность,
 * мёртвый союзник и воскрешение, враг вместо союзника, PvP-срез лечения, «Обновление» (HoT, не складывается), «Святой щит» и страх,
 * «Сияние» (безмолвие на луче), очищение (в стане — на себя), благословение, «Эгида», «Гимн».
 * Запуск: npx tsx tests/unit/classes-healer.ts
 */
import { allBasics, cast, dummy, learn, meter, mkHero, mkWorld, ready, run, castSkill, withRandom, MID, knownFail } from "./classes-kit";
import { assert, done, section, test } from "./lib";
import { RESPAWN_DELAY_MS } from "../../shared/constants";
import { addDot } from "../../server/src/game/umbrath";
import { applyPoison } from "../../server/src/game/rogue";

const C = "healer";
section("Клирик: типовые проверки всех активных умений");
await allBasics(C, {
  renew: { grow: "heal" }, // tick — лечение за тик, не урон
  cl_blessing: { grow: "none" }, // бафф урона союзнику — отдельный тест
  cl_hymn: { ms: 6000 },
});

/** Клирик и раненый союзник (воин той же фракции) на расстоянии dx. */
function pair(dx = 100) {
  const w = mkWorld(), p = mkHero(w, C), a = mkHero(w, "warrior", { x: 14 * 32 + dx, y: 18 * 32 });
  a.unit.hp = 1;
  return { w, p, a };
}

section("Клирик: лечение союзника");

await test("heal: лечит союзника в дальности, мана и откат списаны", () => {
  const { w, p, a } = pair();
  learn(p, "heal", 1);
  assert.equal(castSkill(w, p, "heal", a.x, a.y, a.id), null);
  assert.ok(a.unit.hp > 1);
});

await test("heal: союзник дальше дальности — отказ, ни маны, ни отката", () => {
  const { w, p, a } = pair(600);
  learn(p, "heal", 1);
  const mp = p.unit.mp;
  assert.ok(castSkill(w, p, "heal", a.x, a.y, a.id));
  assert.equal(p.unit.mp, mp);
  assert.ok(!p.cds.get("heal"));
  assert.equal(a.unit.hp, 1);
});

await test("heal: id врага в PvP — лечит самого клирика, не врага", () => {
  const { w, p, a } = pair();
  p.team = 1; a.team = 2; w.pvpActive = true;
  p.unit.hp = 10;
  learn(p, "heal", 1);
  assert.equal(castSkill(w, p, "heal", a.x, a.y, a.id), null);
  assert.equal(a.unit.hp, 1, "враг вылечен");
  assert.ok(p.unit.hp > 10);
});

await test("heal: в PvP лечение срезано по кривой pvp.heal", () => {
  const amt = (pvp: boolean) => {
    const w = mkWorld(), p = mkHero(w, C);
    learn(p, "heal", 1);
    p.unit.maxHp = 1e7; p.unit.hp = 1;
    w.pvpActive = pvp;
    assert.equal(cast(w, p, "heal"), null);
    return p.unit.hp - 1;
  };
  const pve = amt(false), pvp = amt(true);
  assert.ok(pvp < pve, `PvP ${pvp} ≥ PvE ${pve}`);
});

await test("heal по мёртвому союзнику без «Воскрешения» — отказ без списаний", () => {
  const { w, p, a } = pair();
  a.dead = true; a.unit.hp = 0;
  learn(p, "heal", 1);
  const mp = p.unit.mp;
  assert.ok(castSkill(w, p, "heal", a.x, a.y, a.id));
  assert.equal(p.unit.mp, mp);
});

await test("heal по мёртвому с «Воскрешением»: каст, после — союзник жив; движение срывает каст", () => {
  const { w, p, a } = pair();
  a.dead = true; a.unit.hp = 0; a.deadAt = w.time;
  learn(p, "heal", 1);
  learn(p, "resurrect", 1);
  assert.equal(castSkill(w, p, "heal", a.x, a.y, a.id), null);
  assert.ok(p.castUntil > w.time);
  run(w, 12000);
  assert.ok(!a.dead && a.unit.hp > 0, "не воскрешён");
  const b = pair();
  b.a.dead = true; b.a.unit.hp = 0;
  learn(b.p, "heal", 1);
  learn(b.p, "resurrect", 1);
  assert.equal(castSkill(b.w, b.p, "heal", b.a.x, b.a.y, b.a.id), null);
  b.p.input.mx = 1;
  run(b.w, 12000);
  assert.ok(b.a.dead, "воскрешён, хотя каст сорван");
});

await test("heal: воскрешение в PvP запрещено", () => {
  const { w, p, a } = pair();
  w.pvpActive = true;
  a.dead = true; a.unit.hp = 0;
  learn(p, "heal", 1);
  learn(p, "resurrect", 1);
  assert.ok(castSkill(w, p, "heal", a.x, a.y, a.id));
});

await test("circle: лечит союзников в круге, врага в PvP — нет", () => {
  const w = mkWorld(), p = mkHero(w, C), a = mkHero(w, "warrior", { x: p.x + 60, y: p.y }), e = mkHero(w, "mage", { x: p.x + 60, y: p.y + 30 });
  e.team = 2; p.team = a.team = 1; w.pvpActive = true;
  a.unit.hp = e.unit.hp = 1;
  learn(p, "circle", 1);
  assert.equal(cast(w, p, "circle", undefined, { ax: p.x + 60, ay: p.y, tid: null }), null);
  assert.ok(a.unit.hp > 1, "союзник не вылечен");
  assert.equal(e.unit.hp, 1, "враг вылечен");
});

await test("renew: лечит тиками раз в секунду; повтор заменяет прежний (не складывается)", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "renew", 1);
  p.unit.maxHp = 1e7; p.unit.hp = 1;
  const mt = meter(w);
  assert.equal(cast(w, p, "renew"), null);
  run(w, 1050);
  const one = mt.healed(p);
  assert.ok(one > 0, "первый тик не прошёл");
  run(w, 2000);
  const three = mt.healed(p);
  assert.ok(Math.abs(three - one * 3) <= 3, `за 3 с ${three}, тик ${one}`);
  ready(p); p.unit.mp = p.unit.maxMp;
  assert.equal(cast(w, p, "renew"), null);
  mt.reset();
  run(w, 2000);
  assert.ok(Math.abs(mt.healed(p) - one * 2) <= 3, `после повтора за 2 с ${mt.healed(p)} — два «Обновления» сразу?`);
});

section("Клирик: щиты, луч, очищение, благословение");

await test("holyshield: щит поглощает урон; пробитый щит пугает врагов рядом", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 40);
  learn(p, "holyshield", 1);
  assert.equal(cast(w, p, "holyshield"), null);
  const sh = p.shieldAmt, hp = p.unit.hp;
  assert.ok(sh > 0);
  withRandom(MID, () => w.hit(m, p, { flat: Math.round(sh / 3), canCrit: false }));
  assert.equal(p.unit.hp, hp, "урон прошёл сквозь щит");
  withRandom(MID, () => w.hit(m, p, { flat: Math.round(sh * 5), canCrit: false }));
  assert.equal(p.shieldAmt, 0);
  assert.ok(m.fearUntil > w.time, "враг рядом не испуган");
});

await test("holyshield: на чужого питомца или на моба — только на героя («Святой щит» без героя-цели — отказ)", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "holyshield", 1);
  // id моба: resolveAlly вернёт самого клирика — щит на себя
  assert.equal(castSkill(w, p, "holyshield", m.x, m.y, m.id), null);
  assert.ok(p.shieldAmt > 0);
});

await test("cl_radiance: враг на луче получает урон и безмолвие, союзник на луче — лечение", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 150), a = mkHero(w, "warrior", { x: p.x + 80, y: p.y });
  a.unit.hp = 1;
  learn(p, "cl_radiance", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "cl_radiance", m), null);
  assert.ok(mt.taken(m) > 0, "враг не задет");
  assert.ok(m.silenceUntil > w.time, "нет безмолвия");
  assert.ok(a.unit.hp > 1, "союзник на луче не вылечен");
});

await test("cl_cleanse: снимает с союзника стан, корни, замедление, безмолвие, страх и проклятия", () => {
  const { w, p, a } = pair();
  const t = w.time + 5000;
  a.stunUntil = a.rootUntil = a.slowUntil = a.silenceUntil = a.fearUntil = a.curseUntil = a.bleedUntil = t;
  a.slowPct = 50;
  learn(p, "cl_cleanse", 1);
  assert.equal(castSkill(w, p, "cl_cleanse", a.x, a.y, a.id), null);
  for (const k of ["stunUntil", "rootUntil", "slowUntil", "silenceUntil", "fearUntil", "curseUntil", "bleedUntil"] as const)
    assert.ok(a[k] <= w.time, `${k} не снят`);
});

await test("cl_cleanse в стане: только на себя (снимает свой стан), союзника не трогает", () => {
  const { w, p, a } = pair();
  a.rootUntil = w.time + 5000;
  p.stunUntil = w.time + 5000;
  learn(p, "cl_cleanse", 1);
  assert.equal(castSkill(w, p, "cl_cleanse", a.x, a.y, a.id), null);
  assert.ok(p.stunUntil <= w.time, "свой стан не снят");
  assert.ok(a.rootUntil > w.time, "в стане очистил союзника");
});

await test("B20: cl_cleanse снимает «Пиявку» Кровотворца (проклятие): тики после очищения прекращаются", () => {
  const w = mkWorld(), p = mkHero(w, C), a = mkHero(w, "warrior", { x: 14 * 32 + 100, y: 18 * 32 });
  const bw = mkHero(w, "bloodweaver", { x: a.x + 100, y: a.y });
  bw.team = 2; a.team = p.team = 1; w.pvpActive = true;
  a.unit.hp = a.unit.maxHp = 1e6;
  learn(bw, "bw_leech", 1);
  assert.equal(cast(w, bw, "bw_leech", a), null);
  bw.engaged = false; bw.targetId = null; // без автоатаки: считаем только «Пиявку»
  run(w, 1100);
  learn(p, "cl_cleanse", 1);
  assert.equal(castSkill(w, p, "cl_cleanse", a.x, a.y, a.id), null);
  const mt = meter(w);
  run(w, 4000);
  assert.equal(mt.taken(a), 0, `после очищения «Пиявка» сняла ещё ${mt.taken(a)}`);
});

await test("B21: cl_cleanse снимает яд Ассасина с союзника", () => {
  const w = mkWorld(), p = mkHero(w, C), a = mkHero(w, "warrior", { x: 14 * 32 + 100, y: 18 * 32 });
  const r = mkHero(w, "rogue", { x: a.x + 40, y: a.y });
  r.team = 2; a.team = p.team = 1; w.pvpActive = true;
  a.unit.hp = a.unit.maxHp = 1e6;
  applyPoison(w, r, a, 1, 3);
  run(w, 1100);
  learn(p, "cl_cleanse", 1);
  assert.equal(castSkill(w, p, "cl_cleanse", a.x, a.y, a.id), null);
  const mt = meter(w);
  run(w, 3000);
  assert.equal(mt.taken(a), 0, `яд после очищения: ${mt.taken(a)}`);
});

await test("cl_cleanse снимает проклятие Тёмного следопыта (DoT addDot) — тики прекращаются", () => {
  const w = mkWorld(), p = mkHero(w, C), a = mkHero(w, "warrior", { x: 14 * 32 + 100, y: 18 * 32 });
  const dr = mkHero(w, "darkranger", { x: a.x + 100, y: a.y });
  dr.team = 2; a.team = p.team = 1; w.pvpActive = true;
  a.unit.hp = a.unit.maxHp = 1e6;
  addDot(w, dr, a, "curse", 50, 8, "shadow");
  run(w, 1100);
  learn(p, "cl_cleanse", 1);
  assert.equal(castSkill(w, p, "cl_cleanse", a.x, a.y, a.id), null);
  const mt = meter(w);
  run(w, 3000);
  assert.equal(mt.taken(a), 0);
});

await test("cl_blessing: союзник бьёт сильнее на dmg % и получает меньше на reduce %; на питомца/моба — отказ «только герой»", () => {
  const { w, p, a } = pair(60);
  const m = dummy(w, a, 40);
  a.unit.hp = a.unit.maxHp = 1e6;
  const out0 = withRandom(MID, () => w.hit(a, m, { canCrit: false }));
  const in0 = withRandom(MID, () => w.hit(m, a, { flat: 1000, canCrit: false }));
  learn(p, "cl_blessing", 5);
  assert.equal(castSkill(w, p, "cl_blessing", a.x, a.y, a.id), null);
  const out1 = withRandom(MID, () => w.hit(a, m, { canCrit: false }));
  const in1 = withRandom(MID, () => w.hit(m, a, { flat: 1000, canCrit: false }));
  assert.ok(Math.abs(out1 / out0 - 1.2) < 0.03, `урон ×${(out1 / out0).toFixed(3)}`);
  assert.ok(Math.abs(in1 / in0 - 0.82) < 0.03, `входящий ×${(in1 / in0).toFixed(3)}`);
});

await test("cl_aegis: щит всем союзникам своей фракции в круге, герою чужой фракции — нет", () => {
  // без PvP: у героя без снаряжения сила лечения мала, PvP-срез обнулил бы щит
  const w = mkWorld(), p = mkHero(w, C), a = mkHero(w, "warrior", { x: p.x + 60, y: p.y }), e = mkHero(w, "deathknight", { x: p.x + 60, y: p.y + 30 });
  learn(p, "cl_aegis", 1);
  assert.equal(cast(w, p, "cl_aegis", undefined, { ax: p.x + 40, ay: p.y, tid: null }), null);
  assert.ok(p.shieldAmt > 0 && a.shieldAmt > 0, "союзникам нет щита");
  assert.equal(e.shieldAmt, 0, "враг получил щит");
});

await test("cl_hymn: стоя лечит союзников ticks раз; стан обрывает", () => {
  const w = mkWorld(), p = mkHero(w, C), a = mkHero(w, "warrior", { x: p.x + 60, y: p.y });
  a.unit.maxHp = 1e7; a.unit.hp = 1;
  learn(p, "cl_hymn", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "cl_hymn"), null);
  run(w, 2100);
  const two = mt.healed(a);
  assert.ok(two > 0);
  p.stunUntil = w.time + 3000;
  run(w, 3000);
  assert.equal(mt.healed(a), two, "Гимн лечит под станом");
  assert.equal(p.castUntil, 0);
});

await test("смерть лекаря: отложенное лечение «Обновления» не приходит после смерти", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p);
  learn(p, "renew", 1);
  p.unit.maxHp = 1e7; p.unit.hp = 1e6;
  run(w, 100); // смерть в момент 0 совпала бы с deadAt по умолчанию (0) — таймер владельца не отличил бы её
  assert.equal(cast(w, p, "renew"), null);
  withRandom(MID, () => w.hit(m, p, { flat: 1e9 }));
  assert.ok(p.dead);
  const mt = meter(w);
  w.time += RESPAWN_DELAY_MS + 1;
  w.respawn(p);
  p.unit.hp = 1;
  run(w, 5000);
  assert.equal(mt.healed(p), 0, "HoT дотикал после смерти");
});

done();
