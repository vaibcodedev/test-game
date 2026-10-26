/** Форматирование чисел для объяснений: русская запятая, без хвостовых нулей, пробел в тысячах. */
export const num = (x: number, d = 2): string => {
  if (!Number.isFinite(x)) return "—";
  const s = (+x.toFixed(d)).toString();
  const [i, f] = s.split(".");
  const neg = i.startsWith("-");
  const digits = neg ? i.slice(1) : i;
  const grouped = digits.length > 4 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : digits;
  return (neg ? "−" : "") + grouped + (f ? "," + f : "");
};
export const mult = (x: number, d = 2) => "×" + num(x, d);
export const pct = (x: number, d = 1) => num(x * 100, d) + " %";
export const TILE = 32;
export const BASE_PLAYER_SPEED = 150;
/** Склонение: plural(5, "клетка", "клетки", "клеток"). */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.round(n)) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
export const cells = (px: number, d = 2) => { const c = px / TILE; return num(c, d) + " " + (Number.isInteger(+c.toFixed(d)) ? plural(c, "клетка", "клетки", "клеток") : "клетки"); };
export const secs = (s: number) => `${num(s, 2)} с`;
export const msToSec = (ms: number) => `${num(ms / 1000, 2)} с`;
