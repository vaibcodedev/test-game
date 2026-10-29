/** Питомцы из /data/pets.json: характеристики, умения, прокачка, «Печать питомца» и Смотритель зверинца (задача 150). */
import data from "../data/pets.json";
import { petDmgGrowth } from "./balance";
import { xpToNext } from "./formulas";
import { cityById, type CityNpc } from "./cities";
import { TILE } from "./constants";

export type PetTier = "common" | "uncommon" | "rare" | "epic";
export interface PetSkill {
  id: string;
  name: string;
  type: "bleed" | "dot" | "strike" | "howl" | "guard" | "bolt" | "heal" | "renew" | "taunt" | "shell";
  cd: number;
  mult?: number;
  pct?: number;
  ms?: number;
  range?: number;
  /** dot: вид урона (яд, огонь). */
  kind?: "poison" | "fire";
  desc: string;
}
export interface PetDef {
  id: string;
  name: string;
  desc?: string;
  sprite: string;
  role?: string;
  tier?: PetTier;
  /** "" — любая фракция. */
  faction?: string;
  price: number;
  level: number;
  /** Условия покупки у смотрителя: порог репутации, списываемые Знаки Полей, побеждено боссов всего. */
  need?: { rep?: number; marks?: number; bosses?: number };
  hp: number;
  dmg: number;
  armor: number;
  speed: number;
  range: number;
  attackCd: number;
  radius: number;
  projectile?: string;
  skills: PetSkill[];
  /** Временный призыв умения (скелет чернокнижника): без опыта и перезарядки после гибели. */
  temp?: boolean;
}

export const PETS: Record<string, PetDef> = Object.fromEntries(Object.entries(data.pets).map(([id, p]) => [id, { ...(p as object), id } as PetDef]));
export const PET_IDS = Object.keys(PETS);
export const PET_CAST_MS = data.castMs;
export const PET_RESUMMON_MS = data.resummonMs;
export const PET_FOLLOW_DIST = data.followDist;
export const PET_TELEPORT_DIST = data.teleportDist;
export const PET_DROP_CHANCE = data.dropChance;
export const PET_TIERS = data.tiers as Record<PetTier, string>;
export const PET_ROLES = data.roles as Record<string, string>;
export const PET_SEAL = data.seal;
export const PET_MIGRATE = data.migrate as Record<string, string>;

const G = data.growth;
export const petStats = (def: Pick<PetDef, "hp" | "dmg" | "armor">, level: number) => ({
  maxHp: Math.round(def.hp * (G.hpBase + level * G.hpPerLevel)),
  // урон растёт вместе с HP мобов (data/balance.json pet): иначе на 100 уровне питомцы и призывы бьют в 10 раз слабее, чем на 10
  dmg: def.dmg * (G.dmgBase + level * G.dmgPerLevel) * petDmgGrowth(level),
  armor: Math.round(def.armor * level * G.armorPerLevel),
});
/** Опыт до следующего уровня питомца: доля опыта героя того же уровня (data leveling.xpOfHero). */
export const petXpToNext = (level: number) => Math.max(1, Math.round(data.leveling.xpOfHero * (xpToNext(level) || xpToNext(level - 1))));
/** Что даст следующий уровень (показ в окне и подсказке): прирост урона за удар, здоровья и брони. */
export function petNextGain(def: PetDef, level: number) {
  const a = petStats(def, level), b = petStats(def, level + 1);
  return { dmg: Math.round(b.dmg - a.dmg), hp: b.maxHp - a.maxHp, armor: b.armor - a.armor };
}
/** Призванный прислужник героя (скелет, демон, зверь): свой id на каждый вид — живут вместе с постоянным питомцем. */
export const sumUnitId = (ownerId: string, kind: string) => `sum_${ownerId}_${kind}`;
export const petUnitId = (ownerId: string) => `pet_${ownerId}`;

// ---------- «Печать питомца» (предмет сумки; базы — shared/items.ts) ----------
export const PSEAL_PREFIX = "pseal_";
export const petSealBase = (pet: string) => PSEAL_PREFIX + pet;
/** id питомца печати или null. */
export const sealPet = (base: string): string | null => (base.startsWith(PSEAL_PREFIX) && Object.hasOwn(PETS, base.slice(PSEAL_PREFIX.length)) ? base.slice(PSEAL_PREFIX.length) : null);
export const canKeepPet = (d: PetDef, faction: string | undefined) => !d.faction || d.faction === faction;

/**
 * Замена старых питомцев (Волчонок, Огонёк, Черепашка → data migrate) в сохранении: уровень и опыт переносятся,
 * выбранный питомец — тоже. Неизвестные id без замены убираются. true — сохранение изменено.
 */
export function migratePets(save: { pets?: Record<string, { level: number; xp: number }>; pet?: string }): boolean {
  const own = save.pets;
  if (!own) return false;
  let changed = false;
  for (const old of Object.keys(own)) {
    if (Object.hasOwn(PETS, old)) continue;
    const to = PET_MIGRATE[old];
    const rec = own[old];
    delete own[old];
    changed = true;
    if (to && PETS[to] && !own[to]) own[to] = { level: Math.max(1, rec.level | 0), xp: Math.max(0, rec.xp | 0) };
    if (save.pet === old) save.pet = to && own[to] ? to : "";
  }
  if (changed && (!save.pet || !own[save.pet])) save.pet = Object.keys(own)[0] ?? "";
  return changed;
}

// ---------- Смотритель зверинца ----------
export const PET_KEEPERS: (CityNpc & { greeting?: string })[] = Object.entries(data.keepers).flatMap(([city, n]) => {
  const c = cityById(city);
  if (!c) return [];
  const { at, ...rest } = n;
  return [{ ...rest, tint: Number(n.tint), x: (c.x + at[0]) * TILE + 16, y: (c.y + at[1]) * TILE + 16 }];
});

/** Что видно смотрителю о герое (SelfState на клиенте, Player.save на сервере). */
export interface KeeperState {
  level: number;
  faction?: string;
  gold: number;
  rep?: number;
  marks?: number;
  bossKills?: Record<string, number>;
  pets?: Record<string, unknown>;
  inventory: ({ base: string; qty?: number } | null)[];
}
export interface KeeperOffer {
  owned: boolean;
  sealInBag: boolean;
  canBuy: boolean;
  /** Чего не хватает (уровень, фракция, репутация, знаки, боссы, золото). */
  miss: string[];
}
export const bossesKilled = (s: { bossKills?: Record<string, number> }) => Object.values(s.bossKills ?? {}).reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
export function keeperOffer(d: PetDef, s: KeeperState): KeeperOffer {
  const owned = !!s.pets?.[d.id];
  const sealInBag = s.inventory.some((it) => !!it && it.base === petSealBase(d.id));
  const miss: string[] = [];
  if (!canKeepPet(d, s.faction)) miss.push("только для другой фракции");
  if (s.level < d.level) miss.push(`${d.level} уровень (у вас ${s.level})`);
  const n = d.need;
  if (n?.rep && (s.rep ?? 0) < n.rep) miss.push(`репутация ${s.rep ?? 0} / ${n.rep}`);
  if (n?.marks && (s.marks ?? 0) < n.marks) miss.push(`Знаки Полей ${s.marks ?? 0} / ${n.marks}`);
  if (n?.bosses && bossesKilled(s) < n.bosses) miss.push(`разных боссов побеждено ${bossesKilled(s)} / ${n.bosses}`);
  if (s.gold < d.price) miss.push(`золото ${s.gold} / ${d.price}`);
  return { owned, sealInBag, canBuy: d.price > 0 && !owned && !sealInBag && !miss.length, miss };
}
