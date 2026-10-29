/**
 * Рейд «Рогатый Рыцарь Хаоса» (задача 114, docs/raid.md): данные data/raid.json, карта цитадели, роли, точки сбора и
 * сообщения клиент ⇄ сервер. Логика боя — server/src/raid/ (director, chaosKnight, ai, chatter, rewards, muster), комната — RaidRoom.
 */
import data from "../data/raid.json";
import citadel from "../data/citadel.json";
import { CLASSES, type ClassId } from "./classes";
import { TILE } from "./constants";
import { CITIES } from "./cities";
import { CELL_BLOCK, CELL_WALL, T, Zone, type MapObject, type WorldMap } from "./map";
import * as V from "./decor";
import type { Item } from "./items";

export type RaidRole = "tank" | "healer" | "melee" | "ranged";
export const RAID_ROLES: readonly RaidRole[] = ["tank", "healer", "melee", "ranged"];
export const ROLE_NAMES: Record<RaidRole, string> = { tank: "Танк", healer: "Лекарь", melee: "Ближний бой", ranged: "Дальний бой" };
/** Роль класса в рейде: лучники и заклинатели — дальний бой. */
export const raidRole = (cls: ClassId): RaidRole => {
  const r = CLASSES[cls]?.role;
  return r === "tank" || r === "healer" || r === "melee" ? r : "ranged";
};

export type AttackKind = "auto" | "cone" | "circle" | "rings" | "line" | "ashfall" | "verdict" | "sun" | "kick" | "summon" | "berserk";
export interface RaidAttack {
  name: string;
  hint: string;
  kind: AttackKind;
  target?: string;
  pose?: "swing" | "slam" | "roar";
  yell?: string;
  /** Конус: угол в градусах. */
  angle?: number;
  r?: number;
  /** Линия: длина и полная ширина. */
  len?: number;
  w?: number;
  /** Телеграф (мс) и каст (мс) у «Солнца» и «Конца Пламени». */
  ms?: number;
  castMs?: number;
  mult?: number;
  pctHp?: number;
  every?: number;
  everyEnrage?: number;
  first?: number;
  count?: number;
  countLate?: number;
  onPlayers?: number;
  burnMs?: number;
  burnMult?: number;
  wave?: { name: string; kind: string; rings: [number, number][]; delayMs: number; mult: number };
  innerR?: number;
  step?: number;
  startMs?: number;
  pools?: number;
  poolR?: number;
  poolMs?: number;
  poolMult?: number;
  linesInEnrage?: number;
  repeatMs?: number;
  adds?: string[];
}
export interface RaidPhase { name: string; at: number; attacks: string[]; pauseMs: number; yell: string }
export interface RaidAdd { name: string; hint: string; sprite: string; role: string; count: number; hp: number; dmg: number; armor: number; speed: number; radius: number; range: number; attackCd: number; projectile?: string; threatOn?: string }
interface Tile { x: number; y: number }
interface RaidData {
  raid: {
    minLevel: number; size: number; maxPlayers: number; musterMs: number; gatherMs: number; pullMs: number; enrageMs: number;
    attempts: number; lockoutH: number; endMs: number; wipeMs: number;
    /** Провокации танков: угроза = макс. угроза × tauntMul + tauntFlat; дальность — range умения (или tauntRangeDefault) + радиус босса + tauntRangePad, px. */
    tauntMul: number; tauntFlat: number; tauntRangeDefault: number; tauntRangePad: number;
    /** Сколько мс до конца сбора остаётся после «поторопить» и сколько мс светится эффект лечения. */
    hurryGatherMs: number; healFxMs: number;
    revives: { base: number; perPhase: number; max: number; channelMs: number; range: number; hpPct: number };
  };
  npc: { name: string; greeting: string; sprite: string; tint: string; color: string; range: number };
  map: {
    zone: string; gate: string; gateAt: Tile | null; antechamber: string; w: number; h: number;
    hall: { x: number; y: number; rx: number; ry: number }; lava: number; seal: [number, number]; pillarR: number; pillarDeg: number[];
    bridge: { x0: number; x1: number; y0: number; y1: number }; antechamberRect: { x0: number; x1: number; y0: number; y1: number };
    spawn: Tile; portal: Tile; bossHome: Tile;
  };
  boss: {
    id: string; name: string; title: string; lore: string; size: number; level: number; radius: number; reach: number; attackCd: number;
    speed: number; aggro: number; xp: number; color: string; sprite: string; hallR: number;
    enrage: { speedMul: number; attackMul: number; periodMul: number };
  };
  phases: RaidPhase[];
  attacks: Record<string, RaidAttack>;
  adds: Record<string, RaidAdd>;
  yells: Record<string, string[]>;
  banners: { start: string; phase: string; enrage: string; win: string; wipe: string };
  chat: { start: string; win: string; wipe: string; trophy: string };
  bots: {
    title: string; names: string[]; roles: Record<string, Record<RaidRole, number>>; react: [number, number]; miss: number;
    cooldown: { all: number; perEvent: number }; lines: Record<string, Partial<Record<RaidRole | "any", string[]>>>;
  };
  rewards: {
    chance: { legendary: number; banner: number; helm: number; pityStep: number; pityMax: number };
    drops: { items: number; minRarity: number; ilvl: number; ashOre: [number, number]; starDust: [number, number]; potions: number; goldMul: number; lockedMul: number; bagMs: number };
    banner: { name: string; lore: string };
    helm: { name: string; lore: string };
  };
  title: { id: string; name: string; how: string; lore: string };
  frame: { id: string; name: string; how: string; color: string; wins: number; lore: string };
}

const D = data as unknown as RaidData;
/** Все данные рейда (data/raid.json) без служебных полей _doc. */
export const RAID = D;
export const RAID_CFG = D.raid;
export const RAID_BOSS = D.boss;
export const RAID_PHASES = D.phases;
export const RAID_ATTACKS: Record<string, RaidAttack> = Object.fromEntries(Object.entries(D.attacks).filter(([k]) => !k.startsWith("_"))) as Record<string, RaidAttack>;
export const RAID_ADDS: Record<string, RaidAdd> = Object.fromEntries(Object.entries(D.adds).filter(([k]) => !k.startsWith("_"))) as Record<string, RaidAdd>;
/** Состав по ролям на size участников (ближайшая запись bots.roles снизу). */
export function roleTargets(size: number): Record<RaidRole, number> {
  const keys = Object.keys(D.bots.roles).filter((k) => !k.startsWith("_")).map(Number).sort((a, b) => a - b);
  const k = [...keys].reverse().find((n) => n <= size) ?? keys[0];
  return { ...D.bots.roles[String(k)] };
}
/** Случайный вариант строки с подстановкой {ключ}. */
export function fillText(list: readonly string[] | undefined, vars: Record<string, string | number> = {}, rand: () => number = Math.random): string {
  if (!list?.length) return "";
  const s = list[Math.floor(rand() * list.length)];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
export const phaseName = (n: number) => RAID_PHASES[n]?.name ?? "";
const ROMAN = ["I", "II", "III", "IV", "V"];
export const phaseNo = (n: number) => ROMAN[n] ?? String(n + 1);

// ---------------------------------------------------------------- карта
const M = D.map;
const px = (t: Tile) => ({ x: t.x * TILE, y: t.y * TILE });
/** Точки карты цитадели в пикселях. */
export const RAID_POINTS = {
  hall: px(M.hall),
  bossHome: px(M.bossHome),
  spawn: px(M.spawn),
  portal: px(M.portal),
};
/** Центры колонн-укрытий (пиксели) и их полуразмер. */
export const RAID_PILLARS: { x: number; y: number }[] = M.pillarDeg.map((deg) => {
  const a = (deg * Math.PI) / 180;
  // клетка привязки 2×2 (левый верхний угол) — по центру ближайшей сетки
  const cx = Math.round(M.hall.x + Math.cos(a) * M.pillarR), cy = Math.round(M.hall.y + Math.sin(a) * M.pillarR);
  return { x: cx * TILE, y: cy * TILE };
});
export const PILLAR_HALF = TILE;

/** Точка появления героя в Преддверии: ряды по 5. */
export function raidSpawn(i: number): { x: number; y: number } {
  const col = i % 5, row = Math.floor(i / 5);
  return { x: (M.spawn.x - 4.4 + col * 2.2) * TILE, y: (M.spawn.y - 2 + row * 1.3) * TILE };
}

/** Внутри зала (эллипс, тайлы → пиксели). k — масштаб эллипса (1 — край пола). */
export function inHall(xPx: number, yPx: number, k = 1): boolean {
  const dx = (xPx / TILE - M.hall.x) / (M.hall.rx * k), dy = (yPx / TILE - M.hall.y) / (M.hall.ry * k);
  return dx * dx + dy * dy <= 1;
}

/** Вид цитадели v2 (tools/gen/citadel.ts, флаг клиента __citadelV2 — client/src/game/citadelV2.ts): другие объекты и лава под картинкой; клетки (проходимость) те же. */
let citadelV2 = false;
export function setCitadelV2(on: boolean) { citadelV2 = on; }

/**
 * Цитадель Хаоса 48×46: зал-эллипс из обсидиана с печатью вокруг босса и пятнами пепла, кольцо лавы, стены с жаровнями;
 * 4 колонны 2×2 (тень от «Солнца Хаоса»), мост на юге в Преддверие с порталом выхода.
 */
export function generateRaidMap(): WorldMap {
  const w = M.w, h = M.h;
  const vtx = new Uint8Array((w + 1) * (h + 1));
  const cell = new Uint8Array(w * h);
  const zone = new Uint8Array(w * h).fill(Zone.Citadel);
  const H = M.hall, B = M.bridge, A = M.antechamberRect;
  const ell = (x: number, y: number, pad = 0) => ((x - H.x) / (H.rx + pad)) ** 2 + ((y - H.y) / (H.ry + pad)) ** 2;
  const inBridge = (x: number, y: number) => x >= B.x0 && x <= B.x1 && y >= B.y0 && y <= B.y1;
  const inAnte = (x: number, y: number) => x >= A.x0 && x <= A.x1 && y >= A.y0 && y <= A.y1;
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  // вершины: пол зала, печать, пепел, лава, мост и Преддверие
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) {
    let t = T.Obsidian;
    const e = ell(x, y);
    const bd = Math.hypot(x - M.bossHome.x, y - M.bossHome.y);
    if (e <= 1) {
      if (bd >= M.seal[0] && bd <= M.seal[1]) t = T.Cobble;
      else if (hash(x, y) < 0.12 || (hash(x >> 2, y >> 2) < 0.18 && hash(x, y) < 0.5)) t = T.Ash;
    } else if (ell(x, y, M.lava) <= 1) t = T.Lava;
    else t = T.Obsidian;
    if (inBridge(x, y)) t = T.Cobble;
    if (inAnte(x, y)) t = T.Floor;
    if (inAnte(x, y) && Math.abs(x - M.portal.x) <= 1 && y >= M.portal.y - 1.5) t = T.Cobble;
    vtx[y * (w + 1) + x] = t;
  }
  // клетки: зал проходим, лава — непроходима (свечение рисует клиент), всё прочее — стены
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    const floor = ell(cx, cy) <= 1 || inBridge(cx, cy) || (inAnte(cx, cy) && cx > A.x0 + 0.5 && cx < A.x1 - 0.5 && cy > A.y0 - 0.5 && cy < A.y1 - 0.5);
    const lava = !floor && ell(cx, cy, M.lava) <= 1;
    if (lava) cell[y * w + x] = CELL_BLOCK;
    else if (!floor) cell[y * w + x] = CELL_BLOCK | CELL_WALL;
  }
  // колонны 2×2
  for (const p of RAID_PILLARS) {
    const tx = p.x / TILE, ty = p.y / TILE;
    for (let j = -1; j < 1; j++) for (let i = -1; i < 1; i++) cell[(ty + j) * w + tx + i] = CELL_BLOCK | CELL_WALL;
  }
  const objects: MapObject[] = [];
  const obj = (kind: string, x: number, y: number) => objects.push({ kind, x: Math.round(x * TILE), y: Math.round(y * TILE) });
  for (const p of RAID_PILLARS) objects.push({ kind: "chaos_pillar", x: p.x, y: p.y + TILE });
  // жаровни и факелы по стене зала, кости и цепи у лавы
  for (let i = 0; i < 14; i++) {
    const a = Math.PI + (i / 13) * Math.PI; // северная дуга
    const x = H.x + Math.cos(a) * (H.rx + M.lava + 1.2), y = H.y + Math.sin(a) * (H.ry + M.lava + 1.2);
    obj(i % 2 ? "torch" : "brazier", x, y + 0.9);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const x = H.x + Math.cos(a) * (H.rx - 1.4), y = H.y + Math.sin(a) * (H.ry - 1.4);
    if (Math.abs(x - H.x) < 4 && y > H.y) continue; // не на мосту
    obj(i % 3 ? "bones" : "bone_pile", x, y + 0.6);
  }
  // Volcanoe (задача 126): лавовые холмики и валуны стоят в самом кольце лавы (клетки там и так непроходимы, бою не мешают),
  // черепа и рёбра лежат у края пола; мост на юге свободен
  const lavaScenery = [...V.LAVA_MOUNDS, ...V.BOULDERS, ...V.LAVA_MOUNDS, ...V.LAVA_BIG];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.2;
    const x = H.x + Math.cos(a) * (H.rx + M.lava * 0.5 + 0.4), y = H.y + Math.sin(a) * (H.ry + M.lava * 0.5 + 0.4);
    if (Math.abs(x - H.x) < 5 && y > H.y) continue;
    obj(V.pick(lavaScenery, hash(i, 7)), x, y + 0.5);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.6;
    const x = H.x + Math.cos(a) * (H.rx - 0.8), y = H.y + Math.sin(a) * (H.ry - 0.8);
    if (Math.abs(x - H.x) < 4 && y > H.y) continue;
    obj(V.SKULLS[i % V.SKULLS.length], x, y + 0.6);
  }
  for (const [dx, dy] of [[-4, 2], [4, 2], [-3, -3], [3, -3]]) obj("ember_vent", M.bossHome.x + dx, M.bossHome.y + dy);
  // Преддверие: портал выхода, жаровни у моста
  obj("raid_portal", M.portal.x, M.portal.y + 0.5);
  obj("brazier", A.x0 + 1.5, A.y0 + 1.2);
  obj("brazier", A.x1 - 0.5, A.y0 + 1.2);
  obj("soul_brazier", B.x0 - 0.2, B.y1 + 0.9);
  obj("soul_brazier", B.x1 + 1.2, B.y1 + 0.9);
  if (citadelV2) {
    // объекты — из data/citadel.json; лава — во всех вершинах у непроходимых клеток (её видно только сквозь чашу на картинке цитадели)
    objects.length = 0;
    objects.push(...citadel.objects);
    const pillar = (x: number, y: number) => RAID_PILLARS.some((p) => x >= p.x / TILE - 1 && x < p.x / TILE + 1 && y >= p.y / TILE - 1 && y < p.y / TILE + 1);
    const walk = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (!(cell[y * w + x] & CELL_BLOCK) || pillar(x, y));
    for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) if (!(walk(x - 1, y - 1) && walk(x, y - 1) && walk(x - 1, y) && walk(x, y))) vtx[y * (w + 1) + x] = T.Lava;
  }
  const sp = px(M.spawn);
  return {
    w, h, seed: 0, vtx, cell, zone, objects,
    spawns: [], bosses: [], nodes: [],
    playerSpawn: sp,
    merchant: { x: -1000, y: -1000 },
    merchants: [],
  };
}

// ---------------------------------------------------------------- сбор в мире
export interface RaidHerald { id: string; name: string; place: string; x: number; y: number }
/**
 * «Вестник Цитадели» — в центральном мирном городе Эмберхолле (обе фракции; задача 151: перенесён из столиц и фортов) и у Врат в вулкане
 * (смещение от центра города, тайлы). Он же — регистрация на мировых боссов: одна система сборов (server/src/raid/muster.ts).
 */
const HERALD_AT: Record<string, [number, number]> = { ember: [-6, 4] };
export const RAID_GATE = M.gateAt ? px({ x: M.gateAt.x + 0.5, y: M.gateAt.y + 0.5 }) : null;
export const RAID_HERALDS: RaidHerald[] = [
  ...CITIES.filter((c) => HERALD_AT[c.id]).map((c) => ({
    id: `raid_herald_${c.id}`, name: D.npc.name, place: c.name,
    x: (c.x + HERALD_AT[c.id][0]) * TILE + 16, y: (c.y + HERALD_AT[c.id][1]) * TILE + 16,
  })),
  ...(RAID_GATE ? [{ id: "raid_gate", name: D.npc.name, place: M.gate, x: RAID_GATE.x, y: RAID_GATE.y }] : []),
];
/** Ближайший вестник в пределах range px или null. */
export function heraldNear(x: number, y: number, range = D.npc.range): RaidHerald | null {
  for (const h of RAID_HERALDS) if (Math.hypot(h.x - x, h.y - y) <= range) return h;
  return null;
}

// ---------------------------------------------------------------- сообщения
export interface RaidMemberInfo { name: string; cls: ClassId; level: number; role: RaidRole; bot?: boolean }
/** raid:muster — окно сбора у Вестника (сервер → клиент). */
export interface RaidMusterMsg {
  /** Идёт сбор. */
  open: boolean;
  /** Я в сборе. */
  joined: boolean;
  leader: string;
  /** Секунд до старта (0 — сбор не идёт). */
  leftSec: number;
  members: RaidMemberInfo[];
  /** Состав по ролям, который доберут боты, и сколько ботов будет. */
  need: Record<RaidRole, number>;
  bots: number;
  /** Мой откат добычи (мс, 0 — нет) и число побед. */
  lockoutMs: number;
  wins: number;
  /** Почему я не могу встать в рейд ("" — могу). */
  why: string;
  /** Рейд уже идёт (сбор закрыт до его конца). */
  running: boolean;
}
/** welcome в комнате рейда: boss — id юнита босса. */
export interface RaidWelcome { raid: true; members: RaidMemberInfo[]; attempts: number; enrageMs: number; boss: string }
/** raid:cast — полоса каста босса (ms 0 — скрыть). */
export interface RaidCastMsg { name: string; ms: number }
/** raid:banner — крупная надпись по центру экрана. */
export interface RaidBannerMsg { text: string; sub?: string; kind: "start" | "phase" | "enrage" | "win" | "wipe" | "berserk" | "attempt" }
/** raid:revive — кого поднимают: target — id юнита павшего (ms 0 — канал окончен/сорван). */
export interface RaidReviveMsg { target: string; by: string; ms: number }
export interface RaidPlayerResult extends RaidMemberInfo { damage: number; healing: number; deaths: number; revives: number }
/** raid:result — итоги рейда; loot — моя добыча (имена вещей). */
export interface RaidResultMsg {
  win: boolean;
  durationMs: number;
  attempt: number;
  players: RaidPlayerResult[];
  loot: Item[];
  /** Добыча не положена: откат или бот. */
  locked: boolean;
  title?: string;
  frame?: string;
}
