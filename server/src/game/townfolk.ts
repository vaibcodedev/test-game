/**
 * Жители Эмберхолла, городов и поселений (задача 132, шаг 3) на сервере: стражники (посты у ворот и патрули по улицам) и горожане.
 * Синхронизируются юнитами в state.mobs (kind Guard/Citizen), позиция пишется в схему не чаще SYNC_MS —
 * клиент плавно доводит. Стражники неуязвимы, добивают мобов у стен и стреляют в нарушителей мира (бой фракций в нейтральном городе).
 *
 * Ум жителей (docs/plan/next.md раздел 3): распорядок дня (data/schedules.json: рынок, работа, таверна, дом) →
 * дерево поведения горожанина (mistreevous, data/ai.json; агент — CitizenAgent ниже) → ходьба с разведением толпы (shared/crowd.ts).
 * Город без героев рядом спит: жители не думают и не ходят; при смене фазы суток спящие сразу встают на новое место.
 * Стража на драку героев сначала кричит и подходит (с двумя соседями), стреляет — только если драка продолжается.
 */
import data from "../../../data/townfolk.json";
import SCH from "../../../data/schedules.json";
import BARKS from "../../../data/barks.json";
import { CITIES, CITY_CITIZEN_COUNT, CITY_GATE_GUARDS, CITY_PATROLS, layoutOf, type CityLayout } from "../../../shared/cities";
import { SETTLEMENTS } from "../../../shared/settlements";
import { MOVE_MUL, TILE } from "../../../shared/constants";
import { moveWithCollision, walkable } from "../../../shared/map";
import { Nav } from "../../../shared/path";
import { Anim, Dir, UnitKind } from "../../../shared/protocol";
import { CITIZEN_COUNT, CITIZEN_SPOTS, GATE_GUARDS, GUARD_RANGE_TILES, PATROLS, TOWN, TOWN_HALF, WALL } from "../../../shared/town";
import { crowdStep, type SpatialHash } from "../../../shared/crowd";
import { dayPhase } from "../../../shared/daynight";
import { OUTLAW } from "../../../shared/factions";
import { Unit } from "../rooms/schema";
import { EMBER_SETS, npcGearStrings } from "../../../shared/npcGear";
import { citizenTree, State, type CitizenAgent, type Done } from "./ai/brain";
import type { BehaviourTree } from "mistreevous";
import type { Mob } from "./Mob";
import type { Player } from "./Player";
import type { World } from "./World";
import { T } from "../../../shared/texts";

const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);

const SYNC_MS = 200;
/** Шаг дерева поведения горожанина, мс. */
const THINK_MS = 200;
const R = 8;
const G = data.guard, C = data.citizen;
const PHASES = SCH.phases as unknown as [string, number][];
type Roles = Record<string, Record<string, Record<string, number>>>;
const ROLES = SCH.roles as Roles;
const WAIT = SCH.wait as unknown as Record<string, [number, number]>;
const CHAT = SCH.chat;
const CHAT_LINES = BARKS.chat as unknown as Record<string, [string, string][]>;
const GREET = BARKS.greet as Record<string, string[]>;
/** Окрик стражи на драку: до стрелы, мс; через сколько окрик «забывается»; сколько соседей подтягивается. */
const WARN = { graceMs: 1500, forgetMs: 30000, helpers: 2, rushMs: 9000 };

/** Место занятия: точка (px) и куда смотреть. */
interface Spot { x: number; y: number; lx: number; ly: number; key: string }
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
  /** Разметка города (прилавки, повар, кузнец, дома) для мест распорядка; у Эмберхолла и поселений нет. */
  layout?: CityLayout;
  ember?: boolean;
  /** Места распорядка (data/schedules.json): stall, market, work, tavern, square, home. */
  places: Record<string, Spot[]>;
  /** Рядом есть герой: жители думают и ходят. */
  awake: boolean;
}
const SITES: Site[] = [
  // Эмберхолл: посты и маршруты shared/town.ts и ещё столько же из data/townfolk.json (guard.posts, guard.patrols)
  { x: TOWN.x, y: TOWN.y, half: TOWN_HALF, sideX: WALL.x - 2, gateGuards: [...GATE_GUARDS, ...(G.posts as [number, number][])], patrols: [...PATROLS, ...(G.patrols as [number, number][][])],
    spots: CITIZEN_SPOTS, count: CITIZEN_COUNT, guard: G, people: C.people, ember: true, places: {}, awake: false },
  // стража столиц, фортов и поселений фракций — бойцы фракций (soldiers.ts, задача 132, шаг 5): убиваемы, бьют врагов по секторам; здесь только горожане
  ...CITIES.filter((c) => c.style).map((c): Site => ({
    x: c.x, y: c.y, half: c.half, sideX: null, gateGuards: c.capital ? [] : CITY_GATE_GUARDS, patrols: c.capital ? [] : CITY_PATROLS, spots: layoutOf(c).spots, count: CITY_CITIZEN_COUNT,
    guard: { ...G, ...c.guard! }, people: c.people!, layout: layoutOf(c), places: {}, awake: false,
  })),
  // поселения безопасных земель: двое жителей (стража — бойцы фракции)
  ...SETTLEMENTS.map((s): Site => ({
    x: s.x, y: s.y, half: { x: s.ring.w, y: Math.max(s.ring.n, s.ring.s) }, sideX: s.gate === "e" || s.gate === "w" ? s.ring.w - 1 : null,
    gateGuards: [], patrols: [], spots: s.spots, count: s.people.length, guard: { ...G, ...s.guard }, people: s.people, places: {}, awake: false,
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
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
function pickWeighted(w: Record<string, number>): string {
  let sum = 0;
  for (const v of Object.values(w)) sum += v;
  let r = Math.random() * sum;
  for (const [k, v] of Object.entries(w)) if ((r -= v) < 0) return k;
  return Object.keys(w)[0];
}

interface Chat { a: Folk; b: Folk; until: number; lineAt: number; idx: number; lines: [string, string] }

export interface Folk {
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
  /** Стражник бежит к драке героев (окрик, шаг 6 плана): к кому и до какого времени. */
  rush: { p: Player; until: number } | null;
  // ---- горожанин: распорядок и дерево поведения ----
  role: string;
  /** Фаза суток, под которую выбрано место; место (stall, market…), точка и свой дом. */
  phase: string;
  place: string;
  goal: Spot | null;
  home: Spot | null;
  walking: boolean;
  tree: BehaviourTree | null;
  thinkAt: number;
  /** Ход к цели: лучшее расстояние, когда было, сколько раз застревал. */
  progD: number;
  progAt: number;
  stuck: number;
  lookUntil: number;
  chat: Chat | null;
  chatCd: number;
  partner: Folk | null;
  hero: Player | null;
  heroSince: number;
  greeted: Map<string, number>;
  /** Привычные места горожанина: место распорядка → точка. */
  fav: Map<string, Spot>;
  /** Патруль: на сколько px не доходить до точки маршрута (на ней стоит часовой — не налезать на него). */
  routeStop: number[];
}

export class Townfolk {
  readonly folk: Folk[] = [];
  private scanAt = 0;
  private wakeAt = 0;
  private n = 0;
  private ashN = 0;
  /** Таймеры города: перекличка на стенах и тревога (общая, чтобы не трубить на каждого моба). */
  private callAt = new Map<Site, number>();
  private alarmAt = new Map<Site, number>();
  /** Окрик стражи на драку: герой → когда окликнули. */
  private warned = new Map<string, number>();
  /** Сдвиг игровых часов (мс) — тесты прокручивают сутки; фаза суток — по Date.now(), как ночь у клиентов (shared/daynight.ts). */
  clockShift = 0;
  /** Текущая фаза суток (обновляется в update). */
  phase: string;
  /** Тактов думания горожан (для замеров): шаги деревьев и шаги ходьбы. */
  stats = { think: 0, walk: 0 };

  constructor(private w: World) {
    this.phase = this.curPhase();
    for (const site of SITES) {
      site.places = this.buildPlaces(site);
      // клетка-смещение от центра города → центр клетки в пикселях; точка маршрута (с .5) → пиксели
      const cellPx = (dx: number, dy: number) => ({ x: (site.x + dx) * TILE + 16, y: (site.y + dy) * TILE + 16 });
      const ptPx = (dx: number, dy: number) => ({ x: (site.x + dx) * TILE, y: (site.y + dy) * TILE });
      site.gateGuards.forEach(([dx, dy]) => {
        const p = cellPx(dx, dy);
        // смотрят наружу: у боковых стен — от центра, у северных и южных ворот — к зрителю
        const dir = site.sideX !== null && Math.abs(dx) >= site.sideX ? (dx < 0 ? Dir.Left : Dir.Right) : Dir.Down;
        const f = this.add(site, true, p.x, p.y, { ...p, dir }, []);
        // в городах знаменосцев нет (решение пользователя 2026-10-24): знамёна — на башнях стен
        if (site === SITES[0]) this.ashborn(f, false);
      });
      for (const r of site.patrols) {
        const route = r.map(([dx, dy]) => ptPx(dx, dy));
        // начало маршрута часто совпадает с постом часового: встаём на 28 px дальше по маршруту, а не в него
        const [a, b] = [route[0], route[1] ?? route[0]], k = Math.min(1, 28 / (Math.hypot(b.x - a.x, b.y - a.y) || 1));
        const f = this.add(site, true, a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, null, route);
        f.idx = 1 % route.length;
        if (site === SITES[0]) this.ashborn(f, false);
      }
      const homes = site.places.home;
      for (let i = 0; i < site.count; i++) {
        const s = homes[(i * 5) % homes.length];
        const f = this.add(site, false, s.x, s.y, null, [], site.people[i % site.people.length]);
        f.role = site.ember ? SCH.ember.roles[i % SCH.ember.roles.length] : SCH.cycle[i % SCH.cycle.length];
        f.home = s;
        f.tree = citizenTree(this.agent(f));
        f.thinkAt = (i * 37) % THINK_MS;
        // сразу на месте по распорядку текущей фазы (город спит — никто не видит)
        this.pickSpot(f);
        this.teleport(f);
      }
    }
  }

  /** Сразу расставить горожан по местам текущей фазы (админ-отладка, снимки): как в спящем городе. */
  resettle() {
    this.phase = this.curPhase();
    for (const f of this.folk) if (!f.guard) { this.pickSpot(f); this.teleport(f); f.syncAt = 0; }
  }

  /** Часы распорядка (мс). */
  private clock() {
    return Date.now() + this.clockShift;
  }
  private curPhase() {
    return dayPhase(this.clock(), PHASES);
  }

  // ---------- места распорядка ----------
  /** Места города: Эмберхолл — точки data/schedules.json ember.places; города — по разметке; поселения — их точки, лицом к центру. */
  private buildPlaces(site: Site): Record<string, Spot[]> {
    const map = this.w.map;
    const mk = (dx: number, dy: number, lx: number, ly: number): Spot | null => {
      for (let rr = 0; rr <= 2; rr++) for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== rr) continue;
        const x = (site.x + dx + i) * TILE + 16, y = (site.y + dy + j) * TILE + 16;
        if (walkable(map, x, y, R)) return { x, y, lx: (site.x + lx) * TILE + 16, ly: (site.y + ly) * TILE + 16, key: `${dx + i},${dy + j}` };
      }
      return null;
    };
    const list = (a: (Spot | null)[]) => {
      const seen = new Set<string>();
      return a.filter((s): s is Spot => !!s && !seen.has(s.key) && !!seen.add(s.key));
    };
    const out: Record<string, Spot[]> = {};
    if (site.ember) {
      for (const [k, pts] of Object.entries(SCH.ember.places)) out[k] = list((pts as number[][]).map(([x, y, lx, ly]) => mk(x, y, lx, ly)));
    } else if (site.layout) {
      const L = site.layout;
      out.stall = list(L.stalls.map(([x, y]) => mk(x, y - 1, x, y)));
      out.market = list([...L.stalls.flatMap(([x, y]) => [mk(x, y + 1, x, y), mk(x + 1, y + 1, x + 1, y)]), mk(L.merchant[0], L.merchant[1] + 1, L.merchant[0], L.merchant[1])]);
      out.work = list([L.smith, L.banker, L.bagman].map(([x, y]) => mk(x, y + 1, x, y)));
      const [cx, cy] = L.cook, ty = cy + 2;
      out.tavern = list([mk(cx - 1, ty, cx, ty), mk(cx + 1, ty, cx, ty), mk(cx, ty + 1, cx, ty), mk(cx, cy + 1, cx, cy), mk(cx - 1, ty + 1, cx, ty)]);
      out.home = list(L.houses.map(([x, y]) => mk(x + 1, y + 1, x + 1, y)));
      out.square = list(site.spots.map(([x, y]) => mk(x, y, 0, 0)));
    } else {
      const all = list(site.spots.map(([x, y]) => mk(x, y, 0, 0)));
      for (const k of ["stall", "market", "work", "tavern", "square", "home"]) out[k] = all;
    }
    const fallback = list(site.spots.map(([x, y]) => mk(x, y, 0, 0)));
    for (const k of ["stall", "market", "work", "tavern", "square", "home"]) if (!out[k]?.length) out[k] = fallback;
    return out;
  }

  /** Выбрать место по распорядку (роль × фаза): свободную точку; домой — к своей двери. */
  private pickSpot(f: Folk) {
    f.phase = this.phase;
    const w = ROLES[f.role]?.[f.phase] ?? { square: 1 };
    const taken = new Set<string>();
    for (const o of this.folk) if (o !== f && o.site === f.site && o.goal) taken.add(o.goal.key);
    let spot: Spot | null = null, place = "square";
    for (let tries = 0; tries < 4 && !spot; tries++) {
      place = pickWeighted(w);
      if (place === "home" && f.home) { spot = f.home; break; }
      // своё привычное место (прилавок, верстак), если свободно; иначе одно из трёх ближайших свободных
      const fav = f.fav.get(place);
      if (fav && !taken.has(fav.key) && fav !== f.goal) { spot = fav; break; }
      const free = f.site.places[place].filter((s) => !taken.has(s.key) && s !== f.goal)
        .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y));
      if (free.length) spot = pick(free.slice(0, 3));
      if (spot && (place === "stall" || place === "work") && !fav) f.fav.set(place, spot);
    }
    if (!spot) spot = pick(f.site.places[place]);
    this.endChat(f);
    f.place = place;
    f.goal = spot;
    f.nav.reset();
    f.stuck = 0;
    f.progD = Math.hypot(spot.x - f.x, spot.y - f.y);
    f.progAt = this.w.time;
    f.walking = f.progD > 4;
    if (!f.walking) this.arrive(f);
  }
  /** Встать на место сразу (спящий город): позиция, взгляд и юнит. */
  private teleport(f: Folk) {
    if (!f.goal) return;
    f.x = f.goal.x;
    f.y = f.goal.y;
    f.nav.reset();
    this.arrive(f);
    const u = f.unit;
    u.x = f.x; u.y = f.y; u.dir = f.dir; u.anim = f.anim = Anim.Idle;
  }
  private arrive(f: Folk) {
    f.walking = false;
    f.stuck = 0;
    const [a, b] = WAIT[f.place] ?? C.waitMs;
    f.waitUntil = this.w.time + rnd(a, b);
    if (f.goal) f.dir = dirTo(f.goal.lx - f.x, f.goal.ly - f.y);
    f.lookUntil = 0;
  }

  // ---------- разговоры ----------
  private endChat(f: Folk) {
    const c = f.chat;
    if (!c) return;
    for (const o of [c.a, c.b]) {
      o.chat = null;
      if (o !== f && o.goal) o.walking = Math.hypot(o.goal.x - o.x, o.goal.y - o.y) > 6;
    }
    if (f.goal) f.walking = Math.hypot(f.goal.x - f.x, f.goal.y - f.y) > 6;
  }
  private startChat(a: Folk, b: Folk) {
    const t = this.w.time;
    const pool = [...(CHAT_LINES[a.place] ?? []), ...CHAT_LINES.any];
    const c: Chat = { a, b, until: t + rnd(CHAT.ms[0], CHAT.ms[1]), lineAt: t + 300, idx: 0, lines: pick(pool) };
    for (const o of [a, b]) {
      o.chat = c;
      o.walking = false;
      o.anim = Anim.Idle;
      o.chatCd = t + CHAT.cooldownMs;
      o.waitUntil = Math.max(o.waitUntil, c.until + 500);
    }
    a.dir = dirTo(b.x - a.x, b.y - a.y);
    b.dir = dirTo(a.x - b.x, a.y - b.y);
  }
  /** Горожанин рядом, готовый поговорить (не идёт к делу, не в разговоре, без перерыва). */
  private chatPartner(f: Folk, px: number, walking: boolean): Folk | null {
    const t = this.w.time;
    let best: Folk | null = null, bd = px;
    for (const o of this.folk) {
      if (o === f || o.guard || o.site !== f.site || o.chat || t < o.chatCd || o.walking !== walking) continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Ближайший видимый живой герой в радиусе px. */
  private heroNear(x: number, y: number, px: number): Player | null {
    const t = this.w.time;
    let best: Player | null = null, bd = px;
    for (const p of this.w.players.values()) {
      if (p.dead || p.unit.anim === Anim.Dead || p.stealthUntil > t) continue;
      const d = Math.hypot(p.unit.x - x, p.unit.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  private say(f: Folk, text: string) {
    if (this.playerNear(f.x, f.y, 700)) this.w.emit({ t: "say", id: f.id, text });
  }

  /** Агент дерева горожанина (data/ai.json trees.citizen): узлы — замыкания над жителем. */
  private agent(f: Folk): CitizenAgent {
    const ok: Done = State.SUCCEEDED, no: Done = State.FAILED;
    const now = () => this.w.time;
    return {
      IsChatting: () => {
        const c = f.chat;
        if (!c) return false;
        if (now() >= c.until) { this.endChat(f); return false; }
        return true;
      },
      Chat: () => {
        const c = f.chat!, t = now(), o = c.a === f ? c.b : c.a;
        f.dir = dirTo(o.x - f.x, o.y - f.y);
        if (c.a === f && c.idx < 2 && t >= c.lineAt) {
          this.say(c.idx === 0 ? c.a : c.b, c.lines[c.idx]);
          c.idx++;
          c.lineAt = t + CHAT.lineMs;
        }
        return ok;
      },
      ScheduleChanged: () => f.phase !== this.phase,
      PickSpot: () => (this.pickSpot(f), ok),
      ChangeSpot: () => {
        // безделье: продавец и работник остаются у своего дела, остальные — чаще на месте (новое ожидание), иначе другое место по распорядку
        const stay = f.place === "stall" || f.place === "work" ? 0.85 : 0.5;
        if (f.goal && Math.random() < stay) this.arrive(f);
        else this.pickSpot(f);
        return ok;
      },
      HeroClose: () => {
        const p = f.walking ? null : this.heroNear(f.x, f.y, SCH.heroTiles * TILE);
        if (p !== f.hero) f.heroSince = now();
        f.hero = p;
        return !!p;
      },
      FaceHero: () => {
        const p = f.hero!;
        f.dir = dirTo(p.unit.x - f.x, p.unit.y - f.y);
        f.lookUntil = now() + 1200;
        return ok;
      },
      Greet: () => {
        const p = f.hero!, t = now();
        // через полсекунды после поворота; тот же герой — не чаще greetMs, сам житель — не чаще раза в 8 с
        if (t - f.heroSince >= 500 && t >= f.sayAt && t - (f.greeted.get(p.id) ?? -1e12) >= SCH.greetMs) {
          f.greeted.set(p.id, t);
          f.sayAt = t + 8000;
          this.say(f, pick(GREET[this.phase] ?? GREET.day));
        }
        return ok;
      },
      IsWalking: () => f.walking,
      MeetsPasserby: () => {
        const t = now();
        if (t < f.chatCd) return false;
        const o = this.chatPartner(f, 44, true);
        if (!o) return false;
        f.chatCd = t + 4000; // одна попытка на встречу
        if (Math.random() >= CHAT.passChance) return false;
        f.partner = o;
        return true;
      },
      StartChat: () => {
        const o = f.partner;
        f.partner = null;
        if (!o || o.chat) return no;
        this.startChat(f, o);
        return ok;
      },
      Walk: () => ok,
      IsBusy: () => now() < f.waitUntil,
      FaceWork: () => {
        if (now() >= f.lookUntil && f.goal) f.dir = dirTo(f.goal.lx - f.x, f.goal.ly - f.y);
        return ok;
      },
      HasChatPartner: () => {
        const t = now();
        if (t < f.chatCd) return false;
        const o = this.chatPartner(f, CHAT.tiles * TILE, false);
        if (!o) { f.chatCd = t + 3000; return false; }
        f.partner = o;
        return true;
      },
      LookAround: () => {
        const t = now(), dirs = [Dir.Down, Dir.Up, Dir.Left, Dir.Right].filter((d) => d !== f.dir);
        f.dir = pick(dirs);
        f.lookUntil = t + rnd(1500, 3000);
        f.waitUntil = t + rnd(2500, 4500);
        return ok;
      },
    };
  }

  private add(site: Site, guard: boolean, x: number, y: number, post: Folk["post"], route: Folk["route"], who?: { name: string; sprite: string }): Folk {
    const u = new Unit();
    u.kind = guard ? UnitKind.Guard : UnitKind.Citizen;
    u.name = guard ? (post ? T("srv.townfolk.821") : site.guard.name) : who!.name;
    u.sprite = guard ? site.guard.sprite : who!.sprite;
    u.level = guard ? G.level : 1;
    u.hp = u.maxHp = 1;
    u.x = x;
    u.y = y;
    u.dir = post?.dir ?? Dir.Down;
    const f: Folk = {
      id: `${guard ? "g" : "c"}${++this.n}`, site, unit: u, guard, x, y, dir: u.dir, anim: Anim.Idle, nav: new Nav(), post, route, idx: 0, waitUntil: 0, foe: null, attackAt: 0, sayAt: 0,
      nearP: false, haltAt: 0, syncAt: 0, rush: null,
      role: "idler", phase: "", place: "square", goal: null, home: null, walking: false, tree: null, thinkAt: 0, progD: 0, progAt: 0, stuck: 0, lookUntil: 0,
      chat: null, chatCd: 0, partner: null, hero: null, heroSince: 0, greeted: new Map(), fav: new Map(), routeStop: [],
    };
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

  /** Житель думает: город проснулся, либо у стражника есть дело (моб у стен, драка). */
  private active(f: Folk) {
    return f.site.awake || (f.guard && (!!f.foe || !!f.rush));
  }

  /** Жители в сетку толпы (World.crowd): только проснувшиеся; часовые на постах «тяжёлые» — их обходят, не толкают. */
  addToCrowd(h: SpatialHash) {
    for (const f of this.folk) if (this.active(f)) h.add(f, f.x, f.y, R, !!f.post);
  }

  update(dt: number) {
    const t = this.w.time;
    if (t >= this.wakeAt) {
      this.wakeAt = t + 500;
      this.phase = this.curPhase();
      // город просыпается, когда герой ближе wakeTiles к его стенам
      for (const s of SITES) {
        let on = false;
        for (const p of this.w.players.values()) if (siteDist(s, p.unit.x / TILE, p.unit.y / TILE) <= SCH.wakeTiles) { on = true; break; }
        s.awake = on;
      }
    }
    if (t >= this.scanAt) {
      this.scanAt = t + 400;
      this.assignFoes();
      this.voices(t);
    }
    for (const f of this.folk) {
      if (!this.active(f)) {
        // спящий город: новая фаза — сразу на новом месте
        if (!f.guard && f.phase !== this.phase) { this.pickSpot(f); this.teleport(f); }
        continue;
      }
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
        this.w.emit({ t: "say", id: best.id, text: T("srv.townfolk.171"), snd: "alarm" });
      } else if (this.w.time >= best.sayAt) {
        best.sayAt = this.w.time + 20000;
        this.w.emit({ t: "say", id: best.id, text: best.site.guard.lines[Math.floor(Math.random() * best.site.guard.lines.length)] });
      }
    }
  }

  /**
   * Стража бьёт нарушителя мира: выстрел ближайшего стражника (задача 38).
   * warn (драка героев в нейтральном городе): сначала окрик «Прекратить!» и подход ближайшего с двумя соседями;
   * стрела — только если герой снова ударил после окрика (outlawUntil продлевается каждым нарушением) и прошло graceMs.
   */
  punish(p: Player, dmg: number, warn = false) {
    let best: Folk | null = null, bd = Infinity;
    for (const f of this.folk) {
      if (!f.guard) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < bd) { bd = d; best = f; }
    }
    if (!best || bd > 1200) return;
    const g = best, t = this.w.time;
    if (warn) {
      const at = this.warned.get(p.id);
      const offenceAt = p.outlawUntil - OUTLAW.ms;
      if (at === undefined || (t - at > WARN.forgetMs && offenceAt <= at)) {
        this.warned.set(p.id, t);
        g.sayAt = t + 8000;
        this.w.emit({ t: "say", id: g.id, text: pick(BARKS.guard.warn), snd: "alarm" });
        // к месту бегут окликнувший и двое соседей того же города
        const near = this.folk.filter((f) => f.guard && f !== g && f.site === g.site && !f.foe)
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, WARN.helpers);
        for (const f of [g, ...near]) { f.rush = { p, until: t + WARN.rushMs }; f.nav.reset(); }
        return;
      }
      if (offenceAt <= at || t - at < WARN.graceMs) return; // после окрика не бил — стражники стоят рядом, не стреляют
    }
    g.dir = Math.abs(p.x - g.x) > Math.abs(p.y - g.y) ? (p.x < g.x ? Dir.Left : Dir.Right) : p.y < g.y ? Dir.Up : Dir.Down;
    g.unit.dir = g.dir;
    g.unit.aseq = (g.unit.aseq + 1) % 65535;
    if (t >= g.sayAt) {
      g.sayAt = t + 8000;
      this.w.emit({ t: "say", id: g.id, text: T("srv.townfolk.172"), snd: "alarm" });
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
      if (!f.guard || !f.post || !f.site.awake) continue;
      const near = this.playerNear(f.x, f.y, 150, true);
      if (near && !f.nearP && t >= f.haltAt) {
        f.haltAt = t + 25000;
        this.w.emit({ t: "say", id: f.id, text: T("srv.townfolk.173"), snd: "halt" });
      }
      f.nearP = near;
    }
    for (const site of SITES) {
      if (!site.awake || t < (this.callAt.get(site) ?? 0)) continue;
      this.callAt.set(site, t + rnd(22000, 42000));
      const posts = this.folk.filter((f) => f.site === site && f.guard && f.post && !f.foe);
      if (!posts.length) continue;
      const f = posts[Math.floor(Math.random() * posts.length)];
      if (!this.playerNear(f.x, f.y, 700)) continue;
      this.w.emit({ t: "say", id: f.id, text: Math.random() < 0.7 ? T("srv.townfolk.822") : T("srv.townfolk.823"), snd: "call" });
    }
  }

  /** Шаг к точке по пути с разведением толпы (shared/crowd.ts). Возвращает, сдвинулся ли житель. */
  private step(f: Folk, gx: number, gy: number, speed: number, dt: number, stopAt: number): boolean {
    const d0 = Math.hypot(gx - f.x, gy - f.y);
    if (d0 <= stopAt) return false;
    const wp = f.nav.next(this.w.map, f.x, f.y, gx, gy, R, this.w.time);
    if (!wp) return false;
    const final = wp.x === gx && wp.y === gy;
    const dx = wp.x - f.x, dy = wp.y - f.y, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(speed * MOVE_MUL * dt, final ? d - stopAt : d); // общий множитель ходьбы (data/balance.json moveMul)
    if (sp <= 0) return false;
    const s = crowdStep(this.w.crowd, f, f.x, f.y, R, (dx / d) * sp, (dy / d) * sp, 0, gx, gy);
    const n = moveWithCollision(this.w.map, f.x, f.y, s.x, s.y, R);
    const moved = Math.abs(n.x - f.x) + Math.abs(n.y - f.y) > 0.05;
    f.x = Math.round(n.x * 10) / 10;
    f.y = Math.round(n.y * 10) / 10;
    f.dir = dirTo(dx, dy);
    return moved;
  }
  /** Стоящий житель расходится с налезшим на него (герой прошёл сквозь толпу, двое встали рядом). */
  private nudge(f: Folk, speed: number, dt: number) {
    const s = crowdStep(this.w.crowd, f, f.x, f.y, R, 0, 0, speed * MOVE_MUL * dt);
    if (!s.x && !s.y) return false;
    const n = moveWithCollision(this.w.map, f.x, f.y, s.x, s.y, R);
    f.x = Math.round(n.x * 10) / 10;
    f.y = Math.round(n.y * 10) / 10;
    return true;
  }

  private updateGuard(f: Folk, dt: number) {
    const t = this.w.time;
    let moving = false;
    const m = f.foe;
    if (f.rush && (t >= f.rush.until || f.rush.p.dead || this.w.players.get(f.rush.p.id) !== f.rush.p)) f.rush = null;
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
    } else if (f.rush) {
      // драка героев: бежит к месту и встаёт рядом лицом к нарушителю
      f.foe = null;
      const p = f.rush.p;
      moving = this.step(f, p.unit.x, p.unit.y, G.chaseSpeed, dt, 56);
      if (!moving) f.dir = dirTo(p.unit.x - f.x, p.unit.y - f.y);
    } else {
      f.foe = null;
      if (f.post) {
        moving = this.step(f, f.post.x, f.post.y, G.patrolSpeed * 1.6, dt, 1);
        if (!moving && Math.hypot(f.post.x - f.x, f.post.y - f.y) < 4) f.dir = f.post.dir;
      } else if (t >= f.waitUntil) {
        const p = f.route[f.idx];
        if (f.routeStop.length !== f.route.length)
          f.routeStop = f.route.map((q) => (this.folk.some((o) => o.post && Math.hypot(o.post.x - q.x, o.post.y - q.y) < 14) ? 26 : 4));
        // точку уже занял другой житель (встречный патруль ждёт там) — останавливаемся рядом, а не в нём
        const busy = this.folk.some((o) => o !== f && o.site === f.site && Math.abs(o.x - p.x) < 12 && Math.abs(o.y - p.y) < 12);
        moving = this.step(f, p.x, p.y, G.patrolSpeed, dt, busy ? 26 : f.routeStop[f.idx]);
        if (!moving) {
          f.idx = (f.idx + 1) % f.route.length;
          f.waitUntil = t + rnd(800, 2500);
        }
      } else this.nudge(f, G.patrolSpeed, dt);
    }
    f.anim = moving ? Anim.Walk : Anim.Idle;
  }

  private updateCitizen(f: Folk, dt: number) {
    const t = this.w.time;
    if (t >= f.thinkAt) {
      f.thinkAt = t + THINK_MS;
      this.stats.think++;
      f.tree!.step();
    }
    let moving = false;
    if (f.walking && f.goal) {
      this.stats.walk++;
      const g = f.goal, d = Math.hypot(g.x - f.x, g.y - f.y);
      if (d <= 4) this.arrive(f);
      else {
        moving = this.step(f, g.x, g.y, C.speed, dt, 2);
        // честное «застрял»: нет хода к цели 1,5 с — путь заново; рядом с целью (её занял герой) — считаем, что дошёл; трижды — другое место
        if (d < f.progD - 8) { f.progD = d; f.progAt = t; }
        else if (t - f.progAt > 1500) {
          if (d < 28) this.arrive(f);
          else if (++f.stuck >= 3) this.pickSpot(f);
          else { f.nav.reset(); f.progAt = t; f.progD = d; }
        }
      }
    } else this.nudge(f, C.speed, dt);
    f.anim = moving ? Anim.Walk : Anim.Idle;
  }
}
