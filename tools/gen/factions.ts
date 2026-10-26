/**
 * Пиксель-арт столиц фракций и дорог мира.
 *   Аурелион (Сольгард): светлый камень, золотые купола, знамёна с солнцем, витражи.
 *   Мортхейм (Умбрат): тёмный камень, шпили, кости и цепи, пурпурные огни душ.
 *   Дороги: указатель, мосты, руины, костёр.
 * Опорная точка — нижняя середина, размеры кратны тайлу (32 px).
 */
import { PC, hash01, hex, ramp, withA, type RGBA, type Ramp } from "./canvas";
import { FACTION, P } from "./palette";
import { bricks, slabs } from "./town";
import { stall } from "./walls141-props";

type Art = () => PC;

const { WHITE, SKY, DARK } = FACTION;
const GOLD = P.gold;
const PURP = P.magic.purple;
const VENOM = P.magic.green;
const BONE = P.bone;

const sunStatue: Art = () => {
  const c = new PC(32, 96);
  c.shadedRect(4, 72, 24, 22, WHITE);
  c.rect(4, 72, 24, 2, GOLD[2]);
  // фигура короля с поднятым мечом
  c.shadedRect(11, 40, 10, 32, WHITE);
  c.shadedEllipse(16, 34, 5, 6, WHITE);
  c.poly([[11, 28], [13, 24], [16, 27], [19, 24], [21, 28]], GOLD[3]);
  c.line(21, 44, 27, 10, WHITE[4], 2);
  c.rect(19, 44, 6, 2, GOLD[2]);
  c.poly([[9, 48], [13, 44], [13, 70], [8, 70]], WHITE[2]);
  for (let a = 0; a < 6; a++) c.set(27 + Math.round(Math.cos(a) * 3), 8 + Math.round(Math.sin(a) * 3), GOLD[4]);
  return c.outline();
};

// ---------------- Мортхейм ----------------
const soulBrazier: Art = () => {
  const c = new PC(32, 48);
  for (const [x0, x1] of [[8, 13], [24, 19], [16, 16]]) c.line(x0, 46, x1, 28, DARK[3], 2);
  c.shadedEllipse(16, 27, 10, 4, DARK);
  c.ellipse(16, 25, 8, 3, hex("#0a0410"));
  c.poly([[10, 25], [13, 12], [16, 19], [19, 6], [22, 25]], (x, y) => (y > 18 ? PURP[2] : PURP[3]));
  c.poly([[13, 25], [16, 15], [19, 25]], PURP[4]);
  c.ellipse(16, 46, 3, 2, BONE[2]);
  return c.outline();
};
const bonePile: Art = () => {
  const c = new PC(32, 32);
  c.shadedEllipse(16, 26, 13, 5, DARK);
  for (const [x, y, a] of [[8, 22, 0.4], [22, 23, -0.5], [15, 18, 0.1], [11, 26, -0.2], [21, 27, 0.6]]) c.line(x - Math.cos(a) * 6, y - Math.sin(a) * 6, x + Math.cos(a) * 6, y + Math.sin(a) * 6, BONE[2], 2);
  c.ellipse(16, 14, 5, 5, BONE[3]);
  c.rect(13, 13, 2, 2, DARK[0]);
  c.rect(17, 13, 2, 2, DARK[0]);
  c.rect(14, 17, 4, 2, BONE[1]);
  return c.outline();
};
const darkObelisk: Art = () => {
  const c = new PC(32, 96);
  c.shadedRect(4, 84, 24, 10, DARK);
  c.poly([[9, 84], [23, 84], [20, 14], [16, 4], [12, 14]], (x) => (x < 14 ? DARK[3] : x < 18 ? DARK[2] : DARK[1]));
  for (const y of [24, 36, 48, 60, 72]) c.rect(15, y, 2, 4, withA(PURP[3], 240));
  c.ellipse(16, 16, 2.5, 2.5, VENOM[3]);
  return c.outline();
};

// ---------------- дороги и поселения ----------------
const signpost: Art = () => {
  const c = new PC(32, 64);
  c.shadedRect(14, 10, 4, 52, P.wood);
  c.poly([[2, 14], [26, 14], [31, 19], [26, 24], [2, 24]], P.wood[3]);
  c.rect(2, 23, 24, 1, P.wood[1]);
  c.poly([[30, 30], [6, 30], [1, 35], [6, 40], [30, 40]], P.wood[2]);
  c.rect(6, 39, 24, 1, P.wood[0]);
  for (const [x, y] of [[8, 18], [14, 18], [20, 18], [10, 34], [16, 34], [22, 34]]) c.rect(x, y, 3, 1, P.wood[0]);
  c.ellipse(16, 62, 6, 2, P.stone[1]);
  return c.outline();
};
function bridge(horizontal: boolean): PC {
  const W = horizontal ? 192 : 96, H = horizontal ? 96 : 192;
  const c = new PC(W, H);
  const along = horizontal ? W : H, across = horizontal ? H : W;
  for (let a = 0; a < along; a++) for (let b = 8; b < across - 8; b++) {
    const plank = Math.floor(a / 8), seam = a % 8 === 7;
    const n = hash01(plank, Math.floor(b / 24), 9);
    const col: RGBA = seam ? P.wood[0] : n < 0.3 ? P.wood[1] : n < 0.8 ? P.wood[2] : P.wood[3];
    if (horizontal) c.set(a, b, col);
    else c.set(b, a, col);
  }
  // перила и столбики
  for (const b of [6, across - 10]) for (let a = 0; a < along; a++) {
    if (horizontal) { c.rect(a, b, 1, 4, P.wood[3]); c.set(a, b + 4, P.wood[0]); }
    else { c.rect(b, a, 4, 1, P.wood[3]); c.set(b + 4, a, P.wood[0]); }
  }
  for (let a = 4; a < along; a += 32) for (const b of [4, across - 12]) {
    if (horizontal) c.shadedRect(a, b, 6, 8, P.wood);
    else c.shadedRect(b, a, 8, 6, P.wood);
  }
  return c.outline();
}
const ruinPillar: Art = () => {
  const c = new PC(32, 64);
  const h = 30 + Math.floor(hash01(3, 4, 5) * 10);
  c.shadedRect(9, 64 - h - 4, 14, h, WHITE);
  for (let y = 64 - h; y < 60; y += 9) c.rect(9, y, 14, 1, WHITE[0]);
  c.poly([[9, 64 - h - 4], [14, 64 - h - 9], [18, 64 - h - 3], [23, 64 - h - 6], [23, 64 - h - 2], [9, 64 - h]], WHITE[3]);
  c.shadedRect(6, 58, 20, 6, WHITE);
  for (let i = 0; i < 6; i++) c.set(10 + i * 2, 64 - h + 6 + i * 4, P.moss[1 + (i % 2)]);
  return c.outline();
};
const ruinWall: Art = () => {
  const c = new PC(64, 48);
  bricks(c, 0, 18, 64, 30, WHITE, 81);
  for (let x = 0; x < 64; x++) {
    const top = 18 + Math.floor(hash01(Math.floor(x / 6), 2, 83) * 14);
    for (let y = 18; y < top; y++) c.clear(x, y);
  }
  for (let i = 0; i < 9; i++) c.set(4 + i * 7, 44, P.moss[2]);
  c.rect(0, 46, 64, 2, WHITE[0]);
  return c.outline();
};
const campfire: Art = () => {
  const c = new PC(32, 32);
  for (let a = 0; a < 8; a++) c.shadedEllipse(16 + Math.round(Math.cos(a * 0.785) * 11), 26 + Math.round(Math.sin(a * 0.785) * 4), 3, 2.5, P.stone);
  c.line(8, 27, 24, 23, P.wood[1], 3);
  c.line(8, 23, 24, 27, P.wood[2], 3);
  c.poly([[10, 25], [13, 12], [16, 18], [19, 6], [22, 25]], (x, y) => (y > 17 ? P.magic.fire[2] : P.magic.fire[3]));
  c.poly([[13, 25], [16, 15], [19, 25]], P.magic.fire[4]);
  return c.outline();
};

export const FACTION_ART: Record<string, Art> = {
  // стены, башни, ворота и дома столиц и фортов — tools/gen/walls141-game.ts (задача 141)
  stall_gold: () => stall(hex("#e8b84a")), sun_statue: sunStatue,
  stall_purple: () => stall(hex("#7a3ab0"), "cloth"),
  soul_brazier: soulBrazier, bone_pile: bonePile, dark_obelisk: darkObelisk,
  signpost, bridge_h: () => bridge(true), bridge_v: () => bridge(false), ruin_pillar: ruinPillar, ruin_wall: ruinWall, campfire,
};
