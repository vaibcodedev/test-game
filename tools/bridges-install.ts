/**
 * Мосты в 3/4 (tools/gen/factions.ts bridgePiece): пишет client/public/assets/objects/bridge_*.png (центр, продолжения, устои), обновляет manifest.json
 * (размеры, атласы — tools/gen/atlas.ts) и кладёт образец ×3 в tools/out/shores/bridges.png. Запуск под замком: npx tsx tools/bridges-install.ts
 */
import fs from "node:fs";
import path from "node:path";
import { BRIDGE_PIECES, bridge } from "./gen/factions";
import { buildObjectAtlases } from "./gen/atlas";
import { PC } from "./gen/canvas";

const OUT = path.resolve("client/public/assets");
const MAN = path.join(OUT, "manifest.json");
const h = bridge(true), v = bridge(false);
const manifest = JSON.parse(fs.readFileSync(MAN, "utf8")) as { objects: Record<string, { w: number; h: number }>; atlases: unknown; atlasOf: unknown };
for (const [id, art] of Object.entries(BRIDGE_PIECES)) { const pc = art(); pc.save(path.join(OUT, `objects/${id}.png`)); manifest.objects[id] = { w: pc.w, h: pc.h }; }
const atl = buildObjectAtlases(OUT, Object.keys(manifest.objects));
manifest.atlases = atl.atlases; manifest.atlasOf = atl.atlasOf;
fs.writeFileSync(MAN, JSON.stringify(manifest, null, 1));
const sheet = new PC(h.w + v.w + 12, v.h);
sheet.rect(0, 0, sheet.w, sheet.h, [40, 90, 150, 255]);
sheet.blit(h, 0, 0); sheet.blit(v, h.w + 12, 0);
const big = new PC(sheet.w * 3, sheet.h * 3);
for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) big.set(x, y, sheet.get(Math.floor(x / 3), Math.floor(y / 3))!);
fs.mkdirSync("tools/out/shores", { recursive: true });
big.save("tools/out/shores/bridges.png");
console.log("мосты записаны, атласов", atl.atlases.length);
