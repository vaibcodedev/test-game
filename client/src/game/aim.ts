/**
 * Превью прицела (задача 115, шаг 6; задача 133, шаги 1–3): кольцо дальности вокруг героя и форма умения — ровно та геометрия, по которой решает сервер
 * (shared/skillShape.ts через castAim): круги без сплющивания (сервер мерит Math.hypot) с бледной каймой края попадания, размеры по рангу и пассивкам.
 * Формы: круг (у знамени — яркий удар внутри ауры-обода, у призыва — метка, где он встанет), стена огня — капсула поперёк прицела с 5 метками огня,
 * снаряд — путь до точки или цели и круги прямого попадания и брызг, полоса до препятствия, веер стрел-коридоров (у героя — общий клин, дальше дыры
 * видны), конус, рывок — путь, место приземления и тусклый остаток до курсора, рывок к цели, за спину, притягивание с кругом «Железных цепей»,
 * нова вокруг героя (обод без заливки: на зуме 3 круг шире полкадра). Красное — там, где сервер откажет (крест и подпись причины):
 * нет прямой видимости, луч в стену, рывок в упор, путь через воду, капкан в городе или на воде, рой без целей; у умений на цель — дальше дальности
 * + радиус цели. Метки — кого заденет (рой, щиты, самонаведение) — только вместе с формой.
 * Вид (шаг 3, выбор пользователя): цвет и узор по стихии умения, искры по ободу — с тонкими обводами 1–2 px, пунктиром дальности и точками траектории.
 * Центр тела: пути, метки «кого заденет» и снаряд в юнита рисуются от середины его спрайта (сервер мерит от ног — геометрия та же, сдвиг только
 * по экрану); площади на земле — по ногам. Режим прицела — mouseOpts.aimMode (UI в настройках, шаг 9).
 */
import { CHEST, fanRays, HIT_EDGE, wallEnds, wallMark, type Placed } from "../../../shared/skillShape";
import type { SkillDef } from "../../../shared/skills";
import type { CastPlan } from "./castResolve";
import { mouseOpts } from "./keybinds";
import { DEPTH } from "./terrain";

const OK = 0xfff0a0, BAD = 0xff4040;
type Elem = "fire" | "ice" | "light" | "dark" | "poison" | "steel";
const ELEM_COL: Record<Elem, number> = { fire: 0xff8a3c, ice: 0x8fd8ff, light: 0xfff0a0, dark: 0xb888ff, poison: 0x86e05a, steel: 0xd0dae6 };
/** Стихия умения по id и классу. */
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
/** Вид юнита сцены (GameScene.units → UnitView): ноги и спрайт — для центра тела. */
type BodyView = { x: number; y: number; dead?: boolean; sprite?: Phaser.GameObjects.Sprite };

export class AimPreview {
  private g: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  private col = OK;
  private el: Elem = "steel";
  /** Середина непрозрачных строк кадра 0 по текстуре: { c — строка центра, h — высота кадра }. */
  private rows = new Map<string, { c: number; h: number } | null>();
  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.top - 20);
    this.txt = scene.add.text(0, 0, "", { fontFamily: "Rubik, sans-serif", fontSize: "11px", color: "#ff8a8a", stroke: "#1a0808", strokeThickness: 3 })
      .setOrigin(0.5, 0).setDepth(DEPTH.top - 19).setVisible(false);
  }
  clear() { this.g.clear(); this.txt.setVisible(false); }

  // ---- центр тела ----
  private bodyRows(sp: Phaser.GameObjects.Sprite): { c: number; h: number } | null {
    const key = sp.texture.key;
    let r = this.rows.get(key);
    if (r !== undefined) return r;
    r = null;
    const fr = sp.texture.get(0), tx = this.scene.textures, w = fr.width, h = fr.height;
    const solid = (y: number) => { for (let x = 0; x < w; x += 1) { const a = tx.getPixelAlpha(x, y, key, 0); if (a !== null && a > 40) return true; } return false; };
    let y0 = 0, y1 = h - 1;
    while (y0 < h && !solid(y0)) y0++;
    while (y1 > y0 && !solid(y1)) y1--;
    if (y0 < h) r = { c: (y0 + y1 + 1) / 2, h };
    this.rows.set(key, r);
    return r;
  }
  /** На сколько px выше ног середина тела юнита, стоящего в (x, y) (в 8 px); null — юнита там нет (точка на земле). */
  private bodyLift(x: number, y: number): number | null {
    const units = (this.scene as unknown as { units?: Map<string, BodyView> }).units;
    if (!units) return null;
    let best: BodyView | null = null, bd = 8;
    for (const v of units.values()) { if (v.dead || !v.sprite) continue; const d = Math.hypot(v.x - x, v.y - y); if (d < bd) { bd = d; best = v; } }
    if (!best?.sprite) return null;
    const sp = best.sprite, r = this.bodyRows(sp);
    if (!r) return CHEST;
    const sy = Math.abs(sp.scaleY) || 1;
    // спрайт поднят над ногами (верхом на ездовом) — учесть; дыхание (1–2 px) — нет, иначе метки дрожали бы
    const dy = Math.abs(sp.y - best.y) > 3 ? best.y - sp.y : 0;
    return Math.round((sp.originY * r.h - r.c) * sy + dy);
  }

  // ---- примитивы ----
  /** Пульс 0..1 с плавным easing (синус по времени сцены, период 1,4 с). */
  private pulse(): number { return 0.5 - 0.5 * Math.cos((this.scene.time.now / 1400) * Math.PI * 2); }
  private get t(): number { return this.scene.time.now; }
  /** Цвет: OK — цвет стихии умения, отказ — красный. */
  private tone(col: number): number { return col === OK ? this.col : col; }
  /** Пунктирная дуга: штрихи dash px через gap px; off — сдвиг в px (медленный бег). */
  private dashArc(x: number, y: number, r: number, a0: number, a1: number, dash: number, gap: number, off: number) {
    const g = this.g, R = Math.max(r, 1), step = (dash + gap) / R, len = dash / R;
    for (let a = a0 + (off % (dash + gap)) / R; a < a1; a += step) g.beginPath().arc(Math.round(x), Math.round(y), r, a, Math.min(a + len, a1), false).strokePath();
  }
  /** Тёмная подложка под тонкую линию: видно на пепле и ночью. */
  private under(x: number, y: number, r: number) { this.g.lineStyle(3, 0x000000, 0.35).strokeCircle(Math.round(x), Math.round(y), r); }
  /** Засечки по ободу (из «печати»): n штрихов внутрь длиной len, медленный поворот. */
  private ticks(x: number, y: number, r: number, col: number, n: number, len: number, rot: number, alpha: number) {
    this.g.lineStyle(1, col, alpha);
    for (let i = 0; i < n; i++) {
      const a = rot + (i * Math.PI * 2) / n, c = Math.cos(a), s = Math.sin(a);
      this.g.lineBetween(Math.round(x + c * (r - len)), Math.round(y + s * (r - len)), Math.round(x + c * r), Math.round(y + s * r));
    }
  }
  /** Искры по ободу: бегут по кругу с коротким хвостом. */
  private sparks(x: number, y: number, r: number, col: number, n = 4, dir = 1) {
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
      const a = dir * (this.t / 2400) * Math.PI * 2 + (i * Math.PI * 2) / n - dir * k * 0.06, sz = k === 0 ? 2 : 1;
      this.g.fillStyle(k === 0 ? 0xffffff : col, k === 0 ? 0.9 : 0.8 - k * 0.2).fillRect(Math.round(x + Math.cos(a) * r) - (sz >> 1), Math.round(y + Math.sin(a) * r) - (sz >> 1), sz, sz);
    }
  }
  /** Узор стихии по ободу: огонь — язычки, лёд — шипы, свет — лучи, тьма — завитки внутрь, яд — пузыри, сталь — скобы. */
  private ornament(x: number, y: number, r: number, col: number, n: number) {
    const g = this.g, t = this.t, el = this.el;
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n + (el === "dark" ? -t / 5000 : el === "steel" ? 0 : t / 9000), c = Math.cos(a), s = Math.sin(a);
      const px = (d: number) => Math.round(x + c * d), py = (d: number) => Math.round(y + s * d);
      if (el === "fire") { const h = 3 + 2 * Math.sin(t / 130 + i * 1.7), w = 0.07; g.fillStyle(col, 0.75).fillTriangle(px(r), py(r), Math.round(x + Math.cos(a - w) * r), Math.round(y + Math.sin(a - w) * r), px(r + h), py(r + h)); }
      else if (el === "ice") { g.lineStyle(1, col, 0.85).lineBetween(px(r), py(r), px(r + 4), py(r + 4)); g.lineBetween(px(r + 2) - s * 1.5, py(r + 2) + c * 1.5, px(r + 2) + s * 1.5, py(r + 2) - c * 1.5); }
      else if (el === "light") { const l = i % 2 ? 2 : 5; g.lineStyle(1, col, 0.85).lineBetween(px(r + 2), py(r + 2), px(r + 2 + l), py(r + 2 + l)); }
      else if (el === "dark") { g.lineStyle(1, col, 0.8).beginPath().arc(x, y, r - 3, a, a + 0.22, false).strokePath(); g.fillStyle(col, 0.9).fillRect(px(r + 3), py(r + 3), 1, 1); }
      else if (el === "poison") { g.lineStyle(1, col, 0.35 + 0.45 * Math.abs(Math.sin(t / 600 + i))).strokeCircle(px(r + 3), py(r + 3), 1.5); }
      else g.fillStyle(col, 0.9).fillRect(px(r) - 1, py(r) - 1, 2, 2);
    }
  }
  /** Точки вдоль ломаной (пунктир 1 px) — кайма края попадания у полос и капсул. */
  private dotted(pts: P[], col: number, alpha: number, step = 3) {
    let carry = 0;
    this.g.fillStyle(col, alpha);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = carry; d < len; d += step) this.g.fillRect(Math.round(a.x + ((b.x - a.x) * d) / len), Math.round(a.y + ((b.y - a.y) * d) / len), 1, 1);
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

  // ---- элементы превью ----
  /** Кольцо дальности: тонкий бегущий пунктир цвета стихии на тёмной подложке, 8 засечек, искры. */
  private rangeRing(x: number, y: number, r: number, col: number) {
    col = this.tone(col);
    const g = this.g;
    this.under(x, y, r);
    g.lineStyle(1, col, 0.3).strokeCircle(x, y, r);
    g.lineStyle(1, col, 0.95);
    this.dashArc(x, y, r, 0, Math.PI * 2, 6, 5, (this.t / 80) % 11);
    this.ticks(x, y, r, col, 8, 3, 0, 0.7);
    this.sparks(x, y, r, col, 4);
  }
  /** Круг по ногам (fill) или обод без заливки (нова, аура знамени): обод 2 px с пульсом, мягкая полоса внутрь, узор стихии, искры, пунктир каймы. */
  private zone(x: number, y: number, r: number, col: number, edge: boolean, fill: boolean) {
    const g = this.g, p = this.pulse();
    if (fill) g.fillStyle(col, 0.06).fillCircle(x, y, r);
    if (r > 6) g.lineStyle(4, col, 0.1 + 0.05 * p).strokeCircle(x, y, r - 3);
    this.under(x, y, r);
    g.lineStyle(r > 14 ? 2 : 1, col, 0.8 + 0.15 * p).strokeCircle(x, y, r);
    if (r > 14) this.ornament(x, y, r, col, Math.max(8, Math.min(20, Math.round(r / 7))));
    this.sparks(x, y, r, col, r > 40 ? 3 : 2, -1);
    if (edge) { g.lineStyle(1, col, 0.35); this.dashArc(x, y, r + HIT_EDGE, 0, Math.PI * 2, 2, 4, 0); }
  }
  private circle(x: number, y: number, r: number, col: number, edge = true) { this.zone(x, y, r, this.tone(col), edge, true); }
  private ring(x: number, y: number, r: number, col: number, edge = true) { this.zone(x, y, r, this.tone(col), edge, false); }
  /** Зона-многоугольник: лёгкая заливка, мягкое свечение, обод 1 px с бегущими искрами; line ≤ 1 — только пунктир каймы. */
  private poly(pts: P[], col: number, fill = 0.08, line = 2, alpha = 0.9) {
    col = this.tone(col);
    if (line <= 1) return this.dotted(pts, col, alpha);
    const g = this.g, p = this.pulse();
    if (fill > 0) g.fillStyle(col, fill).fillPoints(pts, true);
    g.lineStyle(4, col, 0.07 + 0.04 * p).strokePoints(pts, true);
    g.lineStyle(3, 0x000000, 0.3).strokePoints(pts, true);
    g.lineStyle(1, col, 0.8 + 0.15 * p).strokePoints(pts, true);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const q = this.along(pts, this.t / 4000 + i / 4 - k * 0.005), sz = k === 0 ? 2 : 1;
      g.fillStyle(k === 0 ? 0xffffff : col, k === 0 ? 0.9 : 0.75 - k * 0.25).fillRect(Math.round(q.x) - (sz >> 1), Math.round(q.y) - (sz >> 1), sz, sz);
    }
  }
  /** Точки траектории: каждые 6 px, к цели крупнее и ярче; по пути бежит искра; на конце — перекрестье. */
  private dots(x0: number, y0: number, x1: number, y1: number, col: number, alpha: number, end: boolean) {
    const g = this.g, L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 2) return;
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L, at = (d: number) => ({ x: Math.round(x0 + ux * d), y: Math.round(y0 + uy * d) });
    for (let d = 6; d < L - 3; d += 6) {
      const k = d / L, q = at(d), sz = k > 0.6 ? 2 : 1;
      g.fillStyle(0x000000, 0.3 * alpha).fillRect(q.x - 1, q.y - 1, sz + 2, sz + 2);
      g.fillStyle(col, alpha * (0.45 + 0.55 * k)).fillRect(q.x, q.y, sz, sz);
    }
    if (!end) return;
    const s = at(((this.t / 1000) % 1) * L);
    g.fillStyle(0xffffff, 0.85 * alpha).fillRect(s.x - 1, s.y - 1, 2, 2);
    const e = at(L);
    g.lineStyle(3, 0x000000, 0.35).lineBetween(e.x - 4, e.y, e.x + 4, e.y).lineBetween(e.x, e.y - 4, e.x, e.y + 4);
    g.lineStyle(1, col, alpha).lineBetween(e.x - 4, e.y, e.x + 4, e.y).lineBetween(e.x, e.y - 4, e.x, e.y + 4);
  }
  /**
   * Путь от середины тела (x0, y0) до (x1, y1): если там юнит — до середины его тела, иначе — на той же высоте над землёй; тусклый остаток
   * до (x2, y2). Сервер мерит от ног — точки те же, сдвиг только по экрану.
   */
  private path(x0: number, y0: number, x1: number, y1: number, col: number, x2?: number, y2?: number) {
    col = this.tone(col);
    const h0 = this.bodyLift(x0, y0) ?? CHEST, h1 = this.bodyLift(x1, y1) ?? 0; // без юнита в конце — на землю: крестик в центре метки места (spot, круги)
    this.dots(x0, y0 - h0, x1, y1 - h1, col, 0.95, true);
    if (x2 !== undefined && y2 !== undefined && Math.hypot(x2 - x1, y2 - y1) > 1) this.dots(x1, y1 - h1, x2, y2 - (this.bodyLift(x2, y2) ?? h0), col, 0.35, false);
  }
  /** Место, где встанет герой или цель: тонкий кружок по ногам, точка в центре, 4 засечки. */
  private spot(x: number, y: number, col: number, r = 10) {
    col = this.tone(col);
    const g = this.g, p = this.pulse();
    this.under(x, y, r);
    g.fillStyle(col, 0.12).fillCircle(x, y, r).lineStyle(1, col, 0.8 + 0.15 * p).strokeCircle(x, y, r);
    this.ticks(x, y, r, col, 4, 3, this.t / 4000, 0.9);
    g.fillStyle(col, 1).fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  }
  /** Метки «кого заденет»: вокруг середины тела — тонкое кольцо и четыре дуги-скобы. */
  private hitRings(list: readonly { x: number; y: number; r: number }[], col: number) {
    col = this.tone(col);
    const g = this.g;
    for (const m of list) {
      const y = m.y - (this.bodyLift(m.x, m.y) ?? 0);
      g.lineStyle(1, col, 0.4).strokeCircle(m.x, y, m.r + 4);
      g.lineStyle(2, col, 0.95);
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; g.beginPath().arc(m.x, y, m.r + 3, a - 0.3, a + 0.3, false).strokePath(); }
    }
  }
  /** Красный крест в точке отказа. */
  private cross(x: number, y: number) {
    const g = this.g;
    g.lineStyle(3, 0x000000, 0.5).lineBetween(x - 5, y - 5, x + 5, y + 5).lineBetween(x - 5, y + 5, x + 5, y - 5);
    g.lineStyle(2, BAD, 1).lineBetween(x - 5, y - 5, x + 5, y + 5).lineBetween(x - 5, y + 5, x + 5, y - 5);
  }

  /**
   * shape — где ляжет умение (castAim; null — плана нет). rangeOnly: только кольцо (наведение на слот, умения на цель); у новы — круг всегда.
   * marks — кого заденет и стоит показать (рой, щиты союзникам, цель самонаведения): кольцо у тела — только вместе с формой.
   */
  draw(def: SkillDef, from: P, plan: CastPlan | null, shape: Placed | null, rangeOnly: boolean, marks: readonly { x: number; y: number; r: number }[] = []) {
    this.el = elemOf(def); this.col = ELEM_COL[this.el];
    this.g.clear();
    this.body(def, from, plan, shape, rangeOnly, marks);
    // отказ — красный крест и подпись причины у точки (текст из shape.err)
    if (shape?.err && plan?.ok && !rangeOnly) {
      const z = this.scene.cameras.main.zoom || 1;
      this.cross(Math.round(shape.x), Math.round(shape.y));
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
    const tc = this.tone(col);
    switch (shape.shape) {
      case "circle": {
        // знамя: аура — обод без сплошной заливки, удар древка — круг с заливкой; призыв — метка, где встанет (на воде — у берега на линии к герою)
        if (shape.r2 > 0) {
          g.fillStyle(tc, 0.05).fillCircle(shape.x, shape.y, shape.r);
          this.ring(shape.x, shape.y, shape.r, col, false);
          this.circle(shape.x, shape.y, shape.r2, col);
        } else this.circle(shape.x, shape.y, shape.r, col);
        if (Math.hypot(shape.sx - shape.x, shape.sy - shape.y) > 1) {
          this.dots(shape.x, shape.y, shape.sx, shape.sy, tc, 0.6, false);
          this.spot(shape.sx, shape.sy, col, 8);
        }
        return;
      }
      case "wall": {
        // капсула ±w вокруг отрезка поперёк прицела, кайма + радиус цели, 5 меток огня
        const e = wallEnds(shape.x, shape.y, shape.a, shape.len);
        this.poly(this.capsule(e.ax, e.ay, e.bx, e.by, shape.w), col);
        this.poly(this.capsule(e.ax, e.ay, e.bx, e.by, shape.w + HIT_EDGE), col, 0, 1, 0.45);
        for (let i = 0; i < 5; i++) { const q = wallMark(shape.x, shape.y, shape.a, shape.len, i); g.fillStyle(0x000000, 0.35).fillCircle(q.x, q.y, 3.5).fillStyle(tc, 0.9).fillCircle(q.x, q.y, 2.5); }
        return;
      }
      case "bolt": {
        // путь снаряда до точки взрыва (или середины тела цели), круги прямого попадания и брызг — у той же точки
        // путь заканчивается в центре кругов: на цели — у середины тела, без цели — на земле (крестик по центру кругов взрыва)
        const by = shape.y - (this.bodyLift(shape.x, shape.y) ?? 0);
        this.dots(from.x, from.y - (this.bodyLift(from.x, from.y) ?? CHEST), shape.x, by, this.tone(col), 0.95, true);
        if (shape.r > 0) this.circle(shape.x, by, shape.r, col);
        if (shape.r2 > 0) { this.under(shape.x, by, shape.r2); g.lineStyle(1, tc, 0.9).strokeCircle(shape.x, by, shape.r2); }
        return;
      }
      case "band": {
        // полоса нужной ширины до серверной точки (у стрелы и топора — до стены, у «Сияния» — до препятствия), кайма + радиус цели
        if (shape.cap) {
          this.poly(this.capsule(from.x, from.y, shape.x, shape.y, shape.w), col);
          this.poly(this.capsule(from.x, from.y, shape.x, shape.y, shape.w + HIT_EDGE), col, 0, 1, 0.45);
        } else {
          this.poly(this.rect(from.x, from.y, shape.a, shape.len, shape.w), col);
          this.poly(this.rect(from.x, from.y, shape.a, shape.len + HIT_EDGE, shape.w + HIT_EDGE), col, 0, 1, 0.45);
        }
        g.fillStyle(tc, 0.7).fillCircle(shape.x, shape.y, 2);
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
        g.fillStyle(tc, 0.12).fillPoints([pt(a0, 0, -1, w), ...ends, pt(a1, 0, 1, w)], true);
        g.lineStyle(1, tc, 0.85).strokePoints([pt(a0, 0, -1, w), pt(a0, d0, -1, w)]).strokePoints([pt(a1, 0, 1, w), pt(a1, d0, 1, w)]);
        if (d0 < R) {
          for (const a of rays) {
            const q = [pt(a, d0, -1, w), pt(a, R, -1, w), pt(a, R, 1, w), pt(a, d0, 1, w)];
            g.fillStyle(tc, 0.12).fillPoints(q, true);
            g.lineStyle(1, tc, 0.85).strokePoints(q, false);
            const tip = pt(a, R, 0, 0); g.fillStyle(0xffffff, 0.8).fillRect(Math.round(tip.x) - 1, Math.round(tip.y) - 1, 2, 2);
          }
        } else g.lineStyle(1, tc, 0.85).strokePoints([pt(a0, R, -1, w), pt(a1, R, 1, w)]);
        g.lineStyle(1, tc, 0.3).strokePoints([pt(a0, 0, -1, k), pt(a0, d1, -1, k)]).strokePoints([pt(a1, 0, 1, k), pt(a1, d1, 1, k)]);
        if (d1 < R) for (const a of rays) g.strokePoints([pt(a, d1, -1, k), pt(a, R, -1, k), pt(a, R, 1, k), pt(a, d1, 1, k)], false);
        else g.strokePoints([pt(a0, R, -1, k), pt(a1, R, 1, k)]);
        return;
      }
      case "cone": {
        // сектор ±раствор/2 радиуса дальности (как tele-конус в effects.ts), кайма + радиус цели
        const a0 = shape.a - shape.arc / 2, a1 = shape.a + shape.arc / 2;
        const cp: P[] = [{ x: from.x, y: from.y }];
        for (let i = 0; i <= 16; i++) { const a = a0 + ((a1 - a0) * i) / 16; cp.push({ x: from.x + Math.cos(a) * shape.r, y: from.y + Math.sin(a) * shape.r }); }
        this.poly(cp, col);
        g.lineStyle(1, tc, 0.35);
        this.dashArc(from.x, from.y, shape.r + HIT_EDGE, a0, a1, 2, 4, 0);
        return;
      }
    }
  }
}
