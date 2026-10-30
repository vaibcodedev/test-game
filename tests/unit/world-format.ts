/**
 * Чистые форматтеры интерфейса без браузера: числа и золото (client/src/ui/gold.ts — разделители, округление, монета в тексте и
 * что НЕ считается золотом), время до конца (shared/dungeon.ts fmtLeft), параметры легендарок (shared/legendary.ts fmtParam).
 * Запуск: npx tsx tests/unit/world-format.ts
 */
import { formatNumber, gold, goldify } from "../../client/src/ui/gold";
import { fmtLeft } from "../../shared/dungeon";
import { fmtParam } from "../../shared/legendary";
import { assert, done, section, test } from "./lib";

section("Числа и золото");

await test("formatNumber: разделитель тысяч — обычный пробел, округление, отрицательные и ноль", () => {
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(999), "999");
  assert.equal(formatNumber(1234567), "1 234 567");
  assert.equal(formatNumber(1499.6), "1 500");
  assert.ok(/^[-−]2 500$/.test(formatNumber(-2500)), formatNumber(-2500));
  assert.ok(!/[  ]/.test(formatNumber(1e9)), "неразрывный пробел");
});

await test("gold: число с разделителем и монетой, префикс перед числом", () => {
  const h = gold(12000, "+");
  assert.ok(h.includes("+12 000") && h.includes("coin.png"), h);
});

await test("goldify: «N з», «N золота», «N золото» → монета; число с пробелами склеивается", () => {
  const a = goldify("Цена: 1 200 золота");
  assert.ok(a.includes("1 200") && a.includes("coin"), a);
  assert.ok(goldify("Награда 50 з.").includes("50<img"), goldify("Награда 50 з."));
  assert.ok(goldify("Осталось 7 золото").includes("coin"));
});

await test("goldify: слова на «з» и «золот…» — не золото", () => {
  for (const s of ["5 зелий", "10 золотых монет?", "уровень 5 за 10 минут", "3 звезды"]) assert.equal(goldify(s), s, s);
});

section("Время и параметры");

await test("fmtLeft: часы:минуты, округление минут вверх", () => {
  assert.equal(fmtLeft(0), "0:00");
  assert.equal(fmtLeft(1), "0:01");
  assert.equal(fmtLeft(60000), "0:01");
  assert.equal(fmtLeft(60001), "0:02");
  assert.equal(fmtLeft(90 * 60000), "1:30");
  assert.equal(fmtLeft(25 * 3600000), "25:00");
});

await test("fmtParam: доли — в процентах, мс — в секундах, десятичная запятая, одна цифра после", () => {
  assert.equal(fmtParam("chance", 0.125), "12,5");
  assert.equal(fmtParam("ms", 2500), "2,5");
  assert.equal(fmtParam("cd", 30000), "30");
  assert.equal(fmtParam("n", 3), "3");
  assert.equal(fmtParam("pct", 0.3333), "33,3");
});

done();
