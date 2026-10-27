/**
 * Боссы стартовых земель (задача 136): ИИ по карточкам data/zone-bosses.json. Три умения на босса, у каждого — предупреждение
 * на земле (w.telegraph: круг, кольцо, конус) и удар, когда оно истекает: кто вышел из формы — урона нет. Волны then идут одна
 * за другой (новая — когда ударила прошлая), «фишки» — ряды, россыпи, травля, прыжок, таран, корни, огонь, яд — из полей карточки.
 * Урон — доля полного здоровья героя (dmgPct, до брони). Реплики — lines карточки. Вид — клиент (client/src/game/zoneBoss.ts)
 * по событию zb: связки анимаций босса и эффекты мира в метках.
 */
import { Anim, Dir, type FxKind } from "../../../shared/protocol";
import { walkable } from "../../../shared/map";
import { ZB_ARENA, ZB_BY_ID, ZB_LOW_HP, type ZbAbility, type ZbCard, type ZbWave } from "../../../shared/zoneBosses";
import { Boss } from "./bosses";
import { applyRoot, applyStun } from "./effects";
import { Mob } from "./Mob";
import { MOBS } from "../../../shared/mobs";
import type { Player } from "./Player";
import type { World } from "./World";

const DEG = Math.PI / 180;
const KINDS = new Set<FxKind>(["phys", "fire", "frost", "poison", "arcane", "shadow", "nature", "holy", "blood"]);
const kindOf = (k?: string): FxKind => (k && KINDS.has(k as FxKind) ? (k as FxKind) : "phys");
const pick = <T>(a: readonly T[] | undefined): T | undefined => (a?.length ? a[Math.floor(Math.random() * a.length)] : undefined);

/** Форма одной метки волны: где и когда бьёт (delay — сверх windupMs: ряды и травля). */
interface Mark { shape: "circle" | "ring" | "cone"; x: number; y: number; r: number; r2?: number; a?: number; w?: number; delay: number }

export class ZoneBoss extends Boss {
  /** Пороги фаз: фазы карточки (кольцо, задача 139) и «мало здоровья» — по убыванию. */
  protected thresholds: number[];
  /** Уровень — строго levels.boss карточки (10/20/30/40): герой 100 ур. видит в начальной зоне босса 10 ур. */
  protected override scales = false;
  private readonly card: ZbCard;
  /** Растёт при сбросе и гибели: отложенные волны прошлого боя не продолжаются. */
  private epoch = 0;
  private engaged = false;
  private lastTarget = "";
  private lastKillAt = -1;
  /** Срок, до которого босс занят умением (сам ставит casting). */
  private busyUntil = 0;

  constructor(w: World, m: Mob, arena: number) {
    super(w, m, arena);
    this.card = ZB_BY_ID[m.def.id];
    const phases = this.card.phases ?? [];
    this.thresholds = [...phases.map((p) => p.at), ZB_LOW_HP].sort((a, b) => b - a);
    // фаза Boss (сколько порогов пройдено) → фаза карточки (сколько её фаз пройдено)
    const cardPhase = (i: number) => (i === 0 ? 0 : phases.filter((p) => p.at >= this.thresholds[i - 1]).length);
    const all = this.thresholds.map((_, i) => i + 1).concat(0);
    for (const ab of this.card.abilities) this.ability(ab.every, all.filter((i) => cardPhase(i) >= (ab.phase ?? 0)), () => this.run(ab));
  }

  protected onPhase(n: number) {
    const at = this.thresholds[n - 1];
    const ph = (this.card.phases ?? []).find((p) => p.at === at);
    if (!ph) {
      if (at === ZB_LOW_HP) this.line(this.card.lines.lowHp);
      return;
    }
    // переход фазы кольца: пауза с анимацией, реплика, прежние умения чаще, новые — вскоре после паузы
    const pause = ph.pauseMs ?? 0;
    this.line(ph.yell);
    if (pause > 0) {
      this.casting = true;
      this.busyUntil = Math.max(this.busyUntil, this.w.time + pause);
      this.m.unit.anim = Anim.Cast;
      this.w.emit({ t: "zb", id: this.m.id, ab: "phase", w: 0, ms: pause });
    }
    this.card.abilities.forEach((ab, i) => {
      const a = this.abilities[i];
      if (!a) return;
      if (ph.abilities.includes(ab.id)) a.at = pause / 1000 + 3;
      else if (ph.everyMul) a.every *= ph.everyMul;
    });
  }

  private line(list: string[] | undefined, name?: string) {
    const t = pick(list);
    if (t) this.say(name ? t.replaceAll("{name}", name) : t);
  }

  override update(dt: number) {
    const m = this.m;
    if (m.state === "chase" && !this.engaged) {
      this.engaged = true;
      this.line(this.card.lines.spawn);
    }
    // убил героя: цель босса погибла только что
    const t = this.lastTarget ? this.w.players.get(this.lastTarget) : undefined;
    if (t?.dead) this.killed(t);
    this.lastTarget = m.targetId ?? "";
    // сломанный кандальный кол: щит снят, клетка распадается
    for (const st of this.stakes) if (st.dead) this.stakeDied(st);
    if (this.casting && this.w.time >= this.busyUntil) {
      this.casting = false;
      if (!m.dead) m.unit.anim = Anim.Idle;
    }
    super.update(dt);
  }

  private killed(p: Player) {
    if (p.deadAt === this.lastKillAt || this.w.time - p.deadAt > 1500) return;
    this.lastKillAt = p.deadAt;
    this.line(this.card.lines.kill, p.name);
  }

  override reset() {
    this.epoch++;
    this.engaged = false;
    this.busyUntil = 0;
    this.stakes.clear();
    this.m.dmgTakenMul = 1;
    super.reset();
    // откаты — как в карточке (переход фазы их ускорял)
    this.card.abilities.forEach((ab, i) => { if (this.abilities[i]) this.abilities[i].every = ab.every; });
  }

  override onDeath() {
    this.stakes.clear();
    this.m.dmgTakenMul = 1;
    this.epoch++;
    this.busyUntil = 0;
    this.casting = false;
    this.engaged = false;
    this.line(this.card.lines.death);
    for (const add of this.adds) if (!add.dead) this.w.killMob(add);
    this.adds.clear();
  }

  /** Самый дальний от босса герой на арене. */
  private far(): Player | undefined {
    let best: Player | undefined, d = -1;
    for (const p of this.inArena()) {
      const q = Math.hypot(p.x - this.m.x, p.y - this.m.y);
      if (q > d) { d = q; best = p; }
    }
    return best;
  }
  private face(x: number, y: number) {
    const dx = x - this.m.x, dy = y - this.m.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    this.m.unit.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down;
  }

  /** Запуск умения: первая волна, остальные — по очереди, когда ударила прошлая. */
  private run(ab: ZbAbility) {
    const tank = this.target() ?? this.far();
    if (!tank || !this.inArena().length) return;
    if (ab.break) { this.channel(ab); return; }
    if (ab.cage) { this.cages(ab); return; }
    if (ab.doubles) { this.doubles(ab); return; }
    if (ab.swarm) { this.swarmCall(ab); return; }
    if (ab.safe) { this.storm(ab); return; }
    const waves: ZbWave[] = [ab, ...(ab.then ?? [])];
    // занятость: сумма волн (с рядами и травлей)
    let total = 0;
    for (const wv of waves) total += wv.windupMs + this.tail(wv);
    this.casting = true;
    this.busyUntil = this.w.time + total;
    this.m.unit.anim = Anim.Cast;
    this.face(tank.x, tank.y);
    if (Math.random() < 0.6) this.line(this.card.lines.abilities[ab.id]);
    // подкоп: до выхода из-под земли босс неуязвим (урон ×0); сбрасывается по сроку, при сбросе боя и гибели
    if (ab.burrow) {
      const epoch = this.epoch;
      this.m.dmgTakenMul = 0;
      this.w.later(ab.burrow.invulnMs, () => { if (epoch === this.epoch) this.refreshShield(); });
    }
    this.wave(ab, waves, 0, null, this.epoch);
    if (ab.mirror) this.mirrorWave(ab);
  }

  /** Рой (кольцо, swarm): после замаха у босса вылезают приспешники и бегут на цель; убиваются с боссом и при сбросе. */
  private swarmCall(ab: ZbAbility) {
    const w = this.w, m = this.m, sw = ab.swarm!, epoch = this.epoch;
    this.casting = true;
    this.busyUntil = w.time + ab.windupMs + 300;
    m.unit.anim = Anim.Cast;
    if (Math.random() < 0.8) this.line(this.card.lines.abilities[ab.id]);
    w.emit({ t: "zb", id: m.id, ab: ab.id, w: 0, ms: ab.windupMs, pts: [Math.round(m.x), Math.round(m.y)], r: ab.r });
    w.later(ab.windupMs, () => {
      if (epoch !== this.epoch || m.dead || !MOBS[`${m.def.id}_swarm`]) return;
      this.summon(`${m.def.id}_swarm`, sw.count, Math.min(this.arena * 0.7, 130));
    });
  }
  /** Песчаная буря (кольцо, safe): столбы-укрытия встают на арене; в конце замаха бьёт всех вне столбов. */
  private storm(ab: ZbAbility) {
    const w = this.w, m = this.m, sf = ab.safe!, epoch = this.epoch, k = kindOf(ab.k);
    this.casting = true;
    this.busyUntil = w.time + ab.windupMs + 300;
    m.unit.anim = Anim.Cast;
    if (Math.random() < 0.8) this.line(this.card.lines.abilities[ab.id]);
    const rocks: { x: number; y: number }[] = [];
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < sf.count; i++) {
      for (let rr = this.arena * 0.6; rr > 40; rr -= 15) {
        const a = a0 + (i / sf.count) * Math.PI * 2;
        const x = Math.round(m.home.x + Math.cos(a) * rr), y = Math.round(m.home.y + Math.sin(a) * rr);
        if (walkable(w.map, x, y, 12)) { rocks.push({ x, y }); break; }
      }
    }
    w.emit({ t: "zb", id: m.id, ab: ab.id, w: 0, ms: ab.windupMs, pts: rocks.flatMap((s) => [s.x, s.y]), r: sf.r });
    w.later(ab.windupMs, () => {
      if (epoch !== this.epoch || m.dead) return;
      for (const p of this.inArena()) {
        if (p.dead || rocks.some((s) => Math.hypot(p.x - s.x, p.y - s.y) <= sf.r)) continue;
        w.hitEx(m, p, { flat: Math.max(1, ab.dmgPct * p.unit.maxHp), kind: k });
        if (p.dead) this.killed(p);
      }
    });
  }

  /** Мираж-двойники (кольцо, doubles). */
  private mirages = new Set<Mob>();
  private doubles(ab: ZbAbility) {
    const w = this.w, m = this.m, d = ab.doubles!, epoch = this.epoch;
    const def = MOBS[`${m.def.id}_mirage`];
    if (!def) return;
    this.casting = true;
    this.busyUntil = w.time + ab.windupMs + 300;
    m.unit.anim = Anim.Cast;
    if (Math.random() < 0.8) this.line(this.card.lines.abilities[ab.id]);
    for (const old of this.mirages) if (!old.dead) { w.removeMob(old); this.adds.delete(old); }
    this.mirages.clear();
    const spots: { x: number; y: number }[] = [];
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < d.count; k++) {
      for (let rr = this.arena * 0.78; rr > 40; rr -= 20) {
        const a = a0 + (k / d.count) * Math.PI * 2;
        const x = Math.round(m.home.x + Math.cos(a) * rr), y = Math.round(m.home.y + Math.sin(a) * rr);
        if (walkable(w.map, x, y, 12)) { spots.push({ x, y }); break; }
      }
    }
    w.emit({ t: "zb", id: m.id, ab: ab.id, w: 0, ms: ab.windupMs, pts: spots.flatMap((s) => [s.x, s.y]), r: ab.r });
    w.later(ab.windupMs, () => {
      if (epoch !== this.epoch || m.dead) return;
      for (const s of spots) {
        const mob = new Mob(w.uid("d"), def, m.level, { x: s.x, y: s.y });
        mob.summoned = true;
        w.addMob(mob);
        this.adds.add(mob);
        this.mirages.add(mob);
        w.later(d.holdMs, () => { if (!mob.dead && epoch === this.epoch) { w.removeMob(mob); this.adds.delete(mob); this.mirages.delete(mob); } });
      }
    });
  }
  /** Каждый живой двойник повторяет кольцо босса со своего места (убитый — нет). */
  private mirrorWave(ab: ZbAbility) {
    const w = this.w, m = this.m, epoch = this.epoch, k = kindOf(ab.k);
    for (const d of this.mirages) {
      if (d.dead) continue;
      const shape = ab.tele === "ring" ? "ring" : "circle";
      w.emit({ t: "zb", id: m.id, ab: `${ab.id}_mirage`, w: 0, ms: ab.windupMs, pts: [Math.round(d.x), Math.round(d.y)], r: ab.r, r2: ab.r2 });
      const hit = new Set<string>();
      w.telegraph(m, shape, d.x, d.y, ab.r, ab.windupMs, (p) => {
        if (epoch !== this.epoch || d.dead || hit.has(p.id)) return;
        hit.add(p.id);
        w.hitEx(m, p, { flat: Math.max(1, ab.dmgPct * p.unit.maxHp), kind: k });
        if (p.dead) this.killed(p);
      }, { r2: ab.r2, k });
    }
  }

  /**
   * Прерываемый каст на всю арену (кольцо, break): полоса каста windupMs; кто за это время снял боссу pct здоровья — сорвал:
   * босс оглушён stunMs (событие zb «break»). Иначе в конце — удар dmgPct по всем на арене и оглушение героев, столбы душ.
   */
  private channel(ab: ZbAbility) {
    const w = this.w, m = this.m, b = ab.break!, epoch = this.epoch;
    const hp0 = m.unit.hp, need = b.pct * m.unit.maxHp, end = w.time + ab.windupMs;
    this.casting = true;
    this.busyUntil = end;
    m.unit.anim = Anim.Cast;
    if (Math.random() < 0.8) this.line(this.card.lines.abilities[ab.id]);
    // точки столбов: по арене, на проходимой земле
    const pts: number[] = [];
    for (let k = 0, guard = 0; k < (b.pillars ?? 8) && guard < 200; guard++) {
      const a = Math.random() * Math.PI * 2, d = 40 + Math.sqrt(Math.random()) * (this.arena - 50);
      const x = m.home.x + Math.cos(a) * d, y = m.home.y + Math.sin(a) * d;
      if (!walkable(w.map, x, y, 8)) continue;
      pts.push(Math.round(x), Math.round(y));
      k++;
    }
    w.emit({ t: "zb", id: m.id, ab: ab.id, w: 0, ms: ab.windupMs, pts, r: this.arena });
    const tick = () => {
      if (epoch !== this.epoch || m.dead) return;
      if (hp0 - m.unit.hp >= need) {
        // сорвали: оглушён, полоса каста — с трещиной
        this.epoch++;
        this.busyUntil = w.time + b.stunMs;
        applyStun(w, null, m, b.stunMs);
        w.emit({ t: "zb", id: m.id, ab: "break", w: 0, ms: b.stunMs });
        this.line(this.card.lines.break);
        return;
      }
      if (w.time < end) { w.later(100, tick); return; }
      const k = kindOf(ab.k);
      for (const p of this.inArena()) {
        if (p.dead) continue;
        const res = w.hitEx(m, p, { flat: Math.max(1, ab.dmgPct * p.unit.maxHp), kind: k });
        if (res.landed && b.heroStunMs) applyStun(w, m, p, b.heroStunMs);
        if (p.dead) this.killed(p);
      }
    };
    w.later(100, tick);
  }

  /** Кандальные колы на арене (клетки): пока хоть один стоит, босс получает урон ×shield. */
  private stakes = new Set<Mob>();
  private shieldMul = 1;
  private refreshShield() {
    for (const s of this.stakes) if (s.dead) this.stakes.delete(s);
    this.m.dmgTakenMul = this.stakes.size ? this.shieldMul : 1;
  }
  /**
   * Клетки (кольцо, cage): удар оземь (windupMs) — у count случайных героев встаёт клетка с кандальным колом в центре (моб
   * <босс>_cage). Пока кол стоит, босс получает урон ×shield. Через holdMs клетка с целым колом бьёт всех внутри круга r.
   * Сломанный кол — клетка распадается (событие zb «cage_break»).
   */
  private cages(ab: ZbAbility) {
    const w = this.w, m = this.m, c = ab.cage!, epoch = this.epoch;
    const ps = this.randomPlayers(ab.count ?? 1);
    if (!ps.length) return;
    this.casting = true;
    this.busyUntil = w.time + ab.windupMs + 300;
    m.unit.anim = Anim.Cast;
    if (Math.random() < 0.7) this.line(this.card.lines.abilities[ab.id]);
    const spots = ps.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    w.emit({ t: "zb", id: m.id, ab: ab.id, w: 0, ms: ab.windupMs, pts: spots.flatMap((s) => [s.x, s.y]), r: ab.r });
    const k = kindOf(ab.k);
    w.later(ab.windupMs, () => {
      if (epoch !== this.epoch || m.dead) return;
      const def = MOBS[`${m.def.id}_cage`];
      if (!def) return;
      this.shieldMul = c.shield;
      for (const s of spots) {
        const stake = new Mob(w.uid("s"), def, m.level, { x: s.x, y: s.y });
        stake.summoned = true;
        w.addMob(stake);
        this.adds.add(stake);
        this.stakes.add(stake);
        this.refreshShield();
        // удар внутрь клетки, если кол ещё цел; клетка распадается в любом случае
        w.telegraph(m, "circle", s.x, s.y, ab.r, c.holdMs, (p) => {
          if (epoch !== this.epoch || stake.dead) return;
          const res = w.hitEx(m, p, { flat: Math.max(1, ab.dmgPct * p.unit.maxHp), kind: k });
          void res;
          if (p.dead) this.killed(p);
        }, { k });
        w.later(c.holdMs + 60, () => {
          if (!stake.dead) w.removeMob(stake);
          this.stakes.delete(stake);
          this.refreshShield();
          w.emit({ t: "zb", id: m.id, ab: "cage_break", w: 0, ms: 0, pts: [s.x, s.y] });
        });
      }
    });
  }
  /** Кол сломан (замечает update): щит снят, клетка распадается. */
  stakeDied(stake: Mob) {
    if (!this.stakes.delete(stake)) return;
    this.refreshShield();
    this.w.emit({ t: "zb", id: this.m.id, ab: "cage_break", w: 0, ms: 0, pts: [Math.round(stake.home.x), Math.round(stake.home.y)] });
  }

  /** Сколько волна бьёт после windupMs: ряд — (count − 1)·stepMs, травля — так же. */
  private tail(wv: ZbWave) {
    return (wv.at === "path" || wv.at === "hunt") && wv.count ? (wv.count - 1) * (wv.stepMs ?? 0) : 0;
  }

  private wave(ab: ZbAbility, waves: ZbWave[], i: number, prev: Mark[] | null, epoch: number) {
    const w = this.w, m = this.m, wv = waves[i];
    if (epoch !== this.epoch || m.dead) return;
    const hitSet = new Set<string>();
    const marks = wv.at === "hunt" ? [] : this.marks(wv, prev);
    if (wv.at === "hunt") this.hunt(ab, wv, i, epoch);
    else if (!marks.length) return;
    else {
      const pts: number[] = [];
      for (const mk of marks) pts.push(Math.round(mk.x), Math.round(mk.y));
      const a0 = marks[0].a;
      w.emit({ t: "zb", id: m.id, ab: ab.id, w: i, ms: wv.windupMs, pts, a: a0 === undefined ? undefined : Math.round(a0 * 1000) / 1000, step: wv.stepMs, r: wv.r, r2: wv.r2 });
      for (const mk of marks) this.strike(wv, mk, hitSet, epoch);
    }
    const last = wv.windupMs + this.tail(wv);
    // после удара: прыжок в центр круга, таран — в конец ряда
    if (wv.after?.leap && marks[0]) w.later(wv.windupMs, () => { if (epoch === this.epoch && !m.dead) this.moveTo(marks[0].x, marks[0].y, "leap"); });
    if (wv.after?.dash && marks.length) w.later(last, () => { if (epoch === this.epoch && !m.dead) this.moveTo(marks[marks.length - 1].x, marks[marks.length - 1].y, "charge"); });
    if (i + 1 < waves.length) w.later(last, () => this.wave(ab, waves, i + 1, marks, epoch));
  }

  /** Перенос босса (прыжок, таран): только на проходимое место и не дальше арены. */
  private moveTo(x: number, y: number, k: string) {
    const m = this.m;
    if (Math.hypot(x - m.home.x, y - m.home.y) > this.arena + 60 || !walkable(this.w.map, x, y, 14)) return;
    this.w.emit({ t: "blink", id: m.id, x0: m.x, y0: m.y, x1: x, y1: y, k });
    m.unit.x = x;
    m.unit.y = y;
  }

  /** Травля: count меток по очереди под одним героем — новая каждые stepMs там, где он стоит в этот миг. */
  private hunt(ab: ZbAbility, wv: ZbWave, wi: number, epoch: number) {
    const prey = pick(this.inArena());
    if (!prey) return;
    const n = wv.count ?? 1;
    for (let k = 0; k < n; k++) {
      this.w.later(k * (wv.stepMs ?? 0), () => {
        if (epoch !== this.epoch || this.m.dead) return;
        const p = this.w.players.get(prey.id);
        if (!p || p.dead) return;
        // каждая метка — своя волна по попаданиям: травля бьёт добычу каждой меткой, на которой она стоит
        const mk: Mark = { shape: "circle", x: p.x, y: p.y, r: wv.r, delay: 0 };
        this.w.emit({ t: "zb", id: this.m.id, ab: ab.id, w: wi + k, ms: wv.windupMs, pts: [Math.round(p.x), Math.round(p.y)], r: wv.r });
        this.strike(wv, mk, new Set(), epoch);
      });
    }
  }

  /** Метки волны по полю at карточки. */
  private marks(wv: ZbWave, prev: Mark[] | null): Mark[] {
    const m = this.m, out: Mark[] = [];
    const tank = this.target() ?? this.far();
    const far = this.far();
    const cone = (x: number, y: number, a: number): Mark => ({ shape: "cone", x, y, r: wv.r, a, w: (wv.arc ?? 90) * DEG, delay: 0 });
    const circle = (x: number, y: number, delay = 0): Mark => ({ shape: wv.tele === "ring" ? "ring" : "circle", x, y, r: wv.r, r2: wv.r2, delay });
    const toward = (p: { x: number; y: number } | undefined) => (p ? Math.atan2(p.y - m.y, p.x - m.x) : 0);
    switch (wv.at) {
      case "self":
        if (wv.tele === "cone") for (const d of wv.dirs ?? [0]) out.push(cone(m.x, m.y, toward(tank) + d * DEG));
        else out.push(circle(m.x, m.y));
        break;
      case "tank":
        if (!tank) break;
        if (wv.tele === "cone") for (const d of wv.dirs ?? [0]) out.push(cone(m.x, m.y, toward(tank) + d * DEG));
        else out.push(circle(tank.x, tank.y));
        break;
      case "random": {
        const ps = this.randomPlayers(wv.tele === "cone" ? 1 : wv.count ?? 1);
        for (const p of ps) out.push(wv.tele === "cone" ? cone(m.x, m.y, toward(p)) : circle(p.x, p.y));
        if (wv.tele === "cone" && ps[0]) this.face(ps[0].x, ps[0].y);
        break;
      }
      case "far":
        if (!far) break;
        if (wv.tele === "cone") out.push(cone(m.x, m.y, toward(far)));
        else out.push(circle(far.x, far.y));
        break;
      case "all":
        for (const p of this.inArena()) out.push(circle(p.x, p.y));
        break;
      case "path": {
        const to = wv.to === "far" ? far : tank;
        if (!to) break;
        const a = toward(to), n = wv.count ?? 1, step = wv.step ?? wv.r * 2;
        this.face(to.x, to.y);
        for (let k = 0; k < n; k++) out.push(circle(m.x + Math.cos(a) * step * (k + 1), m.y + Math.sin(a) * step * (k + 1), k * (wv.stepMs ?? 0)));
        break;
      }
      case "spots": {
        const a = toward(tank), ca = Math.cos(a), sa = Math.sin(a);
        for (const [fx, fy] of wv.spots ?? []) out.push(circle(m.x + ca * fx - sa * fy, m.y + sa * fx + ca * fy));
        break;
      }
      case "scatter": {
        const spread = wv.spread ?? 150, n = wv.count ?? 1;
        for (let k = 0, guard = 0; k < n && guard < n * 20; guard++) {
          const ang = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * spread;
          const x = m.x + Math.cos(ang) * d, y = m.y + Math.sin(ang) * d;
          if (!walkable(this.w.map, x, y, 8)) continue;
          out.push(circle(x, y));
          k++;
        }
        break;
      }
      case "same":
        for (const p of prev ?? []) {
          if (wv.tele === "cone") out.push(cone(p.x, p.y, (p.a ?? 0) + (wv.turn ?? 0) * DEG));
          else out.push(circle(p.x, p.y));
        }
        break;
      case "hunt":
        break;
    }
    // форма вокруг босса не выходит за арену: кольцо «до края» режется радиусом арены
    for (const mk of out) if (mk.shape === "ring" && mk.r2 !== undefined) mk.r2 = Math.min(mk.r2, Math.max(ZB_ARENA, mk.r + 8));
    return out;
  }

  /** Метка: предупреждение на земле и удар по тем, кто остался в форме (одна волна бьёт героя не больше раза). */
  private strike(wv: ZbWave, mk: Mark, hitSet: Set<string>, epoch: number) {
    const w = this.w, m = this.m, k = kindOf(wv.k);
    const ms = wv.windupMs + mk.delay;
    w.telegraph(m, mk.shape, mk.x, mk.y, mk.r, ms, (p) => {
      if (epoch !== this.epoch || hitSet.has(p.id)) return;
      hitSet.add(p.id);
      // общая метка (share): урон делится на всех героев в круге в миг удара
      const n = wv.share ? Math.max(1, this.inArena().filter((q) => !q.dead && Math.hypot(q.x - mk.x, q.y - mk.y) <= mk.r).length) : 1;
      const res = w.hitEx(m, p, { flat: Math.max(1, (wv.dmgPct * p.unit.maxHp) / n), kind: k });
      if (res.landed) {
        const af = wv.after;
        if (af?.rootMs) applyRoot(w, m, p, af.rootMs);
        if (af?.burnMs) { p.burnUntil = w.time + af.burnMs; w.emit({ t: "zb", id: m.id, ab: "burn", w: 0, ms: af.burnMs, tgt: p.id }); }
        if (af?.poisonMs) p.poisonUntil = w.time + af.poisonMs;
        // цепь: рывок к боссу на pull px (не ближе 48 px к нему, только на проходимое место)
        // воронка: рывок к центру метки на pullMark px
        if (af?.pullMark && !p.dead) {
          const dx = mk.x - p.x, dy = mk.y - p.y, d = Math.hypot(dx, dy);
          const go = Math.min(af.pullMark, d);
          if (go > 4) {
            const x = p.x + (dx / d) * go, y = p.y + (dy / d) * go;
            if (walkable(w.map, x, y, 10)) {
              w.emit({ t: "blink", id: p.id, x0: p.x, y0: p.y, x1: x, y1: y, k: "charge" });
              p.unit.x = x;
              p.unit.y = y;
            }
          }
        }
        if (af?.pull && !p.dead) {
          const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
          const go = Math.min(af.pull, Math.max(0, d - 48));
          if (go > 4) {
            const x = p.x + (dx / d) * go, y = p.y + (dy / d) * go;
            w.emit({ t: "chain", pts: [Math.round(m.x), Math.round(m.y - 26), Math.round(p.x), Math.round(p.y - 12)], k: "phys" });
            if (walkable(w.map, x, y, 10)) {
              w.emit({ t: "blink", id: p.id, x0: p.x, y0: p.y, x1: x, y1: y, k: "charge" });
              p.unit.x = x;
              p.unit.y = y;
            }
          }
        }
      }
      if (p.dead) this.killed(p);
    }, { r2: mk.r2, a: mk.a, w: mk.w, k });
    // пятно на земле после удара: урон в секунду — доля здоровья героев на арене
    const af = wv.after;
    if (af?.hazardMs && af.hazardPct) {
      w.later(ms, () => {
        if (epoch !== this.epoch || m.dead) return;
        const ps = this.inArena();
        const hp = ps.length ? ps.reduce((s, p) => s + p.unit.maxHp, 0) / ps.length : m.stats.dmg * 10;
        w.addHazard(m, mk.x, mk.y, mk.r, af.hazardMs!, af.hazardPct! * hp, k);
      });
    }
  }
}

/** Босс стартовых земель по id моба (карточка data/zone-bosses.json) или null. */
export function createZoneBoss(w: World, m: Mob, arena: number): ZoneBoss | null {
  return ZB_BY_ID[m.def.id] ? new ZoneBoss(w, m, arena) : null;
}
