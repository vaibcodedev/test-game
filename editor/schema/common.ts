import type { Ctx, Doc, Rules } from "./types";
import { num, TILE, BASE_PLAYER_SPEED, plural, cells } from "./fmt";
import { evalCurve } from "./curve";
import { keyRu } from "./names";

const moveMul = (c: Ctx) => Number(c.bal?.moveMul ?? 1);
const aggroMul = (c: Ctx) => Number(c.bal?.aggroMul ?? 1);
const hp = (c: Ctx, L: number) => evalCurve(c.bal?.mob?.hp ?? [[1, 50]], L, "loglog");
const dmg = (c: Ctx, L: number) => { const d = c.bal?.mob?.dmg ?? [5, 3]; return d[0] + d[1] * L; };
const hero = (c: Ctx) => BASE_PLAYER_SPEED * moveMul(c);

export interface MobKind {
  /** У боссов радиус замечания не умножается на aggroMul. */
  boss?: boolean;
  /** Что означает объект: «моб», «босс», «боец фракции». */
  who: string;
}

/** Правила для типовых полей существа: hp, dmg, armor, xp, gold, speed, chaseSpeed, aggro, range, attackCd, radius. */
export function creatureRules(prefix: string, who: string, o: { aggroFixed?: boolean } = {}): Rules {
  const P = (k: string) => `${prefix}.${k}`;
  return [
    [P("hp"), {
      title: "Здоровье (множитель)", kind: "num", unit: "множитель к HP моба своего уровня", min: 0.05, max: 2000, step: 0.05, sane: [0.4, 3],
      what: `Во сколько раз у «${who}» больше здоровья, чем у обычного моба того же уровня (базу даёт кривая balance.json mob.hp).`,
      live: (v, c) => `${num(v)}× HP моба своего уровня: на 10 ур. — ${num(hp(c, 10) * v, 0)} HP, на 30 ур. — ${num(hp(c, 30) * v, 0)}, на 60 ур. — ${num(hp(c, 60) * v, 0)}.`,
      up: "Крепче, бой с ним дольше.", down: "Падает от пары ударов.", links: "balance.json mob.hp; боссам добавляются bosses.<id>.hp и bosses.hpLevel.", seen: "Полоса здоровья над существом.",
    }],
    [P("dmg"), {
      title: "Урон удара (множитель)", kind: "num", unit: "множитель к удару моба своего уровня", min: 0.05, max: 100, step: 0.05, sane: [0.4, 3],
      what: `Во сколько раз удар «${who}» сильнее удара обычного моба того же уровня (база — balance.json mob.dmg).`,
      live: (v, c) => `${num(v)}× удара моба: на 10 ур. — около ${num(dmg(c, 10) * v, 0)} урона за удар, на 30 ур. — ${num(dmg(c, 30) * v, 0)}, на 60 ур. — ${num(dmg(c, 60) * v, 0)} (до брони героя).`,
      up: "Бьёт больнее.", down: "Бьёт слабее.", links: "balance.json mob.dmg; ударов в секунду — attackCd.", seen: "Красные числа урона над героем.",
    }],
    [P("armor"), {
      title: "Броня (множитель)", kind: "num", unit: "множитель к броне моба своего уровня", min: 0, max: 20, step: 0.05, sane: [0.3, 2.5],
      what: `Во сколько раз броня «${who}» выше обычной для его уровня; броня режет каждый удар героев.`,
      live: (v) => `${num(v)}× обычной брони: удары героев ${v > 1.05 ? "заметно слабее" : v < 0.95 ? "проходят легче" : "режутся как у обычного моба"}.`,
      up: "Слабые удары почти не проходят.", down: "Хрупкий: удары проходят почти полностью.", links: "shared/formulas.ts mobStats.", seen: "Урон героев по существу.",
    }],
    [P("xp"), {
      title: "Опыт за убийство (множитель)", kind: "num", unit: "множитель к опыту обычного моба", min: 0, max: 100, step: 0.05, sane: [0.5, 3],
      what: "Во сколько раз больше (или меньше) опыта даёт убийство по сравнению с обычным мобом того же уровня.",
      live: (v) => `${num(v)}× от обычного опыта: ${v >= 1.3 ? "награда щедрая" : v <= 0.8 ? "награда скромная" : "обычная награда"}; золото считается так же, если не задано отдельно.`,
      up: "Быстрее качаются, охота за этим существом выгоднее.", down: "Убивать невыгодно.", links: "shared/formulas.ts; золото — поле gold.", seen: "Полоса опыта после убийства.",
    }],
    [P("gold"), {
      title: "Золото за убийство (множитель)", kind: "num", unit: "множитель к золоту обычного моба", min: 0, max: 100, step: 0.05, sane: [0.5, 3],
      what: "Множитель золота; если не задан — берётся из xp.", live: (v) => `${num(v)}× от обычного золота с моба своего уровня.`, up: "Богаче добыча.", down: "Беднее.", links: "xp; economy в mounts.json (mobGoldMul).", seen: "Монеты после убийства.",
    }],
    [P("speed"), {
      title: "Скорость ходьбы", kind: "num", unit: "px/с до общего множителя moveMul", min: 0, max: 400, step: 1, sane: [40, 160],
      what: "Скорость шага. Число записано «до множителя» balance.json moveMul — в игре все ходят медленнее/быстрее на его долю.",
      live: (v, c) => {
        const m = moveMul(c), real = v * m;
        const rel = hero(c) > 0 ? real / hero(c) : 0;
        return `${v} → ходит ${num(v / TILE, 2)} клетки/с; с moveMul ${num(m)} — ${num(real, 1)} px/с = ${num(real / TILE, 2)} клетки/с. Герой пешком идёт ${num(hero(c) / TILE, 2)} клетки/с, поэтому ${rel > 1.02 ? `${who} быстрее героя на ${num((rel - 1) * 100, 0)} % — от него не убежать` : rel < 0.98 ? `${who} медленнее героя на ${num((1 - rel) * 100, 0)} % — от него можно убежать` : `${who} движется вровень с героем`}.`;
      },
      up: "Догоняет героя, труднее убежать.", down: "Медлительный, легко оббежать.", links: "balance.json moveMul; chaseSpeed — скорость в погоне; маунты — mounts.json speeds.", seen: "Как быстро идёт по земле, как легко убежать.",
    }],
    [P("chaseSpeed"), {
      title: "Скорость в погоне", kind: "num", unit: "px/с до множителя moveMul", min: 0, max: 600, step: 1, sane: [80, 220],
      what: "Скорость, когда боец гонится за врагом (обычно выше обычной ходьбы).",
      live: (v, c) => `${v} → в погоне ${num(v * moveMul(c), 1)} px/с = ${num((v * moveMul(c)) / TILE, 2)} клетки/с; герой пешком — ${num(hero(c) / TILE, 2)} клетки/с${v * moveMul(c) > hero(c) ? ", то есть догоняет пешего героя" : ", пешего героя не догнать"}.`,
      up: "Труднее убежать.", down: "От погони уходят.", links: "moveMul; маунт (mounts.json speeds) обгоняет погоню.", seen: "Погоня за героем.",
    }],
    [P("aggro"), {
      title: "Радиус «замечания» героя", kind: "num", unit: "px мира (клетка = 32 px)", min: 0, max: 1200, step: 5, sane: [100, 400],
      what: "С какого расстояния существо замечает героя и нападает. Спящие дальше — не видят.",
      live: (v, c, ) => {
        const m = o.aggroFixed || c.parent?.boss ? 1 : aggroMul(c);
        const base = `${v} → замечает героя примерно за ${num(v / TILE, 2)} клетки`;
        return m === 1 ? `${base} (множитель aggroMul к ${who} не применяется).` : `${base} (с учётом aggroMul ${num(m)} → ${num((v * m) / TILE, 2)} клетки).`;
      },
      up: "Замечает издалека: сложнее проскочить мимо.", down: "Подпускает вплотную.", links: "balance.json aggroMul (только обычные мобы); погоня и поводок считаются от прежнего значения.", seen: "Расстояние, на котором лагерь «просыпается».",
    }],
    [P("range"), {
      title: "Дальность удара", kind: "num", unit: "px мира", min: 0, max: 1200, step: 2, sane: [20, 400],
      what: "С какого расстояния существо бьёт. Малое число — ближний бой, большое — стрелок или маг.",
      live: (v) => `${v} px = ${num(v / TILE, 2)} клетки: ${v <= 48 ? "ближний бой, стоит вплотную" : v <= 120 ? "короткая дальность (копьё, плеть)" : "дальний бой: стреляет или колдует издалека"}.`,
      up: "Бьёт издалека, труднее подойти.", down: "Нужно подойти вплотную.", links: "projectile — вид снаряда у стрелков.", seen: "Откуда летит снаряд или куда бьёт.",
    }],
    [P("attackCd"), {
      title: "Пауза между ударами", kind: "num", unit: "секунды", min: 0.2, max: 10, step: 0.05, sane: [0.8, 3],
      what: "Как часто существо бьёт.", live: (v) => `Бьёт раз в ${num(v)} ${plural(v, "секунду", "секунды", "секунд")} — ${num(1 / v, 2)} удара в секунду.`, up: "Бьёт реже, урон в секунду меньше.", down: "Бьёт часто, урон в секунду выше.", links: "dmg — урон одного удара.", seen: "Темп ударов по герою.",
    }],
    [P("radius"), {
      title: "Размер тела", kind: "num", unit: "px мира", min: 2, max: 200, step: 1, sane: [8, 60],
      what: "Радиус «тела»: как близко можно подойти, как далеко достаёт попадание и насколько существа теснятся.", live: (v) => `Радиус ${v} px = ${num(v / TILE, 2)} клетки; поперёк — ${num((2 * v) / TILE, 2)} клетки.`, up: "Крупнее, легче попасть.", down: "Мелкий, труднее попасть.", links: "size — размер кадра спрайта.", seen: "Круг под ногами при выборе цели.",
    }],
  ];
}

/** Словарь типовых имён полей для любого файла: используется, когда явного правила нет. */
const NAMES: Record<string, Partial<Doc>> = {
  id: { title: "Идентификатор", what: "Внутреннее имя: по нему данные связаны друг с другом. Менять нельзя, не поправив все ссылки." },
  name: { title: "Название", what: "Как называется в игре; видно игроку." },
  title: { title: "Звание, подпись", what: "Подпись рядом с названием; видно игроку." },
  desc: { title: "Описание", what: "Текст в подсказке; видно игроку." },
  lore: { title: "Предание", what: "Лор: история существа или места для книг и подсказок." },
  icon: { title: "Иконка", what: "Имя картинки в client/public/assets/icons." },
  sprite: { title: "Спрайт", what: "Имя картинки-листа персонажа в client/public/assets." },
  color: { title: "Цвет", what: "Цвет точки на карте и в подсказках, вид #rrggbb." },
  tint: { title: "Оттенок", what: "Цветовой оттенок спрайта, вид 0xrrggbb." },
  level: { title: "Уровень", what: "Уровень героя или существа.", unit: "уровень", sane: [1, 100] },
  lvl: { title: "Уровень", what: "С какого уровня доступно.", unit: "уровень", sane: [1, 100] },
  minLevel: { title: "Минимальный уровень", what: "С какого уровня начинает действовать.", unit: "уровень", sane: [1, 100] },
  price: { title: "Цена", what: "Стоимость в золоте.", unit: "золото", min: 0 },
  gold: { title: "Золото", what: "Сумма в золоте.", unit: "золото", min: 0 },
  chance: { title: "Шанс", what: "Вероятность события от 0 до 1 (0,05 = 5 %).", unit: "вероятность 0–1", min: 0, max: 1, step: 0.001 },
  dropChance: { title: "Шанс выпадения", what: "Вероятность выпадения при убийстве (0,12 = 12 %).", unit: "вероятность 0–1", min: 0, max: 1, step: 0.001 },
  respawnMs: { title: "Возрождение", what: "Через сколько после гибели появляется снова.", unit: "миллисекунды", min: 0 },
  respawnMin: { title: "Возрождение", what: "Через сколько минут павший возвращается.", unit: "минуты", min: 0 },
  windupMs: { title: "Предупреждение", what: "Сколько миллисекунд виден знак на земле до удара.", unit: "миллисекунды", min: 0 },
  castMs: { title: "Время каста", what: "Сколько миллисекунд длится заклинание или призыв.", unit: "миллисекунды", min: 0 },
  every: { title: "Откат", what: "Как часто применяется умение.", unit: "секунды", min: 0 },
  faction: { title: "Фракция", what: "К какой фракции относится: solgard (Сольгард) или umbrath (Умбрат); пусто — нейтральная." },
  cat: { title: "Категория", what: "Вид предмета: меч, посох, броня и т. п." },
  cls: { title: "Классы", what: "Для каких классов рекомендовано." },
  fac: { title: "Стиль внешности", what: "Фракционный стиль; на характеристики не влияет." },
  affix: { title: "Приоритет бонусов", what: "Какие характеристики предмет получает в первую очередь." },
  size: { title: "Размер / количество", what: "Размер кадра (1 — 32×32, 2 — 64×64, 4 — 128×128) или число бойцов — смотря в каком разделе." },
  tier: { title: "Ярус", what: "Редкость: common, uncommon, rare, epic, legendary." },
  boss: { title: "Босс", what: "Включено — это босс: опыт, добыча и радиус замечания считаются по правилам боссов." },
  flying: { title: "Летающий", what: "Включено — парит над землёй и обходит препятствия." },
  rarity: { title: "Редкость", what: "r0 — обычная, r1 — необычная, r2 — редкая, r3 — эпическая, r4 — легендарная." },
  slot: { title: "Ячейка", what: "Куда надевается." },
  prop: { title: "Особое свойство", what: "Описание уникального эффекта предмета." },
  greeting: { title: "Приветствие", what: "Фраза при начале разговора." },
  at: { title: "Позиция", what: "Координаты [x, y] от центра города в клетках." },
  from: { title: "Начало", what: "Откуда: номер вершины дороги." },
  to: { title: "Конец", what: "Докуда: номер вершины дороги." },
  mirror: { title: "Зеркальная дорога", what: "Такой же участок у другой фракции." },
  road: { title: "Дорога", what: "Имя дороги из data/world.json." },
};

/** Подсказки по единицам из имени поля (если явного правила нет). */
export function guessDoc(key: string, v: unknown, file: string): Doc {
  const known = NAMES[key];
  const isNum = typeof v === "number";
  const base: Doc = {
    title: known?.title ?? keyRu(key).text,
    what: known?.what ?? (isNum ? "Число. Подробного объяснения для этого поля пока нет — смотрите подсказку раздела выше." : typeof v === "boolean" ? "Переключатель: включено или выключено." : "Текст."),
    kind: isNum ? "num" : typeof v === "boolean" ? "bool" : typeof v === "string" ? "text" : undefined,
    unit: known?.unit ?? unitFromName(key, v),
    min: known?.min, max: known?.max, step: known?.step, sane: known?.sane,
  };
  const ms = /Ms$/.test(key), px = /(Px|R)$/.test(key), pctn = /(Pct|Chance|Share)$/.test(key);
  if (isNum && base.unit === undefined) {
    if (ms) base.unit = "миллисекунды";
    else if (px) base.unit = "px мира";
    else if (pctn) base.unit = "доля или процент";
  }
  if (isNum && ms) base.live = (x) => `${num(x / 1000, 2)} с`;
  else if (isNum && px) base.live = (x) => `${x} px ≈ ${cells(x)}`;
  void file;
  return base;
}
function unitFromName(key: string, v: unknown): string | undefined {
  if (typeof v !== "number") return undefined;
  if (/Ms$/.test(key)) return "миллисекунды";
  if (/(Px|px)$/.test(key)) return "px мира";
  return undefined;
}
export function humanize(key: string): string {
  if (/^\d+$/.test(key)) return `№ ${Number(key) + 1}`;
  return key.replace(/^_+/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}
