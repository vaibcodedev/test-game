/**
 * Задача 140, перенос партии 2 в игру (как tools/gen/mobs/game.ts для партии 1): листы вариантов образов партии 2,
 * на которые ссылаются мобы shared/mobs.ts (sprite и eliteSprite, в том числе приспешники рейда data/raid.json), →
 * client/public/assets/units/<вариант>.png и записи в разделе units client/public/assets/manifest.json (кадр 32 или 48).
 * Раскладка листа та же (≥ 45 столбцов, клиент узнаёт её по ширине). Контур как у героя (tintOutline в buildCreature).
 * Старые листы, заменённые партией 2, удаляются (OLD_SPRITES2); другие разделы манифеста не трогаются.
 * Запуск: npx tsx tools/gen/mobs/game2.ts [id образа ...] (npm run assets его не вызывает).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MOBS } from "../../../shared/mobs";
import { BATCH2 } from "./batch2-list";
import { buildCreature, camOf, rootFromArgv } from "./rig";

/** Прежние листы мобов зон 40+, которых в игре больше нет (их места заняли образы партии 2). */
export const OLD_SPRITES2 = ["toxic_slime", "jackal", "scorpion", "frost_wolf", "magma_slime", "lava_hound", "golem", "ice_golem"];

const root = rootFromArgv();
const units = path.join(root, "client", "public", "assets", "units");
const manPath = path.join(root, "client", "public", "assets", "manifest.json");
const used = new Set<string>();
for (const m of Object.values(MOBS)) for (const s of [m.sprite, m.eliteSprite]) if (s) used.add(s);
const written: [string, number][] = [];
let problems = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mobs2-"));
const only = process.argv.slice(2);
for (const cr of BATCH2) {
  if (only.length && !only.includes(cr.id)) continue;
  const want = [...used].filter((s) => s.startsWith(`${cr.id}_`));
  if (!want.length) continue;
  const o = buildCreature(cr, tmp);
  problems += o.problems.length;
  for (const p of o.problems.slice(0, 6)) console.warn(`  ${p}`);
  for (const id of want) {
    const f = path.join(tmp, `${id}.png`);
    if (!fs.existsSync(f)) { console.warn(`  нет листа ${id}`); problems++; continue; }
    fs.copyFileSync(f, path.join(units, `${id}.png`));
    written.push([id, camOf(cr).N]);
  }
  console.log(`  ${cr.ru}: ${want.length} листов`);
}
fs.rmSync(tmp, { recursive: true, force: true });
for (const id of OLD_SPRITES2) if (!used.has(id)) fs.rmSync(path.join(units, `${id}.png`), { force: true });
// манифест: только раздел units и только свои записи (остальное — как в файле сейчас)
const man = JSON.parse(fs.readFileSync(manPath, "utf8")) as { units: Record<string, { frame: number; cols?: number }> };
for (const id of OLD_SPRITES2) if (!used.has(id)) delete man.units[id];
for (const [id, frame] of written) man.units[id] = { frame };
fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
console.log(`  в игру: ${written.length} листов, манифест обновлён${problems ? `; замечаний по кадрам — ${problems}` : ", кадры чисты"}`);
