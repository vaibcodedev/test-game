/**
 * Призывы чернокнижника → игра: листы tools/out/warlock-pets/sheets/<id>.png (+ _glow) → client/public/assets/units/,
 * записи в manifest.json (units: кадр; _glow — маска свечения для ночи) и раскладка анимаций в data/unit-anims.json
 * (покой, ходьба, атака, урон, появление, гибель — столбцы, кадров, к/с; client/src/game/BootScene.ts, UnitView.ts).
 * Запуск: npx tsx tools/gen/pets/run.ts --only=wl_skeleton,wl_demon && npx tsx tools/gen/pets/to-game.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(ROOT, "tools", "out", "warlock-pets", "sheets");
const UNITS = path.join(ROOT, "client", "public", "assets", "units");
const MAN = path.join(ROOT, "client", "public", "assets", "manifest.json");
const DATA = path.join(ROOT, "data", "unit-anims.json");
const IDS = ["wl_skeleton", "wl_demon"];

const man = JSON.parse(fs.readFileSync(MAN, "utf8")) as { units: Record<string, { frame: number }> };
const data = (fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : {}) as Record<string, unknown>;
data.$about = "Раскладка анимаций листов юнитов со своими анимациями (призывы чернокнижника, tools/gen/pets/to-game.ts): строки — вниз, вверх, вбок; столбцы col..col+n−1. scale — масштаб спрайта в игре (питомцы по умолчанию 0,8). glow — маска свечения <id>_glow для ночи.";
for (const id of IDS) {
  const lay = JSON.parse(fs.readFileSync(path.join(SRC, `${id}.json`), "utf8")) as { frame: number; anims: Record<string, { col: number; n: number; fps: number; loop: boolean }> };
  fs.copyFileSync(path.join(SRC, `${id}.png`), path.join(UNITS, `${id}.png`));
  fs.copyFileSync(path.join(SRC, `${id}_glow.png`), path.join(UNITS, `${id}_glow.png`));
  man.units[id] = { frame: lay.frame };
  man.units[`${id}_glow`] = { frame: lay.frame };
  data[id] = { scale: 1, glow: true, anims: lay.anims };
  console.log(`  ${id}: кадр ${lay.frame}, анимации ${Object.keys(lay.anims).join(", ")}`);
}
fs.writeFileSync(MAN, JSON.stringify(man, null, 1));
fs.writeFileSync(DATA, JSON.stringify(data, null, 1) + "\n");
