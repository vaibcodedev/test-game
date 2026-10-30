/**
 * Ход рейда без Colyseus (docs/systems/bosses.md §1): этапы gather → pull → fight → end, попытки, заряды воскрешения, берсерк,
 * шина событий (перекличка ботов), статистика. Комната RaidRoom только связывает клиентов, тест tests/raid.ts крутит тот же Director.
 * Время — только w.time (тики World), поэтому бой можно гонять быстрее реального.
 */
import type { ClassId } from "../../../shared/classes";
import { MOBS, type MobDef } from "../../../shared/mobs";
import { Anim } from "../../../shared/protocol";
import { activeSkills, SKILLS } from "../../../shared/skills";
import {
  fillText, inHall, phaseName, phaseNo, RAID, RAID_BOSS, RAID_CFG, RAID_PHASES, RAID_POINTS, raidSpawn,
  type RaidBannerMsg, type RaidMemberInfo, type RaidPlayerResult, type RaidRole,
} from "../../../shared/raid";
import type { PlayerSave } from "../db";
import type { Danger } from "../game/danger";
import { Mob } from "../game/Mob";
import type { Player } from "../game/Player";
import type { Actor, World } from "../game/World";
import { raidThink, type RaidAI } from "./ai";
import { Chatter } from "./chatter";
import { ChaosKnight } from "./chaosKnight";
import { T } from "../../../shared/texts";

/** Умения-провокации танков (на рейд-босса действуют через Director.tickTaunts). */
const TAUNTS = ["taunt", "tp_hammer", "dk_death_grip"];

export type RaidStage = "gather" | "pull" | "fight" | "wipe" | "end";
export interface RaidMember extends RaidMemberInfo {
  key: string;
  /** Сохранение героя (у бота — собранное сервером). */
  save: PlayerSave;
  /** Позиция в мире до рейда (возврат). */
  from?: { x: number; y: number };
}
export interface DirectorOptions {
  members: RaidMember[];
  /** Рассылка сообщений рейда клиентам (raid:banner, raid:cast, raid:revive). */
  send?: (type: string, msg: unknown) => void;
  /** Длительности этапов (тесты); по умолчанию — data/raid.json. */
  gatherMs?: number;
  pullMs?: number;
  endMs?: number;
  wipeMs?: number;
  /** Множитель HP босса (больше size участников — HP × N/size). */
  hpScale?: number;
  /** Без уклонения от телеграфов (проверка механик в тесте). */
  noDodge?: boolean;
  rand?: () => number;
  /** Победа (награды) и конец рейда (вайп всех попыток или победа). */
  onWin?: (d: RaidDirector) => void;
  onEnd?: (d: RaidDirector, win: boolean) => void;
  log?: (s: string) => void;
}
interface Stat { damage: number; healing: number; deaths: number; revives: number }
interface Channel { target: Player; until: number; at: number; x: number; y: number }

export class RaidDirector {
  stage: RaidStage = "gather";
  stageAt = 0;
  fightAt = 0;
  attempt = 1;
  revives = RAID_CFG.revives.base;
  readonly boss: Mob;
  readonly knight: ChaosKnight;
  /** Опасные зоны рейда (телеграфы рыцаря); лужи — w.hazards. */
  readonly dangers: Danger[] = [];
  readonly members: RaidMember[];
  readonly byKey = new Map<string, Player>();
  readonly role = new Map<Player, RaidRole>();
  readonly bots = new Set<Player>();
  /** Героев ведёт ИИ: боты и оборвавшие связь игроки. */
  readonly auto = new Set<Player>();
  readonly stats = new Map<string, Stat>();
  readonly ai = new Map<Player, RaidAI>();
  readonly chatter: Chatter;
  readonly rand: () => number;
  /** Каналы воскрешения: кто → кого. */
  readonly channels = new Map<Player, Channel>();
  /** Итог: победа, длительность боя (мс), в какой попытке. */
  result: { win: boolean; durationMs: number; attempt: number } | null = null;
  /** События для теста и итогов. */
  readonly log: { t: number; ev: string; data?: Record<string, unknown> }[] = [];
  readonly phasesSeen = new Set<number>();
  private listeners = new Map<string, ((d: Record<string, unknown>) => void)[]>();
  private lastStageSec = -1;
  private ended = false;
  private readonly gatherMs: number;
  private readonly pullMs: number;
  private readonly endMs: number;
  private readonly wipeMs: number;

  constructor(readonly w: World, readonly o: DirectorOptions) {
    this.members = o.members;
    this.rand = o.rand ?? Math.random;
    this.gatherMs = o.gatherMs ?? RAID_CFG.gatherMs;
    this.pullMs = o.pullMs ?? RAID_CFG.pullMs;
    this.endMs = o.endMs ?? RAID_CFG.endMs;
    this.wipeMs = o.wipeMs ?? RAID_CFG.wipeMs;
    // босс: своя копия описания (сон — aggro 0, бой — aggro зала), HP × hpScale
    const def: MobDef = { ...MOBS[RAID_BOSS.id], aggro: 0 };
    const m = new Mob(w.uid("b"), def, RAID_BOSS.level, { ...RAID_POINTS.bossHome });
    const scale = o.hpScale ?? 1;
    if (scale !== 1) m.baseStats = m.stats = { ...m.stats, maxHp: Math.round(m.stats.maxHp * scale) };
    this.boss = m;
    this.knight = new ChaosKnight(w, m, RAID_BOSS.hallR, {
      dangers: this.dangers,
      emit: (ev, data) => this.emit(ev, data),
      cast: (name, ms) => this.send("raid:cast", { name, ms }),
      phase: (n) => this.onPhase(n),
      berserkAt: () => this.fightAt + RAID_CFG.enrageMs,
      tank: () => this.mainTank(),
      rand: this.rand,
    });
    m.boss = this.knight;
    m.reset();
    w.addMob(m);
    this.chatter = new Chatter(this);
    w.onRaidKill = (mob, killer) => { if (mob === this.boss) this.win(killer); };
    w.onPlayerKilled = (p) => this.onDeath(p);
    w.onDamage = (src, dst, v) => {
      if (this.stage === "fight" && w.isPlayer(src) && !w.isPlayer(dst)) this.stat(src).damage += v;
    };
    w.onHeal = (p, v) => { if (this.stage === "fight") this.stat(p).healing += v; };
    w.reviveCheck = (_by, t) => (this.stage !== "fight" ? T("srv.director.189") : this.revives <= 0 ? T("srv.director.192") : this.channelOn(t) ? T("srv.director.193") : null);
    w.onRevived = (by) => this.spend(by);
    this.setStage("gather");
  }

  // ---------------------------------------------------------------- участники
  /** Поставить героя (игрока или бота) в Преддверие. */
  addPlayer(p: Player, member: RaidMember, bot = !!member.bot) {
    const i = this.members.indexOf(member);
    const sp = raidSpawn(i < 0 ? this.byKey.size : i);
    p.unit.x = sp.x;
    p.unit.y = sp.y;
    p.team = 0;
    p.unit.team = 0;
    if (bot) { this.bots.add(p); this.auto.add(p); }
    this.byKey.set(member.key, p);
    this.role.set(p, member.role);
    this.stat(p);
    this.w.addPlayer(p);
    this.ai.set(p, { next: Math.floor(this.rand() * 5) * 50, escape: null, seen: new Map(), side: this.rand() < 0.5 ? 1 : -1, slot: -1, pillar: -1, lastSay: 0 });
  }
  removePlayer(p: Player) {
    for (const [k, q] of this.byKey) if (q === p) this.byKey.delete(k);
    this.auto.delete(p);
    this.channels.delete(p);
    this.w.removePlayer(p.id);
    if (this.stage === "fight") this.checkWipe();
  }
  /** Живые участники в комнате. */
  players(): Player[] {
    return [...this.byKey.values()].filter((p) => this.w.players.get(p.id) === p);
  }
  roleOf(p: Player): RaidRole { return this.role.get(p) ?? "melee"; }
  stat(p: Player): Stat {
    const k = p.name.toLowerCase();
    let s = this.stats.get(k);
    if (!s) this.stats.set(k, (s = { damage: 0, healing: 0, deaths: 0, revives: 0 }));
    return s;
  }
  /** Главный танк: первый живой участник с ролью танка. */
  mainTank(): Player | undefined {
    return this.players().find((p) => this.roleOf(p) === "tank" && !p.dead) ?? undefined;
  }
  tanks(): Player[] { return this.players().filter((p) => this.roleOf(p) === "tank"); }

  // ---------------------------------------------------------------- шина событий
  on(ev: string, fn: (d: Record<string, unknown>) => void) {
    (this.listeners.get(ev) ?? this.listeners.set(ev, []).get(ev)!).push(fn);
  }
  emit(ev: string, data: Record<string, unknown> = {}) {
    this.log.push({ t: this.w.time, ev, data });
    for (const fn of this.listeners.get(ev) ?? []) fn(data);
    for (const fn of this.listeners.get("*") ?? []) fn({ ...data, ev });
    this.chatter.event(ev, data);
  }
  send(type: string, msg: unknown) {
    this.o.send?.(type, msg);
  }
  banner(kind: RaidBannerMsg["kind"], text: string, sub?: string) {
    this.send("raid:banner", { kind, text, sub } satisfies RaidBannerMsg);
    this.emit("banner", { kind, text });
  }

  // ---------------------------------------------------------------- этапы
  private setStage(s: RaidStage) {
    this.stage = s;
    this.stageAt = this.w.time;
    this.lastStageSec = -1;
    this.emit("stage", { stage: s });
  }
  /** Секунды до конца этапа (gather, pull, wipe, end) или до берсерка (fight). */
  countdown(): number {
    const t = this.w.time - this.stageAt;
    const len = this.stage === "gather" ? this.gatherMs : this.stage === "pull" ? this.pullMs : this.stage === "wipe" ? this.wipeMs : this.stage === "end" ? this.endMs : 0;
    return Math.max(0, Math.ceil((len - t) / 1000));
  }
  berserkLeft(): number {
    return this.stage === "fight" ? Math.max(0, Math.ceil((this.fightAt + RAID_CFG.enrageMs - this.w.time) / 1000)) : Math.ceil(RAID_CFG.enrageMs / 1000);
  }
  /** Все пришли (комната) — сбор можно сократить. */
  hurryGather(ms = RAID_CFG.hurryGatherMs) {
    if (this.stage === "gather" && this.w.time - this.stageAt < this.gatherMs - ms) this.stageAt = this.w.time - (this.gatherMs - ms);
  }

  /** Один такт после w.update: этапы, ИИ ботов, воскрешения, проверка вайпа. */
  tick() {
    const t = this.w.time, el = t - this.stageAt;
    switch (this.stage) {
      case "gather":
        if (el >= this.gatherMs) this.beginPull();
        break;
      case "pull":
        if (el >= this.pullMs) this.beginFight();
        break;
      case "fight":
        this.checkWipe();
        break;
      case "wipe":
        if (el >= this.wipeMs) this.afterWipe();
        break;
      case "end":
        if (el >= this.endMs && !this.ended) { this.ended = true; this.o.onEnd?.(this, !!this.result?.win); }
        break;
    }
    this.tickChannels();
    this.tickTaunts();
    this.dangersGc();
    if (this.stage !== "end" || this.result?.win) for (const p of this.auto) if (this.w.players.get(p.id) === p) raidThink(this.w, p, this);
  }

  private dangersGc() {
    const t = this.w.time;
    for (let i = this.dangers.length - 1; i >= 0; i--) if (this.dangers[i].until < t) this.dangers.splice(i, 1);
  }

  private beginPull() {
    this.setStage("pull");
    this.banner("start", RAID.banners.start, T("srv.director.828", { attempt: this.attempt, attempts: RAID_CFG.attempts }));
    this.emit("pull");
  }

  private beginFight() {
    this.setStage("fight");
    this.fightAt = this.w.time;
    const m = this.boss;
    (m.def as MobDef).aggro = RAID_BOSS.aggro;
    const tank = this.mainTank() ?? this.players().find((p) => !p.dead);
    if (tank) { m.addThreat(tank.id, 50); m.targetId = tank.id; }
    m.state = "chase";
    this.knight.wake();
    this.phasesSeen.add(0);
  }

  private onPhase(n: number) {
    this.phasesSeen.add(n);
    const r = RAID_CFG.revives;
    this.revives = Math.min(r.max, this.revives + r.perPhase);
    const ph = RAID_PHASES[n];
    if (n >= 3) this.banner("enrage", RAID.banners.enrage, RAID.banners.phase.replace("{n}", phaseNo(n)).replace("{name}", ph.name));
    else this.banner("phase", RAID.banners.phase.replace("{n}", phaseNo(n)).replace("{name}", phaseName(n)));
  }

  private onDeath(p: Player) {
    if (this.stage !== "fight" || !this.byKey.has(p.name.toLowerCase())) return;
    this.stat(p).deaths++;
    for (const [by, c] of this.channels) if (c.target === p || by === p) this.cancelChannel(by);
    this.knight.onPlayerDied(p);
    this.emit("death", { name: p.name, id: p.id });
    this.checkWipe();
  }

  private checkWipe() {
    if (this.stage !== "fight") return;
    const ps = this.players();
    if (ps.length && ps.some((p) => !p.dead)) return;
    if (!ps.length) return void this.finish(false);
    this.setStage("wipe");
    this.knight.wipe();
    this.channels.clear();
    this.banner("wipe", RAID.banners.wipe, this.attempt < RAID_CFG.attempts ? T("srv.director.829", { math: Math.ceil(this.wipeMs / 1000) }) : "");
    this.emit("wipe", { attempt: this.attempt });
  }

  private afterWipe() {
    if (this.attempt >= RAID_CFG.attempts) return void this.finish(false);
    this.attempt++;
    this.revives = RAID_CFG.revives.base;
    for (const p of this.players()) this.restore(p);
    (this.boss.def as MobDef).aggro = 0;
    this.setStage("pull");
    this.banner("attempt", RAID.banners.start, T("srv.director.828", { attempt: this.attempt, attempts: RAID_CFG.attempts }));
    this.emit("pull");
  }

  /** Полное восстановление в Преддверии (как ArenaRoom.restore). */
  restore(p: Player) {
    const i = this.members.findIndex((x) => x.key === p.name.toLowerCase());
    const sp = raidSpawn(i < 0 ? 0 : i);
    p.dead = false;
    p.unit.anim = Anim.Idle;
    p.unit.x = sp.x;
    p.unit.y = sp.y;
    p.unit.hp = p.unit.maxHp;
    p.unit.mp = p.unit.maxMp;
    p.targetId = null;
    p.unit.target = "";
    p.moveTo = null;
    p.engaged = p.approach = false;
    p.input = { mx: 0, my: 0 };
    p.stunUntil = p.rootUntil = p.slowUntil = p.silenceUntil = p.fearUntil = p.warcryUntil = p.hasteUntil = p.blockUntil = p.weakUntil = p.lastStandUntil = p.lastStandReady = p.poisonUntil = p.burnUntil = p.castUntil = 0;
    p.shieldAmt = 0;
    p.attackAt = 0;
    p.cds.clear();
    for (const s of activeSkills(p.cls)) p.send("cd", { id: s.id, ms: 0 });
    p.selfDirty = true;
    const a = this.ai.get(p);
    if (a) { a.escape = null; a.seen.clear(); a.slot = -1; a.pillar = -1; a.reviving = null; }
  }

  private win(_killer?: Actor) {
    if (this.stage !== "fight") return;
    this.result = { win: true, durationMs: this.w.time - this.fightAt, attempt: this.attempt };
    this.setStage("end");
    this.banner("win", RAID.banners.win, RAID_BOSS.name);
    this.w.system(RAID.chat.win);
    this.emit("win", { ms: this.result.durationMs });
    for (const by of [...this.channels.keys()]) this.cancelChannel(by);
    for (const p of this.players()) { p.targetId = null; p.engaged = p.approach = false; }
    this.o.onWin?.(this);
  }

  private finish(win: boolean) {
    if (this.stage === "end") return;
    if (!this.result) this.result = { win, durationMs: this.fightAt ? this.w.time - this.fightAt : 0, attempt: this.attempt };
    this.setStage("end");
    if (!win) this.w.system(RAID.chat.wipe);
  }

  /**
   * Провокация в рейде действует и на босса: танк, применивший умение-провокацию (taunt, «Молот правосудия», «Хватка смерти»)
   * с боссом в цели, получает угрозу выше всех (×1.1) — так главный танк забирает босса у бойца или второго танка.
   */
  private tauntCds = new Map<string, number>();
  private tickTaunts() {
    if (this.stage !== "fight" || this.boss.dead) return;
    const b = this.boss;
    for (const p of this.players()) {
      if (p.dead || this.roleOf(p) !== "tank") continue;
      for (const id of TAUNTS) {
        if (!(p.save.skills[id] > 0)) continue;
        const key = p.id + id, cd = p.cds.get(id) || 0, prev = this.tauntCds.get(key) ?? cd;
        this.tauntCds.set(key, cd);
        if (cd <= prev || p.targetId !== b.id || this.w.dist(p, b) > (SKILLS[id].range ?? RAID_CFG.tauntRangeDefault) + b.def.radius + RAID_CFG.tauntRangePad) continue;
        let top = 0;
        for (const v of b.threat.values()) top = Math.max(top, v);
        b.threat.set(p.id, Math.max(b.threat.get(p.id) || 0, top * RAID_CFG.tauntMul + RAID_CFG.tauntFlat));
        b.targetId = p.id;
        this.emit("taunt", { by: p.name });
      }
    }
  }

  // ---------------------------------------------------------------- воскрешение
  channelOn(t: Player): Player | undefined {
    for (const [by, c] of this.channels) if (c.target === t) return by;
    return undefined;
  }
  /** raid:revive — канал рядом с телом; сбивается уроном, контролем или шагом. null — начат, иначе причина. */
  startRevive(by: Player, t: Player): string | null {
    const r = RAID_CFG.revives;
    if (this.stage !== "fight") return T("srv.director.189");
    if (by.dead || !t.dead || by === t) return T("srv.director.190");
    if (!this.byKey.has(t.name.toLowerCase())) return T("srv.director.191");
    if (this.revives <= 0) return T("srv.director.192");
    if (this.channelOn(t)) return T("srv.director.193");
    if (this.channels.has(by)) return T("srv.director.194");
    if (this.w.dist(by, t) > r.range) return T("srv.director.195");
    const now = this.w.time;
    this.channels.set(by, { target: t, until: now + r.channelMs, at: now, x: by.x, y: by.y });
    by.moveTo = null;
    by.input = { mx: 0, my: 0 };
    by.engaged = by.approach = false;
    by.castUntil = now + r.channelMs;
    by.unit.anim = Anim.Cast;
    this.w.castBar(by, r.channelMs, T("srv.skills.818"));
    this.w.emit({ t: "buff", id: by.id, k: "heal", ms: r.channelMs });
    this.send("raid:revive", { target: t.id, by: by.name, ms: r.channelMs });
    this.emit("revive", { by: by.name, name: t.name, role: this.roleOf(by) });
    return null;
  }
  cancelChannel(by: Player) {
    const c = this.channels.get(by);
    if (!c) return;
    this.channels.delete(by);
    by.castUntil = 0;
    if (by.unit.anim === Anim.Cast && !by.dead) by.unit.anim = Anim.Idle;
    this.w.castBar(by, 0);
    this.send("raid:revive", { target: c.target.id, by: by.name, ms: 0 });
  }
  private tickChannels() {
    const now = this.w.time;
    for (const [by, c] of [...this.channels]) {
      const broke = by.dead || by.hurtAt > c.at || by.stunUntil > now || Math.hypot(by.x - c.x, by.y - c.y) > 4 || !c.target.dead || this.w.players.get(c.target.id) !== c.target;
      if (broke) {
        if (!by.dead && c.target.dead) by.send("toast", { text: T("srv.skills.149"), kind: "error" });
        this.cancelChannel(by);
        continue;
      }
      if (now < c.until) continue;
      this.cancelChannel(by);
      if (this.revives <= 0) continue;
      this.spend(by);
      const t = c.target;
      t.dead = false;
      t.unit.hp = Math.max(1, Math.round(t.unit.maxHp * RAID_CFG.revives.hpPct));
      t.unit.anim = Anim.Idle;
      t.stunUntil = t.rootUntil = t.slowUntil = 0;
      t.selfDirty = true;
      t.send("toast", { text: T("srv.director.196", { name: by.name }), kind: "info" });
      this.w.emit({ t: "buff", id: t.id, k: "heal", ms: RAID_CFG.healFxMs });
      this.w.emit({ t: "aoe", k: "heal", x: t.x, y: t.y, r: 60 });
    }
  }
  /** Заряд воскрешения потрачен (канал рейда или «Воскрешение» Клирика). */
  private spend(by: Player) {
    this.revives = Math.max(0, this.revives - 1);
    this.stat(by).revives++;
    this.emit("revived", { by: by.name });
  }

  // ---------------------------------------------------------------- итоги
  results(): RaidPlayerResult[] {
    return this.members.map((m) => {
      const s = this.stats.get(m.key) ?? { damage: 0, healing: 0, deaths: 0, revives: 0 };
      return { name: m.name, cls: m.cls as ClassId, level: m.level, role: m.role, bot: m.bot, damage: Math.round(s.damage), healing: Math.round(s.healing), deaths: s.deaths, revives: s.revives };
    });
  }
  /** Центр не-танков (позиции ролей). */
  center(): { x: number; y: number } {
    let x = 0, y = 0, n = 0;
    for (const p of this.players()) if (!p.dead && this.roleOf(p) !== "tank" && inHall(p.x, p.y)) { x += p.x; y += p.y; n++; }
    return n ? { x: x / n, y: y / n } : { ...RAID_POINTS.hall };
  }
  say(p: Player, text: string) {
    if (!text) return;
    this.w.chat({ from: p.name, text, cls: p.cls, faction: p.faction, raid: true });
  }
  line(event: string, role: RaidRole | "any", vars: Record<string, string | number> = {}): string {
    return fillText(RAID.bots.lines[event]?.[role], vars, this.rand);
  }
}
