/**
 * Автотайлы берега (docs/water-shores.md, партия 1: трава, песок и лес — дёрн леса темнее). Берег — тайл суши, нависающий над отдельным слоем воды
 * (вода — TileSprite с шейдером только поверхности). Тайл = маска углов dual grid (TL=1, TR=2, BR=4, BL=8, как terrainTiles.ts) × биом × вариант.
 * На тайле: верх суши (сплошной тайл того же биома из terrain.png — стык с землёй без шва), кромка; под северным берегом —
 * нависающий дёрн с прядями и стенка грунта 4 тона с корнями и камешками (вода ниже земли, art-perspective §8), линия воды, тень на воде;
 * у ближнего и боковых берегов — тонкий торец, пена; у песка — мокрая полоса, пена и отмель.
 * Контур: билинейно по углам + шум, гаснущий к краям тайла (край тайла контур пересекает ровно в середине — швов нет при любых вариантах).
 * Проходимость берётся из того же поля: пиксель «можно стоять» = верх суши. Таблица → shared/shoreWalk.ts (сервер и клиент, waterAtFeet).
 * Раскладка shores.png: строка = биом·SHORE_VARIANTS + вариант, столбец = маска − 1 (15 масок, 16-й столбец пуст).
 * Запуск: npx tsx tools/gen/shores.ts → client/public/assets/tiles/shores.png, shared/shoreWalk.ts (и из tools/gen-assets.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { PC, hash01, mix, pnoise, shade, withA, type RGBA } from "./canvas";
import { P } from "./palette";
import { SHORE_BIOMES, SHORE_COLS, SHORE_VARIANTS } from "../../shared/map";
import { buildTileset, TILESET_COLS } from "./tiles";

const S = 32;
type Biome = "grass" | "sand" | "forest";
const sodOf = (b: Biome) => (b === "forest" ? P.forest : P.grass);

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

const H: Record<Biome, number> = { grass: 8, sand: 3, forest: 8 };
const FOAM: RGBA = [228, 244, 255, 255];
const OUTL_SOIL = shade(P.dirt[0], 0.72); // контур — тёмный тон грунта, не чёрный

export interface ShoreTile { img: PC; stand: Uint8Array }

export function shoreTile(b: Biome, mask: number, v: number, top: (x: number, y: number) => RGBA): ShoreTile {
  const img = new PC(S, S), stand = new Uint8Array(S * S);
  const L = new Map<number, boolean>();
  const land = (x: number, y: number) => {
    const k = (y + 16) * 80 + x + 16;
    let r = L.get(k);
    if (r === undefined) { r = shoreField(mask, v, x, y) > 0.5; L.set(k, r); }
    return r;
  };
  const sd = 1000 + v * 97 + mask * 13;
  const h = H[b];
  const SOD = sodOf(b);
  /** Ближайшая суша (евклидово) в радиусе 7 — для полос мокрого края, пены и отмели. */
  const nearLand = (x: number, y: number) => {
    let d = 99;
    for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) if (land(x + i, y + j)) d = Math.min(d, Math.hypot(i, j));
    return d;
  };
  const nearWater = (x: number, y: number) => {
    let d = 99;
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) if (!land(x + i, y + j)) d = Math.min(d, Math.hypot(i, j));
    return d;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (land(x, y)) {
      stand[y * S + x] = 1;
      let c = top(x, y);
      const wD = !land(x, y + 1), wD2 = !land(x, y + 2), wU = !land(x, y - 1), wL = !land(x - 1, y), wR = !land(x + 1, y);
      if (b !== "sand") {
        if (wD) c = hash01(x, y, sd + 1) < 0.18 ? SOD[3] : SOD[4]; // кромка дёрна над обрывом: блик (свет сверху)
        else if (wD2) c = mix(c, SOD[3], 0.55);
        else if (wU) c = mix(c, SOD[0], 0.55); // дальняя кромка ближнего берега — дёрн уходит вниз
        else if (wL) c = mix(c, SOD[4], 0.35);
        else if (wR) c = mix(c, SOD[1], 0.6);
        else if (!land(x, y - 2)) c = mix(c, SOD[1], 0.25);
      } else {
        const d = nearWater(x, y);
        const wet = mix(mix(P.sand[0], P.dune[0], 0.5), P.dirt[3], 0.25); // мокрый песок — тёплый, темнее сухого
        if (wD && d <= 1.01) c = mix(wet, P.dirt[2], 0.35); // кромка над откосом
        else if (d <= 1.01) c = wet;
        else if (d <= 2.01) c = hash01(x, y, sd + 2) < 0.08 ? P.sand[4] : mix(c, wet, 0.8); // мокрый песок с искрой
        else if (d <= 3.01) c = mix(c, wet, 0.55);
        else if (d <= 4.3) c = hash01(x, y, sd + 8) < 0.5 ? mix(c, wet, 0.3) : c; // сохнущий край — дизеринг
        else if (d <= 5.5 && hash01(x, y, sd + 9) < 0.18) c = mix(c, wet, 0.2);
      }
      img.set(x, y, c);
      continue;
    }
    // ---- вода: стенка под сушей сверху, торцы, пена, тень ----
    let dUp = 0;
    for (let d = 1; d <= h + 6; d++) if (land(x, y - d)) { dUp = d; break; }
    if (dUp && dUp <= h) {
      img.set(x, y, faceColor(b, x, y, dUp, land, sd));
      continue;
    }
    if (dUp) {
      const r = dUp - h; // 1 — линия воды, дальше тень на воде
      if (b !== "sand") {
        if (r === 1) img.set(x, y, hash01(x >> 1, y, sd + 3) < 0.45 ? withA(FOAM, 215) : withA([14, 26, 44, 255], 190));
        else if (r === 2) img.set(x, y, hash01(x, y, sd + 4) < 0.18 ? withA(FOAM, 130) : withA([8, 16, 34, 255], 120));
        else img.set(x, y, withA([8, 16, 34, 255], Math.max(0, 100 - (r - 3) * 28)));
        continue;
      }
    }
    const d = nearLand(x, y);
    if (b !== "sand") {
      if (d <= 1.01) img.set(x, y, wSide(x, y, land) ? shade(P.dirt[1], 0.85) : P.dirt[1]); // тонкий торец берега
      else if (d <= 1.5) img.set(x, y, OUTL_SOIL);
      else if (d <= 2.6) img.set(x, y, hash01(x >> 1, y >> 1, sd + 5) < 0.55 ? withA(FOAM, 190) : withA([8, 16, 34, 255], 90));
      else if (d <= 3.6) img.set(x, y, withA(P.water[3], 80));
    } else {
      const fw = 2.1 + (pnoise(x, y, 8, S, sd + 6) - 0.5) * 1.6; // ширина пены — волнистая
      if (dUp === h + 1) img.set(x, y, hash01(x >> 1, y, sd + 17) < 0.7 ? withA(FOAM, 235) : withA(mix(P.dune[0], [20, 30, 50, 255], 0.35), 170)); // пена у подножия откоса
      else if (dUp === h + 2) img.set(x, y, withA(mix(P.dune[0], [20, 30, 50, 255], 0.5), 120)); // тень под откосом
      else if (d <= fw) img.set(x, y, hash01(x >> 1, y, sd + 7) < 0.78 ? withA(FOAM, 240) : withA(mix(P.sand[3], FOAM, 0.5), 220)); // пена прибоя
      else if (d <= fw + 1.2) img.set(x, y, hash01(x, y >> 1, sd + 10) < 0.4 ? withA(FOAM, 150) : withA(mix(P.sand[2], [70, 190, 200, 255], 0.45), 200));
      else if (d <= fw + 6) img.set(x, y, withA(mix(P.sand[2], [60, 185, 195, 255], 0.45), Math.round(195 - (d - fw - 1.2) * 32))); // отмель: песок под водой, бирюза
    }
  }
  return { img, stand };
}
const wSide = (x: number, y: number, land: (x: number, y: number) => boolean) => land(x - 1, y) && !land(x + 1, y);

/** Стенка под сушей (r — ряд от кромки вниз): нависающий дёрн с прядями, тень под ним, грунт 4 тона, корни, камешки, края стенки. */
function faceColor(b: Biome, x: number, y: number, r: number, land: (x: number, y: number) => boolean, sd: number): RGBA {
  // где кончается стенка в этом ряду: слева/справа по ряду вода без суши сверху
  const faceAt = (xx: number) => !land(xx, y) && (() => { for (let d = 1; d <= H[b]; d++) if (land(xx, y - d)) return true; return false; })();
  const endL = !faceAt(x - 1), endR = !faceAt(x + 1), nearR = !faceAt(x + 2);
  let c: RGBA;
  const SOD = sodOf(b);
  if (b === "sand") {
    // откос пляжа 3 px: плотный мокрый песок, тёмный низ, следы ряби
    c = r === 1 ? mix(P.sand[1], P.dune[1], 0.5) : r === 2 ? mix(P.sand[0], P.dune[0], 0.5) : mix(P.dune[0], P.dirt[2], 0.45);
    if (r === 2 && hash01(x >> 1, 3, sd + 16) < 0.25) c = mix(c, P.sand[2], 0.4);
    if (endR) c = shade(c, 0.8); else if (endL) c = mix(c, P.sand[2], 0.3);
    return c;
  }
  const strand = 1 + Math.floor(hash01(x, 0, sd + 11) * 3.2); // длина пряди дёрна 1–4
  if (r === 1) c = endL ? SOD[3] : SOD[2];
  else if (r <= strand) c = r === 2 ? SOD[1] : SOD[0];
  else if (r === strand + 1 || r === 2) c = shade(P.dirt[1], 0.8); // тень под нависанием
  else {
    const t = (r - 2) / (H[b] - 2); // 0 вверху, 1 у воды
    c = t < 0.3 ? P.dirt[3] : t < 0.55 ? P.dirt[2] : t < 0.8 ? P.dirt[1] : P.dirt[0];
    if (r === 5 && (x + (hash01(x >> 2, 0, sd + 12) > 0.5 ? 1 : 0)) % 6 < 2) c = shade(c, 0.85); // слой грунта
    const root = hash01(x, 1, sd + 13);
    if (root < 0.09 && r <= 3 + Math.floor(root * 50)) c = r === strand + 2 ? P.bark[3] : P.bark[1]; // корни
    const pb = hash01(x >> 1, r, sd + 14);
    if (r >= 4 && r <= 7 && pb < 0.1) c = x % 2 === 0 ? P.stone[3] : P.stone[1]; // камешек: свет слева сверху
    if (r === H[b] && hash01(x, 2, sd + 15) < 0.3) c = mix(P.dirt[0], P.water[1], 0.4); // мокрый низ
  }
  if (endR) c = OUTL_SOIL; else if (endL && r > 1) c = mix(c, P.dirt[3], 0.4); else if (nearR) c = shade(c, 0.86);
  return c;
}

/** Биомы берега в порядке SHORE_BIOMES (shared/map.ts) и их строка в terrain.png (верх суши — сплошные столбцы 14–16). */
const BIOMES: Biome[] = ["grass", "sand", "forest"];

export function buildShores(): { png: PC; walk: Uint8Array } {
  const ts = buildTileset();
  const png = new PC(SHORE_COLS * S, SHORE_BIOMES.length * SHORE_VARIANTS * S);
  const walk = new Uint8Array(SHORE_BIOMES.length * SHORE_VARIANTS * 15 * 128);
  SHORE_BIOMES.forEach((t, bi) => {
    const b = BIOMES[bi];
    for (let v = 0; v < SHORE_VARIANTS; v++) {
      const col = 14 + v;
      const top = (x: number, y: number) => ts.get(col * S + x, t * S + y)!;
      for (let mask = 1; mask <= 15; mask++) {
        const tile = shoreTile(b, mask, v, top);
        png.blit(tile.img, (mask - 1) * S, (bi * SHORE_VARIANTS + v) * S);
        const o = ((bi * SHORE_VARIANTS + v) * 15 + mask - 1) * 128;
        for (let k = 0; k < 1024; k++) if (tile.stand[k]) walk[o + (k >> 3)] |= 1 << (k & 7);
      }
    }
  });
  void TILESET_COLS;
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
