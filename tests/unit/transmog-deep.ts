/**
 * Перековка глубоко (дополнение к unit/transmog.ts): снятие с каждой категории (оружие всех семейств, все слоты брони,
 * наплечники, перчатки, щит, спина, бижутерия, модели, уникальные, легендарки), матрица наложения «семейство × семейство»,
 * особый удар и свечение заточки, цены и граничные значения, оболочка и перекованная вещь в обмене, банке, выбросе,
 * продаже и после смерти; сброс; повтор и гонка; бой и привязка; сохранение и загрузка (битые виды); строка u.gear
 * и сопоставление моделей героя Б (data/hero-b-live.json → models).
 * Без сервера. Запуск: npx tsx tests/unit/transmog-deep.ts
 */
import { tmApply, tmExtract, tmReset } from "../../server/src/game/transmog";
import { TradeManager } from "../../server/src/trade/TradeManager";
import { BankService, bankOf } from "../../server/src/game/bank";
import { dropItem, groundBags, pickupBag } from "../../server/src/game/drop";
import { sell } from "../../server/src/game/inventory";
import { sellPrice } from "../../server/src/game/market";
import type { Player } from "../../server/src/game/Player";
import {
  applyPrice, applyRefusal, extractPrice, familyOf, fits, gearStrings, isShell, makeShell, ownAppearance, REFORGER, resetPrice,
  sanitizeItem, slotOf, tryOnSlot, validAppearance, withLook,
} from "../../shared/transmog";
import { BASE_ITEMS, ITEM_MODELS, UNIQUES, iconFor, isBound, lookItem, makeItem, makeUnique, Rarity, SHELL_BASE, SLOTS, type Item, type Slot } from "../../shared/items";
import { LEGENDARIES, makeLegendary } from "../../shared/legendary";
import { BANKER, SHARED_TAB } from "../../shared/bank";
import { DROP } from "../../shared/drop";
import { RESPAWN_DELAY_MS } from "../../shared/constants";
import { TRADE_CONFIRM_DELAY_MS } from "../../shared/trade";
import tmData from "../../data/transmog.json";
import live from "../../data/hero-b-live.json";
import items147 from "../../data/items-147.json";
import man from "../../client/public/assets/manifest.json";
import { assert, done, section, test } from "./lib";
import { at, drop, emptyBag, hero, memDb, register, shiftNow, uids, world, type Hero } from "./fixtures";

const w = world();
const free = () => false;
const ICONS = new Set(man.icons as string[]);
const LIVE = live as unknown as { sets: string[]; models: Record<string, string>; slotMap: Record<string, string> };
const quiet = <T>(fn: () => T): T => { const e = console.error, wn = console.warn; console.error = console.warn = () => {}; try { return fn(); } finally { console.error = e; console.warn = wn; } };

function reforger(gold = 10_000_000, cls: Parameters<typeof hero>[1] = "warrior"): Hero {
  const p = hero(w, cls, undefined, 60);
  emptyBag(p);
  p.save.gold = gold;
  at(p, REFORGER, 0, 20);
  return p;
}
const snap = (p: Player) => JSON.stringify({ inv: p.save.inventory, eq: p.save.equip, gold: p.save.gold });
/** Все базы снаряжения (не расходники, не «Оболочка»). */
const GEAR = Object.values(BASE_ITEMS).filter((b) => b.slot !== "consumable").map((b) => b.id);
/**
 * Ожидаемые семейства — по правилам docs/art/gear.md §6 (латы → латы, кожа → кожа, ткань → ткань; оружие — по хвату и анимации),
 * записаны здесь независимо от data/transmog.json: если данные разъедутся с правилом, тест упадёт.
 */
const RULE: Record<string, string> = {
  sword: "1h", axe: "1h", mace: "1h", greatsword: "2h", greataxe: "2h", hammer: "2h", twinblades: "dual", dagger: "dual",
  spear: "spear", scythe: "scythe", staff: "staff", scepter: "scepter", bow: "bow", crossbow: "bow", shield: "shield", orb: "focus", tome: "focus",
  helmet: "legacy", armor: "legacy", boots: "legacy", cloak: "cloak", ring: "ring", amulet: "amulet",
  ...Object.fromEntries(["helm", "armor", "boots", "shoulders", "gloves"].flatMap((s) => ["plate", "leather", "cloth"].map((m) => [`${m}_${s}`, m]))),
};
const expectFits = (a: string, b: string) => BASE_ITEMS[a].slot === BASE_ITEMS[b].slot && RULE[a] === RULE[b];
/** Куски строки gear героя Б (client/src/game/heroB.ts lookOf, GearLayers.parseGear): номер куска → слот сервера. */
const GEAR_ORDER = ["helmet", "armor", "boots", "offhand", "cloak", "ring", "amulet", "shoulders", "gloves"];
function piece(gear: string, slot: Slot) {
  const k = GEAR_ORDER.indexOf(slot);
  const s = gear.split("|")[k] ?? "";
  if (!s) return null;
  const [r, plus, leg, rag, base, model] = s.split(":");
  return { r: Number(r), plus: Number(plus || 0), leg, rag: rag === "1", base, model };
}
const weaponPart = (weapon: string) => {
  const [base, r, plus, leg, model, tm] = weapon.split(":");
  return { base, r: Number(r), plus: Number(plus || 0), leg, model, tm: tm === "1" };
};
/** Предмет-донор с моделью каталога (база модели). */
const withModel = (id: string, r = Rarity.Rare): Item => ({ ...makeItem(ITEM_MODELS[id].cat, ITEM_MODELS[id].lvl, r), model: id });
const gearLegendaries = Object.values(LEGENDARIES).filter((l) => familyOf(l.base));

// ---------------------------------------------------------------- данные
section("Перековка: данные семейств");

await test("у каждой базы снаряжения есть семейство; у расходников и «Оболочки» — нет", () => {
  for (const b of GEAR) assert.ok(familyOf(b), `у ${b} нет семейства — её нельзя перековать`);
  for (const b of Object.values(BASE_ITEMS).filter((x) => x.slot === "consumable")) assert.equal(familyOf(b.id), null, b.id);
  assert.equal(familyOf(SHELL_BASE), null);
  assert.equal(familyOf("nope"), null);
});

await test("B64: familyOf/slotOf для «__proto__», «constructor», «toString» — null (Object.hasOwn)", () => {
  for (const k of ["__proto__", "constructor", "toString"]) {
    assert.equal(familyOf(k), null, k);
    assert.equal(slotOf(k), null, k);
  }
});

await test("семейства data/transmog.json совпадают с правилами docs/art/gear.md (все пары баз)", () => {
  for (const a of GEAR) for (const b of GEAR) assert.equal(fits({ base: a }, { base: b }), expectFits(a, b), `${a} → ${b}`);
});

await test("лишних семейств в данных нет: каждая база из families существует, каждое семейство названо", () => {
  for (const [b, f] of Object.entries(tmData.families)) {
    assert.ok(BASE_ITEMS[b] && BASE_ITEMS[b].slot !== "consumable", `families.${b} — нет такой базы снаряжения`);
    assert.ok((tmData.familyNames as Record<string, string>)[f], `у семейства ${f} нет названия`);
  }
});

// ---------------------------------------------------------------- снять с каждой категории
section("Перековка: снять оболочку с каждой категории");

await test(`каждая база (${GEAR.length}): оболочка с видом донора, цена по донору, иконка = иконка донора, золото списано один раз`, () => {
  const p = reforger();
  try {
    for (const base of GEAR) for (const r of [Rarity.Common, Rarity.Rare, Rarity.Epic]) {
      const donor = makeItem(base, 40, r);
      p.save.inventory[0] = donor;
      const g = p.save.gold;
      tmExtract(w, p, 0, free);
      const sh = p.save.inventory[0]!;
      assert.ok(isShell(sh), `${base} r${r}: ${p.box.errors().slice(-1)}`);
      assert.equal(sh.appearance!.base, base);
      assert.equal(sh.appearance!.rarity, r);
      assert.deepEqual(sh.stats, {}, "у оболочки характеристики");
      assert.equal(sh.plus, undefined);
      assert.equal(p.save.gold, g - extractPrice(donor), `${base}: цена`);
      assert.equal(iconFor(sh), iconFor(donor), `${base} r${r}: иконка оболочки не как у вещи`);
      assert.ok(validAppearance(sh.appearance), base);
    }
  } finally { drop(w, p); }
});

await test("наплечники и перчатки всех материалов, щит, спина: оболочка ложится обратно на вещь того же слота", () => {
  const p = reforger();
  try {
    for (const base of ["plate_shoulders", "leather_shoulders", "cloth_shoulders", "plate_gloves", "leather_gloves", "cloth_gloves", "shield", "cloak"]) {
      p.save.inventory[0] = makeItem(base, 30, Rarity.Epic);
      tmExtract(w, p, 0, free);
      const t = makeItem(base, 5, Rarity.Common);
      p.save.inventory[1] = t;
      tmApply(w, p, 0, 1, undefined, free);
      assert.equal(p.save.inventory[1]!.appearance?.base, base, `${base}: ${p.box.errors().slice(-1)}`);
      assert.equal(p.save.inventory[1]!.appearance?.rarity, Rarity.Epic);
      assert.equal(p.save.inventory[0], null);
      p.save.inventory[1] = null;
    }
  } finally { drop(w, p); }
});

await test("модели каталога (по одной на категорию) и модели героя Б (items-147): вид уносит модель", () => {
  const p = reforger();
  try {
    const byCat = new Map<string, string>();
    for (const m of Object.values(ITEM_MODELS)) if (familyOf(m.cat) && !byCat.has(m.cat)) byCat.set(m.cat, m.id);
    for (const m of items147.models) byCat.set(m.id, m.id);
    for (const id of byCat.values()) {
      const donor = withModel(id);
      p.save.inventory[0] = donor;
      tmExtract(w, p, 0, free);
      const sh = p.save.inventory[0]!;
      assert.equal(sh.appearance?.model, id, `${id}: ${p.box.errors().slice(-1)}`);
      assert.equal(iconFor(sh), iconFor(donor), id);
    }
  } finally { drop(w, p); }
});

await test(`уникальные (${Object.keys(UNIQUES).length}) и легендарки (${gearLegendaries.length}): оболочка снимается, иконка — как у вещи`, () => {
  const p = reforger();
  const bad: string[] = [];
  try {
    const donors = [...Object.keys(UNIQUES).map((id) => makeUnique(id)), ...gearLegendaries.map((l) => makeLegendary(l.id))];
    for (const donor of donors) {
      if (!familyOf(donor.base)) continue;
      p.save.inventory[0] = donor;
      tmExtract(w, p, 0, free);
      const sh = p.save.inventory[0]!;
      assert.ok(isShell(sh), `${donor.name}: ${p.box.errors().slice(-1)}`);
      assert.ok(!isBound(sh), `${donor.name}: оболочка привязана`);
      assert.equal(sh.appearance?.legendary, donor.legendary);
      assert.equal(sh.appearance?.unique, donor.unique);
      if (iconFor(sh) !== iconFor(donor)) bad.push(`${donor.unique ?? donor.legendary}: ${iconFor(donor)} → ${iconFor(sh)}`);
    }
    assert.deepEqual(bad, []);
  } finally { drop(w, p); }
});

await test("надетую вещь в доноры не взять (только из сумки): вызов со слотом ничего не меняет", () => {
  const p = reforger();
  try {
    p.save.equip.helmet = makeItem("plate_helm", 30, Rarity.Rare);
    const s = snap(p);
    tmExtract(w, p, undefined, free);
    (tmExtract as (...a: unknown[]) => void)(w, p, "helmet", free);
    assert.equal(snap(p), s);
  } finally { drop(w, p); }
});

// ---------------------------------------------------------------- матрица наложения
section("Перековка: наложение — все пары баз");

await test(`сервер: ${GEAR.length}×${GEAR.length} пар — вид ложится ровно там, где слот и семейство совпадают; при отказе ничего не меняется`, () => {
  const p = reforger();
  const wrong: string[] = [];
  try {
    for (const a of GEAR) for (const b of GEAR) {
      const sh = makeShell(makeItem(a, 30, Rarity.Rare));
      const t = makeItem(b, 30, Rarity.Common);
      p.save.inventory[0] = sh;
      p.save.inventory[1] = t;
      p.save.gold = 10_000_000;
      const s = snap(p);
      tmApply(w, p, 0, 1, undefined, free);
      const ok = p.save.inventory[1]!.appearance?.base === a;
      if (ok !== expectFits(a, b)) wrong.push(`${a} → ${b}: ${ok ? "наложено" : "отказ"}`);
      if (!ok) assert.equal(snap(p), s, `${a} → ${b}: отказ, но что-то изменилось`);
      else assert.equal(p.save.inventory[0], null);
    }
    assert.deepEqual(wrong, []);
  } finally { drop(w, p); }
});

await test("applyRefusal = отказ сервера; tryOnSlot находит надетую вещь того же семейства (одноручное во второй руке Рыцаря смерти)", () => {
  for (const a of GEAR) for (const b of GEAR) {
    const sh = makeShell(makeItem(a, 10, Rarity.Common));
    assert.equal(applyRefusal(sh, makeItem(b, 10, Rarity.Common)) === null, expectFits(a, b), `${a} → ${b}`);
  }
  const ap = ownAppearance(makeItem("axe", 10, Rarity.Rare));
  assert.equal(tryOnSlot({ weapon: makeItem("staff", 10, 0), offhand: makeItem("sword", 10, 0) }, ap), "offhand");
  assert.equal(tryOnSlot({ weapon: makeItem("greatsword", 10, 0) }, ap), null);
});

await test("Рыцарь смерти: вид топора на меч во второй руке — в строке u.gear вторая рука с базой и видом топора", () => {
  const p = reforger(10_000_000, "deathknight");
  try {
    p.save.equip.weapon = makeItem("sword", 30, 0);
    p.save.equip.offhand = makeItem("sword", 30, 0);
    p.save.inventory[0] = makeShell(makeItem("axe", 30, Rarity.Epic));
    tmApply(w, p, 0, undefined, "offhand", free);
    assert.equal(p.save.equip.offhand!.appearance?.base, "axe", p.box.errors().join(" | "));
    assert.equal(piece(p.unit.gear, "offhand")?.base, "axe");
    assert.equal(p.save.equip.offhand!.base, "sword", "сама вещь сменила базу");
  } finally { drop(w, p); }
});

await test("не-оболочка с полем appearance, оболочка без вида или с битым видом — в роли оболочки отказ", () => {
  const p = reforger();
  try {
    const fake = { ...makeItem("greatsword", 10, 0), appearance: ownAppearance(makeItem("hammer", 10, 2)) };
    const empty = { ...makeShell(makeItem("hammer", 10, 0)) }; delete empty.appearance;
    const broken = { ...makeShell(makeItem("hammer", 10, 0)), appearance: { base: "hammer", name: "x", rarity: 9 } as never };
    for (const sh of [fake, empty, broken]) {
      p.save.inventory[0] = sh;
      p.save.inventory[1] = makeItem("greataxe", 10, 0);
      const s = snap(p);
      tmApply(w, p, 0, 1, undefined, free);
      assert.equal(snap(p), s);
    }
  } finally { drop(w, p); }
});

// ---------------------------------------------------------------- особый удар, заточка, характеристики
section("Перековка: особый удар, заточка, сила вещи");

const SPECIAL = items147.models.find((m) => (m as { tooltip?: string[] }).tooltip?.length && BASE_ITEMS[m.cat]?.slot === "weapon")!;

await test(`особый удар не переносится: вид «${SPECIAL.id}» на простом двуручнике — в строке оружия пометка чужого вида`, () => {
  const p = reforger();
  try {
    p.save.equip.weapon = withModel(SPECIAL.id, Rarity.Epic);
    p.recalc();
    const own = weaponPart(p.unit.weapon);
    assert.equal(own.model, SPECIAL.id);
    assert.equal(own.tm, false, "своя вещь с пометкой чужого вида — особый удар пропадёт");
    p.save.inventory[0] = p.save.equip.weapon;
    p.save.equip.weapon = makeItem(SPECIAL.cat, 30, 0);
    tmExtract(w, p, 0, free);
    tmApply(w, p, 0, undefined, "weapon", free);
    const look = weaponPart(p.unit.weapon);
    assert.equal(look.model, SPECIAL.id, "модель вида не дошла до строки");
    assert.equal(look.tm, true, "нет пометки чужого вида: клиент включит особый удар");
  } finally { drop(w, p); }
});

await test("и наоборот: на оружии с особым ударом чужой вид — пометка стоит (особый удар не рисуется чужой моделью)", () => {
  const eq = { weapon: { ...withModel(SPECIAL.id), appearance: ownAppearance(makeItem(SPECIAL.cat, 10, 0)) } };
  const wp = weaponPart(gearStrings(eq).weapon);
  assert.equal(wp.tm, true);
  assert.equal(wp.model, "");
});

await test("свечение заточки — от настоящей вещи: +11 под видом +0 и +0 под видом донора +12", () => {
  const donor = { ...makeItem("greatsword", 50, Rarity.Epic), plus: 12 };
  const sh = makeShell(donor);
  assert.equal(sh.plus, undefined, "оболочка унесла заточку");
  assert.equal((sh.appearance as unknown as Record<string, unknown>).plus, undefined);
  const strong = { ...makeItem("hammer", 50, Rarity.Common), plus: 11, appearance: sh.appearance };
  assert.equal(weaponPart(gearStrings({ weapon: strong }).weapon).plus, 11);
  const weak = { ...makeItem("hammer", 50, Rarity.Common), appearance: sh.appearance };
  assert.equal(weaponPart(gearStrings({ weapon: weak }).weapon).plus, 0);
  for (const slot of ["helmet", "armor", "boots", "offhand", "cloak", "shoulders", "gloves"] as Slot[]) {
    const base = slot === "offhand" ? "shield" : slot === "helmet" ? "plate_helm" : slot === "cloak" ? "cloak" : `plate_${slot}`;
    const it = { ...makeItem(base, 30, 0), plus: 7, appearance: ownAppearance({ ...makeItem(base, 30, Rarity.Epic), plus: 15 }) };
    assert.equal(piece(gearStrings({ [slot]: it }).gear, slot)?.plus, 7, slot);
  }
});

await test("характеристики героя не меняются от вида (derive считает по настоящей вещи); заточка и uid вещи на месте", () => {
  const p = reforger();
  try {
    p.save.equip.weapon = { ...makeItem("hammer", 20, Rarity.Common), plus: 3 };
    p.recalc();
    const before = JSON.stringify(p.derived);
    const leg = gearLegendaries.find((l) => familyOf(l.base) === familyOf("hammer"));
    p.save.inventory[0] = makeShell(leg ? makeLegendary(leg.id) : makeItem("greatsword", 100, Rarity.Epic));
    const uid = p.save.equip.weapon.uid;
    tmApply(w, p, 0, undefined, "weapon", free);
    assert.ok(p.save.equip.weapon!.appearance, p.box.errors().join(" | "));
    assert.equal(JSON.stringify(p.derived), before);
    assert.equal(p.save.equip.weapon!.plus, 3);
    assert.equal(p.save.equip.weapon!.uid, uid);
    assert.equal(lookItem(p.save.equip.weapon!).plus, 3);
  } finally { drop(w, p); }
});

// ---------------------------------------------------------------- цены
section("Перековка: цены и граничные значения");

type PR = { base: number; perLevel: number; rarity: number[] };
const formula = (r: PR, ilvl: number, rarity: number) => Math.max(0, Math.round((r.base + Math.max(1, ilvl) * r.perLevel) * r.rarity[Math.max(0, Math.min(r.rarity.length - 1, rarity))]));

await test("снять: цена по уровню 1…100 и редкости 0…3 = (base + ур × perLevel) × множитель; растёт с уровнем и редкостью", () => {
  const P = tmData.price.extract;
  for (let l = 1; l <= 100; l++) {
    let prev = -1;
    for (let r = 0; r <= 3; r++) {
      const v = extractPrice({ ilvl: l, rarity: r });
      assert.equal(v, formula(P, l, r), `ур ${l} r${r}`);
      assert.ok(v >= prev, "дешевле при большей редкости");
      prev = v;
    }
    if (l > 1) assert.ok(extractPrice({ ilvl: l, rarity: 0 }) > extractPrice({ ilvl: l - 1, rarity: 0 }));
  }
  assert.equal(extractPrice({ ilvl: 1, rarity: 0 }), 23);
  assert.equal(extractPrice({ ilvl: 100, rarity: 3 }), 1600);
});

await test("границы: уровень 0 и отрицательный = как 1; редкость < 0 = обычная, > 3 = легендарная, дробная — вниз", () => {
  for (const fn of [extractPrice, resetPrice, (x: { ilvl: number; rarity: number }) => applyPrice(x, x)] as ((x: { ilvl: number; rarity: number }) => number)[]) {
    assert.equal(fn({ ilvl: 0, rarity: 0 }), fn({ ilvl: 1, rarity: 0 }));
    assert.equal(fn({ ilvl: -50, rarity: 1 }), fn({ ilvl: 1, rarity: 1 }));
    assert.equal(fn({ ilvl: 10, rarity: -3 }), fn({ ilvl: 10, rarity: 0 }));
    assert.equal(fn({ ilvl: 10, rarity: 99 }), fn({ ilvl: 10, rarity: 3 }));
    assert.equal(fn({ ilvl: 10, rarity: 2.7 }), fn({ ilvl: 10, rarity: 2 }));
    assert.ok(fn({ ilvl: 1e6, rarity: 3 }) >= 0);
  }
});

await test("наложить: по большему уровню и редкости из двух (порядок не важен); сброс бесплатный", () => {
  const P = tmData.price.apply;
  for (const [a, b] of [[{ ilvl: 100, rarity: 0 }, { ilvl: 1, rarity: 3 }], [{ ilvl: 5, rarity: 2 }, { ilvl: 60, rarity: 1 }], [{ ilvl: 30, rarity: 1 }, { ilvl: 30, rarity: 1 }]]) {
    const want = formula(P, Math.max(a.ilvl, b.ilvl), Math.max(a.rarity, b.rarity));
    assert.equal(applyPrice(a, b), want);
    assert.equal(applyPrice(b, a), want);
  }
  for (const l of [1, 50, 100]) for (let r = 0; r <= 3; r++) assert.equal(resetPrice({ ilvl: l, rarity: r }), formula(tmData.price.reset, l, r));
});

await test("сервер: сброс бесплатный — проходит при 0 золота, золото не уходит в минус", () => {
  const p = reforger();
  try {
    p.save.inventory[0] = makeShell(makeItem("hammer", 100, Rarity.Epic));
    p.save.inventory[1] = makeItem("greataxe", 100, Rarity.Epic);
    tmApply(w, p, 0, 1, undefined, free);
    assert.equal(resetPrice(p.save.inventory[1]!), 0, "сброс не бесплатный (data/transmog.json price.reset)");
    p.save.gold = 0;
    tmReset(w, p, 1, undefined, free);
    assert.equal(p.save.inventory[1]!.appearance, undefined, p.box.errors().join(" | "));
    assert.equal(p.save.gold, 0);
  } finally { drop(w, p); }
});

await test("B62: битый уровень вещи (ilvl нет / NaN в старом сохранении) — цена по req, золото не NaN", () => {
  const p = reforger(1000);
  try {
    const donor = makeItem("greatsword", 30, Rarity.Rare);
    (donor as { ilvl: unknown }).ilvl = undefined;
    p.save.inventory[0] = donor;
    tmExtract(w, p, 0, free);
    assert.ok(Number.isFinite(p.save.gold), `золото = ${p.save.gold}`);
  } finally { drop(w, p); }
});

// ---------------------------------------------------------------- оболочка и перекованная вещь как предмет
section("Перековка: обмен, банк, выброс, продажа, смерть");

function tradePair() {
  const db = memDb();
  const tm = new TradeManager(() => w, () => db, () => false, () => w.map.playerSpawn);
  const a = reforger(), b = reforger();
  register(db, a);
  register(db, b);
  b.unit.x = a.unit.x + 30;
  b.unit.y = a.unit.y;
  const deal = (ia: number) => {
    tm.request(a, b.id);
    tm.respond(b, true);
    tm.add(a, ia, 0);
    tm.ready(a);
    tm.ready(b);
    const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
    try { tm.confirm(a); tm.confirm(b); } finally { restore(); }
  };
  return { db, tm, a, b, deal };
}

await test("обмен: перекованная вещь уходит вместе с видом; у получателя тот же uid, вид и заточка", () => {
  const { a, b, deal } = tradePair();
  try {
    a.save.inventory[0] = makeShell(makeItem("hammer", 50, Rarity.Epic));
    a.save.inventory[1] = { ...makeItem("greataxe", 20, Rarity.Common), plus: 4 };
    tmApply(w, a, 0, 1, undefined, free);
    const it = a.save.inventory[1]!;
    deal(1);
    const got = b.save.inventory.find((x) => x?.uid === it.uid);
    assert.ok(got, "вещь не дошла: " + [...a.box.toasts(), ...b.box.toasts()].join(" | "));
    assert.equal(got!.appearance?.base, "hammer");
    assert.equal(got!.plus, 4);
    assert.ok(!uids(a.save.inventory).includes(it.uid));
  } finally { drop(w, a, b); }
});

await test("обмен: оболочка в окне обмена — наложить и снять с неё нельзя (заблокирована), после обмена у отдавшего её нет", () => {
  const { tm, a, b } = tradePair();
  try {
    a.save.inventory[0] = makeShell(makeItem("hammer", 50, Rarity.Epic));
    a.save.inventory[1] = makeItem("greataxe", 20, Rarity.Common);
    const lockedA = (i: number) => tm.locked(a, i);
    tm.request(a, b.id);
    tm.respond(b, true);
    tm.add(a, 0, 0);
    const s = snap(a);
    tmApply(w, a, 0, 1, undefined, lockedA);
    assert.equal(snap(a), s, "оболочка из окна обмена наложена");
    tm.ready(a);
    tm.ready(b);
    const restore = shiftNow(TRADE_CONFIRM_DELAY_MS + 50);
    try { tm.confirm(a); tm.confirm(b); } finally { restore(); }
    assert.equal(a.save.inventory[0], null);
    assert.ok(b.save.inventory.some((x) => isShell(x)));
  } finally { drop(w, a, b); }
});

function bankSetup(p: Hero) {
  const db = memDb();
  register(db, p);
  at(p, BANKER);
  const bank = new BankService(() => w, () => db, () => w.map.playerSpawn, () => false, () => false);
  return { db, bank };
}

await test("банк: оболочка и перекованная вещь кладутся и берутся с видом; вид сохранён в базе", () => {
  const p = reforger();
  try {
    p.save.inventory[0] = makeShell(makeItem("hammer", 50, Rarity.Epic));
    p.save.inventory[1] = makeShell(makeItem("plate_gloves", 50, Rarity.Rare));
    p.save.inventory[2] = makeItem("plate_gloves", 10, Rarity.Common);
    tmApply(w, p, 1, 2, undefined, free);
    const { db, bank } = bankSetup(p);
    bank.put(p, 0, 0, 0);
    bank.put(p, 2, 0, 1);
    const cells = bankOf(p).tabs[0];
    assert.ok(isShell(cells[0]) && cells[0]!.appearance?.base === "hammer", p.box.errors().join(" | "));
    assert.equal(cells[1]!.appearance?.base, "plate_gloves");
    const saved = db.load(p.name)!.bank!.tabs[0];
    assert.equal(saved[0]!.appearance?.base, "hammer");
    assert.equal(saved[1]!.appearance?.rarity, Rarity.Rare);
    bank.take(p, 0, 1, 5);
    assert.equal(p.save.inventory[5]!.appearance?.base, "plate_gloves");
    at(p, REFORGER, 0, 20);
    tmReset(w, p, 5, undefined, free);
    assert.equal(p.save.inventory[5]!.appearance, undefined);
  } finally { drop(w, p); }
});

await test("общий склад аккаунта: оболочка доходит до второго героя того же аккаунта с видом", () => {
  const db = memDb();
  const bank = new BankService(() => w, () => db, () => w.map.playerSpawn, () => false, () => false);
  const a = reforger(), b = reforger();
  try {
    const acc = register(db, a);
    db.createChar(acc, b.name, b.save);
    b.accountId = acc;
    at(a, BANKER);
    at(b, BANKER);
    a.save.inventory[0] = makeShell(makeItem("cloak", 40, Rarity.Epic));
    const uid = a.save.inventory[0]!.uid;
    bank.put(a, 0, SHARED_TAB, 0);
    assert.equal(a.save.inventory[0], null, a.box.errors().join(" | "));
    bank.take(b, SHARED_TAB, 0, 0);
    assert.equal(b.save.inventory[0]?.uid, uid, b.box.errors().join(" | "));
    assert.equal(b.save.inventory[0]!.appearance?.base, "cloak");
  } finally { drop(w, a, b); }
});

await test("выброс и подбор: перекованная вещь подбирается другим героем после срока хозяина — вид на месте", () => {
  const db = memDb();
  const p = reforger(), q = reforger();
  try {
    register(db, p);
    register(db, q);
    p.save.inventory[0] = makeShell(makeItem("staff", 60, Rarity.Epic));
    p.save.inventory[1] = makeItem("staff", 10, 0);
    tmApply(w, p, 0, 1, undefined, free);
    const uid = p.save.inventory[1]!.uid;
    dropItem(w, db, w.map.playerSpawn, p, { index: 1 });
    const bag = groundBags(w).find((b) => b.items.some((it) => it.uid === uid))!;
    assert.ok(bag, p.box.errors().join(" | "));
    q.unit.x = bag.x;
    q.unit.y = bag.y;
    (w as { time: number }).time += DROP.ownerLockSec * 1000 + 1;
    pickupBag(w, db, q, bag.id);
    const got = q.save.inventory.find((it) => it?.uid === uid);
    assert.ok(got, q.box.errors().join(" | "));
    assert.equal(got!.appearance?.base, "staff");
    assert.equal(got!.appearance?.rarity, Rarity.Epic);
  } finally { drop(w, p, q); }
});

await test("продажа торговцу: оболочка продаётся (цена > 0); перекованная вещь стоит как без вида (сила — своя)", () => {
  const p = reforger();
  try {
    at(p, w.map.merchants[0]);
    const sh = makeShell(makeItem("greatsword", 100, Rarity.Epic));
    assert.ok(sellPrice(sh) > 0, "оболочка ничего не стоит");
    const plain = makeItem("hammer", 10, Rarity.Common);
    assert.equal(sellPrice({ ...plain, appearance: sh.appearance }), sellPrice(plain), "вид легендарки поднял цену продажи");
    p.save.inventory[0] = sh;
    const g = p.save.gold;
    sell(w, p, 0);
    assert.equal(p.save.inventory[0], null, p.box.errors().join(" | "));
    assert.ok(p.save.gold > g);
  } finally { drop(w, p); }
});

await test("смерть и возрождение: надетый вид и оболочки в сумке на месте, строка u.gear с видом", () => {
  const p = reforger();
  try {
    p.save.equip.helmet = makeItem("plate_helm", 10, 0);
    p.save.inventory[0] = makeShell(withModel(items147.models[0].id, Rarity.Epic));
    p.save.inventory[1] = makeShell(makeItem("plate_armor", 60, Rarity.Epic));
    tmApply(w, p, 0, undefined, "helmet", free);
    const gear = p.unit.gear;
    assert.equal(piece(gear, "helmet")?.model, items147.models[0].id, p.box.errors().join(" | "));
    w.killPlayer(p);
    (w as { time: number }).time += RESPAWN_DELAY_MS + 1;
    w.respawn(p);
    assert.ok(!p.dead);
    assert.equal(p.save.equip.helmet!.appearance?.model, items147.models[0].id);
    assert.ok(isShell(p.save.inventory[1]));
    p.recalc();
    assert.equal(p.unit.gear, gear);
  } finally { drop(w, p); }
});

await test("мёртвый не перековывает (снять, наложить, сбросить)", () => {
  const p = reforger();
  try {
    p.save.inventory[0] = makeShell(makeItem("hammer", 10, 0));
    p.save.inventory[1] = makeItem("greataxe", 10, 0);
    p.save.inventory[2] = makeItem("greataxe", 10, 0);
    p.dead = true;
    const s = snap(p);
    tmExtract(w, p, 2, free);
    tmApply(w, p, 0, 1, undefined, free);
    tmReset(w, p, 1, undefined, free);
    assert.equal(snap(p), s);
  } finally { drop(w, p); }
});

// ---------------------------------------------------------------- сброс
section("Перековка: сброс вида");

await test("сброс надетой: вид пропадает, оболочка не возвращается, строка u.gear — снова своя", () => {
  const p = reforger();
  try {
    p.save.equip.boots = makeItem("leather_boots", 10, 0);
    p.recalc();
    const own = p.unit.gear;
    p.save.inventory[0] = makeShell(makeItem("leather_boots", 80, Rarity.Epic));
    tmApply(w, p, 0, undefined, "boots", free);
    assert.notEqual(p.unit.gear, own, "вид не попал в строку");
    tmReset(w, p, undefined, "boots", free);
    assert.equal(p.save.equip.boots!.appearance, undefined);
    assert.equal(p.unit.gear, own);
    assert.equal(p.save.inventory.filter(Boolean).length, 0, "оболочка вернулась в сумку — дюп вида");
  } finally { drop(w, p); }
});

await test("withLook (превью «станет»): не меняет вещь; null снимает вид только в копии", () => {
  const it = { ...makeItem("hammer", 10, 0), appearance: ownAppearance(makeItem("greatsword", 10, 2)) };
  const eq = { weapon: it };
  const off = withLook(eq, "weapon", null);
  assert.equal(off.weapon!.appearance, undefined);
  assert.ok(it.appearance, "превью сняло вид с настоящей вещи");
  assert.equal(withLook(eq, "helmet", null), eq);
});

// ---------------------------------------------------------------- повтор и гонка
section("Перековка: повтор и гонка запросов");

await test("два наложения одной оболочки подряд (на надетую и на сумку) — вид только на первой, золото списано один раз", () => {
  const p = reforger();
  try {
    p.save.inventory[0] = makeShell(makeItem("hammer", 30, Rarity.Rare));
    p.save.equip.weapon = makeItem("greataxe", 30, 0);
    p.save.inventory[1] = makeItem("greatsword", 30, 0);
    const g = p.save.gold, price = applyPrice(p.save.inventory[0]!, p.save.equip.weapon);
    tmApply(w, p, 0, undefined, "weapon", free);
    tmApply(w, p, 0, 1, undefined, free);
    assert.ok(p.save.equip.weapon!.appearance);
    assert.equal(p.save.inventory[1]!.appearance, undefined);
    assert.equal(p.save.gold, g - price);
  } finally { drop(w, p); }
});

await test("оболочку переложили (обмен ячеек) между двумя запросами — второй запрос по старому индексу не находит её", () => {
  const p = reforger();
  try {
    p.save.inventory[0] = makeShell(makeItem("hammer", 30, Rarity.Rare));
    p.save.inventory[1] = makeItem("greataxe", 30, 0);
    p.save.inventory[2] = makeItem("greatsword", 30, 0);
    tmApply(w, p, 0, 1, undefined, free);
    [p.save.inventory[0], p.save.inventory[2]] = [p.save.inventory[2], p.save.inventory[0]];
    const s = snap(p);
    tmApply(w, p, 0, 1, undefined, free);
    tmApply(w, p, 2, 0, undefined, free);
    assert.equal(snap(p), s);
  } finally { drop(w, p); }
});

await test("снять и тут же положить оболочку в банк, затем наложить по старому индексу — отказ; оболочек всего одна", () => {
  const p = reforger();
  try {
    p.save.inventory[0] = makeItem("hammer", 30, Rarity.Rare);
    tmExtract(w, p, 0, free);
    const { db, bank } = bankSetup(p);
    bank.put(p, 0, 0, 0);
    at(p, REFORGER, 0, 20);
    p.save.inventory[1] = makeItem("greataxe", 30, 0);
    const s = snap(p);
    tmApply(w, p, 0, 1, undefined, free);
    assert.equal(snap(p), s);
    const all = [...p.save.inventory, ...bankOf(p).tabs.flat(), ...db.load(p.name)!.bank!.tabs.flat()].filter((x) => isShell(x));
    assert.equal(all.length, 2, "в памяти и в базе — по одной оболочке");
  } finally { drop(w, p); }
});

await test("сто повторов снятия, наложения и сброса в одном такте — одна оболочка, одно списание каждого вида", () => {
  const p = reforger();
  try {
    p.save.inventory[0] = makeItem("hammer", 30, Rarity.Rare);
    p.save.inventory[1] = makeItem("greataxe", 30, 0);
    const g = p.save.gold;
    const e = extractPrice(p.save.inventory[0]!);
    for (let i = 0; i < 100; i++) tmExtract(w, p, 0, free);
    const a = applyPrice(p.save.inventory[0]!, p.save.inventory[1]!);
    for (let i = 0; i < 100; i++) tmApply(w, p, 0, 1, undefined, free);
    for (let i = 0; i < 100; i++) tmReset(w, p, 1, undefined, free);
    assert.equal(p.save.gold, g - e - a - resetPrice(p.save.inventory[1]!));
    assert.equal(p.save.inventory.filter(Boolean).length, 1);
  } finally { drop(w, p); }
});

// ---------------------------------------------------------------- бой и привязка
section("Перековка: бой и привязанные вещи");

await test("в бою: надетую — нельзя (наложить и сбросить), вещь из сумки — можно", () => {
  const p = reforger();
  try {
    p.save.equip.armor = makeItem("plate_armor", 30, 0);
    p.save.inventory[0] = makeShell(makeItem("plate_armor", 60, Rarity.Epic));
    p.save.inventory[1] = makeShell(makeItem("plate_armor", 60, Rarity.Rare));
    p.save.inventory[2] = makeItem("plate_armor", 30, 0);
    p.combatAt = w.time;
    const eq = JSON.stringify(p.save.equip);
    tmApply(w, p, 0, undefined, "armor", free);
    tmReset(w, p, undefined, "armor", free);
    assert.equal(JSON.stringify(p.save.equip), eq);
    tmApply(w, p, 1, 2, undefined, free);
    assert.equal(p.save.inventory[2]!.appearance?.rarity, Rarity.Rare, p.box.errors().join(" | "));
  } finally { drop(w, p); }
});

await test("привязанная вещь (легендарка, уникальная): вид ложится, привязка остаётся; вид легендарки не привязывает вещь", () => {
  const p = reforger();
  try {
    const leg = gearLegendaries[0];
    const target = makeLegendary(leg.id);
    p.save.inventory[1] = target;
    p.save.inventory[0] = makeShell(makeItem(leg.base, 10, 0));
    tmApply(w, p, 0, 1, undefined, free);
    assert.equal(p.save.inventory[1]!.appearance?.base, leg.base, p.box.errors().join(" | "));
    assert.ok(isBound(p.save.inventory[1]!));
    assert.equal(p.save.inventory[1]!.legendary, leg.id);
    const plain = makeItem(leg.base, 10, 0);
    p.save.inventory[2] = plain;
    p.save.inventory[3] = makeShell(makeLegendary(leg.id));
    tmApply(w, p, 3, 2, undefined, free);
    assert.equal(p.save.inventory[2]!.appearance?.legendary, leg.id, p.box.errors().join(" | "));
    assert.ok(!isBound(p.save.inventory[2]!), "вид легендарки привязал простую вещь");
    const u = Object.keys(UNIQUES).map((id) => makeUnique(id)).find((x) => familyOf(x.base))!;
    p.save.inventory[4] = u;
    p.save.inventory[5] = makeShell(makeItem(u.base, 10, 0));
    tmApply(w, p, 5, 4, undefined, free);
    assert.ok(p.save.inventory[4]!.appearance && isBound(p.save.inventory[4]!), p.box.errors().join(" | "));
  } finally { drop(w, p); }
});

// ---------------------------------------------------------------- сохранение и загрузка
section("Перековка: сохранение и загрузка");

await test("круговой путь через базу: вид в сумке, на герое и в банке, оболочка — без изменений", () => {
  const db = memDb();
  const p = reforger();
  try {
    register(db, p);
    p.save.equip.gloves = { ...makeItem("plate_gloves", 10, 0), appearance: ownAppearance(withModel("hb147_chaos_gloves", Rarity.Epic)) };
    p.save.inventory[0] = makeShell(makeLegendary(gearLegendaries[0].id));
    p.save.inventory[1] = { ...makeItem("helmet", 10, 0), appearance: ownAppearance(makeItem("helmet", 30, Rarity.Rare)) };
    bankOf(p).tabs[0][0] = { ...makeItem("cloak", 10, 0), appearance: ownAppearance(makeItem("cloak", 30, Rarity.Epic)) };
    const before = JSON.stringify({ e: p.save.equip.gloves, i: p.save.inventory.slice(0, 2), b: bankOf(p).tabs[0][0] });
    db.save(p.name, p.toSave(w.map.playerSpawn));
    const s = db.load(p.name)!;
    assert.equal(JSON.stringify({ e: s.equip.gloves, i: s.inventory.slice(0, 2), b: s.bank!.tabs[0][0] }), before);
  } finally { drop(w, p); }
});

await test("битый вид при загрузке снимается (модель, легендарка, уникальная пропали; база чужого семейства; не объект), вещь цела", () => {
  const db = memDb();
  const p = reforger();
  try {
    register(db, p);
    const bad: unknown[] = [
      { base: "greatsword", name: "x", rarity: 1, model: "нет_такой" },
      { base: "greatsword", name: "x", rarity: 1, legendary: "нет_такой" },
      { base: "greatsword", name: "x", rarity: 1, unique: "нет_такой" },
      { base: "sword", name: "x", rarity: 1 },
      { base: "greatsword", name: "x", rarity: 7 },
      { base: "greatsword", name: 5, rarity: 1 },
      { base: "__proto__", name: "x", rarity: 1 },
      "greatsword", null, 42,
    ];
    bad.forEach((ap, i) => (p.save.inventory[i] = { ...makeItem("hammer", 20, 1), appearance: ap as never }));
    p.save.equip.weapon = { ...makeItem("hammer", 20, 1), appearance: { base: "hammer", name: "x", rarity: 1, model: "нет_такой" } };
    db.save(p.name, p.toSave(w.map.playerSpawn));
    const s = quiet(() => db.load(p.name)!);
    bad.forEach((_, i) => {
      assert.equal(s.inventory[i]!.appearance, undefined, `вид №${i} остался`);
      assert.equal(s.inventory[i]!.base, "hammer");
    });
    assert.equal(s.equip.weapon!.appearance, undefined);
    const again = db.load(p.name)!;
    assert.equal(again.inventory[0]!.appearance, undefined, "чистка не записана в базу");
  } finally { drop(w, p); }
});

await test("sanitizeItem: годный вид не трогает; оболочку с битым видом не удаляет (возвращает false)", () => {
  const ok = { ...makeItem("hammer", 10, 0), appearance: ownAppearance(makeItem("greataxe", 10, 2)) };
  assert.equal(sanitizeItem(ok), false);
  assert.ok(ok.appearance);
  const sh = { ...makeShell(makeItem("hammer", 10, 0)), appearance: { base: "hammer", name: "x", rarity: 1, model: "нет" } };
  assert.equal(sanitizeItem(sh), false);
  assert.equal(sanitizeItem(null), false);
  assert.equal(sanitizeItem({ ...makeItem("hammer", 10, 0) }), false);
});

await test("B61: битый вид у вещи в банке героя снимается при загрузке", () => {
  const db = memDb();
  const p = reforger();
  try {
    register(db, p);
    bankOf(p).tabs[0][0] = { ...makeItem("hammer", 20, 1), appearance: { base: "hammer", name: "x", rarity: 1, model: "нет_такой" } };
    db.save(p.name, p.toSave(w.map.playerSpawn));
    const s = quiet(() => db.load(p.name)!);
    assert.equal(s.bank!.tabs[0][0]!.appearance, undefined, "битый вид в банке остался");
  } finally { drop(w, p); }
});

await test("B61: битый вид на общем складе аккаунта снимается при чтении и записывается в базу", () => {
  const db = memDb();
  const id = db.accountCreate("tmstash", "pass12345");
  db.saveAccountBank(id, [{ ...makeItem("hammer", 20, 1), appearance: { base: "hammer", name: "x", rarity: 1, model: "нет_такой" } }, null]);
  const cells = quiet(() => db.accountBank(id)!);
  assert.equal(cells[0]!.appearance, undefined, "битый вид на складе остался");
  assert.equal(db.accountBank(id)![0]!.appearance, undefined, "чистка не записана в базу");
});

await test("B63: оболочка с битым видом — иконка из манифеста (data/transmog.json shell.icon)", () => {
  const sh = { ...makeShell(makeItem("hammer", 10, 0)), appearance: { base: "нет", name: "x", rarity: 1 } as never };
  assert.ok(ICONS.has(iconFor(sh)), `нет иконки ${iconFor(sh)}`);
});

// ---------------------------------------------------------------- строка u.gear и герой Б
section("Перековка: строка u.gear и модели героя Б");

await test("модели героя Б: каждая вещь items-147 с сетом есть в hero-b-live.json → models и указывает на свой сет; сеты существуют", () => {
  for (const m of items147.models as { id: string; set?: string; cat: string }[]) {
    assert.ok(ITEM_MODELS[m.id], `${m.id} нет в ITEM_MODELS`);
    if (m.set) assert.equal(LIVE.models[m.id], m.set, `${m.id}: в hero-b-live.json models → ${LIVE.models[m.id]}`);
  }
  for (const [id, set] of Object.entries(LIVE.models)) {
    assert.ok(ITEM_MODELS[id] || LEGENDARIES[id], `models.${id}: нет такой модели или легендарки`);
    assert.ok(LIVE.sets.includes(set), `models.${id} → ${set}: сета нет в sets`);
  }
});

await test("вид модели героя Б на простой вещи: в строке u.gear (или оружия) — модель донора, сет по hero-b-live.json; заточка своя", () => {
  const p = reforger();
  try {
    for (const m of items147.models as { id: string; set: string; cat: string }[]) {
      const slot = BASE_ITEMS[m.cat].slot as Slot;
      assert.ok(LIVE.slotMap[slot], `${m.id}: слот ${slot} не рисуется на герое Б`);
      p.save.equip = Object.fromEntries(SLOTS.map((s) => [s, null])) as never;
      p.save.equip[slot] = { ...makeItem(m.cat, 10, 0), plus: 6 };
      p.save.inventory[0] = makeShell(withModel(m.id, Rarity.Epic));
      tmApply(w, p, 0, undefined, slot, free);
      assert.equal(p.save.equip[slot]!.appearance?.model, m.id, `${m.id}: ${p.box.errors().slice(-1)}`);
      const part = slot === "weapon" ? weaponPart(p.unit.weapon) : piece(p.unit.gear, slot);
      assert.ok(part, `${m.id}: кусок слота ${slot} пуст в «${p.unit.gear}»`);
      assert.equal(part!.model, m.id, `${m.id}: модель в строке`);
      assert.equal(LIVE.models[part!.model], m.set);
      assert.equal(part!.plus, 6, "заточка не своя");
      assert.equal(part!.r, Rarity.Epic, "редкость — вида");
    }
  } finally { drop(w, p); }
});

await test("строка u.gear: 5 кусков без бижутерии и наплечников; 9 — с наплечниками или перчатками; вид легендарки уносит id легендарки", () => {
  const base = { helmet: makeItem("plate_helm", 10, 0), armor: makeItem("plate_armor", 10, 0) };
  assert.equal(gearStrings(base).gear.split("|").length, 5);
  assert.equal(gearStrings({ ...base, gloves: makeItem("plate_gloves", 10, 0) }).gear.split("|").length, 9);
  const leg = gearLegendaries.find((l) => BASE_ITEMS[l.base].slot !== "weapon" && BASE_ITEMS[l.base].slot !== "ring" && BASE_ITEMS[l.base].slot !== "amulet");
  if (leg) {
    const slot = BASE_ITEMS[leg.base].slot as Slot;
    const it = { ...makeItem(leg.base, 10, 0), appearance: ownAppearance(makeLegendary(leg.id)) };
    assert.equal(piece(gearStrings({ [slot]: it }).gear, slot)?.leg, leg.id);
  }
  const wl = gearLegendaries.find((l) => BASE_ITEMS[l.base].slot === "weapon")!;
  const wIt = { ...makeItem(wl.base, 10, 0), appearance: ownAppearance(makeLegendary(wl.id)) };
  assert.equal(weaponPart(gearStrings({ weapon: wIt }).weapon).leg, wl.id);
});

done();
