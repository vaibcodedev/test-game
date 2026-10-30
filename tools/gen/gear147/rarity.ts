/**
 * Лестница редкостей латного сета: npx tsx tools/gen/gear147/rarity.ts
 * → tools/out/gear147/rarity-icons.png (главный лист: 7 вещей × 4 редкости, зум 2 и 3, ряд «как в сумке» 1×)
 * → tools/out/gear147/rarity-ladder.png (герои в 4 редкостях: вниз и вбок, день и ночь, зум 3)
 */
import path from "node:path";
import { PC, type RGBA } from "../canvas";
import { P as PAL } from "../palette";
import { text } from "../mobs/lib";
import { FR, FY, frameOf, type Look } from "../hero147/base_b";
import { SLOTS, baseView, dress, renderView, setOf, viewLook, type View4 } from "./gear";
import { renderLayers } from "../hero147/base_b";
import { cell, icon } from "./icons";

const SETS = ["plate60-common", "plate60-rare", "plate60-epic", "chaos-knight"].map((id) => ({ id, set: setOf(id) }));
const RN: Record<string, [string, RGBA]> = { common: ["ОБЫЧНАЯ", [200, 206, 216, 255]], rare: ["РЕДКАЯ", [110, 160, 240, 255]], epic: ["ЭПИЧЕСКАЯ", [190, 120, 240, 255]], legendary: ["ЛЕГЕНДАРНАЯ", [255, 160, 50, 255]] };
const SN: Record<string, string> = { helm: "ШЛЕМ", pauldrons: "НАПЛЕЧНИКИ", armor: "КИРАСА", gloves: "ПЕРЧАТКИ", boots: "САПОГИ", cloak: "СПИНА", weapon: "ОРУЖИЕ" };
const BG: RGBA = [24, 20, 26, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255];
const fill = (c: PC, x: number, y: number, w: number, h: number, col: RGBA) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, col); };
const blit = (d: PC, s: PC, ox: number, oy: number, k = 1, x0 = 0, y0 = 0, w = s.w, h = s.h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const c = s.get(x, y); if (!c || !c[3]) continue; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) d.set(ox + (x - x0) * k + a, oy + (y - y0) * k + b, c); } };
const icons = SETS.map(({ set }) => SLOTS.map((s) => cell(icon(s, set.items[s]).img, set.rarity)));

// ---------- иконки ----------
{
  const lw = 190, K2 = 2, K3 = 3, gap = 10;
  const w = lw + SLOTS.length * (48 * K3 + gap) + 20;
  const hBag = 30 + 2 * 52 + 20, h2 = 30 + 4 * (48 * K2 + gap), h3 = 30 + 4 * (48 * K3 + gap);
  const H = 90 + hBag + h3 + h2 + 40;
  const c = new PC(w, H); fill(c, 0, 0, w, H, BG);
  text(c, "ЛЕСТНИЦА РЕДКОСТЕЙ · ЛАТЫ · 7 ВЕЩЕЙ × 4 РЕДКОСТИ", 20, 16, 3, GOLD);
  text(c, "РЕДКОСТЬ — РАМКА, ФОН И ПОДСВЕТКА ЯЧЕЙКИ; ВЕЩЬ БОГАЧЕ С КАЖДОЙ СТУПЕНЬЮ: КАНТ, ЗАКЛЁПКИ, ТКАНЬ → ГРАВИРОВКА, САМОЦВЕТ, ГЕРБ → ШИПЫ, ИНКРУСТАЦИЯ, СВЕЧЕНИЕ", 20, 50, 1, DIM);
  let y = 76;
  // сумка 1×: все 28 иконок в ряд ячеек, как в игре
  text(c, "В СУМКЕ · 1×", 20, y, 2, GOLD); y += 26;
  fill(c, 16, y - 4, 14 * 50 + 8, 2 * 52 + 6, [40, 34, 30, 255]);
  SETS.forEach((_, r) => SLOTS.forEach((_, i) => { const n = r * 7 + i; blit(c, icons[r][i], 20 + (n % 14) * 50, y + Math.floor(n / 14) * 52); }));
  y += 2 * 52 + 26;
  for (const [K, title] of [[K3, "ЗУМ 3"], [K2, "ЗУМ 2"]] as [number, string][]) {
    text(c, title, 20, y, 2, GOLD);
    SLOTS.forEach((s, i) => text(c, SN[s], lw + i * (48 * K3 + gap), y, 2, DIM));
    y += 26;
    SETS.forEach(({ set }, r) => {
      text(c, RN[set.rarity][0], 20, y + (48 * K) / 2 - 8, 2, RN[set.rarity][1]);
      text(c, set.name.toUpperCase(), 20, y + (48 * K) / 2 + 12, 1, DIM);
      SLOTS.forEach((_, i) => blit(c, icons[r][i], lw + i * (48 * K3 + gap), y, K));
      y += 48 * K + gap;
    });
    y += 20;
  }
  c.save(path.resolve("tools/out/gear147/rarity-icons.png"));
}

// ---------- герои ----------
{
  const L: Look = { fac: "sol", sex: "m", hair: "tousled" }, K = 3, WW = 60, WH = 70, FX = 30, FYW = 64, cw = WW * K;
  const views: View4[] = ["down", "side"];
  const ground = (w: number, h: number, seed: number) => {
    const g = new PC(w, h), gr = PAL.grass, n = (x: number, y: number) => { const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.7) * 43758.5453; return s - Math.floor(s); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = n(x >> 2, y >> 2) * 0.5 + n(x, y) * 0.5; g.set(x, y, gr[v < 0.3 ? 0 : v < 0.55 ? 1 : v < 0.8 ? 2 : 3]); }
    return g;
  };
  const w = 40 + SETS.length * (views.length * cw + 20), rowH = WH * K + 40, H = 70 + 3 * rowH;
  const c = new PC(w, H); fill(c, 0, 0, w, H, BG);
  text(c, "ГЕРОИ В 4 РЕДКОСТЯХ · ЗУМ 3 · ДЕНЬ | НОЧЬ", 20, 16, 3, GOLD);
  for (const night of [false, true]) {
    const y0 = 60 + (night ? rowH : 0);
    SETS.forEach(({ set }, r) => {
      const x0 = 20 + r * (views.length * cw + 20);
      if (!night) text(c, RN[set.rarity][0], x0, y0, 2, RN[set.rarity][1]);
      views.forEach((v, j) => {
        const pc = new PC(WW, WH), g = ground(WW, WH, r * 7 + j);
        pc.data.set(g.data);
        for (let yy = 0; yy < WH; yy++) for (let xx = 0; xx < WW; xx++) { const dx = (xx + 0.5 - FX) / 7, dy = (yy + 0.5 - FYW) / 2.4; if (dx * dx + dy * dy <= 1) pc.set(xx, yy, [14, 10, 18, 110]); }
        const lk = dress(L, set, "sol"), f = renderView(lk, v, "idle", 0), fo = frameOf(lk), ox = FX - (24 + fo.OX), oy = FYW - (FY + fo.OY);
        for (let yy = 0; yy < f.img.h; yy++) for (let xx = 0; xx < f.img.w; xx++) if (f.img.has(xx, yy)) { const q = f.img.get(xx, yy); pc.set(xx + ox, yy + oy, [q[0], q[1], q[2], 255]); }
        if (night) {
          for (let i = 0; i < pc.data.length; i += 4) { pc.data[i] *= 0.34; pc.data[i + 1] *= 0.36; pc.data[i + 2] *= 0.56; }
          for (const [x, y, col] of f.emis) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pc.set(x + ox + dx, y + oy + dy, [col[0], Math.round(col[1] * 0.6), Math.round(col[2] * 0.5), 110]); pc.set(x + ox, y + oy, [col[0], col[1], col[2], 255]); }
        }
        blit(c, pc, x0 + j * cw, y0 + 24, K);
      });
    });
  }
  // кадр «силуэт оружия»: тело серым, оружие жёлтым
  const ys = 60 + 2 * rowH;
  text(c, "СИЛУЭТ ОРУЖИЯ: ТЕЛО И ЛАТЫ — СЕРЫМ, ОРУЖИЕ — ЖЁЛТЫМ", 20, ys - 4, 2, GOLD);
  SETS.forEach(({ set }, r) => views.forEach((v, j) => {
    const lk = dress(L, set, "sol"), fo = frameOf(lk), ox = FX - (24 + fo.OX), oy = FYW - (FY + fo.OY);
    const [all, wp] = renderLayers(viewLook(lk, v), baseView(v), "idle", 0, [() => true, (p) => p.slot === "weapon"]);
    const x0 = 20 + r * (views.length * cw + 20) + j * cw, y0 = ys + 24;
    for (let yy = 0; yy < WH; yy++) for (let xx = 0; xx < WW; xx++) for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) c.set(x0 + xx * K + a, y0 + yy * K + b, [44, 54, 40, 255]);
    for (let yy = 0; yy < all.img.h; yy++) for (let xx = 0; xx < all.img.w; xx++) { const X = xx + ox, Y = yy + oy; if (X < 0 || Y < 0 || X >= WW || Y >= WH || !all.img.has(xx, yy)) continue; const col: [number, number, number, number] = wp.img.has(xx, yy) ? [255, 220, 60, 255] : [110, 110, 118, 255]; for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) c.set(x0 + X * K + a, y0 + Y * K + b, col); }
  }));
  c.save(path.resolve("tools/out/gear147/rarity-ladder.png"));
}
console.log("→ tools/out/gear147/rarity-icons.png, rarity-ladder.png");
void FR;
