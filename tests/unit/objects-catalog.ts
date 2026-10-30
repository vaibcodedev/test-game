/**
 * Каталог объектов (docs/art/objects.md, data/objects-catalog.json): всё, что расставляет генерация карт, есть в каталоге
 * с названием и категорией; каталог в файле не устарел. Новый объект без записи — тест падает (допиши tools/objects-names.ts и запусти npx tsx tools/objects-catalog.ts).
 */
import fs from "node:fs";
import { MAP_SEED } from "../../shared/constants";
import { generateMap } from "../../shared/map";
import { generateDungeonMap } from "../../shared/dungeon";
import { generateRaidMap } from "../../shared/raid";
import { INTERIORS } from "../../shared/interiors";
import { buildCatalog } from "../../tools/objects-catalog";
import { CATEGORIES } from "../../tools/objects-names";
import { assert, done, section, test } from "./lib";

const cat = buildCatalog();
const byId = new Map([...cat.objects, ...cat.unused, ...cat.soon, ...cat.questionable].map((e) => [e.id, e]));

section("каталог объектов");
const placed = new Map<string, string>();
for (const o of generateMap(MAP_SEED).objects) placed.set(o.kind, "мир");
for (const o of generateDungeonMap().objects) if (!placed.has(o.kind)) placed.set(o.kind, "подземелье");
for (const o of generateRaidMap().objects) if (!placed.has(o.kind)) placed.set(o.kind, "рейд");
for (const r of INTERIORS) for (const p of r.props) if (!placed.has(p.kind)) placed.set(p.kind, "интерьер");

await test(`все расставляемые объекты (${placed.size}) есть в каталоге`, () => {
  const miss = [...placed].filter(([k]) => !cat.objects.some((e) => e.id === k)).map(([k, w]) => `${k} (${w})`);
  assert.equal(miss.length, 0, `нет в каталоге: ${miss.join(", ")}`);
});
await test("у каждого объекта непустое название (не «?») и известная категория", () => {
  const bad = [...byId.values()].filter((e) => !e.name || e.name === "?" || e.name.includes("?") || !(CATEGORIES as readonly string[]).includes(e.category));
  assert.equal(bad.length, 0, `без названия или категории: ${bad.map((e) => e.id).join(", ")}`);
});
await test("расставленный объект имеет место в «где»", () => {
  const bad = cat.objects.filter((e) => placed.has(e.id) && !(e.where.worldTotal || e.where.dungeon || e.where.raid || Object.keys(e.where.interiors).length));
  assert.equal(bad.length, 0, bad.map((e) => e.id).join(", "));
});
await test("data/objects-catalog.json совпадает с картой (запусти tools/objects-catalog.ts)", () => {
  const file = JSON.parse(fs.readFileSync("data/objects-catalog.json", "utf8")) as { objects: { id: string }[] };
  const ids = new Set(file.objects.map((e) => e.id));
  const miss = [...placed.keys()].filter((k) => !ids.has(k));
  assert.equal(miss.length, 0, `в файле каталога нет: ${miss.join(", ")}`);
});
done();
