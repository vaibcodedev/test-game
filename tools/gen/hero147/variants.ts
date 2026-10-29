/**
 * Задача 147, шаг 1: монтаж вариантов основы героя.
 *   tools/out/hero/variants.png — «сейчас | A | B | C | D»: крупно ×4 (м/ж, Сольгард/Умбрат, с мечом и щитом), виды ×2, сцена на зуме 2 днём и вечером
 *   tools/out/hero/anim_<A..D>.png — листы анимаций: 5 обликов × (вниз, вверх, вбок, зеркало) × (покой 10 + ходьба 10), ×2
 * Запуск: npx tsx tools/gen/hero147/variants.ts  (без движка и сервера; в игру не подключено)
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, type RGBA } from "../canvas";
import { P } from "../palette";
import { text } from "../mobs/lib";
import { BUILDS, FR, FY, NFR, body, flipCv, renderFrame, type Anim, type Build, type Look, type View } from "./hero_base";
import type { Cv } from "../bosses139/mino_lib";

const OUT = path.resolve("tools/out/hero");
const ASSETS = path.resolve("client/public/assets");
fs.mkdirSync(OUT, { recursive: true });

const LOOKS: { l: Look; name: string }[] = [
  { l: { fac: "sol", sex: "m" }, name: "СОЛЬГАРД М" },
  { l: { fac: "sol", sex: "f" }, name: "СОЛЬГАРД Ж" },
  { l: { fac: "umb", sex: "m" }, name: "УМБРАТ М" },
  { l: { fac: "umb", sex: "f" }, name: "УМБРАТ Ж" },
  { l: { fac: "sol", sex: "m", armed: true }, name: "МЕЧ И ЩИТ" },
];
const RU: Record<string, string> = { A: "А", B: "Б", C: "В", D: "Г" };
const BG: RGBA = [24, 20, 26, 255];

// ---------- утилиты ----------
function load(file: string): PC {
  const p = PNG.sync.read(fs.readFileSync(file));
  const c = new PC(p.width, p.height); c.data.set(p.data); return c;
}
function sub(src: PC, x0: number, y0: number, w: number, h: number): PC {
  const o = new PC(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = src.get(x0 + x, y0 + y); if (c && c[3]) o.set(x, y, c); }
  return o;
}
const cvToPc = (c: Cv): PC => { const o = new PC(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) { const q = c.get(x, y); o.set(x, y, [q[0], q[1], q[2], 255]); } return o; };
function blit(dst: PC, src: PC, ox: number, oy: number, k = 1, tint?: (c: RGBA, x: number, y: number) => RGBA) {
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    let c = src.get(x, y); if (!c || !c[3]) continue;
    if (tint) c = tint(c, x, y);
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) dst.set(ox + x * k + a, oy + y * k + b, c);
  }
}
function fill(c: PC, x: number, y: number, w: number, h: number, col: RGBA) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, col); }
function shadow(c: PC, cx: number, cy: number, rx: number, ry: number, a = 90) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d <= 1) c.set(x, y, [14, 10, 18, d < 0.45 ? a + 30 : a]);
  }
}
/** Земля: трава 1× (оттенки P.grass, пятна, травинки) — без однопиксельного шума: пятна по сетке 2×2. */
function ground(w: number, h: number, seed = 1): PC {
  const g = new PC(w, h), gr = P.grass;
  const n = (x: number, y: number) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.7) * 43758.5453; return s - Math.floor(s); };
  const sm = (x: number, y: number, cell: number) => {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const l = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
    return l(l(n(x0, y0), n(x0 + 1, y0), tx), l(n(x0, y0 + 1), n(x0 + 1, y0 + 1), tx), ty);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = sm(x, y, 18) * 0.6 + sm(x >> 1, y >> 1, 3) * 0.4;
    const idx = v < 0.36 ? 0 : v < 0.52 ? 1 : v < 0.7 ? 2 : 3;
    g.set(x, y, gr[Math.min(3, idx)]);
  }
  for (let i = 0; i < w * h / 60; i++) {
    const x = Math.floor(n(i, 3) * w), y = Math.floor(n(i, 7) * h);
    g.set(x, y, gr[3]); g.set(x, y - 1, gr[4] ?? gr[3]); g.set(x + 1, y, gr[1]);
  }
  return g;
}

// ---------- кадры ----------
type Pack = { img: PC; emis: [number, number, RGBA][] };
const cache = new Map<string, Pack>();
function frame(b: Build, l: Look, v: View | "left", anim: Anim, i: number): Pack {
  const key = [b.id, JSON.stringify(l), v, anim, i].join("|");
  let p = cache.get(key);
  if (!p) {
    const f = renderFrame(b, l, v === "left" ? "side" : v, anim, i);
    const img = cvToPc(v === "left" ? flipCv(f.img) : f.img);
    const emis = f.emis.map(([x, y, c]) => [v === "left" ? FR - 1 - x : x, y, [c[0], c[1], c[2], 255]] as [number, number, RGBA]);
    p = { img, emis }; cache.set(key, p);
  }
  return p;
}
/** «Сейчас»: спрайты игры (32×32, ступни y=30): голое тело класса + одетый спрайт класса. */
const cur = (id: string, row = 0, col = 0) => sub(load(path.join(ASSETS, "units", id + ".png")), col * 32, row * 32, 32, 32);
const CUR_LOOKS = [cur("nude_warrior"), cur("nude_healer"), cur("nude_deathknight"), cur("nude_bloodweaver"), cur("warrior")];
const CUR_NAMES = ["ГОЛОЕ ТЕЛО ВОИНА", "ГОЛОЕ ТЕЛО ЖРИЦЫ", "ГОЛОЕ ТЕЛО Р СМЕРТИ", "ГОЛОЕ ТЕЛО КРОВОПР", "ОДЕТЫЙ СПРАЙТ ВОИНА"];

// ---------- 1. крупно ×4 ----------
const K = 4, CELL_W = FR * K + 24, CELL_H = 46 * K + 26;
const COLS = 1 + BUILDS.length;
const W = 40 + COLS * CELL_W;
const blocks: { h: number; draw: (c: PC, y: number) => void }[] = [];
blocks.push({
  h: 70, draw: (c, y) => {
    text(c, "ЗАДАЧА 147 · ОСНОВА ГЕРОЯ · СЕЙЧАС · А · Б · В · Г", 20, y + 4, 3);
    text(c, "ТЕЛО В БАЗОВОЙ ОДЕЖДЕ, СВЕТ СВЕРХУ-СЛЕВА, КОНТУР ТЁМНЫМ ТОНОМ МАТЕРИАЛА, СКЕЛЕТ И ШТАМПЫ ×2 СО СВЕДЕНИЕМ · В ИГРУ НЕ ВКЛЮЧЕНО", 20, y + 36, 2, [200, 190, 170, 255]);
  },
});
const HEAD_OF = (b: Build, l: Look) => body(b, l).headH;
blocks.push({
  h: 50 + LOOKS.length * CELL_H, draw: (c, y0) => {
    const heads = [["СЕЙЧАС", "2 ГОЛОВЫ · 25 ПКС"], ...BUILDS.map((b) => [`${RU[b.id]} · ${b.name}`, `${b.heads} ГОЛОВЫ`])];
    heads.forEach((h, ci) => { text(c, h[0], 20 + ci * CELL_W, y0 - 14, 2, ci ? [255, 216, 100, 255] : [200, 200, 210, 255]); text(c, h[1], 20 + ci * CELL_W, y0 + 10, 1); });
    LOOKS.forEach((L, r) => {
      const y = y0 + 36 + r * CELL_H;
      for (let ci = 0; ci < COLS; ci++) {
        const x = 20 + ci * CELL_W;
        const gnd = ground(FR, 46, r * 7 + ci);
        blit(c, gnd, x, y, K, (q) => [q[0] * 0.8, q[1] * 0.8, q[2] * 0.8, 255]);
        const gy = y + 42 * K; // линия ступней
        if (ci === 0) {
          const s = CUR_LOOKS[r];
          // ступни спрайта игры y=30 → на линию gy
          const sc = new PC(s.w * K, s.h * K); blit(sc, s, 0, 0, K);
          shadow(c, x + FR * K / 2, gy - K, 7 * K, 2.6 * K, 80);
          blit(c, s, x + (FR * K) / 2 - 16 * K, gy - 30 * K, K);
          text(c, CUR_NAMES[r], x + 4, y + 46 * K + 6, 1);
        } else {
          const b = BUILDS[ci - 1];
          const f = frame(b, L.l, "down", "idle", 0);
          const bb = body(b, L.l);
          shadow(c, x + FR * K / 2, gy - K, (bb.hipW + 3) * K, 2.6 * K, 80);
          blit(c, f.img, x, gy - FY * K + K * 0 - K, K);
          // линейка в головах
          const hh = HEAD_OF(b, L.l) * K;
          const top = gy - (FY - Math.min(...topRow(f.img))) * K - K;
          for (let t = 0; gy - K - t * hh >= top - 2; t++) fill(c, x + 4, Math.round(gy - K - t * hh), 8, 2, [255, 216, 100, 200]);
          fill(c, x + 7, top, 2, gy - K - top, [255, 216, 100, 120]);
          text(c, `${L.name} · РОСТ ${Math.round((gy - K - top) / K)}`, x + 4, y + 46 * K + 6, 1);
        }
      }
    });
  },
});
function topRow(img: PC): number[] { for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.alpha(x, y)) return [y]; return [0]; }

// ---------- 2. виды ×2 ----------
const VK = 2, VIEWS: (View | "left")[] = ["down", "up", "side", "left"];
blocks.push({
  h: 30 + 2 * (FR * VK + 8), draw: (c, y0) => {
    text(c, "ВИДЫ ×2 · ВНИЗ ВВЕРХ ВБОК ЗЕРКАЛО · ПОКОЙ И ШАГ", 20, y0, 2);
    BUILDS.forEach((b, bi) => {
      [LOOKS[0], LOOKS[3]].forEach((L, ri) => {
        const y = y0 + 26 + ri * (FR * VK + 8);
        VIEWS.forEach((v, vi) => {
          for (const [an, k] of [["idle", 0], ["walk", 3]] as [Anim, number][]) {
            const x = 20 + bi * (8 * FR * VK / 1.6 + 30) + (vi * 2 + (an === "walk" ? 1 : 0)) * (FR * VK / 1.6);
            const f = frame(b, L.l, v, an, k);
            shadow(c, x + 24 * VK - 12, y + (FY - 1) * VK, 6 * VK, 2 * VK, 70);
            blit(c, f.img, x - 12, y, VK);
          }
        });
      });
      text(c, RU[b.id], 20 + bi * (8 * FR * VK / 1.6 + 30), y0 + 26, 2, [255, 216, 100, 255]);
    });
  },
});

// ---------- 3. сцена на зуме 2 ----------
const SW = 470, SH = 150, SZ = 2;
function scene(evening: boolean): PC {
  const g = ground(SW, SH, 11);
  // тропа
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const px = 120 + Math.sin(y * 0.05) * 10;
    if (Math.abs(x - px) < 11 - Math.sin(x * 0.7 + y) * 0.6 && y > 40) g.set(x, y, Math.abs(x - px) < 7 ? [128, 104, 72, 255] : [104, 84, 60, 255]);
  }
  const items: { x: number; y: number; img: PC; foot?: number; shadowRx?: number; emis?: [number, number, RGBA][] }[] = [];
  const obj = (n: string) => load(path.join(ASSETS, "objects", n + ".png"));
  items.push({ x: 60, y: 62, img: obj("sol_house__cap-house-clean"), foot: 2 });
  items.push({ x: 415, y: 60, img: obj("umb_house__cap-house-clean"), foot: 2 });
  items.push({ x: 150, y: 70, img: obj("well"), foot: 2 });
  items.push({ x: 335, y: 66, img: obj("lamp"), foot: 2 });
  // NPC и мобы (кадр 0 вида вниз, ступни y=30)
  const unit = (id: string, x: number, y: number) => items.push({ x, y, img: cur(id), foot: 1, shadowRx: 7 });
  unit("guard", 112, 74); unit("merchant", 178, 76);
  unit("canine_wolf", 300, 82); unit("boarfolk_axe", 360, 86); unit("barbarian_axe", 395, 108);
  // герои: сейчас | A | B | C | D — Сольгард с мечом и щитом + Умбрат ж
  const hx0 = 150, step = 44, hy = 128;
  items.push({ x: hx0, y: hy, img: cur("warrior"), foot: 1, shadowRx: 7 });
  items.push({ x: hx0 + 14, y: hy - 4, img: cur("deathknight"), foot: 1, shadowRx: 7 });
  BUILDS.forEach((b, i) => {
    const x = hx0 + step * (i + 1);
    for (const [L, dx, dy] of [[LOOKS[4].l, 0, 0], [LOOKS[3].l, 15, -4]] as [Look, number, number][]) {
      const f = frame(b, L, "down", "idle", 0);
      items.push({ x: x + dx, y: hy + dy, img: f.img, foot: FR - FY - 1, shadowRx: body(b, L).hipW + 3, emis: f.emis });
    }
  });
  items.sort((a, b) => a.y - b.y);
  const c = new PC(SW, SH); c.data.set(g.data);
  const emis: [number, number, RGBA][] = [];
  for (const it of items) {
    const ox = Math.round(it.x - it.img.w / 2), oy = Math.round(it.y - it.img.h + (it.foot ?? 0));
    if (it.shadowRx) shadow(c, it.x, it.y, it.shadowRx, it.shadowRx * 0.38, 85);
    else shadow(c, it.x + 6, it.y - 2, it.img.w * 0.45, 6, 60);
    blit(c, it.img, ox, oy);
    for (const [x, y, col] of it.emis ?? []) emis.push([ox + x, oy + y, col]);
  }
  // подписи под героями
  if (evening) {
    for (let i = 0; i < c.data.length; i += 4) { c.data[i] *= 0.66; c.data[i + 1] *= 0.6; c.data[i + 2] *= 0.8; }
    // фонарь: ореол
    const lx = 335, ly = 66 - 50;
    for (let y = ly - 30; y < ly + 30; y++) for (let x = lx - 30; x < lx + 30; x++) { const d = Math.hypot(x - lx, (y - ly) * 1.2); if (d < 30) c.set(x, y, [255, 190, 110, Math.round(60 * (1 - d / 30) ** 2)]); }
    for (const [x, y, col] of emis) { c.set(x, y, col); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + dx, y + dy, [col[0], col[1], col[2], 70]); }
  }
  const out = new PC(SW * SZ, SH * SZ); blit(out, c, 0, 0, SZ);
  const labels = ["СЕЙЧАС", ...BUILDS.map((b) => RU[b.id])];
  labels.forEach((t, i) => text(out, t, (hx0 + step * i) * SZ - 8, (hy + 6) * SZ, 2, [255, 230, 160, 255]));
  return out;
}
for (const ev of [false, true]) {
  const s = scene(ev);
  blocks.push({ h: s.h + 30, draw: (c, y) => { text(c, ev ? "СЦЕНА · ВЕЧЕР · ЗУМ 2 · ГЕРОИ РЯДОМ С ЖИТЕЛЯМИ, МОБАМИ И ДОМАМИ" : "СЦЕНА · ДЕНЬ · ЗУМ 2 · ГЕРОИ РЯДОМ С ЖИТЕЛЯМИ, МОБАМИ И ДОМАМИ", 20, y, 2); blit(c, s, 20, y + 26); } });
}
// ---------- 4. снимок текущего героя в игре ----------
const ing = path.join(OUT, "current-ДЕНЬ_ЗУМ_3.png");
if (fs.existsSync(ing)) {
  const im = load(ing), im2 = fs.existsSync(path.join(OUT, "current-ДЕНЬ_ЗУМ_2.png")) ? load(path.join(OUT, "current-ДЕНЬ_ЗУМ_2.png")) : null;
  blocks.push({ h: im.h + 30, draw: (c, y) => { text(c, "СЕЙЧАС В ИГРЕ · ЗУМ 3 И 2 · ГОЛОЕ ТЕЛО И СЛОИ СНАРЯЖЕНИЯ · УР 70", 20, y, 2); blit(c, im, 20, y + 26); if (im2) blit(c, im2, 40 + im.w, y + 26); } });
}

// ---------- сборка ----------
function stack(rows: typeof blocks, w: number): PC {
  const H = rows.reduce((s, r) => s + r.h + 16, 16);
  const c = new PC(w, H); fill(c, 0, 0, w, H, BG);
  let y = 16; for (const r of rows) { r.draw(c, y); y += r.h + 16; }
  return c;
}
const totalW = Math.max(W, 40 + SW * SZ, 20 + BUILDS.length * (8 * FR * VK / 1.6 + 30));
stack(blocks, totalW).save(path.join(OUT, "variants.png"));
console.log("→ tools/out/hero/variants.png");

// ---------- листы анимаций ----------
const AK = 2, AVIEWS: (View | "left")[] = ["down", "up", "side", "left"], VN: Record<string, string> = { down: "ВНИЗ", up: "ВВЕРХ", side: "ВБОК", left: "ЗЕРКАЛО" };
for (const b of BUILDS) {
  const fw = FR * AK, lw = 150, gap = 24;
  const sw = lw + (NFR.idle + NFR.walk) * fw + gap + 20;
  const rows: typeof blocks = [{ h: 30, draw: (c, y) => text(c, `ВАРИАНТ ${RU[b.id]} · ${b.name} · ПОКОЙ 10 КАДРОВ · ХОДЬБА 10 КАДРОВ · 12 КАДРОВ В СЕКУНДУ · ×2`, 20, y, 2) }];
  for (const L of LOOKS) for (const v of AVIEWS) rows.push({
    h: fw - 8, draw: (c, y) => {
      text(c, L.name, 10, y + 20, 1); text(c, VN[v], 10, y + 34, 1);
      let x = lw;
      for (const an of ["idle", "walk"] as Anim[]) {
        for (let i = 0; i < NFR[an]; i++) {
          fill(c, x, y - 4, fw - 2, fw - 6, an === "idle" ? [44, 54, 40, 255] : [40, 48, 54, 255]);
          shadow(c, x + 24 * AK, y - 8 + (FY - 1) * AK, 6 * AK, 2 * AK, 70);
          blit(c, frame(b, L.l, v, an, i).img, x, y - 8, AK);
          x += fw;
        }
        x += gap;
      }
    },
  });
  stack(rows, sw).save(path.join(OUT, `anim_${b.id}.png`));
  console.log(`→ tools/out/hero/anim_${b.id}.png`);
}
