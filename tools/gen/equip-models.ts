/**
 * Иконки 48×48 моделей экипировки (data/items.json). Иконка составная: древко/рукоять + обмотка + гарда/крепление +
 * навершие/камень + украшения; затенение 3–4 тона, блики, тёмный контур. Силуэт — look.shape (архетип),
 * материалы — палитры каталога, украшения — look.deco, богатство отделки — look.rich. По docs/gear-visuals.md 2.1:
 * свечения и ореолов нет; иконка своя на каждую редкость: у r0 кайма нейтральная и камень тусклый,
 * у r≥1 камень и светлые тона каймы — цвет редкости. Бирюза заточки (#3ff0d0 ±40°) в камнях и рунах не используется.
 * Оружие рисуется в диагональной системе: u — вдоль древка/клинка снизу-слева вверх-вправо, v — поперёк (v<0 — к свету).
 */
import { PC, hex, mix, ramp, withA, type RGBA, type Ramp } from "./canvas";
import { BASE_ITEMS, ITEM_MODELS, ITEM_PALETTES, RARITY_COLORS, type ItemModel, type ModelLook } from "../../shared/items";

export const ICON = 48;
const WHITE = hex("#ffffff"), DARK = hex("#120e16"), VOIDC = hex("#06040a");
const RAMPS = new Map<string, Ramp>();
const RP = (id: string | undefined, fb: string): Ramp => {
  const key = id && ITEM_PALETTES[id] ? id : fb;
  let r = RAMPS.get(key);
  if (!r) { r = ramp(...ITEM_PALETTES[key]); RAMPS.set(key, r); }
  return r;
};
const cl = (i: number, lo = 0, hi = 4) => Math.max(lo, Math.min(hi, Math.round(i)));
const TAU = Math.PI * 2;

// ---- диагональная система координат ----
/** Масштаб 1.1: оружие занимает диагональ иконки почти от угла до угла. */
const O0 = 3, O1 = 45, S = Math.SQRT1_2 * 1.1;
type Pt = [number, number];
const P = (u: number, v: number): Pt => [O0 + (u + v) * S, O1 + (v - u) * S];
const UV = (x: number, y: number): Pt => { const dx = x + 0.5 - O0, dy = y + 0.5 - O1; return [(dx - dy) / (2 * S), (dx + dy) / (2 * S)]; };

interface K {
  c: PC; L: ModelLook; cat: string; fac: string; h: number; umb: boolean; sol: boolean; rich: number; rar: number;
  /** stone — «камень» навершия/вставки (камень модели или цвет рун) по правилу редкости. */
  mat: Ramp; trim: Ramp; gem: Ramp | null; stone: Ramp; haft: Ramp; cloth: Ramp; hide: Ramp; fx: Ramp; grip: Ramp; bone: Ramp;
  /** Легендарки (задача 113): герб на щите, огранка камня и оправа кольца/амулета. */
  crestKind?: string; stoneKind?: string; setting?: string;
}

// ---------------- примитивы ----------------
/** Многоугольник в (u,v) с градиентом поперёк (малые v — светлее). */
function dpoly(k: K, pts: Pt[], r: Ramp, vc = 0, span = 2, lo = 1, hi = 4) {
  k.c.poly(pts.map(([u, v]) => P(u, v)), (x, y) => r[cl(2.2 - (UV(x, y)[1] - vc) / span, lo, hi)]);
}
/** Освещённая заливка обычного многоугольника: свет сверху слева. */
const lit = (r: Ramp, cx: number, cy: number, s: number, lo = 0, hi = 4) => (x: number, y: number) => r[cl(2.2 - ((x + 0.5 - cx) + (y + 0.5 - cy) * 0.6) / s, lo, hi)];
function dline(k: K, u0: number, v0: number, u1: number, v1: number, c: RGBA, w = 1) { const a = P(u0, v0), b = P(u1, v1); k.c.line(a[0], a[1], b[0], b[1], c, w); }
function dset(k: K, u: number, v: number, c: RGBA) { const [x, y] = P(u, v); k.c.set(Math.floor(x), Math.floor(y), c); }
/** Ломаная со сходящей толщиной (рога, крючья, ветви, перья). */
function stroke(c: PC, pts: Pt[], w0: number, w1: number, col: RGBA | ((t: number) => RGBA)) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d * 2));
    for (let s = 0; s <= n; s++) {
      const t = (acc + (d * s) / n) / (total || 1), w = w0 + (w1 - w0) * t, cc = typeof col === "function" ? col(t) : col;
      const x = x0 + ((x1 - x0) * s) / n, y = y0 + ((y1 - y0) * s) / n;
      if (w <= 1.05) c.set(Math.round(x - 0.5), Math.round(y - 0.5), cc); else c.ellipse(x, y, w / 2, w / 2, cc);
    }
    acc += d;
  }
}
const dstroke = (k: K, uv: Pt[], w0: number, w1: number, col: RGBA | ((t: number) => RGBA)) => stroke(k.c, uv.map(([u, v]) => P(u, v)), w0, w1, col);
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 16, ry = r): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * ry] as Pt; });
/** Древко/рукоять: прямоугольник в (u,v) с объёмом. */
function shaft(k: K, u0: number, u1: number, w: number, r: Ramp, v = 0) { dpoly(k, [[u0, v - w / 2], [u1, v - w / 2], [u1, v + w / 2], [u0, v + w / 2]], r, v, w / 3.2, 1, 4); }
/** Обмотка: косые витки двух тонов. */
function wraps(k: K, u0: number, u1: number, w: number, r: Ramp, v = 0, step = 2) {
  shaft(k, u0, u1, w, r, v);
  for (let u = u0 + 0.6; u < u1 - 0.4; u += step) dline(k, u, v - w / 2 + 0.3, u + 0.9, v + w / 2 - 0.3, r[0], 1);
}
function band(k: K, u: number, w: number, v = 0, r = k.trim) { dpoly(k, [[u - 0.8, v - w / 2], [u + 0.8, v - w / 2], [u + 0.8, v + w / 2], [u - 0.8, v + w / 2]], r, v, 1, 1, 4); }
/** Камень в оправе с бликом. */
function gemAt(k: K, x: number, y: number, r: number, g: Ramp | null = k.gem) {
  const G = g ?? k.trim;
  k.c.ellipse(x, y, r + 0.9, r + 0.9, k.trim[1]);
  k.c.shadedEllipse(x, y, r, r, G);
  if (r >= 1.4 && k.rar >= 1) { k.c.set(Math.floor(x - r * 0.45), Math.floor(y - r * 0.45), WHITE); if (r >= 2.5) k.c.set(Math.floor(x - r * 0.45) + 1, Math.floor(y - r * 0.45), withA(WHITE, 150)); }
}
const dgem = (k: K, u: number, v: number, r: number, g: Ramp | null = k.gem) => gemAt(k, ...P(u, v), r, g);
function skull(k: K, x: number, y: number, s = 1, eyes: RGBA = k.gem ? k.gem[3] : DARK) {
  k.c.shadedEllipse(x, y, 3.6 * s, 3.3 * s, k.bone);
  k.c.poly([[x - 2.2 * s, y + 1.6 * s], [x + 2.2 * s, y + 1.6 * s], [x + 1.6 * s, y + 4.2 * s], [x - 1.6 * s, y + 4.2 * s]], k.bone[2]);
  const e = Math.max(1, Math.round(1.3 * s));
  k.c.rect(Math.round(x - 2 * s), Math.round(y - 0.3 * s), e, e, eyes); k.c.rect(Math.round(x + 0.8 * s), Math.round(y - 0.3 * s), e, e, eyes);
  k.c.set(Math.round(x - 0.2), Math.round(y + 1.6 * s), DARK);
  for (let i = -1; i <= 1; i++) k.c.set(Math.round(x + i * 1.1 * s), Math.round(y + 3.4 * s), k.bone[0]);
}
function wing(c: PC, x: number, y: number, dir: number, size: number, r: Ramp) {
  for (let i = 0; i < 5; i++) {
    const a = (-160 + i * 20) * (Math.PI / 180), L = size * (1 - i * 0.13);
    const ex = x - Math.cos(a) * L * dir, ey = y + Math.sin(a) * L;
    stroke(c, [[x, y], [(x + ex) / 2 - dir * 0.6, (y + ey) / 2 - 0.6], [ex, ey]], 3 - i * 0.35, 1, (t) => r[t < 0.3 ? 2 : i % 2 ? 3 : 4]);
  }
}
function horn(c: PC, x: number, y: number, dir: number, size: number, r: Ramp) {
  const pts: Pt[] = [[x, y], [x + dir * size * 0.45, y - size * 0.2], [x + dir * size * 0.8, y - size * 0.6], [x + dir * size * 0.75, y - size], [x + dir * size * 0.5, y - size * 1.2]];
  stroke(c, pts, Math.max(2.5, size * 0.38), 1, (t) => r[cl(4 - t * 2.4, 1, 4)]);
  for (let i = 1; i < 4; i++) { const [px, py] = pts[i]; c.set(Math.round(px), Math.round(py), r[1]); }
}
function sparkle(c: PC, x: number, y: number, col: Ramp, s = 1) {
  c.set(x, y, WHITE);
  for (let i = 1; i <= s; i++) for (const [dx, dy] of [[i, 0], [-i, 0], [0, i], [0, -i]]) c.set(x + dx, y + dy, withA(col[3], 230 - i * 70));
}
const RUNES = ["010111010", "110011010", "101010101", "111001111", "011110011", "100111100", "010101111"];
function rune(c: PC, x: number, y: number, col: RGBA, i: number) {
  const p = RUNES[Math.abs(i) % RUNES.length];
  for (let j = 0; j < 9; j++) if (p[j] === "1") c.set(x + (j % 3) - 1, y + Math.floor(j / 3) - 1, col);
}
/** Многоугольник клинка: профиль полуширин (a — к свету, b — в тень), изгиб cv, острие tip. */
type HW = (t: number) => [number, number];
interface BladeOpt { cv?: (t: number) => number; tip?: number; fuller?: boolean; vo?: number; teeth?: number; backTeeth?: number; hole?: number; ridge?: boolean; r?: Ramp; runes?: boolean }
function blade(k: K, u0: number, len: number, hw: HW, o: BladeOpt = {}) {
  const cv = o.cv ?? (() => 0), tip = o.tip ?? 0.16, vo = o.vo ?? 0, R = o.r ?? k.mat;
  const W = (t: number): [number, number] => { let [a, b] = hw(t); if (t > 1 - tip) { const f = Math.pow((1 - t) / tip, 0.9); a *= f; b *= f; } return [a, b]; };
  const n = 64, A: Pt[] = [], B: Pt[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, [a, b] = W(t), c0 = cv(t) + vo; A.push(P(u0 + t * len, c0 - a)); B.push(P(u0 + t * len, c0 + b)); }
  k.c.poly([...A, ...B.reverse()], (x, y) => {
    const [u, v] = UV(x, y), t = Math.max(0, Math.min(1, (u - u0) / len)), [a, b] = W(t), d = v - (cv(t) + vo);
    if (o.fuller && t > 0.03 && t < 0.72 && Math.abs(d) < 0.75) return d < 0 ? R[1] : R[0];
    if (d < -a + 1) return R[4];
    if (o.ridge !== false && Math.abs(d) < 0.5) return R[2];
    if (d < 0) return R[3];
    if (d > b - 1) return R[1];
    return R[2];
  });
  if (o.teeth) for (let t = 0.08; t < 0.86; t += o.teeth / len) { const [, b] = W(t), u = u0 + t * len, c0 = cv(t) + vo + b; dpoly(k, [[u, c0 - 0.3], [u + o.teeth * 0.5, c0 + 1.8], [u + o.teeth, c0 - 0.3]], R, c0, 1, 1, 3); }
  if (o.backTeeth) for (let t = 0.1; t < 0.8; t += o.backTeeth / len) { const [a] = W(t), u = u0 + t * len, c0 = cv(t) + vo - a; dpoly(k, [[u, c0 + 0.3], [u + o.backTeeth * 0.35, c0 - 2.6], [u + o.backTeeth, c0 + 0.3]], R, c0, 1, 2, 4); }
  if (o.hole) { const [x, y] = P(u0 + o.hole * len, cv(o.hole) + vo); for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) if (Math.hypot(xx, yy) < 1.6) k.c.clear(Math.round(x) + xx, Math.round(y) + yy); }
  if (o.runes || k.L.deco === "runes") for (let t = 0.12, i = 0; t < 0.74; t += 0.16, i++) { const [x, y] = P(u0 + t * len, cv(t) + vo); rune(k.c, Math.round(x), Math.round(y), i % 2 ? k.fx[3] : k.fx[4], i + (k.h & 7)); }
  if (k.L.deco === "filigree") for (let t = 0.04; t < 0.3; t += 0.045) dset(k, u0 + t * len, cv(t) + vo + 0.4, k.trim[3 + ((t * 100) % 2 < 1 ? 1 : 0)]);
  const [gx, gy] = P(u0 + len * 0.82, cv(0.82) + vo - W(0.82)[0] + 0.6);
  k.c.set(Math.floor(gx), Math.floor(gy), WHITE);
}
function guard(k: K, u: number, half: number, type: string, v = 0) {
  const t = k.trim, big = k.rich >= 3;
  switch (type) {
    case "curved": dstroke(k, [[u + 3.6, v - half], [u + 0.6, v - half * 0.6], [u, v], [u + 0.6, v + half * 0.6], [u + 3.6, v + half]], 3.6, 2.2, (q) => t[q < 0.5 ? 3 : 2]); for (const s of [-1, 1]) k.c.shadedEllipse(...P(u + 3.6, v + s * half), 1.4, 1.4, t); break;
    case "disc": k.c.shadedEllipse(...P(u, v), half * 0.62, half * 0.62, t); k.c.ellipse(...P(u, v), 1.2, 1.2, t[1]); break;
    case "bar": dpoly(k, [[u - 1.4, v - half * 0.8], [u + 1.4, v - half * 0.8], [u + 1.4, v + half * 0.8], [u - 1.4, v + half * 0.8]], t, v, 1.4); dline(k, u - 1.4, v - half * 0.8, u - 1.4, v + half * 0.8, t[4], 1); break;
    case "wings": dpoly(k, [[u - 1.2, v - 2.4], [u + 1.2, v - 2.4], [u + 1.2, v + 2.4], [u - 1.2, v + 2.4]], t, v, 1.6); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) dstroke(k, [[u, v + s * 1.5], [u - 1 - i * 1.6, v + s * (half + 2 - i * 0.7)]], 2.8 - i * 0.4, 1, t[cl(4 - i, 1, 4)]); break;
    case "claw": for (const s of [-1, 1]) { dstroke(k, [[u, v], [u + 0.6, v + s * half * 0.8], [u + 4.6, v + s * (half + 0.8)]], 3, 1, (q) => t[cl(3.4 - q * 1.6)]); dstroke(k, [[u - 0.5, v + s * 2], [u - 2.6, v + s * (half * 0.7)]], 2, 1, t[2]); } dpoly(k, [[u - 1.4, v - 2], [u + 1.4, v - 2], [u + 1.4, v + 2], [u - 1.4, v + 2]], t, v, 1.4); break;
    case "ornate": dpoly(k, [[u - 1.2, v - half], [u + 1.2, v - half], [u + 1.2, v + half], [u - 1.2, v + half]], t, v, 1.8); for (const s of [-1, 1]) dstroke(k, [[u, v + s * half], [u + 2, v + s * (half + 1.4)], [u + 3.2, v + s * (half - 0.4)], [u + 1.8, v + s * (half - 1)]], 1.6, 1, t[3]); dpoly(k, [[u - 2.4, v], [u, v - 2.4], [u + 2.4, v], [u, v + 2.4]], t, v, 1.2); break;
    default: dpoly(k, [[u - 1.3, v - half], [u + 1.3, v - half], [u + 1.3, v + half], [u - 1.3, v + half]], t, v, half / 2.2); dline(k, u - 1.3, v - half, u - 1.3, v + half, t[4], 1); for (const s of [-1, 1]) dpoly(k, [[u, v + s * (half - 0.5)], [u + 1.8, v + s * (half + 1)], [u, v + s * (half + 2.4)], [u - 1.8, v + s * (half + 1)]], t, v + s * half, 1.2);
  }
  // ярус: у богатых гард — шипы-язычки на клинок и вторая пара камней
  if (big && type !== "disc") for (const s of [-1, 1]) dpoly(k, [[u + 0.8, v + s * 2.2], [u + 4.6, v + s * 1.2], [u + 0.8, v + s * 0.6]], t, v + s, 1);
  if (type !== "disc") dgem(k, u, v, k.gem ? 1.7 : 1.1, k.gem ? k.gem : k.trim);
  if (k.rich >= 2 && k.gem && half >= 5) for (const s of [-1, 1]) dgem(k, u, v + s * (half * 0.55), 0.9);
}
function pommel(k: K, u: number, type: string, v = 0) {
  const [x, y] = P(u, v), big = k.rich >= 2 ? 1.2 : 1;
  switch (type) {
    case "gem": k.c.shadedEllipse(x, y, 3 * big, 3 * big, k.trim); gemAt(k, x, y, 1.9 * big, k.gem ?? k.stone); break;
    case "ring": k.c.ellipse(x, y, 3.6, 3.6, k.trim[2]); k.c.ellipse(x - 0.6, y - 0.6, 3, 3, k.trim[3]); for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) if (Math.hypot(xx, yy) < 1.7) k.c.clear(Math.round(x) + xx, Math.round(y) + yy); break;
    case "spike": dpoly(k, [[u + 0.8, v - 2.2], [u - 4.4, v], [u + 0.8, v + 2.2]], k.trim, v, 1.2); k.c.shadedEllipse(x, y, 1.8, 1.8, k.trim); break;
    case "skull": skull(k, x, y, 0.8); break;
    default: k.c.shadedEllipse(x, y, 2.8 * big, 2.8 * big, k.trim); if (big > 1) k.c.set(Math.round(x), Math.round(y), k.stone[3]);
  }
}

// ---------------- мечи и кинжалы ----------------
interface SwordDef { len: number; hw: HW; grip: number; o?: BladeOpt; guard?: string; gh?: number; pommel?: string }
const SW: Record<string, SwordDef> = {
  broad: { len: 30, hw: () => [3.1, 3.1], grip: 9, o: { fuller: true, tip: 0.13 }, gh: 6.5 },
  saber: { len: 31, hw: () => [1.5, 2.6], grip: 9, o: { cv: (t) => -5 * t * t, tip: 0.2, ridge: false }, guard: "curved", gh: 5 },
  flame: { len: 31, hw: () => [2.2, 2.2], grip: 9, o: { cv: (t) => 1.25 * Math.sin(t * Math.PI * 8) * (1 - t * 0.4), tip: 0.12 }, guard: "ornate", gh: 6 },
  serrated: { len: 30, hw: () => [2.6, 2.6], grip: 9, o: { teeth: 3, fuller: true }, gh: 6 },
  runic: { len: 31, hw: () => [2.9, 2.9], grip: 9, o: { fuller: true, runes: true, tip: 0.15 }, gh: 6.5 },
  falchion: { len: 28, hw: (t) => [1.6, 1.9 + 2.6 * t], grip: 9, o: { tip: 0.14, ridge: false }, guard: "bar", gh: 5 },
  rapier: { len: 34, hw: () => [0.9, 0.9], grip: 8, o: { tip: 0.22 }, guard: "disc", gh: 6 },
  leaf: { len: 25, hw: (t) => { const w = 1.8 + 1.7 * Math.sin(Math.PI * Math.min(1, t * 1.08)); return [w, w]; }, grip: 8, o: { fuller: true, tip: 0.22 }, guard: "bar", gh: 4.5, pommel: "ring" },
  zwei: { len: 33, hw: () => [2.6, 2.6], grip: 14, o: { fuller: true, tip: 0.13 }, gh: 8 },
  claymore: { len: 33, hw: () => [2.7, 2.7], grip: 14, o: { fuller: true, tip: 0.15 }, guard: "curved", gh: 8 },
  flamberge: { len: 33, hw: () => [2.2, 2.2], grip: 14, o: { cv: (t) => 1.3 * Math.sin(t * Math.PI * 10), tip: 0.1 }, gh: 7.5 },
  executioner: { len: 31, hw: () => [3.7, 3.7], grip: 13, o: { tip: 0.05, hole: 0.84, ridge: false }, guard: "bar", gh: 6 },
  jagged: { len: 32, hw: () => [3, 3], grip: 13, o: { backTeeth: 4, tip: 0.18 }, guard: "claw", gh: 6 },
  runeblade: { len: 34, hw: (t) => [3.3 - 0.6 * t, 3.3 - 0.6 * t], grip: 14, o: { fuller: true, runes: true, tip: 0.14 }, guard: "ornate", gh: 8 },
  cleaver: { len: 30, hw: (t) => [2.4, 2.4 + 2.6 * t], grip: 13, o: { tip: 0.05, ridge: false }, guard: "bar", gh: 5.5 },
  bastard: { len: 33, hw: (t) => [2.6 - 0.8 * t, 2.6 - 0.8 * t], grip: 12, o: { fuller: true, tip: 0.22 }, guard: "curved", gh: 7, pommel: "gem" },
  // новые формы (задача 113): мечи
  gladius: { len: 24, hw: (t) => { const w = 2.4 + 0.5 * Math.sin(t * Math.PI); return [w, w]; }, grip: 8, o: { fuller: true, tip: 0.2 }, guard: "bar", gh: 5, pommel: "ball" },
  crystal: { len: 29, hw: (t) => { const w = 2.2 + 1.5 * Math.abs(Math.sin(t * 9)); return [w, w]; }, grip: 9, o: { tip: 0.1 }, guard: "claw", gh: 6 },
  bolt: { len: 31, hw: () => [1.9, 1.9], grip: 9, o: { cv: (t) => 2 * (Math.abs(((t * 4) % 2) - 1) - 0.5), tip: 0.1, ridge: false }, guard: "ornate", gh: 6 },
  bone: { len: 30, hw: () => [2.4, 2.4], grip: 9, o: { teeth: 3.4, backTeeth: 5 }, guard: "claw", gh: 6, pommel: "skull" },
  scimitar: { len: 30, hw: (t) => [1.4, 1.6 + 2.2 * Math.sin(Math.PI * Math.min(1, t * 1.1))], grip: 9, o: { cv: (t) => -7 * t * t, tip: 0.18, ridge: false }, guard: "curved", gh: 5 },
  // двуручные
  icicle: { len: 35, hw: (t) => [3.5 * (1 - 0.78 * t), 3.5 * (1 - 0.78 * t)], grip: 13, o: { fuller: true, tip: 0.06 }, guard: "disc", gh: 7 },
  tidal: { len: 34, hw: () => [2.5, 2.5], grip: 14, o: { cv: (t) => 2.4 * Math.sin(t * Math.PI * 4) * (0.3 + t), tip: 0.1 }, guard: "wings", gh: 7.5 },
  obsidian: { len: 32, hw: (t) => [3.4, 3.4 - 0.9 * t], grip: 13, o: { backTeeth: 3.2, teeth: 3.2, hole: 0.62, tip: 0.14 }, guard: "claw", gh: 6.5 },
  // кинжалы и парные
  thorn: { len: 16, hw: () => [1.5, 1.5], grip: 6, o: { teeth: 2.4, backTeeth: 2.4, tip: 0.35 }, guard: "claw", gh: 3, pommel: "spike" },
  shard: { len: 17, hw: (t) => { const w = 1.4 + 1.2 * Math.abs(Math.sin(t * 7)); return [w, w]; }, grip: 6, o: { tip: 0.3 }, guard: "bar", gh: 3.4 },
  bloodletter: { len: 18, hw: () => [1.4, 1.4], grip: 6, o: { cv: (t) => 1.4 * Math.sin(t * Math.PI * 3), fuller: true, tip: 0.35 }, guard: "ornate", gh: 3.6, pommel: "gem" },
  talon: { len: 22, hw: () => [1.3, 2.4], grip: 7, o: { cv: (t) => -4.6 * t * t, tip: 0.3, ridge: false }, guard: "claw", gh: 4 },
  splinter: { len: 21, hw: (t) => { const w = 1.3 + 1.1 * Math.abs(Math.sin(t * 6)); return [w, w]; }, grip: 7, o: { tip: 0.2 }, guard: "bar", gh: 4 },
  twin: { len: 22, hw: () => [1.9, 1.9], grip: 7, o: { fuller: true }, gh: 4.5 },
  twinsaber: { len: 22, hw: () => [1.2, 2.2], grip: 7, o: { cv: (t) => -3.5 * t * t, tip: 0.2, ridge: false }, guard: "curved", gh: 4 },
  kris: { len: 21, hw: () => [1.8, 1.8], grip: 7, o: { cv: (t) => 1.1 * Math.sin(t * Math.PI * 6), tip: 0.18 }, gh: 4 },
  dagger: { len: 16, hw: () => [2, 2], grip: 6, o: { fuller: true, tip: 0.3 }, gh: 4 },
  stiletto: { len: 18, hw: () => [1.1, 1.1], grip: 6, o: { tip: 0.5 }, gh: 3.4, pommel: "ball" },
  knife: { len: 15, hw: () => [0.8, 2.6], grip: 6, o: { tip: 0.38, ridge: false }, guard: "bar", gh: 2.6 },
  dirk: { len: 17, hw: (t) => [2.2 - 0.9 * t, 2.2 - 0.9 * t], grip: 6, o: { fuller: true, tip: 0.3 }, gh: 3.6, pommel: "ball" },
  fang: { len: 15, hw: () => [1.1, 2.3], grip: 6, o: { cv: (t) => -3.2 * t * t, tip: 0.4, ridge: false }, guard: "bar", gh: 2.8 },
  ritual: { len: 15, hw: () => [1.3, 2], grip: 6, o: { cv: (t) => -2 * Math.sin(t * Math.PI), tip: 0.3 }, guard: "claw", gh: 3, pommel: "skull" },
  kunai: { len: 13, hw: (t) => { const w = 1 + 1.6 * Math.sin(Math.PI * Math.min(1, t * 1.15)); return [w, w]; }, grip: 7, o: { tip: 0.3 }, guard: "bar", gh: 2.2, pommel: "ring" },
};
function sword(k: K, shape: string, u0 = 2, vo = 0) {
  const s = SW[shape] ?? SW.broad;
  const g = u0 + s.grip, gtype = s.guard ?? k.L.guard ?? "cross";
  const bladeR = shape === "fang" || shape === "bone" ? k.bone : k.mat;
  wraps(k, u0 + 1.5, g - 0.5, s.grip > 10 ? 3.2 : 2.8, k.grip, vo);
  if (s.grip > 10) band(k, u0 + s.grip * 0.55, 3.4, vo);
  blade(k, g + 1, s.len, s.hw, { ...s.o, vo, r: bladeR });
  // ярус: язычки гарды на клинке (1+), золотая инкрустация по долу (2+)
  if (k.rich >= 1 && s.len > 18) { const [a0, b0] = s.hw(0); dpoly(k, [[g + 0.6, vo - a0 * 0.75], [g + 4.5, vo - 0.5], [g + 4.5, vo + 0.5], [g + 0.6, vo + b0 * 0.75]], k.trim, vo, 1.2); }
  if (k.rich >= 2 && s.len > 18) for (let t = 0.08; t < 0.55; t += 0.025) dset(k, g + 1 + t * s.len, vo + (s.o?.cv?.(t) ?? 0), k.trim[(t * 40) % 2 < 1 ? 3 : 4]);
  if (shape === "zwei") for (const sg of [-1, 1]) dpoly(k, [[g + 4, vo + sg * 2.4], [g + 2.6, vo + sg * 5], [g + 5.2, vo + sg * 2.4]], k.mat, vo + sg * 3, 1.2);
  if (shape === "rapier") { dstroke(k, [[g, vo - 2], [g - 4, vo - 4.6], [u0 + 1.4, vo - 2.4]], 1.6, 1.2, k.trim[3]); dstroke(k, [[g + 0.5, vo + 2], [g - 2, vo + 4]], 1.4, 1, k.trim[2]); }
  if (shape === "saber" || shape === "twinsaber") dstroke(k, [[g, vo + (s.gh ?? 4)], [g - 3, vo + (s.gh ?? 4) + 0.8], [u0 + 1.2, vo + 2.2]], 1.4, 1.2, k.trim[2]);
  if (shape === "claymore") for (const sg of [-1, 1]) { const [x, y] = P(g + 2.6, vo + sg * 8); k.c.ellipse(x, y, 1.8, 1.8, k.trim[3]); k.c.clear(Math.floor(x), Math.floor(y)); }
  guard(k, g, s.gh ?? 5, gtype, vo);
  pommel(k, u0 + 0.8, s.pommel ?? k.L.pommel ?? "ball", vo);
  if (shape === "kunai") { const [x, y] = P(u0 - 1, vo + 0.5); stroke(k.c, [[x, y], [x - 1, y + 4], [x + 1, y + 7]], 1.6, 1, k.cloth[3]); }
  if (k.L.deco === "chains") { const [x, y] = P(u0 + 0.5, vo); stroke(k.c, [[x, y], [x - 1.5, y + 3], [x + 0.5, y + 5.5], [x - 1, y + 7]], 1, 1, k.trim[3]); }
  if (k.L.deco === "skull" && gtype !== "claw") skull(k, ...P(g, vo), 0.55);
}
/** Пара крест-накрест: рисунок и его зеркальная копия. */
function crossed(k: K, draw: (kk: K) => void) {
  const a = new PC(ICON, ICON), b = new PC(ICON, ICON);
  draw({ ...k, c: a }); draw({ ...k, c: b });
  k.c.blit(b, -1, 0, true); k.c.blit(a, 1, 0);
}
function twin(k: K, shape: string) {
  if (shape === "claws") {
    // катар: кастет-рамка с поперечной рукоятью и три изогнутых когтя
    dpoly(k, [[8, -6], [11, -6], [11, 6], [8, 6]], k.trim, 0, 2.4);
    for (const sg of [-1, 1]) shaft(k, 2, 9, 1.8, k.trim, sg * 5);
    wraps(k, 3, 8, 3, k.grip, 0); dline(k, 3, -4.2, 3, 4.2, k.grip[1], 2);
    for (const v of [-4, 0, 4]) blade(k, 11.5, v === 0 ? 30 : 25, () => [1.1, 1.6], { cv: (t) => -3.4 * t * t + v * (1 + t * 0.15), tip: 0.35, ridge: false });
    for (const v of [-4, 0, 4]) dgem(k, 9.5, v, 0.9, k.stone);
    return;
  }
  if (shape === "sickles") {
    crossed(k, (kk) => {
      wraps(kk, 3, 13, 2.8, kk.grip); band(kk, 13.5, 3.4);
      const pts = arc(19, -5, 5.6, Math.PI * 0.95, Math.PI * 2.05, 18);
      dstroke(kk, [[14, 0], ...pts], 3.4, 1, (t) => kk.mat[t > 0.88 ? 4 : t < 0.15 ? 2 : 3]);
      pommel(kk, 2.5, "ball");
    });
    return;
  }
  if (shape === "hooks") {
    crossed(k, (kk) => {
      sword(kk, "twin", 3, 0);
      dstroke(kk, [[36, 0], ...arc(36, -3.2, 3.2, Math.PI * 0.5, -Math.PI * 0.6, 10)], 2.6, 1.2, kk.mat[3]);
      dstroke(kk, arc(12, 0, 5, Math.PI * 0.6, Math.PI * 1.4, 10), 2, 1.4, kk.trim[3]);
    });
    return;
  }
  crossed(k, (kk) => sword(kk, SW[shape] && SW[shape].len <= 23 ? shape : "twin", 3, 0));
}
function daggers(k: K, shape: string) {
  sword(k, shape, 9, -5.5);
  sword(k, shape, 3, 5);
}

// ---------------- топоры ----------------
function edge(k: K, pts: Pt[], c = k.mat[4]) { dstroke(k, pts, 1.2, 1.2, c); }
function inlay(k: K, pts: Pt[]) { if (k.L.deco === "filigree" || k.L.deco === "runes" || k.rich >= 2) dstroke(k, pts, 1, 1, k.L.deco === "runes" ? k.fx[3] : k.trim[3]); }
function axe(k: K, shape: string, two: boolean) {
  const top = two ? 47 : 40, hu = top - 6, sh = (pts: Pt[]) => pts.map(([u, v]) => [u + hu - 35, v] as Pt);
  shaft(k, 1, top, 3, k.haft); wraps(k, 2, 13, 3.4, k.grip); band(k, 14, 3.6);
  if (two) wraps(k, 22, 28, 3.4, k.grip);
  const H = (pts: Pt[], vc: number, sp = 3, R = k.mat) => dpoly(k, sh(pts), R, vc, sp);
  const E = (pts: Pt[]) => edge(k, sh(pts));
  const I = (pts: Pt[]) => inlay(k, sh(pts));
  switch (shape) {
    case "splitter": H([[31, -1.6], [39, -1.6], [41.5, -10], [28.5, -10]], -5); E([[41.5, -10], [28.5, -10]]); H([[32, 1.6], [38, 1.6], [37, 5], [33, 5]], 3); I([[32, -4], [38, -4]]); break;
    case "pick": H([[32, -1.6], [38, -1.6], [40, -9], [33, -9.5]], -5); E([[40, -9], [33, -9.5]]); H([[33, 1.6], [37, 1.6], [35.4, 13]], 6, 2.5); break;
    case "beak": H([[32, -1.6], [36.5, -1.6], [31, -8], [23.5, -14], [29, -6.5]], -6); E([[23.5, -14], [29, -6.5]]); H([[32, 1.6], [37.5, 1.6], [37.5, 5.5], [32, 5.5]], 3.5); break;
    case "francisca": H([[32, -1.6], [37.5, -1.6], [45, -6.5], [44, -11.5], [36.5, -7.5], [31.5, -5.5]], -5); E([[45, -6.5], [44, -11.5]]); I([[35, -3.5], [41, -6.5]]); break;
    case "double": for (const s of [-1, 1]) { H([[32, s * 1.6], [38, s * 1.6], [42, s * 8.5], [39, s * 10], [35, s * 6.5], [31, s * 10], [28, s * 8.5]], s * 5, 2.6); E([[42, s * 8.5], [39, s * 10]]); E([[31, s * 10], [28, s * 8.5]]); } break;
    case "tomahawk": H([[34, -1.6], [38.5, -1.6], [41, -8], [34.5, -8.5]], -4.5); E([[41, -8], [34.5, -8.5]]); H([[34.5, 1.6], [37.5, 1.6], [36, 6]], 3, 2); for (let i = 0; i < 3; i++) { const [x, y] = P(30 - i * 2, 1.8); stroke(k.c, [[x, y], [x + 1.5, y + 4], [x + 1, y + 8 - i]], 2.4, 1, i === 1 ? WHITE : k.cloth[3]); k.c.shadedEllipse(x, y, 1.1, 1.1, k.trim); } break;
    case "moon": { const o = arc(35, -1, 12, Math.PI * 0.62, Math.PI * 1.36 + 0.56, 22); const i = arc(37.6, -1, 7, Math.PI * 0.72 + 0.48, Math.PI * 1.26, 14).reverse(); H([...o, ...i], -7, 3.5); E(o.map(([u, v]) => [u, v - 0.3] as Pt)); I(arc(35, -1, 9.5, Math.PI * 0.75, Math.PI * 1.25 + 0.5, 12)); break; }
    case "bardiche": H([[23, -1.6], [41, -1.6], [47, -4], [43.5, -8.5], [35, -10.5], [26, -8], [22, -4]], -5); E([[47, -4], [43.5, -8.5], [35, -10.5], [26, -8]]); I([[27, -5], [40, -6]]); break;
    case "labrys": for (const s of [-1, 1]) { const o = arc(35, 0, 10, s < 0 ? Math.PI * 1.1 : Math.PI * 0.1, s < 0 ? Math.PI * 1.9 : Math.PI * 0.9, 16).map(([u, v]) => [u, v + s * 2] as Pt); H([[39, s * 1.6], ...o.reverse(), [31, s * 1.6]], s * 6, 3); E(o); } k.c.shadedEllipse(...P(hu, 0), 2.5, 2.5, k.trim); break;
    case "executioner": H([[31, -1.6], [44, -1.6], [45.5, -13], [30, -13]], -7, 4); E([[45.5, -13], [30, -13]]); { const [x, y] = P(hu + 5, -8.5); for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) if (Math.hypot(xx, yy) < 2.2) k.c.clear(Math.round(x) + xx, Math.round(y) + yy); } break;
    case "winged": H([[31, -1.6], [41, -1.6], [47, -6], [42, -8], [45, -12], [38, -11], [39, -15], [32, -11], [28, -12], [29.5, -6]], -7, 3.5); E([[47, -6], [42, -8], [45, -12], [38, -11], [39, -15]]); break;
    case "crescent": { const o = arc(36, -1, 9, Math.PI * 0.66, Math.PI * 1.34, 18); const i = arc(37.5, -1, 5.4, Math.PI * 0.74, Math.PI * 1.26, 12).reverse(); H([...o, ...i], -6, 3); E(o.map(([u, v]) => [u, v - 0.3] as Pt)); break; }
    case "sawtooth": H([[31, -1.6], [38, -1.6], [38, -10.5], [31, -10.5]], -6, 3); E([[38, -10.5], [38, -1.6]]); for (let i = 0; i < 5; i++) H([[38, -2 - i * 1.9], [41.5, -3 - i * 1.9], [38, -4 - i * 1.9]], -3 - i * 1.9, 1); H([[32, 1.6], [37, 1.6], [36, 4.5], [33, 4.5]], 3); break;
    case "fan": H([[32, -1.6], [38, -1.6], [45, -3], [42, -6.5], [46, -9.5], [40, -10.5], [41, -14], [34, -11], [29, -12], [30, -6]], -7, 3.5); E([[45, -3], [42, -6.5], [46, -9.5], [41, -14]]); I([[34, -4], [41, -8]]); break;
    case "triple": for (const [tu, tv] of [[26, -11], [35, -15], [44, -9]] as Pt[]) { H([[32, -1.6], [38, -1.6], [tu + 3, tv], [tu - 2, tv + 1.5]], tv / 2, 4); E([[tu + 3, tv], [tu - 2, tv + 1.5]]); } break;
    case "thorned": H([[30, -1.6], [43, -1.6], [45, -11], [38, -13], [30, -10]], -6, 3.5); E([[45, -11], [38, -13], [30, -10]]); for (let i = 0; i < 4; i++) H([[31 + i * 3.4, -1.6], [33 + i * 3.4, -1.6], [30 + i * 3.4, 4.5 + (i % 2)]], 2, 1.2); for (let i = 0; i < 3; i++) H([[33 + i * 4, -12.4], [35.4 + i * 4, -12.4], [34.6 + i * 4, -16.6]], -14, 1.2); break;
    case "hooked": H([[31, -1.6], [43, -1.6], [47, -8], [44, -14], [38, -12], [42, -8], [36, -6], [30, -9]], -7, 3.5); E([[47, -8], [44, -14], [38, -12]]); H([[32, 1.6], [40, 1.6], [42, 8], [37, 6], [33, 4]], 4, 3); break;
    case "bonecleaver": H([[29, -1.6], [43, -1.6], [45, -11], [41, -10], [40, -13], [35, -11], [32, -13], [28, -9]], -6, 3.5, k.bone); for (let u = 16; u < top - 8; u += 4) { const [x, y] = P(u, 0); k.c.shadedEllipse(x, y, 2.3, 2.3, k.bone); } skull(k, ...P(hu - 1, 1.5), 0.8); break;
    default: H([[31, -1.6], [39, -1.6], [42.5, -10], [40, -12.8], [34, -11.6], [28.5, -8.6], [30, -5]], -6); E([[42.5, -10], [40, -12.8]]); E([[34, -11.6], [28.5, -8.6]]); I([[33, -4], [39, -7.5]]); H([[32, 1.6], [38, 1.6], [36.5, 4], [33.5, 4]], 2.5);
  }
  for (const u of [hu - 4.5, hu + 4.5]) band(k, u, 3.8);
  if (k.gem) dgem(k, hu, 0, 1.8);
  if (k.L.deco === "spikes" || k.L.deco === "horns") dpoly(k, [[top - 0.5, -1.5], [top + 4.5, 0], [top - 0.5, 1.5]], k.mat, 0, 1);
  if (k.L.deco === "skull" && shape !== "bonecleaver") skull(k, ...P(hu - 9, 0), 0.7);
  if (k.L.deco === "chains") for (let i = 0; i < 4; i++) { const [x, y] = P(hu - 6 - i * 1.4, 2 + i * 1.3); k.c.ellipse(x, y, 1, 1, k.trim[i % 2 ? 2 : 3]); }
  pommel(k, 1, "ball");
}

// ---------------- булавы и молоты ----------------
function mace(k: K, shape: string) {
  const top = 32, [hx, hy] = P(top + 6, 0);
  if (shape === "flail") {
    shaft(k, 2, 20, 3, k.haft); wraps(k, 3, 12, 3.4, k.grip); band(k, 19.5, 3.8); k.c.ellipse(...P(21.5, 0), 1.6, 1.6, k.trim[3]);
    const [x0, y0] = P(22, 0), bx = 37, by = 27;
    for (let i = 1; i <= 6; i++) { const t = i / 7, x = x0 + (bx - x0) * t, y = y0 + (by - y0) * t + Math.sin(t * Math.PI) * 3; k.c.ellipse(x, y, 1.3, 1.3, k.trim[i % 2 ? 2 : 3]); k.c.set(Math.floor(x), Math.floor(y), k.trim[0]); }
    for (let a = 0; a < 10; a++) { const an = (a / 10) * TAU; k.c.poly([[bx + Math.cos(an - 0.25) * 4.5, by + Math.sin(an - 0.25) * 4.5], [bx + Math.cos(an) * 8, by + Math.sin(an) * 8], [bx + Math.cos(an + 0.25) * 4.5, by + Math.sin(an + 0.25) * 4.5]], k.mat[3]); }
    k.c.shadedEllipse(bx, by, 5.2, 5.2, k.mat);
    if (k.gem) gemAt(k, bx, by, 1.8);
    pommel(k, 1.5, "ball");
    return;
  }
  if (shape === "club") {
    dpoly(k, [[2, -1.5], [top + 6, -4.6], [top + 9, -2], [top + 9.5, 1], [top + 6, 4.6], [2, 1.5]], k.haft, 0, 1.6);
    wraps(k, 2.5, 12, 3.4, k.grip);
    for (const u of [top - 8, top + 2]) band(k, u, 6.5 + (u - 20) * 0.1);
    for (const [u, s] of [[top - 3, -1], [top, 1], [top + 4, -1], [top - 6, 1], [top + 7, 1]] as Pt[]) dpoly(k, [[u - 0.8, s * 3.4], [u, s * 6.6], [u + 0.8, s * 3.4]], k.mat, s * 4, 1.2);
    return;
  }
  shaft(k, 2, top + 1, 3, shape === "holy" || shape === "flanged" ? k.mat : k.haft); wraps(k, 3, 13, 3.4, k.grip); band(k, 14, 3.8); band(k, top, 4.2);
  pommel(k, 1.5, k.L.pommel === "skull" ? "skull" : "ball");
  switch (shape) {
    case "flanged": for (const v of [-5, -2.5, 2.5, 5]) dpoly(k, [[top + 1, v * 0.35], [top + 5, v], [top + 10, v], [top + 11.5, v * 0.35]], k.mat, v * 0.6, 1.8); shaft(k, top + 1, top + 11, 2.4, k.mat); dpoly(k, [[top + 11, -1.4], [top + 14, 0], [top + 11, 1.4]], k.trim, 0, 1); if (k.gem) dgem(k, top + 6, 0, 1.6); break;
    case "star": for (let a = 0; a < 12; a++) { const an = (a / 12) * TAU; k.c.poly([[hx + Math.cos(an - 0.22) * 4.6, hy + Math.sin(an - 0.22) * 4.6], [hx + Math.cos(an) * 8.6, hy + Math.sin(an) * 8.6], [hx + Math.cos(an + 0.22) * 4.6, hy + Math.sin(an + 0.22) * 4.6]], a % 3 ? k.mat[3] : k.mat[4]); } k.c.shadedEllipse(hx, hy, 5.6, 5.6, k.mat); if (k.gem) gemAt(k, hx, hy, 2); break;
    case "holy": for (let a = 0; a < 12; a++) { const an = (a / 12) * TAU; k.c.poly([[hx + Math.cos(an - 0.2) * 5, hy + Math.sin(an - 0.2) * 5], [hx + Math.cos(an) * (a % 2 ? 7.5 : 9.5), hy + Math.sin(an) * (a % 2 ? 7.5 : 9.5)], [hx + Math.cos(an + 0.2) * 5, hy + Math.sin(an + 0.2) * 5]], k.trim[a % 2 ? 3 : 4]); } k.c.shadedEllipse(hx, hy, 5.6, 5.6, k.trim); gemAt(k, hx, hy, 2.6, k.stone); break;
    case "crystal": k.c.poly([[hx, hy - 11], [hx + 5.5, hy - 3], [hx + 4, hy + 5], [hx, hy + 8], [hx - 4, hy + 5], [hx - 5.5, hy - 3]], (x, y) => k.stone[cl(2.8 - (x - hx) / 3.6, 1, 4)]); k.c.line(hx, hy - 11, hx, hy + 8, k.stone[4], 1); k.c.poly([[hx - 6, hy + 1], [hx - 10, hy - 5], [hx - 3, hy - 2]], k.stone[2]); k.c.poly([[hx + 6, hy + 2], [hx + 10, hy - 3], [hx + 3, hy - 1]], k.stone[3]); break;
    case "thorn": k.c.shadedEllipse(hx, hy, 5.2, 5.2, k.haft); for (let a = 0; a < 9; a++) { const an = (a / 9) * TAU + 0.3; k.c.poly([[hx + Math.cos(an - 0.24) * 4.4, hy + Math.sin(an - 0.24) * 4.4], [hx + Math.cos(an) * 10, hy + Math.sin(an) * 10], [hx + Math.cos(an + 0.24) * 4.4, hy + Math.sin(an + 0.24) * 4.4]], k.bone[a % 2 ? 3 : 2]); } k.c.shadedEllipse(hx, hy, 3, 3, k.stone); break;
    case "drop": k.c.poly([[hx, hy - 10], [hx + 5.5, hy - 0.5], [hx + 4.4, hy + 5], [hx, hy + 7.4], [hx - 4.4, hy + 5], [hx - 5.5, hy - 0.5]], lit(k.stone, hx - 3, hy - 4, 5, 1, 4)); k.c.set(Math.round(hx - 2), Math.round(hy - 1), WHITE); k.c.rect(Math.round(hx - 5), Math.round(hy + 6), 10, 2, k.trim[2]); break;
    case "skull": for (const a of [-2.4, -1.6, -0.8]) k.c.poly([[hx + Math.cos(a) * 4 - 1, hy + Math.sin(a) * 4], [hx + Math.cos(a) * 9.5, hy + Math.sin(a) * 9.5], [hx + Math.cos(a) * 4 + 1, hy + Math.sin(a) * 4]], k.mat[3]); skull(k, hx, hy, 1.6); break;
    default: k.c.shadedEllipse(hx, hy, 6, 6, k.mat); for (let a = 0; a < 8; a++) { const an = (a / 8) * TAU + 0.2; k.c.shadedEllipse(hx + Math.cos(an) * 4.2, hy + Math.sin(an) * 4.2, 1.3, 1.3, k.trim); } dpoly(k, [[top + 11.5, -1.4], [top + 15, 0], [top + 11.5, 1.4]], k.mat, 0, 1); if (k.gem) gemAt(k, hx, hy, 2);
  }
}
function hammer(k: K, shape: string) {
  const top = 40, hu = 42;
  shaft(k, 1, top, 3, shape === "holy" ? k.mat : k.haft); wraps(k, 2, 13, 3.4, k.grip); band(k, 14, 3.8); wraps(k, 22, 28, 3.4, k.grip);
  pommel(k, 1, "spike");
  const blk = (u0: number, u1: number, v0: number, v1: number, R = k.mat) => { dpoly(k, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], R, (v0 + v1) / 2, (v1 - v0) / 4.4); dline(k, u1, v0 + 0.5, u1, v1 - 0.5, R[4], 1); dline(k, u0, v0, u1, v0, R[3], 1); };
  switch (shape) {
    case "maul": blk(hu - 6, hu + 6, -9, 9); for (const v of [-5, 5]) dline(k, hu - 6, v, hu + 6, v, k.trim[2], 1); dgem(k, hu, 0, 2.2, k.gem ?? k.trim); break;
    case "crusher": blk(hu - 4, hu + 4, -3, 8); for (const u of [hu - 2.5, hu, hu + 2.5]) dpoly(k, [[u - 1, 8], [u + 1, 8], [u, 11]], k.mat, 9, 1); dpoly(k, [[hu - 3, -3], [hu + 3, -3], [hu + 0.5, -14]], k.mat, -7, 3); break;
    case "holy": blk(hu - 4, hu + 4, -6.5, 6.5, k.trim); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) dstroke(k, [[hu, s * 6.5], [hu - 3 - i * 2.2, s * (11 - i * 0.6)]], 2.6 - i * 0.4, 1, k.trim[4 - i]); dgem(k, hu, 0, 2.6, k.stone); break;
    case "rune": blk(hu - 5, hu + 5, -8, 8, RP("grey", "grey")); for (let i = 0; i < 4; i++) { const [x, y] = P(hu - 2.5 + (i % 2) * 5, -4 + Math.floor(i / 2) * 8); rune(k.c, Math.round(x), Math.round(y), k.fx[3], i + k.h); } break;
    case "spiked": blk(hu - 4, hu + 4, -7, 7); for (const v of [-7, 7]) for (const u of [hu - 2, hu + 2]) dpoly(k, [[u - 1, v], [u + 1, v], [u, v + Math.sign(v) * 3]], k.mat, v, 1); dpoly(k, [[hu + 4, -1.5], [hu + 8, 0], [hu + 4, 1.5]], k.mat, 0, 1); break;
    case "anvil": blk(hu - 5, hu + 5, -8, 8); blk(hu - 2, hu + 2, 8, 12); dpoly(k, [[hu + 5, -5], [hu + 11, -2], [hu + 5, 1]], k.mat, -2, 2); dgem(k, hu, 0, 1.8, k.gem ?? k.trim); break;
    case "crystal": dpoly(k, [[hu - 4, -5], [hu, -9.5], [hu + 5, -5], [hu + 5, 5], [hu, 9.5], [hu - 4, 5]], k.stone, 0, 6, 1, 4); dline(k, hu, -9.5, hu, 9.5, k.stone[4], 1); band(k, hu - 4.5, 6.4, 0); band(k, hu + 4.5, 6.4, 0); break;
    case "star": dpoly(k, Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * TAU; return [hu + Math.cos(a) * (i % 2 ? 4.6 : 10), Math.sin(a) * (i % 2 ? 4.6 : 10)] as Pt; }), k.mat, 0, 6); dgem(k, hu, 0, 2.4, k.gem ?? k.stone); break;
    default: blk(hu - 4, hu + 4, -7.5, 7.5); dline(k, hu, -7.5, hu, 7.5, k.trim[2], 2); dpoly(k, [[hu - 2.5, -7.5], [hu + 2.5, -7.5], [hu, -11]], k.mat, -9, 1); if (k.gem) dgem(k, hu, 0, 1.8);
  }
  if (k.L.deco === "skull") skull(k, ...P(hu - 8, 0), 0.7);
  if (k.L.deco === "chains") for (let i = 0; i < 4; i++) { const [x, y] = P(hu - 6 - i * 1.4, 2.5 + i * 1.3); k.c.ellipse(x, y, 1, 1, k.trim[i % 2 ? 2 : 3]); }
}

// ---------------- древковое ----------------
function pennant(k: K, u: number) {
  if (k.umb) { for (let i = 0; i < 4; i++) { const [x, y] = P(u - i * 1.3, 2 + i * 1.4); k.c.ellipse(x, y, 1, 1, k.trim[i % 2 ? 2 : 3]); } skull(k, ...P(u - 6, 7.5), 0.5); return; }
  if (k.sol) { dpoly(k, [[u, 1.5], [u - 7, 1.5], [u - 6, 7], [u - 3.5, 5], [u - 1, 9]], k.cloth, 4, 2.5); dline(k, u - 6.5, 3, u - 1.5, 3, k.trim[3], 1); return; }
  const [x, y] = P(u - 1, 1.6); stroke(k.c, [[x, y], [x + 1, y + 4], [x + 0.5, y + 7]], 3, 1, (t) => RP("whitefur", "white")[cl(3 - t * 2)]);
}
function spear(k: K, shape: string) {
  shaft(k, 1, 36, 2.8, k.haft); wraps(k, 14, 22, 3.2, k.grip); band(k, 35, 3.6); band(k, 2, 3.4);
  if (shape === "lance") {
    dpoly(k, [[27.5, -4.4], [49, -0.4], [49, 0.4], [27.5, 4.4]], k.mat, 0, 1.6);
    for (const u of [32, 37, 42]) dline(k, u, -3.6 + (u - 32) * 0.17, u, 3.6 - (u - 32) * 0.17, k.trim[3], 1);
    dpoly(k, [[23, -1.6], [27, -8], [29, -8], [29, 8], [27, 8], [23, 1.6]], k.trim, 0, 3);
    dline(k, 28, -8, 28, 8, k.trim[4], 1);
    if (k.gem) dgem(k, 27, 0, 1.6);
    return;
  }
  switch (shape) {
    case "forked": for (const v of [-3.4, 3.4]) blade(k, 36, 13, () => [1.1, 1.1], { vo: v, tip: 0.4, ridge: false }); dpoly(k, [[35.5, -5], [37.5, -5], [37.5, 5], [35.5, 5]], k.mat, 0, 2.4); blade(k, 37, 7, () => [1, 1], { tip: 0.5 }); break;
    case "crystal": blade(k, 35.5, 15, (t) => { const w = 2.2 + 2.4 * Math.sin(Math.PI * Math.min(1, t * 1.15)); return [w, w]; }, { r: k.stone, tip: 0.12 }); break;
    case "bolt": blade(k, 35.5, 16, () => [2, 2], { cv: (t) => 2.2 * (Math.abs(((t * 3) % 2) - 1) - 0.5), tip: 0.2, ridge: false }); break;
    case "harpoon": blade(k, 35.5, 14, () => [1.2, 1.2], { tip: 0.5 }); for (const s of [-1, 1]) dpoly(k, [[40, s * 1.2], [43, s * 5.2], [37.4, s * 1.2]], k.mat, s * 3, 1.5); break;
    case "pike": blade(k, 35, 16, () => [1.8, 1.8], { tip: 0.6 }); break;
    case "boar": blade(k, 36.5, 13, (t) => { const w = 2 + 3 * Math.sin(Math.PI * Math.min(1, t * 1.1)); return [w, w]; }, { tip: 0.3 }); dpoly(k, [[36, -5], [37.5, -5], [37.5, 5], [36, 5]], k.trim, 0, 2); break;
    case "partisan": blade(k, 35.5, 15, () => [2.5, 2.5], { tip: 0.4 }); for (const s of [-1, 1]) dpoly(k, [[36, s * 1.6], [37, s * 7], [40, s * 8.4], [39.5, s * 5.5], [38.5, s * 1.6]], k.mat, s * 4, 1.8); break;
    case "trident": dpoly(k, [[35.5, -6], [37.5, -6], [37.5, 6], [35.5, 6]], k.mat, 0, 2.4); for (const v of [-5, 0, 5]) blade(k, 37, v ? 9 : 12, () => [0.9, 0.9], { vo: v, tip: 0.35, ridge: false }); for (const v of [-5, 5]) dpoly(k, [[42, v], [41, v + Math.sign(v) * 2.2], [43.5, v]], k.mat, v, 1); break;
    case "serpent": blade(k, 35.5, 15, () => [2.3, 2.3], { cv: (t) => 1.2 * Math.sin(t * Math.PI * 4), tip: 0.25 }); break;
    default: blade(k, 35.5, 14, (t) => { const w = 1.8 + 3 * Math.sin(Math.PI * Math.min(1, t * 1.15)); return [w, w]; }, { tip: 0.3, fuller: true });
  }
  if (k.gem) dgem(k, 35, 0, 1.5);
  pennant(k, 33);
}
function scythe(k: K, shape: string) {
  const top = 44, R = shape === "reaper" ? k.bone : k.haft;
  shaft(k, 1, top, 3, R); wraps(k, 3, 11, 3.4, k.grip); band(k, top - 1, 4);
  if (shape === "reaper") for (let u = 6; u < top - 4; u += 3.2) dline(k, u, -1.5, u, 1.5, k.bone[1], 1);
  dpoly(k, [[22, 1.5], [24, 1.5], [24, 6], [22, 6]], k.haft, 4, 1.5);
  switch (shape) {
    case "glaive": blade(k, top - 4, 9, (t) => [1.2, 2.4 + 2.6 * Math.sin(Math.PI * t)], { tip: 0.4, cv: (t) => -2 * t, ridge: false }); break;
    case "warscythe": { const pts: Pt[] = [[top - 2, -1.5], [top + 1, -1.5], [top + 4, -11], [top + 1.5, -14.5], [top - 1, -8]]; dpoly(k, pts, k.mat, -7, 3); edge(k, [[top + 1, -1.5], [top + 4, -11], [top + 1.5, -14.5]]); break; }
    case "halberd": dpoly(k, [[top - 6, -1.5], [top + 1, -1.5], [top + 2.5, -9], [top - 7.5, -9]], k.mat, -5, 2.8); edge(k, [[top + 2.5, -9], [top - 7.5, -9]]); blade(k, top, 7, () => [1.2, 1.2], { tip: 0.6 }); dpoly(k, [[top - 4, 1.5], [top - 1.5, 1.5], [top - 6, 8]], k.mat, 4, 1.5); break;
    default: {
      const o: Pt[] = [[top - 1, -1.2], [top + 2.2, -2.4], [top + 0.5, -9], [top - 5, -14], [top - 14, -16], [top - 22, -15], [top - 13, -12.5], [top - 6.5, -8.5], [top - 3.4, -2]];
      dpoly(k, o, shape === "crystal" ? k.stone : shape === "boneblade" ? k.bone : k.mat, -9, 3.2); edge(k, [[top - 22, -15], [top - 14, -16], [top - 5, -14], [top + 0.5, -9]]);
      inlay(k, [[top - 15, -14], [top - 6, -11.5], [top - 2, -5]]);
      if (shape === "double") { const o2: Pt[] = [[3, 1.2], [0, 2.4], [1.5, 8], [6, 11.5], [13, 12], [7.5, 9.5], [4, 6]]; dpoly(k, o2, k.mat, 7, 3); edge(k, [[13, 12], [6, 11.5], [1.5, 8]]); }
      if (shape === "reaper") skull(k, ...P(top - 1, 0.5), 0.9);
      if (shape === "thorn") for (const [u, v] of [[top - 4, -14], [top - 9, -15.6], [top - 14, -16.2], [top - 19, -15.6]]) dpoly(k, [[u - 1.3, v + 0.5], [u + 1.3, v + 0.5], [u - 0.2, v - 4]], k.mat, v, 1.4);
      if (shape === "bleeding") for (const [u, v, h] of [[top - 9, -9.5, 5], [top - 14, -11, 7], [top - 18, -12, 4]]) { dstroke(k, [[u, v], [u, v + h]], 2.2, 1, k.stone[3]); dset(k, u, v + h + 1.2, k.stone[4]); }
    }
  }
  if (k.gem) dgem(k, top - 1, 0, 1.6);
  if (k.L.deco === "chains") for (let i = 0; i < 5; i++) { const [x, y] = P(top - 4 - i * 1.4, 2 + i * 1.5); k.c.ellipse(x, y, 1, 1, k.trim[i % 2 ? 2 : 3]); }
}

// ---------------- стрелковое ----------------
function bow(k: K, shape: string) {
  const c = k.c, metal = shape === "bladed" || shape === "crescent";
  const limb = shape === "bone" || shape === "horn" ? k.bone : metal ? k.mat : shape === "ice" ? k.stone : k.haft;
  const tall = shape === "long" ? 21.5 : 19.5, depth = shape === "long" ? 9 : shape === "crescent" ? 14 : 12, cx = shape === "crescent" ? 14 : 17;
  const X = (t: number) => {
    let x = cx + (1 - t * t) * depth;
    if (shape === "composite") x -= 5 * Math.exp(-((t / 0.26) ** 2));
    if (shape === "recurve" && Math.abs(t) > 0.78) x -= (Math.abs(t) - 0.78) ** 1.3 * 26;
    if (shape === "horn" && Math.abs(t) > 0.7) x -= (Math.abs(t) - 0.7) * 10;
    return x;
  };
  const tip = (t: number): Pt => [X(t), 24 + t * tall];
  const str = shape === "crescent" ? withA(k.fx[3], 230) : hex("#e8e4d8");
  c.line(...tip(-1), ...tip(1), str, 1);
  for (let t = -1; t <= 1.0001; t += 0.012) {
    const [x, y] = tip(t), w = shape === "horn" ? 5 - Math.abs(t) * 2.4 : shape === "crescent" ? 4.4 - Math.abs(t) * 2.6 : 4 - Math.abs(t) * 1.6;
    c.ellipse(x, y, w / 2, w / 2, limb[2]);
  }
  for (let t = -1; t <= 1.0001; t += 0.012) { const [x, y] = tip(t); c.set(Math.floor(x - 0.8), Math.floor(y), limb[4]); c.set(Math.floor(x + 0.9), Math.floor(y), limb[1]); }
  if (shape === "composite") for (let t = -0.9; t <= 0.9; t += 0.03) { const [x, y] = tip(t); c.set(Math.floor(x + 0.2), Math.floor(y), k.trim[2]); }
  if (shape === "bone") for (let t = -0.85; t <= 0.85; t += 0.17) { const [x, y] = tip(t); c.ellipse(x, y, 2.3, 1.2, k.bone[3]); c.set(Math.floor(x + 1), Math.floor(y), k.bone[0]); }
  if (shape === "horn") { for (let t = -0.9; t <= 0.9; t += 0.1) { const [x, y] = tip(t); c.line(x - 1.5, y, x + 1.5, y + 0.6, limb[1], 1); } for (const s of [-1, 1]) { const [x, y] = tip(s); stroke(c, [[x, y], [x - 3, y - s * 0.5], [x - 4, y + s * 2.4], [x - 2, y + s * 3.5]], 3, 1, limb[3]); } }
  if (shape === "bladed") for (const t of [-0.75, -0.4, 0.4, 0.75]) { const [x, y] = tip(t); c.poly([[x + 1, y - 2], [x + 6.5, y + Math.sign(t) * 2], [x + 1, y + 1.5]], k.mat[3]); c.line(x + 1.5, y - 1, x + 6, y + Math.sign(t) * 2, k.mat[4], 1); }
  if (shape === "ice") for (const [t, l] of [[-0.8, 4], [-0.45, 7], [0.45, 7], [0.8, 4]]) { const [x, y] = tip(t); c.poly([[x + 1, y - 1.6], [x + 1 + l, y + Math.sign(t) * 1.2], [x + 1, y + 1.6]], k.stone[3]); c.line(x + 1.5, y - 0.6, x + l, y + Math.sign(t), k.stone[4], 1); }
  if (shape === "thorn") for (const t of [-0.85, -0.55, -0.25, 0.25, 0.55, 0.85]) { const [x, y] = tip(t); c.poly([[x + 1, y - 1.1], [x + 4.6, y + Math.sign(t) * 3], [x + 1, y + 1.1]], k.bone[3]); }
  if (shape === "plume") for (const t of [-0.9, -0.65, -0.4, 0.4, 0.65, 0.9]) { const [x, y] = tip(t), sg = Math.sign(t); stroke(c, [[x - 1, y], [x - 5, y + sg * 2], [x - 8, y + sg * 5.5]], 3.2, 1, (q) => k.cloth[cl(3.4 - q * 2)]); }
  for (const s of [-1, 1]) { const [x, y] = tip(s * 0.985); c.shadedEllipse(x, y, 1.7, 1.7, k.trim); }
  const [gx] = tip(0);
  if (shape === "bone") skull(k, gx - 0.5, 23, 1.1);
  else { c.shadedRect(gx - 2.5, 20, 4.5, 8, k.grip, 1); for (let y = 21; y < 28; y += 2) c.line(gx - 2, y, gx + 1, y + 1, k.grip[0], 1); }
  if (k.gem && shape !== "bone") gemAt(k, gx - 0.5, shape === "crescent" ? 24 : 18.5, shape === "crescent" ? 2.6 : 1.7);
  if (k.L.deco === "wings") for (const s of [-1, 1]) wing(c, tip(s * 0.65)[0] + 1, tip(s * 0.65)[1], -1, 7, k.trim);
  if (k.L.deco === "spikes" || k.L.deco === "horns") for (const s of [-1, 1]) { const [x, y] = tip(s * 0.5); c.poly([[x + 1, y - 1], [x + 5, y + s * 3.5], [x + 1, y + 1]], k.mat[3]); }
  if (k.L.deco === "runes" || k.rich >= 2) for (const [i, t] of [-0.62, -0.32, 0.32, 0.62].entries()) { const [x, y] = tip(t); rune(c, Math.round(x), Math.round(y), k.fx[3], i + k.h); }
  if (shape !== "composite" && shape !== "bone") {
    const ay = 24, ax0 = tip(-1)[0] - 4, ax1 = gx + 11;
    c.line(ax0, ay, ax1, ay, k.haft[3], 1); c.line(ax0, ay + 1, ax1 - 2, ay + 1, k.haft[1], 1);
    c.poly([[ax1 - 1, ay - 2.4], [ax1 + 4, ay + 0.5], [ax1 - 1, ay + 3.2]], k.mat[3]); c.set(ax1 + 2, ay, k.mat[4]);
    for (const d of [-1, 1]) c.line(ax0, ay + d * 2.4, ax0 + 3, ay + 0.5, k.cloth[3], 1);
  }
}
function crossbow(k: K, shape: string) {
  const heavy = shape === "heavy" || shape === "ballista", hand = shape === "hand";
  const s0 = hand ? 10 : 1, s1 = hand ? 31 : 33;
  dpoly(k, [[s0, -2], [s1, -1.6], [s1, 1.6], [s0 + 6, 2.2], [s0, 3.5 + (heavy ? 1 : 0)]], k.haft, 0, 1.4);
  dline(k, s0 + 1, -0.6, s1 - 1, -0.6, k.haft[4], 1);
  if (hand) dpoly(k, [[11, 1], [15.5, 1], [13.5, 8.5], [10, 8]], k.haft, 4, 2);
  else dpoly(k, [[16, 2], [19, 2], [18.5, 5], [16.5, 5]], k.trim, 3.5, 1.5);
  const pu = s1 - 4, span = hand ? 9 : shape === "ballista" ? 14 : heavy ? 13 : 12;
  const prodAt = (off: number) => Array.from({ length: 17 }, (_, i) => { const v = -span + (2 * span * i) / 16; return P(pu + 3.6 * (1 - (v / span) ** 2) - 3 + off, v); });
  const prod = prodAt(0);
  if (shape === "spider") for (const s of [-1, 1]) for (let j = 0; j < 2; j++) dstroke(k, [[pu, s * 1.5], [pu + 3 - j * 2, s * (6 + j * 2)], [pu - 2 - j * 3, s * (11 + j * 2)]], 2.4, 1, k.mat[3 - j]);
  else {
    stroke(k.c, prod, heavy ? 4 : 3, heavy ? 3.4 : 2.4, (t) => k.mat[t < 0.5 ? 3 : 2]);
    stroke(k.c, prod.map(([x, y]) => [x - 0.8, y - 0.8] as Pt), 1, 1, k.mat[4]);
    if (shape === "ballista") stroke(k.c, prodAt(-4), 3, 3, k.mat[2]);
    if (shape === "crystal" || shape === "bone" || shape === "thorn") {
      stroke(k.c, prod, 3.4, 2.6, shape === "crystal" ? k.stone[3] : shape === "bone" ? k.bone[3] : k.haft[3]);
      for (const i of [3, 6, 10, 13]) { const [x, y] = prod[i]; if (shape === "crystal") k.c.poly([[x - 1, y - 2], [x + 4, y + (i < 8 ? -2 : 2)], [x - 1, y + 1]], k.stone[4]); else if (shape === "thorn") k.c.poly([[x - 1, y - 1], [x + 4, y + (i < 8 ? -3 : 3)], [x, y + 1]], k.bone[3]); else k.c.ellipse(x, y, 2.2, 1.2, k.bone[4]); }
    }
  }
  const ns = pu - 9, ends = shape === "spider" ? [P(pu - 5, -13), P(pu - 5, 13)] : [prod[0], prod[16]];
  stroke(k.c, [ends[0], P(ns, 0), ends[1]], 1, 1, hex("#e8e4d8"));
  dline(k, ns, -0.6, s1 + 4, -0.6, k.haft[3], 1); dpoly(k, [[s1 + 3, -2], [s1 + 7, -0.6], [s1 + 3, 0.9]], k.mat, -0.5, 1);
  for (const d of [-1.6, 0.4]) dline(k, ns, d, ns + 3, -0.6, k.cloth[3], 1);
  if (shape === "repeater") { dpoly(k, [[pu - 12, -1.8], [pu - 3, -1.8], [pu - 3, -7], [pu - 12, -7]], k.trim, -4, 2); dline(k, pu - 11, -4, pu - 4, -4, k.trim[1], 1); dstroke(k, [[pu - 10, -7], [pu - 15, -10]], 1.6, 1, k.trim[3]); }
  if (heavy) { const [x, y] = P(s0 + 2.5, 0.5); k.c.ellipse(x, y, 3.4, 3.4, k.trim[2]); k.c.ellipse(x, y, 1.4, 1.4, k.trim[0]); for (let a = 0; a < 4; a++) k.c.set(Math.floor(x + Math.cos(a * 1.57) * 2.4), Math.floor(y + Math.sin(a * 1.57) * 2.4), k.trim[4]); }
  if (shape === "spider") { for (const v of [-1, 1]) dgem(k, pu - 1, v * 1.2, 1, k.fx); }
  else if (k.gem) dgem(k, pu - 3, 0, 1.6);
  if (k.L.deco === "skull") skull(k, ...P(s0 + 7, 0.6), 0.7);
  if (k.L.deco === "wings" && shape !== "spider") for (const s of [-1, 1]) dpoly(k, [[pu - 2, s * span * 0.6], [pu - 8, s * (span + 2)], [pu - 3, s * span]], k.trim, s * span, 2);
}

// ---------------- гербы 5×5 (знамёна, щиты, обложки) ----------------
/** 1 — цвет темы, 2 — второй цвет, w — кость, k — тёмный, g — зелень, b — дерево. */
export const CREST: Record<string, string[]> = {
  sun: ["2.1.2", ".111.", "11211", ".111.", "2.1.2"], skull: [".www.", "wwwww", "wkwkw", "wwwww", ".w.w."], star: ["..1..", ".121.", "12221", ".121.", "..1.."],
  moon: [".111.", "11...", "1....", "11...", ".111."], rose: [".111.", "11211", ".111.", "..g..", ".gg.."], tree: [".111.", "11211", ".111.", "..b..", ".bbb."],
  fang: ["11111", "ww.ww", "ww.ww", ".w.w.", "....."], eye: [".....", ".111.", "12k21", ".111.", "....."], flame: ["..2..", ".212.", ".121.", "11211", ".111."],
  crown: ["w.w.w", "wwwww", "w2w2w", "wwwww", "....."], raven: ["..www", ".wwkw", "wwww.", ".www.", "..w.w"],
  // задача 113
  bolt: ["..111", ".11..", "11221", "..11.", ".11.."], wolf: ["w...w", "wwwww", "wkwkw", ".www.", "..k.."], serpent: [".112.", "11...", ".111.", "...11", ".111."],
  wing: ["...11", ".1111", "11111", "1122.", "1.1.."], hammer: ["11111", "11211", "11111", "..b..", "..b.."], drop: ["..1..", ".111.", "11211", "11111", ".111."],
  leaf: ["...11", "..111", ".1121", "g111.", "g...."], frost: ["1.1.1", ".121.", "11211", ".121.", "1.1.1"],
};
export function crestAt(c: PC, kind: string, cx: number, cy: number, sc: number, c1: RGBA, c2: RGBA) {
  const rows = CREST[kind] ?? CREST.sun, map: Record<string, RGBA> = { "1": c1, "2": c2, w: hex("#e8e0d0"), k: DARK, g: hex("#5fa040"), b: hex("#8a5a2a") };
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const col = map[ch]; if (col) { c.rect(cx + (x - 2.5) * sc, cy + (y - 2.5) * sc, sc, sc, col); c.set(Math.round(cx + (x - 2.5) * sc), Math.round(cy + (y - 2.5) * sc), mix(col, WHITE, 0.35)); } }));
}
const TOME_CREST: Record<string, string> = { eye: "eye", frost: "frost", blood: "drop", bolt: "bolt", leaf: "leaf", wing: "wing" };

// ---------------- общие навершия легендарок (задача 113): посохи, жезлы ----------------
const collar = (k: K, top: number) => dpoly(k, [[top - 1, -3.4], [top + 3, -4.4], [top + 3, 4.4], [top - 1, 3.4]], k.trim, 0, 1.6);
function headCrystal(k: K, x: number, y: number, s = 1) {
  for (const [dx, h, w] of [[-5, 9, 3], [5, 10, 3], [0, 15, 4]]) {
    const X = x + dx * s, b = y + 4 * s, hh = h * s, ww = w * s;
    k.c.poly([[X - ww, b], [X - ww * 0.6, b - hh * 0.7], [X, b - hh], [X + ww * 0.6, b - hh * 0.7], [X + ww, b]], (px) => k.stone[cl(2.8 - ((px - X) / ww) * 1.3, 1, 4)]);
    k.c.line(X, b - hh, X, b, k.stone[4], 1);
  }
}
function headVortex(k: K, x: number, y: number, s = 1) {
  for (let i = 0; i < 60; i++) { const a = i * 0.3, r = (1.8 + i * 0.16) * s; k.c.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.95, 1.1, 1.1, k.stone[i % 3 ? 3 : 4]); }
  k.c.shadedEllipse(x, y, 2.4 * s, 2.4 * s, k.stone);
}
function headDrop(k: K, x: number, y: number, s = 1) {
  k.c.poly([[x, y - 11 * s], [x + 6 * s, y - s], [x + 5 * s, y + 5 * s], [x, y + 8 * s], [x - 5 * s, y + 5 * s], [x - 6 * s, y - s]], lit(k.stone, x - 3 * s, y - 4 * s, 5 * s, 1, 4));
  k.c.set(Math.round(x - 2 * s), Math.round(y - s), WHITE); k.c.set(Math.round(x - 2 * s), Math.round(y), withA(WHITE, 150));
  for (const sg of [-1, 1]) stroke(k.c, [[x + sg * 7 * s, y + 5 * s], [x + sg * 8 * s, y - 3 * s], [x + sg * 3 * s, y - 10 * s]], 2, 1, k.trim[3]);
}
function headBolt(k: K, x: number, y: number, s = 1) {
  const z: Pt[] = [[x - 3 * s, y - 13 * s], [x + 2 * s, y - 6 * s], [x - 2 * s, y - 4 * s], [x + 3 * s, y + 3 * s], [x - s, y + 5 * s], [x + s, y + 10 * s]];
  stroke(k.c, z, 3.4, 2.4, k.fx[2]); stroke(k.c, z, 1.4, 1, k.fx[4]); k.c.shadedEllipse(x, y - 2 * s, 2.6 * s, 2.6 * s, k.stone);
}
function headLeaves(k: K, x: number, y: number, s = 1) {
  const gr = RP("green", "green");
  for (const [a, l] of [[-1.05, 10], [-0.45, 13], [0.45, 13], [1.05, 10]]) {
    const pts: Pt[] = [[x, y + 3 * s], [x + Math.sin(a) * l * 0.5 * s, y + 3 * s - Math.cos(a) * l * 0.5 * s], [x + Math.sin(a) * l * s, y + 3 * s - Math.cos(a) * l * s]];
    stroke(k.c, pts, 4.2, 1, (t) => gr[cl(3.6 - t * 2)]); stroke(k.c, pts, 1, 1, gr[4]);
  }
  k.c.shadedEllipse(x, y + 2 * s, 2.2 * s, 2.2 * s, k.stone);
}
function headAntler(k: K, x: number, y: number, s = 1) {
  const B = k.bone;
  for (const sg of [-1, 1]) {
    stroke(k.c, [[x, y + 3 * s], [x + sg * 4 * s, y - 2 * s], [x + sg * 6 * s, y - 9 * s], [x + sg * 5 * s, y - 14 * s]], 3.2, 1, B[3]);
    stroke(k.c, [[x + sg * 5 * s, y - 4 * s], [x + sg * 10 * s, y - 7 * s]], 2.2, 1, B[3]);
    stroke(k.c, [[x + sg * 6 * s, y - 9 * s], [x + sg * 10 * s, y - 12 * s]], 2, 1, B[2]);
  }
  k.c.shadedEllipse(x, y - 2 * s, 3 * s, 3 * s, k.stone);
}
function headBloom(k: K, x: number, y: number, s = 1) {
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU - Math.PI / 2; k.c.shadedEllipse(x + Math.cos(a) * 5.4 * s, y + Math.sin(a) * 5.4 * s, 3.4 * s, 3.4 * s, k.stone); }
  k.c.shadedEllipse(x, y, 3.4 * s, 3.4 * s, k.trim); k.c.set(Math.round(x - 1), Math.round(y - 1), WHITE);
}

// ---------------- посохи и жезлы ----------------
/** Богатство древка по ярусу: воротник с камнем (1+), спиральная инкрустация (2+), окованный подток (3). */
function richHaft(k: K, u0: number, u1: number, w: number) {
  if (k.rich >= 2) for (let u = u0; u < u1; u += 0.25) { const v = Math.sin(u * 0.9) * (w / 2 - 0.2); if (Math.cos(u * 0.9) > 0) dset(k, u, v, k.trim[3]); }
  if (k.rich >= 1) { dpoly(k, [[u1 - 2.2, -w / 2 - 1], [u1 + 0.4, -w / 2 - 1.6], [u1 + 0.4, w / 2 + 1.6], [u1 - 2.2, w / 2 + 1]], k.trim, 0, 1.4); dgem(k, u1 - 0.9, 0, 1, k.stone); }
  if (k.rich >= 3) dpoly(k, [[0, -1.9], [4, -2.2], [4, 2.2], [0, 1.9]], k.trim, 0, 1.2);
}
function staff(k: K, shape: string) {
  const top = 32, hu = 39.5, G = k.stone;
  if (shape === "spine") {
    shaft(k, 1, top + 1, 2.6, k.bone);
    for (let u = 3; u < top; u += 2.8) { dpoly(k, [[u - 0.9, -2.9], [u + 0.9, -2.9], [u + 0.9, 2.9], [u - 0.9, 2.9]], k.bone, 0, 1.5); dpoly(k, [[u, 2.6], [u + 1.3, 4.8], [u + 2, 2.6]], k.bone, 3.5, 1); dset(k, u, 0, k.bone[0]); }
  } else if (shape === "root") {
    for (let i = 0; i < 2; i++) dstroke(k, Array.from({ length: 13 }, (_, j) => [1 + j * 2.6, Math.sin(j * 0.9 + i * Math.PI) * 1.3] as Pt), 3, 3, k.haft[2 + i]);
    for (const u of [9, 21]) dstroke(k, [[u, 1.2], [u + 1.5, 3.4], [u + 1, 5]], 1.4, 1, k.haft[2]);
  } else shaft(k, 1, top + 1, 3.4, k.haft);
  if (shape !== "spine") { wraps(k, 11, 19, 3.8, shape === "feather" ? k.cloth : k.grip); band(k, 10.5, 4.2); band(k, 19.5, 4.2); }
  richHaft(k, 21, top, shape === "spine" ? 2.6 : 3.4);
  pommel(k, 1, shape === "spine" ? "skull" : "spike");
  const [hx, hy] = P(hu, 0);
  switch (shape) {
    case "root": {
      const strands: [number, number][] = [[-6.5, -8.5], [6.5, 8.5], [-3, -5], [3, 5.5], [0, -1]];
      for (const [a, b] of strands) dstroke(k, [[top - 1, a * 0.2], [top + 3, a], [top + 9, b], [top + 14, b * 0.35], [top + 15.5, -b * 0.15]], 3, 1, (t) => k.haft[t > 0.6 ? 3 : t < 0.2 ? 1 : 2]);
      dpoly(k, [[top + 3.5, 0], [top + 8, -4.4], [top + 15, 0], [top + 8, 4.4]], G, 0, 1.8, 1, 4); dline(k, top + 4, 0, top + 14, 0, G[k.rar ? 4 : 2], 1); dline(k, top + 8, -4, top + 8, 4, G[1], 1);
      for (const [u, v] of [[top + 4, -7], [top + 11, 7.5], [top + 2, 5]]) { const [x, y] = P(u, v); k.c.shadedEllipse(x, y, 1.8, 1.2, RP("green", "green")); }
      break;
    }
    case "skull": skull(k, hx, hy + 1, 2.1, G[k.rar ? 3 : 2]); for (const s of [-1, 1]) horn(k.c, hx + s * 6, hy - 2.5, s, 12, k.bone); break;
    case "cage": {
      k.c.ellipse(hx, hy - 12, 2.4, 2.4, k.trim[2]); for (let yy = -1; yy <= 0; yy++) for (let xx = -1; xx <= 0; xx++) k.c.clear(Math.round(hx) + xx, Math.round(hy - 12) + yy);
      k.c.poly([[hx - 8, hy - 7], [hx + 8, hy - 7], [hx + 5, hy - 10.5], [hx - 5, hy - 10.5]], lit(k.trim, hx - 4, hy - 9, 3));
      k.c.rect(Math.round(hx - 6.5), Math.round(hy - 7), 13, 15, withA(G[0], 230));
      k.c.ellipse(hx, hy + 1.5, 4.6, 6.2, G[2]); k.c.ellipse(hx, hy + 2.6, 3, 4.2, G[3]); if (k.rar) k.c.ellipse(hx, hy + 3.4, 1.4, 2.2, G[4]);
      for (const x of [-6.5, -2.2, 2.2, 6.5]) k.c.line(hx + x, hy - 7, hx + x, hy + 8, x < 0 ? k.trim[3] : k.trim[2], 1);
      k.c.shadedRect(hx - 8, hy + 7, 16, 3, k.trim, 1);
      break;
    }
    case "crescent": {
      k.c.shadedEllipse(hx, hy, 11, 11, k.trim);
      for (let y = -13; y <= 13; y++) for (let x = -13; x <= 13; x++) if (Math.hypot(x + 0.5 - 4, y + 0.5 + 4.4) < 9.4) k.c.clear(Math.floor(hx + x), Math.floor(hy + y));
      for (let a = 0.6; a < 3.6; a += 0.5) k.c.set(Math.round(hx + Math.cos(a + 1.2) * 9), Math.round(hy + Math.sin(a + 1.2) * 9), k.trim[4]);
      gemAt(k, hx + 3, hy - 3.6, 3.6, G);
      break;
    }
    case "rings": {
      const ring = (rx: number, ry: number, rot: number, front: boolean) => { for (let a = 0; a < TAU; a += 0.03) { const x = Math.cos(a) * rx, y = Math.sin(a) * ry, X = hx + x * Math.cos(rot) - y * Math.sin(rot), Y = hy + x * Math.sin(rot) + y * Math.cos(rot); if ((Math.sin(a) > 0) === front) k.c.ellipse(X, Y, 1, 1, k.trim[Math.sin(a) > 0 ? 3 : 1]); } };
      ring(11, 3.6, 0.6, false); ring(11, 3.6, -0.7, false);
      k.c.shadedEllipse(hx, hy, 6, 6, G); if (k.rar) { k.c.set(Math.round(hx - 2.5), Math.round(hy - 2.5), WHITE); k.c.set(Math.round(hx - 1.5), Math.round(hy - 2.5), withA(WHITE, 150)); }
      ring(11, 3.6, 0.6, true); ring(11, 3.6, -0.7, true);
      for (const [rot, a] of [[0.6, 0.6], [-0.7, 2.4]]) { const x = Math.cos(a) * 11, y = Math.sin(a) * 3.6; k.c.shadedEllipse(hx + x * Math.cos(rot) - y * Math.sin(rot), hy + x * Math.sin(rot) + y * Math.cos(rot), 1.6, 1.6, k.trim); }
      break;
    }
    case "spine": for (const s of [-1, 0, 1]) dstroke(k, [[top, s * 1.2], [top + 4, s * 5.5], [top + 10, s * 5], [top + 13, s * 2.8]], 2.6, 1, (t) => k.bone[t > 0.7 ? 4 : 3]); gemAt(k, ...P(top + 8, 0), 3.8, G); skull(k, ...P(top - 1, 0), 0.9, G[2]); break;
    case "star": {
      const pts: Pt[] = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 4.6 : 12.5; pts.push([hx + Math.cos(a) * r, hy - 3 + Math.sin(a) * r]); }
      k.c.poly(pts, (x, y) => k.trim[cl(2.4 - (x - hx + y - hy) / 9, 1, 4)]);
      const pin: Pt[] = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 2.2 : 7; pin.push([hx + Math.cos(a) * r, hy - 3 + Math.sin(a) * r]); }
      k.c.poly(pin, (x, y) => G[cl(2.6 - (x - hx + y - hy) / 6, 1, 4)]); k.c.set(Math.round(hx - 1), Math.round(hy - 4), WHITE);
      break;
    }
    case "flame": {
      dpoly(k, [[top - 1, -3.4], [top + 3, -4.4], [top + 3, 4.4], [top - 1, 3.4]], k.trim, 0, 1.6);
      const tongue = (dx: number, h: number, w: number, col: Ramp) => { const bx = hx + dx, by = hy + 2; k.c.poly([[bx - w, by], [bx - w * 0.4, by - h * 0.55], [bx + 1 - dx * 0.2, by - h], [bx + w * 0.5, by - h * 0.5], [bx + w, by]], (x, y) => col[cl(1.2 + (by - y) / h * 3.2, 1, 4)]); };
      tongue(-5.5, 11, 3.2, k.fx); tongue(5.5, 12, 3.2, k.fx); tongue(0, 17, 4.6, G); tongue(0, 10, 2.4, k.fx);
      k.c.set(Math.round(hx), Math.round(hy - 6), WHITE);
      break;
    }
    case "fork": {
      dpoly(k, [[top - 1, -3.6], [top + 2, -3.6], [top + 2, 3.6], [top - 1, 3.6]], k.trim, 0, 1.6);
      for (const s of [-1, 1]) dstroke(k, [[top + 1, s * 2.4], [top + 5, s * 7.4], [top + 11, s * 7.4], [top + 16, s * 5]], 3.6, 1.2, (t) => k.trim[t > 0.6 ? 4 : 3]);
      dgem(k, top + 3.5, 0, 2.6, G);
      const zig: Pt[] = [[top + 15.5, -5], [top + 11.5, -1.2], [top + 13.5, 0.8], [top + 9, 5.5]];
      dstroke(k, zig, 2.6, 2.6, k.fx[2]); dstroke(k, zig, 1, 1, k.fx[4]);
      break;
    }
    case "crystal": collar(k, top); headCrystal(k, hx, hy - 1); break;
    case "vortex": collar(k, top); headVortex(k, hx, hy - 1); break;
    case "drop": collar(k, top); headDrop(k, hx, hy - 2); break;
    case "leafy": collar(k, top); headLeaves(k, hx, hy); break;
    case "bolt": collar(k, top); headBolt(k, hx, hy); break;
    case "antler": collar(k, top); headAntler(k, hx, hy); break;
    case "feather": {
      dpoly(k, [[top, -2.6], [top + 5, -3.4], [top + 7, 0], [top + 5, 3.4], [top, 2.6]], k.haft, 0, 1.6);
      dgem(k, top + 4.5, 0, 3.2, G); dpoly(k, [[top + 7.5, -1.4], [top + 13, 0], [top + 7.5, 1.4]], k.trim, 0, 1);
      for (let i = 0; i < 4; i++) {
        const [x, y] = P(top - 0.5 - i * 1.4, 2.4), col = [k.cloth, RP("white", "white"), k.cloth, RP("brown", "brown")][i], L = 15 - i * 2;
        stroke(k.c, [[x, y], [x + 2, y + L * 0.45], [x + 1, y + L]], 3.8, 1, (t) => col[cl(3.8 - t * 2.4)]);
        for (let j = 3; j < L - 2; j += 3) k.c.set(Math.round(x + 1.6), Math.round(y + j), col[0]);
        k.c.shadedEllipse(x, y, 1.4, 1.4, k.trim);
      }
      break;
    }
  }
  if (k.rich >= 3 && shape !== "skull" && shape !== "crescent" && shape !== "star" && shape !== "flame") for (const s of [-1, 1]) dpoly(k, [[top - 0.5, s * 2], [top - 4, s * 7.5], [top + 1.5, s * 3]], k.trim, s * 4, 2);
  if (k.L.deco === "wings" && shape !== "skull") for (const s of [-1, 1]) wing(k.c, ...P(top - 3, s * 1.8), s, 9, k.trim);
  if (k.L.deco === "chains") for (let i = 0; i < 5; i++) { const [x, y] = P(top - 2 - i * 1.4, 2.4 + i * 1.5); k.c.ellipse(x, y, 1, 1, k.trim[i % 2 ? 2 : 3]); }
}
function scepter(k: K, shape: string) {
  const G = k.stone, top = 29, hu = 36;
  if (shape === "wand") {
    shaft(k, 5, 40, 2.4, k.haft); for (let u = 7; u < 38; u += 2.2) dset(k, u, -0.6 + Math.sin(u) * 0.6, k.trim[3]); wraps(k, 5, 15, 3, k.grip); band(k, 15.5, 3.4);
    const [x, y] = P(43, 0);
    for (let a = 0; a < 5; a++) { const an = (a / 5) * TAU - Math.PI / 2; k.c.poly([[x + Math.cos(an - 0.55) * 2.4, y + Math.sin(an - 0.55) * 2.4], [x + Math.cos(an) * 7.4, y + Math.sin(an) * 7.4], [x + Math.cos(an + 0.55) * 2.4, y + Math.sin(an + 0.55) * 2.4]], G[a % 2 ? 2 : 3]); }
    k.c.shadedEllipse(x, y, 2.8, 2.8, G);
    for (const [dx, dy] of [[-8, -2], [4, -8], [7, 5]]) sparkle(k.c, Math.round(x + dx), Math.round(y + dy), G, k.rich >= 2 ? 1 : 0);
    pommel(k, 4.5, "ball");
    return;
  }
  if (shape === "censer") {
    shaft(k, 6, 24, 3.4, k.mat); wraps(k, 6, 14, 3.8, k.grip); pommel(k, 5, "ball"); band(k, 24, 4.6); dpoly(k, [[24, -1.4], [28, -3.6], [28.6, 0], [24, 1.4]], k.trim, -1, 1.2);
    const [x0, y0] = P(28.4, -2), bx = x0 + 4, by = y0 + 15;
    for (let i = 1; i <= 6; i++) { const t = i / 7; k.c.ellipse(x0 + (bx - x0) * t, y0 + (by - 7 - y0) * t, 1, 1, k.trim[i % 2 ? 2 : 3]); }
    k.c.shadedEllipse(bx, by, 6.6, 5.6, k.trim); k.c.shadedRect(bx - 4, by - 8, 8, 3, k.trim, 1); k.c.poly([[bx - 2, by - 8], [bx, by - 11.5], [bx + 2, by - 8]], k.trim[3]);
    for (const dx of [-3.4, 0, 3.4]) k.c.rect(Math.round(bx + dx - 0.5), Math.round(by - 1), 2, 3, G[2]);
    k.c.line(bx - 6, by + 1, bx + 6, by + 1, k.trim[1], 1);
    for (let i = 0; i < 4; i++) k.c.ellipse(bx + 4 + i * 1.8, by - 11 - i * 3.4, 2 - i * 0.25, 1.6, withA(RP("white", "white")[3], 170 - i * 35));
    return;
  }
  shaft(k, 6, top + 1, 3.4, shape !== "totem" ? k.mat : k.haft); wraps(k, 6, 15, 3.8, k.grip); band(k, 15.5, 4.2); pommel(k, 5, "ball");
  richHaft(k, 17, top, 3.4);
  const [hx, hy] = P(hu, 0);
  switch (shape) {
    case "crown": dpoly(k, [[top, -5], [top + 3.5, -5.4], [top + 3.5, 5.4], [top, 5]], k.trim, 0, 2.4); for (const v of [-5, -1.8, 1.8, 5]) dpoly(k, [[top + 3, v - 1.4], [top + 10 + (Math.abs(v) < 3 ? 2 : 0), v], [top + 3, v + 1.4]], k.trim, v, 1.4); for (const v of [-5, -1.8, 1.8, 5]) k.c.shadedEllipse(...P(top + 10 + (Math.abs(v) < 3 ? 2 : 0), v), 1, 1, k.trim); gemAt(k, ...P(top + 5.5, 0), 2.8, G); dpoly(k, [[top + 12, -0.8], [top + 17, -0.8], [top + 17, 0.8], [top + 12, 0.8]], k.trim, 0, 1); dpoly(k, [[top + 14.4, -2.6], [top + 15.6, -2.6], [top + 15.6, 2.6], [top + 14.4, 2.6]], k.trim, 0, 1); break;
    case "totem": dpoly(k, [[top - 1, -5], [top + 12, -5], [top + 12, 5], [top - 1, 5]], k.haft, 0, 2.6); for (const v of [-2.2, 2.2]) dgem(k, top + 8, v, 1.2, G); dpoly(k, [[top + 2, -3], [top + 4, -3], [top + 4, 3], [top + 2, 3]], k.haft, 0, 1, 0, 1); for (const v of [-2, -0.7, 0.7, 2]) dset(k, top + 3, v, k.bone[3]); dline(k, top + 6, -4.6, top + 6, 4.6, k.haft[0], 1); for (const s of [-1, 1]) { const [x, y] = P(top + 9, s * 5); stroke(k.c, [[x, y], [x - s * 4.5, y + 2], [x - s * 5, y + 9]], 3.4, 1, (t) => k.cloth[cl(3.6 - t * 2)]); } dpoly(k, [[top + 12, -4], [top + 16, -1.4], [top + 16, 1.4], [top + 12, 4]], k.cloth, 0, 1.4); break;
    case "sun": for (let a = 0; a < 16; a++) { const an = (a / 16) * TAU; k.c.poly([[hx + Math.cos(an - 0.16) * 5.6, hy + Math.sin(an - 0.16) * 5.6], [hx + Math.cos(an) * (a % 2 ? 9 : 12.5), hy + Math.sin(an) * (a % 2 ? 9 : 12.5)], [hx + Math.cos(an + 0.16) * 5.6, hy + Math.sin(an + 0.16) * 5.6]], k.trim[a % 2 ? 3 : 4]); } k.c.shadedEllipse(hx, hy, 6.4, 6.4, k.trim); gemAt(k, hx, hy, 3.6, G); break;
    case "serpent": {
      const sk = RP(k.umb ? "black" : "green", "green");
      for (let i = 0; i < 34; i++) { const u = 14 + i * 0.68, v = Math.sin(i * 0.62) * 3.2; const [x, y] = P(u, v); k.c.ellipse(x, y, 1.6, 1.6, sk[Math.cos(i * 0.62) > 0 ? 3 : 1]); if (i % 3 === 0) k.c.set(Math.round(x), Math.round(y), sk[4]); }
      const [sx, sy] = P(top + 6, -1.5); k.c.shadedEllipse(sx, sy, 4.8, 3.6, sk); k.c.set(Math.round(sx - 1.5), Math.round(sy - 1.2), G[3]); k.c.set(Math.round(sx + 1.5), Math.round(sy - 1.2), G[3]); k.c.line(sx + 4, sy - 1, sx + 7, sy - 3.5, RP("red", "red")[3], 1);
      gemAt(k, ...P(top + 12, 0), 3, G);
      break;
    }
    case "eye": {
      k.c.ellipse(hx, hy, 9, 9, k.trim[2]); k.c.ellipse(hx - 0.5, hy - 0.5, 8, 8, k.trim[3]); k.c.ellipse(hx, hy, 7, 7, k.trim[0]);
      for (let a = 0; a < 12; a++) { const an = (a / 12) * TAU; k.c.line(hx + Math.cos(an) * 9, hy + Math.sin(an) * 9, hx + Math.cos(an) * (a % 2 ? 11 : 13), hy + Math.sin(an) * (a % 2 ? 11 : 13), k.trim[3], 1); }
      k.c.shadedEllipse(hx, hy, 6.2, 4.4, k.bone); k.c.shadedEllipse(hx, hy, 3.2, 3.2, G); k.c.ellipse(hx, hy, 1, 2.2, VOIDC); if (k.rar) k.c.set(Math.round(hx - 1.5), Math.round(hy - 1.5), WHITE);
      break;
    }
    case "crystal": collar(k, top); headCrystal(k, hx, hy - 1, 0.9); break;
    case "bloom": collar(k, top); headBloom(k, hx, hy, 1); break;
    case "drop": collar(k, top); headDrop(k, hx, hy - 1, 0.9); break;
    case "bolt": collar(k, top); headBolt(k, hx, hy, 0.9); break;
    default: dpoly(k, [[top - 1, -4], [top + 2.5, -4], [top + 2.5, 4], [top - 1, 4]], k.trim, 0, 1.8); for (const s of [-1, 1]) dstroke(k, [[top + 2, s * 3.2], [top + 6.5, s * 6], [top + 12, s * 3]], 2.6, 1, (t) => k.trim[t > 0.5 ? 4 : 3]); gemAt(k, hx + 1, hy - 1, 4.4, G); dpoly(k, [[top + 12.5, -1.2], [top + 16.5, 0], [top + 12.5, 1.2]], k.trim, 0, 1);
  }
  if (k.rich >= 3 && shape !== "sun" && shape !== "eye") for (const s of [-1, 1]) dpoly(k, [[top - 1, s * 2.4], [top - 4.5, s * 7], [top + 1, s * 3.4]], k.trim, s * 4, 2);
  if (k.L.deco === "wings") for (const s of [-1, 1]) wing(k.c, ...P(top - 1, s * 2), s, 9, k.trim);
  if (k.L.deco === "horns") for (const s of [-1, 1]) horn(k.c, ...P(top + 1, s * 4), s, 8, k.bone);
}

// ---------------- вторая рука ----------------
function orb(k: K, shape: string) {
  const c = k.c, G = k.stone, cx = 24;
  const stand = () => {
    c.poly([[14, 45], [34, 45], [31, 39], [17, 39]], lit(k.trim, 20, 41, 4));
    c.rect(15, 44, 18, 1, k.trim[1]);
    for (const s of [-1, 0, 1]) stroke(c, [[cx + s * 5, 39], [cx + s * 9, 32], [cx + s * 7, 25]], 2.6, 1.2, k.trim[s < 0 ? 3 : 2]);
  };
  switch (shape) {
    case "crystal": c.poly([[12, 45], [36, 45], [33, 41], [15, 41]], lit(k.trim, 20, 42, 4)); for (const [x, hgt, w] of [[16, 20, 4], [24, 32, 6], [32, 18, 4], [20, 14, 3], [29, 24, 3.4]] as number[][]) { c.poly([[x - w, 42], [x - w, 42 - hgt * 0.72], [x, 42 - hgt], [x + w, 42 - hgt * 0.72], [x + w, 42]], (px) => G[px < x ? 3 : px > x + 0.5 ? 1 : 2]); c.line(x, 42 - hgt + 1, x, 41, G[4], 1); } break;
    case "eye": {
      if (k.umb) for (const s of [-1, 1]) for (let j = 0; j < 2; j++) stroke(c, [[cx + s * 6, 32], [cx + s * (10 + j * 3), 38], [cx + s * (8 + j * 5), 45]], 3 - j, 1, RP("violet", "violet")[2 + j]);
      c.shadedEllipse(cx, 22, 13, 13, k.bone); c.shadedEllipse(cx, 22, 7, 7, G); c.ellipse(cx, 22, 2.4, 4.4, VOIDC); c.ellipse(cx - 3, 18, 1.4, 1.4, WHITE);
      for (const [a, b] of [[12, 18], [36, 26], [14, 30], [34, 14], [24, 9]]) stroke(c, [[a, b], [a + (cx - a) * 0.2, b + (22 - b) * 0.2 + 1], [a + (cx - a) * 0.4, b + (22 - b) * 0.4]], 1, 1, RP("ruby", "ruby")[2]);
      c.poly(arc(cx, 22, 14.5, Math.PI * 1.1, Math.PI * 1.9, 12).concat(arc(cx, 22, 12.5, Math.PI * 1.9, Math.PI * 1.1, 12)), k.trim[2]);
      break;
    }
    case "lantern": c.ellipse(cx, 5, 3, 3, k.trim[2]); c.clear(cx, 5); c.clear(cx - 1, 5); c.poly([[14, 12], [34, 12], [30, 8], [18, 8]], lit(k.trim, 20, 9, 3)); c.shadedRect(13, 38, 22, 5, k.trim, 1); c.rect(15, 12, 18, 26, withA(G[1], 190)); c.ellipse(cx, 27, 5, 8, G[3]); c.ellipse(cx, 29, 3, 5, G[4]); c.ellipse(cx, 30, 1.4, 2.4, WHITE); for (const x of [14, 23, 33]) c.rect(x, 12, 2, 26, k.mat[x === 14 ? 4 : 2]); c.rect(15, 24, 18, 1, k.mat[2]); break;
    case "prism": c.poly([[cx, 4], [39, 34], [24, 41], [9, 34]], (x, y) => G[cl(3.4 - (x - 14) / 7 + (y < 14 ? 1 : 0), 1, 4)]); c.line(cx, 4, cx, 41, G[4], 1); c.line(9, 34, 24, 41, G[1], 1); for (const [a, b] of [[cx, 0], [2, 46], [46, 46], [46, 20], [2, 20]]) c.line(cx, 26, a, b, withA(G[4], 70), 1); break;
    case "skull": stand(); skull(k, cx, 22, 2.7, k.fx[3]); for (const s of [-1, 1]) c.ellipse(cx + s * 3.6, 16, 1.6, 3, withA(k.umb ? k.fx[3] : RP("fire", "fire")[3], 200)); c.line(cx + 2, 13, cx + 5, 18, k.fx[3], 1); break;
    case "orbit": stand(); c.shadedEllipse(cx, 21, 7, 7, G); c.set(cx - 3, 18, WHITE); for (const [rx, ry, rot] of [[13, 4.5, 0.4], [13, 4.5, -0.6]] as number[][]) for (let a = 0; a < TAU; a += 0.02) { const x = Math.cos(a) * rx, y = Math.sin(a) * ry, X = cx + x * Math.cos(rot) - y * Math.sin(rot), Y = 21 + x * Math.sin(rot) + y * Math.cos(rot); if (Math.sin(a) > 0 || Math.hypot(X - cx, Y - 21) > 7.5) c.set(Math.round(X), Math.round(Y), k.trim[Math.sin(a) > 0 ? 3 : 2]); } for (const [x, y] of [[cx + 12, 16], [cx - 10, 27]]) c.shadedEllipse(x, y, 1.8, 1.8, k.trim); break;
    case "vortex": stand(); c.shadedEllipse(cx, 21, 11, 11, G); for (let i = 0; i < 70; i++) { const a = i * 0.32, r = 1 + i * 0.14; c.ellipse(cx + Math.cos(a) * r, 21 + Math.sin(a) * r, 0.9, 0.9, G[i % 3 ? 4 : 1]); } c.set(cx - 5, 15, WHITE); break;
    case "blood": stand(); c.shadedEllipse(cx, 21, 11, 11, G); for (const [dx, dy] of [[-4, -3], [3, -5], [2, 4], [-3, 5]]) c.poly([[cx + dx, 18 + dy], [cx + dx + 2, 21 + dy], [cx + dx, 23 + dy], [cx + dx - 2, 21 + dy]], G[4]); stroke(c, [[cx, 32], [cx, 37]], 2.4, 1, G[3]); c.ellipse(cx, 38, 1.3, 1.6, G[4]); c.set(cx - 5, 15, WHITE); break;
    case "galaxy": stand(); c.shadedEllipse(cx, 21, 11, 11, [VOIDC, G[0], G[0], G[1], G[1]]); for (let a = 0; a < TAU; a += 0.04) { const x = Math.cos(a) * 9, y = Math.sin(a) * 3; c.set(Math.round(cx + x * 0.94 - y * 0.34), Math.round(21 + x * 0.34 + y * 0.94), G[3]); } for (const [dx, dy] of [[-5, -4], [4, -6], [6, 3], [-3, 6], [0, -1]]) sparkle(c, cx + dx, 21 + dy, G, 1); break;
    case "thorn": stand(); c.shadedEllipse(cx, 21, 10, 10, G); for (const ph of [0, 2.6]) for (let i = 0; i <= 40; i++) { const t = i / 40, a = ph + t * 7, x = cx + Math.sin(a) * 11 * Math.sin(t * Math.PI * 0.9 + 0.1), y = 12 + t * 22; c.ellipse(x, y, 1.1, 1.1, k.haft[2]); if (i % 5 === 2) c.poly([[x - 1, y], [x + (Math.cos(a) > 0 ? 4 : -4), y - 2], [x + 1, y + 1]], k.bone[3]); } break;
    case "storm": { stand(); c.shadedEllipse(cx, 21, 11, 11, [G[0], G[0], G[1], G[1], G[2]]); const z: Pt[] = [[cx - 3, 12], [cx + 3, 19], [cx - 2, 21], [cx + 4, 29]]; stroke(c, z, 3, 2, k.fx[3]); stroke(c, z, 1.2, 1, WHITE); for (const [dx, dy] of [[-7, 18], [7, 16]]) sparkle(c, cx + dx, dy, G, 1); break; }
    default: stand(); c.shadedEllipse(cx, 21, 11, 11, G); c.shadedEllipse(cx - 3.5, 17, 3, 3, [G[3], G[4], WHITE, WHITE, WHITE]); for (let i = 0; i < 6; i++) { const a = i * 1.1 + (k.h & 3); c.set(Math.round(cx + Math.cos(a) * 6), Math.round(21 + Math.sin(a) * 6), withA(G[4], 160)); }
  }
  if (k.L.deco === "skull" && shape !== "eye" && shape !== "skull") skull(k, cx, 40, 1.2);
  if (k.L.deco === "wings") for (const s of [-1, 1]) wing(c, cx + s * 10, 26, s, 10, k.trim);
  if (k.L.deco === "horns") for (const s of [-1, 1]) horn(c, cx + s * 8, 14, s, 9, k.bone);
  if (k.L.deco === "chains") for (let x = 8; x < 40; x += 2.5) c.ellipse(x, 34 + Math.sin(x / 5) * 2, 1, 1, k.trim[3]);
}
function tome(k: K, shape: string) {
  const c = k.c, G = k.stone;
  if (shape === "scroll") {
    c.poly([[9, 11], [39, 11], [39, 37], [9, 37]], lit(k.bone, 16, 16, 9, 1, 4));
    for (let y = 15; y < 34; y += 3) c.line(13, y, 33 - (y % 2) * 4, y, k.cloth[1], 1);
    rune(c, 34, 30, k.fx[2], k.h);
    for (const y of [10, 37]) { c.shadedRect(6, y - 2.5, 36, 5, k.haft, 2); c.shadedEllipse(5, y, 2.6, 2.6, k.trim); c.shadedEllipse(43, y, 2.6, 2.6, k.trim); }
    c.shadedEllipse(24, 39.5, 3.4, 3.4, RP(k.umb ? "bloodgem" : "ruby", "ruby")); c.line(22, 42, 20, 46, RP("red", "red")[2], 2); c.line(26, 42, 28, 46, RP("red", "red")[2], 2);
    return;
  }
  const thick = shape === "thick" || shape === "grimoire";
  const covR = shape === "star" ? RP("star", "blue") : shape === "grimoire" ? (k.umb ? RP("blackleather", "black") : RP("darkleather", "brown")) : k.cloth;
  c.poly([[35, 7], [41, 9], [41, 43], [35, 42]], lit(k.bone, 37, 12, 4, 2, 4)); for (let y = 10; y < 42; y += 2) c.line(36, y, 40, y + 0.5, k.bone[1], 1);
  if (thick) c.poly([[35, 42], [41, 43], [41, 45], [35, 44]], k.bone[1]);
  c.poly([[8, 5], [35, 5], [35, 43], [8, 43]], lit(covR, 14, 12, 8, 1, 4)); c.rect(8, 5, 3, 38, covR[0]); c.rect(11, 5, 1, 38, covR[3]);
  for (const [x, y, sx, sy] of [[8, 5, 1, 1], [35, 5, -1, 1], [8, 43, 1, -1], [35, 43, -1, -1]]) c.poly([[x, y], [x + sx * 6, y], [x, y + sy * 6]], k.trim[3]);
  c.rect(12, 8, 21, 1, k.trim[2]); c.rect(12, 39, 21, 1, k.trim[2]);
  switch (shape) {
    case "grimoire": skull(k, 22, 22, 1.9, k.fx[3]); c.line(6, 15, 42, 19, k.trim[2], 2); c.line(6, 33, 42, 29, k.trim[2], 2); for (const [x, y] of [[9, 15], [39, 18], [9, 33], [39, 30]]) c.ellipse(x, y, 1.4, 1.4, k.trim[3]); break;
    case "prayer": c.rect(20, 11, 4, 24, k.trim[3]); c.rect(14, 18, 16, 4, k.trim[3]); c.rect(21, 12, 1, 22, k.trim[4]); gemAt(k, 22, 20, 1.8, G); for (const [x, col] of [[28, k.cloth[4]], [31, RP("red", "red")[2]]] as [number, RGBA][]) c.line(x, 43, x + 1, 47, col, 2); break;
    case "star": { const W2 = withA(WHITE, 120); c.ellipse(22, 24, 9, 9, withA(k.trim[3], 110)); c.ellipse(22, 24, 8, 8, covR[2]); for (const [[a, b], [d, e]] of [[[15, 13], [22, 17]], [[22, 17], [29, 12]], [[22, 17], [26, 25]], [[26, 25], [17, 29]], [[17, 29], [20, 37]]] as Pt[][]) c.line(a, b, d, e, W2, 1); for (const [x, y] of [[15, 13], [22, 17], [29, 12], [26, 25], [17, 29], [30, 34], [20, 37]]) sparkle(c, x, y, G, 1); break; }
    case "eye": case "frost": case "blood": case "bolt": case "leaf": case "wing": crestAt(c, TOME_CREST[shape], 22, 24, 4, k.trim[3], k.stone[3]); for (const [x, y] of [[13, 14], [31, 14], [13, 34], [31, 34]]) c.set(x, y, k.trim[4]); break;
    default: c.ellipse(22, 24, 8, 8, k.trim[2]); c.ellipse(22, 24, 6.4, 6.4, covR[1]); for (let a = 0; a < 8; a++) { const an = (a / 8) * TAU; c.line(22 + Math.cos(an) * 6.5, 24 + Math.sin(an) * 6.5, 22 + Math.cos(an) * 9.5, 24 + Math.sin(an) * 9.5, k.trim[3], 1); } gemAt(k, 22, 24, 3.6, G); if (k.umb) c.ellipse(22, 24, 1, 2.6, VOIDC);
  }
  c.shadedRect(34, 20, 6, 7, k.trim, 1); c.set(36, 22, k.trim[4]);
  if (k.L.deco === "chains" && shape !== "grimoire") for (let x = 6; x < 42; x += 2.4) c.ellipse(x, 30 + Math.sin(x / 4), 1, 1, k.trim[3]);
  if (k.L.deco === "wings") { wing(c, 10, 18, 1, 9, k.trim); wing(c, 37, 18, -1, 9, k.trim); }
  if (k.L.deco === "runes") for (let i = 0; i < 3; i++) rune(c, 14 + i * 8, 41, k.fx[3], i + k.h);
}
function emblem(k: K, x: number, y: number, s = 1) {
  const c = k.c;
  if (k.umb) { skull(k, x, y, 1.6 * s); if (k.L.deco === "horns") for (const d of [-1, 1]) horn(c, x + d * 4 * s, y - 3 * s, d, 7 * s, k.bone); return; }
  if (k.sol) { c.rect(Math.round(x - 1.5 * s), Math.round(y - 9 * s), Math.round(3 * s), Math.round(18 * s), k.trim[3]); c.rect(Math.round(x - 7 * s), Math.round(y - 3 * s), Math.round(14 * s), Math.round(3 * s), k.trim[3]); c.rect(Math.round(x - 1.5 * s), Math.round(y - 9 * s), 1, Math.round(18 * s), k.trim[4]); return; }
  stroke(c, [[x - 8 * s, y + 2 * s], [x, y - 5 * s], [x + 8 * s, y + 2 * s]], 3 * s, 3 * s, k.trim[3]);
  for (const d of [-1, 0, 1]) c.ellipse(x + d * 2.6 * s, y + 5 * s - Math.abs(d) * s, 1.2 * s, 1.5 * s, k.trim[2]);
}
function shield(k: K, shape: string) {
  const c = k.c;
  const shapes: Record<string, Pt[]> = {
    heater: [[8, 5], [40, 5], [40, 21], [36, 31], [24, 44], [12, 31], [8, 21]],
    tower: [[10, 6], [24, 3], [38, 6], [38, 41], [24, 45], [10, 41]],
    kite: [[24, 2], [37, 8], [36, 22], [30, 34], [24, 46], [18, 34], [12, 22], [11, 8]],
    buckler: arc(24, 24, 14, 0, TAU, 36), round: arc(24, 24, 19, 0, TAU, 40), aegis: arc(24, 24, 19, 0, TAU, 40), spiked: arc(24, 24, 16, 0, TAU, 36),
    bone: [[10, 8], [24, 4], [38, 8], [36, 30], [24, 44], [12, 30]],
    ward: [[24, 3], [39, 11], [39, 33], [24, 45], [9, 33], [9, 11]],
    crescent: [[8, 5], [19, 8], [24, 4], [29, 8], [40, 5], [40, 21], [36, 31], [24, 44], [12, 31], [8, 21]],
    crystal: [[24, 2], [40, 16], [34, 42], [24, 46], [14, 42], [8, 16]],
  };
  const outer = shapes[shape] ?? shapes.heater, cy = shape === "kite" || shape === "heater" || shape === "bone" || shape === "crescent" || shape === "winged" ? 21 : 24;
  const inset = (pts: Pt[], f: number) => pts.map(([x, y]) => [24 + (x - 24) * f, cy + (y - cy) * f] as Pt);
  if (shape === "spiked") for (let a = 0; a < 12; a++) { const an = (a / 12) * TAU; c.poly([[24 + Math.cos(an - 0.15) * 15, 24 + Math.sin(an - 0.15) * 15], [24 + Math.cos(an) * 22.5, 24 + Math.sin(an) * 22.5], [24 + Math.cos(an + 0.15) * 15, 24 + Math.sin(an + 0.15) * 15]], k.mat[a % 3 ? 3 : 4]); }
  c.poly(outer, lit(shape === "bone" ? k.bone : shape === "aegis" ? k.trim : k.mat, 16, 14, 7));
  if (shape === "bone") {
    c.poly(inset(outer, 0.84), lit(k.cloth, 16, 14, 8, 1, 3));
    for (let i = 0; i < 4; i++) { const y = 15 + i * 6; for (const s of [-1, 1]) stroke(c, [[24, y], [24 + s * 7, y + 1], [24 + s * 10, y + 4]], 2.6, 1.4, k.bone[3 - (i % 2)]); }
    c.rect(23, 14, 3, 24, k.bone[2]); skull(k, 24, 11, 1.6, k.fx[3]);
  } else if (shape === "round") {
    c.poly(inset(outer, 0.86), (x, y) => k.haft[((x >> 2) % 2) + 2 - (y > 30 ? 1 : 0)]);
    for (let x = 9; x < 40; x += 4) for (let y = 8; y < 41; y++) if (Math.hypot(x - 24, y - 24) < 16.2) c.set(x, y, k.haft[0]);
    c.shadedEllipse(24, 24, 6.4, 6.4, k.trim); for (let a = 0; a < 12; a++) { const an = (a / 12) * TAU; c.shadedEllipse(24 + Math.cos(an) * 17.4, 24 + Math.sin(an) * 17.4, 1.2, 1.2, k.trim); }
  } else if (shape === "aegis") {
    c.poly(inset(outer, 0.8), lit(k.cloth, 18, 16, 8, 1, 4));
    for (let a = 0; a < 16; a++) { const an = (a / 16) * TAU; c.poly([[24 + Math.cos(an - 0.12) * 6, 24 + Math.sin(an - 0.12) * 6], [24 + Math.cos(an) * (a % 2 ? 12 : 15), 24 + Math.sin(an) * (a % 2 ? 12 : 15)], [24 + Math.cos(an + 0.12) * 6, 24 + Math.sin(an + 0.12) * 6]], k.trim[a % 2 ? 3 : 4]); }
    c.shadedEllipse(24, 24, 6, 6, k.trim);
  } else if (shape === "buckler" || shape === "spiked") {
    const r = shape === "spiked" ? 12 : 10.5;
    c.ellipse(24, 24, r, r, k.mat[1]); c.shadedEllipse(24, 24, r - 1.5, r - 1.5, k.mat);
    for (let a = 0; a < 8; a++) { const an = (a / 8) * TAU; c.shadedEllipse(24 + Math.cos(an) * (r + 1.5), 24 + Math.sin(an) * (r + 1.5), 1.1, 1.1, k.trim); }
    c.shadedEllipse(24, 24, 5, 5, k.trim);
    if (shape === "spiked") c.poly([[22, 22], [24, 14], [26, 22]], k.mat[4]);
  } else {
    const inner = inset(outer, 0.8);
    c.poly(inner, (x, y) => (k.h & 2 && shape !== "tower" && (x < 24) !== (y < cy) ? lit(k.cloth, 18, 14, 8, 0, 2)(x, y) : lit(k.cloth, 18, 14, 8, 1, 3)(x, y)));
    if (k.crestKind) crestAt(c, k.crestKind, 24, cy, 4.2, k.trim[3], k.stone[3]); else emblem(k, 24, cy, shape === "tower" ? 1.2 : 1);
    if (shape === "tower") { for (const [x, y] of [[12, 9], [36, 9], [12, 38], [36, 38], [24, 6], [24, 42]]) c.shadedEllipse(x, y, 1.1, 1.1, k.trim); c.rect(16, 11, 16, 2, DARK); }
  }
  if (shape === "winged") { wing(c, 9, 12, 1, 11, k.trim); wing(c, 39, 12, -1, 11, k.trim); }
  if (k.gem && shape !== "bone" && !k.crestKind) gemAt(k, 24, cy, shape === "buckler" ? 2.6 : 3);
  if (k.L.deco === "spikes" && shape !== "spiked") for (const [x, y, dx] of [[10, 7, -4], [38, 7, 4]] as number[][]) c.poly([[x, y + 2], [x + dx, y - 4], [x - Math.sign(dx) * 2, y]], k.mat[4]);
  if (k.L.deco === "wings") { wing(c, 9, 12, 1, 9, k.trim); wing(c, 39, 12, -1, 9, k.trim); }
  if (k.L.deco === "chains") for (let x = 9; x < 40; x += 2.5) c.ellipse(x, 32 + Math.sin(x / 4) * 1.5, 1, 1, k.trim[3]);
}

// ---------------- шлемы ----------------
function helmDeco(k: K, top: number, cx = 24) {
  const c = k.c;
  switch (k.L.deco) {
    case "horns": for (const s of [-1, 1]) horn(c, cx + s * 9, top + 8, s, 11, k.bone); break;
    case "wings": for (const s of [-1, 1]) wing(c, cx + s * 11, top + 10, s, 11, RP("silver", "silver")); break;
    case "halo": c.rect(cx - 11, top + 8, 22, 2, k.trim[3]); c.rect(cx - 11, top + 8, 22, 1, k.trim[4]); for (const x of [cx - 6, cx, cx + 6]) gemAt(k, x, top + 9, 1.1, k.stone); break; // нимб — только у легендарок, у моделей обруч
    case "spikes": for (const x of [cx - 7, cx, cx + 7]) c.poly([[x - 1.6, top + 5], [x, top - 3 - (x === cx ? 3 : 0)], [x + 1.6, top + 5]], lit(k.mat, x - 1, top, 2)); break;
    case "skull": skull(k, cx, top + 9, 1.2); break;
    case "runes": for (let i = 0; i < 3; i++) rune(c, cx - 7 + i * 7, top + 11, k.fx[3], i + k.h); break;
    case "filigree": for (let x = cx - 9; x <= cx + 9; x += 2) c.set(x, top + 8 + ((x >> 1) % 2), k.trim[3]); break;
    case "chains": for (let x = cx - 10; x <= cx + 10; x += 2.5) c.ellipse(x, top + 22 + Math.sin(x / 3), 1, 1, k.trim[3]); break;
  }
}
function plume(k: K, x: number, y: number) {
  for (let i = 0; i < 5; i++) stroke(k.c, [[x, y], [x + 3 + i * 2, y - 8 + i], [x + 6 + i * 3, y - 3 + i * 1.6]], 3, 1, (t) => k.cloth[cl(4 - t * 2 - (i % 2))]);
}
function plateHelm(k: K, shape: string) {
  const c = k.c, m = k.mat, L = lit(m, 16, 12, 6);
  const dome = (top: number, bottom: number) => c.shadedEllipse(24, top + 11, 14, 12, m, undefined, true, bottom);
  const cheeks = (y: number) => { c.poly([[10, y], [17, y], [17, 39], [12, 39]], lit(m, 12, y + 3, 4, 1, 3)); c.poly([[31, y], [38, y], [36, 39], [31, 39]], lit(m, 33, y + 3, 4, 0, 2)); };
  const mail = (y: number) => { for (let yy = y; yy < 46; yy++) for (let x = 11; x < 38; x++) if ((x + yy) % 2 === 0) c.set(x, yy, m[(x + yy) % 4 ? 1 : 3]); };
  let top = 6;
  switch (shape) {
    case "great": mail(40); c.poly([[10, 8], [38, 8], [38, 41], [10, 41]], L); c.rect(10, 7, 28, 2, m[4]); c.rect(11, 19, 26, 3, DARK); c.rect(22, 22, 4, 18, k.trim[2]); c.rect(22, 9, 4, 10, k.trim[2]); for (let y = 26; y < 38; y += 3) for (const x of [29, 32, 35]) c.set(x, y, DARK); break;
    case "barbute": c.poly([[10, 14], [16, 6], [32, 6], [38, 14], [38, 42], [10, 42]], L); c.rect(21, 17, 6, 25, DARK); c.rect(14, 17, 20, 4, DARK); c.rect(10, 40, 28, 2, k.trim[2]); c.line(24, 7, 24, 16, m[4], 1); top = 5; break;
    case "bascinet": mail(38); c.poly([[24, 1], [36, 14], [37, 30], [31, 38], [17, 38], [11, 30], [12, 14]], L); c.poly([[14, 21], [34, 21], [31, 31], [24, 39], [17, 31]], lit(m, 18, 24, 4, 1, 4)); c.rect(16, 23, 16, 2, DARK); for (const y of [28, 31]) for (const x of [20, 24, 28]) c.set(x, y, DARK); c.line(24, 21, 24, 38, m[4], 1); top = 1; break;
    case "armet": mail(40); dome(4, 32); c.poly([[10, 26], [38, 26], [35, 40], [13, 40]], lit(m, 16, 30, 4, 1, 3)); c.poly([[13, 17], [35, 17], [33, 28], [24, 32], [15, 28]], lit(m, 18, 20, 4, 1, 4)); for (const y of [20, 23]) c.rect(15, y, 18, 1, DARK); c.rect(23, 4, 2, 13, m[4]); for (const x of [13, 35]) c.shadedEllipse(x, 18, 1.4, 1.4, k.trim); top = 5; break;
    case "sallet": c.poly([[8, 18], [13, 7], [28, 4], [37, 10], [44, 32], [36, 29], [35, 31], [10, 31]], L); c.rect(11, 18, 22, 3, DARK); c.poly([[12, 31], [33, 31], [30, 41], [15, 41]], lit(m, 18, 34, 4, 1, 3)); c.line(13, 8, 37, 12, m[4], 1); top = 4; break;
    case "crowned": dome(6, 33); cheeks(28); c.rect(10, 26, 28, 4, k.trim[2]); c.rect(22, 28, 4, 12, m[3]); for (const [x, hh] of [[12, 6], [18, 9], [24, 12], [30, 9], [36, 6]]) c.poly([[x - 2.5, 13], [x, 13 - hh], [x + 2.5, 13]], lit(k.trim, x - 1, 8, 2)); c.rect(10, 12, 28, 3, k.trim[3]); for (const x of [18, 24, 30]) gemAt(k, x, 13.5, 1.2); top = 2; break;
    default: {
      mail(38); dome(6, 30); c.rect(9, 26, 30, 4, k.trim[2]); c.rect(9, 26, 30, 1, k.trim[4]); cheeks(30); c.rect(22, 27, 4, 12, m[3]); c.rect(22, 27, 1, 12, m[4]);
      c.rect(17, 30, 5, 7, DARK); c.rect(26, 30, 5, 7, DARK); c.line(16, 8, 30, 8, m[4], 1);
      if (shape === "horned") for (const s of [-1, 1]) horn(c, 24 + s * 11, 22, s, 14, k.bone);
      if (shape === "plumed") plume(k, 24, 6);
      if (shape === "spired") for (const [x, hh] of [[14, 7], [19, 11], [24, 15], [29, 11], [34, 7]]) c.poly([[x - 2, 10], [x, 10 - hh], [x + 2, 10]], lit(m, x - 1, 4, 3));
      if (shape === "antlered") for (const s of [-1, 1]) { stroke(c, [[24 + s * 8, 13], [24 + s * 12, 6], [24 + s * 13, 1]], 3, 1, k.bone[3]); stroke(c, [[24 + s * 11, 8], [24 + s * 17, 5]], 2, 1, k.bone[3]); stroke(c, [[24 + s * 12.5, 3], [24 + s * 17, 1]], 2, 1, k.bone[2]); }
    }
  }
  if (k.umb && (shape === "great" || shape === "barbute" || shape === "armet" || shape === "bascinet")) for (const x of [18, 29]) c.rect(x, shape === "great" ? 20 : shape === "bascinet" ? 23 : shape === "armet" ? 20 : 18, 2, 1, k.fx[3]);
  if (!(shape === "horned" && k.L.deco === "horns")) helmDeco(k, top);
  if (k.gem && shape !== "crowned" && k.L.deco !== "skull") gemAt(k, 24, top + 7, 2);
}
function leatherHelm(k: K, shape: string) {
  const c = k.c, hd = k.hide, cc = k.cloth, eye = k.umb ? k.fx[3] : k.sol ? hex("#a8d4ff") : hex("#ffe070");
  const face = (x0: number, x1: number, y0: number, y1: number) => { c.poly([[24, y0], [x1, y0 + 6], [x1, y1], [x0, y1], [x0, y0 + 6]], VOIDC); c.rect(19, y0 + 9, 3, 1, eye); c.rect(27, y0 + 9, 3, 1, eye); };
  const fur = RP(k.umb ? "black" : "grey", "grey");
  switch (shape) {
    case "fur": c.shadedEllipse(24, 23, 13, 12, hd, undefined, true, 30); for (let x = 9; x <= 39; x++) for (let y = 27; y <= 35; y++) if ((x * 7 + y * 13) % 5 < 4 && Math.abs(x - 24) < 15.5 - (y - 31) ** 2 * 0.1) c.set(x, y, RP("whitefur", "white")[1 + ((x + y * 3) % 4)]); stroke(c, [[34, 24], [38, 12], [40, 4]], 3, 1, (t) => cc[cl(4 - t * 2)]); stroke(c, [[35, 23], [41, 14]], 2, 1, RP("white", "white")[3]); break;
    case "cap": c.shadedEllipse(24, 22, 13, 13, hd, undefined, true, 31); for (const x of [10, 33]) c.shadedRect(x, 26, 5, 15, hd, 2); c.line(14, 10, 24, 31, hd[0], 1); c.line(34, 10, 24, 31, hd[0], 1); for (const [x, y] of [[24, 12], [17, 18], [31, 18]]) c.shadedEllipse(x, y, 1.1, 1.1, k.trim); c.rect(12, 27, 24, 3, hd[1]); for (const x of [18, 30]) { c.ellipse(x, 28, 3.4, 3, k.trim[2]); c.ellipse(x, 28, 2.2, 1.8, RP("diamond", "white")[1]); c.set(x - 1, 27, WHITE); } break;
    case "pelt":
      c.poly([[24, 6], [36, 12], [40, 40], [30, 34], [18, 34], [8, 40], [12, 12]], lit(fur, 16, 12, 7, 0, 3));
      for (const s of [-1, 1]) c.poly([[24 + s * 6, 9], [24 + s * 11, 0], [24 + s * 13, 10]], fur[s < 0 ? 3 : 1]);
      c.poly([[17, 12], [31, 12], [29, 22], [24, 26], [19, 22]], lit(fur, 20, 14, 4, 1, 4));
      for (const x of [19, 27]) c.rect(x, 15, 3, 2, eye);
      c.rect(23, 23, 3, 2, DARK); for (const x of [20, 28]) c.poly([[x, 24], [x + 1, 28], [x + 2, 24]], WHITE);
      face(14, 34, 26, 36); break;
    case "band": { // бандана: тканевый колпак, узел и хвосты
      c.shadedEllipse(24, 25, 14, 13, cc, undefined, true, 31);
      c.poly([[10, 26], [38, 26], [38, 31], [10, 31]], lit(cc, 16, 27, 4, 1, 3)); c.rect(10, 26, 28, 1, cc[4]);
      for (let x = 13; x < 36; x += 4) for (let y = 15; y < 26; y += 4) c.set(x + (y % 8 ? 2 : 0), y, cc[0]);
      c.shadedEllipse(38, 26, 3.2, 3, cc);
      for (let i = 0; i < 2; i++) stroke(c, [[39, 27], [42 + i, 33 + i * 2], [40 - i * 3, 42 + i * 2]], 3.4, 1.4, (t) => cc[cl(3 - t * 2 + i)]);
      gemAt(k, 24, 28.5, 1.8); break;
    }
    default: {
      const peak: Pt = shape === "cowl" ? [32, 2] : [24, 4];
      c.poly([peak, [36, 13], [40, 42], [31, 36], [17, 36], [8, 42], [12, 13]], lit(hd, 16, 13, 7, 0, 3));
      c.line(peak[0], peak[1] + 1, 14, 14, hd[3], 1);
      face(15, 33, 10, 34);
      if (shape === "mask") { c.poly([[15, 24], [33, 24], [31, 34], [17, 34]], lit(cc, 19, 26, 4, 1, 3)); c.line(17, 27, 31, 27, cc[0], 1); c.line(17, 30, 31, 30, cc[0], 1); }
      c.line(10, 39, 38, 39, cc[2], 2);
      if (shape === "cowl") for (let x = 10; x < 39; x += 3) c.line(x, 40, x + 1, 43, hd[1], 1);
      if (shape === "antlered") for (const s of [-1, 1]) { stroke(c, [[24 + s * 10, 12], [24 + s * 13, 6], [24 + s * 14, 1]], 3, 1, k.bone[3]); stroke(c, [[24 + s * 12, 8], [24 + s * 18, 5]], 2, 1, k.bone[3]); }
      if (shape === "beaked") { c.poly([[19, 20], [29, 20], [24, 40]], lit(k.bone, 21, 24, 5, 1, 4)); c.line(24, 20, 24, 38, k.bone[1], 1); c.poly([[24, 20], [24, 38], [27, 26]], k.bone[2]); }
    }
  }
  if (k.gem && shape !== "band") gemAt(k, 24, 38, 1.8);
  if (k.L.deco === "horns" && shape !== "pelt") for (const s of [-1, 1]) horn(c, 24 + s * 9, 13, s, 9, k.bone);
  if (k.L.deco === "spikes") for (const x of [14, 34]) c.poly([[x - 1.5, 13], [x + (x < 24 ? -5 : 5), 5], [x + 1.5, 13]], k.mat[3]);
  if (k.L.deco === "runes") for (let i = 0; i < 3; i++) rune(c, 17 + i * 7, 41, k.fx[3], i + k.h);
}
function clothHelm(k: K, shape: string) {
  const c = k.c, cc = k.cloth;
  switch (shape) {
    case "circlet": {
      for (let a = 0; a < TAU; a += 0.02) { const x = 24 + Math.cos(a) * 16, y = 28 + Math.sin(a) * 6.5; c.ellipse(x, y, 1.6, 1.6, k.trim[Math.sin(a) < 0 ? 1 : 3]); }
      for (let a = 0; a < TAU; a += 0.05) if (Math.sin(a) > 0) c.set(Math.round(24 + Math.cos(a) * 16), Math.round(29.5 + Math.sin(a) * 6.5), k.trim[4]);
      c.poly([[17, 31], [24, 16], [31, 31]], lit(k.trim, 21, 22, 3)); c.poly([[20, 30], [24, 21], [28, 30]], k.trim[1]);
      gemAt(k, 24, 26, 3); for (const s of [-1, 1]) { stroke(c, [[24 + s * 7, 33], [24 + s * 11, 28], [24 + s * 14, 30]], 1.6, 1, k.trim[3]); gemAt(k, 24 + s * 12, 33, 1.4); }
      break;
    }
    case "diadem": c.poly([[8, 30], [40, 30], [38, 36], [10, 36]], lit(k.trim, 14, 31, 5)); c.rect(10, 30, 28, 1, k.trim[4]); for (const [x, hh] of [[12, 6], [18, 11], [24, 20], [30, 11], [36, 6]]) { c.poly([[x - 2.6, 30], [x, 30 - hh], [x + 2.6, 30]], lit(k.trim, x - 1, 24, 3)); c.set(x, 30 - hh, WHITE); } gemAt(k, 24, 22, 3); gemAt(k, 17, 33, 1.5); gemAt(k, 31, 33, 1.5); break;
    case "mitre": c.poly([[11, 42], [11, 16], [22, 3], [24, 9], [26, 3], [37, 16], [37, 42]], lit(cc, 16, 14, 8, 1, 4)); c.rect(21, 9, 6, 33, k.trim[3]); c.rect(22, 9, 1, 33, k.trim[4]); c.rect(15, 20, 18, 5, k.trim[3]); c.rect(11, 37, 26, 5, k.trim[2]); gemAt(k, 24, 22.5, 2.2); for (const s of [-1, 1]) c.rect(24 + s * 9 - 1, 42, 3, 5, cc[1]); break;
    case "turban": for (let i = 0; i < 5; i++) c.shadedEllipse(24, 37 - i * 4.6, 15 - i * 2, 5, cc); c.shadedEllipse(24, 14, 6, 4.5, cc); for (let i = 0; i < 4; i++) c.line(11 + i * 2, 36 - i * 4, 37 - i * 2, 31 - i * 4, cc[1], 1); gemAt(k, 24, 27, 3); stroke(c, [[25, 24], [31, 10], [35, 3]], 3.4, 1, (t) => RP("white", "white")[cl(4 - t * 2)]); break;
    case "veil": c.poly([[24, 4], [37, 12], [41, 44], [7, 44], [11, 12]], lit(cc, 16, 12, 8, 0, 4)); c.poly([[14, 18], [34, 18], [35, 44], [13, 44]], withA(k.umb ? RP("black", "black")[1] : RP("white", "white")[3], 200)); for (let y = 20; y < 44; y += 3) c.line(14, y, 34, y + 1, withA(cc[0], 120), 1); c.rect(13, 16, 22, 3, k.trim[2]); for (const x of [16, 24, 32]) { c.line(x, 19, x, 24, k.trim[3], 1); c.shadedEllipse(x, 25, 1.2, 1.2, k.gem ?? k.trim); } if (k.umb) for (const x of [20, 28]) c.rect(x, 26, 2, 1, k.fx[3]); break;
    case "horncrown": c.poly([[10, 30], [38, 30], [36, 36], [12, 36]], lit(k.trim, 14, 31, 5)); for (const s of [-1, 1]) { horn(c, 24 + s * 6, 30, s, 16, k.bone); stroke(c, [[24 + s * 11, 30], [24 + s * 16, 22], [24 + s * 21, 18]], 2.4, 1, k.bone[3]); stroke(c, [[24 + s * 3, 30], [24 + s * 4, 21]], 2, 1, k.bone[2]); } gemAt(k, 24, 32.5, 2.4); break;
    case "cowl": c.poly([[24, 4], [37, 13], [41, 44], [7, 44], [11, 13]], lit(cc, 16, 12, 8, 0, 4)); c.ellipse(24, 26, 8, 10, VOIDC); c.line(12, 42, 36, 42, k.trim[2], 2); c.line(24, 5, 15, 14, cc[4], 1); for (const x of [20, 28]) c.rect(x, 24, 2, 1, k.umb ? k.fx[3] : withA(WHITE, 140)); break;
    case "moon": c.poly([[10, 30], [38, 30], [36, 37], [12, 37]], lit(k.trim, 14, 31, 5)); c.rect(10, 30, 28, 1, k.trim[4]); c.shadedEllipse(24, 17, 11, 11, k.trim); for (let y = 0; y < 28; y++) for (let x = 0; x < ICON; x++) if (Math.hypot(x + 0.5 - 28, y + 0.5 - 13) < 9.4) c.clear(x, y); gemAt(k, 24, 33.5, 2.4); break;
    case "thorns": c.poly([[9, 30], [39, 30], [37, 36], [11, 36]], lit(k.haft, 14, 31, 5)); for (let i = 0; i < 9; i++) { const x = 12 + i * 3, hh = i % 2 ? 9 : 14 - Math.abs(i - 4) * 1.2; c.poly([[x - 1.8, 31], [x, 31 - hh], [x + 1.8, 31]], lit(k.bone, x - 1, 24, 3, 1, 4)); } gemAt(k, 24, 33.5, 2); break;
    case "starred": { c.poly([[8, 30], [40, 30], [38, 36], [10, 36]], lit(k.trim, 14, 31, 5)); const pts: Pt[] = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 5 : 13; return [24 + Math.cos(a) * r, 17 + Math.sin(a) * r] as Pt; }); c.poly(pts, (x, y) => k.trim[cl(2.4 - (x - 24 + y - 17) / 9, 1, 4)]); gemAt(k, 24, 17, 2.8, k.stone); break; }
    default:
      c.ellipse(24, 37, 21, 6, cc[1]); c.ellipse(24, 36, 20, 4.6, cc[2]);
      c.poly([[22, 2], [33, 18], [37, 35], [11, 35], [16, 18]], lit(cc, 19, 16, 6, 1, 4)); c.poly([[22, 2], [33, 2], [36, 8], [26, 7]], cc[2]); c.shadedEllipse(36, 8, 2, 2, k.trim);
      c.rect(13, 29, 23, 5, k.trim[2]); c.rect(13, 29, 23, 1, k.trim[4]); gemAt(k, 24, 31.5, 2.4);
      for (const [x, y] of [[20, 14], [27, 20], [23, 24], [17, 22]]) sparkle(c, x, y, k.fx, 1);
  }
  if (k.L.deco === "horns" && shape !== "horncrown") for (const s of [-1, 1]) horn(c, 24 + s * 9, 22, s, 11, k.bone);
  if (k.L.deco === "wings") for (const s of [-1, 1]) wing(c, 24 + s * 13, 26, s, 10, k.trim);
}

// ---------------- доспехи ----------------
function pauldron(k: K, x: number, s: number, big: boolean, R = k.mat) {
  const c = k.c, r = big ? 8 : 6.5;
  c.shadedEllipse(x, 15, r, r * 0.8, R, undefined, true, 21);
  for (let i = 0; i < 2; i++) c.line(x - r + 1, 18 + i * 2.5, x + r - 1, 18 + i * 2.5, R[1], 1);
  c.rect(Math.round(x - r), 20, Math.round(r * 2), 1, k.trim[2]);
  if (k.L.deco === "spikes") for (const d of [-2.5, 2.5]) c.poly([[x + d - 1.4, 12], [x + d * 2 + s * 2, 3], [x + d + 1.4, 12]], R[4]);
  if (k.L.deco === "horns") horn(c, x, 13, s, 10, k.bone);
  if (k.L.deco === "wings") wing(c, x + s * 3, 12, s, 10, RP("silver", "silver"));
  if (k.L.deco === "skull") skull(k, x, 15, 1.1);
  if (k.L.deco === "filigree" || k.L.deco === "runes") c.ellipse(x, 15, 2, 1.6, k.L.deco === "runes" ? k.fx[3] : k.trim[3]);
}
function pattern(c: PC, fn: (x: number, y: number, p: RGBA) => RGBA | null, y0 = 0, y1 = ICON) {
  for (let y = y0; y < y1; y++) for (let x = 0; x < ICON; x++) { const p = c.get(x, y); if (!p || p[3] < 255) continue; const n = fn(x, y, p); if (n) c.set(x, y, n); }
}
const TORSO: Pt[] = [[13, 12], [35, 12], [37, 23], [34, 41], [14, 41], [11, 23]];
function plateArmor(k: K, shape: string) {
  const t = new PC(ICON, ICON), m = shape === "bone" ? k.bone : k.mat, c = k.c;
  t.poly(TORSO, lit(m, 18, 16, 6));
  if (shape === "scale") pattern(t, (x, y) => { const row = (y - 12) >> 1, cx = (x + (row % 2) * 2) % 4; return (y - 12) % 2 === 1 ? m[1] : cx === 0 ? m[3] : null; }, 12, 41);
  if (shape === "chain") pattern(t, (x, y, p) => ((x + y) % 2 ? mix(p, m[0], 0.5) : (x + y) % 4 === 0 ? mix(p, m[4], 0.4) : null), 12, 41);
  if (shape === "brigandine") { t.poly(TORSO, lit(k.cloth, 18, 16, 6, 1, 3)); pattern(t, (x, y) => (x % 4 === 1 && y % 4 === 0 ? k.trim[3] : null), 12, 41); }
  if (shape === "bone") { t.poly(TORSO, lit(RP("black", "black"), 18, 16, 6, 1, 3)); for (let i = 0; i < 5; i++) for (const s of [-1, 1]) stroke(t, [[24, 16 + i * 4.5], [24 + s * 6, 17 + i * 4.5], [24 + s * 10, 20 + i * 4.2]], 2.6, 1.4, k.bone[3 - (i % 2)]); t.rect(23, 14, 3, 26, k.bone[2]); for (let y = 15; y < 40; y += 3) t.set(24, y, k.bone[0]); }
  if (shape === "plate" || shape === "full" || shape === "tabard") { t.line(24, 13, 24, 30, m[4], 1); t.line(25, 13, 25, 30, m[1], 1); for (const y of [31, 34, 37]) { t.line(14, y, 34, y, m[1], 1); t.line(14, y + 1, 34, y + 1, m[3], 1); } }
  if (shape === "cuirass") { t.line(24, 14, 24, 28, m[4], 1); t.shadedEllipse(19, 21, 5, 6, m); t.shadedEllipse(29, 21, 5, 6, [m[0], m[1], m[2], m[2], m[3]]); }
  c.blit(t, 0, 0);
  c.poly([[19, 12], [24, 16], [29, 12]], DARK);
  if (shape === "cuirass") for (const x of [14, 19, 24, 29]) c.poly([[x, 37], [x + 5, 37], [x + 5, 45], [x, 44]], lit(m, x + 1, 38, 3, 1, 3));
  if (shape === "full") { c.shadedEllipse(24, 11, 7, 3.4, m); for (const s of [-1, 1]) c.poly([[24 + s * 1.5, 33], [24 + s * 11, 33], [24 + s * 11, 46], [24 + s * 1.5, 45]], lit(m, 24 + s * 6, 36, 4, 1, 3)); }
  if (shape === "tabard") { c.poly([[18, 16], [30, 16], [31, 47], [24, 44], [17, 47]], lit(k.cloth, 20, 20, 6, 1, 4)); c.rect(18, 16, 12, 1, k.trim[3]); c.line(17, 46, 24, 43, k.trim[3], 1); c.line(31, 46, 24, 43, k.trim[3], 1); emblem(k, 24, 27, 0.6); }
  c.rect(14, 30, 20, 3, k.hide[1]); c.rect(14, 30, 20, 1, k.hide[3]); c.shadedRect(22, 29, 4, 5, k.trim, 1);
  const big = shape === "plate" || shape === "full" || !!k.L.deco;
  pauldron(k, 11, -1, big, m); pauldron(k, 37, 1, big, m);
  if (k.gem) gemAt(k, 24, 22, 2.2);
  if (k.L.deco === "runes") for (const [i, [x, y]] of [[16, 20], [32, 20], [16, 26], [32, 26]].entries()) rune(c, x, y, k.fx[3], i + k.h);
  if (k.L.deco === "chains") for (let x = 13; x < 36; x += 2.5) c.ellipse(x, 19 + (x - 13) * 0.3, 1, 1, k.trim[3]);
}
function leatherArmor(k: K, shape: string) {
  const c = k.c, hd = k.hide, cc = k.cloth;
  if (shape === "cloak") {
    c.poly([[24, 5], [35, 9], [41, 45], [7, 45], [13, 9]], lit(cc, 16, 14, 9, 0, 4));
    c.poly([[19, 28], [29, 28], [31, 45], [17, 45]], lit(hd, 20, 30, 4, 1, 3));
    c.line(24, 14, 24, 45, cc[0], 1); for (let x = 8; x < 41; x += 3) c.line(x, 44, x + 1, 46, cc[1], 1);
    c.shadedEllipse(24, 9, 10, 4.6, cc); c.ellipse(24, 10, 5, 2, cc[0]);
    gemAt(k, 24, 14, 2.6); c.line(15, 13, 33, 13, k.trim[2], 1);
    return;
  }
  const sleeves = shape !== "vest" && shape !== "harness", long = shape === "coat";
  const body: Pt[] = sleeves ? [[14, 11], [34, 11], [39, 17], [39, 30], [34, 30], [34, long ? 46 : 41], [14, long ? 46 : 41], [14, 30], [9, 30], [9, 17]] : [[14, 11], [34, 11], [35, 18], [34, 41], [14, 41], [13, 18]];
  c.poly(body, lit(shape === "gambeson" ? cc : hd, 17, 15, 7, 0, 4));
  switch (shape) {
    case "gambeson": pattern(c, (x, y) => ((x + y) % 5 === 0 || (x - y + 100) % 5 === 0 ? cc[1] : null), 11, 42); c.rect(14, 11, 20, 3, cc[3]); break;
    case "vest": c.line(14, 13, 34, 33, hd[0], 3); c.line(34, 13, 14, 33, hd[0], 3); c.shadedRect(22, 21, 4, 4, k.trim, 1); for (const x of [16, 28]) c.shadedRect(x, 34, 5, 5, hd, 1); break;
    case "jacket": c.poly([[17, 11], [24, 19], [31, 11], [31, 9], [17, 9]], cc[2]); for (let y = 20; y < 38; y += 3) { c.line(22, y, 26, y + 1.5, cc[3], 1); c.line(26, y, 22, y + 1.5, cc[3], 1); } for (const x of [9, 35]) c.rect(x, 28, 4, 2, hd[0]); break;
    case "coat": c.line(24, 12, 24, 46, hd[0], 1); for (let y = 16; y < 40; y += 4) { c.shadedEllipse(21, y, 1, 1, k.trim); c.shadedEllipse(27, y, 1, 1, k.trim); } c.poly([[16, 11], [24, 17], [32, 11], [32, 7], [16, 7]], cc[2]); c.rect(16, 7, 16, 1, cc[4]); break;
    case "mantle": c.poly([[9, 12], [39, 12], [42, 23], [6, 23]], lit(cc, 14, 15, 6, 1, 4)); for (let x = 7; x < 42; x += 2) c.rect(x, 23, 1, 2 + (x % 4 ? 0 : 2), cc[1]); gemAt(k, 24, 14, 2); break;
    case "harness": for (const [a, b] of [[[14, 12], [34, 36]], [[34, 12], [14, 36]]] as Pt[][]) c.line(a[0], a[1], b[0], b[1], hd[0], 3); for (const [x, y] of [[19, 17], [29, 17], [24, 24], [19, 31], [29, 31]]) c.shadedRect(x - 1.5, y - 1.5, 3, 3, k.trim, 1); for (const x of [15, 20, 25, 30]) c.shadedRect(x, 34, 4, 6, hd, 1); c.rect(13, 33, 22, 2, hd[0]); break;
    case "pelt": for (const s of [-1, 1]) c.shadedEllipse(24 + s * 11, 14, 8, 6, RP(k.umb ? "black" : "whitefur", "white")); pattern(c, (x, y, p) => (y < 21 && (x * 7 + y * 5) % 4 === 0 ? mix(p, WHITE, 0.25) : null), 7, 21); c.poly([[19, 10], [29, 10], [27, 16], [21, 16]], RP(k.umb ? "black" : "grey", "grey")[2]); for (const x of [21, 26]) c.set(x, 12, k.fx[3]); break;
  }
  if (shape !== "mantle" && shape !== "pelt") { c.rect(14, 31, 20, 3, hd[0]); c.shadedRect(22, 30, 4, 5, k.trim, 1); }
  if (k.gem && shape !== "mantle") gemAt(k, 24, 32.5, 1.6);
  if (k.L.deco === "spikes") for (const x of [11, 37]) c.poly([[x - 1.5, 15], [x + (x < 24 ? -5 : 5), 8], [x + 1.5, 15]], k.mat[3]);
  if (k.L.deco === "skull") skull(k, 24, 23, 1.1);
  if (k.L.deco === "runes") for (let i = 0; i < 2; i++) rune(c, 18 + i * 12, 24, k.fx[3], i + k.h);
}
function clothArmor(k: K, shape: string) {
  const c = k.c, cc = shape === "shroud" ? RP("shroud", "grey") : k.cloth, tr = k.trim;
  if (shape === "hooded") c.poly([[15, 3], [33, 3], [36, 12], [12, 12]], lit(cc, 18, 6, 4, 0, 3));
  const robe: Pt[] = [[16, 7], [32, 7], [41, 21], [37, 24], [35, 19], [38, 46], [10, 46], [13, 19], [11, 24], [7, 21]];
  c.poly(robe, lit(cc, 17, 13, 9, 0, 4));
  c.poly([[19, 7], [24, 13], [29, 7], [24, 20]], tr[2]);
  switch (shape) {
    case "plain": c.rect(13, 27, 22, 2, k.hide[2]); stroke(c, [[20, 29], [19, 33], [20, 38]], 1.6, 1, k.hide[3]); break;
    case "cassock": c.line(24, 13, 24, 46, cc[0], 1); for (let y = 15; y < 44; y += 3) c.shadedEllipse(25.5, y, 0.9, 0.9, tr); c.rect(12, 27, 24, 3, cc[0]); break;
    case "vestment": for (const x of [17, 28]) { c.rect(x, 11, 4, 35, tr[2]); c.rect(x, 11, 1, 35, tr[4]); for (let y = 14; y < 44; y += 5) rune(c, x + 2, y, tr[0], y); } gemAt(k, 24, 27, 2); break;
    case "wrap": c.poly([[12, 9], [19, 7], [39, 39], [33, 46]], lit(RP(k.umb ? "black" : "white", "white"), 20, 15, 7, 1, 4)); c.line(13, 9, 36, 44, tr[3], 1); break;
    case "shroud": for (let x = 10; x < 38; x += 3) c.poly([[x, 44], [x + 3, 44], [x + 1.5, 47 + (x % 2)]], cc[1]); for (let x = 11; x < 38; x += 4) for (let y = 30; y < 46; y += 5) c.set(x + (y % 3), y, cc[0]); for (const s of [-1, 1]) stroke(c, [[24 + s * 8, 14], [24 + s * 10, 30], [24 + s * 12, 44]], 1, 1, cc[1]); c.rect(13, 26, 22, 2, RP("bone", "bone")[2]); if (k.umb) skull(k, 24, 30, 1); break;
    case "battle": for (const s of [-1, 1]) { c.shadedEllipse(24 + s * 13, 15, 6, 4.8, k.mat, undefined, true, 20); c.rect(24 + s * 13 - 6, 18, 12, 1, tr[2]); } c.rect(13, 27, 22, 4, k.hide[1]); c.shadedRect(22, 26, 4, 6, tr, 1); c.poly([[17, 31], [31, 31], [29, 46], [19, 46]], lit(RP(k.umb ? "black" : "white", "white"), 20, 33, 5, 1, 4)); break;
    default: c.rect(12, 27, 24, 3, tr[2]); c.rect(12, 27, 24, 1, tr[4]); c.rect(22, 30, 4, 15, tr[3]); gemAt(k, 24, 28.5, 2.2); c.rect(10, 43, 28, 3, tr[2]); for (let x = 12; x < 37; x += 4) c.set(x, 44, tr[4]);
  }
  if (k.L.deco === "runes" || k.L.deco === "halo") for (const [i, [x, y]] of [[15, 36], [33, 36], [24, 40], [14, 18], [34, 18]].entries()) rune(c, x, y, k.fx[3], i + k.h);
  if (k.L.deco === "skull" && shape !== "shroud") skull(k, 24, 20, 1.1);
  if (k.L.deco === "chains") for (let x = 12; x < 37; x += 2.4) c.ellipse(x, 30 + Math.sin(x / 3), 1, 1, tr[3]);
  if (k.L.deco === "spikes" || k.L.deco === "horns") for (const s of [-1, 1]) stroke(c, [[24 + s * 12, 13], [24 + s * 16, 5]], 2.4, 1, k.bone[3]);
  if (k.L.deco === "wings") for (const s of [-1, 1]) wing(c, 24 + s * 13, 13, s, 10, RP("silver", "silver"));
  if (k.L.deco === "filigree") for (let y = 12; y < 44; y += 2) { c.set(14 + Math.floor((y - 12) / 9), y, tr[3]); c.set(34 - Math.floor((y - 12) / 9), y, tr[3]); }
}

// ---------------- обувь ----------------
function boots(k: K, shape: string) {
  const c = k.c, kind = k.cat;
  for (const [x, d] of [[9, 0], [25, 2]] as Pt[]) {
    const R = kind === "plate_boots" ? k.mat : kind === "leather_boots" ? k.hide : k.cloth;
    const top = shape === "high" || shape === "greave" || shape === "cuff" || shape === "silk" || shape === "winged" ? 5 : shape === "slipper" || shape === "moccasin" || shape === "shoe" || shape === "curled" ? 21 : 12;
    if (shape === "sandal") {
      c.poly([[x, 21 + d], [x + 9, 21 + d], [x + 9, 32 + d], [x + 15, 36 + d], [x + 15, 39 + d], [x, 39 + d]], lit(RP("bone", "bone"), x + 3, 26 + d, 5, 1, 3));
      c.shadedRect(x - 1, 39 + d, 17, 3, k.hide, 1);
      for (let y = 22; y < 38; y += 4) { c.line(x, y + d, x + 9, y + 3 + d, k.hide[1], 2); c.line(x + 9, y + d, x, y + 3 + d, k.hide[2], 1); }
      c.rect(x, 21 + d, 9, 2, k.trim[2]);
      continue;
    }
    c.shadedRect(x, top + d, 10, 40 - top - 9, R, 1);
    const toe: Pt[] = shape === "sabaton" || shape === "curled" ? [[x, 30 + d], [x + 10, 30 + d], [x + 17, 36 + d], [x + 10, 41 + d], [x, 41 + d]] : shape === "slipper" ? [[x, 30 + d], [x + 9, 30 + d], [x + 14, 34 + d], [x + 17, 30 + d], [x + 16, 39 + d], [x, 39 + d]] : [[x, 30 + d], [x + 10, 30 + d], [x + 15, 35 + d], [x + 15, 41 + d], [x, 41 + d]];
    c.poly(toe, lit(R, x + 3, 31 + d, 4, 1, 4));
    c.rect(x, 40 + d, shape === "sabaton" ? 13 : 15, 2, R[0]);
    if (kind === "plate_boots") { for (let y = top + 4; y < 30; y += 4) { c.rect(x, y + d, 10, 1, R[1]); c.rect(x, y + 1 + d, 10, 1, R[3]); } for (let i = 0; i < 3; i++) c.line(x + 10 + i * 1.6, 31 + i * 2 + d, x + 11 + i * 1.6, 38 + d, R[1], 1); if (shape === "greave" || shape === "boot" || shape === "winged") c.shadedEllipse(x + 5, top + 3 + d, 4.6, 3.4, R); c.rect(x, top + d, 10, 1, k.trim[3]); }
    if (shape === "spiked") for (const y of [16, 22]) c.poly([[x + 9, y + d], [x + 14, y - 2 + d], [x + 9, y + 2 + d]], R[4]);
    if (shape === "winged") wing(c, x + 1, top + 6 + d, 1, 8, RP("silver", "silver"));
    if (shape === "fur" || shape === "cuff") c.shadedRect(x - 2, top + d, 14, 6, shape === "fur" ? RP("whitefur", "white") : R, 2);
    if (shape === "moccasin") for (let i = 0; i < 5; i++) c.line(x + 1 + i * 2, top + d, x + 1 + i * 2, top + 3 + d + (i % 2), k.cloth[3], 1);
    if (shape === "high" || shape === "wrapped") for (const y of shape === "high" ? [12, 19, 26] : [10, 14, 18, 22, 26]) { c.line(x, y + d, x + 10, y + 2 + d, R[0], shape === "high" ? 2 : 1); if (shape === "high") c.shadedRect(x + 6, y - 1 + d, 3, 3, k.trim, 1); }
    if (shape === "wrap") for (let y = top + 1; y < 37; y += 3) c.line(x, y + d, x + 10, y + 2 + d, R[1], 1);
    if (shape === "curled") c.shadedEllipse(x + 17, 34 + d, 1.4, 1.4, k.trim);
    if (shape === "silk") for (let y = top + 3; y < 30; y += 5) c.line(x + 2, y + d, x + 8, y + d, k.trim[3], 1);
    if (kind === "cloth_boots") c.rect(x, top + d, 10, 2, k.trim[2]);
    if (k.gem) gemAt(k, x + 5, top + 6 + d, 1.3);
    if (k.L.deco === "wings" && shape !== "winged") wing(c, x, top + 6 + d, 1, 7, RP("silver", "silver"));
    if ((k.L.deco === "spikes" || k.L.deco === "horns") && shape !== "spiked") c.poly([[x + 9, top + 8 + d], [x + 14, top + 3 + d], [x + 9, top + 11 + d]], k.mat[4]);
    if (k.L.deco === "runes") rune(c, x + 5, top + 12 + d, k.fx[3], x + k.h);
  }
}

// ---------------- бижутерия ----------------
/** Камень с огранкой и оправой (look.stone / look.setting легендарок); мелкие камни и обычные модели — прежний gemAt. */
function jem(k: K, x: number, y: number, r: number, g: Ramp | null = k.gem) {
  if (r < 2.2 || (!k.stoneKind && !k.setting)) return gemAt(k, x, y, r, g);
  const c = k.c, t = k.trim, G = g ?? k.stone, gr = RP("green", "green"), at = (a: number, d: number): Pt => [x + Math.cos(a) * d, y + Math.sin(a) * d];
  switch (k.setting) {
    case "claws": for (const a of [0.78, 2.36, 3.93, 5.5]) stroke(c, [at(a, r + 1.6), at(a, r * 0.4)], 2.6, 1.4, t[3]); break;
    case "thorns": for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; c.poly([at(a - 0.22, r + 0.6), at(a, r + 4.2), at(a + 0.22, r + 0.6)], k.bone[i % 2 ? 3 : 2]); } break;
    case "wings": for (const s of [-1, 1]) wing(c, x + s * (r + 0.4), y + 1, s, r * 2.6 + 3, t); break;
    case "halo": for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; c.ellipse(x + Math.cos(a) * (r + 2.6), y + Math.sin(a) * (r + 2.6) * 0.9, 0.9, 0.9, t[i % 2 ? 3 : 4]); } break;
    case "leaves": for (const s of [-1, 1]) { stroke(c, [[x + s * r * 0.4, y - r * 0.4], [x + s * (r + 3), y - r - 1], [x + s * (r + 5), y - r - 4]], 3.2, 1, (q) => gr[cl(3.4 - q * 2)]); stroke(c, [[x + s * r * 0.4, y + r * 0.6], [x + s * (r + 3), y + r + 1], [x + s * (r + 5), y + r + 3]], 2.6, 1, (q) => gr[cl(3 - q * 2)]); } break;
    case "crown": for (let i = 0; i < 5; i++) { const px = x + (i - 2) * (r * 0.75); c.poly([[px - 1.2, y - r * 0.6], [px, y - r - 3.6 - (i === 2 ? 2 : 0)], [px + 1.2, y - r * 0.6]], t[i % 2 ? 3 : 4]); } break;
  }
  const hi = () => { if (k.rar >= 1) c.set(Math.round(x - r * 0.45), Math.round(y - r * 0.55), WHITE); };
  switch (k.stoneKind) {
    case "cut": c.poly([[x, y - r * 1.4], [x + r * 1.15, y], [x, y + r * 1.4], [x - r * 1.15, y]], (px) => G[cl(2.8 - ((px - x) / r) * 1.4, 1, 4)]); c.line(x - r * 1.1, y, x + r * 1.1, y, G[4], 1); hi(); break;
    case "drop": c.poly([[x, y - r * 1.6], [x + r * 0.9, y - r * 0.2], [x + r, y + r * 0.5], [x, y + r * 1.2], [x - r, y + r * 0.5], [x - r * 0.9, y - r * 0.2]], lit(G, x - r * 0.4, y - r * 0.6, r * 1.6, 1, 4)); hi(); break;
    case "shard": c.poly([[x, y - r * 1.8], [x + r * 0.85, y - r * 0.6], [x + r * 0.85, y + r], [x, y + r * 1.5], [x - r * 0.85, y + r], [x - r * 0.85, y - r * 0.6]], (px) => G[cl(2.8 - ((px - x) / r) * 1.6, 1, 4)]); c.line(x, y - r * 1.8, x, y + r * 1.5, G[4], 1); hi(); break;
    case "eye": c.poly([[x - r * 1.5, y], [x, y - r * 0.95], [x + r * 1.5, y], [x, y + r * 0.95]], lit(k.bone, x - r * 0.5, y - r * 0.5, r * 2, 1, 4)); c.ellipse(x, y, r * 0.62, r * 0.62, G[2]); c.ellipse(x, y, 0.6, r * 0.55, VOIDC); hi(); break;
    case "square": c.shadedRect(x - r, y - r * 0.85, r * 2, r * 1.7, G, 1); c.rect(x - r + 1, y - r * 0.85 + 1, r * 2 - 2, 1, G[4]); hi(); break;
    case "star": c.poly(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * TAU - Math.PI / 2, d = i % 2 ? r * 0.5 : r * 1.7; return [x + Math.cos(a) * d, y + Math.sin(a) * d] as Pt; }), lit(G, x - r * 0.5, y - r * 0.5, r * 1.8, 1, 4)); hi(); break;
    default: c.ellipse(x, y, r + 0.9, r + 0.9, t[1]); c.shadedEllipse(x, y, r, r, G); hi();
  }
}
function ring(k: K, shape: string) {
  const c = k.c, band2 = shape === "twist" ? k.trim : k.mat;
  const hole = (r: number, cx = 24, cy = 29) => { for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) if (Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy) / (r * 0.72)) < 1) c.clear(x, y); };
  if (shape === "double") {
    const a = new PC(ICON, ICON); a.shadedEllipse(19, 29, 11, 9, k.mat); for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) if (Math.hypot((x + 0.5 - 19) / 7, (y + 0.5 - 29) / 5.4) < 1) a.clear(x, y);
    c.shadedEllipse(29, 29, 11, 9, k.trim); hole(7, 29, 29); c.blit(a, 0, 0);
    jem(k, 24, 18, 2.8); return;
  }
  if (shape === "serpent") {
    for (let a = 0; a < TAU; a += 0.02) { const x = 24 + Math.cos(a) * 11, y = 30 + Math.sin(a) * 8.5, w = 2.4 - (a / TAU) * 1.3; c.ellipse(x, y, w, w, (Math.floor(a * 6) % 2 ? k.mat : k.trim)[Math.sin(a) < 0 ? 3 : 2]); }
    hole(8.2, 24, 30);
    c.shadedEllipse(33, 22, 4.4, 3.4, k.mat); for (const x of [31, 34]) c.set(x, 21, k.stone[3]); c.line(37, 23, 40, 21, RP("red", "red")[3], 1);
    return;
  }
  c.shadedEllipse(24, 29, 13, 10.5, band2); c.ellipse(24, 26.5, 12, 7, band2[3]); hole(8.6);
  c.line(14, 29, 15, 35, band2[4], 1);
  if (shape === "twist") for (let a = 0; a < 18; a++) { const an = (a / 18) * TAU; c.ellipse(24 + Math.cos(an) * 10.8, 29 + Math.sin(an) * 8.6, 1, 1, a % 2 ? k.mat[3] : k.mat[1]); }
  switch (shape) {
    case "signet": c.shadedRect(16, 9, 16, 11, k.mat, 3); c.rect(18, 11, 12, 7, k.mat[1]); jem(k, 24, 14.5, 3.4); break;
    case "claw": for (const dx of [-5, -2, 2, 5]) c.line(24 + dx, 19, 24 + dx * 0.55, 8, k.trim[3], 1); jem(k, 24, 12, 5.2); break;
    case "skull": skull(k, 24, 14, 2.1); break;
    case "crown": c.shadedRect(16, 14, 16, 5, k.trim, 1); for (const x of [16, 21, 26, 31]) c.poly([[x, 14], [x + 1.5, 7], [x + 3, 14]], k.trim[3]); jem(k, 24, 12.5, 3.2); break;
    case "band": for (const x of [16, 24, 32]) jem(k, x, x === 24 ? 18 : 20, x === 24 ? 2.4 : 1.7, k.stone); break;
    default: jem(k, 24, 15, 4.4);
  }
}
function amulet(k: K, shape: string) {
  const c = k.c;
  if (shape === "beads") for (let t = 0; t <= 1.0001; t += 0.07) { const x = 9 + t * 30, y = 6 + Math.sin(t * Math.PI) * 21; c.shadedEllipse(x, y, 2.2, 2.2, Math.round(t * 14) % 2 ? k.bone : k.trim); }
  else for (let t = 0; t <= 1; t += 0.012) c.set(Math.round(10 + t * 28), Math.round(6 + Math.sin(t * Math.PI) * 17), k.trim[(t * 80) % 2 < 1 ? 3 : 1]);
  const G = k.stone, cy = 33;
  switch (shape) {
    case "fang": stroke(c, [[24, 23], [26.5, 31], [25, 40], [21.5, 45]], 5.4, 1, (t) => k.bone[cl(3.4 - t * 2)]); c.shadedEllipse(24, 23, 3, 3, G); break;
    case "skull": skull(k, 24, cy, 2.5); break;
    case "beads": c.shadedEllipse(24, cy - 3, 5.6, 5.6, G); c.set(22, cy - 5, WHITE); break;
    case "disc": c.shadedEllipse(24, cy, 9.6, 9.6, k.mat); c.ellipse(24, cy, 7, 7, k.mat[1]); for (let a = 0; a < 8; a++) { const an = (a / 8) * TAU; rune(c, Math.round(24 + Math.cos(an) * 4.6), Math.round(cy + Math.sin(an) * 4.6), k.trim[4], a); } jem(k, 24, cy, k.stoneKind || k.setting ? 3 : 2.2); break;
    case "crescent": c.shadedEllipse(24, cy, 10, 10, k.mat); for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) if (Math.hypot(x + 0.5 - 4, y + 0.5 + 2.6) < 7.6) c.clear(24 + x, cy + y); jem(k, 27, cy - 2, 2.2); sparkle(c, 30, cy - 9, G, 1); break;
    case "drop": c.poly([[24, 21], [31, 33], [29, 41], [19, 41], [17, 33]], lit(G, 20, 28, 4, 1, 4)); c.shadedRect(21, 19, 6, 3, k.trim, 1); c.set(21, 30, WHITE); c.set(21, 31, withA(WHITE, 150)); break;
    case "eye": c.poly([[12, cy], [24, cy - 8], [36, cy], [24, cy + 8]], lit(k.mat, 18, cy - 3, 5)); c.shadedEllipse(24, cy, 5, 5, G); c.ellipse(24, cy, 1.4, 3.4, VOIDC); c.set(22, cy - 2, WHITE); break;
    case "locket": c.shadedEllipse(24, cy, 8, 10, k.mat); c.ellipse(24, cy, 5.8, 7.6, k.mat[1]); c.shadedEllipse(24, cy, 4.4, 6, k.mat); c.shadedRect(22, 21, 4, 3, k.trim, 1); for (let a = 0; a < 10; a++) { const an = (a / 10) * TAU; c.set(Math.round(24 + Math.cos(an) * 7), Math.round(cy + Math.sin(an) * 9), k.trim[4]); } if (k.stoneKind || k.setting) jem(k, 24, cy, 3.4, k.stone); break;
    case "sun": for (let a = 0; a < 16; a++) { const an = (a / 16) * TAU; c.poly([[24 + Math.cos(an - 0.14) * 5, cy + Math.sin(an - 0.14) * 5], [24 + Math.cos(an) * (a % 2 ? 9 : 12), cy + Math.sin(an) * (a % 2 ? 9 : 12)], [24 + Math.cos(an + 0.14) * 5, cy + Math.sin(an + 0.14) * 5]], k.trim[a % 2 ? 3 : 4]); } c.shadedEllipse(24, cy, 5.6, 5.6, k.trim); jem(k, 24, cy, 3); break;
    case "holy": for (let a = 0; a < TAU; a += 0.03) c.set(Math.round(24 + Math.cos(a) * 7), Math.round(cy - 3 + Math.sin(a) * 7), k.trim[2]); c.rect(22, cy - 11, 4, 22, k.trim[3]); c.rect(16, cy - 5, 16, 4, k.trim[3]); c.rect(22, cy - 11, 1, 22, k.trim[4]); jem(k, 24, cy - 3, 2.2); break;
    case "rune": c.poly([[17, 25], [31, 24], [33, 38], [24, 43], [15, 38]], lit(RP("grey", "grey"), 20, 28, 5, 1, 4)); for (let i = 0; i < 3; i++) rune(c, 20 + i * 4, 31 + (i % 2) * 4, k.fx[3], i + k.h); c.shadedRect(21, 21, 6, 3, k.trim, 1); break;
    default: c.shadedEllipse(24, cy, 9.6, 10.4, k.trim); if (k.stoneKind || k.setting) jem(k, 24, cy, 4.4, G); else c.shadedEllipse(24, cy, 5.6, 6.2, G); c.set(21, cy - 3, WHITE); for (const [x, y] of [[24, cy - 10], [14, cy], [34, cy], [24, cy + 10]]) jem(k, x, y, 1.2);
  }
  if (k.L.deco === "wings") for (const s of [-1, 1]) wing(c, 24 + s * 8, cy - 2, s, 9, k.trim);
  if (k.L.deco === "horns" && shape !== "fang") for (const s of [-1, 1]) horn(c, 24 + s * 6, cy - 6, s, 7, k.bone);
  if (k.L.deco === "chains") for (const s of [-1, 1]) for (let i = 0; i < 4; i++) c.ellipse(24 + s * (6 + i), cy + 6 + i * 2, 0.9, 0.9, k.trim[3]);
}

/** Плащ: ткань модели (look.cloth), кайма и застёжка по редкости; архетипы: long, crest, fur, short, wings, feather, hood, shroud. */
function cloak(k: K, shape: string) {
  const c = k.c, cc = shape === "shroud" ? RP("shroud", "grey") : k.cloth, tr = k.trim;
  const bot = shape === "short" ? 34 : 46;
  if (shape === "wings") {
    for (const s of [-1, 1]) { wing(c, 24 + s * 5, 12, s, 19, cc); wing(c, 24 + s * 5, 20, s, 14, [cc[0], cc[1], cc[1], cc[2], cc[3]]); }
    c.poly([[17, 9], [31, 9], [29, 40], [19, 40]], lit(cc, 20, 12, 7, 0, 4));
  } else {
    const hem = shape === "shroud" ? 0 : 1;
    c.poly([[17, 6], [31, 6], [38, 14], [bot < 40 ? 38 : 41, bot], [7, bot], [10, 14]], lit(cc, 17, 12, 9, 0, 4));
    c.line(24, 12, 24, bot, cc[0], 1);
    for (const x of [15, 19, 29, 33]) c.line(x, 18, x - (x < 24 ? 2 : -2), bot, cc[1], 1);
    if (hem) c.rect(bot < 40 ? 11 : 8, bot - 1, bot < 40 ? 27 : 33, 1, tr[3]);
    if (shape === "shroud") { for (let x = 8; x < 41; x += 3) c.line(x, bot - 1, x + 1, bot + 1 + (x % 2), cc[1], 1); for (const [x, y] of [[16, 28], [30, 34], [22, 40]]) c.rect(x, y, 2, 3, DARK); }
  }
  if (shape === "ragged") { for (let x = 8; x < 42; x += 3) { const d = 2 + ((x * 7) % 5) * 1.6; for (let y = Math.round(bot - d); y <= bot + 1; y++) for (let w = 0; w < 2; w++) c.clear(x + w, y); } for (const x of [16, 28]) c.line(x, 26, x + 3, 34, DARK, 1); }
  if (shape === "smoke") for (let y = 24; y < ICON; y++) for (let x = 0; x < ICON; x++) { const i = (y * ICON + x) * 4 + 3, f = Math.max(0, 1 - (y - 24) / 24); c.data[i] = Math.round(c.data[i] * (f + (((x * 5 + y * 3) % 7) / 7 - 0.5) * 0.4)); }
  if (shape === "fur") { c.shadedEllipse(24, 9, 14, 5.4, RP("whitefur", "white")); for (let x = 9; x < 40; x += 2) c.set(x, 13 + (x % 4 ? 0 : 1), RP("whitefur", "white")[3]); c.rect(9, 44, 31, 2, RP("whitefur", "white")[3]); }
  if (shape === "hood") { c.poly([[16, 3], [32, 3], [35, 13], [13, 13]], lit(cc, 18, 6, 4, 0, 3)); c.ellipse(24, 9, 5.5, 3.5, DARK); c.line(14, 13, 34, 13, tr[2], 1); }
  if (shape === "crest") { c.poly([[17, 24], [31, 24], [31, 34], [24, 41], [17, 34]], lit(tr, 20, 26, 5, 1, 4)); c.poly([[20, 27], [28, 27], [28, 33], [24, 37], [20, 33]], k.umb ? DARK : cc[2]); if (k.umb) skull(k, 24, 30, 0.7); else { c.rect(23, 27, 2, 8, tr[4]); c.rect(21, 29, 6, 2, tr[4]); } }
  if (shape === "feather") for (let i = 0; i < 7; i++) { const x = 11 + i * 4.4, y = 24 + (i % 2) * 5; stroke(c, [[x, y], [x + (i < 3 ? -1 : 1), y + 8], [x + (i < 3 ? -2 : 2), y + 15]], 3.2, 1, (t) => cc[cl(3 - t * 2, 1, 4)]); c.line(Math.round(x), y, Math.round(x + (i < 3 ? -2 : 2)), y + 15, tr[2], 1); }
  if (shape !== "shroud" && shape !== "wings") c.line(14, 12, 34, 12, tr[2], 1);
  c.shadedEllipse(24, 11, 2.6, 2.6, tr);
  if (k.gem) gemAt(k, 24, 11, 1.8); else c.set(24, 11, k.stone[3]);
  if (k.L.deco === "runes") for (let i = 0; i < 2; i++) rune(c, 17 + i * 14, 40, k.fx[3], i + k.h);
}

// ---------------- сборка ----------------
const NEUTRAL_TRIM = new Set(["gold", "bronze", "silver", "iron", "steel", "bone", "obsidian", "divine"]);
const rarRamp = (r: number): Ramp => { const c = hex(RARITY_COLORS[r]); return [mix(c, DARK, 0.65), mix(c, DARK, 0.38), c, mix(c, WHITE, 0.45), WHITE]; };
/** Тусклый камень r0: только тона 1–2 своей палитры. */
const dull = (g: Ramp): Ramp => [g[0], g[1], g[1], g[2], g[2]];
const DRAW: Record<string, (k: K, shape: string) => void> = {
  sword: (k, s) => sword(k, s), greatsword: (k, s) => sword(k, s, 1), twinblades: twin, dagger: daggers,
  axe: (k, s) => axe(k, s, false), greataxe: (k, s) => axe(k, s, true), mace, hammer,
  spear, scythe, bow, crossbow, staff, scepter, orb, tome, shield,
  plate_helm: plateHelm, leather_helm: leatherHelm, cloth_helm: clothHelm,
  plate_armor: plateArmor, leather_armor: leatherArmor, cloth_armor: clothArmor,
  plate_boots: boots, leather_boots: boots, cloth_boots: boots, cloak, ring, amulet,
};
export const MODEL_CATS = Object.keys(DRAW);

function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; }

/** over — замена палитр (легендарки: камень, руны, ткань и металл в цветах темы). */
export function drawModel(cat: string, L: ModelLook, fac: string, seed: number, rar = 0, over: Partial<Pick<K, "gem" | "stone" | "fx" | "cloth" | "mat" | "trim" | "hide" | "crestKind" | "stoneKind" | "setting">> = {}): PC {
  const c = new PC(ICON, ICON), umb = fac === "umbrath", sol = fac === "solgard";
  // кайма: у r0 только нейтральный металл, у r≥1 светлые тона каймы — цвет редкости; камень: r0 тусклый, r≥1 цвет редкости
  const trimBase = RP(rar === 0 && !NEUTRAL_TRIM.has(L.trim) ? "obsidian" : L.trim, "bronze");
  const R = rar >= 1 ? rarRamp(rar) : null;
  const trim: Ramp = R ? [trimBase[0], trimBase[1], trimBase[2], mix(trimBase[3], R[3], 0.7), mix(trimBase[4], R[2], 0.5)] : trimBase;
  const stoneSrc = RP(L.gem ?? L.fx, umb ? "fel" : sol ? "sun" : "diamond");
  const k: K = {
    c, L, cat, fac, h: seed, umb, sol, rich: L.rich ?? 0, rar,
    mat: RP(L.mat, "iron"), trim, gem: L.gem ? (R ?? dull(RP(L.gem, "ruby"))) : null, stone: R ?? dull(stoneSrc), haft: RP(L.haft, "wood"),
    cloth: RP(L.cloth, umb ? "shroud" : sol ? "azure" : "brown"), hide: RP(L.hide, umb ? "blackleather" : "leather"), fx: RP(L.fx ?? L.gem, umb ? "fel" : sol ? "sun" : "diamond"),
    grip: RP((L.rich ?? 0) >= 2 ? trimBase === RP("obsidian", "obsidian") ? "blackleather" : L.trim : umb ? "blackleather" : "leather", "leather"), bone: RP("bone", "bone"),
  };
  Object.assign(k, over);
  (DRAW[cat] ?? DRAW.sword)(k, L.shape);
  c.outline();
  return c;
}

export const buildModelIcon = (m: ItemModel, rar = 0): PC => drawModel(m.cat, m.look, m.fac, hashStr(m.id), rar);

/** Вид базы без модели (выдача админом по базе): по редкости — железо, сталь с золотом, серебро с камнем. */
export const BASE_SHAPE: Record<string, string> = {
  greatsword: "claymore", twinblades: "twin", greataxe: "moon", hammer: "hammer", spear: "leaf", scythe: "scythe", crossbow: "light",
  orb: "orb", tome: "book", plate_helm: "open", leather_helm: "hood", cloth_helm: "wizard", plate_armor: "plate", leather_armor: "jacket",
  cloth_armor: "robe", cloak: "long", plate_boots: "boot", leather_boots: "high", cloth_boots: "shoe",
};
export function buildBaseIcons(): Record<string, PC> {
  const out: Record<string, PC> = {};
  for (const [id, shape] of Object.entries(BASE_SHAPE)) {
    const b = BASE_ITEMS[id];
    if (!b) continue;
    for (const r of [0, 1, 2]) {
      const L: ModelLook = r === 0 ? { shape, mat: "iron", trim: "bronze", haft: "wood", cloth: "brown", hide: "leather" }
        : r === 1 ? { shape, mat: "steel", trim: "gold", haft: "wood", cloth: "azure", hide: "leather", gem: "sapphire" }
        : { shape, mat: "silver", trim: "gold", haft: "yew", cloth: "purple", hide: "darkleather", gem: "diamond", rich: 1 };
      out[`${b.icon}_${r}`] = drawModel(id, L, "", 7 + r, r);
    }
  }
  return out;
}
export function buildAllModelIcons(): Record<string, PC> {
  const out: Record<string, PC> = {};
  for (const m of Object.values(ITEM_MODELS)) for (const r of [0, 1, 2]) out[`im_${m.id}_${r}`] = buildModelIcon(m, r);
  return out;
}
