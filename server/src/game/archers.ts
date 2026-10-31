/**
 * Умения лучников: Егерь (ranger, Сольгард) и Тёмный следопыт (darkranger, Умбрат).
 * Данные — data/skills_archers.json (ids hr_* и dr_*; первые четыре dr_* — data/skills.json), здесь — механика новых активных умений
 * и реакции пассивок. Хуки подключены в World.hit (outgoing, afterDealt, afterDamaged), World.killMob (onKill) и castSkill (onCast).
 * Егерь — позиция и дистанция: стойка, ловушки, метка, зверь, подсечка. Следопыт — проклятия (addDot из umbrath.ts), тень и вороны.
 * Все выстрелы проверяют прямую видимость (lineClear). Состояние героя — в WeakMap (в сохранения не попадает).
 */
import { lineClear, walkable } from "../../../shared/map";
import { petUnitId, sumUnitId, type PetDef } from "../../../shared/pets";
import { Anim, Dir } from "../../../shared/protocol";
import { SKILLS, SUMMONS } from "../../../shared/skills";
import { NO_LOS, RAY_MIN, rayLen, trapErr, trapRadius as trapRadiusOf } from "../../../shared/skillShape";
import { anyPetOf, dismissPet, Pet } from "./Pet";
import type { Player } from "./Player";
import { addDot, dotOf, endDot, type CastCtx } from "./umbrath";
import { applyHaste, applyRoot, applySlow, applyWeaken } from "./effects";
import { noteAuraSource, registerAuraHook } from "./auras";
import type { Actor, HitOpts, World } from "./World";
import { stealthBan } from "./wards";
import { leechMult } from "../../../shared/balance";
import { T } from "../../../shared/texts";

interface St {
  /** «Стойка стрелка»: где и с какого момента стоит герой. */
  px: number; py: number; since: number;
  /** «Метка охотника». */
  markId: string; markUntil: number; markPct: number; markHop: number;
  /** «Ловкий отскок»: бонус следующему выстрелу. */
  rollUntil: number; rollPct: number;
  /** «Верный ворон». */
  ravenReady: number;
  /** «Засада» и «Мастер теней»: окно после «Ухода в тень». */
  ambushUntil: number; ambushDst: string; meldUntil: number;
  /** «Тень спасения». */
  vanishReady: number;
  /** «Добыча»: следующее срабатывание не раньше. */
  preyReady: number;
  /** Цель, которую только что задел капкан, до какого времени (другие капканы героя её не трогают). */
  trapHit: WeakMap<Actor, number>;
  /** «Ураганный огонь»: стрельба идёт до этого момента (для значка эффекта). */
  barrageUntil: number;
}
const states = new WeakMap<Player, St>();
/** Идёт «Взрыв проклятий»: его урон не считается тиком проклятия (не лечит «Усилением проклятий»). */
let bursting = false;
function st(p: Player): St {
  let s = states.get(p);
  if (!s) {
    s = { px: 0, py: 0, since: 0, markId: "", markUntil: 0, markPct: 0, markHop: 0, rollUntil: 0, rollPct: 0, ravenReady: 0, ambushUntil: 0, ambushDst: "", meldUntil: 0, vanishReady: 0, preyReady: 0, trapHit: new WeakMap(), barrageUntil: 0 };
    states.set(p, s);
  }
  return s;
}
// значки в рамке героя (auras.ts): окна «Ловкого отскока», «Засады» и «Мастера теней», «Ураганный огонь», «Стойка стрелка» (пока егерь стоит)
registerAuraHook((a, now, aura) => {
  const p = a as Player, s = states.get(p);
  if (!s) return;
  aura("trickroll", s.rollUntil, { v: s.rollPct });
  aura("dr_ambush", s.ambushUntil);
  aura("meld", s.meldUntil);
  aura("barrage", s.barrageUntil);
  if (p.cls === "ranger" && rk(p, "hr_steady") && now - s.since >= 1000) aura("steady", Infinity, { v: pv(p, "hr_steady").dmg });
});
/** Кто метит героя «Меткой охотника» (только герои-цели; сама метка — в состоянии охотника). */
const huntedBy = new WeakMap<object, Player>();
// значок метки на герое-цели (auras.ts): охотник бьёт меченого сильнее; метка живёт, пока охотник жив и не перенёс её на другого
registerAuraHook((a, _now, aura) => {
  const h = huntedBy.get(a), hs = h && !h.dead ? states.get(h) : undefined;
  if (hs && hs.markId === (a as Actor).id) aura("hunter_mark", hs.markUntil, { v: hs.markPct, by: h });
});
const rk = (p: Player, id: string) => p.save.skills[id] || 0;
const pv = (p: Player, id: string) => SKILLS[id].v(Math.max(1, rk(p, id)));
const isArcher = (p: Player) => p.cls === "ranger" || p.cls === "darkranger";
const weaponAvg = (p: Player) => ((p.derived.dmgMin + p.derived.dmgMax) / 2) * p.derived.skillMult;
const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function setCd(p: Player, w: World, id: string, readyInMs: number) {
  p.cds.set(id, w.time + readyInMs);
  p.send("cd", { id, ms: readyInMs });
}
/** Сократить все активные перезарядки героя на sec секунд. */
function cutCooldowns(w: World, p: Player, sec: number) {
  for (const [id, ready] of p.cds) if (ready > w.time) setCd(p, w, id, Math.max(0, ready - w.time - sec * 1000));
}
/** Снаряд героя в цель с уроном по прилёту (цель могла погибнуть или стать недоступной). */
function shoot(w: World, p: Player, t: Actor, k: string, speed: number, onHit: () => void) {
  const ms = (w.dist(p, t) / speed) * 1000;
  w.emit({ t: "proj", k, from: p.id, to: t.id, tx: t.x, ty: t.y, ms });
  // owner: стрела пропадает, если стрелок погиб или ушёл из мира, пока она летела
  w.later(ms, () => { if (!w.isDead(t) && w.hostile(p, t)) onHit(); }, p);
}

// ---------- проклятия (общая механика с umbrath.ts) ----------
const curseOf = (w: World, p: Player, t: Actor) => dotOf(w, p, t, "curse");
/** Сила тика «Проклятой стрелы» героя (по её рангу, минимум 1). */
const cursedTick = (p: Player) => (weaponAvg(p) * SKILLS.dr_cursed_arrow.v(Math.max(1, rk(p, "dr_cursed_arrow"))).tick) / 100;
/** Наложить проклятие: тик dmg в секунду на durS секунд (+ «Усиление проклятий»). */
function applyCurse(w: World, p: Player, t: Actor, dmg: number, durS: number) {
  const extra = rk(p, "dr_curse_power") ? pv(p, "dr_curse_power").dur : 0;
  addDot(w, p, t, "curse", dmg, durS + extra, "shadow");
}

// ---------- ловушки Егеря ----------
interface Trap { x: number; y: number; r: number; dmg: number; root: number; until: number; refund: number; alive: boolean; owner: Player }
const traps = new WeakMap<World, Trap[]>();

/** Радиус срабатывания нового капкана героя: ранг капкана + «Ловец» (plus в data/skills_aim.json) — тот же, что у превью (shared/skillShape.ts). */
const trapRadius = (p: Player, rank: number) => trapRadiusOf(rank, p.save.skills);
/** Живые капканы героя (их видит и превью: клиент следит за своими по fx). */
const liveTraps = (w: World, p: Player) => (traps.get(w) ?? []).filter((t) => t.owner === p && t.alive && t.until > w.time);
/** В точке уже стоит капкан героя или он пересёкся бы с новым (капканы друг на друге не копятся). */
function trapCrowded(w: World, p: Player, x: number, y: number, rank: number) {
  const r = trapRadius(p, rank);
  return liveTraps(w, p).some((t) => Math.hypot(t.x - x, t.y - y) < r + t.r);
}

function placeTrap(w: World, p: Player, x: number, y: number, trapRank: number) {
  if (trapCrowded(w, p, x, y, trapRank)) return;
  const v = SKILLS.hr_trap.v(Math.max(1, trapRank));
  const tm = rk(p, "hr_trapper") ? pv(p, "hr_trapper") : null;
  const all = (traps.get(w) ?? []).filter((t) => t.alive && t.until > w.time);
  traps.set(w, all);
  const mine = all.filter((t) => t.owner === p);
  while (mine.length >= v.cap + (tm ? tm.cap : 0)) mine.shift()!.alive = false;
  const trap: Trap = { x, y, r: trapRadius(p, trapRank), dmg: v.dmg, root: v.root, until: w.time + v.dur * 1000, refund: tm ? tm.refund : 0, alive: true, owner: p };
  all.push(trap);
  w.emit({ t: "aoe", k: "phys", x, y, r: 26 });
  const s = st(p);
  let nextShow = 0;
  const tick = () => {
    if (!trap.alive || trap.until <= w.time || w.gone(p)) { trap.alive = false; return; }
    if (w.time >= nextShow) {
      nextShow = w.time + 7500;
      w.emit({ t: "hazard", id: w.uid("h"), k: "holy", x, y, r: trap.r, ms: 8000 });
    }
    // цель, которую только что задел другой капкан героя (она в корнях), не трогаем: удары капканов не складываются
    const m = w.enemiesInCircle(p, x, y, trap.r).find((a) => !w.isDead(a) && !w.stealthed(a) && (s.trapHit.get(a) ?? 0) <= w.time);
    if (!m) return void w.later(250, tick);
    trap.alive = false;
    s.trapHit.set(m, w.time + trap.root * 1000 + 500);
    w.emit({ t: "aoe", k: "phys", x, y, r: 52 });
    w.emit({ t: "buff", id: m.id, k: "weak", ms: 500 });
    // бонус «Ловкого отскока» достаётся следующему выстрелу: удар капкана его не получает и не тратит
    const roll = s.rollUntil;
    s.rollUntil = 0;
    const { landed } = w.hitEx(p, m, { mult: trap.dmg / 100, skill: true });
    s.rollUntil = roll;
    // контроль ложится, если удар попал (поглощённый щитом — тоже); промах (уклонение, город) — без корней
    if (landed && !w.isDead(m)) {
      applyRoot(w, p, m, trap.root * 1000, { bossSlow: 50 }); // на боссе — замедление (data/cc.json boss)
    }
    if (trap.refund) {
      const ready = p.cds.get("hr_trap") || 0;
      if (ready > w.time) setCd(p, w, "hr_trap", Math.max(0, ready - w.time - trap.refund * 1000));
    }
  };
  tick();
}

// ---------- метка охотника ----------
function setMark(w: World, p: Player, t: Actor, pct: number, ms: number, hop: number) {
  const s = st(p);
  s.markId = t.id; s.markUntil = w.time + ms; s.markPct = pct; s.markHop = hop;
  if (w.isPlayer(t)) huntedBy.set(t, p); // у героя-цели метка видна в списке эффектов
  const id = t.id;
  const pulse = () => {
    if (s.markId !== id || s.markUntil <= w.time || w.isDead(t)) return;
    w.emit({ t: "buff", id, k: "taunted", ms: 700 });
    w.later(1500, pulse);
  };
  pulse();
}
const markedActor = (w: World, p: Player): Actor | undefined => {
  const s = st(p);
  return s.markId && s.markUntil > w.time ? w.actor(s.markId) : undefined;
};

/** Питомец (или зверь) героя рядом. */
function petNear(w: World, p: Player) {
  const pet = anyPetOf(w, p);
  return pet && !pet.dead && w.dist(pet, p) <= 450 ? pet : undefined;
}

/** Дикий зверь «Зова зверя»: временный питомец вместо обычного (данные — summons.hr_beast). */
function summonBeast(w: World, p: Player, ms: number) {
  const s = SUMMONS.hr_beast;
  if (!s) return;
  dismissPet(w, p, sumUnitId(p.id, "hr_beast"));
  const def: PetDef = { ...s, id: "hr_beast", price: 0, level: 0, skills: [], temp: true };
  const pet = new Pet(def, p, p.level);
  w.pets.set(pet.id, pet);
  w.state.mobs.set(pet.id, pet.unit);
  w.emit({ t: "spawn", id: pet.id, k: "nature" });
  w.later(ms, () => { if (w.pets.get(pet.id) === pet) dismissPet(w, p, pet.id); });
}

// =====================================================================
//                         АКТИВНЫЕ УМЕНИЯ
// =====================================================================
/** undefined — умение не из этого модуля. */
export function castArcher(c: CastCtx): string | null | undefined {
  const { w, p, v, def } = c;
  const t = c.liveTarget as Actor;
  const u = p.unit;
  const s = st(p);
  const range = def.range ?? 0;
  const needTarget = (los = true): string | null => {
    if (!c.liveTarget) return T("srv.archers.49");
    if (w.dist(u, t) > range + w.radiusOf(t)) return T("srv.archers.50");
    if (los && !lineClear(w.map, u.x, u.y, t.x, t.y)) return T("srv.archers.51");
    return null;
  };
  const face = (a: { x: number; y: number }) => { u.dir = dirTo(a.x - u.x, a.y - u.y); };
  // точка ground уже прижата к дальности (с допуском) и проверена на прямую видимость в castSkill (placeSkill, shared/skillShape.ts)
  const pointAt = () => ({ x: c.ax, y: c.ay });

  switch (c.id) {
    // ---------- Егерь ----------
    case "hr_trap": {
      // город, проходимость, соседний капкан — общие правила с превью (shared/skillShape.ts trapErr)
      const pt = pointAt();
      const err = trapErr(w.map, pt.x, pt.y, trapRadius(p, c.rank), liveTraps(w, p));
      if (err) return err;
      c.ok();
      u.anim = Anim.Cast;
      w.later(300, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      placeTrap(w, p, pt.x, pt.y, c.rank);
      return null;
    }
    case "hr_mark": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      shoot(w, p, t, "arrow", 1000, () => {
        w.emit({ t: "aoe", k: "holy", x: t.x, y: t.y, r: 34 });
        setMark(w, p, t, v.bonus, v.dur * 1000, v.hop);
      });
      return null;
    }
    case "hr_pierce": {
      // луч до первой стены по углу прицела с клиента — та же функция, что у превью (placeSkill уже отказал, если луч короче RAY_MIN)
      const len = rayLen(w.map, u.x, u.y, c.aim, range);
      if (len < RAY_MIN) return NO_LOS;
      c.ok();
      const cx = Math.cos(c.aim), cy = Math.sin(c.aim);
      const ex = u.x + cx * len, ey = u.y + cy * len;
      u.dir = dirTo(cx, cy);
      const speed = 1100;
      w.emit({ t: "proj", k: "arrow", from: p.id, tx: ex, ty: ey, ms: (len / speed) * 1000 });
      const hits: { m: Actor; along: number }[] = [];
      for (const m of w.enemiesInCircle(p, u.x, u.y, len + 40)) {
        if (w.stealthed(m)) continue;
        const dx = m.x - u.x, dy = m.y - u.y;
        const along = dx * cx + dy * cy, perp = Math.abs(dx * cy - dy * cx);
        // v.width — полная ширина коридора (как у «Метнуть топор»)
        if (along < 0 || along > len + w.radiusOf(m) || perp > w.radiusOf(m) + v.width / 2) continue;
        hits.push({ m, along });
      }
      for (const h of hits) {
        const m = h.m;
        w.later((h.along / speed) * 1000, () => {
          if (w.isDead(m) || !w.hostile(p, m)) return;
          const held = m.rootUntil > w.time || m.stunUntil > w.time;
          w.emit({ t: "aoe", k: "phys", x: m.x, y: m.y, r: 26 });
          w.hit(p, m, { mult: (v.dmg / 100) * (held ? 1 + v.rootBonus / 100 : 1), skill: true });
        });
      }
      return null;
    }
    case "hr_beast": {
      c.ok();
      u.anim = Anim.Cast;
      w.later(400, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      summonBeast(w, p, v.dur * 1000);
      return null;
    }
    case "hr_barrage": {
      c.ok();
      s.barrageUntil = w.time + 150 + v.shots * v.every * 1000;
      w.emit({ t: "buff", id: p.id, k: "haste", ms: v.shots * v.every * 1000 });
      w.emit({ t: "aoe", k: "phys", x: u.x, y: u.y, r: 44 });
      const pick = (): Actor | undefined => {
        // автострельба: canAffect — не бьёт героев в нейтральном городе (иначе клеймо нарушителя без осознанного выстрела)
        const fit = (a: Actor | undefined): a is Actor =>
          !!a && !w.isDead(a) && w.hostile(p, a) && w.canAffect(p, a) && !w.stealthed(a) && w.dist(u, a) <= 340 + w.radiusOf(a) && lineClear(w.map, u.x, u.y, a.x, a.y);
        const cur = w.actor(p.targetId);
        if (fit(markedActor(w, p))) return markedActor(w, p);
        if (fit(cur)) return cur;
        let best: Actor | undefined, bd = Infinity;
        for (const m of w.enemiesInCircle(p, u.x, u.y, 340)) {
          const d = w.dist(u, m);
          if (d < bd && fit(m)) { bd = d; best = m; }
        }
        return best;
      };
      for (let i = 0; i < v.shots; i++)
        w.later(150 + i * v.every * 1000, () => {
          if (p.stunUntil > w.time) return;
          const m = pick();
          if (!m) return;
          u.aseq = (u.aseq + 1) % 65535;
          face(m);
          shoot(w, p, m, "arrow", 1000, () => w.hit(p, m, { mult: v.dmg / 100, skill: true }));
        }, p);
      return null;
    }

    // ---------- Тёмный следопыт ----------
    case "dr_detonate": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      shoot(w, p, t, "shadow", 900, () => {
        w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "shadow" });
        const cur = curseOf(w, p, t);
        if (!cur || w.isDead(t)) return;
        const secs = Math.ceil((cur.until - w.time) / 1000);
        const burst = Math.round((cur.dmg * cur.stacks * secs * v.burst) / 100);
        w.emit({ t: "aoe", k: "shadow", x: t.x, y: t.y, r: 52 });
        // взрыв — пока проклятие ещё висит: если он добьёт цель, «Пир душ» и «Заразная смерть» его увидят
        if (burst > 0) {
          bursting = true;
          try { w.hit(p, t, { flat: burst, canCrit: false, kind: "shadow", noBreak: true, noProc: true }); } finally { bursting = false; }
        }
        // проклятие сработало целиком; значок на цели уходит, только если других проклятий на ней нет (чужие и пиявка держат его сами)
        endDot(p, t, "curse");
      });
      return null;
    }
    case "dr_hexswarm": {
      const pt = pointAt();
      const list = w.enemiesInCircle(p, pt.x, pt.y, v.radius)
        .filter((m) => !w.stealthed(m) && w.dist(u, m) <= range + v.radius && lineClear(w.map, u.x, u.y, m.x, m.y))
        .sort((a, b) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(b.x - pt.x, b.y - pt.y))
        .slice(0, Math.floor(v.n));
      if (!list.length) return T("srv.archers.53");
      c.ok();
      u.anim = Anim.Cast;
      w.later(350, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      w.emit({ t: "aoe", k: "shadow", x: pt.x, y: pt.y, r: v.radius });
      list.forEach((m, i) =>
        w.later(i * 90, () => {
          if (w.isDead(m)) return;
          shoot(w, p, m, "shadow", 850, () => {
            w.hit(p, m, { mult: v.dmg / 100, skill: true, kind: "shadow" });
            applyCurse(w, p, m, cursedTick(p), 6);
          });
        }, p));
      return null;
    }
    case "dr_snare": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      shoot(w, p, t, "shadow", 800, () => {
        w.emit({ t: "aoe", k: "chains", x: t.x, y: t.y, r: 36 });
        // путы держат, если стрела попала (поглощённая щитом — тоже); промах (уклонение, город) — нет
        if (!w.hitEx(p, t, { mult: v.dmg / 100, skill: true, kind: "shadow" }).landed || w.isDead(t)) return;
        applyRoot(w, p, t, v.root * 1000, { bossSlow: 50 }); // на боссе — замедление (data/cc.json boss)
        applyWeaken(w, p, t, v.weak, v.dur * 1000);
      });
      return null;
    }
    case "dr_veil": {
      const pt = pointAt();
      c.ok();
      u.anim = Anim.Cast;
      w.later(400, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      const ticks = Math.round(v.dur);
      w.emit({ t: "hazard", id: w.uid("h"), k: "shadow", x: pt.x, y: pt.y, r: v.radius, ms: ticks * 1000 });
      w.emit({ t: "tele", shape: "circle", k: "shadow", x: pt.x, y: pt.y, r: v.radius, ms: 500 });
      for (let i = 1; i <= ticks; i++)
        w.later(i * 1000, () => {
          for (const m of w.enemiesInCircle(p, pt.x, pt.y, v.radius)) {
            if (w.isDead(m)) continue;
            if (w.hitEx(p, m, { mult: v.tick / 100, skill: true, kind: "shadow", noBreak: true }).landed && !w.isDead(m)) {
              applySlow(w, p, m, v.slow, 1500);
              applyWeaken(w, p, m, v.weak, 1500);
            }
            applyCurse(w, p, m, cursedTick(p), 4);
          }
        }, p);
      return null;
    }
    case "dr_ravens": {
      c.ok();
      u.anim = Anim.Cast;
      w.later(500, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      w.emit({ t: "spawn", id: p.id, k: "smoke" });
      w.emit({ t: "aoe", k: "shadow", x: u.x, y: u.y, r: 64 });
      for (let i = 0; i < v.birds; i++)
        w.later(250 + i * 280, () => {
          const list = w.enemiesInCircle(p, u.x, u.y, v.radius).filter((m) => !w.isDead(m) && !w.stealthed(m) && lineClear(w.map, u.x, u.y, m.x, m.y));
          if (!list.length) return;
          const m = list[Math.floor(Math.random() * list.length)];
          shoot(w, p, m, "shadow", 700, () => {
            const cursed = !!curseOf(w, p, m);
            w.hit(p, m, { mult: (v.dmg / 100) * (cursed ? 1 + v.bonus / 100 : 1), skill: true, kind: "shadow", noBreak: true });
            applyCurse(w, p, m, cursedTick(p), 5);
          });
        }, p);
      return null;
    }
  }
  return undefined;
}

// =====================================================================
//                              ХУКИ
// =====================================================================
/** Умение успешно применено (после списания маны, до постановки перезарядки). target — живая цель умения. */
export function onCast(w: World, p: Player, id: string, target: Actor | undefined) {
  if (!isArcher(p)) return;
  const s = st(p);
  if (id === "roll" && rk(p, "hr_trickroll")) {
    const m = pv(p, "hr_trickroll");
    s.rollUntil = w.time + m.dur * 1000; // замедление снимает сам «Перекат» (data/cc.json skills.roll)
    s.rollPct = m.dmg;
    if (!w.inTown(p.x, p.y) && walkable(w.map, p.x, p.y, 6)) placeTrap(w, p, p.x, p.y, rk(p, "hr_trap"));
  }
  if (id === "dr_cursed_arrow" && target && rk(p, "dr_curse_power")) {
    // стрела уже в полёте: продлеваем проклятие, когда оно ляжет
    const dur = pv(p, "dr_curse_power").dur;
    w.later((w.dist(p, target) / 850) * 1000 + 60, () => {
      const e = curseOf(w, p, target);
      if (e) { e.until += dur * 1000; target.curseUntil = Math.max(target.curseUntil, e.until); noteAuraSource(target, "curse", p, e.until); }
    }, p);
  }
  if (id === "dr_weakening" && target && rk(p, "dr_blight")) {
    const pct = pv(p, "dr_blight").pct / 100;
    w.later((w.dist(p, target) / 800) * 1000 + 60, () => {
      if (!w.isDead(target) && w.hostile(p, target)) applyCurse(w, p, target, cursedTick(p) * pct, 6);
    }, p);
  }
  if (id === "dr_shadowmeld") {
    const win = (SKILLS.dr_shadowmeld.v(Math.max(1, rk(p, "dr_shadowmeld"))).dur + 4) * 1000;
    if (rk(p, "dr_ambush")) s.ambushUntil = w.time + win;
    if (rk(p, "dr_shadow_mastery")) {
      s.meldUntil = w.time + win;
      const cut = pv(p, "dr_shadow_mastery").cd * 1000;
      w.later(1, () => { // ok() ставит перезарядку уже после этого хука
        const ready = p.cds.get(id) || 0;
        if (ready > w.time) setCd(p, w, id, Math.max(0, ready - w.time - cut));
      });
    }
  }
}

/** Каждый такт героя (World.updatePlayer): «Стойка стрелка» — запомнить, когда егерь последний раз двигался. */
export function tickArcher(w: World, p: Player) {
  if (p.cls !== "ranger" || !rk(p, "hr_steady")) return;
  const s = st(p);
  if (Math.hypot(p.x - s.px, p.y - s.py) > 0.5) { s.px = p.x; s.py = p.y; s.since = w.time; }
}

/** Исходящий множитель урона лучника. Только удары по оружию/умения (не фиксированный урон). */
export function outgoing(w: World, src: Player, dst: Actor, o: HitOpts): number {
  if (!isArcher(src) || o.flat !== undefined) return 1;
  const s = st(src);
  let k = 1;
  if (src.cls === "ranger") {
    // s.since обновляет tickArcher при каждом шаге героя: бонус считается от остановки, а не от прошлого попадания
    if (rk(src, "hr_steady") && w.time - s.since >= 1000) k *= 1 + pv(src, "hr_steady").dmg / 100;
    if (rk(src, "hr_longshot")) k *= 1 + (pv(src, "hr_longshot").dmg / 100) * clamp01((w.dist(src, dst) - 100) / 200);
    if (s.markId === dst.id && s.markUntil > w.time) k *= 1 + s.markPct / 100;
    if (s.rollUntil > w.time) { k *= 1 + s.rollPct / 100; s.rollUntil = 0; }
    if (rk(src, "hr_bond") && petNear(w, src)) k *= 1 + pv(src, "hr_bond").dmg / 100;
  } else {
    if (rk(src, "dr_malice") && curseOf(w, src, dst)) k *= 1 + pv(src, "dr_malice").dmg / 100;
    if (s.ambushUntil > w.time && !o.noBreak) { k *= 1 + pv(src, "dr_ambush").dmg / 100; s.ambushDst = dst.id; s.ambushUntil = 0; }
    if (rk(src, "dr_backline") && !w.isPlayer(dst) && dst.targetId && dst.targetId !== src.id) k *= 1 + pv(src, "dr_backline").dmg / 100;
    if (rk(src, "dr_verdict") && dst.unit.hp < dst.unit.maxHp * 0.3) k *= 1 + pv(src, "dr_verdict").dmg / 100;
  }
  return k;
}

/** Лучник нанёс урон v (crit — удар был критическим). */
export function afterDealt(w: World, src: Player, dst: Actor, v: number, o: HitOpts, crit: boolean) {
  if (!isArcher(src) || v <= 0 || src.dead) return;
  const s = st(src);
  const strike = o.flat === undefined && !o.noProc; // обычная стрела или умение
  if (src.cls === "ranger") {
    if (!strike) return;
    const rc = rk(src, "hr_ricochet");
    if (crit && rc) {
      const m = pv(src, "hr_ricochet");
      const list = w.enemiesInCircle(src, dst.x, dst.y, m.range)
        .filter((a) => a !== dst && !w.isDead(a) && !w.stealthed(a))
        .sort((a, b) => w.dist(dst, a) - w.dist(dst, b))
        .slice(0, Math.floor(m.n));
      for (const a of list) {
        const ms = (w.dist(dst, a) / 800) * 1000;
        w.emit({ t: "proj", k: "arrow", from: dst.id, to: a.id, tx: a.x, ty: a.y, ms });
        w.later(ms, () => {
          if (!w.isDead(a) && w.hostile(src, a)) w.hit(src, a, { flat: Math.max(1, Math.round((v * m.pct) / 100)), canCrit: false, noProc: true });
        }, src);
      }
    }
    if (rk(src, "hr_hamstring") && !w.isDead(dst)) {
      const m = pv(src, "hr_hamstring");
      if (w.dist(src, dst) > m.dist) applySlow(w, src, dst, m.slow, m.dur * 1000); // по боссу слабее — общее правило data/cc.json boss.slowMult
    }
    if (rk(src, "hr_bond")) {
      const pet = petNear(w, src);
      if (pet) {
        const heal = Math.round((v * pv(src, "hr_bond").heal) / 100), before = pet.unit.hp;
        pet.unit.hp = Math.min(pet.unit.maxHp, before + heal);
        if (pet.unit.hp > before) w.emit({ t: "dmg", id: pet.id, v: pet.unit.hp - before, heal: true });
      }
    }
    return;
  }
  // ---------- Тёмный следопыт ----------
  // тик проклятия (фиксированный урон тенью без эффектов): «Усиление проклятий» лечит; «Взрыв проклятий» — не тик, не лечит
  if (o.flat !== undefined && o.noProc && o.noBreak && o.kind === "shadow") {
    if (!bursting && rk(src, "dr_curse_power")) w.heal(src, Math.round(((v * pv(src, "dr_curse_power").leech) / 100) * leechMult(src.level)), false);
    return;
  }
  if (!strike || o.noBreak) return;
  if (s.ambushDst === dst.id) {
    s.ambushDst = "";
    if (!w.isDead(dst)) { applyCurse(w, src, dst, cursedTick(src), 6); w.emit({ t: "aoe", k: "shadow", x: dst.x, y: dst.y, r: 40 }); }
  }
  if (s.meldUntil > w.time) {
    s.meldUntil = 0;
    const m = pv(src, "dr_shadow_mastery");
    applyHaste(w, src, m.haste, m.dur * 1000);
    w.emit({ t: "buff", id: src.id, k: "haste", ms: m.dur * 1000 });
  }
  if (rk(src, "dr_raven_bond") && w.time >= s.ravenReady && !w.isDead(dst) && lineClear(w.map, src.x, src.y, dst.x, dst.y)) {
    const m = pv(src, "dr_raven_bond");
    s.ravenReady = w.time + m.every * 1000;
    shoot(w, src, dst, "shadow", 700, () => w.hit(src, dst, { mult: m.dmg / 100, skill: true, kind: "shadow", noBreak: true }));
  }
}

/** Герой-лучник получил урон v (после applyDamage). */
export function afterDamaged(w: World, _src: Actor, dst: Player, _v: number, _o: HitOpts) {
  if (dst.cls !== "darkranger" || dst.dead || !rk(dst, "dr_last_shadow")) return;
  const s = st(dst);
  if (dst.unit.hp >= dst.unit.maxHp * 0.35 || w.time < s.vanishReady || w.inTown(dst.x, dst.y) || stealthBan(w, dst)) return;
  const m = pv(dst, "dr_last_shadow");
  s.vanishReady = w.time + m.icd * 1000;
  dst.stealthUntil = w.time + m.dur * 1000;
  dst.slowUntil = dst.rootUntil = 0;
  dst.targetId = null;
  dst.unit.target = "";
  // moveTo не сбрасываем: герой продолжает отступать; мобы рядом теряют его из виду (как «Дымовая завеса» разбойника)
  for (const m of w.enemiesInCircle(dst, dst.x, dst.y, 200)) if (!w.isPlayer(m)) m.threat.delete(dst.id);
  w.emit({ t: "aoe", k: "shadow", x: dst.x, y: dst.y, r: 70 });
  w.emit({ t: "spawn", id: dst.id, k: "smoke" });
}

/** Убийство моба героем. */
export function onKill(w: World, killer: Player, m: Actor) {
  if (!isArcher(killer) || killer.dead) return;
  const s = st(killer);
  if (killer.cls === "ranger") {
    const marked = s.markId === m.id && s.markUntil > w.time;
    if (marked) {
      // метка переходит на ближайшего врага рядом
      const next = w.enemiesInCircle(killer, m.x, m.y, s.markHop).filter((a) => a !== m && !w.isDead(a) && !w.stealthed(a)).sort((a, b) => w.dist(m, a) - w.dist(m, b))[0];
      if (next) setMark(w, killer, next, s.markPct, s.markUntil - w.time, s.markHop);
      else s.markId = "";
    }
    if (rk(killer, "hr_prey") && w.time >= s.preyReady) {
      // не чаще раза в icd: иначе цепочка слабых мобов с меткой сбрасывала бы все перезарядки
      const pr = pv(killer, "hr_prey"), k = marked ? 2 : 1;
      s.preyReady = w.time + pr.icd * 1000;
      cutCooldowns(w, killer, pr.cd * k);
      killer.unit.mp = Math.min(killer.unit.maxMp, killer.unit.mp + (killer.unit.maxMp * pr.mp * k) / 100);
      w.emit({ t: "aoe", k: "holy", x: killer.x, y: killer.y, r: 36 });
    }
    return;
  }
  const cur = curseOf(w, killer, m);
  if (!cur) return;
  if (rk(killer, "dr_soulfeast")) {
    const f = pv(killer, "dr_soulfeast");
    killer.unit.mp = Math.min(killer.unit.maxMp, killer.unit.mp + (killer.unit.maxMp * f.mp) / 100);
    applyHaste(w, killer, f.haste, f.dur * 1000);
    w.emit({ t: "buff", id: killer.id, k: "haste", ms: f.dur * 1000 });
    w.emit({ t: "aoe", k: "reap", x: m.x, y: m.y, r: 40 });
  }
  if (rk(killer, "dr_contagion")) {
    const c = pv(killer, "dr_contagion");
    const left = (cur.until - w.time) / 1000;
    const list = w.enemiesInCircle(killer, m.x, m.y, c.range)
      .filter((a) => a !== m && !w.isDead(a) && !w.stealthed(a))
      .sort((a, b) => w.dist(m, a) - w.dist(m, b))
      .slice(0, Math.floor(c.n));
    for (const a of list) {
      w.emit({ t: "chain", pts: [m.x, m.y - 12, a.x, a.y - 12], k: "shadow" });
      addDot(w, killer, a, "curse", cur.dmg * cur.stacks, Math.max(1, left), "shadow");
    }
  }
}
