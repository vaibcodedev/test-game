/**
 * Индексы тайлов земли (dual grid) и стен данжа — без Phaser: их строит terrain.ts (куски мира) и проверяет офлайн tests/terrain-tiles.ts.
 * Набор client/public/assets/tiles/terrain.png (tools/gen/tiles.ts): строка t — поверхность t (столбцы 0–13 — края по маске углов
 * TL=1, TR=2, BR=4, BL=8 минус 1, 14–17 — сплошная заливка), строка TERRAIN_COUNT — стены данжа (0–1 верх стены, 2–5 лицевая сторона).
 */
import { CELL_WALL, SHORE_COLS, SHORE_GID, SHORE_VARIANTS, shoreAt, TERRAIN_COUNT, type WorldMap } from "../../../shared/map";

/** Столбцов в наборе terrain.png. */
export const COLS = 18;
/** Размер куска мира в тайлах. */
export const CHUNK = 32;

export function cellHash(x: number, y: number) {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Глобальный индекс тайла берега (набор shores.png с firstgid SHORE_GID): строка биом·варианты + вариант, столбец маска − 1. */
export const shoreIndex = (biome: number, variant: number, mask: number) => SHORE_GID + (biome * SHORE_VARIANTS + variant) * SHORE_COLS + mask - 1;

/** Свес стенки берега в клетку ниже (столбцы 16–30 shores.png): клетка под клеткой берега получает низ её стенки, линию воды и тень. −1 — пусто. */
export function shoreSpillLayer(m: WorldMap): Int16Array | null {
  let out: Int16Array | null = null;
  for (let y = 1; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const s = shoreAt(m, x, y - 1);
    if (!s || (s.mask & 3) === 0) continue; // стенка бывает только под сушей верхних углов
    (out ??= new Int16Array(m.w * m.h).fill(-1))[y * m.w + x] = shoreIndex(s.biome, s.variant, s.mask) + 16;
  }
  return out;
}

/** Индексы тайлов всех слоёв по клеткам карты, считаются один раз: слой 0 — стены данжа, 1..TERRAIN_COUNT−1 — поверхности; −1 — пусто, null — слоя на карте нет. */
export function terrainLayers(m: WorldMap, shores = true): (Int16Array | null)[] {
  const V = (x: number, y: number) => m.vtx[y * (m.w + 1) + x];
  const layers: (Int16Array | null)[] = new Array(TERRAIN_COUNT).fill(null);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const c = [V(x, y), V(x + 1, y), V(x + 1, y + 1), V(x, y + 1)];
    const low = Math.min(...c);
    const sh = shores && low <= 1 ? shoreAt(m, x, y) : null; // 0 — вода, 1 — лава // берег автотайлом (shores.png): заменяет тайл нижней суши клетки
    for (let t = 1; t < TERRAIN_COUNT; t++) {
      if (!c.includes(t)) continue;
      if (sh && t === sh.t) { (layers[t] ??= new Int16Array(m.w * m.h).fill(-1))[y * m.w + x] = shoreIndex(sh.biome, sh.variant, sh.mask); continue; }
      let col: number;
      if (t === low) {
        const h = cellHash(x + t * 7, y);
        col = h < 0.55 ? 14 : 15 + Math.floor(((h - 0.55) / 0.45) * 3);
      } else col = ((c[0] >= t ? 1 : 0) | (c[1] >= t ? 2 : 0) | (c[2] >= t ? 4 : 0) | (c[3] >= t ? 8 : 0)) - 1;
      (layers[t] ??= new Int16Array(m.w * m.h).fill(-1))[y * m.w + x] = t * COLS + col;
    }
    if (m.cell[y * m.w + x] & CELL_WALL) {
      const below = y + 1 < m.h && m.cell[(y + 1) * m.w + x] & CELL_WALL;
      (layers[0] ??= new Int16Array(m.w * m.h).fill(-1))[y * m.w + x] = TERRAIN_COUNT * COLS + (m.dgStyle ? m.dgStyle[y * m.w + x] : 0) * 6 + (below ? (x + y) % 2 : 2 + Math.floor(cellHash(x, y) * 4));
    }
  }
  return layers;
}

/** Прямоугольник куска (cx, cy) в тайлах: у правого и нижнего края карты кусок уже. */
export function chunkRect(m: WorldMap, cx: number, cy: number) {
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  return { x0, y0, cw: Math.min(CHUNK, m.w - x0), ch: Math.min(CHUNK, m.h - y0) };
}

/** Строки индексов слоя src в прямоугольнике куска — то, что уходит в putTilesAt; null — у слоя в куске нет ни одного тайла. */
export function chunkRows(m: WorldMap, src: ArrayLike<number>, x0: number, y0: number, cw: number, ch: number): number[][] | null {
  let any = false;
  const data: number[][] = [];
  for (let j = 0; j < ch; j++) {
    const row = new Array<number>(cw);
    for (let i = 0; i < cw; i++) {
      const v = src[(y0 + j) * m.w + x0 + i];
      row[i] = v;
      if (v >= 0) any = true;
    }
    data.push(row);
  }
  return any ? data : null;
}
