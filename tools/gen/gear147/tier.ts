/**
 * Таблица «уровень × редкость» (docs/gear-sets-spec.md «Вид по уровню и редкости»): npx tsx tools/gen/gear147/tier.ts
 * → tools/out/gear147/tier-table.png (латы: кираса и шлем 5×4 иконками + герой вниз; кожа и ткань: кираса 5×4)
 * → tools/out/gear147/tier-table.json (оценка «богатства вида» и проверка правил).
 * Вещи строятся из материалов ступени (data/gear147.json → tiers) и флагов редкости (ниже).
 */
import fs from "node:fs";
import path from "node:path";
import { PC, type RGBA } from "../canvas";
import { text } from "../mobs/lib";
import { FY, frameOf, type Look } from "../hero147/base_b";
import { GD, dress, renderView, type SetDef, type Slot } from "./gear";
import { cell, icon } from "./icons";

const T = GD.tiers, RAR = ["common", "rare", "epic", "legendary"], RN = ["ОБЫЧНАЯ", "РЕДКАЯ", "ЭПИЧЕСКАЯ", "ЛЕГЕНДАРНАЯ"];
const RC: RGBA[] = [[200, 206, 216, 255], [110, 160, 240, 255], [190, 120, 240, 255], [255, 160, 50, 255]];
/** уровень богатства: ступень весит больше редкости (легендарка N ≈ эпик N+1, ступень N+2 богаче любой вещи N) */
const LV = (t: number, r: number) => 2.2 * t + 0.8 * r;
const sc = (t: number, r: number) => 0.58 + 0.065 * t + 0.008 * r; // силуэт растёт со ступенью

// ---------- вещи из ступени и редкости: конструкция растёт с L, редкость даёт свои знаки (ткань и заклёпки → самоцвет и герб → шипы и свечение) ----------
function plateArmor(t: number, r: number) {
  const m = T.plate, L = LV(t, r);
  return { style: "plate", plate: m.base[t], accent: r >= 2 ? (t >= 3 ? m.trim[t] : m.cloth[t]) : m.base[t], trim: r >= 1 || t >= 3 ? m.trim[t] : "leather", cloth: m.cloth[t], mail: "mail", thick: 0.4 + 0.035 * L, tassets: m.base[t],
    rivets: L >= 0.8, kant: L >= 1.6 && r >= 1 ? m.trim[t] : undefined, tabard: r >= 1, chestPlate: L >= 3.0, inlay: r >= 2 && L >= 2.4, crest: r >= 2, gemColor: r === 2 ? "sapphire" : undefined,
    cracks: m.glow[t] ?? (r === 3 ? "chaos_crack" : undefined), spikes: r === 3, spike: "chaos_spike", pauldronsOnIcon: L >= 2.0, iconScale: sc(t, r) };
}
function plateHelm(t: number, r: number) {
  const m = T.plate, L = LV(t, r);
  if (r === 3) return { style: "horned", plate: m.base[t], accent: t >= 3 ? "chaos_red" : m.cloth[t], trim: m.trim[t], horn: "chaos_spike", glow: m.glow[t] ?? "eye_glow", spikes: L >= 5 ? 3 : 1, horns: 0.5 + 0.045 * L, iconScale: sc(t, r) };
  if (L < 1) return { style: "kettle", plate: m.base[t], accent: m.base[t], trim: m.base[t], mail: "mail", iconScale: sc(t, r) };
  return { style: "great", plate: m.base[t], accent: m.base[t], trim: r >= 1 || t >= 3 ? m.trim[t] : m.base[t], slit: true, rivets: L >= 1.6, plume: r >= 1 || L >= 4.4 ? m.cloth[t] : undefined, wings: r >= 2 && L >= 3.8, gem: r >= 2 ? "sapphire" : undefined, engrave: L >= 3.8, iconScale: sc(t, r) };
}
function platePauldrons(t: number, r: number) {
  const m = T.plate, L = LV(t, r);
  return { plate: m.base[t], accent: r >= 2 ? (t >= 3 ? m.trim[t] : m.cloth[t]) : m.base[t], trim: r >= 1 || t >= 3 ? m.trim[t] : m.base[t], size: 0.76 + 0.035 * L, lames: L >= 3 ? 2 : 1, spikes: r === 3 ? (L >= 5 ? 3 : 2) : 0, spike: "chaos_spike", rivets: L >= 0.8, filigree: r >= 2, gem: r === 2 ? "sapphire" : undefined, cracks: m.glow[t] ?? undefined };
}
function leatherCoat(t: number, r: number) {
  const m = T.leather, L = LV(t, r);
  return { style: "coat", leather: m.base[t], plate: m.plate[t], accent: r >= 1 ? m.cloth[t] : m.base[t], trim: m.trim[t], sash: r >= 1 ? m.cloth[t] : "leather_dark", sashTails: r >= 1 && L >= 1.6, strap: L >= 1.6, strapMat: "leather_dark",
    breast: L >= 3.0, crest: r >= 2, gem: r === 2 ? "sapphire" : r === 3 ? "eye_glow" : undefined, cracks: m.glow[t] ?? (r === 3 ? "chaos_crack" : undefined), lacing: L < 3 ? "tan" : undefined, pouch: L < 5 ? "leather_dark" : undefined,
    spikes: r === 3, spike: "chaos_spike", pauldronsOnIcon: L >= 2.0, stitch: "tan", wear: L < 4, iconScale: sc(t, r) };
}
function clothRobe(t: number, r: number) {
  const m = T.cloth, L = LV(t, r);
  return { style: "robe", cloth: m.base[t], trim: r >= 1 || t >= 3 ? m.trim[t] : m.base[t], sash: r >= 1 ? m.cloth[t] : m.base[t], panel: L >= 1.6 ? m.cloth[t] : undefined, embroid: L >= 0.8, hemTrim: L >= 2.4, mantle: L >= 3.0 ? m.cloth[t] : undefined,
    gem: r === 2 ? "sapphire" : r === 3 ? "eye_glow" : undefined, crest: r >= 2, runes: m.glow[t] ?? (r === 3 ? "eye_glow" : undefined), spikes: r === 3, spike: m.trim[t], collar: r >= 1 ? m.trim[t] : m.base[t], sashTails: r >= 2, iconScale: sc(t, r) };
}

// ---------- богатство вида ----------
/** площадь силуэта (px), число деталей (частей), число цветов, свечение (px) → одно число */
function richness(img: PC, parts: number, emis: number) {
  let area = 0; const cols = new Set<number>();
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const q = img.get(x, y); if (!q || !q[3]) continue; area++; cols.add((q[0] << 16) | (q[1] << 8) | q[2]); }
  const score = area / 12 + parts * 0.6 + cols.size * 0.12 + emis * 0.1;
  return { area, parts, colors: cols.size, glow: emis, score: +score.toFixed(1) };
}
type Row = { mat: string; slot: Slot; make: (t: number, r: number) => any };
const ROWS: Row[] = [
  { mat: "ЛАТЫ", slot: "armor", make: plateArmor }, { mat: "ЛАТЫ", slot: "helm", make: plateHelm },
  { mat: "КОЖА", slot: "armor", make: leatherCoat }, { mat: "ТКАНЬ", slot: "armor", make: clothRobe },
];
const res: any = { _doc: "Оценка богатства вида: score = площадь силуэта/12 + детали×0,6 + цвета×0,12 + свечение×0,1 (цвета весят мало: их число раздувает сглаживание). Правила: ступень N+2 богаче любой вещи ступени N (min(N+2) > max(N)); легендарка N не богаче эпика N+1 больше чем на допуск 8 %.", tol: 0.08, rows: [] as any[], fails: [] as string[] };
const icons: PC[][][] = [];
for (const row of ROWS) {
  const grid: any[][] = [], ig: PC[][] = [];
  for (let t = 0; t < 5; t++) {
    grid.push([]); ig.push([]);
    for (let r = 0; r < 4; r++) { const it = row.make(t, r), ic = icon(row.slot, it, "sol"); grid[t].push(richness(ic.img, ic.parts, ic.emis.length)); ig[t].push(cell(ic.img, RAR[r])); }
  }
  icons.push(ig);
  for (let t = 0; t + 2 < 5; t++) { const mx = Math.max(...grid[t].map((g) => g.score)), mn = Math.min(...grid[t + 2].map((g) => g.score)); if (!(mn > mx)) res.fails.push(`${row.mat} ${row.slot}: ступень ${t + 3} (min ${mn}) не богаче ступени ${t + 1} (max ${mx})`); }
  for (let t = 0; t + 1 < 5; t++) { const lg = grid[t][3].score, ep = grid[t + 1][2].score; if (lg > ep * (1 + res.tol)) res.fails.push(`${row.mat} ${row.slot}: легендарка ступени ${t + 1} (${lg}) богаче эпика ступени ${t + 2} (${ep}) больше допуска`); }
  res.rows.push({ mat: row.mat, slot: row.slot, scores: grid.map((g) => g.map((x) => x.score)), detail: grid });
}
fs.writeFileSync(path.resolve("tools/out/gear147/tier-table.json"), JSON.stringify(res, null, 1));

// ---------- лист ----------
const K = 2, cw = 48 * K + 8, lw = 150, blockW = 4 * cw + 30;
const HK = 2, hw = 60 * HK, hh = 66 * HK;
const W = lw + 5 * Math.max(blockW, 4 * hw / 2 + 30) + 40;
const BG: RGBA = [24, 20, 26, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255];
const H = 120 + 40 + ROWS.length * (48 * K + 30) + (60 * K + 30) + 60 + 14 * 10;
const c = new PC(W, H);
for (let i = 0; i < c.data.length; i += 4) { c.data[i] = BG[0]; c.data[i + 1] = BG[1]; c.data[i + 2] = BG[2]; c.data[i + 3] = 255; }
const blit = (s: PC, ox: number, oy: number, k: number) => { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const q = s.get(x, y); if (!q || !q[3]) continue; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) c.set(ox + x * k + a, oy + y * k + b, q); } };
text(c, "ТАБЛИЦА «УРОВЕНЬ × РЕДКОСТЬ» · 5 СТУПЕНЕЙ ПО 20 УР. × 4 РЕДКОСТИ · ЗУМ 2", 20, 14, 3, GOLD);
text(c, res.fails.length ? `ПРОВЕРКА БОГАТСТВА: ${res.fails.length} НАРУШЕНИЙ — СМ. TIER-TABLE.JSON` : "ПРОВЕРКА БОГАТСТВА ПРОЙДЕНА: СТУПЕНЬ N+2 БОГАЧЕ N, ЛЕГЕНДАРКА N ≈ ЭПИК N+1 (ЧИСЛА — ПОД ИКОНКАМИ)", 20, 48, 2, res.fails.length ? [255, 110, 90, 255] : [140, 220, 140, 255]);
let y = 80;
T.levels.forEach((lv: number, t: number) => { text(c, `${lv} УР.`, lw + t * blockW, y, 2, GOLD); text(c, T.names[t].toUpperCase(), lw + t * blockW, y + 18, 1, DIM); });
y += 40;
ROWS.forEach((row, ri) => {
  text(c, `${row.mat}`, 10, y + 20, 2, GOLD); text(c, row.slot === "helm" ? "ШЛЕМ" : "КИРАСА", 10, y + 42, 2, DIM);
  for (let t = 0; t < 5; t++) for (let r = 0; r < 4; r++) {
    const x = lw + t * blockW + r * cw;
    blit(icons[ri][t][r], x, y, K);
    text(c, String(res.rows[ri].scores[t][r]).replace(".", ","), x + 2, y + 48 * K + 4, 1, RC[r]);
  }
  y += 48 * K + 30;
  if (ri === 1) {
    // герой вниз в латах ступени и редкости (шлем, кираса, наплечники)
    text(c, "ГЕРОЙ ВНИЗ · ЗУМ 2", 10, y + 30, 2, DIM);
    for (let t = 0; t < 5; t++) for (let r = 0; r < 4; r++) {
      const set: SetDef = { name: "", rarity: RAR[r], level: T.levels[t], items: { helm: plateHelm(t, r), armor: plateArmor(t, r), pauldrons: t >= 1 ? platePauldrons(t, r) : undefined } as any };
      const L: Look = { fac: "sol", sex: "m", hair: "tousled" }, lk = dress(L, set, "sol"), f = renderView(lk, "down", "idle", 0), fo = frameOf(lk);
      const x0 = lw + t * blockW + r * cw, ox = 26 - (24 + fo.OX), oy = 56 - (FY + fo.OY);
      for (let yy = 0; yy < 60; yy++) for (let xx = 0; xx < 52; xx++) for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) c.set(x0 + xx * K + a - 4, y + yy * K + b, [44, 54, 40, 255]);
      for (let yy = 0; yy < f.img.h; yy++) for (let xx = 0; xx < f.img.w; xx++) { const X = xx + ox, Y = yy + oy; if (X < 2 || Y < 0 || X >= 50 || Y >= 60 || !f.img.has(xx, yy)) continue; const q = f.img.get(xx, yy); for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) c.set(x0 + X * K + a - 4, y + Y * K + b, [q[0], q[1], q[2], 255]); }
    }
    y += 60 * K + 30;
  }
});
RN.forEach((n, r) => text(c, n, lw + r * cw, y, 1, RC[r]));
y += 24;
res.fails.slice(0, 10).forEach((f: string, i: number) => text(c, f.toUpperCase(), 20, y + i * 14, 1, [255, 110, 90, 255]));
c.save(path.resolve("tools/out/gear147/tier-table.png"));
console.log("→ tools/out/gear147/tier-table.png; нарушений:", res.fails.length);
for (const f of res.fails) console.log("  ", f);
