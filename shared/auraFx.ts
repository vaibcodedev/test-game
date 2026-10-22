/**
 * Обозначения бафов и дебафов на юните (задача 129): общий формат поля Unit.fx для сервера и клиента.
 * Строка, по символу на эффект: код = FX_BASE + индекс ключа + FX_STACK × стаки (до FX_MAX_STACKS). Индекс ключа — место в списке
 * баффов, общих, дебаффов и зон из data/aura-fx.json (сервер берёт его из таблицы, клиент — из client/public/assets/aura-fx/manifest.json,
 * который пишет tools/gen/aura-fx.ts). Символы идут по возрастанию индекса: один и тот же набор — всегда одна и та же строка, поэтому
 * Colyseus шлёт поле только при смене набора или стаков. Здесь нет ни таблицы, ни JSON: модуль лёгкий, клиент его не раздувает.
 */
export const FX_BASE = 32;
export const FX_STACK = 128;
export const FX_MAX_STACKS = 7;
/** Индексов ключей помещается столько (7 бит под индекс). */
export const FX_MAX_KEYS = FX_STACK;

/** Символ эффекта: индекс ключа и стаки (0 — стаков нет). */
export const fxChar = (idx: number, n = 0): string => String.fromCharCode(FX_BASE + idx + FX_STACK * Math.min(FX_MAX_STACKS, Math.max(0, n | 0)));
/** Индекс ключа по коду символа. */
export const fxIdx = (code: number): number => (code - FX_BASE) & (FX_STACK - 1);
/** Стаки по коду символа. */
export const fxN = (code: number): number => (code - FX_BASE) >> 7;
