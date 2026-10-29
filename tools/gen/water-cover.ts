/**
 * Маска покрытия тайлов земли для проходимости по видимой кромке воды: из client/public/assets/tiles/terrain.png берёт альфу краевых тайлов
 * (поверхности 1..TERRAIN_COUNT−1, столбцы 0–13 — края по маске углов) и пишет shared/waterCover.ts (32×32 бита на тайл, base64).
 * Запуск: npx tsx tools/gen/water-cover.ts. Если рисунок земли перегенерирован, tests/water-edge.ts покажет расхождение — запустить заново.
 */
import fs from "node:fs";
import { PNG } from "pngjs";
import { TERRAIN_COUNT } from "../../shared/map";

export const COVER_COLS = 14, COVER_ROW_BYTES = 128;
export function coverBytes(png: PNG): Uint8Array {
  const out = new Uint8Array((TERRAIN_COUNT - 1) * COVER_COLS * COVER_ROW_BYTES);
  for (let t = 1; t < TERRAIN_COUNT; t++) for (let c = 0; c < COVER_COLS; c++) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (png.data[(((t * 32 + y) * png.width) + c * 32 + x) * 4 + 3] > 128) {
      const bit = y * 32 + x, o = ((t - 1) * COVER_COLS + c) * COVER_ROW_BYTES;
      out[o + (bit >> 3)] |= 1 << (bit & 7);
    }
  }
  return out;
}
if (process.argv[1]?.includes("water-cover")) {
  const png = PNG.sync.read(fs.readFileSync("client/public/assets/tiles/terrain.png"));
  const b64 = Buffer.from(coverBytes(png)).toString("base64");
  fs.writeFileSync("shared/waterCover.ts", `/** Сгенерировано tools/gen/water-cover.ts из terrain.png — не править руками. Бит (y*32+x) тайла (поверхность t, столбец c): пиксель закрыт землёй. */\nexport const WATER_COVER_B64 = "${b64}";\n`);
  console.log("shared/waterCover.ts:", b64.length, "символов");
}
