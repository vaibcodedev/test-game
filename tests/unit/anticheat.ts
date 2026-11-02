/**
 * Античит без сервера: проверки входящих данных, которые клиент может подделать — вложение очков, изучение умений,
 * панели умений, чат, числа из сообщений. Дальность, откаты, скорость, чужие вещи — в economy.ts, bank-trade.ts, combat.ts.
 * Запуск: npx tsx tests/unit/anticheat.ts
 */
import { Player, newSave } from "../../server/src/game/Player";
import { cleanText, floodCheck, invalidCount, makeOn, MSG_LIMIT, num } from "../../server/src/rooms/common";
import { checkMsg, schemaOf } from "../../server/src/rooms/schemas";
import { AC, clientIp, IpLimit, makeVerifyClient, MsgRate, originOk, setSuspicionLog, SuspicionLog, versionError } from "../../server/src/anticheat";
import { GAME_VERSION } from "../../shared/version";
import { GameDB } from "../../server/src/db";
import { EventEmitter } from "node:events";
import { canLearn, SKILLS } from "../../shared/skills";
import { cleanRef } from "../../shared/hotbar";
import { statPointsAt } from "../../shared/formulas";
import { assert, done, section, test } from "./lib";

const mk = (level = 10) => {
  const s = newSave("warrior", { x: 10, y: 10 });
  s.level = level;
  return new Player("p", "Читер", s, () => {});
};

section("Очки характеристик");

await test("allocate: не больше свободных очков; 0, отрицательное и NaN — отказ без изменений", () => {
  const p = mk(10);
  const free = statPointsAt(10);
  assert.equal(p.statPoints(), free);
  assert.equal(p.allocate("str", 1e6), true);
  assert.equal(p.save.alloc.str, free, "вложено больше свободных");
  assert.equal(p.statPoints(), 0);
  assert.equal(p.allocate("vit", 1), false);
  const q = mk(10);
  for (const n of [0, -5, NaN]) assert.equal(q.allocate("agi", n), false, `n=${n}`);
  assert.deepEqual(q.save.alloc, { str: 0, agi: 0, int: 0, vit: 0 });
});

section("Умения");

await test("canLearn: без очков, сверх максимального ранга, ниже уровня, без требуемого умения — отказ", () => {
  const withReq = Object.values(SKILLS).find((s) => s.req && s.reqLevel > 1)!;
  const top = Object.values(SKILLS).find((s) => s.maxRank >= 1)!;
  assert.ok(canLearn(top, {}, 100, 0), "без очков");
  assert.ok(canLearn(top, { [top.id]: top.maxRank }, 100, 5), "сверх максимума");
  assert.ok(canLearn(withReq, {}, withReq.reqLevel - 1, 5), "ниже уровня");
  assert.ok(canLearn(withReq, {}, 100, 5), "без требуемого умения");
  assert.equal(canLearn(withReq, { [withReq.req!.id]: withReq.req!.rank }, 100, 5), null);
});

await test("панели: нельзя положить умение чужого класса, пассивку, несуществующий предмет и прототипные ключи", () => {
  const foreign = Object.values(SKILLS).find((s) => s.cls !== "warrior" && s.kind === "active")!;
  const own = Object.values(SKILLS).find((s) => s.cls === "warrior" && s.kind === "active")!;
  const passive = Object.values(SKILLS).find((s) => s.cls === "warrior" && s.kind !== "active");
  assert.deepEqual(cleanRef({ s: own.id }, "warrior"), { s: own.id });
  assert.equal(cleanRef({ s: foreign.id }, "warrior"), undefined);
  if (passive) assert.equal(cleanRef({ s: passive.id }, "warrior"), undefined);
  for (const bad of [{ s: "__proto__" }, { s: "constructor" }, { i: "sword" }, { i: "__proto__" }, { a: "hack" }, 5, "x", {}]) assert.equal(cleanRef(bad, "warrior"), undefined, JSON.stringify(bad));
  assert.equal(cleanRef(null, "warrior"), null);
});

section("Входящие данные");

await test("num: только конечные числа, обрезка в диапазон", () => {
  assert.equal(num(5, 0, 10), 5);
  assert.equal(num(-1, 0, 10), 0);
  assert.equal(num(1e308, 0, 10), 10);
  for (const v of [NaN, Infinity, -Infinity, "5", null, undefined, {}, [3]]) assert.equal(num(v, 0, 10), null, String(v));
});

await test("cleanText: вырезает управляющие и невидимые символы (подмена направления текста, нулевая ширина)", () => {
  assert.equal(cleanText("  при​вет‮\u0007  "), "привет");
  assert.equal(cleanText("⁦⁩"), "");
  assert.equal(cleanText("обычный текст 123"), "обычный текст 123");
});

section("Версия клиента");

await test("versionError: своя версия — null; старая, пустая, не строка — отказ с просьбой обновить страницу", () => {
  assert.equal(versionError(GAME_VERSION), null);
  for (const v of ["Альфа 0.0.1", "", undefined, 5, null, { v: GAME_VERSION }]) {
    const e = versionError(v);
    assert.ok(e && /обновите страницу/i.test(e), `версия ${JSON.stringify(v)} → ${e}`);
  }
});

section("Схемы сообщений");

await test("типичные сообщения клиента проходят схему", () => {
  const ok: [string, unknown][] = [
    ["input", { mx: 0.7, my: -0.7 }], ["moveTo", { x: 100, y: 200 }], ["attack", { id: null }], ["target", { id: "m12" }],
    ["skill", { id: "fireball", x: 1, y: 2, target: null, q: 400, ap: true }], ["skill", { id: "charge", x: 1, y: 2, dx: 30, dy: -4, a: 1.2, target: "m1", q: 0, ap: false }],
    ["bars:set", { bar: 1, i: 0, ref: { s: "fireball" } }], ["bars:set", { bar: 0, i: 3, ref: null }], ["bars:swap", { a: { bar: 0, i: 1 }, b: { bar: 1, i: 2 } }],
    ["chat", { text: "привет" }], ["pickup", { bag: "b17" }], ["bank:put", { index: 3, tab: 0 }], ["bank:take", { tab: 0, slot: 1, index: 4 }],
    ["smith:upgrade", { slot: "weapon" }], ["tm:apply", { shell: 2, index: 5 }], ["cancel", {}], ["trade:gold", { v: 100 }],
    ["mount:select", { id: null }], ["raid:join", { npc: "herald" }], ["drop", { gold: 40 }], ["drop", { index: "x" }],
    ["admin:give", { name: "Кто", model: "sword_6", rarity: 1, plus: 0, equip: true }], ["admin:gold", { name: "Кто", v: NaN }], ["dbg", { op: "tp", x: 1, y: 2 }],
  ];
  for (const [t, m] of ok) assert.equal(checkMsg(t, m), null, `${t} ${JSON.stringify(m)}`);
});

await test("невалидное отклоняется: лишние поля, не те типы, NaN и бесконечность, длинные строки, вложенный мусор", () => {
  const bad: [string, unknown][] = [
    ["input", { mx: NaN, my: 0 }], ["input", { mx: Infinity, my: 0 }], ["input", { mx: "1", my: 0 }], ["input", { mx: 0, my: 0, speed: 9 }],
    ["moveTo", { x: 1 }], ["attack", { id: 5 }], ["skill", { id: "x".repeat(65) }], ["skill", { x: 1, y: 2 }],
    ["chat", { text: "a".repeat(5000) }], ["chat", { text: ["a"] }], ["bank:put", { index: 1.5 }], ["swap", { a: 0, b: "1" }],
    ["bars:set", { bar: 0, i: 0, ref: { s: "fireball", extra: 1 } }], ["bars:swap", { a: { bar: 0 }, b: { bar: 1, i: 2 } }],
    ["cancel", { x: 1 }], ["trade:respond", { accept: "yes" }], ["admin:tp", { name: { $gt: "" } }], ["dbg", { v: 1 }],
  ];
  for (const [t, m] of bad) assert.notEqual(checkMsg(t, m), null, `${t} ${JSON.stringify(m)} прошло`);
});

await test("ключи прототипа: тип «__proto__»/«constructor» — без схемы и без исключения; поле __proto__ не проходит строгую схему", () => {
  for (const t of ["__proto__", "constructor", "toString"]) assert.equal(schemaOf(t), undefined, t);
  const m = JSON.parse(`{"mx":0,"my":0,"__proto__":{"admin":true}}`);
  assert.notEqual(checkMsg("input", m), null);
});

/** Поддельная комната: onMessage копит обработчики, call — как Colyseus вызывает их на входящее сообщение. */
function fakeRoom(name = "Шулер") {
  const handlers = new Map<string, (c: unknown, m: unknown) => void>();
  const room = { onMessage: (t: string, fn: (c: unknown, m: unknown) => void) => void handlers.set(t, fn) };
  const client = { sessionId: "s1", send() {}, leave() {} };
  const player = { name, inputAt: 0, send() {} };
  const world = { players: new Map([["s1", player]]), time: 0 };
  const on = makeOn(room as never, () => world as never);
  return { on, client, call: (t: string, m: unknown) => handlers.get(t)!(client, m) };
}

await test("makeOn: невалидное сообщение не доходит до обработчика, считается и пишется в журнал suspicion", () => {
  const db = new GameDB(":memory:");
  const log = new SuspicionLog(db.raw, 0);
  setSuspicionLog(log);
  try {
    const r = fakeRoom();
    let calls = 0;
    r.on<{ mx: unknown; my: unknown }>("input", () => void calls++);
    r.call("input", { mx: 1, my: 0 });
    r.call("input", { mx: "fast", my: 0 });
    r.call("input", { mx: 0, my: 0, hack: true });
    assert.equal(calls, 1, "обработчик вызван на невалидное");
    assert.equal(invalidCount.get(r.client as never), 2);
    const rows = log.rows("Шулер");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "invalid");
    assert.equal(rows[0].count, 2);
    assert.ok(rows[0].first_at > 0 && rows[0].last_at >= rows[0].first_at);
  } finally {
    setSuspicionLog(null);
    db.close();
  }
});

await test("журнал: виды раздельно, повтор копится в count, флуд из floodCheck тоже попадает", () => {
  const db = new GameDB(":memory:");
  const log = new SuspicionLog(db.raw, 0);
  setSuspicionLog(log);
  try {
    log.flag("А", "speed", "input 50,0", 1000);
    log.flag("А", "speed", "input 9,0", 2000);
    log.flag("А", "range", "pickup 900 px", 1500);
    log.flush();
    log.flag("А", "speed", "input 7,0", 3000);
    const state = new WeakMap();
    const c = { sessionId: "x", send() {}, leave() {} };
    const cfg = { windowMs: 1000, move: 2, general: 2, kickAfterWindows: 99 };
    for (let i = 0; i < 5; i++) floodCheck(state as never, c as never, "chat", 10, cfg, "Б");
    const rows = log.rows();
    const a = rows.find((r) => r.name === "А" && r.kind === "speed")!;
    assert.equal(a.count, 3);
    assert.equal(a.first_at, 1000);
    assert.equal(a.last_at, 3000);
    assert.equal(a.detail, "input 7,0");
    assert.equal(rows.find((r) => r.name === "А" && r.kind === "range")?.count, 1);
    assert.equal(rows.find((r) => r.name === "Б" && r.kind === "flood")?.count, 1, "флуд не записан (одно окно — одна запись)");
  } finally {
    setSuspicionLog(null);
    db.close();
  }
});

section("Частота отдельных сообщений (msgRate)");

await test("MsgRate: n за окно проходят, сверх — отброс; новое окно — снова; типы без правила и прототипные ключи не ограничены", () => {
  const r = new MsgRate({ "trade:request": [2, 1000] });
  assert.equal(r.check("trade:request", 0), true);
  assert.equal(r.check("trade:request", 500), true);
  assert.equal(r.check("trade:request", 900), false, "третий за окно прошёл");
  assert.equal(r.check("trade:request", 999), false);
  assert.equal(r.dropped, 2);
  assert.equal(r.check("trade:request", 1000), true, "новое окно не открылось");
  for (let i = 0; i < 100; i++) assert.equal(r.check("input", i), true, "тип без правила ограничен");
  for (const k of ["__proto__", "constructor", "toString", "hasOwnProperty"]) assert.equal(r.check(k, 0), true, k);
  const off = new MsgRate({ x: [0, 1000], y: [5, 0], z: [NaN, NaN] });
  for (let i = 0; i < 20; i++) assert.ok(off.check("x", 0) && off.check("y", 0) && off.check("z", 0), "нулевое/битое правило отбрасывает");
});

await test("MsgRate: превышение пишется в журнал flood раз за окно", () => {
  const db = new GameDB(":memory:");
  const log = new SuspicionLog(db.raw, 0);
  setSuspicionLog(log);
  try {
    const r = new MsgRate({ inspect: [1, 1000] });
    for (let i = 0; i < 10; i++) r.check("inspect", 10 + i, "Спамер");
    for (let i = 0; i < 10; i++) r.check("inspect", 2000 + i, "Спамер");
    const row = log.rows("Спамер").find((x) => x.kind === "flood");
    assert.equal(row?.count, 2, "не одна запись на окно");
    assert.match(row!.detail, /inspect/);
  } finally {
    setSuspicionLog(null);
    db.close();
  }
});

await test("makeOn: лимит типа из data/anticheat.json режет только свой тип и своё соединение", () => {
  const [max] = AC.msgRate.rules.inspect;
  const r = fakeRoom("Шпион");
  let inspects = 0, chats = 0;
  r.on<{ sid: unknown }>("inspect", () => void inspects++);
  r.on<{ text: unknown }>("chat", () => void chats++);
  for (let i = 0; i < max + 5; i++) r.call("inspect", { sid: "s2" });
  assert.equal(inspects, max, "сверх лимита дошло до обработчика");
  r.call("chat", { text: "привет" });
  assert.equal(chats, 1, "лимит одного типа задел другой");
  const r2 = fakeRoom("Сосед");
  let other = 0;
  r2.on<{ sid: unknown }>("inspect", () => void other++);
  r2.call("inspect", { sid: "s1" });
  assert.equal(other, 1, "лимит общий на всех");
});

await test("data/anticheat.json msgRate: у каждого правила есть схема сообщения, n ≥ 1, окно 0,5–60 с, лимит ниже общего", () => {
  for (const [type, rule] of Object.entries(AC.msgRate.rules)) {
    assert.ok(schemaOf(type), `нет схемы у «${type}» (опечатка в типе?)`);
    const [n, ms] = rule;
    assert.ok(Number.isInteger(n) && n >= 1, `${type}: n=${n}`);
    assert.ok(ms >= 500 && ms <= 60_000, `${type}: ms=${ms}`);
    assert.ok(n / (ms / 1000) < MSG_LIMIT.general, `${type}: не строже общего лимита — правило лишнее`);
  }
});

section("Транспорт");

await test("Origin: свой хост, список и без Origin — да; чужой сайт и мусор — нет", () => {
  assert.ok(originOk(undefined, "game.example:2567"));
  assert.ok(originOk("https://game.example:2567", "game.example:2567"));
  assert.ok(originOk("http://localhost:5173", "localhost:2567", ["http://localhost:5173"]));
  assert.ok(!originOk("https://evil.example", "game.example:2567", []));
  assert.ok(!originOk("not a url", "game.example", []));
});

await test("IP: loopback без прокси не считается; X-Forwarded-For за локальным прокси; лимит и освобождение места", () => {
  const req = (remote: string, xff?: string) => ({ socket: { remoteAddress: remote }, headers: xff ? { "x-forwarded-for": xff } : {} }) as never;
  assert.equal(clientIp(req("127.0.0.1")), "");
  assert.equal(clientIp(req("::1", "203.0.113.5, 10.0.0.1")), "203.0.113.5");
  assert.equal(clientIp(req("198.51.100.7", "1.2.3.4")), "198.51.100.7", "X-Forwarded-For от чужого адреса не доверяем");
  const lim = new IpLimit(2);
  assert.ok(lim.take("1.1.1.1") && lim.take("1.1.1.1"));
  assert.ok(!lim.take("1.1.1.1"));
  assert.ok(lim.take(""), "loopback без лимита");
  lim.give("1.1.1.1");
  assert.ok(lim.take("1.1.1.1"));
});

await test("verifyClient: чужой Origin — 403, лимит IP — 429, закрытие сокета освобождает место", () => {
  const lim = new IpLimit(1);
  const verify = makeVerifyClient(lim, []);
  const mk = (origin: string) => {
    const socket = Object.assign(new EventEmitter(), { remoteAddress: "198.51.100.9" });
    return { socket, info: { origin, secure: false, req: { socket, headers: { host: "game.example" } } as never } };
  };
  const res: unknown[][] = [];
  const cb = (...a: unknown[]) => void res.push(a);
  verify(mk("https://evil.example").info, cb);
  assert.deepEqual(res.pop()!.slice(0, 2), [false, 403]);
  const first = mk("https://game.example");
  verify(first.info, cb);
  assert.deepEqual(res.pop(), [true]);
  verify(mk("https://game.example").info, cb);
  assert.deepEqual(res.pop()!.slice(0, 2), [false, 429]);
  first.socket.emit("close");
  first.socket.emit("close");
  assert.equal(lim.count.get("198.51.100.9"), undefined, "место не освободилось (или освободилось дважды)");
  verify(mk("https://game.example").info, cb);
  assert.deepEqual(res.pop(), [true]);
});

done();
