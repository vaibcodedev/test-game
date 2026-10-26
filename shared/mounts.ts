/** Маунты из /data/mounts.json: скорость по ярусу, источник, печати, детали и сборка у конюшего (задачи 118, 142). Вид рисует tools/gen/mounts*. */
import data from "../data/mounts.json";
import { RARITY_COLORS } from "./items";

export type MountTier = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type MountSource = "start" | "vendor" | "rep" | "boss" | "raid" | "arena";

export interface MountDef {
  id: string;
  name: string;
  desc: string;
  tier: MountTier;
  /** "" — любая фракция */
  faction: string;
  flying: boolean;
  /** Множитель от PLAYER_SPEED: из data speeds по ярусу. */
  speed: number;
  level: number;
  price: number;
  grantLevel: number;
  source: MountSource;
  drop?: { minLevel: number; chance: number };
  raid?: string;
  dropChance?: number;
  arena?: { wins: number };
  /** Боевые в гербовой броне: порог репутации и списываемые Знаки Полей (золото — price). */
  rep?: { rep: number; marks: number };
  /** Сборка у конюшего: детали (id из PARTS → число) и золото. */
  craft?: { parts: Record<string, number>; gold: number; arenaRating?: number };
}
export interface MountPart { id: string; name: string; desc: string; icon: string; tier: MountTier; price: number; bound?: boolean; drop?: { minLevel: number; chance: number }; raid?: string; dropChance?: number }

export const MOUNT_SPEEDS = data.speeds as Record<MountTier, number>;
export const MOUNTS: Record<string, MountDef> = Object.fromEntries(Object.entries(data.mounts).map(([id, m]) => [id, { ...(m as object), id, speed: MOUNT_SPEEDS[(m as { tier: MountTier }).tier] } as MountDef]));
export const MOUNT_IDS = Object.keys(MOUNTS);
export const MOUNT_CAST_MS = data.castMs;
export const MOUNT_TIERS = data.tiers as Record<MountTier, string>;
export const MOUNT_SOURCES = data.sources as Record<MountSource, string>;
export const PARTS: Record<string, MountPart> = Object.fromEntries(Object.entries(data.parts).map(([id, p]) => [id, { ...(p as object), id } as MountPart]));
export const SEAL = data.seal;
export const MOUNT_EARN = data.earn;
export const MOUNT_CURRENCY = data.currency;
/** Печати гладиатора за бои арены (data arena). */
export const GLADIATOR = data.arena;
export const GLADIATOR_PART = "gladiator";
export const mountSprite = (id: string) => `mount_${id}`;
/** Цвет яруса для рамок и подписей: четыре яруса совпадают с RARITY_COLORS предметов,
 *  «необычный» есть только у маунтов — у него свой зелёный. */
export const TIER_COLOR: Record<MountTier, string> = {
  common:    RARITY_COLORS[0],
  uncommon:  "#6adf6a",
  rare:      RARITY_COLORS[1],
  epic:      RARITY_COLORS[2],
  legendary: RARITY_COLORS[3],
};

// ---------- печати и детали (предметы сумки; базы — shared/items.ts) ----------
export const SEAL_PREFIX = "mseal_";
export const PART_PREFIX = "mpart_";
export const sealBase = (mount: string) => SEAL_PREFIX + mount;
export const partBase = (part: string) => PART_PREFIX + part;
/** id маунта печати или null. */
export const sealMount = (base: string): string | null => (base.startsWith(SEAL_PREFIX) && Object.hasOwn(MOUNTS, base.slice(SEAL_PREFIX.length)) ? base.slice(SEAL_PREFIX.length) : null);
export const isPart = (base: string) => base.startsWith(PART_PREFIX) && Object.hasOwn(PARTS, base.slice(PART_PREFIX.length));
/** Печать привязана сразу: рейд и арена (data boundSources). */
export const sealBoundBySource = (d: MountDef) => (data.boundSources as string[]).includes(d.source);
/** Сборка из привязанных деталей даёт привязанную печать. */
export const craftBound = (d: MountDef) => !!d.craft && Object.keys(d.craft.parts).some((p) => PARTS[p]?.bound);
export const canRide = (d: MountDef, faction: string | undefined) => !d.faction || d.faction === faction;

/** Что видно конюшему о герое (SelfState на клиенте, Player.save на сервере). */
export interface StableState {
  level: number;
  faction?: string;
  gold: number;
  rep?: number;
  marks?: number;
  mounts?: string[];
  inventory: ({ base: string; qty?: number } | null)[];
  /** Лучший рейтинг арены за сезон (сервер — из базы, клиент — ответ stable:info). */
  arenaRating?: number;
}
export const countBase = (inv: StableState["inventory"], base: string) => inv.reduce((n, it) => n + (it && it.base === base ? it.qty ?? 1 : 0), 0);

/** Строка каталога конюшего: можно ли купить (vendor и rep) или собрать, и чего не хватает. */
export interface StableOffer {
  owned: boolean;
  /** Печать уже в сумке (не изучена). */
  sealInBag: boolean;
  buy: boolean;
  craft: boolean;
  canBuy: boolean;
  canCraft: boolean;
  /** Чего не хватает для покупки/получения (уровень, фракция, золото, репутация, знаки). */
  missBuy: string[];
  /** Чего не хватает для сборки (детали, золото, уровень). */
  missCraft: string[];
}
export function stableOffer(d: MountDef, s: StableState): StableOffer {
  const owned = !!s.mounts?.includes(d.id);
  const sealInBag = countBase(s.inventory, sealBase(d.id)) > 0;
  const buy = (d.source === "vendor" || d.source === "rep") && d.price > 0;
  const craft = !!d.craft;
  const common: string[] = [];
  if (!canRide(d, s.faction)) common.push("только для другой фракции");
  if (s.level < d.level) common.push(`${d.level} уровень (у вас ${s.level})`);
  const missBuy = [...common];
  if (buy) {
    if (d.rep && (s.rep ?? 0) < d.rep.rep) missBuy.push(`репутация ${s.rep ?? 0} / ${d.rep.rep}`);
    if (d.rep && (s.marks ?? 0) < d.rep.marks) missBuy.push(`Знаки Полей ${s.marks ?? 0} / ${d.rep.marks}`);
    if (s.gold < d.price) missBuy.push(`золото ${s.gold} / ${d.price}`);
  }
  const missCraft = [...common];
  if (d.craft) {
    for (const [p, n] of Object.entries(d.craft.parts)) {
      const have = countBase(s.inventory, partBase(p));
      if (have < n) missCraft.push(`${PARTS[p]?.name ?? p} ${have} / ${n}`);
    }
    if (d.craft.arenaRating && (s.arenaRating ?? 0) < d.craft.arenaRating) missCraft.push(`рейтинг арены ${s.arenaRating ?? 0} / ${d.craft.arenaRating}`);
    if (s.gold < d.craft.gold) missCraft.push(`золото ${s.gold} / ${d.craft.gold}`);
  }
  return { owned, sealInBag, buy, craft, canBuy: buy && !owned && !missBuy.length, canCraft: craft && !owned && !missCraft.length, missBuy, missCraft };
}

/** Печати гладиатора за бой: тип исхода, побед подряд (с этой), рейтинг после боя, бой с ботами. */
export function gladiatorSeals(result: "win" | "draw" | "loss", streak: number, rating: number, bot: boolean): number {
  const g = GLADIATOR;
  if (bot) return g.bot;
  if (result !== "win") return result === "draw" ? g.draw : g.loss;
  const streakBonus = Math.min(g.streak.max, Math.max(0, streak - 1) * g.streak.per);
  const ratingBonus = Math.max(0, ...(g.rating as [number, number][]).filter(([min]) => rating >= min).map(([, k]) => k));
  return g.win + streakBonus + ratingBonus;
}

// ---------- экономика (data economy, BALANCE.md «142 маунты») ----------
export const MOUNT_ECONOMY = data.economy;
/** Золото в час на уровне L: убийства × среднее золото моба (shared/formulas.ts: от L·g до 3L·g) × продажа добычи. */
export const goldPerHour = (L: number) => MOUNT_ECONOMY.killsPerHour * 2 * L * MOUNT_ECONOMY.mobGoldMul * MOUNT_ECONOMY.salesMul;
/** Средние печати гладиатора за бой (половина побед, серия 2, рейтинг без бонуса). */
const gladPerMatch = () => (gladiatorSeals("win", 2, 0, false) + gladiatorSeals("loss", 0, 0, false)) / 2;
/** Часов игры на своём уровне до маунта: { buy } — покупка (золото, репутация и знаки копятся параллельно), { craft } — детали с боссов
 *  или печати гладиатора плюс золото, { seal } — ожидание печати с боссов. null — путь не задан. */
export function mountHours(d: MountDef): { buy: number | null; craft: number | null; seal: number | null } {
  const E = MOUNT_ECONOMY, g = goldPerHour(d.level);
  const buy = (d.source === "vendor" || d.source === "rep") && d.price > 0
    ? Math.max(d.price / g, d.rep ? d.rep.rep / E.repPerHour : 0, d.rep ? d.rep.marks / E.marksPerHour : 0) : null;
  let craft: number | null = null;
  if (d.craft) {
    let parts = 0;
    for (const [id, n] of Object.entries(d.craft.parts)) {
      const pt = PARTS[id];
      const h = id === GLADIATOR_PART ? n / (gladPerMatch() * E.arenaPerHour) : pt?.drop ? n / (pt.drop.chance * E.bossKillsPerHour) : NaN;
      parts = Math.max(parts, h);
    }
    craft = Number.isNaN(parts) ? null : parts + d.craft.gold / g;
  }
  const seal = d.source === "boss" && d.drop ? 1 / (d.drop.chance * E.bossKillsPerHour) : null;
  return { buy, craft, seal };
}

/** Метаданные листа кадров (manifest.mounts): кадр, линия земли, высота парения, посадка таза всадника по [вид][кадр]. */
export interface MountMeta {
  frame: number;
  gy: number;
  fly: number;
  cols: number;
  seat: [number, number][][];
  /** Новый лист (задача 142, tools/gen/mounts/build.ts): кадров бега и покоя, видов (4: вниз, вверх, вправо, влево без отражения). */
  run?: number;
  idle?: number;
  views?: number;
  /** Модель (файл листа); у разных маунтов может быть одна. */
  sheet?: string;
  /** Гербовая модель: у всадника Умбрата — лист <sheet>_umbrath. */
  fac?: boolean;
}
/** Ключ текстуры маунта для фракции всадника. */
export const mountTex = (id: string, m: MountMeta, faction = ""): string => `m_${m.sheet ?? id}${m.fac && faction === "umbrath" ? "_umbrath" : ""}`;
