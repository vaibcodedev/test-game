import world from "../data/world.json";
import ai from "../data/mobAI.json";
import raid from "../data/raid.json";
import { bossBal } from "./balance";
import { ZB_CARDS, ZB_MOB } from "./zoneBosses";

/** Поведение моба из data/mobAI.json. */
export interface MobAI {
  kite?: { min: number };
  heal?: { range: number; pct: number; cd: number };
  slam?: { r: number; ms: number; mult: number; cd: number; k: string };
  /** Бросок: цель вне ближнего боя, но ближе range — снаряд с mult урона удара (k — тип) вместо удара; против бесконечного кайта. */
  throw?: { range: number; mult: number; k: string };
  weak?: { dmg?: Record<string, number>; cc?: Partial<Record<"stun" | "slow" | "root", number>> };
}
export const MOB_AI = ai as unknown as Record<string, MobAI>;

export interface MobDef {
  id: string;
  name: string;
  /** Имя спрайт-листа в client/public/assets/units. */
  sprite: string;
  /** 1 — кадр 32×32, 2 — кадр 64×64 (боссы), 4 — кадр 128×128 (рейд-босс). */
  size: 1 | 2 | 4;
  hp: number;
  dmg: number;
  armor: number;
  xp: number;
  /** Множитель золота, если он не равен xp (боссам опыт подняли под BALANCE.md, золото — прежнее). */
  gold?: number;
  speed: number;
  aggro: number;
  range: number;
  attackCd: number;
  projectile?: string;
  radius: number;
  boss?: boolean;
  /** Рейд (задача 114): босс и приспешники цитадели — награды выдаёт рейд (World.onRaidKill), а не grantKillRewards. */
  raid?: boolean;
  /** Боссы: фиксированный уровень, время возрождения и уникальный лут. */
  level?: number;
  respawn?: number;
  uniques?: string[];
  color: string;
  /** Усиленный (элитный) вариант (задача 140): свой спрайт-лист и имя без случайной приставки. */
  eliteSprite?: string;
  eliteName?: string;
}

export const MOBS: Record<string, MobDef> = {
  // Задача 140, партия 1 — образы зон 1–40 (листы — tools/gen/mobs/game.ts; обычный и усиленный вариант).
  // Числа — как у прежних мобов тех же ролей: ближник ≈ кабан/волк, рой ≈ слизень, дальник ≈ гоблин-шаман, одиночка ≈ голем.
  boarfolk_axe: { id: "boarfolk_axe", name: "Кабанолюд-рубака", sprite: "boarfolk_axe", eliteSprite: "boarfolk_axe_elite", eliteName: "Матёрый кабанолюд-секач", size: 1, hp: 1.1, dmg: 1.0, armor: 1, xp: 1, speed: 85, aggro: 150, range: 38, attackCd: 1.5, radius: 12, color: "#a0704e" },
  boarfolk_shield: { id: "boarfolk_shield", name: "Кабанолюд-щитоносец", sprite: "boarfolk_shield", eliteSprite: "boarfolk_shield_elite", eliteName: "Матёрый кабанолюд-щитоносец", size: 1, hp: 1.3, dmg: 0.95, armor: 1.4, xp: 1.1, speed: 80, aggro: 150, range: 38, attackCd: 1.5, radius: 12, color: "#8a5e40" },
  ratfolk_cutter: { id: "ratfolk_cutter", name: "Амбарный крысолюд-резака", sprite: "ratfolk_cutter", eliteSprite: "ratfolk_cutter_elite", eliteName: "Матёрый крысолюд-резака", size: 1, hp: 0.7, dmg: 0.75, armor: 0.5, xp: 0.8, speed: 100, aggro: 140, range: 34, attackCd: 1.1, radius: 10, color: "#806a52" },
  ratfolk_poacher: { id: "ratfolk_poacher", name: "Крысолюд-браконьер", sprite: "ratfolk_poacher", eliteSprite: "ratfolk_poacher_elite", eliteName: "Матёрый крысолюд-браконьер", size: 1, hp: 0.8, dmg: 1.05, armor: 0.6, xp: 1.05, speed: 85, aggro: 220, range: 190, attackCd: 1.8, projectile: "arrow", radius: 10, color: "#6a5a44" },
  goblin_slinger: { id: "goblin_slinger", name: "Гоблин-пращник", sprite: "goblin_slinger", eliteSprite: "goblin_slinger_elite", eliteName: "Бывалый гоблин-пращник", size: 1, hp: 0.8, dmg: 1.0, armor: 0.6, xp: 1.0, speed: 80, aggro: 210, range: 180, attackCd: 1.8, projectile: "arrow", radius: 10, color: "#86903a" },
  goblin_slasher: { id: "goblin_slasher", name: "Гоблин-рубака", sprite: "goblin_slasher", eliteSprite: "goblin_slasher_elite", eliteName: "Бывалый гоблин-рубака", size: 1, hp: 0.9, dmg: 1.1, armor: 0.8, xp: 1.05, speed: 80, aggro: 160, range: 36, attackCd: 1.2, radius: 10, color: "#7aa83c" },
  goblin_shaman: { id: "goblin_shaman", name: "Гоблин-шаман", sprite: "goblin_shaman", eliteSprite: "goblin_shaman_elite", eliteName: "Бывалый гоблин-шаман", size: 1, hp: 0.8, dmg: 1.1, armor: 0.5, xp: 1.15, speed: 70, aggro: 220, range: 200, attackCd: 1.9, projectile: "shadow", radius: 10, color: "#5d8a3a" },
  zombie_digger: { id: "zombie_digger", name: "Зомби-могильщик", sprite: "zombie_digger", eliteSprite: "zombie_digger_elite", eliteName: "Неупокоенный зомби-могильщик", size: 1, hp: 1.2, dmg: 1.0, armor: 0.9, xp: 1.05, speed: 62, aggro: 150, range: 40, attackCd: 1.6, radius: 11, color: "#7a7a6a" },
  zombie_anchor: { id: "zombie_anchor", name: "Утопленник с якорем", sprite: "zombie_anchor", eliteSprite: "zombie_anchor_elite", eliteName: "Неупокоенный утопленник", size: 1, hp: 1.4, dmg: 1.0, armor: 1.3, xp: 1.15, speed: 58, aggro: 150, range: 40, attackCd: 1.7, radius: 11, color: "#5e8a7a" },
  imp_fork: { id: "imp_fork", name: "Курганный бесёнок", sprite: "imp_fork", eliteSprite: "imp_fork_elite", eliteName: "Огненный бесёнок", size: 1, hp: 0.7, dmg: 0.8, armor: 0.5, xp: 0.8, speed: 105, aggro: 160, range: 36, attackCd: 1.1, radius: 9, color: "#ae4a3c" },
  imp_ash: { id: "imp_ash", name: "Пепельный бесёнок", sprite: "imp_fork", eliteSprite: "imp_fork_elite", eliteName: "Огненный бесёнок", size: 1, hp: 0.7, dmg: 0.85, armor: 0.5, xp: 0.8, speed: 105, aggro: 160, range: 36, attackCd: 1.1, radius: 9, color: "#c05a3c" },
  imp_caster: { id: "imp_caster", name: "Бес-заклинатель", sprite: "imp_caster", eliteSprite: "imp_caster_elite", eliteName: "Огненный бес-заклинатель", size: 1, hp: 0.75, dmg: 1.1, armor: 0.5, xp: 1.1, speed: 90, aggro: 210, range: 190, attackCd: 1.9, projectile: "shadow", radius: 9, color: "#6a34a0" },
  imp_thrower: { id: "imp_thrower", name: "Бес-метатель", sprite: "imp_thrower", eliteSprite: "imp_thrower_elite", eliteName: "Огненный бес-метатель", size: 1, hp: 0.75, dmg: 1.05, armor: 0.5, xp: 1.05, speed: 95, aggro: 200, range: 170, attackCd: 1.7, projectile: "arrow", radius: 9, color: "#8a3a2a" },
  skeleton_bow: { id: "skeleton_bow", name: "Скелет-лучник", sprite: "skeleton_bow", eliteSprite: "skeleton_bow_elite", eliteName: "Пробуждённый скелет-лучник", size: 1, hp: 0.85, dmg: 1.05, armor: 1.0, xp: 1.0, speed: 72, aggro: 220, range: 190, attackCd: 1.8, projectile: "arrow", radius: 10, color: "#ddd6c1" },
  skeleton_sword: { id: "skeleton_sword", name: "Скелет-мечник", sprite: "skeleton_sword", eliteSprite: "skeleton_sword_elite", eliteName: "Пробуждённый скелет-мечник", size: 1, hp: 1, dmg: 1.1, armor: 1.2, xp: 1, speed: 75, aggro: 170, range: 38, attackCd: 1.3, radius: 10, color: "#ddd6c1" },
  skeleton_mage: { id: "skeleton_mage", name: "Скелет-маг", sprite: "skeleton_mage", eliteSprite: "skeleton_mage_elite", eliteName: "Пробуждённый скелет-маг", size: 1, hp: 0.8, dmg: 1.15, armor: 0.8, xp: 1.15, speed: 70, aggro: 220, range: 200, attackCd: 1.9, projectile: "shadow", radius: 10, color: "#47c6ea" },
  wolffolk_chaser: { id: "wolffolk_chaser", name: "Волколюд-загонщик", sprite: "wolffolk_chaser", eliteSprite: "wolffolk_chaser_elite", eliteName: "Лютый волколюд-вожак", size: 1, hp: 1, dmg: 1.1, armor: 0.8, xp: 1, speed: 110, aggro: 190, range: 38, attackCd: 1.1, radius: 11, color: "#8e94a0" },
  wolffolk_hunter: { id: "wolffolk_hunter", name: "Волколюд-охотник", sprite: "wolffolk_hunter", eliteSprite: "wolffolk_hunter_elite", eliteName: "Лютый волколюд-охотник", size: 1, hp: 0.85, dmg: 1.05, armor: 0.7, xp: 1.05, speed: 100, aggro: 230, range: 190, attackCd: 1.8, projectile: "arrow", radius: 11, color: "#6e7280" },
  satyr_piper: { id: "satyr_piper", name: "Сатир-флейтист", sprite: "satyr_piper", eliteSprite: "satyr_piper_elite", eliteName: "Дикий сатир-флейтист", size: 1, hp: 0.8, dmg: 1.05, armor: 0.5, xp: 1.15, speed: 90, aggro: 220, range: 200, attackCd: 1.9, projectile: "arcane", radius: 10, color: "#8a7ad0" },
  satyr_spear: { id: "satyr_spear", name: "Сатир-копейщик", sprite: "satyr_spear", eliteSprite: "satyr_spear_elite", eliteName: "Дикий сатир-копейщик", size: 1, hp: 1, dmg: 1.15, armor: 0.8, xp: 1.05, speed: 95, aggro: 180, range: 44, attackCd: 1.3, radius: 11, color: "#a27c48" },
  ghoul_catcher: { id: "ghoul_catcher", name: "Вурдалак-ловец", sprite: "ghoul_catcher", eliteSprite: "ghoul_catcher_elite", eliteName: "Матёрый вурдалак-вожак", size: 1, hp: 1, dmg: 1.1, armor: 0.8, xp: 1, speed: 105, aggro: 190, range: 36, attackCd: 1.1, radius: 11, color: "#a49caa" },
  ghoul_eater: { id: "ghoul_eater", name: "Вурдалак-трупоед", sprite: "ghoul_eater", eliteSprite: "ghoul_eater_elite", eliteName: "Матёрый вурдалак-трупоед", size: 1, hp: 1.1, dmg: 1.1, armor: 0.9, xp: 1.05, speed: 95, aggro: 180, range: 38, attackCd: 1.3, radius: 11, color: "#8a8296" },
  ghoul_leaper: { id: "ghoul_leaper", name: "Вурдалак-прыгун", sprite: "ghoul_leaper", eliteSprite: "ghoul_leaper_elite", eliteName: "Матёрый вурдалак-прыгун", size: 1, hp: 0.9, dmg: 1.2, armor: 0.7, xp: 1.05, speed: 115, aggro: 220, range: 48, attackCd: 1.4, radius: 11, color: "#7a7282" },
  hobgoblin_sword: { id: "hobgoblin_sword", name: "Хобгоблин-мечник", sprite: "hobgoblin_sword", eliteSprite: "hobgoblin_halberd_elite", eliteName: "Закалённый хобгоблин-сотник", size: 1, hp: 1.25, dmg: 1.05, armor: 1.4, xp: 1.1, speed: 82, aggro: 170, range: 38, attackCd: 1.4, radius: 11, color: "#a8563a" },
  kobold_digger: { id: "kobold_digger", name: "Кобольд-копатель", sprite: "kobold_digger", eliteSprite: "kobold_digger_elite", eliteName: "Чешуйчатый кобольд-копатель", size: 1, hp: 0.7, dmg: 0.8, armor: 0.6, xp: 0.8, speed: 100, aggro: 150, range: 34, attackCd: 1.1, radius: 9, color: "#b47a34" },
  kobold_bomber: { id: "kobold_bomber", name: "Кобольд-подрывник", sprite: "kobold_bomber", eliteSprite: "kobold_bomber_elite", eliteName: "Чешуйчатый кобольд-подрывник", size: 1, hp: 0.75, dmg: 1.15, armor: 0.5, xp: 1.05, speed: 90, aggro: 200, range: 170, attackCd: 2.0, projectile: "fire", radius: 9, color: "#935a36" },
  mummy_guard: { id: "mummy_guard", name: "Мумия-стражница", sprite: "mummy_guard", eliteSprite: "mummy_guard_elite", eliteName: "Древняя мумия-хранительница", size: 1, hp: 1.3, dmg: 1.0, armor: 1.4, xp: 1.1, speed: 65, aggro: 160, range: 38, attackCd: 1.5, radius: 11, color: "#b8ac88" },
  ogre_woodcutter: { id: "ogre_woodcutter", name: "Огр-лесоруб", sprite: "ogre_woodcutter", eliteSprite: "ogre_woodcutter_elite", eliteName: "Матёрый огр-лесоруб", size: 1, hp: 1.8, dmg: 1.3, armor: 1.3, xp: 1.5, speed: 58, aggro: 160, range: 50, attackCd: 2.0, radius: 16, color: "#c4a486" },
  frogfolk_harpoon: { id: "frogfolk_harpoon", name: "Жаболюд-гарпунщик", sprite: "frogfolk_harpoon", eliteSprite: "frogfolk_harpoon_elite", eliteName: "Раздувшийся жаболюд-гарпунщик", size: 1, hp: 1.05, dmg: 1.1, armor: 0.8, xp: 1.05, speed: 80, aggro: 170, range: 46, attackCd: 1.4, radius: 11, color: "#86903a" },
  frogfolk_shaman: { id: "frogfolk_shaman", name: "Жаболюд-шаман", sprite: "frogfolk_shaman", eliteSprite: "frogfolk_shaman_elite", eliteName: "Раздувшийся жаболюд-шаман", size: 1, hp: 0.85, dmg: 1.05, armor: 0.6, xp: 1.15, speed: 70, aggro: 220, range: 190, attackCd: 2.0, projectile: "poison", radius: 11, color: "#3c8a3e" },
  troll_brute: { id: "troll_brute", name: "Топяной тролль", sprite: "troll_brute", eliteSprite: "troll_brute_elite", eliteName: "Древний топяной тролль", size: 1, hp: 1.8, dmg: 1.3, armor: 1.2, xp: 1.5, speed: 60, aggro: 160, range: 48, attackCd: 2.0, radius: 15, color: "#7a8a90" },
  // Задача 140, партия 2 — зоны 40–100, данж и рейд (листы — tools/gen/mobs/game2.ts). Числа — как у прежних мобов тех же ролей:
  // ближник ≈ шакал/скелет, щитоносец ≈ хобгоблин-мечник, дальник ≈ гоблин-шаман, рой ≈ бесёнок, одиночка ≈ голем; уровень — по зоне.
  // Пустыня Миражей 40–50 (запад)
  gnoll_chaser: { id: "gnoll_chaser", name: "Гнолл-загонщик", sprite: "gnoll_chaser", eliteSprite: "gnoll_chaser_elite", eliteName: "Матёрый гнолл-загонщик", size: 1, hp: 1.0, dmg: 1.1, armor: 0.8, xp: 1, speed: 105, aggro: 190, range: 38, attackCd: 1.2, radius: 11, color: "#ae8648" },
  gnoll_archer: { id: "gnoll_archer", name: "Гнолл-лучник", sprite: "gnoll_archer", eliteSprite: "gnoll_archer_elite", eliteName: "Матёрый гнолл-лучник", size: 1, hp: 0.85, dmg: 1.05, armor: 0.7, xp: 1.05, speed: 95, aggro: 230, range: 190, attackCd: 1.8, projectile: "arrow", radius: 11, color: "#94703a" },
  lizardfolk_javelin: { id: "lizardfolk_javelin", name: "Ящеролюд-метатель дротиков", sprite: "lizardfolk_javelin", eliteSprite: "lizardfolk_javelin_elite", eliteName: "Древний ящеролюд-метатель", size: 1, hp: 0.85, dmg: 1.1, armor: 0.8, xp: 1.05, speed: 90, aggro: 210, range: 170, attackCd: 1.7, projectile: "arrow", radius: 11, color: "#6a7c38" },
  lizardfolk_shaman: { id: "lizardfolk_shaman", name: "Ящеролюд-шаман", sprite: "lizardfolk_shaman", eliteSprite: "lizardfolk_shaman_elite", eliteName: "Древний ящеролюд-шаман", size: 1, hp: 0.85, dmg: 1.05, armor: 0.6, xp: 1.15, speed: 75, aggro: 220, range: 190, attackCd: 2.0, projectile: "poison", radius: 11, color: "#4a5a26" },
  nomad_axe: { id: "nomad_axe", name: "Кочевник-рубака", sprite: "barbarian_axe", eliteSprite: "barbarian_axe_elite", eliteName: "Матёрый кочевник-рубака", size: 1, hp: 1.05, dmg: 1.15, armor: 0.9, xp: 1.05, speed: 90, aggro: 170, range: 38, attackCd: 1.3, radius: 11, color: "#8c8474" },
  arthro_scorpion: { id: "arthro_scorpion", name: "Песчаный скорпион", sprite: "arthro_scorpion", eliteSprite: "arthro_scorpion_elite", eliteName: "Матёрый песчаный скорпион", size: 1, hp: 1.1, dmg: 1.3, armor: 1.2, xp: 1.15, speed: 80, aggro: 150, range: 38, attackCd: 1.4, radius: 12, color: "#ae8644" },
  golem_sandstone: { id: "golem_sandstone", name: "Песчаниковый голем", sprite: "golem_sandstone", eliteSprite: "golem_sandstone_elite", eliteName: "Пробуждённый песчаниковый голем", size: 1, hp: 1.8, dmg: 1.3, armor: 1.6, xp: 1.5, speed: 55, aggro: 150, range: 46, attackCd: 2.0, radius: 16, color: "#b4884e" },
  // Пепельная пустошь 40–50 (восток)
  orc_axe: { id: "orc_axe", name: "Орк-рубака", sprite: "orc_axe", eliteSprite: "orc_axe_elite", eliteName: "Свирепый орк-рубака", size: 1, hp: 1.1, dmg: 1.15, armor: 1.0, xp: 1.1, speed: 88, aggro: 170, range: 40, attackCd: 1.3, radius: 12, color: "#7c9444" },
  orc_shield: { id: "orc_shield", name: "Орк-щитоносец", sprite: "orc_shield", eliteSprite: "orc_shield_elite", eliteName: "Свирепый орк-щитоносец", size: 1, hp: 1.35, dmg: 1.0, armor: 1.4, xp: 1.15, speed: 80, aggro: 170, range: 40, attackCd: 1.5, radius: 12, color: "#58702e" },
  zombie_charred: { id: "zombie_charred", name: "Обугленный мертвец", sprite: "zombie_digger", eliteSprite: "zombie_digger_elite", eliteName: "Неупокоенный обугленный мертвец", size: 1, hp: 1.2, dmg: 1.0, armor: 0.9, xp: 1.05, speed: 62, aggro: 150, range: 40, attackCd: 1.6, radius: 11, color: "#5a5248" },
  arthro_bone: { id: "arthro_bone", name: "Костяной скорпион", sprite: "arthro_bone", eliteSprite: "arthro_bone_elite", eliteName: "Пробуждённый костяной скорпион", size: 1, hp: 1.1, dmg: 1.3, armor: 1.2, xp: 1.15, speed: 80, aggro: 150, range: 38, attackCd: 1.4, radius: 12, color: "#cbb27c" },
  golem_lava: { id: "golem_lava", name: "Лавовый голем", sprite: "golem_lava", eliteSprite: "golem_lava_elite", eliteName: "Пробуждённый лавовый голем", size: 1, hp: 1.8, dmg: 1.3, armor: 1.6, xp: 1.5, speed: 55, aggro: 150, range: 46, attackCd: 2.0, radius: 16, color: "#8a5040" },
  // Пустошь Павших 50–60 (запад)
  marauder_axe: { id: "marauder_axe", name: "Мародёр с секирой", sprite: "barbarian_axe", eliteSprite: "barbarian_axe_elite", eliteName: "Главарь мародёров", size: 1, hp: 1.05, dmg: 1.15, armor: 0.9, xp: 1.05, speed: 90, aggro: 180, range: 38, attackCd: 1.3, radius: 11, color: "#8c8474" },
  marauder_bow: { id: "marauder_bow", name: "Мародёр-лучник", sprite: "barbarian_bow", eliteSprite: "barbarian_bow_elite", eliteName: "Матёрый мародёр-лучник", size: 1, hp: 0.85, dmg: 1.05, armor: 0.7, xp: 1.05, speed: 88, aggro: 230, range: 190, attackCd: 1.8, projectile: "arrow", radius: 11, color: "#6a6256" },
  harpy_scavenger: { id: "harpy_scavenger", name: "Гарпия-падальщица", sprite: "harpy_scavenger", eliteSprite: "harpy_scavenger_elite", eliteName: "Буревая гарпия-падальщица", size: 1, hp: 0.75, dmg: 0.85, armor: 0.5, xp: 0.85, speed: 112, aggro: 170, range: 36, attackCd: 1.1, radius: 10, color: "#8a6844" },
  ogre_brute: { id: "ogre_brute", name: "Огрица-громила", sprite: "ogre_brute", eliteSprite: "ogre_brute_elite", eliteName: "Матёрая огрица-громила", size: 1, hp: 1.8, dmg: 1.3, armor: 1.3, xp: 1.5, speed: 58, aggro: 160, range: 50, attackCd: 2.0, radius: 16, color: "#8a986c" },
  canine_jackal: { id: "canine_jackal", name: "Шакал", sprite: "canine_jackal", eliteSprite: "canine_jackal_elite", eliteName: "Матёрый шакал", size: 1, hp: 0.9, dmg: 1.1, armor: 0.7, xp: 1, speed: 115, aggro: 200, range: 36, attackCd: 1.0, radius: 11, color: "#aa8246" },
  basilisk_sand: { id: "basilisk_sand", name: "Песчаный василиск", sprite: "basilisk_sand", eliteSprite: "basilisk_sand_elite", eliteName: "Древний песчаный василиск", size: 1, hp: 1.5, dmg: 1.25, armor: 1.3, xp: 1.35, speed: 70, aggro: 170, range: 40, attackCd: 1.6, radius: 13, color: "#9e763c" },
  // Чумные топи 50–60 (восток)
  slime_plague: { id: "slime_plague", name: "Чумной слизень", sprite: "slime_plague", eliteSprite: "slime_plague_elite", eliteName: "Раздувшийся чумной слизень", size: 1, hp: 0.9, dmg: 1.0, armor: 0.6, xp: 0.95, speed: 60, aggro: 150, range: 180, attackCd: 2.0, projectile: "poison", radius: 11, color: "#b4b036" },
  plague_rat: { id: "plague_rat", name: "Чумной крысолюд-разносчик", sprite: "ratfolk_cutter", eliteSprite: "ratfolk_cutter_elite", eliteName: "Матёрый чумной крысолюд", size: 1, hp: 0.75, dmg: 0.85, armor: 0.5, xp: 0.85, speed: 104, aggro: 150, range: 34, attackCd: 1.1, radius: 10, color: "#6a7a44" },
  frog_spitter: { id: "frog_spitter", name: "Жаболюд-плевальщик", sprite: "frogfolk_shaman", eliteSprite: "frogfolk_shaman_elite", eliteName: "Раздувшийся жаболюд-плевальщик", size: 1, hp: 0.85, dmg: 1.1, armor: 0.6, xp: 1.05, speed: 72, aggro: 220, range: 180, attackCd: 1.9, projectile: "poison", radius: 11, color: "#3c8a3e" },
  bone_witch_staff: { id: "bone_witch_staff", name: "Ведьма-костница", sprite: "bone_witch_staff", eliteSprite: "bone_witch_staff_elite", eliteName: "Древняя ведьма-костница", size: 1, hp: 0.85, dmg: 1.15, armor: 0.6, xp: 1.15, speed: 70, aggro: 220, range: 200, attackCd: 1.9, projectile: "shadow", radius: 11, color: "#62785a" },
  butcher_cleaver: { id: "butcher_cleaver", name: "Мясник", sprite: "butcher_cleaver", eliteSprite: "butcher_cleaver_elite", eliteName: "Гнилостный мясник", size: 1, hp: 1.8, dmg: 1.35, armor: 1.2, xp: 1.5, speed: 58, aggro: 160, range: 48, attackCd: 2.0, radius: 16, color: "#7c9064" },
  butcher_hook: { id: "butcher_hook", name: "Мясник с крюком", sprite: "butcher_hook", eliteSprite: "butcher_hook_elite", eliteName: "Гнилостный мясник с крюком", size: 1, hp: 1.7, dmg: 1.3, armor: 1.2, xp: 1.5, speed: 60, aggro: 200, range: 48, attackCd: 2.0, radius: 16, color: "#668a48" },
  // Грифоньи утёсы 60–70 (запад)
  north_shield: { id: "north_shield", name: "Северянин-щитоносец", sprite: "barbarian_shield", eliteSprite: "barbarian_shield_elite", eliteName: "Матёрый северянин-щитоносец", size: 1, hp: 1.3, dmg: 0.95, armor: 1.4, xp: 1.1, speed: 82, aggro: 170, range: 38, attackCd: 1.5, radius: 11, color: "#6a6256" },
  north_bow: { id: "north_bow", name: "Северянин-лучник", sprite: "barbarian_bow", eliteSprite: "barbarian_bow_elite", eliteName: "Матёрый северянин-лучник", size: 1, hp: 0.85, dmg: 1.05, armor: 0.7, xp: 1.05, speed: 88, aggro: 230, range: 190, attackCd: 1.8, projectile: "arrow", radius: 11, color: "#8c8474" },
  harpy_screamer: { id: "harpy_screamer", name: "Гарпия-крикунья", sprite: "harpy_screamer", eliteSprite: "harpy_screamer_elite", eliteName: "Буревая гарпия-крикунья", size: 1, hp: 0.8, dmg: 1.05, armor: 0.5, xp: 1.05, speed: 100, aggro: 220, range: 180, attackCd: 1.8, projectile: "arcane", radius: 11, color: "#a07446" },
  orc_mountain: { id: "orc_mountain", name: "Горный орк-рубака", sprite: "orc_axe", eliteSprite: "orc_axe_elite", eliteName: "Свирепый горный орк", size: 1, hp: 1.1, dmg: 1.15, armor: 1.0, xp: 1.1, speed: 88, aggro: 170, range: 40, attackCd: 1.3, radius: 12, color: "#647c36" },
  canine_frost: { id: "canine_frost", name: "Ледяной волк", sprite: "canine_frost", eliteSprite: "canine_frost_elite", eliteName: "Матёрый ледяной волк", size: 1, hp: 1.1, dmg: 1.2, armor: 0.9, xp: 1.1, speed: 115, aggro: 210, range: 38, attackCd: 1.1, radius: 12, color: "#a4bccc" },
  ice_golem: { id: "ice_golem", name: "Ледяной голем", sprite: "ice_golem_ice", eliteSprite: "ice_golem_ice_elite", eliteName: "Пробуждённый ледяной голем", size: 1, hp: 1.9, dmg: 1.3, armor: 1.7, xp: 1.5, speed: 52, aggro: 150, range: 46, attackCd: 2.0, radius: 16, color: "#8ad0ff" },
  // Костяной хребет 60–70 (восток)
  bone_knight: { id: "bone_knight", name: "Скелет-рыцарь", sprite: "skeleton_sword", eliteSprite: "skeleton_sword_elite", eliteName: "Пробуждённый скелет-рыцарь", size: 1, hp: 1.3, dmg: 1.0, armor: 1.5, xp: 1.15, speed: 78, aggro: 170, range: 38, attackCd: 1.4, radius: 11, color: "#ddd6c1" },
  ghoul_bone: { id: "ghoul_bone", name: "Костяной вурдалак", sprite: "ghoul_catcher", eliteSprite: "ghoul_catcher_elite", eliteName: "Матёрый костяной вурдалак", size: 1, hp: 1.0, dmg: 1.15, armor: 0.8, xp: 1.05, speed: 105, aggro: 190, range: 36, attackCd: 1.1, radius: 11, color: "#b4acb8" },
  banshee_wail: { id: "banshee_wail", name: "Банши-плакальщица", sprite: "banshee_wail", eliteSprite: "banshee_wail_elite", eliteName: "Скорбная банши", size: 1, hp: 0.8, dmg: 1.1, armor: 0.5, xp: 1.15, speed: 85, aggro: 230, range: 200, attackCd: 1.9, projectile: "shadow", radius: 11, color: "#7a7e88" },
  banshee_claw: { id: "banshee_claw", name: "Когтистая банши", sprite: "banshee_claw", eliteSprite: "banshee_claw_elite", eliteName: "Скорбная когтистая банши", size: 1, hp: 0.9, dmg: 1.15, armor: 0.6, xp: 1.05, speed: 110, aggro: 190, range: 36, attackCd: 1.1, radius: 11, color: "#a8acb4" },
  void_spirit_caster: { id: "void_spirit_caster", name: "Зовущее из бездны", sprite: "void_spirit_caster", eliteSprite: "void_spirit_caster_elite", eliteName: "Бездонное зовущее", size: 1, hp: 0.85, dmg: 1.1, armor: 0.6, xp: 1.1, speed: 80, aggro: 220, range: 190, attackCd: 1.9, projectile: "arcane", radius: 11, color: "#7a3aa0" },
  golem_obsidian: { id: "golem_obsidian", name: "Обсидиановый голем", sprite: "golem_obsidian", eliteSprite: "golem_obsidian_elite", eliteName: "Пробуждённый обсидиановый голем", size: 1, hp: 1.8, dmg: 1.3, armor: 1.6, xp: 1.5, speed: 55, aggro: 150, range: 46, attackCd: 2.0, radius: 16, color: "#4a4258" },
  // Грозовой хребет 70–80
  troll_snow: { id: "troll_snow", name: "Снежный тролль", sprite: "troll_brute", eliteSprite: "troll_brute_elite", eliteName: "Древний снежный тролль", size: 1, hp: 1.8, dmg: 1.3, armor: 1.2, xp: 1.5, speed: 60, aggro: 160, range: 48, attackCd: 2.0, radius: 15, color: "#a0aeb0" },
  orc_thunder: { id: "orc_thunder", name: "Орк-громовержец", sprite: "orc_thunder", eliteSprite: "orc_thunder_elite", eliteName: "Свирепый орк-громовержец", size: 1, hp: 0.85, dmg: 1.15, armor: 0.7, xp: 1.15, speed: 75, aggro: 220, range: 200, attackCd: 1.9, projectile: "arcane", radius: 12, color: "#5a9ae8" },
  orc_bow: { id: "orc_bow", name: "Орк-лучник", sprite: "orc_bow", eliteSprite: "orc_bow_elite", eliteName: "Свирепый орк-лучник", size: 1, hp: 0.9, dmg: 1.1, armor: 0.8, xp: 1.05, speed: 85, aggro: 230, range: 190, attackCd: 1.8, projectile: "arrow", radius: 12, color: "#7c9444" },
  harpy_storm: { id: "harpy_storm", name: "Грозовая гарпия", sprite: "harpy_storm", eliteSprite: "harpy_storm_elite", eliteName: "Буревая грозовая гарпия", size: 1, hp: 0.8, dmg: 1.05, armor: 0.5, xp: 1.05, speed: 100, aggro: 220, range: 180, attackCd: 1.8, projectile: "arcane", radius: 11, color: "#687c90" },
  // Поля вечных битв 80–100: павшие обеих фракций и духи павших
  legion_sol: { id: "legion_sol", name: "Павший легионер Сольгарда", sprite: "barbarian_legion", eliteSprite: "barbarian_legion_elite", eliteName: "Неупокоенный легионер Сольгарда", size: 1, hp: 1.3, dmg: 1.0, armor: 1.5, xp: 1.15, speed: 82, aggro: 180, range: 38, attackCd: 1.4, radius: 11, color: "#bab2a0" },
  fallen_umbrath: { id: "fallen_umbrath", name: "Павший латник Умбрата", sprite: "skeleton_sword", eliteSprite: "skeleton_sword_elite", eliteName: "Пробуждённый латник Умбрата", size: 1, hp: 1.3, dmg: 1.0, armor: 1.5, xp: 1.15, speed: 78, aggro: 180, range: 38, attackCd: 1.4, radius: 11, color: "#c4bca4" },
  orc_merc: { id: "orc_merc", name: "Орк-наёмник", sprite: "orc_axe", eliteSprite: "orc_axe_elite", eliteName: "Свирепый орк-военачальник", size: 1, hp: 1.1, dmg: 1.15, armor: 1.0, xp: 1.1, speed: 88, aggro: 170, range: 40, attackCd: 1.3, radius: 12, color: "#7c9444" },
  golem_siege: { id: "golem_siege", name: "Осадный голем", sprite: "golem_siege", eliteSprite: "golem_siege_elite", eliteName: "Пробуждённый осадный голем", size: 1, hp: 1.9, dmg: 1.35, armor: 1.7, xp: 1.55, speed: 52, aggro: 160, range: 48, attackCd: 2.1, radius: 16, color: "#84848a" },
  fallen_spirit_warrior: { id: "fallen_spirit_warrior", name: "Дух павшего воина", sprite: "fallen_spirit_warrior", eliteSprite: "fallen_spirit_warrior_elite", eliteName: "Неупокоенный знаменосец", size: 1, hp: 1.0, dmg: 1.1, armor: 1.0, xp: 1.05, speed: 95, aggro: 190, range: 38, attackCd: 1.3, radius: 11, color: "#84aec4" },
  fallen_spirit_spear: { id: "fallen_spirit_spear", name: "Дух павшего копейщика", sprite: "fallen_spirit_spear", eliteSprite: "fallen_spirit_spear_elite", eliteName: "Неупокоенный дух копейщика", size: 1, hp: 1.0, dmg: 1.15, armor: 0.8, xp: 1.05, speed: 95, aggro: 190, range: 44, attackCd: 1.3, radius: 11, color: "#7aa0b8" },
  fallen_spirit_archer: { id: "fallen_spirit_archer", name: "Дух павшего лучника", sprite: "fallen_spirit_archer", eliteSprite: "fallen_spirit_archer_elite", eliteName: "Неупокоенный дух лучника", size: 1, hp: 0.85, dmg: 1.05, armor: 0.7, xp: 1.05, speed: 90, aggro: 230, range: 190, attackCd: 1.8, projectile: "arrow", radius: 11, color: "#6e94ac" },
  fallen_spirit_hollow: { id: "fallen_spirit_hollow", name: "Пустой латник", sprite: "fallen_spirit_hollow", eliteSprite: "fallen_spirit_hollow_elite", eliteName: "Неупокоенный пустой латник", size: 1, hp: 1.3, dmg: 1.05, armor: 1.4, xp: 1.15, speed: 80, aggro: 180, range: 40, attackCd: 1.5, radius: 11, color: "#566676" },
  fallen_spirit_shroud: { id: "fallen_spirit_shroud", name: "Саванный дух", sprite: "fallen_spirit_shroud", eliteSprite: "fallen_spirit_shroud_elite", eliteName: "Неупокоенный саванный дух", size: 1, hp: 0.8, dmg: 1.15, armor: 0.5, xp: 1.15, speed: 85, aggro: 220, range: 200, attackCd: 1.9, projectile: "frost", radius: 11, color: "#a4b0ba" },
  fallen_spirit_ash: { id: "fallen_spirit_ash", name: "Пепельный ратник", sprite: "fallen_spirit_ash", eliteSprite: "fallen_spirit_ash_elite", eliteName: "Неупокоенный пепельный ратник", size: 1, hp: 1.05, dmg: 1.15, armor: 0.9, xp: 1.05, speed: 90, aggro: 180, range: 38, attackCd: 1.3, radius: 11, color: "#86827a" },
  fallen_spirit_drowned: { id: "fallen_spirit_drowned", name: "Дух утопленника", sprite: "fallen_spirit_drowned", eliteSprite: "fallen_spirit_drowned_elite", eliteName: "Неупокоенный дух утопленника", size: 1, hp: 0.85, dmg: 1.1, armor: 0.6, xp: 1.15, speed: 80, aggro: 220, range: 190, attackCd: 1.9, projectile: "frost", radius: 11, color: "#5cbcb4" },
  fallen_spirit_undead: { id: "fallen_spirit_undead", name: "Дух павшего нежитя", sprite: "fallen_spirit_undead", eliteSprite: "fallen_spirit_undead_elite", eliteName: "Неупокоенный дух нежитя", size: 1, hp: 1.3, dmg: 0.95, armor: 1.4, xp: 1.1, speed: 80, aggro: 180, range: 38, attackCd: 1.5, radius: 11, color: "#cbb27c" },
  // Пылающий вулкан 80–100
  slime_magma: { id: "slime_magma", name: "Магмовый слизень", sprite: "slime_magma", eliteSprite: "slime_magma_elite", eliteName: "Раздувшийся магмовый слизень", size: 1, hp: 1.2, dmg: 1.3, armor: 1.0, xp: 1.2, speed: 62, aggro: 150, range: 34, attackCd: 1.5, radius: 12, color: "#f0701c" },
  canine_lava: { id: "canine_lava", name: "Лавовый пёс", sprite: "canine_lava", eliteSprite: "canine_lava_elite", eliteName: "Матёрый лавовый пёс", size: 1, hp: 1.2, dmg: 1.35, armor: 1.0, xp: 1.3, speed: 118, aggro: 220, range: 38, attackCd: 1.1, radius: 12, color: "#74583e" },
  lizardfolk_salamander: { id: "lizardfolk_salamander", name: "Ящеролюд-саламандра", sprite: "lizardfolk_salamander", eliteSprite: "lizardfolk_salamander_elite", eliteName: "Древний ящеролюд-саламандра", size: 1, hp: 1.1, dmg: 1.2, armor: 1.0, xp: 1.1, speed: 95, aggro: 190, range: 44, attackCd: 1.3, radius: 11, color: "#b44a20" },
  golem_magma: { id: "golem_magma", name: "Магмовый голем", sprite: "golem_magma", eliteSprite: "golem_magma_elite", eliteName: "Пробуждённый магмовый голем", size: 1, hp: 1.9, dmg: 1.35, armor: 1.6, xp: 1.55, speed: 52, aggro: 150, range: 46, attackCd: 2.0, radius: 16, color: "#8a462e" },
  // Пепельные чертоги 85–95 (данж)
  cultist_pyro: { id: "cultist_pyro", name: "Культист-пиромант", sprite: "barbarian_pyro", eliteSprite: "barbarian_pyro_elite", eliteName: "Верховный культист-пиромант", size: 1, hp: 0.85, dmg: 1.2, armor: 0.6, xp: 1.15, speed: 75, aggro: 230, range: 200, attackCd: 1.9, projectile: "fire", radius: 11, color: "#942e22" },
  ash_knight: { id: "ash_knight", name: "Пепельный рыцарь", sprite: "skeleton_sword", eliteSprite: "skeleton_sword_elite", eliteName: "Пробуждённый пепельный рыцарь", size: 1, hp: 1.4, dmg: 1.25, armor: 1.6, xp: 1.3, speed: 80, aggro: 200, range: 40, attackCd: 1.3, radius: 11, color: "#b8b4c8" },
  wrapped_guard: { id: "wrapped_guard", name: "Обмотанный страж", sprite: "wrapped_construct_guard", eliteSprite: "wrapped_construct_guard_elite", eliteName: "Пробуждённый обмотанный страж", size: 1, hp: 1.4, dmg: 1.15, armor: 1.4, xp: 1.25, speed: 80, aggro: 180, range: 38, attackCd: 1.4, radius: 11, color: "#7048a8" },
  wrapped_weaver: { id: "wrapped_weaver", name: "Обмотанная ткачиха", sprite: "wrapped_construct_weaver", eliteSprite: "wrapped_construct_weaver_elite", eliteName: "Пробуждённая обмотанная ткачиха", size: 1, hp: 0.85, dmg: 1.15, armor: 0.6, xp: 1.15, speed: 78, aggro: 230, range: 200, attackCd: 1.9, projectile: "arcane", radius: 11, color: "#9468cc" },
  skeleton: { id: "skeleton", name: "Скелет", sprite: "skeleton", size: 1, hp: 1, dmg: 1.1, armor: 1.2, xp: 1, speed: 75, aggro: 170, range: 38, attackCd: 1.3, radius: 10, color: "#ddd6c1" },
  drowned: { id: "drowned", name: "Утопленник", sprite: "drowned", size: 1, hp: 1.3, dmg: 1.0, armor: 0.8, xp: 1.1, speed: 60, aggro: 150, range: 38, attackCd: 1.6, radius: 11, color: "#5e8a7a" },
  imp: { id: "imp", name: "Огненный бес", sprite: "imp", size: 1, hp: 0.8, dmg: 1.2, armor: 0.6, xp: 1.1, speed: 100, aggro: 210, range: 190, attackCd: 1.6, projectile: "fire", radius: 10, color: "#e0603a" },
  skeleton_knight: { id: "skeleton_knight", name: "Рыцарь-скелет", sprite: "skeleton_knight", size: 1, hp: 1.4, dmg: 1.25, armor: 1.6, xp: 1.3, speed: 80, aggro: 200, range: 40, attackCd: 1.3, radius: 11, color: "#b8b4c8" },
  bandit: { id: "bandit", name: "Разбойник с большой дороги", sprite: "rogue", size: 1, hp: 1, dmg: 1.1, armor: 0.9, xp: 1.1, speed: 90, aggro: 260, range: 36, attackCd: 1.2, radius: 10, color: "#b0805a" },
  bandit_leader: { id: "bandit_leader", name: "Главарь засады", sprite: "warrior", size: 1, hp: 1.8, dmg: 1.3, armor: 1.3, xp: 1.8, speed: 85, aggro: 260, range: 38, attackCd: 1.3, radius: 12, color: "#d04a3a" },
  sapling: { id: "sapling", name: "Саженец", sprite: "sapling", size: 1, hp: 0.45, dmg: 0.7, armor: 0.5, xp: 0.25, speed: 75, aggro: 400, range: 34, attackCd: 1.3, radius: 10, color: "#6fae4a" },

  ent: {
    id: "ent", name: "Древний Энт", sprite: "ent", size: 2, boss: true, level: 14, respawn: 120, hp: 16, dmg: 1.5, armor: 1.5, xp: 57, gold: 25,
    speed: 48, aggro: 250, range: 70, attackCd: 2.2, radius: 26, color: "#4f7a32",
    uniques: ["heartwood_staff", "rootbreaker", "whisperwind", "bark_helm"],
  },
  witch: {
    id: "witch", name: "Болотная Ведьма", sprite: "witch", size: 2, boss: true, level: 22, respawn: 150, hp: 18, dmg: 1.4, armor: 1.2, xp: 64, gold: 28,
    speed: 70, aggro: 290, range: 240, attackCd: 1.7, projectile: "poison", radius: 22, color: "#7a4e9a",
    uniques: ["hexed_ring", "bog_mantle", "witch_eye", "swamp_treads"],
  },
  ashlord: {
    id: "ashlord", name: "Повелитель Пепла", sprite: "ashlord", size: 2, boss: true, level: 30, respawn: 180, hp: 22, dmg: 1.6, armor: 1.8, xp: 190, gold: 35,
    speed: 72, aggro: 330, range: 80, attackCd: 2.0, radius: 26, color: "#d0482a",
    uniques: ["ashbringer", "cinder_staff", "phoenix_bow", "ashen_crown"],
  },
};

// боссы стартовых земель (задача 136): карточки data/zone-bosses.json, числа моба — там же (mob), уровень — levels.boss
{
  const z = ZB_MOB ?? { hp: 30, dmg: 2.2, armor: 1.3, xp: 20, gold: 1, speed: 62, aggro: 260, range: 64, attackCd: 2, radius: 22, color: {} };
  const scale = world.levels.levelCap / world.levels.designCap;
  for (const c of ZB_CARDS) {
    MOBS[c.id] = {
      id: c.id, name: c.name, sprite: c.id, size: 2, boss: true, level: Math.max(1, Math.round(c.levels.boss * scale)), respawn: c.respawnMs / 1000,
      hp: z.hp, dmg: z.dmg, armor: z.armor, xp: z.xp, gold: z.gold, speed: z.speed, aggro: z.aggro, range: z.range, attackCd: z.attackCd, radius: z.radius,
      color: z.color[c.id] ?? "#c87a3a",
    };
  }
}

// уровни боссов — из data/world.json (пересчитываются вместе с уровнями зон); здоровье, урон и броня — data/balance.json bosses
{
  const scale = world.levels.levelCap / world.levels.designCap;
  for (const [id, lv] of Object.entries(world.bosses)) if (MOBS[id]) MOBS[id].level = Math.max(1, Math.round(lv * scale));
  for (const m of Object.values(MOBS)) {
    const b = m.boss ? bossBal(m.id) : undefined;
    if (b) { m.hp = b.hp; m.dmg = b.dmg; m.armor = b.armor; }
  }
}

// рейд «Рогатый Рыцарь Хаоса» (задача 114): босс и приспешники — data/raid.json; здоровье, урон и броня босса — data/balance.json bosses.chaos_knight
{
  const b = raid.boss, bb = bossBal(b.id);
  MOBS[b.id] = {
    id: b.id, name: b.name, sprite: b.sprite, size: 4, boss: true, raid: true, level: b.level, hp: bb?.hp ?? 300, dmg: bb?.dmg ?? 5, armor: bb?.armor ?? 2,
    xp: b.xp, speed: b.speed, aggro: b.aggro, range: b.reach, attackCd: b.attackCd, radius: b.radius, color: b.color,
  };
  type RawAdd = { name: string; sprite: string; hp: number; dmg: number; armor: number; speed: number; radius: number; range: number; attackCd: number; projectile?: string };
  for (const [id, a] of Object.entries(raid.adds as unknown as Record<string, RawAdd>)) {
    if (id.startsWith("_")) continue;
    MOBS[id] = { id, name: a.name, sprite: a.sprite, size: 1, raid: true, hp: a.hp, dmg: a.dmg, armor: a.armor, xp: 0, speed: a.speed, aggro: 900, range: a.range, attackCd: a.attackCd, radius: a.radius, projectile: a.projectile, color: "#ff6a2a" };
  }
}
