/**
 * Потрошитель (reaver, Умбрат): кровотечения, ярость от ран и самоцена. Данные — data/skills_rogues.json (rv_*).
 * Активные умения — castReaver (вызывается из rogue.castRogue); пассивки — хуки outgoing/incoming/beforeLethal/afterDamaged/afterDealt/onKill/critBonus,
 * которые World.hit вызывает через rogue.ts. Умения-модификаторы старых навыков («Широкий замах», «Привычка к боли») правят v перед кастом.
 * Состояние героя — в WeakMap (в сохранения не попадает). Кровотечения хранит umbrath.ts (addDot/dotOf).
 */
import { CLASSES } from "../../../shared/classes";
import { lineClear } from "../../../shared/map";
import { SKILLS } from "../../../shared/skills";
import { Dir } from "../../../shared/protocol";
import { rayLen } from "../../../shared/skillShape";
import type { Player } from "./Player";
import { bleed, dotOf, endDot, type CastCtx } from "./umbrath";
import { applyHaste } from "./effects";
import { registerAuraHook } from "./auras";
import type { Actor, HitOpts, World } from "./World";
import { leechMult } from "../../../shared/balance";

/** massacre — токен вихря «Кровавой бойни» (оглушение его обрывает), massacreUntil — когда вихрь кончится (для значка эффекта). */
interface St { furyStacks: number; furyUntil: number; defReady: number; defPending: boolean; massacre: number; massacreUntil: number }
const states = new WeakMap<Player, St>();
function st(p: Player): St {
  let s = states.get(p);
  if (!s) { s = { furyStacks: 0, furyUntil: 0, defReady: 0, defPending: false, massacre: 0, massacreUntil: 0 }; states.set(p, s); }
  return s;
}
// значки в рамке героя (auras.ts): «Разъярённый» со стаками, «Кровавая бойня»
registerAuraHook((a, _now, aura) => {
  const s = states.get(a as Player);
  if (!s) return;
  if (s.furyStacks > 0) aura("fury", s.furyUntil, { n: s.furyStacks });
  aura("massacre", s.massacreUntil);
});
const rk = (p: Player, id: string) => p.save.skills[id] || 0;
const pv = (p: Player, id: string) => SKILLS[id].v(Math.max(1, rk(p, id)));
const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);

/** «Глубокие раны»: множитель урона, добавка к длительности и числу стаков кровотечения. */
export function bleedMods(p: Player): { dmg: number; dur: number; stacks: number } {
  if (p.cls !== "reaver" || !rk(p, "rv_deep_cuts")) return { dmg: 1, dur: 0, stacks: 0 };
  const m = pv(p, "rv_deep_cuts");
  return { dmg: 1 + m.dmg / 100, dur: m.dur, stacks: m.stacks };
}

// =====================================================================
//                         АКТИВНЫЕ УМЕНИЯ
// =====================================================================
/** undefined — умение не из этого модуля (идёт дальше, в umbrath.ts). */
export function castReaver(c: CastCtx): string | null | undefined {
  const { w, p, v, def } = c;
  const t = c.liveTarget as Actor;
  const u = p.unit;
  const range = def.range ?? 0;
  const needTarget = (): string | null => {
    if (!c.liveTarget) return "Нужна цель";
    if (w.dist(u, t) > range + w.radiusOf(t)) return "Цель слишком далеко";
    if (!lineClear(w.map, u.x, u.y, t.x, t.y)) return "Нет прямой видимости";
    return null;
  };
  const face = (a: { x: number; y: number }) => { u.dir = dirTo(a.x - u.x, a.y - u.y); };

  switch (c.id) {
    // ---- модификаторы старых умений (правят числа и идут дальше) ----
    case "rv_carve":
    case "rv_leap": {
      if (!rk(p, "rv_sweep")) return undefined;
      const m = pv(p, "rv_sweep");
      v.radius *= 1 + m.radius / 100;
      if (c.id === "rv_leap") v.splash += m.splash;
      return undefined;
    }
    case "rv_frenzy": {
      if (!rk(p, "rv_habit")) return undefined;
      const m = pv(p, "rv_habit");
      v.cost *= 1 - m.cost / 100;
      v.dur += m.dur;
      return undefined;
    }

    // ---- новые активные ----
    case "rv_hamstring": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      w.emit({ t: "aoe", k: "slash", x: t.x, y: t.y, r: 34 });
      // кровотечение и замедление — если удар попал (поглощённый щитом — тоже); промах (уклонение, город) — нет
      if (!w.hitEx(p, t, { mult: v.dmg / 100, skill: true, threat: 1 }).landed || w.isDead(t)) return null;
      bleed(w, p, t);
      c.slow(t, v.slow, v.dur * 1000);
      return null;
    }
    case "rv_reap": {
      const list = w.enemiesInCircle(p, u.x, u.y, v.radius).map((m) => ({ m, d: dotOf(w, p, m, "bleed") })).filter((x) => x.d);
      if (!list.length) return "Нет кровоточащих врагов рядом";
      c.ok();
      u.aseq = (u.aseq + 1) % 65535;
      w.emit({ t: "aoe", k: "burst", x: u.x, y: u.y, r: v.radius });
      let total = 0;
      for (const { m, d } of list) {
        const left = d!.dmg * d!.stacks * Math.max(1, Math.ceil((d!.until - w.time) / 1000));
        endDot(p, m, "bleed");
        w.emit({ t: "chain", pts: [m.x, m.y - 12, u.x, u.y - 12], k: "blood" });
        total += w.hit(p, m, { flat: Math.max(1, Math.round((left * v.burst) / 100)), canCrit: false, kind: "blood", skill: true, threat: 1 });
      }
      if (total > 0) w.heal(p, Math.round(((total * v.heal) / 100) * leechMult(p.level)));
      return null;
    }
    case "rv_gore": {
      const e = needTarget(); if (e) return e;
      const stacks = dotOf(w, p, t, "bleed")?.stacks ?? 0;
      c.ok(); face(t);
      w.emit({ t: "aoe", k: "burst", x: t.x, y: t.y, r: 40 });
      const dealt = w.hit(p, t, { mult: (v.dmg + v.stack * stacks) / 100, skill: true, threat: 1 });
      if (dealt > 0) w.heal(p, Math.round(((dealt * v.heal) / 100) * leechMult(p.level)));
      return null;
    }
    case "rv_throw": {
      // луч до первой стены по углу прицела, как у «Пронзающей стрелы» (вода и деревья топор не держат) — общая с превью rayLen;
      // короче 24 — отказ (placeSkill уже отказал: поля min и minErr в data/skills_aim.json)
      const dx = Math.cos(c.aim), dy = Math.sin(c.aim);
      const len = rayLen(w.map, u.x, u.y, c.aim, range);
      if (len < 24) return "Путь прегражден";
      const end = { x: u.x + dx * len, y: u.y + dy * len };
      c.ok();
      u.dir = dirTo(dx, dy);
      const speed = 720;
      w.emit({ t: "proj", k: "blood", from: p.id, tx: end.x, ty: end.y, ms: (len / speed) * 1000 });
      // враги на линии (прямая видимость от героя проверена в enemiesInCircle)
      for (const m of w.enemiesInCircle(p, u.x, u.y, range + 30)) {
        const along = (m.x - u.x) * dx + (m.y - u.y) * dy;
        const off = Math.abs((m.x - u.x) * dy - (m.y - u.y) * dx);
        if (along < 0 || along > len + w.radiusOf(m) || off > v.width / 2 + w.radiusOf(m)) continue;
        w.later((Math.min(along, len) / speed) * 1000, () => {
          if (w.gone(m) || !w.hostile(p, m) || !w.canAffect(p, m)) return;
          w.emit({ t: "aoe", k: "slash", x: m.x, y: m.y, r: 30 });
          if (w.hitEx(p, m, { mult: v.dmg / 100, skill: true, threat: 1 }).landed && !w.isDead(m)) bleed(w, p, m);
        }, p);
      }
      return null;
    }
    case "rv_massacre": {
      c.ok();
      // токен: оглушение обрывает вихрь; смерть и уход героя отсекает владелец таймера (w.later)
      const s = st(p), token = ++s.massacre;
      const ticks = Math.max(1, Math.floor(v.dur * 2));
      s.massacreUntil = w.time + ticks * 500;
      w.emit({ t: "buff", id: p.id, k: "enrage", ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "tide", x: u.x, y: u.y, r: v.radius });
      for (let i = 1; i <= ticks; i++)
        w.later(i * 500, () => {
          if (s.massacre !== token) return;
          if (p.stunUntil > w.time) {
            // оглушение прервало вихрь: значок и картинка вихря (метка умения нужна — вид enrage делят и другие умения) уходят сразу
            s.massacre++;
            s.massacreUntil = 0;
            w.emit({ t: "buff", id: p.id, k: "enrage", ms: 0 });
            return;
          }
          // самоцена: всегда платится, но не добивает героя (HP не опускается ниже 1)
          const pay = Math.min(Math.round((u.maxHp * v.cost) / 200), u.hp - 1);
          if (pay > 0) { u.hp -= pay; w.emit({ t: "dmg", id: p.id, v: pay, k: "blood" }); }
          u.aseq = (u.aseq + 1) % 65535;
          w.emit({ t: "aoe", k: i % 2 ? "slash" : "burst", x: u.x, y: u.y, r: v.radius * 0.8 });
          let total = 0;
          for (const m of w.enemiesInCircle(p, u.x, u.y, v.radius)) {
            const { landed, dealt } = w.hitEx(p, m, { mult: v.dmg / 100, skill: true });
            total += dealt; // лечение — от нанесённого урона
            if (landed && !w.isDead(m)) bleed(w, p, m);
          }
          if (total > 0) w.heal(p, Math.round(((total * v.heal) / 100) * leechMult(p.level)));
        }, p);
      return null;
    }
  }
  return undefined;
}

// =====================================================================
//                              ХУКИ
// =====================================================================
/** Исходящий множитель обычного урона (не фиксированного). */
export function outgoing(w: World, src: Player, dst: Actor, _o: HitOpts): number {
  let k = 1;
  if (rk(src, "rv_scent") && dotOf(w, src, dst, "bleed")) k *= 1 + pv(src, "rv_scent").dmg / 100;
  if (rk(src, "rv_scars")) {
    // «Шрамы» усиливают базовую ярость от ран (World.hit: ×(1 + rage·m)) в (1 + pct/100) раз, а не множат урон ещё раз
    const m = 1 - src.unit.hp / Math.max(1, src.unit.maxHp), rage = CLASSES[src.cls].rage ?? 0;
    k *= (1 + rage * (1 + pv(src, "rv_scars").pct / 100) * m) / (1 + rage * m);
  }
  return k;
}

/** Бонус шанса крита (доля): «Жестокость» растёт со стаками кровотечения. */
export function critBonus(w: World, src: Player, dst: Actor): number {
  if (!rk(src, "rv_cruelty")) return 0;
  const d = dotOf(w, src, dst, "bleed");
  return d ? (d.stacks * pv(src, "rv_cruelty").crit) / 100 : 0;
}

/** Входящий урон: «Обескровленные» ослабляют ваших истекающих врагов. */
export function incoming(w: World, src: Actor, dst: Player, amount: number): number {
  if (rk(dst, "rv_anemia") && dotOf(w, dst, src, "bleed")) amount *= 1 - pv(dst, "rv_anemia").weak / 100;
  return amount;
}

/** «Несломленный»: смертельный удар оставляет 1 здоровья. */
export function beforeLethal(w: World, dst: Player, v: number): number {
  if (!rk(dst, "rv_defiance") || v < dst.unit.hp) return v;
  const s = st(dst);
  if (w.time < s.defReady) return v;
  s.defReady = w.time + pv(dst, "rv_defiance").icd * 1000;
  s.defPending = true;
  return Math.max(0, dst.unit.hp - 1);
}

/** Герой получил урон v (после applyDamage). */
export function afterDamaged(w: World, src: Actor, dst: Player, v: number) {
  const s = st(dst);
  if (s.defPending) {
    s.defPending = false;
    const m = pv(dst, "rv_defiance");
    w.heal(dst, Math.round((dst.unit.maxHp * m.heal) / 100));
    applyHaste(w, dst, m.haste, m.dur * 1000);
    w.emit({ t: "buff", id: dst.id, k: "enrage", ms: m.dur * 1000 });
    w.emit({ t: "aoe", k: "burst", x: dst.x, y: dst.y, r: 70 });
  }
  if (dst.dead || v <= 0 || src === dst || !rk(dst, "rv_fury_stack")) return;
  const m = pv(dst, "rv_fury_stack");
  if (w.time > s.furyUntil) s.furyStacks = 0;
  s.furyStacks = Math.min(m.max, s.furyStacks + 1);
  s.furyUntil = w.time + m.dur * 1000;
  // своё значение ярости: чужое более сильное ускорение не продлевается, ярость ждёт его конца (effects.ts)
  applyHaste(w, dst, s.furyStacks * m.haste, s.furyUntil - w.time);
}

/** Герой нанёс урон v: «Вкус крови» — тик кровотечения лечит. */
export function afterDealt(w: World, src: Player, _dst: Actor, v: number, o: HitOpts) {
  if (v <= 0 || o.kind !== "blood" || !o.noBreak || !o.noProc || !rk(src, "rv_taste")) return;
  w.heal(src, Math.round(((v * pv(src, "rv_taste").heal) / 100) * leechMult(src.level)), false);
}

/** Убийство моба: «Резня». */
export function onKill(w: World, killer: Player) {
  if (killer.dead || !rk(killer, "rv_carnage")) return;
  w.heal(killer, Math.round((killer.unit.maxHp * pv(killer, "rv_carnage").heal) / 100));
  if ((killer.cds.get("rv_leap") || 0) > w.time) { killer.cds.set("rv_leap", 0); killer.send("cd", { id: "rv_leap", ms: 0 }); }
  w.emit({ t: "aoe", k: "reap", x: killer.x, y: killer.y, r: 40 });
}
