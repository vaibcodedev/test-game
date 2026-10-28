/** Быстрая пересборка только кадров данжа (DUNGEON_ART) и записей manifest.json — для проверки без полного npm run assets. */
import fs from "node:fs";
import path from "node:path";
import { DUNGEON_ART } from "./dungeon-art";
import { buildObjectAtlases } from "./atlas";
const OUT = path.resolve("client/public/assets"), mf = path.join(OUT, "manifest.json");
const m = JSON.parse(fs.readFileSync(mf, "utf8"));
for (const [id, art] of Object.entries(DUNGEON_ART)) { const pc = art(); pc.save(path.join(OUT, `objects/${id}.png`)); m.objects[id] = { w: pc.w, h: pc.h }; }
// кадры данжа лежат и в атласе объектов (tools/gen/atlas.ts): пересобрать его, иначе клиент покажет старые кадры
const atl = buildObjectAtlases(OUT, Object.keys(m.objects));
m.atlases = atl.atlases; m.atlasOf = atl.atlasOf;
fs.writeFileSync(mf, JSON.stringify(m, null, 1));
console.log("dungeon objects saved");
