/**
 * Генератор всех игровых ассетов (оригинальный пиксель-арт, сетка 32×32).
 * Запуск: npm run assets. Результат: client/public/assets/** и manifest.json.
 */
import fs from "node:fs";
import { PNG } from "pngjs";
import path from "node:path";
import { buildEquipIcons } from "./gen/equip";
import { buildItemIcon, buildSkillIcon, FX_ART, ITEM_ICONS, OBJECT_ART, SKILL_ICONS } from "./gen/objects";
import { buildLavaGlow, buildTileset, buildWater } from "./gen/tiles";
import { buildChaosHalo, buildChaosKnightSheet, KNIGHT_COLS, KNIGHT_FRAME } from "./gen/raidboss";
import { buildMountIcon, buildMountSheet, saveMountPng, type MountMeta } from "./gen/mounts";
import { MODELS as MOUNT_MODELS } from "./gen/mounts-all";
import { buildUnitSheet, UNIT_ART } from "./gen/units";

const OUT = path.resolve("client/public/assets");
const t0 = Date.now();
const manifest = {
  /** cols — число столбцов листа, если не 12 (рейд-босс: 24). */
  units: {} as Record<string, { frame: number; cols?: number }>,
  /** маунты: лист 12x6 кадров, см. tools/gen/mounts.ts */
  mounts: {} as Record<string, MountMeta>,
  objects: {} as Record<string, { w: number; h: number }>,
  icons: [] as string[],
  fx: [] as string[],
};

buildTileset().save(path.join(OUT, "tiles/terrain.png"));
buildWater(0).save(path.join(OUT, "tiles/water.png"));
buildLavaGlow().save(path.join(OUT, "tiles/lava_glow.png"));

for (const [id, art] of Object.entries(UNIT_ART)) {
  buildUnitSheet(id).save(path.join(OUT, `units/${id}.png`));
  manifest.units[id] = { frame: art.frame };
}
// рейд-босс «Рогатый Рыцарь Хаоса»: кадр 128, 24 столбца (шаг, удар, смерть, удар в землю, рёв, стойка), см. tools/gen/raidboss.ts
buildChaosKnightSheet().save(path.join(OUT, "units/chaos_knight.png"));
manifest.units.chaos_knight = { frame: KNIGHT_FRAME, cols: KNIGHT_COLS };
for (const id of Object.keys(MOUNT_MODELS)) {
  const { sheet, meta } = buildMountSheet(id);
  saveMountPng(sheet, path.join(OUT, `mounts/${id}.png`));
  saveMountPng(buildMountIcon(sheet, meta.frame), path.join(OUT, `icons/mount_${id}.png`));
  manifest.mounts[id] = meta;
  manifest.icons.push(`mount_${id}`);
}
for (const [id, art] of Object.entries(OBJECT_ART)) {
  const pc = art();
  pc.save(path.join(OUT, `objects/${id}.png`));
  manifest.objects[id] = { w: pc.w, h: pc.h };
}
for (const [id, pc] of Object.entries(buildEquipIcons())) {
  pc.save(path.join(OUT, `icons/${id}.png`));
  manifest.icons.push(id);
}
for (const id of ITEM_ICONS.filter((i) => i.startsWith("potion") || i.startsWith("food_") || i.startsWith("mat_") || i.startsWith("res_") || i === "gold" || i === "coin")) {
  buildItemIcon(id).save(path.join(OUT, `icons/${id}.png`));
  manifest.icons.push(id);
}
for (const id of Object.keys(SKILL_ICONS)) {
  buildSkillIcon(id).save(path.join(OUT, `icons/${id}.png`));
  manifest.icons.push(id);
}
// иконки маунтов и питомцев для магазина: первый кадр их спрайт-листа
for (const id of Object.keys(UNIT_ART).filter((u) => u.startsWith("pet_"))) {
  const sheet = PNG.sync.read(fs.readFileSync(path.join(OUT, `units/${id}.png`)));
  const fr = UNIT_ART[id].frame, ic = new PNG({ width: fr, height: fr });
  PNG.bitblt(sheet, ic, 0, 0, fr, fr, 0, 0);
  fs.writeFileSync(path.join(OUT, `icons/${id}.png`), PNG.sync.write(ic));
  manifest.icons.push(id);
}
for (const [id, art] of Object.entries(FX_ART)) {
  art().save(path.join(OUT, `fx/${id}.png`));
  manifest.fx.push(id);
}
// ореол за спиной рейд-босса (160×160, рисуется под боссом режимом ADD)
buildChaosHalo().save(path.join(OUT, "fx/chaos_halo.png"));
manifest.fx.push("chaos_halo");

// Ручные PNG (не из генератора) тоже попадают в манифест: можно просто положить файл в папку.
const pngSize = (f: string) => {
  const p = PNG.sync.read(fs.readFileSync(f));
  return { w: p.width, h: p.height };
};
const scan = (dir: string) => fs.readdirSync(path.join(OUT, dir)).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
for (const id of scan("units")) if (!manifest.units[id]) manifest.units[id] = { frame: pngSize(path.join(OUT, "units", id + ".png")).h / 3 };
for (const id of scan("objects")) if (!manifest.objects[id]) manifest.objects[id] = pngSize(path.join(OUT, "objects", id + ".png"));
for (const id of scan("icons")) if (!manifest.icons.includes(id)) manifest.icons.push(id);
for (const id of scan("fx")) if (!manifest.fx.includes(id)) manifest.fx.push(id);

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`[assets] готово за ${Date.now() - t0} мс -> ${path.relative(process.cwd(), OUT)}`);
