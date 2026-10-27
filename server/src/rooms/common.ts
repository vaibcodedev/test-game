/** Общие обработчики сообщений для комнат мира и арены: движение, цель, умения, чат. */
import type { Client, Room } from "@colyseus/core";
import { CHAT_MAX_LEN, TILE } from "../../../shared/constants";
import type { Player } from "../game/Player";
import { NO_FIGHT_MSG } from "../../../shared/cities";
import { playWidth } from "../../../shared/interiors";
import { cancelAll, requestSkill } from "../game/skillQueue";
import type { World } from "../game/World";
import { cleanRef, setSlot, validPos } from "../../../shared/hotbar";
import { KICK_CODE } from "../../../shared/accounts";
import serverCfg from "../../../data/server.json";
import { T } from "../../../shared/texts";

export const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null;

/** Убирает управляющие и невидимые символы (U+0000–U+001F, U+007F, U+200B–U+200F, U+2028–U+202E, U+2060–U+206F). */
export function cleanText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f)) continue;
    out += ch;
  }
  return out.trim();
}

export type On = <T>(type: string, fn: (p: Player, msg: T) => void) => void;

/**
 * Обёртка тика таймера комнаты: исключение пишется в лог (не чаще раза в 10 с на таймер, со счётом пропущенных) и не роняет процесс.
 */
export function guard<A extends unknown[]>(name: string, fn: (...a: A) => void): (...a: A) => void {
  let lastLog = -Infinity, hidden = 0;
  return (...a: A) => {
    try {
      fn(...a);
    } catch (e) {
      const now = Date.now();
      if (now - lastLog < 10_000) return void hidden++;
      console.error(`[timer:${name}]${hidden ? ` ${T("srv.common.835", { hidden: hidden })}` : ""}`, e);
      lastLog = now;
      hidden = 0;
    }
  };
}

/** Сообщения движения: клиент законно шлёт их чаще остальных — свой счётчик (data/server.json → msgLimit.move). */
const MOVE_MSGS = new Set(["input", "moveTo"]);
export const MSG_LIMIT = serverCfg.msgLimit;
export const FLOOD_TEXT = T("srv.common.836");

/** Счётчик сообщений клиента: окна по windowMs; over — сколько окон подряд лимит превышен. */
interface Flood { win: number; move: number; general: number; over: number; overMarked: boolean; kicked: boolean; dropped: number }

/**
 * Лимит сообщений на клиента (аудит, раздел 3): сверх лимита за окно сообщение отбрасывается;
 * kickAfterWindows окон подряд с превышением — отключение (KICK_CODE: клиент не переподключается) с записью в лог.
 * Возвращает false, если сообщение надо отбросить.
 */
export function floodCheck(state: WeakMap<Client, Flood>, client: Client, type: string, now = Date.now(), cfg = MSG_LIMIT, name = ""): boolean {
  let f = state.get(client);
  if (!f) state.set(client, (f = { win: now, move: 0, general: 0, over: 0, overMarked: false, kicked: false, dropped: 0 }));
  if (f.kicked) return false;
  if (now - f.win >= cfg.windowMs) {
    // окно без превышения (или пропуск окон) сбрасывает серию
    if (!f.overMarked || now - f.win >= cfg.windowMs * 2) f.over = 0;
    f.win = now;
    f.move = f.general = 0;
    f.overMarked = false;
  }
  const move = MOVE_MSGS.has(type);
  const n = move ? ++f.move : ++f.general;
  if (n <= (move ? cfg.move : cfg.general)) return true;
  f.dropped++;
  if (!f.overMarked) {
    f.overMarked = true;
    if (++f.over >= cfg.kickAfterWindows) {
      f.kicked = true;
      console.warn(T("srv.common.208", { sessionid: name || client.sessionId, over: f.over, type: type, dropped: f.dropped }));
      try {
        client.send("kicked", { text: FLOOD_TEXT });
        client.leave(KICK_CODE);
      } catch {}
    }
  }
  return false;
}

/** Подписка на сообщение с поиском игрока по сессии, лимитом сообщений и защитой от исключений. */
export function makeOn(room: Room<any>, world: () => World): On {
  // по объекту соединения: после переподключения счёт заново, закрытые соединения уходят сборщику мусора
  const flood = new WeakMap<Client, Flood>();
  // сообщение без обработчика: Colyseus 0.16 по умолчанию отключает клиента (4002) — тот переподключается с экраном загрузки.
  // Здесь его просто отбрасываем (с тем же лимитом): кнопка, которой нет в этой комнате, не должна ронять сессию
  room.onMessage("*", (client: Client, type: string | number) => {
    const p = world().players.get(client.sessionId);
    if (!floodCheck(flood, client, String(type), Date.now(), MSG_LIMIT, p?.name) && p && flood.get(client)?.kicked) p.noReconnect = true;
  });
  return <T>(type: string, fn: (p: Player, msg: T) => void) => {
    room.onMessage(type, (client: Client, msg: T) => {
      const p = world().players.get(client.sessionId);
      if (!floodCheck(flood, client, type, Date.now(), MSG_LIMIT, p?.name)) {
        if (p && flood.get(client)?.kicked) p.noReconnect = true;
        return;
      }
      if (!p || msg === null || typeof msg !== "object") return;
      p.inputAt = world().time; // последний ввод героя (AFK в круге «Знамён Предела»)
      try {
        fn(p, msg);
      } catch (e) {
        console.error(`[${type}]`, e);
      }
    });
  };
}

export function registerCombat(on: On, world: () => World) {
  const w = world;
  on<{ mx: unknown; my: unknown }>("input", (p, m) => {
    const mx = num(m.mx, -1, 1), my = num(m.my, -1, 1);
    if (mx === null || my === null) return;
    p.input.mx = mx;
    p.input.my = my;
  });
  on<{ x: unknown; y: unknown }>("moveTo", (p, m) => {
    const x = num(m.x, 0, playWidth(w().map)), y = num(m.y, 0, w().map.h * TILE);
    if (x === null || y === null) return;
    w().stopFollow(p, true);
    p.moveTo = { x, y };
    p.pend = null;
    p.nav.reset();
    if (!p.chase) p.approach = false;
  });
  // target — только выбор (враг или союзник-игрок): без подхода и атаки
  on<{ id: unknown }>("target", (p, m) => {
    const id = typeof m.id === "string" ? m.id : null;
    const a = w().actor(id);
    const ok = a && !w().isDead(a) && (w().hostile(p, a) ? !w().stealthed(a) : w().isPlayer(a));
    const next = ok ? a.id : null;
    if (next !== p.targetId) p.engaged = p.approach = false;
    p.targetId = next;
    p.unit.target = next ?? "";
  });
  // attack — подход до дальности и автоатака; id=null — прекратить атаку (цель остаётся)
  on<{ id: unknown }>("attack", (p, m) => {
    const id = typeof m.id === "string" ? m.id : null;
    if (!id) { p.engaged = p.approach = false; return; }
    const a = w().actor(id);
    if (!a || w().isDead(a) || !w().hostile(p, a) || w().stealthed(a)) return;
    if (w().noFight(p)) return void p.send("toast", { text: NO_FIGHT_MSG, kind: "error" });
    w().stopFollow(p, true);
    p.targetId = a.id;
    p.unit.target = a.id;
    p.engaged = p.approach = true;
    p.moveTo = null;
    p.pend = null;
  });
  // follow — держаться за игроком на 40–60 px; id=null — прекратить
  on<{ id: unknown }>("follow", (p, m) => {
    const id = typeof m.id === "string" ? m.id : null;
    if (!id) return w().stopFollow(p, true);
    const a = w().actor(id);
    if (!a || a.id === p.id || !w().isPlayer(a) || w().isDead(a) || w().dist(p.unit, a) > 600) return void p.send("toast", { text: T("srv.common.209"), kind: "error" });
    p.followId = a.id;
    p.followGo = false;
    p.moveTo = null;
    p.engaged = p.approach = false;
    p.send("toast", { text: T("srv.common.210", { name: a.name }), kind: "info" });
  });
  on<{ on: unknown }>("chase", (p, m) => { p.chase = m.on === true; });
  on<{ id: unknown; x: unknown; y: unknown; target: unknown; q: unknown; ap: unknown; a: unknown; dx: unknown; dy: unknown }>("skill", (p, m) => {
    if (typeof m.id !== "string") return;
    const x = num(m.x, 0, playWidth(w().map)) ?? p.x, y = num(m.y, 0, w().map.h * TILE) ?? p.y;
    // a — угол прицела (линии, стена огня), dx, dy — вектор рывка или до точки линии: сервер применяет их от своей позиции (задача 133, shared/skillShape.ts)
    const a = num(m.a, -8, 8) ?? undefined, dx = num(m.dx, -4000, 4000) ?? undefined, dy = num(m.dy, -4000, 4000) ?? undefined;
    // q — окно очереди из настроек клиента (0–500 мс), ap — опция «Подходить к цели»
    requestSkill(w(), p, { id: m.id, x, y, target: typeof m.target === "string" ? m.target : null, ap: m.ap === true, until: 0, a, dx, dy }, num(m.q, 0, 500) ?? 400);
  });
  // Esc: очередь, подход, канал (дальше клиент снимает окно, цель, меню)
  on("cancel", (p) => { cancelAll(w(), p); });
  // панели умений (docs/controls.md, раздел 8): не чаще 10 изменений в секунду
  const barsOk = (p: Player) => {
    const now = Date.now();
    if (now - p.barsWin > 1000) { p.barsWin = now; p.barsHits = 0; }
    return ++p.barsHits <= 10;
  };
  on<{ bar: unknown; i: unknown; ref: unknown }>("bars:set", (p, m) => {
    if (!validPos(m.bar, m.i) || !barsOk(p)) return;
    const ref = cleanRef(m.ref ?? null, p.cls);
    if (ref === undefined) return void p.send("toast", { text: T("srv.common.211"), kind: "error" });
    p.save.bars = setSlot(p.bars(), m.bar as number, m.i as number, ref);
    p.selfDirty = true;
  });
  const pos = (v: unknown): { bar: number; i: number } | null => {
    const o = v as { bar?: unknown; i?: unknown } | null;
    return o && typeof o === "object" && validPos(o.bar, o.i) ? { bar: o.bar as number, i: o.i as number } : null;
  };
  on<{ a: unknown; b: unknown }>("bars:swap", (p, m) => {
    const a = pos(m.a), b = pos(m.b);
    if (!a || !b || !barsOk(p)) return;
    const bars = p.bars().map((r) => r.slice());
    [bars[a.bar][a.i], bars[b.bar][b.i]] = [bars[b.bar][b.i], bars[a.bar][a.i]];
    p.save.bars = bars;
    p.selfDirty = true;
  });
  on("mount:toggle", (p) => w().toggleMount(p));
  on<{ text: unknown }>("chat", (p, m) => {
    if (typeof m.text !== "string") return;
    const text = cleanText(m.text).slice(0, CHAT_MAX_LEN);
    if (!text) return;
    if (w().time - p.lastChat < 600) return p.send("toast", { text: T("srv.common.212"), kind: "error" });
    p.lastChat = w().time;
    w().playerChat(p, text);
  });
}
