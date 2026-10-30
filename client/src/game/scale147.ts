/**
 * Задача 147: масштаб мира под рост героя Б (30 px). Всё новое включается одним флагом data/hero-b.json → enabled
 * вместе с героем Б; замены листов — data/scale147.json → remap (листы <id>_b147, перерисованы генератором
 * tools/gen/scale147 в большем кадре, без setScale). Флаг выключен — листы _b147 не грузятся, спрайты прежние.
 */
import heroB from "../../../data/hero-b.json";
import sc from "../../../data/scale147.json";

export const HERO_B = !!heroB.enabled;
const REMAP = sc.remap as Record<string, string>;
/** Лист юнита с учётом масштаба героя Б. */
export const scaledSprite = (id: string): string => (HERO_B && REMAP[id]) || id;
/** Лист масштаба героя Б (раскладка мобов задачи 140, кадр больше 48). */
export const isScaledSheet = (id: string): boolean => id.endsWith(sc.suffix);
/** Не грузить лист: масштаб героя Б выключен. */
export const skipUnitSheet = (id: string): boolean => !HERO_B && isScaledSheet(id);
