/** Обозначения бафов и дебафов на юнитах (задача 129, шаг 1: дизайн и превью, в игру ничего не кладётся).
 *  Запуск: tsx tools/gen/aura-fx.ts [--only=key1,key2] (с --only — только превью этих ключей в tools/out/aura-preview/dev/).
 *  Пишет: data/aura-fx.json (таблица), tools/out/aura-fx/aura-<ключ>[-слой][-x3].png (листы: кадры подряд),
 *  tools/out/aura-preview/{all,all-z3,classes,common,debuffs,zones,stack,compare}.png, classes/<класс>.png, compare/<ключ>.png, audit.md
 *  (пары, похожесть силуэтов, замеры анимации). compare.png — «наш | эталон» для доработанных по замечаниям и 10 характерных.
 *  Рисунки — aura-art-a.ts (круги, предметы орбит), aura-art-b.ts (купола, щиты, значки, частицы на теле), aura-art-c.ts (зоны), основа — aura-lib.ts.
 *  Превью собирается так же, как будет в клиенте: слой плотности 2 на зуме 2 — пиксель в пиксель, на зуме 3 — лист ×3; орбиты и покачивание
 *  считаются по времени с шагом в пиксель холста; над героем — ник и полоска здоровья, значки — над подписью. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC } from "./canvas";
import { readPng, paintGround, scaleNN, fill, drawText, peakIndex, unionBox, BG, BEIGE, GOLD, stackV } from "./vfx-lib";
import { runeSet, orbitPreview } from "./vfx-gen2";
import { RP, TAU, withA, EASE, type Art, type Layer, type At, type RGBA } from "./aura-lib";
import * as A from "./aura-art-a";
import * as B from "./aura-art-b";
import * as C from "./aura-art-c";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "tools/out/aura-preview"), SHEETS = path.join(ROOT, "tools/out/aura-fx");

type Group = "buff" | "debuff" | "common" | "zone";
type Kind = "ring" | "shield" | "overlay" | "orbit";
interface SpecIn {
  key: string; name: string; src: string; cls: string; group: Group; kind: Kind; slot: "ring" | "dome" | "overlay"; at: At;
  theme: string; prio: number; motion: string; look: string;
  /** Эталон из пака (путь от vendor/) и кадр (по умолчанию — пик). */
  ref: string; refFrame?: number | number[]; refSize?: [number, number];
  /** Цикл aura умения в data/skill-fx.json, который это обозначение заменяет на герое. */
  replaces?: string;
  note?: string; stacks?: number; art: () => Art;
  /** Герой на превью, если не совпадает с классом темы. */
  hero?: string;
  /** Альфа героя на превью (скрытность: в игре герой 0,4). */
  heroA?: number;
}
interface Spec extends Omit<SpecIn, "art"> { art: Art }

/** Руны рыцаря смерти — те же листы и та же орбита, что в игре (aura-runes-frost и -x3): рисуются формулой клиента (orbitPreview). */
function runesArt(): Art {
  const g = runeSet(), o = g.orbit!;
  const lay: Layer = { id: "runes", frames: g.frames, w: g.w, h: g.h, dens: 2, hi: runeSet(3).frames, hw: runeSet(3).w, hh: runeSet(3).h, fps: 12, anchor: [0.5, 0.5], at: "feet", z: "over",
    orbit: { n: o.n, kinds: 4, rx: o.rx, ry: o.ry, oy: o.oy, period: o.period, bob: o.bob, bobPeriod: o.bobPeriod, backAlpha: o.back, face: "shimmer" } };
  return { id: "runeblade", layers: [lay], ease: { fadeIn: 350, fadeOut: 350, scaleIn: 0.6 } };
}

const NV = "vfx-ninja/src/Ninja Adventure - Asset Pack/FX/";
const SPECS_IN: SpecIn[] = [
  // ---------- храмовник (warrior): золото света, солнце, лазурь щита ----------
  { key: "invuln", name: "Божественный щит", src: "tp_divine", cls: "warrior", group: "buff", kind: "shield", slot: "dome", at: "body", theme: "holy", prio: 100, motion: "лучи-клинья дышат волной и поворачиваются на шаг за цикл, по ободу бегут два блика; у вершины лучей нет", look: "золотой купол: обод 3 px в 4 тона, верх на y − 33 (под ником), мягкое свечение внутри, непрозрачные лучи по бокам и снизу", ref: "vfx-sds-holy/src/HolyNova/Spritesheet/HolyNova_spritesheet.png", refFrame: 3, replaces: "bubble-holy", art: B.domeInvuln },
  { key: "block", name: "Щитовой блок", src: "shieldblock", cls: "warrior", group: "buff", kind: "shield", slot: "dome", at: "body", theme: "paladin", prio: 68, motion: "щит покачивается (в коде), по золотому ободу ползёт свет, мягкий блик раз в цикл", look: "геральдический щит 14×18 у левой руки: лазурное поле, золотой обод, рельефный крест", ref: "7soul1/src/E_Gold01.png", replaces: "bubble-steel", art: B.shieldBlock },
  { key: "laststand", name: "Последний рубеж", src: "laststand", cls: "warrior", group: "buff", kind: "overlay", slot: "overlay", at: "head", theme: "paladin", prio: 50, motion: "удар сердца «тук-тук» (easing): сердце набухает и вспыхивает, за щитом раскрывается сияние в 4 ступени, по ободу обходит блик", look: "значок над подписью (не круг): золотой геральдический щит с тёмно-багровым полем и рубиновым сердцем", ref: "7soul1/src/E_Gold01.png", art: B.ovLastStand },
  { key: "tp_banner", name: "Знамя защиты", src: "tp_banner", cls: "warrior", group: "buff", kind: "ring", slot: "ring", at: "feet", theme: "holy", prio: 45, motion: "вымпелы полощутся по ветру (фазы разнесены), по витому шнуру бегут два блика, эмблема фракции светится", look: "кольцо из флажков: шесть вымпелов слоновой кости на золотых древках по эллипсу, витой золотой шнур 2 px, эмблема фракции на передней кромке", ref: "vfx-sds-holy/src/HolyNova/Spritesheet/HolyNova_spritesheet.png", refFrame: 3, note: "у храмовника, поставившего знамя; у остальных в круге — zone_banner_<фракция>", art: A.ringStandard },
  // ---------- целитель: мягкий белый свет, золото ----------
  { key: "shield", name: "Щит", src: "holyshield", cls: "healer", group: "buff", kind: "shield", slot: "dome", at: "body", theme: "holy", prio: 66, motion: "блик бежит по ободу, крест на нижнем ободе дышит в 4 ступени, искры 2×2 вспыхивают и гаснут", look: "прозрачный купол с бело-золотым ободом (верх на y − 33), крест 7×7 — на нижнем ободе спереди, далеко от подписи", ref: "vfx-sds-holy/src/HolyShield/Spritesheet/HolyShield_spritesheet.png", refFrame: 5, replaces: "bubble-holy", art: B.domeHealShield },
  { key: "bless", name: "Благословение", src: "cl_blessing", cls: "healer", group: "buff", kind: "orbit", slot: "overlay", at: "body", theme: "holy", prio: 35, motion: "четыре золотые звезды-искры кружат над плечами (орбита в коде), мерцают", look: "орбита золотых четырёхлучевых искр", ref: NV + "Magic/Spark/SpriteSheet.png", replaces: "aura-runes-holy", art: A.orbSparks },
  { key: "renew", name: "Обновление", src: "renew", cls: "healer", group: "buff", kind: "overlay", slot: "overlay", at: "body", theme: "nature", prio: 30, motion: "кресты поднимаются по краям силуэта и гаснут (easing)", look: "зелёно-белые кресты 7×7 со светлым ядром", ref: "vfx-sds-holy/src/Heal/Spritesheet/Heal_spritesheet.png", replaces: "holy-heal", art: B.ovRenew },
  // ---------- маг ----------
  { key: "rhythm", name: "Стихийный ритм", src: "mg_rhythm", cls: "mage", group: "buff", kind: "orbit", slot: "overlay", at: "body", theme: "arcane", prio: 40, motion: "сферы по числу зарядов кружат (орбита в коде), внутри переливается стихия", look: "огонь, лёд и арканум: сферы 6×6 с бликом", ref: "vfx-foozle-magic/src/Foozle_2DE0001_Pixel_Magic_Effects/Water/001.png", stacks: 3, art: A.orbArcane },
  { key: "block@mage", name: "Чародейский барьер", src: "mg_barrier", cls: "mage", group: "buff", kind: "shield", slot: "dome", at: "body", theme: "arcane", prio: 67, motion: "по рёбрам сот бежит волна яркости; трижды за цикл в новом месте обода бьёт молния и гаснет за 3 кадра", look: "купол с ободом 2 px (верх на y − 33); у края — светлые рёбра сот в 2 тона (лазурь и пурпур) без заливки; молния — ломаная 2 px с белым ядром, голубым ореолом и двумя ветками", ref: "vfx-pimen-thunder1/src/Thunder Effect 01/Thunder Hit/Thunder hit wo blur.png", refFrame: [1, 2], replaces: "bubble-arcane", art: B.domeBarrierMage },
  { key: "timewarp", name: "Искажение времени", src: "mg_timewarp", cls: "mage", group: "buff", kind: "ring", slot: "ring", at: "feet", theme: "arcane", prio: 41, motion: "свет перескакивает по 12 засечкам циферблата (тик), две дуги идут навстречу", look: "тайный циферблат под ногами", ref: "7soul1/src/I_Clock.png", note: "баф самого мага; враги в поле искажения получают zone_time", art: A.ringTimewarp },
  // ---------- разбойник ----------
  { key: "dance", name: "Танец теней", src: "as_dance", cls: "rogue", group: "buff", kind: "orbit", slot: "overlay", at: "body", theme: "shadow", prio: 85, motion: "четыре сюрикена вращаются (8 кадров на четверть оборота, 15 к/с) и быстро кружат (орбита в коде)", look: "стальные сюрикены с фиолетовым сердечником", ref: NV + "Magic/Spark/SpriteSheet.png", art: A.orbBlades },
  { key: "as_ambush", name: "Засада", src: "as_ambush", cls: "rogue", group: "buff", kind: "overlay", slot: "overlay", at: "head", theme: "shadow", prio: 25, motion: "алая искра в перекрестье набирает яркость в 6 ступеней и гаснет", look: "скрещённые кинжалы", ref: "7soul1/src/S_Dagger02.png", art: B.ovAmbush },
  { key: "stealth", name: "Скрытность", src: "stealth", cls: "rogue", group: "buff", kind: "overlay", slot: "overlay", at: "body", theme: "shadow", prio: 90, motion: "три клуба дыма рождаются у краёв силуэта, растут, поднимаются и растворяются сжатием и дизером за 3 кадра", look: "клубы 6–8 px: непрозрачное ядро в 3 тона (тёмно-сизый, сизый, блик) и тёмная кромка 1 px; без альфы, читаются на герое с альфой 0,4", ref: "vfx-pimen-smoke/src/Smoke Effect 01/Smoke VFX 2.png", heroA: 0.4, art: B.ovStealth },
  { key: "critnext", name: "Гарантированный крит", src: "shadowstep", cls: "rogue", group: "buff", kind: "overlay", slot: "overlay", at: "hand", theme: "shadow", prio: 24, motion: "восьмилучевая звезда поворачивается (12 кадров на 45°), ореол дышит", look: "алая звезда 10 px с ореолом у руки", ref: NV + "Magic/Circle/SpriteSheetSpark.png", art: B.ovCrit },
  // ---------- следопыт ----------
  { key: "trickroll", name: "Ловкий отскок", src: "hr_trickroll", cls: "ranger", group: "buff", kind: "ring", slot: "ring", at: "feet", theme: "nature", prio: 30, motion: "шесть листьев скользят по кольцу (в коде) и покачиваются", look: "светлое кольцо 2 px с контуром, листья 6 px в 3 тона", ref: NV + "Elemental/Plant/SpriteSheet.png", art: A.ringTrickroll },
  { key: "steady", name: "Стойка стрелка", src: "hr_steady", cls: "ranger", group: "buff", kind: "ring", slot: "ring", at: "feet", theme: "nature", prio: 31, motion: "четыре засечки прицела сходятся к герою и расходятся (easing)", look: "кольцо-прицел из коры и листвы", ref: NV + "Magic/Circle/SpriteSheetSpark.png", art: A.ringSteady },
  { key: "barrage", name: "Ураганный огонь", src: "hr_barrage", cls: "ranger", group: "buff", kind: "orbit", slot: "overlay", at: "body", theme: "nature", prio: 43, motion: "три стрелы носятся вокруг (орбита в коде), кадр — по направлению полёта", look: "стрелы с зелёным оперением", ref: NV + "Elemental/Plant/SpriteSheet.png", art: A.orbArrows },
  // ---------- рыцарь смерти ----------
  { key: "bone", name: "Броня из костей", src: "dk_bone_armor", cls: "deathknight", group: "buff", kind: "orbit", slot: "dome", at: "body", theme: "death", prio: 70, motion: "три щитка медленно кружат у пояса (орбита в коде, rx 17), по гребню стекает морозный блик", look: "костяные щитки-наплечники 7×9 в 5 тонов: гребень с канавкой, иней по верхнему краю, тень снизу справа", ref: "7soul1/src/E_Bones02.png", replaces: "bubble-bone", art: A.orbBones },
  { key: "antimagic", name: "Антимагический панцирь", src: "dk_anti_magic", cls: "deathknight", group: "buff", kind: "shield", slot: "dome", at: "body", theme: "death", prio: 69, motion: "свет обходит руны по очереди: руна разгорается в 4 ступени, вокруг вспыхивает ореол; по ободу бежит блик", look: "ледяная сфера со сплошным ободом (верх на y − 33), на ободе — пять рун-плиток 5×6 (руна 3×4 в 3 тона, контур); героя ничто не режет", ref: "vfx-srzolda/blue_idle_Sheet.png", replaces: "bubble-arcane", art: B.domeAntiMagic },
  { key: "runeblade", name: "Рунный клинок", src: "dk_rune_blade", cls: "deathknight", group: "buff", kind: "orbit", slot: "overlay", at: "feet", theme: "death", prio: 55, motion: "четыре руны кружат, мерцают (уже в игре)", look: "светящиеся руны с белым ядром", ref: "7soul1/src/I_Crystal01.png", replaces: "aura-runes-frost", art: runesArt },
  { key: "blood_tap", name: "Пожирание боли", src: "dk_blood_tap", cls: "deathknight", group: "buff", kind: "overlay", slot: "overlay", at: "body", theme: "death", prio: 34, motion: "три капли по спирали втягиваются к груди (хвост 2 px укорачивается, капля сжимается), у груди вспыхивает голубая искра 5×5", look: "крупные капли крови 4×5 в 4 тона с бликом и контуром, мертвенно-голубая искра у груди", ref: "vfx-pimen-dark/src/Dark VFX 1/Dark VFX 1 (40x32).png", art: B.ovBloodTap },
  // ---------- кровоплёт ----------
  { key: "dmgboost", name: "Прилив сил", src: "bw_gift", cls: "bloodweaver", group: "buff", kind: "overlay", slot: "overlay", at: "head", theme: "blood", prio: 42, motion: "сила поднимается снизу вверх: шевроны по очереди разгораются в 4 ступени и остывают, у верхнего на пике — искра", look: "значок над подписью (не круг): три багровых шеврона-стрелы вверх в 3–4 тона с фаской и контуром", ref: "7soul1/src/S_Buff14.png", art: B.ovMight },
  { key: "bond", name: "Кровавые узы", src: "bw_blood_bond", cls: "bloodweaver", group: "buff", kind: "overlay", slot: "overlay", at: "head", theme: "blood", prio: 28, motion: "сердце бьётся (удар и затухание), блик бежит по звеньям", look: "сердце, обвитое цепью из пяти звеньев", ref: "7soul1/src/S_Holy01.png", art: B.ovBond },
  { key: "tide", name: "Алый прилив", src: "bw_tide", cls: "bloodweaver", group: "buff", kind: "orbit", slot: "overlay", at: "body", theme: "blood", prio: 38, motion: "три сферы крови кружат (орбита в коде), с каждой срывается и гаснет капля", look: "сферы крови 7 px в 4 тона с бликом", ref: "vfx-foozle-magic/src/Foozle_2DE0001_Pixel_Magic_Effects/Water/001.png", replaces: "ring-blood", art: A.orbBlood },
  { key: "blood_circle", name: "Кровный круг", src: "bw_blood_circle", cls: "bloodweaver", group: "buff", kind: "ring", slot: "ring", at: "feet", theme: "blood", prio: 39, motion: "по жиле раз за цикл обходит волна пульса: жила светлеет, узлы-капли набухают и опадают (easing), глянец скользит", look: "лужа тёмной крови под ногами: по краю жила 2 px с шестью узлами-каплями, внутри — тёмная кровь с глянцем", ref: NV + "Magic/Circle/SpriteSheetOrange.png", replaces: "ring-blood", art: A.ringBloodCircle },
  // ---------- тёмный следопыт ----------
  { key: "dr_ambush", name: "Засада (тёмный следопыт)", src: "dr_ambush", cls: "darkranger", group: "buff", kind: "overlay", slot: "overlay", at: "head", theme: "shadow", prio: 24, motion: "фиолетовый свет пробегает по стреле, перо светится", look: "стрела по диагонали с фиолетовым оперением, 14 px", ref: "7soul1/src/I_Feather01.png", art: B.ovAmbushDark },
  { key: "meld", name: "Мастер теней", src: "dr_shadow_mastery", cls: "darkranger", group: "buff", kind: "ring", slot: "ring", at: "feet", theme: "shadow", prio: 44, motion: "три полумесяца скользят по кольцу (в коде), два пера на кромке", look: "сиреневое кольцо 2 px с контуром, полумесяцы в 3 тона", ref: "vfx-srzolda/purple_idle_Sheet.png", art: A.ringMeld },
  // ---------- чернокнижник ----------
  { key: "meta", name: "Метаморфоза", src: "wl_meta", cls: "warlock", group: "buff", kind: "shield", slot: "dome", at: "body", theme: "shadow", prio: 80, motion: "дымные языки поднимаются по краям силуэта и отрывают клочки; ядро скверны у земли пульсирует в 5 ступеней, из него поднимаются искры", look: "фиолетовые языки-дымки по краям силуэта (4 тона), зелёное ядро у ног; рогов нет — ничего не выходит за голову", ref: "vfx-pimen-dark/src/Dark VFX 2/Dark VFX 2 (48x64).png", replaces: "dark-wraith", art: B.domeMeta },
  { key: "shards", name: "Осколки душ", src: "wl_shards", cls: "warlock", group: "buff", kind: "orbit", slot: "overlay", at: "body", theme: "shadow", prio: 36, motion: "черепа по числу осколков кружат (орбита в коде), за каждым — хвост зелёного пламени", look: "черепа в 4 тона с зелёным огнём", ref: "vfx-pimen-dark/src/Dark VFX 1/Dark VFX 1 (40x32).png", stacks: 3, art: A.orbSouls },
  // ---------- потрошитель ----------
  { key: "frenzy", name: "Кровавое безумие", src: "rv_frenzy", cls: "reaver", group: "buff", kind: "ring", slot: "ring", at: "feet", theme: "blood", prio: 48, motion: "пульс яркости в 5 ступеней (нарастание 3 кадра, спад 9, easing), зубья стоят на месте, брызги 2×2 разлетаются и гаснут дизером", look: "багровое рваное кольцо, стальные клинки-зубцы на передней кромке", ref: NV + "Magic/Aura/SpriteSheet.png", replaces: "aura-rage", art: A.ringFrenzy },
  { key: "massacre", name: "Кровавая бойня", src: "rv_massacre", cls: "reaver", group: "buff", kind: "ring", slot: "ring", at: "feet", theme: "blood", prio: 49, motion: "две дуги-взмаха клинков носятся вокруг ног (15° за кадр): задние под героем, передние перед ним", look: "вихрь клинков", ref: "vfx-pimen-smear/src/Smear VFX 01/Smear 01 Horizontal 1.png", replaces: "tornado-blood", art: A.ringMassacre },
  { key: "fury", name: "Разъярённый", src: "rv_fury_stack", cls: "reaver", group: "buff", kind: "overlay", slot: "overlay", at: "head", theme: "blood", prio: 33, motion: "три огненных когтя наливаются жаром и остывают (6 ступеней), стаки — точками", look: "пламенные когти", ref: NV + "Attack/ClawDouble/SpriteSheet.png", stacks: 4, art: B.ovFury },
  // ---------- общие ----------
  { key: "leg_barrier", name: "Барьер реликвии", src: "легендарная вещь", cls: "common", group: "common", kind: "shield", slot: "dome", at: "body", theme: "holy", prio: 60, motion: "блик 3×3 бежит по внешнему ребру с затухающим хвостом, раз в цикл на верхнем левом углу вспыхивает искра", look: "гранёный кристалл-шестигранник (верх на y − 33): грани с объёмом — верхние светлее, нижние темнее (4 тона), рёбра между гранями, середина прозрачна", ref: "7soul1/src/I_Crystal01.png", art: B.domeRelic },
  { key: "leg_frenzy", name: "Исступление", src: "легендарная вещь", cls: "common", group: "common", kind: "overlay", slot: "overlay", at: "hand", theme: "fire", prio: 26, motion: "три языка пламени бегут по кругу (10° за кадр)", look: "огненное колесо 15 px у руки", ref: "vfx-foozle-magic/src/Foozle_2DE0001_Pixel_Magic_Effects/Fire_Ball/003.png", stacks: 3, art: B.ovLegFrenzy },
  { key: "haste", name: "Ускорение", src: "общее", cls: "common", group: "common", kind: "overlay", slot: "overlay", at: "feet", theme: "phys", prio: 20, motion: "веер крылышек раскрывается и складывается (взмах, easing), штрихи скорости 2 px уносятся назад и укорачиваются", look: "крылышки у пяток: по 4 сужающихся пера внахлёст в 3 тона с голубым ободом, золотая застёжка", ref: "vfx-sds-levelup/src/Level Up Effect/Spritesheet/Level Up Effect Spritesheet.png", refFrame: 6, art: B.ovHaste },
  { key: "warcry", name: "Вой питомца", src: "питомец", cls: "common", group: "common", kind: "overlay", slot: "overlay", at: "head", theme: "fire", prio: 18, motion: "дуги звука расходятся в обе стороны и гаснут", look: "лапа зверя и дуги звука", ref: "7soul1/src/I_RabbitPaw.png", art: B.ovWarcry },
  { key: "food", name: "Еда", src: "еда", cls: "common", group: "common", kind: "overlay", slot: "overlay", at: "hand", theme: "fire", prio: 5, motion: "клубы пара поднимаются и тают", look: "миска у руки, пар", ref: "vfx-pimen-smoke/src/Smoke Effect 01/Smoke VFX3.png", art: B.ovFood },
  { key: "potion", name: "Зелье", src: "зелье", cls: "common", group: "common", kind: "overlay", slot: "overlay", at: "head", theme: "frost", prio: 5, motion: "склянка покачивается (в коде), внутри поднимаются пузырьки, по стеклу скользит блик", look: "склянка 10×14", ref: "vfx-foozle-magic/src/Foozle_2DE0001_Pixel_Magic_Effects/Water/001.png", art: B.ovPotion },
  { key: "mount", name: "Маунт и питомец", src: "маунт", cls: "common", group: "common", kind: "overlay", slot: "overlay", at: "feet", theme: "phys", prio: 3, motion: "клубы пыли вылетают из-под копыт назад и гаснут; стоит — не рисуется", look: "пыльная дуга за копытами", ref: NV + "Smoke/SmokeCircular/SpriteSheet.png", art: B.ovMount },
  // ---------- дебафы (предложение) ----------
  { key: "stun", name: "Оглушение", src: "дебаф", cls: "debuff", group: "debuff", kind: "orbit", slot: "overlay", at: "head", theme: "holy", prio: 95, motion: "три звезды кружат над подписью (орбита в коде), мерцают", look: "жёлтые звёзды в 3 тона с бликом", ref: NV + "Magic/Spark/SpriteSheet.png", art: A.orbStun },
  { key: "root", name: "Корни", src: "дебаф", cls: "debuff", group: "debuff", kind: "ring", slot: "ring", at: "feet", theme: "nature", prio: 60, motion: "петли у сапог сжимаются по синусу в 3 ступени и подрагивают, боковые корни качаются, шипы мерцают, комья земли осыпаются; кадры не повторяются", look: "толстые корни из земли обвивают сапоги спереди", ref: "vfx-foozle-magic/src/Foozle_2DE0001_Pixel_Magic_Effects/Earth_Spike/005.png", art: A.ringRoot },
  { key: "slow", name: "Замедление", src: "дебаф", cls: "debuff", group: "debuff", kind: "ring", slot: "ring", at: "feet", theme: "frost", prio: 58, motion: "блик скользит по кристаллам и кольцу инея", look: "кольцо инея 2 px и ледяные кристаллы на передней кромке", ref: "vfx-pimen-ice/src/Ice Effect 01/Ice VFX 2/Ice VFX 2 Active.png", art: A.ringSlow },
  { key: "weak", name: "Ослабление", src: "дебаф", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "shadow", prio: 40, motion: "трещина сломанного меча тлеет фиолетовым, обломок чуть опускается", look: "сломанный меч 14 px", ref: "7soul1/src/S_Sword01.png", art: B.ovWeak },
  { key: "poison", name: "Яд", src: "дебаф", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "body", theme: "poison", prio: 35, motion: "полупрозрачные пузыри поднимаются по краям силуэта и лопаются", look: "зелёные пузыри у ног и по бокам", ref: "vfx-sds-poison/src/Poison Spells minipack/Spritesheets/PoisonMagicEffect_spritesheet.png", art: B.ovPoison },
  { key: "venom", name: "Ядовитый клинок", src: "дебаф (разбойник)", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "poison", prio: 36, motion: "капля яда по очереди набухает на кончике то одного, то другого клыка, срывается между ними и гаснет сжатием; стаки — точками", look: "два изогнутых змеиных клыка в 3 тона с контуром, загнуты внутрь, острые; зелёная капля яда", ref: "7soul1/src/I_Fang.png", stacks: 3, art: B.ovVenom },
  { key: "bleed", name: "Кровотечение", src: "дебаф", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "body", theme: "blood", prio: 37, motion: "капли срываются с краёв силуэта, падают и разбиваются у ног", look: "капли крови 3×4 с бликом", ref: "vfx-foozle-magic/src/Foozle_2DE0001_Pixel_Magic_Effects/Water/001.png", art: B.ovBleed },
  { key: "burn", name: "Горение", src: "дебаф", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "body", theme: "fire", prio: 38, motion: "языки пламени колышутся и поднимаются, угольки гаснут", look: "четыре языка-капли по краям силуэта: ядро → жёлтый → оранжевый → красный", ref: NV + "Particle/Fire.png", art: B.ovBurn },
  { key: "curse", name: "Проклятие", src: "дебаф", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "shadow", prio: 39, motion: "печать медленно поворачивается (6° за кадр), сердцевина дышит", look: "фиолетовая печать с пентаграммой", ref: "vfx-srzolda/purple_idle_Sheet.png", art: B.ovCurse },
  { key: "hex", name: "Проклятие рока", src: "wl_hex (дебаф)", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "shadow", prio: 41, motion: "зелёное пламя скверны колышется в перевёрнутом треугольнике", look: "фиолетовый знак рока с огнём скверны", ref: "vfx-pimen-dark/src/Dark VFX 2/Dark VFX 2 (48x64).png", art: B.ovHex },
  { key: "hunter_mark", name: "Метка охотника", src: "hr_mark (дебаф)", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "nature", prio: 42, motion: "прицел сжимается к цели и разжимается (easing), яркость в 5 ступеней", look: "янтарный прицел с четырьмя засечками", ref: NV + "Magic/Circle/SpriteSheetSpark.png", art: B.ovHunterMark },
  { key: "shock", name: "Шок", src: "mg_conduction (дебаф)", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "arcane", prio: 41, motion: "молния вспыхивает, по ней бегут искры", look: "голубая молния с белым ядром", ref: "vfx-pimen-thunder1/src/Thunder Effect 01/Thunder Hit/Thunder hit wo blur.png", art: B.ovShock },
  { key: "mortality", name: "Знак смерти", src: "dk_mortality (дебаф)", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "death", prio: 43, motion: "череп на руне светится, свет дышит; метки — точками", look: "рунная плитка рыцаря смерти с черепом", ref: "7soul1/src/E_Bones03.png", stacks: 2, art: B.ovMortality },
  { key: "outlaw", name: "Вне закона", src: "дебаф", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "blood", prio: 70, motion: "печать наливается красным в 6 ступеней и остывает", look: "алая печать с перечёркнутым щитом", ref: NV + "Magic/Circle/SpriteSheetOrange.png", art: B.ovOutlaw },
  { key: "intruder", name: "Чужак в столице", src: "дебаф", cls: "debuff", group: "debuff", kind: "overlay", slot: "overlay", at: "head", theme: "fire", prio: 69, motion: "око смотрит влево-вправо (easing) и моргает", look: "янтарное око", ref: "7soul1/src/I_Eye.png", art: B.ovIntruder },
  // ---------- зоны: эффект на каждом юните в круге ----------
  { key: "zone_banner_solgard", name: "Знамя защиты (в круге, Сольгард)", src: "tp_banner", cls: "warrior", group: "zone", kind: "overlay", slot: "overlay", at: "head", theme: "holy", prio: 46, motion: "эмблема покачивается (в коде), за ней дышит свет, вверх поднимаются искры", look: "герб «Восход над Оплотом» (малая эмблема)", ref: "vfx-sds-holy/src/HolyNova/Spritesheet/HolyNova_spritesheet.png", refFrame: 3, art: C.zoneBannerSol },
  { key: "zone_banner_umbrath", name: "Знамя защиты (в круге, Умбрат)", src: "tp_banner", cls: "warrior", hero: "warlock", group: "zone", kind: "overlay", slot: "overlay", at: "head", theme: "shadow", prio: 46, motion: "эмблема покачивается (в коде), за ней дышит фиолетовый свет", look: "герб «Корона над гробом» (малая эмблема)", ref: "vfx-pimen-dark/src/Dark VFX 2/Dark VFX 2 (48x64).png", art: C.zoneBannerUmb },
  { key: "zone_circle", name: "Круг света", src: "circle", cls: "healer", group: "zone", kind: "overlay", slot: "overlay", at: "feet", theme: "holy", prio: 32, motion: "лучи дышат по высоте, по каждому вверх бежит светлая волна, пятно на земле дышит в 5 ступеней, пылинки опускаются", look: "узкие лучи 2–3 px в 4 тона по краям силуэта (за героем), к верху сужаются и гаснут дизером; пятно света; пылинки 2×2", ref: "vfx-sds-holy/src/HeavensFury/Spritesheet/HeavensFury_spritesheet.png", refFrame: [4, 5, 6], refSize: [128, 128], art: C.zoneCircle },
  { key: "zone_hymn", name: "Гимн исцеления", src: "cl_hymn", cls: "healer", group: "zone", kind: "overlay", slot: "overlay", at: "body", theme: "holy", prio: 31, motion: "золотые ноты поднимаются по краям силуэта, покачиваются и гаснут", look: "ноты в 3 тона с контуром", ref: NV + "Magic/Spark/SpriteSheet.png", art: C.zoneHymn },
  { key: "zone_aegis", name: "Покров веры", src: "cl_aegis", cls: "healer", group: "zone", kind: "overlay", slot: "overlay", at: "head", theme: "holy", prio: 34, motion: "крылья взмахивают (easing), свет обходит нимб", look: "золотой нимб с крыльями над подписью", ref: "vfx-sds-holy/src/HolyShield/Spritesheet/HolyShield_spritesheet.png", refFrame: 5, art: C.zoneAegis },
  { key: "zone_pool", name: "Багровая купель", src: "bw_crimson_pool", cls: "bloodweaver", group: "zone", kind: "overlay", slot: "overlay", at: "head", theme: "blood", prio: 29, motion: "кубок покачивается (в коде), в него поднимаются капли, кровь колышется", look: "золотой кубок с кровью", ref: "7soul1/src/P_Red01.png", art: C.zonePool },
  { key: "zone_doom", name: "Чумной туман", src: "wl_doom", cls: "warlock", group: "zone", kind: "overlay", slot: "overlay", at: "feet", theme: "poison", prio: 27, motion: "край лужи колышется, пузыри всплывают и лопаются, два языка скверны колышутся и роняют клочок, споры поднимаются", look: "лужа миазмов (3 тона, тёмно-фиолетовый контур), за героем по бокам — два языка скверны, перед ним — споры 2×2; без альфы", ref: "vfx-sds-poison/src/Poison Spells minipack/Spritesheets/PoisonMagicEffect_spritesheet.png", refFrame: [7, 8], art: C.zoneDoom },
  { key: "zone_veil", name: "Пелена тьмы", src: "dr_veil", cls: "darkranger", group: "zone", kind: "overlay", slot: "overlay", at: "head", theme: "shadow", prio: 27, motion: "три звезды мерцают по очереди (6 ступеней), полумесяц дышит", look: "полумесяц и звёзды ночи", ref: NV + "Magic/Spark/SpriteSheet.png", art: C.zoneVeil },
  { key: "zone_smoke", name: "Дымовая завеса", src: "as_smoke", cls: "rogue", group: "zone", kind: "overlay", slot: "overlay", at: "feet", theme: "shadow", prio: 26, motion: "семь клубов обходят ноги, доли каждого перекатываются и дышат; дважды за цикл отрывается клочок и растворяется дизером", look: "плотные клубы дыма в 3 тона с тёмной кромкой 1 px стелются у ног, без альфы", ref: NV + "Smoke/Smoke/SpriteSheet.png", refFrame: [2, 3], art: C.zoneSmoke },
  { key: "zone_fire", name: "Огненная стена", src: "mg_firewall", cls: "mage", group: "zone", kind: "overlay", slot: "overlay", at: "feet", theme: "fire", prio: 26, motion: "огненная кромка тлеет и вспыхивает на земле, искры летят вверх", look: "горящая кромка на земле под юнитом", ref: NV + "Elemental/Flam/SpriteSheet.png", art: C.zoneFire },
  { key: "zone_time", name: "Искажение времени (в поле)", src: "mg_timewarp", cls: "mage", group: "zone", kind: "overlay", slot: "overlay", at: "head", theme: "arcane", prio: 25, motion: "песок пересыпается, часы покачиваются", look: "песочные часы", ref: "7soul1/src/I_Clock.png", note: "на врагах в поле искажения (замедлены); сам маг — timewarp", art: C.zoneTime },
];

let specsCache: Spec[] | null = null;
export function specs(only?: Set<string>): Spec[] {
  if (specsCache && !only) return specsCache;
  const out = SPECS_IN.filter((s) => !only || only.has(s.key)).map((s) => ({ ...s, art: s.art() }));
  if (!only) specsCache = out;
  return out;
}

// ====================================================================== сцена (как в клиенте)
const HERO_DIR = path.join(ROOT, "client/public/assets/units");
const heroCache = new Map<string, PC>();
function hero(cls: string): PC {
  const n = cls === "common" || cls === "debuff" ? "warrior" : cls;
  let h = heroCache.get(n);
  if (!h) { const sh = readPng(path.join(HERO_DIR, `${n}.png`)); h = new PC(32, 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) h.set(x, y, sh.get(x, y)!); heroCache.set(n, h); }
  return h;
}
const NAMES: Record<string, string> = { warrior: "Aldric", healer: "Mirra", mage: "Kael", rogue: "Vex", ranger: "Ilya", deathknight: "Morn", bloodweaver: "Sanguine", darkranger: "Nyx", warlock: "Zorath", reaver: "Grak", common: "Aldric", debuff: "Aldric" };
/** Эффект на юните: hdx — сдвиг значка над подписью по x (ряд из двух значков), lift — подъём значков (под ними точки стаков). */
interface Placed { s: Spec; t: number; stacks?: number; bead?: boolean; hdx?: number; lift?: number; row?: boolean }
interface HeroIn { cls: string; x: number; y: number; fx: Placed[]; name?: string | false; hp?: number; self?: boolean; alpha?: number }
/** Точки привязки (мир): ноги юнита — ряд 30 спрайта (y), feet — y − 1 (как кольцо выбора), body — y − 13, hand — (x + 10, y − 11);
 *  верх подписи: top = y − 27 (голова), полоска здоровья top − 3 … top + 1, ник — блок 10 px над ней (top − 14 … top − 4); значок — низом на top − 15. */
function anchorAt(at: At, ux: number, uy: number, label: boolean): [number, number] {
  if (at === "feet") return [ux, uy - 1];
  if (at === "body") return [ux, uy - 13];
  if (at === "hand") return [ux + 10, uy - 11];
  return [ux, label ? uy - 27 - 15 : uy - 27 - 4];
}
interface Draw { img: PC; x: number; y: number; a: number }
/** Слои одного эффекта на юните в момент t (мс): списки по глубине, координаты — пиксели холста зума Zm. */
function place(s: Spec, t: number, ux: number, uy: number, Zm: number, label: boolean, stacks?: number, o: { hdx?: number; lift?: number } = {}): Record<"ground" | "under" | "over" | "top", Draw[]> {
  const out = { ground: [] as Draw[], under: [] as Draw[], over: [] as Draw[], top: [] as Draw[] };
  for (const L of s.art.layers) {
    if (L.variant && L.variant !== (s.key.endsWith("umbrath") ? "umbrath" : "solgard")) continue;   // эмблема — одна, своей фракции
    const head = L.at === "head", lift = head ? (o.lift ?? (s.art.pips && stacks ? -3 : 0)) : 0;
    const [ax0, ay0] = anchorAt(L.at, ux, uy, label), ax = ax0 + (L.dx ?? 0) + (head ? o.hdx ?? 0 : 0), ay = ay0 + (L.dy ?? 0) + lift;
    const hi = L.dens === 2 && Zm === 3 && L.hi, fr = hi ? L.hi! : L.frames, fw = hi ? L.hw! : L.w, fh = hi ? L.hh! : L.h;
    const k = L.dens === 1 ? Zm : hi ? 1 : Zm / 2;   // пикселей холста на пиксель листа
    const n = fr.length;
    if (s.key === "runeblade" && L.orbit) {
      // руны — ровно формулой клиента (vfx-gen2.orbitPreview): холст плотности 2 или 3, ноги — точка at
      const g = runeSet(Zm === 3 ? 3 : 2), o = runeSet().orbit!, D = Zm === 3 ? 3 : 2;
      for (const front of [false, true]) {
        const pc = new PC(Math.round(80 * D), Math.round(60 * D));
        orbitPreview(g, t, pc, Math.round(40 * D), Math.round(40 * D), front, o);
        out[front ? "over" : "under"].push({ img: Zm === D ? pc : scaleNN(pc, Zm / D), x: Math.round((ux - 40) * Zm), y: Math.round((uy - 40) * Zm), a: 1 });
      }
      continue;
    }
    if (L.orbit) {
      const o = L.orbit, cnt = o.stacks ? Math.max(1, Math.min(o.n, stacks ?? o.n)) : o.n, F = o.face === "dir" || o.face === "angle" ? (o.dirs ?? 16) : o.face === "lr" ? n / 2 / o.kinds : n / o.kinds;
      for (let i = 0; i < cnt; i++) {
        const a = (t / o.period) * TAU + (i * TAU) / cnt, sn = Math.sin(a);
        const bob = Math.sin((t / o.bobPeriod) * TAU + i * 2.1) * o.bob;
        const wx = ax + Math.cos(a) * o.rx, wy = ay + o.oy + sn * o.ry + bob;
        let fi: number;
        if (o.face === "dir") { const vx = -Math.sin(a) * o.rx * Math.sign(o.period), vy = Math.cos(a) * o.ry * Math.sign(o.period), ang = Math.atan2(vy, vx); fi = (Math.round((ang / TAU) * F) % F + F) % F; }
        else if (o.face === "angle") fi = (Math.round((((a % TAU) + TAU) % TAU / TAU) * F) % F + F) % F;
        else if (o.face === "lr") { const right = -Math.sin(a) * Math.sign(o.period) >= 0, sh = Math.floor((t / 1000) * L.fps + (i * n) / 2 / cnt) % (n / 2 / o.kinds); fi = (right ? 0 : n / 2) + (i % o.kinds) * (n / 2 / o.kinds) + sh; }
        else { const sh = Math.floor((t / 1000) * L.fps + (i * F) / cnt) % F; fi = (i % o.kinds) * F + sh; }
        const img = fr[fi], front = sn >= 0;
        const d: Draw = { img: k === 1 ? img : scaleNN(img, k), x: Math.round(wx * Zm) - Math.round(L.anchor[0] * fw * k), y: Math.round(wy * Zm) - Math.round(L.anchor[1] * fh * k), a: front ? 1 : o.backAlpha };
        (o.ground ? out.ground : front ? (L.z === "top" ? out.top : out.over) : (L.z === "top" ? out.top : out.under)).push(d);
      }
      continue;
    }
    const fi = Math.floor((t / 1000) * L.fps) % n, img = fr[fi];
    const bob = L.bob ? Math.round(Math.sin((t / L.bob.period) * TAU) * L.bob.amp * Zm) : 0;
    const x = L.dens === 1 ? Math.round(ax - L.anchor[0] * fw) * Zm : Math.round(ax * Zm - L.anchor[0] * fw * k);
    const y = (L.dens === 1 ? Math.round(ay - L.anchor[1] * fh) * Zm : Math.round(ay * Zm - L.anchor[1] * fh * k)) + bob;
    out[L.z].push({ img: k === 1 ? img : scaleNN(img, k), x, y, a: 1 });
  }
  return out;
}
const blitA = (dst: PC, d: Draw) => dst.blit(d.img, d.x, d.y, false, d.a);
const TEXT: RGBA = [240, 230, 210, 255], TEXT_ALLY: RGBA = [168, 224, 255, 255], STROKE: RGBA = [16, 10, 18, 255];
/** Подпись (ник 3×5 с обводкой, кегль ≈ 5 px мира) и полоска здоровья 20×2 — как в UnitView. */
function label(pc: PC, Zm: number, ux: number, uy: number, name: string, hp: number, self: boolean) {
  const top = uy - 27, bx = Math.round(ux - 10), by = top - 2;
  const rect = (x: number, y: number, w: number, h: number, c: RGBA) => { for (let j = 0; j < h * Zm; j++) for (let i = 0; i < w * Zm; i++) pc.set(x * Zm + i, y * Zm + j, c); };
  rect(bx - 1, by - 1, 22, 4, [10, 6, 8, 140]); rect(bx, by, 20, 2, [10, 6, 8, 230]); rect(bx, by, Math.round(20 * hp), 2, self ? [90, 208, 74, 255] : [74, 176, 255, 255]);
  const k = Zm, w = name.length * 4 * k - k, x0 = Math.round(ux * Zm - w / 2), y0 = (top - 11) * Zm;
  const tmp = new PC(w + 4, 5 * k + 4); drawText(tmp, name, 2, 2, TEXT, k);
  const o = tmp.clone();
  for (let y = 0; y < tmp.h; y++) for (let x = 0; x < tmp.w; x++) if (!tmp.alpha(x, y) && (tmp.alpha(x - 1, y) || tmp.alpha(x + 1, y) || tmp.alpha(x, y - 1) || tmp.alpha(x, y + 1) || tmp.alpha(x - 1, y - 1) || tmp.alpha(x + 1, y + 1) || tmp.alpha(x + 1, y - 1) || tmp.alpha(x - 1, y + 1))) o.set(x, y, STROKE);
  if (!self) o.map((c) => (c[0] === TEXT[0] ? TEXT_ALLY : c));
  pc.blit(o, x0 - 2, y0 - 2);
}
/** Точки стаков под значком: n из max, 2×2 мира с контуром, цвет темы. */
function pips(pc: PC, Zm: number, ux: number, iconBottom: number, n: number, max: number, col: RGBA) {
  const gap = 3, w = max * gap - 1, x0 = ux - w / 2, y = iconBottom + 0.5;
  for (let i = 0; i < max; i++) {
    const cx = Math.round((x0 + i * gap) * Zm), cy = Math.round(y * Zm), s = 2 * Zm, on = i < n;
    for (let j = -1; j <= s; j++) for (let q = -1; q <= s; q++) { const edge = j < 0 || q < 0 || j >= s || q >= s; pc.set(cx + q, cy + j, edge ? [16, 10, 18, 230] : on ? (j < s / 2 && q < s / 2 ? withA(col.map((v, ii) => (ii < 3 ? Math.min(255, v + 70) : v)) as RGBA, 255) : col) : [60, 50, 64, 220]); }
  }
}
/** Сцена: земля, герои с эффектами. Порядок: всё ground; герои по y — under, герой, over; подписи; top (значки). */
function scene(Zm: number, w: number, h: number, ground: "grass" | "cobble", heroes: HeroIn[]): PC {
  const g = new PC(w, h); paintGround(g, 0, 0, w, h, ground);
  const pc = scaleNN(g, Zm);
  const L = heroes.map((he) => {
    const ux = he.x + 16, uy = he.y + 30, lab = he.name !== false, acc = { ground: [] as Draw[], under: [] as Draw[], over: [] as Draw[], top: [] as Draw[] };
    for (const p of he.fx.filter((q) => !q.bead)) { const d = place(p.s, p.t, ux, uy, Zm, lab, p.stacks, { hdx: p.hdx, lift: p.lift }); for (const k of ["ground", "under", "over", "top"] as const) acc[k].push(...d[k]); }
    return { he, ux, uy, lab, acc };
  });
  for (const l of L) for (const d of l.acc.ground) blitA(pc, d);
  for (const l of L) l.he.fx.filter((p) => p.bead).forEach((p, i) => bead(pc, Zm, p.s.theme, i, l.ux, l.uy, p.t));
  for (const l of [...L].sort((a, b) => a.uy - b.uy)) {
    for (const d of l.acc.under) blitA(pc, d);
    pc.blit(scaleNN(hero(l.he.cls), Zm), l.he.x * Zm, l.he.y * Zm, false, l.he.alpha ?? 1);
    for (const d of l.acc.over) blitA(pc, d);
  }
  for (const l of L) if (l.lab) label(pc, Zm, l.ux, l.uy, (l.he.name as string | undefined) ?? NAMES[l.he.cls] ?? "Aldric", l.he.hp ?? 0.8, !!l.he.self);
  for (const l of L) {
    for (const d of l.acc.top) blitA(pc, d);
    for (const p of l.he.fx) if (p.s.art.pips && p.stacks && !p.bead) {
      const L0 = p.s.art.layers[0];
      // в ряду из двух значков — только набранные точки (пустые гнёзда двух рядов сливались бы)
      if (L0.at === "head") pips(pc, Zm, l.ux + (p.hdx ?? 0), l.uy - 27 - 15 - 2.5, p.stacks, p.row ? p.stacks : p.s.art.pips.max, p.s.art.pips.color);
      else { const [hx, hy] = anchorAt(L0.at, l.ux, l.uy, l.lab), h = L0.dens === 2 ? L0.h / 2 : L0.h; pips(pc, Zm, hx + (L0.dx ?? 0), hy + (L0.dy ?? 0) + h * (1 - L0.anchor[1]) + 0.5, p.stacks, p.s.art.pips.max, p.s.art.pips.color); }
    }
  }
  return pc;
}
/** «Бусина» вместо второго круга: камень 5×5 цвета темы на кромке главного круга (4 места, спереди). */
function bead(pc: PC, Zm: number, theme: string, i: number, ux: number, uy: number, t: number) {
  const r = RP[theme] ?? RP.steel, a = [0.62, 0.38, 0.9, 0.1][i % 4] * Math.PI, x = Math.round(ux + Math.cos(a) * 23), y = Math.round(uy - 1 + Math.sin(a) * 11);
  const lit = Math.floor(t / 250 + i) % 4 < 2, set = (dx: number, dy: number, c: RGBA) => { for (let j = 0; j < Zm; j++) for (let q = 0; q < Zm; q++) pc.set((x + dx) * Zm + q, (y + dy) * Zm + j, c); };
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) set(dx, dy, [20, 12, 30, 255]);
  set(0, 0, lit ? r[5] : r[4]); set(-1, 0, r[3]); set(1, 0, r[3]); set(0, -1, r[4]); set(0, 1, r[2]);
}

/** Значок над подписью: видимая ширина (пиксели мира, по всем кадрам) и сдвиг видимой середины от середины кадра; у орбиты — 2·rx + предмет. */
const headBoxCache = new Map<string, { w: number; off: number }>();
function headBox(s: Spec): { w: number; off: number } {
  const hit = headBoxCache.get(s.key); if (hit) return hit;
  const L = s.art.layers[0], k = L.dens === 2 ? 2 : 1;
  let x0 = 1e9, x1 = -1;
  for (const f of L.frames) for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.alpha(x, y) > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const w = (x1 - x0 + 1) / k, off = (x0 + x1 + 1) / 2 / k - L.w / 2 / k;
  const box = L.orbit ? { w: 2 * L.orbit.rx + w, off: 0 } : { w, off };
  headBoxCache.set(s.key, box);
  return box;
}
/** Раскладка значков над подписью (правило icons): один — по центру; два — в ряд по центру с зазором 2 px (старший приоритет слева);
 *  если у кого-то есть точки стаков — оба значка поднимаются на 3 px (ряд ровный), точки — под своим значком (в ряду — только набранные). */
function headRow(list: Placed[]): Placed[] {
  const heads = list.filter((p) => !p.bead && p.s.slot === "overlay" && p.s.art.layers[0].at === "head");
  const lift = heads.some((p) => p.s.art.pips && p.stacks) ? -3 : 0;
  if (heads.length >= 2) {
    const [a, b] = heads, A = headBox(a.s), Bb = headBox(b.s), total = A.w + 2 + Bb.w;
    a.hdx = Math.round(-total / 2 + A.w / 2 - A.off); b.hdx = Math.round(total / 2 - Bb.w / 2 - Bb.off); a.row = b.row = true;
  }
  for (const p of heads) p.lift = lift;
  return list;
}

// ====================================================================== время пика и раскладки
const mainLayer = (s: Spec) => s.art.layers[0];
/** Момент пика (мс): кадр главного слоя с наибольшим числом видимых пикселей. */
function peakT(s: Spec): number {
  if (s.key === "runeblade") return 300;
  const L = mainLayer(s); if (L.orbit) return 260;
  return (peakIndex(L.frames) / L.fps) * 1000 + 1;
}
const cycleMs = (s: Spec) => { const L = mainLayer(s); return L.orbit ? Math.abs(L.orbit.period) : (L.frames.length / L.fps) * 1000; };
const lbl = (img: PC, text: string, x: number, y: number, c: RGBA = BEIGE) => drawText(img, text.toUpperCase().replace(/[^\x20-\x7e]/g, "").slice(0, 160), x, y, c);
const CWW = 64, CHW = 84, HXW = 16, HYW = 34;    // ячейка (мир) и левый верхний угол героя в ней
const cell = (s: Spec, Zm: number, ground: "grass" | "cobble", t: number, cw = CWW, ch = CHW) =>
  scene(Zm, cw, ch, ground, [{ cls: s.hero ?? s.cls, x: (cw >> 1) - 16, y: HYW, fx: [{ s, t, stacks: s.stacks }], self: true, hp: 0.8, alpha: s.heroA }]);

/** Строка эффекта: подпись и ячейки зума 2 (пик на траве, на брусчатке, ещё три момента цикла на траве). */
function row(s: Spec): PC {
  const t0 = peakT(s), cyc = cycleMs(s), cells = [cell(s, 2, "grass", t0), cell(s, 2, "cobble", t0), ...[1, 2, 3].map((k) => cell(s, 2, "grass", t0 + (k * cyc) / 4))];
  const W = 170 + cells.length * (CWW * 2 + 2), out = new PC(W, CHW * 2); fill(out, BG);
  cells.forEach((c, i) => out.blit(c, 170 + i * (CWW * 2 + 2), 0));
  const L = mainLayer(s);
  lbl(out, s.key, 4, 6, GOLD); lbl(out, `src ${s.src}`, 4, 16); lbl(out, `${s.kind} ${s.slot} ${L.at} p${s.prio}`, 4, 26);
  lbl(out, `${L.frames.length}f ${L.fps}fps ${L.dens === 2 ? "x2" : "x1"} ${L.dens === 2 ? `${L.w / 2}x${L.h / 2}` : `${L.w}x${L.h}`}`, 4, 36);
  lbl(out, s.art.layers.length > 1 ? `layers ${s.art.layers.map((l) => l.id).join(" ")}` : L.orbit ? `orbit ${L.orbit.n} r${L.orbit.rx}x${L.orbit.ry} ${Math.abs(L.orbit.period)}ms` : L.bob ? `bob ${L.bob.amp}px ${L.bob.period}ms` : "", 4, 46, [150, 200, 255, 255]);
  lbl(out, s.theme, 4, 56, [150, 200, 255, 255]);
  return out;
}
const rowsSheet = (title: string, list: Spec[]) => stackV([(() => { const h = new PC(1000, 16); fill(h, BG); lbl(h, title, 4, 5, GOLD); return h; })(), ...list.map(row)], 4);

/** Все обозначения: по одному кадру (пик), подпись — ключ и умение. */
function allSheet(list: Spec[], Zm: number, per: number): PC {
  const cw = CWW * Zm, ch = CHW * Zm + 18, rows = Math.ceil(list.length / per);
  const out = new PC(per * (cw + 2), rows * ch); fill(out, BG);
  list.forEach((s, i) => {
    const x = (i % per) * (cw + 2), y = Math.floor(i / per) * ch;
    out.blit(cell(s, Zm, i % 2 ? "cobble" : "grass", peakT(s)), x, y);
    lbl(out, s.key, x + 3, y + CHW * Zm + 2, GOLD); lbl(out, s.src, x + 3, y + CHW * Zm + 10);
  });
  return out;
}

/** Правила наслоения на одном юните (data/aura-fx.json → _rules): в поле огненной стены горение burn не рисуется (огонь уже у ног — zone_fire),
 *  в поле искажения времени замедление slow не рисуется (его показывают часы zone_time); дальше — 1 круг + бусины, 1 купол, 2 оверлея
 *  по приоритету, значки над подписью — в ряд (headRow). */
function rules(l: Spec[], t: number): Placed[] {
  const keys = new Set(l.map((s) => s.key));
  const hide = new Set<string>([...(keys.has("zone_fire") ? ["burn"] : []), ...(keys.has("zone_time") ? ["slow"] : [])]);
  const live = l.filter((s) => !hide.has(s.key)), byPrio = (q: Spec[]) => [...q].sort((x, y) => y.prio - x.prio);
  const rings = byPrio(live.filter((s) => s.slot === "ring")), domes = byPrio(live.filter((s) => s.slot === "dome")), ovs = byPrio(live.filter((s) => s.slot === "overlay"));
  const out: Placed[] = [];
  if (rings[0]) out.push({ s: rings[0], t });
  rings.slice(1, 5).forEach((s) => out.push({ s, t, bead: true }));
  if (domes[0]) out.push({ s: domes[0], t });
  ovs.slice(0, 2).forEach((s) => out.push({ s, t, stacks: s.stacks }));
  return headRow(out);
}
/** Наслоение (зум 2, лист ×2): один герой — всё сразу и по правилам; частые пары на враге — два значка над подписью (раньше в одной точке,
 *  теперь в ряд) и стена огня с «Воспламенением» (zone_fire + burn); группа из 5 героев вплотную — всё сразу и по правилам. */
function stackSheet(list: Spec[]): PC {
  const by = (k: string) => list.find((s) => s.key === k)!;
  const pick = (keys: string[]) => keys.map(by);
  const all = (l: Spec[], t: number): Placed[] => l.map((s) => ({ s, t, stacks: s.stacks }));
  const naive = pick(["tp_banner", "invuln", "block", "laststand", "haste", "warcry", "potion"]);
  const W = 300, top = new PC(W * 2 * 2 + 8, 100 * 2 + 20); fill(top, BG);
  [0, 250, 500, 750].forEach((t, i) => {
    top.blit(scene(2, 72, 100, "grass", [{ cls: "warrior", x: 20, y: 52, fx: all(naive, t), self: true }]), i * 146, 20);
    top.blit(scene(2, 72, 100, "grass", [{ cls: "warrior", x: 20, y: 52, fx: rules(naive, t), self: true }]), W * 2 + 8 + i * 146, 20);
  });
  lbl(top, "one hero, everything at once (mush)", 6, 6, GOLD); lbl(top, "same hero by rules: 1 ring + beads, 1 dome, 2 overlays", W * 2 + 14, 6, GOLD);
  // частые пары на враге: два значка над подписью; стена огня + воспламенение
  const pairs: [string, string[]][] = [["warrior", ["curse", "hex"]], ["ranger", ["hunter_mark", "shock"]], ["reaver", ["mortality", "venom"]], ["rogue", ["zone_fire", "burn"]]];
  const mid = new PC(W * 2 * 2 + 8, 100 * 2 + 34); fill(mid, BG);
  pairs.forEach(([cls, keys], i) => {
    const l = pick(keys), t = 300 + i * 170;
    mid.blit(scene(2, 72, 100, "grass", [{ cls, x: 20, y: 52, fx: all(l, t) }]), i * 146, 20);
    mid.blit(scene(2, 72, 100, "grass", [{ cls, x: 20, y: 52, fx: rules(l, t) }]), W * 2 + 8 + i * 146, 20);
    lbl(mid, keys.join(" + "), i * 146 + 4, 224, [150, 200, 255, 255]); lbl(mid, keys.join(" + "), W * 2 + 8 + i * 146 + 4, 224, [150, 200, 255, 255]);
  });
  lbl(mid, "enemy: two icons at one point; fire wall + ignite (mush)", 6, 6, GOLD); lbl(mid, "by rules: icons in a row, gap 2 px, pips under own icon; no burn in fire wall", W * 2 + 14, 6, GOLD);
  const crowd: { cls: string; keys: string[] }[] = [
    { cls: "warrior", keys: ["laststand", "tp_banner", "block", "haste", "warcry"] }, { cls: "mage", keys: ["rhythm", "block@mage", "timewarp", "zone_fire"] },
    { cls: "healer", keys: ["bless", "renew", "shield", "zone_hymn"] }, { cls: "rogue", keys: ["stealth", "dance", "as_ambush", "critnext"] }, { cls: "deathknight", keys: ["runeblade", "bone", "antimagic", "slow"] },
  ];
  const group = (useRules: boolean, t: number) => scene(2, 250, 112, "cobble", crowd.map((c, i) => ({ cls: c.cls, x: 14 + i * 46, y: 62 + (i % 2) * 8, self: i === 0, fx: useRules ? rules(pick(c.keys), t + i * 130) : all(pick(c.keys), t + i * 130) })));
  const bottom = new PC(250 * 2 * 2 + 8, 112 * 2 + 20); fill(bottom, BG);
  bottom.blit(group(false, 400), 0, 18); bottom.blit(group(true, 400), 250 * 2 + 8, 18);
  lbl(bottom, "five heroes close together: everything at once", 6, 6, GOLD); lbl(bottom, "five heroes: rules applied", 250 * 2 + 14, 6, GOLD);
  return scaleNN(stackV([top, mid, bottom], 6), 2);
}

// ====================================================================== «наш | эталон»
const VENDOR = path.join(ROOT, "vendor");
/** Кадры эталона: лист режется на кадры (квадратные по высоте, если не задано иначе); srzolda — 512×512 с пикселем 8×8 — уменьшается. */
function refFrames(s: Spec): { frames: PC[]; k: number } {
  const p = path.join(VENDOR, s.ref);
  if (!fs.existsSync(p)) return { frames: [], k: 1 };
  let src = readPng(p);
  let fw = s.refSize?.[0] ?? src.h, fh = s.refSize?.[1] ?? src.h;
  const known: Record<string, [number, number]> = {
    "Shield/SpriteSheetBlue.png": [24, 26], "HolyNova_spritesheet.png": [128, 64], "Plant/SpriteSheet.png": [24, 28], "Flam/SpriteSheet.png": [20, 30], "SmokeCircular/SpriteSheet.png": [24, 14], "Boost/SpriteSheet.png": [53, 35],
    "Aura/SpriteSheet.png": [25, 24], "Spark/SpriteSheet.png": [30, 35], "Dark VFX 1 (40x32).png": [40, 32], "Dark VFX 2 (48x64).png": [48, 64], "PoisonMagicEffect_spritesheet.png": [64, 64],
  };
  for (const [k, v] of Object.entries(known)) if (s.ref.endsWith(k)) [fw, fh] = v;
  let k = 1;
  if (s.ref.includes("srzolda")) { // 512×512 кадры, арт с пикселем 8×8 → 64×64
    const f0 = new PC(64, 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const c = src.get(x * 8 + 4, y * 8 + 4)!; if (c[3]) f0.set(x, y, c); }
    return { frames: [f0], k: 1 };
  }
  const out: PC[] = [];
  for (let y = 0; y + fh <= src.h; y += fh) for (let x = 0; x + fw <= src.w; x += fw) { const f = new PC(fw, fh); for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { const c = src.get(x + i, y + j)!; if (c[3]) f.set(i, j, c); } out.push(f); }
  void k; src = src as PC;
  return { frames: out, k: 1 };
}
/** Пара «наш | эталон» в одном масштабе: наш кадр пика на зуме 2 (трава, брусчатка) рядом с кадрами эталона ×2 (как 1:1 в игре на зуме 2),
 *  наш на зуме 3 (трава; брусчатка — через полцикла) рядом с эталоном ×3. Подписи — ключ и полный путь эталона с номерами кадров. */
function comparePair(s: Spec): PC {
  const t0 = peakT(s), c2g = cell(s, 2, "grass", t0), c2c = cell(s, 2, "cobble", t0), c3 = cell(s, 3, "grass", t0), c3c = cell(s, 3, "cobble", t0 + cycleMs(s) / 2);
  const { frames } = refFrames(s), idx = !frames.length ? [] : s.refFrame === undefined ? [peakIndex(frames)] : (Array.isArray(s.refFrame) ? s.refFrame : [s.refFrame]).map((i) => Math.min(frames.length - 1, i));
  // кадры эталона обрезаются по общей рамке видимых пикселей (+3 px): масштаб тот же, пустых полей нет
  const raw = idx.length ? idx.map((i) => frames[i]) : [new PC(8, 8)], box = unionBox(raw);
  const rfs = !box ? raw : raw.map((f) => { const [x0, y0, x1, y1] = box, o = new PC(x1 - x0 + 6, y1 - y0 + 6); o.blit(f, 3 - x0, 3 - y0); return o; });
  const refBg = (img: PC) => { const o = new PC(img.w + 8, img.h + 8); paintGround(o, 0, 0, o.w, o.h, "grass"); o.blit(img, 4, 4); return o; };
  const r2 = rfs.map((f) => scaleNN(refBg(f), 2)), r3 = scaleNN(refBg(rfs[0]), 3);
  const sep = (out: PC, x: number, y0: number, y1: number) => { for (let j = y0; j < y1; j++) { out.set(x, j, GOLD); out.set(x + 1, j, GOLD); } };
  const row2 = c2g.w + c2c.w + 6 + 18 + r2.reduce((q, r) => q + r.w + 6, 0), row3 = c3.w + c3c.w + 6 + 18 + r3.w;
  const h2 = Math.max(c2g.h, ...r2.map((r) => r.h)), h3 = Math.max(c3.h, r3.h);
  const out = new PC(Math.max(row2, row3) + 8, 24 + h2 + 8 + h3 + 4); fill(out, BG);
  let x = 4, y = 24;
  out.blit(c2g, x, y); x += c2g.w + 6; out.blit(c2c, x, y); x += c2c.w + 8; sep(out, x, y, y + h2); x += 10;
  for (const r of r2) { out.blit(r, x, y); x += r.w + 6; }
  x = 4; y += h2 + 8;
  out.blit(c3, x, y); x += c3.w + 6; out.blit(c3c, x, y); x += c3c.w + 8; sep(out, x, y, y + h3); x += 10;
  out.blit(r3, x, y);
  lbl(out, `${s.key}   ours (peak): z2 grass, z2 cobble | ref x2;  z3 grass, z3 cobble +1/2 cycle | ref x3`, 4, 4, GOLD);
  lbl(out, `ref: vendor/${s.ref}${idx.length && (s.refFrame !== undefined) ? `  frames ${idx.map((i) => i + 1).join(",")}` : idx.length ? `  frame ${idx[0] + 1} (peak)` : "  (missing)"}`, 4, 13, [150, 200, 255, 255]);
  return out;
}
/** Перерисованные по замечаниям (задача 129, шаг 1); у REF_FIXED сменён только эталон (старый был не похож по смыслу); оба списка — в compare.png,
 *  к ним — 10 характерных обозначений для сравнения уровня. */
const REWORKED = ["zone_doom", "zone_smoke", "stealth", "zone_circle", "invuln", "shield", "block@mage", "antimagic", "leg_barrier", "meta", "laststand", "tp_banner",
  "dmgboost", "blood_circle", "frenzy", "haste", "bone", "blood_tap", "venom", "root"];
const REF_FIXED = ["intruder", "weak", "zone_time", "timewarp", "as_ambush", "mortality", "warcry", "bond", "zone_pool"];
const CHARACTERISTIC = ["bless", "rhythm", "dance", "trickroll", "shards", "massacre", "stun", "slow", "zone_banner_solgard", "zone_banner_umbrath"];

// ====================================================================== таблица data/aura-fx.json
/** Подписи классов на листах превью (латиницей: шрифт листов — 3×5 без кириллицы). */
const CLASS_EN: Record<string, string> = {
  warrior: "templar: holy gold, sun, azure shield", healer: "healer: soft white light, gold, cross", mage: "mage: arcane orbs, runes, violet and azure",
  ranger: "ranger: nature, leaves, arrows", rogue: "rogue: shadow, smoke, steel", deathknight: "death knight: pale blue runes, bone, frost",
  bloodweaver: "bloodweaver: blood, orbs, drops, veins", darkranger: "dark ranger: lilac feathers, moons", warlock: "warlock: fel, violet smoke, green fire, skulls",
  reaver: "reaver: ragged crimson, blades, fury",
};
const CLASS_STYLE: Record<string, string> = {
  warrior: "храмовник: золото света, солнце, лазурь щита", healer: "лекарь: мягкий белый свет, золото, крест", mage: "маг: тайные сферы, руны, пурпур и лазурь",
  ranger: "следопыт: природа, листья, стрелы", rogue: "разбойник: тень, дым, сталь", deathknight: "рыцарь смерти: мертвенно-голубые руны, кость, иней",
  bloodweaver: "кровоплёт: кровь, сферы, капли, жилы", darkranger: "тёмный следопыт: сиреневые перья, луны", warlock: "чернокнижник: скверна, фиолетовый дым и зелёный огонь, черепа",
  reaver: "потрошитель: рваный багрянец, клинки, ярость",
};
const sheetName = (s: Spec, L: Layer, i: number) => (s.key === "runeblade" ? "aura-runes-frost" : `aura-${s.key.replace("@", "_")}${i ? `-${L.id}` : ""}`);
function layerEntry(s: Spec, L: Layer, i: number) {
  const name = sheetName(s, L, i);
  return {
    sheet: name, ...(L.hi ? { sheetX3: `${name}-x3` } : {}), frame: [L.w, L.h], ...(L.hi ? { frameX3: [L.hw, L.hh] } : {}), frames: L.frames.length, fps: L.fps,
    scale: L.dens === 2 ? 0.5 : 1, ...(L.hi ? { scaleX3: 1 / 3 } : {}), anchor: L.anchor, at: L.at, ...(L.dx || L.dy ? { offset: [L.dx ?? 0, L.dy ?? 0] } : {}), z: L.z,
    ...(L.bob ? { bob: L.bob } : {}), ...(L.orbit ? { orbit: L.orbit } : {}), ...(L.variant ? { variant: L.variant } : {}),
  };
}
const LAYER_TEXT: Record<string, string> = {
  ground: "на земле: под героем и его тенью (DEPTH.ground + 7)", under: "за героем (y − 0.5)", over: "над героем (y + 0.5)", top: "над подписью: низ значка на 1 px выше блока ника и полоски (как ник, DEPTH.top − 4)",
};
function writeTable(list: Spec[]) {
  const entry = (s: Spec) => {
    const L = mainLayer(s);
    return {
      name: s.name, source: s.src, class: s.cls, kind: s.kind, slot: s.slot, at: L.at, theme: s.theme, look: s.look,
      anim: { frames: L.orbit ? (L.orbit.face === "angle" || L.orbit.face === "dir" ? L.frames.length : L.orbit.face === "lr" ? L.frames.length / 2 / L.orbit.kinds : L.frames.length / L.orbit.kinds) : L.frames.length, fps: L.fps, motion: s.motion }, size: L.dens === 2 ? [L.w / 2, L.h / 2] : [L.w, L.h], priority: s.prio,
      layer: [...new Set(s.art.layers.map((l) => (l.orbit && !l.orbit.ground ? "орбита: задний полукруг за героем (y − 0.5), передний над ним (y + 0.5)" : LAYER_TEXT[l.z])))].join("; "),
      layers: s.art.layers.map((l, i) => layerEntry(s, l, i)), ease: s.art.ease, ...(s.art.only ? { only: s.art.only } : {}), ...(s.art.pips ? { pips: s.art.pips.max } : {}),
      ...(s.replaces ? { replaces: s.replaces } : {}), ...(s.note ? { note: s.note } : {}), ref: `vendor/${s.ref}`,
    };
  };
  const pick = (g: Group) => Object.fromEntries(list.filter((s) => s.group === g).map((s) => [s.key, entry(s)]));
  const replaced = list.filter((s) => s.replaces).map((s) => `${s.key} ← ${s.src}: ${s.replaces}`);
  const table = {
    _doc: "Обозначения бафов и дебафов на юните (задача 129, дизайн на утверждение). Ключ — k из data/auras.json (block@mage — тот же ключ block у мага; zone_* — эффект на юните внутри зоны умения). source — умение-источник. kind: ring — круг под ногами, shield — купол или щит, overlay — значок или частицы, orbit — предметы кружат вокруг. slot — в какой лимит входит (ring, dome, overlay). Каждый эффект — один или несколько слоёв (layers): лист кадров подряд, плотность (scale 0.5 — двойная, рядом лист -x3 со scale 1/3 для зума 3), привязка (at, anchor, offset), глубина (z), покачивание (bob) и орбита (orbit) считаются в коде каждый кадр с шагом в пиксель холста. Рисует tools/gen/aura-fx.ts, листы — tools/out/aura-fx/, превью — tools/out/aura-preview/. В игру пока не подключено (шаг 2). ref — эталон из пака, с которым сравнивалось обозначение (tools/out/aura-preview/compare.png, compare/<ключ>.png). variant у слоя — вариант по фракции (рисуется слой фракции знамени).",
    _classes: CLASS_STYLE,
    _rules: {
      slots: "На юнит одновременно: не больше одного круга (slot ring), одного купола (slot dome) и двух оверлеев (slot overlay: значки, частицы и орбиты вместе). Побеждает больший priority.",
      beads: "Остальные эффекты-круги не рисуются кругом, а становятся «бусинами» — камнями 5×5 цвета темы на кромке главного круга (до 4 штук, спереди, по порядку приоритета, мерцают по очереди).",
      crowd: "В толпе (больше 6 героев в кадре): у чужих героев только один круг (прозрачность 0,6), бусины и купол инвулна или блока; оверлеи и орбиты — только у себя, у выбранной цели и стан, скрытность, вне закона. У врагов — только дебафы stun, root, outlaw.",
      zones: "Умения-зоны рисуют круг на земле один раз (aura умения в skill-fx), а на каждом юните внутри — свой оверлей из раздела zones; он считается в лимит двух оверлеев. Знамя: у храмовника, поставившего знамя, — кольцо tp_banner (эмблема его фракции на кромке), у остальных в круге — zone_banner_<фракция знамени>; одно обозначение на юнит.",
      timewarp: "mg_timewarp: сам маг — timewarp (циферблат под ногами, слот круга); враги в поле искажения — zone_time (песочные часы над подписью); замедление slow от того же источника у них не рисуется — его показывают часы.",
      firewall: "mg_firewall: юнит в поле огненной стены — zone_fire (огонь у ног); горение burn от «Воспламенения» у него не рисуется, пока он в поле (два огня на одном юните — каша), вышел из поля и горит — burn.",
      icons: "Значки над подписью (главный слой at: head): один — по центру; два — в ряд по центру с зазором 2 px между видимыми краями, старший приоритет слева; точки стаков — под своим значком, в ряду из двух — только набранные (без пустых гнёзд); если стаки есть хотя бы у одного из двух, оба поднимаются на 3 px (ряд ровный). Ширина значка — видимые пиксели его листа (по всем кадрам), орбита над подписью (оглушение) занимает 2·rx + предмет.",
      depth: "Глубины по слоям (z): ground — круг на земле под героем и тенью (DEPTH.ground + 7); under — за героем (y − 0.5); over — над героем (y + 0.5); top — значки над подписью: низ значка на 1 px выше верха блока подписи (ник, титул, рамка — UnitView.blockUp), если подпись скрыта — на 2 px выше головы; глубина как у ника (DEPTH.top − 4). Орбиты: предмет на заднем полукруге — under, на переднем — over (у орбиты на земле — оба ground). Значки над головой — не выше 16 px (рисунок двойной плотности).",
      attach: "Точки at (пиксели мира от позиции юнита x, y — ряд 30 спрайта, ноги): feet — (x, y − 1), как кольцо выбора; body — (x, y − 13); hand — (x + 10, y − 11), при взгляде влево — зеркально; head — над подписью (см. depth). Все слои ставятся UnitView.attach, как ауры умений: позиция — в целых пикселях после bob героя и посадки на маунта.",
      density: "scale 0.5 — лист двойной плотности: на зуме 2 и 4 пиксель листа — целое число пикселей холста; на зуме 3 клиент берёт лист -x3 (scale 1/3) того же размера в мире. Орбиты и bob — в пикселях мира, клиент округляет до пикселя холста.",
      orbit: "orbit: n предметов (stacks: true — по числу стаков, не больше n), центр — точка at + (0, oy), эллипс rx × ry, период period мс (минус — по часовой), покачивание bob px с периодом bobPeriod (фазы разнесены), задний полукруг — альфа backAlpha (приглушение альфой, без затемнения). Кадры предмета: face shimmer — kinds блоков по F кадров, предмет i берёт блок i mod kinds и свою фазу мерцания; lr — первая половина листа — летит вправо, вторая — влево; angle — dirs кадров по углу на орбите (кадр k — угол k·360°/dirs, 0 — справа, 90° — спереди; предмет повёрнут по ходу полёта в 3D, на краях — в ракурсе). Руны рыцаря смерти (runeblade) — как в игре: кадры 0–3 руны, 4–7 ореолы (add), 8–11 блики; анимация — в коде (Vfx.orbit).",
      ease: "ease: появление — альфа 0 → 1 за fadeIn мс (easing out) и масштаб от scaleIn до 1; снятие — альфа 1 → 0 за fadeOut мс. Пиксельные слои масштабируются только при появлении.",
      replaces: "Обозначение заменяет цикл aura умения на герое (Vfx.buff → followUnit): пока у юнита есть обозначение этого ключа, цикл из data/skill-fx.json на нём не запускается. Зональные циклы (banner-*, flame-loop, fog-*, blood-pool) остаются на земле — они рисуют саму зону. Пары ключ ← умение: aura: " + replaced.join("; ") + ".",
      priority: "100 Божественный щит, 95 оглушение, 90 скрытность, 85 танец теней, 80 метаморфоза, 70 костяная броня и вне закона, 60 барьер реликвии и корни, 55–40 круги, орбиты и значки классов (последний рубеж 50, прилив сил 42), ниже — значки.",
      only: "only: moving — слой рисуется только в движении (пыль маунта), при движении влево зеркалится; стоит — не рисуется.",
      stacks: "pips: под значком — точки стаков (2×2 мира с контуром, до pips штук), рисует клиент; у орбит со stacks число предметов = стакам.",
    },
    buffs: pick("buff"), common: pick("common"), debuffs: pick("debuff"), zones: pick("zone"),
  };
  fs.writeFileSync(path.join(ROOT, "data/aura-fx.json"), JSON.stringify(table, null, 1) + "\n");
}

// ====================================================================== аудит: tools/out/aura-preview/audit.md
/** Маска эффекта в мире (96×96, ноги юнита — (48, 72)): объединение видимых пикселей всех кадров всех слоёв (вариант — Сольгард);
 *  у орбиты — след предметов по кругу (24 момента). Нужна для сравнения силуэтов: IoU масок двух эффектов одного места. */
function worldMask(s: Spec): Uint8Array {
  const N = 96, m = new Uint8Array(N * N), ux = 48, uy = 72;
  for (const L of s.art.layers) {
    if (L.variant && L.variant !== "solgard") continue;
    const k = L.dens === 2 ? 2 : 1, [ax0, ay0] = anchorAt(L.at, ux, uy, true), ax = ax0 + (L.dx ?? 0), ay = ay0 + (L.dy ?? 0);
    const put = (f: PC, cx: number, cy: number) => {
      for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (f.alpha(x, y) > 40) {
        const wx = Math.floor(cx - (L.anchor[0] * L.w) / k + x / k), wy = Math.floor(cy - (L.anchor[1] * L.h) / k + y / k);
        if (wx >= 0 && wy >= 0 && wx < N && wy < N) m[wy * N + wx] = 1;
      }
    };
    if (L.orbit) { const o = L.orbit; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; put(L.frames[i % L.frames.length], ax + Math.cos(a) * o.rx, ay + o.oy + Math.sin(a) * o.ry); } }
    else for (const f of L.frames) put(f, ax, ay);
  }
  return m;
}
const iou = (a: Uint8Array, b: Uint8Array) => { let i = 0, u = 0; for (let q = 0; q < a.length; q++) { if (a[q] && b[q]) i++; if (a[q] || b[q]) u++; } return u ? i / u : 0; };
/** Замеры слоя: повторы кадров (кадр совпал с другим кадром цикла), разности соседних кадров (пиксели листа: min и среднее),
 *  доля видимых пикселей с альфой ≥ 200 и наибольшая альфа. */
function layerStats(L: Layer) {
  const keys = L.frames.map((f) => Buffer.from(f.data.buffer).toString("base64")), rep = keys.length - new Set(keys).size;
  const diffs = L.frames.map((f, i) => {
    const g = L.frames[(i + 1) % L.frames.length]; let d = 0;
    for (let q = 0; q < f.data.length; q += 4) if (f.data[q] !== g.data[q] || f.data[q + 1] !== g.data[q + 1] || f.data[q + 2] !== g.data[q + 2] || f.data[q + 3] !== g.data[q + 3]) d++;
    return d;
  });
  let vis = 0, solid = 0, amax = 0;
  for (const f of L.frames) for (let q = 3; q < f.data.length; q += 4) { const a = f.data[q]; if (a) { vis++; if (a >= 200) solid++; amax = Math.max(amax, a); } }
  return { rep, dmin: Math.min(...diffs), dmean: Math.round(diffs.reduce((x, y) => x + y, 0) / diffs.length), solid: vis ? solid / vis : 0, amax };
}
/** Пары, которые читались одинаково, и чем они разведены теперь (силуэт, а не только цвет). */
const PAIRS: [string, string, string][] = [
  ["zone_doom ↔ zone_smoke", "один рисунок, перекрашенный (маски совпадали на 100 % и 92,5 %), полупрозрачные пятна без контура", "zone_smoke — кольцо плотных клубов в 3 тона с кромкой 1 px у ног; zone_doom — плоская лужа миазмов с пузырями, два языка скверны по бокам за героем, споры спереди"],
  ["laststand ↔ tp_banner", "два золотых кольца с эмблемой спереди", "laststand — не круг, а значок над подписью: щит с бьющимся сердцем; tp_banner — кольцо из шести вымпелов на древках, витой шнур, эмблема фракции"],
  ["dmgboost ↔ blood_circle ↔ frenzy", "три красных эллипса под ногами", "кругом остался только frenzy (рваное кольцо, зубья на месте, пульс в 5 ступеней); dmgboost — шевроны силы над подписью; blood_circle — лужа тёмной крови с жилой и узлами-каплями"],
  ["blood_tap ↔ bleed", "красная «сыпь» у силуэта", "blood_tap — три крупные капли 4×5 по спирали к груди и голубая вспышка 5×5; bleed — капли падают с краёв силуэта вниз и разбиваются у ног"],
  ["stealth ↔ zone_smoke", "(оба — дым разбойника)", "stealth — три тёмно-сизых клуба у краёв силуэта, растворяются дизером; zone_smoke — светлые клубы кольцом у ног"],
  ["burn ↔ zone_fire", "огненный «забор» у ног; двойной огонь на одном юните", "burn — четыре языка по краям силуэта; zone_fire — кольцо огоньков на земле; в поле стены burn не рисуется (_rules.firewall)"],
  ["купола: block@mage, antimagic, invuln, shield, leg_barrier", "обод под ником и через полоску здоровья", "верх всех куполов на y − 33; block@mage — рёбра сот и молнии, antimagic — руны-плитки на ободе, invuln — лучи только по бокам и снизу, shield — крест на нижнем ободе, leg_barrier — гранёный шестигранник"],
  ["haste ↔ zone_aegis", "белые крылья", "haste — крылышки у пяток (4 пера, голубой обод, золотая застёжка); zone_aegis — нимб с крыльями над подписью"],
  ["timewarp ↔ zone_time", "один источник mg_timewarp", "timewarp — циферблат под ногами у мага; zone_time — песочные часы над подписью у врагов в поле (_rules.timewarp)"],
];
function writeAudit(list: Spec[]) {
  const masks = new Map(list.map((s) => [s.key, worldMask(s)]));
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const pair = (a: string, b: string) => { const A = masks.get(a), B = masks.get(b); return A && B ? iou(A, B) : NaN; };
  const lines: string[] = [
    "# Аудит обозначений бафов и дебафов (задача 129, шаг 1, доработка по замечаниям критика)", "",
    "Пишет tools/gen/aura-fx.ts (writeAudit) при полном прогоне. Листы: all.png (зум 2) и all-z3.png (зум 3) — кадр пика каждого обозначения; " +
      "compare.png — «наш | эталон из пака» в одном масштабе (доработанные и 10 характерных), compare/<ключ>.png — для всех; stack.png — наслоение по правилам.", "",
    "## Пары, которые читались одинаково, и чем они разведены теперь", "", "| Пара | Было | Стало |", "|---|---|---|",
    ...PAIRS.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`), "",
    "## Похожесть силуэтов", "",
    "IoU масок: все кадры всех слоёв в мире, герой в одной точке; 1 — один и тот же силуэт, ниже 0,5 — заметно разные. Пары из замечаний:", "",
    "| Пара | IoU |", "|---|---|",
  ];
  for (const [a, b] of [["zone_doom", "zone_smoke"], ["laststand", "tp_banner"], ["dmgboost", "blood_circle"], ["blood_circle", "frenzy"], ["dmgboost", "frenzy"], ["blood_tap", "bleed"], ["stealth", "zone_smoke"], ["burn", "zone_fire"], ["block@mage", "antimagic"], ["invuln", "shield"]]) lines.push(`| ${a} ↔ ${b} | ${pair(a, b).toFixed(2)} |`);
  const all: [string, string, number][] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.slot !== b.slot || a.art.layers[0].at !== b.art.layers[0].at) continue;
    all.push([a.key, b.key, iou(masks.get(a.key)!, masks.get(b.key)!)]);
  }
  all.sort((x, y) => y[2] - x[2]);
  lines.push("", "Самые похожие по силуэту пары одного слота и места (их различает рисунок внутри силуэта — сверено глазами в all.png и all-z3.png):", "", "| Пара | Слот, место | IoU |", "|---|---|---|");
  for (const [a, b, v] of all.slice(0, 12)) { const s = list.find((q) => q.key === a)!; lines.push(`| ${a} ↔ ${b} | ${s.slot}, ${s.art.layers[0].at} | ${v.toFixed(2)} |`); }
  lines.push("", "## Замеры анимации доработанных (по слоям)", "",
    "Повторы — кадры цикла, совпавшие с другим кадром; разность — пиксели листа, изменившиеся к следующему кадру (min / среднее); плотно — доля видимых пикселей с альфой ≥ 200.", "",
    "| Ключ | Слой | Кадры, к/с | Повторы | Разность min / ср. | Плотно | Альфа max | Верх над ногами |", "|---|---|---|---|---|---|---|---|");
  // верх эффекта над ногами (пиксели мира, все слои и кадры): у куполов — не выше 33 (под ником), у значков — над подписью
  const topOf = (s: Spec) => { const m = masks.get(s.key)!; for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (m[y * 96 + x]) return 72 - y; return 0; };
  for (const k of REWORKED) {
    const s = list.find((q) => q.key === k); if (!s) continue;
    s.art.layers.forEach((L, i) => { if (L.variant === "umbrath") return; const st = layerStats(L); lines.push(`| ${k} | ${L.id} | ${L.frames.length}, ${L.fps} | ${st.rep} | ${st.dmin} / ${st.dmean} | ${pct(st.solid)} | ${st.amax} | ${i ? "" : `${topOf(s)}${s.slot === "overlay" && s.art.layers[0].at === "head" ? " (значок)" : ""}`} |`); });
  }
  lines.push("", "## Правила наслоения, добавленные по замечаниям", "",
    "- icons: до двух значков над подписью — в ряд по центру с зазором 2 px, точки стаков под своим значком, в ряду — только набранные (stack.png, средний ряд: curse + hex, hunter_mark + shock, mortality + venom).",
    "- firewall: в поле огненной стены горение burn не рисуется — огонь показывает zone_fire (stack.png, средний ряд справа).",
    "- timewarp: в поле искажения времени slow не рисуется — его показывают часы zone_time.", "");
  fs.writeFileSync(path.join(OUT, "audit.md"), lines.join("\n"));
}

// ====================================================================== листы
function writeSheets(list: Spec[]) {
  for (const f of fs.readdirSync(SHEETS)) if (/^aura-.*\.png$/.test(f)) fs.unlinkSync(path.join(SHEETS, f));
  for (const s of list) {
    if (s.key === "runeblade") continue;  // руны уже в игре: client/public/assets/vfx/aura-runes-frost*.png
    s.art.layers.forEach((L, i) => {
      const name = sheetName(s, L, i), row = (fr: PC[], w: number, h: number) => { const sh = new PC(w * fr.length, h); fr.forEach((f, k) => sh.blit(f, k * w, 0)); return sh; };
      row(L.frames, L.w, L.h).save(path.join(SHEETS, `${name}.png`));
      if (L.hi) row(L.hi, L.hw!, L.hh!).save(path.join(SHEETS, `${name}-x3.png`));
    });
  }
}

export function writeAll(only?: Set<string>) {
  const list = specs(only);
  if (only) {
    const dev = path.join(OUT, "dev"); fs.mkdirSync(dev, { recursive: true });
    stackV(list.map(comparePair), 6).save(path.join(dev, "compare.png"));
    rowsSheet("dev", list).save(path.join(dev, "rows.png"));
    for (const s of list) {
      // крупно: зум 2 на траве и брусчатке ×2 (пиксель холста = 2×2), под ними — кадры слоёв подряд ×4 (плотность 1) или ×2 (плотность 2)
      const t0 = peakT(s), z = [cell(s, 2, "grass", t0, 64, 84), cell(s, 2, "cobble", t0 + cycleMs(s) / 3, 64, 84)].map((c) => scaleNN(c, 2)), z3 = cell(s, 3, "grass", t0 + cycleMs(s) / 2, 64, 84);
      const top = new PC(z[0].w * 2 + z3.w + 12, z[0].h); fill(top, BG); top.blit(z[0], 0, 0); top.blit(z[1], z[0].w + 6, 0); top.blit(z3, z[0].w * 2 + 12, 0);
      const strips = s.art.layers.map((L) => { const k = L.dens === 1 ? 3 : 2, per = Math.max(1, Math.min(8, Math.floor(1100 / (L.w * k + 2)))), fr = L.frames.filter((_, i) => i % Math.max(1, Math.floor(L.frames.length / per)) === 0).slice(0, per), o = new PC(Math.max(40, fr.length * (L.w * k + 2)), L.h * k + 2); fill(o, [44, 40, 52, 255]); fr.forEach((f, i) => o.blit(scaleNN(f, k), i * (L.w * k + 2), 1)); return o; });
      stackV([top, ...strips], 4).save(path.join(dev, `${s.key.replace("@", "_")}.png`));
    }
    console.log(`dev: ${list.map((s) => s.key).join(", ")} → ${dev}`);
    return;
  }
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(path.join(OUT, "classes"), { recursive: true }); fs.mkdirSync(SHEETS, { recursive: true }); fs.mkdirSync(path.join(OUT, "compare"), { recursive: true });
  writeSheets(list);
  const order = ["warrior", "healer", "mage", "rogue", "ranger", "deathknight", "bloodweaver", "darkranger", "warlock", "reaver"];
  const parts: PC[] = [];
  for (const c of order) { const sh = rowsSheet(CLASS_EN[c] ?? c, list.filter((s) => s.cls === c && s.group === "buff")); sh.save(path.join(OUT, "classes", `${c}.png`)); parts.push(sh); }
  stackV(parts, 10).save(path.join(OUT, "classes.png"));
  rowsSheet("common effects (same for all classes)", list.filter((s) => s.group === "common")).save(path.join(OUT, "common.png"));
  rowsSheet("debuffs (proposal)", list.filter((s) => s.group === "debuff")).save(path.join(OUT, "debuffs.png"));
  rowsSheet("zones: effect on every unit inside the zone", list.filter((s) => s.group === "zone")).save(path.join(OUT, "zones.png"));
  allSheet(list, 2, 13).save(path.join(OUT, "all.png"));
  allSheet(list, 3, 10).save(path.join(OUT, "all-z3.png"));
  stackSheet(list).save(path.join(OUT, "stack.png"));
  // compare/<ключ>.png — все пары; compare.png — доработанные по замечаниям и 10 характерных, в две колонки (поровну по высоте)
  const pairOf = new Map(list.map((s) => { const p = comparePair(s); p.save(path.join(OUT, "compare", `${s.key.replace("@", "_")}.png`)); return [s.key, p] as const; }));
  const sel = [...REWORKED, ...REF_FIXED, ...CHARACTERISTIC].map((k) => pairOf.get(k)).filter((p): p is PC => !!p);
  const total = sel.reduce((q, p) => q + p.h + 6, 0);
  let acc = 0, cut = sel.length;
  for (let i = 0; i < sel.length; i++) { acc += sel[i].h + 6; if (acc >= total / 2) { cut = i + 1; break; } }
  const colA = stackV(sel.slice(0, cut), 6), colB = stackV(sel.slice(cut), 6), head = 30;
  const cmp = new PC(colA.w + colB.w + 12, Math.max(colA.h, colB.h) + head); fill(cmp, BG); cmp.blit(colA, 0, head); cmp.blit(colB, colA.w + 12, head);
  lbl(cmp, `ours | pack reference, same scale: ${REWORKED.length} redrawn after review, ${REF_FIXED.length} with a closer reference, then ${CHARACTERISTIC.length} characteristic`, 4, 6, GOLD);
  lbl(cmp, "each pair: key and full vendor path of the reference with frame numbers; ours z2 next to ref x2, ours z3 next to ref x3", 4, 16, [150, 200, 255, 255]);
  cmp.save(path.join(OUT, "compare.png"));
  writeTable(list);
  writeAudit(list);
  console.log(`обозначений: ${list.length}; превью: ${OUT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = process.argv.find((a) => a.startsWith("--only="));
  writeAll(o ? new Set(o.slice(7).split(",")) : undefined);
}
void EASE;
