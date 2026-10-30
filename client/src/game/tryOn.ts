/**
 * «Примерить на себя» (перековка, docs/art/gear.md): вид «Оболочки» на своём герое на несколько секунд — только на клиенте,
 * сервер и другие игроки ничего не видят. UnitView подменяет строки внешности своего героя, пока примерка не истекла.
 */
let cur: { gear: string; weapon: string; until: number } | null = null;

export function setTryOn(look: { gear: string; weapon: string }, ms: number) {
  cur = { ...look, until: performance.now() + ms };
}
export const clearTryOn = () => { cur = null; };
/** Строки внешности примерки или null (нет / истекла). */
export function tryOnLook(): { gear: string; weapon: string } | null {
  if (cur && performance.now() > cur.until) cur = null;
  return cur;
}
