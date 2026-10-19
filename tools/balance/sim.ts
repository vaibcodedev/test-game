/**
 * Детерминированный симулятор баланса. Гоняет НАСТОЯЩИЙ серверный код боя: World (его собственный тик TICK_MS),
 * Player/Mob, castSkill (server/src/game/skills.ts) и модули умений классов. Формулы не переписываются.
 *
 * Запуск: npx tsx tools/balance/sim.ts [--out tools/balance/report.json] [--seed 1] [--quick] [--stable]
 *         [--only dummy,pve,heal,pvp] [--classes warrior,mage] [--levels 10,30,60,100] [--pvp-levels 30,100] [--reps 5]
 *         [--dummy-seeds 5] [--pdummy-n 3]
 * Разбор: --trace <умение|dot:вид|auto> (удары по манекену), --pve1 warrior,30,drowned[,приставка] (один бой),
 *         --duel warrior,mage,100[,повтор] (тот же бой, что в матрице PvP).
 * --stable: без блока run (время запуска и длительность), чтобы отчёты двух прогонов сравнивались побайтно.
 *
 * Math.random подменён генератором mulberry32 с сидом (каждый бой — свой сид), время — только w.update(TICK_MS).
 * Сборка героя (newSave/makeItem → newUid → Math.random) идёт на своём генераторе и поток боя не сдвигает.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { World, type Actor, type HitOpts } from "../../server/src/game/World";
import { Player, newSave } from "../../server/src/game/Player";
import { Mob } from "../../server/src/game/Mob";
import { castSkill } from "../../server/src/game/skills";
import { WorldState } from "../../server/src/rooms/schema";
import type { PlayerSave } from "../../server/src/db";
import { CLASSES, CLASS_IDS, type ClassId, type ClassRole, type Stats } from "../../shared/classes";
import { activeSkills, classSkills, SKILLS, type SkillDef } from "../../shared/skills";
import { armorReduction, derive, mobStats, skillPointsAt, statPointsAt } from "../../shared/formulas";
import * as itemsMod from "../../shared/items";
import { BASE_ITEMS, makeItem, OFFHAND_CLASSES, Rarity, type BaseItem, type Item, type Slot } from "../../shared/items";
import { MOBS, type MobDef } from "../../shared/mobs";
import { ELITE } from "../../shared/elites";
import { arenaSpawn, generateArenaMap, MATCH_MS, PVP_DAMAGE_MULT } from "../../shared/arena";
import { CELL_BLOCK, CELL_WALL, generateMap, T, walkable, Zone, type WorldMap } from "../../shared/map";
import { findPath } from "../../shared/path";
import { MAP_SEED, PLAYER_RADIUS, TICK_MS } from "../../shared/constants";

// ======================================================================
//                         аргументы
// ======================================================================
const argv = process.argv.slice(2);
const arg = (k: string): string | undefined => {
  const i = argv.indexOf("--" + k);
  if (i >= 0) return argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "1";
  const eq = argv.find((a) => a.startsWith(`--${k}=`));
  return eq ? eq.slice(k.length + 3) : undefined;
};
const QUICK = argv.includes("--quick");
const STABLE = argv.includes("--stable");
const OUT = arg("out") ?? "tools/balance/report.json";
const BASE_SEED = Number(arg("seed") ?? 1) || 1;
const ONLY = new Set((arg("only") ?? "dummy,pve,heal,pvp").split(","));
const LEVELS = (arg("levels") ?? "10,30,60,100").split(",").map(Number);
const PVP_LEVELS = (arg("pvp-levels") ?? "30,100").split(",").map(Number);
const PVP_REPS = Number(arg("reps") ?? (QUICK ? 1 : 5));
const PVE_SEEDS = QUICK ? 1 : 3;
const ELITE_SEEDS = QUICK ? 2 : 5;
/** Сидов на клетку манекена (среднее и разброс). */
const DUMMY_SEEDS = Math.max(1, Number(arg("dummy-seeds") ?? (QUICK ? 2 : 5)));
/** Манекен под давлением: здоровье = обычный кабан своего уровня × N (3 — как элита, ELITE.hp). */
const PDUMMY_N = Number(arg("pdummy-n") ?? ELITE.hp ?? 3) || 3;
const CLS = (arg("classes")?.split(",") as ClassId[] | undefined) ?? CLASS_IDS;
/** --trace <id умения|dot:вид|auto>: печать каждого удара с этой меткой по манекену (первый сид, чистый манекен). */
const TRACE = arg("trace") ?? null;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// ======================================================================
//                    детерминированная случайность
// ======================================================================
let rngState = 1;
function rng(): number {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
Math.random = rng;
function seedRng(...parts: (number | string)[]) {
  let h = 2166136261 ^ BASE_SEED;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  rngState = h >>> 0 || 1;
}
/** Отдельный генератор (не трогает Math.random): выбор моделей предметов, сборка героя. */
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

// уникальные id на весь прогон: модули умений хранят часть состояния в общих Map по id (umbrath.dots, healers.leeches)
let GID = 0;
const gid = (prefix: string) => `${prefix}${(++GID).toString(36)}s`;

// ======================================================================
//                    версия кода (для отчёта)
// ======================================================================
function codeInfo() {
  const roots = ["server/src/game", "shared", "data", "tools/balance/sim.ts"];
  const files: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) for (const n of fs.readdirSync(abs)) walk(path.posix.join(rel, n));
    else files.push(rel);
  };
  for (const r of roots) walk(r);
  files.sort();
  const h = crypto.createHash("sha1");
  for (const f of files) { h.update(f); h.update("\0"); h.update(fs.readFileSync(path.join(ROOT, f))); h.update("\0"); }
  let gitHead: string | null = null, dirty: string[] | null = null;
  try {
    const opt = { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"] };
    gitHead = execSync("git rev-parse HEAD", opt).toString().trim();
    dirty = execSync(`git status --porcelain -- ${roots.join(" ")}`, opt).toString().split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^\S+\s+/, "")).sort();
  } catch { /* не git */ }
  return { sha1: h.digest("hex"), files: files.length, roots, gitHead, uncommitted: dirty ? dirty.length > 0 : null, uncommittedFiles: dirty };
}
const CODE_AT_START = codeInfo();

// ======================================================================
//                         карты и миры
// ======================================================================
/** Ровное поле со стенами по краю (зона «Арена»: без засад, жары и городов). */
function fieldMap(W = 48, H = 40): WorldMap {
  const vtx = new Uint8Array((W + 1) * (H + 1)).fill(T.Floor);
  const cell = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) cell[y * W + x] |= CELL_BLOCK | CELL_WALL;
  const zone = new Uint8Array(W * H).fill(Zone.Arena);
  return { w: W, h: H, seed: 0, vtx, cell, zone, objects: [], spawns: [], bosses: [], nodes: [], playerSpawn: { x: W * 16, y: H * 16 }, merchant: { x: -1000, y: -1000 }, merchants: [] };
}
const FIELD = fieldMap();
const FIELD_C = { x: FIELD.w * 16, y: FIELD.h * 16 };
const ARENA = generateArenaMap();

/** Умение, «породившее» текущий код: ставится на время castSkill и наследуется отложенными вызовами w.later (снаряды, тики). */
let CTX: string | null = null;
/** Мир без сети (как tests/factions.ts). mobs: true — мир (призывы работают), false — арена. */
function makeWorld(map: WorldMap, mobs: boolean): World {
  const w = new World(new WorldState(), () => {}, { map, mobs, quiet: true });
  (w as unknown as { uid: (p: string) => string }).uid = gid;
  const later = w.later.bind(w);
  // owner передаётся дальше: World.runTimers пропускает таймер погибшего или ушедшего владельца, как в игре
  w.later = (ms, fn, owner) => {
    const c = CTX;
    later(ms, () => { const prev = CTX; CTX = c; try { fn(); } finally { CTX = prev; } }, owner);
  };
  return w;
}

// ======================================================================
//                    классификация умений (ротация и очки)
// ======================================================================
const role = (c: ClassId): ClassRole => CLASSES[c].role;
const ratio = (q: Player) => q.unit.hp / Math.max(1, q.unit.maxHp);
const hasDmg = (s: SkillDef, r: number) => { const v = s.v(Math.max(1, r)); return (v.dmg ?? 0) > 0 || (v.hit ?? 0) > 0 || (v.tick ?? 0) > 0; };
/** Защитные умения: только когда своё здоровье ниже порога. */
const DEFENSIVE: Record<string, number> = { shieldblock: 0.92, dk_bone_armor: 0.92, mg_barrier: 0.75, dk_anti_magic: 0.65, tp_divine: 0.35, as_smoke: 0.5 };
/** Лечение/поддержка лекаря — в приоритете (по порядку). */
const HEAL_FIRST = ["holyshield", "cl_aegis", "heal", "bw_transfusion", "bw_sacrifice", "circle", "cl_hymn", "renew", "cl_cleanse", "cl_blessing", "bw_blood_bond"];
/** Самобафы без урона по площади (кастуются в пределах атаки, даже если у них есть радиус). */
const SELF_BUFF = new Set(["mg_timewarp", "bw_tide", "bw_blood_circle", "hr_barrage", "hr_beast", "wl_meta", "rv_frenzy", "dk_rune_blade"]);
/** Активные без поля урона, которые усиливают урон (метки, бафы, открывашки, подрыв эффектов). */
const DMG_BUFF = new Set(["hr_mark", "wl_hex", "roll", "shadowstep", "stealth", "dr_shadowmeld", "rv_frenzy", "rv_reap", "wl_detonate", "wl_demon", "hr_beast", "mg_timewarp", "dk_rune_blade", "cl_blessing"]);
/** Лечение и поддержка: для лекарей — «главные» умения наравне с уронными. */
const HEAL_SUPPORT = new Set([...HEAL_FIRST, "bw_blood_circle", "bw_tide"]);
/** Защитные и утилитарные пассивки (живучесть, контроль, спасение от смерти) — последними в PvE-билде. */
const DEF_PASSIVE = new Set([
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
const coreActive = (s: SkillDef, cls: ClassId) => hasDmg(s, s.maxRank) || DMG_BUFF.has(s.id) || (role(cls) === "healer" && HEAL_SUPPORT.has(s.id));

// ======================================================================
//                         сборка героя
// ======================================================================
type BuildMode = "pve" | "pvp";

/** Характеристики: танк — Сила/Выносливость пополам, остальные — 2/3 в главную, 1/3 в Выносливость. */
function allocStats(cls: ClassId, level: number): Stats {
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
function learnSkills(cls: ClassId, level: number, mode: BuildMode = "pve"): Record<string, number> {
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
function gearItem(baseId: string, level: number, cls: ClassId): Item {
  const main = CLASSES[cls].mainStat;
  const it = makeItem(baseId, level, Rarity.Rare, () => 0.5, [main, "vit"]);
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

/** Экипировка уровня: оружие(+вторая рука) и каждый слот брони — лучшая база по оценке power (танк — одноручное + щит). */
function pickGear(cls: ClassId, level: number, alloc: Stats, skills: Record<string, number>): Record<Slot, Item | null> {
  const cats = categories(cls);
  const tank = role(cls) === "tank";
  const eq: Record<Slot, Item | null> = { weapon: null, offhand: null, helmet: null, armor: null, boots: null, ring: null, amulet: null };
  const of = (slot: Slot) => cats.filter((b) => b.slot === slot);
  for (const s of ["helmet", "armor", "boots", "ring", "amulet"] as Slot[]) { const c = of(s)[0]; if (c) eq[s] = gearItem(c.id, level, cls); }
  const pickWeapon = () => {
    let best = -1, bw: Item | null = null, bo: Item | null = null;
    const offs = OFFHAND_CLASSES.includes(cls) ? of("offhand").filter((o) => !tank || o.id === "shield") : [];
    for (const wb of of("weapon")) {
      if (tank && wb.hands === 2) continue;
      const wi = gearItem(wb.id, level, cls);
      const ohs: (Item | null)[] = wb.hands === 2 || !offs.length ? [null] : offs.map((o) => gearItem(o.id, level, cls));
      for (const oi of ohs) {
        const sc = power(cls, level, alloc, skills, { ...eq, weapon: wi, offhand: oi });
        if (sc > best) { best = sc; bw = wi; bo = oi; }
      }
    }
    eq.weapon = bw;
    eq.offhand = bo;
  };
  pickWeapon();
  for (const s of ["helmet", "armor", "boots", "ring", "amulet"] as Slot[]) {
    let best = -1, bi: Item | null = eq[s];
    for (const b of of(s)) {
      const it = gearItem(b.id, level, cls);
      const sc = power(cls, level, alloc, skills, { ...eq, [s]: it });
      if (sc > best) { best = sc; bi = it; }
    }
    eq[s] = bi;
  }
  pickWeapon();
  return eq;
}

interface Build { cls: ClassId; level: number; mode: BuildMode; save: PlayerSave }
const buildCache = new Map<string, Build>();
/**
 * Сборка (кэш). newSave/makeItem зовут newUid → Math.random: на время сборки Math.random — свой генератор,
 * поэтому порядок прогонов и кэш не сдвигают случайность боя (--duel/--pve1 повторяют бои из матрицы).
 */
function build(cls: ClassId, level: number, mode: BuildMode = "pve"): Build {
  const key = `${cls}|${level}|${mode}`;
  const hit = buildCache.get(key);
  if (hit) return hit;
  Math.random = localRand(`build|${key}`);
  try {
    const save = newSave(cls, { x: 0, y: 0 });
    save.level = level;
    save.alloc = allocStats(cls, level);
    save.skills = learnSkills(cls, level, mode);
    save.equip = pickGear(cls, level, save.alloc, save.skills);
    save.inventory = save.inventory.map(() => null); // без зелий: бот их не пьёт
    const b: Build = { cls, level, mode, save };
    buildCache.set(key, b);
    return b;
  } finally {
    Math.random = rng;
  }
}
function spawnPlayer(w: World, b: Build, x: number, y: number, team = 0): Player {
  const save = JSON.parse(JSON.stringify(b.save)) as PlayerSave;
  save.x = x;
  save.y = y;
  const p = new Player(gid("p"), `${CLASSES[b.cls].name} ${b.level}`, save, () => {});
  p.team = team;
  p.unit.team = team;
  w.addPlayer(p);
  return p;
}
function buildInfo(b: Build) {
  const d = derive({ cls: b.cls, level: b.level, alloc: b.save.alloc, skills: b.save.skills, equip: b.save.equip });
  return {
    alloc: b.save.alloc,
    skills: b.save.skills,
    gear: Object.fromEntries(Object.entries(b.save.equip).filter(([, it]) => it).map(([s, it]) => [s, { base: it!.base, model: it!.model ?? null, ilvl: it!.ilvl, stats: it!.stats }])),
    derived: { hp: d.maxHp, mp: d.maxMp, dmg: [d.dmgMin, d.dmgMax], armor: d.armor, crit: +d.crit.toFixed(3), critMult: +d.critMult.toFixed(2), dodge: +d.dodge.toFixed(3), attackCd: +d.attackCd.toFixed(3), skillMult: +d.skillMult.toFixed(3), hpRegen: +d.hpRegen.toFixed(2), mpRegen: +d.mpRegen.toFixed(2) },
  };
}
/** Средний удар оружия персонажа (dmgMin+dmgMax)/2 — метрика «урон ×8 от 30-го» из BALANCE.md. */
function avgHit(b: Build) {
  const d = derive({ cls: b.cls, level: b.level, alloc: b.save.alloc, skills: b.save.skills, equip: b.save.equip });
  return (d.dmgMin + d.dmgMax) / 2;
}

// ======================================================================
//                         мобы
// ======================================================================
const DUMMY_DEF: MobDef = { ...MOBS.boar, id: "sim_dummy", name: "Манекен", hp: 1, dmg: 1, armor: 1, xp: 0, speed: 0, aggro: 0, range: 0, projectile: undefined };
/** Манекен под давлением: здоровье кабана × N, броня как у манекена, не ходит (удары — вручную в dummyRun). */
const PDUMMY_DEF: MobDef = { ...MOBS.boar, id: "sim_dummy_p", name: "Манекен-кабан", hp: MOBS.boar.hp * PDUMMY_N, armor: 1, xp: 0, speed: 0, aggro: 0, range: 0, projectile: undefined };
const BRUTE_DEF: MobDef = { ...MOBS.boar, id: "sim_brute", name: "Громила", hp: 1, dmg: 1, armor: 1, xp: 0 };
const INF = 1e9;

function spawnMob(w: World, def: MobDef, level: number, x: number, y: number, elitePrefix = -1): Mob {
  const m = new Mob(gid("m"), def, level, { x, y });
  if (elitePrefix >= 0) {
    // настоящий Mob.rollElite с подставленным броском: шанс прошёл, приставка — заданная
    const seq = [0, (elitePrefix + 0.5) / ELITE.prefixes.length];
    Math.random = () => (seq.length ? seq.shift()! : rng());
    m.rollElite();
    Math.random = rng;
  }
  m.stats = { ...m.stats, xp: 0, gold: [0, 0] }; // без опыта: повышение уровня посреди серии лечило бы героя
  w.addMob(m);
  return m;
}
function immortal(m: Mob) {
  m.stats = { ...m.stats, maxHp: INF };
  m.unit.maxHp = INF;
  m.unit.hp = INF;
}

// ======================================================================
//                         ИИ героя (ротация)
// ======================================================================
const THINK_MS = 250; // как у ботов арены: одно решение (и не больше одного умения) за 0.25 с
const KEEP_MIN = 140; // дальний бой в PvP держит дистанцию (как server/src/arena/bots.ts)
const HURT_MS = 3000;

interface Agent {
  p: Player;
  kite: boolean;
  allies: () => Player[];
  enemies: () => Actor[];
  order: SkillDef[];
  next: number;
  blocked: Map<string, number>;
  timers: Map<string, number>;
  casts: Record<string, number>;
  fails: Record<string, number>;
  spent: number;
  side: number;
}
const hurt = (w: World, q: Player) => w.time - q.hurtAt <= HURT_MS;
const nearHurt = (w: World, a: Agent, r: number) => a.allies().some((q) => !q.dead && w.dist(a.p, q) <= r + PLAYER_RADIUS && (ratio(q) < 0.9 || hurt(w, q)));
/**
 * Умения без урона с условием (как DEFENSIVE): по манекену и мобу, который бьёт героя, они бесполезны.
 * taunt — только если цель-моб бьёт не героя (против игрока — всегда: ослабляет его урон);
 * tp_glare/tp_banner — только если героя били последние 3 с; лечащие ауры Кровотворца — если рядом есть раненый.
 */
const UTILITY: Record<string, (w: World, a: Agent, target: Actor) => boolean> = {
  taunt: (w, a, t) => w.isPlayer(t) || (!!(t as Mob).targetId && (t as Mob).targetId !== a.p.id),
  tp_glare: (w, a) => hurt(w, a.p),
  tp_banner: (w, a) => hurt(w, a.p),
  bw_blood_circle: (w, a) => nearHurt(w, a, SKILLS.bw_blood_circle.v(1).radius ?? 200),
  bw_tide: (w, a) => nearHurt(w, a, SKILLS.bw_tide.v(1).radius ?? 320),
};

function makeAgent(p: Player, o: { kite?: boolean; allies?: () => Player[]; enemies: () => Actor[] }): Agent {
  const learned = activeSkills(p.cls).filter((s) => (p.save.skills[s.id] || 0) > 0);
  const hp = (s: SkillDef) => { const i = HEAL_FIRST.indexOf(s.id); return i < 0 ? 99 : i; };
  const order = learned.sort((a, b) => hp(a) - hp(b) || b.cd!(p.save.skills[b.id]) - a.cd!(p.save.skills[a.id]) || (a.slot ?? 0) - (b.slot ?? 0));
  return { p, kite: !!o.kite, allies: o.allies ?? (() => [p]), enemies: o.enemies, order, next: 0, blocked: new Map(), timers: new Map(), casts: {}, fails: {}, spent: 0, side: 1 };
}

interface Plan { x: number; y: number; tid: string | null; after?: () => void }
/** Радиус «самоцентрового» уронного умения по площади (нужно подойти) или null. */
function selfAoeLimit(w: World, s: SkillDef, rank: number, target: Actor): number | null {
  if (s.target !== "self" || SELF_BUFF.has(s.id)) return null;
  const v = s.v(rank);
  const aoe = (v.radius ?? 0) > 0 && ((v.dmg ?? 0) > 0 || (v.slow ?? 0) > 0 || (v.weak ?? 0) > 0);
  return aoe ? v.radius + w.radiusOf(target) - 4 : null;
}

function planCast(w: World, a: Agent, s: SkillDef, rank: number, target: Actor, dist: number): Plan | null {
  const p = a.p, t = w.time, v = s.v(rank), R = w.radiusOf(target);
  const at = (o: { x: number; y: number }, tid: string | null): Plan => ({ x: o.x, y: o.y, tid });
  const reach = (s.range || 320) + PLAYER_RADIUS;
  const near = a.allies().filter((q) => !q.dead && (q === p || w.dist(p, q) <= reach));
  const others = near.filter((q) => q !== p);
  const low = [...near].sort((x, y) => ratio(x) - ratio(y))[0];
  const lowO = [...others].sort((x, y) => ratio(x) - ratio(y))[0];
  const ready = (k: string) => (a.timers.get(k) ?? -1e12) <= t;
  const timed = (pl: Plan, k: string, ms: number): Plan => ({ ...pl, after: () => a.timers.set(k, t + ms) });
  const fight = dist < 450;

  if (s.id in DEFENSIVE) return ratio(p) < DEFENSIVE[s.id] && fight ? at(target, target.id) : null;
  if (s.id in UTILITY && !UTILITY[s.id](w, a, target)) return null;
  switch (s.id) {
    case "heal": return low && ratio(low) < 0.8 ? at(low, low.id) : null;
    case "renew": { if (!low || ratio(low) >= 0.95 || !ready("renew:" + low.id)) return null; return timed(at(low, low.id), "renew:" + low.id, v.dur * 900); }
    case "holyshield": return low && ratio(low) < 0.9 && low.shieldAmt <= 0 && fight ? at(low, low.id) : null;
    case "cl_cleanse": return low && ratio(low) < 0.85 ? at(low, low.id) : null;
    case "circle": return low && ratio(low) < 0.85 ? at(low, low.id) : null;
    case "cl_aegis": return low && ratio(low) < 0.8 ? at(low, low.id) : null;
    case "cl_hymn": return low && ratio(low) < 0.7 && w.dist(p, low) < v.radius ? at(p, p.id) : null;
    case "cl_blessing": { const q = others[0] ?? p; return fight && ready("bless:" + q.id) ? timed(at(q, q.id), "bless:" + q.id, v.dur * 950) : null; }
    case "bw_blood_bond": { const q = others[0]; return q && fight && ready("bond:" + q.id) ? timed(at(q, q.id), "bond:" + q.id, v.dur * 950) : null; }
    case "bw_sacrifice":
      if (lowO && ratio(lowO) < 0.7 && ratio(p) > 0.45) return at(lowO, lowO.id);
      return !others.length && p.unit.mp < p.unit.maxMp * 0.3 && ratio(p) > 0.6 ? at(p, null) : null; // без цели — кровь в ману
    case "bw_transfusion": return lowO && ratio(lowO) < 0.55 && ratio(p) > ratio(lowO) + 0.2 ? at(lowO, lowO.id) : null;
    case "blink": {
      // полезен только с «Фазовым сдвигом» (урон в точке ухода) — уходим от вплотную подошедшего врага
      if (!(p.save.skills.mg_phase > 0) || dist > 90 + R) return null;
      const ang = Math.atan2(p.y - target.y, p.x - target.x);
      return { x: p.x + Math.cos(ang) * 220, y: p.y + Math.sin(ang) * 220, tid: target.id };
    }
    case "roll": {
      if (dist > p.attackRange() + R + 40) return null;
      const away = dist < KEEP_MIN && a.kite;
      a.side = -a.side;
      const ang = Math.atan2(p.y - target.y, p.x - target.x) + (away ? 0 : (Math.PI / 2) * a.side);
      return { x: p.x + Math.cos(ang) * 200, y: p.y + Math.sin(ang) * 200, tid: target.id };
    }
    case "stealth":
    case "dr_shadowmeld": {
      // уходим в тень, только если сразу готов «открывающий» удар по цели
      if (dist > 300) return null;
      const mana = s.mana!(rank);
      const opener = a.order.find((o) => o.id !== s.id && o.target === "enemy" && hasDmg(o, p.save.skills[o.id]) && (p.cds.get(o.id) || 0) <= t + 600 && p.unit.mp >= mana + o.mana!(p.save.skills[o.id]));
      return opener ? at(target, target.id) : null;
    }
  }
  switch (s.target) {
    case "enemy": return dist <= (s.range ?? 0) + R ? at(target, target.id) : null;
    case "point": return dist <= (s.range || 300) + R ? at(target, target.id) : null;
    case "self": {
      const lim = selfAoeLimit(w, s, rank, target) ?? Math.max(p.attackRange() + R, 90) + 10;
      return dist <= lim ? at(target, target.id) : null;
    }
    case "ally": { const q = others[0] ?? p; return at(q, q.id); }
  }
  return null;
}

function tryCast(w: World, a: Agent, s: SkillDef, target: Actor, dist: number): boolean {
  const p = a.p, t = w.time;
  const rank = p.save.skills[s.id] || 0;
  if (!rank || (p.cds.get(s.id) || 0) > t || (a.blocked.get(s.id) || 0) > t) return false;
  const mana = s.mana!(rank);
  if (p.unit.mp < mana) return false;
  const plan = planCast(w, a, s, rank, target, dist);
  if (!plan) return false;
  CTX = s.id;
  let err: string | null;
  try { err = castSkill(w, p, s.id, plan.x, plan.y, plan.tid); } finally { CTX = null; }
  if ((p.cds.get(s.id) || 0) > t) {
    a.casts[s.id] = (a.casts[s.id] || 0) + 1;
    a.spent += mana;
    plan.after?.();
    return true;
  }
  if (err) {
    a.fails[s.id] = (a.fails[s.id] || 0) + 1;
    a.blocked.set(s.id, t + 700);
  }
  return false;
}

/**
 * Не держащий дистанцию бот подходит к цели, если готово уронное умение по площади вокруг себя, а цель за его радиусом
 * (маг в 180 пикс. и «Ледяная кольцо» 135 — иначе оно не кастуется никогда). Подходит не дальше чем на 120 пикс.
 */
function approachForAoe(w: World, a: Agent, target: Actor, dist: number) {
  const p = a.p, t = w.time;
  for (const s of a.order) {
    if (s.id in DEFENSIVE || s.id in UTILITY) continue;
    const rank = p.save.skills[s.id] || 0;
    if (!rank || !hasDmg(s, rank) || (p.cds.get(s.id) || 0) > t || (a.blocked.get(s.id) || 0) > t || p.unit.mp < s.mana!(rank)) continue;
    const lim = selfAoeLimit(w, s, rank, target);
    if (lim === null || dist <= lim || dist > lim + 120) continue;
    const k = (dist - (lim - 6)) / dist;
    p.moveTo = { x: p.x + (target.x - p.x) * k, y: p.y + (target.y - p.y) * k };
    return;
  }
}

function think(w: World, a: Agent) {
  const p = a.p, t = w.time;
  if (p.dead || t < a.next) return;
  a.next = t + THINK_MS;
  let target: Actor | undefined, best = Infinity;
  for (const e of a.enemies()) {
    if (w.isDead(e) || w.stealthed(e)) continue;
    const d = w.dist(p, e);
    if (d < best) { best = d; target = e; }
  }
  if (!target) { p.targetId = null; p.unit.target = ""; p.moveTo = null; return; }
  const hidden = p.stealthUntil > t;
  if (hidden) {
    // из скрытности не бьём автоатакой: подходим и открываем умением
    p.targetId = null;
    p.unit.target = "";
    const reach = p.ranged() ? 280 : 48 + w.radiusOf(target);
    p.moveTo = best > reach ? { x: target.x, y: target.y } : null;
  } else {
    p.targetId = target.id;
    p.unit.target = target.id;
    if (a.kite && p.ranged() && best < KEEP_MIN) {
      const ang = Math.atan2(p.y - target.y, p.x - target.x);
      for (const da of [0, 0.7, -0.7, 1.4, -1.4]) {
        const tx = p.x + Math.cos(ang + da) * 120, ty = p.y + Math.sin(ang + da) * 120;
        if (walkable(w.map, tx, ty, PLAYER_RADIUS) && findPath(w.map, p.x, p.y, tx, ty, PLAYER_RADIUS, 800)) { p.moveTo = { x: tx, y: ty }; break; }
      }
    } else if (p.moveTo && (!a.kite || best >= KEEP_MIN)) p.moveTo = null;
  }
  const list = hidden ? [...a.order.filter((s) => s.target === "enemy" && hasDmg(s, p.save.skills[s.id])), ...a.order] : a.order;
  for (const s of list) if (tryCast(w, a, s, target, best)) return;
  if (!a.kite && !hidden) approachForAoe(w, a, target, best);
}

// ======================================================================
//                         измерения ресурса
// ======================================================================
/**
 * Мана: regenPerSec — восстановление по derived.mpRegen без обрезки шкалой; procPerSec — приросты сверх него (процы, кровь в ману);
 * wastedAtCap — восстановление, пропавшее на полной шкале; sustain = (maxMp/время + regen + procs) / трата (≥1 — хватает на весь бой).
 */
class Mana {
  min: number;
  oomAt: number | null = null;
  emptyTicks = 0;
  gained = 0;
  regen = 0;
  wasted = 0;
  ticks = 0;
  private prev: number;
  private prevSpent = 0;
  constructor(private a: Agent) {
    const p = a.p;
    const costs = a.order.map((s) => s.mana!(p.save.skills[s.id])).filter((c) => c > 0);
    this.min = costs.length ? Math.min(...costs) : 0;
    this.prev = p.unit.mp;
  }
  tick(time: number) {
    const p = this.a.p;
    const spentNow = this.a.spent - this.prevSpent;
    const d = p.unit.mp - this.prev + spentNow;
    const exp = (p.derived.mpRegen * TICK_MS) / 1000;
    this.regen += exp;
    if (d > 0) this.gained += d;
    if (this.prev >= p.unit.maxMp && p.unit.mp >= p.unit.maxMp && spentNow === 0) this.wasted += exp;
    this.prev = p.unit.mp;
    this.prevSpent = this.a.spent;
    this.ticks++;
    if (p.unit.mp < this.min) { this.emptyTicks++; if (this.oomAt === null) this.oomAt = time / 1000; }
  }
  report(sec: number) {
    const spend = this.a.spent / sec, regen = this.regen / sec;
    const procs = Math.max(0, this.gained - (this.regen - this.wasted)) / sec;
    const maxMp = this.a.p.unit.maxMp;
    return {
      maxMp, oomAt: this.oomAt, spendPerSec: r1(spend), regenPerSec: r1(regen), procPerSec: r1(procs), wastedAtCap: r1(this.wasted / sec),
      sustain: spend > 0 ? r3((maxMp / sec + regen + procs) / spend) : null, emptyShare: r3(this.emptyTicks / Math.max(1, this.ticks)), mpLeft: Math.round(this.a.p.unit.mp),
    };
  }
}
type ManaReport = ReturnType<Mana["report"]>;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
/** Среднее отчётов маны по нескольким сидам. */
function manaAvg(ms: ManaReport[]) {
  const oom = ms.filter((m) => m.oomAt !== null).map((m) => m.oomAt!);
  const f = (k: keyof ManaReport) => r1(avg(ms.map((m) => (m[k] as number) ?? 0)));
  const sus = ms.map((m) => m.sustain).filter((x): x is number => x !== null);
  return { maxMp: ms[0]?.maxMp ?? 0, oomAt: oom.length ? r1(avg(oom)) : null, oomRuns: oom.length, runs: ms.length, spendPerSec: f("spendPerSec"), regenPerSec: f("regenPerSec"), procPerSec: f("procPerSec"), wastedAtCap: f("wastedAtCap"), sustain: sus.length ? r3(avg(sus)) : null, emptyShare: r3(avg(ms.map((m) => m.emptyShare))), mpLeft: Math.round(avg(ms.map((m) => m.mpLeft))) };
}

/** Ошибки игрового кода (другие агенты правят модули параллельно): один бой падает — прогон продолжается. */
const ERRORS: { where: string; error: string; at: string }[] = [];
function safe<R>(where: string, fn: () => R): R | null {
  try {
    return fn();
  } catch (e) {
    Math.random = rng;
    CTX = null;
    const err = e as Error;
    const at = (err.stack ?? "").split("\n").find((l) => l.includes("server") || l.includes("shared"))?.trim() ?? "";
    if (!ERRORS.some((x) => x.error === String(err.message) && x.at === at)) console.log(`  ! ${where}: ${err.message} ${at}`);
    ERRORS.push({ where, error: String(err.message), at });
    return null;
  }
}

// ======================================================================
//                 1) манекен: DPS и ресурс за 60 с
// ======================================================================
/** Тик DoT (и прочий фиксированный урон без процов: поджог, подрыв, отражение щита) — метка по виду, а не по умению-зачинщику. */
const isDot = (o: HitOpts) => o.flat !== undefined && !!o.noBreak && !!o.noProc && o.canCrit === false;

/**
 * Чистый манекен: бессмертный, не бьёт. Под давлением: здоровье кабана своего уровня × PDUMMY_N, после смерти сразу
 * появляется на том же месте (казни, «при убийстве»), бьёт героя уроном кабана своего уровня раз в attackCd кабана
 * (фаза случайна, оглушение задерживает удар); при здоровье героя ниже 25% оно поднимается до 50% (герой не гибнет).
 */
function dummyRun(cls: ClassId, level: number, seed: number, pressure: boolean) {
  seedRng(pressure ? "pdummy" : "dummy", cls, level, seed);
  const w = makeWorld(FIELD, true);
  const b = build(cls, level);
  const melee = !CLASSES[cls].projectile;
  const spawn = () => { const mm = spawnMob(w, pressure ? PDUMMY_DEF : DUMMY_DEF, level, FIELD_C.x, FIELD_C.y); if (!pressure) immortal(mm); return mm; };
  let m = spawn();
  const p = spawnPlayer(w, b, FIELD_C.x + (melee ? 60 : 180), FIELD_C.y);
  const a = makeAgent(p, { enemies: () => [m] });
  const mana = new Mana(a);
  let total = 0, first10 = 0, kills = 0, rescues = 0;
  const by: Record<string, number> = {};
  const trace = TRACE && !pressure && seed === 0;
  const origHit = w.hit.bind(w);
  w.hit = (src, dst, o = {}) => {
    const v = origHit(src, dst, o);
    if (src === p && dst === m) {
      const key = isDot(o) ? `dot:${o.kind ?? "phys"}` : CTX ?? "auto"; // auto — автоатака и всё вне умений (процы автоатаки)
      by[key] = (by[key] || 0) + v;
      if (trace && key === TRACE) log(`  [${(w.time / 1000).toFixed(2)}] ${TRACE} → ${v} ${JSON.stringify(o)}`);
    }
    return v;
  };
  if (pressure) w.onDamage = (_s, dst) => { if (dst === p && !p.dead && p.unit.hp < p.unit.maxHp * 0.25) { p.unit.hp = Math.round(p.unit.maxHp * 0.5); rescues++; } };
  const mobCd = MOBS.boar.attackCd * 1000;
  let mobAt = Math.floor(rng() * mobCd);
  const SEC = 60;
  for (let i = 0; i < (SEC * 1000) / TICK_MS && !p.dead; i++) {
    think(w, a);
    const hp0 = m.unit.hp;
    w.update(TICK_MS);
    const dmg = hp0 - m.unit.hp;
    if (!pressure) m.unit.hp = INF;
    total += dmg;
    if (w.time <= 10000) first10 += dmg;
    mana.tick(w.time);
    if (pressure) {
      if (m.dead) { kills++; w.removeMob(m); m = spawn(); mobAt = Math.max(mobAt, w.time + TICK_MS); }
      else if (w.time >= mobAt && m.stunUntil <= w.time) { w.hit(m, p, {}); mobAt = w.time + mobCd; }
    }
  }
  const known = Object.values(by).reduce((s, x) => s + x, 0);
  if (!pressure && total - known > 0.5) by.other = total - known; // питомцы/призывы (applyDamage мимо hit)
  return { dps60: total / SEC, dps10: first10 / 10, by, mana: mana.report(SEC), casts: a.casts, fails: a.fails, kills, rescues, died: p.dead };
}
function dummy(cls: ClassId, level: number, pressure: boolean) {
  const runs = Array.from({ length: DUMMY_SEEDS }, (_, s) => dummyRun(cls, level, s, pressure));
  const dps = runs.map((r) => r.dps60);
  const by: Record<string, number> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.by)) by[k] = (by[k] || 0) + v;
  const sum = Object.values(by).reduce((s, x) => s + x, 0);
  const share = Object.fromEntries(Object.entries(by).sort((x, y) => y[1] - x[1]).map(([k, x]) => [k, r3(x / Math.max(1, sum))]));
  const casts: Record<string, number> = {}, fails: Record<string, number> = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.casts)) casts[k] = (casts[k] || 0) + v / runs.length;
    for (const [k, v] of Object.entries(r.fails)) fails[k] = (fails[k] || 0) + v;
  }
  for (const k of Object.keys(casts)) casts[k] = r1(casts[k]);
  return {
    dps60: Math.round(avg(dps)), min: Math.round(Math.min(...dps)), max: Math.round(Math.max(...dps)), seeds: runs.length, perSeed: dps.map(Math.round),
    dps10: Math.round(avg(runs.map((r) => r.dps10))), share, mana: manaAvg(runs.map((r) => r.mana)), casts, fails,
    ...(pressure ? { killsPerMin: r1(avg(runs.map((r) => r.kills))), rescues: r1(avg(runs.map((r) => r.rescues))), mobHp: Math.round(mobStats(PDUMMY_DEF, level).maxHp), deaths: runs.filter((r) => r.died).length } : {}),
  };
}

// ======================================================================
//                 2) PvE: 1 на 1, элита, серия из 5, выносливость
// ======================================================================
let SPAWN_TABLE: { mob: string; level: number }[] | null = null;
/** Самые частые мобы мира около уровня L (по generateMap(MAP_SEED).spawns). */
function mobsAt(level: number, n = 3): string[] {
  SPAWN_TABLE ??= generateMap(MAP_SEED).spawns.map((s) => ({ mob: s.mob, level: s.level }));
  for (const band of [5, 10, 20, 40]) {
    const cnt = new Map<string, number>();
    for (const s of SPAWN_TABLE) if (Math.abs(s.level - level) <= band && MOBS[s.mob] && !MOBS[s.mob].boss) cnt.set(s.mob, (cnt.get(s.mob) || 0) + 1);
    if (cnt.size >= n || band === 40) return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([k]) => k);
  }
  return ["boar"];
}

interface FightResult { win: boolean; dead: boolean; timeout: boolean; kills: number; ttk: number[]; approach: number[]; hpLeft: number; mpLeft: number; sec: number }
/**
 * Бой героя со списком мобов подряд (следующий появляется сразу после гибели предыдущего, в 170 пикс.).
 * ttk — от первого урона героя по мобу до его смерти; approach — от появления моба до первого урона (подход/полёт снаряда).
 */
function pveRun(cls: ClassId, level: number, queue: { def: MobDef; elite: number }[], seedKey: string, limitSec: number, verbose = false): FightResult {
  seedRng("pve", cls, level, seedKey);
  const w = makeWorld(FIELD, true);
  const b = build(cls, level);
  const p = spawnPlayer(w, b, FIELD_C.x, FIELD_C.y);
  let cur: Mob | null = null, idx = 0, startAt = 0, firstAt = -1;
  const ttk: number[] = [], approach: number[] = [];
  w.onDamage = (src, dst, v) => {
    if (src === p && dst === cur && firstAt < 0) firstAt = w.time;
    if (verbose) log(`  [${(w.time / 1000).toFixed(2)}] ${w.isPlayer(src) ? cls : (src as Mob).def.id} → ${w.isPlayer(dst) ? cls : (dst as Mob).def.id} ${v} (${CTX ?? "auto"})  HP героя ${p.unit.hp}/${p.unit.maxHp}, моба ${cur?.unit.hp}/${cur?.unit.maxHp}`);
  };
  const next = () => {
    const q = queue[idx++];
    const ang = Math.atan2(FIELD_C.y - p.y, FIELD_C.x - p.x + 0.001);
    cur = spawnMob(w, q.def, level, p.x + Math.cos(ang) * 170, p.y + Math.sin(ang) * 170, q.elite);
    startAt = w.time;
    firstAt = -1;
  };
  next();
  const a = makeAgent(p, { enemies: () => (cur && !cur.dead ? [cur] : []) });
  const ticks = (limitSec * 1000) / TICK_MS;
  for (let i = 0; i < ticks && !p.dead; i++) {
    think(w, a);
    w.update(TICK_MS);
    if (cur && (cur as Mob).dead) {
      const f = firstAt < 0 ? w.time : firstAt;
      ttk.push((w.time - f) / 1000);
      approach.push((f - startAt) / 1000);
      w.removeMob(cur);
      cur = null;
      if (idx >= queue.length) break;
      next();
    }
  }
  return { win: ttk.length === queue.length && !p.dead, dead: p.dead, timeout: !p.dead && ttk.length < queue.length, kills: ttk.length, ttk, approach, hpLeft: p.dead ? 0 : r3(ratio(p)), mpLeft: r3(p.unit.mp / Math.max(1, p.unit.maxMp)), sec: w.time / 1000 };
}

/**
 * Выносливость (цель BALANCE.md «время смерти ~45 с»): герой стоит и бьёт только автоатакой (без умений) моба своего уровня
 * с бесконечным здоровьем. sec — от первого удара моба до смерти героя; autoDps — урон автоатаки (для «TTK ~4 с» без умений).
 */
function endureRun(cls: ClassId, level: number, def: MobDef, seedKey: string, limitSec = 300) {
  seedRng("endure", cls, level, def.id, seedKey);
  const w = makeWorld(FIELD, true);
  const p = spawnPlayer(w, build(cls, level), FIELD_C.x, FIELD_C.y);
  const m = spawnMob(w, def, level, p.x + 170, p.y);
  immortal(m);
  const a = makeAgent(p, { enemies: () => [m] });
  a.order = [];
  let hurtAt = -1, dealtAt = -1, dealt = 0, taken = 0;
  w.onDamage = (src, dst, v) => {
    if (src === m && dst === p) { taken += v; if (hurtAt < 0) hurtAt = w.time; }
    if (src === p && dst === m) { dealt += v; if (dealtAt < 0) dealtAt = w.time; }
  };
  for (let i = 0; i < (limitSec * 1000) / TICK_MS && !p.dead; i++) {
    think(w, a);
    w.update(TICK_MS);
    m.unit.hp = INF;
  }
  const t = w.time;
  return { died: p.dead, sec: p.dead && hurtAt >= 0 ? (t - hurtAt) / 1000 : null, autoDps: dealtAt >= 0 ? dealt / Math.max(0.05, (t - dealtAt) / 1000) : 0, mobDps: hurtAt >= 0 ? taken / Math.max(0.05, (t - hurtAt) / 1000) : 0, maxHp: p.unit.maxHp };
}

function pve(cls: ClassId, level: number) {
  const types = mobsAt(level);
  const normal: Record<string, { ttk: number | null; approach: number | null; hpLeft: number; deaths: number; timeouts: number; n: number }> = {};
  const all: FightResult[] = [];
  for (const id of types) {
    const rs: FightResult[] = [];
    for (let s = 0; s < PVE_SEEDS; s++) rs.push(pveRun(cls, level, [{ def: MOBS[id], elite: -1 }], `n${id}${s}`, 90));
    all.push(...rs);
    const wins = rs.filter((r) => r.win);
    normal[id] = { ttk: wins.length ? r1(avg(wins.map((r) => r.ttk[0]))) : null, approach: wins.length ? r1(avg(wins.map((r) => r.approach[0]))) : null, hpLeft: r3(avg(rs.map((r) => r.hpLeft))), deaths: rs.filter((r) => r.dead).length, timeouts: rs.filter((r) => r.timeout).length, n: rs.length };
  }
  const eliteRs: (FightResult & { prefix: string })[] = [];
  for (let s = 0; s < ELITE_SEEDS; s++) {
    const pi = (s * 3) % ELITE.prefixes.length;
    eliteRs.push({ ...pveRun(cls, level, [{ def: MOBS[types[0]], elite: pi }], `e${s}`, 180), prefix: ELITE.prefixes[pi].name });
  }
  const series: FightResult[] = [];
  for (let s = 0; s < PVE_SEEDS; s++) series.push(pveRun(cls, level, Array.from({ length: 5 }, (_, i) => ({ def: MOBS[types[i % types.length]], elite: -1 })), `s${s}`, 400));
  // выносливость: эталонный моб (все множители 1) и самые частые мобы уровня
  const endure: Record<string, { sec: number | null; died: number; n: number; mobDps: number }> = {};
  let autoDps: number[] = [];
  for (const def of [BRUTE_DEF, ...types.map((id) => MOBS[id])]) {
    const rs = Array.from({ length: PVE_SEEDS }, (_, s) => endureRun(cls, level, def, `d${s}`));
    const died = rs.filter((r) => r.died);
    endure[def === BRUTE_DEF ? "standard" : def.id] = { sec: died.length === rs.length ? r1(avg(died.map((r) => r.sec!))) : null, died: died.length, n: rs.length, mobDps: Math.round(avg(rs.map((r) => r.mobDps))) };
    if (def === BRUTE_DEF) autoDps = rs.map((r) => r.autoDps);
  }
  const stdHp = mobStats(BRUTE_DEF, level).maxHp;
  const ew = eliteRs.filter((r) => r.win);
  const wins = all.filter((r) => r.win);
  return {
    cls, level, mobs: types,
    normal: { perMob: normal, ttk: wins.length ? r1(avg(wins.map((r) => r.ttk[0]))) : null, approach: wins.length ? r1(avg(wins.map((r) => r.approach[0]))) : null, hpLeft: r3(avg(all.map((r) => r.hpLeft))), deaths: all.filter((r) => r.dead).length, fights: all.length },
    elite: { mob: types[0], winRate: r3(ew.length / eliteRs.length), ttk: ew.length ? r1(avg(ew.map((r) => r.ttk[0]))) : null, hpLeft: r3(avg(eliteRs.map((r) => r.hpLeft))), deaths: eliteRs.filter((r) => r.dead).length, timeouts: eliteRs.filter((r) => r.timeout).length, runs: eliteRs.map((r) => ({ prefix: r.prefix, win: r.win, ttk: r.ttk[0] ?? null, hpLeft: r.hpLeft })) },
    series: { kills: r1(avg(series.map((r) => r.kills))), cleared: series.filter((r) => r.win).length, runs: series.length, hpLeft: r3(avg(series.map((r) => r.hpLeft))), mpLeft: r3(avg(series.map((r) => r.mpLeft))), sec: r1(avg(series.map((r) => r.sec))) },
    endure: { perMob: endure, target: 45, autoDps: Math.round(avg(autoDps)), ttkAutoStd: avg(autoDps) > 0 ? r1(stdHp / avg(autoDps)) : null, stdMobHp: stdHp },
  };
}

// ======================================================================
//                 3) лекари: HPS на одну и ту же цель под постоянным уроном
// ======================================================================
const HEALERS: ClassId[] = ["healer", "bloodweaver"];
const HEAL_PACK = 4;
const HEAL_SEEDS = QUICK ? 2 : 3;
/** Базовое давление: без лекаря цель погибает за это время (среднее по сидам). */
const BASE_DEATH = 15;
/**
 * Цель лечения одинакова для обоих лекарей: Храмовник своего уровня (характеристики и экипировка PvE-сборки) с фракцией
 * лекаря, без агента и без умений — не кастует, не бьёт, своего лечения нет (на 100 ур. «Воздаяние»+«Жажда крови»
 * лечили бы цель сами и вчетверо поднимали базовый k). Остаётся только регенерация. Кровотворец лечит только свою фракцию.
 */
function targetBuild(level: number, faction: string): Build {
  const b = build("warrior", level);
  return { ...b, save: { ...b.save, faction, skills: {} } as PlayerSave };
}
/** Наибольший урон по цели за окно 0.5 с (доля её здоровья): всплеск или ровное давление. */
function burst05(ev: [number, number][], maxHp: number) {
  let best = 0, sum = 0, j = 0;
  for (let i = 0; i < ev.length; i++) {
    sum += ev[i][1];
    while (ev[i][0] - ev[j][0] >= 500) sum -= ev[j++][1];
    best = Math.max(best, sum);
  }
  return r3(best / Math.max(1, maxHp));
}

function tankRun(healerCls: ClassId | null, level: number, k: number, seedKey: string, sec = 60) {
  // сид без k: одинаковые случайные числа для всех k (бисекция не дрожит от шума)
  seedRng("heal", healerCls ?? "-", level, seedKey);
  const w = makeWorld(FIELD, true);
  const faction = healerCls ? CLASSES[healerCls].faction : CLASSES.warrior.faction;
  const tank = spawnPlayer(w, targetBuild(level, faction), FIELD_C.x, FIELD_C.y);
  const mobs: Mob[] = [];
  const def: MobDef = { ...BRUTE_DEF, dmg: k };
  for (let i = 0; i < HEAL_PACK; i++) {
    const ang = (i / HEAL_PACK) * Math.PI * 2;
    const m = spawnMob(w, def, level, tank.x + 20 + Math.cos(ang) * 60, tank.y + Math.sin(ang) * 60);
    immortal(m);
    m.attackAt = Math.floor(rng() * def.attackCd * 1000); // случайная фаза: без синхронного залпа всей стаи
    mobs.push(m);
  }
  const healer = healerCls ? spawnPlayer(w, build(healerCls, level), tank.x - 170, tank.y) : null;
  const allies = () => [tank, ...(healer ? [healer] : [])];
  const ha = healer ? makeAgent(healer, { enemies: () => mobs, allies }) : null;
  const mana = ha ? new Mana(ha) : null;
  let taken = 0, onTank = 0, onSelf = 0, over = 0, counted = 0, selfFull = 0, tOver = 0, tGot = 0, absorb = 0, inHeal = 0;
  const heals: Record<string, { n: number; got: number; over: number }> = {};
  const ev: [number, number][] = [];
  w.onDamage = (_src, dst, v) => { if (dst === tank) { taken += v; ev.push([w.time, v]); } };
  const origHeal = w.heal.bind(w);
  w.heal = (q, v, show = true, by) => {
    inHeal++;
    const before = q.unit.hp, full = ratio(q) >= 0.99;
    const got = origHeal(q, v, show, by);
    inHeal--;
    if (healer && (by ?? q) === healer && !q.dead) {
      const ov = Math.max(0, Math.round(v) - (q.unit.hp - before));
      const tgt = q === tank ? "tank" : q === healer ? (full ? "self(full)" : "self") : "other";
      if (q === tank) onTank += got; else if (q === healer) onSelf += got;
      if (tgt === "self(full)") selfFull += Math.round(v); // лечение себя при полном здоровье — побочный эффект, не «перелечено»
      else { over += ov; counted += got; }
      const key = `${CTX ?? "auto"}→${tgt}`;
      const e = (heals[key] ??= { n: 0, got: 0, over: 0 });
      e.n++; e.got += got; e.over += ov;
      if (q === tank && CTX && HEAL_FIRST.includes(CTX) && SKILLS[CTX]?.target === "ally") { tOver += ov; tGot += got; }
    }
    return got;
  };
  w.onHeal = (q, v) => { if (!inHeal && healer && q === healer) absorb += v; }; // щиты лекаря (поглощение вне heal)
  let tankDeath: number | null = null, healerDeath: number | null = null;
  for (let i = 0; i < (sec * 1000) / TICK_MS; i++) {
    if (ha) think(w, ha);
    w.update(TICK_MS);
    // стая бессмертна и всё время держится на цели
    for (const m of mobs) { m.unit.hp = INF; m.tauntUntil = w.time + 1000; m.tauntBy = tank.id; }
    mana?.tick(w.time);
    if (tank.dead && tankDeath === null) tankDeath = w.time / 1000;
    if (healer?.dead && healerDeath === null) healerDeath = w.time / 1000;
    if (tank.dead) break;
  }
  const t = w.time / 1000;
  return {
    survived: tankDeath === null, tankDeath, healerDeath, sec: t, dtps: taken / t, hpsTank: (onTank + absorb) / t, hpsHeal: onTank / t, hpsAbsorb: absorb / t, hpsSelf: onSelf / t,
    over, counted, selfFull, tOver, tGot, heals, burst: burst05(ev, tank.unit.maxHp), tankMaxHp: tank.unit.maxHp, mana: mana?.report(t) ?? null, casts: ha?.casts ?? {},
  };
}
type TankRun = ReturnType<typeof tankRun>;
const seedsOf = (n: number, pre: string) => Array.from({ length: n }, (_, s) => `${pre}${s}`);

/** Базовый k по уровню: без лекаря цель падает в среднем за BASE_DEATH с (бисекция по log k, HEAL_SEEDS сидов). */
const baseKCache = new Map<number, { k: number; death: number; dtps: number; tankMaxHp: number; burst: number }>();
function baseK(level: number) {
  const hit = baseKCache.get(level);
  if (hit) return hit;
  const f = (k: number) => { const rs = seedsOf(HEAL_SEEDS, "b").map((s) => tankRun(null, level, k, s)); return { d: avg(rs.map((r) => r.tankDeath ?? 60)), rs }; };
  let lo = 0.5, hi = 4;
  while (f(lo).d < BASE_DEATH && lo > 1e-3) lo /= 2;
  while (f(hi).d > BASE_DEATH && hi < 1e5) hi *= 2;
  for (let i = 0; i < 14; i++) { const mid = Math.sqrt(lo * hi); if (f(mid).d > BASE_DEATH) lo = mid; else hi = mid; }
  const k = Math.sqrt(lo * hi), r = f(k);
  const out = { k: +k.toFixed(3), death: r1(r.d), dtps: Math.round(avg(r.rs.map((x) => x.dtps))), tankMaxHp: r.rs[0].tankMaxHp, burst: r3(avg(r.rs.map((x) => x.burst))) };
  baseKCache.set(level, out);
  return out;
}
function healers(level: number) {
  const out = [];
  for (const h of HEALERS) {
    if (!CLS.includes(h)) continue;
    const row = safe(`heal ${h} L${level}`, () => healPair(h, level));
    if (row) out.push(row);
  }
  return out;
}
function summarize(rs: TankRun[]) {
  const sum = (f: (r: TankRun) => number) => rs.reduce((s, r) => s + f(r), 0);
  const secs = sum((r) => r.sec);
  const heals: Record<string, { hps: number; overPerSec: number; events: number }> = {};
  for (const r of rs) for (const [k, e] of Object.entries(r.heals)) { const x = (heals[k] ??= { hps: 0, overPerSec: 0, events: 0 }); x.hps += e.got; x.overPerSec += e.over; x.events += e.n; }
  for (const x of Object.values(heals)) { x.hps = Math.round(x.hps / secs); x.overPerSec = Math.round(x.overPerSec / secs); x.events = r1(x.events / rs.length); }
  const sorted = Object.fromEntries(Object.entries(heals).sort((a, b) => b[1].hps + b[1].overPerSec - (a[1].hps + a[1].overPerSec)));
  return {
    survived: rs.filter((r) => r.survived).length, runs: rs.length, alive: r1(avg(rs.map((r) => r.tankDeath ?? r.sec))),
    dtps: Math.round(avg(rs.map((r) => r.dtps))), hpsTank: Math.round(avg(rs.map((r) => r.hpsTank))), hpsAbsorb: Math.round(avg(rs.map((r) => r.hpsAbsorb))), hpsSelf: Math.round(avg(rs.map((r) => r.hpsSelf))),
    hpsPctTankHp: r3(avg(rs.map((r) => r.hpsTank / r.tankMaxHp))),
    overheal: r3(sum((r) => r.over) / Math.max(1, sum((r) => r.over + r.counted))),
    overhealTargeted: r3(sum((r) => r.tOver) / Math.max(1, sum((r) => r.tOver + r.tGot))),
    selfFullPerSec: Math.round(sum((r) => r.selfFull) / secs),
    burst05: r3(avg(rs.map((r) => r.burst))),
    healerDeaths: rs.filter((r) => r.healerDeath !== null).length,
    heals: sorted, mana: manaAvg(rs.map((r) => r.mana!).filter(Boolean)),
  };
}
function healPair(h: ClassId, level: number) {
  const base = baseK(level);
  const seeds = seedsOf(HEAL_SEEDS, "r");
  const at = (k: number) => { const rs = seeds.map((s) => tankRun(h, level, k, s)); return { k, all: rs.every((r) => r.survived), rs }; };
  // предел: наибольший k, при котором цель с лекарем живёт 60 с во всех сидах (бисекция по log k)
  const atBase = at(base.k);
  let lo = atBase, hi: ReturnType<typeof at> | null = null;
  if (!lo.all) {
    hi = lo;
    let k = lo.k;
    do { k /= 1.5; lo = at(k); if (!lo.all) hi = lo; } while (!lo.all && k > base.k / 100);
  } else {
    let k = lo.k * 2;
    for (let r = at(k); ; r = at((k *= 2))) { if (!r.all) { hi = r; break; } lo = r; if (k > base.k * 1000) break; }
  }
  if (hi && lo.all) for (let i = 0; i < 8; i++) { const r = at(Math.sqrt(lo.k * hi.k)); if (r.all) lo = r; else hi = r; }
  const L = lo.all ? summarize(lo.rs) : null;
  const fails = hi ? hi.rs.filter((r) => !r.survived) : [];
  return {
    healer: h, target: `warrior L${level} без агента и умений, фракция ${CLASSES[h].faction}`, level, pack: HEAL_PACK, seeds: seeds.length,
    baseline: { dmgMult: base.k, tankDeath: base.death, dtps: base.dtps, tankMaxHp: base.tankMaxHp, burst05: base.burst },
    atBase: summarize(atBase.rs),
    limit: {
      dmgMult: lo.all ? +lo.k.toFixed(3) : null, ratio: lo.all ? r3(lo.k / base.k) : 0, dtps: L?.dtps ?? null, hpsTank: L?.hpsTank ?? null, hpsPctTankHp: L?.hpsPctTankHp ?? null,
      overheal: L?.overheal ?? null, oomAt: L?.mana.oomAt ?? null, sustain: L?.mana.sustain ?? null, burst05: L?.burst05 ?? null,
      failAt: hi ? { dmgMult: +hi.k.toFixed(3), deaths: fails.length, deathAt: fails.length ? r1(avg(fails.map((r) => r.tankDeath!))) : null, burst05: fails.length ? r3(avg(fails.map((r) => r.burst))) : null, oomRuns: fails.filter((r) => r.mana?.oomAt != null).length, oomAt: fails.some((r) => r.mana?.oomAt != null) ? r1(avg(fails.filter((r) => r.mana?.oomAt != null).map((r) => r.mana!.oomAt!))) : null } : null,
      casts: L ? lo.rs[0].casts : null,
    },
  };
}

// ======================================================================
//                 4) PvP: дуэли на арене (PvP-сборка: защитные умения в приоритете)
// ======================================================================
function duel(ca: ClassId, cb: ClassId, level: number, rep: number, verbose = false) {
  const bA = build(ca, level, "pvp"), bB = build(cb, level, "pvp"); // до seedRng (и всё равно изолированы)
  seedRng("pvp", ca, cb, level, rep);
  const w = makeWorld(ARENA, false);
  w.pvpActive = true;
  // стороны арены и порядок обновления в тике чередуем по повтору (у симметричных ботов решает первый выстрел)
  const ta = rep % 2 === 0 ? 1 : 2, tb = 3 - ta;
  const sa = arenaSpawn(ta, 0), sb = arenaSpawn(tb, 0);
  const aFirst = Math.floor(rep / 2) % 2 === 0;
  let pa!: Player, pb!: Player;
  if (aFirst) { pa = spawnPlayer(w, bA, sa.x, sa.y, ta); pb = spawnPlayer(w, bB, sb.x, sb.y, tb); }
  else { pb = spawnPlayer(w, bB, sb.x, sb.y, tb); pa = spawnPlayer(w, bA, sa.x, sa.y, ta); }
  const A = makeAgent(pa, { kite: true, enemies: () => [pb] }), B = makeAgent(pb, { kite: true, enemies: () => [pa] });
  A.next = Math.floor(rng() * 5) * TICK_MS; // случайная фаза решений: реакция игроков не синхронна
  B.next = Math.floor(rng() * 5) * TICK_MS;
  let dmgA = 0, dmgB = 0;
  let first = -1;
  w.onDamage = (src, dst, v) => {
    if (src === pa && dst === pb) dmgA += v; else if (src === pb && dst === pa) dmgB += v; else return;
    if (first < 0) first = w.time / 1000;
    if (verbose) log(`  [${(w.time / 1000).toFixed(2)}] ${src === pa ? ca : cb} → ${v} (${CTX ?? "auto"})  HP ${pa.unit.hp}/${pa.unit.maxHp} vs ${pb.unit.hp}/${pb.unit.maxHp}`);
  };
  const ticks = MATCH_MS / TICK_MS;
  let i = 0;
  for (; i < ticks && !pa.dead && !pb.dead; i++) {
    if (rng() < 0.5) { think(w, A); think(w, B); } else { think(w, B); think(w, A); } // кто решает первым — жребий каждый тик
    w.update(TICK_MS);
  }
  const t = w.time / 1000;
  let winner = 0;
  if (pa.dead !== pb.dead) winner = pa.dead ? 2 : 1;
  else if (!pa.dead) { const h1 = ratio(pa), h2 = ratio(pb); winner = Math.abs(h1 - h2) < 1e-4 ? 0 : h1 > h2 ? 1 : 2; } // по времени — как ArenaRoom.checkEnd
  if (verbose) log(`  итог: победитель ${winner === 1 ? ca : winner === 2 ? cb : "ничья"}, ${t} с, первый урон на ${first} с; умения ${ca}: ${JSON.stringify(A.casts)}; ${cb}: ${JSON.stringify(B.casts)}`);
  return { winner, sec: t, fight: first < 0 ? 0 : r1(t - first), timeout: !pa.dead && !pb.dead, hpA: r3(ratio(pa)), hpB: r3(ratio(pb)), dpsA: Math.round(dmgA / t), dpsB: Math.round(dmgB / t) };
}
function pvp(level: number) {
  const cells: Record<string, Record<string, { win: number; draws: number; sec: number; fight: number; timeouts: number; dps: number; errors: number; reps: number[] }>> = {};
  for (const a of CLS) {
    cells[a] = {};
    for (const b of CLS) {
      let win = 0, draws = 0, timeouts = 0, errors = 0;
      const secs: number[] = [], dps: number[] = [], fights: number[] = [], reps: number[] = [];
      for (let r = 0; r < PVP_REPS; r++) {
        const d = safe(`pvp ${a}-${b} L${level} #${r}`, () => duel(a, b, level, r));
        if (!d) { errors++; reps.push(-1); continue; }
        if (d.winner === 1) win++; else if (d.winner === 0) draws++;
        if (d.timeout) timeouts++;
        secs.push(d.sec);
        fights.push(d.fight);
        dps.push(d.dpsA);
        reps.push(d.winner);
      }
      const n = Math.max(1, PVP_REPS - errors);
      cells[a][b] = { win: r3((win + draws / 2) / n), draws, sec: r1(avg(secs)), fight: r1(avg(fights)), timeouts, dps: Math.round(avg(dps)), errors, reps };
    }
  }
  // процент побед класса: обе стороны (A против B и B против A), без зеркал
  const classWin: Record<string, { win: number; sec: number; fight: number }> = {};
  for (const a of CLS) {
    const ws: number[] = [], ss: number[] = [], fs: number[] = [];
    for (const b of CLS) if (a !== b) { ws.push(cells[a][b].win, 1 - cells[b][a].win); ss.push(cells[a][b].sec, cells[b][a].sec); fs.push(cells[a][b].fight, cells[b][a].fight); }
    classWin[a] = { win: r3(avg(ws)), sec: r1(avg(ss)), fight: r1(avg(fs)) };
  }
  const ROLES: [string, ClassId, ClassId][] = [["танк", "warrior", "deathknight"], ["лекарь", "healer", "bloodweaver"], ["лучник", "ranger", "darkranger"], ["маг", "mage", "warlock"], ["разбойник", "rogue", "reaver"]];
  const roles = ROLES.filter(([, s, u]) => CLS.includes(s) && CLS.includes(u)).map(([name, s, u]) => ({ role: name, solgard: s, umbrath: u, solgardWin: r3((cells[s][u].win + 1 - cells[u][s].win) / 2), sec: r1((cells[s][u].sec + cells[u][s].sec) / 2) }));
  const cross: number[] = [];
  for (const a of CLS) for (const b of CLS) if (CLASSES[a].faction === "solgard" && CLASSES[b].faction === "umbrath") cross.push(cells[a][b].win, 1 - cells[b][a].win);
  // самые перекошенные пары (обе стороны вместе)
  const pairs: { a: ClassId; b: ClassId; aWin: number }[] = [];
  CLS.forEach((a, i) => CLS.forEach((b, j) => { if (j > i) pairs.push({ a, b, aWin: r3((cells[a][b].win + 1 - cells[b][a].win) / 2) }); }));
  const skewed = pairs.sort((x, y) => Math.abs(y.aWin - 0.5) - Math.abs(x.aWin - 0.5) || x.a.localeCompare(y.a) || x.b.localeCompare(y.b)).slice(0, 8);
  return { level, reps: PVP_REPS, matrix: cells, classWin, roles, solgardVsUmbrath: r3(avg(cross)), skewed };
}

// ======================================================================
//                         запуск и отчёт
// ======================================================================
const t0 = Date.now();
const log = (s: string) => console.log(s);
const pad = (s: string | number, n: number) => String(s).padStart(n);
const name = (c: ClassId) => `${c}`.padEnd(12);
const k1 = (x: number) => (x >= 10000 ? `${r1(x / 1000)}k` : `${Math.round(x)}`);

const report: Record<string, unknown> = {
  meta: {
    seed: BASE_SEED, quick: QUICK, tickMs: TICK_MS, thinkMs: THINK_MS, pvpDamageMult: PVP_DAMAGE_MULT, matchSec: MATCH_MS / 1000,
    levels: LEVELS, pvpLevels: PVP_LEVELS, classes: CLS, dummySeeds: DUMMY_SEEDS, pdummyN: PDUMMY_N, healSeeds: HEAL_SEEDS, healBaseDeath: BASE_DEATH,
    code: CODE_AT_START,
    assumptions: [
      "Код боя настоящий: World.update(TICK_MS), Player/Mob, castSkill и модули умений; PVP_DAMAGE_MULT применяется внутри World.hit; таймеры умений с owner (гибель/уход владельца отменяет их, как в игре).",
      "Характеристики: танк — Сила/Выносливость 1:1; остальные — 2/3 в главную, 1/3 в Выносливость.",
      "Умения, PvE-сборка: уронные активные (поле урона или усиление урона; у лекарей и лечение) по кругу до максимума → прочие пассивки → утилитарные/защитные активные → защитные пассивки (требования доучиваются). PvP-сборка: утилитарные/защитные активные → уронные → защитные пассивки → прочие.",
      "Экипировка: Rare, ilvl = уровень, средний бросок аффиксов; аффикс — главная характеристика (+Выносливость у кольца/амулета); база слота — лучшая по оценке урона×живучести; модель — rollModel (только имя/вид). Сборка идёт на своём генераторе и не сдвигает случайность боёв.",
      "Без зелий, еды, питомцев и легендарок. Бот решает раз в 0.25 с, не больше одного умения за решение (как боты арены).",
      "Защитные умения — при просадке здоровья; taunt — только если моб бьёт не героя (по игроку — всегда), tp_glare/tp_banner — если героя били последние 3 с, ауры Кровотворца — если рядом раненый; лекари лечат по порогам; остальное — по готовности, длинная перезарядка первой. Без кайта бот подходит к цели под уронное умение по площади вокруг себя.",
      `Манекен 60 с, ${DUMMY_SEEDS} сидов на клетку (среднее, min–max). Чистый: бессмертный, не бьёт. Под давлением: HP кабана своего уровня ×${PDUMMY_N}, сразу появляется заново (казни и «при убийстве» работают), бьёт героя уроном кабана своего уровня раз в 1.5 с; HP героя ниже 25% поднимается до 50%. Классы ранжируются по DPS под давлением.`,
      "Доли урона: прямые удары — по умению, тики DoT и прочий фиксированный урон без процов (flat + noBreak + noProc + без крита) — dot:<вид>, а не умению, начавшему цепочку.",
      "PvE: самые частые мобы мира около уровня (generateMap), моб появляется в 170 пикс.; TTK — от первого урона героя до смерти моба, подход отдельно; элита — настоящий Mob.rollElite с заданной приставкой; опыт выключен. Выносливость: герой только стоит и бьёт автоатакой моба своего уровня с бесконечным HP — время от первого удара моба до смерти (цель BALANCE.md ~45 с).",
      `Лекари: оба лечат одну цель — Храмовника своего уровня без агента и без умений (характеристики и экипировка PvE-сборки, фракция лекаря); 4 «громилы» своего уровня (кабан с множителями 1, урон × k), случайная фаза атак, бесконечное HP, всё время на цели. Базовый k — бисекция: без лекаря цель падает в среднем за ${BASE_DEATH} с. Предел — бисекция по log k: цель живёт 60 с во всех ${HEAL_SEEDS} сидах. Перелечено — без лечения себя при полном HP (отдельная строка selfFullPerSec); overhealTargeted — только целевые лечения HEAL_FIRST по цели.`,
      "PvP: настоящая карта арены и точки появления, лимит 180 с, по времени побеждает больший % здоровья (как ArenaRoom); дальний бой держит дистанцию 140 как боты арены.",
      "Рост «урон ×8 от 30-го» (BALANCE.md) — это рост среднего удара персонажа (derive), он выводится отдельно; рост DPS включает умения, открывающиеся после 30, и с ×8 не сравнивается.",
    ],
  },
};

const PVE1 = arg("pve1");
if (PVE1) {
  // разбор одного боя: --pve1 warrior,30,drowned[,элита-приставка]
  const [c, l, m, e] = PVE1.split(",");
  const r = pveRun(c as ClassId, Number(l) || 30, [{ def: MOBS[m || "boar"], elite: e === undefined ? -1 : Number(e) }], "dbg", 180, true);
  log(JSON.stringify(r));
  process.exit(0);
}
const DUEL = arg("duel");
if (DUEL) {
  // разбор одной дуэли: --duel warrior,mage,100[,повтор] — тот же бой, что ячейка матрицы (сборка изолирована от потока боя)
  const [a, b, l, r] = DUEL.split(",");
  duel(a as ClassId, b as ClassId, Number(l) || 100, Number(r) || 0, true);
  process.exit(0);
}

const allLevels = [...new Set([...LEVELS, ...PVP_LEVELS])].sort((a, b) => a - b);
if (ONLY.has("dummy") || ONLY.has("pve") || ONLY.has("heal") || ONLY.has("pvp")) {
  const builds: Record<string, unknown> = {}, buildsPvp: Record<string, unknown> = {};
  for (const c of CLS) for (const l of allLevels) builds[`${c}@${l}`] = buildInfo(build(c, l));
  for (const c of CLS) for (const l of PVP_LEVELS) buildsPvp[`${c}@${l}`] = { skills: build(c, l, "pvp").save.skills };
  report.builds = builds;
  report.buildsPvp = buildsPvp;
}

const summary: Record<string, unknown> = {};
type DummyRow = { cls: ClassId; level: number; clean: ReturnType<typeof dummy>; pressure: ReturnType<typeof dummy> };
const dummyRows: DummyRow[] = [];
if (ONLY.has("dummy")) {
  log(`\n== 1) Манекен 60 с, ${DUMMY_SEEDS} сидов: чистый DPS (min–max) | под давлением DPS, убийств/мин | OOM чистый/давление`);
  log(`${"класс".padEnd(12)}${LEVELS.map((l) => pad(`L${l}`, 44)).join("")}`);
  for (const c of CLS) {
    let line = name(c);
    for (const l of LEVELS) {
      const cl = safe(`dummy ${c} L${l}`, () => dummy(c, l, false));
      const pr = safe(`pdummy ${c} L${l}`, () => dummy(c, l, true));
      if (!cl || !pr) { line += pad("ошибка", 44); continue; }
      dummyRows.push({ cls: c, level: l, clean: cl, pressure: pr });
      line += pad(`${k1(cl.dps60)} (${k1(cl.min)}–${k1(cl.max)}) | ${k1(pr.dps60)} ${pr.killsPerMin}k | ${cl.mana.oomAt ?? "-"}/${pr.mana.oomAt ?? "-"}`, 44);
    }
    log(line);
  }
  report.dummy = dummyRows;
  // рост 30 → 100: средний удар (метрика BALANCE.md ×8) и DPS по средним (без сравнения с ×8)
  const lo = LEVELS.includes(30) ? 30 : LEVELS[0], hi = LEVELS.includes(100) ? 100 : LEVELS[LEVELS.length - 1];
  const growth: Record<string, unknown> = {};
  for (const c of CLS) {
    const a = dummyRows.find((r) => r.cls === c && r.level === lo), b = dummyRows.find((r) => r.cls === c && r.level === hi);
    const h1 = avgHit(build(c, lo)), h2 = avgHit(build(c, hi));
    growth[c] = { from: lo, to: hi, avgHit: [Math.round(h1), Math.round(h2)], hitX: r1(h2 / h1), hitTarget: 8, dpsX: a && b ? r1(b.clean.dps60 / Math.max(1, a.clean.dps60)) : null, pressureDpsX: a && b ? r1(b.pressure.dps60 / Math.max(1, a.pressure.dps60)) : null };
  }
  summary.growth = growth;
  const rank: Record<string, unknown> = {};
  for (const l of LEVELS) {
    const rows = dummyRows.filter((r) => r.level === l).sort((x, y) => y.pressure.dps60 - x.pressure.dps60);
    const top = rows[0]?.pressure.dps60 || 1;
    rank[`L${l}`] = rows.map((r) => ({ cls: r.cls, pressure: r.pressure.dps60, clean: r.clean.dps60, cleanRange: [r.clean.min, r.clean.max], vsTop: r3(r.pressure.dps60 / top), oomClean: r.clean.mana.oomAt, oomPressure: r.pressure.mana.oomAt, sustain: r.pressure.mana.sustain }));
  }
  summary.dpsRank = rank;
  log("\nРост 30→100: средний удар (цель ×8) | DPS чистый | DPS под давлением");
  for (const c of CLS) { const g = growth[c] as { hitX: number; dpsX: number | null; pressureDpsX: number | null }; log(`${name(c)} ×${g.hitX} | ×${g.dpsX ?? "-"} | ×${g.pressureDpsX ?? "-"}`); }
}

if (ONLY.has("pve")) {
  const rows = [];
  log("\n== 2) PvE: обычный моб TTK(с, от 1-го урона)+подход/HP% смерти | элита победы TTK | серия 5: убито | выносливость: смерть от эталонного моба (с, цель 45), TTK автоатакой");
  for (const l of LEVELS) {
    log(`-- L${l}: мобы ${mobsAt(l).join(", ")}`);
    for (const c of CLS) {
      const r = safe(`pve ${c} L${l}`, () => pve(c, l));
      if (!r) { rows.push({ cls: c, level: l, error: true }); log(`${name(c)}  ошибка`); continue; }
      rows.push(r);
      const std = r.endure.perMob.standard;
      log(`${name(c)}${pad(`${r.normal.ttk ?? "-"}+${r.normal.approach ?? "-"}с/${Math.round(r.normal.hpLeft * 100)}% x${r.normal.deaths}`, 20)}${pad(`${Math.round(r.elite.winRate * 100)}% ${r.elite.ttk ?? "-"}с`, 14)}${pad(`${r.series.kills}/5 (${r.series.cleared}/${r.series.runs})`, 14)}${pad(`${std.sec ?? `>300 (${std.died}/${std.n})`}с`, 16)}${pad(`${r.endure.ttkAutoStd ?? "-"}с`, 8)}`);
    }
  }
  report.pve = rows;
  const ttk: Record<string, unknown> = {};
  for (const l of LEVELS) {
    const at = rows.filter((r): r is ReturnType<typeof pve> => "normal" in r && r.level === l);
    ttk[`L${l}`] = Object.fromEntries(at.map((r) => [r.cls, { ttk: r.normal.ttk, approach: r.normal.approach, deaths: r.normal.deaths, eliteWin: r.elite.winRate, endureStd: r.endure.perMob.standard.sec, ttkAutoStd: r.endure.ttkAutoStd }]));
  }
  summary.pve = { ttkTarget: 4, endureTarget: 45, byLevel: ttk };
}

if (ONLY.has("heal")) {
  const rows = [];
  log(`\n== 3) Лекари → одна цель (Храмовник без агента и умений): базовый k (без лекаря смерть за ~${BASE_DEATH} с) | на базе: жив, HPS (%HP/с), перелечено (целевые), себя при полном | предел k (×база), HPS %HP/с, всплеск 0.5 с при провале, OOM`);
  for (const l of LEVELS) for (const r of healers(l)) {
    rows.push(r);
    const B = r.atBase, Lm = r.limit;
    log(`L${pad(l, 3)} ${r.healer.padEnd(12)} k=${pad(r.baseline.dmgMult, 6)} ${pad(r.baseline.tankDeath, 4)}с | ${B.survived}/${B.runs} ${pad(B.hpsTank, 5)} (${(B.hpsPctTankHp * 100).toFixed(1)}%) пер.${Math.round(B.overheal * 100)}% (${Math.round(B.overhealTargeted * 100)}%) себя ${B.selfFullPerSec}/с | предел k=${Lm.dmgMult ?? "-"} (×${Lm.ratio}) ${Lm.hpsPctTankHp !== null ? (Lm.hpsPctTankHp * 100).toFixed(1) + "%" : "-"} всплеск ${Lm.failAt?.burst05 ?? "-"} OOM ${Lm.oomAt ?? "-"}/${Lm.failAt?.oomAt ?? "-"}`);
  }
  report.healers = rows;
  summary.healers = rows.map((r) => ({ level: r.level, healer: r.healer, baseK: r.baseline.dmgMult, limitK: r.limit.dmgMult, ratio: r.limit.ratio, hpsPctAtLimit: r.limit.hpsPctTankHp, hpsAtLimit: r.limit.hpsTank, overhealBase: r.atBase.overheal, overhealTargetedBase: r.atBase.overhealTargeted, failBurst05: r.limit.failAt?.burst05 ?? null, oomAtLimit: r.limit.oomAt }));
}

if (ONLY.has("pvp")) {
  const out: ReturnType<typeof pvp>[] = [];
  for (const l of PVP_LEVELS) {
    const r = pvp(l);
    out.push(r);
    log(`\n== 4) PvP L${l}: % побед строки над столбцом (${r.reps} повт.); бой — от первого урона до конца, с`);
    log(`${"".padEnd(12)}${CLS.map((c) => pad(c.slice(0, 5), 6)).join("")}   итог  бой,с`);
    for (const a of CLS) log(`${name(a)}${CLS.map((b) => pad(Math.round(r.matrix[a][b].win * 100), 6)).join("")}${pad(Math.round(r.classWin[a].win * 100) + "%", 7)}${pad(r.classWin[a].fight, 6)}`);
    log(`Сольгард против Умбрата: ${Math.round(r.solgardVsUmbrath * 100)}% побед Сольгарда; по ролям: ${r.roles.map((x) => `${x.role} ${Math.round(x.solgardWin * 100)}%`).join(", ")}`);
    log(`Перекошенные пары: ${r.skewed.map((x) => `${x.a}–${x.b} ${Math.round(x.aWin * 100)}%`).join(", ")}`);
  }
  report.pvp = out;
  summary.pvp = out.map((r) => ({ level: r.level, solgardVsUmbrath: r.solgardVsUmbrath, roles: r.roles.map((x) => ({ role: x.role, solgardWin: x.solgardWin })), classWin: Object.fromEntries(Object.entries(r.classWin).map(([c, v]) => [c, v.win])), skewed: r.skewed }));
}

report.summary = summary;
report.errors = ERRORS;
if (ERRORS.length) log(`\nОшибок игрового кода: ${ERRORS.length} (см. report.errors)`);
const codeEnd = codeInfo();
if (codeEnd.sha1 !== CODE_AT_START.sha1) {
  (report.meta as Record<string, unknown>).codeChangedDuringRun = true;
  log("\n! Код или данные изменились во время прогона: отчёт может не соответствовать ни одной версии — перезапустите.");
}
if (!STABLE) report.run = { generated: new Date().toISOString(), runSec: r1((Date.now() - t0) / 1000) };
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
log(`\nОтчёт: ${OUT} (${r1((Date.now() - t0) / 1000)} с), код ${CODE_AT_START.sha1.slice(0, 10)}${CODE_AT_START.uncommitted ? " (есть незакоммиченные правки)" : ""}`);
