/**
 * «Рогатый Рыцарь Хаоса» (задача 114, docs/systems/bosses.md §3–4): фазы 100–75–50–25 %, атаки с телеграфами по шаблонам kind,
 * числа и состав фаз — data/raid.json (shared/raid.ts). Телеграфы свои (есть форма line): каждый пишется в список опасных зон
 * рейда (ИИ ботов уклоняется), удар — по героям внутри формы при прямой видимости от источника (колонны дают тень).
 */
import { armorReduction } from "../../../shared/formulas";
import { MOBS } from "../../../shared/mobs";
import { lineClear, walkable } from "../../../shared/map";
import { Anim, BUFF_ENRAGE, type FxKind } from "../../../shared/protocol";
import { fillText, inHall, RAID, RAID_ADDS, RAID_ATTACKS, RAID_BOSS, RAID_PHASES, type RaidAttack } from "../../../shared/raid";
import { Boss } from "../game/bosses";
import { inDanger, type Danger } from "../game/danger";
import { Mob } from "../game/Mob";
import type { Player } from "../game/Player";
import type { World } from "../game/World";

/** Что рыцарю нужно от рейда (RaidDirector). */
export interface KnightHooks {
  /** Список опасных зон рейда (ИИ ботов). */
  dangers: Danger[];
  /** Шина событий рейда: tele:<атака>, adds, phase, yell… */
  emit(ev: string, data?: Record<string, unknown>): void;
  /** Полоса каста босса у клиентов (ms 0 — скрыть). */
  cast(name: string, ms: number): void;
  /** Новая фаза (0..3): баннер, заряды воскрешения. */
  phase(n: number): void;
  /** Момент берсерка (w.time). */
  berserkAt(): number;
  /** Кто сейчас главный танк (для «Рассечения», если у босса нет цели). */
  tank(): Player | undefined;
  rand(): number;
}

const D2R = Math.PI / 180;
const KILL_YELL_MS = 12_000;
const GAP_MS = 450;
/** Сколько босс стоит на месте, выполняя атаку (кроме тех, где это ms или castMs). */
const CAST_OF: Partial<Record<RaidAttack["kind"], number>> = { ashfall: 600, rings: 800, verdict: 700, summon: 1000 };
/** Порядок, если готово несколько атак сразу: механики важнее. */
const PRIORITY = ["sun", "verdict", "rift", "fire_rings", "summon", "quake", "cleave", "kick", "ashfall"];

export class ChaosKnight extends Boss {
  protected thresholds = RAID_PHASES.slice(1).map((p) => p.at);
  /** Босс проснулся (этап fight). */
  awake = false;
  /** Направление взгляда (рад): на цель угрозы, на касте — замерло. */
  face = Math.PI / 2;
  /** Номер «поколения» боя: после вайпа отложенные удары прошлой попытки не срабатывают. */
  private gen = 0;
  private next = new Map<string, number>();
  private busyUntil = 0;
  private pauseUntil = 0;
  private berserkNext = 0;
  private killYellAt = -1e9;
  /** Сколько раз сработала каждая атака (тест и итоги). */
  readonly used: Record<string, number> = {};
  /** Какая атака сейчас бьёт (разбор смертей в тесте). */
  hitBy = "";
  /** Реплики по событиям (тест). */
  readonly yelled: Record<string, number> = {};

  constructor(w: World, m: Mob, arena: number, private hooks: KnightHooks) {
    super(w, m, arena);
  }
  protected onPhase() {}

  get phaseNo() { return this.phase; }
  private get enraged() { return this.phase >= 3; }
  private period(a: RaidAttack): number {
    const base = this.enraged && a.everyEnrage ? a.everyEnrage : a.every ?? 20;
    return base * 1000 * (this.enraged ? RAID_BOSS.enrage.periodMul : 1);
  }
  private get dmg() { return this.m.stats.dmg * this.mech; }

  // ---------------------------------------------------------------- реплики, поза, каст
  /** Реплика события (data/raid.json yells): крупно над боссом и в чате у клиентов. */
  yell(event: string, vars: Record<string, string | number> = {}) {
    const text = fillText(RAID.yells[event], vars, this.hooks.rand);
    if (!text) return;
    this.yelled[event] = (this.yelled[event] || 0) + 1;
    this.w.emit({ t: "yell", id: this.m.id, text });
    this.hooks.emit("yell", { event, text });
  }
  /** Стоит и кастует ms: без шага и автоатаки, поза у клиентов, полоса каста с названием. */
  private castPose(ms: number, pose: "swing" | "slam" | "roar" | undefined, name: string) {
    const m = this.m, t = this.w.time;
    this.casting = true;
    this.busyUntil = t + ms + GAP_MS;
    m.windUntil = Math.max(m.windUntil, t + ms);
    m.attackAt = Math.max(m.attackAt, t + ms + 300);
    m.unit.anim = Anim.Cast;
    if (pose === "swing") m.unit.aseq = (m.unit.aseq + 1) % 65535;
    if (pose) this.w.emit({ t: "pose", id: m.id, k: pose, ms });
    if (name) this.hooks.cast(name, ms);
    const gen = this.gen;
    this.w.later(ms, () => {
      if (gen !== this.gen || this.w.time < this.busyUntil - GAP_MS - 5) return;
      this.casting = false;
      if (!m.dead && m.unit.anim === Anim.Cast) m.unit.anim = Anim.Idle;
    });
  }

  // ---------------------------------------------------------------- телеграфы и урон
  /** Телеграф формы shape; через ms — удар по живым героям внутри при прямой видимости от origin (по умолчанию — центр формы). */
  private tele(id: string, shape: Danger["shape"], x: number, y: number, r: number, ms: number, onHit: (p: Player) => void, extra: { r2?: number; a?: number; w?: number; k?: FxKind; origin?: { x: number; y: number } } = {}) {
    const w = this.w, d: Danger = { shape, x, y, r, r2: extra.r2, a: extra.a, w: extra.w, at: w.time, until: w.time + ms, id };
    w.emit({ t: "tele", shape, k: extra.k ?? "fire", x, y, r, r2: extra.r2, a: extra.a, w: extra.w, ms });
    this.hooks.dangers.push(d);
    const gen = this.gen, o = extra.origin ?? { x, y };
    w.later(ms, () => {
      if (gen !== this.gen || this.m.dead) return;
      for (const p of [...w.players.values()]) {
        if (p.dead || !inDanger(d, p.x, p.y, 0) || !lineClear(w.map, o.x, o.y, p.x, p.y)) continue;
        this.hitBy = id;
        onHit(p);
        this.hitBy = "";
      }
    });
  }
  /** Удар механики: mult × урон удара босса (броня, щиты и защиты героя работают, уклониться нельзя). */
  private hit(p: Player, mult: number, kind: FxKind = "fire") {
    this.w.hit(this.m, p, { flat: Math.max(1, this.dmg * mult * (0.92 + this.hooks.rand() * 0.16)), kind, canCrit: false });
  }
  /** Доля максимального здоровья мимо брони (щиты, блок и снижение урона героя работают). */
  private pct(p: Player, pct: number, kind: FxKind = "fire") {
    let armor = p.derived.armor + (p.warcryUntil > this.w.time ? p.warcryArmor : 0);
    if (kind !== "phys") armor *= 0.5;
    const flat = (p.unit.maxHp * pct) / Math.max(0.05, 1 - armorReduction(armor, this.m.level));
    this.w.hit(this.m, p, { flat: Math.max(1, flat), kind, canCrit: false });
  }
  /** Горение: тики раз в 0.5 с, ms, mult × урон удара за тик. */
  private burn(p: Player, ms: number, mult: number) {
    const w = this.w, until = w.time + ms, gen = this.gen;
    p.burnUntil = Math.max(p.burnUntil, until);
    const tick = () => {
      if (gen !== this.gen || p.dead || this.m.dead || w.players.get(p.id) !== p || w.time > until) return;
      this.hitBy = "burn";
      w.hit(this.m, p, { flat: Math.max(1, this.dmg * mult), kind: "fire", canCrit: false, noProc: true });
      this.hitBy = "";
      if (w.time + 500 <= until) w.later(500, tick);
    };
    w.later(500, tick);
  }

  // ---------------------------------------------------------------- цели
  private hall(): Player[] {
    return [...this.w.players.values()].filter((p) => !p.dead && inHall(p.x, p.y, 1.2));
  }
  private tgt(): Player | undefined {
    const t = this.target();
    return t && !t.dead ? t : this.hooks.tank();
  }
  private shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.hooks.rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  /** Случайная проходимая точка зала в пределах r от (x, y). */
  private spot(x: number, y: number, r: number): { x: number; y: number } {
    for (let i = 0; i < 12; i++) {
      const a = this.hooks.rand() * Math.PI * 2, d = Math.sqrt(this.hooks.rand()) * r;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (inHall(px, py, 0.95) && walkable(this.w.map, px, py, 10)) return { x: px, y: py };
    }
    return { x, y };
  }

  // ---------------------------------------------------------------- атаки
  private run(id: string): boolean {
    const a = RAID_ATTACKS[id], m = this.m, w = this.w;
    if (!a) return false;
    const k: FxKind = "fire";
    switch (a.kind) {
      case "cone": { // Рассечение: конус по танку
        const t = this.tgt();
        if (!t || w.dist(t, m) > (a.r ?? 200) + 60) return false;
        const ang = Math.atan2(t.y - m.y, t.x - m.x);
        this.face = ang;
        m.unit.dir = dirOf(ang);
        this.castPose(a.ms!, a.pose, a.name);
        this.hooks.emit(`tele:${id}`);
        this.tele(id, "cone", m.x, m.y, a.r!, a.ms!, (p) => this.hit(p, a.mult!, "phys"), { a: ang, w: (a.angle ?? 120) * D2R, k: "phys", origin: m });
        return true;
      }
      case "kick": { // Пинок: конус за спиной, только если там кто-то стоит
        const back = this.face + Math.PI;
        const d: Danger = { shape: "cone", x: m.x, y: m.y, r: a.r! + 20, a: back, w: (a.angle ?? 100) * D2R, at: 0, until: 0 };
        if (!this.hall().some((p) => inDanger(d, p.x, p.y, 0))) return false;
        this.castPose(a.ms!, a.pose, a.name);
        this.hooks.emit(`tele:${id}`);
        this.tele(id, "cone", m.x, m.y, a.r!, a.ms!, (p) => this.hit(p, a.mult!, "phys"), { a: back, w: (a.angle ?? 100) * D2R, k: "phys", origin: m });
        return true;
      }
      case "circle": { // Сотрясение: круг вокруг себя, затем ударная волна кольцами
        this.castPose(a.ms!, a.pose, a.name);
        this.hooks.emit(`tele:${id}`);
        const x = m.x, y = m.y;
        this.tele(id, "circle", x, y, a.r!, a.ms!, (p) => this.hit(p, a.mult!, "phys"), { k: "phys" });
        w.later(a.ms!, () => { if (!m.dead) w.emit({ t: "shake", k: "quake", x, y }); });
        const wave = a.wave;
        wave?.rings.forEach(([r1, r2], i) => this.tele(`${id}_wave`, "ring", x, y, r1, a.ms! + wave.delayMs * (i + 1), (p) => this.hit(p, wave.mult, "phys"), { r2, k: "phys" }));
        return true;
      }
      case "ashfall": { // Пепельный дождь: круги под героями и в случайных точках, горение
        const n = this.phase >= 1 ? a.countLate ?? a.count! : a.count!;
        const hall = this.shuffle(this.hall());
        const pts: { x: number; y: number }[] = hall.slice(0, Math.min(a.onPlayers ?? 5, n)).map((p) => ({ x: p.x, y: p.y }));
        while (pts.length < n) pts.push(this.spot(m.x, m.y, 360));
        this.castPose(CAST_OF.ashfall!, undefined, a.name);
        this.hooks.emit(`tele:${id}`);
        pts.forEach((s, i) => w.later(i * 70, () => {
          if (m.dead) return;
          this.tele(id, "circle", s.x, s.y, a.r!, a.ms!, (p) => { this.hit(p, a.mult!, k); if (a.burnMs) this.burn(p, a.burnMs, a.burnMult ?? 0.25); }, { k });
        }));
        return true;
      }
      case "rings": { // Огненные кольца: расходятся от босса, спасение — в отгоревшей полосе
        this.castPose(CAST_OF.rings!, "slam", a.name);
        this.hooks.emit(`tele:${id}`);
        const x = m.x, y = m.y;
        for (let i = 0; i < (a.count ?? 4); i++) {
          const r1 = a.innerR! + i * a.step!;
          this.tele(id, "ring", x, y, r1, (a.startMs ?? 500) * i + a.ms!, (p) => this.hit(p, a.mult!, k), { r2: r1 + a.w!, k });
        }
        return true;
      }
      case "line": { // Разлом: линия к самому дальнему герою, за ней трещина-лава
        const hall = this.hall().sort((p, q) => w.dist(q, m) - w.dist(p, m));
        if (!hall.length) return false;
        const n = this.enraged ? a.linesInEnrage ?? 2 : 1;
        this.castPose(a.ms!, "slam", a.name);
        this.hooks.emit(`tele:${id}`);
        const x = m.x, y = m.y, hw = (a.w ?? 72) / 2;
        for (const t of hall.slice(0, n)) {
          const ang = Math.atan2(t.y - y, t.x - x);
          this.tele(id, "line", x, y, a.len!, a.ms!, (p) => this.hit(p, a.mult!, k), { a: ang, w: hw, k, origin: { x, y } });
          w.later(a.ms!, () => {
            if (m.dead) return;
            w.emit({ t: "shake", k: "rift", x, y });
            const pools = a.pools ?? 6;
            for (let j = 1; j <= pools; j++) {
              const d = ((m.def.radius + 10) + (a.len! - m.def.radius - 10) * (j / pools)) - (a.poolR ?? 36) * 0.5;
              const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
              if (!walkable(w.map, px, py, 4)) continue;
              w.addHazard(m, px, py, a.poolR ?? 36, a.poolMs ?? 10_000, this.dmg * (a.poolMult ?? 0.8), "fire");
            }
          });
        }
        return true;
      }
      case "verdict": { // Приговор Хаоса: круг под каждым героем, стоящий умирает
        const hall = this.hall();
        if (!hall.length) return false;
        if (a.yell) this.yell(a.yell);
        this.castPose(CAST_OF.verdict!, "roar", a.name);
        this.hooks.emit(`tele:${id}`);
        for (const t of hall) this.tele(id, "circle", t.x, t.y, a.r!, a.ms!, (p) => { this.pct(p, a.pctHp!, k); if (a.burnMs) this.burn(p, a.burnMs, a.burnMult ?? 0.25); }, { k: "shadow" });
        return true;
      }
      case "sun": { // Солнце Хаоса: весь зал, спасает тень колонны
        if (a.yell) this.yell(a.yell);
        const ms = a.castMs ?? 4500;
        this.castPose(ms, a.pose, a.name);
        this.hooks.emit(`tele:${id}`);
        const x = m.x, y = m.y;
        this.tele(id, "circle", x, y, a.r!, ms, (p) => this.pct(p, a.pctHp!, k), { k, origin: { x, y } });
        w.later(ms, () => { if (!m.dead) w.emit({ t: "shake", k: "sun", x, y }); });
        return true;
      }
      case "summon": { // Оруженосцы Хаоса
        if (this.enraged) return false;
        this.castPose(CAST_OF.summon!, "roar", a.name);
        this.summonAdds(a.adds ?? Object.keys(RAID_ADDS));
        return true;
      }
    }
    return false;
  }

  /** Приспешники у босса: оруженосцы бросаются на лекарей, искры — на дальних. */
  private summonAdds(ids: string[]) {
    const w = this.w, m = this.m, all = this.hall();
    const healers = all.filter((p) => p.cls === "healer" || p.cls === "bloodweaver");
    for (const id of ids) {
      const def = MOBS[id], ad = RAID_ADDS[id];
      if (!def || !ad) continue;
      for (let i = 0; i < ad.count; i++) {
        const s = this.spot(m.x, m.y, 150);
        const add = new Mob(w.uid("s"), def, m.level, s);
        add.summoned = true;
        add.state = "chase";
        const pool = ad.threatOn === "healer" && healers.length ? healers : all;
        const t = pool[Math.floor(this.hooks.rand() * pool.length)];
        if (t) { add.addThreat(t.id, 200); add.targetId = t.id; }
        w.addMob(add);
        this.adds.add(add);
        w.emit({ t: "spawn", id: add.id, k: "smoke" });
      }
    }
    this.used.summon = (this.used.summon || 0) + 1;
    this.hooks.emit("adds", { n: this.adds.size });
  }

  // ---------------------------------------------------------------- цикл
  /** Пробуждение (конец этапа pull): неуязвимость снимается, реплика появления, таймеры фазы I. */
  wake() {
    this.awake = true;
    this.m.immune = false;
    this.startPhase(0, 0);
    this.berserkNext = this.hooks.berserkAt();
    this.yell(RAID_PHASES[0].yell);
    this.castPose(1800, "roar", "");
  }

  private startPhase(n: number, pauseMs: number) {
    const t = this.w.time;
    this.phase = n;
    this.m.unit.phase = n;
    this.next.clear();
    for (const id of RAID_PHASES[n].attacks) {
      const a = RAID_ATTACKS[id];
      if (!a || a.kind === "auto") continue;
      const first = id === "summon" && n === 1 ? 0.2 : a.first ?? (a.every ?? 20) * 0.5;
      this.next.set(id, t + pauseMs + first * 1000 * (n >= 3 ? RAID_BOSS.enrage.periodMul : 1));
    }
  }

  /** Новая фаза: пауза-каст в позе рёва, реплика, урон по боссу ×0.1, тряска; в IV — ярость. */
  private enterPhase(n: number) {
    const m = this.m, ph = RAID_PHASES[n];
    this.startPhase(n, ph.pauseMs);
    this.pauseUntil = this.w.time + ph.pauseMs;
    m.dmgTakenMul = 0.1;
    this.yell(ph.yell);
    this.castPose(ph.pauseMs, "roar", ph.name);
    this.w.emit({ t: "shake", k: "phase", x: m.x, y: m.y });
    if (n >= 3) {
      m.unit.buffs |= BUFF_ENRAGE;
      m.speedMul = RAID_BOSS.enrage.speedMul;
      // ярость: удар ×attackMul (World: ×1.3 при BUFF_ENRAGE); откат удара World и так режет ×0.7 — возвращаем к attackCd
      (m.def as { attackCd: number }).attackCd = RAID_BOSS.attackCd / 0.7;
      this.w.emit({ t: "buff", id: m.id, k: "enrage", ms: 0 });
    }
    const gen = this.gen;
    this.w.later(ph.pauseMs, () => { if (gen === this.gen) m.dmgTakenMul = 1; });
    this.hooks.phase(n);
    this.hooks.emit("phase", { n });
  }

  override update(_dt: number) {
    const m = this.m, w = this.w, t = w.time;
    if (!this.awake || m.dead) return;
    const hp = m.unit.hp / Math.max(1, m.unit.maxHp);
    let ph = 0;
    this.thresholds.forEach((th, i) => { if (hp <= th) ph = i + 1; });
    if (ph > this.phase) {
      this.enterPhase(this.phase + 1);
      return;
    }
    const tg = this.target();
    if (!this.casting && tg && !tg.dead) this.face = Math.atan2(tg.y - m.y, tg.x - m.x);
    if (t < this.busyUntil || t < this.pauseUntil) return;
    // берсерк: «Конец Пламени» — весь зал, повтор
    if (t >= this.berserkNext && this.berserkNext > 0) {
      const a = RAID_ATTACKS.berserk;
      this.berserkNext = t + (a.castMs ?? 5000) + (a.repeatMs ?? 6000);
      if (!this.used.berserk) { if (a.yell) this.yell(a.yell); this.hooks.emit("berserk"); }
      this.used.berserk = (this.used.berserk || 0) + 1;
      const ms = a.castMs ?? 5000;
      this.castPose(ms, "roar", a.name);
      this.tele("berserk", "circle", m.x, m.y, 2400, ms, (p) => this.pct(p, a.pctHp ?? 3, "fire"), { k: "fire" });
      w.later(ms, () => { if (!m.dead) w.emit({ t: "shake", k: "berserk", x: m.x, y: m.y }); });
      return;
    }
    if (m.state !== "chase") return;
    const due = [...this.next.entries()].filter(([, at]) => at <= t).map(([id]) => id).sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
    for (const id of due) {
      const a = RAID_ATTACKS[id];
      const ok = this.run(id);
      // не вышло (некого бить) — повтор через 1.5 с, иначе — через свой период
      this.next.set(id, t + (ok ? this.period(a) : 1500));
      if (ok) {
        this.used[id] = (this.used[id] || 0) + (a.kind === "summon" ? 0 : 1);
        break;
      }
    }
  }

  /** Гибель участника рейда: реплика не чаще раза в 12 с. */
  onPlayerDied(p: Player) {
    if (!this.awake || this.m.dead || this.w.time - this.killYellAt < KILL_YELL_MS) return;
    this.killYellAt = this.w.time;
    this.yell("kill", { name: p.name });
  }

  /** Вайп: реплика, сброс (призванные убираются, фаза 0), лужи гаснут; босс снова спит до следующего pull. */
  wipe() {
    this.yell("wipe");
    this.m.reset();
  }

  override reset() {
    super.reset();
    this.gen++;
    this.awake = false;
    this.casting = false;
    this.busyUntil = this.pauseUntil = this.berserkNext = 0;
    this.next.clear();
    this.face = Math.PI / 2;
    const m = this.m;
    m.immune = true;
    m.dmgTakenMul = 1;
    m.speedMul = 1;
    (m.def as { attackCd: number }).attackCd = RAID_BOSS.attackCd;
    m.windUntil = 0;
    m.unit.anim = Anim.Idle;
    m.wanderAt = Infinity;
    this.w.hazards = this.w.hazards.filter((h) => h.owner !== m);
    this.hooks.dangers.length = 0;
    this.hooks.cast("", 0);
  }

  override onDeath() {
    this.gen++;
    this.yell("death");
    this.w.emit({ t: "shake", k: "death", x: this.m.x, y: this.m.y });
    for (const add of this.adds) if (!add.dead) this.w.killMob(add);
    this.adds.clear();
    this.casting = false;
    this.w.hazards = this.w.hazards.filter((h) => h.owner !== this.m);
    this.hooks.dangers.length = 0;
    this.hooks.cast("", 0);
    this.m.respawnAt = Infinity;
  }
}

function dirOf(a: number): number {
  const dx = Math.cos(a), dy = Math.sin(a);
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : dy < 0 ? 1 : 0;
}
