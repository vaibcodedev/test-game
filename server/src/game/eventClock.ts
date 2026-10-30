/**
 * Общий планировщик событий (задача 151, docs/systems/bosses.md §1): «Час войны», осада, мировые боссы, позже ивенты — одна лента.
 * Announcer — пороги объявлений «за N минут» (вынесено из bannerWar.ts): все уже прошедшие пороги — одно объявление по ближайшему.
 * EventClock — источники событий регистрируются функцией; лента рассылается всем сообщением events раз в feedEveryMs и при смене.
 */
import type { World } from "./World";

const MIN = 60000;

/** Пороги объявлений «за N минут до начала». */
export class Announcer {
  private done = new Set<number>();
  constructor(private mins: readonly number[]) {}
  get first(): number { return Math.max(...this.mins); }
  reset() { this.done.clear(); }
  /**
   * Сколько минут объявить сейчас (left — мс до начала) или null. Сервер поднялся за 5 мин до начала — пороги 30 и 10 закрываются
   * одним объявлением «через 5 мин»; после начала (left ≤ 0) — ничего.
   */
  due(left: number): number | null {
    let hit: number | null = null;
    for (const m of this.mins) {
      if (left <= m * MIN && !this.done.has(m)) {
        for (const k of this.mins) if (k >= m) this.done.add(k);
        hit = m;
      }
    }
    return hit !== null && left > 0 ? Math.max(1, Math.ceil(left / MIN)) : null;
  }
}

/** Событие ленты. */
export interface ClockEvent {
  id: string;
  kind: "war" | "siege" | "wboss" | "event";
  name: string;
  /** Начало (мс, часы сервера); until — конец, если идёт. */
  at: number;
  until?: number;
  /** Идёт сейчас. */
  live: boolean;
  where?: string;
}

export class EventClock {
  private sources = new Map<string, () => ClockEvent[]>();
  private sentAt = 0;
  private sentKey = "";
  constructor(private w: World, private everyMs = 15000) {}
  register(id: string, fn: () => ClockEvent[]) { this.sources.set(id, fn); }
  /** Все события по времени начала (идущие — первыми). */
  feed(): ClockEvent[] {
    const out: ClockEvent[] = [];
    for (const fn of this.sources.values()) { try { out.push(...fn()); } catch (e) { console.error("[clock]", e); } }
    return out.sort((a, b) => Number(b.live) - Number(a.live) || a.at - b.at);
  }
  /** Ближайшее событие (для трекера под миникартой). */
  next(): ClockEvent | null { return this.feed()[0] ?? null; }
  /** Общее объявление: всем на экран (event:say) и в чат; only — только этой фракции. */
  say(text: string, opts: { kind?: string; from?: string; only?: string; chat?: boolean } = {}) {
    const line = opts.from ? `${opts.from}: ${text}` : text;
    for (const p of this.w.players.values()) {
      if (opts.only && p.faction !== opts.only) continue;
      p.send("event:say", { text, kind: opts.kind ?? "info", from: opts.from ?? "" });
      if (opts.chat !== false) p.send("chat", { from: "", text: line, sys: true });
    }
  }
  update(now = Date.now()) {
    if (now - this.sentAt < this.everyMs) return;
    const f = this.feed();
    const key = JSON.stringify(f);
    if (key === this.sentKey && now - this.sentAt < this.everyMs * 4) return;
    this.sentKey = key;
    this.sentAt = now;
    this.w.broadcast("events", f);
  }
}
