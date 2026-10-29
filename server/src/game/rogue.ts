/**
 * Механики разбойников. Ассасин (rogue, Сольгард): яд (стаки с периодическим уроном), «за спиной», скрытность и новые умения as_*
 * (data/skills_rogues.json). Потрошитель (reaver) — server/src/game/reaver.ts; World.hit вызывает хуки только отсюда (outgoing, incoming, ...),
 * а они передают управление reaver.ts для своего класса. Состояние героя — в WeakMap (в сохранения не попадает).
 */
import { lineClear } from "../../../shared/map";
import { Dir } from "../../../shared/protocol";
import { SKILLS } from "../../../shared/skills";
import { behindSpot as behindAt, facingOf } from "../../../shared/skillShape";
import type { Player } from "./Player";
import * as rv from "./reaver";
import type { CastCtx } from "./umbrath";
import { applyHaste, applySlow, applyWeaken, cleanseCc } from "./effects";
import { registerAuraHook } from "./auras";
import type { Actor, HitOpts, World } from "./World";
import { stealthBan } from "./wards";
import { T } from "../../../shared/texts";

const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);
const rk = (p: Player, id: string) => p.save.skills[id] || 0;
const pv = (p: Player, id: string) => SKILLS[id].v(Math.max(1, rk(p, id)));

interface St { ambushUntil: number; danceUntil: number; escapeReady: number }
const states = new WeakMap<Player, St>();
function st(p: Player): St {
  let s = states.get(p);
  if (!s) { s = { ambushUntil: 0, danceUntil: 0, escapeReady: 0 }; states.set(p, s); }
  return s;
}
// значки в рамке героя (auras.ts): «Засада» и танец теней (неуязвимость)
registerAuraHook((a, _now, aura) => {
  const s = states.get(a as Player);
  if (!s) return;
  aura("as_ambush", s.ambushUntil);
  aura("dance", s.danceUntil);
});

/** Единичный вектор взгляда цели (общий с превью «Теневого шага»: facingOf). */
export function facing(a: Actor): [number, number] {
  return facingOf(a.unit.dir);
}

/** Атакующий находится в задней полусфере цели. */
export function isBehind(p: Player, t: Actor): boolean {
  const [fx, fy] = facing(t);
  const dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy) || 1;
  return (fx * dx + fy * dy) / d < -0.2;
}

/** Точка за спиной цели, куда можно встать и видеть цель; null — нет места. Общая с превью и «Теневым шагом» (shared/skillShape.ts). */
function behindSpot(w: World, t: Actor): { x: number; y: number } | null {
  const [fx, fy] = facing(t);
  return behindAt(w.map, t.x, t.y, fx, fy, w.radiusOf(t));
}

/** Накладывает/усиливает яд на цель: до 3 стаков (+«Концентрация яда»), 8 с, тик раз в секунду. */
export function applyPoison(w: World, p: Player, target: Actor, rank: number, add = 1) {
  // как у addDot: яд не ложится, если герой выбыл, цель мертва или герой не может её задеть (нейтральный город, ушедший из мира)
  if (w.gone(p) || w.isDead(target) || !w.canAffect(p, target)) return;
  const v = SKILLS.venom.v(Math.max(1, rank));
  const pot = rk(p, "as_potency") ? pv(p, "as_potency") : null;
  const d = p.derived;
  const dmg = ((d.dmgMin + d.dmgMax) / 2) * d.skillMult * (v.tick / 100) * (1 + (pot ? pot.dmg : 0) / 100);
  const cur = p.poisons.get(target.id);
  const live = cur && cur.until > w.time;
  const e = live ? cur : { stacks: 0, until: 0, dmg };
  e.stacks = Math.min(v.maxStacks + (pot ? pot.stacks : 0), e.stacks + add);
  e.dmg = Math.max(e.dmg, dmg);
  e.until = w.time + v.dur * 1000;
  p.poisons.set(target.id, e);
  if (w.isPlayer(target)) { target.venomUntil = e.until; target.venomStacks = e.stacks; } // значок яда у героя-жертвы (auras.ts)
  w.emit({ t: "aoe", k: "poison", x: target.x, y: target.y, r: 28 });
  // задача 148: на полных стаках (maxStacks) яд замедляет на slow % на slowDur с — обновляется каждым наложением
  if (e.stacks >= v.maxStacks && v.slow > 0) applySlow(w, p, target, v.slow, v.slowDur * 1000);
  if (live) return;
  const tick = () => {
    const c = p.poisons.get(target.id);
    if (c !== e || e.until <= w.time || w.gone(target) || w.gone(p) || !w.hostile(p, target)) { if (c === e) p.poisons.delete(target.id); return; }
    w.hit(p, target, { flat: Math.max(1, Math.round(e.dmg * e.stacks)), canCrit: false, kind: "poison", noBreak: true, noProc: true });
    w.later(1000, tick);
  };
  w.later(1000, tick);
}

/** «Отравитель»: шанс яда при обычной атаке. */
export function rogueProc(w: World, p: Player, target: Actor) {
  const r = p.save.skills.poisoner || 0;
  if (r && Math.random() * 100 < SKILLS.poisoner.v(r).chance) applyPoison(w, p, target, p.save.skills.venom || 1);
}

/** Живой яд героя на цели. */
const poisonOf = (w: World, p: Player, t: Actor) => { const e = p.poisons.get(t.id); return e && e.until > w.time ? e : undefined; };

/** Сократить перезарядки умений героя на sec секунд (ids — только эти, иначе все). */
function cutCds(w: World, p: Player, sec: number, ids?: string[]) {
  for (const [id, ready] of p.cds) {
    if (ready <= w.time || (ids && !ids.includes(id))) continue;
    const left = Math.max(0, ready - w.time - sec * 1000);
    p.cds.set(id, w.time + left);
    p.send("cd", { id, ms: left });
  }
}

// =====================================================================
//                         АКТИВНЫЕ УМЕНИЯ
// =====================================================================
/** undefined — умение не из этого модуля (идёт дальше в skills.ts / umbrath.ts). */
export function castRogue(c: CastCtx): string | null | undefined {
  if (c.p.cls === "reaver") return rv.castReaver(c);
  const { w, p, v, def } = c;
  const t = c.liveTarget as Actor;
  const u = p.unit;
  const range = def.range ?? 0;
  const needTarget = (): string | null => {
    if (!c.liveTarget) return T("srv.archers.49");
    if (w.dist(u, t) > range + w.radiusOf(t)) return T("srv.archers.50");
    if (!lineClear(w.map, u.x, u.y, t.x, t.y)) return T("srv.archers.51");
    return null;
  };
  const face = (a: { x: number; y: number }) => { u.dir = dirTo(a.x - u.x, a.y - u.y); };

  switch (c.id) {
    case "as_dose": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      const stacks = poisonOf(w, p, t)?.stacks ?? 0;
      p.poisons.delete(t.id); // тик яда сам оборвётся
      if (w.isPlayer(t)) t.venomUntil = 0;
      w.emit({ t: "aoe", k: "poison", x: t.x, y: t.y, r: 36 + stacks * 8 });
      w.hit(p, t, { mult: (v.dmg + v.burst * stacks) / 100, skill: true, kind: "poison", threat: 1 });
      return null;
    }
    case "as_fan": {
      const half = ((v.arc * Math.PI) / 180) / 2;
      c.ok();
      u.dir = dirTo(Math.cos(c.aim), Math.sin(c.aim));
      w.emit({ t: "cone", k: "poison", x: u.x, y: u.y, a: c.aim, r: range, w: half * 2 });
      for (let i = 0; i < 5; i++) {
        const a = c.aim - half + (half * 2 * i) / 4;
        w.emit({ t: "proj", k: "arrow", from: p.id, tx: u.x + Math.cos(a) * range * 0.9, ty: u.y + Math.sin(a) * range * 0.9, ms: 200 });
      }
      const venom = p.save.skills.venom || 1;
      // enemiesInCircle уже отсекает врагов за стенами
      for (const m of w.enemiesInCircle(p, u.x, u.y, range)) {
        const d = w.dist(u, m);
        if (d > range + w.radiusOf(m)) continue;
        let da = Math.atan2(m.y - u.y, m.x - u.x) - c.aim;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) > half + Math.asin(Math.min(1, w.radiusOf(m) / Math.max(1, d)))) continue;
        w.hit(p, m, { mult: v.dmg / 100, skill: true, threat: 1 });
        if (!w.isDead(m)) applyPoison(w, p, m, venom);
      }
      return null;
    }
    case "as_cheap": {
      const e = needTarget(); if (e) return e;
      const sneaky = p.stealthUntil > w.time || isBehind(p, t);
      c.ok(); face(t);
      w.emit({ t: "aoe", k: "slash", x: t.x, y: t.y, r: sneaky ? 44 : 32 });
      // контроль — если удар попал (поглощённый щитом — тоже); промах (уклонение, нейтральный город) — без контроля
      if (!w.hitEx(p, t, { mult: v.dmg / 100, skill: true, threat: 1 }).landed || w.isDead(t)) return null;
      const ms = (v.stun + (sneaky ? v.bonus : 0)) * 1000;
      if (c.isBoss(t)) c.stun(t, ms, { bossSlow: v.bslow }); // на боссе — замедление (data/cc.json boss)
      else if (c.stun(t, ms)) w.emit({ t: "buff", id: t.id, k: "stun", ms: t.stunUntil - w.time });
      return null;
    }
    case "as_smoke": {
      if (w.inTown(u.x, u.y)) return T("srv.rogue.135");
      { const ban = stealthBan(w, p); if (ban) return ban; } // «Раскрыт» оберегом (wards.ts)
      c.ok();
      w.emit({ t: "aoe", k: "shadow", x: u.x, y: u.y, r: v.radius });
      w.emit({ t: "hazard", id: w.uid("h"), k: "shadow", x: u.x, y: u.y, r: v.radius, ms: 2500 });
      for (const m of w.enemiesInCircle(p, u.x, u.y, v.radius)) {
        applyWeaken(w, p, m, v.weak, v.dur * 1000);
        if (!w.isPlayer(m)) m.threat.delete(p.id);
      }
      p.stealthUntil = w.time + v.hide * 1000;
      p.targetId = null;
      u.target = "";
      p.moveTo = null;
      return null;
    }
    case "as_dance": {
      if (!w.enemiesInCircle(p, u.x, u.y, v.radius).length) return T("srv.rogue.136");
      c.ok();
      const hops = Math.round(v.hops), gap = 260, s = st(p);
      s.danceUntil = w.time + hops * gap + 150;
      p.castUntil = Math.max(p.castUntil, s.danceUntil);
      w.castBar(p, hops * gap + 150, T("srv.rogue.804"));
      p.moveTo = null;
      w.emit({ t: "aoe", k: "shadow", x: u.x, y: u.y, r: 50 });
      let last: Actor | undefined, n = 0;
      const end = () => { s.danceUntil = 0; p.castUntil = Math.min(p.castUntil, w.time); w.castBar(p, 0); };
      const hop = () => {
        if (p.dead || p.stunUntil > w.time || n >= hops) return end();
        const list = w.enemiesInCircle(p, u.x, u.y, v.radius);
        const cand = list.filter((m) => m !== last);
        const pool = cand.length ? cand : list;
        let m: Actor | undefined, bd = Infinity;
        for (const q of pool) { const d = w.dist(u, q); if (d < bd) { bd = d; m = q; } }
        if (!m) return end();
        const dest = behindSpot(w, m);
        if (dest) {
          w.emit({ t: "blink", id: p.id, x0: u.x, y0: u.y, x1: dest.x, y1: dest.y, k: "shadow" });
          u.x = dest.x;
          u.y = dest.y;
        }
        p.targetId = m.id;
        p.engaged = p.approach = true;
        u.target = m.id;
        face(m);
        u.aseq = (u.aseq + 1) % 65535;
        if (n === hops - 1) p.critNextUntil = w.time + 400;
        w.emit({ t: "aoe", k: "slash", x: m.x, y: m.y, r: 40 });
        w.hit(p, m, { mult: v.dmg / 100, skill: true, threat: 1 });
        last = m;
        n++;
        if (n < hops) w.later(gap, hop); else w.later(150, end);
      };
      hop();
      return null;
    }
  }
  return undefined;
}

// =====================================================================
//                              ХУКИ
// =====================================================================
/** «Засада»: герой вышел из скрытности — короткий бонус урона и скорости атаки. */
function markAmbush(w: World, p: Player) {
  if (!rk(p, "as_ambush")) return;
  const m = pv(p, "as_ambush"), s = st(p);
  s.ambushUntil = w.time + m.dur * 1000;
  applyHaste(w, p, m.haste, m.dur * 1000);
  w.emit({ t: "buff", id: p.id, k: "haste", ms: m.dur * 1000 });
}

/** Умение применено (ok() в castSkill); wasStealth — герой был скрыт до применения. */
export function onCast(w: World, p: Player, id: string, wasStealth: boolean) {
  if (p.cls === "rogue" && wasStealth && id !== "stealth" && id !== "as_smoke") markAmbush(w, p);
}

/** Удар героя прерывает скрытность (World.hit, до обнуления stealthUntil). */
export function onBreak(w: World, p: Player) {
  if (p.cls === "rogue" && p.stealthUntil > w.time) markAmbush(w, p);
}

/** Бонус шанса крита (доля) для удара src по dst. */
export function critBonus(w: World, src: Player, dst: Actor): number {
  if (src.cls === "reaver") return rv.critBonus(w, src, dst);
  if (src.cls === "rogue" && rk(src, "as_weakpoint") && poisonOf(w, src, dst)) return pv(src, "as_weakpoint").crit / 100;
  return 0;
}

/** Исходящий множитель обычного урона (не фиксированного). */
export function outgoing(w: World, src: Player, dst: Actor, o: HitOpts): number {
  if (o.flat !== undefined) return 1;
  if (src.cls === "reaver") return rv.outgoing(w, src, dst, o);
  if (src.cls !== "rogue") return 1;
  let k = 1;
  if (st(src).ambushUntil > w.time && rk(src, "as_ambush")) k *= 1 + pv(src, "as_ambush").dmg / 100;
  if (rk(src, "as_flank") && dst.targetId !== src.id) k *= 1 + pv(src, "as_flank").dmg / 100;
  return k;
}

/** «Танец клинков» (as_dance): полная неуязвимость на время танца — для World.isImmune (удары — промах, контроль не ложится). */
export function immune(w: World, p: Player): boolean {
  return p.cls === "rogue" && (states.get(p)?.danceUntil ?? 0) > w.time;
}

/** Входящий урон героя-разбойника (после других модификаторов): только частичное снижение; неуязвимость — World.isImmune. */
export function incoming(w: World, src: Actor, dst: Player, amount: number): number {
  if (dst.cls === "reaver") return rv.incoming(w, src, dst, amount);
  return amount;
}

/** Смертельный удар по герою. */
export function beforeLethal(w: World, dst: Player, v: number): number {
  return dst.cls === "reaver" ? rv.beforeLethal(w, dst, v) : v;
}

/** Герой получил урон v (после applyDamage). */
export function afterDamaged(w: World, src: Actor, dst: Player, v: number) {
  if (dst.cls === "reaver") return rv.afterDamaged(w, src, dst, v);
  if (dst.cls !== "rogue" || dst.dead || v <= 0 || src === dst || !rk(dst, "as_escape")) return;
  const s = st(dst), u = dst.unit;
  const m = pv(dst, "as_escape");
  if (u.hp >= (u.maxHp * m.hp) / 100 || w.time < s.escapeReady || w.inTown(u.x, u.y) || stealthBan(w, dst)) return;
  s.escapeReady = w.time + m.icd * 1000;
  dst.stealthUntil = w.time + m.dur * 1000;
  cleanseCc(dst, ["stun", "root", "slow"]); // задача 148: уход в тень срывает и оглушение
  dst.targetId = null;
  u.target = "";
  w.heal(dst, Math.round((u.maxHp * m.heal) / 100));
  w.emit({ t: "aoe", k: "shadow", x: u.x, y: u.y, r: 54 });
}

/** Герой нанёс урон v. */
export function afterDealt(w: World, src: Player, dst: Actor, v: number, o: HitOpts) {
  if (src.cls === "reaver") rv.afterDealt(w, src, dst, v, o);
}

/** Герой уклонился от удара src («Контрудар»). */
export function onDodge(w: World, dst: Player, _src: Actor) {
  if (dst.cls !== "rogue" || !rk(dst, "as_riposte")) return;
  const m = pv(dst, "as_riposte");
  dst.critNextUntil = w.time + m.dur * 1000;
  cutCds(w, dst, m.cd, ["shadowstep"]);
  w.emit({ t: "buff", id: dst.id, k: "haste", ms: 500 });
}

/** Убийство моба героем: «Охотник за головами», «Чумная кровь», «Резня». */
export function onKill(w: World, killer: Player, m: Actor) {
  if (killer.cls === "reaver") return rv.onKill(w, killer);
  if (killer.cls !== "rogue") return;
  if (rk(killer, "as_hunter")) {
    const h = pv(killer, "as_hunter");
    cutCds(w, killer, h.cd);
    killer.unit.mp = Math.min(killer.unit.maxMp, killer.unit.mp + (killer.unit.maxMp * h.mana) / 100);
  }
  const e = poisonOf(w, killer, m);
  if (e && rk(killer, "as_plague")) {
    const pl = pv(killer, "as_plague");
    killer.poisons.delete(m.id);
    const venom = killer.save.skills.venom || 1;
    const near = w.enemiesInCircle(killer, m.x, m.y, pl.radius).filter((a) => a !== m && !w.isDead(a)).sort((a, b) => w.dist(a, m) - w.dist(b, m));
    for (const a of near.slice(0, Math.round(pl.n))) {
      w.emit({ t: "chain", pts: [m.x, m.y - 12, a.x, a.y - 12], k: "poison" });
      applyPoison(w, killer, a, venom, e.stacks);
    }
  }
}
