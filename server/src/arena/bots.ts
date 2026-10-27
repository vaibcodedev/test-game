/**
 * Боты арены: создание героя под уровень и снаряжение игрока и простой ИИ.
 * ИИ: ближний бой — сближение (A* через Nav в World.stepToward), дальний — держит дистанцию,
 * автоатака через targetId, умения — когда готовы и хватает маны.
 */
import { CLASSES, type ClassId, type FactionId } from "../../../shared/classes";
import { FACTIONS } from "../../../shared/factions";
import type { Item } from "../../../shared/items";
import { lineClear, walkable } from "../../../shared/map";
import { findPath } from "../../../shared/path";
import { SKILLS, activeSkills, skillMana } from "../../../shared/skills";
import { PLAYER_RADIUS } from "../../../shared/constants";
import { allocStats, learnSkills, pickGear } from "./botgear";
import { BAL } from "../../../shared/balance";
import type { PlayerSave } from "../db";
import { newSave, type Player } from "../game/Player";
import { castSkill } from "../game/skills";
import type { World } from "../game/World";

export interface BotSpec {
  name: string;
  nameKey: string;
  cls: ClassId;
  level: number;
  rating: number;
  save: PlayerSave;
}

const BOT_NAMES = ["Гром", "Вихрь", "Клык", "Тень", "Искра", "Буран", "Шип", "Ворон"];

/** Сила бота против героев по рейтингу (data/balance.json pvp.botPower: [рейтинг, множитель], линейно). */
export function botPower(rating: number, pts = BAL.pvp.botPower): number {
  if (!pts?.length) return 1;
  if (rating <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [r0, k0] = pts[i - 1], [r1, k1] = pts[i];
    if (rating <= r1) return k0 + ((k1 - k0) * (rating - r0)) / (r1 - r0);
  }
  return pts[pts.length - 1][1];
}

/**
 * Сохранение бота: та же сборка, что у симулятора баланса (botgear.ts: allocStats, PvP-умения, pickGear — танк с одноручным
 * оружием и щитом), уровень — образца, экипировка — на ступень ниже героя: герой в улучшенной (легендарка или средняя заточка
 * от +5) → бот в эпической/легендарной экипировке уровня с заточкой pvp.botGearPlus вместо +10, иначе — в редкой уровня без заточки. Сила — botPower(рейтинг).
 * Раньше вещи копировались с образца: Храмовник брал двуручную легендарку Потрошителя, бот в легендарках +10 был сильнее героя.
 */
export function botSave(cls: ClassId, level: number, like?: PlayerSave, rating?: number): PlayerSave {
  const s = newSave(cls, { x: 0, y: 0 });
  s.level = level;
  s.alloc = allocStats(cls, level);
  s.skills = learnSkills(cls, level, "pvp");
  const items = like ? (Object.values(like.equip).filter(Boolean) as Item[]) : [];
  const plus = items.length ? items.reduce((a, it) => a + (it.plus || 0), 0) / items.length : 0;
  const strong = items.some((it) => it.legendary) || plus >= 5;
  s.equip = pickGear(cls, level, s.alloc, s.skills, strong ? "max" : "level");
  if (strong) for (const it of Object.values(s.equip)) if (it) it.plus = BAL.pvp.botGearPlus ?? 0;
  if (rating !== undefined) { s.botPower = botPower(rating); s.botTaken = botPower(rating, BAL.pvp.botTaken); }
  return s;
}

/** Набор ботов с неповторяющимися именами под уровень/снаряжение образца. */
export function makeBots(count: number, level: number, rating: number, like: PlayerSave | undefined, taken: Set<string>, faction: FactionId = "solgard"): BotSpec[] {
  const pool = FACTIONS[faction].classes;
  const out: BotSpec[] = [];
  const names = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
  for (let i = 0; i < count; i++) {
    const n = names[i] ?? `${BOT_NAMES[0]} ${i + 1}`;
    taken.add(n);
    const name = `Бот ${n}`;
    const cls = pool[Math.floor(Math.random() * pool.length)];
    out.push({ name, nameKey: name.toLowerCase(), cls, level, rating, save: botSave(cls, level, like, rating) });
  }
  return out;
}

const KEEP_MIN = 140; // дальний бой: ближе — отходим

/** Лекарь-бот: лечит себя и союзников (щит и обновление на раненых, круг света на группу), остальное время бьёт автоатакой. */
function healerThink(w: World, bot: Player) {
  const mates = [...w.players.values()].filter((x) => !x.dead && (x === bot || !w.hostile(bot, x)) && Math.hypot(x.x - bot.x, x.y - bot.y) < 300);
  const ratio = (x: Player) => x.unit.hp / Math.max(1, x.unit.maxHp);
  const hurt = mates.filter((x) => ratio(x) < 0.7);
  const can = (id: string) => {
    const rank = bot.save.skills[id] || 0;
    return rank > 0 && (bot.cds.get(id) || 0) <= w.time && bot.unit.mp >= skillMana(SKILLS[id], rank, bot.level);
  };
  const low = [...mates].sort((a, b) => ratio(a) - ratio(b))[0];
  if (!low) return;
  // каст удался (null) — на этом такте всё; отказ сервера — пробуем следующее умение, а не стоим
  const cast = (id: string, t: Player) => castSkill(w, bot, id, t.x, t.y, t.id) === null;
  // «Круг света» — только в прямой видимости (решение 3, shared/skillShape.ts): центр — самый раненый из видимых
  const seen = hurt.filter((x) => x === bot || lineClear(w.map, bot.x, bot.y, x.x, x.y)).sort((a, b) => ratio(a) - ratio(b));
  if (seen.length >= 2 && can("circle") && cast("circle", seen[0])) return;
  if (ratio(low) < 0.55 && can("holyshield") && low.shieldUntil <= w.time && cast("holyshield", low)) return;
  if (ratio(low) < 0.75 && can("heal") && cast("heal", low)) return;
  if (ratio(low) < 0.9 && can("renew")) cast("renew", low);
}

/** Один шаг решения бота (вызывается несколько раз в секунду). */
/** Следующее решение бота (реакция как у игрока: pvp.botReactMs) — по боту. */
const nextThink = new WeakMap<Player, number>();
/** Защитные умения бота — только когда своё здоровье ниже порога (как ИИ симулятора баланса). */
const DEFENSIVE: Record<string, number> = { shieldblock: 0.92, dk_bone_armor: 0.92, mg_barrier: 0.75, dk_anti_magic: 0.65, tp_divine: 0.35, as_smoke: 0.5 };

export function botThink(w: World, bot: Player, enemies: Player[]) {
  if (bot.dead || bot.frozenUntil > w.time) return;
  // реакция: решение не чаще, чем раз в botReactMs (случайно в диапазоне), — не мгновенные цепочки умений
  const [r0, r1] = BAL.pvp.botReactMs ?? [250, 250];
  if ((nextThink.get(bot) ?? 0) > w.time) return;
  nextThink.set(bot, w.time + r0 + Math.random() * (r1 - r0));
  let target: Player | undefined, best = Infinity;
  for (const e of enemies) {
    if (w.stealthed(e)) continue; // скрытного врага выбрать нельзя
    const d = Math.hypot(e.x - bot.x, e.y - bot.y);
    if (d < best) { best = d; target = e; }
  }
  if (!target) { bot.targetId = null; bot.moveTo = null; return; }
  bot.targetId = target.id;
  bot.engaged = bot.approach = true;
  bot.unit.target = target.id;
  // дальний бой: держим дистанцию, отходя по проходимому пути
  if (bot.ranged() && best < KEEP_MIN) {
    const ang = Math.atan2(bot.y - target.y, bot.x - target.x);
    for (const da of [0, 0.7, -0.7, 1.4, -1.4]) {
      const tx = bot.x + Math.cos(ang + da) * 120, ty = bot.y + Math.sin(ang + da) * 120;
      if (walkable(w.map, tx, ty, PLAYER_RADIUS) && findPath(w.map, bot.x, bot.y, tx, ty, PLAYER_RADIUS, 800)) { bot.moveTo = { x: tx, y: ty }; break; }
    }
  } else if (bot.moveTo && best >= KEEP_MIN) bot.moveTo = null;
  if (bot.cls === "healer") return healerThink(w, bot);
  // неидеальная ротация: в часть решений бот только бьёт автоатакой
  if (Math.random() < (BAL.pvp.botSkip ?? 0)) return;
  const hpr = bot.unit.hp / Math.max(1, bot.unit.maxHp);
  // умения
  for (const s of activeSkills(bot.cls)) {
    const rank = bot.save.skills[s.id] || 0;
    if (DEFENSIVE[s.id] !== undefined && hpr > DEFENSIVE[s.id]) continue;
    if (!rank || s.id === "stealth" || s.id === "dr_shadowmeld" || (bot.cds.get(s.id) || 0) > w.time || bot.unit.mp < skillMana(s, rank, bot.level)) continue;
    const reach = s.target === "self" ? Math.max(bot.attackRange(), 90) : (s.range ?? bot.attackRange()) + 20;
    if (best > reach) continue;
    if (!castSkill(w, bot, s.id, target.x, target.y, target.id)) break; // одно умение за раз
  }
}
