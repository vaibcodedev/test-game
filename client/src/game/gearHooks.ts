/**
 * Связь окон «Герой» и «Осмотр» с отрисовкой героя (docs/gear-visuals.md, 2.4 и раздел 3).
 * Интерфейс только пишет сюда и слушает; GearLayers (шаг 5) подписывается на мигание и заполняет список скрытых источников.
 */
import { GEAR_FX } from "../../../shared/gearFx";
import type { Slot } from "../../../shared/items";

/** Почему у вещи с источником частиц (+10 или легендарка) частицы не показаны: лимит героев/источников или настройка. */
export type HiddenReason = "limit" | "setting";

const hidden = new Map<string, Partial<Record<Slot, HiddenReason>>>();
/** GearLayers: сообщает, какие источники частиц героя sid сейчас скрыты. null или пустой объект — все показаны. */
export function setHiddenParticles(sid: string, slots: Partial<Record<Slot, HiddenReason>> | null) {
  if (slots && Object.keys(slots).length) hidden.set(sid, slots);
  else hidden.delete(sid);
}
/** Окна: скрытые источники частиц героя sid, по слотам. */
export const hiddenParticles = (sid: string): Partial<Record<Slot, HiddenReason>> => hidden.get(sid) ?? {};

/** Подсветка детали: белый контур на ms миллисекунд (цвет и длительность — GEAR_FX.enchant.hoverFlashColor / hoverFlashMs). */
export type GearFlash = (sid: string, slot: Slot, ms: number, color: string) => void;
const flashers = new Set<GearFlash>();
/** GearLayers: подписка на подсветку детали при наведении на строку окна. Возвращает отписку. */
export function onGearFlash(fn: GearFlash): () => void {
  flashers.add(fn);
  return () => void flashers.delete(fn);
}
/** Окно «Герой»: мигнуть деталью slot у героя sid (своего). */
export function flashGear(sid: string, slot: Slot) {
  for (const fn of flashers) fn(sid, slot, GEAR_FX.enchant.hoverFlashMs, GEAR_FX.enchant.hoverFlashColor);
}
