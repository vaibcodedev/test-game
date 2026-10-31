/** Отображение заточки и редкости на герое и в окнах (docs/art/gear.md). Данные: data/gear-fx.json. */
import data from "../data/gear-fx.json";
import { LEGENDARIES } from "./legendary";
import type { Slot } from "./items";

export const GEAR_FX = data;
/** Цвет заточки (бирюза). Не совпадает ни с одним цветом редкости и фракции. */
/** Визуал заточки (контур/ореол на герое, бирюза в окнах). Выключен 2026-10-30; вернуть: enchant.visual=true в data/gear-fx.json. */
export const ENCHANT_VISUAL: boolean = data.enchant.visual;
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

/** Ступень для отрисовки: 0, пока визуал заточки выключен. */
export const visualTier = (plus: number): EnchantTier => (ENCHANT_VISUAL ? enchantTier(plus) : 0);

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
  const zones = data.texts.legend.zone as Record<string, string>;
  // парящие вокруг героя (look.orbit) — у оружия, второй руки, кольца и амулета; у плаща — знамя или крылья (look.back)
  const orbit = (slot === "weapon" || slot === "offhand" || slot === "ring" || slot === "amulet") && look?.orbit ? look.orbit : undefined;
  const zone = orbit ? zones.orbit : byBase || zones[slot];
  if (!look || !zone) return "";
  const form = orbit ?? (slot === "helmet" ? look.helm : slot === "armor" ? (look.back === "wings" ? "wings" : look.pauld) : slot === "boots" ? look.boots : slot === "cloak" ? look.back : undefined);
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

/** Заточка героя Б (вариант D, data/gear-fx.json → enchantB): ступень 0..3 по порогам +5/+8/+11; выключена — 0. */
export const ENCHANT_B = data.enchantB;
export function enchantTierB(plus: number): 0 | 1 | 2 | 3 {
  if (!ENCHANT_B.visual) return 0;
  let t = 0;
  for (const th of ENCHANT_B.thresholds) if (plus >= th) t++;
  return t as 0 | 1 | 2 | 3;
}
/** Цвет «+N» на иконке по ступени варианта D. */
export const enchantIconColor = (plus: number): string => ENCHANT_B.iconColors[(() => { let t = 0; for (const th of ENCHANT_B.thresholds) if (plus >= th) t++; return t; })()];

/** Вид контура заточки на конкретном оружии: цвета ступени, приведённые к контрасту с оружием (data/gear-fx.json enchantB.contrast). */
export interface EnchantLook { color: string; color2?: string; core?: string; gap: string; gapAlpha: number; kind: "dark" | "red" | "light" | "mid" }
const hex2 = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const rgb2hex = (c: number[]) => "#" + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const mixHex = (a: string, b: string, t: number) => { const A = hex2(a), B = hex2(b); return rgb2hex(A.map((v, k) => v + (B[k] - v) * t)); };
function hsv(c: number[]): [number, number, number] {
  const [r, g, b] = c.map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [(h + 360) % 360, mx ? d / mx : 0, mx];
}
function fromHsv(h: number, s: number, v: number): number[] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m].map((q) => q * 255);
}
/** Яркость 0..1 (как в heroB.ts enchantTex — среднее по видимым пикселям оружия без тёмной обводки). */
export const lum01 = (c: number[]) => (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255;
/**
 * Цвет контура заточки по среднему цвету оружия avg (RGB 0..255) — «свечение контрастно к оружию» (владелец 2026-10-31):
 * тёмные и красные клинки — светлее (тёплое золото/белое с цветом ступени), светлая сталь — насыщенный цвет ступени, между клинком и контуром — тёмная прослойка.
 * Чем выше ступень и плюс, тем ярче.
 */
export function enchantContrast(tier: 1 | 2 | 3, plus: number, avg: number[] | null): EnchantLook {
  const C = ENCHANT_B.contrast, T = ENCHANT_B.tiers[tier] as { color?: string; color2?: string; core?: string };
  const base = T.color ?? "#ffffff";
  const L = avg ? lum01(avg) : 0.5, [h, s] = avg ? hsv(avg) : [0, 0];
  const red = !!avg && s >= C.redSat && (h >= C.redHue[0] || h <= C.redHue[1]);
  const kind: EnchantLook["kind"] = red ? "red" : L < C.darkLum ? "dark" : L > C.lightLum && s < 0.3 ? "light" : "mid";
  const over = Math.max(0, plus - ENCHANT_B.thresholds[tier - 1]), up = Math.min(1, over * C.plusLight);
  // тёмное и красное оружие — светлее (к тёплому белому); сталь и среднее — насыщенный цвет ступени, ярче с плюсом (не к белому: красный не уходит в розовый)
  const lighten = (c: string, k: number) => mixHex(c, C.light, Math.min(0.9, k + up));
  const satur = (c: string, ks: number, dv: number) => { const [hh, ss, vv] = hsv(hex2(c)); return rgb2hex(fromHsv(hh, Math.min(1, ss + ks), Math.min(1, Math.max(0, vv * (1 - dv) + up)))); };
  const f = kind === "light" ? (c: string) => satur(c, C.satK, C.deepen) : kind === "mid" ? (c: string) => satur(c, C.satK * 0.5, -C.neutralK) : (c: string) => lighten(c, C.lightK[tier - 1]);
  return { color: f(base), color2: T.color2 ? f(T.color2) : undefined, core: T.core, gap: C.gap.color, gapAlpha: C.gap.alpha[tier - 1], kind };
}
