/**
 * Объём городской мелочи Эмберхолла (задача 1030): здание распорядителя арены (врата), стойка оружия, чучело, факел, наковальня.
 * Перекрывает одноимённые плоские кадры (подключено в volume-world.ts → WORLD_VOLUME). Правила: docs/art/perspective.md.
 */
import {
  PC, hash01, ramp, type RGBA, type Tex,
  WOOD, IRON, STONE, ROPE, FRONT, TOP, RIGHT,
  box, fillPoly, cylV, ellipseFace, shadowBox, shadowDisc, depth, litC, planksV, grain, finish,
} from "./volume-lib";
import { TOWN, P } from "./palette";

const ST = TOWN.ST;
const RED = P.cloth.red;
const GOLD = ramp("#5a3a0c", "#9a6a1c", "#d6a84b", "#f0cc72", "#fff0b0");
const FIRE = ramp("#7a1c0c", "#d8501c", "#ff9a2c", "#ffd25a", "#fff4b0");
const blocks = (bw: number, bh: number, seed: number): Tex => (x, y) => {
  const row = Math.floor(y / bh), off = (row % 2) * Math.floor(bw / 2), i = (((x + off) % bw) + bw) % bw, j = ((y % bh) + bh) % bh;
  if (j === bh - 1 || i === bw - 1) return -1.1;
  return (j === 0 ? 0.4 : i === 0 ? 0.2 : 0) + (hash01(Math.floor((x + off) / bw), row, seed) - 0.5) * 0.5 + (hash01(x, y, seed) < 0.04 ? -0.5 : 0);
};

/** Здание распорядителя арены (врата): каменный привратный дом на цоколе со ступенями, арка с решёткой, алые стяги, зубцы с видимой верхней плоскостью, факелы. */
function arenaGate(): PC {
  const pc = new PC(140, 172), base = 168, X = 10, W = 108, PH = 14, BH = 92, d = 20;
  const D = depth(d);
  shadowBox(pc, X, X + W, base - 4, D, 100);
  // цоколь-платформа: каменная грань с кромкой, верх виден
  box(pc, X - 2, base - 4 - PH, W + 4, PH, d + 4, { r: ST, tex: blocks(12, 7, 11) }, { r: ST, tex: blocks(8, 7, 12) }, { r: ST, tex: grain(3, 0.3) });
  for (let x = X - 2; x < X + W + 2; x++) pc.set(x, base - 4 - PH, litC(ST, TOP, 1.2));
  const ground = base - 4 - PH, y0 = ground - BH;
  // тело привратного дома
  box(pc, X + 4, y0, W - 8, BH, d, { r: ST, tex: blocks(12, 6, 21) }, { r: ST, tex: blocks(8, 6, 22) }, { r: ST, tex: grain(5, 0.35) });
  // угловые камни (цепь) по краям фасада
  for (const bx of [X + 4, X + W - 12]) for (let y = y0; y < ground; y += 6) for (let x = bx; x < bx + 8; x++) pc.set(x, y, litC(ST, FRONT, (y / 6) % 2 ? 0.8 : 0.3));
  // карниз со свесом и зубцы
  box(pc, X, y0 - 8, W, 8, d + 4, { r: ST, tex: blocks(14, 4, 31) }, { r: ST }, { r: ST, tex: grain(7, 0.3) });
  for (let x = X; x < X + W; x++) pc.set(x, y0 - 8, litC(ST, TOP, 1.4));
  for (let mx = X + 2; mx + 9 <= X + W; mx += 14) box(pc, mx, y0 - 20, 9, 12, 6, { r: ST, tex: blocks(9, 4, 41) }, { r: ST }, { r: ST, tex: grain(9, 0.2) });
  // арка: проём с решёткой, ободок
  const ox = X + W / 2, oy = y0 + 46, rx = 24;
  const inArch = (x: number, y: number, r: number) => (y >= oy ? Math.abs(x + 0.5 - ox) < r : ((x + 0.5 - ox) / r) ** 2 + ((y + 0.5 - oy) / (r * 1.25)) ** 2 < 1);
  for (let y = y0 + 8; y < ground; y++) for (let x = ox - rx - 4; x < ox + rx + 4; x++) {
    if (inArch(x, y, rx + 3) && !inArch(x, y, rx)) pc.set(x, y, litC(ST, FRONT, ((x + y) % 5 === 0 ? -1.2 : 0.6) + (x < ox ? 0.2 : -0.1)));
    if (!inArch(x, y, rx)) continue;
    const inner = Math.min(Math.abs(x + 0.5 - ox - rx), Math.abs(x + 0.5 - ox + rx));
    const glow = Math.max(0, (y - oy) / (ground - oy));
    let c: RGBA = litC(IRON, FRONT, -2.6 + glow * 1.2 - (inner < 3 ? 0.6 : 0));
    if ((x - (ox - rx)) % 6 === 0 || (y - (y0 + 14)) % 9 === 0) c = litC(IRON, FRONT, 0.2 + (x < ox ? 0.5 : 0) - (y > ground - 8 ? 0.8 : 0));
    pc.set(x, y, c);
  }
  // три ступени к проёму (проступь + подступёнок)
  for (let s = 0; s < 3; s++) box(pc, ox - rx - 6 + s * 2, base - 4 - 4 * s, rx * 2 + 12 - s * 4, 4, 4, { r: ST, tex: blocks(10, 4, 50 + s) }, { r: ST }, { r: ST, tex: grain(s, 0.25) });
  for (let s = 0; s < 3; s++) for (let x = ox - rx - 6 + s * 2; x < ox + rx + 6 - s * 2; x++) pc.set(x, base - 4 - 4 * s, litC(ST, TOP, 1.4));
  // золотой череп арены на замке арки
  for (let y = 0; y < 6; y++) for (let x = -5; x <= 5; x++) if ((x / 5.5) ** 2 + ((y - 2.5) / 3.2) ** 2 < 1) pc.set(ox + x, y0 + 12 + y, litC(GOLD, FRONT, y < 2 ? 0.8 : -0.1));
  for (const ex of [-2, 2]) pc.set(ox + ex, y0 + 14, litC(ST, FRONT, -2.5));
  // стяги со скрещёнными мечами
  for (const bx of [X + 12, X + W - 28]) {
    const bw = 16, by = y0 + 14, bh = 44;
    for (let x = bx - 2; x < bx + bw + 2; x++) pc.set(x, by - 2, litC(IRON, FRONT, 0.6));
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
      const tip = y > by + bh - 10 ? y - (by + bh - 10) : 0;
      if (Math.abs(x - bx - bw / 2 + 0.5) < bw / 2 - tip * 0.8 + 0.5) pc.set(x, y, litC(RED, FRONT, (Math.floor((x - bx) / 5) % 2 ? -0.5 : 0.2) + (x - bx > bw - 3 ? -0.8 : 0) + (y - by < 2 ? 0.5 : 0)));
    }
    for (let k = 0; k < 14; k++) {
      pc.set(bx + 2 + k, by + 8 + k, litC(IRON, FRONT, 1.8)); pc.set(bx + 2 + k, by + 22 - k, litC(IRON, FRONT, 1.2));
      pc.set(bx + 3 + k, by + 8 + k, litC(IRON, FRONT, -0.4));
    }
    for (let x = bx; x < bx + bw; x++) pc.set(x, by + 4, litC(GOLD, FRONT, 0));
  }
  // факельные стойки на цоколе по бокам
  for (const tx of [X - 5, X + W + 7]) {
    shadowDisc(pc, tx, base - 2, 5, 2, 20);
    box(pc, tx - 3, base - 8, 7, 5, 4, { r: STONE }, { r: STONE }, { r: STONE });
    cylV(pc, tx, base - 32, base - 8, 1.6, IRON, { k: 0.4 });
    ellipseFace(pc, tx, base - 33, 4, 2, IRON, TOP);
    for (let y = -9; y < 0; y++) for (let x = -3; x <= 3; x++) if (Math.abs(x) < 3.4 - Math.abs(y + 3) * 0.3 - (y < -5 ? Math.abs(x) * 0.5 : 0)) pc.set(tx + x, base - 34 + y, litC(FIRE, FRONT, (y + 9) * 0.35 - 1.5));
  }
  return finish(pc);
}

/** Стойка оружия: плита-основание, две стойки с перекладинами, копья, меч. */
function weaponRack(): PC {
  const pc = new PC(40, 52), base = 49, x0 = 5, w = 26;
  shadowBox(pc, x0, x0 + w, base, depth(6), 40);
  box(pc, x0 - 1, base - 4, w + 2, 4, 7, { r: STONE, tex: grain(3, 0.25) }, { r: STONE }, { r: STONE, tex: grain(4, 0.3) });
  for (const px of [x0 + 1, x0 + w - 4]) box(pc, px, base - 36, 3, 32, 3, { r: WOOD, tex: planksV(3, 2, 0.3) }, { r: WOOD }, { r: WOOD });
  box(pc, x0 + 1, base - 36, w - 2, 3, 3, { r: WOOD }, { r: WOOD }, { r: WOOD });
  box(pc, x0 + 1, base - 20, w - 2, 3, 3, { r: WOOD }, { r: WOOD }, { r: WOOD });
  for (const [sx, h] of [[x0 + 5, 12], [x0 + 10, 8], [x0 + 15, 14]] as const) {
    for (let y = base - 34 - h + 6; y < base - 5; y++) { pc.set(sx, y, litC(WOOD, FRONT, y % 4 === 0 ? -0.4 : 0.3)); pc.set(sx + 1, y, litC(WOOD, RIGHT, -0.5)); }
    for (let k = 0; k < 7; k++) { pc.set(sx, base - 34 - h + 6 - k, litC(IRON, FRONT, 1.2 - k * 0.1)); if (k < 5) pc.set(sx + 1, base - 34 - h + 6 - k, litC(IRON, RIGHT, 0.2)); }
  }
  for (let y = base - 30; y < base - 8; y++) { pc.set(x0 + 20, y, litC(IRON, FRONT, 1.6)); pc.set(x0 + 21, y, litC(IRON, RIGHT, -0.2)); }
  for (let x = x0 + 18; x < x0 + 24; x++) pc.set(x, base - 29, litC(GOLD, FRONT, 0));
  return finish(pc);
}

/** Тренировочное чучело: столб-крест на каменной плите, соломенная голова и туловище с перевязью. */
function dummy(): PC {
  const pc = new PC(36, 52), cx = 16, base = 49;
  shadowBox(pc, cx - 9, cx + 9, base, depth(6), 44);
  box(pc, cx - 9, base - 4, 18, 4, 7, { r: STONE, tex: grain(5, 0.25) }, { r: STONE }, { r: STONE, tex: grain(6, 0.3) });
  cylV(pc, cx, base - 36, base - 4, 1.8, WOOD, { k: 0.4, tex: (_p, y) => (hash01(y, 3, 3) - 0.5) * 0.4 });
  box(pc, cx - 13, base - 30, 26, 3, 3, { r: WOOD }, { r: WOOD }, { r: WOOD });
  const STR = ramp("#5a4018", "#86652a", "#b8903e", "#d8b25c", "#f0d488");
  for (const [ccx, ccy, rx, ry] of [[cx, base - 24, 8, 10], [cx, base - 38, 5.5, 5.5]] as const)
    for (let y = Math.floor(ccy - ry); y <= ccy + ry; y++) for (let x = Math.floor(ccx - rx); x <= ccx + rx; x++) {
      const u = (x + 0.5 - ccx) / rx, v = (y + 0.5 - ccy) / ry, e = u * u + v * v; if (e > 1) continue;
      pc.set(x, y, litC(STR, [u * 0.8, -v * 0.8, Math.sqrt(1 - e)], (hash01(x, Math.floor(y / 2), 8) - 0.5) * 0.7));
    }
  for (let x = cx - 8; x <= cx + 8; x++) { pc.set(x, base - 21, litC(RED, FRONT, 0.3)); pc.set(x, base - 20, litC(RED, FRONT, -0.7)); }
  for (const ex of [-2, 2]) pc.set(cx + ex, base - 39, litC(IRON, FRONT, -2));
  return finish(pc);
}

/** Стоячий факел: древко в каменной втулке на плитке, обмотка и пламя. */
function torch(): PC {
  const pc = new PC(24, 40), cx = 11, base = 37;
  shadowDisc(pc, cx, base - 2, 6, 2.4, 20);
  box(pc, cx - 5, base - 5, 10, 5, 5, { r: STONE, tex: grain(2, 0.25) }, { r: STONE }, { r: STONE });
  cylV(pc, cx, base - 20, base - 5, 2, WOOD, { k: 0.4, tex: (_p, y) => (hash01(y, 1, 2) - 0.5) * 0.4, ao: 2 });
  for (let x = cx - 3; x <= cx + 3; x++) { pc.set(x, base - 22, litC(IRON, FRONT, 0.6)); pc.set(x, base - 21, litC(IRON, FRONT, -0.6)); }
  ellipseFace(pc, cx, base - 22, 4, 1.6, ROPE, TOP);
  for (let y = -11; y < 0; y++) for (let x = -4; x <= 4; x++) if (Math.abs(x) < 4.2 - Math.abs(y + 4) * 0.4 - (y < -6 ? Math.abs(x) * 0.6 : 0)) pc.set(cx + x, base - 23 + y, litC(FIRE, FRONT, (y + 11) * 0.38 - 1.6));
  return finish(pc);
}

/** Наковальня на дубовой колоде: рог, рабочая плоскость с бликом. */
function anvil(): PC {
  const pc = new PC(36, 34), cx = 17, base = 31;
  shadowBox(pc, cx - 8, cx + 8, base, depth(6), 20);
  cylV(pc, cx, base - 12, base - 3, 8, WOOD, { k: 0.4, tex: (p, y) => (hash01(Math.floor(p * 4), y, 2) - 0.5) * 0.5, ao: 2 });
  box(pc, cx - 8, base - 17, 16, 5, 6, { r: IRON }, { r: IRON }, { r: IRON, tex: grain(2, 0.3) });
  box(pc, cx - 5, base - 20, 10, 3, 6, { r: IRON }, { r: IRON }, { r: IRON });
  fillPoly(pc, [[cx - 12, base - 21], [cx - 5, base - 21], [cx - 5, base - 18], [cx - 9, base - 18]], (_x, y) => litC(IRON, y < base - 20 ? TOP : FRONT, 0.2));
  for (let x = cx - 5; x < cx + 5; x++) pc.set(x, base - 20, litC(IRON, TOP, 1.8));
  return finish(pc);
}

export const TOWN_VOLUME: Record<string, () => PC> = { arena_gate: arenaGate, weapon_rack: weaponRack, dummy, torch, anvil };
