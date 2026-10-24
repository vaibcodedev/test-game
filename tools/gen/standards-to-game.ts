/** Повреждённые штандарты Полей (задача 130 → 132, шаг 10) в игру: листы из tools/out/standards/ (их делает tools/gen/standards.ts)
 *  копируются в client/public/assets/vfx/std-*.png, записи дописываются в vfx/manifest.json (остальные записи не трогаются).
 *  На карте это анимированные объекты (client/src/game/terrain.ts): id листа = вид объекта.
 *  Запуск: npx tsx tools/gen/standards-to-game.ts */
import fs from "node:fs";
import path from "node:path";

const SRC = "tools/out/standards";
const VFX = "client/public/assets/vfx";
const sheets = JSON.parse(fs.readFileSync(path.join(SRC, "sheets.json"), "utf8")).sheets as Record<string, { file: string; frameW: number; frameH: number; frames: number; fps: number; anchor: [number, number] }>;
/** Лист → id в игре. */
const MAP: Record<string, string> = {
  "torn-solgard": "std-torn-sol", "torn-umbrath": "std-torn-umb",
  "burned-solgard": "std-burned-sol", "burned-umbrath": "std-burned-umb",
  "fallen-solgard": "std-fallen-sol", "fallen-umbrath": "std-fallen-umb",
};
const MF = path.join(VFX, "manifest.json");
const m = JSON.parse(fs.readFileSync(MF, "utf8"));
for (const [src, id] of Object.entries(MAP)) {
  const s = sheets[src];
  fs.copyFileSync(path.join(SRC, s.file), path.join(VFX, `${id}.png`));
  m[id] = { frameW: s.frameW, frameH: s.frameH, frames: s.frames, fps: s.fps, anchor: [+(s.anchor[0] / s.frameW).toFixed(4), +(s.anchor[1] / s.frameH).toFixed(4)], blend: "normal" };
}
fs.writeFileSync(MF, JSON.stringify(m, null, 1) + "\n");
console.log("штандарты:", Object.values(MAP).join(", "));
