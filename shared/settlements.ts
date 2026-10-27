/**
 * Поселения безопасных земель (задача 132, шаг 3): по одному в каждой большой зоне земель фракции, четыре на сторону, восток — зеркало запада.
 * Место, вид, ворота и ограда — data/world.json → places (kind settlement); жители и NPC — data/settlements.json; штандарты — data/world.json → banners.
 * Сольгард — лагерь с хижинами и шатрами за замкнутым частоколом: малый у колодца (plan hamlet) или военный с учебным двором (camp).
 * Умбрат — деревня в руинах за тёмным частоколом с шипами (задача 141): тот же план, шатры тёмные (шаг 10), вместо домов развалины, целым стоит только склеп.
 * План задан для запада (смещения от центральной клетки, +x — к реке); у восточных поселений он отражён: клетка dx ↔ −dx, точка t ↔ 1 − t.
 * Внутри — крест свободных улиц |dx| ≤ 1 и |dy| ≤ 1: от ворот любой стороны до площади путь прямой, поэтому пути от обеих столиц равны.
 * Файл не зависит от map.ts: генератор карты (постройки, земля, торговцы), сервер (стража, повара) и клиент (NPC) берут разметку отсюда.
 *
 *   ограда: клетки dx = ±w, dy = −n и s, сплошной частокол; ворота — проём в 3 клетки посередине стороны gate,
 *   штандарты — снаружи по бокам ворот (в 4 клетках от оси, за линией ограды; в 3 — обереги);
 *   рынок: прилавки 2×1 на клетках (−5…−4, 2) и (4…5, 2), торговец и повар стоят перед ними; котёл — (6, 2);
 *   место под камень перемещения — клетка (−3, 4), прибывший — под ней; возрождение — центральная клетка.
 */
import world from "../data/world.json";
import data from "../data/settlements.json";
import { BUSHES_FLOWER, GRAVES, MARKERS, STUMPS, pick } from "./decor";
import { MAP_AXIS, TILE } from "./constants";

export type SettleLook = "sol" | "umb";
export type SettlePlan = "hamlet" | "camp";
export type GateSide = "n" | "s" | "e" | "w";
type Cell = [number, number];

/** NPC поселения (как CityNpc в cities.ts): пиксели. */
export interface SettleNpc { id: string; name: string; sprite: string; tint: number; color: string; greeting?: string; x: number; y: number }
export interface Settlement {
  id: string;
  name: string;
  faction: "solgard" | "umbrath";
  look: SettleLook;
  plan: SettlePlan;
  /** Центральная клетка (тайлы): площадь на перекрёстке улиц. */
  x: number;
  y: number;
  /** Восток: план отражён (клетка dx запада ↔ −dx). */
  mirror: boolean;
  /** Ограда: клетки dx = ±w, dy = −n и s от центра. */
  ring: { w: number; n: number; s: number };
  /** Сторона ворот в мире (у дороги к поселению). */
  gate: GateSide;
  /** Двор за южной оградой: погост у Умбрата, сад у Сольгарда (след у зеркальной пары общий). */
  yard: boolean;
  merchant: SettleNpc;
  cook: SettleNpc;
  /** Заказчик заданий (data/settlements.json → quest; задания бывших Оазиса и Снежной долины, задача 132, шаг 4): есть не у каждого поселения. */
  quest?: SettleNpc;
  /** Место под камень перемещения (BACKLOG 48): клетка, точка у основания и где появится прибывший — как у городов. */
  stoneTile: { x: number; y: number };
  stone: { x: number; y: number };
  arrive: { x: number; y: number };
  /** Место возрождения (BACKLOG 51), пиксели. */
  spawn: { x: number; y: number };
  guard: { name: string; sprite: string; lines: string[] };
  people: { name: string; sprite: string }[];
  /** Смещения от центра в мире: посты стражи у ворот (клетки), маршрут патруля (непрерывные, центр клетки — +0,5), места горожан (клетки). */
  posts: Cell[];
  patrol: Cell[];
  spots: Cell[];
  /** Клетки (тайлы) штандартов из world.json → banners: пара по бокам проёма ворот (settle-gate). */
  banners: { x: number; y: number; role: string }[];
}

/** Круг без природного декора и воды вокруг центра (тайлы): ограда с запасом в 3–5 клеток. */
export const SETTLE_R = 13;
/** Мобы не появляются ближе стольких тайлов к ограде: стража бьёт мобов в GUARD_RANGE_TILES (6) от неё, плюс запас на их бродяжничество. */
export const SETTLE_MOB_GAP = 9;
const RING = { w: 8, n: 6, s: 6 };
/** Точки запада: торговец и повар — середина прилавка (край клетки) на строку ниже с поправкой +8 px, как в городах; камень — клетка. */
const MERCHANT_AT: Cell = [-4, 3];
const COOK_AT: Cell = [5, 3];
const STONE_AT: Cell = [-3, 4];
const QUEST_AT: Cell = [2, 3];
const PATROL: Cell[] = [[-6.5, -0.5], [6.5, -0.5], [6.5, 1.5], [-6.5, 1.5]];
const SPOTS: Cell[] = [[-5, 0], [5, 0], [0, -3], [0, 3], [-3, -1], [3, 1]];

/** Роли объектов плана: вид выбирается по стилю (KINDS). */
type Role = "house" | "tent" | "stallM" | "stallC" | "light" | "fire" | "cauldron" | "barrel" | "crate" | "rack" | "hay" | "logs" | "well" | "tree";
/** Объекты плана для запада: роль и клетка привязки (левая нижняя, как place() в map.ts). Улицы |dx| ≤ 1, |dy| ≤ 1, посты у ворот и места камня свободны. */
const COMMON: [Role, number, number][] = [["stallM", -5, 2], ["stallC", 4, 2], ["cauldron", 6, 2]];
const PLANS: Record<SettlePlan, [Role, number, number][]> = {
  // малый лагерь: два больших места у северной ограды (у Сольгарда — шатры, у Умбрата — развалины дома и склеп), шатёр и хозяйство у южной
  hamlet: [
    ["house", -7, -2], ["house", 4, -2], ["light", -3, -2], ["light", 3, -2], ["barrel", -3, -4], ["crate", 3, -4],
    ["tent", -7, 5], ["well", 5, 5], ["hay", 7, 5], ["tree", 7, 3],
  ],
  // лагерь: четыре шатра на севере, костёр с поленницей на юго-западе, учебный двор с чучелами на юго-востоке.
  // Углы между шатрами и оградой (2×2) заставлены целиком — без запертых свободных клеток (tests/cities.ts: всё свободное внутри достижимо с площади)
  camp: [
    ["tent", -7, -2], ["tent", 4, -2], ["tent", -5, -4], ["tent", 3, -4], ["light", -3, -2], ["light", 3, -2],
    ["rack", -7, -4], ["barrel", -6, -5], ["barrel", -7, -5], ["crate", -6, -4], ["rack", 7, -4], ["crate", 6, -5], ["barrel", 7, -5], ["crate", 6, -4],
    ["fire", -6, 4], ["logs", -7, 5], ["hay", -4, 5], ["rack", 7, 5],
  ],
};
/** Виды по стилю (шаг 10 задачи 132): у Сольгарда шатры бело-золотые (bf_tent_sol), на месте дома — хижина hut_sol (задача 141)
 *  у Умбрата шатры тёмные (bf_tent_umb), первый дом — развалины дома (ruin_house), второй — склеп. */
const KINDS: Record<SettleLook, Record<Role, string[]>> = {
  sol: {
    house: ["hut_sol"], tent: ["bf_tent_sol"], stallM: ["stall_gold"], stallC: ["stall_blue"], light: ["lamp"], fire: ["campfire"], cauldron: ["cauldron"],
    barrel: ["barrel"], crate: ["crate"], rack: ["weapon_rack"], hay: ["hay"], logs: ["v_basic_log_pile"], well: ["well"], tree: ["v_basic_oak_small"],
  },
  umb: {
    house: ["ruin_house", "umb_crypt"], tent: ["bf_tent_umb"], stallM: ["stall_purple"], stallC: ["stall_purple"], light: ["soul_brazier"], fire: ["soul_brazier"], cauldron: ["cauldron"],
    barrel: ["barrel"], crate: ["crate"], rack: ["weapon_rack"], hay: ["bone_pile"], logs: ["v_graveyard_coffin_closed"], well: ["well"],
    tree: ["v_graveyard_dead_tree_a"],
  },
};
/** Развалины Умбрата: [вид, dx, dy] от привязки. ruin — след шатра 3×2 занят целиком (как шатёр у Сольгарда: те же проходы и без запертых клеток);
 *  ruin_house — след дома 4×3: передняя стена, колонны в левом углу и камень внутри, остальное — пролом (выход справа, к улице). */
const RUINS: Record<string, [string, number, number][]> = {
  ruin: [["ruin_wall", 0, 0], ["ruin_pillar", 2, 0], ["v_graveyard_pillar_broken", 0, -1], ["rock", 1, -1], ["ruin_pillar", 2, -1]],
  ruin_house: [["ruin_wall", 0, 0], ["ruin_wall", 2, 0], ["v_graveyard_pillar_broken", 0, -1], ["ruin_pillar", 0, -2], ["rock", 2, -2]],
};

type RawNpc = { id: string; name: string; sprite: string; tint: string; color: string; greeting?: string };
type RawPlace = { id: string; name: string; kind: string; look?: string; plan?: string; gate?: string; ring?: { w: number; n: number; s: number }; yard?: boolean; x: number; y: number };
const flipSide = (g: GateSide): GateSide => (g === "e" ? "w" : g === "w" ? "e" : g);
const tileCenter = (tx: number, ty: number) => ({ x: tx * TILE + 16, y: ty * TILE + 16 });

function make(p: RawPlace): Settlement {
  const d = (data as unknown as Record<string, { guard: Settlement["guard"]; people: Settlement["people"]; merchant: RawNpc; cook: RawNpc; quest?: RawNpc }>)[p.id];
  if (!d) throw new Error(`data/settlements.json: нет жителей поселения ${p.id}`);
  const look: SettleLook = p.look === "umb" ? "umb" : "sol";
  const mirror = p.x > MAP_AXIS;
  const ring = { ...RING, ...p.ring };
  const gate = (p.gate ?? "n") as GateSide;
  // сторона ворот в плане запада; клетка и точка запада → смещение в мире
  const gw = mirror ? flipSide(gate) : gate;
  const cx = (dx: number) => (mirror ? -dx : dx);
  const tx = (t: number) => (mirror ? 1 - t : t);
  const npc = (n: RawNpc, at: Cell): SettleNpc => ({ ...n, tint: Number(n.tint), x: (p.x + tx(at[0])) * TILE, y: (p.y + at[1]) * TILE + 8 });
  const postsW: Cell[] = gw === "n" ? [[-2, -ring.n + 1], [2, -ring.n + 1]] : gw === "s" ? [[-2, ring.s - 1], [2, ring.s - 1]]
    : gw === "e" ? [[ring.w - 1, -2], [ring.w - 1, 2]] : [[-ring.w + 1, -2], [-ring.w + 1, 2]];
  const st = { x: p.x + cx(STONE_AT[0]), y: p.y + STONE_AT[1] };
  const banners = (world.banners.list as { place?: string; role: string; x: number; y: number }[])
    .filter((b) => b.place === p.id).map((b) => ({ x: Math.floor(b.x), y: Math.floor(b.y), role: b.role }));
  return {
    id: p.id, name: p.name, faction: look === "sol" ? "solgard" : "umbrath", look, plan: p.plan === "camp" ? "camp" : "hamlet",
    x: p.x, y: p.y, mirror, ring, gate, yard: !!p.yard,
    merchant: npc(d.merchant, MERCHANT_AT),
    cook: npc(d.cook, COOK_AT),
    quest: d.quest && { ...d.quest, tint: Number(d.quest.tint), ...tileCenter(p.x + cx(QUEST_AT[0]), p.y + QUEST_AT[1]) },
    stoneTile: st,
    stone: { x: st.x * TILE + 16, y: (st.y + 1) * TILE - 2 },
    arrive: tileCenter(st.x, st.y + 1),
    spawn: tileCenter(p.x, p.y),
    guard: d.guard,
    people: d.people,
    posts: postsW.map(([dx, dy]) => [cx(dx), dy]),
    patrol: PATROL.map(([t, dy]) => [tx(t), dy]),
    spots: SPOTS.map(([dx, dy]) => [cx(dx), dy]),
    banners,
  };
}

export const SETTLEMENTS: Settlement[] = (world.places.list as RawPlace[]).filter((p) => p.kind === "settlement").map(make);

/** Клетки проёма ворот (тайлы мира). */
export function gateCells(s: Settlement): Cell[] {
  const { w, n, s: so } = s.ring;
  const out: Cell[] = [];
  for (let i = -1; i <= 1; i++) {
    out.push(s.gate === "n" ? [s.x + i, s.y - n] : s.gate === "s" ? [s.x + i, s.y + so] : s.gate === "e" ? [s.x + w, s.y + i] : [s.x - w, s.y + i]);
  }
  return out;
}
/** Внутри ли ограды клетка (тайлы мира; сама ограда не считается). */
export const insideRing = (s: Settlement, x: number, y: number) =>
  Math.abs(x - s.x) < s.ring.w && y - s.y > -s.ring.n && y - s.y < s.ring.s;

/** Расстояние (тайлы) от точки до прямоугольника ограды ближайшего поселения (0 внутри) — так же стража считает, близко ли моб (townfolk siteDist). */
export function settleDist(x: number, y: number): number {
  let best = Infinity;
  for (const s of SETTLEMENTS) {
    const ex = Math.max(0, Math.abs(x - (s.x + 0.5)) - s.ring.w - 0.5), ey = Math.max(0, Math.abs(y - (s.y + 0.5)) - Math.max(s.ring.n, s.ring.s) - 0.5);
    best = Math.min(best, Math.sqrt(ex * ex + ey * ey));
  }
  return best;
}

/** Поселение, в чью ограду (вместе с ней) попадает клетка, или null. */
export function settlementAt(x: number, y: number): Settlement | null {
  for (const s of SETTLEMENTS) if (Math.abs(x - s.x) <= s.ring.w && y - s.y >= -s.ring.n && y - s.y <= s.ring.s) return s;
  return null;
}

/**
 * Земля поселения в непрерывной точке (тайлы): path — утоптанные улицы крестом от площади (|dx| ≤ 1 или |dy| ≤ 1) и проём ворот, yard — остальной двор
 * за оградой, null — снаружи. Считается от центра клетки (+0,5) по модулю смещения, поэтому зеркальные поселения дают зеркальную землю.
 */
export function settleGround(x: number, y: number): "path" | "yard" | null {
  for (const s of SETTLEMENTS) {
    const u = x - (s.x + 0.5), v = y - (s.y + 0.5);
    const { w, n, s: so } = s.ring;
    if (u < -w - 0.5 || u > w + 0.5 || v < -n - 0.5 || v > so + 0.5) continue;
    const inside = Math.abs(u) <= w - 0.5 && v >= -n + 0.5 && v <= so - 0.5;
    const gateway = s.gate === "n" ? Math.abs(u) <= 1.5 && v < -n + 0.5 : s.gate === "s" ? Math.abs(u) <= 1.5 && v > so - 0.5
      : s.gate === "e" ? Math.abs(v) <= 1.5 && u > w - 0.5 : Math.abs(v) <= 1.5 && u < -w + 0.5;
    if (gateway) return "path";
    if (!inside) return null;
    return Math.abs(u) <= 1.5 || Math.abs(v) <= 1.5 ? "path" : "yard";
  }
  return null;
}

/** Что даёт генератор карты постройке поселения (map.ts): постановку объектов со следом, мелочь без следа, проверку клетки, ширину следа и хэш. */
export interface SettleBuild {
  /** Поставить объект с привязкой к клетке (левая нижняя, тайлы мира), если весь след свободен; true — поставлен. */
  put(kind: string, x: number, y: number): boolean;
  /** Мелочь без следа: клетка (тайлы мира), сдвиг по y от верха клетки (пиксели). */
  deco(kind: string, x: number, y: number, dy?: number): void;
  /** Клетка проходима и не занята. */
  free(x: number, y: number): boolean;
  /** Ширина следа объекта (клетки). */
  width(kind: string): number;
  hash(x: number, y: number, s: number): number;
}

/** Постройки поселения: ограда со штандартами и воротами, объекты плана, мелочь во дворе и вокруг, погост или сад за оградой. */
export function buildSettlement(s: Settlement, b: SettleBuild, seed: number) {
  const K = KINDS[s.look];
  /** Объект плана запада с привязкой (ax, ay) → в мир: у отражённого плана привязка — левая клетка отражённого следа. */
  const putW = (kind: string, ax: number, ay: number) => {
    const w = b.width(kind);
    b.put(kind, s.x + (s.mirror ? -ax - (w - 1) : ax), s.y + ay);
  };
  // штандарты своих земель (world.json → banners) — снаружи по бокам ворот, не в линии ограды
  for (const q of s.banners) b.put(s.look === "sol" ? "std-home-sol" : "std-home-umb", q.x, q.y);
  const gate = new Set(gateCells(s).map(([x, y]) => y * 4096 + x));
  const x0 = s.x - s.ring.w, x1 = s.x + s.ring.w, y0 = s.y - s.ring.n, y1 = s.y + s.ring.s;
  // частокол (задача 141): сплошной — звенья H по рядам, V по бокам, на углах — бастион из брёвен (pal_corner_*), у боковых ворот — столбы из двух брёвен;
  // у северных и южных ворот крайние звенья перекрывают столбы-вышки ворот (кадр pal_gate_* шириной 5 клеток) — щелей нет
  const L = s.look, post = new Set<number>();
  if (s.gate === "e" || s.gate === "w") for (const d of [-2, 2]) post.add((s.y + d) * 4096 + (s.gate === "e" ? x1 : x0));
  const corner = (x: number) => x === x0 || x === x1;
  for (const y of [y0, y1]) for (let x = x0; x <= x1; x++) if (!gate.has(y * 4096 + x)) b.put(corner(x) ? `pal_corner_${L}` : post.has(y * 4096 + x) ? `pal_post_${L}` : `pal_h_${L}`, x, y);
  for (const x of [x0, x1]) for (let y = y0 + 1; y < y1; y++) if (!gate.has(y * 4096 + x)) b.put(post.has(y * 4096 + x) ? `pal_post_${L}` : `pal_v_${L}`, x, y);
  // ворота частокола над проёмом с севера или юга — без следа, проём остаётся проходимым (шаг 10)
  if (s.gate === "n" || s.gate === "s") b.deco(`pal_gate_${L}`, s.x, s.gate === "n" ? y0 : y1, 30);
  // объекты плана: дома чередуются, у Умбрата шатёр и первый дом — развалины
  let houses = 0;
  for (const [role, ax, ay] of [...COMMON, ...PLANS[s.plan]]) {
    const kinds = K[role];
    const kind = role === "house" ? kinds[houses++ % kinds.length] : kinds[0];
    const ruin = RUINS[kind];
    if (ruin) for (const [k, dx, dy] of ruin) putW(k, ax + dx, ay + dy);
    else putW(kind, ax, ay);
  }
  // мелочь во дворе (не на улицах) и вокруг ограды: цветы и кусты у Сольгарда, кости и могилы у Умбрата
  for (let dy = -SETTLE_R; dy <= SETTLE_R; dy++) for (let dx = -SETTLE_R; dx <= SETTLE_R; dx++) {
    const x = s.x + dx, y = s.y + dy;
    if (dx * dx + dy * dy > (SETTLE_R - 1) ** 2 || !b.free(x, y) || Math.abs(dx) <= 1 || Math.abs(dy) <= 1) continue;
    const inside = insideRing(s, x, y), h = b.hash(x, y, seed + 503);
    if (inside && h < 0.07) b.deco(s.look === "sol" ? "flowers" : h < 0.035 ? "bones" : "mushrooms_glow", x, y);
    else if (!inside && h < 0.05) {
      if (s.look === "sol") b.deco(pick(h < 0.03 ? BUSHES_FLOWER : STUMPS, b.hash(x, y, seed + 504)), x, y);
      else b.deco(h < 0.02 ? pick(GRAVES, b.hash(x, y, seed + 505)) : "bones", x, y, 28);
    }
  }
  // за южной оградой (yard): у Умбрата — погост (ряды надгробий с могилами, статуи и фонари), у Сольгарда — сад (ряды деревьев, большие дубы, фонари).
  // След общий и зеркальный — места выбираются по смещениям плана запада, а не по клеткам мира: пути от обеих столиц в обход двора равны
  if (s.yard) {
    // всё в круге SETTLE_R: там нет воды, иначе одна из пары могла бы потерять надгробие или дерево и след разошёлся бы
    for (const ry of [2, 4]) for (let i = -7; i <= 7; i += 2) {
      if (b.hash(i, ry, seed + 506) < 0.15) continue; // не все места заняты
      const x = s.x + (s.mirror ? -i : i), y = y1 + ry, h = b.hash(i, ry, seed + 507);
      const ok = b.put(s.look === "sol" ? "v_basic_oak_small" : pick(MARKERS, h), x, y);
      if (ok && b.free(x, y + 1)) b.deco(s.look === "sol" ? pick(BUSHES_FLOWER, h) : pick(GRAVES, h), x, y + 1, s.look === "sol" ? 30 : 28);
    }
    for (const [k, dx, dy] of [["statue_a", -8, 3], ["statue_b", 8, 3], ["lamp", -2, 1], ["lamp", 2, 1]] as const) {
      const kind = s.look === "sol" ? (k === "lamp" ? "lamp" : "v_basic_oak") : k === "lamp" ? "v_graveyard_lamp_a" : `v_graveyard_${k}`;
      b.put(kind, s.x + (s.mirror ? -dx : dx), y1 + dy);
    }
  }
}
