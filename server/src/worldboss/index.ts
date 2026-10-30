/**
 * Мировые боссы (задача 151, docs/world-bosses.md): директор на каждого босса data/world-bosses.json, общее хранилище
 * (Летопись, знамя победы фракции, недельные трофеи аккаунтов, счётчик появлений — переживают перезапуск), сборы фракций
 * (общий Muster, автосбор отрядов по ролям) и хуки мира. Только в основном мире (World создаёт, если есть карта мира и мобы).
 */
import fs from "node:fs";
import path from "node:path";
import { CITIES } from "../../../shared/cities";
import { castTeleport } from "../game/cities";
import { FACTIONS } from "../../../shared/factions";
import { Zone, zoneAtPx } from "../../../shared/map";
import { RAID_ROLES } from "../../../shared/raid";
import { WB, WB_BOSSES, WB_BY_ID, wbText, type WbChronicleEntry, type WbMusterMsg } from "../../../shared/worldBoss";
import type { EventClock } from "../game/eventClock";
import type { Player } from "../game/Player";
import type { Actor, World } from "../game/World";
import { Muster, type MusterEntry } from "../raid/muster";
import { WorldBossDirector } from "./director";
import { flushBags } from "./rewards";

export interface WbSaved {
  bosses: Record<string, { spawns: number; lastEnd: number }>;
  chronicle: WbChronicleEntry[];
  /** Знамя победы над боссом: фракция с большим вкладом, до когда (часы сервера). */
  banner: { faction: string; until: number; boss: string } | null;
  /** Недельные трофеи аккаунтов (легендарка, маунт). */
  acct: Record<string, { leg?: string; mount?: string }>;
}
export interface WbStore { load(): WbSaved | null; save(s: WbSaved): void }
/** Хранилище в JSON-файле рядом с базой: запись через временный файл и переименование. */
export function fileWbStore(file: string): WbStore {
  return {
    load: () => { try { return JSON.parse(fs.readFileSync(file, "utf8")) as WbSaved; } catch { return null; } },
    save: (s) => {
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + ".tmp", JSON.stringify(s)); fs.renameSync(file + ".tmp", file); }
      catch (e) { console.warn("[wboss] не удалось сохранить состояние:", (e as Error).message); }
    },
  };
}

/** Сбор фракции на мирового босса: отряд(ы) из Muster.squads. */
interface Squads { boss: string; list: MusterEntry[][] }

export class WorldBosses {
  /** Сдвиг часов (отладка), мс; тест подменяет now. */
  offset = 0;
  now: () => number = () => Date.now() + this.offset;
  readonly directors: WorldBossDirector[] = [];
  readonly byId = new Map<string, WorldBossDirector>();
  saved: WbSaved;
  /** Сборы по фракциям (одна система с рейдом: raid/muster.ts) и собранные отряды (ключ героя → отряд). */
  readonly musters = new Map<string, Muster>();
  readonly squads = new Map<string, Squads & { idx: number }>();

  constructor(readonly w: World, readonly clock: EventClock, private store?: WbStore) {
    const s = store?.load();
    this.saved = { bosses: {}, chronicle: [], banner: null, acct: {}, ...(s ?? {}) };
    for (const def of WB_BOSSES) {
      const d = new WorldBossDirector(w, def, this);
      this.directors.push(d);
      this.byId.set(def.id, d);
    }
    clock.register("wboss", () => this.directors.map((d) => ({
      id: `wboss:${d.def.id}`, kind: "wboss" as const, name: d.def.name, at: d.stage === "alive" ? d.startAt : d.win?.mark ?? 0,
      until: d.stage === "alive" ? d.aliveUntil : undefined, live: d.stage === "alive", where: d.def.slot,
    })).filter((e) => e.at > 0));
    const find = (key: string) => w.findByName(key);
    for (const f of Object.keys(FACTIONS).filter((f) => f === "solgard" || f === "umbrath")) {
      this.musters.set(f, new Muster(
        { minLevel: WB.minLevel, maxPlayers: WB.muster.maxPlayers, ms: () => Number(process.env.WB_MUSTER_MS) || WB.muster.musterMs, faction: f, factionText: FACTIONS[f as keyof typeof FACTIONS].name },
        find, (list) => this.formSquads(f, list), (keys) => keys.forEach((k) => this.sendMuster(k)), (key) => (find(key)?.goingToArena ? "—" : null),
      ));
    }
  }
  persist() {
    this.store?.save(this.saved);
  }
  factionName(f: string) {
    return FACTIONS[f as keyof typeof FACTIONS]?.name ?? f;
  }

  update() {
    for (const d of this.directors) d.update();
    const t = this.now();
    for (const m of this.musters.values()) m.tick(t);
  }

  // ---------------------------------------------------------------- хуки мира
  weak(src: Actor, dst: Actor): boolean {
    for (const d of this.directors) if (d.weak(src, dst)) return true;
    return false;
  }
  onDamage(src: Actor, dst: Actor, v: number) {
    for (const d of this.directors) d.onDamage(src, dst, v);
  }
  onHeal(by: Player, target: Player, got: number) {
    for (const d of this.directors) d.onHeal(by, target, got);
  }
  onKill(p: Player, killer?: Actor) {
    for (const d of this.directors) d.onKill(p, killer);
  }
  /** Уход из мира: невзятое из мешков — в сумку или pendingItems (до сохранения). */
  onLeave(p: Player) {
    flushBags(p);
  }
  /** Знамя победы: +xpPct опыта на Полях фракции-победителю до срока. */
  xpBonus(f: string): number {
    const b = this.saved.banner;
    return b && b.faction === f && this.now() < b.until ? WB.victory.xpPct : 0;
  }
  onFinished(d: WorldBossDirector, e: WbChronicleEntry) {
    this.saved.chronicle.unshift(e);
    this.saved.chronicle.length = Math.min(this.saved.chronicle.length, WB.chronicle.keep);
    if (e.win) {
      this.saved.banner = { faction: e.win, until: e.at + WB.victory.hours * 3600000, boss: d.def.id };
      this.clock.say(wbText(d.def.texts.banner, { name: d.def.name, faction: this.factionName(e.win), pct: Math.round(WB.victory.xpPct * 100) }), { kind: "banner", from: d.def.chronicler });
    }
    // отряды события распущены
    for (const [k, s] of this.squads) if (s.boss === d.def.id) this.squads.delete(k);
    this.persist();
  }
  /** Летопись (последние n записей). */
  chronicle(n = 20): WbChronicleEntry[] {
    return this.saved.chronicle.slice(0, n);
  }

  // ---------------------------------------------------------------- сборы
  /** Ближайший мировой босс (для сбора): живой, скорый или следующий по окну. */
  nextBoss(): WorldBossDirector | null {
    const rank = (d: WorldBossDirector) => (d.stage === "alive" ? 0 : d.stage === "soon" ? 1 : 2);
    return [...this.directors].sort((a, b) => rank(a) - rank(b) || (a.win?.mark ?? 0) - (b.win?.mark ?? 0))[0] ?? null;
  }
  join(group: Player[]): string | null {
    const f = group[0]?.faction ?? "";
    const m = this.musters.get(f);
    if (!m) return "—";
    return m.join(group, this.now());
  }
  cancel(p: Player) { this.musters.get(p.faction)?.cancel(p.name.toLowerCase()); }
  startNow(p: Player) { return this.musters.get(p.faction)?.startNow(p.name.toLowerCase()) ?? "—"; }
  /** Сбор окончен: автосбор отрядов по ролям (баланс танк/лекарь/бой), каждому — его отряд. */
  private formSquads(f: string, list: MusterEntry[]) {
    const boss = this.nextBoss()?.def.id ?? WB_BOSSES[0]?.id ?? "";
    const sq = Muster.squads(list, WB.muster.squad);
    sq.forEach((s, idx) => { for (const e of s) this.squads.set(e.key, { boss, list: sq, idx }); });
    for (const e of list) this.sendMuster(e.key);
    void f;
  }
  squadOf(key: string): MusterEntry[] | null {
    const s = this.squads.get(key);
    return s ? s.list[s.idx] : null;
  }
  musterStatus(p: Player): WbMusterMsg {
    const key = p.name.toLowerCase(), m = this.musters.get(p.faction), now = this.now();
    const sq = this.squadOf(key);
    return {
      boss: this.nextBoss()?.def.id ?? "", open: !!m?.list.length, joined: !!m?.has(key), leader: m?.leader ?? "",
      leftSec: m?.list.length ? Math.max(0, Math.ceil((m.startAt - now) / 1000)) : 0,
      members: (m?.list ?? []).map((e) => ({ name: e.name, cls: e.cls, level: e.level, role: e.role })),
      why: m ? m.why(p) : "—", squad: sq ? sq.map((e) => e.name) : null,
    };
  }
  sendMuster(key: string) {
    const p = this.w.findByName(key);
    if (p) p.send("wboss:muster", this.musterStatus(p));
  }
  /** Роли сбора (для теста и окна). */
  roleCount(f: string) {
    const list = this.musters.get(f)?.list ?? [];
    return Object.fromEntries(RAID_ROLES.map((r) => [r, list.filter((e) => e.role === r).length]));
  }

  /** «В форт» (как у «Знамён»): с −teleportMin до конца боя, свой форт, не в бою, перезарядка 2 мин. */
  private tpAt = new Map<string, number>();
  teleport(p: Player): string | null {
    const now = this.now(), key = p.name.toLowerCase();
    const open = this.directors.some((d) => d.stage === "alive" || (d.stage === "soon" && (d.win?.mark ?? 0) - now <= WB.clock.teleportMin * 60000));
    if (!open) return wbText("«В форт» откроется за {min} мин до пробуждения.", { min: WB.clock.teleportMin });
    if (p.level < WB.minLevel) return wbText("«В форт» доступно с {lvl} уровня.", { lvl: WB.minLevel });
    if (p.dead || p.team) return "Сейчас нельзя";
    if (p.inCombat(this.w.time)) return "Нельзя в бою";
    const left = (this.tpAt.get(key) ?? -1e15) - this.w.time;
    if (left > 0) return `Телепорт перезаряжается: ещё ${Math.ceil(left / 1000)} с`;
    const fort = CITIES.find((c) => c.id === `fort_${p.faction}`);
    if (!fort) return "Свой форт не найден";
    // обычный каст телепорта (полоса, эффект, прерывание движением и уроном); перезарядка — после переноса
    castTeleport(this.w, p, { x: fort.spawn.x, y: fort.spawn.y }, fort.name, () => this.tpAt.set(key, this.w.time + 120000));
    return null;
  }

  // ---------------------------------------------------------------- отладка
  /** dbg wboss: start | soon [ms] | kill | reset | skip ms (boss — id, по умолчанию первый). */
  debug(op: string, a: Record<string, unknown>, by?: Player) {
    const d = this.byId.get(String(a.boss ?? "")) ?? this.directors[0];
    if (!d) return;
    switch (op) {
      case "start": d.spawn(); break;
      case "soon": d.soon(a.ms !== undefined ? Math.max(0, Number(a.ms) || 0) : undefined); break;
      case "kill": if (d.mob && !d.mob.dead) this.w.applyDamage(d.mob, d.mob.unit.hp, by); break;
      case "reset": d.reset(); break;
      case "skip": this.offset += Math.max(0, Number(a.ms) || 0); break;
      case "end": d.depart(); break;
    }
  }
  /** В зоне ли герой, где копится вклад (для окна). */
  inFields(p: Player) {
    const z = zoneAtPx(this.w.map, p.x, p.y);
    return z === Zone.Fields || z === Zone.Volcano;
  }
}

export { WB_BY_ID };
