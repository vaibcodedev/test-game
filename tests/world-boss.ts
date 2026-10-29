/**
 * Мировые боссы (задача 151, docs/world-bosses.md): Колосс Пепельного Знамени на юге Полей.
 *  A. На настоящем коде мира (World, WorldBosses, директор, Колосс) без сервера, часы подменены: расписание 13:00/18:30/23:00 и окно появления,
 *     объявления Глашатаев за 30/10/1 мин по фракциям, появление в слоте, поводок, сила по толпе, вклад (урон/лечение ×1,2/танк ×1,5),
 *     «слишком слаб», один герой с аккаунта, PvP-стаки «Сбора павших», «Осколки» снимают стаки, «Ярость Полей», уход с Полей — вклад сгорает,
 *     пороги и доля одного ≤5 %, итог: Знаки, мешки у тела (невзятое — в сумку), откат вещей на сутки, титул, Летопись, знамя победы (+5 % опыта),
 *     уход по сроку, сброс здоровья при пустом круге, сборы фракции (автосбор отрядов по ролям), «В форт».
 *  B. Сервер (TEST_PORT, под замком tools/out/scenario.lock | scenario.lock2): Вестник только в Эмберхолле (и у Врат), регистрация у него,
 *     dbg wboss soon | start | kill | reset, сообщения wboss и event:say.
 * Запуск: npx tsx tests/world-boss.ts [--only a,b]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CITIES } from "../shared/cities";
import { TILE } from "../shared/constants";
import { Zone, zoneAtPx, walkable, generateMap } from "../shared/map";
import { MAP_SEED } from "../shared/constants";
import { MOBS } from "../shared/mobs";
import { RAID_HERALDS } from "../shared/raid";
import { WB, WB_BY_ID, wbMobId, wbNextWindow, wbSlot, type WbStateMsg } from "../shared/worldBoss";
import { Player } from "../server/src/game/Player";
import { World } from "../server/src/game/World";
import { OpenWorldState } from "../server/src/rooms/schema";
import { raidBotSave } from "../server/src/arena/botgear";
import { Muster } from "../server/src/raid/muster";
import { entryV } from "../server/src/worldboss/director";
import { wbLocked, wbState } from "../server/src/worldboss/rewards";
import type { ClassId } from "../shared/classes";

const argv = process.argv.slice(2);
const ONLY = new Set((argv[argv.indexOf("--only") + 1] && argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : "a,b").split(","));
try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}

let failed = 0, passed = 0;
function check(name: string, ok: boolean, info = "") {
  if (ok) { passed++; console.log(`  ok   ${name}${info ? ` — ${info}` : ""}`); }
  else { failed++; console.log(`  FAIL ${name}${info ? ` — ${info}` : ""}`); }
}
const MIN = 60000;
const DEF = WB_BY_ID.colossus;

// ================================================================ A. мир без сервера
function partA() {
  console.log("A. Колосс на коде мира");
  // --- расписание
  const day = (h: number, m = 0, d = 29) => new Date(2026, 9, d, h, m).getTime();
  const w1 = wbNextWindow(DEF, day(12, 0));
  check("расписание: после 12:00 — окно 13:00, появление в 0–5 мин после отметки", w1.mark === day(13) && w1.at >= day(13) && w1.at <= day(13, 5), new Date(w1.at).toTimeString().slice(0, 8));
  check("расписание: после 13:00 — 18:30, после 18:30 — 23:00, после 23:00 — 13:00 следующего дня",
    wbNextWindow(DEF, day(13, 1)).mark === day(18, 30) && wbNextWindow(DEF, day(18, 31)).mark === day(23) && wbNextWindow(DEF, day(23, 1)).mark === day(13, 0, 30));
  const slot = wbSlot(DEF.slot)!;
  const map = generateMap(MAP_SEED);
  check("слот на юге Полей у вулкана, пара зеркальна, арена проходима и ровна",
    slot.points.length === 2 && slot.points.every((p) => p.y > 300 * TILE && [Zone.Fields, Zone.Volcano].includes(zoneAtPx(map, p.x, p.y)) && walkable(map, p.x, p.y, 30))
    && Math.abs(slot.points[0].x + slot.points[1].x - 1100 * TILE) < 1 && slot.points[0].y === slot.points[1].y,
    slot.points.map((p) => `${p.x / TILE},${p.y / TILE}`).join(" | "));
  let blocked = 0;
  for (const c of slot.points) for (let a = 0; a < 64; a++) for (const r of [0.3, 0.6, 0.9]) {
    const x = c.x + Math.cos((a / 64) * Math.PI * 2) * slot.arena * r, y = c.y + Math.sin((a / 64) * Math.PI * 2) * slot.arena * r;
    if (!walkable(map, x, y, 10)) blocked++;
  }
  check("в круге арены нет препятствий", blocked === 0, `${blocked} точек`);
  const gate = { x: 550 * TILE, y: 345 * TILE };
  check("арена не на оси (путь к Вратам Цитадели) и не на точках «Знамён»", slot.points.every((p) => Math.abs(p.x - gate.x) > slot.arena + 20 * TILE));

  // --- мир
  const msgs: { type: string; msg: any }[] = [];
  const w = new World(new OpenWorldState(), (type, msg) => msgs.push({ type, msg }), { quiet: true });
  const mgr = w.wboss!;
  const d = mgr.byId.get("colossus")!;
  let clock = day(12, 0);
  mgr.now = () => clock;
  const tick = (ms = 100) => { const n = Math.max(1, Math.round(ms / 50)); for (let i = 0; i < n; i++) { for (const p of w.players.values()) p.inputAt = w.time; w.update(50); } };
  const inbox = new Map<string, { type: string; msg: any }[]>();
  let pid = 0, acct = 1;
  const hero = (cls: ClassId, x: number, y: number, level = 100, account = acct++) => {
    const name = `Герой${++pid}`;
    const box: { type: string; msg: any }[] = [];
    inbox.set(name, box);
    const p = new Player(`p${pid}`, name, raidBotSave(cls, level), (type, msg) => box.push({ type, msg }));
    p.accountId = account;
    p.inputAt = w.time;
    p.unit.x = x; p.unit.y = y;
    w.addPlayer(p);
    return p;
  };
  const got = (p: Player, type: string) => inbox.get(p.name)!.filter((m) => m.type === type).map((m) => m.msg);
  const far = CITIES.find((c) => c.id === "aurelion")!.spawn;
  const watchS = hero("warrior", far.x, far.y), watchU = hero("deathknight", CITIES.find((c) => c.id === "morthaim")!.spawn.x, CITIES.find((c) => c.id === "morthaim")!.spawn.y);

  tick(200);
  check("до 12:30 — спит", d.stage === "sleep" && d.win?.mark === day(13), d.stage);
  clock = day(12, 31); tick(200);
  const say = (p: Player) => got(p, "event:say").filter((m) => m.kind === "wboss");
  check("за 30 мин — «скоро», объявление Глашатая своей фракции", d.stage === "soon" && say(watchS).length === 1 && say(watchS)[0].from === DEF.heralds.solgard && say(watchU)[0]?.from === DEF.heralds.umbrath,
    say(watchS)[0]?.text);
  clock = day(12, 46); tick(200);
  check("за 15 мин — «В форт» открыт (объявление и перенос)", say(watchS).length === 2 && mgr.teleport(hero("warrior", far.x, far.y)) === null);
  clock = day(12, 51); tick(200);
  clock = day(12, 59, 29) + 30000; tick(200);
  check("объявления за 30, 10, 1 мин — по одному", say(watchS).length === 4, say(watchS).map((m) => m.text.match(/\d+ мин/)?.[0]).join(", "));
  clock = d.win!.at; tick(200);
  const boss = d.mob!;
  check("появление: босс жив в точке слота, рёв на весь мир, состояние wboss", d.stage === "alive" && !!boss && w.mobs.has(boss.id) && boss.home.x === slot.points[0].x
    && got(watchU, "event:say").some((m) => m.kind === "roar") && msgs.some((m) => m.type === "wboss" && (m.msg as WbStateMsg).st === "alive"));
  check("моб: временный спрайт, уровень 93, награды не убийце", boss.unit.sprite === DEF.mob.sprite && boss.level === 93 && MOBS[wbMobId("colossus")].wboss === "colossus");

  // --- бой
  const H = boss.home;
  const tank = hero("warrior", H.x - 40, H.y), heal = hero("healer", H.x - 60, H.y + 20), dps = hero("mage", H.x - 80, H.y - 20);
  const foe = hero("darkranger", H.x + 60, H.y), weak = hero("ranger", H.x - 50, H.y + 40, 60);
  const alt = hero("rogue", H.x - 70, H.y + 10, 100, dps.accountId); // второй герой того же аккаунта
  boss.addThreat(tank.id, 1e6); boss.state = "chase"; boss.targetId = tank.id;
  const hp0 = boss.unit.hp;
  const dealt = w.hit(dps, boss, { mult: 3 });
  check("урон по боссу → вклад 1:1", dealt > 0 && Math.abs(d.contrib.get(dps.name.toLowerCase())!.dmg - dealt) < 1e-6, `урон ${dealt}`);
  tank.unit.hp = Math.round(tank.unit.maxHp * 0.5);
  const taken = w.hit(boss, tank, { flat: 500 });
  check("урон по держащему агро → танк ×1,5", Math.abs(d.contrib.get(tank.name.toLowerCase())!.tank - taken * 1.5) < 1e-6, `принято ${taken}`);
  const healed = w.heal(tank, 2000, true, heal);
  check("лечение героя в бою с боссом → ×1,2", healed > 0 && Math.abs(d.contrib.get(heal.name.toLowerCase())!.heal - healed * 1.2) < 1e-6, `вылечено ${healed}`);
  const before = boss.unit.hp;
  w.hit(weak, boss, { mult: 3 });
  check("ниже 80 ур. — урон 0 и «слишком слабы»", boss.unit.hp === before && !d.contrib.has(weak.name.toLowerCase()) && got(weak, "toast").some((t) => t.text === DEF.texts.weak));
  w.hit(alt, boss, { mult: 1 });
  check("один герой с аккаунта на событие", !d.contrib.has(alt.name.toLowerCase()));
  void hp0;

  // поводок
  const out = hero("ranger", H.x + slot.arena + 300, H.y);
  boss.addThreat(out.id, 9e9);
  tick(100);
  check("поводок: угроза вне круга снимается", !boss.threat.has(out.id) && boss.threat.has(tank.id));

  // сила по толпе
  const max0 = boss.unit.maxHp, f0 = boss.unit.hp / boss.unit.maxHp;
  const crowd: Player[] = [];
  for (let i = 0; i < 12; i++) crowd.push(hero(i % 2 ? "mage" : "warlock", H.x + Math.cos(i) * 150, H.y + Math.sin(i) * 150));
  tick(1200);
  const exp = Math.round(boss.stats.maxHp * (1 + DEF.crowd.hpPerStep));
  check("сила по толпе: >10 героев в круге — здоровье ступенью выше, доля сохранена", boss.unit.maxHp === exp && Math.abs(boss.unit.hp / boss.unit.maxHp - f0) < 0.01, `${max0} → ${boss.unit.maxHp}`);
  for (const p of crowd) { w.removePlayer(p.id); }
  tick(1200);
  check("толпа ушла — здоровье не падает (только вверх)", boss.unit.maxHp === exp);

  // PvP-стаки
  const arm0 = boss.stats.armor;
  const victimV = entryV(d.contrib.get(dps.name.toLowerCase())!);
  w.applyDamage(dps, dps.unit.hp + 1, foe);
  check("павший в круге от PvP → стак брони «Сбора павших»", d.brain!.stacks === 1 && boss.stats.armor > arm0, `броня ${arm0} → ${boss.stats.armor}`);
  check("убийца врага с вкладом получает 30 % его очков", Math.abs((d.contrib.get(foe.name.toLowerCase())?.bonus ?? 0) - victimV * WB.contrib.pvpSteal) < 1e-6);
  w.applyDamage(heal, heal.unit.hp + 1, boss);
  check("павший от босса — тоже стак", d.brain!.stacks === 2);
  dps.dead = false; dps.unit.hp = dps.unit.maxHp; heal.dead = false; heal.unit.hp = heal.unit.maxHp;

  // фазы
  boss.unit.hp = Math.round(boss.unit.maxHp * 0.59);
  boss.addThreat(tank.id, 1e6); boss.state = "chase";
  tick(200);
  const shards = [...w.mobs.values()].filter((m) => m.def.id === `wb_colossus_shard` && !m.dead);
  check("Ф2: отваливаются 4 «Осколка»", d.brain!.phaseNo() === 1 && shards.length === DEF.mechanics.shards.count, `${shards.length}`);
  w.applyDamage(shards[0], shards[0].unit.hp + 1, tank);
  tick(200);
  check("разбитый Осколок снимает стак", d.brain!.stacks === 1);
  w.hit(tank, shards[1], { mult: 2 });
  check("урон по свите — тоже вклад", d.contrib.get(tank.name.toLowerCase())!.dmg > 0);
  const waves0 = msgs.filter((m) => m.type === "wboss:wave").length;
  boss.unit.hp = Math.round(boss.unit.maxHp * 0.29);
  boss.addThreat(tank.id, 1e6); boss.state = "chase";
  tick(6000);
  check("Ф3: «Ярость Полей» — огненные кольца от центра с брешами", d.brain!.phaseNo() === 2 && msgs.filter((m) => m.type === "wboss:wave").length > waves0);

  // уход с Полей
  const runner = hero("mage", H.x - 30, H.y - 30);
  w.hit(runner, boss, { mult: 1 });
  check("вклад записан", d.contrib.has(runner.name.toLowerCase()));
  runner.unit.x = far.x; runner.unit.y = far.y;
  tick(1200);
  check("вышел с Полей до конца — вклад сгорел", !d.contrib.has(runner.name.toLowerCase()) && got(runner, "toast").some((t) => t.text.includes("сгорел")));

  // секунды действий (бронза без очков)
  const idle = hero("ranger", H.x + 30, H.y - 60);
  idle.unit.maxHp = idle.unit.hp = 1e9; // без смерти от «Ярости Полей»
  for (let i = 0; i < 65; i++) { idle.combatAt = w.time; tick(1000); }
  const ie = d.contrib.get(idle.name.toLowerCase());
  check("60 с действий в круге → бронза без порога очков", !!ie && ie.actMs >= 60000 && d.tierOf(ie) === "bronze", `${Math.round((ie?.actMs ?? 0) / 1000)} с`);

  // доля одного ≤5 %
  const t = d.totals();
  const sum = [...d.contrib.values()].reduce((a, e) => a + entryV(e), 0);
  check("суммы фракций: доля одного героя ≤ 5 % общей", t[0] + t[1] <= sum * WB.contrib.capShare * d.contrib.size + 1 && t[0] <= sum * 0.05 * [...d.contrib.values()].filter((e) => e.faction === "solgard").length + 1);

  // пороги: золото у танка, серебро у лекаря, вне порога — посторонний
  const peak = d.peakHp;
  d.contrib.get(tank.name.toLowerCase())!.dmg = peak * 0.03;
  d.contrib.get(heal.name.toLowerCase())!.heal = peak * 0.012;
  d.contrib.get(foe.name.toLowerCase())!.dmg = peak * 0.004;
  const tiny = hero("warlock", H.x + 20, H.y + 60);
  w.hit(tiny, boss, { mult: 0.1 });
  check("пороги: золото 2 %, серебро 1 %, бронза 0,3 %, ниже — ничего",
    d.tierOf(d.contrib.get(tank.name.toLowerCase())!) === "gold" && d.tierOf(d.contrib.get(heal.name.toLowerCase())!) === "silver"
    && d.tierOf(d.contrib.get(foe.name.toLowerCase())!) === "bronze" && d.tierOf(d.contrib.get(tiny.name.toLowerCase())!) === "");

  // смерть и награды
  const marks0 = tank.save.marks ?? 0;
  mgr.debug("kill", {}, tank);
  tick(300);
  const res = got(tank, "wboss:result")[0];
  check("смерть: итог каждому участнику, этап «убит»", d.stage === "dead" && !!res && res.me?.tier === "gold" && !!got(tiny, "wboss:result")[0] && got(tiny, "wboss:result")[0].me === null);
  check("Знаки Полей (фракция с большим вкладом — ×1,25), опыт", (tank.save.marks ?? 0) - marks0 === res.me.marks && res.me.marks >= DEF.rewards.gold.marks && res.me.xp > 0, `+${res.me.marks}`);
  check("личный мешок у тела с вещами (серебро/золото — эпик и выше)", tank.bags.size === 1 && [...tank.bags.values()][0].items.filter((it) => (it.rarity ?? 0) >= 2).length >= 2 && foe.bags.size === 1);
  check("титул за первую победу, откат вещей на сутки", tank.save.titles?.some((x) => x.name === "Свидетель Колосса") === true && !!wbState(tank.save).day.colossus);
  check("Летопись: запись с фракцией-победителем и лучшими", mgr.chronicle()[0]?.boss === "colossus" && mgr.chronicle()[0].top.dmg.length > 0 && mgr.chronicle()[0].win === res.win, `победа: ${res.win}`);
  check("знамя победы: +5 % опыта на Полях фракции-победителю, другой — нет", mgr.xpBonus(res.win) === WB.victory.xpPct && mgr.xpBonus(res.win === "solgard" ? "umbrath" : "solgard") === 0);
  const fieldsAt = { x: H.x, y: H.y - 200 }, winner = res.win === "solgard" ? tank : foe;
  check("бонус опыта применяется к мобам Полей (bannerWar.mobBonus)", w.war!.mobBonus(winner, fieldsAt).xp >= 1 + WB.victory.xpPct - 1e-9);
  // мешок истёк — невзятое в сумку целиком
  const inv0 = tank.save.inventory.filter(Boolean).length, n = [...tank.bags.values()][0].items.length;
  for (let i = 0; i < Math.ceil(DEF.rewards.bagMs / 1000) + 2; i++) w.update(1000);
  check("мешок истёк — невзятое разом в сумку", tank.bags.size === 0 && tank.save.inventory.filter(Boolean).length === inv0 + n, `${n} вещей`);
  check("следующее окно — 18:30", d.win?.mark === day(18, 30));

  // повтор в тот же день: откат вещей
  d.spawn(clock);
  const b2 = d.mob!;
  tank.dead = false; tank.unit.hp = tank.unit.maxHp; tank.unit.x = b2.home.x - 40; tank.unit.y = b2.home.y;
  b2.addThreat(tank.id, 1e6); b2.state = "chase";
  w.hit(tank, b2, { mult: 2 });
  d.contrib.get(tank.name.toLowerCase())!.dmg = d.peakHp * 0.03;
  const m1 = tank.save.marks ?? 0;
  mgr.debug("kill", {}, tank);
  tick(300);
  const r2 = got(tank, "wboss:result")[1];
  check("откат: второй раз за сутки — без вещей, Знаки и опыт есть", r2?.me?.locked === true && tank.bags.size === 0 && (tank.save.marks ?? 0) > m1 && got(tank, "toast").some((x) => x.text === DEF.texts.locked));
  clock += 86400000;
  check("на следующие сутки откат снят", !wbLocked(tank.save, "colossus", clock));

  // уход по сроку
  d.spawn(clock);
  const b3 = d.mob!;
  clock += DEF.lifeMin * MIN + 1000; tick(1200);
  check("не убит за 20 мин — уходит без наград", d.stage === "dead" && !w.mobs.has(b3.id) && got(watchS, "event:say").some((m) => m.kind === "gone"));

  // сброс здоровья при пустом круге
  d.spawn(clock);
  const b4 = d.mob!;
  for (const p of [...w.players.values()]) if (Math.hypot(p.x - b4.home.x, p.y - b4.home.y) < slot.arena + 100) { p.unit.x = far.x; p.unit.y = far.y; }
  b4.unit.hp = Math.round(b4.unit.maxHp * 0.5);
  clock += 30000; tick(1200);
  check("пустой круг 30 с — здоровье держится", b4.unit.hp < b4.unit.maxHp);
  clock += 31000; tick(1200);
  check("пустой круг 60 с — сброс здоровья", b4.unit.hp === b4.unit.maxHp);
  check("второе появление — на зеркальной арене (по очереди)", b4.home.x === slot.points[(mgr.saved.bosses.colossus.spawns - 1) % 2].x && d.spot(0).x !== d.spot(1).x);
  mgr.debug("reset", {});
  check("dbg reset: босс убран, этап sleep", d.stage === "sleep" && !w.mobs.has(b4.id));

  // сборы
  const sol: Player[] = [];
  const cls: ClassId[] = ["warrior", "healer", "rogue", "mage", "ranger"];
  for (let i = 0; i < 25; i++) sol.push(hero(cls[i % 5], far.x, far.y));
  const err1 = mgr.join([sol[0]]);
  const err2 = mgr.musters.get("solgard")!.join([watchU]);
  check("сбор фракции: своя — можно, чужая — нет", err1 === null && !!err2, err2 ?? "");
  for (const p of sol.slice(1)) mgr.join([p]);
  const lead = mgr.startNow(sol[1]);
  check("начать раньше — только лидер", !!lead);
  mgr.startNow(sol[0]);
  const sq = sol.map((p) => mgr.squadOf(p.name.toLowerCase()));
  const groups = new Set(sq.map((s) => s));
  const ok = [...groups].every((g) => !!g && g.length >= WB.muster.squad[0] && g.length <= WB.muster.squad[1] && g.some((e) => e.role === "tank") && g.some((e) => e.role === "healer"));
  check("автосбор по ролям: отряды 10–20, в каждом танк и лекарь", groups.size === 2 && ok, [...groups].map((g) => g?.length).join("+"));
  check("Muster.squads делит 45 на 3 отряда", Muster.squads(Array.from({ length: 45 }, (_, i) => ({ role: (["tank", "healer", "melee", "ranged"] as const)[i % 4] })), [10, 20]).length === 3);
  check("окно сбора: отряд в статусе", (mgr.musterStatus(sol[3]).squad?.length ?? 0) > 0);
}

// ================================================================ B. сервер
async function partB() {
  console.log("B. Сервер: Вестник в Эмберхолле, dbg wboss");
  const ember = RAID_HERALDS.find((h) => h.id === "raid_herald_ember");
  check("Вестник — в Эмберхолле (и у Врат), в столицах и фортах его нет", !!ember && RAID_HERALDS.every((h) => h.id === "raid_herald_ember" || h.id === "raid_gate"), RAID_HERALDS.map((h) => h.id).join(", "));
  const H = await import("./harness");
  const { Bot, startServer, stopServer, sleep } = H;
  const locks = [path.join("tools", "out", "scenario.lock"), path.join("tools", "out", "scenario.lock2")];
  let mine = "";
  for (let i = 0; !mine; i++) {
    for (const f of locks) { try { fs.writeFileSync(f, `world-boss ${process.pid}`, { flag: "wx" }); mine = f; break; } catch {} }
    if (!mine) { if (i % 20 === 0) console.log("  … жду замок сценария"); await sleep(3000); }
  }
  try {
    await startServer(true, { WB_MUSTER_MS: "60000" });
    try {
      const A = await Bot.join("Вестникслух", "pass", "warrior");
      const B = await Bot.join("Склепслух", "pass", "deathknight");
      const box: Record<string, any[]> = {};
      for (const b of [A, B]) for (const t of ["wboss", "wboss:muster", "event:say", "events"]) b.room.onMessage(t, (m: any) => { (box[`${b === A ? "A" : "B"}:${t}`] ??= []).push(m); });
      for (const b of [A, B]) b.send("dbg", { op: "level", v: 100 });
      await A.until(() => A.self!.level === 100 && B.self!.level === 100, 4000, "уровень");
      A.send("dbg", { op: "tp", x: ember!.x, y: ember!.y + 30 });
      B.send("dbg", { op: "tp", x: 100 * TILE, y: 100 * TILE });
      await sleep(300);
      A.send("wboss:join", {});
      B.send("wboss:join", {});
      await A.until(() => !!box["A:wboss:muster"]?.some((m) => m.joined), 3000, "A в сборе");
      await sleep(300);
      check("регистрация у Вестника в Эмберхолле; вдали от него — отказ", box["A:wboss:muster"].some((m) => m.joined) && !box["B:wboss:muster"]?.some((m) => m.joined) && B.toasts.length > 0);
      B.send("dbg", { op: "tp", x: ember!.x + 20, y: ember!.y + 30 });
      await sleep(300);
      B.send("wboss:join", {});
      await B.until(() => !!box["B:wboss:muster"]?.some((m) => m.joined), 3000, "B в сборе");
      check("в Эмберхолле встают обе фракции — каждая в свой сбор", box["B:wboss:muster"].at(-1).members.length === 1 && box["A:wboss:muster"].at(-1).members.length === 1);
      A.send("dbg", { op: "wboss", act: "soon", ms: 20 * MIN });
      await A.until(() => !!box["A:event:say"]?.some((m) => m.from === DEF.heralds.solgard), 3000, "анонс");
      check("dbg wboss soon: объявление Глашатая своей фракции", !!box["B:event:say"]?.some((m) => m.from === DEF.heralds.umbrath) && box["A:wboss"].at(-1).st === "soon");
      A.send("dbg", { op: "wboss", act: "start" });
      await A.until(() => box["A:wboss"]?.at(-1)?.st === "alive", 3000, "alive");
      const st = box["A:wboss"].at(-1) as WbStateMsg;
      check("dbg wboss start: босс жив, wboss всем", st.hp > 0 && st.r === wbSlot(DEF.slot)!.arena && box["B:wboss"].at(-1).st === "alive");
      A.send("dbg", { op: "wboss", act: "kill" });
      await A.until(() => box["A:wboss"]?.at(-1)?.st === "dead", 3000, "dead");
      check("dbg wboss kill: «пал», следующее окно назначено", box["A:wboss"].at(-1).next > 0 && !!box["A:event:say"]?.some((m) => m.kind === "dead"));
      A.send("dbg", { op: "wboss", act: "reset" });
      await A.until(() => box["A:wboss"]?.at(-1)?.st === "sleep", 3000, "sleep");
      check("dbg wboss reset", true);
      await A.leave(); await B.leave();
    } finally { await stopServer(); }
  } finally {
    try { if (fs.readFileSync(mine, "utf8").includes(String(process.pid))) fs.rmSync(mine); } catch {}
  }
}

(async () => {
  try {
    if (ONLY.has("a")) partA();
    if (ONLY.has("b")) await partB();
  } catch (e) { failed++; console.log("  FAIL исключение:", e); }
  console.log(`\n${passed} ok, ${failed} fail`);
  process.exit(failed ? 1 : 0);
})();
