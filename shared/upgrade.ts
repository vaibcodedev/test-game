/** Улучшение предметов +1…+15 (+11…+15 — рискованные, владелец 2026-10-31): таблицы из /data/upgrade.json, кузнец Гром в Эмберхолле и кузнецы столиц (/data/cities.json). */
import data from "../data/upgrade.json";
import { CITIES, type CityNpc } from "./cities";
import { TILE } from "./constants";
import { TOWN } from "./map";

export interface UpgradeStep {
  gold: number;
  ore: number;
  dust: number;
  chance: number;
}
export const MAX_PLUS = data.levels.length;
export const UPGRADE_LEVELS: UpgradeStep[] = data.levels;
export const PLUS_BONUS = data.bonusPerLevel;
/** Заточка «максимальной экипировки» ботов арены и симулятора — эталон баланса (+10), не растёт вместе с MAX_PLUS. */
export const REF_PLUS: number = data.refPlus;
/** Материалы: id предмета -> описание. */
export const MATERIALS: Record<string, { id: string; name: string; price: number; dropPct: number; icon: string }> = Object.fromEntries(
  Object.entries(data.materials).map(([id, m]) => [id, { id, name: m.name, price: m.price, dropPct: m.dropPct, icon: `mat_${id}` }]),
);
export const MATERIAL_IDS = Object.keys(MATERIALS);
/** Условие шага: что нужно, чтобы перейти с уровня plus на plus+1. */
export const stepFor = (plus: number): UpgradeStep | undefined => UPGRADE_LEVELS[plus];
/** Неудача на +0…+(SAFE_BELOW−1) уровень не снимает (владелец 2026-11-02: до +8 без потерь). */
export const SAFE_BELOW: number = data.safeBelow;
/** Куда падает уровень при неудаче: ниже SAFE_BELOW — остаётся, выше — минус 1 (с +8 на +7, не ниже). */
export const failLevel = (plus: number) => (plus < SAFE_BELOW ? plus : Math.max(SAFE_BELOW - 1, plus - 1));

export const SMITH = {
  id: "smith",
  name: data.smith.name,
  sprite: data.smith.sprite,
  tint: Number(data.smith.tint),
  color: data.smith.color,
  greeting: data.smith.greeting,
  // во дворе кузницы, у наковальни
  x: (TOWN.x + 18) * TILE + 16,
  y: (TOWN.y - 2) * TILE + 16,
};
/** Все кузнецы: Гром в Эмберхолле и кузнецы обеих столиц (решение 2 задачи 132). Сервер точит и продаёт материалы у любого из них. */
export const SMITHS: CityNpc[] = [SMITH, ...CITIES.filter((c) => c.smith).map((c) => c.smith!)];
