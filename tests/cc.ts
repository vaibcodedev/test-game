/** Контроль (задача 148, партии A и B): applyCc, DR по категориям и сброс, потолки, цепочка, боссы, безмолвие, страх. npx tsx tests/cc.ts (без сервера). */
import { assert, check, passedCount } from "./harness";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { Mob } from "../server/src/game/Mob";
import { WorldState } from "../server/src/rooms/schema";
import { applyCc, applyFear, applyRoot, applySilence, applySlow, applyStun, ccMs } from "../server/src/game/effects";
import { castSkill } from "../server/src/game/skills";
import { createBoss } from "../server/src/game/bosses";
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

  // ---------- партия B: стиль контроля и выход у классов (docs/systems/combat.md §3) — один каст, один эффект ----------
  const cast = (w: World, p: Player, id: string, t?: { x: number; y: number; id?: string }, r = 5) => {
    p.save.skills[id] = r;
    p.unit.mp = p.unit.maxMp; p.gcdUntil = 0; p.cds.delete(id);
    return castSkill(w, p, id, t?.x ?? p.x, t?.y ?? p.y, t?.id ?? null);
  };
  const run = (w: World, ms: number) => { for (let t = 0; t < ms; t += 50) w.update(50); };
  const duel = (cls: ClassId, foe: ClassId) => {
    const w = mkWorld(), a = mkPlayer(w, cls, "А"), b = mkPlayer(w, foe, "Б", 4040, 4000);
    a.team = 1; b.team = 2; w.pvpActive = true; // мир без мобов: враги — разные команды арены
    b.unit.maxHp = b.unit.hp = 1e7; // не погибнет и не выйдет из страха от урона в проверке
    return { w, a, b };
  };
  const on = (b: { x: number; y: number; id: string }) => ({ x: b.x, y: b.y, id: b.id });

  await check("Храмовник: «Удар щитом» — стан и безмолвие после; «Рывок» из корней; «Божественный щит» под станом", () => {
    const { w, a, b } = duel("warrior", "warlock");
    { const e0 = cast(w, a, "tp_shield_bash", on(b)); assert(e0 === null, "удар щитом: " + e0); }
    assert(b.stunUntil > w.time && b.silenceUntil > b.stunUntil, `стан ${left(w, b.stunUntil)}, безмолвие ${left(w, b.silenceUntil)}`);
    const c = mkPlayer(w, "reaver", "В", 3860, 4000); c.team = 2;
    applyRoot(w, b, a, 3000);
    const e = cast(w, a, "charge", on(c));
    assert(e === null && a.rootUntil <= w.time, "рывок срывает корни: " + e);
    applyStun(w, b, a, 3000);
    assert(cast(w, a, "tp_divine") === null && a.stunUntil <= w.time, "щит под станом снимает стан");
  });

  await check("Клирик: «Сияние» — безмолвие на луче; «Очищение» под станом — на себя", () => {
    const { w, a, b } = duel("healer", "reaver");
    const e = cast(w, a, "cl_radiance", { x: b.x, y: b.y });
    assert(e === null && b.silenceUntil > w.time, "безмолвие на луче: " + e);
    applyStun(w, b, a, 3000);
    assert(cast(w, a, "cl_cleanse", on(b)) === null && a.stunUntil <= w.time, "очищение под станом — на себя");
  });

  await check("Кровотворец: «Кровавый взрыв» — страх; «Жертва» без цели под безмолвием снимает его", () => {
    const { w, a, b } = duel("bloodweaver", "warrior");
    assert(cast(w, a, "bw_blood_burst", { x: b.x, y: b.y }) === null, "взрыв");
    run(w, 700);
    assert(b.fearUntil > w.time, "страх после взрыва");
    a.unit.hp = a.unit.maxHp;
    applySilence(w, b, a, 3000);
    applyRoot(w, b, a, 3000);
    const e = cast(w, a, "bw_sacrifice");
    assert(e === null && a.silenceUntil <= w.time && a.rootUntil <= w.time, "жертва под безмолвием: " + e);
  });

  await check("Егерь: «Залп» замедляет; «Перекат» из корней", () => {
    const { w, a, b } = duel("ranger", "reaver");
    assert(cast(w, a, "volley", { x: b.x, y: b.y }) === null, "залп");
    run(w, 400);
    assert(b.slowUntil > w.time && b.slowPct >= 30 * BAL.pvp.ccMult - 1, "замедление залпа " + b.slowPct);
    applyRoot(w, b, a, 3000);
    const e = cast(w, a, "roll", { x: a.x - 150, y: a.y });
    assert(e === null && a.rootUntil <= w.time, "перекат из корней: " + e);
  });

  await check("Маг: «Ледяная нова» — корни, затем замедление; «Мерцание» под станом; «Молния» — безмолвие", () => {
    const { w, a, b } = duel("mage", "reaver");
    assert(cast(w, a, "frostnova") === null && b.rootUntil > w.time && b.slowUntil > b.rootUntil, "нова: корни, затем замедление");
    applyStun(w, b, a, 3000);
    const e = cast(w, a, "blink", { x: a.x - 180, y: a.y });
    assert(e === null && a.stunUntil <= w.time, "мерцание под станом: " + e);
    assert(cast(w, a, "mg_bolt", on(b)) === null && b.silenceUntil > w.time, "молния — безмолвие");
  });

  await check("Ассасин: «Теневой шаг» — безмолвие и выход из корней; «Подлый удар» — стан", () => {
    const { w, a, b } = duel("rogue", "warlock");
    b.unit.x = 4150;
    applyRoot(w, b, a, 3000);
    const e = cast(w, a, "shadowstep", on(b));
    assert(e === null && a.rootUntil <= w.time, "шаг из корней: " + e);
    assert(b.silenceUntil > w.time, "безмолвие шага");
    assert(cast(w, a, "as_cheap", on(b)) === null && b.stunUntil > w.time, "подлый удар — стан");
  });

  await check("Рыцарь смерти: «Антимагия» — иммунитет к безмолвию и страху", () => {
    const { w, a, b } = duel("deathknight", "mage");
    assert(cast(w, a, "dk_anti_magic") === null, "антимагия");
    assert(!applySilence(w, b, a, 2000) && !applyFear(w, b, a, 2000), "безмолвие и страх не ложатся");
    assert(applyStun(w, b, a, 1000), "стан — ложится");
  });

  await check("Тёмный следопыт: «Ворон» — безмолвие первым клевком", () => {
    const { w, a, b } = duel("darkranger", "mage");
    assert(cast(w, a, "dr_raven", on(b)) === null, "ворон");
    run(w, 700);
    assert(b.silenceUntil > w.time, "безмолвие ворона");
  });

  await check("Чернокнижник: «Проклятие рока» — страх; «Метаморфоза» — иммунитет к страху и корням", () => {
    const { w, a, b } = duel("warlock", "warrior");
    assert(cast(w, a, "wl_hex", on(b)) === null, "проклятие");
    run(w, 300);
    assert(b.fearUntil > w.time, "страх проклятия");
    assert(cast(w, a, "wl_meta") === null && !applyFear(w, b, a, 2000) && !applyRoot(w, b, a, 2000), "метаморфоза — иммунитет");
  });

  await check("Потрошитель: «Прыжок» — безмолвие цели и выход из корней; «Безумие» — иммунитет к замедлению", () => {
    const { w, a, b } = duel("reaver", "mage");
    b.unit.x = 3860;
    applyRoot(w, b, a, 3000);
    const e = cast(w, a, "rv_leap", on(b));
    assert(e === null && a.rootUntil <= w.time, "прыжок из корней: " + e);
    assert(b.silenceUntil > w.time, "безмолвие прыжка");
    assert(cast(w, a, "rv_frenzy") === null && !applySlow(w, b, a, 50, 3000), "безумие — замедление не ложится");
  });

  await check("босс: безмолвие героя сбивает каст (Повелитель Пепла)", () => {
    const w = mkWorld(), a = mkPlayer(w, "warrior", "А");
    const m = new Mob(w.uid("m"), MOBS.ashlord, 60, { x: 4040, y: 4000 });
    w.addMob(m);
    m.boss = createBoss(w, m, 300);
    const boss = m.boss as unknown as { casting: boolean; cast(ms: number): void } | null;
    assert(!!boss, "у Повелителя Пепла есть мозг босса");
    boss!.cast(1000);
    assert(boss!.casting, "кастует");
    assert(applySilence(w, a, m, 2000) && !boss!.casting, "безмолвие сбило каст");
    assert(m.silenceUntil <= w.time, "без блокировки");
  });
  console.log(`\nКонтроль: проверок ${passedCount()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
