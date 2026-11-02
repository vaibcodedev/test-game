/**
 * Античит, шаг 1 (docs/systems/architecture.md, «Рекомендация»): транспорт (maxPayload, Origin, лимит соединений с IP),
 * версия клиента в onAuth, журнал подозрительного (таблица suspicion). Схемы сообщений — rooms/schemas.ts (проверка в makeOn).
 * Настройки — data/anticheat.json.
 */
import type { IncomingMessage } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import cfg from "../../data/anticheat.json";
import { GAME_VERSION } from "../../shared/version";

export const AC = cfg;

// ---------- версия клиента ----------

/** Текст отказа старой (или чужой) сборке; null — версия совпадает. */
export function versionError(v: unknown): string | null {
  if (v === GAME_VERSION) return null;
  const had = typeof v === "string" && v ? ` (у вас ${v.slice(0, 32)})` : "";
  return `Вышло обновление игры: ${GAME_VERSION}${had}. Обновите страницу (Ctrl+F5)`;
}

// ---------- журнал подозрительного ----------

/** Что заподозрено: скорость, дальность, флуд, невалидное сообщение, чужие вещи, админ-команда не админом. */
export type SuspicionKind = "speed" | "range" | "flood" | "invalid" | "foreign" | "admin";

export interface SuspicionRow { name: string; kind: string; count: number; first_at: number; last_at: number; detail: string }

/**
 * Таблица suspicion: строка на пару (герой, вид) — сколько раз, когда впервые и в последний раз, последняя деталь.
 * flag копит в памяти и пишет в базу пачкой раз в flushMs (поток невалидных сообщений не превращается в поток записей).
 */
export class SuspicionLog {
  private pending = new Map<string, { name: string; kind: string; n: number; first: number; last: number; detail: string }>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private db: DatabaseSync, private flushMs = AC.suspicion.flushMs) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS suspicion (
        name     TEXT NOT NULL,
        kind     TEXT NOT NULL,
        count    INTEGER NOT NULL,
        first_at INTEGER NOT NULL,
        last_at  INTEGER NOT NULL,
        detail   TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (name, kind)
      );
      CREATE INDEX IF NOT EXISTS suspicion_last ON suspicion(last_at);
    `);
  }

  flag(name: string, kind: SuspicionKind, detail = "", now = Date.now()) {
    if (!name) return;
    const key = name + "\u0000" + kind;
    const e = this.pending.get(key);
    if (e) { e.n++; e.last = now; e.detail = detail.slice(0, 200); }
    else this.pending.set(key, { name, kind, n: 1, first: now, last: now, detail: detail.slice(0, 200) });
    if (!this.timer && this.flushMs > 0) {
      this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.flushMs);
      this.timer.unref?.();
    }
  }

  /** Записать накопленное одной транзакцией. */
  flush() {
    if (!this.pending.size) return;
    const list = [...this.pending.values()];
    this.pending.clear();
    const st = this.db.prepare(`INSERT INTO suspicion (name, kind, count, first_at, last_at, detail) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(name, kind) DO UPDATE SET count = count + excluded.count, last_at = excluded.last_at, detail = excluded.detail`);
    try {
      this.db.exec("BEGIN IMMEDIATE");
      for (const e of list) st.run(e.name, e.kind, e.n, e.first, e.last, e.detail);
      this.db.exec("COMMIT");
    } catch (ex) {
      try { this.db.exec("ROLLBACK"); } catch {}
      console.error("[suspicion] запись не прошла:", ex);
    }
  }

  /** Для админки: свежие сверху, фильтр по имени (подстрока). */
  rows(name = "", limit = AC.suspicion.adminRows): SuspicionRow[] {
    this.flush();
    const k = `%${name.trim()}%`;
    return this.db.prepare("SELECT name, kind, count, first_at, last_at, detail FROM suspicion WHERE name LIKE ? ORDER BY last_at DESC LIMIT ?").all(k, limit) as unknown as SuspicionRow[];
  }

  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flush();
  }
}

let log: SuspicionLog | null = null;
/** Подключить журнал (index.ts; в быстрых тестах — к базе в памяти). null — отключить. */
export function setSuspicionLog(l: SuspicionLog | null) { log = l; }
export function suspicionLog() { return log; }
/** Отметить подозрительное. Без подключённого журнала (быстрые тесты) — ничего. */
export function flag(name: string, kind: SuspicionKind, detail = "") {
  log?.flag(name, kind, detail);
}

// ---------- транспорт ----------

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** IP клиента: за локальным прокси (nginx/Caddy на той же машине) — первый адрес X-Forwarded-For. Loopback без прокси — "". */
export function clientIp(req: IncomingMessage): string {
  const remote = req.socket?.remoteAddress ?? "";
  if (!LOOPBACK.has(remote)) return remote;
  const xff = req.headers["x-forwarded-for"];
  const first = (Array.isArray(xff) ? xff[0] : xff ?? "").split(",")[0].trim();
  return first && !LOOPBACK.has(first) ? first : "";
}

/** Origin пускаем: свой хост, список из data/anticheat.json, без Origin (не браузер). */
export function originOk(origin: string | undefined, host: string | undefined, allowed: readonly string[] = AC.origins): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  try {
    const u = new URL(origin);
    // локальная разработка: любой порт localhost / 127.0.0.1 (Vite на занятом 5173 переезжает на другой порт, тестовые сборки — на свои)
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return !!host && u.host === host;
  } catch {
    return false;
  }
}

/** Счётчик одновременных соединений с IP. "" (loopback, тесты, боты) не ограничивается. */
export class IpLimit {
  readonly count = new Map<string, number>();
  constructor(public max = AC.maxConnPerIp) {}
  /** Занять место; false — лимит исчерпан. */
  take(ip: string): boolean {
    if (!ip) return true;
    const n = this.count.get(ip) ?? 0;
    if (n >= this.max) return false;
    this.count.set(ip, n + 1);
    return true;
  }
  give(ip: string) {
    if (!ip) return;
    const n = (this.count.get(ip) ?? 0) - 1;
    if (n > 0) this.count.set(ip, n);
    else this.count.delete(ip);
  }
}

type VerifyInfo = { origin: string; secure: boolean; req: IncomingMessage };
type VerifyCb = (res: boolean, code?: number, message?: string) => void;

/** verifyClient для ws: чужой Origin — 403, лимит IP — 429; место IP освобождается при закрытии сокета. */
export function makeVerifyClient(limit = new IpLimit(), allowed: readonly string[] = AC.origins) {
  return (info: VerifyInfo, cb: VerifyCb) => {
    if (!originOk(info.origin, info.req.headers.host, allowed)) {
      console.warn(`[anticheat] отклонён Origin ${String(info.origin).slice(0, 80)}`);
      return cb(false, 403, "Forbidden origin");
    }
    const ip = clientIp(info.req);
    if (!limit.take(ip)) {
      console.warn(`[anticheat] лимит соединений с IP ${ip} (${limit.max})`);
      return cb(false, 429, "Too many connections");
    }
    let freed = false;
    info.req.socket.once("close", () => { if (!freed) { freed = true; limit.give(ip); } });
    cb(true);
  };
}

// ---------- частота отдельных сообщений ----------

/** Правило частоты: [не больше n сообщений этого типа, за ms] (data/anticheat.json msgRate.rules). */
export type RateRules = Readonly<Record<string, readonly number[]>>;

/**
 * Лимит частоты по типу сообщения на одно соединение (идея — FloodProtector Lineage 2: свой интервал на действие; троттлинг
 * опкодов WoW). Поверх общего floodCheck (rooms/common.ts): дорогие и социальные сообщения — запросы обмена и группы, осмотр,
 * таблицы арены, рынок, телепорты, заточка — ограничены своим окном. Сверх лимита — отброс без ответа; первое превышение
 * в окне — запись в журнал (flood).
 */
export class MsgRate {
  private win = new Map<string, { start: number; n: number; marked: boolean }>();
  dropped = 0;
  constructor(private rules: RateRules = AC.msgRate.rules) {}

  /** false — сообщение сверх лимита своего типа, отбросить. Типы без правила не ограничиваются. */
  check(type: string, now = Date.now(), name = ""): boolean {
    if (!Object.hasOwn(this.rules, type)) return true;
    const [max, ms] = this.rules[type];
    if (!(max > 0) || !(ms > 0)) return true;
    let e = this.win.get(type);
    if (!e || now - e.start >= ms) this.win.set(type, (e = { start: now, n: 0, marked: false }));
    if (++e.n <= max) return true;
    this.dropped++;
    if (!e.marked) {
      e.marked = true;
      flag(name, "flood", `${type}: больше ${max} за ${ms} мс`);
    }
    return false;
  }
}
