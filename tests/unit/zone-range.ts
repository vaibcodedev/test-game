/**
 * Зоны карт: каждое значение m.zone на всех картах (мир, подземелье, рейд, арены) — валидная зона из ZONES,
 * zoneAtPx везде (в т. ч. за краем и в залах интерьеров) даёт зону из ZONES. Иначе ZONES[z].levels падает в GameScene/hud.
 * Запуск: npx tsx tests/unit/zone-range.ts
 */
import { assert, done, section, test } from "./lib";
import { generateMap, zoneAtPx, ZONES, ZONE_COUNT, type WorldMap } from "../../shared/map";
import { generateDungeonMap } from "../../shared/dungeon";
import { generateRaidMap } from "../../shared/raid";
import { generateArenaMap } from "../../shared/arena";
import { ARENA_IDS } from "../../shared/arenaCrowd";
import { MAP_SEED, TILE } from "../../shared/constants";

const maps: [string, WorldMap][] = [["world", generateMap(MAP_SEED)], ["dungeon", generateDungeonMap()], ["raid", generateRaidMap()], ...ARENA_IDS.map((id) => [`arena:${id}`, generateArenaMap(id)] as [string, WorldMap])];

section("значения zone ∈ [0, ZONE_COUNT)");
for (const [name, m] of maps) await test(name, () => {
  const bad = new Map<number, number>();
  for (let i = 0; i < m.zone.length; i++) { const z = m.zone[i]; if (!(z < ZONE_COUNT)) bad.set(z, (bad.get(z) ?? 0) + 1); }
  assert(bad.size === 0, `${name}: неверные зоны ${JSON.stringify([...bad])}`);
});

section("zoneAtPx всегда даёт зону из ZONES");
for (const [name, m] of maps) await test(name, () => {
  let n = 0;
  const probe = (px: number, py: number) => { const z = zoneAtPx(m, px, py); if (!ZONES[z]) { if (n++ < 3) console.log(name, "px", px, py, "->", z); } };
  for (let y = -3; y < m.h + 3; y += 3) for (let x = -3; x < m.w + 40 && x < m.w + 400; x += 3) probe(x * TILE + 5, y * TILE + 5);
  assert(n === 0, `${name}: ${n} точек вне ZONES`);
});
section("плохой вход не роняет");
await test("NaN и пустая карта — зона из ZONES", () => {
  const w = maps[0][1];
  assert(ZONES[zoneAtPx(w, NaN, 5)] && ZONES[zoneAtPx(w, 5, Infinity)], "NaN/Infinity");
  assert(ZONES[zoneAtPx({ ...w, zone: new Uint8Array(0) } as WorldMap, 5, 5)], "пустая zone");
});
await done();
