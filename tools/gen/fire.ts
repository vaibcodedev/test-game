/** Огонь под мир, вариант 2 (после отзыва «плоско, резкий срез снизу»): свои листы костров и пожарищ вместо bf-fire-s/m из пака.
 *
 *  Запуск: node node_modules/tsx/dist/cli.mjs tools/gen/fire.ts [--game]
 *  Выход:  tools/out/fire/compare2.png — «наш | эталон пака» крупно ×4 и в сцене днём и ночью; frames2.png — все кадры; листы *.png.
 *          С --game дополнительно client/public/assets/vfx/fire-*.png и записи в vfx/manifest.json (в игру по умолчанию не идёт).
 *  Эталоны (vendor/, git игнорирует): Zabin «Camp Fire animation for RPGs» (OpenGameArt, CC-BY-SA 3.0), maggew «Animated campfire»
 *  (itch, бесплатно), Devkidd Pixel Fire Pack 3 (Group 4-3 Floored). Что от них взято: пламя из отдельных узких изогнутых языков разной
 *  высоты, капли отрываются сверху и гаснут, высота «дышит»; ядро светлое внизу; низ пламени уходит в угли и за передние поленья (нет среза).
 *  Наше: объём 3/4 — гарь под костром, эллипс основы, задние поленья и камни за языками, передние — перед ними; грани поленьев и камней,
 *  обращённые к огню, освещены, тени от огня наружу; тёплое пятно света на земле (и днём); мягкий ореол по краю пламени;
 *  искры; дым отдельным листом — клубы растут, светлеют и рассеиваются. 16 кадров, 12 fps, цикл бесшовный (все фазы — целые частоты). */
import fs from "node:fs";
import path from "node:path";
import { PC, OUTLINE, hex, mix, type RGBA, type Ramp, pnoise, hash01 } from "./canvas";
import { P } from "./palette";
import { ROOT, readPng, writePng, scaleNN, paintGround, chipText, fill, BG, crop, trim } from "./vendor-lib";
import { readGif } from "./gif-read";

const OUT = path.join(ROOT, "tools/out/fire");
const ASSETS = path.join(ROOT, "client/public/assets");
const N = 16, FPS = 12, TAU = Math.PI * 2;

const F_RED = hex("#a8300f"), F_OR = hex("#e85e18"), F_YO = hex("#ffa133"), F_Y = hex("#ffd96a"), F_W = hex("#fff3cc");
const GLOW = hex("#ff7a22");
const CHAR: Ramp = [hex("#1a1216"), hex("#2a1e20"), hex("#43302a"), hex("#5e4232")];
const WOOD: Ramp = [hex("#3a2216"), hex("#5e3a22"), hex("#8a5a34"), hex("#b07e4c")];
const STONE: Ramp = P.stone.slice(0, 4);
const IRON: Ramp = [hex("#1c1a20"), hex("#2e2a30"), hex("#46404a"), hex("#686070")];
const ASHR = P.ash;
const S = (t: number, f: number, ph: number) => Math.sin(TAU * (t * f + ph));

// ---------- языки пламени ----------
/** Язык: основание (bx, by), высота h, ширина w; качается бегущей вверх волной, высота «дышит»; f — целые частоты (бесшовный цикл). */
interface Tongue { bx: number; by: number; w: number; h: number; ph: number; f?: number; drops?: number }
interface Def {
  id: string; w: number; h: number; fire: [number, number]; tongues: Tongue[]; sparks: number; light: number;
  ground: (pc: PC, t: number) => void; back: (pc: PC, t: number) => void; front: (pc: PC, t: number) => void; smoke?: [number, number];
}

function tongueHeat(T: Tongue, x: number, y: number, t: number): number {
  const f = T.f ?? 1;
  const H = T.h * (1 + 0.14 * S(t, f, T.ph) + 0.06 * S(t, 2 * f, T.ph * 1.7));
  const v = (T.by - y - 0.5) / H;
  if (v < -0.25 || v > 1.05) return 0;
  const vv = Math.max(0, v);
  const spine = T.bx + (0.55 * S(t, f, T.ph - vv * 0.45) + 0.3 * S(t, 2 * f, T.ph * 2.3 - vv * 0.8)) * Math.pow(vv, 1.25) * Math.min(H * 0.3, T.w * 1.05);
  const half = (T.w / 2) * (v < 0.18 ? 0.86 + 0.14 * Math.max(0, v) / 0.18 : 1) * Math.pow(Math.max(0, 1 - vv), 0.72);
  const u = Math.abs(x + 0.5 - spine) / Math.max(0.35, half);
  if (u >= 1.6) return 0;
  return Math.max(0, 1 - u * u * 0.85) * (1.02 - 0.62 * vv) - (v < 0 ? -v * 0.6 : 0);
}
/** Капли: отрываются у кончика языка, поднимаются, сжимаются и остывают. */
function dropHeat(T: Tongue, x: number, y: number, t: number): number {
  let m = 0;
  for (let k = 0; k < (T.drops ?? 1); k++) {
    const ph = hash01(k, Math.round(T.ph * 100), 5), p = (t * (T.f ?? 1) + ph) % 1;
    if (p > 0.85) continue;
    const cy = T.by - T.h * (0.72 + p * 0.7), cx = T.bx + S(p, 1, T.ph) * T.w * 0.35 + (p * p) * T.w * 0.2 * (hash01(k, 3, 9) - 0.5);
    const r = Math.max(0.5, (T.w * 0.24) * (1 - p * 0.95));
    const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 0.75) / r;
    if (d < 1) m = Math.max(m, (1 - d) * 0.55 + 0.5 - p * 0.42);
  }
  return m;
}
const tone = (q: number): RGBA | null => (q > 0.86 ? F_W : q > 0.68 ? F_Y : q > 0.5 ? F_YO : q > 0.33 ? F_OR : q > 0.2 ? F_RED : null);

function flameLayer(w: number, h: number, ts: Tongue[], t: number): { L: PC; q: Float32Array } {
  const L = new PC(w, h), q = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0, sum = 0;
    for (const T of ts) { const a = tongueHeat(T, x, y, t); m = Math.max(m, a); sum += a; m = Math.max(m, dropHeat(T, x, y, t)); }
    // языки сливаются у основания (сумма), мелкая рябь шума — живой край
    const n = pnoise(x, y + t * 32, 4, 16, 3) - 0.5;
    const v = m + Math.min(0.25, (sum - m) * 0.35) + n * 0.16;
    q[y * w + x] = v;
    const c = tone(v);
    if (c) L.set(x, y, c);
  }
  // одиночные пиксели прочь
  const src = L.clone();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src.alpha(x, y) && !src.alpha(x - 1, y) && !src.alpha(x + 1, y) && !src.alpha(x, y - 1) && !src.alpha(x, y + 1)) L.clear(x, y);
  // мягкий ореол по краю: полупрозрачный тёплый пиксель в два шага
  const s2 = L.clone();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (s2.alpha(x, y)) continue;
    let near = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (s2.alpha(x + dx, y + dy)) near = Math.max(near, Math.abs(dx) + Math.abs(dy) <= 1 ? 2 : Math.abs(dx) + Math.abs(dy) <= 2 ? 1 : 0);
    if (near === 2) L.set(x, y, [GLOW[0], GLOW[1], GLOW[2], 95]);
    else if (near === 1) L.set(x, y, [GLOW[0], GLOW[1], GLOW[2], 40]);
  }
  return { L, q };
}

// ---------- основа ----------
let FX = 0, FY = 0; // центр огня текущего листа (для света и теней)
/** Освещённость точки огнём: 0..1 по расстоянию, мерцает. */
const lightAt = (x: number, y: number, R: number, t: number) => Math.max(0, 1 - Math.hypot(x - FX, (y - FY) * 1.6) / (R * (0.94 + 0.06 * S(t, 2, 0.1) * S(t, 3, 0.4))));
/** Полено: свет со стороны огня (грань к огню светлее и теплее), тень — вниз от огня. ch — обугленность от a к b. */
function log(pc: PC, ax: number, ay: number, bx: number, by: number, r: number, chA: number, chB: number, t: number, R: number, cap: boolean | "char" = true) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  for (let y = Math.floor(Math.min(ay, by) - r - 1); y <= Math.max(ay, by) + r + 1; y++)
    for (let x = Math.floor(Math.min(ax, bx) - r - 1); x <= Math.max(ax, bx) + r + 1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay;
      const k = Math.max(0, Math.min(1, (px * dx + py * dy) / L2));
      const ox = px - dx * k, oy = py - dy * k, d = Math.hypot(ox, oy);
      if (d > r) continue;
      // нормаль поверхности: смещение от оси; свет — сверху и от огня
      const nx = ox / r, ny = oy / r;
      const tx = FX - (x + 0.5), ty = FY - 4 - (y + 0.5), tl = Math.hypot(tx, ty) || 1;
      const sky = -ny * 0.55 - nx * 0.25, fire = (nx * tx + ny * ty) / tl;
      const li = lightAt(x + 0.5, y + 0.5, R, t);
      const lum = 0.45 + sky * 0.35 + fire * 0.45 * li;
      const ch = chA + (chB - chA) * k;
      const rp = hash01(x, y, 91) < ch ? CHAR : WOOD;
      let i = Math.max(0, Math.min(3, Math.floor(lum * 4)));
      if (rp === WOOD && hash01(x * 3, y, 17) < 0.14) i = Math.max(0, i - 1);
      let c = rp[i];
      // тлеющие трещины на обугленном конце
      if (rp === CHAR && ch > 0.7 && hash01(x, y, 23) < 0.22 * li + 0.04) c = 0.5 + 0.5 * S(t, 1, hash01(x, y, 7)) > 0.45 ? F_OR : F_RED;
      else if (fire > 0.2 && li > 0.35) c = mix(c, F_YO, li > 0.65 ? 0.32 : 0.16);
      pc.set(x, y, c);
    }
  if (cap === "char") { // обугленный торец: тлеющее кольцо, тёмная середина
    pc.ellipse(bx, by, r * 0.8, r * 0.95, 0.5 + 0.5 * S(t, 1, bx * 0.1) > 0.4 ? F_OR : F_RED);
    pc.ellipse(bx, by, r * 0.45, r * 0.55, CHAR[1]);
  } else if (cap) { // торец: светлый срез с кольцом
    pc.ellipse(bx, by, r * 0.72, r * 0.88, WOOD[3]);
    pc.set(Math.round(bx - 0.5), Math.round(by - 0.5), WOOD[2]);
  }
}
/** Камень очага: освещён с огня, сверху светлее. */
function stone(pc: PC, cx: number, cy: number, rx: number, ry: number, t: number, R: number) {
  const dx = FX - cx, dy = FY - 3 - cy, l = Math.hypot(dx, dy) || 1;
  const b = new PC(pc.w, pc.h);
  b.shadedEllipse(cx, cy, rx, ry, STONE, [dx / l * 0.8, Math.min(-0.3, dy / l * 0.8)], false);
  const li = lightAt(cx, cy, R, t);
  b.map((c) => (li > 0.2 ? mix(c, F_YO, li > 0.55 ? 0.28 : 0.14) : c));
  b.outline(OUTLINE);
  pc.blit(b, 0, 0);
}
/** Тень предмета от огня: полупрозрачный эллипс, сдвинутый от огня. */
function shadowFrom(pc: PC, cx: number, cy: number, rx: number, ry: number, k = 2.2) {
  const dx = cx - FX, dy = cy - FY, l = Math.hypot(dx, dy) || 1;
  pc.ellipse(cx + (dx / l) * k, cy + (dy / l) * k * 0.5 + 1, rx, ry, [12, 6, 10, 80]);
}
/** Угли: тёмная россыпь, трещины тлеют своей фазой; центр жарче (светлое ядро внизу пламени). */
function coals(pc: PC, cx: number, cy: number, rx: number, ry: number, t: number, hot = 1) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d > 1 || (d > 0.7 && hash01(x, y, 3) < 0.45)) continue;
    const h = hash01(x, y, 11), g = 0.5 + 0.5 * S(t, h < 0.5 ? 1 : 2, h);
    const v = (1 - d) * hot * (0.6 + 0.5 * g) + (h - 0.5) * 0.4;
    pc.set(x, y, v > 0.95 ? F_Y : v > 0.75 ? F_YO : v > 0.55 ? F_OR : v > 0.38 ? F_RED : h < 0.55 ? CHAR[0] : CHAR[2]);
  }
}
/** Гарь и пепел под огнём: неровное пятно, к краю — пепел; сочетается с выжженной травой. */
function scorch(pc: PC, cx: number, cy: number, rx: number, ry: number) {
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    const n = pnoise(x, y, 4, 64, 17);
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) + (n - 0.5) * 0.45;
    if (d > 1) continue;
    const c = d < 0.55 ? CHAR[1] : hash01(x, y, 4) < 0.3 ? ASHR[3] : ASHR[1];
    pc.set(x, y, [c[0], c[1], c[2], d > 0.85 ? 120 : 200]);
  }
}
/** Тёплое пятно света на земле (и днём): ступенчатый градиент прозрачности, дышит. */
function groundLight(pc: PC, R: number, t: number) {
  const k = 0.94 + 0.06 * S(t, 2, 0.2) * S(t, 3, 0.6);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const d = Math.hypot((x + 0.5 - FX) / (R * k), (y + 0.5 - FY) / (R * k * 0.42));
    if (d >= 1) continue;
    const a = d < 0.35 ? 78 : d < 0.6 ? 52 : d < 0.82 ? 30 : 14;
    pc.set(x, y, [GLOW[0], GLOW[1], GLOW[2], a]);
  }
}
function sparks(pc: PC, n: number, cx: number, top: number, spread: number, rise: number, t: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const ph = hash01(i, seed, 77), f = hash01(i, seed, 81) < 0.5 ? 1 : 2, p = (t * f + ph) % 1;
    if (p > 0.9) continue;
    const x = Math.round(cx + (hash01(i, seed, 78) - 0.5) * spread + S(p, 1, ph) * 2.5 + (hash01(i, seed, 79) - 0.5) * p * 10), y = Math.round(top - p * rise);
    pc.set(x, y, p < 0.25 ? F_W : p < 0.5 ? F_Y : p < 0.75 ? F_YO : F_OR);
    if (p < 0.3) pc.set(x, y + 1, [GLOW[0], GLOW[1], GLOW[2], 120]);
  }
}

// ---------- типы ----------
const ring = (cx: number, cy: number, rx: number, ry: number, n: number) => Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU + 0.2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, a] as const; });
const DEFS: Def[] = [
  {
    // малый огонь на земле: тлеющие обломки, два-три низких языка
    id: "fire-ground", w: 40, h: 56, fire: [20, 48], sparks: 4, light: 19,
    tongues: [{ bx: 19, by: 49, w: 10, h: 22, ph: 0.1, drops: 1 }, { bx: 25, by: 49, w: 7, h: 15, ph: 0.55, f: 2 }, { bx: 14, by: 49, w: 6, h: 11, ph: 0.8, drops: 1 }],
    ground: (pc) => scorch(pc, 20, 49, 14, 5),
    back: (pc, t) => { shadowFrom(pc, 30, 48, 4, 1.4); log(pc, 33, 46, 23, 48, 1.6, 0.4, 1, t, 19, "char"); coals(pc, 20, 49, 8, 2.5, t); },
    front: (pc, t) => { shadowFrom(pc, 11, 51, 4, 1.4); log(pc, 6, 52, 17, 50, 1.7, 0.3, 1, t, 19, "char"); log(pc, 24, 53, 31, 52, 1.2, 0.6, 0.2, t, 19, false); pc.set(27, 52, CHAR[1]); },
  },
  {
    // костёр: кольцо камней, четыре полена звездой (задние — за языками, передние — перед ними)
    id: "fire-camp", w: 52, h: 76, fire: [26, 64], sparks: 6, light: 26, smoke: [26, 40],
    tongues: [{ bx: 26, by: 63, w: 8, h: 28, ph: 0.0, drops: 2 }, { bx: 22, by: 63, w: 6, h: 19, ph: 0.37, f: 2 }, { bx: 30, by: 63, w: 6, h: 21, ph: 0.71, drops: 1 },
      { bx: 19, by: 64, w: 4, h: 10, ph: 0.2 }, { bx: 33, by: 64, w: 4, h: 11, ph: 0.9, f: 2 }],
    ground: (pc) => scorch(pc, 26, 65, 20, 7.5),
    back: (pc, t) => {
      for (const [x, y] of ring(26, 65, 17, 6.5, 11)) if (y <= 65) { shadowFrom(pc, x, y, 3.5, 1.5); stone(pc, x, y, 3.4 + hash01(Math.round(x), 1, 1), 2.5, t, 26); }
      log(pc, 42, 59, 30, 63, 2.1, 0.2, 1, t, 26, "char");
      log(pc, 10, 59, 22, 63, 2.1, 0.2, 1, t, 26, "char");
      coals(pc, 26, 65, 9, 3, t, 1.1);
    },
    front: (pc, t) => {
      shadowFrom(pc, 16, 69, 5, 1.6); shadowFrom(pc, 36, 69, 5, 1.6);
      // крест-накрест: концы выступают за кольцо, обугленные торцы над углями
      log(pc, 9, 72, 33, 62, 2.3, 0.05, 1, t, 26, "char");
      log(pc, 43, 72, 19, 62, 2.3, 0.05, 1, t, 26, "char");
      log(pc, 26, 75, 26, 66, 2.0, 0.1, 0.9, t, 26, false);
      for (const [x, y] of ring(26, 65, 17, 6.5, 11)) if (y > 65) { shadowFrom(pc, x, y, 3.5, 1.5); stone(pc, x, y, 3.4 + hash01(Math.round(x), 1, 1), 2.5, t, 26); }
    },
  },
  {
    // горящая куча: доски и колесо повозки, три очага языков разной высоты
    id: "fire-pile", w: 68, h: 84, fire: [34, 70], sparks: 9, light: 34, smoke: [36, 34],
    tongues: [{ bx: 16, by: 71, w: 9, h: 25, ph: 0.15, drops: 1 }, { bx: 12, by: 72, w: 5, h: 13, ph: 0.6, f: 2 },
      { bx: 31, by: 69, w: 11, h: 36, ph: 0.5, drops: 2 }, { bx: 36, by: 70, w: 6, h: 20, ph: 0.82, f: 2 },
      { bx: 46, by: 72, w: 7, h: 17, ph: 0.33, f: 2, drops: 1 }],
    ground: (pc) => scorch(pc, 34, 72, 26, 8.5),
    back: (pc, t) => {
      // колесо, прислонённое сзади справа
      const wx = 53, wy = 61, wb = new PC(pc.w, pc.h);
      for (let a = 0; a < TAU; a += 0.02) { const x = wx + Math.cos(a) * 10, y = wy + Math.sin(a) * 10; const li = lightAt(x, y, 34, t); const top = Math.sin(a) < 0; wb.ellipse(x, y, 1.6, 1.6, li > 0.45 && Math.cos(a) < 0.2 ? (top ? WOOD[3] : WOOD[2]) : top ? WOOD[2] : WOOD[1]); }
      for (let a = 0; a < TAU; a += 0.02) wb.set(Math.round(wx + Math.cos(a) * 9.6), Math.round(wy + Math.sin(a) * 9.6 - 0.4), IRON[2]); // обод-шина
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.2; wb.line(wx + Math.cos(a) * 2, wy + Math.sin(a) * 2, wx + Math.cos(a) * 8.5, wy + Math.sin(a) * 8.5, Math.cos(a) < 0 ? WOOD[2] : WOOD[1]); }
      wb.ellipse(wx, wy, 2.4, 2.4, WOOD[1]); wb.ellipse(wx - 0.5, wy - 0.5, 1.2, 1.2, IRON[3]);
      wb.outline(OUTLINE); pc.blit(wb, 0, 0);
      const bb = new PC(pc.w, pc.h);
      log(bb, 4, 66, 26, 59, 2.0, 0, 0.9, t, 34, "char");
      log(bb, 62, 72, 38, 62, 2.0, 0, 0.9, t, 34, "char");
      log(bb, 22, 60, 40, 66, 1.7, 0.2, 1, t, 34, false);
      bb.outline(OUTLINE); pc.blit(bb, 0, 0);
      coals(pc, 16, 71.5, 6, 2.2, t, 1.1); coals(pc, 31, 70.5, 8, 2.8, t, 1.15); coals(pc, 46, 72.5, 4.5, 1.8, t, 1);
    },
    front: (pc, t) => {
      shadowFrom(pc, 22, 76, 7, 1.8); shadowFrom(pc, 48, 76, 7, 1.8);
      const fb = new PC(pc.w, pc.h);
      log(fb, 6, 78, 30, 71, 2.2, 0, 0.95, t, 34, "char");
      log(fb, 62, 79, 40, 72, 2.0, 0, 0.9, t, 34);
      log(fb, 22, 81, 48, 79, 1.6, 0.1, 0.3, t, 34, false);
      fb.outline(OUTLINE); pc.blit(fb, 0, 0);
      pc.rect(16, 79, 4, 1, CHAR[1]); pc.rect(50, 74, 3, 1, CHAR[0]);
    },
  },
  {
    // жаровня: треножник, чаша; передний обод чаши — перед языками
    id: "fire-brazier", w: 36, h: 66, fire: [18, 39], sparks: 4, light: 16,
    tongues: [{ bx: 18, by: 36, w: 6, h: 22, ph: 0.25, drops: 1 }, { bx: 15, by: 36, w: 4, h: 11, ph: 0.6, f: 2 }, { bx: 21, by: 36, w: 4, h: 13, ph: 0.9 }],
    ground: (pc) => { pc.ellipse(18, 62, 10, 2.5, [12, 6, 10, 90]); },
    back: (pc, t) => {
      const b = new PC(pc.w, pc.h);
      b.line(13, 46, 8, 62, IRON[1], 2); b.line(23, 46, 28, 62, IRON[1], 2); b.line(18, 47, 18, 63, IRON[2], 2); b.line(11, 55, 25, 55, IRON[1]);
      b.ellipse(18, 39.5, 11, 3, IRON[1]); // задний обод
      b.outline(OUTLINE); pc.blit(b, 0, 0);
      coals(pc, 18, 39, 9.5, 2.6, t, 0.95);
    },
    front: (pc, t) => {
      const b = new PC(pc.w, pc.h);
      for (let y = 41; y <= 48; y++) for (let x = 6; x <= 30; x++) {
        const dx = (x + 0.5 - 18) / 12, dy = (y + 0.5 - 40.5) / 8;
        if (dx * dx + dy * dy > 1) continue;
        const l = 0.75 - dx * 0.25 - dy * 0.55;
        b.set(x, y, IRON[Math.max(0, Math.min(3, Math.floor(l * 4)))]);
      }
      for (let x = 7; x <= 29; x++) { const dx = (x + 0.5 - 18) / 11.5; const y = Math.round(40.6 + Math.sqrt(Math.max(0, 1 - dx * dx)) * 1.6); b.set(x, y, mix(IRON[3], F_YO, 0.3)); b.set(x, y - 1, IRON[3]); }
      for (const x of [10, 18, 26]) b.set(x, 44, IRON[3]);
      // тлеющий отсвет на чаше: верхние ряды теплеют и дышат
      const gl = 0.5 + 0.5 * S(t, 2, 0.3);
      b.map((c, x, y) => (y >= 41 && y <= 44 && c[3] > 200 ? mix(c, F_OR, (y <= 42 ? 0.28 : 0.14) * (0.7 + 0.3 * gl) * (1 - Math.abs(x + 0.5 - 18) / 13)) : c));
      b.outline(OUTLINE); pc.blit(b, 0, 0);
      // угли горкой над ободом — перед основанием языков
      const cb = new PC(pc.w, pc.h); coals(cb, 18, 39.2, 9.5, 1.9, t, 1.05);
      for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) { const c = cb.get(x, y)!; if (c[3] && y >= 39) pc.set(x, y, c); }
    },
  },
];

function frameOf(d: Def, t: number): PC {
  [FX, FY] = d.fire;
  const pc = new PC(d.w, d.h);
  d.ground(pc, t);
  // основание (без огня): по нему — пятно тени 60 % ширины и контактная AO (docs/art-perspective.md §4: 2 ряда ≈150/65, шире на 1 px)
  const m = new PC(d.w, d.h); d.back(m, t); d.front(m, t);
  const low = new Int16Array(d.w).fill(-1);
  for (let x = 0; x < d.w; x++) for (let y = d.h - 1; y >= 0; y--) { const c = m.get(x, y)!; if (c[3] > 200) { low[x] = y; break; } }
  const xs = [...low.keys()].filter((x) => low[x] >= 0), maxLow = Math.max(...xs.map((x) => low[x]));
  const feet = xs.filter((x) => low[x] >= maxLow - 6);
  if (feet.length) {
    const x0 = Math.min(...feet), x1 = Math.max(...feet), cx = (x0 + x1 + 1) / 2;
    pc.ellipse(cx, maxLow - 1, (x1 - x0 + 1) * 0.3 + 2, 2.6, [14, 8, 12, 70]);
  }
  groundLight(pc, d.light, t);
  for (const x of xs) for (const dx of [-1, 0, 1]) {
    const y = low[x];
    if (y < maxLow - 9) continue; // только то, что стоит на земле (не поленья в воздухе над углями)
    for (const [dy, a] of [[1, 150], [2, 65]] as const) if (!m.alpha(x + dx, y + dy)) { const k = ((y + dy) * d.w + x + dx) * 4; if (x + dx >= 0 && x + dx < d.w && y + dy < d.h && pc.data[k + 3] < 255) pc.set(x + dx, y + dy, [14, 8, 12, a]); else pc.set(x + dx, y + dy, [14, 8, 12, Math.round(a * 0.8)]); }
  }
  d.back(pc, t);
  pc.blit(flameLayer(d.w, d.h, d.tongues, t).L, 0, 0);
  d.front(pc, t);
  const top = Math.min(...d.tongues.map((T) => T.by - T.h * 0.8));
  sparks(pc, d.sparks, FX, top, d.tongues.reduce((s, T) => Math.max(s, Math.abs(T.bx - FX) * 2 + T.w), 0) * 0.6, top - 2, t, d.tongues[0].ph * 100 + 3);
  return pc;
}

/** Дым: клубы рождаются тёмными и плотными, растут, светлеют и рассеиваются (дизеринг прозрачности), ветер сносит вправо. */
function smokeFrame(t: number, w = 40, h = 80): PC {
  const pc = new PC(w, h);
  const puffs = 7;
  for (let i = puffs - 1; i >= 0; i--) {
    const ph = i / puffs, p = (t + ph) % 1;
    const cx = w * 0.4 + S(p, 1, ph * 1.3) * 2 + p * p * 12, cy = h - 5 - p * (h - 18), r = 2.6 + p * 9;
    const dens = Math.min(1, p * 9) * Math.pow(1 - p, 0.9);
    if (dens < 0.04) continue;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const n = pnoise(x, y + t * 40, 4, 40, 9 + i);
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / (r * 0.85), d = Math.sqrt(dx * dx + dy * dy) + (n - 0.5) * 0.5;
      if (d > 1) continue;
      const a = Math.min(225, dens * (1 - d * 0.5) * 260);
      // рассеивание: с ростом клуба часть пикселей выпадает (узор Байера)
      const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y & 3][x & 3] / 16;
      if (bayer < p * 0.75 * d) continue;
      const lit = -dx * 0.45 - dy * 0.75;
      const c = p < 0.25 ? (lit > 0.2 ? ASHR[3] : ASHR[2]) : lit > 0.35 ? hex("#a8a09a") : lit > -0.15 ? hex("#86807c") : ASHR[4];
      const k = (y * w + x) * 4;
      if (pc.data[k + 3] >= a) continue;
      pc.data[k] = c[0]; pc.data[k + 1] = c[1]; pc.data[k + 2] = c[2]; pc.data[k + 3] = Math.round(a);
    }
  }
  return pc;
}

// ---------- сборка ----------
const sheets: Record<string, PC[]> = {};
for (const d of DEFS) sheets[d.id] = Array.from({ length: N }, (_, i) => frameOf(d, i / N));
sheets["fire-smoke"] = Array.from({ length: N }, (_, i) => smokeFrame(i / N));
const row = (fr: PC[]) => { const r = new PC(fr[0].w * fr.length, fr[0].h); fr.forEach((f, i) => r.blit(f, i * f.w, 0)); return r; };
fs.mkdirSync(OUT, { recursive: true });
for (const [id, fr] of Object.entries(sheets)) writePng(row(fr), path.join(OUT, `${id}.png`));
if (process.argv.includes("--game")) {
  const MF = path.join(ASSETS, "vfx/manifest.json");
  const m = JSON.parse(fs.readFileSync(MF, "utf8")) as Record<string, unknown>;
  for (const [id, fr] of Object.entries(sheets)) {
    writePng(row(fr), path.join(ASSETS, "vfx", `${id}.png`));
    m[id] = { frameW: fr[0].w, frameH: fr[0].h, frames: N, fps: FPS, anchor: [0.5, 1], blend: "normal" };
  }
  fs.writeFileSync(MF, JSON.stringify(Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1))), null, 1) + "\n");
  console.log("[fire] листы записаны в client/public/assets/vfx и manifest.json");
}

// ---------- эталоны ----------
const V = (p: string) => path.join(ROOT, "vendor", p);
const refs: { id: string; frames: PC[] }[] = [];
const tryRef = (id: string, f: () => PC[]) => { try { const fr = f().map((x) => trim(x).pc); if (fr.length) refs.push({ id, frames: fr }); } catch (e) { console.log(`[fire] эталон ${id} пропущен: ${(e as Error).message}`); } };
tryRef("zabin oga", () => { const s = readPng(V("fire-oga-zabin/CampFireFinished.png")); return Array.from({ length: s.w / 64 }, (_, i) => crop(s, i * 64, 0, 64, 64)); });
tryRef("maggew itch", () => readGif(V("fire-maggew/campfire-v1.gif")));
tryRef("devkidd 3", () => { const d = V("devkidd-fire3/src/Pixel Fire Asset Pack v3.2/Pixel Fire Asset Pack  v3.2 Floored/Pixel Fire Asset Pack v3.2 Floored Red/Group 4 - 3"); return Array.from({ length: 16 }, (_, i) => readPng(path.join(d, `Group 4 - 3_${i + 1}.png`))); });

// ---------- монтаж ----------
type Spr = { img: PC; ax: number; ay: number };
interface Light { x: number; y: number; color: number; scale: number; alpha: number }
interface Item { s: Spr; x: number; y: number; light?: [number, number, number, number]; smoke?: [number, number, number] }
const LIGHT: Record<string, [number, number, number, number]> = {
  "fire-ground": [-12, 0xff8a2a, 2.2, 0.55], "fire-camp": [-16, 0xff9a3a, 2.8, 0.6], "fire-pile": [-22, 0xff8a2a, 3.2, 0.6], "fire-brazier": [-32, 0xff9a3a, 2.4, 0.6], ref: [-14, 0xff8a2a, 2.6, 0.6],
};
const glowTex = readPng(path.join(ASSETS, "fx/glow.png"));
const gv = (x: number, y: number) => { const c = glowTex.get(Math.max(0, Math.min(glowTex.w - 1, x)), Math.max(0, Math.min(glowTex.h - 1, y)))!; return (c[3] / 255) * (Math.max(c[0], c[1], c[2]) / 255); };
const sample = (u: number, v: number) => { const fx = u * glowTex.w - 0.5, fy = v * glowTex.h - 0.5, x = Math.floor(fx), y = Math.floor(fy), a = fx - x, b = fy - y; return (gv(x, y) * (1 - a) + gv(x + 1, y) * a) * (1 - b) + (gv(x, y + 1) * (1 - a) + gv(x + 1, y + 1) * a) * b; };
/** Ночь как в игре: мир приглушён, маска #140d16 0,34 с вырезами у огней (lights.ts), сверху аддитивные ореолы fx_glow; огонь светится сам. */
function night(src: PC, emit: Uint8Array, lights: Light[], t: number): PC {
  const o = src.clone();
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const i = (y * o.w + x) * 4;
    let cut = 0; const add = [0, 0, 0];
    for (const L of lights) {
      const f = 1 + 0.16 * (Math.sin(TAU * t * 2 + L.x) * 0.6 + Math.sin(TAU * t * 5 + L.y) * 0.4);
      const a = Math.min(0.95, L.alpha * 1.6) * f, s = L.scale * 1.35 * (0.97 + 0.06 * f), rad = (L.scale * 32 * 2.3) / 2;
      const dc = Math.hypot(x - L.x, y - L.y) / rad;
      if (dc < 1) cut = Math.max(cut, Math.min(1, a * 1.6) * (1 - dc * dc));
      const half = 16 * s, u = (x - L.x) / (2 * half) + 0.5, v = (y - L.y) / (2 * half) + 0.5;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) { const g = sample(u, v) * a; add[0] += ((L.color >> 16) & 255) * g; add[1] += ((L.color >> 8) & 255) * g; add[2] += (L.color & 255) * g; }
    }
    if (emit[y * o.w + x]) continue;
    const m = 0.34 * (1 - cut);
    for (let k = 0; k < 3; k++) { let c = o.data[i + k] * 0.6 + [4, 2, 8][k]; c = c * (1 - m) + [0x14, 0x0d, 0x16][k] * m; o.data[i + k] = Math.min(255, c + add[k] * 0.55); }
  }
  return o;
}
const isFirePx = (c: RGBA) => c[3] > 200 && c[0] > 160 && c[0] > c[2] + 90 && c[1] > 40;
function scene(w: number, h: number, items: Item[], isNight: boolean, t: number, ground = "dirt"): PC {
  const pc = new PC(w, h); paintGround(pc, 0, 0, w, h, ground);
  const emit = new Uint8Array(w * h), lights: Light[] = [];
  for (const it of [...items].sort((a, b) => a.y - b.y)) {
    const im = it.s.img, x0 = Math.round(it.x - im.w * it.s.ax), y0 = Math.round(it.y - im.h * it.s.ay);
    pc.blit(im, x0, y0);
    for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const c = im.get(x, y)!; if (isFirePx(c) && pc.inside(x0 + x, y0 + y)) emit[(y0 + y) * w + x0 + x] = 1; }
    if (it.smoke) { const sm = sheets["fire-smoke"][it.smoke[2] % N]; pc.blit(sm, Math.round(x0 + it.smoke[0] - sm.w * 0.42), Math.round(y0 + it.smoke[1] - sm.h + 4)); }
    if (it.light) lights.push({ x: it.x, y: it.y + it.light[0], color: it.light[1], scale: it.light[2], alpha: it.light[3] });
  }
  return isNight ? night(pc, emit, lights, t) : pc;
}
const ours = (id: string, i: number): Spr => ({ img: sheets[id][((i % N) + N) % N], ax: 0.5, ay: 1 });
const smokeOf = (id: string, i: number): [number, number, number] | undefined => { const d = DEFS.find((q) => q.id === id); return d?.smoke ? [d.smoke[0], d.smoke[1], i] : undefined; };
const it = (id: string, x: number, y: number, i: number): Item => ({ s: ours(id, i), x, y, light: LIGHT[id], smoke: smokeOf(id, i) });
const refIt = (r: { frames: PC[] }, x: number, y: number, i: number): Item => ({ s: { img: r.frames[i % r.frames.length], ax: 0.5, ay: 1 }, x, y, light: LIGHT.ref });

const titled = (labels: string[], parts: PC[], k: number) => {
  const sc = parts.map((p) => scaleNN(p, k)), GAP = 6;
  const o = new PC(sc.reduce((s, p) => s + p.w + GAP, GAP), Math.max(...sc.map((p) => p.h)) + 14 + GAP);
  fill(o, BG);
  let x = GAP; sc.forEach((p, i) => { o.blit(p, x, 12); chipText(o, labels[i], x, 2); x += p.w + GAP; });
  return o;
};
const blocks: PC[] = [];
const FI = 3;
for (const nt of [false, true]) {
  const a = scene(220, 92, [it("fire-ground", 24, 84, FI), it("fire-camp", 72, 86, FI + 5), it("fire-pile", 136, 88, FI + 9), it("fire-brazier", 196, 86, FI + 2)], nt, FI / N);
  const b = scene(170, 92, refs.map((r, i) => refIt(r, 30 + i * 56, 84, FI)), nt, FI / N);
  blocks.push(titled([`${nt ? "NIGHT" : "DAY"} X4 - OURS`, `REF: ${refs.map((r) => r.id).join(" / ").toUpperCase()}`], [a, b], 4));
}
const field = (nt: boolean, i: number) => {
  const objs: Item[] = [{ s: { img: readPng(path.join(ASSETS, "objects/bf_wagon_broken_a.png")), ax: 0.5, ay: 1 }, x: 170, y: 74 }, { s: { img: readPng(path.join(ASSETS, "objects/bf_tent_burnt.png")), ax: 0.5, ay: 1 }, x: 56, y: 70 }];
  objs.push(it("fire-pile", 140, 104, i), it("fire-ground", 40, 132, i + 5), it("fire-ground", 196, 146, i + 11), it("fire-camp", 96, 168, i + 7), it("fire-brazier", 230, 100, i + 3));
  return scene(250, 180, objs, nt, i / N);
};
blocks.push(titled(["DAY SCENE X2", "NIGHT SCENE X2"], [field(false, FI), field(true, FI)], 2));
const W = Math.max(...blocks.map((b) => b.w)), H = blocks.reduce((s, b) => s + b.h, 0);
const cmp = new PC(W, H); fill(cmp, BG);
let yy = 0; for (const b of blocks) { cmp.blit(b, 0, yy); yy += b.h; }
writePng(cmp, path.join(OUT, "compare2.png"));

// все кадры ×3
const fr = Object.entries(sheets);
const fw = Math.max(...fr.map(([, f]) => f[0].w)), rowsH = fr.map(([, f]) => f[0].h + 10);
const st = new PC(8 + N * (fw + 2), rowsH.reduce((s, h) => s + h, 0)); paintGround(st, 0, 0, st.w, st.h, "dirt");
let y0 = 0;
fr.forEach(([id, f], r) => { chipText(st, `${id} ${N}F ${FPS}FPS ${f[0].w}X${f[0].h}`.toUpperCase(), 2, y0 + 1); f.forEach((g, i) => st.blit(g, 4 + i * (fw + 2) + Math.floor((fw - g.w) / 2), y0 + 9)); y0 += rowsH[r]; });
writePng(scaleNN(st, 3), path.join(OUT, "frames2.png"));
console.log(`[fire] tools/out/fire: compare2.png, frames2.png; эталонов ${refs.length}`);
