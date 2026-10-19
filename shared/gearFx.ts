/** Отображение заточки и редкости на герое и в окнах (docs/gear-visuals.md). Данные: data/gear-fx.json. */
import data from "../data/gear-fx.json";
import { LEGENDARIES } from "./legendary";
import type { Slot } from "./items";

export const GEAR_FX = data;
/** Цвет заточки (бирюза). Не совпадает ни с одним цветом редкости и фракции. */
export const ENCHANT_COLOR = data.enchant.color;
/** Пороги ступеней заточки: +4, +7, +10. */
export const ENCHANT_THRESHOLDS: readonly number[] = data.enchant.thresholds;
/** Осмотр игрока: дальность в зоне видимости (px) и пауза между запросами (мс). */
export const INSPECT_RANGE = data.inspect.range;
export const INSPECT_COOLDOWN_MS = data.inspect.cooldownMs;
/** Ступень заточки: 0 — эффекта нет (+0…+3), 1 — тусклый контур (+4…+6), 2 — яркий (+7…+9), 3 — контур с ореолом (+10). */
export type EnchantTier = 0 | 1 | 2 | 3;

export function enchantTier(plus: number): EnchantTier {
  let t = 0;
  for (const th of ENCHANT_THRESHOLDS) if (plus >= th) t++;
  return t as EnchantTier;
}

/** Ближайшая следующая ступень свечения: с какого +N она начнётся. null — уже максимальная. */
export function nextTierPlus(plus: number): number | null {
  return ENCHANT_THRESHOLDS.find((th) => plus < th) ?? null;
}

const pick = (arr: readonly string[], i: number) => arr[Math.min(i, arr.length - 1)];

/** Что нарисовано на детали слота при данной ступени заточки (без «Заточка +N:»). */
export function tierText(slot: Slot, tier: number): string {
  const arr = (data.texts.enchant as Record<string, string[]>)[slot];
  return arr ? pick(arr, tier) : data.texts.noEffect;
}

/** Тема легендарки у своей детали: «угольки у клинка». "" — предмет не легендарный или темы нет. */
export function legendText(slot: Slot, leg: string | undefined | null): string {
  const look = leg ? LEGENDARIES[leg]?.look : undefined;
  const byBase = slot === "weapon" && leg ? (data.texts.legend.zoneByBase as Record<string, string>)[LEGENDARIES[leg].base] : undefined;
  const zone = byBase || (data.texts.legend.zone as Record<string, string>)[slot];
  if (!look || !zone) return "";
  const form = slot === "helmet" ? look.helm : slot === "armor" ? look.pauld : slot === "boots" ? look.boots : undefined;
  const forms = data.texts.legend.forms as Record<string, string>;
  const fx = data.texts.legend.fx as Record<string, string>;
  const word = (form && forms[form]) || fx[look.fx] || look.fx;
  return `${word} ${zone}`;
}

/** Строка эффекта детали на герое: «Заточка +7: яркий пульсирующий контур оружия. Тема: угольки у клинка». Без эффекта — «эффекта на герое нет». */
export function fxText(slot: Slot, plus: number, leg?: string | null): string {
  const parts: string[] = [];
  const tier = enchantTier(plus);
  if (plus > 0 || tier > 0) parts.push(`Заточка +${plus}: ${tierText(slot, tier)}`);
  const theme = legendText(slot, leg);
  if (theme) parts.push(`Тема: ${theme}`);
  return parts.length ? parts.join(". ") : data.texts.noEffect;
}

/** Подпись следующей ступени для подсказки: «Следующая ступень: +10». "" — максимум или слот без эффекта на герое. */
export function nextStepText(slot: Slot, plus: number): string {
  const next = slot === "ring" || slot === "amulet" ? null : nextTierPlus(plus);
  return next === null ? "" : data.texts.nextStep.replace("{plus}", String(next));
}

/** Для кузнеца: «На +7 появится: яркий пульсирующий контур оружия». "" — дальше ступеней нет. */
export function smithNextText(slot: Slot, plus: number): string {
  const next = slot === "ring" || slot === "amulet" ? null : nextTierPlus(plus);
  return next === null ? "" : data.texts.smithNext.replace("{plus}", String(next)).replace("{text}", tierText(slot, enchantTier(next)));
}
