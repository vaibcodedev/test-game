/**
 * Объёмный декор (Поля вечных битв и мир): общая основа. Стиль — как новые здания задачи 141 (tools/gen/walls141-*.ts):
 * вид 3/4 (фасад к зрителю, глубина уходит вверх-вправо, видна правая грань в тени и верх), свет сверху-слева,
 * 5+ тонов на материал, контур 1 px тёмным тоном (не чёрный), тень у основания падает вправо-вниз.
 * Освещение считается по нормали грани (Lambert + подсветка) и переводится в дробный индекс рампы.
 */
import { PC, hash01, hex, mix, pnoise, ramp, shade, withA, type RGBA, type Ramp } from "./canvas";
import { OUT, SHADOW, tone } from "./walls141-lib";
import { shadowBox, shadowDisc, shadowFoot } from "./shadow";

export { PC, hash01, hex, mix, pnoise, ramp, shade, withA, OUT, SHADOW, tone };
export type { RGBA, Ramp };

/** Нормаль: x вправо, y вверх, z к зрителю. */
export type N3 = [number, number, number];
const LT: N3 = (() => { const v: N3 = [-0.55, 0.75, 0.3], l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
/** Освещённость нормали 0..1: верх ≈0.95, фасад ≈0.65, правая грань ≈0.1. */
export function light(n: N3): number {
  const l = Math.hypot(...n) || 1, b = (n[0] * LT[0] + n[1] * LT[1] + n[2] * LT[2]) / l;
  return Math.max(0, Math.min(1, (b + 0.7) / 1.55));
}
/** Цвет материала по нормали и сдвигу тона (фактура, швы, затенение). */
export const litC = (r: Ramp, n: N3, off = 0) => tone(r, light(n) * (r.length - 1) + 0.15 + off);

export const FRONT: N3 = [0, 0, 1], TOP: N3 = [0, 1, 0], RIGHT: N3 = [1, 0, 0];
/** Вектор глубины на экране: глубина d px уходит вправо и вверх. */
export const depth = (d: number): [number, number] => [Math.round(d * 0.6), -Math.round(d * 0.55)];

/** Фактура: сдвиг тона пикселя (x, y — экранные). */
export type Tex = (x: number, y: number) => number;
export const noTex: Tex = () => 0;
/** Доски: вертикальные (шов каждые w px) с волокном. */
export const planksV = (w: number, seed = 1, amp = 0.35): Tex => (x, y) => {
  const k = Math.floor(x / w), i = ((x % w) + w) % w;
  return (i === w - 1 ? -1.1 : i === 0 ? 0.35 : 0) + (hash01(k, 3, seed) - 0.5) * 0.5 + (pnoise(x * 3, y, 4, 256, seed + k) - 0.5) * amp;
};
/** Доски горизонтальные. */
export const planksH = (h: number, seed = 1, amp = 0.35): Tex => (x, y) => {
  const k = Math.floor(y / h), j = ((y % h) + h) % h;
  return (j === h - 1 ? -1.1 : j === 0 ? 0.35 : 0) + (hash01(k, 5, seed) - 0.5) * 0.5 + (pnoise(x, y * 3, 4, 256, seed + k) - 0.5) * amp;
};
/** Шум (камень, ткань). */
export const grain = (seed = 1, amp = 0.5, cell = 3): Tex => (x, y) => (pnoise(x, y, cell, 256, seed) - 0.5) * amp * 2 + (hash01(x, y, seed) < 0.04 ? -0.6 : 0);
export const addTex = (...ts: Tex[]): Tex => (x, y) => ts.reduce((s, t) => s + t(x, y), 0);

type Pt = [number, number];
/** Точка внутри многоугольника (чётно-нечётно, центр пикселя). */
function inside(pts: Pt[], x: number, y: number) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Заливка многоугольника функцией цвета (по центрам пикселей). */
export function fillPoly(pc: PC, pts: Pt[], col: (x: number, y: number) => RGBA | null) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++)
      if (inside(pts, x + 0.5, y + 0.5)) { const c = col(x, y); if (c) pc.set(x, y, c); }
}
/** Грань-многоугольник с нормалью n, материалом r и фактурой; кромки: верхняя/левая светлее, нижняя темнее (фаска). */
export function face(pc: PC, pts: Pt[], r: Ramp, n: N3, tex: Tex = noTex, bevel = true) {
  const ys = pts.map((p) => p[1]), y1 = Math.max(...ys), y0 = Math.min(...ys);
  fillPoly(pc, pts, (x, y) => {
    let off = tex(x, y);
    if (bevel) {
      if (!inside(pts, x + 0.5, y - 0.5)) off += 0.6; // верхняя кромка
      else if (!inside(pts, x - 0.5, y + 0.5)) off += 0.35; // левая
      if (!inside(pts, x + 0.5, y + 1.5)) off -= 0.45; // нижняя
    }
    void y0; void y1;
    return litC(r, n, off);
  });
}
/** Нормаль боковой грани выдавливания по экранной нормали ребра (nx вправо, ny вниз). */
const sideN = (nx: number, ny: number): N3 => [nx, -ny, 0];

export interface Mat { r: Ramp; tex?: Tex }
/**
 * Призма: выпуклый фасад pts выдавливается вглубь на D (экранный сдвиг вправо-вверх). Видимые боковые грани (верх, правая,
 * скаты) рисуются первыми, фасад — последним. mats: front, side (правые/нижние), top (верхние).
 */
export function prism(pc: PC, pts: Pt[], D: Pt, front: Mat, side: Mat = front, top: Mat = front, sideTex?: (nx: number, ny: number) => Tex | undefined) {
  const n = pts.length;
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0] / n; cy += p[1] / n; }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    if (nx * D[0] + ny * D[1] <= 0.01) continue; // грань смотрит от зрителя
    const m = ny < -0.5 ? top : side;
    face(pc, [a, b, [b[0] + D[0], b[1] + D[1]], [a[0] + D[0], a[1] + D[1]]], m.r, sideN(nx, ny), sideTex?.(nx, ny) ?? m.tex ?? noTex);
  }
  face(pc, pts, front.r, FRONT, front.tex ?? noTex);
}
/** Ящик: фасад x,y (левый верх), w×h, глубина d. */
export function box(pc: PC, x: number, y: number, w: number, h: number, d: number, front: Mat, side: Mat = front, top: Mat = front) {
  prism(pc, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], depth(d), front, side, top);
}

/** Вертикальный цилиндр: ось cx, верх yTop, низ yBot, радиус r; крышка — эллипс (ry = r·k). tex(φ, y) — фактура по углу. */
export function cylV(pc: PC, cx: number, yTop: number, yBot: number, r: number, mat: Ramp, opt: { k?: number; cap?: Ramp | null; tex?: (phi: number, y: number) => number; ao?: number } = {}) {
  const k = opt.k ?? 0.45, ry = r * k;
  for (let y = Math.floor(yTop); y <= Math.ceil(yBot + ry); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const u = (x + 0.5 - cx) / r;
    if (Math.abs(u) > 1) continue;
    const c = Math.sqrt(1 - u * u), yb = yBot + ry * c;
    if (y + 0.5 < yTop || y + 0.5 > yb) continue;
    const phi = Math.asin(u);
    let off = opt.tex ? opt.tex(phi, y) : 0;
    if (opt.ao && yb - (y + 0.5) < opt.ao) off -= 0.6;
    if (Math.abs(u) > 0.93) off -= 0.3;
    pc.set(x, y, litC(mat, [u, 0, c], off));
  }
  if (opt.cap !== null) ellipseFace(pc, cx, yTop, r, ry, opt.cap ?? mat, TOP);
}
/** Плоский эллипс-грань (крышка, торец) с нормалью n и лёгким рефлексом по краю. */
export function ellipseFace(pc: PC, cx: number, cy: number, rx: number, ry: number, r: Ramp, n: N3, tex: Tex = noTex) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d > 1) continue;
    let off = tex(x, y);
    if (d > 0.62) off += dy < 0 ? -0.35 : 0.45; // дальний край в тени, ближний — светлая фаска
    pc.set(x, y, litC(r, n, off));
  }
}
/** Бревно (цилиндр) вдоль отрезка: поперечное затенение; торец end — спил с кольцами. */
export function log(pc: PC, x0: number, y0: number, x1: number, y1: number, rad: number, mat: Ramp, opt: { end?: Ramp | null; tip?: number; tex?: Tex } = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  let px = -uy, py = ux; // перпендикуляр, направим «вверх» на экране
  if (py > 0 || (py === 0 && px > 0)) { px = -px; py = -py; }
  const tip = opt.tip ?? 0;
  const xs = [x0, x1], ys = [y0, y1];
  for (let y = Math.floor(Math.min(...ys) - rad - 1); y <= Math.ceil(Math.max(...ys) + rad + 1); y++)
    for (let x = Math.floor(Math.min(...xs) - rad - 1); x <= Math.ceil(Math.max(...xs) + rad + 1); x++) {
      const qx = x + 0.5 - x0, qy = y + 0.5 - y0, t = qx * ux + qy * uy, s = qx * px + qy * py;
      if (t < 0 || t > L) continue;
      const rr = tip && t > L - tip ? rad * (L - t) / tip : rad;
      if (Math.abs(s) > rr) continue;
      const v = s / Math.max(rr, 0.5), c = Math.sqrt(Math.max(0, 1 - v * v));
      // нормаль: вдоль перпендикуляра (экранный «верх» -> мировой +y), плюс к зрителю
      const n: N3 = [px * v, -py * v, c];
      let off = opt.tex ? opt.tex(x, y) : (pnoise(t * 0.5, s * 3, 3, 256, 7) - 0.5) * 0.6;
      if (Math.abs(v) > 0.85) off -= 0.25;
      pc.set(x, y, litC(mat, n, off));
    }
  if (opt.end !== null && !tip) ellipseFace(pc, x1, y1, Math.max(1.5, rad * 0.55), rad, opt.end ?? mat, [ux, -uy, 0.6]);
}
/** Конус (крыша шатра): основание — эллипс cx,baseY,r,ry; вершина на h выше. stripes — число полос по кругу. */
export function cone(pc: PC, cx: number, baseY: number, r: number, ry: number, h: number, a: Ramp, b: Ramp = a, stripes = 0, seed = 1, bias = 0) {
  const beta = Math.atan2(r, h) * 0.75;
  for (let y = Math.floor(baseY - h); y <= Math.ceil(baseY + ry); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const f = Math.max(0, (baseY - (y + 0.5)) / h), w = r * (1 - f);
    if (w <= 0.2) continue;
    const u = (x + 0.5 - cx) / w;
    if (Math.abs(u) > 1) continue;
    if (f === 0) { const e = (x + 0.5 - cx) / r; if (y + 0.5 - baseY > ry * Math.sqrt(Math.max(0, 1 - e * e))) continue; }
    const phi = Math.asin(u), c = Math.cos(phi);
    const n: N3 = [Math.sin(phi) * Math.cos(beta), Math.sin(beta), c * Math.cos(beta)];
    const band = stripes ? Math.floor(((phi + Math.PI / 2) / Math.PI) * stripes + 0.5) % 2 : 0;
    let off = bias + (pnoise(x, y, 4, 256, seed) - 0.5) * 0.4 - f * 0.3;
    if (Math.abs(u) > 0.92) off -= 0.25;
    pc.set(x, y, litC(band ? b : a, n, off));
  }
}
/** Тень на земле: многоугольник полупрозрачным тёмным (под объект, рисуется первой). */
/** Тень на земле: общее правило (tools/gen/shadow.ts) по следу основания pts (выпуклый многоугольник) и высоте предмета h; рисуется первой. */
export function shadowPoly(pc: PC, pts: Pt[], h = 40) {
  shadowFoot(pc, pts as [number, number][], h);
}
export { shadowBox, shadowDisc };
/** Колесо с толщиной обода: диск к зрителю, обод выдавлен вглубь, спицы и ступица. */
export function wheel3(pc: PC, cx: number, cy: number, r: number, wood: Ramp, iron: Ramp, opt: { spokes?: number; thick?: number; rot?: number; broken?: boolean } = {}) {
  const th = opt.thick ?? 3, [ddx, ddy] = depth(th);
  // обод в глубину (правая/верхняя часть)
  for (let s = th; s >= 1; s--) {
    const ox = Math.round(ddx * s / th), oy = Math.round(ddy * s / th);
    ring(pc, cx + ox, cy + oy, r, 2, (u, v) => litC(iron, [u, -v, 0.2], -0.4));
  }
  ring(pc, cx, cy, r, 2, (u, v) => litC(iron, [u * 0.4, -v * 0.4, 1], -v * 0.6 - u * 0.3));
  ring(pc, cx, cy, r - 2, 1.4, (u, v) => litC(wood, [u * 0.3, -v * 0.3, 1], -v * 0.5));
  const ns = opt.spokes ?? 6, rot = opt.rot ?? 0;
  for (let k = 0; k < ns; k++) {
    if (opt.broken && k % 3 === 1) continue;
    const a = rot + (k / ns) * Math.PI * 2;
    log(pc, cx, cy, cx + Math.cos(a) * (r - 2.5), cy + Math.sin(a) * (r - 2.5), 0.9, wood, { end: null });
  }
  ellipseFace(pc, cx, cy, Math.max(2, r * 0.22), Math.max(2, r * 0.22), iron, [-0.3, 0.3, 1]);
}
function ring(pc: PC, cx: number, cy: number, r: number, w: number, col: (u: number, v: number) => RGBA) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d <= r && d > r - w) pc.set(x, y, col(dx / r, dy / r));
  }
}
/** Ткань фракций: 5 тонов. */
export const CLOTH = {
  white: ramp("#6e6874", "#9c96a2", "#c6c0ca", "#e6e1e8", "#fbf8fc"),
  gold: ramp("#5a3810", "#9a6418", "#d8a02c", "#ffd45e", "#fff2b4"),
  blue: ramp("#101c36", "#1c3462", "#2c5294", "#4878c0", "#78a6e0"),
  purple: ramp("#1a0c28", "#30184a", "#4c2a72", "#6e429e", "#9a6cc8"),
  black: ramp("#0e0c12", "#1a1620", "#28222e", "#383040", "#4a4054"),
  rag: ramp("#2a251c", "#443c2e", "#625744", "#827560", "#a4967c"),
  brown: ramp("#22180f", "#3a2a1c", "#584030", "#765842", "#94745a"),
  teal: ramp("#0a2a2c", "#124646", "#1e6a66", "#36968a", "#66c0ae"),
  cream: ramp("#6a604e", "#988c74", "#c4b89c", "#e2d8be", "#f8f0dc"),
  red: ramp("#300c12", "#5a161e", "#8a2a2c", "#b84a40", "#de7a62"),
};
export const WOOD = ramp("#24140c", "#3e2414", "#5e3a20", "#82552e", "#a87442", "#c69660");
export const WOOD_D = ramp("#120c0e", "#21171a", "#332428", "#483438", "#5e484a");
export const IRON = ramp("#141218", "#262430", "#3c3a48", "#5e5c6c", "#8a8898", "#b8b6c4");
export const LEATHER = ramp("#26160e", "#42281a", "#643e26", "#8a5a36", "#b07e50");
export const STONE = ramp("#25232b", "#3a3842", "#54515c", "#706c78", "#8e8a96", "#b0acb6");
export const MARBLE = ramp("#6c6874", "#928e98", "#b6b2ba", "#d4d0d6", "#ecE8ee".toLowerCase(), "#fcfaff");
export const STRAW = ramp("#4a3412", "#76561c", "#a2802c", "#c8a446", "#e6c870", "#f8e4a0");
export const ROPE = ramp("#3a3022", "#5e5038", "#86745a", "#ab9a7a");

/** Финал: контур по внешнему краю (тёмный тон, не чёрный). */
export const finish = (pc: PC) => pc.outline(OUT);

/** Кадр для игры: обрезка по непрозрачному, выравнивание по низу-центру в холст кратный 32 (как saveObject в battlefield.ts). */
export function frame32(pc: PC): PC {
  let x0 = pc.w, y0 = pc.h, x1 = -1, y1 = -1;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, W = Math.ceil(tw / 32) * 32, H = Math.ceil(th / 32) * 32, o = new PC(W, H);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const c = pc.get(x0 + x, y0 + y)!; if (c[3]) o.set(Math.floor((W - tw) / 2) + x, H - th + y, c); }
  return o;
}
