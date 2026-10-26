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
  skeleton: { id: "skeleton", name: "Скелет", sprite: "skeleton", size: 1, hp: 1, dmg: 1.1, armor: 1.2, xp: 1, speed: 75, aggro: 170, range: 38, attackCd: 1.3, radius: 10, color: "#ddd6c1" },
  drowned: { id: "drowned", name: "Утопленник", sprite: "drowned", size: 1, hp: 1.3, dmg: 1.0, armor: 0.8, xp: 1.1, speed: 60, aggro: 150, range: 38, attackCd: 1.6, radius: 11, color: "#5e8a7a" },
  toxic_slime: { id: "toxic_slime", name: "Ядовитый слизень", sprite: "toxic_slime", size: 1, hp: 0.9, dmg: 1.0, armor: 0.6, xp: 0.95, speed: 60, aggro: 150, range: 180, attackCd: 2.0, projectile: "poison", radius: 11, color: "#b2e04a" },
  imp: { id: "imp", name: "Огненный бес", sprite: "imp", size: 1, hp: 0.8, dmg: 1.2, armor: 0.6, xp: 1.1, speed: 100, aggro: 210, range: 190, attackCd: 1.6, projectile: "fire", radius: 10, color: "#e0603a" },
  golem: { id: "golem", name: "Лавовый голем", sprite: "golem", size: 1, hp: 1.8, dmg: 1.3, armor: 1.6, xp: 1.5, speed: 55, aggro: 150, range: 42, attackCd: 2.0, radius: 13, color: "#8a5040" },
  skeleton_knight: { id: "skeleton_knight", name: "Рыцарь-скелет", sprite: "skeleton_knight", size: 1, hp: 1.4, dmg: 1.25, armor: 1.6, xp: 1.3, speed: 80, aggro: 200, range: 40, attackCd: 1.3, radius: 11, color: "#b8b4c8" },
  bandit: { id: "bandit", name: "Разбойник с большой дороги", sprite: "rogue", size: 1, hp: 1, dmg: 1.1, armor: 0.9, xp: 1.1, speed: 90, aggro: 260, range: 36, attackCd: 1.2, radius: 10, color: "#b0805a" },
  bandit_leader: { id: "bandit_leader", name: "Главарь засады", sprite: "warrior", size: 1, hp: 1.8, dmg: 1.3, armor: 1.3, xp: 1.8, speed: 85, aggro: 260, range: 38, attackCd: 1.3, radius: 12, color: "#d04a3a" },
  // Биомы Неизведанных земель
  jackal: { id: "jackal", name: "Шакал пустыни", sprite: "jackal", size: 1, hp: 0.9, dmg: 1.1, armor: 0.7, xp: 1, speed: 115, aggro: 200, range: 36, attackCd: 1.0, radius: 11, color: "#c8a060" },
  scorpion: { id: "scorpion", name: "Песчаный скорпион", sprite: "scorpion", size: 1, hp: 1.1, dmg: 1.3, armor: 1.2, xp: 1.15, speed: 80, aggro: 150, range: 38, attackCd: 1.4, radius: 11, color: "#d0a050" },
  frost_wolf: { id: "frost_wolf", name: "Ледяной волк", sprite: "frost_wolf", size: 1, hp: 1.1, dmg: 1.2, armor: 0.9, xp: 1.1, speed: 115, aggro: 210, range: 38, attackCd: 1.1, radius: 12, color: "#bfe4ff" },
  ice_golem: { id: "ice_golem", name: "Ледяной голем", sprite: "ice_golem", size: 1, hp: 1.9, dmg: 1.3, armor: 1.7, xp: 1.5, speed: 52, aggro: 150, range: 42, attackCd: 2.0, radius: 13, color: "#8ad0ff" },
  magma_slime: { id: "magma_slime", name: "Магмовый слизень", sprite: "magma_slime", size: 1, hp: 1.2, dmg: 1.3, armor: 1.0, xp: 1.2, speed: 62, aggro: 150, range: 34, attackCd: 1.5, radius: 11, color: "#ff7a2a" },
  lava_hound: { id: "lava_hound", name: "Лавовый пёс", sprite: "lava_hound", size: 1, hp: 1.3, dmg: 1.4, armor: 1.1, xp: 1.4, speed: 118, aggro: 220, range: 190, attackCd: 1.7, projectile: "fire", radius: 12, color: "#ff5a1a" },
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
