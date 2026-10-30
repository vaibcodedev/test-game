/**
 * Колосс Пепельного Знамени (задача 151, docs/systems/bosses.md п.1). Числа — data/world-bosses.json bosses.colossus.mechanics.
 *  - «Сбор павших»: каждый герой, павший в круге (в том числе от PvP), — стак брони (armorPerStack, до maxStacks).
 *  - «Удар знаменем»: конус перед собой по цели (танк разворачивает от толпы); «Пепельные круги» под случайными героями.
 *  - Ф2 (ниже shards.at): отваливаются «Осколки» (count аддов), каждый разбитый снимает стак.
 *  - Ф3 (ниже waves.at): «Ярость Полей» — огненные кольца идут от центра арены, в каждом gaps брешей по gapDeg: стоящий в бреши цел.
 * Поводок и сила по толпе — у директора (director.ts); здесь только умения и стаки.
 */
import { MOBS } from "../../../shared/mobs";
import { walkable } from "../../../shared/map";
import { PLAYER_RADIUS } from "../../../shared/constants";
import { wbShardId, wbText, type WbBossDef } from "../../../shared/worldBoss";
import { Boss } from "../game/bosses";
import { Mob } from "../game/Mob";
import type { Player } from "../game/Player";
import type { World } from "../game/World";

type Num = Record<string, number>;
const DEG = Math.PI / 180;

/** Мозг мирового босса: общий интерфейс для директора. */
export interface WbBrain {
  casting: boolean;
  /** Не лечиться при возврате к дому и не сбрасываться у дома (World.updateMob): сброс здоровья решает директор. */
  holdHp: boolean;
  stacks: number;
  phaseNo(): number;
  addStack(): void;
  update(dt: number): void;
  reset(): void;
  onDeath(): void;
}

export class Colossus extends Boss implements WbBrain {
  protected thresholds: number[];
  protected override scales = false;
  /** Реплика смерти (последняя); на фазах — объявления директора. */
  protected override yells = ["", "", "", "Поля… запомнят… каждого…"];
  holdHp = true;
  stacks = 0;
  private readonly M: Record<string, Num & { name?: string }>;
  private shardsAlive = new Set<Mob>();
  private epoch = 0;

  constructor(w: World, m: Mob, arena: number, private def: WbBossDef, private hooks: { onDeath: () => void; announce: (text: string) => void }) {
    super(w, m, arena);
    this.M = def.mechanics as Record<string, Num & { name?: string }>;
    this.thresholds = [this.M.shards?.at ?? 0.6, this.M.waves?.at ?? 0.3];
    const B = this.M.bannerStrike, A = this.M.ashCircles, W = this.M.waves;
    if (B) this.ability(B.every, [0, 1, 2], () => this.bannerStrike());
    if (A) this.ability(A.every, [0, 1, 2], () => this.ashCircles(), 5);
    if (W) this.ability(W.every, [2], () => this.fireWaves(), 3);
  }

  phaseNo() { return this.phase; }
  private dmg() { return this.m.stats.dmg * this.mech; }
  /** Броня: базовая × (1 + armorPerStack · стаки). */
  private applyArmor() {
    const g = this.M.gather, base = this.m.baseStats;
    this.m.stats = { ...this.m.stats, armor: Math.round(base.armor * (1 + (g?.armorPerStack ?? 0) * this.stacks)) };
    this.m.unit.phase = this.phase; // плашка цели (стаки — в wboss)
  }
  addStack() {
    const g = this.M.gather;
    if (!g || this.m.dead || this.stacks >= g.maxStacks) return;
    this.stacks++;
    this.applyArmor();
    this.hooks.announce(wbText(this.def.texts.stack, { n: this.stacks }));
  }
  private removeStack() {
    if (this.stacks <= 0) return;
    this.stacks--;
    this.applyArmor();
    this.hooks.announce(wbText(this.def.texts.unstack, { n: this.stacks }));
  }

  private bannerStrike() {
    const t = this.target(), B = this.M.bannerStrike, m = this.m, w = this.w;
    if (!t) return;
    const a = Math.atan2(t.y - m.y, t.x - m.x), ep = this.epoch;
    this.cast(B.ms + 100);
    w.telegraph(m, "cone", m.x, m.y, B.r, B.ms, (p) => { if (ep === this.epoch) w.hit(m, p, { flat: this.dmg() * B.mult, kind: "fire" }); }, { a, w: B.angleDeg * DEG, k: "fire" });
  }
  private ashCircles() {
    const A = this.M.ashCircles, w = this.w, m = this.m, ep = this.epoch;
    for (const p of this.randomPlayers(A.count)) {
      w.telegraph(m, "circle", p.x, p.y, A.r, A.ms, (q) => { if (ep === this.epoch) w.hit(m, q, { flat: this.dmg() * A.mult, kind: "fire" }); }, { k: "fire" });
    }
  }
  /** Огненные кольца от центра арены наружу; бреши — случайные углы (одинаковые для всех колец волны). */
  private fireWaves() {
    const W = this.M.waves, w = this.w, m = this.m, ep = this.epoch;
    const cx = m.home.x, cy = m.home.y;
    const gaps = Array.from({ length: W.gaps }, () => Math.random() * Math.PI * 2);
    const half = (W.gapDeg * DEG) / 2;
    const inGap = (x: number, y: number) => {
      const a = Math.atan2(y - cy, x - cx);
      return gaps.some((g) => { let d = a - g; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return Math.abs(d) <= half; });
    };
    this.say(wbText(this.def.texts.phase3));
    w.broadcast("wboss:wave", { id: m.id, x: cx, y: cy, gaps, gapDeg: W.gapDeg, rings: W.rings, width: W.width, stepMs: W.stepMs, ms: W.ms, r: this.arena });
    for (let i = 0; i < W.rings; i++) {
      const r0 = (this.arena / W.rings) * i, r1 = r0 + W.width;
      w.later(i * W.stepMs, () => {
        if (ep !== this.epoch || m.dead) return;
        w.emit({ t: "tele", shape: "ring", k: "fire", x: cx, y: cy, r: r0, r2: r1, ms: W.ms });
        w.later(W.ms, () => {
          if (ep !== this.epoch || m.dead) return;
          for (const p of w.playersInCircle(cx, cy, r1)) {
            const d = Math.hypot(p.x - cx, p.y - cy);
            if (d + PLAYER_RADIUS * 0.5 < r0 || inGap(p.x, p.y)) continue;
            w.hit(m, p, { flat: this.dmg() * W.mult, kind: "fire" });
          }
        });
      });
    }
  }

  protected onPhase(n: number) {
    if (n === 1) {
      this.hooks.announce(wbText(this.def.texts.phase2));
      this.spawnShards();
    } else if (n === 2) this.hooks.announce(wbText(this.def.texts.phase3));
  }
  private spawnShards() {
    const S = this.M.shards, def = MOBS[wbShardId(this.def.id)];
    if (!S || !def) return;
    for (let i = 0; i < S.count; i++) {
      const a = (i / S.count) * Math.PI * 2;
      let x = this.m.x + Math.cos(a) * 110, y = this.m.y + Math.sin(a) * 110;
      if (!walkable(this.w.map, x, y, 10)) { x = this.m.x; y = this.m.y; }
      const add = new Mob(this.w.uid("s"), def, this.m.level, { x, y });
      add.summoned = true;
      add.state = "chase";
      const t = this.target();
      if (t) add.addThreat(t.id, 50);
      this.w.addMob(add);
      this.adds.add(add);
      this.shardsAlive.add(add);
      this.w.emit({ t: "spawn", id: add.id, k: "smoke" });
    }
  }
  /** Свита (для вклада). */
  isAdd(m: Mob) { return this.adds.has(m); }

  override update(dt: number) {
    for (const s of this.shardsAlive) if (s.dead) { this.shardsAlive.delete(s); this.removeStack(); }
    super.update(dt);
  }
  override reset() {
    this.epoch++;
    this.stacks = 0;
    this.shardsAlive.clear();
    super.reset();
    this.m.stats = this.m.baseStats;
  }
  override onDeath() {
    this.epoch++;
    this.shardsAlive.clear();
    super.onDeath();
    this.hooks.onDeath();
  }
  /** Герои в круге (для директора). */
  heroesIn(): Player[] {
    return this.w.playersInCircle(this.m.home.x, this.m.home.y, this.arena);
  }
}
