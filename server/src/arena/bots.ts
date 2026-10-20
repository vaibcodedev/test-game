/**
 * Боты арены: создание героя под уровень и снаряжение игрока и простой ИИ.
 * ИИ: ближний бой — сближение (A* через Nav в World.stepToward), дальний — держит дистанцию,
 * автоатака через targetId, умения — когда готовы и хватает маны.
 */
import { CLASSES, type ClassId, type FactionId } from "../../../shared/classes";
import { FACTIONS } from "../../../shared/factions";
import { BASE_ITEMS, canEquip, lootCategories, makeItem, OFFHAND_CLASSES, Rarity, SLOTS, type Item, type ItemStatKey, type Slot } from "../../../shared/items";
import { LEGEND_TIERS, LEGENDARIES } from "../../../shared/legendary";
import { walkable } from "../../../shared/map";
import { findPath } from "../../../shared/path";
import { SKILLS, activeSkills, classSkills, skillMana } from "../../../shared/skills";
import { PLAYER_RADIUS } from "../../../shared/constants";
import { skillPointsAt, statPointsAt } from "../../../shared/formulas";
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
 * Вещь бота «как у образца» в слоте: если класс бота может её надеть — копия (с заточкой, моделью и легендаркой);
 * иначе — вещь его класса того же слота, уровня, редкости и заточки; за чужую легендарку — добавка её бюджета
 * (data/legendaries.json _tiers.budget × вес слота) в главную характеристику и Выносливость.
 */
function mirrorItem(it: Item, slot: Slot, cls: ClassId, level: number): Item | null {
  if (!canEquip(it, cls, level)) return JSON.parse(JSON.stringify(it)) as Item;
  const main = CLASSES[cls].mainStat;
  const bases = slot === "weapon" ? [BASE_ITEMS[CLASSES[cls].startWeapon]] : lootCategories(cls).filter((b) => b.slot === slot);
  const base = bases.find((b) => b && b.slot === slot);
  if (!base) return null;
  const rarity = Math.min(it.rarity, Rarity.Legendary) as Rarity;
  const out = makeItem(base.id, it.ilvl, rarity, () => 0.5, [main, "vit"]);
  out.req = Math.min(out.req, level);
  if (it.plus) out.plus = it.plus;
  const leg = it.legendary ? LEGENDARIES[it.legendary] : undefined;
  if (leg) {
    const pts = LEGEND_TIERS.budget[leg.ti] * (LEGEND_TIERS.slot[slot] ?? 1);
    const add = (k: ItemStatKey, v: number) => { out.stats[k] = (out.stats[k] || 0) + Math.round(v); };
    add(main, pts * 0.6);
    add("vit", pts * 0.4);
  }
  return out;
}

/** Сохранение бота: уровень и предметы как у образца, очки характеристик и умений распределены. */
export function botSave(cls: ClassId, level: number, like?: PlayerSave): PlayerSave {
  const s = newSave(cls, { x: 0, y: 0 });
  s.level = level;
  const pts = statPointsAt(level);
  s.alloc = { str: 0, agi: 0, int: 0, vit: 0 };
  const main = CLASSES[cls].mainStat === "vit" ? "str" : CLASSES[cls].mainStat;
  s.alloc[main] = Math.ceil(pts * 0.6);
  s.alloc.vit = pts - s.alloc[main];
  if (like) {
    // зеркально честно: заточка, редкость и уровень вещей — как у образца (раньше оружие создавалось заново без заточки)
    for (const slot of SLOTS as Slot[]) {
      const it = like.equip[slot];
      if (!it) continue;
      if (slot === "offhand" && !OFFHAND_CLASSES.includes(cls)) continue;
      s.equip[slot] = mirrorItem(it, slot, cls, level);
    }
    const w = s.equip.weapon;
    if (w && BASE_ITEMS[w.base]?.hands === 2) s.equip.offhand = null;
  }
  // очки умений (skillPointsAt, стартовое уже вложено) — по кругу по доступным умениям
  let free = skillPointsAt(level) - 1;
  const tree = classSkills(cls);
  for (let changed = true; free > 0 && changed; ) {
    changed = false;
    for (const d of tree) {
      if (free <= 0) break;
      const r = s.skills[d.id] || 0;
      if (r >= d.maxRank || d.reqLevel > level) continue;
      if (d.req && (s.skills[d.req.id] || 0) < d.req.rank) continue;
      s.skills[d.id] = r + 1;
      free--;
      changed = true;
    }
  }
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
  if (hurt.length >= 2 && can("circle")) { castSkill(w, bot, "circle", low.x, low.y, low.id); return; }
  if (ratio(low) < 0.55 && can("holyshield") && low.shieldUntil <= w.time) { castSkill(w, bot, "holyshield", low.x, low.y, low.id); return; }
  if (ratio(low) < 0.75 && can("heal")) { castSkill(w, bot, "heal", low.x, low.y, low.id); return; }
  if (ratio(low) < 0.9 && can("renew")) castSkill(w, bot, "renew", low.x, low.y, low.id);
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
