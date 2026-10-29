/** Контроль (задача 148, партия A): applyCc, DR по категориям и сброс, потолки, цепочка, боссы, безмолвие, страх. npx tsx tests/cc.ts (без сервера). */
import { assert, check, passedCount } from "./harness";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { Mob } from "../server/src/game/Mob";
import { WorldState } from "../server/src/rooms/schema";
import { applyCc, applyFear, applyRoot, applySilence, applySlow, applyStun, ccMs } from "../server/src/game/effects";
import { castSkill } from "../server/src/game/skills";
import { CC, slowMul } from "../shared/cc";
import { BAL } from "../shared/balance";
import { MOBS, MOB_AI } from "../shared/mobs";
import { SKILLS } from "../shared/skills";
import { T } from "../shared/texts";
import type { ClassId } from "../shared/classes";

const near = (a: number, b: number, eps = 1) => Math.abs(a - b) <= eps;
function mkWorld() { return new World(new WorldState(), () => {}, { mobs: false }); }
function mkPlayer(w: World, cls: ClassId, name: string, x = 4000, y = 4000) {
  const save = newSave(cls, { x, y });
  save.level = 60;
  const p = new Player("t_" + name + Math.random(), name, save, () => {});
  w.addPlayer(p);
  p.unit.x = x; p.unit.y = y;
  return p;
}
function mkMob(w: World, boss: boolean, x = 4040, y = 4000) {
  const def = Object.values(MOBS).find((d) => !!d.boss === boss && !MOB_AI[d.id]?.weak?.cc)!;
  const m = new Mob(w.uid("m"), def, 60, { x, y });
  w.addMob(m);
  m.unit.x = x; m.unit.y = y;
  return m;
}
const left = (w: World, until: number) => Math.max(0, until - w.time);

async function main() {
  await check("DR по категориям: 1 → ½ → ¼ → иммунитет, у корней свой счёт; сброс через drMs после последнего", () => {
    const w = mkWorld(), a = mkPlayer(w, "warrior", "А"), b = mkPlayer(w, "mage", "Б");
    const base = ccMs(w, b, 2000, a);
    assert(near(base, 2000 * BAL.pvp.ccMult * (1 - b.derived.ccReduce)), "база PvP: ccMult и ccReduce");
    const got: number[] = [];
    for (let i = 0; i < 4; i++) {
      const ok = applyStun(w, a, b, 2000);
      got.push(ok ? left(w, b.stunUntil) : 0);
      w.time += 2500;
    }
    CC.dr.forEach((k, i) => assert(near(got[i], base * k), `стан ${i + 1}: ${got[i]} ≠ ${base * k}`));
    assert(applyRoot(w, a, b, 2000) && near(left(w, b.rootUntil), base), "корни — своя категория, первые полностью");
    // сброс: drMs после ПОСЛЕДНЕГО наложения стана (иммунное не продлевает)
    const lastStun = w.time - 2500 * 2; // 3-е (последнее легшее) было два шага назад
    w.time = lastStun + CC.drMs - 10;
    assert(!applyStun(w, a, b, 2000), "до сброса — ещё иммунитет");
    w.time = lastStun + CC.drMs + 10;
    assert(applyStun(w, a, b, 2000) && near(left(w, b.stunUntil), base), "после drMs — снова полностью");
  });

  await check("потолки: стан 4 с, замедление 70 %, обычный моб по герою — mobMaxMs", () => {
    const w = mkWorld(), a = mkPlayer(w, "warrior", "А"), b = mkPlayer(w, "mage", "Б"), m = mkMob(w, false);
    assert(applyStun(w, a, m, 10_000) && near(left(w, m.stunUntil), CC.maxMs.stun), "стан по мобу ≤ 4 с");
    assert(applyFear(w, a, b, 20_000) && near(left(w, b.fearUntil), CC.maxMs.fear), "страх по герою ≤ 4 с");
    assert(applySlow(w, a, m, 95, 3000) && m.slowPct === CC.maxSlowPct, "замедление ≤ 70 %: " + m.slowPct);
    assert(near(w.mobSpeed(m), m.def.speed * m.speedMul * slowMul(95), 0.01), "скорость моба — та же формула slowMul");
    const c = mkPlayer(w, "ranger", "В");
    assert(applyStun(w, m, c, 5000) && near(left(w, c.stunUntil), CC.mobMaxMs * (1 - c.derived.ccReduce)), "моб по герою: потолок mobMaxMs");
  });

  await check("цепочка разных видов: не больше chain.capMs за окно, потом иммунитет", () => {
    const w = mkWorld(), a = mkPlayer(w, "warrior", "А"), b = mkPlayer(w, "mage", "Б");
    const t0 = w.time;
    assert(applyStun(w, a, b, 8000) && near(left(w, b.stunUntil), 4000), "стан 4 с");
    w.time = t0 + 4000;
    assert(applyFear(w, a, b, 8000), "страх лёг");
    assert(near(left(w, b.fearUntil), CC.chain.capMs - 4000), "страх срезан до остатка цепочки: " + left(w, b.fearUntil));
    w.time = t0 + 6000 + CC.chain.immuneMs / 2;
    assert(!applySilence(w, a, b, 3000) && b.silenceUntil <= w.time, "после потолка — иммунитет");
    assert(applySlow(w, a, b, 30, 2000), "замедление в цепочку не входит");
  });

  await check("PvE без DR: моб под станами каждый раз полностью; weak.cc — множитель при наложении", () => {
    const w = mkWorld(), a = mkPlayer(w, "warrior", "А"), m = mkMob(w, false);
    for (let i = 0; i < 4; i++) {
      assert(applyStun(w, a, m, 1500) && near(left(w, m.stunUntil), 1500), `стан ${i + 1} полностью`);
      w.time += 2000;
    }
    const wd = Object.values(MOBS).find((d) => !d.boss && MOB_AI[d.id]?.weak?.cc?.stun);
    if (wd) {
      const wm = new Mob(w.uid("m"), wd, 60, { x: 4060, y: 4000 });
      w.addMob(wm);
      assert(applyStun(w, a, wm, 1000) && near(left(w, wm.stunUntil), 1000 * MOB_AI[wd.id].weak!.cc!.stun!), "weak.cc.stun");
    }
  });

  await check("боссы: стан и корни → замедление, страх не ложится, безмолвие только сбивает, замедления ×slowMult", () => {
    const w = mkWorld(), a = mkPlayer(w, "warrior", "А"), boss = mkMob(w, true);
    assert(applyStun(w, a, boss, 2000) && boss.stunUntil <= w.time, "стан не ложится");
    assert(boss.slowUntil > w.time && boss.slowPct === CC.boss.convSlow, "стан → замедление convSlow: " + boss.slowPct);
    boss.slowUntil = 0;
    assert(applyStun(w, a, boss, 2000, { bossSlow: 40 }) && boss.slowPct === 40, "bossSlow умения");
    boss.slowUntil = 0;
    assert(applyRoot(w, a, boss, 2000) && boss.rootUntil <= w.time && boss.slowPct === CC.boss.convSlow, "корни → замедление");
    assert(!applyFear(w, a, boss, 2000) && boss.fearUntil <= w.time, "страх — иммунитет");
    assert(applySilence(w, a, boss, 2000) && boss.silenceUntil <= w.time, "безмолвие — без блокировки");
    boss.slowUntil = 0;
    assert(applySlow(w, a, boss, 40, 2000) && boss.slowPct === 40 * CC.boss.slowMult, "замедление ×slowMult: " + boss.slowPct);
    assert(applyStun(w, null, boss, 1000) && boss.stunUntil > w.time, "механика босса (без источника) — оглушение как есть");
  });

  await check("безмолвие: умения нельзя, бег можно, каст сбит; стан и страх тоже рвут каст", () => {
    const w = mkWorld(), a = mkPlayer(w, "warrior", "А"), b = mkPlayer(w, "mage", "Б");
    const sk = Object.values(SKILLS).find((s) => s.cls === b.cls && s.kind === "active")!;
    b.save.skills[sk.id] = 1;
    b.castUntil = w.time + 3000; b.castBreakable = true;
    assert(applySilence(w, a, b, 2000) && b.silenceUntil > w.time, "безмолвие легло");
    assert(b.castUntil === 0, "каст сбит безмолвием");
    assert(castSkill(w, b, sk.id, b.x + 50, b.y, null) === T("srv.cc.silenced"), "умение под безмолвием — отказ");
    const x0 = b.x;
    b.input = { mx: 1, my: 0 };
    w.update(100);
    assert(b.x > x0, "бег под безмолвием можно");
    b.input = { mx: 0, my: 0 };
    w.time = b.silenceUntil + 1;
    b.castUntil = w.time + 3000; b.castBreakable = true;
    applyStun(w, a, b, 1000);
    assert(b.castUntil === 0, "стан сбивает каст");
    assert(castSkill(w, b, sk.id, b.x + 50, b.y, null) === T("srv.skills.142"), "под станом — отказ");
    w.time = b.stunUntil + 1;
    b.castUntil = w.time + 3000; b.castBreakable = true;
    applyFear(w, a, b, 1000);
    assert(b.castUntil === 0, "страх сбивает каст");
  });

  await check("страх: бег прочь без управления; ломается уроном; свои DoT первые 0,5 с — нет", () => {
    const w = mkWorld(), a = mkPlayer(w, "warlock", "А", 3960, 4000), b = mkPlayer(w, "mage", "Б", 4000, 4000), m = mkMob(w, false, 4100, 4000);
    b.unit.maxHp = b.unit.hp = 100_000;
    assert(applyFear(w, a, b, 3000), "страх лёг");
    const x0 = b.x;
    b.input = { mx: -1, my: 0 }; // игрок жмёт к источнику — не слушается
    w.update(200);
    assert(b.x > x0, `бежит прочь от источника: ${x0} → ${b.x}`);
    b.input = { mx: 0, my: 0 };
    // свой DoT сразу после наложения — не в счёт
    w.time = b.fearAt + 100;
    w.hit(a, b, { flat: 50_000, canCrit: false, noProc: true, kind: "shadow", dot: true });
    assert(b.fearUntil > w.time && b.fearDmg === 0, "свой DoT в первые 0,5 с не ломает");
    // чужой DoT — с весом dotWeight
    const v = w.hit(m, b, { flat: 2000, canCrit: false, noProc: true, kind: "shadow", dot: true });
    assert(near(b.fearDmg, v * CC.fear.dotWeight, 0.01), `DoT с весом: ${b.fearDmg} vs ${v}`);
    assert(b.fearUntil > w.time, "мелкий DoT не ломает");
    w.hit(m, b, { flat: Math.ceil(b.unit.maxHp * CC.fear.breakHp * 1.5), kind: "shadow" });
    assert(b.fearUntil <= w.time, "крупный удар ломает страх");
  });

  await check("флаги и поле slowPct наружу", () => {
    const w = mkWorld(), a = mkPlayer(w, "warrior", "А"), b = mkPlayer(w, "mage", "Б");
    applySlow(w, a, b, 45, 3000);
    applySilence(w, a, b, 3000);
    w.update(50);
    assert(b.unit.slowPct === 45, "slowPct в схеме: " + b.unit.slowPct);
    assert((b.unit.buffs & 2048) !== 0, "BUFF_SILENCE");
    assert(applyCc(w, a, b, "fear", 1000), "страх через applyCc");
    w.update(50);
    assert((b.unit.buffs & 4096) !== 0, "BUFF_FEAR");
  });

  console.log(`\nКонтроль: проверок ${passedCount()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
