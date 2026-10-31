/**
 * Админка без сервера (server/src/game/admin.ts): права читаются из БД (accounts.admin) на каждое действие — не-админ, понижённый
 * админ, подделанный флаг клиента (p.admin), повышение без перезахода, журнал отказов с ограничением частоты; проверка значений
 * admin:give (редкость, уровень, заточка, количество, id прототипа), полная сумка, золото не уходит в минус.
 * Запуск: npx tsx tests/unit/admin.ts
 */
import { registerAdmin } from "../../server/src/game/admin";
import type { WorldRoom } from "../../server/src/rooms/WorldRoom";
import type { GameDB } from "../../server/src/db";
import type { Player } from "../../server/src/game/Player";
import { MAX_LEVEL } from "../../shared/constants";
import { BASE_ITEMS } from "../../shared/items";
import { MAX_PLUS } from "../../shared/upgrade";
import { assert, done, section, test } from "./lib";
import { countIn, drop, emptyBag, fillBag, hero, memDb, register, world, type Hero } from "./fixtures";

const w = world();
const quietWarn = <T>(fn: () => T): T => { const o = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = o; } };

function setup() {
  const db = memDb();
  const handlers = new Map<string, (p: Player, m: unknown) => void>();
  const room = { db: () => db, world: w, clients: { getById: () => ({ leave: () => {} }) }, broadcast: () => {} } as unknown as WorldRoom;
  registerAdmin(room, ((type: string, fn: (p: Player, m: unknown) => void) => void handlers.set(type, fn)) as never);
  const send = (p: Player, type: string, m: unknown = {}) => quietWarn(() => handlers.get(type)!(p, m));
  return { db, send, handlers };
}
function mk(db: GameDB, admin = false): Hero {
  const p = hero(w);
  emptyBag(p);
  register(db, p);
  if (admin) db.setAccountAdmin(p.name, true);
  return p;
}
const logRows = (db: GameDB, action: string) => db.adminLogRows("").filter((r) => r.action === action);
const snap = (p: Player) => JSON.stringify({ inv: p.save.inventory, gold: p.save.gold, lvl: p.save.level, xp: p.save.xp, mounts: p.save.mounts ?? [] });

section("Админка: права из БД на каждое действие");

await test("все admin:* зарегистрированы; не-админ: ни одно действие не меняет цель, флаг p.admin снимается", () => {
  const { db, send, handlers } = setup();
  const p = mk(db), t = mk(db);
  assert.ok(handlers.size >= 15, `обработчиков ${handlers.size}`);
  const s = snap(t);
  send(p, "admin:gold", { name: t.name, v: 1_000_000 });
  send(p, "admin:give", { name: t.name, base: "sword", qty: 5 });
  send(p, "admin:xp", { name: t.name, level: 90 });
  send(p, "admin:give", { name: t.name, mount: "boar" });
  assert.equal(snap(t), s);
  assert.equal(p.admin, false);
  assert.equal(p.box.msgs.length, 0, "не-админу не отвечают");
  drop(w, p, t);
});

await test("подделанный флаг клиента (p.admin = true) без права в БД — отказ, флаг сбрасывается", () => {
  const { db, send } = setup();
  const p = mk(db), t = mk(db);
  p.admin = true;
  const g = t.save.gold;
  send(p, "admin:gold", { name: t.name, v: 500 });
  assert.equal(t.save.gold, g);
  assert.equal(p.admin, false);
  drop(w, p, t);
});

await test("бан и разбан от не-админа не пишутся в базу", () => {
  const { db, send } = setup();
  const p = mk(db), t = mk(db);
  send(p, "admin:ban", { name: t.name, hours: 10, reason: "x" });
  assert.equal(db.banOf(t.name), null);
  db.setBan(t.name, Date.now() + 3600_000, "real");
  send(p, "admin:unban", { name: t.name });
  assert.ok(db.banOf(t.name), "не-админ снял бан");
  drop(w, p, t);
});

await test("админ: золото выдаётся, действие пишется в журнал; флаг p.admin ставится по БД", () => {
  const { db, send } = setup();
  const a = mk(db, true), t = mk(db);
  t.save.gold = 10;
  send(a, "admin:gold", { name: t.name, v: 500 });
  assert.equal(t.save.gold, 510);
  assert.equal(a.admin, true);
  assert.equal(logRows(db, "gold").length, 1);
  drop(w, a, t);
});

await test("понижённый админ: после снятия права в БД следующее же действие отклоняется (без перезахода)", () => {
  const { db, send } = setup();
  const a = mk(db, true), t = mk(db);
  t.save.gold = 0;
  send(a, "admin:gold", { name: t.name, v: 100 });
  assert.equal(t.save.gold, 100);
  db.setAccountAdmin(a.name, false);
  send(a, "admin:gold", { name: t.name, v: 100 });
  assert.equal(t.save.gold, 100, "понижённый админ выдал золото");
  assert.equal(a.admin, false);
  db.setAccountAdmin(a.name, true);
  send(a, "admin:gold", { name: t.name, v: 1 });
  assert.equal(t.save.gold, 101, "повышение не подхватилось без перезахода");
  drop(w, a, t);
});

await test("право — у аккаунта: действует для всех его героев; players.admin не читается", () => {
  const { db, send } = setup();
  const a = mk(db, true), t = mk(db);
  const alt = hero(w);
  db.createChar(a.accountId!, alt.name, alt.save);
  alt.accountId = a.accountId;
  t.save.gold = 0;
  send(alt, "admin:gold", { name: t.name, v: 7 });
  assert.equal(t.save.gold, 7);
  const x = mk(db);
  db.raw.prepare("UPDATE players SET admin = 1 WHERE name_key = ?").run(x.name.toLowerCase());
  send(x, "admin:gold", { name: t.name, v: 7 });
  assert.equal(t.save.gold, 7, "players.admin дал права");
  drop(w, a, t, alt, x);
});

await test("журнал отказов: одна запись на игрока и тип за 10 с, разные типы — отдельно", () => {
  const { db, send } = setup();
  const p = mk(db), t = mk(db);
  for (let i = 0; i < 20; i++) send(p, "admin:gold", { name: t.name, v: 1 });
  send(p, "admin:players");
  assert.equal(logRows(db, "denied:admin:gold").length, 1);
  assert.equal(logRows(db, "denied:admin:players").length, 1);
  drop(w, p, t);
});

section("Админка: проверка значений admin:give и золота");

await test("неверные числа (редкость 3 у обычной вещи, ур. 0 и > MAX, заточка > MAX_PLUS, кол-во 0 и 100, дробь, строка) — ничего не выдано", () => {
  const { db, send } = setup();
  const a = mk(db, true), t = mk(db);
  const s = snap(t);
  for (const bad of [{ rarity: 3 }, { ilvl: 0 }, { ilvl: MAX_LEVEL + 1 }, { plus: MAX_PLUS + 1 }, { qty: 0 }, { qty: 100 }, { qty: 1.5 }, { rarity: "2" }, { equip: "yes" }, { plus: -1 }])
    send(a, "admin:give", { name: t.name, base: "sword", ...bad });
  assert.equal(snap(t), s);
  const res = a.box.msgs.filter((m) => m.type === "admin:give:result");
  assert.equal(res.length, 10);
  assert.ok(res.every((m) => m.msg.kind === "error" && m.msg.given === 0));
  drop(w, a, t);
});

await test("id прототипа и несуществующие (__proto__, constructor, toString, mount __proto__) — отказ без исключения", () => {
  const { db, send } = setup();
  const a = mk(db, true), t = mk(db);
  const s = snap(t);
  for (const k of ["base", "model", "unique", "legendary", "mount"]) for (const id of ["__proto__", "constructor", "toString", "no_such_item"]) send(a, "admin:give", { name: t.name, [k]: id });
  assert.equal(snap(t), s);
  drop(w, a, t);
});

await test("выдача стопки: долив до предела, лишнее — «не влезло»; полная сумка — ничего не выдано", () => {
  const { db, send } = setup();
  const a = mk(db, true), t = mk(db);
  const max = BASE_ITEMS.hp_potion.stack!;
  fillBag(t);
  t.save.inventory[0] = { ...t.save.inventory[0]!, base: "hp_potion", qty: max - 2, stats: {} };
  send(a, "admin:give", { name: t.name, base: "hp_potion", qty: 5 });
  assert.equal(countIn(t.save.inventory, "hp_potion"), max, "долито не до предела");
  const r = a.box.msgs.filter((m) => m.type === "admin:give:result").pop()!.msg;
  assert.equal(r.given, 2);
  assert.equal(r.kind, "warn");
  const s = snap(t);
  send(a, "admin:give", { name: t.name, base: "sword" });
  assert.equal(snap(t), s);
  assert.equal(a.box.msgs.filter((m) => m.type === "admin:give:result").pop()!.msg.given, 0);
  drop(w, a, t);
});

await test("золото: не уходит ниже 0; 0, NaN, строка — отказ; цель не в сети — отказ", () => {
  const { db, send } = setup();
  const a = mk(db, true), t = mk(db);
  t.save.gold = 50;
  send(a, "admin:gold", { name: t.name, v: -1000 });
  assert.equal(t.save.gold, 0);
  for (const v of [0, NaN, "100", null]) send(a, "admin:gold", { name: t.name, v });
  assert.equal(t.save.gold, 0);
  send(a, "admin:gold", { name: "НетТакого", v: 100 });
  assert.equal(logRows(db, "gold").length, 1, "отказы попали в журнал как действия");
  drop(w, a, t);
});

await test("admin:xp поднимает до уровня; маунт выдаётся один раз (повтор — предупреждение, без дубля)", () => {
  const { db, send } = setup();
  const a = mk(db, true), t = mk(db);
  t.save.level = 10;
  t.save.xp = 0;
  send(a, "admin:xp", { name: t.name, level: 20 });
  assert.equal(t.level, 20);
  t.save.mounts = [];
  send(a, "admin:give", { name: t.name, mount: "boar" });
  send(a, "admin:give", { name: t.name, mount: "boar" });
  assert.deepEqual(t.save.mounts, ["boar"]);
  const res = a.box.msgs.filter((m) => m.type === "admin:give:result").map((m) => m.msg.kind);
  assert.deepEqual(res, ["info", "warn"]);
  drop(w, a, t);
});

done();
