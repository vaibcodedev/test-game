/** Подгонка data/skill-fx.json под радиус умений (задача 127, шаг 3). Запуск: tsx tools/gen/skill-fx-fit.ts
 *  Площадные слоты (круги, взрывы, шипы, дождь стрел) рисуются нативным листом, а если диаметр 2r умения из data/skills*.json
 *  не меньше 1,5 ширины листа, id получает суффикс @2 — целое увеличение ×2 при сборке (tools/gen/vfx.ts, дробного масштаба нет).
 *  Размеры снарядов, попаданий, аур и щитов — таблица FIT в tools/gen/vfx.ts. Скрипт идемпотентен. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS } from "../../shared/skills";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FILE = path.join(ROOT, "data/skill-fx.json");
const table = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, Record<string, string>>;

/** [умение, слот]: число — диаметр в px вместо 2r (у умения нет радиуса в данных). */
const AREA: [string, string, number?][] = [
  ["tp_glare", "cast"], ["tp_banner", "cast"], ["frostnova", "cast", 270], ["mg_timewarp", "cast"], ["circle", "cast", 240],
  ["bw_blood_circle", "cast"], ["bw_tide", "cast"], ["rv_reap", "cast"], ["dk_blood_drain", "cast"], ["dk_chain_storm", "cast"],
  ["dr_veil", "cast"], ["cl_hymn", "cast"], ["cl_aegis", "cast"], ["wl_skeletons", "cast"], ["wl_skeletons", "hit"],
  ["bw_blood_burst", "hit"], ["rain", "hit"], ["quake", "hit", 260], ["meteor", "hit"], ["as_smoke", "cast"], ["wl_doom", "cast"],
];

// ширина нативного листа: из собранного каталога (tools/out/vfx), без него — как есть
let native: Record<string, { frameW: number }> = {};
try { native = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/out/vfx/vfx-manifest.json"), "utf8")); } catch { /* каталога ещё нет */ }

for (const slots of Object.values(table)) for (const [k, v] of Object.entries(slots)) slots[k] = v.replace(/@2$/, "");
for (const [skill, slot, fixed] of AREA) {
  const id = table[skill]?.[slot];
  if (!id) continue;
  let d = fixed;
  if (d === undefined) { const r = Number((SKILLS[skill] as { v: (r: number) => Record<string, number> }).v(1).radius); d = r > 0 ? 2 * r : undefined; }
  const w = native[id]?.frameW;
  if (d && w && d / w >= 1.5) table[skill][slot] = `${id}@2`;
}
fs.writeFileSync(FILE, JSON.stringify(table, null, 1) + "\n");
console.log(`skill-fx.json: ${Object.values(table).flatMap((s) => Object.values(s)).filter((v) => v.endsWith("@2")).length} слотов с @2`);
