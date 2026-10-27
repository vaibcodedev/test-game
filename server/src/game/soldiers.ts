/**
 * Бойцы фракций (задача 132, шаг 5; числа — data/patrols.json): патрули на дорогах безопасных земель, посты на мостах,
 * стража поселений, городов и фортов фракций, лучники на башнях стен вдоль рек.
 *
 * Боец — Mob с полем faction и юнитом UnitKind.Soldier (в state.mobs, как мобы): World.hostile делает его врагом героев чужой
 * фракции и только их — мобов он не трогает (стража мест добивает мобов у ограды, как стража Эмберхолла), площадные удары
 * и автоцели классов (World.enemiesInCircle) своих бойцов не задевают. Ходит и думает здесь (step из World.updateMob), бьёт через
 * World.hit — с бронёй и боем: чужак не сядет на коня и не уйдёт телепортом. Против верховых — выстрел издалека с замедлением.
 * Скрытых не видит: их раскрывают обереги (wards.ts, шаг 6) и зовут бойцов рядом (call). Вдали от героев спит, как мобы (World.awake — по текущему месту бойца).
 * Павший возвращается через respawnMin минут. Поводок — от «дома» (data/patrols.json zones, тайлы): стража города — город и полоса у стен, поселения — ограда и рядом,
 * пост моста — круг у поста, патруль — полоса вдоль маршрута. Враг вышел за зону — боец бросает его, идёт домой и не цепляется снова, пока враг не вернётся в зону.
 * Стража города поделена на секторы: на врага в городе (и у стен) нападает стража его сектора, соседние подтягиваются, если своих мало,
 * остальные держат посты. Лучники на башнях неубиваемы: не юниты (их рисует башня), бьют со стены врагов в радиусе.
 */
import P from "../../../data/patrols.json";
import NR from "../../../data/npc-ranks.json";
import townfolk from "../../../data/townfolk.json";
import world from "../../../data/world.json";
import { MOVE_MUL, PLAYER_RADIUS, TILE } from "../../../shared/constants";
import { CITIES, type City } from "../../../shared/cities";
import type { ClassId } from "../../../shared/classes";
import { pvpDamageMult } from "../../../shared/balance";
import { derive } from "../../../shared/formulas";
import { raidBotSave } from "../arena/botgear";
import { SETTLEMENTS } from "../../../shared/settlements";
import { lineClear, moveWithCollision, walkable, zoneAtPx, ZONES, type WorldMap } from "../../../shared/map";
import { BELT_HALF, GUARD_RANGE_TILES, TOWN } from "../../../shared/town";
import { NPC_GEAR, npcGearStrings, type NpcTier } from "../../../shared/npcGear";
import type { MobDef } from "../../../shared/mobs";
import { Anim, BUFF_BLEED, BUFF_CURSE, BUFF_ROOT, BUFF_SLOW, BUFF_STUN, Dir, UnitKind } from "../../../shared/protocol";
import { Mob } from "./Mob";
import { applySlow, tickEffects } from "./effects";
import { Wards } from "./wards";
import type { Player } from "./Player";
import type { World } from "./World";

export type Faction = "solgard" | "umbrath";
export type Kind = "melee" | "ranged";
type Pt = { x: number; y: number };
/** patrol — по дороге; post — пост (мост, поселение), держится поста; guard — стража города по секторам. */
export type SoldierRole = "patrol" | "post" | "guard";

const G = townfolk.guard;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** Внутренность стен города для секторов: |dx| ≤ 13, |dy| ≤ 10 от центра. */
/** Внутренность города для сеток секторов: на 2 клетки меньше полуразмера зоны (столица 145 — 19×14, форт — 13×10). */
const inOf = (half: { x: number; y: number }) => ({ x: half.x - 2, y: half.y - 2 });

/** Место со стражей: город фракции (секторы) или поселение; стража добивает мобов у ограды. */
export interface SoldierSite {
  x: number;
  y: number;
  half: Pt;
  faction: Faction;
  guards: Mob[];
  /** Город: сетка секторов и сколько своих должно выйти на врага. */
  city?: { c: City; cols: number; rows: number; min: number };
  lines: string[];
}

export interface SoldierState {
  role: SoldierRole;
  ranged: boolean;
  /** Отряд: патруль, пост моста, стража поселения — враг одного становится врагом всех рядом. */
  group: Mob[];
  site: SoldierSite | null;
  sector: number;
  post: (Pt & { dir: Dir }) | null;
  route: Pt[];
  /** Маршрут по кругу (улицы поселения) или туда-обратно (дорога). */
  loop: boolean;
  idx: number;
  step: 1 | -1;
  waitUntil: number;
  /** Откуда начал бой (патруль) или пост: сюда возвращается, от него меряется поводок. */
  anchor: Pt;
  chase: number;
  foe: Player | null;
  mobFoe: Mob | null;
  scanAt: number;
  /** Патруль идёт по маршруту, только если герой ближе P.walkNear (проверка раз в scanMs): за краем экрана стоит и не шлёт позиций. */
  near: boolean;
  nearAt: number;
  /** Точное место (px, py) и что последним записано в юнит (wx, wy): вне боя место уходит в схему не чаще SYNC_MS — клиент доводит плавно. */
  px: number;
  py: number;
  wx: number;
  wy: number;
  syncAt: number;
  /** Ведущий патруля: направление хода (единичный вектор, сглажено) — от него считается строй (follow). */
  hx: number;
  hy: number;
  /** Сила (шаг 7, data/npc-ranks.json): "" — обычный боец, "champion" — чемпион, "rankN" — звание стражи столицы. */
  power: string;
  /** Отряд Полей (шаг 11): боец — патруль по дороге из форта, у отряда свой выход, стычка и уход. */
  squad?: Squad;
}

/** Отряд на Полях (шаг 11, data/patrols.json squads): out — идёт к цели (и стоит там), back — возвращается в форт. */
export interface Squad {
  faction: Faction;
  target: string;
  group: Mob[];
  route: Pt[];
  phase: "out" | "back";
  /** Было ли столкновение с отрядом врага и когда последний раз рядом был враг-боец. */
  clashed: boolean;
  foeSeen: number;
}
const SQ = P.squads;
/** Вне боя позиция бойца пишется в схему не чаще (мс), как у стражи Эмберхолла (townfolk.ts): патрули не раздувают трафик. */
const SYNC_MS = 200;
/** Скорость поворота строя патруля, рад/с: не быстрее, чем бойцы успевают обойти дугу (догон formation.catchUp): разворот у конца дороги — 2–3 с. */
const TURN = 1.2;

/** Лучник на башне стены: неубиваем, не юнит (его рисует башня); mob — источник удара для World.hit. */
export interface Tower {
  mob: Mob;
  faction: Faction;
  /** Откуда летит стрела (верх башни), пиксели. */
  x: number;
  y: number;
  attackAt: number;
}

/** Статы героя 100 ур. в максимальной экипировке с заточкой plus (кэш): здоровье, броня, средний удар автоатаки с критом и его перезарядка. */
const HERO = new Map<string, { hp: number; armor: number; hit: number; cd: number }>();
export function npcHeroStats(cls: ClassId, plus: number) {
  const key = `${cls}|${plus}`;
  let h = HERO.get(key);
  if (h) return h;
  const s = raidBotSave(cls, 100, "", "max");
  for (const it of Object.values(s.equip)) if (it) it.plus = plus;
  const d = derive({ cls, level: 100, alloc: s.alloc, skills: s.skills, equip: s.equip });
  h = { hp: d.maxHp, armor: d.armor, hit: ((d.dmgMin + d.dmgMax) / 2) * (1 + d.crit * (d.critMult - 1)), cd: d.attackCd };
  HERO.set(key, h);
  return h;
}
/** Сила NPC: champion — чемпион, rank — звание стражи столицы (индекс в data/npc-ranks.json capital.ranks), ember — стража Эмберхолла. */
export type NpcPower = { kind: "champion" } | { kind: "rank"; rank: number } | { kind: "ember" };
/**
 * Статы героя 100 ур. для NPC (data/npc-ranks.json): здоровье и броня героя, урон автоатаки на перезарядку бойца, входящий урон — как герою
 * в PvP (pvp.damage на 100-м). Их же берёт стража Эмберхолла (townfolk.ts).
 */
export function npcPowerStats(f: Faction, kind: Kind, power: NpcPower, attackCd: number) {
  const cls = NR.classes[f][kind] as ClassId;
  const C = NR.champion, E = NR.ember;
  const plus = power.kind === "rank" ? NR.capital.ranks[power.rank].plus : power.kind === "ember" ? E.plus : C.plus;
  const F = C.faction[f];
  const kh = C.hp * F.hp * (power.kind === "ember" ? E.hp : 1), kd = C.dmg * F.dmg * (power.kind === "ember" ? E.dmg : 1);
  const h = npcHeroStats(cls, plus), taken = pvpDamageMult(100);
  return { maxHp: Math.round(h.hp * kh), armor: h.armor, dmg: h.hit * (attackCd / h.cd) * taken * kd, taken };
}
/** Боец со статами героя: бьёт как 100-й (Mob.level), уровень не подписан (unit.level = 0), plus в снаряжении — 0. */
export function applyNpcPower(m: Mob, f: Faction, kind: Kind, power: NpcPower) {
  const st = npcPowerStats(f, kind, power, m.def.attackCd);
  m.level = 100;
  m.baseStats = m.stats = { maxHp: st.maxHp, dmg: st.dmg, armor: st.armor, xp: 0, gold: [0, 0] };
  m.dmgTakenMul = st.taken;
  m.unit.level = 0;
  m.unit.maxHp = m.unit.hp = st.maxHp;
  if (power.kind === "champion") m.unit.name = NR.champion.names[f][kind];
  else if (power.kind === "rank") m.unit.name = NR.capital.ranks[power.rank].name;
}
/** Поправка силы обычного бойца (пост моста): множители здоровья и урона к мобу уровня. */
function boost(m: Mob, k: { hp: number; dmg: number }) {
  m.baseStats = m.stats = { ...m.stats, maxHp: Math.round(m.stats.maxHp * k.hp), dmg: m.stats.dmg * k.dmg };
  m.unit.maxHp = m.unit.hp = m.stats.maxHp;
}
/** Звание стражи столицы по номеру бойца сектора: доли share по кругу (data/npc-ranks.json capital.ranks). */
const RANK_CYCLE = NR.capital.ranks.flatMap((r, i) => Array.from({ length: r.share }, () => i));

const DEFS = new Map<string, MobDef>();
export function soldierDef(f: Faction, kind: Kind | "tower", name?: string, sprite?: string): MobDef {
  const key = `${f}:${kind}:${name ?? ""}:${sprite ?? ""}`;
  let d = DEFS.get(key);
  if (d) return d;
  const u = P.units[kind === "tower" ? "ranged" : kind], n = P.factions[f][kind === "tower" ? "ranged" : kind];
  d = {
    id: `soldier_${f}_${kind}`, name: name ?? (kind === "tower" ? P.factions[f].tower : n.name), sprite: sprite ?? n.sprite, size: 1,
    hp: u.hp, dmg: kind === "tower" ? P.towers.dmg : u.dmg, armor: u.armor, xp: 0, gold: 0, speed: u.speed, aggro: P.aggro,
    range: kind === "tower" ? P.towers.range : u.range, attackCd: kind === "tower" ? P.towers.attackMs / 1000 : u.attackCd, radius: u.radius,
    respawn: P.respawnMin * 60, color: "#ffc861", projectile: kind === "melee" ? undefined : "arrow",
  };
  DEFS.set(key, d);
  return d;
}

/** Средний уровень зоны в точке (пиксели); у городов и рек — 0 (тогда уровень из данных). */
function zoneLevel(m: WorldMap, x: number, y: number): number {
  const l = ZONES[zoneAtPx(m, x, y)]?.levels ?? [0, 0];
  return Math.round((l[0] + l[1]) / 2);
}

/** Расстояние (пиксели) от точки до ломаной маршрута. */
function routeDist(route: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i], b = route[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}

/** Ближайшая к точке (пиксели) проходимая клетка (центр), не из taken. */
function free(m: WorldMap, x: number, y: number, taken?: Set<number>): Pt {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 0; r <= 8; r++) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const px = (cx + i) * TILE + 16, py = (cy + j) * TILE + 16, key = (cy + j) * m.w + cx + i;
      if (taken?.has(key) || !walkable(m, px, py, 10)) continue;
      taken?.add(key);
      return r === 0 && !taken ? { x, y } : { x: px, y: py };
    }
  }
  return { x, y };
}

export class Soldiers {
  /** Все бойцы-юниты (в w.mobs). */
  readonly list: Mob[] = [];
  readonly towers: Tower[] = [];
  /** Пристрелка башен по герою (id): n — выстрелов по нему подряд, seen — когда он последний раз был в радиусе вражеской башни. */
  readonly towerRamp = new Map<string, { n: number; seen: number }>();
  readonly sites: SoldierSite[] = [];
  private scanAt = 0;
  private mobScanAt = 0;
  /** Когда отряд (массив group) снова может крикнуть тревогу. */
  private sayAt = new WeakMap<object, number>();
  /** Обереги у ворот мостов, поселений и фортов (шаг 6). */
  readonly wards: Wards;
  /** Отряды на Полях (шаг 11) и когда фракция выпустит следующий. */
  readonly squads: Squad[] = [];
  readonly squadAt: Record<Faction, number> = { solgard: 0, umbrath: 0 };
  /** Идёт битва за знамёна (шаг 14 ставит): отряды не выходят, вышедшие поворачивают домой. */
  bannerBattle = false;
  /** Свой интервал выхода отрядов фракции, мин (Сердце центра «Знамён Предела» — bannerWar.ts); нет — squads.intervalMin. */
  readonly squadEvery: Partial<Record<Faction, number>> = {};
  private squadScanAt = 0;

  constructor(private w: World) {
    this.wards = new Wards(w, this);
    this.buildRoads();
    this.buildBridges();
    this.buildSettlements();
    this.buildCities();
    this.buildTowers();
    this.squadAt.solgard = this.squadAt.umbrath = w.time + SQ.firstMin * 60000;
  }

  // ---------- расстановка ----------
  /** Сколько бойцов прошло через счёт чемпионов (каждый NR.champion.every-й — чемпион). */
  private nth = 0;
  /** power: champion/rank — явно; "auto" — каждый every-й чемпион; null — обычный боец. */
  private add(f: Faction, kind: Kind, level: number, at: Pt, st: Partial<SoldierState> & { role: SoldierRole; group: Mob[] }, name?: string, sprite?: string, power: NpcPower | "auto" | null = "auto"): Mob {
    if (power === "auto") power = ++this.nth % NR.champion.every === 0 ? { kind: "champion" } : null;
    const m = new Mob(this.w.uid("s"), soldierDef(f, kind, name, sprite), Math.max(1, level), { x: at.x, y: at.y });
    m.faction = f;
    m.unit.kind = UnitKind.Soldier;
    m.unit.faction = f;
    m.soldier = {
      ranged: kind === "ranged", site: null, sector: -1, post: null, route: [], loop: false, idx: 0, step: 1, waitUntil: 0,
      anchor: { x: at.x, y: at.y }, chase: P.units[kind].chaseSpeed, foe: null, mobFoe: null, scanAt: 0, near: false, nearAt: 0,
      px: m.unit.x, py: m.unit.y, wx: m.unit.x, wy: m.unit.y, syncAt: 0, hx: 1, hy: 0, power: power ? (power.kind === "rank" ? `rank${power.rank}` : power.kind) : "", ...st,
    };
    if (power) applyNpcPower(m, f, kind, power);
    this.dress(m, f, kind, st, power);
    st.group.push(m);
    this.w.addMob(m);
    this.list.push(m);
    return m;
  }

  /** Какой по счёту вариант набора (фракция:ранг:вид) выдан: варианты идут по очереди. */
  private variant = new Map<string, number>();
  /** Отряды, где знаменосец уже есть. */
  private banners = new WeakSet<Mob[]>();
  /**
   * Снаряжение бойца (шаг 8, data/npc-gear.json): ранг по силе и месту, вариант по очереди; тело — класс набора (u.sprite), слои — u.gear и
   * u.weapon в формате Player.recalc с plus = 0, геральдика — u.herald. Первый не-чемпион отряда — знаменосец, чемпион — с титулом над именем.
   * Пишется один раз при расстановке: снаряжение не меняется, в схеме уходит только с полным состоянием при входе.
   */
  private dress(m: Mob, f: Faction, kind: Kind, st: Partial<SoldierState> & { group: Mob[] }, power: NpcPower | null) {
    const T = NPC_GEAR.tiers;
    const tier: NpcTier = power?.kind === "champion" ? T.champion : power?.kind === "rank" ? T.capitalRanks[power.rank] ?? T.champion
      : st.squad ? T.fort : st.role === "patrol" ? T.patrol : st.site?.city ? T.fort : st.site ? T.settlement : T.bridge;
    const list = NPC_GEAR.sets[f][tier][kind], key = `${f}:${tier}:${kind}`, n = this.variant.get(key) ?? 0;
    this.variant.set(key, n + 1);
    const set = list[n % list.length];
    // в городах (столицы и форты) знаменосцев нет (решение пользователя 2026-10-24) — только в патрулях, на мостах и в поселениях
    const bannerman = power?.kind !== "champion" && !st.site?.city && !this.banners.has(st.group);
    if (bannerman) this.banners.add(st.group);
    const g = npcGearStrings(set, bannerman), u = m.unit;
    u.sprite = set.cls;
    u.gear = g.gear;
    u.weapon = g.weapon;
    u.herald = g.herald;
    if (power?.kind === "champion") u.title = NPC_GEAR.championTitle[f] ?? "";
  }

  /** Патрули на дорогах: участок дороги Сольгарда и его зеркало у Умбрата, уровень — по середине участка Сольгарда. */
  private buildRoads() {
    const map = this.w.map, roads = world.roads as unknown as Record<string, [number, number][]>;
    for (const r of P.roads) {
      const sol = roads[r.road];
      if (!Array.isArray(sol)) continue;
      const mid = sol[Math.floor((r.from + r.to) / 2)];
      const level = zoneLevel(map, mid[0] * TILE, mid[1] * TILE);
      for (const [name, f] of [[r.road, "solgard"], [r.mirror, "umbrath"]] as [string, Faction][]) {
        const line = roads[name];
        if (!Array.isArray(line)) continue;
        const route = line.slice(r.from, r.to + 1).map(([x, y]) => free(map, x * TILE, y * TILE));
        const group: Mob[] = [];
        for (let i = 0; i < r.size; i++) {
          const h0 = route.length > 1 ? Math.hypot(route[1].x - route[0].x, route[1].y - route[0].y) || 1 : 1;
          const hx = route.length > 1 ? (route[1].x - route[0].x) / h0 : 1, hy = route.length > 1 ? (route[1].y - route[0].y) / h0 : 0;
          this.add(f, i % 2 ? "ranged" : "melee", level, route[0], { role: "patrol", group, route, idx: Math.min(1, route.length - 1), hx, hy });
        }
      }
    }
  }

  /** Пост на каждом мосту: на своём берегу между мостом и воротами стены (запад — Сольгард, восток — Умбрат). */
  private buildBridges() {
    const map = this.w.map, taken = new Set<number>();
    for (const o of map.objects) {
      if (o.kind !== "bridge_h") continue;
      // bridge_h: x — клетка пересечения cx (настил cx−3…cx+2), y — нижний край (строки cy−1…cy+1)
      const cx = Math.round(o.x / TILE), cy = Math.round(o.y / TILE) - 2;
      const west = cx < map.w / 2, f: Faction = west ? "solgard" : "umbrath";
      const px = west ? cx - P.bridges.offset : cx + P.bridges.offset - 1;
      const group: Mob[] = [];
      for (let i = 0; i < P.bridges.size; i++) {
        const back = Math.floor(i / 2) * (west ? -1 : 1); // третий и дальше — на клетку ближе к стене
        const at = free(map, (px + back) * TILE + 16, (cy + (i % 2 ? 1 : -1)) * TILE + 16, taken);
        // на каждом мосту минимум один чемпион — первый ближник; остальные сильнее обычных (bridges.hp/dmg)
        const m = this.add(f, i % 2 ? "ranged" : "melee", P.bridges.level, at, { role: "post", group, post: { ...at, dir: west ? Dir.Right : Dir.Left } }, undefined, undefined,
          i === 0 ? { kind: "champion" } : null);
        if (i) boost(m, P.bridges);
      }
    }
  }

  /** Стража поселений: посты у ворот (через одного ближник и дальник) и патруль по улицам; уровень — зоны поселения. */
  private buildSettlements() {
    const map = this.w.map;
    for (const s of SETTLEMENTS) {
      const site: SoldierSite = { x: s.x, y: s.y, half: { x: s.ring.w, y: Math.max(s.ring.n, s.ring.s) }, faction: s.faction, guards: [], lines: s.guard.lines };
      this.sites.push(site);
      const level = zoneLevel(map, s.x * TILE, s.y * TILE), taken = new Set<number>();
      // посты: у ворот изнутри (s.posts), у ворот снаружи и по углам ограды снаружи (data/patrols.json settlements) — ближайшая свободная клетка
      const { w: rw, n: rn, s: rs } = s.ring, out = P.settlements.out;
      const gateOut: [number, number][] = s.gate === "n" ? [[-2, -rn - out], [2, -rn - out]] : s.gate === "s" ? [[-2, rs + out], [2, rs + out]]
        : s.gate === "e" ? [[rw + out, -2], [rw + out, 2]] : [[-rw - out, -2], [-rw - out, 2]];
      const corners: [number, number][] = P.settlements.corners ? [[-rw - out, -rn - out], [rw + out, -rn - out], [-rw - out, rs + out], [rw + out, rs + out]] : [];
      const outward = (dx: number, dy: number): Dir => (Math.abs(dx) / rw > Math.abs(dy) / Math.max(rn, rs) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);
      [...s.posts, ...gateOut, ...corners].forEach(([dx, dy], i) => {
        const at = free(map, (s.x + dx) * TILE + 16, (s.y + dy) * TILE + 16, taken);
        const side = (s.gate === "e" || s.gate === "w") && Math.abs(dx) >= s.ring.w - 1;
        const kind: Kind = i % 2 ? "ranged" : "melee";
        const dir = i < s.posts.length ? (side ? (dx < 0 ? Dir.Left : Dir.Right) : Dir.Down) : outward(dx, dy);
        this.add(s.faction, kind, level, at, { role: "post", group: site.guards, site, post: { ...at, dir } },
          kind === "melee" ? s.guard.name : undefined, kind === "melee" ? s.guard.sprite : undefined);
      });
      const route = s.patrol.map(([dx, dy]) => ({ x: (s.x + dx) * TILE, y: (s.y + dy) * TILE }));
      // патрули по улицам: ближник и дальник по очереди, стартуют с разных точек круга
      if (route.length) for (let k = 0; k < P.settlements.patrols; k++) {
        const i0 = Math.floor((k * route.length) / P.settlements.patrols), kind: Kind = k % 2 ? "ranged" : "melee";
        this.add(s.faction, kind, level, route[i0], { role: "post", group: site.guards, site, route, loop: true, idx: (i0 + 1) % route.length },
          kind === "melee" ? s.guard.name : undefined, kind === "melee" ? s.guard.sprite : undefined);
      }
    }
  }

  /** Стража столиц и фортов: посты у ворот и perSector бойцов в каждом секторе (через одного ближник и дальник). */
  private buildCities() {
    const map = this.w.map;
    for (const c of CITIES) {
      if (!c.capital || !c.style) continue;
      const f = c.capital as Faction, cfg = c.fort ? P.cities.fort : P.cities.capital;
      const site: SoldierSite = { x: c.x, y: c.y, half: c.half, faction: f, guards: [], lines: c.guard?.lines ?? [], city: { c, cols: cfg.cols, rows: cfg.rows, min: cfg.min } };
      this.sites.push(site);
      const taken = new Set<number>();
      // столица — звания (data/npc-ranks.json capital), форт — обычные бойцы и каждый every-й чемпион
      let nr = 0;
      const put = (x: number, y: number, kind: Kind, dir: Dir, gate: boolean) => {
        const at = free(map, x, y, taken);
        const power: NpcPower | "auto" = c.fort ? "auto" : { kind: "rank", rank: gate ? NR.capital.gateRank : RANK_CYCLE[nr++ % RANK_CYCLE.length] };
        this.add(f, kind, cfg.level, at, { role: "guard", group: site.guards, site, sector: this.sectorOf(site, at.x, at.y), post: { ...at, dir } },
          kind === "melee" ? c.guard?.name : undefined, kind === "melee" ? c.guard?.sprite : undefined, power);
      };
      // посты у ворот (изнутри и снаружи) и вдоль стен: [dx, dy, "m" | "r"], смотрят наружу
      for (const [dx, dy, k] of cfg.posts as [number, number, string][]) {
        put((c.x + dx) * TILE + 16, (c.y + dy) * TILE + 16, k === "r" ? "ranged" : "melee", Math.abs(dy) >= c.half.y - 3 ? (dy < 0 ? Dir.Up : Dir.Down) : dx < 0 ? Dir.Left : Dir.Right, true);
      }
      for (let j = 0; j < cfg.rows; j++) for (let i = 0; i < cfg.cols; i++) {
        const IN = inOf(c.half), at = (cfg as { sectorAt?: [number, number][] }).sectorAt?.[j * cfg.cols + i]; // sectorAt — где стоит стража сектора (форты: вдали от сценок, шаг 12)
        const sx = at ? at[0] - 0.5 : -IN.x + ((i + 0.5) * 2 * IN.x) / cfg.cols, sy = at ? at[1] - 0.5 : -IN.y + ((j + 0.5) * 2 * IN.y) / cfg.rows;
        for (let k = 0; k < cfg.perSector; k++) put((c.x + 0.5 + sx) * TILE, (c.y + 0.5 + sy) * TILE, k % 2 ? "ranged" : "melee", Dir.Down, false);
      }
    }
  }

  /** Лучники на башнях стен вдоль рек (map.objects bf_wall_tower_*: якорь — левая нижняя клетка 2×2). */
  private buildTowers() {
    for (const o of this.w.map.objects) {
      const f: Faction | null = o.kind === "bf_wall_tower_sol" ? "solgard" : o.kind === "bf_wall_tower_umb" ? "umbrath" : null;
      if (!f) continue;
      const x = o.x + TILE, y = Math.round(o.y + 2 - TILE);
      const m = new Mob(this.w.uid("t"), soldierDef(f, "tower"), P.towers.level, { x, y });
      m.faction = f;
      m.immune = true;
      this.towers.push({ mob: m, faction: f, x, y: y - 22, attackAt: 0 });
    }
  }

  // ---------- отряды Полей (шаг 11) ----------
  /** Дорога отряда фракции к цели (data/patrols.json squads.targets): вершины 0…to, у Умбрата — зеркальная дорога umb_*. */
  squadRoute(f: Faction, target: string): Pt[] {
    const T = SQ.targets.find((x) => x.id === target) ?? SQ.targets[0];
    const line = (world.roads as unknown as Record<string, [number, number][]>)[`${f === "solgard" ? "sol" : "umb"}_${T.road}`];
    if (!Array.isArray(line)) return [];
    return line.slice(0, T.to + 1).map(([x, y]) => free(this.w.map, x * TILE, y * TILE)).filter((p) => !this.inEmber(p.x, p.y));
  }
  /** Цель нового отряда: если отряд врага уже идёт на сходку (squads.meet) — туда же, иначе по весу. */
  private squadTarget(f: Faction): string {
    if (this.squads.some((q) => q.faction !== f && q.phase === "out" && q.target === SQ.meet)) return SQ.meet;
    let r = Math.random() * SQ.targets.reduce((a, x) => a + x.weight, 0);
    for (const x of SQ.targets) if ((r -= x.weight) < 0) return x.id;
    return SQ.targets[0].id;
  }
  /** Выпустить отряд из форта фракции: members у начала дороги, первый — чемпион (ведёт), первый не-чемпион — знаменосец. null — нет дороги. */
  spawnSquad(f: Faction, target = this.squadTarget(f)): Squad | null {
    const route = this.squadRoute(f, target);
    if (route.length < 2) return null;
    const end = route[route.length - 1], level = zoneLevel(this.w.map, end.x, end.y) || P.cities.fort.level;
    const q: Squad = { faction: f, target, group: [], route, phase: "out", clashed: false, foeSeen: 0 };
    const h0 = dist(route[1], route[0]) || 1, hx = (route[1].x - route[0].x) / h0, hy = (route[1].y - route[0].y) / h0;
    SQ.members.forEach((k, i) => {
      this.add(f, k as Kind, level, route[0], { role: "patrol", group: q.group, route, idx: 1, hx, hy, squad: q }, undefined, undefined, i === 0 ? { kind: "champion" } : null);
    });
    this.squads.push(q);
    return q;
  }
  /** Боец отряда уходит из мира (за воротами форта или тело после bodyMs); пустой отряд снимается. */
  private dropMember(m: Mob) {
    const q = m.soldier!.squad!;
    this.w.removeMob(m);
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
    q.group.splice(q.group.indexOf(m), 1);
    if (!q.group.length) this.squads.splice(this.squads.indexOf(q), 1);
  }
  /** Отряд поворачивает в форт: весь строй — назад по дороге, выход через leaveMs. */
  private squadBack(q: Squad) {
    if (q.phase === "back") return;
    q.phase = "back";
    const t = this.w.time;
    for (const g of q.group) {
      const s = g.soldier!;
      s.step = -1;
      s.idx = Math.max(0, Math.min(s.idx, s.route.length - 1) - 1);
      s.waitUntil = t + SQ.leaveMs;
    }
  }
  /** Такт отрядов (раз в scanMs): выход по таймеру, поворот после стычки и в битву за знамёна. */
  private squadTick() {
    const t = this.w.time;
    for (const f of ["solgard", "umbrath"] as Faction[]) {
      if (t < this.squadAt[f] || this.bannerBattle) continue;
      if (this.squads.filter((q) => q.faction === f).length >= SQ.max) continue;
      if (this.spawnSquad(f)) this.squadAt[f] = t + (this.squadEvery[f] ?? SQ.intervalMin) * 60000;
    }
    for (const q of this.squads) {
      if (this.bannerBattle) { this.squadBack(q); continue; }
      if (q.group.some((g) => this.alive(g) && g.soldier!.mobFoe?.soldier)) q.foeSeen = t;
      // стычка кончилась (врагов-бойцов рядом нет leaveMs) — выжившие идут домой
      if (q.clashed && t - q.foeSeen > SQ.leaveMs) {
        if (q.phase === "out") this.squadBack(q);
        else for (const g of q.group) g.soldier!.waitUntil = Math.min(g.soldier!.waitUntil, t);
        q.clashed = false;
      }
    }
  }
  /** В Эмберхолле или полосе вокруг (с запасом squads.emberMargin тайлов): отряды туда не заходят и там не бьют. */
  inEmber(x: number, y: number): boolean {
    const k = SQ.emberMargin;
    return Math.abs(x / TILE - (TOWN.x + 0.5)) <= BELT_HALF.x + 0.5 + k && Math.abs(y / TILE - (TOWN.y + 0.5)) <= BELT_HALF.y + 0.5 + k;
  }
  /**
   * Боец отряда без врага-героя: ближний боец вражеского отряда в aggro (стычка) или моб, напавший на героя своей фракции в helpRange (выручка).
   * Только у своей дороги и не у Эмберхолла.
   */
  private squadScan(m: Mob) {
    const s = m.soldier!, q = s.squad!;
    let best: Mob | null = null, bd = P.aggro;
    for (const e of this.squads) {
      if (e.faction === q.faction) continue;
      for (const g of e.group) {
        if (!this.alive(g)) continue;
        const d = dist(g, m);
        if (d < bd && this.inZone(m, g.x, g.y) && lineClear(this.w.map, m.x, m.y, g.x, g.y)) { bd = d; best = g; }
      }
    }
    if (best) {
      q.clashed = true;
      q.foeSeen = this.w.time;
      for (const g of q.group) if (this.alive(g) && !g.soldier!.foe && (g === m || !g.soldier!.mobFoe)) { g.soldier!.mobFoe = best; g.nav.reset(); }
      return;
    }
    if (s.mobFoe) return;
    bd = SQ.helpRange;
    for (const p of this.w.players.values()) {
      if (p.dead || p.faction !== m.faction || dist(p, m) > SQ.helpRange + P.aggro) continue;
      for (const mob of this.w.mobs.values()) {
        if (mob.dead || mob.faction || mob.def.boss || mob.unit.target !== p.id) continue;
        const d = dist(mob, p);
        if (d < bd && this.inZone(m, mob.x, mob.y)) { bd = d; best = mob; }
      }
    }
    if (best) { s.mobFoe = best; m.nav.reset(); }
  }
  /** Стычка отрядов: удар снимает долю максимального здоровья бойца врага (squads.clash), дальник — стрелой. */
  private fightSoldier(m: Mob, foe: Mob, dt: number, canMove: boolean): boolean {
    const s = m.soldier!, t = this.w.time, reach = m.def.range + foe.def.radius;
    const d = dist(m, foe), clear = lineClear(this.w.map, m.x, m.y, foe.x, foe.y);
    let moving = false;
    if ((d > reach || !clear) && canMove) moving = this.move(m, foe.x, foe.y, dt, this.speed(m, s.chase), s.ranged ? reach * 0.8 : reach - 6);
    if (d <= reach + 4 && clear && t >= m.attackAt) {
      m.attackAt = t + m.def.attackCd * 1000;
      m.unit.dir = dirTo(foe.x - m.x, foe.y - m.y);
      m.unit.aseq = (m.unit.aseq + 1) % 65535;
      const v = Math.max(1, Math.round(foe.unit.maxHp * (s.ranged ? SQ.clash.rangedPct : SQ.clash.meleePct)));
      const ms = s.ranged ? (d / P.arrowSpeed) * 1000 : 220;
      if (s.ranged) this.w.emit({ t: "proj", k: "arrow", from: m.id, to: foe.id, tx: foe.x, ty: foe.y, ms });
      this.w.later(ms, () => {
        if (m.dead || !this.alive(foe) || (!s.ranged && dist(m, foe) > reach + 24)) return;
        this.w.emit({ t: "dmg", id: foe.id, v, k: "phys" });
        this.w.applyDamage(foe, v, m);
      });
    }
    return moving;
  }

  // ---------- секторы города ----------
  /** Сектор города по точке (пиксели): сетка cols×rows внутри стен, края — в крайние секторы. */
  sectorOf(site: SoldierSite, px: number, py: number): number {
    const c = site.city!;
    const dx = px / TILE - (site.x + 0.5), dy = py / TILE - (site.y + 0.5), IN = inOf(site.half);
    const i = Math.max(0, Math.min(c.cols - 1, Math.floor(((dx + IN.x) * c.cols) / (2 * IN.x))));
    const j = Math.max(0, Math.min(c.rows - 1, Math.floor(((dy + IN.y) * c.rows) / (2 * IN.y))));
    return j * c.cols + i;
  }
  private neighbor(site: SoldierSite, a: number, b: number): boolean {
    const n = site.city!.cols;
    return a !== b && Math.abs((a % n) - (b % n)) <= 1 && Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1;
  }
  /** Точка (пиксели) у места: в прямоугольнике города (поселения) с запасом margin тайлов. */
  private near(site: SoldierSite, x: number, y: number, margin: number): boolean {
    return Math.abs(x / TILE - (site.x + 0.5)) <= site.half.x + 0.5 + margin && Math.abs(y / TILE - (site.y + 0.5)) <= site.half.y + 0.5 + margin;
  }

  /** Враг бойца фракции f: живой герой мира чужой фракции, не скрытый (скрытность NPC не видят). */
  private foeOf(f: string, p: Player): boolean {
    return !p.dead && p.team === 0 && !!p.faction && p.faction !== f && p.stealthUntil <= this.w.time && this.w.players.get(p.id) === p;
  }
  private alive(m: Mob) {
    return !m.dead && this.w.mobs.get(m.id) === m;
  }

  // ---------- такт ----------
  update(_dt: number) {
    const t = this.w.time;
    this.wards.update();
    if (t >= this.scanAt) {
      this.scanAt = t + P.scanMs;
      if (this.w.players.size) {
        this.citySectors();
        this.shootTowers();
      }
    }
    if (t >= this.squadScanAt) {
      this.squadScanAt = t + P.scanMs;
      this.squadTick();
    }
    if (t >= this.mobScanAt) {
      this.mobScanAt = t + 400;
      this.mobDefense();
    }
  }

  /** Стража города: на врага в городе (и у стен) — стража его сектора; если своих живых меньше min — ближайшие из соседних секторов. */
  private citySectors() {
    const margin = P.zones.city;
    for (const site of this.sites) {
      if (!site.city) continue;
      const foes: Player[] = [];
      for (const p of this.w.players.values()) if (this.foeOf(site.faction, p) && this.near(site, p.x, p.y, margin)) foes.push(p);
      for (const g of site.guards) if (g.soldier!.foe && !foes.includes(g.soldier!.foe)) g.soldier!.foe = null;
      if (!foes.length) continue;
      const alive = site.guards.filter((g) => this.alive(g));
      for (const e of foes) {
        const sec = this.sectorOf(site, e.x, e.y);
        let resp = alive.filter((g) => g.soldier!.sector === sec);
        if (resp.length < site.city.min) {
          const more = alive.filter((g) => this.neighbor(site, g.soldier!.sector, sec)).sort((a, b) => dist(a, e) - dist(b, e));
          resp = resp.concat(more.slice(0, site.city.min - resp.length));
        }
        let fresh: Mob | null = null;
        for (const g of resp) {
          const s = g.soldier!;
          if (s.foe) continue;
          s.foe = e;
          s.mobFoe = null;
          g.state = "chase";
          g.nav.reset();
          fresh ??= g;
        }
        if (fresh) this.alarm(fresh, site.guards);
      }
    }
  }

  /**
   * Лучники на башнях: ближайший враг в радиусе — стрела со стены (стена не мешает: стреляют сверху). Выстрел снимает pctMaxHp
   * максимального здоровья цели, броня режет не больше armorCap; пристрелка — каждый следующий выстрел по той же цели (любой башни)
   * сильнее на rampPerShot, до rampMax; цель вне радиуса всех вражеских башен дольше resetMs (или погибла) — пристрелка с нуля.
   * Щиты, блок и снижения урона работают как обычно (World.hit).
   */
  private shootTowers() {
    const t = this.w.time, T = P.towers, R = T.range;
    for (const p of this.w.players.values()) {
      const st = this.towerRamp.get(p.id);
      if (p.dead) { if (st) st.n = 0; continue; }
      if (!this.towers.some((tw) => tw.faction !== p.faction && dist(tw, p) < R)) continue;
      if (!st) this.towerRamp.set(p.id, { n: 0, seen: t });
      else {
        if (t - st.seen > T.resetMs) st.n = 0;
        st.seen = t;
      }
    }
    for (const id of this.towerRamp.keys()) if (!this.w.players.has(id)) this.towerRamp.delete(id);
    for (const tw of this.towers) {
      if (t < tw.attackAt) continue;
      let best: Player | null = null, bd = R;
      for (const p of this.w.players.values()) {
        if (!this.foeOf(tw.faction, p)) continue;
        const d = dist(tw, p);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best) continue;
      const p = best;
      tw.attackAt = t + T.attackMs;
      const st = this.towerRamp.get(p.id) ?? { n: 0, seen: t };
      this.towerRamp.set(p.id, st);
      const mult = Math.min(T.rampMax, 1 + T.rampPerShot * st.n++);
      const ms = (bd / P.arrowSpeed) * 1000;
      this.w.emit({ t: "proj", k: "arrow", from: tw.mob.id, fx: tw.x, fy: tw.y, to: p.id, tx: p.x, ty: p.y, ms });
      this.w.later(ms, () => {
        if (this.foeOf(tw.faction, p) && dist(tw, p) <= R * 1.25)
          this.w.hit(tw.mob, p, { kind: "phys", flat: p.unit.maxHp * T.pctMaxHp * mult, armorCap: T.armorCap, canCrit: false });
      });
    }
  }

  /** Стража мест добивает мобов у ограды (как стража Эмберхолла, townfolk.ts): моб в GUARD_RANGE_TILES от места — ближайшему свободному. */
  private mobDefense() {
    const taken = new Set<Mob>();
    for (const site of this.sites) for (const g of site.guards) {
      const s = g.soldier!;
      if (s.mobFoe && (!this.alive(s.mobFoe) || s.mobFoe.state === "return" || !this.near(site, s.mobFoe.x, s.mobFoe.y, GUARD_RANGE_TILES))) s.mobFoe = null;
      if (s.mobFoe) taken.add(s.mobFoe);
    }
    for (const m of this.w.mobs.values()) {
      if (m.dead || m.faction || m.def.boss || m.summoned || taken.has(m)) continue;
      for (const site of this.sites) {
        if (!this.near(site, m.x, m.y, GUARD_RANGE_TILES)) continue;
        let best: Mob | null = null, bd = Infinity;
        for (const g of site.guards) {
          if (!this.alive(g) || g.soldier!.foe || g.soldier!.mobFoe) continue;
          const d = dist(g, m);
          if (d < bd) { bd = d; best = g; }
        }
        if (best) { best.soldier!.mobFoe = m; best.nav.reset(); }
        break;
      }
    }
  }

  /** Тревога отряда: крик раз в 20 с (реплики места или фракции). */
  private alarm(m: Mob, group: object) {
    const t = this.w.time;
    if (t < (this.sayAt.get(group) ?? 0)) return;
    this.sayAt.set(group, t + 20000);
    const lines = m.soldier!.site?.lines.length ? m.soldier!.site.lines : P.factions[m.faction as Faction].alarm;
    this.w.emit({ t: "say", id: m.id, text: lines[Math.floor(Math.random() * lines.length)], snd: "alarm" });
  }

  /**
   * Зов оберега (wards.ts): раскрытого врага берут бойцы фракции f в радиусе r px от оберега — ближайший начинает бой (тревога, его отряд подхватывает),
   * остальные свободные в радиусе — тоже на него. Стража города в зов не идёт: её ведут секторы (citySectors).
   */
  call(foe: Player, x: number, y: number, r: number, f: string) {
    if (!this.foeOf(f, foe)) return;
    const near = this.list
      .filter((m) => m.faction === f && this.alive(m) && !m.soldier!.foe && m.soldier!.role !== "guard" && Math.hypot(m.x - x, m.y - y) <= r)
      .sort((a, b) => dist(a, foe) - dist(b, foe));
    if (!near.length) return;
    this.engage(near[0], foe);
    for (const m of near) {
      const s = m.soldier!;
      if (s.foe) continue;
      s.foe = foe;
      s.mobFoe = null;
      m.state = "chase";
      m.nav.reset();
    }
  }

  /** Боец начал бой с героем: патруль запоминает место (поводок), отряд рядом подхватывает врага. */
  private engage(m: Mob, foe: Player) {
    const s = m.soldier!;
    // стража города не зовёт весь город: соседей поднимают только секторы (citySectors)
    for (const g of s.role === "guard" ? [m] : s.group) {
      const gs = g.soldier!;
      if (g !== m && (!this.alive(g) || gs.foe || g.state === "return" || dist(g, m) > 500)) continue;
      gs.foe = foe;
      gs.mobFoe = null;
      g.state = "chase";
      g.nav.reset();
    }
    this.alarm(m, s.group);
  }

  /** Враг в поле зрения: сначала тот, кто бил (угроза), потом ближайший в aggro с прямой видимостью. */
  private scan(m: Mob): Player | null {
    const s = m.soldier!;
    let best: Player | null = null, bt = 0;
    for (const [id, th] of m.threat) {
      const p = this.w.players.get(id);
      if (p && th > bt && this.foeOf(m.faction, p) && this.inZone(m, p.x, p.y)) { bt = th; best = p; }
    }
    if (best || s.role === "guard" || m.state === "return") return best;
    let bd = P.aggro;
    for (const p of this.w.players.values()) {
      if (!this.foeOf(m.faction, p)) continue;
      const d = dist(p, m);
      if (d < bd && this.inZone(m, p.x, p.y) && lineClear(this.w.map, m.x, m.y, p.x, p.y)) { bd = d; best = p; }
    }
    return best;
  }

  /** Такт бойца (из World.updateMob): возрождение, эффекты, бой, возврат, обход. */
  step(m: Mob, dt: number) {
    const w = this.w, s = m.soldier!, u = m.unit, t = w.time;
    if (m.dead) {
      // боец отряда не возрождается: тело лежит bodyMs и исчезает
      if (s.squad) { if (t >= m.deadAt + SQ.bodyMs) this.dropMember(m); return; }
      if (t >= m.respawnAt) {
        m.reset();
        s.foe = s.mobFoe = null;
        s.anchor = { x: m.home.x, y: m.home.y };
        s.idx = Math.min(1, s.route.length - 1);
        s.step = 1;
        s.waitUntil = t + 1000;
        w.emit({ t: "spawn", id: m.id, k: "smoke" });
      }
      return;
    }
    tickEffects(w, m);
    let b = 0;
    if (m.slowUntil > t) b |= BUFF_SLOW;
    if (m.stunUntil > t) b |= BUFF_STUN;
    if (m.rootUntil > t) b |= BUFF_ROOT;
    if (m.curseUntil > t) b |= BUFF_CURSE;
    if (m.bleedUntil > t) b |= BUFF_BLEED;
    if (u.buffs !== b) u.buffs = b;
    if (m.stunUntil > t) {
      if (u.anim === Anim.Walk) u.anim = Anim.Idle;
      return;
    }
    const canMove = m.rootUntil <= t;
    // враг: выбыл, скрылся, ушёл из города (стража) — бросаем
    if (s.foe && !this.foeOf(m.faction, s.foe)) s.foe = null;
    // поводок от дома: враг ушёл из зоны или сам боец увлёкся дальше zones.slack тайлов за её край — бросает и идёт домой
    if (s.foe && (!this.inZone(m, s.foe.x, s.foe.y) || !this.inZone(m, u.x, u.y, P.zones.slack))) this.disengage(m);
    // ищем врага раз в scanMs; сразу — если бой только что кончился или по бойцу ударили (World.applyDamage ставит chase)
    if (m.state !== "return" && !s.foe && (t >= s.scanAt || m.state === "chase")) {
      s.scanAt = t + P.scanMs;
      const foe = this.scan(m);
      if (foe) this.engage(m, foe);
      else if (s.squad && !s.mobFoe?.soldier) this.squadScan(m);
    }
    // отряд: цель-моб или боец врага ушёл от дороги (или к Эмберхоллу) — бросаем
    if (s.squad && s.mobFoe && (!this.alive(s.mobFoe) || !this.inZone(m, s.mobFoe.x, s.mobFoe.y))) s.mobFoe = null;
    let moving = false;
    if (s.foe) {
      m.state = "chase";
      if (u.target !== s.foe.id) u.target = s.foe.id;
      moving = this.fight(m, s.foe, dt, canMove);
    } else if (s.mobFoe && this.alive(s.mobFoe) && m.state !== "return") {
      moving = s.mobFoe.soldier ? this.fightSoldier(m, s.mobFoe, dt, canMove) : this.fightMob(m, s.mobFoe, dt, canMove);
    } else {
      s.mobFoe = null;
      if (u.target) u.target = "";
      if (m.state === "chase") { m.state = "return"; m.nav.reset(); }
      if (m.state === "return") {
        const home = s.post ?? this.formationSlot(m) ?? s.anchor;
        moving = canMove && this.move(m, home.x, home.y, dt, s.chase * 0.8, 2);
        u.hp = Math.min(u.maxHp, u.hp + Math.ceil(u.maxHp * 0.05 * dt * 10));
        if (!moving || dist(u, home) < 6) {
          m.state = "idle";
          m.threat.clear();
          m.damageBy.clear();
          u.hp = u.maxHp;
          m.nav.reset();
        }
      } else if (canMove) moving = this.walk(m, dt);
    }
    if (moving) u.anim = Anim.Walk;
    else if (u.anim === Anim.Walk) u.anim = Anim.Idle;
  }

  /** В зоне ли бойца точка (пиксели), с запасом extra тайлов: стража города и поселения — место с полосой, пост — круг, патруль — полоса вдоль маршрута. */
  private inZone(m: Mob, x: number, y: number, extra = 0): boolean {
    const s = m.soldier!, Z = P.zones;
    if (s.squad) return !this.inEmber(x, y) && routeDist(s.route, x, y) <= (SQ.zone + extra) * TILE;
    if (s.site) return this.near(s.site, x, y, (s.site.city ? Z.city : Z.settlement) + extra);
    if (s.role === "patrol" && s.route.length > 1) return routeDist(s.route, x, y) <= (Z.patrol + extra) * TILE;
    const h = s.post ?? m.home;
    return Math.hypot(x - h.x, y - h.y) <= (Z.bridge + extra) * TILE;
  }

  private disengage(m: Mob) {
    const s = m.soldier!;
    s.foe = null;
    // патруль возвращается на ближайшую точку маршрута и идёт по нему дальше
    if (s.role === "patrol" && s.route.length) {
      let bi = 0;
      s.route.forEach((p, i) => { if (dist(p, m) < dist(s.route[bi], m)) bi = i; });
      s.anchor = { ...s.route[bi] };
      s.idx = bi;
    }
    m.state = "return";
    m.threat.clear();
    m.unit.target = "";
    m.nav.reset();
  }

  private speed(m: Mob, v: number) {
    return m.slowUntil > this.w.time ? v * (1 - m.slowPct / 100) : v;
  }

  /** Бой с героем: дальник и всякий против верхового — выстрел (по верховому — с замедлением), ближник — удар вплотную. */
  private fight(m: Mob, foe: Player, dt: number, canMove: boolean): boolean {
    const s = m.soldier!, t = this.w.time, mounted = !!foe.unit.mount;
    const ranged = s.ranged || mounted;
    const reach = (ranged ? Math.max(s.ranged ? m.def.range : 0, mounted ? P.mounted.range : 0) : m.def.range) + PLAYER_RADIUS;
    const d = dist(m, foe), clear = lineClear(this.w.map, m.x, m.y, foe.x, foe.y);
    let moving = false;
    if ((d > reach || !clear) && canMove) moving = this.move(m, foe.x, foe.y, dt, this.speed(m, s.chase), ranged ? reach * 0.8 : reach - 6);
    if (d <= reach + 4 && clear && t >= m.attackAt) this.attack(m, foe, ranged, d);
    return moving;
  }

  private attack(m: Mob, foe: Player, ranged: boolean, d: number) {
    const w = this.w, u = m.unit;
    m.attackAt = w.time + m.def.attackCd * 1000;
    u.dir = dirTo(foe.x - u.x, foe.y - u.y);
    u.aseq = (u.aseq + 1) % 65535;
    if (ranged) {
      const ms = (d / P.arrowSpeed) * 1000;
      w.emit({ t: "proj", k: "arrow", from: m.id, to: foe.id, tx: foe.x, ty: foe.y, ms });
      const mounted = !!foe.unit.mount;
      w.later(ms, () => {
        if (m.dead || !this.foeOf(m.faction, foe)) return;
        const r = w.hitEx(m, foe, { kind: "phys" });
        if (r.landed && (mounted || foe.unit.mount)) applySlow(w, m, foe, P.mounted.slowPct, P.mounted.slowMs);
      });
    } else {
      w.later(220, () => {
        if (m.dead || !this.foeOf(m.faction, foe) || dist(m, foe) > m.def.range + PLAYER_RADIUS + 24 || !lineClear(w.map, m.x, m.y, foe.x, foe.y)) return;
        w.hit(m, foe, { kind: "phys" });
      });
    }
  }

  /** Стража места против моба у ограды — как стража Эмберхолла: доля здоровья моба за удар. */
  private fightMob(m: Mob, mob: Mob, dt: number, canMove: boolean): boolean {
    const t = this.w.time, reach = G.attackRange + mob.def.radius, d = dist(m, mob);
    if (d > reach) return canMove && this.move(m, mob.x, mob.y, dt, this.speed(m, m.soldier!.chase), reach - 8);
    if (t >= m.attackAt) {
      m.attackAt = t + G.attackMs;
      m.unit.dir = dirTo(mob.x - m.x, mob.y - m.y);
      m.unit.aseq = (m.unit.aseq + 1) % 65535;
      this.w.later(160, () => {
        if (m.dead || !this.alive(mob)) return;
        const v = Math.max(G.minHit, Math.round(mob.unit.maxHp * G.hitPct));
        this.w.emit({ t: "dmg", id: mob.id, v, k: "phys" });
        this.w.applyDamage(mob, v);
      });
    }
    return false;
  }

  /** Без врага: патруль идёт по маршруту (у концов дороги — передышка), пост и стража стоят на месте. */
  private walk(m: Mob, dt: number): boolean {
    const s = m.soldier!, t = this.w.time;
    if (s.route.length > 1) {
      const lead = s.role === "patrol" ? this.leader(s.group) : null;
      if (lead && lead !== m) return this.follow(m, lead, dt);
      if (t >= s.nearAt) {
        s.nearAt = t + P.scanMs;
        s.near = false;
        const near = s.squad ? SQ.walkNear : P.walkNear;
        for (const p of this.w.players.values()) if (!p.dead && dist(p, m) < near) { s.near = true; break; }
      }
      if (!s.near) return false;
      const p = s.route[s.idx];
      // направление строя поворачивается к следующей точке плавно (на передышке у конца дороги строй разворачивается на месте, по дуге, а не сквозь ведущего)
      if (lead) this.turn(s, p.x - s.px, p.y - s.py, dt);
      let moving = false;
      if (t >= s.waitUntil) {
        moving = this.move(m, p.x, p.y, dt, this.speed(m, m.def.speed), 2);
        if (!moving) {
          let next = s.idx + s.step;
          if (s.loop) next = (s.idx + 1) % s.route.length;
          else if (s.squad && next < 0) {
            // отряд вернулся к воротам форта — уходит за них
            for (const g of [...s.squad.group]) this.dropMember(g);
            return false;
          } else if (s.squad && next >= s.route.length) {
            // отряд дошёл до цели: стоит holdMs (здесь сходятся с врагом), потом домой
            s.step = -1;
            next = s.idx - 1;
            s.waitUntil = t + SQ.holdMs;
            s.squad.phase = "back";
          } else if (next < 0 || next >= s.route.length) {
            s.step = s.step > 0 ? -1 : 1;
            next = s.idx + s.step;
            s.waitUntil = t + rnd(P.patrolWaitMs[0], P.patrolWaitMs[1]);
          }
          s.idx = Math.max(0, Math.min(s.route.length - 1, next));
          m.nav.reset();
        }
      }
      // маршрут ведущего — всему отряду: павшего ведущего сменит другой и пойдёт дальше с того же места
      if (lead) for (const g of s.group) if (g !== m) { const gs = g.soldier!; gs.idx = s.idx; gs.step = s.step; gs.waitUntil = s.waitUntil; gs.hx = s.hx; gs.hy = s.hy; }
      return moving;
    }
    const post = s.post ?? s.anchor;
    const moving = this.move(m, post.x, post.y, dt, this.speed(m, m.def.speed * 1.6), 1);
    if (!moving && s.post && dist(m, post) < 4 && m.unit.dir !== s.post.dir) m.unit.dir = s.post.dir;
    return moving;
  }

  // ---------- строй патруля ----------
  /** Повернуть направление строя к (dx, dy) не быстрее TURN рад/с. */
  private turn(s: SoldierState, dx: number, dy: number, dt: number) {
    if (Math.hypot(dx, dy) < 1) return;
    const ca = Math.atan2(s.hy, s.hx);
    let da = Math.atan2(dy, dx) - ca;
    da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
    const a = ca + Math.max(-TURN * dt, Math.min(TURN * dt, da));
    s.hx = Math.cos(a);
    s.hy = Math.sin(a);
  }
  /** Ведущий патруля: живой чемпион, иначе первый живой ближник, иначе первый живой. */
  private leader(group: Mob[]): Mob | null {
    let melee: Mob | null = null, any: Mob | null = null;
    for (const g of group) {
      if (!this.alive(g)) continue;
      if (g.soldier!.power === "champion") return g;
      if (!g.soldier!.ranged) melee ??= g;
      any ??= g;
    }
    return melee ?? any;
  }

  /** Место бойца в строю патруля (data/patrols.json formation): [вбок, назад] от ведущего по его ходу; на непроходимом — ближе к оси строя. null — не патруль или сам ведущий. */
  private formationSlot(m: Mob): Pt | null {
    const s = m.soldier!;
    if (s.role !== "patrol" || s.route.length < 2) return null;
    const lead = this.leader(s.group);
    if (!lead || lead === m) return null;
    const F = P.formation, ls = lead.soldier!;
    let mi = 0, ri = 0;
    for (const g of s.group) {
      if (g === lead || !this.alive(g)) continue;
      if (g === m) break;
      if (g.soldier!.ranged) ri++;
      else mi++;
    }
    const list = s.ranged ? F.ranged : F.melee, [side, back] = list[(s.ranged ? ri : mi) % list.length];
    const lx = ls.px, ly = ls.py, hx = ls.hx, hy = ls.hy;
    // место непроходимо (край дороги, вода): зеркальный бок, потом ближе к оси — но тогда дальше назад, чтобы не встать в ведущего и соседей
    for (const [k, extra] of [[1, 0], [-1, 0], [0.5, 0.5], [-0.5, 0.5], [0, 1]]) {
      const b = back + Math.abs(side) * extra;
      const x = lx - hy * side * k - hx * b, y = ly + hx * side * k - hy * b;
      if (walkable(this.w.map, x, y, 7)) return { x, y };
    }
    return { x: lx - hx * (back + 30), y: ly - hy * (back + 30) };
  }

  /** Боец патруля (не ведущий) держит своё место в строю: отстал — догоняет быстрее, на месте — смотрит, куда ведущий. */
  private follow(m: Mob, lead: Mob, dt: number): boolean {
    const s = m.soldier!, slot = this.formationSlot(m);
    if (!slot) return false;
    const d = Math.hypot(slot.x - s.px, slot.y - s.py);
    if (d < 1) {
      this.sync(m, true);
      if (lead.unit.anim !== Anim.Walk && m.unit.dir !== lead.unit.dir) m.unit.dir = lead.unit.dir;
      return false;
    }
    // догон: на месте — шаг ведущего, дальше — быстрее, до catchUp; шаг не перескакивает место (move режет по расстоянию)
    const v = m.def.speed * Math.min(P.formation.catchUp, 1 + d / 40);
    return this.move(m, slot.x, slot.y, dt, this.speed(m, v), 0);
  }

  /** Шаг к точке по пути (shared/path.ts): как World.moveMob, но бойцы входят в города и поселения. */
  private move(m: Mob, gx: number, gy: number, dt: number, speed: number, stopAt = 0): boolean {
    const u = m.unit, s = m.soldier!, map = this.w.map, t = this.w.time;
    // юнит сдвинули извне (возрождение, отбрасывание умением) — точное место берём из него
    if (u.x !== s.wx || u.y !== s.wy) { s.px = s.wx = u.x; s.py = s.wy = u.y; }
    const x = s.px, y = s.py;
    if (Math.hypot(gx - x, gy - y) <= stopAt + 0.5) return this.sync(m, true), false;
    const r = Math.min(12, m.def.radius * 0.6);
    const wp = m.nav.next(map, x, y, gx, gy, r, t);
    if (!wp) return this.sync(m, true), false;
    const final = wp.x === gx && wp.y === gy;
    const dx = wp.x - x, dy = wp.y - y, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(speed * MOVE_MUL * dt, final ? d - stopAt : d); // общий множитель ходьбы (data/balance.json moveMul)
    if (sp <= 0) return this.sync(m, true), false;
    const n = moveWithCollision(map, x, y, (dx / d) * sp, (dy / d) * sp, r);
    const moved = Math.abs(n.x - x) + Math.abs(n.y - y) > 0.01;
    s.px = Math.round(n.x * 10) / 10;
    s.py = Math.round(n.y * 10) / 10;
    const dir = dirTo(dx, dy);
    // в бою — каждый такт (точность ударов), вне боя — не чаще SYNC_MS и при повороте
    this.sync(m, !!s.foe || !!s.mobFoe || !moved || dir !== u.dir);
    if (u.dir !== dir) u.dir = dir;
    return moved;
  }
  /** Записать точное место бойца в юнит (схему): сразу (now) или раз в SYNC_MS. */
  private sync(m: Mob, now: boolean) {
    const s = m.soldier!, u = m.unit, t = this.w.time;
    if (!now && t < s.syncAt) return;
    s.syncAt = t + SYNC_MS;
    if (u.x !== s.px) u.x = s.px;
    if (u.y !== s.py) u.y = s.py;
    s.wx = u.x;
    s.wy = u.y;
  }
}
