/**
 * Пиксель-арт столиц фракций и дорог мира.
 *   Аурелион (Сольгард): светлый камень, золотые купола, знамёна с солнцем, витражи.
 *   Мортхейм (Умбрат): тёмный камень, шпили, кости и цепи, пурпурные огни душ.
 *   Дороги: указатель, мосты, руины, костёр.
 * Опорная точка — нижняя середина, размеры кратны тайлу (32 px).
 */
import { PC, hash01, hex, mix, ramp, withA, type RGBA, type Ramp } from "./canvas";
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
/**
 * Деревянный мост в 3/4 (docs/water-shores.md): настил из досок поперёк хода ровного тона с лёгким разбросом, тонкие щели, торцы досок у перил;
 * перила со столбиками и тенью на настил; у горизонтального — торец настила и сваи в воде с тенью и рябью, у вертикального — сваи по бокам и тень справа.
 * Куски: центр 6 тайлов (bridge_h / bridge_v, якорь мостовых постов), продолжение над водой по 1 тайлу (…_mid, свая через тайл) и концы на берегу —
 * каменный устой под настилом (…_end_w/_e, …_end_n/_s): настил заходит на сушу, береговая стенка под ним скрыта. Проход — между перилами
 * (shared/map.ts BRIDGE_DECK_H / BRIDGE_DECK_V); раскладка кусков — shared/map.ts buildBridges.
 */
export type BridgePiece = "center" | "mid" | "mid2" | "endA" | "endB";
export function bridgePiece(horizontal: boolean, piece: BridgePiece): PC {
  const len = piece === "center" ? 192 : 32;
  const W = horizontal ? len : 96, H = horizontal ? 96 : len;
  const c = new PC(W, H);
  const along = len;
  const end = piece === "endA" || piece === "endB", rev = piece === "endB"; // конец: со стороны a < 13 — въезд на земле; endB — зеркально
  const put = (a: number, b: number, col: RGBA) => { const A = rev ? along - 1 - a : a; if (horizontal) c.set(A, b, col); else c.set(b, A, col); };
  const WD = P.wood, ST = P.stone, DT = P.dirt;
  const d0 = 8, d1 = horizontal ? 72 : 88;
  const a0 = piece === "center" ? 0 : piece === "mid" ? 200 : piece === "mid2" ? 232 : 264;
  const deckFrom = end ? 13 : 0;
  // настил: доски поперёк хода ровного тона, тонкие щели, торцы у перил, вытертая середина
  for (let a = deckFrom; a < along; a++) for (let b = d0; b < d1; b++) {
    const A = a + a0, plank = Math.floor(A / 8), pa = A % 8;
    const off = Math.floor(hash01(plank, 0, 13) * 12), seg = Math.floor((b - d0 + off) / 28);
    const n = hash01(plank, seg, 9);
    const k = n < 0.07 ? 1 : n > 0.95 ? 3 : 2;
    let col: RGBA = WD[k];
    if (Math.abs(b - (d0 + d1) / 2) < (d1 - d0) * 0.18 && hash01(plank, seg, 15) < 0.5) col = mix(col, WD[3], 0.3);
    if (pa === 7) col = mix(WD[k], WD[0], 0.6);
    else if (pa === 0) col = mix(WD[k], WD[3], 0.4);
    if ((b - d0 + off) % 28 === 0 && pa < 7) col = mix(WD[k], WD[0], 0.5);
    if ((b === d0 + 3 || b === d1 - 4) && (pa === 2 || pa === 5)) col = P.steel[2];
    if (b === d0 || b === d1 - 1) col = mix(col, WD[0], 0.45);
    put(a, b, col);
  }
  if (end) for (let a = 10; a < 13; a++) for (let b = d0 - 1; b < d1 + 1; b++) put(a, b, a === 10 ? WD[3] : a === 11 ? WD[2] : WD[0]); // порог — толстая доска поперёк въезда
  if (horizontal) for (let a = deckFrom; a < along; a++) { // торец настила: видны концы досок, кромка к свету, тёмный низ
    const pa = (a + a0) % 8;
    put(a, d1, WD[3]);
    for (let b = d1 + 1; b < d1 + 6; b++) put(a, b, b === d1 + 5 ? WD[0] : pa === 7 ? mix(WD[1], WD[0], 0.6) : b === d1 + 1 ? WD[2] : WD[1]);
  }
  // перила; у конца — толстый столб у въезда
  const rails = horizontal ? [2, 60] : [2, 84];
  for (const r of rails) {
    for (let a = deckFrom; a < along; a++) { put(a, r + 2, WD[3]); put(a, r + 3, WD[2]); put(a, r + 4, WD[0]); put(a, r + 5, withA([20, 12, 8, 255], 70)); }
    const posts = end ? [13] : [];
    for (let a = piece === "center" ? 4 : end ? 45 : 13; a < along; a += 32) posts.push(a);
    for (const a of posts) {
      const wdt = end && a === 13 ? 6 : 5, h = (horizontal ? 12 : 10) + (end && a === 13 ? 3 : 0);
      for (let q = 0; q < wdt; q++) for (let k = 0; k < h; k++) put(a + q, r + k - (horizontal ? 2 : 0) - (end && a === 13 ? 3 : 0), q === 0 ? WD[3] : q < wdt - 2 ? WD[2] : WD[0]);
      for (let q = 0; q < wdt; q++) put(a + q, r - (horizontal ? 3 : 1) - (end && a === 13 ? 3 : 0), WD[3]);
      for (let q = wdt; q < wdt + 3; q++) for (let k = 0; k < 3; k++) put(a + q, r + (horizontal ? 6 : 4) + k, withA([20, 12, 8, 255], 80 - k * 20));
    }
  }
  c.outline(withA(WD[0], 255));
  // после контура: вода, сваи, тень, устой и въезд (без обводки)
  if (horizontal) {
    // тень моста на воде: тёмная полоса со смещением вниз
    for (let a = end ? 13 : 0; a < along; a++) for (let b = 78; b < 94; b++) put(a, b, withA([8, 14, 30, 255], Math.max(0, 150 - (b - 78) * 10)));
    const piles = piece === "center" ? [14, 58, 102, 146] : piece === "mid2" ? [13] : piece === "mid" ? [] : [];
    for (const a of piles) {
      for (let b = 76; b < 91; b++) for (let k = 0; k < 6; k++) {
        let col = k === 0 ? WD[2] : k < 3 ? WD[1] : WD[0];
        if (b > 86) col = [col[0] * 0.7 + 10, col[1] * 0.75 + 18, col[2] * 0.8 + 30, 255] as RGBA;
        put(a + k, b, col);
      }
      for (let k = -4; k <= 9; k++) if (Math.abs(k - 2.5) > 3.6 && hash01(a + k, 3, 77) < 0.8) put(a + k, 91, withA(P.water[4], 210));
      for (let k = -6; k <= 11; k++) if (Math.abs(k - 2.5) > 6.5 && hash01(a + k, 5, 78) < 0.6) put(a + k, 93, withA(P.water[3], 170));
    }
    if (end) { // каменный устой: верх виден у въезда, лицо кладки под торцом, тень у подножия
      for (let a = 4; a < 24; a++) for (let b = 72; b < 92; b++) {
        if (a >= 13 && b < 78) continue; // под торцом настила
        const top = b < 76 && a < 13;
        const row = Math.floor((b - 76) / 5), bx = (a + row * 7) % 12;
        put(a, b, top ? (b === 72 ? ST[4] : ST[3]) : b === 76 ? ST[3] : bx === 0 || (b - 76) % 5 === 4 ? ST[0] : ST[2 - (row & 1)]);
      }
      for (let a = 4; a < 24; a++) { put(a, 92, withA([10, 8, 12, 255], 150)); put(a, 93, withA([10, 8, 12, 255], 70)); }
    }
  } else {
    if (!end) for (let a = 0; a < along; a++) for (let b = 88; b < 96; b++) put(a, b, withA([8, 16, 34, 255], Math.max(0, 130 - (b - 88) * 15)));
    const piles = piece === "center" ? [20, 68, 116, 164] : piece === "mid2" ? [12] : [];
    for (const a of piles) for (const b0 of [1, 89]) {
      for (let k = 0; k < 5; k++) for (let q = 0; q < 7; q++) put(a + q, b0 + k, q === 0 ? WD[2] : q < 4 ? WD[1] : WD[0]);
      for (let q = -2; q < 9; q++) if (hash01(a + q, b0, 79) < 0.7) put(a + q + 1, b0 + 5, withA(P.water[4], 190));
    }
  }
  if (end) { // въезд: утоптанная земля дороги до порога (ровная плоскость, светлее к середине), по бокам — каменные тумбы устоя
    for (let a = 0; a < 10; a++) for (let b = d0 + 2; b < d1 - 2; b++) {
      const m2 = Math.abs(b - (d0 + d1) / 2) / ((d1 - d0) / 2);
      let col: RGBA = m2 > 0.8 ? DT[1] : m2 > 0.5 ? DT[2] : DT[3];
      if (a === 9) col = mix(col, WD[0], 0.4); // тень порога на земле
      put(a, b, withA(col, a < 2 ? 150 + a * 50 : 255));
    }
    for (const b of [d0 - 3, d1 - 5]) for (let q = 0; q < 9; q++) for (let k = 0; k < 8; k++) // тумба: верх светлый, лицо кладки, AO
      put(1 + q, b + k, k < 3 ? (k === 0 ? ST[4] : ST[3]) : k === 7 ? withA([10, 8, 12, 255], 140) : q === 0 ? ST[3] : q >= 7 ? ST[0] : ST[2 - ((k + q) % 5 === 0 ? 1 : 0)]);
  }
  return c;
}
export const bridge = (horizontal: boolean) => bridgePiece(horizontal, "center");
/** Куски мостов по ключам объектов (shared/map.ts buildBridges). */
export const BRIDGE_PIECES: Record<string, () => PC> = {
  bridge_h: () => bridgePiece(true, "center"), bridge_v: () => bridgePiece(false, "center"),
  bridge_h_mid: () => bridgePiece(true, "mid"), bridge_h_mid2: () => bridgePiece(true, "mid2"),
  bridge_h_end_w: () => bridgePiece(true, "endA"), bridge_h_end_e: () => bridgePiece(true, "endB"),
  bridge_v_mid: () => bridgePiece(false, "mid"), bridge_v_mid2: () => bridgePiece(false, "mid2"),
  bridge_v_end_n: () => bridgePiece(false, "endA"), bridge_v_end_s: () => bridgePiece(false, "endB"),
};
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
  signpost, ...BRIDGE_PIECES, ruin_pillar: ruinPillar, ruin_wall: ruinWall, campfire,
};
