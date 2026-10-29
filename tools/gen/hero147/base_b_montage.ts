/**
 * Задача 147, шаг 2: монтаж основы «Б» → tools/out/hero/base-B.png (+ части base-B-*.png) и точки скелета → data/hero-skeleton-b.json.
 * Разделы: «Б было | Б финал» ×4; причёски м/ж обеих фракций ×3; сцена на зуме 2 и 3, день и вечер; все анимации (4 облика × вниз/вверх/вбок) ×2.
 * Запуск: npx tsx tools/gen/hero147/base_b_montage.ts  (без движка; в игру не подключено)
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, type RGBA } from "../canvas";
import { P as PAL } from "../palette";
import { text } from "../mobs/lib";
import { ANIMS, DATA, FR, FY, NF, exportSkeleton, flipCv, hairStyles, renderFrame, type AnimId, type Look, type View } from "./base_b";
import { BUILDS, renderFrame as oldFrame } from "./hero_base";
import type { Cv } from "../bosses139/mino_lib";

const OUT = path.resolve("tools/out/hero"), ASSETS = path.resolve("client/public/assets");
fs.mkdirSync(OUT, { recursive: true });
const BG: RGBA = [24, 20, 26, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255];

const load = (f: string): PC => { const p = PNG.sync.read(fs.readFileSync(f)); const c = new PC(p.width, p.height); c.data.set(p.data); return c; };
const sub = (s: PC, x0: number, y0: number, w: number, h: number) => { const o = new PC(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = s.get(x0 + x, y0 + y); if (c && c[3]) o.set(x, y, c); } return o; };
const toPc = (c: Cv): PC => { const o = new PC(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) { const q = c.get(x, y); o.set(x, y, [q[0], q[1], q[2], 255]); } return o; };
function blit(d: PC, s: PC, ox: number, oy: number, k = 1, x0 = 0, y0 = 0, w = s.w, h = s.h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const c = s.get(x, y); if (!c || !c[3]) continue; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) d.set(ox + (x - x0) * k + a, oy + (y - y0) * k + b, c); }
}
const fill = (c: PC, x: number, y: number, w: number, h: number, col: RGBA) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, col); };
function shadow(c: PC, cx: number, cy: number, rx: number, ry: number, a = 90) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2; if (d <= 1) c.set(x, y, [14, 10, 18, d < 0.45 ? a + 30 : a]);
  }
}
function ground(w: number, h: number, seed = 1): PC {
  const g = new PC(w, h), gr = PAL.grass;
  const n = (x: number, y: number) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.7) * 43758.5453; return s - Math.floor(s); };
  const sm = (x: number, y: number, cell: number) => { const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0; const l = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t)); return l(l(n(x0, y0), n(x0 + 1, y0), tx), l(n(x0, y0 + 1), n(x0 + 1, y0 + 1), tx), ty); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = sm(x, y, 18) * 0.6 + sm(x >> 1, y >> 1, 3) * 0.4; g.set(x, y, gr[v < 0.36 ? 0 : v < 0.52 ? 1 : v < 0.7 ? 2 : 3]); }
  for (let i = 0; i < (w * h) / 60; i++) { const x = Math.floor(n(i, 3) * w), y = Math.floor(n(i, 7) * h); g.set(x, y, gr[3]); g.set(x, y - 1, gr[4] ?? gr[3]); }
  return g;
}

const LOOKS: { l: Look; name: string }[] = [
  { l: { fac: "sol", sex: "m", hair: "tousled" }, name: "СОЛЬГАРД М" },
  { l: { fac: "sol", sex: "f", hair: "braid" }, name: "СОЛЬГАРД Ж" },
  { l: { fac: "umb", sex: "m", hair: "mane" }, name: "УМБРАТ М" },
  { l: { fac: "umb", sex: "f", hair: "loose" }, name: "УМБРАТ Ж" },
];
type Pack = { img: PC; emis: [number, number, RGBA][] };
const cache = new Map<string, Pack>();
function fr(l: Look, v: View | "left", a: AnimId, i: number): Pack {
  const key = JSON.stringify([l, v, a, i]);
  let p = cache.get(key);
  if (!p) {
    const f = renderFrame(l, v === "left" ? "side" : v, a, i);
    const img = toPc(v === "left" ? flipCv(f.img) : f.img);
    p = { img, emis: f.emis.map(([x, y, c]) => [v === "left" ? FR - 1 - x : x, y, [c[0], c[1], c[2], 255]] as [number, number, RGBA]) };
    cache.set(key, p);
  }
  return p;
}
const blocks: { h: number; w: number; draw: (c: PC, y: number) => void; file?: string }[] = [];

// ---------- 1. Б было | Б финал ----------
{
  const K = 4, cw = 36 * K, ch = 40 * K, views: View[] = ["down", "up", "side"];
  const w = 40 + 6 * cw + 40;
  blocks.push({
    w, h: 60 + LOOKS.length * (ch + 24), file: "base-B-compare.png", draw: (c, y0) => {
      text(c, "Б БЫЛО", 20, y0, 3, DIM); text(c, "Б ФИНАЛ · 3,5 ГОЛОВЫ · РОСТ 30", 20 + 3 * cw + 40, y0, 3, GOLD);
      LOOKS.forEach((L, r) => {
        const y = y0 + 40 + r * (ch + 24);
        text(c, L.name, 20, y - 2, 1);
        views.forEach((v, vi) => {
          for (const fin of [false, true]) {
            const x = 20 + (fin ? 3 * cw + 40 : 0) + vi * cw;
            const g = ground(36, 40, r * 3 + vi); blit(c, g, x, y + 10, K);
            for (let i = 0; i < g.data.length; i++);
            const img = fin ? fr(L.l, v, "idle", 0).img : toPc(oldFrame(BUILDS[1], { fac: L.l.fac, sex: L.l.sex }, v, "idle", 0).img);
            shadow(c, x + 18 * K, y + 10 + (FY - 7) * K, 6 * K, 2.2 * K, 80);
            blit(c, img, x, y + 10, K, 6, 8, 36, 40);
          }
        });
      });
    },
  });
}
// ---------- 2. причёски ----------
{
  const K = 3, cw = 34 * K, ch = 36 * K, views: View[] = ["down", "up", "side"];
  const rows: { sex: "m" | "f"; fac: "sol" | "umb" }[] = [{ sex: "m", fac: "sol" }, { sex: "m", fac: "umb" }, { sex: "f", fac: "sol" }, { sex: "f", fac: "umb" }];
  const w = 40 + 6 * (3 * cw + 16);
  blocks.push({
    w, h: 40 + rows.length * (ch + 34), file: "base-B-hair.png", draw: (c, y0) => {
      text(c, "ПРИЧЁСКИ · 6 МУЖСКИХ И 6 ЖЕНСКИХ · ЦВЕТА ПО ФРАКЦИЯМ · ВНИЗ ВВЕРХ ВБОК ×3", 20, y0, 2);
      rows.forEach((R, r) => {
        const y = y0 + 34 + r * (ch + 34);
        hairStyles(R.sex).forEach((h, si) => {
          const x0 = 20 + si * (3 * cw + 16);
          text(c, `${h.name} · ${R.fac === "sol" ? "СОЛЬГАРД" : "УМБРАТ"}`, x0, y, 1, R.fac === "sol" ? GOLD : [160, 220, 130, 255]);
          views.forEach((v, vi) => {
            const img = fr({ fac: R.fac, sex: R.sex, hair: h.id }, v, "idle", 0).img;
            fill(c, x0 + vi * cw, y + 12, cw - 2, ch, [44, 54, 40, 255]);
            blit(c, img, x0 + vi * cw, y + 12, K, 7, 10, 34, 36);
          });
        });
      });
    },
  });
}
// ---------- 3. сцена: зум 2 и 3, день и вечер ----------
function scene(evening: boolean): PC {
  const SW = 300, SH = 120;
  const g = ground(SW, SH, 5);
  const items: { x: number; y: number; img: PC; foot: number; rx?: number; emis?: [number, number, RGBA][] }[] = [];
  const obj = (n: string) => load(path.join(ASSETS, "objects", n + ".png"));
  const unit = (id: string) => sub(load(path.join(ASSETS, "units", id + ".png")), 0, 0, 32, 32);
  items.push({ x: 50, y: 50, img: obj("sol_house__cap-house-clean"), foot: 2 });
  items.push({ x: 250, y: 48, img: obj("umb_house__cap-house-clean"), foot: 2 });
  items.push({ x: 150, y: 52, img: obj("lamp"), foot: 2 });
  items.push({ x: 110, y: 70, img: unit("guard"), foot: 1, rx: 7 });
  items.push({ x: 200, y: 74, img: unit("canine_wolf"), foot: 1, rx: 8 });
  items.push({ x: 228, y: 92, img: unit("boarfolk_axe"), foot: 1, rx: 8 });
  const hx0 = 90;
  LOOKS.forEach((L, i) => { const f = fr(L.l, i % 2 ? "side" : "down", "idle", 0); items.push({ x: hx0 + i * 26, y: 100 + (i % 2) * 3, img: f.img, foot: FR - FY - 1, rx: 6, emis: f.emis }); });
  { const f = fr({ fac: "sol", sex: "m", hair: "tousled" }, "down", "block", 0); items.push({ x: hx0 + 4 * 26, y: 100, img: f.img, foot: FR - FY - 1, rx: 6 }); }
  items.sort((a, b) => a.y - b.y);
  const c = new PC(SW, SH); c.data.set(g.data);
  const emis: [number, number, RGBA][] = [];
  for (const it of items) {
    const ox = Math.round(it.x - it.img.w / 2), oy = Math.round(it.y - it.img.h + it.foot);
    if (it.rx) shadow(c, it.x, it.y, it.rx, it.rx * 0.38, 85); else shadow(c, it.x + 6, it.y - 2, it.img.w * 0.45, 6, 60);
    blit(c, it.img, ox, oy);
    for (const [x, y, col] of it.emis ?? []) emis.push([ox + x, oy + y, col]);
  }
  if (evening) {
    for (let i = 0; i < c.data.length; i += 4) { c.data[i] *= 0.6; c.data[i + 1] *= 0.56; c.data[i + 2] *= 0.78; }
    const lx = 150, ly = 6;
    for (let y = ly - 30; y < ly + 30; y++) for (let x = lx - 30; x < lx + 30; x++) { const d = Math.hypot(x - lx, (y - ly) * 1.2); if (d < 30) c.set(x, y, [255, 190, 110, Math.round(60 * (1 - d / 30) ** 2)]); }
    for (const [x, y, col] of emis) { c.set(x, y, col); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + dx, y + dy, [col[0], col[1], col[2], 80]); }
  }
  return c;
}
{
  const day = scene(false), eve = scene(true);
  const w = 40 + day.w * 2 * 2 + 20;
  blocks.push({
    w, h: 40 + day.h * 2 + 30 + 66 * 3 + 30, file: "base-B-scene.png", draw: (c, y0) => {
      text(c, "СЦЕНА · ЗУМ 2 · ДЕНЬ | ВЕЧЕР · РЯДОМ СО СТРАЖЕМ, МОБАМИ И ДОМАМИ", 20, y0, 2);
      blit(c, day, 20, y0 + 26, 2); blit(c, eve, 40 + day.w * 2, y0 + 26, 2);
      const y1 = y0 + 26 + day.h * 2 + 20;
      text(c, "ЗУМ 3 · ДЕНЬ | ВЕЧЕР", 20, y1, 2);
      blit(c, day, 20, y1 + 26, 3, 70, 54, 160, 66); blit(c, eve, 40 + 160 * 3, y1 + 26, 3, 70, 54, 160, 66);
    },
  });
}
// ---------- 4. анимации ----------
const AK = 2, AV: (View | "left")[] = ["down", "up", "side"];
for (const a of ANIMS) {
  const n = NF(a), fw = FR * AK, gap = 18, lw = 120;
  const w = lw + AV.length * (n * fw + gap) + 20;
  const d = DATA.anims[a];
  blocks.push({
    w, h: 30 + LOOKS.length * fw, file: `base-B-anim-${a}.png`, draw: (c, y0) => {
      text(c, `${d.name.toUpperCase()} · ${n} КАДРОВ · ${d.fps} В СЕКУНДУ · ВНИЗ | ВВЕРХ | ВБОК (ВЛЕВО — ЗЕРКАЛО)`, 20, y0, 2, GOLD);
      LOOKS.forEach((L, r) => {
        const y = y0 + 26 + r * fw;
        text(c, L.name, 10, y + fw / 2 - 4, 1);
        AV.forEach((v, vi) => {
          for (let i = 0; i < n; i++) {
            const x = lw + vi * (n * fw + gap) + i * fw;
            fill(c, x, y, fw - 2, fw - 2, vi % 2 ? [40, 48, 54, 255] : [44, 54, 40, 255]);
            shadow(c, x + 24 * AK, y + (FY - 1) * AK, 6 * AK, 2 * AK, 70);
            blit(c, fr(L.l, v, a, i).img, x, y, AK);
          }
        });
      });
    },
  });
}

// ---------- сборка ----------
function stack(list: typeof blocks, w: number, title?: string): PC {
  const H = list.reduce((s, r) => s + r.h + 20, 20) + (title ? 70 : 0);
  const c = new PC(w, H); fill(c, 0, 0, w, H, BG);
  let y = 20;
  if (title) { text(c, title, 20, y, 3); text(c, "СКЕЛЕТ 3D, ТОРС ЛОФТОМ, ГОЛОВА В СВОЕЙ СИСТЕМЕ, ШТАМПЫ ×2 СО СВЕДЕНИЕМ · ТОЧКИ ДЛЯ СЛОЁВ — DATA/HERO-SKELETON-B.JSON · В ИГРУ НЕ ВКЛЮЧЕНО", 20, y + 34, 2, DIM); y += 70; }
  for (const r of list) { r.draw(c, y); y += r.h + 20; }
  return c;
}
for (const b of blocks) if (b.file) stack([b], b.w).save(path.join(OUT, b.file));
const W = Math.max(...blocks.map((b) => b.w));
stack(blocks, W, "ЗАДАЧА 147 · ОСНОВА ГЕРОЯ Б · ФИНАЛ").save(path.join(OUT, "base-B.png"));
console.log("→ tools/out/hero/base-B.png");
exportSkeleton(path.resolve("data/hero-skeleton-b.json"));
console.log("→ data/hero-skeleton-b.json", (fs.statSync("data/hero-skeleton-b.json").size / 1024).toFixed(0) + " KB");
