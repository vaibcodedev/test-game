/**
 * Таблица «уровень × редкость» (docs/art/gear.md «Вид по уровню и редкости»): npx tsx tools/gen/gear147/tier.ts
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
import { cell } from "./icons";
import { clothRobe, leatherCoat, plateArmor, plateHelm, platePauldrons } from "./tiers";
import { CIOU, CSIM, SIM, richFormula, richness, similar } from "./tiermetric";
export { iou, colorSim } from "./tiermetric";

const T = GD.tiers, RAR = ["common", "rare", "epic", "legendary"], RN = ["ОБЫЧНАЯ", "РЕДКАЯ", "ЭПИЧЕСКАЯ", "ЛЕГЕНДАРНАЯ"];
const RC: RGBA[] = [[200, 206, 216, 255], [110, 160, 240, 255], [190, 120, 240, 255], [255, 160, 50, 255]];

// ---------- богатство вида и сходство — tiermetric.ts ----------
type Row = { mat: string; slot: Slot; make: (t: number, r: number) => any };
const ROWS: Row[] = [
  { mat: "ЛАТЫ", slot: "armor", make: plateArmor }, { mat: "ЛАТЫ", slot: "helm", make: plateHelm },
  { mat: "ЛАТЫ", slot: "pauldrons", make: platePauldrons }, { mat: "КОЖА", slot: "armor", make: leatherCoat }, { mat: "ТКАНЬ", slot: "armor", make: clothRobe },
];
const res: any = { _doc: "Оценка богатства вида (иконки одного размера — размер силуэта берётся с героя): " + richFormula + ". Сходство: IoU масок иконок одного слота и ступени — не выше simThreshold (разные редкости — разные сеты). Правила: ступень N+2 богаче любой вещи ступени N (min(N+2) > max(N)); легендарка N не богаче эпика N+1 больше чем на допуск 8 %.", tol: 0.08, rows: [] as any[], fails: [] as string[] };
res.simThreshold = SIM; res.colorRule = `IoU > ${SIM} или (IoU > ${CIOU} и цвет > ${CSIM})`; res.similarity = [];
const icons: PC[][][] = [];
for (const row of ROWS) {
  const grid: any[][] = [], ig: PC[][] = [], rawT: PC[][] = [];
  for (let t = 0; t < 5; t++) {
    grid.push([]); ig.push([]);
    const raw: PC[] = []; rawT.push(raw);
    for (let r = 0; r < 4; r++) { const it = row.make(t, r), rc = richness(row.slot, it, RAR[r], t); raw.push(rc.ic.img); grid[t].push({ hero: rc.hero, feats: rc.feats, glow: rc.glow, score: rc.score }); ig[t].push(cell(rc.ic.img, RAR[r])); }
    // разные редкости — разные сеты: попарное сходство силуэтов внутри ступени ниже порога
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { const v = similar(raw[a], raw[b]); res.similarity.push([row.mat, row.slot, T.levels[t], RAR[a], RAR[b], v.i, v.c]); if (v.bad) res.fails.push(`${row.mat} ${row.slot} ${T.levels[t]} ур.: ${RAR[a]} и ${RAR[b]} похожи (IoU ${v.i}, цвет ${v.c})`); }
  }
  // соседние ступени одной редкости — тоже разные вещи (свой набор форм у каждой ступени)
  for (let t = 0; t + 1 < 5; t++) for (let r = 0; r < 4; r++) { const v = similar(rawT[t][r], rawT[t + 1][r]); res.similarity.push([row.mat, row.slot, `${T.levels[t]}→${T.levels[t + 1]}`, RAR[r], RAR[r], v.i, v.c]); if (v.bad) res.fails.push(`${row.mat} ${row.slot} ${RAR[r]}: ${T.levels[t]} и ${T.levels[t + 1]} ур. похожи (IoU ${v.i}, цвет ${v.c})`); }
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
  text(c, `${row.mat}`, 10, y + 20, 2, GOLD); text(c, ({ helm: "ШЛЕМ", armor: "КИРАСА", pauldrons: "НАПЛЕЧНИКИ" } as any)[row.slot], 10, y + 42, 2, DIM);
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
