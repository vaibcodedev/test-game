/**
 * Миграции базы по PRAGMA user_version. Каждая — отдельная транзакция с откатом; номер = индекс + 1.
 * Шаги идемпотентны (IF NOT EXISTS, колонка — только если её нет): база без user_version, но уже со всеми колонками,
 * проходит их без изменений и получает текущий номер. Новые изменения схемы — только новым шагом в конец списка.
 */
import type { DatabaseSync } from "node:sqlite";

export interface Migration {
  name: string;
  /** Вне транзакции, перед ней (VACUUM INTO в транзакции нельзя). */
  before?: (db: DatabaseSync, file: string) => void;
  up: (db: DatabaseSync) => void;
}

const cols = (db: DatabaseSync, t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
const addCol = (db: DatabaseSync, t: string, c: string, def: string) => { if (!cols(db, t).includes(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); };
/** Герои без аккаунта (старые базы: пароль на герое). */
const orphanSql = "FROM players WHERE account_id = 0 AND hash != ''";

export const MIGRATIONS: Migration[] = [
  { name: "базовые таблицы", up: (db) => db.exec(`
    CREATE TABLE IF NOT EXISTS players (name_key TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, cls TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS trade_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL,
      a_items TEXT NOT NULL, b_items TEXT NOT NULL, a_gold INTEGER NOT NULL, b_gold INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS drop_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, who TEXT NOT NULL,
      x INTEGER NOT NULL, y INTEGER NOT NULL, items TEXT NOT NULL, gold INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, admin TEXT NOT NULL, action TEXT NOT NULL,
      target TEXT NOT NULL, details TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS market_demand (key TEXT PRIMARY KEY, sold REAL NOT NULL, updated_at INTEGER NOT NULL);`) },
  { name: "админка и бан героя", up: (db) => {
    addCol(db, "players", "admin", "INTEGER NOT NULL DEFAULT 0");
    addCol(db, "players", "banned_until", "INTEGER NOT NULL DEFAULT 0");
    addCol(db, "players", "ban_reason", "TEXT NOT NULL DEFAULT ''");
  } },
  { name: "аккаунты (задача 30)", up: (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, login_key TEXT NOT NULL UNIQUE, login TEXT NOT NULL,
      salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL)`);
    addCol(db, "accounts", "bank", "TEXT NOT NULL DEFAULT ''");
    addCol(db, "players", "account_id", "INTEGER NOT NULL DEFAULT 0");
    db.exec("CREATE INDEX IF NOT EXISTS players_account ON players(account_id)");
  } },
  { name: "фракция героя (задача 38): прежние — Сольгард", up: (db) => addCol(db, "players", "faction", "TEXT NOT NULL DEFAULT 'solgard'") },
  { name: "герои без аккаунта → аккаунты (логин = имя, тот же пароль)",
    before: (db, file) => {
      if (file === ":memory:" || !(db.prepare(`SELECT 1 AS x ${orphanSql} LIMIT 1`).get())) return;
      const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
      const bak = file.replace(/(\.sqlite)?$/, `.backup-${stamp}.sqlite`);
      db.exec(`VACUUM INTO '${bak.replace(/'/g, "''")}'`);
      console.log(`[db] копия базы перед переносом в аккаунты: ${bak}`);
    },
    up: (db) => {
      const rows = db.prepare(`SELECT name_key, name, salt, hash, created ${orphanSql}`).all() as { name_key: string; name: string; salt: string; hash: string; created: number }[];
      const ins = db.prepare("INSERT INTO accounts (login_key, login, salt, hash, created) VALUES (?, ?, ?, ?, ?)");
      const upd = db.prepare("UPDATE players SET account_id = ? WHERE name_key = ?");
      const taken = db.prepare("SELECT 1 AS x FROM accounts WHERE login_key = ?");
      for (const r of rows) {
        let key = r.name_key, login = r.name;
        for (let i = 2; taken.get(key); i++) (key = `${r.name_key}${i}`), (login = `${r.name}${i}`);
        upd.run(Number(ins.run(key, login, r.salt, r.hash, r.created).lastInsertRowid), r.name_key);
      }
      if (rows.length) console.log(`[db] героев перенесено в аккаунты: ${rows.length}`);
    } },
  { name: "админка на аккаунте (разовый перенос с героев)", up: (db) => {
    if (cols(db, "accounts").includes("admin")) return;
    db.exec("ALTER TABLE accounts ADD COLUMN admin INTEGER NOT NULL DEFAULT 0");
    const n = Number(db.prepare("UPDATE accounts SET admin = 1 WHERE id IN (SELECT account_id FROM players WHERE admin = 1 AND account_id != 0)").run().changes);
    if (n) console.log(`[db] админка перенесена на аккаунты: ${n}`);
  } },
];

export const schemaVersion = (db: DatabaseSync) => Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);

/** Применяет недостающие шаги по порядку; ошибка шага — откат его транзакции, номер не меняется, исключение наружу. */
export function migrate(db: DatabaseSync, file: string, list: Migration[] = MIGRATIONS): { from: number; to: number } {
  const from = schemaVersion(db);
  if (from > list.length) throw new Error(`[db] схема базы ${from} новее сервера ${list.length}`);
  for (let v = from; v < list.length; v++) {
    const m = list[v];
    m.before?.(db, file);
    db.exec("BEGIN IMMEDIATE");
    try {
      m.up(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`[db] миграция ${v + 1} «${m.name}» не прошла: ${(e as Error).message}`, { cause: e });
    }
  }
  return { from, to: list.length };
}
