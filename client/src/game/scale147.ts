/**
 * Задача 147: масштаб мира под рост героя Б (30 px). Всё новое включается одним флагом data/hero-b.json → enabled
 * вместе с героем Б; замены листов — data/scale147.json → remap (листы <id>_b147, перерисованы генератором
 * tools/gen/scale147 в большем кадре, без setScale). Флаг выключен — листы _b147 не грузятся, спрайты прежние.
 */
import heroB from "../../../data/hero-b.json";
import sc from "../../../data/scale147.json";

/** Флаг; для снимков прогона без правки файла — VITE_HERO_B=1 (tools/scale147-shots.ts). */
export const HERO_B = !!heroB.enabled || import.meta.env?.VITE_HERO_B === "1";
const REMAP = sc.remap as Record<string, string>;
const AFPS = sc.afps as unknown as Record<string, number>;
/** Лист юнита с учётом масштаба героя Б. */
export const scaledSprite = (id: string): string => (HERO_B && REMAP[id]) || id;
/** Лист масштаба героя Б (раскладка мобов задачи 140, кадр больше 48). */
export const isScaledSheet = (id: string): boolean => id.endsWith(sc.suffix);
/** Не грузить лист (и его маску свечения _glow): масштаб героя Б выключен. */
export const skipUnitSheet = (id: string): boolean => !HERO_B && (isScaledSheet(id) || id.endsWith(sc.suffix + "_glow"));
/** К/с атаки листа _b147 (12 кадров за прежнее время удара; tools/gen/scale147/meta.ts), иначе undefined. */
export const scaledAttackFps = (id: string): number | undefined => (isScaledSheet(id) && typeof AFPS[id] === "number" ? AFPS[id] : undefined);
/** Ник над листом _b147 кадра 40: от ступней, как у героя Б. */
export const SCALED_NAME_RISE = sc.nameRise.frame40;
