/**
 * ИИ ботов рейда (docs/raid.md §5): раз в 250 мс — уклонение от телеграфов (реакция 250–600 мс, 7% «прозевать»),
 * механики (тень колонны от «Солнца»), воскрешение павших, позиция своей роли, цель и умения.
 * Танк держит босса мордой от рейда, второй танк собирает приспешников, ближний бой — за спиной, дальние и лекари — дугой сзади.
 */
import { PLAYER_RADIUS } from "../../../shared/constants";
import { lineClear, walkable } from "../../../shared/map";
import { inHall, PILLAR_HALF, RAID, RAID_PILLARS, type RaidRole } from "../../../shared/raid";
import { activeSkills, skillMana, SKILLS, type SkillDef } from "../../../shared/skills";
import { findSafe, inDanger, type Danger } from "../game/danger";
import type { Mob } from "../game/Mob";
import type { Player } from "../game/Player";
import { castSkill } from "../game/skills";
import type { Actor, World } from "../game/World";
import type { RaidDirector } from "./director";

/** Состояние бота: следующее решение, точка уклонения, реакция на телеграфы, слот тени. */
export interface RaidAI {
  next: number;
  escape: { x: number; y: number } | null;
  /** Когда бот «увидел» атаку (ключ — атака и момент; Infinity — прозевал). */
  seen: Map<string, number>;
  side: number;
  /** Колонна и слот тени на «Солнце». */
  pillar: number;
  slot: number;
  lastSay: number;
  /** Кого поднимает (идёт к телу). */
  reviving?: Player | null;
  /** Когда заметил, что босс бьёт не главного танка. */
  lostAggroAt?: number;
  oomAt?: number;
  timers?: Map<string, number>;
}

const THINK_MS = 250;
/** Телеграф опасен, если сработает в ближайшие HORIZON мс (дальние кольца — позже: сперва уйти от ближних). */
const HORIZON = 1000;
/** Сколько после прибытия точка должна оставаться безопасной (мс). */
const STAY = 1500;
const R_BOSS = 44;
const EXCLUDE = new Set(["stealth", "dr_shadowmeld", "blink", "roll", "as_smoke", "as_dance", "mg_escape"]);
/** Защитные умения: только когда своё здоровье ниже порога (как в симуляторе баланса). */
const DEFENSIVE: Record<string, number> = { shieldblock: 0.92, dk_bone_armor: 0.92, mg_barrier: 0.75, dk_anti_magic: 0.65, tp_divine: 0.35 };
/** Лечение и поддержка — только в ветке лекаря. */
const HEAL_IDS = new Set(["heal", "circle", "renew", "holyshield", "cl_cleanse", "cl_aegis", "cl_hymn", "cl_blessing", "bw_blood_bond", "bw_sacrifice", "bw_transfusion", "bw_blood_circle", "bw_tide"]);
const SELF_BUFF = new Set(["mg_timewarp", "hr_barrage", "hr_beast", "wl_meta", "rv_frenzy", "dk_rune_blade", "dr_ravens", "rv_massacre"]);
const UTIL_HURT = new Set(["tp_glare", "tp_banner"]);

const ratio = (q: Player) => q.unit.hp / Math.max(1, q.unit.maxHp);
const isTaunt = (s: SkillDef) => s.id === "taunt" || (s.v(1).taunt ?? 0) > 0;

const orders = new WeakMap<Player, SkillDef[]>();
/** Изученные активные умения бота: по убыванию перезарядки (сильные — когда готовы). */
function order(p: Player): SkillDef[] {
  let o = orders.get(p);
  if (!o) {
    const r = (s: SkillDef) => p.save.skills[s.id] || 0;
    o = activeSkills(p.cls).filter((s) => r(s) > 0 && !EXCLUDE.has(s.id)).sort((a, b) => (b.cd?.(r(b)) ?? 0) - (a.cd?.(r(a)) ?? 0) || (a.slot ?? 0) - (b.slot ?? 0));
    orders.set(p, o);
  }
  return o;
}
function ready(w: World, p: Player, s: SkillDef): boolean {
  const rank = p.save.skills[s.id] || 0;
  return rank > 0 && (p.cds.get(s.id) || 0) <= w.time && (s.offGcd || p.gcdUntil <= w.time) && p.unit.mp >= skillMana(s, rank, p.level);
}
/** Каст: true — умение ушло на перезарядку. */
function cast(w: World, p: Player, id: string, x: number, y: number, tid: string | null): boolean {
  const before = p.cds.get(id) || 0;
  castSkill(w, p, id, x, y, tid);
  return (p.cds.get(id) || 0) > before;
}

// ---------------------------------------------------------------- позиции
const norm = (x: number, y: number) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; };
function ok(w: World, x: number, y: number): boolean {
  return inHall(x, y, 0.93) && walkable(w.map, x, y, PLAYER_RADIUS + 2);
}
/** Проходимая точка у (ang, r) от центра: по возможности — та же, иначе соседние углы и радиусы. */
function around(w: World, cx: number, cy: number, ang: number, r: number): { x: number; y: number } {
  for (const dr of [0, -0.15, 0.15, -0.3]) for (const da of [0, 0.22, -0.22, 0.45, -0.45, 0.7, -0.7]) {
    const rr = r * (1 + dr), a = ang + da;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (ok(w, x, y)) return { x, y };
  }
  return { x: cx + Math.cos(ang) * r * 0.5, y: cy + Math.sin(ang) * r * 0.5 };
}
/** Порядковый номер бота среди участников той же роли (стабильные слоты). */
function indexIn(d: RaidDirector, p: Player, role: RaidRole): [number, number] {
  const list = d.players().filter((q) => d.roleOf(q) === role);
  return [Math.max(0, list.indexOf(p)), list.length];
}

/** Где стоять роли (бой): B — босс, F — его взгляд, C — центр не-танков. */
function rolePos(w: World, p: Player, d: RaidDirector): { x: number; y: number } {
  const b = d.boss, F = d.knight.face, role = d.roleOf(p);
  const reach = p.attackRange() + R_BOSS;
  if (role === "tank") {
    const main = d.mainTank();
    if (main === p) {
      const c = d.center(), n = norm(b.x - c.x, b.y - c.y);
      return around(w, b.x, b.y, Math.atan2(n.y, n.x), R_BOSS + 36);
    }
    // второй танк — сбоку от главного, вне конуса «Рассечения»
    const [i] = indexIn(d, p, "tank");
    return around(w, b.x, b.y, F + (i % 2 ? -1 : 1) * 1.35, R_BOSS + 50);
  }
  if (role === "melee") {
    const [i, n] = indexIn(d, p, "melee");
    const k = i - (n - 1) / 2;
    return around(w, b.x, b.y, F + Math.PI + k * 0.35, Math.min(R_BOSS + 26, reach - 8));
  }
  if (role === "healer") {
    const [i, n] = indexIn(d, p, "healer");
    const k = i - (n - 1) / 2;
    const pos = around(w, b.x, b.y, F + Math.PI + k * 0.6 + 0.17, 200);
    const t = d.mainTank();
    // лекарь держит прямую видимость до танка
    if (t && !lineClear(w.map, pos.x, pos.y, t.x, t.y)) return around(w, b.x, b.y, F + Math.PI + k * 0.6 + 0.6, 185);
    return pos;
  }
  const [i, n] = indexIn(d, p, "ranged");
  const k = i - (n - 1) / 2;
  return around(w, b.x, b.y, F + Math.PI + k * 0.34, Math.min(250, reach - 14));
}
/** Позиция до пробуждения (pull): та же раскладка от дома босса, взгляд — на север (рейд с юга). */
function pullPos(w: World, p: Player, d: RaidDirector): { x: number; y: number } {
  const save = d.knight.face;
  d.knight.face = -Math.PI / 2;
  const role = d.roleOf(p);
  let pos: { x: number; y: number };
  if (role === "tank" && d.mainTank() === p) pos = around(w, d.boss.x, d.boss.y, -Math.PI / 2, R_BOSS + 36);
  else pos = rolePos(w, p, d);
  d.knight.face = save;
  return pos;
}
function moveTo(p: Player, pos: { x: number; y: number }, slack = 16) {
  if (Math.hypot(p.x - pos.x, p.y - pos.y) > slack) p.moveTo = { x: pos.x, y: pos.y };
  else p.moveTo = null;
}
function engage(p: Player, t: Actor, approach: boolean) {
  p.targetId = t.id;
  p.unit.target = t.id;
  p.engaged = true;
  p.approach = approach;
}

// ---------------------------------------------------------------- опасности
/** Телеграфы, которые бот уже «увидел» (реакция и шанс прозевать), и лужи. */
function zones(w: World, p: Player, d: RaidDirector, a: RaidAI): Danger[] {
  const t = w.time, [r0, r1] = RAID.bots.react;
  const out: Danger[] = [];
  for (const z of d.dangers) {
    // реакция и «прозевал» — на атаку целиком (все её круги), а не на каждый круг
    const key = `${z.id}:${Math.floor(z.at / 600)}`;
    let at = a.seen.get(key);
    if (at === undefined) {
      // перед «Приговором» и «Солнцем» босс кричит подсказку: их прозёвывают реже
      const miss = RAID.bots.miss * (z.id === "verdict" || z.id === "sun" ? 0.35 : 1);
      at = d.rand() < miss ? Infinity : z.at + r0 + d.rand() * (r1 - r0);
      a.seen.set(key, at);
    }
    if (t >= at && z.until >= t) out.push(z);
  }
  if (a.seen.size > 120) a.seen.clear();
  for (const h of w.hazards) out.push({ shape: "circle", x: h.x, y: h.y, r: h.r, at: -1e9, until: h.until, id: "pool" });
  return out;
}
/** Слот тени за ближайшей колонной (до 5 героев на колонну). */
function shadowSlot(w: World, p: Player, d: RaidDirector, a: RaidAI): { x: number; y: number } | null {
  const b = d.boss;
  const taken = new Set<number>();
  for (const [q, s] of d.ai) if (q !== p && s.pillar >= 0) taken.add(s.pillar * 10 + s.slot);
  const slots = (i: number) => {
    const c = RAID_PILLARS[i], n = norm(c.x - b.x, c.y - b.y), side = { x: -n.y, y: n.x };
    const out: { x: number; y: number; k: number }[] = [];
    let k = 0;
    for (const depth of [PILLAR_HALF + 16, PILLAR_HALF + 38]) for (const lat of [0, -16, 16]) {
      const x = c.x + n.x * depth + side.x * lat, y = c.y + n.y * depth + side.y * lat;
      if (walkable(w.map, x, y, PLAYER_RADIUS) && !lineClear(w.map, b.x, b.y, x, y)) out.push({ x, y, k });
      k++;
    }
    return out.slice(0, 5);
  };
  if (a.pillar >= 0) {
    const s = slots(a.pillar).find((q) => q.k === a.slot);
    if (s) return s;
  }
  const cands: { x: number; y: number; i: number; k: number; dd: number }[] = [];
  RAID_PILLARS.forEach((_, i) => { for (const s of slots(i)) if (!taken.has(i * 10 + s.k)) cands.push({ ...s, i, dd: Math.hypot(s.x - p.x, s.y - p.y) }); });
  cands.sort((x, y) => x.dd - y.dd);
  const c = cands[0];
  if (!c) return null;
  a.pillar = c.i;
  a.slot = c.k;
  return c;
}

// ---------------------------------------------------------------- умения
/** Общий цикл умений по цели (одно умение за решение): уронные, самобафы, защита. */
export function useSkills(w: World, p: Player, target: Actor, d: RaidDirector | null): boolean {
  const t = w.time, dist = w.dist(p, target), R = w.radiusOf(target);
  const boss = !!d && target === d.boss;
  const main = d?.mainTank() === p;
  for (const s of order(p)) {
    if (HEAL_IDS.has(s.id) || !ready(w, p, s)) continue;
    const rank = p.save.skills[s.id] || 0, v = s.v(rank);
    if (s.id in DEFENSIVE) {
      if (ratio(p) < DEFENSIVE[s.id] && dist < 450 && cast(w, p, s.id, target.x, target.y, target.id)) return true;
      continue;
    }
    if (UTIL_HURT.has(s.id)) { if (t - p.hurtAt > 3000) continue; }
    // провокация босса — только главный танк (второй танк провоцирует приспешников)
    if (isTaunt(s) && boss && !main) continue;
    let x = target.x, y = target.y, tid: string | null = target.id;
    switch (s.target) {
      case "enemy": if (dist > (s.range ?? 60) + R) continue; break;
      case "point": if (dist > (s.range || 300) + R) continue; break;
      case "ally": continue;
      case "self": {
        const aoe = (v.radius ?? 0) > 0 && ((v.dmg ?? 0) > 0 || (v.weak ?? 0) > 0 || (v.slow ?? 0) > 0) && !SELF_BUFF.has(s.id);
        const lim = aoe ? v.radius + R - 4 : Math.max(p.attackRange() + R, 90) + 20;
        if (dist > lim) continue;
        if (s.id === "tp_banner") { x = p.x; y = p.y; tid = null; }
        break;
      }
    }
    if (s.id === "tp_banner") { x = p.x; y = p.y; tid = null; }
    if (cast(w, p, s.id, x, y, tid)) return true;
  }
  return false;
}

/** Лекарь (Клирик, Кровотворец): приоритеты docs/raid.md §5 «Лечение». true — действие сделано. */
function healThink(w: World, p: Player, d: RaidDirector, a: RaidAI): boolean {
  const all = d.players().filter((q) => !q.dead && w.dist(p, q) <= 330);
  if (!all.length) return false;
  const low = [...all].sort((x, y) => ratio(x) - ratio(y))[0];
  const tank = d.mainTank();
  const mp = p.unit.mp / Math.max(1, p.unit.maxMp);
  const oom = mp < 0.25;
  if (oom && (a.oomAt ?? -1e9) < w.time - 30_000) { a.oomAt = w.time; d.emit("oom", { by: p.name }); }
  const has = (id: string) => (p.save.skills[id] || 0) > 0 && ready(w, p, SKILLS[id]);
  const cost = (id: string) => skillMana(SKILLS[id], p.save.skills[id] || 1, p.level);
  const cheap = (id: string) => !oom || cost(id) <= p.unit.maxMp * 0.06;
  const seen = (q: Player) => lineClear(w.map, p.x, p.y, q.x, q.y);
  const on = (id: string, q: Player) => has(id) && seen(q) && cast(w, p, id, q.x, q.y, q.id);
  const timers = (a.timers ??= new Map());
  const timed = (key: string, ms: number) => { if ((timers.get(key) ?? -1) > w.time) return false; timers.set(key, w.time + ms); return true; };
  // 2. кто-то ниже 35% — сильное лечение
  if (ratio(low) < 0.35) {
    if (low.shieldAmt <= 0 && on("holyshield", low)) return true;
    for (const id of ["heal", "bw_transfusion", "cl_cleanse"]) if (on(id, low)) return true;
    if (low !== p && ratio(p) > 0.5 && on("bw_sacrifice", low)) return true;
  }
  // 3. рядом трое и больше ниже 70% — по площади
  const hurt = all.filter((q) => ratio(q) < 0.7);
  if (hurt.length >= 3) {
    const cx = hurt.reduce((s, q) => s + q.x, 0) / hurt.length, cy = hurt.reduce((s, q) => s + q.y, 0) / hurt.length;
    if (has("circle") && cheap("circle") && cast(w, p, "circle", cx, cy, null)) return true;
    if (has("cl_aegis") && cheap("cl_aegis") && cast(w, p, "cl_aegis", cx, cy, null)) return true;
    const near = hurt.filter((q) => w.dist(p, q) < 200).length;
    if (near >= 3 && !d.dangers.some((z) => inDanger(z, p.x, p.y, 20))) {
      for (const id of ["bw_blood_circle", "bw_tide"]) if (has(id) && cast(w, p, id, p.x, p.y, null)) return true;
      if (has("cl_hymn") && !oom && cast(w, p, "cl_hymn", p.x, p.y, null)) return true;
    }
  }
  // 4. танк ниже 80% или под конусом — щит и лечение заранее
  if (tank && !tank.dead && w.dist(p, tank) <= 330) {
    const cone = d.dangers.some((z) => z.id === "cleave" && inDanger(z, tank.x, tank.y, 0));
    if (ratio(tank) < 0.8 || cone) {
      if (tank.shieldAmt <= 0 && on("holyshield", tank)) return true;
      if (timed("renew:" + tank.id, 6000) && on("renew", tank)) return true;
      if (timed("bond:" + tank.id, 12000) && on("bw_blood_bond", tank)) return true;
      if (ratio(tank) < 0.7 && cheap("heal") && on("heal", tank)) return true;
    }
  }
  // 5. самый раненый ниже 75% — обычное лечение
  if (ratio(low) < 0.75) {
    for (const id of ["renew", "heal", "cl_cleanse", "bw_transfusion"]) {
      if (!cheap(id) || (id === "renew" && !timed("renew:" + low.id, 6000))) continue;
      if (on(id, low)) return true;
    }
    if (low !== p && ratio(p) > 0.6 && on("bw_sacrifice", low)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- воскрешение
/** Кто поднимет павшего: ближайший свободный лекарь, иначе ближний боец (не танк). */
function reviverFor(d: RaidDirector, body: Player): Player | undefined {
  const free = (q: Player) => !q.dead && d.auto.has(q) && !d.channels.has(q) && (!d.ai.get(q)?.reviving || d.ai.get(q)?.reviving === body);
  const by = (role: RaidRole) => d.players().filter((q) => d.roleOf(q) === role && free(q)).sort((x, y) => d.w.dist(x, body) - d.w.dist(y, body))[0];
  return by("healer") ?? by("melee");
}
function tryRevive(w: World, p: Player, d: RaidDirector, a: RaidAI, zs: Danger[]): boolean {
  if (a.reviving && (!a.reviving.dead || d.channelOn(a.reviving))) a.reviving = null;
  if (d.revives <= 0 || d.stage !== "fight") { a.reviving = null; return false; }
  const ps = d.players();
  if (d.roleOf(p) === "healer" && ps.some((q) => !q.dead && ratio(q) < 0.35)) return false;
  let body = a.reviving ?? undefined;
  if (!body) {
    const dead = ps.filter((q) => q.dead && !d.channelOn(q) && ![...d.ai.values()].some((s) => s !== a && s.reviving === q))
      .filter((q) => !zs.some((z) => inDanger(z, q.x, q.y, 8)));
    dead.sort((x, y) => w.dist(p, x) - w.dist(p, y));
    body = dead.find((q) => reviverFor(d, q) === p);
    if (!body) return false;
  }
  a.reviving = body;
  if (w.dist(p, body) > 46) { p.moveTo = { x: body.x + (p.x > body.x ? 18 : -18), y: body.y }; p.engaged = false; return true; }
  p.moveTo = null;
  if (!d.startRevive(p, body)) return true;
  a.reviving = null;
  return false;
}

// ---------------------------------------------------------------- решение
/** Один шаг решения бота рейда. */
export function raidThink(w: World, p: Player, d: RaidDirector) {
  const a = d.ai.get(p);
  const t = w.time;
  if (!a || p.dead || t < a.next) return;
  a.next = t + THINK_MS;
  const b = d.boss;
  // канал (воскрешение, гимн) сбивается, только если зона вот-вот сработает под ногами
  if (p.castUntil > t || d.channels.has(p)) {
    if (d.stage !== "fight" || d.o.noDodge) return;
    const zs0 = zones(w, p, d, a).filter((z) => z.id !== "berserk" && (z.id === "pool" || z.id === "sun" || z.until - t <= HORIZON));
    if (!zs0.some((z) => inDanger(z, p.x, p.y, 4))) return;
    d.cancelChannel(p);
    p.castUntil = 0;
  }
  if (d.stage === "gather" || d.stage === "wipe" || d.stage === "end") {
    p.targetId = null; p.engaged = p.approach = false;
    if (d.stage !== "end") p.moveTo = null;
    return;
  }
  if (d.stage === "pull") {
    p.targetId = null; p.engaged = p.approach = false;
    moveTo(p, pullPos(w, p, d), 12);
    return;
  }
  const role = d.roleOf(p);
  const zs = d.o.noDodge ? [] : zones(w, p, d, a);
  // 1-2. «Солнце Хаоса» — в тень колонны; остальное — уйти из зоны, которая скоро сработает
  const sun = zs.find((z) => z.id === "sun");
  if (sun) {
    const s = shadowSlot(w, p, d, a);
    if (s) { p.engaged = false; moveTo(p, s, 6); return; }
  } else if (a.pillar >= 0) { a.pillar = -1; a.slot = -1; }
  const pend = zs.filter((z) => z.id !== "sun" && z.id !== "berserk");
  const live = pend.filter((z) => z.id === "pool" || z.until - t <= HORIZON);
  const pos = rolePos(w, p, d);
  // точка опасна, если её накроет вскоре после того, как бот туда добежит; уже отгоревшие полосы и далёкие удары — нет
  const speed = Math.max(60, w.playerSpeed(p));
  // путь — прямая: если зона сработает, пока бот бежит, проверяется точка, где он будет в этот момент
  const unsafe = (x: number, y: number, r: number, m = 10) => {
    const travel = (r / speed) * 1000;
    return pend.some((z) => {
      if (z.id === "pool") return inDanger(z, x, y, m);
      const tf = z.until - t;
      if (tf < 0) return false;
      if (tf >= travel - 60) return tf <= travel + STAY && inDanger(z, x, y, m);
      const k = Math.max(0, tf / Math.max(1, travel));
      return inDanger(z, p.x + (x - p.x) * k, p.y + (y - p.y) * k, m);
    });
  };
  if (live.some((z) => inDanger(z, p.x, p.y, 4))) {
    if (!a.escape || unsafe(a.escape.x, a.escape.y, Math.hypot(a.escape.x - p.x, a.escape.y - p.y), 6)) {
      const F = d.knight.face;
      a.escape = findSafe(w, p, [], b, null, (x, y) => {
        let c = Math.hypot(x - pos.x, y - pos.y) * 0.35;
        if (!inHall(x, y, 0.95)) c += 400;
        // не под конус «Рассечения» (перед боссом), если ты не танк
        if (role !== "tank") { let da = Math.atan2(y - b.y, x - b.x) - F; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; if (Math.abs(da) < 1.15 && Math.hypot(x - b.x, y - b.y) < 230) c += 250; }
        return c;
      }, unsafe);
      if (a.escape && t - a.lastSay > 25_000 && d.rand() < 0.08) { a.lastSay = t; d.emit("dodge", { by: p.name }); }
    }
    if (a.escape) { p.moveTo = { ...a.escape }; return; }
  } else if (a.escape) { a.escape = null; p.moveTo = null; }
  // 3. воскрешение павших
  if (tryRevive(w, p, d, a, zs)) return;
  // 4. цель
  const adds = [...w.mobs.values()].filter((m) => !m.dead && m !== b && m.summoned);
  let target: Mob = b;
  const [ri] = indexIn(d, p, role);
  const main = d.mainTank();
  const addHunter = adds.length && ((role === "tank" && main !== p) || (role === "ranged" && ri < 2));
  if (addHunter) {
    const onHealer = adds.filter((m) => { const q = m.targetId ? w.players.get(m.targetId) : undefined; return !!q && d.roleOf(q) === "healer"; });
    const pool = onHealer.length ? onHealer : adds;
    target = pool.sort((x, y) => w.dist(p, x) - w.dist(p, y))[0];
  }
  // главный танк: провокация, если босс бьёт не его (не позже чем через 1 с)
  if (role === "tank" && main === p && !b.dead) {
    let other = 0;
    for (const [id, v] of b.threat) if (id !== p.id) other = Math.max(other, v);
    const thin = (b.threat.get(p.id) || 0) < other * 1.08; // запас угрозы тает — провокация заранее
    if ((b.targetId && b.targetId !== p.id) || thin) {
      a.lostAggroAt ??= t;
      if (thin && b.targetId === p.id || t - a.lostAggroAt >= 300 + d.rand() * 700) {
        const tz = order(p).find((s) => isTaunt(s) && ready(w, p, s) && w.dist(p, b) <= (s.range ?? 60) + R_BOSS);
        if (tz) {
          engage(p, b, true);
          if (cast(w, p, tz.id, b.x, b.y, b.id)) { a.lostAggroAt = undefined; if (t - a.lastSay > 20_000) { a.lastSay = t; d.emit("hold", { by: p.name }); } return; }
        }
      }
    } else a.lostAggroAt = undefined;
  }
  // второй танк: провокация приспешников; без главного — провоцирует босса; угрозу по боссу держит ниже главного
  if (role === "tank" && main !== p) {
    if (!main || main.dead) target = b;
    else if (target !== b && target.tauntUntil <= t) {
      const tz = order(p).find((s) => isTaunt(s) && ready(w, p, s) && w.dist(p, target) <= (s.range ?? 60) + target.def.radius);
      if (tz && cast(w, p, tz.id, target.x, target.y, target.id)) return;
    }
    if (target === b && main && !main.dead && (b.threat.get(p.id) || 0) > (b.threat.get(main.id) || 0) * 0.8) {
      p.targetId = null; p.unit.target = ""; p.engaged = p.approach = false;
      moveTo(p, pos, 14);
      return;
    }
  }
  // 5. позиция роли и бой
  const ranged = role === "ranged" || role === "healer";
  // не возвращаться на место через зону, которая вот-вот сработает (ушёл из круга — не заходи обратно)
  const far = Math.hypot(pos.x - p.x, pos.y - p.y);
  const blocked = pend.length > 0 && [0.25, 0.5, 0.75, 1].some((k) => unsafe(p.x + (pos.x - p.x) * k, p.y + (pos.y - p.y) * k, far * k, 12));
  if (target === b && !blocked) moveTo(p, pos, ranged ? 22 : 14);
  else p.moveTo = null;
  engage(p, target, !blocked && (target !== b || !ranged));
  if (role === "healer" && healThink(w, p, d, a)) return;
  if (role === "healer" && p.unit.mp / Math.max(1, p.unit.maxMp) < 0.25) return; // мана на исходе: только лечение
  useSkills(w, p, target, d);
}
