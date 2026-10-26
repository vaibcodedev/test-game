/**
 * Печати гладиатора (задача 142): за каждый бой арены — в сохранение героя (save.pendingItems, выдаются в мире при входе: deliverPending).
 * Комната арены сохранений не пишет, поэтому печати кладутся прямо в базу; возврат в мир читает сохранение из базы.
 */
import { MODE_NAMES, type ArenaMode } from "../../../shared/arena";
import { gladiatorSeals, GLADIATOR_PART } from "../../../shared/mounts";
import { makePart } from "../game/stable";
import { services } from "./registry";

/** Лучший рейтинг героя за текущий сезон по режимам, где он сыграл; не играл — 0. */
export function bestArenaRating(nameKey: string): number {
  const st = services.arena;
  if (!st) return 0;
  let best = 0;
  for (const m of Object.keys(MODE_NAMES) as ArenaMode[]) {
    const r = st.rating(nameKey, m);
    if (r.wins + r.losses + r.draws > 0) best = Math.max(best, r.rating);
  }
  return best;
}

/** Побед подряд, считая последний бой (история уже с ним). */
function winStreak(nameKey: string): number {
  let n = 0;
  for (const h of services.arena.history(nameKey, 20)) { if (h.result !== "win") break; n++; }
  return n;
}

/** После записи матча: каждому живому участнику — печати гладиатора в отложенную добычу. */
export function awardGladiators(players: { nameKey: string; name: string; result: "win" | "draw" | "loss"; ratingAfter: number; left?: boolean; bot?: boolean }[], withBots: boolean) {
  for (const x of players) {
    if (x.bot || x.left) continue;
    const save = services.db.load(x.name);
    if (!save) continue;
    const n = gladiatorSeals(x.result, x.result === "win" ? winStreak(x.nameKey) : 0, x.ratingAfter, withBots);
    if (n <= 0) continue;
    (save.pendingItems ??= []).push(makePart(GLADIATOR_PART, n));
    services.db.save(x.name, save);
  }
}
