/** Записать листы добычи loot_r{0..3}[_boss] (вид 3/4, tools/gen/loot34.ts) в assets/objects и размеры в manifest.json, без полной сборки. Запуск: npx tsx tools/gen/loot34-write.ts */
import fs from "node:fs";
import path from "node:path";
import { buildChest34 } from "./loot34";
const OUT = path.resolve("client/public/assets"), mp = path.join(OUT, "manifest.json");
const man = JSON.parse(fs.readFileSync(mp, "utf8"));
for (let r = 0; r < 4; r++) for (const boss of [false, true]) {
  const id = `loot_r${r}${boss ? "_boss" : ""}`, { sheet } = buildChest34(r, boss);
  sheet.save(path.join(OUT, `objects/${id}.png`));
  man.objects[id] = { w: sheet.w, h: sheet.h };
}
fs.writeFileSync(mp, JSON.stringify(man, null, 1));
console.log("ok");
