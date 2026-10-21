/** Мотивы иконок умений для tools/gen/icons-frosty.ts (задача 127).
 *  Каждая иконка — ОДИН главный знак (силуэт game-icons.net, CC BY 3.0, автор — в data/skill-icons.json и CREDITS.md) по смыслу умения
 *  плюс по желанию маленький знак-уточнение `mod` (капли, звёзды оглушения, стрелка вверх/вниз, череп и т. д.) в углу.
 *  Рисуется приёмами frosty, без сглаживания:
 *  - тело — тона темы по свету сверху-слева: светлая кромка на освещённой стороне, тёмная на теневой, середина, ядро, 1–5 бликов почти белого;
 *  - тёмная подкладка в 1 px вокруг тела, дальше свечение двумя ступенями рваными пятнами (шум пятнами, не градиент), пятна фона темы;
 *  - эффект композиции (искры, полосы, дуга) — второстепенный, включается полем fx.
 *  Каждый пиксель — цвет из 44 цветов frosty (RAMPS), без полупрозрачности. */
import { PC, hash01, pnoise, type RGBA } from "./canvas";
import { ELEMENT_RAMPS as RAMPS, frameIcon, sdPoly, sdSeg, type SD, type Element as Theme } from "./icons-frosty";
import { shapeOf } from "./icons-svg";

export type Fx = "sparks" | "streaks" | "arc" | "rays" | "drops" | "shards" | "none";
export interface IconEntry {
  src: "gen";
  motif: "silhouette";
  theme: Theme;
  /** Главный знак: id силуэта game-icons (папка автора/имя). */
  shape: string;
  author?: string;
  /** Знак-уточнение: id силуэта game-icons или встроенный (up, down, plus, drops). */
  mod?: string;
  modAuthor?: string;
  modTheme?: Theme;
  /** Угол плашки для знака: tr (по умолчанию), tl, br, bl. */
  modAt?: "tr" | "tl" | "br" | "bl";
  /** Потолок яркости тела (0…1): у «кровавых» умений тона остаются красными, без оранжевого и жёлтого. */
  cap?: number;
  size?: number; rot?: number; flipX?: boolean; cx?: number; cy?: number; fx?: Fx; seed?: number;
}
/** Силуэты, названные в таблице (для `icons-svg.ts fetch`). */
export const SHAPE_IDS: string[] = [];

const BUILTIN_MODS = new Set(["up", "down", "plus", "drops"]);
const DIAG = /sword|dagger|axe|arrow|slash|claw|hammer|fang|spinning|sacrificial|knife|boot|run|wingfoot|comet|droplet|bolt|syringe|scythe|tomahawk|spear/;
const strHash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

function builtin(name: string, x: number, y: number, s: number): SD {
  const P = (pts: [number, number][]) => sdPoly(pts.map(([a, b]) => [x + a * s, y + b * s] as [number, number]));
  if (name === "up") return P([[0, -1], [0.85, 0], [0.35, 0], [0.35, 1], [-0.35, 1], [-0.35, 0], [-0.85, 0]]);
  if (name === "down") return P([[0, 1], [0.85, 0], [0.35, 0], [0.35, -1], [-0.35, -1], [-0.35, 0], [-0.85, 0]]);
  if (name === "plus") { const a = sdSeg(x - s, y, x + s, y), b = sdSeg(x, y - s, x, y + s); return (px, py) => Math.min(a(px, py), b(px, py)) - s * 0.36; }
  // drops: три капли
  const drop = (cx: number, cy: number, r: number) => sdPoly([[cx, cy - r * 1.5], [cx + r * 0.9, cy + r * 0.1], [cx + r * 0.6, cy + r * 0.9], [cx - r * 0.6, cy + r * 0.9], [cx - r * 0.9, cy + r * 0.1]]);
  const ds = [drop(x - s * 0.55, y + s * 0.4, s * 0.38), drop(x + s * 0.5, y + s * 0.5, s * 0.38), drop(x, y - s * 0.45, s * 0.42)];
  return (px, py) => Math.min(...ds.map((d) => d(px, py)));
}

/** Рисует одно тело (знак) в сетку g: подкладка, свечение, тона по свету, блики. */
function paintBody(g: (RGBA | null)[], sdAt: (x: number, y: number) => number, theme: Theme, seed: number, glow: boolean, cap = 1) {
  const R = RAMPS[theme], N = R.length;
  const T = (f: number): RGBA => R[Math.max(0, Math.min(N - 1, Math.round(Math.min(f, f > 0.95 ? Math.min(1, cap + 0.2) : cap) * (N - 1))))];
  if (glow) for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const d = sdAt(x, y);
    if (d <= 1.1 || d > 3.4) continue;
    const p = 1 - (d - 1.1) / 2.3, n = pnoise(x, y, 2, 40, seed + 5) * 0.7 + hash01(x, y, seed) * 0.3;
    if (n < p * 0.7) g[y * 20 + x] = d < 2.1 ? R[Math.min(1, N - 1)] : R[0];
  }
  const hl: [number, number][] = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const d = sdAt(x, y);
    if (d > 0 && d <= 1.1) { g[y * 20 + x] = R[0]; continue; }
    if (d > 0) continue;
    const gx = sdAt(x + 1, y) - sdAt(x - 1, y), gy = sdAt(x, y + 1) - sdAt(x, y - 1), gl = Math.hypot(gx, gy) || 1;
    const facing = (gx * -0.6 + gy * -0.8) / gl;
    const depth = -d;
    let c: RGBA;
    if (depth < 1.1) c = facing > 0.25 ? T(0.92) : facing < -0.25 ? T(0.48) : T(0.74);
    else if (depth < 2.4) c = facing > 0.3 ? T(0.88) : T(0.68);
    else c = facing > 0.3 ? T(0.97) : T(0.84);
    g[y * 20 + x] = c;
    if (depth >= 1.1 && depth < 2.6 && facing > 0.2) hl.push([x, y]);
  }
  hl.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  hl.slice(0, 4).forEach(([x, y], i) => { g[y * 20 + x] = i % 2 === 0 ? T(1) : T(0.96); });
}

export function renderEntry(e: IconEntry): PC {
  const R = RAMPS[e.theme], N = R.length;
  const T = (f: number): RGBA => R[Math.max(0, Math.min(N - 1, Math.round(f * (N - 1))))];
  const h = strHash(e.shape + e.theme + (e.seed ?? 0));
  const diag = DIAG.test(e.shape);
  const hasMod = !!e.mod;
  const rot = e.rot ?? (diag ? [-40, 35, -30, 45, 30][h % 5] : 0);
  const size = e.size ?? (diag ? (hasMod ? 15 : 18) : hasMod ? 14 : 16);
  const at = e.modAt ?? "tr";
  const mx = at.endsWith("r") ? 15 : 5, my = at.startsWith("t") ? 5 : 15;
  const cx = e.cx ?? (hasMod ? (at.endsWith("r") ? 8.3 : 11.7) : 10), cy = e.cy ?? (hasMod ? (at.startsWith("t") ? 11.7 : 8.3) : 10);
  const sh = shapeOf(e.shape, { cx, cy, size, rot, flipX: e.flipX ?? (!diag && ((h >> 7) & 1) === 1 && !hasMod) });
  const g: (RGBA | null)[] = new Array(400).fill(null);
  const put = (x: number, y: number, c: RGBA) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 20 && y < 20) g[y * 20 + x] = c; };
  // пятна фона темы
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (pnoise(x, y, 4, 40, h) > 0.8) g[y * 20 + x] = R[0];
  const sdMain = (x: number, y: number) => sh.sd(x + 0.5, y + 0.5);
  const fx = e.fx ?? "none";
  const rnd = (k: number) => hash01(k, h, 17);
  const fxPx = (x: number, y: number, c: RGBA) => { if (sdMain(Math.round(x), Math.round(y)) > 1.3) put(x, y, c); };
  if (fx === "sparks") for (let k = 0; k < 6; k++) fxPx(1 + rnd(k) * 18, 1 + rnd(k + 50) * 18, k % 3 === 0 ? T(1) : T(0.7));
  if (fx === "streaks") for (const o of [-5, 5]) for (let t = -13; t < 0; t++) if ((t + o * 2 + 40) % 5 < 3) fxPx(cx + (t + o) * 0.707, cy + (-t + o) * 0.707, T(0.55));
  if (fx === "arc") for (let a = 3.3; a < 5.7; a += 0.07) if (Math.round(a * 14) % 5 < 4) fxPx(cx + Math.cos(a) * 8.6, cy + Math.sin(a) * 8.6, T(0.6));
  paintBody(g, sdMain, e.theme, h, true, e.cap);
  if (hasMod) {
    const mt = e.modTheme ?? e.theme;
    let sdm: SD;
    if (BUILTIN_MODS.has(e.mod!)) sdm = builtin(e.mod!, mx, my, e.mod === "drops" ? 4.2 : 3.6);
    else { const ms = shapeOf(e.mod!, { cx: mx, cy: my, size: 8.5 }); sdm = (x, y) => ms.sd(x, y); }
    paintBody(g, (x, y) => sdm(x + 0.5, y + 0.5), mt, h + 3, false, e.cap);
  }
  const plate = new PC(20, 20);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) { const c = g[y * 20 + x]; if (c) plate.set(x, y, c); }
  return frameIcon(plate);
}
