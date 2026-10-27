/**
 * Общие эффекты всех классов: замедление, ослабление, ускорение, оглушение, корни. Умения и пассивки ставят их только здесь.
 * Слот «процент + срок» (slow, weak, haste): действует сильнейший живой процент, срок продлевается только тем же значением
 * (слабый эффект не тянет сильный, истёкший процент не учитывается). Слабый, но более долгий эффект не теряется:
 * он ждёт в «хвосте» и вступает, когда сильный истечёт (tickEffects из World). Снятие эффекта (until = 0) стирает и хвост.
 * Контроль и дебаффы от героя проверяют w.canAffect (нейтральный город, ушедший из мира герой) и не ложатся от мёртвого источника.
 * Ни контроль, ни дебаффы (из любого источника, и без него) не ложатся на полностью неуязвимого (w.isImmune).
 */
import { noteAuraSource } from "./auras";
import { BAL } from "../../../shared/balance";
import type { Player } from "./Player";
import type { Actor, World } from "./World";

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

/** Длительность контроля с учётом «Несгибаемого» у героев. */
/** Длительность контроля: «Несгибаемый» и пр. режут; от героя по герою — × pvp.ccMult (data/balance.json). */
export const ccMs = (w: World, a: Actor, ms: number, by?: Actor | null) =>
  w.isPlayer(a) ? ms * (1 - a.derived.ccReduce) * (by && by !== a && w.isPlayer(by) ? BAL.pvp.ccMult : 1) : ms;

/** Может ли by наложить эффект на a; by = null — эффект без источника (среда, система). На неуязвимого (w.isImmune) — нет. */
function allowed(w: World, by: Actor | null, a: Actor) {
  return !w.isDead(a) && !w.isImmune(a) && (!by || (!w.isDead(by) && w.canAffect(by, a)));
}

/** Замедление a на pct% на ms (контроль: срок режет «Несгибаемый»). by — кто накладывает. true — замедление действует. */
export function applySlow(w: World, by: Actor | null, a: Actor, pct: number, ms: number): boolean {
  if (!allowed(w, by, a)) return false;
  const t = ccMs(w, a, ms, by), took = put(w, a, "slow", pct, t);
  if (took) noteAuraSource(a, "slow", by, w.time + t); // источник — для пометки «мой» в плашке цели (auras.ts)
  return took;
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

/** PvP: убывающая длительность оглушений от героев (data/balance.json pvp.stunDr — доли по счёту в окне stunDrMs; 0 — иммунитет). */
const stunDr = new WeakMap<Actor, { n: number; until: number }>();
function stunDrK(w: World, by: Actor | null, a: Actor): number {
  const ks = BAL.pvp.stunDr;
  if (!ks?.length || !by || by === a || !w.isPlayer(a) || !w.isPlayer(by)) return 1;
  let s = stunDr.get(a);
  if (!s || s.until <= w.time) { s = { n: 0, until: 0 }; stunDr.set(a, s); }
  const k = ks[Math.min(s.n, ks.length - 1)];
  if (k > 0) { s.n++; s.until = w.time + (BAL.pvp.stunDrMs ?? 15000); }
  return k;
}

/** Оглушение a на ms (срок только продлевается, «Несгибаемый» режет; от героя по герою — убывающая длительность stunDr). */
export function applyStun(w: World, by: Actor | null, a: Actor, ms: number): boolean {
  if (!allowed(w, by, a)) return false;
  const until = w.time + ccMs(w, a, ms * stunDrK(w, by, a), by);
  if (!(until > w.time) || !allowed(w, by, a)) return false;
  a.stunUntil = Math.max(a.stunUntil, until);
  noteAuraSource(a, "stun", by, until);
  return true;
}

/** Корни (обездвиживание) a на ms (срок только продлевается, «Несгибаемый» режет). */
export function applyRoot(w: World, by: Actor | null, a: Actor, ms: number): boolean {
  const until = w.time + ccMs(w, a, ms, by);
  if (!(until > w.time) || !allowed(w, by, a)) return false;
  a.rootUntil = Math.max(a.rootUntil, until);
  noteAuraSource(a, "root", by, until);
  return true;
}
