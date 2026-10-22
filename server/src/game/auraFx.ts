/**
 * Обозначения бафов и дебафов на юнитах (задача 129, шаг 2): какие эффекты видны на каждом юните всем игрокам.
 * Сервер кладёт в Unit.fx (rooms/schema.ts) строку по символу на эффект (формат — shared/auraFx.ts: индекс ключа из data/aura-fx.json и стаки);
 * Colyseus рассылает поле всей комнате вместе с x, y и hp (фильтра по расстоянию в проекте нет), но только при смене набора. Клиент
 * (client/src/game/auraFx.ts) сам решает, что и как рисовать по правилам таблицы (слоты, приоритеты, толпа). Правила передачи — data/aura-fx-rules.json.
 *
 * Откуда набор:
 *  - герой: его эффекты из auraList (auras.ts; World.flush отдаёт готовый список — тот же, что идёт в рамку героя) с тем же ключом;
 *    еда food_<блюдо> → food, «щит» мага → block@mage, зелье potion — пока идёт откат глотка; вспышки buff (flashes) — пока длится событие;
 *    знамя: сервер запоминает круг каждого стоящего знамени (aoe с меткой умения) и смотрит, какое накрывает героя (то же, что выбирает хук tanks.ts:
 *    сильнейшее среди своих и союзных): у храмовника в круге собственного знамени — кольцо tp_banner, у остальных — эмблема фракции того знамени;
 *  - моб: оглушение, корни, замедление, ослабление, проклятие, кровотечение (поля Mob; хуки классов на мобов не действуют);
 *  - зоны умений: на каждого юнита в круге зоны — свой эффект (zone_*). Зоны сервер узнаёт по fx с меткой умения (World.emit ставит s и c):
 *    hazard, tele и aoe нужных умений (и нужного вида k) превращаются в круг со сроком; разовые круги (лечение, гимн, покров) запоминают, кого задели;
 *    «поле» привязано к эффекту кастера (искажение времени идёт за магом, пока у него действует timewarp).
 *  - «прячет»: огненная стена прячет горение, поле искажения времени — замедление (в одном месте два огня или лёд — каша).
 * Мёртвый герой и умерший моб — без обозначений. Скрытность (unseen) учитывает клиент.
 *
 * Стоимость: круги не привязаны к мобам, поэтому раз в REBUILD_MS (и сразу при новом круге) мир обходится один раз сразу для всех кругов:
 * каждый моб читается один раз и сверяется со списком кругов (квадраты расстояний), а не обходится заново на каждый круг.
 */
import table from "../../../data/aura-fx.json";
import rules from "../../../data/aura-fx-rules.json";
import { PLAYER_RADIUS } from "../../../shared/constants";
import { FX_MAX_KEYS, FX_MAX_STACKS, fxChar } from "../../../shared/auraFx";
import { lineClear } from "../../../shared/map";
import { SKILLS } from "../../../shared/skills";
import type { Aura, Fx } from "../../../shared/protocol";
import type { Player } from "./Player";
import type { Actor, World } from "./World";

/** Ключи обозначений по порядку data/aura-fx.json (баффы, общие, дебаффы, зоны): место ключа — его индекс в Unit.fx. */
export const FX_KEYS: readonly string[] = [...Object.keys(table.buffs), ...Object.keys(table.common), ...Object.keys(table.debuffs), ...Object.keys(table.zones)];
export const FX_INDEX: Readonly<Record<string, number>> = Object.fromEntries(FX_KEYS.map((k, i) => [k, i]));
if (FX_KEYS.length > FX_MAX_KEYS) throw new Error(`aura-fx: ключей ${FX_KEYS.length}, в Unit.fx помещается ${FX_MAX_KEYS}`);
const N = FX_KEYS.length;
const need = (k: string): number => {
  const i = FX_INDEX[k];
  if (i === undefined) throw new Error(`aura-fx-rules: ключа ${k} нет в data/aura-fx.json`);
  return i;
};

// ---------- правила ----------
type ZoneRule = { fx: string; skill: string; ev: "hazard" | "tele" | "aoe"; k?: string; who: "foes" | "allies"; ms: number | "ev" | "shield"; snap?: boolean; sameFaction?: boolean; los?: boolean };
type FieldRule = { fx: string; aura: string; skill: string; who: "foes" | "allies" };
const ZONES = rules.zones as ZoneRule[];
const FIELDS = rules.fields as FieldRule[];
const BY_CLASS = rules.byClass as Record<string, Record<string, string>>;
const BANNER = rules.banner;
const IDX_BANNER_OWNER = need(BANNER.owner), IDX_BANNER_SOL = need(BANNER.others.replace("{faction}", "solgard")), IDX_BANNER_UMB = need(BANNER.others.replace("{faction}", "umbrath"));
const IDX_FOOD = need("food"), IDX_POTION = need("potion");
const FLASH = new Map<string, number>(Object.entries(rules.flashes).map(([ev, fx]) => [ev, need(fx)]));
const ZONE_BY_SKILL = new Map<string, ZoneRule[]>();
for (const z of ZONES) { need(z.fx); (ZONE_BY_SKILL.get(z.skill) ?? ZONE_BY_SKILL.set(z.skill, []).get(z.skill)!).push(z); }
for (const f of FIELDS) need(f.fx);
const HIDE: [number, number[]][] = Object.entries(rules.hide).map(([by, list]) => [need(by), list.map(need)]);

/** Индекс обозначения для эффекта героя (-1 — нет): тот же ключ; исключения — еда, знамя и ключи по классу из data/aura-fx-rules.json. */
function heroIdx(k: string, p: Player, now: number, w: World, st: State): number {
  if (k.charCodeAt(0) === 102 /* f */ && k.startsWith("food_")) return IDX_FOOD;
  if (k === "tp_banner") return bannerIdx(w, p, now, st);
  const bc = BY_CLASS[k]?.[p.cls];
  return FX_INDEX[bc ?? k] ?? -1;
}

/** Знамя, которое накрывает героя (выбор — как в хуке tanks.ts: сильнейшее среди своих и союзных, при равенстве — раньше поставленное):
 *  у поставившего его храмовника — кольцо, у остальных — эмблема фракции храмовника. Знамени в записях нет — эмблема фракции самого героя. */
function bannerIdx(w: World, p: Player, now: number, st: State): number {
  let best: Banner | null = null;
  for (const b of st.banners.values()) {
    if (b.until <= now || b.owner.dead || Math.hypot(p.x - b.x, p.y - b.y) > b.r) continue;
    if (b.owner !== p && w.hostile(b.owner, p)) continue;
    if (!best || b.reduce > best.reduce) best = b;
  }
  if (best?.owner === p) return IDX_BANNER_OWNER;
  return (best ? best.owner.faction : p.faction) === "umbrath" ? IDX_BANNER_UMB : IDX_BANNER_SOL;
}

// ---------- сборка набора без аллокаций: метки по индексам ----------
const mark = new Int8Array(N).fill(-1);
let touched = 0;
const put = (i: number, n = 0) => {
  if (i < 0) return;
  const c = n > FX_MAX_STACKS ? FX_MAX_STACKS : n > 0 ? n | 0 : 0;
  if (mark[i] < 0) { mark[i] = c; touched++; } else if (c > mark[i]) mark[i] = c;
};
/** Строка набора по меткам (с правилами «прячет»); метки сбрасываются. */
function done(): string {
  if (!touched) return "";
  for (const [by, list] of HIDE) if (mark[by] >= 0) for (const k of list) if (mark[k] >= 0) { mark[k] = -1; touched--; }
  let s = "";
  for (let i = 0; i < N && touched > 0; i++) if (mark[i] >= 0) { s += fxChar(i, mark[i]); mark[i] = -1; touched--; }
  return s;
}

// ---------- зоны мира ----------
interface Zone { rule: ZoneRule; fx: number; caster: Player; x: number; y: number; r: number; until: number; members: Actor[] | null }
interface Field { rule: FieldRule; fx: number; caster: Player; until: number }
/** Стоящее знамя храмовника: круг, срок и сила (снижение урона — по ней хук tanks.ts выбирает сильнейшее). */
interface Banner { owner: Player; x: number; y: number; r: number; until: number; reduce: number }
/** banners — id храмовника → его знамя (одно на храмовника); flash — id юнита → (индекс обозначения → до какого мига, мс World.time). */
interface State { zones: Zone[]; fields: Map<string, Field>; members: Map<Actor, number[]>; banners: Map<string, Banner>; flash: Map<string, Map<number, number>>; nextAt: number; sweepAt: number; dirty: boolean }
const states = new WeakMap<World, State>();
const stateOf = (w: World): State => {
  let s = states.get(w);
  if (!s) states.set(w, (s = { zones: [], fields: new Map(), members: new Map(), banners: new Map(), flash: new Map(), nextAt: 0, sweepAt: 0, dirty: false }));
  return s;
};
/** Кругов в мире одновременно (огненная стена — пять кругов). Больше — уходят те, у кого срок ближе к концу. */
export const MAX_ZONES = 160;
/** Как часто пересчитывается, кто в каком круге, мс. */
const REBUILD_MS = 150;
/** Как часто из записей знамён и вспышек убираются истёкшие, ушедшие из мира и погибшие, мс. */
const SWEEP_MS = 1000;
/** Круг hazard или tele короче этого — вспышка или телеграф пассивки (например, метеор легендарки, 600 мс), а не зона умения. */
const MIN_ZONE_MS = 1000;

/** Союзник кастера в круге: он сам или не враг (и своей фракции, и в прямой видимости от кастера, если правило этого требует). */
function allyOf(w: World, caster: Player, q: Player, sameFaction?: boolean, los?: boolean): boolean {
  return q === caster || (!w.hostile(caster, q) && (!sameFaction || q.faction === caster.faction) && (!los || lineClear(w.map, caster.x, caster.y, q.x, q.y)));
}
/** Кого задевает круг в этот миг (для разовых кругов): враги кастера (мобы и враждебные герои) или союзники-герои. */
function inCircle(w: World, caster: Player, who: "foes" | "allies", x: number, y: number, r: number, sameFaction?: boolean, los?: boolean): Actor[] {
  if (who === "foes") return w.enemiesInCircle(caster, x, y, r);
  const out: Actor[] = [];
  for (const q of w.playersInCircle(x, y, r)) if (allyOf(w, caster, q, sameFaction, los)) out.push(q);
  return out;
}

/** Начало такта (World.flush): fx этого такта превращаются в круги, знамёна и вспышки; раз в REBUILD_MS пересчитывается, кто в каком круге. */
export function tick(w: World, events: readonly Fx[]): void {
  const st = stateOf(w), now = w.time;
  for (const e of events) {
    // вспышка buff (например, короткая неуязвимость): обозначение стоит, пока длится событие
    if (e.t === "buff") {
      const i = e.ms > 0 ? FLASH.get(e.k) : undefined;
      if (i !== undefined) flash(st, e.id, i, now + e.ms);
      continue;
    }
    if (!e.s || (e.t !== "hazard" && e.t !== "tele" && e.t !== "aoe")) continue;
    // знамя: круг, срок и сила (длительность и снижение урона — из умения, как у самого знамени: tanks.ts, v.dur и v.reduce). Вид k нужен:
    // пассивка, сработавшая в «ударе древка», шлёт свои aoe с той же меткой
    if (e.s === BANNER.skill && e.t === BANNER.ev && e.k === BANNER.k && e.c) {
      const owner = w.players.get(e.c), sk = SKILLS[BANNER.skill];
      if (owner && !owner.dead && sk) {
        const v = sk.v(Math.max(1, owner.save.skills[BANNER.skill] || 0)) as { dur?: number; reduce?: number };
        st.banners.delete(owner.id);   // одно знамя на храмовника; новое — в конец очереди, как в tanks.ts
        st.banners.set(owner.id, { owner, x: e.x, y: e.y, r: e.r, until: now + (v.dur ?? 0) * 1000, reduce: v.reduce ?? 0 });
      }
    }
    const rs = ZONE_BY_SKILL.get(e.s);
    if (!rs) continue;
    const caster = e.c ? w.players.get(e.c) : undefined;
    if (!caster || caster.dead) continue;
    for (const rule of rs) {
      if (rule.ev !== e.t || (rule.k !== undefined && rule.k !== e.k) || (e.t === "tele" && e.shape !== "circle")) continue;
      const ms = rule.ms === "ev" ? (e.t === "aoe" ? 0 : e.ms) : rule.ms === "shield" ? 0 : rule.ms;
      if (rule.ms === "ev" ? !(ms >= MIN_ZONE_MS) : rule.ms !== "shield" && !(ms > 0)) continue;
      const z: Zone = { rule, fx: FX_INDEX[rule.fx], caster, x: e.x, y: e.y, r: e.r, until: now + ms, members: null };
      if (rule.snap) {
        let list = inCircle(w, caster, rule.who, e.x, e.y, e.r, rule.sameFaction, rule.los);
        if (rule.ms === "shield") {
          // покров: обозначение у тех, кому он выдал щит, и столько, сколько держится этот щит
          list = list.filter((a) => (a as Player).shieldBy === caster && (a as Player).shieldUntil > now);
          if (!list.length) continue;
          z.until = Math.max(...list.map((a) => (a as Player).shieldUntil));
        }
        z.members = list;
      }
      st.zones.push(z);
      st.dirty = true;
    }
  }
  if (now >= st.sweepAt) { st.sweepAt = now + SWEEP_MS; sweep(w, st, now); }
  if (st.zones.length > MAX_ZONES) evict(st, now);
  if (!st.zones.length && !st.fields.size) {
    if (st.members.size) st.members.clear();
    return;
  }
  if (!st.dirty && now < st.nextAt) return;
  st.dirty = false;
  st.nextAt = now + REBUILD_MS;
  rebuild(w, st, now);
}

function flash(st: State, id: string, fx: number, until: number): void {
  let m = st.flash.get(id);
  if (!m) st.flash.set(id, (m = new Map()));
  if ((m.get(fx) ?? 0) < until) m.set(fx, until);
}

/** Убрать записи знамён и вспышек, которые уже ничего не значат: срок вышел, храмовник погиб или вышел из мира. */
function sweep(w: World, st: State, now: number): void {
  for (const [id, b] of st.banners) if (b.until <= now || b.owner.dead || w.players.get(id) !== b.owner) st.banners.delete(id);
  for (const [id, m] of st.flash) {
    for (const [i, until] of m) if (until <= now) m.delete(i);
    if (!m.size) st.flash.delete(id);
  }
}

/** Круги переполнили лимит: сначала уходят истёкшие, потом те, у кого срок ближе всех к концу (долгие зоны живут). */
function evict(st: State, now: number): void {
  let n = 0;
  for (const z of st.zones) if (z.until > now) st.zones[n++] = z;
  st.zones.length = n;
  if (n > MAX_ZONES) { st.zones.sort((a, b) => a.until - b.until); st.zones.splice(0, n - MAX_ZONES); }
}

// ---------- пересчёт: кто в каком круге ----------
/** Круг для обхода мира: заполняется заново на каждом пересчёте (объекты переиспользуются). */
interface Circ { x: number; y: number; r: number; fx: number; caster: Player | null; foes: boolean; sameFaction: boolean; los: boolean }
const circs: Circ[] = [];
let nc = 0;
function circ(x: number, y: number, r: number, fx: number, caster: Player, foes: boolean, sameFaction: boolean, los: boolean): void {
  const c = circs[nc++];
  if (c) { c.x = x; c.y = y; c.r = r; c.fx = fx; c.caster = caster; c.foes = foes; c.sameFaction = sameFaction; c.los = los; } else circs.push({ x, y, r, fx, caster, foes, sameFaction, los });
}
function add(members: Map<Actor, number[]>, a: Actor, fx: number): void {
  if ((a as { dead?: boolean }).dead) return;
  const l = members.get(a);
  if (!l) members.set(a, [fx]);
  else if (!l.includes(fx)) l.push(fx);
}

function rebuild(w: World, st: State, now: number): void {
  const members = st.members;
  members.clear();
  let n = 0;
  for (const z of st.zones) if (z.until > now && !z.caster.dead && w.players.get(z.caster.id) === z.caster) st.zones[n++] = z;
  st.zones.length = n;
  nc = 0;
  for (const z of st.zones) {
    if (z.members) {
      const shield = z.rule.ms === "shield";
      for (const a of z.members) {
        if (shield && !((a as Player).shieldUntil > now && (a as Player).shieldBy === z.caster)) continue;
        add(members, a, z.fx);
      }
    } else circ(z.x, z.y, z.r, z.fx, z.caster, z.rule.who === "foes", !!z.rule.sameFaction, !!z.rule.los);
  }
  for (const [key, f] of st.fields) {
    if (f.until <= now || f.caster.dead || w.players.get(f.caster.id) !== f.caster) { st.fields.delete(key); continue; }
    const sk = SKILLS[f.rule.skill], radius = sk ? (sk.v(Math.max(1, f.caster.save.skills[f.rule.skill] || 0)) as { radius?: number }).radius : 0;
    if (radius) circ(f.caster.x, f.caster.y, radius, f.fx, f.caster, f.rule.who === "foes", false, false);
  }
  if (nc) scan(w, members);
  for (let j = 0; j < nc; j++) circs[j].caster = null;   // объекты кругов переиспользуются: ссылки на героев не держим
}

/** Один обход мира для всех кругов сразу: мобы (только круги врагов) и герои. Условия — те же, что у World.enemiesInCircle и playersInCircle:
 *  живой, расстояние до центра не больше радиуса круга плюс радиус юнита, для врагов — прямая видимость от центра, для союзников — allyOf. */
function scan(w: World, members: Map<Actor, number[]>): void {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j < nc; j++) {
    const c = circs[j];
    if (!c.foes) continue;
    if (c.x - c.r < x0) x0 = c.x - c.r;
    if (c.x + c.r > x1) x1 = c.x + c.r;
    if (c.y - c.r < y0) y0 = c.y - c.r;
    if (c.y + c.r > y1) y1 = c.y + c.r;
  }
  if (x1 >= x0) {
    for (const m of w.mobs.values()) {
      if (m.dead) continue;
      const mx = m.x, my = m.y, mr = m.def.radius;
      if (mx + mr < x0 || mx - mr > x1 || my + mr < y0 || my - mr > y1) continue;   // вне рамки всех кругов врагов
      for (let j = 0; j < nc; j++) {
        const c = circs[j];
        if (!c.foes) continue;
        const dx = mx - c.x, dy = my - c.y, rr = c.r + mr;
        if (dx * dx + dy * dy <= rr * rr && lineClear(w.map, c.x, c.y, mx, my)) add(members, m, c.fx);
      }
    }
  }
  for (const q of w.players.values()) {
    if (q.dead) continue;
    const qx = q.x, qy = q.y;
    for (let j = 0; j < nc; j++) {
      const c = circs[j], dx = qx - c.x, dy = qy - c.y, rr = c.r + PLAYER_RADIUS;
      if (dx * dx + dy * dy > rr * rr) continue;
      const caster = c.caster as Player;
      if (c.foes ? w.hostile(caster, q) && w.canAffect(caster, q) && lineClear(w.map, c.x, c.y, qx, qy) : allyOf(w, caster, q, c.sameFaction, c.los)) add(members, q, c.fx);
    }
  }
}

/** Для тестов: сколько записей держит мир. */
export function stats(w: World): { zones: number; banners: number; flashes: number; members: number } {
  const st = states.get(w);
  return { zones: st?.zones.length ?? 0, banners: st?.banners.size ?? 0, flashes: st?.flash.size ?? 0, members: st?.members.size ?? 0 };
}

/** Набор обозначений героя (World.flush): list — его эффекты из auraPack. Пишет в p.unit.fx только при смене набора. */
export function playerFx(w: World, p: Player, list: readonly Aura[]): void {
  let s = "";
  const st = stateOf(w);
  if (!p.dead) {
    const now = w.time;
    for (const a of list) {
      put(heroIdx(a.k, p, now, w, st), a.n ?? 0);
      for (const f of FIELDS) if (a.k === f.aura && a.ms > 0) {
        const key = `${p.id}|${f.fx}`, cur = st.fields.get(key), until = now + a.ms;
        if (!cur) { st.fields.set(key, { rule: f, fx: FX_INDEX[f.fx], caster: p, until }); st.dirty = true; } else cur.until = until;
      }
    }
    if (p.potionAt > now) put(IDX_POTION);
    const fl = st.flash.size ? st.flash.get(p.id) : undefined;
    if (fl) {
      for (const [i, until] of fl) { if (until > now) put(i); else fl.delete(i); }
      if (!fl.size) st.flash.delete(p.id);
    }
    const ex = st.members.get(p);
    if (ex) for (const i of ex) put(i);
    s = done();
  } else if (st.banners.size) st.banners.delete(p.id);   // погибший храмовник знамя не держит (tanks.ts убирает его так же)
  if (p.unit.fx !== s) p.unit.fx = s;
}

/** Мобы: поля контроля и дебаффов (у мобов только они) и зоны. Строки для всех сочетаний собраны заранее — на такт без аллокаций. */
const MOB_KEYS = ["stun", "root", "slow", "weak", "curse", "bleed"].map(need);
const MOB_FX: string[] = Array.from({ length: 1 << MOB_KEYS.length }, (_, mask) => {
  for (let b = 0; b < MOB_KEYS.length; b++) if (mask & (1 << b)) put(MOB_KEYS[b]);
  return done();
});
export function mobFx(w: World): void {
  const t = w.time, st = states.get(w), zoned = st && st.members.size ? st.members : null;
  for (const m of w.mobs.values()) {
    let s = "";
    if (!m.dead) {
      const mask = (m.stunUntil > t ? 1 : 0) | (m.rootUntil > t ? 2 : 0) | (m.slowUntil > t ? 4 : 0) | (m.weakUntil > t ? 8 : 0) | (m.curseUntil > t ? 16 : 0) | (m.bleedUntil > t ? 32 : 0);
      const ex = zoned?.get(m);
      if (ex) {
        for (let b = 0; b < MOB_KEYS.length; b++) if (mask & (1 << b)) put(MOB_KEYS[b]);
        for (const i of ex) put(i);
        s = done();
      } else s = MOB_FX[mask];
    }
    if (m.unit.fx !== s) m.unit.fx = s;
  }
}
