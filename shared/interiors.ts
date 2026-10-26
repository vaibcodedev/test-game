/**
 * Интерьеры зданий (задача 144): «отдельная комната за дверью». Данные — data/interiors.json, двери снаружи — shared/cities.ts CITY_ENTRANCES.
 * Помещения стоят за восточным краем карты мира (как данж — часть того же мира, но отрезаны): всё, что считает расстояния (мобы, стража, умения,
 * интерес клиента), само не дотягивается между улицей и залом, а внутри видны только зашедшие. Клетки зала отдаёт shared/map.ts cellAt
 * (за краем карты мира), зона — зона улицы перед дверью (zoneAtPx).
 */
import data from "../data/interiors.json";
import { CITY_ENTRANCES } from "./cities";
import { MAP_W, TILE } from "./constants";
import { GP } from "./gameplay";

/** Флаги клеток — как CELL_BLOCK и CELL_WALL в shared/map.ts (этот модуль импортирует map.ts, обратный импорт дал бы цикл). */
const BLOCK = 1, WALL = 2;

export interface InteriorProp { kind: string; x: number; y: number; w: number; h: number }
export interface Interior {
  id: string;
  name: string;
  /** Вид здания снаружи (CITY_ENTRANCES.kind) и город. */
  kind: string;
  city: string;
  style: string;
  /** Размер в тайлах и левый верхний угол зала в пикселях мира. */
  w: number;
  h: number;
  wall: number;
  ox: number;
  oy: number;
  /** Затемнение зала днём (0 — светлый храм). */
  dark: number;
  props: InteriorProp[];
  /** Клетки зала w×h (флаги как у карты). */
  cell: Uint8Array;
  /** Дверь изнутри (точка нажатия, пиксели) и где встаёт вошедший. */
  exitDoor: { x: number; y: number };
  entry: { x: number; y: number };
  /** Дверь снаружи (точка нажатия у основания двери) и где встаёт вышедший (клетка перед дверью). */
  outDoor: { x: number; y: number };
  outSpot: { x: number; y: number };
}

/** Зазор от края карты мира до первого зала и шаг между залами, тайлы: дальше любой дальности умений и обзора (UNIT_FAR). */
const GAP = 64;
const OY = 32;

type RawInterior = { id: string; name: string; kind: string; style: string; w: number; h: number; wall: number; door: number; dark?: number; props: [string, number, number][] };
const FOOT = data.props as Record<string, { w: number; h: number }>;

export const INTERIORS: Interior[] = (data.list as RawInterior[]).flatMap((r, i) => {
  const e = CITY_ENTRANCES.find((c) => c.kind === r.kind);
  if (!e) return [];
  const ox = (MAP_W + GAP + i * GAP) * TILE, oy = OY * TILE;
  const cell = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (y < r.wall) cell[y * r.w + x] = BLOCK | WALL;
    else if (x === 0 || x === r.w - 1 || y === r.h - 1) cell[y * r.w + x] = BLOCK | WALL;
  }
  const props = r.props.map(([kind, x, y]) => ({ kind, x, y, w: FOOT[kind]?.w ?? 1, h: FOOT[kind]?.h ?? 1 }));
  for (const p of props) for (let j = 0; j < p.h; j++) for (let k = 0; k < p.w; k++) cell[(p.y + j) * r.w + p.x + k] |= BLOCK;
  const dx = ox + (r.door + 1) * TILE;
  return [{
    id: r.id, name: r.name, kind: r.kind, city: e.city, style: r.style, w: r.w, h: r.h, wall: r.wall, ox, oy, dark: r.dark ?? 0, props, cell,
    exitDoor: { x: dx, y: oy + r.h * TILE - 4 },
    entry: { x: dx, y: oy + (r.h - 2) * TILE + 16 },
    // дверь — середина фасада (tools/gen/walls141-buildings.ts: x ≈ 55 px из 128, клетка door — вторая слева)
    outDoor: { x: e.door.x * TILE + 23, y: (e.door.y + 1) * TILE - 2 },
    outSpot: { x: e.front.x * TILE + 23, y: e.front.y * TILE + 18 },
  }];
});

/** Правый край пространства игры, px: карта мира и залы за ней (сервер ограничивает клики и прицел этим краем). */
export const PLAY_X1 = (MAP_W + GAP * (INTERIORS.length + 1)) * TILE;
export const playWidth = (m: { w: number }) => (m.w === MAP_W ? PLAY_X1 : m.w * TILE);

export const interiorById = (id: string) => INTERIORS.find((r) => r.id === id);

/** Зал, в котором точка (пиксели), или null. */
export function interiorAt(px: number, py: number): Interior | null {
  if (px < MAP_W * TILE) return null;
  for (const r of INTERIORS) if (px >= r.ox && py >= r.oy && px < r.ox + r.w * TILE && py < r.oy + r.h * TILE) return r;
  return null;
}

/** Клетка за краем карты мира: внутри зала — его флаги, иначе стена (как за краем карты). */
export function interiorCell(px: number, py: number): number {
  const r = interiorAt(px, py);
  if (!r) return BLOCK;
  return r.cell[Math.floor((py - r.oy) / TILE) * r.w + Math.floor((px - r.ox) / TILE)];
}

/** Карта одного зала в его собственных координатах (для A*: сетка мира не покрывает залы). */
const subs = new Map<string, { w: number; h: number; cell: Uint8Array }>();
export function interiorGrid(r: Interior) {
  let g = subs.get(r.id);
  if (!g) subs.set(r.id, (g = { w: r.w, h: r.h, cell: r.cell }));
  return g;
}

/** Дальность нажатия двери (как у NPC), px. */
export const DOOR_RANGE = GP.ranges.door;
/** Затемнение перехода: столько сервер ждёт перед переносом героя, мс. */
export const DOOR_FADE_MS = GP.timers.doorFadeMs;
