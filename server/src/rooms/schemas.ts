/**
 * Схемы входящих сообщений (zod): проверка в общем makeOn (common.ts) до обработчика. Невалидное — отказ, счётчик и запись в журнал
 * подозрительного (anticheat.ts). Схема проверяет только форму: типы, длины строк, лишние поля (strict); диапазоны и правила игры —
 * в обработчиках, как раньше. Новое сообщение без схемы работает (с предупреждением в лог при регистрации) — добавьте схему сюда.
 */
import { z } from "zod";
import { CHAT_MAX_LEN } from "../../../shared/constants";

/** id сущности, предмета, умения, NPC: короткая строка. */
const id = z.string().max(64);
/** конечное число (NaN и ±∞ — отказ); диапазон режет обработчик */
const num = z.number();
/** индекс ячейки, вкладки, слота */
const int = z.number().int();
const bool = z.boolean();
const opt = <T extends z.ZodType>(t: T) => t.nullish();
const empty = z.strictObject({});
const msg = <S extends z.ZodRawShape>(shape: S) => z.strictObject(shape);

/** Админ-команды: права проверяются в обработчике; форма — плоский объект простых значений (поля форм бывают NaN). */
const admin = z.record(z.string().max(16), z.union([z.string().max(500), z.number(), z.nan(), z.boolean(), z.null()]));
/** Отладка (только TEST_MODE): op и плоские значения. */
const dbg = z.looseObject({ op: z.string().max(32) });
/** Плоский объект простых значений (для сообщений, где обработчик сам объясняет отказ). */
const flat = z.record(z.string().max(16), z.union([z.string().max(200), z.number(), z.nan(), z.boolean(), z.null()]));

const barPos = z.strictObject({ bar: int, i: int });
const barRef = z.union([z.null(), z.strictObject({ s: id }), z.strictObject({ i: id }), z.strictObject({ a: id })]);

export const SCHEMAS: Record<string, z.ZodType> = {
  // движение и бой (common.ts)
  input: msg({ mx: num, my: num }),
  moveTo: msg({ x: num, y: num }),
  target: msg({ id: opt(id) }),
  attack: msg({ id: opt(id) }),
  follow: msg({ id: opt(id) }),
  chase: msg({ on: bool }),
  skill: msg({ id, x: opt(num), y: opt(num), target: opt(id), q: opt(num), ap: opt(bool), a: opt(num), dx: opt(num), dy: opt(num) }),
  cancel: empty,
  "bars:set": msg({ bar: int, i: int, ref: opt(barRef) }),
  "bars:swap": msg({ a: barPos, b: barPos }),
  "mount:toggle": empty,
  chat: msg({ text: z.string().max(CHAT_MAX_LEN * 4) }),
  // предметы
  pickup: msg({ bag: id }),
  use: msg({ index: int }),
  "use:base": msg({ base: id }),
  equip: msg({ index: int }),
  unequip: msg({ slot: id }),
  swap: msg({ a: int, b: int }),
  sell: msg({ index: int }),
  // выброс и уничтожение (inventory.ts drop): значения проверяет обработчик и отвечает тостом — здесь только плоский объект
  drop: flat,
  destroy: flat,
  "market:get": empty,
  buy: msg({ base: id, qty: opt(num) }),
  "cook:buy": msg({ id, qty: opt(num) }),
  "smith:buy": msg({ id, qty: opt(num) }),
  "smith:upgrade": msg({ index: opt(int), slot: opt(id) }),
  "tm:extract": msg({ index: int }),
  "tm:apply": msg({ shell: int, index: opt(int), slot: opt(id) }),
  "tm:reset": msg({ index: opt(int), slot: opt(id) }),
  "bag:expand": empty,
  // банк
  "bank:open": empty,
  "bank:put": msg({ index: int, tab: opt(int), slot: opt(int) }),
  "bank:take": msg({ tab: int, slot: int, index: opt(int) }),
  "bank:move": msg({ tab: int, slot: int, toTab: int, toSlot: int }),
  "bank:gold": msg({ v: num }),
  "bank:buy": empty,
  // обмен
  "trade:request": msg({ id }),
  "trade:respond": msg({ accept: bool }),
  "trade:add": msg({ index: int, slot: opt(int) }),
  "trade:remove": msg({ slot: int }),
  "trade:gold": msg({ v: num }),
  "trade:ready": empty,
  "trade:confirm": empty,
  "trade:cancel": empty,
  // герой
  alloc: msg({ stat: z.string().max(16), n: opt(num) }),
  learn: msg({ id }),
  inspect: msg({ sid: id }),
  respawn: empty,
  "logout:request": empty,
  "logout:cancel": empty,
  // маунты и питомцы
  "mount:select": msg({ id: opt(id) }),
  "mount:buy": msg({ id }),
  "pet:toggle": empty,
  "pet:select": msg({ id: opt(id) }),
  "pet:buy": msg({ id }),
  "stable:buy": msg({ id }),
  "stable:craft": msg({ id }),
  "stable:open": empty,
  // мир: NPC, города, двери, события
  rumor: msg({ npc: id }),
  gather: msg({ id }),
  door: msg({ id }),
  "tp:go": msg({ id }),
  "quest:accept": msg({ id }),
  "quest:turn": msg({ id }),
  "enc:talk": msg({ id }),
  "enc:act": msg({ id, opt: id }),
  "enc:buy": msg({ id, idx: int }),
  "dungeon:enter": empty,
  "dungeon:leave": empty,
  "war:tp": empty,
  "siege:tp": empty,
  // арена, группа, рейд, мировой босс
  "arena:info": empty,
  "arena:queue": msg({ mode: id }),
  "arena:cancel": empty,
  "arena:accept": empty,
  "arena:decline": empty,
  "arena:top": msg({ mode: id }),
  "arena:history": empty,
  "arena:title": msg({ name: opt(z.string().max(64)) }),
  "party:invite": msg({ name: z.string().max(64) }),
  "party:respond": msg({ accept: bool }),
  "party:leave": empty,
  "raid:info": empty,
  "raid:join": msg({ npc: opt(id) }),
  "raid:cancel": empty,
  "raid:start": empty,
  "raid:revive": msg({ id }),
  "wboss:info": empty,
  "wboss:chronicle": empty,
  "wboss:join": empty,
  "wboss:cancel": empty,
  "wboss:tp": empty,
  "wboss:start": empty,
  dbg,
};

/** Схема по типу: admin:* — общая админская; нет схемы — undefined. */
export function schemaOf(type: string): z.ZodType | undefined {
  if (Object.hasOwn(SCHEMAS, type)) return SCHEMAS[type];
  return type.startsWith("admin:") ? admin : undefined;
}

/** Проверка сообщения: null — форма верная, иначе краткая причина (для журнала). */
export function checkMsg(type: string, m: unknown): string | null {
  const s = schemaOf(type);
  if (!s) return null;
  const r = s.safeParse(m);
  if (r.success) return null;
  const i = r.error.issues[0];
  return `${i?.path.join(".") || "·"}: ${i?.code ?? "invalid"}`;
}
