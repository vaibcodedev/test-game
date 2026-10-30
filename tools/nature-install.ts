/**
 * Ставит в игру объёмный природный декор (tools/gen/nature3d.ts NATURE_GAME, nature3d-flora.ts FLORA_GAME) без полной пересборки ассетов:
 * пишет client/public/assets/objects/<kind>.png и <kind>__k.png, обновляет manifest.json (objects, атласы — tools/gen/atlas.ts).
 * То же самое делает `npm run assets` (OBJECT_ART в tools/gen/objects.ts). Запуск под tools/out/scenario.lock: npx tsx tools/nature-install.ts
 */
import fs from "node:fs";
import path from "node:path";
import { natureGameArt } from "./gen/nature3d";
import { floraGameArt } from "./gen/nature3d-flora";
import { buildObjectAtlases } from "./gen/atlas";

const OUT = path.resolve("client/public/assets");
const MAN = path.join(OUT, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(MAN, "utf8")) as { objects: Record<string, { w: number; h: number }>; atlases: unknown; atlasOf: unknown };
let n = 0;
for (const [id, art] of Object.entries({ ...natureGameArt(), ...floraGameArt() })) {
  const pc = art();
  // низ кадра = основание: в нижнем ряду есть непрозрачное (контактная тень), иначе длинная тень оторвётся (docs/art/perspective.md, п. 4)
  let low = false;
  for (let x = 0; x < pc.w; x++) if (pc.alpha(x, pc.h - 1)) low = true;
  if (!low) throw new Error(`${id}: пустой нижний ряд кадра`);
  pc.save(path.join(OUT, "objects", `${id}.png`));
  manifest.objects[id] = { w: pc.w, h: pc.h };
  n++;
}
const atl = buildObjectAtlases(OUT, Object.keys(manifest.objects));
manifest.atlases = atl.atlases; manifest.atlasOf = atl.atlasOf;
fs.writeFileSync(MAN, JSON.stringify(manifest, null, 1));
console.log(`saved ${n} кадров, атласов ${atl.atlases.length}`);
