/**
 * Генератор интерьеров (задача 144): залы data/interiors.json в 3/4 — пол, стены, окна, убранство, свет.
 * Выход — client/public/assets/interiors:
 *   <id>_base.png   — зал целиком (пол, задняя стена с окнами и рельефом, боковые и передняя стены сверху, ковёр, тени под убранством);
 *   <id>_glass.png  — только стёкла окон и светящиеся руны стены (клиент кладёт поверх затемнения: днём ярко, ночью приглушённо);
 *   <id>_shafts.png — лучи света из окон на пол (сложение, только днём);
 *   <id>_glow.png   — свечение ритуального круга (сложение, пульсирует; у храма — блик на ковре от солнечного диска);
 *   prop_<вид>.png  — убранство (опорная точка — нижняя середина следа), рисуется по глубине вместе с героями;
 *   flame_<цвет>.png — пламя свечей и жаровен, 8 кадров;
 *   manifest.json   — размеры, огни убранства и стен (клиент ставит свечение и пламя).
 * Запуск: npx tsx tools/gen/interiors.ts
 */
import fs from "node:fs";
import path from "node:path";
import data from "../../data/interiors.json";
import { PC, hash01, hex, mix, rng, shade, withA, type RGBA, type Ramp } from "./canvas";

const OUT = path.resolve("client/public/assets/interiors");
const T = 32;
const H = (s: string, a = 255) => hex(s, a);
const R = (...s: string[]): Ramp => s.map((c) => H(c));
const ink = H("#140c14");

// ---------- палитры ----------
const SOL = {
  wall: R("#6c5f50", "#8a7d68", "#a89a80", "#c4b79a", "#ddd1b4", "#f0e7cf"),
  cap: R("#7a6e5c", "#978a72", "#b3a68a", "#cdc1a3", "#e2d8bc"),
  floorA: R("#b6ab98", "#c8bead", "#d8cfbf", "#e6ded0", "#f2ece0"),
  floorB: R("#a99c86", "#bdb19b", "#cdc2ad", "#ddd3c0", "#ebe3d3"),
  grout: H("#958a77"),
  gold: R("#4a2e0e", "#7a4e16", "#b07a22", "#dca838", "#f6d36a", "#fff3c0"),
  wood: R("#2e1a10", "#4a2c1a", "#6a4024", "#8a5630", "#a86e3e", "#c48a52"),
  red: R("#3e0a10", "#5e121a", "#7e1a22", "#a0262a", "#c23a36"),
  white: R("#9c968c", "#c0b9ac", "#ddd6c8", "#f2ede2", "#ffffff"),
  column: R("#7c7468", "#9a9284", "#b6ae9e", "#cfc8b8", "#e4dfd2", "#f6f2ea"),
  lead: H("#2a2230"),
  glass: [H("#2f5fbf"), H("#4a8ae8"), H("#d84040"), H("#f2c440"), H("#3aa860"), H("#8a52d0"), H("#7ec8f0"), H("#ffe890")],
};
const UMB = {
  wall: R("#0e0a14", "#17111f", "#211a2b", "#2c2338", "#3a2f48", "#4c3f5e"),
  cap: R("#140f1b", "#1e1727", "#2a2134", "#372c44", "#463a56"),
  floorA: R("#16121b", "#1d1824", "#25202e", "#2e2838", "#3a3346"),
  floorB: R("#130f18", "#1a1520", "#221c29", "#2a2333", "#352d40"),
  grout: H("#09070c"),
  violet: R("#2a0f4e", "#4a1a86", "#7a2ed0", "#a65cff", "#d0a0ff", "#f4e4ff"),
  iron: R("#0c0c12", "#1a1a24", "#2c2c3a", "#44445a", "#62627c", "#8a8aa4"),
  bone: R("#4a4236", "#6e6452", "#968a72", "#bcb096", "#ddd3b8", "#f2ead2"),
  cloth: R("#16081e", "#24102e", "#361846", "#4a2260", "#5e2e7a"),
  obs: R("#07060a", "#0f0d15", "#19162a", "#252040", "#342c58", "#4a3e78"),
};

// ---------- общие приёмы ----------
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const pick = (r: Ramp, t: number) => r[Math.round(clamp(t) * (r.length - 1))];
/** Упорядоченный дизер 4×4: ступени палитры без полос. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dpick = (r: Ramp, t: number, x: number, y: number) => {
  const f = clamp(t) * (r.length - 1), i = Math.floor(f), fr = f - i;
  return r[Math.min(r.length - 1, i + (fr > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? 1 : 0))];
};
/** Затемнение/осветление пикселя (умножение), для теней и бликов на готовом холсте. */
function tint(pc: PC, x: number, y: number, k: number, to?: RGBA, t = 0) {
  const c = pc.get(x, y);
  if (!c || !c[3]) return;
  let n = shade(c, k);
  if (to) n = mix(n, withA(to, n[3]), t);
  const i = (y * pc.w + x) * 4;
  pc.data[i] = n[0]; pc.data[i + 1] = n[1]; pc.data[i + 2] = n[2];
}
/** Мягкая тень-эллипс (контакт с полом). */
function softShadow(pc: PC, cx: number, cy: number, rx: number, ry: number, k = 0.55) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d < 1) tint(pc, x, y, lerp(k, 1, d ** 0.7));
  }
}
/** Вертикальный цилиндр (колонна, ножка): свет слева сверху. */
function cylinder(pc: PC, x: number, y: number, w: number, h: number, r: Ramp, shift = 0.32) {
  for (let i = 0; i < w; i++) {
    const t = (i + 0.5) / w, l = clamp(0.5 + 0.55 * Math.cos((t - shift) * Math.PI * 1.15));
    for (let j = 0; j < h; j++) pc.set(x + i, y + j, dpick(r, l, x + i, y + j));
  }
}
/** Ящик в 3/4: верх (светлый) высотой top, лицевая грань (средняя) высотой face, правый край темнее. */
function box3(pc: PC, x: number, y: number, w: number, top: number, face: number, r: Ramp) {
  for (let j = 0; j < top; j++) for (let i = 0; i < w; i++) pc.set(x + i, y + j, dpick(r, 0.82 + 0.1 * (1 - j / top), x + i, y + j));
  for (let j = 0; j < face; j++) for (let i = 0; i < w; i++) {
    const l = 0.52 - 0.22 * (j / face) - (i > w - 3 ? 0.12 : 0) + (i < 2 ? 0.06 : 0);
    pc.set(x + i, y + top + j, dpick(r, l, x + i, y + top + j));
  }
  for (let i = 0; i < w; i++) pc.set(x + i, y + top, pick(r, 0.95)); // кромка
}
function flameGlowDot(pc: PC, cx: number, cy: number, r: number, c: RGBA) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d < 1) pc.set(x, y, withA(c, Math.round(255 * (1 - d) ** 1.6)));
  }
}

// ---------- кладка ----------
/** Кладка блоками bw×bh со сдвигом рядов: тон блока, швы, светлый верх и тёмный низ каждого блока, редкие сколы. */
function masonry(pc: PC, x0: number, y0: number, w: number, h: number, r: Ramp, bw: number, bh: number, seed: number, base = 0.55, spread = 0.18, mortar?: RGBA) {
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / bh), off = row % 2 ? Math.floor(bw / 2) : 0, by = y % bh;
    for (let x = 0; x < w; x++) {
      const col = Math.floor((x + off) / bw), bx = (x + off) % bw;
      const px = x0 + x, py = y0 + y;
      if (by === bh - 1 || bx === bw - 1) { pc.set(px, py, mortar ?? pick(r, 0.08)); continue; }
      const tone = base + (hash01(col, row, seed) - 0.5) * spread * 2;
      const n = (hash01(px >> 1, py >> 1, seed + 7) - 0.5) * 0.08;
      let l = tone + n;
      if (by === 0) l += 0.16; else if (by === bh - 2) l -= 0.12;
      if (bx === 0) l += 0.07; else if (bx === bw - 2) l -= 0.07;
      pc.set(px, py, dpick(r, l, px, py));
    }
  }
  // сколы и трещины
  const rr = rng(seed + 3);
  for (let k = 0; k < (w * h) / 2600; k++) {
    let cx = x0 + rr() * w, cy = y0 + rr() * h;
    for (let s = 0; s < 6 + rr() * 6; s++) { tint(pc, Math.round(cx), Math.round(cy), 0.6); cx += rr() * 2 - 0.6; cy += rr() * 1.6 - 0.3; }
  }
}

// ---------- пол ----------
function marbleFloor(pc: PC, x0: number, y0: number, w: number, h: number) {
  const s = 16;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x0 + x, py = y0 + y, tx = Math.floor(x / s), ty = Math.floor(y / s), bx = x % s, by = y % s;
    if (bx === s - 1 || by === s - 1) { pc.set(px, py, SOL.grout); continue; }
    const r = (tx + ty) % 2 ? SOL.floorA : SOL.floorB;
    // прожилки мрамора: полосы шума под углом
    const v = Math.sin((x * 0.7 + y * 0.35) * 0.28 + 9 * hash01(tx, ty, 41) + 3 * Math.sin(y * 0.11 + tx)) ;
    let l = 0.55 + (hash01(tx, ty, 42) - 0.5) * 0.2 + (Math.abs(v) < 0.07 ? -0.18 : 0);
    if (by === 0 || bx === 0) l += 0.12;
    if (by === s - 2 || bx === s - 2) l -= 0.1;
    pc.set(px, py, dpick(r, l, px, py));
  }
}
function slateFloor(pc: PC, x0: number, y0: number, w: number, h: number) {
  const s = 32;
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / 24), off = row % 2 ? 16 : 0, by = y % 24;
    for (let x = 0; x < w; x++) {
      const px = x0 + x, py = y0 + y, col = Math.floor((x + off) / s), bx = (x + off) % s;
      if (by === 23 || bx === s - 1) { pc.set(px, py, UMB.grout); continue; }
      const r = hash01(col, row, 61) < 0.5 ? UMB.floorA : UMB.floorB;
      let l = 0.5 + (hash01(col, row, 62) - 0.5) * 0.3 + (hash01(px >> 2, py >> 2, 63) - 0.5) * 0.12;
      if (by === 0 || bx === 0) l += 0.14;
      if (by === 22 || bx === s - 2) l -= 0.14;
      pc.set(px, py, dpick(r, l, px, py));
    }
  }
  // трещины
  const rr = rng(64);
  for (let k = 0; k < 26; k++) {
    let cx = x0 + rr() * w, cy = y0 + rr() * h, a = rr() * 6.28;
    for (let s2 = 0; s2 < 10 + rr() * 14; s2++) { pc.set(Math.round(cx), Math.round(cy), UMB.grout); a += (rr() - 0.5) * 0.9; cx += Math.cos(a); cy += Math.sin(a) * 0.7; }
  }
}
/** Затенение пола у стен и в углах (AO). */
function floorAO(pc: PC, room: Room) {
  const W = room.w * T, Hh = room.h * T, top = room.wall * T;
  for (let y = top; y < Hh - T; y++) for (let x = T; x < W - T; x++) {
    const dTop = y - top, dSide = Math.min(x - T, W - T - 1 - x), dBot = Hh - T - 1 - y;
    let k = 1;
    if (dTop < 22) k *= lerp(0.5, 1, (dTop / 22) ** 0.8);
    if (dSide < 14) k *= lerp(0.62, 1, (dSide / 14) ** 0.8);
    if (dBot < 8) k *= lerp(0.75, 1, dBot / 8);
    if (k < 0.999) tint(pc, x, y, k);
  }
}

// ---------- стены сверху (боковые и передняя) ----------
function wallTops(pc: PC, room: Room, cap: Ramp, seed: number) {
  const W = room.w * T, Hh = room.h * T, d0 = room.door * T, d1 = d0 + 2 * T;
  const strip = (x: number, y: number, w: number, h: number, vertical: boolean) => {
    masonry(pc, x, y, w, h, cap, vertical ? 16 : 24, vertical ? 12 : 16, seed, 0.6, 0.12);
    // внутренняя кромка: светлый верх стены и тёмный обрез
    for (let k = 0; k < (vertical ? h : w); k++) {
      if (vertical) {
        const ex = x < W / 2 ? x + w - 1 : x;
        pc.set(ex, y + k, pick(cap, 1));
        pc.set(x < W / 2 ? ex + 1 : ex - 1, y + k, pick(cap, 0));
      } else {
        pc.set(x + k, y, pick(cap, 1));
      }
    }
  };
  strip(0, 0, T, Hh, true);
  strip(W - T, 0, T, Hh, true);
  strip(T, Hh - T, d0 - T, T, false);
  strip(d1, Hh - T, W - T - d1, T, false);
  // косяки двери
  for (const x of [d0 - 4, d1]) for (let y = Hh - T - 2; y < Hh; y++) for (let i = 0; i < 4; i++) pc.set(x + i, y, pick(cap, i === 0 ? 0.95 : 0.35));
}
/** Порог двери: пол уходит в проём, снаружи свет (днём — тёплый день, сам свет даёт слой лучей). */
function doorway(pc: PC, room: Room, floorDark: Ramp, mat: Ramp, accent: RGBA) {
  const Hh = room.h * T, d0 = room.door * T;
  for (let y = Hh - T; y < Hh; y++) for (let x = d0; x < d0 + 2 * T; x++) {
    const t = (y - (Hh - T)) / T;
    pc.set(x, y, dpick(floorDark, 0.5 - t * 0.45, x, y));
  }
  // ступень порога
  for (let x = d0; x < d0 + 2 * T; x++) { pc.set(x, Hh - T, pick(floorDark, 1)); pc.set(x, Hh - T + 1, pick(floorDark, 0.75)); }
  // коврик у двери
  for (let y = Hh - T - 20; y < Hh - T - 2; y++) for (let x = d0 + 6; x < d0 + 2 * T - 6; x++) {
    const edge = y === Hh - T - 20 || y === Hh - T - 3 || x === d0 + 6 || x === d0 + 2 * T - 7;
    const band = y === Hh - T - 18 || y === Hh - T - 5 || x === d0 + 8 || x === d0 + 2 * T - 9;
    pc.set(x, y, edge ? pick(mat, 0) : band ? accent : dpick(mat, 0.55 + 0.1 * Math.sin(x * 0.9) * Math.sin(y * 0.9), x, y));
  }
}

// ---------- окна ----------
/** Арочный витраж: свинцовые переплёты, цветные стёкла, рамка из камня. Стекло пишется и в слой glass. */
function stainedWindow(pc: PC, glass: PC, cx: number, top: number, w: number, h: number, frame: Ramp, seed: number) {
  const r = w / 2, x0 = Math.round(cx - r);
  const inside = (x: number, y: number) => {
    const dy = y - (top + r);
    if (y < top || y >= top + h || x < x0 || x >= x0 + w) return false;
    if (dy < 0) return Math.hypot(x + 0.5 - cx, dy) < r;
    return true;
  };
  // каменный наличник
  for (let y = top - 4; y < top + h + 4; y++) for (let x = x0 - 4; x < x0 + w + 4; x++) {
    if (inside(x, y)) continue;
    let near = false;
    for (let k = 1; k <= 4 && !near; k++) if (inside(x + k, y) || inside(x - k, y) || inside(x, y + k) || inside(x, y - k)) near = true;
    if (near) pc.set(x, y, dpick(frame, y < top + r ? 0.85 : 0.72 - (x > cx ? 0.12 : 0), x, y));
  }
  // подоконник
  for (let x = x0 - 6; x < x0 + w + 6; x++) { pc.set(x, top + h + 3, pick(frame, 1)); pc.set(x, top + h + 4, pick(frame, 0.6)); pc.set(x, top + h + 5, pick(frame, 0.2)); }
  const cols = SOL.glass;
  for (let y = top; y < top + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!inside(x, y)) continue;
    const lx = x - x0, ly = y - top;
    // переплёт: средник, ромбовая сетка, перемычки
    const diamond = (lx + ly) % 7 === 0 || (lx - ly + 70) % 7 === 0;
    const mullion = Math.abs(x + 0.5 - cx) < 1 || ly === Math.round(h * 0.55) || ly === Math.round(r);
    let c: RGBA;
    if (mullion || diamond) c = SOL.lead;
    else {
      const cell = Math.floor((lx + ly) / 7) * 31 + Math.floor((lx - ly + 70) / 7);
      // сюжет: солнце в розетке арки, ниже — сине-золотые ромбы
      const inArch = ly < r;
      const idx = inArch ? (Math.hypot(lx - r, ly - r) < r * 0.45 ? 7 : 3) : [0, 1, 0, 6, 3, 2, 1, 4, 5][Math.floor(hash01(cell, 1, seed) * 9)];
      const base = cols[idx];
      const sh = 0.82 + 0.3 * (1 - ly / h) + (hash01(lx >> 1, ly >> 1, seed) - 0.5) * 0.12;
      c = shade(base, sh);
    }
    pc.set(x, y, c);
    glass.set(x, y, c === SOL.lead ? withA(SOL.lead, 0) : c);
  }
}
/** Круглая роза над алтарём: лучи-лепестки, золотое солнце в центре. */
function roseWindow(pc: PC, glass: PC, cx: number, cy: number, rad: number, frame: Ramp) {
  for (let y = Math.floor(cy - rad - 5); y <= cy + rad + 5; y++) for (let x = Math.floor(cx - rad - 5); x <= cx + rad + 5; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d >= rad && d < rad + 5) { pc.set(x, y, dpick(frame, 0.95 - (d - rad) / 5 * 0.5 - (dx > 0 ? 0.1 : 0), x, y)); continue; }
    if (d >= rad) continue;
    const a = Math.atan2(dy, dx), petal = Math.abs(Math.sin(a * 6));
    let c: RGBA;
    if (d < rad * 0.3) c = shade(SOL.glass[7], 1.05 - d / rad);
    else if (Math.abs(d - rad * 0.3) < 1 || Math.abs(d - rad * 0.66) < 1 || petal < 0.1) c = SOL.lead;
    else if (d < rad * 0.66) c = shade(SOL.glass[3], 0.85 + 0.2 * petal);
    else c = shade(Math.floor((a + Math.PI) / (Math.PI / 6)) % 2 ? SOL.glass[0] : SOL.glass[2], 0.85 + 0.25 * (1 - d / rad));
    pc.set(x, y, c);
    if (c !== SOL.lead) glass.set(x, y, c);
  }
}
/** Узкая бойница с фиолетовым светом (Умбрат). */
function slitWindow(pc: PC, glass: PC, cx: number, top: number, h: number) {
  for (let y = top - 3; y < top + h + 3; y++) for (let x = cx - 5; x <= cx + 5; x++) pc.set(x, y, dpick(UMB.wall, 0.75 - (x > cx ? 0.2 : 0), x, y));
  for (let y = top; y < top + h; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    const t = (y - top) / h, c = mix(UMB.violet[4], UMB.violet[2], t);
    const pointed = y - top < 3 && Math.abs(x - cx) > y - top;
    if (pointed) continue;
    pc.set(x, y, c);
    glass.set(x, y, c);
  }
}

// ---------- задняя стена ----------
function solBackWall(pc: PC, glass: PC, room: Room) {
  const W = room.w * T, Hh = room.wall * T;
  // потолочная тень и карниз
  for (let y = 0; y < 8; y++) for (let x = T; x < W - T; x++) pc.set(x, y, dpick(SOL.cap, 0.1 + y * 0.03, x, y));
  masonry(pc, T, 8, W - 2 * T, Hh - 8, SOL.wall, 24, 12, 501, 0.6, 0.1, H("#8a7d68"));
  // золотой фриз под карнизом
  for (let x = T; x < W - T; x++) {
    pc.set(x, 8, pick(SOL.gold, 0.4)); pc.set(x, 9, pick(SOL.gold, 0.85)); pc.set(x, 10, pick(SOL.gold, 0.6));
    if (x % 8 < 3) pc.set(x, 11, pick(SOL.gold, 0.5));
    pc.set(x, 12, pick(SOL.wall, 0.2));
  }
  // цоколь: тёмный мрамор с золотой полосой
  for (let y = Hh - 10; y < Hh; y++) for (let x = T; x < W - T; x++) pc.set(x, y, y === Hh - 10 ? pick(SOL.gold, 0.8) : y === Hh - 9 ? pick(SOL.gold, 0.4) : dpick(SOL.floorB, 0.35 - (y - Hh + 8) * 0.03, x, y));
  // пилястры
  for (const px of [T + 40, T + 120, W / 2 - 88, W / 2 + 72, W - T - 136, W - T - 56]) {
    cylinder(pc, px, 13, 16, Hh - 23, SOL.wall, 0.3);
    for (let i = -2; i < 18; i++) { pc.set(px + i, 13, pick(SOL.gold, 0.9)); pc.set(px + i, 14, pick(SOL.gold, 0.55)); pc.set(px + i, 15, pick(SOL.gold, 0.3)); }
    for (let i = -2; i < 18; i++) { pc.set(px + i, Hh - 13, pick(SOL.wall, 0.95)); pc.set(px + i, Hh - 12, pick(SOL.wall, 0.4)); pc.set(px + i, Hh - 11, pick(SOL.wall, 0.15)); }
  }
  // витражи и роза над алтарём
  for (const [cx, s] of [[T + 80, 1], [T + 160, 2], [W - T - 96, 3], [W - T - 176, 4]] as [number, number][]) stainedWindow(pc, glass, cx, 20, 22, 56, SOL.wall, s);
  roseWindow(pc, glass, W / 2, 38, 22, SOL.wall);
  // знамёна Солнца между окнами
  for (const bx of [W / 2 - 64, W / 2 + 52]) solBanner(pc, bx, 16);
}
function solBanner(pc: PC, x: number, y: number) {
  const w = 14, h = 50;
  for (let i = -2; i < w + 2; i++) { pc.set(x + i, y, pick(SOL.gold, 0.9)); pc.set(x + i, y + 1, pick(SOL.gold, 0.4)); }
  for (let j = 2; j < h; j++) for (let i = 0; i < w; i++) {
    const tail = j > h - 8 && Math.abs(i - w / 2 + 0.5) < (j - (h - 8)) * 0.9;
    if (tail) continue;
    const fold = 0.55 + 0.3 * Math.sin(i * 0.9) - j * 0.003;
    pc.set(x + i, y + j, i === 0 || i === w - 1 ? pick(SOL.gold, 0.7) : dpick(SOL.white, fold, x + i, y + j));
  }
  // солнце
  const cx = x + w / 2, cy = y + 20;
  for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; pc.line(cx + Math.cos(an) * 3, cy + Math.sin(an) * 3, cx + Math.cos(an) * 5.5, cy + Math.sin(an) * 5.5, pick(SOL.gold, 0.7)); }
  pc.shadedEllipse(cx, cy, 3, 3, SOL.gold);
}
function umbBackWall(pc: PC, glass: PC, room: Room) {
  const W = room.w * T, Hh = room.wall * T;
  for (let y = 0; y < 6; y++) for (let x = T; x < W - T; x++) pc.set(x, y, pick(UMB.cap, 0.05));
  masonry(pc, T, 6, W - 2 * T, Hh - 6, UMB.wall, 32, 16, 701, 0.5, 0.14, UMB.grout);
  // ступенчатый зиккурат-рельеф по центру: три уступа, кромки светлее, швы глубже
  const cx = W / 2;
  const tiers = [[150, 30], [110, 20], [70, 10]] as [number, number][];
  tiers.forEach(([hw, ty], k) => {
    for (let y = ty + 6; y < Hh - 8; y++) for (let x = cx - hw; x < cx + hw; x++) {
      const edgeL = x < cx - hw + 3, edgeR = x >= cx + hw - 3, topE = y < ty + 9;
      const l = topE ? 0.95 : edgeL ? 0.78 : edgeR ? 0.08 : 0.4 + k * 0.08 + (hash01(Math.floor((x - cx) / 20), Math.floor(y / 12), 90 + k) - 0.5) * 0.1;
      pc.set(x, y, dpick(UMB.wall, l, x, y));
      if (!topE && (y - ty) % 12 === 0) pc.set(x, y, UMB.grout);
    }
  });
  // череп над алтарём: глазницы светятся
  skullRelief(pc, glass, cx, 28);
  // руны по уступам (светятся)
  for (let k = 0; k < 10; k++) {
    const rx = cx - 96 + k * 21, ry = 52 + (k % 2) * 4;
    rune(pc, glass, rx, ry, k);
  }
  // бойницы
  for (const sx of [T + 44, T + 104, W - T - 104, W - T - 44]) slitWindow(pc, glass, sx, 22, 44);
  // цепи с крюками
  for (const chx of [T + 74, W - T - 74]) for (let y = 6; y < 66; y += 3) { pc.set(chx, y, pick(UMB.iron, 0.7)); pc.set(chx + 1, y + 1, pick(UMB.iron, 0.4)); pc.set(chx, y + 2, pick(UMB.iron, 0.55)); }
  // знамёна Умбрата
  for (const bx of [T + 136, W - T - 150]) umbBanner(pc, glass, bx, 10);
  // цоколь
  for (let y = Hh - 8; y < Hh; y++) for (let x = T; x < W - T; x++) pc.set(x, y, y === Hh - 8 ? pick(UMB.wall, 0.9) : dpick(UMB.wall, 0.2 - (y - Hh + 8) * 0.02, x, y));
}
function skullRelief(pc: PC, glass: PC, cx: number, cy: number) {
  pc.shadedEllipse(cx, cy, 15, 13, UMB.bone.map((c) => shade(c, 0.55)) as Ramp, [-0.4, -0.7], false);
  for (let y = cy + 6; y < cy + 18; y++) for (let x = cx - 9; x <= cx + 9; x++) pc.set(x, y, dpick(UMB.bone.map((c) => shade(c, 0.5)) as Ramp, 0.5 - (y - cy) * 0.02 + (x < cx ? 0.1 : -0.05), x, y));
  for (let i = -8; i <= 8; i += 3) for (let y = cy + 13; y < cy + 18; y++) pc.set(cx + i, y, UMB.grout);
  for (const ex of [-6, 6]) {
    pc.ellipse(cx + ex, cy + 2, 4.2, 3.6, H("#06040a"));
    flameGlowDot(pc, cx + ex, cy + 2, 3.4, UMB.violet[4]);
    flameGlowDot(glass, cx + ex, cy + 2, 5, UMB.violet[4]);
    glass.set(cx + ex, cy + 2, UMB.violet[5]);
  }
  pc.poly([[cx - 2, cy + 9], [cx + 2, cy + 9], [cx, cy + 5]], H("#06040a"));
}
function rune(pc: PC, glass: PC, x: number, y: number, k: number) {
  const shapes = [[[0, 0], [0, 7], [4, 3]], [[0, 0], [4, 7], [0, 7]], [[2, 0], [2, 7], [0, 3], [4, 3]], [[0, 7], [2, 0], [4, 7]], [[0, 0], [4, 0], [2, 7]]];
  const s = shapes[k % shapes.length];
  for (let i = 0; i + 1 < s.length; i++) {
    const [ax, ay] = s[i], [bx, by] = s[i + 1];
    pc.line(x + ax, y + ay, x + bx, y + by, UMB.violet[3]);
    glass.line(x + ax, y + ay, x + bx, y + by, UMB.violet[4]);
  }
}
function umbBanner(pc: PC, glass: PC, x: number, y: number) {
  const w = 16, h = 58;
  for (let i = -3; i < w + 3; i++) { pc.set(x + i, y, pick(UMB.iron, 0.8)); pc.set(x + i, y + 1, pick(UMB.iron, 0.4)); }
  for (let j = 2; j < h; j++) for (let i = 0; i < w; i++) {
    if (j > h - 10 && (i < (j - h + 10) || i >= w - (j - h + 10))) continue;
    const fold = 0.5 + 0.35 * Math.sin(i * 0.8 + 1) - j * 0.004;
    pc.set(x + i, y + j, i === 0 || i === w - 1 ? pick(UMB.violet, 0.3) : dpick(UMB.cloth, fold, x + i, y + j));
  }
  // око в короне
  const cx = x + w / 2, cy = y + 24;
  pc.ellipse(cx, cy, 5, 3, UMB.violet[2]);
  pc.ellipse(cx, cy, 2, 2, UMB.violet[5]);
  glass.ellipse(cx, cy, 1.6, 1.6, UMB.violet[4]);
  for (const dx of [-4, 0, 4]) pc.line(cx + dx, cy - 5, cx + dx * 0.6, cy - 9, pick(UMB.violet, 0.6));
}

// ---------- пол: ковёр, круг, кости ----------
function solCarpet(pc: PC, room: Room) {
  const x0 = room.door * T + 6, x1 = (room.door + 2) * T - 6, y0 = room.wall * T + 72, y1 = (room.h - 1) * T;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const lx = x - x0, w = x1 - x0;
    const border = lx < 4 || lx >= w - 4, fringe = lx === 0 || lx === w - 1;
    let c: RGBA;
    if (fringe) c = pick(SOL.gold, 0.55);
    else if (border) c = lx === 1 || lx === w - 2 ? pick(SOL.gold, 0.85) : pick(SOL.red, 0.25);
    else {
      // солнце-медальоны по оси
      const my = (y - y0) % 40, dx = lx - w / 2 + 0.5, dy = my - 20, d = Math.hypot(dx, dy);
      if (d < 5) c = pick(SOL.gold, 0.9 - d * 0.06);
      else if (d < 9 && Math.abs(Math.sin(Math.atan2(dy, dx) * 6)) > 0.6) c = pick(SOL.gold, 0.55);
      else c = dpick(SOL.red, 0.6 + 0.12 * Math.sin(lx * 0.5) - (lx > w * 0.7 ? 0.1 : 0), x, y);
    }
    pc.set(x, y, c);
  }
  // ступени к алтарю (подиум)
  const dx0 = 5 * T, dx1 = 15 * T, dy0 = room.wall * T, dy1 = room.wall * T + 72;
  for (let y = dy0; y < dy1; y++) for (let x = dx0; x < dx1; x++) {
    const step = y >= dy1 - 8 ? 2 : y >= dy1 - 16 ? 1 : 0;
    const inset = step * 10;
    if (x < dx0 + inset || x >= dx1 - inset) continue;
    const edge = y === dy1 - 8 || y === dy1 - 16;
    const face = (y > dy1 - 8 && y < dy1 - 3) || (y > dy1 - 16 && y < dy1 - 11);
    pc.set(x, y, edge ? pick(SOL.floorA, 1) : face ? dpick(SOL.floorB, 0.25, x, y) : (x - dx0 + inset) % 16 === 15 || (y - dy0) % 16 === 15 ? SOL.grout : dpick(SOL.floorA, 0.68 + (hash01(x >> 4, y >> 4, 77) - 0.5) * 0.2, x, y));
  }
  // ковёр поверх подиума к алтарю
  for (let y = room.wall * T + 40; y < dy1; y++) for (let x = x0; x < x1; x++) {
    const lx = x - x0, w = x1 - x0;
    pc.set(x, y, lx < 2 || lx >= w - 2 ? pick(SOL.gold, 0.8) : dpick(SOL.red, 0.62 - (y % 8 > 5 ? 0.15 : 0), x, y));
  }
}
function ritualCircle(pc: PC, glow: PC, cx: number, cy: number) {
  const rx = 84, ry = 60; // в 3/4 круг на полу — эллипс
  const ring = (k: number, w: number, c: RGBA, g: RGBA | null) => {
    for (let a = 0; a < 2000; a++) {
      const an = (a / 2000) * Math.PI * 2;
      for (let t = 0; t < w; t++) {
        const x = Math.round(cx + Math.cos(an) * (rx * k - t)), y = Math.round(cy + Math.sin(an) * (ry * k - t * 0.72));
        pc.set(x, y, c);
        if (g) glow.set(x, y, g);
      }
    }
  };
  // гравировка (тёмная) и светящиеся линии
  ring(1, 2, H("#08060c"), UMB.violet[3]);
  ring(0.82, 1, H("#08060c"), UMB.violet[3]);
  ring(0.4, 1, H("#08060c"), UMB.violet[2]);
  // руны между кольцами
  for (let k = 0; k < 16; k++) {
    const an = (k / 16) * Math.PI * 2, x = cx + Math.cos(an) * rx * 0.91 - 2, y = cy + Math.sin(an) * ry * 0.91 - 3;
    const s = [[[0, 0], [0, 5], [3, 2]], [[0, 5], [2, 0], [4, 5]], [[0, 0], [4, 5]], [[2, 0], [2, 5], [0, 2], [4, 2]]][k % 4];
    for (let i = 0; i + 1 < s.length; i++) { pc.line(x + s[i][0], y + s[i][1] * 0.8, x + s[i + 1][0], y + s[i + 1][1] * 0.8, UMB.violet[2]); glow.line(x + s[i][0], y + s[i][1] * 0.8, x + s[i + 1][0], y + s[i + 1][1] * 0.8, UMB.violet[4]); }
  }
  // пятиконечная звезда
  const pts: [number, number][] = [];
  for (let k = 0; k < 5; k++) { const an = -Math.PI / 2 + (k * 4 * Math.PI) / 5; pts.push([cx + Math.cos(an) * rx * 0.8, cy + Math.sin(an) * ry * 0.8]); }
  for (let k = 0; k < 5; k++) { const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % 5]; pc.line(ax, ay, bx, by, H("#08060c")); glow.line(ax, ay, bx, by, UMB.violet[2]); }
  // мягкое свечение пола внутри круга
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (d < 1) { tint(pc, x, y, 1, UMB.violet[1], 0.18 * (1 - d)); const g = glow.get(x, y); if (!g || !g[3]) glow.set(x, y, withA(UMB.violet[1], Math.round(70 * (1 - d) ** 1.5))); }
  }
}
function scatterBones(pc: PC, room: Room, avoid: (x: number, y: number) => boolean) {
  const rr = rng(808);
  for (let k = 0; k < 40; k++) {
    const x = T + 8 + rr() * (room.w * T - 2 * T - 16), y = room.wall * T + 10 + rr() * ((room.h - room.wall - 1) * T - 20);
    if (avoid(x, y)) continue;
    if (rr() < 0.3) { // череп
      softShadow(pc, x, y + 3, 4, 2, 0.6);
      pc.shadedEllipse(x, y, 3, 2.6, UMB.bone, [-0.5, -0.7], false);
      pc.set(x - 1, y, H("#16101a")); pc.set(x + 1, y, H("#16101a"));
    } else { // кость
      const a = rr() * Math.PI, l = 4 + rr() * 4;
      const ax = x - Math.cos(a) * l, ay = y - Math.sin(a) * l * 0.6, bx = x + Math.cos(a) * l, by = y + Math.sin(a) * l * 0.6;
      pc.line(ax, ay + 1, bx, by + 1, shade(UMB.floorA[0], 0.6));
      pc.line(ax, ay, bx, by, UMB.bone[3]);
      pc.set(Math.round(ax), Math.round(ay), UMB.bone[5]); pc.set(Math.round(bx), Math.round(by), UMB.bone[4]);
    }
  }
}

// ---------- глубина стен ----------
/** Задняя стена объёмом: выступающий карниз (светлый верх, тёмный низ, падающая тень на кладку) и цоколь (светлая кромка, тень на пол). */
function wallDepth(pc: PC, glass: PC, room: Room, r: Ramp, trim: Ramp) {
  const W = room.w * T, Hh = room.wall * T;
  for (let x = T; x < W - T; x++) {
    // карниз
    for (let y = 0; y < 4; y++) pc.set(x, y, dpick(r, 0.12 + y * 0.03, x, y));
    pc.set(x, 4, pick(r, 1)); pc.set(x, 5, pick(r, 0.92)); pc.set(x, 6, pick(r, 0.8));
    pc.set(x, 7, pick(trim, x % 6 < 3 ? 0.9 : 0.6)); pc.set(x, 8, pick(r, 0.55)); pc.set(x, 9, pick(r, 0.3)); pc.set(x, 10, pick(r, 0.12));
    for (let y = 11; y < 20; y++) if (!glass.alpha(x, y)) tint(pc, x, y, lerp(0.62, 1, (y - 11) / 9));
    // цоколь
    pc.set(x, Hh - 13, pick(r, 1)); pc.set(x, Hh - 12, pick(r, 0.85));
    for (let y = Hh - 11; y < Hh; y++) pc.set(x, y, dpick(r, 0.5 - (y - Hh + 11) * 0.03, x, y));
    pc.set(x, Hh - 1, pick(r, 0.08));
  }
  // падающая тень цоколя на пол
  for (let y = Hh; y < Hh + 6; y++) for (let x = T; x < W - T; x++) tint(pc, x, y, lerp(0.55, 1, (y - Hh) / 6));
}
/** Внутренние грани боковых и передней стен: толщина кладки (левая грань в тени, правая на свету), тень на полу у основания. */
function innerFaces(pc: PC, room: Room, cap: Ramp) {
  const W = room.w * T, Hh = room.h * T, d0 = room.door * T, d1 = d0 + 2 * T;
  for (let y = room.wall * T - 10; y < Hh - T; y++) {
    for (let i = 0; i < 6; i++) {
      pc.set(T + i, y, dpick(cap, 0.18 + i * 0.03 + ((y >> 3) % 2 ? 0.02 : 0), T + i, y));
      pc.set(W - T - 1 - i, y, dpick(cap, 0.7 - i * 0.05 + ((y >> 3) % 2 ? 0.03 : 0), W - T - 1 - i, y));
    }
    for (let i = 6; i < 14; i++) { tint(pc, T + i, y, lerp(0.7, 1, (i - 6) / 8)); tint(pc, W - T - 1 - i, y, lerp(0.8, 1, (i - 6) / 8)); }
  }
  // передняя стена: верхняя кромка над залом — тёмная грань (стена уходит от зрителя), у проёма — косяки
  for (let x = T; x < W - T; x++) {
    if (x >= d0 && x < d1) continue;
    for (let y = Hh - T - 5; y < Hh - T; y++) pc.set(x, y, dpick(cap, 0.25 - (y - (Hh - T - 5)) * 0.03, x, y));
  }
}
/** Возвышение под ритуальным кругом: плоский эллипс-подиум, видна передняя грань толщиной 6 px, светлая кромка, тень на пол. */
function ritualDais(pc: PC, cx: number, cy: number) {
  const rx = 100, ry = 72, th = 6;
  for (let y = Math.floor(cy - ry); y <= cy + ry + th + 4; y++) for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
    const t = (x + 0.5 - cx) / rx;
    if (Math.abs(t) > 1) continue;
    const yb = cy + ry * Math.sqrt(1 - t * t);
    if (y > yb + th && y <= yb + th + 4) tint(pc, x, y, lerp(0.5, 1, (y - yb - th) / 4)); // тень на пол
  }
  for (let y = Math.floor(cy - ry); y <= cy + ry + th; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const t = (x + 0.5 - cx) / rx;
    if (Math.abs(t) > 1) continue;
    const half = ry * Math.sqrt(1 - t * t), top = cy - half, yb = cy + half;
    if (y >= yb && y < yb + th) pc.set(x, y, dpick(UMB.wall, 0.38 - t * 0.15 - (y - yb) * 0.03, x, y)); // передняя грань
    else if (y >= top && y < yb) {
      const dd = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      const seam = (Math.atan2(y - cy, x - cx) + Math.PI * 2 + 0.01) % (Math.PI / 6) < 0.02 && dd > 0.5;
      pc.set(x, y, seam ? UMB.grout : dd > 0.93 ? pick(UMB.wall, y < cy ? 0.95 : 0.7) : dpick(UMB.floorA, 0.62 + (hash01(x >> 3, y >> 3, 5) - 0.5) * 0.12, x, y));
    }
  }
}

// ---------- лучи из окон (слой сложения) ----------
function shafts(room: Room, wins: [number, number, number, RGBA][]): PC {
  const pc = new PC(room.w * T, room.h * T);
  for (const [cx, top, w, col] of wins) {
    // луч падает вниз и чуть вправо (солнце слева сверху): параллелограмм с затуханием
    const len = 250, slope = 0.28;
    for (let y = top; y < top + len; y++) {
      const t = (y - top) / len, sx = cx + (y - top) * slope;
      const half = w / 2 + t * 10;
      for (let x = Math.floor(sx - half); x <= sx + half; x++) {
        const e = 1 - Math.abs(x + 0.5 - sx) / half;
        const a = (e ** 0.7) * (1 - t) ** 1.3 * 70;
        if (a > 2) pc.set(x, y, withA(col, Math.round(a)));
      }
    }
    // пятно света на полу
    const fy = top + len * 0.75, fx = cx + len * 0.75 * slope;
    for (let y = Math.floor(fy - 12); y < fy + 12; y++) for (let x = Math.floor(fx - w); x < fx + w; x++) {
      const d = ((x - fx) / w) ** 2 + ((y - fy) / 12) ** 2;
      if (d < 1) pc.set(x, y, withA(col, Math.round(46 * (1 - d))));
    }
  }
  return pc;
}

// ---------- убранство ----------
// Объём в 3/4 (как дома задачи 141): у каждого предмета лицевая грань, освещённый верх (виден сверху), правая боковая грань в тени,
// толщина кромок, контактная тень на полу. Свет — слева сверху.
type Light = [number, number, string, number, string | null]; // dx, dy от нижней середины, цвет, масштаб свечения, пламя
interface PropArt { pc: PC; lights: Light[] }

/** Брусок в косой проекции: лицевая грань w×h в (x, y + d), верх — параллелограмм глубиной d (сдвиг вправо dx), правая боковая грань.
 *  Тона: верх светлый, лицо — средний с затемнением книзу, бок — тёмный; светлая кромка верх/лицо, тёмный низ. */
function block(pc: PC, x: number, y: number, w: number, h: number, d: number, r: Ramp, o: { top?: number; face?: number; side?: number; dxk?: number } = {}) {
  const dx = Math.round(d * (o.dxk ?? 0.5)), top = o.top ?? 0.86, face = o.face ?? 0.56, side = o.side ?? 0.26;
  // боковая грань
  for (let j = 0; j < h + d; j++) for (let i = 0; i < dx; i++) {
    const yy = y + j - Math.round((i / Math.max(1, dx)) * d) + d;
    if (yy < y + d - Math.round(((i + 1) / Math.max(1, dx)) * d) || yy >= y + d + h - Math.round((i / Math.max(1, dx)) * d)) continue;
    pc.set(x + w + i, yy, dpick(r, side - 0.1 * ((yy - y) / (h + d)), x + w + i, yy));
  }
  // верх
  for (let j = 0; j < d; j++) {
    const sh = Math.round(((d - j) / d) * dx);
    for (let i = 0; i < w; i++) pc.set(x + i + sh, y + j, dpick(r, top + 0.06 * (j / d) - (i > w - 3 ? 0.08 : 0), x + i + sh, y + j));
  }
  // лицо
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const l = face - 0.16 * (j / Math.max(1, h)) + (i < 2 ? 0.06 : 0);
    pc.set(x + i, y + d + j, dpick(r, l, x + i, y + d + j));
  }
  for (let i = 0; i < w; i++) pc.set(x + i, y + d, pick(r, 1)); // кромка верх/лицо
  for (let i = 0; i < w; i++) pc.set(x + i, y + d + h - 1, pick(r, Math.max(0, face - 0.3)));
  for (let j = 0; j < d; j++) pc.set(x + w + Math.round(((d - j) / d) * dx) - 1, y + j, pick(r, Math.min(1, top + 0.08)));
}
/** Круглая ступень-диск (база, капитель, чаша): бок цилиндра высотой h и освещённый верх-эллипс. */
function disc(pc: PC, cx: number, cy: number, rx: number, ry: number, h: number, r: Ramp) {
  for (let y = Math.floor(cy); y < cy + h + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const t = (x + 0.5 - cx) / rx;
    if (Math.abs(t) > 1) continue;
    const bottom = cy + h + ry * Math.sqrt(1 - t * t);
    if (y > bottom) continue;
    const l = clamp(0.5 + 0.5 * Math.cos((t + 0.45) * Math.PI * 0.9)) * 0.75;
    pc.set(x, y, dpick(r, l - (y > bottom - 1.5 ? 0.15 : 0), x, y));
  }
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dd = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (dd > 1) continue;
    pc.set(x, y, dpick(r, dd > 0.72 ? 0.97 : 0.82 - (x - cx) / rx * 0.08, x, y));
  }
}
/** Круглая колонна: ствол-цилиндр с бликом и глубокой тенью справа, каннелюры. */
function roundShaft(pc: PC, x: number, y: number, w: number, h: number, r: Ramp, flutes = 0) {
  for (let i = 0; i < w; i++) {
    const t = (i + 0.5) / w * 2 - 1; // −1 … 1
    const nz = Math.sqrt(Math.max(0, 1 - t * t));
    let l = clamp(0.18 + 0.82 * Math.max(0, -0.55 * t + 0.75 * nz));
    if (Math.abs(t + 0.42) < 0.09) l = 1; // блик
    if (flutes && Math.abs(Math.sin((t * Math.PI) * flutes * 0.5 + 0.4)) < 0.22 && Math.abs(t) < 0.85) l -= 0.18;
    for (let j = 0; j < h; j++) pc.set(x + i, y + j, dpick(r, l, x + i, y + j));
  }
}

function pew(): PropArt {
  const w = 132, h = 50, pc = new PC(w, h);
  softShadow(pc, 62, 45, 64, 6, 0.45);
  // спинка (у северного края следа): толщина 4, лицо к зрителю — филёнки
  block(pc, 6, 2, 112, 20, 4, SOL.wood, { top: 0.9, face: 0.5 });
  for (let k = 0; k < 4; k++) {
    const px = 10 + k * 27;
    for (let j = 9; j < 21; j++) for (let i = 0; i < 22; i++) tint(pc, px + i, j, i === 0 || j === 9 ? 1.18 : i === 21 || j === 20 ? 0.7 : 0.9);
  }
  // тень сиденья на спинке
  for (let i = 6; i < 118; i++) for (let j = 22; j < 26; j++) tint(pc, i, j, 0.6);
  // сиденье: глубокий освещённый верх и тонкое лицо
  block(pc, 4, 24, 116, 6, 10, SOL.wood, { top: 0.82, face: 0.48, side: 0.22 });
  // под сиденьем — тьма и ножки
  for (let i = 6; i < 118; i++) for (let j = 40; j < 46; j++) pc.set(i, j, withA(H("#140a06"), 150));
  for (const lx of [10, 60, 110]) block(pc, lx, 39, 4, 6, 1, SOL.wood, { face: 0.4 });
  // торцевые доски с завитком: лицо + толстая боковина справа
  for (const ex of [0, 116]) {
    block(pc, ex, 0, 8, 40, 6, SOL.wood, { top: 0.95, face: 0.62, side: 0.24 });
    pc.shadedEllipse(ex + 4, 3, 4, 3, SOL.wood, [-0.6, -0.7]);
    pc.set(ex + 3, 2, pick(SOL.gold, 1)); pc.set(ex + 4, 2, pick(SOL.gold, 0.8));
  }
  pc.outline(ink);
  return { pc, lights: [] };
}
function pillarSol(): PropArt {
  const w = 36, h = 136, pc = new PC(w, h), cx = 17;
  softShadow(pc, cx + 4, h - 6, 17, 6, 0.4);
  // ступенчатая база: квадратный плинт и два круглых валика
  block(pc, 2, h - 18, 28, 10, 6, SOL.column);
  disc(pc, cx, h - 22, 12, 4, 4, SOL.column);
  disc(pc, cx, h - 26, 10, 3.5, 3, SOL.column);
  // ствол с каннелюрами
  roundShaft(pc, cx - 9, 22, 18, h - 48, SOL.column, 5);
  // капитель: валик, золотая полоса, абака с толщиной
  disc(pc, cx, 20, 10, 3.5, 3, SOL.column);
  for (let x = cx - 10; x <= cx + 10; x++) { pc.set(x, 24, pick(SOL.gold, x < cx ? 0.95 : 0.55)); pc.set(x, 25, pick(SOL.gold, 0.4)); }
  for (const s of [-1, 1]) pc.shadedEllipse(cx + s * 11, 15, 3.4, 3.4, SOL.gold, [-0.6, -0.6]);
  block(pc, 3, 4, 28, 6, 5, SOL.column);
  for (let y = 0; y < 4; y++) for (let x = 6; x < 30; x++) pc.set(x, y, dpick(SOL.wall, 0.35 + y * 0.05, x, y));
  pc.outline(ink);
  return { pc, lights: [] };
}
function candelabra(): PropArt {
  const w = 28, h = 60, pc = new PC(w, h), cx = 13;
  softShadow(pc, cx + 2, h - 3, 10, 3.5, 0.45);
  disc(pc, cx, h - 8, 8, 3, 3, SOL.gold);
  disc(pc, cx, h - 12, 4, 1.6, 2, SOL.gold);
  roundShaft(pc, cx - 2, 22, 4, h - 34, SOL.gold);
  disc(pc, cx, 34, 4, 1.6, 2, SOL.gold);
  disc(pc, cx, 25, 3, 1.2, 2, SOL.gold);
  // рожки: светлая кромка сверху, тёмная снизу
  for (const s of [-1, 1]) {
    for (let k = 0; k <= 8; k++) { const x = cx + s * k, y = 25 - Math.round(Math.sin((k / 8) * Math.PI * 0.5) * 6); pc.set(x, y, pick(SOL.gold, 0.95)); pc.set(x, y + 1, pick(SOL.gold, 0.45)); }
  }
  for (const [px, top] of [[cx - 8, 13], [cx, 9], [cx + 8, 13]] as [number, number][]) {
    disc(pc, px, top + 6, 3, 1.2, 1, SOL.gold);
    roundShaft(pc, px - 1, top - 1, 3, 6, SOL.white);
    pc.set(px, top - 2, H("#3a2a1a"));
  }
  pc.outline(ink);
  return { pc, lights: [[cx - 8 - w / 2 + 0.5, -h + 11, "#ffd27a", 0.9, "gold"], [cx - w / 2 + 0.5, -h + 7, "#ffd27a", 1.1, "gold"], [cx + 8 - w / 2 + 0.5, -h + 11, "#ffd27a", 0.9, "gold"]] };
}
function vaseSun(): PropArt {
  const w = 32, h = 50, pc = new PC(w, h), cx = 15;
  softShadow(pc, cx + 3, h - 4, 12, 4, 0.45);
  block(pc, 6, h - 12, 18, 6, 4, SOL.column);
  pc.shadedEllipse(cx, h - 22, 10, 11, SOL.gold, [-0.6, -0.5]);
  disc(pc, cx, h - 33, 6, 2.2, 2, SOL.gold);
  pc.ellipse(cx, h - 33, 4.5, 1.4, H("#3a2410"));
  const rr = rng(5);
  for (let k = 0; k < 6; k++) { const lx = 6 + k * 3.6; pc.line(cx, h - 34, lx, h - 41 - (k % 2) * 4, H("#4e9a42")); pc.set(Math.round(lx), h - 41 - (k % 2) * 4, H("#7cc464")); }
  for (let k = 0; k < 7; k++) {
    const ex = cx + (k - 3) * 4.4 + (rr() - 0.5) * 3, ey = 5 + rr() * 10;
    pc.line(cx + (k - 3) * 1.5, h - 34, ex, ey + 3, H("#3a7a34"));
    pc.shadedEllipse(ex, ey, 2.8, 2.4, SOL.white, [-0.6, -0.6]);
    pc.set(Math.round(ex), Math.round(ey), pick(SOL.gold, 0.9));
  }
  pc.outline(ink);
  return { pc, lights: [] };
}
function lectern(): PropArt {
  const w = 30, h = 46, pc = new PC(w, h);
  softShadow(pc, 16, h - 4, 11, 4, 0.45);
  block(pc, 5, h - 9, 18, 4, 4, SOL.wood);
  block(pc, 11, 18, 6, h - 27, 3, SOL.wood, { face: 0.6 });
  // наклонная доска: верх-скат светлый, торец доски тёмный
  pc.poly([[2, 20], [25, 20], [22, 7], [6, 7]], (x, y) => dpick(SOL.wood, 0.8 - (y - 7) * 0.012, x, y));
  for (let x = 2; x < 26; x++) { pc.set(x, 21, pick(SOL.wood, 0.4)); pc.set(x, 22, pick(SOL.wood, 0.25)); }
  pc.poly([[25, 20], [27, 19], [24, 6], [22, 7]], (x, y) => dpick(SOL.wood, 0.25, x, y));
  // раскрытая книга с толщиной страниц
  pc.poly([[6, 18], [13, 18], [13, 9], [8, 9]], SOL.white[4]);
  pc.poly([[14, 18], [21, 18], [19, 9], [14, 9]], SOL.white[3]);
  for (let x = 6; x < 22; x++) pc.set(x, 19, SOL.white[1]);
  for (let y = 11; y < 17; y += 2) { pc.line(8, y, 12, y, SOL.white[1]); pc.line(15, y, 19, y, SOL.white[1]); }
  pc.line(13, 9, 13, 19, pick(SOL.red, 0.6));
  pc.outline(ink);
  return { pc, lights: [] };
}
function altarSun(): PropArt {
  const w = 136, h = 156, pc = new PC(w, h), cx = 64;
  softShadow(pc, cx + 6, h - 6, 66, 9, 0.4);
  // золотой диск на стойке позади алтаря
  roundShaft(pc, cx - 4, 50, 8, 50, SOL.gold);
  for (let a = 0; a < 24; a++) {
    const an = (a / 24) * Math.PI * 2, long = a % 2 === 0, r1 = 22, r2 = long ? 38 : 30;
    pc.poly([[cx + Math.cos(an - 0.07) * r1, 40 + Math.sin(an - 0.07) * r1], [cx + Math.cos(an) * r2, 40 + Math.sin(an) * r2], [cx + Math.cos(an + 0.07) * r1, 40 + Math.sin(an + 0.07) * r1]],
      pick(SOL.gold, (long ? 0.72 : 0.5) + 0.22 * Math.cos(an + 2.2)));
  }
  pc.shadedEllipse(cx, 40, 22, 22, SOL.gold, [-0.5, -0.6]);
  pc.shadedEllipse(cx, 40, 13, 13, R("#c08a2a", "#e8b84a", "#ffe08a", "#fff6c8", "#ffffff"), [-0.4, -0.5]);
  for (let a = 0; a < 2000; a++) { const an = (a / 2000) * Math.PI * 2; pc.set(Math.round(cx + Math.cos(an) * 17.5), Math.round(40 + Math.sin(an) * 17.5), pick(SOL.gold, 0.35)); }
  // ступень под алтарём и сам мраморный блок: верх, лицо, бок
  block(pc, 0, h - 22, 124, 10, 8, SOL.column, { top: 0.8, face: 0.5 });
  block(pc, 8, 84, 108, 46, 18, SOL.white, { top: 0.88, face: 0.6, side: 0.3 });
  // покров: свисает с верха на лицо, складки, золотая кайма
  for (let y = 102; y < 140; y++) for (let x = 16; x < 108; x++) {
    const fold = 0.05 * Math.sin(x * 0.55) + (x % 9 === 0 ? -0.08 : 0);
    pc.set(x, y, dpick(SOL.white, 0.82 - (y - 102) * 0.007 + fold, x, y));
  }
  for (let x = 16; x < 108; x++) { pc.set(x, 102, pick(SOL.gold, 0.95)); pc.set(x, 139, pick(SOL.gold, 0.8)); pc.set(x, 140, pick(SOL.gold, 0.4)); }
  for (let y = 102; y < 141; y++) { pc.set(16, y, pick(SOL.gold, 0.85)); pc.set(107, y, pick(SOL.gold, 0.5)); }
  for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; pc.line(cx + Math.cos(an) * 5, 121 + Math.sin(an) * 5, cx + Math.cos(an) * 9, 121 + Math.sin(an) * 9, pick(SOL.gold, 0.75)); }
  pc.shadedEllipse(cx, 121, 4.5, 4.5, SOL.gold);
  // на алтаре: книга с толщиной и две свечи в подсвечниках
  block(pc, cx - 14, 88, 28, 2, 7, SOL.white, { top: 0.95, face: 0.5 });
  pc.line(cx, 88, cx + 3, 95, pick(SOL.red, 0.6));
  for (const sx of [24, 100]) { disc(pc, sx, 96, 4, 1.6, 2, SOL.gold); roundShaft(pc, sx - 2, 82, 4, 14, SOL.white); pc.set(sx, 81, H("#3a2a1a")); }
  pc.outline(ink);
  return { pc, lights: [[24 - w / 2, -(h - 78), "#ffd27a", 1, "gold"], [100 - w / 2, -(h - 78), "#ffd27a", 1, "gold"], [cx - w / 2, -(h - 40), "#ffe7a0", 3.2, null]] };
}
function altarUmb(): PropArt {
  const w = 136, h = 156, pc = new PC(w, h), cx = 64;
  softShadow(pc, cx + 6, h - 6, 66, 9, 0.35);
  // обелиск-идол: светлая левая грань, тёмная правая, ступени
  pc.poly([[cx - 16, 94], [cx, 94], [cx, 2], [cx - 9, 16]], (x, y) => dpick(UMB.obs, 0.66 - (y - 2) * 0.002, x, y));
  pc.poly([[cx, 94], [cx + 16, 94], [cx + 9, 16], [cx, 2]], (x, y) => dpick(UMB.obs, 0.26, x, y));
  for (let y = 18; y < 92; y += 10) for (let x = cx - 13; x < cx + 13; x++) if (pc.alpha(x, y)) pc.set(x, y, pick(UMB.obs, x < cx ? 0.9 : 0.45));
  pc.ellipse(cx, 36, 7, 4, H("#05030a"));
  pc.ellipse(cx, 36, 5.5, 3, UMB.violet[3]);
  pc.ellipse(cx, 36, 2, 2.4, UMB.violet[5]);
  for (const k of [52, 64, 76]) { pc.line(cx - 5, k, cx + 5, k, UMB.violet[2]); pc.set(cx, k - 2, UMB.violet[3]); pc.set(cx, k + 2, UMB.violet[3]); }
  // ступень и каменная плита
  block(pc, 0, h - 22, 124, 10, 8, UMB.wall, { top: 0.75, face: 0.45 });
  block(pc, 8, 84, 108, 46, 18, UMB.wall, { top: 0.82, face: 0.52, side: 0.2 });
  // покров
  for (let y = 102; y < 138; y++) for (let x = 22; x < 102; x++) pc.set(x, y, dpick(UMB.cloth, 0.72 - (y - 102) * 0.008 + 0.06 * Math.sin(x * 0.6), x, y));
  for (let x = 22; x < 102; x++) { pc.set(x, 102, pick(UMB.violet, 0.5)); pc.set(x, 137, pick(UMB.violet, 0.4)); }
  pc.ellipse(cx, 120, 7, 6, UMB.violet[1]); pc.ellipse(cx, 120, 5, 4, UMB.cloth[1]);
  pc.line(cx, 113, cx, 127, UMB.violet[3]); pc.line(cx - 6, 120, cx + 6, 120, UMB.violet[3]);
  // на плите: череп, чаша, кинжал, свечи
  pc.shadedEllipse(cx, 92, 7, 6, UMB.bone, [-0.5, -0.7], false);
  block(pc, cx - 4, 94, 9, 3, 1, UMB.bone);
  pc.ellipse(cx - 3, 92, 1.8, 1.6, H("#0a0610")); pc.ellipse(cx + 3, 92, 1.8, 1.6, H("#0a0610"));
  disc(pc, cx - 32, 93, 6, 2.2, 3, UMB.iron); pc.ellipse(cx - 32, 93, 4, 1.4, H("#4a0a1a"));
  pc.line(cx + 22, 97, cx + 38, 93, UMB.iron[5]); pc.line(cx + 20, 98, cx + 24, 96, UMB.violet[2], 2);
  for (const sx of [18, 108]) { roundShaft(pc, sx - 2, 82, 4, 16, UMB.cloth); pc.set(sx, 81, H("#000000")); }
  pc.outline(H("#030206"));
  return { pc, lights: [[18 - w / 2, -(h - 78), "#b46aff", 0.9, "violet_s"], [108 - w / 2, -(h - 78), "#b46aff", 0.9, "violet_s"], [cx - w / 2, -(h - 36), "#a65cff", 1.8, null]] };
}
function pillarUmb(): PropArt {
  const w = 38, h = 138, pc = new PC(w, h), cx = 17;
  softShadow(pc, cx + 4, h - 6, 18, 6, 0.35);
  block(pc, 2, h - 20, 28, 12, 6, UMB.obs, { top: 0.8 });
  // ствол — восьмигранник: светлая левая, средняя лицевая, тёмная правая грани
  const faces = [[cx - 10, 4, 0.72], [cx - 6, 12, 0.5], [cx + 6, 4, 0.22]] as [number, number, number][];
  for (const [fx, fw, l] of faces) for (let x = fx; x < fx + fw; x++) for (let y = 22; y < h - 20; y++) pc.set(x, y, dpick(UMB.obs, l + (hash01(x, y >> 3, 9) - 0.5) * 0.05, x, y));
  for (let y = 22; y < h - 20; y++) { pc.set(cx - 6, y, pick(UMB.obs, 0.9)); pc.set(cx + 6, y, pick(UMB.obs, 0.1)); }
  // светящийся пояс рун
  for (let y = 60; y < 72; y++) for (let x = cx - 10; x < cx + 10; x++) pc.set(x, y, dpick(UMB.iron, x < cx - 6 ? 0.5 : x >= cx + 6 ? 0.15 : 0.32, x, y));
  for (const rx of [cx - 8, cx - 3, cx + 2, cx + 6]) { pc.line(rx, 62, rx + 1, 69, UMB.violet[3]); pc.set(rx + 1, 65, UMB.violet[5]); }
  // капитель-абака с шипами
  block(pc, 2, 10, 28, 8, 5, UMB.obs, { top: 0.85 });
  for (const sx of [5, 12, 18, 25, 31]) pc.poly([[sx - 2, 11], [sx + 2, 11], [sx, 0]], (x, y) => dpick(UMB.iron, x <= sx ? 0.7 : 0.25, x, y));
  pc.outline(H("#030206"));
  return { pc, lights: [[cx - w / 2, -(h - 65), "#9a4aff", 0.8, null]] };
}
function brazierUmb(): PropArt {
  const w = 32, h = 42, pc = new PC(w, h), cx = 15;
  softShadow(pc, cx + 3, h - 4, 13, 4, 0.4);
  // ножки-треножник с бликом
  for (const [ax, bx] of [[cx - 7, cx - 12], [cx + 7, cx + 12], [cx, cx + 1]] as [number, number][]) {
    pc.line(ax, 18, bx, h - 3, pick(UMB.iron, 0.3), 2);
    pc.line(ax - 1, 18, bx - 1, h - 3, pick(UMB.iron, 0.75));
  }
  // чаша: полусфера снизу, кольцо-кромка, угли
  for (let y = 12; y < 24; y++) for (let x = cx - 13; x <= cx + 13; x++) {
    const t = (x + 0.5 - cx) / 13, depthY = 12 + 11 * Math.sqrt(Math.max(0, 1 - t * t));
    if (y > depthY) continue;
    pc.set(x, y, dpick(UMB.iron, clamp(0.55 - t * 0.35 - (y - 12) * 0.02), x, y));
  }
  for (let a = 0; a < 400; a++) { const an = (a / 400) * Math.PI * 2, x = cx + Math.cos(an) * 13, y = 12 + Math.sin(an) * 4; pc.set(Math.round(x), Math.round(y), pick(UMB.iron, Math.sin(an) > 0 ? 0.35 : 0.9)); }
  pc.ellipse(cx, 12, 11, 3, H("#1a0a24"));
  for (let x = cx - 10; x <= cx + 10; x++) pc.set(x, 12 + Math.round(Math.sin(x) * 0.8), mix(UMB.violet[2], UMB.violet[4], hash01(x, 1, 3)));
  for (const s of [-1, 1]) { pc.line(cx + s * 13, 13, cx + s * 16, 8, pick(UMB.iron, 0.85)); pc.set(cx + s * 16, 7, pick(UMB.iron, 1)); }
  pc.outline(H("#030206"));
  return { pc, lights: [[cx - w / 2, -h + 11, "#a65cff", 2.4, "violet"]] };
}
function boneRack(): PropArt {
  const w = 72, h = 72, pc = new PC(w, h);
  softShadow(pc, 36, h - 5, 34, 5, 0.4);
  block(pc, 2, 4, 60, h - 14, 8, UMB.wall, { top: 0.8, face: 0.45, side: 0.15 });
  for (const sy of [18, 34, 50]) {
    // глубокая ниша: тень сверху и слева, светлая полка снизу
    for (let y = sy; y < sy + 13; y++) for (let x = 6; x < 58; x++) pc.set(x, y, dpick(UMB.wall, 0.05 + (y - sy) * 0.012 + (x > 54 ? 0.06 : 0), x, y));
    for (let x = 6; x < 58; x++) { pc.set(x, sy + 13, pick(UMB.wall, 0.95)); pc.set(x, sy + 14, pick(UMB.wall, 0.6)); }
    for (let k = 0; k < 6; k++) {
      const sx = 11 + k * 8.6, syy = sy + 8;
      softShadow(pc, sx + 1, syy + 4, 4, 1.5, 0.5);
      pc.shadedEllipse(sx, syy, 3.6, 3.4, UMB.bone, [-0.5, -0.7], false);
      block(pc, sx - 2, syy + 2, 5, 2, 1, UMB.bone);
      pc.set(sx - 1, syy, H("#120a14")); pc.set(sx + 1, syy, H("#120a14"));
    }
  }
  pc.outline(H("#030206"));
  return { pc, lights: [] };
}
function skullPile(): PropArt {
  const w = 36, h = 30, pc = new PC(w, h);
  softShadow(pc, 19, h - 5, 16, 4.5, 0.45);
  const rr = rng(33);
  for (let k = 0; k < 8; k++) { const x = 4 + rr() * 26, y = 19 + rr() * 6, a = rr() * Math.PI; pc.line(x - Math.cos(a) * 5, y - Math.sin(a) * 2 + 1, x + Math.cos(a) * 5, y + Math.sin(a) * 2 + 1, UMB.bone[0], 2); pc.line(x - Math.cos(a) * 5, y - Math.sin(a) * 2, x + Math.cos(a) * 5, y + Math.sin(a) * 2, UMB.bone[3]); }
  for (const [x, y] of [[9, 21], [17, 22], [25, 21], [13, 16], [21, 16], [17, 11]] as [number, number][]) {
    pc.shadedEllipse(x, y, 4.3, 3.9, UMB.bone, [-0.5, -0.7], false);
    block(pc, x - 2, y + 2, 5, 2, 1, UMB.bone);
    pc.set(x - 2, y, H("#120a14")); pc.set(x - 1, y, H("#120a14")); pc.set(x + 1, y, H("#120a14")); pc.set(x + 2, y, H("#120a14"));
  }
  pc.outline(H("#030206"));
  return { pc, lights: [] };
}

const PROPS: Record<string, () => PropArt> = {
  pew, pillar_sol: pillarSol, candelabra, vase_sun: vaseSun, lectern, altar_sun: altarSun,
  altar_umb: altarUmb, pillar_umb: pillarUmb, brazier_umb: brazierUmb, bone_rack: boneRack, skull_pile: skullPile,
};

// ---------- пламя (8 кадров) ----------
function flameSheet(w: number, h: number, core: RGBA, mid: RGBA, outer: RGBA, seed: number): PC {
  const N = 8, out = new PC(w * N, h);
  for (let f = 0; f < N; f++) {
    const ph = (f / N) * Math.PI * 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = 1 - y / h; // 0 внизу … 1 вверху
      const sway = Math.sin(ph + t * 3.2) * t * w * 0.14 + Math.sin(ph * 2 + t * 6 + seed) * t * w * 0.05;
      const cx = w / 2 - 0.5 + sway;
      const half = (w / 2) * Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI * 0.5) * (1 - t * 0.55) * (0.92 + 0.08 * Math.sin(ph * 3 + y));
      const d = Math.abs(x - cx) / Math.max(0.6, half);
      const tip = t > 0.8 + 0.08 * Math.sin(ph * 2) ? 1 : 0;
      if (d > 1 || tip) continue;
      const heat = (1 - d) * (1 - t * 0.7);
      const c = heat > 0.62 ? core : heat > 0.32 ? mid : outer;
      out.set(f * w + x, y, withA(c, Math.round(255 * Math.min(1, 0.55 + heat))));
    }
  }
  return out;
}

// ---------- сборка ----------
interface Room { id: string; style: string; w: number; h: number; wall: number; door: number; props: [string, number, number][] }

function buildRoom(room: Room, art: Record<string, PropArt>) {
  const W = room.w * T, Hh = room.h * T, sol = room.style === "sol";
  const base = new PC(W, Hh), glass = new PC(W, Hh), glow = new PC(W, Hh);
  const lights: Light[] = [];
  if (sol) marbleFloor(base, T, room.wall * T, W - 2 * T, Hh - room.wall * T - T);
  else slateFloor(base, T, room.wall * T, W - 2 * T, Hh - room.wall * T - T);
  if (sol) solCarpet(base, room);
  else {
    ritualDais(base, W / 2, (room.wall + (room.h - room.wall - 1) / 2) * T + 8);
    ritualCircle(base, glow, W / 2, (room.wall + (room.h - room.wall - 1) / 2) * T + 8);
    const cy = (room.wall + (room.h - room.wall - 1) / 2) * T + 8;
    scatterBones(base, room, (x, y) => ((x - W / 2) / 112) ** 2 + ((y - cy) / 84) ** 2 < 1 || (x > room.door * T - 8 && x < (room.door + 2) * T + 8 && y > Hh - 3 * T));
  }
  floorAO(base, room);
  // тени убранства на полу (контакт)
  for (const [kind, x, y] of room.props) {
    const f = (data.props as Record<string, { w: number; h: number }>)[kind];
    const cx = (x + f.w / 2) * T, by = (y + f.h) * T;
    softShadow(base, cx + 3, by - 4, f.w * 16 + 4, Math.max(6, f.h * 10), 0.7);
  }
  if (sol) solBackWall(base, glass, room);
  else umbBackWall(base, glass, room);
  // задняя стена темнее к потолку
  for (let y = 0; y < room.wall * T; y++) for (let x = T; x < W - T; x++) if (!glass.alpha(x, y)) tint(base, x, y, lerp(sol ? 0.72 : 0.6, 1, (y / (room.wall * T)) ** 0.8));
  wallDepth(base, glass, room, sol ? SOL.wall : UMB.wall, sol ? SOL.gold : UMB.violet);
  wallTops(base, room, sol ? SOL.cap : UMB.cap, sol ? 511 : 711);
  innerFaces(base, room, sol ? SOL.cap : UMB.cap);
  doorway(base, room, sol ? SOL.floorB : UMB.floorA, sol ? SOL.red : UMB.cloth, sol ? pick(SOL.gold, 0.8) : UMB.violet[2]);
  // огни на стенах: бра у пилястр (храм) и факелы (зиккурат)
  const sconces = sol ? [T + 48, W - T - 48] : [T + 20, W - T - 20, W / 2 - 160, W / 2 + 160];
  for (const sx of sconces) {
    const sy = sol ? 50 : 46;
    if (sol) { base.rect(sx - 3, sy, 7, 3, pick(SOL.gold, 0.8)); base.rect(sx - 1, sy + 3, 3, 6, pick(SOL.gold, 0.5)); base.rect(sx - 1, sy - 6, 3, 6, SOL.white[3]); }
    else { base.rect(sx - 2, sy, 5, 10, pick(UMB.iron, 0.5)); base.rect(sx - 4, sy - 2, 9, 3, pick(UMB.iron, 0.75)); }
    lights.push([sx, sy - (sol ? 7 : 3), sol ? "#ffd27a" : "#a65cff", sol ? 1 : 1.5, sol ? "gold" : "violet_s"]);
  }
  // лучи (храм — тёплые цветные из витражей; зиккурат — холодные фиолетовые из бойниц)
  const rays = sol
    ? shafts(room, [[T + 80, 76, 20, H("#fff0c0")], [T + 160, 76, 20, H("#ffe4b0")], [W - T - 96, 76, 20, H("#fff0c0")], [W - T - 176, 76, 20, H("#ffe4b0")], [W / 2, 60, 26, H("#fff6d0")]])
    : shafts(room, [[T + 44, 66, 6, H("#5a3aa0")], [T + 104, 66, 6, H("#5a3aa0")], [W - T - 104, 66, 6, H("#5a3aa0")], [W - T - 44, 66, 6, H("#5a3aa0")]]);
  if (sol) {
    // блик солнечного диска на ковре у алтаря
    for (let y = room.wall * T + 60; y < room.wall * T + 120; y++) for (let x = W / 2 - 40; x < W / 2 + 40; x++) {
      const d = ((x - W / 2) / 40) ** 2 + ((y - room.wall * T - 90) / 30) ** 2;
      if (d < 1) glow.set(x, y, withA(H("#ffd880"), Math.round(60 * (1 - d) ** 1.5)));
    }
  }
  base.save(path.join(OUT, `${room.id}_base.png`));
  glass.save(path.join(OUT, `${room.id}_glass.png`));
  rays.save(path.join(OUT, `${room.id}_shafts.png`));
  glow.save(path.join(OUT, `${room.id}_glow.png`));
  return { lights };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const art: Record<string, PropArt> = {};
  const props: Record<string, { w: number; h: number; lights: Light[] }> = {};
  for (const [kind, fn] of Object.entries(PROPS)) {
    const a = (art[kind] = fn());
    a.pc.save(path.join(OUT, `prop_${kind}.png`));
    props[kind] = { w: a.pc.w, h: a.pc.h, lights: a.lights };
  }
  flameSheet(8, 14, H("#fffbe0"), H("#ffd860"), H("#ff8a2a"), 1).save(path.join(OUT, "flame_gold.png"));
  flameSheet(16, 30, H("#fbeaff"), H("#c88aff"), H("#6a2ad0"), 2).save(path.join(OUT, "flame_violet.png"));
  flameSheet(8, 14, H("#fbeaff"), H("#c88aff"), H("#6a2ad0"), 3).save(path.join(OUT, "flame_violet_s.png"));
  const rooms: Record<string, { lights: Light[] }> = {};
  for (const r of data.list as unknown as Room[]) rooms[r.id] = buildRoom(r, art);
  const manifest = {
    _doc: "tools/gen/interiors.ts: размеры убранства (опора — нижняя середина), огни [dx, dy, цвет, масштаб свечения, пламя]; огни залов — в пикселях зала.",
    flames: { gold: { w: 8, h: 14, frames: 8 }, violet: { w: 16, h: 30, frames: 8 }, violet_s: { w: 8, h: 14, frames: 8 } },
    props, rooms,
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`интерьеры: ${Object.keys(rooms).length} зала, ${Object.keys(props).length} видов убранства → ${OUT}`);
}
main();
