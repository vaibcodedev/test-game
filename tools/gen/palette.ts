/** Единая палитра игры: тёплые землистые тона, холодная вода, яркие акценты магии; рампы отдельных генераторов и контуры. */
import { OUTLINE, hex, ramp, withA, type RGBA } from "./canvas";

/** Контуры. OUTLINE — основной тёмный контур спрайтов и иконок (по умолчанию у PC.outline, задан в canvas.ts). */
export { OUTLINE };
/** Полупрозрачный контур мягких силуэтов: тени, кусты, лужи. */
export const OUTLINE_SOFT: RGBA = withA(OUTLINE, 140);
/** Холодный полупрозрачный контур подводных объектов (кораллы, раковины). */
export const OUTLINE_WATER: RGBA = withA(hex("#102030"), 160);
/** Контур анимаций умений и аур (tools/gen/aura-*.ts, INK). */
export const OUTLINE_FX: RGBA = hex("#120a18");

export const P = {
  skin: ramp("#6e3f35", "#a8644e", "#d9956f", "#f2c49b"),
  skinPale: ramp("#5c4a52", "#8c7a80", "#b8a8a8", "#dcd0c8"),
  goblin: ramp("#2c4a22", "#467a30", "#6aa83e", "#9ad05a"),
  imp: ramp("#5a1418", "#9a2a22", "#d0482e", "#f08a4a"),
  bone: ramp("#6a6258", "#9e968a", "#cfc8b8", "#f1ecdf"),
  drowned: ramp("#2a423e", "#3e625a", "#5e8a7a", "#8ab4a0"),

  steel: ramp("#3a3f4c", "#5e6678", "#8f99ad", "#c8d0de", "#f2f6ff"),
  darkSteel: ramp("#1e1e2a", "#33334a", "#4d4c68", "#6e6c8c", "#9a98b8"),
  gold: ramp("#6a4210", "#a8681c", "#e0a630", "#ffd864", "#fff2b0"),
  wood: ramp("#3a2216", "#5e3a22", "#8a5a34", "#b07e4c"),
  leather: ramp("#3e2618", "#6a4228", "#94613a", "#bb8a58"),
  cloth: {
    red: ramp("#4a1420", "#7e2230", "#b03a3e", "#d86a5a"),
    purple: ramp("#2a1640", "#46265e", "#6a3c8a", "#9a62b8"),
    green: ramp("#1c3420", "#2e5232", "#467a42", "#6aa058"),
    blue: ramp("#16243e", "#243e66", "#3a5e94", "#5e8cc0"),
    brown: ramp("#2e2016", "#4a3424", "#6a4c34", "#8c6a4a"),
    black: ramp("#141218", "#24202c", "#383244", "#4e4660"),
    rag: ramp("#3a3428", "#5a5040", "#7c705a", "#a09478"),
    white: ramp("#7a7480", "#aaa4ae", "#d6d0d8", "#f6f2f8"),
  },
  hair: {
    brown: ramp("#2a1a12", "#4a2e1c", "#6e4428", "#94623a"),
    blond: ramp("#6a4a1a", "#a07a2a", "#d6b04a", "#f2d884"),
    black: ramp("#121018", "#22202c", "#363244", "#4c4660"),
    white: ramp("#7a7480", "#aaa4ae", "#d6d0d8", "#f6f2f8"),
    seaweed: ramp("#1a3020", "#2c4a2c", "#40683a", "#5c8a4a"),
  },
  magic: {
    blue: ramp("#1a3a8a", "#2e6ad0", "#5aa8ff", "#a8dcff", "#ffffff"),
    purple: ramp("#3a1468", "#6a2ab0", "#a05aff", "#d0a8ff", "#ffffff"),
    green: ramp("#1e5a1a", "#3a9a2a", "#7ad04a", "#c0f080", "#ffffff"),
    fire: ramp("#7a1c10", "#c23a12", "#f06a1a", "#ffb03a", "#ffe88a"),
  },

  grass: ramp("#2c5530", "#3b6e36", "#4f873c", "#6aa245", "#8fc055"),
  forest: ramp("#1b3326", "#244230", "#2f5336", "#3d663c", "#517a44"),
  dirt: ramp("#4e3426", "#6a4630", "#86593a", "#a2724a", "#bc8e60"),
  sand: ramp("#9a7c52", "#b8966a", "#d0b07e", "#e2c896", "#f0dcb0"),
  bog: ramp("#22261c", "#2e3424", "#3c432c", "#4c5434", "#5e6840"),
  ash: ramp("#272326", "#363034", "#463e40", "#58504e", "#6c6460"),
  lava: ramp("#5a140c", "#a02a10", "#e05412", "#ff9a2a", "#ffe07a"),
  cobble: ramp("#3c3842", "#58525e", "#746e7a", "#928c96", "#b0aab2"),
  floor: ramp("#221e28", "#2e2936", "#3a3444", "#484152", "#585064"),
  snow: ramp("#7f93b0", "#a6b9d2", "#cfdcee", "#e8f0fa", "#ffffff"),
  ice: ramp("#2a5a86", "#4a86b4", "#7ab8dc", "#b0e0f4", "#e6faff"),
  obsidian: ramp("#0e0c16", "#1a1626", "#2a2440", "#40385c", "#6a5e96"),
  dune: ramp("#a8793c", "#c8964e", "#e0b468", "#f0cc84", "#fae0a4"),
  seabed: ramp("#123a4e", "#1a5468", "#27738a", "#3a93a6", "#62b8c0"),
  coral: { pink: ramp("#5a1a3a", "#982a58", "#d24a7c", "#f58aa6"), orange: ramp("#6a2a10", "#b0481c", "#e87a30", "#ffb060"), purple: ramp("#2e1a5a", "#52309a", "#8456d0", "#b890f4") },
  water: ramp("#163060", "#1e4480", "#285a9e", "#3a78bc", "#7ab8e6"),
  wallTop: ramp("#141118", "#1c1822", "#24202c", "#2e2838"),
  wallFace: ramp("#2a2532", "#3a3444", "#4c4558", "#5e566c", "#726a80"),
  moss: ramp("#1e3a22", "#2e5430", "#46723e"),

  leaf: ramp("#1c3a1e", "#2a5426", "#3c7230", "#56903c", "#7cb04e"),
  leafAutumn: ramp("#4a2a10", "#7a4418", "#a86a22", "#d09a34"),
  pine: ramp("#12281e", "#1a3a28", "#245032", "#30663c", "#44804a"),
  bark: ramp("#2a1a14", "#3e281c", "#56382a", "#6e4c38"),
  deadwood: ramp("#2a2422", "#3e3632", "#565048", "#726a60"),
  stone: ramp("#2e2c34", "#46444e", "#625e6a", "#827c88", "#a4a0aa"),
  roofRed: ramp("#4a1a18", "#76281e", "#a43c28", "#c85a3a", "#e08452"),
  roofBlue: ramp("#1a2240", "#26345e", "#34487e", "#4a64a0", "#6a88c0"),
  plaster: ramp("#8a7a66", "#b09e86", "#d0c0a4", "#e8dcc2"),
  timber: ramp("#2e1c14", "#45291c", "#5e3a26"),
  glass: ramp("#2a3a5a", "#ffd27a", "#fff0b8"),
  crystal: ramp("#2a1a5a", "#4a34a8", "#7a6ae0", "#b0a8ff", "#ffffff"),
};

/** Биомы (tools/gen/biomes.ts): кактус, скалы пустыни и снегов, базальт. */
export const BIOME = {
  cactusG: ramp("#16402a", "#24603a", "#3c8a44", "#6cb45a", "#a0d878"),
  sandRock: ramp("#6a4a2a", "#8c6636", "#b08848", "#d0a866", "#e8c88a"),
  snowRock: ramp("#4a5870", "#6c7e98", "#9aaec8", "#c4d6ea", "#f2f8ff"),
  basaltR: ramp("#14121c", "#241f30", "#382f4a", "#4e4468", "#6a5e88"),
};

/** Малые города (tools/gen/cities.ts): песчаник оазиса, бирюза, снег, срубы. */
export const CITY = {
  SAND: ramp("#5e3e22", "#8c6638", "#b88c50", "#d8b074", "#f0d498"),
  TEAL: ramp("#0e3a3c", "#1a5c5a", "#2a8a80", "#58b8a8"),
  SNOWC: ramp("#8aa0c0", "#b4c8e0", "#dce8f6", "#f4f9ff"),
  LOG: ramp("#2e1c10", "#4c2e18", "#6e4624", "#946034", "#b27c46"),
};

/** Столицы фракций (tools/gen/factions.ts): белый камень Аурелиона, небо витражей, тёмный камень Мортхейма. */
export const FACTION = {
  WHITE: ramp("#6e6a64", "#a8a296", "#d2ccbe", "#ece6d8", "#fffaee"),
  SKY: ramp("#1c3a6a", "#2c5c9a", "#4a8ad0", "#7ec8ff"),
  DARK: ramp("#100c16", "#1e1828", "#2e2640", "#40365a", "#564a74"),
};

/** Эмберхолл (tools/gen/town.ts): городской камень, сланцевая и бурая кровля, мрамор. */
export const TOWN = {
  ST: ramp("#2e2a30", "#4a4446", "#6a625e", "#8a8178", "#aca294", "#cbc2b2"),
  ROOF_SLATE: ramp("#1e2230", "#2c3246", "#3c4560", "#52607e", "#6c7c9c"),
  ROOF_BROWN: ramp("#3a1e14", "#5a2e1e", "#7c4228", "#9c5a36", "#bc7a4c"),
  MARBLE: ramp("#6a6670", "#8e8a94", "#b4b0b8", "#d4d0d6", "#eeeaf0"),
};

/** Маунты (tools/gen/mounts-*.ts): шкуры, гривы, перья, кости, пламя. */
export const MOUNT = {
  IVORY: ramp("#3a3022", "#7a6a4c", "#b8a478", "#e2d2a4", "#fff4d0"),
  NOSE: ramp("#050304", "#120a0c", "#2a1a1c", "#4a3234"),
  WHITE: ramp("#7a7e92", "#a8acc0", "#d2d6e4", "#eceef8", "#ffffff"),
  TAWNY: ramp("#4a2e14", "#7a4e22", "#a8762e", "#cf9e48", "#ecc87a"),
  LMANE: ramp("#240e06", "#44200c", "#6c3a14", "#945a22", "#bc8238"),
  ASH: ramp("#1e2026", "#3a3d48", "#5e6370", "#8a909c", "#b8bdc8"),
  ASHB: ramp("#4a4e58", "#767b88", "#9ea4b0", "#c6cad2"),
  EMBER: ramp("#4a1a0c", "#8a3412", "#c85a1a", "#f08a30", "#ffd070"),
  SPIRIT: ramp("#1a2a5a", "#3250a0", "#5c88d8", "#9cc4f8", "#e4f4ff"),
  BOARC: ramp("#1c1410", "#2e221a", "#463428", "#64503c", "#86705a"),
  BEARC: ramp("#1e120c", "#34201a", "#503428", "#74503a", "#9a7452"),
  SAND: ramp("#4a3418", "#7a5a2a", "#a8803c", "#cfa656", "#ecd088"),
  SPIKE: ramp("#5a2a14", "#8a4420", "#b86a30", "#e09a4c"),
  BONE: ramp("#3a342c", "#6a6254", "#a39a86", "#d4cdb8", "#f4efde"),
  GBODY: ramp("#4a2e14", "#7a4e22", "#a8762e", "#cf9e48", "#ecc87a"),
  GWING: ramp("#2e1c0e", "#58381a", "#8a5e2e", "#b88a4a", "#e4c88a"),
  GWING2: ramp("#5a4630", "#8a7250", "#bca480", "#e2d2b0", "#fffaf0"),
  GHEAD: ramp("#7a7080", "#aca4b4", "#d8d2e0", "#f0ecf6", "#ffffff"),
  BEAK: ramp("#5a3a0a", "#a86c10", "#e0a420", "#ffd448", "#fff2a0"),
  PHX: ramp("#6a1408", "#b83210", "#f0661c", "#ffa83a", "#ffe890"),
  PHX2: ramp("#8a2010", "#d44a14", "#ff8a24", "#ffcc52", "#fff4b0"),
  RAPT: ramp("#0e3a38", "#1a6a60", "#2e9a84", "#5ccaa0", "#a8f0c8"),
  RSTR: ramp("#5a2208", "#a8480e", "#e0781c", "#ffb04a"),
  SPD: ramp("#0a0610", "#1a1024", "#2c1c3c", "#46305c", "#6a4c84"),
  SPR: ramp("#3a0608", "#780c10", "#c01c1c", "#ff5040"),
  NAVY: ramp("#0e1a36", "#1a2e5e", "#2c4a8e", "#4468b8", "#6a8ad4"),
  WHITEC: ramp("#6c6e7c", "#a4a8b8", "#d0d4e0", "#eceef6", "#ffffff"),
  CHEST: ramp("#2e1a10", "#4c2c1a", "#6e4228", "#94603a", "#b8845a"),
  GHOST: ramp("#0c2c38", "#176070", "#2ea0a8", "#6ce0d0", "#c8fff0"),
  GHOST_P: ramp("#1c0c38", "#3a1c70", "#6a38b0", "#a470e8", "#e0c8ff"),
  NIGHT: ramp("#0e0814", "#221830", "#3c2e50", "#5a4a72", "#7a6a96"),
  NIGHT_HEAD: ramp("#05030a", "#0e0814", "#1c1228", "#34264a", "#52406c"),
  HELLFIRE: ramp("#5a0c08", "#a81c0c", "#e8541a", "#ffa030", "#ffee90"),
  BROWN: ramp("#24140c", "#3e2415", "#60391f", "#855230", "#a86f44"),
  DARKMANE: ramp("#0e0a08", "#1c1410", "#2c201a", "#44342a"),
};

/** Иконки экипировки (tools/gen/equip.ts): костяной череп навершия и шлема Умбрата. */
export const EQUIP = {
  skull: ramp("#6a6050", "#a89c80", "#d8d0b8", "#e8e0d0", "#ffffff"),
};
