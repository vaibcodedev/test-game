/**
 * Объекты из сторонних паков (задача 126): Basic и Volcanoe (Schwarnhild), Graveyard (0_mem0ry).
 * Спрайты v_<пак>_<имя>.png делает tools/gen/vendor.ts (перекраска под нашу палитру, масштаб героя) и кладёт в client/public/assets/objects;
 * tools/gen-assets.ts сам добавляет их в manifest.json. Здесь — наборы видов для раскладки мира (map.ts, cities.ts, raid.ts),
 * след на карте (какие клетки непроходимы) и слой отрисовки. Размеры спрайтов — в manifest.json (tools/out/vendor/<пак>/manifest.json).
 * Наши деревья oak, pine и dead_tree убраны совсем: зелёные — Basic, мёртвые — Volcanoe и Graveyard.
 */

// ---------- деревья ----------
/** Дубы: чаще малые, реже большие. Выбор по хешу клетки (map.ts pickV), поэтому повтор вида повышает его долю. */
export const OAKS = ["v_basic_oak_small", "v_basic_oak", "v_basic_oak_small", "v_basic_oak", "v_basic_oak_small"];
export const OAK_BIG = "v_basic_oak_big";
export const PINE = "v_basic_pine";
/** Лес: сосны, дубы разных размеров и редкий большой дуб. */
export const FOREST_TREES = [PINE, "v_basic_oak_small", "v_basic_oak", "v_basic_oak_small", PINE, OAK_BIG, "v_basic_oak"];
/** Мёртвые деревья: Volcanoe — пепел, топи, вулкан; Graveyard — земли Умбрата, курганы, туманный бор, Мортхейм. */
export const DEAD_ASH = ["v_volcano_dead_tree", "v_volcano_dead_tree_tall", "v_volcano_dead_tree"];
export const DEAD_GRAVE = ["v_graveyard_dead_tree_a", "v_graveyard_dead_tree_b", "v_graveyard_dead_tree_vines", "v_graveyard_dead_tree_a"];
/** Деревья, что чуть покачиваются (client/src/game/terrain.ts), и те, что зеркалятся случайно. */
export const SWAY_TREES = new Set([...OAKS, OAK_BIG, PINE]);
export const FLIP_TREES = new Set([...OAKS, OAK_BIG]);

// ---------- кусты, пни, мелочь (не мешают ходить) ----------
export const BUSHES = ["v_basic_bush", "v_basic_bush", "v_basic_shrub", "v_basic_shrub_white", "v_basic_bush"];
export const BUSHES_FLOWER = ["v_basic_bush_red", "v_basic_bush_pink", "v_basic_bush_yellow", "v_basic_bush_blue"];
export const STUMPS = ["v_basic_stump", "v_basic_stump_small", "v_basic_log", "v_basic_log_stand", "v_basic_stump"];
export const DEAD_BUSHES = ["v_volcano_dead_bush_a", "v_volcano_dead_bush_b"];
export const SKULLS = ["v_volcano_skull", "v_volcano_skull_ram", "v_volcano_ribs", "v_volcano_skull"];
export const SMALL_ROCKS = ["v_volcano_rock_a", "v_volcano_rock_b", "v_volcano_rock_c"];

// ---------- камни и лава (мешают ходить) ----------
export const BOULDERS = ["v_volcano_boulder", "v_volcano_rock_pile", "v_volcano_boulder"];
export const LAVA_MOUNDS = ["v_volcano_lava_mound_a", "v_volcano_lava_mound_b", "v_volcano_lava_mound_s"];
export const LAVA_BIG = ["v_volcano_lava_mound_big", "v_volcano_lava_mound_ring"];

// ---------- кладбище ----------
/** Надгробия, кресты, плиты и стелы: стоят 1×1. */
export const MARKERS = [
  "v_graveyard_cross_a", "v_graveyard_stone_b", "v_graveyard_slab_a", "v_graveyard_stone_a", "v_graveyard_cross_c", "v_graveyard_slab_b",
  "v_graveyard_stone_c", "v_graveyard_cross_e", "v_graveyard_stele_a", "v_graveyard_slab_c", "v_graveyard_stone_d", "v_graveyard_cross_b",
  "v_graveyard_stele_b", "v_graveyard_slab_d", "v_graveyard_stone_e", "v_graveyard_cross_d",
];
/** Могилы и ямы лежат на земле (под юнитами). */
export const GRAVES = ["v_graveyard_grave_mound", "v_graveyard_grave_mound_h", "v_graveyard_grave_pit"];
export const STATUES = ["v_graveyard_statue_a", "v_graveyard_statue_b"];
export const COFFINS = ["v_graveyard_coffin_open", "v_graveyard_coffin_closed", "v_graveyard_coffin_closed_v"];
export const GRAVE_LAMPS = ["v_graveyard_lamp_a", "v_graveyard_lamp_b", "v_graveyard_lamp_c"];

/** Вид из набора по числу 0…1 (хеш клетки). */
export const pick = <T>(list: readonly T[], h: number): T => list[Math.min(list.length - 1, Math.floor(h * list.length))];

/**
 * Что непроходимо: клетки привязки (левая нижняя) вправо и вверх, как OBJECT_FOOTPRINT в map.ts.
 * Деревья занимают только ствол, крона закрывает героя за ним по глубине (depth = y). Мелочь (кусты, пни, черепа, фонарики) не мешает.
 */
export const VENDOR_FOOTPRINT: Record<string, { w: number; h: number }> = {
  // деревья: ствол
  v_basic_oak: { w: 1, h: 1 }, v_basic_oak_small: { w: 1, h: 1 }, v_basic_oak_big: { w: 1, h: 1 }, v_basic_pine: { w: 1, h: 1 },
  v_volcano_dead_tree: { w: 1, h: 1 }, v_volcano_dead_tree_tall: { w: 1, h: 1 },
  v_graveyard_dead_tree_a: { w: 1, h: 1 }, v_graveyard_dead_tree_b: { w: 1, h: 1 }, v_graveyard_dead_tree_vines: { w: 1, h: 1 },
  // дерево: брёвна, палисад, заборы
  v_basic_log_pile: { w: 2, h: 1 }, v_basic_palisade_5: { w: 2, h: 1 }, v_basic_palisade_2: { w: 1, h: 1 }, v_basic_palisade_1: { w: 1, h: 1 },
  v_basic_fence_row: { w: 3, h: 1 }, v_basic_fence_row_b: { w: 3, h: 1 }, v_basic_fence_post: { w: 1, h: 1 }, v_basic_fence_post_b: { w: 1, h: 1 },
  // обрывы и пещеры (после уменьшения 74×74 и 53×53)
  v_basic_cliff_h: { w: 2, h: 2 }, v_basic_cliff_end: { w: 1, h: 2 }, v_basic_cave_a: { w: 2, h: 2 }, v_basic_cave_b: { w: 2, h: 2 },
  // камни и лава
  v_volcano_boulder: { w: 1, h: 1 }, v_volcano_rock_pile: { w: 1, h: 1 },
  v_volcano_lava_mound_a: { w: 2, h: 1 }, v_volcano_lava_mound_b: { w: 2, h: 1 }, v_volcano_lava_mound_s: { w: 2, h: 1 },
  v_volcano_lava_mound_big: { w: 3, h: 1 }, v_volcano_lava_mound_ring: { w: 2, h: 1 }, v_volcano_signboard: { w: 1, h: 1 },
  // кладбище: ограды, столбы, надгробия, статуи, лампы, гробы
  v_graveyard_pillar: { w: 1, h: 1 }, v_graveyard_pillar_chain: { w: 1, h: 1 }, v_graveyard_pillar_broken: { w: 1, h: 1 }, v_graveyard_pillar_fence: { w: 1, h: 1 },
  v_graveyard_pillar_low: { w: 1, h: 1 }, v_graveyard_pillar_low_fence: { w: 1, h: 1 },
  v_graveyard_fence_long: { w: 6, h: 1 }, v_graveyard_fence_base: { w: 5, h: 1 }, v_graveyard_fence_base_end: { w: 2, h: 1 }, v_graveyard_fence_pole_v: { w: 1, h: 4 },
  v_graveyard_cross_a: { w: 1, h: 1 }, v_graveyard_cross_b: { w: 1, h: 1 }, v_graveyard_cross_c: { w: 1, h: 1 }, v_graveyard_cross_d: { w: 1, h: 1 }, v_graveyard_cross_e: { w: 1, h: 1 },
  v_graveyard_stone_a: { w: 1, h: 1 }, v_graveyard_stone_b: { w: 1, h: 1 }, v_graveyard_stone_c: { w: 1, h: 1 }, v_graveyard_stone_d: { w: 1, h: 1 }, v_graveyard_stone_e: { w: 1, h: 1 },
  v_graveyard_slab_a: { w: 1, h: 1 }, v_graveyard_slab_b: { w: 1, h: 1 }, v_graveyard_slab_c: { w: 1, h: 1 }, v_graveyard_slab_d: { w: 1, h: 1 }, v_graveyard_slab_e: { w: 1, h: 1 },
  v_graveyard_stele_a: { w: 1, h: 1 }, v_graveyard_stele_b: { w: 1, h: 1 }, v_graveyard_stele_c: { w: 1, h: 1 }, v_graveyard_stele_d: { w: 1, h: 1 },
  v_graveyard_sword_grave: { w: 1, h: 1 }, v_graveyard_statue_a: { w: 1, h: 1 }, v_graveyard_statue_b: { w: 1, h: 1 },
  v_graveyard_lamp_a: { w: 1, h: 1 }, v_graveyard_lamp_b: { w: 1, h: 1 }, v_graveyard_lamp_c: { w: 1, h: 1 },
  v_graveyard_coffin_open: { w: 2, h: 1 }, v_graveyard_coffin_closed: { w: 2, h: 1 }, v_graveyard_coffin_open_v: { w: 1, h: 1 }, v_graveyard_coffin_closed_v: { w: 1, h: 1 },
};

/** Лежат на земле, под юнитами (как мосты): лестницы, лазы, могилы и ямы, плоская мелочь — черепа, рёбра, камешки, бревно и малый пень. */
export const VENDOR_GROUND = [
  "v_basic_stairs", "v_basic_ladder_earth", "v_basic_ladder_grass", "v_basic_ladder_soil",
  "v_graveyard_grave_mound", "v_graveyard_grave_mound_h", "v_graveyard_grave_pit",
  "v_volcano_skull", "v_volcano_skull_ram", "v_volcano_ribs", "v_volcano_rock_a", "v_volcano_rock_b", "v_volcano_rock_c", "v_volcano_dead_stump",
  "v_basic_log", "v_basic_stump_small",
];

// ---------- Поля вечных битв, форты и поселения (задача 132, шаг 10; ассеты шага 9 — tools/gen/bf-gen*.ts, battlefield.ts, vendor.ts) ----------
/** Виды с дефисом — анимированные листы vfx/manifest.json (огонь, горны, манекены, осадные машины, повреждённые штандарты std-*: tools/gen/standards-to-game.ts). */
/** Повреждённые штандарты, что стоят: порванный в стрелах и обгоревший, у каждой фракции свой. */
export const BF_STANDARDS = ["std-torn-sol", "std-burned-sol", "std-torn-umb", "std-burned-umb"];
/** Сломанный в грязи с павшим (лежит). */
export const BF_STANDARDS_FALLEN = ["std-fallen-sol", "std-fallen-umb"];
export const BF_BODIES = ["bf_fallen_sol_a", "bf_fallen_umb_a", "bf_fallen_sol_b", "bf_fallen_umb_b", "bf_skeleton_armor"];
export const BF_HORSES = ["bf_horse_fallen_sol", "bf_horse_fallen_umb"];
export const BF_PLANTED = ["bf_sword_planted", "bf_arrows_planted", "bf_sword_planted_dark", "bf_arrows_planted"];
export const BF_STAINS = ["bf_blood_a", "bf_blood_b", "bf_scorch", "bf_blood_a"];
export const BF_BONES = ["v_undead_bones_a", "v_undead_bones_b", "v_undead_bones_c", "v_undead_ribs", "v_undead_jaw", "v_undead_skull_trio", "v_undead_bird_skull"];
export const BF_WAGONS = ["bf_wagon_broken_a", "bf_wagon_broken_b"];
export const BF_TENTS_RUINED = ["bf_tent_torn", "bf_tent_burnt"];
export const BF_WRECKS = ["bf_ram", "v_undead_giant_skeleton", "bf_siege_tower"];
/** Пары фракций для зеркальной копии на Полях (восток — та же сцена с переменой сторон, чтобы обе половины были равны). */
const BF_SWAP: Record<string, string> = {
  "std-torn-sol": "std-torn-umb", "std-burned-sol": "std-burned-umb", "std-fallen-sol": "std-fallen-umb",
  bf_fallen_sol_a: "bf_fallen_umb_a", bf_fallen_sol_b: "bf_fallen_umb_b", bf_horse_fallen_sol: "bf_horse_fallen_umb", bf_sword_planted: "bf_sword_planted_dark",
};
for (const [a, b] of Object.entries(BF_SWAP)) BF_SWAP[b] = a;
export const bfSwap = (kind: string) => BF_SWAP[kind] ?? kind;
/** След непроходимых объектов шага 10 (как VENDOR_FOOTPRINT). */
export const BF_FOOTPRINT: Record<string, { w: number; h: number }> = {
  bf_tent_sol: { w: 3, h: 2 }, bf_tent_umb: { w: 3, h: 2 }, bf_tent_torn: { w: 3, h: 2 }, bf_tent_burnt: { w: 3, h: 2 },
  bf_tent_sol_cmd: { w: 4, h: 2 }, bf_tent_umb_cmd: { w: 4, h: 2 },
  bf_map_table: { w: 2, h: 1 }, bf_shield_stand: { w: 2, h: 1 }, bf_spike_barrier: { w: 2, h: 1 },
  bf_wagon_broken_a: { w: 3, h: 1 }, bf_wagon_broken_b: { w: 3, h: 1 }, bf_ram: { w: 4, h: 1 }, bf_siege_tower: { w: 3, h: 2 }, v_undead_giant_skeleton: { w: 3, h: 1 },
  bf_wall_tower_sol: { w: 2, h: 2 }, bf_wall_tower_umb: { w: 2, h: 2 },
  v_smith_anvil_a: { w: 2, h: 1 }, v_smith_anvil_b: { w: 1, h: 1 }, v_smith_tub_a: { w: 1, h: 1 }, v_smith_tub_b: { w: 1, h: 1 }, v_deco_spear_rack: { w: 2, h: 1 }, v_deco_target: { w: 2, h: 1 },
  "bf-forge-small": { w: 2, h: 1 }, "bf-forge-cone": { w: 3, h: 2 }, "bf-dummy-0": { w: 1, h: 1 }, "bf-dummy-1": { w: 1, h: 1 }, "bf-dummy-2": { w: 1, h: 1 },
  "bf-catapult-s": { w: 2, h: 1 }, "bf-catapult-n": { w: 2, h: 1 }, "bf-ballista-s": { w: 3, h: 1 }, "bf-ballista-n": { w: 3, h: 1 }, "bf-trebuchet": { w: 4, h: 2 },
  "std-torn-sol": { w: 1, h: 1 }, "std-torn-umb": { w: 1, h: 1 }, "std-burned-sol": { w: 1, h: 1 }, "std-burned-umb": { w: 1, h: 1 },
};
/** Лежат на земле, под юнитами: тела, павшие лошади, кровь и гарь, кости, сломанный штандарт. */
export const BF_GROUND = [...BF_BODIES, ...BF_HORSES, ...BF_STAINS, ...BF_BONES, ...BF_STANDARDS_FALLEN];
