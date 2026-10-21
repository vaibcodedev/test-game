/** Иконки умений в стиле frosty_rabbid «RPG Ability Icons Collection» (CC0, задача 127, шаг 1: превью на утверждение, в игру ничего не кладётся).
 *
 *  Разбор оригинала (vendor/frosty-rabbid/src/single/*.png, 100 штук) — что копирует этот модуль:
 *  - Холст 24×24, пиксель 1 к 1 (без сглаживания, без полупрозрачности). По краю 1 px прозрачного поля, внутри рамка 22×22 толщиной 1 px:
 *    фаска — верх и лево #d0daea, низ и право #768ebd, два угловых пикселя (право-верх, лево-низ) #a1b4d5. Углы рамки квадратные.
 *  - Плашка 20×20 залита #1f244b (тёмно-синий). Внутреннего бордюра, тени у рамки, чёрного контура у рисунка нет.
 *  - Всего 44 цвета на все 100 иконок. Рисунок собран из рядов по 6–10 тонов одной темы; тем семь: green, blue, fire (красный→оранжевый),
 *    purple (малиновый), sand (золото/песок/дерево), steel (серо-голубой), olive (руны/руины). Смешиваются редко (дерево + листва, кровь на стали).
 *  - Свечение — главный приём. Предмет написан светлыми тонами ряда; от него в плашку уходит ореол: те же тона, но всё темнее и реже,
 *    без плавного градиента — ступенями (постеризация), у границы ступеней рваный край и одиночные «искры» в 1 px. Самый тёмный тон ряда
 *    (у fire/purple/blue — #42265b) — внешнее кольцо ореола, потом ряд идёт к светлому. Ядро предмета — белый (#ffffff) или самый светлый тон.
 *  - Предмет крупный, заполняет плашку и часто обрезается её краем; композиция — диагональ или центральный силуэт. Около 45% плашки остаётся пустой.
 *  - Фигуры упрощены до 3–5 тонов: края темнее, середина светлее, детали (глаза, зубы) — вырезы цвета плашки.
 *
 *  Как рисует генератор (повторяет разбор):
 *  - Сцена 20×20 (координаты 0…20 внутри плашки). Фигура — «излучатель»: знаковое расстояние (SDF) до отрезка, многоугольника, кольца или
 *    силуэта game-icons (tools/gen/icons-svg.ts). Внутри фигуры яркость растёт от края к ядру, снаружи падает по расстоянию — это ореол.
 *  - Яркость переводится в тон ряда округлением (ступени), к ней примешивается шум (рваный край, искры). Побеждает излучатель с наибольшей яркостью.
 *  - Вырезы (глаза, зубы, щели) — отдельный проход цветом плашки. Рамка рисуется последней, ровно как у оригинала.
 *  - Все цвета — только из 44 цветов frosty (RAMPS ниже), поэтому оригиналы и сгенерированные иконки лежат рядом без швов.
 *
 *  Размер в игре: файл 24×24, клиент показывает целым масштабом ×2 (48 px): хотбар `.slot img` уже 48 px, аура-ячейка 26 px с рамкой 1 px — ровно ×1.
 *  Что поменять в CSS (шаг 2, здесь не трогается): client/src/styles/windows.css `.node .slot img` 52px → 48px (слот 56 → 52),
 *  его же мобильный `.slot img` 40px → 48px при слоте 52px (или ×1 = 24px); иконка роли рейда `.role-ic` 16px → 24px; hud.css `.slot img` 48px и
 *  `.hud-player .auras .cell` 26px остаются. 1 px прозрачного поля даёт 2 px зазора при ×2, поэтому у `.slot img` можно убрать `margin`.
 *
 *  Запуск превью: npx tsx tools/gen/icons-skills.ts (листы в tools/out/icons-preview/). */
import { PC, hex, hash01, pnoise, type RGBA } from "./canvas";
import { shapeOf, type Shape, type ShapeOpt } from "./icons-svg";

export type Theme = "green" | "blue" | "fire" | "purple" | "sand" | "steel" | "olive";
export const THEMES: Theme[] = ["green", "blue", "fire", "purple", "sand", "steel", "olive"];

/** Цвета оригинала (проверены по всем 100 иконкам). Ряды — от самого тёмного тона ореола к самому светлому. */
const R = (...cs: string[]): RGBA[] => cs.map((c) => hex(c));
export const PLATE = hex("#1f244b");
export const FRAME = { light: hex("#d0daea"), mid: hex("#a1b4d5"), dark: hex("#768ebd") };
export const RAMPS: Record<Theme, RGBA[]> = {
  green: R("#1f344b", "#254c53", "#307562", "#3a9f72", "#5abc78", "#89d077", "#b8e476", "#f7e99d", "#ffffff"),
  blue: R("#42265b", "#154989", "#167bd3", "#2f9deb", "#74d2f2", "#b9f0f8", "#ffffff"),
  fire: R("#42265b", "#642c64", "#8d3148", "#bf393c", "#cf553f", "#db7445", "#e69566", "#f0b588", "#f7e99d", "#ffffff"),
  purple: R("#42265b", "#642c64", "#8c346e", "#b43c79", "#ce6289", "#e2989d", "#f5ceb1", "#ffffff"),
  sand: R("#3c2e4c", "#593b4f", "#7a5a5f", "#9a796f", "#bb987f", "#dbc38f", "#f7e99d", "#ffffff"),
  steel: R("#3c4770", "#596b97", "#768ebd", "#a1b4d5", "#d0daea", "#ffffff"),
  olive: R("#2b3b53", "#3d545d", "#647a6b", "#8c9f79", "#bdc68a", "#f7e99d"),
};

export type SD = (x: number, y: number) => number;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

// ---------- знаковые расстояния (внутри < 0), координаты рабочей области 0…20 ----------
export const sdSeg = (ax: number, ay: number, bx: number, by: number): SD => (x, y) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = clamp((px * dx + py * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - dx * h, py - dy * h);
};
export const sdPoly = (pts: [number, number][]): SD => (x, y) => {
  let d = 1e9, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
    d = Math.min(d, sdSeg(ax, ay, bx, by)(x, y));
  }
  return inside ? -d : d;
};
export const sdDisc = (cx: number, cy: number, r: number): SD => (x, y) => Math.hypot(x - cx, y - cy) - r;
export const sdRing = (cx: number, cy: number, r: number, w: number): SD => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w / 2;
export const sdEll = (cx: number, cy: number, rx: number, ry: number): SD => (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
/** Дуга кольца от угла a0 до a1 (радианы, 0 — вправо, по часовой на экране). */
export const sdArc = (cx: number, cy: number, r: number, a0: number, a1: number, w: number): SD => (x, y) => {
  const dx = x - cx, dy = y - cy;
  let a = Math.atan2(dy, dx);
  const span = (((a1 - a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
  let t = (((a - a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (t <= span) return Math.abs(Math.hypot(dx, dy) - r) - w / 2;
  const e0 = Math.hypot(x - (cx + Math.cos(a0) * r), y - (cy + Math.sin(a0) * r));
  const e1 = Math.hypot(x - (cx + Math.cos(a1) * r), y - (cy + Math.sin(a1) * r));
  return Math.min(e0, e1) - w / 2;
};
/** Клин-лезвие: от (x0,y0) шириной w0 до (x1,y1) шириной w1. */
export const taper = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number): [number, number][] => {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  return [[x0 + (nx * w0) / 2, y0 + (ny * w0) / 2], [x1 + (nx * w1) / 2, y1 + (ny * w1) / 2], [x1 - (nx * w1) / 2, y1 - (ny * w1) / 2], [x0 - (nx * w0) / 2, y0 - (ny * w0) / 2]];
};
export const unionSD = (...s: SD[]): SD => (x, y) => Math.min(...s.map((f) => f(x, y)));
export const subSD = (a: SD, b: SD): SD => (x, y) => Math.max(a(x, y), -b(x, y));
export const shapeSD = (s: Shape): SD => (x, y) => s.sd(x, y);

export interface EmOpt {
  /** Ряд цветов (по умолчанию — тема иконки). */
  ramp?: Theme;
  /** Яркость ядра 0…1: положение в ряду (1 — самый светлый тон, обычно белый). */
  lv?: number;
  /** Яркость у границы тела (по умолчанию lv − 0.3). */
  edge?: number;
  /** Сколько пикселей от края внутрь яркость растёт до ядра (по умолчанию — полуширина фигуры). */
  depth?: number;
  /** Яркость ореола у самой границы тела (по умолчанию = edge): ниже — тело резче отделяется от ореола. */
  halo?: number;
  /** Сколько пикселей ореол уходит наружу, затухая в цвет плашки. 0 — без ореола. */
  reach?: number;
  /** Кривизна спада ореола (больше 1 — резче у края). */
  gamma?: number;
  /** Шум в ступенях ряда: рваный край ореола и искры. */
  noise?: number;
  /** Искажение границы ореола плавным шумом, px (органика: листва, огонь, туман). */
  warp?: number;
  /** Свой порядок при равной яркости: больший — выше. */
  z?: number;
}

interface Em { sd: SD; hw: number; o: EmOpt; seed: number }
interface Carve { sd: SD; color: RGBA | null; ramp?: Theme; lv?: number }

/** Сцена одной иконки: набор излучателей и вырезов; render() превращает их в плашку 20×20. */
export class Scene {
  readonly W = 20;
  private ems: Em[] = [];
  private carves: Carve[] = [];
  private dots: { x: number; y: number; color: RGBA }[] = [];
  private seq = 0;
  constructor(readonly theme: Theme, readonly seed = 1) {}

  /** Излучатель по SDF. hw — типичная полуширина (для глубины по умолчанию). */
  emit(sd: SD, hw: number, o: EmOpt = {}): this {
    this.ems.push({ sd, hw, o, seed: this.seed * 131 + ++this.seq * 17 });
    return this;
  }
  line(pts: [number, number][], w: number, o: EmOpt = {}): this {
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push(sdSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    const sd = segs.length === 1 ? segs[0] : unionSD(...segs);
    return this.emit((x, y) => sd(x, y) - w / 2, w / 2, o);
  }
  poly(pts: [number, number][], o: EmOpt = {}): this { return this.emit(sdPoly(pts), o.depth ?? 2, o); }
  disc(cx: number, cy: number, r: number, o: EmOpt = {}): this { return this.emit(sdDisc(cx, cy, r), r, o); }
  ell(cx: number, cy: number, rx: number, ry: number, o: EmOpt = {}): this { return this.emit(sdEll(cx, cy, rx, ry), Math.min(rx, ry), o); }
  ring(cx: number, cy: number, r: number, w: number, o: EmOpt = {}): this { return this.emit(sdRing(cx, cy, r, w), w / 2, o); }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, w: number, o: EmOpt = {}): this { return this.emit(sdArc(cx, cy, r, a0, a1, w), w / 2, o); }
  blade(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, o: EmOpt = {}): this { return this.poly(taper(x0, y0, x1, y1, w0, w1), { depth: Math.max(w0, w1) / 2, ...o }); }
  shape(id: string, so: ShapeOpt, o: EmOpt = {}): this { return this.emit(shapeSD(shapeOf(id, so)), o.depth ?? 2.2, o); }
  /** Вырез цветом плашки (глаза, зубы, щели) или заданным тоном ряда. */
  cut(sd: SD, color: "plate" | { ramp?: Theme; lv: number } = "plate"): this {
    this.carves.push(color === "plate" ? { sd, color: null } : { sd, color: null, ramp: color.ramp ?? this.theme, lv: color.lv });
    return this;
  }
  /** Одиночный пиксель (искра) в плашечных координатах 0…19. */
  dot(x: number, y: number, lv: number, ramp?: Theme): this {
    const r = RAMPS[ramp ?? this.theme];
    this.dots.push({ x, y, color: r[clamp(Math.round(lv * (r.length - 1)), 0, r.length - 1)] });
    return this;
  }
  /** Россыпь искр вокруг фигуры: n пикселей случайно по плашке, но только там, где ореол уже есть (яркость ≥ minLv ряда). */
  sparks(n: number, o: { lv?: number; ramp?: Theme; box?: [number, number, number, number]; avoid?: number } = {}): this {
    const box = o.box ?? [1, 1, 19, 19];
    const rnd = (k: number) => hash01(k, this.seed * 7 + 3, 91);
    let placed = 0;
    for (let k = 0; k < n * 12 && placed < n; k++) {
      const x = Math.floor(box[0] + rnd(k * 2) * (box[2] - box[0])), y = Math.floor(box[1] + rnd(k * 2 + 1) * (box[3] - box[1]));
      this.sparkList.push({ x, y, lv: o.lv ?? 0.4, ramp: o.ramp, avoid: o.avoid ?? 1.2 });
      placed++;
    }
    return this;
  }
  private sparkList: { x: number; y: number; lv: number; ramp?: Theme; avoid: number }[] = [];

  /** Яркость излучателя в точке: положение в ряду от −0.5 (пусто) до lv·(N−1). */
  private level(e: Em, x: number, y: number): number {
    const o = e.o, N = RAMPS[o.ramp ?? this.theme].length;
    const lv = (o.lv ?? 0.9) * (N - 1), edge = (o.edge ?? (o.lv ?? 0.9) - 0.3) * (N - 1);
    let sd = e.sd(x, y);
    if (o.warp) sd += (pnoise(x + 7, y + 3, 2.5, 80, e.seed) - 0.5) * 2 * o.warp;
    if (sd <= 0) {
      const depth = o.depth ?? Math.max(0.6, e.hw * 0.9);
      return edge + (lv - edge) * smooth(clamp(-sd / depth, 0, 1));
    }
    const reach = o.reach ?? 3.2;
    if (reach <= 0 || sd >= reach) return -9;
    const t = Math.pow(sd / reach, o.gamma ?? 1.15);
    const h0 = (o.halo ?? (o.edge ?? (o.lv ?? 0.9) - 0.3)) * (N - 1);
    return h0 - (h0 + 0.55) * t;
  }

  /** Плашка 20×20 → холст 24×24 с рамкой. */
  render(): PC {
    const out = new PC(24, 24);
    // плашка
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const px = x + 0.5, py = y + 0.5;
      let best = -9, bestC: RGBA | null = null, bestZ = -1e9;
      for (const e of this.ems) {
        const rampName = e.o.ramp ?? this.theme, ramp = RAMPS[rampName], N = ramp.length;
        let t = this.level(e, px, py);
        if (t <= -8) continue;
        const nz = e.o.noise ?? 0.38;
        const core = (e.o.lv ?? 0.9) * (N - 1);
        const w = clamp((core - t) / 1.2, 0, 1);
        t += (hash01(x, y, e.seed) - 0.5) * 2 * nz * w;
        const idx = Math.round(t);
        if (idx < 0) continue;
        const k = Math.min(idx, N - 1) / (N - 1) + (e.o.z ?? 0) * 0.001;
        if (k > best || (k === best && (e.o.z ?? 0) >= bestZ)) { best = k; bestC = ramp[Math.min(idx, N - 1)]; bestZ = e.o.z ?? 0; }
      }
      out.set(x + 2, y + 2, bestC ?? PLATE);
    }
    for (const c of this.carves) {
      for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
        if (c.sd(x + 0.5, y + 0.5) > 0) continue;
        if (c.color === null && c.ramp === undefined) out.set(x + 2, y + 2, PLATE);
        else if (c.ramp !== undefined) { const r = RAMPS[c.ramp]; out.set(x + 2, y + 2, r[clamp(Math.round(c.lv! * (r.length - 1)), 0, r.length - 1)]); }
      }
    }
    for (const d of this.dots) if (d.x >= 0 && d.x < 20 && d.y >= 0 && d.y < 20) out.set(d.x + 2, d.y + 2, d.color);
    for (const s of this.sparkList) {
      // искра только на пустой плашке рядом с уже нарисованным (ореол), чтобы не висеть в воздухе
      if (out.get(s.x + 2, s.y + 2)?.[0] !== PLATE[0] || out.get(s.x + 2, s.y + 2)?.[1] !== PLATE[1] || out.get(s.x + 2, s.y + 2)?.[2] !== PLATE[2]) continue;
      let near = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const c = out.get(s.x + 2 + dx, s.y + 2 + dy);
        if (c && (c[0] !== PLATE[0] || c[1] !== PLATE[1] || c[2] !== PLATE[2]) && s.x + dx >= 0 && s.x + dx < 20 && s.y + dy >= 0 && s.y + dy < 20) near++;
      }
      if (near < 2) continue;
      const r = RAMPS[s.ramp ?? this.theme];
      out.set(s.x + 2, s.y + 2, r[clamp(Math.round(s.lv * (r.length - 1)), 0, r.length - 1)]);
    }
    // рамка 22×22 со смещением 1: фаска свет сверху-слева, тень снизу-справа
    for (let i = 1; i <= 21; i++) { out.set(i, 1, FRAME.light); out.set(i + 1, 22, FRAME.dark); }
    for (let i = 2; i <= 21; i++) { out.set(1, i, FRAME.light); out.set(22, i, FRAME.dark); }
    out.set(22, 1, FRAME.mid); out.set(1, 22, FRAME.mid);
    return out;
  }
}


/** Плашка 20×20 (PC) → иконка 24×24 с рамкой frosty. */
export function frameIcon(plate: PC): PC {
  const out = new PC(24, 24);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) out.set(x + 2, y + 2, plate.get(x, y)![3] ? plate.get(x, y)! : PLATE);
  for (let i = 1; i <= 21; i++) { out.set(i, 1, FRAME.light); out.set(i + 1, 22, FRAME.dark); }
  for (let i = 2; i <= 21; i++) { out.set(1, i, FRAME.light); out.set(22, i, FRAME.dark); }
  out.set(22, 1, FRAME.mid); out.set(1, 22, FRAME.mid);
  return out;
}

// ---------- стихии: одна палитра на весь набор иконок умений (задача 127) ----------
export type Element = "lightning" | "fire" | "frost" | "poison" | "nature" | "blood" | "shadow" | "arcane" | "holy" | "phys" | "death";
export const ELEMENTS: Element[] = ["lightning", "fire", "frost", "poison", "nature", "blood", "shadow", "arcane", "holy", "phys", "death"];
/** Ряды стихий: 2 ступени свечения (первые два тона), 3–4 тона знака, светлое ядро. Плашка и рамка — нейтральные, в darkenIcon. */
export const ELEMENT_RAMPS: Record<Element, RGBA[]> = {
  lightning: R("#241f4a", "#38358a", "#4c66d6", "#78a0ff", "#a8c4ff", "#d8e2ff", "#f6f4ff"), // электрический сине-голубой с фиолетовым отливом
  fire: R("#3a1418", "#7c2316", "#c43a14", "#f26a1c", "#ffa83a", "#ffd878", "#fff6d0"), // оранжево-красный с жёлтым ядром
  frost: R("#16384a", "#25668a", "#44a4c8", "#82d6ea", "#b8eef8", "#e0fbff", "#ffffff"), // бледно-голубой, циан
  poison: R("#262c0e", "#4a6212", "#82aa1c", "#b4dc2a", "#d8f35c", "#eeff9c", "#fbffd8"), // кислотный жёлто-зелёный
  nature: R("#182e1c", "#2a542c", "#418038", "#64a848", "#8ece62", "#b8e890", "#e4f8c8"), // травяной зелёный
  blood: R("#32091a", "#641224", "#9c1c30", "#d02c42", "#f05464", "#ff8e94", "#ffd6d6"), // багровый и тёмно-красный
  shadow: R("#1c1030", "#38205c", "#5a3694", "#8258c2", "#a684e0", "#ccb0f2", "#efe4ff"), // тёмно-фиолетовый
  arcane: R("#34123c", "#74286e", "#b04aa0", "#e078c4", "#f6a6e0", "#ffd0f2", "#fff0fa"), // пурпурно-розовый, сиреневый
  holy: R("#42300e", "#80601a", "#c89a38", "#eec458", "#ffe08a", "#fff0b8", "#ffffff"), // золото с белым ядром
  phys: R("#2a2630", "#5a4434", "#80899a", "#aab4c2", "#d2d9e4", "#eef2f8", "#ffffff"), // холодная сталь, бронзовый тон в тенях
  death: R("#122a26", "#245048", "#3f8274", "#6cb4a2", "#a0d8c6", "#d0f4e8", "#f2fffa"), // мертвенно-зелёный с голубизной (рыцарь смерти)
};

/** Перекраска оригинала frosty: тона ряда его темы → тона ряда стихии по положению в ряду, рисунок не меняется.
 *  Плашка, рамка и белый остаются; у стальных иконок кровь (красные тона) не трогается. */
export function recolorFrosty(src: PC, from: Theme[], to: Element, keepOther = false): PC {
  const out = src.clone(), dst = ELEMENT_RAMPS[to];
  const same = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) {
    const c = src.get(x, y)!;
    if (!c[3] || same(c, PLATE)) continue;
    let pos = -1, n = 0;
    for (const t of from) { const i = RAMPS[t].findIndex((q) => same(q, c)); if (i >= 0) { pos = i; n = RAMPS[t].length; break; } }
    if (pos < 0 && !keepOther) for (const t of THEMES) { const i = RAMPS[t].findIndex((q) => same(q, c)); if (i >= 0) { pos = i; n = RAMPS[t].length; break; } }
    if (pos < 0) continue;
    if (same(c, hex("#ffffff"))) continue;
    out.set(x, y, dst[Math.round((pos / (n - 1)) * (dst.length - 1))]);
  }
  return out;
}
