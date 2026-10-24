/**
 * Снаряжение и геральдика бойцов фракций (задача 132, шаг 8; data/npc-gear.json). Сервер выбирает набор по рангу и шлёт его строками
 * в формате Player.recalc (plus = 0) и геральдикой u.herald; клиент рисует бойца, как героя (GearLayers), с гербами фракции.
 */
import NG from "../data/npc-gear.json";
import { ITEM_MODELS } from "./items";
import { LEGENDARIES } from "./legendary";

export type NpcTier = "weak" | "mid" | "strong" | "mega";
export type Tabard = "wide" | "narrow" | "none";
export interface NpcSet {
  title: string; cls: string; tabard: Tabard; arms?: boolean; r?: number;
  helm?: string; armor?: string; boots?: string; off?: string; cloak?: string; weapon?: string;
}
export interface Heraldry {
  emblem: { pal: Record<string, string>; e6: string[]; e4: string[]; out: string };
  cloth: { f: string; fs: string; t: string; td: string; belt: string; buckle: string; shield: string; hem: "swallow" | "coffin" | "fringe" };
  banner: { flag: string; edge: string; pole: [string, string]; metal: string; legend: string };
  badge: { field: string; mark: string };
  torch: { flame: string; core: string; glow: string };
}
/** Геральдика на бойце (GearInput.herald): фракция гербов, табард, герб на спине плаща, знаменосец. */
export interface Herald { fac: string; tabard: Tabard; arms: boolean; banner: boolean; H: Heraldry }

export const NPC_GEAR = NG as unknown as {
  tiers: { patrol: NpcTier; settlement: NpcTier; bridge: NpcTier; fort: NpcTier; capitalRanks: NpcTier[]; champion: NpcTier };
  championTitle: Record<string, string>;
  sets: Record<string, Record<NpcTier, { melee: NpcSet[]; ranged: NpcSet[] }>>;
  heraldry: Record<string, Heraldry>;
};
export const HERALDRY = NPC_GEAR.heraldry;

/** Деталь строки снаряжения (формат Player.recalc, plus = 0): модель каталога или L:<легендарка> (редкость 3). */
function piece(id: string | undefined, r: number): string {
  if (!id) return "";
  if (id.startsWith("L:")) {
    const L = LEGENDARIES[id.slice(2)];
    if (!L) throw new Error(`npc-gear: нет легендарки ${id}`);
    return `3:0:${L.id}::${L.base}:`;
  }
  const m = ITEM_MODELS[id];
  if (!m) throw new Error(`npc-gear: нет модели ${id}`);
  return `${r}:0:::${m.cat}:${id}`;
}

/** Строки u.gear, u.weapon и u.herald набора: herald — табард (w | n | -), затем флаги a (герб на плаще) и b (знаменосец). */
export function npcGearStrings(s: NpcSet, bannerman = false): { gear: string; weapon: string; herald: string } {
  const r = s.r ?? 0;
  const gear = [s.helm, s.armor, s.boots, s.off, s.cloak].map((id) => piece(id, r)).join("|");
  let weapon = "";
  if (s.weapon) {
    const m = ITEM_MODELS[s.weapon];
    if (!m) throw new Error(`npc-gear: нет оружия ${s.weapon}`);
    weapon = `${m.cat}:${r}:0::${s.weapon}`;
  }
  const herald = (s.tabard === "wide" ? "w" : s.tabard === "narrow" ? "n" : "-") + (s.arms ? "a" : "") + (bannerman ? "b" : "");
  return { gear, weapon, herald };
}

/** Разбор u.herald бойца фракции fac; "" или неизвестная фракция — без геральдики. */
export function parseHerald(fac: string, s: string | undefined): Herald | null {
  const H = HERALDRY[fac];
  if (!s || !H) return null;
  return { fac, tabard: s[0] === "w" ? "wide" : s[0] === "n" ? "narrow" : "none", arms: s.includes("a"), banner: s.includes("b"), H };
}
