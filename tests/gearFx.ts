/** Ступени заточки (docs/art/gear.md, критерий 15): enchantTier(0..10) и тексты эффектов. Запуск: npx tsx tests/gearFx.ts */
import assert from "node:assert/strict";
import { ENCHANT_COLOR, enchantTier, fxText, nextTierPlus, smithNextText } from "../shared/gearFx";
import { RARITY_COLORS } from "../shared/items";

assert.deepEqual(Array.from({ length: 11 }, (_, i) => enchantTier(i)), [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3]);
assert.equal(enchantTier(-1), 0);
assert.equal(enchantTier(99), 3);
assert.equal(nextTierPlus(0), 4);
assert.equal(nextTierPlus(6), 7);
assert.equal(nextTierPlus(10), null);
assert.ok(!RARITY_COLORS.includes(ENCHANT_COLOR), "цвет заточки не должен совпадать с цветом редкости");
assert.equal(fxText("weapon", 0), "эффекта на герое нет");
assert.match(fxText("weapon", 7), /^Заточка \+7: яркий/);
assert.match(fxText("weapon", 7, "storm_blade"), /Тема: искры у клинка/);
assert.match(fxText("boots", 0, "hunter_treads"), /Тема: крылья у ступней/);
// зона темы оружия зависит от базы: посох и скипетр у навершия, лук у плеч, остальное у клинка
assert.match(fxText("weapon", 0, "nova_staff"), /у навершия/);
assert.match(fxText("weapon", 0, "sun_scepter"), /у навершия/);
assert.match(fxText("weapon", 0, "winter_bow"), /у плеч лука/);
assert.match(fxText("weapon", 0, "shadow_fang"), /у клинка/);
assert.match(fxText("ring", 10), /не рисуется/);
assert.equal(smithNextText("ring", 3), "");
assert.match(smithNextText("helmet", 3), /^На \+4 появится: /);
console.log("  ok   gearFx");
