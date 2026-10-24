/**
 * Бойцы фракций (задача 132, шаг 5; числа — data/patrols.json): патрули на дорогах безопасных земель, посты на мостах,
 * стража поселений, городов и фортов фракций, лучники на башнях стен вдоль рек.
 *
 * Боец — Mob с полем faction и юнитом UnitKind.Soldier (в state.mobs, как мобы): World.hostile делает его врагом героев чужой
 * фракции и только их — мобов он не трогает (стража мест добивает мобов у ограды, как стража Эмберхолла), площадные удары
 * и автоцели классов (World.enemiesInCircle) своих бойцов не задевают. Ходит и думает здесь (step из World.updateMob), бьёт через
 * World.hit — с бронёй и боем: чужак не сядет на коня и не уйдёт телепортом. Против верховых — выстрел издалека с замедлением.
 * Скрытых не видит (их ловят обереги, шаг 6). Вдали от героев спит, как мобы (World.awake — по текущему месту бойца).
 * Павший возвращается через respawnMin минут. Патруль держится маршрута: дальше leash от места, где начал бой, бросает врага.
 * Стража города поделена на секторы: на врага в городе (и у стен) нападает стража его сектора, соседние подтягиваются, если своих мало,
 * остальные держат посты. Лучники на башнях неубиваемы: не юниты (их рисует башня), бьют со стены врагов в радиусе.
 */
import P from "../../../data/patrols.json";
import townfolk from "../../../data/townfolk.json";
import world from "../../../data/world.json";
import { PLAYER_RADIUS, TILE } from "../../../shared/constants";
import { CITIES, CITY_GATE_GUARDS, type City } from "../../../shared/cities";
import { SETTLEMENTS } from "../../../shared/settlements";
import { lineClear, moveWithCollision, walkable, zoneAtPx, ZONES, type WorldMap } from "../../../shared/map";
import { GUARD_RANGE_TILES } from "../../../shared/town";
import type { MobDef } from "../../../shared/mobs";
import { Anim, BUFF_BLEED, BUFF_CURSE, BUFF_ROOT, BUFF_SLOW, BUFF_STUN, Dir, UnitKind } from "../../../shared/protocol";
import { Mob } from "./Mob";
import { applySlow, tickEffects } from "./effects";
import type { Player } from "./Player";
import type { World } from "./World";

type Faction = "solgard" | "umbrath";
type Kind = "melee" | "ranged";
type Pt = { x: number; y: number };
/** patrol — по дороге; post — пост (мост, поселение), держится поста; guard — стража города по секторам. */
export type SoldierRole = "patrol" | "post" | "guard";

const G = townfolk.guard;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** Внутренность стен города для секторов: |dx| ≤ 13, |dy| ≤ 10 от центра. */
const IN = { x: 13, y: 10 };

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
  leash: number;
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
}
/** Вне боя позиция бойца пишется в схему не чаще (мс), как у стражи Эмберхолла (townfolk.ts): патрули не раздувают трафик. */
const SYNC_MS = 200;

/** Лучник на башне стены: неубиваем, не юнит (его рисует башня); mob — источник удара для World.hit. */
export interface Tower {
  mob: Mob;
  faction: Faction;
  /** Откуда летит стрела (верх башни), пиксели. */
  x: number;
  y: number;
  attackAt: number;
}

const DEFS = new Map<string, MobDef>();
function defOf(f: Faction, kind: Kind | "tower", name?: string, sprite?: string): MobDef {
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
  readonly sites: SoldierSite[] = [];
  private scanAt = 0;
  private mobScanAt = 0;
  /** Когда отряд (массив group) снова может крикнуть тревогу. */
  private sayAt = new WeakMap<object, number>();

  constructor(private w: World) {
    this.buildRoads();
    this.buildBridges();
    this.buildSettlements();
    this.buildCities();
    this.buildTowers();
  }

  // ---------- расстановка ----------
  private add(f: Faction, kind: Kind, level: number, at: Pt, st: Partial<SoldierState> & { role: SoldierRole; group: Mob[] }, name?: string, sprite?: string): Mob {
    const m = new Mob(this.w.uid("s"), defOf(f, kind, name, sprite), Math.max(1, level), { x: at.x, y: at.y });
    m.faction = f;
    m.unit.kind = UnitKind.Soldier;
    m.unit.faction = f;
    m.soldier = {
      ranged: kind === "ranged", site: null, sector: -1, post: null, route: [], loop: false, idx: 0, step: 1, waitUntil: 0,
      anchor: { x: at.x, y: at.y }, leash: P.leash.post, chase: P.units[kind].chaseSpeed, foe: null, mobFoe: null, scanAt: 0, near: false, nearAt: 0,
      px: m.unit.x, py: m.unit.y, wx: m.unit.x, wy: m.unit.y, syncAt: 0, ...st,
    };
    st.group.push(m);
    this.w.addMob(m);
    this.list.push(m);
    return m;
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
          this.add(f, i % 2 ? "ranged" : "melee", level, route[0], { role: "patrol", group, route, idx: Math.min(1, route.length - 1), leash: P.leash.patrol, waitUntil: i * 1500 });
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
        this.add(f, i % 2 ? "ranged" : "melee", P.bridges.level, at, { role: "post", group, post: { ...at, dir: west ? Dir.Right : Dir.Left } });
      }
    }
  }

  /** Стража поселений: посты у ворот (через одного ближник и дальник) и патруль по улицам; уровень — зоны поселения. */
  private buildSettlements() {
    const map = this.w.map;
    for (const s of SETTLEMENTS) {
      const site: SoldierSite = { x: s.x, y: s.y, half: { x: s.ring.w, y: Math.max(s.ring.n, s.ring.s) }, faction: s.faction, guards: [], lines: s.guard.lines };
      this.sites.push(site);
      const level = zoneLevel(map, s.x * TILE, s.y * TILE);
      s.posts.forEach(([dx, dy], i) => {
        const at = { x: (s.x + dx) * TILE + 16, y: (s.y + dy) * TILE + 16 };
        const side = (s.gate === "e" || s.gate === "w") && Math.abs(dx) >= s.ring.w - 1;
        const kind: Kind = i % 2 ? "ranged" : "melee";
        this.add(s.faction, kind, level, at, { role: "post", group: site.guards, site, post: { ...at, dir: side ? (dx < 0 ? Dir.Left : Dir.Right) : Dir.Down } },
          kind === "melee" ? s.guard.name : undefined, kind === "melee" ? s.guard.sprite : undefined);
      });
      const route = s.patrol.map(([dx, dy]) => ({ x: (s.x + dx) * TILE, y: (s.y + dy) * TILE }));
      if (route.length) this.add(s.faction, "melee", level, route[0], { role: "post", group: site.guards, site, route, loop: true, idx: 1 % route.length }, s.guard.name, s.guard.sprite);
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
      const put = (x: number, y: number, kind: Kind, dir: Dir) => {
        const at = free(map, x, y, taken);
        this.add(f, kind, cfg.level, at, { role: "guard", group: site.guards, site, sector: this.sectorOf(site, at.x, at.y), post: { ...at, dir } },
          kind === "melee" ? c.guard?.name : undefined, kind === "melee" ? c.guard?.sprite : undefined);
      };
      CITY_GATE_GUARDS.forEach(([dx, dy], i) => put((c.x + dx) * TILE + 16, (c.y + dy) * TILE + 16, i % 2 ? "ranged" : "melee", Dir.Down));
      for (let j = 0; j < cfg.rows; j++) for (let i = 0; i < cfg.cols; i++) {
        const sx = -IN.x + ((i + 0.5) * 2 * IN.x) / cfg.cols, sy = -IN.y + ((j + 0.5) * 2 * IN.y) / cfg.rows;
        for (let k = 0; k < cfg.perSector; k++) put((c.x + 0.5 + sx) * TILE, (c.y + 0.5 + sy) * TILE, k % 2 ? "ranged" : "melee", Dir.Down);
      }
    }
  }

  /** Лучники на башнях стен вдоль рек (map.objects bf_wall_tower_*: якорь — левая нижняя клетка 2×2). */
  private buildTowers() {
    for (const o of this.w.map.objects) {
      const f: Faction | null = o.kind === "bf_wall_tower_sol" ? "solgard" : o.kind === "bf_wall_tower_umb" ? "umbrath" : null;
      if (!f) continue;
      const x = o.x + TILE, y = Math.round(o.y + 2 - TILE);
      const m = new Mob(this.w.uid("t"), defOf(f, "tower"), P.towers.level, { x, y });
      m.faction = f;
      m.immune = true;
      this.towers.push({ mob: m, faction: f, x, y: y - 22, attackAt: 0 });
    }
  }

  // ---------- секторы города ----------
  /** Сектор города по точке (пиксели): сетка cols×rows внутри стен, края — в крайние секторы. */
  sectorOf(site: SoldierSite, px: number, py: number): number {
    const c = site.city!;
    const dx = px / TILE - (site.x + 0.5), dy = py / TILE - (site.y + 0.5);
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
    if (t >= this.scanAt) {
      this.scanAt = t + P.scanMs;
      if (this.w.players.size) {
        this.citySectors();
        this.shootTowers();
      }
    }
    if (t >= this.mobScanAt) {
      this.mobScanAt = t + 400;
      this.mobDefense();
    }
  }

  /** Стража города: на врага в городе (и у стен) — стража его сектора; если своих живых меньше min — ближайшие из соседних секторов. */
  private citySectors() {
    const margin = GUARD_RANGE_TILES;
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

  /** Лучники на башнях: ближайший враг в радиусе — стрела со стены (стена не мешает: стреляют сверху). */
  private shootTowers() {
    const t = this.w.time, R = P.towers.range;
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
      tw.attackAt = t + P.towers.attackMs;
      const ms = (bd / P.arrowSpeed) * 1000;
      this.w.emit({ t: "proj", k: "arrow", from: tw.mob.id, fx: tw.x, fy: tw.y, to: p.id, tx: p.x, ty: p.y, ms });
      this.w.later(ms, () => {
        if (this.foeOf(tw.faction, p) && dist(tw, p) <= R * 1.25) this.w.hit(tw.mob, p, { kind: "phys" });
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

  /** Боец начал бой с героем: патруль запоминает место (поводок), отряд рядом подхватывает врага. */
  private engage(m: Mob, foe: Player) {
    const s = m.soldier!;
    // стража города не зовёт весь город: соседей поднимают только секторы (citySectors)
    for (const g of s.role === "guard" ? [m] : s.group) {
      const gs = g.soldier!;
      if (g !== m && (!this.alive(g) || gs.foe || g.state === "return" || dist(g, m) > 500)) continue;
      gs.foe = foe;
      gs.mobFoe = null;
      if (gs.role === "patrol") gs.anchor = { x: g.x, y: g.y };
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
      if (p && th > bt && this.foeOf(m.faction, p) && dist(p, s.anchor) < s.leash) { bt = th; best = p; }
    }
    if (best || s.role === "guard") return best;
    let bd = P.aggro;
    for (const p of this.w.players.values()) {
      if (!this.foeOf(m.faction, p)) continue;
      const d = dist(p, m);
      if (d < bd && lineClear(this.w.map, m.x, m.y, p.x, p.y)) { bd = d; best = p; }
    }
    return best;
  }

  /** Такт бойца (из World.updateMob): возрождение, эффекты, бой, возврат, обход. */
  step(m: Mob, dt: number) {
    const w = this.w, s = m.soldier!, u = m.unit, t = w.time;
    if (m.dead) {
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
    if (s.foe && (!this.foeOf(m.faction, s.foe) || (s.role === "guard" && !this.near(s.site!, s.foe.x, s.foe.y, GUARD_RANGE_TILES)))) s.foe = null;
    // ищем врага раз в scanMs; сразу — если бой только что кончился или по бойцу ударили (World.applyDamage ставит chase)
    if (m.state !== "return" && !s.foe && (t >= s.scanAt || m.state === "chase")) {
      s.scanAt = t + P.scanMs;
      const foe = this.scan(m);
      if (foe && (s.role !== "guard" || this.near(s.site!, foe.x, foe.y, GUARD_RANGE_TILES))) this.engage(m, foe);
    }
    // поводок: дальше leash от места начала боя (поста) — назад
    if (s.foe && s.role !== "guard" && dist(u, s.anchor) > s.leash) this.disengage(m);
    let moving = false;
    if (s.foe) {
      m.state = "chase";
      if (u.target !== s.foe.id) u.target = s.foe.id;
      moving = this.fight(m, s.foe, dt, canMove);
    } else if (s.mobFoe && this.alive(s.mobFoe) && m.state !== "return") {
      moving = this.fightMob(m, s.mobFoe, dt, canMove);
    } else {
      s.mobFoe = null;
      if (u.target) u.target = "";
      if (m.state === "chase") { m.state = "return"; m.nav.reset(); }
      if (m.state === "return") {
        const home = s.post ?? s.anchor;
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

  private disengage(m: Mob) {
    const s = m.soldier!;
    s.foe = null;
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
      if (t >= s.nearAt) {
        s.nearAt = t + P.scanMs;
        s.near = false;
        for (const p of this.w.players.values()) if (!p.dead && dist(p, m) < P.walkNear) { s.near = true; break; }
      }
      if (t < s.waitUntil || !s.near) return false;
      const p = s.route[s.idx];
      const moving = this.move(m, p.x, p.y, dt, this.speed(m, m.def.speed), 2);
      if (!moving) {
        let next = s.idx + s.step;
        if (s.loop) next = (s.idx + 1) % s.route.length;
        else if (next < 0 || next >= s.route.length) {
          s.step = s.step > 0 ? -1 : 1;
          next = s.idx + s.step;
          s.waitUntil = t + rnd(P.patrolWaitMs[0], P.patrolWaitMs[1]);
        }
        s.idx = Math.max(0, Math.min(s.route.length - 1, next));
        m.nav.reset();
      }
      return moving;
    }
    const post = s.post ?? s.anchor;
    const moving = this.move(m, post.x, post.y, dt, this.speed(m, m.def.speed * 1.6), 1);
    if (!moving && s.post && dist(m, post) < 4 && m.unit.dir !== s.post.dir) m.unit.dir = s.post.dir;
    return moving;
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
    const sp = Math.min(speed * dt, final ? d - stopAt : d);
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
