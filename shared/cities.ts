/**
 * Города: Эмберхолл (shared/town.ts, единственный нейтральный город, центр мира), столицы фракций на краях мира — Аурелион (Сольгард, запад)
 * и Мортхейм (Умбрат, восток) и форты фракций на краях Полей вечных битв (задача 132, шаг 4): стены 27×21 и две ворота (север и юг) те же,
 * но внутри плац, кузня и двор осадных машин (места под сценки шага 12), штандарты на стенах и воротах. Свой форт — камень, возрождение, торговец, повар;
 * чужой — как чужая столица (стража бьёт, телепорт закрыт). Стиль задаёт арт и покрытие.
 * Файл не зависит от map.ts: карта, сервер (стражи, телепорт, задания) и клиент берут разметку отсюда.
 *
 *   смещения (dx, dy) — от центра города; стены dx = ±14, dy = ±11; башни 2×2 снаружи;
 *   улицы: проспект |dx|≤1, поперечная |dy|≤1, кольцо вдоль стен dx = ±12 / dy = ±9; площадь |dx|≤6, |dy|≤4.
 */
import data from "../data/cities.json";
import { FORTS, MAP_W, TILE } from "./constants";
import { BELT_HALF, TOWN, inTownWalls } from "./town";

export type CityStyle = "solgard" | "umbrath";
export const CITY_WALL = { x: 14, y: 11 };
/** Полуразмеры зоны города вместе с башнями. */
export const CITY_HALF = { x: 15, y: 12 };
export type CityGround = "road" | "plain" | "path";

export const inCityRect = (dx: number, dy: number) => Math.abs(dx) <= CITY_HALF.x && Math.abs(dy) <= CITY_HALF.y;
const inCityWalls = (dx: number, dy: number) => Math.abs(dx) < CITY_WALL.x && Math.abs(dy) < CITY_WALL.y;
/** Проём ворот (север и юг). */
export const isCityGate = (dx: number, dy: number) => Math.abs(dx) <= 1 && Math.abs(dy) === CITY_WALL.y;

/** Покрытие клетки малого города. */
export function cityGround(_style: CityStyle, dx: number, dy: number): CityGround {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax <= 1 && ay >= CITY_WALL.y) return "road";
  if (!inCityWalls(dx, dy)) return "plain";
  if (ax <= 1) return "road";
  if (ax === 12 || ay === 9) return "path";
  if (ay <= 1 || (ax <= 6 && ay <= 4)) return "road";
  return "plain";
}

/** Башни 2×2: якорь — левая нижняя клетка. */
export const CITY_TOWERS: [number, number][] = [
  [-15, -CITY_WALL.y], [14, -CITY_WALL.y], [-15, CITY_WALL.y + 1], [14, CITY_WALL.y + 1],
  [-3, -CITY_WALL.y], [2, -CITY_WALL.y], [-3, CITY_WALL.y + 1], [2, CITY_WALL.y + 1],
];
/** Дома 4×3 (якорь — левая нижняя клетка): по четыре в северном и южном ряду. */
export const CITY_HOUSES: [number, number][] = [[-11, -6], [-6, -6], [3, -6], [8, -6], [-11, 8], [-6, 8], [3, 8], [8, 8]];
/** Прилавки 2×1: торговец и повар. */
export const CITY_STALLS: [number, number][] = [[-6, -3], [4, -3]];
/** Остальное убранство: [вид без стиля, dx, dy]. Виды вида "~x" зависят от стиля (см. STYLE). */
const COMMON: [string, number, number][] = [
  ["well", -4, 3], ["barrel", -7, -3], ["crate", -4, -3], ["barrel", 3, -3], ["crate", 6, -3],
  ["~light", -6, 1], ["~light", 6, 1], ["~light", -2, -4], ["~light", 2, -4], ["~light", -2, 4], ["~light", 2, 4],
  ["~tree", -10, 3], ["~tree", 10, 4], ["~tree", -8, 5], ["~tree", 6, 5],
];
export const STYLE = {
  solgard: {
    wall_h: "sol_wall_h", wall_v: "sol_wall_v", tower: "sol_tower", gate: "sol_gate", houses: ["sol_house", "sol_temple"],
    stalls: ["stall_gold", "stall_blue"], light: "lamp", tree: "v_basic_oak_small",
    standard: "std-home-sol", wallBanner: "std-wall-sol", gateBanner: "std-gate-sol",
    extra: [["std-home-sol", -11, -2], ["std-home-sol", 10, -2], ["sun_statue", -9, 5], ["std-home-sol", 9, -4]] as [string, number, number][],
  },
  umbrath: {
    wall_h: "umb_wall_h", wall_v: "umb_wall_v", tower: "umb_tower", gate: "umb_gate", houses: ["umb_house", "umb_crypt"],
    stalls: ["stall_purple", "stall_purple"], light: "soul_brazier", tree: "v_graveyard_dead_tree_a",
    standard: "std-home-umb", wallBanner: "std-wall-umb", gateBanner: "std-gate-umb",
    // погост Мортхейма на свободной земле у стен (не на улицах, кольце и площади): надгробия, кресты, плиты, статуи (Graveyard)
    extra: [["std-home-umb", -11, -2], ["std-home-umb", 10, -2], ["bone_pile", -9, 5], ["dark_obelisk", 9, -4],
      ["v_graveyard_cross_a", 8, 2], ["v_graveyard_stone_b", 10, 2], ["v_graveyard_slab_a", 9, 4], ["v_graveyard_statue_a", 11, 3],
      ["v_graveyard_statue_b", -8, 3], ["v_graveyard_cross_c", -10, 2], ["v_graveyard_slab_b", -9, -3], ["v_graveyard_stele_a", -10, -5],
      ["v_graveyard_stone_c", 7, -2], ["v_graveyard_cross_b", 11, -4]] as [string, number, number][],
  },
} as const;
/**
 * Знамёна столиц и фортов (решение 5 — знамёна главный мотив мира; листы — tools/gen/standards.ts, в игру — standards-to-game.ts).
 * Настенные (STYLE.gateBanner/wallBanner, проход не загораживают; ставит shared/map.ts): над обоими воротами, на всех восьми башнях
 * и посреди пролётов северной и южной стен — CITY_WALL_BANNERS, dx (полутайлы: середина пролёта между угловой и надвратной башней).
 * Штандарты своих земель на древке (STYLE.standard) у входа — CITY_ENTRANCE: у северных ворот изнутри (снаружи их закрыли бы
 * башни), у южных — снаружи; в 6 клетках от оси ворот — между знамёнами надвратных башен и пролётов, не заслоняют их (и оберег форта у южных ворот).
 */
export const CITY_WALL_BANNERS = [-8.5, 8.5];
const CITY_ENTRANCE: [number, number][] = [[-6, -CITY_WALL.y + 1], [6, -CITY_WALL.y + 1], [-6, CITY_WALL.y + 2], [6, CITY_WALL.y + 2]];
export function cityDecor(style: CityStyle): [string, number, number][] {
  const s = STYLE[style];
  const out: [string, number, number][] = COMMON.map(([k, x, y]) => [k === "~light" ? s.light : k === "~tree" ? s.tree : k, x, y]);
  return [...out, ...s.extra.map((e) => [...e] as [string, number, number]), ...CITY_ENTRANCE.map(([x, y]) => [s.standard, x, y] as [string, number, number])];
}

/**
 * Форт (задача 132, шаги 4 и 10): казармы в северном ряду; у южных углов — командирские шатры, у западной стены — шатры своей фракции и стол с картой;
 * плац — площадь |dx|≤6, |dy|≤4 с манекенами (анимированные листы bf-dummy-*) и стойками; кузня — у восточной стены (горны bf-forge-*, наковальни, бадья);
 * двор осадных машин у южных ворот: требушет (запад), катапульта и баллиста (восток). Проходы |dx|≤1, кольцо и маршруты стражи свободны.
 * Виды с «~» зависят от стиля (FORT_KIND). Знамёна — как у столиц (настенные и штандарты у входа, CITY_ENTRANCE), и ещё штандарты
 * на древке вдоль боковых стен изнутри: [dx, dy].
 */
export const FORT_HOUSES: [number, number][] = [[-11, -6], [-6, -6], [3, -6], [8, -6]];
const FORT_BANNERS: [number, number][] = [[-13, -5], [13, -5], [-13, 5], [13, 5], ...CITY_ENTRANCE];
const FORT_KIND: Record<CityStyle, Record<string, string>> = {
  solgard: { "~tent": "bf_tent_sol", "~cmd": "bf_tent_sol_cmd" },
  umbrath: { "~tent": "bf_tent_umb", "~cmd": "bf_tent_umb_cmd" },
};
const FORT_CAMP: [string, number, number][] = [
  ["~cmd", -11, 8], ["~cmd", 8, 8], ["~tent", -11, -2], ["~tent", -11, 5], ["bf_map_table", -8, 3], ["bf_shield_stand", -8, -2],
];
const FORT_PLAZA: [string, number, number][] = [
  ["bf-dummy-0", -5, -1], ["bf-dummy-2", -3, -1], ["weapon_rack", 5, -1], ["weapon_rack", 4, -1], ["bf-dummy-1", 5, 1], ["bf-dummy-0", -5, 1],
];
const FORT_FORGE: [string, number, number][] = [
  ["v_smith_anvil_a", 8, -3], ["bf-forge-small", 10, -3], ["v_smith_tub_a", 11, -4], ["bf-forge-cone", 9, 4], ["v_smith_anvil_b", 8, 4], ["weapon_rack", 11, 6],
];
const FORT_SIEGE: [string, number, number][] = [
  ["bf-trebuchet", -7, 8], ["barrel", -5, 6], ["crate", -4, 6],
  ["bf-catapult-s", 3, 8], ["bf-ballista-s", 5, 8], ["hay", 4, 6], ["crate", 5, 6],
];
/** Убранство форта: общее без садов и погоста, лагерь, плац, кузня, двор осадных машин и штандарты своей фракции. */
export function fortDecor(style: CityStyle): [string, number, number][] {
  const s = STYLE[style];
  const banner = s.standard;
  const kind = (k: string) => (k === "~light" ? s.light : FORT_KIND[style][k] ?? k);
  const common = COMMON.filter(([k]) => k !== "~tree").map(([k, x, y]) => [kind(k), x, y] as [string, number, number]);
  return [
    ...[...FORT_CAMP, ...FORT_PLAZA, ...FORT_FORGE, ...FORT_SIEGE].map(([k, x, y]) => [kind(k), x, y] as [string, number, number]),
    ...common,
    ...FORT_BANNERS.map(([x, y]) => [banner, x, y] as [string, number, number]),
  ];
}

/** Стражники: неподвижные у ворот и патрули (точки маршрута в тайлах, центр клетки = +0.5). */
export const CITY_GATE_GUARDS: [number, number][] = [[-2, -9], [2, -9], [-2, 9], [2, 9]];
export const CITY_PATROLS: [number, number][][] = [
  [[-11.5, -8.5], [12.5, -8.5], [12.5, 9.5], [-11.5, 9.5]],
  [[2.5, -9.5], [2.5, 9.5], [-6.5, 0.5], [6.5, 0.5]],
];
export const CITY_CITIZEN_SPOTS: [number, number][] = [[-8, -4], [8, -4], [-7, 4], [7, 4], [0, 4], [0, -4], [-12, 5], [12, -5]];
export const CITY_CITIZEN_COUNT = 4;
/** Куда выходят ворота (снаружи): для патрулей за стенами не нужны, но пригодятся тестам. */
export const CITY_GATES = [{ id: "n", x: 0, y: -CITY_WALL.y - 1 }, { id: "s", x: 0, y: CITY_WALL.y + 1 }];

const STONE_AT: [number, number] = [3, 2];
const MERCHANT_AT: [number, number] = [-5, -2];
const COOK_AT: [number, number] = [5, -2];
const QUEST_AT: [number, number] = [-9, 2];
export const CITY_RUMOR_AT: [number, number] = [8, 2];
/** Банкир, сумочник и кузнец столиц (решение 2 задачи 132: банк, заточка и сумки — и в столицах): перед домами северного ряда, у кузнеца — наковальня. */
const BANKER_AT: [number, number] = [-9, -5];
const BAGMAN_AT: [number, number] = [-4, -5];
const SMITH_AT: [number, number] = [10, -5];
/** Убранство только столиц: [вид, dx, dy]. */
export const CAPITAL_DECOR: [string, number, number][] = [["anvil", 11, -5]];

export interface CityNpc {
  id: string;
  name: string;
  sprite: string;
  tint: number;
  color: string;
  greeting?: string;
  /** Пиксели. */
  x: number;
  y: number;
}
export interface City {
  id: string;
  name: string;
  /** Стиль города; у Эмберхолла нет. */
  style?: CityStyle;
  /** Столица или форт фракции: своим — возрождение (форт — после первого визита) и телепорт; врагам вход под ударами стражи, телепорт закрыт. */
  capital?: string;
  /** Форт на краю Полей вечных битв (задача 132, шаг 4): плац, кузня, двор осадных машин; героям фракции не стартовый город. */
  fort?: boolean;
  /** Центр в тайлах и полуразмеры зоны. */
  x: number;
  y: number;
  half: { x: number; y: number };
  /** Камень телепорта: клетка (тайлы), точка у его основания и где появляется прибывший (пиксели). */
  stoneTile: { x: number; y: number };
  stone: { x: number; y: number };
  arrive: { x: number; y: number };
  /** Где возрождаются мёртвые игроки (пиксели). */
  spawn: { x: number; y: number };
  merchant?: CityNpc;
  cook?: CityNpc;
  /** Заказчик: только у Эмберхолла нет и у фортов нет; задания — у поселений земель (shared/settlements.ts). */
  quest?: CityNpc;
  /** Только у столиц: банкир, кузнец (заточка) и сумочник. */
  banker?: CityNpc;
  smith?: CityNpc;
  bagman?: CityNpc;
  guard?: { name: string; sprite: string; lines: string[] };
  people?: { name: string; sprite: string }[];
}

type RawNpc = { id: string; name: string; sprite: string; tint: string; color: string; greeting?: string };
const tileCenter = (tx: number, ty: number) => ({ x: tx * TILE + 16, y: ty * TILE + 16 });
/** Стоящий за прилавком: x — центр прилавка, y — на клетку ниже с поправкой (как торговка Марфа). */
const npcStall = (c: { x: number; y: number }, at: [number, number], n: RawNpc): CityNpc => ({ ...n, tint: Number(n.tint), x: (c.x + at[0]) * TILE, y: (c.y + at[1]) * TILE + 8 });
const npcTile = (c: { x: number; y: number }, at: [number, number], n: RawNpc): CityNpc => ({ ...n, tint: Number(n.tint), ...tileCenter(c.x + at[0], c.y + at[1]) });

type CityId = Exclude<keyof typeof data, "_doc">;
function small(id: CityId, style: CityStyle, x: number, y: number, fort = false): City {
  const d = data[id] as (typeof data)[CityId] & { capital?: string; quest?: RawNpc; banker?: RawNpc; smith?: RawNpc; bagman?: RawNpc };
  const c = { x, y };
  const st = { x: x + STONE_AT[0], y: y + STONE_AT[1] };
  return {
    id, name: d.name, style, x, y, half: CITY_HALF,
    stoneTile: st,
    stone: { x: st.x * TILE + 16, y: (st.y + 1) * TILE - 2 },
    arrive: tileCenter(st.x, st.y + 1),
    // столица: в центре площади (просторно — сюда приходят новички); малый город — у колодца
    spawn: d.capital ? tileCenter(x, y) : tileCenter(x, y + 4),
    merchant: npcStall(c, MERCHANT_AT, d.merchant),
    cook: npcStall(c, COOK_AT, d.cook),
    quest: d.quest && npcTile(c, QUEST_AT, d.quest),
    banker: d.banker && npcTile(c, BANKER_AT, d.banker),
    smith: d.smith && npcTile(c, SMITH_AT, d.smith),
    bagman: d.bagman && npcTile(c, BAGMAN_AT, d.bagman),
    guard: d.guard,
    people: d.people,
    capital: d.capital,
    fort: fort || undefined,
  };
}

const EMBER_STONE = { x: TOWN.x + 5, y: TOWN.y + 3 };
export const CITIES: City[] = [
  {
    id: "ember", name: "Эмберхолл", x: TOWN.x, y: TOWN.y, half: BELT_HALF,
    stoneTile: EMBER_STONE,
    stone: { x: EMBER_STONE.x * TILE + 16, y: (EMBER_STONE.y + 1) * TILE - 2 },
    arrive: tileCenter(EMBER_STONE.x, EMBER_STONE.y + 1),
    spawn: tileCenter(TOWN.x, TOWN.y + 3),
  },
  // форты фракций на краях Полей вечных битв (задача 132, шаг 4), зеркально
  small("fort_solgard", "solgard", FORTS.west.x, FORTS.west.y, true),
  small("fort_umbrath", "umbrath", FORTS.east.x, FORTS.east.y, true),
  // столицы на противоположных краях мира
  small("aurelion", "solgard", 56, 180),
  small("morthaim", "umbrath", MAP_W - 57, 180),
];
export const cityById = (id: string) => CITIES.find((c) => c.id === id);
/** Столица фракции (место появления и возрождения её героев); без фракции — Эмберхолл. */
export const homeCity = (faction: string | undefined): City => CITIES.find((c) => c.capital && !c.fort && c.capital === faction) ?? CITIES[0];
/** Чужая столица или чужой форт: телепорт не открывается, возрождения там нет. */
export const isEnemyCapital = (c: City, faction: string | undefined) => !!c.capital && c.capital !== faction;
/** Открыт ли город для героя: своя столица — всегда, остальные (в том числе свой форт и Эмберхолл) — после первого визита пешком. */
export function cityKnown(c: City, found: readonly string[] | undefined, faction: string | undefined): boolean {
  if (isEnemyCapital(c, faction)) return false;
  if (!faction) return c.id === "ember" || !!found?.includes(c.id);
  return homeCity(faction).id === c.id || !!found?.includes(c.id);
}
/** Внутри стен Эмберхолла (пиксели): здесь нельзя драться и применять атакующие умения, бафы и лечение можно (решение 11, задача 132). */
export const inEmberWalls = (px: number, py: number) => inTownWalls(Math.floor(px / TILE) - TOWN.x, Math.floor(py / TILE) - TOWN.y);
export const NO_FIGHT_MSG = "В Эмберхолле нельзя драться: атакующие умения здесь не действуют";
/** Город, в чьей зоне лежит клетка (тайлы), или null. */
export function cityAtTile(x: number, y: number): City | null {
  for (const c of CITIES) if (Math.abs(x - c.x) <= c.half.x && Math.abs(y - c.y) <= c.half.y) return c;
  return null;
}
/** Ближайший к точке (пиксели) город из открытых герою: своя столица открыта всегда (без фракции — Эмберхолл). */
export function nearestCity(found: readonly string[] | undefined, px: number, py: number, faction?: string): City {
  let best = homeCity(faction), bd = Infinity;
  for (const c of CITIES) {
    if (!cityKnown(c, found, faction)) continue;
    const d = Math.hypot(c.spawn.x - px, c.spawn.y - py);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ---------- телепорт ----------
export const TELEPORT_CAST_MS = 3000;
/** Телепорт нельзя, пока не прошло столько мс после последнего боя. */
export const TELEPORT_COMBAT_MS = 8000;
export const TELEPORT_RANGE = 110;
/** Цена по расстоянию между городами: 50–200 золота. */
export function teleportPrice(a: City, b: City): number {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return Math.max(50, Math.min(200, Math.round((d * 1.4) / 10) * 10));
}
/** Камень, рядом с которым стоит точка (пиксели), или null. */
export function stoneNear(px: number, py: number): City | null {
  for (const c of CITIES) if (Math.hypot(c.stone.x - px, c.stone.y - 14 - py) <= TELEPORT_RANGE) return c;
  return null;
}
