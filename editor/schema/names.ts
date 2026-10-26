/** Русские имена для всего, что видит пользователь редактора: разделы, ключи, группы, сущности. */

export const SECTION_ICON: Record<string, string> = {
  "Баланс": "⚖", "Мобы": "☠", "Боссы": "♛", "Маунты": "♞", "Предметы": "⚔", "Задания": "✉",
  "Патрули и отряды": "⚑", "Города": "⌂", "Лор": "✎", "Прочее": "☰",
};

/** Слова ключей → русские слова (для автоперевода составных имён вроде «healWindowMs»). */
const WORDS: Record<string, string> = {
  id: "идентификатор", name: "название", desc: "описание", title: "титул", text: "текст", lore: "предание", icon: "иконка", icons: "иконки", sprite: "спрайт",
  color: "цвет", colors: "цвета", tint: "оттенок", level: "уровень", lvl: "уровень", min: "минимум", max: "максимум", price: "цена", prices: "цены", gold: "золото",
  hp: "здоровье", mp: "мана", dmg: "урон", armor: "броня", speed: "скорость", aggro: "агро", range: "дальность", radius: "радиус", size: "размер", count: "число",
  chance: "шанс", cd: "перезарядка", cooldown: "перезарядка", every: "период", delay: "задержка", ms: "мс", sec: "с", min_: "мин", px: "px", pct: "доля", mul: "множитель",
  rate: "частота", time: "время", dur: "длительность", duration: "длительность", respawn: "возрождение", boss: "босс", bosses: "боссы", mob: "моб", mobs: "мобы",
  item: "предмет", items: "предметы", rare: "редкий", epic: "эпический", common: "обычный", legendary: "легендарный", uncommon: "необычный", tier: "ярус", tiers: "ярусы",
  faction: "фракция", factions: "фракции", class: "класс", classes: "классы", skill: "умение", skills: "умения", xp: "опыт", rep: "репутация", marks: "знаки",
  quest: "задание", quests: "задания", reward: "награда", rewards: "награды", loot: "добыча", drop: "выпадение", drops: "выпадения", weight: "вес", tree: "ветка",
  city: "город", cities: "города", fort: "форт", bridge: "мост", patrol: "патруль", patrols: "патрули", tower: "башня", towers: "башни", road: "дорога", roads: "дороги",
  zone: "зона", zones: "зоны", map: "карта", door: "дверь", npc: "NPC", guard: "стража", squad: "отряд", squads: "отряды", unit: "боец", units: "бойцы",
  base: "база", bonus: "бонус", cap: "предел", limit: "лимит", start: "начало", end: "конец", first: "первый", last: "последний", next: "следующий", step: "шаг",
  melee: "ближний", ranged: "дальний", flying: "летающий", bound: "привязан", stack: "стопка", slot: "ячейка", slots: "ячейки", bag: "сумка", bank: "банк",
  heal: "лечение", healer: "лекарь", tank: "танк", mage: "маг", power: "сила", shield: "щит", stun: "оглушение", slow: "замедление", root: "корни", poison: "яд",
  fire: "огонь", frost: "холод", arcane: "тайная магия", holy: "свет", phys: "физический", cast: "каст", windup: "замах", wait: "ожидание", pause: "пауза",
  day: "день", days: "дни", hour: "час", hours: "часы", minute: "минута", minutes: "минуты", season: "сезон", rating: "рейтинг", arena: "арена", raid: "рейд",
  trade: "обмен", market: "рынок", pet: "питомец", mount: "маунт", mounts: "маунты", part: "деталь", parts: "детали", craft: "сборка", seal: "печать",
  sound: "звук", volume: "громкость", alpha: "прозрачность", scale: "масштаб", angle: "угол", width: "ширина", height: "высота", offset: "смещение", gap: "зазор",
  show: "показ", hide: "скрытие", fade: "затухание", pulse: "пульсация", glow: "свечение", halo: "ореол", outline: "контур", shadow: "тень", particles: "частицы",
  player: "герой", hero: "герой", heroes: "герои", enemy: "враг", ally: "союзник", target: "цель", self: "сам", all: "все", any: "любой", none: "нет",
  walk: "ходьба", chase: "погоня", leash: "поводок", scan: "осмотр", near: "рядом", far: "далеко", home: "дом", wander: "блуждание", kite: "отход", throw: "бросок",
  attack: "атака", hit: "удар", crit: "крит", dodge: "уклонение", block: "блок", threat: "угроза", enrage: "ярость", mech: "механики", abilities: "умения",
  lines: "реплики", line: "реплика", spawn: "появление", death: "смерть", kill: "убийство", kills: "убийства", low: "мало", lowhp: "мало здоровья",
  total: "всего", per: "за", of: "от", from: "от", to: "до", at: "в", by: "по", in: "в", out: "наружу", up: "вверх", down: "вниз", left: "влево", right: "вправо",
  x: "x", y: "y", w: "ширина", h: "высота", r: "радиус", k: "тип", n: "число", v: "значение", a: "a", b: "b", q: "степень",
  enabled: "включено", on: "вкл", off: "выкл", mode: "режим", modes: "режимы", kind: "вид", kinds: "виды", type: "тип", cat: "категория", source: "источник", sources: "источники",
  currency: "валюта", cost: "стоимость", sell: "продажа", buy: "покупка", mats: "материалы", ore: "руда", resource: "ресурс", resources: "ресурсы", food: "еда",
  gear: "экипировка", weapon: "оружие", helm: "шлем", boots: "сапоги", cloak: "плащ", look: "внешний вид", palette: "палитра", palettes: "палитры", models: "модели",
  frame: "кадр", frames: "кадры", fps: "кадров/с", loop: "повтор", ease: "плавность", intro: "вступление", note: "заметка", hint: "подсказка", tips: "советы",
  text_: "текст", say: "реплика", greeting: "приветствие", merchant: "торговец", smith: "кузнец", banker: "банкир", giver: "задающий", done: "по завершении",
  stats: "характеристики", stat: "характеристика", str: "Сила", agi: "Ловкость", int: "Интеллект", vit: "Выносливость", main: "главная", per_level: "за уровень", perLevel: "за уровень",
  gcd: "общий откат", off_gcd: "вне общего отката", offgcd: "вне общего отката", rank: "ранг", req: "требование", reqLevel: "требуемый уровень", maxRank: "макс. ранг",
};

/** Явные русские названия частых ключей. */
import { BASE_RU } from "./baseNames";
export const KEY_RU: Record<string, string> = {
  ...BASE_RU,
  _doc: "Пояснение", id: "Идентификатор", name: "Название", desc: "Описание", title: "Титул", text: "Текст", lore: "Предание", icon: "Иконка", sprite: "Спрайт",
  color: "Цвет", tint: "Оттенок", level: "Уровень", lvl: "С какого уровня", price: "Цена", gold: "Золото", hp: "Здоровье", dmg: "Урон", armor: "Броня", xp: "Опыт",
  speed: "Скорость", aggro: "Радиус замечания", range: "Дальность", radius: "Размер тела", size: "Размер", chance: "Шанс", faction: "Фракция", tier: "Ярус",
  boss: "Босс", flying: "Летающий", source: "Откуда берётся", cat: "Категория", cls: "Классы", affix: "Бонусы", fac: "Стиль фракции", look: "Внешний вид",
  respawnMs: "Возрождение", respawn: "Возрождение", attackCd: "Пауза между ударами", chaseSpeed: "Скорость в погоне", windupMs: "Предупреждение до удара",
  every: "Как часто", dmgPct: "Урон (доля здоровья героя)", lines: "Реплики", loot: "Добыча", abilities: "Умения", gimmick: "«Фишка» боя", location: "Место",
  visual: "Образ", levels: "Уровни", band: "Полоса уровней", greeting: "Приветствие", at: "Положение", reward: "Награда", kind: "Вид", target: "Цель", giver: "Кто даёт",
  done: "Реплика при сдаче", n: "Сколько", max_active: "Одновременных заданий", quests: "Задания", mobs: "Мобы", mounts: "Маунты", items: "Предметы", parts: "Детали",
  warrior: "Храмовник (Сольгард, танк)", healer: "Клирик (Сольгард, лекарь)", ranger: "Рейнджер (Сольгард, лучник)", mage: "Боевой маг (Сольгард, заклинатель)", rogue: "Ассасин (Сольгард, боец)",
  deathknight: "Рыцарь Смерти (Умбрат, танк)", bloodweaver: "Кровотворец (Умбрат, лекарь)", darkranger: "Тёмный рейнджер (Умбрат, лучник)", warlock: "Чернокнижник (Умбрат, заклинатель)", reaver: "Потрошитель (Умбрат, боец)",
  solgard: "Сольгард", umbrath: "Умбрат", common: "Обычный", uncommon: "Необычный", rare: "Редкий", epic: "Эпический", legendary: "Легендарный",
  ent: "Энт (подземелье)", witch: "Ведьма (подземелье)", ashlord: "Повелитель Пепла", chaos_knight: "Рыцарь Хаоса (рейд)",
  melee: "Ближний бой", ranged: "Дальний бой", pvp: "Бой героев между собой", mob: "Обычные мобы", bosses: "Боссы", heal: "Лечение", pet: "Питомцы", loot_: "Добыча",
  mana: "Мана", player: "Герой", ranges: "Дальности", timers: "Таймеры", progression: "Прогресс и опыт", arena: "Арена", trade: "Обмен", bestiary: "Бестиарий",
  market: "Рынок", misc: "Прочее", units: "Бойцы", zones: "Поводки", mounted: "Против верховых", formation: "Строй патруля", bridges: "Мосты", cities: "Города",
  towers: "Башни", settlements: "Поселения", squads: "Отряды", wards: "Обереги", roads: "Дороги патрулей", economy: "Модель дохода", earn: "Откуда репутация и знаки",
  speeds: "Скорость по ярусам", seal: "Печать скакуна", currency: "Валюта", stablemasters: "Конюшие", tiers: "Названия ярусов", sources: "Источники", palettes: "Палитры", models: "Модели",
  dodgeModel: "Проверка «можно увернуться»", gcd: "Общий откат умений", moveMul: "Общая скорость ходьбы", aggroMul: "Радиус замечания героя мобами",
  rep: "Репутация", marks: "Знаки Полей", craft: "Сборка", drop: "Выпадение", names: "Названия по фракциям", bound: "Привязано", stack: "Размер стопки",
  class: "Поправки по классам героев", prices: "Цены", slots: "Ячейки", step: "Шаг", startSlots: "Стартовых ячеек", sections: "Разделы", authors: "Авторы",
};

function wordsOf(key: string): string[] {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-.]/g, " ").split(/\s+/).filter(Boolean).map((w) => w.toLowerCase());
}
/** Русское имя ключа: явное, иначе по словам; если слов не узнали — «ключ» как есть (серым в интерфейсе). */
export function keyRu(key: string): { text: string; known: boolean } {
  if (KEY_RU[key]) return { text: KEY_RU[key], known: true };
  if (/^\d+$/.test(key)) return { text: `№ ${Number(key) + 1}`, known: true };
  const ws = wordsOf(key);
  if (!ws.length) return { text: key, known: false };
  const tr = ws.map((w) => WORDS[w]);
  if (tr.every((x) => x === undefined)) return { text: key, known: false };
  const out = ws.map((w, i) => tr[i] ?? w).join(" ");
  return { text: out.charAt(0).toUpperCase() + out.slice(1), known: tr.every((x) => x !== undefined) };
}

/** Группы «по смыслу» для карточек полей: по имени последнего ключа. */
export interface GroupDef { title: string; icon: string; sub: string }
const G = (title: string, icon: string, sub: string): GroupDef => ({ title, icon, sub });
const RULES_G: [RegExp, GroupDef][] = [
  [/speed|walk|chase|catchUp|move|dash|leap|slow|gcd/i, G("Скорость и передвижение", "👣", "как быстро ходят и бегут")],
  [/aggro|scan|sight|leash|slack|alarm|reveal|notice/i, G("Обнаружение и погоня", "🎯", "когда замечают героя и как гонятся")],
  [/^(hp|armor|heal|shield|regen|mana|mp|thr)|health|absorb/i, G("Здоровье и защита", "❤", "сколько живут и чем защищены")],
  [/dmg|damage|attack|crit|hit|burst|pct|ramp|mech|projectile|arrow/i, G("Урон и бой", "⚔", "кто кого и как сильно бьёт")],
  [/xp|gold|reward|loot|drop|chance|price|cost|rep$|marks|item|potion|epic/i, G("Награды и деньги", "💰", "опыт, золото, добыча и цены")],
  [/Ms$|Sec$|Min$|Days?$|every|interval|delay|respawn|ttl|cd|cooldown|period|time|dur/i, G("Время и события", "⏱", "как часто и как долго")],
  [/name|desc|title|text|lore|greeting|line|say|intro|note|hint|tip|done/i, G("Тексты", "✎", "что видит и слышит игрок")],
  [/sprite|icon|color|tint|frame|size|radius|look|palette|alpha|glow|scale|shape|style/i, G("Вид и размер", "🎨", "как выглядит")],
  [/^(level|lvl|tier|rank|faction|fac|cls|class|source|kind|type|cat|flying|boss)$/i, G("Кто и откуда", "🏷", "принадлежность и условия")],
];
const OTHER = G("Прочее", "⚙", "остальные настройки");
export const groupRank = (title: string) => { const i = RULES_G.findIndex(([, g]) => g.title === title); return i < 0 ? 99 : i; };
export function groupOfKey(key: string): GroupDef {
  for (const [re, g] of RULES_G) if (re.test(key)) return g;
  return OTHER;
}

/** Списки-сущности: таблица с фильтрами и карточка. path — где лежит коллекция в файле. */
export interface EntityConf {
  path: string[];
  label: string;
  nameKey: string;
  thumb?: "unit" | "mount" | "icon";
  columns: string[];
  filters: string[];
  levelKey?: string;
}
export const ENTITIES: Record<string, EntityConf[]> = {
  mobs: [{ path: ["mobs"], label: "Мобы", nameKey: "name", thumb: "unit", columns: ["hp", "dmg", "speed", "aggro"], filters: ["boss"], levelKey: "level" }],
  mounts: [{ path: ["mounts"], label: "Маунты", nameKey: "name", thumb: "mount", columns: ["tier", "level", "price", "source"], filters: ["tier", "faction", "source", "flying"], levelKey: "level" }],
  "zone-bosses": [{ path: ["bosses"], label: "Боссы", nameKey: "name", columns: ["faction", "location", "respawnMs"], filters: ["faction"], levelKey: "levels.boss" }],
  items: [{ path: ["models"], label: "Модели экипировки", nameKey: "name", columns: ["cat", "lvl", "fac"], filters: ["cat", "fac"], levelKey: "lvl" }],
  quests: [{ path: ["quests"], label: "Задания", nameKey: "name", columns: ["kind", "level", "giver"], filters: ["kind"], levelKey: "level" }],
  texts: [{ path: ["texts"], label: "Тексты", nameKey: "text", columns: ["who", "where"], filters: ["area", "who"] }],
};
