/**
 * Монтаж «было | вариант 1 (мешок) | вариант 2 (сундучок)» рядом с героем на траве, камне и пепле + ленты кадров падения/мерцания.
 * Запуск: npx tsx tools/loot-look.ts → tools/out/loot-look/*.png
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hex, pnoise, type Ramp } from "./gen/canvas";
import { P } from "./gen/palette";
import { OBJECT_ART } from "./gen/objects";
import { buildLootSheet, LOOT_FRAMES, type LootVariant } from "./gen/loot";

const OUT = path.resolve("tools/out/loot-look");
fs.mkdirSync(OUT, { recursive: true });
const S = 4;

// мини-шрифт 3×5
const F: Record<string, string> = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", G: "011100101101011",
  H: "101101111101101", I: "111010010010111", K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101",
  O: "010101101101010", P: "110101110100100", R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111",
  V: "101101101101010", W: "101101111111101", Y: "101101010010010", "1": "010110010010111", "2": "110001010100111", "3": "110001010001110",
  "0": "010101101101010", " ": "000000000000000", "|": "010010010010010", "-": "000000111000000",
};
function text(c: PC, s: string, x: number, y: number) {
  for (const ch of s.toUpperCase()) {
    const g = F[ch] ?? F[" "];
    for (let i = 0; i < 15; i++) if (g[i] === "1") c.set(x + (i % 3), y + Math.floor(i / 3), hex("#e8dcc0"));
    x += 4;
  }
}

function ground(c: PC, x0: number, y0: number, w: number, h: number, r: Ramp, seed: number) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = pnoise(x, y, 6, 96, seed) * 0.7 + pnoise(x, y, 2, 96, seed + 1) * 0.3;
    c.set(x0 + x, y0 + y, r[Math.min(r.length - 1, 1 + Math.floor(n * (r.length - 1.5)))]);
  }
}
function heroFrame(): PC {
  const png = PNG.sync.read(fs.readFileSync("client/public/assets/units/warrior.png"));
  const c = new PC(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * png.width + x) * 4;
    c.data.set(png.data.subarray(i, i + 4), (y * 32 + x) * 4);
  }
  return c;
}
function frameOf(v: LootVariant, r: number, boss: boolean, i: number): PC {
  const { sheet, fw, fh } = buildLootSheet(v, r, boss);
  const f = new PC(fw, fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const p = sheet.get(i * fw + x, y)!; if (p[3]) f.set(x, y, p); }
  return f;
}
function save(c: PC, name: string) {
  const big = new PC(c.w * S, c.h * S);
  for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) { const p = c.get(Math.floor(x / S), Math.floor(y / S))!; if (p[3]) big.set(x, y, p); }
  big.save(path.join(OUT, name));
  console.log("->", path.join(OUT, name));
}

const hero = heroFrame();
const grounds: [string, Ramp, number][] = [["GRASS", P.grass, 3], ["STONE", P.cobble, 5], ["ASH", P.ash, 7]];
const CW = 40, RH = 50;
// колонки: герой, было ×2, v1 ×5, v2 ×5
const cols: { label: string; img: () => PC }[] = [
  { label: "HERO", img: () => hero },
  { label: "OLD", img: () => OBJECT_ART.bag() },
  { label: "OLD B", img: () => OBJECT_ART.bag_boss() },
];
for (const [v, tag] of [["bag", "V1"], ["chest", "V2"]] as [LootVariant, string][]) {
  for (let r = 0; r < 4; r++) cols.push({ label: `${tag} R${r}`, img: () => frameOf(v, r, false, 13) });
  cols.push({ label: `${tag} BOSS`, img: () => frameOf(v, 3, true, 13) });
}
const imgs = cols.map((c) => c.img());
const W = CW * cols.length + 8, H = 12 + RH * grounds.length + 4;
const c = new PC(W, H);
c.rect(0, 0, W, H, hex("#141018"));
text(c, "OLD | V1 BAG | V2 CHEST    R0 COMMON R1 RARE R2 EPIC R3 LEGEND", 4, 3);
grounds.forEach(([name, r, seed], gi) => {
  const y0 = 12 + gi * RH;
  ground(c, 4, y0, W - 8, RH - 2, r, seed);
  text(c, name, 6, y0 + 2);
  imgs.forEach((im, ci) => {
    const cx = 4 + ci * CW + CW / 2, by = y0 + RH - 10;
    c.blit(im, Math.round(cx - im.w / 2), by - im.h + (ci === 0 ? 2 : ci < 3 ? 1 : 3));
    if (gi === 0) text(c, cols[ci].label, Math.round(cx - cols[ci].label.length * 2), y0 + RH - 8);
  });
  for (const sx of [4 + 3 * CW - 1, 4 + 8 * CW - 1]) c.rect(sx, y0, 1, RH - 2, hex("#141018"));
});
save(c, "compare.png");

// ленты кадров: падение 0..9 и покой 10..19, по редкостям, на пепле, с героем в начале
for (const v of ["bag", "chest"] as LootVariant[]) {
  const rows = [0, 1, 2, 3, 4];
  const f0 = frameOf(v, 3, true, 0);
  const fw = f0.w + 2, fh = f0.h + 4;
  const s = new PC(36 + fw * LOOT_FRAMES + 4, 10 + rows.length * fh);
  s.rect(0, 0, s.w, s.h, hex("#141018"));
  text(s, `${v} FRAMES 0-9 DROP 10-19 IDLE`, 4, 2);
  rows.forEach((r, ri) => {
    const y0 = 10 + ri * fh;
    ground(s, 0, y0, s.w, fh - 1, P.ash, 9 + ri);
    s.blit(hero, 2, y0 + fh - 36);
    for (let i = 0; i < LOOT_FRAMES; i++) {
      const f = frameOf(v, Math.min(r, 3), r === 4, i);
      s.blit(f, 36 + i * fw + Math.round((fw - f.w) / 2), y0 + fh - 2 - f.h);
    }
  });
  save(s, `frames-${v}.png`);
}

// крупно: оба варианта, все редкости + босс, кадр покоя 13, ×10
{
  const list: PC[] = [];
  for (const v of ["bag", "chest"] as LootVariant[]) { for (let r = 0; r < 4; r++) list.push(frameOf(v, r, false, 13)); list.push(frameOf(v, 2, true, 13)); }
  const cw = Math.max(...list.map((f) => f.w)) + 2, ch = Math.max(...list.map((f) => f.h)) + 2;
  const d = new PC(cw * 5, ch * 2);
  ground(d, 0, 0, d.w, d.h, P.ash, 11);
  list.forEach((f, i) => d.blit(f, (i % 5) * cw + Math.round((cw - f.w) / 2), Math.floor(i / 5) * ch + ch - 1 - f.h));
  const big = new PC(d.w * 10, d.h * 10);
  for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) { const p = d.get(Math.floor(x / 10), Math.floor(y / 10))!; if (p[3]) big.set(x, y, p); }
  big.save(path.join(OUT, "detail.png"));
}

// заметность обычной добычи: «было | стало» на траве, камне, пепле, снегу и ночью (×4)
{
  const fr = (v: LootVariant, r: number, vis: boolean) => {
    const { sheet, fw, fh } = buildLootSheet(v, r, false, vis);
    const f = new PC(fw, fh);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const p = sheet.get(13 * fw + x, y)!; if (p[3]) f.set(x, y, p); }
    return f;
  };
  const vcols: [string, PC][] = [
    ["HERO", hero], ["OLD V2", fr("chest", 0, false)], ["NEW V2", fr("chest", 0, true)], ["OLD V1", fr("bag", 0, false)], ["NEW V1", fr("bag", 0, true)],
    ["V2 R1", fr("chest", 1, true)], ["V2 R2", fr("chest", 2, true)], ["V2 R3", fr("chest", 3, true)], ["V1 R1", fr("bag", 1, true)], ["V1 R3", fr("bag", 3, true)],
  ];
  const rows: [string, Ramp, number, boolean][] = [["GRASS", P.grass, 3, false], ["STONE", P.cobble, 5, false], ["ASH", P.ash, 7, false], ["SNOW", P.snow, 13, false], ["NIGHT", P.grass, 3, true], ["NIGHT ASH", P.ash, 7, true]];
  const cw = 38, rh = 44;
  const v = new PC(cw * vcols.length + 8, 12 + rows.length * rh);
  v.rect(0, 0, v.w, v.h, hex("#141018"));
  text(v, "OLD | NEW  COMMON R0 VISIBILITY   R1-R3 FOR COMPARISON", 4, 3);
  rows.forEach(([name, rp, seed, night], ri) => {
    const y0 = 12 + ri * rh;
    const row = new PC(v.w - 8, rh - 2);
    ground(row, 0, 0, row.w, row.h, rp, seed);
    vcols.forEach(([, im], ci) => row.blit(im, ci * cw + Math.round((cw - im.w) / 2), row.h - 6 - im.h + (ci === 0 ? 2 : 3)));
    // ночь: как сумерки в игре — затемнение с холодным оттенком
    if (night) row.map((c) => [Math.round(c[0] * 0.38), Math.round(c[1] * 0.42), Math.round(c[2] * 0.55), c[3]]);
    v.blit(row, 4, y0);
    text(v, name, 6, y0 + 2);
    if (ri === 0) vcols.forEach(([l], ci) => text(v, l, 4 + ci * cw + Math.round(cw / 2 - l.length * 2), y0 + rh - 9));
  });
  save(v, "visible.png");
}
