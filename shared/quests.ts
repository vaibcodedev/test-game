/** Простые задания городов из /data/quests.json: убить N мобов или добыть N ресурсов. Прогресс — с момента принятия. */
import data from "../data/quests.json";
import { CITIES, type CityNpc } from "./cities";
import { SETTLEMENTS } from "./settlements";
import { questXp } from "./formulas";

export interface QuestDef {
  id: string;
  giver: string;
  name: string;
  kind: "kill" | "gather";
  target: string;
  n: number;
  level: number;
  text: string;
  done: string;
  reward: { gold: number; xp: number; item?: { base: string; qty: number } };
}
export const QUESTS: Record<string, QuestDef> = Object.fromEntries(
  // опыт задания — по уровню (questXp), число в данных — нижняя граница
  Object.entries(data.quests).map(([id, q]) => [id, { ...q, id, kind: q.kind as QuestDef["kind"], reward: { ...q.reward, xp: questXp(q.level, q.n, q.reward.xp) } } as QuestDef]),
);
export const QUEST_MAX_ACTIVE = data.max_active;
/** Выдающие NPC: заказчики столиц и поселений безопасных земель. */
export const QUEST_GIVERS: CityNpc[] = [...CITIES.filter((c) => c.quest).map((c) => c.quest!), ...SETTLEMENTS.filter((s) => s.quest).map((s) => s.quest!)];
/** Где живёт заказчик (город или поселение): подпись в окне заданий. */
export const giverPlace = (giver: string): string | undefined => CITIES.find((c) => c.quest?.id === giver)?.name ?? SETTLEMENTS.find((s) => s.quest?.id === giver)?.name;
export const questsOf = (giver: string) => Object.values(QUESTS).filter((q) => q.giver === giver);

/** Хранится в сохранении: активные (прогресс) и сданные. */
export interface QuestSave {
  active: Record<string, number>;
  done: string[];
}

/** Квестовые предметы: ресурсы из активных в игре заданий «добыть». Нельзя в банк/склад, торговцу и в обмен — иначе ломается счёт. */
const QUEST_ITEMS = new Set(Object.values(QUESTS).filter((q) => q.kind === "gather").map((q) => q.target));
export const isQuestItem = (base: string) => QUEST_ITEMS.has(base);
export const QUEST_ITEM_MSG = "Квестовый предмет нельзя положить в банк, продать или передать";
