/**
 * Поля вечных битв: воткнутое оружие, щиты, стрелы, воронки, обломки и пятна — в объёме, с вариантами (замена плоским sword/arrows из bf-gen2.ts).
 * Основа — tools/gen/volume-lib.ts (вид 3/4, свет сверху слева, тон по нормали), тень у основания — tools/gen/shadow.ts (контактная; длинную рисует клиент).
 * Кадры выравниваются по низу-центру (frame32), как остальные bf_*: опора объекта — нижняя середина (у воткнутого — земля у основания).
 * Фракции: Сольгард — светлая сталь, золото, лазурь; Умбрат — тёмная сталь, кость, пурпур. Варианты берёт карта по хэшу клетки (shared/decor.ts).
 */
import {
  PC, hash01, hex, mix, pnoise, ramp, withA, type RGBA, type Ramp, type N3,
  CLOTH, WOOD, IRON, LEATHER, ROPE, STONE, STRAW, OUT,
  box, face, fillPoly, cylV, ellipseFace, log, shadowDisc, shadowBox, depth, litC, grain, finish, frame32, noTex,
} from "./volume-lib";

type Pt = [number, number];
const DIRT = ramp("#1e150e", "#382719", "#58402a", "#7a5a3a", "#9c7a52");
const ASH = ramp("#0c0a0c", "#1a1618", "#2a2426", "#3c3436", "#52484a");
const STEEL = ramp("#2a303c", "#46526a", "#74829c", "#a8b6ca", "#d8e2f2", "#ffffff");
const DSTEEL = ramp("#0c0a12", "#1a1826", "#2e2a42", "#48425e", "#6a6086", "#9488b4");
const GOLD = ramp("#4a2c0c", "#85521a", "#c98a28", "#f0c040", "#fff0a0", "#ffffe6");
const BONE = ramp("#2a2230", "#4a4258", "#7a7088", "#aea2b8", "#d6cce0", "#f2ecf6");
const PURPLE_GLOW: RGBA = hex("#b480ff"), BLOOD: RGBA = [96, 22, 28, 255];
const NZ: N3 = [0, 0, 1];

interface Fac { steel: Ramp; trim: Ramp; cloth: Ramp; cloth2: Ramp; wood: Ramp; umb: boolean }
const SOL: Fac = { steel: STEEL, trim: GOLD, cloth: CLOTH.blue, cloth2: CLOTH.white, wood: WOOD, umb: false };
const UMB: Fac = { steel: DSTEEL, trim: BONE, cloth: CLOTH.purple, cloth2: CLOTH.black, wood: ramp("#120c0e", "#21171a", "#332428", "#483438", "#5e484a", "#76585a"), umb: true };

/** Курган земли у основания воткнутого предмета: бугор с камешками и пучком травы; (cx, gy) — центр основания. */
function mound(pc: PC, cx: number, gy: number, rx: number, h: number, seed: number) {
  const ry = rx * 0.4;
  for (let y = Math.floor(gy - ry - h - 1); y <= Math.ceil(gy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - gy) / ry;
    const d = u * u + v * v;
    if (d > 1) continue;
    // купол: высота над землёй h·(1−d); экранный y смещён вверх на высоту
    const top = gy - h * (1 - d) * 0.9;
    if (y + 0.5 < top) continue;
    const n: N3 = [u * 0.8, 0.55 - Math.abs(v) * 0.2, v * 0.5 + 0.35];
    pc.set(x, y, litC(DIRT, n, (pnoise(x, y, 3, 256, seed) - 0.5) * 0.9 + (d > 0.8 ? -0.25 : 0)));
  }
  // камешки и травинки
  for (let k = 0; k < 4; k++) {
    const a = hash01(k, seed, 3) * Math.PI * 2, rr = 0.55 + hash01(k, seed, 4) * 0.4;
    const sx = cx + Math.cos(a) * rx * rr, sy = gy + Math.sin(a) * ry * rr;
    if (k % 2) ellipseFace(pc, sx, sy - 0.5, 1.5, 1, STONE, [-0.3, 0.7, 0.5]);
    else { pc.set(Math.round(sx), Math.round(sy) - 1, hex("#4a7a30")); pc.set(Math.round(sx) + 1, Math.round(sy) - 2, hex("#6a9a44")); pc.set(Math.round(sx), Math.round(sy) - 2, hex("#3a6226")); }
  }
}

/** Клинок: ось от (x0,y0) к (x1,y1), ширина w, остриё на конце tip px; желобок посередине, кромка светлее. */
function blade(pc: PC, x0: number, y0: number, x1: number, y1: number, w: number, steel: Ramp, tip = 6, umb = false) {
  log(pc, x0, y0, x1, y1, w, steel, { tip, end: null, tex: (x, y) => (pnoise(x, y, 4, 256, 9) - 0.5) * 0.3 });
  // желобок: тёмная нить по оси
  const L = Math.hypot(x1 - x0, y1 - y0);
  for (let t = 3; t < L - tip; t += 1) {
    const px = x0 + ((x1 - x0) * t) / L, py = y0 + ((y1 - y0) * t) / L;
    pc.set(Math.round(px), Math.round(py), litC(steel, NZ, -1.1));
    if (umb && t % 5 === 2) pc.set(Math.round(px), Math.round(py), PURPLE_GLOW);
  }
}
function hilt(pc: PC, f: Fac, x: number, y: number, tilt: number, len = 9, guard = 6) {
  // y — место перекрестия, рукоять уходит вверх на len, навершие; tilt — смещение по x на высоту
  const gx = x, gy = y;
  const topX = x + tilt * len, topY = y - len;
  log(pc, gx, gy, topX, topY, 1.2, LEATHER, { end: null, tex: (px, py) => ((px + py) % 2 ? -0.3 : 0.2) });
  log(pc, gx - guard, gy + 0.6, gx + guard, gy - 0.6, 1.3, f.trim, { end: null });
  ellipseFace(pc, gx - guard, gy + 0.6, 1.3, 1.6, f.trim, [-0.6, 0.4, 0.7]); ellipseFace(pc, gx + guard, gy - 0.6, 1.3, 1.6, f.trim, [0.6, 0.4, 0.7]);
  ellipseFace(pc, topX, topY - 1, 2.1, 2.1, f.trim, [-0.4, 0.7, 0.6]);
  pc.set(Math.round(topX) - 1, Math.round(topY) - 2, hex("#ffffff"));
}
/** Обрывок знамени, повязанный на оружие: полотнище в складках. */
function rag(pc: PC, x: number, y: number, w: number, h: number, cloth: Ramp, seed: number) {
  fillPoly(pc, [[x, y], [x + w, y + 1], [x + w - 1, y + h * 0.6], [x + w + 1, y + h], [x + w * 0.5, y + h - 2], [x, y + h * 0.8]], (px, py) => litC(cloth, [Math.sin((px - x) * 1.3 + seed) * 0.6, 0.1, 1], (pnoise(px, py, 3, 256, seed) - 0.5) * 0.5 - (py - y) / h * 0.4));
}
function helm(pc: PC, f: Fac, cx: number, cy: number) {
  // шлем: купол, прорезь забрала; у Умбрата — рога
  ellipseFace(pc, cx, cy, 5, 5, f.steel, [-0.3, 0.6, 0.8]);
  for (let y = Math.round(cy); y <= Math.round(cy) + 5; y++) for (let x = Math.round(cx) - 5; x <= Math.round(cx) + 5; x++) {
    const u = (x + 0.5 - cx) / 5;
    if (Math.abs(u) <= 1 && y + 0.5 > cy + 1) pc.set(x, y, litC(f.steel, [u, -0.2, Math.sqrt(1 - u * u)], -0.2));
  }
  for (let x = Math.round(cx) - 3; x <= Math.round(cx) + 3; x++) pc.set(x, Math.round(cy) + 2, litC(f.steel, NZ, -1.6));
  if (f.umb) { log(pc, cx - 4, cy - 2, cx - 8, cy - 8, 1.2, BONE, { tip: 5 }); log(pc, cx + 4, cy - 2, cx + 8, cy - 8, 1.1, BONE, { tip: 5 }); }
  else { log(pc, cx, cy - 4, cx + 1, cy - 9, 1.3, f.trim, { end: null }); rag(pc, cx + 1, cy - 10, 5, 5, CLOTH.red, 3); }
}

// ---------------- воткнутые мечи ----------------
/** v: a — прямой, b — наклонён с лоскутом знамени, c — сломан (обломок клинка и рукоять рядом), d — со шлемом на навершии. */
function swordPlanted(f: Fac, v: number): PC {
  const pc = new PC(40, 56), cx = 18, gy = 50;
  shadowDisc(pc, cx, gy, 7, 2.5, 30);
  if (v === 2) {
    mound(pc, cx, gy, 8, 4, 11);
    // обломок: торчит 10 px, излом рваный
    blade(pc, cx, gy - 1, cx + 1, gy - 14, 1.7, f.steel, 0);
    for (const [dx, dy] of [[-1, 0], [0, 1], [1, 0], [0, 1]] as const) pc.set(cx + dx + 1, gy - 14 + dy - 1, litC(f.steel, [0, 1, 0.3], 0.5));
    // верхняя часть лежит на земле: клинок с остриём и рукоять
    blade(pc, 21, gy + 1, 33, gy - 3, 1.4, f.steel, 6, f.umb);
    log(pc, 8, gy + 1, 14, gy - 1, 1.1, LEATHER, { end: null }); log(pc, 14, gy - 4, 15, gy + 3, 1.2, f.trim, { end: null }); ellipseFace(pc, 7, gy + 1, 1.8, 1.4, f.trim, [-0.4, 0.7, 0.6]);
    return finish(pc);
  }
  const tilt = v === 1 ? 0.34 : v === 3 ? 0.02 : 0.08, gy2 = 25;
  mound(pc, cx, gy, 8, 4, 11 + v);
  const tx = cx + (gy - gy2) * tilt;
  blade(pc, cx, gy - 2, tx, gy2, 1.8, f.steel, 0, f.umb);
  hilt(pc, f, tx, gy2, tilt * 0.6, 10, 6.5);
  if (v === 1) rag(pc, tx - 6, gy2 - 8, 8, 12, f.cloth, 5);
  if (v === 3) helm(pc, f, tx + tilt * 10, gy2 - 16);
  return frame32(pc);
}

// ---------------- воткнутые копья ----------------
/** v: a — прямое с вымпелом, b — наклонное, древко сломано (наконечник на земле), c — два копья крест-накрест. */
function spearPlanted(f: Fac, v: number): PC {
  const pc = new PC(44, 84), cx = 22, gy = 78;
  shadowDisc(pc, cx, gy, 7, 2.5, 50);
  mound(pc, cx, gy, 8, 4, 21 + v);
  const head = (x: number, y: number, ang: number) => {
    const dx = Math.sin(ang), dy = -Math.cos(ang), px = Math.cos(ang), py = Math.sin(ang);
    const pts: Pt[] = [[x, y], [x + px * 3 + dx * 5, y + py * 3 + dy * 5], [x + dx * 14, y + dy * 14], [x - px * 3 + dx * 5, y - py * 3 + dy * 5]];
    face(pc, pts, f.steel, [-0.2 * px, 0.6, 0.8]);
    log(pc, x, y, x + dx * 12, y + dy * 12, 0.7, f.steel, { end: null, tex: () => -0.9 });
    log(pc, x - px * 2, y - py * 2, x + px * 2, y + py * 2, 1.0, f.trim, { end: null });
  };
  if (v === 0) {
    log(pc, cx, gy - 1, cx + 2, 24, 1.5, f.wood, { end: null });
    head(cx + 2, 24, 0.04);
    // вымпел
    fillPoly(pc, [[cx + 2, 27], [cx + 15, 29], [cx + 12, 33], [cx + 16, 38], [cx + 2, 36]], (x, y) => litC(f.cloth, [Math.sin(x * 0.9) * 0.6, 0.1, 1], (pnoise(x, y, 3, 256, 4) - 0.5) * 0.5 - (x - cx) * 0.03));
    for (let x = cx + 3; x < cx + 12; x += 3) pc.set(x, 30 + (x % 2), f.trim[3]);
  } else if (v === 1) {
    log(pc, cx, gy - 1, cx + 10, 40, 1.5, f.wood, { end: null });
    // излом: расщеплённый конец
    for (const [dx, dy] of [[-2, 0], [0, -2], [2, -1], [1, 1]] as const) log(pc, cx + 10 + dx, 40, cx + 10 + dx + 1, 36 + dy, 0.8, f.wood, { end: null });
    // наконечник отдельно, на земле
    log(pc, 4, gy + 1, 20, gy - 5, 1.1, f.wood, { end: null });
    face(pc, [[19, gy - 4], [28, gy - 8], [32, gy - 9], [28, gy - 4], [21, gy - 1]], f.steel, [0, 0.7, 0.7]);
  } else {
    log(pc, cx - 3, gy - 1, cx + 8, 18, 1.5, f.wood, { end: null }); head(cx + 8, 18, 0.25);
    log(pc, cx + 4, gy - 1, cx - 8, 26, 1.5, f.wood, { end: null }); head(cx - 8, 26, -0.4);
    rag(pc, cx - 2, 38, 8, 9, f.cloth, 6);
  }
  return frame32(pc);
}

// ---------------- щиты ----------------
function shieldBody(pc: PC, f: Fac, cx: number, cy: number, rx: number, ry: number, kite: boolean, seed: number) {
  // толщина — боковая тень
  for (let y = Math.floor(cy - ry); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx); x <= cx + rx + 3; x++) {
    const dx = (x + 0.5 - cx - 2) / rx, dy = (y + 0.5 - cy + 1.5) / ry;
    const d = kite && dy > 0 ? dx * dx + dy * dy * 0.55 + dx * dx * dy * 1.2 : dx * dx + dy * dy;
    if (d <= 1) pc.set(x, y, litC(f.steel, [1, 0, 0.1], -0.3));
  }
  for (let y = Math.floor(cy - ry); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    let d = dx * dx + dy * dy;
    if (kite && dy > 0) d = dx * dx + dy * dy * 0.55 + dx * dx * dy * 1.2;
    if (d > 1) continue;
    const rim = d > 0.7, n: N3 = [dx * 0.7, -dy * 0.7, Math.sqrt(Math.max(0.1, 1 - d * 0.5))];
    const wear = (pnoise(x, y, 3, 256, seed) - 0.5) * 0.7 + (hash01(x, y, seed) < 0.03 ? -1 : 0);
    // гербовое поле: Сольгард — лазурь с золотым солнцем, Умбрат — чернь с пурпурной короной
    const base = f.umb ? CLOTH.black : CLOTH.blue;
    pc.set(x, y, litC(rim ? f.trim : base, n, wear + (rim ? 0.15 : 0)));
  }
  // умбон
  ellipseFace(pc, cx, cy, 2.8, 2.8, f.steel, [-0.4, 0.5, 0.9]);
  pc.set(Math.round(cx) - 1, Math.round(cy) - 1, hex("#ffffff"));
  if (f.umb) { // корона
    for (const [dx, dy] of [[-4, -5], [-2, -7], [0, -5], [2, -7], [4, -5]] as const) pc.set(Math.round(cx) + dx, Math.round(cy) + dy, PURPLE_GLOW);
    for (let x = -4; x <= 4; x++) pc.set(Math.round(cx) + x, Math.round(cy) - 4, withA(PURPLE_GLOW, 255));
  } else { // солнце
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; pc.set(Math.round(cx + Math.cos(a) * 4.8), Math.round(cy + Math.sin(a) * 4.8), GOLD[3]); }
  }
}
function arrowStuck(pc: PC, x: number, y: number, ang: number, len: number, shaft: Ramp = WOOD) {
  const ex = x + Math.sin(ang) * len, ey = y - Math.cos(ang) * len;
  log(pc, x, y, ex, ey, 0.75, shaft, { end: null });
  // оперение
  fillPoly(pc, [[ex, ey], [ex - 2, ey - 3], [ex + 0.5, ey - 3.5], [ex + 2, ey - 2]], () => hex("#d8d0c0"));
  pc.set(Math.round(ex), Math.round(ey) - 3, hex("#a89c84"));
}
/** v: a — стоит, три стрелы; b — наклонён, трещина; c — каплевидный (кайт), в нём торчит топор. */
function shieldPlanted(f: Fac, v: number): PC {
  const pc = new PC(52, 60), cx = 26, gy = 54;
  shadowDisc(pc, cx, gy, 9, 3, 28);
  mound(pc, cx, gy, 10, 4, 31 + v);
  const body = new PC(52, 60);
  shieldBody(body, f, cx, 41, v === 2 ? 9 : 11, v === 2 ? 14 : 12.5, v === 2, 41 + v);
  if (v === 1) { for (const [x, y] of [[cx - 2, 31], [cx - 1, 33], [cx + 1, 35], [cx + 1, 38], [cx + 3, 40], [cx + 2, 43]] as const) body.set(x, y, litC(f.steel, NZ, -1.8)); }
  if (v === 0) for (const [dx, dy, a] of [[-5, -4, -0.5], [4, -6, 0.35], [1, 5, 0.05]] as const) arrowStuck(body, cx + dx, 41 + dy, a, 12);
  if (v === 2) { // топор, засевший в щите
    log(body, cx + 4, 41, cx + 15, 29, 1.2, f.wood, { end: null });
    face(body, [[cx + 1, 42], [cx + 5, 37], [cx + 9, 41], [cx + 5, 45]], IRON, [0, 0.6, 0.8]);
  }
  pc.blit(v === 1 ? body.rotated(0.28, cx, 52) : body, 0, 0);
  // нижний край вдавлен в землю: поверх — бугор
  mound(pc, cx, gy, 10, 3, 51 + v);
  return frame32(pc);
}

// ---------------- топоры, молоты ----------------
/** v: a — длинный топор в земле, b — топор в колоде, c — боевой молот. */
function axePlanted(v: number): PC {
  const pc = new PC(44, 60), cx = 20, gy = 54;
  shadowDisc(pc, cx, gy, 8, 2.8, 26);
  if (v === 1) {
    // колода: цилиндр со спилом, топор в верхушке
    cylV(pc, cx, 34, gy - 2, 10, WOOD, { k: 0.45, cap: WOOD, tex: (phi, y) => (pnoise(phi * 6, y, 3, 256, 5) - 0.5) * 0.8 });
    ellipseFace(pc, cx, 34, 8.2, 3.6, ramp("#4a3018", "#6a4a2a", "#8a6a40", "#a8845a"), [0, 1, 0.3], (x, y) => (Math.floor(Math.hypot((x - cx) / 2, (y - 34) / 0.9)) % 2 ? -0.35 : 0.1));
    log(pc, cx + 2, 33, cx + 13, 14, 1.3, WOOD, { end: null });
    face(pc, [[cx - 3, 33], [cx + 3, 30], [cx + 5, 36], [cx - 1, 38]], IRON, [-0.1, 0.6, 0.8]);
    log(pc, cx - 3, 33, cx - 1, 38, 0.8, IRON, { end: null, tex: () => 0.9 });
    return frame32(pc);
  }
  mound(pc, cx, gy, 8, 4, 61 + v);
  log(pc, cx, gy - 2, cx + 3, 18, 1.5, WOOD, { end: null, tex: (x, y) => ((x * 3 + y) % 7 === 0 ? -0.5 : 0) });
  if (v === 0) {
    face(pc, [[cx + 3, 16], [cx + 14, 8], [cx + 17, 20], [cx + 3, 26]], IRON, [0.2, 0.5, 0.8]);
    log(pc, cx + 14, 8, cx + 17, 20, 1.0, STEEL, { end: null });
    log(pc, cx + 2, 15, cx + 2, 27, 1.4, IRON, { end: null });
  } else {
    // молот: боёк и клюв
    box(pc, cx - 3, 12, 9, 8, 4, { r: IRON, tex: grain(2, 0.25) }, { r: IRON }, { r: IRON });
    face(pc, [[cx + 6, 14], [cx + 13, 16], [cx + 6, 18]], STEEL, [0.4, 0.4, 0.8]);
    ellipseFace(pc, cx + 1.5, 8, 2.6, 1.4, STEEL, [0, 1, 0.3]);
  }
  return frame32(pc);
}

// ---------------- стрелы ----------------
/** v: a — три веером, b — пучок из пяти, c — две стрелы и сломанный лук, d — залп под наклоном. */
function arrowsPlanted(v: number): PC {
  const pc = new PC(44, 48), cx = 22, gy = 42;
  shadowDisc(pc, cx, gy, 9, 3, 20);
  mound(pc, cx, gy, 10, 3, 71 + v);
  const set: [number, number, number, number][] = v === 0 ? [[-8, 0, -0.3, 26], [0, 2, 0.04, 29], [8, 0, 0.32, 26]]
    : v === 1 ? [[-9, 0, -0.35, 24], [-4, 2, -0.12, 28], [0, 1, 0.02, 31], [5, 2, 0.14, 27], [9, 0, 0.36, 24]]
    : v === 2 ? [[-4, 1, -0.2, 27], [5, 1, 0.22, 25]]
    : [[-9, 1, 0.5, 24], [-4, 2, 0.6, 27], [2, 1, 0.45, 25], [8, 2, 0.55, 22]];
  for (const [dx, dy, a, l] of set) arrowStuck(pc, cx + dx, gy + dy, a, l);
  if (v === 2) {
    // сломанный лук: две половины, тетива
    log(pc, 4, gy + 1, 12, gy - 4, 1.3, WOOD, { end: null }); log(pc, 24, gy + 2, 36, gy - 3, 1.3, WOOD, { end: null });
    log(pc, 12, gy - 4, 24, gy + 2, 0.5, ROPE, { end: null });
  }
  return frame32(pc);
}

// ---------------- воронки, обломки, пятна ----------------
/** Воронка: вал по краю, чёрная гарь в центре. v: a — тлеющая (угли), b — сухая растрескавшаяся, c — с обломком щита. */
function crater(v: number): PC {
  const pc = new PC(72, 40), cx = 36, cy = 22, rx = 28, ry = 11;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const u = (x + 0.5 - cx) / rx, w = (y + 0.5 - cy) / ry, r = Math.hypot(u, w);
    if (r > 1.0) continue;
    // профиль высоты: вал при r≈0.78, яма внутри
    const h = r < 0.78 ? -0.7 * (1 - r / 0.78) ** 0.8 + 0.2 : 0.2 * (1 - (r - 0.78) / 0.22);
    const slope = r < 0.78 ? 0.7 * 0.8 * (1 - r / 0.78) ** -0.2 / 0.78 : -0.2 / 0.22;
    const ux = r > 0 ? u / r : 0, uz = r > 0 ? w / r : 0;
    const n: N3 = [-slope * ux * 0.35, 1, -slope * uz * 0.5];
    const burnt = r < 0.7;
    const col = burnt ? litC(ASH, n, (pnoise(x, y, 3, 256, 5 + v) - 0.5) * 0.9) : litC(DIRT, n, (pnoise(x, y, 3, 256, 7) - 0.5) * 0.8 + (r > 0.93 ? -0.6 : 0));
    pc.set(x, y, burnt && r > 0.62 ? mix(col, DIRT[1] as RGBA, 0.3) : col);
    void h;
  }
  const rnd = (i: number) => hash01(i, v, 17);
  if (v === 0) for (let i = 0; i < 14; i++) { const a = rnd(i) * 6.28, rr = rnd(i + 30) * 0.55; pc.set(Math.round(cx + Math.cos(a) * rr * rx), Math.round(cy + Math.sin(a) * rr * ry), i % 3 ? hex("#c8501a") : hex("#ffa030")); }
  if (v === 1) for (let i = 0; i < 6; i++) { let x = cx + (rnd(i) - 0.5) * 30, y = cy + (rnd(i + 9) - 0.5) * 9; for (let k = 0; k < 7; k++) { pc.set(Math.round(x), Math.round(y), ASH[0]); x += (rnd(i * 7 + k) - 0.3) * 3; y += (rnd(i * 5 + k) - 0.5) * 1.6; } }
  if (v === 2) { shieldBody(pc, UMB, 26, 22, 7, 6, false, 5); for (let k = 0; k < 6; k++) arrowStuck(pc, 40 + k * 2, 24 + (k % 2), -0.5 + k * 0.2, 8); }
  for (let i = 0; i < 10; i++) { const a = rnd(i + 50) * 6.28; ellipseFace(pc, cx + Math.cos(a) * rx * 0.86, cy + Math.sin(a) * ry * 0.86, 1.6, 1.1, STONE, [-0.3, 0.7, 0.5]); }
  return frame32(pc);
}
/** Обломки: доски, дуги бочки, колесо, стрелы. v: a — доски и бочка, b — разбитый ящик и мешки, c — щепа и обод колеса. */
function debris(v: number): PC {
  const pc = new PC(64, 40), gy = 34;
  shadowBox(pc, 6, 54, gy, depth(8), 14);
  const plank = (x: number, y: number, l: number, a: number, w = 1.7) => log(pc, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, w, WOOD, { end: WOOD });
  if (v === 0) {
    plank(8, gy - 2, 22, -0.18); plank(14, gy - 7, 20, 0.12); plank(30, gy - 3, 18, -0.4); plank(26, gy, 20, 0.05, 1.4);
    cylV(pc, 46, gy - 16, gy - 2, 7, WOOD, { k: 0.45, cap: ramp("#241a12", "#32241a", "#42301f", "#56402a"), tex: (phi, y) => ((Math.floor((phi + 2) * 3) % 2) ? -0.3 : 0.2) });
    for (const y of [gy - 12, gy - 6]) for (let x = 39; x <= 53; x++) { const u = (x - 46) / 7; if (Math.abs(u) <= 1) pc.set(x, y, litC(IRON, [u, 0, Math.sqrt(1 - u * u)], 0)); }
    plank(50, gy - 1, 10, 0.5, 1.3);
  } else if (v === 1) {
    box(pc, 10, gy - 12, 16, 12, 8, { r: WOOD, tex: grain(4, 0.2) }, { r: WOOD }, { r: WOOD });
    for (let x = 12; x < 24; x += 3) pc.set(x, gy - 6, WOOD[0]);
    plank(30, gy - 3, 14, -0.1); plank(32, gy - 8, 12, 0.3, 1.5); plank(46, gy - 2, 10, 0.2, 1.3);
    for (const [x, y, s] of [[50, gy - 3, 1.2], [56, gy - 1, 1], [42, gy - 9, 0.9]] as const) { ellipseFace(pc, x, y - s * 2, 4 * s, 4 * s, STRAW, [-0.2, 0.6, 0.7]); ellipseFace(pc, x, y, 4 * s, 2 * s, STRAW, [0.3, 0.3, 0.7]); }
  } else {
    // обод колеса, спицы торчат, щепа
    for (let a = 0; a < 5.2; a += 0.05) { const x = 22 + Math.cos(a) * 12, y = gy - 9 + Math.sin(a) * 6; ellipseFace(pc, x, y, 1.6, 1.3, IRON, [Math.cos(a) * 0.5, 0.5, 0.7]); }
    for (let k = 0; k < 4; k++) log(pc, 22, gy - 9, 22 + Math.cos(k * 1.7) * 10, gy - 9 + Math.sin(k * 1.7) * 5, 0.9, WOOD, { end: null });
    plank(36, gy - 3, 16, -0.3); plank(40, gy - 8, 11, 0.25, 1.3); plank(8, gy - 1, 9, 0.5, 1.2);
    for (let i = 0; i < 9; i++) log(pc, 30 + hash01(i, 1, 5) * 28, gy - hash01(i, 2, 5) * 5, 32 + hash01(i, 1, 5) * 28, gy - 1 - hash01(i, 3, 5) * 4, 0.7, WOOD, { end: null });
  }
  return frame32(pc);
}
/** Пятна: плоские, но с мягким краем и бликом лужи. v: 0 — лужа и брызги, 1 — след волочения, 2 — копоть с углями. */
function stain(kind: "blood" | "scorch", v: number): PC {
  const pc = new PC(kind === "blood" ? 40 : 56, kind === "blood" ? 28 : 32);
  const w = pc.w, h = pc.h, rnd = (i: number) => hash01(i, v + (kind === "blood" ? 100 : 200), 23);
  const dark = kind === "blood" ? ([54, 12, 16, 215] as RGBA) : ([14, 11, 15, 220] as RGBA), mid = kind === "blood" ? ([92, 20, 26, 215] as RGBA) : ([30, 25, 28, 215] as RGBA);
  const blob = (cx: number, cy: number, rx: number, ry: number) => { pc.ellipse(cx, cy, rx, ry, dark); pc.ellipse(cx - 0.5, cy - 0.4, rx * 0.8, ry * 0.75, mid); };
  if (v === 0) { blob(w / 2, h / 2, w * 0.3, h * 0.28); for (let i = 0; i < 7; i++) blob(w / 2 + (rnd(i) - 0.5) * w * 0.8, h / 2 + (rnd(i + 9) - 0.5) * h * 0.7, 1 + rnd(i + 20) * 2, 0.8 + rnd(i + 30)); }
  else if (v === 1) { for (let i = 0; i < 9; i++) blob(5 + i * (w - 10) / 8, h / 2 + Math.sin(i * 0.9) * 3, 3.2 - i * 0.15, 2 - i * 0.1); }
  else { blob(w / 2, h / 2, w * 0.35, h * 0.3); for (let i = 0; i < 6; i++) blob(w / 2 + (rnd(i) - 0.5) * w * 0.7, h / 2 + (rnd(i + 5) - 0.5) * h * 0.6, 2 + rnd(i + 8) * 2, 1.4); }
  // блик лужи: светлый пиксель у верхнего левого края
  if (kind === "blood") { const p = pc.get(Math.round(w / 2 - w * 0.12), Math.round(h / 2 - h * 0.1)); if (p && p[3]) pc.set(Math.round(w / 2 - w * 0.12), Math.round(h / 2 - h * 0.1), [190, 70, 70, 230]); }
  if (kind === "scorch" && v === 2) for (let i = 0; i < 6; i++) { const x = Math.round(w / 2 + (rnd(i + 40) - 0.5) * w * 0.5), y = Math.round(h / 2 + (rnd(i + 50) - 0.5) * h * 0.4); if (pc.get(x, y)?.[3]) pc.set(x, y, i % 2 ? hex("#c8501a") : hex("#ffa030")); }
  void noTex; void OUT; void STONE;
  return frame32(pc);
}

/** Готовые кадры; имена — kind на карте. Первый вариант каждого вида сохраняет прежний id. */
export const BF_PROPS: Record<string, () => PC> = {
  // мечи: Сольгард a–d, Умбрат a–d
  bf_sword_planted: () => swordPlanted(SOL, 0), bf_sword_sol_b: () => swordPlanted(SOL, 1), bf_sword_sol_c: () => swordPlanted(SOL, 2), bf_sword_sol_d: () => swordPlanted(SOL, 3),
  bf_sword_planted_dark: () => swordPlanted(UMB, 0), bf_sword_umb_b: () => swordPlanted(UMB, 1), bf_sword_umb_c: () => swordPlanted(UMB, 2), bf_sword_umb_d: () => swordPlanted(UMB, 3),
  // копья
  bf_spear_sol_a: () => spearPlanted(SOL, 0), bf_spear_sol_b: () => spearPlanted(SOL, 1), bf_spear_sol_c: () => spearPlanted(SOL, 2),
  bf_spear_umb_a: () => spearPlanted(UMB, 0), bf_spear_umb_b: () => spearPlanted(UMB, 1), bf_spear_umb_c: () => spearPlanted(UMB, 2),
  // щиты
  bf_shield_sol_a: () => shieldPlanted(SOL, 0), bf_shield_sol_b: () => shieldPlanted(SOL, 1), bf_shield_sol_c: () => shieldPlanted(SOL, 2),
  bf_shield_umb_a: () => shieldPlanted(UMB, 0), bf_shield_umb_b: () => shieldPlanted(UMB, 1), bf_shield_umb_c: () => shieldPlanted(UMB, 2),
  // топоры и молот
  bf_axe_a: () => axePlanted(0), bf_axe_b: () => axePlanted(1), bf_hammer_a: () => axePlanted(2),
  // стрелы
  bf_arrows_planted: () => arrowsPlanted(0), bf_arrows_b: () => arrowsPlanted(1), bf_arrows_c: () => arrowsPlanted(2), bf_arrows_d: () => arrowsPlanted(3),
  // воронки и обломки
  bf_crater_a: () => crater(0), bf_crater_b: () => crater(1), bf_crater_c: () => crater(2),
  bf_debris_a: () => debris(0), bf_debris_b: () => debris(1), bf_debris_c: () => debris(2),
  // пятна (плоские): кровь a–d, гарь a–c
  bf_blood_a: () => stain("blood", 0), bf_blood_b: () => stain("blood", 1), bf_blood_c: () => stain("blood", 2), bf_blood_d: () => stain("blood", 0),
  bf_scorch: () => stain("scorch", 0), bf_scorch_b: () => stain("scorch", 1), bf_scorch_c: () => stain("scorch", 2),
};
