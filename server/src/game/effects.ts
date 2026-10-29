/**
 * Общие эффекты всех классов: замедление, ослабление, ускорение и контроль (оглушение, корни, безмолвие, страх). Умения и пассивки ставят их только здесь.
 * Слот «процент + срок» (slow, weak, haste): действует сильнейший живой процент, срок продлевается только тем же значением
 * (слабый эффект не тянет сильный, истёкший процент не учитывается). Слабый, но более долгий эффект не теряется:
 * он ждёт в «хвосте» и вступает, когда сильный истечёт (tickEffects из World). Снятие эффекта (until = 0) стирает и хвост.
 * Контроль и дебаффы от героя проверяют w.canAffect (нейтральный город, ушедший из мира герой) и не ложатся от мёртвого источника.
 * Ни контроль, ни дебаффы (из любого источника, и без него) не ложатся на полностью неуязвимого (w.isImmune).
 * Контроль (задача 148, docs/combat-148.md §2) — одна точка applyCc: правило боссов, DR по категориям, потолки и цепочка — data/cc.json.
 */
import { noteAuraSource, registerAuraHook } from "./auras";
import { BAL } from "../../../shared/balance";
import { CC, slowPctCap, type CcKind } from "../../../shared/cc";
import { Anim } from "../../../shared/protocol";
import type { Player } from "./Player";
import type { Mob } from "./Mob";
import type { Actor, HitOpts, World } from "./World";

type Slot = "slow" | "weak" | "haste";
type Pair = [pct: number, until: number];
const tails = new WeakMap<Actor, Partial<Record<Slot, Pair>>>();

function read(a: Actor, s: Slot): Pair {
  if (s === "slow") return [a.slowPct, a.slowUntil];
  if (s === "weak") return [a.weakPct, a.weakUntil];
  const p = a as Player;
  return [p.hastePct, p.hasteUntil];
}
function write(a: Actor, s: Slot, [pct, until]: Pair) {
  if (s === "slow") { a.slowPct = pct; a.slowUntil = until; }
  else if (s === "weak") { a.weakPct = pct; a.weakUntil = until; }
  else { const p = a as Player; p.hastePct = pct; p.hasteUntil = until; }
}
function setTail(a: Actor, s: Slot, t: Pair | undefined) {
  let box = tails.get(a);
  if (!t) { if (box) delete box[s]; return; }
  if (!box) tails.set(a, (box = {}));
  box[s] = t;
}

/** Слить pct% на ms в слот. true — эффект действует сейчас; false — живой сильнее (новый, если дольше, ждёт в хвосте). */
function put(w: World, a: Actor, s: Slot, pct: number, ms: number): boolean {
  const now = w.time, until = now + ms;
  if (!(pct > 0) || !(until > now)) return false;
  let [mp, mu] = read(a, s);
  let tail = mu > 0 ? tails.get(a)?.[s] : undefined; // until = 0 — эффект сняли (очищение): хвост не возвращается
  if (tail && tail[1] <= now) tail = undefined;
  if (mu <= now && tail) { [mp, mu] = tail; tail = undefined; } // основной истёк — вступает хвост
  const live = mu > now ? mp : 0;
  let took = true;
  if (pct > live) {
    // сильнее живого: становится основным; прежний, если переживёт новый, ждёт в хвосте
    if (live > 0 && mu > until) tail = [mp, mu];
    mp = pct;
    mu = until;
  } else if (pct === live) mu = Math.max(mu, until);
  else {
    took = false;
    // слабее живого: ждёт в хвосте, если переживёт основной (из ждущих — сильнейший, при равных — дольше)
    if (until > mu && (!tail || pct > tail[0] || (pct === tail[0] && until > tail[1]))) tail = [pct, until];
  }
  if (tail && tail[1] <= mu) tail = undefined; // хвост целиком под основным
  write(a, s, [mp, mu]);
  setTail(a, s, tail);
  return took;
}

/** Каждый такт (World.updatePlayer / updateMob): истёк сильный эффект — вступает ждущий слабый. */
export function tickEffects(w: World, a: Actor) {
  const box = tails.get(a);
  if (!box) return;
  for (const s of Object.keys(box) as Slot[]) {
    const t = box[s]!;
    const mu = read(a, s)[1];
    if (mu === 0 || t[1] <= w.time) delete box[s];
    else if (mu <= w.time) {
      write(a, s, t);
      delete box[s];
      if (s === "weak") w.emit({ t: "buff", id: a.id, k: "weak", ms: t[1] - w.time });
    }
  }
}

/**
 * Щит-поглотитель героя кончился раньше срока (пробит) или снят: картинки щита убираются сразу, а не по таймеру.
 * Клиент по buff с ms 0 снимает все циклы умений и пузыри этого вида на герое (effects.ts case "buff"), метка умения не нужна.
 * Вид `block` делят щиты-поглотители (барьер, саван, костяная броня), «Щитовой блок» и «Последний рубеж»: его снимаем,
 * только если на герое нет ни блока, ни рубежа, ни другого действующего щита (keepBlock — например, барьер реликвии).
 */
export function endShield(w: World, p: Player, keepBlock = false) {
  w.emit({ t: "buff", id: p.id, k: "shield", ms: 0 }, false);
  if (!keepBlock && p.blockUntil <= w.time && p.lastStandUntil <= w.time) w.emit({ t: "buff", id: p.id, k: "block", ms: 0 }, false);
}

/** Сколько мс щиту героя осталось (0 — щита нет): срок для fx buff, чтобы картинка шла ровно столько, сколько щит действует. */
export function shieldLeft(w: World, p: Player): number {
  return p.shieldAmt >= 1 && p.shieldUntil > w.time ? Math.round(p.shieldUntil - w.time) : 0;
}

/** Длительность контроля без DR и потолков: «Несгибаемый» и пр. режут; от героя по герою — × pvp.ccMult (data/balance.json). */
export const ccMs = (w: World, a: Actor, ms: number, by?: Actor | null) =>
  w.isPlayer(a) ? ms * (1 - a.derived.ccReduce) * (by && by !== a && w.isPlayer(by) ? BAL.pvp.ccMult : 1) : ms;

/** Может ли by наложить эффект на a; by = null — эффект без источника (среда, система). На неуязвимого (w.isImmune) — нет. */
function allowed(w: World, by: Actor | null, a: Actor) {
  return !w.isDead(a) && !w.isImmune(a) && (!by || (!w.isDead(by) && w.canAffect(by, a)));
}

/** Замедление a на pct% на ms (контроль: applyCc). by — кто накладывает. true — замедление действует. */
export function applySlow(w: World, by: Actor | null, a: Actor, pct: number, ms: number): boolean {
  return applyCc(w, by, a, "slow", ms, { pct });
}

/** Ослабление: урон a −pct% на ms (с эффектом «weak» на клиенте). true — ослабление действует. */
export function applyWeaken(w: World, by: Actor | null, a: Actor, pct: number, ms: number): boolean {
  if (!allowed(w, by, a) || !put(w, a, "weak", pct, ms)) return false;
  noteAuraSource(a, "weak", by, w.time + ms);
  w.emit({ t: "buff", id: a.id, k: "weak", ms: a.weakUntil - w.time });
  return true;
}

/** Ускорение атаки героя на pct% на ms (свой бафф; эффект на клиенте вызывающий шлёт сам). true — ускорение действует. */
export function applyHaste(w: World, p: Player, pct: number, ms: number): boolean {
  return !p.dead && put(w, p, "haste", pct, ms);
}

// ---------- контроль (задача 148): одна точка applyCc, правила — data/cc.json (shared/cc.ts) ----------

/** Доп. параметры наложения: pct — сила замедления; bossSlow — во что превращается стан или корни на боссе (по умолчанию cc.boss.convSlow); from — откуда бежать в страхе (по умолчанию от источника). */
export interface CcOpts { pct?: number; bossSlow?: number; from?: { x: number; y: number } }

type DrState = { n: number; until: number };
/** DR героя по категориям (только герой по герою): счёт наложений и срок сброса. */
const drTab = new WeakMap<Actor, Record<string, DrState>>();
/** Цепочка контроля разных видов (cc.chain): отрезки [начало, конец] и иммунитет после потолка. */
const chainTab = new WeakMap<Actor, { iv: [number, number][]; immuneUntil: number }>();

/** Иммунитет к видам контроля от умений (data/cc.json skills.<id>.immune: «Антимагия», «Метаморфоза», «Бешенство»): вид → до когда. */
const immTab = new WeakMap<Actor, Partial<Record<CcKind, number>>>();
/** Дать a иммунитет к видам kinds на ms (срок только продлевается). */
export function grantCcImmune(w: World, a: Actor, kinds: readonly CcKind[], ms: number) {
  let box = immTab.get(a);
  if (!box) immTab.set(a, (box = {}));
  for (const k of kinds) box[k] = Math.max(box[k] ?? 0, w.time + ms);
}
/** Есть ли у a иммунитет к виду kind от умения. */
export const ccImmune = (w: World, a: Actor, kind: CcKind) => (immTab.get(a)?.[kind] ?? 0) > w.time;

const isBoss = (w: World, a: Actor): a is Mob => !w.isPlayer(a) && !!a.def.boss;
const pvpPair = (w: World, by: Actor | null, a: Actor) => !!by && by !== a && w.isPlayer(by) && w.isPlayer(a);

function drState(w: World, a: Actor, kind: CcKind): DrState {
  const cat = CC.drCat[kind] ?? kind;
  let box = drTab.get(a);
  if (!box) drTab.set(a, (box = {}));
  let s = box[cat];
  if (!s || s.until <= w.time) s = box[cat] = { n: 0, until: 0 };
  return s;
}
/** Доля длительности по DR (1 — полная, 0 — иммунитет); вне PvP — 1. */
export function drK(w: World, by: Actor | null, a: Actor, kind: CcKind): number {
  if (!pvpPair(w, by, a) || !CC.drCat[kind]) return 1; // категория "" — вид без DR
  const ks = kind === "slow" ? CC.slowDr : CC.dr;
  if (!ks?.length) return 1;
  return ks[Math.min(drState(w, a, kind).n, ks.length - 1)];
}

/** Срезать срок t по цепочке (cc.chain) у героя-цели. 0 — цепочка исчерпана (иммунитет). */
function chainClip(w: World, a: Actor, t: number): number {
  const ch = CC.chain, now = w.time;
  let box = chainTab.get(a);
  if (!box) chainTab.set(a, (box = { iv: [], immuneUntil: 0 }));
  if (now < box.immuneUntil) return 0;
  box.iv = box.iv.filter(([, e]) => e > now - ch.windowMs);
  // прошлое под контролем в окне (объединение отрезков) и докуда тянется живой контроль
  const past = box.iv
    .map(([s0, e]): [number, number] => [Math.max(s0, now - ch.windowMs), Math.min(e, now)])
    .filter(([s0, e]) => e > s0)
    .sort((x, y) => x[0] - y[0]);
  let used = 0, cs = 0, ce = 0, open = false;
  for (const [s0, e] of past) {
    if (!open || s0 > ce) { if (open) used += ce - cs; cs = s0; ce = e; open = true; }
    else ce = Math.max(ce, e);
  }
  if (open) used += ce - cs;
  const live = box.iv.reduce((m, [, e]) => Math.max(m, e - now), 0);
  const room = ch.capMs - used;
  if (t > room) {
    t = Math.max(0, room);
    box.immuneUntil = now + Math.max(t, live) + ch.immuneMs; // после конца цепочки — короткий иммунитет
  }
  return t;
}

/** Всплывающее «Иммунитет» на цели. */
const immuneFx = (w: World, a: Actor) => w.emit({ t: "dmg", id: a.id, v: 0, imm: true });

/**
 * Прервать каст a: hard (стан, страх) — и призыв маунта/камень; безмолвие — только каст умения.
 * Моб: замах удара по площади срывается (ccAt), шаман на cc.silenceLockMs не лечит; босс — его interrupt(), если есть.
 */
export function interruptCast(w: World, a: Actor, hard: boolean) {
  const now = w.time;
  if (w.isPlayer(a)) {
    if (a.castBreakable && a.castUntil > now) {
      a.castUntil = 0;
      a.castBreakable = false;
      w.castBar(a, 0);
      if (a.unit.anim === Anim.Cast) a.unit.anim = Anim.Idle;
    }
    if (hard && (a.mountCast || a.tele) && !a.unit.mount) w.breakMount(a);
    return;
  }
  if (!hard && a.def.boss) { (a.boss as { interrupt?: () => void } | null)?.interrupt?.(); return; }
  a.ccAt = now;
  if (a.windUntil > now) a.windUntil = now;
  if (a.ai.heal && !a.def.boss) a.healAt = Math.max(a.healAt, now + CC.silenceLockMs);
  (a.boss as { interrupt?: () => void } | null)?.interrupt?.();
}

/**
 * Единственная точка наложения контроля (stun, root, slow, silence, fear). by — источник (null — среда, механика босса).
 * Порядок: разрешено ли → правило боссов (cc.boss, только от героя) → длительность (ccReduce, pvp.ccMult, weak.cc и eliteMult моба)
 * → DR (герой по герою) → потолки maxMs (от героя) и mobMaxMs (обычный моб по герою) → цепочка cc.chain (герой по герою)
 * → наложение и прерывание каста. true — эффект лёг (замедление — действует сейчас; безмолвие по боссу — сбило каст).
 */
export function applyCc(w: World, by: Actor | null, a: Actor, kind: CcKind, ms: number, o: CcOpts = {}): boolean {
  if (!allowed(w, by, a)) return false;
  let pct = o.pct ?? 0;
  const fromHero = !!by && by !== a && w.isPlayer(by);
  if (fromHero && isBoss(w, a)) {
    const B = CC.boss;
    if (kind === "stun" || kind === "root" || kind === "fear") {
      const rule = B[kind];
      if (rule === "immune") { immuneFx(w, a); return false; }
      if (rule === "slow") { kind = "slow"; pct = o.bossSlow ?? B.convSlow; }
    } else if (kind === "silence") {
      if (B.silence === "immune") return false;
      if (B.silence === "interrupt") { interruptCast(w, a, false); return true; }
    } else pct *= B.slowMult;
  }
  if (kind === "slow" && !(pct > 0)) return false;
  if (ccImmune(w, a, kind)) { if (kind !== "slow") immuneFx(w, a); return false; }
  let t = ccMs(w, a, ms, by);
  if (!w.isPlayer(a)) {
    t *= a.ai.weak?.cc?.[kind] ?? 1; // слабость моба к контролю (data/mobAI.json weak.cc)
    if (a.elite) t *= CC.eliteMult;
  }
  const k = drK(w, by, a, kind);
  if (k <= 0) { immuneFx(w, a); return false; }
  t *= k;
  if (fromHero && CC.maxMs[kind] > 0) t = Math.min(t, CC.maxMs[kind]);
  if (by && !w.isPlayer(by) && !by.def.boss && w.isPlayer(a) && kind !== "slow" && CC.mobMaxMs > 0) t = Math.min(t, CC.mobMaxMs);
  const chained = pvpPair(w, by, a) && CC.chain.kinds.includes(kind);
  if (chained) {
    t = chainClip(w, a, t);
    if (!(t > 0)) { immuneFx(w, a); return false; }
  }
  const now = w.time, until = now + t;
  if (!(until > now)) return false;
  if (kind === "slow") {
    if (!put(w, a, "slow", slowPctCap(pct), t)) return false;
  } else if (kind === "stun") {
    a.stunUntil = Math.max(a.stunUntil, until);
    interruptCast(w, a, true);
  } else if (kind === "root") {
    a.rootUntil = Math.max(a.rootUntil, until);
  } else if (kind === "silence") {
    a.silenceUntil = Math.max(a.silenceUntil, until);
    interruptCast(w, a, false);
  } else {
    a.fearUntil = Math.max(a.fearUntil, until);
    a.fearFrom = o.from ? { x: o.from.x, y: o.from.y } : by ? { x: by.x, y: by.y } : null;
    a.fearBy = by;
    a.fearAt = now;
    a.fearDmg = 0;
    if (w.isPlayer(a)) { a.moveTo = null; a.pend = null; }
    interruptCast(w, a, true);
  }
  noteAuraSource(a, kind, by, until); // источник — для пометки «мой» в плашке цели (auras.ts)
  if (pvpPair(w, by, a) && CC.drCat[kind]) { const s = drState(w, a, kind); s.n++; s.until = now + CC.drMs; }
  if (chained) chainTab.get(a)?.iv.push([now, until]);
  return true;
}

/** Оглушение a на ms (срок только продлевается). На боссе — замедление o.bossSlow (или cc.boss.convSlow). */
export const applyStun = (w: World, by: Actor | null, a: Actor, ms: number, o?: CcOpts) => applyCc(w, by, a, "stun", ms, o);
/** Корни (обездвиживание) a на ms. На боссе — замедление o.bossSlow (или cc.boss.convSlow). */
export const applyRoot = (w: World, by: Actor | null, a: Actor, ms: number, o?: CcOpts) => applyCc(w, by, a, "root", ms, o);
/** Безмолвие: умения нельзя (кроме usableInSilence), атака и бег можно; сбивает каст. */
export const applySilence = (w: World, by: Actor | null, a: Actor, ms: number) => applyCc(w, by, a, "silence", ms);
/** Страх: бег прочь от источника без управления; ломается уроном (breakFear). */
export const applyFear = (w: World, by: Actor | null, a: Actor, ms: number, from?: { x: number; y: number }) => applyCc(w, by, a, "fear", ms, { from });

/** Урон по a (World.hitEx): страх ломается, когда урон после наложения ≥ fear.breakHp × maxHp (DoT — с весом, свой DoT первые selfDotGraceMs — не в счёт). */
export function breakFear(w: World, a: Actor, src: Actor, dmg: number, o: HitOpts) {
  if (a.fearUntil <= w.time) return;
  const F = CC.fear;
  const dot = o.dot ?? (o.flat !== undefined && o.canCrit === false && !!o.noProc);
  if (dot && src === a.fearBy && w.time - a.fearAt < F.selfDotGraceMs) return;
  a.fearDmg += dmg * (dot ? F.dotWeight : 1);
  if (a.fearDmg >= F.breakHp * a.unit.maxHp) {
    a.fearUntil = w.time;
    a.fearBy = null;
  }
}

/** Снять с a контроль видов kinds (очищение; у замедления стирается и хвост). */
export function cleanseCc(a: Actor, kinds: readonly CcKind[]) {
  for (const k of kinds) {
    if (k === "stun") a.stunUntil = 0;
    else if (k === "root") a.rootUntil = 0;
    else if (k === "slow") { a.slowUntil = 0; setTail(a, "slow", undefined); }
    else if (k === "silence") a.silenceUntil = 0;
    else { a.fearUntil = 0; a.fearBy = null; }
  }
}

/** Направление бега в страхе: прочь от источника (fearFrom), с вилянием fear.wobble. Единичный вектор. */
export function fearDir(w: World, a: Actor): { x: number; y: number } {
  const F = CC.fear, from = a.fearFrom;
  let dx = from ? a.x - from.x : 0, dy = from ? a.y - from.y : 1;
  const d = Math.hypot(dx, dy);
  if (d < 1) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
  let h = 0;
  for (let i = 0; i < a.id.length; i++) h = (h * 31 + a.id.charCodeAt(i)) | 0;
  const ang = Math.atan2(dy, dx) + Math.sin((w.time / F.wobbleMs) * Math.PI * 2 + (Math.abs(h) % 628) / 100) * F.wobble;
  return { x: Math.cos(ang), y: Math.sin(ang) };
}

/** Состояние DR героя для рамок: значки dr_<категория> (n — сколько уже было, v — доля следующего наложения в %). */
registerAuraHook((a, now, aura) => {
  const box = drTab.get(a as Actor);
  if (!box) return;
  const st = (cat: string) => { const s = box[cat]; return s && s.n > 0 && s.until > now ? s : null; };
  const next = (s: DrState) => Math.round(CC.dr[Math.min(s.n, CC.dr.length - 1)] * 100);
  let s: DrState | null;
  if ((s = st("stun"))) aura("dr_stun", s.until, { n: s.n, v: next(s) });
  if ((s = st("root"))) aura("dr_root", s.until, { n: s.n, v: next(s) });
  if ((s = st("fear"))) aura("dr_fear", s.until, { n: s.n, v: next(s) });
  if ((s = st("silence"))) aura("dr_silence", s.until, { n: s.n, v: next(s) });
});
