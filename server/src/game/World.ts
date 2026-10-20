/** Игровой мир: вся симуляция на сервере. Комната Colyseus только передаёт сюда сообщения. */
import { MAP_SEED, PLAYER_RADIUS, PLAYER_SPEED, RESPAWN_DELAY_MS, TICK_MS } from "../../../shared/constants";
import { armorReduction } from "../../../shared/formulas";
import { BAL, leechMult, pvpClassMult, pvpDamageMult, pvpHealMult } from "../../../shared/balance";
import { PLUS_BONUS } from "../../../shared/upgrade";
import { generateMap, lineClear, moveWithCollision, terrainSpeedMul, isTownZone, zoneAtPx, Zone, type WorldMap } from "../../../shared/map";
import { tickBiomes } from "./biomes";
import { tickCities } from "./cities";
import { nearestCity } from "../../../shared/cities";
import { ELITE } from "../../../shared/elites";
import { SKILLS } from "../../../shared/skills";
import { CLASSES } from "../../../shared/classes";
import { factionsHostile, inEnemyCapital, OUTLAW, pvpPlace, scramble } from "../../../shared/factions";
import { MOBS } from "../../../shared/mobs";
import { MOUNTS, MOUNT_CAST_MS } from "../../../shared/mounts";
import {
  Anim, BUFF_BLEED, BUFF_BURN, BUFF_CURSE, BUFF_HASTE, BUFF_POISON, BUFF_ROOT, BUFF_SLOW, BUFF_STEALTH, BUFF_STUN, BUFF_WARCRY, Dir,
  type ChatLine, type Fx, type FxKind,
} from "../../../shared/protocol";
import type { WorldState } from "../rooms/schema";
import { createBoss } from "./bosses";
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
import { grantPets, mobAttackPet, tickPetCast, updatePet, dismissPet, type Pet } from "./Pet";
import { applySlow, tickEffects } from "./effects";
import type { Player } from "./Player";

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
}

export class World {
  readonly map: WorldMap;
  /** PvP включено: игроки разных команд (team) враждебны. Включает арена на время боя. */
  pvpActive = false;
  onDamage?: (src: Actor, dst: Actor, v: number) => void;
  onHeal?: (p: Player, v: number) => void;
  onPlayerKilled?: (p: Player, killer?: Actor) => void;
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
  hazards: { id: string; x: number; y: number; r: number; until: number; dps: number; kind: FxKind; owner: Mob; tickAt: number }[] = [];

  constructor(
    readonly state: WorldState,
    readonly broadcast: Broadcast,
    readonly opts: WorldOptions = {},
  ) {
    this.map = opts.map ?? generateMap(MAP_SEED);
    if (opts.mobs !== false) this.spawnAll();
    if (opts.mobs !== false && !opts.map) this.town = new Townfolk(this);
  }

  // ---------- инфраструктура ----------
  emit(fx: Fx) {
    this.fx.push(fx);
  }
  /**
   * Отложенный вызов через ms. owner — чей это таймер (умение героя): вызов пропускается, если к сроку владелец
   * погиб (даже если уже возродился) или ушёл из этого мира. Без owner вызывается всегда (уборка, конец эффекта).
   */
  later(ms: number, fn: () => void, owner?: Actor) {
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

  addPlayer(p: Player, note = `${p.name} входит в мир.`) {
    this.players.set(p.id, p);
    this.state.players.set(p.id, p.unit);
    if (this.opts.mobs !== false) this.later(2500, () => grantPets(this, p));
    if (!this.opts.quiet) this.system(note);
  }
  removePlayer(id: string, note?: string) {
    const p = this.players.get(id);
    if (!p) return;
    dismissPet(this, p);
    this.players.delete(id);
    this.state.players.delete(id);
    for (const m of this.mobs.values()) {
      m.threat.delete(id);
      if (m.targetId === id) m.targetId = null;
    }
    if (!this.opts.quiet) this.system(note ?? `${p.name} покидает мир.`);
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
    if (pa !== pb) return true;
    if (!pa || !pb) return false;
    if (this.pvpActive || this.opts.mobs === false) return this.pvpActive && a.team !== 0 && b.team !== 0 && a.team !== b.team;
    if (a.team !== 0 || b.team !== 0) return false;
    return factionsHostile(this.map, a.faction, a.x, a.y, b.faction, b.x, b.y);
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
      p.send("toast", { text: "В нейтральном городе сражаться нельзя! Стража атакует нарушителя", kind: "error" });
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
    return this.isPlayer(a) && (tanks.immune(this, a) || rogues.immune(this, a));
  }
  /** Актёр выбыл: мёртв или (герой) уже не в этом мире — проверка для таймеров умений. */
  gone(a: Actor): boolean {
    return this.isDead(a) || this.absent(a);
  }
  /** Живые враги в круге, которых src может задеть (canAffect): мобы и враждебные игроки. */
  enemiesInCircle(src: Actor, x: number, y: number, r: number): Actor[] {
    if (this.absent(src)) return [];
    const out: Actor[] = this.mobsInCircle(x, y, r);
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
      m.boss = createBoss(this, m, b.arena);
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
    for (const m of this.mobs.values()) if (this.awake(m)) this.updateMob(m, dt);
    for (const pet of [...this.pets.values()]) updatePet(this, pet, dt);
    this.town?.update(dt);
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
  private awake(m: Mob): boolean {
    if (m.def.boss || m.summoned || m.state !== "idle" || m.threat.size) return true;
    const C = World.AWAKE_CHUNK;
    return this.awakeChunks.has(Math.floor(m.home.y / C) * 4096 + Math.floor(m.home.x / C));
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
    if (this.fx.length) {
      this.broadcast("fx", this.fx);
      this.fx = [];
    }
    for (const p of this.players.values()) {
      if (p.selfDirty) {
        p.selfDirty = false;
        p.send("self", p.selfState());
      }
      if (p.bagsDirty) {
        p.bagsDirty = false;
        p.send("loot", [...p.bags.values()]);
      }
    }
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
    // нейтральный город: герой не может ранить героя (кроме отпора нарушителю); попытка — нарушение
    if (this.townSafe(src, dst)) {
      if (!o.noProc) this.markOutlaw(src as Player);
      return MISS;
    }
    if (this.isPlayer(src) && !o.noBreak) { rogues.onBreak(this, src); src.stealthUntil = 0; }
    // полная неуязвимость цели — промах: ни урона, ни контроля (щит, блок и частичное снижение — попадание)
    if (this.isPlayer(dst) && this.isImmune(dst)) {
      dst.combatAt = this.time;
      if (this.isPlayer(src)) src.combatAt = this.time;
      this.emit({ t: "dmg", id: dst.id, v: 0, imm: true });
      return MISS;
    }
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
    amount *= 1 - armorReduction(armor, level);
    if (!this.isPlayer(dst)) amount *= dst.ai.weak?.dmg?.[o.kind ?? "phys"] ?? 1;
    // PvP (BALANCE.md «PvP»): устойчивость по уровню цели, бонус заточки оружия атакующего — долей plusShare. Сразу после брони:
    // поглощения ресурсом («Мановая броня»), щиты и лечение от заблокированного считаются в единицах здоровья, а урон героя растёт как L².
    const pvpHit = this.isPlayer(src) && this.isPlayer(dst) && src !== dst;
    let pvpK = 1;
    if (pvpHit) {
      dst.pvpAt = this.time;
      const wp = src.save.equip.weapon?.plus || 0;
      pvpK = (pvpDamageMult(dst.level) * pvpClassMult(src.cls, dst.cls) * (1 + PLUS_BONUS * wp * BAL.pvp.plusShare)) / (1 + PLUS_BONUS * wp);
      amount *= pvpK;
    }
    let reflect = 0;
    if (this.isPlayer(dst)) {
      amount *= dst.derived.dmgTaken;
      const ls = dst.save.skills.laststand || 0;
      if (ls && dst.unit.hp < dst.unit.maxHp * 0.3 && this.time >= dst.lastStandReady) {
        const v = SKILLS.laststand.v(ls);
        dst.lastStandUntil = this.time + v.dur * 1000;
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
    amount = legendary.absorb(this, dst, amount);
    if (this.isPlayer(dst) && dst.shieldAmt > 0) {
      if (dst.shieldUntil > this.time) {
        const ab = Math.min(dst.shieldAmt, amount);
        dst.shieldAmt -= ab;
        amount -= ab;
        if (dst.shieldBy) this.onHeal?.(dst.shieldBy, Math.round(ab));
        healers.onAbsorb(this, dst.shieldBy, dst, ab, src);
        mages.onAbsorb(this, dst, ab);
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
    if (this.pvpActive || this.time - p.pvpAt < BAL.pvp.healWindowMs) v = Math.max(1, Math.round(v * pvpHealMult(p.level)));
    const before = p.unit.hp;
    p.unit.hp = Math.min(p.unit.maxHp, p.unit.hp + v);
    const got = p.unit.hp - before;
    if (got > 0) this.onHeal?.(by ?? p, got);
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
    const respawn = m.def.respawn ? m.def.respawn * 1000 : rnd(14000, 24000);
    m.respawnAt = this.time + respawn;
    m.boss?.onDeath();
    if (m.boss) this.bossKills.set(m.def.id, { by: killer && this.isPlayer(killer) ? killer.name : "неизвестный герой", at: this.time });
    if (killer && this.isPlayer(killer)) { legendary.onKill(this, killer, m); tanks.onKill(this, killer, m); healers.onKill(this, killer, m); mages.onKill(this, killer, m); archers.onKill(this, killer, m); rogues.onKill(this, killer, m); }
    grantKillRewards(this, m, killer && this.isPlayer(killer) ? killer : undefined);
    if (m.summoned) this.later(2500, () => this.removeMob(m));
  }

  killPlayer(p: Player, killer?: Actor) {
    this.breakMount(p);
    p.petCast = null;
    p.dead = true;
    p.shieldAmt = 0;
    p.bondUntil = p.boneUntil = p.frenzyUntil = p.curseUntil = p.bleedUntil = 0;
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
    p.send("toast", { text: "Вы погибли", kind: "error" });
    this.onPlayerKilled?.(p, killer);
  }

  respawn(p: Player) {
    if (!p.dead || this.time - p.deadAt < RESPAWN_DELAY_MS) return;
    const lost = Math.floor(p.save.gold * 0.1);
    p.save.gold -= lost;
    p.dead = false;
    // возрождение в ближайшем открытом городе своей фракции: своя столица всегда, чужая — никогда (на арене — у фонтана)
    const sp = this.opts.mobs === false ? this.map.playerSpawn : nearestCity(p.save.cities, p.x, p.y, p.faction).spawn;
    p.unit.x = sp.x;
    p.unit.y = sp.y;
    p.unit.hp = p.unit.maxHp;
    p.unit.mp = p.unit.maxMp;
    p.unit.anim = Anim.Idle;
    p.stunUntil = p.rootUntil = p.slowUntil = 0;
    p.selfDirty = true;
    if (lost) p.send("toast", { text: `Потеряно ${lost} золота`, kind: "error" });
  }

  // ---------- маунты ----------
  /** Снимает маунт и отменяет призыв (атака, умение, урон). */
  breakMount(p: Player) {
    if (p.tele) {
      p.tele = null;
      this.emit({ t: "tp", id: p.id, ph: "cancel", x: p.x, y: p.y });
      p.send("mountcast", { ms: 0 });
      p.send("toast", { text: "Телепорт прерван", kind: "error" });
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
    if (this.opts.mobs === false || p.team !== 0) return err("На арене маунты недоступны");
    const m = MOUNTS[p.save.mount ?? ""];
    if (!m || !p.save.mounts?.includes(m.id)) return err("У вас нет маунта (конь с 10 уровня)");
    if (p.level < m.level) return err(`${m.name}: нужен ${m.level} уровень`);
    if (p.inCombat(this.time)) return err("Нельзя призвать маунта в бою");
    if (p.stunUntil > this.time || p.frozenUntil > this.time) return;
    p.input = { mx: 0, my: 0 };
    p.moveTo = null;
    p.mountCast = { until: this.time + MOUNT_CAST_MS, x: p.x, y: p.y };
    p.send("mountcast", { ms: MOUNT_CAST_MS, name: m.name });
  }

  // ---------- игроки ----------
  playerSpeed(p: Player): number {
    let s = PLAYER_SPEED * (MOUNTS[p.unit.mount]?.speed ?? 1);
    if (p.slowUntil > this.time) s *= 1 - p.slowPct / 100;
    if (p.stealthUntil > this.time) s *= 0.7;
    return s * terrainSpeedMul(this.map, p.unit.x, p.unit.y);
  }

  private stepToward(p: Player, gx: number, gy: number, dt: number, stopAt: number): boolean {
    const u = p.unit;
    const gd = Math.hypot(gx - u.x, gy - u.y);
    if (gd <= stopAt + 0.5) return false;
    const wp = p.nav.next(this.map, u.x, u.y, gx, gy, PLAYER_RADIUS, this.time);
    if (!wp) return false;
    const final = wp.x === gx && wp.y === gy;
    const tx = wp.x, ty = wp.y;
    const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(this.playerSpeed(p) * dt, final ? d - stopAt : d);
    const n = moveWithCollision(this.map, u.x, u.y, (dx / d) * sp, (dy / d) * sp, PLAYER_RADIUS);
    // сравниваем уже округлённые координаты: иначе добавка <0,05 px давала «движение» вечно
    const rx = Math.round(n.x * 10) / 10, ry = Math.round(n.y * 10) / 10;
    const moved = rx !== u.x || ry !== u.y;
    u.x = rx;
    u.y = ry;
    u.dir = World.dirTo(dx, dy);
    return moved;
  }

  updatePlayer(p: Player, dt: number) {
    const u = p.unit;
    if (p.dead) return;
    const t = this.time;
    tickEffects(this, p);
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
    u.buffs = b;
    // чужак во вражеской столице: стража бьёт, пока он там (метка нарушителя видна всем)
    const intruder = this.opts.mobs !== false && p.team === 0 && !p.dead && inEnemyCapital(p.faction, u.x, u.y);
    if (intruder !== p.intruder) {
      p.intruder = intruder;
      if (intruder) {
        p.guardHitAt = t + 600;
        p.send("toast", { text: "Вы во вражеской столице! Стража атакует чужака", kind: "error" });
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
        this.town?.punish(p, this.guardDamage(p));
      }
    }

    p.checkFood();
    const cb = p.inCombat(t);
    if (cb !== p.combatSent) { p.combatSent = cb; p.send("combat", { on: cb }); }
    tickPetCast(this, p);
    if (p.mountCast) {
      if (Math.hypot(u.x - p.mountCast.x, u.y - p.mountCast.y) > 0.5 || p.input.mx || p.input.my || p.moveTo || p.stunUntil > t) this.breakMount(p);
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
    if (p.regenAcc >= 1) { const w = Math.floor(p.regenAcc); p.regenAcc -= w; u.hp = Math.min(u.maxHp, u.hp + w); }
    if (p.manaAcc >= 1) { const w = Math.floor(p.manaAcc); p.manaAcc -= w; u.mp = Math.min(u.maxMp, u.mp + w); }

    const frozen = p.frozenUntil > t;
    const canMove = !frozen && p.stunUntil <= t && p.rootUntil <= t && p.castUntil <= t;
    const target = p.targetId ? this.actor(p.targetId) : undefined;
    const foe = !!target && this.hostile(p, target);
    if (p.targetId && (!target || this.isDead(target) || (foe ? this.stealthed(target) : !this.isPlayer(target)) || this.dist(u, target) > 900)) {
      p.targetId = null;
      u.target = "";
    }
    if (!p.targetId || !foe) p.engaged = p.approach = false;
    let moving = false;
    if (canMove) {
      if (p.input.mx || p.input.my) {
        const len = Math.hypot(p.input.mx, p.input.my);
        const sp = this.playerSpeed(p) * dt;
        const n = moveWithCollision(this.map, u.x, u.y, (p.input.mx / len) * sp, (p.input.my / len) * sp, PLAYER_RADIUS);
        moving = n.x !== u.x || n.y !== u.y;
        u.x = Math.round(n.x * 10) / 10;
        u.y = Math.round(n.y * 10) / 10;
        u.dir = World.dirTo(p.input.mx, p.input.my);
        p.moveTo = null;
        if (!p.chase) p.approach = false;
      } else if (p.moveTo) {
        moving = this.stepToward(p, p.moveTo.x, p.moveTo.y, dt, 2);
        if (!moving) p.moveTo = null;
      } else if (p.targetId && foe && p.engaged && p.approach) {
        const range = p.attackRange() + this.radiusOf(target);
        const d2 = this.dist(u, target);
        if (d2 > range || (p.ranged() && !lineClear(this.map, u.x, u.y, target.x, target.y))) moving = this.stepToward(p, target.x, target.y, dt, Math.min(range - 4, d2));
      }
    }
    // автоатака
    if (p.targetId && target && foe && p.engaged && !this.isDead(target) && !frozen && p.stunUntil <= t && t >= p.attackAt && !(p.input.mx || p.input.my) && !p.moveTo) {
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
    p.attackAt = this.time + (p.derived.attackCd * 1000) / haste;
    p.combatAt = this.time;
    u.dir = World.dirTo(target.x - u.x, target.y - u.y);
    u.aseq = (u.aseq + 1) % 65535;
    const cls = p.cls, atk = CLASSES[cls].attack;
    if (atk.melee) {
      this.later(140, () => {
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
    if (m.slowUntil > this.time) s *= 1 - m.slowPct / 100;
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
    const sp = Math.min(speed * dt, final ? d - stopAt : d);
    const n = moveWithCollision(this.map, u.x, u.y, (dx / d) * sp, (dy / d) * sp, r);
    if (this.inTown(n.x, n.y)) return false;
    const moved = Math.abs(n.x - u.x) + Math.abs(n.y - u.y) > 0.01;
    u.x = Math.round(n.x * 10) / 10;
    u.y = Math.round(n.y * 10) / 10;
    u.dir = World.dirTo(dx, dy);
    return moved;
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
    let bd = m.def.aggro;
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
    for (const p of this.players.values()) if (this.dist(p, m) < r) p.send("toast", { text: `Рядом появился элитный моб: ${m.unit.name}`, kind: "loot" });
  }

  updateMob(m: Mob, dt: number) {
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
    u.buffs = (u.buffs & 0x20) | b;

    if (m.boss) m.boss.update(dt);
    this.applyWeakCc(m);
    if (m.stunUntil > t) {
      if (u.anim === Anim.Walk) u.anim = Anim.Idle;
      return;
    }
    const canMove = m.rootUntil <= t && m.windUntil <= t && !(m.boss && (m.boss as { casting?: boolean }).casting);
    let moving = false;
    if (m.ai.heal && m.state !== "return") this.mobHeal(m);

    if (m.state === "return") {
      moving = this.moveMob(m, m.home.x, m.home.y, dt, m.def.speed * 1.6);
      u.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp * 0.05 * dt * 10));
      if (!moving || this.dist(u, m.home) < 4) {
        m.reset();
      }
    } else {
      const target = this.pickTarget(m);
      const pet = this.threatPet(m);
      if (pet && (!target || this.petThreat(m, pet) > (m.threat.get(target.id) || 0))) {
        m.state = "chase";
        m.targetId = pet.id;
        u.target = pet.id;
        if (this.dist(u, m.home) > (m.def.boss ? 1.4 : 2.5) * m.def.aggro + 260) {
          m.state = "return";
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
        const leash = (m.def.boss ? 1.4 : 2.5) * m.def.aggro + 260;
        if (this.dist(u, m.home) > leash) {
          m.state = "return";
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
          // бросок по цели вне ближнего боя (data/mobAI.json throw): кайт не спасает от урона босса
          if (m.ai.throw && d > reach + 4 && d <= m.ai.throw.range && clear && t >= m.attackAt && m.windUntil <= t && !(m.boss && (m.boss as { casting?: boolean }).casting)) this.mobThrow(m, target);
          if (!moving && d > reach && m.def.projectile && canMove) moving = this.moveMob(m, target.x, target.y, dt, this.mobSpeed(m), 20);
        }
      } else if (m.state === "chase") {
        m.state = "return";
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

  /** Слабость к контролю: оглушение/замедление/корни длятся дольше (или короче) по data/mobAI.json. */
  private applyWeakCc(m: Mob) {
    const cc = m.ai.weak?.cc, t = this.time, s = m.seenCc;
    if (cc) {
      if (cc.stun && m.stunUntil > s.stun) m.stunUntil = t + (m.stunUntil - t) * cc.stun;
      if (cc.slow && m.slowUntil > s.slow) m.slowUntil = t + (m.slowUntil - t) * cc.slow;
      if (cc.root && m.rootUntil > s.root) m.rootUntil = t + (m.rootUntil - t) * cc.root;
    }
    s.stun = m.stunUntil; s.slow = m.slowUntil; s.root = m.rootUntil;
  }

  /** Шаман лечит самого раненого союзника в бою (снаряд света), не прерывая движения. */
  private mobHeal(m: Mob) {
    const h = m.ai.heal!;
    if (this.time < m.healAt || m.stunUntil > this.time) return;
    let best: Mob | null = null, bf = 0.75;
    for (const a of this.mobs.values()) {
      if (a === m || a.dead || a.def.boss || a.state === "return") continue;
      const f = a.unit.hp / a.unit.maxHp;
      if (f >= bf || this.dist(a, m) > h.range || !lineClear(this.map, m.x, m.y, a.x, a.y)) continue;
      if (a.state !== "chase" && this.time - a.lastHitAt > 8000) continue;
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
      ally.unit.hp = Math.min(ally.unit.maxHp, ally.unit.hp + Math.round(ally.unit.maxHp * h.pct));
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
    this.telegraph(m, "circle", m.x, m.y, s.r, s.ms, (p) => { if (m.stunUntil <= this.time) this.hit(m, p, { kind, mult: s.mult }); }, { k: kind });
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
      const kind: FxKind = m.def.projectile === "poison" ? "poison" : m.def.projectile === "fire" ? "fire" : "shadow";
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
