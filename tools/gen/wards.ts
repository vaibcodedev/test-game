/** Обереги против невидимок (задача 132, шаг 6; server/src/game/wards.ts, data/patrols.json wards): свой вид вместо временных crystal и
 *  dark_obelisk. По 2 варианта на фракцию — 1: тотем с гербом (столб, капитель, малая эмблема утверждённого герба), 2: рунный камень
 *  с высеченным светящимся гербом и рунами. Не выше ~1,2 роста героя (38 px), объём (свет сверху слева, 4–6 тонов), контур OUTLINE,
 *  блики; цикл 12 кадров: мягкое свечение по синусу (easing), огоньки по орбите (кодом), у Умбрата — бегущий свет по трещинам.
 *  Эффект срабатывания (оберег раскрыл невидимку): волна по земле, столб света, всплывающий герб, искры — 12 кадров с easing.
 *
 *  Запуск: npx tsx tools/gen/wards.ts — монтаж tools/out/wards-look/compare.png («вариант 1 | вариант 2»: мост на траве и ворота поселения
 *  на брусчатке рядом с героем, день и ночь) и листы кадров. В игру (writeWardsGame, из tools/gen-assets.ts): client/public/assets/vfx/
 *  ward-sol.png, ward-umb.png (GAME_VARIANT), ward-reveal-sol.png, ward-reveal-umb.png + записи в vfx/manifest.json. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, OUTLINE, hex, mix, withA, type RGBA, type Ramp } from "./canvas";
import { factionEmblem, SOLGARD_SHIELD_TOP } from "./heraldry";
import { ROOT, readPng, crop, scaleNN, paintGround, drawText, BG, BEIGE } from "./vendor-lib";
import { toRow } from "./vfx-lib";

type Fac = "solgard" | "umbrath";
/** Какой вариант стоит в игре (второй — только в монтаже, на выбор пользователя). */
export const GAME_VARIANT: Record<Fac, 1 | 2> = { solgard: 1, umbrath: 1 };
const SHORT: Record<Fac, string> = { solgard: "sol", umbrath: "umb" };

const R = (...cs: string[]): Ramp => cs.map((c) => hex(c));
const MARBLE = R("#4a4654", "#6a6670", "#8e8a94", "#b4b0b8", "#d4d0d6", "#eeeaf0");
const GRANITE = R("#3a3640", "#58525a", "#7c7478", "#a29a96", "#c6beb4", "#e4ddd0");
const GOLD = R("#5a3610", "#a8681c", "#e0a630", "#ffd864", "#fff2b0");
const OBS = R("#0c0a14", "#18142a", "#272040", "#3a3160", "#55498a", "#7a6cb0");
const IRON = R("#141420", "#24243a", "#3a3a54", "#565674", "#7c7a9a");
const BONE = R("#5a5248", "#8a8274", "#bcb4a2", "#e6e0cc");
const MOSS = R("#1e3a22", "#2e5430", "#46723e");
/** Свечение: от тёмного края к белому сердцу. */
const GLOW: Record<Fac, Ramp> = {
  solgard: R("#8a4e14", "#d08a24", "#ffc848", "#ffe890", "#fffbe0"),
  umbrath: R("#3a1670", "#6a34c0", "#a070ff", "#d2b4ff", "#f6eeff"),
};
/** Второе свечение Умбрата — мертвенно-зелёные глаза и камни короны. */
const GREEN = R("#14502e", "#2a9a50", "#62e07a", "#b8ffc0", "#f0fff0");

const W = 28, H = 46, GY = 43, CX = 14, FRAMES = 12, FPS = 10;
const ease = (t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);            // 0→1→0 за цикл, плавно
const outCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const inQuad = (t: number) => Math.min(1, Math.max(0, t)) ** 2;
const h2 = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const pick = (r: Ramp, t: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))];
const luma = (c: RGBA) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const isGreen = (c: RGBA) => c[1] > c[0] + 30 && c[1] > c[2] + 20;
const isGold = (c: RGBA) => c[0] > 150 && c[1] > 110 && c[2] < c[1] - 30;

type Mask = (x: number, y: number) => boolean;
/** Объёмная заливка формы: цилиндр по строке (свет слева), светлая верхняя грань, тень у земли, крупное зерно камня 2×2 (без шума в пиксель). */
function shade(pc: PC, m: Mask, r: Ramp, o: { x0?: number; x1?: number; y0?: number; y1?: number; grain?: number; top?: number } = {}) {
  const x0 = o.x0 ?? 0, x1 = o.x1 ?? pc.w - 1, y0 = o.y0 ?? 0, y1 = o.y1 ?? pc.h - 1;
  for (let y = y0; y <= y1; y++) {
    let l = -1, rr = -1;
    for (let x = x0; x <= x1; x++) if (m(x, y)) { if (l < 0) l = x; rr = x; }
    if (l < 0) continue;
    for (let x = l; x <= rr; x++) {
      if (!m(x, y)) continue;
      const u = rr === l ? 0.5 : (x + 0.5 - l) / (rr + 1 - l), nx = (u - 0.5) * 2, nz = Math.sqrt(Math.max(0, 1 - nx * nx));
      let lum = -0.55 * nx + 0.75 * nz;
      if (!m(x, y - 1)) lum += o.top ?? 0.45;
      if (!m(x, y + 1) || y >= GY - 2) lum -= 0.3;
      lum += ((h2(x >> 1, y >> 1) - 0.5) * (o.grain ?? 0.25));
      pc.set(x, y, pick(r, (lum + 0.5) / 1.5));
    }
  }
}
/** Мягкий ореол (полупрозрачные пиксели, свет падает к краю по квадрату). */
function halo(pc: PC, cx: number, cy: number, rx: number, ry: number, c: RGBA, a: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d >= 1) continue;
    const k = (1 - d) * (1 - d);
    if (pc.alpha(x, y) === 0) pc.set(x, y, withA(c, Math.round(a * k)));
  }
}
/** Искра «плюсом»: яркое сердце и тусклые лучи (не одиночный пиксель). */
function spark(pc: PC, x: number, y: number, r: Ramp, a: number, big = false) {
  x = Math.round(x); y = Math.round(y);
  const arm = withA(r[2], Math.round(150 * a)), core = withA(r[4], Math.round(255 * a));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pc.set(x + dx, y + dy, arm);
  if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, -2]]) pc.set(x + dx, y + dy, withA(r[1], Math.round(90 * a)));
  pc.set(x, y, core);
}
/** Высеченный в камне герб: бороздка (тень сверху слева, свет снизу справа), внутри — свет по яркости рисунка. */
function carve(pc: PC, em: PC, ox: number, oy: number, glow: Ramp, p: number, stoneDark: RGBA, stoneLit: RGBA, green?: Ramp) {
  const on = (i: number, j: number) => em.alpha(i, j) > 0;
  for (let j = 0; j < em.h; j++) for (let i = 0; i < em.w; i++) {
    if (on(i, j)) continue;
    if (on(i + 1, j + 1) || on(i + 1, j) || on(i, j + 1)) pc.set(ox + i, oy + j, stoneDark);
    else if (on(i - 1, j - 1) || on(i - 1, j) || on(i, j - 1)) pc.set(ox + i, oy + j, stoneLit);
  }
  for (let j = 0; j < em.h; j++) for (let i = 0; i < em.w; i++) {
    const c = em.get(i, j)!;
    if (!c[3]) continue;
    const y = luma(c) / 255;
    if (y < 0.16) { pc.set(ox + i, oy + j, stoneDark); continue; }        // контур эмблемы — глубина бороздки
    const r = green && isGreen(c) ? green : glow;
    pc.set(ox + i, oy + j, pick(r, Math.min(1, Math.max(0, y * 1.05 - 0.2 + p * 0.25))));
  }
}
/** Свечение части эмблемы (солнце Сольгарда, зелёные камни и глаза Умбрата): к белому по пульсу. */
function emit(em: PC, sel: (c: RGBA, i: number, j: number) => boolean, p: number, to: RGBA): { pc: PC; pts: [number, number][] } {
  const pc = em.clone(), pts: [number, number][] = [];
  pc.map((c, i, j) => { if (!sel(c, i, j)) return c; pts.push([i, j]); return mix(c, withA(to, 255), 0.15 + 0.4 * p); });
  return { pc, pts };
}

interface Frame { body: PC; emit: PC }
/** Огоньки по орбите вокруг точки: задние — до тела, передние — после. */
function orbit(n: number, f: number, cx: number, cy: number, rx: number, ry: number, rise = 0) {
  return Array.from({ length: n }, (_, k) => {
    const a = 2 * Math.PI * (f / FRAMES + k / n);
    const life = (f / FRAMES + k / n) % 1;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry - rise * life, front: Math.sin(a) > 0, a: Math.sin(Math.PI * life) };
  });
}
function shadow(pc: PC, rx: number) {
  for (let y = GY - 3; y <= GY + 2; y++) for (let x = CX - rx - 1; x <= CX + rx + 1; x++) {
    const d = Math.hypot((x + 0.5 - CX) / rx, (y + 0.5 - GY) / 2.6);
    if (d < 1) pc.set(x, y, [10, 8, 16, Math.round(90 * (1 - d * d))]);
  }
}

// ---------------------------------------------------------------- Сольгард
/** Вариант 1: тотем — мраморный столб на двух ступенях, золотые пояса, капитель, герб «Восход над Оплотом»; солнце герба дышит светом. */
function solTotem(f: number): Frame {
  const p = ease(f / FRAMES), body = new PC(W, H), em0 = factionEmblem("solgard", "s16");
  const m: Mask = (x, y) =>
    (y >= 39 && y < GY && x >= 6 && x <= 21) || (y >= 35 && y < 39 && x >= 8 && x <= 19) || (y >= 22 && y < 35 && x >= 10 && x <= 17) || (y >= 19 && y < 22 && x >= 8 && x <= 19);
  shade(body, m, MARBLE, { grain: 0.18 });
  shade(body, (x, y) => m(x, y) && (y === 33 || y === 34 || y === 22 || y === 23 || y === 39), GOLD, { grain: 0, top: 0.6 });
  // солнечный ромб на столбе
  const g = GLOW.solgard;
  for (const [dx, dy, t] of [[0, -1, 0.5], [-1, 0, 0.5], [1, 0, 0.5], [0, 1, 0.5], [0, 0, 1]] as const) body.set(13 + dx + 0.5, 28 + dy, pick(g, 0.3 + t * (0.3 + 0.4 * p)));
  body.set(14, 28, pick(g, 0.6 + 0.4 * p));
  body.outline(OUTLINE);
  const top = SOLGARD_SHIELD_TOP.s16;
  const e = emit(em0, (c, _i, j) => j < top && isGold(c), p, g[4]);
  body.blit(e.pc, 6, 4);
  const out = new PC(W, H), em = new PC(W, H);
  shadow(out, 9);
  halo(out, CX, 8, 9 + p, 7 + p, g[3], 60 + 70 * p);
  const motes = orbit(3, f, CX, 26, 10, 3, 10);
  for (const s of motes) if (!s.front) spark(out, s.x, s.y, g, s.a * 0.8);
  out.blit(body, 0, 0);
  for (const s of motes) if (s.front) spark(out, s.x, s.y, g, s.a);
  halo(em, CX, 8, 9 + p, 7 + p, g[3], 60 + 70 * p);
  for (const [i, j] of e.pts) em.set(6 + i, 4 + j, withA(g[3], 200));
  for (const s of motes) spark(em, s.x, s.y, g, s.a);
  return { body: out, emit: em };
}
/** Вариант 2: рунный камень — светлый гранитный менгир, высеченный светящийся герб, пояс из трёх рун, мох у подножия. */
const RUNES = [["010", "111", "010", "101"], ["101", "010", "101", "010"], ["110", "011", "110", "010"]];
function solStone(f: number): Frame {
  const p = ease(f / FRAMES), body = new PC(W, H), em0 = factionEmblem("solgard", "s16");
  const m: Mask = (x, y) => {
    if (y < 8 || y >= GY) return false;
    const cx = 14 + (GY - y) * 0.03;
    let hw = 7.6 + (1.6 * (y - 8)) / 35;
    if (y < 14) hw *= Math.sqrt(Math.max(0, 1 - ((14 - y) / 6.4) ** 2));
    if (h2(Math.floor(y / 3), x < cx ? 1 : 2) > 0.72) hw -= 1;              // сколы по краю
    return Math.abs(x + 0.5 - cx) <= hw;
  };
  shade(body, m, GRANITE, { grain: 0.3 });
  // мох у подножия
  for (let x = 4; x < 25; x++) for (let y = GY - 4; y < GY; y++) if (m(x, y) && h2(x >> 1, y) > 0.45 - (y - (GY - 4)) * 0.12) body.set(x, y, pick(MOSS, h2(x, y >> 1) * 0.9 + (x < 13 ? 0.2 : 0)));
  const g = GLOW.solgard;
  carve(body, em0, 6, 12, g, p, GRANITE[0], GRANITE[5]);
  RUNES.forEach((rn, k) => rn.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== "1") return;
    const x = 8 + k * 4 + i, y = 31 + j, q = ease(f / FRAMES - k / 6);
    body.set(x, y, pick(g, 0.25 + 0.6 * q));
    if (!m(x + 1, y + 1)) return;
    if (rn[j + 1]?.[i] !== "1") body.set(x, y + 1, GRANITE[1]);
  })));
  body.outline(OUTLINE);
  const out = new PC(W, H), em = new PC(W, H);
  shadow(out, 10);
  halo(out, CX, 20, 12 + p, 13 + p, g[2], 30 + 55 * p);
  const motes = orbit(4, f, CX, 30, 11, 3, 18);
  for (const s of motes) if (!s.front) spark(out, s.x, s.y, g, s.a * 0.7);
  out.blit(body, 0, 0);
  for (const s of motes) if (s.front) spark(out, s.x, s.y, g, s.a);
  halo(em, CX, 20, 12 + p, 13 + p, g[2], 30 + 55 * p);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const c = em0.get(i, j)!; if (c[3] && luma(c) > 40) em.set(6 + i, 12 + j, withA(g[3], 120 + 100 * p)); }
  for (const s of motes) spark(em, s.x, s.y, g, s.a);
  return { body: out, emit: em };
}

// ---------------------------------------------------------------- Умбрат
/** Вариант 1: тотем — чёрный каменный цоколь с костями, железный столб с шипами, герб «Корона над гробом»; камни короны и глаза тлеют
 *  зелёным, вокруг кружат лиловые души. */
function umbTotem(f: number): Frame {
  const p = ease(f / FRAMES), body = new PC(W, H), em0 = factionEmblem("umbrath", "s16");
  const base: Mask = (x, y) => (y >= 38 && y < GY && x >= 6 && x <= 21 && !(y === 38 && (x === 6 || x === 21))) || (y >= 35 && y < 38 && x >= 9 && x <= 18);
  shade(body, base, OBS, { grain: 0.35 });
  const post: Mask = (x, y) => y >= 19 && y < 35 && x >= 11 && x <= 16;
  shade(body, post, IRON, { grain: 0.1 });
  shade(body, (x, y) => post(x, y) && (y === 24 || y === 31), IRON, { grain: 0, top: 0.8 });
  // шипы по бокам столба
  for (const [sx, d] of [[10, -1], [17, 1]] as const) for (let k = 0; k < 3; k++) body.set(sx + d * k, 27 - k, pick(IRON, 0.75 - k * 0.15));
  // черепки у цоколя
  for (const [bx, by] of [[7, 37], [19, 37]] as const) { body.shadedEllipse(bx, by, 2.2, 1.8, BONE); body.set(Math.round(bx) - 1, by, OUTLINE); body.set(Math.round(bx), by, OUTLINE); }
  // трещина с бегущим лиловым светом
  const crack: [number, number][] = [[13, 42], [13, 41], [14, 40], [14, 39], [15, 38], [15, 37], [14, 36]];
  crack.forEach(([x, y], k) => body.set(x, y, pick(GLOW.umbrath, 0.2 + 0.7 * ease(f / FRAMES - k / crack.length))));
  body.outline(OUTLINE);
  const e = emit(em0, (c) => isGreen(c), p, GREEN[4]);
  body.blit(e.pc, 6, 4);
  const g = GLOW.umbrath, out = new PC(W, H), em = new PC(W, H);
  shadow(out, 9);
  halo(out, CX, 10, 9 + p, 7 + p, g[2], 50 + 70 * p);
  const motes = orbit(3, f, CX, 24, 10, 3, 12);
  for (const s of motes) if (!s.front) spark(out, s.x, s.y, g, s.a * 0.7);
  out.blit(body, 0, 0);
  for (const s of motes) if (s.front) spark(out, s.x, s.y, g, s.a);
  halo(em, CX, 10, 9 + p, 7 + p, g[2], 50 + 70 * p);
  for (const [i, j] of e.pts) em.set(6 + i, 4 + j, withA(GREEN[3], 220));
  crack.forEach(([x, y], k) => em.set(x, y, withA(g[3], Math.round(255 * ease(f / FRAMES - k / crack.length)))));
  for (const s of motes) spark(em, s.x, s.y, g, s.a);
  return { body: out, emit: em };
}
/** Вариант 2: рунный камень — зубчатый осколок обсидиана с гранями, высеченный герб светится лиловым (глаза зелёным), по трещинам
 *  снизу вверх бежит свет. */
function umbStone(f: number): Frame {
  const p = ease(f / FRAMES), body = new PC(W, H), em0 = factionEmblem("umbrath", "s16");
  const poly: [number, number][] = [[4, GY], [6.5, 31], [5.5, 21], [8.5, 12], [12.5, 5], [15, 9], [17.5, 6], [21, 15], [21.5, 26], [24, GY]];
  const tmp = new PC(W, H);
  tmp.poly(poly, [255, 255, 255, 255]);
  const m: Mask = (x, y) => tmp.alpha(x, y) > 0;
  shade(body, m, OBS, { grain: 0.15, top: 0.6 });
  // грань: правее линии — на тон темнее, по ребру — блик
  for (let y = 6; y < GY; y++) { const ex = Math.round(15 + (y - 6) * 0.12); for (let x = ex; x < W; x++) if (m(x, y)) { const c = body.get(x, y)!; body.set(x, y, mix(c, OBS[0], 0.35)); } if (m(ex - 1, y) && y % 5 !== 0) body.set(ex - 1, y, OBS[4]); }
  const g = GLOW.umbrath;
  carve(body, em0, 7, 14, g, p, OBS[0], OBS[4], GREEN);
  // трещины с бегущим светом
  const cracks: [number, number][][] = [[[9, 42], [9, 41], [10, 40], [10, 39], [9, 38], [9, 37], [10, 36], [10, 35], [11, 34], [11, 33], [12, 32], [12, 31]], [[19, 42], [19, 41], [18, 40], [18, 39], [19, 38], [19, 37], [18, 36], [17, 35], [17, 34]]];
  for (const cr of cracks) cr.forEach(([x, y], k) => body.set(x, y, pick(g, 0.15 + 0.8 * ease(f / FRAMES - k / cr.length))));
  body.outline(OUTLINE);
  const out = new PC(W, H), em = new PC(W, H);
  shadow(out, 10);
  halo(out, CX, 22, 12 + p, 14 + p, g[2], 30 + 60 * p);
  const motes = orbit(3, f, CX, 32, 11, 3, 20);
  for (const s of motes) if (!s.front) spark(out, s.x, s.y, GREEN, s.a * 0.7);
  out.blit(body, 0, 0);
  for (const s of motes) if (s.front) spark(out, s.x, s.y, GREEN, s.a);
  halo(em, CX, 22, 12 + p, 14 + p, g[2], 30 + 60 * p);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 15; i++) { const c = em0.get(i, j)!; if (c[3] && luma(c) > 40) em.set(7 + i, 14 + j, withA(isGreen(c) ? GREEN[3] : g[3], 110 + 110 * p)); }
  for (const cr of cracks) cr.forEach(([x, y], k) => em.set(x, y, withA(g[3], Math.round(255 * ease(f / FRAMES - k / cr.length)))));
  for (const s of motes) spark(em, s.x, s.y, GREEN, s.a);
  return { body: out, emit: em };
}

const ART: Record<Fac, Record<1 | 2, (f: number) => Frame>> = { solgard: { 1: solTotem, 2: solStone }, umbrath: { 1: umbTotem, 2: umbStone } };
export const NAMES: Record<Fac, Record<1 | 2, string>> = { solgard: { 1: "TOTEM", 2: "RUNESTONE" }, umbrath: { 1: "TOTEM", 2: "RUNESTONE" } };
export function wardFrames(fac: Fac, v: 1 | 2): Frame[] { return Array.from({ length: FRAMES }, (_, f) => ART[fac][v](f)); }

// ---------------------------------------------------------------- срабатывание
const RW = 104, RH = 84, RGY = 72, RFR = 12, RFPS = 14;
/** Оберег раскрыл невидимку: волна по земле (два кольца, 3 тона), столб света, герб всплывает над оберегом, искры разлетаются по кольцу. */
export function revealFrames(fac: Fac): PC[] {
  const g = GLOW[fac], sp = fac === "umbrath" ? GREEN : g, em = factionEmblem(fac, "s16"), cx = RW / 2;
  return Array.from({ length: RFR }, (_, f) => {
    const t = f / (RFR - 1), pc = new PC(RW, RH);
    const ring = (r: number, a: number) => {
      if (a <= 0 || r < 2) return;
      const ry = r * 0.38;
      for (let y = Math.floor(RGY - ry - 2); y <= RGY + ry + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        const d = Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - RGY) / ry) * r, k = r - d;
        if (k < 0 || k >= 4) continue;
        const back = y < RGY ? 0.7 : 1;
        pc.set(x, y, withA(g[k < 1 ? 4 : k < 2 ? 3 : k < 3 ? 2 : 1], Math.round(255 * a * back * (k < 3 ? 1 : 0.5))));
      }
    };
    // столб света: бьёт сразу, сужается и гаснет к 7-му кадру
    const bt = Math.min(1, t * 1.6), bw = 2 + 10 * (1 - outCubic(bt)), bh = 60 * outCubic(Math.min(1, t * 4)), ba = 1 - inQuad(bt);
    if (ba > 0) for (let y = Math.round(RGY - bh); y <= RGY; y++) for (let x = Math.floor(cx - bw); x <= cx + bw; x++) {
      const u = Math.abs(x + 0.5 - cx) / bw, v = (RGY - y) / Math.max(1, bh);
      if (u > 1) continue;
      pc.set(x, y, withA(pick(g, 1 - u * 0.8), Math.round(255 * ba * (1 - v) * (1 - u * u * 0.6))));
    }
    // герб всплывает и тает
    const ea = Math.min(1, f / 2) * (1 - inQuad((t - 0.55) / 0.45)), ey = Math.round(RGY - 34 - 10 * outCubic(t));
    if (ea > 0) {
      halo(pc, cx, ey + 8, 13, 11, g[2], Math.round(120 * ea));
      for (let j = 0; j < em.h; j++) for (let i = 0; i < em.w; i++) {
        const c = em.get(i, j)!;
        if (!c[3]) continue;
        const y = luma(c) / 255, r = fac === "umbrath" && isGreen(c) ? GREEN : g;
        pc.set(Math.round(cx - em.w / 2) + i, ey + j, withA(y < 0.16 ? r[0] : pick(r, 0.35 + y * 0.65), Math.round(255 * ea)));
      }
    }
    ring(6 + 40 * outCubic(t), 1 - inQuad((t - 0.2) / 0.8));
    if (f >= 2) ring(4 + 30 * outCubic((t - 0.15) / 0.85), 0.6 * (1 - inQuad((t - 0.3) / 0.7)));
    // искры по кольцу: вылетают наружу и вверх
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * 2 * Math.PI + h2(k, 3) * 0.5, r = 8 + 44 * outCubic(t) * (0.8 + 0.3 * h2(k, 7));
      const x = cx + Math.cos(a) * r, y = RGY + Math.sin(a) * r * 0.38 - 16 * outCubic(t) * h2(k, 5);
      const al = f < 1 ? 0 : 1 - inQuad((t - 0.35) / 0.65);
      if (al > 0) spark(pc, x, y, sp, al, k % 3 === 0);
    }
    return pc;
  });
}

// ---------------------------------------------------------------- в игру
/** Листы в client/public/assets/vfx/ и записи в manifest.json (остальные записи не трогаются). */
export function writeWardsGame(assetsRoot: string) {
  const dir = path.join(assetsRoot, "vfx"), mf = path.join(dir, "manifest.json");
  let m: Record<string, unknown> = {};
  try { m = JSON.parse(fs.readFileSync(mf, "utf8")); } catch { /* манифеста ещё нет */ }
  for (const fac of ["solgard", "umbrath"] as const) {
    const id = `ward-${SHORT[fac]}`, fr = wardFrames(fac, GAME_VARIANT[fac]).map((x) => x.body);
    toRow(fr, W, H).save(path.join(dir, `${id}.png`));
    m[id] = { frameW: W, frameH: H, frames: FRAMES, fps: FPS, anchor: [+(CX / W).toFixed(4), +(GY / H).toFixed(4)], blend: "normal" };
    const rid = `ward-reveal-${SHORT[fac]}`;
    toRow(revealFrames(fac), RW, RH).save(path.join(dir, `${rid}.png`));
    m[rid] = { frameW: RW, frameH: RH, frames: RFR, fps: RFPS, anchor: [0.5, +(RGY / RH).toFixed(4)], blend: "normal" };
  }
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(mf, JSON.stringify(sorted, null, 1) + "\n");
}

// ---------------------------------------------------------------- монтаж
const OUT = path.join(ROOT, "tools/out/wards-look");
const OBJ = (id: string) => readPng(path.join(ROOT, "client/public/assets/objects", `${id}.png`));
const heroOf = (id: string) => crop(readPng(path.join(ROOT, "client/public/assets/units", `${id}.png`)), 0, 0, 32, 32);
function addBlit(dst: PC, src: PC, dx: number, dy: number, k = 1) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.get(x, y)!, i = ((dy + y) * dst.w + dx + x) * 4;
    if (!c[3] || !dst.inside(dx + x, dy + y)) continue;
    const a = (c[3] / 255) * k;
    for (let q = 0; q < 3; q++) dst.data[i + q] = Math.min(255, dst.data[i + q] + c[q] * a);
  }
}
const PW = 200, PH = 112;
/** Сцена: мост (берег — трава, справа вода, башня стены) или ворота поселения (брусчатка); оберег рядом с героем; ночью — тьма и свет оберега. */
function panel(fac: Fac, v: 1 | 2, scene: "bridge" | "gate", night: boolean, f = 3): PC {
  const pc = new PC(PW, PH), fr = ART[fac][v](f), feet = 100;
  let wx: number;
  if (scene === "bridge") {
    paintGround(pc, 0, 0, PW, PH, "grass");
    pc.rect(132, 0, PW - 132, PH, hex("#285a9e"));
    for (let y = 4; y < PH; y += 9) for (let x = 136 + (y % 18 ? 5 : 0); x < PW; x += 14) pc.rect(x, y, 5, 1, hex("#3a78bc"));
    const br = OBJ("bridge_h");
    pc.blit(crop(br, 0, 0, 72, br.h), 126, feet - br.h + 24);
    const tw = OBJ(`bf_wall_tower_${SHORT[fac]}`);
    pc.blit(tw, 2, feet - tw.h - 4);
    wx = 92;
  } else {
    paintGround(pc, 0, 0, PW, PH, "cobble");
    const gt = OBJ(fac === "solgard" ? "sol_gate" : "umb_gate");
    pc.blit(gt, 4, feet - gt.h - 2);
    wx = 120;
  }
  pc.blit(heroOf(fac === "solgard" ? "warrior" : "rogue"), wx + 22, feet - 31);
  pc.blit(fr.body, wx - CX, feet - GY);
  if (night) {
    pc.map((c) => [c[0] * 0.3, c[1] * 0.34, c[2] * 0.52, c[3]]);
    const g = GLOW[fac][2];
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const d = Math.hypot(x - wx, (y - (feet - 24)) * 1.2) / 46;
      if (d >= 1) continue;
      const k = 0.4 * (1 - d) * (1 - d), i = (y * PW + x) * 4;
      for (let q = 0; q < 3; q++) pc.data[i + q] = Math.min(255, pc.data[i + q] + g[q] * k);
    }
    addBlit(pc, fr.emit, wx - CX, feet - GY, 0.9);
  }
  return pc;
}
function label(pc: PC, s: string, x: number, y: number) { pc.rect(x - 1, y - 1, s.length * 4 + 1, 7, [18, 15, 22, 230]); drawText(pc, s, x, y, BEIGE); }
export function writeCompare() {
  fs.mkdirSync(OUT, { recursive: true });
  const K = 2, GAP = 6, colW = PW * K, rows: PC[] = [];
  for (const fac of ["solgard", "umbrath"] as const) {
    const head = new PC(colW * 2 + GAP, 22);
    head.rect(0, 0, head.w, head.h, BG);
    label(head, `${fac.toUpperCase()}  V1 ${NAMES[fac][1]}  |  V2 ${NAMES[fac][2]}`, 6, 8);
    rows.push(scaleNN(head, 1));
    for (const night of [false, true]) for (const scene of ["bridge", "gate"] as const) {
      const row = new PC(colW * 2 + GAP, PH * K);
      row.rect(0, 0, row.w, row.h, BG);
      ([1, 2] as const).forEach((v, i) => {
        const p = panel(fac, v, scene, night);
        label(p, `V${v} ${scene.toUpperCase()} ${night ? "NIGHT" : "DAY"}`, 3, 3);
        row.blit(scaleNN(p, K), i * (colW + GAP), 0);
      });
      rows.push(row);
    }
    // кадры цикла обоих вариантов (через один, ×2) и срабатывание (кадры 1–10, ×2)
    const strip = new PC(colW * 2 + GAP, H * 2 + 8);
    strip.rect(0, 0, strip.w, strip.h, BG);
    ([1, 2] as const).forEach((v, i) => wardFrames(fac, v).forEach((fr, k) => {
      if (k % 2) return;
      const cell = new PC(W + 4, H); paintGround(cell, 0, 0, cell.w, cell.h, k % 4 ? "cobble" : "grass"); cell.blit(fr.body, 2, 0);
      strip.blit(scaleNN(cell, 2), i * (colW + GAP) + (k / 2) * (cell.w * 2 + 2), 4);
    }));
    rows.push(strip);
    const rv = revealFrames(fac), CW2 = 76, rs = new PC(colW * 2 + GAP, (CW2 * 2 + 4) * 2 + 4);
    rs.rect(0, 0, rs.w, rs.h, BG);
    rv.slice(1, 11).forEach((fr, k) => {
      const cell = new PC(RW, RH); paintGround(cell, 0, 0, RW, RH, k % 2 ? "cobble" : "grass");
      cell.blit(ART[fac][1](0).body, RW / 2 - CX, RGY - GY); cell.blit(fr, 0, 0);
      rs.blit(scaleNN(crop(cell, (RW - CW2) / 2, RH - CW2, CW2, CW2), 2), (k % 5) * (CW2 * 2 + 4), Math.floor(k / 5) * (CW2 * 2 + 4) + 4);
    });
    rows.push(rs);
  }
  const H2 = rows.reduce((s, r) => s + r.h + GAP, 0), out = new PC(colW * 2 + GAP, H2);
  out.rect(0, 0, out.w, out.h, BG);
  let y = 0;
  for (const r of rows) { out.blit(r, 0, y); y += r.h + GAP; }
  out.save(path.join(OUT, "compare.png"));
  for (const fac of ["solgard", "umbrath"] as const) {
    for (const v of [1, 2] as const) toRow(wardFrames(fac, v).map((x) => x.body), W, H).save(path.join(OUT, `ward-${SHORT[fac]}-${v}.png`));
    toRow(revealFrames(fac), RW, RH).save(path.join(OUT, `ward-reveal-${SHORT[fac]}.png`));
  }
  console.log("обереги:", path.relative(ROOT, path.join(OUT, "compare.png")));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeCompare();
  if (process.argv.includes("--game")) writeWardsGame(path.join(ROOT, "client/public/assets"));
}
