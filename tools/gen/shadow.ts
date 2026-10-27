/**
 * Единое правило теней декора (задача «тени»): свет сверху слева, тень падает вправо-вниз.
 *  1) контактная тень лежит под самым основанием: многоугольник следа (footprint) расширен на 1 px и заходит под предмет — без зазоров и без «плиты» сбоку;
 *  2) в кадре только короткий сдвиг (контактная тень); длинную падающую рисует клиент (shadows.ts)
 *  (старое правило: падающая тень — след, сдвинутый на (s, 0,45·s), s = 0,3·высота (4…12 px); тень — выпуклая оболочка следа и сдвинутого следа, одним куском;
 *  3) плотность везде одна (SHADOW_A), мягкий край в 1 px; перекрытия не накапливаются (берётся максимум).
 * Рисовать ПЕРВЫМ, до самого предмета. Якорь кадров не меняется: след задаётся по основанию, как нарисован предмет.
 */
import type { PC, RGBA } from "./canvas";

export const SHADOW_A = 100;
const SHADOW_COL: RGBA = [12, 8, 18, 255];
type Pt = [number, number];

function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Расстояние внутрь выпуклого многоугольника (>0 — внутри) для мягкого края. */
function inside(poly: Pt[], x: number, y: number): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1;
    m = Math.min(m, (ex * (y - a[1]) - ey * (x - a[0])) / l);
  }
  return m;
}
/** Тень по следу fp (выпуклый многоугольник основания) и высоте предмета h. */
let calls = 0;
export const shadowCallCount = () => calls;
export function shadowFoot(c: PC, fp: Pt[], h: number) {
  calls++;
  // в кадре — только контактная тень у основания (3 px вправо, 1 вниз); длинную рисует клиент по времени суток (client/src/game/shadows.ts). SHADOW_LONG=1 возвращает старую длинную
  const s = process.env.SHADOW_LONG === "1" ? Math.max(4, Math.min(12, h * 0.3)) : 3, v: Pt[] = fp.map(([x, y]) => [x + s, y + s * (process.env.SHADOW_LONG === "1" ? 0.45 : 0.35)]);
  const grown: Pt[] = fp.map(([x, y]) => [x, y + 1]);
  const poly = hull([...grown, ...v]);
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  // ориентация: hull даёт обход с положительной площадью в системе с y вниз — приводим знак расстояния
  let area = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sign = area > 0 ? 1 : -1;
  for (let y = Math.floor(Math.min(...ys)) - 1; y <= Math.ceil(Math.max(...ys)) + 1; y++)
    for (let x = Math.floor(Math.min(...xs)) - 1; x <= Math.ceil(Math.max(...xs)) + 1; x++) {
      const d = sign * inside(poly, x + 0.5, y + 0.5);
      if (d < -0.5) continue;
      const a = Math.round(SHADOW_A * (d >= 0.5 ? 1 : d + 0.5 < 0.35 ? 0.35 : d + 0.5));
      const cur = c.get(x, y);
      if (!cur || cur[3] < a) c.set(x, y, [SHADOW_COL[0], SHADOW_COL[1], SHADOW_COL[2], a]);
    }
}
/** След-брусок в 3/4: лицевая кромка x0..x1 на y = yb, боковая глубина D = [dx, dy<0] вправо-вверх (volume-lib depth()). */
export function shadowBox(c: PC, x0: number, x1: number, yb: number, D: [number, number], h: number) {
  shadowFoot(c, [[x0, yb], [x1, yb], [x1 + D[0], yb + D[1]], [x0 + D[0], yb + D[1]]], h);
}
/** След-круг (эллипс основания в 3/4: ry ≈ 0,4·rx). */
export function shadowDisc(c: PC, cx: number, cy: number, rx: number, ry: number, h: number) {
  const pts: Pt[] = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  shadowFoot(c, pts, h);
}
