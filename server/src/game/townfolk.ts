/**
 * Жители Эмберхолла, городов и поселений (задача 132, шаг 3) на сервере: стражники (посты у ворот и патрули по улицам) и горожане.
 * Синхронизируются юнитами в state.mobs (kind Guard/Citizen), позиция пишется в схему не чаще SYNC_MS —
 * клиент плавно доводит. Стражники неуязвимы, добивают мобов у стен и стреляют в нарушителей мира (бой фракций в нейтральном городе).
 */
import data from "../../../data/townfolk.json";
import { CITIES, CITY_CITIZEN_COUNT, CITY_CITIZEN_SPOTS, CITY_GATE_GUARDS, CITY_PATROLS } from "../../../shared/cities";
import { SETTLEMENTS } from "../../../shared/settlements";
import { TILE } from "../../../shared/constants";
import { moveWithCollision } from "../../../shared/map";
import { Nav } from "../../../shared/path";
import { Anim, Dir, UnitKind } from "../../../shared/protocol";
import { CITIZEN_COUNT, CITIZEN_SPOTS, GATE_GUARDS, GUARD_RANGE_TILES, PATROLS, TOWN, TOWN_HALF, WALL } from "../../../shared/town";
import { Unit } from "../rooms/schema";
import { EMBER_SETS, npcGearStrings } from "../../../shared/npcGear";
import type { Mob } from "./Mob";
import type { Player } from "./Player";
import type { World } from "./World";

const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);

const SYNC_MS = 200;
const R = 8;
const G = data.guard, C = data.citizen;
/** Город со своей стражей: Эмберхолл, малые города, столицы и поселения (центр в тайлах, полуразмеры зоны, посты и маршруты). */
interface Site {
  x: number;
  y: number;
  half: { x: number; y: number };
  /** Расстояние от стен до ворот по x: посты у боковых стен смотрят наружу. */
  sideX: number | null;
  gateGuards: [number, number][];
  patrols: [number, number][][];
  spots: [number, number][];
  count: number;
  guard: { name: string; sprite: string; lines: string[] };
  people: { name: string; sprite: string }[];
}
const SITES: Site[] = [
  // Эмберхолл: посты и маршруты shared/town.ts и ещё столько же из data/townfolk.json (guard.posts, guard.patrols)
  { x: TOWN.x, y: TOWN.y, half: TOWN_HALF, sideX: WALL.x - 2, gateGuards: [...GATE_GUARDS, ...(G.posts as [number, number][])], patrols: [...PATROLS, ...(G.patrols as [number, number][][])],
    spots: CITIZEN_SPOTS, count: CITIZEN_COUNT, guard: G, people: C.people },
  // стража столиц, фортов и поселений фракций — бойцы фракций (soldiers.ts, задача 132, шаг 5): убиваемы, бьют врагов по секторам; здесь только горожане
  ...CITIES.filter((c) => c.style).map((c): Site => ({
    x: c.x, y: c.y, half: c.half, sideX: null, gateGuards: c.capital ? [] : CITY_GATE_GUARDS, patrols: c.capital ? [] : CITY_PATROLS, spots: CITY_CITIZEN_SPOTS, count: CITY_CITIZEN_COUNT,
    guard: { ...G, ...c.guard! }, people: c.people!,
  })),
  // поселения безопасных земель: двое жителей (стража — бойцы фракции)
  ...SETTLEMENTS.map((s): Site => ({
    x: s.x, y: s.y, half: { x: s.ring.w, y: Math.max(s.ring.n, s.ring.s) }, sideX: s.gate === "e" || s.gate === "w" ? s.ring.w - 1 : null,
    gateGuards: [], patrols: [], spots: s.spots, count: s.people.length, guard: { ...G, ...s.guard }, people: s.people,
  })),
];
/** Места со своей стражей здесь (Эмберхолл): только у них стража ищет мобов. */
const GUARDED = SITES.filter((s) => s.gateGuards.length || s.patrols.length);
/** Расстояние в тайлах от точки (тайлы) до прямоугольника города (0 внутри). */
function siteDist(s: Site, x: number, y: number): number {
  const ex = Math.max(0, Math.abs(x - (s.x + 0.5)) - s.half.x - 0.5);
  const ey = Math.max(0, Math.abs(y - (s.y + 0.5)) - s.half.y - 0.5);
  return Math.sqrt(ex * ex + ey * ey);
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Folk {
  id: string;
  site: Site;
  unit: Unit;
  guard: boolean;
  x: number;
  y: number;
  dir: Dir;
  anim: Anim;
  nav: Nav;
  /** Пост (у ворот) или null у патрульных и горожан. */
  post: { x: number; y: number; dir: Dir } | null;
  route: { x: number; y: number }[];
  idx: number;
  waitUntil: number;
  foe: Mob | null;
  attackAt: number;
  sayAt: number;
  /** Часовой у ворот: игрок уже рядом / когда можно окликнуть снова. */
  nearP: boolean;
  haltAt: number;
  syncAt: number;
}

export class Townfolk {
  readonly folk: Folk[] = [];
  private scanAt = 0;
  private n = 0;
  private ashN = 0;
  /** Таймеры города: перекличка на стенах и тревога (общая, чтобы не трубить на каждого моба). */
  private callAt = new Map<Site, number>();
  private alarmAt = new Map<Site, number>();

  constructor(private w: World) {
    for (const site of SITES) {
      // клетка-смещение от центра города → центр клетки в пикселях; точка маршрута (с .5) → пиксели
      const cellPx = (dx: number, dy: number) => ({ x: (site.x + dx) * TILE + 16, y: (site.y + dy) * TILE + 16 });
      const ptPx = (dx: number, dy: number) => ({ x: (site.x + dx) * TILE, y: (site.y + dy) * TILE });
      site.gateGuards.forEach(([dx, dy], i) => {
        const p = cellPx(dx, dy);
        // смотрят наружу: у боковых стен — от центра, у северных и южных ворот — к зрителю
        const dir = site.sideX !== null && Math.abs(dx) >= site.sideX ? (dx < 0 ? Dir.Left : Dir.Right) : Dir.Down;
        const f = this.add(site, true, p.x, p.y, { ...p, dir }, []);
        // в городах знаменосцев нет (решение пользователя 2026-10-24): знамёна — на башнях стен
        if (site === SITES[0]) this.ashborn(f, false);
      });
      for (const r of site.patrols) {
        const route = r.map(([dx, dy]) => ptPx(dx, dy));
        const f = this.add(site, true, route[0].x, route[0].y, null, route);
        if (site === SITES[0]) this.ashborn(f, false);
      }
      const spots = site.spots.map(([dx, dy]) => cellPx(dx, dy));
      for (let i = 0; i < site.count; i++) {
        const s = spots[(i * 7) % spots.length];
        const f = this.add(site, false, s.x, s.y, null, spots, site.people[i % site.people.length]);
        f.idx = (i * 7) % spots.length;
        f.waitUntil = rnd(500, 6000);
      }
    }
  }

  private add(site: Site, guard: boolean, x: number, y: number, post: Folk["post"], route: Folk["route"], who?: { name: string; sprite: string }): Folk {
    const u = new Unit();
    u.kind = guard ? UnitKind.Guard : UnitKind.Citizen;
    u.name = guard ? (post ? "Часовой" : site.guard.name) : who!.name;
    u.sprite = guard ? site.guard.sprite : who!.sprite;
    u.level = guard ? G.level : 1;
    u.hp = u.maxHp = 1;
    u.x = x;
    u.y = y;
    u.dir = post?.dir ?? Dir.Down;
    const f: Folk = { id: `${guard ? "g" : "c"}${++this.n}`, site, unit: u, guard, x, y, dir: u.dir, anim: Anim.Idle, nav: new Nav(), post, route, idx: 0, waitUntil: 0, foe: null, attackAt: 0, sayAt: 0, nearP: false, haltAt: 0, syncAt: 0 };
    this.folk.push(f);
    this.w.state.mobs.set(f.id, u);
    return f;
  }

  /** Стража Эмберхолла — Пепельнорождённые (data/ember-guard.json): снаряжение и геральдика, как у бойцов фракций, наборы по очереди;
   *  клиент рисует их телом nude_ashborn_<cls> со слоями (геральдика ember — по kind Guard). */
  private ashborn(f: Folk, bannerman: boolean) {
    const s = EMBER_SETS[this.ashN++ % EMBER_SETS.length], g = npcGearStrings(s, bannerman), u = f.unit;
    u.sprite = s.cls;
    u.gear = g.gear;
    u.weapon = g.weapon;
    u.herald = g.herald;
  }

  /** Моб жив и ещё в мире: encounters/bosses убирают мобов без dead (removeMob) — такие перестают быть целью. */
  private alive(m: Mob) {
    return !m.dead && this.w.mobs.get(m.id) === m;
  }

  /** Моб угрожает городу: живой, не босс и в пределах GUARD_RANGE_TILES от стен. */
  private threat(m: Mob, site: Site) {
    return this.alive(m) && !m.def.boss && !m.faction && siteDist(site, m.x / TILE, m.y / TILE) <= GUARD_RANGE_TILES;
  }

  update(dt: number) {
    const t = this.w.time;
    if (t >= this.scanAt) {
      this.scanAt = t + 400;
      this.assignFoes();
      this.voices(t);
    }
    for (const f of this.folk) {
      if (f.guard) this.updateGuard(f, dt);
      else this.updateCitizen(f, dt);
      // редкая синхронизация позиции; анимация и взгляд — вместе с ней
      if (t >= f.syncAt) {
        f.syncAt = t + SYNC_MS;
        const u = f.unit;
        if (u.x !== f.x) u.x = f.x;
        if (u.y !== f.y) u.y = f.y;
        if (u.dir !== f.dir) u.dir = f.dir;
        if (u.anim !== f.anim) u.anim = f.anim;
      }
    }
  }

  private assignFoes() {
    const all = this.folk.filter((f) => f.guard);
    for (const g of all) if (g.foe && (!this.threat(g.foe, g.site) || g.foe.state === "return")) g.foe = null;
    for (const m of this.w.mobs.values()) {
      if (m.dead || all.some((g) => g.foe === m)) continue;
      const site = GUARDED.find((s) => this.threat(m, s));
      if (!site) continue;
      const guards = all.filter((g) => g.site === site);
      let best: Folk | null = null, bd = Infinity;
      for (const g of guards) {
        if (g.foe) continue;
        const d = Math.hypot(g.x - m.x, g.y - m.y);
        if (d < bd) { bd = d; best = g; }
      }
      if (!best) continue;
      best.foe = m;
      best.nav.reset();
      if (this.w.time >= (this.alarmAt.get(site) ?? 0)) {
        // тревога на весь город: колокол и рог у тех, кто рядом
        this.alarmAt.set(site, this.w.time + 30000);
        best.sayAt = this.w.time + 20000;
        this.w.emit({ t: "say", id: best.id, text: "Тревога!", snd: "alarm" });
      } else if (this.w.time >= best.sayAt) {
        best.sayAt = this.w.time + 20000;
        this.w.emit({ t: "say", id: best.id, text: best.site.guard.lines[Math.floor(Math.random() * best.site.guard.lines.length)] });
      }
    }
  }

  /** Стража бьёт нарушителя мира в нейтральном городе (задача 38): выстрел ближайшего стражника. */
  punish(p: Player, dmg: number) {
    let best: Folk | null = null, bd = Infinity;
    for (const f of this.folk) {
      if (!f.guard) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best || bd > 1200) return;
    const g = best, t = this.w.time;
    g.dir = Math.abs(p.x - g.x) > Math.abs(p.y - g.y) ? (p.x < g.x ? Dir.Left : Dir.Right) : p.y < g.y ? Dir.Up : Dir.Down;
    g.unit.dir = g.dir;
    g.unit.aseq = (g.unit.aseq + 1) % 65535;
    if (t >= g.sayAt) {
      g.sayAt = t + 8000;
      this.w.emit({ t: "say", id: g.id, text: "Нарушитель! Взять его!", snd: "alarm" });
    }
    const ms = (bd / 700) * 1000;
    this.w.emit({ t: "proj", k: "arrow", from: g.id, to: p.id, tx: p.x, ty: p.y, ms });
    this.w.later(ms, () => {
      if (p.dead || this.w.players.get(p.id) !== p) return;
      this.w.applyDamage(p, dmg);
      this.w.emit({ t: "dmg", id: p.id, v: dmg, k: "phys" });
    });
  }

  /** Есть ли живой игрок в радиусе px от точки; seen — только видимые (не скрытые). */
  private playerNear(x: number, y: number, px: number, seen = false): boolean {
    const t = this.w.time;
    for (const p of this.w.players.values()) if (p.unit.anim !== Anim.Dead && (!seen || p.stealthUntil <= t) && Math.hypot(p.unit.x - x, p.unit.y - y) < px) return true;
    return false;
  }

  /**
   * Голоса стражи: окрик у ворот и перекличка на стенах (только если рядом есть игрок — трафик минимален).
   * Окрик — только на видимых (задача 132, шаг 6): часовой скрытность не видит и скрытого не выдаёт, врагов ловят обереги (wards.ts).
   */
  private voices(t: number) {
    for (const f of this.folk) {
      if (!f.guard || !f.post) continue;
      const near = this.playerNear(f.x, f.y, 150, true);
      if (near && !f.nearP && t >= f.haltAt) {
        f.haltAt = t + 25000;
        this.w.emit({ t: "say", id: f.id, text: "Стой, кто идёт!", snd: "halt" });
      }
      f.nearP = near;
    }
    for (const site of SITES) {
      if (t < (this.callAt.get(site) ?? 0)) continue;
      this.callAt.set(site, t + rnd(22000, 42000));
      const posts = this.folk.filter((f) => f.site === site && f.guard && f.post && !f.foe);
      if (!posts.length) continue;
      const f = posts[Math.floor(Math.random() * posts.length)];
      if (!this.playerNear(f.x, f.y, 700)) continue;
      this.w.emit({ t: "say", id: f.id, text: Math.random() < 0.7 ? "Всё спокойно!" : "На посту всё тихо!", snd: "call" });
    }
  }

  private step(f: Folk, gx: number, gy: number, speed: number, dt: number, stopAt: number): boolean {
    const d0 = Math.hypot(gx - f.x, gy - f.y);
    if (d0 <= stopAt) return false;
    const wp = f.nav.next(this.w.map, f.x, f.y, gx, gy, R, this.w.time);
    if (!wp) return false;
    const final = wp.x === gx && wp.y === gy;
    const dx = wp.x - f.x, dy = wp.y - f.y, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(speed * dt, final ? d - stopAt : d);
    if (sp <= 0) return false;
    const n = moveWithCollision(this.w.map, f.x, f.y, (dx / d) * sp, (dy / d) * sp, R);
    const moved = Math.abs(n.x - f.x) + Math.abs(n.y - f.y) > 0.01;
    f.x = Math.round(n.x * 10) / 10;
    f.y = Math.round(n.y * 10) / 10;
    f.dir = dirTo(dx, dy);
    return moved;
  }

  private updateGuard(f: Folk, dt: number) {
    const t = this.w.time;
    let moving = false;
    const m = f.foe;
    if (m && this.alive(m)) {
      const reach = G.attackRange + m.def.radius;
      const d = Math.hypot(m.x - f.x, m.y - f.y);
      if (d > reach) moving = this.step(f, m.x, m.y, G.chaseSpeed, dt, reach - 8);
      else if (t >= f.attackAt) {
        f.attackAt = t + G.attackMs;
        f.dir = dirTo(m.x - f.x, m.y - f.y);
        f.unit.dir = f.dir;
        f.unit.aseq = (f.unit.aseq + 1) % 65535;
        this.w.later(160, () => {
          if (!this.alive(m)) return;
          const v = Math.max(G.minHit, Math.round(m.unit.maxHp * G.hitPct));
          this.w.emit({ t: "dmg", id: m.id, v, k: "phys" });
          this.w.applyDamage(m, v);
        });
      }
    } else {
      f.foe = null;
      if (f.post) {
        moving = this.step(f, f.post.x, f.post.y, G.patrolSpeed * 1.6, dt, 1);
        if (!moving && Math.hypot(f.post.x - f.x, f.post.y - f.y) < 4) f.dir = f.post.dir;
      } else if (t >= f.waitUntil) {
        const p = f.route[f.idx];
        moving = this.step(f, p.x, p.y, G.patrolSpeed, dt, 2);
        if (!moving) {
          f.idx = (f.idx + 1) % f.route.length;
          f.waitUntil = t + rnd(800, 2500);
        }
      }
    }
    f.anim = moving ? Anim.Walk : Anim.Idle;
  }

  private updateCitizen(f: Folk, dt: number) {
    const t = this.w.time;
    let moving = false;
    if (t >= f.waitUntil) {
      const p = f.route[f.idx];
      moving = this.step(f, p.x, p.y, C.speed, dt, 2);
      if (!moving) {
        let next = Math.floor(Math.random() * f.route.length);
        if (next === f.idx) next = (next + 1) % f.route.length;
        f.idx = next;
        f.nav.reset();
        f.waitUntil = t + rnd(C.waitMs[0], C.waitMs[1]);
        f.dir = Dir.Down;
      }
    }
    f.anim = moving ? Anim.Walk : Anim.Idle;
  }
}

