/** Молот правосудия (tp_hammer, задача 127): летящий золотой молот и удар света.
 *  hammer-gold — снаряд: молот вращается, светится, за ним след золотых искр (26×24, 8 кадров цикла, летит вправо).
 *  hammer-slam — попадание: вспышка света с лучами, столб света, золотая ударная волна по земле (эллипс 0.7), трещины, разлетающиеся искры.
 *  Размер удара — под цель (радиус круга умения 40: волна растёт до ~44 px от точки удара). Запуск отдельно: tsx tools/gen/vfx-hammer.ts → tools/out/vfx-preview/hammer.png. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, rng, hex, type RGBA } from "./canvas";
import { RAMPS, storyboard, stackV } from "./vfx-lib";
import type { Gen } from "./vfx-gen";

const TAU = Math.PI * 2, G = RAMPS.holy, put = (f: PC, x: number, y: number, c: RGBA) => f.set(Math.round(x), Math.round(y), c);

export function hammerGold(): Gen {
  const W = 30, H = 26, N = 8, wood = [hex("#3a2216"), hex("#6a4228"), hex("#94613a")], edge = hex("#3a2208");
  const base = new PC(20, 20);
  for (let y = 8; y <= 19; y++) { put(base, 9, y, wood[1]); put(base, 10, y, wood[2]); put(base, 11, y, wood[0]); }
  for (let y = 2; y <= 9; y++) for (let x = 3; x <= 16; x++) put(base, x, y, y === 2 ? G[4] : y < 5 ? G[3] : y < 8 ? G[2] : G[1]);
  for (const x of [3, 16]) for (let y = 2; y <= 9; y++) put(base, x, y, G[1]);
  for (let x = 3; x <= 16; x++) put(base, x, 9, G[0]);
  put(base, 9, 5, G[5]); put(base, 10, 5, G[5]); put(base, 9, 4, G[4]); put(base, 10, 4, G[4]); put(base, 9, 6, G[3]); put(base, 10, 6, G[3]);
  base.outline(edge);
  const r = rng(9);
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), cx = 19, cy = 13, glow = 0.5 + 0.5 * Math.sin((t / N) * TAU * 2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - cx, (y - cy) * 1.1); if (d < 12 && d > 7 && (x + y + t) % 3 === 0) put(f, x, y, glow > 0.5 ? G[3] : G[2]); }
    f.blit(base.rotated((t / N) * TAU, 10, 10), cx - 10, cy - 10);
    for (let k = 0; k < 5; k++) { const p = (k + t * 0.6) % 5, x = 13 - p * 2.6, y = cy + (r() - 0.5) * 7; put(f, x, y, k < 2 ? G[5] : k < 4 ? G[4] : G[2]); if (k < 2) put(f, x + 1, y, G[3]); }
    return f;
  });
  return { id: "hammer-gold", pack: "gen", role: "proj", frames, w: W, h: H, anchor: [19 / W, 13 / H], fps: 16, blend: "normal", hero: "warrior" };
}

export function hammerSlam(): Gen {
  const W = 104, H = 76, N = 12, cx = 52, cy = 52, r = rng(21);
  const sparks = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * TAU + r() * 0.3, v: 3 + r() * 4.5, up: 2 + r() * 4, life: 6 + Math.floor(r() * 4) }));
  const cracks = [0.2, 1.3, 2.4, 3.6, 4.7, 5.6].map((a) => ({ a, len: 14 + r() * 14, z: r() }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), k = t / (N - 1);
    // ударная волна по земле: два кольца, эллипс 0.7
    for (const [i, off] of [[0, 0], [1, 2]] as const) {
      const tt = t - off; if (tt < 1) continue;
      const rx = 6 + (tt - 1) * 4.4, ry = rx * 0.7, fade = Math.max(0, 1 - (tt - 1) / 9);
      for (let s = 0; s < Math.round(rx * 8); s++) {
        const a = (s / Math.round(rx * 8)) * TAU; if (fade < 0.45 && (s + t) % 2) continue; if (fade < 0.2 && (s + t) % 3) continue;
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        put(f, x, y, i === 0 ? (fade > 0.6 ? G[5] : G[4]) : G[3]); if (i === 0) put(f, x + Math.cos(a), y + Math.sin(a) * 0.7, G[2]);
        if (i === 0 && fade > 0.5) put(f, cx + Math.cos(a) * (rx - 1.5), cy + Math.sin(a) * (ry - 1), G[3]);
      }
    }
    // трещины света на земле
    if (t >= 1 && t <= 9) for (const c of cracks) { const L = Math.min(c.len, (t - 0.5) * 6); let x = cx, y = cy; for (let s = 0; s < L; s += 2) { const nx = x + Math.cos(c.a + Math.sin(s * 0.5 + c.z * 9) * 0.25) * 2, ny = y + Math.sin(c.a + Math.sin(s * 0.5 + c.z * 9) * 0.25) * 1.4; f.line(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), t < 6 ? G[4] : G[2], 1); x = nx; y = ny; } }
    // столб света
    if (t >= 1 && t <= 6) { const w = Math.max(1, 6 - t), h = 36 - Math.abs(t - 2) * 2; for (let y = 0; y < h; y++) for (let x = -w; x <= w; x++) { const e = Math.abs(x) / (w + 0.01); put(f, cx + x, cy - 4 - y, e > 0.7 ? G[2] : e > 0.35 ? G[4] : G[5]); } }
    // вспышка с лучами
    if (t <= 3) {
      const rr = [14, 11, 7, 4][t], ry = rr * 0.9;
      f.ellipse(cx, cy - 6, rr, ry, t === 0 ? G[5] : G[4]); f.ellipse(cx, cy - 6, rr * 0.65, ry * 0.65, G[5]);
      for (let k2 = 0; k2 < 12; k2++) { const a = (k2 * TAU) / 12 + 0.13, len = (k2 % 2 ? 14 : 22) * (1 - t * 0.2); for (let q = rr * 0.7; q < rr * 0.7 + len; q++) put(f, cx + Math.cos(a) * q, cy - 6 + Math.sin(a) * q * 0.9, q < rr * 0.7 + len * 0.6 ? G[5] : G[3]); }
    }
    // искры с гравитацией
    for (const s of sparks) { if (t < 1 || t > s.life + 1) continue; const q = t - 1, x = cx + Math.cos(s.a) * s.v * q * 1.6, y = cy - 4 - s.up * q * 1.4 + 0.55 * q * q * 1.4 + Math.sin(s.a) * s.v * q * 0.4; put(f, x, y, q < s.life * 0.5 ? G[5] : G[3]); if (q < s.life * 0.4) put(f, x - Math.cos(s.a), y + 1, G[2]); }
    void k;
    return f;
  });
  return { id: "hammer-slam", pack: "gen", role: "hit", frames, w: W, h: H, anchor: [cx / W, cy / H], fps: 14, blend: "normal", hero: "warrior" };
}

export function GENERATED_HAMMER(): Gen[] { return [hammerGold(), hammerSlam()]; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/hammer.png");
  stackV(GENERATED_HAMMER().map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f`, 3))).save(out);
  console.log(out);
}
