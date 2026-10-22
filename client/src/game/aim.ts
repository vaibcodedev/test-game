/**
 * Превью прицела (задача 115, шаг 6; задача 133, шаг 1): кольцо дальности вокруг героя и форма умения — ровно та геометрия, по которой решает сервер
 * (shared/skillShape.ts через castAim): круги без сплющивания (сервер мерит Math.hypot) с бледной каймой края попадания, размеры по рангу и пассивкам,
 * линии — на уровне груди, рывок — до воды, деревьев и стен. Красное — там, где сервер откажет: нет прямой видимости, луч в стену, рывок в упор;
 * у умений на цель — дальше дальности. Вид превью — шаг 3. Режим прицела — mouseOpts.aimMode (UI в настройках, шаг 9).
 */
import { CHEST, HIT_EDGE, type Placed } from "../../../shared/skillShape";
import type { SkillDef } from "../../../shared/skills";
import type { CastPlan } from "./castResolve";
import { saveMouseOpts, mouseOpts, type AimMode } from "./keybinds";
import { DEPTH } from "./terrain";

export const getAimMode = (): AimMode => mouseOpts.aimMode;
export function setAimMode(m: AimMode) {
  if (m !== "preview" && m !== "quick" && m !== "confirm") return;
  mouseOpts.aimMode = m;
  saveMouseOpts();
}

const OK = 0xfff0a0, BAD = 0xff4040;

export class AimPreview {
  private g: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.top - 20);
  }
  clear() { this.g.clear(); }
  /** shape — где ляжет умение (castAim; null — плана нет). rangeOnly: только кольцо (наведение на слот, unit/self); иначе ещё форма у точки или линия. */
  draw(def: SkillDef, from: { x: number; y: number }, plan: CastPlan | null, shape: Placed | null, rangeOnly: boolean) {
    const g = this.g;
    g.clear();
    const range = def.range ?? 0, aim = def.aim ?? "self";
    if (aim === "self") return;
    if (aim === "dash") {
      // кольцо — длина рывка по рангу; линия от груди до точки приземления, красная — сервер откажет (сдвиг меньше DASH_MIN)
      if (shape && shape.r > 0) g.lineStyle(1, OK, 0.5).strokeCircle(from.x, from.y, shape.r);
      if (!rangeOnly && shape) {
        const col = shape.err ? BAD : OK;
        g.lineStyle(2, col, 0.9).lineBetween(from.x, from.y - CHEST, shape.x, shape.y - CHEST);
        g.fillStyle(col, 0.3).fillCircle(shape.x, shape.y, 10).lineStyle(2, col, 0.9).strokeCircle(shape.x, shape.y, 10);
      }
      return;
    }
    // кольцо дальности красное, только если сервер откажет «Слишком далеко» или цели нет (умения на цель): точку и направление сервер прижимает сам
    const far = !plan ? false : plan.ok ? plan.far : true;
    if (range > 0 && aim !== "dir") g.lineStyle(2, far ? BAD : OK, 0.7).strokeCircle(from.x, from.y, range);
    if (rangeOnly || !plan?.ok || !shape) return;
    const col = shape.err ? BAD : OK;
    if (shape.shape === "circle") {
      g.fillStyle(col, 0.18).fillCircle(shape.x, shape.y, shape.r).lineStyle(2, col, 0.9).strokeCircle(shape.x, shape.y, shape.r);
      // бледная кайма — край попадания по герою: сервер считает попадание с радиусом цели
      g.lineStyle(1, col, 0.35).strokeCircle(shape.x, shape.y, shape.r + HIT_EDGE);
    } else if (shape.shape === "line") {
      // по углу прицела на длину линии (у луча — до стены), на уровне груди
      const ex = from.x + Math.cos(shape.a) * shape.len, ey = from.y + Math.sin(shape.a) * shape.len;
      g.lineStyle(3, col, 0.8).lineBetween(from.x, from.y - CHEST, ex, ey - CHEST);
      g.fillStyle(col, 0.5).fillCircle(ex, ey - CHEST, 5);
    }
  }
}
