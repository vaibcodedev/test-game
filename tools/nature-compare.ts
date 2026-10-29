/** Монтаж «сейчас | новое» для объёмной растительности и мелочи природы (tools/gen/nature3d-flora.ts) → tools/out/rocks/nature-compare.png. Запуск: npx tsx tools/rocks-compare.ts nature (под scenario.lock). */
import path from "node:path";
import fs from "node:fs";
import { montage, type Group, type Biome } from "./rocks-compare";
import { FLORA3D, FLORA_GLOW } from "./gen/nature3d-flora";
import { ROCKS3D, ICE_GLOW } from "./gen/nature3d";
import { readPng, trim, writePng, ROOT } from "./gen/vendor-lib";

export function nature() {
  // пакам обрезаем прозрачные поля: монтажу нужен только силуэт
  const tmp = path.join(ROOT, "tools/out/rocks/old");
  fs.mkdirSync(tmp, { recursive: true });
  const T = (id: string) => {
    const f = path.join(ROOT, "client/public/assets/objects", `${id}.png`);
    if (!fs.existsSync(f)) return id;
    writePng(trim(readPng(f)).pc, path.join(tmp, `${id}.png`));
    return path.join(tmp, id);
  };
  const N = (id: string) => FLORA3D[id]();
  const G = (label: string, ground: string, old: string[], id: string, glow?: Group["glow"]): Group => ({ label, ground, old: old.map(T), neu: N(id), glow });
  const groups: Record<string, Group> = {
    snow_pine: G("SNOW PINE", "snow", ["snow_pine"], "snow_pine"),
    pine: G("PINE", "grass", ["v_basic_pine"], "v_basic_pine"),
    oak: G("OAK", "grass", ["v_basic_oak_small", "v_basic_oak", "v_basic_oak_big"], "v_basic_oak"),
    bush: G("BUSH", "grass", ["bush", "v_basic_bush", "v_basic_shrub"], "bush"),
    bush_red: G("BUSH RED", "grass", ["v_basic_bush_red"], "v_basic_bush_red"),
    bush_pink: G("BUSH PINK", "grass", ["v_basic_bush_pink"], "v_basic_bush_pink"),
    bush_yellow: G("BUSH YELLOW", "grass", ["v_basic_bush_yellow"], "v_basic_bush_yellow"),
    bush_blue: G("BUSH BLUE", "grass", ["v_basic_bush_blue"], "v_basic_bush_blue"),
    ledge_grass: G("LEDGE GRASS", "grass", [], "ledge_grass"),
    ledge_snow: G("LEDGE SNOW", "snow", [], "ledge_snow"),
    ledge_sand: G("LEDGE SAND", "sand", [], "ledge_sand"),
    ledge_ash: G("LEDGE ASH", "ash", [], "ledge_ash"),
    stump: G("STUMP", "grass", ["v_basic_stump", "v_basic_stump_small"], "v_basic_stump"),
    log: G("LOG", "grass", ["v_basic_log", "v_basic_log_stand"], "v_basic_log"),
    mush: G("MUSHROOMS", "forest", ["mushrooms"], "mushrooms"),
    cactus: G("CACTUS", "sand", ["cactus"], "cactus"),
    cactus_s: G("CACTUS SMALL", "sand", ["cactus_small"], "cactus_small"),
    palm: G("PALM", "sand", ["palm"], "palm"),
    dry: G("DRY BUSH", "sand", ["dry_bush"], "dry_bush"),
    dead_ash: G("DEAD TREE ASH", "ash", ["v_volcano_dead_tree", "v_volcano_dead_tree_tall"], "v_volcano_dead_tree"),
    dead_bush_ash: G("DEAD BUSH ASH", "ash", ["v_volcano_dead_bush_a", "v_volcano_dead_bush_b"], "v_volcano_dead_bush_a"),
    skull: G("SKULLS", "ash", ["v_volcano_skull", "v_volcano_skull_ram"], "v_volcano_skull"),
    ribs: G("RIBS", "ash", ["v_volcano_ribs"], "v_volcano_ribs"),
    obs: G("OBSIDIAN ORE", "ash", ["node_obsidian", "obsidian_spire"], "node_obsidian"),
    bog_tree: G("BOG TREE", "bog", ["v_graveyard_dead_tree_vines", "v_graveyard_dead_tree_a"], "v_graveyard_dead_tree_vines"),
    reeds: G("REEDS", "bog", ["reeds"], "reeds"),
    mush_glow: G("MUSHROOMS GLOW", "bog", ["mushrooms_glow"], "mushrooms_glow", FLORA_GLOW.mushrooms_glow),
    crystal: G("CRYSTAL", "forest", ["crystal"], "crystal", FLORA_GLOW.crystal),
    node_ice: G("ICE ORE", "snow", ["node_ice"], "node_ice", FLORA_GLOW.node_ice),
    // камни для сцен (уже показаны в compare.png)
    snow_rock: { label: "", ground: "snow", old: ["snow_rock"], neu: ROCKS3D.snow_rock() },
    ice_spike: { label: "", ground: "snow", old: ["ice_spike"], neu: ROCKS3D.ice_spike(), glow: ICE_GLOW },
    snow_bush: { label: "", ground: "snow", old: ["snow_bush"], neu: ROCKS3D.snow_bush() },
    rock: { label: "", ground: "grass", old: ["rock"], neu: ROCKS3D.rock() },
    sandstone: { label: "", ground: "sand", old: ["sandstone"], neu: ROCKS3D.sandstone() },
    basalt: { label: "", ground: "ash", old: ["basalt"], neu: ROCKS3D.basalt() },
  };
  const biomes: Biome[] = [
    { label: "WINTER", ground: "snow", items: [["ledge_snow", 1], ["snow_pine", 4], ["snow_rock", 1], ["ice_spike", 1], ["snow_bush", 2], ["node_ice", 1]] },
    { label: "FOREST MEADOW", ground: "grass", items: [["pine", 2], ["oak", 2], ["bush", 2], ["bush_red", 1], ["bush_yellow", 1], ["ledge_grass", 1], ["stump", 1], ["log", 1], ["mush", 1], ["rock", 1]] },
    { label: "DESERT", ground: "sand", items: [["cactus", 3], ["cactus_s", 2], ["palm", 1], ["dry", 2], ["sandstone", 1], ["skull", 1]] },
    { label: "ASH", ground: "ash", items: [["ledge_ash", 1], ["dead_ash", 3], ["dead_bush_ash", 2], ["skull", 2], ["ribs", 1], ["obs", 1], ["basalt", 1]] },
    { label: "SWAMP", ground: "bog", items: [["bog_tree", 3], ["reeds", 4], ["mush_glow", 2], ["stump", 1]] },
  ];
  const show = Object.fromEntries(Object.entries(groups).filter(([, g]) => g.label));
  montage(groups, biomes, path.join(ROOT, "tools/out/rocks/nature-compare.png"), "NATURE: NOW | NEW", show, 1820, [220, 150]);
}
