/**
 * Превью прицела (задача 115, шаг 6): кольцо дальности вокруг героя (красное, если цель или точка дальше), круг area у курсора,
 * линия для dir и dash. Режим прицела — mouseOpts.aimMode (UI в настройках, шаг 9).
 */
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
  /** rangeOnly: только кольцо дальности (наведение на слот, unit/self); иначе ещё область у курсора или линия. */
  draw(def: SkillDef, from: { x: number; y: number }, plan: CastPlan | null, rangeOnly: boolean) {
    const g = this.g;
    g.clear();
    const range = def.range ?? 0, aim = def.aim ?? "self";
    const far = !plan ? false : plan.ok ? plan.far : true;
    const col = far ? BAD : OK;
    if (aim === "dash") {
      const len = def.area ?? 200;
      g.lineStyle(1, OK, 0.5).strokeEllipse(from.x, from.y, len * 2, len * 1.2);
      if (!rangeOnly && plan?.ok) {
        const a = Math.atan2(plan.y - from.y, plan.x - from.x), d = Math.min(len, Math.hypot(plan.x - from.x, plan.y - from.y));
        const ex = from.x + Math.cos(a) * d, ey = from.y + Math.sin(a) * d;
        g.lineStyle(2, OK, 0.9).lineBetween(from.x, from.y, ex, ey);
        g.fillStyle(OK, 0.3).fillCircle(ex, ey, 10).lineStyle(2, OK, 0.9).strokeCircle(ex, ey, 10);
      }
      return;
    }
    if (aim === "self") return;
    if (range > 0 && aim !== "dir") g.lineStyle(2, col, 0.7).strokeEllipse(from.x, from.y, range * 2, range * 1.2);
    if (rangeOnly || !plan?.ok) return;
    if (aim === "ground") {
      const r = def.area ?? 24;
      g.fillStyle(col, 0.18).fillEllipse(plan.x, plan.y, r * 2, r * 1.2).lineStyle(2, col, 0.9).strokeEllipse(plan.x, plan.y, r * 2, r * 1.2);
    } else if (aim === "dir") {
      const len = range > 0 ? range : 300;
      const a = Math.atan2(plan.y - from.y, plan.x - from.x);
      const ex = from.x + Math.cos(a) * len, ey = from.y + Math.sin(a) * len;
      g.lineStyle(3, col, 0.8).lineBetween(from.x, from.y, ex, ey);
      g.fillStyle(col, 0.5).fillCircle(ex, ey, 5);
    }
  }
}
