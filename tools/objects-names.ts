/**
 * Названия и категории объектов для каталога (tools/objects-catalog.ts).
 * Новый объект: если id не подходит ни под одно правило, objName вернёт «?» и тест tests/unit/objects-catalog.ts упадёт — допиши запись в NAMES или словарь WORDS.
 */
export const CATEGORIES = ["здание", "стена и ограда", "мост", "природа", "декор", "свет и огонь", "интерактив", "добыча", "война и осада", "подземелье", "рейд"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Явные названия базовых id (без разбора по частям). */
const NAMES: Record<string, string> = {
  altar_sun: "Алтарь Солнца", altar_umb: "Алтарь Умбрата", anvil: "Наковальня", arena_gate: "Ворота арены", bank: "Банк", barrel: "Бочка",
  basalt: "Базальт", big_rock: "Большой камень", bone_pile: "Груда костей", bone_rack: "Стойка с костями", bones: "Кости", brazier: "Жаровня",
  brazier_umb: "Жаровня Умбрата", bush: "Куст", cactus: "Кактус", cactus_small: "Малый кактус", campfire: "Костёр", candelabra: "Канделябр",
  cauldron: "Котёл", chaos_pillar: "Колонна Хаоса", crate: "Ящик", crystal: "Кристалл", dark_obelisk: "Тёмный обелиск", dry_bush: "Сухой куст",
  dummy: "Тренировочный манекен", ember_vent: "Тлеющая трещина", ember_std: "Знамя Эмберхолла", "ember-std": "Знамя Эмберхолла", fern: "Папоротник",
  flowers: "Цветы", forge: "Кузница", fountain: "Фонтан", gate_arch: "Арка ворот", hay: "Стог сена", house: "Дом", house_blue: "Дом с синей крышей",
  hut_sol: "Хижина Сольгарда", ice_spike: "Ледяной шип", lamp: "Фонарь", lectern: "Аналой", lilypad: "Кувшинки", mushrooms: "Грибы",
  mushrooms_glow: "Светящиеся грибы", node_cactus: "Жила: сочный кактус", node_ice: "Жила: ледяной кристалл", node_obsidian: "Жила: обсидиан",
  node_pearl: "Жила: жемчужница", obsidian_spire: "Обсидиановый шпиль", palm: "Пальма", pew: "Скамья", pillar: "Колонна", pillar_sol: "Колонна Сольгарда",
  pillar_umb: "Колонна Умбрата", raid_portal: "Врата рейда", reeds: "Камыш", rock: "Камень", rock_moss: "Замшелый камень", ruin_pillar: "Колонна руин",
  ruin_wall: "Стена руин", sandstone: "Песчаник", shell: "Раковина", signpost: "Указатель", skull_pile: "Груда черепов", snow_bush: "Заснеженный куст",
  snow_pine: "Заснеженная сосна", snow_rock: "Заснеженный камень", snowdrift: "Сугроб", sol_church: "Храм Солнца", sol_gate: "Ворота Сольгарда",
  sol_house: "Дом Сольгарда", sol_temple: "Храм Сольгарда", sol_tower: "Башня Сольгарда", sol_wall_h: "Стена Сольгарда (горизонтальная)",
  sol_wall_v: "Стена Сольгарда (вертикальная)", soul_brazier: "Жаровня душ", stall: "Прилавок", stall_blue: "Синий прилавок", stall_gold: "Золотой прилавок",
  stall_green: "Зелёный прилавок", stall_purple: "Пурпурный прилавок", sun_statue: "Статуя Солнца", tallgrass: "Высокая трава", tavern: "Таверна",
  teleport_stone: "Камень перемещения", tent: "Шатёр", torch: "Факел", tower: "Башня", umb_barrow: "Курган короля Морта", umb_crypt: "Склеп Умбрата",
  umb_gate: "Ворота Умбрата", umb_house: "Дом Умбрата", umb_statue: "Статуя короля Умбрата", umb_tower: "Башня Умбрата",
  umb_wall_h: "Стена Умбрата (горизонтальная)", umb_wall_v: "Стена Умбрата (вертикальная)", umb_ziggurat: "Зиккурат Умбрата", vase_sun: "Ваза Солнца",
  wall_h: "Стена (горизонтальная)", wall_v: "Стена (вертикальная)", weapon_rack: "Стойка с оружием", well: "Колодец",
  bridge_h: "Мост (горизонтальный)", bridge_v: "Мост (вертикальный)", bridge_h_mid: "Мост: середина (горизонтальный)", bridge_h_mid2: "Мост: середина 2 (горизонтальный)",
  bridge_h_end_w: "Мост: западный конец", bridge_h_end_e: "Мост: восточный конец", bridge_v_mid: "Мост: середина (вертикальный)", bridge_v_mid2: "Мост: середина 2 (вертикальный)",
  bridge_v_end_n: "Мост: северный конец", bridge_v_end_s: "Мост: южный конец",
  loot_r0: "Сундук добычи: обычный", loot_r0_boss: "Сундук добычи босса: обычный", loot_r1: "Сундук добычи: необычный", loot_r1_boss: "Сундук добычи босса: необычный",
  loot_r2: "Сундук добычи: редкий", loot_r2_boss: "Сундук добычи босса: редкий", loot_r3: "Сундук добычи: эпический", loot_r3_boss: "Сундук добычи босса: эпический",
  cit_brazier: "Жаровня Цитадели", cit_gate: "Врата Цитадели", cit_pillar: "Колонна Цитадели",
  "bf-ballista-s": "Баллиста", "bf-catapult-s": "Катапульта", "bf-trebuchet": "Требушет", "bf-fire-m": "Костёр поля боя (большой)", "bf-fire-s": "Костёр поля боя (малый)",
  "bf-forge-cone": "Горн кузни (конус)", "bf-forge-small": "Горн кузни (малый)", "bf-smoke": "Дым пожарища", "ward-sol": "Оберег Сольгарда", "ward-umb": "Оберег Умбрата",
  bf_ram: "Таран", bf_siege_tower: "Осадная башня", bf_skeleton_armor: "Скелет в доспехе", bf_palisade_gate: "Ворота частокола",
  bf_wall_tower_sol: "Башня стены Сольгарда", bf_wall_tower_umb: "Башня стены Умбрата", bf_hammer_a: "Воткнутый молот", bf_shield_stand: "Стойка щитов",
  bf_shield_stand_b: "Стойка щитов (вар. B)", bf_shield_stand_sol: "Стойка щитов Сольгарда", bf_shield_stand_umb: "Стойка щитов Умбрата",
  bf_map_table: "Стол с картой", bf_map_table_b: "Стол с картой (вар. B)", bf_map_table_c: "Стол с картой (вар. C)", bf_map_table_umb: "Стол с картой Умбрата",
  dg_pier_a2: "Подземелье: пилон прохода (склеп, 2)", dg_pier_c2: "Подземелье: пилон прохода (собор, 2)", dg_pier_t2: "Подземелье: пилон прохода (переход, 2)", ledge_ash: "Уступ: пепел", ledge_grass: "Уступ: трава", ledge_sand: "Уступ: песок", ledge_snow: "Уступ: снег", palm_trunk: "Ствол пальмы (прозрачность кроны)", snow_pine_trunk: "Ствол заснеженной сосны", dg_dais: "Помост ритуального круга", dg_entrance: "Лестница-вход в подземелье", dg_exit: "Выход из подземелья", dg_door_w: "Деревянная дверь подземелья (кадр 0)", dg_port: "Решётка-герса подземелья (кадр 0)",
  dg_altar_c: "Алтарь собора", dg_gate_a: "Ворота склепа", v_basic_sign_post: "Столб-указатель", v_basic_sign_arrow: "Стрелка-указатель", v_volcano_signboard: "Вывеска вулкана",
  v_volcano_sign_a: "Табличка вулкана (A)", v_volcano_sign_b: "Табличка вулкана (B)", v_basic_stairs: "Лестница", v_basic_cave_a: "Вход в пещеру (A)", v_basic_cave_b: "Вход в пещеру (B)",
};
/** std-* — штандарты и знамёна войны (tools/gen/standards.ts). */
const STD: Record<string, string> = { burned: "сожжённое", drape: "драпировка", fallen: "павшее", home: "домашнее", pennant: "вымпел", torn: "порванное" };

const WORDS: Record<string, string> = {
  a: "A", b: "B", c: "C", d: "D", e: "E", sol: "Сольгард", umb: "Умбрат", h: "горизонтальный", v: "вертикальный", n: "северный", s: "южный", w: "западный",
  base: "основание", end: "конец", long: "длинная", low: "низкая", row: "ряд", post: "столб", pole: "кол", mid: "середина", mid2: "середина 2", corner: "угол", gate: "ворота",
  arrows: "стрелы", axe: "топор", blood: "кровь", catapult: "катапульта", wreck: "обломки", crater: "воронка", debris: "обломки", fallen: "павший боец", hammer: "молот",
  horse: "конь", skel: "скелет", scorch: "гарь", shield: "щит", spear: "копьё", spike: "колья", barrier: "заграждение", sword: "меч", tent: "шатёр", wagon: "повозка", broken: "разбитая",
  planted: "воткнутое", dark: "тёмное", burnt: "сгоревший", torn: "порванный", cmd: "командирский", stand: "стойка", map: "карта", table: "стол", wall: "стена", tower: "башня",
  pillar: "колонна", statue: "статуя", sarc: "саркофаг", altar: "алтарь", brazier: "жаровня", candles: "свечи", rubble: "обломки", bones: "кости", puddle: "лужа", ashpile: "куча пепла",
  banner: "знамя", window: "окно", grate: "решётка", chains: "цепи", arch: "арка", pier: "пилон прохода", lintel: "перемычка", door: "дверь", port: "герса", dais: "помост",
  oak: "дуб", big: "большой", small: "малый", pine: "сосна", bush: "куст", red: "красный", pink: "розовый", yellow: "жёлтый", blue: "синий", white: "белый", shrub: "кустарник",
  stump: "пень", log: "бревно", pile: "куча", palisade: "частокол", fence: "забор", cave: "пещера", cliff: "обрыв", ladder: "лестница", earth: "земляная", grass: "травяная", soil: "грунтовая",
  coffin: "гроб", closed: "закрытый", open: "открытый", cross: "крест", dead: "мёртвое", tree: "дерево", tall: "высокое", vines: "с лозами", grave: "могила", mound: "холм", pit: "яма",
  lamp: "фонарь", lantern: "лампа", chain: "с цепью", broken2: "сломанная", slab: "плита", stele: "стела", stone: "надгробие", sword2: "меч", anvil: "наковальня", tub: "бадья",
  bench: "верстак", coal: "уголь", forge: "горн", cone: "конус", tool: "инструменты", rack: "стойка", bird: "птичий", skull: "череп", giant: "гигантский", skeleton: "скелет",
  jaw: "челюсть", ribs: "рёбра", trio: "три черепа", cluster: "груда черепов", ruin: "руины", boulder: "валун", rock: "камень", lava: "лава", ring: "кольцо", ram: "баран",
  gallows: "виселица", pillory: "позорный столб", stocks: "колодки", side: "боковой", covered: "крытая", wheels: "колёса", spear2: "копьё", target: "мишень", brick: "кирпичный",
  rope: "верёвочный", stairs: "лестница", fence2: "забор", block: "башенный блок", sign: "знак", arrow: "стрелка", trunk: "ствол", cover: "укрытие", ash: "пепел", frost: "лёд", sun: "солнце",
  fire: "огонь", smoke: "дым", fence_: "", sol2: "", leg: "", fortkit: "", t: "переход", ember: "Эмберхолл", cap: "навершие", temple: "храм", clean: "чистое", ivy: "плющ", moss: "мох",
};
const PREFIX: [RegExp, string][] = [
  [/^v_basic_/, ""], [/^v_graveyard_/, "Кладбище: "], [/^v_volcano_/, "Вулкан: "], [/^v_smith_/, "Кузня: "], [/^v_undead_/, "Нежить: "], [/^v_deco_/, "Деревня: "],
  [/^v_bridges_/, "Мост-пак: "], [/^v_fortkit_/, "Форт: "], [/^pal_/, "Частокол: "], [/^bf_/, "Поля: "], [/^dg_/, "Подземелье: "], [/^arena_cover_/, "Укрытие арены: "],
  [/^cit_/, "Цитадель: "], [/^std-/, "Знамя войны: "],
];
const DG_STYLE: Record<string, string> = { c: "собор", t: "переход", a: "склеп" };
const DG_TYPE = new Set(["pillar", "statue", "sarc", "altar", "rubble", "banner", "window", "arch", "pier", "lintel"]);

export function objName(id: string): string {
  if (NAMES[id]) return NAMES[id];
  if (id.startsWith("std-")) { const p = id.slice(4).split("-"); const t = STD[p[0]]; const f = p[1] === "sol" ? "Сольгарда" : p[1] === "umb" ? "Умбрата" : ""; if (t) return `Штандарт ${f}: ${t}${p[2] === "hi" ? " (высокий)" : ""}`; }
  const pre = PREFIX.find(([re]) => re.test(id));
  let rest = pre ? id.replace(pre[0], "") : id;
  const [head, ...tail] = rest.split("_");
  // pal_h_sol, pal_gate_umb и т. п.
  let parts = [head, ...tail];
  // подземелье: тип_стиль_вариант
  if (id.startsWith("dg_") && DG_TYPE.has(parts[0]) && DG_STYLE[parts[1]]) {
    const v = parts[2] ? `, вар. ${parts[2].toUpperCase()}` : "";
    return `Подземелье: ${WORDS[parts[0]]} (${DG_STYLE[parts[1]]}${v})`;
  }
  if (id.startsWith("dg_door_w_")) return `Подземелье: деревянная дверь (кадр ${parts[2]})`;
  if (id.startsWith("dg_port_")) return `Подземелье: решётка-герса (кадр ${parts[1]})`;
  if (id.startsWith("dg_gate_a_")) return `Подземелье: ворота склепа (кадр ${parts[2]})`;
  if (id.startsWith("loot_")) return "?";
  if (parts.some((p) => !(p in WORDS) && !/^\d+$/.test(p))) return "?";
  const w = parts.map((p) => (/^\d+$/.test(p) ? `№${p}` : WORDS[p])).filter(Boolean);
  const first = w[0].charAt(0).toUpperCase() + w[0].slice(1);
  const body = [first, ...w.slice(1)].join(" ");
  return (pre ? pre[1] : "") + (pre && pre[1] ? body.charAt(0).toLowerCase() + body.slice(1) : body);
}

type Rule = [RegExp, Category];
const RULES: Rule[] = [
  [/^cit_|^chaos_pillar$|^raid_portal$/, "рейд"],
  [/^dg_/, "подземелье"],
  [/^(loot_|node_)/, "добыча"],
  [/^(bridge_|v_bridges_)/, "мост"],
  [/^(std-|ember-std|ward-|bf-(ballista|catapult|trebuchet)|bf_(ram|siege|catapult|spike|tent|fallen|horse|skeleton|arrows|axe|blood|crater|debris|hammer|scorch|shield|spear|sword|wagon|map_table)|dummy$)/, "война и осада"],
  [/^(bf-fire|bf-smoke|bf-forge|lamp$|torch$|brazier|soul_brazier|campfire|candelabra|ember_vent|v_graveyard_(lamp|lantern))/, "свет и огонь"],
  [/(^|_)(wall|palisade|fence)(_|$)|^pal_|_tower$|^tower$|bf_wall_tower|bf_palisade_gate|^(sol|umb)_gate$|^gate_arch$|v_fortkit_(wall|gate|tower)|v_graveyard_pillar_(fence|chain)|v_graveyard_pillar_low_fence/, "стена и ограда"],
  [/^(house|hut_|tavern|bank|forge$|sol_(house|temple|church)|umb_(house|crypt|ziggurat)|v_basic_cave)/, "здание"],
  [/^(teleport|arena_gate|signpost|stall|anvil$|cauldron|weapon_rack|altar_|lectern|pew|v_basic_sign|v_volcano_sign|v_basic_stairs|v_fortkit_(ladder|stairs)|v_basic_ladder|v_basic_cliff_end)/, "интерактив"],
  [/^(rock|big_rock|basalt|sandstone|snow_rock|ice_spike|snowdrift|obsidian_spire|crystal|ledge_|shell|v_volcano_(rock|boulder|lava)|palm|snow_pine|snow_bush|cactus|dry_bush|bush|fern|flowers|tallgrass|reeds|mushrooms|lilypad|v_basic_(oak|pine|bush|shrub|stump|log|cliff)|v_graveyard_dead_tree|v_volcano_dead|v_graveyard_dead_stump)/, "природа"],
];
export function objCategory(id: string): Category {
  const r = RULES.find(([re]) => re.test(id));
  return r ? r[1] : "декор";
}
/** Подвид природы: камень, дерево, куст, лёд, растение. */
export function natureSub(id: string): string {
  if (/ice|snowdrift|frost/.test(id)) return "лёд";
  if (/rock|basalt|sandstone|obsidian|crystal|ledge|boulder|lava|shell|cliff/.test(id)) return "камень";
  if (/palm|pine|oak|tree|stump|log|trunk/.test(id)) return "дерево";
  if (/bush|shrub|cactus/.test(id)) return "куст";
  return "растение";
}
