// Карточки боссов стартовых земель (задача 136, шаг 1).
// Читает data/zone-bosses.json, проверяет карточки — умения по модели увёртывания dodgeModel, особые вещи по шаблону
// data/items.json — и пишет страницу для утверждения пользователем: tools/out/zone-bosses/index.html (со схемами умений в масштабе).
// Формы предупреждений — только те, что уже есть у боссов: w.telegraph circle | ring | cone (server/src/game/bosses.ts);
// клиент рисует их в client/src/game/effects.ts (case "tele").
// Запуск из корня проекта: npx tsx tools/gen/zone-bosses.ts
// Арт боссов (шаг 2, tools/gen/zone-bosses-art.ts): npx tsx tools/gen/zone-bosses.ts art — листы анимаций, монтажи
// «рядом с героем на траве» и «наш | референс», страница просмотра; всё в tools/out/zone-bosses/, в игру не подключено.
import * as fs from "node:fs";
import * as path from "node:path";
import { ZONE_BOSS_ART } from "./zone-bosses-art";

type Pt = [number, number];

const ROOT = process.cwd();
const DATA_PATH = path.join(ROOT, "data", "zone-bosses.json");
const ITEMS_PATH = path.join(ROOT, "data", "items.json");
const REFS_DIR = path.join(ROOT, "tools", "out", "refs", "bosses");
const OUT_DIR = path.join(ROOT, "tools", "out", "zone-bosses");
const OUT_HTML = path.join(OUT_DIR, "index.html");

const FRAME = 64;
const HERO_FRAME = 32;
const RESPAWN_MS = 30 * 60 * 1000;
const DEG = Math.PI / 180;
const FACTION_RU: Record<string, string> = { solgard: "Сольгард", umbrath: "Умбрат" };
/** Формы w.telegraph у боссов (server/src/game/bosses.ts); полосы line там нет. */
const TELE_RU: Record<string, string> = { circle: "круг", ring: "кольцо", cone: "конус" };
/** Куда можно поставить каждую форму (поле at). */
const PLACES: Record<string, string[]> = {
  circle: ["self", "tank", "random", "far", "all", "path", "spots", "scatter", "hunt", "same"],
  ring: ["self", "tank", "random", "far", "same"],
  cone: ["tank", "random", "far", "same"],
};
const TO_RU: Record<string, string> = { tank: "цели", random: "случайному герою", far: "дальнему герою" };
const ELEMENTS = ["phys", "fire", "frost", "nature", "poison", "shadow", "arcane"];
const AFTER_KEYS = ["rootMs", "burnMs", "poisonMs", "hazardMs", "hazardPct", "leap", "dash"];
const AFFIXES = ["str", "agi", "int", "vit", "hp", "crit"];
const CLASSES = ["warrior", "deathknight", "reaver", "rogue", "ranger", "darkranger", "mage", "warlock", "healer", "bloodweaver"];
const LOOK_KEYS = ["mat", "trim", "cloth", "hide", "haft", "fx", "gem"];
/** Герои на схеме, px от босса; +x — к цели босса (она стоит вплотную, на meleePx). */
const FAR: Pt = [236, 40];
const PREY: Pt = [-120, -100];
const OTHERS: Pt[] = [PREY, [150, -110], [-80, 140]];

/** Одна волна предупреждения: форма на земле и удар, когда она истекает. */
interface Wave {
  tele: string;
  at: string;
  to?: string;
  count?: number;
  r: number;
  r2?: number;
  arc?: number;
  dirs?: number[];
  turn?: number;
  spots?: number[][];
  spread?: number;
  step?: number;
  stepMs?: number;
  windupMs: number;
  dmgPct: number;
  escape?: number;
}

interface After {
  rootMs?: number;
  burnMs?: number;
  poisonMs?: number;
  hazardMs?: number;
  hazardPct?: number;
  leap?: boolean;
  dash?: boolean;
}

interface Ability extends Wave {
  id: string;
  name: string;
  does: string;
  k: string;
  after?: After;
  then?: Wave[];
  every: number;
  dodge: string;
}

interface Loot {
  name: string;
  cat: string;
  slot: string;
  rarity: string;
  lvl: number;
  fac: string;
  cls: string[];
  affix: string[];
  prop: string;
  look: Record<string, string>;
}

interface Boss {
  id: string;
  faction: string;
  location: string;
  levels: { band: number[]; boss: number };
  name: string;
  title: string;
  respawnMs: number;
  visual: { ref: string; take: string; simplify: string; palette: string };
  lore: string;
  gimmick: string;
  abilities: Ability[];
  loot: Loot[];
  lines: {
    spawn: string[];
    abilities: Record<string, string[]>;
    lowHp: string[];
    death: string[];
    kill: string[];
  };
}

interface Tier {
  upTo: number;
  windupMs: number;
  thenMs: number;
  dmgPct: number[];
  maxSpeed: number;
}

interface DodgeModel {
  reactMs: number;
  meleePx: number;
  arenaR: number;
  maxTotalPct: number;
  tiers: Tier[];
  unlock: Record<string, number>;
}

interface Data {
  frame: number;
  heroFrame: number;
  lowHpAt: number;
  dodgeModel: DodgeModel;
  bosses: Boss[];
}

interface Catalog {
  cats: Set<string>;
  palettes: Set<string>;
}

/** Ступень сложности: n — номер (1 — ур. 1–10 … 4 — ур. 30–40), 0 — не нашлась. */
interface Tiered {
  n: number;
  t: Tier;
}

type Fail = (msg: string) => void;

const NO_TIER: Tier = { upTo: 0, windupMs: 0, thenMs: 0, dmgPct: [0, 1], maxSpeed: 0 };

function loadCatalog(): Catalog {
  const raw = JSON.parse(fs.readFileSync(ITEMS_PATH, "utf8")) as {
    palettes: Record<string, unknown>;
    models: { cat: string }[];
  };
  return {
    cats: new Set(raw.models.map((m) => m.cat)),
    palettes: new Set(Object.keys(raw.palettes)),
  };
}

function tierOf(b: Boss, dm: DodgeModel): Tiered {
  const hi = b.levels.band[1] ?? 0;
  const i = dm.tiers.findIndex((t) => hi <= t.upTo);
  const t = dm.tiers[i];
  return t ? { n: i + 1, t } : { n: 0, t: NO_TIER };
}

/** Путь до безопасного места в худшем случае, px — нижняя оценка по форме. */
function minEscape(w: Wave, dm: DodgeModel): number {
  if (w.tele === "ring") return ((w.r2 ?? w.r) - w.r) / 2; // из середины полосы кольца к ближнему краю
  if (w.tele === "cone") {
    // герой на оси конуса: вбок до края или назад за дугу — что ближе; хуже всего, где оба пути равны
    const s = Math.sin((w.arc ?? 0) * 0.5 * DEG);
    return (w.r * s) / (1 + s);
  }
  if (w.at === "self") return Math.max(0, w.r - dm.meleePx); // ближний бой выбегает из круга вокруг босса
  return w.r; // из центра метки до её края
}

/** Для первой волны — большее из оценки по форме и escape; у продолжения — только escape (null — не задан). */
function escapeOf(w: Wave, dm: DodgeModel, first: boolean): number | null {
  if (!first) return w.escape ?? null;
  return Math.max(w.escape ?? 0, minEscape(w, dm));
}

/** Нужная скорость, px/с: путь за время предупреждения минус реакция. */
function speedOf(away: number, w: Wave, dm: DodgeModel): number {
  const s = (w.windupMs - dm.reactMs) / 1000;
  return s > 0 ? away / s : Infinity;
}

/** Как далеко от босса заходит форма, поставленная от него; null — форма у героя. */
function reach(w: Wave): number | null {
  switch (w.at) {
    case "self":
      return w.tele === "ring" ? w.r2 ?? w.r : w.r;
    case "path":
      return (w.count ?? 0) * (w.step ?? 0) + w.r;
    case "spots":
      return Math.max(0, ...(w.spots ?? []).map(([x = 0, y = 0]) => Math.hypot(x, y))) + w.r;
    case "scatter":
      return (w.spread ?? 0) + w.r;
    default:
      return w.tele === "cone" ? w.r : null;
  }
}

function unlock(feature: string, where: string, tier: Tiered, dm: DodgeModel, fail: Fail): void {
  const from = dm.unlock[feature];
  if (from !== undefined && tier.n < from) fail(`${where}: ${feature} — не раньше ${from}-й ступени, здесь ${tier.n}-я`);
}

function checkWave(w: Wave, prev: Wave | null, where: string, tier: Tiered, dm: DodgeModel, fail: Fail): void {
  const places = PLACES[w.tele];
  if (!places) {
    fail(`${where}: форма ${w.tele} — только circle, ring или cone, как у w.telegraph в bosses.ts`);
    return;
  }
  if (!places.includes(w.at)) fail(`${where}: ${TELE_RU[w.tele] ?? w.tele} нельзя поставить «${w.at}»`);
  if (w.at === "same" && !prev) fail(`${where}: «same» — только у продолжения (then)`);
  if (w.at === "same" && w.tele === "cone" && prev && prev.tele !== "cone") fail(`${where}: конус «там же» — только после конуса`);
  if (!(w.r > 0)) fail(`${where}: нет радиуса r`);
  if (w.tele === "ring" && !((w.r2 ?? 0) > w.r)) fail(`${where}: у кольца r2 должен быть больше r`);
  const arc = w.arc ?? 0;
  if (w.tele === "cone" && !(arc > 0 && arc < 180)) fail(`${where}: угол конуса arc — от 0 до 180°`);
  if (w.tele !== "cone" && (w.arc !== undefined || w.dirs !== undefined || w.turn !== undefined)) fail(`${where}: arc, dirs и turn — только у конуса`);
  if (w.turn !== undefined && w.at !== "same") fail(`${where}: поворот turn — только у волны «там же»`);
  const n = w.count ?? 0;
  const counted = ["path", "scatter", "hunt"].includes(w.at) || (w.at === "random" && w.tele !== "cone"); // конус бьёт в одного
  if (counted && !(Number.isInteger(n) && n > 0)) fail(`${where}: нужно count`);
  if (w.at === "path" && !(w.to !== undefined && w.to in TO_RU && (w.step ?? 0) > 0 && (w.stepMs ?? -1) >= 0)) fail(`${where}: ряду нужны to, step и stepMs`);
  if (w.at === "hunt" && !((w.stepMs ?? 0) > 0)) fail(`${where}: травле нужен stepMs`);
  if (w.at === "scatter" && !((w.spread ?? 0) > 0)) fail(`${where}: россыпи нужен spread`);
  if (w.at === "spots" && !(w.spots ?? []).length) fail(`${where}: нужны точки spots`);
  if (["path", "scatter", "hunt"].includes(w.at)) unlock(w.at, where, tier, dm, fail);
  if (w.tele === "ring") unlock("ring", where, tier, dm, fail);

  const minMs = prev ? tier.t.thenMs : tier.t.windupMs;
  if (!(Number.isInteger(w.windupMs) && w.windupMs >= minMs && w.windupMs > dm.reactMs)) {
    fail(`${where}: предупреждение ${w.windupMs} мс — нужно не меньше ${minMs}`);
  }
  const [lo = 0, hi = 1] = tier.t.dmgPct;
  if (!(w.dmgPct >= lo && w.dmgPct <= hi)) fail(`${where}: урон ${w.dmgPct} вне вилки ${lo}–${hi} для ${tier.n}-й ступени`);

  const away = escapeOf(w, dm, !prev);
  if (away === null) {
    fail(`${where}: у продолжения нужен escape — путь до безопасного места, px`);
  } else {
    const v = speedOf(away, w, dm);
    if (v > tier.t.maxSpeed) {
      fail(`${where}: не увернуться — ${Math.round(away)} px за ${w.windupMs - dm.reactMs} мс, это ${Math.round(v)} px/с при пределе ${tier.t.maxSpeed}`);
    }
  }
  const far = reach(w);
  if (far !== null && far > dm.arenaR) fail(`${where}: форма выходит за арену: ${Math.round(far)} px при радиусе ${dm.arenaR}`);
}

function checkAbility(a: Ability, b: Boss, tier: Tiered, dm: DodgeModel, fail: Fail): void {
  if (a.name === "" || a.does === "" || a.dodge === "") fail(`${a.id}: нет названия, описания или «как увернуться»`);
  if (!ELEMENTS.includes(a.k)) fail(`${a.id}: стихия ${a.k} неизвестна`);
  if (!(a.every > 0)) fail(`${a.id}: откат должен быть больше нуля`);
  if (!(b.lines.abilities[a.id] ?? []).length) fail(`${a.id}: нет реплики при использовании`);

  checkWave(a, null, a.id, tier, dm, fail);
  const then = a.then ?? [];
  if (then.length && tier.t.thenMs === 0) fail(`${a.id}: продолжения (then) — не на ${tier.n}-й ступени`);
  let prev: Wave = a;
  then.forEach((w, i) => {
    checkWave(w, prev, `${a.id}, волна ${i + 2}`, tier, dm, fail);
    prev = w;
  });

  const after = a.after ?? {};
  for (const key of Object.keys(after)) if (!AFTER_KEYS.includes(key)) fail(`${a.id}: after.${key} неизвестно`);
  if ((after.hazardMs === undefined) !== (after.hazardPct === undefined)) fail(`${a.id}: пятну нужны и hazardMs, и hazardPct`);
  if ((after.hazardPct ?? 0) > 0.1) fail(`${a.id}: пятно жжёт больше 10% здоровья в секунду`);
  if (after.leap) {
    unlock("leap", a.id, tier, dm, fail);
    if (a.tele !== "circle" || !["tank", "random", "far"].includes(a.at)) fail(`${a.id}: прыжок — только в круг под героем`);
  }
  if (after.dash) {
    unlock("dash", a.id, tier, dm, fail);
    if (a.at !== "path") fail(`${a.id}: таран — только по ряду (path)`);
  }
  // травля бьёт одного героя count раз, остальные волны — по разу
  const total = (a.at === "hunt" ? a.count ?? 1 : 1) * a.dmgPct + then.reduce((s, w) => s + w.dmgPct, 0);
  if (total > dm.maxTotalPct + 1e-9) {
    fail(`${a.id}: без увёртываний снимает ${Math.round(total * 100)}% — больше ${Math.round(dm.maxTotalPct * 100)}%`);
  }
}

function checkBoss(b: Boss, cat: Catalog, dm: DodgeModel, errs: string[]): void {
  const fail: Fail = (msg) => {
    errs.push(`${b.id}: ${msg}`);
  };
  const lo = b.levels.band[0] ?? 0;
  const hi = b.levels.band[1] ?? 0;
  const tier = tierOf(b, dm);
  if (!(b.faction in FACTION_RU)) fail("неизвестная фракция");
  if (b.levels.boss !== hi) fail(`босс должен быть у верха полосы (${hi})`);
  if (tier.n === 0) fail(`полоса ${lo}–${hi} выше всех ступеней dodgeModel.tiers`);
  if (b.respawnMs !== RESPAWN_MS) fail("возрождение — 30 минут");
  if (!fs.existsSync(path.join(REFS_DIR, `${b.visual.ref}.png`))) fail(`нет референса ${b.visual.ref}.png`);
  const sentences = b.lore.split(/[.!?]+/).filter((s) => s.trim() !== "").length;
  if (sentences < 2 || sentences > 3) fail(`лор — 2–3 предложения, сейчас ${sentences}`);
  if (!b.gimmick) fail("нет «фишки» (gimmick)");

  if (b.abilities.length !== 3) fail(`умений должно быть 3, сейчас ${b.abilities.length}`);
  const ids = new Set<string>();
  for (const a of b.abilities) {
    if (ids.has(a.id)) fail(`повтор умения ${a.id}`);
    ids.add(a.id);
    checkAbility(a, b, tier, dm, fail);
  }
  for (const id of Object.keys(b.lines.abilities)) if (!ids.has(id)) fail(`реплики к умению ${id}, которого нет`);

  if (b.loot.length < 2 || b.loot.length > 3) fail(`особой добычи 2–3 вещи, сейчас ${b.loot.length}`);
  for (const l of b.loot) {
    const where = `${b.id}/${l.name}`;
    if (!cat.cats.has(l.cat)) errs.push(`${where}: нет категории ${l.cat} в items.json`);
    if (!/^r[0-4]$/.test(l.rarity)) errs.push(`${where}: редкость ${l.rarity}`);
    if (l.lvl < lo || l.lvl > hi) errs.push(`${where}: уровень ${l.lvl} вне полосы ${lo}–${hi}`);
    if (l.fac !== "" && !(l.fac in FACTION_RU)) errs.push(`${where}: стиль ${l.fac}`);
    for (const c of l.cls) if (!CLASSES.includes(c)) errs.push(`${where}: класс ${c}`);
    for (const f of l.affix) if (!AFFIXES.includes(f)) errs.push(`${where}: аффикс ${f}`);
    for (const k of Object.keys(l.look)) {
      if (!LOOK_KEYS.includes(k)) errs.push(`${where}: ключ вида ${k}`);
      if (!cat.palettes.has(l.look[k] ?? "")) errs.push(`${where}: нет палитры ${l.look[k] ?? ""}`);
    }
    if (l.slot === "" || l.prop === "") errs.push(`${where}: нет слота или свойства`);
  }

  const L = b.lines;
  if (L.spawn.length < 1) fail("нет реплики появления");
  if (L.lowHp.length < 1) fail("нет реплики «мало здоровья»");
  if (L.death.length < 1) fail("нет реплики гибели");
  if (L.kill.length < 1) fail("нет реплик «убил героя»");
  for (const s of L.kill) if (!s.includes("{name}")) fail(`реплика «убил героя» без {name}: ${s}`);
}

/** Устройство умения без размеров: две разные «фишки» не должны совпасть и по нему, и по размерам. */
function signature(a: Ability): string {
  const waves = [a, ...(a.then ?? [])].map((w) => `${w.tele}@${w.at}${w.to ? `>${w.to}` : ""}×${w.count ?? 1}/${(w.dirs ?? [0]).length}`);
  return `${waves.join(" → ")} | ${Object.keys(a.after ?? {}).sort().join(",")}`;
}

function sizes(a: Ability): number[] {
  return [a, ...(a.then ?? [])].flatMap((w) => [w.r, w.r2 ?? 0, w.arc ?? 0, w.step ?? 0, w.spread ?? 0]);
}

/** Размеры совпадают с точностью 15%. */
function close(x: number[], y: number[]): boolean {
  return (
    x.length === y.length &&
    x.every((v, i) => {
      const u = y[i] ?? 0;
      return Math.abs(v - u) <= 0.15 * Math.max(Math.abs(v), Math.abs(u));
    })
  );
}

function validate(data: Data, cat: Catalog): string[] {
  const errs: string[] = [];
  const dm = data.dodgeModel;
  if (data.frame !== FRAME || data.heroFrame !== HERO_FRAME) {
    errs.push(`кадр ${FRAME}×${FRAME}, герой ${HERO_FRAME}×${HERO_FRAME}`);
  }
  if (!(data.lowHpAt > 0 && data.lowHpAt < 1)) errs.push("lowHpAt — доля от 0 до 1");
  if (!(dm.reactMs >= 0 && dm.meleePx > 0 && dm.arenaR > 0 && dm.maxTotalPct > 0 && dm.tiers.length > 0)) errs.push("dodgeModel заполнен не весь");
  if (data.bosses.length !== 8) errs.push(`боссов должно быть 8, сейчас ${data.bosses.length}`);
  const ids = new Set<string>();
  const gimmicks = new Set<string>();
  const perFaction: Record<string, number> = {};
  for (const b of data.bosses) {
    if (ids.has(b.id)) errs.push(`повтор id ${b.id}`);
    ids.add(b.id);
    if (gimmicks.has(b.gimmick)) errs.push(`${b.id}: «фишка» повторяет чужую`);
    gimmicks.add(b.gimmick);
    perFaction[b.faction] = (perFaction[b.faction] ?? 0) + 1;
    checkBoss(b, cat, dm, errs);
  }
  for (const f of Object.keys(FACTION_RU)) {
    if ((perFaction[f] ?? 0) !== 4) errs.push(`фракция ${f}: нужно 4 босса, сейчас ${perFaction[f] ?? 0}`);
  }
  const all = data.bosses.flatMap((b) => b.abilities.map((a) => ({ b, a, sig: signature(a), size: sizes(a) })));
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const p = all[i];
      const q = all[j];
      if (!p || !q || p.b.id === q.b.id) continue;
      if (p.sig === q.sig && close(p.size, q.size)) errs.push(`повтор умения: ${p.b.id}/${p.a.id} и ${q.b.id}/${q.a.id} (${p.sig})`);
    }
  }
  return errs;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ul(items: string[]): string {
  return `<ul>${items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
}

function sec(ms: number): string {
  return `${String(ms / 1000).replace(".", ",")} с`;
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

/** Сколько форм в волне; у волны «там же» — столько же, сколько у прошлой (prevN). */
function shapeCount(w: Wave, prevN: number): number {
  if (w.at === "same") return prevN;
  if (w.at === "spots") return (w.spots ?? []).length;
  if (w.tele === "cone") return (w.dirs ?? [0]).length;
  return ["random", "path", "scatter", "hunt"].includes(w.at) ? w.count ?? 1 : 1;
}

function shapeRu(w: Wave, n: number): string {
  const size = w.tele === "ring" ? `${w.r}–${w.r2 ?? 0} px` : w.tele === "cone" ? `${w.arc ?? 0}°, ${w.r} px` : `${w.r} px`;
  return `${n > 1 ? `${n} × ` : ""}${TELE_RU[w.tele] ?? w.tele} ${size}`;
}

function placeRu(w: Wave): string {
  const cone = w.tele === "cone";
  const n = w.count ?? 1;
  switch (w.at) {
    case "self":
      return "вокруг босса";
    case "tank":
      if (!cone) return "под целью босса";
      return w.dirs ? `от босса под ${w.dirs.map((d) => `${d}°`).join(", ")} к направлению на цель` : "от босса на его цель";
    case "random":
      if (cone) return "от босса на случайного героя";
      return n === 1 ? "под случайным героем" : "под разными случайными героями";
    case "far":
      return cone ? "от босса на дальнего героя" : w.tele === "ring" ? "вокруг дальнего героя" : "под дальним героем";
    case "all":
      return "под каждым героем";
    case "path":
      return `в ряд от босса к ${TO_RU[w.to ?? ""] ?? w.to ?? ""} через ${w.step ?? 0} px, бьют по очереди через ${sec(w.stepMs ?? 0)}`;
    case "spots":
      return `в точках вокруг босса ${(w.spots ?? []).map(([x = 0, y = 0]) => `(${x}, ${y})`).join(" ")}`;
    case "scatter":
      return `в случайных местах не дальше ${w.spread ?? 0} px от босса`;
    case "hunt":
      return `под одним героем, новая метка каждые ${sec(w.stepMs ?? 0)} там, где он стоит`;
    case "same":
      return w.turn ? `там же, с поворотом на ${w.turn}°` : "там же";
    default:
      return w.at;
  }
}

function afterRu(a: Ability): string[] {
  const f = a.after ?? {};
  const out: string[] = [];
  if (f.rootMs) out.push(`корни ${sec(f.rootMs)}`);
  if (f.burnMs) out.push(`горение ${sec(f.burnMs)}`);
  if (f.poisonMs) out.push(`яд ${sec(f.poisonMs)}`);
  if (f.hazardMs) out.push(`пятно на земле ${sec(f.hazardMs)}, ${pct(f.hazardPct ?? 0)} здоровья в секунду`);
  if (f.leap) out.push("босс прыгает в центр круга");
  if (f.dash) out.push("босс проносится по ряду");
  return out;
}

/** Точка и направление (радианы) для каждой формы волны на схеме. */
interface Spot {
  x: number;
  y: number;
  dir: number;
}

function anchors(w: Wave, prev: Spot[], dm: DodgeModel): Spot[] {
  const tank: Pt = [dm.meleePx, 0];
  const toward = (p: Pt): number => Math.atan2(p[1], p[0]);
  const under = (p: Pt): Spot => ({ x: p[0], y: p[1], dir: toward(p) });
  const fromBoss = (dir: number): Spot => ({ x: 0, y: 0, dir });
  const n = w.count ?? 1;
  const cone = w.tele === "cone";
  switch (w.at) {
    case "self":
      return [fromBoss(0)];
    case "tank":
      return cone ? (w.dirs ?? [0]).map((d) => fromBoss(d * DEG)) : [under(tank)];
    case "random":
      return cone ? [fromBoss(toward(PREY))] : OTHERS.slice(0, n).map(under);
    case "far":
      return cone ? [fromBoss(toward(FAR))] : [under(FAR)];
    case "all":
      return [tank, FAR, ...OTHERS].map(under);
    case "path": {
      const dir = toward(w.to === "far" ? FAR : w.to === "random" ? PREY : tank);
      const step = w.step ?? 0;
      return Array.from({ length: n }, (_, i) => ({ x: Math.cos(dir) * step * (i + 1), y: Math.sin(dir) * step * (i + 1), dir }));
    }
    case "spots":
      return (w.spots ?? []).map(([x = 0, y = 0]) => ({ x, y, dir: 0 }));
    case "scatter":
      // спираль с золотым углом: ровная россыпь без случайности, схема одна и та же от запуска к запуску
      return Array.from({ length: n }, (_, i) => {
        const a = i * 2.39996;
        const d = (w.spread ?? 0) * Math.sqrt((i + 0.5) / n);
        return { x: Math.cos(a) * d, y: Math.sin(a) * d, dir: 0 };
      });
    case "hunt":
      // добыча убегает: каждая следующая метка — там, где она в этот миг
      return Array.from({ length: n }, (_, i) => ({ x: PREY[0] - i * 48, y: PREY[1] + i * 14, dir: 0 }));
    case "same":
      return prev.map((s) => ({ ...s, dir: s.dir + (w.turn ?? 0) * DEG }));
    default:
      return [];
  }
}

function shapeSvg(w: Wave, s: Spot, cls: string): string {
  const f = (v: number): string => v.toFixed(1);
  if (w.tele === "circle") return `<circle class="${cls}" cx="${f(s.x)}" cy="${f(s.y)}" r="${w.r}"/>`;
  if (w.tele === "ring") {
    const loop = (r: number): string => `M${f(s.x - r)} ${f(s.y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    return `<path class="${cls}" fill-rule="evenodd" d="${loop(w.r2 ?? w.r)}${loop(w.r)}"/>`;
  }
  const h = (w.arc ?? 0) * 0.5 * DEG;
  const edge = (a: number): string => `${f(s.x + Math.cos(a) * w.r)} ${f(s.y + Math.sin(a) * w.r)}`;
  return `<path class="${cls}" d="M${f(s.x)} ${f(s.y)}L${edge(s.dir - h)}A${w.r} ${w.r} 0 0 1 ${edge(s.dir + h)}z"/>`;
}

/** Схема умения в масштабе: кадр босса, герои, арена и все волны. */
function schemeSvg(a: Ability, dm: DodgeModel): string {
  const half = dm.arenaR + 12;
  let prev: Spot[] = [];
  const layers = [a, ...(a.then ?? [])].map((w, i) => {
    const spots = anchors(w, prev, dm);
    prev = spots;
    return spots.map((s) => shapeSvg(w, s, `w${Math.min(i, 2)}`)).join("");
  });
  const heroes = [[dm.meleePx, 0] as Pt, FAR, ...OTHERS]
    .map(([x, y]) => `<rect class="hero" x="${x - HERO_FRAME / 2}" y="${y - HERO_FRAME / 2}" width="${HERO_FRAME}" height="${HERO_FRAME}"/>`)
    .join("");
  return (
    `<svg class="scheme" viewBox="${-half} ${-half} ${2 * half} ${2 * half}" role="img" aria-label="Схема: ${esc(a.name)}">` +
    `<circle class="arena" cx="0" cy="0" r="${dm.arenaR}"/>${layers.join("")}` +
    `<rect class="boss" x="${-FRAME / 2}" y="${-FRAME / 2}" width="${FRAME}" height="${FRAME}"/>${heroes}</svg>`
  );
}

function abilityHtml(a: Ability, tier: Tiered, dm: DodgeModel): string {
  let n = 1;
  const steps = [a, ...(a.then ?? [])]
    .map((w, i) => {
      n = shapeCount(w, n);
      const away = escapeOf(w, dm, i === 0);
      const run = away === null ? "" : ` · уйти ${Math.round(away)} px — ${Math.round(speedOf(away, w, dm))} px/с из ${tier.t.maxSpeed}`;
      return `<li>${esc(`${shapeRu(w, n)} ${placeRu(w)} — до удара ${sec(w.windupMs)}, урон ${pct(w.dmgPct)}${run}`)}</li>`;
    })
    .join("");
  const extra = afterRu(a);
  return `<div class="ab">
${schemeSvg(a, dm)}
<div class="ab-text">
<h4>${esc(a.name)} <span class="cd">откат ${a.every} с</span></h4>
<p>${esc(a.does)}</p>
<ol class="waves">${steps}</ol>
${extra.length ? `<p class="after">После удара: ${esc(extra.join(", "))}.</p>` : ""}
<p class="dodge"><b>Как увернуться:</b> ${esc(a.dodge)}</p>
</div>
</div>`;
}

function card(b: Boss, lowHpAt: number, dm: DodgeModel): string {
  const lo = b.levels.band[0] ?? 0;
  const hi = b.levels.band[1] ?? 0;
  const tier = tierOf(b, dm);
  const [dLo = 0, dHi = 1] = tier.t.dmgPct;
  const abilities = b.abilities.map((a) => abilityHtml(a, tier, dm)).join("\n");
  const loot = b.loot
    .map((l) => {
      const fac = l.fac === "" ? "нейтральный" : FACTION_RU[l.fac] ?? l.fac;
      return `<li><b>${esc(l.name)}</b> — ${esc(l.cat)}, ${esc(l.slot)}, ${esc(l.rarity)}, ур. ${l.lvl}, ${esc(fac)}; аффиксы ${esc(l.affix.join("/"))}; классы ${esc(l.cls.join(", "))}<br>${esc(l.prop)}</li>`;
    })
    .join("");
  const abilityLines = b.abilities
    .map((a) => `<h4>${esc(a.name)}</h4>${ul(b.lines.abilities[a.id] ?? [])}`)
    .join("");
  return `<article class="card ${b.faction}">
<header>
<img src="../refs/bosses/${b.visual.ref}.png" alt="образец ${b.visual.ref}" loading="lazy">
<div>
<h2>${esc(b.name)}</h2>
<p class="title">${esc(b.title)}</p>
<p class="meta">${FACTION_RU[b.faction] ?? b.faction} · ${esc(b.location)} · ур. ${lo}–${hi}, босс ур. ${b.levels.boss} · возрождение 30 мин · кадр ${FRAME}×${FRAME}</p>
<p class="ref">Образец ${b.visual.ref} из tools/out/refs — только для сравнения, в игру и в git не идёт.</p>
</div>
</header>
<section><h3>Вид</h3><p>${esc(b.visual.take)}</p><p><b>Упростить для кадра:</b> ${esc(b.visual.simplify)}</p><p><b>Палитра:</b> ${esc(b.visual.palette)}</p></section>
<section><h3>Лор</h3><p>${esc(b.lore)}</p></section>
<section><h3>Умения</h3>
<p class="gimmick"><b>Фишка:</b> ${esc(b.gimmick)}</p>
<p class="tier">Ступень ${tier.n} из ${dm.tiers.length}: предупреждение от ${sec(tier.t.windupMs)}, урон за попадание ${pct(dLo)}–${pct(dHi)}, уйти не быстрее ${tier.t.maxSpeed} px/с.</p>
${abilities}
</section>
<section><h3>Особая добыча</h3><ul>${loot}</ul></section>
<section><h3>Реплики</h3>
<h4>Появление</h4>${ul(b.lines.spawn)}
${abilityLines}
<h4>Мало здоровья (ниже ${Math.round(100 * lowHpAt)}%)</h4>${ul(b.lines.lowHp)}
<h4>Гибель</h4>${ul(b.lines.death)}
<h4>Убил героя</h4>${ul(b.lines.kill)}
</section>
</article>`;
}

function page(data: Data, errs: string[]): string {
  const dm = data.dodgeModel;
  const status =
    errs.length === 0
      ? `Проверка пройдена: ${data.bosses.length} карточек, умения — по модели увёртывания, вещи — по шаблону data/items.json, повторов между боссами нет.`
      : `Ошибки проверки (${errs.length}):<ul>${errs.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
  const legend = `Схемы в масштабе: тёмный квадрат — кадр босса ${FRAME}×${FRAME}, синие — герои ${HERO_FRAME}×${HERO_FRAME} (вплотную справа — цель босса, справа вдали — дальний герой), пунктир — арена ${dm.arenaR} px. Красное — первая волна, оранжевая и сиреневая рамки — следующие: каждая появляется, когда ударила прошлая. Урон — доля полного здоровья героя уровня босса. «Уйти N px — M px/с»: путь до безопасного места в худшем случае и нужная скорость с поправкой ${sec(dm.reactMs)} на реакцию; пределы ступеней заведомо ниже скорости героя. Формы — только круг, кольцо и конус, как у боссов на сервере (server/src/game/bosses.ts); ряды и прыжки собраны из кругов.`;
  const section = (faction: string): string => {
    const cards = data.bosses
      .filter((b) => b.faction === faction)
      .map((b) => card(b, data.lowHpAt, dm))
      .join("\n");
    return `<h2 class="fac ${faction}">${FACTION_RU[faction] ?? faction}</h2><div class="grid">${cards}</div>`;
  };
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Боссы стартовых земель — карточки</title>
<style>
body { font-family: system-ui, "Segoe UI", sans-serif; margin: 0; padding: 16px; background: #f5f2ea; color: #222; }
h1 { font-size: 22px; margin: 0 0 6px; }
.status { font-size: 14px; color: #555; }
.legend { font-size: 13px; color: #555; max-width: 960px; line-height: 1.4; }
h2.fac { margin: 24px 0 8px; font-size: 20px; }
h2.solgard { color: #8a6200; }
h2.umbrath { color: #5a2a86; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 480px), 1fr)); gap: 16px; }
.card { background: #fff; border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.12); border-top: 4px solid #999; min-width: 0; }
.card.solgard { border-top-color: #c9a227; }
.card.umbrath { border-top-color: #6a3d9a; }
.card header { display: flex; gap: 12px; align-items: flex-start; }
.card header img { width: 96px; height: 96px; object-fit: contain; background: #eee; border-radius: 4px; flex: none; }
.card h2 { font-size: 18px; margin: 0; }
.card h3 { font-size: 14px; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: .04em; color: #666; }
.card h4 { font-size: 14px; margin: 8px 0 2px; }
.card p { margin: 4px 0; font-size: 14px; line-height: 1.4; }
.card ul { margin: 2px 0 4px; padding-left: 18px; font-size: 14px; line-height: 1.4; }
.title { font-style: italic; color: #555; }
.meta, .ref, .tier { font-size: 12px; color: #666; }
.ab { display: flex; gap: 10px; align-items: flex-start; margin: 10px 0 0; padding-top: 10px; border-top: 1px solid #eee; }
.ab-text { flex: 1; min-width: 0; }
.ab h4 { margin: 0 0 2px; }
.cd { font-weight: 400; font-size: 12px; color: #777; }
.card .waves { margin: 4px 0; padding-left: 18px; font-size: 13px; line-height: 1.4; }
.card .after, .card .dodge { font-size: 13px; }
.scheme { width: 150px; height: 150px; flex: none; background: #fbfaf6; border: 1px solid #e4e0d6; border-radius: 4px; }
.scheme .arena { fill: none; stroke: #b9b4a8; stroke-width: 3; stroke-dasharray: 10 10; }
.scheme .w0 { fill: rgba(214, 48, 32, .35); stroke: #c62a1a; stroke-width: 4; }
.scheme .w1 { fill: rgba(240, 140, 20, .2); stroke: #e08a10; stroke-width: 4; stroke-dasharray: 12 8; }
.scheme .w2 { fill: rgba(140, 60, 200, .16); stroke: #8a3cc8; stroke-width: 4; stroke-dasharray: 5 7; }
.scheme .boss { fill: rgba(40, 40, 40, .6); }
.scheme .hero { fill: #2f6fd0; }
@media (max-width: 520px) { .ab { flex-direction: column; } }
</style>
</head>
<body>
<h1>Боссы стартовых земель — карточки на утверждение</h1>
<div class="status">${status}</div>
<p class="legend">${esc(legend)}</p>
<main>
${section("solgard")}
${section("umbrath")}
</main>
</body>
</html>
`;
}

/** Арт боссов, у которых он уже есть (шаг 2 — древень); остальные — шаг 3. */
function art(data: Data): void {
  for (const b of data.bosses) {
    const a = ZONE_BOSS_ART[b.id];
    if (!a) {
      console.log(`${b.name} (${b.id}): арта пока нет`);
      continue;
    }
    const t0 = Date.now();
    const files = a.write(ROOT, OUT_DIR);
    console.log(`${b.name} (${b.id}): ${files.length} файлов за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
    for (const f of files) console.log(`  ${path.relative(ROOT, f)}`);
  }
}

function main(): void {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`Нет файла ${DATA_PATH}. Запускайте из корня проекта.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as Data;
  if (process.argv.includes("art")) {
    art(data);
    return;
  }
  const errs = validate(data, loadCatalog());
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_HTML, page(data, errs), "utf8");
  console.log(`Карточек: ${data.bosses.length}, умений: ${data.bosses.reduce((s, b) => s + b.abilities.length, 0)}, ошибок проверки: ${errs.length}`);
  for (const e of errs) console.log(`  - ${e}`);
  console.log(`Страница: ${OUT_HTML}`);
  process.exitCode = errs.length > 0 ? 1 : 0;
}

main();
