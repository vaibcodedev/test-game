/** Хранилище аккаунтов и прогресса: встроенный в Node модуль node:sqlite. */
import type { Bars } from "../../shared/hotbar";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { classFaction, type ClassId, type FactionId, type Stats } from "../../shared/classes";
import { fillSlots, type Item, type Slot } from "../../shared/items";
import type { BankSave } from "../../shared/bank";
import type { QuestSave } from "../../shared/quests";
import { migratePets } from "../../shared/pets";
import { sanitizeItem } from "../../shared/transmog";
import { migrate } from "./migrations";

export interface PlayerSave {
  cls: ClassId;
  /** Только у ботов арены (не сохраняется): сила бота против героев — урон и лечение ×, получаемый урон ÷ (data/gameplay.json arena.botPower). */
  botPower?: number;
  /** Только у ботов арены: множитель урона от героев (data/balance.json pvp.botTaken). */
  botTaken?: number;
  /** Фракция (задача 38); в старых сохранениях нет — берётся из класса (Сольгард). */
  faction?: FactionId;
  level: number;
  xp: number;
  gold: number;
  alloc: Stats;
  skills: Record<string, number>;
  inventory: (Item | null)[];
  equip: Record<Slot, Item | null>;
  x: number;
  y: number;
  hp: number;
  mp: number;
  kills: number;
  bossKills: Record<string, number>;
  /** Убийства по типам мобов (бестиарий); нет в старых сохранениях. */
  mobKills?: Record<string, number>;
  /** Сезонные награды арены. */
  titles?: { id: string; name: string; rank: string }[];
  title?: string;
  frame?: string;
  /** Активная еда: переживает релог (реальное время, мс). */
  food?: { id: string; until: number } | null;
  /** Маунты: купленные/полученные и выбранный. */
  mounts?: string[];
  mount?: string;
  /** Конюшня (задача 142): репутация фракции и Знаки Полей. */
  rep?: number;
  marks?: number;
  /** Питомцы: уровень и опыт каждого, выбранный. */
  pets?: Record<string, { level: number; xp: number }>;
  pet?: string;
  /** Версия карты, на которой сохранена позиция (старые сохранения переносятся к фонтану). */
  mapVer?: number;
  /** Банк: вкладки и золото. Хранится в той же строке, что и сумка, — перенос сохраняется одной записью. */
  bank?: BankSave;
  /** Открытые телепорты (id городов); Эмберхолл открыт всегда. */
  cities?: string[];
  /** Задания городов. */
  quests?: QuestSave;
  /** Внешность: индекс оттенка (shared/accounts LOOKS), выбирается при создании героя. */
  look?: number;
  /** Панели умений (shared/hotbar.ts); нет в старых сохранениях — миграция при первом входе. */
  bars?: Bars;
  /** Рейд (задача 114): когда в последний раз взята добыча босса (id → Date.now()), победы, защита от невезения трофеев. */
  raid?: { lootAt: Record<string, number>; wins: number; pity: number };
  /** Вещи, которые не поместились в сумку (рейд, награды): выдаются в мире, когда появится место. */
  pendingItems?: Item[];
  /** «Знамёна Предела» (задача 132, шаг 14): неделя (ключ — дата понедельника), Знаков за неделю, побед и битв за неделю. */
  war?: { week: string; marks: number; wins: number; battles: number };
  /** Подземелье «Пепельные чертоги» (shared/dungeon.ts): когда в последний раз взяты трофеи босса (id → Date.now()), раз в сутки на героя. */
  dgLoot?: Record<string, number>;
}

export interface CharRow {
  name: string;
  cls: ClassId;
  faction: FactionId;
  level: number;
  data: string;
  banned_until: number;
  ban_reason: string;
}

export class GameDB {
  private db: DatabaseSync;
  readonly file: string;
  /** Хеш последнего записанного сохранения героя (ключ имени): автосохранение пропускает неизменившихся (аудит 1.5). */
  private savedHash = new Map<string, string>();

  constructor(file = process.env.DB_PATH || path.resolve("server/data/game.sqlite")) {
    this.file = file;
    if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    // схема — по PRAGMA user_version (server/src/migrations.ts): каждый шаг одной транзакцией с откатом
    migrate(this.db, file);
  }

  // ---------- аккаунты ----------
  /** Проверка пароля аккаунта. null — аккаунта нет. */
  accountLogin(login: string, password: string): { ok: true; id: number; login: string } | { ok: false } | null {
    const row = this.db.prepare("SELECT id, login, salt, hash FROM accounts WHERE login_key = ?").get(GameDB.key(login)) as { id: number; login: string; salt: string; hash: string } | undefined;
    if (!row) return null;
    const a = Buffer.from(this.hash(password, row.salt), "hex");
    const b = Buffer.from(row.hash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
    return { ok: true, id: row.id, login: row.login };
  }
  accountExists(login: string): boolean {
    return !!this.db.prepare("SELECT 1 AS x FROM accounts WHERE login_key = ?").get(GameDB.key(login));
  }
  accountCreate(login: string, password: string): number {
    const salt = randomBytes(16).toString("hex");
    return Number(this.db.prepare("INSERT INTO accounts (login_key, login, salt, hash, created) VALUES (?, ?, ?, ?, ?)").run(GameDB.key(login), login.trim(), salt, this.hash(password, salt), Date.now()).lastInsertRowid);
  }
  /** Герои аккаунта в порядке создания. */
  charsOf(accountId: number): CharRow[] {
    return this.db.prepare("SELECT name, cls, faction, level, data, banned_until, ban_reason FROM players WHERE account_id = ? ORDER BY created, rowid").all(accountId) as unknown as CharRow[];
  }
  /** Владелец героя (id аккаунта) или null, если героя нет. */
  ownerOf(name: string): number | null {
    const r = this.db.prepare("SELECT account_id FROM players WHERE name_key = ?").get(GameDB.key(name)) as { account_id: number } | undefined;
    return r ? r.account_id : null;
  }
  createChar(accountId: number, name: string, save: PlayerSave) {
    const now = Date.now();
    this.db
      .prepare("INSERT INTO players (name_key, name, salt, hash, cls, faction, level, data, created, updated, account_id) VALUES (?, ?, '', '', ?, ?, ?, ?, ?, ?, ?)")
      .run(GameDB.key(name), name.trim(), save.cls, save.faction ?? classFaction(save.cls), save.level, JSON.stringify(save), now, now, accountId);
    this.savedHash.delete(GameDB.key(name));
  }
  /** Удаление героя вместе с его записями арены. */
  deleteChar(accountId: number, name: string): boolean {
    const key = GameDB.key(name);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const n = Number(this.db.prepare("DELETE FROM players WHERE name_key = ? AND account_id = ?").run(key, accountId).changes);
      if (n) for (const t of ["arena_ratings", "arena_rewards"]) {
        try { this.db.prepare(`DELETE FROM ${t} WHERE name_key = ?`).run(key); } catch {}
      }
      this.db.exec("COMMIT");
      this.savedHash.delete(key);
      return n > 0;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  /** Общий склад аккаунта (ячейки) или null, если его ещё нет. */
  accountBank(accountId: number): (Item | null)[] | null {
    const r = this.db.prepare("SELECT bank FROM accounts WHERE id = ?").get(accountId) as { bank: string } | undefined;
    if (!r?.bank) return null;
    try {
      const v = JSON.parse(r.bank);
      if (!Array.isArray(v)) return null;
      // перековка: битый вид на общем складе снимается так же, как в сумке и банке героя (B61)
      let tm = false;
      for (const it of v as (Item | null)[]) tm = sanitizeItem(it) || tm;
      if (tm) this.saveAccountBank(accountId, v);
      return v;
    } catch {
      return null;
    }
  }
  /** Запись общего склада (вызывать в одной транзакции с сохранением героя). */
  saveAccountBank(accountId: number, cells: (Item | null)[]) {
    this.db.prepare("UPDATE accounts SET bank = ? WHERE id = ?").run(JSON.stringify(cells), accountId);
  }

  /** Права администратора — флаг аккаунта героя (accounts.admin): действуют на всех героев аккаунта. players.admin не читается. */
  isAdmin(name: string): boolean {
    const r = this.db.prepare("SELECT a.admin FROM players p JOIN accounts a ON a.id = p.account_id WHERE p.name_key = ?").get(GameDB.key(name)) as { admin: number } | undefined;
    return !!r?.admin;
  }
  /** Выдать (true) или снять права администратора аккаунту по логину. false — аккаунта нет. */
  setAccountAdmin(login: string, on: boolean): boolean {
    return Number(this.db.prepare("UPDATE accounts SET admin = ? WHERE login_key = ?").run(on ? 1 : 0, GameDB.key(login)).changes) > 0;
  }
  /** Активный бан или null. */
  banOf(name: string, now = Date.now()): { until: number; reason: string } | null {
    const r = this.db.prepare("SELECT banned_until, ban_reason FROM players WHERE name_key = ?").get(GameDB.key(name)) as { banned_until: number; ban_reason: string } | undefined;
    return r && r.banned_until > now ? { until: r.banned_until, reason: r.ban_reason } : null;
  }
  setBan(name: string, until: number, reason: string): boolean {
    return Number(this.db.prepare("UPDATE players SET banned_until = ?, ban_reason = ? WHERE name_key = ?").run(until, reason, GameDB.key(name)).changes) > 0;
  }
  adminLog(admin: string, action: string, target: string, details: unknown = {}) {
    this.db.prepare("INSERT INTO admin_log (at, admin, action, target, details) VALUES (?, ?, ?, ?, ?)").run(Date.now(), admin, action, target, JSON.stringify(details));
  }
  adminLogRows(name = "", limit = 100) {
    const k = `%${name.trim()}%`;
    return this.db.prepare("SELECT at, admin, action, target, details FROM admin_log WHERE admin LIKE ? OR target LIKE ? ORDER BY id DESC LIMIT ?").all(k, k, limit) as { at: number; admin: string; action: string; target: string; details: string }[];
  }
  tradeLogRows(name = "", limit = 100) {
    const k = `%${name.trim()}%`;
    return this.db.prepare("SELECT at, a, b, a_items, b_items, a_gold, b_gold FROM trade_log WHERE a LIKE ? OR b LIKE ? ORDER BY id DESC LIMIT ?").all(k, k, limit) as { at: number; a: string; b: string; a_items: string; b_items: string; a_gold: number; b_gold: number }[];
  }

  marketGet(key: string): { sold: number; updated_at: number } | null {
    return (this.db.prepare("SELECT sold, updated_at FROM market_demand WHERE key = ?").get(key) as { sold: number; updated_at: number } | undefined) || null;
  }

  marketSet(key: string, sold: number, at: number) {
    this.db.prepare("INSERT INTO market_demand (key, sold, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET sold = excluded.sold, updated_at = excluded.updated_at").run(key, sold, at);
  }

  static key(name: string) {
    return name.trim().toLowerCase();
  }

  private hash(password: string, salt: string) {
    return scryptSync(password, salt, 32).toString("hex");
  }

  find(name: string): { name: string; cls: ClassId } | null {
    const row = this.db.prepare("SELECT name, cls FROM players WHERE name_key = ?").get(GameDB.key(name)) as { name: string; cls: ClassId } | undefined;
    return row || null;
  }

  /** Сохранение без проверки пароля (для перехода между комнатами на сервере). */
  load(name: string): PlayerSave | null {
    const row = this.db.prepare("SELECT data FROM players WHERE name_key = ?").get(GameDB.key(name)) as { data: string } | undefined;
    if (!row) return null;
    let save = GameDB.parseSave(row.data);
    if (!save) {
      // битая строка: сама строка не трогается (ручное восстановление); пробуем последнюю резервную копию базы
      console.error(`[db] битое сохранение героя «${name}» (${row.data.length} байт): ищу в резервных копиях`);
      save = this.fromBackup(name);
      if (!save) {
        console.error(`[db] герой «${name}»: целой копии нет — вход отклонён, строка оставлена для ручного восстановления`);
        return null;
      }
      console.warn(`[db] герой «${name}» восстановлен из резервной копии`);
      this.save(name, save);
    }
    save.faction ??= classFaction(save.cls);
    // задача 147: старые герои без слотов наплечников и перчаток — пустые слоты (вещи в сумке и надетые не трогаются)
    save.equip = fillSlots(save.equip);
    // задача 150: Волчонок, Огонёк и Черепашка заменены новыми питомцами (data/pets.json migrate) — уровень и опыт переносятся, запись сразу
    if (migratePets(save)) this.save(name, save);
    // перековка (docs/art/gear.md): вид хранится в самом предмете (поле appearance в JSON); битый вид (модель или легендарка ушли из данных) снимается
    let tm = false;
    for (const it of [...(save.inventory ?? []), ...Object.values(save.equip ?? {}), ...(save.bank?.tabs ?? []).flat()]) tm = sanitizeItem(it) || tm;
    if (tm) this.save(name, save);
    return save;
  }

  /** Сохранение из JSON или null: битый текст, не объект, нет класса. */
  static parseSave(data: string): PlayerSave | null {
    try {
      const v = JSON.parse(data) as PlayerSave;
      return v && typeof v === "object" && !Array.isArray(v) && typeof v.cls === "string" ? v : null;
    } catch {
      return null;
    }
  }

  /** Целое сохранение героя из резервных копий (backups рядом с базой, от новой к старой) или null. */
  private fromBackup(name: string, dir = path.join(path.dirname(this.file), "backups")): PlayerSave | null {
    if (this.file === ":memory:" || !fs.existsSync(dir)) return null;
    const base = path.basename(this.file, ".sqlite");
    const files = fs.readdirSync(dir).filter((f) => f.startsWith(base + "-") && f.endsWith(".sqlite")).sort().reverse();
    for (const f of files) {
      let b: DatabaseSync | null = null;
      try {
        b = new DatabaseSync(path.join(dir, f), { readOnly: true });
        const r = b.prepare("SELECT data FROM players WHERE name_key = ?").get(GameDB.key(name)) as { data: string } | undefined;
        const s = r ? GameDB.parseSave(r.data) : null;
        if (s) return s;
      } catch (e) {
        console.error(`[db] копия ${f} не читается:`, (e as Error).message);
      } finally {
        try { b?.close(); } catch {}
      }
    }
    return null;
  }

  get raw(): DatabaseSync {
    return this.db;
  }

  private static hashOf(json: string) {
    return createHash("sha1").update(json).digest("base64");
  }

  save(name: string, save: PlayerSave) {
    const json = JSON.stringify(save), key = GameDB.key(name);
    this.db.prepare("UPDATE players SET data = ?, level = ?, updated = ? WHERE name_key = ?").run(json, save.level, Date.now(), key);
    this.savedHash.set(key, GameDB.hashOf(json));
  }
  /**
   * Несколько сохранений одной транзакцией: все или ни одного (награды рейда, автосохранение мира).
   * onlyChanged — пропустить героев, чьё сохранение не изменилось с последней записи через этот объект (save/saveMany/createChar).
   * Возвращает, сколько героев записано.
   */
  saveMany(list: { name: string; save: PlayerSave }[], onlyChanged = false): number {
    const rows: { key: string; json: string; hash: string; level: number }[] = [];
    for (const { name, save } of list) {
      const key = GameDB.key(name), json = JSON.stringify(save), hash = GameDB.hashOf(json);
      if (onlyChanged && this.savedHash.get(key) === hash) continue;
      rows.push({ key, json, hash, level: save.level });
    }
    if (!rows.length) return 0;
    const st = this.db.prepare("UPDATE players SET data = ?, level = ?, updated = ? WHERE name_key = ?");
    const now = Date.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const r of rows) st.run(r.json, r.level, now, r.key);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    for (const r of rows) this.savedHash.set(r.key, r.hash);
    return rows.length;
  }

  /**
   * Резервная копия базы (аудит, раздел 3): VACUUM INTO в dir (по умолчанию — папка backups рядом с базой),
   * имя <база>-ГГГГММДД-ЧЧММСС.sqlite; хранятся keep последних, старые удаляются. Возвращает путь копии (null для базы в памяти).
   */
  backup(dir = path.join(path.dirname(this.file), "backups"), keep = 7, now = new Date()): string | null {
    if (this.file === ":memory:") return null;
    fs.mkdirSync(dir, { recursive: true });
    const z = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${z(now.getMonth() + 1)}${z(now.getDate())}-${z(now.getHours())}${z(now.getMinutes())}${z(now.getSeconds())}`;
    const base = path.basename(this.file, ".sqlite");
    const out = path.join(dir, `${base}-${stamp}.sqlite`);
    fs.rmSync(out, { force: true }); // VACUUM INTO не перезаписывает существующий файл
    this.db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
    const ours = (f: string) => f.startsWith(base + "-") && /^\d{8}-\d{6}\.sqlite$/.test(f.slice(base.length + 1));
    const old = fs.readdirSync(dir).filter(ours).sort();
    for (const f of old.slice(0, Math.max(0, old.length - keep))) fs.rmSync(path.join(dir, f), { force: true });
    return out;
  }

  top(limit = 10): { name: string; cls: string; level: number }[] {
    return this.db.prepare("SELECT name, cls, level FROM players ORDER BY level DESC, updated ASC LIMIT ?").all(limit) as {
      name: string;
      cls: string;
      level: number;
    }[];
  }

  close() {
    this.db.close();
  }
}
