/**
 * Мировые боссы (задача 151, docs/systems/bosses.md): данные data/world-bosses.json, слоты карты (data/world.json layout.bossSlots),
 * расписание и предвестники (trigger), сообщения сервер → клиент. Логика — server/src/worldboss/.
 */
import data from "../data/world-bosses.json";
import world from "../data/world.json";
import { TILE } from "./constants";

export type WbStage = "sleep" | "soon" | "alive" | "dead";
export type WbTier = "" | "bronze" | "silver" | "gold";
export const WB_TIERS: readonly Exclude<WbTier, "">[] = ["bronze", "silver", "gold"];

export interface WbTrigger {
  kind: "schedule" | "random";
  /** schedule: ЧЧ:ММ по серверу; появление — случайно в окне jitterMin после отметки. */
  times?: string[];
  jitterMin?: number;
  /** random: раз в everyH [от, до] часов; omens — предвестники за min минут (только зона, без точки). */
  everyH?: [number, number];
  omens?: { min: number; text: string }[];
}
export interface WbTierReward { marks: number; xpMul: number; items: { n: number; minRarity: number; ilvl: number }; ore: number; dust: number }
export interface WbChance { chance: number; pityStep: number; pityMax: number }
export interface WbMobNums { sprite: string; size: 1 | 2 | 4; hp: number; dmg: number; armor: number; xp: number; gold: number; speed: number; aggro: number; range: number; attackCd: number; radius: number; color: string }
export interface WbBossDef {
  id: string;
  name: string;
  lore: string;
  slot: string;
  pick: "alternate" | "random";
  level: number;
  trigger: WbTrigger;
  lifeMin: number;
  resetEmptySec: number;
  crowd: { step: number; hpPerStep: number; everyMs: number };
  mob: WbMobNums;
  mechanics: Record<string, Record<string, unknown> & { name?: string }>;
  rewards: {
    bronze: WbTierReward; silver: WbTierReward; gold: WbTierReward;
    factionMarksMul: number;
    heartChest: { heart: string; ore: number; dust: number } | null;
    legendary: WbChance; mount: WbChance; mounts: string[]; bagMs: number;
  };
  titles: { id: string; name: string; wins: number }[];
  heralds: Record<string, string>;
  chronicler: string;
  texts: Record<string, string>;
}
interface WbData {
  minLevel: number;
  clock: { announceMin: number[]; teleportMin: number; stateEveryMs: number; feedEveryMs: number };
  contrib: {
    dmg: number; heal: number; tank: number; bronze: number; bronzeActSec: number; silver: number; gold: number;
    capShare: number; afkMs: number; combatMs: number; pvpSteal: number; leaveZones: string[];
  };
  lockout: { dayResetHour: number };
  victory: { xpPct: number; hours: number };
  chronicle: { keep: number; top: number };
  frame: { id: string; name: string; gold: number };
  muster: { maxPlayers: number; squad: [number, number]; musterMs: number };
  bosses: Record<string, Omit<WbBossDef, "id">>;
}
const D = data as unknown as WbData;
export const WB = D;
export const WB_BOSSES: WbBossDef[] = Object.entries(D.bosses).filter(([k]) => !k.startsWith("_")).map(([id, b]) => ({ id, ...b }));
export const WB_BY_ID: Record<string, WbBossDef> = Object.fromEntries(WB_BOSSES.map((b) => [b.id, b]));

/** Id моба босса и его свиты (MOBS дополняет shared/mobs.ts). */
export const wbMobId = (boss: string) => `wb_${boss}`;
export const wbShardId = (boss: string) => `wb_${boss}_shard`;

// ---------------------------------------------------------------- слоты
export interface WbSlot { id: string; arena: number; level: number; points: { x: number; y: number }[] }
type RawSlot = { id: string; at: [number, number][]; arena: number; level: number };
const SLOTS = ((world.layout as unknown as { bossSlots?: RawSlot[] }).bossSlots ?? []);
/** Слот карты: точки появления (пиксели, центр клетки) и радиус арены (пиксели). */
export function wbSlot(id: string): WbSlot | null {
  const s = SLOTS.find((x) => x.id === id);
  if (!s) return null;
  return { id: s.id, arena: s.arena * TILE, level: s.level, points: s.at.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })) };
}

// ---------------------------------------------------------------- время
const MIN = 60000, H = 3600000;
/** Ключ «суток добычи» (сутки начинаются в dayResetHour по серверу). */
export function wbDayKey(ms: number): string {
  const d = new Date(ms - D.lockout.dayResetHour * H);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Детерминированный «случай» по числу (окно появления и интервалы предвестников не зависят от перезапуска сервера). */
function hash01(n: number): number {
  let x = Math.floor(n) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
/**
 * Ближайшее окно босса строго позже after: mark — объявленное время (от него считаются анонсы), at — настоящее появление.
 * schedule: отметки times каждый день, at = mark + случайно 0…jitterMin мин. random: от last через everyH (детерминированно по last).
 */
export function wbNextWindow(def: WbBossDef, after: number, last = after): { mark: number; at: number } {
  const t = def.trigger;
  if (t.kind === "random") {
    const [a, b] = t.everyH ?? [3, 6];
    const at = Math.max(after + MIN, last + (a + hash01(last / MIN + 7) * (b - a)) * H);
    return { mark: at, at };
  }
  const d0 = new Date(after);
  for (let k = 0; k < 3; k++) {
    const day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k);
    const marks = (t.times ?? []).map((s) => { const [h, mi] = s.split(":").map(Number); return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi).getTime(); }).sort((x, y) => x - y);
    for (const m of marks) if (m > after) return { mark: m, at: m + Math.floor(hash01(m / MIN) * (t.jitterMin ?? 0) * MIN) };
  }
  return { mark: after + 86400000, at: after + 86400000 };
}
/** Подстановка {ключ} в текст. */
export const wbText = (s: string | undefined, vars: Record<string, string | number> = {}) => (s ?? "").replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

// ---------------------------------------------------------------- сообщения
/** wboss — состояние босса (всем раз в stateEveryMs и при смене этапа; лёгкое, не через StateView). */
export interface WbStateMsg {
  id: string;
  name: string;
  st: WbStage;
  /** Объявленное время следующего окна (мс сервера) и часы сервера. */
  next: number;
  now: number;
  /** Где (пиксели) и радиус арены; при «скоро» у предвестников — только зона (x, y = 0). */
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  phase: number;
  stacks: number;
  /** Героев в круге по фракциям [Сольгард, Умбрат]. */
  n: [number, number];
  /** Убит/ушёл: когда. */
  endAt: number;
}
/** wboss:me — мой вклад (в бою, раз в секунду при изменении). */
export interface WbMeMsg { id: string; v: number; tier: WbTier; next: number; rank: number }
export interface WbTopRow { name: string; cls: string; faction: string; v: number }
/** Запись Летописи. */
export interface WbChronicleEntry {
  boss: string;
  name: string;
  at: number;
  durationMs: number;
  /** Фракция с большим вкладом ("" — поровну или никого). */
  win: string;
  totals: [number, number];
  heroes: number;
  top: { dmg: WbTopRow[]; heal: WbTopRow[]; tank: WbTopRow[] };
  /** Последний удар — только косметика. */
  last: string;
}
/** wboss:result — итог боя мне. */
export interface WbResultMsg {
  boss: string;
  win: string;
  me: { v: number; tier: WbTier; marks: number; xp: number; items: string[]; /** редкость каждой вещи из items (цвет имени в баннере) */ itemsR?: number[]; locked: boolean; titles: string[]; frame: string; trophy: string[] } | null;
  entry: WbChronicleEntry;
}
/** wboss:muster — мой сбор на мирового босса (сервер → клиент). */
export interface WbMusterMsg { boss: string; open: boolean; joined: boolean; leader: string; leftSec: number; members: { name: string; cls: string; level: number; role: string }[]; why: string; squad: string[] | null }
