/**
 * Миграции по PRAGMA user_version (server/src/migrations.ts): самая ранняя схема (db.ts из d3ceb3e3) → текущая;
 * повторный прогон без изменений; база без user_version, но со всеми колонками; откат упавшего шага; база новее сервера.
 * Запуск: npx tsx tests/unit/db-migrate.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { GameDB } from "../../server/src/db";
import { MIGRATIONS, migrate, schemaVersion, type Migration } from "../../server/src/migrations";
import { assert, done, section, test } from "./lib";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "emberfall-migrate-"));
const quiet = <T>(fn: () => T): T => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
const N = MIGRATIONS.length;
const cols = (d: DatabaseSync, t: string) => (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
/** Схема и все строки — для сравнения «до/после». */
function dump(d: DatabaseSync) {
  const schema = d.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string }[];
  const rows = schema.filter((s) => s.type === "table").map((s) => [s.name, d.prepare(`SELECT * FROM ${s.name} ORDER BY rowid`).all()]);
  return JSON.stringify({ schema, rows });
}

/** Схема первой версии db.ts (коммит d3ceb3e3): без админки, бана, аккаунтов, фракции и drop_log. */
function earliest(file: string) {
  const d = new DatabaseSync(file);
  d.exec(`
    CREATE TABLE players (name_key TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, cls TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE trade_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL,
      a_items TEXT NOT NULL, b_items TEXT NOT NULL, a_gold INTEGER NOT NULL, b_gold INTEGER NOT NULL);
    CREATE TABLE admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, admin TEXT NOT NULL, action TEXT NOT NULL,
      target TEXT NOT NULL, details TEXT NOT NULL);`);
  const salt = randomBytes(16).toString("hex");
  d.prepare("INSERT INTO players (name_key, name, salt, hash, cls, level, data, created, updated) VALUES ('ветеран', 'Ветеран', ?, ?, 'warrior', 7, '{\"gold\":321}', 5, 6)")
    .run(salt, scryptSync("пароль", salt, 32).toString("hex"));
  d.prepare("INSERT INTO trade_log (at, a, b, a_items, b_items, a_gold, b_gold) VALUES (1, 'a', 'b', '[]', '[]', 10, 0)").run();
  return d;
}

section("Старая схема → текущая");

await test("самая ранняя схема: все шаги, колонки, данные героя и журнал целы, аккаунт с тем же паролем, копия, user_version", () => {
  const file = path.join(tmp, "early.sqlite");
  const d = earliest(file);
  assert.equal(schemaVersion(d), 0);
  assert.deepEqual(quiet(() => migrate(d, file)), { from: 0, to: N });
  assert.equal(schemaVersion(d), N);
  for (const c of ["admin", "banned_until", "ban_reason", "account_id", "faction"]) assert.ok(cols(d, "players").includes(c), `players.${c}`);
  for (const c of ["bank", "admin"]) assert.ok(cols(d, "accounts").includes(c), `accounts.${c}`);
  for (const t of ["drop_log", "market_demand"]) assert.ok(cols(d, t).length > 0, t);
  const p = d.prepare("SELECT * FROM players").get() as Record<string, unknown>;
  assert.equal(p.level, 7); assert.equal(p.data, '{"gold":321}'); assert.equal(p.faction, "solgard"); assert.ok(Number(p.account_id) > 0);
  assert.equal((d.prepare("SELECT a_gold FROM trade_log").get() as { a_gold: number }).a_gold, 10);
  assert.ok(fs.readdirSync(tmp).some((f) => f.startsWith("early.backup-")), "нет копии перед переносом в аккаунты");
  d.close();
  const db = quiet(() => new GameDB(file));
  assert.equal(db.accountLogin("Ветеран", "пароль")?.ok, true);
  db.close();
});

await test("повторный прогон и повторное открытие — без изменений", () => {
  const file = path.join(tmp, "early.sqlite");
  const d = new DatabaseSync(file);
  const before = dump(d);
  assert.deepEqual(migrate(d, file), { from: N, to: N });
  assert.equal(dump(d), before);
  d.close();
  quiet(() => new GameDB(file)).close();
  const d2 = new DatabaseSync(file);
  assert.equal(dump(d2), before);
  d2.close();
});

await test("база без user_version, но со всеми колонками: получает текущий номер, данные и админка не тронуты", () => {
  const file = path.join(tmp, "modern.sqlite");
  const db = quiet(() => new GameDB(file));
  const id = db.raw.prepare("INSERT INTO accounts (login_key, login, salt, hash, created, admin, bank) VALUES ('гм', 'ГМ', 's', 'h', 1, 1, '{}')").run().lastInsertRowid;
  db.raw.prepare("INSERT INTO players (name_key, name, salt, hash, cls, level, data, created, updated, account_id, faction) VALUES ('гм', 'ГМ', '', '', 'mage', 3, '{}', 1, 1, ?, 'other')").run(id);
  db.raw.exec("PRAGMA user_version = 0");
  db.close();
  const d = new DatabaseSync(file);
  const before = dump(d);
  assert.deepEqual(quiet(() => migrate(d, file)), { from: 0, to: N });
  assert.equal(schemaVersion(d), N);
  assert.equal(dump(d), before, "схема или данные изменились");
  assert.ok(!fs.readdirSync(tmp).some((f) => f.startsWith("modern.backup-")), "лишняя копия");
  d.close();
});

section("Откат и защита");

await test("упавший шаг откатывается целиком: колонки нет, номер прежний; следующий запуск доводит", () => {
  const d = new DatabaseSync(":memory:");
  migrate(d, ":memory:");
  const bad: Migration = { name: "сбой", up: (x) => { x.exec("ALTER TABLE players ADD COLUMN junk INTEGER NOT NULL DEFAULT 0"); throw new Error("бум"); } };
  assert.throws(() => migrate(d, ":memory:", [...MIGRATIONS, bad]), /миграция .* «сбой»/);
  assert.equal(schemaVersion(d), N);
  assert.ok(!cols(d, "players").includes("junk"));
  const ok: Migration = { name: "проба", up: (x) => x.exec("ALTER TABLE players ADD COLUMN junk INTEGER NOT NULL DEFAULT 0") };
  assert.deepEqual(migrate(d, ":memory:", [...MIGRATIONS, ok]), { from: N, to: N + 1 });
  assert.ok(cols(d, "players").includes("junk"));
  d.close();
});

await test("база новее сервера — отказ, ничего не трогаем", () => {
  const d = new DatabaseSync(":memory:");
  d.exec(`PRAGMA user_version = ${N + 1}`);
  assert.throws(() => migrate(d, ":memory:"), /новее/);
  assert.equal((d.prepare("SELECT COUNT(*) AS n FROM sqlite_master").get() as { n: number }).n, 0);
  d.close();
});

await test("новая база в памяти — сразу текущий номер", () => {
  const db = new GameDB(":memory:");
  assert.equal(schemaVersion(db.raw), N);
  db.close();
});

fs.rmSync(tmp, { recursive: true, force: true });
done();
