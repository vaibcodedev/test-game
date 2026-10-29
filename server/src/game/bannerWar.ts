/**
 * «Знамёна Предела» на Полях вечных битв (задача 132, шаг 14; docs/faction-war.md, раздел «На новой карте»; числа — data/faction-war.json).
 * Машина состояний: idle → prep (объявления за 30/10/1 мин, с −15 мин телепорт в свой форт) → battle (45 мин) → result (итоги) → idle.
 * Основание: круг radius тайлов; вывесить знамя у пустого основания (hangMs, стоя и без урона), подъём по перевесу своих над чужими,
 * спуск чужого в lowerMul раз дольше, спор — стоит; знамя наверху — захват (у боковой — печать), на нуле — срыв. Очки владельцам раз в 10 с,
 * победа — Сердце в конце или очки; все три точки routMs — разгром. Вклад → Знаки Полей (save.marks) и сундук материалов, выдача одной транзакцией.
 * Владельцы оснований переживают перезапуск (store) и дают бонусы фракции до следующей битвы фронта; в ночь на понедельник — «Перемирие».
 */
import fs from "node:fs";
import path from "node:path";
import { WAR, WAR_FACTIONS, WAR_FRONTS, WAR_RADIUS, nextWarStart, raiseSec, warFront, weekKey, type WarBaseDef, type WarBaseView, type WarFaction, type WarFrontDef, type WarPhase, type WarResultMsg, type WarSayMsg, type WarStateMsg, type WarTopRow } from "../../../shared/bannerWar";
import { CITIES } from "../../../shared/cities";
import { FACTIONS } from "../../../shared/factions";
import { makeItem, type Item } from "../../../shared/items";
import { Zone, zoneAtPx } from "../../../shared/map";
import { MATERIALS } from "../../../shared/upgrade";
import { TILE } from "../../../shared/constants";
import { T } from "../../../shared/texts";
import { addItem } from "./inventory";
import { registerAuraHook } from "./auras";
import { warAuraKey } from "../../../shared/auras";
import { SIEGE, siegeAttacker } from "../../../shared/siege";
import { Announcer } from "./eventClock";
import type { Player } from "./Player";
import type { Actor, World } from "./World";

const C = WAR.capture, S = WAR.schedule, SC = WAR.score, K = WAR.contrib, R = WAR.rewards, B = WAR.bonus;
const MIN = 60000;
const fi = (f: WarFaction) => (f === "solgard" ? 0 : 1);
const foe = (f: WarFaction): WarFaction => (f === "solgard" ? "umbrath" : "solgard");
const fname = (f: WarFaction) => FACTIONS[f].name;
const isWarFaction = (f: unknown): f is WarFaction => f === "solgard" || f === "umbrath";

/** Что хранится между перезапусками сервера. */
export interface WarSaved {
  owners: Record<string, WarFaction | "">;
  frontIdx: number;
  week: string;
  wins: [number, number];
  /** Неделя после осады форта (шаг 15, siege.ts): чьё знамя над воротами форта, кому бонус опыта и золота на Полях и до когда. */
  siege?: { fort: string; flag: WarFaction; bonus: WarFaction; until: number } | null;
}
export interface WarStore { load(): WarSaved | null; save(s: WarSaved): void }
/** Хранилище в JSON-файле (рядом с базой игры): запись через временный файл и переименование — файл не остаётся наполовину записанным. */
export function fileWarStore(file: string): WarStore {
  return {
    load: () => { try { return JSON.parse(fs.readFileSync(file, "utf8")) as WarSaved; } catch { return null; } },
    save: (s) => {
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(s)); fs.renameSync(file + ".tmp", file); }
      catch (e) { console.warn("[war] не удалось сохранить состояние:", (e as Error).message); }
    },
  };
}

interface BaseRt {
  def: WarBaseDef;
  owner: WarFaction | null;
  banner: WarFaction | null;
  h: number;
  hang: { f: WarFaction; pid: string; x: number; y: number; hp: number; at: number } | null;
  sealUntil: number;
  emptyAt: number;
  n: [number, number];
  inside: Player[];
  contestSince: number;
  alarmAt: number;
  changedAt: number;
  fallen: WarFaction | null;
  moved: boolean;
}
interface Contrib { name: string; cls: string; faction: WarFaction; v: number; acc: number }
/** Бонусы фракции от удержанных точек (между битвами и в битве). */
export interface WarBonus { xpGold: number; mats: number; speed: number; squads: boolean; dungeon: number; respawn: WarBaseDef[] }

/** Мир, чьи точки дают бафы земли (основной мир; арена и рейд своих BannerWar не создают). */
let LIVE: BannerWar | null = null;
/** Бафы земли в рамке героя: каждый удержанный бонус его фракции — значок war_<бонус>_<sol|umb> со сроком до следующей битвы фронта. */
registerAuraHook((a, now, aura) => {
  const w = LIVE, p = a as Player;
  if (!w || !p.save || p.team || !isWarFaction(p.faction)) return;
  const wall = w.now();
  for (const b of w.buffsOf(p.faction)) aura(b.k, now + Math.max(1000, b.until - wall), b.v ? { v: b.v } : undefined);
});

export class BannerWar {
  /** Сдвиг часов (отладка: перемотка), мс. */
  offset = 0;
  /** Часы ивента (мс, местное время сервера); тест подменяет. */
  now: () => number = () => Date.now() + this.offset;
  phase: WarPhase = "idle";
  front: WarFrontDef = WAR_FRONTS[0];
  t0 = 0;
  t1 = 0;
  resultUntil = 0;
  score: [number, number] = [0, 0];
  heartOpen = false;
  readonly bases = new Map<string, BaseRt>();
  readonly contrib = new Map<string, Contrib>();
  stats = { captures: 0, tears: 0, kills: 0 };
  saved: WarSaved;
  /** Последний итог (для теста и повторного показа). */
  lastResult: WarResultMsg | null = null;
  /** Объявления за 30/10/1 мин — общий Announcer планировщика событий (eventClock.ts, задача 151). */
  private announcer = new Announcer(S.announceMin);
  private tpAnnounced = false;
  private routSince = 0;
  private scoreAt = 0;
  private tickAt = 0;
  private lastTick = 0;
  private sentAt = 0;
  private sentKey = "";
  private known = new Set<string>();
  private moves = new Map<string, { x: number; y: number; at: number }>();
  private killLog = new Map<string, number[]>();

  constructor(private w: World, private store?: WarStore) {
    for (const f of WAR_FRONTS) for (const d of f.bases) this.bases.set(d.id, { def: d, owner: null, banner: null, h: 0, hang: null, sealUntil: 0, emptyAt: 0, n: [0, 0], inside: [], contestSince: 0, alarmAt: -1e15, changedAt: -1e15, fallen: null, moved: false });
    const s = store?.load();
    this.saved = { owners: {}, frontIdx: 0, week: "", wins: [0, 0], ...(s ?? {}) };
    for (const [id, f] of Object.entries(this.saved.owners)) {
      const r = this.bases.get(id);
      if (r && isWarFaction(f)) { r.owner = r.banner = f; r.h = 1; }
    }
    this.front = this.frontByIdx();
    this.applyBonuses();
    LIVE ??= this;
    // лента событий (eventClock.ts): ближайший «Час войны» или идущая битва
    w.clock?.register("war", () => {
      const now = this.now(), live = this.phase === "battle";
      const at = live || this.phase === "prep" ? this.t0 : nextWarStart(now, siegeAttacker(this.saved.wins) !== null);
      return [{ id: "war", kind: "war", name: this.front.name, at, until: live ? this.t1 : undefined, live }];
    });
  }

  /** Срок бонуса фронта (часы ивента): в битве этого фронта — её конец, иначе — начало его следующей битвы по кругу фронтов. */
  frontUntil(front: string): number {
    if (this.phase === "battle" && this.front.id === front) return this.t1;
    const rot = S.rotation, L = rot.length;
    let base = this.phase === "battle" ? this.t1 : this.phase === "prep" ? this.t0 - 1 : this.now();
    let i = this.phase === "battle" ? rot.indexOf(this.front.id) + 1 : this.saved.frontIdx;
    for (let k = 0; k < L * 3; k++, i++) {
      const s = this.phase === "prep" && k === 0 ? this.t0 : nextWarStart(base);
      if (rot[((i % L) + L) % L] === front) return s;
      base = s;
    }
    return this.now() + 7 * 86400000;
  }
  private buffCache: { at: number; f: Record<string, { k: string; until: number; v: number }[]> } = { at: 0, f: {} };
  /** Бафы земли фракции (пересчёт раз в секунду): удержанные бонусы фронтов и неделя после осады. */
  buffsOf(f: WarFaction): { k: string; until: number; v: number }[] {
    const now = this.now();
    if (now - this.buffCache.at > 1000) {
      this.buffCache = { at: now, f: {} };
      for (const g of WAR_FACTIONS) {
        const b = this.bonus[g], out: { k: string; until: number; v: number }[] = [];
        for (const fr of WAR_FRONTS) {
          const until = this.frontUntil(fr.id);
          const side = fr.bases.some((d) => d.kind === "side" && this.bases.get(d.id)?.owner === g);
          const heart = fr.bases.some((d) => d.kind === "heart" && this.bases.get(d.id)?.owner === g);
          const val: Record<string, number> = { xpGold: b.xpGold * 100, mats: b.mats * 100, speed: b.speed * 100, dungeon: b.dungeon * 100, squads: B.squadMin, respawn: 0 };
          if (side) out.push({ k: warAuraKey(fr.side, g), until, v: Math.round(val[fr.side]) });
          if (heart) out.push({ k: warAuraKey(fr.heart, g), until, v: Math.round(val[fr.heart]) });
        }
        const sw = this.saved.siege;
        if (sw && sw.bonus === g && now < sw.until) out.push({ k: warAuraKey("siege", g), until: sw.until, v: Math.round(SIEGE.reward.xpGold * 100) });
        this.buffCache.f[g] = out;
      }
    }
    return this.buffCache.f[f] ?? [];
  }

  private frontByIdx(): WarFrontDef {
    const rot = S.rotation;
    return warFront(rot[((this.saved.frontIdx % rot.length) + rot.length) % rot.length]) ?? WAR_FRONTS[0];
  }
  persist() {
    for (const r of this.bases.values()) this.saved.owners[r.def.id] = r.owner ?? "";
    this.store?.save(this.saved);
  }
  frontBases(): BaseRt[] {
    return this.front.bases.map((d) => this.bases.get(d.id)!);
  }

  // ---------- такт ----------
  update() {
    LIVE = this; // мир, который тикает этот ивент, — источник бафов земли
    const now = this.now();
    for (const p of this.w.players.values()) {
      if (!this.known.has(p.id)) { this.known.add(p.id); p.send("war", this.view(now)); }
      const m = this.moves.get(p.id);
      if (!m || Math.abs(m.x - p.x) > 2 || Math.abs(m.y - p.y) > 2) this.moves.set(p.id, { x: p.x, y: p.y, at: now });
    }
    if (now < this.tickAt) return;
    this.tickAt = now + C.tickMs;
    const dt = this.lastTick ? Math.max(0, Math.min(1000, now - this.lastTick)) : C.tickMs;
    this.lastTick = now;
    for (const id of this.known) if (!this.w.players.has(id)) { this.known.delete(id); this.moves.delete(id); }
    this.checkWeek(now);
    if (this.phase === "idle") {
      const s = nextWarStart(now, siegeAttacker(this.saved.wins) !== null);
      if (s - now <= this.announcer.first * MIN) this.prep(s);
    }
    if (this.phase === "prep") this.tickPrep(now);
    else if (this.phase === "battle") this.tickBattle(now, dt);
    else if (this.phase === "result" && now >= this.resultUntil) { this.phase = "idle"; this.front = this.frontByIdx(); }
    this.broadcastState(now);
  }

  /** Новая неделя: победы недели с нуля; вне битвы — «Перемирие» (знамёна падают, основания пустеют). */
  private checkWeek(now: number) {
    const key = weekKey(now);
    if (this.saved.week === key) return;
    const first = !this.saved.week;
    this.saved.week = key;
    this.saved.wins = [0, 0];
    if (!first && this.phase !== "battle") {
      for (const r of this.bases.values()) { r.owner = r.banner = null; r.h = 0; r.fallen = null; }
      this.say({ text: T("srv.bannerWar.14"), kind: "info" }, true);
      this.applyBonuses();
    }
    this.persist();
  }

  private prep(t0: number) {
    this.phase = "prep";
    this.front = this.frontByIdx();
    this.t0 = t0;
    this.t1 = t0 + S.durationMin * MIN;
    this.announcer.reset();
    this.tpAnnounced = false;
  }
  private tickPrep(now: number) {
    const left = this.t0 - now;
    // все пороги, что уже прошли (сервер поднялся за 5 мин до начала), — одно объявление по ближайшему (Announcer)
    const min = this.announcer.due(left);
    if (min !== null) this.say({ text: T("srv.bannerWar.1", { min, front: this.front.name }), kind: "info" }, true);
    if (!this.tpAnnounced && left <= S.teleportMin * MIN && left > 0) { this.tpAnnounced = true; this.w.system(T("srv.bannerWar.2", { min: S.teleportMin })); }
    if (left <= 0) this.start(now);
  }

  /** Начало битвы (по расписанию или отладкой). */
  start(now = this.now(), front?: string) {
    if (front && warFront(front)) {
      const i = S.rotation.indexOf(front);
      if (i >= 0) this.saved.frontIdx = i;
      this.front = warFront(front)!;
    } else if (this.phase !== "prep") this.front = this.frontByIdx();
    this.phase = "battle";
    this.t0 = now;
    this.t1 = now + S.durationMin * MIN;
    this.score = [0, 0];
    this.contrib.clear();
    this.killLog.clear();
    this.stats = { captures: 0, tears: 0, kills: 0 };
    this.routSince = 0;
    this.scoreAt = now + SC.everyMs;
    this.heartOpen = false;
    for (const r of this.frontBases()) {
      r.hang = null; r.fallen = null; r.sealUntil = 0; r.emptyAt = now; r.contestSince = 0; r.changedAt = -1e15;
      r.banner = r.owner; r.h = r.owner ? 1 : 0;
    }
    if (this.w.soldiers) this.w.soldiers.bannerBattle = true;
    this.say({ text: T("srv.bannerWar.3", { front: this.front.name }), sub: T("srv.bannerWar.4"), kind: "start" }, true);
    this.sentKey = "";
  }

  private eligible(p: Player, now: number): p is Player {
    if (p.dead || p.level < WAR.minLevel || p.unit.mount || p.team || this.w.stealthed(p) || !isWarFaction(p.faction)) return false;
    const m = this.moves.get(p.id);
    return (!!m && now - m.at < C.afkMs) || this.w.time - p.inputAt < C.afkMs || this.w.time - p.combatAt < C.afkMs;
  }
  private inCircle(p: { x: number; y: number }, d: WarBaseDef) {
    return Math.hypot(p.x - d.x, p.y - d.y) <= WAR_RADIUS;
  }
  private hasSide(f: WarFaction) {
    return this.frontBases().some((r) => r.def.kind === "side" && r.owner === f);
  }
  private entry(p: { name: string; cls: string; faction: WarFaction }): Contrib {
    const key = p.name.toLowerCase();
    let e = this.contrib.get(key);
    if (!e) this.contrib.set(key, (e = { name: p.name, cls: p.cls, faction: p.faction, v: 0, acc: 0 }));
    return e;
  }
  private add(p: { name: string; cls: string; faction: string }, v: number) {
    if (v <= 0 || !isWarFaction(p.faction)) return;
    this.entry(p as { name: string; cls: string; faction: WarFaction }).v += v;
  }
  private split(list: Player[], v: number) {
    if (list.length) for (const p of list) this.add(p, v / list.length);
  }

  private tickBattle(now: number, dt: number) {
    if (!this.heartOpen && now - this.t0 >= S.heartOpenMin * MIN) {
      this.heartOpen = true;
      const h = this.frontBases().find((r) => r.def.kind === "heart")!;
      this.say({ text: T("srv.bannerWar.9", { base: h.def.name }), kind: "info" }, true);
    }
    const players = [...this.w.players.values()].filter((p) => this.eligible(p, now));
    const busy = new Set<Player>();
    for (const r of this.frontBases()) {
      r.inside = players.filter((p) => this.inCircle(p, r.def));
      const prev = r.n;
      r.n = [r.inside.filter((p) => p.faction === "solgard").length, r.inside.filter((p) => p.faction === "umbrath").length];
      if (r.def.kind === "heart" && !this.heartOpen) continue;
      // тревога: первый враг в круге своей точки
      if (r.owner) {
        const e = fi(foe(r.owner));
        if (r.n[e] > 0 && prev[e] === 0 && now - r.alarmAt > MIN) { r.alarmAt = now; this.say({ text: T("srv.bannerWar.7", { base: r.def.name }), kind: "alarm", f: r.owner }, false, r.owner); }
      }
      this.tickBase(r, now, dt);
      if (r.moved || r.hang || (r.n[0] > 0 && r.n[1] > 0)) for (const p of r.inside) busy.add(p);
    }
    // вклад «в круге»: каждые circleEvery мс при подъёме, спуске, споре или вывешивании
    for (const p of busy) {
      const e = this.entry(p as Player & { faction: WarFaction });
      e.acc += dt;
      while (e.acc >= K.circleEvery) { e.acc -= K.circleEvery; e.v += K.circle; }
    }
    // очки
    while (now >= this.scoreAt) {
      this.scoreAt += SC.everyMs;
      for (const r of this.frontBases()) if (r.owner) this.score[fi(r.owner)] += r.def.kind === "heart" ? SC.heart : SC.side;
    }
    // разгром: все три точки фронта у одной фракции routMs подряд
    const o = this.frontBases().map((r) => r.owner);
    if (o[0] && o.every((x) => x === o[0])) {
      if (!this.routSince) this.routSince = now;
      if (now - this.routSince >= SC.routMs) return this.end(now, true);
    } else this.routSince = 0;
    if (now >= this.t1) this.end(now, false);
  }

  private tickBase(r: BaseRt, now: number, dt: number) {
    const heart = r.def.kind === "heart";
    const sealed = now < r.sealUntil;
    const contested = r.n[0] > 0 && r.n[1] > 0;
    r.moved = false;
    // отстоять спор: спор шёл не меньше circleEvery и кончился, в круге остались только защитники знамени
    if (contested) { if (!r.contestSince) r.contestSince = now; }
    else {
      if (r.contestSince && r.banner && now - r.contestSince >= K.circleEvery && r.n[fi(r.banner)] > 0) for (const p of r.inside) this.add(p, K.hold);
      r.contestSince = 0;
    }
    if (r.n[0] + r.n[1] > 0) r.emptyAt = now;
    if (sealed) { r.hang = null; return; }
    if (!r.banner) return this.tickHang(r, now);
    const F = r.banner, raise = (n: number) => raiseSec(r.def.kind, n) * 1000;
    let n = r.n[fi(F)] - r.n[fi(foe(F))];
    n = Math.max(-C.maxEdge, Math.min(C.maxEdge, n));
    const h0 = r.h;
    if (heart && !this.hasSide(F)) r.h -= dt / (raise(1) * C.lowerMul); // Сердце без опоры сползает само
    else if (n > 0) { if (r.owner !== F || r.h < 1) r.h += dt / raise(n); }
    else if (n < 0) r.h -= dt / (raise(-n) * C.lowerMul);
    else if (r.n[0] + r.n[1] === 0 && now - r.emptyAt >= C.emptyMs) {
      if (r.owner !== F) r.h -= dt / (raise(1) * C.lowerMul);
      else if (r.h < 1) r.h += dt / raise(1);
    }
    r.h = Math.max(0, Math.min(1, r.h));
    r.moved = r.h !== h0;
    if (r.h >= 1 && r.owner !== F) this.capture(r, now);
    else if (r.h <= 0 && h0 > 0) this.tear(r, now);
  }

  /** Вывешивание у пустого основания: один герой стороны с перевесом (n ≥ 0 и больше, чем у врага), стоя hangMs без урона и оглушения. */
  private tickHang(r: BaseRt, now: number) {
    const heart = r.def.kind === "heart";
    if (r.hang) {
      const h = r.hang, p = this.w.players.get(h.pid);
      const f = h.f, own = r.n[fi(f)], other = r.n[fi(foe(f))];
      const ok = !!p && r.inside.includes(p) && Math.hypot(p.x - h.x, p.y - h.y) < 6 && p.unit.hp >= h.hp && p.stunUntil <= this.w.time && own >= other
        && (!heart || (own >= C.heartMin && this.hasSide(f)));
      if (!ok) {
        // сбили врагом — вклад тем, кто в круге с другой стороны
        if (other > 0) for (const q of r.inside) if (q.faction === foe(f)) this.add(q, K.interrupt);
        r.hang = null;
      } else if (now - h.at >= C.hangMs) {
        r.hang = null;
        r.banner = f;
        r.h = 0.0001;
        r.fallen = null;
        if (p) this.add(p, K.hang);
        this.say({ text: T("srv.bannerWar.8", { faction: fname(f), base: r.def.name }), kind: "alarm", f: foe(f) }, false, foe(f));
      }
      return;
    }
    for (const f of WAR_FACTIONS) {
      const own = r.n[fi(f)], other = r.n[fi(foe(f))];
      if (!own || own <= other) continue;
      if (heart && (own < C.heartMin || !this.hasSide(f))) continue;
      const p = r.inside.filter((q) => q.faction === f).sort((a, b) => Math.hypot(a.x - r.def.x, a.y - r.def.y) - Math.hypot(b.x - r.def.x, b.y - r.def.y))[0];
      if (p) r.hang = { f, pid: p.id, x: p.x, y: p.y, hp: p.unit.hp, at: now };
      return;
    }
  }

  private capture(r: BaseRt, now: number) {
    const F = r.banner!;
    r.owner = F;
    r.h = 1;
    if (r.def.kind === "side") r.sealUntil = now + C.sealMs;
    if (now - r.changedAt >= K.noRepeatMs) this.split(r.inside.filter((p) => p.faction === F), K.capture);
    r.changedAt = now;
    this.stats.captures++;
    this.say({ text: T("srv.bannerWar.5", { faction: fname(F), base: r.def.name }), kind: "capture", f: F }, true);
    this.applyBonuses();
    this.persist();
  }
  private tear(r: BaseRt, now: number) {
    const F = r.banner!;
    r.banner = null;
    r.h = 0;
    r.fallen = F;
    const was = r.owner === F;
    if (was) r.owner = null;
    if (now - r.changedAt >= K.noRepeatMs) this.split(r.inside.filter((p) => p.faction === foe(F)), K.tear);
    r.changedAt = now;
    this.stats.tears++;
    this.say({ text: T("srv.bannerWar.6", { faction: fname(F), base: r.def.name }), kind: "tear", f: foe(F) }, was);
    if (was) { this.applyBonuses(); this.persist(); }
  }

  // ---------- конец битвы и награды ----------
  end(now = this.now(), rout = false) {
    if (this.phase !== "battle") return;
    const heart = this.frontBases().find((r) => r.def.kind === "heart")!;
    const [a, b] = this.score;
    const win: WarFaction | "" = heart.owner ?? (a > b ? "solgard" : b > a ? "umbrath" : "");
    if (win) this.saved.wins[fi(win)]++;
    const key = weekKey(now);
    const top = { solgard: [] as WarTopRow[], umbrath: [] as WarTopRow[] };
    for (const e of [...this.contrib.values()].sort((x, y) => y.v - x.v)) if (top[e.faction].length < 5) top[e.faction].push({ name: e.name, cls: e.cls, contrib: Math.floor(e.v) });
    const base: WarResultMsg = { front: this.front.id, win, rout: rout && !!win, score: [a, b], durationMs: now - this.t0, me: null, top, stats: { ...this.stats } };
    this.lastResult = base;
    for (const p of this.w.players.values()) {
      const e = this.contrib.get(p.name.toLowerCase());
      if (!e) continue;
      const me = this.grant(p, e, win, base.rout, key);
      p.send("war:result", { ...base, me });
    }
    const result = win ? T("srv.bannerWar.10", { faction: fname(win) }) : T("srv.bannerWar.11");
    this.say({ text: base.rout ? T("srv.bannerWar.12", { faction: fname(win as WarFaction) }) : result, sub: `${a} : ${b}`, kind: "end", f: win }, false);
    this.w.system(T("srv.bannerWar.13", { front: this.front.name, result, a, b }));
    for (const r of this.frontBases()) { r.hang = null; r.sealUntil = 0; r.fallen = null; r.contestSince = 0; }
    this.phase = "result";
    this.resultUntil = now + S.resultSec * 1000;
    this.saved.frontIdx = (S.rotation.indexOf(this.front.id) + 1) % S.rotation.length;
    if (this.w.soldiers) this.w.soldiers.bannerBattle = false;
    this.applyBonuses();
    this.persist();
    this.sentKey = "";
  }

  /**
   * Награда героя одной транзакцией: сначала всё считается (Знаки, сундук, место в сумке на копии), затем разом записывается.
   * Не влез сундук целиком — весь уходит в save.pendingItems (выдаётся, когда появится место), сумка не меняется частично.
   */
  grant(p: Player, e: Contrib, win: WarFaction | "", rout: boolean, key: string): WarResultMsg["me"] {
    const f = e.faction;
    const prev = p.save.war && p.save.war.week === key ? p.save.war : { week: key, marks: 0, wins: 0, battles: 0 };
    const won = win === f, v = Math.floor(e.v);
    let marks = 0, capped = false;
    const items: Item[] = [];
    if (v >= R.minContrib) {
      const res = won ? (prev.wins === 0 ? R.firstWin : R.win) : win === "" ? R.draw : R.lose;
      marks = Math.min(R.perBattle, v) + Math.round(res * (won && rout ? 1 + SC.routBonus : 1));
      const room = Math.max(0, R.weekCap - prev.marks);
      if (marks > room) { marks = room; capped = true; }
      const tier = [...R.chest].reverse().find((c) => v >= c.at);
      if (tier) for (const [id, qty] of [["ash_ore", tier.ore], ["star_dust", tier.dust]] as const) if (qty > 0) items.push({ ...makeItem(id, 1, 0), qty });
    }
    // проверка места на копии сумки
    const copy = { save: { inventory: p.save.inventory.map((s) => (s ? { ...s } : null)) }, selfDirty: false } as unknown as Player;
    const fits = items.every((it) => addItem(copy, { ...it }));
    // запись разом
    p.save.marks = (p.save.marks ?? 0) + marks;
    p.save.war = { week: key, marks: prev.marks + marks, wins: prev.wins + (won ? 1 : 0), battles: prev.battles + 1 };
    if (items.length) {
      if (fits) for (const it of items) addItem(p, it);
      else { (p.save.pendingItems ??= []).push(...items); p.send("toast", { text: T("srv.bannerWar.20"), kind: "info" }); }
    }
    p.selfDirty = true;
    if (marks) p.send("toast", { text: T("srv.bannerWar.15", { n: marks }), kind: "loot" });
    return { faction: f, contrib: v, marks, capped, chest: items.map((it) => ({ name: MATERIALS[it.base]?.name ?? it.base, qty: it.qty ?? 1 })) };
  }

  /** Убийство героя: вклад убийце за врага на фронте (в круге своей точки больше; та же жертва — меньше). */
  onKill(victim: Player, killer?: Actor) {
    if (this.phase !== "battle" || !killer || !this.w.isPlayer(killer)) return;
    const k = killer as Player;
    if (k.faction === victim.faction || !isWarFaction(k.faction) || k.level < WAR.minLevel) return;
    const near = this.front.bases.some((d) => Math.hypot(victim.x - d.x, victim.y - d.y) < 40 * TILE);
    if (!near) return;
    const now = this.now(), key = `${k.name.toLowerCase()}>${victim.name.toLowerCase()}`;
    const log = (this.killLog.get(key) ?? []).filter((t) => now - t < K.repeatKillMs);
    const share = K.repeatKill[Math.min(log.length, K.repeatKill.length - 1)];
    log.push(now);
    this.killLog.set(key, log);
    const own = this.frontBases().some((r) => r.owner === k.faction && this.inCircle(k, r.def));
    this.add(k, K.kill * share * (own ? K.killOwnCircleMul : 1));
    this.stats.kills++;
  }

  // ---------- бонусы точек ----------
  bonus: Record<WarFaction, WarBonus> = { solgard: this.noBonus(), umbrath: this.noBonus() };
  private noBonus(): WarBonus { return { xpGold: 0, mats: 0, speed: 0, squads: false, dungeon: 0, respawn: [] }; }
  private applyBonuses() {
    this.buffCache.at = 0; // бафы земли — сразу по новой раскладке
    for (const f of WAR_FACTIONS) {
      const b = this.noBonus();
      for (const fr of WAR_FRONTS) {
        const own = fr.bases.filter((d) => this.bases.get(d.id)?.owner === f);
        const side = own.filter((d) => d.kind === "side");
        if (side.length) {
          if (fr.side === "xpGold") b.xpGold = B.xpGold;
          else if (fr.side === "mats") b.mats = B.mats;
          else if (fr.side === "respawn") b.respawn.push(...side);
        }
        if (own.some((d) => d.kind === "heart")) {
          if (fr.heart === "speed") b.speed = B.speed;
          else if (fr.heart === "squads") b.squads = true;
          else if (fr.heart === "dungeon") b.dungeon = B.dungeonLoot;
        }
      }
      this.bonus[f] = b;
      if (this.w.soldiers) this.w.soldiers.squadEvery[f] = b.squads ? B.squadMin : undefined;
    }
  }
  /** Множители награды за моба: опыт и золото, материалы заточки (Поля), шанс добычи (данж). */
  mobBonus(p: Player, m: { x: number; y: number }): { xp: number; gold: number; mats: number; loot: number } {
    const b = isWarFaction(p.faction) ? this.bonus[p.faction] : null;
    if (!b) return { xp: 1, gold: 1, mats: 1, loot: 1 };
    const z = zoneAtPx(this.w.map, m.x, m.y);
    const fields = z === Zone.Fields;
    const sw = this.saved.siege, sb = sw && sw.bonus === p.faction && this.now() < sw.until ? SIEGE.reward.xpGold : 0; // неделя после осады
    const wv = fields ? this.w.wboss?.xpBonus(p.faction) ?? 0 : 0; // знамя победы над мировым боссом (задача 151): только опыт
    return { xp: fields ? 1 + b.xpGold + sb + wv : 1, gold: fields ? 1 + b.xpGold + sb : 1, mats: fields ? 1 + b.mats : 1, loot: z === Zone.Dungeon ? 1 + b.dungeon : 1 };
  }
  /** Скорость героя вне боя на Полях. */
  speedMul(p: Player): number {
    const b = isWarFaction(p.faction) ? this.bonus[p.faction] : null;
    if (!b?.speed || p.inCombat(this.w.time) || zoneAtPx(this.w.map, p.x, p.y) !== Zone.Fields) return 1;
    return 1 + b.speed;
  }
  /** Где возродиться павшему на Полях: в битве — в своём форте без потери золота; иначе у своей заставы центра, если она взята. */
  respawnAt(p: Player): { x: number; y: number; free: boolean } | null {
    const sr = this.w.siege?.respawnAt(p); // осада форта: нападающие — в лагере у ворот, оборона — в форте
    if (sr) return sr;
    if (!isWarFaction(p.faction)) return null;
    // павший на Полях или в своём форте (и у его стен) поднимается в своём форте — открыт он герою или нет (раньше без «открытого» форта кидало в столицу)
    const z = zoneAtPx(this.w.map, p.x, p.y), fort = CITIES.find((c) => c.id === `fort_${p.faction}`);
    const ownFortZone = z === (p.faction === "solgard" ? Zone.FortSolgard : Zone.FortUmbrath);
    const nearFort = !!fort && Math.hypot(fort.spawn.x - p.x, fort.spawn.y - p.y) < 40 * TILE;
    if (z !== Zone.Fields && !ownFortZone && !nearFort) return null;
    if (!fort) return null;
    // в битве — без потери золота
    if (this.phase === "battle" && p.level >= WAR.minLevel) return { x: fort.spawn.x, y: fort.spawn.y, free: true };
    // вне битвы на Полях: взятая своя застава Центра, если она ближе форта
    const list = z === Zone.Fields ? this.bonus[p.faction].respawn : [];
    const d = [...list].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (d && Math.hypot(d.x - p.x, d.y - p.y) < Math.hypot(fort.spawn.x - p.x, fort.spawn.y - p.y)) return { x: d.x, y: d.y + (WAR.look.plinthDrop + 2 * TILE), free: false };
    return { x: fort.spawn.x, y: fort.spawn.y, free: false };
  }

  /** Телепорт в свой форт: за teleportMin минут до битвы и во время неё. */
  /** Перезарядка «В форт» по герою (имя → World.time, до которого нельзя). */
  private tpCd = new Map<string, number>();
  teleport(p: Player) {
    // не в бою и не чаще schedule.teleportCdSec (и для переноса осады); клиенту — сколько ждать (кнопка с отсчётом)
    const key = p.name.toLowerCase(), left = (this.tpCd.get(key) ?? 0) - this.w.time;
    if (p.inCombat(this.w.time)) return p.send("toast", { text: T("srv.bannerWar.18"), kind: "error" });
    if (left > 0) { p.send("war:tpcd", { ms: left }); return p.send("toast", { text: T("srv.bannerWar.21", { n: Math.ceil(left / 1000) }), kind: "error" }); }
    const x0 = p.x, y0 = p.y;
    const done = () => { if (p.x !== x0 || p.y !== y0) { this.tpCd.set(key, this.w.time + S.teleportCdSec * 1000); p.send("war:tpcd", { ms: S.teleportCdSec * 1000 }); } };
    if (this.w.siege?.active()) { this.w.siege.teleport(p); return done(); } // в осаде — в лагерь осады или в свой форт
    const now = this.now();
    const open = (this.phase === "prep" && this.t0 - now <= S.teleportMin * MIN) || this.phase === "battle";
    if (!open) return p.send("toast", { text: T("srv.bannerWar.16", { min: S.teleportMin }), kind: "error" });
    if (p.level < WAR.minLevel) return p.send("toast", { text: T("srv.bannerWar.17", { lvl: WAR.minLevel }), kind: "error" });
    if (p.dead || p.team || p.inCombat(this.w.time)) return p.send("toast", { text: T("srv.bannerWar.18"), kind: "error" });
    const fort = CITIES.find((c) => c.id === `fort_${p.faction}`);
    if (!fort) return;
    this.w.emit({ t: "tp", id: p.id, ph: "go", x: p.x, y: p.y });
    p.unit.x = fort.spawn.x;
    p.unit.y = fort.spawn.y;
    p.moveTo = null;
    p.targetId = null;
    this.w.emit({ t: "tp", id: p.id, ph: "arrive", x: p.x, y: p.y });
    done();
  }

  // ---------- сообщения ----------
  /** Объявление на экране; chat — ещё и в общий чат; only — только героям этой фракции (и им же в чат). */
  private say(m: WarSayMsg, chat: boolean, only?: WarFaction) {
    for (const p of this.w.players.values()) {
      if (only && p.faction !== only) continue;
      p.send("war:say", m);
      if (only) p.send("chat", { from: "", text: m.text, sys: true });
    }
    if (chat && !only) this.w.system(m.text);
  }
  view(now = this.now()): WarStateMsg {
    const active = this.phase === "battle" || this.phase === "prep" || this.phase === "result";
    const bases: WarBaseView[] = [...this.bases.values()].map((r) => {
      const on = active && r.def.front === this.front.id;
      const live = this.phase === "battle" && on;
      return {
        id: r.def.id, o: r.owner ?? "", b: r.banner ?? "", h: Math.round(r.h * 100) / 100,
        n: live ? r.n : [0, 0], c: live && r.n[0] > 0 && r.n[1] > 0, s: live ? Math.max(0, r.sealUntil - now) : 0,
        hf: live && r.hang ? r.hang.f : "", hp: live && r.hang ? Math.min(1, (now - r.hang.at) / C.hangMs) : 0,
        fl: live ? r.fallen ?? "" : "", lock: r.def.kind === "heart" && on && this.phase === "battle" && !this.heartOpen,
      };
    });
    return { ph: this.phase, front: this.front.id, t0: this.t0, t1: this.t1, now, score: [...this.score] as [number, number], heart: this.heartOpen, bases };
  }
  private broadcastState(now: number) {
    const every = this.phase === "battle" ? 500 : 15000;
    if (now - this.sentAt < Math.min(every, 500)) return;
    const v = this.view(now);
    const key = JSON.stringify({ ...v, now: 0, bases: v.bases.map((b) => ({ ...b, s: Math.ceil(b.s / 1000), hp: Math.round(b.hp * 10) })) });
    if (key === this.sentKey && now - this.sentAt < every) return;
    this.sentKey = key;
    this.sentAt = now;
    this.w.broadcast("war", v);
  }

  /** Отладка (dbg war): start [front], heart, end, skip ms, prep ms, owner base f, reset. */
  debug(op: string, a: Record<string, unknown>) {
    const now = this.now();
    switch (op) {
      case "start": if (this.phase === "battle") this.end(now); this.start(now, typeof a.front === "string" ? a.front : undefined); break;
      case "heart": if (this.phase === "battle") this.t0 = Math.min(this.t0, now - S.heartOpenMin * MIN); break;
      case "end": this.end(now, false); break;
      case "skip": this.offset += Math.max(0, Number(a.ms) || 0); break;
      case "prep": this.phase = "idle"; this.prep(now + Math.max(0, Number(a.ms) || 0)); break;
      case "owner": {
        const r = this.bases.get(String(a.base));
        if (!r) break;
        const f = isWarFaction(a.f) ? a.f : null;
        r.owner = r.banner = f; r.h = f ? 1 : 0; r.sealUntil = 0; r.hang = null;
        this.applyBonuses(); this.persist(); break;
      }
      case "reset":
        this.phase = "idle";
        for (const r of this.bases.values()) { r.owner = r.banner = null; r.h = 0; r.hang = null; r.fallen = null; r.sealUntil = 0; }
        if (this.w.soldiers) this.w.soldiers.bannerBattle = false;
        this.applyBonuses(); this.persist(); break;
    }
    this.sentKey = "";
    this.sentAt = 0;
  }
}
