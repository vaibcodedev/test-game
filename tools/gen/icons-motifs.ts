/** Мотивы иконок умений для tools/gen/icons-frosty.ts (задача 127).
 *  Каждая иконка — ОДИН главный знак (силуэт game-icons.net, CC BY 3.0, автор — в data/skill-icons.json и docs/content/credits.md) по смыслу умения
 *  плюс по желанию маленький знак-уточнение `mod` (капли, звёзды оглушения, стрелка вверх/вниз, череп и т. д.) в углу.
 *  Рисуется приёмами frosty, без сглаживания:
 *  - тело — тона темы по свету сверху-слева: светлая кромка на освещённой стороне, тёмная на теневой, середина, ядро, 1–5 бликов почти белого;
 *  - тёмная подкладка в 1 px вокруг тела, дальше свечение двумя ступенями рваными пятнами (шум пятнами, не градиент), пятна фона темы;
 *  - эффект композиции (искры, полосы, дуга) — второстепенный, включается полем fx.
 *  Каждый пиксель — цвет из 44 цветов frosty (RAMPS), без полупрозрачности. */
import { PC, hash01, pnoise, type RGBA } from "./canvas";
import { ELEMENT_RAMPS as RAMPS, frameIcon, sdPoly, sdSeg, sdDisc, sdArc, taper, type SD, type Element as Theme } from "./icons-frosty";
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
  /** Размер знака-уточнения, px (по умолчанию 8.5). */
  modSize?: number;
  /** Утолщение силуэта, px (по умолчанию 0.7). */
  bold?: number;
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

/** Рисует одно тело (знак) в сетку g приёмами frosty:
 *  - край рваный: границу сдвигает шум на пиксель (зубцы, сколы), а не гладкая кривая;
 *  - тона по глубине (край тёмный, к ядру светлее, свет сверху-слева) с шахматным переходом между тонами;
 *  - диагональные полосы тоном ниже по телу (у части знаков), блики почти белым, свечение ступенями с пылью.
 *  glow=false — знак-уточнение без ореола. */
function paintBody(g: (RGBA | null)[], sdSmooth: (x: number, y: number) => number, theme: Theme, seed: number, glow: boolean, cap = 1, stripes = false) {
  const R = RAMPS[theme], N = R.length;
  const rough = (x: number, y: number) => sdSmooth(x, y) + (hash01(x, y, seed + 21) - 0.5) * 0.25 + (pnoise(x, y, 3, 60, seed + 31) - 0.5) * 0.9;
  const BAY = [[0, 0.5], [0.75, 0.25]];
  if (glow) for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const d = rough(x, y);
    if (d <= 1.1 || d > 5) continue;
    const n = pnoise(x, y, 2, 40, seed + 5) * 0.7 + hash01(x, y, seed) * 0.3;
    if (d <= 3.4) { const p = 1 - (d - 1.1) / 2.3; if (n < p * 0.72) g[y * 20 + x] = d < 2.1 ? R[1] : R[0]; }
    else if (hash01(x, y, seed + 9) < 0.035) g[y * 20 + x] = hash01(x, y, seed + 11) < 0.5 ? R[1] : R[0]; // пыль за ореолом
  }
  const hl: [number, number][] = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const d = rough(x, y);
    if (d > 0 && d <= 1.1) { g[y * 20 + x] = R[0]; continue; }
    if (d > 0) continue;
    const gx = sdSmooth(x + 1, y) - sdSmooth(x - 1, y), gy = sdSmooth(x, y + 1) - sdSmooth(x, y - 1), gl = Math.hypot(gx, gy) || 1;
    const facing = (gx * -0.6 + gy * -0.8) / gl; // 1 — кромка смотрит на свет
    const depth = Math.max(0, -sdSmooth(x, y) + (hash01(x, y, seed + 22) - 0.5) * 0.5);
    let f = 0.3 + Math.min(depth, 3.2) * 0.2 + facing * (depth < 1.5 ? 0.16 : 0.05);
    f = Math.min(cap, f);
    let v = f * (N - 1) + (pnoise(x, y, 2, 40, seed + 41) - 0.5) * 0.9 + (BAY[y & 1][x & 1] - 0.4) * 0.12; // шахматный переход между тонами
    if (stripes && depth > 1.2 && ((x - y + 60) % 5 === 0)) v -= 1; // диагональные полосы
    g[y * 20 + x] = R[Math.max(0, Math.min(N - 2, Math.round(v)))];
    if (depth >= 1.1 && depth < 3 && facing > 0.2) hl.push([x, y]);
  }
  hl.sort((a, b2) => a[0] + a[1] - (b2[0] + b2[1]));
  hl.slice(0, 3).forEach(([x, y], i) => { g[y * 20 + x] = i % 2 === 0 ? R[N - 1] : R[Math.max(0, N - 2)]; });
}

/** Свои силуэты там, где у game-icons нет подходящего знака (поле shape: custom/<имя>). */
function customShape(name: string, cx: number, cy: number, size: number, rot = 0, flip = false): { sd(x: number, y: number): number } {
  const k = size / 18, ca = Math.cos((-rot * Math.PI) / 180), sa = Math.sin((-rot * Math.PI) / 180), fl = flip ? -1 : 1;
  // точки сцены → в систему мотива (поворот вокруг центра, зеркало)
  const back = (x: number, y: number): [number, number] => { const dx = (x - cx) * fl, dy = y - cy; return [10 + (dx * ca - dy * sa) / k, 10 + (dx * sa + dy * ca) / k]; };
  const P = (pts: [number, number][]) => sdPoly(pts);
  const capsules = (pts: [number, number][], r: number): SD => { const s = pts.slice(0, -1).map((p, i) => sdSeg(p[0], p[1], pts[i + 1][0], pts[i + 1][1])); return (x, y) => Math.min(...s.map((f) => f(x, y))) - r; };
  let parts: SD[];
  if (name === "fireball") parts = [sdDisc(12, 9.5, 6.6), P(taper(11, 10.5, 0.5, 19.5, 6, 0.6)), P(taper(8.5, 5.5, 5.5, 1, 3.2, 0.4))];
  else if (name === "dash") parts = [P(taper(1, 19, 15, 5, 1.5, 6.5)), P(taper(1, 12, 8, 5, 1, 3.4)), P(taper(8, 19.5, 15, 12.5, 1, 3.4)), P([[19.5, 0.5], [19.5, 10.5], [9.5, 0.5]])];
  else if (name === "dagger") parts = [P([[10, 0.5], [12.6, 3.5], [12.2, 12], [7.8, 12], [7.4, 3.5]]), P([[5, 12], [15, 12], [15, 14], [5, 14]]), P(taper(10, 14, 10, 18.5, 2.2, 2.2)), sdDisc(10, 19, 1.5)];
  else if (name === "arrow") parts = [P(taper(10, 19.5, 10, 4, 1.8, 1.8)), P([[10, 0.5], [14.2, 7], [5.8, 7]]), P([[10, 19.5], [13.4, 20], [10, 14.5]]), P([[10, 19.5], [6.6, 20], [10, 14.5]])];
  else if (name === "arrowfan") { const A = (a: number) => { const ca2 = Math.cos((a * Math.PI) / 180), sa2 = Math.sin((a * Math.PI) / 180); const R2 = (pts: [number, number][]) => pts.map(([x, y]) => [10 + (x - 10) * ca2 - (y - 19) * sa2, 19 + (x - 10) * sa2 + (y - 19) * ca2] as [number, number]); return [P(R2(taper(10, 19, 10, 3.5, 1.6, 1.6))), P(R2([[10, 0], [13.4, 6], [6.6, 6]]))]; }; parts = [...A(-30), ...A(0), ...A(30)]; }
  else if (name === "crossring") parts = [(x, y) => Math.abs(Math.hypot(x - 10, y - 10) - 8.4) - 1.1, P([[8, 3.5], [12, 3.5], [12, 8], [16.5, 8], [16.5, 12], [12, 12], [12, 16.5], [8, 16.5], [8, 12], [3.5, 12], [3.5, 8], [8, 8]])];
  else if (name === "banner") parts = [capsules([[3.5, 0.5], [3.5, 19.5]], 0.8), sdDisc(3.5, 1, 1.5), P([[4.5, 2.5], [17.5, 2.5], [17.5, 19.5], [11, 14.2], [4.5, 19.5]])];
  else if (name === "flock") { const bird = (x: number, y: number, s: number) => P([[x - 3 * s, y - 1 * s], [x, y + 0.6 * s], [x + 3 * s, y - 1 * s], [x + 3 * s, y + 0.3 * s], [x, y + 2.4 * s], [x - 3 * s, y + 0.3 * s]]); parts = [bird(7, 5.5, 1.4), bird(14.5, 9, 1.2), bird(6.5, 13.5, 1.1), bird(13, 17, 1)]; }
  else if (name === "jaws") parts = [P([[2, 3], [18, 3], [18, 6], [2, 6]]), ...[0, 1, 2, 3, 4].map((i) => P([[3 + i * 3.4, 6], [5.6 + i * 3.4, 6], [4.3 + i * 3.4, 12.5]])), P([[3, 15], [17, 15], [17, 18], [3, 18]]), ...[0, 1, 2].map((i) => P([[4.5 + i * 4.2, 15], [7 + i * 4.2, 15], [5.7 + i * 4.2, 10.5]]))];
  else if (name === "bounce") parts = [capsules([[1.5, 18], [8, 10], [12, 16], [17, 6.5]], 1.2), P([[19.5, 1.5], [13.2, 4.2], [18.5, 9.2]])];
  else if (name === "crack") parts = [capsules([[0, 13], [5, 9.5], [9, 14.5], [14, 9], [20, 12.5]], 1.2), capsules([[9, 14.5], [8, 19.5]], 0.8), P([[3, 5], [6, 3], [8.5, 6], [5, 7.5]]), P([[11, 4], [14, 1.5], [16.5, 5], [12, 6.5]]), P([[15, 16.5], [18, 14.5], [19.5, 19], [15.5, 19]])];
  else if (name === "roll") parts = [sdArc(10, 10, 6.5, 0.3, 4.9, 2.6), sdDisc(10, 10, 3), P([[14.6, 4.2], [11.76, 0.65], [10.64, 6.55]])];
  else if (name === "domeorb") parts = [sdArc(10, 12, 8, Math.PI, Math.PI * 2, 2.4), sdDisc(10, 12.5, 4.2)];
  else if (name === "wisp") {
    const body = [sdDisc(10, 13.5, 5.2), P(taper(10, 13, 11, 0.5, 7, 0.4)), P(taper(7, 10.5, 3.5, 5.5, 2.8, 0.4))], eyes = [sdDisc(8, 13, 1.2), sdDisc(12, 13, 1.2), sdDisc(10, 16.2, 1.2)];
    return { sd: (x, y) => { const [u, v] = back(x, y); const b2 = Math.min(...body.map((p) => p(u, v))), e2 = Math.min(...eyes.map((p) => p(u, v))); return Math.max(b2, -e2) * k; } };
  }
  else throw new Error(`нет своего силуэта ${name}`);
  return { sd: (x, y) => { const [u, v] = back(x, y); return Math.min(...parts.map((p) => p(u, v))) * k; } };
}

/** Эмблема Сольгарда на знамени: золотое восходящее солнце над небесно-голубым щитом (data/factions.json). Пиксели в координатах плашки. */
function emblemSolgard(g: (RGBA | null)[], theme: Theme) {
  const H = RAMPS[theme], B = RAMPS.frost, put = (x: number, y: number, c: RGBA) => { if (x >= 0 && y >= 0 && x < 20 && y < 20) g[y * 20 + x] = c; };
  const sun = H[H.length - 1], ray = H[H.length - 3];
  // щит (небесно-голубой, светлая кромка слева-сверху, тёмная справа-снизу)
  const rows: [number, number, number][] = [[8, 8, 12], [9, 8, 12], [10, 8, 12], [11, 9, 11], [12, 9, 11], [13, 10, 10]];
  for (const [y, x0, x1] of rows) for (let x = x0; x <= x1; x++) put(x, y, x === x0 || y === 8 ? B[4] : x === x1 ? B[2] : B[3]);
  put(10, 10, B[5]); put(10, 9, B[5]); put(9, 10, B[5]); put(11, 10, B[5]); // крест на щите
  // солнце: диск на верхней кромке щита и лучи
  for (const [x, y] of [[9, 7], [10, 7], [11, 7], [10, 6]]) put(x, y, sun);
  for (const [x, y] of [[7, 7], [13, 7], [8, 5], [12, 5], [10, 4], [7, 5], [13, 5]]) put(x, y, ray);
}

export function renderEntry(e: IconEntry): PC {
  const R = RAMPS[e.theme], N = R.length;
  const T = (f: number): RGBA => R[Math.max(0, Math.min(N - 1, Math.round(f * (N - 1))))];
  const h = strHash(e.shape + e.theme + (e.seed ?? 0));
  const diag = DIAG.test(e.shape);
  const hasMod = !!e.mod;
  const rot = e.rot ?? (diag ? [-40, 35, -30, 45, 30][h % 5] : 0);
  const size = e.size ?? (diag ? (hasMod ? 16 : 19) : hasMod ? 14 : 16);
  const at = e.modAt ?? "tr";
  const mx = at.endsWith("r") ? 15 : 5, my = at.startsWith("t") ? 5 : 15;
  const jx = (((h >> 3) % 7) - 3) * 0.7, jy = (((h >> 5) % 7) - 3) * 0.7; // смещение от центра: часть знака уходит за край плашки
  const cx = e.cx ?? (hasMod ? (at.endsWith("r") ? 8.3 : 11.7) : 10) + jx * (hasMod ? 0.3 : 0.55), cy = e.cy ?? (hasMod ? (at.startsWith("t") ? 11.7 : 8.3) : 10) + jy * (hasMod ? 0.3 : 0.55);
  const sh = e.shape.startsWith("custom/") ? customShape(e.shape.slice(7), cx, cy, size, rot, e.flipX) : shapeOf(e.shape, { cx, cy, size, rot, flipX: e.flipX ?? (!diag && ((h >> 7) & 1) === 1 && !hasMod) });
  const g: (RGBA | null)[] = new Array(400).fill(null);
  const put = (x: number, y: number, c: RGBA) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 20 && y < 20) g[y * 20 + x] = c; };
  // пятна фона темы
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) { const n1 = pnoise(x, y, 4, 40, h); if (n1 > 0.78) g[y * 20 + x] = n1 > 0.9 ? R[1] : R[0]; }
  // разводы: короткие диагональные мазки тёмным тоном темы
  for (let k = 0; k < 3; k++) { const x0 = Math.floor(hash01(k, h, 41) * 20), y0 = Math.floor(hash01(k, h, 43) * 20), L = 3 + Math.floor(hash01(k, h, 47) * 4); for (let t = 0; t < L; t++) put(x0 + t, y0 - t, R[0]); }
  const bold = e.bold ?? 0.35; // утолщение тонких силуэтов: при 20 px линии game-icons рвутся
  const sdMain = (x: number, y: number) => sh.sd(x + 0.5, y + 0.5) - bold;
  const fx = e.fx ?? "sparks";
  const rnd = (k: number) => hash01(k, h, 17);
  const fxPx = (x: number, y: number, c: RGBA) => { if (sdMain(Math.round(x), Math.round(y)) > 1.3) put(x, y, c); };
  if (fx === "sparks") {
    for (let k = 0; k < 6; k++) fxPx(1 + rnd(k) * 18, 1 + rnd(k + 50) * 18, k % 3 === 0 ? T(1) : k % 3 === 1 ? T(0.72) : T(0.5));
    { const px = 2 + Math.floor(rnd(70) * 16), py = 2 + Math.floor(rnd(71) * 16); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) fxPx(px + dx, py + dy, dx || dy ? T(0.55) : T(1)); }
  }
  if (fx === "streaks") for (const o of [-5, 5]) for (let t = -13; t < 0; t++) if ((t + o * 2 + 40) % 5 < 3) fxPx(cx + (t + o) * 0.707, cy + (-t + o) * 0.707, T(0.55));
  if (fx === "arc") for (let a = 3.3; a < 5.7; a += 0.07) if (Math.round(a * 14) % 5 < 4) fxPx(cx + Math.cos(a) * 8.6, cy + Math.sin(a) * 8.6, T(0.6));
  // полосы движения за знаком (диагональ вниз-влево) и осколки рядом: у frosty почти в каждой иконке
  for (const o of [-5.5, 4.5]) for (let t = -14; t < -3; t++) if ((t * 3 + o * 7 + 60) % 8 < 3) fxPx(cx + (t + o) * 0.707, cy + (-t + o) * 0.707, hash01(t, o * 3, h) < 0.25 ? T(0.8) : T(0.42));
  for (let k = 0; k < 1; k++) { const sx = 2 + rnd(k + 90) * 16, sy = 2 + rnd(k + 91) * 16, dir = rnd(k + 92) < 0.5 ? 1 : -1; for (let t = 0; t < 3; t++) fxPx(sx + t * dir, sy + t, t === 0 ? T(0.9) : T(0.5)); }
  paintBody(g, sdMain, e.theme, h, true, e.cap, ((h >> 10) & 1) === 1);
  // блик-росчерк: две диагональные белые линии внутри тела у освещённой кромки (как у frosty)
  {
    const W = RAMPS[e.theme][N - 1], W2 = RAMPS[e.theme][Math.max(0, N - 2)];
    const gx = cx - 3.2 + ((h >> 4) % 3) - 1, gy = cy - 4.2 + ((h >> 6) % 3) - 1;
    for (let t = 0; t < 6; t++) { const x = Math.round(gx + t * 0.8), y = Math.round(gy + t); if (sdMain(x, y) < -0.4) g[y * 20 + x] = t % 4 === 3 ? W2 : W; }
    for (let t = 0; t < 3; t++) { const x = Math.round(gx + 3.4 + t * 0.8), y = Math.round(gy - 1.5 + t); if (sdMain(x, y) < -0.4) g[y * 20 + x] = W2; }
  }
  if (hasMod) {
    const mt = e.modTheme ?? e.theme;
    let sdm: SD;
    if (BUILTIN_MODS.has(e.mod!)) sdm = builtin(e.mod!, mx, my, e.mod === "drops" ? 4.2 : 3.6);
    else { const ms = shapeOf(e.mod!, { cx: mx, cy: my, size: e.modSize ?? 8.5 }); sdm = (x, y) => ms.sd(x, y); }
    paintBody(g, (x, y) => sdm(x + 0.5, y + 0.5), mt, h + 3, false, e.cap, false);
  }
  if (e.shape === "custom/banner") emblemSolgard(g, e.theme);
  const plate = new PC(20, 20);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) { const c = g[y * 20 + x]; if (c) plate.set(x, y, c); }
  return frameIcon(plate);
}
