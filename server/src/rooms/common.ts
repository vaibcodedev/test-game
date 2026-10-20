/** Общие обработчики сообщений для комнат мира и арены: движение, цель, умения, чат. */
import type { Client, Room } from "@colyseus/core";
import { CHAT_MAX_LEN, TILE } from "../../../shared/constants";
import type { Player } from "../game/Player";
import { cancelAll, requestSkill } from "../game/skillQueue";
import type { World } from "../game/World";
import { cleanRef, setSlot, validPos } from "../../../shared/hotbar";

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

/** Подписка на сообщение с поиском игрока по сессии и защитой от исключений. */
export function makeOn(room: Room<any>, world: () => World): On {
  return <T>(type: string, fn: (p: Player, msg: T) => void) => {
    room.onMessage(type, (client: Client, msg: T) => {
      const p = world().players.get(client.sessionId);
      if (!p || msg === null || typeof msg !== "object") return;
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
    const x = num(m.x, 0, w().map.w * TILE), y = num(m.y, 0, w().map.h * TILE);
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
    if (!a || a.id === p.id || !w().isPlayer(a) || w().isDead(a) || w().dist(p.unit, a) > 600) return void p.send("toast", { text: "Не удалось следовать", kind: "error" });
    p.followId = a.id;
    p.followGo = false;
    p.moveTo = null;
    p.engaged = p.approach = false;
    p.send("toast", { text: `Вы следуете за ${a.name}`, kind: "info" });
  });
  on<{ on: unknown }>("chase", (p, m) => { p.chase = m.on === true; });
  on<{ id: unknown; x: unknown; y: unknown; target: unknown; q: unknown; ap: unknown }>("skill", (p, m) => {
    if (typeof m.id !== "string") return;
    const x = num(m.x, 0, w().map.w * TILE) ?? p.x, y = num(m.y, 0, w().map.h * TILE) ?? p.y;
    // q — окно очереди из настроек клиента (0–500 мс), ap — опция «Подходить к цели»
    requestSkill(w(), p, { id: m.id, x, y, target: typeof m.target === "string" ? m.target : null, ap: m.ap === true, until: 0 }, num(m.q, 0, 500) ?? 400);
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
    if (ref === undefined) return void p.send("toast", { text: "Это нельзя поставить на панель", kind: "error" });
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
    if (w().time - p.lastChat < 600) return p.send("toast", { text: "Не так быстро", kind: "error" });
    p.lastChat = w().time;
    w().playerChat(p, text);
  });
}
