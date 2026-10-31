/**
 * Сборка героя-бота под уровень (задача 114, общая с tools/balance/sim.ts): характеристики, умения и экипировка,
 * которые выбирает симулятор баланса. raidBotSave — герой бота рейда.
 */
import { CLASSES, type ClassId, type ClassRole, type Stats } from "../../../shared/classes";
import { activeSkills, classSkills, SKILLS, type SkillDef } from "../../../shared/skills";
import { armorReduction, derive, skillPointsAt, statPointsAt } from "../../../shared/formulas";
import * as itemsMod from "../../../shared/items";
import { BASE_ITEMS, fillSlots, makeItem, OFFHAND_CLASSES, Rarity, type BaseItem, type Item, type ItemStatKey, type Slot } from "../../../shared/items";
import { LEGENDARIES, legendaryFits, makeLegendary } from "../../../shared/legendary";
import { REF_PLUS } from "../../../shared/upgrade";
import type { PlayerSave } from "../db";
import { newSave } from "../game/Player";

const role = (c: ClassId): ClassRole => CLASSES[c].role;
/** Отдельный генератор (не трогает Math.random): выбор моделей предметов. */
function localRand(seed: string): () => number {
  let s = 0;
  for (const ch of seed) s = (Math.imul(s ^ ch.charCodeAt(0), 2654435761) + 1) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hasDmg = (s: SkillDef, r: number) => { const v = s.v(Math.max(1, r)); return (v.dmg ?? 0) > 0 || (v.hit ?? 0) > 0 || (v.tick ?? 0) > 0; };
/** Лечение/поддержка лекаря — в приоритете (по порядку). */
export const HEAL_FIRST = ["holyshield", "cl_aegis", "heal", "bw_transfusion", "bw_sacrifice", "circle", "cl_hymn", "renew", "cl_cleanse", "cl_blessing", "bw_blood_bond"];
/** Активные без поля урона, которые усиливают урон (метки, бафы, открывашки, подрыв эффектов). */
export const DMG_BUFF = new Set(["hr_mark", "wl_hex", "roll", "shadowstep", "stealth", "dr_shadowmeld", "rv_frenzy", "rv_reap", "wl_detonate", "wl_demon", "hr_beast", "mg_timewarp", "dk_rune_blade", "cl_blessing"]);
/** Лечение и поддержка: для лекарей — «главные» умения наравне с уронными. */
export const HEAL_SUPPORT = new Set([...HEAL_FIRST, "bw_blood_circle", "bw_tide"]);
/** Защитные и утилитарные пассивки (живучесть, контроль, спасение от смерти) — последними в PvE-билде. */
export const DEF_PASSIVE = new Set([
  "toughness", "unbending", "laststand", "tp_bulwark", "tp_fortitude", "tp_vanguard", "tp_martyr", "bloodlust",
  "resurrect", "cl_pure_light", "cl_guardian", "cl_last_gift",
  "hr_hamstring",
  "arcane_shield", "mg_manaward", "mg_escape", "mg_expl_barrier",
  "evasion", "as_escape",
  "dk_icebound", "dk_iron_chains", "dk_blood_tap", "dk_deaths_embrace",
  "bw_deep_bonds", "bw_temper", "bw_coagulation", "bw_last_drop",
  "dr_last_shadow",
  "wl_oppress", "wl_shroud", "wl_soul_ward", "wl_leech",
  "rv_anemia", "rv_defiance", "rv_taste",
]);
export const coreActive = (s: SkillDef, cls: ClassId) => hasDmg(s, s.maxRank) || DMG_BUFF.has(s.id) || (role(cls) === "healer" && HEAL_SUPPORT.has(s.id));

export type BuildMode = "pve" | "pvp";

/** Характеристики: танк — Сила/Выносливость пополам, остальные — 2/3 в главную, 1/3 в Выносливость. */
export function allocStats(cls: ClassId, level: number): Stats {
  const pts = statPointsAt(level), c = CLASSES[cls];
  const main = Math.round(pts * (c.role === "tank" ? 0.5 : 2 / 3));
  const a: Stats = { str: 0, agi: 0, int: 0, vit: 0 };
  a[c.mainStat] += main;
  a.vit += pts - main;
  return a;
}

/**
 * Умения (требования доучиваются автоматически, внутри яруса — по кругу до максимума):
 *  PvE: 1) уронные активные (поле урона или DMG_BUFF; у лекарей и лечение) 2) прочие пассивки 3) утилитарные/защитные активные 4) защитные пассивки.
 *  PvP: 1) утилитарные/защитные активные 2) уронные активные 3) защитные пассивки 4) прочие пассивки.
 */
export function learnSkills(cls: ClassId, level: number, mode: BuildMode = "pve"): Record<string, number> {
  const ranks: Record<string, number> = {};
  let pts = skillPointsAt(level);
  const add = (s: SkillDef, depth = 0): boolean => {
    if (pts <= 0 || depth > 6 || (ranks[s.id] || 0) >= s.maxRank || s.reqLevel > level) return false;
    if (s.req && (ranks[s.req.id] || 0) < s.req.rank) {
      const r = SKILLS[s.req.id];
      while ((ranks[r.id] || 0) < s.req.rank) if (!add(r, depth + 1)) return false;
    }
    if (pts <= 0) return false;
    ranks[s.id] = (ranks[s.id] || 0) + 1;
    pts--;
    return true;
  };
  const tree = classSkills(cls).filter((s) => s.reqLevel <= level);
  const byLvl = [...tree].sort((a, b) => a.reqLevel - b.reqLevel || (a.kind === b.kind ? 0 : a.kind === "active" ? -1 : 1));
  const actives = byLvl.filter((s) => s.kind === "active").sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const passives = byLvl.filter((s) => s.kind === "passive");
  const core = actives.filter((s) => coreActive(s, cls)), util = actives.filter((s) => !coreActive(s, cls));
  const offP = passives.filter((s) => !DEF_PASSIVE.has(s.id)), defP = passives.filter((s) => DEF_PASSIVE.has(s.id));
  add(activeSkills(cls)[0]);
  const round = (list: SkillDef[]) => {
    for (let ch = true; ch && pts > 0; ) {
      ch = false;
      for (const s of list) if (add(s)) ch = true;
    }
  };
  for (const tier of mode === "pvp" ? [util, core, defP, offP] : [core, offP, util, defP]) round(tier);
  return ranks;
}

const loose = itemsMod as unknown as Record<string, unknown>;
type ModelLike = { id: string; name: string; lvl: number };
/** Категории, которые класс может носить (каталог моделей, если есть, иначе все базы). */
function categories(cls: ClassId): BaseItem[] {
  const lc = loose.lootCategories as ((c: ClassId) => BaseItem[]) | undefined;
  const list = lc ? lc(cls) : Object.values(BASE_ITEMS);
  return list.filter((b) => b.slot !== "consumable" && (!b.classes || b.classes.includes(cls)));
}
/**
 * Предмет уровня: makeItem(база, уровень, Rare) с аффиксом главной характеристики (+Выносливость у бижутерии) и средним броском.
 * Модель каталога (rollModel, если есть) — только имя/вид: характеристики модели те же, что у базы.
 */
function gearItem(baseId: string, level: number, cls: ClassId, gear: GearMode = "level"): Item {
  const main = CLASSES[cls].mainStat;
  const max = gear === "max";
  // максимальная: эпическая +10, аффиксы — главная характеристика, крит/Выносливость (танк — Выносливость и здоровье)
  const prefer: ItemStatKey[] = !max ? [main, "vit"] : role(cls) === "tank" ? [main, "vit", "hp", "crit"] : [main, "crit", "vit", "hp"];
  const it = makeItem(baseId, level, max ? Rarity.Epic : Rarity.Rare, () => 0.5, prefer);
  if (max) it.plus = REF_PLUS;
  it.req = Math.min(it.req, level);
  const roll = loose.rollModel as ((cat: string, ilvl: number, c?: ClassId, f?: string, r?: () => number) => ModelLike | undefined) | undefined;
  if (roll) {
    const m = roll(baseId, level, cls, CLASSES[cls].faction, localRand(`${baseId}|${level}|${cls}`));
    if (m) { it.model = m.id; it.name = m.name; }
  }
  return it;
}

function power(cls: ClassId, level: number, alloc: Stats, skills: Record<string, number>, equip: Partial<Record<Slot, Item | null>>): number {
  const d = derive({ cls, level, alloc, skills, equip });
  const avg = (d.dmgMin + d.dmgMax) / 2, critF = 1 + d.crit * (d.critMult - 1);
  const r = role(cls);
  const off = r === "healer" ? avg * d.skillMult : r === "caster" ? avg * critF * d.skillMult : avg * critF * (0.5 / d.attackCd + 0.5 * d.skillMult);
  const ehp = d.maxHp / (1 - armorReduction(d.armor, level));
  return r === "tank" ? Math.sqrt(off) * ehp : off * Math.sqrt(ehp);
}

/** Легендарки для максимальной экипировки: ярус и требование не выше уровня, класс может надеть, нужный слот; +10. */
function legendsFor(cls: ClassId, level: number, slot: Slot): Item[] {
  return Object.values(LEGENDARIES)
    .filter((l) => l.tier <= level && l.req <= level && legendaryFits(l.id, cls) && BASE_ITEMS[l.base]?.slot === slot)
    .map((l) => ({ ...makeLegendary(l.id), plus: REF_PLUS }));
}
export const GEAR_SLOTS: Slot[] = ["helmet", "shoulders", "armor", "gloves", "boots", "cloak", "ring", "amulet"];
/**
 * Экипировка: оружие(+вторая рука) и каждый слот брони — лучшая база по оценке power (танк — одноручное + щит).
 * level — редкая уровня; max — эпическая +10 уровня и легендарки +10 (ярус ≤ уровня; у легендарки есть свойство, поэтому
 * при почти равной оценке берётся она — как у полностью прокачанного игрока с админ-выдачей).
 */
export function pickGear(cls: ClassId, level: number, alloc: Stats, skills: Record<string, number>, gear: GearMode = "level"): Record<Slot, Item | null> {
  const cats = categories(cls);
  const tank = role(cls) === "tank";
  const max = gear === "max";
  const eq: Record<Slot, Item | null> = fillSlots({});
  const of = (slot: Slot) => cats.filter((b) => b.slot === slot);
  const cands = (slot: Slot): Item[] => [...of(slot).map((b) => gearItem(b.id, level, cls, gear)), ...(max ? legendsFor(cls, level, slot) : [])];
  const bias = (it: Item | null) => (it?.legendary ? 1.03 : 1);
  for (const s of GEAR_SLOTS) { const c = cands(s)[0]; if (c) eq[s] = c; }
  const pickWeapon = () => {
    let best = -1, bw: Item | null = null, bo: Item | null = null;
    const offs = OFFHAND_CLASSES.includes(cls) ? cands("offhand").filter((o) => !tank || o.base === "shield") : [];
    for (const wi of cands("weapon")) {
      const wb = BASE_ITEMS[wi.base];
      if (tank && wb.hands === 2) continue;
      const ohs: (Item | null)[] = wb.hands === 2 || !offs.length ? [null] : offs;
      for (const oi of ohs) {
        const sc = power(cls, level, alloc, skills, { ...eq, weapon: wi, offhand: oi }) * bias(wi) * bias(oi);
        if (sc > best) { best = sc; bw = wi; bo = oi; }
      }
    }
    eq.weapon = bw;
    eq.offhand = bo;
  };
  pickWeapon();
  for (const s of GEAR_SLOTS) {
    let best = -1, bi: Item | null = eq[s];
    for (const it of cands(s)) {
      const sc = power(cls, level, alloc, skills, { ...eq, [s]: it }) * bias(it);
      if (sc > best) { best = sc; bi = it; }
    }
    eq[s] = bi;
  }
  pickWeapon();
  return eq;
}

export type GearMode = "level" | "max";

const raidCache = new Map<string, PlayerSave>();
/**
 * Герой бота рейда (задача 114): характеристики, умения и экипировка уровня как у симулятора баланса (редкие вещи уровня,
 * лучшая база по оценке), без зелий; титул «Наёмник Цитадели». Каждый раз — новая копия.
 */
export function raidBotSave(cls: ClassId, level: number, title = "", gear: GearMode = "level"): PlayerSave {
  const key = `${cls}|${level}|${gear}`;
  let base = raidCache.get(key);
  if (!base) {
    base = newSave(cls, { x: 0, y: 0 });
    base.level = level;
    base.faction = CLASSES[cls].faction;
    base.alloc = allocStats(cls, level);
    base.skills = learnSkills(cls, level, "pve");
    base.equip = pickGear(cls, level, base.alloc, base.skills, gear);
    base.inventory = base.inventory.map(() => null);
    raidCache.set(key, base);
  }
  const s = JSON.parse(JSON.stringify(base)) as PlayerSave;
  if (title) s.title = title;
  return s;
}
