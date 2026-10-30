/**
 * Лист NPC «Перековщик» (docs/transmog.md) через генератор горожан tools/gen/units.ts, без пересборки всех ассетов:
 * client/public/assets/units/reforger.png и запись в manifest.json. Запуск: npx tsx tools/gen/reforger.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildUnitSheet, UNIT_ART } from "./units";

const OUT = path.resolve("client/public/assets");
buildUnitSheet("reforger").save(path.join(OUT, "units/reforger.png"));
const manPath = path.join(OUT, "manifest.json");
const man = JSON.parse(fs.readFileSync(manPath, "utf8"));
man.units.reforger = { frame: UNIT_ART.reforger.frame };
fs.writeFileSync(manPath, JSON.stringify(man, null, 1)); // как у tools/gen-assets.ts: без перевода строки в конце
console.log("units/reforger.png, manifest.units.reforger");
