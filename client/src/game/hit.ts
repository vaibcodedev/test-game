import { GP } from "../../../shared/gameplay";
/**
 * Попадание мышью по юниту (задача 134, шаг 2; docs/aim-and-pick.md). Чистые функции, без Phaser и без аллокаций — зовутся каждый кадр.
 * Зона тела — прямоугольник силуэта по кадру: ±0,42·F по ширине, 0,9·F над ногами (и F/16 под ними, там ступни), питомцы ×0,8;
 * всадник — объединение кадра героя и непрозрачной части текущего кадра маунта (UnitView.spriteAlphaBox), так рейд-босс 128 и конь кликаются целиком. Вторая зона — ник и полоска HP (plate, запас 2 px).
 * След: по бегущему засчитывается клик туда, где он был до TRAIL_MS назад (прямоугольник, протянутый вдоль пути).
 * Порядок при наложении (PickBest): точное попадание (тело или плашка) → передний по глубине (плашки над всеми телами) → текущая цель → ближе центр;
 * среди попаданий с допуском или по следу — текущая цель → ближе край зоны → ближе центр.
 */

/** Прямоугольник в пикселях мира; пустой — x1 < x0. */
export interface Box { x0: number; y0: number; x1: number; y1: number }

export const TRAIL_MS = GP.ui.trailMs;
/** Запас к плашке (ник и полоска HP), пиксели мира. */
export const PLATE_PAD = GP.ui.platePad;
/** Глубина плашки: подписи рисуются над всеми телами (DEPTH.top), поэтому клик по нику важнее тела под ним. */
export const PLATE_DEPTH = 1e6;

export function emptyBox(b: Box): Box { b.x0 = 0; b.y0 = 0; b.x1 = -1; b.y1 = -1; return b; }
export function isEmpty(b: Box): boolean { return b.x1 < b.x0 || b.y1 < b.y0; }

/** Силуэт кадра размера frame (с масштабом scale) с ногами в (fx, fy). */
export function silhouette(b: Box, fx: number, fy: number, frame: number, scale = 1): Box {
  const f = frame * scale;
  b.x0 = fx - 0.42 * f; b.x1 = fx + 0.42 * f;
  b.y0 = fy - 0.9 * f; b.y1 = fy + f / 16;
  return b;
}

/** b ∪ o (в b). */
export function unionBox(b: Box, o: Box): Box {
  if (isEmpty(o)) return b;
  if (isEmpty(b)) { b.x0 = o.x0; b.y0 = o.y0; b.x1 = o.x1; b.y1 = o.y1; return b; }
  b.x0 = Math.min(b.x0, o.x0); b.y0 = Math.min(b.y0, o.y0); b.x1 = Math.max(b.x1, o.x1); b.y1 = Math.max(b.y1, o.y1);
  return b;
}

/** Расстояние от точки до прямоугольника (0 — внутри), сдвинутого на (sx, sy); пустой — Infinity. */
export function boxDist(b: Box, wx: number, wy: number, sx = 0, sy = 0): number {
  if (isEmpty(b)) return Infinity;
  const px = wx - sx, py = wy - sy;
  const dx = px < b.x0 ? b.x0 - px : px > b.x1 ? px - b.x1 : 0;
  const dy = py < b.y0 ? b.y0 - py : py > b.y1 ? py - b.y1 : 0;
  return dx === 0 && dy === 0 ? 0 : Math.hypot(dx, dy);
}

/** Расстояние до прямоугольника, протянутого вдоль сдвига (0..1)·(dx, dy): след бегущего. Функция от доли пути выпуклая — тернарный поиск. */
export function sweptDist(b: Box, dx: number, dy: number, wx: number, wy: number): number {
  let lo = 0, hi = 1;
  for (let k = 0; k < 24; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (boxDist(b, wx, wy, dx * m1, dy * m1) <= boxDist(b, wx, wy, dx * m2, dy * m2)) hi = m2; else lo = m1;
  }
  return Math.min(boxDist(b, wx, wy), boxDist(b, wx, wy, dx, dy), boxDist(b, wx, wy, dx * (lo + hi) / 2, dy * (lo + hi) / 2));
}

/** Кольцо прошлых положений ног (время, x, y) — для следа; без аллокаций после создания. */
export class Trail {
  private t = new Float64Array(12);
  private x = new Float64Array(12);
  private y = new Float64Array(12);
  private n = 0;
  private head = 0;
  /** Запомнить положение (не чаще раза в 15 мс: 12 записей покрывают след при любой частоте кадров). Скачок (телепорт) — забыть прошлое. */
  push(now: number, x: number, y: number, jump = false) {
    if (jump) this.n = 0;
    if (this.n && now - this.t[this.head] < 15) return;
    this.head = (this.head + 1) % 12;
    this.t[this.head] = now; this.x[this.head] = x; this.y[this.head] = y;
    if (this.n < 12) this.n++;
  }
  /** Положение ms назад (самое старое из записанных в этом окне): в out.x, out.y; записей нет — false. */
  past(now: number, ms: number, out: { x: number; y: number }): boolean {
    if (!this.n) return false;
    let i = this.head, found = false;
    for (let k = 0; k < this.n; k++) {
      if (now - this.t[i] > ms) break;
      out.x = this.x[i]; out.y = this.y[i]; found = true;
      i = (i + 11) % 12;
    }
    return found;
  }
}

/** Итог проверки юнита: d — расстояние до зоны (0 — в зоне), exact — по самому телу или плашке (не по следу), depth — глубина (y ног; плашка — PLATE_DEPTH + y),
 *  center — до центра силуэта. */
export interface Hit { d: number; exact: boolean; depth: number; center: number }

/**
 * Попадание по юниту: тело body с запасом reach, плашка plate (с PLATE_PAD, без reach), след (сдвиг тела в прошлое tdx, tdy; 0 — не бежит).
 * Пишет итог в h и возвращает h.d (Infinity — мимо).
 */
export function hitUnit(h: Hit, body: Box, plate: Box, footY: number, tdx: number, tdy: number, wx: number, wy: number, reach: number): number {
  h.exact = false; h.d = Infinity; h.depth = footY;
  h.center = isEmpty(body) ? Infinity : Math.hypot(wx - (body.x0 + body.x1) / 2, wy - (body.y0 + body.y1) / 2);
  const bd = boxDist(body, wx, wy);
  if (bd === 0) { h.d = 0; h.exact = true; }
  if (!isEmpty(plate) && wx >= plate.x0 - PLATE_PAD && wx <= plate.x1 + PLATE_PAD && wy >= plate.y0 - PLATE_PAD && wy <= plate.y1 + PLATE_PAD) {
    h.d = 0; h.exact = true; h.depth = PLATE_DEPTH + footY;
  }
  if (h.exact) return 0;
  let d = bd;
  if (tdx * tdx + tdy * tdy >= 4) d = Math.min(d, sweptDist(body, tdx, tdy, wx, wy));
  if (d <= reach) h.d = d;
  return h.d;
}

/** Лучший кандидат по порядку из шапки файла. reset — перед перебором, offer — на каждого с конечным h.d. */
export class PickBest {
  id: string | null = null;
  private exact = false;
  private depth = 0;
  private sel = false;
  private d = Infinity;
  private center = Infinity;
  reset() { this.id = null; this.exact = false; this.depth = 0; this.sel = false; this.d = Infinity; this.center = Infinity; }
  offer(id: string, h: Hit, sel: boolean) {
    if (!(h.d < Infinity)) return;
    if (this.id === null || this.beats(h, sel)) {
      this.id = id; this.exact = h.exact; this.depth = h.depth; this.sel = sel; this.d = h.d; this.center = h.center;
    }
  }
  private beats(h: Hit, sel: boolean): boolean {
    if (h.exact !== this.exact) return h.exact;
    if (h.exact && h.depth !== this.depth) return h.depth > this.depth;
    if (sel !== this.sel) return sel;
    if (!h.exact && h.d !== this.d) return h.d < this.d;
    return h.center < this.center;
  }
}

/** Маска непрозрачных пикселей кадра (наведение на объекты — по силуэту, как у юнитов, а не по кругу у основания). a[y * w + x] = 1, если пиксель непрозрачен. */
export interface Mask { w: number; h: number; a: Uint8Array }

/** Расстояние (в пикселях кадра) от точки кадра (lx, ly) до ближайшего непрозрачного пикселя: 0 — внутри силуэта, Infinity — дальше tol. Без аллокаций. */
export function maskDist(m: Mask, lx: number, ly: number, tol: number): number {
  const r = Math.ceil(tol), cx = Math.floor(lx), cy = Math.floor(ly);
  let best = Infinity;
  for (let j = Math.max(0, cy - r); j <= Math.min(m.h - 1, cy + r); j++) {
    const dy = ly < j ? j - ly : ly > j + 1 ? ly - j - 1 : 0;
    for (let i = Math.max(0, cx - r); i <= Math.min(m.w - 1, cx + r); i++) {
      if (!m.a[j * m.w + i]) continue;
      const dx = lx < i ? i - lx : lx > i + 1 ? lx - i - 1 : 0, d = dx === 0 && dy === 0 ? 0 : Math.hypot(dx, dy);
      if (d < best) { if (d === 0) return 0; best = d; }
    }
  }
  return best <= tol ? best : Infinity;
}

/** Точка мира (wx, wy) → пиксель кадра картинки с опорной точкой в (x, y), опорой (ox, oy) в долях кадра, масштабом sx, sy и отражением flip; затем maskDist с допуском tol (пиксели мира). Результат — в пикселях мира. */
export function imageDist(m: Mask, x: number, y: number, ox: number, oy: number, sx: number, sy: number, flip: boolean, wx: number, wy: number, tol: number): number {
  const u = (wx - x) / sx + ox * m.w, v = (wy - y) / sy + oy * m.h, k = Math.min(sx, sy);
  return maskDist(m, flip ? m.w - u : u, v, tol / k) * k;
}
