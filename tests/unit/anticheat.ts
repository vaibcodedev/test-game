/**
 * Античит без сервера: проверки входящих данных, которые клиент может подделать — вложение очков, изучение умений,
 * панели умений, чат, числа из сообщений. Дальность, откаты, скорость, чужие вещи — в economy.ts, bank-trade.ts, combat.ts.
 * Запуск: npx tsx tests/unit/anticheat.ts
 */
import { Player, newSave } from "../../server/src/game/Player";
import { cleanText, num } from "../../server/src/rooms/common";
import { canLearn, SKILLS } from "../../shared/skills";
import { cleanRef } from "../../shared/hotbar";
import { statPointsAt } from "../../shared/formulas";
import { assert, done, section, test } from "./lib";

const mk = (level = 10) => {
  const s = newSave("warrior", { x: 10, y: 10 });
  s.level = level;
  return new Player("p", "Читер", s, () => {});
};

section("Очки характеристик");

await test("allocate: не больше свободных очков; 0, отрицательное и NaN — отказ без изменений", () => {
  const p = mk(10);
  const free = statPointsAt(10);
  assert.equal(p.statPoints(), free);
  assert.equal(p.allocate("str", 1e6), true);
  assert.equal(p.save.alloc.str, free, "вложено больше свободных");
  assert.equal(p.statPoints(), 0);
  assert.equal(p.allocate("vit", 1), false);
  const q = mk(10);
  for (const n of [0, -5, NaN]) assert.equal(q.allocate("agi", n), false, `n=${n}`);
  assert.deepEqual(q.save.alloc, { str: 0, agi: 0, int: 0, vit: 0 });
});

section("Умения");

await test("canLearn: без очков, сверх максимального ранга, ниже уровня, без требуемого умения — отказ", () => {
  const withReq = Object.values(SKILLS).find((s) => s.req && s.reqLevel > 1)!;
  const top = Object.values(SKILLS).find((s) => s.maxRank >= 1)!;
  assert.ok(canLearn(top, {}, 100, 0), "без очков");
  assert.ok(canLearn(top, { [top.id]: top.maxRank }, 100, 5), "сверх максимума");
  assert.ok(canLearn(withReq, {}, withReq.reqLevel - 1, 5), "ниже уровня");
  assert.ok(canLearn(withReq, {}, 100, 5), "без требуемого умения");
  assert.equal(canLearn(withReq, { [withReq.req!.id]: withReq.req!.rank }, 100, 5), null);
});

await test("панели: нельзя положить умение чужого класса, пассивку, несуществующий предмет и прототипные ключи", () => {
  const foreign = Object.values(SKILLS).find((s) => s.cls !== "warrior" && s.kind === "active")!;
  const own = Object.values(SKILLS).find((s) => s.cls === "warrior" && s.kind === "active")!;
  const passive = Object.values(SKILLS).find((s) => s.cls === "warrior" && s.kind !== "active");
  assert.deepEqual(cleanRef({ s: own.id }, "warrior"), { s: own.id });
  assert.equal(cleanRef({ s: foreign.id }, "warrior"), undefined);
  if (passive) assert.equal(cleanRef({ s: passive.id }, "warrior"), undefined);
  for (const bad of [{ s: "__proto__" }, { s: "constructor" }, { i: "sword" }, { i: "__proto__" }, { a: "hack" }, 5, "x", {}]) assert.equal(cleanRef(bad, "warrior"), undefined, JSON.stringify(bad));
  assert.equal(cleanRef(null, "warrior"), null);
});

section("Входящие данные");

await test("num: только конечные числа, обрезка в диапазон", () => {
  assert.equal(num(5, 0, 10), 5);
  assert.equal(num(-1, 0, 10), 0);
  assert.equal(num(1e308, 0, 10), 10);
  for (const v of [NaN, Infinity, -Infinity, "5", null, undefined, {}, [3]]) assert.equal(num(v, 0, 10), null, String(v));
});

await test("cleanText: вырезает управляющие и невидимые символы (подмена направления текста, нулевая ширина)", () => {
  assert.equal(cleanText("  при​вет‮\u0007  "), "привет");
  assert.equal(cleanText("⁦⁩"), "");
  assert.equal(cleanText("обычный текст 123"), "обычный текст 123");
});

done();
