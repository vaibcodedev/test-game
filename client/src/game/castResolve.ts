/**
 * Выбор адресата каста (задача 115, шаг 6; docs/controls.md, раздел 6). Чистые функции, без Phaser и DOM.
 * Порядок для unit: юнит под курсором подходящего типа (цель не меняется) -> выбранная цель -> ally на себя (Alt — всегда) ->
 * enemy: ближайший враг в дальности при «Автоцели», иначе ошибка. Точка — курсор, зажатый дальностью. Направление — на курсор;
 * курсор над интерфейсом — на цель, иначе вперёд.
 */
import type { SkillAim, SkillTarget } from "../../../shared/skills";

export interface CastUnit { id: string; x: number; y: number; enemy: boolean; friend: boolean; dead?: boolean }
export interface CastSkill { aim: SkillAim; target?: SkillTarget; range?: number }
export interface CastIn {
  skill: CastSkill;
  self: { id: string; x: number; y: number };
  /** Курсор в мире (последнее положение над картой). */
  cursor: { x: number; y: number };
  overUi: boolean;
  /** Юнит под курсором (null над интерфейсом) и выбранная цель. */
  hover: CastUnit | null;
  selected: CastUnit | null;
  units: CastUnit[];
  /** Единичный вектор «вперёд». */
  facing: { x: number; y: number };
  alt: boolean;
  hoverCast: boolean;
  autoTarget: boolean;
}
export type CastPlan =
  | { ok: true; x: number; y: number; target: string | null; far: boolean }
  | { ok: false; err: string };

/** Точка to, зажатая дальностью range от from (range <= 0 — без зажима). */
export function clampToRange(from: { x: number; y: number }, to: { x: number; y: number }, range: number): { x: number; y: number; far: boolean } {
  const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
  if (!(range > 0) || d <= range) return { x: to.x, y: to.y, far: false };
  return { x: from.x + (dx / d) * range, y: from.y + (dy / d) * range, far: true };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Подходит ли юнит типу умения (enemy — враг, ally — союзник, в том числе павший для воскрешения). */
export function fitsTarget(u: CastUnit, t: SkillTarget | undefined): boolean {
  if (t === "enemy") return u.enemy && !u.dead;
  if (t === "ally") return u.friend;
  return false;
}

export function resolveCast(c: CastIn): CastPlan {
  const { skill: s, self } = c;
  const range = s.range ?? 0;
  const sel = c.selected;
  switch (s.aim) {
    case "self":
      return { ok: true, x: self.x, y: self.y, target: sel?.id ?? null, far: false };
    case "unit": {
      if (s.target === "ally" && c.alt) return { ok: true, x: self.x, y: self.y, target: self.id, far: false };
      let t: CastUnit | null = null;
      if (c.hoverCast && !c.overUi && c.hover && fitsTarget(c.hover, s.target)) t = c.hover;
      else if (sel && fitsTarget(sel, s.target)) t = sel;
      else if (s.target === "ally") t = { id: self.id, x: self.x, y: self.y, enemy: false, friend: true };
      else if (c.autoTarget) {
        let bd = range + 8;
        for (const u of c.units) if (fitsTarget(u, "enemy") && dist(u, self) <= bd) { bd = dist(u, self); t = u; }
      }
      if (!t) return { ok: false, err: "Нет цели" };
      return { ok: true, x: t.x, y: t.y, target: t.id, far: range > 0 && dist(t, self) > range + 8 };
    }
    case "ground": {
      const p = clampToRange(self, c.cursor, range);
      return { ok: true, x: p.x, y: p.y, target: null, far: p.far };
    }
    case "dash": {
      return { ok: true, x: c.cursor.x, y: c.cursor.y, target: null, far: false };
    }
    case "dir": {
      const len = range > 0 ? range : 300;
      if (c.overUi) {
        if (sel && !sel.dead) return { ok: true, x: sel.x, y: sel.y, target: sel.enemy ? sel.id : null, far: dist(sel, self) > len + 8 };
        return { ok: true, x: self.x + c.facing.x * len, y: self.y + c.facing.y * len, target: null, far: false };
      }
      const hv = c.hoverCast && c.hover && c.hover.enemy && !c.hover.dead ? c.hover : null;
      return { ok: true, x: c.cursor.x, y: c.cursor.y, target: hv?.id ?? null, far: dist(c.cursor, self) > len };
    }
  }
}
