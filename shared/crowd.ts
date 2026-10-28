/**
 * Разведение толпы (docs/libraries-2.md 3.3, шаг 2): сетка-хеш соседей и поправка шага — отталкивание при перекрытии
 * и обход соседа впереди (уход вбок). Без библиотек: скорости малые, соседей единицы. «Тяжёлых» (герои, боссы) не толкают — их обходят.
 */
export interface CrowdBody { key: unknown; x: number; y: number; r: number; heavy: boolean }

export class SpatialHash {
  private cells = new Map<number, CrowdBody[]>();
  private pool: CrowdBody[] = [];
  private n = 0;
  constructor(readonly cell = 64) {}

  clear() {
    if (this.cells.size > 8192) this.cells.clear();
    else for (const a of this.cells.values()) a.length = 0;
    this.n = 0;
  }
  get size() {
    return this.n;
  }
  add(key: unknown, x: number, y: number, r: number, heavy = false) {
    const b = (this.pool[this.n] ??= { key: null, x: 0, y: 0, r: 0, heavy: false });
    this.n++;
    b.key = key; b.x = x; b.y = y; b.r = r; b.heavy = heavy;
    const k = this.k(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let a = this.cells.get(k);
    if (!a) this.cells.set(k, (a = []));
    a.push(b);
  }
  /** Тела ячейки (cx, cy) или undefined. */
  at(cx: number, cy: number): CrowdBody[] | undefined {
    return this.cells.get(this.k(cx, cy));
  }
  /** Обойти тела в квадрате ±rad вокруг точки. */
  near(x: number, y: number, rad: number, fn: (b: CrowdBody) => void) {
    const c = this.cell, x0 = Math.floor((x - rad) / c), x1 = Math.floor((x + rad) / c), y0 = Math.floor((y - rad) / c), y1 = Math.floor((y + rad) / c);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const a = this.cells.get(this.k(cx, cy));
      if (a) for (const b of a) fn(b);
    }
  }
  private k(cx: number, cy: number) {
    return (cy + 32768) * 65536 + (cx + 32768);
  }
}

/** Зазор между телами (px) и дальность «вижу соседа впереди» сверх суммы радиусов. */
export const CROWD_GAP = 3;
const LOOK = 18;
/** Наибольший радиус тела в сетке (герой, моб — до 12–16 px): дальность поиска соседей. */
const MAX_R = 16;

/**
 * Шаг с учётом толпы: (mx, my) — желаемый шаг (px за такт, может быть 0 — стоит), self — ключ себя в сетке.
 * Возвращает итоговый шаг: желаемый + отталкивание от перекрывающих + уход вбок от соседа впереди. Длина не больше max(шаг, nudge) × 1,25.
 * nudge — сколько px за такт можно сдвинуться, стоя (разойтись с перекрывшим).
 * (gx, gy) — цель хода: тело в ней (герой, за которым гонится моб) не отталкивает и не обходится.
 */
export function crowdStep(h: SpatialHash, self: unknown, x: number, y: number, r: number, mx: number, my: number, nudge: number, gx = NaN, gy = NaN): { x: number; y: number } {
  const sp = Math.hypot(mx, my), ux = sp ? mx / sp : 0, uy = sp ? my / sp : 0;
  let px = 0, py = 0, ax = 0, ay = 0;
  // без замыканий: обход ячеек вручную (горячий путь — каждый шаг каждого моба)
  const rad = r + MAX_R + CROWD_GAP + (sp ? LOOK : 0), c = h.cell;
  const x0 = Math.floor((x - rad) / c), x1 = Math.floor((x + rad) / c), y0 = Math.floor((y - rad) / c), y1 = Math.floor((y + rad) / c);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const a = h.at(cx, cy);
    if (!a) continue;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      if (b.key === self) continue;
      let dx = x - b.x, dy = y - b.y;
      const minD = r + b.r + CROWD_GAP, far = sp ? minD + LOOK : minD;
      if (dx >= far || dx <= -far || dy >= far || dy <= -far) continue;
      if (Math.abs(b.x - gx) < 2 && Math.abs(b.y - gy) < 2) continue;
      let d = Math.hypot(dx, dy);
      if (d >= far) continue;
      if (d < 0.01) {
        // в одной точке: расходимся по направлению, зависящему от пары (детерминированно)
        const ang = ((hashKey(self) - hashKey(b.key)) % 628) / 100;
        dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
      }
      const nx = dx / d, ny = dy / d, wHeavy = b.heavy ? 2 : 1;
      if (d < minD) {
        const w = (minD - d) / minD;
        px += nx * w * wHeavy;
        py += ny * w * wHeavy;
      }
      if (sp) {
        // сосед впереди (в конусе ~60°): уходим вбок от него
        const ahead = -(nx * ux + ny * uy);
        if (ahead > 0.5) {
          let sx = nx + ahead * ux, sy = ny + ahead * uy; // составляющая «от соседа» поперёк хода
          const sl = Math.hypot(sx, sy);
          if (sl < 0.05) { sx = -uy; sy = ux; } else { sx /= sl; sy /= sl; } // ровно впереди — обходим справа
          const w = (1 - Math.max(0, d - minD) / LOOK) * ahead * wHeavy;
          ax += sx * w;
          ay += sy * w;
        }
      }
    }
  }
  if (!px && !py && !ax && !ay) return { x: mx, y: my };
  const base = Math.max(sp, nudge);
  let rx = mx + (px * 1.1 + ax * 0.7) * base, ry = my + (py * 1.1 + ay * 0.7) * base;
  const rl = Math.hypot(rx, ry), cap = base * 1.25;
  if (rl > cap) { rx = (rx / rl) * cap; ry = (ry / rl) * cap; }
  return { x: rx, y: ry };
}

const keyIds = new WeakMap<object, number>();
let keyN = 0;
function hashKey(k: unknown): number {
  if (typeof k === "object" && k) {
    let v = keyIds.get(k);
    if (v === undefined) keyIds.set(k, (v = ++keyN * 97));
    return v;
  }
  return 0;
}
