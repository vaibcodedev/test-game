/**
 * Варианты формы объёмного природного декора (камни, льдины и снега — tools/gen/nature3d.ts; растения, кости, руда, уступы — nature3d-flora.ts): у вида kind есть кадры kind (вариант 0) и kind__1…kind__{n-1}.
 * Вариант выбирается хешем клетки в конце генерации карты (shared/cityart.ts assignArtVariants), соседние камни — разной формы.
 * Клиент берёт кадр `${kind}__${v}`, если он есть (client/src/game/terrain.ts makeImage). След на карте (OBJECT_FOOTPRINT) не меняется.
 */
export const NATURE_VARIANTS: Record<string, number> = {
  rock: 4, big_rock: 3, rock_moss: 4, sandstone: 4, basalt: 4, snow_rock: 4, ice_spike: 4, snow_bush: 4, snowdrift: 4,
  v_volcano_rock_a: 2, v_volcano_rock_b: 2, v_volcano_rock_c: 2, v_volcano_boulder: 2, v_volcano_rock_pile: 1,
  // растения, кости, руда, уступы (tools/gen/nature3d-flora.ts FLORA_GAME); у деревьев ещё кадр ствола <id>_trunk (полупрозрачная крона)
  snow_pine: 4, v_basic_pine: 4, v_basic_oak_small: 3, v_basic_oak: 3, v_basic_oak_big: 2,
  v_volcano_dead_tree: 2, v_volcano_dead_tree_tall: 2, v_graveyard_dead_tree_vines: 3, v_graveyard_dead_tree_a: 2, v_graveyard_dead_tree_b: 2,
  palm: 3, cactus: 4, cactus_small: 4, dry_bush: 4, v_volcano_dead_bush_a: 2, v_volcano_dead_bush_b: 2,
  bush: 4, v_basic_bush: 4, v_basic_shrub: 2, v_basic_bush_red: 3, v_basic_bush_pink: 3, v_basic_bush_yellow: 3, v_basic_bush_blue: 3,
  v_basic_stump: 3, v_basic_stump_small: 1, v_basic_log: 4, mushrooms: 4, mushrooms_glow: 4, reeds: 4,
  v_volcano_skull: 2, v_volcano_skull_ram: 2, v_volcano_ribs: 3, crystal: 3, node_ice: 3, node_obsidian: 3,
  ledge_grass: 2, ledge_snow: 2, ledge_sand: 2, ledge_ash: 2,
};

/** Вариант для клетки (cx, cy): 0 — базовый кадр; хеш клетки со сдвигом по столбцу, чтобы соседние камни обычно были разной формы. */
export function natureVariant(kind: string, cx: number, cy: number): number {
  const n = NATURE_VARIANTS[kind] ?? 1;
  if (n <= 1) return 0;
  let h = Math.imul(cx | 0, 374761393) ^ Math.imul(cy | 0, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) % n;
  return (r + cx * 2 + cy) % n;
}
