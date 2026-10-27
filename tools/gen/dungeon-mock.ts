/**
 * Макеты визуала данжа (задача 139, «Пепельные чертоги»): два направления в объёме 3/4, как стены 141 и статуи.
 *  A — пепельный склеп: вулканический камень, трещины с живой лавой, железные решётки и цепи, жаровни, саркофаги, кости.
 *  B — затонувший собор павших королей: резные колонны и пилястры, витражи с цветными лучами, знамёна, свечи, разбитые статуи, лужи.
 * Комната 16×7 тайлов: северная стена с лицом (верх с толщиной, кладка с вариантами, бра, решётки/витражи, знамёна), боковые стены с внутренней гранью,
 * дверной проём, пол с вариантами плит и стыками, реквизит в 3/4 (тень вправо-вниз, ту же, что у декора, длинную даст клиент) и свет: ночной ambient + световые пятна.
 * Запуск: npx tsx tools/gen/dungeon-mock.ts → tools/out/dungeon/opt-a.png, opt-b.png (×2).
 */
import fs from "node:fs";
import {
  PC, hash01, hex, mix, pnoise, ramp, withA, type RGBA, type Ramp,
  CLOTH, WOOD, IRON, STONE, LEATHER, litC, box, cylV, ellipseFace, log, fillPoly, depth, grain, planksH, finish, OUT, TOP, FRONT, RIGHT,
} from "./volume-lib";

const W = 640, H = 416, T = 32;
const FX0 = 64, FX1 = 576, FY0 = 144, FY1 = 368; // пол: 16×7 тайлов
const rnd = (a: number, b: number, s = 1) => hash01(a, b, s);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
type Pt = [number, number];

interface Light { x: number; y: number; r: number; c: RGBA; k: number }
export interface Scene { pc: PC; lights: Light[]; shadows: { fp: Pt[]; h: number }[]; emit: PC }

// ---------- общие приёмы ----------
const tone = (r: Ramp, v: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];
/** Затемнение пикселей по тени: выпуклая оболочка следа и следа, сдвинутого вправо-вниз (как tools/gen/shadow.ts, но на непрозрачном полу). */
function darkenShadow(pc: PC, fp: Pt[], h: number, k = 0.5) {
  const s = Math.max(4, Math.min(14, h * 0.32)), pts: Pt[] = [...fp, ...fp.map(([x, y]) => [x + s, y + s * 0.5] as Pt)];
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const sorted = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), lo: Pt[] = [], up: Pt[] = [];
  for (const q of sorted) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...sorted].reverse()) { while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const poly = lo.slice(0, -1).concat(up.slice(0, -1));
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
    let ok = true, edge = 9;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const d = cross(a, b, [x + 0.5, y + 0.5]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1); if (d < -0.3) { ok = false; break; } edge = Math.min(edge, Math.abs(d)); }
    const p = pc.get(x, y); if (!ok || !p || !p[3]) continue;
    const kk = edge < 1 ? (1 + k) / 2 : k;
    pc.set(x, y, [p[0] * kk, p[1] * kk, p[2] * kk, 255]);
  }
}
const footBox = (x0: number, x1: number, yb: number, d = 8): Pt[] => [[x0, yb], [x1, yb], [x1 + d, yb - d * 0.6], [x0 + d, yb - d * 0.6]];
const footDisc = (cx: number, cy: number, rx: number, ry: number): Pt[] => Array.from({ length: 14 }, (_, i) => [cx + Math.cos((i / 14) * 6.283) * rx, cy + Math.sin((i / 14) * 6.283) * ry] as Pt);

// ---------- освещение ----------
function lighting(S: Scene, amb: number, tint: RGBA) {
  const { pc, lights } = S;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = pc.get(x, y)!; if (!p[3]) continue;
    let L = 0, lr = 0, lg = 0, lb = 0;
    for (const l of lights) { const d = Math.hypot((x - l.x) / l.r, (y - l.y) / (l.r * 0.72)); if (d >= 1) continue; const f = (1 - d) * (1 - d) * l.k; L += f; lr += f * l.c[0]; lg += f * l.c[1]; lb += f * l.c[2]; }
    const vx = (x - W / 2) / (W / 2), vy = (y - H / 2) / (H / 2), vig = 1 - 0.28 * (vx * vx + vy * vy);
    const base = amb * vig;
    const e = S.emit.get(x, y)!;
    const r = p[0] * (base * tint[0] / 255 + lr / 255 * 1.1) + (e[3] ? e[0] * e[3] / 255 * 0.9 : 0) + lr * 0.10;
    const g = p[1] * (base * tint[1] / 255 + lg / 255 * 1.1) + (e[3] ? e[1] * e[3] / 255 * 0.9 : 0) + lg * 0.10;
    const b = p[2] * (base * tint[2] / 255 + lb / 255 * 1.1) + (e[3] ? e[2] * e[3] / 255 * 0.9 : 0) + lb * 0.10;
    void L;
    pc.set(x, y, [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255), 255]);
  }
}
export function glowDisc(S: Scene, x: number, y: number, r: number, c: RGBA, a: number) {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const d = Math.hypot(i, j) / r; if (d >= 1) continue; const cur = S.emit.get(x + i, y + j); if (!cur) continue; const al = Math.round(a * (1 - d) * (1 - d)); if (al > cur[3]) S.emit.set(x + i, y + j, [c[0], c[1], c[2], al]); }
}
export function flame(pc: PC, S: Scene, x: number, y: number, h: number, cols: RGBA[], glow: RGBA, k = 1) {
  const [o, m, i, c] = cols, poly = (s: number, col: RGBA, w: number) => pc.poly([[x - w, y], [x - w * 0.6, y - h * 0.5 * s], [x + 0.4, y - h * s], [x + w * 0.5, y - h * 0.55 * s], [x + w, y]], col);
  poly(1, o, 3.4); poly(0.82, m, 2.6); poly(0.58, i, 1.6); poly(0.3, c, 0.9);
  S.lights.push({ x, y: y - h * 0.4, r: 80 * k, c: glow, k: 1.05 * k }); glowDisc(S, x, Math.round(y - h * 0.4), 14, cols[1], 120);
}

// ======================================================================
//                         Направление A — пепельный склеп
// ======================================================================
export const BAS = ramp("#0b0910", "#17131e", "#241e2d", "#352d40", "#4a4058", "#655a74");
export const BASW = ramp("#08060c", "#120e18", "#1e1826", "#2c2438", "#3e344c", "#54486a");
export const LAVA = [hex("#5a1408"), hex("#a02a10"), hex("#e05412"), hex("#ff9a2a"), hex("#ffe27a")];
export const FIRE = [hex("#c8501a"), hex("#ff8a28"), hex("#ffc850"), hex("#fff4c0")];
export const ASH = ramp("#1a1618", "#2a2426", "#3c3436", "#544a4c", "#6e6264");
export const IRN = ramp("#0e0e14", "#1e1e28", "#34344a", "#50506c", "#74749a", "#a0a0c4");

export function floorA(S: Scene, x0: number, y0: number, tx: number, ty: number) {
  const { pc } = S;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const px = x0 + x, py = y0 + y;
    let v = 2.3 + (pnoise(px, py, 5, 256, 3) - 0.5) * 1.5 + (pnoise(px * 2, py * 2, 3, 256, 5) - 0.5) * 0.6;
    if (x === 0 || y === 0) v = 0.2; else if (x === 1 || y === 1) v += 0.9; else if (x >= T - 2 || y >= T - 2) v -= 0.7;
    if (rnd(px, py, 9) < 0.02) v -= 0.7;
    pc.set(px, py, tone(BAS, v));
  }
  const h = rnd(tx, ty, 11);
  // трещина с лавой: ломаная, чёрный край и раскалённая жила
  if (h < 0.34) {
    let x = x0 + 4 + rnd(tx, ty, 12) * 24, y = y0 + 3, a = 1.2 + (rnd(tx, ty, 13) - 0.5) * 0.9;
    for (let k = 0; k < 26; k++) {
      const cx = Math.round(x), cy = Math.round(y);
      if (cx > x0 + 1 && cx < x0 + T - 1 && cy > y0 + 1 && cy < y0 + T - 1) {
        pc.set(cx + 1, cy, tone(BAS, 0)); pc.set(cx, cy + 1, tone(BAS, 0)); pc.set(cx - 1, cy, tone(BAS, 0.4));
        pc.set(cx, cy, k % 5 === 2 ? LAVA[4] : k % 3 ? LAVA[3] : LAVA[2]); S.emit.set(cx, cy, [255, 120, 30, 210]);
        if (k % 4 === 0) S.emit.set(cx + 1, cy + 1, [255, 90, 20, 90]);
      }
      x += Math.cos(a) * 1.2 + (rnd(k, tx + ty, 14) - 0.5) * 1.6; y += Math.sin(a) * 1.2 + 0.4; a += (rnd(k, ty, 15) - 0.5) * 0.7;
    }
  } else if (h < 0.5) { // кучка золы
    pc.ellipse(x0 + 14 + rnd(tx, ty, 16) * 6, y0 + 20, 8, 3.2, tone(ASH, 1.5)); pc.ellipse(x0 + 13 + rnd(tx, ty, 16) * 6, y0 + 19, 6, 2.2, tone(ASH, 2.4)); pc.ellipse(x0 + 12 + rnd(tx, ty, 16) * 6, y0 + 18, 3, 1.2, tone(ASH, 3.2));
  } else if (h < 0.58) { // выбитая плита: скол
    for (let k = 0; k < 40; k++) pc.set(x0 + 6 + Math.floor(rnd(k, tx, 17) * 18), y0 + 8 + Math.floor(rnd(k, ty, 18) * 14), tone(BAS, 0.5 + rnd(k, 1, 2) * 1.4));
  }
}
export function wallFaceA(S: Scene, x0: number, y0: number, w: number, h: number) {
  const { pc } = S;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x0 + x, py = y0 + y, row = Math.floor(y / 16), off = row % 2 ? 16 : 0, bx = (x + off) % 32, by = y % 16;
    let v = 2.0 + (pnoise(px, py, 4, 256, 7) - 0.5) * 1.4;
    if (bx === 0 || by === 0) v = 0.2; else if (by === 1 || bx === 1) v += 0.9; else if (by >= 15 || bx >= 31) v -= 0.8;
    v -= (1 - y / h) * 0.5; // копоть к верху
    if (rnd(Math.floor((x + off) / 32), row, 21) < 0.14 && bx > 2 && by > 2) v += (pnoise(px, py, 2, 256, 4) - 0.5) * 1.6; // выщербленный блок
    pc.set(px, py, tone(BASW, v));
  }
  // железные пояса и заклёпки
  for (const ry of [y0 + 15, y0 + 47]) if (ry < y0 + h) for (let x = 0; x < w; x++) { pc.set(x0 + x, ry, tone(IRN, 3)); pc.set(x0 + x, ry + 1, tone(IRN, 2)); pc.set(x0 + x, ry + 2, tone(IRN, 0.6)); if (x % 12 === 6) { pc.set(x0 + x, ry + 1, tone(IRN, 5)); } }
  // стёки сажи
  for (let k = 0; k < 18; k++) { const sx = x0 + Math.floor(rnd(k, 1, 31) * w), sy = y0 + Math.floor(rnd(k, 2, 31) * (h * 0.4)), len = 6 + Math.floor(rnd(k, 3, 31) * 22); for (let t = 0; t < len; t++) { const p = pc.get(sx, sy + t); if (p) pc.set(sx, sy + t, [p[0] * 0.78, p[1] * 0.78, p[2] * 0.8, 255]); } }
}
export function wallTop(S: Scene, x0: number, y0: number, w: number, h: number, R: Ramp, glow = false) {
  const { pc } = S;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const px = x0 + x, py = y0 + y; let v = 3.0 + (pnoise(px, py, 4, 256, 9) - 0.5) * 1.2; if (y === 0) v += 0.9; if (y >= h - 2) v -= 1.1; if (x % 32 === 0) v -= 1; pc.set(px, py, tone(R, v)); }
  if (glow) for (let k = 0; k < 5; k++) { let x = x0 + 20 + k * 120 + rnd(k, 1, 4) * 40, y = y0 + 3; for (let t = 0; t < 14; t++) { pc.set(Math.round(x), Math.round(y), LAVA[2 + (t % 2)]); S.emit.set(Math.round(x), Math.round(y), [255, 110, 30, 150]); x += 1; y += (rnd(t, k, 6) - 0.4) * 1.4; } }
}
export function chainHang(S: Scene, x: number, y0: number, len: number, R: Ramp) {
  for (let t = 0; t < len; t++) { const y = y0 + t * 2.4, sw = Math.sin(t * 0.4) * 0.7; S.pc.rect(x + sw - (t % 2 ? 0 : 0.8), y, t % 2 ? 2 : 3, 2, tone(R, t % 2 ? 2 : 4)); S.pc.set(Math.round(x + sw), Math.round(y + 2), tone(R, 0.5)); }
}
export function grate(S: Scene, x: number, y: number, w: number, h: number, glow: RGBA) {
  S.pc.rect(x, y, w, h, hex("#190a06")); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const g = (1 - j / h); S.pc.set(x + i, y + j, mix(hex("#2a0e08"), glow, 0.35 + g * 0.5 * (0.6 + 0.4 * Math.sin(i * 0.5)))); }
  S.emit.rect(x, y, w, h, withA(glow, 160));
  for (let i = 3; i < w; i += 5) { S.pc.rect(x + i, y, 2, h, tone(IRN, 2)); S.pc.rect(x + i, y, 1, h, tone(IRN, 4)); }
  S.pc.rect(x - 1, y - 1, w + 2, 2, tone(IRN, 3)); S.pc.rect(x - 1, y + h - 1, w + 2, 2, tone(IRN, 1)); S.lights.push({ x: x + w / 2, y: y + h + 18, r: 44, c: glow, k: 0.5 });
}
export function braziA(S: Scene, x: number, yb: number, s = 1) {
  const { pc } = S;
  S.shadows.push({ fp: footDisc(x, yb, 9 * s, 3 * s), h: 30 * s });
  for (const dx of [-7, 0, 7]) log(pc, x + dx * 0.5 * s, yb - 12 * s, x + dx * s, yb, 1.2, IRN, { end: null });
  log(pc, x, yb - 12 * s, x, yb - 3, 1.0, IRN, { end: null });
  cylV(pc, x, yb - 20 * s, yb - 12 * s, 7.5 * s, IRN, { k: 0.45, cap: ramp("#2a0c06", "#5a1a0a", "#a03a10"), });
  ellipseFace(pc, x, yb - 20 * s, 6 * s, 2.6 * s, LAVA, [0, 1, 0.3]);
  flame(pc, S, x, yb - 19 * s, 22 * s, FIRE, hex("#ff9a40"), 1.1 * s);
}
export function sarcA(S: Scene, x: number, yb: number, ajar: boolean) {
  const { pc } = S, w = 52, d = 22, D = depth(d);
  S.shadows.push({ fp: footBox(x, x + w, yb, D[0]), h: 26 });
  box(pc, x, yb - 22, w, 22, d, { r: STONE.map((c) => mix(c, hex("#2a2038"), 0.4)) as Ramp, tex: grain(3, 0.25) }, { r: STONE.map((c) => mix(c, hex("#1a1426"), 0.5)) as Ramp }, { r: STONE.map((c) => mix(c, hex("#2a2038"), 0.3)) as Ramp, tex: grain(4, 0.2) });
  for (const t of [0.25, 0.75]) pc.rect(x + w * t - 1, yb - 20, 2, 16, tone(IRN, 2));
  pc.rect(x + 4, yb - 14, w - 8, 1, tone(BAS, 0.4));
  // трещины с лавой в крышке и по боку
  for (let k = 0; k < 14; k++) { const cx = x + 8 + k * 3 + (k % 2), cy = yb - 17 + Math.sin(k * 0.9) * 2; pc.set(cx, Math.round(cy), LAVA[3]); S.emit.set(cx, Math.round(cy), [255, 120, 30, 220]); }
  if (ajar) { fillPoly(pc, [[x + w * 0.5, yb - 22], [x + w + D[0] * 0.2, yb - 22 + D[1] * 0.2], [x + w + D[0] * 0.3, yb - 20 + D[1] * 0.3], [x + w * 0.5, yb - 18]], () => hex("#150808")); S.emit.set(x + w * 0.7, yb - 21, [255, 90, 20, 200]); S.lights.push({ x: x + w * 0.7, y: yb - 20, r: 40, c: hex("#ff7a30"), k: 0.55 }); }
}
export function bonesA(S: Scene, x: number, yb: number) {
  const { pc } = S, B = ramp("#3a3238", "#5c525a", "#8a7e86", "#b8aeb2", "#dcd4d6");
  S.shadows.push({ fp: footDisc(x, yb, 10, 3), h: 8 });
  for (let k = 0; k < 5; k++) log(pc, x - 9 + k * 3, yb - 1 - (k % 2), x - 5 + k * 3 + (k % 3), yb + 1, 0.9, B, { end: null });
  ellipseFace(pc, x + 2, yb - 4, 4.5, 4, B, [-0.3, 0.7, 0.6]); pc.rect(x, yb - 5, 2, 2, hex("#0a0808")); pc.rect(x + 4, yb - 5, 2, 2, hex("#0a0808")); pc.rect(x + 1, yb - 1, 4, 1, B[1]);
  ellipseFace(pc, x - 8, yb - 2, 3, 2.4, B, [-0.3, 0.7, 0.6]);
}
export function pillarA(S: Scene, x: number, yb: number) {
  const { pc } = S, h = 78, D = depth(8);
  S.shadows.push({ fp: footBox(x - 12, x + 12, yb, D[0]), h });
  box(pc, x - 12, yb - 8, 24, 8, 8, { r: BASW, tex: grain(2, 0.2) }, { r: BASW }, { r: BASW });
  box(pc, x - 9, yb - h + 8, 18, h - 16, 8, { r: BASW, tex: planksH(8, 4, 0.2) }, { r: BASW }, { r: BASW });
  box(pc, x - 12, yb - h, 24, 8, 8, { r: BASW, tex: grain(5, 0.2) }, { r: BASW }, { r: BASW });
  // светящееся кольцо-руна
  for (const yy of [yb - 48, yb - 40]) for (let i = -8; i <= 8; i++) { pc.set(x + i, yy, LAVA[i % 3 === 0 ? 4 : 3]); S.emit.set(x + i, yy, [255, 120, 30, 200]); }
  for (let k = 0; k < 4; k++) { pc.set(x - 6 + k * 4, yb - 44, LAVA[4]); }
  S.lights.push({ x, y: yb - 44, r: 56, c: hex("#ff7a30"), k: 0.5 });
}
export function doorA(S: Scene, cx: number, yb: number) {
  const { pc } = S, w = 64, h = 60;
  // створ: железные двери чуть приоткрыты, щель светится
  pc.rect(cx - w / 2 - 6, yb - h - 8, w + 12, h + 8, tone(BASW, 1.2));
  box(pc, cx - w / 2 - 8, yb - h - 10, w + 16, 8, 6, { r: BASW }, { r: BASW }, { r: BASW });
  pc.rect(cx - w / 2, yb - h, w, h, hex("#0a0408"));
  for (let y = 0; y < h; y++) { const g = 0.15 + 0.85 * (y / h); for (let x = -3; x <= 3; x++) pc.set(cx + x, yb - h + y, mix(hex("#1a0808"), LAVA[2 + (Math.abs(x) < 2 ? 1 : 0)], g * (1 - Math.abs(x) / 4))); }
  S.emit.rect(cx - 3, yb - h, 7, h, withA(LAVA[3], 190)); S.lights.push({ x: cx, y: yb + 14, r: 90, c: hex("#ff7a30"), k: 0.8 });
  for (const sx of [-1, 1]) { const x0 = sx < 0 ? cx - w / 2 : cx + 4; pc.rect(x0, yb - h, w / 2 - 4, h, tone(IRN, 1.5)); for (let i = 0; i < 6; i++) { pc.rect(x0 + 2, yb - h + 6 + i * 9, w / 2 - 8, 2, tone(IRN, 3)); pc.set(x0 + 4, yb - h + 6 + i * 9, tone(IRN, 5)); pc.set(x0 + w / 2 - 8, yb - h + 6 + i * 9, tone(IRN, 5)); } pc.rect(x0, yb - h, 2, h, tone(IRN, 4)); pc.rect(x0 + w / 2 - 6, yb - h, 2, h, tone(IRN, 0.6)); }
  // череп-замковый камень
  ellipseFace(pc, cx, yb - h - 12, 6, 5, ramp("#3a3238", "#5c525a", "#8a7e86", "#b8aeb2"), [-0.3, 0.7, 0.6]); pc.rect(cx - 3, yb - h - 13, 2, 2, hex("#0a0808")); pc.rect(cx + 1, yb - h - 13, 2, 2, hex("#0a0808"));
}
export function lavaPool(S: Scene, cx: number, cy: number, rx: number, ry: number) {
  const { pc } = S;
  for (let y = Math.floor(cy - ry - 4); y <= cy + ry + 4; y++) for (let x = Math.floor(cx - rx - 4); x <= cx + rx + 4; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy, w = 1 + (pnoise(x, y, 4, 256, 3) - 0.5) * 0.3;
    if (d > 1.3 * w) continue;
    if (d > 0.92 * w) pc.set(x, y, tone(BAS, 0.4 + (pnoise(x, y, 2, 256, 4) * 1.2))); // корка по краю
    else { const n = pnoise(x * 1.2, y * 2, 4, 256, 5), crust = n < 0.38; pc.set(x, y, crust ? LAVA[1] : n > 0.78 ? LAVA[4] : LAVA[2 + (n > 0.6 ? 1 : 0)]); S.emit.set(x, y, [255, 110, 25, crust ? 120 : 210]); }
  }
  S.lights.push({ x: cx, y: cy, r: rx * 3, c: hex("#ff7a30"), k: 1.0 });
  for (let k = 0; k < 8; k++) { const x = cx + (rnd(k, 1, 8) - 0.5) * rx * 1.4, y = cy + (rnd(k, 2, 8) - 0.5) * ry * 1.2; S.pc.rect(x, y - 1, 2, 1, LAVA[4]); }
}

function sceneA(): PC {
  const pc = new PC(W, H), S: Scene = { pc, lights: [], shadows: [], emit: new PC(W, H) };
  pc.rect(0, 0, W, H, hex("#050308"));
  for (let ty = 0; ty < 7; ty++) for (let tx = 0; tx < 16; tx++) floorA(S, FX0 + tx * T, FY0 + ty * T, tx, ty);
  lavaPool(S, 440, 292, 44, 17);
  // стены: боковые (верх + внутренняя грань) и северная
  wallFaceA(S, FX0, 80, FX1 - FX0, 64);
  wallTop(S, FX0 - 32, 64, FX1 - FX0 + 64, 16, BAS, true);
  for (const sx of [0, 1]) { const x0 = sx ? FX1 : FX0 - 32; wallTop(S, x0, 80, 32, FY1 - 80 + 16, BAS, sx === 0); const fx = sx ? FX1 - 8 : FX0; for (let y = 0; y < FY1 - 144; y++) for (let x = 0; x < 8; x++) { const px = fx + x, py = 144 + y; const p = pc.get(px, py); if (p) pc.set(px, py, tone(BASW, 0.8 + (sx ? 1.3 : 0.5) - x * 0.05 + (pnoise(px, py, 4, 256, 5) - 0.5) * 0.8)); } }
  wallTop(S, FX0 - 32, FY1, FX1 - FX0 + 64, 32, BAS);
  for (let y = FY1 - 6; y < FY1; y++) for (let x = FX0 - 32; x < FX1 + 32; x++) { const p = pc.get(x, y)!; pc.set(x, y, [p[0] * 0.7, p[1] * 0.7, p[2] * 0.7, 255]); }
  // дверной проём в северной стене и решётки
  doorA(S, 320, 144);
  grate(S, 122, 96, 28, 24, hex("#ff7a30")); grate(S, 490, 96, 28, 24, hex("#ff7a30"));
  for (const x of [214, 428]) { grate(S, x, 100, 22, 18, hex("#ff9a40")); }
  // цепи и бра
  for (const [x, l] of [[104, 22], [208, 14], [536, 18], [440, 12]] as const) chainHang(S, x, 80, l, IRN);
  for (const x of [172, 268, 372, 468]) { box(pc, x - 4, 108, 8, 5, 4, { r: IRN }, { r: IRN }, { r: IRN }); flame(pc, S, x, 108, 14, FIRE, hex("#ff9a40"), 0.7); }
  // реквизит (дальний ряд → ближний)
  const props: [number, () => void][] = [];
  props.push([180, () => braziA(S, 120, 188, 1.0)], [180, () => braziA(S, 520, 188, 1.0)]);
  props.push([192, () => pillarA(S, 200, 214)], [192, () => pillarA(S, 440, 214)]);
  props.push([250, () => sarcA(S, 96, 270, false)], [260, () => sarcA(S, 224, 330, true)]);
  props.push([300, () => bonesA(S, 330, 308)], [300, () => bonesA(S, 160, 340)], [300, () => bonesA(S, 540, 250)]);
  props.push([320, () => braziA(S, 330, 346, 1.1)], [340, () => pillarA(S, 120, 350)]);
  // тени: пробный проход собирает следы реквизита, пол затемняется, затем реквизит рисуется по-настоящему
  const snap = pc.clone(), lights0 = S.lights.length, emit0 = S.emit.clone();
  for (const [, fn] of props) fn();
  const shadowList = S.shadows.splice(0).filter((q) => q.fp.length);
  pc.data.set(snap.data); S.lights.length = lights0; S.emit.data.set(emit0.data);
  for (const sh of shadowList) darkenShadow(pc, sh.fp, sh.h, 0.5);
  props.sort((x, y) => x[0] - y[0]);
  for (const [, fn] of props) fn();
  S.shadows.length = 0;
  lighting(S, 0.92, [225, 205, 245, 255]);
  return pc;
}
// ======================================================================
//                    Направление B — затонувший собор
// ======================================================================
export const MAR = ramp("#141a22", "#202b36", "#33414e", "#4c5d6c", "#6a7e8e", "#92a8b8");
export const MARW = ramp("#10161e", "#1c2630", "#2c3a46", "#42525f", "#5d707e", "#7c92a2");
export const GLD = ramp("#3a2410", "#6e4a1c", "#b07a2a", "#e0b040", "#fff0a0");
export const MOSS = [hex("#1c3a20"), hex("#2c5a30"), hex("#4a8a40")];
export const WAT = [hex("#0c2230"), hex("#14405a"), hex("#2a6e8c"), hex("#8ad0e8")];
export const CAND = [hex("#e8a030"), hex("#ffd060"), hex("#fff0b0"), hex("#ffffff")];

export function floorB(S: Scene, x0: number, y0: number, tx: number, ty: number) {
  const { pc } = S, check = (tx + ty) % 2;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const px = x0 + x, py = y0 + y;
    let v = (check ? 2.7 : 2.1) + (pnoise(px, py, 6, 256, 3) - 0.5) * 1.1 + (pnoise(px * 3, py * 0.7, 2, 256, 5) - 0.5) * 0.5; // прожилки мрамора
    if (x === 0 || y === 0) v = 0.4; else if (x === 1 || y === 1) v += 0.8; else if (x >= T - 2 || y >= T - 2) v -= 0.7;
    pc.set(px, py, tone(MAR, v));
  }
  const h = rnd(tx, ty, 41);
  if (h < 0.22) { let x = x0 + 4 + rnd(tx, ty, 42) * 24, y = y0 + 2, a = 1.3; for (let k = 0; k < 22; k++) { pc.set(Math.round(x), Math.round(y), tone(MAR, 0.2)); pc.set(Math.round(x) + 1, Math.round(y), tone(MAR, 4.4)); x += Math.cos(a) * 1.2 + (rnd(k, tx, 43) - 0.5) * 1.4; y += Math.sin(a) * 1.2 + 0.4; a += (rnd(k, ty, 44) - 0.5) * 0.7; } }
  else if (h < 0.4 && !(tx > 5 && tx < 10)) { for (let k = 0; k < 20; k++) pc.set(x0 + 2 + Math.floor(rnd(k, tx, 45) * 26), y0 + 4 + Math.floor(rnd(k, ty, 46) * 24), MOSS[k % 3]); }
}
export function wallFaceB(S: Scene, x0: number, y0: number, w: number, h: number) {
  const { pc } = S;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x0 + x, py = y0 + y, row = Math.floor(y / 16), off = row % 2 ? 16 : 0, bx = (x + off) % 32, by = y % 16;
    let v = 2.4 + (pnoise(px, py, 4, 256, 17) - 0.5) * 1.1;
    if (bx === 0 || by === 0) v = 0.3; else if (by === 1 || bx === 1) v += 0.8; else if (by >= 15 || bx >= 31) v -= 0.7;
    v += (y / h - 0.5) * 0.3 + (rnd(Math.floor((x + off) / 32), row, 51) < 0.1 ? -0.5 : 0);
    pc.set(px, py, tone(MARW, v));
  }
  // фриз по верху: золочёный орнамент
  for (let x = 0; x < w; x++) { pc.set(x0 + x, y0 + 7, tone(GLD, 0.6)); pc.set(x0 + x, y0 + 6, tone(GLD, x % 8 < 4 ? 3.2 : 2)); pc.set(x0 + x, y0 + 5, tone(GLD, 1.2)); if (x % 8 === 2) { pc.set(x0 + x, y0 + 4, tone(GLD, 4)); pc.set(x0 + x - 1, y0 + 3, tone(GLD, 3)); pc.set(x0 + x + 1, y0 + 3, tone(GLD, 3)); } }
  // мох у основания и потёки
  for (let x = 0; x < w; x++) { const mh = Math.floor(rnd(x, 3, 52) * 7 * (pnoise(x, 5, 20, 256, 6) + 0.3)); for (let y = 0; y < mh; y++) pc.set(x0 + x, y0 + h - 1 - y, MOSS[y % 3 === 0 ? 2 : y % 3]); }
  for (let k = 0; k < 10; k++) { const sx = x0 + Math.floor(rnd(k, 1, 53) * w), sy = y0 + 10 + Math.floor(rnd(k, 2, 53) * 20), len = 5 + Math.floor(rnd(k, 3, 53) * 18); for (let t = 0; t < len; t++) { const p = pc.get(sx, sy + t); if (p) pc.set(sx, sy + t, [p[0] * 0.8, p[1] * 0.85, p[2] * 0.85, 255]); } }
}
export function pilaster(S: Scene, x: number, y0: number, h: number) {
  const { pc } = S;
  for (let y = 0; y < h; y++) for (let i = 0; i < 12; i++) { const u = (i - 5.5) / 6; pc.set(x - 6 + i, y0 + y, tone(MAR, 2.2 + 2.0 * (-u * 0.6 + 0.4 * Math.sqrt(1 - u * u)) - 0.9 + ((i % 4 === 1) ? -0.3 : 0))); }
  box(pc, x - 8, y0 + h - 6, 16, 6, 3, { r: MAR }, { r: MAR }, { r: MAR }); box(pc, x - 8, y0, 16, 6, 3, { r: MAR }, { r: MAR }, { r: MAR });
  for (let i = -7; i <= 7; i++) pc.set(x + i, y0 + 3, tone(GLD, i % 3 ? 2.6 : 3.8));
}
export function windowB(S: Scene, cx: number, y0: number, col: RGBA, col2: RGBA) {
  const { pc } = S, w = 22, h = 44;
  for (let y = 0; y < h; y++) { const hw = y < 12 ? Math.sqrt(Math.max(0, 1 - ((12 - y) / 12) ** 2)) * (w / 2) : w / 2; for (let x = -Math.ceil(hw); x <= Math.ceil(hw); x++) { if (Math.abs(x) > hw) continue; const lead = (x + 20) % 7 === 0 || (y + 3) % 9 === 0, c = lead ? tone(MAR, 1) : (Math.floor((x + 40) / 7) + Math.floor(y / 9)) % 2 ? col : mix(col, col2, 0.6); pc.set(cx + x, y0 + y, lead ? c : mix(c, hex("#000000"), 0.1 + (y / h) * 0.2)); S.emit.set(cx + x, y0 + y, lead ? [0, 0, 0, 0] : [col[0], col[1], col[2], 170]); } }
  for (let x = -w / 2 - 2; x <= w / 2 + 2; x++) { pc.set(cx + x, y0 + h, tone(MAR, 4)); pc.set(cx + x, y0 + h + 1, tone(MAR, 0.8)); }
  S.lights.push({ x: cx + 6, y: y0 + h + 26, r: 70, c: col, k: 0.32 });
}
export function bannerB(S: Scene, x: number, y0: number, cloth: Ramp) {
  const { pc } = S, w = 18, h = 50;
  pc.rect(x - w / 2 - 2, y0 - 2, w + 4, 3, tone(GLD, 2.4)); pc.rect(x - w / 2 - 2, y0 - 2, w + 4, 1, tone(GLD, 4));
  fillPoly(pc, [[x - w / 2, y0 + 1], [x + w / 2, y0 + 1], [x + w / 2 - 1, y0 + h * 0.8], [x + w * 0.25, y0 + h * 0.7], [x, y0 + h], [x - w * 0.3, y0 + h * 0.75], [x - w / 2, y0 + h * 0.85]], (px, py) => litC(cloth, [Math.sin((px - x) * 0.6) * 0.5, 0.2, 1], (pnoise(px, py, 3, 256, 4) - 0.5) * 0.4 - (py - y0) / h * 0.5));
  for (let k = 0; k < 5; k++) pc.set(x - 2 + (k % 3), y0 + 12 + k * 3, tone(GLD, 3));
  S.shadows.push({ fp: [], h: 0 });
}
export function pillarB(S: Scene, x: number, yb: number) {
  const { pc } = S, h = 96, D = depth(8);
  S.shadows.push({ fp: footBox(x - 14, x + 14, yb, D[0]), h });
  box(pc, x - 14, yb - 10, 28, 10, 8, { r: MAR, tex: grain(2, 0.2) }, { r: MAR }, { r: MAR });
  cylV(pc, x, yb - h + 10, yb - 10, 9.5, MAR, { k: 0.42, cap: null, tex: (phi) => (Math.floor((phi + 2) * 4) % 2 ? -0.25 : 0.2) });
  for (let i = -9; i <= 9; i++) pc.set(x + i, yb - 14, tone(GLD, 2.6)); for (let i = -9; i <= 9; i++) pc.set(x + i, yb - h + 14, tone(GLD, 2.8));
  box(pc, x - 14, yb - h, 28, 10, 8, { r: MAR, tex: grain(6, 0.2) }, { r: MAR }, { r: MAR });
  for (let i = 0; i < 3; i++) pc.rect(x - 12 + i * 8, yb - h + 2, 4, 5, tone(GLD, 2 + i % 2));
  for (let k = 0; k < 14; k++) pc.set(x - 8 + Math.floor(rnd(k, 1, 61) * 16), yb - 14 - Math.floor(rnd(k, 2, 61) * 22), MOSS[k % 3]);
}
export function statueB(S: Scene, x: number, yb: number, v: number) {
  const { pc } = S;
  S.shadows.push({ fp: footBox(x - 16, x + 16, yb, 8), h: 60 });
  box(pc, x - 16, yb - 12, 32, 12, 8, { r: MAR, tex: grain(3, 0.2) }, { r: MAR }, { r: MAR });
  box(pc, x - 12, yb - 34, 24, 22, 7, { r: MAR, tex: planksH(8, 4, 0.2) }, { r: MAR }, { r: MAR });
  for (let i = -8; i <= 8; i++) pc.set(x + i, yb - 30, tone(GLD, i % 3 ? 2.4 : 3.6));
  // фигура короля в плаще: торс, без головы (v=0) или без руки (v=1)
  cylV(pc, x, yb - 66, yb - 34, 9, MARW, { k: 0.4, cap: null, tex: (phi, y) => ((Math.floor((phi + 2) * 3) + Math.floor(y / 6)) % 2 ? -0.2 : 0.25) });
  ellipseFace(pc, x, yb - 66, 9, 3.6, MAR, [0, 1, 0.3]);
  if (v === 0) { for (const [dx, dy] of [[-3, 0], [0, -2], [3, 1], [1, 2]] as const) pc.rect(x + dx - 1, yb - 68 + dy, 3, 3, tone(MAR, 4 - Math.abs(dx))); }
  else { ellipseFace(pc, x, yb - 74, 4.5, 5, MAR, [-0.3, 0.7, 0.6]); pc.rect(x - 4, yb - 80, 9, 2, tone(GLD, 3.4)); }
  log(pc, x + 9, yb - 62, x + 14, yb - 44, 2.4, MARW, { end: null }); if (v === 1) { for (let k = 0; k < 4; k++) pc.set(x - 12 - k, yb - 60 + k, tone(MAR, 2)); } else log(pc, x - 9, yb - 62, x - 13, yb - 46, 2.4, MARW, { end: null });
  for (let k = 0; k < 12; k++) pc.set(x - 10 + Math.floor(rnd(k, 3, 62) * 20), yb - 14 - Math.floor(rnd(k, 4, 62) * 18), MOSS[k % 3]);
}
export function sarcB(S: Scene, x: number, yb: number) {
  const { pc } = S, w = 58, d = 24, D = depth(d);
  S.shadows.push({ fp: footBox(x, x + w, yb, D[0]), h: 26 });
  box(pc, x, yb - 18, w, 18, d, { r: MAR, tex: grain(3, 0.25) }, { r: MARW }, { r: MAR, tex: grain(4, 0.2) });
  for (let i = 3; i < w - 3; i += 4) pc.set(x + i, yb - 10, tone(GLD, i % 8 ? 2.4 : 3.8));
  // лежащая фигура-эффигия на крышке
  const ex = x + D[0] * 0.5 + 8, ey = yb - 18 + D[1] * 0.5;
  ellipseFace(pc, ex + 36, ey - 3, 7, 4, MAR, [-0.3, 0.7, 0.6]); box(pc, ex, ey - 6, 30, 5, 6, { r: MAR }, { r: MARW }, { r: MAR });
  for (let i = 0; i < 4; i++) pc.rect(ex + 4 + i * 6, ey - 6, 2, 5, tone(MAR, 2.2 - i % 2));
  pc.rect(ex + 10, ey - 8, 8, 1, tone(GLD, 3));
  for (let k = 0; k < 10; k++) pc.set(x + 2 + Math.floor(rnd(k, 5, 63) * (w - 4)), yb - 3 - Math.floor(rnd(k, 6, 63) * 8), MOSS[k % 3]);
}
export function candles(S: Scene, x: number, yb: number, n: number) {
  const { pc } = S;
  S.shadows.push({ fp: footDisc(x, yb, 7, 2.5), h: 8 });
  for (let k = 0; k < n; k++) {
    const cx = x - 6 + k * 4 + (k % 2) * 2, cy = yb - (k % 2) * 2, hh = 7 + (k * 5) % 6;
    pc.rect(cx - 1, cy - hh, 3, hh, tone(ramp("#8a7e6a", "#b8ac96", "#d8ccb4", "#f4ecd8", "#ffffff"), 2.5)); pc.rect(cx - 1, cy - hh, 1, hh, hex("#f4ecd8")); pc.rect(cx + 1, cy - hh, 1, hh, hex("#8a7e6a"));
    flame(pc, S, cx, cy - hh, 5, CAND, hex("#ffc060"), 0.32);
  }
}
export function altarB(S: Scene, x: number, yb: number) {
  const { pc } = S, w = 64, D = depth(18);
  S.shadows.push({ fp: footBox(x - w / 2, x + w / 2, yb, D[0]), h: 36 });
  box(pc, x - w / 2 - 6, yb - 8, w + 12, 8, 14, { r: MAR, tex: grain(2, 0.2) }, { r: MAR }, { r: MAR });
  box(pc, x - w / 2, yb - 30, w, 22, 14, { r: MAR, tex: planksH(8, 3, 0.15) }, { r: MARW }, { r: MAR });
  for (let i = -w / 2 + 4; i < w / 2 - 3; i += 4) { pc.set(x + i, yb - 26, tone(GLD, 3)); pc.set(x + i, yb - 14, tone(GLD, 2)); }
  pc.rect(x - w / 2 + 2, yb - 30, w - 4, 2, tone(GLD, 3));
  box(pc, x - w / 2 - 3, yb - 36, w + 6, 6, 16, { r: MAR }, { r: MARW }, { r: MAR });
  for (const dx of [-24, -12, 0, 12, 24]) { const cx = x + dx, hh = 8 + Math.abs(dx % 7); pc.rect(cx - 1, yb - 36 - hh, 3, hh, hex("#e8dcc0")); flame(pc, S, cx, yb - 36 - hh, 6, CAND, hex("#ffc060"), 0.4); }
  S.lights.push({ x, y: yb - 20, r: 120, c: hex("#ffb858"), k: 0.8 });
}
export function rubbleB(S: Scene, x: number, yb: number) {
  const { pc } = S;
  S.shadows.push({ fp: footDisc(x, yb, 14, 4), h: 10 });
  for (let k = 0; k < 9; k++) { const rx = x - 12 + rnd(k, 1, 71) * 24, ry = yb - rnd(k, 2, 71) * 8, s = 2 + rnd(k, 3, 71) * 4; ellipseFace(pc, rx, ry, s, s * 0.75, MAR, [-0.4 + rnd(k, 4, 71) * 0.6, 0.7, 0.5]); }
  for (let k = 0; k < 5; k++) pc.set(x - 8 + k * 4, yb - 6 - (k % 2) * 2, MOSS[k % 3]);
}
export function puddle(S: Scene, cx: number, cy: number, rx: number, ry: number) {
  const { pc } = S;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (pnoise(x, y, 4, 256, 3) - 0.5) * 0.25; if (d > 1) continue; const rim = d > 0.8; const p = pc.get(x, y)!; pc.set(x, y, rim ? mix(p, WAT[1], 0.4) : mix(WAT[0], WAT[2], clamp(0.2 + (y - cy) / ry * 0.2 + (Math.sin(x * 0.9 + y * 2) * 0.1)))); }
  for (let k = 0; k < 6; k++) pc.rect(cx - rx * 0.5 + k * rx * 0.2, cy - ry * 0.3 + (k % 2) * 2, 3, 1, WAT[3]);
}
export function doorB(S: Scene, cx: number, yb: number) {
  const { pc } = S, w = 56, h = 64;
  for (let y = 0; y < h + 12; y++) for (let x = -w / 2 - 6; x <= w / 2 + 6; x++) { const hw = y < 22 ? (w / 2 + 6) * (0.35 + 0.65 * Math.sqrt(Math.max(0, 1 - ((22 - y) / 22) ** 2))) : w / 2 + 6; if (Math.abs(x) > hw) continue; const inner = Math.abs(x) <= hw - 6 && y > 6; pc.set(cx + x, yb - h - 12 + y, inner ? mix(hex("#050a12"), hex("#1a3a4a"), clamp(y / h * 0.5 + Math.abs(x) / 90)) : tone(MAR, 2.6 + (x < 0 ? 0.6 : -0.3) + (pnoise(x, y, 4, 256, 5) - 0.5))); }
  for (const sx of [-1, 1]) { cylV(pc, cx + sx * (w / 2 + 2), yb - h + 12, yb, 4, MAR, { k: 0.4, cap: MAR }); for (let i = -4; i <= 4; i++) pc.set(cx + sx * (w / 2 + 2) + i, yb - h + 12, tone(GLD, 3)); }
  S.emit.rect(cx - w / 2 + 6, yb - h + 8, w - 12, h - 8, withA(hex("#2a6e8c"), 70)); S.lights.push({ x: cx, y: yb + 10, r: 90, c: hex("#4aa0c8"), k: 0.5 });
  for (let k = 0; k < 6; k++) pc.rect(cx - 20 + k * 7, yb - 4 - (k % 2) * 2, 5, 2, hex("#4aa0c8"));
}
function sceneB(): PC {
  const pc = new PC(W, H), S: Scene = { pc, lights: [], shadows: [], emit: new PC(W, H) };
  pc.rect(0, 0, W, H, hex("#04060a"));
  for (let ty = 0; ty < 7; ty++) for (let tx = 0; tx < 16; tx++) floorB(S, FX0 + tx * T, FY0 + ty * T, tx, ty);
  // дорожка-ковёр вдоль оси: рваный пурпур с золотой каймой
  for (let y = FY0; y < FY1; y++) for (let x = 288; x < 352; x++) { const e = x - 288, edge = e < 3 || e > 60; const torn = rnd(Math.floor(y / 5), Math.floor(e / 6), 81) < 0.07 && e > 4 && e < 58; if (torn) continue; pc.set(x, y, edge ? tone(GLD, 2.4 - (e > 60 ? 0.8 : 0)) : litC(CLOTH.purple, [0, 1, 0.3], (pnoise(x, y, 3, 256, 7) - 0.5) * 0.5 - 0.3 + (((y >> 3) + (e >> 3)) % 2 ? 0.1 : -0.1))); }
  puddle(S, 168, 262, 30, 9); puddle(S, 470, 232, 26, 8); puddle(S, 140, 330, 22, 6); puddle(S, 520, 322, 28, 8);
  wallFaceB(S, FX0, 80, FX1 - FX0, 64);
  wallTop(S, FX0 - 32, 64, FX1 - FX0 + 64, 16, MAR);
  for (const sx of [0, 1]) { const x0 = sx ? FX1 : FX0 - 32; wallTop(S, x0, 80, 32, FY1 - 80 + 16, MAR); const fx = sx ? FX1 - 8 : FX0; for (let y = 0; y < FY1 - 144; y++) for (let x = 0; x < 8; x++) { const px = fx + x, py = 144 + y; pc.set(px, py, tone(MARW, 0.8 + (sx ? 1.2 : 0.5) - x * 0.05 + (pnoise(px, py, 4, 256, 5) - 0.5) * 0.8)); } }
  wallTop(S, FX0 - 32, FY1, FX1 - FX0 + 64, 32, MAR);
  for (let y = FY1 - 6; y < FY1; y++) for (let x = FX0 - 32; x < FX1 + 32; x++) { const p = pc.get(x, y)!; pc.set(x, y, [p[0] * 0.7, p[1] * 0.7, p[2] * 0.7, 255]); }
  // пилястры, витражи, знамёна, проём
  for (const x of [112, 224, 416, 528]) pilaster(S, x, 84, 60);
  doorB(S, 320, 144);
  windowB(S, 168, 88, hex("#c04a8a"), hex("#e0b040")); windowB(S, 472, 88, hex("#4a8ac0"), hex("#e0b040"));
  bannerB(S, 134, 84, CLOTH.purple); bannerB(S, 506, 84, CLOTH.blue); bannerB(S, 238, 84, CLOTH.purple); bannerB(S, 402, 84, CLOTH.red);
  // лучи света из витражей на пол
  for (const [wx, col] of [[168, hex("#c04a8a")], [472, hex("#4a8ac0")]] as const) {
    for (let y = 150; y < 300; y++) for (let x = -14; x <= 14; x++) { const sx = wx + x + (y - 150) * 0.55, p = pc.get(Math.round(sx), y); if (!p) continue; const a = 0.16 * (1 - (y - 150) / 150) * (1 - Math.abs(x) / 16); pc.set(Math.round(sx), y, [clamp(p[0] + col[0] * a, 0, 255), clamp(p[1] + col[1] * a, 0, 255), clamp(p[2] + col[2] * a, 0, 255), 255]); }
  }
  const props: [number, () => void][] = [
    [200, () => pillarB(S, 116, 230)], [200, () => pillarB(S, 524, 230)], [200, () => altarB(S, 320, 200)],
    [250, () => statueB(S, 188, 282, 0)], [250, () => statueB(S, 452, 282, 1)], [268, () => sarcB(S, 88, 322)],
    [300, () => rubbleB(S, 250, 322)], [300, () => rubbleB(S, 400, 346)], [330, () => candles(S, 330, 346, 5)], [320, () => candles(S, 214, 352, 4)], [320, () => candles(S, 560, 306, 3)],
    [340, () => pillarB(S, 112, 358)],
  ];
  const snap = pc.clone(), lights0 = S.lights.length, emit0 = S.emit.clone();
  for (const [, fn] of props) fn();
  const shadowList = S.shadows.splice(0).filter((q) => q.fp.length);
  pc.data.set(snap.data); S.lights.length = lights0; S.emit.data.set(emit0.data);
  for (const sh of shadowList) darkenShadow(pc, sh.fp, sh.h, 0.5);
  props.sort((x, y) => x[0] - y[0]);
  for (const [, fn] of props) fn();
  S.shadows.length = 0;
  lighting(S, 0.82, [205, 225, 245, 255]);
  return pc;
}

// ---------- вывод ----------
export function up(src: PC, k: number): PC {
  const o = new PC(src.w * k, src.h * k);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, src.get(Math.floor(x / k), Math.floor(y / k))!);
  return o;
}
if (process.argv[1] && /dungeon-mock/.test(process.argv[1])) {
  fs.mkdirSync("tools/out/dungeon", { recursive: true });
  up(sceneA(), 2).save("tools/out/dungeon/opt-a.png");
  up(sceneB(), 2).save("tools/out/dungeon/opt-b.png");
}
void IRON; void LEATHER; void WOOD; void finish; void OUT; void TOP; void FRONT; void RIGHT; void withA;
