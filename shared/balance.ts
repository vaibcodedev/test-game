/** Числа баланса боя из data/balance.json (задача 45): кривая HP мобов, боссы, стоимость маны, модель PvP. */
import data from "../data/balance.json";
import { CLASSES, type ClassId } from "./classes";

/** PvP-поправка класса: число или точки [уровень, множитель] (наборы умений и оружие на 30 и 100 ур. разные). */
type PvpK = number | number[][];
interface BossBal { hp: number; dmg: number; armor: number; mech?: number }
export interface Balance {
  gcd: number;
  mob: { hp: number[][]; dmg: number[] };
  bosses: { scaleToAttacker: boolean; petThreat: number; hpLevel: number[][] } & Record<string, BossBal | boolean | string | number | number[][]>;
  mana: { int: { a: number; b: number; q: number }; healer: { a: number; b: number; q: number } };
  pet: { refLevel: number };
  /** Добыча с обычных мобов: шансы вещи, второй вещи и зелья (data/balance.json loot). */
  loot: { item: number; extra: number; potion: number; bossLevelGap: number; bossLevelFree: number; boss: { items: number; epic: number } };
  heal: { power: number[][] };
  pvp: { damage: number[][]; heal: number[][]; healWindowMs: number; plusShare: number; critChanceMax: number; critMultMax: number; hitCapHp: number; burstCapHp: number; capLevelGap: number; mitigationCap: number; ccMult: number; botPower?: number[][]; botTaken?: number[][]; botGearPlus?: number; botSkip?: number; botReactMs?: number[]; class: Record<string, { dmg?: PvpK; taken?: PvpK }> };
}
export const BAL = data as unknown as Balance;

/** Множители босса из data/balance.json (hp/dmg/armor) или undefined. */
export const bossBal = (id: string): BossBal | undefined => {
  const b = BAL.bosses[id];
  return b && typeof b === "object" && !Array.isArray(b) ? (b as BossBal) : undefined;
};

/** HP моба уровня L без def.hp: точки data/balance.json mob.hp, между ними — степенная интерполяция, за краями — продолжение крайнего отрезка. */
export function mobHpAt(level: number): number {
  const pts = BAL.mob.hp, L = Math.max(1, level);
  let i = 1;
  while (i < pts.length - 1 && L > pts[i][0]) i++;
  const [l0, h0] = pts[i - 1], [l1, h1] = pts[i];
  const p = Math.log(h1 / h0) / Math.log(l1 / l0);
  return h0 * Math.pow(L / l0, p);
}

/**
 * Рост урона питомцев и призывов сверх линейного (4 + 1.7·L): доля HP моба своего уровня за удар — как на уровне pet.refLevel.
 * До refLevel — 1 (низкие уровни не меняются).
 */
export function petDmgGrowth(level: number): number {
  const ref = BAL.pet.refLevel, L = Math.max(1, level);
  if (L <= ref) return 1;
  return (mobHpAt(L) / (4 + 1.7 * L)) / (mobHpAt(ref) / (4 + 1.7 * ref));
}

/** Множитель стоимости маны: классы с главной характеристикой Интеллект — a + b·(L−1)^q (лекари — своя кривая), остальные — 1. */
export function manaMult(cls: ClassId, level: number): number {
  if (CLASSES[cls]?.mainStat !== "int") return 1;
  const m = CLASSES[cls].role === "healer" ? BAL.mana.healer : BAL.mana.int;
  return m.a + m.b * Math.pow(Math.max(0, level - 1), m.q);
}

/** Кривая по точкам [уровень, значение]: между точками — линейно по уровню в логарифме значения, за краями — крайнее значение. */
function curve(points: number[][], level: number): number {
  if (level <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [l1, v1] = points[i];
    if (level <= l1) {
      const [l0, v0] = points[i - 1];
      const t = (level - l0) / (l1 - l0);
      return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * t);
    }
  }
  return points[points.length - 1][1];
}
/** «Устойчивость»: множитель урона героя по герою уровня level. */
export const pvpDamageMult = (level: number) => curve(BAL.pvp.damage, level);
const pvpK = (v: PvpK | undefined, level: number) => (v === undefined ? 1 : typeof v === "number" ? v : curve(v, level));
/** PvP-поправка класса (data/balance.json pvp.class): урон класса src (уровня srcLevel) по героям × получаемый классом dst (уровня dstLevel) от героев. */
export const pvpClassMult = (src: ClassId, dst: ClassId, srcLevel = 100, dstLevel = srcLevel) =>
  pvpK(BAL.pvp.class[src]?.dmg, srcLevel) * pvpK(BAL.pvp.class[dst]?.taken, dstLevel);
/** Множитель лечения героя уровня level в PvP. */
export const pvpHealMult = (level: number) => curve(BAL.pvp.heal, level);
/** Множитель HP босса по его уровню (data/balance.json bosses.hpLevel). */
export const bossHpLevelMult = (level: number) => curve(BAL.bosses.hpLevel, level);
/** Множитель силы лечения лекаря уровня level (data/balance.json heal.power). */
export const healPowerMult = (level: number) => curve(BAL.heal.power, level);
/** Множитель лечения от нанесённого урона (вампиризм, «кровь», вытягивание жизни) — та же кривая: урон растёт как L², здоровье — как L. */
export const leechMult = healPowerMult;
