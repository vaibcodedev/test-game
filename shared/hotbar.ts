/**
 * Панели умений (задача 115, шаги 4–5; docs/controls.md, раздел 8).
 * 2 панели × 12 слотов; слот — null | {s: умение} | {i: базовый предмет} | {a: действие}.
 * Клавиши слотов зависят от схемы (client/src/game/keybinds.ts, BAR_ACTIONS), сервер хранит только раскладку.
 */
import type { ClassId } from "./classes";
import { BASE_ITEMS } from "./items";
import { foodOf } from "./food";
import { activeSkills, SKILLS } from "./skills";

export const BAR_COUNT = 2;
export const BAR_SLOTS = 12;
/** Слоты 0..8 — «места умений» (клавиши умений схемы), 9..11 — предметы (зелья HP и MP на 9 и 10; 11 свободен). */
export const SKILL_SLOTS = 9;
export const BAR_ACTION_IDS = ["mount", "pet", "attack", "interact"] as const;
export type BarAction = (typeof BAR_ACTION_IDS)[number];
export type SlotRef = { s: string } | { i: string } | { a: BarAction };
export type Slot = SlotRef | null;
export type Bars = Slot[][];

export const emptyBars = (): Bars => Array.from({ length: BAR_COUNT }, () => new Array<Slot>(BAR_SLOTS).fill(null));

/** Предмет, который можно положить на панель: зелья и еда (не экипировка, не материалы и ресурсы). */
export function usableBase(base: unknown): base is string {
  return typeof base === "string" && (base === "hp_potion" || base === "mp_potion" || !!foodOf(base)) && BASE_ITEMS[base]?.slot === "consumable";
}

/** Одна ссылка: undefined — недопустима (чужое умение, экипировка, неизвестное действие), null — пустой слот. */
export function cleanRef(raw: unknown, cls: ClassId): Slot | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.s === "string") {
    const d = SKILLS[r.s];
    return d && d.cls === cls && d.kind === "active" ? { s: d.id } : undefined;
  }
  if (typeof r.i === "string") return usableBase(r.i) ? { i: r.i } : undefined;
  if (typeof r.a === "string") return (BAR_ACTION_IDS as readonly string[]).includes(r.a) ? { a: r.a as BarAction } : undefined;
  return undefined;
}

const refKey = (r: Slot): string => (!r ? "" : "s" in r ? `s:${r.s}` : "i" in r ? `i:${r.i}` : `a:${r.a}`);
export const sameRef = (a: Slot, b: Slot) => !!a && !!b && refKey(a) === refKey(b);

/** Раскладка нового героя: стартовое умение на своём месте и зелья здоровья и маны (слоты 10 и 11, индексы 9 и 10). */
export function defaultBars(cls: ClassId): Bars {
  return migrateBars(cls, { [activeSkills(cls)[0].id]: 1 });
}

/** Раскладка героя без bars: изученные активные умения — на местах, где их вызывали клавиши (порядок среди активных), Q/E — зелья. */
export function migrateBars(cls: ClassId, skills: Record<string, number>): Bars {
  const bars = emptyBars();
  activeSkills(cls).forEach((d, i) => { if (skills[d.id] && i < SKILL_SLOTS) bars[0][i] = { s: d.id }; });
  bars[0][9] = { i: "hp_potion" };
  bars[0][10] = { i: "mp_potion" };
  return bars;
}

/** Проверка и починка раскладки из сохранения или от клиента: форма 2×12, допустимые ссылки, без повторов. */
export function validateBars(raw: unknown, cls: ClassId): Bars {
  const out = emptyBars();
  if (!Array.isArray(raw)) return out;
  const seen = new Set<string>();
  for (let b = 0; b < BAR_COUNT; b++) {
    const row = raw[b];
    if (!Array.isArray(row)) continue;
    for (let i = 0; i < BAR_SLOTS; i++) {
      const r = cleanRef(row[i] ?? null, cls);
      if (!r) continue;
      const k = refKey(r);
      if (seen.has(k)) continue;
      seen.add(k);
      out[b][i] = r;
    }
  }
  return out;
}

export const hasBars = (raw: unknown): boolean => Array.isArray(raw) && raw.length === BAR_COUNT;

/** Где лежит ссылка. */
export function findRef(bars: Bars, ref: Slot): { bar: number; i: number } | null {
  if (!ref) return null;
  for (let b = 0; b < BAR_COUNT; b++) for (let i = 0; i < BAR_SLOTS; i++) if (sameRef(bars[b][i], ref)) return { bar: b, i };
  return null;
}

/**
 * Куда поставить умение при изучении: уже на панели — никуда (null); своё место (порядок среди активных), если свободно;
 * иначе первый свободный слот панели 1 среди умений, затем панели 2.
 */
export function autoPlace(bars: Bars, cls: ClassId, skillId: string): { bar: number; i: number } | null {
  if (findRef(bars, { s: skillId })) return null;
  const home = activeSkills(cls).findIndex((d) => d.id === skillId);
  if (home >= 0 && home < SKILL_SLOTS && !bars[0][home]) return { bar: 0, i: home };
  for (let b = 0; b < BAR_COUNT; b++) for (let i = 0; i < BAR_SLOTS; i++) if (!bars[b][i]) return { bar: b, i };
  return null;
}

/** Положить ссылку в слот; такая же ссылка в другом слоте убирается (перенос). Не меняет вход, возвращает новую раскладку. */
export function setSlot(bars: Bars, bar: number, i: number, ref: Slot): Bars {
  const out = bars.map((r) => r.slice());
  if (ref) for (const row of out) for (let j = 0; j < BAR_SLOTS; j++) if (sameRef(row[j], ref)) row[j] = null;
  out[bar][i] = ref;
  return out;
}

export const validPos = (bar: unknown, i: unknown): boolean =>
  Number.isInteger(bar) && (bar as number) >= 0 && (bar as number) < BAR_COUNT && Number.isInteger(i) && (i as number) >= 0 && (i as number) < BAR_SLOTS;
