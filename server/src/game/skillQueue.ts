/** Очередь умений, подход к цели и коды отказов (задача 115, шаг 7–8; docs/controls.md, разделы 6 и 10). */
import { Anim } from "../../../shared/protocol";
import { TILE } from "../../../shared/constants";
import { lineClear } from "../../../shared/map";
import { SKILLS, skillMana } from "../../../shared/skills";
import type { Player } from "./Player";
import { castSkill } from "./skills";
import type { World } from "./World";
import { GP } from "../../../shared/gameplay";
import { T } from "../../../shared/texts";

export type ErrCode = "target" | "range" | "los" | "mana" | "cd" | "learn";
/** Запрос умения: x, y — точка (ground — с допуском GROUND_TOL); a — угол прицела (линии, стена огня), dx, dy — вектор рывка или до точки линии: из очереди они
 *  применяются от позиции героя в момент исполнения, а не к старой абсолютной точке (задача 133, shared/skillShape.ts). */
export interface SkillReq { id: string; x: number; y: number; target: string | null; ap: boolean; until: number; a?: number; dx?: number; dy?: number }

const APPROACH_MS = GP.misc.skillApproachMs;

/** Код отказа по тексту, который вернул castSkill (или умения классов). */
export function errCode(text: string): ErrCode | undefined {
  if (/не изучено|Неизвестное умение/.test(text)) return "learn";
  if (/слишком далеко/i.test(text)) return "range";
  if (/видимост|прегражд/i.test(text)) return "los";
  if (/маны/i.test(text)) return "mana";
  if (/Нужна цель|Выберите союзника/.test(text)) return "target";
  return undefined;
}

/** Через сколько мс умение будет готово: перезарядка, GCD или короткий (≤ 0,5 с) каст. */
export function blockLeft(w: World, p: Player, id: string): number {
  const def = SKILLS[id];
  let left = (p.cds.get(id) || 0) - w.time;
  if (def && !def.offGcd) left = Math.max(left, p.gcdUntil - w.time);
  const castLeft = p.castUntil - w.time;
  if (castLeft > 0 && castLeft <= 500) left = Math.max(left, castLeft);
  return Math.max(0, left);
}

/** Тост-отказ с точным текстом (чего не хватает) и кодом. */
function refuse(w: World, p: Player, id: string, err: string, target: string | null) {
  const code = errCode(err);
  let text = err;
  const def = SKILLS[id];
  if (code === "mana" && def) text = T("srv.skillQueue.815", { mp: Math.floor(p.unit.mp), skillmana: skillMana(def, p.save.skills[id] || 1, p.level) });
  else if (code === "target") text = T("ui.GameScene.757");
  else if (code === "learn") text = T("srv.skillQueue.816");
  else if (code === "los") text = T("srv.archers.51");
  else if (code === "range") {
    const t = target ? w.actor(target) : undefined;
    const over = t && def ? w.dist(p.unit, t) - ((def.range ?? 0) + w.radiusOf(t)) : 0;
    text = T("srv.skillQueue.817", { math: Math.max(1, Math.ceil(over / TILE)) });
  }
  p.send("toast", { text, kind: "error", ...(code ? { code } : {}) });
}

function setQueue(p: Player, q: SkillReq | null) {
  p.queue = q;
}

/** Выполнить умение сейчас; вне дальности с включённым подходом — запомнить на 4 с. */
function execute(w: World, p: Player, r: SkillReq) {
  const err = castSkill(w, p, r.id, r.x, r.y, r.target, r);
  if (!err) return;
  const tg = r.target ? w.actor(r.target) : undefined;
  if (r.ap && errCode(err) === "range" && tg && !w.isDead(tg)) {
    p.pend = { ...r, ap: false, until: w.time + APPROACH_MS };
    p.moveTo = null;
    return;
  }
  refuse(w, p, r.id, err, r.target);
}

/** Сообщение skill: выполнить, поставить в очередь (≤ q мс до готовности) или отбросить. */
export function requestSkill(w: World, p: Player, r: SkillReq, q: number) {
  p.pend = null;
  setQueue(p, null);
  const left = blockLeft(w, p, r.id);
  if (left <= 0) return execute(w, p, r);
  if (left <= q) return setQueue(p, { ...r, until: w.time + left + 250 });
  // дольше окна очереди: на перезарядке умения говорим, сколько ждать (GCD — молча)
  const cdLeft = (p.cds.get(r.id) || 0) - w.time;
  if (cdLeft > 0 && p.save.skills[r.id]) p.send("toast", { text: T("srv.skillQueue.138", { replace: (cdLeft / 1000).toFixed(1).replace(".", ",") }), kind: "error", code: "cd" });
}

/** Esc / cancel: очередь, подход, канал. Возвращает true, если было что снимать. */
export function cancelAll(w: World, p: Player): boolean {
  const had = !!p.queue || !!p.pend || p.castUntil > w.time || !!p.mountCast;
  p.pend = null;
  setQueue(p, null);
  if (p.mountCast) w.breakMount(p);
  if (p.castUntil > w.time) { p.castUntil = 0; p.castBreakable = false; w.castBar(p, 0); if (p.unit.anim === Anim.Cast) p.unit.anim = Anim.Idle; }
  return had;
}

/** Каждый тик героя: исполнить очередь, когда умение готово. */
export function tickQueue(w: World, p: Player) {
  const sig = `${p.queue?.id ?? ""}|${p.pend ? 1 : 0}`;
  if (sig !== p.qSig) { p.qSig = sig; p.send("queue", { id: p.queue?.id ?? null, pend: !!p.pend }); }
  const q = p.queue;
  if (!q) return;
  if (p.dead || w.time > q.until) return setQueue(p, null);
  if (blockLeft(w, p, q.id) > 0) return;
  setQueue(p, null);
  execute(w, p, q);
}

/** Подход к цели для отложенного каста; возвращает true, если герой шагнул. */
export function stepApproach(w: World, p: Player, dt: number): boolean {
  const r = p.pend;
  if (!r) return false;
  const tg = r.target ? w.actor(r.target) : undefined;
  if (w.time > r.until || p.dead || !tg || w.isDead(tg)) { p.pend = null; return false; }
  const u = p.unit, def = SKILLS[r.id];
  const range = (def?.range ?? 0) + w.radiusOf(tg);
  const d = w.dist(u, tg);
  const los = lineClear(w.map, u.x, u.y, tg.x, tg.y);
  if (d <= range - 2 && los) {
    if (blockLeft(w, p, r.id) > 0) return false;
    p.pend = null;
    execute(w, p, { ...r, x: tg.x, y: tg.y });
    return false;
  }
  return w.stepToward(p, tg.x, tg.y, dt, los ? Math.max(0, range - 6) : 20);
}
