/** Прототип генерации недостающих эффектов (задача 127, шаг 1): круг призыва, цепь, брызги крови.
 *  Стиль выбранных паков: жёсткие пиксели без сглаживания, 4–6 тонов на эффект, 1-пиксельные блики, кадры 8–10.
 *  Круг рисуется в серой яркости и красится той же градиентной картой, что и паки (RAMPS), поэтому варианты стихий бесплатны.
 *  Запуск отдельно: tsx tools/gen/vfx-gen.ts — пишет tools/out/vfx-preview/gen-raw.png. Основной вход — GENERATED() из vfx.ts. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, rng, type RGBA } from "./canvas";
import { RAMPS, gradientMap, storyboard, stackV, hex } from "./vfx-lib";

/** Орбита ауры (рунный клинок): позиции считает клиент каждый кадр (client/src/game/vfx.ts), лист — только сами предметы.
 *  Кадры листа: 0..n-1 — предметы, n..2n-1 — ореол (мерцает альфой по синусу, смешивание add), 2n..3n-1 — блик (короткая вспышка).
 *  Размеры — пиксели мира: полуоси rx/ry, oy — центр орбиты от ног (минус — выше); времена — мс; back — яркость самой дальней точки (0..1). */
export interface Orbit { n: number; rx: number; ry: number; oy: number; period: number; bob: number; bobPeriod: number; glow: [number, number]; glowPeriod: number; back: number; twinkle: number }

export interface Gen {
  id: string; pack: string; role: "proj" | "hit" | "cast" | "aura" | "aoe" | "slash"; frames: PC[]; w: number; h: number; anchor: [number, number]; fps: number; blend: "normal" | "add"; hero?: string;
  /** Масштаб спрайта в игре: 0.5 — арт двойной плотности (1 пиксель листа = 1 пиксель холста при зуме 2). */
  scale?: number;
  orbit?: Orbit;
  /** Плавность (как Ease в vfx.ts): fadeIn/scaleIn — появление; tail — у разового эффекта растворение последних мс, без обрыва. */
  ease?: { fadeIn?: number; fadeOut?: number; scaleIn?: number; alpha?: number; tail?: number };
}

const gray = (v: number): RGBA => [v, v, v, 255];
/** Стираем пиксели «рассыпанием»: чем больше level (0..1), тем больше пикселей исчезает (детерминированно по позиции). */
export function erode(f: PC, level: number, seed: number) {
  const r = rng(seed);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (r() < level) f.clear(x, y);
}

// ---------- 1. Круг призыва: земляной эллипс 0.7, 10 кадров ----------
const CW = 84, CH = 60, CX = CW / 2, CY = CH / 2, SQ = 0.7;
function ell(f: PC, R: number, v: number, a0 = 0, a1 = Math.PI * 2) {
  const n = Math.ceil(R * 8);
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; f.set(Math.round(CX + Math.cos(a) * R), Math.round(CY + Math.sin(a) * R * SQ), gray(v)); }
}
function polyStar(f: PC, R: number, rot: number, v: number) {
  const pts = [0, 1, 2].map((i) => { const a = rot + (i * Math.PI * 2) / 3; return [CX + Math.cos(a) * R, CY + Math.sin(a) * R * SQ] as [number, number]; });
  // линия в 2 пикселя: тень снизу, свет сверху (объём вместо однопиксельной нити)
  for (const [dy, vv] of [[1, Math.round(v * 0.45)], [0, v]] as const) for (let i = 0; i < 3; i++) f.line(Math.round(pts[i][0]), Math.round(pts[i][1]) + dy, Math.round(pts[(i + 1) % 3][0]), Math.round(pts[(i + 1) % 3][1]) + dy, gray(vv));
}
/** Кадр круга призыва: вход t0–5 (кольцо раскрывается (t+1)/6, звезда и руны проступают, вспышка на t5 — вне цикла), цикл t6–21: поворот
 *  rot = t·π/48, засечки по ходу, звезда и руны против (за 16 кадров цикла — 60°, период узора: стык бесшовный). Кадров выхода нет —
 *  выход клиент делает растворением (held) поверх вращения. */
function circleFrame(t: number): PC {
  const f = new PC(CW, CH);
  const grow = Math.min(1, (t + 1) / 6);
  const R = 38 * (0.35 + 0.65 * grow);
  const rot = (t * Math.PI) / 48;
  const flash = t === 5 ? 1 : 0;
  ell(f, R + 1, 40);                                // тёмная подложка кольца (даёт объём)
  ell(f, R, 150); ell(f, R - 1, 205);               // обод в 2 пикселя: внешний тон и светлая кромка
  ell(f, R - 5, 110); ell(f, R - 6, 55);            // внутреннее кольцо с тенью
  // засечки между кольцами, ползут по кругу (18 штук — период 20°, кратен циклу 60°)
  const ticks = 18;
  for (let i = 0; i < ticks; i++) {
    const a = rot + (i * Math.PI * 2) / ticks;
    for (let rr = R - 4; rr < R; rr += 1) f.set(Math.round(CX + Math.cos(a) * rr), Math.round(CY + Math.sin(a) * rr * SQ), gray(i % 3 === 0 ? 235 : 175));
  }
  if (t >= 2) {                                      // две перевёрнутые тройки — шестиконечная звезда
    const s = Math.min(1, (t - 1) / 4);
    polyStar(f, (R - 8) * s, -rot - Math.PI / 2, 215);
    polyStar(f, (R - 8) * s, -rot + Math.PI / 2, 215);
    ell(f, (R - 10) * s, 130);
  }
  if (t >= 3) for (let i = 0; i < 6; i++) {          // руны-ромбы по углам звезды
    const a = -rot - Math.PI / 2 + (i * Math.PI) / 3, x = Math.round(CX + Math.cos(a) * (R - 8)), y = Math.round(CY + Math.sin(a) * (R - 8) * SQ);
    f.set(x, y, gray(255)); f.set(x + 1, y, gray(235)); f.set(x - 1, y, gray(235)); f.set(x, y + 1, gray(235)); f.set(x, y - 1, gray(235));
  }
  if (flash) for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const dx = (x - CX) / (R - 6), dy = (y - CY) / ((R - 6) * SQ); if (dx * dx + dy * dy < 0.5 && f.alpha(x, y)) f.set(x, y, gray(255)); }
  return f;
}
function summonCircle(id: string, ramp: string): Gen {
  const N = 22;
  const raw = Array.from({ length: N }, (_, t) => circleFrame(t));
  const frames = gradientMap(raw, RAMPS[ramp], 0.9);
  return { id, pack: "gen", role: "aoe", frames, w: CW, h: CH, anchor: [0.5, 0.5], fps: 15, blend: "normal", hero: "warlock" };
}

// ---------- 2. Цепь: бесшовный отрезок 16×8 (степень двойки — TileSprite тянет его вдоль линии), 16 кадров блика ----------
const LW = 16, LH = 8;
/** Звено анфас (кольцо) и звено ребром (планка сквозь отверстие); блик идёт по верхней кромке на 1 px за кадр — за 16 кадров весь отрезок,
 *  стык бесшовный. */
function chainFrame(t: number): PC {
  const f = new PC(LW, LH);
  const D = hex("#23262f"), M = hex("#5d667c"), L = hex("#a9b4c8"), W = hex("#f2f6ff");
  const cy = 4;
  for (const off of [-LW, 0, LW]) {
    for (let y = 0; y < LH; y++) for (let x = -3; x < LW + 3; x++) {
      const dx = (x - (4 + off) + 0.5) / 5.4, dy = (y - cy + 0.5) / 3.6;
      const d = dx * dx + dy * dy, inner = (dx / 0.58) ** 2 + (dy / 0.4) ** 2;
      if (d <= 1 && inner >= 1 && x >= 0 && x < LW) f.set(x, y, d > 0.74 ? D : dy < -0.2 ? L : M);
    }
  }
  for (const off of [-LW, 0, LW]) {
    for (let x = 7; x < 18; x++) for (let y = cy - 1; y < cy + 2; y++) {
      const X = x + off; if (X < 0 || X >= LW) continue;
      const edge = x === 7 || x === 17;
      if (edge && y !== cy) continue;
      f.set(X, y, y === cy - 1 ? L : y === cy + 1 ? D : edge ? D : M);
    }
  }
  const gx = t % LW;
  for (let y = 0; y < LH; y++) if (f.alpha(gx, y)) { f.set(gx, y, W); const n = f.get(gx, y + 1); if (n && n[3]) f.set(gx, y + 1, L); break; }
  return f;
}
function chain(id: string, ramp?: string): Gen {
  let frames = Array.from({ length: 16 }, (_, t) => chainFrame(t));
  if (ramp) frames = gradientMap(frames, RAMPS[ramp], 1);
  return { id, pack: "gen", role: "hit", frames, w: LW, h: LH, anchor: [0, 0.5], fps: 20, blend: "normal", hero: "deathknight" };
}

// ---------- 3. Брызги крови: 8 кадров 48×40, капли летят дугой, на земле остаются пятна ----------
const BW = 48, BH = 40, GY = 30;
function bloodFrames(seed: number): PC[] {
  const B = RAMPS.blood, r = rng(seed), N = 8;
  const dark = B[1], mid = B[2], bright = B[3], hi = B[4], pale = B[5];
  const drops = Array.from({ length: 16 }, () => {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.5;
    const sp = 2.4 + r() * 3.4;
    return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 1.1, big: r() < 0.35 };
  });
  const frames: PC[] = [];
  const splats: [number, number, boolean][] = [];
  const landed = new Set<number>();
  for (let t = 0; t < N; t++) {
    const f = new PC(BW, BH);
    // центральная вспышка-клякса: ширится за 3 кадра и оседает
    const cr = [3, 6, 7, 6, 5, 4, 3, 2][t], core = r;
    void core;
    if (t < 6) for (let y = -cr; y <= cr; y++) for (let x = -cr; x <= cr; x++) {
      const ang = Math.atan2(y, x), jag = 1 + 0.35 * Math.sin(ang * 5 + t * 1.3) + 0.2 * Math.sin(ang * 9 + t);
      if (Math.hypot(x, y * 1.15) <= cr * jag) f.set(24 + x, 24 + y, Math.hypot(x, y) < cr * 0.45 ? (t < 2 ? pale : hi) : Math.hypot(x, y) < cr * 0.8 ? bright : mid);
    }
    // капли
    drops.forEach((d, i) => {
      if (landed.has(i)) return;
      const x = 24 + d.vx * t, y = 24 + d.vy * t + 0.55 * t * t;
      if (y >= GY && t > 0) { landed.add(i); splats.push([Math.round(x), GY + (i % 3), d.big]); return; }
      const px = 24 + d.vx * (t - 1), py = 24 + d.vy * (t - 1) + 0.55 * (t - 1) * (t - 1);
      f.set(Math.round(px), Math.round(py), dark);              // хвост капли
      f.set(Math.round(x), Math.round(y), d.big ? bright : mid);
      if (d.big) { f.set(Math.round(x) + 1, Math.round(y), mid); f.set(Math.round(x), Math.round(y) - 1, hi); }
    });
    // пятна на земле (остаются до конца, в последних кадрах сохнут)
    for (const [x, y, big] of splats) { f.set(x, y, big ? mid : dark); if (big) { f.set(x + 1, y, dark); f.set(x - 1, y, dark); f.set(x, y + 1, dark); } }
    // растворение одним зерном с t = N − 4: 0.25 / 0.5 / 0.75 / 1 (последний кадр пустой)
    if (t >= N - 4) erode(f, (t - (N - 5)) * 0.25, 11);
    frames.push(f);
  }
  return frames;
}
function bloodSplash(id: string, seed: number): Gen {
  return { id, pack: "gen", role: "hit", frames: bloodFrames(seed), w: BW, h: BH, anchor: [0.5, 0.6], fps: 15, blend: "normal", hero: "reaver", ease: { tail: 200 } };
}

export function GENERATED(): Gen[] {
  return [
    summonCircle("summon-circle-shadow", "shadow"), summonCircle("summon-circle-nature", "nature"), summonCircle("summon-circle-fire", "fire"), summonCircle("summon-circle-holy", "holy"),
    chain("chain-steel"), chain("chain-shadow", "shadow"),
    bloodSplash("blood-splash", 3), bloodSplash("blood-splash-b", 8),
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/gen-raw.png");
  stackV(GENERATED().map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f`, 3))).save(out);
  console.log(out);
}
