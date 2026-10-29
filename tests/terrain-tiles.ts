/**
 * Офлайн-проверка тайлов земли (баг новой карты, задача 132: клиент падал в terrain.ts createChunk — Phaser PutTileAt читал
 * tiles[index] = undefined — у Аурелиона (1808, 5776)). Без браузера строит индексы тайлов всех кусков мира, арены и рейда тем же кодом,
 * что клиент (client/src/game/terrainTiles.ts), и сверяет каждый с набором terrain.png так, как его режет Phaser (Tileset.updateTileData
 * и BuildTilesetIndex: tiles[0 … строк×столбцов − 1]); падает на индексе вне набора, не целом или undefined (чтение за краем слоя),
 * на строке не той длины и на тайле чужой поверхности. Ещё: вершины vtx — известные поверхности (TERRAIN_KEYS), каждый тайл, что
 * встречается на картах, в наборе нарисован, у кусков с точками появления в столицах есть земля.
 * Намеренные поломки (набор без строки стен, поверхность без строки, короткий vtx, слой с индексом вне набора и с дырой) ловятся.
 * Само падение было не в данных: сцену мира запускали до конца загрузки набора (браузерная проверка удалена после приёмки).
 * Запуск: npx tsx tests/terrain-tiles.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { generateArenaMap } from "../shared/arena";
import { homeCity } from "../shared/cities";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, SHORE_BIOMES, SHORE_COLS, SHORE_GID, SHORE_VARIANTS, TERRAIN_COUNT, TERRAIN_KEYS, type WorldMap } from "../shared/map";
import { generateRaidMap } from "../shared/raid";
import { generateDungeonMap } from "../shared/dungeon";
import { CHUNK, chunkRect, chunkRows, COLS, terrainLayers } from "../client/src/game/terrainTiles";

let failed = 0;
const ok = (s: string) => console.log("  ok   " + s);
const fail = (s: string) => { failed++; console.log("  FAIL " + s); };

const img = PNG.sync.read(fs.readFileSync(path.resolve("client/public/assets/tiles/terrain.png")));
/** Набор тайлов, как его режет Phaser: целые столбцы и строки по TILE, тайлы 0 … rows×cols − 1 (tiles[i] = [x, y, номер набора]). */
function tilesetOf(w: number, h: number) {
  const cols = Math.floor(w / TILE), rows = Math.floor(h / TILE);
  const tiles: [number, number, number][] = [];
  for (let i = 0; i < rows * cols; i++) tiles[i] = [(i % cols) * TILE, Math.floor(i / cols) * TILE, 0];
  return { cols, rows, tiles };
}
/** Есть ли в тайле i набора хоть один непрозрачный пиксель. */
const drawn = (i: number) => {
  const x0 = (i % COLS) * TILE, y0 = Math.floor(i / COLS) * TILE;
  for (let y = y0; y < y0 + TILE; y++) for (let x = x0; x < x0 + TILE; x++) if (img.data[(y * img.width + x) * 4 + 3] > 0) return true;
  return false;
};

/** Ошибки карты m (до limit штук): вершины, куски и их индексы — как они уйдут в putTilesAt. used — какие тайлы встретились. */
function problems(name: string, m: WorldMap, layers: (ArrayLike<number> | null)[], tiles: unknown[], used?: Set<number>, limit = 5) {
  const out: string[] = [];
  const add = (s: string) => { if (out.length < limit) out.push(`${name}: ${s}`); };
  const W = m.w + 1;
  if (m.vtx.length !== W * (m.h + 1)) add(`vtx — ${m.vtx.length} вершин, а нужно (w+1)×(h+1) = ${W * (m.h + 1)}`);
  for (let i = 0; i < m.vtx.length && out.length < limit; i++) {
    const v = m.vtx[i];
    if (!(v < TERRAIN_COUNT) || TERRAIN_KEYS[v] === undefined) add(`вершина (${i % W}, ${Math.floor(i / W)}) ≈ (${(i % W) * TILE}, ${Math.floor(i / W) * TILE}) px: поверхность ${v} — в наборе нет её строки (TERRAIN_COUNT ${TERRAIN_COUNT})`);
  }
  const NX = Math.ceil(m.w / CHUNK), NY = Math.ceil(m.h / CHUNK);
  for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
    const { x0, y0, cw, ch } = chunkRect(m, cx, cy);
    if (!(cw > 0 && cw <= CHUNK && ch > 0 && ch <= CHUNK)) add(`кусок (${cx}, ${cy}): размер ${cw}×${ch}`);
    for (let t = 0; t < TERRAIN_COUNT; t++) {
      const src = layers[t];
      if (!src) continue;
      const rows = chunkRows(m, src, x0, y0, cw, ch);
      if (!rows) continue;
      if (rows.length !== ch) add(`кусок (${cx}, ${cy}), слой ${t}: ${rows.length} строк вместо ${ch}`);
      const row0 = t === 0 ? TERRAIN_COUNT : t; // строка набора: поверхность t, стены — строка TERRAIN_COUNT
      for (let j = 0; j < rows.length; j++) {
        if (rows[j].length !== cw) add(`кусок (${cx}, ${cy}), слой ${t}, строка ${j}: ${rows[j].length} тайлов вместо ${cw}`);
        for (let i = 0; i < cw; i++) {
          const v = rows[j][i];
          if (v === -1) continue; // пустая клетка (PutTileAt не трогает набор)
          const at = `кусок (${cx}, ${cy}), слой ${t} (${t ? TERRAIN_KEYS[t] : "стены данжа"}), тайл (${x0 + i}, ${y0 + j}) ≈ (${(x0 + i) * TILE + 16}, ${(y0 + j) * TILE + 16}) px`;
          if (typeof v === "number" && v >= SHORE_GID) { // автотайл берега (shores.png, tools/gen/shores.ts)
            const k = v - SHORE_GID;
            if (!SHORE_BIOMES.includes(t) || k % SHORE_COLS >= 15 || Math.floor(k / SHORE_COLS) >= SHORE_BIOMES.length * SHORE_VARIANTS) add(`${at}: индекс берега ${v} вне shores.png или у поверхности без берега`);
            else shoreUsed.add(k);
            continue;
          }
          // как Phaser PutTileAt: tiles[index][2] — undefined вне набора
          if (typeof v !== "number" || !Number.isInteger(v) || tiles[v] === undefined) add(`${at}: индекс ${v} — в наборе ${tiles.length} тайлов`);
          else if (Math.floor(v / COLS) !== row0) add(`${at}: индекс ${v} из строки ${Math.floor(v / COLS)} набора, а слой рисует строку ${row0}`);
          else used?.add(v);
        }
      }
    }
  }
  return out;
}

const shores = PNG.sync.read(fs.readFileSync(path.resolve("client/public/assets/tiles/shores.png")));
const shoreUsed = new Set<number>();
// ---- набор terrain.png ----
const set = tilesetOf(img.width, img.height);
if (img.width % TILE || img.height % TILE) fail(`terrain.png ${img.width}×${img.height} не кратен тайлу ${TILE}`);
if (set.cols !== COLS || set.rows !== TERRAIN_COUNT + 1) fail(`terrain.png: ${set.cols}×${set.rows} тайлов, а клиент ждёт ${COLS}×${TERRAIN_COUNT + 1} (поверхности и строка стен; npm run assets)`);
else ok(`набор terrain.png ${img.width}×${img.height}: ${set.cols}×${set.rows} = ${set.tiles.length} тайлов, как у клиента`);

// ---- карты: мир, арена, рейд ----
const t0 = Date.now();
const world = generateMap(MAP_SEED);
const maps: [string, WorldMap][] = [["мир", world], ["арена", generateArenaMap()], ["рейд", generateRaidMap()], ["подземелье", generateDungeonMap()]];
const used = new Set<number>();
const worldLayers = terrainLayers(world);
for (const [name, m] of maps) {
  const layers = m === world ? worldLayers : terrainLayers(m);
  const p = problems(name, m, layers, set.tiles, used);
  const NX = Math.ceil(m.w / CHUNK), NY = Math.ceil(m.h / CHUNK);
  if (p.length) fail(`${name}: индексы тайлов не годятся для набора —\n       ` + p.join("\n       "));
  else ok(`${name} ${m.w}×${m.h}: все ${NX * NY} кусков, ${layers.filter(Boolean).length} слоёв — индексы в наборе, своей строки, без дыр; вершины — известные поверхности`);
}
const blank = [...used].filter((i) => !drawn(i));
if (blank.length) fail(`в наборе не нарисованы тайлы, что есть на картах: ${blank.slice(0, 10).join(", ")}${blank.length > 10 ? "…" : ""} (строки ${[...new Set(blank.map((i) => Math.floor(i / COLS)))].join(", ")})`);
else ok(`все ${used.size} тайлов, что встречаются на картах, в наборе нарисованы`);

{
  const ok1 = shores.width === SHORE_COLS * TILE && shores.height === SHORE_BIOMES.length * SHORE_VARIANTS * TILE;
  const blankS = [...shoreUsed].filter((k) => { const x0 = (k % SHORE_COLS) * TILE, y0 = Math.floor(k / SHORE_COLS) * TILE; for (let y = y0; y < y0 + TILE; y++) for (let x = x0; x < x0 + TILE; x++) if (shores.data[(y * shores.width + x) * 4 + 3] > 0) return false; return true; });
  if (!ok1) fail(`shores.png ${shores.width}×${shores.height}, ждём ${SHORE_COLS * TILE}×${SHORE_BIOMES.length * SHORE_VARIANTS * TILE} (npx tsx tools/gen/shores.ts)`);
  else if (blankS.length) fail(`в shores.png пустые тайлы берега, что есть на карте: ${blankS.slice(0, 10).join(", ")}`);
  else ok(`берег автотайлами: ${shoreUsed.size} разных тайлов shores.png на картах, все нарисованы`);
}
// ---- куски у столиц (там падал клиент: точка появления новых героев) ----
for (const f of ["solgard", "umbrath"]) {
  const c = homeCity(f), cx = Math.floor(c.spawn.x / TILE / CHUNK), cy = Math.floor(c.spawn.y / TILE / CHUNK);
  const { x0, y0, cw, ch } = chunkRect(world, cx, cy);
  const n = worldLayers.filter((src) => src && chunkRows(world, src, x0, y0, cw, ch)).length;
  if (!n) fail(`${c.name}: у куска (${cx}, ${cy}) с точкой появления (${c.spawn.x}, ${c.spawn.y}) нет земли`);
  else ok(`${c.name}: кусок (${cx}, ${cy}) с точкой появления (${c.spawn.x}, ${c.spawn.y}) — слоёв земли ${n}`);
}

// ---- намеренные поломки: проверка должна их ловить ----
const sp = homeCity("solgard").spawn, stx = Math.floor(sp.x / TILE), sty = Math.floor(sp.y / TILE);
const mutants: [string, () => string[]][] = [
  ["набор без строки стен данжа", () => { const d = generateDungeonMap(); return problems("подземелье", d, terrainLayers(d), tilesetOf(COLS * TILE, TERRAIN_COUNT * TILE).tiles); }],
  ["набор на строку короче (последняя поверхность без строки)", () => { const d = generateDungeonMap(); return problems("подземелье", d, terrainLayers(d), tilesetOf(COLS * TILE, (TERRAIN_COUNT - 1) * TILE).tiles); }],
  ["новая поверхность у столицы без строки в наборе", () => {
    const vtx = world.vtx.slice();
    vtx[sty * (world.w + 1) + stx] = TERRAIN_COUNT;
    const m = { ...world, vtx };
    return problems("мир", m, terrainLayers(m), set.tiles);
  }],
  ["vtx на строку короче (вершины за краем карты)", () => {
    const m = { ...world, vtx: world.vtx.slice(0, world.vtx.length - (world.w + 1)) };
    return problems("мир", m, terrainLayers(m), set.tiles);
  }],
  ["слой с индексом вне набора у столицы", () => {
    const t = worldLayers.findIndex((src, i) => i > 0 && src && src[sty * world.w + stx] >= 0);
    const layers = worldLayers.slice();
    const bad = Int16Array.from(worldLayers[t]!);
    bad[sty * world.w + stx] = set.tiles.length + 5;
    layers[t] = bad;
    return problems("мир", world, layers, set.tiles);
  }],
  ["слой короче карты (чтение за краем — undefined)", () => {
    // слой обрывается на последнем своём тайле: дальше куски читают undefined
    const t = worldLayers.findIndex((src, i) => i > 0 && !!src);
    const src = worldLayers[t]!;
    let k = src.length - 1;
    while (k > 0 && src[k] < 0) k--;
    const layers: (ArrayLike<number> | null)[] = worldLayers.slice();
    layers[t] = src.subarray(0, k);
    return problems("мир", world, layers, set.tiles);
  }],
];
let caught = 0;
for (const [name, run] of mutants) {
  const p = run();
  if (p.length) caught++;
  else fail(`поломка не поймана: ${name}`);
}
if (caught === mutants.length) ok(`намеренные поломки ловятся: ${caught} из ${mutants.length}`);

console.log(failed ? `terrain-tiles: ошибок ${failed}` : `terrain-tiles: готово за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
process.exit(failed ? 1 : 0);
