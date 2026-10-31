/**
 * ПРОБА (в игру не встроено до подтверждения владельца, 2026-10-31): заточка «ступени + рост внутри» и «свечение контрастно к оружию».
 * Ступени +5 «Тление», +8 «Угли», +11 «Пламя» остаются; внутри каждой ступени каждый +1 — заметный шаг (альфа, толщина, угольки, частота блика,
 * на +11…+15 — размах перелива и искры). Цвет контура — по средней яркости и оттенку пикселей оружия (shared/gearFx.ts enchantContrast),
 * тёмная прослойка 1 px между оружием и контуром. Числа — data/gear-fx.json → enchantB.steps / enchantB.contrast.
 *
 * npx tsx tools/gen/enchant-fx/steps.ts →
 *   tools/out/gear147/enchant-steps/strip.png      — 5 клинков × +0…+15, день и ночь (зум 2)
 *   tools/out/gear147/enchant-contrast.png         — 5 клинков × +5/+8/+11/+15: «сейчас в игре | с контрастом», день и ночь (зум 3)
 *   tools/out/gear147/enchant-steps/index.html     — живая страница: анимация, выбор оружия, уровня, вида, зум 2/3, день/ночь
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, type RGBA } from "../canvas";
import { text } from "../mobs/lib";
import { NF, renderLayers, type AnimId } from "../hero147/base_b";
import { baseView, dress, setOf, viewLook, type View4 } from "../gear147/gear";
import { ENCHANT_B, enchantContrast, lum01 } from "../../../shared/gearFx";

const OUT = path.resolve("tools/out/gear147/enchant-steps");
fs.mkdirSync(OUT, { recursive: true });
const WEAPONS = [
  { set: "chaos-knight", name: "Пылающий клинок Хаоса (легенд.)" },
  { set: "recruit-plate", name: "Железный двуручник новобранца" },
  { set: "plate60-epic", name: "Фламберг клятвы (эпик)" },
  { set: "plate60-rare", name: "Секира капитана (редкая)" },
  { set: "rogue-chaos", name: "Клыки Хаоса — тёмные кинжалы" },
];
const LOOK0 = { fac: "sol" as const, sex: "m" as const, hair: "tousled" };
const ST = ENCHANT_B.steps, TIERS = ENCHANT_B.tiers as any[];

// ---------------- рендер эффекта: одна функция для PNG (node) и страницы (её текст встраивается в index.html) ----------------
export interface FxLook { tier: number; color: string; color2?: string; core?: string; gap: string; gapAlpha: number; alpha: number; alphaMin?: number; alphaMax?: number; periodMs?: number;
  width: number; embers: number; emberMs: number; shineMs: number; cycleMs: number; swing: number; sparks: number; haloNight: number; useGap: boolean }
/** base, mask (1 — видимое оружие), emis (1 — светится ночью): кадр W×H; t — мс; night 0..1; out — RGBA результата. Без внешних ссылок (встраивается в страницу). */
export function fxFrame(base: Uint8ClampedArray, mask: Uint8Array, emis: Uint8Array, W: number, H: number, L: FxLook | null, t: number, night: number, out: Uint8ClampedArray) {
  const hx = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
  const hash = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // фон кадра: день — как есть; ночь — затемнение с синим, светящееся (emis) остаётся ярким
  for (let q = 0; q < W * H; q++) {
    const o = q * 4, a = base[o + 3];
    if (!a) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
    const k = emis[q] ? 1 : 1 - night * 0.62;
    out[o] = base[o] * k * (emis[q] ? 1 : 1 - night * 0.12); out[o + 1] = base[o + 1] * k * (emis[q] ? 1 : 1 - night * 0.06); out[o + 2] = base[o + 2] * k; out[o + 3] = a;
  }
  if (!L) return;
  // расстояние до силуэта оружия (4-связность), до 5 px
  const D = new Uint8Array(W * H).fill(99);
  let front: number[] = [];
  for (let q = 0; q < W * H; q++) if (mask[q] === 1) { D[q] = 0; front.push(q); }
  for (let d = 1; d <= 5 && front.length; d++) {
    const nx: number[] = [];
    for (const q of front) { const x = q % W, y = (q / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const p = yy * W + xx; if (D[p] > d) { D[p] = d; nx.push(p); } } }
    front = nx;
  }
  const blend = (q: number, c: number[], a: number, add = false) => {
    const o = q * 4; if (a <= 0) return;
    if (add) { out[o] = Math.min(255, out[o] + c[0] * a); out[o + 1] = Math.min(255, out[o + 1] + c[1] * a); out[o + 2] = Math.min(255, out[o + 2] + c[2] * a); out[o + 3] = Math.max(out[o + 3], Math.round(255 * Math.min(1, a))); return; }
    const da = out[o + 3] / 255, na = a + da * (1 - a);
    for (let k = 0; k < 3; k++) out[o + k] = (c[k] * a + out[o + k] * da * (1 - a)) / (na || 1);
    out[o + 3] = na * 255;
  };
  const c1 = hx(L.color), c2 = hx(L.color2 ?? L.color), core = hx(L.core ?? "#fff2c0"), gap = hx(L.gap);
  // цвет и альфа контура по ступени
  let col = c1, al = L.alpha;
  if (L.tier === 1) al = (L.alphaMin ?? 0.3) + ((L.alphaMax ?? 0.6) - (L.alphaMin ?? 0.3)) * ease(t / (L.periodMs ?? 2400));
  if (L.tier === 2) al = L.alpha * (0.85 + 0.15 * ease(t / 2400));
  // перелив «Пламени»: волна алый↔золото бежит вдоль оружия (по y и x), размах swing растёт с плюсом
  const flow = (q: number) => { const x = q % W, y = (q / W) | 0, m = 0.5 + 0.5 * L.swing * Math.sin(2 * Math.PI * (t / Math.max(1, L.cycleMs)) + (x + y) * 0.35); return c1.map((v, k) => v + (c2[k] - v) * m); };
  if (night > 0) al = Math.min(1, al + 0.15 * night);
  const ring: number[] = [];
  for (let q = 0; q < W * H; q++) {
    const d = mask[q] === 2 ? 99 : D[q]; // пальцы на рукояти (2): контур обходит кисть
    if (d === 1 && L.useGap) blend(q, gap, L.gapAlpha);
    const lo = L.useGap ? 2 : 1, hi = lo + L.width - 1;
    if (d >= lo && d <= hi) { blend(q, L.tier === 3 && L.useGap ? flow(q) : L.tier === 3 ? c1.map((v, k) => v + (c2[k] - v) * ease(t / Math.max(1, L.cycleMs))) : col, Math.min(1, al * (d === hi && L.width > 1 ? 0.55 : 1))); ring.push(q); }
    if (d === hi + 1 && L.tier === 3 && night > 0) blend(q, c2, L.haloNight * night * (0.8 + 0.2 * ease(t / Math.max(1, L.cycleMs))), true);
  }
  if (!ring.length) return;
  // бегущий блик по контуру сверху вниз за 450 мс раз в shineMs
  if (L.shineMs > 0) {
    const ph = (t % L.shineMs) / 450;
    if (ph < 1) { const y0 = Math.round(-4 + (H * 0.75 + 4) * (ph * ph * (3 - 2 * ph))); for (const q of ring) { const y = (q / W) | 0; if (y >= y0 && y < y0 + 4) blend(q, core, 0.9, true); } }
  }
  // угольки (поднимаются и гаснут) и искры (быстрее, выше, ярче) — без состояния: фаза от времени
  const parts = (n: number, life: number, rise: number, bright: number, salt: number) => {
    for (let j = 0; j < n; j++) {
      const f = t / life + j / n, cyc = Math.floor(f), ph = f - cyc, h1 = hash(cyc * 7 + salt, j), h2 = hash(cyc * 13 + salt, j + 31);
      const q0 = ring[Math.floor(h1 * ring.length)], x = (q0 % W) + (h2 - 0.5) * 3 * ph, y = ((q0 / W) | 0) - (rise + 3 * h2) * ph;
      const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
      const c = c1.map((v, k) => v + (c2[k] - v) * h2), a = (1 - ph) * bright;
      blend(yi * W + xi, bright > 1 ? core : c, Math.min(1, a), true);
    }
  };
  if (L.embers) parts(L.embers, L.emberMs, 5, 1, 1);
  if (L.sparks) parts(L.sparks, L.emberMs * 0.55, 9, 1.2, 2);
}

/** Вид заточки на уровне plus для оружия со средним цветом avg: прежний («сейчас в игре», без контраста и роста) или проба. */
export function lookAt(plus: number, avg: number[] | null, proba: boolean): FxLook | null {
  let tier = 0; for (const th of ENCHANT_B.thresholds) if (plus >= th) tier++;
  if (!tier) return null;
  const T = TIERS[tier], k = plus - ENCHANT_B.thresholds[tier - 1];
  if (!proba) return { tier, color: T.color, color2: T.color2, core: T.core, gap: "#000000", gapAlpha: 0, alpha: T.alpha ?? 0.6, alphaMin: T.alphaMin, alphaMax: T.alphaMax, periodMs: T.periodMs, width: 1, embers: T.embers ?? 0, emberMs: T.emberMs ?? 900, shineMs: T.shineMs ?? 0, cycleMs: T.cycleMs ?? 1800, swing: 1, sparks: 0, haloNight: T.haloNight ?? 0, useGap: false };
  const c = enchantContrast(tier as 1 | 2 | 3, plus, avg), up = ST.alphaStep * k;
  return { tier, color: c.color, color2: c.color2, core: c.core, gap: c.gap, gapAlpha: c.gapAlpha, alpha: Math.min(1, Math.max(T.alpha ?? 0.6, ST.alphaFloor[tier - 1]) + up), alphaMin: tier === 1 ? ST.alphaFloor[0] + up : undefined, alphaMax: tier === 1 ? Math.min(1, ST.alphaFloor[0] + 0.25 + up) : undefined, periodMs: T.periodMs,
    width: ST.width[plus], embers: ST.embers[plus], emberMs: T.emberMs ?? 900, shineMs: ST.shineMs[plus], cycleMs: ST.cycleMs[plus] || 1800, swing: ST.swing[plus], sparks: ST.sparks[plus], haloNight: Math.min(0.3, (T.haloNight ?? 0) * 0.7 + ST.haloK * k), useGap: true };
}

// ---------------- кадры героя с оружием ----------------
interface Strip { W: number; H: number; n: number; fps: number; base: Uint8ClampedArray[]; mask: Uint8Array[]; emis: Uint8Array[] }
function strip(setId: string, v: View4, a: AnimId): Strip {
  const set = setOf(setId), l = dress(LOOK0, set, "sol"), n = NF(a);
  const base: Uint8ClampedArray[] = [], mask: Uint8Array[] = [], emis: Uint8Array[] = [];
  let W = 0, H = 0;
  for (let i = 0; i < n; i++) {
    const [full, wp, fs] = renderLayers(viewLook(l, v), baseView(v), a, i, [() => true, (p) => p.slot === "weapon" && !/^w_(fist|fistL|thumb)$/.test(p.g), (p) => /^w_(fist|fistL|thumb)$/.test(p.g)]);
    W = full.img.w; H = full.img.h;
    const b = new Uint8ClampedArray(W * H * 4), m = new Uint8Array(W * H), e = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!full.img.has(x, y)) continue;
      const q = full.img.get(x, y), o = (y * W + x) * 4; b[o] = q[0]; b[o + 1] = q[1]; b[o + 2] = q[2]; b[o + 3] = 255;
      // видимое оружие: пиксель оружия, не закрытый слоями выше (цвет совпадает)
      if (wp.img.has(x, y) && wp.img.get(x, y).join() === q.join()) m[y * W + x] = 1;
      else if (fs.img.has(x, y) && fs.img.get(x, y).join() === q.join()) m[y * W + x] = 2;
    }
    for (const [x, y] of full.emis) e[y * W + x] = 1;
    base.push(b); mask.push(m); emis.push(e);
  }
  return { W, H, n, fps: 12, base, mask, emis };
}
/** средний цвет видимого оружия (без тёмной обводки) по всем кадрам */
function avgOf(s: Strip): number[] {
  const acc = [0, 0, 0]; let n = 0;
  s.mask.forEach((m, i) => { for (let q = 0; q < m.length; q++) if (m[q]) { const o = q * 4, c = [s.base[i][o], s.base[i][o + 1], s.base[i][o + 2]]; if (m[q] !== 1 || lum01(c) < ENCHANT_B.contrast.ignoreLum) continue; acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; n++; } });
  return n ? acc.map((x) => x / n) : [128, 128, 128];
}
const atkOf = (setId: string): AnimId => (setOf(setId).items.weapon?.kind === "great" ? "atk2h" : "atk1h");

// ---------------- монтажи ----------------
const BG: RGBA = [24, 20, 26, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255];
const GRASS: RGBA = [62, 84, 52, 255], GRASSN: RGBA = [20, 28, 36, 255];
function put(c: PC, fr: Uint8ClampedArray, W: number, H: number, ox: number, oy: number, K: number, crop: number[], bg: RGBA) {
  const [x0, y0, x1, y1] = crop;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const o = (y * W + x) * 4, a = fr[o + 3] / 255, col: RGBA = a ? [Math.round(fr[o] * a + bg[0] * (1 - a)), Math.round(fr[o + 1] * a + bg[1] * (1 - a)), Math.round(fr[o + 2] * a + bg[2] * (1 - a)), 255] : bg;
    for (let p = 0; p < K; p++) for (let q = 0; q < K; q++) c.set(ox + (x - x0) * K + p, oy + (y - y0) * K + q, col);
  }
}
function cropOf(s: Strip, fi: number): number[] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const b = s.base[fi];
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) if (b[(y * s.W + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [Math.max(0, x0 - 6), Math.max(0, y0 - 9), Math.min(s.W - 1, x1 + 6), Math.min(s.H - 1, y1 + 3)];
}

const data = WEAPONS.map((w) => {
  const idle = strip(w.set, "down", "idle"), side = strip(w.set, "side", "idle"), atk = strip(w.set, "side", atkOf(w.set));
  return { ...w, idle, side, atk, avg: avgOf(idle) };
});
for (const d of data) console.log(`${d.set}: средний цвет оружия ${d.avg.map(Math.round).join(",")} lum ${lum01(d.avg).toFixed(2)} → ${enchantContrast(1, 5, d.avg).kind}`);

// strip.png: 5 клинков × +0…+15; день, затем ночь
{
  const K = 2, T = 900, fi = 3;
  const crops = data.map((d) => cropOf(d.idle, fi)), cw = Math.max(...crops.map((c) => c[2] - c[0] + 1)) * K + 6, ch = crops.map((c) => (c[3] - c[1] + 1) * K + 22);
  const lw = 210, out = new PC(lw + 16 * cw + 10, 60 + 2 * (ch.reduce((a, b) => a + b, 0) + 30));
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255; }
  text(out, "ПРОБА: ЗАТОЧКА +0…+15 · СТУПЕНИ +5 +8 +11 И РОСТ ВНУТРИ · КОНТРАСТ К ОРУЖИЮ · ЗУМ 2", 10, 10, 2, GOLD);
  let y = 44;
  for (const night of [0, 1]) {
    text(out, night ? "НОЧЬ" : "ДЕНЬ", 10, y, 2, GOLD); y += 26;
    data.forEach((d, r) => {
      text(out, d.name.toUpperCase().slice(0, 26), 6, y + 20, 1, DIM);
      for (let p = 0; p <= 15; p++) {
        const fr = new Uint8ClampedArray(d.idle.W * d.idle.H * 4);
        fxFrame(d.idle.base[fi], d.idle.mask[fi], d.idle.emis[fi], d.idle.W, d.idle.H, lookAt(p, d.avg, true), T, night, fr);
        if (r === 0) text(out, `+${p}`, lw + p * cw + 4, y - 12, 1, p >= 11 ? [255, 120, 80, 255] : p >= 8 ? [240, 190, 70, 255] : p >= 5 ? [216, 140, 70, 255] : DIM);
        put(out, fr, d.idle.W, d.idle.H, lw + p * cw, y, K, crops[r], night ? GRASSN : GRASS);
      }
      y += ch[r];
    });
    y += 4;
  }
  out.save(path.join(OUT, "strip.png"));
}
// enchant-contrast.png: +5/+8/+11/+15 × «сейчас | контраст», день и ночь
{
  const K = 3, T = 900, fi = 3, PL = [5, 8, 11, 15];
  const crops = data.map((d) => cropOf(d.idle, fi)), cw = Math.max(...crops.map((c) => c[2] - c[0] + 1)) * K + 4, ch = crops.map((c) => (c[3] - c[1] + 1) * K + 16);
  const lw = 210, gw = 2 * cw + 14, out = new PC(lw + PL.length * gw * 2 + 30, 70 + ch.reduce((a, b) => a + b, 0) + 20);
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255; }
  text(out, "СВЕЧЕНИЕ КОНТРАСТНО К ОРУЖИЮ · В КАЖДОЙ ПАРЕ: СЕЙЧАС В ИГРЕ | ПРОБА · СЛЕВА ДЕНЬ, СПРАВА НОЧЬ · ЗУМ 3", 10, 10, 2, GOLD);
  let y = 60;
  data.forEach((d, r) => {
    text(out, d.name.toUpperCase().slice(0, 26), 6, y + 30, 1, DIM);
    text(out, `ЦВЕТ ОРУЖИЯ: ${({ dark: "ТЁМНОЕ", red: "КРАСНОЕ", light: "СВЕТЛАЯ СТАЛЬ", mid: "СРЕДНЕЕ" } as Record<string, string>)[enchantContrast(1, 5, d.avg).kind]}`, 6, y + 44, 1, DIM);
    [0, 1].forEach((night) => PL.forEach((p, j) => {
      const x = lw + night * (PL.length * gw + 16) + j * gw;
      if (r === 0) text(out, `+${p}${night ? " НОЧЬ" : ""}`, x + 4, y - 14, 1, GOLD);
      [false, true].forEach((pr, k) => {
        const fr = new Uint8ClampedArray(d.idle.W * d.idle.H * 4);
        fxFrame(d.idle.base[fi], d.idle.mask[fi], d.idle.emis[fi], d.idle.W, d.idle.H, lookAt(p, d.avg, pr), T, night, fr);
        put(out, fr, d.idle.W, d.idle.H, x + k * cw, y, K, crops[r], night ? GRASSN : GRASS);
      });
    }));
    y += ch[r];
  });
  out.save(path.resolve("tools/out/gear147/enchant-contrast.png"));
}

// index.html — живая страница: кадры героя (PNG data URI), маски и вид заточки на каждом уровне (обе версии) считаются заранее; эффект рисует та же fxFrame
{
  const uri = (s: Strip, ch: "base" | "mask" | "emis") => {
    const png = new PNG({ width: s.W * s.n, height: s.H });
    for (let i = 0; i < s.n; i++) for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
      const o = ((y * s.W * s.n) + i * s.W + x) * 4, q = y * s.W + x;
      if (ch === "base") { const b = s.base[i]; png.data[o] = b[q * 4]; png.data[o + 1] = b[q * 4 + 1]; png.data[o + 2] = b[q * 4 + 2]; png.data[o + 3] = b[q * 4 + 3]; }
      else { const m = (ch === "mask" ? s.mask : s.emis)[i][q]; png.data[o] = png.data[o + 1] = png.data[o + 2] = 255; png.data[o + 3] = m === 2 ? 128 : m ? 255 : 0; }
    }
    return "data:image/png;base64," + PNG.sync.write(png).toString("base64");
  };
  const pack = (s: Strip) => ({ W: s.W, H: s.H, n: s.n, base: uri(s, "base"), mask: uri(s, "mask"), emis: uri(s, "emis") });
  const W = data.map((d) => ({ set: d.set, name: d.name, kind: enchantContrast(1, 5, d.avg).kind, anims: { "вниз · покой": pack(d.idle), "вбок · покой": pack(d.side), "вбок · удар": pack(d.atk) },
    looks: { proba: Array.from({ length: 16 }, (_, p) => lookAt(p, d.avg, true)), now: Array.from({ length: 16 }, (_, p) => lookAt(p, d.avg, false)) } }));
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Заточка: проба ступеней</title>
<style>
:root{--bg:#18141a;--fg:#e8e2d0;--dim:#a89c8a;--gold:#ffd864;--panel:#241e28}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif;padding:16px}
h1{font-size:18px;color:var(--gold);margin:0 0 4px}p{color:var(--dim);margin:0 0 12px;max-width:900px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
button{background:var(--panel);color:var(--fg);border:1px solid #4a4050;border-radius:4px;padding:4px 8px;cursor:pointer;font:inherit}
button[aria-pressed=true]{border-color:var(--gold);color:var(--gold)}
.lv button{min-width:38px}.lv button.t1{color:#d8853a}.lv button.t2{color:#f0c040}.lv button.t3{color:#ff5a36}
.stage{display:flex;gap:24px;flex-wrap:wrap}.stage figure{margin:0}.stage figcaption{color:var(--dim);font-size:12px;margin-top:4px}
canvas{image-rendering:pixelated;display:block;border-radius:4px}
.info{font-size:12px;color:var(--dim);margin-top:8px;white-space:pre-line}
</style></head><body>
<h1>Заточка героя Б — проба «ступени + рост внутри»</h1>
<p>Ступени: +5 «Тление», +8 «Угли», +11 «Пламя Предела». Внутри ступени каждый +1 ярче (альфа, светлее), с +13 контур в 2 px, больше угольков, чаще бегущий блик; на +11…+15 — сильнее перелив и искры. Цвет контура — по среднему цвету оружия (тёмное и красное — светлее, светлая сталь — насыщеннее), между оружием и контуром тёмная прослойка 1 px. Слева — как сейчас в игре, справа — проба. В игру не встроено.</p>
<div class="bar" id="wp"></div><div class="bar" id="an"></div><div class="bar lv" id="lv"></div>
<div class="bar"><button id="zm">Зум 3</button><button id="nt">Ночь</button><button id="pz">Пауза</button></div>
<div class="stage"><figure><canvas id="c0"></canvas><figcaption>сейчас в игре</figcaption></figure><figure><canvas id="c1"></canvas><figcaption>проба</figcaption></figure></div>
<div class="info" id="info"></div>
<script>
const __name=(f)=>f;const W=${JSON.stringify(W)};
${fxFrame.toString()}
const st={w:0,a:Object.keys(W[0].anims)[0],p:11,z:2,night:0,pause:false,t0:performance.now()};
const cache=new Map();
function load(src){return new Promise(r=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);r(g.getImageData(0,0,im.width,im.height).data)};im.src=src})}
async function anim(w,a){const k=w+'|'+a;if(cache.has(k))return cache.get(k);const A=W[w].anims[a];const [b,m,e]=await Promise.all([load(A.base),load(A.mask),load(A.emis)]);
 const fr=[];for(let i=0;i<A.n;i++){const base=new Uint8ClampedArray(A.W*A.H*4),mask=new Uint8Array(A.W*A.H),emis=new Uint8Array(A.W*A.H);
 for(let y=0;y<A.H;y++)for(let x=0;x<A.W;x++){const o=(y*A.W*A.n+i*A.W+x)*4,q=y*A.W+x;base[q*4]=b[o];base[q*4+1]=b[o+1];base[q*4+2]=b[o+2];base[q*4+3]=b[o+3];mask[q]=m[o+3]>200?1:m[o+3]>0?2:0;emis[q]=e[o+3]>0?1:0}
 fr.push({base,mask,emis})}const r={A,fr};cache.set(k,r);return r}
function btns(id,items,cur,on){const el=document.getElementById(id);el.innerHTML='';items.forEach(([v,label,cls])=>{const b=document.createElement('button');b.textContent=label;if(cls)b.className=cls;b.setAttribute('aria-pressed',String(v===cur));b.onclick=()=>{on(v);ui()};el.append(b)})}
function ui(){btns('wp',W.map((w,i)=>[i,w.name]),st.w,v=>st.w=v);btns('an',Object.keys(W[st.w].anims).map(a=>[a,a]),st.a,v=>st.a=v);
 btns('lv',Array.from({length:16},(_,p)=>[p,'+'+p,p>=11?'t3':p>=8?'t2':p>=5?'t1':'']),st.p,v=>st.p=v);
 document.getElementById('zm').textContent='Зум '+(st.z===2?3:2);document.getElementById('nt').textContent=st.night?'День':'Ночь';
 const L=W[st.w].looks.proba[st.p];document.getElementById('info').textContent='Оружие: '+({dark:'тёмное',red:'красное',light:'светлая сталь',mid:'среднее'})[W[st.w].kind]+(L?'\\nПроба +'+st.p+': контур '+L.color+(L.color2?' ↔ '+L.color2:'')+', толщина '+L.width+' px, угольков '+L.embers+', искр '+L.sparks+(L.shineMs?', блик раз в '+L.shineMs+' мс':'')+(L.tier===3?', перелив '+L.cycleMs+' мс, размах '+L.swing:''):'\\nБез свечения (до +5)')}
document.getElementById('zm').onclick=()=>{st.z=st.z===2?3:2;ui()};document.getElementById('nt').onclick=()=>{st.night=st.night?0:1;ui()};document.getElementById('pz').onclick=()=>{st.pause=!st.pause;document.getElementById('pz').textContent=st.pause?'Пуск':'Пауза'};
let tp=0;
async function loop(now){const t=st.pause?tp:now-st.t0;tp=t;const {A,fr}=await anim(st.w,st.a);const i=Math.floor(t/1000*12)%A.n,f=fr[i];
 [['c0','now'],['c1','proba']].forEach(([id,v])=>{const c=document.getElementById(id);const out=new Uint8ClampedArray(A.W*A.H*4);fxFrame(f.base,f.mask,f.emis,A.W,A.H,W[st.w].looks[v][st.p],t,st.night,out);
  const tmp=document.createElement('canvas');tmp.width=A.W;tmp.height=A.H;tmp.getContext('2d').putImageData(new ImageData(out,A.W,A.H),0,0);
  c.width=A.W*st.z;c.height=A.H*st.z;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.fillStyle=st.night?'#141c24':'#3e5434';g.fillRect(0,0,c.width,c.height);g.drawImage(tmp,0,0,c.width,c.height)});
 requestAnimationFrame(loop)}
ui();requestAnimationFrame(loop);
</script></body></html>`;
  fs.writeFileSync(path.join(OUT, "index.html"), html);
}
console.log("→ tools/out/gear147/enchant-steps/strip.png, index.html; tools/out/gear147/enchant-contrast.png");
