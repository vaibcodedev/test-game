/**
 * Иконки и вид вещей без сервера: каждая вещь gear147 (data/gear147.json, data/items-147.json) с иконкой в манифесте;
 * iconFor не возвращает несуществующий файл ни для какого предмета (базы всех редкостей и вариантов, модели data/items.json
 * и items-147, уникальные, легендарки, оболочки и перекованные вещи); иконка-пустышка (slotGhost) у каждого слота и класса.
 * Манифест — client/public/assets/manifest.json (icons). Запуск: npx tsx tests/unit/gear-visual.ts
 */
import { BASE_ITEMS, ICON_VARIANTS, ITEM_MODELS, OFFHAND_CLASSES, SLOTS, UNIQUES, iconFor, iconId, makeItem, makeUnique, Rarity, slotGhost, type Item, type Slot } from "../../shared/items";
import { LEGENDARIES, makeLegendary } from "../../shared/legendary";
import { CLASSES, type ClassId } from "../../shared/classes";
import { familyOf, makeShell, ownAppearance } from "../../shared/transmog";
import man from "../../client/public/assets/manifest.json";
import gear147 from "../../data/gear147.json";
import items147 from "../../data/items-147.json";
import live from "../../data/hero-b-live.json";
import catalog from "../../data/items.json";
import { assert, done, knownFail, section, test } from "./lib";

const ICONS = new Set(man.icons as string[]);
const CLS = Object.keys(CLASSES) as ClassId[];
const LIVE = live as unknown as { sets: string[]; models: Record<string, string>; slotMap: Record<string, string> };
type M147 = { id: string; cat: string; set?: string };
const M147 = items147.models as M147[];
const SETS = gear147.sets as Record<string, { items?: Record<string, unknown> }>;
/** Слот основы Б → слот сервера (обратный slotMap). */
const SERVER_SLOT = Object.fromEntries(Object.entries(LIVE.slotMap).map(([s, b]) => [b, s])) as Record<string, Slot>;
const missing = (list: [string, string][]) => list.filter(([icon]) => !ICONS.has(icon)).map(([icon, what]) => `${what} → ${icon}`);
const withModel = (id: string, r: number): Item => ({ ...makeItem(ITEM_MODELS[id].cat, ITEM_MODELS[id].lvl, r as Rarity), model: id });
const isShieldModel = (m: M147) => BASE_ITEMS[m.cat]?.slot === "offhand";

// ---------------------------------------------------------------- gear147
section("Вид: вещи gear147 и героя Б");

await test("манифест иконок прочитан и не пуст", () => {
  assert.ok(ICONS.size > 500, `иконок ${ICONS.size}`);
});

await test("сеты героя Б с предметами: у каждой вещи сета (gear147.json items) есть предмет items-147 своего слота", () => {
  for (const set of LIVE.sets.filter((x) => M147.some((m) => m.set === x))) {
    const s = SETS[set];
    assert.ok(s, `сета ${set} нет в gear147.json`);
    for (const slot147 of Object.keys(s.items ?? {})) {
      const srv = SERVER_SLOT[slot147];
      assert.ok(srv, `${set}.${slot147}: слот не сопоставлен серверу (slotMap)`);
      assert.ok(M147.find((x) => x.set === set && BASE_ITEMS[x.cat]?.slot === srv), `${set}.${slot147}: нет предмета в items-147.json`);
    }
  }
  for (const set of LIVE.sets) assert.ok(SETS[set], `сета ${set} нет в gear147.json`);
});

await test("B65 (починен 2026-10-31): у каждого сета gear147 есть выдаваемые вещи в items-147.json", () => {
  const bare = Object.keys(SETS).filter((s) => !M147.some((m) => m.set === s));
  assert.deepEqual(bare, []);
});

await test("каждый предмет items-147: база существует, слот базы рисуется на герое Б, модель в ITEM_MODELS", () => {
  for (const m of M147) {
    assert.ok(BASE_ITEMS[m.cat], `${m.id}: база ${m.cat}`);
    assert.ok(LIVE.slotMap[BASE_ITEMS[m.cat].slot], `${m.id}: слот ${BASE_ITEMS[m.cat].slot}`);
    assert.ok(ITEM_MODELS[m.id], m.id);
  }
});

await test("иконки предметов items-147 (кроме щитов) — в манифесте на каждой редкости 0…3", () => {
  const list: [string, string][] = [];
  for (const m of M147.filter((x) => !isShieldModel(x))) for (const r of [0, 1, 2, 3]) list.push([iconFor(withModel(m.id, r)), `${m.id} r${r}`]);
  assert.deepEqual(missing(list), []);
});

await test("B60 (починен 2026-10-31): у щитов героя Б (hb147_shield_*) есть иконки im_*_0…2 на диске и в манифесте", () => {
  const list: [string, string][] = [];
  for (const m of M147.filter(isShieldModel)) for (const r of [0, 1, 2]) list.push([iconFor(withModel(m.id, r)), `${m.id} r${r}`]);
  assert.deepEqual(missing(list), []);
});

// ---------------------------------------------------------------- iconFor по всем предметам
section("Вид: iconFor — только существующие иконки");

await test("базы снаряжения: каждая редкость 0…2 и каждый вариант класса у старых шлема, доспеха, сапог", () => {
  const list: [string, string][] = [];
  for (const b of Object.values(BASE_ITEMS).filter((x) => x.slot !== "consumable")) {
    for (const r of [0, 1, 2]) list.push([iconFor(makeItem(b.id, 20, r as Rarity)), `${b.id} r${r}`]);
    if (["helmet", "armor", "boots"].includes(b.id)) for (const v of ICON_VARIANTS) for (const r of [0, 1, 2]) list.push([iconId(b.icon, v, r as Rarity), `${b.id} ${v} r${r}`]);
  }
  assert.deepEqual(missing(list), []);
});

await test("расходники, материалы, ресурсы, еда, печати, детали маунтов (кроме «Оболочки» — у неё иконка вида)", () => {
  const list: [string, string][] = [];
  for (const b of Object.values(BASE_ITEMS).filter((x) => x.slot === "consumable" && x.id !== "tm_shell")) list.push([iconFor(makeItem(b.id, 1, 0)), b.id]);
  assert.deepEqual(missing(list), []);
});

await test(`модели data/items.json (${catalog.models.length}) и items-147 — каждая редкость 0…3 (легендарная рисуется как эпическая)`, () => {
  const list: [string, string][] = [];
  for (const m of Object.values(ITEM_MODELS)) {
    for (const r of [0, 1, 2, 3]) list.push([iconFor(withModel(m.id, r)), `${m.id} r${r}`]);
  }
  assert.deepEqual(missing(list), []);
  assert.equal(iconFor(withModel(Object.keys(ITEM_MODELS)[0], 3)), iconFor(withModel(Object.keys(ITEM_MODELS)[0], 2)));
});

await test(`уникальные (${Object.keys(UNIQUES).length}) и легендарки (${Object.keys(LEGENDARIES).length})`, () => {
  const list: [string, string][] = [];
  for (const id of Object.keys(UNIQUES)) list.push([iconFor(makeUnique(id)), `уникальная ${id}`]);
  for (const id of Object.keys(LEGENDARIES)) list.push([iconFor(makeLegendary(id)), `легендарка ${id}`]);
  assert.deepEqual(missing(list), []);
});

await test("оболочки и перекованные вещи со всех баз, моделей, уникальных и легендарок: иконка вида есть в манифесте", () => {
  const donors: Item[] = [];
  for (const b of Object.values(BASE_ITEMS).filter((x) => familyOf(x.id))) for (const r of [0, 1, 2]) donors.push(makeItem(b.id, 30, r as Rarity));
  for (const m of Object.values(ITEM_MODELS)) if (familyOf(m.cat) && !M147.some((x) => x.id === m.id && isShieldModel(x))) donors.push(withModel(m.id, 2));
  for (const id of Object.keys(UNIQUES)) donors.push(makeUnique(id));
  for (const id of Object.keys(LEGENDARIES)) donors.push(makeLegendary(id));
  const list: [string, string][] = [];
  for (const d of donors.filter((x) => familyOf(x.base))) {
    const sh = makeShell(d);
    list.push([iconFor(sh), `оболочка ${d.model ?? d.legendary ?? d.unique ?? d.base}`]);
    const target = { ...makeItem(d.base, 5, 0), appearance: ownAppearance(d) };
    list.push([iconFor(target), `вид ${d.model ?? d.legendary ?? d.unique ?? d.base}`]);
    assert.equal(iconFor(target), iconFor(sh), "иконка перекованной вещи ≠ иконке оболочки");
  }
  assert.deepEqual(missing(list), []);
});

await test("iconFor устойчив к мусору: неизвестная база, неизвестная модель, вид с неизвестной базой — строка, без исключений", () => {
  const junk = [
    { base: "нет", stats: {}, uid: "x", rarity: 0 },
    { base: "sword", stats: {}, uid: "x", rarity: 1, model: "нет" },
    { base: "sword", stats: {}, uid: "x", rarity: 1, appearance: { base: "нет", name: "x", rarity: 1 } },
    { base: "sword", stats: {}, uid: "x", rarity: 1, legendary: "нет" },
  ];
  for (const it of junk) assert.equal(typeof iconFor(it as never), "string");
  assert.ok(ICONS.has(iconFor({ base: "sword", stats: {}, uid: "x", rarity: 1, model: "нет" })), "неизвестная модель — иконка базы");
});

// ---------------------------------------------------------------- пустышки слотов
section("Вид: иконки-пустышки слотов");

await test(`slotGhost: у каждого класса (${CLS.length}) и слота (${SLOTS.length}) — база этого слота и иконка в манифесте`, () => {
  const list: [string, string][] = [];
  for (const c of CLS) for (const s of SLOTS) {
    const b = slotGhost(c, s);
    assert.ok(BASE_ITEMS[b], `${c}/${s}: база ${b}`);
    assert.equal(BASE_ITEMS[b].slot, s, `${c}/${s}: база ${b} другого слота`);
    list.push([iconFor({ base: b, stats: {}, uid: "slot", rarity: 0 }), `${c}/${s}`]);
  }
  assert.deepEqual(missing(list), []);
});

await test("пустышки по классу: оружие — стартовое класса, наплечники и перчатки — материала класса, вторая рука — щит/сфера/книга", () => {
  for (const c of CLS) {
    assert.equal(slotGhost(c, "weapon"), CLASSES[c].startWeapon);
    for (const s of ["shoulders", "gloves"] as Slot[]) {
      const b = BASE_ITEMS[slotGhost(c, s)];
      assert.ok(!b.classes || b.classes.includes(c), `${c}/${s}: ${b.id} классу не подходит`);
    }
    if (OFFHAND_CLASSES.includes(c)) {
      const b = BASE_ITEMS[slotGhost(c, "offhand")];
      assert.ok(!b.classes || b.classes.includes(c), `${c}/offhand: ${b.id}`);
    }
  }
});

done();
