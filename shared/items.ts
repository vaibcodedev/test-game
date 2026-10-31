import { CLASSES, type ClassId, type StatKey } from "./classes";
import { FOOD } from "./food";
import { RESOURCES } from "./biomes";
import { MATERIALS, PLUS_BONUS } from "./upgrade";
import catalog from "../data/items.json";
import items147 from "../data/items-147.json";
import { MOBS } from "./mobs";
import { ZB_ITEMS } from "./zoneBosses";
import mountData from "../data/mounts.json";
import petData from "../data/pets.json";
import tmData from "../data/transmog.json";
import { sealIconFor, nameFor } from "./mountArt";
import { IR } from "./itemRules";
/** Печать гербового маунта: имя по фракции зрителя (задача 142). */
function sealNamed<T extends { name: string }>(b: T, m: { name: string; desc: string; names?: Record<string, { name?: string; desc?: string }> }): T {
  if (!m.names) return b;
  Object.defineProperty(b, "name", { get: () => `${mountData.seal.name}: ${nameFor(m)}`, enumerable: true });
  return b;
}

export type Slot = "weapon" | "offhand" | "helmet" | "shoulders" | "armor" | "gloves" | "boots" | "cloak" | "ring" | "amulet";
/** Порядок слотов: окно «Герой», осмотр, сводка персонажа. Наплечники и перчатки — отдельные слоты (задача 147: прежде рисовались вместе с кирасой). */
export const SLOTS: Slot[] = ["weapon", "offhand", "helmet", "shoulders", "armor", "gloves", "boots", "cloak", "ring", "amulet"];
/** Пустой слот снаряжения по слотам: старые сохранения без новых слотов дополняются null (ничего не теряется). */
export function fillSlots(equip: Partial<Record<Slot, Item | null>> | null | undefined): Record<Slot, Item | null> {
  const e = (equip ?? {}) as Record<Slot, Item | null>;
  for (const s of SLOTS) if (e[s] === undefined) e[s] = null;
  return e;
}
/** Вторая рука: щит или второй клинок у Храмовника и Рыцаря смерти, сфера или книга у заклинателей. */
export const OFFHAND_CLASSES: ClassId[] = ["warrior", "deathknight", "mage", "healer", "warlock", "bloodweaver"];
/** Одноручное оружие: у Рыцаря смерти может занять вторую руку. */
export const ONEHAND = ["sword", "axe", "mace", "spear"];
/** Пустая ячейка второй руки в интерфейсе: какой базой её подсветить. */
export const offhandGhost = (cls: ClassId): string => (cls === "warrior" || cls === "deathknight" ? "shield" : cls === "mage" || cls === "warlock" ? "orb" : "tome");
export const SLOT_NAMES: Record<Slot, string> = {
  weapon: "Оружие",
  offhand: "Вторая рука",
  helmet: "Шлем",
  shoulders: "Наплечники",
  armor: "Доспех",
  gloves: "Перчатки",
  boots: "Сапоги",
  cloak: "Спина",
  ring: "Кольцо",
  amulet: "Амулет",
};

export enum Rarity {
  Common = 0,
  Rare = 1,
  Epic = 2,
  Legendary = 3,
}
export const RARITY_NAMES = ["Обычное", "Редкое", "Эпическое", "Легендарное"];
export const RARITY_COLORS = ["#e8e2d0", "#5fa8ff", "#c47bff", "#ff9a2e"];

export type ItemStatKey = StatKey | "hp" | "crit" | "armor" | "dmgMin" | "dmgMax";
export type ItemStats = Partial<Record<ItemStatKey, number>>;
export const ITEM_STAT_NAMES: Record<ItemStatKey, string> = {
  str: "Сила",
  agi: "Ловкость",
  int: "Интеллект",
  vit: "Выносливость",
  hp: "Здоровье",
  crit: "к шансу крита",
  armor: "Броня",
  dmgMin: "Урон мин.",
  dmgMax: "Урон макс.",
};

export interface Item {
  uid: string;
  base: string;
  name: string;
  rarity: Rarity;
  ilvl: number;
  req: number;
  stats: ItemStats;
  qty?: number;
  unique?: string;
  /** id легендарного предмета (data/legendaries.json). */
  legendary?: string;
  /** Привязан к персонажу: нельзя передать другому игроку. */
  bound?: boolean;
  /** Уровень улучшения 0..10. */
  plus?: number;
  /** Стартовые лохмотья: на герое рисуются рваной тканью. */
  rags?: boolean;
  /** id модели из data/items.json: имя, иконка и вид на герое. Без неё предмет — обычная база. */
  model?: string;
  /**
   * Перековка (docs/art/gear.md): наложенный вид другой вещи того же слота и семейства — рисуется на герое и в иконке вместо своего.
   * Характеристики, заточка (и её свечение) и свойства легендарки остаются от настоящей вещи. У «Оболочки» (SHELL_BASE) — вид, который она несёт.
   */
  appearance?: Appearance;
}

/** Вид вещи-донора: всё, что нужно, чтобы нарисовать её на герое и в иконке (без характеристик). */
export interface Appearance {
  /** База донора (слот и семейство — по ней). */
  base: string;
  /** Имя донора: «Оболочка: <имя>» и строка «Вид:» в подсказке. */
  name: string;
  rarity: Rarity;
  model?: string;
  legendary?: string;
  unique?: string;
  rags?: boolean;
  /** Вариант иконки старых универсальных баз (шлем/доспех/сапоги без класса брони): у донора он считался по его uid и характеристикам. */
  variant?: ClassId;
}
/** База предмета «Оболочка» (перековка): несёт вид в appearance, без характеристик; передаётся и продаётся как обычный предмет. */
export const SHELL_BASE = "tm_shell";

export interface BaseItem {
  id: string;
  name: string;
  slot: Slot | "consumable";
  icon: string;
  weaponType?: string;
  /** Тип для интерфейса: «Двуручный меч», «Латы», «Сфера». */
  typeName?: string;
  /** Двуручное оружие: занимает обе руки. */
  hands?: 2;
  /** Класс брони: латы / кожа / ткань. */
  armorType?: "plate" | "leather" | "cloth";
  /** Рекомендованные классы (чаще выпадает им); допустимые — classes. */
  rec?: ClassId[];
  classes?: ClassId[];
  /** Основные характеристики в зависимости от уровня предмета. */
  roll?: (ilvl: number) => ItemStats;
  price?: number;
  stack?: number;
  /** Падает с мобов и у торговцев и без моделей каталога (голой базой): новые слоты наплечников и перчаток. */
  lootBare?: boolean;
}

const r1 = (v: number) => Math.round(v);
/** Основные характеристики базы по уровню вещи: каждое значение = округление(база + уровень × прирост) — числа в data/items-rules.json rolls. */
const statRoll = (spec: Record<string, number[]>) => (l: number): ItemStats => Object.fromEntries(Object.entries(spec).map(([k, [a, b]]) => [k, r1(a + l * b)])) as ItemStats;
const STR_MELEE: ClassId[] = ["warrior", "deathknight", "reaver"];
const CASTERS: ClassId[] = ["mage", "healer", "warlock", "bloodweaver"];
const LEATHER: ClassId[] = ["rogue", "ranger", "darkranger", "reaver"];
/**
 * Базы (категории) экипировки. Кривая основных характеристик — docs/plan/balance.md «Экипировка»: урон и броня линейны по ilvl,
 * двуручное ≈ ×1.5 одноручного, у кожи и ткани часть брони заменена главной характеристикой.
 */
export const BASE_ITEMS: Record<string, BaseItem> = {
  sword: { id: "sword", name: "Меч", typeName: "Одноручный меч", slot: "weapon", icon: "sword", weaponType: "sword", classes: ["warrior", "deathknight"], roll: statRoll(IR.rolls.sword) },
  greatsword: { id: "greatsword", name: "Двуручный меч", typeName: "Двуручный меч", slot: "weapon", icon: "greatsword", weaponType: "sword", hands: 2, classes: STR_MELEE, rec: ["deathknight", "reaver"], roll: statRoll(IR.rolls.greatsword) },
  twinblades: { id: "twinblades", name: "Парные мечи", typeName: "Парные мечи", slot: "weapon", icon: "twinblades", weaponType: "dagger", classes: ["rogue", "reaver"], roll: statRoll(IR.rolls.twinblades) },
  axe: { id: "axe", name: "Топор", typeName: "Топор", slot: "weapon", icon: "axe", weaponType: "axe", classes: ["warrior", "deathknight", "reaver"], roll: statRoll(IR.rolls.axe) },
  greataxe: { id: "greataxe", name: "Секира", typeName: "Двуручный топор", slot: "weapon", icon: "greataxe", weaponType: "axe", hands: 2, classes: ["deathknight", "reaver"], roll: statRoll(IR.rolls.greataxe) },
  mace: { id: "mace", name: "Булава", typeName: "Булава", slot: "weapon", icon: "mace", weaponType: "mace", classes: ["warrior", "deathknight"], roll: statRoll(IR.rolls.mace) },
  hammer: { id: "hammer", name: "Молот", typeName: "Молот", slot: "weapon", icon: "hammer", weaponType: "mace", hands: 2, classes: STR_MELEE, rec: ["deathknight", "reaver"], roll: statRoll(IR.rolls.hammer) },
  spear: { id: "spear", name: "Копьё", typeName: "Копьё", slot: "weapon", icon: "spear", weaponType: "spear", classes: ["warrior", "deathknight"], roll: statRoll(IR.rolls.spear) },
  scythe: { id: "scythe", name: "Коса", typeName: "Коса", slot: "weapon", icon: "scythe", weaponType: "scythe", hands: 2, classes: ["deathknight", "reaver"], roll: statRoll(IR.rolls.scythe) },
  shield: { id: "shield", name: "Щит", typeName: "Щит", slot: "offhand", icon: "shield", classes: ["warrior", "deathknight"], roll: statRoll(IR.rolls.shield) },
  orb: { id: "orb", name: "Сфера", typeName: "Сфера", slot: "offhand", icon: "orb", classes: CASTERS, rec: ["mage", "warlock"], roll: statRoll(IR.rolls.orb) },
  tome: { id: "tome", name: "Книга", typeName: "Книга", slot: "offhand", icon: "tome", classes: CASTERS, rec: ["healer", "bloodweaver"], roll: statRoll(IR.rolls.tome) },
  staff: { id: "staff", name: "Посох", typeName: "Посох", slot: "weapon", icon: "staff", weaponType: "staff", hands: 2, classes: CASTERS, rec: ["mage", "warlock"], roll: statRoll(IR.rolls.staff) },
  scepter: { id: "scepter", name: "Жезл", typeName: "Жезл", slot: "weapon", icon: "scepter", weaponType: "scepter", classes: CASTERS, rec: ["healer", "bloodweaver"], roll: statRoll(IR.rolls.scepter) },
  dagger: { id: "dagger", name: "Кинжалы", typeName: "Кинжалы", slot: "weapon", icon: "dagger", weaponType: "dagger", classes: ["rogue", "reaver"], roll: statRoll(IR.rolls.dagger) },
  bow: { id: "bow", name: "Лук", typeName: "Лук", slot: "weapon", icon: "bow", weaponType: "bow", hands: 2, classes: ["ranger", "darkranger"], roll: statRoll(IR.rolls.bow) },
  crossbow: { id: "crossbow", name: "Арбалет", typeName: "Арбалет", slot: "weapon", icon: "crossbow", weaponType: "bow", hands: 2, classes: ["ranger", "darkranger"], roll: statRoll(IR.rolls.crossbow) },
  // старые универсальные базы: остаются валидными для сохранений и стартовых вещей
  helmet: { id: "helmet", name: "Шлем", typeName: "Шлем", slot: "helmet", icon: "helmet", roll: statRoll(IR.rolls.helmet) },
  armor: { id: "armor", name: "Доспех", typeName: "Доспех", slot: "armor", icon: "armor", roll: statRoll(IR.rolls.armor) },
  boots: { id: "boots", name: "Сапоги", typeName: "Сапоги", slot: "boots", icon: "boots", roll: statRoll(IR.rolls.boots) },
  plate_helm: { id: "plate_helm", name: "Шлем", typeName: "Латный шлем", slot: "helmet", icon: "plate_helm", armorType: "plate", classes: STR_MELEE, roll: statRoll(IR.rolls.plate_helm) },
  leather_helm: { id: "leather_helm", name: "Капюшон", typeName: "Кожаный шлем", slot: "helmet", icon: "leather_helm", armorType: "leather", classes: LEATHER, roll: statRoll(IR.rolls.leather_helm) },
  cloth_helm: { id: "cloth_helm", name: "Колпак", typeName: "Тканевый убор", slot: "helmet", icon: "cloth_helm", armorType: "cloth", classes: CASTERS, roll: statRoll(IR.rolls.cloth_helm) },
  plate_armor: { id: "plate_armor", name: "Латы", typeName: "Латы", slot: "armor", icon: "plate_armor", armorType: "plate", classes: STR_MELEE, roll: statRoll(IR.rolls.plate_armor) },
  leather_armor: { id: "leather_armor", name: "Куртка", typeName: "Кожаный доспех", slot: "armor", icon: "leather_armor", armorType: "leather", classes: LEATHER, roll: statRoll(IR.rolls.leather_armor) },
  cloth_armor: { id: "cloth_armor", name: "Мантия", typeName: "Мантия", slot: "armor", icon: "cloth_armor", armorType: "cloth", classes: CASTERS, roll: statRoll(IR.rolls.cloth_armor) },
  plate_boots: { id: "plate_boots", name: "Сабатоны", typeName: "Латные сапоги", slot: "boots", icon: "plate_boots", armorType: "plate", classes: STR_MELEE, roll: statRoll(IR.rolls.plate_boots) },
  leather_boots: { id: "leather_boots", name: "Ботинки", typeName: "Кожаные сапоги", slot: "boots", icon: "leather_boots", armorType: "leather", classes: LEATHER, roll: statRoll(IR.rolls.leather_boots) },
  cloth_boots: { id: "cloth_boots", name: "Туфли", typeName: "Тканевые туфли", slot: "boots", icon: "cloth_boots", armorType: "cloth", classes: CASTERS, roll: statRoll(IR.rolls.cloth_boots) },
  // наплечники и перчатки (задача 147): свой слот, материал по классу брони; без моделей каталога — падают голой базой (lootBare), вклад — data/items-rules.json
  plate_shoulders: { id: "plate_shoulders", name: "Наплечники", typeName: "Латные наплечники", slot: "shoulders", icon: "plate_shoulders", armorType: "plate", classes: STR_MELEE, lootBare: true, roll: statRoll(IR.rolls.plate_shoulders) },
  leather_shoulders: { id: "leather_shoulders", name: "Наплечники", typeName: "Кожаные наплечники", slot: "shoulders", icon: "leather_shoulders", armorType: "leather", classes: LEATHER, lootBare: true, roll: statRoll(IR.rolls.leather_shoulders) },
  cloth_shoulders: { id: "cloth_shoulders", name: "Оплечье", typeName: "Тканевое оплечье", slot: "shoulders", icon: "cloth_shoulders", armorType: "cloth", classes: CASTERS, lootBare: true, roll: statRoll(IR.rolls.cloth_shoulders) },
  plate_gloves: { id: "plate_gloves", name: "Рукавицы", typeName: "Латные рукавицы", slot: "gloves", icon: "plate_gloves", armorType: "plate", classes: STR_MELEE, lootBare: true, roll: statRoll(IR.rolls.plate_gloves) },
  leather_gloves: { id: "leather_gloves", name: "Перчатки", typeName: "Кожаные перчатки", slot: "gloves", icon: "leather_gloves", armorType: "leather", classes: LEATHER, lootBare: true, roll: statRoll(IR.rolls.leather_gloves) },
  cloth_gloves: { id: "cloth_gloves", name: "Перчатки", typeName: "Тканевые перчатки", slot: "gloves", icon: "cloth_gloves", armorType: "cloth", classes: CASTERS, lootBare: true, roll: statRoll(IR.rolls.cloth_gloves) },
  // плащ: отдельный слот, общий для всех классов; броня + аффиксы модели (docs/plan/balance.md «Экипировка»)
  cloak: { id: "cloak", name: "Плащ", typeName: "Плащ", slot: "cloak", icon: "cloak", roll: statRoll(IR.rolls.cloak) },
  ring: { id: "ring", name: "Кольцо", typeName: "Кольцо", slot: "ring", icon: "ring", roll: () => ({}) },
  amulet: { id: "amulet", name: "Амулет", typeName: "Амулет", slot: "amulet", icon: "amulet", roll: statRoll(IR.rolls.amulet) },
  // «Оболочка» перековки (docs/art/gear.md, data/transmog.json shell): не складывается, иконка — вида, который несёт
  [SHELL_BASE]: { id: SHELL_BASE, name: tmData.shell.name, typeName: tmData.shell.typeName, slot: "consumable", icon: tmData.shell.icon, price: tmData.shell.price },
  hp_potion: { id: "hp_potion", name: "Зелье здоровья", slot: "consumable", icon: "potion_red", price: 15, stack: 20 },
  mp_potion: { id: "mp_potion", name: "Зелье маны", slot: "consumable", icon: "potion_blue", price: 15, stack: 20 },
  ...Object.fromEntries(Object.values(MATERIALS).map((m) => [m.id, { id: m.id, name: m.name, slot: "consumable", icon: m.icon, price: m.price, stack: 99 } as BaseItem])),
  ...Object.fromEntries(Object.values(RESOURCES).map((r) => [r.id, { id: r.id, name: r.name, slot: "consumable", icon: r.icon, price: r.price, stack: 99 } as BaseItem])),
  ...Object.fromEntries(Object.values(FOOD).map((d) => [`food_${d.id}`, { id: `food_${d.id}`, name: d.name, slot: "consumable", icon: d.icon, price: d.price, stack: 20 } as BaseItem])),
  // «Печать скакуна» (задача 142): по одной на маунт, не складывается; изучение — shared/mounts.ts sealMount, server/src/game/stable.ts
  ...Object.fromEntries(Object.entries(mountData.mounts).map(([id, m]) => [`mseal_${id}`, sealNamed({ id: `mseal_${id}`, name: `${mountData.seal.name}: ${m.name}`, typeName: mountData.seal.name, slot: "consumable", icon: `mseal_${id}`, price: (mountData.seal.price as Record<string, number>)[m.tier] ?? 300 } as BaseItem, m as { name: string; desc: string; names?: Record<string, { name?: string; desc?: string }> })])),
  // «Печать питомца» (задача 150): по одной на питомца, не складывается; изучение — shared/pets.ts sealPet, server/src/game/menagerie.ts
  ...Object.fromEntries(Object.entries(petData.pets).map(([id, d]) => [`pseal_${id}`, { id: `pseal_${id}`, name: `${petData.seal.name}: ${d.name}`, typeName: petData.seal.name, slot: "consumable", icon: `pseal_${id}`, price: (petData.seal.price as Record<string, number>)[d.tier] ?? 300 } as BaseItem])),
  // детали маунтов для сборки у конюшего (data/mounts.json parts)
  ...Object.fromEntries(Object.entries(mountData.parts).map(([id, d]) => [`mpart_${id}`, { id: `mpart_${id}`, name: d.name, typeName: "Деталь для конюшего", slot: "consumable", icon: d.icon, price: d.price, stack: (d as { stack?: number }).stack ?? 20 } as BaseItem])),
};
export const isTwoHanded = (baseId: string | undefined): boolean => !!baseId && BASE_ITEMS[baseId]?.hands === 2;
/**
 * База бледного силуэта пустой ячейки снаряжения: оружие — стартовое класса, вторая рука — щит / сфера / книга,
 * наплечники и перчатки — материала класса (латы, кожа, ткань), прочее — старая универсальная база слота.
 */
export function slotGhost(cls: ClassId, slot: Slot): string {
  if (slot === "weapon") return CLASSES[cls]?.startWeapon ?? "sword";
  if (slot === "offhand") return offhandGhost(cls);
  if (slot === "shoulders" || slot === "gloves") return Object.values(BASE_ITEMS).find((b) => b.slot === slot && b.classes?.includes(cls))?.id ?? `plate_${slot}`;
  return slot;
}

// ---------------- каталог моделей (data/items.json) ----------------
/** Параметры вида модели: силуэт (архетип), материалы (ключи ITEM_PALETTES), украшение, богатство отделки. */
export interface ModelLook {
  shape: string; mat: string; trim: string; cloth?: string; hide?: string; gem?: string; haft?: string;
  /** Богатство отделки по ярусу 0..3 (больше рун, камней, инкрустации). Свечения нет: docs/art/gear.md 2.1. */
  deco?: string; rich?: number; fx?: string; guard?: string; pommel?: string;
}
export interface ItemModel {
  id: string; name: string; cat: string; lvl: number; fac: string; cls: ClassId[];
  affix: ItemStatKey[]; g?: number; look: ModelLook;
  /** Не выпадает с мобов и у торговцев (вещи для проверки, data/items-147.json): только выдача. */
  noRoll?: boolean;
  /** Дополнительные строки подсказки (например, «Особая анимация удара»). */
  tooltip?: string[];
}
/** Палитры материалов, тканей и камней: 5 тонов от тёмного к светлому. */
export const ITEM_PALETTES: Record<string, string[]> = catalog.palettes as Record<string, string[]>;
export const ITEM_MODELS: Record<string, ItemModel> = Object.fromEntries(([...catalog.models, ...items147.models] as unknown as ItemModel[]).filter((m) => BASE_ITEMS[m.cat]).map((m) => [m.id, m]));
const MODELS_BY_CAT: Record<string, ItemModel[]> = {};
for (const m of Object.values(ITEM_MODELS)) if (!m.noRoll) (MODELS_BY_CAT[m.cat] ??= []).push(m);
for (const l of Object.values(MODELS_BY_CAT)) l.sort((a, b) => a.lvl - b.lvl);

export const modelOf = (it: Pick<Item, "model"> | null | undefined): ItemModel | undefined => (it?.model ? ITEM_MODELS[it.model] : undefined);

/** Тип предмета для интерфейса: «Двуручный меч», «Латы», «Кольцо». */
export function itemTypeName(it: Pick<Item, "base">): string {
  const b = BASE_ITEMS[it.base];
  if (!b) return "";
  return b.typeName ?? b.name;
}

/** Предмет по модели: характеристики базы-категории (кривая ilvl × редкость), имя и вид — модели. */
function makeModelItem(id: string, ilvl: number, rarity: Rarity, rand: () => number): Item {
  const m = ITEM_MODELS[id];
  const it = makeItem(m.cat, Math.max(ilvl, m.lvl), rarity, rand, m.affix);
  const sfx = !m.g && rarity >= Rarity.Rare && m.affix[0] && it.stats[m.affix[0]] ? " " + SUFFIX[m.affix[0]] : "";
  return { ...it, name: m.name + sfx, model: m.id };
}

/**
 * Модель категории под уровень: текущий ярус (lvl ≤ ilvl) — основной, прошлый — реже;
 * рекомендованные классу (кольца/амулеты по главной характеристике) и своей фракции — чаще.
 */
export function rollModel(cat: string, ilvl: number, cls?: ClassId, faction?: string, rand: () => number = Math.random): ItemModel | undefined {
  const list = (MODELS_BY_CAT[cat] ?? []).filter((m) => m.lvl <= Math.max(1, ilvl));
  if (!list.length) return undefined;
  const tiers = [...new Set(list.map((m) => m.lvl))].sort((a, b) => b - a);
  const cand: [ItemModel, number][] = [];
  for (const m of list) {
    const rank = tiers.indexOf(m.lvl);
    if (rank > 1) continue;
    let w = rank === 0 ? 4 : 1.5;
    if (cls && m.cls.length) w *= m.cls.includes(cls) ? 3 : 1;
    if (faction && m.fac) w *= m.fac === faction ? 1.5 : 1;
    cand.push([m, w]);
  }
  return weighted(cand, rand);
}

function weighted<T>(cand: [T, number][], rand: () => number): T | undefined {
  let sum = 0;
  for (const [, w] of cand) sum += w;
  let r = rand() * sum;
  for (const [v, w] of cand) { r -= w; if (r <= 0) return v; }
  return cand[cand.length - 1]?.[0];
}

/** Вес слота при выборе добычи (data/items-rules.json slotWeight). */
export const slotWeight = (slot: string): number => (IR.slotWeight as Record<string, number>)[slot] ?? 1;

/** Категории (базы с моделями), которые может надеть класс. */
export function lootCategories(cls: ClassId): BaseItem[] {
  return Object.values(BASE_ITEMS).filter((b) => b.slot !== "consumable" && (MODELS_BY_CAT[b.id]?.length || b.lootBare) && (!b.classes || b.classes.includes(cls)));
}

/**
 * Добыча с мобов и товар торговцев: с шансом weaponChance — оружие класса, иначе слот брони/бижутерии/второй руки
 * (слот равновероятно, внутри слота — по рекомендации), затем модель по уровню. Характеристики — makeItem.
 */
export function makeLoot(cls: ClassId, ilvl: number, rarity: Rarity, rand: () => number = Math.random, weaponChance = IR.weaponChance, faction?: string): Item {
  const cats = lootCategories(cls);
  const wantWeapon = rand() < weaponChance;
  let pool = cats.filter((b) => (b.slot === "weapon") === wantWeapon);
  if (!pool.length) pool = cats;
  if (!wantWeapon) {
    // слот — по весу data/items-rules.json slotWeight (нет записи — 1): наплечники и перчатки падают реже прочей брони
    const slots = [...new Set(pool.map((b) => b.slot))];
    const slot = weighted(slots.map((sl) => [sl, slotWeight(sl)] as [Slot | "consumable", number]), rand)!;
    pool = pool.filter((b) => b.slot === slot);
  }
  const base = weighted(pool.map((b) => [b, b.rec ? (b.rec.includes(cls) ? 3 : 1) : 2] as [BaseItem, number]), rand)!;
  const m = rollModel(base.id, ilvl, cls, faction ?? CLASSES[cls]?.faction, rand);
  return m ? makeModelItem(m.id, ilvl, rarity, rand) : makeItem(base.id, ilvl, rarity, rand);
}


/** Для админ-панели: сводка модели. faction — только стиль внешности (solgard / umbrath / "" — нейтральный), на характеристики не влияет. */
export interface ItemModelInfo {
  id: string; name: string; category: string; base: string; slot: Slot | "consumable";
  level: number; classes: ClassId[]; allowed: ClassId[] | null; faction: string; twoHanded: boolean; icon: string;
}
const infoOf = (m: ItemModel): ItemModelInfo => {
  const b = BASE_ITEMS[m.cat];
  return { id: m.id, name: m.name, category: b.typeName ?? b.name, base: b.id, slot: b.slot, level: m.lvl, classes: m.cls, allowed: b.classes ?? null, faction: m.fac, twoHanded: b.hands === 2, icon: `im_${m.id}_0` };
};
/** Список моделей (по уровню, затем категории) с фильтрами для админ-панели. */
export function listItemModels(f: { slot?: Slot; base?: string; cls?: ClassId; minLevel?: number; maxLevel?: number; faction?: string; q?: string } = {}): ItemModelInfo[] {
  const q = f.q?.toLowerCase();
  return Object.values(ITEM_MODELS)
    .filter((m) => (!f.base || m.cat === f.base) && (!f.slot || BASE_ITEMS[m.cat].slot === f.slot) && (f.minLevel === undefined || m.lvl >= f.minLevel) && (f.maxLevel === undefined || m.lvl <= f.maxLevel))
    .filter((m) => (!f.cls || !BASE_ITEMS[m.cat].classes || BASE_ITEMS[m.cat].classes!.includes(f.cls)) && (!f.faction || m.fac === f.faction) && (!q || m.name.toLowerCase().includes(q) || m.id.includes(q)))
    .sort((a, b) => a.lvl - b.lvl || a.cat.localeCompare(b.cat) || a.id.localeCompare(b.id))
    .map(infoOf);
}
/** Категории экипировки для фильтров админки: база, тип, слот, двуручность, класс брони, классы. */
export function listItemCategories(): { base: string; category: string; slot: Slot | "consumable"; twoHanded: boolean; armorType?: string; classes: ClassId[] | null; models: number }[] {
  return Object.values(BASE_ITEMS).filter((b) => b.slot !== "consumable").map((b) => ({ base: b.id, category: b.typeName ?? b.name, slot: b.slot, twoHanded: b.hands === 2, armorType: b.armorType, classes: b.classes ?? null, models: MODELS_BY_CAT[b.id]?.length ?? 0 }));
}

const AFFIX_KEYS: ItemStatKey[] = ["str", "agi", "int", "vit", "hp", "crit"];
function affixValue(k: ItemStatKey, ilvl: number, mult: number): number {
  switch (k) {
    case "hp": return Math.round((IR.affix.hpBase + ilvl * IR.affix.hpPerLevel) * mult);
    // крит — доля, а не очки: рост с ilvl медленный (был 0.12/ур.: +19% крита с одной эпической вещи 100 ур., 4 вещи — потолок 75%)
    case "crit": return Math.max(1, Math.round((IR.affix.critBase + ilvl * IR.affix.critPerLevel) * mult));
    default: return Math.max(1, Math.round((IR.affix.statBase + ilvl * IR.affix.statPerLevel) * mult));
  }
}
const SUFFIX: Record<string, string> = { str: "силы", agi: "ловкости", int: "мудрости", vit: "стойкости", hp: "жизни", crit: "точности" };
const EPIC_PREFIX = ["Древний", "Пылающий", "Звёздный", "Проклятый", "Королевский", "Сумеречный", "Громовой"];
const EPIC_PREFIX_N = ["Древнее", "Пылающее", "Звёздное", "Проклятое", "Королевское", "Сумеречное", "Громовое"];
const NEUTER = new Set(["ring", "spear", "cloth_shoulders"]);
const PLURAL = new Set(["boots", "twinblades", "dagger", "plate_armor", "plate_boots", "leather_boots", "cloth_boots", "plate_shoulders", "leather_shoulders", "plate_gloves", "leather_gloves", "cloth_gloves"]);
const FEM = new Set(["mace", "greataxe", "scythe", "orb", "tome", "cloth_armor", "leather_armor"]);
const EPIC_PREFIX_F = ["Древняя", "Пылающая", "Звёздная", "Проклятая", "Королевская", "Сумеречная", "Громовая"];
const EPIC_PREFIX_P = ["Древние", "Пылающие", "Звёздные", "Проклятые", "Королевские", "Сумеречные", "Громовые"];

let uidCounter = 0;
export function newUid(): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return Date.now().toString(36) + "-" + uidCounter.toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
}

/** Множитель урона и брони базы по редкости. Был [1, 1.2, 1.45, 1.7]: с заточкой +10 эпик/легендарка давали ×3.7 к урону героя, теперь максимальная экипировка ≈ ×2 (задача 45). */
export const RARITY_MULT = IR.rarityMult;

/** Предмет по базе или по id модели каталога (data/items.json). prefer — приоритет аффиксов. */
export function makeItem(baseId: string, ilvl: number, rarity: Rarity, rand: () => number = Math.random, prefer: ItemStatKey[] = []): Item {
  if (!BASE_ITEMS[baseId] && ITEM_MODELS[baseId]) return makeModelItem(baseId, ilvl, rarity, rand);
  const base = BASE_ITEMS[baseId];
  if (!base) throw new Error("unknown base " + baseId);
  if (base.slot === "consumable") return { uid: newUid(), base: baseId, name: base.name, rarity: Rarity.Common, ilvl: 1, req: 1, stats: {}, qty: 1 };
  const mult = RARITY_MULT[rarity];
  const stats: ItemStats = {};
  const main = base.roll ? base.roll(ilvl) : {};
  for (const [k, v] of Object.entries(main)) stats[k as ItemStatKey] = Math.max(1, Math.round((v as number) * (k.startsWith("dmg") || k === "armor" ? mult : 1)));
  const affixes = affixCount(base.slot as Slot, rarity);
  const pool = [...AFFIX_KEYS];
  const picked: ItemStatKey[] = [];
  for (let i = 0; i < affixes && pool.length; i++) {
    const pi = prefer[i] ? pool.indexOf(prefer[i]) : -1;
    const k = pool.splice(pi >= 0 ? pi : Math.floor(rand() * pool.length), 1)[0];
    picked.push(k);
    stats[k] = (stats[k] || 0) + affixValue(k, ilvl, mult * (IR.affix.rollMin + rand() * IR.affix.rollRange));
  }
  let name = base.name;
  if (rarity === Rarity.Rare && picked.length) name = `${base.name} ${SUFFIX[picked[0]]}`;
  if (rarity === Rarity.Epic) {
    const i = Math.floor(rand() * EPIC_PREFIX.length);
    const pre = PLURAL.has(baseId) ? EPIC_PREFIX_P[i] : FEM.has(baseId) ? EPIC_PREFIX_F[i] : NEUTER.has(baseId) ? EPIC_PREFIX_N[i] : EPIC_PREFIX[i];
    name = `${pre} ${base.name.toLowerCase()}${picked[0] ? " " + SUFFIX[picked[0]] : ""}`;
  }
  return { uid: newUid(), base: baseId, name, rarity, ilvl, req: Math.max(1, ilvl - IR.reqLevelGap), stats };
}

/** Сколько аффиксов получает предмет слота и редкости (то же правило, что в makeItem; сверяется тестом tests/admin.ts). */
/** Наплечники и перчатки — на аффикс меньше (data/items-rules.json slotAffix, у редкой и выше — не меньше одного), чтобы полный сет вырос умеренно. */
export function affixCount(slot: Slot, rarity: Rarity): number {
  const n = IR.affixCount[rarity] + (slot === "ring" || slot === "amulet" ? IR.ringAmuletBonus : 0);
  const d = (IR.slotAffix as Record<string, number>)[slot] ?? 0;
  return d ? Math.max(rarity >= Rarity.Rare ? 1 : 0, n + d) : n;
}

/**
 * Для админ-панели: что выдаст сервер, без случайного. Основные характеристики и гарантированные аффиксы (у модели это model.affix,
 * у голой базы их нет) считаются точно, значения аффиксов у настоящей вещи отличаются в пределах ±15%. Остальные аффиксы выбираются
 * случайно: их число (random) и допустимые характеристики (pool) возвращаются отдельно, а в item они не входят. Имя голой базы — без приставок.
 */
export interface GearPreview { item: Item; fixed: ItemStatKey[]; random: number; pool: ItemStatKey[] }
export function previewGear(id: string, ilvl: number, rarity: Rarity, plus = 0): GearPreview | null {
  const m = Object.hasOwn(ITEM_MODELS, id) ? ITEM_MODELS[id] : undefined;
  const baseId = m ? m.cat : id;
  if (!Object.hasOwn(BASE_ITEMS, baseId) || BASE_ITEMS[baseId].slot === "consumable") return null;
  const base = BASE_ITEMS[baseId], lvl = m ? Math.max(ilvl, m.lvl) : ilvl, mid = () => 0.5;
  const it = m ? makeModelItem(id, ilvl, rarity, mid) : makeItem(id, ilvl, rarity, mid);
  const prefer = m ? m.affix : [];
  // повторяем выбор аффиксов makeItem при rand = 0.5 и убираем вклад случайных
  const pool = [...AFFIX_KEYS], fixed: ItemStatKey[] = [], stats: ItemStats = { ...it.stats };
  let random = 0;
  for (let i = 0, n = affixCount(base.slot as Slot, rarity); i < n && pool.length; i++) {
    const pi = prefer[i] ? pool.indexOf(prefer[i]) : -1;
    const k = pool.splice(pi >= 0 ? pi : Math.floor(0.5 * pool.length), 1)[0];
    if (pi >= 0) { fixed.push(k); continue; }
    random++;
    const left = (stats[k] || 0) - affixValue(k, lvl, RARITY_MULT[rarity] * (0.85 + 0.5 * 0.3));
    if (left > 0) stats[k] = left; else delete stats[k];
  }
  const item: Item = { ...it, stats, ...(m ? {} : { name: base.name }), ...(plus > 0 ? { plus } : {}) };
  return { item, fixed, random, pool: AFFIX_KEYS.filter((k) => !fixed.includes(k)) };
}

/** Слоты, у которых вид иконки зависит от класса (плотная броня / мантия / кожа). */
export const ICON_VARIANT_SLOTS = ["helmet", "armor", "boots"];
export const ICON_VARIANTS: ClassId[] = ["warrior", "mage", "ranger", "healer"];

/** Класс-принадлежность предмета: по classes, затем по главной характеристике, иначе по uid. */
export function iconVariant(it: Pick<Item, "base" | "stats" | "uid">): ClassId {
  const b = BASE_ITEMS[it.base];
  if (b?.classes?.length) return b.classes[0];
  const s = it.stats;
  const v: [ClassId, number][] = [["warrior", s.str || 0], ["mage", s.int || 0], ["ranger", s.agi || 0]];
  v.sort((a, c) => c[1] - a[1]);
  let h = 0;
  for (let i = 0; i < it.uid.length; i++) h = (h * 31 + it.uid.charCodeAt(i)) >>> 0;
  // у «интеллектуальных» вещей половина получает белую рясу лекаря
  if (v[0][1] > 0 && v[0][1] > v[1][1]) return v[0][0] === "mage" && h % 2 ? "healer" : v[0][0];
  return ICON_VARIANTS[h % 3];
}

/** Имя иконки: base.icon + вариант класса (для шлема/доспеха/сапог) + редкость. */
export function iconId(icon: string, variant: ClassId, rarity: Rarity): string {
  if (icon.startsWith("potion") || icon.startsWith("food_") || icon.startsWith("mat_") || icon === "gold") return icon;
  return ICON_VARIANT_SLOTS.includes(icon) ? `${icon}_${variant}_${rarity}` : `${icon}_${rarity}`;
}

/** Единственная точка выбора иконки предмета для всего UI. Перекованная вещь и «Оболочка» — иконкой своего вида (appearance). */
export function iconFor(it: Pick<Item, "base" | "stats" | "uid" | "rarity" | "unique"> & { legendary?: string; model?: string; appearance?: Appearance }): string {
  const ap = it.appearance;
  if (ap && BASE_ITEMS[ap.base] && BASE_ITEMS[ap.base].slot !== "consumable") {
    const b = BASE_ITEMS[ap.base];
    if (!ap.unique && !ap.legendary && !(ap.model && ITEM_MODELS[ap.model])) return iconId(b.icon, ap.variant ?? iconVariant({ base: ap.base, stats: {}, uid: it.uid }), ap.rarity);
    return iconFor({ base: ap.base, stats: {}, uid: it.uid, rarity: ap.rarity, unique: ap.unique, legendary: ap.legendary, model: ap.model });
  }
  // особая добыча боссов стартовых земель — своих иконок пока нет: иконка базы в цвете редкости
  if (it.unique && !Object.hasOwn(ZB_ITEMS, it.unique)) return "uq_" + it.unique;
  if (it.legendary) return "lg_" + it.legendary;
  // модель: своя иконка на каждую редкость (камень и кайма в цвете редкости, docs/art/gear.md 2.1)
  if (it.model && ITEM_MODELS[it.model]) return `im_${it.model}_${Math.max(0, Math.min(2, it.rarity | 0))}`; // легендарной редкости у моделей нет — r3 рисуется как r2
  const b = BASE_ITEMS[it.base];
  // расходники и ресурсы (зелья, еда, материалы, добыча биомов) рисуются одной иконкой без вариантов
  if (!b || b.slot === "consumable") return sealIconFor(b?.icon ?? "gold"); // печать скакуна гербового маунта — по фракции зрителя (задача 142)
  return iconId(b.icon, iconVariant(it), it.rarity);
}

/** Уникальные предметы боссов: фиксированное имя и набор характеристик. */
export interface UniqueDef {
  id: string;
  name: string;
  base: string;
  ilvl: number;
  stats: ItemStats;
  lore: string;
  /** Редкость вещи (по умолчанию эпическая): особая добыча боссов стартовых земель бывает и редкой. */
  rarity?: Rarity;
  /** Свойство из карточки (пока только текст): особая добыча боссов стартовых земель. */
  prop?: string;
}
export const UNIQUES: Record<string, UniqueDef> = {
  heartwood_staff: { id: "heartwood_staff", name: "Посох Сердцевины", base: "staff", ilvl: 15, stats: { int: 12, vit: 6, hp: 60 }, lore: "Ещё тёплый от соков Древнего Энта." },
  rootbreaker: { id: "rootbreaker", name: "Корнелом", base: "axe", ilvl: 15, stats: { str: 12, vit: 8, crit: 3 }, lore: "Топор, которым срубили первое дерево леса." },
  whisperwind: { id: "whisperwind", name: "Шёпот Ветра", base: "bow", ilvl: 15, stats: { agi: 12, crit: 5 }, lore: "Тетива из волокон живой лозы." },
  bark_helm: { id: "bark_helm", name: "Корона из коры", base: "helmet", ilvl: 15, stats: { vit: 10, hp: 80 }, lore: "Растёт вместе с владельцем." },
  hexed_ring: { id: "hexed_ring", name: "Кольцо Ведьмы", base: "ring", ilvl: 23, stats: { int: 14, agi: 8, crit: 4 }, lore: "Внутри шепчет чей-то голос." },
  bog_mantle: { id: "bog_mantle", name: "Плащ Топей", base: "armor", ilvl: 23, stats: { vit: 14, hp: 140, agi: 6 }, lore: "Пахнет тиной, но держит удар." },
  witch_eye: { id: "witch_eye", name: "Глаз Ведьмы", base: "amulet", ilvl: 23, stats: { int: 10, str: 10, crit: 5 }, lore: "Он всё ещё моргает." },
  swamp_treads: { id: "swamp_treads", name: "Болотоходы", base: "boots", ilvl: 23, stats: { agi: 12, vit: 10 }, lore: "Ни разу не промокли." },
  ashbringer: { id: "ashbringer", name: "Пеплоносец", base: "sword", ilvl: 31, stats: { str: 22, vit: 12, crit: 6 }, lore: "Клинок Повелителя Пепла. Тлеет вечно." },
  cinder_staff: { id: "cinder_staff", name: "Жезл Последнего Угля", base: "staff", ilvl: 31, stats: { int: 24, vit: 10, crit: 5 }, lore: "Внутри навечно заперт огонь." },
  phoenix_bow: { id: "phoenix_bow", name: "Лук Феникса", base: "bow", ilvl: 31, stats: { agi: 24, crit: 8 }, lore: "Стрелы вспыхивают в полёте." },
  ashen_crown: { id: "ashen_crown", name: "Пепельный венец", base: "helmet", ilvl: 31, stats: { str: 10, agi: 10, int: 10, vit: 10, hp: 120 }, lore: "Корона того, кто правил огнём." },
  // сезонные награды арены (по рангу в конце сезона)
  arena_bronze: { id: "arena_bronze", name: "Бронзовый медальон арены", base: "amulet", ilvl: 10, stats: { str: 2, agi: 2, int: 2, vit: 2, crit: 1 }, lore: "Награда за сезон арены. Ранг: Бронза." },
  arena_silver: { id: "arena_silver", name: "Серебряный медальон арены", base: "amulet", ilvl: 15, stats: { str: 4, agi: 4, int: 4, vit: 4, crit: 2 }, lore: "Награда за сезон арены. Ранг: Серебро." },
  arena_gold: { id: "arena_gold", name: "Золотой медальон арены", base: "amulet", ilvl: 20, stats: { str: 6, agi: 6, int: 6, vit: 6, crit: 3 }, lore: "Награда за сезон арены. Ранг: Золото." },
  arena_platinum: { id: "arena_platinum", name: "Платиновый медальон арены", base: "amulet", ilvl: 25, stats: { str: 8, agi: 8, int: 8, vit: 8, crit: 4 }, lore: "Награда за сезон арены. Ранг: Платина." },
  arena_diamond: { id: "arena_diamond", name: "Алмазный медальон арены", base: "amulet", ilvl: 30, stats: { str: 10, agi: 10, int: 10, vit: 10, crit: 5 }, lore: "Награда за сезон арены. Ранг: Алмаз." },
};

// особая добыча боссов стартовых земель (задача 136, data/zone-boss-loot.json): по формату UNIQUES, выдаёт server/src/game/rewards.ts
for (const z of Object.values(ZB_ITEMS)) UNIQUES[z.id] = { id: z.id, name: z.name, base: z.base, ilvl: z.ilvl, stats: z.stats as ItemStats, lore: z.lore, rarity: z.rarity as Rarity, prop: z.prop };

/** Уровень уникальной вещи по умолчанию: уровень босса, с которого она падает (data/world.json), иначе ilvl записи. */
export function uniqueLevel(id: string): number {
  for (const m of Object.values(MOBS)) if (m.uniques?.includes(id)) return m.level ?? UNIQUES[id].ilvl;
  return UNIQUES[id]?.ilvl ?? 1;
}

/** Добавочные характеристики уникальной вещи, пересчитанные с её ilvl на уровень lvl (по кривой аффиксов). */
function scaleUniqueStats(st: ItemStats, from: number, to: number): ItemStats {
  const out: ItemStats = {};
  for (const [k, v] of Object.entries(st)) {
    const key = k as ItemStatKey, f = (l: number) => affixValue(key, l, 1);
    out[key] = Math.max(1, Math.round((v as number) * f(to) / f(from)));
  }
  return out;
}

/**
 * Уникальная вещь уровня ilvl (по умолчанию — уровень своего босса, uniqueLevel): основные характеристики базы по ilvl,
 * добавочные — пересчёт записи UNIQUES с её ilvl. Требование — ilvl − 3, без потолка.
 */
export function makeUnique(id: string, ilvl: number = uniqueLevel(id)): Item {
  const u = UNIQUES[id], lvl = Math.max(1, Math.round(ilvl));
  const rar = u.rarity ?? Rarity.Epic;
  const base = makeItem(u.base, lvl, rar, () => 0.5);
  const stats: ItemStats = {};
  const main = BASE_ITEMS[u.base].roll!(lvl);
  for (const [k, v] of Object.entries(main)) stats[k as ItemStatKey] = Math.round((v as number) * (k.startsWith("dmg") || k === "armor" ? RARITY_MULT[rar] : 1));
  for (const [k, v] of Object.entries(scaleUniqueStats(u.stats, u.ilvl, lvl))) stats[k as ItemStatKey] = (stats[k as ItemStatKey] || 0) + (v as number);
  return { ...base, name: u.name, stats, unique: id, ilvl: lvl, req: Math.max(1, lvl - 3), bound: true };
}

/** Уникальные предметы боссов и награды арены привязаны к персонажу. */
export function isBound(it: Pick<Item, "base" | "bound" | "unique" | "legendary">): boolean {
  // привязанные детали маунтов (перо феникса, Печать гладиатора) — всегда, как бы ни попали в сумку
  const part = it.base.startsWith("mpart_") ? (mountData.parts as Record<string, { bound?: boolean }>)[it.base.slice(6)] : undefined;
  return !!it.bound || !!it.unique || !!it.legendary || !!part?.bound;
}

export function itemValue(it: Item): number {
  const b = BASE_ITEMS[it.base];
  if (b.slot === "consumable") return Math.floor((b.price || 10) / IR.value.consumableDiv);
  return Math.round((IR.value.base + it.ilvl * IR.value.perLevel) * (1 + it.rarity * IR.value.rarityStep) * (it.unique ? IR.value.uniqueMul : 1));
}

export function canEquip(it: Item, cls: ClassId, level: number): string | null {
  const b = BASE_ITEMS[it.base];
  if (!b || b.slot === "consumable") return "Это нельзя надеть";
  if (b.classes && !b.classes.includes(cls)) return "Не подходит вашему классу";
  if (it.req > level) return `Нужен ${it.req} уровень`;
  return null;
}

/** Выбор редкости: для обычных мобов редкое — 20%, эпическое — 3%. */
export function rollRarity(rand: () => number, bonus = 0): Rarity {
  const r = rand();
  if (r < IR.rarityChance.epic + bonus * IR.rarityChance.bonusEpicShare) return Rarity.Epic;
  if (r < IR.rarityChance.epic + IR.rarityChance.rare + bonus) return Rarity.Rare;
  return Rarity.Common;
}

/**
 * Как вещь выглядит на герое: у перекованной — база, редкость, модель, легендарка и лохмотья вида донора;
 * заточка (plus) — всегда своя (свечение заточки от настоящей вещи, docs/art/gear.md).
 */
export function lookItem(it: Item): Item {
  const ap = it.appearance;
  if (!ap || it.base === SHELL_BASE || !BASE_ITEMS[ap.base]) return it;
  return { ...it, base: ap.base, rarity: ap.rarity, model: ap.model, legendary: ap.legendary, unique: ap.unique, rags: ap.rags };
}

/** Название с уровнем улучшения: «Лук Феникса +7». */
export const itemName = (it: Pick<Item, "name" | "plus">): string => (it.plus ? `${it.name} +${it.plus}` : it.name);

/** Характеристики с учётом улучшения: +PLUS_BONUS (data/upgrade.json bonusPerLevel) за уровень для урона, брони и главной характеристики. */
export function effStats(it: Pick<Item, "stats" | "plus">): ItemStats {
  const plus = it.plus || 0;
  if (!plus) return it.stats;
  const out: ItemStats = { ...it.stats };
  let main: ItemStatKey | null = null;
  for (const k of ["str", "agi", "int", "vit"] as ItemStatKey[]) if (out[k] && (!main || out[k]! > out[main]!)) main = k;
  for (const k of Object.keys(out) as ItemStatKey[]) {
    if (k === "dmgMin" || k === "dmgMax" || k === "armor" || k === main) out[k] = out[k]! + Math.ceil(out[k]! * PLUS_BONUS * plus);
  }
  return out;
}

/** Нормальная цена продажи с учётом улучшения (+12% за уровень), без поправки на спрос. */
export function baseSellValue(it: Item): number {
  return itemValue(it) * (1 + IR.value.plusSellStep * (it.plus || 0));
}
