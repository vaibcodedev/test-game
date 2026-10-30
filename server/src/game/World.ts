/** Игровой мир: вся симуляция на сервере. Комната Colyseus только передаёт сюда сообщения. */
import { lootFor } from "./drop";
import { stepApproach, tickQueue } from "./skillQueue";
import { AGGRO_MUL, MAP_SEED, MOVE_MUL, PLAYER_RADIUS, PLAYER_SPEED, RESPAWN_DELAY_MS, TICK_MS } from "../../../shared/constants";
import { armorReduction } from "../../../shared/formulas";
import { meleeTiming } from "../../../shared/attackTiming";
import { BAL, leechMult, pvpClassMult, pvpDamageMult, pvpHealMult } from "../../../shared/balance";
import { PLUS_BONUS } from "../../../shared/upgrade";
import { generateMap, lineClear, moveWithCollision, terrainSpeedMul, isTownZone, walkable, zoneAtPx, Zone, type WorldMap } from "../../../shared/map";
import { segmentWalkable } from "../../../shared/path";
import { tickBiomes } from "./biomes";
import { tickCities } from "./cities";
import { nearestCity } from "../../../shared/cities";
import { ELITE } from "../../../shared/elites";
import { SKILLS } from "../../../shared/skills";
import { CLASSES } from "../../../shared/classes";
import { inEmberWalls } from "../../../shared/cities";
import { factionsHostile, inEnemyCapital, OUTLAW, pvpPlace, scramble, soldierHostile } from "../../../shared/factions";
import { MOBS } from "../../../shared/mobs";
import { MOUNTS, mountName, MOUNT_CAST_MS } from "../../../shared/mounts";
import * as mountDrops from "./mountDrops";
import {
  Anim, BUFF_BLEED, BUFF_BURN, BUFF_CURSE, BUFF_FEAR, BUFF_HASTE, BUFF_SILENCE, BUFF_POISON, BUFF_ROOT, BUFF_SLOW, BUFF_STEALTH, BUFF_STUN, BUFF_WARCRY, Dir,
  type ChatLine, type Fx, type FxKind,
} from "../../../shared/protocol";
import type { WorldState } from "../rooms/schema";
import { createBoss } from "./bosses";
import { createZoneBoss } from "./zoneBosses";
import * as legendary from "./legendary";
import * as tanks from "./tanks";
import * as healers from "./healers";
import * as mages from "./mages";
import * as archers from "./archers";
import { rogueProc } from "./rogue";
import * as rogues from "./rogue";
import { grantKillRewards } from "./rewards";
import { tickEncounters } from "./encounters";
import { Mob } from "./Mob";
import { Townfolk } from "./townfolk";
import { SpatialHash, crowdStep } from "../../../shared/crowd";
import { Soldiers } from "./soldiers";
import { BannerWar, type WarStore } from "./bannerWar";
import { FortSiege } from "./siege";
import { EventClock } from "./eventClock";
import { WorldBosses, type WbStore } from "../worldboss";
import { moveGated } from "../../../shared/siege";
import { grantPets, mobAttackPet, tickPetCast, updatePet, dismissAllPets, type Pet } from "./Pet";
import { applySlow, breakFear, endShield, fearDir, tickEffects } from "./effects";
import { CC, slowMul, slowPctCap } from "../../../shared/cc";
import { auraPack, targetAuras } from "./auras";
import * as auraFx from "./auraFx";
import type { Player } from "./Player";
import { T } from "../../../shared/texts";
import { GP } from "../../../shared/gameplay";

export type Broadcast = (type: string, msg: unknown) => void;
export type Actor = Player | Mob;

export interface HitOpts {
  kind?: FxKind;
  /** Множитель к урону оружия (для умений). */
  mult?: number;
  /** Фиксированный урон (у мобов и ловушек). */
  flat?: number;
  canCrit?: boolean;
  skill?: boolean;
  threat?: number;
  /** Не запускать эффекты легендарок (доп. удары самих эффектов). */
  noProc?: boolean;
  /** Не отражать урон (щитовой блок). */
  noReflect?: boolean;
  /** Не прерывать скрытность атакующего (яд). */
  noBreak?: boolean;
  /** Урон со временем (тик яда, горения, кровотечения): страх ломается им с весом data/cc.json fear.dotWeight. */
  dot?: boolean;
  /** Потолок снижения бронёй (доля 0…1): удар почти мимо брони (лучники башен стен, data/patrols.json towers.armorCap). */
  armorCap?: number;
}

/**
 * Итог удара (World.hitEx). landed — удар дошёл до цели: не промах (уклонение, полная неуязвимость World.isImmune,
 * нейтральный город, мёртвый или выбывший актёр). Удар, целиком поглощённый щитом, блоком или частичным снижением
 * урона (incoming), — попадание (landed, dealt = 0).
 * Контроль и дебаффы умений вешаются по landed; вампиризм, лечение от урона, ярость — по dealt.
 */
export interface HitResult {
  landed: boolean;
  dealt: number;
}
const MISS: Readonly<HitResult> = Object.freeze({ landed: false, dealt: 0 });

const rnd =(a: number, b: number) => a + Math.random() * (b - a);

export interface WorldOptions {
  /** Своя карта (арена); по умолчанию — карта мира. */
  map?: WorldMap;
  /** Создавать мобов и боссов. */
  mobs?: boolean;
  /** Не писать в чат о входе и выходе игроков. */
  quiet?: boolean;
  /** Хранилище владельцев оснований «Знамён Предела» (WorldRoom — файл рядом с базой). */
  warStore?: WarStore;
  /** Хранилище мировых боссов (задача 151): Летопись, знамя победы, недельные трофеи. */
  wbossStore?: WbStore;
  /** Подземелье «Пепельные чертоги»: свои мобы и босс, возрождение у входа, трофеи босса раз в сутки (shared/dungeon.ts). */
  dungeon?: boolean;
}

const FOLLOW_NEAR = 48, FOLLOW_FAR = 60, FOLLOW_BREAK = 600;

export class World {
  readonly map: WorldMap;
  /** PvP включено: игроки разных команд (team) враждебны. Включает арена на время боя. */
  pvpActive = false;
  onDamage?: (src: Actor, dst: Actor, v: number) => void;
  onHeal?: (p: Player, v: number) => void;
  onPlayerKilled?: (p: Player, killer?: Actor) => void;
  /** Рейд (задача 114): смерть моба с def.raid — награды выдаёт рейд; воскрешение героем — проверка и учёт зарядов рейда. */
  onRaidKill?: (m: Mob, killer?: Actor) => void;
  reviveCheck?: (by: Player, target: Player) => string | null;
  onRevived?: (by: Player, target: Player) => void;
  readonly players = new Map<string, Player>();
  readonly mobs = new Map<string, Mob>();
  /** Призванные питомцы по id юнита (pet_<id хозяина>). */
  readonly pets = new Map<string, Pet>();
  /** Кто и когда последним убил босса (id моба → запись); для городских слухов. */
  readonly bossKills = new Map<string, { by: string; at: number }>();
  /** Время симуляции в мс (растёт только в тиках). */
  time = 0;
  private fx: Fx[] = [];
  private timers: { at: number; fn: () => void; owner?: Actor; life: number }[] = [];
  private nextId = 1;
  /** Постоянные зоны урона (лужи яда, огонь). */
  /** Стражники и горожане города (только в мире, не на арене). */
  town: Townfolk | null = null;
  /** Сетка соседей для разведения толпы (shared/crowd.ts): герои, проснувшиеся мобы, бойцы и жители — пересобирается каждый такт. */
  readonly crowd = new SpatialHash(64);
  private awakeList: Mob[] = [];
  private tickN = 0;
  /** Бойцы фракций: патрули, посты, стража поселений и городов, лучники на башнях (только в мире). */
  soldiers: Soldiers | null = null;
  /** «Знамёна Предела» (задача 132, шаг 14; bannerWar.ts): только в мире. */
  war: BannerWar | null = null;
  /** Осада форта (задача 132, шаг 15; siege.ts): только в мире. */
  siege: FortSiege | null = null;
  /** Общий планировщик событий (задача 151, eventClock.ts) и мировые боссы (server/src/worldboss): только в мире. */
  clock: EventClock | null = null;
  wboss: WorldBosses | null = null;
  hazards: { id: string; x: number; y: number; r: number; until: number; dps: number; kind: FxKind; owner: Mob; tickAt: number }[] = [];

  constructor(
    readonly state: WorldState,
    readonly broadcast: Broadcast,
    readonly opts: WorldOptions = {},
  ) {
    this.map = opts.map ?? generateMap(MAP_SEED);
    if (opts.mobs !== false) this.spawnAll();
    if (opts.mobs !== false && !opts.map) {
      this.town = new Townfolk(this);
      this.soldiers = new Soldiers(this);
      this.clock = new EventClock(this);
      this.war = new BannerWar(this, opts.warStore);
      this.siege = new FortSiege(this);
      this.wboss = new WorldBosses(this, this.clock, opts.wbossStore);
    }
  }

  // ---------- инфраструктура ----------
  /** Умение, которое сейчас применяется (ставит castSkill; таймеры later его запоминают): эффекты получают поля s и c. */
  fxSkill: string | null = null;
  fxCaster: string | null = null;
  /** tag = false — без пометки умением: снятие эффекта (buff с ms 0) из чужого удара не должно выглядеть как каст того умения, которое бьёт. */
  emit(fx: Fx, tag = true) {
    if (tag && this.fxSkill && fx.t !== "dmg") { fx.s = this.fxSkill; fx.c = this.fxCaster ?? undefined; }
    this.fx.push(fx);
  }
  /**
   * Отложенный вызов через ms. owner — чей это таймер (умение героя): вызов пропускается, если к сроку владелец
   * погиб (даже если уже возродился) или ушёл из этого мира. Без owner вызывается всегда (уборка, конец эффекта).
   */
  later(ms: number, fn: () => void, owner?: Actor) {
    const s = this.fxSkill, c = this.fxCaster;
    if (s) {
      const inner = fn;
      fn = () => { const ps = this.fxSkill, pc = this.fxCaster; this.fxSkill = s; this.fxCaster = c; try { inner(); } finally { this.fxSkill = ps; this.fxCaster = pc; } };
    }
    this.timers.push({ at: this.time + ms, fn, owner, life: owner ? owner.deadAt : 0 });
  }
  chat(line: ChatLine) {
    this.broadcast("chat", line);
  }
  /** Чат героя: своя фракция читает, чужая видит «чужой язык» в цвете фракции автора. */
  playerChat(p: Player, text: string) {
    const own: ChatLine = { from: p.name, text, cls: p.cls, faction: p.faction };
    const foreign: ChatLine = { ...own, text: scramble(text), foreign: true };
    for (const q of this.players.values()) q.send("chat", q.faction === p.faction ? own : foreign);
  }
  system(text: string) {
    this.chat({ from: "", text, sys: true });
  }
  uid(prefix: string) {
    return `${prefix}${(this.nextId++).toString(36)}`;
  }

  addPlayer(p: Player, note = T("srv.World.825", { name: p.name })) {
    this.players.set(p.id, p);
    this.state.players.set(p.id, p.unit);
    if (this.opts.mobs !== false) this.later(2500, () => grantPets(this, p));
    if (!this.opts.quiet) this.system(note);
  }
  removePlayer(id: string, note?: string) {
    const p = this.players.get(id);
    if (!p) return;
    dismissAllPets(this, p);
    this.players.delete(id);
    this.state.players.delete(id);
    for (const m of this.mobs.values()) {
      m.threat.delete(id);
      if (m.targetId === id) m.targetId = null;
    }
    if (!this.opts.quiet) this.system(note ?? T("srv.World.826", { name: p.name }));
  }
  findByName(nameKey: string): Player | undefined {
    for (const p of this.players.values()) if (p.name.toLowerCase() === nameKey) return p;
    return undefined;
  }
  actor(id: string | null | undefined): Actor | undefined {
    if (!id) return undefined;
    return this.mobs.get(id) ?? this.players.get(id);
  }
  isPlayer(a: Actor): a is Player {
    return "save" in a;
  }
  /**
   * Враждебны ли двое: игрок и моб — всегда; игроки на арене — во время боя и в разных командах;
   * в мире — герои разных фракций, если оба в спорной зоне или оба в нейтральном городе (там удар — нарушение, см. hit).
   */
  hostile(a: Actor, b: Actor): boolean {
    if (a === b) return false;
    const pa = this.isPlayer(a), pb = this.isPlayer(b);
    // боец фракции (soldiers.ts): враг только героям мира чужой фракции; мобов и других бойцов не трогает
    const fa = pa ? "" : (a as Mob).faction, fb = pb ? "" : (b as Mob).faction;
    if (fa || fb) {
      if (pa === pb) return false;
      const p = (pa ? a : b) as Player;
      return soldierHostile(p.faction, p.team, fa || fb);
    }
    if (pa !== pb) return true;
    if (!pa || !pb) return false;
    if (this.pvpActive || this.opts.mobs === false) return this.pvpActive && a.team !== 0 && b.team !== 0 && a.team !== b.team;
    if (a.team !== 0 || b.team !== 0) return false;
    return factionsHostile(this.map, a.faction, a.x, a.y, b.faction, b.x, b.y);
  }
  /** Внутри стен Эмберхолла (в мире): атаки и атакующие умения героя запрещены, бафы и лечение можно. */
  noFight(p: Actor) {
    return this.opts.mobs !== false && this.isPlayer(p) && inEmberWalls(p.x, p.y);
  }
  /** Нейтральный город: бой между фракциями запрещён (только в мире). */
  inNeutral(x: number, y: number) {
    return this.opts.mobs !== false && pvpPlace(this.map, x, y) === "neutral";
  }
  /** Удар героя по герою в нейтральном городе: нарушитель отмечается, стража его бьёт. */
  markOutlaw(p: Player) {
    const fresh = p.outlawUntil <= this.time;
    p.outlawUntil = this.time + OUTLAW.ms;
    p.unit.outlaw = 1;
    if (fresh) {
      p.guardHitAt = this.time + 300;
      p.send("toast", { text: T("srv.World.177"), kind: "error" });
    }
  }
  /** Бой героев в нейтральном городе (в мире): запрещён, кроме отпора нарушителю. */
  private townSafe(src: Actor, dst: Actor): boolean {
    if (src === dst || !this.isPlayer(src) || !this.isPlayer(dst)) return false;
    if (!this.inNeutral(src.x, src.y) && !this.inNeutral(dst.x, dst.y)) return false;
    return !(dst.outlawUntil > this.time && src.outlawUntil <= this.time);
  }
  /** Герой уже не в этом мире (вышел, ушёл на арену): его отложенные умения никого не задевают. */
  private absent(a: Actor): boolean {
    return this.isPlayer(a) && this.players.get(a.id) !== a;
  }
  /**
   * Может ли src задеть dst уроном, контролем, дебаффом или автоцелью: нет, если герой (src или dst) уже не в этом мире
   * или это бой героев в нейтральном городе (кроме отпора нарушителю). Ничего не отмечает: клеймо нарушителя ставит только прямой удар (hit).
   * Автоцели и пассивки по площади — через enemiesInCircle; контроль и дебаффы — через помощники effects.ts.
   */
  canAffect(src: Actor, dst: Actor): boolean {
    return !this.absent(src) && !this.absent(dst) && !this.townSafe(src, dst);
  }
  /**
   * Полная неуязвимость («Божественный щит» tp_divine, «Танец клинков» as_dance): удар по актёру — промах (hitEx),
   * контроль и дебаффы (effects.ts) не ложатся. Каждую новую полную неуязвимость подключать только сюда.
   * Щит, блок и частичное снижение урона неуязвимостью не считаются.
   */
  isImmune(a: Actor): boolean {
    return this.isPlayer(a) ? tanks.immune(this, a) || rogues.immune(this, a) : a.immune;
  }
  /** Актёр выбыл: мёртв или (герой) уже не в этом мире — проверка для таймеров умений. */
  gone(a: Actor): boolean {
    return this.isDead(a) || this.absent(a);
  }
  /** Живые враги в круге, которых src может задеть (canAffect): мобы и враждебные игроки. */
  enemiesInCircle(src: Actor, x: number, y: number, r: number): Actor[] {
    if (this.absent(src)) return [];
    const out: Actor[] = this.mobsInCircle(x, y, r).filter((m) => !m.faction || this.hostile(src, m)); // свои бойцы фракции — не враги
    for (const p of this.playersInCircle(x, y, r)) if (this.hostile(src, p) && this.canAffect(src, p)) out.push(p);
    // урон по площади не проходит сквозь стены
    return out.filter((a) => lineClear(this.map, x, y, (a as { x: number }).x, (a as { y: number }).y));
  }

  // ---------- мобы ----------
  private spawnAll() {
    for (const s of this.map.spawns) {
      const def = MOBS[s.mob];
      if (!def) continue;
      const mob = new Mob(this.uid("m"), def, s.level, { x: s.x, y: s.y });
      mob.rollElite();
      this.addMob(mob);
    }
    for (const b of this.map.bosses) {
      const def = MOBS[b.id];
      const m = new Mob(this.uid("b"), def, def.level!, { x: b.x, y: b.y });
      m.boss = createBoss(this, m, b.arena) ?? createZoneBoss(this, m, b.arena);
      this.addMob(m);
    }
  }
  addMob(m: Mob) {
    this.mobs.set(m.id, m);
    this.state.mobs.set(m.id, m.unit);
    return m;
  }
  removeMob(m: Mob) {
    this.mobs.delete(m.id);
    this.state.mobs.delete(m.id);
  }

  // ---------- цикл ----------
  update(dtMs: number) {
    const dt = Math.min(dtMs, TICK_MS * 3) / 1000;
    this.time += dtMs;
    this.runTimers();
    for (const p of this.players.values()) this.updatePlayer(p, dt);
    tickBiomes(this, dt);
    tickCities(this);
    this.markAwake();
    this.tickN++;
    const list = this.awakeList;
    list.length = 0;
    for (const m of this.mobs.values()) if (this.awake(m)) list.push(m);
    this.buildCrowd(list);
    for (const m of list) this.updateMob(m, dt);
    for (const pet of [...this.pets.values()]) updatePet(this, pet, dt);
    this.town?.update(dt);
    this.soldiers?.update(dt);
    this.war?.update();
    this.siege?.update();
    this.wboss?.update();
    this.clock?.update(Date.now());
    this.updateHazards();
    if (this.opts.mobs !== false) tickEncounters(this);
    this.flush();
  }

  // ---------- сон мобов ----------
  /** Куски мира (AWAKE_CHUNK px), рядом с которыми есть герои: мобы там думают, остальные спят (не тратят такт и трафик). */
  private awakeChunks = new Set<number>();
  private static AWAKE_CHUNK = 512;
  private static AWAKE_R = 3;
  private markAwake() {
    const C = World.AWAKE_CHUNK, R = World.AWAKE_R;
    this.awakeChunks.clear();
    for (const p of this.players.values()) {
      const cx = Math.floor(p.x / C), cy = Math.floor(p.y / C);
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) this.awakeChunks.add((cy + j) * 4096 + cx + i);
    }
  }
  /** Спит ли моб: обычный, без цели и угрозы, вдали от героев. Боссы, призванные и вернувшиеся домой не спят. */
  /** Сетка толпы на этот такт: герои — «тяжёлые» (их обходят, не толкают), боссы тоже; мобы — радиусом пути. */
  private buildCrowd(list: Mob[]) {
    const h = this.crowd;
    h.clear();
    for (const p of this.players.values()) if (!p.dead) h.add(p, p.unit.x, p.unit.y, PLAYER_RADIUS, true);
    for (const m of list) if (!m.dead && !m.siege) h.add(m, m.unit.x, m.unit.y, World.crowdR(m), !!m.def.boss);
    this.town?.addToCrowd(h);
  }
  /** Радиус тела моба в толпе — как радиус пути (moveMob). */
  static crowdR(m: Mob) {
    return Math.min(12, m.def.radius * 0.6);
  }
  private awake(m: Mob): boolean {
    if (m.def.boss || m.summoned || m.state !== "idle" || m.threat.size) return true;
    const C = World.AWAKE_CHUNK, at = m.soldier ? m.unit : m.home; // патруль уходит от точки появления: спит по текущему месту
    return this.awakeChunks.has(Math.floor(at.y / C) * 4096 + Math.floor(at.x / C));
  }

  private runTimers() {
    if (!this.timers.length) return;
    const due = this.timers.filter((t) => t.at <= this.time);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) {
      if (t.owner && (this.gone(t.owner) || t.owner.deadAt !== t.life)) continue;
      try {
        t.fn();
      } catch (e) {
        console.error("[timer]", e);
      }
    }
  }

  private flush() {
    auraFx.tick(this, this.fx);
    if (this.fx.length) {
      // B40: эффекты героя под скрытностью (он кастер c или юнит id) уходят только ему — иначе по координатам эффектов видно невидимку
      let open = this.fx;
      const hidden = new Map<string, Player>();
      for (const p of this.players.values()) if (p.stealthUntil > this.time) hidden.set(p.id, p);
      if (hidden.size) {
        const own = new Map<Player, Fx[]>();
        open = [];
        for (const f of this.fx) {
          const id = "id" in f && typeof f.id === "string" ? f.id : undefined;
          const who = (f.c && hidden.get(f.c)) || (id && hidden.get(id));
          if (who) (own.get(who) ?? own.set(who, []).get(who)!).push(f); else open.push(f);
        }
        for (const [p, list] of own) p.send("fx", list);
      }
      if (open.length) this.broadcast("fx", open);
      this.fx = [];
    }
    const wall = Date.now();
    for (const p of this.players.values()) {
      if (p.selfDirty) {
        p.selfDirty = false;
        p.send("self", p.selfState());
      }
      // эффекты на герое (значки в рамке): весь список уходит отдельным сообщением и только при смене набора, сроков, стаков или величин
      const au = auraPack(p, this.time, wall);
      if (au.sig !== p.aurasSig) {
        p.aurasSig = au.sig;
        p.send("auras", au.list);
      }
      // обозначения бафов и дебафов на юните (Unit.fx, задача 129): набор ключей из того же списка эффектов; поле уходит всей комнате, как x, y и hp, но только при смене набора
      auraFx.playerFx(this, p, au.list);
      // эффекты выбранной цели (плашка цели): только этому игроку, при смене цели и при смене подписи списка
      const ta = p.targetId ? this.actor(p.targetId) : undefined;
      const tm = targetAuras(p, ta && !this.isDead(ta) && !(ta !== p && this.hostile(p, ta) && this.stealthed(ta)) ? ta : undefined, this.time, wall);
      if (tm) p.send("tauras", tm);
      if (p.bagsDirty) {
        p.bagsDirty = false;
        p.send("loot", lootFor(this, p));
      }
    }
    auraFx.mobFx(this);
  }

  // ---------- общие расчёты ----------
  static dirTo(dx: number, dy: number): Dir {
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down;
  }
  dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  inTown(x: number, y: number) {
    return isTownZone(zoneAtPx(this.map, x, y));
  }
  radiusOf(a: Actor) {
    return this.isPlayer(a) ? PLAYER_RADIUS : a.def.radius;
  }

  /** Мобы в круге (живые). */
  mobsInCircle(x: number, y: number, r: number): Mob[] {
    const out: Mob[] = [];
    for (const m of this.mobs.values()) if (!m.dead && Math.hypot(m.x - x, m.y - y) <= r + m.def.radius) out.push(m);
    return out;
  }
  playersInCircle(x: number, y: number, r: number): Player[] {
    const out: Player[] = [];
    for (const p of this.players.values()) if (!p.dead && Math.hypot(p.x - x, p.y - y) <= r + PLAYER_RADIUS) out.push(p);
    return out;
  }

  /** Нанесение урона с бронёй, критом, вампиризмом и наградой за убийство. Возвращает нанесённый урон (0 и при промахе, и при поглощении). */
  hit(src: Actor, dst: Actor, o: HitOpts = {}): number {
    return this.hitEx(src, dst, o).dealt;
  }

  /** То же, что hit, но отличает промах от попадания: см. HitResult. Контроль умений вешать по landed. */
  hitEx(src: Actor, dst: Actor, o: HitOpts = {}): Readonly<HitResult> {
    if (this.isDead(dst) || this.isDead(src)) return MISS;
    // отложенный удар героя, который уже не в этом мире (или по такому герою), не проходит: ни урона, ни угрозы, ни награды
    if (this.absent(src) || this.absent(dst)) return MISS;
    // боец фракции и свои (герои его фракции, мобы, другие бойцы) друг друга не ранят
    if (((!this.isPlayer(src) && src.faction) || (!this.isPlayer(dst) && dst.faction)) && !this.hostile(src, dst)) return MISS;
    // нейтральный город: герой не может ранить героя (кроме отпора нарушителю); попытка — нарушение
    if (this.townSafe(src, dst)) {
      if (!o.noProc) this.markOutlaw(src as Player);
      return MISS;
    }
    if (this.isPlayer(src) && !o.noBreak) { rogues.onBreak(this, src); src.stealthUntil = 0; }
    // полная неуязвимость цели — промах: ни урона, ни контроля (щит, блок и частичное снижение — попадание)
    if (this.isImmune(dst)) {
      if (this.isPlayer(dst)) dst.combatAt = this.time;
      if (this.isPlayer(src)) src.combatAt = this.time;
      this.emit({ t: "dmg", id: dst.id, v: 0, imm: true });
      return MISS;
    }
    // мировой босс (задача 151): герой ниже minLevel его не ранит
    if (this.wboss?.weak(src, dst)) return MISS;
    // уклонение (Ловкость): обычные удары мобов и игроков, кроме фиксированного урона (зоны боссов, отражение, DoT)
    if (this.isPlayer(dst) && o.flat === undefined && src !== dst && Math.random() < dst.derived.dodge) {
      dst.combatAt = this.time;
      if (this.isPlayer(src)) src.combatAt = this.time;
      this.emit({ t: "dmg", id: this.idOf(dst), v: 0, miss: true });
      rogues.onDodge(this, dst, src);
      return MISS;
    }
    let amount: number, crit = false;
    if (this.isPlayer(src)) {
      const d = src.derived;
      amount = rnd(d.dmgMin, d.dmgMax + 1) * (o.mult ?? 1);
      if (o.skill) amount *= d.skillMult;
      if (src.warcryUntil > this.time) amount *= 1 + src.warcryDmg / 100;
      if (src.weakUntil > this.time) amount *= 1 - src.weakPct / 100;
      // ярость от ран (Потрошитель): чем меньше здоровья, тем сильнее удар
      const rage = CLASSES[src.cls].rage;
      if (rage) amount *= 1 + rage * (1 - src.unit.hp / Math.max(1, src.unit.maxHp));
      if (!this.isPlayer(dst) && dst.def.boss) amount *= d.bossMult;
      const forced = o.flat === undefined && src.critNextUntil > this.time;
      if (forced) src.critNextUntil = 0;
      // по герою — потолок шанса и силы крита (data/balance.json pvp): крит-цепочки не решают бой одним залпом
      const vsHero = this.isPlayer(dst), critP = d.crit + rogues.critBonus(this, src, dst);
      if (o.canCrit !== false && (forced || Math.random() < (vsHero ? Math.min(critP, BAL.pvp.critChanceMax) : critP))) {
        crit = true;
        amount *= vsHero ? Math.min(d.critMult, BAL.pvp.critMultMax) : d.critMult;
      }
      if (o.flat) amount = o.flat;
      else amount *= tanks.outgoing(this, src, dst, o) * healers.outgoing(this, src, dst, o) * mages.outgoing(this, src, dst, o) * archers.outgoing(this, src, dst, o) * rogues.outgoing(this, src, dst, o) * legendary.outgoing(this, src, dst);
    } else {
      amount = o.flat ?? src.stats.dmg * rnd(0.85, 1.15) * (o.mult ?? 1);
      if (src.unit.buffs & 0x20) amount *= 1.3; // ярость босса
      if (src.weakUntil > this.time) amount *= 1 - src.weakPct / 100;
    }
    const level = this.isPlayer(src) ? src.level : src.level;
    let armor = this.isPlayer(dst) ? dst.derived.armor + (dst.warcryUntil > this.time ? dst.warcryArmor : 0) : dst.stats.armor;
    if (o.kind && o.kind !== "phys") armor *= 0.5;
    const preArmor = amount;
    amount *= 1 - Math.min(armorReduction(armor, level), o.armorCap ?? 1);
    if (!this.isPlayer(dst)) amount *= (dst.ai.weak?.dmg?.[o.kind ?? "phys"] ?? 1) * dst.dmgTakenMul;
    // PvP (docs/plan/balance.md «PvP»): устойчивость по уровню цели, бонус заточки оружия атакующего — долей plusShare. Сразу после брони:
    // поглощения ресурсом («Мановая броня»), щиты и лечение от заблокированного считаются в единицах здоровья, а урон героя растёт как L².
    const pvpHit = this.isPlayer(src) && this.isPlayer(dst) && src !== dst;
    let pvpK = 1;
    if (pvpHit) {
      dst.pvpAt = this.time;
      const wp = src.save.equip.weapon?.plus || 0;
      pvpK = (pvpDamageMult(dst.level) * pvpClassMult(src.cls, dst.cls, src.level, dst.level) * (1 + PLUS_BONUS * wp * BAL.pvp.plusShare)) / (1 + PLUS_BONUS * wp);
      pvpK *= (src.save.botPower ?? 1) * (dst.save.botTaken ?? 1); // бот арены: урон и получаемый — по рейтингу (pvp.botPower/botTaken)
      amount *= pvpK;
    }
    let reflect = 0;
    if (this.isPlayer(dst)) {
      amount *= dst.derived.dmgTaken;
      const ls = dst.save.skills.laststand || 0;
      if (ls && dst.unit.hp < dst.unit.maxHp * 0.3 && this.time >= dst.lastStandReady) {
        const v = SKILLS.laststand.v(ls);
        dst.lastStandUntil = this.time + v.dur * 1000;
        dst.lastStandPct = v.reduce; // для значка эффекта (auras.ts)
        dst.lastStandReady = this.time + v.icd * 1000;
        this.emit({ t: "buff", id: dst.id, k: "block", ms: v.dur * 1000 });
      }
      if (dst.lastStandUntil > this.time) amount *= 1 - (SKILLS.laststand.v(ls || 1).reduce) / 100;
      if (dst.blockUntil > this.time) {
        tanks.onBlock(this, dst, (amount * dst.blockPct) / 100);
        reflect = (amount / pvpK * dst.blockPct * dst.blockReflect) / 10000; // отражение — обычным уроном, PvP-множитель получит его удар
        amount *= 1 - dst.blockPct / 100;
      }
      // костяная броня: бьющий вплотную замедлен
      if (dst.boneUntil > this.time && src !== dst && this.dist(src, dst) < 90) applySlow(this, dst, src, dst.boneChill, 1500);
      const before = amount;
      // incoming — только частичное снижение; полная неуязвимость отсечена выше (isImmune), здесь урон съеден целиком — попадание
      amount = rogues.incoming(this, src, dst, mages.incoming(this, src, dst, healers.incoming(this, src, dst, tanks.incoming(this, src, dst, amount, o), o), o));
      if (amount <= 0) {
        dst.combatAt = this.time;
        if (this.isPlayer(src)) src.combatAt = this.time;
        this.emit({ t: "dmg", id: dst.id, v: Math.round(before), abs: true });
        return { landed: true, dealt: 0 };
      }
    }
    // PvP: суммарное снижение (броня, пассивки, стойки, блок, снижения умений) не больше pvp.mitigationCap — танк не неуязвим для бойца
    if (pvpHit) amount = Math.max(amount, preArmor * pvpK * (1 - BAL.pvp.mitigationCap));
    amount = legendary.absorb(this, dst, amount);
    if (this.isPlayer(dst) && dst.shieldAmt > 0) {
      if (dst.shieldUntil > this.time) {
        const ab = Math.min(dst.shieldAmt, amount);
        dst.shieldAmt -= ab;
        amount -= ab;
        if (dst.shieldBy) this.onHeal?.(dst.shieldBy, Math.round(ab));
        healers.onAbsorb(this, dst.shieldBy, dst, ab, src);
        mages.onAbsorb(this, dst, ab);
        // щит пробит раньше срока: картинка исчезает сразу (buff с ms 0), срок обнуляется — следующий щит не унаследует остаток чужого срока;
        // значок в рамке героя уходит сам (auras.ts: щит с остатком меньше 1 не показывается)
        if (dst.shieldAmt < 0.5) {
          dst.shieldAmt = 0;
          dst.shieldUntil = 0;
          endShield(this, dst, legendary.barrierLeft(dst, this.time) > 0);
        }
        if (amount < 0.5) {
          dst.combatAt = this.time;
          if (this.isPlayer(src)) src.combatAt = this.time;
          this.emit({ t: "dmg", id: dst.id, v: Math.round(ab), abs: true });
          return { landed: true, dealt: 0 };
        }
      } else dst.shieldAmt = 0;
    }
    // PvP: один удар — не больше hitCapHp здоровья цели, за 1 с — не больше burstCapHp (после щитов: потолок того, что дошло до здоровья).
    // Только в бою близких уровней (атакующий не выше цели больше чем на capLevelGap): старший по уровню остаётся сильнее.
    if (pvpHit && this.isPlayer(src) && this.isPlayer(dst) && src.level <= dst.level + BAL.pvp.capLevelGap) {
      amount = Math.min(amount, dst.unit.maxHp * BAL.pvp.hitCapHp);
      // потолок урона от героев за секунду (burstCapHp здоровья): серия ударов, процов и тиков не убивает за 2–3 с
      if (this.time - dst.pvpBurstAt >= 1000) { dst.pvpBurstAt = this.time; dst.pvpBurst = 0; }
      amount = Math.max(0, Math.min(amount, dst.unit.maxHp * BAL.pvp.burstCapHp - dst.pvpBurst));
      dst.pvpBurst += amount;
    }
    if (this.isPlayer(dst)) amount = tanks.redirect(this, src, dst, amount);
    // кровавые узы: часть урона по союзнику принимает Кровотворец
    if (this.isPlayer(dst) && dst.bondUntil > this.time && dst.bondBy && dst.bondBy !== dst && !dst.bondBy.dead && this.players.get(dst.bondBy.id) === dst.bondBy) {
      const share = (amount * dst.bondShare) / 100;
      if (share >= 1) {
        amount -= share;
        const bw = dst.bondBy, sv = Math.round(share * healers.bondTaken(dst.bondBy));
        if (sv > 0) {
          this.applyDamage(bw, sv, src);
          this.emit({ t: "dmg", id: bw.id, v: sv, k: "blood" });
        }
      }
    }
    let v = Math.max(1, Math.round(amount));
    if (this.isPlayer(dst)) v = legendary.beforeLethal(this, dst, rogues.beforeLethal(this, dst, mages.beforeLethal(this, dst, healers.beforeLethal(this, dst, tanks.beforeLethal(this, dst, v)))));
    this.applyDamage(dst, v, src);
    this.onDamage?.(src, dst, v);
    this.wboss?.onDamage(src, dst, v);
    breakFear(this, dst, src, v, o);
    this.emit({ t: "dmg", id: this.idOf(dst), v, crit, k: o.kind ?? "phys" });
    if (this.isPlayer(src)) {
      const ls = src.derived.lifesteal + (src.frenzyUntil > this.time ? src.frenzyLeech / 100 : 0);
      if (ls > 0) this.heal(src, Math.round(v * ls * leechMult(src.level)), false);
      tanks.afterDealt(this, src, dst, v, o);
      rogues.afterDealt(this, src, dst, v, o);
      healers.afterDealt(this, src, dst, v, o);
      mages.afterDealt(this, src, dst, v, o, crit);
      archers.afterDealt(this, src, dst, v, o, crit);
    }
    if (this.isPlayer(dst) && !o.noProc) tanks.afterDamaged(this, src, dst, v, o);
    if (this.isPlayer(dst)) healers.afterDamaged(this, src, dst, v, o);
    if (this.isPlayer(dst)) mages.afterDamaged(this, src, dst, v, o);
    if (this.isPlayer(dst)) archers.afterDamaged(this, src, dst, v, o);
    if (this.isPlayer(dst)) rogues.afterDamaged(this, src, dst, v);
    if (!this.isPlayer(dst)) dst.addThreat(this.idOf(src), v * (o.threat ?? 1) * (this.isPlayer(src) ? CLASSES[src.cls].threat : 1));
    if (reflect >= 1 && !o.noReflect && !this.isDead(src)) this.hit(dst, src, { flat: Math.round(reflect), canCrit: false, noReflect: true, noProc: true, threat: 1 });
    legendary.onHit(this, src, dst, v, crit, o);
    legendary.onDamaged(this, src, dst, v, o);
    return { landed: true, dealt: v };
  }

  idOf(a: Actor) {
    return a.id;
  }
  /** Игрок в скрытности: его нельзя выбрать целью. */
  stealthed(a: Actor): boolean {
    return this.isPlayer(a) && a.stealthUntil > this.time;
  }
  isDead(a: Actor) {
    return this.isPlayer(a) ? a.dead : a.dead;
  }

  /** Лечение p; `by` — кто лечит (для статистики арены), по умолчанию сам p. Возвращает реально восстановленное. */
  /** Урон стражи по нарушителю: растёт с каждым ударом подряд. */
  guardDamage(p: Player): number {
    const k = 1 + OUTLAW.escalate * Math.min(p.guardHits, OUTLAW.escalateMax);
    p.guardHits++;
    return Math.max(1, Math.round(p.unit.maxHp * OUTLAW.pctMaxHp * k));
  }
  heal(p: Player, v: number, show = true, by?: Player): number {
    if (p.dead || v <= 0) return 0;
    if (p.outlawUntil > this.time || p.intruder) v = Math.max(1, Math.round(v * OUTLAW.healMul)); // клеймо нарушителя режет лечение
    // PvP: лечение растёт с уровнем как урон (L²), здоровье — как L; на арене и после удара героя оно режется по кривой pvp.heal
    if (this.pvpActive || this.time - p.pvpAt < BAL.pvp.healWindowMs) v = Math.max(1, Math.round(v * pvpHealMult(p.level) * ((by ?? p).save.botPower ?? 1)));
    const before = p.unit.hp;
    p.unit.hp = Math.min(p.unit.maxHp, p.unit.hp + v);
    const got = p.unit.hp - before;
    if (got > 0) { this.onHeal?.(by ?? p, got); this.wboss?.onHeal(by ?? p, p, got); }
    if (show && got > 0) this.emit({ t: "dmg", id: p.id, v: got, heal: true });
    if (by) healers.onHealed(this, p, v, got, by);
    return got;
  }

  applyDamage(dst: Actor, v: number, src?: Actor) {
    const u = dst.unit;
    u.hp = Math.max(0, u.hp - v);
    if (this.isPlayer(dst)) {
      if (v > 0) dst.stealthUntil = 0;
      // бой — только урон от враждебного актёра; среда (жара, холод, утопление) боем не считается
      if (src && src !== dst) { dst.combatAt = this.time; if (this.isPlayer(src)) src.combatAt = this.time; }
      if (v > 0) { dst.hurtAt = this.time; this.breakMount(dst); }
      if (u.hp <= 0) this.killPlayer(dst, src);
    } else {
      dst.lastHitAt = this.time;
      if (src && this.isPlayer(src)) {
        src.combatAt = this.time;
        dst.damageBy.set(src.id, (dst.damageBy.get(src.id) || 0) + v);
        if (dst.state === "idle") {
          dst.state = "chase";
          dst.targetId = src.id;
        }
      }
      if (u.hp <= 0) this.killMob(dst, src);
    }
  }

  killMob(m: Mob, killer?: Actor) {
    m.state = "dead";
    m.unit.anim = Anim.Dead;
    m.unit.buffs = 0;
    m.unit.target = "";
    m.deadAt = this.time;
    const respawn = m.def.respawn ? m.def.respawn * 1000 : rnd(GP.mobs.respawnMs[0], GP.mobs.respawnMs[1]);
    m.respawnAt = this.time + respawn;
    m.boss?.onDeath();
    if (m.boss) this.bossKills.set(m.def.id, { by: killer && this.isPlayer(killer) ? killer.name : T("srv.World.827"), at: this.time });
    if (killer && this.isPlayer(killer)) { legendary.onKill(this, killer, m); tanks.onKill(this, killer, m); healers.onKill(this, killer, m); mages.onKill(this, killer, m); archers.onKill(this, killer, m); rogues.onKill(this, killer, m); if (!m.faction && !m.def.wboss) mountDrops.onKill(this, killer, m); }
    if (m.def.raid) this.onRaidKill?.(m, killer);
    else if (!m.faction && !m.def.wboss) grantKillRewards(this, m, killer && this.isPlayer(killer) ? killer : undefined); // боец фракции — без опыта и добычи
    if (m.summoned) this.later(2500, () => this.removeMob(m));
  }

  killPlayer(p: Player, killer?: Actor) {
    this.breakMount(p);
    p.petCast = null;
    p.dead = true;
    if (p.shieldAmt > 0 || p.shieldUntil > this.time) endShield(this, p, legendary.barrierLeft(p, this.time) > 0);
    p.shieldAmt = 0;
    p.shieldUntil = 0;
    p.unit.shield = 0;
    p.bondUntil = p.boneUntil = p.frenzyUntil = p.curseUntil = p.bleedUntil = p.venomUntil = 0;
    p.deadAt = this.time;
    p.unit.anim = Anim.Dead;
    p.unit.buffs = 0;
    p.targetId = null;
    p.moveTo = null;
    p.unit.target = "";
    for (const m of this.mobs.values()) {
      m.threat.delete(p.id);
      if (m.targetId === p.id) m.targetId = null;
    }
    p.send("toast", { text: T("srv.World.178"), kind: "error" });
    this.war?.onKill(p, killer);
    this.siege?.onKill(p, killer);
    this.wboss?.onKill(p, killer);
    this.onPlayerKilled?.(p, killer);
  }

  respawn(p: Player) {
    if (!p.dead || this.time - p.deadAt < RESPAWN_DELAY_MS) return;
    // «Знамёна Предела»: павший на Полях в битве — в своём форте без потери золота; вне битвы — у взятой своей заставы центра
    const ws = this.opts.mobs === false ? null : this.war?.respawnAt(p) ?? null;
    const lost = ws?.free ? 0 : Math.floor(p.save.gold * 0.1);
    p.save.gold -= lost;
    p.dead = false;
    // возрождение в ближайшем открытом городе своей фракции: своя столица всегда, чужая — никогда (на арене — у фонтана)
    const sp = this.opts.mobs === false || this.opts.dungeon ? this.map.playerSpawn : ws ?? nearestCity(p.save.cities, p.x, p.y, p.faction).spawn;
    p.unit.x = sp.x;
    p.unit.y = sp.y;
    p.unit.hp = p.unit.maxHp;
    p.unit.mp = p.unit.maxMp;
    p.unit.anim = Anim.Idle;
    p.stunUntil = p.rootUntil = p.slowUntil = p.silenceUntil = p.fearUntil = 0;
    p.selfDirty = true;
    if (lost) p.send("toast", { text: T("srv.World.179", { lost: lost }), kind: "error" });
  }

  // ---------- маунты ----------
  /** Снимает маунт и отменяет призыв (атака, умение, урон). */
  breakMount(p: Player) {
    if (p.tele) {
      p.tele = null;
      this.emit({ t: "tp", id: p.id, ph: "cancel", x: p.x, y: p.y });
      p.send("mountcast", { ms: 0 });
      p.send("toast", { text: T("srv.World.180"), kind: "error" });
    }
    if (p.mountCast) {
      p.mountCast = null;
      p.send("mountcast", { ms: 0 });
    }
    if (p.unit.mount) {
      p.unit.mount = "";
      p.selfDirty = true;
    }
  }

  /** X: сесть (с 2-секундным призывом) или слезть. */
  toggleMount(p: Player) {
    const err = (text: string) => p.send("toast", { text, kind: "error" });
    if (p.dead) return;
    if (p.unit.mount || p.mountCast) return this.breakMount(p);
    if (this.opts.mobs === false || p.team !== 0) return err(T("srv.World.181"));
    const m = MOUNTS[p.save.mount ?? ""];
    if (!m || !p.save.mounts?.includes(m.id)) return err(T("srv.World.182"));
    if (p.level < m.level) return err(T("srv.World.183", { mountname: mountName(m.id, p.faction), level: m.level }));
    if (p.inCombat(this.time)) return err(T("srv.World.184"));
    if (p.stunUntil > this.time || p.fearUntil > this.time || p.frozenUntil > this.time) return;
    p.input = { mx: 0, my: 0 };
    p.moveTo = null;
    p.mountCast = { until: this.time + MOUNT_CAST_MS, x: p.x, y: p.y };
    p.send("mountcast", { ms: MOUNT_CAST_MS, name: mountName(m.id, p.faction) }); // имя гербового — по фракции героя (задача 142)
  }

  /** Шаг со стенами; в мире — и с воротами городов (shared/siege.ts): чужие упираются в закрытые, свои проходят. */
  move(x: number, y: number, dx: number, dy: number, r: number, faction: string) {
    return this.siege ? moveGated(this.map, x, y, dx, dy, r, faction) : moveWithCollision(this.map, x, y, dx, dy, r);
  }

  // ---------- игроки ----------
  playerSpeed(p: Player): number {
    let s = PLAYER_SPEED * (MOUNTS[p.unit.mount]?.speed ?? 1);
    if (p.slowUntil > this.time) s *= slowMul(p.slowPct);
    if (p.stealthUntil > this.time) s *= 0.7;
    if (this.war) s *= this.war.speedMul(p);
    return s * terrainSpeedMul(this.map, p.unit.x, p.unit.y);
  }

  stepToward(p: Player, gx: number, gy: number, dt: number, stopAt: number): boolean {
    const u = p.unit;
    const gd = Math.hypot(gx - u.x, gy - u.y);
    if (gd <= stopAt + 0.5) return false;
    const wp = p.nav.next(this.map, u.x, u.y, gx, gy, PLAYER_RADIUS, this.time);
    if (!wp) return false;
    const final = wp.x === gx && wp.y === gy;
    const tx = wp.x, ty = wp.y;
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(this.playerSpeed(p) * dt, final ? d - stopAt : d);
    const n = this.move(u.x, u.y, (dx / d) * sp, (dy / d) * sp, PLAYER_RADIUS, p.faction);
    // сравниваем уже округлённые координаты: иначе добавка <0,05 px давала «движение» вечно
    const rx = Math.round(n.x * 10) / 10, ry = Math.round(n.y * 10) / 10;
    const moved = rx !== u.x || ry !== u.y;
    u.x = rx;
    u.y = ry;
    u.dir = World.dirTo(dx, dy);
    return moved;
  }

  /** Цель следования; null и «Следование прервано» — движение, дальность > 600 px, цель исчезла. */
  private followTarget(p: Player): Actor | null {
    const a = p.followId ? this.actor(p.followId) : undefined;
    const bad = !a || this.isDead(a) || p.input.mx || p.input.my || this.dist(p.unit, a) > FOLLOW_BREAK;
    if (bad) { this.stopFollow(p, true); return null; }
    return a;
  }
  stopFollow(p: Player, toast: boolean) {
    if (!p.followId) return;
    p.followId = null;
    p.followGo = false;
    if (toast) p.send("toast", { text: T("srv.World.185"), kind: "info" });
  }

  /** Сообщение клиенту: полоса каста (ms=0 — скрыть). */
  castBar(p: Player, ms: number, name?: string) { p.send("cast", { ms, name }); }

  updatePlayer(p: Player, dt: number) {
    const u = p.unit;
    if (p.dead) return;
    const t = this.time;
    tickEffects(this, p);
    tickQueue(this, p);
    archers.tickArcher(this, p);
    // эффекты состояния -> флаги для клиентов
    let b = 0;
    if (p.slowUntil > t) b |= BUFF_SLOW;
    if (p.stunUntil > t) b |= BUFF_STUN;
    if (p.rootUntil > t) b |= BUFF_ROOT;
    if (p.warcryUntil > t) b |= BUFF_WARCRY;
    if (p.hasteUntil > t) b |= BUFF_HASTE;
    if (p.poisonUntil > t) b |= BUFF_POISON;
    if (p.burnUntil > t) b |= BUFF_BURN;
    if (p.stealthUntil > t) b |= BUFF_STEALTH;
    if (p.curseUntil > t) b |= BUFF_CURSE;
    if (p.bleedUntil > t) b |= BUFF_BLEED;
    if (p.silenceUntil > t) b |= BUFF_SILENCE;
    if (p.fearUntil > t) b |= BUFF_FEAR;
    u.buffs = b;
    const sp = p.slowUntil > t ? Math.round(slowPctCap(p.slowPct)) : 0;
    if (u.slowPct !== sp) u.slowPct = sp;
    // остаток щита-поглотителя для рамок цели и группы (только у героев, целым): шлётся только при изменении
    if (p.shieldAmt > 0 && p.shieldUntil <= t) p.shieldAmt = 0; // срок вышел: остаток не висит (по shieldAmt судят и боты арены и рейда)
    const sh = p.shieldUntil > t ? Math.round(p.shieldAmt) : 0;
    if (u.shield !== sh) u.shield = sh;
    // чужак во вражеской столице: стража бьёт, пока он там (метка нарушителя видна всем)
    const intruder = this.opts.mobs !== false && p.team === 0 && !p.dead && inEnemyCapital(p.faction, u.x, u.y);
    if (intruder !== p.intruder) {
      p.intruder = intruder;
      if (intruder) {
        p.guardHitAt = t + 600;
        p.send("toast", { text: T("srv.World.186"), kind: "error" });
      }
      u.outlaw = intruder || p.outlawUntil > t ? 1 : 0;
    }
    if (!intruder && p.outlawUntil <= t) p.guardHits = 0;
    if (intruder && t >= p.guardHitAt) {
      p.guardHitAt = t + OUTLAW.hitMs;
      this.town?.punish(p, this.guardDamage(p));
    }
    // нарушитель мира: стража бьёт, пока он в нейтральном городе
    if (p.outlawUntil > 0) {
      if (p.outlawUntil <= t) { p.outlawUntil = 0; u.outlaw = intruder ? 1 : 0; }
      else if (t >= p.guardHitAt && this.inNeutral(u.x, u.y)) {
        p.guardHitAt = t + OUTLAW.hitMs;
        this.town?.punish(p, this.guardDamage(p), true); // драка героев: сначала окрик и подход стражи
      }
    }

    p.checkFood();
    const cb = p.inCombat(t);
    if (cb !== p.combatSent) { p.combatSent = cb; p.send("combat", { on: cb }); }
    tickPetCast(this, p);
    if (p.mountCast) {
      if (Math.hypot(u.x - p.mountCast.x, u.y - p.mountCast.y) > 0.5 || p.input.mx || p.input.my || p.moveTo || p.stunUntil > t || p.fearUntil > t) this.breakMount(p);
      else if (t >= p.mountCast.until) {
        p.mountCast = null;
        u.mount = p.save.mount ?? "";
        p.send("mountcast", { ms: 0 });
      }
    }

    // регенерация: вне боя быстрее, в городе ещё быстрее
    const town = this.inTown(u.x, u.y);
    const calm = !p.inCombat(t);
    const d = p.derived;
    p.regenAcc += d.hpRegen * dt * (town ? 8 : calm ? 3 : 1);
    p.manaAcc += d.mpRegen * dt * (town ? 4 : 1);
    if (p.regenAcc >= 1) { const w = Math.floor(p.regenAcc); p.regenAcc -= w; const hp0 = u.hp; u.hp = Math.min(u.maxHp, u.hp + w); p.regenShow = p.regenShow + (u.hp - hp0); if (p.regenShow >= Math.max(2, u.maxHp * 0.03)) { this.emit({ t: "dmg", id: p.id, v: p.regenShow, heal: true }); p.regenShow = 0; } }
    if (p.manaAcc >= 1) { const w = Math.floor(p.manaAcc); p.manaAcc -= w; u.mp = Math.min(u.maxMp, u.mp + w); }

    const frozen = p.frozenUntil > t;
    // каст стоя прерывается, если игрок пошёл (WASD или клик по земле)
    if (p.castBreakable && p.castUntil > t && (p.input.mx || p.input.my || p.moveTo)) {
      p.castUntil = 0;
      p.castBreakable = false;
      this.castBar(p, 0);
      if (u.anim === Anim.Cast) u.anim = Anim.Idle;
      p.send("toast", { text: T("srv.World.187"), kind: "error" });
    }
    const feared = !frozen && p.fearUntil > t && p.stunUntil <= t;
    const canMove = !frozen && !feared && p.fearUntil <= t && p.stunUntil <= t && p.rootUntil <= t && p.castUntil <= t;
    const target = p.targetId ? this.actor(p.targetId) : undefined;
    const foe = !!target && this.hostile(p, target);
    if (p.targetId && (!target || this.isDead(target) || (foe ? this.stealthed(target) : !this.isPlayer(target)) || this.dist(u, target) > 900)) {
      p.targetId = null;
      u.target = "";
    }
    if (!p.targetId || !foe) p.engaged = p.approach = false;
    let moving = false;
    const fol = p.followId ? this.followTarget(p) : null;
    if (feared) {
      // страх: управление у сервера — бег прочь от источника (data/cc.json fear), корни держат на месте
      p.moveTo = null;
      p.pend = null;
      if (p.rootUntil <= t) {
        const fd = fearDir(this, p), sp = this.playerSpeed(p) * CC.fear.speedMul * dt;
        const n = this.move(u.x, u.y, fd.x * sp, fd.y * sp, PLAYER_RADIUS, p.faction);
        moving = n.x !== u.x || n.y !== u.y;
        u.x = Math.round(n.x * 10) / 10;
        u.y = Math.round(n.y * 10) / 10;
        u.dir = World.dirTo(fd.x, fd.y);
      }
    } else if (canMove) {
      if (p.input.mx || p.input.my) {
        const len = Math.hypot(p.input.mx, p.input.my);
        const sp = this.playerSpeed(p) * dt;
        const n = this.move(u.x, u.y, (p.input.mx / len) * sp, (p.input.my / len) * sp, PLAYER_RADIUS, p.faction);
        moving = n.x !== u.x || n.y !== u.y;
        u.x = Math.round(n.x * 10) / 10;
        u.y = Math.round(n.y * 10) / 10;
        u.dir = World.dirTo(p.input.mx, p.input.my);
        p.moveTo = null;
        p.pend = null;
        if (!p.chase) p.approach = false;
      } else if (p.moveTo) {
        moving = this.stepToward(p, p.moveTo.x, p.moveTo.y, dt, 2);
        if (!moving) p.moveTo = null;
      } else if (fol) {
        // держим 40–60 px: трогаемся дальше 60, встаём ближе 48
        const fd = this.dist(u, fol);
        if (fd > FOLLOW_FAR) p.followGo = true;
        else if (fd <= FOLLOW_NEAR + 1) p.followGo = false;
        if (p.followGo) moving = this.stepToward(p, fol.x, fol.y, dt, FOLLOW_NEAR);
        if (!moving) p.followGo = false;
      } else if (p.pend) {
        moving = stepApproach(this, p, dt);
      } else if (p.targetId && foe && p.engaged && p.approach) {
        const range = p.attackRange() + this.radiusOf(target);
        const d2 = this.dist(u, target);
        if (d2 > range || (p.ranged() && !lineClear(this.map, u.x, u.y, target.x, target.y))) moving = this.stepToward(p, target.x, target.y, dt, Math.min(range - 4, d2));
      }
    }
    // автоатака
    if (p.targetId && target && foe && p.engaged && !this.isDead(target) && !frozen && p.stunUntil <= t && p.fearUntil <= t && t >= p.attackAt && !this.noFight(p) && !(p.input.mx || p.input.my) && !p.moveTo) {
      const d2 = this.dist(u, target);
      if (d2 <= p.attackRange() + this.radiusOf(target) && lineClear(this.map, u.x, u.y, target.x, target.y)) this.playerAttack(p, target);
    }
    if (moving) u.anim = Anim.Walk;
    else if (u.anim === Anim.Walk) u.anim = Anim.Idle;
  }

  playerAttack(p: Player, target: Actor) {
    const u = p.unit;
    this.breakMount(p);
    const haste = p.hasteUntil > this.time ? 1 + p.hastePct / 100 : 1;
    const cdMs = (p.derived.attackCd * 1000) / haste;
    p.attackAt = this.time + cdMs;
    p.combatAt = this.time;
    u.dir = World.dirTo(target.x - u.x, target.y - u.y);
    u.aseq = (u.aseq + 1) % 65535;
    const cls = p.cls, atk = CLASSES[cls].attack;
    if (atk.melee) {
      // урон — в кадр контакта клинка анимации удара (shared/attackTiming.ts, data/hero-b-live.json attackTiming): цифра совпадает с ударом
      this.later(meleeTiming(u.weapon, cdMs).hitMs, () => {
        if (this.isDead(target) || !this.hostile(p, target)) return;
        this.hit(p, target, { kind: atk.hit });
        if (cls === "rogue") rogueProc(this, p, target);
      }, p);
    } else {
      const ms = (this.dist(u, target) / (atk.speed ?? 500)) * 1000;
      this.emit({ t: "proj", k: atk.proj ?? "arcane", from: p.id, to: target.id, tx: target.x, ty: target.y, ms });
      this.later(ms, () => { if (!this.isDead(target) && this.hostile(p, target)) this.hit(p, target, { kind: atk.hit }); }, p);
    }
  }

  // ---------- мобы ----------
  mobSpeed(m: Mob) {
    let s = m.def.speed * m.speedMul;
    if (m.slowUntil > this.time) s *= slowMul(m.slowPct);
    return s;
  }

  private moveMob(m: Mob, gx: number, gy: number, dt: number, speed: number, stopAt = 0): boolean {
    const u = m.unit;
    if (Math.hypot(gx - u.x, gy - u.y) <= stopAt + 0.5) return false;
    const r = Math.min(12, m.def.radius * 0.6);
    const wp = m.nav.next(this.map, u.x, u.y, gx, gy, r, this.time);
    if (!wp) return false;
    const final = wp.x === gx && wp.y === gy;
    const tx = wp.x, ty = wp.y;
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1;
    // общий множитель ходьбы всех живых (data/balance.json moveMul): speed в данных мобов — «до множителя»
    const sp = Math.min(speed * MOVE_MUL * dt, final ? d - stopAt : d);
    // разведение толпы: мобы не налезают друг на друга и обходят соседей; цель (герой) не отталкивает
    const s = m.def.boss ? { x: (dx / d) * sp, y: (dy / d) * sp } : crowdStep(this.crowd, m, u.x, u.y, r, (dx / d) * sp, (dy / d) * sp, 0, gx, gy);
    const n = this.move(u.x, u.y, s.x, s.y, r, m.faction);
    if (this.inTown(n.x, n.y)) return false;
    const moved = Math.abs(n.x - u.x) + Math.abs(n.y - u.y) > 0.01;
    u.x = Math.round(n.x * 10) / 10;
    u.y = Math.round(n.y * 10) / 10;
    u.dir = World.dirTo(dx, dy);
    return moved;
  }

  /** Стоящий в бою моб расходится с налезшими соседями (окружают героя, а не стоят в одной точке); цель (gx, gy) не толкает. */
  private nudgeMob(m: Mob, dt: number, gx: number, gy: number) {
    // раз в 3 такта на моба (с тройным шагом): толпа у героя расходится так же, а такт дешевле
    if (m.def.boss || (this.tickN + m.nudgeSlot) % 3) return;
    const u = m.unit, r = World.crowdR(m);
    const s = crowdStep(this.crowd, m, u.x, u.y, r, 0, 0, this.mobSpeed(m) * MOVE_MUL * dt * 1.5, gx, gy);
    if (!s.x && !s.y) return;
    const n = this.move(u.x, u.y, s.x, s.y, r, m.faction);
    if (this.inTown(n.x, n.y)) return;
    u.x = Math.round(n.x * 10) / 10;
    u.y = Math.round(n.y * 10) / 10;
  }

  /** Самая «угрожающая» живая цель рядом, иначе ближайший игрок в радиусе агрессии. */
  private pickTarget(m: Mob): Player | null {
    if (m.tauntUntil > this.time) {
      const tp = this.players.get(m.tauntBy);
      if (tp && !tp.dead) return tp;
    }
    let best: Player | null = null, bt = -1;
    // скрытный игрок невидим для мобов, если не вплотную
    const unseen = (p: Player) => p.stealthUntil > this.time && this.dist(p, m) > m.def.radius + PLAYER_RADIUS + 30;
    for (const [pid, th] of m.threat) {
      const p = this.players.get(pid);
      if (!p || p.dead || unseen(p) || this.dist(p, m.home) > m.def.aggro * 3 + 300) continue;
      if (th > bt) { bt = th; best = p; }
    }
    if (best) return best;
    let bd = m.def.boss ? m.def.aggro : m.def.aggro * AGGRO_MUL;
    for (const p of this.players.values()) {
      if (p.dead || unseen(p) || this.inTown(p.x, p.y)) continue;
      const d = this.dist(p, m);
      if (d < bd && lineClear(this.map, m.x, m.y, p.x, p.y)) { bd = d; best = p; }
    }
    return best;
  }

  /** Питомец с наибольшей угрозой у моба (угроза хранится по id юнита питомца). */
  private threatPet(m: Mob): Pet | null {
    let best: Pet | null = null, bt = 0;
    for (const [id, th] of m.threat) {
      const pet = this.pets.get(id);
      if (pet && !pet.dead && th > bt && this.dist(pet, m.home) < m.def.aggro * 3 + 300) { bt = th; best = pet; }
    }
    return best;
  }
  /** Угроза питомца для моба: боссы почти не замечают питомцев (data/balance.json bosses.petThreat) — призывом босса не затанковать. */
  private petThreat(m: Mob, pet: Pet): number {
    return (m.threat.get(pet.id) || 0) * (m.def.boss ? BAL.bosses.petThreat : 1);
  }

  private announceElite(m: Mob) {
    const r = ELITE.announceTiles * 32;
    for (const p of this.players.values()) if (this.dist(p, m) < r) p.send("toast", { text: T("srv.World.188", { name: m.unit.name }), kind: "loot" });
  }

  updateMob(m: Mob, dt: number) {
    if (m.soldier) return this.soldiers?.step(m, dt); // боец фракции — своё поведение (soldiers.ts)
    if (m.siege) return; // ворота и осадные машины ведёт siege.ts
    const u = m.unit;
    const t = this.time;
    if (m.dead) {
      if (!m.summoned && t >= m.respawnAt) {
        if (m.def.boss) m.reset();
        else {
          m.rollElite();
          if (m.elite) this.announceElite(m);
        }
        this.emit({ t: "spawn", id: m.id, k: m.def.boss ? "smoke" : "smoke" });
      }
      return;
    }
    tickEffects(this, m);
    let b = 0;
    if (m.slowUntil > t) b |= BUFF_SLOW;
    if (m.stunUntil > t) b |= BUFF_STUN;
    if (m.rootUntil > t) b |= BUFF_ROOT;
    if (m.curseUntil > t) b |= BUFF_CURSE;
    if (m.bleedUntil > t) b |= BUFF_BLEED;
    if (m.silenceUntil > t) b |= BUFF_SILENCE;
    if (m.fearUntil > t) b |= BUFF_FEAR;
    u.buffs = (u.buffs & 0x20) | b;
    const sp = m.slowUntil > t ? Math.round(slowPctCap(m.slowPct)) : 0;
    if (u.slowPct !== sp) u.slowPct = sp;

    if (m.boss) m.boss.update(dt);
    if (m.stunUntil > t) {
      if (u.anim === Anim.Walk) u.anim = Anim.Idle;
      return;
    }
    if (m.fearUntil > t && m.state !== "return") {
      // страх: бег прочь от источника (data/cc.json fear), без атак; корни держат на месте
      let moved = false;
      if (m.rootUntil <= t) {
        const fd = fearDir(this, m);
        moved = this.moveMob(m, u.x + fd.x * 60, u.y + fd.y * 60, dt, this.mobSpeed(m) * CC.fear.speedMul);
      }
      u.anim = moved ? Anim.Walk : u.anim === Anim.Walk ? Anim.Idle : u.anim;
      return;
    }
    const canMove = m.rootUntil <= t && m.windUntil <= t && !(m.boss && (m.boss as { casting?: boolean }).casting);
    let moving = false;
    if (m.ai.heal && m.state !== "return") this.mobHeal(m);

    if (m.state === "return") {
      // домой идёт ногами, а не переносится: застрял (нет хода 1,5 с) — путь заново и обход вбок; перенос — только после returnGiveUpMs без хода
      if (m.retSince < 0) this.beginReturn(m);
      const det = m.detour && t < m.detourUntil ? m.detour : null;
      const gx = det ? det.x : m.home.x, gy = det ? det.y : m.home.y;
      moving = this.moveMob(m, gx, gy, dt, m.def.speed * 1.6);
      // мировой босс (задача 151, holdHp): идёт домой без лечения и без сброса — здоровье сбрасывает директор при пустом круге
      const hold = !!(m.boss as { holdHp?: boolean } | null)?.holdHp;
      if (!hold) u.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp * 0.05 * dt * 10));
      const dh = this.dist(u, m.home);
      if (dh < 6 && hold) { m.state = "idle"; m.retSince = -1; m.detour = null; }
      else if (dh < 6) m.reset();
      else if (det && (!moving || Math.hypot(det.x - u.x, det.y - u.y) < 6)) m.detour = null;
      else if (dh < m.retBest - 6) { m.retBest = dh; m.retAt = t; }
      else if (t - m.retAt > 1500) {
        if (t - m.retSince > World.RETURN_GIVEUP_MS) { if (hold) { u.x = m.home.x; u.y = m.home.y; m.state = "idle"; m.retSince = -1; } else m.reset(); }
        else { m.nav.reset(); this.mobDetour(m); m.retAt = t; m.retBest = dh; }
      }
    } else {
      const target = this.pickTarget(m);
      const pet = this.threatPet(m);
      if (pet && (!target || this.petThreat(m, pet) > (m.threat.get(target.id) || 0))) {
        m.state = "chase";
        m.targetId = pet.id;
        u.target = pet.id;
        if (this.dist(u, m.home) > (m.def.boss ? GP.mobs.leashBossMul : GP.mobs.leashMul) * m.def.aggro + GP.mobs.leashExtra) {
          m.state = "return";
          this.beginReturn(m);
          m.targetId = null;
          u.target = "";
          m.threat.clear();
        } else {
          const reach = m.def.range + pet.def.radius;
          const clear = lineClear(this.map, u.x, u.y, pet.x, pet.y);
          const d = this.dist(u, pet);
          if ((d > reach || !clear) && canMove) moving = this.moveMob(m, pet.x, pet.y, dt, this.mobSpeed(m), m.def.projectile ? reach * 0.8 : reach - 6);
          else if (d <= reach + 4 && clear && t >= m.attackAt) mobAttackPet(this, m, pet);
        }
      } else if (target) {
        m.state = "chase";
        m.targetId = target.id;
        u.target = target.id;
        const leash = (m.def.boss ? GP.mobs.leashBossMul : GP.mobs.leashMul) * m.def.aggro + GP.mobs.leashExtra;
        if (this.dist(u, m.home) > leash) {
          m.state = "return";
          this.beginReturn(m);
          m.targetId = null;
          u.target = "";
          m.threat.clear();
        } else {
          const d = this.dist(u, target);
          const reach = m.def.range + PLAYER_RADIUS;
          const clear = lineClear(this.map, u.x, u.y, target.x, target.y);
          const kite = m.ai.kite;
          let kited = false;
          if (kite && d < kite.min && canMove) {
            // стрелок/шаман отступает от героя, продолжая стрелять
            const k = d || 1;
            moving = kited = this.moveMob(m, u.x + ((u.x - target.x) / k) * 80, u.y + ((u.y - target.y) / k) * 80, dt, this.mobSpeed(m) * 0.9);
          }
          if (kited) {
            if (d <= reach + 4 && clear && t >= m.attackAt) this.mobAttack(m, target);
          } else if (m.ai.slam && m.windUntil <= t && t >= m.slamAt && d <= m.ai.slam.r + PLAYER_RADIUS + 20 && clear) this.mobSlam(m, target);
          else if ((d > reach || !clear) && canMove) moving = this.moveMob(m, target.x, target.y, dt, this.mobSpeed(m), m.def.projectile ? reach * 0.8 : reach - 6);
          else if (d <= reach + 4 && clear && t >= m.attackAt && m.windUntil <= t) this.mobAttack(m, target);
          if (!moving && canMove) this.nudgeMob(m, dt, target.x, target.y);
          // бросок по цели вне ближнего боя (data/mobAI.json throw): кайт не спасает от урона босса
          if (m.ai.throw && d > reach + 4 && d <= m.ai.throw.range && clear && t >= m.attackAt && m.windUntil <= t && m.silenceUntil <= t && !(m.boss && (m.boss as { casting?: boolean }).casting)) this.mobThrow(m, target);
          if (!moving && d > reach && m.def.projectile && canMove) moving = this.moveMob(m, target.x, target.y, dt, this.mobSpeed(m), 20);
        }
      } else if (m.state === "chase") {
        m.state = "return";
        this.beginReturn(m);
        m.targetId = null;
        u.target = "";
      } else {
        // бродит возле точки появления
        if (t >= m.wanderAt) {
          m.wanderAt = t + rnd(2500, 6500);
          const a = Math.random() * Math.PI * 2, r = Math.random() * 56;
          m.wanderTo = Math.random() < 0.6 ? { x: m.home.x + Math.cos(a) * r, y: m.home.y + Math.sin(a) * r } : null;
        }
        if (m.wanderTo && canMove) {
          moving = this.moveMob(m, m.wanderTo.x, m.wanderTo.y, dt, this.mobSpeed(m) * 0.4);
          if (!moving) m.wanderTo = null;
        }
      }
    }
    if (moving) u.anim = Anim.Walk;
    else if (u.anim === Anim.Walk) u.anim = Anim.Idle;
  }

  /** Крайний случай возврата: столько мс без хода к дому — перенос домой (дом недостижим). */
  static RETURN_GIVEUP_MS = 20000;
  private beginReturn(m: Mob) {
    m.retSince = m.retAt = this.time;
    m.retBest = this.dist(m.unit, m.home);
    m.detour = null;
  }
  /** Обход препятствия по дороге домой: проходимая точка вбок (влево или вправо от направления к дому) в 2–3 клетках. */
  private mobDetour(m: Mob) {
    const u = m.unit, r = World.crowdR(m);
    const dx = m.home.x - u.x, dy = m.home.y - u.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d, side = Math.random() < 0.5 ? 1 : -1;
    for (const k of [side, -side]) for (const far of [80, 56, 104]) for (const fwd of [0.5, 0, -0.5]) {
      const x = u.x + (-uy * k + ux * fwd) * far, y = u.y + (ux * k + uy * fwd) * far;
      if (walkable(this.map, x, y, r) && !this.inTown(x, y) && segmentWalkable(this.map, u.x, u.y, x, y, r)) {
        m.detour = { x, y };
        m.detourUntil = this.time + 2500;
        return;
      }
    }
    m.detour = null;
  }

  /** Шаман лечит самого раненого союзника в бою (снаряд света), не прерывая движения. */
  private mobHeal(m: Mob) {
    const h = m.ai.heal!;
    if (this.time < m.healAt || m.stunUntil > this.time || m.silenceUntil > this.time || m.fearUntil > this.time) return;
    let best: Mob | null = null, bf = 0.75;
    for (const a of this.mobs.values()) {
      if (a === m || a.dead || a.def.boss || a.faction || a.state === "return") continue;
      const f = a.unit.hp / a.unit.maxHp;
      if (f >= bf || this.dist(a, m) > h.range || !lineClear(this.map, m.x, m.y, a.x, a.y)) continue;
      if (a.state !== "chase" && this.time - a.lastHitAt > GP.mobs.healerRecentHitMs) continue;
      bf = f; best = a;
    }
    if (!best) return;
    const ally = best;
    m.healAt = this.time + h.cd * 1000;
    const ms = (this.dist(m, ally) / 400) * 1000;
    m.unit.dir = World.dirTo(ally.x - m.x, ally.y - m.y);
    this.emit({ t: "proj", k: "holy", from: m.id, to: ally.id, tx: ally.x, ty: ally.y, ms });
    this.later(ms, () => {
      if (m.dead || ally.dead) return;
      const hp0 = ally.unit.hp;
      ally.unit.hp = Math.min(ally.unit.maxHp, ally.unit.hp + Math.round(ally.unit.maxHp * h.pct));
      if (ally.unit.hp > hp0) this.emit({ t: "dmg", id: ally.id, v: ally.unit.hp - hp0, heal: true });
      this.emit({ t: "buff", id: ally.id, k: "heal", ms: 600 });
    });
  }

  /** Тяжёлый удар по площади: замах с красным кругом; оглушение во время замаха срывает удар. */
  private mobSlam(m: Mob, target: Player) {
    const s = m.ai.slam!;
    m.slamAt = this.time + s.cd * 1000;
    m.windUntil = this.time + s.ms;
    m.attackAt = Math.max(m.attackAt, this.time + s.ms + 400);
    m.unit.dir = World.dirTo(target.x - m.x, target.y - m.y);
    m.unit.aseq = (m.unit.aseq + 1) % 65535;
    const kind = (["phys", "fire", "frost", "poison", "arcane", "shadow", "nature", "holy"].includes(s.k) ? s.k : "phys") as FxKind;
    const t0 = this.time;
    // оглушение или страх во время замаха (effects.interruptCast ставит ccAt) срывают удар
    this.telegraph(m, "circle", m.x, m.y, s.r, s.ms, (p) => { if (m.stunUntil <= this.time && m.ccAt < t0) this.hit(m, p, { kind, mult: s.mult }); }, { k: kind });
  }

  /** Бросок снаряда (data/mobAI.json throw): mult урона удара, тип k. */
  mobThrow(m: Mob, target: Player) {
    const tw = m.ai.throw!, u = m.unit;
    m.attackAt = this.time + m.def.attackCd * 1000 * (u.buffs & 0x20 ? 0.7 : 1);
    u.dir = World.dirTo(target.x - u.x, target.y - u.y);
    u.aseq = (u.aseq + 1) % 65535;
    const kind = (["phys", "fire", "frost", "poison", "arcane", "shadow", "nature", "holy"].includes(tw.k) ? tw.k : "phys") as FxKind;
    const ms = (this.dist(u, target) / 300) * 1000;
    this.emit({ t: "proj", k: kind === "fire" ? "fire" : kind === "nature" ? "poison" : "shadow", from: m.id, to: target.id, tx: target.x, ty: target.y, ms });
    this.later(ms, () => {
      if (m.dead || target.dead || !lineClear(this.map, m.x, m.y, target.x, target.y)) return;
      this.hit(m, target, { kind, mult: tw.mult });
    });
  }

  mobAttack(m: Mob, target: Player, mult = 1) {
    const u = m.unit;
    m.attackAt = this.time + m.def.attackCd * 1000 * (u.buffs & 0x20 ? 0.7 : 1);
    u.dir = World.dirTo(target.x - u.x, target.y - u.y);
    u.aseq = (u.aseq + 1) % 65535;
    if (m.def.projectile) {
      const ms = (this.dist(u, target) / 300) * 1000;
      this.emit({ t: "proj", k: m.def.projectile, from: m.id, to: target.id, tx: target.x, ty: target.y, ms });
      const kind: FxKind = m.def.projectile === "poison" ? "poison" : m.def.projectile === "fire" ? "fire" : m.def.projectile === "arrow" ? "phys" : m.def.projectile === "arcane" ? "arcane" : "shadow";
      this.later(ms, () => {
        if (m.dead || target.dead || !lineClear(this.map, m.x, m.y, target.x, target.y)) return;
        this.hit(m, target, { kind, mult });
        if (kind === "poison") target.poisonUntil = this.time + 2000;
        if (kind === "fire") target.burnUntil = this.time + 1500;
      });
    } else {
      this.later(220, () => {
        if (m.dead || target.dead || this.dist(m, target) > m.def.range + PLAYER_RADIUS + 24 || !lineClear(this.map, m.x, m.y, target.x, target.y)) return;
        this.hit(m, target, { kind: "phys", mult });
      });
    }
  }

  // ---------- зоны урона ----------
  addHazard(owner: Mob, x: number, y: number, r: number, ms: number, dps: number, kind: FxKind) {
    const id = this.uid("h");
    this.hazards.push({ id, x, y, r, until: this.time + ms, dps, kind, owner, tickAt: this.time + 400 });
    this.emit({ t: "hazard", id, k: kind, x, y, r, ms });
  }
  private updateHazards() {
    if (!this.hazards.length) return;
    this.hazards = this.hazards.filter((h) => h.until > this.time && !h.owner.dead);
    for (const h of this.hazards) {
      if (this.time < h.tickAt) continue;
      h.tickAt = this.time + 500;
      for (const p of this.playersInCircle(h.x, h.y, h.r)) {
        this.hit(h.owner, p, { flat: h.dps * 0.5, kind: h.kind });
        if (h.kind === "poison") p.poisonUntil = this.time + 1200;
      }
    }
  }

  /** Отложенный удар по площади после телеграфа (боссы). */
  telegraph(owner: Mob, shape: "circle" | "cone" | "ring", x: number, y: number, r: number, ms: number, onHit: (p: Player) => void, extra: { r2?: number; a?: number; w?: number; k?: FxKind } = {}) {
    this.emit({ t: "tele", shape, k: extra.k ?? "fire", x, y, r, r2: extra.r2, a: extra.a, w: extra.w, ms });
    this.later(ms, () => {
      if (owner.dead) return;
      for (const p of this.players.values()) {
        if (p.dead) continue;
        const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
        let inside = false;
        if (shape === "circle") inside = d <= r + PLAYER_RADIUS * 0.5;
        else if (shape === "ring") inside = d >= r && d <= (extra.r2 ?? r * 2);
        else {
          let da = Math.atan2(dy, dx) - (extra.a ?? 0);
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          inside = d <= r && Math.abs(da) <= (extra.w ?? 1) / 2;
        }
        if (inside && lineClear(this.map, x, y, p.x, p.y)) onHit(p);
      }
    });
  }
}
