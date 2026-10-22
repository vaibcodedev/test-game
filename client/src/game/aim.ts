/**
 * Превью прицела (задача 115, шаг 6; задача 133, шаги 1–2): кольцо дальности вокруг героя и форма умения — ровно та геометрия, по которой решает сервер
 * (shared/skillShape.ts через castAim): круги без сплющивания (сервер мерит Math.hypot) с бледной каймой края попадания, размеры по рангу и пассивкам.
 * Формы: круг (у знамени — яркий удар внутри ауры-обода, у призыва — метка, где он встанет), стена огня — капсула поперёк прицела с 5 метками огня,
 * снаряд — путь до точки или цели и круги прямого попадания и брызг, полоса до препятствия, веер стрел-коридоров (у героя — общий клин, дальше дыры
 * видны), конус, рывок — путь, место приземления и тусклый остаток до курсора, рывок к цели, за спину, притягивание с кругом «Железных цепей»,
 * нова вокруг героя (обод без заливки: на зуме 3 круг шире полкадра). Пути — на уровне груди, площади — по ногам. Красное — там, где сервер откажет:
 * нет прямой видимости, луч в стену, рывок в упор, путь через воду, капкан в городе или на воде, рой без целей; у умений на цель — дальше дальности
 * + радиус цели. Метки — кого заденет (рой, щиты, самонаведение) — только вместе с формой.
 * Вид превью — шаг 3. Режим прицела — mouseOpts.aimMode (UI в настройках, шаг 9).
 */
import { CHEST, fanRays, HIT_EDGE, wallEnds, wallMark, type Placed } from "../../../shared/skillShape";
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
type P = { x: number; y: number };

export class AimPreview {
  private g: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.top - 20);
  }
  clear() { this.g.clear(); }

  /** Круг по ногам: заливка, контур и бледная кайма края попадания (+ радиус цели). */
  private circle(x: number, y: number, r: number, col: number, edge = true) {
    const g = this.g;
    g.fillStyle(col, 0.18).fillCircle(x, y, r).lineStyle(2, col, 0.9).strokeCircle(x, y, r);
    if (edge) g.lineStyle(1, col, 0.35).strokeCircle(x, y, r + HIT_EDGE);
  }
  /** Большой круг без сплошной заливки (нова у героя, аура знамени): на зуме 3 он шире половины кадра, и заливка красила бы весь экран —
   *  мягкий обод внутрь от края, контур и (edge) бледная кайма края попадания. */
  private ring(x: number, y: number, r: number, col: number, edge = true) {
    const g = this.g;
    g.lineStyle(8, col, 0.14).strokeCircle(x, y, Math.max(1, r - 4)).lineStyle(2, col, 0.95).strokeCircle(x, y, r);
    if (edge) g.lineStyle(1, col, 0.35).strokeCircle(x, y, r + HIT_EDGE);
  }
  /** Метки «кого заденет»: кольцо у ног. */
  private hitRings(list: readonly { x: number; y: number; r: number }[], col: number) {
    for (const m of list) this.g.lineStyle(1, col, 0.9).strokeCircle(m.x, m.y, m.r + 3);
  }
  /** Капсула вокруг отрезка A–B полушириной hw (стена огня, «Сияние»). */
  private capsule(ax: number, ay: number, bx: number, by: number, hw: number): P[] {
    const t = Math.atan2(by - ay, bx - ax), pts: P[] = [];
    for (let i = 0; i <= 10; i++) { const a = t - Math.PI / 2 + (Math.PI * i) / 10; pts.push({ x: bx + Math.cos(a) * hw, y: by + Math.sin(a) * hw }); }
    for (let i = 0; i <= 10; i++) { const a = t + Math.PI / 2 + (Math.PI * i) / 10; pts.push({ x: ax + Math.cos(a) * hw, y: ay + Math.sin(a) * hw }); }
    return pts;
  }
  /** Прямоугольник от (x, y) по углу a длиной len, полушириной hw. */
  private rect(x: number, y: number, a: number, len: number, hw: number): P[] {
    const c = Math.cos(a), s = Math.sin(a);
    return [{ x: x - s * hw, y: y + c * hw }, { x: x + c * len - s * hw, y: y + s * len + c * hw }, { x: x + c * len + s * hw, y: y + s * len - c * hw }, { x: x + s * hw, y: y - c * hw }];
  }
  private poly(pts: P[], col: number, fill = 0.18, line = 2, alpha = 0.9) {
    if (fill > 0) this.g.fillStyle(col, fill).fillPoints(pts, true);
    this.g.lineStyle(line, col, alpha).strokePoints(pts, true);
  }
  /** Путь на уровне груди: яркая часть до (x1, y1), тусклый остаток до (x2, y2). */
  private path(x0: number, y0: number, x1: number, y1: number, col: number, x2?: number, y2?: number) {
    const g = this.g;
    g.lineStyle(2, col, 0.9).lineBetween(x0, y0 - CHEST, x1, y1 - CHEST);
    if (x2 !== undefined && y2 !== undefined && Math.hypot(x2 - x1, y2 - y1) > 1) g.lineStyle(1, col, 0.3).lineBetween(x1, y1 - CHEST, x2, y2 - CHEST);
  }
  /** Место, где встанет герой или цель: кружок по ногам. */
  private spot(x: number, y: number, col: number, r = 10) {
    this.g.fillStyle(col, 0.3).fillCircle(x, y, r).lineStyle(2, col, 0.9).strokeCircle(x, y, r);
  }

  /**
   * shape — где ляжет умение (castAim; null — плана нет). rangeOnly: только кольцо (наведение на слот, умения на цель); у новы — круг всегда.
   * marks — кого заденет и стоит показать (рой, щиты союзникам, цель самонаведения): кольцо у ног — только вместе с формой.
   */
  draw(def: SkillDef, from: P, plan: CastPlan | null, shape: Placed | null, rangeOnly: boolean, marks: readonly { x: number; y: number; r: number }[] = []) {
    const g = this.g;
    g.clear();
    const range = def.range ?? 0, aim = def.aim ?? "self";
    if (shape?.shape === "nova") {
      // площадное вокруг себя: круг радиуса по рангу у героя — при наведении на слот и при зажатой клавише; без сплошной заливки (ring)
      this.ring(from.x, from.y, shape.r, OK);
      this.hitRings(marks, OK);
      return;
    }
    if (aim === "self") return;
    if (aim === "dash") {
      // кольцо — длина рывка по рангу; путь до места приземления (reachable), тусклый остаток до курсора; красный — сдвиг меньше DASH_MIN
      if (shape && shape.r > 0) g.lineStyle(1, OK, 0.5).strokeCircle(from.x, from.y, shape.r);
      if (!rangeOnly && shape) {
        const col = shape.err ? BAD : OK;
        this.path(from.x, from.y, shape.x, shape.y, col, shape.tx, shape.ty);
        this.spot(shape.x, shape.y, col);
      }
      return;
    }
    // кольцо дальности красное, если сервер откажет «Слишком далеко», цели нет или (умения на цель) откажет по видимости и пути: точку и направление сервер прижимает сам
    const far = !plan ? false : plan.ok ? plan.far : true;
    const unitBad = aim === "unit" && !!shape?.err;
    if (range > 0 && aim !== "dir") g.lineStyle(2, far || unitBad ? BAD : OK, 0.7).strokeCircle(from.x, from.y, range);
    if (!plan?.ok || !shape) return;
    const col = shape.err ? BAD : OK;
    switch (shape.shape) {
      case "leap":
      case "behind":
      case "pull": {
        // рывок к цели и за спину — путь и место приземления (у рывка — тусклый остаток до цели: вода или дерево остановили его у берега — видно, куда
        // хотел и где встанет); притягивание — путь цели к герою; вне дальности — не рисуем (сначала подход)
        if (far) return;
        if (shape.shape === "pull") { this.path(shape.tx, shape.ty, shape.x, shape.y, col); this.spot(shape.x, shape.y, col, 8); }
        else if (shape.shape === "leap") { this.path(from.x, from.y, shape.x, shape.y, col, shape.tx, shape.ty); this.spot(shape.x, shape.y, col); }
        else { this.path(from.x, from.y, shape.x, shape.y, col); this.spot(shape.x, shape.y, col); }
        // всплеск прыжка с «Широким замахом» — у цели; «Железные цепи» — у притянутой цели
        if (shape.r > 0) this.circle(shape.shape === "pull" ? shape.x : shape.tx, shape.shape === "pull" ? shape.y : shape.ty, shape.r, col);
        this.hitRings(marks, col);
        return;
      }
    }
    // наведение на слот: формы нет — и меток нет (иначе кольца висели бы на юнитах у края экрана без круга)
    if (rangeOnly) return;
    this.hitRings(marks, col);
    switch (shape.shape) {
      case "circle": {
        // знамя: аура — обод без сплошной заливки, ярче кольца дальности (2 px, 0,7), удар древка — яркий круг с заливкой;
        // призыв — метка, где встанет (на воде — у берега на линии к герою)
        if (shape.r2 > 0) {
          g.fillStyle(col, 0.06).fillCircle(shape.x, shape.y, shape.r);
          this.ring(shape.x, shape.y, shape.r, col, false);
          this.circle(shape.x, shape.y, shape.r2, col);
        } else this.circle(shape.x, shape.y, shape.r, col);
        if (Math.hypot(shape.sx - shape.x, shape.sy - shape.y) > 1) {
          g.lineStyle(1, col, 0.5).lineBetween(shape.x, shape.y, shape.sx, shape.sy);
          this.spot(shape.sx, shape.sy, col, 8);
        }
        return;
      }
      case "wall": {
        // капсула ±w вокруг отрезка поперёк прицела, кайма + радиус цели, 5 меток огня
        const e = wallEnds(shape.x, shape.y, shape.a, shape.len);
        this.poly(this.capsule(e.ax, e.ay, e.bx, e.by, shape.w), col);
        this.poly(this.capsule(e.ax, e.ay, e.bx, e.by, shape.w + HIT_EDGE), col, 0, 1, 0.35);
        for (let i = 0; i < 5; i++) { const q = wallMark(shape.x, shape.y, shape.a, shape.len, i); g.fillStyle(col, 0.9).fillCircle(q.x, q.y, 3); }
        return;
      }
      case "bolt": {
        // путь снаряда до точки взрыва (или цели), круги прямого попадания и брызг
        this.path(from.x, from.y, shape.x, shape.y, col);
        if (shape.r > 0) this.circle(shape.x, shape.y, shape.r, col);
        if (shape.r2 > 0) g.lineStyle(2, col, 0.9).strokeCircle(shape.x, shape.y, shape.r2);
        return;
      }
      case "band": {
        // полоса нужной ширины до серверной точки (у стрелы и топора — до стены, у «Сияния» — до препятствия), кайма + радиус цели
        if (shape.cap) {
          this.poly(this.capsule(from.x, from.y, shape.x, shape.y, shape.w), col);
          this.poly(this.capsule(from.x, from.y, shape.x, shape.y, shape.w + HIT_EDGE), col, 0, 1, 0.35);
        } else {
          this.poly(this.rect(from.x, from.y, shape.a, shape.len, shape.w), col);
          this.poly(this.rect(from.x, from.y, shape.a, shape.len + HIT_EDGE, shape.w + HIT_EDGE), col, 0, 1, 0.35);
        }
        g.fillStyle(col, 0.6).fillCircle(shape.x, shape.y, 3);
        return;
      }
      case "fan": {
        // стрелы — коридоры ±w (кайма + радиус цели). У героя коридоры сливаются — там один общий клин (заливка и внешние края, без штриховки
        // из 2n контуров); дальше, где края соседних коридоров пересекаются (d0 = w / tg(шаг/2) по лучу), — каждая стрела отдельно, дыры
        // между ними видны. Кайма — так же: общая по внешним краям до d1, где расходятся каймы, дальше — у каждой стрелы
        const rays = fanRays(shape), n = rays.length, R = shape.r, w = shape.w, k = w + HIT_EDGE;
        const step = n > 1 ? shape.arc / (n - 1) : 0;
        const apart = (hw: number) => (step > 0 ? Math.min(R, hw / Math.tan(Math.min(step, Math.PI / 2) / 2)) : R);
        const d0 = apart(w), d1 = apart(k), a0 = rays[0], a1 = rays[n - 1];
        // точка на луче a в d от героя со сдвигом поперёк hw (side −1 — к меньшему углу, +1 — к большему)
        const pt = (a: number, d: number, side: number, hw: number): P => ({ x: from.x + Math.cos(a) * d - Math.sin(a) * hw * side, y: from.y + Math.sin(a) * d + Math.cos(a) * hw * side });
        // клин: от героя по внешнему краю первой стрелы, по началам коридоров (в d0 углы соседей совпадают) и назад по краю последней
        const ends = d0 < R ? rays.flatMap((a) => [pt(a, d0, -1, w), pt(a, d0, 1, w)]) : [pt(a0, R, -1, w), pt(a1, R, 1, w)];
        g.fillStyle(col, 0.14).fillPoints([pt(a0, 0, -1, w), ...ends, pt(a1, 0, 1, w)], true);
        g.lineStyle(1, col, 0.8).strokePoints([pt(a0, 0, -1, w), pt(a0, d0, -1, w)]).strokePoints([pt(a1, 0, 1, w), pt(a1, d0, 1, w)]);
        if (d0 < R) {
          for (const a of rays) {
            const q = [pt(a, d0, -1, w), pt(a, R, -1, w), pt(a, R, 1, w), pt(a, d0, 1, w)];
            g.fillStyle(col, 0.14).fillPoints(q, true);
            g.lineStyle(1, col, 0.8).strokePoints(q, false);
          }
        } else g.lineStyle(1, col, 0.8).strokePoints([pt(a0, R, -1, w), pt(a1, R, 1, w)]);
        g.lineStyle(1, col, 0.3).strokePoints([pt(a0, 0, -1, k), pt(a0, d1, -1, k)]).strokePoints([pt(a1, 0, 1, k), pt(a1, d1, 1, k)]);
        if (d1 < R) for (const a of rays) g.strokePoints([pt(a, d1, -1, k), pt(a, R, -1, k), pt(a, R, 1, k), pt(a, d1, 1, k)], false);
        else g.strokePoints([pt(a0, R, -1, k), pt(a1, R, 1, k)]);
        return;
      }
      case "cone": {
        // сектор ±раствор/2 радиуса дальности (как tele-конус в effects.ts), кайма + радиус цели
        const a0 = shape.a - shape.arc / 2, a1 = shape.a + shape.arc / 2;
        g.fillStyle(col, 0.18).slice(from.x, from.y, shape.r, a0, a1, false).fillPath();
        g.lineStyle(2, col, 0.9).slice(from.x, from.y, shape.r, a0, a1, false).strokePath();
        g.lineStyle(1, col, 0.35).beginPath().arc(from.x, from.y, shape.r + HIT_EDGE, a0, a1, false).strokePath();
        return;
      }
    }
  }
}
