/**
 * Мировой босс как механика без сервера (server/src/worldboss/*, мир с картой, часы подменены): сон → «скоро» → пробуждение по окну,
 * чередование точек слота, уход по сроку без наград и новое окно, вклад (урон, слабые и второй герой аккаунта не вносят), пороги
 * вклада и потолок доли одного, PvP на арене (враг — враг, кража доли вклада убийцей), смерть → итог, Летопись, награда по порогу,
 * откат добычи на сутки, сбор фракции (Muster, 40 мест, отряды). Запуск: npx tsx tests/unit/events-wboss.ts
 */
import { World } from "../../server/src/game/World";
import { Player } from "../../server/src/game/Player";
import { WorldState } from "../../server/src/rooms/schema";
import { raidBotSave } from "../../server/src/arena/botgear";
import { entryV, type WbEntry } from "../../server/src/worldboss/director";
import { wbLocked } from "../../server/src/worldboss/rewards";
import { WB, WB_BOSSES } from "../../shared/worldBoss";
import type { ClassId } from "../../shared/classes";
import { assert, done, inbox, knownFail, section, test } from "./lib";

const w = new World(new WorldState(), () => {}, { quiet: true } as never);
const mgr = w.wboss!;
const d = mgr.directors[0];
const DEF = WB_BOSSES[0];
let clock = new Date(2026, 9, 28, 10, 0).getTime();
mgr.now = () => clock;
const tick = (ms = 1000) => { for (let t = 0; t < ms; t += 100) { w.update(100); mgr.update(); } };
const MIN = 60000;
let uid = 0, acct = 100;
type P = Player & { box: ReturnType<typeof inbox> };
function hero(cls: ClassId, x: number, y: number, level = 95, account = ++acct): P {
  const box = inbox();
  const p = new Player(`wb${++uid}`, `Страж${uid}`, raidBotSave(cls, level), box.send) as P;
  p.box = box;
  p.accountId = account;
  p.inputAt = w.time;
  w.addPlayer(p);
  p.unit.x = x; p.unit.y = y;
  return p;
}
const C = WB.contrib;
const entry = (v: Partial<WbEntry>): WbEntry => ({ key: "k", name: "n", cls: "warrior", faction: "solgard", account: 1, dmg: 0, heal: 0, tank: 0, bonus: 0, actMs: 0, sent: -1, ...v });

section("Пороги и доли (чистые)");

await test("порог по пику здоровья: бронза/серебро/золото; бронза ещё за секунды действий", () => {
  const max = 1_000_000;
  assert.equal(d.tierOf(entry({}), max), "");
  assert.equal(d.tierOf(entry({ dmg: C.bronze * max }), max), "bronze");
  assert.equal(d.tierOf(entry({ heal: C.silver * max }), max), "silver");
  assert.equal(d.tierOf(entry({ tank: C.gold * max }), max), "gold");
  assert.equal(d.tierOf(entry({ actMs: C.bronzeActSec * 1000 }), max), "bronze");
  assert.equal(entryV(entry({ dmg: 1, heal: 2, tank: 3, bonus: 4 })), 10);
});

await test("суммы фракций: доля одного героя не больше capShare общей суммы", () => {
  d.contrib.clear();
  d.contrib.set("a", entry({ key: "a", faction: "solgard", dmg: 1_000_000 }));
  for (let i = 0; i < 30; i++) d.contrib.set(`u${i}`, entry({ key: `u${i}`, faction: "umbrath", dmg: 10_000 }));
  const sum = 1_000_000 + 300_000, [s, u] = d.totals();
  assert.equal(s, Math.round(sum * C.capShare), "кит не обрезан");
  assert.equal(u, 300_000);
  d.contrib.clear();
});

section("Окно, пробуждение, уход");

await test("спит до окна; за 30 мин — «скоро»; в момент появления — жив в точке слота", () => {
  tick(200);
  assert.equal(d.stage, "sleep");
  const win = d.win!;
  assert.ok(win.mark > clock);
  clock = win.mark - 29 * MIN; tick(200);
  assert.equal(d.stage, "soon");
  clock = win.at; tick(200);
  assert.equal(d.stage, "alive");
  assert.ok(d.mob && w.mobs.has(d.mob.id));
  const p0 = d.slot.points[0];
  assert.ok(Math.hypot(d.mob!.home.x - p0.x, d.mob!.home.y - p0.y) < 1 || d.slot.points.length > 1);
});

await test("не убит за lifeMin — уходит без наград, моб убран, следующее окно в будущем, следующая точка — другая", () => {
  const spawned = mgr.saved.bosses[DEF.id].spawns, at0 = d.mob!.home;
  const p = hero("mage", at0.x - 60, at0.y);
  w.hit(p, d.mob!, { mult: 2 });
  const id = d.mob!.id;
  clock = d.aliveUntil + 1000; tick(1200);
  assert.equal(d.stage, "dead");
  assert.ok(!w.mobs.has(id), "моб остался");
  assert.ok(!p.box.msgs.some((m) => m.type === "wboss:result"), "награда за ушедшего босса");
  assert.ok(d.win!.mark > clock);
  if (d.slot.points.length > 1 && DEF.pick !== "random") {
    const nx = d.spot(spawned);
    assert.ok(nx.x !== at0.x || nx.y !== at0.y, "точка не чередуется");
  }
  w.removePlayer(p.id);
});

section("Бой: вклад, слабые, PvP");

/** Разбудить босса сейчас. */
const wake = () => { d.reset(); d.spawn(clock); tick(200); return d.mob!; };

await test("слабый (< minLevel) не ранит и не вносит; второй герой того же аккаунта не вносит", () => {
  const boss = wake(), H = boss.home;
  const weak = hero("ranger", H.x - 50, H.y, WB.minLevel - 1);
  const hp = boss.unit.hp;
  w.hit(weak, boss, { mult: 3 });
  assert.equal(boss.unit.hp, hp);
  assert.ok(!d.contrib.has(weak.name.toLowerCase()));
  const main = hero("mage", H.x - 60, H.y), alt = hero("rogue", H.x - 70, H.y, 95, main.accountId);
  w.hit(main, boss, { mult: 1 });
  w.hit(alt, boss, { mult: 1 });
  assert.ok(d.contrib.has(main.name.toLowerCase()));
  assert.ok(!d.contrib.has(alt.name.toLowerCase()), "второй герой аккаунта вносит");
  for (const p of [weak, main, alt]) w.removePlayer(p.id);
});

await test("PvP на арене: фракции враждуют; убийца врага с вкладом забирает долю pvpSteal", () => {
  const boss = d.mob ?? wake(), H = boss.home;
  const s = hero("warrior", H.x - 40, H.y), u = hero("deathknight", H.x + 40, H.y);
  assert.ok(w.hostile(s, u), "у босса фракции не враги");
  w.hit(u, boss, { mult: 3 });
  const vu = entryV(d.contrib.get(u.name.toLowerCase())!);
  assert.ok(vu > 0);
  w.killPlayer(u, s);
  const es = d.contrib.get(s.name.toLowerCase());
  assert.ok(es && Math.abs(es.bonus - vu * C.pvpSteal) < 1e-6, `бонус ${es?.bonus} из ${vu}`);
  w.removePlayer(s.id); w.removePlayer(u.id);
});

await test("ушёл с Полей до конца — вклад сгорает", () => {
  const boss = d.mob ?? wake(), H = boss.home;
  const p = hero("mage", H.x - 60, H.y);
  w.hit(p, boss, { mult: 1 });
  assert.ok(d.contrib.has(p.name.toLowerCase()));
  p.unit.x = 60 * 32; p.unit.y = 183 * 32; // земли Сольгарда
  tick(1500);
  assert.ok(!d.contrib.has(p.name.toLowerCase()));
  w.removePlayer(p.id);
});

section("Смерть, итог, награда");

await test("смерть: итог на следующем такте, Летопись, награда по порогу, откат на сутки, без порога — без награды", () => {
  const boss = wake(), H = boss.home;
  const big = hero("mage", H.x - 60, H.y), small = hero("ranger", H.x - 70, H.y + 20);
  big.inputAt = small.inputAt = w.time;
  d.entry(big)!.dmg = C.gold * boss.unit.maxHp * 2;
  d.entry(small)!.dmg = 1;
  const chron = mgr.chronicle().length, g0 = big.save.gold;
  w.applyDamage(boss, boss.unit.hp + 10, big);
  assert.equal(d.stage, "dead");
  tick(300);
  assert.equal(mgr.chronicle().length, chron + 1);
  const r = big.box.msgs.find((m) => m.type === "wboss:result")?.msg;
  assert.ok(r?.me && r.me.tier === "gold", JSON.stringify(r?.me));
  assert.ok(big.save.gold > g0 || (big.save.marks ?? 0) > 0, "награды нет");
  assert.ok(wbLocked(big.save, DEF.id, clock), "откат добычи не поставлен");
  const rs = small.box.msgs.find((m) => m.type === "wboss:result")?.msg;
  assert.ok(rs && !rs.me, "без порога выдана награда");
  assert.equal(d.contrib.size, 0);
  assert.ok(d.win!.mark > clock, "нет следующего окна");
  w.removePlayer(big.id); w.removePlayer(small.id);
});

section("Сбор фракции");

await test("запись своей фракции, чужая — в свой сбор; лимит 40; сбор → отряды", () => {
  const s = hero("warrior", 0, 0), u = hero("deathknight", 0, 0);
  assert.equal(mgr.join([s]), null, "запись Сольгарда");
  assert.equal(mgr.join([u]), null, "запись Умбрата");
  assert.ok(mgr.musters.get("solgard")!.has(s.name.toLowerCase()) && !mgr.musters.get("solgard")!.has(u.name.toLowerCase()));
  assert.ok(mgr.musters.get("umbrath")!.has(u.name.toLowerCase()));
  const low = hero("warrior", 0, 0, 50);
  assert.ok(mgr.join([low]));
  mgr.startNow(u); // результат — см. B41
  assert.ok(mgr.squadOf(u.name.toLowerCase())?.some((e) => e.name === u.name), "отряд не собран");
  mgr.cancel(s);
  assert.ok(!mgr.musters.get("solgard")!.has(s.name.toLowerCase()));
  for (const p of [s, u, low]) w.removePlayer(p.id);
});

await test("B41: wboss:start лидером: успех возвращает null (без тоста ошибки)",
  () => {
    const u = hero("deathknight", 0, 0);
    mgr.join([u]);
    const r = mgr.startNow(u);
    w.removePlayer(u.id);
    assert.equal(r, null);
  });

done();
