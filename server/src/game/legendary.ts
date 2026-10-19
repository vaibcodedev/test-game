/**
 * Свойства легендарных предметов (data/legendaries.json -> _effects). Набор расширяемый: тип свойства = запись в _effects
 * (hook, параметры по ярусам, текст) + обработчик в HANDLERS. Значения уже подставлены по ярусу (shared/legendary.ts effectAt).
 * Хуки вызываются из World.hit (outgoing, absorb, beforeLethal, onHit, onDamaged) и World.killMob (onKill).
 * В PvP все дополнительные удары идут через World.hit и получают PVP_DAMAGE_MULT.
 */
import { LEGENDARIES, type LegendaryEffect } from "../../../shared/legendary";
import type { Actor, HitOpts, World } from "./World";
import { applyHaste, applyRoot, applySlow, applyStun, applyWeaken } from "./effects";
import type { Mob } from "./Mob";
import type { Player } from "./Player";

type Eff = LegendaryEffect;
const n = (e: Eff, k: string) => Number(e[k]);
const NOPROC: HitOpts = { noProc: true, canCrit: false };
const roll = (e: Eff) => Math.random() < n(e, "chance");
const hpFrac = (a: Actor) => a.unit.hp / Math.max(1, a.unit.maxHp);

/** Состояние свойств героя: перезарядки, щит «barrier», заряды «frenzy», окно «phoenix». */
interface St { cd: Record<string, number>; shield: number; shieldUntil: number; stacks: number; stacksUntil: number; reviveUntil: number }
const STATE = new WeakMap<Player, St>();
const st = (p: Player): St => {
  let s = STATE.get(p);
  if (!s) STATE.set(p, (s = { cd: {}, shield: 0, shieldUntil: 0, stacks: 0, stacksUntil: 0, reviveUntil: 0 }));
  return s;
};
/** Перезарядка свойства: true — готово (и сразу ставится заново на ms). */
function ready(w: World, p: Player, key: string, ms: number): boolean {
  const s = st(p);
  if ((s.cd[key] ?? 0) > w.time) return false;
  s.cd[key] = w.time + ms;
  return true;
}

/** Эффекты надетых легендарок игрока. */
function effects(p: Player): Eff[] {
  const out: Eff[] = [];
  for (const it of Object.values(p.save.equip)) if (it?.legendary && LEGENDARIES[it.legendary]) out.push(LEGENDARIES[it.legendary].effect);
  return out;
}

const extraHit = (w: World, src: Player, dst: Actor, flat: number, kind: HitOpts["kind"] = "phys", threat = 0.5) => {
  if (!w.isDead(dst) && w.hostile(src, dst)) w.hit(src, dst, { ...NOPROC, kind, flat: Math.max(1, Math.round(flat)), threat });
};

interface Handler {
  /** Свой удар нанёс v урона. */
  hit?(w: World, src: Player, dst: Actor, v: number, crit: boolean, e: Eff): void;
  /** Множитель своего урона до брони. */
  out?(w: World, src: Player, dst: Actor, e: Eff): number;
  /** Получен урон v от src. */
  damaged?(w: World, dst: Player, src: Actor, v: number, e: Eff): void;
  /** Поглощение входящего урона: возвращает остаток. */
  absorb?(w: World, dst: Player, amount: number, e: Eff): number;
  /** Убит моб. */
  kill?(w: World, p: Player, m: Mob, e: Eff): void;
  /** Смертельный удар по владельцу: возвращает урон, который пройдёт. */
  lethal?(w: World, dst: Player, v: number, e: Eff): number;
}

export const HANDLERS: Record<string, Handler> = {
  chain: {
    hit(w, src, dst, v, _c, e) {
      if (!roll(e)) return;
      const hit = new Set<Actor>([dst]);
      const pts = [dst.x, dst.y - 14];
      let cur: Actor = dst;
      for (let i = 0; i < n(e, "jumps"); i++) {
        let best: Actor | null = null, bd = 220;
        for (const c of w.enemiesInCircle(src, cur.x, cur.y, 220)) {
          if (hit.has(c) || !w.hostile(src, c)) continue;
          const d = w.dist(cur, c);
          if (d < bd) { bd = d; best = c; }
        }
        if (!best) break;
        hit.add(best); pts.push(best.x, best.y - 14); cur = best;
      }
      w.emit({ t: "chain", pts, k: "arcane" });
      for (const c of hit) if (c !== dst) extraHit(w, src, c, v * n(e, "mult"), "arcane");
    },
  },
  lifeburst: { hit(w, src, _d, _v, _c, e) { if (roll(e)) w.heal(src, Math.round(src.unit.maxHp * n(e, "pct"))); } },
  novacrit: {
    hit(w, src, dst, v, crit, e) {
      if (!crit) return;
      w.emit({ t: "aoe", k: "fire", x: dst.x, y: dst.y, r: n(e, "r") });
      for (const c of w.enemiesInCircle(src, dst.x, dst.y, n(e, "r"))) if (c !== dst) extraHit(w, src, c, v * n(e, "mult"), "fire");
    },
  },
  frost: {
    hit(w, src, dst, _v, _c, e) {
      if (!w.isPlayer(dst) && roll(e) && applySlow(w, src, dst, n(e, "slow"), n(e, "ms"))) w.emit({ t: "aoe", k: "frost", x: dst.x, y: dst.y, r: 30 });
    },
  },
  extra: {
    hit(w, src, dst, v, _c, e) {
      if (!roll(e)) return;
      const ms = 200;
      w.emit({ t: "proj", k: "arrow", from: src.id, to: dst.id, tx: dst.x, ty: dst.y, ms });
      w.later(ms, () => extraHit(w, src, dst, v * n(e, "mult")), src);
    },
  },
  echo: {
    hit(w, src, dst, v, _c, e) {
      if (!roll(e)) return;
      w.later(160, () => { if (w.isDead(dst)) return; w.emit({ t: "aoe", k: "arcane", x: dst.x, y: dst.y, r: 20 }); extraHit(w, src, dst, v * n(e, "mult"), "arcane"); }, src);
    },
  },
  stun: {
    hit(w, src, dst, _v, _c, e) {
      if (roll(e) && ready(w, src, "stun", n(e, "icd")) && applyStun(w, src, dst, n(e, "ms"))) w.emit({ t: "aoe", k: "holy", x: dst.x, y: dst.y, r: 26 });
    },
  },
  chains: {
    hit(w, src, dst, _v, _c, e) {
      if (roll(e) && ready(w, src, "chains", n(e, "icd")) && applyRoot(w, src, dst, n(e, "ms"))) w.emit({ t: "chain", pts: [src.x, src.y - 14, dst.x, dst.y - 10], k: "shadow" });
    },
  },
  weaken: { hit(w, src, dst, _v, _c, e) { if (roll(e)) applyWeaken(w, src, dst, n(e, "weak"), n(e, "ms")); } },
  ignite: {
    hit(w, src, dst, v, _c, e) {
      if (!roll(e)) return;
      const flat = v * n(e, "pct");
      for (let i = 1; i <= n(e, "ticks"); i++) w.later(i * 1000, () => extraHit(w, src, dst, flat, "fire", 0.3), src);
    },
  },
  blades: {
    hit(w, src, _dst, v, _c, e) {
      if (!ready(w, src, "blades", n(e, "cd"))) return;
      const near = w.enemiesInCircle(src, src.x, src.y, n(e, "r")).filter((c) => w.hostile(src, c)).sort((a, b) => w.dist(src, a) - w.dist(src, b)).slice(0, n(e, "count"));
      for (const c of near) { w.emit({ t: "chain", pts: [src.x, src.y - 18, c.x, c.y - 12], k: "holy" }); extraHit(w, src, c, v * n(e, "mult")); }
    },
  },
  meteor: {
    hit(w, src, dst, v, _c, e) {
      if (!roll(e)) return;
      const x = dst.x, y = dst.y, r = n(e, "r"), flat = v * n(e, "mult");
      w.emit({ t: "tele", shape: "circle", k: "fire", x, y, r, ms: 600 });
      w.later(600, () => { w.emit({ t: "aoe", k: "fire", x, y, r }); for (const c of w.enemiesInCircle(src, x, y, r)) extraHit(w, src, c, flat, "fire"); }, src);
    },
  },
  manasurge: {
    hit(_w, src, _d, _v, _c, e) {
      if (!roll(e) || src.unit.mp >= src.unit.maxMp) return;
      src.unit.mp = Math.min(src.unit.maxMp, src.unit.mp + src.unit.maxMp * n(e, "pct"));
      src.selfDirty = true;
    },
  },
  leech: { hit(w, src, _d, v, _c, e) { const h = Math.round(v * n(e, "pct")); if (h > 0) w.heal(src, h, false); } },
  mending: {
    hit(w, src, _d, _v, _c, e) {
      if (!roll(e)) return;
      let best: Player | null = null;
      for (const p of w.playersInCircle(src.x, src.y, n(e, "r"))) if (!p.dead && (p === src || !w.hostile(src, p)) && hpFrac(p) < 1 && (!best || hpFrac(p) < hpFrac(best))) best = p;
      if (best) { w.heal(best, Math.round(best.unit.maxHp * n(e, "pct")), true, src); w.emit({ t: "buff", id: best.id, k: "heal", ms: 600 }); }
    },
  },
  frenzy: {
    hit(w, src, _d, _v, _c, e) {
      const s = st(src);
      if (s.stacksUntil <= w.time) s.stacks = 0;
      s.stacks = Math.min(n(e, "stacks"), s.stacks + 1);
      s.stacksUntil = w.time + n(e, "ms");
      applyHaste(w, src, n(e, "haste") * s.stacks, n(e, "ms"));
    },
  },
  execute: { out(_w, _s, dst, e) { return hpFrac(dst) < n(e, "below") ? 1 + n(e, "mult") : 1; } },
  rage: { out(_w, src, _d, e) { return 1 + n(e, "mult") * (1 - hpFrac(src)); } },
  thorns: { damaged(w, dst, src, v, e) { if (w.hostile(dst, src)) w.hit(dst, src, { ...NOPROC, kind: "phys", flat: Math.max(1, Math.round(v * n(e, "pct"))), threat: 0.5 }); } },
  barrier: {
    damaged(w, dst, _s, _v, e) {
      if (hpFrac(dst) >= n(e, "below") || !ready(w, dst, "barrier", n(e, "cd"))) return;
      const s = st(dst);
      s.shield = dst.unit.maxHp * n(e, "pct");
      s.shieldUntil = w.time + n(e, "ms");
      w.emit({ t: "buff", id: dst.id, k: "block", ms: n(e, "ms") });
    },
    absorb(w, dst, amount) {
      const s = st(dst);
      if (s.shield <= 0 || s.shieldUntil <= w.time) { s.shield = 0; return amount; }
      const take = Math.min(s.shield, amount);
      s.shield -= take;
      return amount - take;
    },
  },
  chill: { damaged(w, dst, src, _v, e) { if (src !== dst && w.hostile(dst, src) && w.dist(dst, src) <= n(e, "r")) applySlow(w, dst, src, n(e, "slow"), n(e, "ms")); } },
  manashield: {
    absorb(_w, dst, amount, e) {
      if (dst.unit.mp <= 0) return amount;
      const take = Math.min(dst.unit.mp, amount * n(e, "pct"));
      dst.unit.mp -= take;
      dst.selfDirty = true;
      return amount - take;
    },
  },
  killhaste: { kill(w, p, _m, e) { applyHaste(w, p, n(e, "haste"), n(e, "ms")); w.emit({ t: "buff", id: p.id, k: "haste", ms: n(e, "ms") }); } },
  rally: {
    kill(w, p, _m, e) {
      for (const a of w.playersInCircle(p.x, p.y, n(e, "r"))) {
        if (a.dead || (a !== p && w.hostile(p, a))) continue;
        if (applyHaste(w, a, n(e, "haste"), n(e, "ms"))) w.emit({ t: "buff", id: a.id, k: "warcry", ms: n(e, "ms") });
      }
    },
  },
  soulburst: {
    kill(w, p, m, e) {
      const r = n(e, "r"), flat = m.stats.maxHp * n(e, "pct");
      w.emit({ t: "aoe", k: "shadow", x: m.x, y: m.y, r });
      for (const c of w.enemiesInCircle(p, m.x, m.y, r)) if (c !== m) extraHit(w, p, c, Math.min(flat, c.unit.maxHp * 0.25), "shadow");
    },
  },
  phoenix: {
    lethal(w, dst, v, e) {
      if (v < dst.unit.hp) return v;
      const s = st(dst);
      if (s.reviveUntil > w.time) return Math.max(0, dst.unit.hp - 1);
      if (!ready(w, dst, "phoenix", n(e, "cd"))) return v;
      s.reviveUntil = w.time + 400;
      w.later(1, () => { if (!dst.dead) { w.heal(dst, Math.round(dst.unit.maxHp * n(e, "hp"))); w.emit({ t: "aoe", k: "fire", x: dst.x, y: dst.y, r: 60 }); w.emit({ t: "buff", id: dst.id, k: "heal", ms: 900 }); } }, dst);
      return Math.max(0, dst.unit.hp - 1);
    },
  },
};

/** Множитель своего урона по dst от свойств «out» (казнь, ярость). */
export function outgoing(w: World, src: Actor, dst: Actor): number {
  if (!w.isPlayer(src)) return 1;
  let k = 1;
  for (const e of effects(src)) { const h = HANDLERS[e.type]?.out; if (h) k *= h(w, src, dst, e); }
  return k;
}

/** Игрок src нанёс v урона цели dst. */
export function onHit(w: World, src: Actor, dst: Actor, v: number, crit: boolean, o: HitOpts) {
  if (o.noProc || !w.isPlayer(src)) return;
  for (const e of effects(src)) HANDLERS[e.type]?.hit?.(w, src, dst, v, crit, e);
}

/** Входящий урон игроку: щиты свойств (мана-щит, барьер) поглощают долю. Возвращает остаток урона. */
export function absorb(w: World, dst: Actor, amount: number): number {
  if (!w.isPlayer(dst)) return amount;
  for (const e of effects(dst)) { const h = HANDLERS[e.type]?.absorb; if (h && amount > 0) amount = h(w, dst, amount, e); }
  return amount;
}

/** Игрок dst получил v урона от src. */
export function onDamaged(w: World, src: Actor, dst: Actor, v: number, o: HitOpts) {
  if (o.noProc || !w.isPlayer(dst) || w.isDead(dst) || w.isDead(src)) return;
  for (const e of effects(dst)) HANDLERS[e.type]?.damaged?.(w, dst, src, v, e);
}

/** Смертельный удар по игроку: свойства «lethal» (феникс) могут оставить 1 здоровья. */
export function beforeLethal(w: World, dst: Player, v: number): number {
  for (const e of effects(dst)) { const h = HANDLERS[e.type]?.lethal; if (h) v = h(w, dst, v, e); }
  return v;
}

/** Игрок убил моба. */
export function onKill(w: World, killer: Player, m: Mob) {
  for (const e of effects(killer)) HANDLERS[e.type]?.kill?.(w, killer, m, e);
}
