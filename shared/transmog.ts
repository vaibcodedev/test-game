/**
 * Перековка (трансмог, docs/art/gear.md): «Оболочка» — вид вещи-донора без характеристик, наложение вида на вещь того же слота
 * и семейства, сброс вида. Правила, цены и NPC — data/transmog.json; сервер — server/src/game/transmog.ts, окно — client/src/ui/transmog.ts.
 * Сервер — источник правды: здесь только чистые функции (проверки и цены одинаковы у сервера и окна).
 */
import data from "../data/transmog.json";
import { TILE } from "./constants";
import { TOWN } from "./map";
import { LEGENDARIES } from "./legendary";
import { BASE_ITEMS, ITEM_MODELS, iconVariant, lookItem, newUid, Rarity, SHELL_BASE, UNIQUES, type Appearance, type Item, type Slot } from "./items";
import { T } from "./texts";

/** Перековщик в Эмберхолле (нейтральный город: служит обеим фракциям), у кузницы. */
export const REFORGER = {
  id: data.npc.id,
  name: data.npc.name,
  sprite: data.npc.sprite,
  color: data.npc.color,
  greeting: data.npc.greeting,
  x: (TOWN.x + data.npc.tile[0]) * TILE + 16,
  y: (TOWN.y + data.npc.tile[1]) * TILE + 16,
};

const FAMILIES = data.families as Record<string, string>;
export const FAMILY_NAMES = data.familyNames as Record<string, string>;

/** Семейство базы (латы, кожа, ткань, одноручное, двуручное…) или null — перековать нельзя (расходники, «Оболочка»). */
export function familyOf(base: string): string | null {
  const b = BASE_ITEMS[base];
  if (!b || b.slot === "consumable") return null;
  return FAMILIES[base] ?? null;
}
/** Слот базы для перековки (оружие Рыцаря смерти во второй руке остаётся оружием — по базе, а не по месту). */
export const slotOf = (base: string): Slot | null => {
  const s = BASE_ITEMS[base]?.slot;
  return s && s !== "consumable" ? s : null;
};
export const isShell = (it: Pick<Item, "base"> | null | undefined): boolean => it?.base === SHELL_BASE;

/** Вид вещи как она есть (без наложенного): то, что унесёт оболочка. */
export function ownAppearance(it: Item): Appearance {
  const ap: Appearance = { base: it.base, name: it.name, rarity: it.rarity };
  if (it.model) ap.model = it.model;
  if (it.legendary) ap.legendary = it.legendary;
  if (it.unique) ap.unique = it.unique;
  if (it.rags) ap.rags = true;
  // старые универсальные шлем/доспех/сапоги: вариант иконки зависел от uid и характеристик донора — запоминаем
  if (!BASE_ITEMS[it.base]?.armorType && !BASE_ITEMS[it.base]?.classes) ap.variant = iconVariant(it);
  return ap;
}

/** Допустим ли вид (данные сервера, сохранения): база с семейством, существующие модель, легендарка и уникальная вещь. */
export function validAppearance(ap: unknown): ap is Appearance {
  if (!ap || typeof ap !== "object") return false;
  const a = ap as Appearance;
  if (typeof a.base !== "string" || !Object.hasOwn(BASE_ITEMS, a.base) || !familyOf(a.base)) return false;
  if (typeof a.name !== "string" || !Number.isInteger(a.rarity) || a.rarity < 0 || a.rarity > Rarity.Legendary) return false;
  if (a.model !== undefined && (typeof a.model !== "string" || !Object.hasOwn(ITEM_MODELS, a.model))) return false;
  if (a.legendary !== undefined && (typeof a.legendary !== "string" || !Object.hasOwn(LEGENDARIES, a.legendary))) return false;
  if (a.unique !== undefined && (typeof a.unique !== "string" || !Object.hasOwn(UNIQUES, a.unique))) return false;
  return true;
}

/** Совпадают ли слот и семейство вида с вещью (условие наложения). */
export const fits = (ap: Pick<Appearance, "base">, it: Pick<Item, "base">): boolean =>
  !!familyOf(it.base) && slotOf(ap.base) === slotOf(it.base) && familyOf(ap.base) === familyOf(it.base);

/** Новая «Оболочка: <имя>» из вещи-донора: без характеристик, не привязана (передаётся и продаётся). */
export function makeShell(donor: Item): Item {
  const ap = ownAppearance(donor);
  return { uid: newUid(), base: SHELL_BASE, name: `${data.shell.name}: ${donor.name}`, rarity: donor.rarity, ilvl: donor.ilvl, req: 1, stats: {}, appearance: ap };
}

type PriceRule = { base: number; perLevel: number; rarity: number[] };
const priceBy = (r: PriceRule, ilvl: number, rarity: number) => Math.max(0, Math.round((r.base + Math.max(1, ilvl) * r.perLevel) * (r.rarity[Math.max(0, Math.min(r.rarity.length - 1, rarity | 0))] ?? 1)));
/** Снять оболочку: по уровню и редкости донора. */
export const extractPrice = (donor: Pick<Item, "ilvl" | "rarity">): number => priceBy(data.price.extract, donor.ilvl, donor.rarity);
/** Наложить: по большему из уровней и редкостей вещи и оболочки (вид легендарки 100 стоит как легендарка 100). */
export const applyPrice = (shell: Pick<Item, "ilvl" | "rarity">, target: Pick<Item, "ilvl" | "rarity">): number =>
  priceBy(data.price.apply, Math.max(shell.ilvl, target.ilvl), Math.max(shell.rarity, target.rarity));
/** Вернуть вещи её вид. */
export const resetPrice = (it: Pick<Item, "ilvl" | "rarity">): number => priceBy(data.price.reset, it.ilvl, it.rarity);

/** Почему вещь не годится в доноры (null — годится). */
export function extractRefusal(it: Item | null | undefined): string | null {
  if (!it) return T("srv.transmog.noItem");
  if (isShell(it)) return T("srv.transmog.isShell");
  if (!familyOf(it.base)) return T("srv.transmog.notGear");
  if (it.appearance) return T("srv.transmog.hasLook");
  return null;
}
/** Почему оболочку нельзя наложить на вещь (null — можно). */
export function applyRefusal(shell: Item | null | undefined, target: Item | null | undefined): string | null {
  if (!shell || !isShell(shell) || !validAppearance(shell.appearance)) return T("srv.transmog.noShell");
  if (!target) return T("srv.transmog.noItem");
  if (isShell(target) || !familyOf(target.base)) return T("srv.transmog.notGear");
  if (!fits(shell.appearance, target)) return T("srv.transmog.wrongFamily", { family: FAMILY_NAMES[familyOf(shell.appearance.base)!] ?? "" });
  return null;
}

/**
 * Строки внешности для Unit (weapon и gear), как их шлёт сервер (Player.recalc): каждая вещь — своим видом (lookItem),
 * заточка — своя. Тот же расчёт — у превью «было | станет» и «примерить» на клиенте.
 */
export function gearStrings(equip: Partial<Record<Slot, Item | null>>): { weapon: string; gear: string } {
  const L = (e: Item | null | undefined) => (e ? lookItem(e) : null);
  const w = L(equip.weapon);
  // 6-е поле «1» — вид чужой: особая анимация удара остаётся у настоящей вещи (client/src/game/heroB.ts lookOf)
  const weapon = w ? `${w.base}:${w.rarity}:${w.plus || 0}:${w.legendary || ""}:${w.model || ""}${equip.weapon?.appearance ? ":1" : ""}` : "";
  const piece = (e: Item | null) => (e ? `${e.rarity}:${e.plus || 0}:${e.legendary || ""}:${e.rags ? 1 : ""}:${e.base}:${e.model || ""}` : "");
  const gear = (["helmet", "armor", "boots", "offhand", "cloak"] as const).map((k) => piece(L(equip[k])));
  // кольцо и амулет — 6-й и 7-й куски, только когда хоть одно из них легендарное (тема «вокруг героя»); иначе строка из 5 кусков
  const jewel = (["ring", "amulet"] as const).map((k) => { const e = L(equip[k]); return e?.legendary ? piece(e) : ""; });
  return { weapon, gear: (jewel.some(Boolean) ? [...gear, ...jewel] : gear).join("|") };
}

/** Снаряжение с наложенным видом на вещь в слоте slot (превью «станет» и «примерить»; вещь не меняется). */
export function withLook(equip: Partial<Record<Slot, Item | null>>, slot: Slot, ap: Appearance | null): Partial<Record<Slot, Item | null>> {
  const it = equip[slot];
  if (!it) return equip;
  const next: Item = { ...it };
  if (ap) next.appearance = ap; else delete next.appearance;
  return { ...equip, [slot]: next };
}

/** Куда примерить вид: слот надетой вещи того же слота и семейства (у Рыцаря смерти одноручное может быть во второй руке). */
export function tryOnSlot(equip: Partial<Record<Slot, Item | null>>, ap: Appearance): Slot | null {
  for (const s of ["weapon", "offhand", "helmet", "armor", "boots", "cloak", "ring", "amulet"] as Slot[]) {
    const it = equip[s];
    if (it && fits(ap, it)) return s;
  }
  return null;
}

/** Миграция сохранений: битый вид (модель или легендарка исчезли из данных, сменилось семейство) снимается — вещь возвращается к своему. */
export function sanitizeItem(it: Item | null | undefined): boolean {
  if (!it || it.appearance === undefined) return false;
  const ok = validAppearance(it.appearance) && (isShell(it) || fits(it.appearance, it));
  if (ok) return false;
  if (!isShell(it)) delete it.appearance;
  return !isShell(it);
}
