import { CLASSES, type ClassId, type StatKey } from "./classes";
import { FOOD } from "./food";
import { RESOURCES } from "./biomes";
import { MATERIALS, PLUS_BONUS } from "./upgrade";
import catalog from "../data/items.json";

export type Slot = "weapon" | "offhand" | "helmet" | "armor" | "boots" | "cloak" | "ring" | "amulet";
export const SLOTS: Slot[] = ["weapon", "offhand", "helmet", "armor", "boots", "cloak", "ring", "amulet"];
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
  armor: "Доспех",
  boots: "Сапоги",
  cloak: "Плащ",
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
}

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
}

const r1 = (v: number) => Math.round(v);
const STR_MELEE: ClassId[] = ["warrior", "deathknight", "reaver"];
const CASTERS: ClassId[] = ["mage", "healer", "warlock", "bloodweaver"];
const LEATHER: ClassId[] = ["rogue", "ranger", "darkranger", "reaver"];
/**
 * Базы (категории) экипировки. Кривая основных характеристик — BALANCE.md «Экипировка»: урон и броня линейны по ilvl,
 * двуручное ≈ ×1.5 одноручного, у кожи и ткани часть брони заменена главной характеристикой.
 */
export const BASE_ITEMS: Record<string, BaseItem> = {
  sword: { id: "sword", name: "Меч", typeName: "Одноручный меч", slot: "weapon", icon: "sword", weaponType: "sword", classes: ["warrior", "deathknight"], roll: (l) => ({ dmgMin: r1(4 + l * 1.8), dmgMax: r1(8 + l * 2.6) }) },
  greatsword: { id: "greatsword", name: "Двуручный меч", typeName: "Двуручный меч", slot: "weapon", icon: "greatsword", weaponType: "sword", hands: 2, classes: STR_MELEE, rec: ["deathknight", "reaver"], roll: (l) => ({ dmgMin: r1(6 + l * 2.7), dmgMax: r1(12 + l * 3.9) }) },
  twinblades: { id: "twinblades", name: "Парные мечи", typeName: "Парные мечи", slot: "weapon", icon: "twinblades", weaponType: "dagger", classes: ["rogue", "reaver"], roll: (l) => ({ dmgMin: r1(4 + l * 1.5), dmgMax: r1(7 + l * 2.2), agi: r1(1 + l * 0.1) }) },
  axe: { id: "axe", name: "Топор", typeName: "Топор", slot: "weapon", icon: "axe", weaponType: "axe", classes: ["warrior", "deathknight", "reaver"], roll: (l) => ({ dmgMin: r1(3 + l * 1.5), dmgMax: r1(10 + l * 3.1) }) },
  greataxe: { id: "greataxe", name: "Секира", typeName: "Двуручный топор", slot: "weapon", icon: "greataxe", weaponType: "axe", hands: 2, classes: ["deathknight", "reaver"], roll: (l) => ({ dmgMin: r1(5 + l * 2.2), dmgMax: r1(15 + l * 4.6) }) },
  mace: { id: "mace", name: "Булава", typeName: "Булава", slot: "weapon", icon: "mace", weaponType: "mace", classes: ["warrior", "deathknight"], roll: (l) => ({ dmgMin: r1(5 + l * 1.6), dmgMax: r1(9 + l * 2.7) }) },
  hammer: { id: "hammer", name: "Молот", typeName: "Молот", slot: "weapon", icon: "hammer", weaponType: "mace", hands: 2, classes: STR_MELEE, rec: ["deathknight", "reaver"], roll: (l) => ({ dmgMin: r1(8 + l * 2.4), dmgMax: r1(13 + l * 4.0) }) },
  spear: { id: "spear", name: "Копьё", typeName: "Копьё", slot: "weapon", icon: "spear", weaponType: "spear", classes: ["warrior", "deathknight"], roll: (l) => ({ dmgMin: r1(4 + l * 1.7), dmgMax: r1(8 + l * 2.5), vit: r1(1 + l * 0.15) }) },
  scythe: { id: "scythe", name: "Коса", typeName: "Коса", slot: "weapon", icon: "scythe", weaponType: "scythe", hands: 2, classes: ["deathknight", "reaver"], roll: (l) => ({ dmgMin: r1(6 + l * 2.5), dmgMax: r1(13 + l * 4.0) }) },
  shield: { id: "shield", name: "Щит", typeName: "Щит", slot: "offhand", icon: "shield", classes: ["warrior", "deathknight"], roll: (l) => ({ armor: r1(3 + l * 2), hp: r1(l * 1.5) }) },
  orb: { id: "orb", name: "Сфера", typeName: "Сфера", slot: "offhand", icon: "orb", classes: CASTERS, rec: ["mage", "warlock"], roll: (l) => ({ int: r1(1 + l * 0.2), crit: r1(1 + l * 0.04) }) },
  tome: { id: "tome", name: "Книга", typeName: "Книга", slot: "offhand", icon: "tome", classes: CASTERS, rec: ["healer", "bloodweaver"], roll: (l) => ({ int: r1(1 + l * 0.15), hp: r1(4 + l * 2) }) },
  staff: { id: "staff", name: "Посох", typeName: "Посох", slot: "weapon", icon: "staff", weaponType: "staff", hands: 2, classes: CASTERS, rec: ["mage", "warlock"], roll: (l) => ({ dmgMin: r1(4 + l * 1.8), dmgMax: r1(8 + l * 2.8), int: r1(1 + l * 0.35) }) },
  scepter: { id: "scepter", name: "Жезл", typeName: "Жезл", slot: "weapon", icon: "scepter", weaponType: "scepter", classes: CASTERS, rec: ["healer", "bloodweaver"], roll: (l) => ({ dmgMin: r1(4 + l * 1.6), dmgMax: r1(7 + l * 2.4), int: r1(1 + l * 0.25) }) },
  dagger: { id: "dagger", name: "Кинжалы", typeName: "Кинжалы", slot: "weapon", icon: "dagger", weaponType: "dagger", classes: ["rogue", "reaver"], roll: (l) => ({ dmgMin: r1(3 + l * 1.3), dmgMax: r1(5 + l * 1.9), agi: r1(1 + l * 0.2) }) },
  bow: { id: "bow", name: "Лук", typeName: "Лук", slot: "weapon", icon: "bow", weaponType: "bow", hands: 2, classes: ["ranger", "darkranger"], roll: (l) => ({ dmgMin: r1(4 + l * 1.7), dmgMax: r1(7 + l * 2.5) }) },
  crossbow: { id: "crossbow", name: "Арбалет", typeName: "Арбалет", slot: "weapon", icon: "crossbow", weaponType: "bow", hands: 2, classes: ["ranger", "darkranger"], roll: (l) => ({ dmgMin: r1(5 + l * 1.95), dmgMax: r1(7 + l * 2.3) }) },
  // старые универсальные базы: остаются валидными для сохранений и стартовых вещей
  helmet: { id: "helmet", name: "Шлем", typeName: "Шлем", slot: "helmet", icon: "helmet", roll: (l) => ({ armor: r1(2 + l * 1.6) }) },
  armor: { id: "armor", name: "Доспех", typeName: "Доспех", slot: "armor", icon: "armor", roll: (l) => ({ armor: r1(4 + l * 3), hp: r1(l * 2) }) },
  boots: { id: "boots", name: "Сапоги", typeName: "Сапоги", slot: "boots", icon: "boots", roll: (l) => ({ armor: r1(1 + l * 1.2) }) },
  plate_helm: { id: "plate_helm", name: "Шлем", typeName: "Латный шлем", slot: "helmet", icon: "plate_helm", armorType: "plate", classes: STR_MELEE, roll: (l) => ({ armor: r1(3 + l * 2.0), vit: r1(1 + l * 0.06) }) },
  leather_helm: { id: "leather_helm", name: "Капюшон", typeName: "Кожаный шлем", slot: "helmet", icon: "leather_helm", armorType: "leather", classes: LEATHER, roll: (l) => ({ armor: r1(2 + l * 1.4), agi: r1(1 + l * 0.1) }) },
  cloth_helm: { id: "cloth_helm", name: "Колпак", typeName: "Тканевый убор", slot: "helmet", icon: "cloth_helm", armorType: "cloth", classes: CASTERS, roll: (l) => ({ armor: r1(1 + l * 1.0), int: r1(1 + l * 0.08) }) },
  plate_armor: { id: "plate_armor", name: "Латы", typeName: "Латы", slot: "armor", icon: "plate_armor", armorType: "plate", classes: STR_MELEE, roll: (l) => ({ armor: r1(5 + l * 3.8), hp: r1(l * 2), vit: r1(1 + l * 0.12) }) },
  leather_armor: { id: "leather_armor", name: "Куртка", typeName: "Кожаный доспех", slot: "armor", icon: "leather_armor", armorType: "leather", classes: LEATHER, roll: (l) => ({ armor: r1(4 + l * 2.6), hp: r1(l * 1.5), agi: r1(1 + l * 0.2) }) },
  cloth_armor: { id: "cloth_armor", name: "Мантия", typeName: "Мантия", slot: "armor", icon: "cloth_armor", armorType: "cloth", classes: CASTERS, roll: (l) => ({ armor: r1(2 + l * 1.8), hp: r1(l * 2), int: r1(1 + l * 0.15) }) },
  plate_boots: { id: "plate_boots", name: "Сабатоны", typeName: "Латные сапоги", slot: "boots", icon: "plate_boots", armorType: "plate", classes: STR_MELEE, roll: (l) => ({ armor: r1(2 + l * 1.5), vit: r1(1 + l * 0.05) }) },
  leather_boots: { id: "leather_boots", name: "Ботинки", typeName: "Кожаные сапоги", slot: "boots", icon: "leather_boots", armorType: "leather", classes: LEATHER, roll: (l) => ({ armor: r1(1 + l * 1.0), agi: r1(1 + l * 0.08) }) },
  cloth_boots: { id: "cloth_boots", name: "Туфли", typeName: "Тканевые туфли", slot: "boots", icon: "cloth_boots", armorType: "cloth", classes: CASTERS, roll: (l) => ({ armor: r1(1 + l * 0.7), int: r1(1 + l * 0.06) }) },
  // плащ: отдельный слот, общий для всех классов; броня + аффиксы модели (BALANCE.md «Экипировка»)
  cloak: { id: "cloak", name: "Плащ", typeName: "Плащ", slot: "cloak", icon: "cloak", roll: (l) => ({ armor: r1(1 + l * 1.1) }) },
  ring: { id: "ring", name: "Кольцо", typeName: "Кольцо", slot: "ring", icon: "ring", roll: () => ({}) },
  amulet: { id: "amulet", name: "Амулет", typeName: "Амулет", slot: "amulet", icon: "amulet", roll: (l) => ({ hp: r1(6 + l * 3) }) },
  hp_potion: { id: "hp_potion", name: "Зелье здоровья", slot: "consumable", icon: "potion_red", price: 15, stack: 20 },
  mp_potion: { id: "mp_potion", name: "Зелье маны", slot: "consumable", icon: "potion_blue", price: 15, stack: 20 },
  ...Object.fromEntries(Object.values(MATERIALS).map((m) => [m.id, { id: m.id, name: m.name, slot: "consumable", icon: m.icon, price: m.price, stack: 99 } as BaseItem])),
  ...Object.fromEntries(Object.values(RESOURCES).map((r) => [r.id, { id: r.id, name: r.name, slot: "consumable", icon: r.icon, price: r.price, stack: 99 } as BaseItem])),
  ...Object.fromEntries(Object.values(FOOD).map((d) => [`food_${d.id}`, { id: `food_${d.id}`, name: d.name, slot: "consumable", icon: d.icon, price: d.price, stack: 20 } as BaseItem])),
};
export const EQUIP_BASES = Object.values(BASE_ITEMS).filter((b) => b.slot !== "consumable").map((b) => b.id);
export const isTwoHanded = (baseId: string | undefined): boolean => !!baseId && BASE_ITEMS[baseId]?.hands === 2;

// ---------------- каталог моделей (data/items.json) ----------------
/** Параметры вида модели: силуэт (архетип), материалы (ключи ITEM_PALETTES), украшение, богатство отделки. */
export interface ModelLook {
  shape: string; mat: string; trim: string; cloth?: string; hide?: string; gem?: string; haft?: string;
  /** Богатство отделки по ярусу 0..3 (больше рун, камней, инкрустации). Свечения нет: docs/gear-visuals.md 2.1. */
  deco?: string; rich?: number; fx?: string; guard?: string; pommel?: string;
}
export interface ItemModel {
  id: string; name: string; cat: string; lvl: number; fac: string; cls: ClassId[];
  affix: ItemStatKey[]; g?: number; look: ModelLook;
}
/** Палитры материалов, тканей и камней: 5 тонов от тёмного к светлому. */
export const ITEM_PALETTES: Record<string, string[]> = catalog.palettes as Record<string, string[]>;
export const ITEM_MODELS: Record<string, ItemModel> = Object.fromEntries((catalog.models as unknown as ItemModel[]).filter((m) => BASE_ITEMS[m.cat]).map((m) => [m.id, m]));
const MODELS_BY_CAT: Record<string, ItemModel[]> = {};
for (const m of Object.values(ITEM_MODELS)) (MODELS_BY_CAT[m.cat] ??= []).push(m);
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

/** Категории (базы с моделями), которые может надеть класс. */
export function lootCategories(cls: ClassId): BaseItem[] {
  return Object.values(BASE_ITEMS).filter((b) => b.slot !== "consumable" && MODELS_BY_CAT[b.id]?.length && (!b.classes || b.classes.includes(cls)));
}

/**
 * Добыча с мобов и товар торговцев: с шансом weaponChance — оружие класса, иначе слот брони/бижутерии/второй руки
 * (слот равновероятно, внутри слота — по рекомендации), затем модель по уровню. Характеристики — makeItem.
 */
export function makeLoot(cls: ClassId, ilvl: number, rarity: Rarity, rand: () => number = Math.random, weaponChance = 0.3, faction?: string): Item {
  const cats = lootCategories(cls);
  const wantWeapon = rand() < weaponChance;
  let pool = cats.filter((b) => (b.slot === "weapon") === wantWeapon);
  if (!pool.length) pool = cats;
  if (!wantWeapon) {
    const slots = [...new Set(pool.map((b) => b.slot))];
    const slot = slots[Math.floor(rand() * slots.length)];
    pool = pool.filter((b) => b.slot === slot);
  }
  const base = weighted(pool.map((b) => [b, b.rec ? (b.rec.includes(cls) ? 3 : 1) : 2] as [BaseItem, number]), rand)!;
  const m = rollModel(base.id, ilvl, cls, faction ?? CLASSES[cls]?.faction, rand);
  return m ? makeModelItem(m.id, ilvl, rarity, rand) : makeItem(base.id, ilvl, rarity, rand);
}

/** Для админ-панели: предмет модели для предпросмотра. Без разброса (rand = 0.5): настоящий предмет отличается значениями аффиксов в пределах ±15%. */
export function previewModelItem(id: string, ilvl: number, rarity: Rarity, plus = 0): Item | null {
  if (!ITEM_MODELS[id]) return null;
  const it = makeModelItem(id, ilvl, rarity, () => 0.5);
  return plus > 0 ? { ...it, plus } : it;
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
export const itemModelInfo = (id: string): ItemModelInfo | undefined => (ITEM_MODELS[id] ? infoOf(ITEM_MODELS[id]) : undefined);

const AFFIX_KEYS: ItemStatKey[] = ["str", "agi", "int", "vit", "hp", "crit"];
function affixValue(k: ItemStatKey, ilvl: number, mult: number): number {
  switch (k) {
    case "hp": return Math.round((8 + ilvl * 4) * mult);
    case "crit": return Math.max(1, Math.round((1 + ilvl * 0.12) * mult));
    default: return Math.max(1, Math.round((1 + ilvl * 0.4) * mult));
  }
}
const SUFFIX: Record<string, string> = { str: "силы", agi: "ловкости", int: "мудрости", vit: "стойкости", hp: "жизни", crit: "точности" };
const EPIC_PREFIX = ["Древний", "Пылающий", "Звёздный", "Проклятый", "Королевский", "Сумеречный", "Громовой"];
const EPIC_PREFIX_N = ["Древнее", "Пылающее", "Звёздное", "Проклятое", "Королевское", "Сумеречное", "Громовое"];
const NEUTER = new Set(["ring", "spear"]);
const PLURAL = new Set(["boots", "twinblades", "dagger", "plate_armor", "plate_boots", "leather_boots", "cloth_boots"]);
const FEM = new Set(["mace", "greataxe", "scythe", "orb", "tome", "cloth_armor", "leather_armor"]);
const EPIC_PREFIX_F = ["Древняя", "Пылающая", "Звёздная", "Проклятая", "Королевская", "Сумеречная", "Громовая"];
const EPIC_PREFIX_P = ["Древние", "Пылающие", "Звёздные", "Проклятые", "Королевские", "Сумеречные", "Громовые"];

let uidCounter = 0;
export function newUid(): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return Date.now().toString(36) + "-" + uidCounter.toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
}

export const RARITY_MULT = [1, 1.2, 1.45, 1.7];

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
  let affixes = rarity === Rarity.Common ? 0 : rarity === Rarity.Rare ? 1 : rarity === Rarity.Epic ? 3 : 4;
  if (base.slot === "ring" || base.slot === "amulet") affixes += 1;
  const pool = [...AFFIX_KEYS];
  const picked: ItemStatKey[] = [];
  for (let i = 0; i < affixes && pool.length; i++) {
    const pi = prefer[i] ? pool.indexOf(prefer[i]) : -1;
    const k = pool.splice(pi >= 0 ? pi : Math.floor(rand() * pool.length), 1)[0];
    picked.push(k);
    stats[k] = (stats[k] || 0) + affixValue(k, ilvl, mult * (0.85 + rand() * 0.3));
  }
  let name = base.name;
  if (rarity === Rarity.Rare && picked.length) name = `${base.name} ${SUFFIX[picked[0]]}`;
  if (rarity === Rarity.Epic) {
    const i = Math.floor(rand() * EPIC_PREFIX.length);
    const pre = PLURAL.has(baseId) ? EPIC_PREFIX_P[i] : FEM.has(baseId) ? EPIC_PREFIX_F[i] : NEUTER.has(baseId) ? EPIC_PREFIX_N[i] : EPIC_PREFIX[i];
    name = `${pre} ${base.name.toLowerCase()}${picked[0] ? " " + SUFFIX[picked[0]] : ""}`;
  }
  return { uid: newUid(), base: baseId, name, rarity, ilvl, req: Math.max(1, ilvl - 2), stats };
}

/** Сколько аффиксов получает предмет слота и редкости (то же правило, что в makeItem; сверяется тестом tests/admin.ts). */
export const affixCount = (slot: Slot, rarity: Rarity): number => (rarity === Rarity.Common ? 0 : rarity === Rarity.Rare ? 1 : rarity === Rarity.Epic ? 3 : 4) + (slot === "ring" || slot === "amulet" ? 1 : 0);

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

/** Единственная точка выбора иконки предмета для всего UI. */
export function iconFor(it: Pick<Item, "base" | "stats" | "uid" | "rarity" | "unique"> & { legendary?: string; model?: string }): string {
  if (it.unique) return "uq_" + it.unique;
  if (it.legendary) return "lg_" + it.legendary;
  // модель: своя иконка на каждую редкость (камень и кайма в цвете редкости, docs/gear-visuals.md 2.1)
  if (it.model && ITEM_MODELS[it.model]) return `im_${it.model}_${Math.max(0, Math.min(2, it.rarity | 0))}`; // легендарной редкости у моделей нет — r3 рисуется как r2
  const b = BASE_ITEMS[it.base];
  // расходники и ресурсы (зелья, еда, материалы, добыча биомов) рисуются одной иконкой без вариантов
  if (!b || b.slot === "consumable") return b?.icon ?? "gold";
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

export function makeUnique(id: string): Item {
  const u = UNIQUES[id];
  const base = makeItem(u.base, u.ilvl, Rarity.Epic, () => 0.5);
  const stats: ItemStats = {};
  const main = BASE_ITEMS[u.base].roll!(u.ilvl);
  for (const [k, v] of Object.entries(main)) stats[k as ItemStatKey] = Math.round((v as number) * (k.startsWith("dmg") || k === "armor" ? RARITY_MULT[Rarity.Epic] : 1));
  for (const [k, v] of Object.entries(u.stats)) stats[k as ItemStatKey] = (stats[k as ItemStatKey] || 0) + (v as number);
  return { ...base, name: u.name, stats, unique: id, req: Math.min(30, u.ilvl - 3), bound: true };
}

/** Уникальные предметы боссов и награды арены привязаны к персонажу. */
export function isBound(it: Item): boolean {
  return !!it.bound || !!it.unique || !!it.legendary;
}

export function itemValue(it: Item): number {
  const b = BASE_ITEMS[it.base];
  if (b.slot === "consumable") return Math.floor((b.price || 10) / 3);
  return Math.round((4 + it.ilvl * 2.5) * (1 + it.rarity * 1.5) * (it.unique ? 3 : 1));
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
  if (r < 0.03 + bonus * 0.5) return Rarity.Epic;
  if (r < 0.23 + bonus) return Rarity.Rare;
  return Rarity.Common;
}

/** Название с уровнем улучшения: «Лук Феникса +7». */
export const itemName = (it: Pick<Item, "name" | "plus">): string => (it.plus ? `${it.name} +${it.plus}` : it.name);

/** Характеристики с учётом улучшения: +6% базы за уровень для урона, брони и главной характеристики. */
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
  return itemValue(it) * (1 + 0.12 * (it.plus || 0));
}
