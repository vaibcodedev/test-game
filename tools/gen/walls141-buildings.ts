/**
 * Задача 141, этап 1: городские здания нового вида по стилям фракций и уровням (превью; в игру не ставятся).
 *   Дом, лавка, храм столиц; казарма и арсенал фортов; хижина поселения; таверна, банк, кузня и дома Эмберхолла.
 *   Вид 3/4: фасад (камень, фахверк или доски, цоколь, окна со светом, дверь, ступень) и передний скат кровли
 *   (черепица, сланец, дранка или солома; конёк, карниз с тенью, труба, слуховое окно). Износ — мох и заплатки на кровле,
 *   трещины, плющ, выбитые черепицы. Опора — низ середины; ширина = след × 32.
 */
import {
  type Look, type Wear, type Ramp, type RGBA, OUT, PC, chip, crack, darken, fillTex, groundShadow, hash01, hex, ivy,
  masonryTile, mix, mossPatch, patch, pnoise, shade, tex, tint, tone, withA,
} from "./walls141-lib";
import { archWindow } from "./walls141-walls";
import { shadowBox } from "./shadow";

export type RoofKind = "tile" | "slate" | "shingle" | "thatch";
export type WallKind = "stone" | "timber" | "plank";

/** Тон кровли в точке: u — вдоль ряда, v — от конька вниз (пиксели), shadeK — освещённость ската. */
function roofTone(R: Ramp, kind: RoofKind, u: number, v: number, seed: number, light = 2.4): RGBA {
  let t = light;
  if (kind === "thatch") {
    const bundle = Math.floor(v / 7), fv = v % 7;
    t += (pnoise(u * 3, v * 0.4, 2, 512, seed + bundle) - 0.5) * 1.6 + (hash01(Math.floor(u), bundle, seed) - 0.5) * 0.6;
    if (fv === 6) t -= 1.1;
    if (fv === 0) t += 0.5;
    return tone(R, t);
  }
  const rh = kind === "tile" ? 6 : 5, row = Math.floor(v / rh), fv = v % rh;
  const tw = kind === "tile" ? 6 : kind === "slate" ? 6 : 4 + Math.floor(hash01(row, 3, seed) * 3);
  const uu = u + (row % 2) * (tw / 2), col = Math.floor(uu / tw), fu = uu - col * tw;
  t += (hash01(col, row, seed) - 0.5) * (kind === "shingle" ? 1.2 : 0.7);
  if (kind === "tile") {
    // чешуя: скруглённый низ черепицы, тень в стыке
    const cu = (fu - tw / 2) / (tw / 2);
    if (fv >= rh - 1 - Math.round(1.5 * (1 - cu * cu))) t -= 1.2;
    else if (fu < 1) t -= 0.7;
    else if (fv === 0) t += 0.5;
    else if (fu < 2.5) t += 0.4;
  } else {
    if (fv === rh - 1) t -= 1.3;
    else if (fu < 1) t -= 0.9;
    else if (fv === 0) t += 0.5;
    if (kind === "shingle" && hash01(Math.floor(u), v, seed) < 0.15) t -= 0.5;
  }
  if (hash01(col * 7, row, seed + 1) < 0.04) t -= 0.8;
  return tone(R, t);
}

/** Фасад: камень, фахверк или доски; цоколь; тень под карнизом. */
function facadeWall(c: PC, look: Look, kind: WallKind, x0: number, x1: number, y0: number, yb: number, seed: number) {
  const S = look.stone, W = look.wood, PL = look.plaster;
  if (kind === "stone") {
    const t = masonryTile(look, look.masonry === "rubble" ? "rubble" : look.masonry, seed + 3);
    fillTex(c, t, x0, y0, x1 - x0, yb - y0, 0, 0, (x, y) => (y < 4 ? 0.7 : 1 - (y / (yb - y0)) * 0.1) * (x > x1 - x0 - 4 ? 0.85 : 1));
    if (look.tier === "capital") for (let y = y0 + 3, k = 0; y < yb - 4; y += 7, k++) for (const [qx, fl] of [[x0, false], [x1 - 1, true]] as const) {
      const w = k % 2 ? 4 : 7;
      for (let j = 0; j < 6; j++) for (let i = 0; i < w; i++) c.set(fl ? qx - i : qx + i, y + j, tone(S, 3.6 + (j === 0 ? 1 : 0) - (j === 5 ? 1.6 : 0) - (fl ? 0.8 : 0)));
    }
  } else if (kind === "plank") {
    for (let y = y0; y < yb; y++) for (let x = x0; x < x1; x++) {
      const p = Math.floor((x - x0) / 5), f = (x - x0) % 5;
      c.set(x, y, tone(W, 2.2 + (hash01(p, 1, seed) - 0.5) + (f === 4 ? -1.2 : f === 0 ? 0.5 : 0) + (hash01(x, y >> 2, seed) < 0.12 ? -0.5 : 0) - (y - y0 < 3 ? 0.8 : 0)));
    }
  } else {
    for (let y = y0; y < yb; y++) for (let x = x0; x < x1; x++)
      c.set(x, y, tone(PL, 2 + (pnoise(x, y, 4, 256, seed) - 0.5) * 1.1 + (hash01(x, y, seed) < 0.04 ? -0.8 : 0) - (y - y0 < 3 ? 0.9 : 0)));
    // балки: стойки, ригели, раскосы
    const beam = (x: number, y: number) => { c.set(x, y, W[1]); };
    // балки выступают из штукатурки: светлая кромка сверху/слева, тень снизу/справа
    for (let x = x0; x < x1; x++) for (const yy of [y0 + 2, Math.round((y0 + yb) / 2) - 2, yb - 10]) { c.set(x, yy, W[3]); c.set(x, yy + 1, W[2]); c.set(x, yy + 2, W[0]); darken(c, x, yy + 3, 0.72); }
    const n = Math.max(2, Math.round((x1 - x0) / 26));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0 - 4) * k) / n);
      for (let y = y0 + 2; y < yb - 8; y++) { c.set(x, y, W[3]); c.set(x + 1, y, W[2]); c.set(x + 2, y, W[1]); c.set(x + 3, y, W[0]); if (x + 4 < x1) darken(c, x + 4, y, 0.7); }
      if (k < n && k % 2 === 0) {
        const xa = x + 4, xb = Math.round(x0 + ((x1 - x0 - 4) * (k + 1)) / n) - 1, ya = Math.round((y0 + yb) / 2) + 1, yb2 = yb - 11;
        for (let t = 0; t <= 1; t += 0.02) { const xx = Math.round(xa + (xb - xa) * t), yy = Math.round(ya + (yb2 - ya) * t); beam(xx, yy); c.set(xx, yy - 1, W[2]); }
      }
    }
  }
  // цоколь из камня
  const base = masonryTile(look, "rubble", seed + 4, -0.2);
  for (let x = x0 - 1; x <= x1; x++) {
    c.set(x, yb - 8, S[4]);
    for (let y = yb - 7; y < yb; y++) c.set(x, y, shade(tex(base, x, y), y === yb - 1 ? 0.7 : 0.95));
  }
}

/** Окно с рельефом: перемычка над проёмом, откос в тени, переплёт, выступающий подоконник с тенью, ставни из досок, ящик с цветами. */
function windowRect(c: PC, look: Look, x: number, y: number, w: number, h: number, opts: { shutters?: RGBA; flowers?: boolean; boarded?: boolean; pointed?: boolean } = {}) {
  const G = look.glass, F = look.tier === "capital" ? look.trim : look.wood, S = look.stone;
  // перемычка
  if (!opts.pointed) for (let i = -2; i < w + 2; i++) { c.set(x + i, y - 3, S[5]); c.set(x + i, y - 2, S[3]); }
  for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
    if (opts.pointed && j < 3) { const dx = Math.abs(i + 0.5 - w / 2); if (dx > (j + 1) * (w / 6) + 0.5) continue; }
    const edge = i === -1 || j === -1 || i === w || j === h;
    let col = edge ? F[1] : j < h * 0.4 ? G[2] : G[1];
    if (!edge && (i === Math.floor(w / 2) || j === Math.floor(h / 2))) col = mix(F[1], G[0], 0.4);
    if (!edge && (i === 0 || j === 0)) col = mix(G[0], OUT, 0.35); // откос в тени
    if (!edge && i === w - 1 && j > 1) col = mix(col, hex("#ffffff"), 0.2);
    c.set(x + i, y + j, col);
  }
  if (opts.boarded) for (const yy of [y + 1, y + h - 3]) for (let i = -2; i < w + 2; i++) { c.set(x + i, yy + ((i >> 2) % 2), look.wood[3]); c.set(x + i, yy + 1 + ((i >> 2) % 2), look.wood[1]); }
  // подоконник выступает: светлый верх, тень под ним
  for (let i = -2; i < w + 2; i++) { c.set(x + i, y + h + 1, S[5]); c.set(x + i, y + h + 2, S[2]); darken(c, x + i + 1, y + h + 3, 0.62); darken(c, x + i + 1, y + h + 4, 0.82); }
  if (opts.shutters) for (const [sx, side] of [[x - 5, 0], [x + w + 1, 1]] as const) for (let j = -1; j <= h; j++) for (let i = 0; i < 4; i++) {
    const k = i === 3 ? 0.62 : i === 0 ? 1.12 : j === -1 ? 1.15 : j === h ? 0.7 : j === Math.floor(h / 2) ? 0.8 : 1;
    c.set(sx + i, y + j, shade(opts.shutters, k));
    if (side === 1 && i === 3) darken(c, sx + 4, y + j + 1, 0.7);
  }
  if (opts.flowers) {
    c.rect(x - 1, y + h + 2, w + 2, 3, look.wood[2]); c.rect(x - 1, y + h + 2, w + 2, 1, look.wood[3]); c.rect(x - 1, y + h + 4, w + 2, 1, look.wood[0]);
    for (let i = 0; i < w + 2; i++) { const fx = x - 1 + i; c.set(fx, y + h + 1, hash01(i, y, 5) < 0.5 ? hex("#3c7230") : hex("#56903c")); if (hash01(i, x, 6) < 0.35) c.set(fx, y + h, [hex("#e04a5a"), hex("#ffd45e"), hex("#f0f0ff")][i % 3]); }
  }
}

/** Дверь: доски, оковка, арка или прямая, ступень, фонарь. */
function doorway(c: PC, look: Look, cx: number, yb: number, w: number, h: number, arch: boolean, double = false) {
  const W = look.wood, T = look.trim, S = look.stone;
  const x0 = cx - Math.floor(w / 2);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const y = yb - h + j;
    if (arch && j < w / 2) { const dx = i + 0.5 - w / 2, dy = j - w / 2; if (dx * dx + dy * dy > (w / 2) ** 2) continue; }
    const f = i % 4;
    let col = tone(W, 2.2 + (f === 3 ? -1 : f === 0 ? 0.4 : 0) + (look.faction === "umb" ? -0.5 : 0));
    if (j === Math.floor(h * 0.3) || j === Math.floor(h * 0.75)) col = T[2];
    if (double && i === Math.floor(w / 2)) col = OUT;
    c.set(x0 + i, y, col);
  }
  // наличник
  for (let j = 0; j < h; j++) { c.set(x0 - 1, yb - h + j, S[4]); c.set(x0 + w, yb - h + j, S[1]); }
  if (arch) for (let a = 0; a <= 40; a++) { const t = (a / 40) * Math.PI; c.set(Math.round(cx - 0.5 - Math.cos(t) * (w / 2 + 0.5)), Math.round(yb - h + w / 2 - Math.sin(t) * (w / 2 + 0.5)), S[4]); }
  else for (let i = -1; i <= w; i++) { c.set(x0 + i, yb - h - 1, look.wood[1]); c.set(x0 + i, yb - h - 2, look.wood[3]); }
  // ручка-кольцо
  const hx = double ? Math.floor(w / 2) + 2 : w - 4, hy = yb - Math.floor(h * 0.45);
  c.set(x0 + hx, hy - 1, T[4]); c.set(x0 + hx - 1, hy, T[3]); c.set(x0 + hx + 1, hy, T[2]); c.set(x0 + hx, hy + 1, T[1]);
  // ступень
  for (let i = -2; i < w + 2; i++) { c.set(x0 + i, yb, S[4]); c.set(x0 + i, yb + 1, S[2]); c.set(x0 + i, yb + 2, S[0]); }
}

/** Фонарь на кронштейне. */
function lantern(c: PC, look: Look, x: number, y: number) {
  const T = look.trim;
  c.rect(x, y, 4, 1, T[2]);
  c.rect(x + 3, y + 1, 1, 2, T[1]);
  c.rect(x + 1, y + 3, 5, 6, T[1]);
  c.rect(x + 2, y + 4, 3, 4, look.glass[2]);
  c.rect(x + 1, y + 2, 5, 1, T[3]);
}

/** Труба на кровле: лицевая грань, боковая в тени, оголовок, тень на скат вправо-вниз. */
function chimney(c: PC, look: Look, x: number, yTop: number, h: number) {
  const t = masonryTile(look, "brick", 77);
  for (let j = 2; j < h + 4; j++) for (let i = 0; i < 8; i++) darken(c, x + 12 + i - Math.floor(j / 3), yTop + h - 2 + j - 4, 0.72);
  fillTex(c, t, x, yTop, 9, h, 0, 0, (i) => (i < 1 ? 1.15 : 1));
  fillTex(c, t, x + 9, yTop - 2, 4, h + 2, 3, 0, () => 0.62);
  for (let i = -1; i < 11; i++) { c.set(x + i, yTop - 1, look.stone[4]); c.set(x + i, yTop, look.stone[2]); }
  for (let i = 10; i < 14; i++) { c.set(x + i, yTop - 3, look.stone[3]); c.set(x + i, yTop - 2, look.stone[1]); }
  c.rect(x + 2, yTop - 2, 6, 1, OUT);
}

/** Навес лавки: полосатая ткань с фестонами и тенью на фасаде. */
function awning(c: PC, look: Look, x0: number, x1: number, y: number, depth = 12) {
  const A = look.cloth, B = look.cloth2;
  for (let j = 0; j < depth; j++) for (let x = x0; x < x1; x++) {
    const stripe = Math.floor((x - x0) / 6) % 2;
    const R = stripe ? B : A;
    c.set(x, y + j, R[Math.min(R.length - 1, j < 2 ? 3 : j > depth - 3 ? 1 : 2)]);
  }
  for (let x = x0; x < x1; x++) {
    const f = (x - x0) % 6, d = f === 0 || f === 5 ? 1 : 3;
    const R = Math.floor((x - x0) / 6) % 2 ? B : A;
    for (let k = 0; k < d; k++) c.set(x, y + depth + k, R[1]);
    for (let k = 0; k < 4; k++) darken(c, x, y + depth + d + k, 0.72);
  }
}

/** Вывеска на кронштейне с символом (лавка — монета/зелье/меч). */
function hangingSign(c: PC, look: Look, x: number, y: number, sym: "coin" | "potion" | "sword" | "mug" | "anvil") {
  const W = look.wood, T = look.trim;
  c.rect(x, y, 14, 1, T[1]); c.rect(x, y - 1, 1, 3, T[1]);
  c.rect(x + 3, y + 1, 1, 2, T[2]); c.rect(x + 11, y + 1, 1, 2, T[2]);
  c.rect(x + 2, y + 3, 11, 10, W[1]); c.rect(x + 3, y + 4, 9, 8, W[3]);
  const cx = x + 7, cy = y + 8;
  if (sym === "coin") { c.ellipse(cx + 0.5, cy, 3, 3, hex("#d8a02c")); c.ellipse(cx, cy - 0.5, 1.6, 1.6, hex("#ffe27a")); }
  else if (sym === "potion") { c.rect(cx, cy - 4, 1, 2, hex("#e0e0e0")); c.ellipse(cx + 0.5, cy + 1, 3, 2.6, look.glass[1]); c.set(cx - 1, cy, look.glass[2]); }
  else if (sym === "sword") { c.rect(cx, cy - 4, 1, 7, hex("#d8dce8")); c.rect(cx - 2, cy + 2, 5, 1, hex("#a8682a")); }
  else if (sym === "mug") { c.rect(cx - 2, cy - 2, 4, 5, hex("#c89a52")); c.rect(cx + 2, cy - 1, 1, 3, hex("#c89a52")); c.rect(cx - 2, cy - 3, 4, 1, hex("#fff6dc")); }
  else { c.rect(cx - 3, cy - 1, 7, 2, hex("#6c6a78")); c.rect(cx - 1, cy + 1, 3, 2, hex("#45434f")); }
}

/** Износ здания: кровля (мох, заплатки, дыры), стены (трещины, плющ). */
function wearBuilding(c: PC, look: Look, wear: Wear, seed: number, roof: [number, number, number, number], wall: [number, number, number, number]) {
  const [rx0, ry0, rx1, ry1] = roof, [wx0, wy0, wx1, wy1] = wall;
  if (wear === "moss") { mossPatch(c, rx0, ry0, rx1 - rx0, ry1 - ry0, look, seed, false); mossPatch(c, wx0, wy1 - 12, wx1 - wx0, 12, look, seed + 3, false); }
  else if (wear === "ivy") { ivy(c, wx0 + 2, wy0 + 2, Math.min(30, wx1 - wx0 - 4), wy1 - wy0 - 6, seed); ivy(c, wx1 - 22, wy0 + 2, 20, wy1 - wy0 - 8, seed + 1); }
  else if (wear === "crack") { crack(c, wx0 + 6, wy0 + 4, wy1 - wy0 - 14, seed, mix(OUT, look.stone[0], 0.4), look.stone[4]); crack(c, wx1 - 10, wy0 + 6, 14, seed + 3, mix(OUT, look.stone[0], 0.4), look.stone[4]); }
  else if (wear === "patch") {
    // заплатки кровли: другой тон и прибитая доска
    for (let k = 0; k < 3; k++) {
      const px = rx0 + 8 + Math.floor(hash01(k, seed, 1) * (rx1 - rx0 - 28)), py = ry0 + 6 + Math.floor(hash01(k, seed, 2) * Math.max(1, ry1 - ry0 - 18));
      for (let j = 0; j < 8; j++) for (let i = 0; i < 12; i++) if (c.alpha(px + i, py + j)) tint(c, px + i, py + j, k === 1 ? look.wood[3] : look.roofs[look.roofs.length - 1][2], 0.55);
      if (k === 1) for (let i = -2; i < 15; i++) { c.set(px + i, py + 3, look.wood[3]); c.set(px + i, py + 4, look.wood[1]); }
    }
    patch(c, wx0 + 10, wy1 - 26, 12, 9, look, seed, "brick", 0.5);
  } else if (wear === "chip") {
    // выбитые черепицы: тёмные дыры с обрешёткой
    for (let k = 0; k < 4; k++) {
      const px = rx0 + 6 + Math.floor(hash01(k, seed, 3) * (rx1 - rx0 - 18)), py = ry0 + 6 + Math.floor(hash01(k, seed, 4) * Math.max(1, ry1 - ry0 - 14));
      for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) if (c.alpha(px + i, py + j) && hash01(i, j, seed + k) < 0.85) c.set(px + i, py + j, j === 2 ? look.wood[2] : mix(OUT, look.wood[0], 0.4));
    }
    chip(c, wx1 - 3, wy0 + 6, 3, seed);
  }
}

export interface HouseOpt {
  w: number; wallH: number; roofH: number; roof?: number; roofKind?: RoofKind; wall?: WallKind; hip?: boolean;
  windows?: number; door?: "arch" | "plain" | "double"; chimney?: boolean; dormer?: boolean; flowers?: boolean;
  shop?: "coin" | "potion" | "sword" | "mug" | "anvil"; boarded?: boolean; frontGable?: boolean; upper?: boolean;
  /** глубина боковой стены (px) и навес над крыльцом */
  depth?: number; porch?: boolean; bay?: boolean;
}

/** Разметка готового дома (для пристроек: кузня, храмы). */
export interface HouseMeta { fx0: number; fx1: number; D: number; K: number; wy0: number; yb: number; ye: number }
export const META = new WeakMap<PC, HouseMeta>();

/** Скат кровли многоугольником: ряды параллельны карнизу (точка e, направление d), свет light, у карниза темнее. */
function roofPoly(c: PC, pts: [number, number][], R: Ramp, kind: RoofKind, ex: number, ey: number, dx: number, dy: number, light: number, seed: number, span: number) {
  const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  c.poly(pts, (x, y) => {
    const px = x + 0.5 - ex, py = y + 0.5 - ey;
    const u = px * ux + py * uy, v = Math.abs(px * uy - py * ux);
    const t = Math.min(1, v / span);
    return roofTone(R, kind, u, Math.max(0, Math.round(span - v)), seed, light - (1 - t) * 0.5 + t * 0.4);
  });
}
/** Отрезок толщиной 2: кромка (причелина, конёк). */
function edge2(c: PC, x0: number, y0: number, x1: number, y1: number, a: RGBA, b: RGBA) {
  c.line(x0, y0, x1, y1, a); c.line(x0, y0 + 1, x1, y1 + 1, b);
}

/** Боковая стена в перспективе 3/4 (уходит вправо-вверх на D×K): та же кладка в тени, цоколь, щипец при двускатной кровле. */
function sideWall(c: PC, look: Look, kind: WallKind, x0: number, D: number, K: number, wy0: number, yb: number, gable: number, seed: number) {
  const ref = new PC(c.w + 80, c.h + 40);
  facadeWall(ref, look, kind, 0, c.w + 80, Math.max(0, wy0 - gable - K - 4), yb + 2, seed + 7);
  for (let i = 0; i < D; i++) {
    const t = (i + 0.5) / D, off = Math.round(t * K), x = x0 + i;
    const top = wy0 - off - Math.round(gable * (1 - Math.abs(2 * t - 1)));
    for (let y = top; y < yb - off; y++) {
      const p = ref.get(x, y + off);
      if (!p || !p[3]) continue;
      c.set(x, y, shade(p, 0.62 - t * 0.06 + (y < top + 3 ? -0.08 : 0)));
    }
    c.set(x, yb - off, withA(OUT, 140));
  }
  for (let y = wy0; y < yb; y++) c.set(x0, y, shade(look.stone[3], 0.8));
}

const SHADOW_C: RGBA = [12, 8, 18, 255];
/** Тень на земле: от здания вправо-вниз (свет сверху слева). */
function dropShadow(c: PC, x0: number, x1: number, D: number, K: number, yb: number) {
  shadowBox(c, x0, x1, yb, [D, -K], 90);
}

/** Крыльцо: две ступени перед дверью и (canopy) навес на кронштейнах. */
function porch(c: PC, look: Look, cx: number, yb: number, w: number, dh: number, canopy: boolean) {
  const S = look.stone;
  for (const [k, half] of [[0, w / 2 + 4], [1, w / 2 + 7]] as const) {
    const y = yb + k * 3;
    for (let x = Math.round(cx - half); x < cx + half; x++) { c.set(x, y, S[5]); c.set(x, y + 1, S[3]); c.set(x, y + 2, S[1]); }
    c.set(Math.round(cx + half), y + 1, S[0]); c.set(Math.round(cx + half), y + 2, S[0]);
  }
  if (!canopy) return;
  const R = look.roofs[0], y0 = yb - dh - 11, hw = w / 2 + 7;
  for (let y = y0; y < y0 + 7; y++) for (let x = Math.round(cx - hw); x < cx + hw; x++) c.set(x, y, roofTone(R, "tile", x, y - y0, 3, 2.6 - (y - y0) * 0.15));
  for (let x = Math.round(cx - hw); x < cx + hw; x++) { c.set(x, y0 + 7, R[0]); for (let k = 8; k < 11; k++) darken(c, x, y0 + k, 0.72); }
  for (const bx of [Math.round(cx - hw + 2), Math.round(cx + hw - 3)]) { c.set(bx, y0 + 8, look.wood[2]); c.set(bx, y0 + 9, look.wood[2]); c.set(bx + 1, y0 + 9, look.wood[1]); }
}

/** Эркер: выступающий короб с окном — лицевая грань, боковая в тени, своя кровелька и тень под ним и справа. */
function bayWindow(c: PC, look: Look, cx: number, wy: number, R: Ramp) {
  const S = look.stone, PL = look.tier === "capital" ? S : look.plaster, x0 = cx - 9, x1 = cx + 9, y0 = wy - 3, y1 = wy + 16;
  for (let y = y1; y < y1 + 4; y++) for (let x = x0 + 1; x < x1 + 4; x++) darken(c, x, y, 0.6 + (y - y1) * 0.08);
  for (let y = y0; y < y1 + 2; y++) for (let k = 0; k < 4; k++) darken(c, x1 + 3 + k, y + 2, 0.65 + k * 0.08);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) c.set(x, y, tone(PL, (x === x0 ? 3.6 : 2.6) + (y === y1 - 1 ? -1.2 : 0) + (pnoise(x, y, 3, 64, 4) - 0.5) * 0.6));
  for (let i = 0; i < 4; i++) for (let y = y0 - i; y < y1 - i; y++) c.set(x1 + i, y, tone(PL, 1.2));
  for (let x = x0 - 1; x < x1 + 4; x++) { c.set(x, y1, look.wood[1]); c.set(x, y1 + 1, look.wood[0]); }
  windowRect(c, look, cx - 5, wy, 10, 11, { flowers: look.faction === "sol" });
  // кровелька эркера
  for (let j = 0; j < 6; j++) for (let x = x0 - 2 + j; x < x1 + 5; x++) c.set(x, y0 - 6 + j, roofTone(R, "tile", x, j, 2, x > x1 ? 1.4 : 2.8));
  for (let x = x0 - 2; x < x1 + 5; x++) { c.set(x, y0, R[3]); c.set(x, y0 + 1, R[0]); darken(c, x, y0 + 2, 0.7); }
}

/** Общий дом в 3/4: фасад, боковая стена, глубокий свес кровли с тенью, крыльцо, окна с наличниками, труба с тенью. */
export function house(look: Look, o: HouseOpt, wear: Wear = "clean", seed = 1): PC {
  const D = o.depth ?? 16, K = Math.round(D * 0.6), ov = 5;
  const H = o.wallH + o.roofH + K + 36, c = new PC(o.w, H);
  const yb = H - 9, fx0 = 6, fx1 = o.w - 10 - D, wy0 = yb - o.wallH, ye = wy0 + 2;
  const R = look.roofs[o.roof ?? 0], rk = o.roofKind ?? "tile", wk = o.wall ?? "stone";
  const cx = Math.round((fx0 + fx1) / 2);
  dropShadow(c, fx0, fx1, D, K, yb);
  const gable = o.frontGable || o.hip ? 0 : Math.max(0, o.roofH - Math.round(K / 2) - 8);
  sideWall(c, look, wk, fx1, D, K, wy0, yb, gable, seed);
  facadeWall(c, look, wk, fx0, fx1, wy0, yb, seed);
  for (let y = wy0; y < yb - 8; y++) c.set(fx0, y, mix(c.get(fx0, y)!, hex("#ffffff"), 0.18));
  // окна и дверь
  // дверь по росту героя (кадр 32 px, макушка ~29 px): проём 32–33 px, наличник, порог, ручка, фонарь у входа (задача 141)
  const n = o.windows ?? 2, dw = o.door === "double" ? 20 : 14, dh = Math.min(o.wallH - 12, o.door === "double" ? 33 : 32);
  const shutter = look.faction === "sol" ? look.cloth[2] : look.faction === "ember" ? look.wood[2] : look.tier === "capital" ? undefined : look.wood[1];
  const slots: number[] = [];
  for (let k = 0; k < n; k++) slots.push(Math.round(fx0 + ((fx1 - fx0) * (k + (k >= n / 2 ? 1.5 : 0.5))) / (n + 1)));
  const wy = o.upper ? wy0 + 10 : wy0 + Math.max(8, Math.round((o.wallH - 14) * 0.32));
  slots.forEach((sx, k) => (o.bay && k === 0 ? bayWindow(c, look, sx, wy, R) : windowRect(c, look, sx - 4, wy, 8, 11, { shutters: shutter, flowers: o.flowers, boarded: o.boarded, pointed: look.faction === "umb" })));
  if (o.upper) for (const sx of slots) windowRect(c, look, sx - 4, yb - 28, 8, 11, { shutters: shutter });
  // окно в боковой стене
  if (D >= 14 && !o.upper) {
    const sx = fx1 + Math.round(D / 2) - 2, sy = wy + 4 - Math.round(K / 2);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) c.set(sx + i, sy + j - Math.round((i * K) / D), i === 0 || j === 0 ? OUT : shade(look.glass[1], 0.7));
  }
  doorway(c, look, cx, yb - 1, dw, dh, o.door === "arch" || o.door === undefined, o.door === "double");
  porch(c, look, cx, yb, dw, dh, !!o.porch);
  lantern(c, look, cx + dw / 2 + 3, yb - dh + 2);
  // кровля
  const ax = fx0 - ov, bx = fx1 + ov, top = ye - o.roofH;
  if (o.frontGable) {
    const ft = masonryTile(look, look.masonry === "rubble" ? "rubble" : look.masonry, seed + 3);
    c.poly([[fx0, wy0 + 1], [cx, top + 5], [fx1, wy0 + 1]], (x, y) => shade(tex(ft, x, y), 0.92));
    windowRect(c, look, cx - 3, top + Math.round(o.roofH * 0.45), 6, 8, { pointed: look.faction === "umb" });
    roofPoly(c, [[cx, top], [bx, ye], [bx + D, ye - K], [cx + D, top - K]], R, rk, bx, ye, -(bx - cx), -(ye - top), 1.4, seed + 9, o.roofH);
    roofPoly(c, [[ax, ye], [cx, top], [cx + D, top - K], [ax + D, ye - K]], R, rk, ax, ye, cx - ax, top - ye, 3.0, seed, o.roofH);
    edge2(c, ax, ye, cx, top, R[0], withA(R[0], 140)); edge2(c, cx, top, bx, ye, R[0], withA(R[0], 140));
    c.line(cx, top, cx + D, top - K, R[4]);
    for (let x = fx0; x < fx1; x++) { const d = Math.abs(x + 0.5 - cx) / (cx - fx0), yy = Math.round(top + 5 + d * (wy0 - top - 4)); for (let k = 1; k < 5; k++) darken(c, x, yy + k, 0.75); }
  } else {
    const ins = o.hip ? Math.round(o.roofH * 0.55) : 0;
    const C: [number, number] = [bx + D / 2 - ins, top], E: [number, number] = [ax + D / 2 + ins, top];
    if (o.hip) roofPoly(c, [[bx, ye], [bx + D, ye - K], C], R, rk, bx, ye, D, -K, 1.3, seed + 5, o.roofH);
    roofPoly(c, [[ax, ye], [bx, ye], C, E], R, rk, ax, ye, 1, 0, 2.6, seed, o.roofH);
    for (let x = Math.round(E[0]); x <= C[0]; x++) { c.set(x, top - 2, R[1]); c.set(x, top - 1, (x - ax) % 6 === 0 ? R[2] : R[4]); c.set(x, top, R[3]); }
    if (!o.hip) { edge2(c, bx, ye, C[0], C[1], R[2], R[0]); edge2(c, C[0], C[1], fx1 + D, wy0 - K, R[1], R[0]); }
    // толщина кровли у карниза: торец черепицы (светлый), обрешётка, лобовая доска
    for (let x = ax; x <= bx; x++) { c.set(x, ye + 1, R[3]); c.set(x, ye + 2, R[1]); c.set(x, ye + 3, R[0]); }
  }
  // тень свеса на фасаде и боку
  for (let x = fx0; x < fx1 + D; x++) {
    const off = x >= fx1 ? Math.round(((x - fx1) / D) * K) : 0;
    for (let k = 4; k < 10; k++) if (x >= fx1 || x > ax) darken(c, x, ye + k - off, 0.56 + k * 0.045);
  }
  if (o.dormer && !o.frontGable) for (const dx of [-0.22, 0.22]) {
    const dcx = Math.round(cx + D / 4 + dx * (fx1 - fx0)), dy = top + Math.round(o.roofH * 0.35);
    c.poly([[dcx - 10, dy + 5], [dcx, dy - 5], [dcx + 10, dy + 5]], (x) => (x < dcx ? R[3] : R[1]));
    c.rect(dcx - 7, dy + 5, 14, 11, look.plaster[2]); c.rect(dcx + 5, dy + 5, 2, 11, look.plaster[0]);
    windowRect(c, look, dcx - 3, dy + 7, 6, 6);
    for (let x = dcx - 8; x < dcx + 11; x++) { darken(c, x, dy + 17, 0.6); darken(c, x, dy + 18, 0.8); }
  }
  if (o.chimney) chimney(c, look, Math.round(fx1 - 18 + D / 4), top - 6 + Math.round(K / 3), Math.round(o.roofH * 0.45));
  if (o.shop) {
    awning(c, look, fx0 - 1, fx1 + 1, wy0 + 4, 10);
    hangingSign(c, look, fx0 - 3, wy0 + 20, o.shop);
  }
  c.outline(OUT);
  wearBuilding(c, look, wear, seed, [ax + 4, top + 2, bx - 4, ye - 2], [fx0, wy0, fx1, yb]);
  META.set(c, { fx0, fx1, D, K, wy0, yb, ye });
  return c;
}

// ---------------- особые здания ----------------
/** Поднять кадр дома на холст выше (место под купол или шпиль); разметка сдвигается. */
function tallen(src: PC, extra: number): { c: PC; m: HouseMeta } {
  const c = new PC(src.w, src.h + extra), m0 = META.get(src)!;
  c.blit(src, 0, extra);
  return { c, m: { ...m0, wy0: m0.wy0 + extra, yb: m0.yb + extra, ye: m0.ye + extra } };
}

/** Храм Сольгарда 128: целла с боковой стеной, фронтон с золотым солнцем, портик из колонн, барабан с золотым куполом позади. */
export function solTemple(look: Look, wear: Wear = "clean", seed = 1): PC {
  const S = look.stone, T = look.trim, roofH = 30;
  const base = house(look, { w: 128, wallH: 60, roofH, roofKind: "slate", roof: 2, wall: "stone", frontGable: true, windows: 2, door: "arch", depth: 14 }, wear === "ivy" ? "clean" : wear, seed);
  const { c: body, m } = tallen(base, 50);
  const c = new PC(body.w, body.h);
  const cx = Math.round((m.fx0 + m.fx1) / 2), top = m.ye - roofH;
  // барабан и купол позади кровли
  const dcx = cx + Math.round(m.D / 2), dyb = top - 2;
  const t = masonryTile(look, "ashlar", seed);
  for (let y = dyb - 6; y < dyb + 26; y++) for (let x = dcx - 26; x < dcx + 26; x++) {
    const u = (x + 0.5 - dcx) / 26;
    c.set(x, y, shade(tex(t, x, y), 0.62 + 0.5 * Math.max(0, -0.6 * u + 0.8 * Math.sqrt(1 - u * u))));
  }
  for (let x = dcx - 26; x < dcx + 26; x++) { c.set(x, dyb - 6, T[3]); c.set(x, dyb - 5, T[1]); }
  for (const wx of [-14, 0, 14]) archWindow(c, look, dcx + wx, dyb + 2, 3, 12);
  domeShape(c, dcx, dyb - 6, 28, 30, look.roofs[1]);
  c.blit(body, 0, 0);
  // солнце на фронтоне
  const sy = top + 17;
  c.ellipse(cx, sy, 5, 5, T[1]); c.ellipse(cx, sy, 4, 4, T[3]); c.ellipse(cx - 0.6, sy - 0.6, 1.8, 1.8, T[4]);
  for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; c.set(Math.round(cx + Math.cos(an) * 7), Math.round(sy + Math.sin(an) * 6.5), T[2]); }
  // антаблемент и портик: колонны отбрасывают тень на фасад вправо
  for (let x = m.fx0 - 3; x < m.fx1 + 3; x++) { c.set(x, m.wy0 + 1, T[3]); c.set(x, m.wy0 + 2, S[5]); c.set(x, m.wy0 + 3, S[3]); c.set(x, m.wy0 + 4, S[1]); }
  const span = m.fx1 - m.fx0;
  for (const k of [0.07, 0.25, 0.75, 0.93]) {
    const ccx = Math.round(m.fx0 + span * k);
    for (let y = m.wy0 + 5; y < m.yb - 3; y++) {
      for (let i = 4; i < 8; i++) darken(c, ccx + i, y, 0.7);
      for (let i = -4; i < 4; i++) {
        const u = (i + 0.5) / 4, kk = 0.62 + 0.5 * Math.max(0, -0.6 * u + 0.8 * Math.sqrt(1 - u * u));
        c.set(ccx + i, y, shade(S[(i + 4) % 3 === 0 ? 3 : 4], kk));
      }
    }
    c.rect(ccx - 6, m.wy0 + 5, 12, 3, T[2]); c.rect(ccx - 6, m.wy0 + 5, 12, 1, T[4]); c.rect(ccx - 5, m.wy0 + 8, 10, 1, T[0]);
    c.rect(ccx - 6, m.yb - 4, 12, 3, S[4]); c.rect(ccx - 6, m.yb - 2, 12, 1, S[1]);
  }
  for (let k = 0; k < 3; k++) for (let x = m.fx0 - 4 + k * 2; x < m.fx1 + 4 - k * 2; x++) { c.set(x, m.yb + k * 2, S[5 - k]); c.set(x, m.yb + k * 2 + 1, S[2 - Math.min(2, k)]); }
  c.outline(OUT);
  if (wear === "ivy") ivy(c, m.fx0 + 2, m.wy0 + 6, span - 4, 44, seed);
  META.set(c, m);
  return c;
}

function domeShape(c: PC, cx: number, yb: number, rx: number, ry: number, R: Ramp) {
  for (let y = yb - ry; y <= yb; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - yb) / ry, d2 = dx * dx + dy * dy;
    if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2);
    let v = 0.6 + (-0.6 * dx - 0.35 * dy + 0.6 * nz) * 3.6;
    const lon = Math.asin(Math.max(-1, Math.min(1, dx / Math.sqrt(Math.max(0.01, 1 - dy * dy)))));
    if (Math.abs(((lon / Math.PI) * 8 + 10) % 1 - 0.5) > 0.44) v -= 1;
    c.set(x, y, tone(R, v));
  }
  c.rect(cx - 1, yb - ry - 9, 2, 9, R[2]); c.shadedEllipse(cx, yb - ry - 10, 3, 3, R); c.rect(cx, yb - ry - 18, 1, 6, R[3]);
}

/** Храм (склеп) Умбрата 128: готический объём с боковой стеной, крутой фронтон с розой, стрельчатый портал со свечением, контрфорсы с пинаклями, шпиль. */
export function umbTemple(look: Look, wear: Wear = "clean", seed = 1): PC {
  const S = look.stone, G = look.glass, roofH = 58;
  const base = house(look, { w: 128, wallH: 62, roofH, roofKind: "slate", wall: "stone", frontGable: true, windows: 2, door: "arch", depth: 14 }, wear, seed);
  const { c, m } = tallen(base, 70);
  const cx = Math.round((m.fx0 + m.fx1) / 2), top = m.ye - roofH;
  // шпиль на коньке
  const sx = cx + Math.round(m.D / 2), sb = top - Math.round(m.K / 2) + 8;
  for (let y = sb - 74; y < sb; y++) {
    const tt = (y - (sb - 74)) / 74, hw = 1 + tt * 8;
    for (let x = Math.round(sx - hw); x <= sx + hw; x++) if (!c.alpha(x, y) || y < top) c.set(x, y, tone(look.roofs[0], (x < sx ? 3.2 : 1.4) + ((y >> 2) % 2 ? -0.3 : 0)));
  }
  c.rect(sx - 1, sb - 84, 2, 11, look.trim[3]); c.rect(sx - 3, sb - 80, 6, 1, look.trim[3]);
  // роза
  const ry = top + 22;
  for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
    const d = Math.hypot(x, y);
    if (d > 8.5) continue;
    const ang = Math.atan2(y, x);
    let col = d < 2 ? G[2] : Math.abs(Math.sin(ang * 4)) < 0.22 ? S[2] : d < 5 ? G[2] : G[1];
    if (d > 7) col = x + y < 0 ? S[5] : S[1];
    c.set(cx + x, ry + y, col);
  }
  // стрельчатый портал поверх двери
  const pw = 20, ph = 40;
  for (let j = 0; j < ph; j++) for (let i = -pw / 2 - 3; i < pw / 2 + 3; i++) {
    const y = m.yb - 1 - ph + j, half = j < 14 ? Math.sqrt(Math.max(0, 1 - ((14 - j) / 14) ** 2)) * (pw / 2 + 3) : pw / 2 + 3;
    if (Math.abs(i + 0.5) > half) continue;
    const inner = Math.abs(i + 0.5) < half - 3;
    c.set(cx + i, y, inner ? (j > ph - 26 ? tone(look.wood, 1.6 + ((i + 20) % 4 === 3 ? -1 : 0)) : mix(OUT, G[1], 0.25)) : i < 0 ? S[4] : S[2]);
  }
  c.rect(cx, m.yb - 26, 1, 25, OUT);
  // контрфорсы с пинаклями: выступают из фасада (светлая грань слева, тень справа)
  for (const bx of [m.fx0 + 3, Math.round(m.fx0 + (m.fx1 - m.fx0) * 0.3), Math.round(m.fx0 + (m.fx1 - m.fx0) * 0.7), m.fx1 - 3]) {
    const tyy = m.wy0 - 10;
    for (let y = tyy; y < m.yb; y++) { for (let i = 0; i < 6; i++) c.set(bx - 3 + i, y, tone(S, i < 2 ? 4.2 : i > 4 ? 1.4 : 3)); for (let i = 3; i < 6; i++) darken(c, bx + i, y, 0.68); }
    c.poly([[bx - 3, tyy], [bx + 3, tyy], [bx, tyy - 14]], (x) => (x < bx ? S[4] : S[2]));
    c.set(bx, tyy - 15, look.trim[4]);
  }
  c.outline(OUT);
  return c;
}

/** Хижина поселения 96: стены-плетень под глиной или доски, соломенная кровля, поленница у стены. */
export function hut(look: Look, wear: Wear = "clean", seed = 1): PC {
  const c = house(look, { w: 96, wallH: 44, roofH: 36, roofKind: look.faction === "umb" ? "shingle" : "thatch", wall: look.faction === "umb" ? "plank" : "timber", hip: true, windows: 2, door: "plain", boarded: look.faction === "umb", flowers: look.faction === "sol", roof: 0, depth: 14 }, wear, seed);
  const m = META.get(c)!;
  for (let k = 0; k < 3; k++) for (let i = 0; i < 4 - k; i++) { const lx = m.fx0 + 1 + i * 5 + k * 2, ly = m.yb - 5 - k * 4; c.ellipse(lx + 2, ly + 2, 2.4, 2.2, look.wood[2]); c.ellipse(lx + 2, ly + 2, 1.2, 1.2, mix(look.wood[4], hex("#e8d0a8"), 0.4)); }
  return c;
}

/** Каталог зданий по стилю: id → (износ, seed) → кадр. */
export function buildingsFor(look: Look): Record<string, (wear: Wear, seed: number) => PC> {
  const f = look.faction, t = look.tier;
  if (t === "settle") return {
    hut: (w, s) => hut(look, w, s),
    hut_wide: (w, s) => house(look, { w: 128, wallH: 46, roofH: 42, roofKind: f === "umb" ? "shingle" : "thatch", wall: f === "umb" ? "plank" : "timber", windows: 2, door: "plain", chimney: true, boarded: f === "umb", flowers: f === "sol", roof: 1 }, w, s),
    shed_shop: (w, s) => house(look, { w: 96, wallH: 46, roofH: 30, roofKind: "shingle", wall: "plank", windows: 0, door: "double", shop: f === "sol" ? "potion" : "coin", roof: 1, depth: 12 }, w, s),
  };
  if (t === "fort") return {
    barracks: (w, s) => house(look, { w: 128, wallH: 48, roofH: 40, roofKind: "shingle", wall: "stone", windows: 4, door: "plain", chimney: true, porch: true }, w, s),
    armory: (w, s) => house(look, { w: 128, wallH: 52, roofH: 46, roofKind: "slate", wall: "stone", hip: true, windows: 2, door: "double", roof: 1, shop: "sword" }, w, s),
    command: (w, s) => house(look, { w: 128, wallH: 52, roofH: 52, roofKind: "slate", wall: "stone", frontGable: true, windows: 2, door: "arch", roof: 1, porch: true }, w, s),
  };
  if (f === "sol") return {
    house: (w, s) => house(look, { w: 128, wallH: 54, roofH: 46, roofKind: "tile", wall: "stone", windows: 2, door: "arch", flowers: true, chimney: true, porch: true, bay: true }, w, s),
    house_hip: (w, s) => house(look, { w: 128, wallH: 54, roofH: 48, roofKind: "slate", wall: "stone", hip: true, windows: 2, door: "arch", flowers: true, dormer: true, roof: 2 }, w, s),
    shop: (w, s) => house(look, { w: 128, wallH: 54, roofH: 44, roofKind: "tile", wall: "stone", windows: 2, door: "double", shop: "coin", chimney: true }, w, s),
    temple: (w, s) => solTemple(look, w, s),
    church: (w, s) => solChurch(look, w, s),
  };
  if (f === "umb") return {
    house: (w, s) => house(look, { w: 128, wallH: 56, roofH: 58, roofKind: "slate", wall: "stone", frontGable: true, windows: 2, door: "arch", porch: true }, w, s),
    house_hip: (w, s) => house(look, { w: 128, wallH: 54, roofH: 52, roofKind: "slate", wall: "stone", hip: true, windows: 2, door: "arch", roof: 1, chimney: true, bay: true, porch: true }, w, s),
    shop: (w, s) => house(look, { w: 128, wallH: 54, roofH: 48, roofKind: "slate", wall: "stone", windows: 2, door: "double", shop: "potion" }, w, s),
    temple: (w, s) => umbTemple(look, w, s),
    ziggurat: (w, s) => umbZiggurat(look, w, s),
  };
  return {
    house: (w, s) => house(look, { w: 128, wallH: 54, roofH: 46, roofKind: "tile", wall: "timber", windows: 2, door: "plain", chimney: true, porch: true, bay: true }, w, s),
    house_b: (w, s) => house(look, { w: 128, wallH: 54, roofH: 50, roofKind: "tile", wall: "stone", hip: true, windows: 2, door: "arch", roof: 0, chimney: true, dormer: true }, w, s),
    tavern: (w, s) => house(look, { w: 224, wallH: 84, roofH: 60, roofKind: "tile", wall: "timber", windows: 4, door: "double", upper: true, chimney: true, dormer: true, shop: "mug", depth: 20, porch: true }, w, s),
    bank: (w, s) => house(look, { w: 192, wallH: 72, roofH: 56, roofKind: "slate", wall: "stone", hip: true, windows: 4, door: "double", roof: 1, shop: "coin", depth: 18, porch: true }, w, s),
    forge: (w, s) => forge(look, w, s),
  };
}

/** Кузня Эмберхолла 160: мастерская с открытым горном и отсветом, большая труба. */
export function forge(look: Look, wear: Wear = "clean", seed = 1): PC {
  const c = house(look, { w: 160, wallH: 56, roofH: 46, roofKind: "slate", wall: "stone", windows: 1, door: "plain", roof: 1, chimney: false, depth: 18 }, wear, seed);
  const m = META.get(c)!, yb = m.yb, wy0 = m.wy0, x0 = m.fx0 + 6;
  for (let y = wy0 + 9; y < yb - 2; y++) for (let x = x0; x < x0 + 50; x++) c.set(x, y, mix(OUT, look.glass[1], Math.max(0, 0.35 - Math.hypot(x - x0 - 22, y - (yb - 14)) / 60)));
  c.rect(x0 + 10, yb - 22, 26, 18, look.stone[2]); c.rect(x0 + 10, yb - 22, 26, 2, look.stone[4]);
  c.ellipse(x0 + 23, yb - 22, 9, 3, look.glass[1]); c.ellipse(x0 + 23, yb - 23, 6, 2, look.glass[2]);
  c.rect(x0 + 38, yb - 12, 10, 4, hex("#45434f")); c.rect(x0 + 41, yb - 8, 4, 6, hex("#2a2834"));
  for (const px of [x0 - 2, x0 + 50]) for (let y = wy0 + 7; y < yb - 2; y++) for (let i = 0; i < 4; i++) c.set(px + i, y, tone(look.wood, 1.5 + i * 0.5));
  chimney(c, look, x0 + 16, m.ye - 46 - 30, 52);
  return c;
}

// ---------------- здания с входом (задача 141: интерьер — следующий шаг) ----------------
/** Парадная дверь с входом: высокий проём по росту героя, свет изнутри в окне-фрамуге и по щелям, богатый наличник, порог, два фонаря.
 *  cx — середина двери, yb — низ (порог). */
function grandDoor(c: PC, look: Look, cx: number, yb: number, w: number, h: number, glow: RGBA, glow2: RGBA) {
  const T = look.trim, S = look.stone, x0 = cx - Math.floor(w / 2);
  // ореол света вокруг проёма
  for (let j = -6; j < h + 2; j++) for (let i = -6; i < w + 6; i++) {
    const d = Math.hypot((i - w / 2) / (w / 2 + 6), (j - h * 0.6) / (h * 0.7));
    if (d < 1) tint(c, x0 + i, yb - h + j, glow, 0.18 * (1 - d));
  }
  // наличник: светлая кромка, золото/оковка
  for (let j = -3; j < h; j++) for (const [dx, col] of [[-3, S[5]], [-2, T[3]], [-1, T[1]], [w, T[1]], [w + 1, T[2]], [w + 2, S[1]]] as const) {
    const y = yb - h + j;
    if (j < w / 2 + 1) { const t = Math.max(0, w / 2 + 1 - j) / (w / 2 + 1); if (t > 0.98) continue; }
    c.set(x0 + dx, y, col);
  }
  for (let a = 0; a <= 48; a++) { const t = (a / 48) * Math.PI; for (const [r, col] of [[w / 2 + 2.5, T[3]], [w / 2 + 3.5, S[5]], [w / 2 + 1.5, T[1]]] as const) c.set(Math.round(cx - 0.5 - Math.cos(t) * r), Math.round(yb - h + w / 2 - Math.sin(t) * r), col); }
  // створки и фрамуга со светом
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const y = yb - h + j;
    if (j < w / 2) { const dx = i + 0.5 - w / 2, dy = j - w / 2; if (dx * dx + dy * dy > (w / 2) ** 2) continue; }
    let col: RGBA;
    if (j < w / 2 + 2) col = j < w / 2 - 2 ? glow2 : glow; // фрамуга
    else { const f = i % 4; col = tone(look.wood, 2.1 + (f === 3 ? -1 : f === 0 ? 0.4 : 0) + (look.faction === "umb" ? -0.6 : 0)); }
    if (j === w / 2 + 2) col = T[2];
    if (i === Math.floor(w / 2) && j > w / 2 + 2) col = mix(glow, OUT, 0.35); // щель между створками светится
    if ((j === Math.floor(h * 0.62) || j === h - 6) && j > w / 2 + 2) col = T[2];
    c.set(x0 + i, y, col);
  }
  for (const d of [-3, 2]) { c.ellipse(cx + d + 0.5, yb - Math.floor(h * 0.45), 1.6, 1.6, T[3]); c.set(cx + d, yb - Math.floor(h * 0.45), OUT); }
  for (let i = -1; i < w + 1; i++) c.set(x0 + i, yb - 1, mix(glow, T[1], 0.5)); // свет из-под порога
  // порог и две ступени
  for (const [k, half] of [[0, w / 2 + 5], [1, w / 2 + 8], [2, w / 2 + 11]] as const) for (let x = Math.round(cx - half); x < cx + half; x++) { c.set(x, yb + k * 2, S[5 - k]); c.set(x, yb + k * 2 + 1, S[2 - Math.min(1, k)]); }
  for (const lx of [x0 - 10, x0 + w + 5]) { lantern(c, look, lx, yb - h + 6); for (let k = 0; k < 4; k++) tint(c, lx + 3, yb - h + 10 + k, glow2, 0.3); }
}

/** Храм Солнца Аурелиона (вход в интерьер): храм с куполом и портиком, парадная дверь с тёплым светом изнутри. */
export function solChurch(look: Look, wear: Wear = "clean", seed = 1): PC {
  const c = solTemple(look, wear, seed);
  const m = META.get(c)!;
  grandDoor(c, look, Math.round((m.fx0 + m.fx1) / 2), m.yb - 1, 18, 34, hex("#ffcf6a"), hex("#fff2c0"));
  return c;
}

/** Зиккурат Мортхейма (вход в интерьер): ступенчатая тёмная пирамида в четыре яруса с боковой гранью в тени, полосами рун,
 *  жаровней фиолетового огня на вершине и порталом с фиолетовым светом изнутри. 128 px (след 4×3). */
export function umbZiggurat(look: Look, wear: Wear = "clean", seed = 1): PC {
  const S = look.stone, G = look.glass, W = 128, H = 230, c = new PC(W, H);
  const yb = H - 9, D = 14, K = 8;
  const face = masonryTile(look, "gothic", seed + 3), big = masonryTile(look, "block", seed + 4);
  // тень на земле
  shadowBox(c, 8, 104, yb, [D, -K], 150);
  const tiers = [[6, 104, 40], [18, 92, 34], [30, 80, 30], [40, 70, 26]] as const;
  let y = yb;
  tiers.forEach(([x0, x1, h], ti) => {
    const top = y - h;
    // верхняя площадка яруса (видна полосой: свет сверху)
    for (let j = 0; j < K; j++) { const sh = Math.round(((j + 0.5) / K) * D); for (let x = x0 + sh; x < x1 + sh + 1; x++) c.set(x, top - j, tone(S, 3.6 - j * 0.12 + (pnoise(x, j, 3, 64, seed) - 0.5) * 0.6)); } // сдвиг по глубине D/K — верх совпадает с правой гранью (без обрезанного вертикального края)
    // боковая грань в тени
    for (let i = 0; i < D; i++) { const off = Math.round(((i + 0.5) / D) * K); for (let yy = top - off; yy < y - off; yy++) c.set(x1 + i, yy, shade(tex(big, x1 + i, yy + off), 0.52 - i * 0.008)); }
    // лицевая грань
    fillTex(c, ti === 0 ? big : face, x0, top, x1 - x0, h, 0, ti * 7, (xx, yy) => (yy < 2 ? 0.7 : 1 - (yy / h) * 0.12) * (xx < 1 ? 1.15 : 1));
    for (let x = x0; x < x1; x++) { c.set(x, top, S[5]); darken(c, x, top + 1, 0.8); }
    // пояс рун со свечением
    if (ti < 3) for (let x = x0 + 4; x < x1 - 4; x += 6) { const ry = top + Math.round(h * 0.45); c.set(x, ry, G[1]); c.set(x + 1, ry - 1, G[2]); c.set(x + 2, ry, G[1]); tint(c, x + 1, ry + 1, G[1], 0.3); }
    y = top - K + 2;
  });
  // святилище на вершине с жаровней фиолетового огня
  const sx = 55 + 7, sTop = y - 4;
  c.rect(sx - 12, sTop - 6, 24, 8, S[2]); c.rect(sx - 12, sTop - 6, 24, 1, S[5]); c.rect(sx + 8, sTop - 6, 4, 8, S[1]);
  c.poly([[sx - 9, sTop - 6], [sx + 9, sTop - 6], [sx + 6, sTop - 14], [sx - 6, sTop - 14]], (x) => (x < sx ? look.trim[3] : look.trim[1]));
  c.poly([[sx - 6, sTop - 14], [sx - 3, sTop - 26], [sx, sTop - 19], [sx + 2, sTop - 34], [sx + 4, sTop - 21], [sx + 6, sTop - 14]], (_x, yy) => (yy < sTop - 24 ? G[2] : yy < sTop - 18 ? hex("#c890ff") : G[1]));
  c.poly([[sx - 3, sTop - 14], [sx, sTop - 22], [sx + 3, sTop - 14]], hex("#f4e4ff"));
  // портал у подножия (дверь — середина фасада нижнего яруса, клетка 1 от левого края следа)
  const cx = 55, pw = 22, ph = 40, pyb = yb - 1;
  for (let j = 0; j < ph; j++) for (let i = -pw / 2 - 4; i < pw / 2 + 4; i++) {
    const yy = pyb - ph + j, half = j < 14 ? Math.sqrt(Math.max(0, 1 - ((14 - j) / 14) ** 2)) * (pw / 2 + 4) : pw / 2 + 4;
    if (Math.abs(i + 0.5) > half) continue;
    c.set(cx + i, yy, i < 0 ? S[4] : S[2]);
  }
  grandDoor(c, look, cx, pyb, 16, 34, G[1], G[2]);
  // жаровни по бокам входа
  for (const bx of [cx - 26, cx + 22]) {
    c.rect(bx, yb - 12, 6, 12, S[1]); c.rect(bx - 1, yb - 13, 8, 2, look.trim[2]);
    c.poly([[bx, yb - 13], [bx + 2, yb - 21], [bx + 3, yb - 16], [bx + 5, yb - 22], [bx + 6, yb - 13]], (_x, yy) => (yy < yb - 17 ? G[2] : G[1]));
  }
  c.outline(OUT);
  if (wear === "moss") mossPatch(c, 0, yb - 60, W, 60, look, seed, false);
  META.set(c, { fx0: 6, fx1: 104, D, K, wy0: yb - 40, yb, ye: yb - 40 });
  return c;
}
