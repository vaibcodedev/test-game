/**
 * Полоса щита-поглотителя поверх здоровья (как в WoW) в рамках цели и группы: <b class="abs"> внутри .bar.hp, стили — .bar > .abs в kit.css.
 * Ширина = щит / максимум здоровья (не больше всей полосы); левый край — конец здоровья, а если щит не помещается справа, он заходит на здоровье
 * с правого края. Щит берётся из состояния юнита (UnitState.shield, сервер шлёт только у героев, целым числом).
 */

/** Левый край и ширина полосы щита, % полосы здоровья; null — щита нет. */
export function absorbSpan(hp: number, maxHp: number, shield: number): { left: number; width: number } | null {
  const max = Math.max(1, maxHp), width = Math.min(100, (Math.max(0, shield) / max) * 100);
  if (!(width > 0)) return null;
  return { left: Math.min((Math.max(0, hp) / max) * 100, 100 - width), width };
}

const pct = (x: number) => +x.toFixed(2);

/** Разметка полосы щита для рамки, которая пересобирается целиком (пустая строка — щита нет). */
export function absorbHtml(hp: number, maxHp: number, shield: number): string {
  const a = absorbSpan(hp, maxHp, shield);
  return a ? `<b class="abs" style="left:${pct(a.left)}%;width:${pct(a.width)}%"></b>` : "";
}

/** Обновить готовую полосу щита <b class="abs" hidden> в рамке, которая живёт между кадрами (группа, рейд). */
export function absorbApply(abs: HTMLElement | null, hp: number, maxHp: number, shield: number) {
  if (!abs) return;
  const a = absorbSpan(hp, maxHp, shield);
  if (!a) { if (!abs.hidden) abs.hidden = true; return; }
  if (abs.hidden) abs.hidden = false;
  abs.style.left = `${pct(a.left)}%`;
  abs.style.width = `${pct(a.width)}%`;
}
