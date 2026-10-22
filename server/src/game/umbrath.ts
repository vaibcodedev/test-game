/**
 * Умения классов Умбрата (данные — data/skills.json). Своя механика у каждого:
 * Рыцарь смерти живёт вытягиванием жизни и притягивает цепями, Кровотворец лечит кровью врагов и своим здоровьем,
 * Тёмный следопыт проклинает и ослабляет, Чернокнижник — урон со временем, мана из врагов и скелеты,
 * Потрошитель — кровотечения, прыжки и ярость от ран (World.hit).
 */
import { PLAYER_RADIUS } from "../../../shared/constants";
import { lineClear, walkable } from "../../../shared/map";
import { petUnitId, type PetDef } from "../../../shared/pets";
import { SKILLS, SUMMONS, type SkillDef } from "../../../shared/skills";
import { Anim, type FxKind } from "../../../shared/protocol";
import { bondDur, onSacrifice, poolBonus, sacrificeCost } from "./healers";
import { dismissPet, Pet } from "./Pet";
import type { Player } from "./Player";
import { applyHeal, healPower, reachable, resolveAlly, type Ally } from "./skills";
import { bleedMods } from "./reaver";
import { dotMult } from "./mages";
import { applyHaste } from "./effects";
import { World, type Actor } from "./World";
import { leechMult } from "../../../shared/balance";

export interface CastCtx {
  w: World;
  p: Player;
  id: string;
  def: SkillDef;
  rank: number;
  v: Record<string, number>;
  liveTarget: Actor | undefined;
  targetId: string | null;
  ax: number;
  ay: number;
  aim: number;
  /** Списать ману, поставить перезарядку (всегда вызывать перед эффектом). */
  ok: () => null;
  /** Контроль и дебаффы от героя (effects.ts): нейтральный город, «Несгибаемый», слияние с живым эффектом; true — эффект лёг. */
  stun: (a: Actor, ms: number) => boolean;
  slow: (a: Actor, pct: number, ms: number) => boolean;
  root: (a: Actor, ms: number) => boolean;
  weaken: (a: Actor, pct: number, ms: number) => boolean;
  threat: (a: Actor, v: number) => void;
  isBoss: (a: Actor) => boolean;
}

// ---------- урон со временем: проклятия и кровотечения ----------
export interface Dot { stacks: number; until: number; dmg: number }
export const dots = new Map<string, Dot>();

/**
 * Периодический урон от героя по цели: тик раз в секунду, stacks — до maxStacks, повтор продлевает срок (никогда не укорачивает).
 * Не ложится, если герой выбыл или не может задеть цель (w.canAffect: нейтральный город, ушедший герой).
 */
export function addDot(w: World, p: Player, target: Actor, key: "curse" | "bleed" | "agony" | "plague", dmg: number, durS: number, kind: FxKind, maxStacks = 1) {
  if (w.gone(p) || w.isDead(target) || !w.canAffect(p, target)) return;
  const k = `${p.id}|${target.id}|${key}`;
  const cur = dots.get(k);
  const live = cur && cur.until > w.time;
  const e: Dot = live ? cur : { stacks: 0, until: 0, dmg };
  e.stacks = Math.min(maxStacks, e.stacks + 1);
  e.dmg = Math.max(e.dmg, dmg);
  e.until = Math.max(e.until, w.time + durS * 1000);
  dots.set(k, e);
  if (key === "bleed") {
    target.bleedUntil = Math.max(target.bleedUntil, e.until);
    if (w.isPlayer(target)) target.bleedStacks = e.stacks; // стаки для значка эффекта в рамке героя (auras.ts)
  } else target.curseUntil = Math.max(target.curseUntil, e.until);
  if (live) return;
  const tick = () => {
    const c = dots.get(k);
    if (c !== e || e.until <= w.time || w.gone(target) || w.gone(p) || !w.hostile(p, target)) { if (c === e) dots.delete(k); return; }
    w.hit(p, target, { flat: Math.max(1, Math.round(e.dmg * e.stacks * dotMult(w, p, target))), canCrit: false, kind, noBreak: true, noProc: true });
    w.later(1000, tick);
  };
  w.later(1000, tick);
}

/** Живые периодические эффекты героя на цели (для «Взрыва проклятий» и «Эпидемии»). */
export function dotsOf(w: World, p: Player, target: Actor): { key: string; dmg: number; stacks: number; left: number }[] {
  const out: { key: string; dmg: number; stacks: number; left: number }[] = [];
  const pre = `${p.id}|${target.id}|`;
  for (const [k, e] of dots) if (k.startsWith(pre) && e.until > w.time) out.push({ key: k.slice(pre.length), dmg: e.dmg, stacks: e.stacks, left: e.until - w.time });
  return out;
}
/**
 * После снятия эффектов (gone — самые поздние сроки снятого: проклятий и кровотечений) флаги значков цели выравниваются по оставшимся:
 * взрыв проклятий и жатва ран не должны оставлять «Проклятие» и «Кровотечение» в рамке героя-жертвы. Флаг, который держит другой источник
 * (позднее срока снятого эффекта), не трогаем.
 */
function syncDotFlags(target: Actor, gone: { curse: number; bleed: number }) {
  let curse = 0, bleed = 0, stacks = 0;
  for (const [k, e] of dots) {
    const part = k.split("|");
    if (part[1] !== target.id) continue;
    if (part[2] === "bleed") { if (e.until > bleed) { bleed = e.until; stacks = e.stacks; } } else curse = Math.max(curse, e.until);
  }
  if (gone.curse && target.curseUntil <= gone.curse) target.curseUntil = curse;
  if (gone.bleed && target.bleedUntil <= gone.bleed) {
    target.bleedUntil = bleed;
    if ("bleedStacks" in target) target.bleedStacks = stacks;
  }
}

/** Снять периодические эффекты героя с цели (после «Взрыва проклятий»). */
export function removeDots(p: Player, target: Actor) {
  const pre = `${p.id}|${target.id}|`, gone = { curse: 0, bleed: 0 };
  for (const [k, e] of [...dots]) {
    if (!k.startsWith(pre)) continue;
    if (k.endsWith("|bleed")) gone.bleed = Math.max(gone.bleed, e.until); else gone.curse = Math.max(gone.curse, e.until);
    dots.delete(k);
  }
  syncDotFlags(target, gone);
}

/** Живой эффект героя p на цели (для умений Потрошителя: server/src/game/reaver.ts). */
export function dotOf(w: World, p: Player, t: Actor, key: "curse" | "bleed" | "agony" | "plague"): Dot | undefined {
  const e = dots.get(`${p.id}|${t.id}|${key}`);
  return e && e.until > w.time ? e : undefined;
}
/** Оборвать эффект героя p на цели (тик сам остановится); значок цели уходит, если других таких эффектов на ней нет. */
export function endDot(p: Player, t: Actor, key: "curse" | "bleed" | "agony" | "plague") {
  const k = `${p.id}|${t.id}|${key}`, e = dots.get(k);
  dots.delete(k);
  if (e) syncDotFlags(t, key === "bleed" ? { curse: 0, bleed: e.until } : { curse: e.until, bleed: 0 });
}

/** Снять все периодические эффекты героев с цели (очищение). */
export function clearDots(targetId: string) {
  for (const k of [...dots.keys()]) if (k.split("|")[1] === targetId) dots.delete(k);
}

const weaponAvg = (p: Player) => ((p.derived.dmgMin + p.derived.dmgMax) / 2) * p.derived.skillMult;

/** Самый раненый союзник (или сам герой) в радиусе: для «Кровавой стрелы». */
export function mostWounded(w: World, p: Player, r: number): Ally {
  let best: Ally = { id: p.id, x: p.x, y: p.y, player: p }, br = p.unit.hp / Math.max(1, p.unit.maxHp);
  for (const q of w.playersInCircle(p.x, p.y, r)) {
    if (q === p || w.hostile(p, q) || q.faction !== p.faction) continue;
    const k = q.unit.hp / Math.max(1, q.unit.maxHp);
    if (k < br) { br = k; best = { id: q.id, x: q.x, y: q.y, player: q }; }
  }
  for (const pet of w.pets.values()) {
    if (pet.dead || pet.owner.faction !== p.faction || w.dist(pet, p) > r) continue;
    const k = pet.unit.hp / Math.max(1, pet.unit.maxHp);
    if (k < br) { br = k; best = { id: pet.id, x: pet.x, y: pet.y, pet }; }
  }
  return best;
}

/** Снаряд героя в цель с уроном по прилёту. */
function shoot(w: World, p: Player, t: Actor, k: string, speed: number, onHit: () => void) {
  const ms = (w.dist(p, t) / speed) * 1000;
  w.emit({ t: "proj", k, from: p.id, to: t.id, tx: t.x, ty: t.y, ms });
  w.later(ms, () => { if (!w.isDead(t) && w.hostile(p, t)) onHit(); });
}

export function castUmbrath(c: CastCtx): string | null {
  const { w, p, v, def } = c;
  const t = c.liveTarget as Actor;
  const u = p.unit;
  const range = def.range ?? 0;
  const needTarget = (los = true): string | null => {
    if (!c.liveTarget) return "Нужна цель";
    if (w.dist(u, t) > range + w.radiusOf(t)) return "Цель слишком далеко";
    if (los && !lineClear(w.map, u.x, u.y, t.x, t.y)) return "Нет прямой видимости";
    return null;
  };
  const face = (a: Actor) => { u.dir = World.dirTo(a.x - u.x, a.y - u.y); };
  // точка ground уже прижата к дальности (с допуском) и проверена на прямую видимость в castSkill (placeSkill, shared/skillShape.ts) — как есть
  const pointAt = () => ({ x: c.ax, y: c.ay });

  switch (c.id) {
    // ---------- Рыцарь смерти ----------
    case "dk_rune_strike": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      w.emit({ t: "aoe", k: "frost", x: t.x, y: t.y, r: 34 });
      const dealt = w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "frost" });
      c.threat(t, v.threat);
      if (dealt > 0) w.heal(p, Math.round(((dealt * v.leech) / 100) * leechMult(p.level)));
      return null;
    }
    case "dk_death_grip": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      w.emit({ t: "chain", pts: [u.x, u.y - 12, t.x, t.y - 12], k: "shadow" });
      if (!c.isBoss(t)) {
        const stop = w.radiusOf(t) + PLAYER_RADIUS + 6;
        const dest = reachable(w, t.x, t.y, u.x, u.y, Math.max(0, w.dist(u, t) - stop));
        w.emit({ t: "blink", id: t.id, x0: t.x, y0: t.y, x1: dest.x, y1: dest.y, k: "charge" });
        t.unit.x = dest.x;
        t.unit.y = dest.y;
        if (!w.isPlayer(t)) {
          let top = 0;
          for (const th of t.threat.values()) top = Math.max(top, th);
          t.threat.set(p.id, Math.max(t.threat.get(p.id) || 0, top) + 60);
          t.tauntUntil = w.time + v.taunt * 1000; t.tauntBy = p.id; t.targetId = p.id;
          if (t.state === "idle") t.state = "chase";
          w.emit({ t: "buff", id: t.id, k: "taunted", ms: v.taunt * 1000 });
        } else t.moveTo = null;
      }
      w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "shadow" });
      c.slow(t, v.slow, v.slowDur * 1000);
      p.targetId = t.id;
      p.engaged = p.approach = true;
      u.target = t.id;
      return null;
    }
    case "dk_bone_armor": {
      c.ok();
      p.shieldAmt = Math.round((u.maxHp * v.absorb) / 100);
      p.shieldUntil = w.time + v.dur * 1000;
      p.shieldBy = p;
      p.boneUntil = p.shieldUntil;
      p.boneChill = v.chill;
      w.emit({ t: "buff", id: p.id, k: "block", ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "frost", x: u.x, y: u.y, r: 46 });
      return null;
    }
    case "dk_blood_drain": {
      c.ok();
      u.anim = Anim.Cast;
      w.emit({ t: "aoe", k: "shadow", x: u.x, y: u.y, r: v.radius });
      let got = 0;
      for (const m of w.enemiesInCircle(p, u.x, u.y, v.radius)) {
        got += w.hit(p, m, { mult: v.dmg / 100, skill: true, kind: "shadow" });
        c.threat(m, v.threat);
        w.emit({ t: "chain", pts: [m.x, m.y - 12, u.x, u.y - 12], k: "heal" });
      }
      if (got > 0) w.heal(p, Math.round(((got * v.heal) / 100) * leechMult(p.level)));
      w.later(400, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      return null;
    }

    // ---------- Кровотворец ----------
    case "bw_blood_bolt": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      shoot(w, p, t, "blood", 460, () => {
        const dealt = w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "blood" });
        if (dealt <= 0) return;
        const a = mostWounded(w, p, v.radius);
        if (a.id !== p.id) w.emit({ t: "chain", pts: [t.x, t.y - 12, a.x, a.y - 12], k: "heal" });
        applyHeal(w, p, a, (dealt * v.transfuse) / 100);
      });
      return null;
    }
    case "bw_blood_bond": {
      let a = resolveAlly(w, p, c.targetId);
      if (a.id === p.id) {
        // без союзника — узы с собственным питомцем
        const pet = w.pets.get(petUnitId(p.id));
        if (!pet || pet.dead) return "Выберите союзника или призовите питомца";
        a = { id: pet.id, x: pet.x, y: pet.y, pet };
      }
      if (a.player?.dead) return "Цель мертва";
      if (w.dist(u, a) > range + PLAYER_RADIUS) return "Цель слишком далеко";
      c.ok();
      const dur = v.dur + bondDur(p);
      const until = w.time + dur * 1000;
      if (a.player) { a.player.bondBy = p; a.player.bondUntil = until; a.player.bondShare = v.share; }
      w.emit({ t: "chain", pts: [u.x, u.y - 12, a.x, a.y - 12], k: "heal" });
      w.emit({ t: "buff", id: a.id, k: "renew", ms: dur * 1000 });
      const amt = (healPower(p) * v.regen) / 100;
      for (let i = 1; i <= dur; i++)
        w.later(i * 1000, () => {
          if (p.dead) return;
          const pl = w.players.get(a.id), pet = w.pets.get(a.id);
          if (pl && !pl.dead && pl.bondBy === p && pl.bondUntil >= w.time) applyHeal(w, p, { id: pl.id, x: pl.x, y: pl.y, player: pl }, amt);
          else if (pet && !pet.dead) applyHeal(w, p, { id: pet.id, x: pet.x, y: pet.y, pet }, amt);
        });
      return null;
    }
    case "bw_sacrifice": {
      const a = resolveAlly(w, p, c.targetId);
      const cost = sacrificeCost(p, Math.round((u.maxHp * v.cost) / 100), w);
      if (u.hp <= cost) return "Слишком мало здоровья для жертвы";
      if (a.player?.dead) return "Цель мертва";
      if (a.id !== p.id && w.dist(u, a) > range + PLAYER_RADIUS) return "Цель слишком далеко";
      c.ok();
      u.hp -= cost;
      w.emit({ t: "dmg", id: p.id, v: cost, k: "blood" });
      onSacrifice(w, p, cost);
      if (a.id === p.id) {
        // без цели: кровь превращается в ману
        const mp = Math.round((u.maxMp * v.mana) / 100);
        u.mp = Math.min(u.maxMp, u.mp + mp);
        w.emit({ t: "buff", id: p.id, k: "haste", ms: 600 });
        return null;
      }
      w.emit({ t: "chain", pts: [u.x, u.y - 12, a.x, a.y - 12], k: "heal" });
      w.emit({ t: "buff", id: a.id, k: "heal", ms: 700 });
      applyHeal(w, p, a, (healPower(p) * v.heal) / 100);
      return null;
    }
    case "bw_crimson_pool": {
      const pt = pointAt();
      c.ok();
      u.anim = Anim.Cast;
      w.later(400, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      const pb = poolBonus(p), ticks = v.ticks + pb.ticks;
      w.emit({ t: "tele", shape: "circle", k: "fire", x: pt.x, y: pt.y, r: v.radius, ms: ticks * 1000 });
      const dmgMult = v.dmg / 100, heal = (healPower(p) * v.heal) / 100;
      for (let i = 1; i <= ticks; i++)
        w.later(i * 1000, () => {
          if (p.dead) return;
          w.emit({ t: "aoe", k: "fire", x: pt.x, y: pt.y, r: v.radius * 0.6 });
          for (const m of w.enemiesInCircle(p, pt.x, pt.y, v.radius)) w.hit(p, m, { mult: dmgMult, skill: true, kind: "blood", noBreak: true });
          for (const q of w.playersInCircle(pt.x, pt.y, v.radius)) if (q === p || (!w.hostile(p, q) && q.faction === p.faction)) w.heal(q, Math.round(heal * (q.unit.hp < q.unit.maxHp * 0.5 ? pb.low : 1)), true, p);
        });
      return null;
    }

    // ---------- Тёмный следопыт ----------
    case "dr_cursed_arrow": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      shoot(w, p, t, "shadow", 850, () => {
        w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "shadow" });
        addDot(w, p, t, "curse", (weaponAvg(p) * v.tick) / 100, v.dur, "shadow");
      });
      return null;
    }
    case "dr_weakening": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      shoot(w, p, t, "poison", 800, () => {
        w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "poison" });
        c.weaken(t, v.weak, v.dur * 1000);
        c.slow(t, v.slow, 3000);
      });
      return null;
    }
    case "dr_raven": {
      const e = needTarget(false); if (e) return e;
      c.ok(); face(t);
      const target = t;
      w.emit({ t: "spawn", id: p.id, k: "smoke" });
      for (let i = 0; i < v.pecks; i++)
        w.later(300 + i * v.every * 1000, () => {
          if (w.isDead(target) || p.dead || !w.hostile(p, target)) return;
          w.emit({ t: "proj", k: "shadow", from: p.id, to: target.id, tx: target.x, ty: target.y, ms: 260 });
          w.later(260, () => { if (!w.isDead(target) && w.hostile(p, target)) w.hit(p, target, { mult: v.dmg / 100, skill: true, kind: "shadow", noBreak: true }); });
        });
      return null;
    }
    case "dr_shadowmeld": {
      if (w.inTown(u.x, u.y)) return "В городе уйти в тень нельзя";
      c.ok();
      p.stealthUntil = w.time + v.dur * 1000;
      p.critNextUntil = w.time + v.dur * 1000 + 4000;
      p.slowUntil = p.rootUntil = 0;
      p.targetId = null;
      u.target = "";
      w.emit({ t: "aoe", k: "shadow", x: u.x, y: u.y, r: 50 });
      return null;
    }

    // ---------- Чернокнижник ----------
    case "wl_agony": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      shoot(w, p, t, "shadow", 480, () => {
        w.hit(p, t, { mult: v.hit / 100, skill: true, kind: "shadow" });
        addDot(w, p, t, "agony", (weaponAvg(p) * v.tick) / 100, v.dur, "shadow");
      });
      return null;
    }
    case "wl_drain_mana": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      w.emit({ t: "chain", pts: [t.x, t.y - 12, u.x, u.y - 12], k: "arcane" });
      w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "shadow" });
      const mp = Math.round((u.maxMp * v.mana) / 100);
      u.mp = Math.min(u.maxMp, u.mp + mp);
      if (w.isPlayer(t)) t.unit.mp = Math.max(0, t.unit.mp - mp);
      return null;
    }
    case "wl_skeletons": {
      const pt = pointAt();
      c.ok();
      u.anim = Anim.Cast;
      w.later(400, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      w.emit({ t: "aoe", k: "shadow", x: pt.x, y: pt.y, r: v.radius });
      for (const m of w.enemiesInCircle(p, pt.x, pt.y, v.radius)) {
        w.hit(p, m, { mult: v.dmg / 100, skill: true, kind: "shadow" });
        c.root(m, v.root * 1000);
      }
      // скелет-прислужник вместо питомца (вне арены)
      if (w.opts.mobs !== false && p.team === 0) summonSkeleton(w, p, pt, v.dur * 1000);
      return null;
    }
    case "wl_doom": {
      const pt = pointAt();
      c.ok();
      w.emit({ t: "hazard", id: w.uid("h"), k: "poison", x: pt.x, y: pt.y, r: v.radius, ms: 1500 });
      for (const m of w.enemiesInCircle(p, pt.x, pt.y, v.radius)) {
        addDot(w, p, m, "plague", (weaponAvg(p) * v.tick) / 100, v.dur, "poison");
        c.weaken(m, v.weak, v.dur * 1000);
        c.threat(m, 30);
      }
      return null;
    }

    // ---------- Потрошитель ----------
    case "rv_lacerate": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      w.emit({ t: "aoe", k: "slash", x: t.x, y: t.y, r: 34 });
      w.hit(p, t, { mult: v.dmg / 100, skill: true });
      bleed(w, p, t);
      return null;
    }
    case "rv_leap": {
      const e = needTarget(); if (e) return e;
      const d = w.dist(u, t);
      const stop = w.radiusOf(t) + PLAYER_RADIUS + 4;
      const dest = reachable(w, u.x, u.y, t.x, t.y, Math.max(0, d - stop));
      c.ok();
      w.emit({ t: "blink", id: p.id, x0: u.x, y0: u.y, x1: dest.x, y1: dest.y, k: "charge" });
      u.x = dest.x;
      u.y = dest.y;
      p.moveTo = null;
      p.targetId = t.id;
      p.engaged = p.approach = true;
      u.target = t.id;
      face(t);
      w.emit({ t: "aoe", k: "slash", x: t.x, y: t.y, r: v.radius });
      const dealt = w.hit(p, t, { mult: v.dmg / 100, skill: true });
      for (const m of w.enemiesInCircle(p, t.x, t.y, v.radius)) if (m !== t && dealt > 0) w.hit(p, m, { flat: Math.max(1, Math.round((dealt * v.splash) / 100)), canCrit: false, skill: true, noProc: true });
      return null;
    }
    case "rv_carve": {
      c.ok();
      u.aseq = (u.aseq + 1) % 65535;
      w.emit({ t: "aoe", k: "slash", x: u.x, y: u.y, r: v.radius });
      for (const m of w.enemiesInCircle(p, u.x, u.y, v.radius)) {
        w.hit(p, m, { mult: v.dmg / 100, skill: true });
        bleed(w, p, m);
      }
      return null;
    }
    case "rv_frenzy": {
      const cost = Math.round((u.hp * v.cost) / 100);
      c.ok();
      u.hp = Math.max(1, u.hp - cost);
      if (cost > 0) w.emit({ t: "dmg", id: p.id, v: cost, k: "blood" });
      p.frenzyUntil = w.time + v.dur * 1000;
      applyHaste(w, p, v.haste, v.dur * 1000);
      p.frenzyLeech = v.leech;
      w.emit({ t: "buff", id: p.id, k: "enrage", ms: v.dur * 1000 });
      return null;
    }
  }
  return "Умение недоступно";
}

/** Кровотечение «Рваной раны» (ранг из сохранения, минимум 1). */
export function bleed(w: World, p: Player, t: Actor) {
  const r = Math.max(1, p.save.skills.rv_lacerate || 0);
  const lv = SKILLS.rv_lacerate.v(r); // числа из data/skills.json
  const m = bleedMods(p); // «Глубокие раны»
  addDot(w, p, t, "bleed", (weaponAvg(p) * lv.tick * m.dmg) / 100, lv.dur + m.dur, "blood", lv.stacks + m.stacks);
}

/** Скелет-прислужник: временный питомец (данные — data/skills.json → summons). */
function summonSkeleton(w: World, p: Player, at: { x: number; y: number }, ms: number) {
  const s = SUMMONS.wl_skeleton;
  if (!s) return;
  dismissPet(w, p);
  const def: PetDef = { ...s, id: "wl_skeleton", price: 0, level: 0, skills: [], temp: true };
  const pet = new Pet(def, p, p.level);
  if (walkable(w.map, at.x, at.y, 8)) { pet.unit.x = at.x; pet.unit.y = at.y; }
  w.pets.set(pet.id, pet);
  w.state.mobs.set(pet.id, pet.unit);
  w.emit({ t: "spawn", id: pet.id, k: "smoke" });
  w.later(ms, () => { if (w.pets.get(pet.id) === pet) dismissPet(w, p); });
}
