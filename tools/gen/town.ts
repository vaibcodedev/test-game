/** Пиксель-арт Эмберхолла: врата арены и рыночная мелочь (стены, башни, ворота и здания — tools/gen/walls141-*.ts). Опора — нижняя середина. */
import { PC, hash01, hex, mix, ramp, shade, withA, type RGBA, type Ramp } from "./canvas";
import { TOWN, P } from "./palette";
import { cauldron, hay, stall, weaponRack } from "./walls141-props";

type Art = () => PC;

/** Тёплый городской камень и цвета Эмберхолла (багрянец и золото). */
const { ST, ROOF_SLATE, ROOF_BROWN, MARBLE } = TOWN;
const RED = P.cloth.red;
const GOLD = P.gold;

/** Кирпичная кладка: ряды по 6 px, кирпичи по 12 px со сдвигом, лёгкий шум. */
export function bricks(c: PC, x: number, y: number, w: number, h: number, r: Ramp = ST, seed = 1) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const px = x + i, py = y + j;
    const row = Math.floor(j / 6);
    const off = row % 2 ? 6 : 0;
    const mortarY = j % 6 === 5, mortarX = (i + off) % 12 === 11;
    const n = hash01(Math.floor((i + off) / 12), row, seed);
    let idx = n < 0.3 ? 2 : n < 0.8 ? 3 : 4;
    if (j % 6 === 0) idx = Math.min(r.length - 1, idx + 1);
    if (mortarY || mortarX) idx = 1;
    c.set(px, py, r[idx]);
  }
}
/** Камни мостовой/плиты дорожки по стене. */
export function slabs(c: PC, x: number, y: number, w: number, h: number, r: Ramp = ST, seed = 3) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const row = Math.floor(j / 8), off = row % 2 ? 5 : 0;
    const seam = j % 8 === 7 || (i + off) % 10 === 9;
    const n = hash01(Math.floor((x + i + off) / 10), Math.floor((y + j) / 8), seed);
    c.set(x + i, y + j, seam ? r[2] : r[n < 0.5 ? 3 : 4]);
  }
}
/** Зубцы: блоки шириной bw с шагом step по горизонтали. */
function merlonsH(c: PC, x: number, y: number, w: number, bw = 6, step = 11, h = 8) {
  for (let i = 1; i + bw <= w; i += step) {
    c.shadedRect(x + i, y, bw, h, ST);
    c.rect(x + i, y, bw, 2, ST[5]);
  }
}
/** Врата арены: каменная арка с опущенной решёткой, алые знамёна со скрещёнными мечами, факелы. */
const arenaGate: Art = () => {
  const c = new PC(128, 132);
  bricks(c, 6, 30, 116, 100, ST, 41);
  c.rect(6, 128, 116, 4, ST[1]);
  c.shadedRect(0, 22, 128, 12, ST);
  merlonsH(c, 0, 10, 128, 9, 14, 13);
  // арка с решёткой
  const ox = 64, oy = 84, rx = 26;
  for (let y = 50; y < 128; y++) for (let x = 0; x < 128; x++) {
    const inside = y >= oy ? Math.abs(x + 0.5 - ox) < rx : ((x + 0.5 - ox) / rx) ** 2 + ((y + 0.5 - oy) / 34) ** 2 < 1;
    if (!inside) continue;
    const bar = (x - ox + 64) % 6 === 0 || (y - 50) % 8 === 0;
    c.set(x, y, bar ? P.darkSteel[3] : mix(hex("#1a0a0a"), hex("#6a1a10"), Math.max(0, (y - 70) / 60)));
  }
  for (let a = 0; a <= 60; a++) {
    const t = Math.PI * (a / 60);
    c.set(ox - Math.cos(t) * (rx + 1), oy - Math.sin(t) * 35, ST[5]);
  }
  // знамёна
  for (const bx of [14, 92]) {
    c.rect(bx, 40, 22, 54, RED[1]);
    c.rect(bx + 1, 40, 20, 52, RED[2]);
    c.poly([[bx, 94], [bx + 22, 94], [bx + 11, 104]], RED[2]);
    c.rect(bx - 2, 38, 26, 3, GOLD[2]);
    c.line(bx + 4, 52, bx + 18, 76, P.steel[3], 2);
    c.line(bx + 18, 52, bx + 4, 76, P.steel[3], 2);
    c.rect(bx + 2, 72, 6, 2, GOLD[2]);
    c.rect(bx + 14, 72, 6, 2, GOLD[2]);
  }
  // табличка с черепом-эмблемой
  c.shadedRect(48, 36, 32, 12, GOLD);
  c.ellipse(64, 42, 4, 3.5, hex("#f1ecdf"));
  c.set(62, 42, hex("#2a1a10")); c.set(66, 42, hex("#2a1a10"));
  return c.outline();
};

const anvil: Art = () => {
  const c = new PC(32, 32);
  c.shadedRect(9, 20, 14, 11, P.wood);
  c.shadedRect(5, 12, 22, 5, P.darkSteel);
  c.poly([[27, 12], [31, 13], [27, 16]], P.darkSteel[3]);
  c.shadedRect(11, 16, 10, 5, P.darkSteel);
  c.rect(6, 12, 20, 1, P.darkSteel[4]);
  c.line(18, 10, 24, 6, P.wood[2], 1);
  c.rect(22, 4, 5, 3, P.steel[2]);
  return c.outline();
};
const dummy: Art = () => {
  const c = new PC(32, 48);
  c.rect(15, 18, 3, 30, P.wood[2]);
  c.rect(6, 22, 21, 3, P.wood[2]);
  c.shadedEllipse(16, 28, 7, 9, ramp("#7a6230", "#a88a44", "#cdb064", "#e8d090"));
  c.shadedEllipse(16, 13, 5, 5.5, ramp("#7a6230", "#a88a44", "#cdb064", "#e8d090"));
  c.rect(10, 27, 13, 2, RED[2]);
  c.line(13, 33, 19, 39, P.leather[1], 1);
  return c.outline();
};
export const TOWN_ART: Record<string, Art> = {
  // стены, башни, ворота, таверна, банк, кузня и дома Эмберхолла — tools/gen/walls141-game.ts (задача 141)
  arena_gate: arenaGate,
  // прилавки, котёл, стойка с оружием, тюк сена в объёме 3/4 (задача 141): tools/gen/walls141-props.ts
  stall_blue: () => stall(P.cloth.blue[2]), stall_green: () => stall(P.cloth.green[2], "food"),
  anvil, cauldron, dummy, weapon_rack: weaponRack, hay,
};
