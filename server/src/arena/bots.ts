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
import { allocStats, learnSkills, pickGear, type GearMode } from "./botgear";
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

/**
 * Сохранение бота: та же сборка, что у симулятора баланса (botgear.ts: allocStats, PvP-умения, pickGear — танк с одноручным
 * оружием и щитом), уровень — образца; экипировка «максимальная» (эпик/легендарки +10), если образец в улучшенной экипировке
 * (легендарка или средняя заточка от +5), иначе — редкая уровня. Раньше вещи копировались с образца: Храмовник брал двуручную
 * легендарку Потрошителя (урон вдвое выше, чем у танка в симуляторе), очки — 60/40 и все умения по кругу.
 */
export function botSave(cls: ClassId, level: number, like?: PlayerSave): PlayerSave {
  const s = newSave(cls, { x: 0, y: 0 });
  s.level = level;
  s.alloc = allocStats(cls, level);
  s.skills = learnSkills(cls, level, "pvp");
  const items = like ? (Object.values(like.equip).filter(Boolean) as Item[]) : [];
  const plus = items.length ? items.reduce((a, it) => a + (it.plus || 0), 0) / items.length : 0;
  const gear: GearMode = items.some((it) => it.legendary) || plus >= 5 ? "max" : "level";
  s.equip = pickGear(cls, level, s.alloc, s.skills, gear);
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
    out.push({ name, nameKey: name.toLowerCase(), cls, level, rating, save: botSave(cls, level, like) });
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
export function botThink(w: World, bot: Player, enemies: Player[]) {
  if (bot.dead || bot.frozenUntil > w.time) return;
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
  // умения
  for (const s of activeSkills(bot.cls)) {
    const rank = bot.save.skills[s.id] || 0;
    if (!rank || s.id === "stealth" || s.id === "dr_shadowmeld" || (bot.cds.get(s.id) || 0) > w.time || bot.unit.mp < skillMana(s, rank, bot.level)) continue;
    const reach = s.target === "self" ? Math.max(bot.attackRange(), 90) : (s.range ?? bot.attackRange()) + 20;
    if (best > reach) continue;
    if (!castSkill(w, bot, s.id, target.x, target.y, target.id)) break; // одно умение за раз
  }
}
