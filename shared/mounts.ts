/** Маунты из /data/mounts.json: скорость, ярус, источник получения. Вид рисует tools/gen/mounts.ts (модель = id). */
import data from "../data/mounts.json";

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
/** Цвет яруса для рамок и подписей. */
export const TIER_COLOR: Record<MountTier, string> = { common: "#c8c8c8", uncommon: "#6adf6a", rare: "#5aa8ff", epic: "#c080ff", legendary: "#ffb030" };

/** Метаданные листа кадров (manifest.mounts): кадр, линия земли, высота парения, посадка таза всадника по [вид][кадр]. */
export interface MountMeta {
  frame: number;
  gy: number;
  fly: number;
  cols: number;
  seat: [number, number][][];
}
