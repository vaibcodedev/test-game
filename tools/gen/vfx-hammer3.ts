/** Молот правосудия — три варианта на выбор (задача 127, замена hammer-gold/hammer-slam).
 *  v1: призрачный молот света падает сверху на цель, удар со звездой света, печать на земле (hammer-v1-hit).
 *  v2: брошенный молот летит дугой и вращается с огненно-золотым следом (hammer-v2), удар — осколки света и оглушающие звёзды над целью (hammer-v2-hit).
 *  v3: столб света в форме молота с неба и печать-молот на земле (hammer-v3-hit).
 *  Запуск отдельно: tsx tools/gen/vfx-hammer3.ts → tools/out/vfx-preview/hammer3.png. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, rng, hex, type RGBA } from "./canvas";
import { RAMPS, storyboard, stackV, scaleNN } from "./vfx-lib";
import type { Gen } from "./vfx-gen";

const TAU = Math.PI * 2, G = RAMPS.holy, put = (f: PC, x: number, y: number, c: RGBA) => f.set(Math.round(x), Math.round(y), c);
const OUT = hex("#3a2208"), WOOD = [hex("#3a2216"), hex("#6a4228"), hex("#94613a")];

/** Боевой молот 24×28: гранёная золотая голова с бликом и камнем, кожаная обмотка, рукоять, тёмный контур. */
function hammerSprite(): PC {
  const f = new PC(24, 28);
  for (let y = 12; y <= 25; y++) { put(f, 11, y, WOOD[1]); put(f, 12, y, WOOD[2]); put(f, 13, y, WOOD[0]); }
  for (const y of [15, 17, 19]) for (const x of [11, 12, 13]) put(f, x, y, WOOD[0]);          // обмотка
  for (let x = 10; x <= 14; x++) put(f, x, 26, G[2]);                                          // навершие
  for (let y = 3; y <= 11; y++) for (let x = 3; x <= 20; x++) {
    const e = x - 3 < 2 || 20 - x < 2;
    put(f, x, y, y === 3 ? G[4] : y <= 5 ? (e ? G[2] : G[3]) : y <= 8 ? (e ? G[1] : G[2]) : y <= 10 ? G[1] : G[0]);
  }
  for (let x = 5; x <= 18; x++) put(f, x, 4, G[5]);                                            // блик на верхней грани
  put(f, 4, 5, G[4]); put(f, 4, 6, G[4]);
  for (const x of [11, 12]) for (const y of [6, 7, 8]) put(f, x, y, y === 6 ? G[5] : G[4]);    // камень света
  for (const x of [7, 16]) for (let y = 5; y <= 10; y++) put(f, x, y, G[0]);                    // швы головы
  f.outline(OUT);
  return f;
}
/** Четырёхлучевая звезда света: ядро, длинные вертикаль/горизонталь, короткие диагонали. */
function star(f: PC, x: number, y: number, r: number, hi = G[5], mid = G[4], lo = G[2]) {
  put(f, x, y, hi);
  for (let i = 1; i <= r; i++) { const c = i <= r * 0.4 ? hi : i <= r * 0.75 ? mid : lo; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(f, x + dx * i, y + dy * i * 0.9, c); }
  for (let i = 1; i <= Math.max(1, Math.floor(r / 3)); i++) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(f, x + dx * i, y + dy * i, mid);
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (r >= 5) put(f, x + dx, y + dy, hi);
}
/** Печать на земле: два кольца-эллипса, зубцы, золотой глиф-молот в центре. */
function seal(f: PC, cx: number, cy: number, r: number, a: number, rot: number) {
  if (a <= 0) return;
  const c1 = a > 0.6 ? G[5] : G[4], c2 = a > 0.6 ? G[4] : G[3], c3 = G[2];
  const n = Math.round(r * 7);
  for (let s = 0; s < n; s++) {
    const t = (s / n) * TAU; if (a < 0.45 && s % 2) continue; if (a < 0.25 && s % 3) continue;
    put(f, cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.7, c1);
    put(f, cx + Math.cos(t) * (r - 3), cy + Math.sin(t) * (r - 3) * 0.7, c3);
  }
  for (let k = 0; k < 8; k++) { const t = (k / 8) * TAU + rot; for (let q = r - 6; q <= r - 2; q++) put(f, cx + Math.cos(t) * q, cy + Math.sin(t) * q * 0.7, c2); }
  // глиф: плоский молот (голова-прямоугольник и рукоять) в сплющенной проекции
  for (let x = -6; x <= 6; x++) for (let y = -2; y <= 0; y++) put(f, cx + x, cy + y, y === -2 ? c1 : c2);
  for (let y = 1; y <= 5; y++) put(f, cx, cy + y, c1);
}
function sparks(f: PC, t: number, cx: number, cy: number, n: number, seed: number, v: number, life: number) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.4, sp = v * (0.6 + r() * 0.8), up = 2 + r() * 4, q = t; if (q < 0 || q > life) continue; put(f, cx + Math.cos(a) * sp * q * 1.5, cy - up * q * 1.2 + 0.5 * q * q * 1.4 + Math.sin(a) * sp * q * 0.4, q < life * 0.5 ? G[5] : G[3]); }
}

/** v1: молот света падает сверху и бьёт; 18 кадров, точка удара (56, 90). */
function v1Hit(): Gen {
  const W = 112, H = 112, N = 18, cx = 56, cy = 92, SPR = scaleNN(hammerSprite(), 2);
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    seal(f, cx, cy, 36, t < 3 ? t / 3 : t < 12 ? 1 : Math.max(0, 1 - (t - 12) / 6), t * 0.12);
    // падение: t0..6 — ускоренно сверху, призрачный (прозрачный) молот с хвостом света
    if (t <= 7) {
      const q = Math.min(1, t / 6), y = -50 + q * q * (cy - 24 + 50), al = t < 2 ? 0.45 : 0.8 + 0.2 * q;
      for (let k = 1; k <= 5; k++) { const yy = y - k * 8; f.line(cx - 4, Math.round(yy), cx - 4, Math.round(yy - 8), G[3], 1); f.line(cx + 4, Math.round(yy), cx + 4, Math.round(yy - 8), G[3], 1); }
      f.blit(SPR, cx - 24, Math.round(y - 24), false, al);
    }
    // удар: вспышка, звезда света, волна
    if (t >= 6 && t <= 14) {
      const q = t - 6;
      if (q <= 5) star(f, cx, cy - 14, [26, 22, 18, 12, 8, 4][q]);
      const rr = 4 + q * 5.2, fade = Math.max(0, 1 - q / 9);
      for (let s = 0; s < Math.round(rr * 7); s++) { const a = (s / Math.round(rr * 7)) * TAU; if (fade < 0.45 && s % 2) continue; put(f, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, fade > 0.55 ? G[5] : G[3]); put(f, cx + Math.cos(a) * (rr - 1.5), cy + Math.sin(a) * (rr - 1.5) * 0.7, G[2]); }
      sparks(f, q, cx, cy - 10, 18, 31, 3, 9);
    }
    return f;
  });
  return { id: "hammer-v1-hit", pack: "gen", role: "hit", frames, w: W, h: H, anchor: [cx / W, cy / H], fps: 14, blend: "normal", hero: "warrior" };
}

/** v2: снаряд — крупный вращающийся молот с огненно-золотым хвостом (30×26 → летит вправо). */
function v2Proj(): Gen {
  const W = 56, H = 32, N = 8, cx = 40, cy = 16, base = hammerSprite(), r = rng(7);
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    // огненный хвост: суживающаяся полоса с языками, цвета от белого к тёмному золоту
    for (let k = 0; k < 30; k++) {
      const x = cx - 6 - k * 1.2, w = Math.max(0, 6 - k * 0.2) + Math.sin(k * 0.9 + t * 1.2) * 1.2;
      for (let dy = -Math.round(w); dy <= Math.round(w); dy++) { const e = Math.abs(dy) / (w + 0.01); put(f, x, cy + dy + Math.sin(k * 0.5 + t) * 1.2, k < 7 && e < 0.4 ? G[5] : k < 16 && e < 0.75 ? G[4] : k < 24 ? G[3] : G[1]); }
    }
    for (let i = 0; i < 6; i++) put(f, cx - 12 - ((i * 7 + t * 5) % 34), cy + (r() - 0.5) * 12, i % 2 ? G[5] : G[3]);
    f.blit(base.rotated((t / N) * TAU, 12, 14), cx - 12, cy - 14);
    return f;
  });
  return { id: "hammer-v2", pack: "gen", role: "proj", frames, w: W, h: H, anchor: [cx / W, cy / H], fps: 16, blend: "normal", hero: "warrior" };
}
/** v2: удар — взрыв осколков света и три оглушающие звезды, кружащие над целью. 16 кадров. */
function v2Hit(): Gen {
  const W = 96, H = 84, N = 16, cx = 48, cy = 56, r = rng(44);
  const shards = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * TAU + r() * 0.3, v: 3 + r() * 4, up: 3 + r() * 5, life: 8 + Math.floor(r() * 4), big: i % 3 === 0 }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    if (t <= 3) { const rr = [16, 13, 9, 5][t]; f.ellipse(cx, cy - 8, rr, rr * 0.9, G[4]); f.ellipse(cx, cy - 8, rr * 0.6, rr * 0.55, G[5]); }
    if (t >= 1 && t <= 9) { // кольцо удара
      const q = t - 1, rr = 5 + q * 4.6; for (let s = 0; s < Math.round(rr * 7); s++) { const a = (s / Math.round(rr * 7)) * TAU; if (q > 5 && s % 2) continue; put(f, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, q < 5 ? G[5] : G[3]); put(f, cx + Math.cos(a) * (rr - 1.4), cy + Math.sin(a) * (rr - 1.4) * 0.7, G[2]); }
    }
    for (const s of shards) { // осколки-ромбы с гравитацией
      const q = t - 1; if (q < 0 || q > s.life) continue; const x = cx + Math.cos(s.a) * s.v * q * 1.7, y = cy - 8 - s.up * q * 1.4 + 0.65 * q * q * 1.4 + Math.sin(s.a) * s.v * q * 0.4, c = q < s.life * 0.55 ? G[5] : G[3];
      put(f, x, y, c); put(f, x, y - 1, c); put(f, x, y + 1, G[2]); if (s.big && q < s.life * 0.7) { put(f, x - 1, y, G[4]); put(f, x + 1, y, G[4]); put(f, x, y - 2, c); }
    }
    if (t >= 3) { // оглушающие звезды: три на эллипсе над головой цели (y ≈ cy−34)
      const fade = t > 12 ? 1 - (t - 12) / 4 : 1, grow = Math.min(1, (t - 3) / 3);
      for (let k = 0; k < 3; k++) { const a = ((t - 3) / 12) * TAU * 1.5 + (k * TAU) / 3, x = cx + Math.cos(a) * 15, y = cy - 36 + Math.sin(a) * 5, sr = Math.round((3 + (Math.sin(a) > 0 ? 1 : 0)) * grow * (fade > 0.5 ? 1 : 0.6)); if (sr > 0 && fade > 0.2) star(f, x, y, Math.max(2, sr + 1), G[5], G[4], G[3]); }
    }
    return f;
  });
  return { id: "hammer-v2-hit", pack: "gen", role: "hit", frames, w: W, h: H, anchor: [cx / W, cy / H], fps: 14, blend: "normal", hero: "warrior" };
}

/** v3: столб света в форме молота (широкая голова вверху, узкая рукоять) бьёт с неба; на земле печать-молот. 18 кадров. */
function v3Hit(): Gen {
  const W = 96, H = 132, N = 18, cx = 48, cy = 112;
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), grow = t < 4 ? t / 4 : 1, fade = t > 11 ? Math.max(0, 1 - (t - 11) / 6) : 1;
    seal(f, cx, cy, 34, t < 3 ? t / 3 : fade, t * 0.1);
    if (t >= 2 && fade > 0) {
      // голова-«молот» лежит вверху столба: x ∈ [−26, 26], y от 6 до 34; рукоять — столб к земле
      const top = 34, bottom = cy - 2, head = 28, hw = Math.round(26 * Math.min(1, grow * 1.3)), sw = Math.round((6 + Math.sin(t * 1.3) * 1) * fade);
      for (let y = top; y <= bottom; y++) {
        const inHead = y < top + head, half = inHead ? hw : sw, reach = Math.min(1, (y - top + 8) / ((bottom - top) * (grow + 0.001)));
        if (grow < 1 && y > top + (bottom - top) * grow) continue;
        for (let x = -half; x <= half; x++) {
          const e = Math.abs(x) / (half + 0.01), v = inHead ? (y - top) / head : 0;
          let c = e > 0.85 ? G[2] : e > 0.55 ? G[3] : e > 0.25 ? G[4] : G[5];
          if (inHead && (y === top || y === top + head - 1)) c = G[1]; else if (inHead && v < 0.2) c = e > 0.85 ? G[3] : G[5];
          if (fade < 0.5 && ((x + y) & 1)) continue;
          void reach; put(f, cx + x, y, c);
        }
      }
      // боковые лучи от головы
      if (t >= 3 && t <= 9) for (let k = 0; k < 8; k++) { const y = top + 6 + k * 3, len = 6 + ((k * 5 + t) % 7); for (let q = 0; q < len; q++) { put(f, cx + hw + 2 + q, y, G[3]); put(f, cx - hw - 2 - q, y, G[3]); } }
      // удар в основании: вспышка и волна
      if (t >= 4 && t <= 12) { const q = t - 4, rr = 4 + q * 4.6, fd = Math.max(0, 1 - q / 8); for (let s = 0; s < Math.round(rr * 7); s++) { const a = (s / Math.round(rr * 7)) * TAU; if (fd < 0.5 && s % 2) continue; put(f, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, fd > 0.55 ? G[5] : G[3]); } if (q <= 3) f.ellipse(cx, cy - 2, 12 - q * 2, 7 - q, G[5]); }
      // искры вверх
      const r = rng(5); for (let i = 0; i < 14; i++) { const x = cx + (r() - 0.5) * 50, ph = (r() * 12 + t * 2.2) % 12; if (t > 5 && t < 15) put(f, x, cy - ph * 5, ph < 6 ? G[5] : G[3]); }
    }
    return f;
  });
  return { id: "hammer-v3-hit", pack: "gen", role: "hit", frames, w: W, h: H, anchor: [cx / W, cy / H], fps: 14, blend: "normal", hero: "warrior" };
}

export function GENERATED_HAMMER3(): Gen[] { return [v1Hit(), v2Proj(), v2Hit(), v3Hit()]; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/hammer3.png");
  stackV(GENERATED_HAMMER3().map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f`, 2))).save(out);
  console.log(out);
}
