/**
 * Задача 140: проверка, что партия 1 не изменилась после расширения rig.ts/lib.ts — листы всех образов партии 1
 * строятся заново в папку <out> (без превью); с флагом --cmp <папка> — попиксельное сравнение с ней.
 * Запуск: npx tsx tools/gen/mobs/verify1.ts <out> [--cmp <папка>]
 */
import fs from "node:fs";
import path from "node:path";
import { boarfolk } from "./boarfolk";
import { frogfolk } from "./frogfolk";
import { ghoul } from "./ghoul";
import { goblin } from "./goblin";
import { hobgoblin } from "./hobgoblin";
import { imp } from "./imp";
import { kobold } from "./kobold";
import { mummy } from "./mummy";
import { ogre } from "./ogre";
import { ratfolk } from "./ratfolk";
import { satyr } from "./satyr";
import { troll } from "./troll";
import { wolffolk } from "./wolffolk";
import { zombie } from "./zombie";
import { loadPC } from "./lib";
import { buildCreature, HERO_LOOK, outlineLook, loadAssets, rootFromArgv } from "./rig";

const root = rootFromArgv();
const out = path.resolve(process.argv[2]);
const ci = process.argv.indexOf("--cmp");
const cmp = ci > 0 ? path.resolve(process.argv[ci + 1]) : null;
HERO_LOOK.v = outlineLook(loadAssets(root).hero, 32);
for (const cr of [boarfolk, ratfolk, goblin, zombie, imp, wolffolk, satyr, ghoul, hobgoblin, kobold, mummy, ogre, troll, frogfolk]) {
  buildCreature(cr, out);
  console.log(`  ${cr.id} готов`);
}
if (cmp) {
  let diff = 0, n = 0;
  for (const f of fs.readdirSync(out).filter((q) => q.endsWith(".png"))) {
    const a = loadPC(path.join(out, f)), b = loadPC(path.join(cmp, f));
    n++;
    if (a.w !== b.w || a.h !== b.h || Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))) { diff++; console.log(`  РАЗНИЦА: ${f}`); }
  }
  console.log(`  листов ${n}, отличий ${diff}`);
}
