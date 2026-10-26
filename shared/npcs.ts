/**
 * NPC мира одним списком (задача 132, шаг 3): клиент расставляет их по данным, а не вручную. Тот же список — у тестов (досягаемость).
 * Торговцы, повара, банкиры, кузнецы и сумочники собираются из своих модулей (там же их ищет сервер для проверки дальности);
 * Эмберхолл — town.ts и /data/townfolk.json, города и столицы — cities.ts, поселения — settlements.ts.
 */
import townfolk from "../data/townfolk.json";
import { ARENA_NPC } from "./arena";
import { BAGMEN } from "./bags";
import { BANKERS } from "./bank";
import { cityAtTile, CITIES } from "./cities";
import { TILE } from "./constants";
import { FACTIONS, type FactionId } from "./factions";
import { COOKS } from "./food";
import { MARKET_MERCHANT } from "./map";
import { QUEST_GIVERS } from "./quests";
import { RAID, RAID_HERALDS } from "./raid";
import { RUMOR_NPCS } from "./rumors";
import { settlementAt, SETTLEMENTS } from "./settlements";
import { SMITHS } from "./upgrade";
import { STABLEMASTERS } from "./stables";

/** Что делает NPC по нажатию (окно на клиенте): торговля, арена, еда, заточка, банк, сумки, слухи, рейд, задания, конюшня. */
export type WorldNpcKind = "shop" | "arena" | "cook" | "smith" | "bank" | "bags" | "rumor" | "raid" | "quest" | "stable";
export interface WorldNpc {
  kind: WorldNpcKind;
  id: string;
  name: string;
  sprite: string;
  tint?: number;
  color: string;
  /** Пиксели: точка у ног. */
  x: number;
  y: number;
}

type Npc = { id: string; name: string; sprite: string; tint?: number; color: string; x: number; y: number };
const as = (kind: WorldNpcKind) => (n: Npc): WorldNpc => ({ kind, id: n.id, name: n.name, sprite: n.sprite, tint: n.tint || undefined, color: n.color, x: n.x, y: n.y });

export const WORLD_NPCS: WorldNpc[] = [
  as("shop")({ ...townfolk.merchant, ...MARKET_MERCHANT }),
  ...CITIES.filter((c) => c.merchant).map((c) => as("shop")(c.merchant!)),
  ...SETTLEMENTS.map((s) => as("shop")(s.merchant)),
  as("arena")({ ...townfolk.arena, ...ARENA_NPC }),
  ...COOKS.map(as("cook")),
  ...SMITHS.map(as("smith")),
  ...BANKERS.map(as("bank")),
  ...BAGMEN.map(as("bags")),
  ...RUMOR_NPCS.map(as("rumor")),
  ...RAID_HERALDS.map((h) => as("raid")({ ...h, sprite: RAID.npc.sprite, color: RAID.npc.color, tint: Number(RAID.npc.tint) })),
  ...QUEST_GIVERS.map(as("quest")),
  ...STABLEMASTERS.map(as("stable")),
];

// ---------- фракция NPC (решение пользователя: чужим не служат) ----------

/** Фракция NPC по месту (пиксели): столица/форт — capital, поселение — его фракция; Эмберхолл и дикие земли — null (служат всем). */
export function npcFaction(x: number, y: number): FactionId | null {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const c = cityAtTile(tx, ty);
  if (c) return (c.capital as FactionId | undefined) ?? null;
  return (settlementAt(tx, ty)?.faction as FactionId | undefined) ?? null;
}
const VERB: Record<WorldNpcKind, string> = {
  shop: "не торгует с врагами", stable: "не торгует с врагами", cook: "не торгует с врагами", bank: "не торгует с врагами", bags: "не торгует с врагами",
  smith: "не работает на врагов", quest: "не даёт заданий врагам", rumor: "не говорит с врагами", raid: "не собирает в поход врагов", arena: "не служит врагам",
};
/** Текст отказа: «Казначей Лукиан не торгует с врагами Сольгарда». */
export function npcRefusalText(n: { kind: WorldNpcKind; name: string; x: number; y: number }, f: FactionId): string {
  return `${n.name} ${VERB[n.kind]} ${FACTIONS[f]?.name ?? f}а`;
}
/** Отказ NPC герою чужой фракции, или null — служит (свой, нейтральный, без фракции у героя). */
export function npcRefusal(n: { kind: WorldNpcKind; name: string; x: number; y: number }, heroFaction: string | undefined): string | null {
  const f = npcFaction(n.x, n.y);
  if (!f || !heroFaction || f === heroFaction) return null;
  return npcRefusalText(n, f);
}
/**
 * Сервер: рядом (≤ range) есть NPC вида kind, но все ближние — чужой фракции → текст отказа; иначе null (дальность проверяет вызывающий).
 */
export function serviceRefusal(kind: WorldNpcKind, x: number, y: number, heroFaction: string | undefined, range: number): string | null {
  let refusal: string | null = null;
  for (const n of WORLD_NPCS) {
    if (n.kind !== kind || Math.hypot(n.x - x, n.y - y) > range) continue;
    const r = npcRefusal(n, heroFaction);
    if (!r) return null;
    refusal ??= r;
  }
  return refusal;
}
