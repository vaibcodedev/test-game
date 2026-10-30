/**
 * Директор мирового босса (задача 151, docs/systems/bosses.md §1): один на босса (слот layout.bossSlots). Этапы sleep → soon → alive → dead:
 * окно по trigger (расписание или случайно с предвестниками), объявления за announceMin минут от Глашатаев своей фракции, «В форт» с
 * −teleportMin; появление — в точке слота (по очереди или случайно), рёв на весь мир; не убит за lifeMin — уходит.
 * Поводок: босс бьёт только тех, кто в круге арены (угроза вне круга снимается), уходит дальше — идёт домой без лечения; сброс
 * здоровья — только если в круге resetEmptySec нет живого героя. Сила по толпе: здоровье растёт ступенями по числу героев в круге.
 * Вклад: урон по боссу и свите, лечение героев в бою с ним, урон, принятый держащим агро; секунды действий в круге (бронза);
 * без ввода afkMs — не копится; вышел с Полей — сгорает; один герой с аккаунта. Итог — rewards.ts, Летопись и знамя — index.ts.
 */
import { MOBS } from "../../../shared/mobs";
import { Zone, zoneAtPx } from "../../../shared/map";
import { PLAYER_RADIUS } from "../../../shared/constants";
import { WB, wbMobId, wbNextWindow, wbSlot, wbText, type WbBossDef, type WbChronicleEntry, type WbSlot, type WbStage, type WbStateMsg, type WbTier, type WbTopRow } from "../../../shared/worldBoss";
import { Announcer } from "../game/eventClock";
import { Mob } from "../game/Mob";
import type { Player } from "../game/Player";
import type { Actor, World } from "../game/World";
import { Colossus } from "./colossus";
import { grantWb } from "./rewards";
import type { WorldBosses } from "./index";

const MIN = 60000;
const C = WB.contrib;
const LEAVE = new Set(C.leaveZones.map((z) => (Zone as unknown as Record<string, number>)[z]).filter((z) => z !== undefined));

export interface WbEntry {
  key: string; name: string; cls: string; faction: string; account: number;
  dmg: number; heal: number; tank: number; bonus: number; actMs: number; sent: number;
}
export const entryV = (e: WbEntry) => e.dmg + e.heal + e.tank + e.bonus;

export class WorldBossDirector {
  stage: WbStage = "sleep";
  /** Окно: объявленное время и настоящее появление. */
  win: { mark: number; at: number } | null = null;
  readonly slot: WbSlot;
  mob: Mob | null = null;
  brain: Colossus | null = null;
  readonly contrib = new Map<string, WbEntry>();
  startAt = 0;
  aliveUntil = 0;
  endAt = 0;
  peakHp = 0;
  /** Итог последнего боя (тест, повторный показ). */
  last: WbChronicleEntry | null = null;
  private announcer = new Announcer(WB.clock.announceMin);
  private omensSaid = new Set<number>();
  private tpSaid = false;
  private emptySince = 0;
  private tickAt = 0;
  private sentAt = 0;
  private weakAt = new Map<string, number>();

  constructor(readonly w: World, readonly def: WbBossDef, private mgr: WorldBosses) {
    const s = wbSlot(def.slot);
    if (!s || !s.points.length) throw new Error(`data/world-bosses.json ${def.id}: нет слота ${def.slot} в data/world.json layout.bossSlots`);
    this.slot = s;
  }
  private now() { return this.mgr.now(); }
  private saved() { return (this.mgr.saved.bosses[this.def.id] ??= { spawns: 0, lastEnd: 0 }); }
  /** Точка следующего появления: по очереди или случайно. */
  spot(n = this.saved().spawns): { x: number; y: number } {
    const pts = this.slot.points;
    return this.def.pick === "random" ? pts[Math.floor(Math.random() * pts.length)] : pts[n % pts.length];
  }
  isMine(a: Actor): boolean {
    return !this.w.isPlayer(a) && !!this.mob && (a === this.mob || !!this.brain?.isAdd(a));
  }
  inCircle(p: { x: number; y: number }, pad = PLAYER_RADIUS): boolean {
    const h = this.mob?.home ?? this.spot();
    return Math.hypot(p.x - h.x, p.y - h.y) <= this.slot.arena + pad;
  }

  // ---------------------------------------------------------------- такт
  update() {
    const now = this.now();
    if (this.stage === "sleep" || this.stage === "dead") {
      if (!this.win) this.win = wbNextWindow(this.def, now, this.saved().lastEnd || now);
      if (this.win.mark - now <= this.announcer.first * MIN) this.toSoon();
    }
    if (this.stage === "soon") this.tickSoon(now);
    else if (this.stage === "alive") this.tickAlive(now);
    if (now - this.sentAt >= (this.stage === "alive" ? WB.clock.stateEveryMs : WB.clock.stateEveryMs * 3)) this.broadcast();
  }

  private toSoon() {
    this.stage = "soon";
    this.announcer.reset();
    this.omensSaid.clear();
    this.tpSaid = false;
    this.broadcast();
  }
  private tickSoon(now: number) {
    const win = this.win!, left = win.mark - now, t = this.def.trigger;
    if (t.kind === "random") {
      // предвестники: только зона, без точки
      for (const o of t.omens ?? []) if (left <= o.min * MIN && !this.omensSaid.has(o.min)) { this.omensSaid.add(o.min); if (left > 0) this.mgr.clock.say(o.text, { kind: "omen", from: this.def.chronicler }); }
    } else {
      const min = this.announcer.due(left);
      if (min !== null) this.heraldSay(wbText(this.def.texts.soon, { name: this.def.name, min }));
      if (!this.tpSaid && left <= WB.clock.teleportMin * MIN && left > 0) { this.tpSaid = true; this.heraldSay(wbText(this.def.texts.teleport, { name: this.def.name, min: Math.ceil(left / MIN) })); }
    }
    if (now >= win.at) this.spawn(now);
  }
  /** Объявление от Глашатая каждой фракции — её героям. */
  private heraldSay(text: string) {
    for (const [f, who] of Object.entries(this.def.heralds)) this.mgr.clock.say(text, { kind: "wboss", from: who, only: f });
  }

  /** Появление (по окну или отладкой). */
  spawn(now = this.now()) {
    if (this.stage === "alive") return;
    const def = MOBS[wbMobId(this.def.id)];
    const at = this.spot();
    const m = new Mob(this.w.uid("wb"), def, this.def.level, { x: at.x, y: at.y });
    m.summoned = true; // не возрождается сам; после смерти убирается
    const brain = new Colossus(this.w, m, this.slot.arena, this.def, {
      onDeath: () => this.onBossDeath(),
      announce: (text) => this.mgr.clock.say(text, { kind: "wboss", from: this.def.chronicler, chat: true }),
    });
    m.boss = brain;
    this.mob = m;
    this.brain = brain;
    this.w.addMob(m);
    this.w.emit({ t: "spawn", id: m.id, k: "smoke" });
    this.stage = "alive";
    this.contrib.clear();
    this.startAt = now;
    this.aliveUntil = now + this.def.lifeMin * MIN;
    this.emptySince = now;
    this.tickAt = 0;
    this.peakHp = m.unit.maxHp;
    this.saved().spawns++;
    this.mgr.persist();
    this.mgr.clock.say(wbText(this.def.texts.spawn, { name: this.def.name }), { kind: "roar", from: this.def.chronicler });
    this.broadcast();
  }

  private tickAlive(now: number) {
    const m = this.mob;
    if (!m) return;
    // поводок: угроза только у тех, кто в круге
    for (const id of [...m.threat.keys()]) { const p = this.w.players.get(id); if (p && !this.inCircle(p)) m.threat.delete(id); }
    if (m.tauntUntil > this.w.time) { const tp = this.w.players.get(m.tauntBy); if (tp && !this.inCircle(tp)) m.tauntUntil = 0; }
    if (m.targetId) { const tp = this.w.players.get(m.targetId); if (tp && !this.inCircle(tp)) { m.targetId = null; m.unit.target = ""; } }
    // раз в секунду по часам симуляции (сила по толпе, действия в круге, уход с Полей)
    const wt = this.w.time;
    if (wt < this.tickAt) return;
    const dt = this.tickAt ? Math.min(2000, wt - this.tickAt + 1000) : 1000;
    this.tickAt = wt + 1000;
    if (m.dead) return;
    const inside = this.w.playersInCircle(m.home.x, m.home.y, this.slot.arena);
    const strong = inside.filter((p) => p.level >= WB.minLevel);
    // сила по толпе: только вверх, доля здоровья сохраняется
    const cr = this.def.crowd, steps = Math.max(1, Math.ceil(strong.length / cr.step));
    const want = Math.round(m.stats.maxHp * (1 + cr.hpPerStep * (steps - 1)));
    if (want > m.unit.maxHp) {
      const f = m.unit.hp / m.unit.maxHp;
      m.unit.maxHp = want;
      m.unit.hp = Math.max(1, Math.round(want * f));
    }
    this.peakHp = Math.max(this.peakHp, m.unit.maxHp);
    // сброс здоровья — только при пустом круге resetEmptySec
    if (inside.length) this.emptySince = now;
    else if (now - this.emptySince >= this.def.resetEmptySec * 1000 && (m.unit.hp < m.unit.maxHp || this.brain!.phaseNo() > 0)) {
      const keep = m.unit.maxHp;
      m.reset();
      m.unit.maxHp = keep;
      m.unit.hp = keep;
      this.emptySince = now;
    }
    // секунды действий в круге (бронза без порога очков)
    for (const p of strong) if (!p.dead && !this.afk(p) && this.w.time - p.combatAt < C.combatMs) { const e = this.entry(p); if (e) e.actMs += dt; }
    // ушёл с Полей — вклад сгорает
    for (const e of [...this.contrib.values()]) {
      const p = this.w.findByName(e.key);
      if (!p || p.dead) continue;
      if (!LEAVE.has(zoneAtPx(this.w.map, p.x, p.y))) { this.contrib.delete(e.key); p.send("toast", { text: wbText(this.def.texts.burned, { name: this.def.name }), kind: "error" }); }
    }
    this.sendMe();
    if (now >= this.aliveUntil) this.depart(now);
  }

  private afk(p: Player) {
    return this.w.time - p.inputAt >= C.afkMs && this.w.time - p.combatAt >= C.afkMs;
  }
  /** Запись вклада героя (null — не может вносить: уровень, другой герой аккаунта уже в бою). */
  entry(p: Player): WbEntry | null {
    const key = p.name.toLowerCase();
    let e = this.contrib.get(key);
    if (e) return e;
    if (p.level < WB.minLevel || p.team) return null;
    if (p.accountId) for (const o of this.contrib.values()) if (o.account === p.accountId) { p.send("toast", { text: wbText(this.def.texts.oneChar), kind: "error" }); return null; }
    e = { key, name: p.name, cls: p.cls, faction: p.faction, account: p.accountId, dmg: 0, heal: 0, tank: 0, bonus: 0, actMs: 0, sent: -1 };
    this.contrib.set(key, e);
    return e;
  }

  // ---------------------------------------------------------------- хуки мира
  /** Слабый (ниже minLevel) не ранит босса и свиту: true — удар отменён. */
  weak(src: Actor, dst: Actor): boolean {
    if (this.stage !== "alive" || !this.w.isPlayer(src) || !this.isMine(dst) || src.level >= WB.minLevel) return false;
    const t = this.weakAt.get(src.id) ?? -1e9;
    if (this.w.time - t > 3000) { this.weakAt.set(src.id, this.w.time); src.send("toast", { text: wbText(this.def.texts.weak), kind: "error" }); }
    this.w.emit({ t: "dmg", id: dst.id, v: 0, imm: true });
    return true;
  }
  onDamage(src: Actor, dst: Actor, v: number) {
    if (this.stage !== "alive" || !this.mob) return;
    if (this.w.isPlayer(src) && this.isMine(dst)) {
      if (!this.afk(src)) { const e = this.entry(src); if (e) e.dmg += v * C.dmg; }
    } else if (this.w.isPlayer(dst) && this.isMine(src) && this.mob.targetId === dst.id) {
      const e = this.entry(dst);
      if (e) e.tank += v * C.tank;
    }
  }
  onHeal(by: Player, target: Player, got: number) {
    if (this.stage !== "alive" || !this.mob || got <= 0 || by.dead) return;
    if (!this.inCircle(target) || !(this.contrib.has(target.name.toLowerCase()) || this.mob.threat.has(target.id))) return;
    if (this.afk(by)) return;
    const e = this.entry(by);
    if (e) e.heal += got * C.heal;
  }
  /** Павший в круге — стак «Сбора павших» (и от PvP); убийца врага с вкладом получает долю его очков. */
  onKill(p: Player, killer?: Actor) {
    if (this.stage !== "alive" || !this.mob || this.mob.dead) return;
    if (!this.inCircle(p)) return;
    this.brain?.addStack();
    if (killer && this.w.isPlayer(killer) && killer.faction !== p.faction) {
      const ve = this.contrib.get(p.name.toLowerCase());
      if (ve && entryV(ve) > 0) { const ke = this.entry(killer); if (ke) ke.bonus += entryV(ve) * C.pvpSteal; }
    }
  }

  // ---------------------------------------------------------------- итог
  /** Порог вклада по полному здоровью босса (пик за бой). */
  tierOf(e: WbEntry, maxHp = this.peakHp): WbTier {
    const v = entryV(e);
    if (v >= C.gold * maxHp) return "gold";
    if (v >= C.silver * maxHp) return "silver";
    if (v >= C.bronze * maxHp || e.actMs >= C.bronzeActSec * 1000) return "bronze";
    return "";
  }
  /** Суммы фракций: доля одного героя — не больше capShare общей суммы. */
  totals(): [number, number] {
    const all = [...this.contrib.values()], sum = all.reduce((a, e) => a + entryV(e), 0), cap = sum * C.capShare;
    const t: [number, number] = [0, 0];
    for (const e of all) { if (e.faction === "solgard") t[0] += Math.min(entryV(e), cap); else if (e.faction === "umbrath") t[1] += Math.min(entryV(e), cap); }
    return [Math.round(t[0]), Math.round(t[1])];
  }

  private onBossDeath() {
    if (this.stage !== "alive") return;
    const now = this.now(), m = this.mob!;
    this.stage = "dead";
    this.endAt = now;
    const x = m.x, y = m.y, xp = m.stats.xp, level = m.level;
    // последний удар (косметика) пишет killMob после хука смерти — итог на следующем такте
    this.w.later(1, () => this.finish(now, x, y, xp, level));
  }
  private finish(now: number, x: number, y: number, bossXp: number, bossLevel: number) {
    const tot = this.totals();
    const win = tot[0] > tot[1] ? "solgard" : tot[1] > tot[0] ? "umbrath" : "";
    const top = (k: "dmg" | "heal" | "tank"): WbTopRow[] => [...this.contrib.values()].filter((e) => e[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, WB.chronicle.top)
      .map((e) => ({ name: e.name, cls: e.cls, faction: e.faction, v: Math.round(e[k]) }));
    const entry: WbChronicleEntry = {
      boss: this.def.id, name: this.def.name, at: now, durationMs: now - this.startAt, win, totals: tot, heroes: this.contrib.size,
      top: { dmg: top("dmg"), heal: top("heal"), tank: top("tank") }, last: this.w.bossKills.get(wbMobId(this.def.id))?.by ?? "",
    };
    this.last = entry;
    const heart = this.def.rewards.heartChest ? this.w.war?.bases.get(this.def.rewards.heartChest.heart)?.owner ?? "" : "";
    const ctx = { w: this.w, def: this.def, now, win, bossXp, bossLevel, x, y, heartOwner: heart, acct: this.mgr.saved.acct };
    for (const e of this.contrib.values()) {
      const p = this.w.findByName(e.key);
      if (!p) continue;
      const tier = this.tierOf(e);
      const me = tier ? grantWb(ctx, p, entryV(e), tier) : null;
      p.send("wboss:result", { boss: this.def.id, win, me, entry });
    }
    this.mgr.onFinished(this, entry);
    this.mgr.clock.say(win ? wbText(this.def.texts.dead, { name: this.def.name, faction: this.mgr.factionName(win) }) : wbText(this.def.texts.deadNone, { name: this.def.name }), { kind: "dead", from: this.def.chronicler });
    this.close(now);
  }
  /** Не убит за lifeMin — уходит без наград. */
  depart(now = this.now()) {
    if (this.stage !== "alive") return;
    this.mgr.clock.say(wbText(this.def.texts.gone, { name: this.def.name }), { kind: "gone", from: this.def.chronicler });
    this.removeMob();
    this.stage = "dead";
    this.endAt = now;
    this.close(now);
  }
  private removeMob() {
    const m = this.mob;
    if (!m) return;
    this.brain?.reset();
    if (this.w.mobs.get(m.id) === m) this.w.removeMob(m);
  }
  private close(now: number) {
    this.contrib.clear();
    this.mob = null;
    this.brain = null;
    this.saved().lastEnd = now;
    this.win = wbNextWindow(this.def, now, now);
    this.mgr.persist();
    this.broadcast();
  }
  /** Сброс отладкой: босс убран, этап sleep, окно — заново. */
  reset() {
    this.removeMob();
    this.mob = null;
    this.brain = null;
    this.contrib.clear();
    this.stage = "sleep";
    this.win = null;
    this.broadcast();
  }
  /** Отладка: «скоро» — окно через ms (по умолчанию за первое объявление). */
  soon(ms = this.announcer.first * MIN) {
    if (this.stage === "alive") return;
    const now = this.now();
    this.win = { mark: now + ms, at: now + ms };
    this.stage = "sleep";
    this.toSoon();
  }

  // ---------------------------------------------------------------- сообщения
  view(now = this.now()): WbStateMsg {
    const m = this.mob, h = m?.home ?? this.spot(), secret = this.def.trigger.kind === "random" && this.stage === "soon";
    const n: [number, number] = [0, 0];
    if (m) for (const p of this.w.playersInCircle(h.x, h.y, this.slot.arena)) { if (p.faction === "solgard") n[0]++; else if (p.faction === "umbrath") n[1]++; }
    return {
      id: this.def.id, name: this.def.name, st: this.stage, next: this.win?.mark ?? 0, now,
      x: secret ? 0 : h.x, y: secret ? 0 : h.y, r: this.slot.arena,
      hp: m ? m.unit.hp : 0, maxHp: m ? m.unit.maxHp : 0, phase: this.brain?.phaseNo() ?? 0, stacks: this.brain?.stacks ?? 0, n, endAt: this.endAt,
    };
  }
  broadcast() {
    this.sentAt = this.now();
    this.w.broadcast("wboss", this.view());
  }
  private sendMe() {
    if (!this.contrib.size) return;
    const max = this.peakHp, list = [...this.contrib.values()].sort((a, b) => entryV(b) - entryV(a));
    list.forEach((e, i) => {
      const v = Math.floor(entryV(e));
      if (v === e.sent) return;
      e.sent = v;
      const tier = this.tierOf(e), next = tier === "gold" ? 0 : Math.ceil((tier === "silver" ? C.gold : tier === "bronze" ? C.silver : C.bronze) * max);
      this.w.findByName(e.key)?.send("wboss:me", { id: this.def.id, v, tier, next, rank: i + 1 });
    });
  }
}
