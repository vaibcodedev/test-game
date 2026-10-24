/** Общие помощники обозначений бафов и дебафов (задача 129): рампы тем, модель слоёв, маски в координатах мира с плотностью листа,
 *  объёмная заливка (фаска и шар со светом сверху слева, контур 1 px, чистка одиночных пикселей), языки пламени, клубы дыма, ореолы,
 *  искры, кольца и купола по эллипсу.
 *  Плотность D: 1 — пиксель листа = пиксель мира (круги, купола, частицы на теле), 2 и 3 — двойная и тройная (значки, предметы орбит:
 *  лист ×2 для зума 2 и 4, лист ×3 для зума 3; рисунок один — фигуры заданы в пикселях мира). */
import { PC, hex, rng, mix, type RGBA, type Ramp } from "./canvas";
import { RAMPS } from "./vfx-lib";
import { OUTLINE_FX } from "./palette";

export const TAU = Math.PI * 2;
export { PC, hex, rng, mix };
export type { RGBA, Ramp };
const R = (...c: string[]): Ramp => c.map((x) => hex(x));
export const withA = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], Math.max(0, Math.min(255, Math.round(a)))];

/** Рампы тем (тёмный → светлый). Названия тем — как в data/skill-icons.json, чтобы знак на герое и иконка в рамке совпадали по цвету. */
export const RP: Record<string, Ramp> = {
  ...RAMPS,
  gold: R("#5a3408", "#9a5e16", "#d89a2a", "#ffd254", "#fff0a8", "#fffbe8"),
  amber: R("#4a1e06", "#8a3c0e", "#d0701c", "#f4a83a", "#ffd88a", "#fff6d8"),
  death: R("#06161e", "#12384c", "#2a7a9c", "#6ac8e8", "#b8f0ff", "#ffffff"),
  ice: R("#0e2a4a", "#1e5a8a", "#3a90c8", "#7ccaf0", "#c4ecff", "#ffffff"),
  fel: R("#0c2a0e", "#16541a", "#2a9a2a", "#5ad84a", "#a8ff7a", "#e8ffd8"),
  leaf: R("#0e2a14", "#1e5a26", "#3a8a3a", "#7ad04a", "#b8f070", "#eaffc8"),
  bark: R("#1e1008", "#3e2414", "#64401f", "#8a5e30", "#b0864c", "#d8b480"),
  feather: R("#140a24", "#2a1646", "#4a2a80", "#7a4ac8", "#b890ff", "#e8dcff"),
  lilac: R("#1c0e30", "#3e2470", "#6a44b0", "#9a78e0", "#c8b0ff", "#f0e8ff"),
  violet: R("#12061e", "#2e0e48", "#561c86", "#8a34c0", "#be6ef0", "#ecc8ff"),
  light: R("#8a7a58", "#c8b888", "#f0e4b4", "#fff8d8", "#ffffff", "#ffffff"),
  azure: R("#0c2a5a", "#1e5aa8", "#3a8ae8", "#7ac8ff", "#c8ecff", "#ffffff"),
  ember: R("#3a0c08", "#8a2410", "#d04a14", "#f48a24", "#ffc84a", "#fff4c0"),
  flame: R("#7a1608", "#c8300e", "#f06a14", "#ffae2a", "#ffe27a", "#fffbe0"),
  crimson: R("#2a0610", "#5c0c1c", "#9a1628", "#d4283c", "#ff6a74", "#ffc4c8"),
  steelb: R("#10182a", "#22345a", "#3a5a8e", "#5a86c0", "#8ab4e8", "#d8ecff"),
  bone2: R("#2e261e", "#5a5044", "#8e8476", "#c4bcaa", "#ece6d6", "#ffffff"),
  dust: R("#3a2c1e", "#6a543a", "#9a805c", "#c4aa82", "#e4d0aa"),
  mist: R("#3a3842", "#5c5a66", "#86848e", "#b0aeb6", "#d8d6dc"),
  miasma: R("#1a2a08", "#34500e", "#5a7a16", "#8aa82a", "#c0d84a", "#ecf8a0"),
  sky: R("#12365e", "#1f5a96", "#3a86c8", "#7ec8ff", "#c8ecff", "#ffffff"),
};
/** Тёмный контур значков и предметов (чуть тонированный). */
export const INK: RGBA = OUTLINE_FX;

// ====================================================================== модель слоёв
/** Куда ставится слой: feet — точка под ногами, body — центр тела (13 px над ногами), hand — у руки (10 вправо, 11 вверх),
 *  head — значок над подписью (низ значка — на 1 px выше блока ника и полоски здоровья). */
export type At = "feet" | "body" | "hand" | "head";
/** Глубина: ground — на земле под героем и его тенью, under — под героем (за ним), over — над героем, top — над подписью (как ник). */
export type Z = "ground" | "under" | "over" | "top";
/** Орбита, которую клиент считает каждый кадр (как у рун рыцаря смерти): лист — только сами предметы. Пиксели мира и мс. */
export interface OrbitSpec {
  /** Сколько предметов; stacks — по числу стаков (до n). */
  n: number; stacks?: boolean;
  /** Разных предметов в листе: кадры листа идут блоками по kinds (предмет k — кадры k·F … k·F + F − 1). */
  kinds: number;
  rx: number; ry: number;
  /** Центр орбиты относительно точки at (вверх — минус). */
  oy: number;
  /** Период оборота, мс (минус — по часовой стрелке). */
  period: number;
  /** Покачивание каждого предмета, px мира и мс; фазы предметов разнесены. */
  bob: number; bobPeriod: number;
  /** Задний полукруг: альфа (0..1) — приглушение альфой, без затемнения. */
  backAlpha: number;
  /** Кадры предмета: shimmer — мерцание со своей частотой (fps слоя, фаза предмета сдвинута); lr — два блока: летит вправо | влево;
   *  angle — dirs кадров по углу на орбите (кадр k — угол k·360°/dirs, 0 — справа, 90° — спереди): предмет повёрнут по ходу полёта в 3D
   *  (сбоку виден целиком, на краях орбиты — в ракурсе). */
  face?: "shimmer" | "lr" | "dir" | "angle";
  dirs?: number;
  /** ground — орбита по земле: все предметы под героем (обе половины). */
  ground?: boolean;
}
export interface Layer {
  id: string;
  frames: PC[]; w: number; h: number;
  /** 1 — пиксель листа = пиксель мира; 2 — двойная плотность (масштаб 0.5), рядом лист тройной плотности hi (масштаб 1/3) для зума 3. */
  dens: 1 | 2;
  hi?: PC[]; hw?: number; hh?: number;
  fps: number;
  /** Точка привязки в кадре (доли ширины и высоты). */
  anchor: [number, number];
  at: At; dx?: number; dy?: number; z: Z;
  /** Покачивание в коде: смещение sin(t) с шагом в пиксель холста; в листе рисунок неподвижен. */
  bob?: { amp: number; period: number };
  orbit?: OrbitSpec;
  /** Вариант слоя (знамя: эмблема своей фракции). */
  variant?: string;
}
export interface Art {
  id: string; layers: Layer[];
  /** Появление и исчезновение (мс, easing out): клиент плавно наращивает альфу (и масштаб от scaleIn), при снятии — гасит. */
  ease: { fadeIn: number; fadeOut: number; scaleIn?: number };
  /** moving — рисовать только в движении (пыль маунта). */
  only?: "moving";
  /** Стаки: значок рисует под собой точки (до max). */
  pips?: { max: number; color: RGBA };
}
export const EASE = { fadeIn: 220, fadeOut: 280, scaleIn: 0.85 };

// ====================================================================== кадры
export const px = (f: PC, x: number, y: number, c: RGBA) => f.set(Math.round(x), Math.round(y), c);
/** n кадров w×h (пиксели листа), draw(f, t, u) — u = t / n (фаза цикла 0..1). */
export function mk(w: number, h: number, n: number, draw: (f: PC, t: number, u: number) => void): PC[] {
  return Array.from({ length: n }, (_, t) => { const f = new PC(w, h); draw(f, t, t / n); return f; });
}
/** Слой плотности 1. */
export function L1(id: string, w: number, h: number, n: number, fps: number, at: At, z: Z, anchor: [number, number], draw: (f: PC, t: number, u: number) => void, extra: Partial<Layer> = {}): Layer {
  return { id, frames: mk(w, h, n, draw), w, h, dens: 1, fps, anchor, at, z, ...extra };
}
/** Слой двойной плотности: рисунок в пикселях мира (W×H), растр ×2 и ×3. draw(c, t, u) — c.D — плотность. */
export function L2(id: string, W: number, H: number, n: number, fps: number, at: At, z: Z, anchor: [number, number], draw: (c: Cv, t: number, u: number) => void, extra: Partial<Layer> = {}): Layer {
  const at2 = (D: number) => Array.from({ length: n }, (_, t) => { const c = new Cv(W, H, D); draw(c, t, t / n); return c.f; });
  return { id, frames: at2(2), w: W * 2, h: H * 2, dens: 2, hi: at2(3), hw: W * 3, hh: H * 3, fps, anchor, at, z, ...extra };
}
/** Холст плотности D с размерами в пикселях мира. */
export class Cv {
  f: PC;
  constructor(readonly W: number, readonly H: number, readonly D: number) { this.f = new PC(Math.round(W * D), Math.round(H * D)); }
  mask() { return new Mask(this.f.w, this.f.h, this.D); }
  /** Пиксель в точке мира (x, y) — квадрат D×D? Нет: одна точка листа; для «пикселя мира» — dot. */
  set(x: number, y: number, c: RGBA) { this.f.set(Math.floor(x * this.D), Math.floor(y * this.D), c); }
  /** Квадрат size×size пикселей мира (искра, капля 2×2). */
  dot(x: number, y: number, size: number, c: RGBA) {
    const s = Math.max(1, Math.round(size * this.D)), x0 = Math.round(x * this.D - s / 2), y0 = Math.round(y * this.D - s / 2);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) this.f.set(x0 + i, y0 + j, c);
  }
}

// ====================================================================== маски
type Op = "add" | "sub";
/** Бинарная маска листа; фигуры задаются в пикселях мира (D — пикселей листа на пиксель мира). */
export class Mask {
  a: Uint8Array;
  constructor(readonly w: number, readonly h: number, readonly D = 1) { this.a = new Uint8Array(w * h); }
  has(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.a[y * this.w + x] === 1; }
  put(x: number, y: number, v: boolean) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y * this.w + x] = v ? 1 : 0; }
  /** Фигура по предикату в координатах мира (центр пикселя листа); box — рамка в мире для скорости. */
  fill(pred: (x: number, y: number) => boolean, op: Op = "add", box?: [number, number, number, number]) {
    const D = this.D, [x0, y0, x1, y1] = box ? [Math.max(0, Math.floor(box[0] * D) - 1), Math.max(0, Math.floor(box[1] * D) - 1), Math.min(this.w - 1, Math.ceil(box[2] * D) + 1), Math.min(this.h - 1, Math.ceil(box[3] * D) + 1)] : [0, 0, this.w - 1, this.h - 1];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (pred((x + 0.5) / D, (y + 0.5) / D)) this.a[y * this.w + x] = op === "add" ? 1 : 0;
    return this;
  }
  disc(cx: number, cy: number, r: number, op: Op = "add") { return this.fill((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r, op, [cx - r, cy - r, cx + r, cy + r]); }
  ell(cx: number, cy: number, rx: number, ry: number, rot = 0, op: Op = "add") {
    const c = Math.cos(rot), s = Math.sin(rot), m = Math.max(rx, ry);
    return this.fill((x, y) => { const dx = x - cx, dy = y - cy, u = dx * c + dy * s, v = -dx * s + dy * c; return (u / rx) ** 2 + (v / ry) ** 2 <= 1; }, op, [cx - m, cy - m, cx + m, cy + m]);
  }
  poly(pts: [number, number][], op: Op = "add") {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return this.fill((x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }, op, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  /** Капсула (штрих со скруглёнными концами) с радиусом r0 у начала и r1 у конца. */
  cap(x0: number, y0: number, x1: number, y1: number, r0: number, r1 = r0, op: Op = "add") {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-6, m = Math.max(r0, r1);
    return this.fill((x, y) => { const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2)), r = r0 + (r1 - r0) * t; return (x - x0 - dx * t) ** 2 + (y - y0 - dy * t) ** 2 <= r * r; }, op,
      [Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m]);
  }
  /** Ломаная из капсул (кривая по точкам), радиус меняется от r0 к r1 по длине. */
  path(pts: [number, number][], r0: number, r1 = r0, op: Op = "add") {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) this.cap(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r0 + ((r1 - r0) * i) / n, r0 + ((r1 - r0) * (i + 1)) / n, op);
    return this;
  }
  rect(x: number, y: number, w: number, h: number, op: Op = "add") { return this.fill((px, py) => px >= x && px < x + w && py >= y && py < y + h, op, [x, y, x + w, y + h]); }
  union(m: Mask) { for (let i = 0; i < this.a.length; i++) if (m.a[i]) this.a[i] = 1; return this; }
  minus(m: Mask) { for (let i = 0; i < this.a.length; i++) if (m.a[i]) this.a[i] = 0; return this; }
  clone() { const m = new Mask(this.w, this.h, this.D); m.a.set(this.a); return m; }
  count() { let n = 0; for (const v of this.a) n += v; return n; }
  /** Рамка занятых пикселей [x0, y0, x1, y1] (включительно). */
  bbox(): [number, number, number, number] {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.a[y * this.w + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  }
  /** Расстояние (пиксели листа) от каждого пикселя маски до ближайшего пустого; дальше R — R + 1. */
  dist(R = 8): Float32Array {
    const d = new Float32Array(this.w * this.h), Rc = Math.ceil(R);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.a[y * this.w + x]) continue;
      let best = R + 1;
      for (let j = -Rc; j <= Rc; j++) for (let i = -Rc; i <= Rc; i++) {
        const q = Math.hypot(i, j); if (q >= best) continue;
        if (!this.has(x + i, y + j)) best = q;
      }
      d[y * this.w + x] = best;
    }
    return d;
  }
}

// ====================================================================== объёмная заливка
export interface ShadeOpt {
  /** Контур снаружи (null — без контура); outW — толщина в пикселях листа. */
  out?: RGBA | null; outW?: number;
  /** Ширина фаски в пикселях мира (bevel) или «шар» (round). */
  mode?: "bevel" | "round"; bevel?: number;
  /** Свет: направление в плоскости (к свету), по умолчанию сверху слева. */
  light?: [number, number];
  /** Добавка к свету сверху вниз (объём всей формы). */
  grad?: number;
  /** Пороги тонов (по яркости −1..1) для ramp[0..4]; spec — пиксели ярче порога получают ramp[5] (блик). */
  th?: [number, number, number, number]; spec?: number;
  /** Альфа (0..1) всей заливки. */
  alpha?: number;
  /** Не чистить одиночные пиксели. */
  raw?: boolean;
}
/** Заливка маски рампой (тёмный → светлый, 5–6 тонов): объём от фаски или шара, свет сверху слева, контур, чистка. Пишет в f. */
export function shade(f: PC, m: Mask, ramp: Ramp, o: ShadeOpt = {}) {
  const W = m.w, H = m.h, D = m.D, mode = o.mode ?? "bevel";
  const d = m.dist(mode === "round" ? 40 : Math.max(2, (o.bevel ?? 1.4) * D + 1));
  let dmax = 0; for (let i = 0; i < d.length; i++) if (d[i] > dmax) dmax = d[i];
  const B = mode === "round" ? Math.max(1, dmax) : Math.max(1, (o.bevel ?? 1.4) * D);
  const hgt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H || !m.a[y * W + x]) return 0;
    const v = d[y * W + x];
    if (mode === "round") { const q = 1 - Math.min(v, B) / B; return Math.sqrt(Math.max(0, 1 - q * q)) * B; }
    return Math.min(v, B);
  };
  const [lx0, ly0] = o.light ?? [-0.62, -0.78], lz = 0.95, ln = Math.hypot(lx0, ly0, lz), L = [lx0 / ln, ly0 / ln, lz / ln];
  const th = o.th ?? (mode === "round" ? [0.05, 0.42, 0.68, 0.86] : [0.2, 0.5, 0.74, 0.9]);
  const [bx0, by0, , by1] = m.bbox(), span = Math.max(1, by1 - by0);
  const tone = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!m.a[y * W + x]) continue;
    const gx = (hgt(x + 1, y) - hgt(x - 1, y)) / 2, gy = (hgt(x, y + 1) - hgt(x, y - 1)) / 2;
    const nn = Math.hypot(gx, gy, 1);
    let I = (-gx * L[0] - gy * L[1] + L[2]) / nn;
    if (o.grad) I += o.grad * (0.5 - (y - by0) / span);
    let k = I < th[0] ? 0 : I < th[1] ? 1 : I < th[2] ? 2 : I < th[3] ? 3 : 4;
    if (o.spec !== undefined && I >= o.spec && ramp.length > 5) k = 5;
    tone[y * W + x] = k;
  }
  void bx0;
  if (!o.raw) cleanTones(tone, W, H);
  const a = o.alpha ?? 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = tone[y * W + x]; if (k >= 0) f.set(x, y, a < 1 ? withA(ramp[Math.min(k, ramp.length - 1)], 255 * a) : ramp[Math.min(k, ramp.length - 1)]); }
  if (o.out !== null) outline(f, m, o.out ?? INK, o.outW ?? 1);
}
/** Убрать одиночные пиксели тона: если 3–4 соседа (из 4) одного другого тона — перекрасить в него. */
export function cleanTones(tone: Int8Array, W: number, H: number) {
  for (let pass = 0; pass < 2; pass++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = tone[y * W + x]; if (k < 0) continue;
    const nb = [x > 0 ? tone[y * W + x - 1] : -1, x < W - 1 ? tone[y * W + x + 1] : -1, y > 0 ? tone[(y - 1) * W + x] : -1, y < H - 1 ? tone[(y + 1) * W + x] : -1].filter((v) => v >= 0);
    if (nb.length < 3) continue;
    const cnt = new Map<number, number>(); for (const v of nb) cnt.set(v, (cnt.get(v) ?? 0) + 1);
    let best = k, bc = 0; for (const [v, c] of cnt) if (c > bc) { bc = c; best = v; }
    if (best !== k && bc >= nb.length - (nb.length === 4 ? 1 : 0) && !nb.includes(k)) tone[y * W + x] = best;
  }
}
/** Контур снаружи маски толщиной w (по 4 соседям — ровная лесенка). */
export function outline(f: PC, m: Mask, c: RGBA = INK, w = 1) {
  let cur = m.clone();
  for (let k = 0; k < w; k++) {
    const next = cur.clone();
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (cur.has(x, y)) continue;
      if (cur.has(x - 1, y) || cur.has(x + 1, y) || cur.has(x, y - 1) || cur.has(x, y + 1)) { f.set(x, y, c); next.put(x, y, true); }
    }
    cur = next;
  }
}
/** Плоская заливка маски цветом. */
export function flat(f: PC, m: Mask, c: RGBA) { for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a[y * m.w + x]) f.set(x, y, c); }

// ====================================================================== пламя, дым, ореол, искры
/** Язык пламени: капля от основания (x, y) вверх на h, полуширина w, изгиб sway (px мира у вершины). Цвет — по «жару»: светлое ядро у основания →
 *  жёлтый → оранжевый → красный край; без чёрного контура. ramp: [край, красный, оранжевый, жёлтый, ядро]. */
export function flameMask(c: Cv, x: number, y: number, h: number, w: number, sway: number, lean = 0) {
  const m = c.mask(), N = 14, pts: [number, number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, bend = sway * s * s + lean * s, r = w * Math.pow(1 - s, 0.9) * (s < 0.25 ? 0.72 + s * 1.12 : 1);
    pts.push([x + bend, y - s * h, Math.max(0.35, r)]);
  }
  for (let i = 0; i < N; i++) m.cap(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i][2], pts[i + 1][2]);
  return m;
}
export function flameFill(c: Cv, m: Mask, ramp: Ramp, baseY: number, h: number, alpha = 1, coreBias = 0) {
  const d = m.dist(12); let dmax = 0; for (const v of d) dmax = Math.max(dmax, v);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!m.a[y * m.w + x]) continue;
    const wy = (y + 0.5) / c.D, s = Math.max(0, Math.min(1, (baseY - wy) / h));
    const heat = (d[y * m.w + x] / Math.max(1, dmax)) * (1.15 - 0.75 * s) + coreBias;
    const k = heat < 0.2 ? 0 : heat < 0.42 ? 1 : heat < 0.62 ? 2 : heat < 0.82 ? 3 : 4;
    c.f.set(x, y, alpha < 1 ? withA(ramp[k], 255 * alpha) : ramp[k]);
  }
}
/** Язык пламени целиком. */
export function flame(c: Cv, x: number, y: number, h: number, w: number, sway: number, ramp: Ramp, alpha = 1, lean = 0, coreBias = 0) {
  const m = flameMask(c, x, y, h, w, sway, lean); flameFill(c, m, ramp, y, h, alpha, coreBias); return m;
}
/** Облако из кругов [x, y, r] (мир): одна маска, объём шаром, 3–4 тона (ramp тёмный → светлый), альфа; без контура. */
export function cloud(c: Cv, discs: [number, number, number][], ramp: Ramp, alpha = 1, o: { th?: [number, number, number, number]; edgeA?: number } = {}) {
  const m = c.mask(); for (const [x, y, r] of discs) if (r > 0.2) m.disc(x, y, r);
  const tmp = new PC(m.w, m.h);
  shade(tmp, m, ramp, { mode: "round", out: null, th: o.th ?? [-0.2, 0.3, 0.62, 0.95], light: [-0.5, -0.85] });
  const d = m.dist(3);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const col = tmp.get(x, y)!; if (!col[3]) continue;
    const edge = d[y * m.w + x] <= 1 ? (o.edgeA ?? 0.7) : 1;
    c.f.set(x, y, withA(col, 255 * alpha * edge));
  }
  return m;
}
/** Ореол: ступенчатая альфа по эллипсу (steps ступеней от края к центру), цвет c, aMax — альфа в центре (0..1). */
export function glow(c: Cv, x: number, y: number, rx: number, ry: number, col: RGBA, aMax: number, steps = 3) {
  const D = c.D;
  for (let j = Math.floor((y - ry) * D); j <= Math.ceil((y + ry) * D); j++) for (let i = Math.floor((x - rx) * D); i <= Math.ceil((x + rx) * D); i++) {
    const q = Math.hypot(((i + 0.5) / D - x) / rx, ((j + 0.5) / D - y) / ry); if (q >= 1) continue;
    const st = Math.ceil((1 - q) * steps) / steps;
    c.f.set(i, j, withA(col, 255 * aMax * st));
  }
}
/** Четырёхлучевая искра (крест с ромбом в центре): r — длина луча (мир), тона: ядро → середина → кончик. */
export function sparkle(c: Cv, x: number, y: number, r: number, ramp: [RGBA, RGBA, RGBA], o: { thick?: number; diag?: number; alpha?: number; rot?: number } = {}) {
  const m = c.mask(), t = o.thick ?? 0.55, ca = Math.cos(o.rot ?? 0), sa = Math.sin(o.rot ?? 0);
  const P = (u: number, v: number): [number, number] => [x + u * ca - v * sa, y + u * sa + v * ca];
  m.cap(...P(-r, 0), ...P(r, 0), 0.18, 0.18).cap(...P(0, -r), ...P(0, r), 0.18, 0.18);
  m.poly([P(-r * t, 0), P(0, -r * t), P(r * t, 0), P(0, r * t)]);
  m.cap(...P(-r * 0.6, 0), ...P(r * 0.6, 0), t * 0.9, t * 0.9).cap(...P(0, -r * 0.6), ...P(0, r * 0.6), t * 0.9, t * 0.9);
  if (o.diag) { const q = o.diag * 0.7; m.cap(...P(-q, -q), ...P(q, q), 0.3, 0.3).cap(...P(-q, q), ...P(q, -q), 0.3, 0.3); }
  const a = o.alpha ?? 1;
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
    if (!m.has(i, j)) continue;
    const q = Math.hypot((i + 0.5) / c.D - x, (j + 0.5) / c.D - y) / Math.max(0.5, r);
    const col = q < 0.28 ? ramp[0] : q < 0.62 ? ramp[1] : ramp[2];
    c.f.set(i, j, a < 1 ? withA(col, 255 * a) : col);
  }
  return m;
}

/** Порог Байера 4×4 (0..1) для пикселя мира (x, y): растворение дизером вместо альфы. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
/** Растворить слой дизером: убрать пиксели, у которых порог Байера (по пикселям мира — блоки D×D листа) меньше k (0..1). Без альфы. */
export function dissolve(f: PC, k: number, D = 1) {
  if (k <= 0) return;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (bayer(Math.floor(x / D), Math.floor(y / D)) < k) f.clear(x, y);
}
/** Клуб дыма как в паках: круги [x, y, r] (мир) кладутся по порядку, каждый — непрозрачный шар в 3 тона (свет сверху слева, середина,
 *  серп тени снизу справа), поэтому доли клуба отделены серпами, как у «цветной капусты»; по общему силуэту — кромка out (1 px листа).
 *  Растворение — сжатием (радиусы задаёт вызов) и дизером dis (0..1), а не альфой. Пишет поверх c.f. */
export function puff(c: Cv, discs: [number, number, number][], tones: [RGBA, RGBA, RGBA], out: RGBA | null, dis = 0): Mask {
  const m = c.mask(), tmp = new PC(c.f.w, c.f.h);
  for (const [x, y, r] of discs) {
    if (r <= 0.3) continue;
    const dm = c.mask().disc(x, y, r), lit = c.mask().disc(x - r * 0.3, y - r * 0.34, r * 0.6), body = c.mask().disc(x - r * 0.15, y - r * 0.2, r * 0.9);
    for (let j = 0; j < dm.h; j++) for (let i = 0; i < dm.w; i++) if (dm.has(i, j)) tmp.set(i, j, lit.has(i, j) ? tones[2] : body.has(i, j) ? tones[1] : tones[0]);
    m.union(dm);
  }
  if (out) outline(tmp, m, out);
  dissolve(tmp, dis, c.D);
  c.f.blit(tmp, 0, 0);
  return m;
}

/** Свет по кромке: внутренние краевые пиксели маски в угловом окне вокруг центра маски (угол th, полуширина win рад) — цветом col.
 *  Бегущий по кругу свет делает каждый кадр значка своим, без мигания. */
export function rimLight(f: PC, m: Mask, th: number, win: number, col: RGBA, depth = 1) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) { sx += x; sy += y; n++; }
  if (!n) return;
  const cx = sx / n, cy = sy / n, d = m.dist(depth + 1);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!m.has(x, y) || d[y * m.w + x] > depth) continue;
    const a = Math.atan2(y - cy, x - cx), dd = Math.abs((((a - th) % TAU) + TAU + Math.PI) % TAU - Math.PI);
    if (dd < win) f.set(x, y, col);
  }
}

// ====================================================================== кольца и купола по эллипсу (плотность 1)
/** Пробег по пикселям эллиптического кольца: для каждого пикселя рядом с эллипсом (cx, cy, rx, ry) вызывает fn(x, y, θ, d), где d — расстояние
 *  до эллипса по радиусу в пикселях (минус — внутри), θ — угол (0 вправо, π/2 вниз — к зрителю). Только для |d| ≤ reach. */
export function ellScan(W: number, H: number, cx: number, cy: number, rx: number, ry: number, reach: number, fn: (x: number, y: number, th: number, d: number) => void) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx / rx, dy / ry);
    const th = Math.atan2(dy / ry, dx / rx), rho = Math.hypot(rx * Math.cos(th), ry * Math.sin(th)), d = (r - 1) * rho;
    if (Math.abs(d) <= reach) fn(x, y, th, d);
  }
}
/** Угол в 0..2π. */
export const ang = (a: number) => ((a % TAU) + TAU) % TAU;
/** Близость углов (0..π). */
export const adist = (a: number, b: number) => { const d = Math.abs(ang(a) - ang(b)); return Math.min(d, TAU - d); };

// ====================================================================== easing
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const easeIn = (t: number) => t * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
export const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Колокол 0→1→0 на отрезке p ∈ [0, 1] (появление и угасание частицы). */
export const bell = (p: number, inn = 0.2, out = 0.35) => (p < inn ? easeOut(p / inn) : p > 1 - out ? easeOut((1 - p) / out) : 1);
export const wave = (u: number, k = 1, ph = 0) => Math.sin((u * k + ph) * TAU);
/** Ступени яркости: v 0..1 → индекс рампы lo..hi (4–6 ступеней). */
export const stepTone = (ramp: Ramp, v: number, lo: number, hi: number) => ramp[Math.max(lo, Math.min(hi, lo + Math.round(v * (hi - lo))))];
