/** Быстрая пересборка только кадров данжа (DUNGEON_ART) и записей manifest.json — для проверки без полного npm run assets. */
import fs from "node:fs";
import path from "node:path";
import { DUNGEON_ART } from "./dungeon-art";
const OUT = path.resolve("client/public/assets"), mf = path.join(OUT, "manifest.json");
const m = JSON.parse(fs.readFileSync(mf, "utf8"));
for (const [id, art] of Object.entries(DUNGEON_ART)) { const pc = art(); pc.save(path.join(OUT, `objects/${id}.png`)); m.objects[id] = { w: pc.w, h: pc.h }; }
fs.writeFileSync(mf, JSON.stringify(m, null, 1));
console.log("dungeon objects saved");
