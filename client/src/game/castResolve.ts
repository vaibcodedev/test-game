/**
 * Выбор адресата каста (задача 115, шаг 6; docs/controls.md, раздел 6). Чистые функции, без Phaser и DOM.
 * Порядок для unit: юнит под курсором подходящего типа (цель не меняется) -> выбранная цель -> ally на себя (Alt — всегда) ->
 * enemy: ближайший враг в дальности при «Автоцели», иначе ошибка. Точка — курсор, зажатый дальностью. Направление — на курсор;
 * курсор над интерфейсом — на цель, иначе вперёд. Курсор на враге (каст по наведению) — точка и направление по его ногам (задача 133).
 * castAim — где ляжет умение и что слать серверу: общая геометрия shared/skillShape.ts от предсказанной позиции героя (превью = сервер).
 * Внизу — выбор цели мышью (задача 134, шаг 1; разделы 4, 11, 12): допуск клика, магнит ЛКМ и один порядок (pickOrder) для клика, подсветки и курсора.
 */
import type { WorldMap } from "../../../shared/map";
import { aimExtras, placeSkill, type Placed } from "../../../shared/skillShape";
import type { SkillAim, SkillDef, SkillTarget } from "../../../shared/skills";

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
/** far — сервер откажет «Слишком далеко» (только умения на цель); точку ground и направление сервер прижимает к дальности сам — у них far нет. */
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
      // курсор на враге — точка по его ногам (сервер мерит круги от ног); дальше дальности — прижать: сервер прижимает так же и кастует
      const at = hoverFoe(c) ?? c.cursor;
      const p = clampToRange(self, at, range);
      return { ok: true, x: p.x, y: p.y, target: null, far: false };
    }
    case "dash": {
      return { ok: true, x: c.cursor.x, y: c.cursor.y, target: null, far: false };
    }
    case "dir": {
      const len = range > 0 ? range : 300;
      if (c.overUi) {
        if (sel && !sel.dead) return { ok: true, x: sel.x, y: sel.y, target: sel.enemy ? sel.id : null, far: false };
        return { ok: true, x: self.x + c.facing.x * len, y: self.y + c.facing.y * len, target: null, far: false };
      }
      // курсор на враге — по его ногам (огненный шар наводится на него); дальше дальности снаряд летит до дальности — отказа нет
      const hv = hoverFoe(c);
      return { ok: true, x: hv ? hv.x : c.cursor.x, y: hv ? hv.y : c.cursor.y, target: hv?.id ?? null, far: false };
    }
  }
}

/** Живой враг под курсором при касте по наведению (курсор не над интерфейсом). */
function hoverFoe(c: CastIn): CastUnit | null {
  return c.hoverCast && !c.overUi && c.hover && c.hover.enemy && !c.hover.dead ? c.hover : null;
}

/** Сообщение «skill» кроме id, цели и опций: точка, угол (линии, стена огня) и вектор рывка (shared/skillShape.ts aimExtras). */
export interface AimMsg { x: number; y: number; a?: number; dx?: number; dy?: number }

/**
 * Где ляжет умение по плану (превью) и что слать серверу: placeSkill от предсказанной позиции героя from без допуска — та же функция,
 * которой сервер решает каст (с допуском GROUND_TOL от своей позиции). g.err — отказ сервера (видимость, луч, рывок), заранее.
 * Точка ground — уже прижатая; у линии — угол и вектор до её точки, у рывка — вектор от героя (из очереди сервер применит их от своей позиции).
 * unit — цель плана (ноги и радиус): самонаведение огненного шара, как у сервера (у него — живая цель запроса).
 */
export function castAim(map: WorldMap, def: SkillDef, rank: number, ranks: Readonly<Record<string, number>> | undefined, from: { x: number; y: number }, plan: { x: number; y: number },
  unit?: { x: number; y: number; r: number }): { g: Placed; msg: AimMsg } {
  const g = placeSkill(map, def, rank, ranks, from, { x: plan.x, y: plan.y, unit });
  const ex = aimExtras(def, g, from);
  const at = g.shape === "circle" || g.shape === "line" ? { x: g.x, y: g.y } : g.shape === "dash" ? { x: g.tx, y: g.ty } : { x: plan.x, y: plan.y };
  return { g, msg: { ...at, ...ex } };
}

// ---------- Выбор цели мышью (задача 134, шаг 1; docs/controls.md, разделы 4, 11, 12) ----------

/** Допуск клика по существу и радиус магнита ЛКМ в «Экшене» — в пикселях экрана; «Крупные цели» удваивают оба. */
export const PICK_TOL = 12;
export const PICK_MAGNET = 40;

/** Запас к зоне тела в пикселях мира: пиксели экрана / масштаб CSS (пикселей CSS на пиксель мира, 2–3). Допуск, а при magnet — радиус магнита. */
export function pickReach(css: number, magnet: boolean, bigTargets: boolean): number {
  return ((magnet ? PICK_MAGNET : PICK_TOL) * (bigTargets ? 2 : 1)) / (css > 0 ? css : 1);
}

/** Зона клика по юниту — круг по телу: радиус 14 (у крупного кадра, больше 32 px, — 30), центр на 12 px выше ног (у крупных и всадников — на 28).
 *  Возвращает расстояние от точки мира (wx, wy) до центра, если она ближе радиуса + reach, иначе Infinity. */
export function bodyDist(x: number, y: number, large: boolean, mounted: boolean, wx: number, wy: number, reach: number): number {
  const d = Math.hypot(wx - x, wy - (y - (large || mounted ? 28 : 12)));
  return d < (large ? 30 : 14) + reach ? d : Infinity;
}

/** magnet — промах ЛКМ в «Экшене» в радиусе магнита: клик только выбирает врага, а атакует лишь точное попадание (foe): в пачке магнит может взять не того. */
export type PickKind = "aim" | "foe" | "magnet" | "bag" | "node" | "npc" | "menu" | "friend" | "ground";
/** Результат pickOrder — что сделает клик. id — враг, союзник или мешок; ref — узел добычи или NPC (кладёт источник). Объект постоянный: наведение считается каждый кадр без аллокаций. */
export interface PickOut { kind: PickKind; id: string | null; ref: unknown }
export interface PickCtx {
  /** Идёт прицел умения: клик уйдёт ему. */
  aim: boolean;
  right: boolean;
  /** «Экшен»: у ЛКМ магнит, мешки, узлы и NPC берёт только ПКМ. «Классика»: магнита нет, мешки, узлы и NPC берут обе кнопки. */
  action: boolean;
  /** Открытый мир: ПКМ по игроку открывает меню обмена. */
  world: boolean;
  /** Пикселей CSS на пиксель мира и опция «Крупные цели». */
  css: number;
  bigTargets: boolean;
}
/** Что лежит под курсором; reach — запас к зоне тела в пикселях мира (pickReach). Ближайший к курсору побеждает. */
export interface PickSource {
  /** Живой враг, которого здесь можно бить: мобы, боссы, герои в спорной зоне и на арене. */
  foe(reach: number): string | null;
  /** Герой чужой фракции в нейтральном городе: «враг», но бой там запрещён — удар клеймит нарушителем и зовёт стражу. */
  townFoe(reach: number): string | null;
  /** Мешок, узел добычи или NPC: при успехе кладёт в out kind (bag, node, npc), id или ref. */
  item(out: PickOut): boolean;
  /** Союзник-игрок, которому ПКМ откроет меню обмена (не я, не скрытый). */
  menu(reach: number): string | null;
  /** Союзник — игрок (в том числе я и павший) или питомец; мой герой и мои питомцы — с запасом own, остальные — с reach. */
  friend(reach: number, own: number): string | null;
}

/**
 * Один порядок для клика, подсветки (кого выберет ЛКМ) и курсора (кого атакует ПКМ): прицел → враг точно → мешок, узел, NPC →
 * герой чужой фракции в нейтральном городе (только по телу) → меню союзника (ПКМ в мире) → союзник точно → враг магнитом (только ЛКМ в «Экшене») → земля.
 * «Точно» — зона тела с допуском 12 px экрана, магнит — 40 px (pickReach); прямое попадание по телу важнее чужого допуска, а допуск — магнита.
 * Без аллокаций: вызывается каждый кадр.
 */
export function pickOrder(c: PickCtx, s: PickSource, out: PickOut): PickOut {
  out.id = null;
  out.ref = null;
  if (c.aim) { out.kind = "aim"; return out; }
  const tol = pickReach(c.css, false, c.bigTargets);
  // сначала по самому телу, потом с допуском: допуск мелкого врага не отбирает клик у тела крупного (рейд-босс и приспешники)
  const foe = s.foe(0) ?? s.foe(tol);
  if (foe) { out.kind = "foe"; out.id = foe; return out; }
  if ((c.right || !c.action) && s.item(out)) return out;
  // герой чужой фракции в нейтральном городе: удар по нему — нарушение, поэтому он после мешка, узла и NPC (торговка не уступает чужаку, стоящему на месте разговора) и без допуска
  const town = s.townFoe(0);
  if (town) { out.kind = "foe"; out.id = town; return out; }
  if (c.right && c.world) { const m = s.menu(tol); if (m) { out.kind = "menu"; out.id = m; return out; } }
  // свой герой и свои питомцы — только по телу: камера держит героя в центре экрана, и допуск сделал бы мёртвой зоной клик-шаг рядом с ним
  const friend = s.friend(tol, 0);
  if (friend) { out.kind = "friend"; out.id = friend; return out; }
  if (c.action && !c.right) { const m = s.foe(pickReach(c.css, true, c.bigTargets)); if (m) { out.kind = "magnet"; out.id = m; return out; } }
  out.kind = "ground";
  return out;
}
