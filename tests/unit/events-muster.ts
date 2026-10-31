/**
 * События без сервера и без карты: сборы (server/src/raid/muster.ts — общий Muster рейда и мировых боссов), планировщик
 * (server/src/game/eventClock.ts — Announcer и EventClock), расписания (shared/worldBoss.ts wbNextWindow/wbDayKey,
 * shared/bannerWar.ts nextWarStart/weekKey/raiseSec, shared/siege.ts nextSiegeStart).
 * Запуск: npx tsx tests/unit/events-muster.ts
 */
import { Player, newSave } from "../../server/src/game/Player";
import { Muster, RaidMuster, type MusterEntry } from "../../server/src/raid/muster";
import { Announcer, EventClock, type ClockEvent } from "../../server/src/game/eventClock";
import { RAID_CFG, RAID_ROLES, raidRole, type RaidRole } from "../../shared/raid";
import { WB, WB_BOSSES, wbDayKey, wbNextWindow, type WbBossDef } from "../../shared/worldBoss";
import { WAR, nextWarStart, raiseSec, weekKey } from "../../shared/bannerWar";
import { SIEGE, nextSiegeStart } from "../../shared/siege";
import type { ClassId } from "../../shared/classes";
import { assert, done, inbox, section, test } from "./lib";

const MIN = 60000, H = 3600000;
let uid = 0;
function mk(cls: ClassId = "warrior", level = 85, name?: string) {
  const box = inbox();
  const s = newSave(cls, { x: 0, y: 0 });
  s.level = level;
  const n = ++uid;
  const p = new Player(`m${n}`, name ?? `Сборщик${n}`, s, box.send) as Player & { box: typeof box };
  p.box = box;
  return p;
}
type Ctx = { m: Muster; started: MusterEntry[][]; notified: string[][]; online: Map<string, Player>; busy: Map<string, string> };
function muster(cfg: Partial<ConstructorParameters<typeof Muster>[0]> = {}): Ctx {
  const online = new Map<string, Player>(), busy = new Map<string, string>();
  const started: MusterEntry[][] = [], notified: string[][] = [];
  const m = new Muster(
    { minLevel: 80, maxPlayers: 5, ms: () => 60000, ...cfg },
    (k) => online.get(k),
    (list) => void started.push(list),
    (keys) => void notified.push(keys),
    (k) => busy.get(k) ?? null,
  );
  return { m, started, notified, online, busy };
}
const reg = (c: Ctx, ...ps: Player[]) => { for (const p of ps) c.online.set(p.name.toLowerCase(), p); return ps; };

section("Сбор (Muster): запись и отказы");

await test("запись: герой в списке, таймер от первого, лидер — первый вставший", () => {
  const c = muster();
  const [a, b] = reg(c, mk(), mk("healer"));
  assert.equal(c.m.join([a], 1000), null);
  assert.equal(c.m.startAt, 1000 + 60000);
  assert.equal(c.m.join([b], 5000), null);
  assert.equal(c.m.startAt, 61000, "второй не сдвигает таймер");
  assert.equal(c.m.leader, a.name);
  assert.deepEqual(c.m.list.map((e) => e.role), ["tank", "healer"]);
});

await test("отказ: низкий уровень, мёртвый, занят, чужая фракция — список не меняется", () => {
  const c = muster({ faction: "solgard", factionText: "Сольгард" });
  const low = mk("warrior", 79), dead = mk(), busy = mk(), foe = mk("deathknight");
  dead.dead = true;
  c.busy.set(busy.name.toLowerCase(), "в очереди арены");
  reg(c, low, dead, busy, foe);
  for (const p of [low, dead, busy, foe]) assert.ok(c.m.join([p]), `${p.name} записан`);
  assert.equal(c.m.join([foe]), "Сольгард");
  assert.equal(c.m.join([busy]), "в очереди арены");
  assert.equal(c.m.list.length, 0);
  assert.equal(c.m.startAt, 0);
  assert.equal(c.notified.length, 0, "отказ никого не оповещает");
});

await test("группа входит целиком; один негодный — вся группа не входит, причина с именем", () => {
  const c = muster();
  const [a, b, low] = reg(c, mk(), mk(), mk("mage", 50));
  const err = c.m.join([a, b, low]);
  assert.ok(err && err.startsWith(low.name + ":"), String(err));
  assert.equal(c.m.list.length, 0);
  assert.equal(c.m.join([a, b]), null);
  assert.equal(c.m.list.length, 2);
});

await test("повторная запись — отказ без дубля", () => {
  const c = muster();
  const [a] = reg(c, mk());
  c.m.join([a]);
  assert.ok(c.m.join([a]));
  assert.equal(c.m.list.length, 1);
});

await test("лимит: группа сверх мест — отказ целиком; ровно до лимита — сразу старт", () => {
  const c = muster({ maxPlayers: 4 });
  const ps = reg(c, mk(), mk(), mk(), mk(), mk());
  c.m.join([ps[0], ps[1]]);
  c.m.join([ps[2]]);
  assert.ok(c.m.join([ps[3], ps[4]]), "переполнение пропущено");
  assert.equal(c.m.list.length, 3);
  assert.equal(c.started.length, 0);
  assert.equal(c.m.join([ps[3]]), null);
  assert.equal(c.started.length, 1, "полный сбор стартует сразу");
  assert.equal(c.started[0].length, 4);
  assert.equal(c.m.list.length, 0);
  assert.equal(c.m.startAt, 0);
});

await test("лимит мирового босса — 40 на фракцию (data/world-bosses.json), рейда — 20", () => {
  assert.equal(WB.muster.maxPlayers, 40);
  assert.equal(RAID_CFG.maxPlayers, 20);
  const c = muster({ maxPlayers: WB.muster.maxPlayers, faction: "solgard" });
  const ps = reg(c, ...Array.from({ length: 41 }, () => mk("ranger")));
  for (let i = 0; i < 39; i++) assert.equal(c.m.join([ps[i]]), null);
  assert.ok(c.m.join([ps[39], ps[40]]), "41-й прошёл");
  assert.equal(c.m.join([ps[39]]), null);
  assert.equal(c.started.length, 1);
  assert.equal(c.started[0].length, 40);
});

section("Сбор: выход, лидер, таймер");

await test("выход: лидерство переходит к следующему; ушёл последний — таймер сброшен; чужой ключ — без оповещения", () => {
  const c = muster();
  const [a, b] = reg(c, mk(), mk());
  c.m.join([a]); c.m.join([b]);
  const n0 = c.notified.length;
  c.m.cancel("нет-такого");
  assert.equal(c.notified.length, n0);
  c.m.cancel(a.name.toLowerCase());
  assert.equal(c.m.leader, b.name);
  assert.ok(c.notified.at(-1)!.includes(a.name.toLowerCase()), "ушедшему не пришло обновление");
  c.m.cancel(b.name.toLowerCase());
  assert.equal(c.m.list.length, 0);
  assert.equal(c.m.startAt, 0);
});

await test("startNow: только лидер; пустой сбор — отказ; лидер — старт со всеми", () => {
  const c = muster();
  const [a, b] = reg(c, mk(), mk());
  assert.ok(c.m.startNow(a.name.toLowerCase()), "пустой сбор стартовал");
  c.m.join([a]); c.m.join([b]);
  assert.ok(c.m.startNow(b.name.toLowerCase()), "не лидер начал");
  assert.equal(c.started.length, 0);
  assert.equal(c.m.startNow(a.name.toLowerCase()), null);
  assert.equal(c.started.length, 1);
  assert.deepEqual(c.started[0].map((e) => e.name), [a.name, b.name]);
});

await test("tick: до таймера ждёт, по таймеру — старт; ушедшие из мира выбывают до старта", () => {
  const c = muster();
  const [a, b] = reg(c, mk(), mk());
  c.m.join([a], 0); c.m.join([b], 0);
  c.m.tick(30000);
  assert.equal(c.started.length, 0);
  c.online.delete(b.name.toLowerCase());
  c.m.tick(60000);
  assert.equal(c.started.length, 1);
  assert.deepEqual(c.started[0].map((e) => e.name), [a.name], "ушедший попал в состав");
});

await test("tick: все ушли — старта нет, сбор пуст", () => {
  const c = muster();
  const [a] = reg(c, mk());
  c.m.join([a], 0);
  c.online.clear();
  c.m.tick(120000);
  assert.equal(c.started.length, 0);
  assert.equal(c.m.list.length, 0);
});

section("Автосбор по ролям");

const ents = (roles: Record<RaidRole, number>) => RAID_ROLES.flatMap((r) => Array.from({ length: roles[r] }, (_, i) => ({ role: r, name: `${r}${i}` })));

await test("need: добирает недостающие роли до состава рейда (боты), сумма = size − игроков", () => {
  const empty = RaidMuster.fill([]);
  assert.equal(RAID_ROLES.reduce((a, r) => a + empty[r], 0), RAID_CFG.size);
  const list = ents({ tank: 2, healer: 0, melee: 6, ranged: 0 });
  const need = RaidMuster.fill(list);
  assert.equal(need.tank, 0, "танков хватает");
  assert.ok(need.healer >= 1, "лекарей не добирает");
  assert.equal(RAID_ROLES.reduce((a, r) => a + need[r], 0), RAID_CFG.size - list.length);
  const over = RaidMuster.fill(ents({ tank: 5, healer: 5, melee: 5, ranged: 5 }));
  assert.equal(RAID_ROLES.reduce((a, r) => a + over[r], 0), 0, "полный состав — без ботов");
});

await test("squads: 40 героев → 2 отряда по 20; танки и лекари поровну", () => {
  const list = ents({ tank: 4, healer: 6, melee: 15, ranged: 15 });
  const sq = Muster.squads(list, WB.muster.squad as [number, number]);
  assert.equal(sq.length, 2);
  assert.deepEqual(sq.map((s) => s.length), [20, 20]);
  for (const s of sq) {
    assert.equal(s.filter((e) => e.role === "tank").length, 2);
    assert.equal(s.filter((e) => e.role === "healer").length, 3);
  }
  assert.equal(new Set(sq.flat()).size, 40, "кто-то потерян или задвоен");
});

await test("squads: хвост меньше минимума не дробится в отдельный отряд; пусто — нет отрядов", () => {
  assert.deepEqual(Muster.squads([], [10, 20]), []);
  const one = Muster.squads(ents({ tank: 1, healer: 1, melee: 3, ranged: 0 }), [10, 20]);
  assert.equal(one.length, 1);
  const s21 = Muster.squads(ents({ tank: 1, healer: 2, melee: 9, ranged: 9 }), [10, 20]);
  assert.equal(s21.length, 2);
  assert.ok(s21.every((s) => s.length >= 10), s21.map((s) => s.length).join("/"));
});

await test("RaidMuster.status: open/joined/leader/bots для своего и чужого", () => {
  const online = new Map<string, Player>();
  const rm = new RaidMuster((k) => online.get(k), () => {}, () => {}, () => null);
  const a = mk("warrior", 90), b = mk("mage", 70);
  online.set(a.name.toLowerCase(), a);
  rm.join([a], 0);
  const sa = rm.status(a, a.name.toLowerCase(), 0), sb = rm.status(b, b.name.toLowerCase(), 0);
  assert.ok(sa.open && sa.joined && sa.leader === a.name);
  assert.equal(sa.bots, RAID_CFG.size - 1);
  assert.ok(!sb.joined && sb.why !== "", "низкий уровень без причины");
  assert.equal(raidRole("mage"), "ranged");
});

section("Планировщик: объявления и лента");

await test("Announcer: 30/10/1 мин — по одному объявлению; повтор того же порога молчит", () => {
  const a = new Announcer([30, 10, 1]);
  assert.equal(a.first, 30);
  assert.equal(a.due(45 * MIN), null);
  assert.equal(a.due(30 * MIN), 30);
  assert.equal(a.due(29 * MIN), null);
  assert.equal(a.due(10 * MIN - 1), 10);
  assert.equal(a.due(5 * MIN), null);
  assert.equal(a.due(30 * 1000), 1);
  assert.equal(a.due(10 * 1000), null);
});

await test("Announcer: сервер поднялся за 5 мин — одно объявление «через 5 мин»; после начала — ничего; reset — снова", () => {
  const a = new Announcer([30, 10, 1]);
  assert.equal(a.due(5 * MIN), 5);
  assert.equal(a.due(4 * MIN), null);
  const b = new Announcer([30, 10, 1]);
  assert.equal(b.due(0), null);
  assert.equal(b.due(-MIN), null);
  b.reset();
  assert.equal(b.due(30 * MIN), 30);
});

const fakeWorld = () => {
  const players = new Map<string, Player>();
  const sent: { type: string; msg: unknown }[] = [];
  return { players, sent, broadcast: (type: string, msg: unknown) => void sent.push({ type, msg }) };
};

await test("EventClock.feed: идущие первыми, потом по времени; упавший источник не ломает ленту", () => {
  const w = fakeWorld();
  const c = new EventClock(w as never, 1000);
  const e = (id: string, at: number, live = false): ClockEvent => ({ id, kind: "event", name: id, at, live });
  c.register("a", () => [e("late", 300), e("soon", 100)]);
  c.register("b", () => { throw new Error("сломался"); });
  c.register("c", () => [e("now", 500, true)]);
  const orig = console.error; console.error = () => {};
  try {
    assert.deepEqual(c.feed().map((x) => x.id), ["now", "soon", "late"]);
    assert.equal(c.next()?.id, "now");
  } finally { console.error = orig; }
});

await test("EventClock.say: only — только своей фракции, chat:false — без чата", () => {
  const w = fakeWorld();
  const s = mk("warrior"), u = mk("deathknight");
  w.players.set(s.id, s); w.players.set(u.id, u);
  const c = new EventClock(w as never);
  c.say("Скоро битва", { only: "solgard", from: "Глашатай" });
  assert.equal(s.box.msgs.filter((m) => m.type === "event:say").length, 1);
  assert.equal(s.box.msgs.find((m) => m.type === "chat")?.msg.text, "Глашатай: Скоро битва");
  assert.equal(u.box.msgs.length, 0, "чужой фракции пришло");
  c.say("Тихо", { chat: false });
  assert.equal(u.box.msgs.filter((m) => m.type === "chat").length, 0);
  assert.equal(u.box.msgs.filter((m) => m.type === "event:say").length, 1);
});

await test("EventClock.update: не чаще everyMs; без изменений — молчит до 4×everyMs", () => {
  const w = fakeWorld();
  let at = 100;
  const c = new EventClock(w as never, 1000);
  c.register("a", () => [{ id: "x", kind: "war", name: "x", at, live: false }]);
  c.update(1000);
  assert.equal(w.sent.length, 1);
  c.update(1500);
  assert.equal(w.sent.length, 1, "чаще everyMs");
  c.update(2100);
  assert.equal(w.sent.length, 1, "без изменений разослано");
  at = 200;
  c.update(2200);
  assert.equal(w.sent.length, 2, "изменение не разослано");
  c.update(2200 + 4000);
  assert.equal(w.sent.length, 3, "контрольная рассылка через 4×everyMs");
});

section("Расписания");

const colossus = WB_BOSSES.find((b) => b.trigger.kind === "schedule")!;
const day = (d: number, h: number, mi = 0) => new Date(2026, 9, d, h, mi).getTime(); // октябрь 2026

await test("мировой босс: окно строго позже after, появление в пределах jitter после отметки", () => {
  for (const after of [day(28, 0), day(28, 12, 59), day(28, 13), day(28, 18, 31), day(28, 23, 30)]) {
    const w = wbNextWindow(colossus, after);
    assert.ok(w.mark > after, new Date(after).toString());
    assert.ok(w.at >= w.mark && w.at <= w.mark + (colossus.trigger.jitterMin ?? 0) * MIN);
    assert.equal(wbNextWindow(colossus, after).at, w.at, "окно недетерминировано");
  }
  assert.equal(new Date(wbNextWindow(colossus, day(28, 23, 30)).mark).getDate(), 29);
});

await test("мировой босс: случайный триггер — через everyH от прошлого, не раньше чем через минуту", () => {
  const def: WbBossDef = { ...colossus, trigger: { kind: "random", everyH: [3, 6] } } as WbBossDef;
  const last = day(28, 10);
  const w = wbNextWindow(def, last, last);
  assert.ok(w.at >= last + 3 * H && w.at <= last + 6 * H, `${(w.at - last) / H} ч`);
  assert.equal(w.mark, w.at);
  const late = wbNextWindow(def, last + 10 * H, last);
  assert.ok(late.at >= last + 10 * H + MIN, "окно в прошлом");
});

await test("сутки добычи начинаются в dayResetHour", () => {
  const r = WB.lockout.dayResetHour;
  assert.notEqual(wbDayKey(day(28, r) - 1), wbDayKey(day(28, r)));
  assert.equal(wbDayKey(day(28, r)), wbDayKey(day(29, r) - 1));
});

await test("«Час войны»: начало строго позже; неделя — с понедельника; подъём не быстрее предела перевеса", () => {
  for (let h = 0; h < 24 * 8; h += 5) {
    const t = day(26, 0) + h * H;
    assert.ok(nextWarStart(t) > t);
    assert.ok(nextWarStart(t) - t <= 2 * 24 * H, "дыра в расписании больше 2 суток");
  }
  assert.equal(new Date(day(26, 0)).getDay(), 1, "26.10.2026 — понедельник");
  assert.equal(weekKey(day(26, 0)), weekKey(day(26 + 6, 23, 59)), "воскресенье в другой неделе");
  assert.notEqual(weekKey(day(26, 0)), weekKey(day(26, 0) - 1));
  for (const k of ["side", "heart"] as const) {
    for (let n = 1; n < 10; n++) assert.ok(raiseSec(k, n + 1) <= raiseSec(k, n), `${k}: ${n}`);
    assert.equal(raiseSec(k, 0), raiseSec(k, 1), "перевес 0 считается как 1");
    assert.equal(raiseSec(k, 99), raiseSec(k, WAR.capture.maxEdge));
  }
});

await test("осада: по расписанию data/siege.json, строго позже", () => {
  const [hh, mm] = SIEGE.schedule.time.split(":").map(Number);
  for (let d = 20; d < 30; d++) {
    const s = nextSiegeStart(day(d, 12));
    assert.equal(new Date(s).getDay(), SIEGE.schedule.day);
    assert.equal(new Date(s).getHours(), hh);
    assert.equal(new Date(s).getMinutes(), mm);
    assert.ok(s > day(d, 12) && s - day(d, 12) <= 7 * 24 * H);
  }
  const s0 = nextSiegeStart(day(25, 12));
  assert.ok(nextSiegeStart(s0) > s0, "в момент начала — то же время");
});

done();
