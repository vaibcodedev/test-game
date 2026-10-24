/**
 * Умения магов: Боевой маг (mage, Сольгард) и Чернокнижник (warlock, Умбрат).
 * Данные — data/skills_mages.json (ids mg_* и wl_*), здесь — механика новых активных умений и реакции пассивок.
 * Боевой маг играет ритмом школ (огонь, лёд, молния), барьером и телепортами; Чернокнижник — проклятиями, осколками душ и призывом.
 * Хуки подключены в World.hit (outgoing, incoming, onAbsorb, beforeLethal, afterDealt, afterDamaged), killMob (onKill)
 * и castSkill (onCast, castMage); dotMult вызывается из addDot (umbrath.ts). Состояние героя — в WeakMap (в сохранения не попадает).
 * Любая область и цель проверяются по линии видимости.
 */
import { OUTLAW } from "../../../shared/factions";
import { lineClear } from "../../../shared/map";
import { petUnitId, type PetDef } from "../../../shared/pets";
import { Anim } from "../../../shared/protocol";
import { SKILLS, SUMMONS } from "../../../shared/skills";
import { segDist, summonSpot, wallEnds, wallMark } from "../../../shared/skillShape";
import { dismissPet, Pet } from "./Pet";
import type { Player } from "./Player";
import { reachable } from "./skills";
import { addDot, dotsOf, removeDots, type CastCtx } from "./umbrath";
import { applyHaste, applySlow, applyWeaken } from "./effects";
import { registerAuraHook } from "./auras";
import { World, type Actor, type HitOpts } from "./World";
import { leechMult } from "../../../shared/balance";

interface St {
  // Боевой маг
  rhythm: { school: string; n: number; until: number };
  shock: Map<string, number>;
  barrier: { until: number; absorbed: number } | null;
  escapeReady: number;
  burns: Map<string, { dmg: number; left: number; until: number }>;
  // Чернокнижник
  hex: Map<string, { until: number; pct: number }>;
  shards: number; shardUntil: number;
  metaUntil: number; metaPct: number; metaLeech: number;
  shroudReady: number; wardReady: number; wardPending: number; eternalAt: number;
  /** «Искажение времени» на самом маге: окно и прибавка скорости атаки (для значка эффекта). */
  warpUntil: number; warpHaste: number;
}
const states = new WeakMap<Player, St>();
function st(p: Player): St {
  let s = states.get(p);
  if (!s) {
    s = {
      rhythm: { school: "", n: 0, until: 0 }, shock: new Map(), barrier: null, escapeReady: 0, burns: new Map(),
      hex: new Map(), shards: 0, shardUntil: 0, metaUntil: 0, metaPct: 0, metaLeech: 0, shroudReady: 0, wardReady: 0, wardPending: 0, eternalAt: 0,
      warpUntil: 0, warpHaste: 0,
    };
    states.set(p, s);
  }
  return s;
}
// значки в рамке героя (auras.ts): стихийный ритм, осколки душ, метаморфоза, искажение времени
registerAuraHook((a, _now, aura) => {
  const s = states.get(a as Player);
  if (!s) return;
  if (s.rhythm.n > 0) aura("rhythm", s.rhythm.until, { n: s.rhythm.n });
  if (s.shards > 0) aura("shards", s.shardUntil, { n: s.shards });
  aura("meta", s.metaUntil, { v: s.metaPct });
  aura("timewarp", s.warpUntil, { v: s.warpHaste });
});
/** Кто наложил на героя «шок» (боевой маг) и «Проклятие рока» (чернокнижник): только герои-цели, сами метки — в состоянии наложившего. */
const shockedBy = new WeakMap<object, Player>(), hexedBy = new WeakMap<object, Player>();
// значки меток на герое-цели (auras.ts): шок молнии (прибавка урона мага — только с «Проводимостью») и проклятие рока
registerAuraHook((a, _now, aura) => {
  const id = (a as Actor).id;
  const m = shockedBy.get(a), until = m && !m.dead ? states.get(m)?.shock.get(id) : undefined;
  if (m && until !== undefined && rk(m, "mg_conduction")) aura("shock", until, { v: pv(m, "mg_conduction").shock, by: m });
  const h = hexedBy.get(a), hx = h && !h.dead ? states.get(h)?.hex.get(id) : undefined;
  if (hx) aura("hex", hx.until, { v: hx.pct, by: h });
});
const rk = (p: Player, id: string) => p.save.skills[id] || 0;
const pv = (p: Player, id: string) => SKILLS[id].v(Math.max(1, rk(p, id)));
const weaponAvg = (p: Player) => ((p.derived.dmgMin + p.derived.dmgMax) / 2) * p.derived.skillMult;
/** Штраф нарушителя режет и щиты (как в healers.shield). */
const outlawMul = (w: World, p: Player) => (p.outlawUntil > w.time || p.intruder ? OUTLAW.healMul : 1);

/** Школы боевых умений мага для «Стихийного ритма». */
const SCHOOL: Record<string, string> = { fireball: "fire", meteor: "fire", mg_firewall: "fire", frostnova: "frost", mg_bolt: "bolt", mg_storm: "bolt" };

function setCd(p: Player, w: World, id: string, readyIn: number) {
  p.cds.set(id, w.time + readyIn);
  p.send("cd", { id, ms: readyIn });
}
/** Враги в круге, до которых от центра есть прямая видимость. */
function foes(w: World, p: Player, x: number, y: number, r: number): Actor[] {
  return w.enemiesInCircle(p, x, y, r).filter((m) => lineClear(w.map, x, y, m.x, m.y));
}
/** «Шок» от молнии: цель 5 с получает больше урона от мага (Проводимость). */
function shock(w: World, p: Player, m: Actor) {
  st(p).shock.set(m.id, w.time + 5000);
  if (w.isPlayer(m)) shockedBy.set(m, p); // у героя-цели шок виден в списке эффектов
  w.emit({ t: "buff", id: m.id, k: "shock", ms: 500 });
}

// =====================================================================
//                         АКТИВНЫЕ УМЕНИЯ
// =====================================================================
/** undefined — умение не из этого модуля. */
export function castMage(c: CastCtx): string | null | undefined {
  const { w, p, v, def } = c;
  const t = c.liveTarget as Actor;
  const u = p.unit;
  const s = st(p);
  const range = def.range ?? 0;
  const needTarget = (): string | null => {
    if (!c.liveTarget) return "Нужна цель";
    if (w.dist(u, t) > range + w.radiusOf(t)) return "Цель слишком далеко";
    if (!lineClear(w.map, u.x, u.y, t.x, t.y)) return "Нет прямой видимости";
    return null;
  };
  const face = (a: { x: number; y: number }) => { u.dir = World.dirTo(a.x - u.x, a.y - u.y); };
  // точка ground уже прижата к дальности (с допуском) и проверена на прямую видимость в castSkill (placeSkill, shared/skillShape.ts);
  // у стены огня угол c.aim — с клиента (turn), поэтому точку не пересчитываем по углу от героя
  const pointAt = () => ({ x: c.ax, y: c.ay });
  const castAnim = () => { u.anim = Anim.Cast; w.later(400, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; }); };

  switch (c.id) {
    // ---------- Боевой маг ----------
    case "mg_bolt": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      const jumps = Math.round(v.jumps) + (rk(p, "mg_conduction") ? Math.round(pv(p, "mg_conduction").jumps) : 0);
      const hits: Actor[] = [t];
      const pts = [u.x, u.y - 12, t.x, t.y - 12];
      let cur: Actor = t;
      for (let i = 0; i < jumps; i++) {
        let best: Actor | undefined, bd = v.radius;
        for (const m of w.enemiesInCircle(p, cur.x, cur.y, v.radius)) {
          if (hits.includes(m)) continue;
          const d = w.dist(cur, m);
          if (d < bd && lineClear(w.map, cur.x, cur.y, m.x, m.y)) { bd = d; best = m; }
        }
        if (!best) break;
        hits.push(best);
        pts.push(best.x, best.y - 12);
        cur = best;
      }
      w.emit({ t: "chain", pts, k: "bolt" });
      hits.forEach((m, i) => {
        w.hit(p, m, { mult: (v.dmg / 100) * Math.pow(1 - v.falloff / 100, i), skill: true, kind: "arcane" });
        if (w.canAffect(p, m)) shock(w, p, m);
      });
      return null;
    }
    case "mg_barrier": {
      c.ok();
      if (s.barrier) explode(w, p, s.barrier);
      const amt = Math.round(((u.maxHp * v.absorb) / 100) * outlawMul(w, p));
      const was = p.shieldUntil > w.time && p.shieldAmt >= 1 ? p.shieldAmt : 0;
      p.shieldAmt = Math.max(was, Math.min(u.maxHp * 0.6, was + amt)); // потолок не урезает больший действующий щит
      p.shieldUntil = w.time + v.dur * 1000;
      p.shieldBy = p;
      const b = { until: p.shieldUntil, absorbed: 0 };
      s.barrier = b;
      w.emit({ t: "buff", id: p.id, k: "block", ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "arcane", x: u.x, y: u.y, r: 50 });
      w.later(v.dur * 1000 + 50, () => { if (s.barrier === b) explode(w, p, b); });
      return null;
    }
    case "mg_firewall": {
      const pt = pointAt();
      c.ok(); castAnim();
      // отрезок v.len поперёк угла прицела с клиента (turn), капсула ±26 + радиус цели; концы и метки огня — общие с превью (shared/skillShape.ts)
      const half = v.len / 2, { ax, ay, bx, by } = wallEnds(pt.x, pt.y, c.aim, v.len);
      for (let i = 0; i < 5; i++) {
        const q = wallMark(pt.x, pt.y, c.aim, v.len, i);
        w.emit({ t: "hazard", id: w.uid("h"), k: "fire", x: q.x, y: q.y, r: 28, ms: v.dur * 1000 });
      }
      w.emit({ t: "aoe", k: "fire", x: pt.x, y: pt.y, r: 60 });
      for (let i = 1; i <= v.dur; i++)
        w.later(i * 1000, () => {
          for (const m of w.enemiesInCircle(p, pt.x, pt.y, half + 30)) {
            if (segDist(m.x, m.y, ax, ay, bx, by) > 26 + w.radiusOf(m) || !lineClear(w.map, pt.x, pt.y, m.x, m.y)) continue;
            w.hit(p, m, { mult: v.dmg / 100, skill: true, kind: "fire" });
          }
        }, p);
      return null;
    }
    case "mg_storm": {
      const pt = pointAt();
      c.ok(); castAnim();
      const ms = v.strikes * 500;
      w.emit({ t: "tele", shape: "circle", k: "frost", x: pt.x, y: pt.y, r: v.radius, ms });
      w.emit({ t: "hazard", id: w.uid("h"), k: "storm", x: pt.x, y: pt.y, r: v.radius, ms });
      for (let i = 0; i < v.strikes; i++)
        w.later(400 + i * 500, () => {
          const list = foes(w, p, pt.x, pt.y, v.radius);
          const m = list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
          const sx = m ? m.x : pt.x + (Math.random() - 0.5) * v.radius * 1.4, sy = m ? m.y : pt.y + (Math.random() - 0.5) * v.radius;
          w.emit({ t: "chain", pts: [sx + (Math.random() - 0.5) * 24, sy - 120, sx, sy - 8], k: "bolt" });
          w.emit({ t: "aoe", k: "storm", x: sx, y: sy, r: 36 });
          if (m) { w.hit(p, m, { mult: v.dmg / 100, skill: true, kind: "arcane" }); shock(w, p, m); }
        }, p);
      return null;
    }
    case "mg_timewarp": {
      c.ok(); castAnim();
      applyHaste(w, p, v.haste, v.dur * 1000);
      s.warpUntil = w.time + v.dur * 1000;
      s.warpHaste = v.haste;
      w.emit({ t: "buff", id: p.id, k: "warp", ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "timewarp", x: u.x, y: u.y, r: v.radius });
      const pulse = () => {
        for (const m of foes(w, p, p.x, p.y, v.radius)) c.slow(m, v.slow, 700);
        const cut = (500 * v.cdr) / 100;
        for (const [id, ready] of p.cds) if (id !== c.id && ready > w.time) setCd(p, w, id, Math.max(0, ready - w.time - cut));
      };
      pulse();
      for (let i = 1; i <= Math.round(v.dur * 2); i++) w.later(i * 500, pulse, p);
      return null;
    }

    // ---------- Чернокнижник ----------
    case "wl_hex": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t); castAnim();
      const ms = (w.dist(u, t) / 700) * 1000;
      w.emit({ t: "proj", k: "shadow", from: p.id, to: t.id, tx: t.x, ty: t.y, ms });
      w.later(ms, () => {
        if (w.isDead(t) || !w.hostile(p, t) || !w.canAffect(p, t)) return;
        s.hex.set(t.id, { until: w.time + v.dur * 1000, pct: v.amp });
        if (w.isPlayer(t)) hexedBy.set(t, p); // у героя-цели проклятие рока видно в списке эффектов
        applyWeaken(w, p, t, v.weak, v.dur * 1000);
        w.emit({ t: "aoe", k: "hex", x: t.x, y: t.y, r: 46 });
        c.threat(t, 30);
      }, p);
      return null;
    }
    case "wl_siphon": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t); castAnim();
      const ms = (w.dist(u, t) / 650) * 1000;
      w.emit({ t: "proj", k: "shadow", from: p.id, to: t.id, tx: t.x, ty: t.y, ms });
      w.later(ms, () => {
        if (w.isDead(t) || !w.hostile(p, t) || !w.canAffect(p, t)) return;
        w.emit({ t: "chain", pts: [t.x, t.y - 12, p.x, p.y - 12], k: "heal" });
        // +0,5 с запаса: тик на границе срока не теряется, и «{dur} с» дают ровно {dur} тиков
        addDot(w, p, t, "curse", (weaponAvg(p) * v.tick) / 100, v.dur + 0.5, "blood");
        c.threat(t, 40);
      }, p);
      return null;
    }
    case "wl_demon": {
      const pt = pointAt();
      if (w.opts.mobs === false || p.team !== 0) return "На арене призыв недоступен";
      c.ok(); castAnim();
      w.emit({ t: "aoe", k: "shadow", x: pt.x, y: pt.y, r: 56 });
      summonDemon(w, p, pt, v.dur * 1000, v.power / 100);
      return null;
    }
    case "wl_detonate": {
      const e = needTarget(); if (e) return e;
      const list = dotsOf(w, p, t);
      if (!list.length) return "На цели нет ваших проклятий";
      c.ok(); face(t); castAnim();
      let total = 0;
      for (const d of list) total += (d.dmg * d.stacks * d.left) / 1000;
      total *= dotMult(w, p, t);
      removeDots(p, t);
      const sh = s.shardUntil > w.time ? s.shards : 0;
      s.shards = 0;
      const dmg = Math.max(1, Math.round((total * (v.mult + sh * v.shard)) / 100));
      w.emit({ t: "chain", pts: [u.x, u.y - 12, t.x, t.y - 12], k: "shadow" });
      w.emit({ t: "aoe", k: "soul", x: t.x, y: t.y, r: 58 + sh * 6 });
      w.hit(p, t, { flat: dmg, canCrit: false, kind: "shadow", skill: true, threat: 1 });
      return null;
    }
    case "wl_meta": {
      c.ok(); castAnim();
      s.metaUntil = w.time + v.dur * 1000;
      s.metaPct = v.dmg;
      s.metaLeech = v.leech;
      w.emit({ t: "buff", id: p.id, k: "meta", ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "meta", x: u.x, y: u.y, r: 80 });
      return null;
    }
  }
  return undefined;
}

/** Барьер мага разбит или истёк: «Взрывной барьер» обращает поглощённый урон в арканный взрыв. */
function explode(w: World, p: Player, b: { until: number; absorbed: number }) {
  const s = st(p);
  if (s.barrier !== b) return;
  s.barrier = null;
  w.emit({ t: "buff", id: p.id, k: "block", ms: 0 }, false); // клиент убирает пузырь барьера (ms 0); без метки умения: взрыв может случиться посреди чужого удара
  const r = rk(p, "mg_expl_barrier");
  if (!r || b.absorbed < 1 || w.gone(p)) return;
  const m = pv(p, "mg_expl_barrier");
  const dmg = Math.max(1, Math.round((b.absorbed * m.pct) / 100));
  w.emit({ t: "aoe", k: "arcane", x: p.x, y: p.y, r: m.radius });
  for (const e of foes(w, p, p.x, p.y, m.radius)) w.hit(p, e, { flat: dmg, canCrit: false, kind: "arcane", skill: true, noProc: true });
}

/** Демон-прислужник: временный питомец (данные — data/skills_mages.json → summons). */
function summonDemon(w: World, p: Player, at: { x: number; y: number }, ms: number, power: number) {
  const base = SUMMONS.wl_demon as unknown as PetDef | undefined;
  if (!base) return;
  dismissPet(w, p);
  const k = power * (1 + (rk(p, "wl_demonology") ? pv(p, "wl_demonology").pct : 0) / 100);
  const def: PetDef = { ...base, id: "wl_demon", price: 0, level: 0, hp: base.hp * k, dmg: base.dmg * k, skills: [], temp: true };
  const pet = new Pet(def, p, p.level);
  // на воде или дереве — ближайшая проходимая точка на линии к герою (общая с превью: summonSpot)
  const q = summonSpot(w.map, at.x, at.y, p.x, p.y);
  pet.unit.x = q.x; pet.unit.y = q.y;
  w.pets.set(pet.id, pet);
  w.state.mobs.set(pet.id, pet.unit);
  w.emit({ t: "spawn", id: pet.id, k: "smoke" });
  w.later(ms, () => { if (w.pets.get(pet.id) === pet) dismissPet(w, p); });
}

// =====================================================================
//                              ХУКИ
// =====================================================================
/** Умение успешно применено (после списания маны, до эффекта). */
export function onCast(w: World, p: Player, id: string, target: Actor | undefined) {
  if (p.cls === "mage") {
    const school = SCHOOL[id];
    if (school && rk(p, "mg_rhythm")) {
      const m = pv(p, "mg_rhythm"), r = st(p).rhythm;
      if (r.until <= w.time) { r.n = 0; r.school = ""; }
      if (r.school !== school) r.n = Math.min(m.max, r.n + 1);
      r.school = school;
      r.until = w.time + 6000;
      w.emit({ t: "buff", id: p.id, k: "rhythm", ms: 400 });
    }
    if (id === "blink" && rk(p, "mg_phase")) {
      const m = pv(p, "mg_phase"), x = p.x, y = p.y;
      w.emit({ t: "aoe", k: "arcane", x, y, r: m.radius });
      for (const e of foes(w, p, x, y, m.radius)) {
        w.hit(p, e, { mult: m.dmg / 100, skill: true, kind: "arcane" });
        applySlow(w, p, e, m.slow, 2000);
      }
    }
  } else if (p.cls === "warlock") {
    if (id === "wl_drain_mana" && target && rk(p, "wl_leech")) {
      const m = pv(p, "wl_leech");
      w.heal(p, Math.round((p.unit.maxHp * m.heal) / 100));
      applyWeaken(w, p, target, m.weak, 5000);
    }
    if (id === "wl_skeletons" && rk(p, "wl_demonology")) {
      const k = 1 + pv(p, "wl_demonology").pct / 100;
      w.later(80, () => {
        const pet = w.pets.get(petUnitId(p.id));
        if (!pet || pet.dead || pet.def.id !== "wl_skeleton") return;
        pet.stats.maxHp = Math.round(pet.stats.maxHp * k);
        pet.stats.dmg *= k;
        pet.unit.maxHp = pet.stats.maxHp;
        pet.unit.hp = pet.unit.maxHp;
      });
    }
  }
}

/** Общий множитель урона Чернокнижника по цели: проклятие рока, осколки душ, метаморфоза. */
function lockMult(w: World, p: Player, dst: Actor): number {
  const s = st(p);
  let k = 1;
  const hx = s.hex.get(dst.id);
  if (hx) { if (hx.until > w.time) k *= 1 + hx.pct / 100; else s.hex.delete(dst.id); }
  if (s.shards > 0) { if (s.shardUntil > w.time) k *= 1 + (s.shards * pv(p, "wl_shards").pct) / 100; else s.shards = 0; }
  if (s.metaUntil > w.time) k *= 1 + s.metaPct / 100;
  return k;
}

/** Множитель урона проклятий (addDot): общий множитель, «Злоба» и «Паутина проклятий». */
export function dotMult(w: World, p: Player, target: Actor): number {
  if (p.cls !== "warlock") return 1;
  let k = lockMult(w, p, target);
  const ml = rk(p, "wl_malice");
  if (ml) k *= 1 + pv(p, "wl_malice").pct / 100;
  const wb = rk(p, "wl_web");
  if (wb) {
    const kinds = new Set(dotsOf(w, p, target).map((d) => d.key)).size;
    if (kinds > 1) k *= 1 + ((kinds - 1) * pv(p, "wl_web").pct) / 100;
  }
  return k;
}

/** Исходящий множитель урона героя-мага или чернокнижника (кроме фиксированного урона). */
export function outgoing(w: World, src: Player, dst: Actor, o: HitOpts): number {
  if (o.flat !== undefined) return 1;
  if (src.cls === "warlock") return lockMult(w, src, dst);
  if (src.cls !== "mage") return 1;
  const s = st(src);
  let k = 1;
  if (rk(src, "mg_shatter") && (dst.slowUntil > w.time || dst.rootUntil > w.time || dst.stunUntil > w.time)) k *= 1 + pv(src, "mg_shatter").bonus / 100;
  const sh = s.shock.get(dst.id);
  if (sh !== undefined) {
    if (sh > w.time) { if (rk(src, "mg_conduction")) k *= 1 + pv(src, "mg_conduction").shock / 100; } else s.shock.delete(dst.id);
  }
  if (o.skill && s.rhythm.until > w.time && rk(src, "mg_rhythm")) k *= 1 + (s.rhythm.n * pv(src, "mg_rhythm").per) / 100;
  return k;
}

/** Проклят ли a этим чернокнижником: «Проклятие рока» или его периодические проклятия (кровотечения не в счёт). */
function cursedBy(w: World, p: Player, a: Actor): boolean {
  const hx = st(p).hex.get(a.id);
  return (!!hx && hx.until > w.time) || dotsOf(w, p, a).some((d) => d.key !== "bleed");
}

/** Входящий урон: «Мановая броня» мага, «Гнёт» чернокнижника. */
export function incoming(w: World, src: Actor, dst: Player, amount: number, _o: HitOpts): number {
  if (dst.cls === "mage") {
    const r = rk(dst, "mg_manaward");
    if (r && amount > 0 && dst.unit.mp > 0) {
      const prevented = Math.min((amount * pv(dst, "mg_manaward").pct) / 100, dst.unit.mp * 1.5);
      dst.unit.mp = Math.max(0, Math.round(dst.unit.mp - Math.ceil(prevented / 1.5)));
      amount -= prevented;
    }
  } else if (dst.cls === "warlock" && src !== dst && cursedBy(w, dst, src)) {
    const r = rk(dst, "wl_oppress");
    if (r) amount *= 1 - pv(dst, "wl_oppress").pct / 100;
  }
  return amount;
}

/** Щит героя поглотил ab урона: копим для «Взрывного барьера». */
export function onAbsorb(w: World, dst: Player, ab: number) {
  if (dst.cls !== "mage") return;
  const b = st(dst).barrier;
  if (!b || dst.shieldBy !== dst || b.until < w.time) return;
  b.absorbed += ab;
  if (dst.shieldAmt <= 0.5) explode(w, dst, b);
}

/** Смертельный удар: «Обмен душ» чернокнижника поглощает его вся мана. */
export function beforeLethal(w: World, dst: Player, v: number): number {
  if (dst.cls !== "warlock" || !rk(dst, "wl_soul_ward") || v < dst.unit.hp) return v;
  const s = st(dst);
  if (w.time < s.wardReady || dst.unit.mp < dst.unit.maxMp * 0.3) return v;
  const m = pv(dst, "wl_soul_ward");
  s.wardReady = w.time + m.icd * 1000;
  s.wardPending = m.hp;
  dst.unit.mp = 0;
  return Math.max(0, dst.unit.hp - 1);
}

/** Герой-маг или чернокнижник нанёс урон v. */
export function afterDealt(w: World, src: Player, dst: Actor, v: number, o: HitOpts, crit: boolean) {
  if (v <= 0) return;
  if (src.cls === "mage") {
    if (o.skill && o.kind === "fire" && !o.noProc && rk(src, "mg_ignite")) ignite(w, src, dst, v, crit);
    return;
  }
  if (src.cls !== "warlock") return;
  const s = st(src);
  if (s.metaUntil > w.time && s.metaLeech > 0) w.heal(src, Math.round(((v * s.metaLeech) / 100) * leechMult(src.level)), false);
  // тик проклятия (см. addDot): фиксированный урон без крита и срыва скрытности
  if (!(o.flat !== undefined && o.noBreak && o.noProc && o.canCrit === false)) return;
  if (rk(src, "wl_life_tap")) w.heal(src, Math.round(((v * pv(src, "wl_life_tap").pct) / 100) * leechMult(src.level)), false);
  if (o.kind === "blood" && rk(src, "wl_siphon")) w.heal(src, Math.round(((v * pv(src, "wl_siphon").heal) / 100) * leechMult(src.level)));
  if (rk(src, "wl_eternal") && w.time >= s.eternalAt) {
    s.eternalAt = w.time + 1000; // не чаще раза в секунду, сколько бы целей и проклятий ни тикало
    const cut = pv(src, "wl_eternal").cd * 1000;
    for (const id of ["wl_hex", "wl_detonate"]) {
      const ready = src.cds.get(id) || 0;
      if (ready > w.time) setCd(src, w, id, Math.max(0, ready - w.time - cut));
    }
  }
}

/**
 * «Воспламенение»: огненный удар умения поджигает цель на {pct}% нанесённого урона (при крите — вдвое) за {dur} с.
 * Новый поджог складывается с непрогоревшим остатком и снова делится на {dur} тиков: горение отдаёт ровно сумму поджогов,
 * а не максимальный тик на весь бой (раньше обновление брало max(тик) и продлевало срок — горение от крит-метеора шло вечно).
 */
function ignite(w: World, p: Player, dst: Actor, v: number, crit: boolean) {
  const m = pv(p, "mg_ignite"), s = st(p);
  const add = v * (m.pct / 100) * (crit ? 2 : 1);
  const until = w.time + m.dur * 1000 + 500; // +0,5 с запаса: тик на границе срока не теряется, тиков ровно {dur}
  if (w.isPlayer(dst)) dst.burnUntil = Math.max(dst.burnUntil, until); // герой-цель горит: значок «Горение» и красный оттенок для всех
  const cur = s.burns.get(dst.id);
  if (cur && cur.until > w.time && cur.left > 0) {
    cur.left += add;
    cur.dmg = Math.max(1, Math.round(cur.left / m.dur));
    cur.until = until;
    return;
  }
  const b = { dmg: Math.max(1, Math.round(add / m.dur)), left: add, until };
  s.burns.set(dst.id, b);
  w.emit({ t: "buff", id: dst.id, k: "burn", ms: 400 });
  const tick = () => {
    if (s.burns.get(dst.id) !== b || b.until <= w.time || b.left < 0.5 || w.gone(dst) || w.gone(p) || !w.hostile(p, dst)) { if (s.burns.get(dst.id) === b) s.burns.delete(dst.id); return; }
    const d = Math.max(1, Math.round(Math.min(b.dmg, b.left)));
    b.left -= d;
    w.hit(p, dst, { flat: d, canCrit: false, kind: "fire", noBreak: true, noProc: true });
    w.later(1000, tick);
  };
  w.later(1000, tick);
}

/** Герой получил урон v: «Аварийный скачок» мага, «Костяной саван» и «Обмен душ» чернокнижника. */
export function afterDamaged(w: World, src: Actor, dst: Player, v: number, _o: HitOpts) {
  if (dst.dead) return;
  const s = st(dst);
  if (dst.cls === "warlock") {
    if (s.wardPending > 0) {
      const pct = s.wardPending;
      s.wardPending = 0;
      w.heal(dst, Math.round((dst.unit.maxHp * pct) / 100)); // сразу, в этом же ударе: на 1 здоровье добьёт любой следующий
      w.emit({ t: "buff", id: dst.id, k: "soul", ms: 500 });
      w.emit({ t: "aoe", k: "soul", x: dst.x, y: dst.y, r: 80 });
    }
    if (v <= 0 || !rk(dst, "wl_shroud")) return;
    const low = dst.unit.hp < dst.unit.maxHp * 0.4;
    if (low && w.time >= s.shroudReady) {
      const m = pv(dst, "wl_shroud");
      s.shroudReady = w.time + m.icd * 1000;
      const live = dst.shieldUntil > w.time && dst.shieldAmt >= 1;
      dst.shieldAmt = (live ? dst.shieldAmt : 0) + Math.round(((dst.unit.maxHp * m.shield) / 100) * outlawMul(w, dst));
      dst.shieldUntil = Math.max(live ? dst.shieldUntil : 0, w.time + 6000); // короткий саван не обрывает чужой длинный щит
      dst.shieldBy = dst;
      w.emit({ t: "buff", id: dst.id, k: "block", ms: Math.round(dst.shieldUntil - w.time) });
      w.emit({ t: "aoe", k: "reap", x: dst.x, y: dst.y, r: 60 });
    }
    return;
  }
  if (dst.cls !== "mage" || v <= 0 || src === dst || !rk(dst, "mg_escape")) return;
  if (dst.unit.hp >= dst.unit.maxHp * 0.3 || w.time < s.escapeReady) return;
  const m = pv(dst, "mg_escape");
  const base = Math.atan2(dst.y - src.y, dst.x - src.x);
  let best: { x: number; y: number } | null = null, bs = 0;
  for (const da of [0, 0.7, -0.7, 1.4, -1.4]) {
    const a = base + da;
    const d = reachable(w, dst.x, dst.y, dst.x + Math.cos(a) * 220, dst.y + Math.sin(a) * 220, 220);
    const score = Math.hypot(d.x - src.x, d.y - src.y);
    if (Math.hypot(d.x - dst.x, d.y - dst.y) >= 60 && score > bs) { bs = score; best = d; }
  }
  if (!best) return;
  s.escapeReady = w.time + m.icd * 1000;
  w.emit({ t: "blink", id: dst.id, x0: dst.x, y0: dst.y, x1: best.x, y1: best.y });
  dst.unit.x = best.x;
  dst.unit.y = best.y;
  dst.moveTo = null;
  dst.rootUntil = dst.slowUntil = 0;
  const live = dst.shieldUntil > w.time && dst.shieldAmt >= 1;
  dst.shieldAmt = (live ? dst.shieldAmt : 0) + Math.round(((dst.unit.maxHp * m.shield) / 100) * outlawMul(w, dst));
  dst.shieldUntil = Math.max(live ? dst.shieldUntil : 0, w.time + 4000); // короткий щит скачка не обрывает чужой длинный
  dst.shieldBy = dst;
  w.emit({ t: "buff", id: dst.id, k: "shield", ms: Math.round(dst.shieldUntil - w.time) });
}

/** Убийство моба героем: «Осколки душ» и «Эпидемия» чернокнижника. */
export function onKill(w: World, killer: Player, m: Actor) {
  if (killer.cls !== "warlock" || killer.dead) return;
  const s = st(killer);
  if (rk(killer, "wl_shards")) {
    if (s.shardUntil <= w.time) s.shards = 0;
    s.shards = Math.min(5, s.shards + 1);
    s.shardUntil = w.time + 30000;
    w.emit({ t: "buff", id: killer.id, k: "soul", ms: 500 });
  }
  if (!rk(killer, "wl_pandemic")) return;
  const list = dotsOf(w, killer, m);
  if (!list.length) return;
  const n = Math.round(pv(killer, "wl_pandemic").targets);
  const near = foes(w, killer, m.x, m.y, 170).filter((e) => e !== m).sort((a, b) => w.dist(m, a) - w.dist(m, b)).slice(0, n);
  for (const e of near) {
    w.emit({ t: "chain", pts: [m.x, m.y - 12, e.x, e.y - 12], k: "poison" });
    for (const d of list) addDot(w, killer, e, d.key as "curse", d.dmg * d.stacks, d.left / 1000, d.key === "plague" ? "poison" : d.key === "agony" ? "shadow" : "blood");
  }
}
