/**
 * Буфер A* (аудит 1.2): findPath с общим буфером и меткой поколения даёт те же пути, что прежняя версия с Map/Set/кучей на каждый вызов.
 * Прежняя версия — копией ниже (findPathRef); сравнение на случайных запросах и замер времени.
 */
import { MAP_SEED, TILE } from "../shared/constants";
import { CELL_BLOCK, CELL_OBJ, generateMap, walkable, type WorldMap } from "../shared/map";
import { findPath, segmentWalkable } from "../shared/path";

// ---------- прежняя реализация (до буфера) ----------
class Heap {
  a: number[] = [];
  f: Float64Array;
  constructor(size: number) {
    this.f = new Float64Array(size);
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
 * Путь от (sx,sy) к (tx,ty) в пикселях. Возвращает точки (без стартовой) или null.
 * Если цель в непроходимой клетке — идём к ближайшей достигнутой клетке.
 */
function findPathRef(m: WorldMap, sx: number, sy: number, tx: number, ty: number, r: number, maxNodes = 6000): { x: number; y: number }[] | null {
  const W = m.w, H = m.h;
  const s = Math.floor(sy / TILE) * W + Math.floor(sx / TILE);
  const tcx = Math.floor(tx / TILE), tcy = Math.floor(ty / TILE);
  const goal = tcy * W + tcx;
  // клетки объектов с коллизией по основанию (CELL_OBJ, 2026-10-30) — как в shared/path.ts: закрыты, кроме выхода от старта по клеткам объекта
  const OBJ = CELL_BLOCK | CELL_OBJ, cxOf = (i: number) => (i % W) * TILE + TILE / 2, cyOf = (i: number) => Math.floor(i / W) * TILE + TILE / 2;
  const esc = new Set<number>();
  if ((m.cell[s] & OBJ) === OBJ) esc.add(s);
  let cur = s;
  const px = (i: number) => (i === s ? sx : i === goal ? tx : cxOf(i)), py = (i: number) => (i === s ? sy : i === goal ? ty : cyOf(i));
  const gre = new Set<number>();
  if ((m.cell[goal] & OBJ) === OBJ && walkable(m, tx, ty, r)) {
    const q = [goal];
    gre.add(goal);
    for (let k = 0; k < q.length && q.length < 64; k++) {
      const c = q[k], x0 = c % W, y0 = Math.floor(c / W);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x0 + dx, ny = y0 + dy, n = ny * W + nx;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H || gre.has(n) || (m.cell[n] & OBJ) !== OBJ) continue;
        if (!walkable(m, cxOf(n), cyOf(n), r) || !segmentWalkable(m, px(c), py(c), cxOf(n), cyOf(n), r)) continue;
        gre.add(n);
        q.push(n);
      }
    }
  }
  const open = (i: number) => !(m.cell[i] & CELL_BLOCK) || gre.has(i) || ((m.cell[i] & OBJ) === OBJ && esc.has(cur) && walkable(m, cxOf(i), cyOf(i), r));
  const g = new Map<number, number>();
  const from = new Map<number, number>();
  const heap = new Heap(W * H);
  const h = (i: number) => {
    const dx = Math.abs((i % W) - tcx), dy = Math.abs(Math.floor(i / W) - tcy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  g.set(s, 0);
  heap.f[s] = h(s);
  heap.push(s);
  let best = s, bestH = h(s), expanded = 0;
  const closed = new Set<number>();
  while (heap.size) {
    cur = heap.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (cur === goal) { best = cur; break; }
    const hc = h(cur);
    if (hc < bestH) { bestH = hc; best = cur; }
    if (++expanded > maxNodes) break;
    const cx = cur % W, cy = Math.floor(cur / W);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!open(n) && n !== goal) continue;
      if (!open(n)) continue;
      if (dx && dy && (!open(cy * W + nx) || !open(ny * W + cx))) continue;
      if ((esc.has(cur) || gre.has(n)) && !segmentWalkable(m, px(cur), py(cur), px(n), py(n), r)) continue;
      const ng = g.get(cur)! + (dx && dy ? 1.414 : 1);
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        from.set(n, cur);
        if (esc.has(cur) && (m.cell[n] & OBJ) === OBJ) esc.add(n);
        heap.f[n] = ng + h(n);
        heap.push(n);
      }
    }
  }
  if (best === s) return null;
  const cells: number[] = [];
  for (let c = best; c !== s; c = from.get(c)!) cells.push(c);
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

// ---------- сравнение ----------
const m = generateMap(MAP_SEED);
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0x100000000);
const W = m.w * TILE, H = m.h * TILE;
const queries: [number, number, number, number, number][] = [];
while (queries.length < 1500) {
  const sx = rnd() * W, sy = rnd() * H;
  if (!walkable(m, sx, sy, 10)) continue;
  // ближние (погоня, 2–30 клеток) и дальние (клик по карте); часть целей — в стенах
  const far = rnd() < 0.2, d = (far ? 120 : 30) * TILE;
  const tx = Math.max(0, Math.min(W - 1, sx + (rnd() * 2 - 1) * d)), ty = Math.max(0, Math.min(H - 1, sy + (rnd() * 2 - 1) * d));
  queries.push([sx, sy, tx, ty, rnd() < 0.5 ? 10 : 14]);
}
let bad = 0, found = 0;
for (const [sx, sy, tx, ty, r] of queries) {
  const a = JSON.stringify(findPathRef(m, sx, sy, tx, ty, r)), b = JSON.stringify(findPath(m, sx, sy, tx, ty, r));
  if (a !== b) { if (++bad <= 5) console.log("FAIL путь различается", sx, sy, tx, ty, r); }
  else if (a !== "null") found++;
}
// замер — справочный, на части запросов и одним проходом (сравнение выше уже прогрело обе версии): весь набор ×3 с прогревом шёл минутами под нагрузкой
const TIMED = queries.slice(0, 300);
const time = (fn: typeof findPath) => {
  const t = performance.now();
  for (const [sx, sy, tx, ty, r] of TIMED) fn(m, sx, sy, tx, ty, r);
  return (performance.now() - t) / TIMED.length;
};
const before = time(findPathRef), after = time(findPath);
console.log(`A*: ${queries.length} запросов, путей ${found}, различий ${bad}; до ${before.toFixed(3)} мс, после ${after.toFixed(3)} мс на запрос (×${(before / after).toFixed(1)})`);
if (bad) process.exit(1);
console.log("OK path-buffer");
