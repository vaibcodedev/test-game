/**
 * Мокап берегов автотайлами (docs/water-shores.md), офлайн, в игру ничего не пишет.
 * Тайл берега = маска углов dual grid (TL=1, TR=2, BR=4, BL=8 — как terrainTiles.ts) × биом; на тайле: верх суши, кромка,
 * стенка грунта под северным берегом (вода ниже земли), линия воды, тень на воде; рядом битовая маска «можно стоять» из того же рисунка.
 * Вода — отдельный слой под тайлами. Слева — нынешний вид (tools/out/shaders/water-bank5.png).
 * Запуск под замком: npx tsx tools/shores-mockup.ts → tools/out/shores/mockup.png
 */
import fs from "node:fs";
import os from "node:os";
import { PNG } from "pngjs";
import { PC, hash01, mix, pnoise, shade, withA, type RGBA } from "./gen/canvas";
import { P } from "./gen/palette";

const S = 32;
const LOCK = "tools/out/scenario.lock2";

type Biome = "grass" | "sand";
interface Tile { img: PC; walk: Uint8Array }

const terrain = PNG.sync.read(fs.readFileSync("client/public/assets/tiles/terrain.png"));
const ROW: Record<Biome, number> = { grass: 6, sand: 2 };
/** Верх суши — сплошной тайл из нашего terrain.png (столбцы 14–17), чтобы берег совпадал с землёй игры. */
function topPx(b: Biome, v: number, x: number, y: number): RGBA {
  const i = ((ROW[b] * S + y) * terrain.width + (14 + v) * S + x) * 4;
  return [terrain.data[i], terrain.data[i + 1], terrain.data[i + 2], 255];
}

/** Поле «суша» внутри тайла: билинейно по углам + шум, гаснущий к краям (контур пересекает край тайла всегда в середине — швов нет). */
function field(mask: number, v: number, x: number, y: number) {
  const u = Math.max(0, Math.min(1, (x + 0.5) / S)), w = Math.max(0, Math.min(1, (y + 0.5) / S));
  const tl = mask & 1 ? 1 : 0, tr = mask & 2 ? 1 : 0, br = mask & 4 ? 1 : 0, bl = mask & 8 ? 1 : 0;
  const f = tl * (1 - u) * (1 - w) + tr * u * (1 - w) + br * u * w + bl * (1 - u) * w;
  const win = 16 * u * (1 - u) * w * (1 - w);
  const n = (pnoise(x & 31, y & 31, 8, S, 700 + mask * 13 + v) - 0.5) * 0.5 + (pnoise(x & 31, y & 31, 4, S, 760 + mask) - 0.5) * 0.18;
  return f + n * win;
}

const FACE: Record<Biome, number> = { grass: 8, sand: 3 };

function shoreTile(b: Biome, mask: number, v: number): Tile {
  const img = new PC(S, S), walk = new Uint8Array(S * S);
  const land = (x: number, y: number) => field(mask, v, x, y) > 0.5;
  const H = FACE[b];
  const soil = b === "grass" ? [P.dirt[3], P.dirt[2], P.dirt[2], P.dirt[1], P.dirt[1], P.dirt[0], P.dirt[0], P.dirt[0]] : [P.sand[1], P.sand[0], shade(P.sand[0], 0.85)];
  const edgeDark = b === "grass" ? hex2(P.dirt[0], 0.75) : shade(P.sand[0], 0.8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (land(x, y)) {
      walk[y * S + x] = 1;
      let c = topPx(b, v, x, y);
      const wD = !land(x, y + 1), wU = !land(x, y - 1), wL = !land(x - 1, y), wR = !land(x + 1, y);
      if (b === "grass") {
        if (wD) c = P.grass[4]; // кромка дёрна над обрывом — светлая (свет сверху)
        else if (!land(x, y + 2)) c = mix(c, P.grass[3], 0.6);
        else if (wU) c = P.grass[1]; // дальняя кромка ближнего берега
        else if (wL) c = mix(c, P.grass[3], 0.5);
        else if (wR) c = P.grass[1];
      } else {
        let near = 9;
        for (let d = 1; d <= 3 && near > 8; d++) if (!land(x, y + d) || !land(x, y - d) || !land(x - d, y) || !land(x + d, y)) near = d;
        if (near <= 1) c = mix(c, P.sand[1], 0.8); // мокрый песок
        else if (near <= 3) c = mix(c, P.sand[1], 0.4);
      }
      img.set(x, y, c);
      continue;
    }
    // вода: стенка под сушей сверху (вид 3/4 — видно лицо дальнего берега), линия воды, тень
    let dUp = 0;
    for (let d = 1; d <= H + 4; d++) if (land(x, y - d)) { dUp = d; break; }
    let dSide = 0;
    for (let d = 1; d <= 6 && !dSide; d++) if (land(x - d, y) || land(x + d, y) || land(x, y + d) || land(x - d, y + d) || land(x + d, y + d)) dSide = d;
    if (dUp && dUp <= H) {
      let c = soil[dUp - 1];
      if (b === "grass") {
        if (dUp === 1) c = P.grass[1]; // нависающий дёрн
        else if (dUp === 2 && hash01(x, 0, 31 + v) < 0.45) c = P.grass[0]; // корни/пряди дёрна
        else if (dUp >= 3 && hash01(x >> 1, dUp >> 1, 41) < 0.12) c = P.stone[2]; // камешки в грунте
        else if ((x + (dUp >> 1) * 3) % 7 === 0 && dUp > 2) c = shade(c, 0.85); // слои грунта
      }
      // края стенки: слева светлее (свет сверху-слева), справа темнее, контур тёмным тоном грунта
      const fL = !land(x - 1, y - dUp) && !land(x - 1, y), fR = !land(x + 1, y - dUp) && !land(x + 1, y);
      if (fL) c = edgeDark; else if (fR) c = edgeDark; else if (!land(x + 2, y - dUp)) c = shade(c, 0.85);
      img.set(x, y, c);
    } else if (dUp && dUp === H + 1) {
      img.set(x, y, b === "grass" ? (hash01(x, y, 51 + v) < 0.55 ? withA(P.water[4], 210) : withA([10, 16, 30, 255], 150)) : withA(P.water[4], 200));
    } else if (dUp && dUp <= H + 4) {
      img.set(x, y, withA([8, 14, 30, 255], b === "grass" ? 130 - (dUp - H - 2) * 35 : 70 - (dUp - H - 2) * 20));
    } else if (dSide) {
      if (b === "grass") {
        if (dSide === 1) img.set(x, y, edgeDark); // торец дёрна сбоку/снизу — тонкий контур
        else if (dSide === 2) img.set(x, y, hash01(x, y, 61) < 0.5 ? withA(P.water[4], 170) : withA([8, 14, 30, 255], 90));
      } else {
        if (dSide === 1) img.set(x, y, mix(P.sand[1], P.water[3], 0.25));
        else if (dSide === 2) img.set(x, y, mix(P.sand[1], P.water[3], 0.45));
        else if (dSide === 3) img.set(x, y, hash01(x, y, 71) < 0.7 ? withA(P.water[4], 210) : withA(P.sand[2], 150));
        else img.set(x, y, withA(P.sand[2], 120 - (dSide - 4) * 40));
      }
    }
  }
  return { img, walk };
}
function hex2(c: RGBA, k: number): RGBA { return shade(c, k); }

/** Набор: [биом][маска 1..15][вариант 0..1]. Маска 15 — сплошная суша (вариант = столбец 14–17 terrain.png). */
const SET: Record<Biome, Tile[][]> = { grass: [], sand: [] };
for (const b of ["grass", "sand"] as Biome[]) for (let m = 0; m <= 15; m++) SET[b][m] = [0, 1].map((v) => shoreTile(b, m, v));

/** Слой воды (отдельно, под тайлами): тона P.water, рябь, блики, темнее вдали от берега. */
function waterLayer(W: number, H: number, landV: (vx: number, vy: number) => boolean) {
  const out = new PC(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let dmin = 9;
    const gx = x / S, gy = y / S;
    for (let j = Math.floor(gy) - 2; j <= Math.floor(gy) + 3; j++) for (let i = Math.floor(gx) - 2; i <= Math.floor(gx) + 3; i++) if (landV(i, j)) dmin = Math.min(dmin, Math.hypot(i - gx, j - gy));
    const n = pnoise(x, y, 16, 256, 900) * 0.6 + pnoise(x, y, 8, 256, 901) * 0.4;
    let k = 2.2 + (n - 0.5) * 1.6 - (dmin > 1.6 ? 0.7 : 0) - (dmin > 2.6 ? 0.6 : 0);
    const wv = pnoise(x + 7, y * 2, 16, 256, 905);
    if (wv > 0.63 && wv < 0.66) k = 3;
    if (wv > 0.66 && wv < 0.672 && hash01(x >> 2, y, 3) < 0.5) k = 4;
    out.set(x, y, P.water[Math.max(0, Math.min(4, Math.round(k)))]);
  }
  return out;
}

interface Scene { img: PC; walk: Uint8Array; W: number; H: number }
/** Мир из вершинной сетки (1 — суша, 0 — вода): тайл (x,y) берёт углы V(x,y),V(x+1,y),V(x+1,y+1),V(x,y+1) — как terrainTiles.ts. */
function scene(b: Biome, gw: number, gh: number, V: (x: number, y: number) => boolean): Scene {
  const W = gw * S, H = gh * S;
  const img = waterLayer(W, H, V);
  const walk = new Uint8Array(W * H);
  for (let ty = 0; ty < gh; ty++) for (let tx = 0; tx < gw; tx++) {
    const mask = (V(tx, ty) ? 1 : 0) | (V(tx + 1, ty) ? 2 : 0) | (V(tx + 1, ty + 1) ? 4 : 0) | (V(tx, ty + 1) ? 8 : 0);
    if (!mask) continue;
    const v = hash01(tx, ty, 5) < 0.5 ? 0 : 1;
    const t = SET[b][mask][v];
    img.blit(t.img, tx * S, ty * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) walk[(ty * S + y) * W + tx * S + x] = t.walk[y * S + x];
  }
  return { img, walk, W, H };
}

const hero = PNG.sync.read(fs.readFileSync("client/public/assets/units/warrior.png"));
const FOOT_DY = 6, FOOT_HW = 4; // shared/map.ts: опора героя
const canStand = (s: Scene, px: number, py: number) => [-FOOT_HW, 0, FOOT_HW].every((dx) => s.walk[Math.round(py + FOOT_DY) * s.W + Math.round(px + dx)] === 1);
/** Ставит героя: из (x,y) идёт шагами (dx,dy), пока ступни на суше — как moveWithCollision с проверкой ног. */
function walkTo(s: Scene, x: number, y: number, dx: number, dy: number) {
  while (canStand(s, x + dx, y + dy)) { x += dx; y += dy; }
  return [x, y];
}
function drawHero(s: Scene, x: number, y: number, frameCol = 0) {
  s.img.ellipse(x, y + FOOT_DY - 1, 7, 2.6, [10, 12, 20, 110]);
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    const k = (j * hero.width + frameCol * 32 + i) * 4;
    if (hero.data[k + 3] < 20) continue;
    s.img.set(Math.round(x - 16 + i), Math.round(y + FOOT_DY - 30 + j), [hero.data[k], hero.data[k + 1], hero.data[k + 2], 255]);
  }
}

function up(pc: PC, k: number) {
  const o = new PC(pc.w * k, pc.h * k);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, pc.get(Math.floor(x / k), Math.floor(y / k))!);
  return o;
}
function crop(pc: PC, x0: number, y0: number, w: number, h: number) {
  const o = new PC(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = pc.get(x0 + x, y0 + y); if (c) o.set(x, y, c); }
  return o;
}

function main() {
  // озеро с травой: неровный берег — заливы, мыс, островок
  const lakeV = (x: number, y: number) => {
    const dx = (x - 5.2) / 3.7, dy = (y - 3.9) / 2.3;
    let water = dx * dx + dy * dy < 1;
    if (x === 2 && y === 3) water = true;
    if (x === 6 && y === 2) water = true; // залив на севере
    if (x === 4 && y === 4) water = false; // островок
    if (x === 8 && y === 5) water = false;
    return !water;
  };
  const A = scene("grass", 10, 7, lakeV);
  const [h1x, h1y] = walkTo(A, 4 * S + 10, 1 * S, 0, 1); // к северному берегу (стенка под ногами)
  const [h2x, h2y] = walkTo(A, 7 * S + 4, 7 * S - 10, 0, -1); // к южному берегу
  // песчаный берег: море справа-сверху
  const beachV = (x: number, y: number) => x + (y > 3 ? 1 : 0) - (y === 1 ? 1 : 0) < 5 + (y % 3 === 0 ? 1 : 0) || y >= 6;
  const B = scene("sand", 10, 7, beachV);
  const [h3x, h3y] = walkTo(B, 2 * S + 16, 3 * S, 1, 0);
  const A0 = { img: A.img.clone(), walk: A.walk, W: A.W, H: A.H };
  drawHero(A, h1x, h1y); drawHero(A, h2x, h2y);
  drawHero(B, h3x, h3y);

  // зум 3: деталь северного берега с сеткой тайлов и границей прохода (красная — край «можно стоять», жёлтая точка — опора)
  const D = crop(A0.img, 2 * S, 1 * S, 4 * S, 2 * S + 8);
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) {
    const gx = x + 2 * S, gy = y + S;
    const w = A0.walk[gy * A0.W + gx], wr = A0.walk[gy * A0.W + gx + 1], wd = A0.walk[(gy + 1) * A0.W + gx];
    if (w !== wr || w !== wd) D.set(x, y, [230, 40, 40, 255]);
    if ((gx % S === 0 || gy % S === 0) && (x + y) % 2 === 0) D.set(x, y, [255, 255, 255, 90]);
  }
  const Dh = { img: D, walk: new Uint8Array(0), W: D.w, H: D.h };
  drawHero(Dh, h1x - 2 * S, h1y - S);
  D.rect(h1x - 2 * S - 1, h1y - S + FOOT_DY - 1, 3, 3, [255, 220, 60, 255]);

  // лист автотайлов: 15 масок травы и песка
  const sheet = new PC(16 * (S + 2), 2 * (S + 2));
  sheet.rect(0, 0, sheet.w, sheet.h, [24, 20, 30, 255]);
  const wl = waterLayer(S, S, () => false);
  (["grass", "sand"] as Biome[]).forEach((b, r) => { for (let m = 1; m <= 15; m++) { sheet.blit(wl, (m - 1) * (S + 2), r * (S + 2)); sheet.blit(SET[b][m][0].img, (m - 1) * (S + 2), r * (S + 2)); } });

  const now = PNG.sync.read(fs.readFileSync("tools/out/shaders/water-bank5.png"));
  const NOW = new PC(640, 400);
  for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) { const k = ((y * now.width) + 1280 + x) * 4; NOW.set(x, y, [now.data[k], now.data[k + 1], now.data[k + 2], 255]); }

  const out = new PC(1300, 400 * 2 + 10 + 230);
  out.rect(0, 0, out.w, out.h, [18, 16, 22, 255]);
  out.blit(NOW, 0, 0);
  out.blit(up(crop(A.img, 0, 0, 320, 200), 2), 650, 0);
  out.blit(up(crop(B.img, 0, 0, 320, 200), 2), 0, 410);
  out.blit(up(D, 3), 650 + Math.floor((640 - D.w * 3) / 2), 410 + Math.floor((400 - D.h * 3) / 2));
  out.blit(up(sheet, 2), 100, 820);
  fs.mkdirSync("tools/out/shores", { recursive: true });
  out.save("tools/out/shores/mockup.png");
  console.log("tools/out/shores/mockup.png", { north: [h1x, h1y], south: [h2x, h2y], beach: [h3x, h3y] });
}

try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
let got = "";
try {
  // ждём свободный замок (scenario.lock2 или scenario.lock), до 20 мин
  for (let k = 0; k < 240 && !got; k++) {
    for (const L of [LOCK, "tools/out/scenario.lock"]) { try { fs.mkdirSync(L); got = L; break; } catch {} }
    if (!got) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
  if (!got) throw new Error("замок занят");
  fs.writeFileSync(`${got}/owner.txt`, `shores-mockup ${new Date().toISOString()}`);
  main();
} finally {
  if (got) fs.rmSync(got, { recursive: true, force: true });
}
