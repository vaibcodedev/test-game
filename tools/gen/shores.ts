/**
 * Автотайлы берега (docs/water-shores.md). Берег — тайл суши, нависающий над отдельным слоем воды (вода — TileSprite с шейдером только поверхности).
 * Тайл = маска углов dual grid (TL=1, TR=2, BR=4, BL=8, как terrainTiles.ts) × биом × вариант. Верх суши — сплошной тайл того же биома
 * из terrain.png (стык с землёй без шва); под северным берегом — стенка (вода ниже земли, art-perspective §8), линия воды, тень на воде;
 * у ближнего и боковых берегов — тонкий торец и кромка воды. Стили:
 *   sod   — трава, лес: дёрн с бликом и прядями, стенка грунта 4 тона с корнями и камешками, пена;
 *   beach — песок: мокрая полоса, низкий откос, пена прибоя, бирюзовая отмель;
 *   snow  — снег, лёд: белая кромка с синей тенью, наст слоями, сосульки, ледяная корка у воды;
 *   bog   — болото: низкий топкий берег 2 px, тёмная грязь, тростник, тина на воде, без пены;
 *   rock  — пепел, обсидиан: базальтовая стенка с уступами и трещинами, тёмная вода у подножия.
 * Контур: билинейно по углам + шум, гаснущий к краям тайла (край тайла контур пересекает ровно в середине — швов нет при любых вариантах).
 * Стенка выше тайла не обрезается: её низ («свес», spill) кладётся отдельным слоем в клетку ниже (terrainTiles.shoreSpillLayer).
 * Проходимость — из того же поля: пиксель «можно стоять» = верх суши. Таблица → shared/shoreWalk.ts (сервер и клиент, waterAtFeet).
 * Раскладка shores.png: строка = биом·SHORE_VARIANTS + вариант; столбцы 0–14 — тайл (маска − 1), 16–30 — свес вниз (16 + маска − 1).
 * Запуск: npx tsx tools/gen/shores.ts → client/public/assets/tiles/shores.png, shared/shoreWalk.ts (и из tools/gen-assets.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { PC, hash01, mix, pnoise, shade, withA, type RGBA, type Ramp } from "./canvas";
import { BIOME, P } from "./palette";
import { SHORE_BIOMES, SHORE_COLS, SHORE_SPILL, SHORE_VARIANTS, T } from "../../shared/map";
import { buildTileset } from "./tiles";

const S = 32;
type Style = "sod" | "beach" | "snow" | "bog" | "rock";
interface Look { style: Style; h: number; lip: Ramp; face: Ramp }
/** Вид берега по поверхности нижней суши. h — высота стенки (px), lip — рампа кромки верха, face — рампа стенки. */
const LOOK: Record<number, Look> = {
  [T.Grass]: { style: "sod", h: 8, lip: P.grass, face: P.dirt },
  [T.Sand]: { style: "beach", h: 3, lip: P.sand, face: P.sand },
  [T.Forest]: { style: "sod", h: 12, lip: P.forest, face: P.dirt },
  [T.Snow]: { style: "snow", h: 8, lip: P.snow, face: BIOME.snowRock },
  [T.Ice]: { style: "snow", h: 6, lip: P.snow, face: BIOME.snowRock },
  [T.Bog]: { style: "bog", h: 2, lip: P.bog, face: P.bog },
  [T.Ash]: { style: "rock", h: 12, lip: P.ash, face: [shade(P.ash[0], 0.6), shade(P.ash[0], 0.85), P.ash[1], P.ash[2], P.ash[3]] }, // стенка — тот же тёплый пепельный камень, темнее верха
  [T.Obsidian]: { style: "rock", h: 12, lip: P.obsidian, face: BIOME.basaltR },
};

/** Поле «суша» тайла (>0.5 — суша). За краем тайла — значение на краю (без шума): так видит его сосед. */
export function shoreField(mask: number, v: number, x: number, y: number) {
  const u = Math.max(0, Math.min(1, (x + 0.5) / S)), w = Math.max(0, Math.min(1, (y + 0.5) / S));
  const tl = mask & 1 ? 1 : 0, tr = mask & 2 ? 1 : 0, br = mask & 4 ? 1 : 0, bl = mask & 8 ? 1 : 0;
  const f = tl * (1 - u) * (1 - w) + tr * u * (1 - w) + br * u * w + bl * (1 - u) * w;
  const win = 16 * u * (1 - u) * w * (1 - w);
  const xi = Math.max(0, Math.min(31, x)), yi = Math.max(0, Math.min(31, y));
  const n = (pnoise(xi, yi, 16, S, 700 + mask * 13 + v * 101) - 0.5) * 0.3 + (pnoise(xi, yi, 8, S, 760 + mask * 7 + v * 31) - 0.5) * 0.14 + (pnoise(xi, yi, 4, S, 790 + v) - 0.5) * 0.05;
  return f + n * win;
}

const FOAM: RGBA = [228, 244, 255, 255];
const DEEP: RGBA = [8, 16, 34, 255];

export interface ShoreTile { img: PC; spill: PC; stand: Uint8Array }

export function shoreTile(t: number, mask: number, v: number, top: (x: number, y: number) => RGBA): ShoreTile {
  const L0 = LOOK[t], st = L0.style, h = L0.h, LIP = L0.lip, F = L0.face;
  const img = new PC(S, S + SHORE_SPILL), stand = new Uint8Array(S * S);
  const cache = new Map<number, boolean>();
  const land = (x: number, y: number) => {
    const k = (y + 24) * 96 + x + 24;
    let r = cache.get(k);
    if (r === undefined) { r = shoreField(mask, v, x, y) > 0.5; cache.set(k, r); }
    return r;
  };
  const sd = 1000 + v * 97 + mask * 13 + t * 7;
  const near = (x: number, y: number, wantLand: boolean, R: number) => {
    let d = 99;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (land(x + i, y + j) === wantLand) d = Math.min(d, Math.hypot(i, j));
    return d;
  };
  for (let y = 0; y < S + SHORE_SPILL; y++) for (let x = 0; x < S; x++) {
    const inTile = y < S;
    if (land(x, y)) {
      if (!inTile) continue; // суша клетки ниже — рисует её тайл
      stand[y * S + x] = 1;
      img.set(x, y, landColor(st, LIP, top(x, y), x, y, land, near, sd));
      continue;
    }
    let dUp = 0;
    for (let d = 1; d <= h + 6; d++) if (land(x, y - d)) { dUp = d; break; }
    if (dUp && dUp <= h) { img.set(x, y, faceColor(st, h, LIP, F, x, y, dUp, land, sd)); continue; }
    if (dUp) { const c = waterline(st, F, dUp - h, x, y, sd); if (c) { img.set(x, y, c); continue; } }
    if (!inTile) continue; // в свесе — только стенка, линия воды и тень
    const c = edgeWater(st, LIP, F, near(x, y, true, 7), x, y, land, sd);
    if (c) img.set(x, y, c);
  }
  const tile = new PC(S, S), spill = new PC(S, S);
  tile.blit(img, 0, 0);
  for (let y = 0; y < SHORE_SPILL; y++) for (let x = 0; x < S; x++) { const c = img.get(x, S + y)!; if (c[3]) spill.set(x, y, c); }
  return { img: tile, spill, stand };
}

type Land = (x: number, y: number) => boolean;

/** Верх суши у кромки. */
function landColor(st: Style, LIP: Ramp, c: RGBA, x: number, y: number, land: Land, near: (x: number, y: number, l: boolean, R: number) => number, sd: number): RGBA {
  const wD = !land(x, y + 1), wD2 = !land(x, y + 2), wU = !land(x, y - 1), wL = !land(x - 1, y), wR = !land(x + 1, y);
  if (st === "sod") {
    if (wD) return hash01(x, y, sd + 1) < 0.18 ? LIP[3] : LIP[4]; // кромка дёрна над обрывом: блик (свет сверху)
    if (wD2) return mix(c, LIP[3], 0.55);
    if (wU) return mix(c, LIP[0], 0.55); // дальняя кромка ближнего берега — дёрн уходит вниз
    if (wL) return mix(c, LIP[4], 0.35);
    if (wR) return mix(c, LIP[1], 0.6);
    if (!land(x, y - 2)) return mix(c, LIP[1], 0.25);
    return c;
  }
  if (st === "beach") {
    const d = near(x, y, false, 6);
    const wet = mix(mix(P.sand[0], P.dune[0], 0.5), P.dirt[3], 0.25); // мокрый песок — тёплый, темнее сухого
    if (wD && d <= 1.01) return mix(wet, P.dirt[2], 0.35);
    if (d <= 1.01) return wet;
    if (d <= 2.01) return hash01(x, y, sd + 2) < 0.08 ? P.sand[4] : mix(c, wet, 0.8);
    if (d <= 3.01) return mix(c, wet, 0.55);
    if (d <= 4.3) return hash01(x, y, sd + 8) < 0.5 ? mix(c, wet, 0.3) : c;
    if (d <= 5.5 && hash01(x, y, sd + 9) < 0.18) return mix(c, wet, 0.2);
    return c;
  }
  if (st === "snow") {
    if (wD) return LIP[4]; // белая кромка наста
    if (wD2) return mix(c, LIP[4], 0.6);
    if (wU) return mix(c, P.ice[1], 0.5); // ближний берег: синяя тень кромки
    if (wL) return mix(c, LIP[4], 0.5);
    if (wR) return mix(c, P.ice[1], 0.45);
    const d = near(x, y, false, 3);
    if (d <= 2.5 && hash01(x, y, sd + 3) < 0.25) return mix(c, P.ice[3], 0.4); // ледяная корка у воды
    return c;
  }
  if (st === "bog") {
    const d = near(x, y, false, 4);
    // тростник: стебли 2–4 px у самой воды, светлая метёлка
    const reed = hash01(x, y >> 2, sd + 4);
    if (d <= 3 && reed < 0.16) { const k = Math.floor(reed * 100) % 4; return k === 0 ? P.leafAutumn[2] : k === 1 ? P.leaf[3] : P.leaf[2]; }
    if (d <= 1.01) return mix(P.bog[1], P.dirt[0], 0.4); // топкая грязь
    if (d <= 2.01) return mix(c, P.bog[1], 0.6);
    if (d <= 3.3 && hash01(x, y, sd + 5) < 0.5) return mix(c, P.bog[1], 0.3);
    return c;
  }
  // rock: кромка базальта — холодный блик сверху, тёмный бок справа
  if (wD) return hash01(x, y, sd + 6) < 0.25 ? LIP[3] : LIP[4];
  if (wD2) return mix(c, LIP[3], 0.4);
  if (wU) return mix(c, LIP[0], 0.6);
  if (wL) return mix(c, LIP[4], 0.3);
  if (wR) return mix(c, LIP[0], 0.55);
  return c;
}

/** Стенка под сушей: r — ряд от кромки вниз (1..h). */
function faceColor(st: Style, h: number, LIP: Ramp, F: Ramp, x: number, y: number, r: number, land: Land, sd: number): RGBA {
  const faceAt = (xx: number) => !land(xx, y) && (() => { for (let d = 1; d <= h; d++) if (land(xx, y - d)) return true; return false; })();
  const endL = !faceAt(x - 1), endR = !faceAt(x + 1), nearR = !faceAt(x + 2);
  const t = (r - 1) / Math.max(1, h - 1); // 0 вверху, 1 у воды
  let c: RGBA;
  if (st === "beach") {
    c = r === 1 ? mix(P.sand[1], P.dune[1], 0.5) : r === 2 ? mix(P.sand[0], P.dune[0], 0.5) : mix(P.dune[0], P.dirt[2], 0.45);
    if (r === 2 && hash01(x >> 1, 3, sd + 16) < 0.25) c = mix(c, P.sand[2], 0.4);
    return endR ? shade(c, 0.8) : endL ? mix(c, P.sand[2], 0.3) : c;
  }
  if (st === "bog") {
    c = r === 1 ? mix(P.bog[2], P.dirt[1], 0.4) : mix(P.bog[0], P.dirt[0], 0.5);
    if (hash01(x, r, sd + 17) < 0.2) c = P.moss[0];
    return endR ? shade(c, 0.75) : c;
  }
  if (st === "sod") {
    const strand = 1 + Math.floor(hash01(x, 0, sd + 11) * 3.2); // пряди дёрна 1–4 px
    if (r === 1) c = endL ? LIP[3] : LIP[2];
    else if (r <= strand) c = r === 2 ? LIP[1] : LIP[0];
    else if (r === strand + 1 || r === 2) c = shade(F[1], 0.8); // тень под нависанием
    else {
      const k = (r - 2) / (h - 2);
      c = k < 0.3 ? F[3] : k < 0.55 ? F[2] : k < 0.8 ? F[1] : F[0];
      if ((r === 5 || r === 9) && (x + (hash01(x >> 2, r, sd + 12) > 0.5 ? 1 : 0)) % 6 < 2) c = shade(c, 0.85); // слои грунта
      const root = hash01(x, 1, sd + 13);
      if (root < 0.09 && r <= 3 + Math.floor(root * 70)) c = r === strand + 2 ? P.bark[3] : P.bark[1]; // корни
      if (r >= 4 && r <= h - 1 && hash01(x >> 1, r, sd + 14) < 0.1) c = x % 2 === 0 ? P.stone[3] : P.stone[1]; // камешек: свет слева сверху
      if (r === h && hash01(x, 2, sd + 15) < 0.3) c = mix(F[0], P.water[1], 0.4); // мокрый низ
    }
    const out = shade(F[0], 0.72);
    return endR ? out : endL && r > 1 ? mix(c, F[3], 0.4) : nearR ? shade(c, 0.86) : c;
  }
  if (st === "snow") {
    const drip = 1 + Math.floor(hash01(x, 0, sd + 18) * 4); // сосульки 1–4 px
    if (r === 1) c = LIP[3];
    else if (r <= drip && hash01(x, 5, sd + 19) < 0.4) c = r === drip ? P.ice[4] : P.ice[3];
    else if (r === 2) c = F[2]; // тень под настом
    else {
      c = t < 0.35 ? F[3] : t < 0.6 ? F[2] : t < 0.85 ? F[1] : P.ice[1]; // наст слоями, внизу лёд
      if ((r % 3 === 0) && hash01(x >> 2, r, sd + 20) < 0.6) c = mix(c, F[4], 0.35); // светлые слои наста
      if (r >= h - 1 && hash01(x, r, sd + 21) < 0.3) c = P.ice[2];
    }
    return endR ? shade(F[0], 0.8) : endL && r > 1 ? mix(c, F[4], 0.4) : nearR ? shade(c, 0.88) : c;
  }
  // rock: базальт уступами по 4 px, трещины, светлая полка
  const row = Math.floor((r - 1) / 4), inRow = (r - 1) % 4;
  const bx = (x + row * 5) % 9;
  c = inRow === 0 ? F[3] : t < 0.4 ? F[2] : t < 0.75 ? F[1] : F[0];
  if (r === 1) c = LIP[3];
  if (bx === 0 && inRow > 0) c = F[0]; // вертикальные трещины
  if (inRow === 3) c = shade(c, 0.8); // тень под полкой
  if (hash01(x, r, sd + 22) < 0.05 && r > 2) c = F[4]; // блик на сколе
  return endR ? shade(F[0], 0.8) : endL && r > 1 ? mix(c, F[3], 0.35) : nearR ? shade(c, 0.85) : c;
}

/** Ряды под стенкой (r = 1 — линия воды, дальше тень на воде). */
function waterline(st: Style, F: Ramp, r: number, x: number, y: number, sd: number): RGBA | null {
  if (st === "beach") return r === 1 ? (hash01(x >> 1, y, sd + 17) < 0.7 ? withA(FOAM, 235) : withA(mix(P.dune[0], [20, 30, 50, 255], 0.35), 170)) : r === 2 ? withA(mix(P.dune[0], [20, 30, 50, 255], 0.5), 120) : null;
  if (st === "bog") return r === 1 ? withA(mix(P.bog[0], P.moss[1], 0.4), 200) : r <= 3 && hash01(x, y, sd + 23) < 0.5 ? withA(P.moss[2], 200) : null;
  if (st === "snow") {
    if (r === 1) return withA(P.ice[3], 230); // ледяная корка у подножия
    if (r === 2) return hash01(x >> 1, y, sd + 24) < 0.6 ? withA(P.ice[4], 190) : withA(P.ice[2], 170);
    return withA([20, 40, 90, 255], Math.max(0, 110 - (r - 3) * 30));
  }
  if (st === "rock") {
    if (r === 1) return hash01(x >> 1, y, sd + 25) < 0.35 ? withA(FOAM, 150) : withA(shade(F[0], 0.7), 210);
    return withA(DEEP, Math.max(0, 140 - (r - 2) * 30));
  }
  if (r === 1) return hash01(x >> 1, y, sd + 3) < 0.45 ? withA(FOAM, 215) : withA([14, 26, 44, 255], 190);
  if (r === 2) return hash01(x, y, sd + 4) < 0.18 ? withA(FOAM, 130) : withA(DEEP, 120);
  return withA(DEEP, Math.max(0, 100 - (r - 3) * 28));
}

/** Вода у ближнего и боковых берегов: d — расстояние до суши. */
function edgeWater(st: Style, LIP: Ramp, F: Ramp, d: number, x: number, y: number, land: Land, sd: number): RGBA | null {
  if (st === "beach") {
    const fw = 2.1 + (pnoise(x, y, 8, S, sd + 6) - 0.5) * 1.6; // волнистая пена
    if (d <= fw) return hash01(x >> 1, y, sd + 7) < 0.78 ? withA(FOAM, 240) : withA(mix(P.sand[3], FOAM, 0.5), 220);
    if (d <= fw + 1.2) return hash01(x, y >> 1, sd + 10) < 0.4 ? withA(FOAM, 150) : withA(mix(P.sand[2], [70, 190, 200, 255], 0.45), 200);
    if (d <= fw + 6) return withA(mix(P.sand[2], [60, 185, 195, 255], 0.45), Math.round(195 - (d - fw - 1.2) * 32)); // отмель
    return null;
  }
  if (st === "bog") {
    if (d <= 1.01) return mix(P.bog[0], P.dirt[0], 0.5);
    const n = pnoise(x, y, 8, S, sd + 26);
    if (d <= 8 && n > 0.32 + d * 0.035) return hash01(x, y, sd + 27) < 0.22 ? P.leaf[3] : hash01(x, y, sd + 30) < 0.3 ? P.moss[2] : withA(mix(P.moss[1], P.bog[3], 0.4), 235); // тина и ряска пятнами
    if (d <= 3.6) return withA(mix(P.bog[0], P.moss[0], 0.5), Math.round(170 - d * 30)); // мутная вода у топкого края
    return null;
  }
  const sideDark = land(x - 1, y) && !land(x + 1, y);
  if (st === "snow") {
    if (d <= 1.01) return sideDark ? P.ice[1] : F[1];
    if (d <= 2.6) return hash01(x >> 1, y >> 1, sd + 28) < 0.6 ? withA(P.ice[3], 220) : withA(P.ice[4], 200); // ледяная корка
    if (d <= 4) return withA(P.ice[2], 110);
    return null;
  }
  if (st === "rock") {
    if (d <= 1.01) return sideDark ? shade(F[0], 0.8) : F[1];
    if (d <= 1.6) return shade(F[0], 0.7);
    if (d <= 2.6) return hash01(x >> 1, y, sd + 29) < 0.3 ? withA(FOAM, 140) : withA(DEEP, 110);
    return null;
  }
  if (d <= 1.01) return sideDark ? shade(P.dirt[1], 0.85) : P.dirt[1]; // тонкий торец берега
  if (d <= 1.5) return shade(P.dirt[0], 0.72);
  if (d <= 2.6) return hash01(x >> 1, y >> 1, sd + 5) < 0.55 ? withA(FOAM, 190) : withA(DEEP, 90);
  if (d <= 3.6) return withA(P.water[3], 80);
  void LIP;
  return null;
}

export function buildShores(): { png: PC; walk: Uint8Array } {
  const ts = buildTileset();
  const png = new PC(SHORE_COLS * S, SHORE_BIOMES.length * SHORE_VARIANTS * S);
  const walk = new Uint8Array(SHORE_BIOMES.length * SHORE_VARIANTS * 15 * 128);
  SHORE_BIOMES.forEach((t, bi) => {
    if (!LOOK[t]) throw new Error(`нет вида берега для поверхности ${t}`);
    for (let v = 0; v < SHORE_VARIANTS; v++) {
      const col = 14 + v;
      const top = (x: number, y: number) => ts.get(col * S + x, t * S + y)!;
      for (let mask = 1; mask <= 15; mask++) {
        const tile = shoreTile(t, mask, v, top);
        const row = (bi * SHORE_VARIANTS + v) * S;
        png.blit(tile.img, (mask - 1) * S, row);
        png.blit(tile.spill, (16 + mask - 1) * S, row);
        const o = ((bi * SHORE_VARIANTS + v) * 15 + mask - 1) * 128;
        for (let k = 0; k < 1024; k++) if (tile.stand[k]) walk[o + (k >> 3)] |= 1 << (k & 7);
      }
    }
  });
  return { png, walk };
}

export function writeShores(root = ".") {
  const { png, walk } = buildShores();
  png.save(path.join(root, "client/public/assets/tiles/shores.png"));
  const b64 = Buffer.from(walk).toString("base64");
  fs.writeFileSync(path.join(root, "shared/shoreWalk.ts"), `/** Сгенерировано tools/gen/shores.ts — не править руками. Бит (y*32+x) тайла берега ((биом·SHORE_VARIANTS + вариант)·15 + маска − 1): верх суши, можно стоять. */\nexport const SHORE_WALK_B64 = "${b64}";\n`);
  console.log("shores.png + shared/shoreWalk.ts:", b64.length, "символов");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("gen/shores.ts")) writeShores();
