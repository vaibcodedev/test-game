/** Штандарты (задача 130 → 132) в игру: листы из tools/out/standards/ (их делает tools/gen/standards.ts) копируются
 *  в client/public/assets/vfx/std-*.png, записи дописываются в vfx/manifest.json (остальные записи не трогаются).
 *  На карте это анимированные объекты (client/src/game/terrain.ts): id листа = вид объекта.
 *  Повреждённые (шаг 10) — Поля; штандарты своих земель на древке (std-home-*) — у ворот столиц, фортов, поселений и постов у мостов;
 *  висящие знамёна (редизайн): вымпел std-pennant-* — на угловых башнях столиц и фортов и (-hi) на башнях постов у мостов, драпировка
 *  std-drape-* — над аркой ворот (shared/cities.ts, shared/map.ts). Якорь листа — точка крепления (крюк вымпела, верх прутка драпировки);
 *  drop опускает якорь на основание стены (px): объект стоит у основания на 1 px ниже её (рисуется поверх кладки по глубине y),
 *  а знамя висит на нужной высоте. Высота крепления от основания объекта: угловая башня sol/umb_tower — 50 px (низ бахромы вымпела
 *  чуть выше земли), башня поста у моста bf_wall_tower_* — 72 px, ворота sol/umb_gate — 86 px. Прежние листы std-wall и std-gate удаляются (REMOVED).
 *  Запуск: npx tsx tools/gen/standards-to-game.ts */
import fs from "node:fs";
import path from "node:path";

const SRC = "tools/out/standards";
const VFX = "client/public/assets/vfx";
const sheets = JSON.parse(fs.readFileSync(path.join(SRC, "sheets.json"), "utf8")).sheets as Record<string, { file: string; frameW: number; frameH: number; frames: number; fps: number; anchor: [number, number] }>;
/** id в игре → лист и опускание якоря (px). */
const MAP: Record<string, { src: string; drop?: number }> = {
  "std-torn-sol": { src: "torn-solgard" }, "std-torn-umb": { src: "torn-umbrath" },
  "std-burned-sol": { src: "burned-solgard" }, "std-burned-umb": { src: "burned-umbrath" },
  "std-fallen-sol": { src: "fallen-solgard" }, "std-fallen-umb": { src: "fallen-umbrath" },
  "std-home-sol": { src: "home-solgard" }, "std-home-umb": { src: "home-umbrath" },
  "std-pennant-sol": { src: "pennant-solgard", drop: 51 }, "std-pennant-umb": { src: "pennant-umbrath", drop: 51 },
  "std-pennant-sol-hi": { src: "pennant-solgard", drop: 73 }, "std-pennant-umb-hi": { src: "pennant-umbrath", drop: 73 },
  "std-drape-sol": { src: "drape-solgard-gate", drop: 87 }, "std-drape-umb": { src: "drape-umbrath-gate", drop: 87 },
};
/** Прежние настенные знамёна (брус с крюками) — листы и записи манифеста убираются. */
const REMOVED = ["std-wall-sol", "std-wall-umb", "std-wall-sol-hi", "std-wall-umb-hi", "std-gate-sol", "std-gate-umb"];
const MF = path.join(VFX, "manifest.json");
const m = JSON.parse(fs.readFileSync(MF, "utf8"));
for (const [id, { src, drop = 0 }] of Object.entries(MAP)) {
  const s = sheets[src];
  fs.copyFileSync(path.join(SRC, s.file), path.join(VFX, `${id}.png`));
  m[id] = { frameW: s.frameW, frameH: s.frameH, frames: s.frames, fps: s.fps, anchor: [+(s.anchor[0] / s.frameW).toFixed(4), +((s.anchor[1] + drop) / s.frameH).toFixed(4)], blend: "normal" };
}
for (const id of REMOVED) { fs.rmSync(path.join(VFX, id + ".png"), { force: true }); delete m[id]; }
fs.writeFileSync(MF, JSON.stringify(m, null, 1) + "\n");
console.log("штандарты:", Object.keys(MAP).join(", "));
