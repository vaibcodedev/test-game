/**
 * Задача 140, перенос партии 1 в игру: листы всех вариантов образов зон 1–40 и скелета-пилота →
 * client/public/assets/units/<вариант>.png и записи в client/public/assets/manifest.json (units: кадр 32 или 48).
 *
 * Раскладка листа (клиент узнаёт её по ширине, ≥ 45 столбцов; client/src/game/BootScene.ts): 3 строки — вниз, вверх,
 * вбок вправо (влево — отражение); столбцы — покой 12, ходьба 12, атака 9–10, гибель 12.
 * Контур как у героя (tintOutline) — у скелета тоже. Старые листы, заменённые этой партией, удаляются (OLD_SPRITES).
 * Запуск: npx tsx tools/gen/mobs/game.ts (npm run assets его не вызывает: листы лежат в assets готовыми, scan в
 * tools/gen-assets.ts снова занесёт их в манифест).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BATCH1 } from "./batch1-list";
import { writeSkeletonPilot } from "./skeleton";
import { buildCreature, camOf, loadPC, rootFromArgv, tintOutline } from "./rig";

/** Прежние листы мобов, которых в игре больше нет (их места заняли образы партии 1; слизень, краб, медуза — удалены). */
export const OLD_SPRITES = ["goblin", "slime", "boar", "wolf", "spider", "sea_crab", "jellyfish"];

const root = rootFromArgv();
const units = path.join(root, "client", "public", "assets", "units");
const manPath = path.join(root, "client", "public", "assets", "manifest.json");
const written: [string, number][] = [];
let problems = 0;
for (const cr of BATCH1) {
  const o = buildCreature(cr, units);
  problems += o.problems.length;
  for (const p of o.problems.slice(0, 10)) console.warn(`  ${p}`);
  for (const id of o.sheets.keys()) written.push([id, camOf(cr).N]);
  console.log(`  ${cr.ru}: ${o.vars.length} листов`);
}
// скелет — утверждённый пилот: его листы, с контуром как у героя
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skel-"));
  writeSkeletonPilot(root, tmp);
  for (const f of fs.readdirSync(tmp).filter((q) => /^skeleton_(sword|bow|mage)(_elite)?\.png$/.test(q))) {
    const pc = loadPC(path.join(tmp, f));
    tintOutline(pc);
    pc.save(path.join(units, f));
    written.push([f.slice(0, -4), 32]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("  Скелет: 6 листов");
}
for (const id of OLD_SPRITES) fs.rmSync(path.join(units, `${id}.png`), { force: true });
const man = JSON.parse(fs.readFileSync(manPath, "utf8")) as { units: Record<string, { frame: number; cols?: number }> };
for (const id of OLD_SPRITES) delete man.units[id];
for (const [id, frame] of written) man.units[id] = { frame };
fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
console.log(`  в игру: ${written.length} листов, манифест обновлён${problems ? `; замечаний по кадрам — ${problems}` : ", кадры чисты"}`);
if (problems) process.exitCode = 1;
