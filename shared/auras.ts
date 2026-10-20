/** Подписи эффектов в рамке героя: боевые — из data/auras.json, еда — из data/food.json (ключ food_<id>). Общий для сервера (порядок, вид) и клиента (текст). */
import data from "../data/auras.json";
import { FOOD } from "./food";

export interface AuraDef {
  name: string;
  /** Описание; {v} — величина (процент или остаток щита), {n} — стаки. */
  desc: string;
  /** buff — своя польза, debuff — вред. */
  kind: "buff" | "debuff";
  /** Файл из client/public/assets/icons без .png. */
  icon: string;
}

/** Ключ ауры еды по id блюда. */
export const foodAuraKey = (id: string) => `food_${id}`;
/** id блюда по ключу ауры (undefined — это не еда). */
export const foodOfAura = (k: string): string | undefined => (k.startsWith("food_") && FOOD[k.slice(5)] ? k.slice(5) : undefined);

export const AURAS: Record<string, AuraDef> = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith("_"))) as Record<string, AuraDef>;
// блюда: имя и значок берутся у самого блюда, бонусы клиент показывает подсказкой еды
for (const d of Object.values(FOOD)) {
  AURAS[foodAuraKey(d.id)] = { name: d.name, desc: "Бонусы еды действуют, пока не истечёт время.", kind: "buff", icon: d.icon };
}

/** Место ключа в списке: бафы и дебафы выстраиваются по порядку записей в data/auras.json, блюда — в конце. */
export const AURA_INDEX: Record<string, number> = Object.fromEntries(Object.keys(AURAS).map((k, i) => [k, i]));

/**
 * Сравнение для списка значков: сначала бафы, затем дебафы; внутри — по порядку в data/auras.json (неизвестный ключ — в конец).
 */
export function auraCompare(a: string, b: string): number {
  const ka = AURAS[a]?.kind === "debuff" ? 1 : 0, kb = AURAS[b]?.kind === "debuff" ? 1 : 0;
  return ka - kb || (AURA_INDEX[a] ?? 1e9) - (AURA_INDEX[b] ?? 1e9) || (a < b ? -1 : a > b ? 1 : 0);
}

/** Остаток времени в углу значка: «12с», «3м», «1ч» (округление вверх: «1с» держится до самого конца). */
export function auraTimeLabel(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s}с`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m}м` : `${Math.ceil(m / 60)}ч`;
}
/** То же словами, для подсказки: «12 с», «3 мин.», «1 ч». */
export function auraTimeWords(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} с`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m} мин.` : `${Math.ceil(m / 60)} ч`;
}

/**
 * Текст описания с подставленными значениями: {v} и {n}. Предложение, в котором нужного значения нет, пропускается
 * (нет стаков — нет и «Стаков: {n}.»), чтобы на экране не оставались «?» и пустые скобки.
 */
export function auraText(desc: string, v?: number, n?: number, fmt: (x: number) => string = String): string {
  return desc
    .split(/(?<=\.)\s+/)
    .filter((s) => (!s.includes("{v}") || v) && (!s.includes("{n}") || n))
    .map((s) => s.replace("{v}", fmt(v ?? 0)).replace("{n}", fmt(n ?? 0)))
    .join(" ");
}
