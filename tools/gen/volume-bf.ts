/**
 * Объёмные объекты Полей вечных битв (bf_*): шатры, шатры командиров, осадная башня, таран, рогатки, стойка щитов, стол с картой,
 * разбитые повозки. Заменяют плоские версии из bf-gen.ts / bf-gen2.ts (те же id, размеры и следы на карте).
 * Основа — tools/gen/volume-lib.ts (вид 3/4, свет сверху-слева, правая грань в тени, тень у основания).
 */
import {
  PC, hash01, hex, mix, withA, type RGBA, type Ramp, type N3, type Tex,
  CLOTH, WOOD, WOOD_D, IRON, LEATHER, ROPE, STONE, OUT, FRONT, TOP, RIGHT,
  box, prism, face, fillPoly, cylV, ellipseFace, log, cone, shadowPoly, shadowEllipse, wheel3, depth, litC, planksV, planksH, grain, addTex, noTex, finish, tone,
} from "./volume-lib";

type Pt = [number, number];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
/** Координаты точки p в базисе (e, f) от начала o. */
function coords(o: Pt, e: Pt, f: Pt, p: Pt): [number, number] {
  const d = e[0] * f[1] - e[1] * f[0], q = sub(p, o);
  return [(q[0] * f[1] - q[1] * f[0]) / d, (e[0] * q[1] - e[1] * q[0]) / d];
}
const HIDE = [hex("#1e1a16"), hex("#352d24"), hex("#51463a"), hex("#6e6250"), hex("#8c806a")];
const DARK: RGBA = hex("#0c0910");
const EMBER = [hex("#5a140c"), hex("#a02a10"), hex("#e05412"), hex("#ff9a2a"), hex("#ffe07a")];
const CHAR = [hex("#100d10"), hex("#1c1719"), hex("#2a2325"), hex("#3a3133"), hex("#4c4244")];

// ---------------- шатёр двускатный (3×2) ----------------
export interface TentOpt { a: Ramp; b: Ramp; trim: Ramp; flag?: Ramp; torn?: boolean; burnt?: boolean; seed: number; stripes?: number; w?: number; h?: number; d?: number }
/** Двускатный шатёр: фасад-фронтон к зрителю (полосы, вход с отвёрнутыми полами), правый скат уходит вглубь в тени,
 *  конёк-жердь, подол-кайма, растяжки и колья; порванный — дыры с каркасом; сгоревший — угольный, просевший конёк, жар. */
export function ridgeTent(o: TentOpt): PC {
  const W = o.w ?? 56, H = o.h ?? 44, Dd = o.d ?? 28;
  const pc = new PC(W + 44, H + Dd + 22), x0 = 12, B = pc.h - 6;
  const D = depth(Dd), sag = o.burnt ? 14 : 0;
  const L: Pt = [x0, B], R: Pt = [x0 + W, B], A: Pt = [x0 + W / 2, B - H + sag];
  const A2 = add(A, D), R2 = add(R, D);
  const a = o.burnt ? CHAR : o.a, b = o.burnt ? CHAR : o.b, trim = o.burnt ? CHAR : o.trim;
  const stripes = o.stripes ?? 6, sw = W / stripes;
  // тень на землю вправо-вниз
  shadowPoly(pc, [[x0 - 2, B + 1], [R[0] + 6, B + 4], [R2[0] + 12, R2[1] + 6], [R2[0], R2[1]], R]);
  // растяжки за шатром (правые) — до ската
  const peg = (px: number, py: number) => { log(pc, px, py, px + 1, py - 5, 1.1, WOOD, { end: null }); };
  peg(R2[0] + 8, R2[1] + 3); fillLine(pc, A2[0], A2[1] + 6, R2[0] + 8, R2[1] - 1, ROPE[1]);
  // правый скат: полосы вдоль ската (от конька к карнизу), повтор по глубине
  const e = sub(R, A); // вниз по скату
  const slopeN: N3 = (() => { const l = Math.hypot(H - sag, W / 2); return [(H - sag) / l, (W / 2) / l, 0]; })();
  fillPoly(pc, [A, R, R2, A2], (x, y) => {
    const [s, t] = coords(A, e, D, [x + 0.5, y + 0.5]);
    const band = Math.floor(t * Dd / sw) % 2;
    let off = (hash01(x, y, o.seed) - 0.5) * 0.25 + (s < 0.08 ? 0.4 : 0) + (s > 0.9 ? -0.5 : 0);
    off += Math.sin(t * Math.PI * 3) * 0.25 - 0.35; // провисание полотна между дугами
    return litC(band ? b : a, slopeN, off);
  });
  // кайма по карнизу ската (толщина)
  fillLine(pc, R[0], R[1] - 1, R2[0], R2[1] - 1, litC(trim, slopeN, -0.4), 2);
  // фасад-фронтон: полосы, светлее у верха, фаска по скатам
  fillPoly(pc, [L, A, R], (x, y) => {
    const k = Math.floor((x - x0) / sw) % 2, f = (B - y) / (H - sag);
    let off = f * 0.5 - 0.15 + (hash01(x, y, o.seed + 1) - 0.5) * 0.2;
    // складки: от вершины к низу, три мягких
    const u = (x - A[0]) / Math.max(1, (B - y) * (W / 2) / (H - sag));
    off += Math.cos(u * Math.PI * 3) * 0.18;
    return litC(k ? b : a, FRONT, off);
  });
  // кромки фронтона (обшивка) и подол
  fillLine(pc, L[0], L[1], A[0], A[1], litC(trim, FRONT, 0.6));
  fillLine(pc, A[0], A[1], R[0], R[1], litC(trim, FRONT, -0.3));
  for (let x = L[0]; x < R[0]; x++) { pc.set(x, B - 1, litC(trim, FRONT, 0)); pc.set(x, B - 2, litC(trim, FRONT, 0.5)); }
  // вход: тёмный клин с глубиной и отвёрнутые полы
  if (!o.burnt) {
    const dw = W * 0.34, dh = (H - sag) * 0.62, cx = A[0];
    fillPoly(pc, [[cx - dw / 2, B - 1], [cx, B - dh], [cx + dw / 2, B - 1]], (x, y) => mix(DARK, a[0], Math.max(0, (y - (B - dh)) / dh) * 0.35));
    fillPoly(pc, [[cx - dw / 2 - 1, B - 1], [cx - 2, B - dh + 3], [cx - dw / 2 + 4, B - 1]], (x, y) => litC(trim, FRONT, 0.4));
    fillPoly(pc, [[cx + dw / 2 + 1, B - 1], [cx + 2, B - dh + 3], [cx + dw / 2 - 4, B - 1]], (x, y) => litC(trim, FRONT, -0.6));
    pc.set(Math.round(cx), Math.round(B - dh * 0.55), litC(IRON, FRONT, 1)); // застёжка
  }
  // порванный: дыры с видом на каркас, болтающиеся лоскуты, зубчатый подол
  if (o.torn) {
    for (const [fx, fy, s] of [[-0.22, 0.4, 7], [0.24, 0.3, 6]] as const) {
      const hx = A[0] + fx * W, hy = B - (H - sag) * fy;
      fillPoly(pc, [[hx - s / 2, hy + s * 0.8], [hx, hy - s / 2], [hx + s / 2, hy + s * 0.5], [hx + 1, hy + s]], () => DARK);
      fillLine(pc, hx - 1, hy - s / 2 + 1, hx - 1, hy + s - 1, WOOD[1]);
      fillLine(pc, hx + s / 2, hy + s * 0.5, hx + s / 2 + 2, hy + s + 3, litC(a, FRONT, -0.3));
    }
    // на скате
    for (const [s0, t0] of [[0.35, 0.3], [0.6, 0.7]] as const) {
      const p = add(add(A, [e[0] * s0, e[1] * s0]), [D[0] * t0, D[1] * t0]);
      fillPoly(pc, [[p[0] - 3, p[1] - 2], [p[0] + 3, p[1] - 4], [p[0] + 4, p[1] + 2], [p[0] - 1, p[1] + 3]], () => DARK);
    }
    for (let x = L[0] + 3; x < R[0] - 5; x += 8) fillPoly(pc, [[x, B], [x + 4, B], [x + 2, B - 4]], () => withA(DARK, 0));
    for (let x = L[0] + 3; x < R[0] - 5; x += 8) for (let k = 0; k < 3; k++) for (let j = 0; j <= k; j++) pc.clear(x + 1 + j, B - 1 - (2 - k));
  }
  // сгоревший: проломы с жаром, сажа
  if (o.burnt) {
    for (let i = 0; i < 8; i++) {
      const hx = Math.round(A[0] + (hash01(i, 1, o.seed) - 0.5) * W * 0.7), hy = Math.round(B - (H - sag) * (0.15 + hash01(i, 2, o.seed) * 0.45));
      pc.set(hx, hy, EMBER[3]); pc.set(hx + 1, hy, EMBER[2]); pc.set(hx, hy + 1, EMBER[1]);
      if (i % 2) { pc.set(hx - 1, hy, EMBER[4]); pc.set(hx + 2, hy + 1, EMBER[0]); }
    }
    for (let i = 0; i < 4; i++) { const p = add(add(A, [e[0] * (0.3 + i * 0.15), e[1] * (0.3 + i * 0.15)]), [D[0] * hash01(i, 5, 1), D[1] * hash01(i, 5, 1)]); pc.set(Math.round(p[0]), Math.round(p[1]), EMBER[2 + (i % 2)]); }
    // обрушенная середина конька
    fillPoly(pc, [[A[0] - 5, A[1] + 1], [A[0] - 1, A[1] - 3], [A[0] + 3, A[1] + 2], [A[0] + 7, A[1] - 1], [A[0] + 9, A[1] + 6], [A[0] - 8, A[1] + 6]], () => DARK);
    log(pc, A[0] - 4, A[1] + 2, A[0] - 16, A[1] + 15, 1.3, CHAR, { end: null });
  }
  // конёк: жердь с торцом
  log(pc, A[0] - 1, A[1] - 1, A2[0] + 1, A2[1] - 1, 1.3, o.burnt ? CHAR : WOOD, { end: o.burnt ? null : WOOD });
  // флагшток и вымпел на переднем коньке
  if (o.flag && !o.burnt) {
    log(pc, A[0], A[1] + 1, A[0], A[1] - 13, 1, WOOD, { end: null });
    fillPoly(pc, [[A[0] - 1, A[1] - 13], [A[0] - 13, A[1] - 10.5], [A[0] - 10, A[1] - 9], [A[0] - 13, A[1] - 7], [A[0] - 1, A[1] - 7.5]], (x) => litC(o.flag!, FRONT, x < A[0] - 8 ? -0.5 : 0.3));
    pc.set(A[0], A[1] - 14, litC(CLOTH.gold, TOP, 0));
  }
  // передние растяжки и колья
  peg(L[0] - 7, B + 1); fillLine(pc, L[0] + 4, B - (H - sag) * 0.3, L[0] - 7, B - 4, ROPE[2]);
  peg(R[0] + 6, B + 2); fillLine(pc, R[0] - 4, B - (H - sag) * 0.3, R[0] + 6, B - 3, ROPE[1]);
  return finish(pc);
}
/** Линия пикселями заданного цвета (толщина w). */
function fillLine(pc: PC, x0: number, y0: number, x1: number, y1: number, c: RGBA, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    for (let k = 0; k < w; k++) pc.set(Math.floor(x), Math.floor(y) + k, c);
  }
}

// ---------------- шатёр командира: круглый павильон (4×2) ----------------
export function pavilion(o: { a: Ramp; b: Ramp; trim: Ramp; flag: Ramp; seed: number }): PC {
  const r = 44, pc = new PC(r * 2 + 30, 116), cx = r + 10, wallTop = 66, wallBot = 96, ry = 15;
  shadowEllipse(pc, cx + 10, wallBot + 6, r + 8, ry + 2, 85);
  // стена: цилиндр с полосами
  const bands = 10;
  for (let y = wallTop; y <= wallBot + ry; y++) for (let x = cx - r; x <= cx + r; x++) {
    const u = (x + 0.5 - cx) / r;
    if (Math.abs(u) > 1) continue;
    const c = Math.sqrt(1 - u * u);
    if (y + 0.5 > wallBot + ry * c) continue;
    const phi = Math.asin(u), band = Math.floor(((phi + Math.PI / 2) / Math.PI) * bands) % 2;
    let off = -0.35 + (hash01(x, y, o.seed) - 0.5) * 0.2 - (wallBot + ry * c - y < 3 ? 0.5 : 0) - (y - wallTop < 5 ? 0.6 : 0);
    off += Math.cos(phi * bands * 2) * 0.15;
    pc.set(x, y, litC(band ? o.b : o.a, [u, 0, c], off));
  }
  // подол-кайма по низу стены
  for (let x = cx - r; x <= cx + r; x++) { const u = (x + 0.5 - cx) / r; if (Math.abs(u) > 1) continue; const c = Math.sqrt(1 - u * u), yb = Math.floor(wallBot + ry * c); for (let k = 0; k < 2; k++) pc.set(x, yb - k, litC(o.trim, [u, 0, c], k ? 0.3 : -0.3)); }
  // вход: тёмный проём с подвязанными полами
  const dw = 16, dTop = wallTop + 4;
  for (let y = dTop; y <= wallBot + ry - 1; y++) for (let x = cx - dw / 2; x < cx + dw / 2; x++) {
    const u = (x + 0.5 - cx) / r, yb = wallBot + ry * Math.sqrt(1 - u * u);
    const arch = dTop + Math.abs(x + 0.5 - cx) * 0.9;
    if (y + 0.5 < arch || y + 0.5 > yb - 1) continue;
    pc.set(x, y, mix(DARK, o.a[0], ((y - dTop) / 40) * 0.5));
  }
  for (const s of [-1, 1]) {
    const fx = cx + s * (dw / 2 + 1);
    fillPoly(pc, [[fx - s * 2, dTop - 2], [fx + s * 4, dTop - 2], [fx + s * 3, wallBot + ry - 3], [fx - s * 1, wallBot + ry - 4]], (x, y) => litC(o.trim, FRONT, s < 0 ? 0.3 : -0.5));
    pc.set(fx + s, Math.round((dTop + wallBot) / 2 + 6), litC(CLOTH.gold, FRONT, 1)); // подвязка
  }
  // крыша: конус с полосами, свес шире стены
  const rr = r + 6, rry = ry + 3, base = wallTop + 2, h = 52;
  // толщина свеса: нижняя кромка
  for (let x = cx - rr; x <= cx + rr; x++) { const u = (x + 0.5 - cx) / rr; if (Math.abs(u) > 1) continue; const c = Math.sqrt(1 - u * u), yb = base + rry * c; for (let k = 0; k < 3; k++) pc.set(x, Math.floor(yb + k), litC(o.trim, [u, -0.3, c], -0.8 - k * 0.3)); }
  cone(pc, cx, base, rr, rry, h, o.a, o.b, 12, o.seed, -0.7);
  // фестоны (зубцы-лепестки) по краю свеса
  for (let i = -8; i <= 8; i++) {
    const u = i / 8.8, c = Math.sqrt(Math.max(0, 1 - u * u)), x = cx + u * rr, y = base + rry * c + 2;
    ellipseFace(pc, x, y, 2.6, 2.6, i % 2 ? o.trim : o.b, [u * 0.6, -0.2, 1]);
  }
  // кант по шву свес/стена
  for (let x = cx - rr; x <= cx + rr; x++) { const u = (x + 0.5 - cx) / rr; if (Math.abs(u) > 1) continue; const c = Math.sqrt(1 - u * u); pc.set(x, Math.floor(base + rry * c), litC(o.trim, [u, 0.3, c], 0.6)); }
  // навершие: шар, шпиль, флаг
  const ay = base - h;
  log(pc, cx, ay + 4, cx, ay - 14, 1.1, WOOD, { end: null });
  ellipseFace(pc, cx, ay + 1, 3, 3, CLOTH.gold, [-0.4, 0.5, 0.8]);
  fillPoly(pc, [[cx + 1, ay - 14], [cx + 17, ay - 11], [cx + 13, ay - 9], [cx + 17, ay - 6], [cx + 1, ay - 7]], (x) => litC(o.flag, FRONT, x > cx + 10 ? -0.6 : 0.3));
  pc.set(cx, ay - 15, litC(CLOTH.gold, TOP, 0));
  // колья-растяжки по бокам
  for (const s of [-1, 1]) { const px = cx + s * (rr + 6); fillLine(pc, cx + s * (rr - 2), base + 6, px, wallBot + 4, ROPE[s < 0 ? 2 : 1]); log(pc, px, wallBot + 6, px + 1, wallBot, 1.1, WOOD, { end: null }); }
  return finish(pc);
}

const SOL_A = CLOTH.white, SOL_B = CLOTH.gold, UMB_A = CLOTH.black, UMB_B = CLOTH.purple;
export const TENTS3: Record<string, () => PC> = {
  bf_tent_sol: () => ridgeTent({ a: SOL_A, b: SOL_B, trim: CLOTH.gold, flag: CLOTH.blue, seed: 11 }),
  bf_tent_umb: () => ridgeTent({ a: UMB_A, b: UMB_B, trim: CLOTH.purple, flag: CLOTH.purple, seed: 13 }),
  bf_tent_torn: () => ridgeTent({ a: CLOTH.rag, b: CLOTH.brown, trim: CLOTH.rag, torn: true, seed: 15 }),
  bf_tent_burnt: () => ridgeTent({ a: CLOTH.rag, b: CLOTH.brown, trim: CLOTH.rag, burnt: true, seed: 16 }),
  bf_tent_sol_cmd: () => pavilion({ a: SOL_A, b: SOL_B, trim: CLOTH.gold, flag: CLOTH.blue, seed: 12 }),
  bf_tent_umb_cmd: () => pavilion({ a: UMB_A, b: UMB_B, trim: CLOTH.purple, flag: CLOTH.purple, seed: 14 }),
};

// ---------------- осадная башня (3×2) ----------------
function siegeTower3(): PC {
  const pc = new PC(96, 150), x = 18, w = 44, top = 40, bot = 134, d = 22, D = depth(d);
  shadowPoly(pc, [[x - 2, bot + 2], [x + w + 4, bot + 6], [x + w + D[0] + 14, bot + D[1] + 8], [x + w + D[0], bot + D[1]]], 85);
  const front = { r: WOOD, tex: addTex(planksV(6, 3), grain(4, 0.15)) };
  const side = { r: WOOD, tex: planksV(5, 5) };
  box(pc, x, top, w, bot - top, d, front, side, { r: WOOD, tex: planksH(4, 6) });
  // шкуры по ярусам (с нахлёстом) и железные полосы
  for (const [y, h] of [[52, 30], [92, 30]] as const) {
    box(pc, x + 3, y, w - 6, h, 2, { r: HIDE, tex: addTex(grain(9, 0.3, 4), (xx, yy) => (yy - y) % 10 === 0 ? -0.6 : 0) }, { r: HIDE }, { r: HIDE });
    for (let k = x + 7; k < x + w - 5; k += 8) { pc.set(k, y + 2, litC(IRON, FRONT, 1.2)); pc.set(k, y + h - 3, litC(IRON, FRONT, 0.6)); }
  }
  for (const y of [top + 2, 88, 128]) band(pc, x, y, w, 3, d, IRON);
  // бойницы
  for (const bx of [x + 10, x + 28]) { pc.rect(bx, 70, 5, 2, DARK); pc.rect(bx + 1, 110, 4, 2, DARK); }
  // ворот у правого бока: лестница по боковой грани
  for (let k = 0; k < 2; k++) { const rx = x + w + 3 + k * 5; fillLineD(pc, rx, top + 14 - k * 4, rx, bot - 4 - k * 4, litC(WOOD, RIGHT, 0.4)); }
  for (let y = top + 18; y < bot - 6; y += 8) fillLineD(pc, x + w + 3, y, x + w + 8, y - 4, litC(WOOD, RIGHT, 0.9));
  // площадка: свес шире короба, зубцы по правому (дальние раньше) и переднему краю
  const px = x - 5, pw = w + 10, py = top - 10, Dp = depth(d + 4);
  box(pc, px, py, pw, 10, d + 4, { r: WOOD, tex: planksV(5, 8) }, { r: WOOD, tex: planksV(4, 9) }, { r: WOOD, tex: planksH(3, 10) });
  for (let i = 3; i >= 1; i--) { const t = i / 4; box(pc, Math.round(px + pw + Dp[0] * t) - 4, Math.round(py + Dp[1] * t) - 8, 4, 8, 3, { r: WOOD, tex: planksV(4, 20 + i) }, { r: WOOD }, { r: WOOD }); }
  for (let i = 0; i < 5; i++) { const mx = px + i * 11; box(pc, mx, py - 9, 7, 10, 3, { r: WOOD, tex: planksV(4, 11 + i) }, { r: WOOD }, { r: WOOD }); }
  // цепи откидного мостика к верху передних зубцов
  fillLineD(pc, px + 3, py - 9, x + 8, top + 6, litC(IRON, FRONT, 0.6)); fillLineD(pc, px + pw - 4, py - 9, x + w - 8, top + 6, litC(IRON, FRONT, 0));
  // колёса
  wheel3(pc, x + 9, bot + 1, 9, WOOD, IRON, { thick: 4, rot: 0.3 });
  wheel3(pc, x + w - 6, bot + 2, 9, WOOD, IRON, { thick: 4, rot: 0.1 });
  return finish(pc);
}
/** Обвязка по фасаду и правой грани ящика (без верха). */
function band(pc: PC, x: number, y: number, w: number, h: number, d: number, r: Ramp) {
  const D = depth(d);
  face(pc, [[x + w, y], [x + w + D[0], y + D[1]], [x + w + D[0], y + h + D[1]], [x + w, y + h]], r, RIGHT);
  face(pc, [[x - 1, y], [x + w, y], [x + w, y + h], [x - 1, y + h]], r, FRONT, (xx) => (xx % 9 === 0 ? 1 : 0));
}
function fillLineD(pc: PC, x0: number, y0: number, x1: number, y1: number, c: RGBA, w = 1) { fillLine(pc, x0, y0, x1, y1, c, w); }

// ---------------- таран (4×1) ----------------
function ram3(): PC {
  const pc = new PC(124, 78), x0 = 10, x1 = 98, yE = 34, dd = 26, D = depth(dd), hr = 14;
  shadowPoly(pc, [[x0 - 4, 70], [x1 + 8, 72], [x1 + D[0] + 16, 70 + D[1]], [x0 + D[0], 70 + D[1]]], 85);
  // рама-основание: два бруса (задний темнее)
  log(pc, x0 + D[0], 64 + D[1], x1 + D[0], 64 + D[1], 2.2, WOOD, { end: WOOD });
  // задние стойки
  for (const x of [x0 + 6, x0 + 34, x0 + 62, x1 - 6]) box(pc, x + D[0], yE + D[1], 4, 30, 2, { r: WOOD.map((c) => mix(c, WOOD[0], 0.4)) as Ramp }, { r: WOOD }, { r: WOOD });
  // бревно тарана на цепях, оголовок
  const ly = 48;
  for (const cxh of [x0 + 24, x0 + 62]) { fillLine(pc, cxh + D[0] / 2, yE + D[1] / 2, cxh, ly - 4, litC(IRON, FRONT, 0.5)); }
  log(pc, x0 - 2, ly, x1 + 4, ly, 4.5, WOOD, { end: null });
  for (const bx of [x0 + 22, x0 + 60]) for (let k = -4; k <= 4; k++) { pc.set(bx, ly + k, litC(IRON, [0, -k / 4.5, 1], 0)); pc.set(bx + 1, ly + k, litC(IRON, [0, -k / 4.5, 1], -0.3)); }
  // оголовок-баран: железный конус-ящик
  box(pc, x1 + 2, ly - 6, 10, 12, 4, { r: IRON, tex: grain(3, 0.2) }, { r: IRON }, { r: IRON });
  fillPoly(pc, [[x1 + 12, ly - 6], [x1 + 18, ly - 2], [x1 + 18, ly + 2], [x1 + 12, ly + 6]], () => litC(IRON, [0.4, 0.2, 1], 0.2));
  for (const [rx, ry] of [[x1 + 4, ly - 4], [x1 + 9, ly - 4], [x1 + 4, ly + 3], [x1 + 9, ly + 3]]) pc.set(rx, ry, litC(IRON, TOP, 0.5));
  // передние стойки и брус
  for (const x of [x0 + 6, x0 + 34, x0 + 62, x1 - 6]) box(pc, x, yE + 2, 4, 28, 2, { r: WOOD, tex: grain(x, 0.2) }, { r: WOOD }, { r: WOOD });
  box(pc, x0, 62, x1 - x0, 4, 3, { r: WOOD, tex: planksV(14, 2) }, { r: WOOD }, { r: WOOD });
  // крыша: двускатная из шкур вдоль рамы — ближний скат светлый, правый фронтон в тени, толщина свеса
  const E1: Pt = [x0 - 4, yE], E2: Pt = [x1 + 4, yE], half: Pt = [D[0] / 2, D[1] / 2 - hr];
  const R1 = add(E1, half), R2 = add(E2, half), B2 = add(E2, D);
  face(pc, [E2, B2, R2], LEATHER, RIGHT, grain(5, 0.2)); // фронтон
  fillPoly(pc, [E1, E2, R2, R1], (x, y) => {
    const [s, t] = coords(E1, sub(E2, E1), sub(R1, E1), [x + 0.5, y + 0.5]);
    let off = (Math.floor(s * 7) % 2 ? -0.25 : 0.15) + (t > 0.9 ? 0.5 : 0) + (hash01(x, y, 4) - 0.5) * 0.3 + (Math.abs((s * 7) % 1 - 0.5) > 0.45 ? -0.6 : 0);
    return litC(LEATHER, [0, 0.7, 0.7], off);
  });
  for (let x = E1[0]; x <= E2[0]; x++) { pc.set(x, yE, litC(WOOD, FRONT, 0.2)); pc.set(x, yE + 1, litC(WOOD, FRONT, -0.4)); pc.set(x, yE + 2, litC(WOOD, FRONT, -1)); }
  log(pc, R1[0] - 2, R1[1], R2[0] + 1, R2[1], 1.6, WOOD, { end: WOOD }); // конёк
  // колёса
  wheel3(pc, x0 + 14, 66, 8, WOOD, IRON, { thick: 3, rot: 0.2 }); wheel3(pc, x1 - 10, 66, 8, WOOD, IRON, { thick: 3, rot: 0.6 });
  return finish(pc);
}

// ---------------- рогатки (2×1) ----------------
function spikeBarrier3(): PC {
  const pc = new PC(60, 40), y = 24;
  shadowPoly(pc, [[4, 33], [52, 33], [58, 28], [12, 27]], 80);
  const stake = (x: number, front: boolean) => {
    if (front) log(pc, x + 6, 34, x - 6, 10, 1.7, WOOD, { tip: 5 });
    else log(pc, x - 5, 33, x + 8, 11, 1.6, WOOD.map((c) => mix(c, WOOD[0], 0.25)) as Ramp, { tip: 5 });
  };
  for (const x of [12, 28, 44]) stake(x, false);
  log(pc, 4, y, 54, y - 3, 3.2, WOOD, { end: WOOD });
  for (const x of [12, 28, 44]) { // стяжки
    for (let k = -3; k <= 3; k++) pc.set(x, y - 1 - Math.round((x - 4) * 0.06) + k, litC(ROPE, [0, -k / 3, 1], 0));
    stake(x, true);
  }
  return finish(pc);
}

// ---------------- стойка щитов (2×1) ----------------
function shieldStand3(): PC {
  const pc = new PC(60, 46), D = depth(8);
  shadowPoly(pc, [[3, 42], [52, 42], [58, 37], [9, 37]], 80);
  // задние ноги-козлы и верхний брус с глубиной
  for (const x of [4, 48]) { log(pc, x + D[0] - 2, 42 + D[1], x + D[0] + 1, 16 + D[1], 1.4, WOOD.map((c) => mix(c, WOOD[0], 0.35)) as Ramp, { end: null }); }
  box(pc, 3, 15, 50, 3, 8, { r: WOOD, tex: grain(2, 0.2) }, { r: WOOD }, { r: WOOD, tex: planksH(2, 4) });
  box(pc, 3, 33, 50, 2, 6, { r: WOOD }, { r: WOOD }, { r: WOOD });
  // щиты: выпуклые, с ободом, умбоном и гербовой полосой
  const shield = (cx: number, cy: number, rx: number, ryy: number, base: Ramp, trim: Ramp, kite = false) => {
    // толщина обода вглубь
    for (let y = Math.floor(cy - ryy); y <= cy + ryy + 1; y++) for (let x = Math.floor(cx - rx); x <= cx + rx + 2; x++) {
      const dx = (x + 0.5 - cx - 1.5) / rx, dy = (y + 0.5 - cy + 1) / ryy;
      if (dx * dx + dy * dy <= 1) pc.set(x, y, litC(trim, RIGHT, -0.3));
    }
    for (let y = Math.floor(cy - ryy); y <= cy + ryy; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ryy;
      let d = dx * dx + dy * dy;
      if (kite) d = dx * dx + (dy > 0 ? dy * 0.8 + dx * dx * 1.4 * dy : dy * dy);
      if (d > 1) continue;
      const n: N3 = [dx * 0.7, -dy * 0.7, Math.sqrt(Math.max(0.1, 1 - d * 0.5))];
      const rim = d > 0.72;
      const bar = !rim && (Math.abs(x + 0.5 - cx) < 1.6 || (!kite && Math.abs(y + 0.5 - cy) < 1.2));
      pc.set(x, y, litC(rim || bar ? trim : base, n, rim ? 0.1 : 0));
    }
    ellipseFace(pc, cx, kite ? cy - 2 : cy, 2.2, 2.2, IRON, [-0.5, 0.5, 0.7]);
  };
  shield(16, 25, 9, 9.5, CLOTH.white, CLOTH.gold);
  shield(30, 25, 8, 10.5, CLOTH.purple, IRON, true);
  shield(44, 25, 9, 9.5, CLOTH.blue, CLOTH.gold);
  // передние ноги
  for (const x of [4, 48]) log(pc, x - 1, 42, x + 2, 16, 1.5, WOOD, { end: null });
  return finish(pc);
}

// ---------------- стол с картой (2×1) ----------------
function mapTable3(): PC {
  const pc = new PC(60, 44), x = 6, y = 20, w = 42, d = 18, D = depth(d);
  shadowPoly(pc, [[x, 41], [x + w + 2, 41], [x + w + D[0] + 6, 41 + D[1]], [x + D[0], 41 + D[1]]], 80);
  // ноги: задние, потом передние
  for (const lx of [x + 2, x + w - 5]) box(pc, lx + D[0] - 2, y + D[1] + 3, 3, 21, 2, { r: WOOD.map((c) => mix(c, WOOD[0], 0.4)) as Ramp }, { r: WOOD }, { r: WOOD });
  box(pc, x, y, w, 3, d, { r: WOOD, tex: grain(3, 0.2) }, { r: WOOD }, { r: WOOD, tex: planksH(4, 5) });
  for (const lx of [x + 2, x + w - 5]) box(pc, lx, y + 3, 3, 18, 2, { r: WOOD, tex: grain(lx, 0.2) }, { r: WOOD }, { r: WOOD });
  // карта на столешнице: параллелограмм, загнутый угол, дороги и фишки
  const o: Pt = [x + 5, y - 2], e: Pt = [w - 12, 0], f: Pt = [D[0] * 0.8, D[1] * 0.8];
  const map = [o, add(o, e), add(add(o, e), f), add(o, f)];
  fillPoly(pc, map, (px, py) => litC(CLOTH.cream, TOP, (hash01(px, py, 7) - 0.5) * 0.3 - 0.4));
  const P2 = (s: number, t: number): Pt => add(o, add([e[0] * s, e[1] * s], [f[0] * t, f[1] * t]));
  const path = (pts: [number, number][], c: RGBA) => { for (let i = 0; i + 1 < pts.length; i++) { const a = P2(...pts[i]), b = P2(...pts[i + 1]); fillLine(pc, Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), c); } };
  path([[0.05, 0.2], [0.4, 0.5], [0.7, 0.35], [0.95, 0.7]], CLOTH.red[2]);
  path([[0.1, 0.85], [0.45, 0.7], [0.8, 0.9]], CLOTH.blue[2]);
  fillPoly(pc, [P2(0.85, 0.02), P2(1, 0.02), P2(1, 0.3)], () => litC(CLOTH.cream, FRONT, -0.6)); // загнутый угол
  const piece = (s: number, t: number, r: Ramp) => { const p = P2(s, t); cylV(pc, Math.round(p[0]), Math.round(p[1]) - 3, Math.round(p[1]), 1.6, r, { k: 0.5 }); };
  piece(0.3, 0.45, CLOTH.blue); piece(0.62, 0.3, CLOTH.purple); piece(0.75, 0.75, CLOTH.blue); piece(0.2, 0.75, CLOTH.purple);
  // свеча и камень-пресс
  const c = P2(1.05, 0.85); cylV(pc, Math.round(c[0]), Math.round(c[1]) - 5, Math.round(c[1]), 1.5, CLOTH.cream, { k: 0.5 }); pc.set(Math.round(c[0]), Math.round(c[1]) - 7, hex("#ffd27a")); pc.set(Math.round(c[0]), Math.round(c[1]) - 8, hex("#fff2b8"));
  const s = P2(-0.08, 0.1); ellipseFace(pc, s[0], s[1] - 1, 3, 2.2, STONE, [-0.3, 0.8, 0.5]);
  return finish(pc);
}

// ---------------- разбитые повозки (3×1) ----------------
/** Открытый короб: передний борт, правый борт, видны внутренности (дно, задний и левый борт изнутри). */
function openBox(pc: PC, x: number, y: number, w: number, h: number, d: number, wood: Ramp) {
  const D = depth(d), t = 2;
  // наружная правая грань
  face(pc, [[x + w, y], [x + w + D[0], y + D[1]], [x + w + D[0], y + h + D[1]], [x + w, y + h]], wood, RIGHT, planksH(4, 2));
  // внутренности: дно, задний борт, левый борт изнутри
  face(pc, [[x + t, y + h - 3], [x + w - t, y + h - 3], [x + w - t + D[0], y + h - 3 + D[1]], [x + t + D[0], y + h - 3 + D[1]]], wood, TOP, (xx, yy) => planksV(5, 3)(xx, yy) - 1.6, false);
  face(pc, [[x + D[0], y + D[1]], [x + w + D[0], y + D[1]], [x + w + D[0], y + D[1] + h - 3], [x + D[0], y + D[1] + h - 3]], wood, FRONT, (xx, yy) => planksH(4, 4)(xx, yy) - 1.3, false);
  face(pc, [[x, y], [x + D[0], y + D[1]], [x + D[0], y + D[1] + h - 3], [x, y + h - 3]], wood, RIGHT, (xx, yy) => planksH(4, 5)(xx, yy) - 0.3, false);
  // верхние кромки бортов (левый, задний, правый)
  fillLine(pc, x, y, x + D[0], y + D[1], litC(wood, TOP, 0.3), 1);
  fillLine(pc, x + D[0], y + D[1], x + w + D[0], y + D[1], litC(wood, TOP, 0), 1);
  fillLine(pc, x + w, y, x + w + D[0], y + D[1], litC(wood, TOP, 0.2), 1);
  // передний борт поверх
  box(pc, x, y, w, h, 1, { r: wood, tex: addTex(planksH(4, 6), grain(9, 0.15)) }, { r: wood }, { r: wood });
}
function sack3(pc: PC, cx: number, cy: number, s: number) {
  ellipseFace(pc, cx, cy, 5 * s, 4 * s, CLOTH.rag, [0, 0, 1]);
  for (let y = Math.floor(cy - 4 * s); y <= cy + 4 * s; y++) for (let x = Math.floor(cx - 5 * s); x <= cx + 5 * s; x++) {
    const dx = (x + 0.5 - cx) / (5 * s), dy = (y + 0.5 - cy) / (4 * s), d = dx * dx + dy * dy;
    if (d <= 1) pc.set(x, y, litC(CLOTH.rag, [dx * 0.8, -dy * 0.8, Math.sqrt(Math.max(0, 1 - d * 0.7))], 0));
  }
  ellipseFace(pc, cx, cy - 4 * s, 1.6, 1.2, ROPE, TOP); fillLine(pc, cx - 2, cy, cx + 1, cy + 1, CLOTH.rag[1]);
}
/** Колесо плашмя на земле: диск-эллипс с толщиной. */
function flatWheel(pc: PC, cx: number, cy: number, r: number) {
  for (let k = 2; k >= 1; k--) ellipseRing(pc, cx, cy + k, r, r * 0.42, 2, litC(IRON, FRONT, -0.8));
  ellipseRing(pc, cx, cy, r, r * 0.42, 2, litC(IRON, TOP, -0.2));
  ellipseRing(pc, cx, cy, r - 2, r * 0.42 - 1, 1.4, litC(WOOD, TOP, 0));
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; fillLine(pc, Math.round(cx), Math.round(cy), Math.round(cx + Math.cos(a) * (r - 2.5)), Math.round(cy + Math.sin(a) * (r - 2.5) * 0.42), litC(WOOD, TOP, k < 3 ? -0.3 : 0.3)); }
  ellipseFace(pc, cx, cy, 2, 1.2, IRON, TOP);
}
function ellipseRing(pc: PC, cx: number, cy: number, rx: number, ry: number, w: number, c: RGBA) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d <= 1 && d > 1 - w / Math.min(rx, ry * 2)) pc.set(x, y, c);
  }
}
function wagon3(v: "a" | "b"): PC {
  const pc = new PC(104, 66);
  shadowPoly(pc, [[8, 60], [80, 61], [96, 50], [26, 48]], 80);
  if (v === "a") {
    // кузов на сломанной оси: собирается отдельно и наклоняется к левому переднему углу
    const k = new PC(104, 66);
    wheel3(k, 72, 52, 10, WOOD, IRON, { thick: 4, rot: 0.4 }); // заднее правое (дальнее) колесо
    openBox(k, 22, 30, 54, 14, 20, WOOD);
    log(k, 6, 52, 22, 42, 1.8, WOOD, { end: WOOD }); // дышло, сломанное
    wheel3(k, 68, 54, 10, WOOD, IRON, { thick: 4, rot: 0.1 });
    // мешки и ящик в кузове и рассыпанные
    sack3(k, 40, 32, 1.1); sack3(k, 52, 30, 0.9);
    const tilted = k.rotated(-0.12, 70, 54);
    pc.blit(tilted, 0, 0);
    flatWheel(pc, 18, 58, 10); // сорванное колесо
    sack3(pc, 36, 60, 1); sack3(pc, 86, 58, 0.9);
    box(pc, 78, 48, 10, 8, 6, { r: WOOD, tex: planksV(4, 3) }, { r: WOOD }, { r: WOOD, tex: planksH(3, 4) });
    log(pc, 90, 44, 99, 40, 1.4, WOOD, { end: WOOD }); // отлетевшая доска
  } else {
    // перевёрнута днищем вверх: доски днища сверху, брусья, колесо торчит на оси
    const x = 18, y = 34, w = 58, h = 12, d = 22;
    box(pc, x, y, w, h, d, { r: WOOD, tex: addTex(planksH(4, 7), grain(5, 0.15)) }, { r: WOOD, tex: planksH(4, 8) }, { r: WOOD, tex: planksV(6, 9) });
    const D = depth(d);
    for (const t of [0.25, 0.75]) log(pc, x + D[0] * t - 1, y + D[1] * t, x + w + D[0] * t + 1, y + D[1] * t, 1.6, WOOD, { end: WOOD });
    for (const sx of [x + 12, x + w - 14]) { pc.rect(sx, y + 4, 6, 2, litC(IRON, FRONT, 0)); pc.rect(sx, y + 4, 6, 1, litC(IRON, FRONT, 0.8)); }
    // ось и торчащее колесо
    log(pc, x + w - 6 + D[0] * 0.5, y + D[1] * 0.5, x + w - 6 + D[0] * 0.5, y + D[1] * 0.5 - 12, 1.6, WOOD, { end: WOOD });
    wheel3(pc, x + w - 6 + D[0] * 0.5, y + D[1] * 0.5 - 16, 10, WOOD, IRON, { thick: 4, rot: 0.2 });
    flatWheel(pc, 12, 58, 8);
    sack3(pc, 8, 52, 1.1); sack3(pc, 90, 56, 1);
    box(pc, 74, 50, 12, 8, 6, { r: WOOD, tex: planksV(4, 3) }, { r: WOOD }, { r: WOOD, tex: planksH(3, 4) });
    box(pc, 30, 54, 9, 6, 5, { r: WOOD, tex: planksV(3, 5) }, { r: WOOD }, { r: WOOD });
  }
  return finish(pc);
}

/** Новые объёмные bf_* (заменяют записи bf-gen.ts / bf-gen2.ts с теми же id). */
export const BF_VOLUME: Record<string, () => PC> = {
  ...TENTS3,
  bf_siege_tower: siegeTower3,
  bf_ram: ram3,
  bf_spike_barrier: spikeBarrier3,
  bf_shield_stand: shieldStand3,
  bf_map_table: mapTable3,
  bf_wagon_broken_a: () => wagon3("a"),
  bf_wagon_broken_b: () => wagon3("b"),
};
void prism; void cylV; void tone; void OUT; void STONE;
