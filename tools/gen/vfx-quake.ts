/** Сотрясение земли (quake, храмовник, задача 127, переделка): удар кулаком о землю.
 *  Белая вспышка у ног → толстая волна пыли катится кольцом наружу (клубы, эллипс 0.7) до радиуса умения (130) → вслед за волной из земли выстреливают каменные шипы
 *  кольцами (задержка по радиусу), с них летят глыбы → в центре воронка с короткими толстыми трещинами и золотым жаром, всё оседает. Золотые искры света (храмовник Сольгарда).
 *  Шипы — Foozle «Pixel Magic Effects» (Earth_Spike, CC0), перекрашены в землистую рампу; без vendor/ рисуются свои каменные осколки. Пыль, воронка, глыбы, вспышка — генератор.
 *  16 кадров, один проход, 268×204, центр кольца — под ногами кастера (anchor по центру кольца). Запуск отдельно: tsx tools/gen/vfx-quake.ts → tools/out/vfx-preview/quake.png. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, rng, hex, type RGBA, type Ramp } from "./canvas";
import { RAMPS, loadDir, gradientMap, storyboard, trimBlank } from "./vfx-lib";
import type { Gen } from "./vfx-gen";

const TAU = Math.PI * 2, G = RAMPS.holy, put = (f: PC, x: number, y: number, c: RGBA) => f.set(Math.round(x), Math.round(y), c);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EARTH: Ramp = ["#2e2218", "#5e4632", "#8e7050", "#c0a070", "#f0dcac"].map((c) => hex(c));
const OUTL = hex("#1e140c");

/** Каменные шипы: Foozle Earth_Spike (9 кадров, основание по центру внизу) или, без vendor/, свои осколки из трёх тонов с контуром. */
function spikeFrames(): { frames: PC[]; w: number; h: number; gx: number; gy: number } {
  const dir = path.join(ROOT, "vendor/vfx-foozle-magic/src/Foozle_2DE0001_Pixel_Magic_Effects/Earth_Spike");
  if (fs.existsSync(dir)) { const fr = gradientMap(trimBlank(loadDir(dir), false), EARTH, 1); return { frames: fr, w: 64, h: 64, gx: 32, gy: 61 }; }
  const frames = Array.from({ length: 9 }, (_, t) => {
    const f = new PC(64, 64), k = t < 4 ? (t + 1) / 4 : Math.max(0, 1 - (t - 4) / 5);
    for (const [dx, h, w] of [[-14, 22, 9], [0, 36, 12], [13, 26, 10]] as const) {
      const hh = h * k; if (hh < 2) continue;
      f.poly([[32 + dx - w / 2, 61], [32 + dx + w / 2, 61], [32 + dx + w * 0.2, 61 - hh * 0.7], [32 + dx, 61 - hh]], EARTH[2]);
      f.poly([[32 + dx, 61], [32 + dx + w / 2, 61], [32 + dx + w * 0.2, 61 - hh * 0.7], [32 + dx, 61 - hh]], EARTH[1]);
    }
    f.outline(OUTL); return f;
  });
  return { frames, w: 64, h: 64, gx: 32, gy: 61 };
}

/** Клуб пыли: объёмная куча кругов — тень снизу справа, тон, свет сверху слева, блик, тёмный контур; erode — осыпание (0..0.8). */
function cloud(f: PC, x: number, y: number, s: number, erode: number, seed: number) {
  const dark = hex("#6a5a3c"), mid = hex("#b0a078"), light = hex("#dccca4"), hi = hex("#f4ecd0"), outl = hex("#3a2e1c");
  const parts: [number, number, number][] = [[0, 0, s], [-s * 0.8, s * 0.25, s * 0.72], [s * 0.85, s * 0.2, s * 0.76], [-s * 0.25, -s * 0.55, s * 0.66], [s * 0.4, -s * 0.5, s * 0.58]];
  const tmp = new PC(f.w, f.h), rr = rng(seed);
  for (const [dx, dy, r] of parts) tmp.ellipse(x + dx + s * 0.12, y + dy + s * 0.15, r, r * 0.82, dark);
  for (const [dx, dy, r] of parts) tmp.ellipse(x + dx, y + dy, r * 0.94, r * 0.78, mid);
  for (const [dx, dy, r] of parts) tmp.ellipse(x + dx - r * 0.2, y + dy - r * 0.25, r * 0.62, r * 0.48, light);
  tmp.ellipse(x - s * 0.35, y - s * 0.5, s * 0.3, s * 0.22, hi);
  tmp.outline(outl);
  if (erode > 0) for (let j = 0; j < tmp.h; j++) for (let i = 0; i < tmp.w; i++) if (rr() < Math.min(0.85, erode)) tmp.clear(i, j);
  f.blit(tmp, 0, 0);
}
/** Глыба: пять-семь пикселей в поперечнике, три тона, контур. */
function rock(f: PC, x: number, y: number, s: number, tone: number) {
  const c = [EARTH[2], EARTH[3], EARTH[1]][tone % 3];
  const r = new PC(s * 2 + 4, s * 2 + 4), cx = s + 2, cy = s + 2;
  r.poly([[cx - s, cy + s * 0.5], [cx - s * 0.5, cy - s], [cx + s * 0.7, cy - s * 0.8], [cx + s, cy + s * 0.4], [cx, cy + s]], c);
  r.poly([[cx, cy + s], [cx + s, cy + s * 0.4], [cx + s * 0.7, cy - s * 0.8], [cx + s * 0.2, cy]], EARTH[1]);
  put(r, cx - s * 0.5, cy - s * 0.5, EARTH[4]); r.outline(OUTL);
  f.blit(r, Math.round(x - cx), Math.round(y - cy));
}

export function quakeSlam(): Gen {
  const W = 312, H = 284, CX = 156, CY = 150, N = 16, r = rng(33), sp = spikeFrames();
  const R = (t: number) => (t < 1 ? 0 : Math.min(130, 8 + (t - 1) * 17));
  const ellY = 0.7;
  // шипы: три кольца, задержка по радиусу (волна доходит до кольца, и из земли выстреливает шип)
  const rings = [{ r: 46, n: 4, t0: 2, off: 0.5 }, { r: 90, n: 6, t0: 4, off: 0 }, { r: 126, n: 8, t0: 6, off: 0.5 }];
  const inst = rings.flatMap((g) => Array.from({ length: g.n }, (_, i) => { const a = ((i + g.off) / g.n) * TAU, jit = Math.floor(r() * 2); return { a, x: CX + Math.cos(a) * g.r, y: CY + Math.sin(a) * g.r * ellY, t0: g.t0 + jit, flip: r() < 0.5, rocks: [0].map(() => ({ da: (r() - 0.5) * 1.6, v: 5 + r() * 5, s: 2 + Math.floor(r() * 3), tone: Math.floor(r() * 3), vx: (r() - 0.5) * 7 })) }; })).sort((p, q) => p.y - q.y);
  const puffs = Array.from({ length: 24 }, (_, k) => ({ a: (k / 24) * TAU + (r() - 0.5) * 0.12, s: 6 + r() * 3, seed: Math.floor(r() * 9999) }));
  const cracks = Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * TAU + (r() - 0.5) * 0.4, len: 13 + r() * 14, z: r() * 9 }));
  const sparks = Array.from({ length: 26 }, () => ({ a: r() * TAU, v: 5 + r() * 9, up: 3 + r() * 6, life: 6 + Math.floor(r() * 4) }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    // воронка и толстые трещины в центре
    if (t >= 1) {
      const fade = t > 12 ? Math.max(0, 1 - (t - 12) / 4) : 1;
      if (fade > 0) {
        const rim = new PC(W, H); rim.ellipse(CX, CY, 25, 17.5, EARTH[1]); rim.ellipse(CX, CY, 22, 15, EARTH[0]); rim.ellipse(CX, CY + 1, 18, 12, hex("#150d07"));
        rim.outline(OUTL);
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (fade < 1 && ((i * 5 + j * 3 + t) % 4) / 4 > fade) rim.clear(i, j);
        f.blit(rim, 0, 0);
        for (const c of cracks) {
          let x = CX + Math.cos(c.a) * 12, y = CY + Math.sin(c.a) * 12 * ellY; const L = Math.min(c.len, Math.max(0, t - 0.5) * 7);
          for (let s = 0; s < L; s += 3) { const aj = c.a + Math.sin(s * 0.6 + c.z) * 0.3, nx = x + Math.cos(aj) * 3, ny = y + Math.sin(aj) * 3 * ellY; f.line(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), OUTL, 3); x = nx; y = ny; }
          x = CX + Math.cos(c.a) * 12; y = CY + Math.sin(c.a) * 12 * ellY;
          if (t < 10) for (let s = 0; s < L; s += 3) { const aj = c.a + Math.sin(s * 0.6 + c.z) * 0.3, nx = x + Math.cos(aj) * 3, ny = y + Math.sin(aj) * 3 * ellY; f.line(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), t < 6 ? G[4] : G[3], 1); x = nx; y = ny; }
        }
      }
    }
    // задние половины шипов и глыб (дальше от зрителя) рисуются раньше пыли
    const drawInst = (back: boolean) => {
      for (const s of inst) {
        if ((s.y < CY) !== back) continue;
        const k = t - s.t0; if (k < 0 || k >= sp.frames.length) continue;
        const fr = s.flip ? flipH(sp.frames[k]) : sp.frames[k];
        f.blit(fr, Math.round(s.x - sp.gx), Math.round(s.y - sp.gy));
      }
    };
    drawInst(true);
    // волна пыли: три ряда крупных клубов катятся наружу плотной полосой, потом поднимаются и оседают
    for (const row of [{ lag: 2, n: 11, s: 10, off: 0.2 }, { lag: 1, n: 13, s: 11.5, off: 0.0 }, { lag: 0, n: 14, s: 13, off: 0.5 }]) {
      for (let k = 0; k < row.n; k++) {
        const tt = t - row.lag; if (tt < 1) continue;
        const a = ((k + row.off) / row.n) * TAU, lift = Math.max(0, tt - 8.6) * 3.2, x = CX + Math.cos(a) * R(tt), y = CY + Math.sin(a) * R(tt) * ellY - 4 - lift - (row.lag ? 0 : 2);
        const er = Math.max(0, tt - 9.2) * 0.3; if (er > 0.85) continue;
        cloud(f, x, y, row.s * (1 + 0.05 * Math.sin(k * 2.1)), er, 11 + k * 7 + row.lag);
      }
    }
    drawInst(false);
    // глыбы с шипов
    for (const s of inst) for (const rk of s.rocks) {
      const q = t - s.t0 - 1; if (q < 0 || q > 6) continue;
      const x = s.x + Math.cos(s.a + rk.da) * 3 * q + rk.vx * q * 0.7, h = Math.max(0, rk.v * q - 1.5 * q * q), y = s.y - 6 - h;
      f.ellipse(x, s.y + 2, rk.s + 1, 1.4, OUTL); rock(f, x, y, rk.s, rk.tone);
    }
    // вспышка света у ног: белый диск и короткие лучи
    if (t <= 2) {
      const rr = [17, 12, 7][t];
      f.ellipse(CX, CY - 4, rr + 1, (rr + 1) * 0.85, G[3]); f.ellipse(CX, CY - 4, rr, rr * 0.85, G[5]); f.ellipse(CX, CY - 4, rr * 0.6, rr * 0.5, hex("#ffffff"));
      for (let k2 = 0; k2 < 10; k2++) { const a = (k2 * TAU) / 10 + 0.2, len = (k2 % 2 ? 12 : 22) * (1 - t * 0.3); for (let q = rr * 0.8; q < rr * 0.8 + len; q++) { put(f, CX + Math.cos(a) * q, CY - 4 + Math.sin(a) * q * 0.8, q < rr * 0.8 + len * 0.6 ? G[5] : G[3]); put(f, CX + Math.cos(a) * q + 1, CY - 4 + Math.sin(a) * q * 0.8, G[4]); } }
    }
    // золотые искры света
    for (const s of sparks) { if (t < 1 || t > s.life + 1) continue; const q = t - 1, x = CX + Math.cos(s.a) * s.v * q * 1.6, y = CY - 3 - s.up * q * 1.6 + 0.7 * q * q * 1.6 + Math.sin(s.a) * s.v * q * 0.5; put(f, x, y, q < s.life * 0.5 ? G[5] : G[3]); put(f, x + 1, y, q < s.life * 0.5 ? G[4] : G[2]); if (q < s.life * 0.4) { put(f, x, y + 1, G[3]); put(f, x - Math.cos(s.a), y + 1, G[2]); } }
    return f;
  });
  return { id: "quake-slam", pack: "gen", role: "aoe", frames, w: W, h: H, anchor: [CX / W, CY / H], fps: 14, blend: "normal", hero: "warrior" };
}

function flipH(f: PC): PC {
  const o = new PC(f.w, f.h);
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) { const c = f.get(f.w - 1 - x, y)!; if (c[3]) o.set(x, y, c); }
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const g = quakeSlam(), out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/quake.png");
  storyboard(g.frames.filter((_, i) => i % 2 === 1), g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f (every 2nd)`, 1).save(out);
  console.log(out);
}
