/**
 * NPC мира одним списком (задача 132, шаг 3): клиент расставляет их по данным, а не вручную. Тот же список — у тестов (досягаемость).
 * Торговцы, повара, банкиры, кузнецы и сумочники собираются из своих модулей (там же их ищет сервер для проверки дальности);
 * Эмберхолл — town.ts и /data/townfolk.json, города и столицы — cities.ts, поселения — settlements.ts.
 */
import townfolk from "../data/townfolk.json";
import { ARENA_NPC } from "./arena";
import { BAGMEN } from "./bags";
import { BANKERS } from "./bank";
import { CITIES } from "./cities";
import { COOKS } from "./food";
import { MARKET_MERCHANT } from "./map";
import { QUEST_GIVERS } from "./quests";
import { RAID, RAID_HERALDS } from "./raid";
import { RUMOR_NPCS } from "./rumors";
import { SETTLEMENTS } from "./settlements";
import { SMITHS } from "./upgrade";

/** Что делает NPC по нажатию (окно на клиенте): торговля, арена, еда, заточка, банк, сумки, слухи, рейд, задания. */
export type WorldNpcKind = "shop" | "arena" | "cook" | "smith" | "bank" | "bags" | "rumor" | "raid" | "quest";
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
];
