/**
 * Осада форта (задача 132, шаг 15; docs/systems/faction-war.md, раздел «Осада форта»; числа — data/siege.json, общее — shared/siege.ts).
 * По воскресеньям в 20:00 вместо «Часа войны»: нападает фракция с большим числом побед недели (поровну — осады нет, идёт обычная битва).
 * idle → prep (объявления) → siege (40 мин) → result (итоги; сломанные ворота чинятся в конце) → idle.
 * Ворота форта в осаде — неподвижная цель-моб фракции обороны (HP, урон героев ×heroMul); таран и камнемёты — машины нападающих (ИИ):
 * таран идёт и бьёт, пока рядом escort своих героев, камнемёт стреляет при экипаже crew. Сломаны ворота — двор открыт, королевское знамя
 * обороны во дворе — по правилам Сердца (опора нападающих — пролом). Поднято знамя нападающих — форт взят; ворота целы к breachMin
 * или время вышло — оборона отстояла. Итог: неделю знамя победителя над воротами и +xpGold опыта и золота на Полях всей фракции,
 * взявшим — титул; Знаки и сундук — выдачей «Знамён» (BannerWar.grant, одна транзакция). Проскок сквозь ворота рывком — откат.
 */
import { CITIES } from "../../../shared/cities";
import { castTeleport } from "./cities";
import { TILE } from "../../../shared/constants";
import { FACTIONS } from "../../../shared/factions";
import { Dir, UnitKind } from "../../../shared/protocol";
import type { MobDef } from "../../../shared/mobs";
import { T } from "../../../shared/texts";
import { raiseSec, WAR, weekKey, type WarBaseView, type WarFaction, type WarSayMsg, type WarTopRow } from "../../../shared/bannerWar";
import { crossesGate, GATE_BROKEN, GATES, nextSiegeStart, SIEGE, siegeAttacker, siegeBannerAt, type GateDef, type SiegePhase, type SiegeResultMsg, type SiegeStateMsg } from "../../../shared/siege";
import { Mob } from "./Mob";
import type { Player } from "./Player";
import type { Actor, World } from "./World";

const D = SIEGE, S = D.schedule, C = WAR.capture, K = WAR.contrib, MIN = 60000;
const fi = (f: WarFaction) => (f === "solgard" ? 0 : 1);
const foe = (f: WarFaction): WarFaction => (f === "solgard" ? "umbrath" : "solgard");
const fname = (f: WarFaction) => FACTIONS[f].name;
const isWarFaction = (f: unknown): f is WarFaction => f === "solgard" || f === "umbrath";
const cityName = (id: string) => CITIES.find((c) => c.id === id)?.name ?? id;

type EngineKind = "gate" | "ram" | "catapult";
const DEFS = new Map<EngineKind, MobDef>();
function defOf(k: EngineKind): MobDef {
  let d = DEFS.get(k);
  if (d) return d;
  const e = k === "gate" ? D.gates : k === "ram" ? D.ram : D.catapults;
  d = {
    id: `siege_${k}`, name: T(k === "gate" ? "srv.siege.1" : k === "ram" ? "srv.siege.2" : "srv.siege.3"), sprite: `siege_${k}`, size: 2,
    hp: e.hp, dmg: 0, armor: e.armor, xp: 0, gold: 0, speed: k === "ram" ? D.ram.speed : 0, aggro: 0, range: 0, attackCd: 99, radius: e.radius, color: "#c8a060",
  };
  DEFS.set(k, d);
  return d;
}

interface GateRt { def: GateDef; mob: Mob | null; broken: boolean }
interface EngineRt { kind: "ram" | "catapult"; gate: GateDef; home: { x: number; y: number }; mob: Mob | null; downUntil: number; actAt: number }
interface Contrib { name: string; cls: string; faction: WarFaction; v: number; acc: number }
interface BannerRt {
  owner: WarFaction | null; banner: WarFaction | null; h: number; n: [number, number]; inside: Player[];
  hang: { f: WarFaction; pid: string; x: number; y: number; hp: number; at: number } | null;
  emptyAt: number; fallen: WarFaction | null; changedAt: number; alarmAt: number;
}

export class FortSiege {
  phase: SiegePhase = "idle";
  fort = "";
  att: WarFaction = "umbrath";
  def: WarFaction = "solgard";
  t0 = 0;
  t1 = 0;
  breachAt = 0;
  resultUntil = 0;
  gates: GateRt[] = [];
  engines: EngineRt[] = [];
  banner: BannerRt = this.freshBanner(null);
  readonly contrib = new Map<string, Contrib>();
  stats = { breaches: 0, engines: 0, kills: 0 };
  lastResult: SiegeResultMsg | null = null;
  private announced = new Set<number>();
  private tickAt = 0;
  private lastTick = 0;
  private sentAt = 0;
  private sentKey = "";
  private known = new Set<string>();
  private prev = new Map<string, { x: number; y: number }>();

  constructor(private w: World) {}

  now(): number { return this.w.war ? this.w.war.now() : Date.now(); }
  active(): boolean { return this.phase === "siege" || (this.phase === "prep" && this.t0 - this.now() <= WAR.schedule.teleportMin * MIN); }
  private freshBanner(f: WarFaction | null): BannerRt {
    return { owner: f, banner: f, h: f ? 1 : 0, n: [0, 0], inside: [], hang: null, emptyAt: 0, fallen: null, changedAt: -1e15, alarmAt: -1e15 };
  }
  private fortCity() { return CITIES.find((c) => c.id === this.fort)!; }
  /** Лагерь нападающих — у ворот тарана, снаружи (там же возрождение). */
  camp(): { x: number; y: number } {
    const g = GATES.find((x) => x.city === this.fort && x.side === D.ram.gate)!;
    return { x: g.x + D.ram.camp[0] * TILE, y: g.y + D.ram.camp[1] * TILE };
  }
  private anyBroken() { return this.gates.some((g) => g.broken); }

  // ---------- такт ----------
  update() {
    this.guardGates();
    const now = this.now();
    for (const p of this.w.players.values()) if (!this.known.has(p.id)) { this.known.add(p.id); p.send("siege", this.view(now)); }
    if (now < this.tickAt) return;
    this.tickAt = now + C.tickMs;
    const dt = this.lastTick ? Math.max(0, Math.min(1000, now - this.lastTick)) : C.tickMs;
    this.lastTick = now;
    for (const id of this.known) if (!this.w.players.has(id)) { this.known.delete(id); this.prev.delete(id); }
    if (this.phase === "idle" && WAR.schedule.sundaySiege && this.w.war && this.w.war.phase === "idle") {
      const s = nextSiegeStart(now), att = siegeAttacker(this.w.war.saved.wins);
      if (att && s - now <= Math.max(...S.announceMin) * MIN) this.prep(s, att);
    }
    if (this.phase === "prep") this.tickPrep(now);
    else if (this.phase === "siege") this.tickSiege(now, dt);
    else if (this.phase === "result" && now >= this.resultUntil) this.finish();
    this.broadcastState(now);
  }

  /** Проскок сквозь закрытые ворота рывком или прыжком (обычный шаг держит moveGated): откат на прошлое место. */
  private guardGates() {
    for (const p of this.w.players.values()) {
      const q = this.prev.get(p.id);
      if (q && !p.dead && crossesGate(q.x, q.y, p.x, p.y, p.faction)) { p.unit.x = q.x; p.unit.y = q.y; p.moveTo = null; continue; }
      if (q) { q.x = p.x; q.y = p.y; } else this.prev.set(p.id, { x: p.x, y: p.y });
    }
  }

  private prep(t0: number, att: WarFaction) {
    this.phase = "prep";
    this.att = att;
    this.def = foe(att);
    this.fort = `fort_${this.def}`;
    this.t0 = t0;
    this.t1 = t0 + S.durationMin * MIN;
    this.breachAt = t0 + S.breachMin * MIN;
    this.announced.clear();
  }
  private tickPrep(now: number) {
    const left = this.t0 - now;
    for (const m of S.announceMin) {
      if (left <= m * MIN && !this.announced.has(m)) {
        for (const k of S.announceMin) if (k >= m) this.announced.add(k);
        if (left > 0) this.say({ text: T("srv.siege.4", { min: Math.max(1, Math.ceil(left / MIN)), fort: cityName(this.fort), att: fname(this.att) }), kind: "info" }, true);
      }
    }
    if (left <= 0) this.start(now, this.att);
  }

  /** Начало осады (по расписанию или отладкой). */
  start(now = this.now(), att: WarFaction = this.att) {
    this.clearUnits();
    for (const g of GATES) GATE_BROKEN.delete(g.id);
    this.phase = "siege";
    this.att = att;
    this.def = foe(att);
    this.fort = `fort_${this.def}`;
    this.t0 = now;
    this.t1 = now + S.durationMin * MIN;
    this.breachAt = now + S.breachMin * MIN;
    this.contrib.clear();
    this.stats = { breaches: 0, engines: 0, kills: 0 };
    this.gates = GATES.filter((g) => g.city === this.fort).map((g) => ({ def: g, mob: this.spawn("gate", this.def, g.x, g.y), broken: false }));
    const gateOf = (side: string) => GATES.find((g) => g.city === this.fort && g.side === side)!;
    const rg = gateOf(D.ram.gate), camp = this.camp();
    this.engines = [{ kind: "ram", gate: rg, home: camp, mob: null, downUntil: 0, actAt: 0 }];
    for (const s of D.catapults.spots) {
      const g = gateOf(s.gate);
      this.engines.push({ kind: "catapult", gate: g, home: { x: g.x + s.dx * TILE, y: g.y + s.dy * TILE }, mob: null, downUntil: 0, actAt: 0 });
    }
    for (const e of this.engines) e.mob = this.spawn(e.kind, this.att, e.home.x, e.home.y);
    this.banner = this.freshBanner(this.def);
    this.banner.emptyAt = now;
    this.say({ text: T("srv.siege.5", { att: fname(this.att), fort: cityName(this.fort) }), sub: T("srv.siege.6"), kind: "start", f: this.att }, true);
    this.sentKey = "";
  }

  private spawn(k: EngineKind, f: WarFaction, x: number, y: number): Mob {
    const m = new Mob(this.w.uid(k === "gate" ? "g" : "e"), defOf(k), D.gates.level, { x, y });
    m.faction = f;
    m.siege = true;
    m.unit.kind = UnitKind.Soldier;
    m.unit.faction = f;
    if (k === "gate") m.dmgTakenMul = D.gates.heroMul;
    this.w.addMob(m);
    return m;
  }
  private clearUnits() {
    for (const g of this.gates) if (g.mob) this.w.removeMob(g.mob);
    for (const e of this.engines) if (e.mob) this.w.removeMob(e.mob);
    this.gates = [];
    this.engines = [];
  }

  private heroes(): Player[] {
    return [...this.w.players.values()].filter((p) => !p.dead && p.team === 0 && p.level >= WAR.minLevel && isWarFaction(p.faction));
  }
  private entry(p: Player): Contrib {
    const key = p.name.toLowerCase();
    let e = this.contrib.get(key);
    if (!e) this.contrib.set(key, (e = { name: p.name, cls: p.cls, faction: p.faction as WarFaction, v: 0, acc: 0 }));
    return e;
  }
  private add(p: Player, v: number) { if (v > 0 && isWarFaction(p.faction)) this.entry(p).v += v; }
  private split(list: Player[], v: number) { for (const p of list) this.add(p, v / list.length); }

  private tickSiege(now: number, dt: number) {
    const heroes = this.heroes();
    for (const g of this.gates) {
      const m = g.mob;
      if (!m) continue;
      m.unit.x = g.def.x; m.unit.y = g.def.y; // отбрасывание и притягивание ворота не двигают
      if (!g.broken && m.dead) this.breach(g, now, heroes);
    }
    for (const e of this.engines) this.tickEngine(e, now, dt, heroes);
    this.tickBanner(now, dt, heroes);
    if (this.banner.owner === this.att) return this.end(now, this.att, "taken");
    if (!this.anyBroken() && now >= this.breachAt) return this.end(now, this.def, "gates");
    if (now >= this.t1) this.end(now, this.def, "time");
  }

  private breach(g: GateRt, now: number, heroes: Player[]) {
    g.broken = true;
    GATE_BROKEN.add(g.def.id);
    this.stats.breaches++;
    this.split(heroes.filter((p) => p.faction === this.att && Math.hypot(p.x - g.def.x, p.y - g.def.y) <= 15 * TILE), D.contrib.breach);
    this.w.broadcast("siege:fx", { k: "breach", x: g.def.x, y: g.def.objY, gate: g.def.id });
    const m = g.mob;
    if (m) this.w.later(2500, () => { if (g.mob === m) { this.w.removeMob(m); g.mob = null; } });
    this.say({ text: T("srv.siege.8", { fort: cityName(this.fort) }), kind: "tear", f: this.att }, true);
    if (now < this.breachAt) this.say({ text: T("srv.siege.20", { fort: cityName(this.fort) }), kind: "alarm", f: this.def }, false, this.def);
  }

  private tickEngine(e: EngineRt, now: number, dt: number, heroes: Player[]) {
    const m = e.mob;
    if (m && m.dead) {
      // разбита: вклад бившим её героям обороны, новая — через respawnMs
      const by = [...m.damageBy.keys()].map((id) => this.w.players.get(id)).filter((p): p is Player => !!p && p.faction === this.def);
      this.split(by, D.contrib.engineKill);
      this.stats.engines++;
      const ms = e.kind === "ram" ? D.ram.respawnMs : D.catapults.respawnMs;
      e.downUntil = now + ms;
      e.mob = null;
      this.w.later(2500, () => this.w.removeMob(m));
      this.say({ text: T("srv.siege.7", { engine: m.def.name, sec: Math.round(ms / 1000) }), kind: "alarm", f: this.att }, false, this.att);
      return;
    }
    if (!m) {
      if (now >= e.downUntil) e.mob = this.spawn(e.kind, this.att, e.home.x, e.home.y);
      return;
    }
    const gate = this.gates.find((g) => g.def.id === e.gate.id);
    const ram = e.kind === "ram";
    const R = (ram ? D.ram.escortTiles : D.catapults.crewTiles) * TILE, need = ram ? D.ram.escort : D.catapults.crew;
    const crew = heroes.filter((p) => p.faction === this.att && Math.hypot(p.x - m.x, p.y - m.y) <= R);
    const manned = crew.length >= need;
    if (manned) for (const p of crew) {
      const c = this.entry(p);
      c.acc += dt;
      while (c.acc >= D.contrib.crewEvery) { c.acc -= D.contrib.crewEvery; c.v += D.contrib.crew; }
    }
    if (!gate || gate.broken || !gate.mob || gate.mob.dead || !manned) return;
    if (ram) {
      const gx = e.gate.ox, gy = e.gate.oy, d = Math.hypot(gx - m.x, gy - m.y);
      if (d > 6) {
        const wp = m.nav.next(this.w.map, m.x, m.y, gx, gy, 10, this.w.time);
        if (wp) {
          const dx = wp.x - m.x, dy = wp.y - m.y, dd = Math.hypot(dx, dy) || 1, sp = Math.min(D.ram.speed * (dt / 1000), dd);
          const n = this.w.move(m.x, m.y, (dx / dd) * sp, (dy / dd) * sp, 10, this.att);
          m.unit.x = Math.round(n.x * 10) / 10; m.unit.y = Math.round(n.y * 10) / 10;
          m.unit.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down;
        }
        return;
      }
      if (now < e.actAt) return;
      e.actAt = now + D.ram.hitMs;
      this.w.broadcast("siege:fx", { k: "ram", x: e.gate.x, y: e.gate.objY, from: m.id, gate: e.gate.id });
      this.w.applyDamage(gate.mob, Math.ceil(gate.mob.unit.maxHp * D.ram.hitPct));
      return;
    }
    if (now < e.actAt) return;
    e.actAt = now + D.catapults.shotMs;
    const gm = gate.mob;
    this.w.broadcast("siege:fx", { k: "stone", x: m.x, y: m.y - 24, tx: e.gate.x, ty: e.gate.objY - 40, ms: D.catapults.flightMs, from: m.id, gate: e.gate.id });
    this.w.later(D.catapults.flightMs, () => { if (this.phase === "siege" && !gate.broken && gate.mob === gm && !gm.dead) this.w.applyDamage(gm, Math.ceil(gm.unit.maxHp * D.catapults.hitPct)); });
  }

  // ---------- королевское знамя во дворе (правила Сердца; опора нападающих — пролом) ----------
  private support(f: WarFaction) { return f === this.def || this.anyBroken(); }
  private tickBanner(now: number, dt: number, heroes: Player[]) {
    const r = this.banner, at = siegeBannerAt(this.fort), R = D.banner.radius * TILE;
    r.inside = heroes.filter((p) => !p.unit.mount && !this.w.stealthed(p) && Math.hypot(p.x - at.x, p.y - at.y) <= R);
    const prevAtt = r.n[fi(this.att)];
    r.n = [r.inside.filter((p) => p.faction === "solgard").length, r.inside.filter((p) => p.faction === "umbrath").length];
    if (r.n[fi(this.att)] > 0 && prevAtt === 0 && now - r.alarmAt > MIN) { r.alarmAt = now; this.say({ text: T("srv.siege.21", { fort: cityName(this.fort) }), kind: "alarm", f: this.def }, false, this.def); }
    if (r.n[0] + r.n[1] > 0) r.emptyAt = now;
    if (!this.anyBroken()) return; // двор закрыт, пока целы ворота: знамя не сдвинуть
    if (!r.banner) return this.tickHang(r, now);
    const F = r.banner, raise = (n: number) => raiseSec("heart", n) * 1000;
    const n = Math.max(-C.maxEdge, Math.min(C.maxEdge, r.n[fi(F)] - r.n[fi(foe(F))]));
    const h0 = r.h;
    if (!this.support(F)) r.h -= dt / (raise(1) * C.lowerMul);
    else if (n > 0) { if (r.owner !== F || r.h < 1) r.h += dt / raise(n); }
    else if (n < 0) r.h -= dt / (raise(-n) * C.lowerMul);
    else if (r.n[0] + r.n[1] === 0 && now - r.emptyAt >= C.emptyMs) {
      if (r.owner !== F) r.h -= dt / (raise(1) * C.lowerMul);
      else if (r.h < 1) r.h += dt / raise(1);
    }
    r.h = Math.max(0, Math.min(1, r.h));
    const moved = r.h !== h0;
    if (moved || (r.n[0] > 0 && r.n[1] > 0)) for (const p of r.inside) {
      const c = this.entry(p);
      c.acc += dt;
      while (c.acc >= K.circleEvery) { c.acc -= K.circleEvery; c.v += K.circle; }
    }
    if (r.h >= 1 && r.owner !== F) {
      r.owner = F;
      this.split(r.inside.filter((p) => p.faction === F), K.capture);
      this.say({ text: T("srv.siege.10", { faction: fname(F), fort: cityName(this.fort) }), kind: "capture", f: F }, true);
    } else if (r.h <= 0 && h0 > 0) {
      r.banner = null;
      r.fallen = F;
      if (r.owner === F) r.owner = null;
      this.split(r.inside.filter((p) => p.faction === foe(F)), K.tear);
      this.say({ text: T("srv.siege.11", { faction: fname(F), fort: cityName(this.fort) }), kind: "tear", f: foe(F) }, true);
    }
  }
  private tickHang(r: BannerRt, now: number) {
    if (r.hang) {
      const h = r.hang, p = this.w.players.get(h.pid), f = h.f, own = r.n[fi(f)], other = r.n[fi(foe(f))];
      const ok = !!p && r.inside.includes(p) && Math.hypot(p.x - h.x, p.y - h.y) < 6 && p.unit.hp >= h.hp && p.stunUntil <= this.w.time && own >= other && own >= C.heartMin && this.support(f);
      if (!ok) { if (other > 0) for (const q of r.inside) if (q.faction === foe(f)) this.add(q, K.interrupt); r.hang = null; }
      else if (now - h.at >= C.hangMs) {
        r.hang = null; r.banner = f; r.h = 0.0001; r.fallen = null;
        if (p) this.add(p, K.hang);
        this.say({ text: T("srv.siege.9", { faction: fname(f), fort: cityName(this.fort) }), kind: "alarm", f: foe(f) }, false, foe(f));
      }
      return;
    }
    for (const f of [this.att, this.def]) {
      const own = r.n[fi(f)], other = r.n[fi(foe(f))];
      if (!own || own <= other || own < C.heartMin || !this.support(f)) continue;
      const at = siegeBannerAt(this.fort);
      const p = r.inside.filter((q) => q.faction === f).sort((a, b) => Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y))[0];
      if (p) r.hang = { f, pid: p.id, x: p.x, y: p.y, hp: p.unit.hp, at: now };
      return;
    }
  }

  // ---------- итог ----------
  end(now: number, win: WarFaction, how: SiegeResultMsg["how"]) {
    if (this.phase !== "siege") return;
    const war = this.w.war;
    const until = now + D.reward.days * 86400000;
    if (war) { war.saved.siege = { fort: this.fort, flag: how === "taken" ? this.att : this.def, bonus: win, until }; war.persist(); }
    const top = { solgard: [] as WarTopRow[], umbrath: [] as WarTopRow[] };
    for (const e of [...this.contrib.values()].sort((x, y) => y.v - x.v)) if (top[e.faction].length < 5) top[e.faction].push({ name: e.name, cls: e.cls, contrib: Math.floor(e.v) });
    const base: SiegeResultMsg = { fort: this.fort, att: this.att, win, how, durationMs: now - this.t0, me: null, top, stats: { ...this.stats } };
    this.lastResult = base;
    const key = weekKey(now);
    for (const p of this.w.players.values()) {
      const e = this.contrib.get(p.name.toLowerCase());
      if (!e) continue;
      const g = war?.grant(p, e, win, false, key) ?? null;
      const title = how === "taken" && e.faction === this.att && Math.floor(e.v) >= WAR.rewards.minContrib ? this.giveTitle(p) : "";
      p.send("siege:result", { ...base, me: g ? { ...g, title } : null });
    }
    const result = how === "taken" ? T("srv.siege.12", { fort: cityName(this.fort), att: fname(this.att) }) : how === "gates" ? T("srv.siege.13", { def: fname(this.def), fort: cityName(this.fort) }) : T("srv.siege.14", { def: fname(this.def), fort: cityName(this.fort) });
    this.say({ text: result, kind: "end", f: win }, false);
    this.w.system(T("srv.siege.15", { fort: cityName(this.fort), result, faction: fname(win), pct: Math.round(D.reward.xpGold * 100) }));
    // цели больше нет: целые ворота снова неуязвимы, машины убраны; пролом остаётся до конца итогов
    for (const g of this.gates) if (g.mob && !g.broken) { this.w.removeMob(g.mob); g.mob = null; }
    for (const e of this.engines) if (e.mob) { this.w.removeMob(e.mob); e.mob = null; }
    this.engines = [];
    this.banner.hang = null;
    this.phase = "result";
    this.resultUntil = now + S.resultSec * 1000;
    this.sentKey = "";
  }
  /** Конец итогов: проломы чинятся, ворота снова закрыты для чужих. */
  private finish() {
    const fixed = this.gates.filter((g) => g.broken);
    for (const g of this.gates) GATE_BROKEN.delete(g.def.id);
    this.clearUnits();
    this.phase = "idle";
    if (fixed.length) {
      this.w.broadcast("siege:fx", { k: "repair", gates: fixed.map((g) => g.def.id) });
      this.say({ text: T("srv.siege.16", { fort: cityName(this.fort) }), kind: "info" }, false);
    }
    this.sentKey = "";
  }
  /** Титул «Сокрушитель форта»: один раз, активным — если своего нет. */
  private giveTitle(p: Player): string {
    const name = T("srv.siege.17"), s = p.save;
    s.titles ??= [];
    if (s.titles.some((t) => t.id === D.reward.title)) return "";
    s.titles.push({ id: D.reward.title, name, rank: "" });
    if (!s.title) { s.title = name; p.unit.title = name; }
    p.selfDirty = true;
    p.send("toast", { text: T("srv.siege.18", { title: name }), kind: "loot" });
    return name;
  }

  // ---------- вход в осаду ----------
  /** Возрождение в осаде: нападающие — в лагере у ворот, оборона — в своём форте (без потери золота). */
  respawnAt(p: Player): { x: number; y: number; free: boolean } | null {
    if (this.phase !== "siege" || !isWarFaction(p.faction) || p.level < WAR.minLevel) return null;
    const c = this.fortCity();
    if (Math.hypot(p.x - c.x * TILE, p.y - c.y * TILE) > 80 * TILE) return null;
    return p.faction === this.att ? { ...this.camp(), free: true } : { x: c.spawn.x, y: c.spawn.y, free: true };
  }
  teleport(p: Player, after?: () => void) {
    if (!this.active()) return p.send("toast", { text: T("srv.siege.19", { min: WAR.schedule.teleportMin }), kind: "error" });
    if (p.level < WAR.minLevel) return p.send("toast", { text: T("srv.bannerWar.17", { lvl: WAR.minLevel }), kind: "error" });
    if (p.dead || p.team || p.inCombat(this.w.time) || !isWarFaction(p.faction)) return p.send("toast", { text: T("srv.bannerWar.18"), kind: "error" });
    const c = this.fortCity(), to = p.faction === this.att ? this.camp() : c.spawn;
    castTeleport(this.w, p, { x: to.x, y: to.y }, p.faction === this.att ? "лагерь осады" : c.name, () => { this.prev.set(p.id, { x: to.x, y: to.y }); after?.(); });
  }
  onKill(victim: Player, killer?: Actor) {
    if (this.phase !== "siege" || !killer || !this.w.isPlayer(killer)) return;
    const k = killer as Player, c = this.fortCity();
    if (k.faction === victim.faction || !isWarFaction(k.faction) || k.level < WAR.minLevel || Math.hypot(victim.x - c.x * TILE, victim.y - c.y * TILE) > 60 * TILE) return;
    this.add(k, K.kill);
    this.stats.kills++;
  }

  // ---------- сообщения ----------
  private say(m: WarSayMsg, chat: boolean, only?: WarFaction) {
    for (const p of this.w.players.values()) {
      if (only && p.faction !== only) continue;
      p.send("war:say", m);
      if (only) p.send("chat", { from: "", text: m.text, sys: true });
    }
    if (chat && !only) this.w.system(m.text);
  }
  private bannerView(now: number): WarBaseView | null {
    if (this.phase !== "siege" && this.phase !== "result") return null;
    const r = this.banner, live = this.phase === "siege";
    return {
      id: `siege_${this.fort}`, o: r.owner ?? "", b: r.banner ?? "", h: Math.round(r.h * 100) / 100, n: live ? r.n : [0, 0], c: live && r.n[0] > 0 && r.n[1] > 0, s: 0,
      hf: live && r.hang ? r.hang.f : "", hp: live && r.hang ? Math.min(1, (now - r.hang.at) / C.hangMs) : 0, fl: r.fallen ?? "", lock: live && !this.anyBroken(),
    };
  }
  view(now = this.now()): SiegeStateMsg {
    const sw = this.w.war?.saved.siege, week = sw && now < sw.until ? sw : null;
    const on = this.phase !== "idle";
    return {
      ph: this.phase, fort: on ? this.fort : "", att: on ? this.att : "", def: on ? this.def : "", t0: this.t0, t1: this.t1, breach: this.breachAt, now,
      gates: this.gates.map((g) => ({ id: g.def.id, hp: g.broken ? 0 : g.mob ? Math.round((g.mob.unit.hp / g.mob.unit.maxHp) * 1000) / 1000 : 1, broken: g.broken })),
      broken: [...GATE_BROKEN], banner: this.bannerView(now), week: week ? { ...week } : null,
    };
  }
  private broadcastState(now: number) {
    const every = this.phase === "siege" ? 500 : 15000;
    if (now - this.sentAt < Math.min(every, 500)) return;
    const v = this.view(now);
    const key = JSON.stringify({ ...v, now: 0, banner: v.banner ? { ...v.banner, hp: Math.round(v.banner.hp * 10) } : null });
    if (key === this.sentKey && now - this.sentAt < every) return;
    this.sentKey = key;
    this.sentAt = now;
    this.w.broadcast("siege", v);
  }

  /** Отладка (dbg siege): start [att], breach [gate], hp gate pct, end [win], prep ms, reset. */
  debug(op: string, a: Record<string, unknown>) {
    const now = this.now();
    switch (op) {
      case "start": {
        if (this.phase === "siege") this.end(now, this.def, "time");
        const att = isWarFaction(a.att) ? a.att : (this.w.war && siegeAttacker(this.w.war.saved.wins)) ?? "umbrath";
        this.start(now, att);
        break;
      }
      case "breach": {
        const g = this.gates.find((x) => !x.broken && x.mob && (!a.gate || x.def.id === a.gate || x.def.side === a.gate));
        if (g?.mob) this.w.applyDamage(g.mob, g.mob.unit.hp + 1);
        break;
      }
      case "hp": {
        const g = this.gates.find((x) => x.mob && (x.def.id === a.gate || x.def.side === a.gate)) ?? this.gates.find((x) => x.mob);
        if (g?.mob) g.mob.unit.hp = Math.max(1, Math.round(g.mob.unit.maxHp * Math.max(0, Math.min(1, Number(a.pct) || 0))));
        break;
      }
      case "end": this.end(now, isWarFaction(a.win) ? a.win : this.def, a.win === this.att ? "taken" : "time"); break;
      case "prep": this.clearUnits(); this.phase = "idle"; this.prep(now + Math.max(0, Number(a.ms) || 0), isWarFaction(a.att) ? a.att : "umbrath"); break;
      case "reset":
        this.clearUnits();
        for (const g of GATES) GATE_BROKEN.delete(g.id);
        this.phase = "idle";
        if (this.w.war) { this.w.war.saved.siege = null; this.w.war.persist(); }
        break;
    }
    this.sentKey = "";
    this.sentAt = 0;
  }
}
