/** Общие для всех комнат сервисы и учёт игроков, которые сейчас на арене. */
import type { GameDB } from "../db";
import type { ArenaStore } from "./store";

export const services = {} as { db: GameDB; arena: ArenaStore };

/** Ключи имён игроков, отправленных на арену (пока они там, войти этим героем в мир нельзя). */
export const inArena = new Set<string>();

/** Длительность боя; в тестах можно сократить переменной ARENA_MATCH_MS. */
export const matchMs = (def: number) => Number(process.env.ARENA_MATCH_MS) || def;

/** Ключи имён героев в рейде (задача 114): пока они там, войти этим героем в мир нельзя; число идущих рейдов. */
export const inRaid = new Set<string>();
export const raids = { running: 0 };
/** Ключи имён героев в подземелье «Пепельные чертоги»: пока они там, войти этим героем в мир нельзя (второй копии героя быть не может). */
export const inDungeon = new Set<string>();
/** Объявление в чат мира (рейд → WorldRoom). */
export const worldNews = { system: (_text: string) => {} };
