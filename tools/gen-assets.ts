/**
 * Генератор всех игровых ассетов (оригинальный пиксель-арт, сетка 32×32; палитра и контуры — tools/gen/palette.ts).
 * Запуск: npm run assets. Результат: client/public/assets/** и manifest.json.
 */
import fs from "node:fs";
import { PNG } from "pngjs";
import path from "node:path";
import { buildEquipIcons } from "./gen/equip";
import { buildItemIcon, buildSkillIcon, FX_ART, ITEM_ICONS, OBJECT_ART, SKILL_ICONS } from "./gen/objects";
import { buildLavaGlow, buildTileset, buildWater } from "./gen/tiles";
import { buildChaosHalo, buildChaosKnightSheet, KNIGHT_COLS, KNIGHT_FRAME } from "./gen/raidboss";
import { writeMountsGame, type GameMeta } from "./gen/mounts/build";
import { PC } from "./gen/canvas";
import { newSkillIcon } from "./gen/icons-build";
import { newItemIcon, sealIconFor } from "./gen/icons-items";
import { readPng } from "./gen/vendor-lib";
import MOUNT_DATA from "../data/mounts.json";
import { buildUnitSheet, UNIT_ART } from "./gen/units";
import { writeGameVfx } from "./gen/vfx";
import { writeWardsGame } from "./gen/wards";
import { writeStatueFire } from "./gen/statues";
import { writeAshBodiesGame } from "./gen/ashborn-body";
import { writeEmberBannersGame } from "./gen/ember-banners";
import { writeWarBasesGame } from "./gen/war-bases";
import { writeWarBuffIcons } from "./gen/war-buffs";
import { buildObjectAtlases, type AtlasRef } from "./gen/atlas";

const OUT = path.resolve("client/public/assets");
const t0 = Date.now();
const manifest = {
  /** cols — число столбцов листа, если не 12 (рейд-босс: 24). */
  units: {} as Record<string, { frame: number; frameH?: number; cols?: number }>,
  /** маунты (задача 142): лист 36×8 кадров, см. tools/gen/mounts/build.ts — пишет раздел сам, после manifest.json */
  mounts: {} as Record<string, GameMeta>,
  objects: {} as Record<string, { w: number; h: number }>,
  icons: [] as string[],
  fx: [] as string[],
  /** атласы объектов (tools/gen/atlas.ts): листы и карта id → ключ листа; объекта нет в atlasOf — клиент грузит его по одному (o_<id>) */
  atlases: [] as AtlasRef[],
  atlasOf: {} as Record<string, string>,
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
  // еда, зелья, ресурсы: иконки 7Soul1 (data/item-icons.json); без vendor/ готовые файлы остаются, старая генерация — только для не вошедших в таблицу
  const file = path.join(OUT, `icons/${id}.png`), fresh = newItemIcon(id, file);
  if (fresh instanceof PC) fresh.save(file);
  else if (fresh === null) buildItemIcon(id).save(file);
  manifest.icons.push(id);
}
// конюшня (задача 142): печать скакуна и детали маунтов — иконки 7Soul1 по data/item-icons.json
for (const id of ["mount_seal", ...Object.keys(MOUNT_DATA.parts).map((p) => `mpart_${p}`)]) {
  const file = path.join(OUT, `icons/${id}.png`), fresh = newItemIcon(id, file);
  if (fresh instanceof PC) fresh.save(file);
  if (fs.existsSync(file)) manifest.icons.push(id);
}
// печать каждого маунта: свиток и силуэт маунта (иконка маунта — из assets/icons, её пишет tools/gen/mounts/build.ts)
for (const id of Object.keys(MOUNT_DATA.mounts)) {
  const seal = path.join(OUT, "icons/mount_seal.png"), mount = path.join(OUT, `icons/mount_${id}.png`);
  if (!fs.existsSync(seal) || !fs.existsSync(mount)) continue;
  sealIconFor(readPng(seal), readPng(mount)).save(path.join(OUT, `icons/mseal_${id}.png`));
  manifest.icons.push(`mseal_${id}`);
}
// иконки умений: новые из data/skill-icons.json (frosty + генератор), старая генерация — только для не вошедших в таблицу или если нет vendor/ и файла
for (const id of Object.keys(SKILL_ICONS)) {
  const file = path.join(OUT, `icons/${id}.png`), fresh = newSkillIcon(id, file);
  if (fresh instanceof PC) fresh.save(file);
  else if (fresh === null) buildSkillIcon(id).save(file);
  manifest.icons.push(id);
}
// иконки питомцев для магазина: первый кадр их спрайт-листа (иконки маунтов 48×48 — tools/gen/mounts/build.ts)
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

// анимации умений (задача 127): листы из паков в vendor/ (необязательны) и сгенерированные; каталог — assets/vfx/manifest.json
writeGameVfx(OUT);
// обереги против невидимок (задача 132, шаг 6): анимированные объекты ward-sol/umb и вспышка срабатывания, см. tools/gen/wards.ts
writeWardsGame(OUT);
writeStatueFire(OUT);
// стража Эмберхолла — Пепельнорождённые (задача 132, шаг 8): тела из шлака и знамёна «Жаровня» (data/ember-guard.json)
for (const id of writeAshBodiesGame(OUT)) manifest.units[id] = { frame: 32 };
writeEmberBannersGame(OUT);
// основания «Знамён Предела» (задача 132, шаг 14): мачта, тумба и королевские знамёна захвата (tools/gen/war-bases.ts)
writeWarBasesGame(OUT);
writeWarBuffIcons(path.join(OUT, "icons")); // бафы земли «Знамён Предела»

// Ручные PNG (не из генератора) тоже попадают в манифест: можно просто положить файл в папку.
const pngSize = (f: string) => {
  const p = PNG.sync.read(fs.readFileSync(f));
  return { w: p.width, h: p.height };
};
const scan = (dir: string) => fs.readdirSync(path.join(OUT, dir)).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
// боссы с каталогом zone-bosses/manifest.json: кадр — оттуда (лист кольца перенесён по строкам — высота не 3 кадра, задача 139)
const ZBM = path.join(OUT, "zone-bosses", "manifest.json");
const zbFrame: Record<string, number> = fs.existsSync(ZBM) ? Object.fromEntries(Object.entries((JSON.parse(fs.readFileSync(ZBM, "utf8")) as { bosses: Record<string, { fw?: number }> }).bosses).map(([k, b]) => [k, b.fw ?? 64])) : {};
// кадры листов боссов кольца и их спутников (кол клетки, мираж, стая) — из каталога боссов: их пишет tools/gen/bosses139/to-game.ts (запустить после генератора босса)
for (const [id, u] of Object.entries(((fs.existsSync(ZBM) ? JSON.parse(fs.readFileSync(ZBM, "utf8")) : {}) as { units?: Record<string, { frame: number; frameH?: number }> }).units ?? {})) if (fs.existsSync(path.join(OUT, "units", id + ".png"))) manifest.units[id] = u;
for (const id of scan("units")) if (!manifest.units[id]) manifest.units[id] = { frame: zbFrame[id] ?? pngSize(path.join(OUT, "units", id + ".png")).h / 3 };
for (const id of scan("objects")) if (!manifest.objects[id]) manifest.objects[id] = pngSize(path.join(OUT, "objects", id + ".png"));
for (const id of scan("icons")) if (!manifest.icons.includes(id)) manifest.icons.push(id);
for (const id of scan("fx")) if (!manifest.fx.includes(id)) manifest.fx.push(id);
// атлас объектов (docs/libraries.md, 3.1): после записи всех PNG объектов; без изменений — из кэша за доли секунды
const ta = Date.now(), atl = buildObjectAtlases(OUT, Object.keys(manifest.objects));
manifest.atlases = atl.atlases; manifest.atlasOf = atl.atlasOf;
console.log(`[assets] атлас объектов: ${atl.atlases.length} листов, ${Object.keys(atl.atlasOf).length} кадров${atl.cached ? " (кэш)" : ""} за ${Date.now() - ta} мс`);

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
// маунты: раздел manifest.mounts и иконки из готовых листов (tools/gen/mounts/build.ts, кэш mounts/meta.json); листов нет — рисует
writeMountsGame([], { reuse: true });
console.log(`[assets] готово за ${Date.now() - t0} мс -> ${path.relative(process.cwd(), OUT)}`);
