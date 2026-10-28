/** Переключатели вау-эффектов из data/wow-fx.json. Всё по умолчанию выключено. */
import tune from "../../../../data/wow-fx.json";

type Tune = typeof tune;
export type WowKey = Exclude<keyof Tune, "$about">;
/** Подмена для проверки (localStorage wowFx=1, tests/wow-ingame.ts): включает модули без правки json. */
let force = (() => { try { return localStorage.getItem("wowFx") === "1"; } catch { return false; } })(); // localStorage wowFx=1 — включить всё без правки json (снимки, проверка)
export const wowForce = (v: boolean) => { force = v; };
export const wowOn = (k: WowKey) => force || (tune[k] as { on: boolean }).on;
export const wowCfg = <K extends WowKey>(k: K): Tune[K] => tune[k];

/** Общий ветер для флагов, цепей, облаков: плавная сумма синусов, зависит только от времени (у всех одинаково). s 0.35..1 — сила. */
export function wind(tMs: number): { s: number; gust: number } {
  const t = tMs / 1000;
  const gust = 0.5 + 0.5 * Math.sin(t * 0.37) * Math.sin(t * 0.91 + 1.3);
  return { s: 0.35 + 0.65 * gust, gust };
}
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
