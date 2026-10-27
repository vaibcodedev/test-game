/**
 * Инстанс «Пепельные чертоги» (задача 139): отдельная карта-подземелье (как цитадель рейда и арена), общая для всех героев — один живой экземпляр на сервере
 * (server/src/rooms/DungeonRoom.ts). На карте мира осталась только большая лестница-вход (shared/map.ts: DUNGEON_DOOR); здесь — залы, моды и босс.
 * Оформление по глубине: собор павших королей (0) → переход (1) → пепельный склеп (2), реквизит — shared/dungeonDecor.ts, кадры — tools/gen/dungeon-art.ts.
 * Раскладка залов — прежняя (бывший прямоугольник DUNGEON в мире), сдвинута в начало карты: локальные тайлы = прежние − (OX, OY).
 */
import { TILE } from "./constants";
import dungeons from "../data/dungeons.json";
import { buildDungeonDecor, PASSAGES } from "./dungeonDecor";
import { CELL_BLOCK, CELL_WALL, OBJECT_FOOTPRINT, T, ZONES, Zone, rng, type MapObject, type SpawnPoint, type WorldMap } from "./map";

export const DUNGEON_W = 64, DUNGEON_H = 46;
/** Смещение прежних (проектных) координат данжа в локальные. */
const OX = 116, OY = 48;
const DESIGN_ROOMS: [number, number, number, number][] = [
  [146, 52, 150, 56], // вход
  [122, 66, 133, 77], // прихожая (боковая комната)
  [133, 70, 141, 73],
  [141, 70, 143, 73],
  [140, 56, 151, 68], // северный зал
  [140, 75, 151, 87], // южный зал
  [143, 68, 148, 76],
  [148, 70, 151, 73],
  [151, 70, 157, 73],
  [156, 59, 175, 84], // зал босса
];
export const DUNGEON_ROOMS: [number, number, number, number][] = DESIGN_ROOMS.map(([a, b, c, d]) => [a - OX, b - OY, c - OX, d - OY]);
const DESIGN_POOLS: [number, number, number][] = [[143.5, 62.5, 2.6], [146, 81.5, 2.4], [127.5, 74.5, 1.6], [160.5, 63.5, 1.8], [160.5, 79.5, 1.8]];
export const DUNGEON_BOSS = { id: "ashlord", x: 168 - OX, y: 71.5 - OY, arena: 12 };
/** Где встаёт вошедший (клетка перед лестницей выхода) и точка нажатия выхода (пиксели). */
export const DUNGEON_ENTRY = { x: (148 - OX) * TILE + 16, y: (55 - OY) * TILE + 16 };
/** Клетки под лестницей выхода (локальные тайлы): непроходимы. */
/** Общая запись выхода из подземелья (data/dungeons.json): объект kind, ряд основания лестницы (x, y — тайлы), размер непроходимой постройки w×h клеток, куда выводит (outside — название зоны для подписи «Выйти: …»). Новое подземелье подключает выход одной записью в данных. */
export interface DungeonExitDef { kind: string; x: number; y: number; w: number; h: number; outside: string }
export const DUNGEON_DEF = dungeons.ashen as { name: string; exit: DungeonExitDef };
const EX = DUNGEON_DEF.exit;
export const DUNGEON_EXIT_CELLS = { x0: EX.x - EX.w / 2, x1: EX.x + EX.w / 2 - 1, y0: EX.y - EX.h + 1, y1: EX.y };
export const DUNGEON_EXIT = { x: EX.x * TILE + 16, y: EX.y * TILE + 30 };
/** Подпись у выхода («Выйти: Поля вечных битв»). */
export const DUNGEON_EXIT_LABEL = `Выйти: ${EX.outside}`;
/** Ворота данжа: просвет закрыт створками, пока рядом нет героя (сервер: DungeonRoom; клиент зеркалит состояние). cells — клетки просвета (локальные), cx и y — центр и низ ряда, пиксели. */
export interface DungeonGate { id: string; kind: "wood" | "port"; cells: [number, number][]; cx: number; cy: number }
export const DUNGEON_GATES: DungeonGate[] = PASSAGES.filter((p) => p.gate).map((p) => ({
  id: `g${p.row}`, kind: p.gate!,
  cells: Array.from({ length: p.x1 - p.x0 + 1 }, (_, i) => [p.x0 + i - OX, p.row - OY] as [number, number]),
  cx: ((p.x0 + p.x1 + 1) / 2 - OX) * TILE, cy: (p.row - OY) * TILE + 16,
}));
/** Рамка залов (тайлы): для расстановки и проверок. */
export const DUNGEON_RECT = { x0: 120 - OX, y0: 52 - OY, x1: 176 - OX, y1: 90 - OY };

const hash = (x: number, y: number, s: number) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const inRoom = (x: number, y: number) => DUNGEON_ROOMS.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);

/** Глубина клетки от входа по залам (шаги по 4 соседям); у стен — по соседним залам; boss — глубина клетки босса. */
const DEPTH = (() => {
  const depth = new Int16Array(DUNGEON_W * DUNGEON_H).fill(-1);
  const q: number[] = [];
  const [ex0, ey0, ex1] = DUNGEON_ROOMS[0];
  for (let x = ex0; x < ex1; x++) { depth[ey0 * DUNGEON_W + x] = 0; q.push(x, ey0); }
  for (let h = 0; h < q.length; h += 2) {
    const x = q[h], y = q[h + 1], d = depth[y * DUNGEON_W + x];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= DUNGEON_W || ny >= DUNGEON_H || !inRoom(nx, ny)) continue;
      const i = ny * DUNGEON_W + nx;
      if (depth[i] >= 0) continue;
      depth[i] = d + 1;
      q.push(nx, ny);
    }
  }
  return { depth, boss: Math.max(1, depth[Math.floor(DUNGEON_BOSS.y) * DUNGEON_W + Math.floor(DUNGEON_BOSS.x)]) };
})();

/** Стиль каждой комнаты (индексы DESIGN_ROOMS): вход, прихожая, коридор, коридор, северный зал, южный зал, проход, коридор, коридор, зал босса. Переход — только в коридорах и проходах. */
const ROOM_STYLE = [0, 0, 1, 1, 0, 2, 1, 1, 1, 2];
/** Стены-перегородки между залами: ряды, где зал примыкает к другому вплотную; в проёме (x0..x1 включительно) стоит арка или ворота. Дизайнерские координаты. */
const PARTITIONS: { y: number; x0: number; x1: number; gap: [number, number] }[] = [
  { y: 56, x0: 140, x1: 150, gap: [146, 149] }, // вход в северный зал: арка собора
  { y: 68, x0: 143, x1: 147, gap: [144, 147] }, // выход из северного зала в проход: треснувшая арка
  { y: 75, x0: 140, x1: 150, gap: [144, 147] }, // вход в южный зал: железные ворота
];
/** Оформление: 0 — затонувший собор павших королей, 1 — переход (собор трескается), 2 — пепельный склеп. */
export type DungeonStyle = 0 | 1 | 2;
export const DUNGEON_STYLE_AT = [0.34, 0.66] as const;
/** Глубина 0..1 клетки залов; −1 — вне залов. */
export function dungeonDepthK(x: number, y: number): number {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= DUNGEON_W || cy >= DUNGEON_H) return -1;
  let d = DEPTH.depth[cy * DUNGEON_W + cx];
  if (d < 0) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const nx = cx + i, ny = cy + j; if (nx >= 0 && ny >= 0 && nx < DUNGEON_W && ny < DUNGEON_H) d = Math.max(d, DEPTH.depth[ny * DUNGEON_W + nx]); }
  return d < 0 ? -1 : Math.min(1, d / DEPTH.boss);
}
/** Стиль клетки: у стен и за пределами — стиль ближайшего зала (сетка расплыта на 8 клеток). */
const STYLE_GRID = (() => {
  const st = new Int8Array(DUNGEON_W * DUNGEON_H).fill(-1);
  const q: number[] = [];
  // один стиль на комнату (без лоскутов): входной зал и северный зал — собор, переходы-коридоры и проходы между залами — переход, южный зал и зал босса — склеп
  DUNGEON_ROOMS.forEach(([x0, y0, x1, y1], i) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) st[y * DUNGEON_W + x] = ROOM_STYLE[i]; });
  for (let y = 0; y < DUNGEON_H; y++) for (let x = 0; x < DUNGEON_W; x++) if (st[y * DUNGEON_W + x] >= 0) q.push(x, y);
  for (let h = 0; h < q.length; h += 2) {
    const x = q[h], y = q[h + 1];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= DUNGEON_W || ny >= DUNGEON_H || st[ny * DUNGEON_W + nx] >= 0) continue;
      st[ny * DUNGEON_W + nx] = st[y * DUNGEON_W + x];
      q.push(nx, ny);
    }
  }
  return st;
})();
export function dungeonStyle(x: number, y: number): DungeonStyle {
  const cx = Math.max(0, Math.min(DUNGEON_W - 1, Math.floor(x))), cy = Math.max(0, Math.min(DUNGEON_H - 1, Math.floor(y)));
  return Math.max(0, STYLE_GRID[cy * DUNGEON_W + cx]) as DungeonStyle;
}
/** Лужа лавы целиком в переходе или склепе: у границы с собором её не режет стиль. */
function poolInStyle(lx: number, ly: number, r: number): boolean {
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; if (dungeonStyle(lx + Math.cos(a) * (r + 1), ly + Math.sin(a) * (r + 1)) === 0) return false; }
  return dungeonStyle(lx, ly) > 0;
}
/** Вытертая дорожка в зале босса: от западного входа к центру и круг под помостом. */
export function bossHallPath(x: number, y: number): boolean {
  if (Math.hypot(x - DUNGEON_BOSS.x, y - DUNGEON_BOSS.y) < 5.2) return true;
  return x >= 156 - OX && x < DUNGEON_BOSS.x && Math.abs(y - DUNGEON_BOSS.y) < 1.7;
}
const POOLS = DESIGN_POOLS.map(([x, y, r]) => [x - OX, y - OY, r] as [number, number, number]);

function terrainAtV(x: number, y: number): number {
  const st = dungeonStyle(x, y);
  const n = hash(Math.floor(x * 3), Math.floor(y * 3), 77);
  for (const [lx, ly, r] of POOLS) {
    const ddx = x - lx, ddy = y - ly;
    if (ddx * ddx + ddy * ddy < r * r * (0.8 + n * 0.4) && poolInStyle(lx, ly, r)) return T.Lava;
  }
  if (st === 2 && bossHallPath(x, y)) return T.Worn;
  return st === 0 ? T.Marble : st === 1 ? T.CrackedMarble : T.Basalt;
}

let cache: WorldMap | null = null;
/** Карта подземелья (одна на всех, детерминированная): залы, оформление, реквизит, мобы по глубине и Повелитель Пепла. */
export function generateDungeonMap(): WorldMap {
  if (cache) return cache;
  const w = DUNGEON_W, h = DUNGEON_H;
  const vtx = new Uint8Array((w + 1) * (h + 1));
  const cell = new Uint8Array(w * h);
  const zone = new Uint8Array(w * h).fill(Zone.Dungeon);
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) vtx[y * (w + 1) + x] = terrainAtV(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let f = 0;
    if (!inRoom(x, y)) f |= CELL_BLOCK | CELL_WALL;
    else if (vtx[y * (w + 1) + x] === T.Lava && vtx[(y + 1) * (w + 1) + x + 1] === T.Lava) f |= CELL_BLOCK;
    cell[y * w + x] = f;
  }
  // перегородки между залами: сплошная стена с проёмом
  for (const p of PARTITIONS) for (let x = p.x0; x <= p.x1; x++) if (x < p.gap[0] || x > p.gap[1]) cell[(p.y - OY) * w + x - OX] |= CELL_BLOCK | CELL_WALL;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? CELL_BLOCK : cell[y * w + x]);
  const objects: MapObject[] = [];
  const place = (kind: string, x: number, y: number, jitter = 0) => {
    const fp = OBJECT_FOOTPRINT[kind];
    if (fp) for (let j = 0; j < fp.h; j++) for (let i = 0; i < fp.w; i++) cell[(y - j) * w + x + i] |= CELL_BLOCK;
    const fw = fp ? fp.w : 1;
    objects.push({ kind, x: (x + fw / 2) * TILE + jitter, y: (y + 1) * TILE - 2 });
  };
  buildDungeonDecor({
    seed: 0, w, objects, at, place, hash, DG: { x: -OX, y: -OY }, DUNGEON: DUNGEON_RECT, rooms: DUNGEON_ROOMS, style: dungeonStyle, TILE, CELL_WALL, CELL_BLOCK,
    arenaNear: (x, y, r) => Math.hypot(x - DUNGEON_BOSS.x, y - DUNGEON_BOSS.y) < DUNGEON_BOSS.arena + r, boss: DUNGEON_BOSS,
  });
  // лестница выхода занимает клетки у северной стены входного зала (4×2): стоять в картинке нельзя
  for (let y = DUNGEON_EXIT_CELLS.y0; y <= DUNGEON_EXIT_CELLS.y1; y++) for (let x = DUNGEON_EXIT_CELLS.x0; x <= DUNGEON_EXIT_CELLS.x1; x++) cell[y * w + x] |= CELL_BLOCK;
  // лестница выхода у входа: нажатие — клиент ставит «дверь» в этой точке
  objects.push({ kind: EX.kind, x: DUNGEON_EXIT.x, y: DUNGEON_EXIT.y + 4 });
  // мобы по глубине: уровень растёт от входа к залу босса
  const spawns: SpawnPoint[] = [];
  const taken: { x: number; y: number }[] = [];
  const [lo, hi] = ZONES[Zone.Dungeon].levels, mobs = ZONES[Zone.Dungeon].mobs;
  const rs = rng(5551);
  let quota = 28, guard = 0;
  while (quota > 0 && guard++ < 20000) {
    const x = DUNGEON_RECT.x0 + Math.floor(rs() * (DUNGEON_RECT.x1 - DUNGEON_RECT.x0)), y = DUNGEON_RECT.y0 + Math.floor(rs() * (DUNGEON_RECT.y1 - DUNGEON_RECT.y0));
    if (!inRoom(x, y) || at(x, y) & CELL_BLOCK) continue;
    if (Math.hypot(x - DUNGEON_BOSS.x, y - DUNGEON_BOSS.y) < DUNGEON_BOSS.arena * 0.8) continue;
    if (Math.hypot(x - DUNGEON_ENTRY.x / TILE, y - DUNGEON_ENTRY.y / TILE) < 9) continue;
    if (taken.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 16)) continue;
    const k = Math.min(1, Math.max(0, dungeonDepthK(x, y)));
    const level = Math.max(lo, Math.min(hi, Math.round(lo + (hi - lo) * k + (rs() - 0.5) * 2)));
    const idx = Math.min(mobs.length - 1, Math.floor(k * mobs.length * 0.7 + rs() * mobs.length * 0.6));
    spawns.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, mob: mobs[idx], level });
    taken.push({ x, y });
    quota--;
  }
  const dgStyle = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dgStyle[y * w + x] = dungeonStyle(x, y);
  cache = {
    w, h, seed: 0, vtx, cell, zone, objects, spawns, nodes: [],
    bosses: [{ id: DUNGEON_BOSS.id, x: DUNGEON_BOSS.x * TILE, y: DUNGEON_BOSS.y * TILE, arena: DUNGEON_BOSS.arena * TILE }],
    playerSpawn: { x: DUNGEON_ENTRY.x, y: DUNGEON_ENTRY.y },
    merchant: { x: -1000, y: -1000 }, merchants: [], dgStyle,
  };
  return cache;
}

/** Награды босса данжа — раз в сутки на героя (по дате UTC): сколько до новых и подсказка. */
export const DUNGEON_BOSS_COOLDOWN_MS = 24 * 3600 * 1000;
/** Сутки по часам сервера: смена в 00:00 UTC, чтобы все видели один срок. */
export const dayKey = (ms: number) => Math.floor(ms / 86_400_000);
export const nextDayMs = (ms: number) => (dayKey(ms) + 1) * 86_400_000;
export interface DungeonLootStatus { looted: boolean; leftMs: number }
export function bossLootStatus(last: number | undefined, now: number): DungeonLootStatus {
  const looted = last !== undefined && dayKey(last) === dayKey(now);
  return { looted, leftMs: looted ? nextDayMs(now) - now : 0 };
}
/** «14:20» из миллисекунд: часы и минуты. */
export const fmtLeft = (ms: number) => { const m = Math.ceil(ms / 60000); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
