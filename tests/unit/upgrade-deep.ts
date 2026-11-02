/**
 * Заточка до +15 глубоко (дополнение к unit/economy.ts): таблица data/upgrade.json по всем 15 шагам (шансы, цены, материалы),
 * удача и неудача на каждом шаге с границей шанса, failLevel, нет перехода за +15, граничные значения золота и материалов,
 * одна транзакция (отказ ничего не меняет), бонус effStats по всем уровням, заточка надетой и перекованной вещи,
 * ступени свечения +5/+8/+11 (shared/gearFx.ts) — одинаковые для любой редкости и легендарки.
 * Без сервера. Запуск: npx tsx tests/unit/upgrade-deep.ts
 */
import { upgradeItem } from "../../server/src/game/smith";
import { addItem } from "../../server/src/game/inventory";
import type { Player } from "../../server/src/game/Player";
import { failLevel, MATERIALS, MAX_PLUS, PLUS_BONUS, REF_PLUS, SMITH, stepFor, UPGRADE_LEVELS } from "../../shared/upgrade";
import { effStats, itemName, makeItem, Rarity, type Item } from "../../shared/items";
import { LEGENDARIES, makeLegendary } from "../../shared/legendary";
import { ownAppearance, gearStrings } from "../../shared/transmog";
import { ENCHANT_B, ENCHANT_THRESHOLDS, ENCHANT_VISUAL, enchantContrast, enchantIconColor, enchantTier, enchantTierB, nextTierPlus, visualTier } from "../../shared/gearFx";
import up from "../../data/upgrade.json";
import { assert, done, section, test, withRandom } from "./lib";
import { at, countIn, drop, emptyBag, hero, stack, world, type Hero } from "./fixtures";

const w = world();
const noLock = () => false;
function smith(gold = 1e7): Hero {
  const p = hero(w, "warrior", undefined, 60);
  emptyBag(p);
  at(p, SMITH);
  p.save.gold = gold;
  return p;
}
/** Ровно материалы шага (стопками по 99). */
function mats(p: Player, ore: number, dust: number) {
  p.save.inventory = p.save.inventory.map((it) => (it && (it.base === "ash_ore" || it.base === "star_dust") ? null : it));
  for (let n = ore; n > 0; n -= 99) addItem(p, stack("ash_ore", Math.min(99, n)));
  for (let n = dust; n > 0; n -= 99) addItem(p, stack("star_dust", Math.min(99, n)));
}
const snap = (p: Player) => JSON.stringify({ inv: p.save.inventory, eq: p.save.equip, gold: p.save.gold });
const IDX = 20;
const PLUS = Array.from({ length: MAX_PLUS + 1 }, (_, i) => i);

// ---------------------------------------------------------------- таблица
section("Заточка: таблица +1…+15");

await test("15 шагов, MAX_PLUS = 15, у каждого шага целые золото, руда, пыль ≥ 0 и шанс 1…100", () => {
  assert.equal(MAX_PLUS, 15);
  assert.equal(UPGRADE_LEVELS.length, 15);
  for (let i = 0; i < MAX_PLUS; i++) {
    const s = stepFor(i)!;
    assert.ok(s, `нет шага с +${i}`);
    for (const k of ["gold", "ore", "dust", "chance"] as const) assert.ok(Number.isInteger(s[k]) && s[k] >= 0, `+${i}.${k} = ${s[k]}`);
    assert.ok(s.chance >= 1 && s.chance <= 100, `+${i}: шанс ${s.chance}`);
  }
  assert.equal(stepFor(MAX_PLUS), undefined);
  assert.equal(stepFor(-1), undefined);
});

await test("цены и материалы не дешевеют, шанс не растёт; +1…+5 — 100 % и без пыли; +11…+15 — рискованные (≤ 15 %)", () => {
  for (let i = 1; i < MAX_PLUS; i++) {
    const a = stepFor(i - 1)!, b = stepFor(i)!;
    assert.ok(b.gold > a.gold, `золото +${i}`);
    assert.ok(b.ore >= a.ore && b.dust >= a.dust, `материалы +${i}`);
    assert.ok(b.chance <= a.chance, `шанс +${i}`);
  }
  for (let i = 0; i < 5; i++) assert.deepEqual([stepFor(i)!.chance, stepFor(i)!.dust], [100, 0], `+${i + 1}`);
  for (let i = 10; i < 15; i++) assert.ok(stepFor(i)!.chance <= 50, `+${i + 1}: ${stepFor(i)!.chance} %`);
  assert.equal(REF_PLUS, up.refPlus);
  assert.ok(REF_PLUS <= MAX_PLUS);
});

await test("failLevel: на +0…+7 уровень сохраняется, с +8 — минус один, не ниже +7 (владелец 2026-11-02)", () => {
  for (const p of PLUS) {
    const f = failLevel(p);
    assert.equal(f, p < 8 ? p : p - 1, `+${p}`);
    assert.ok(p < 8 || f >= 7, `+${p} не ниже +7`);
    assert.ok(f >= 0 && f <= p);
  }
  assert.equal(failLevel(0), 0);
  assert.equal(failLevel(7), 7);
  assert.equal(failLevel(8), 7);
  assert.equal(failLevel(9), 8);
});

await test("бонус effStats по всем уровням: урон, броня и главная характеристика +ceil(x × bonus × plus), остальное не меняется", () => {
  const it = makeItem("greatsword", 60, Rarity.Epic, () => 0.5);
  const s0 = it.stats;
  const main = (["str", "agi", "int", "vit"] as const).filter((k) => s0[k]).sort((a, b) => s0[b]! - s0[a]!)[0];
  let prev = effStats(it);
  for (const plus of PLUS) {
    const s = effStats({ ...it, plus });
    for (const k of Object.keys(s0) as (keyof typeof s0)[]) {
      const grows = k === "dmgMin" || k === "dmgMax" || k === "armor" || k === main;
      assert.equal(s[k], grows ? s0[k]! + Math.ceil(s0[k]! * PLUS_BONUS * plus) : s0[k], `+${plus} ${k}`);
      assert.ok(s[k]! >= prev[k]!, `+${plus} ${k} упало`);
    }
    prev = s;
  }
  assert.equal(PLUS_BONUS, up.bonusPerLevel);
  assert.deepEqual(effStats({ ...it, plus: 0 }), s0);
});

// ---------------------------------------------------------------- сервер: каждый шаг
section("Заточка: каждый шаг на сервере");

await test("удача на каждом шаге +0→+15: уровень +1, списаны ровно золото, руда и пыль шага; бонус растёт", () => {
  const p = smith();
  try {
    const it = makeItem("greatsword", 60, Rarity.Rare);
    p.save.inventory[IDX] = it;
    for (let plus = 0; plus < MAX_PLUS; plus++) {
      const st = stepFor(plus)!;
      mats(p, st.ore + 3, st.dust + 2);
      const g = p.save.gold;
      withRandom([0], () => upgradeItem(w, p, IDX, undefined, noLock));
      assert.equal(it.plus, plus + 1, `+${plus}: ${p.box.errors().slice(-1)}`);
      assert.equal(p.save.gold, g - st.gold, `+${plus}: золото`);
      assert.equal(countIn(p.save.inventory, "ash_ore"), 3, `+${plus}: руда`);
      assert.equal(countIn(p.save.inventory, "star_dust"), 2, `+${plus}: пыль`);
    }
    assert.equal(itemName(it), `${it.name} +15`);
  } finally { drop(w, p); }
});

await test("граница шанса на каждом шаге: бросок чуть ниже шанса — удача, ровно шанс — неудача (failLevel); ресурсы списаны и там, и там", () => {
  const p = smith();
  try {
    for (let plus = 0; plus < MAX_PLUS; plus++) {
      const st = stepFor(plus)!;
      for (const [roll, win] of [[st.chance / 100 - 1e-9, true], [st.chance / 100, false]] as const) {
        if (st.chance >= 100 && !win) continue; // бросок всегда < 1: 100 % не проваливается
        const it: Item = { ...makeItem("hammer", 50, Rarity.Common), ...(plus ? { plus } : {}) };
        p.save.inventory[IDX] = it;
        mats(p, st.ore, st.dust);
        const g = p.save.gold;
        withRandom([roll], () => upgradeItem(w, p, IDX, undefined, noLock));
        assert.equal(it.plus ?? 0, win ? plus + 1 : failLevel(plus), `+${plus}, бросок ${roll}`);
        assert.equal(p.save.gold, g - st.gold);
        assert.equal(countIn(p.save.inventory, "ash_ore") + countIn(p.save.inventory, "star_dust"), 0);
        assert.notEqual(it.plus, 0, "plus: 0 записан полем (должен удаляться)");
      }
    }
  } finally { drop(w, p); }
});

await test("100 % шаги не проваливаются даже при броске 0.9999999", () => {
  const p = smith();
  try {
    const it = makeItem("hammer", 50, 0);
    p.save.inventory[IDX] = it;
    for (let plus = 0; plus < MAX_PLUS && stepFor(plus)!.chance >= 100; plus++) {
      mats(p, stepFor(plus)!.ore, stepFor(plus)!.dust);
      withRandom([0.9999999], () => upgradeItem(w, p, IDX, undefined, noLock));
      assert.equal(it.plus, plus + 1);
    }
  } finally { drop(w, p); }
});

await test("+15 — предел: отказ, ничего не списано; +16 и больше (битое сохранение) — тоже отказ", () => {
  const p = smith();
  try {
    mats(p, 300, 200);
    for (const plus of [15, 16, 99]) {
      p.save.inventory[IDX] = { ...makeItem("greatsword", 60, 2), plus };
      const s = snap(p);
      withRandom([0], () => upgradeItem(w, p, IDX, undefined, noLock));
      assert.equal(snap(p), s, `+${plus}`);
    }
    assert.equal(p.box.errors().length, 3);
  } finally { drop(w, p); }
});

await test("золото: на 1 меньше цены шага — отказ без списаний; ровно цена — проходит, остаётся 0 (на +1, +6, +11, +15)", () => {
  for (const plus of [0, 5, 10, 14]) {
    const st = stepFor(plus)!;
    const p = smith(st.gold - 1);
    try {
      p.save.inventory[IDX] = { ...makeItem("greatsword", 60, 1), ...(plus ? { plus } : {}) };
      mats(p, st.ore, st.dust);
      const s = snap(p);
      withRandom([0], () => upgradeItem(w, p, IDX, undefined, noLock));
      assert.equal(snap(p), s, `+${plus}: при нехватке золота что-то списано`);
      p.save.gold = st.gold;
      withRandom([0], () => upgradeItem(w, p, IDX, undefined, noLock));
      assert.equal(p.save.inventory[IDX]!.plus, plus + 1);
      assert.equal(p.save.gold, 0);
    } finally { drop(w, p); }
  }
});

await test("материалы: руды или пыли на 1 меньше — отказ, золото и материалы на месте; материалы из нескольких стопок списываются верно", () => {
  for (const plus of [5, 12, 14]) {
    const st = stepFor(plus)!;
    for (const [ore, dust] of [[st.ore - 1, st.dust], [st.ore, st.dust - 1]]) {
      const p = smith();
      try {
        p.save.inventory[IDX] = { ...makeItem("greatsword", 60, 1), plus };
        mats(p, ore, dust);
        const s = snap(p);
        withRandom([0], () => upgradeItem(w, p, IDX, undefined, noLock));
        assert.equal(snap(p), s, `+${plus}: руда ${ore}/${st.ore}, пыль ${dust}/${st.dust}`);
      } finally { drop(w, p); }
    }
  }
  const p = smith();
  try {
    const st = stepFor(13)!;
    p.save.inventory[IDX] = { ...makeItem("greatsword", 60, 1), plus: 13 };
    [10, 10, st.ore - 20 + 5].forEach((n, k) => (p.save.inventory[2 + k] = stack("ash_ore", n)));
    p.save.inventory[1] = stack("star_dust", st.dust);
    withRandom([0], () => upgradeItem(w, p, IDX, undefined, noLock));
    assert.equal(countIn(p.save.inventory, "ash_ore"), 5);
    assert.equal(countIn(p.save.inventory, "star_dust"), 0);
    assert.ok(!p.save.inventory.some((x) => x && x.qty === 0), "пустая стопка осталась в сумке");
  } finally { drop(w, p); }
});

await test("одна транзакция: при каждом отказе (далеко, мёртв, арена, обмен, расходник, пусто, неверный индекс/слот) ничего не меняется", () => {
  const p = smith();
  try {
    mats(p, 200, 100);
    p.save.inventory[IDX] = makeItem("greatsword", 60, 1);
    p.save.inventory[IDX + 1] = { ...makeItem("hp_potion", 1, 0), qty: 3 };
    const s = snap(p);
    withRandom([0], () => {
      upgradeItem(w, p, IDX, undefined, (i) => i === IDX);
      upgradeItem(w, p, IDX + 1, undefined, noLock);
      upgradeItem(w, p, IDX + 2, undefined, noLock);
      for (const bad of [-1, 1e9, 0.5, "20", NaN, null, {}]) upgradeItem(w, p, bad, undefined, noLock);
      for (const slot of ["__proto__", "constructor", "bank", 3, "helmet"]) upgradeItem(w, p, undefined, slot, noLock);
      p.dead = true; upgradeItem(w, p, IDX, undefined, noLock); p.dead = false;
      p.team = 1; upgradeItem(w, p, IDX, undefined, noLock); p.team = 0;
      p.unit.x += 5000; upgradeItem(w, p, IDX, undefined, noLock);
    });
    assert.equal(snap(p), s);
  } finally { drop(w, p); }
});

await test("надетая вещь: заточка меняет строку оружия (u.weapon) и характеристики, здоровье в той же доле", () => {
  const p = smith();
  try {
    p.save.equip.weapon = { ...makeItem("greatsword", 60, Rarity.Epic), plus: 10 };
    p.recalc();
    const dmg = p.derived.dmgMax ?? 0;
    p.unit.hp = Math.round(p.unit.maxHp / 2);
    mats(p, stepFor(10)!.ore, stepFor(10)!.dust);
    withRandom([0], () => upgradeItem(w, p, undefined, "weapon", noLock));
    assert.equal(p.save.equip.weapon!.plus, 11, p.box.errors().join(" | "));
    assert.equal(p.unit.weapon.split(":")[2], "11");
    if (dmg) assert.ok((p.derived.dmgMax ?? 0) > dmg);
    assert.ok(Math.abs(p.unit.hp / p.unit.maxHp - 0.5) < 0.02);
  } finally { drop(w, p); }
});

await test("перекованная вещь: заточка своя, вид сохраняется; в строке — вид донора и плюс вещи", () => {
  const p = smith();
  try {
    const donor = { ...makeItem("hammer", 100, Rarity.Epic), plus: 15 };
    p.save.equip.weapon = { ...makeItem("greatsword", 20, Rarity.Common), plus: 7, appearance: ownAppearance(donor) };
    mats(p, stepFor(7)!.ore, stepFor(7)!.dust);
    withRandom([0], () => upgradeItem(w, p, undefined, "weapon", noLock));
    const [base, r, plus] = p.unit.weapon.split(":");
    assert.deepEqual([base, Number(r), Number(plus)], ["hammer", Rarity.Epic, 8]);
    assert.equal(p.save.equip.weapon!.appearance?.base, "hammer");
  } finally { drop(w, p); }
});

// ---------------------------------------------------------------- ступени свечения
section("Заточка: ступени свечения");

await test("герой Б (вариант D): ступень 0 на +0…+4, 1 на +5…+7, 2 на +8…+10, 3 на +11…+15; пороги 5/8/11 из data/gear-fx.json", () => {
  assert.deepEqual(ENCHANT_B.thresholds, [5, 8, 11]);
  assert.ok(ENCHANT_B.visual, "свечение героя Б выключено");
  for (const p of PLUS) assert.equal(enchantTierB(p), p >= 11 ? 3 : p >= 8 ? 2 : p >= 5 ? 1 : 0, `+${p}`);
  for (const p of PLUS) assert.ok(/^#[0-9a-f]{6}$/i.test(enchantIconColor(p)), `цвет +${p}`);
  assert.equal(new Set([0, 5, 8, 11].map(enchantIconColor)).size, 4, "у ступеней одинаковые цвета «+N»");
});

await test("прежний герой: визуал выключен — visualTier = 0 на любом плюсе; enchantTier и nextTierPlus — по порогам enchant", () => {
  assert.equal(ENCHANT_VISUAL, false);
  for (const p of PLUS) {
    assert.equal(visualTier(p), 0);
    assert.equal(enchantTier(p), ENCHANT_THRESHOLDS.filter((t) => p >= t).length);
    const nx = nextTierPlus(p);
    assert.equal(nx, ENCHANT_THRESHOLDS.find((t) => p < t) ?? null);
  }
});

await test("ступень одинакова для любой редкости и легендарки: плюс в строке оружия и щита не зависит от редкости и вида", () => {
  const leg = Object.values(LEGENDARIES).find((l) => l.base === "greatsword" || l.base === "hammer");
  for (const plus of PLUS) {
    const tiers = new Set<number>();
    const items: Item[] = [0, 1, 2].map((r) => ({ ...makeItem("greatsword", 60, r as Rarity), plus }));
    if (leg) items.push({ ...makeLegendary(leg.id), plus });
    items.push({ ...makeItem("greatsword", 60, 0), plus, appearance: ownAppearance(leg ? makeLegendary(leg.id) : makeItem("greatsword", 60, 2)) });
    for (const it of items) {
      const sp = Number(gearStrings({ weapon: it }).weapon.split(":")[2]);
      assert.equal(sp, plus);
      tiers.add(enchantTierB(sp));
      const sh = { ...makeItem("shield", 60, it.rarity === 3 ? 2 : it.rarity), plus };
      tiers.add(enchantTierB(Number(gearStrings({ offhand: sh }).gear.split("|")[3].split(":")[1])));
    }
    assert.equal(tiers.size, 1, `+${plus}: разные ступени ${[...tiers]}`);
  }
});

await test("контраст свечения: на ступенях 1–3 и плюсах до +15 для тёмного, красного, светлого, среднего и неизвестного оружия — цвета валидны", () => {
  const hex = /^#[0-9a-f]{6}$/i;
  for (const tier of [1, 2, 3] as const) for (const plus of PLUS.filter((p) => enchantTierB(p) === tier)) {
    for (const avg of [[20, 20, 25], [180, 30, 30], [220, 225, 230], [120, 110, 100], null]) {
      const l = enchantContrast(tier, plus, avg);
      assert.ok(hex.test(l.color), `${tier}/${plus}/${avg}: ${l.color}`);
      if (l.color2) assert.ok(hex.test(l.color2));
      assert.ok(l.gapAlpha >= 0 && l.gapAlpha <= 1);
    }
  }
});

await test("материалы кузнеца в данных: руда и пыль с ценой > 0, иконка mat_<id>", () => {
  for (const id of ["ash_ore", "star_dust"]) {
    assert.ok(MATERIALS[id], id);
    assert.ok(MATERIALS[id].price > 0);
    assert.equal(MATERIALS[id].icon, `mat_${id}`);
  }
});

done();
