/**
 * Боссы: фазы по порогам здоровья, способности с телеграфом (игрок видит зону удара заранее), помощники.
 *  - Повелитель Пепла: огненное дыхание и сокрушение; во 2-й — метеоритный дождь; в 3-й — кольцо пламени и бесы.
 */
import { MOBS } from "../../../shared/mobs";
import { BAL, bossBal } from "../../../shared/balance";
import { Anim, BUFF_ENRAGE } from "../../../shared/protocol";
import { walkable } from "../../../shared/map";
import { Mob } from "./Mob";
import type { Player } from "./Player";
import type { World } from "./World";
import { T } from "../../../shared/texts";

type Ability = { every: number; at: number; phases: number[]; run: () => void };

export abstract class Boss {
  casting = false;
  protected phase = 0;
  protected abilities: Ability[] = [];
  protected adds = new Set<Mob>();
  protected yells: string[] = [];
  /** Уровень без подстройки (data/world.json или админка). */
  protected readonly baseLevel: number;
  /** Множитель урона способностей (телеграфы, лужи) к урону удара босса: data/balance.json bosses.<id>.mech. */
  protected get mech(): number {
    return bossBal(this.m.def.id)?.mech ?? 1;
  }

  constructor(
    protected w: World,
    protected m: Mob,
    protected arena: number,
  ) {
    this.baseLevel = m.level;
  }

  /**
   * Подстройка (data/balance.json bosses.scaleToAttacker): в бою уровень поднимается до уровня самого сильного героя на арене
   * или среди нанёсших урон — босс рассчитан на группу своего уровня, а не на героя на 50 уровней старше. Вниз — только при сбросе.
   */
  /** Подстраивать ли уровень под героев (боссы стартовых земель — нет: уровень строго по полосе зоны). */
  protected scales = true;
  private scaleUp() {
    if (!this.scales || !BAL.bosses.scaleToAttacker || this.m.dead) return;
    // вне боя — по героям на арене в обе стороны (прошёл мимо — вернулся к своему), в бою — только вверх
    const idle = this.m.state === "idle";
    let lv = idle ? this.baseLevel : this.m.level;
    for (const p of this.inArena()) if (p.level > lv) lv = p.level;
    for (const id of this.m.damageBy.keys()) { const p = this.w.players.get(id); if (p && p.level > lv) lv = p.level; }
    if (lv > this.m.level || (idle && lv !== this.m.level)) this.m.setLevel(lv);
  }

  protected abstract thresholds: number[];
  protected abstract onPhase(n: number): void;

  protected ability(every: number, phases: number[], run: () => void, firstDelay = every * 0.5) {
    this.abilities.push({ every, at: firstDelay, phases, run });
  }
  protected say(text: string) {
    this.w.emit({ t: "say", id: this.m.id, text });
  }
  protected inArena(): Player[] {
    return this.w.playersInCircle(this.m.home.x, this.m.home.y, this.arena + 120);
  }
  protected randomPlayers(n: number): Player[] {
    const list = this.inArena().sort(() => Math.random() - 0.5);
    return list.slice(0, n);
  }
  protected target(): Player | undefined {
    return this.m.targetId ? this.w.players.get(this.m.targetId) : undefined;
  }
  /** Короткая остановка на время каста. */
  protected cast(ms: number) {
    const t0 = (this.castAt = this.w.time);
    this.castUntil = t0 + ms;
    this.casting = true;
    this.m.unit.anim = Anim.Cast;
    this.m.unit.aseq = (this.m.unit.aseq + 1) % 65535;
    this.w.later(ms, () => {
      if (this.castAt !== t0) return; // каст сорван (interrupt) или уже начат новый
      this.casting = false;
      if (!this.m.dead) this.m.unit.anim = Anim.Idle;
    });
  }

  // ---------- срыв каста безмолвием (задача 148: data/cc.json boss.silence = "interrupt", effects.interruptCast) ----------
  /** Сбивается ли каст этого босса (телеграфы каста проверяют live(t0)); у прочих interrupt() ничего не делает. */
  protected interruptible = false;
  /** Начало и конец текущего каста cast(); последний срыв. */
  protected castAt = -1;
  protected castUntil = 0;
  protected cutAt = -1;
  /** Каст, начатый в t0, не сорван (t0 < 0 — не каст: всегда идёт). */
  protected live(t0: number) { return t0 < 0 || this.cutAt < t0; }
  /** Безмолвие героя по боссу: идущий каст срывается (удар телеграфа не бьёт), босс сразу свободен. true — сорван. */
  interrupt(): boolean {
    if (!this.interruptible || !this.casting || this.castUntil <= this.w.time || this.m.dead) return false;
    this.cutAt = this.w.time;
    this.castAt = -1;
    this.casting = false;
    this.m.unit.anim = Anim.Idle;
    this.w.emit({ t: "dmg", id: this.m.id, v: 0, imm: true });
    return true;
  }
  protected summon(id: string, count: number, radius = 90) {
    const def = MOBS[id];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      let x = this.m.x + Math.cos(a) * radius, y = this.m.y + Math.sin(a) * radius;
      if (!walkable(this.w.map, x, y, 10)) { x = this.m.x; y = this.m.y; }
      const add = new Mob(this.w.uid("s"), def, Math.max(1, this.m.level - 3), { x, y });
      add.summoned = true;
      add.state = "chase";
      const t = this.target();
      if (t) add.addThreat(t.id, 50);
      this.w.addMob(add);
      this.adds.add(add);
      this.w.emit({ t: "spawn", id: add.id, k: "smoke" });
    }
  }

  update(dt: number) {
    const m = this.m;
    this.scaleUp();
    if (m.state !== "chase") return;
    const hp = m.unit.hp / m.unit.maxHp;
    let ph = 0;
    this.thresholds.forEach((t, i) => { if (hp <= t) ph = i + 1; });
    if (ph > this.phase) {
      this.phase = ph;
      m.unit.phase = ph;
      if (this.yells[ph]) this.say(this.yells[ph]);
      this.onPhase(ph);
    }
    if (this.casting) return;
    for (const a of this.abilities) {
      if (!a.phases.includes(this.phase)) continue;
      a.at -= dt;
      if (a.at <= 0) {
        a.at = a.every;
        a.run();
        if (this.casting) break;
      }
    }
  }

  reset() {
    this.phase = 0;
    this.casting = false;
    this.m.unit.phase = 0;
    this.m.unit.buffs &= ~BUFF_ENRAGE;
    for (const a of this.abilities) a.at = a.every * 0.5;
    for (const add of this.adds) if (!add.dead) this.w.removeMob(add);
    this.adds.clear();
    if (this.m.level !== this.baseLevel) this.m.setLevel(this.baseLevel);
  }

  onDeath() {
    this.say(this.yells[this.yells.length - 1] ?? "...");
    for (const add of this.adds) if (!add.dead) this.w.killMob(add);
    this.adds.clear();
    this.casting = false;
  }
}

class AshLord extends Boss {
  protected thresholds = [0.66, 0.33];
  protected override yells = ["", T("srv.bosses.788"), T("srv.bosses.789"), T("srv.bosses.790")];
  constructor(w: World, m: Mob, arena: number) {
    super(w, m, arena);
    const dmg = () => this.m.stats.dmg * this.mech;
    this.interruptible = true; // дыхание, сокрушение и кольцо сбиваются безмолвием
    this.ability(8, [0, 1, 2], () => {
      const t = this.target();
      if (!t) return;
      const a = Math.atan2(t.y - m.y, t.x - m.x);
      this.cast(1100);
      const t0 = w.time;
      w.telegraph(m, "cone", m.x, m.y, 210, 1000, (p) => { if (!this.live(t0)) return; w.hit(m, p, { flat: dmg() * 2.6, kind: "fire" }); p.burnUntil = w.time + 2500; }, { a, w: 1.1, k: "fire" });
    });
    this.ability(10, [0, 1, 2], () => {
      this.cast(950);
      const t0 = w.time;
      w.telegraph(m, "circle", m.x, m.y, 105, 900, (p) => { if (this.live(t0)) w.hit(m, p, { flat: dmg() * 2, kind: "fire" }); }, { k: "fire" });
    }, 4);
    this.ability(12, [1, 2], () => {
      const targets = this.inArena();
      for (let i = 0; i < 7; i++) {
        const p = targets[i % Math.max(1, targets.length)];
        if (!p) break;
        const x = p.x + (Math.random() - 0.5) * 180, y = p.y + (Math.random() - 0.5) * 140;
        w.later(i * 120, () => w.telegraph(m, "circle", x, y, 60, 1400, (q) => w.hit(m, q, { flat: dmg() * 2.2, kind: "fire" }), { k: "fire" }));
      }
    }, 1);
    this.ability(14, [2], () => {
      this.cast(1900);
      const t0 = w.time;
      w.telegraph(m, "ring", m.x, m.y, 105, 1800, (p) => { if (!this.live(t0)) return; w.hit(m, p, { flat: dmg() * 3, kind: "fire" }); p.burnUntil = w.time + 3000; }, { r2: this.arena + 60, k: "fire" });
    }, 2);
    this.ability(20, [2], () => this.summon("imp", 2), 5);
  }
  protected onPhase(n: number) {
    if (n === 2) {
      this.m.unit.buffs |= BUFF_ENRAGE;
      this.w.emit({ t: "buff", id: this.m.id, k: "enrage", ms: 0 });
      this.summon("imp", 2);
    }
  }
}

export function createBoss(w: World, m: Mob, arena: number) {
  switch (m.def.id) {
    case "ashlord": return new AshLord(w, m, arena);
  }
  return null;
}
