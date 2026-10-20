/** Маунты из /data/mounts.json: скорость, ярус, источник получения. Вид рисует tools/gen/mounts.ts (модель = id). */
import data from "../data/mounts.json";
import { RARITY_COLORS } from "./items";

export type MountTier = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type MountSource = "start" | "vendor" | "boss" | "raid" | "arena";

export interface MountDef {
  id: string;
  name: string;
  desc: string;
  tier: MountTier;
  /** "" — любая фракция */
  faction: string;
  flying: boolean;
  speed: number;
  level: number;
  price: number;
  grantLevel: number;
  source: MountSource;
  drop?: { minLevel: number; chance: number };
  raid?: string;
  dropChance?: number;
  arena?: { wins: number };
}

export const MOUNTS: Record<string, MountDef> = Object.fromEntries(Object.entries(data.mounts).map(([id, m]) => [id, { ...(m as object), id } as MountDef]));
export const MOUNT_IDS = Object.keys(MOUNTS);
export const MOUNT_CAST_MS = data.castMs;
export const MOUNT_COMBAT_LOCK_MS = data.combatLockMs;
export const MOUNT_TIERS = data.tiers as Record<MountTier, string>;
export const MOUNT_SOURCES = data.sources as Record<MountSource, string>;
export const mountSprite = (id: string) => `mount_${id}`;
/** Цвет яруса для рамок и подписей. Синхронизован с RARITY_COLORS из items.ts. */
export const TIER_COLOR: Record<MountTier, string> = {
  common:    RARITY_COLORS[0], // #e8e2d0
  // TODO: uncommon не входит в RARITY_COLORS предметов — использовать rare до введения отдельного яруса
  uncommon:  RARITY_COLORS[1], // временно = rare (#5fa8ff); ранее "#6adf6a"
  rare:      RARITY_COLORS[1], // #5fa8ff
  epic:      RARITY_COLORS[2], // #c47bff
  legendary: RARITY_COLORS[3], // #ff9a2e
};

/** Метаданные листа кадров (manifest.mounts): кадр, линия земли, высота парения, посадка таза всадника по [вид][кадр]. */
export interface MountMeta {
  frame: number;
  gy: number;
  fly: number;
  cols: number;
  seat: [number, number][][];
}
