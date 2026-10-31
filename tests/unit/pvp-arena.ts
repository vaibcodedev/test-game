/**
 * Арена без сервера: очередь и подбор (server/src/arena/queue.ts — запись, отказы, окно рейтинга, 2×2 из одиночек своей фракции,
 * подтверждение, отказ и молчание, запрет повтора соперников), хранилище (server/src/arena/store.ts — матч одной транзакцией,
 * рейтинг, история, сезон и награды), Elo и ранги, запреты арены (shared/arena.ts — предметы, маунт, питомец; призывы — только умениями).
 * Запуск: npx tsx tests/unit/pvp-arena.ts
 */
process.env.ARENA_BOT_WAIT_MS = "600000"; // бой с ботом здесь не предлагается (кроме отдельной проверки)
import { DatabaseSync } from "node:sqlite";
import { Player, newSave } from "../../server/src/game/Player";
import { ArenaQueue, type PendingMatch } from "../../server/src/arena/queue";
import { ArenaStore, type MatchRecord } from "../../server/src/arena/store";
import {
  ACCEPT_MS, ARENA_BLOCKED_MSGS, MAX_REPEAT, QUEUE_WINDOW_BASE, QUEUE_WINDOW_EVERY_MS, QUEUE_WINDOW_MAX, RANKS, SEASON_RESET_KEEP, START_RATING,
  arenaBlocked, eloDelta, eloExpected, queueWindow, rankOf, type ArenaMode,
} from "../../shared/arena";
import type { ClassId } from "../../shared/classes";
import { assert, done, inbox, section, test } from "./lib";

let uid = 0;
type P = Player & { box: ReturnType<typeof inbox> };
function mk(cls: ClassId = "warrior", level = 50): P {
  const box = inbox();
  const s = newSave(cls, { x: 0, y: 0 });
  s.level = level;
  const n = ++uid;
  const p = new Player(`a${n}`, `Боец${n}`, s, box.send) as P;
  p.box = box;
  return p;
}
const key = (p: Player) => p.name.toLowerCase();
function setup() {
  const store = new ArenaStore(new DatabaseSync(":memory:"));
  const online = new Map<string, P>();
  const started: PendingMatch[] = [];
  const q = new ArenaQueue(store, (k) => online.get(k), (m) => void started.push(m), () => {});
  const add = (...ps: P[]) => { for (const p of ps) online.set(key(p), p); return ps; };
  return { store, q, started, add, online };
}
const rec = (mode: ArenaMode, season: number, a: Player, b: Player, aWins = true): MatchRecord => ({
  mode, season, started: Date.now(), durationMs: 30000, winner: aWins ? 0 : 1, reason: "kill",
  players: [
    { nameKey: key(a), name: a.name, cls: a.cls, team: 0, result: aWins ? "win" : "loss", ratingBefore: 1000, ratingAfter: aWins ? 1016 : 984, damage: 1, healing: 0, kills: aWins ? 1 : 0, deaths: aWins ? 0 : 1, left: false },
    { nameKey: key(b), name: b.name, cls: b.cls, team: 1, result: aWins ? "loss" : "win", ratingBefore: 1000, ratingAfter: aWins ? 984 : 1016, damage: 1, healing: 0, kills: aWins ? 0 : 1, deaths: aWins ? 1 : 0, left: false },
  ],
});

section("Elo, окно и ранги");

await test("Elo: равные — ±K/2, сумма изменений 0, слабый за победу получает больше", () => {
  assert.equal(eloExpected(1000, 1000), 0.5);
  assert.equal(eloDelta(1000, 1000, 1), -eloDelta(1000, 1000, 0));
  assert.equal(eloDelta(1000, 1000, 0.5), 0);
  assert.ok(eloDelta(900, 1300, 1) > eloDelta(1300, 900, 1));
  assert.ok(eloDelta(1300, 900, 1) >= 0 && eloDelta(1300, 900, 0) < 0);
});

await test("окно рейтинга растёт со временем ожидания и упирается в максимум", () => {
  assert.equal(queueWindow(0), QUEUE_WINDOW_BASE);
  let last = 0;
  for (let t = 0; t < 1e7; t += QUEUE_WINDOW_EVERY_MS) { const w = queueWindow(t); assert.ok(w >= last); last = w; }
  assert.equal(last, QUEUE_WINDOW_MAX);
});

await test("ранги: по порогам, ниже первого — первый; порядок порогов возрастает", () => {
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].min > RANKS[i - 1].min);
  assert.equal(rankOf(-50).id, RANKS[0].id);
  for (const r of RANKS) { assert.equal(rankOf(r.min).id, r.id); if (r.min > 0) assert.notEqual(rankOf(r.min - 1).id, r.id); }
});

await test("запреты арены: предметы, маунт и питомец — нельзя; умения (в том числе призывы) — можно", () => {
  assert.ok(arenaBlocked({ i: "hp_potion" }));
  assert.ok(arenaBlocked({ a: "mount" }) && arenaBlocked({ a: "pet" }));
  assert.ok(!arenaBlocked({ s: "wl_skeletons" }), "призыв умением запрещён");
  assert.ok(!arenaBlocked({ a: "attack" }) && !arenaBlocked(null) && !arenaBlocked(undefined));
  for (const t of ["use", "use:base", "equip", "pickup", "mount:toggle", "pet:toggle", "pet:select"]) assert.ok((ARENA_BLOCKED_MSGS as readonly string[]).includes(t), t);
});

section("Очередь");

await test("1×1: два близких по рейтингу — матч найден обоим, из очереди ушли", () => {
  const s = setup();
  const [a, b] = s.add(mk(), mk("deathknight"));
  assert.equal(s.q.join([a], "1v1", 0), null);
  assert.equal(s.q.join([b], "1v1", 0), null);
  s.q.tick(1);
  assert.equal(s.q.entries.length, 0);
  assert.equal(s.q.pending.size, 1);
  assert.ok(a.box.msgs.some((m) => m.type === "arena:found") && b.box.msgs.some((m) => m.type === "arena:found"));
});

await test("отказы записи: повторно, мёртвым, группа больше режима, разные фракции в группе", () => {
  const s = setup();
  const [a, b, c, d] = s.add(mk(), mk(), mk(), mk("deathknight"));
  s.q.join([a], "1v1");
  assert.ok(s.q.join([a], "1v1"), "повторно");
  assert.ok(s.q.join([a], "2v2"), "в другом режиме, уже стоя в очереди");
  b.dead = true;
  assert.ok(s.q.join([b], "1v1"), "мёртвым");
  assert.ok(s.q.join([b, c, d], "2v2"), "трое в 2×2");
  b.dead = false;
  assert.ok(s.q.join([c, d], "2v2"), "разные фракции");
  assert.equal(s.q.entries.length, 1);
});

await test("далёкие по рейтингу не сводятся сразу, но сводятся, когда окно вырастет", () => {
  const s = setup();
  const [a, b] = s.add(mk(), mk());
  s.store.setRating(key(a), a.name, a.cls, "1v1", 1000);
  s.store.setRating(key(b), b.name, b.cls, "1v1", 1000 + QUEUE_WINDOW_BASE + 120);
  s.q.join([a], "1v1", 0); s.q.join([b], "1v1", 0);
  s.q.tick(1);
  assert.equal(s.q.pending.size, 0, "свели при разнице больше окна");
  s.q.tick(QUEUE_WINDOW_EVERY_MS * 3);
  assert.equal(s.q.pending.size, 1);
});

await test("подтверждение: все приняли — бой начат; повторное принятие ничего не ломает", () => {
  const s = setup();
  const [a, b] = s.add(mk(), mk());
  s.q.join([a], "1v1", 0); s.q.join([b], "1v1", 0); s.q.tick(1);
  s.q.accept(key(a)); s.q.accept(key(a));
  assert.equal(s.started.length, 0);
  s.q.accept(key(b));
  assert.equal(s.started.length, 1);
  assert.equal(s.q.pending.size, 0);
  assert.ok(!s.q.busy(key(a)) && !s.q.busy(key(b)));
});

await test("отказ одного: он выбывает, второй возвращается в очередь со старым временем", () => {
  const s = setup();
  const [a, b] = s.add(mk(), mk());
  s.q.join([a], "1v1", 0); s.q.join([b], "1v1", 5);
  s.q.tick(10);
  s.q.decline(key(a));
  assert.equal(s.started.length, 0);
  assert.ok(!s.q.busy(key(a)));
  assert.equal(s.q.entryOf(key(b))?.joinedAt, 5);
  assert.ok(b.box.msgs.some((m) => m.type === "arena:cancelled"));
});

await test("молчание дольше ACCEPT_MS — молчащий выбывает, принявший остаётся в очереди", () => {
  const s = setup();
  const [a, b] = s.add(mk(), mk());
  s.q.join([a], "1v1", 0); s.q.join([b], "1v1", 0);
  s.q.tick(1);
  s.q.accept(key(a));
  s.q.tick(1 + ACCEPT_MS + 1);
  assert.ok(s.q.entryOf(key(a)), "принявший выпал");
  assert.ok(!s.q.busy(key(b)), "молчащий остался");
});

await test("выход из мира (drop) во время подтверждения — матч отменён, соперник в очереди", () => {
  const s = setup();
  const [a, b] = s.add(mk(), mk());
  s.q.join([a], "1v1", 0); s.q.join([b], "1v1", 0); s.q.tick(1);
  s.q.drop(key(b));
  assert.equal(s.q.pending.size, 0);
  assert.ok(s.q.entryOf(key(a)) && !s.q.busy(key(b)));
});

await test("2×2 из одиночек: напарники только своей фракции", () => {
  const s = setup();
  const [s1, s2, u1, u2] = s.add(mk(), mk("healer"), mk("deathknight"), mk("bloodweaver"));
  for (const p of [s1, u1, s2, u2]) s.q.join([p], "2v2", 0);
  s.q.tick(1);
  assert.equal(s.q.pending.size, 1);
  const m = [...s.q.pending.values()][0];
  for (const t of m.teams) {
    const fs = new Set(t.map((e) => e.faction));
    assert.equal(fs.size, 1, "смешанная команда");
  }
});

await test("повтор: после MAX_REPEAT боёв подряд те же соперники не сводятся, подсказка в статусе", () => {
  const s = setup();
  const [a, b] = s.add(mk(), mk());
  const season = s.store.season().id;
  for (let i = 0; i < MAX_REPEAT; i++) s.store.recordMatch(rec("1v1", season, a, b, i % 2 === 0));
  s.q.join([a], "1v1", 0); s.q.join([b], "1v1", 0);
  s.q.tick(1);
  assert.equal(s.q.pending.size, 0);
  assert.ok(s.q.status(key(a), 1)?.note, "нет подсказки");
});

await test("выход из очереди группой: выходят все её участники", () => {
  const s = setup();
  const [a, b] = s.add(mk(), mk("healer"));
  s.q.join([a, b], "2v2", 0);
  s.q.cancel(key(b));
  assert.ok(!s.q.busy(key(a)) && !s.q.busy(key(b)));
});

await test("долго нет соперника — бой с ботами (без живых), отказ возвращает в очередь", () => {
  process.env.ARENA_BOT_WAIT_MS = "1000";
  try {
    const s = setup();
    const [a] = s.add(mk("warrior", 60));
    s.q.join([a], "1v1", 0);
    s.q.tick(500);
    assert.equal(s.q.pending.size, 0);
    s.q.tick(1500);
    const m = [...s.q.pending.values()][0];
    assert.ok(m?.bots && m.bots[1].length === 1, "ботов не предложили");
    s.q.decline(key(a));
    assert.ok(s.q.entryOf(key(a)), "после отказа от ботов выпал из очереди");
    s.q.tick(3000);
    assert.equal(s.q.pending.size, 0, "ботов предложили повторно");
  } finally { process.env.ARENA_BOT_WAIT_MS = "600000"; }
});

section("Хранилище: итог матча, сезон");

await test("итог матча: рейтинг и счёт победителя и проигравшего, история с обеих сторон", () => {
  const s = setup();
  const a = mk(), b = mk();
  const season = s.store.season().id;
  s.store.recordMatch(rec("1v1", season, a, b));
  assert.deepEqual({ ...s.store.rating(key(a), "1v1") }, { rating: 1016, wins: 1, losses: 0, draws: 0 });
  assert.deepEqual({ ...s.store.rating(key(b), "1v1") }, { rating: 984, wins: 0, losses: 1, draws: 0 });
  assert.equal(s.store.history(key(a))[0].enemies[0], b.name);
  assert.equal(s.store.history(key(b))[0].delta, -16);
  assert.equal(s.store.place(key(a), "1v1"), 1);
  assert.equal(s.store.top("1v1").length, 2);
  assert.equal(s.store.rating("никто", "1v1").rating, START_RATING);
});

await test("матч пишется одной транзакцией: ошибка посередине — ни матча, ни рейтинга", () => {
  const s = setup();
  const a = mk(), b = mk();
  const season = s.store.season().id;
  const bad = rec("1v1", season, a, b);
  bad.players.push({ ...bad.players[0] }); // повтор ключа игрока — нарушение PRIMARY KEY
  assert.throws(() => s.store.recordMatch(bad));
  assert.equal(s.store.history(key(a)).length, 0);
  assert.deepEqual(s.store.rating(key(a), "1v1").wins, 0);
});

await test("боты: в историю пишутся, в таблицу рейтинга — нет", () => {
  const s = setup();
  const a = mk(), b = mk();
  const r = rec("1v1", s.store.season().id, a, b);
  r.players[1].bot = true;
  s.store.recordMatch(r);
  assert.equal(s.store.top("1v1").length, 1);
  assert.equal(s.store.history(key(a))[0].bot, true);
});

await test("конец сезона: награда по рангу сыгравшим, мягкий сброс рейтинга, повторно не закрывается раньше срока", () => {
  const s = setup();
  const a = mk(), b = mk();
  const s1 = s.store.season();
  s.store.recordMatch(rec("1v1", s1.id, a, b));
  s.store.setRating(key(a), a.name, a.cls, "1v1", 1400);
  assert.equal(s.store.closeSeasonIfDue(s1.started + 1000), null, "закрыт раньше срока");
  assert.equal(s.store.closeSeasonIfDue(s1.ends + 1), s1.id);
  const rw = s.store.pendingRewards(key(a));
  assert.equal(rw.length, 1);
  assert.equal(rw[0].rank, rankOf(1400).id);
  assert.equal(s.store.rating(key(a), "1v1").rating, Math.round(START_RATING + 400 * SEASON_RESET_KEEP));
  assert.notEqual(s.store.season().id, s1.id);
  s.store.markDelivered(rw[0].id);
  assert.equal(s.store.pendingRewards(key(a)).length, 0);
});

done();
