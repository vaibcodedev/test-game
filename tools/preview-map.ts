/**
 * Отладочное превью карты мира.
 * Без аргументов: tools/out/map-preview.png, 4 px на тайл, точки мобов и боссов (как раньше).
 * Запуск: npx tsx tools/preview-map.ts [--scale N] [--out файл.png] [--labels] [--levels] [--pair было.png стало.png итог.png]
 *   --labels  границы зон (светлые линии), уровни зон цифрами («1-10»), мосты, города и боссы (задача 132, шаг 2: картинки «было | стало»);
 *   --levels  заливка по уровню зоны (от зелёного через жёлтый к красному) поверх поверхности;
 *   --pair    склеить два готовых снимка в один: слева «было», справа «стало».
 */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { CITIES } from "../shared/cities";
import { generateMap, CELL_BLOCK, CELL_WALL, isTownZone, ZONES, ZONE_COUNT, type WorldMap } from "../shared/map";
import { MAP_SEED, TILE } from "../shared/constants";
import { TOWN } from "../shared/town";

const COLORS = ["#3b6fb6", "#e0562b", "#d9c48a", "#4b5a3a", "#5c5150", "#9b7a52", "#6aa84f", "#3d6e3a", "#a29a8c", "#57525c", "#e6eef2", "#a8d4e6", "#2c2a35", "#e0c27a", "#2f5d8f"];
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(name);

/** Шрифт 3×5 для подписей уровней: цифры и тире. */
const FONT: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"], "1": [".#.", "##.", ".#.", ".#.", "###"], "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"], "4": ["#.#", "#.#", "###", "..#", "..#"], "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"], "7": ["###", "..#", "..#", "..#", "..#"], "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"], "-": ["...", "...", "###", "...", "..."],
};

class Img {
  readonly png: PNG;
  constructor(readonly w: number, readonly h: number) { this.png = new PNG({ width: w, height: h }); }
  set(x: number, y: number, c: number[]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.png.data[i] = c[0]; this.png.data[i + 1] = c[1]; this.png.data[i + 2] = c[2]; this.png.data[i + 3] = 255;
  }
  rect(x0: number, y0: number, w: number, h: number, c: number[]) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c); }
  frame(x0: number, y0: number, w: number, h: number, c: number[]) {
    for (let x = x0; x < x0 + w; x++) { this.set(x, y0, c); this.set(x, y0 + h - 1, c); }
    for (let y = y0; y < y0 + h; y++) { this.set(x0, y, c); this.set(x0 + w - 1, y, c); }
  }
  disc(cx: number, cy: number, r: number, c: number[]) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) this.set(cx + x, cy + y, c); }
  /** Текст шрифтом 3×5 с чёрной обводкой; k — увеличение; x, y — центр. */
  text(s: string, cx: number, cy: number, k: number, c: number[]) {
    const w = (s.length * 4 - 1) * k, h = 5 * k;
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    for (const pass of [0, 1]) {
      for (let ci = 0; ci < s.length; ci++) {
        const g = FONT[s[ci]];
        if (!g) continue;
        for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
          if (g[gy][gx] !== "#") continue;
          const px = x0 + (ci * 4 + gx) * k, py = y0 + gy * k;
          if (pass === 0) this.rect(px - 1, py - 1, k + 2, k + 2, [8, 8, 12]);
          else this.rect(px, py, k, k, c);
        }
      }
    }
  }
}

/** Уровень зоны для заливки: середина диапазона (города — без заливки). */
const levelOf = (z: number) => {
  const [lo, hi] = ZONES[z].levels;
  return hi > 0 ? (lo + hi) / 2 : -1;
};
const ramp = (lv: number): number[] => {
  const t = Math.max(0, Math.min(1, (lv - 1) / 99));
  // зелёный → жёлтый → красный → тёмно-красный
  const stops: [number, number[]][] = [[0, [70, 190, 90]], [0.4, [235, 205, 70]], [0.75, [225, 80, 50]], [1, [120, 20, 40]]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (t <= t1) { const k = (t - t0) / (t1 - t0); return c0.map((v, j) => v + (c1[j] - v) * k); }
  }
  return stops[stops.length - 1][1];
};

/** Центры крупных связных кусков зон — «полюса недоступности» на крупной сетке 4×4 тайла. */
function zonePoles(m: WorldMap) {
  const B = 4, bw = Math.ceil(m.w / B), bh = Math.ceil(m.h / B);
  const blk = new Int16Array(bw * bh).fill(-1);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) blk[by * bw + bx] = m.zone[Math.min(m.h - 1, by * B + 2) * m.w + Math.min(m.w - 1, bx * B + 2)];
  const seen = new Uint8Array(bw * bh);
  const out: { zone: number; x: number; y: number; n: number }[] = [];
  for (let i0 = 0; i0 < bw * bh; i0++) {
    if (seen[i0]) continue;
    const z = blk[i0], comp: number[] = [], st = [i0];
    seen[i0] = 1;
    while (st.length) {
      const c = st.pop()!;
      comp.push(c);
      const x = c % bw, y = (c / bw) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const j = ny * bw + nx;
        if (!seen[j] && blk[j] === z) { seen[j] = 1; st.push(j); }
      }
    }
    if (comp.length < 40 || z < 0 || isTownZone(z)) continue;
    // расстояние до границы куска (4 соседа), берём клетку с наибольшим
    const inComp = new Set(comp), dist = new Map<number, number>();
    let frontier: number[] = [];
    for (const c of comp) {
      const x = c % bw, y = (c / bw) | 0;
      const edge = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => nx < 0 || ny < 0 || nx >= bw || ny >= bh || !inComp.has(ny * bw + nx));
      if (edge) { dist.set(c, 0); frontier.push(c); }
    }
    while (frontier.length) {
      const next: number[] = [];
      for (const c of frontier) {
        const x = c % bw, y = (c / bw) | 0, d = dist.get(c)!;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
          const j = ny * bw + nx;
          if (nx >= 0 && ny >= 0 && nx < bw && ny < bh && inComp.has(j) && !dist.has(j)) { dist.set(j, d + 1); next.push(j); }
        }
      }
      frontier = next;
    }
    let best = comp[0], bd = -1;
    for (const c of comp) { const d = dist.get(c) ?? 0; if (d > bd) { bd = d; best = c; } }
    out.push({ zone: z, x: (best % bw) * B + B / 2, y: Math.floor(best / bw) * B + B / 2, n: comp.length });
  }
  return out;
}

function render(m: WorldMap, S: number, labels: boolean, levels: boolean): Img {
  const img = new Img(m.w * S, m.h * S);
  for (let y = 0; y < m.h * S; y++) for (let x = 0; x < m.w * S; x++) {
    const cx = Math.floor(x / S), cy = Math.floor(y / S), ci = cy * m.w + cx;
    let c = hex(COLORS[m.vtx[cy * (m.w + 1) + cx]] ?? "#ff00ff");
    const f = m.cell[ci];
    if (f & CELL_WALL) c = [40, 34, 44];
    else if (f & CELL_BLOCK) c = c.map((v) => v * 0.6);
    if (levels) {
      const lv = levelOf(m.zone[ci]);
      if (lv >= 0) { const r = ramp(lv); c = c.map((v, j) => v * 0.45 + r[j] * 0.55); }
    }
    if (labels) {
      // граница зон: линия по правому и нижнему краю клетки (на масштабе 1 — по самой клетке)
      const z = m.zone[ci];
      const lastX = S === 1 || x % S === S - 1, lastY = S === 1 || y % S === S - 1;
      if ((lastX && cx + 1 < m.w && m.zone[ci + 1] !== z) || (lastY && cy + 1 < m.h && m.zone[ci + m.w] !== z)) c = c.map((v) => v * 0.4 + 255 * 0.6);
    }
    img.set(x, y, c);
  }
  if (!labels) return img;
  const P = (t: number) => Math.round(t * S);
  // ось симметрии
  for (let y = 0; y < img.h; y += 6) img.set(P(m.w / 2), y, [255, 210, 63]);
  // уровни зон
  const k = Math.max(1, Math.round(S / 2));
  for (const p of zonePoles(m)) {
    const [lo, hi] = ZONES[p.zone].levels;
    if (hi <= 0) continue;
    img.text(`${lo}-${hi}`, P(p.x), P(p.y), k, [255, 255, 255]);
  }
  // мосты, города, боссы
  for (const o of m.objects) {
    if (o.kind === "bridge_h" || o.kind === "bridge_v") img.rect(P(o.x / TILE) - P(3), P(o.y / TILE) - P(3), P(6), P(3), [186, 136, 80]);
  }
  for (const c of CITIES) {
    img.frame(P(c.x - c.half.x), P(c.y - c.half.y), P(c.half.x * 2 + 1), P(c.half.y * 2 + 1), [255, 255, 255]);
    img.disc(P(c.x + 0.5), P(c.y + 0.5), Math.max(2, S), c.capital ? [250, 210, 60] : [255, 255, 255]);
  }
  img.disc(P(TOWN.x + 0.5), P(TOWN.y + 0.5), Math.max(2, S), [255, 140, 66]);
  for (const b of m.bosses) {
    img.disc(P(b.x / TILE), P(b.y / TILE), Math.max(2, S), [214, 55, 42]);
    img.frame(P(b.x / TILE - b.arena / TILE), P(b.y / TILE - b.arena / TILE), P((2 * b.arena) / TILE), P((2 * b.arena) / TILE), [255, 107, 90]);
  }
  return img;
}

function pair(a: string, b: string, out: string) {
  const A = PNG.sync.read(fs.readFileSync(a)), B = PNG.sync.read(fs.readFileSync(b));
  const gap = 8, h = Math.max(A.height, B.height);
  const img = new Img(A.width + gap + B.width, h);
  img.rect(0, 0, img.w, img.h, [14, 17, 23]);
  const blit = (s: PNG, ox: number) => {
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
      const i = (y * s.width + x) * 4;
      img.set(ox + x, y, [s.data[i], s.data[i + 1], s.data[i + 2]]);
    }
  };
  blit(A, 0);
  blit(B, A.width + gap);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(img.png));
  console.log(out, img.w, img.h);
}

if (has("--pair")) {
  const i = process.argv.indexOf("--pair");
  pair(process.argv[i + 1], process.argv[i + 2], process.argv[i + 3]);
} else {
  const m = generateMap(MAP_SEED);
  const labels = has("--labels"), levels = has("--levels");
  const S = Number(arg("--scale") ?? (labels || levels ? 2 : 4));
  const out = arg("--out") ?? "tools/out/map-preview.png";
  const img = render(m, S, labels, levels);
  if (!labels && !levels) {
    // прежний вид: точки мобов и боссов, точка появления
    const dot = (px: number, py: number, c: number[], r = 1) => img.disc(Math.floor((px / TILE) * S), Math.floor((py / TILE) * S), r, c);
    for (const s of m.spawns) dot(s.x, s.y, [255, 40, 200], 1);
    for (const b of m.bosses) dot(b.x, b.y, [255, 255, 0], 3);
    dot(m.playerSpawn.x, m.playerSpawn.y, [255, 255, 255], 2);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(img.png));
  console.log(out, img.w, img.h);
  const counts: Record<string, number> = {};
  for (const o of m.objects) counts[o.kind] = (counts[o.kind] || 0) + 1;
  console.log("objects", m.objects.length, counts);
  console.log("spawns", m.spawns.length, m.spawns.reduce((a, s) => ((a[s.mob] = (a[s.mob] || 0) + 1), a), {} as Record<string, number>));
  const zc = new Array<number>(ZONE_COUNT).fill(0);
  for (const z of m.zone) zc[z]++;
  console.log("зоны (клеток):", zc.map((n, z) => (n ? `${ZONES[z].name} ${n}` : "")).filter(Boolean).join("; "));
}
