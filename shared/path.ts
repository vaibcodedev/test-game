/** Поиск пути A* по клеткам карты (8 направлений, без срезания углов) и сглаживание по прямой видимости. */
import { TILE } from "./constants";
import { CELL_BLOCK, walkable, type WorldMap } from "./map";
import { interiorAt, interiorGrid } from "./interiors";
import { GP } from "./gameplay";

/** Проходима ли прямая для круга радиуса r (проверка шагами по 8 px). */
export function segmentWalkable(m: WorldMap, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!walkable(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r)) return false;
  }
  return true;
}

/** Двоичная куча индексов клеток по f (f — общий буфер на карту, см. Scratch). */
class Heap {
  a: number[] = [];
  f: Float64Array;
  constructor(f: Float64Array) {
    this.f = f;
  }
  push(i: number) {
    const a = this.a;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[k]]) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let s = k;
        if (l < a.length && this.f[a[l]] < this.f[a[s]]) s = l;
        if (r < a.length && this.f[a[r]] < this.f[a[s]]) s = r;
        if (s === k) break;
        [a[s], a[k]] = [a[k], a[s]];
        k = s;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

/**
 * Переиспользуемые буферы A* на размер карты (аудит 1.2): вместо Map/Set/кучи на каждый вызов.
 * Метка поколения: клетка «посещена в этом поиске», если seen[i] === gen (closed[i] === gen — закрыта); g, from, f валидны только при seen[i] === gen.
 */
interface Scratch { size: number; g: Float64Array; from: Int32Array; seen: Uint32Array; closed: Uint32Array; heap: Heap; gen: number }
let scratch: Scratch | null = null;
function getScratch(size: number): Scratch {
  // буфер не меньше нужного: зал интерьера (задача 144) ищет путь по своей маленькой сетке в буфере карты мира, без пересоздания
  if (!scratch || scratch.size < size) {
    scratch = { size, g: new Float64Array(size), from: new Int32Array(size), seen: new Uint32Array(size), closed: new Uint32Array(size), heap: new Heap(new Float64Array(size)), gen: 0 };
  }
  if (++scratch.gen >= 0xffffffff) {
    scratch.seen.fill(0);
    scratch.closed.fill(0);
    scratch.gen = 1;
  }
  scratch.heap.a.length = 0;
  return scratch;
}

/**
 * Путь от (sx,sy) к (tx,ty) в пикселях. Возвращает точки (без стартовой) или null.
 * Если цель в непроходимой клетке — идём к ближайшей достигнутой клетке.
 */
export function findPath(m: WorldMap, sx: number, sy: number, tx: number, ty: number, r: number, maxNodes = 6000): { x: number; y: number }[] | null {
  // зал интерьера за краем карты мира: A* по его сетке в его координатах
  if (sx >= m.w * TILE) {
    const room = interiorAt(sx, sy);
    if (!room) return null;
    const sub = interiorGrid(room) as unknown as WorldMap;
    return findPath(sub, sx - room.ox, sy - room.oy, tx - room.ox, ty - room.oy, r, maxNodes)?.map((p) => ({ x: p.x + room.ox, y: p.y + room.oy })) ?? null;
  }
  const W = m.w, H = m.h;
  const s = Math.floor(sy / TILE) * W + Math.floor(sx / TILE);
  const tcx = Math.floor(tx / TILE), tcy = Math.floor(ty / TILE);
  const goal = tcy * W + tcx;
  const cell = m.cell;
  const open = (i: number) => !(cell[i] & CELL_BLOCK);
  const S = getScratch(W * H);
  const { g, from, seen, closed, heap } = S, gen = S.gen;
  const h = (i: number) => {
    const dx = Math.abs((i % W) - tcx), dy = Math.abs(Math.floor(i / W) - tcy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  g[s] = 0;
  seen[s] = gen;
  heap.f[s] = h(s);
  heap.push(s);
  let best = s, bestH = h(s), expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (cur === goal) { best = cur; break; }
    const hc = h(cur);
    if (hc < bestH) { bestH = hc; best = cur; }
    if (++expanded > maxNodes) break;
    const cx = cur % W, cy = Math.floor(cur / W);
    const gc = g[cur];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!open(n)) continue;
      if (dx && dy && (!open(cy * W + nx) || !open(ny * W + cx))) continue;
      const ng = gc + (dx && dy ? 1.414 : 1);
      if (seen[n] !== gen || ng < g[n]) {
        seen[n] = gen;
        g[n] = ng;
        from[n] = cur;
        heap.f[n] = ng + h(n);
        heap.push(n);
      }
    }
  }
  if (best === s) return null;
  const cells: number[] = [];
  for (let c = best; c !== s; c = from[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => ({ x: (c % W) * TILE + TILE / 2, y: Math.floor(c / W) * TILE + TILE / 2 }));
  if (best === goal && walkable(m, tx, ty, r)) pts[pts.length - 1] = { x: tx, y: ty };
  // сглаживание: выкидываем точки, до которых видно по прямой
  const out: { x: number; y: number }[] = [];
  let ax = sx, ay = sy, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !segmentWalkable(m, ax, ay, pts[j].x, pts[j].y, r)) j--;
    out.push(pts[j]);
    ax = pts[j].x;
    ay = pts[j].y;
    i = j + 1;
  }
  return out;
}

/** Пауза после неудачного поиска (цель недостижима или уже стоим у ближайшей к ней клетки), мс. */
export const NAV_FAIL_MS = GP.nav.failMs;
/** Цель, сместившаяся от неудачной дальше этого (px), снимает паузу — новый приказ или цель ушла. */
export const NAV_FAIL_SHIFT = GP.nav.failShift;

/**
 * Навигация юнита: прямо, если видно, иначе по пути A* (пересчёт при смещении цели или раз в 0,8 с).
 * Неудачный поиск запоминается: до NAV_FAIL_MS A* не повторяется (иначе недостижимая цель — полный A* каждый такт).
 */
export class Nav {
  path: { x: number; y: number }[] = [];
  goal: { x: number; y: number } | null = null;
  at = -1e9;
  /** Неудача: до какого времени не искать и к какой цели искали. */
  failUntil = -1e9;
  failGoal: { x: number; y: number } | null = null;

  reset() {
    this.path = [];
    this.goal = null;
    this.at = -1e9;
    this.failUntil = -1e9;
    this.failGoal = null;
  }

  next(m: WorldMap, x: number, y: number, gx: number, gy: number, r: number, now: number): { x: number; y: number } | null {
    if (segmentWalkable(m, x, y, gx, gy, r)) {
      this.path = [];
      return { x: gx, y: gy };
    }
    const failing = now < this.failUntil && !!this.failGoal && Math.hypot(this.failGoal.x - gx, this.failGoal.y - gy) <= NAV_FAIL_SHIFT;
    const moved = !this.goal || Math.hypot(this.goal.x - gx, this.goal.y - gy) > 4;
    let fresh = false;
    if (!failing && (moved || !this.path.length || now - this.at > 800)) {
      this.goal = { x: gx, y: gy };
      this.at = now;
      this.path = findPath(m, x, y, gx, gy, r) ?? [];
      fresh = true;
    }
    while (this.path.length && Math.hypot(this.path[0].x - x, this.path[0].y - y) < 6) this.path.shift();
    if (fresh && !this.path.length) {
      this.failUntil = now + NAV_FAIL_MS;
      this.failGoal = { x: gx, y: gy };
    }
    // срезаем путь, если следующая точка уже видна
    while (this.path.length > 1 && segmentWalkable(m, x, y, this.path[1].x, this.path[1].y, r)) this.path.shift();
    return this.path[0] ?? null;
  }
}
