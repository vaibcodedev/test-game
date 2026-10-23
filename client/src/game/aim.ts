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
export type AimLook = "cur" | "A" | "B" | "C";
type Elem = "fire" | "ice" | "light" | "dark" | "poison" | "steel";
const ELEM_COL: Record<Elem, number> = { fire: 0xff8a3c, ice: 0x8fd8ff, light: 0xfff0a0, dark: 0xb888ff, poison: 0x86e05a, steel: 0xd0dae6 };
/** Стихия умения по id и классу (вид C). */
function elemOf(def: SkillDef): Elem {
  const id = def.id;
  if (/frost|ice|blizz|glac|freez/.test(id)) return "ice";
  if (/fire|meteor|flame|burn|inferno|pyro/.test(id)) return "fire";
  if (id.startsWith("cl_") || /heal|holy|light|aegis|radiance/.test(id)) return "light";
  if (def.cls === "warlock" || def.cls === "deathknight" || def.cls === "darkranger") return "dark";
  if (def.cls === "mage") return "fire";
  if (def.cls === "rogue" || /trap|venom|poison|hex/.test(id)) return "poison";
  return "steel";
}
type P = { x: number; y: number };

export class AimPreview {
  private g: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.top - 20);
    this.txt = scene.add.text(0, 0, "", { fontFamily: "Rubik, sans-serif", fontSize: "11px", color: "#ff8a8a", stroke: "#1a0808", strokeThickness: 3 })
      .setOrigin(0.5, 0).setDepth(DEPTH.top - 19).setVisible(false);
  }
  clear() { this.g.clear(); this.txt.setVisible(false); }

  /** Пульс 0..1 с плавным easing (синус по времени сцены, период 1,4 с). */
  private pulse(): number { return 0.5 - 0.5 * Math.cos((this.scene.time.now / 1400) * Math.PI * 2); }
  /** Пунктирная дуга: штрихи dash px через gap px; off — сдвиг в px (медленный бег). */
  private dashArc(x: number, y: number, r: number, a0: number, a1: number, dash: number, gap: number, off: number) {
    const g = this.g, R = Math.max(r, 1), step = (dash + gap) / R, len = dash / R;
    for (let a = a0 + (off % (dash + gap)) / R; a < a1; a += step) g.beginPath().arc(Math.round(x), Math.round(y), r, a, Math.min(a + len, a1), false).strokePath();
  }
  /** Кольцо дальности: тонкий пунктир с мягким свечением, медленно бежит, 4 засечки по сторонам света; не мешает. */
  private rangeRingCur(x: number, y: number, r: number, col: number) {
    const g = this.g, t = this.scene.time.now;
    g.lineStyle(3, 0x000000, 0.4).strokeCircle(x, y, r);
    g.lineStyle(5, col, 0.1).strokeCircle(x, y, r);
    g.lineStyle(1, col, 0.3).strokeCircle(x, y, r);
    g.lineStyle(1, col, 0.85);
    this.dashArc(x, y, r, 0, Math.PI * 2, 6, 6, (t / 60) % 12);
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; g.fillStyle(col, 0.9).fillRect(Math.round(x + Math.cos(a) * r) - 1, Math.round(y + Math.sin(a) * r) - 1, 3, 3); }
  }
  /** Круг по ногам: лёгкая заливка, внутренний градиент от обода (3 ступени), пульс обода, кайма края попадания. */
  private circleCur(x: number, y: number, r: number, col: number, edge = true) {
    const g = this.g, p = this.pulse();
    g.fillStyle(col, 0.06).fillCircle(x, y, r);
    for (let i = 0; i < 3; i++) { const k = 2 + i * 3; if (r - k > 3) g.lineStyle(3, col, 0.2 - i * 0.06).strokeCircle(x, y, r - k); }
    g.lineStyle(2, col, 0.7 + 0.25 * p).strokeCircle(x, y, r);
    g.lineStyle(1, col, 0.12 + 0.2 * p).strokeCircle(x, y, r + 2 + Math.round(p * 2));
    if (edge) g.lineStyle(1, col, 0.3).strokeCircle(x, y, r + HIT_EDGE);
  }
  /** Большой круг без сплошной заливки (нова у героя, аура знамени): на зуме 3 он шире половины кадра — мягкий обод внутрь, контур, пунктир каймы. */
  private ringCur(x: number, y: number, r: number, col: number, edge = true) {
    const g = this.g, p = this.pulse();
    g.lineStyle(10, col, 0.05).strokeCircle(x, y, Math.max(1, r - 5)).lineStyle(4, col, 0.1).strokeCircle(x, y, Math.max(1, r - 2));
    g.lineStyle(2, col, 0.75 + 0.2 * p).strokeCircle(x, y, r);
    if (edge) { g.lineStyle(1, col, 0.35); this.dashArc(x, y, r + HIT_EDGE, 0, Math.PI * 2, 4, 4, 0); }
  }
  /** Метки «кого заденет»: кольцо у ног с четырьмя засечками. */
  private hitRings(list: readonly { x: number; y: number; r: number }[], col: number) {
    for (const m of list) {
      this.g.lineStyle(1, col, 0.35).strokeCircle(m.x, m.y, m.r + 4);
      this.g.lineStyle(2, col, 0.95);
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; this.g.beginPath().arc(m.x, m.y, m.r + 3, a - 0.3, a + 0.3, false).strokePath(); }
    }
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
  /** Контур зоны: лёгкая заливка, мягкое свечение обода, чёткий обод с пульсом яркости. */
  private polyCur(pts: P[], col: number, fill = 0.12, line = 2, alpha = 0.9) {
    const p = line > 1 ? this.pulse() : 0;
    if (fill > 0) this.g.fillStyle(col, fill).fillPoints(pts, true);
    if (line > 1) this.g.lineStyle(5, col, 0.08).strokePoints(pts, true);
    this.g.lineStyle(line, col, line > 1 ? alpha - 0.15 + 0.15 * p : alpha).strokePoints(pts, true);
  }
  /** Линия из бегущих точек: к концу точки крупнее (сужение от узкого к широкому), на конце — стрелка. */
  private dots(x0: number, y0: number, x1: number, y1: number, col: number, alpha: number, arrow: boolean) {
    const g = this.g, len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 2) return;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len, t = this.scene.time.now, n = Math.floor(len / 9);
    g.lineStyle(1, col, alpha * 0.35).lineBetween(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1));
    for (let i = 0; i <= n; i++) {
      const d = Math.min(len, i * 9 + ((t / 90) % 9)), k = d / len, sz = k > 0.66 ? 3 : k > 0.33 ? 2 : 1;
      g.fillStyle(col, alpha * (0.45 + 0.55 * k)).fillRect(Math.round(x0 + ux * d) - (sz >> 1), Math.round(y0 + uy * d) - (sz >> 1), sz, sz);
    }
    if (arrow && len > 14) {
      const bx = x1 - ux * 7, by = y1 - uy * 7;
      g.fillStyle(col, alpha).fillTriangle(Math.round(x1), Math.round(y1), Math.round(bx - uy * 4), Math.round(by + ux * 4), Math.round(bx + uy * 4), Math.round(by - ux * 4));
    }
  }
  /** Путь на уровне груди: яркая точечная траектория со стрелкой до (x1, y1), тусклый остаток до (x2, y2). */
  private pathCur(x0: number, y0: number, x1: number, y1: number, col: number, x2?: number, y2?: number) {
    this.dots(x0, y0 - CHEST, x1, y1 - CHEST, col, 0.95, true);
    if (x2 !== undefined && y2 !== undefined && Math.hypot(x2 - x1, y2 - y1) > 1) this.dots(x1, y1 - CHEST, x2, y2 - CHEST, col, 0.3, false);
  }
  /** Место, где встанет герой или цель: кружок по ногам с крестом. */
  private spotCur(x: number, y: number, col: number, r = 10) {
    const g = this.g, p = this.pulse();
    g.fillStyle(col, 0.2).fillCircle(x, y, r).lineStyle(2, col, 0.75 + 0.2 * p).strokeCircle(x, y, r);
    g.lineStyle(1, col, 0.8).lineBetween(x - 3, y, x + 3, y).lineBetween(x, y - 3, x, y + 3);
  }

  // ---- Варианты вида (просьба пользователя «намного красивее»): window.__aimLook = "A" | "B" | "C", по умолчанию текущий ("cur") ----
  private look: AimLook = "cur";
  private ec = OK;
  private tone(col: number): number { return col !== OK ? col : this.look === "C" ? this.ec : this.look === "B" ? 0xeef4ff : OK; }
  private get t(): number { return this.scene.time.now; }
  /** Подложка под тонкую линию: тёмный обвод — кольцо видно на тёмном пепле ночью. */
  private under(x: number, y: number, r: number) { this.g.lineStyle(3, 0x000000, 0.4).strokeCircle(Math.round(x), Math.round(y), r); }
  private ticks(x: number, y: number, r: number, col: number, n: number, len: number, rot: number, alpha: number, every = 0, longer = 0) {
    this.g.lineStyle(1, col, alpha);
    for (let i = 0; i < n; i++) {
      const a = rot + (i * Math.PI * 2) / n, l = every && i % every === 0 ? len + longer : len, c = Math.cos(a), s = Math.sin(a);
      this.g.lineBetween(Math.round(x + c * (r - l)), Math.round(y + s * (r - l)), Math.round(x + c * r), Math.round(y + s * r));
    }
  }
  /** Искры по ободу: бегут по кругу с коротким хвостом. */
  private sparks(x: number, y: number, r: number, col: number, n = 5, dir = 1) {
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
      const a = dir * (this.t / 2200) * Math.PI * 2 + (i * Math.PI * 2) / n - dir * k * 0.07, sz = k === 0 ? 2 : 1;
      this.g.fillStyle(col, 0.95 - k * 0.22).fillRect(Math.round(x + Math.cos(a) * r) - (sz >> 1), Math.round(y + Math.sin(a) * r) - (sz >> 1), sz, sz);
    }
  }
  /** Узор стихии по ободу: огонь — язычки, лёд — шипы, свет — лучи, тьма — завитки внутрь, яд — пузыри, сталь — скобы. */
  private ornament(x: number, y: number, r: number, col: number, n: number, el: Elem) {
    const g = this.g, t = this.t;
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n + (el === "dark" ? -t / 5000 : el === "steel" ? 0 : t / 9000), c = Math.cos(a), s = Math.sin(a);
      const px = (d: number) => Math.round(x + c * d), py = (d: number) => Math.round(y + s * d);
      if (el === "fire") { const h = 4 + 3 * Math.sin(t / 110 + i * 1.7), w = 0.09; g.fillStyle(col, 0.85).fillTriangle(px(r), py(r), Math.round(x + Math.cos(a - w) * (r - 1)), Math.round(y + Math.sin(a - w) * (r - 1)), px(r + h), py(r + h)); }
      else if (el === "ice") { g.lineStyle(1, col, 0.9).lineBetween(px(r - 2), py(r - 2), px(r + 5), py(r + 5)); g.lineBetween(px(r + 2) - s * 2, py(r + 2) + c * 2, px(r + 2) + s * 2, py(r + 2) - c * 2); }
      else if (el === "light") { const l = i % 2 ? 3 : 7; g.lineStyle(1, col, 0.9).lineBetween(px(r + 2), py(r + 2), px(r + 2 + l), py(r + 2 + l)); }
      else if (el === "dark") { g.lineStyle(1, col, 0.85).beginPath().arc(x, y, r - 3, a, a + 0.28, false).strokePath(); g.fillStyle(col, 0.9).fillRect(px(r + 3), py(r + 3), 1, 1); }
      else if (el === "poison") { g.lineStyle(1, col, 0.4 + 0.5 * Math.abs(Math.sin(t / 600 + i))).strokeCircle(px(r + 3 + Math.round(Math.sin(t / 500 + i))), py(r + 3), 2); }
      else g.fillStyle(col, 0.95).fillRect(px(r) - 1, py(r) - 1, 3, 3);
    }
  }
  /** Точки вдоль ломаной (пунктир 1 px): B — тонкий контур. */
  private dotted(pts: P[], col: number, alpha: number, step = 4) {
    let carry = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = carry; d < len; d += step) this.g.fillStyle(col, alpha).fillRect(Math.round(a.x + ((b.x - a.x) * d) / len), Math.round(a.y + ((b.y - a.y) * d) / len), 1, 1);
      carry = ((carry - len) % step + step) % step;
    }
  }
  /** Точка на ломаной по доле периметра. */
  private along(pts: P[], f: number): P {
    const segs = pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return Math.hypot(b.x - a.x, b.y - a.y); }), tot = segs.reduce((s, v) => s + v, 0);
    let d = (((f % 1) + 1) % 1) * tot;
    for (let i = 0; i < segs.length; i++) { if (d <= segs[i]) { const a = pts[i], b = pts[(i + 1) % pts.length], k = segs[i] ? d / segs[i] : 0; return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }; } d -= segs[i]; }
    return pts[0];
  }

  private rangeRing(x: number, y: number, r: number, col: number) {
    col = this.tone(col);
    const g = this.g, t = this.t;
    if (this.look === "cur") return this.rangeRingCur(x, y, r, col);
    this.under(x, y, r);
    if (this.look === "A") {
      g.lineStyle(7, col, 0.08).strokeCircle(x, y, r);
      g.lineStyle(1, col, 0.9).strokeCircle(x, y, r);
      g.lineStyle(1, col, 0.45).strokeCircle(x, y, r - 4);
      this.ticks(x, y, r, col, Math.max(24, Math.round(r / 5)), 3, t / 12000, 0.8, 6, 3);
    } else if (this.look === "B") {
      g.lineStyle(1, col, 1);
      this.dashArc(x, y, r, 0, Math.PI * 2, 8, 5, 0);
    } else {
      g.lineStyle(1, col, 0.35).strokeCircle(x, y, r);
      g.lineStyle(1, col, 0.95);
      this.dashArc(x, y, r, 0, Math.PI * 2, 4, 6, (t / 80) % 10);
      this.sparks(x, y, r, col, 6);
    }
  }
  private zone(x: number, y: number, r: number, col: number, edge: boolean, fill: boolean) {
    const g = this.g, t = this.t, p = this.pulse();
    if (this.look === "A") {
      if (fill) g.fillStyle(col, 0.08).fillCircle(x, y, r);
      g.lineStyle(8, col, 0.07).strokeCircle(x, y, r - 3);
      g.lineStyle(2, col, 0.75 + 0.2 * p).strokeCircle(x, y, r);
      g.lineStyle(1, col, 0.6).strokeCircle(x, y, r - 5);
      this.ticks(x, y, r - 1, col, Math.max(16, Math.round(r / 4)), 3, -t / 6000, 0.9, 4, 2);
      if (r > 24) this.ticks(x, y, r - 5, col, 8, 5, t / 5000, 0.45);
      if (edge) g.lineStyle(1, col, 0.3).strokeCircle(x, y, r + HIT_EDGE);
    } else if (this.look === "B") {
      g.lineStyle(1, col, 0.95).strokeCircle(x, y, r);
      if (fill) { g.lineStyle(1, col, 0.4); this.dashArc(x, y, r - 3, 0, Math.PI * 2, 1, 1, 0); g.lineStyle(1, col, 0.28); if (r > 8) this.dashArc(x, y, r - 6, 0, Math.PI * 2, 1, 2, 1); g.lineStyle(1, col, 0.18); if (r > 12) this.dashArc(x, y, r - 9, 0, Math.PI * 2, 1, 3, 2); }
      if (edge) { g.lineStyle(1, col, 0.35); this.dashArc(x, y, r + HIT_EDGE, 0, Math.PI * 2, 2, 4, 0); }
    } else {
      if (fill) g.fillStyle(col, 0.05).fillCircle(x, y, r);
      for (let i = 0; i < 3; i++) if (r - 2 - i * 3 > 3) g.lineStyle(3, col, 0.17 - i * 0.05).strokeCircle(x, y, r - 2 - i * 3);
      g.lineStyle(2, col, 0.8 + 0.15 * p).strokeCircle(x, y, r);
      this.ornament(x, y, r, col, Math.max(10, Math.min(28, Math.round(r / 5))), this.el);
      this.sparks(x, y, r + 1, col, 4, -1);
      if (edge) g.lineStyle(1, col, 0.28).strokeCircle(x, y, r + HIT_EDGE);
    }
  }
  private circle(x: number, y: number, r: number, col: number, edge = true) {
    col = this.tone(col);
    if (this.look === "cur") return this.circleCur(x, y, r, col, edge);
    this.zone(x, y, r, col, edge, true);
  }
  private ring(x: number, y: number, r: number, col: number, edge = true) {
    col = this.tone(col);
    if (this.look === "cur") return this.ringCur(x, y, r, col, edge);
    this.zone(x, y, r, col, edge, false);
  }
  private poly(pts: P[], col: number, fill = 0.12, line = 2, alpha = 0.9) {
    col = this.tone(col);
    if (this.look === "cur" || line <= 1) {
      if (this.look === "B" && line <= 1) return this.dotted(pts, col, alpha, 3);
      return this.polyCur(pts, col, fill, line, alpha);
    }
    const g = this.g, t = this.t;
    if (this.look === "A") {
      g.fillStyle(col, 0.09).fillPoints(pts, true);
      g.lineStyle(8, col, 0.07).strokePoints(pts, true);
      g.lineStyle(2, col, 0.85).strokePoints(pts, true);
      for (let i = 0; i < pts.length; i += 4) g.fillStyle(col, 0.95).fillRect(Math.round(pts[i].x) - 2, Math.round(pts[i].y) - 2, 4, 4).fillStyle(0x000000, 0.5).fillRect(Math.round(pts[i].x) - 1, Math.round(pts[i].y) - 1, 2, 2);
    } else if (this.look === "B") {
      g.fillStyle(col, 0.05).fillPoints(pts, true);
      this.dotted(pts, col, 1, 3);
    } else {
      g.fillStyle(col, 0.08).fillPoints(pts, true);
      g.lineStyle(5, col, 0.08).strokePoints(pts, true);
      g.lineStyle(2, col, 0.85).strokePoints(pts, true);
      for (let i = 0; i < 7; i++) for (let k = 0; k < 3; k++) { const q = this.along(pts, t / 3500 + i / 7 - k * 0.006); g.fillStyle(col, 0.95 - k * 0.3).fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3 - k, 3 - k); }
    }
  }
  private path(x0: number, y0: number, x1: number, y1: number, col: number, x2?: number, y2?: number) {
    col = this.tone(col);
    if (this.look === "cur") return this.pathCur(x0, y0, x1, y1, col, x2, y2);
    const g = this.g, len = Math.hypot(x1 - x0, y1 - y0 + 0), ay = y0 - CHEST, by = y1 - CHEST, L = Math.hypot(x1 - x0, by - ay);
    void len;
    if (L < 2) return;
    const ux = (x1 - x0) / L, uy = (by - ay) / L, t = this.t;
    const at = (d: number) => ({ x: Math.round(x0 + ux * d), y: Math.round(ay + uy * d) });
    if (this.look === "A") {
      g.lineStyle(5, col, 0.08).lineBetween(Math.round(x0), Math.round(ay), Math.round(x1), Math.round(by));
      g.lineStyle(1, col, 0.55).lineBetween(Math.round(x0), Math.round(ay), Math.round(x1), Math.round(by));
      for (let d = (t / 70) % 12; d < L; d += 12) { const q = at(d); g.fillStyle(col, 0.9).fillPoints([{ x: q.x, y: q.y - 2 }, { x: q.x + 2, y: q.y }, { x: q.x, y: q.y + 2 }, { x: q.x - 2, y: q.y }], true); }
      const e = at(L); g.lineStyle(1, col, 0.9).strokeCircle(e.x, e.y, 5).strokeCircle(e.x, e.y, 2);
    } else if (this.look === "B") {
      g.fillStyle(col, 1);
      for (let d = 4; d < L; d += 6) { const q = at(d); g.fillRect(q.x, q.y, 1, 1); }
      const e = at(L); g.lineStyle(1, col, 1).lineBetween(e.x - 3, e.y, e.x + 3, e.y).lineBetween(e.x, e.y - 3, e.x, e.y + 3);
    } else {
      // комета: шлейф кругов сужается к герою, яркая искра у цели бежит по пути
      for (let d = L; d > 0; d -= 4) { const k = d / L, q = at(d); g.fillStyle(col, 0.12 + 0.6 * k).fillCircle(q.x, q.y, Math.max(0.6, 0.6 + 2.4 * k)); }
      const q = at(((t / 900) % 1) * L); g.fillStyle(0xffffff, 0.9).fillRect(q.x - 1, q.y - 1, 2, 2);
    }
    if (x2 !== undefined && y2 !== undefined && Math.hypot(x2 - x1, y2 - y1) > 1) this.dots(x1, y1 - CHEST, x2, y2 - CHEST, col, 0.3, false);
  }
  private spot(x: number, y: number, col: number, r = 10) {
    col = this.tone(col);
    if (this.look === "cur") return this.spotCur(x, y, col, r);
    const g = this.g;
    if (this.look === "A") { g.lineStyle(1, col, 0.9).strokeCircle(x, y, r).strokeCircle(x, y, r - 3); g.fillStyle(col, 0.95).fillPoints([{ x, y: y - 3 }, { x: x + 3, y }, { x, y: y + 3 }, { x: x - 3, y }], true); this.ticks(x, y, r, col, 8, 3, this.t / 4000, 0.9); }
    else if (this.look === "B") { g.lineStyle(1, col, 1).strokeCircle(x, y, r); g.fillStyle(col, 1).fillRect(x - 1, y - 1, 3, 3); }
    else { g.fillStyle(col, 0.18).fillCircle(x, y, r).lineStyle(2, col, 0.9).strokeCircle(x, y, r); this.ornament(x, y, r, col, 8, this.el); }
  }
  /** Красный крест в точке отказа (варианты A–C). */
  private cross(x: number, y: number) {
    const g = this.g;
    g.lineStyle(3, 0x000000, 0.5).lineBetween(x - 5, y - 5, x + 5, y + 5).lineBetween(x - 5, y + 5, x + 5, y - 5);
    g.lineStyle(2, BAD, 1).lineBetween(x - 5, y - 5, x + 5, y + 5).lineBetween(x - 5, y + 5, x + 5, y - 5);
  }
  private el: Elem = "steel";

  /**
   * shape — где ляжет умение (castAim; null — плана нет). rangeOnly: только кольцо (наведение на слот, умения на цель); у новы — круг всегда.
   * marks — кого заденет и стоит показать (рой, щиты союзникам, цель самонаведения): кольцо у ног — только вместе с формой.
   */
  draw(def: SkillDef, from: P, plan: CastPlan | null, shape: Placed | null, rangeOnly: boolean, marks: readonly { x: number; y: number; r: number }[] = []) {
    const lk = (globalThis as { __aimLook?: string }).__aimLook;
    this.look = lk === "A" || lk === "B" || lk === "C" ? lk : "cur";
    this.el = elemOf(def); this.ec = ELEM_COL[this.el];
    this.g.clear();
    this.body(def, from, plan, shape, rangeOnly, marks);
    // отказ — подпись причины у точки (текст из shape.err)
    if (shape?.err && plan?.ok && !rangeOnly) {
      const z = this.scene.cameras.main.zoom || 1;
      if (this.look !== "cur") this.cross(Math.round(shape.x), Math.round(shape.y));
      this.txt.setText(shape.err).setScale(1 / z).setPosition(Math.round(shape.x), Math.round(shape.y + 16 / z + 2)).setVisible(true);
    } else this.txt.setVisible(false);
  }
  private body(def: SkillDef, from: P, plan: CastPlan | null, shape: Placed | null, rangeOnly: boolean, marks: readonly { x: number; y: number; r: number }[]) {
    const g = this.g;
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
      if (shape && shape.r > 0) this.rangeRing(from.x, from.y, shape.r, OK);
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
    if (range > 0 && aim !== "dir") this.rangeRing(from.x, from.y, range, far || unitBad ? BAD : OK);
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
        if (this.look !== "cur") {
          const cp: P[] = [{ x: from.x, y: from.y }];
          for (let i = 0; i <= 16; i++) { const a = a0 + ((a1 - a0) * i) / 16; cp.push({ x: from.x + Math.cos(a) * shape.r, y: from.y + Math.sin(a) * shape.r }); }
          this.poly(cp, col);
          const kp: P[] = [];
          for (let i = 0; i <= 16; i++) { const a = a0 + ((a1 - a0) * i) / 16; kp.push({ x: from.x + Math.cos(a) * (shape.r + HIT_EDGE), y: from.y + Math.sin(a) * (shape.r + HIT_EDGE) }); }
          g.lineStyle(1, this.tone(col), 0.3).strokePoints(kp, false);
          return;
        }
        g.fillStyle(col, 0.18).slice(from.x, from.y, shape.r, a0, a1, false).fillPath();
        g.lineStyle(2, col, 0.9).slice(from.x, from.y, shape.r, a0, a1, false).strokePath();
        g.lineStyle(1, col, 0.35).beginPath().arc(from.x, from.y, shape.r + HIT_EDGE, a0, a1, false).strokePath();
        return;
      }
    }
  }
}
