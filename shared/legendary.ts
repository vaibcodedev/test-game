/**
 * Легендарные предметы: ярусы 30/50/70/85/100, свойства и вид — data/legendaries.json (формат записи — его _doc).
 * makeLegendary — предмет, rollLegendary — добыча по уровню источника. Обработчики свойств — server/src/game/legendary.ts.
 */
import data from "../data/legendaries.json";
import { BASE_ITEMS, RARITY_MULT, Rarity, makeItem, type Item, type ItemStatKey, type ItemStats } from "./items";
import { CLASSES, type ClassId } from "./classes";

/** Вид на герое и на иконке. Какие поля к какому слоту относятся — _doc.slots. */
export interface LegendaryLook {
  c2: string; fx: string;
  helm?: string; eyes?: boolean; pauld?: string; chains?: boolean; boots?: string;
  back?: string; wings?: string; crest?: string; flag?: string; train?: boolean;
  blade?: string; pommel?: string; ghost?: boolean; orbit?: string; shape?: string;
  /** Форма модели иконки и вида на герое (шлем, навершие посоха, сапоги…): перекрывает shape, без проверки по каталогу. */
  form?: string;
  /** Кольцо и амулет: огранка камня (cut drop shard eye square star) и оправа (claws thorns wings halo leaves crown). */
  stone?: string; setting?: string;
}
export type LegendaryEffect = { type: string; [k: string]: number | string };
export interface LegendaryDef {
  id: string;
  name: string;
  base: string;
  variant: ClassId;
  /** Фракция variant: solgard | umbrath. */
  faction: string;
  /** Ярус (30/50/70/85/100) и его номер 0..4. */
  tier: number;
  ti: number;
  ilvl: number;
  req: number;
  tint: string;
  stats: ItemStats;
  lore: string;
  /** Свойство со значениями своего яруса (поверх — переопределения записи). */
  effect: LegendaryEffect;
  desc: string;
  look: LegendaryLook;
}
export interface LegendEffectSpec { hook: "hit" | "out" | "damaged" | "absorb" | "kill" | "lethal"; text: string; params: Record<string, number[]> }
export interface LegendTiers {
  list: number[]; ilvl: number[]; req: number[]; budget: number[]; critMax: number[]; slot: Record<string, number>;
  drop: { boss: number; elite: number; weights: number[]; floor: number; variant: number; faction: number };
}

const D = data as unknown as Record<string, unknown>;
export const LEGEND_TIERS = D._tiers as LegendTiers;
export const LEGEND_EFFECTS = D._effects as Record<string, LegendEffectSpec>;
export const TIER_LIST: readonly number[] = LEGEND_TIERS.list;

/** Ключи-доли (выводятся в процентах) и ключи-миллисекунды (в секундах) в шаблоне описания. */
const PCT = new Set(["chance", "pct", "mult", "below", "hp"]), SEC = new Set(["ms", "cd", "icd"]);
const num = (v: number) => String(Math.round(v * 10) / 10).replace(".", ",");
export const fmtParam = (k: string, v: number): string => (PCT.has(k) ? num(v * 100) : SEC.has(k) ? num(v / 1000) : num(v));

/** Номер яруса 0..4: точный ярус или ближайший не выше. */
export function tierIndex(tier: number): number {
  let ti = 0;
  TIER_LIST.forEach((t, i) => { if (tier >= t) ti = i; });
  return ti;
}

/** Параметры свойства на ярусе ti: значения _effects[type].params[ti], поверх — переопределения записи. */
export function effectAt(type: string, ti: number, over: Record<string, number | string> = {}): LegendaryEffect {
  const spec = LEGEND_EFFECTS[type];
  const e: LegendaryEffect = { type };
  if (spec) for (const [k, arr] of Object.entries(spec.params)) e[k] = arr[Math.min(ti, arr.length - 1)];
  for (const [k, v] of Object.entries(over)) if (k !== "type") e[k] = v;
  return e;
}

/** Описание свойства по шаблону: «15% шанс: молния перескакивает на 3 ближайших врагов (60% урона).» */
export function effectText(e: LegendaryEffect): string {
  const spec = LEGEND_EFFECTS[e.type];
  if (!spec) return "";
  return spec.text.replace(/\{(\w+)\}/g, (_, k: string) => (e[k] === undefined ? "?" : fmtParam(k, Number(e[k]))));
}

type Raw = { name: string; base: string; variant: ClassId; tier: number; ilvl?: number; req?: number; tint: string; stats: ItemStats; lore: string; effect: LegendaryEffect; desc?: string; look: LegendaryLook };
export const LEGENDARIES: Record<string, LegendaryDef> = {};
for (const [id, v] of Object.entries(D)) {
  if (id.startsWith("_")) continue;
  const r = v as Raw, ti = tierIndex(r.tier);
  const effect = effectAt(r.effect.type, ti, r.effect);
  LEGENDARIES[id] = {
    id, name: r.name, base: r.base, variant: r.variant, faction: CLASSES[r.variant]?.faction ?? "solgard",
    tier: TIER_LIST[ti], ti, ilvl: r.ilvl ?? LEGEND_TIERS.ilvl[ti], req: r.req ?? LEGEND_TIERS.req[ti],
    tint: r.tint, stats: r.stats, lore: r.lore, effect, desc: r.desc ?? effectText(effect), look: r.look,
  };
}

/** Может ли класс носить базу легендарки. */
export const legendaryFits = (id: string, cls: ClassId): boolean => {
  const b = BASE_ITEMS[LEGENDARIES[id]?.base];
  return !!b && (!b.classes || b.classes.includes(cls));
};

export function makeLegendary(id: string): Item {
  const u = LEGENDARIES[id];
  const base = makeItem(u.base, u.ilvl, Rarity.Legendary, () => 0.5);
  const stats: ItemStats = {};
  const main = BASE_ITEMS[u.base].roll!(u.ilvl);
  for (const [k, v] of Object.entries(main)) stats[k as ItemStatKey] = Math.round((v as number) * (k.startsWith("dmg") || k === "armor" ? RARITY_MULT[Rarity.Legendary] : 1));
  for (const [k, v] of Object.entries(u.stats)) stats[k as ItemStatKey] = (stats[k as ItemStatKey] || 0) + (v as number);
  return { ...base, name: u.name, stats, legendary: id, req: u.req, bound: true };
}

/**
 * Веса ярусов для источника уровня level: ярусы не выше уровня, ближайший — weights[0], старше — дальше по списку.
 * Самый младший ярус доступен с уровня list[0] − floor. Ярусы без вещей для класса пропускаются.
 */
export function legendaryTierWeights(cls: ClassId, level: number): [number, number][] {
  const dr = LEGEND_TIERS.drop;
  let tiers = TIER_LIST.filter((t) => t <= level);
  if (!tiers.length && level >= TIER_LIST[0] - dr.floor) tiers = [TIER_LIST[0]];
  const out: [number, number][] = [];
  [...tiers].sort((a, b) => b - a).forEach((t, rank) => {
    const w = dr.weights[Math.min(rank, dr.weights.length - 1)];
    if (w > 0 && Object.values(LEGENDARIES).some((l) => l.tier === t && legendaryFits(l.id, cls))) out.push([t, w]);
  });
  return out;
}

function weighted<T>(cand: [T, number][], rand: () => number): T | undefined {
  let sum = 0;
  for (const [, w] of cand) sum += w;
  let r = rand() * sum;
  for (const [v, w] of cand) { r -= w; if (r <= 0) return v; }
  return cand[cand.length - 1]?.[0];
}

/** Легендарка с источника уровня level (босс или элита) для класса cls: ярус по весам, внутри — свой класс и фракция чаще. */
export function rollLegendary(cls: ClassId, level: number, rand: () => number = Math.random): string | undefined {
  const tier = weighted(legendaryTierWeights(cls, level), rand);
  if (tier === undefined) return undefined;
  const dr = LEGEND_TIERS.drop, fac = CLASSES[cls]?.faction;
  const ids = Object.values(LEGENDARIES).filter((l) => l.tier === tier && legendaryFits(l.id, cls))
    .map((l) => [l.id, (l.variant === cls ? dr.variant : 1) * (l.faction === fac ? dr.faction : 1)] as [string, number]);
  return weighted(ids, rand);
}
