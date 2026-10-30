/**
 * Затравка каталога моделей экипировки -> data/items.json (запуск: npx tsx tools/gen-items.ts).
 * После генерации источником истины служит JSON: его можно править руками (имена, вид, классы).
 * Модель = категория (база из shared/items.ts) × ярус уровня × архетип силуэта × стиль (Сольгард / Умбрат / нейтральный).
 * Стиль (fac) — только внешний вид: характеристики и доступность от него не зависят.
 */
import fs from "node:fs";
import classes from "../data/classes.json";

type G = "m" | "f" | "n" | "p";
type Kind = "metal" | "leather" | "cloth";
/** Архетип: существительное (род) и силуэт look.shape. */
interface Arch { w: string; g: G; shape: string }
interface Cat { id: string; kind: Kind; arch: Arch[]; cls: string[]; affix: (h: number) => string[]; variants?: { key: string; arch: Arch[]; cls: string[]; affix: string[] }[] }

const A = (w: string, g: G, shape: string): Arch => ({ w, g, shape });
const SEC = ["vit", "crit", "hp"];
const strW = (h: number) => ["str", SEC[h % 3]];
const agiW = (h: number) => ["agi", ["crit", "vit", "agi"][h % 3]];
const intW = (h: number) => ["int", SEC[h % 3]];
const TANK = ["warrior", "deathknight"], MELEE2H = ["deathknight", "reaver"], CAST = ["mage", "healer", "warlock", "bloodweaver"], ARCH = ["ranger", "darkranger"];
const PLATE = ["warrior", "deathknight", "reaver"], LEATH = ["rogue", "ranger", "darkranger", "reaver"];
const CLS = classes as unknown as Record<string, { mainStat: string; faction: string }>;
const byStat = (s: string) => Object.keys(CLS).filter((k) => !k.startsWith("_") && CLS[k].mainStat === s);

const CATS: Cat[] = [
  { id: "sword", kind: "metal", cls: TANK, affix: strW, arch: [A("палаш", "m", "broad"), A("сабля", "f", "saber"), A("пламенный клинок", "m", "flame"), A("зубастый меч", "m", "serrated"), A("рунный меч", "m", "runic"), A("фальшион", "m", "falchion"), A("шпага", "f", "rapier"), A("гладий", "m", "leaf")] },
  { id: "greatsword", kind: "metal", cls: MELEE2H, affix: strW, arch: [A("двуручник", "m", "zwei"), A("клеймор", "m", "claymore"), A("фламберг", "m", "flamberge"), A("меч палача", "m", "executioner"), A("пилорез", "m", "jagged"), A("рунный двуручник", "m", "runeblade"), A("тесак", "m", "cleaver"), A("бастард", "m", "bastard")] },
  { id: "twinblades", kind: "metal", cls: ["rogue", "reaver"], affix: agiW, arch: [A("клинки", "p", "twin"), A("сабли", "p", "twinsaber"), A("когти", "p", "claws"), A("серпы", "p", "sickles"), A("крисы", "p", "kris"), A("крюки", "p", "hooks")] },
  { id: "dagger", kind: "metal", cls: ["rogue", "reaver"], affix: agiW, arch: [A("кинжалы", "p", "dagger"), A("стилеты", "p", "stiletto"), A("ножи", "p", "knife"), A("кортики", "p", "dirk"), A("клыки", "p", "fang"), A("ритуальные ножи", "p", "ritual"), A("метательные ножи", "p", "kunai")] },
  { id: "axe", kind: "metal", cls: PLATE, affix: strW, arch: [A("топор", "m", "bearded"), A("колун", "m", "splitter"), A("чекан", "m", "pick"), A("клевец", "m", "beak"), A("франциска", "f", "francisca"), A("двойной топор", "m", "double"), A("томагавк", "m", "tomahawk")] },
  { id: "greataxe", kind: "metal", cls: MELEE2H, affix: strW, arch: [A("секира", "f", "moon"), A("бердыш", "m", "bardiche"), A("лабрис", "m", "labrys"), A("топор палача", "m", "executioner"), A("крылатая секира", "f", "winged"), A("костолом", "m", "bonecleaver")] },
  { id: "mace", kind: "metal", cls: TANK, affix: strW, arch: [A("булава", "f", "studded"), A("палица", "f", "club"), A("шестопёр", "m", "flanged"), A("моргенштерн", "m", "star"), A("кистень", "m", "flail"), A("солнечная булава", "f", "holy"), A("черепная булава", "f", "skull")] },
  { id: "hammer", kind: "metal", cls: PLATE, affix: strW, arch: [A("молот", "m", "hammer"), A("кувалда", "f", "maul"), A("дробитель", "m", "crusher"), A("крылатый молот", "m", "holy"), A("рунный молот", "m", "rune"), A("шипастый молот", "m", "spiked")] },
  { id: "spear", kind: "metal", cls: TANK, affix: strW, arch: [A("копьё", "n", "leaf"), A("пика", "f", "pike"), A("рогатина", "f", "boar"), A("протазан", "m", "partisan"), A("трезубец", "m", "trident"), A("турнирное копьё", "n", "lance"), A("змеиное копьё", "n", "serpent")] },
  { id: "scythe", kind: "metal", cls: MELEE2H, affix: strW, arch: [A("коса", "f", "scythe"), A("глефа", "f", "glaive"), A("боевая коса", "f", "warscythe"), A("двойная коса", "f", "double"), A("коса жнеца", "f", "reaper"), A("алебарда", "f", "halberd")] },
  { id: "bow", kind: "metal", cls: ARCH, affix: (h) => ["agi", ["crit", "vit", "hp"][h % 3]], arch: [A("лук", "m", "simple"), A("изогнутый лук", "m", "recurve"), A("длинный лук", "m", "long"), A("составной лук", "m", "composite"), A("костяной лук", "m", "bone"), A("лук-клинок", "m", "bladed"), A("рогатый лук", "m", "horn"), A("лунный лук", "m", "crescent")] },
  { id: "crossbow", kind: "metal", cls: ARCH, affix: (h) => ["agi", ["crit", "vit", "hp"][h % 3]], arch: [A("арбалет", "m", "light"), A("самострел", "m", "hand"), A("тяжёлый арбалет", "m", "heavy"), A("многозарядный арбалет", "m", "repeater"), A("аркбаллиста", "f", "ballista"), A("паучий арбалет", "m", "spider")] },
  { id: "staff", kind: "metal", cls: ["mage", "warlock"], affix: intW, arch: [A("корневой посох", "m", "root"), A("рогатый посох", "m", "skull"), A("посох-фонарь", "m", "cage"), A("лунный посох", "m", "crescent"), A("посох сфер", "m", "rings"), A("хребтовый посох", "m", "spine"), A("грозовой посох", "m", "fork"), A("шаманский посох", "m", "feather")] },
  { id: "scepter", kind: "metal", cls: ["healer", "bloodweaver"], affix: intW, arch: [A("жезл", "m", "rod"), A("скипетр", "m", "crown"), A("палочка", "f", "wand"), A("тотем", "m", "totem"), A("кадило", "n", "censer"), A("солнечный жезл", "m", "sun"), A("змеиный жезл", "m", "serpent"), A("жезл ока", "m", "eye")] },
  { id: "orb", kind: "metal", cls: ["mage", "warlock"], affix: (h) => ["int", ["crit", "crit", "hp"][h % 3]], arch: [A("сфера", "f", "orb"), A("кристалл", "m", "crystal"), A("око", "n", "eye"), A("светоч", "m", "lantern"), A("призма", "f", "prism"), A("череп-сфера", "m", "skull"), A("астролябия", "f", "orbit")] },
  { id: "tome", kind: "cloth", cls: ["healer", "bloodweaver"], affix: (h) => ["int", ["hp", "vit", "hp"][h % 3]], arch: [A("книга", "f", "book"), A("фолиант", "m", "thick"), A("гримуар", "m", "grimoire"), A("свиток", "m", "scroll"), A("требник", "m", "prayer"), A("звёздный атлас", "m", "star")] },
  { id: "shield", kind: "metal", cls: TANK, affix: (h) => ["vit", ["hp", "str", "hp"][h % 3]], arch: [A("щит", "m", "heater"), A("баклер", "m", "buckler"), A("павеза", "f", "tower"), A("рондаш", "m", "round"), A("каплевидный щит", "m", "kite"), A("эгида", "f", "aegis"), A("костяной щит", "m", "bone"), A("шипастый щит", "m", "spiked")] },
  { id: "plate_helm", kind: "metal", cls: PLATE, affix: (h) => ["vit", ["str", "hp", "str"][h % 3]], arch: [A("шлем", "m", "open"), A("топфхельм", "m", "great"), A("барбют", "m", "barbute"), A("бацинет", "m", "bascinet"), A("армет", "m", "armet"), A("рогатый шлем", "m", "horned"), A("коронный шлем", "m", "crowned"), A("шлем с плюмажем", "m", "plumed"), A("салад", "m", "sallet")] },
  { id: "leather_helm", kind: "leather", cls: LEATH, affix: agiW, arch: [A("капюшон", "m", "hood"), A("маска", "f", "mask"), A("шапка", "f", "fur"), A("наголовник", "m", "cap"), A("куколь", "m", "cowl"), A("звериная шкура", "f", "pelt"), A("повязка", "f", "band")] },
  { id: "cloth_helm", kind: "cloth", cls: CAST, affix: intW, arch: [A("колпак", "m", "wizard"), A("венец", "m", "circlet"), A("клобук", "m", "cowl"), A("тиара", "f", "mitre"), A("диадема", "f", "diadem"), A("чалма", "f", "turban"), A("вуаль", "f", "veil"), A("рогатая корона", "f", "horncrown")] },
  { id: "plate_armor", kind: "metal", cls: PLATE, affix: (h) => ["vit", ["str", "hp", "str"][h % 3]], arch: [A("латы", "p", "plate"), A("кираса", "f", "cuirass"), A("панцирь", "m", "scale"), A("кольчуга", "f", "chain"), A("бригантина", "f", "brigandine"), A("полный доспех", "m", "full"), A("латы с табардом", "p", "tabard"), A("костяной доспех", "m", "bone")] },
  { id: "leather_armor", kind: "leather", cls: LEATH, affix: agiW, arch: [A("куртка", "f", "jacket"), A("колет", "m", "vest"), A("стёганка", "f", "gambeson"), A("плащ", "m", "cloak"), A("кафтан", "m", "coat"), A("накидка", "f", "mantle"), A("перевязь", "f", "harness"), A("меховой доспех", "m", "pelt")] },
  { id: "cloth_armor", kind: "cloth", cls: CAST, affix: intW, arch: [A("мантия", "f", "robe"), A("роба", "f", "plain"), A("ряса", "f", "cassock"), A("облачение", "n", "vestment"), A("балахон", "m", "hooded"), A("хламида", "f", "wrap"), A("саван", "m", "shroud"), A("боевая мантия", "f", "battle")] },
  { id: "plate_boots", kind: "metal", cls: PLATE, affix: (h) => ["vit", ["str", "hp", "str"][h % 3]], arch: [A("сабатоны", "p", "sabaton"), A("поножи", "p", "greave"), A("сапоги", "p", "boot"), A("башмаки", "p", "shoe"), A("шипастые сапоги", "p", "spiked"), A("крылатые сапоги", "p", "winged")] },
  { id: "leather_boots", kind: "leather", cls: LEATH, affix: agiW, arch: [A("ботинки", "p", "shoe"), A("мокасины", "p", "moccasin"), A("сапожки", "p", "high"), A("унты", "p", "fur"), A("ботфорты", "p", "cuff"), A("обмотки", "p", "wrapped")] },
  { id: "cloth_boots", kind: "cloth", cls: CAST, affix: intW, arch: [A("туфли", "p", "slipper"), A("сандалии", "p", "sandal"), A("черевики", "p", "shoe"), A("калиги", "p", "wrap"), A("остроносые туфли", "p", "curled"), A("шёлковые сапожки", "p", "silk")] },
  {
    id: "ring", kind: "metal", cls: [], affix: () => [], arch: [],
    variants: [
      { key: "str", arch: [A("перстень", "m", "signet"), A("перстень", "m", "claw"), A("перстень", "m", "skull"), A("перстень", "m", "crown")], cls: byStat("str"), affix: ["str", "vit"] },
      { key: "agi", arch: [A("кольцо", "n", "twist"), A("кольцо", "n", "band"), A("кольцо", "n", "double"), A("кольцо", "n", "serpent")], cls: byStat("agi"), affix: ["agi", "crit"] },
      { key: "int", arch: [A("печатка", "f", "claw"), A("печатка", "f", "crown"), A("печатка", "f", "serpent"), A("печатка", "f", "signet")], cls: byStat("int"), affix: ["int", "hp"] },
    ],
  },
  {
    id: "amulet", kind: "metal", cls: [], affix: () => [], arch: [],
    variants: [
      { key: "str", arch: [A("оберег", "m", "fang"), A("оберег", "m", "skull"), A("ожерелье", "n", "beads"), A("оберег", "m", "rune")], cls: byStat("str"), affix: ["str", "hp"] },
      { key: "agi", arch: [A("талисман", "m", "disc"), A("талисман", "m", "crescent"), A("подвеска", "f", "drop"), A("талисман", "m", "eye")], cls: byStat("agi"), affix: ["agi", "crit"] },
      { key: "int", arch: [A("амулет", "m", "medallion"), A("медальон", "m", "locket"), A("амулет", "m", "sun"), A("амулет", "m", "holy")], cls: byStat("int"), affix: ["int", "vit"] },
    ],
  },
  {
    id: "cloak", kind: "cloth", cls: [], affix: () => [], arch: [],
    variants: [
      { key: "str", arch: [A("плащ", "m", "long"), A("плащ с гербом", "m", "crest"), A("меховая мантия", "f", "fur")], cls: byStat("str"), affix: ["vit", "hp"] },
      { key: "agi", arch: [A("накидка", "f", "short"), A("плащ-крылья", "m", "wings"), A("перьевой плащ", "m", "feather")], cls: byStat("agi"), affix: ["agi", "crit"] },
      { key: "int", arch: [A("плащ с капюшоном", "m", "hood"), A("саван", "m", "shroud")], cls: byStat("int"), affix: ["int", "hp"] },
    ],
  },
];

/** Тема яруса: прилагательное (м|ж|ср|мн), родительный эпитет, материалы и убранство. */
interface Theme { adj: string; gen: string; mat: string; trim: string; cloth: string; hide: string; gem: string; haft: string; deco: string[] }
const T = (adj: string, gen: string, mat: string, trim: string, cloth: string, hide: string, gem: string, haft: string, deco: string[]): Theme => ({ adj, gen, mat, trim, cloth, hide, gem, haft, deco });
const F = (s: string) => { const b = s.slice(0, -2), e = s.slice(-2); return e === "ий" && /[кгх]$/.test(b) ? `${s}|${b}ая|${b}ое|${b}ие` : e === "ой" ? `${s}|${b}ая|${b}ое|${b}ые` : e === "ий" ? `${s}|${b}яя|${b}ее|${b}ие` : `${s}|${b}ая|${b}ое|${b}ые`; };
/** Стили: Сольгард — сталь, золото, белая ткань, лазурь; Умбрат — чёрное железо, кость, саван, зелёно-фиолетовое свечение; нейтральный — простые металлы, кожа, природные цвета. */
const TIERS: { lvl: number; sol: Theme; umb: Theme; neu: Theme }[] = [
  { lvl: 1, sol: T(F("Простой"), "новобранца", "iron", "bronze", "white", "leather", "", "wood", []), umb: T(F("Грубый"), "изгоя", "blackiron", "iron", "shroud", "darkleather", "", "darkwood", []), neu: T(F("Старый"), "бродяги", "rust", "iron", "brown", "leather", "", "wood", []) },
  { lvl: 6, sol: T(F("Походный"), "странника", "steel", "bronze", "azure", "leather", "", "wood", []), umb: T(F("Болотный"), "мародёра", "blackiron", "bone", "moss", "darkleather", "", "darkwood", ["chains"]), neu: T(F("Добротный"), "наёмника", "bronze", "bronze", "green", "leather", "", "wood", []) },
  { lvl: 12, sol: T(F("Гарнизонный"), "стража", "steel", "steel", "azure", "leather", "sun", "wood", ["filigree"]), umb: T(F("Костяной"), "падальщика", "bone", "bone", "shroud", "darkleather", "fel", "deadwood", ["skull", "spikes"]), neu: T(F("Кованый"), "кузнеца", "iron", "bronze", "grey", "leather", "", "wood", ["runes"]) },
  { lvl: 18, sol: T(F("Рыцарский"), "оруженосца", "steel", "gold", "white", "leather", "ruby", "wood", ["filigree", "wings"]), umb: T(F("Могильный"), "гробовщика", "blackiron", "bone", "shroud", "blackleather", "onyx", "darkwood", ["skull", "chains"]), neu: T("Охотничий|Охотничья|Охотничье|Охотничьи", "зверолова", "steel", "bronze", "green", "leather", "emerald", "yew", ["spikes"]) },
  { lvl: 24, sol: T(F("Королевский"), "капитана", "blued", "gold", "azure", "leather", "pearl", "yew", ["filigree", "runes"]), umb: T(F("Чумной"), "чумного лекаря", "plague", "bronze", "moss", "darkleather", "emerald", "deadwood", ["spikes", "chains"]), neu: T(F("Пограничный"), "пограничья", "steel", "iron", "teal", "leather", "sun", "wood", ["runes"]) },
  { lvl: 30, sol: T(F("Серебряный"), "паладина", "silver", "gold", "white", "leather", "pearl", "yew", ["filigree", "wings"]), umb: T(F("Погребальный"), "плакальщиц", "blackiron", "bone", "shroud", "blackleather", "fel", "darkwood", ["skull", "chains"]), neu: T(F("Северный"), "северных кланов", "iron", "silver", "grey", "whitefur", "diamond", "wood", ["runes", "spikes"]) },
  { lvl: 37, sol: T(F("Рунный"), "рунного мастера", "rune", "silver", "azure", "leather", "diamond", "yew", ["runes"]), umb: T(F("Проклятый"), "отступника", "darksteel", "void", "violet", "blackleather", "onyx", "deadwood", ["runes", "chains"]), neu: T("Гномий|Гномья|Гномье|Гномьи", "подгорных мастеров", "bronze", "gold", "red", "leather", "ruby", "darkwood", ["runes", "filigree"]) },
  { lvl: 44, sol: T(F("Мифриловый"), "дозорного", "mithril", "silver", "white", "leather", "diamond", "yew", ["filigree", "runes", "wings"]), umb: T(F("Теневой"), "ловца душ", "shadow", "bone", "shroud", "blackleather", "fel", "deadwood", ["spikes", "skull", "runes"]), neu: T(F("Лесной"), "лесных стражей", "adamant", "bronze", "green", "greenscale", "emerald", "yew", ["runes", "filigree"]) },
  { lvl: 52, sol: T(F("Лучезарный"), "рассвета", "radiant", "gold", "white", "leather", "sun", "yew", ["wings", "halo", "filigree"]), umb: T(F("Обсидиановый"), "тёмного легиона", "obsidian", "bone", "violet", "blackleather", "onyx", "darkwood", ["spikes", "horns", "runes"]), neu: T(F("Пустынный"), "песков", "bronze", "gold", "goldcloth", "leather", "sun", "yew", ["filigree", "spikes"]) },
  { lvl: 60, sol: T("Грифоний|Грифонья|Грифонье|Грифоньи", "грифоньего всадника", "silver", "gold", "azure", "leather", "sun", "gold", ["wings", "filigree"]), umb: T("Драконий|Драконья|Драконье|Драконьи", "костяного дракона", "dragonbone", "obsidian", "shroud", "blackleather", "fel", "obsidian", ["horns", "spikes", "skull"]), neu: T(F("Штормовой"), "бури", "storm", "silver", "teal", "leather", "pearl", "silver", ["runes", "spikes"]) },
  { lvl: 68, sol: T(F("Святой"), "святого воинства", "steel", "gold", "white", "leather", "sun", "gold", ["halo", "wings", "filigree"]), umb: T(F("Некромантский"), "некроманта", "darksteel", "void", "black", "blackleather", "fel", "obsidian", ["skull", "horns", "chains"]), neu: T(F("Вулканический"), "вулкана", "magma", "obsidian", "red", "redscale", "ruby", "obsidian", ["spikes", "runes"]) },
  { lvl: 76, sol: T(F("Солнечный"), "солнца", "solar", "divine", "goldcloth", "leather", "sun", "gold", ["halo", "wings"]), umb: T(F("Сумрачный"), "сумрака", "void", "bone", "violet", "blackleather", "onyx", "obsidian", ["horns", "runes", "chains"]), neu: T(F("Кристальный"), "кристальных пещер", "crystal", "silver", "teal", "leather", "diamond", "silver", ["runes", "spikes"]) },
  { lvl: 84, sol: T(F("Звёздный"), "звездопада", "star", "silver", "azure", "leather", "diamond", "silver", ["runes", "halo", "wings"]), umb: T(F("Ледяной"), "вечной зимы", "frost", "bone", "shroud", "blackleather", "fel", "frost", ["spikes", "skull", "runes"]), neu: T(F("Древний"), "древних королей", "verdigris", "gold", "red", "leather", "emerald", "darkwood", ["runes", "filigree"]) },
  { lvl: 92, sol: T(F("Эфирный"), "небес", "ether", "divine", "white", "leather", "diamond", "divine", ["wings", "halo", "runes"]), umb: T(F("Потусторонний"), "бездны", "abyss", "void", "black", "blackleather", "onyx", "abyss", ["horns", "skull", "chains"]), neu: T(F("Громовой"), "грозы", "storm", "gold", "azure", "leather", "diamond", "silver", ["runes", "spikes"]) },
  { lvl: 100, sol: T(F("Божественный"), "первосвета", "divine", "gold", "white", "leather", "sun", "divine", ["wings", "halo"]), umb: T(F("Первородный"), "вечной ночи", "primal", "bone", "black", "blackleather", "fel", "primal", ["horns", "skull", "spikes"]), neu: T(F("Изначальный"), "сотворения", "prism", "gold", "white", "leather", "diamond", "divine", ["runes", "halo"]) },
];

const PAL: Record<string, string> = {
  rust: "#2e221c #4e3a2e #6e5442 #8c7058 #a89078", iron: "#2a2c34 #464a56 #6a707c #9298a4 #bcc2cc", bronze: "#3e220e #6a4018 #9a6a2a #c8964a #ecc47c",
  steel: "#3a3f4c #5e6678 #8f99ad #c8d0de #f2f6ff", darksteel: "#16161e #2a2a3a #42425a #62627e #8c8cac", blued: "#182438 #2c4466 #4a6c9a #7ea2cc #c4dcf2",
  blackiron: "#0e0e12 #1c1c24 #2e2e3a #4a4a5a #727286",
  silver: "#484c5c #7a8094 #aeb6c8 #dce2ec #ffffff", bone: "#4a4238 #6a6258 #9e968a #cfc8b8 #f1ecdf", plague: "#1e2618 #34402a #556640 #7e905c #b0c08a",
  dragonbone: "#2a3028 #4e5a48 #8a9680 #c4ceb4 #eef6e0",
  rune: "#22303c #3c5264 #607c90 #94b2c4 #d4ecf6", mithril: "#24424e #3e6e7c #6aa2ae #a6d8dc #e8ffff",
  shadow: "#0e1018 #1c2030 #30364c #4c5470 #7a84a4", radiant: "#6a4a1c #a8802e #e0bc5a #fae6a0 #ffffff", obsidian: "#0e0c16 #1a1626 #2a2440 #40385c #6a5e96",
  gold: "#6a4210 #a8681c #e0a630 #ffd864 #fff2b0", adamant: "#0e3a2e #1a5e48 #2e8a68 #5ac092 #a8f0c8",
  solar: "#7a4a10 #c08020 #f0c040 #ffe890 #ffffff", void: "#0a0614 #1e1032 #3a1e5e #6a3aa0 #b080f0",
  star: "#0e1640 #1e2e78 #3a5ab8 #7aa0f0 #e0f0ff", frost: "#1e4a70 #3a78a8 #6ab0d8 #a8e0f4 #f0ffff", ether: "#2e2a6a #4e5aa8 #7e9ae0 #b8dcff #ffffff",
  abyss: "#050308 #120a1c #2a1240 #5a1a6a #c040c0", divine: "#8a6a30 #c8a050 #f0d890 #fff4d0 #ffffff", primal: "#06080a #10161a #1e2a22 #3a5a2a #8ad860",
  storm: "#1a2436 #2e4260 #4e6c94 #86a8cc #d0e4f8", magma: "#1a0a06 #3e140a #7a2a10 #d0601c #ffc060", crystal: "#3a4a6a #6a86b0 #a8c8e8 #e0f0ff #ffffff",
  verdigris: "#1a3a30 #2e5e4c #4a8a70 #78b898 #c0e8d0", prism: "#4a3a7a #7a6ac0 #b0a8f0 #e8e0ff #ffffff",
  wood: "#3a2216 #5e3a22 #8a5a34 #b07e4c #d0a070", darkwood: "#1e140e #34241a #4e3626 #6a4c36 #8a6a50", yew: "#4a2e18 #7a4e28 #a8743e #d0a060 #ecc890",
  deadwood: "#24201e #3a3430 #565048 #767064 #9a9488",
  red: "#4a1420 #7e2230 #b03a3e #d86a5a #f09a88", blue: "#16243e #243e66 #3a5e94 #5e8cc0 #94bce4", azure: "#123058 #1e4c8a #2e74c0 #5aa2e4 #a8d4ff",
  purple: "#2a1640 #46265e #6a3c8a #9a62b8 #c494dc",
  green: "#1c3420 #2e5232 #467a42 #6aa058 #9ac880", white: "#7a7480 #aaa4ae #d6d0d8 #f6f2f8 #ffffff", black: "#141218 #24202c #383244 #4e4660 #6e6680",
  brown: "#2e2016 #4a3424 #6a4c34 #8c6a4a #b08c68", grey: "#2e2e34 #4a4a52 #6a6a74 #8e8e98 #b4b4bc", crimson: "#2a0610 #4e0c1c #80162c #b8303e #e06868",
  teal: "#0e3034 #1a5054 #2a7a7a #48a8a0 #80d0c4", violet: "#1e1238 #34205e #54348e #8058c0 #b490ec", goldcloth: "#5a3a10 #8a5e1a #c08a2a #e8b84a #fae08a",
  ice: "#2a4a6a #4a7aa0 #7aaed0 #b4dcf0 #f0faff", moss: "#1a2414 #2a3a1e #42582c #607a40 #8aa060", shroud: "#26282a #3e423e #5e645a #8a9082 #b8bcaa",
  leather: "#3e2618 #6a4228 #94613a #bb8a58 #dcb080", darkleather: "#1e140e #36241a #4e3626 #6a4a34 #8a6648", blackleather: "#0e0c10 #1c181e #2e2830 #463e48 #625868",
  redscale: "#2a0808 #501410 #82241a #b84028 #e87a48", greenscale: "#0e2418 #1a3e28 #2a6040 #44885a #78b880", whitefur: "#6a6458 #9a9484 #c8c0ae #e8e2d2 #ffffff",
  ruby: "#4a0610 #8a1424 #d02a3e #ff7080 #ffffff", sapphire: "#0a1a5a #1a3aa0 #2e6ae0 #80b8ff #ffffff", emerald: "#0a3a0e #1a6a1e #34a834 #8ae880 #ffffff", fel: "#1a3a0a #3a7a14 #6ac030 #aaf070 #f0ffe0", onyx: "#0a0a0e #1e1c26 #3a3646 #6a6478 #c8c4d4", pearl: "#6a6470 #a8a2ae #dcd6e0 #f4f0f6 #ffffff",
  amethyst: "#2a0a4a #561c8a #8a3ad0 #c890ff #ffffff", topaz: "#5a3a06 #a06a10 #e8a820 #ffe070 #ffffff", diamond: "#6080a0 #a0c0e0 #d8ecff #f4faff #ffffff",
  soul: "#0a3a2a #1a7a5a #3ad09a #a0ffd8 #ffffff", bloodgem: "#2a0006 #5a000e #a00a1e #e03a4a #ff9aa0", voidgem: "#1a0630 #3a0a6a #7a1ad0 #c060ff #ffffff",
  sun: "#8a5a00 #e0a010 #ffd840 #fff4a0 #ffffff", frostgem: "#0a4a6a #1a8ac0 #50d0ff #b0f0ff #ffffff", fire: "#7a1c10 #c23a12 #f06a1a #ffb03a #ffe88a",
};

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
const GI: Record<G, number> = { m: 0, f: 1, n: 2, p: 3 };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const GUARDS = ["cross", "curved", "disc", "bar", "wings", "claw", "ornate"];
const POMMELS = ["ball", "gem", "ring", "spike", "skull"];
const STYLES = ["solgard", "umbrath", ""] as const;

interface Model { id: string; name: string; cat: string; lvl: number; fac: string; cls: string[]; affix: string[]; g?: 1; look: Record<string, string | number> }
const models: Model[] = [];
const names = new Set<string>();

TIERS.forEach((tier, ti) => {
  CATS.forEach((cat, ci) => {
    const variants = cat.variants ?? [{ key: "", arch: cat.arch, cls: cat.cls, affix: [] as string[] }];
    variants.forEach((v, vi) => {
      // стиль по кругу: в каждой категории и на каждом ярусе поровну Сольгарда и Умбрата, треть нейтральных
      const fac = STYLES[(ti + ci + vi * 2) % 3];
      const th = fac === "umbrath" ? tier.umb : fac === "solgard" ? tier.sol : tier.neu;
      const id = `${cat.id}${v.key ? "_" + v.key : ""}_${tier.lvl}`;
      const h = hash(id);
      const n = v.arch.length, ar = v.arch[(ti + Math.floor(ti / n) + ci + vi) % n];
      const gen = ti > 0 && h % 3 === 0;
      const adj = th.adj.split("|")[GI[ar.g]];
      const name = gen ? `${cap(ar.w)} ${th.gen}` : `${adj} ${ar.w}`;
      if (names.has(name)) throw new Error("повтор имени " + name);
      names.add(name);
      const deco = th.deco.length && ti >= 2 ? th.deco[(h >>> 3) % th.deco.length] : "";
      const rich = ti >= 13 ? 3 : ti >= 10 ? 2 : ti >= 7 ? 1 : 0;
      const gem = th.gem && (ti >= 4 || h % 2) ? th.gem : "";
      const look: Record<string, string | number> = { shape: ar.shape, mat: th.mat, trim: th.trim, cloth: th.cloth };
      if (cat.kind === "leather") look.hide = th.hide;
      if (gem) look.gem = gem;
      look.haft = th.haft;
      if (deco) look.deco = deco;
      if (rich) look.rich = rich;
      look.fx = gem || (fac === "umbrath" ? "fel" : fac === "solgard" ? "sun" : "diamond");
      let guard = GUARDS[(h >>> 7) % GUARDS.length], pommel = POMMELS[(h >>> 11) % POMMELS.length];
      if (fac !== "umbrath" && (guard === "claw" || pommel === "skull")) { guard = guard === "claw" ? "cross" : guard; pommel = pommel === "skull" ? "gem" : pommel; }
      if (fac === "umbrath" && guard === "wings") guard = "claw";
      look.guard = guard; look.pommel = pommel;
      const affix = v.affix.length ? v.affix : cat.affix(h);
      const m: Model = { id, name, cat: cat.id, lvl: tier.lvl, fac, cls: v.cls, affix, look };
      if (gen) m.g = 1;
      models.push(m);
    });
  });
});

const palettes = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, v.split(" ")]));
const out = { _doc: "Каталог моделей экипировки (shared/items.ts -> ITEM_MODELS). Затравка: tools/gen-items.ts, дальше правится вручную. cat — база (категория), lvl — с какого уровня падает, fac — только стиль внешности (solgard / umbrath / пусто = нейтральный; на характеристики и доступность не влияет), cls — рекомендованные классы, affix — приоритет аффиксов, g:1 — имя в родительном (без суффикса редкости), look — вид: shape (архетип силуэта), mat/trim/cloth/hide/gem/haft (ключи palettes), deco, rich 0..3 (богатство отделки по ярусу, без свечения), fx (цвет рун и гравировки), guard/pommel. Цвета камня и каймы на иконке и герое берутся по редкости предмета (docs/art/gear.md 2.1): у r0 кайма нейтральная, камень тусклый; у r≥1 — цвет редкости.", palettes, models };
fs.writeFileSync("data/items.json", JSON.stringify(out, null, 0).replace(/\{"id":/g, "\n{\"id\":"));
const cnt = (f: string) => models.filter((m) => m.fac === f).length;
console.log(`[items] моделей: ${models.length} (Сольгард ${cnt("solgard")}, Умбрат ${cnt("umbrath")}, нейтральных ${cnt("")})`);
