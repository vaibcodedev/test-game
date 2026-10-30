/**
 * Объёмный декор мира (заменяет плоские версии с теми же id через OBJECT_ART в tools/gen/objects.ts):
 * походный шатёр лагерей, сено, руины (стена и колонна), колонна, тёмный обелиск, указатель, колодец, фонарь.
 * Основа — tools/gen/volume-lib.ts; размеры кадров и следы на карте прежние.
 */
import {
  PC, hash01, hex, mix, withA, type RGBA, type Ramp, type N3, type Tex,
  CLOTH, WOOD, IRON, ROPE, STONE, MARBLE, STRAW, FRONT, TOP, RIGHT,
  box, prism, frame32, face, fillPoly, cylV, ellipseFace, log, shadowPoly, shadowBox, shadowDisc, depth, litC, planksV, planksH, grain, addTex, finish, ramp,
} from "./volume-lib";
import { ridgeTent } from "./volume-bf";
import { TOWN_VOLUME } from "./volume-town";

/** Тёсаные блоки по фасаду: швы рядами со сдвигом. */
const blocks = (bw: number, bh: number, seed: number, amp = 0.3): Tex => (x, y) => {
  const row = Math.floor(y / bh), off = (row % 2) * Math.floor(bw / 2), i = (((x + off) % bw) + bw) % bw, j = ((y % bh) + bh) % bh;
  if (j === bh - 1 || i === bw - 1) return -1.2;
  return (j === 0 ? 0.45 : i === 0 ? 0.25 : 0) + (hash01(Math.floor((x + off) / bw), row, seed) - 0.5) * 0.5 + (hash01(x, y, seed) < 0.05 ? -0.5 : 0) + (hash01(x * 3, y, seed) - 0.5) * amp;
};
const RUIN = ramp("#3a3630", "#5a554c", "#7a7468", "#9a9384", "#b8b1a0", "#d4cebd");
const MOSS = ramp("#1e3a1c", "#2c5226", "#3e6c30", "#5a8a3a", "#7aa848");
/** Мох на верхних гранях: только по уже нарисованным пикселям в зоне. */
function mossTop(pc: PC, x0: number, y0: number, w: number, h: number, seed: number) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!pc.alpha(x, y)) continue;
    const n = hash01(Math.floor(x / 2), Math.floor(y / 2), seed) * 0.6 + hash01(x, y, seed + 1) * 0.4;
    if (n > 0.62) pc.set(x, y, litC(MOSS, TOP, n > 0.8 ? 0 : -0.8));
  }
}

// ---------- руины ----------
/** Обломок стены (2×1, 64×48): колонки кладки разной высоты слева направо, верхи и правые грани видны, мох, щебень у подножия. */
function ruinWall(): PC {
  const pc = new PC(72, 50), base = 46, d = 10, D = depth(d);
  shadowBox(pc, 3, 62, base, D, 34);
  const hs = [18, 26, 30, 22, 34, 28, 14, 10];
  hs.forEach((h, i) => {
    const x = 4 + i * 7, ht = h + Math.round(hash01(i, 2, 3) * 3);
    box(pc, x, base - ht, 7, ht, d, { r: RUIN, tex: blocks(9, 6, 5) }, { r: RUIN, tex: blocks(6, 6, 6) }, { r: RUIN, tex: grain(7, 0.25) });
  });
  // скол-пролом и мох на верхах
  mossTop(pc, 4, base - 40, 60, 10, 4);
  // щебень у подножия
  for (const [x, y, r] of [[6, base + 1, 3], [24, base + 2, 2.5], [50, base + 1, 3.5], [62, base - 1, 2.5], [40, base + 2, 2]] as const) stone(pc, x, y, r, RUIN);
  void D;
  return finish(pc);
}
function stone(pc: PC, cx: number, cy: number, r: number, mat: Ramp) {
  for (let y = Math.floor(cy - r); y <= cy + r * 0.7; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / (r * 0.75), d = dx * dx + dy * dy;
    if (d > 1 || dy > 0.9) continue;
    pc.set(x, y, litC(mat, [dx, -dy, Math.sqrt(Math.max(0, 1 - d))], -0.2));
  }
}
/** Сломанная колонна (32×64): плинт, каннелированный ствол, излом сверху светлый, обломок у подножия. */
function ruinPillar(): PC {
  const pc = new PC(36, 64), cx = 15, base = 60;
  shadowBox(pc, cx - 10, cx + 10, base, depth(8), 44);
  box(pc, cx - 10, base - 6, 20, 6, 8, { r: RUIN, tex: grain(2, 0.2) }, { r: RUIN }, { r: RUIN, tex: grain(3, 0.2) });
  const top = 18;
  cylV(pc, cx + 2, top, base - 8, 7.5, RUIN, { k: 0.45, cap: null, tex: (phi) => (Math.floor((phi + 1.6) * 3.2) % 2 ? -0.35 : 0.15), ao: 3 });
  // излом: неровная светлая поверхность среза
  for (let x = cx - 6; x <= cx + 10; x++) {
    const jag = Math.round(Math.sin(x * 1.3) * 2 + hash01(x, 1, 7) * 3);
    for (let y = top - 3; y < top + jag; y++) pc.clear(x, y);
    pc.set(x, top + jag, litC(RUIN, TOP, 0.4)); pc.set(x, top + jag + 1, litC(RUIN, TOP, -0.3));
  }
  mossTop(pc, cx - 6, top, 17, 6, 9);
  stone(pc, cx + 13, base, 3.5, RUIN); stone(pc, cx - 11, base + 1, 2.5, RUIN);
  return finish(pc);
}
/** Колонна-стела (32×64): квадратная, база и капитель плитами с глубиной. */
function pillar(): PC {
  const pc = new PC(36, 64), x = 9, base = 60, d = 8;
  shadowBox(pc, x - 3, x + 15, base, depth(d), 48);
  box(pc, x - 3, base - 6, 18, 6, d, { r: STONE, tex: grain(1, 0.2) }, { r: STONE }, { r: STONE });
  box(pc, x, 12, 12, base - 18, d - 2, { r: STONE, tex: blocks(13, 8, 2) }, { r: STONE, tex: blocks(7, 8, 3) }, { r: STONE });
  box(pc, x - 3, 6, 18, 6, d, { r: STONE, tex: grain(4, 0.2) }, { r: STONE }, { r: STONE, tex: grain(5, 0.2) });
  return finish(pc);
}
/** Тёмный обелиск (32×96): сужающийся вверх, пирамидион, светящиеся руны по фасаду. */
function darkObelisk(): PC {
  const pc = new PC(36, 96), cx = 15, base = 92, d = 7, D = depth(d);
  const OB = ramp("#0c0a14", "#18142a", "#262040", "#362e58", "#4a4072", "#62588e");
  const RUNE = [hex("#5a2a9a"), hex("#9a5ae0"), hex("#e0c0ff")];
  shadowBox(pc, cx - 10, cx + 10, base, depth(d + 2), 84);
  box(pc, cx - 10, base - 6, 20, 6, d + 2, { r: OB, tex: grain(1, 0.2) }, { r: OB }, { r: OB });
  const wb = 7, wt = 4, yT = 16;
  prism(pc, [[cx - wb, base - 6], [cx - wt, yT], [cx + wt, yT], [cx + wb, base - 6]], D, { r: OB, tex: grain(2, 0.25) }, { r: OB, tex: grain(3, 0.2) }, { r: OB });
  // пирамидион: фасад и правая грань
  const A: [number, number] = [cx + D[0] / 2, yT - 9 + D[1] / 2];
  face(pc, [[cx + wt, yT], [cx + wt + D[0], yT + D[1]], A], OB, [0.7, 0.5, 0]);
  face(pc, [[cx - wt, yT], [cx + wt, yT], A], OB, [0, 0.5, 0.8]);
  // руны с ореолом
  for (let i = 0; i < 6; i++) {
    const y = yT + 8 + i * 10, x = cx - 1 + (i % 2);
    for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [1, 1], [-1, 1]] as const) pc.set(x + dx, y + dy, RUNE[dx || dy !== 1 ? 1 : 2]);
    for (const [dx, dy] of [[-2, 1], [2, 1], [0, -1], [0, 3]] as const) pc.set(x + dx, y + dy, withA(RUNE[0], 150));
  }
  pc.set(Math.round(A[0]), Math.round(A[1]) + 2, RUNE[2]);
  return finish(pc);
}

// ---------- лагерь ----------
/** Тюк сена (32×32): прямоугольный, перевязан, соломинки торчат. */
function hay(): PC {
  const pc = new PC(32, 32), x = 3, y = 14, w = 20, h = 13, d = 10;
  shadowBox(pc, x, x + w, y + h, depth(d), 14);
  const straw: Tex = (xx, yy) => (hash01(xx, Math.floor(yy / 2), 3) - 0.5) * 0.9 + (hash01(xx, yy, 4) < 0.08 ? -0.8 : 0);
  box(pc, x, y, w, h, d, { r: STRAW, tex: straw }, { r: STRAW, tex: straw }, { r: STRAW, tex: (xx, yy) => straw(yy, xx) });
  const D = depth(d);
  for (const fx of [6, 14]) { // верёвки по фасаду и верху
    for (let k = 0; k < h; k++) pc.set(x + fx, y + k, litC(ROPE, FRONT, 0));
    for (let k = 0; k <= Math.abs(D[0]); k++) pc.set(x + fx + k, y + Math.round((D[1] * k) / D[0]), litC(ROPE, TOP, 0));
  }
  for (let i = 0; i < 7; i++) { const sx = x + 1 + Math.floor(hash01(i, 1, 5) * (w + 6)), sy = y + Math.floor(hash01(i, 2, 5) * 3) - 4; pc.set(sx, sy, STRAW[4]); pc.set(sx + 1, sy - 1, STRAW[3]); }
  return finish(pc);
}
/** Указатель (32×64): столб-бревно на каменной пятке (след на земле, docs/art-perspective.md §3), три доски-стрелки с толщиной. */
function signpost(): PC {
  const pc = new PC(40, 64), cx = 18, base = 60;
  shadowBox(pc, cx - 6, cx + 6, base, depth(4), 50);
  box(pc, cx - 6, base - 3, 12, 3, 4, { r: STONE, tex: grain(7, 0.25) }, { r: STONE }, { r: STONE });
  const boardTex = addTex(planksH(3, 5), grain(6, 0.15));
  const board = (y: number, dir: number, w: number, tilt: number) => {
    const x0 = dir > 0 ? cx - 3 : cx + 3, x1 = x0 + dir * w;
    const pts: [number, number][] = dir > 0
      ? [[x0, y + tilt], [x1 - 4, y], [x1, y + 3], [x1 - 4, y + 6], [x0, y + 6 + tilt]]
      : [[x1 + 4, y], [x0, y + tilt], [x0, y + 6 + tilt], [x1 + 4, y + 6], [x1, y + 3]];
    prism(pc, pts, [1, -1], { r: WOOD, tex: boardTex }, { r: WOOD }, { r: WOOD });
    for (let k = 0; k < 3; k++) pc.set(Math.min(x0, x1) + 4 + k * 3, y + 3, litC(WOOD, FRONT, -1.4)); // надпись
  };
  board(16, -1, 15, 0);
  cylV(pc, cx, 10, base - 4, 2.5, WOOD, { k: 0.5, tex: (phi, y) => (hash01(y, 1, 2) - 0.5) * 0.4, ao: 2 });
  board(22, 1, 17, 1); board(33, -1, 13, -1);
  for (const y of [19, 25, 36]) pc.set(cx, y, litC(IRON, FRONT, 0.8)); // гвозди
  return finish(pc);
}
/** Колодец (32×48): каменный сруб-цилиндр, тёмная вода, стойки, двускатный козырёк, ворот с ведром. */
function well(): PC {
  const pc = new PC(36, 50), cx = 15, base = 46, r = 11, top = 30;
  shadowDisc(pc, cx, base - 4, r, 4.5, 26);
  cylV(pc, cx, top, base - 4, r, STONE, { k: 0.45, cap: null, tex: (phi, y) => { const row = Math.floor((y - top) / 4), seg = Math.floor((phi + 1.6) * 3 + row * 0.5); return (y - top) % 4 === 3 || hash01(seg, row, 2) < 0.2 ? -0.9 : (hash01(seg, row, 3) - 0.5) * 0.6; }, ao: 2 });
  // кромка и вода
  ellipseFace(pc, cx, top, r, r * 0.45, STONE, TOP, grain(4, 0.3));
  ellipseFace(pc, cx, top + 0.5, r - 3, r * 0.45 - 2, ramp("#08121c", "#0e1e2e", "#163046", "#22486a", "#3a6a90"), [0, 0, 1], (x, y) => (y < top ? -1.5 : -0.6));
  // стойки и ворот
  for (const sx of [cx - r + 2, cx + r - 2]) box(pc, sx - 1, top - 18, 3, 18, 3, { r: WOOD, tex: grain(sx, 0.2) }, { r: WOOD }, { r: WOOD });
  log(pc, cx - r + 1, top - 12, cx + r - 1, top - 12, 1.6, WOOD, { end: WOOD });
  for (let y = top - 11; y < top - 3; y++) pc.set(cx + 1, y, litC(ROPE, FRONT, 0));
  box(pc, cx - 1, top - 4, 5, 4, 2, { r: WOOD }, { r: WOOD }, { r: WOOD });
  // козырёк: ближний скат и правый фронтон
  const yE = top - 18, D = depth(10);
  const E1: [number, number] = [cx - r - 2, yE], E2: [number, number] = [cx + r + 2, yE], R1: [number, number] = [E1[0] + D[0] / 2, yE + D[1] / 2 - 7], R2: [number, number] = [E2[0] + D[0] / 2, yE + D[1] / 2 - 7];
  face(pc, [E2, [E2[0] + D[0], E2[1] + D[1]], R2], WOOD, RIGHT);
  face(pc, [E1, E2, R2, R1], ramp("#3a1a14", "#5e2a1e", "#8a3e28", "#b0583a", "#cc7a52"), [0, 0.7, 0.7], planksV(3, 4, 0.4));
  for (let x = E1[0]; x <= E2[0]; x++) { pc.set(x, yE, litC(WOOD, FRONT, 0)); pc.set(x, yE + 1, litC(WOOD, FRONT, -0.8)); }
  return finish(pc);
}
/** Фонарь на столбе (32×64): чугунный столб, фонарь-коробка со стёклами и светом, шатровая крышка. */
function lamp(): PC {
  const pc = new PC(32, 64), cx = 14, base = 60;
  shadowBox(pc, cx - 4, cx + 4, base, depth(4), 60);
  box(pc, cx - 4, base - 5, 8, 5, 4, { r: IRON }, { r: IRON }, { r: IRON });
  cylV(pc, cx, 22, base - 5, 1.6, IRON, { k: 0.5 });
  box(pc, cx - 3, 20, 7, 2, 4, { r: IRON }, { r: IRON }, { r: IRON });
  const G = ramp("#7a4a10", "#c8801c", "#ffc84a", "#ffe89a", "#fff8d8");
  box(pc, cx - 4, 9, 9, 11, 5, { r: G, tex: (x) => ((x - cx + 4) % 4 === 0 ? -3 : 0.5) }, { r: G, tex: () => -1.2 }, { r: IRON });
  const D = depth(5);
  fillPoly(pc, [[cx - 5, 9], [cx + 5, 9], [cx + 5 + D[0], 9 + D[1]], [cx + D[0] / 2, 1], [cx - 5 + D[0] / 2, 9 + D[1] / 2]], (x, y) => litC(IRON, x > cx + 2 ? RIGHT : TOP, -0.3));
  ellipseFace(pc, cx + D[0] / 2, 1, 1.5, 1.5, IRON, TOP);
  for (let y = 8; y < 22; y++) for (let x = cx - 9; x < cx + 12; x++) { const dd = Math.hypot(x - cx, (y - 14) * 1.2); if (dd < 9 && !pc.alpha(x, y)) pc.set(x, y, withA(G[3], 26)); }
  return finish(pc);
}

const RAW: Record<string, () => PC> = {
  tent: () => ridgeTent({ a: CLOTH.cream, b: CLOTH.teal, trim: CLOTH.teal, flag: CLOTH.red, seed: 21, w: 70, h: 54, d: 30 }),
  hay, ruin_wall: ruinWall, ruin_pillar: ruinPillar, pillar, dark_obelisk: darkObelisk, signpost, well, lamp, ...TOWN_VOLUME,
};
void mix; void STONE; void IRON; void TOP;
type _N = N3; type _R = RGBA;

/** Кадры для игры (обрезка и холст кратный 32 — одинаково и в npm run assets, и в tools/gen/volume.ts --game). */
export const WORLD_VOLUME: Record<string, () => PC> = Object.fromEntries(Object.entries(RAW).map(([k, f]) => [k, () => frame32(f())]));
