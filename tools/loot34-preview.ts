/** Листы нового сундучка 3/4 для макета tools/out/loot-preview (в игру не идут). Запуск: npx tsx tools/loot34-preview.ts */
import fs from "node:fs";
import path from "node:path";
import { buildChest34 } from "./gen/loot34";
const OUT = path.resolve("tools/out/loot-preview");
fs.mkdirSync(OUT, { recursive: true });
for (let r = 0; r < 4; r++) for (const boss of [false, true]) {
  const { sheet, fw, fh } = buildChest34(r, boss);
  sheet.save(path.join(OUT, `loot34_r${r}${boss ? "_boss" : ""}.png`));
  if (r === 0) console.log(boss ? "boss" : "norm", fw, fh);
}
