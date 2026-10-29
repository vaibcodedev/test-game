/**
 * Убранство для образцов полов (tools/gen/floors.ts): простые предметы 3/4 — видны верх и лицо (боковую грань не рисуем,
 * docs/art-perspective.md §2), контур 1 px тёмным тоном материала, AO под основанием и короткая тень вправо-вниз;
 * тёплый свет (жаровни, свечи) и пятна света из окон на полу.
 */
import { PC, hash01, mix, ramp, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const tone = (r: Ramp, v: number) => r[Math.round(clamp(v, 0, r.length - 1))];
function mul(pc: PC, x: number, y: number, k: number) { const c = pc.get(x, y); if (c && c[3]) pc.set(x, y, [c[0] * k, c[1] * k, c[2] * k, 255].map(Math.round) as RGBA); }

export const PR = {
  wood: ramp("#1e120a", "#3e2616", "#5e3c22", "#80542e", "#a2703e"),
  tableTop: ramp("#2a1608", "#6a3a18", "#9a5e2c", "#c48a48", "#e8b672"),
  darkWood: ramp("#100a0e", "#1e141a", "#2e2026", "#402e34", "#56424a"),
  iron: ramp("#121016", "#24222c", "#3a3846", "#5a5868", "#848296"),
  stone: ramp("#1e1c22", "#36343e", "#52505c", "#6e6a78", "#8e8a96"),
  marble: ramp("#5e574e", "#9a9286", "#c4bcae", "#dcd5c6", "#f2ecdf"),
  basalt: ramp("#0e0c12", "#1e1a24", "#2c2632", "#3a3240", "#4c4252"),
  wax: ramp("#7a6a52", "#c8b890", "#e8dcb8", "#fff4d8"),
  gold: P.gold,
  red: P.cloth.red, purple: P.cloth.purple, green: P.cloth.green, blue: P.cloth.blue,
  flame: ramp("#a02a10", "#f06a1a", "#ffb03a", "#ffe88a", "#fffbe0"),
  vflame: ramp("#3a1468", "#6a2ab0", "#a05aff", "#d0a8ff", "#fbeaff"),
};

/** AO под основанием и короткая мягкая тень вправо-вниз (свет сверху-слева). */
export function footShadow(pc: PC, x0: number, x1: number, yb: number, h: number) {
  const len = Math.min(10, 3 + h * 0.12);
  for (let y = yb - 2; y < yb + len; y++) for (let x = x0 - 1; x < x1 + len + 2; x++) {
    const dy = y - yb, sk = Math.max(0, dy) * 0.8;
    if (x < x0 - 1 + sk * 0.5 || x > x1 + sk) continue;
    const k = dy < 0 ? 0.62 : dy < 2 ? 0.5 + dy * 0.06 : 0.66 + (dy / len) * 0.3;
    mul(pc, x, y, k);
  }
}
/** Брусок 3/4: верх глубиной top px, лицо высотой face px, основание по yb. Правая треть лица темнее. */
export function block(pc: PC, x: number, yb: number, w: number, top: number, face: number, rTop: Ramp, rFace: Ramp = rTop, opt: { grainTop?: boolean; noShadow?: boolean } = {}) {
  if (!opt.noShadow) footShadow(pc, x, x + w, yb, top + face);
  const y0 = yb - face - top;
  for (let y = y0; y < yb; y++) for (let xx = x; xx < x + w; xx++) {
    const lx = xx - x, ly = y - y0;
    let c: RGBA;
    if (lx === 0 || lx === w - 1 || y === y0 || y === yb - 1) c = (y < yb - face ? rTop : rFace)[0];
    else if (y < yb - face) {
      const g = opt.grainTop ? (hash01(Math.floor(lx / 9), ly, 7) - 0.5) * 0.6 : 0;
      c = y === yb - face - 1 ? tone(rTop, 4) : ly === 1 ? tone(rTop, 2.4) : tone(rTop, (lx < 3 ? 3.4 : 3) + g);
    } else {
      const fy = y - (yb - face);
      c = fy === 0 ? tone(rFace, 1.2) : tone(rFace, (lx > w * 0.68 ? 1.5 : 2.1) - (fy / face) * 0.5);
    }
    pc.set(xx, y, c);
  }
}
/** Вертикальный цилиндр 3/4: крышка-эллипс ry = 0,4·r, лицо с бликом слева. */
export function cyl(pc: PC, cx: number, yTop: number, yb: number, r: number, mat: Ramp, cap: Ramp = mat, noShadow = false) {
  const ry = Math.max(1, Math.round(r * 0.4));
  if (!noShadow) footShadow(pc, cx - r, cx + r, yb, yb - yTop);
  for (let y = yTop; y <= yb + ry; y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const u = (x + 0.5 - cx) / r;
    if (Math.abs(u) > 1) continue;
    const c = Math.sqrt(1 - u * u), bot = yb + ry * c - ry;
    if (y > bot) continue;
    const edge = Math.abs(u) > 0.86 || y >= Math.floor(bot);
    const v = 1.2 + (1 - Math.abs(u + 0.35)) * 2.2;
    pc.set(x, y, edge ? mat[0] : tone(mat, v));
  }
  for (let y = yTop - ry; y <= yTop + ry; y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - yTop) / ry, d = dx * dx + dy * dy;
    if (d > 1) continue;
    pc.set(x, y, d > 0.7 ? (dy > 0 ? cap[cap.length - 1] : cap[0]) : tone(cap, 2.6 - dx * 0.6));
  }
}
/** Язык пламени (статичный кадр). */
export function flame(pc: PC, cx: number, yb: number, h: number, r: Ramp = PR.flame) {
  const w = Math.max(2, h * 0.38);
  for (let y = yb - h; y <= yb; y++) {
    const t = (yb - y) / h, half = w * Math.sin(Math.min(1, (1 - t) * 1.3) * Math.PI * 0.5) * (1 - t * 0.55);
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const d = Math.abs(x + 0.5 - cx) / Math.max(0.6, half);
      if (d > 1) continue;
      const heat = (1 - d) * (1 - t * 0.6);
      pc.set(x, y, tone(r, heat > 0.6 ? 4 : heat > 0.4 ? 3 : heat > 0.2 ? 2 : 1));
    }
  }
}
/** Тёплый свет: сложение к цвету, эллипс ry = 0,55·rx, спад квадратичный. */
export function glowLight(pc: PC, cx: number, cy: number, rx: number, col: RGBA, k: number) {
  const ry = rx * 0.55;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d >= 1) continue;
    const c = pc.get(x, y); if (!c || !c[3]) continue;
    const a = k * (1 - d) ** 2;
    // свет и умножает (освещает тон), и добавляет тёплый цвет
    pc.set(x, y, [Math.min(255, c[0] * (1 + a * 0.6) + col[0] * a * 0.35), Math.min(255, c[1] * (1 + a * 0.5) + col[1] * a * 0.3), Math.min(255, c[2] * (1 + a * 0.3) + col[2] * a * 0.2), 255].map(Math.round) as RGBA);
  }
}
/** Окно в задней стене: арка с переплётом, стекло светлое к верху; пятно света на полу — косой параллелограмм вправо-вниз. */
export function windowLight(pc: PC, x: number, wallBot: number, w: number, h: number, frame: Ramp, glass: RGBA, floorY1: number, k = 0.55) {
  const top = wallBot - h - 12;
  for (let y = top; y < top + h; y++) for (let xx = x; xx < x + w; xx++) {
    const lx = xx - x, ly = y - top, r = w / 2;
    if (ly < r && Math.hypot(lx - r + 0.5, r - ly - 0.5) > r) continue;
    const rim = lx === 0 || lx === w - 1 || y === top + h - 1 || (ly < r && Math.hypot(lx - r + 0.5, r - ly - 0.5) > r - 1.5);
    const bar = lx === Math.floor(w / 2) || ly === Math.floor(h * 0.55);
    pc.set(xx, y, rim ? frame[0] : bar ? frame[2] : mix(glass, [255, 250, 230, 255], clamp(1 - ly / h) * 0.5));
  }
  for (let xx = x - 1; xx < x + w + 1; xx++) { pc.set(xx, top + h, frame[3]); pc.set(xx, top + h + 1, frame[1]); }
  // пятно света
  const y0 = wallBot + 6, y1 = Math.min(floorY1, wallBot + 6 + h * 1.6);
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / (y1 - y0), sx = x + 4 + t * w * 0.9, ww = w * 0.9;
    for (let xx = Math.floor(sx); xx < sx + ww; xx++) {
      const e = Math.min(xx - sx, sx + ww - xx, (y - y0) * 1.5, y1 - y) / 4;
      const a = k * clamp(e) * (1 - t * 0.5);
      const c = pc.get(xx, y); if (!c) continue;
      pc.set(xx, y, [Math.min(255, c[0] * (1 + a * 0.55) + 22 * a), Math.min(255, c[1] * (1 + a * 0.5) + 18 * a), Math.min(255, c[2] * (1 + a * 0.35) + 8 * a), 255].map(Math.round) as RGBA);
    }
  }
}

// ---------- предметы ----------
export type Light = [number, number, number, RGBA, number]; // cx, cy, rx, цвет, сила
const WARM: RGBA = [255, 170, 80, 255], VIOLET: RGBA = [170, 90, 255, 255];

export function table(pc: PC, x: number, yb: number, w = 44) {
  footShadow(pc, x + 2, x + w - 2, yb, 18);
  for (const lx of [3, w - 5]) for (let y = yb - 10; y < yb; y++) { pc.set(x + lx, y, PR.wood[1]); pc.set(x + lx + 1, y, PR.wood[0]); }
  block(pc, x, yb - 9, w, 14, 4, PR.tableTop, PR.darkWood, { grainTop: true, noShadow: true });
}
export function bench(pc: PC, x: number, yb: number, w = 40) {
  footShadow(pc, x + 1, x + w - 1, yb, 8);
  for (const lx of [2, w - 4]) for (let y = yb - 5; y < yb; y++) pc.set(x + lx, y, PR.wood[0]);
  block(pc, x, yb - 4, w, 5, 3, PR.tableTop, PR.darkWood, { noShadow: true });
}
export function barrel(pc: PC, cx: number, yb: number) {
  cyl(pc, cx, yb - 20, yb, 8, PR.wood, PR.wood);
  for (const hy of [yb - 16, yb - 5]) for (let x = cx - 8; x <= cx + 8; x++) { const c = pc.get(x, hy); if (c && c[3]) pc.set(x, hy, x < cx ? PR.iron[3] : PR.iron[1]); }
}
export function crate(pc: PC, x: number, yb: number, s = 18) {
  block(pc, x, yb, s, 8, s - 4, PR.wood, PR.wood);
  for (let y = yb - s + 5; y < yb - 1; y += 5) for (let xx = x + 1; xx < x + s - 1; xx++) pc.set(xx, y, PR.wood[1]);
}
export function brazier(pc: PC, cx: number, yb: number, lights: Light[], violet = false) {
  footShadow(pc, cx - 9, cx + 9, yb, 16);
  for (const dx of [-6, 0, 6]) for (let y = yb - 8; y < yb; y++) pc.set(cx + dx + (dx ? Math.sign(dx) * Math.floor((y - yb + 8) / 4) : 0), y, PR.iron[dx < 0 ? 2 : 1]);
  cyl(pc, cx, yb - 15, yb - 8, 10, PR.iron, violet ? PR.purple : ramp("#3a0c06", "#8a2a0e", "#e05412", "#ff9a2a", "#ffe07a"), true);
  for (let i = 0; i < 6; i++) pc.set(cx - 6 + i * 2 + (i % 2), yb - 15 - (i % 2), violet ? PR.vflame[3] : PR.flame[3]);
  flame(pc, cx - 2, yb - 16, 13, violet ? PR.vflame : PR.flame);
  flame(pc, cx + 3, yb - 16, 9, violet ? PR.vflame : PR.flame);
  lights.push([cx, yb - 2, 70, violet ? VIOLET : WARM, violet ? 0.55 : 0.7]);
}
export function candles(pc: PC, cx: number, yb: number, lights: Light[], gold = true) {
  const m = gold ? PR.gold : PR.iron;
  footShadow(pc, cx - 5, cx + 5, yb, 24);
  cyl(pc, cx, yb - 4, yb, 5, m, m, true);
  for (let y = yb - 22; y < yb - 3; y++) { pc.set(cx, y, m[3]); pc.set(cx + 1, y, m[1]); }
  for (let x = cx - 7; x <= cx + 7; x++) { pc.set(x, yb - 22, m[2]); pc.set(x, yb - 21, m[0]); }
  for (const dx of [-6, 0, 6]) { cyl(pc, cx + dx, yb - 28, yb - 22, 1.6, PR.wax, PR.wax, true); flame(pc, cx + dx, yb - 29, 5); }
  lights.push([cx, yb - 4, 52, WARM, 0.55]);
}
export function column(pc: PC, cx: number, yb: number, r: Ramp, h = 70) {
  block(pc, cx - 15, yb, 30, 12, 6, r, r);
  cyl(pc, cx, yb - 18 - h, yb - 18, 9, r, r, true);
  block(pc, cx - 13, yb - 18 - h + 2, 26, 6, 5, r, r, { noShadow: true });
}
export function sarcophagus(pc: PC, x: number, yb: number, r: Ramp, w = 52) {
  block(pc, x, yb, w, 22, 12, r, r);
  for (let xx = x + 2; xx < x + w - 2; xx++) pc.set(xx, yb - 14, r[1]);
  for (let y = yb - 31; y < yb - 16; y++) for (let xx = x + w / 2 - 1; xx <= x + w / 2; xx++) pc.set(xx, y, r[1]);
  for (let xx = x + w / 2 - 6; xx <= x + w / 2 + 5; xx++) pc.set(xx, yb - 27, r[1]);
}
export function bed(pc: PC, x: number, yb: number) {
  block(pc, x, yb, 34, 40, 8, PR.wood, PR.wood);
  block(pc, x + 2, yb - 8, 30, 30, 3, PR.green, PR.green, { noShadow: true });
  block(pc, x + 4, yb - 40, 26, 7, 3, PR.wax, PR.wax, { noShadow: true });
}
export function counter(pc: PC, x: number, yb: number, w: number) {
  block(pc, x, yb, w, 12, 16, PR.wood, PR.wood, { grainTop: true });
  for (let xx = x + 12; xx < x + w; xx += 24) for (let y = yb - 15; y < yb - 1; y++) pc.set(xx, y, PR.wood[1]);
}
export function altar(pc: PC, x: number, yb: number, w: number, r: Ramp, cloth: Ramp, trim: RGBA) {
  block(pc, x, yb, w, 16, 18, r, r);
  for (let y = yb - 34; y < yb - 6; y++) for (let xx = x + w / 2 - 10; xx < x + w / 2 + 10; xx++) {
    const ly = y - (yb - 34);
    pc.set(xx, y, ly < 16 ? tone(cloth, 2.6) : xx === x + w / 2 - 10 || xx === x + w / 2 + 9 ? trim : tone(cloth, 2 - (xx > x + w / 2 + 3 ? 0.6 : 0)));
  }
}
export function bones(pc: PC, x: number, yb: number) {
  footShadow(pc, x, x + 16, yb, 4);
  for (let i = 0; i < 4; i++) { const y = yb - 2 - i, x0 = x + 1 + i * 2; for (let k = 0; k < 10 - i; k++) pc.set(x0 + k, y, i % 2 ? P.bone[2] : P.bone[3]); pc.set(x0 - 1, y, P.bone[0]); }
}
export function applyLights(pc: PC, lights: Light[], night = false) {
  for (const [cx, cy, rx, col, k] of lights) glowLight(pc, cx, cy, rx * (night ? 1.25 : 1), col, k * (night ? 1.6 : 1));
}
