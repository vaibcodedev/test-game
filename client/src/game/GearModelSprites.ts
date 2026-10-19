/**
 * Оружие моделей каталога на герое: маленький «локальный спрайт» в осях оружия (s — вдоль, от руки к острию; q — поперёк),
 * строится один раз на модель и редкость и поворачивается на кадр обратным отображением (без дыр на диагоналях).
 * Архетип (look.shape) задаёт силуэт клинка, навершия, головы; материал — палитры каталога. Редкость по docs/gear-visuals.md 2.1:
 * у r0 кайма нейтральная и камень тусклый (тона 1–2), у r≥1 камень и кайма — цвет редкости. Свечения нет.
 */
import { BASE_ITEMS, ITEM_PALETTES, RARITY_COLORS, type ItemModel, type ModelLook } from "../../../shared/items";

export const PR = (id: string | undefined, fb = "steel"): string[] => ITEM_PALETTES[id ?? ""] ?? ITEM_PALETTES[fb] ?? ["#2a2c34", "#464a56", "#6a707c", "#9298a4", "#bcc2cc"];
const NEUTRAL = new Set(["gold", "bronze", "silver", "iron", "steel", "bone", "obsidian", "divine"]);
const shadeHex = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
};

/** Кайма и камень детали по её редкости: TB/TD — тело каймы (нейтральный металл), T — светлая кромка, ST/STD — камень. */
export interface Rim { T: string; TB: string; TD: string; ST: string; STD: string; hi: boolean }
export function rimOf(lk: ModelLook, r: number, fac = ""): Rim {
  const tr = PR(NEUTRAL.has(lk.trim) ? lk.trim : "obsidian", "bronze");
  const g = PR(lk.gem ?? lk.fx ?? (fac === "umbrath" ? "fel" : fac === "solgard" ? "sun" : "diamond"), "diamond");
  if (r >= 1) { const c = RARITY_COLORS[Math.min(3, r)]; return { T: c, TB: tr[2], TD: tr[1], ST: c, STD: shadeHex(c, 0.6), hi: true }; }
  return { T: tr[3], TB: tr[2], TD: tr[1], ST: g[2], STD: g[1], hi: false };
}

const S0 = -6, S1 = 22, Q0 = -9, Q1 = 9, GW = Q1 - Q0 + 1;
export interface WSprite { cells: (string | null)[]; smin: number; smax: number; qmin: number; qmax: number }
class Grid {
  cells: (string | null)[] = new Array((S1 - S0 + 1) * GW).fill(null);
  set(s: number, q: number, c: string) { s = Math.round(s); q = Math.round(q); if (s < S0 || s > S1 || q < Q0 || q > Q1) return; this.cells[(s - S0) * GW + (q - Q0)] = c; }
  v(q: number, s0: number, s1: number, c: string) { for (let s = Math.min(s0, s1); s <= Math.max(s0, s1); s++) this.set(s, q, c); }
  h(s: number, q0: number, q1: number, c: string) { for (let q = Math.min(q0, q1); q <= Math.max(q0, q1); q++) this.set(s, q, c); }
  /** Отрезок в осях (s,q). */
  seg(s0: number, q0: number, s1: number, q1: number, c: string) { const n = Math.max(1, Math.ceil(Math.max(Math.abs(s1 - s0), Math.abs(q1 - q0)) * 2)); for (let i = 0; i <= n; i++) this.set(s0 + ((s1 - s0) * i) / n, q0 + ((q1 - q0) * i) / n, c); }
  /** Тёмный контур 1 px вокруг оружия, как у спрайтов героев: силуэт читается на любом фоне и поверх тела. */
  outline(col = "#1b1422") {
    const src = this.cells.slice();
    for (let s = S0; s <= S1; s++) for (let q = Q0; q <= Q1; q++) {
      const i = (s - S0) * GW + (q - Q0);
      if (src[i]) continue;
      const n = (ds: number, dq: number) => { const ss = s + ds, qq = q + dq; return ss >= S0 && ss <= S1 && qq >= Q0 && qq <= Q1 && !!src[(ss - S0) * GW + (qq - Q0)]; };
      if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) this.cells[i] = col;
    }
  }
  sprite(): WSprite {
    let smin = S1, smax = S0, qmin = Q1, qmax = Q0;
    this.cells.forEach((c, i) => { if (!c) return; const s = Math.floor(i / GW) + S0, q = (i % GW) + Q0; smin = Math.min(smin, s); smax = Math.max(smax, s); qmin = Math.min(qmin, q); qmax = Math.max(qmax, q); });
    return { cells: this.cells, smin, smax, qmin, qmax };
  }
}
export const cellAt = (sp: WSprite, s: number, q: number) => (s < S0 || s > S1 || q < Q0 || q > Q1 ? null : sp.cells[(s - S0) * GW + (q - Q0)]);

interface Pal { M: string[]; H: string[]; C: string[]; B: string[]; rim: Rim; lk: ModelLook; fac: string; rich: number }
const BONE = ["#4a4238", "#6a6258", "#9e968a", "#cfc8b8", "#f1ecdf"];

/** Рукоять с навершием-камнем: от s0 до s1 по оси. */
function hilt(g: Grid, p: Pal, s0: number, s1: number) {
  for (let s = s0; s <= s1; s++) g.set(s, 0, s % 2 ? p.H[1] : p.H[2]);
  g.set(s0 - 1, 0, p.rim.TB); g.set(s0 - 1, -1, p.rim.TD); g.set(s0 - 1, 1, p.rim.TD); g.set(s0 - 2, 0, p.rim.ST);
}
/** Клинок: ширина по профилю, изгиб, волна, зубья, квадратное острие. */
function bladeG(g: Grid, p: Pal, s0: number, len: number, o: { w?: number; curve?: number; wave?: number; teeth?: boolean; back?: boolean; square?: boolean; widen?: boolean; leaf?: boolean; runes?: boolean; hole?: boolean; R?: string[] } = {}) {
  const R = o.R ?? p.M, w = o.w ?? 2;
  for (let i = 0; i < len; i++) {
    const s = s0 + i, f = i / Math.max(1, len - 1);
    const off = (o.curve ?? 0) * f * f + (o.wave ?? 0) * Math.sin(i * 1.4);
    let ww = w + (o.widen && f > 0.4 ? 1 : 0) + (o.leaf && f > 0.25 && f < 0.75 ? 1 : 0);
    if (!o.square && i >= len - 2) ww = Math.max(1, ww - (i === len - 1 ? 2 : 1));
    const left = Math.round(off - (ww - 1) / 2);
    for (let k = 0; k < ww; k++) g.set(s, left + k, k === 0 ? R[4] : k === ww - 1 && ww > 2 ? R[1] : R[2 + (ww > 2 && k === 1 ? 1 : 0)]);
    if (o.teeth && i % 2 === 0 && i < len - 2) g.set(s, left + ww, R[3]);
    if (o.back && i % 3 === 1 && i < len - 2) g.set(s, left - 1, R[3]);
    if (o.runes && i % 3 === 1 && i < len - 2 && ww >= 2) g.set(s, left + 1, p.rim.ST);
  }
  if (o.hole) g.set(s0 + len - 2, Math.round((o.curve ?? 0) * 0.8), "#120e16");
}
function guardG(g: Grid, p: Pal, s: number, half: number, type: string) {
  g.h(s, -half, half, p.rim.TB);
  g.set(s, -half, p.rim.T); g.set(s, half, p.rim.T);
  if (type === "claw" || type === "curved") { g.set(s + 1, -half, p.rim.TB); g.set(s + 1, half, p.rim.TB); }
  if (type === "wings") { g.set(s - 1, -half, p.rim.T); g.set(s - 1, half, p.rim.T); g.set(s, -half - 1, p.rim.TB); g.set(s, half + 1, p.rim.TB); }
  if (type === "disc") { g.h(s - 1, -1, 1, p.rim.TB); g.h(s + 1, -1, 1, p.rim.TB); }
  if (p.lk.gem || p.rim.hi) g.set(s, 0, p.rim.ST);
}

function swordG(g: Grid, p: Pal, wb: string, sh: string) {
  const big = wb === "greatsword", dag = wb === "dagger", twin = wb === "twinblades";
  const gs = big ? 2 : 1, len = big ? 14 : dag ? 5 : twin ? 8 : 10;
  hilt(g, p, big ? -3 : -1, gs - 1);
  const thin = sh === "rapier" || sh === "stiletto" || sh === "estoc";
  const broad = big || sh === "broad" || sh === "runic" || sh === "cleaver";
  const curve = ["saber", "twinsaber", "fang", "knife", "ritual"].includes(sh) ? 2.4 : 0;
  const wave = ["flame", "flamberge", "kris"].includes(sh) ? 0.6 : 0;
  bladeG(g, p, gs + 1, len, {
    w: thin ? 1 : broad ? (sh === "executioner" ? 4 : 3) : dag ? 2 : 2, curve, wave,
    teeth: sh === "serrated", back: sh === "jagged", square: sh === "executioner" || sh === "cleaver", widen: sh === "falchion" || sh === "cleaver",
    leaf: sh === "leaf" || sh === "kunai", runes: sh === "runic" || sh === "runeblade" || p.lk.deco === "runes", hole: sh === "executioner", R: sh === "fang" ? BONE : undefined,
  });
  const gt = sh === "rapier" ? "disc" : sh === "claymore" || sh === "saber" ? "curved" : p.lk.guard ?? "cross";
  guardG(g, p, gs, big ? 3 : dag ? 1 : sh === "leaf" || sh === "falchion" ? 2 : 2, gt);
  if (sh === "rapier") { g.seg(gs, -2, -1, -2, p.rim.TB); }
  if (sh === "zwei") { g.set(gs + 3, -2, p.M[3]); g.set(gs + 3, 2, p.M[3]); }
  if (p.rich >= 2 && !thin) g.v(0, gs + 1, gs + 2, p.rim.T);
}
function axeG(g: Grid, p: Pal, sh: string, two: boolean) {
  const top = two ? 15 : 11;
  hilt(g, p, -3, top);
  for (let s = -3; s <= top; s++) g.set(s, 0, s % 3 === 0 ? p.H[1] : p.H[2]);
  const M = sh === "bonecleaver" ? BONE : p.M, E = M[4], B = M[2], D = M[1];
  const blk = (s: number, q0: number, q1: number, edgeRight = true) => { g.h(s, q0, q1, B); g.set(s, edgeRight ? q1 : q0, E); g.set(s, edgeRight ? q0 : q1, D); };
  const t = top;
  switch (sh) {
    case "splitter": for (let s = t - 3; s <= t; s++) blk(s, 1, 4); break;
    case "pick": for (let s = t - 2; s <= t; s++) blk(s, 1, 3); g.seg(t - 1, -1, t - 2, -5, B); break;
    case "beak": g.seg(t, -1, t - 4, -4, B); g.seg(t - 1, -1, t - 4, -3, D); blk(t - 1, 1, 2); blk(t, 1, 2); break;
    case "francisca": blk(t - 2, 1, 3); blk(t - 1, 1, 4); blk(t, 2, 5); g.set(t + 1, 5, E); break;
    case "double": for (const s of [t - 2, t - 1, t]) { blk(s, 1, s === t - 1 ? 4 : 3); blk(s, s === t - 1 ? -4 : -3, -1, false); } break;
    case "tomahawk": blk(t - 1, 1, 3); blk(t, 1, 3); g.set(t, -1, B); g.set(t - 3, -1, p.C[3]); g.set(t - 4, -1, "#ffffff"); g.set(t - 5, -1, p.C[2]); break;
    case "moon": for (let s = t - 5; s <= t + 1; s++) { const k = Math.abs(s - (t - 2)); blk(s, 1, 6 - Math.max(0, k - 1)); } g.set(t + 2, 4, E); g.set(t - 6, 4, E); break;
    case "bardiche": for (let s = t - 7; s <= t + 1; s++) blk(s, 1, s > t - 2 ? 4 : s < t - 5 ? 2 : 3); break;
    case "labrys": for (let s = t - 4; s <= t; s++) { const k = Math.abs(s - (t - 2)); blk(s, 1, 5 - k); blk(s, -5 + k, -1, false); } break;
    case "executioner": for (let s = t - 4; s <= t; s++) blk(s, 1, 6); g.set(t - 1, 4, "#120e16"); break;
    case "winged": for (let s = t - 5; s <= t + 1; s++) blk(s, 1, [3, 5, 4, 6, 4, 5, 3][s - (t - 5)] ?? 3); break;
    case "bonecleaver": for (let s = t - 4; s <= t; s++) blk(s, 1, s % 2 ? 5 : 4); for (let s = 0; s < t - 5; s += 2) g.set(s, 0, BONE[3]); g.set(t - 5, 1, BONE[4]); break;
    default: blk(t - 3, 1, 2); blk(t - 2, 1, 4); blk(t - 1, 1, 4); blk(t, 1, 4); g.set(t - 4, 3, E); g.set(t + 1, 3, E);
  }
  g.set(t - 1, 0, p.rim.TB); g.set(t - 2, 0, p.lk.gem || p.rim.hi ? p.rim.ST : p.rim.TB);
  if (p.lk.deco === "spikes" || p.lk.deco === "horns") g.set(t + 1, 0, p.M[3]);
}
function maceG(g: Grid, p: Pal, sh: string, two: boolean) {
  const top = two ? 12 : 9;
  hilt(g, p, -3, top);
  const M = p.M, c = top + 2;
  const ball = (r: number) => { for (let s = -r; s <= r; s++) for (let q = -r; q <= r; q++) if (s * s + q * q <= r * r + 0.5) g.set(c + s, q, q < 0 || s > 0 ? M[3] : M[1]); g.set(c + r - 1, -1, M[4]); };
  if (two && sh === "holy") { for (let s = top; s < top + 3; s++) g.h(s, -3, 3, p.rim.TB); g.set(top + 1, 0, p.rim.ST); g.seg(top + 1, -3, top - 1, -6, "#e8e4ec"); g.seg(top + 1, 3, top - 1, 6, "#e8e4ec"); return; }
  switch (sh) {
    case "club": for (let s = 1; s <= top + 3; s++) { const w = s > top - 3 ? 1 : 0; g.h(s, -w, w, p.H[s % 2 ? 2 : 3]); } g.set(top, 2, M[3]); g.set(top + 2, -2, M[3]); g.set(top - 2, -2, M[3]); g.h(top - 3, -1, 1, p.rim.TB); break;
    case "flanged": for (let s = c - 2; s <= c + 2; s++) { g.h(s, -2, 2, M[2]); g.set(s, -2, M[4]); g.set(s, 0, M[1]); g.set(s, 2, M[1]); } g.set(c + 3, 0, p.rim.T); break;
    case "star": ball(2); for (const [s, q] of [[3, 0], [0, 3], [0, -3], [-3, 0], [2, 2], [2, -2], [-2, 2], [-2, -2]]) g.set(c + s, q, M[4]); break;
    case "flail": for (let s = top; s <= top + 3; s++) g.set(s, (s - top) * 0.6, p.rim.TB); { const cs = top + 5, cq = 2; for (let s = -1; s <= 1; s++) for (let q = -1; q <= 1; q++) g.set(cs + s, cq + q, M[2 + (q < 0 ? 1 : 0)]); for (const [s, q] of [[2, 0], [0, 2], [-2, 0], [0, -2]]) g.set(cs + s, cq + q, M[4]); } break;
    case "holy": ball(2); for (const [s, q] of [[3, 0], [0, 3], [0, -3], [-3, 0], [2, 2], [2, -2], [-2, 2], [-2, -2]]) g.set(c + s, q, p.rim.TB); g.set(c, 0, p.rim.ST); break;
    case "skull": for (let s = c - 1; s <= c + 2; s++) g.h(s, -2, 2, BONE[s > c ? 3 : 2]); g.set(c + 1, -1, "#120e16"); g.set(c + 1, 1, "#120e16"); g.set(c - 1, 0, BONE[1]); g.set(c + 3, -2, M[3]); g.set(c + 3, 2, M[3]); break;
    // молоты
    case "hammer": case "rune": case "spiked": case "maul": case "crusher": {
      const hw = sh === "maul" ? 4 : 3, rows = sh === "maul" ? 4 : 3, Rm = sh === "rune" ? PR("grey") : M;
      for (let s = top; s < top + rows; s++) { g.h(s, -hw, hw, Rm[2]); g.set(s, -hw, Rm[4]); g.set(s, hw, Rm[1]); }
      g.h(top + rows - 1, -hw, hw, Rm[3]);
      if (sh === "rune") { g.set(top + 1, -2, p.rim.ST); g.set(top + 1, 2, p.rim.ST); }
      if (sh === "spiked") { g.set(top + 1, -hw - 1, M[4]); g.set(top + 1, hw + 1, M[4]); g.set(top + rows, 0, M[4]); }
      if (sh === "crusher") g.seg(top + 1, -hw, top - 1, -hw - 3, M[3]);
      g.set(top + 1, 0, p.lk.gem || p.rim.hi ? p.rim.ST : p.rim.TB);
      break;
    }
    default: ball(2); for (const [s, q] of [[0, -2], [1, 2], [-1, 1]]) g.set(c + s, q, p.rim.TB); g.set(c + 3, 0, M[3]);
  }
}
function spearG(g: Grid, p: Pal, sh: string) {
  const top = 15;
  hilt(g, p, -5, top);
  for (let s = -5; s <= top; s++) g.set(s, 0, s % 4 === 0 ? p.H[1] : p.H[2]);
  const M = p.M;
  switch (sh) {
    case "pike": g.v(0, top + 1, top + 5, M[3]); g.set(top + 5, 0, M[4]); break;
    case "boar": bladeG(g, p, top + 1, 4, { w: 2, leaf: true }); g.h(top, -2, 2, p.rim.TB); break;
    case "partisan": bladeG(g, p, top + 1, 4, { w: 2 }); g.set(top + 1, -2, M[3]); g.set(top + 2, -3, M[4]); g.set(top + 1, 2, M[2]); g.set(top + 2, 3, M[3]); break;
    case "trident": g.h(top, -2, 2, M[2]); for (const q of [-2, 0, 2]) g.v(q, top + 1, top + (q ? 3 : 4), M[q < 0 ? 4 : 3]); break;
    case "lance": for (let i = 0; i < 6; i++) g.h(top - 6 + i, -Math.max(0, 2 - Math.floor(i / 2)), Math.max(0, 2 - Math.floor(i / 2)), M[i % 2 ? 3 : 2]); g.h(top - 7, -3, 3, p.rim.TB); g.v(0, top, top + 3, M[3]); break;
    case "serpent": bladeG(g, p, top + 1, 5, { w: 2, wave: 0.6 }); break;
    default: bladeG(g, p, top + 1, 4, { w: 2, leaf: true });
  }
  if (p.fac === "solgard" && sh !== "lance") { g.set(top - 1, 1, p.C[2]); g.set(top - 2, 1, p.C[2]); g.set(top - 2, 2, p.C[3]); }
  if (p.lk.gem || p.rim.hi) g.set(top, 0, p.rim.ST);
}
function scytheG(g: Grid, p: Pal, sh: string) {
  const top = 16, M = p.M, H = sh === "reaper" ? BONE : p.H;
  hilt(g, p, -5, top);
  for (let s = -5; s <= top; s++) g.set(s, 0, s % 3 === 0 ? H[1] : H[2]);
  g.set(5, 1, H[2]);
  switch (sh) {
    case "glaive": bladeG(g, p, top + 1, 5, { w: 2, curve: -1.5, widen: true }); break;
    case "warscythe": for (let i = 0; i < 6; i++) g.set(top - Math.floor(i / 2), -1 - i, i < 5 ? M[3] : M[4]); for (let i = 0; i < 5; i++) g.set(top + 1 - Math.floor(i / 2), -1 - i, M[2]); break;
    case "halberd": for (let s = top - 3; s <= top; s++) g.h(s, -4, -1, M[2]); g.v(-4, top - 3, top, M[4]); g.v(0, top + 1, top + 3, M[3]); g.set(top - 1, 1, M[3]); g.set(top - 2, 2, M[3]); break;
    default: {
      for (let i = 0; i <= 8; i++) { const s = top + 1 - Math.round(i * i / 16), q = -1 - i; g.set(s, q, M[3]); g.set(s + 1, q, M[i > 6 ? 4 : 2]); }
      if (sh === "double") for (let i = 0; i <= 5; i++) g.set(-4 + Math.round(i * i / 12), 1 + i, M[3]);
      if (sh === "reaper") { g.h(top, -1, 1, BONE[3]); g.set(top, -1, "#120e16"); g.set(top, 1, "#120e16"); }
    }
  }
  if (p.lk.gem || p.rim.hi) g.set(top - 1, 0, p.rim.ST);
}
function bowG(g: Grid, p: Pal, sh: string, cross: boolean) {
  const M = p.M, metal = sh === "bladed" || sh === "crescent", L = sh === "bone" || sh === "horn" ? BONE : metal ? M : p.H;
  if (cross) {
    for (let s = -2; s <= 6; s++) g.set(s, 0, s % 2 ? p.H[1] : p.H[2]);
    const span = sh === "hand" ? 3 : sh === "heavy" || sh === "ballista" ? 6 : 5;
    for (let q = -span; q <= span; q++) { const s = 6 - Math.round((q * q) / (span * 2)); g.set(s, q, sh === "spider" ? M[q % 2 ? 1 : 3] : M[Math.abs(q) === span ? 4 : 2]); if (sh === "heavy" || sh === "ballista") g.set(s - 1, q, M[1]); }
    for (let q = -span + 1; q <= span - 1; q++) if (Math.abs(q) > 1) g.set(3 + Math.round(Math.abs(q) * 0.4), q, "#e8e4d8");
    g.v(0, 4, 8, M[3]); g.set(8, 0, M[4]);
    if (sh === "repeater") { g.v(1, 1, 4, p.rim.TB); g.v(2, 1, 4, p.rim.TD); }
    if (sh === "heavy") { g.h(-2, -1, 1, p.rim.TB); g.set(-3, 0, p.rim.T); }
    if (p.lk.gem || p.rim.hi) g.set(2, 0, p.rim.ST);
    return;
  }
  const span = sh === "long" ? 8 : 7, depth = sh === "crescent" ? 4 : 3;
  for (let i = -span; i <= span; i++) {
    const t = i / span; let s = Math.round(depth * (1 - t * t));
    if (sh === "composite" && Math.abs(i) <= 1) s -= 1;
    g.set(s, i, L[Math.abs(i) === span ? 4 : sh === "composite" && i % 2 ? 1 : 2]);
    if (sh === "horn" || sh === "crescent") g.set(s - 1, i, L[1]);
    if (sh === "bone" && i % 2 === 0) g.set(s + 1, i, BONE[4]);
  }
  if (sh === "recurve" || sh === "horn") { g.set(1, -span - 1, L[3]); g.set(1, span + 1, L[3]); }
  if (sh === "bladed") for (const i of [-5, 5]) g.set(Math.round(depth * (1 - (i / span) ** 2)) + 1, i, M[4]);
  for (let i = -span + 1; i <= span - 1; i++) g.set(0, i, "#e8e4d8");
  g.set(depth, 0, p.lk.gem || p.rim.hi ? p.rim.ST : p.rim.TB);
  g.set(depth - 1, 0, p.H[1]);
}
function staffG(g: Grid, p: Pal, sh: string, scepter: boolean) {
  const top = scepter ? 10 : 14, M = p.M, ST = p.rim.ST, STD = p.rim.STD;
  const H = sh === "spine" ? BONE : p.H;
  if (!scepter || sh === "totem") hilt(g, p, scepter ? -2 : -5, top); else hilt(g, p, -2, top);
  for (let s = scepter ? -2 : -5; s <= top; s++) g.set(s, 0, sh === "spine" ? (s % 2 ? BONE[2] : BONE[4]) : scepter && sh !== "totem" && sh !== "wand" ? M[s % 2 ? 2 : 3] : s % 3 === 0 ? H[1] : H[2]);
  if (sh === "spine") for (let s = -4; s < top; s += 2) { g.set(s, -1, BONE[3]); g.set(s, 1, BONE[2]); }
  const c = top + 2;
  const stone = (s: number, q: number, big = false) => { g.set(s, q, ST); if (big) { g.set(s + 1, q, ST); g.set(s, q + 1, STD); g.set(s + 1, q + 1, ST); } if (p.rim.hi) g.set(s + (big ? 1 : 0), q, "#ffffff"); };
  switch (sh) {
    case "root": for (const q of [-2, 0, 2]) g.seg(top, q * 0.3, top + 4, q * 1.2, H[3]); g.set(top + 4, -3, H[2]); g.set(top + 4, 3, H[2]); stone(c, 0, true); break;
    case "skull": for (let s = c - 1; s <= c + 1; s++) g.h(s, -1, 1, BONE[3]); g.set(c, -1, ST); g.set(c, 1, ST); g.set(c - 1, 0, BONE[1]); for (const q of [-1, 1]) { g.set(c + 1, q * 2, BONE[4]); g.set(c + 2, q * 3, BONE[3]); g.set(c + 3, q * 3, BONE[2]); } break;
    case "cage": g.set(c + 3, 0, p.rim.TB); for (const s of [c - 1, c + 2]) g.h(s, -2, 2, p.rim.TB); for (const q of [-2, 2]) g.v(q, c, c + 1, p.rim.TD); g.set(c, -1, STD); g.set(c, 0, ST); g.set(c + 1, 0, ST); g.set(c, 1, STD); g.set(c + 1, -1, STD); break;
    case "crescent": for (const [s, q] of [[c - 1, -2], [c, -3], [c + 1, -3], [c + 2, -2], [c + 3, -1], [c - 1, 2], [c, 3]]) g.set(s, q, p.rim.TB); g.set(c + 3, -1, p.rim.T); stone(c + 1, 0); break;
    case "rings": stone(c, 0, true); for (const [s, q] of [[c - 1, -2], [c, -3], [c + 2, -2], [c + 3, 0], [c + 2, 3], [c, 3], [c - 1, 2]]) g.set(s, q, p.rim.TB); break;
    case "spine": for (const q of [-2, 0, 2]) g.seg(top, q * 0.4, top + 3, q, BONE[4]); stone(c + 1, 0); break;
    case "fork": for (const q of [-1, 1]) { g.seg(top, q, top + 4, q * 3, p.rim.TB); g.set(top + 4, q * 3, p.rim.T); } stone(top + 1, 0); g.set(top + 3, 1, ST); g.set(top + 4, 0, ST); g.set(top + 5, -1, ST); break;
    case "feather": g.h(top, -1, 1, H[3]); stone(c, 0); for (const [q, col] of [[-1, p.C[3]], [1, "#ffffff"], [2, p.C[2]]] as [number, string][]) g.v(q, top - 4, top - 1, col); break;
    // жезлы
    case "crown": g.h(top, -2, 2, p.rim.TB); for (const q of [-2, 0, 2]) g.v(q, top + 1, top + (q ? 2 : 3), p.rim.TB); stone(top + 1, 0); break;
    case "wand": g.set(top + 1, 0, ST); g.set(top + 2, 0, "#ffffff"); g.set(top + 1, -1, STD); g.set(top + 1, 1, STD); g.set(top, 0, ST); break;
    case "totem": for (let s = top - 1; s <= top + 3; s++) g.h(s, -2, 2, H[s % 2 ? 2 : 3]); g.set(top + 2, -1, ST); g.set(top + 2, 1, ST); g.h(top, -1, 1, H[0]); g.set(top + 1, -3, p.C[3]); g.set(top, -3, p.C[2]); g.set(top + 1, 3, p.C[3]); g.set(top, 3, p.C[2]); break;
    case "censer": g.seg(top, 0, top - 4, 3, p.rim.TB); for (let s = top - 7; s <= top - 4; s++) g.h(s, 2, 4, p.rim.TB); g.set(top - 5, 3, ST); g.set(top - 8, 3, p.rim.TD); break;
    case "sun": stone(c, 0); for (const [s, q] of [[3, 0], [0, 3], [0, -3], [-3, 0], [2, 2], [2, -2], [-2, 2], [-2, -2], [1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0]]) g.set(c + s, q, Math.abs(s) + Math.abs(q) > 2 ? p.rim.T : p.rim.TB); g.set(c, 0, ST); break;
    case "serpent": for (let s = 1; s < top; s++) g.set(s, Math.round(Math.sin(s * 0.9)), "#4a8a3a"); g.h(top + 1, -1, 1, "#4a8a3a"); g.set(top + 1, -1, ST); g.set(top + 2, 0, "#6aa858"); stone(top - 1, 0); break;
    case "eye": for (const [s, q] of [[c - 2, 0], [c - 1, -2], [c, -2], [c + 1, -2], [c + 2, 0], [c - 1, 2], [c, 2], [c + 1, 2]]) g.set(s, q, p.rim.TB); g.h(c, -1, 1, BONE[4]); g.set(c, 0, ST); break;
    default: g.h(top, -2, 2, p.rim.TB); g.set(top + 1, -2, p.rim.T); g.set(top + 1, 2, p.rim.T); stone(c - 1, 0, true);
  }
  if (p.rich >= 2) g.set(top - 1, 0, p.rim.TB);
  if (p.rich >= 3 && sh !== "censer") { g.set(top - 1, -2, p.rim.TB); g.set(top - 1, 2, p.rim.TB); }
}

const CACHE = new Map<string, WSprite>();
/** Локальный спрайт оружия модели (кэш по модели, редкости и базе). */
export function weaponSprite(md: ItemModel, r: number): WSprite {
  const key = md.id + ":" + r;
  let sp = CACHE.get(key);
  if (sp) return sp;
  const lk = md.look, g = new Grid(), sh = lk.shape;
  const p: Pal = { M: PR(lk.mat), H: PR(lk.haft, "wood"), C: PR(lk.cloth, "red"), B: BONE, rim: rimOf(lk, r, md.fac), lk, fac: md.fac, rich: lk.rich ?? 0 };
  const wb = BASE_ITEMS[md.cat]?.id ?? md.cat;
  switch (wb) {
    case "sword": case "greatsword": case "dagger": case "twinblades": swordG(g, p, wb, sh); break;
    case "axe": axeG(g, p, sh, false); break;
    case "greataxe": axeG(g, p, sh, true); break;
    case "mace": maceG(g, p, sh, false); break;
    case "hammer": maceG(g, p, sh === "holy" ? "holy" : sh, true); break;
    case "spear": spearG(g, p, sh); break;
    case "scythe": scytheG(g, p, sh); break;
    case "bow": bowG(g, p, sh, false); break;
    case "crossbow": bowG(g, p, sh, true); break;
    case "staff": staffG(g, p, sh, false); break;
    case "scepter": staffG(g, p, sh, true); break;
    default: swordG(g, p, "sword", sh);
  }
  g.outline();
  sp = g.sprite();
  CACHE.set(key, sp);
  return sp;
}
