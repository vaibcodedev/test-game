/**
 * Круг без потерь для Tiled (docs/plan/next.md 1.4; tools/tiled/): generateMap → экспорт в .tmj/.tsx/.world (временная папка) →
 * импорт → тот же WorldMap: vtx, cell, zone побайтно; objects (kind, x, y, label, flip, v, dz и порядок), spawns, bosses, nodes,
 * точки появления и торговцев. Плюс: проверка tools/tiled/validate.ts на исходном мире без ошибок; намеренные поломки ловятся
 * (сдвинутое дерево и стёртая клетка проходимости — круг не сходится; стена поперёк моста — validate видит закрытый проход).
 * Запуск: npx tsx tests/tiled-roundtrip.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAP_SEED } from "../shared/constants";
import { CELL_BLOCK, generateMap, type WorldMap } from "../shared/map";
import { exportWorld } from "../tools/tiled/export";
import { importWorld } from "../tools/tiled/import";
import { validateWorld } from "../tools/tiled/validate";
import { gatherPlacements } from "../tools/tiled/placements";

const t0 = Date.now();
let failed = 0;
const fail = (s: string) => { failed++; console.log("  FAIL " + s); };

/** Отличия двух карт (пустой список — равны). */
function diffMaps(a: WorldMap, b: WorldMap): string[] {
  const d: string[] = [];
  if (a.w !== b.w || a.h !== b.h || a.seed !== b.seed) d.push(`размер/сид: ${a.w}×${a.h}/${a.seed} ≠ ${b.w}×${b.h}/${b.seed}`);
  for (const k of ["vtx", "cell", "zone"] as const) {
    const x = a[k], y = b[k];
    if (x.length !== y.length) { d.push(`${k}: длина ${x.length} ≠ ${y.length}`); continue; }
    let n = 0, first = -1;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) { n++; if (first < 0) first = i; }
    if (n) d.push(`${k}: ${n} отличий, первое [${first}] ${x[first]} ≠ ${y[first]}`);
  }
  const objKey = (o: WorldMap["objects"][number]) => JSON.stringify([o.kind, o.x, o.y, o.label ?? null, !!o.flip, o.v ?? null, o.dz ?? null]);
  const list = <T>(name: string, p: T[], q: T[], key: (v: T) => string) => {
    if (p.length !== q.length) { d.push(`${name}: ${p.length} ≠ ${q.length}`); return; }
    let n = 0, first = "";
    for (let i = 0; i < p.length; i++) if (key(p[i]) !== key(q[i])) { if (!n) first = `[${i}] ${key(p[i])} ≠ ${key(q[i])}`; n++; }
    if (n) d.push(`${name}: ${n} отличий, первое ${first}`);
  };
  list("objects", a.objects, b.objects, objKey);
  list("spawns", a.spawns, b.spawns, (s) => JSON.stringify([s.x, s.y, s.mob, s.level]));
  list("bosses", a.bosses, b.bosses, (s) => JSON.stringify([s.id, s.x, s.y, s.arena]));
  list("nodes", a.nodes, b.nodes, (s) => JSON.stringify([s.id, s.kind, s.res, s.x, s.y]));
  list("merchants", a.merchants, b.merchants, (s) => JSON.stringify([s.x, s.y]));
  if (JSON.stringify(a.playerSpawn) !== JSON.stringify(b.playerSpawn)) d.push("playerSpawn");
  if (JSON.stringify(a.merchant) !== JSON.stringify(b.merchant)) d.push("merchant");
  return d;
}

const m = generateMap(MAP_SEED);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tiled-rt-"));
try {
  const pl = gatherPlacements();
  const ex = exportWorld(m, dir, pl);
  console.log(`  экспорт: ${ex.regions} регионов, ${(ex.bytes / 1e6).toFixed(1)} МБ, ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  const im = importWorld(dir);
  for (const w of im.warnings) fail("предупреждение импорта: " + w);
  const diff = diffMaps(m, im.map);
  for (const s of diff) fail("круг: " + s);
  if (!diff.length) console.log("  круг сошёлся: vtx, cell, zone, objects, spawns, bosses, nodes, точки");
  if (im.placements.npcs.length !== pl.npcs.length || im.placements.patrols.length !== pl.patrols.length || im.placements.teleports.length !== pl.teleports.length)
    fail(`NPC/патрули/телепорты: ${im.placements.npcs.length}/${im.placements.patrols.length}/${im.placements.teleports.length} ≠ ${pl.npcs.length}/${pl.patrols.length}/${pl.teleports.length}`);

  const v = validateWorld(im.map, im.placements);
  for (const e of v.errors) fail("validate: " + e);
  console.log(`  validate: ошибок ${v.errors.length}, предупреждений ${v.warnings.length}`);

  // намеренные поломки
  const r0 = path.join(dir, "r0-1.tmj");
  const map0 = JSON.parse(fs.readFileSync(r0, "utf8"));
  const trees = map0.layers.find((l: { name: string }) => l.name === "Деревья и камни");
  trees.objects[0].x += 32;
  fs.writeFileSync(r0, JSON.stringify(map0));
  if (!diffMaps(m, importWorld(dir).map).some((s) => s.startsWith("objects"))) fail("сдвинутое дерево не замечено");
  // стена поперёк всей карты по x главного моста: путь к мостам и землям Умбрата закрыт
  const cut = { ...im.map, cell: im.map.cell.slice() };
  const bx = 300;
  for (let y = 0; y < cut.h; y++) cut.cell[y * cut.w + bx] |= CELL_BLOCK;
  if (!validateWorld(cut, im.placements).errors.some((e) => e.includes("нет прохода"))) fail("закрытый проход не замечен");
  const dup = { ...im.map, objects: im.map.objects };
  if (validateWorld(dup, { ...im.placements, npcs: [...im.placements.npcs, im.placements.npcs[0]] }).errors.every((e) => !e.includes("id"))) fail("повтор id не замечен");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `tiled-roundtrip: ошибок ${failed}` : `tiled-roundtrip: готово за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
process.exit(failed ? 1 : 0);
