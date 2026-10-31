/**
 * Метрики таблицы «уровень × редкость» (docs/art/gear.md §2): сходство иконок и «богатство вида». Общие для tier.ts (лист и проверка)
 * и tiersearch.ts (подбор форм по ступеням и редкостям).
 *
 * Иконки теперь одного размера (icons.ts → fit, корпус 60 % поля), поэтому площадь иконки больше не говорит о богатстве (прежняя формула «площадь/9 + …»).
 * Богатство = мастерство ступени + видимые детали:
 *   score = 5 × ступень (материал и мастерство: железо → … → звёздное серебро, gear.md §2) + число видимых деталей иконки (словарь match.ts, ≥ 2 px;
 *           те же детали match сверяет с героем) + 1 за свечение + пиксели вещи на герое × 0,01 (крупнее силуэт — чуть богаче).
 * Правила (tier.ts): ступень N+2 богаче любой вещи N; легендарка N не богаче эпика N+1 больше чем на 8 %. Иначе говоря, редкость добавляет детали
 * ступенями (обычная — 0–2, редкая — 3–4, эпическая — 5–7, легендарная — 8–10), а легендарка ступени не перегружена деталями сверх эпика следующей.
 */
import { PC } from "../canvas";
import { renderLayers } from "../hero147/base_b";
import { baseView, dress, viewLook, type Slot } from "./gear";
import { icon } from "./icons";
import { featOf } from "./match";

/** сходство силуэтов: IoU масок (непрозрачные пиксели) двух иконок */
export function iou(a: PC, b: PC) { let i = 0, u = 0; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const p = (a.get(x, y)?.[3] ?? 0) > 0, q = (b.get(x, y)?.[3] ?? 0) > 0; if (p && q) i++; if (p || q) u++; } return u ? i / u : 0; }
export const SIM = 0.8, CSIM = 0.72, CIOU = 0.62;
/** гистограмма цвета: тон 12 × светлота 3, серые — отдельно (доли непрозрачных пикселей) */
export function hist(im: PC) { const o = new Map<number, number>(); let n = 0; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const q = im.get(x, y); if (!q || !q[3]) continue; const [r, g, bb] = q, mx = Math.max(r, g, bb), mn = Math.min(r, g, bb), l = (mx + mn) / 510, sat = mx - mn; let k: number; if (sat < 28) k = 100 + Math.min(2, Math.floor(l * 3)); else { let hu = mx === r ? (g - bb) / sat : mx === g ? 2 + (bb - r) / sat : 4 + (r - g) / sat; hu = (hu * 60 + 360) % 360; k = Math.floor(hu / 30) * 3 + Math.min(2, Math.floor(l * 3)); } o.set(k, (o.get(k) ?? 0) + 1); n++; } for (const [k, v] of o) o.set(k, v / n); return o; }
/** сходство цвета: пересечение гистограмм; латы одной ступени — один металл: серые пиксели не сравниваем, почти бесцветные вещи — нейтрально (0,5) */
export function colorSimH(A: Map<number, number>, B: Map<number, number>) {
  const chroma = (o: Map<number, number>) => [...o].filter(([k]) => k < 100).reduce((q, [, v]) => q + v, 0);
  const ca = chroma(A), cb = chroma(B); if (ca < 0.12 || cb < 0.12) return 0.5;
  let s = 0; for (const [k, v] of A) if (k < 100) s += Math.min(v / ca, (B.get(k) ?? 0) / cb); return s;
}
export const colorSim = (a: PC, b: PC) => colorSimH(hist(a), hist(b));
/** похожи: силуэт почти совпадает, или силуэт близок и цвет тот же */
export const simOf = (i: number, c: number) => ({ i: +i.toFixed(2), c: +c.toFixed(2), bad: i > SIM || (i > CIOU && c > CSIM) });
export const similar = (a: PC, b: PC) => simOf(iou(a, b), colorSim(a, b));

/** пиксели вещи на герое (вид вниз, покой) */
export function heroPx(slot: Slot, it: any, rarity: string) {
  const lk = dress({ fac: "sol", sex: "m", hair: "tousled" }, { name: "", rarity, level: 1, items: { [slot]: it } } as any, "sol", [slot]);
  const [a] = renderLayers(viewLook(lk, "down"), baseView("down"), "idle", 0, [(p) => p.slot === slot || p.slot === "crest"]);
  let n = 0; for (let y = 0; y < a.img.h; y++) for (let x = 0; x < a.img.w; x++) if (a.img.has(x, y)) n++;
  return n;
}
export const richFormula = "score = 5 × ступень + видимые детали иконки + 1 за свечение + пиксели вещи на герое × 0,01";
export const richScore = (t: number, feats: number, glow: boolean, hero: number) => +(5 * t + feats + (glow ? 1 : 0) + hero * 0.01).toFixed(1);
/** видимые детали иконки (≥ 2 px) по общему словарю match.ts; «лицо/внутренность» шлема — не украшение */
export function featsOf(slot: Slot, ic: ReturnType<typeof icon>) { const f = new Set<string>(); ic.ip.forEach((p, k) => { const q = featOf(slot, p.g, p.ft, 0); if (q && q !== "face" && ic.vis[k] >= 2) f.add(q); }); return f; }
/** богатство вида вещи ступени t и её иконка */
export function richness(slot: Slot, it: any, rarity: string, t: number) {
  const ic = icon(slot, it, "sol", rarity), f = featsOf(slot, ic), hero = heroPx(slot, it, rarity);
  return { ic, hero, feats: [...f], glow: ic.emis.length, score: richScore(t, f.size, ic.emis.length > 0, hero) };
}
