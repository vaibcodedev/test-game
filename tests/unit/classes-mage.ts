/**
 * Боевой маг (mage): все активные умения (типовой набор classes-kit) и механики — огненный шар (брызги, смерть цели в полёте),
 * кольцо льда (корни → замедление, босс, DR корней в PvP), мерцание (в стане и корнях), метеор (задержка, смерть мага),
 * цепная молния (прыжки, затухание, безмолвие первой цели), барьер, стена огня, шторм, искажение времени (откаты).
 * Запуск: npx tsx tests/unit/classes-mage.ts
 */
import { allBasics, bossDef, cast, dummy, learn, meter, mkHero, mkWorld, ready, run } from "./classes-kit";
import { assert, done, section, test } from "./lib";
import { TILE } from "../../shared/constants";

const C = "mage";
section("Боевой маг: типовые проверки всех активных умений");
await allBasics(C, { mg_timewarp: { grow: "none" } }); // урона нет: замедление и откаты — отдельный тест

section("Боевой маг: снаряды и области");

await test("fireball: основная цель — полный урон, сосед в брызгах — половина", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200), n = dummy(w, p, 200, 30);
  learn(p, "fireball", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "fireball", m), null);
  run(w, 800);
  assert.ok(mt.taken(m) > 0 && mt.taken(n) > 0, "брызги не задели соседа");
  assert.ok(Math.abs(mt.taken(n) / mt.taken(m) - 0.5) < 0.05, `сосед ${mt.taken(n)}, цель ${mt.taken(m)}`);
});

await test("fireball: цель погибла в полёте — шар взрывается в точке, труп не бьёт", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 250, 0, { hp: 1e6 });
  learn(p, "fireball", 1);
  assert.equal(cast(w, p, "fireball", m), null);
  w.hit(p, m, { flat: 1e9 });
  const mt = meter(w);
  run(w, 1000);
  assert.equal(mt.taken(m), 0);
});

await test("meteor: урон только после задержки; погибший маг — метеор не падает", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200);
  run(w, 100);
  learn(p, "meteor", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "meteor", m), null);
  run(w, 500);
  assert.equal(mt.taken(m), 0, "урон до задержки");
  run(w, 700);
  assert.ok(mt.taken(m) > 0, "метеор не упал");
  const w2 = mkWorld(), q = mkHero(w2, C), m2 = dummy(w2, q, 200);
  run(w2, 100);
  learn(q, "meteor", 1);
  assert.equal(cast(w2, q, "meteor", m2), null);
  w2.hit(m2, q, { flat: 1e9 });
  const mt2 = meter(w2);
  run(w2, 1500);
  assert.equal(mt2.taken(m2), 0, "мёртвый маг попал метеором");
});

await test("mg_bolt: прыгает на jumps соседей с затуханием falloff %; безмолвие — только первой цели", () => {
  const w = mkWorld(), p = mkHero(w, C), a = dummy(w, p, 150), b = dummy(w, p, 230), c = dummy(w, p, 310), d = dummy(w, p, 390);
  learn(p, "mg_bolt", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "mg_bolt", a), null);
  const [ta, tb, tc, td] = [a, b, c, d].map((m) => mt.taken(m));
  assert.ok(ta > 0 && tb > 0 && tc > 0, `задеты ${ta}/${tb}/${tc}`);
  assert.equal(td, 0, "прыжков больше jumps");
  assert.ok(Math.abs(tb / ta - 0.8) < 0.05 && Math.abs(tc / ta - 0.64) < 0.05, `затухание ${tb / ta}, ${tc / ta}`);
  assert.ok(a.silenceUntil > w.time && b.silenceUntil <= w.time);
});

await test("mg_firewall: тики бьют врагов на линии стены, в стороне — нет", () => {
  const w = mkWorld(), p = mkHero(w, C), on = dummy(w, p, 150), off = dummy(w, p, 150, 150);
  learn(p, "mg_firewall", 1);
  const mt = meter(w);
  // угол прицела 0 (вправо): стена поперёк — вертикальная через точку (x+150)
  assert.equal(cast(w, p, "mg_firewall", undefined, { ax: on.x, ay: on.y, tid: null }), null);
  run(w, 3100);
  assert.ok(mt.taken(on) > 0, "на стене не горит");
  assert.equal(mt.taken(off), 0);
});

await test("mg_storm: удары молний только по врагам в круге", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 200), far = dummy(w, p, -200);
  learn(p, "mg_storm", 1);
  const mt = meter(w);
  assert.equal(cast(w, p, "mg_storm", m), null);
  run(w, 5500);
  assert.ok(mt.taken(m) > 0);
  assert.equal(mt.taken(far), 0);
});

section("Боевой маг: контроль, щит, откаты");

await test("frostnova: корни root с, потом замедление; дальше радиуса — ничего", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 80), far = dummy(w, p, 400);
  learn(p, "frostnova", 1);
  assert.equal(cast(w, p, "frostnova"), null);
  assert.ok(Math.abs(m.rootUntil - w.time - 2000) <= 1, `корни ${m.rootUntil - w.time}`);
  assert.ok(m.slowUntil >= m.rootUntil, "замедление не после корней");
  assert.ok(far.rootUntil <= w.time);
});

await test("frostnova по боссу: корней нет — замедление convSlow (корни → замедление, cc.boss)", () => {
  const w = mkWorld(), p = mkHero(w, C), b = dummy(w, p, 80, 0, { def: bossDef });
  learn(p, "frostnova", 1);
  assert.equal(cast(w, p, "frostnova"), null);
  assert.ok(b.rootUntil <= w.time);
  assert.ok(b.slowUntil > w.time && b.slowPct > 0 && b.slowPct <= 50, `замедление босса ${b.slowPct}`);
});

await test("frostnova в PvP: DR корней — 2-е наложение вдвое короче, 4-е — иммунитет", () => {
  const w = mkWorld(), p = mkHero(w, C), e = mkHero(w, "warrior", { x: 15.5 * TILE, y: 18 * TILE });
  p.team = 1; e.team = 2; w.pvpActive = true;
  e.unit.hp = e.unit.maxHp = 1e7;
  learn(p, "frostnova", 1);
  const len: number[] = [];
  for (let i = 0; i < 4; i++) {
    ready(p); p.unit.mp = p.unit.maxMp; e.rootUntil = 0;
    assert.equal(cast(w, p, "frostnova"), null);
    len.push(Math.max(0, e.rootUntil - w.time));
  }
  assert.ok(len[0] > 0 && Math.abs(len[1] - len[0] / 2) <= 60 && len[3] === 0, `корни ${len.join(", ")}`);
});

await test("blink: в стане и в корнях — работает (usableInStun, breaksRoot), снимает корни", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "blink", 1);
  p.stunUntil = w.time + 3000;
  p.rootUntil = w.time + 3000;
  const x0 = p.x;
  assert.equal(cast(w, p, "blink"), null);
  assert.ok(p.x > x0 + 50, "не переместился");
  assert.ok(p.rootUntil <= w.time, "корни остались");
});

await test("mg_barrier: щит absorb % здоровья; повтор не сверх потолка 60 %", () => {
  const w = mkWorld(), p = mkHero(w, C);
  learn(p, "mg_barrier", 5);
  assert.equal(cast(w, p, "mg_barrier"), null);
  assert.equal(p.shieldAmt, Math.round(p.unit.maxHp * 0.36));
  for (let i = 0; i < 3; i++) { ready(p); p.unit.mp = p.unit.maxMp; cast(w, p, "mg_barrier"); }
  assert.ok(p.shieldAmt <= p.unit.maxHp * 0.6 + 1, `щит ${p.shieldAmt} > 60 %`);
});

await test("mg_timewarp: замедляет врагов вокруг и сокращает откаты других умений, не свой", () => {
  const w = mkWorld(), p = mkHero(w, C), m = dummy(w, p, 100);
  learn(p, "mg_timewarp", 1);
  p.cds.set("meteor", w.time + 10000);
  assert.equal(cast(w, p, "mg_timewarp"), null);
  const own = p.cds.get("mg_timewarp")!;
  assert.ok(m.slowUntil > w.time);
  run(w, 2000);
  assert.ok(p.cds.get("meteor")! - w.time < 8000 - 500, `откат метеора ${p.cds.get("meteor")! - w.time}`);
  assert.equal(p.cds.get("mg_timewarp"), own, "свой откат сокращён");
});

done();
