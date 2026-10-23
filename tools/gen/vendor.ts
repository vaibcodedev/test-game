/** Сторонние паки → наша палитра и масштаб героя (задача 126).
 *
 *  Запуск: npx tsx tools/gen/vendor.ts (потом npm run assets добавит объекты в manifest.json: tools/gen-assets.ts сканирует папку).
 *  Вход:   vendor/<пак>/src/… — распакованные архивы (vendor/ в .gitignore: лицензии Schwarnhild и Graveyard запрещают раздачу файлов).
 *  Выход:  client/public/assets/objects/v_<пак>_<имя>.png — объекты для игры, холст кратен 32, опора — нижняя середина
 *          (v_*.png в .gitignore, пока репозиторий публичный); client/public/ui — рамка, разделитель и курсоры (CC0, vendor-ui.ts);
 *          tools/out/vendor/<пак>/manifest.json — размеры и источники; tools/out/vendor-preview/*.png — листы «исходник | после перекраски»,
 *          «наши | новые», «до | после уменьшения рядом с героем 32 px» (scale.png) и интерфейс.
 *  Видов у объектов — в shared/decor.ts (наборы для раскладки мира, непроходимые клетки), раскладка — shared/map.ts, cities.ts, raid.ts.
 *
 *  Правила перекраски:
 *  1. Объект вырезается из листа по прямоугольнику (границы найдены по связным областям прозрачности или по сетке 32).
 *     Тени (альфа < 100) выбрасываются: у наших объектов тени в спрайте нет.
 *  2. Каждый пиксель попадает в группу по оттенку (зелёное, коричневое, серое…): у группы своя рампа из tools/gen/palette.ts.
 *  3. Яркость группы подгоняется под яркость рампы и пиксель берёт ближайший по яркости тон рампы. Статистика собирается
 *     по всему паку (не по спрайту), поэтому один и тот же цвет исходника везде даёт один и тот же тон.
 *  4. Самые тёмные пиксели по краю (кайма листвы, обводка камня) и почти чёрные пиксели → OUTLINE из canvas.ts (#1b1422);
 *     где тёмной каймы нет, контур дорисовывается снаружи, как PC.outline() у наших объектов.
 *  5. Graveyard: огонь фонарей и вырезанные руны на камне → фиолетовый ряд Умбрата (P.magic.purple, как у soul_brazier).
 *     Volcanoe: свечение лавы → наш ряд P.lava (тот же, что в buildLavaGlow).
 *  6. Масштаб героя (height / scale у объекта): уменьшение по блокам с выбором преобладающего цвета (downscaleMode, не соседом и не
 *     сглаживанием), чистка одиночных пикселей (tidy), контур заново снаружи. Зелёные деревья Basic — по решению пользователя
 *     (дуб ~96 px, большой ~110, малый ~56, сосна 0,75), кусты, обрывы, пещеры, лестница, статуи — по листу scale.png. */
import fs from "node:fs";
import path from "node:path";
import { PC, OUTLINE, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { ROOT, OUT_DIR, PREVIEW_DIR, BG, BEIGE, GOLD, readPng, writePng, crop, opaqueBox, trim, scaleNN, downscaleMode, tidy, fill, luma, hsv, paintGround, chipText, drawText, textWidth } from "./vendor-lib";
import { buildVendorUi } from "./vendor-ui";

type Pack = "basic" | "volcano" | "graveyard" | "fortkit" | "bridges" | "undead" | "deco" | "smith";
type Rect = [number, number, number, number];
interface Px { r: number; g: number; b: number; h: number; s: number; v: number; y: number }
/** Условие по цвету пикселя и его положению (x, y) в вырезке. */
type Pred = (p: Px, x: number, y: number) => boolean;
/** Рампа с именем: статистика яркости собирается по паре «пак + имя». */
interface RampDef { id: string; ramp: Ramp; /** брать абсолютную яркость исходника без подгонки (тёмные плоские группы) */ abs?: boolean }
interface Rule { r: RampDef; when?: Pred }
interface ObjDef {
  pack: Pack;
  name: string;
  sheet: string;
  rect: Rect;
  rules: Rule[];
  /** Кусок тайловой раскладки (стена леса, обрыв): без внешнего контура, срез листа не считается краем. */
  tile?: boolean;
  /** Доля яркостного диапазона рампы, ниже которой пиксель края считается контуром (по умолчанию 0.22). */
  rim?: number;
  /** Пиксели не ярче этого значения всегда контур (по умолчанию 12: почти чёрное). */
  dark?: number;
  /** Вырезанные в камне руны и надписи красить фиолетовым рядом Умбрата. */
  runes?: boolean;
  /** Привести к масштабу героя: итоговая высота спрайта вместе с контуром, px. Уменьшение по блокам (downscaleMode), чистка, контур заново. */
  height?: number;
  /** То же коэффициентом от исходника (если высота не задана). */
  scale?: number;
  /** Тонкие детали (ветви): блок считается закрашенным уже при 34% площади, чтобы не рвать линии. */
  thin?: boolean;
}

const rd = (id: string, ramp: Ramp, abs = false): RampDef => ({ id, ramp, abs });
const PURP = P.magic.purple;

// ---------- листы паков ----------
const BASIC = "vendor/basic/src/basic_tileset_and_assets_standard_v3.0";
const SHEETS: Record<string, string> = {
  "basic.assets": `${BASIC}/sprites/assets-spritesheet-standard.png`,
  "basic.tree": `${BASIC}/tiles/tiles - tree - 32x32.png`,
  "basic.fence": `${BASIC}/tiles/tiles-fence-32x32.png`,
  "basic.terrain": `${BASIC}/tiles/tiles-terrain-32x32.png`,
  "basic.ladder_earth": `${BASIC}/sprites/ladder-earth.png`,
  "basic.ladder_grass": `${BASIC}/sprites/ladder-grass.png`,
  "basic.ladder_soil": `${BASIC}/sprites/ladder-soil.png`,
  "volcano.assets": "vendor/volcano/src/volcanoe_tileset_and_assets/volcanoe_assets.png",
  "graveyard.set": "vendor/graveyard/src/Graveyard/Graveyard_Set.png",
  // шаг 9 задачи 132: форты, мосты, поле после битвы, лагерь, кузня (выбор пользователя 2026-10-22, лицензии — CREDITS.md)
  "fort.tiles": "vendor/craftpix-fortress-kit/src/Tileset/Tiled_Map.png",
  "bridges.set": "vendor/craftpix-bridges/src/PNG_n_Tiled/Bridges.png",
  "undead.obj": "vendor/craftpix-undead/src/PNG/Objects.png",
  "deco.set": "vendor/lpc-village-deco/src/decoration_medieval/decorations-medieval.png",
  "smith.set": "vendor/lpc-blacksmith/src/lpc-blacksmith/blacksmith-smelter.png",
};
/** Листы LPC Village Decorations: зелёный (129,161,0) — фон-заливка пустых клеток, убирается при чтении. */
const KEYED = new Set(["deco.set"]);

// ---------- рампы и оттенки ----------
const LEAF = rd("leaf", P.leaf), PINE = rd("pine", P.pine), BARK = rd("bark", P.bark), WOOD = rd("wood", P.wood), DIRT = rd("dirt", P.dirt);
const STONE = rd("stone", P.stone), OBSIDIAN = rd("obsidian", P.obsidian), DEADWOOD = rd("deadwood", P.deadwood), BONE = rd("bone", P.bone.slice(1));
const LAVA = rd("lava", P.lava.slice(1)); // без самого тёмного тона: он у нас «остывшая корка», у свечения яркость выше
const DSTEEL = rd("darksteel", P.darkSteel), MOSS = rd("moss", P.moss), SATIN = rd("satin", P.cloth.purple);
const FLAME = rd("flame", PURP.slice(2)), GLASS = rd("glass", PURP.slice(1, 4));
const RED_WOOD = rd("redwood", P.roofRed.slice(0, 3), true); // тёмное красное дерево указателей: яркость как в исходнике
const F_BLUE = rd("flower_blue", P.magic.blue.slice(1, 4)), F_RED = rd("flower_red", P.cloth.red.slice(1, 4));
const F_PINK = rd("flower_pink", P.coral.pink.slice(1, 4)), F_GOLD = rd("flower_gold", P.gold.slice(1, 4)), F_WHITE = rd("flower_white", P.bone.slice(1, 4));

const GREEN_WIDE: Pred = (p) => p.s >= 0.12 && p.h >= 60 && p.h < 200;
const GREEN: Pred = (p) => p.s >= 0.12 && p.h >= 60 && p.h < 165;
const BLUE: Pred = (p) => p.h >= 170 && p.h < 260 && p.s > 0.6 && p.v > 0.6;
const LAVA_GLOW: Pred = (p) => p.s >= 0.55 && p.v >= 0.6 && (p.h <= 65 || p.h >= 340);
const FIRE: Pred = (p) => p.s >= 0.25 && p.v >= 0.8 && p.h >= 25 && p.h < 70; // огонь свечи и фонаря
const TEAL: Pred = (p) => p.s >= 0.08 && p.h >= 150 && p.h < 200; // зеленоватое стекло фонаря
const BROWN: Pred = (p) => p.s >= 0.3 && p.h >= 10 && p.h < 50;
const GREENISH: Pred = (p) => p.s >= 0.25 && p.h >= 60 && p.h < 170;
const LIGHT: Pred = (p) => p.y >= 150;
const TAN: Pred = (p) => p.y >= 125 && p.h >= 20 && p.h < 50;

const OAK: Rule[] = [{ r: LEAF, when: GREEN_WIDE }, { r: BARK }];
const PINES: Rule[] = [{ r: PINE, when: GREEN_WIDE }, { r: BARK }];
const bush = (flower?: RampDef): Rule[] => (flower
  ? [...(flower === F_BLUE ? [{ r: flower, when: BLUE }] : []), { r: LEAF, when: GREEN }, { r: flower }]
  : [{ r: LEAF }]);
const WOODEN: Rule[] = [{ r: WOOD }];
const ROCK: Rule[] = [{ r: OBSIDIAN }];
const DEAD: Rule[] = [{ r: DEADWOOD }];
const GRAVE_STONE: Rule[] = [{ r: STONE }];
const IRON: Rule[] = [{ r: DSTEEL }];
// плато наверху обрыва (первый тайловый ряд) — земля, всё остальное — камень: рыжие блики на булыжнике остаются камнем
const CLIFF: Rule[] = [{ r: DIRT, when: (p, x, y) => TAN(p, x, y) && y < 30 }, { r: STONE }];
const CAVE: Rule[] = [{ r: STONE }];

const defs: ObjDef[] = [];
const add = (pack: Pack, name: string, sheet: string, rect: Rect, rules: Rule[], opt: Partial<ObjDef> = {}) => {
  defs.push({ pack, name, sheet, rect, rules, ...opt });
};

// ---------- Basic Tileset and Asset Pack 32x32 (Schwarnhild): деревья, лес, кусты, пни, брёвна, заборы, указатели, лестницы, обрывы, пещеры ----------
// Рамки листа assets-spritesheet-standard.png найдены по связным областям прозрачности.
// Высоты зелёных деревьев — по решению пользователя (масштаб героя 32 px): дуб ~96, большой ~110, малый ~56; сосна — 0,75 от исходника.
add("basic", "oak", "basic.assets", [342, 0, 80, 128], OAK, { height: 96 });
add("basic", "oak_small", "basic.assets", [270, 1, 61, 95], OAK, { height: 56 });
add("basic", "pine", "basic.assets", [211, 3, 52, 92], PINES, { height: 66 });
add("basic", "oak_big", "basic.tree", [0, 0, 96, 128], OAK, { height: 110 }); // крона из 3×4 тайлов
add("basic", "bush", "basic.assets", [17, 249, 45, 41], bush(), { scale: 0.75 });
add("basic", "bush_blue", "basic.assets", [9, 8, 62, 51], bush(F_BLUE), { scale: 0.75 });
add("basic", "bush_red", "basic.assets", [9, 68, 62, 51], bush(F_RED), { scale: 0.75 });
add("basic", "bush_pink", "basic.assets", [9, 127, 62, 51], bush(F_PINK), { scale: 0.75 });
add("basic", "bush_yellow", "basic.assets", [9, 184, 62, 51], bush(F_GOLD), { scale: 0.75 });
add("basic", "shrub", "basic.assets", [246, 151, 32, 32], bush());
add("basic", "shrub_white", "basic.assets", [208, 151, 32, 32], bush(F_WHITE));
add("basic", "stump", "basic.assets", [289, 152, 40, 28], WOODEN);
add("basic", "stump_small", "basic.assets", [341, 142, 22, 15], WOODEN);
add("basic", "sign_post", "basic.assets", [380, 138, 26, 32], WOODEN);
add("basic", "sign_arrow", "basic.assets", [379, 184, 30, 32], WOODEN);
add("basic", "log_stand", "basic.assets", [329, 236, 12, 32], WOODEN);
add("basic", "log", "basic.assets", [357, 249, 42, 14], WOODEN);
add("basic", "log_pile", "basic.assets", [418, 232, 36, 49], WOODEN);
add("basic", "palisade_5", "basic.assets", [339, 312, 60, 38], WOODEN);
add("basic", "palisade_2", "basic.assets", [417, 311, 24, 44], WOODEN);
add("basic", "palisade_1", "basic.assets", [451, 311, 12, 38], WOODEN);
add("basic", "fence_row", "basic.fence", [0, 0, 96, 32], WOODEN);
add("basic", "fence_post", "basic.fence", [96, 0, 32, 32], WOODEN);
add("basic", "fence_row_b", "basic.fence", [0, 64, 96, 32], WOODEN);
add("basic", "fence_post_b", "basic.fence", [96, 64, 32, 32], WOODEN);
add("basic", "ladder_earth", "basic.ladder_earth", [0, 0, 66, 42], [{ r: DIRT }], { dark: 36 });
add("basic", "ladder_grass", "basic.ladder_grass", [0, 0, 66, 41], [{ r: DIRT }], { dark: 36 });
add("basic", "ladder_soil", "basic.ladder_soil", [0, 0, 66, 42], [{ r: DIRT }], { dark: 36 });
add("basic", "cave_a", "basic.terrain", [128, 160, 64, 64], CAVE, { dark: 28, scale: 0.8 });
add("basic", "cave_b", "basic.terrain", [192, 160, 64, 64], CAVE, { dark: 28, scale: 0.8 });
add("basic", "cliff_h", "basic.terrain", [0, 96, 96, 96], CLIFF, { dark: 20, scale: 0.75 });
add("basic", "cliff_end", "basic.terrain", [96, 96, 32, 96], CLIFF, { dark: 20, scale: 0.75 });
add("basic", "stairs", "basic.terrain", [160, 320, 96, 96], [{ r: DIRT }], { dark: 20, scale: 0.75 });

// ---------- Volcanoe Tileset and Asset Pack 32x32 (Schwarnhild): только объекты ----------
add("volcano", "rock_a", "volcano.assets", [10, 7, 20, 22], ROCK);
add("volcano", "rock_b", "volcano.assets", [43, 11, 17, 17], ROCK);
add("volcano", "rock_c", "volcano.assets", [70, 11, 17, 17], ROCK);
add("volcano", "boulder", "volcano.assets", [96, 5, 31, 27], ROCK);
add("volcano", "rock_pile", "volcano.assets", [144, 46, 32, 33], ROCK);
add("volcano", "skull_ram", "volcano.assets", [163, 10, 27, 19], [{ r: WOOD, when: (p) => p.s >= 0.4 && p.h < 40 }, { r: BONE }]);
add("volcano", "skull", "volcano.assets", [199, 10, 19, 18], [{ r: BONE }]);
add("volcano", "ribs", "volcano.assets", [227, 11, 27, 18], [{ r: BONE }]);
add("volcano", "dead_tree", "volcano.assets", [6, 53, 55, 74], DEAD);
add("volcano", "dead_tree_tall", "volcano.assets", [69, 37, 57, 90], DEAD);
add("volcano", "dead_stump", "volcano.assets", [134, 109, 24, 16], DEAD);
add("volcano", "dead_bush_a", "volcano.assets", [6, 142, 54, 37], DEAD);
add("volcano", "dead_bush_b", "volcano.assets", [72, 145, 52, 36], DEAD);
add("volcano", "signboard", "volcano.assets", [200, 44, 43, 45], [{ r: RED_WOOD }]);
add("volcano", "sign_a", "volcano.assets", [176, 100, 27, 26], [{ r: RED_WOOD }]);
add("volcano", "sign_b", "volcano.assets", [216, 100, 32, 26], [{ r: RED_WOOD }]);
const MOUND: Rule[] = [{ r: LAVA, when: LAVA_GLOW }, { r: OBSIDIAN }];
add("volcano", "lava_mound_a", "volcano.assets", [9, 195, 64, 28], MOUND);
add("volcano", "lava_mound_b", "volcano.assets", [160, 195, 64, 28], MOUND);
add("volcano", "lava_mound_s", "volcano.assets", [101, 202, 51, 21], MOUND);
add("volcano", "lava_mound_big", "volcano.assets", [10, 246, 80, 37], MOUND);
add("volcano", "lava_mound_ring", "volcano.assets", [96, 257, 64, 29], MOUND);

// ---------- Graveyard Set (Free) (0_mem0ry): надгробия, кресты, ограды, статуи, фонари, гробы, мёртвые деревья ----------
// Лист рассчитан на сетку 16 px; рамки — по связным областям, слипшиеся группы (статуи, лампы, гробы) разрезаны вручную.
const G = "graveyard.set";
add("graveyard", "pillar", G, [167, 16, 18, 64], GRAVE_STONE);
add("graveyard", "pillar_chain", G, [39, 0, 25, 80], GRAVE_STONE);
add("graveyard", "pillar_broken", G, [71, 16, 18, 64], GRAVE_STONE);
add("graveyard", "pillar_fence", G, [96, 16, 32, 64], GRAVE_STONE);
add("graveyard", "pillar_low", G, [55, 96, 18, 48], GRAVE_STONE);
add("graveyard", "pillar_low_fence", G, [16, 96, 32, 48], GRAVE_STONE);
add("graveyard", "fence_long", G, [224, 20, 191, 57], IRON);
add("graveyard", "fence_base", G, [16, 164, 142, 44], IRON);
add("graveyard", "fence_base_end", G, [161, 164, 36, 44], IRON);
add("graveyard", "fence_pole_v", G, [234, 80, 12, 128], IRON);
(["a", "b", "c", "d", "e"] as const).forEach((k, i) => add("graveyard", `cross_${k}`, G, [[260, 85, 24, 43], [292, 85, 24, 43], [324, 85, 24, 43], [356, 86, 24, 42], [388, 85, 24, 43]][i] as Rect, GRAVE_STONE, { runes: true }));
(["a", "b", "c", "d", "e"] as const).forEach((k, i) => add("graveyard", `stone_${k}`, G, [[260, 144, 24, 32], [292, 144, 24, 32], [324, 144, 24, 32], [356, 144, 24, 32], [388, 144, 24, 32]][i] as Rect, GRAVE_STONE, { runes: true }));
(["a", "b", "c", "d", "e"] as const).forEach((k, i) => add("graveyard", `slab_${k}`, G, [[260, 199, 24, 41], [292, 199, 24, 41], [324, 199, 24, 41], [356, 201, 24, 39], [388, 212, 24, 28]][i] as Rect, GRAVE_STONE, { runes: true }));
add("graveyard", "stele_a", G, [257, 259, 14, 45], GRAVE_STONE, { runes: true });
add("graveyard", "stele_b", G, [273, 251, 14, 53], GRAVE_STONE, { runes: true });
add("graveyard", "stele_c", G, [289, 267, 14, 37], GRAVE_STONE, { runes: true });
add("graveyard", "stele_d", G, [305, 275, 14, 29], GRAVE_STONE, { runes: true });
add("graveyard", "sword_grave", G, [320, 256, 16, 48], GRAVE_STONE);
add("graveyard", "statue_a", G, [16, 224, 48, 80], GRAVE_STONE, { scale: 0.8 });
add("graveyard", "statue_b", G, [64, 224, 80, 80], GRAVE_STONE, { scale: 0.75 });
const LAMP: Rule[] = [{ r: FLAME, when: FIRE }, { r: GLASS, when: TEAL }, { r: DSTEEL }];
add("graveyard", "lamp_a", G, [16, 304, 16, 64], LAMP);
add("graveyard", "lamp_b", G, [32, 304, 16, 56], LAMP);
add("graveyard", "lamp_c", G, [48, 304, 16, 56], LAMP);
add("graveyard", "lantern_a", G, [64, 312, 16, 26], LAMP);
add("graveyard", "lantern_c", G, [96, 312, 16, 26], LAMP);
add("graveyard", "coffin_open", G, [197, 221, 54, 50], [{ r: SATIN, when: LIGHT }, { r: DSTEEL }]);
add("graveyard", "coffin_closed", G, [197, 273, 54, 30], IRON);
add("graveyard", "coffin_open_v", G, [192, 304, 27, 63], [{ r: SATIN, when: LIGHT }, { r: DSTEEL }]);
add("graveyard", "coffin_closed_v", G, [229, 312, 22, 55], IRON);
const GTREE: Rule[] = [{ r: MOSS, when: GREENISH }, { r: DEADWOOD }];
add("graveyard", "dead_tree_a", G, [243, 368, 55, 80], GTREE);
add("graveyard", "dead_tree_b", G, [304, 372, 32, 74], GTREE);
add("graveyard", "dead_tree_vines", G, [344, 368, 50, 80], GTREE);
add("graveyard", "dead_stump", G, [407, 384, 19, 63], GTREE);
add("graveyard", "grave_pit", G, [259, 308, 26, 55], [{ r: DIRT }]);
add("graveyard", "grave_mound", G, [291, 308, 26, 57], [{ r: DIRT }]);
add("graveyard", "grave_mound_h", G, [324, 339, 58, 26], [{ r: DIRT }]);

// ---------- шаг 9 задачи 132: Поля, форты, мосты, лагерь, кузня ----------
// CraftPix (Fortress Kit, Bridges, Undead): сетка 16, фортовые стены и мосты — ×2 (герой 32 px = два тайла кита), башня и мёртвое — 1:1 или меньше.
// LPC (Village Decorations, Blacksmith): сетка 32, пиксель 1:1. Краска — рампы палитры игры.
const CANVAS = rd("canvas", P.cloth.rag), CGREEN = rd("cloth_green", P.cloth.green), TERRA = rd("terracotta", P.dirt);
const FIREO = rd("forge_fire", P.magic.fire.slice(1)), WATERR = rd("water", P.water.slice(1, 4));
const BLUEW: Pred = (p) => p.h >= 175 && p.h < 235 && p.s > 0.4 && p.v > 0.45;
const ORANGE: Pred = (p) => p.s >= 0.5 && p.v >= 0.65 && (p.h <= 55 || p.h >= 345);
const TERRACOTTA: Pred = (p) => p.s >= 0.3 && p.h >= 5 && p.h < 28 && p.y >= 90;
const STONES: Rule[] = [{ r: WOOD, when: BROWN }, { r: STONE }];
const BRIDGE_BRICK: Rule[] = [{ r: TERRA, when: TERRACOTTA }, { r: WOOD, when: BROWN }, { r: STONE }];
const FORT = "fort.tiles", BR = "bridges.set", UD = "undead.obj", DC = "deco.set", SM = "smith.set";
add("fortkit", "tower_block", FORT, [16, 32, 64, 112], STONES, { dark: 20 });
add("fortkit", "wall_low_a", FORT, [16, 200, 64, 24], STONES, { dark: 20, scale: 2 });
add("fortkit", "wall_low_b", FORT, [16, 232, 64, 24], STONES, { dark: 20, scale: 2 });
add("fortkit", "gate_arch", FORT, [160, 16, 32, 32], STONES, { dark: 20, scale: 2 });
add("fortkit", "stairs", FORT, [160, 176, 48, 48], STONES, { dark: 20, scale: 2 });
add("fortkit", "ladder", FORT, [96, 176, 16, 80], WOODEN, { scale: 2 });
add("bridges", "stone_h", BR, [84, 2, 103, 66], BRIDGE_BRICK, { dark: 20, scale: 2 });
add("bridges", "brick_h", BR, [500, 0, 137, 77], BRIDGE_BRICK, { dark: 20, scale: 2 });
add("bridges", "rope_h", BR, [277, 161, 119, 33], BRIDGE_BRICK, { dark: 20, scale: 2 });
add("bridges", "stone_v", BR, [11, 37, 41, 102], BRIDGE_BRICK, { dark: 20, scale: 2 });
add("bridges", "brick_v", BR, [426, 41, 43, 128], BRIDGE_BRICK, { dark: 20, scale: 2 });
add("bridges", "rope_v", BR, [227, 160, 26, 121], BRIDGE_BRICK, { dark: 20, scale: 2 });
const CROWNGOLD = rd("crown_gold", P.gold.slice(0, 4));
const UBONE: Rule[] = [{ r: CROWNGOLD, when: (p) => p.s >= 0.45 && p.h >= 28 && p.h < 58 && p.v > 0.5 }, { r: MOSS, when: GREENISH }, { r: DEADWOOD, when: BROWN }, { r: BONE }];
add("undead", "giant_skeleton", UD, [5, 3, 150, 113], UBONE, { scale: 0.75 });
add("undead", "ruin_a", UD, [0, 125, 80, 98], [{ r: STONE }]);
add("undead", "ruin_b", UD, [80, 125, 80, 98], [{ r: STONE }]);
add("undead", "ruin_arch", UD, [0, 300, 76, 67], [{ r: STONE }]);
add("undead", "skull_trio", UD, [370, 473, 25, 22], UBONE);
add("undead", "skull_cluster", UD, [440, 80, 40, 48], UBONE);
add("undead", "bird_skull", UD, [420, 433, 20, 30], UBONE);
add("undead", "jaw", UD, [391, 560, 30, 22], UBONE);
add("undead", "ribs", UD, [481, 115, 61, 25], UBONE);
add("undead", "bones_a", UD, [3, 560, 43, 27], UBONE);
add("undead", "bones_b", UD, [104, 560, 29, 24], UBONE);
add("undead", "bones_c", UD, [243, 560, 44, 24], UBONE);
add("deco", "tent_side", DC, [386, 1733, 124, 147], [{ r: WOOD, when: BROWN }, { r: CANVAS }], { scale: 0.75 });
add("deco", "wagon_covered", DC, [199, 1250, 116, 133], [{ r: CGREEN, when: GREEN_WIDE }, { r: WOOD }], { scale: 0.75 });
add("deco", "wagon_open", DC, [199, 1408, 116, 71], [{ r: WOOD }], { scale: 0.75 });
add("deco", "wheels", DC, [416, 1440, 64, 66], [{ r: WOOD }]);
add("deco", "target", DC, [142, 1517, 34, 48], [{ r: RED_WOOD, when: (p) => p.s >= 0.5 && (p.h < 20 || p.h > 340) }, { r: WOOD }]);
add("deco", "spear_rack", DC, [38, 1504, 49, 32], [{ r: WOOD }]);
add("deco", "stocks", DC, [133, 1472, 58, 32], [{ r: WOOD }]);
add("deco", "gallows", DC, [1, 1426, 52, 59], [{ r: WOOD }]);
add("deco", "pillory", DC, [69, 1415, 56, 75], [{ r: WOOD }]);
const SMITHR = (iron: boolean): Rule[] => [{ r: WATERR, when: BLUEW }, { r: WOOD, when: BROWN }, { r: iron ? DSTEEL : STONE }];
add("smith", "forge_cone", SM, [256, 0, 128, 192], SMITHR(false), { scale: 0.75 });
add("smith", "forge_small", SM, [0, 0, 64, 128], SMITHR(false));
add("smith", "anvil_a", SM, [331, 419, 46, 27], SMITHR(true));
add("smith", "anvil_b", SM, [288, 421, 32, 24], SMITHR(true));
add("smith", "tub_a", SM, [448, 429, 64, 35], SMITHR(true));
add("smith", "tub_b", SM, [512, 416, 64, 64], SMITHR(true));
add("smith", "bench", SM, [258, 482, 61, 64], SMITHR(true));
add("smith", "tool_rack", SM, [322, 480, 125, 66], SMITHR(true));
add("smith", "coal_pile", SM, [263, 196, 113, 50], [{ r: OBSIDIAN }]);

// ---------- перекраска ----------
interface Prep {
  def: ObjDef;
  id: string;
  /** Вырезка из листа как есть (для превью «исходник»), обрезанная по любым непрозрачным пикселям, тень включена. */
  raw: PC;
  cut: PC;
  w: number;
  h: number;
  solid: Uint8Array;
  edge: Uint8Array;
  grp: Int8Array;
  y: Float32Array;
}
interface Result { id: string; def: ObjDef; raw: PC; out: PC; content: Rect; file: string }

/** Перекрашенные объекты кладутся прямо в игру: tools/gen-assets.ts сам добавляет любой png из этой папки в manifest.json. */
const GAME_OBJECTS = path.join(ROOT, "client/public/assets/objects");
const sheetCache = new Map<string, PC>();
const sheetPc = (key: string): PC => {
  let pc = sheetCache.get(key);
  if (!pc) {
    const file = path.join(ROOT, SHEETS[key]);
    if (!fs.existsSync(file)) throw new Error(`нет листа ${SHEETS[key]}: распакуйте архивы в vendor/<пак>/src (см. vendor/<пак>/LICENSE.txt)`);
    pc = readPng(file);
    if (KEYED.has(key)) for (let i = 0; i < pc.w * pc.h; i++) if (pc.data[i * 4] === 129 && pc.data[i * 4 + 1] === 161 && pc.data[i * 4 + 2] === 0) pc.data[i * 4 + 3] = 0;
    sheetCache.set(key, pc);
  }
  return pc;
};

function prepare(def: ObjDef): Prep {
  const [x, y, w, h] = def.rect;
  const cut = crop(sheetPc(def.sheet), x, y, w, h);
  const raw = trim(cut).pc;
  const n = w * h;
  const solid = new Uint8Array(n), edge = new Uint8Array(n), grp = new Int8Array(n).fill(-1), ys = new Float32Array(n);
  for (let i = 0; i < n; i++) solid[i] = cut.data[i * 4 + 3] >= 100 ? 1 : 0; // тень (альфа 64) выбрасываем
  // за границей вырезки: у обычных объектов пустота (там край), у кусков тайловой раскладки — сплошное (срез не край)
  const at = (px: number, py: number) => (px >= 0 && py >= 0 && px < w && py < h ? solid[py * w + px] : def.tile ? 1 : 0);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    if (!solid[k]) continue;
    edge[k] = !at(i - 1, j) || !at(i + 1, j) || !at(i, j - 1) || !at(i, j + 1) ? 1 : 0;
    const r = cut.data[k * 4], g = cut.data[k * 4 + 1], b = cut.data[k * 4 + 2];
    const [hh, s, v] = hsv(r, g, b);
    const px: Px = { r, g, b, h: hh, s, v, y: luma(r, g, b) };
    ys[k] = px.y;
    const gi = def.rules.findIndex((ru) => !ru.when || ru.when(px, i, j));
    grp[k] = gi < 0 ? def.rules.length - 1 : gi;
  }
  return { def, id: `v_${def.pack}_${def.name}`, raw, cut, w, h, solid, edge, grp, y: ys };
}

const pct = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
interface Stat { lo: number; hi: number; n: number }
function stat(vals: number[]): Stat {
  if (vals.length < 4) return { lo: 0, hi: 0, n: vals.length };
  const s = [...vals].sort((a, b) => a - b);
  return { lo: pct(s, 0.02), hi: pct(s, 0.98), n: vals.length };
}

/** Ближайший по яркости тон рампы. Яркость подгоняется под диапазон рампы (растяжение 0.6–1.6 вокруг середины);
 *  если разброс исходника мал (плоская группа), подгонка ослабляется и тон берётся ближе к абсолютной яркости. */
function mapper(ramp: Ramp, st: Stat, abs: boolean): (y: number) => RGBA {
  const ry = ramp.map((c) => luma(c[0], c[1], c[2]));
  const rMin = ry[0], rMax = ry[ry.length - 1], rMid = (rMin + rMax) / 2;
  const mid = (st.lo + st.hi) / 2, spread = st.hi - st.lo;
  const k = st.n < 4 ? 1 : Math.min(1.6, Math.max(0.6, (rMax - rMin) / Math.max(1, spread)));
  const w = st.n < 4 || abs ? 0 : Math.min(1, spread / (0.6 * (rMax - rMin)));
  return (y) => {
    const t = w * (rMid + (y - mid) * k) + (1 - w) * y;
    let best = 0, bd = 1e9;
    ry.forEach((v, i) => { const d = Math.abs(v - t); if (d < bd) { bd = d; best = i; } });
    return ramp[best];
  };
}

function push(m: Map<string, number[]>, k: string, v: number) {
  const a = m.get(k);
  if (a) a.push(v); else m.set(k, [v]);
}

function recolorAll(preps: Prep[]): Map<Prep, PC> {
  // 1. статистика яркости по паре «пак + рампа» (все пиксели пака)
  const key = (p: Prep, g: number) => `${p.def.pack}:${p.def.rules[g].r.id}`;
  const pool = new Map<string, number[]>();
  for (const p of preps) for (let k = 0; k < p.w * p.h; k++) if (p.solid[k]) push(pool, key(p, p.grp[k]), p.y[k]);
  const all = new Map([...pool].map(([k, v]) => [k, stat(v)]));
  // 2. контур: тёмные пиксели края и почти чёрные пиксели
  const isOut = new Map<Prep, Uint8Array>();
  const pool2 = new Map<string, number[]>();
  for (const p of preps) {
    const m = new Uint8Array(p.w * p.h);
    const rim = p.def.rim ?? 0.22, dark = p.def.dark ?? 12;
    // у уменьшаемых объектов тёмная кайма не нужна: после уменьшения контур рисуется заново снаружи
    const noRim = p.def.height !== undefined || p.def.scale !== undefined;
    for (let k = 0; k < p.w * p.h; k++) {
      if (!p.solid[k]) continue;
      const st = all.get(key(p, p.grp[k]))!;
      const cut = noRim || st.n < 4 || st.hi - st.lo < 10 ? -1 : st.lo + (st.hi - st.lo) * rim;
      if (p.y[k] <= dark || (p.edge[k] && p.y[k] <= cut)) m[k] = 1;
      else push(pool2, key(p, p.grp[k]), p.y[k]);
    }
    isOut.set(p, m);
  }
  // 3. тон рампы по статистике оставшихся пикселей
  const maps = new Map<string, (y: number) => RGBA>();
  for (const p of preps) p.def.rules.forEach((ru, g) => {
    const k = key(p, g);
    if (!maps.has(k)) maps.set(k, mapper(ru.r.ramp, stat(pool2.get(k) ?? []), !!ru.r.abs));
  });
  // 4. запись
  const res = new Map<Prep, PC>();
  for (const p of preps) {
    const out = new PC(p.w, p.h), m = isOut.get(p)!;
    for (let k = 0; k < p.w * p.h; k++) {
      if (!p.solid[k]) continue;
      const g = p.grp[k], kk = key(p, g);
      let c: RGBA = m[k] ? OUTLINE : maps.get(kk)!(p.y[k]);
      if (p.def.runes && !m[k] && !p.edge[k] && p.def.rules[g].r === STONE) {
        // руны: вырезанные в камне надписи — самый тёмный тон камня выше чёрного (не край и не обводка)
        const st = all.get(kk)!;
        if (p.y[k] >= 20 && p.y[k] <= st.lo + (st.hi - st.lo) * 0.45) c = PURP[2];
      }
      const d = k * 4;
      out.data[d] = c[0]; out.data[d + 1] = c[1]; out.data[d + 2] = c[2]; out.data[d + 3] = 255;
    }
    res.set(p, out);
  }
  return res;
}

const isOutline = (c: RGBA) => c[0] === OUTLINE[0] && c[1] === OUTLINE[1] && c[2] === OUTLINE[2];
/** Контур снаружи там, где край не тёмный: как PC.outline() у наших объектов, но без второй обводки поверх своей каймы. */
function outlineMissing(src: PC): PC {
  const out = new PC(src.w + 2, src.h + 2);
  out.blit(src, 1, 1);
  const base = out.clone();
  const nb: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    if (base.alpha(x, y) > 0) continue;
    let solid = 0, dark = 0;
    for (const [dx, dy] of nb) {
      const c = base.get(x + dx, y + dy);
      if (c && c[3] > 120) { solid++; if (isOutline(c)) dark++; }
    }
    if (solid && !dark) out.set(x, y, OUTLINE);
  }
  return out;
}
/** Холст кратен 32: по центру по ширине, по низу по высоте (опорная точка объектов — нижняя середина). */
function padGrid(pc: PC): PC {
  const W = Math.ceil(pc.w / 32) * 32, H = Math.ceil(pc.h / 32) * 32;
  const out = new PC(W, H);
  out.blit(pc, Math.floor((W - pc.w) / 2), H - pc.h);
  return out;
}

/** Масштаб героя: уменьшение по блокам (преобладающий цвет), чистка одиночных пикселей; контур рисуется после, снаружи. */
function shrink(t: PC, d: ObjDef): PC {
  const s = d.height !== undefined ? (d.height - 2) / t.h : d.scale ?? 1;
  const w2 = Math.max(1, Math.round(t.w * s)), h2 = d.height !== undefined ? d.height - 2 : Math.max(1, Math.round(t.h * s));
  return trim(tidy(downscaleMode(t, w2, h2, d.thin ? 0.34 : 0.5))).pc;
}

function finish(p: Prep, recolored: PC, scaled = true): Result {
  let pc = recolored;
  if (!p.def.tile) {
    let t = trim(pc).pc;
    if (scaled && (p.def.height !== undefined || p.def.scale !== undefined)) t = shrink(t, p.def);
    pc = trim(outlineMissing(t)).pc;
  }
  const out = p.def.tile ? pc : padGrid(pc);
  const content = opaqueBox(out) ?? [0, 0, out.w, out.h];
  return { id: p.id, def: p.def, raw: p.raw, out, content: content as Rect, file: path.join(GAME_OBJECTS, `${p.id}.png`) };
}

// ---------- превью ----------
const HALF = 480; // ширина половины листа до ×2
function packSheet(title: string, items: Result[]): PC {
  const PAD = 6, LBL = 9;
  const cells = items.map((r) => {
    const name = r.id.replace(/^v_[a-z]+_/, "");
    const cw = Math.max(r.raw.w, r.out.w, textWidth(name) + 2) + PAD * 2;
    const sh = Math.max(r.raw.h, r.out.h);
    return { r, name, cw, sh, ch: sh + LBL + PAD * 2 };
  });
  let x = 0, y = 0, rowH = 0;
  const pos: { x: number; y: number }[] = [];
  for (const c of cells) {
    if (x + c.cw > HALF && x > 0) { x = 0; y += rowH; rowH = 0; }
    pos.push({ x, y });
    x += c.cw;
    rowH = Math.max(rowH, c.ch);
  }
  y += rowH;
  const M = 8, GAP = 12, TOP = 12;
  const sheet = new PC(M * 2 + HALF * 2 + GAP, M * 2 + TOP + y);
  fill(sheet, BG);
  const gx = [M, M + HALF + GAP], gy = M + TOP;
  for (const x0 of gx) paintGround(sheet, x0, gy, HALF, y);
  drawText(sheet, `${title} - SOURCE`, M, M, GOLD);
  drawText(sheet, `${title} - RECOLORED`, M + HALF + GAP, M, GOLD);
  cells.forEach((c, i) => {
    const bottom = gy + pos[i].y + PAD + c.sh;
    [c.r.raw, c.r.out].forEach((pc, side) => {
      const x0 = gx[side] + pos[i].x + Math.floor((c.cw - pc.w) / 2);
      sheet.blit(pc, x0, bottom - pc.h);
      chipText(sheet, c.name, gx[side] + pos[i].x + Math.floor((c.cw - textWidth(c.name)) / 2), bottom + 2, BEIGE);
    });
  });
  return scaleNN(sheet, 2);
}

/** Общий лист: наши объекты (золотые подписи) рядом с новыми (бежевые). */
const COMPARE: { ours: string[]; theirs: string[] }[] = [
  // наши деревья (oak, pine, dead_tree) из игры убраны: их заменяют деревья паков; на листе вместо них — герой 32 px
  { ours: ["unit:warrior"], theirs: ["basic.oak", "basic.oak_small", "basic.oak_big", "basic.pine"] },
  { ours: ["bush"], theirs: ["basic.bush", "basic.bush_red", "basic.shrub"] },
  { ours: [], theirs: ["volcano.dead_tree", "volcano.dead_tree_tall", "graveyard.dead_tree_a", "graveyard.dead_tree_vines"] },
  { ours: ["rock", "basalt"], theirs: ["volcano.boulder", "volcano.rock_pile", "volcano.rock_a"] },
  { ours: ["bones"], theirs: ["volcano.skull", "volcano.skull_ram", "volcano.ribs"] },
  { ours: ["ember_vent"], theirs: ["volcano.lava_mound_a", "volcano.lava_mound_s", "volcano.lava_mound_big"] },
  { ours: ["signpost"], theirs: ["basic.sign_post", "basic.sign_arrow", "volcano.sign_a", "volcano.signboard"] },
  { ours: ["lamp", "soul_brazier"], theirs: ["graveyard.lamp_a", "graveyard.lamp_c", "graveyard.lantern_a"] },
  { ours: ["dark_obelisk"], theirs: ["graveyard.cross_a", "graveyard.stone_c", "graveyard.statue_a", "graveyard.coffin_open"] },
  { ours: [], theirs: ["basic.fence_row", "basic.palisade_5", "basic.log_pile", "graveyard.fence_base", "graveyard.pillar_fence"] },
  { ours: [], theirs: ["basic.cave_a", "basic.cave_b", "basic.cliff_h", "basic.stairs", "basic.ladder_earth"] },
];
/** Наш объект из client/public/assets/objects; «unit:имя» — кадр героя 32×32 как линейка масштаба. */
function ourSprite(name: string): PC {
  if (name.startsWith("unit:")) return trim(crop(readPng(path.join(ROOT, `client/public/assets/units/${name.slice(5)}.png`)), 0, 0, 32, 32)).pc;
  return readPng(path.join(ROOT, `client/public/assets/objects/${name}.png`));
}
function compareSheet(byKey: Map<string, Result>): PC {
  type Cell = { pc: PC; label: string; ours: boolean };
  const rows: Cell[][] = COMPARE.map((r) => [
    ...r.ours.map((o) => ({ pc: ourSprite(o), label: o.replace("unit:", "hero "), ours: true })),
    ...r.theirs.map((t) => {
      const res = byKey.get(t);
      if (!res) throw new Error(`нет объекта ${t}`);
      return { pc: res.out, label: t.replace(/^[a-z]+\./, ""), ours: false };
    }),
  ]);
  const PAD = 6, M = 8, TOP = 12, GAPX = 14;
  const rowW = rows.map((r) => r.reduce((s, c) => s + Math.max(c.pc.w, textWidth(c.label) + 2) + PAD * 2, 0) + GAPX);
  const rowH = rows.map((r) => Math.max(...r.map((c) => c.pc.h)) + 9 + PAD * 2);
  const W = Math.max(...rowW) + M * 2, H = rowH.reduce((a, b) => a + b, 0) + M * 2 + TOP;
  const sheet = new PC(W, H);
  fill(sheet, BG);
  paintGround(sheet, M, M + TOP, W - M * 2, H - M * 2 - TOP);
  drawText(sheet, "OURS (GOLD) | NEW (BEIGE)", M, M, GOLD);
  let y = M + TOP;
  rows.forEach((r, ri) => {
    let x = M;
    const bottom = y + PAD + Math.max(...r.map((c) => c.pc.h));
    r.forEach((c, ci) => {
      const cw = Math.max(c.pc.w, textWidth(c.label) + 2) + PAD * 2;
      sheet.blit(c.pc, x + Math.floor((cw - c.pc.w) / 2), bottom - c.pc.h);
      chipText(sheet, c.label, x + Math.floor((cw - textWidth(c.label)) / 2), bottom + 2, c.ours ? GOLD : BEIGE);
      x += cw;
      if (c.ours && !r[ci + 1]?.ours) { sheet.rect(x + 2, y + 2, 1, rowH[ri] - 4, [18, 15, 22, 235]); x += GAPX; }
    });
    y += rowH[ri];
  });
  return scaleNN(sheet, 2);
}

/** Лист масштаба: герой 32 px в начале каждого ряда, линейка высот, пары «до | после» с высотой содержимого. */
function scaleSheet(pairs: { before: Result; after: Result }[]): PC {
  const hero = trim(crop(readPng(path.join(ROOT, "client/public/assets/units/warrior.png")), 0, 0, 32, 32)).pc;
  const PAD = 10, MAXW = 560, M = 8, LBL = 10;
  type Cell = { w: number; h: number; before: Result; after: Result };
  const cells: Cell[] = pairs.map((p) => ({ ...p, w: p.before.out.w + p.after.out.w + PAD, h: Math.max(p.before.out.h, p.after.out.h) }));
  const rows: Cell[][] = [[]];
  let x = hero.w + PAD * 2;
  for (const c of cells) {
    if (x + c.w + PAD > MAXW && rows[rows.length - 1].length) { rows.push([]); x = hero.w + PAD * 2; }
    rows[rows.length - 1].push(c);
    x += c.w + PAD;
  }
  const rowH = rows.map((r) => Math.max(hero.h, ...r.map((c) => c.h)) + LBL + 8);
  const sheet = new PC(MAXW + M * 2, rowH.reduce((a, b) => a + b, 0) + M * 2 + 12);
  fill(sheet, BG);
  paintGround(sheet, M, M + 12, MAXW, sheet.h - M * 2 - 12);
  drawText(sheet, "HERO 32 PX | BEFORE | AFTER (CONTENT HEIGHT PX)", M, M, GOLD);
  let y0 = M + 12;
  rows.forEach((r, ri) => {
    const base = y0 + rowH[ri] - LBL - 8;
    for (let k = 32; k <= 128; k += 32) if (k < rowH[ri] - LBL - 8) {
      for (let xx = M; xx < M + MAXW; xx += 4) sheet.set(xx, base - k, [18, 15, 22, 150]);
      drawText(sheet, String(k), M + 1, base - k - 6, [18, 15, 22, 255]);
    }
    sheet.blit(hero, M + PAD, base - hero.h);
    chipText(sheet, "HERO", M + PAD, base + 2, BEIGE);
    let cx = M + hero.w + PAD * 2;
    for (const c of r) {
      sheet.blit(c.before.out, cx, base - c.before.out.h);
      sheet.blit(c.after.out, cx + c.before.out.w + PAD, base - c.after.out.h);
      const name = c.after.id.replace(/^v_[a-z]+_/, "");
      chipText(sheet, `${name} ${c.before.content[3]}>${c.after.content[3]}`, cx, base + 2, BEIGE);
      cx += c.w + PAD;
    }
    y0 += rowH[ri];
  });
  return scaleNN(sheet, 2);
}

// ---------- запуск ----------
function main() {
  const t0 = Date.now();
  const preps = defs.map(prepare);
  const colored = recolorAll(preps);
  const results = preps.map((p) => finish(p, colored.get(p)!));
  // «до»: тот же конвейер без уменьшения (только для листа масштаба)
  const rawPreps = defs.map((d) => prepare({ ...d, height: undefined, scale: undefined }));
  const rawColored = recolorAll(rawPreps);
  const raw = new Map(rawPreps.map((p) => [`${p.def.pack}.${p.def.name}`, finish(p, rawColored.get(p)!, false)]));
  const byKey = new Map(results.map((r) => [`${r.def.pack}.${r.def.name}`, r]));
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  // папку превью не удаляем целиком (её может держать открытой оболочка), чистим только файлы
  if (fs.existsSync(PREVIEW_DIR)) for (const f of fs.readdirSync(PREVIEW_DIR, { withFileTypes: true })) if (f.isFile()) fs.rmSync(path.join(PREVIEW_DIR, f.name), { force: true }); // подпапки (world/) остаются
  // в игру: сначала убираем прежние v_*.png (удалённые из таблицы объекты не должны оставаться), потом пишем новые
  fs.mkdirSync(GAME_OBJECTS, { recursive: true });
  for (const f of fs.readdirSync(GAME_OBJECTS)) if (/^v_.*\.png$/.test(f)) fs.unlinkSync(path.join(GAME_OBJECTS, f));
  for (const r of results) writePng(r.out, r.file);
  // размеры в том же виде, что объекты в client/public/assets/manifest.json: { id: { w, h } }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "objects-manifest.json"), JSON.stringify(Object.fromEntries(results.map((r) => [r.id, { w: r.out.w, h: r.out.h }]))));
  for (const pack of ["basic", "volcano", "graveyard", "fortkit", "bridges", "undead", "deco", "smith"] as Pack[]) {
    const mine = results.filter((r) => r.def.pack === pack);
    const manifest = mine.map((r) => ({
      id: r.id, file: path.relative(ROOT, r.file).replace(/\\/g, "/"), size: [r.out.w, r.out.h], tiles: [r.out.w / 32, r.out.h / 32],
      content: r.content, tile: !!r.def.tile, scaled: r.def.height ?? r.def.scale ?? null, source: { sheet: SHEETS[r.def.sheet].replace(/^vendor\//, ""), rect: r.def.rect },
    }));
    fs.mkdirSync(path.join(OUT_DIR, pack), { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, pack, "manifest.json"), JSON.stringify(manifest, null, 1));
    writePng(packSheet(pack.toUpperCase(), mine), path.join(PREVIEW_DIR, `${pack}.png`));
  }
  writePng(compareSheet(byKey), path.join(PREVIEW_DIR, "compare.png"));
  const scaled = results.filter((r) => r.def.height !== undefined || r.def.scale !== undefined);
  writePng(scaleSheet(scaled.map((r) => ({ before: raw.get(`${r.def.pack}.${r.def.name}`)!, after: r }))), path.join(PREVIEW_DIR, "scale.png"));
  buildVendorUi();
  console.log(`[vendor] ${results.length} объектов в ${path.relative(ROOT, GAME_OBJECTS)}, превью в ${path.relative(ROOT, PREVIEW_DIR)} за ${Date.now() - t0} мс`);
}
main();
