/** Ключевые позы → кадры (плавно, ease in-out), общие для питомцев прохода 4. */
import { ease } from "./lib";

type Val = number | number[] | number[][];
export function blend<T extends object>(a: T, b: T, t: number): T {
  const o = { ...a } as Record<string, Val>;
  for (const k of Object.keys(b)) {
    const x = (a as Record<string, Val>)[k], y = (b as Record<string, Val>)[k];
    if (typeof x === "number") o[k] = x + ((y as number) - x) * t;
    else if (Array.isArray(x) && typeof x[0] === "number") o[k] = (x as number[]).map((q, i) => q + ((y as number[])[i] - q) * t);
    else if (Array.isArray(x)) o[k] = (x as number[][]).map((v, i) => v.map((q, j) => q + ((y as number[][])[i][j] - q) * t));
  }
  return o as T;
}
export function keyed<T extends object>(rest: T, keys: { f: number; p: Partial<T>; e?: (t: number) => number }[], n: number): T[] {
  const full: { f: number; p: T; e?: (t: number) => number }[] = [];
  let cur = rest;
  for (const k of keys) { cur = { ...cur, ...k.p }; full.push({ f: k.f, p: cur, e: k.e }); }
  return Array.from({ length: n }, (_, f) => {
    let i = 0;
    while (i + 1 < full.length && full[i + 1].f <= f) i++;
    const a = full[i], b = full[Math.min(i + 1, full.length - 1)];
    const t = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f);
    return blend(a.p, b.p, (b.e ?? ease)(Math.max(0, Math.min(1, t))));
  });
}
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const easeIn = (t: number) => t * t;
