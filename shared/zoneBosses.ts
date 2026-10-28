/**
 * Боссы стартовых земель (задача 136): карточки data/zone-bosses.json, места — data/world.json layout.zoneBosses,
 * добыча — data/zone-boss-loot.json. Здесь только чтение данных: мобы — shared/mobs.ts, места арен — shared/map.ts,
 * умения — server/src/game/zoneBosses.ts, вид — client/src/game/zoneBoss.ts.
 */
import data from "../data/zone-bosses.json";
import loot from "../data/zone-boss-loot.json";
import ring from "../data/ring-bosses.json";
import ringLoot from "../data/ring-boss-loot.json";

export type ZbShape = "circle" | "ring" | "cone";
export type ZbAt = "self" | "tank" | "random" | "far" | "all" | "path" | "spots" | "scatter" | "hunt" | "same";
/** Волна умения (поля — abilityDoc в data/zone-bosses.json). */
export interface ZbWave {
  tele: ZbShape;
  at: ZbAt;
  r: number;
  r2?: number;
  arc?: number;
  dirs?: number[];
  count?: number;
  to?: "far";
  step?: number;
  stepMs?: number;
  spots?: [number, number][];
  spread?: number;
  turn?: number;
  windupMs: number;
  dmgPct: number;
  k?: string;
  after?: { rootMs?: number; burnMs?: number; poisonMs?: number; hazardMs?: number; hazardPct?: number; leap?: boolean; dash?: boolean; pull?: number; pullMark?: number; push?: number };
  escape?: number;
  /** Кольцо (задача 139): урон делится поровну на всех героев в круге. */
  share?: boolean;
  /** Кольцо: прерываемый каст на всю арену (data/ring-bosses.json _doc). heal — если не сорвали, босс лечится на эту долю здоровья (котёл), pillars тогда не используется: один объект-котёл рядом с боссом. */
  break?: { pct: number; stunMs: number; heroStunMs: number; pillars?: number; heal?: number };
  /** Кольцо: клетка вокруг героя с кандальным колом в центре (моб <босс>_cage): пока кол стоит, босс получает урон ×shield;
   *  через holdMs клетка с целым колом бьёт внутрь (dmgPct). hp — множитель здоровья кола к мобу уровня босса. */
  cage?: { holdMs: number; hp: number; shield: number };
  /** Кольцо: мираж-двойники (моб <босс>_mirage, один удар): count штук по краю арены на holdMs; каждый повторяет умение mirror (у него mirror: true) со своего места. */
  doubles?: { count: number; hp: number; holdMs: number; mirror: string; name?: string };
  /** Умение повторяют двойники босса (кольцо «Песчаный смерч»). */
  mirror?: boolean;
  /** Кольцо: подкоп — босс уходит под песок: invulnMs неуязвим (урон по нему 0), затем выныривает по after.leap в центре метки. */
  burrow?: { invulnMs: number };
  /** Кольцо: рой — count приспешников (моб <босс>_swarm по образцу mob, здоровье — hp× от него, без добычи) у босса. */
  swarm?: { mob: string; count: number; hp: number };
  /** Кольцо: укрытия — count столбов радиуса r на арене; в миг удара урон получают только те, кто стоит вне всех столбов. */
  safe?: { count: number; r: number };
}
export interface ZbAbility extends ZbWave {
  id: string;
  name: string;
  every: number;
  then?: ZbWave[];
  /** Кольцо: с какой фазы (0 — с начала боя). */
  phase?: number;
}
/** Фаза босса кольца: порог здоровья, включаемые умения, ускорение прежних, пауза и реплика. */
export interface ZbPhase { at: number; abilities: string[]; everyMul?: number; pauseMs?: number; yell?: string[] }
export interface ZbCard {
  id: string;
  faction: "solgard" | "umbrath";
  location: string;
  levels: { band: [number, number]; boss: number };
  name: string;
  title: string;
  respawnMs: number;
  lore: string;
  gimmick: string;
  abilities: ZbAbility[];
  lines: { spawn: string[]; abilities: Record<string, string[]>; lowHp: string[]; death: string[]; kill: string[]; break?: string[] };
  /** Кольцо (задача 139): фазы, кадр листа, свои множители моба. */
  phases?: ZbPhase[];
  frame?: number;
  mob?: Partial<ZbMob>;
  /** Босс кольца (data/ring-bosses.json), а не стартовых земель. */
  ring?: boolean;
}
/** Числа моба босса (множители к мобу своего уровня, как в shared/mobs.ts): data/zone-bosses.json mob. */
export interface ZbMob { hp: number; dmg: number; armor: number; xp: number; gold: number; speed: number; aggro: number; range: number; attackCd: number; radius: number; color: Record<string, string> }

const D = data as unknown as { lowHpAt: number; dodgeModel: { arenaR: number }; mob?: ZbMob; bosses: ZbCard[] };
/** Боссы кольца 40–80 (задача 139): тот же формат карточек и тот же ИИ (server/src/game/zoneBosses.ts). */
export const RING_CARDS: ZbCard[] = (ring as unknown as { bosses: ZbCard[] }).bosses.map((c) => ({ ...c, ring: true }));
export const ZB_CARDS: ZbCard[] = [...D.bosses, ...RING_CARDS];
export const ZB_BY_ID: Record<string, ZbCard> = Object.fromEntries(ZB_CARDS.map((b) => [b.id, b]));
export const ZB_LOW_HP = D.lowHpAt;
/** Радиус арены (px мира): формы умений вокруг босса в него влезают (dodgeModel.arenaR). */
export const ZB_ARENA = D.dodgeModel.arenaR;
export const ZB_MOB: ZbMob | undefined = D.mob;

/** Таблица добычи босса (data/zone-boss-loot.json bosses). */
export interface ZbLootTable {
  name: string;
  level: number;
  band: [number, number];
  special: { item: string; chance: number }[];
  gold: { mult: number };
  loot: { items: number; epic: number };
  potion: { id: string; chance: number; qty: [number, number] };
  mats: { id: string; chance: number; qty: [number, number] }[];
  legendary: number;
  pet: number;
}
/** Особая вещь (формат UNIQUES, data/zone-boss-loot.json items). */
export interface ZbItemSpec { id: string; name: string; base: string; ilvl: number; rarity: number; stats: Record<string, number>; lore: string; prop: string; boss: string }
export const ZB_LOOT: Record<string, ZbLootTable> = { ...(loot as unknown as { bosses: Record<string, ZbLootTable> }).bosses, ...(ringLoot as unknown as { bosses: Record<string, ZbLootTable> }).bosses };
export const ZB_ITEMS: Record<string, ZbItemSpec> = { ...(loot as unknown as { items: Record<string, ZbItemSpec> }).items, ...(ringLoot as unknown as { items: Record<string, ZbItemSpec> }).items };
