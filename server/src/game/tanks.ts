/**
 * Умения танков: Храмовник (warrior, Сольгард) и Рыцарь смерти (deathknight, Умбрат).
 * Данные — data/skills.json (ids tp_* и новые dk_*), здесь — механика новых активных умений и реакции пассивок.
 * Пассивки подключены хуками в World.hit: outgoing (исходящий множитель), incoming (входящий урон), redirect (заступничество),
 * onBlock, beforeLethal, afterDamaged, afterDealt, onKill; onCast вызывается из castSkill при успешном применении.
 * Состояние героя — в WeakMap (в сохранения не попадает).
 */
import { PLAYER_RADIUS } from "../../../shared/constants";
import { lineClear } from "../../../shared/map";
import { Anim, Dir } from "../../../shared/protocol";
import { SKILLS } from "../../../shared/skills";
import type { Player } from "./Player";
import { reachable } from "./skills";
import type { CastCtx } from "./umbrath";
import { applyRoot, applySlow } from "./effects";
import { registerAuraHook } from "./auras";
import type { Actor, HitOpts, World } from "./World";
import { leechMult } from "../../../shared/balance";

interface Mark { n: number; until: number }
interface St {
  hits: number; wrath: number; runes: number;
  invulnUntil: number; amUntil: number; amPct: number; amHeal: number;
  bladeUntil: number; bladePct: number; bladeLeech: number;
  lastTemper: number; tapReady: number; embraceReady: number; embracePending: boolean;
  /** «Пожирание боли»: лечение идёт до tapUntil, tapAmt здоровья в секунду (для значка эффекта). */
  tapUntil: number; tapAmt: number;
  /** «Вампирская кровь»: до какого момента идёт уже показанная картинка щита (чтобы не перезапускать её каждым ударом). */
  vampFxUntil: number;
  log: [number, number][];
  marks: Map<string, Mark>;
}
const states = new WeakMap<Player, St>();
function st(p: Player): St {
  let s = states.get(p);
  if (!s) {
    s = { hits: 0, wrath: 0, runes: 0, invulnUntil: 0, amUntil: 0, amPct: 0, amHeal: 0, bladeUntil: 0, bladePct: 0, bladeLeech: 0, lastTemper: 0, tapReady: 0, embraceReady: 0, embracePending: false, tapUntil: 0, tapAmt: 0, vampFxUntil: 0, log: [], marks: new Map() };
    states.set(p, s);
  }
  return s;
}
// значки в рамке героя (auras.ts): неуязвимость, антимагия, рунный клинок, «Пожирание боли»
registerAuraHook((a, _now, aura) => {
  const s = states.get(a as Player);
  if (!s) return;
  aura("invuln", s.invulnUntil);
  aura("antimagic", s.amUntil, { v: s.amPct });
  aura("runeblade", s.bladeUntil, { v: s.bladePct });
  aura("blood_tap", s.tapUntil, { v: s.tapAmt });
});
/** Кто метит героя «Знаком смерти» (только герои-цели; сами метки — в состоянии рыцаря смерти). */
const markedBy = new WeakMap<object, Player>();
// значок метки на герое-цели (auras.ts): «Знак смерти» рыцаря смерти — стаки и прибавка урона по цели
registerAuraHook((a, _now, aura) => {
  const d = markedBy.get(a);
  const mk = d && !d.dead && rk(d, "dk_mortality") ? states.get(d)?.marks.get((a as Actor).id) : undefined;
  if (d && mk) aura("mortality", mk.until, { n: mk.n, v: mk.n * pv(d, "dk_mortality").perMark });
});
const rk = (p: Player, id: string) => p.save.skills[id] || 0;
const pv = (p: Player, id: string) => SKILLS[id].v(Math.max(1, rk(p, id)));
const isTank = (p: Player) => p.cls === "warrior" || p.cls === "deathknight";
const weaponAvg = (p: Player) => ((p.derived.dmgMin + p.derived.dmgMax) / 2) * p.derived.skillMult;
const dirTo = (dx: number, dy: number): Dir => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? Dir.Left : Dir.Right) : dy < 0 ? Dir.Up : Dir.Down);

// ---------- знамёна «Знамени защиты» ----------
interface Banner { owner: Player; x: number; y: number; r: number; until: number; reduce: number; w: World }
const banners = new WeakMap<World, Banner[]>();
/** Все стоящие знамёна (для значка в рамке героя: хук аур получает только героя, без World). Истёкшие вычищаются в хуке. */
const liveBanners = new Set<Banner>();
// значок «Знамя защиты» в рамке героя (auras.ts): герой в круге живого знамени своего или союзника — величина = снижение урона
registerAuraHook((a, now, aura) => {
  const p = a as Player;
  let best: Banner | null = null;
  for (const b of liveBanners) {
    if (b.until <= b.w.time || b.owner.dead) { liveBanners.delete(b); continue; }
    if (b.w.players.get(p.id) !== p || Math.hypot(p.x - b.x, p.y - b.y) > b.r) continue;
    if (b.owner !== p && b.w.hostile(b.owner, p)) continue;
    if (!best || b.reduce > best.reduce) best = b;
  }
  if (best) aura("tp_banner", now + (best.until - best.w.time), { v: best.reduce });
});

function setCd(p: Player, w: World, id: string, readyIn: number) {
  p.cds.set(id, w.time + readyIn);
  p.send("cd", { id, ms: readyIn });
}

/** Притянуть врага вплотную к герою. */
function pull(w: World, p: Player, m: Actor) {
  const u = p.unit;
  const stop = w.radiusOf(m) + PLAYER_RADIUS + 6;
  const dest = reachable(w, m.x, m.y, u.x, u.y, Math.max(0, w.dist(u, m) - stop));
  w.emit({ t: "blink", id: m.id, x0: m.x, y0: m.y, x1: dest.x, y1: dest.y, k: "charge" });
  m.unit.x = dest.x;
  m.unit.y = dest.y;
  if (w.isPlayer(m)) m.moveTo = null;
}

/** Мобу — провокация: атакует героя sec секунд, угроза выше максимальной. */
function taunt(w: World, p: Player, t: Actor, sec: number, extra: number) {
  if (w.isPlayer(t) || t.def.boss) return;
  let top = 0;
  for (const th of t.threat.values()) top = Math.max(top, th);
  t.threat.set(p.id, Math.max(t.threat.get(p.id) || 0, top) + extra);
  t.tauntUntil = w.time + sec * 1000;
  t.tauntBy = p.id;
  t.targetId = p.id;
  if (t.state === "idle") t.state = "chase";
  w.emit({ t: "buff", id: t.id, k: "taunted", ms: sec * 1000 });
}

// =====================================================================
//                         АКТИВНЫЕ УМЕНИЯ
// =====================================================================
/** undefined — умение не из этого модуля. */
export function castTank(c: CastCtx): string | null | undefined {
  const { w, p, v, def } = c;
  const t = c.liveTarget as Actor;
  const u = p.unit;
  const s = st(p);
  const range = def.range ?? 0;
  const needTarget = (los = true): string | null => {
    if (!c.liveTarget) return "Нужна цель";
    if (w.dist(u, t) > range + w.radiusOf(t)) return "Цель слишком далеко";
    if (los && !lineClear(w.map, u.x, u.y, t.x, t.y)) return "Нет прямой видимости";
    return null;
  };
  const face = (a: { x: number; y: number }) => { u.dir = dirTo(a.x - u.x, a.y - u.y); };

  switch (c.id) {
    // ---------- Храмовник ----------
    case "tp_shield_bash": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      w.emit({ t: "aoe", k: "bash", x: t.x, y: t.y, r: 44 });
      const blocking = p.blockUntil > w.time;
      w.hit(p, t, { mult: (v.dmg / 100) * (blocking ? 1 + v.blockBonus / 100 : 1), skill: true, threat: 1 });
      c.threat(t, v.threat);
      if (!c.isBoss(t)) c.stun(t, v.stun * 1000); else c.slow(t, 40, v.stun * 1000);
      return null;
    }
    case "tp_glare": {
      c.ok();
      u.anim = Anim.Cast;
      w.later(400, () => { if (u.anim === Anim.Cast && !p.dead) u.anim = Anim.Idle; });
      w.emit({ t: "aoe", k: "glare", x: u.x, y: u.y, r: v.radius });
      for (const m of w.enemiesInCircle(p, u.x, u.y, v.radius)) {
        c.weaken(m, v.weak, v.dur * 1000);
        c.threat(m, v.threat);
      }
      return null;
    }
    case "tp_hammer": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      const ms = (w.dist(u, t) / 520) * 1000;
      w.emit({ t: "proj", k: "holy", from: p.id, to: t.id, tx: t.x, ty: t.y, ms });
      w.later(ms, () => {
        if (w.isDead(t) || !w.hostile(p, t)) return;
        w.emit({ t: "aoe", k: "nova", x: t.x, y: t.y, r: 40 });
        w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "holy", threat: 1 });
        c.threat(t, v.threat);
        taunt(w, p, t, v.taunt, 120);
      });
      return null;
    }
    case "tp_banner": {
      // точка ground уже прижата к дальности (с допуском) и проверена на прямую видимость в castSkill (placeSkill, shared/skillShape.ts) — как есть
      const bx = c.ax, by = c.ay;
      c.ok();
      const list = banners.get(w) ?? [];
      banners.set(w, list.filter((b) => b.until > w.time && b.owner !== p));
      const nb: Banner = { owner: p, x: bx, y: by, r: v.radius, until: w.time + v.dur * 1000, reduce: v.reduce, w };
      banners.get(w)!.push(nb);
      for (const b of liveBanners) if (b.owner === p) liveBanners.delete(b); // одно знамя на храмовника
      liveBanners.add(nb);
      w.emit({ t: "hazard", id: w.uid("h"), k: "holy", x: bx, y: by, r: v.radius, ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "banner", x: bx, y: by, r: v.radius });
      // удар древка о землю (в такт пыли установки на клиенте): свет по врагам рядом с основанием
      w.later(170, () => { for (const e of w.enemiesInCircle(p, bx, by, v.impact)) w.hit(p, e, { mult: v.dmg / 100, skill: true, kind: "holy", threat: 1 }); });
      return null;
    }
    case "tp_divine": {
      c.ok();
      s.invulnUntil = w.time + v.dur * 1000;
      p.stunUntil = p.rootUntil = p.slowUntil = 0;
      w.emit({ t: "buff", id: p.id, k: "invuln", ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "divine", x: u.x, y: u.y, r: 70 });
      return null;
    }

    // ---------- Рыцарь смерти ----------
    case "dk_icy_touch": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      const ms = (w.dist(u, t) / 600) * 1000;
      w.emit({ t: "proj", k: "frost", from: p.id, to: t.id, tx: t.x, ty: t.y, ms });
      w.later(ms, () => {
        if (w.isDead(t) || !w.hostile(p, t)) return;
        const wasSlowed = t.slowUntil > w.time;
        w.emit({ t: "aoe", k: "frost", x: t.x, y: t.y, r: 36 });
        w.hit(p, t, { mult: v.dmg / 100, skill: true, kind: "frost" });
        c.slow(t, v.slow, v.dur * 1000);
        if (wasSlowed && !c.isBoss(t) && c.root(t, v.root * 1000)) w.emit({ t: "buff", id: t.id, k: "frozen", ms: v.root * 1000 });
      });
      return null;
    }
    case "dk_soul_reap": {
      const e = needTarget(); if (e) return e;
      c.ok(); face(t);
      w.emit({ t: "aoe", k: "reap", x: t.x, y: t.y, r: 46 });
      const low = t.unit.hp < t.unit.maxHp * (v.execute / 100);
      const dealt = w.hit(p, t, { mult: (v.dmg / 100) * (low ? v.mult : 1), skill: true, kind: "shadow", threat: 1 });
      if (dealt > 0) w.heal(p, Math.round(((dealt * v.heal) / 100) * leechMult(p.level)));
      if (w.isDead(t)) {
        w.heal(p, Math.round((u.maxHp * v.healKill) / 100));
        setCd(p, w, c.id, 2000);
      }
      return null;
    }
    case "dk_rune_blade": {
      c.ok();
      s.bladeUntil = w.time + v.dur * 1000;
      s.bladePct = v.bonus;
      s.bladeLeech = v.leech;
      w.emit({ t: "buff", id: p.id, k: "rune", ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "rune", x: u.x, y: u.y, r: 50 });
      return null;
    }
    case "dk_chain_storm": {
      c.ok();
      w.emit({ t: "aoe", k: "chains", x: u.x, y: u.y, r: v.radius });
      const list = w.enemiesInCircle(p, u.x, u.y, v.radius).sort((a, b) => w.dist(u, a) - w.dist(u, b)).slice(0, v.max);
      for (const m of list) {
        w.emit({ t: "chain", pts: [u.x, u.y - 12, m.x, m.y - 12], k: "shadow" });
        if (!c.isBoss(m) && w.dist(u, m) > 40) pull(w, p, m);
        w.hit(p, m, { mult: v.dmg / 100, skill: true, kind: "shadow" });
        c.slow(m, v.slow, v.dur * 1000);
        c.threat(m, 80);
      }
      return null;
    }
    case "dk_anti_magic": {
      c.ok();
      s.amUntil = w.time + v.dur * 1000;
      s.amPct = v.reduce;
      s.amHeal = v.heal;
      w.emit({ t: "buff", id: p.id, k: "antimagic", ms: v.dur * 1000 });
      w.emit({ t: "aoe", k: "antimagic", x: u.x, y: u.y, r: 54 });
      return null;
    }
  }
  return undefined;
}

// =====================================================================
//                              ХУКИ
// =====================================================================
/** Умение успешно применено (после списания маны). */
export function onCast(w: World, p: Player, id: string, target: Actor | undefined) {
  if (!isTank(p)) return;
  const s = st(p);
  if (p.cls === "deathknight") {
    if (rk(p, "dk_rune_mastery")) {
      s.runes = Math.min(5, s.runes + 1);
      if (s.runes === 5) w.emit({ t: "aoe", k: "rune", x: p.x, y: p.y, r: 30 });
    }
    const mk = rk(p, "dk_mortality");
    if (mk && target && (id === "dk_rune_strike" || id === "dk_soul_reap")) {
      const m = pv(p, "dk_mortality"), key = target.id;
      const cur = s.marks.get(key);
      const n = Math.min(m.max, (cur && cur.until > w.time ? cur.n : 0) + 1);
      s.marks.set(key, { n, until: w.time + m.dur * 1000 });
      if (w.isPlayer(target)) markedBy.set(target, p); // у героя-цели метка видна в списке эффектов
      w.emit({ t: "buff", id: target.id, k: "weak", ms: 600 });
    }
    if (id === "dk_death_grip" && target && rk(p, "dk_iron_chains")) {
      const m = pv(p, "dk_iron_chains");
      const t = target;
      w.later(40, () => {
        if (p.dead) return;
        if (!w.isPlayer(t) && t.def.boss && applyRoot(w, p, t, m.root * 1000)) w.emit({ t: "buff", id: t.id, k: "frozen", ms: m.root * 1000 });
        for (const o of w.enemiesInCircle(p, t.x, t.y, m.radius)) {
          if (o === t || (!w.isPlayer(o) && o.def.boss)) continue;
          w.emit({ t: "chain", pts: [p.x, p.y - 12, o.x, o.y - 12], k: "shadow" });
          pull(w, p, o);
          applySlow(w, p, o, 40, 1500);
        }
      });
    }
  } else {
    const vg = rk(p, "tp_vanguard");
    if (vg && (id === "charge" || id === "tp_shield_bash")) {
      const m = pv(p, "tp_vanguard");
      const live = p.shieldUntil > w.time && p.shieldAmt >= 1, was = live ? p.shieldAmt : 0;
      // потолок не урезает больший действующий щит; срок — позднейший (короткий щит не обрывает чужой длинный)
      p.shieldAmt = Math.max(was, Math.min(p.unit.maxHp * 0.5, was + Math.round((p.unit.maxHp * m.abs) / 100)));
      p.shieldUntil = Math.max(live ? p.shieldUntil : 0, w.time + m.dur * 1000);
      p.shieldBy = p;
      w.emit({ t: "buff", id: p.id, k: "shield", ms: Math.round(p.shieldUntil - w.time) });
    }
  }
}

/** Исходящий множитель урона героя-танка. Только удары по оружию/умения (не фиксированный урон). */
export function outgoing(w: World, src: Player, dst: Actor, o: HitOpts): number {
  if (!isTank(src) || o.flat !== undefined) return 1;
  const s = st(src);
  let k = 1;
  if (s.bladeUntil > w.time) k *= 1 + s.bladePct / 100;
  const wb = rk(src, "dk_winters_bite");
  if (wb && (dst.slowUntil > w.time || dst.rootUntil > w.time || dst.stunUntil > w.time)) k *= 1 + pv(src, "dk_winters_bite").bonus / 100;
  const mk = s.marks.get(dst.id);
  if (mk && rk(src, "dk_mortality")) {
    if (mk.until > w.time) k *= 1 + (mk.n * pv(src, "dk_mortality").perMark) / 100;
    else s.marks.delete(dst.id);
  }
  return k;
}

/** «Божественный щит» (tp_divine): полная неуязвимость — для World.isImmune (удары — промах, контроль не ложится). */
export function immune(w: World, p: Player): boolean {
  return (states.get(p)?.invulnUntil ?? 0) > w.time;
}

/** Входящий урон героя-танка (после брони): только частичное снижение; неуязвимость — World.isImmune. */
export function incoming(w: World, src: Actor, dst: Player, amount: number, o: HitOpts): number {
  if (!isTank(dst)) return banner(w, dst, amount);
  const s = st(dst);
  if (s.amUntil > w.time && o.kind && o.kind !== "phys") {
    const prevented = (amount * s.amPct) / 100;
    amount -= prevented;
    w.heal(dst, Math.round((prevented * s.amHeal) / 100), true);
  }
  const ft = rk(dst, "tp_fortitude");
  if (ft) {
    const missing = Math.max(0, 1 - dst.unit.hp / Math.max(1, dst.unit.maxHp));
    amount *= 1 - Math.min(35, Math.floor(missing * 10) * pv(dst, "tp_fortitude").pct) / 100;
  }
  return banner(w, dst, amount);
}
function banner(w: World, dst: Player, amount: number): number {
  const list = banners.get(w);
  if (!list?.length) return amount;
  let best = 0;
  for (const b of list) if (b.until > w.time && !b.owner.dead && b.reduce > best && Math.hypot(dst.x - b.x, dst.y - b.y) <= b.r && (b.owner === dst || !w.hostile(b.owner, dst))) best = b.reduce;
  return amount * (1 - best / 100);
}

/** «Заступничество»: часть урона по союзнику принимает Храмовник. */
export function redirect(w: World, src: Actor, dst: Player, amount: number): number {
  for (const t of w.playersInCircle(dst.x, dst.y, 260)) {
    if (t === dst || t.cls !== "warrior" || t.dead || w.hostile(t, dst)) continue;
    const r = rk(t, "tp_martyr");
    if (!r) continue;
    const m = pv(t, "tp_martyr");
    if (Math.hypot(t.x - dst.x, t.y - dst.y) > m.range) continue;
    const share = (amount * m.share) / 100;
    const sv = Math.min(Math.round(share * t.derived.dmgTaken), t.unit.hp - 1);
    if (sv < 1) continue;
    amount -= share;
    w.applyDamage(t, sv, src);
    w.emit({ t: "dmg", id: t.id, v: sv, k: "holy" });
    w.emit({ t: "chain", pts: [t.x, t.y - 12, dst.x, dst.y - 12], k: "holy" });
    break;
  }
  return amount;
}

/** Щитовой блок поглотил blocked урона. */
export function onBlock(w: World, dst: Player, blocked: number) {
  const r = rk(dst, "tp_bulwark");
  if (!r) return;
  const m = pv(dst, "tp_bulwark");
  w.heal(dst, Math.round((blocked * m.heal) / 100));
  const ready = dst.cds.get("shieldblock") || 0;
  if (ready > w.time) setCd(dst, w, "shieldblock", Math.max(0, ready - w.time - m.refund * 1000));
}

/** Смертельный удар: «Объятия смерти» оставляют 1 здоровья. */
export function beforeLethal(w: World, dst: Player, v: number): number {
  const r = rk(dst, "dk_deaths_embrace");
  if (!r || v < dst.unit.hp) return v;
  const s = st(dst);
  if (w.time < s.embraceReady) return v;
  s.embraceReady = w.time + pv(dst, "dk_deaths_embrace").icd * 1000;
  s.embracePending = true;
  return Math.max(0, dst.unit.hp - 1);
}

/** Герой-танк получил урон v (после applyDamage). */
export function afterDamaged(w: World, src: Actor, dst: Player, v: number, o: HitOpts) {
  if (!isTank(dst)) return;
  const s = st(dst);
  if (s.embracePending) {
    s.embracePending = false;
    const m = pv(dst, "dk_deaths_embrace");
    w.heal(dst, Math.round((dst.unit.maxHp * m.hp) / 100));
    const live = dst.shieldUntil > w.time && dst.shieldAmt >= 1;
    dst.shieldAmt = Math.max(live ? dst.shieldAmt : 0, Math.round(dst.unit.maxHp * 0.15)); // больший действующий щит не урезается
    dst.shieldUntil = Math.max(live ? dst.shieldUntil : 0, w.time + 5000);
    dst.shieldBy = dst;
    w.emit({ t: "buff", id: dst.id, k: "shield", ms: Math.round(dst.shieldUntil - w.time) }); // щит виден все 5 с, а не только вспышка неуязвимости
    w.emit({ t: "buff", id: dst.id, k: "invuln", ms: 1500 });
    w.emit({ t: "aoe", k: "reap", x: dst.x, y: dst.y, r: 90 });
  }
  if (dst.dead || v <= 0 || src === dst) return;
  s.log.push([w.time, v]);
  while (s.log.length && s.log[0][0] < w.time - 6000) s.log.shift();

  const av = rk(dst, "tp_avenger");
  if (av) s.wrath = Math.min(dst.unit.maxHp * 0.25, s.wrath + (v * pv(dst, "tp_avenger").conv) / 100);

  const tm = rk(dst, "tp_tempering");
  if (tm && w.time - s.lastTemper >= 1000) {
    s.lastTemper = w.time;
    const cut = pv(dst, "tp_tempering").cd * 1000;
    for (const [id, ready] of dst.cds) if (ready > w.time) setCd(dst, w, id, Math.max(0, ready - w.time - cut));
  }

  const re = rk(dst, "tp_retribution");
  if (re) {
    const m = pv(dst, "tp_retribution");
    if (++s.hits >= m.every) {
      s.hits = 0;
      w.emit({ t: "aoe", k: "nova", x: dst.x, y: dst.y, r: m.radius });
      for (const e of w.enemiesInCircle(dst, dst.x, dst.y, m.radius)) w.hit(dst, e, { mult: m.dmg / 100, skill: true, kind: "holy", noProc: true, threat: 1 });
    }
  }

  const th = rk(dst, "dk_frost_thorns");
  if (th && !w.isDead(src) && w.dist(src, dst) <= 120) {
    const m = pv(dst, "dk_frost_thorns");
    w.hit(dst, src, { flat: Math.max(1, Math.round((v * m.pct) / 100)), canCrit: false, kind: "frost", noProc: true, noReflect: true });
    applySlow(w, dst, src, m.slow, 2000);
  }

  const bt = rk(dst, "dk_blood_tap");
  if (bt && dst.unit.hp < dst.unit.maxHp * 0.5 && w.time >= s.tapReady) {
    const m = pv(dst, "dk_blood_tap");
    s.tapReady = w.time + m.icd * 1000;
    const total = s.log.reduce((a, e) => a + e[1], 0) * (m.conv / 100);
    s.tapUntil = w.time + 5000;
    s.tapAmt = Math.round(total / 5);
    w.emit({ t: "buff", id: dst.id, k: "heal", ms: 5000 });
    for (let i = 1; i <= 5; i++) w.later(i * 1000, () => { if (!dst.dead) w.heal(dst, Math.round(total / 5)); });
  }
}

/** Герой-танк нанёс урон v. */
export function afterDealt(w: World, src: Player, dst: Actor, v: number, o: HitOpts) {
  if (!isTank(src) || o.noProc || v <= 0) return;
  const s = st(src);
  const vamp = rk(src, "dk_vampiric");
  if (vamp) {
    const amt = Math.round(((v * pv(src, "dk_vampiric").leech) / 100) * leechMult(src.level));
    const got = w.heal(src, amt, false);
    const over = amt - got;
    if (over > 0) {
      const live = src.shieldUntil > w.time && src.shieldAmt >= 1, was = live ? src.shieldAmt : 0;
      const next = Math.max(was, Math.min(src.unit.maxHp * 0.2, was + over)); // потолок 20% не урезает больший щит (например, чужой «Святой щит»)
      if (next >= 1) {
        src.shieldAmt = next;
        src.shieldUntil = Math.max(live ? src.shieldUntil : 0, w.time + 8000);
        src.shieldBy = src;
        // картинку рисуем при появлении щита и когда прежняя вот-вот кончится, а щит продлён; каждый удар с излишком её не перезапускает
        if (!live || s.vampFxUntil - w.time < 4000) {
          s.vampFxUntil = src.shieldUntil;
          w.emit({ t: "buff", id: src.id, k: "shield", ms: Math.round(src.shieldUntil - w.time) });
        }
      }
    }
  }
  const fury = rk(src, "dk_rune_fury");
  if (fury && !o.skill && o.flat === undefined) {
    const cut = pv(src, "dk_rune_fury").cd * 1000;
    for (const [id, ready] of src.cds) if (ready > w.time) setCd(src, w, id, Math.max(0, ready - w.time - cut));
  }
  if (s.bladeUntil > w.time && s.bladeLeech > 0) w.heal(src, Math.round(((v * s.bladeLeech) / 100) * leechMult(src.level)), false);
  if (!o.skill || w.isDead(src)) return;
  if (s.runes >= 5 && rk(src, "dk_rune_mastery") && !w.isDead(dst)) {
    s.runes = 0;
    w.emit({ t: "aoe", k: "rune", x: dst.x, y: dst.y, r: 56 });
    w.hit(src, dst, { flat: Math.max(1, Math.round((weaponAvg(src) * pv(src, "dk_rune_mastery").dmg) / 100)), canCrit: false, kind: "frost", noProc: true });
  }
  if (s.wrath > 0 && rk(src, "tp_avenger") && !w.isDead(dst)) {
    const dmg = Math.round(s.wrath);
    s.wrath = 0;
    w.emit({ t: "aoe", k: "nova", x: dst.x, y: dst.y, r: 50 });
    w.hit(src, dst, { flat: Math.max(1, dmg), canCrit: false, kind: "holy", noProc: true });
  }
}

/** Убийство моба героем. */
export function onKill(w: World, killer: Player, _m: Actor) {
  const r = rk(killer, "dk_unholy_vigor");
  if (!r || killer.dead) return;
  const m = pv(killer, "dk_unholy_vigor");
  w.heal(killer, Math.round((killer.unit.maxHp * m.hp) / 100));
  killer.unit.mp = Math.min(killer.unit.maxMp, killer.unit.mp + (killer.unit.maxMp * m.mana) / 100);
  w.emit({ t: "aoe", k: "reap", x: killer.x, y: killer.y, r: 40 });
}
