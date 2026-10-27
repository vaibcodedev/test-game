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

import mobData from "../data/mobs.json";

/** Мобы мира из data/mobs.json (правятся в редакторе конфигов); боссы стартовых земель и рейда добавляются ниже из своих файлов. */
export const MOBS: Record<string, MobDef> = Object.fromEntries(Object.entries(mobData.mobs).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, { ...(v as object) } as unknown as MobDef]));

// боссы стартовых земель (задача 136): карточки data/zone-bosses.json, числа моба — там же (mob), уровень — levels.boss
{
  const z = ZB_MOB ?? { hp: 30, dmg: 2.2, armor: 1.3, xp: 20, gold: 1, speed: 62, aggro: 260, range: 64, attackCd: 2, radius: 22, color: {} };
  const scale = world.levels.levelCap / world.levels.designCap;
  for (const c of ZB_CARDS) {
    MOBS[c.id] = {
      id: c.id, name: c.name, sprite: c.id, size: 2, boss: true, level: Math.max(1, Math.round(c.levels.boss * scale)), respawn: c.respawnMs / 1000,
      hp: c.mob?.hp ?? z.hp, dmg: c.mob?.dmg ?? z.dmg, armor: c.mob?.armor ?? z.armor, xp: c.mob?.xp ?? z.xp, gold: c.mob?.gold ?? z.gold, speed: c.mob?.speed ?? z.speed,
      aggro: c.mob?.aggro ?? z.aggro, range: c.mob?.range ?? z.range, attackCd: c.mob?.attackCd ?? z.attackCd, radius: c.mob?.radius ?? z.radius,
      color: (c.mob?.color as unknown as string | undefined) ?? z.color[c.id] ?? "#c87a3a",
    };
    // кандальный кол клеток (кольцо, задача 139): стоит на месте, не бьёт, ломается
    const cage = c.abilities.find((a) => a.cage)?.cage;
    // мираж-двойник (кольцо, задача 139): стоит на месте, не бьёт, гибнет от одного удара
    const dbl = c.abilities.find((a) => a.doubles)?.doubles;
    if (dbl) MOBS[`${c.id}_mirage`] = {
      id: `${c.id}_mirage`, name: dbl.name ?? "Мираж", sprite: `${c.id}_mirage`, size: 1, level: Math.max(1, Math.round(c.levels.boss * scale)),
      hp: dbl.hp, dmg: 0, armor: 1, xp: 0, gold: 0, speed: 0, aggro: 0, range: 0, attackCd: 99, radius: 14, color: "#d8c08a",
    };
    if (cage) MOBS[`${c.id}_cage`] = {
      id: `${c.id}_cage`, name: "Кандальный кол", sprite: `${c.id}_cage`, size: 1, level: Math.max(1, Math.round(c.levels.boss * scale)),
      hp: cage.hp, dmg: 0, armor: 1, xp: 0, gold: 0, speed: 0, aggro: 0, range: 0, attackCd: 99, radius: 10, color: "#8a2a08",
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
