/**
 * Аккаунты (задача 30): HTTP API входа и управления героями, сессии в памяти.
 * POST /api/login {login, password, create?} → токен; дальше Authorization: Bearer <токен>.
 * WorldRoom.onAuth принимает { token, character } и проверяет, что герой принадлежит аккаунту.
 */
import express from "express";
import { randomBytes } from "node:crypto";
import { MAX_CHARS, normLook, type AccountView, type CharSummary } from "../../shared/accounts";
import { CLASSES, isClassId, type ClassId } from "../../shared/classes";
import { homeCity } from "../../shared/cities";
import { FACTIONS, isFactionId } from "../../shared/factions";
import { NAME_RE } from "../../shared/constants";
import { iconFor, itemName, SLOTS } from "../../shared/items";
import { MAP_VERSION, ZONES, zoneAtPx, type WorldMap } from "../../shared/map";
import { inArena } from "./arena/registry";
import { GameDB, type CharRow, type PlayerSave } from "./db";
import { GP } from "../../shared/gameplay";
import { T } from "../../shared/texts";

export interface Session {
  accountId: number;
  login: string;
  exp: number;
}

/** Сессия живёт 2 часа с последнего обращения (токен хранится только во вкладке браузера). */
const TTL = GP.misc.sessionTtlHours * 3600_000;
const sessions = new Map<string, Session>();
/** Только что созданные герои: при первом входе — приветствие. */
export const freshChars = new Set<string>();

export function sessionOf(token: unknown): Session | null {
  if (typeof token !== "string" || !token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) {
    sessions.delete(token);
    return null;
  }
  s.exp = Date.now() + TTL;
  return s;
}

function newSession(accountId: number, login: string): string {
  const now = Date.now();
  if (sessions.size > 5000) for (const [k, s] of sessions) if (s.exp < now) sessions.delete(k);
  const token = randomBytes(24).toString("hex");
  sessions.set(token, { accountId, login, exp: now + TTL });
  return token;
}

/** Ограничение частоты: не больше max событий за окно ms на ключ. */
class Limiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private ms: number) {}
  blocked(key: string, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.ms);
    this.hits.set(key, list);
    return list.length >= this.max;
  }
  hit(key: string, now = Date.now()) {
    const list = this.hits.get(key) ?? [];
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.ms)) this.hits.delete(k);
  }
}

export interface AccountDeps {
  db: () => GameDB;
  map: () => WorldMap | null;
  online: (nameKey: string) => boolean;
  newSave: (cls: ClassId) => PlayerSave;
  /** Тесты: без ограничения запросов с одного адреса. */
  test?: boolean;
}

function summary(row: CharRow, map: WorldMap | null): CharSummary {
  let save: Partial<PlayerSave> = {};
  try { save = JSON.parse(row.data); } catch {}
  const onMap = map && save.mapVer === MAP_VERSION && typeof save.x === "number" && typeof save.y === "number";
  // сохранение другой версии карты: герой войдёт в столицу своей фракции (WorldRoom.onJoin), её и показываем
  const home = homeCity(row.faction ?? CLASSES[row.cls]?.faction);
  const zone = onMap ? ZONES[zoneAtPx(map, save.x!, save.y!)]?.name ?? "" : map ? ZONES[zoneAtPx(map, home.spawn.x, home.spawn.y)]?.name ?? home.name : home.name;
  const equip: CharSummary["equip"] = [];
  for (const slot of SLOTS) {
    const it = save.equip?.[slot];
    if (!it) continue;
    try { equip.push({ slot, icon: iconFor(it), rarity: it.rarity, name: itemName(it), plus: it.plus || 0 }); } catch {}
  }
  const now = Date.now();
  return {
    name: row.name,
    cls: row.cls,
    faction: row.faction ?? CLASSES[row.cls]?.faction ?? "solgard",
    level: row.level,
    zone,
    look: normLook(save.look),
    equip,
    banned: row.banned_until > now ? T("srv.accounts.770", { tolocalestring: row.banned_until > 4e12 ? "навсегда" : "до " + new Date(row.banned_until).toLocaleString("ru-RU"), ban_reason: row.ban_reason ? ": " + row.ban_reason : "" }) : undefined,
  };
}

export function accountRouter(d: AccountDeps): express.Router {
  const r = express.Router();
  r.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return void res.sendStatus(204);
    next();
  });
  r.use(express.json({ limit: "4kb" }));
  const fail = (res: express.Response, code: number, error: string) => void res.status(code).json({ error });
  const view = (token: string, s: Session): AccountView => ({ token, login: s.login, chars: d.db().charsOf(s.accountId).map((c) => summary(c, d.map())) });
  const auth = (req: express.Request): { token: string; s: Session } | null => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const s = sessionOf(token);
    return s ? { token, s } : null;
  };
  // вход: 20 попыток в минуту с адреса, 5 неверных паролей за 5 минут на логин; регистрация: 5 в час с адреса
  const perIp = new Limiter(20, 60_000), badPass = new Limiter(5, 5 * 60_000), regs = new Limiter(5, 3600_000);
  const ipOf = (req: express.Request) => req.ip || req.socket.remoteAddress || "?";

  r.post("/login", (req, res) => {
    const ip = ipOf(req);
    if (!d.test) {
      if (perIp.blocked(ip)) return fail(res, 429, T("srv.accounts.1"));
      perIp.hit(ip);
    }
    const login = typeof req.body?.login === "string" ? req.body.login.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const create = req.body?.create === true;
    if (!NAME_RE.test(login)) return fail(res, 400, T("srv.accounts.2"));
    if (password.length < 4 || password.length > 64) return fail(res, 400, T("srv.accounts.3"));
    const db = d.db();
    const lk = GameDB.key(login);
    if (create) {
      if (db.accountExists(login)) return fail(res, 409, T("srv.accounts.4"));
      if (!d.test) {
        if (regs.blocked(ip)) return fail(res, 429, T("srv.accounts.5"));
        regs.hit(ip);
      }
      const id = db.accountCreate(login, password);
      const token = newSession(id, login);
      return void res.json(view(token, sessions.get(token)!));
    }
    if (badPass.blocked(lk)) return fail(res, 429, T("srv.accounts.6"));
    const acc = db.accountLogin(login, password);
    if (!acc) return fail(res, 404, T("srv.accounts.7"));
    if (!acc.ok) {
      badPass.hit(lk);
      return fail(res, 403, T("srv.accounts.8"));
    }
    const token = newSession(acc.id, acc.login);
    res.json(view(token, sessions.get(token)!));
  });

  r.get("/chars", (req, res) => {
    const a = auth(req);
    if (!a) return fail(res, 401, T("srv.accounts.9"));
    res.json(view(a.token, a.s));
  });

  r.post("/chars", (req, res) => {
    const a = auth(req);
    if (!a) return fail(res, 401, T("srv.accounts.9"));
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const cls = req.body?.cls;
    if (!NAME_RE.test(name)) return fail(res, 400, T("srv.accounts.10"));
    if (!isClassId(cls)) return fail(res, 400, T("srv.accounts.11"));
    // фракция: выбирается первой; без неё (старый клиент) — фракция класса
    const faction = req.body?.faction ?? CLASSES[cls].faction;
    if (!isFactionId(faction)) return fail(res, 400, T("srv.accounts.12"));
    if (CLASSES[cls].faction !== faction) return fail(res, 400, T("srv.accounts.13", { name: CLASSES[cls].name, name2: FACTIONS[faction].name }));
    const db = d.db();
    if (db.charsOf(a.s.accountId).length >= MAX_CHARS) return fail(res, 400, T("srv.accounts.14", { max_chars: MAX_CHARS }));
    if (db.ownerOf(name) !== null) return fail(res, 409, T("srv.accounts.15"));
    const save = d.newSave(cls as ClassId);
    save.faction = faction;
    save.look = normLook(req.body?.look);
    try {
      db.createChar(a.s.accountId, name, save);
    } catch {
      return fail(res, 409, T("srv.accounts.15"));
    }
    freshChars.add(GameDB.key(name));
    res.json(view(a.token, a.s));
  });

  r.post("/chars/delete", (req, res) => {
    const a = auth(req);
    if (!a) return fail(res, 401, T("srv.accounts.9"));
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const confirm = typeof req.body?.confirm === "string" ? req.body.confirm.trim() : "";
    const db = d.db();
    if (!name || db.ownerOf(name) !== a.s.accountId) return fail(res, 404, T("srv.accounts.16"));
    if (GameDB.key(confirm) !== GameDB.key(name)) return fail(res, 400, T("srv.accounts.17"));
    const key = GameDB.key(name);
    if (d.online(key) || inArena.has(key)) return fail(res, 409, T("srv.accounts.18"));
    db.deleteChar(a.s.accountId, name);
    freshChars.delete(key);
    res.json(view(a.token, a.s));
  });

  // ошибки клиента (глобальный перехватчик): в лог сервера, не больше 10 в минуту с адреса
  const clientErr = new Limiter(10, 60_000);
  r.post("/client-error", (req, res) => {
    const ip = ipOf(req);
    if (clientErr.blocked(ip)) return void res.status(429).json({ ok: false });
    clientErr.hit(ip);
    const s = (v: unknown, n: number) => (typeof v === "string" ? v : "").slice(0, n).replace(/[\r\n]+/g, " | ");
    const b = req.body ?? {};
    console.warn(`[client-error] ${ip} ${s(b.who, 40)} ${s(b.kind, 20)}: ${s(b.message, 300)} @ ${s(b.where, 200)} ${s(b.stack, 1200)}`);
    res.json({ ok: true });
  });

  r.post("/logout", (req, res) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    sessions.delete(token);
    res.json({ ok: true });
  });
  return r;
}
