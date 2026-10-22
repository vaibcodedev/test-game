/**
 * Детерминированный генератор карты. Клиент и сервер вызывают generateMap(seed)
 * и получают одинаковый мир, поэтому карта не передаётся по сети.
 * Внутри только целочисленный хэш и арифметика (никаких Math.sin/pow), чтобы
 * результат был побитово одинаковым в браузере и в Node.
 *
 * Мир (тайлы, MAP_W×MAP_H; задача 132, схема tools/map-plan.ts, вариант А): запад — безопасные земли Сольгарда со столицей Аурелион
 * (четыре зоны по 10 уровней, 1–40), восток — их зеркало: земли Умбрата со столицей Мортхейм; граница земель — река (вход по трём мостам),
 * вдоль реки земли обнесены стеной с воротами у мостов. Между реками (MID) — кольцо 40–80 (четыре пояса вокруг Полей) и «Поля вечных
 * битв» 80–100 (CORE) с Эмберхоллом на оси симметрии вверху и данжем внизу. Уровень растёт к центру.
 * Восток — зеркало запада (непрерывная x → MAP_W − x): шум границ зон считается по сложенной x, реки, дороги, стены и места заданы парами.
 * Зоны, уровни, раскладка, реки, дороги, стены, деревни, лагеря, руины и указатели — в /data/world.json.
 */
import world from "../data/world.json";
import { ENV, resourceOfNode, type MapNode } from "./biomes";
import { CORE, MAP_AXIS, MAP_H, MAP_W, MID, TILE } from "./constants";
import { CITIES, CITY_HOUSES, CITY_STALLS, CITY_TOWERS, CITY_WALL, STYLE, cityDecor, cityGround, inCityRect, isCityGate, type City, type CityStyle } from "./cities";
import { BUILDINGS, inTownRect, isGate, STALLS, TOWERS, TOWN, TOWN_HALF, townGround, WALL } from "./town";
import * as D from "./decor";

export { TOWN } from "./town";
export { CORE } from "./constants";

/** Типы поверхности в порядке отрисовки: следующий рисуется краем поверх предыдущего. */
export enum T {
  Water,
  Lava,
  Sand,
  Bog,
  Ash,
  Dirt,
  Grass,
  Forest,
  Cobble,
  Floor,
  Snow,
  Ice,
  Obsidian,
  Dune,
  Seabed,
}
export const TERRAIN_COUNT = 15;
export const TERRAIN_KEYS = ["water", "lava", "sand", "bog", "ash", "dirt", "grass", "forest", "cobble", "floor", "snow", "ice", "obsidian", "dune", "seabed"];
const BLOCKING = new Set<T>([T.Water, T.Lava]);

/** Зоны мира. Порядок значений не меняется (номер зоны хранится в карте); новые — в конец. Названия и уровни — /data/world.json. */
export enum Zone {
  Town,
  Meadow,
  Forest,
  Swamp,
  Ashlands,
  Dungeon,
  Arena,
  Frontier,
  Desert,
  Snow,
  Volcano,
  /** Солёное побережье (бывшая подводная бухта; подводных локаций нет). */
  Coast,
  /** Малые города (shared/cities.ts). */
  OasisCity,
  SnowCity,
  /** Столицы фракций. */
  SolgardCity,
  UmbrathCity,
  /** Земли Сольгарда (запад) и Умбрата (восток). */
  SunFields,
  KingsWood,
  Barrows,
  MistWood,
  GryphonCliffs,
  BoneRidge,
  FallenBarrens,
  PlagueMarsh,
  /** Края середины: север и юг (Volcano — юг). */
  StormPeaks,
  /** Восточное кольцо середины (вход из земель Умбрата). */
  AshFoothills,
  /** Цитадель Хаоса: карта рейда (shared/raid.ts), в мире не встречается. */
  Citadel,
  /** Поля вечных битв (80–100 ур.): центр карты между фортами, вокруг Эмберхолла и данжа (задача 132). */
  Fields,
}
export const ZONE_COUNT = 28;
/** Зона города (безопасная, мобы не заходят). */
export const isTownZone = (z: Zone) => z === Zone.Town || z === Zone.OasisCity || z === Zone.SnowCity || z === Zone.SolgardCity || z === Zone.UmbrathCity;
const CITY_ZONE: Record<string, Zone> = { oasis: Zone.OasisCity, snow_valley: Zone.SnowCity, aurelion: Zone.SolgardCity, morthaim: Zone.UmbrathCity };
const CITY_OF_ZONE = new Map<Zone, City>(CITIES.filter((c) => CITY_ZONE[c.id] !== undefined).map((c) => [CITY_ZONE[c.id], c]));
export interface ZoneInfo {
  name: string;
  levels: [number, number];
  safe: boolean;
  mobs: string[];
  /** Подпись под названием зоны вместо уровней. */
  note?: string;
  /** Опасность зоны для подписи в интерфейсе: unsafe — кольцо 40–80, deadly — Поля вечных битв 80–100 (zoneDanger). */
  danger?: "unsafe" | "deadly";
  /** Зоны без места в мире (в enum остались ради порядка номеров): в бестиарии и списках админки их нет. */
  unused?: boolean;
  /** Каким биомом рисуется зона (поверхность, декор, эффекты, окружение). */
  style: Zone;
}
/** Пересчёт уровней: зоны заданы под designCap, реальный кап — levelCap (data/world.json). */
const LEVEL_SCALE = world.levels.levelCap / world.levels.designCap;
export const scaleLevel = (n: number) => (n <= 0 ? 0 : Math.max(1, Math.round(n * LEVEL_SCALE)));
type RawZone = { name: string; levels: number[]; mobs: string[]; safe?: boolean; note?: string; style?: string; danger?: string; unused?: boolean };
const RAW_ZONES = world.zones as Record<string, RawZone>;
export const ZONES: ZoneInfo[] = Array.from({ length: ZONE_COUNT }, (_, z) => {
  const r = RAW_ZONES[Zone[z]];
  if (!r) throw new Error(`data/world.json: нет зоны ${Zone[z]}`);
  const style = r.style ? (Zone[r.style as keyof typeof Zone] as Zone) : (z as Zone);
  const danger = r.danger === "unsafe" || r.danger === "deadly" ? r.danger : undefined;
  return { name: r.name, levels: [scaleLevel(r.levels[0]), scaleLevel(r.levels[1])], safe: !!r.safe, mobs: r.mobs, note: r.note, danger, unused: r.unused || undefined, style };
});
/** Подпись опасности зоны (решение 1, задача 132): кольцо 40–80 — «Небезопасная зона», Поля вечных битв 80–100 — прямо «Опасная зона». */
export const DANGER_LABEL = { unsafe: "Небезопасная зона", deadly: "Опасная зона" } as const;
export const zoneDanger = (z: Zone): string | null => {
  const d = ZONES[z]?.danger;
  return d ? DANGER_LABEL[d] : null;
};
/** Базовый биом зоны (новые зоны рисуются как старые: Золотые нивы — как холмы и т. п.). */
export const zoneStyle = (z: Zone): Zone => ZONES[z]?.style ?? z;
const zoneByName = (n: string) => Zone[n as keyof typeof Zone] as Zone | undefined;

/** Версия раскладки мира: при смене позиции из старых сохранений сбрасываются к точке появления. */
export const MAP_VERSION = 5;

export const CELL_BLOCK = 1;
export const CELL_WALL = 2;
export const CELL_RESERVED = 4; // дороги, арены, город: без декора и мобов

export interface MapObject {
  kind: string;
  /** Пиксели: нижняя середина спрайта. */
  x: number;
  y: number;
  /** Надпись (указатели у перекрёстков). */
  label?: string;
}
export interface SpawnPoint {
  x: number;
  y: number;
  mob: string;
  level: number;
}
export interface BossSpawn {
  id: string;
  x: number;
  y: number;
  arena: number; // радиус арены в пикселях
}
export interface WorldMap {
  w: number;
  h: number;
  seed: number;
  /** (w+1)*(h+1) вершин: тип поверхности в углах тайлов (dual grid). */
  vtx: Uint8Array;
  cell: Uint8Array;
  zone: Uint8Array;
  objects: MapObject[];
  spawns: SpawnPoint[];
  bosses: BossSpawn[];
  /** Узлы добычи ресурсов (id — индекс в objects). */
  nodes: MapNode[];
  /** Нейтральная точка появления (Эмберхолл): старые сохранения, арена. Герои фракций появляются в своих столицах (homeCity). */
  playerSpawn: { x: number; y: number };
  merchant: { x: number; y: number };
  /** Все торговцы (Марфа и торговцы городов): сюда ходят продавать и покупать. */
  merchants: { x: number; y: number }[];
}

/** Какие объекты непроходимы и сколько клеток занимают (от клетки привязки вправо и вверх). */
export const OBJECT_FOOTPRINT: Record<string, { w: number; h: number } | undefined> = {
  ...D.VENDOR_FOOTPRINT, // деревья, заборы, обрывы, кладбище из паков (shared/decor.ts); наши oak, pine, dead_tree убраны
  rock: { w: 1, h: 1 },
  big_rock: { w: 2, h: 1 },
  house: { w: 4, h: 3 },
  house_blue: { w: 4, h: 3 },
  fountain: { w: 2, h: 2 },
  stall: { w: 2, h: 1 },
  pillar: { w: 1, h: 1 },
  crate: { w: 1, h: 1 },
  lamp: { w: 1, h: 1 },
  well: { w: 1, h: 1 },
  barrel: { w: 1, h: 1 },
  stall_blue: { w: 2, h: 1 },
  stall_green: { w: 2, h: 1 },
  wall_h: { w: 1, h: 1 },
  wall_v: { w: 1, h: 1 },
  tower: { w: 2, h: 2 },
  tavern: { w: 7, h: 4 },
  bank: { w: 6, h: 4 },
  forge: { w: 5, h: 3 },
  arena_gate: { w: 4, h: 2 },
  anvil: { w: 1, h: 1 },
  cauldron: { w: 1, h: 1 },
  dummy: { w: 1, h: 1 },
  weapon_rack: { w: 1, h: 1 },
  hay: { w: 1, h: 1 },
  teleport_stone: { w: 1, h: 1 },
  sand_wall_h: { w: 1, h: 1 },
  sand_wall_v: { w: 1, h: 1 },
  sand_tower: { w: 2, h: 2 },
  sand_house: { w: 4, h: 3 },
  sand_house_b: { w: 4, h: 3 },
  pal_h: { w: 1, h: 1 },
  pal_v: { w: 1, h: 1 },
  pal_tower: { w: 2, h: 2 },
  log_house: { w: 4, h: 3 },
  log_house_b: { w: 4, h: 3 },
  stall_sand: { w: 2, h: 1 },
  tent: { w: 3, h: 2 },
  brazier: { w: 1, h: 1 },
  cactus: { w: 1, h: 1 },
  palm: { w: 1, h: 1 },
  sandstone: { w: 1, h: 1 },
  snow_pine: { w: 1, h: 1 },
  snow_rock: { w: 1, h: 1 },
  ice_spike: { w: 1, h: 1 },
  obsidian_spire: { w: 1, h: 1 },
  basalt: { w: 1, h: 1 },
  node_cactus: { w: 1, h: 1 },
  node_ice: { w: 1, h: 1 },
  node_obsidian: { w: 1, h: 1 },
  node_pearl: { w: 1, h: 1 },
  // столицы фракций
  sol_wall_h: { w: 1, h: 1 },
  sol_wall_v: { w: 1, h: 1 },
  sol_tower: { w: 2, h: 2 },
  sol_house: { w: 4, h: 3 },
  sol_temple: { w: 4, h: 3 },
  stall_gold: { w: 2, h: 1 },
  sun_banner: { w: 1, h: 1 },
  sun_statue: { w: 1, h: 1 },
  umb_wall_h: { w: 1, h: 1 },
  umb_wall_v: { w: 1, h: 1 },
  umb_tower: { w: 2, h: 2 },
  umb_house: { w: 4, h: 3 },
  umb_crypt: { w: 4, h: 3 },
  stall_purple: { w: 2, h: 1 },
  soul_brazier: { w: 1, h: 1 },
  crown_banner: { w: 1, h: 1 },
  bone_pile: { w: 1, h: 1 },
  dark_obelisk: { w: 1, h: 1 },
  // дороги и поселения
  signpost: { w: 1, h: 1 },
  ruin_pillar: { w: 1, h: 1 },
  ruin_wall: { w: 2, h: 1 },
  campfire: { w: 1, h: 1 },
};
/** Объекты, лежащие на земле (под юнитами): мосты, лестницы, лазы, могилы. */
export const GROUND_OBJECTS = new Set(["bridge_h", "bridge_v", ...D.VENDOR_GROUND]);

// ---------- раскладка мира (data/world.json: layout, rivers, roads, walls; задача 132) ----------
type Line = [number, number][];
const isLine = (v: unknown): v is Line => Array.isArray(v);
const LAYOUT = world.layout;
const AXIS = MAP_AXIS;
/** Сложенная x (западная половина): шум и границы зон считаются по ней, поэтому восток — точное зеркало запада (x → MAP_W − x). */
const foldX = (x: number) => (x > AXIS ? MAP_W - x : x);
const RIVERS = Object.entries(world.rivers)
  .filter(([k]) => k !== "_doc")
  .map(([name, r]) => ({ name, ...(r as unknown as { width: number; path: Line }) }));
/** Ось x ломаной на высоте y (ломаная идёт сверху вниз). */
function pathX(path: Line, y: number): number {
  for (let i = 0; i < path.length - 1; i++) {
    const [x0, y0] = path[i], [x1, y1] = path[i + 1];
    if (y >= y0 && y <= y1) return y1 === y0 ? x0 : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return path[y < path[0][1] ? 0 : path.length - 1][0];
}
/** Полустроки карты: y = k/2, k = 0…2·MAP_H. Генератор спрашивает ось реки и стены миллионы раз и почти всегда на целой или половинной y. */
const HALF_ROWS = 2 * MAP_H + 1;
/** Ось ломаной на каждой полустроке (те же значения, что даёт pathX, только посчитанные один раз при загрузке). */
function pathTable(path: Line): Float64Array {
  const t = new Float64Array(HALF_ROWS);
  for (let k = 0; k < HALF_ROWS; k++) t[k] = pathX(path, k / 2);
  return t;
}
/** Ось ломаной на высоте y: из таблицы на полустроке, иначе по ломаной (тесты и инструменты спрашивают любую y). */
function tableX(tab: Float64Array, path: Line, y: number): number {
  const k = y * 2;
  return k >= 0 && k < HALF_ROWS && Number.isInteger(k) ? tab[k] : pathX(path, y);
}
/** Западная река (Светлая) — граница безопасных земель Сольгарда; восточная — её зеркало. */
const RIVER_W = RIVERS.find((r) => r.path[0][0] < AXIS)!;
const RIVER_TAB = pathTable(RIVER_W.path);
/** Ось западной реки на высоте y (тайлы). */
export const riverX = (y: number) => tableX(RIVER_TAB, RIVER_W.path, y);
/** Эллиптическое расстояние от столицы (в долях оболочки: 1 — у реки на уровне столицы) и от центра Полей (1 — край Полей). */
// sqrt (а не hypot): корень точен по IEEE, а hypot в разных движках может отличаться в последнем бите — карта у клиента и сервера должна совпадать
const ell = (dx: number, dy: number, a: number, b: number) => { const u = dx / a, v = dy / b; return Math.sqrt(u * u + v * v); };
const uOf = (x: number, y: number) => ell(x - LAYOUT.capital[0], y - LAYOUT.capital[1], LAYOUT.shell.a, LAYOUT.shell.b);
const vOf = (x: number, y: number) => ell(x - LAYOUT.fields.cx, y - LAYOUT.fields.cy, LAYOUT.fields.rx, LAYOUT.fields.ry);
const zoneList = (names: string[]) => names.map((n) => {
  const z = zoneByName(n);
  if (z === undefined) throw new Error(`data/world.json layout: нет зоны ${n}`);
  return z;
});
/** Четыре зоны безопасных земель (от столицы к реке) и четыре пояса кольца (от реки к Полям) — по стороне. */
const LAND_ZONES = { west: zoneList(LAYOUT.lands.west), east: zoneList(LAYOUT.lands.east) };
const RING_ZONES = { west: zoneList(LAYOUT.ring.west), east: zoneList(LAYOUT.ring.east) };
const LAND_INDEX = new Map<Zone, number>([...LAND_ZONES.west, ...LAND_ZONES.east].map((z, i) => [z, i % 4]));
const RING_INDEX = new Map<Zone, number>([...RING_ZONES.west, ...RING_ZONES.east].map((z, i) => [z, i % 4]));
/** Границы оболочек земель по u (начало — кромка безмобной полосы вокруг столицы, где уровень 1; три границы; 1 — река) и поясов кольца по v (1 — край Полей … последняя — внешний край 40–50). */
const U_EDGES = [LAYOUT.shell.start, ...LAYOUT.shell.u, 1];
const V_EDGES = LAYOUT.fields.belts;
const NOISE = LAYOUT.noise;
const VOLCANO_Y = LAYOUT.volcanoY;

/** Данж нарисован вручную (карта 180×140) и не масштабируется; центр его прямоугольника ставится в layout.dungeon. */
const DG = { x: LAYOUT.dungeon.cx - 148, y: LAYOUT.dungeon.cy - 71 };
/** Прямоугольник данжа (тайлы) и его залы [x0, y0, x1, y1) — для проверок связности. */
export const DUNGEON = { x0: 120 + DG.x, y0: 52 + DG.y, x1: 176 + DG.x, y1: 90 + DG.y };
export const DUNGEON_ROOMS = ([
  [146, 52, 150, 56], // вход с севера, из центра Полей (на оси симметрии)
  [122, 66, 133, 77], // прихожая (боковая комната)
  [133, 70, 141, 73],
  [141, 70, 143, 73], // соединяет коридор прихожей с проходом между залами (раньше обрывался)
  [140, 56, 151, 68], // северный зал
  [140, 75, 151, 87], // южный зал
  [143, 68, 148, 76],
  [148, 70, 151, 73], // соединяет проход между залами с коридором к залу босса (раньше обрывался)
  [151, 70, 157, 73],
  [156, 59, 175, 84], // зал босса
] as const).map(([x0, y0, x1, y1]) => [x0 + DG.x, y0 + DG.y, x1 + DG.x, y1 + DG.y] as [number, number, number, number]);
const LAVA_POOLS: [number, number, number][] = ([
  [143.5, 62.5, 2.6],
  [146, 81.5, 2.4],
  [127.5, 74.5, 1.6],
  [160.5, 63.5, 1.8],
  [160.5, 79.5, 1.8],
] as const).map(([x, y, r]) => [x + DG.x, y + DG.y, r] as [number, number, number]);
/**
 * Глубина залов данжа от входа с севера (шаги по клеткам залов, 4 соседа): уровень мобов растёт от входа к залу босса, а не от прежних западных ворот.
 * depth — по клеткам прямоугольника DUNGEON (−1 — не зал), boss — глубина клетки Повелителя Пепла.
 */
const DUNGEON_DEPTH = (() => {
  const dw = DUNGEON.x1 - DUNGEON.x0, dh = DUNGEON.y1 - DUNGEON.y0;
  const depth = new Int16Array(dw * dh).fill(-1);
  const q: number[] = [];
  const [ex0, ey0, ex1] = DUNGEON_ROOMS[0]; // вход: верхняя строка первого зала
  for (let x = ex0; x < ex1; x++) {
    depth[(ey0 - DUNGEON.y0) * dw + x - DUNGEON.x0] = 0;
    q.push(x, ey0);
  }
  for (let h = 0; h < q.length; h += 2) {
    const x = q[h], y = q[h + 1], d = depth[(y - DUNGEON.y0) * dw + x - DUNGEON.x0];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < DUNGEON.x0 || ny < DUNGEON.y0 || nx >= DUNGEON.x1 || ny >= DUNGEON.y1 || !inRooms(nx, ny)) continue;
      const i = (ny - DUNGEON.y0) * dw + nx - DUNGEON.x0;
      if (depth[i] >= 0) continue;
      depth[i] = d + 1;
      q.push(nx, ny);
    }
  }
  return { depth, dw, boss: Math.max(1, depth[(71 + DG.y - DUNGEON.y0) * dw + 168 + DG.x - DUNGEON.x0]) };
})();
const MID_Y1 = MID.y + MID.h;
const ROADS: Line[] = Object.values(world.roads).filter(isLine);

/**
 * Ровные площадки вокруг городов (центр в тайлах, r — радиус свободной зоны): без воды, лавы и мобов. Центр — центр клетки города (+0,5),
 * поэтому зеркальные города (клетка i ↔ MAP_W − 1 − i) дают зеркальные круги.
 */
export const CITY_SITES = CITIES.filter((c) => c.style).map((c) => ({ id: c.id, name: c.name, x: c.x + 0.5, y: c.y + 0.5, r: c.capital ? 16 : 14 }));
/** Расстояние до ближайшей площадки в долях её радиуса (меньше 1 — внутри). */
function siteDist(x: number, y: number): number {
  let best = 1e18;
  for (const s of CITY_SITES) {
    const dx = x - s.x, dy = y - s.y, k = (dx * dx + dy * dy) / (s.r * s.r);
    if (k < best) best = k;
  }
  return Math.sqrt(best);
}
/** Пруд оазиса в кольце 40–50 (центр в тайлах, западный; восточный — его зеркало). */
const OASIS_POND = { x: LAYOUT.oasisPond[0], y: LAYOUT.oasisPond[1] };
/** Расстояние от точки (непрерывные тайлы) до центра ближайшего из двух прудов: x складывается по оси, поэтому восточный пруд — зеркало западного. */
const pondDist = (x: number, y: number) => {
  const dx = foldX(x) - OASIS_POND.x, dy = y - OASIS_POND.y;
  return Math.sqrt(dx * dx + dy * dy); // sqrt, а не hypot: корень точен по IEEE, карта у клиента и сервера должна совпадать побитно
};
/** Боссы (пары мест кольца и Полей, мировой босс на оси — layout.bossSlots; пока три прежних босса); пиксели. */
export const BOSS_SPAWNS: BossSpawn[] = [
  ...LAYOUT.bosses.map((b) => ({ id: b.id, x: b.x * TILE, y: b.y * TILE, arena: b.arena * TILE })),
  { id: "ashlord", x: (168 + DG.x) * TILE, y: (71.5 + DG.y) * TILE, arena: 12 * TILE },
];

/** Деревни, лагеря, руины и места встреч (тайлы). */
export interface Place {
  id: string;
  name: string;
  kind: "village" | "camp" | "ruins" | "meeting";
  look?: "sol" | "umb" | "mid";
  x: number;
  y: number;
  mob?: string;
  n?: number;
}
export const PLACES: Place[] = world.places.list as Place[];
const PLACE_R = 8;
/** Центры мест — центры их клеток (+0,5): зеркальные места (клетка i ↔ MAP_W − 1 − i) дают зеркальные круги и для вершин поверхности, и для центров клеток. */
const PLACE_CENTERS = PLACES.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
/** Корзины 16×16 тайлов: 1 — корзину задевает круг какого-нибудь места (остальные проверки пропускаются сразу). */
const PB = 16, PBX = Math.ceil(MAP_W / PB), PBY = Math.ceil(MAP_H / PB);
const PLACE_BUCKET = (() => {
  const f = new Uint8Array(PBX * PBY);
  for (const c of PLACE_CENTERS) {
    for (let by = Math.max(0, Math.floor((c.y - PLACE_R) / PB)); by <= Math.min(PBY - 1, Math.floor((c.y + PLACE_R) / PB)); by++) {
      for (let bx = Math.max(0, Math.floor((c.x - PLACE_R) / PB)); bx <= Math.min(PBX - 1, Math.floor((c.x + PLACE_R) / PB)); bx++) f[by * PBX + bx] = 1;
    }
  }
  return f;
})();
/** Рядом ли точка (непрерывные тайлы) с поселением: внутри круга радиуса PLACE_R вокруг его центра. */
const placeNear = (x: number, y: number) => {
  const bx = Math.floor(x / PB), by = Math.floor(y / PB);
  if (bx < 0 || by < 0 || bx >= PBX || by >= PBY || !PLACE_BUCKET[by * PBX + bx]) return false;
  for (const c of PLACE_CENTERS) {
    const dx = x - c.x, dy = y - c.y;
    if (dx * dx + dy * dy < PLACE_R * PLACE_R) return true;
  }
  return false;
};

/** Расстояние в тайлах от точки (в тайлах) до прямоугольника города (0 внутри). */
export function townDist(x: number, y: number): number {
  const ex = Math.max(0, Math.abs(x - (TOWN.x + 0.5)) - TOWN_HALF.x - 0.5);
  const ey = Math.max(0, Math.abs(y - (TOWN.y + 0.5)) - TOWN_HALF.y - 0.5);
  return Math.sqrt(ex * ex + ey * ey);
}

// ---------- шум и случайность ----------
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, scale: number, s: number): number {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
export function fbm(x: number, y: number, s: number): number {
  return vnoise(x, y, 18, s) * 0.55 + vnoise(x, y, 8, s + 11) * 0.3 + vnoise(x, y, 3.5, s + 23) * 0.15;
}
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}
/**
 * Отрезки ломаных, разложенные по корзинам 16×16 тайлов: расстояние точное в пределах REACH тайлов,
 * дальше — «далеко» (1000). Так большая карта с сотней отрезков считается быстро.
 */
class SegIndex {
  private static B = 16;
  private static REACH = 16;
  private segs: number[] = [];
  private buckets: number[][];
  private nx: number;
  constructor(lines: { pts: Line; w: number }[]) {
    const B = SegIndex.B, R = SegIndex.REACH;
    this.nx = Math.ceil((MAP_W + 2) / B) + 1;
    const ny = Math.ceil((MAP_H + 2) / B) + 1;
    this.buckets = Array.from({ length: this.nx * ny }, () => []);
    for (const { pts, w } of lines) for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const id = this.segs.length / 5;
      this.segs.push(ax, ay, bx, by, w);
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R) / B)), x1 = Math.min(this.nx - 1, Math.floor((Math.max(ax, bx) + R) / B));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - R) / B)), y1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + R) / B));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.buckets[y * this.nx + x].push(id);
    }
  }
  /** Расстояние до ближайшего отрезка минус его полуширина. */
  dist(x: number, y: number): number {
    const B = SegIndex.B;
    const bx = Math.floor(x / B), by = Math.floor(y / B);
    const list = bx < 0 || by < 0 || bx >= this.nx ? undefined : this.buckets[by * this.nx + bx];
    if (!list || !list.length) return 1000;
    let best = 1000;
    const s = this.segs;
    for (const id of list) {
      const o = id * 5;
      const d = segDist(x, y, s[o], s[o + 1], s[o + 2], s[o + 3]) - s[o + 4];
      if (d < best) best = d;
    }
    return best;
  }
}
const ROAD_INDEX = new SegIndex(ROADS.map((pts) => ({ pts, w: 0 })));
const RIVER_INDEX = new SegIndex(RIVERS.map((r) => ({ pts: r.path, w: r.width })));
export function roadDist(x: number, y: number): number {
  return ROAD_INDEX.dist(x, y);
}
/** Расстояние до берега реки (меньше 0 — в воде). */
const riverEdge = (x: number, y: number) => RIVER_INDEX.dist(x, y);

const inDungeon = (x: number, y: number) => x >= DUNGEON.x0 && x < DUNGEON.x1 && y >= DUNGEON.y0 && y < DUNGEON.y1;
function inRooms(cx: number, cy: number) {
  for (const [x0, y0, x1, y1] of DUNGEON_ROOMS) if (cx >= x0 && cx < x1 && cy >= y0 && cy < y1) return true;
  return false;
}
function bossNear(x: number, y: number, extra: number): BossSpawn | null {
  for (const b of BOSS_SPAWNS) {
    const dx = x - b.x / TILE, dy = y - b.y / TILE, r = b.arena / TILE + extra;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

/**
 * Кольцо 40–80: четыре пояса вокруг Полей вечных битв (v — расстояние от центра Полей в долях их эллипса). У реки пояс 40–50, у Полей 70–80;
 * зоны поясов — по стороне (запад — пустыни и утёсы, восток — пепел и топи). mx, my — координаты с шумом границы.
 */
function frontierZone(mx: number, my: number, west: boolean): Zone {
  const v = vOf(mx, my);
  const belt = v < V_EDGES[1] ? 3 : v < V_EDGES[2] ? 2 : v < V_EDGES[3] ? 1 : 0;
  return (west ? RING_ZONES.west : RING_ZONES.east)[belt];
}

/** Безопасные земли фракции (с реки до края карты): четыре оболочки вокруг столицы по 10 уровней. mx, my — координаты с шумом границы. */
function landsZone(mx: number, my: number, west: boolean): Zone {
  const u = uOf(mx, my);
  const i = u < U_EDGES[1] ? 0 : u < U_EDGES[2] ? 1 : u < U_EDGES[3] ? 2 : 3;
  return (west ? LAND_ZONES.west : LAND_ZONES.east)[i];
}

export function zoneAt(x: number, y: number, seed: number): Zone {
  if (inDungeon(x, y)) return Zone.Dungeon;
  const fx = Math.floor(x), fy = Math.floor(y);
  if (inTownRect(fx - TOWN.x, fy - TOWN.y)) return Zone.Town;
  for (const c of CITIES) if (c.style && inCityRect(fx - c.x, fy - c.y)) return CITY_ZONE[c.id];
  // границы зон извилистые: крупный шум (масштаб ×3) плюс мелкий; считается по сложенной x, поэтому восток — зеркало запада
  const west = x < AXIS, xm = foldX(x);
  const nb = (fbm(xm / 3, y / 3, seed + 71) - 0.5) * 1.6 + (fbm(xm, y, seed + 73) - 0.5) * 0.5;
  const mx = xm + nb * NOISE.x, my = y + nb * NOISE.y;
  // река — граница безопасных земель: без шума
  if (xm < riverX(y)) return landsZone(mx, my, west);
  if (vOf(mx, my) < 1) return my > VOLCANO_Y ? Zone.Volcano : Zone.Fields;
  return frontierZone(mx, my, west);
}

/** Мобы не появляются ближе стольких тайлов к берегу реки: там стена, ворота и посты у мостов. */
const RIVER_MOB_GAP = 12;

/** Земля у берега реки по биому. */
function bankOf(st: Zone): T {
  if (st === Zone.Snow) return T.Ice;
  if (st === Zone.Ashlands || st === Zone.Volcano) return T.Ash;
  if (st === Zone.Swamp) return T.Bog;
  return T.Sand;
}
/** Покрытие улиц, тропинок и пустырей в городах со стилем. */
const CITY_GROUND: Record<CityStyle, [T, T, T]> = {
  desert: [T.Cobble, T.Sand, T.Dune],
  snow: [T.Cobble, T.Dirt, T.Snow],
  solgard: [T.Cobble, T.Sand, T.Grass],
  umbrath: [T.Floor, T.Ash, T.Bog],
};

function terrainAt(x: number, y: number, seed: number, z = zoneAt(x, y, seed)): T {
  // шум по сложенной x: восток — зеркало запада (расстояния до реки, дорог и площадок и так симметричны)
  const fx = foldX(x);
  const n = fbm(fx, y, seed);
  const st = zoneStyle(z);
  const edge = Math.min(x, y, MAP_W - x, MAP_H - y) + (n - 0.5) * 8;
  // река проверяется раньше края карты: она идёт до воды края, поэтому у края карты брода нет (мосты кладутся поверх там, где реку пересекает дорога)
  const rv = riverEdge(x, y) + (n - 0.5) * 0.8;
  if (z !== Zone.Dungeon && (rv < 0 || edge < 2.6)) return T.Water;
  if (z !== Zone.Dungeon && edge < 4.6) return st === Zone.Snow ? T.Ice : st === Zone.Volcano ? T.Obsidian : T.Sand;
  if (z === Zone.Dungeon) {
    for (const [lx, ly, r] of LAVA_POOLS) {
      const ddx = x - lx, ddy = y - ly;
      if (ddx * ddx + ddy * ddy < r * r * (0.8 + n * 0.4)) return T.Lava;
    }
    return T.Floor;
  }
  if (z === Zone.Town) {
    // вершина dual grid — мостовая, если хоть одна из 4 соседних клеток мощёная
    const vx = Math.round(x) - TOWN.x, vy = Math.round(y) - TOWN.y;
    let dirt = false;
    for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const g = townGround(vx + ox, vy + oy);
      if (g === "cobble") return T.Cobble;
      if (g === "dirt") dirt = true;
    }
    return dirt ? T.Dirt : T.Grass;
  }
  const city = CITY_OF_ZONE.get(z);
  if (city) {
    const vx = Math.round(x) - city.x, vy = Math.round(y) - city.y;
    const gs = [[-1, -1], [0, -1], [-1, 0], [0, 0]].map(([ox, oy]) => cityGround(city.style!, vx + ox, vy + oy));
    if (gs.every((g) => g === "pool")) return T.Water;
    const [road, path, plain] = CITY_GROUND[city.style!];
    return gs.includes("road") ? road : gs.includes("path") ? path : plain;
  }
  if (rv < 1.3) return bankOf(st);
  const road = roadDist(x, y);
  const roadW = 1.25 + (n - 0.5) * 0.8;
  const arena = bossNear(x, y, 0);
  const pd = pondDist(x, y);
  // у городских площадок, поселений, стены вдоль реки (стена не должна уходить в озеро), арен боссов (подойти к ним можно) и прудов оазисов — без воды и лавы
  const far = siteDist(x, y) < 1.15 || placeNear(x, y) || wallNear(x, y) || bossNear(x, y, 7) || pd < 7 ? 0 : road;
  // арена босса: ровная земля по биому (без воды, лавы и непроходимого), чтобы схватка не упиралась в препятствия; лес и топь делают это сами
  if (arena && st !== Zone.Forest && st !== Zone.Swamp) {
    if (road < roadW) return T.Dirt;
    return st === Zone.Snow ? T.Snow : st === Zone.Desert ? T.Dune : st === Zone.Ashlands || st === Zone.Volcano ? T.Ash : T.Grass;
  }
  // Поля вечных битв: вытоптанная земля и выжженные пятна среди травы, без воды и лавы
  if (z === Zone.Fields) {
    if (road < roadW) return T.Dirt;
    const p = fbm(fx, y, seed + 90);
    if (p > 0.62) return T.Ash;
    if (p < 0.42) return T.Dirt;
    return T.Grass;
  }
  // пруд оазиса — по одному на сторону (запад: Пустыня Миражей, восток: Пепельная пустошь): вода и песок у берега; дорога и площадки главнее
  if (pd < 4.2 && road >= roadW && siteDist(x, y) >= 1.1) return pd < 2.4 + (n - 0.5) * 2 ? T.Water : T.Sand;
  switch (st) {
    case Zone.Frontier:
    case Zone.Meadow: {
      if (road < roadW) return T.Dirt;
      const p = fbm(fx, y, seed + 40);
      if (far > 4 && p < 0.22) return T.Water;
      if (far > 3 && p < 0.26) return T.Sand;
      if (fbm(fx, y, seed + 60) > 0.74) return T.Forest;
      return T.Grass;
    }
    case Zone.Forest: {
      if (road < roadW) return T.Dirt;
      if (arena) return T.Grass;
      const p = fbm(fx, y, seed + 60);
      if (p < 0.3) return T.Grass;
      if (far > 4 && fbm(fx, y, seed + 40) < 0.17) return T.Water;
      return T.Forest;
    }
    case Zone.Swamp: {
      if (road < roadW) return T.Dirt;
      const p = fbm(fx, y, seed + 40);
      if (arena) return p > 0.6 ? T.Grass : T.Bog;
      // курганы суше обычных топей: стартовая зона; топи земель и кольца — не слишком мокрые, чтобы пути от столиц оставались равными (задача 132)
      if (far > 3 && p < (z === Zone.Barrows ? 0.25 : z === Zone.PlagueMarsh ? 0.3 : 0.34)) return T.Water;
      if (p > 0.72) return T.Grass;
      return T.Bog;
    }
    case Zone.Ashlands: {
      if (road < roadW) return T.Dirt;
      if (far > 3 && fbm(fx, y, seed + 80) < 0.17) return T.Lava;
      return T.Ash;
    }
    case Zone.Desert: {
      if (road < roadW) return T.Dirt;
      if (siteDist(x, y) < 1.1) return T.Dune;
      const p = fbm(fx, y, seed + 41);
      if (p > 0.68) return T.Sand;
      if (p < 0.18 && road > 3) return T.Dirt;
      return T.Dune;
    }
    case Zone.Snow: {
      if (road < roadW) return T.Dirt;
      if (siteDist(x, y) < 1.1) return T.Snow;
      const p = fbm(fx, y, seed + 43);
      if (far > 4 && p < 0.15) return T.Water;
      if (p < 0.25) return T.Ice;
      return T.Snow;
    }
    case Zone.Volcano: {
      if (road < roadW) return T.Dirt;
      if (far > 3 && fbm(fx, y, seed + 82) < 0.2) return T.Lava;
      if (fbm(fx, y, seed + 83) > 0.6) return T.Obsidian;
      return T.Ash;
    }
    case Zone.Coast: {
      if (road < roadW) return T.Dirt;
      const p = fbm(fx, y, seed + 47);
      // южный залив: мелководье, дорога идёт по насыпи
      if (far > 2 && y > MID_Y1 - 10 + (n - 0.5) * 8) return T.Water;
      if (far > 3 && p < 0.2) return T.Water;
      if (p > 0.66) return T.Grass;
      return T.Sand;
    }
  }
  return T.Grass;
}

type PlaceFn = (kind: string, x: number, y: number, jitter?: number) => void;

/** Эмберхолл: стены с башнями и воротами, дома, таверна, кузница, банк, рынок, площадь с фонтаном. */
function buildTown(seed: number, w: number, cell: Uint8Array, objects: MapObject[], place: PlaceFn) {
  const X = (dx: number) => TOWN.x + dx, Y = (dy: number) => TOWN.y + dy;
  const fits = (kind: string, x: number, y: number) => {
    const f = OBJECT_FOOTPRINT[kind] ?? { w: 1, h: 1 };
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) if (cell[(y - j) * w + x + i] & CELL_BLOCK) return false;
    return true;
  };
  const put = (kind: string, dx: number, dy: number) => {
    if (fits(kind, X(dx), Y(dy))) place(kind, X(dx), Y(dy));
  };
  // башни и стены
  const towerCells = new Set<number>();
  for (const [dx, dy] of TOWERS) {
    place("tower", X(dx), Y(dy));
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) towerCells.add((dy - j) * 1000 + dx + i);
  }
  const wallOk = (dx: number, dy: number) => !isGate(dx, dy) && !towerCells.has(dy * 1000 + dx);
  for (let dx = -WALL.x; dx <= WALL.x; dx++) for (const dy of [-WALL.y, WALL.y]) if (wallOk(dx, dy)) place("wall_h", X(dx), Y(dy));
  for (let dy = -WALL.y + 1; dy < WALL.y; dy++) for (const dx of [-WALL.x, WALL.x]) if (wallOk(dx, dy)) place("wall_v", X(dx), Y(dy));
  for (const dy of [-WALL.y, WALL.y]) objects.push({ kind: "gate_arch", x: X(0) * TILE + 16, y: (Y(dy) + 1) * TILE - 2 });
  // здания (двери проходимы — в них можно «зайти»)
  for (const b of BUILDINGS) {
    place(b.kind, X(b.x), Y(b.y));
    for (const d of b.door ?? []) cell[Y(b.y) * w + X(b.x + d)] &= ~CELL_BLOCK;
  }
  place("fountain", X(-1), Y(0));
  for (const s of STALLS) place(s.kind, X(s.x), Y(s.y));
  const decor: [string, number, number][] = [
    ["cauldron", -10, -5], ["barrel", -10, -6], ["crate", -3, -6], ["barrel", 9, -6], ["crate", 10, -6],
    ["anvil", 19, -3], ["barrel", 20, -3], ["crate", 21, -3], ["hay", 21, -6], ["barrel", 13, -3],
    ["barrel", -21, -3], ["barrel", -21, -4], ["crate", -13, -3], ["barrel", -13, -4],
    ["lamp", -20, 7], ["lamp", -14, 7], ["barrel", -21, 3],
    ["dummy", 14, 6], ["dummy", 20, 6], ["weapon_rack", 13, 4], ["weapon_rack", 20, 3],
    ["lamp", -10, -7], ["lamp", 10, -7], ["lamp", -10, 7], ["lamp", 10, 7],
    ["lamp", -3, -2], ["lamp", 3, -2], ["lamp", -2, 2], ["lamp", 2, 2],
    ["v_basic_oak", -10, 3], ["v_basic_oak_small", -7, 6], ["v_basic_oak", 8, 3], ["v_basic_oak_small", 10, 5], [D.PINE, 7, 7], ["v_basic_oak_small", -10, 7],
    ["lamp", -2, -10], ["lamp", 2, -10], ["lamp", -13, -10], ["lamp", 13, -10],
    ["lamp", -2, 10], ["lamp", 2, 10], ["lamp", -13, 10], ["lamp", 13, 10],
    ["well", -9, 6], ["teleport_stone", 5, 3],
  ];
  for (const [k, dx, dy] of decor) put(k, dx, dy);
  // сады за домами и цветы во дворах
  const r = rng(seed + 7);
  for (let dy = -WALL.y + 1; dy < WALL.y; dy++) for (let dx = -WALL.x + 1; dx < WALL.x; dx++) {
    const x = X(dx), y = Y(dy);
    if (cell[y * w + x] & CELL_BLOCK || townGround(dx, dy) !== "grass") continue;
    const garden = (dy >= -16 && dy <= -14) || (dy >= 10 && dy <= 12);
    const roll = r();
    if (garden && roll < 0.14 && townGround(dx, dy + 1) === "grass") place(roll < 0.1 ? D.pick(D.OAKS, hash(x, y, seed + 21)) : D.PINE, x, y, Math.floor((r() - 0.5) * 8));
    else if (roll < (garden ? 0.24 : Math.abs(dx) <= 10 && dy >= 2 && dy <= 7 ? 0.07 : 0)) objects.push({ kind: D.pick(roll < 0.17 ? D.BUSHES : D.BUSHES_FLOWER, hash(x, y, seed + 22)), x: x * TILE + 16, y: y * TILE + 30 });
    else if (garden && roll < 0.26) objects.push({ kind: D.pick(D.STUMPS, hash(x, y, seed + 23)), x: x * TILE + 16, y: y * TILE + 30 });
    else if (hash(x, y, seed + 3) < 0.16) objects.push({ kind: "flowers", x: x * TILE + 16, y: y * TILE + 30 });
  }
}

/** Город со стилем (малый или столица): стены, башни, ворота, дома, прилавки, убранство, камень телепорта. */
function buildCity(c: City, cell: Uint8Array, w: number, objects: MapObject[], place: PlaceFn, seed: number) {
  const style = c.style as CityStyle, St = STYLE[style];
  const X = (dx: number) => c.x + dx, Y = (dy: number) => c.y + dy;
  const towerCells = new Set<number>();
  for (const [dx, dy] of CITY_TOWERS) {
    place(St.tower, X(dx), Y(dy));
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) towerCells.add((dy - j) * 1000 + dx + i);
  }
  const wallOk = (dx: number, dy: number) => !isCityGate(dx, dy) && !towerCells.has(dy * 1000 + dx);
  for (let dx = -CITY_WALL.x; dx <= CITY_WALL.x; dx++) for (const dy of [-CITY_WALL.y, CITY_WALL.y]) if (wallOk(dx, dy)) place(St.wall_h, X(dx), Y(dy));
  for (let dy = -CITY_WALL.y + 1; dy < CITY_WALL.y; dy++) for (const dx of [-CITY_WALL.x, CITY_WALL.x]) if (wallOk(dx, dy)) place(St.wall_v, X(dx), Y(dy));
  for (const dy of [-CITY_WALL.y, CITY_WALL.y]) objects.push({ kind: St.gate, x: X(0) * TILE + 16, y: (Y(dy) + 1) * TILE - 2 });
  const fits = (kind: string, x: number, y: number) => {
    const f = OBJECT_FOOTPRINT[kind] ?? { w: 1, h: 1 };
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) if (cell[(y - j) * w + x + i] & CELL_BLOCK) return false;
    return true;
  };
  CITY_HOUSES.forEach(([dx, dy], i) => place(St.houses[i % 2], X(dx), Y(dy)));
  CITY_STALLS.forEach(([dx, dy], i) => place(St.stalls[i], X(dx), Y(dy)));
  for (const [k, dx, dy] of cityDecor(style)) if (fits(k, X(dx), Y(dy))) place(k, X(dx), Y(dy));
  place("teleport_stone", c.stoneTile.x, c.stoneTile.y);
  // кустики на открытой земле у стен (в Мортхейме — кости и туманные огоньки)
  const bush: Record<CityStyle, string> = { desert: "dry_bush", snow: "snow_bush", solgard: "flowers", umbrath: "bones" };
  const r = rng(seed + 11 + c.x);
  for (let dy = -CITY_WALL.y + 1; dy < CITY_WALL.y; dy++) for (let dx = -CITY_WALL.x + 1; dx < CITY_WALL.x; dx++) {
    const x = X(dx), y = Y(dy);
    if (cell[y * w + x] & CELL_BLOCK || cityGround(style, dx, dy) !== "plain") continue;
    const roll = r();
    if (roll < 0.05) objects.push({ kind: bush[style], x: x * TILE + 16, y: y * TILE + 30 });
    else if (style === "umbrath" && roll < 0.08) objects.push({ kind: "mushrooms_glow", x: x * TILE + 16, y: y * TILE + 30 });
  }
}

/** Деревни, лагеря, руины и места встреч: постройки из готовых объектов (только на свободных клетках). */
function buildPlaces(cell: Uint8Array, w: number, objects: MapObject[], place: PlaceFn, seed: number) {
  const fits = (kind: string, x: number, y: number) => {
    const f = OBJECT_FOOTPRINT[kind] ?? { w: 1, h: 1 };
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      const xx = x + i, yy = y - j;
      if (xx < 1 || yy < 1 || xx >= MAP_W - 1 || yy >= MAP_H - 1 || cell[yy * w + xx] & CELL_BLOCK) return false;
      if (roadDist(xx + 0.5, yy + 0.5) < 1.6) return false;
    }
    return true;
  };
  const r = rng(seed + 313);
  for (const p of PLACES) {
    const put = (kind: string, dx: number, dy: number) => { if (fits(kind, p.x + dx, p.y + dy)) place(kind, p.x + dx, p.y + dy); };
    const deco = (kind: string, dx: number, dy: number) => objects.push({ kind, x: (p.x + dx) * TILE + 16, y: (p.y + dy) * TILE + 28 });
    // кладбище сеткой из надгробий (шаг 2 по x и 3 по y) с могилой на земле перед каждым; (x0, y0) — первое место
    const graveyard = (x0: number, y0: number, cols: number, rows: number) => {
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const dx = x0 + i * 2, dy = y0 + j * 3, hx = p.x + dx, hy = p.y + dy;
        if (hash(hx, hy, seed + 31) < 0.12) continue; // не все места заняты
        put(D.pick(D.MARKERS, hash(hx, hy, seed + 32)), dx, dy);
        if (fits("-", hx, hy + 1) && hash(hx, hy, seed + 33) < 0.75) deco(D.pick(D.GRAVES, hash(hx, hy, seed + 34)), dx, dy + 1);
      }
    };
    // мелкое убранство без блокировки: только на свободных клетках, место по хешу (последовательность r() не трогаем)
    const scatter = (list: readonly string[], n: number, s: number, rx = 8, ry = 5) => {
      for (let i = 0; i < n; i++) {
        const dx = Math.floor(hash(i, p.x, seed + s) * rx * 2) - rx, dy = Math.floor(hash(i, p.y, seed + s + 1) * ry * 2) - ry;
        if (fits("-", p.x + dx, p.y + dy)) deco(D.pick(list, hash(i, p.x + p.y, seed + s + 2)), dx, dy);
      }
    };
    const putAll = (list: [string, number, number][]) => { for (const [k, dx, dy] of list) put(k, dx, dy); };
    if (p.kind === "village") {
      const umb = p.look === "umb";
      const hs = umb ? ["umb_house", "umb_crypt"] : ["house", "house_blue"];
      const light = umb ? "soul_brazier" : "lamp";
      ([[-7, -2], [-1, -3], [4, -2], [-6, 5], [2, 5]] as const).forEach(([dx, dy], i) => put(hs[i % 2], dx, dy));
      putAll([["well", 0, 1], [light, -3, 1], [light, 3, 1], ["hay", -8, 2], ["barrel", 7, 1], ["crate", 8, 1], [umb ? "bone_pile" : "v_basic_oak", -9, -1], [umb ? D.DEAD_GRAVE[0] : "v_basic_oak_small", 9, 4]]);
      for (let i = 0; i < 10; i++) deco(umb ? "bones" : "flowers", Math.floor(r() * 16) - 8, Math.floor(r() * 10) - 4);
      if (umb) {
        // погост: ограда с воротами между столбами, ряды надгробий, статуя, мёртвые деревья («Погост Скорби» — большой)
        const big = p.id === "sorrow_yard";
        putAll([["v_graveyard_fence_long", -8, 7], ["v_graveyard_fence_long", 3, 7], ["v_graveyard_pillar_chain", -2, 7], ["v_graveyard_pillar_chain", 2, 7],
          ["v_graveyard_statue_a", -10, 9], ["v_graveyard_statue_b", 10, 10], [D.DEAD_GRAVE[1], -11, 6], [D.DEAD_GRAVE[2], 11, 6]]);
        graveyard(-8, 9, big ? 9 : 5, big ? 2 : 1);
        if (big) putAll([["v_graveyard_coffin_open", -3, 15], ["v_graveyard_coffin_closed", 2, 15], ["v_graveyard_lamp_a", -5, 8], ["v_graveyard_lamp_a", 5, 8]]);
      } else {
        // палисадник: заборы с проходом посередине, цветущие кусты, пни и брёвна
        putAll([["v_basic_fence_row", -9, 8], ["v_basic_fence_row", -6, 8], ["v_basic_fence_row", 4, 8], ["v_basic_fence_row", 7, 8], ["v_basic_fence_post", -10, 8], ["v_basic_fence_post", 10, 8], ["v_basic_log_pile", 10, 0]]);
        scatter(D.BUSHES_FLOWER, 6, 51);
        scatter(D.STUMPS, 3, 61);
      }
    } else if (p.kind === "camp") {
      for (const [dx, dy] of [[-4, -2], [2, -2], [-1, 4]] as const) put("tent", dx, dy);
      putAll([["campfire", 0, 1], ["crate", -5, 2], ["crate", 4, 2], ["barrel", 5, 1], ["weapon_rack", -3, 2], ["hay", 3, 3]]);
      for (let i = 0; i < 6; i++) deco("bones", Math.floor(r() * 12) - 6, Math.floor(r() * 10) - 5);
      // частокол и поленница из Basic
      putAll([["v_basic_palisade_5", -8, -3], ["v_basic_palisade_5", 6, -3], ["v_basic_palisade_2", -9, 3], ["v_basic_palisade_2", 9, 3], ["v_basic_log_pile", -6, 4]]);
      scatter(D.STUMPS, 4, 71, 6, 5);
    } else if (p.kind === "ruins") {
      for (let i = 0; i < 8; i++) {
        if (hash(i, p.x, seed + 5) < 0.3) continue;
        const a = (i / 8) * Math.PI * 2;
        put("ruin_pillar", Math.round(Math.cos(a) * 5), Math.round(Math.sin(a) * 4));
      }
      putAll([["ruin_wall", -3, -5], ["ruin_wall", 2, -5], ["ruin_wall", -7, 1], ["ruin_wall", 5, 2], ["rock", -2, 3], ["big_rock", 3, -2], ["rock", 0, -1]]);
      for (let i = 0; i < 8; i++) deco("bones", Math.floor(r() * 12) - 6, Math.floor(r() * 10) - 5);
      if (p.look === "umb") {
        // земли Умбрата: склеп из надгробных столбов, гробов и статуи
        putAll([["v_graveyard_pillar_broken", -6, -2], ["v_graveyard_pillar", 6, -1], ["v_graveyard_statue_b", 0, -3], ["v_graveyard_coffin_open", -5, 3], ["v_graveyard_coffin_closed", 3, 4], ["v_graveyard_pillar_chain", -1, -5], ["v_graveyard_pillar_chain", 1, -5]]);
        graveyard(-8, 6, 3, 1);
      } else {
        // Сольгард и середина: пещера в обрыве, лестница и лаз
        putAll([["v_basic_cave_a", -1, -5], ["v_basic_cliff_h", -8, -4], ["v_basic_cliff_h", 6, -4], ["v_basic_log_pile", 7, 5]]);
        deco("v_basic_stairs", -0.5, -3); // лестница от входа в пещеру: по центру под ней, на земле (под юнитами)
        deco("v_basic_ladder_earth", 5, 3);
        scatter(D.STUMPS, 3, 91, 7, 5);
      }
    } else {
      // место встреч: костёр, скамьи из тюков, шатёр; Basic — дубы, пни и брёвна вместо скамей, указатель
      putAll([["campfire", 0, 0], ["hay", -2, 0], ["hay", 2, 0], ["hay", 0, 2], ["tent", 3, -3], ["lamp", -3, -2], ["barrel", 4, 1], ["v_basic_oak", -7, -2], ["v_basic_oak_small", 7, 3]]);
      scatter(D.STUMPS, 4, 81, 5, 4);
      deco("v_basic_sign_post", 5, 2);
    }
  }
}

/** Мосты там, где дорога пересекает реку: вода остаётся, клетки под настилом проходимы. */
function buildBridges(cell: Uint8Array, w: number, objects: MapObject[]) {
  const cross = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a[0] + t * r[0], y: a[1] + t * r[1], h: Math.abs(r[0]) >= Math.abs(r[1]) } : null;
  };
  for (const rv of RIVERS) for (let i = 0; i < rv.path.length - 1; i++) for (const road of ROADS) for (let j = 0; j < road.length - 1; j++) {
    const p = cross(road[j], road[j + 1], rv.path[i], rv.path[i + 1]);
    if (!p) continue;
    const cx = Math.round(p.x), cy = Math.floor(p.y);
    const [x0, x1, y0, y1] = p.h ? [cx - 3, cx + 3, cy - 1, cy + 2] : [cx - 1, cx + 2, cy - 3, cy + 3];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x > 0 && y > 0 && x < MAP_W && y < MAP_H) cell[y * w + x] = (cell[y * w + x] & ~CELL_BLOCK) | CELL_RESERVED;
    objects.push(p.h ? { kind: "bridge_h", x: cx * TILE, y: y1 * TILE } : { kind: "bridge_v", x: (cx + 0.5) * TILE, y: y1 * TILE });
  }
}

/** Стены вдоль рек (решение 7, задача 132): безопасные земли со стороны реки обнесены стеной, ворота — проёмы у мостов, места башен — world.json walls. */
const WALLS = world.walls;
const WALL_TAB = pathTable(WALLS.line as Line);
/** Колонка стены (клетка x западной половины) на строке y: ломаная walls.line. */
const wallCol = (y: number) => Math.floor(tableX(WALL_TAB, WALLS.line as Line, y + 0.5));
/** Точка (непрерывные тайлы) у стены вдоль реки (до 4,5 тайла от оси стены, любая сторона)? */
const wallNear = (x: number, y: number) => Math.abs(foldX(x) - tableX(WALL_TAB, WALLS.line as Line, y)) < 4.5;
/**
 * Непроходимая стена вдоль каждой реки со стороны своих земель (вид пока городских стен Сольгарда и Умбрата, арт — шаг 9). Колонка стены идёт
 * по ломаной walls.line; на уступах достраивается горизонтальная клетка, чтобы стена была связной. Проёмы ворот (walls.gates) — у мостов, у каждого
 * по краям башни (walls.towers: якорь — левая нижняя клетка 2×2, колонки wallCol−1…wallCol). Восток — зеркало запада (клетка i ↔ w − 1 − i).
 */
function buildRiverWalls(cell: Uint8Array, w: number, h: number, place: PlaceFn) {
  const inGate = (y: number) => WALLS.gates.some((g) => Math.abs(y - g.y) <= g.half);
  for (const east of [false, true]) {
    const X = (c: number) => (east ? w - 1 - c : c);
    const wallKind = east ? "umb_wall_v" : "sol_wall_v", towerKind = east ? "umb_tower" : "sol_tower";
    const towerCells = new Set<number>();
    for (const t of WALLS.towers) {
      const c = wallCol(t.y), ax = east ? w - 1 - c : c - 1;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) towerCells.add((t.y - j) * w + ax + i);
      place(towerKind, ax, t.y);
    }
    for (let y = 0; y < h; y++) {
      if (inGate(y)) continue;
      const a = wallCol(y), b = wallCol(Math.min(h - 1, y + 1));
      for (let c = Math.min(a, b); c <= Math.max(a, b); c++) {
        const x = X(c), i = y * w + x;
        if (towerCells.has(i) || cell[i] & CELL_BLOCK) continue;
        place(wallKind, x, y);
      }
    }
  }
}

/**
 * Доля 0..1 «глубины» точки в зоне: от неё уровень моба внутри диапазона зоны. Уровень растёт к центру (задача 132):
 * в землях фракции — от столицы к реке (по оболочке u), в кольце — от реки к Полям (по поясу v), в Полях — к их центру.
 */
function levelK(z: Zone, x: number, y: number): number {
  if (z === Zone.Dungeon) {
    // данж: от входа с севера к залу босса (путь по залам), уровень у зала босса — верх диапазона
    const d = DUNGEON_DEPTH.depth[(Math.floor(y) - DUNGEON.y0) * DUNGEON_DEPTH.dw + Math.floor(x) - DUNGEON.x0];
    return d < 0 ? 0.5 : d / DUNGEON_DEPTH.boss;
  }
  const xm = foldX(x);
  const li = LAND_INDEX.get(z);
  if (li !== undefined) return (uOf(xm, y) - U_EDGES[li]) / (U_EDGES[li + 1] - U_EDGES[li]);
  const ri = RING_INDEX.get(z);
  if (ri !== undefined) {
    const hi = V_EDGES[4 - ri], lo = V_EDGES[3 - ri];
    return (hi - vOf(xm, y)) / (hi - lo);
  }
  if (z === Zone.Fields || z === Zone.Volcano) return 1 - vOf(xm, y);
  return 0.5;
}

export function generateMap(seed: number): WorldMap {
  const w = MAP_W, h = MAP_H;
  const vtx = new Uint8Array((w + 1) * (h + 1));
  const cell = new Uint8Array(w * h);
  const zone = new Uint8Array(w * h);
  /** Клетки, где центр — вода (не лава, не стена и не постройка): камыш растёт только у настоящего берега. */
  const wet = new Uint8Array(w * h);
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) vtx[y * (w + 1) + x] = terrainAt(x, y, seed);

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const cx = x + 0.5, cy = y + 0.5;
    const z = zoneAt(cx, cy, seed);
    zone[i] = z;
    let f = 0;
    const tc = terrainAt(cx, cy, seed, z);
    if (tc === T.Water) wet[i] = 1;
    if (BLOCKING.has(tc)) f |= CELL_BLOCK;
    if (z === Zone.Dungeon && !inRooms(x, y)) f |= CELL_BLOCK | CELL_WALL;
    if (isTownZone(z) || roadDist(cx, cy) < 2.2 || siteDist(cx, cy) < 1.15 || bossNear(cx, cy, 1) || townDist(cx, cy) < 3 || placeNear(cx, cy)) f |= CELL_RESERVED;
    cell[i] = f;
  }

  const objects: MapObject[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? CELL_BLOCK : cell[y * w + x]);
  const free = (x: number, y: number, fw = 1, fh = 1) => {
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) if (at(x + i, y - j) & CELL_BLOCK) return false;
    return true;
  };
  const place = (kind: string, x: number, y: number, jitter = 0) => {
    const fp = OBJECT_FOOTPRINT[kind];
    if (fp) for (let j = 0; j < fp.h; j++) for (let i = 0; i < fp.w; i++) cell[(y - j) * w + x + i] |= CELL_BLOCK;
    const fw = fp ? fp.w : 1;
    objects.push({ kind, x: (x + fw / 2) * TILE + jitter, y: (y + 1) * TILE - 2 });
  };

  buildTown(seed, w, cell, objects, place);
  for (const c of CITIES) if (c.style) buildCity(c, cell, w, objects, place, seed);
  buildBridges(cell, w, objects);
  buildRiverWalls(cell, w, h, place);
  buildPlaces(cell, w, objects, place, seed);
  // указатели у перекрёстков: ближайшая свободная клетка у обочины
  for (const s of world.signs.list) {
    let best: [number, number] | null = null, bd = 1e9;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const x = s.x + i, y = s.y + j, rd = roadDist(x + 0.5, y + 0.5);
      if (at(x, y) & CELL_BLOCK || rd < 1.7 || rd > 4 || isTownZone(zone[y * w + x])) continue;
      const d = i * i + j * j;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (!best) continue;
    place("signpost", best[0], best[1]);
    objects[objects.length - 1].label = s.text;
  }

  const nodes: MapNode[] = [];
  const placeNode = (kind: string, x: number, y: number) => {
    const res = resourceOfNode(kind);
    if (!res) return;
    nodes.push({ id: objects.length, kind, res: res.id, x: (x + 0.5) * TILE, y: (y + 1) * TILE - 2 });
    place(kind, x, y);
  };
  const deco = (kind: string, x: number, y: number, jit: number, dy = 30) => objects.push({ kind, x: x * TILE + 16 + jit, y: y * TILE + dy });
  // Деревья, камни и кладбище из паков (shared/decor.ts): вид выбирается хешем клетки, поэтому последовательность r() не сдвигается.
  const pickV = (list: readonly string[], x: number, y: number, s: number) => D.pick(list, hash(x, y, seed + s));
  // Свободны ли fw×fh клеток от привязки: без стен, воды и резерва (дороги, города, арены).
  const freeR = (x: number, y: number, fw = 1, fh = 1) => {
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) if (at(x + i, y - j) & (CELL_BLOCK | CELL_RESERVED)) return false;
    return true;
  };

  // Природа по зонам (по биому зоны).
  const r = rng(seed + 99);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const f = cell[i];
    const roll = r(), jit = Math.floor((r() - 0.5) * 10);
    const z = zone[i] as Zone;
    const st = zoneStyle(z);
    if (f & (CELL_BLOCK | CELL_RESERVED)) {
      if (f & CELL_WALL || !(f & CELL_BLOCK) || isTownZone(z)) continue;
      // вода: кувшинки и камыш у берега
      const t = vtx[y * (w + 1) + x];
      if (t === T.Water && st === Zone.Swamp && roll < 0.05) objects.push({ kind: "lilypad", x: x * TILE + 16 + jit, y: y * TILE + 24 });
      continue;
    }
    const t = vtx[y * (w + 1) + x];
    // камыш — у воды (а не у любой непроходимой клетки: стена вдоль реки и деревья водой не считаются)
    const nearWater = (x + 1 < w && wet[i + 1]) || wet[i - 1] || (y + 1 < h && wet[i + w]) || wet[i - w];
    // пруд оазиса (пара, запад и восток): жемчуг у берега, пальмы вокруг — на любой стороне, по складывающейся x
    const pdc = pondDist(x + 0.5, y + 0.5);
    if (z !== Zone.Fields && pdc < 9) {
      if (pdc > 3 && pdc < 6.5 && roll < 0.06) { placeNode("node_pearl", x, y); continue; }
      if (pdc > 3.5 && roll < 0.2) { place("palm", x, y, jit); continue; }
    }
    if (z === Zone.Fields) {
      // Поля вечных битв: декор ставится отдельным проходом ниже — зеркально относительно оси
    } else if (st === Zone.Meadow || st === Zone.Frontier) {
      if (t === T.Forest && roll < 0.16) place(roll < 0.08 ? D.PINE : pickV(D.FOREST_TREES, x, y, 5), x, y, jit);
      else if (roll < 0.022) place(pickV(D.OAKS, x, y, 6), x, y, jit);
      else if (roll < 0.04) deco(pickV(roll < 0.033 ? D.BUSHES : D.BUSHES_FLOWER, x, y, 7), x, y, jit);
      else if (roll < 0.05) place("rock", x, y);
      else if (roll < 0.056) deco(pickV(D.STUMPS, x, y, 8), x, y, jit);
      else if (roll < 0.11 && t === T.Grass) objects.push({ kind: "flowers", x: x * TILE + 16 + jit, y: y * TILE + 30 });
      else if (roll < 0.18 && t === T.Grass) objects.push({ kind: "tallgrass", x: x * TILE + 16 + jit, y: y * TILE + 30 });
      else if (nearWater && roll < 0.3) objects.push({ kind: "reeds", x: x * TILE + 16 + jit, y: y * TILE + 30 });
    } else if (st === Zone.Forest) {
      const dark = z === Zone.MistWood;
      if (t === T.Forest && roll < 0.2) place(dark ? (roll < 0.15 ? D.PINE : pickV(D.DEAD_GRAVE, x, y, 9)) : roll < 0.13 ? D.PINE : pickV(D.FOREST_TREES, x, y, 10), x, y, jit);
      else if (roll < 0.035) place(dark ? pickV(D.DEAD_GRAVE, x, y, 9) : pickV(D.OAKS, x, y, 11), x, y, jit);
      else if (roll < 0.07) objects.push({ kind: dark ? "mushrooms_glow" : "mushrooms", x: x * TILE + 16 + jit, y: y * TILE + 30 });
      else if (roll < 0.13) objects.push({ kind: "fern", x: x * TILE + 16 + jit, y: y * TILE + 30 });
      else if (roll < 0.15) objects.push({ kind: dark ? "bones" : pickV(D.BUSHES, x, y, 12), x: x * TILE + 16 + jit, y: y * TILE + 30 });
      else if (roll < 0.16) place("rock", x, y);
      else if (roll < 0.17) deco(pickV(D.STUMPS, x, y, 13), x, y, jit);
    } else if (st === Zone.Swamp) {
      const graves = z === Zone.Barrows, umbSwamp = graves || z === Zone.PlagueMarsh;
      // кладбищенские пятна крупным шумом: Курганы Мёртвых — густо, Чумные топи — реже
      const yard = umbSwamp && vnoise(x, y, 9, seed + 301) > (graves ? 0.6 : 0.72);
      if (yard && roll < 0.09) place(pickV(D.MARKERS, x, y, 14), x, y);
      else if (yard && roll < 0.14) deco(pickV(D.GRAVES, x, y, 15), x, y, jit, 28);
      else if (yard && roll < 0.147) place(pickV(D.STATUES, x, y, 16), x, y);
      else if (yard && roll < 0.154) place(pickV(D.GRAVE_LAMPS, x, y, 17), x, y);
      else if (yard && roll < 0.162 && freeR(x, y, 2)) place(pickV(D.COFFINS, x, y, 18), x, y);
      else if (roll < 0.05) place(umbSwamp ? pickV(D.DEAD_GRAVE, x, y, 19) : pickV(D.DEAD_ASH, x, y, 19), x, y, jit);
      else if (nearWater && roll < 0.3) objects.push({ kind: "reeds", x: x * TILE + 16 + jit, y: y * TILE + 30 });
      else if (roll < 0.09) objects.push({ kind: "mushrooms_glow", x: x * TILE + 16 + jit, y: y * TILE + 30 });
      else if (roll < (graves ? 0.13 : 0.1)) objects.push({ kind: "bones", x: x * TILE + 16 + jit, y: y * TILE + 28 });
      else if (graves && roll < 0.137) place("rock", x, y);
      else if (roll < 0.14 && t === T.Grass) objects.push({ kind: "tallgrass", x: x * TILE + 16 + jit, y: y * TILE + 30 });
    } else if (st === Zone.Ashlands) {
      if (roll < 0.025) place(pickV(D.DEAD_ASH, x, y, 20), x, y, jit);
      else if (roll < 0.05) place("rock", x, y);
      else if (roll < 0.058 && free(x, y) && free(x + 1, y)) place("big_rock", x, y);
      else if (roll < 0.075) objects.push({ kind: roll < 0.066 ? "bones" : pickV(D.SKULLS, x, y, 21), x: x * TILE + 16 + jit, y: y * TILE + 28 });
      else if (roll < 0.1) objects.push({ kind: "ember_vent", x: x * TILE + 16 + jit, y: y * TILE + 28 });
      else if (roll < 0.12) objects.push({ kind: "crystal", x: x * TILE + 16 + jit, y: y * TILE + 30 });
      else if (roll < 0.126 && freeR(x, y, 2)) place(pickV(D.LAVA_MOUNDS, x, y, 22), x, y);
      else if (roll < 0.136) place(pickV(D.BOULDERS, x, y, 23), x, y);
      else if (roll < 0.15) deco(pickV(D.DEAD_BUSHES, x, y, 24), x, y, jit);
      else if (roll < 0.16) deco(pickV(D.SMALL_ROCKS, x, y, 25), x, y, jit, 28);
      else if (z === Zone.Ashlands && roll < 0.1625) placeNode("node_cactus", x, y); // пара Пустыни Миражей (кольцо 40–50): у Умбрата свой кактус
    } else if (st === Zone.Desert) {
      if (roll < 0.03) place("cactus", x, y, jit);
      else if (roll < 0.06) deco("cactus_small", x, y, jit);
      else if (roll < 0.075) place("sandstone", x, y);
      else if (roll < 0.1) deco("dry_bush", x, y, jit);
      else if (roll < 0.11) deco("bones", x, y, jit, 28);
      else if (roll < 0.1125) placeNode("node_cactus", x, y);
    } else if (st === Zone.Snow) {
      if (roll < 0.07 && t === T.Snow) place("snow_pine", x, y, jit);
      else if (roll < 0.09) place("snow_rock", x, y);
      else if (roll < 0.105) place("ice_spike", x, y);
      else if (roll < 0.14) deco("snow_bush", x, y, jit);
      else if (roll < 0.147) deco("bones", x, y, jit, 28);
      else if (roll < 0.1495) placeNode("node_ice", x, y);
    } else if (st === Zone.Volcano) {
      if (hash(x, y, seed + 75) < 0.006) placeNode("node_obsidian", x, y); // обсидиан: вулкан теперь мал, узлов вдвое-вчетверо гуще прежнего
      else if (roll < 0.03) place("obsidian_spire", x, y, jit);
      else if (roll < 0.055) place("basalt", x, y);
      else if (roll < 0.075) deco("ember_vent", x, y, jit, 28);
      else if (roll < 0.088) place(pickV(D.DEAD_ASH, x, y, 26), x, y, jit);
      else if (roll < 0.1) deco("crystal", x, y, jit);
      else if (roll < 0.108) deco(roll < 0.104 ? "bones" : pickV(D.SKULLS, x, y, 27), x, y, jit, 28);
      else if (roll < 0.118 && freeR(x, y, 3)) place(pickV(D.LAVA_BIG, x, y, 28), x, y);
      else if (roll < 0.13 && freeR(x, y, 2)) place(pickV(D.LAVA_MOUNDS, x, y, 29), x, y);
      else if (roll < 0.14) place(pickV(D.BOULDERS, x, y, 30), x, y);
      else if (roll < 0.15) deco(pickV(D.DEAD_BUSHES, x, y, 31), x, y, jit);
    } else if (st === Zone.Coast) {
      if (roll < 0.02) place("rock", x, y);
      else if (roll < 0.028 && t !== T.Water) place("palm", x, y, jit);
      else if (roll < 0.07) deco("shell", x, y, jit, 28);
      else if (nearWater && roll < 0.25) deco("reeds", x, y, jit);
      else if (roll < 0.085) deco("dry_bush", x, y, jit);
      else if (roll < 0.0885) placeNode("node_pearl", x, y);
    } else if (z === Zone.Dungeon) {
      if (roll < 0.012) objects.push({ kind: "bones", x: x * TILE + 16 + jit, y: y * TILE + 28 });
      else if (roll < 0.018 && !bossNear(x, y, 2)) place("crate", x, y);
    }
  }
  // Поля вечных битв (шаг 10 дорисует тела, караваны и штандарты): мёртвые деревья, камни, кости и черепа редко, поле остаётся открытым.
  // Западная половина решается по хэшу своей клетки, восточная — её точное зеркало (клетка i ↔ w − 1 − i, смещение спрайта по x наоборот,
  // у двухклеточного камня привязка зеркальная): проходимость Полей симметрична, пути от столиц не зависят от случайности декора.
  const okF = (x: number, y: number) => zone[y * w + x] === Zone.Fields && !(cell[y * w + x] & (CELL_BLOCK | CELL_RESERVED));
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w / 2; x++) {
    const xe = w - 1 - x;
    if (!okF(x, y) || !okF(xe, y)) continue;
    const roll = hash(x, y, seed + 410), jit = Math.floor((hash(x, y, seed + 411) - 0.5) * 10);
    /** Обе копии: на западной клетке со смещением jit и на зеркальной со смещением −jit. */
    const both = (fn: (px: number, j: number) => void) => { fn(x, jit); fn(xe, -jit); };
    const flat = (kind: string, dy: number) => both((px, j) => objects.push({ kind, x: px * TILE + 16 + j, y: y * TILE + dy }));
    if (roll < 0.01) { const k = pickV(D.DEAD_ASH, x, y, 32); both((px, j) => place(k, px, y, j)); }
    else if (roll < 0.02) both((px) => place("rock", px, y));
    else if (roll < 0.03) flat(roll < 0.025 ? "bones" : pickV(D.SKULLS, x, y, 33), 28);
    else if (roll < 0.04) { const k = pickV(D.DEAD_BUSHES, x, y, 34); both((px, j) => deco(k, px, y, j)); }
    else if (roll < 0.047) { const k = pickV(D.SMALL_ROCKS, x, y, 35); both((px, j) => deco(k, px, y, j, 28)); }
    else if (roll < 0.052) {
      // двухклеточный камень: западная копия занимает x и x+1, зеркальная — w−2−x и w−1−x (привязка — левая клетка)
      if (x + 1 < w / 2 && okF(x + 1, y) && okF(xe - 1, y)) { place("big_rock", x, y); place("big_rock", xe - 1, y); }
    } else if (roll < 0.075) flat("ember_vent", 28);
    else if (roll < 0.14 && vtx[y * (w + 1) + x] === T.Grass && vtx[y * (w + 1) + xe] === T.Grass) flat("tallgrass", 30);
  }
  // Данж: колонны, факелы на стенах.
  for (const [px, py] of [[142, 58], [149, 58], [142, 66], [149, 66], [142, 77], [149, 77], [142, 85], [149, 85], [159, 62], [172, 62], [159, 81], [172, 81]])
    place("pillar", px + DG.x, py + DG.y);
  for (let y = DUNGEON.y0; y < DUNGEON.y1 - 1; y++) for (let x = DUNGEON.x0; x < DUNGEON.x1; x++) {
    const wall = at(x, y) & CELL_WALL, below = at(x, y + 1) & CELL_WALL;
    if (wall && !below && hash(x, y, seed + 9) < 0.22) objects.push({ kind: "torch", x: x * TILE + 16, y: y * TILE + 26 });
  }
  // факелы по бокам входа с севера (старые, у западных ворот, убраны вместе с ними)
  objects.push({ kind: "torch", x: (145 + DG.x) * TILE + 16, y: (54 + DG.y) * TILE + 26 }, { kind: "torch", x: (150 + DG.x) * TILE + 16, y: (54 + DG.y) * TILE + 26 });

  // Точки появления мобов: три прохода (земли фракций, кольцо 40–80 между реками, Поля вечных битв с вулканом и данжем).
  const spawns: SpawnPoint[] = [];
  const taken: { x: number; y: number }[] = [];
  const levelAt = (z: Zone, x: number, y: number, jitter: number) => {
    const [lo, hi] = ZONES[z].levels;
    const k = Math.min(1, Math.max(0, levelK(z, x + 0.5, y + 0.5)));
    return { k, level: Math.max(lo, Math.min(hi, Math.round(lo + (hi - lo) * k + jitter))) };
  };
  const passes: { quota: Record<string, number>; box: [number, number, number, number] }[] = [
    { quota: world.spawnQuota.lands, box: [0, 0, w, h] },
    { quota: world.spawnQuota.ring, box: [MID.x, MID.y, MID.w, MID.h] },
    { quota: world.spawnQuota.fields, box: [CORE.x0, CORE.y0, CORE.x1 - CORE.x0, CORE.y1 - CORE.y0] },
  ];
  passes.forEach((pass, pi) => {
    const quota: Record<number, number> = {};
    for (const [name, q] of Object.entries(pass.quota)) {
      const z = zoneByName(name);
      if (z !== undefined) quota[z] = q;
    }
    const [bx, by, bw, bh] = pass.box;
    const rs = rng(seed + 555 + pi * 1000);
    let guard = 0;
    while (Object.values(quota).some((q) => q > 0) && guard++ < 600000) {
      const x = Math.max(2, Math.min(w - 3, bx + Math.floor(rs() * bw))), y = Math.max(2, Math.min(h - 3, by + Math.floor(rs() * bh)));
      const i = y * w + x;
      const z = zone[i] as Zone;
      if (!quota[z] || cell[i] & CELL_BLOCK) continue;
      if (z !== Zone.Dungeon && cell[i] & CELL_RESERVED && rs() < 0.8) continue;
      if (bossNear(x, y, 4)) continue;
      // вокруг стен — полоса без мобов (стражи и так их не пустят); у реки с мостами и стеной (берег, ворота) мобов тоже нет
      if (townDist(x + 0.5, y + 0.5) < 11 || siteDist(x + 0.5, y + 0.5) < 1.6 || placeNear(x + 0.5, y + 0.5) || riverEdge(x + 0.5, y + 0.5) < RIVER_MOB_GAP) continue;
      if (taken.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 16)) continue;
      const mobs = ZONES[z].mobs;
      const { k, level } = levelAt(z, x, y, (rs() - 0.5) * 2);
      // первый моб в списке зоны слабее и чаще ближе к началу
      const idx = Math.min(mobs.length - 1, Math.floor(k * mobs.length * 0.7 + rs() * mobs.length * 0.6));
      spawns.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, mob: mobs[idx], level });
      taken.push({ x, y });
      quota[z]--;
    }
  });
  // обитатели лагерей и руин: по кругу у центра поселения
  for (const p of PLACES) {
    if (!p.mob || !p.n) continue;
    for (let i = 0; i < p.n; i++) {
      const a = (i / p.n) * Math.PI * 2 + 0.4, rr = 3 + (i % 2) * 2;
      const x = Math.round(p.x + Math.cos(a) * rr), y = Math.round(p.y + Math.sin(a) * rr);
      if (at(x, y) & CELL_BLOCK) continue;
      const z = zone[y * w + x] as Zone;
      if (isTownZone(z)) continue;
      spawns.push({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, mob: p.mob, level: Math.max(1, levelAt(z, x, y, 0).level) });
    }
  }

  return {
    w,
    h,
    seed,
    vtx,
    cell,
    zone,
    objects,
    spawns,
    bosses: BOSS_SPAWNS,
    nodes,
    playerSpawn: { x: TOWN.x * TILE + 16, y: (TOWN.y + 3) * TILE + 16 },
    // торговка Марфа — за прилавком на рынке (прилавок STALLS[2])
    merchant: { x: (TOWN.x + 5) * TILE, y: (TOWN.y - 5) * TILE + 8 },
    merchants: [{ x: (TOWN.x + 5) * TILE, y: (TOWN.y - 5) * TILE + 8 }, ...CITIES.filter((c) => c.merchant).map((c) => c.merchant!)],
  };
}

// ---------- запросы к карте ----------
export function cellAt(m: WorldMap, px: number, py: number): number {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return CELL_BLOCK;
  return m.cell[y * m.w + x];
}
export function zoneAtPx(m: WorldMap, px: number, py: number): Zone {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return Zone.Meadow;
  return m.zone[y * m.w + x] as Zone;
}
/** Множитель скорости от поверхности: в снегах вне дорог медленнее. */
export function terrainSpeedMul(m: WorldMap, px: number, py: number): number {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 1;
  const i = y * m.w + x;
  return zoneStyle(m.zone[i] as Zone) === Zone.Snow && !(m.cell[i] & CELL_RESERVED) ? ENV.snowSpeed : 1;
}
/** Рядом ли лава (клетка и соседи): обжигает. */
export function nearLava(m: WorldMap, px: number, py: number): boolean {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 1 || y < 1 || x >= m.w - 1 || y >= m.h - 1) return false;
  for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) if (m.vtx[(y + j) * (m.w + 1) + x + i] === T.Lava) return true;
  return false;
}
export function walkable(m: WorldMap, px: number, py: number, r: number): boolean {
  return !(
    cellAt(m, px - r, py - r * 0.5) & CELL_BLOCK ||
    cellAt(m, px + r, py - r * 0.5) & CELL_BLOCK ||
    cellAt(m, px - r, py + r * 0.5) & CELL_BLOCK ||
    cellAt(m, px + r, py + r * 0.5) & CELL_BLOCK
  );
}
/** Двигает точку с учётом стен, скользя вдоль препятствий. */
export function moveWithCollision(m: WorldMap, x: number, y: number, dx: number, dy: number, r: number) {
  let nx = x + dx, ny = y;
  if (!walkable(m, nx, ny, r)) nx = x;
  ny = y + dy;
  if (!walkable(m, nx, ny, r)) ny = y;
  return { x: nx, y: ny };
}
/** Есть ли прямая видимость (для снарядов и рывков): проверка шагами по полтайла, стены блокируют, вода нет. */
export function lineClear(m: WorldMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
  const steps = Math.ceil(d / (TILE / 4));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
    if (cellAt(m, px, py) & CELL_WALL) return false;
    // диагональная щель между двумя стенами тоже непрозрачна
    if (cellAt(m, px - 3, py - 3) & CELL_WALL && cellAt(m, px + 3, py + 3) & CELL_WALL) return false;
    if (cellAt(m, px - 3, py + 3) & CELL_WALL && cellAt(m, px + 3, py - 3) & CELL_WALL) return false;
  }
  return true;
}
