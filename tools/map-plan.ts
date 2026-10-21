/**
 * Задача 132, шаг 1: схема карты «было | стало» на утверждение пользователю. Файлы игры не меняет.
 * Запуск: npx tsx tools/map-plan.ts [was] [A] [B]   (Chrome: переменная CHROME_PATH или стандартные пути)
 * Вывод: tools/out/map-plan/1-bylo.png, 2-stalo-A-ember-vverhu.png, 3-stalo-B-ember-vnizu.png
 *
 * «Было» строится из generateMap (как tools/preview-map.ts) с подписями зон и уровней; пути — по проходимым клеткам настоящей карты.
 * «Стало» — модель схемы ниже в тайлах (1100×360). Запад задан руками, восток — зеркало: x → 1100 − x в непрерывных координатах
 * (тайл i ↔ 1099 − i). Пути считаются по сетке проходимости схемы: река, край карты и стены непроходимы, открыты мосты и ворота,
 * броды у краёв закрыты (река идёт до воды края). Ход — 16 направлений, один тайл = 32 px, скорость героя 150 px/с.
 * Код возврата 1, если пути или рост уровней от двух столиц расходятся больше чем на 3 % либо самопроверки схемы (зеркальность, мосты,
 * достижимость целей) не прошли.
 */
import fs from "node:fs";
import { PNG } from "pngjs";
import puppeteer from "puppeteer-core";
import world from "../data/world.json";
import { BOSS_SPAWNS, CELL_BLOCK, CELL_WALL, TOWN, ZONES, ZONE_COUNT, Zone, generateMap } from "../shared/map";
import { cityById } from "../shared/cities";
import { MAP_H, MAP_SEED, MAP_W, MID, PLAYER_SPEED, TILE } from "../shared/constants";

type P = [number, number];
type Fac = "sol" | "umb" | "emb";
const W = MAP_W, H = MAP_H, AXIS = W / 2;
const OUT = "tools/out/map-plan";
/** Тайлов в секунду при скорости героя. */
const TPS = PLAYER_SPEED / TILE;

// ===================================================================== общие утилиты
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n: number) => Math.round(n * 10) / 10;
const pts = (a: P[]) => a.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");
const mirrorPts = (a: P[]): P[] => a.map(([x, y]) => [W - x, y]);
const fmtT = (tiles: number) => {
  const s = Math.round(tiles / TPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const diffPct = (a: number, b: number) => (Math.max(a, b) <= 0 ? 0 : (Math.abs(a - b) / Math.max(a, b)) * 100);
const fmtPct = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;
const lerpTable = (x: number, xs: number[], ys: number[]) => {
  if (x <= xs[0]) return ys[0];
  for (let i = 0; i < xs.length - 1; i++) if (x <= xs[i + 1]) return ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / (xs[i + 1] - xs[i]);
  return ys[ys.length - 1];
};
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    let i = this.k.length;
    this.k.push(key); this.v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= key) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = key; this.v[i] = val;
  }
  pop(): [number, number] {
    const rk = this.k[0], rv = this.v[0];
    const lk = this.k.pop()!, lv = this.v.pop()!;
    const n = this.k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && this.k[c + 1] < this.k[c]) c++;
        if (this.k[c] >= lk) break;
        this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
      }
      this.k[i] = lk; this.v[i] = lv;
    }
    return [rk, rv];
  }
}

/** 16 направлений: соседи и «ход коня»; все клетки охватывающего прямоугольника хода должны быть проходимы (углы не срезаются). */
const MOVES = (() => {
  const out: { dx: number; dy: number; c: number; chk: [number, number][] }[] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if ((!dx && !dy) || ax + ay > 3 || (ax === 2 && ay === 0) || (ax === 0 && ay === 2)) continue;
    const chk: [number, number][] = [];
    for (let y = Math.min(0, dy); y <= Math.max(0, dy); y++) for (let x = Math.min(0, dx); x <= Math.max(0, dx); x++) if (x || y) chk.push([x, y]);
    out.push({ dx, dy, c: Math.hypot(dx, dy), chk });
  }
  return out;
})();

/** Кратчайшие пути по сетке проходимости (W×H) из клетки (sx, sy). */
function dijkstra(pass: Uint8Array, sx: number, sy: number) {
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const heap = new MinHeap();
  const s = sy * W + sx;
  dist[s] = 0;
  heap.push(0, s);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const mv of MOVES) {
      const nx = x + mv.dx, ny = y + mv.dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      let ok = true;
      for (const [ox, oy] of mv.chk) {
        const cx = x + ox, cy = y + oy;
        if (cx < 0 || cy < 0 || cx >= W || cy >= H || !pass[cy * W + cx]) { ok = false; break; }
      }
      if (!ok) continue;
      const nd = d + mv.c, j = ny * W + nx;
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  return { dist, prev };
}
type Paths = ReturnType<typeof dijkstra>;

/** Ближайшая проходимая (и достижимая, если задан dist) клетка к точке (непрерывные координаты). */
function snap(pass: Uint8Array, x: number, y: number, dist?: Float64Array): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let best = -1, bd = Infinity, found = -1;
  for (let r = 0; r < 80 && (found < 0 || r <= found + 1); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const cx = ix + dx, cy = iy + dy;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      const i = cy * W + cx;
      if (!pass[i] || (dist && !isFinite(dist[i]))) continue;
      const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - y);
      if (d < bd) { bd = d; best = i; if (found < 0) found = r; }
    }
  }
  return best;
}

/** Путь от источника до клетки: индексы клеток по порядку. */
function trace(prev: Int32Array, target: number): number[] {
  const out: number[] = [];
  for (let i = target; i >= 0; i = prev[i]) out.push(i);
  return out.reverse();
}
/** Упрощение ломаной (Дуглас — Пекер). */
function simplify(a: P[], eps: number): P[] {
  if (a.length < 3) return a;
  const [ax, ay] = a[0], [bx, by] = a[a.length - 1];
  const l = Math.hypot(bx - ax, by - ay) || 1;
  let md = 0, mi = 0;
  for (let i = 1; i < a.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - a[i][1]) - (ax - a[i][0]) * (by - ay)) / l;
    if (d > md) { md = d; mi = i; }
  }
  if (md <= eps) return [a[0], a[a.length - 1]];
  return [...simplify(a.slice(0, mi + 1), eps).slice(0, -1), ...simplify(a.slice(mi), eps)];
}

interface PathInfo { poly: P[]; ticks: { at: P; d: number }[]; len: number; cells: number[] }
function pathInfo(res: Paths, target: number, step = 100): PathInfo {
  const cells = trace(res.prev, target);
  const raw: P[] = cells.map((i) => [(i % W) + 0.5, ((i / W) | 0) + 0.5]);
  const ticks: { at: P; d: number }[] = [];
  let next = step;
  cells.forEach((i, k) => {
    if (res.dist[i] >= next) { ticks.push({ at: raw[k], d: next }); next += step; }
  });
  return { poly: simplify(raw, 0.7), ticks, len: res.dist[target], cells };
}

// ===================================================================== «Было»
const COLORS = ["#3b6fb6", "#e0562b", "#d9c48a", "#4b5a3a", "#5c5150", "#9b7a52", "#6aa84f", "#3d6e3a", "#a29a8c", "#57525c", "#e6eef2", "#a8d4e6", "#2c2a35", "#e0c27a", "#2f5d8f"];
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const CITY_SHORT: Partial<Record<Zone, string>> = {
  [Zone.Town]: "Эмберхолл", [Zone.OasisCity]: "Оазис", [Zone.SnowCity]: "Снежная долина", [Zone.SolgardCity]: "Аурелион", [Zone.UmbrathCity]: "Мортхейм",
};

/** Точка зоны, наиболее удалённая от её границы («полюс недоступности»), на крупной сетке 4×4 тайла. */
function zonePoles(zone: Uint8Array, w: number, h: number) {
  const B = 4, bw = Math.ceil(w / B) + 2, bh = Math.ceil(h / B) + 2;
  const blk = new Int16Array(bw * bh).fill(-1);
  for (let by = 0; by < bh - 2; by++) for (let bx = 0; bx < bw - 2; bx++) {
    blk[(by + 1) * bw + bx + 1] = zone[Math.min(h - 1, by * B + 2) * w + Math.min(w - 1, bx * B + 2)];
  }
  const out = new Map<number, { x: number; y: number; d: number; n: number }>();
  for (let z = 0; z < ZONE_COUNT; z++) {
    const d = new Float32Array(bw * bh);
    let n = 0;
    for (let i = 0; i < d.length; i++) { d[i] = blk[i] === z ? 1e9 : 0; if (blk[i] === z) n++; }
    if (!n) continue;
    const rel = (i: number, di: number, c: number) => { if (d[i + di] + c < d[i]) d[i] = d[i + di] + c; };
    for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
      const i = y * bw + x;
      if (d[i] === 0) continue;
      rel(i, -1, 1); rel(i, -bw, 1); rel(i, -bw - 1, 1.414); rel(i, -bw + 1, 1.414);
    }
    for (let y = bh - 2; y >= 1; y--) for (let x = bw - 2; x >= 1; x--) {
      const i = y * bw + x;
      if (d[i] === 0) continue;
      rel(i, 1, 1); rel(i, bw, 1); rel(i, bw + 1, 1.414); rel(i, bw - 1, 1.414);
    }
    let bi = -1, bd = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > bd && d[i] < 1e8) { bd = d[i]; bi = i; }
    if (bi >= 0) out.set(z, { x: ((bi % bw) - 1) * B + B / 2, y: (Math.floor(bi / bw) - 1) * B + B / 2, d: bd * B, n: n * B * B });
  }
  return out;
}

interface WasRow { name: string; lv: string; a: number; m: number; pair: boolean; note?: string }

function buildWas() {
  const m = generateMap(MAP_SEED);
  const w = m.w, h = m.h, S = 2;
  const png = new PNG({ width: w * S, height: h * S });
  for (let y = 0; y < h * S; y++) for (let x = 0; x < w * S; x++) {
    const cx = x >> 1, cy = y >> 1, ci = cy * w + cx;
    let c = hex(COLORS[m.vtx[cy * (w + 1) + cx]] ?? "#ff00ff");
    const f = m.cell[ci];
    if (f & CELL_WALL) c = [40, 34, 44];
    else if (f & CELL_BLOCK) c = c.map((v) => v * 0.62);
    // граница зон: линия по правому и нижнему краю клетки
    const z = m.zone[ci];
    const edgeX = (x & 1) === 1 && cx + 1 < w && m.zone[ci + 1] !== z;
    const edgeY = (y & 1) === 1 && cy + 1 < h && m.zone[ci + w] !== z;
    if (edgeX || edgeY) c = c.map((v) => v * 0.45 + 255 * 0.55);
    const i = (y * png.width + x) * 4;
    png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255;
  }
  const b64 = PNG.sync.write(png).toString("base64");

  const pass = new Uint8Array(w * h);
  for (let i = 0; i < pass.length; i++) pass[i] = m.cell[i] & (CELL_BLOCK | CELL_WALL) ? 0 : 1;
  const au = cityById("aurelion")!, mo = cityById("morthaim")!, em = cityById("ember")!;
  const cellOf = (px: number, py: number) => Math.floor(py / TILE) * w + Math.floor(px / TILE);
  const rA = dijkstra(pass, Math.floor(au.spawn.x / TILE), Math.floor(au.spawn.y / TILE));
  const rM = dijkstra(pass, Math.floor(mo.spawn.x / TILE), Math.floor(mo.spawn.y / TILE));
  const reach = new Float64Array(w * h);
  for (let i = 0; i < reach.length; i++) reach[i] = Math.max(rA.dist[i], rM.dist[i]);

  const poles = zonePoles(m.zone, w, h);
  const target = (z: Zone) => {
    const p = poles.get(z);
    return p ? snap(pass, p.x, p.y, reach) : -1;
  };
  const row = (name: string, lv: string, tA: number, tM: number, pair: boolean, note?: string): WasRow => ({
    name, lv, a: tA >= 0 ? rA.dist[tA] : Infinity, m: tM >= 0 ? rM.dist[tM] : Infinity, pair, note,
  });
  const lv = (z: Zone) => (ZONES[z].levels[1] ? `${ZONES[z].levels[0]}–${ZONES[z].levels[1]}` : "город");
  const nm = (z: Zone) => CITY_SHORT[z] ?? ZONES[z].name;
  const mirrorCell = (c: number) => (c < 0 ? -1 : snap(pass, w - 1 - (c % w) + 0.5, ((c / w) | 0) + 0.5, rM.dist));
  const rows: (WasRow | string)[] = [];
  rows.push("Пары «Сольгард | Умбрат»: Аурелион → центр зоны запада, Мортхейм → зеркальная ей точка востока");
  for (const [a, b] of [[Zone.SunFields, Zone.Barrows], [Zone.KingsWood, Zone.MistWood], [Zone.GryphonCliffs, Zone.BoneRidge], [Zone.FallenBarrens, Zone.PlagueMarsh], [Zone.Desert, Zone.AshFoothills]] as [Zone, Zone][]) {
    const ta = target(a);
    rows.push(row(`${nm(a)} | ${nm(b)}`, lv(a) === lv(b) ? lv(a) : `${lv(a)} | ${lv(b)}`, ta, mirrorCell(ta), true));
  }
  rows.push("Центр: одна цель для обеих столиц");
  const spawnOf: Partial<Record<Zone, string>> = { [Zone.Town]: "ember", [Zone.OasisCity]: "oasis", [Zone.SnowCity]: "snow_valley" };
  for (const z of [Zone.Town, Zone.Meadow, Zone.Forest, Zone.Swamp, Zone.Ashlands, Zone.Dungeon, Zone.Snow, Zone.Coast, Zone.StormPeaks, Zone.Volcano, Zone.OasisCity, Zone.SnowCity]) {
    const cid = spawnOf[z];
    const city = cid ? cityById(cid) : undefined;
    const t = city ? cellOf(city.spawn.x, city.spawn.y) : target(z);
    rows.push(row(nm(z), lv(z), t, t, false));
  }
  // зал босса данжа: проверка без привязки к ближайшей клетке
  const ash = BOSS_SPAWNS.find((b) => b.id === "ashlord")!;
  const ashCell = cellOf(ash.x, ash.y);
  rows.push(row("Зал Ашлорда (босс данжа)", "42–48", ashCell, ashCell, false, "пешком недостижим"));
  const emT = cellOf(em.spawn.x, em.spawn.y);
  const pA = pathInfo(rA, emT), pM = pathInfo(rM, emT);
  /** Уровень по пути: середина диапазона зоны под ногами (в городах уровень не меняется). */
  const zoneLv = (res: Paths, pi: PathInfo): [number, number][] => {
    let last = 1;
    return [0, 100, 200, 300, 400, 500, pi.len].map((d) => {
      const i = pi.cells.find((c) => res.dist[c] >= Math.min(d, pi.len)) ?? pi.cells[pi.cells.length - 1];
      const lv = ZONES[m.zone[i] as Zone].levels;
      if (lv[1] > 0) last = Math.round((lv[0] + lv[1]) / 2);
      return [Math.round(d), last];
    });
  };
  const lvA = zoneLv(rA, pA), lvM = zoneLv(rM, pM);

  const rivers = Object.entries(world.rivers).filter(([k]) => k !== "_doc").map(([name, r]) => ({ name, ...(r as unknown as { width: number; path: P[] }) }));
  const meanX = (path: P[]) => {
    let s = 0;
    for (let y = 0; y < h; y++) {
      for (let i = 0; i < path.length - 1; i++) if (y >= path[i][1] && y <= path[i + 1][1]) { s += path[i][0] + ((path[i + 1][0] - path[i][0]) * (y - path[i][1])) / (path[i + 1][1] - path[i][1]); break; }
    }
    return s / h;
  };
  const rx0 = meanX(rivers[0].path), rx1 = meanX(rivers[1].path);
  const gap = Math.round(rx1 - rx0);

  // ---- рисунок: растр карты, шапка, подписи зон (в стороне от линий путей), боссы, мосты, пути
  const nearPath = (x: number, y: number) => {
    let best = 1e9;
    for (const pl of [pA.poly, pM.poly]) for (let i = 0; i < pl.length - 1; i++) {
      const [ax, ay] = pl[i], [bx, by] = pl[i + 1];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      best = Math.min(best, Math.hypot(ax + t * dx - x, ay + t * dy - y));
    }
    return best;
  };
  const yAt = (pl: P[], x: number) => {
    for (let i = 0; i < pl.length - 1; i++) {
      const [ax, ay] = pl[i], [bx, by] = pl[i + 1];
      if (ax !== bx && (x - ax) * (x - bx) <= 0) return ay + ((by - ay) * (x - ax)) / (bx - ax);
    }
    return 180;
  };
  let svg = defs() + `<image href="data:image/png;base64,${b64}" x="0" y="0" width="${w}" height="${h}" style="image-rendering:pixelated"/>`;
  // старый мир Эмберхолла и ось симметрии
  svg += `<rect x="${MID.x}" y="${MID.y}" width="${MID.w}" height="${MID.h}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width=".7" stroke-dasharray="4 3"/>`;
  svg += `<text class="t s5" x="${MID.x + 2}" y="${MID.y - 3}" style="text-anchor:start">старая середина MID 320×240</text>`;
  svg += `<line x1="${AXIS}" y1="0" x2="${AXIS}" y2="${h}" stroke="#ffd23f" stroke-width=".7" stroke-dasharray="6 4"/>`;
  svg += `<text class="t s5 y" x="${AXIS + 3}" y="9" style="text-anchor:start">ось симметрии карты (x = 550)</text>`;
  // подписи зон
  const CITY_DY: Partial<Record<Zone, number>> = { [Zone.Town]: -25, [Zone.OasisCity]: -16, [Zone.SnowCity]: -16, [Zone.SolgardCity]: -16, [Zone.UmbrathCity]: -16 };
  for (const [z, p] of poles) {
    if (z === Zone.Arena || z === Zone.Frontier || z === Zone.Citadel) continue;
    const city = CITY_SHORT[z as Zone];
    if (!city && p.d < 7) continue;
    if (city) { svg += `<text class="t s6 b" x="${r1(p.x)}" y="${r1(p.y + (CITY_DY[z as Zone] ?? 0))}">${esc(city)}</text>`; continue; }
    const info = ZONES[z];
    const cand = [p.y, p.y - 14, p.y + 14, p.y - 26, p.y + 26].filter((c) => c > 10 && c < h - 12);
    const y = cand.find((c) => nearPath(p.x, c) >= 10) ?? cand.reduce((a, b) => (nearPath(p.x, b) > nearPath(p.x, a) ? b : a));
    svg += `<text class="t s6" x="${r1(p.x)}" y="${r1(y - 1)}">${esc(info.name)}</text><text class="t s7 b y" x="${r1(p.x)}" y="${r1(y + 6.5)}">${info.levels[0]}–${info.levels[1]}</text>`;
  }
  // реки, мосты, боссы
  for (const r of rivers) svg += `<text class="t s5 bl" x="${r.path[2][0] + 3}" y="${r.path[2][1]}" style="text-anchor:start">р. ${esc(r.name)}</text>`;
  for (const o of m.objects) if (o.kind === "bridge_h" || o.kind === "bridge_v") svg += `<rect x="${r1(o.x / TILE - 3)}" y="${r1(o.y / TILE - 3)}" width="6" height="3" fill="#a8855a" stroke="#fff" stroke-width=".5"/>`;
  const bossName: Record<string, string> = { ent: "Ent 28", witch: "Ведьма 38", ashlord: "Ашлорд 46 (данж)" };
  for (const b of BOSS_SPAWNS) svg += `<circle cx="${r1(b.x / TILE)}" cy="${r1(b.y / TILE)}" r="3" fill="#d6372a" stroke="#fff" stroke-width=".6"/><text class="t s5" x="${r1(b.x / TILE + 5)}" y="${r1(b.y / TILE + 1.6)}" style="text-anchor:start">босс ${esc(bossName[b.id] ?? b.id)}</text>`;
  svg += `<text class="t s5" x="792" y="204" style="fill:#ffb3a8;text-anchor:start">дорога Умбрата обрывается: прямой к центру нет</text>`;
  // пути к Эмберхоллу
  const drawPath = (pi: PathInfo, col: string) => {
    let s = `<polyline points="${pts(pi.poly)}" fill="none" stroke="#06232b" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${pts(pi.poly)}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const t of pi.ticks) s += `<circle cx="${r1(t.at[0])}" cy="${r1(t.at[1])}" r="2.4" fill="#06232b" stroke="${col}" stroke-width=".6"/><text class="t s4" x="${r1(t.at[0])}" y="${r1(t.at[1] + 1.4)}" style="stroke-width:0">${t.d}</text>`;
    return s;
  };
  svg += drawPath(pA, "#35e0e6") + drawPath(pM, "#ffa14a");
  svg += `<text class="t s6 b" x="330" y="${r1(yAt(pA.poly, 330) - 9)}" style="fill:#35e0e6">Аурелион → Эмберхолл: ${Math.round(pA.len)} тайлов</text>`;
  svg += `<text class="t s6 b" x="880" y="${r1(yAt(pM.poly, 880) - 9)}" style="fill:#ffa14a">Мортхейм → Эмберхолл: ${Math.round(pM.len)} тайлов</text>`;
  // шапка и нижняя строка
  svg += hdSpan(2, 398, "#6aa84f", "ЗЕМЛИ СОЛЬГАРДА (запад)") + hdSpan(402, 718, "#c9c1a3", "СТАРАЯ СЕРЕДИНА: Эмберхолл, Оазис, Снежная долина", "#e9e3cd") + hdSpan(722, 1098, "#8a6fb5", "ЗЕМЛИ УМБРАТА (восток)");
  const yb = h + 14;
  svg += `<line x1="${r1(rx0)}" y1="${yb}" x2="${r1(rx1)}" y2="${yb}" stroke="#fff" stroke-width=".7" marker-start="url(#ar-sol)" marker-end="url(#ar-sol)"/>`
    + `<text class="t s6 b" x="${AXIS}" y="${yb - 3}">между реками ${gap} тайлов · центр Эмберхолла на x = ${TOWN.x}, ось карты — x = 550</text>`;
  return { svg, rows, pA: pA.len, pM: pM.len, gap, rx: [rx0, rx1] as const, lvA, lvM };
}

// ===================================================================== «Стало»: модель схемы
/** Запад (Сольгард); восток — зеркало. Всё в непрерывных координатах тайлов. */
const RIV_W: P[] = [[210, -8], [210, 0], [205, 45], [211, 95], [206, 140], [210, 190], [205, 240], [211, 290], [207, 330], [209, 360], [209, 368]];
const RIV_HW = 2.2;
function riverX(y: number): number {
  for (let i = 0; i < RIV_W.length - 1; i++) {
    const [x0, y0] = RIV_W[i], [x1, y1] = RIV_W[i + 1];
    if (y >= y0 && y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return RIV_W[RIV_W.length - 1][0];
}
const BRIDGES = [{ id: "N", y: 62, name: "Северный мост" }, { id: "M", y: 180, name: "Главный мост" }, { id: "S", y: 298, name: "Южный мост" }];
const CAP: P = [56.5, 180.5];
/** Оболочки безопасных земель вокруг столицы: u — эллиптическое расстояние (u = 1 у реки на уровне столицы). */
const SH = { A: 152, B: 217, u: [0.322, 0.553, 0.783] };
const uOf = (x: number, y: number) => Math.hypot((x - CAP[0]) / SH.A, (y - CAP[1]) / SH.B);
/** Поля вечных битв — эллипс вокруг оси; кольцо 40–80 — четыре пояса вокруг него (v — расстояние в долях эллипса). */
const FLD = { rx: 165, ry: 190 };
const VB = [1, 1.2675, 1.535, 1.8025, 2.07];
const vOf = (x: number, y: number) => Math.hypot((x - AXIS) / FLD.rx, (y - 180) / FLD.ry);
const FORT: P = [392.5, 180.5];

function levelAt(x: number, y: number): number {
  const xm = x > AXIS ? W - x : x;
  if (xm < riverX(y)) return lerpTable(uOf(xm, y), [0, SH.u[0], SH.u[1], SH.u[2], 1], [1, 10, 20, 30, 40]);
  const v = vOf(xm, y);
  if (v < 1) return 80 + 20 * (1 - v);
  return Math.max(40, 80 - (40 * (v - 1)) / (VB[4] - 1));
}

/** Зона схемы по точке: 0–3 — зоны безопасных земель (1–10 … 30–40), 4–7 — пояса кольца (40–50 … 70–80), 8 — Поля вечных битв. */
function zoneIdAt(x: number, y: number): number {
  const xm = x > AXIS ? W - x : x;
  if (xm < riverX(y)) {
    const u = uOf(xm, y);
    return u < SH.u[0] ? 0 : u < SH.u[1] ? 1 : u < SH.u[2] ? 2 : 3;
  }
  const v = vOf(xm, y);
  if (v < VB[0]) return 8;
  return v < VB[1] ? 7 : v < VB[2] ? 6 : v < VB[3] ? 5 : 4;
}
/** Площадь каждой зоны на западной половине карты в тайлах (без воды края и реки). */
function zoneAreas(): number[] {
  const a = new Array<number>(9).fill(0);
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < AXIS; x++) {
    const px = x + 0.5, py = y + 0.5;
    if (Math.abs(px - riverX(py)) < RIV_HW) continue;
    a[zoneIdAt(px, py)]++;
  }
  return a;
}

const LANDS = [
  { lv: "1–10", sol: "Золотые нивы", umb: "Курганы Мёртвых", set: ["Ясный Дол", "Погост Скорби"], at: [96, 214] as P },
  { lv: "10–20", sol: "Королевская пуща", umb: "Мглистый бор", set: ["Мельничный Брод", "Чёрный Брод"], at: [112, 126] as P },
  { lv: "20–30", sol: "Зелёные холмы", umb: "Пепельные предгорья", set: ["Лагерь егерей", "Руины Белой Башни"], at: [128, 262] as P },
  { lv: "30–40", sol: "Шепчущий лес", umb: "Гнилые топи", set: ["Застава Светлой", "Застава Чёрной"], at: [180, 150] as P },
];
const RINGS = ["40–50", "50–60", "60–70", "70–80"];
/** Какое место на тракте (y = 180) — середина пояса кольца k (0 — внешний, у реки). */
const ringMidX = (k: number) => AXIS - FLD.rx * (VB[4 - k] + VB[3 - k]) / 2;

interface Variant { id: "A" | "B"; s: -1 | 1; title: string; file: string; word: string; note: string }
/** Варианты — зеркало по вертикали: числа путей те же, различается соседство по биомам (сейчас север — снега, юг — вулкан и пепел). */
const VARIANTS: Variant[] = [
  { id: "A", s: -1, title: "Вариант А — Эмберхолл вверху, на оси симметрии", file: "2-stalo-A-ember-vverhu.png", word: "вверху", note: "По нынешним биомам север — снега: Эмберхолл здесь окружён снегами, а данж — вулканом." },
  { id: "B", s: 1, title: "Вариант Б — Эмберхолл внизу, на оси симметрии", file: "3-stalo-B-ember-vnizu.png", word: "внизу", note: "По нынешним биомам юг — вулкан и пепел: Эмберхолл («угли») здесь стоит в пепле, а данж — среди снегов." },
];

interface Geo {
  emb: P; dun: P; dunEnt: P; dunFront: P; wb: P;
  roads: { id: string; pts: P[] }[];
  squads: { id: string; pts: P[] }[];
  bosses: { id: string; at: P; arena: number; label: string }[];
  settle: { at: P; set: [string, string]; lv: string; i: number }[];
}

function geoOf(v: Variant): Geo {
  const s = v.s;
  const emb: P = [AXIS, 180 + s * 120];
  const dun: P = [AXIS, 180 - s * 132];
  const dunEnt: P = [AXIS, dun[1] + s * 19];
  const dunFront: P = [AXIS, dun[1] + s * 34];
  const wb: P = [AXIS, 180 - s * 65];
  const bx = (y: number) => riverX(y);
  const yE = 180 + s * 118, yD = 180 - s * 118; // мост на стороне Эмберхолла / на стороне данжа
  const roads: Geo["roads"] = [
    // земли: тракт от южных ворот, северная и южная дороги
    { id: "M", pts: [[56.5, 192], [68, 200], [100, 197], [140, 189], [178, 183], [bx(180), 180]] },
    { id: "N", pts: [[56.5, 169], [60, 150], [90, 128], [128, 106], [168, 84], [bx(62), 62]] },
    { id: "S", pts: [[118, 193.4], [126, 214], [138, 236], [156, 258], [184, 280], [bx(298), 298]] },
    // подъезды к поселениям
    { id: "s1", pts: [[96, 198], [96, 207]] },
    { id: "s2", pts: [[112, 115], [112, 119]] },
    { id: "s3", pts: [[157, 259.5], [137, 262]] },
    { id: "s4", pts: [[180, 182.8], [180, 157]] },
    // кольцо
    { id: "Mr", pts: [[bx(180), 180], [260, 180], [320, 181], [FORT[0] - 14.5, 180.5]] },
    { id: "Er", pts: [[bx(yE), yE], [300, yE - s * 1], [420, emb[1] + s * 1], [AXIS - 33, emb[1]]] },
    { id: "Dr", pts: [[bx(yD), yD], [340, yD], [430, yD + s * 8], [505, dunFront[1]], [AXIS, dunFront[1]], [AXIS, dunEnt[1]]] },
    // Поля
    { id: "F1", pts: [[FORT[0] + 14.5, 180.5], [AXIS, 180]] },
    { id: "F2", pts: [[FORT[0], FORT[1] + s * 11.5], [400, 180 + s * 40], [440, 180 + s * 80], [490, 180 + s * 108], [AXIS - 33, emb[1]]] },
    { id: "F3", pts: [[FORT[0], FORT[1] - s * 11.5], [405, 180 - s * 42], [430, 180 - s * 80], [440, yD + s * 8]] },
    { id: "F4", pts: [[AXIS, 180], [AXIS, emb[1] - s * 28]] },
  ];
  const squads: Geo["squads"] = [
    { id: "Q1", pts: [[FORT[0] + 14.5, 177.5], [AXIS - 3, 177.5]] },
    { id: "Q2", pts: [[FORT[0] + 14.5, 174], [440, 152], [490, 146], [532, 168], [AXIS - 3, 176]] },
    { id: "Q3", pts: [[FORT[0] + 14.5, 187], [440, 207], [490, 213], [532, 192], [AXIS - 3, 184]] },
  ];
  const bosses: Geo["bosses"] = [
    { id: "r55", at: [283, 180 + s * 68], arena: 9, label: "Босс кольца" },
    { id: "r65", at: [325, 180 - s * 68], arena: 9, label: "Босс кольца" },
    { id: "f88", at: [470, 180 + s * 66], arena: 10, label: "Босс Полей" },
    { id: "f84", at: [472, 180 - s * 72], arena: 10, label: "Босс Полей" },
  ];
  const settle = LANDS.map((l, i) => ({ at: l.at, set: [l.set[0], l.set[1]] as [string, string], lv: l.lv, i }));
  return { emb, dun, dunEnt, dunFront, wb, roads, squads, bosses, settle };
}

// ---------- сетка проходимости схемы
interface Gate { side: "N" | "S" | "E" | "W"; half: number; off?: number }
function wallBand(pass: Uint8Array, cx: number, cy: number, hx: number, hy: number, t: number, gates: Gate[]) {
  for (let y = Math.max(0, Math.floor(cy - hy - 1)); y <= Math.min(H - 1, Math.ceil(cy + hy + 1)); y++) {
    for (let x = Math.max(0, Math.floor(cx - hx - 1)); x <= Math.min(W - 1, Math.ceil(cx + hx + 1)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, ax = Math.abs(dx), ay = Math.abs(dy);
      if (!(ax <= hx && ay <= hy) || (ax <= hx - t && ay <= hy - t)) continue;
      let open = false;
      for (const g of gates) {
        const o = g.off ?? 0;
        if ((g.side === "N" && dy < 0 && ay > hy - t && Math.abs(dx - o) <= g.half) || (g.side === "S" && dy > 0 && ay > hy - t && Math.abs(dx - o) <= g.half)
          || (g.side === "W" && dx < 0 && ax > hx - t && Math.abs(dy - o) <= g.half) || (g.side === "E" && dx > 0 && ax > hx - t && Math.abs(dy - o) <= g.half)) { open = true; break; }
      }
      if (!open) pass[y * W + x] = 0;
    }
  }
}
function setRect(pass: Uint8Array, x0: number, y0: number, x1: number, y1: number, val: number) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
    const px = x + 0.5, py = y + 0.5;
    if (px >= x0 && px <= x1 && py >= y0 && py <= y1) pass[y * W + x] = val;
  }
}

/** bridges = false — та же карта без настилов мостов (для проверки, что иначе реку не пересечь). */
function buildPass(v: Variant, g: Geo, bridges = true): Uint8Array {
  const pass = new Uint8Array(W * H).fill(1);
  // край карты: вода шириной 3 тайла
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.min(x + 0.5, y + 0.5, W - x - 0.5, H - y - 0.5) < 3) pass[y * W + x] = 0;
  // реки до самой воды края (брода нет)
  for (const mir of [false, true]) {
    const path = mir ? mirrorPts(RIV_W) : RIV_W;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i], [bx, by] = path[i + 1];
      const x0 = Math.floor(Math.min(ax, bx) - RIV_HW - 1), x1 = Math.ceil(Math.max(ax, bx) + RIV_HW + 1);
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + 1));
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      for (let y = y0; y <= y1; y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        const px = x + 0.5, py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        if (Math.hypot(ax + t * dx - px, ay + t * dy - py) < RIV_HW) pass[y * W + x] = 0;
      }
    }
  }
  // мосты: настил 11×3 поперёк реки
  if (bridges) for (const b of BRIDGES) for (const mir of [false, true]) {
    const cx = mir ? W - riverX(b.y) : riverX(b.y);
    setRect(pass, cx - 5.5, b.y - 1.5, cx + 5.5, b.y + 1.5, 1);
  }
  // столицы и форты: стены с воротами
  for (const mir of [false, true]) {
    const cx = mir ? W - CAP[0] : CAP[0];
    wallBand(pass, cx, CAP[1], 14.5, 11.5, 1, [{ side: "N", half: 1.5 }, { side: "S", half: 1.5 }]);
    const fx = mir ? W - FORT[0] : FORT[0];
    wallBand(pass, fx, FORT[1], 14.5, 11.5, 1, [{ side: "W", half: 2.5 }, { side: "E", half: 2.5 }, { side: "N", half: 1.5 }, { side: "S", half: 1.5 }]);
    for (const st of g.settle) {
      const sx = mir ? W - st.at[0] : st.at[0];
      wallBand(pass, sx, st.at[1], 8, 7, 1, [{ side: "W", half: 1.5 }, { side: "E", half: 1.5 }]);
    }
  }
  // Эмберхолл: стены города и частокол безопасной полосы, по четыре ворота
  wallBand(pass, AXIS, g.emb[1], 25, 20, 1, [{ side: "N", half: 2 }, { side: "S", half: 2 }, { side: "W", half: 1.5 }, { side: "E", half: 1.5 }]);
  wallBand(pass, AXIS, g.emb[1], 33, 28, 1.5, [{ side: "N", half: 3 }, { side: "S", half: 3 }, { side: "W", half: 3 }, { side: "E", half: 3 }]);
  // данж: глухой прямоугольник, вход снаружи у оси
  setRect(pass, AXIS - 28, g.dun[1] - 19, AXIS + 28, g.dun[1] + 19, 0);
  return pass;
}

// ---------- расчёт строк таблицы
interface Row { n: number; name: string; lv: string; what: string; p: P; pair: boolean; sec?: string; zid?: number }
function rowsOf(v: Variant, g: Geo): Row[] {
  const out: Row[] = [];
  out.push({ n: 0, name: "", lv: "", what: "", p: [0, 0], pair: true, sec: "Безопасные земли 1–40 — четыре большие зоны по 10 уровней (Сольгард | Умбрат; названия рабочие)" });
  LANDS.forEach((l, i) => out.push({ n: i + 1, name: `${l.sol} | ${l.umb}`, lv: l.lv, what: `поселение ${i + 1}: ${l.set[0]} | ${l.set[1]}`, p: l.at, pair: true, zid: i }));
  out.push({ n: 0, name: "", lv: "", what: "", p: [0, 0], pair: true, sec: "Кольцо 40–80 — небезопасная зона (четыре пояса, середина на тракте)" });
  RINGS.forEach((lv, k) => out.push({ n: 5 + k, name: `Кольцо ${["I", "II", "III", "IV"][k]}`, lv, what: "тракт, середина пояса", p: [ringMidX(k), 180.5], pair: true, zid: 4 + k }));
  out.push({ n: 0, name: "", lv: "", what: "", p: [0, 0], pair: true, sec: "Поля вечных битв 80–100 — «Опасная зона»" });
  out.push({ n: 9, name: "Поля вечных битв", lv: "80–100", what: "граница Полей на тракте", p: [AXIS - FLD.rx, 180.5], pair: true, zid: 8 });
  out.push({ n: 0, name: "", lv: "", what: "", p: [0, 0], pair: true, sec: "Места" });
  BRIDGES.forEach((b, i) => out.push({ n: 10 + i, name: `${b.name} (пост)`, lv: "30–40 | 40–50", what: "пост на берегу своих земель", p: [riverX(b.y) - 8, b.y], pair: true }));
  out.push({ n: 13, name: "Форт Сольгарда | Форт Умбрата", lv: "≈80", what: "центр форта на краю Полей", p: FORT, pair: true });
  out.push({ n: 14, name: "Эмберхолл (ось)", lv: "≈87", what: "центр города", p: g.emb, pair: false });
  out.push({ n: 15, name: "Сходка отрядов (центр Полей)", lv: "100", what: "центр карты", p: [AXIS, 180], pair: false });
  out.push({ n: 16, name: "Мировой босс (ось)", lv: `≈${Math.round(levelAt(g.wb[0], g.wb[1]))}`, what: "арена на оси", p: g.wb, pair: false });
  out.push({ n: 17, name: "Данж (вход, ось)", lv: `≈${Math.round(levelAt(g.dunEnt[0], g.dunEnt[1]))}`, what: "вход на оси, зал босса внутри", p: [g.dunEnt[0], g.dunEnt[1] + v.s * 3], pair: false });
  g.bosses.forEach((b, i) => out.push({ n: 18 + i, name: `${b.label} (пара)`, lv: `≈${Math.round(levelAt(b.at[0], b.at[1]))}`, what: "арена босса", p: b.at, pair: true }));
  return out;
}

interface PlanData {
  v: Variant; g: Geo; pass: Uint8Array; rows: Row[];
  vals: { a: number; m: number }[];
  pA: PathInfo; pM: PathInfo; lvA: [number, number][]; lvM: [number, number][];
  maxDiff: number; maxLvDiff: number; checks: string[]; areas: number[]; capToCap: number;
}

/** Самопроверка схемы: зеркальность сетки, закрытые броды (без мостов за реку не попасть), достижимость всех целей. */
function selfCheck(v: Variant, g: Geo, pass: Uint8Array, rows: Row[], vals: { a: number; m: number }[]): string[] {
  const out: string[] = [];
  let asym = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) if (pass[y * W + x] !== pass[y * W + (W - 1 - x)]) asym++;
  out.push(asym === 0 ? "сетка проходимости зеркальна: 0 несовпадающих клеток" : `ВНИМАНИЕ: сетка не зеркальна, ${asym} клеток`);
  const dry = buildPass(v, g, false);
  const s0 = snap(dry, CAP[0], CAP[1]);
  const rd = dijkstra(dry, s0 % W, (s0 / W) | 0);
  let leak = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFinite(rd.dist[y * W + x]) && x > riverX(y) + RIV_HW) leak++;
  out.push(leak === 0 ? "без мостов за реку не попасть: ни на чужую безопасную землю, ни в центр (броды закрыты)" : `ВНИМАНИЕ: без мостов достижимо ${leak} клеток за рекой`);
  const bad = rows.reduce((n, r, i) => n + (r.sec || (isFinite(vals[i].a) && isFinite(vals[i].m)) ? 0 : 1), 0);
  out.push(bad === 0 ? "все цели таблицы достижимы пешком" : `ВНИМАНИЕ: недостижимых целей ${bad}`);
  return out;
}

function buildPlan(v: Variant): PlanData {
  const g = geoOf(v);
  const pass = buildPass(v, g);
  const sa = snap(pass, CAP[0], CAP[1]), sm = snap(pass, W - CAP[0], CAP[1]);
  const rA = dijkstra(pass, sa % W, (sa / W) | 0), rM = dijkstra(pass, sm % W, (sm / W) | 0);
  const rows = rowsOf(v, g);
  const vals: PlanData["vals"] = [];
  let maxDiff = 0;
  for (const r of rows) {
    if (r.sec) { vals.push({ a: 0, m: 0 }); continue; }
    let a: number, m: number;
    if (r.pair) {
      const c = snap(pass, r.p[0], r.p[1], rA.dist);
      const mc = (c / W | 0) * W + (W - 1 - (c % W));
      a = rA.dist[c]; m = rM.dist[mc];
    } else {
      // цель на оси: берём обе соседние с осью клетки, для каждой столицы — среднее
      const c1 = snap(pass, AXIS - 0.5, r.p[1], rA.dist), c2 = (c1 / W | 0) * W + (W - 1 - (c1 % W));
      a = (rA.dist[c1] + rA.dist[c2]) / 2; m = (rM.dist[c1] + rM.dist[c2]) / 2;
    }
    vals.push({ a, m });
    maxDiff = Math.max(maxDiff, diffPct(a, m));
  }
  // путь до Эмберхолла: от Аурелиона и (зеркально) от Мортхейма, уровни по пути
  const tA = snap(pass, AXIS - 0.5, g.emb[1], rA.dist), tM = snap(pass, AXIS + 0.5, g.emb[1], rM.dist);
  const pA = pathInfo(rA, tA), pM = pathInfo(rM, tM);
  const samples = (res: Paths, pi: PathInfo): [number, number][] => {
    const out: [number, number][] = [];
    for (const d of [0, 100, 200, 300, 400, 500, pi.len]) {
      const i = pi.cells.find((c) => res.dist[c] >= Math.min(d, pi.len)) ?? pi.cells[pi.cells.length - 1];
      out.push([Math.round(d), levelAt((i % W) + 0.5, ((i / W) | 0) + 0.5)]);
    }
    return out;
  };
  const lvA = samples(rA, pA), lvM = samples(rM, pM);
  const maxLvDiff = Math.max(...lvA.map(([, l], i) => Math.abs(l - lvM[i][1])));
  return { v, g, pass, rows, vals, pA, pM, lvA, lvM, maxDiff, maxLvDiff, checks: selfCheck(v, g, pass, rows, vals), areas: zoneAreas(), capToCap: rA.dist[sm] };
}

// ===================================================================== «Стало»: рисование
const FC: Record<Fac, string> = { sol: "#f6c82b", umb: "#b07cff", emb: "#ff8c42" };
const FF: Record<Fac, string> = { sol: "#a8924a", umb: "#8068a8", emb: "#a8744a" };
const LAND_FILL = ["#8bd69e", "#62bd84", "#42a272", "#2b8663"];
const RING_FILL = ["#e8c062", "#df9a42", "#cf7037", "#b24c34"];
const FIELD_FILL = "#6b1d2b";
const ROAD = "#f1e6c8", ROAD_C = "#251b10";

/** Счётчик штандартов, поставленных на схему (стоят / повреждены или брошены). */
const FLAGS = { ok: 0, bad: 0 };
function flag(x: number, y: number, f: Fac, st: "ok" | "torn" | "down" = "ok", h = 6.5): string {
  if (st === "ok") FLAGS.ok++; else FLAGS.bad++;
  const col = st === "ok" ? FC[f] : FF[f];
  const w = h * 0.8;
  const pen = st === "torn"
    ? `${r1(x)},${r1(y - h)} ${r1(x + w)},${r1(y - h * 0.82)} ${r1(x + w * 0.62)},${r1(y - h * 0.64)} ${r1(x + w)},${r1(y - h * 0.46)} ${r1(x)},${r1(y - h * 0.4)}`
    : `${r1(x)},${r1(y - h)} ${r1(x + w)},${r1(y - h * 0.72)} ${r1(x)},${r1(y - h * 0.42)}`;
  const g = `<line x1="${r1(x)}" y1="${r1(y)}" x2="${r1(x)}" y2="${r1(y - h)}" stroke="#1d150d" stroke-width=".9" stroke-linecap="round"/><polygon points="${pen}" fill="${col}" stroke="#1d150d" stroke-width=".35" stroke-linejoin="round"/>`;
  if (st === "ok") return g;
  return `<g transform="rotate(${st === "torn" ? 24 : 78} ${r1(x)} ${r1(y)})">${g}</g>`;
}
function stone(x: number, y: number, r = 2.3): string {
  const p = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return `${r1(x + r * Math.cos(a))},${r1(y + r * Math.sin(a))}`; }).join(" ");
  return `<polygon points="${p}" fill="#35e0e6" stroke="#06343a" stroke-width=".5"/><circle cx="${r1(x)}" cy="${r1(y)}" r=".7" fill="#06343a"/>`;
}
function badge(n: number, x: number, y: number): string {
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="3.3" fill="#0b0e13" stroke="#fff" stroke-width=".55"/><text class="t s45 b" x="${r1(x)}" y="${r1(y + 1.6)}" style="stroke-width:0">${n}</text>`;
}
function ward(x: number, y: number): string {
  return `<polygon points="${r1(x)},${r1(y - 2)} ${r1(x + 1.5)},${r1(y)} ${r1(x)},${r1(y + 2)} ${r1(x - 1.5)},${r1(y)}" fill="#7dff9b" stroke="#0a3a18" stroke-width=".4"/>`;
}
function post(x: number, y: number, f: Fac): string {
  return `<rect x="${r1(x - 2.5)}" y="${r1(y - 2.5)}" width="5" height="5" fill="${FF[f]}" stroke="#1d150d" stroke-width=".6"/>${flag(x - 1.6, y - 2.6, f, "ok", 5)}${flag(x + 1.8, y - 2.6, f, "ok", 5)}${ward(x + 4.6, y + 1.2)}`;
}
function boss(x: number, y: number, arena: number, big = false): string {
  const r = big ? 4.4 : 3.2;
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="${arena}" fill="#d6372a" fill-opacity=".14" stroke="#ff6b5a" stroke-width=".6" stroke-dasharray="2 1.6"/>`
    + `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="#d6372a" stroke="#fff" stroke-width=".6"/><text class="t ${big ? "s6" : "s45"} b" x="${r1(x)}" y="${r1(y + (big ? 2 : 1.6))}" style="stroke-width:0">Б</text>`;
}
function star(x: number, y: number, r: number): string {
  const p = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; return `${r1(x + rr * Math.cos(a))},${r1(y + rr * Math.sin(a))}`; }).join(" ");
  return `<polygon points="${p}" fill="#b04bff" stroke="#fff" stroke-width=".6" stroke-linejoin="round"/>`;
}
function crossedSwords(x: number, y: number): string {
  return `<g stroke="#fff" stroke-width="1.1" stroke-linecap="round"><line x1="${x - 3}" y1="${y - 3}" x2="${x + 3}" y2="${y + 3}"/><line x1="${x + 3}" y1="${y - 3}" x2="${x - 3}" y2="${y + 3}"/></g><g stroke="#ff4d3d" stroke-width=".5"><line x1="${x - 3}" y1="${y - 3}" x2="${x + 3}" y2="${y + 3}"/><line x1="${x + 3}" y1="${y - 3}" x2="${x - 3}" y2="${y + 3}"/></g>`;
}
/** Город или форт с настоящими размерами: стены, башни, ворота. */
function keep(cx: number, cy: number, f: Fac, o: { gates: ("N" | "S" | "E" | "W")[]; fort?: boolean }): string {
  const hx = 14, hy = 11;
  let s = `<rect x="${r1(cx - hx)}" y="${r1(cy - hy)}" width="${hx * 2}" height="${hy * 2}" fill="${o.fort ? "#3a3026" : "#2c2a33"}" fill-opacity=".92" stroke="${FC[f]}" stroke-width="${o.fort ? 1.8 : 1.4}"/>`;
  for (const [tx, ty] of [[-hx, -hy], [hx, -hy], [-hx, hy], [hx, hy]]) s += `<rect x="${r1(cx + tx - 1.7)}" y="${r1(cy + ty - 1.7)}" width="3.4" height="3.4" fill="${FF[f]}" stroke="#1d150d" stroke-width=".5"/>`;
  for (const g of o.gates) {
    const gx = g === "W" ? cx - hx : g === "E" ? cx + hx : cx, gy = g === "N" ? cy - hy : g === "S" ? cy + hy : cy;
    s += g === "N" || g === "S" ? `<rect x="${r1(gx - 1.6)}" y="${r1(gy - 1.1)}" width="3.2" height="2.2" fill="${ROAD}"/>` : `<rect x="${r1(gx - 1.1)}" y="${r1(gy - 2.6)}" width="2.2" height="5.2" fill="${ROAD}"/>`;
  }
  if (o.fort) {
    s += `<rect x="${r1(cx - 6)}" y="${r1(cy - 3.5)}" width="12" height="7" fill="none" stroke="${FC[f]}" stroke-width=".5" stroke-dasharray="1.6 1"/>`;
  } else {
    s += `<rect x="${r1(cx - 6)}" y="${r1(cy - 4)}" width="12" height="8" fill="none" stroke="#ffffff55" stroke-width=".4"/>`;
  }
  return s;
}
/** Поселение 16×14 тайлов: у Сольгарда лагерь шатров за частоколом, у Умбрата деревня в руинах (стена с проломами); ворота запад и восток. */
function settlement(x: number, y: number, f: Fac): string {
  const sol = f === "sol";
  const gates = `<rect x="${r1(x - 9)}" y="${r1(y - 1.6)}" width="2" height="3.2" fill="${ROAD}"/><rect x="${r1(x + 7)}" y="${r1(y - 1.6)}" width="2" height="3.2" fill="${ROAD}"/>`;
  let inner = "";
  for (const dx of [-4.2, 4.2]) {
    inner += sol
      ? `<polygon points="${r1(x + dx - 2.3)},${r1(y + 5)} ${r1(x + dx)},${r1(y + 1.6)} ${r1(x + dx + 2.3)},${r1(y + 5)}" fill="#f5efe0" stroke="#1d150d" stroke-width=".35" stroke-linejoin="round"/>`
      : `<polygon points="${r1(x + dx - 2.3)},${r1(y + 5)} ${r1(x + dx - 2.3)},${r1(y + 2.2)} ${r1(x + dx - 0.8)},${r1(y + 3)} ${r1(x + dx + 0.6)},${r1(y + 1.6)} ${r1(x + dx + 2.3)},${r1(y + 2.6)} ${r1(x + dx + 2.3)},${r1(y + 5)}" fill="#54456a" stroke="#1d150d" stroke-width=".35" stroke-linejoin="round"/>`;
  }
  inner += `<circle cx="${r1(x)}" cy="${r1(y + 4.4)}" r=".9" fill="#ff9a3d"/>`;
  return `<rect x="${r1(x - 8)}" y="${r1(y - 7)}" width="16" height="14" fill="${sol ? "#6f6034" : "#35294a"}" fill-opacity=".88" stroke="${sol ? "#d2b07a" : "#8b79a6"}" stroke-width="1.4" stroke-dasharray="${sol ? "1.3 .6" : "3 1.6"}"/>${gates}${inner}${stone(x, y - 2.6, 2.1)}`;
}

function defs(): string {
  const mk = (id: string, col: string) => `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${col}" stroke="#12091e" stroke-width="1"/></marker>`;
  return `<defs>${mk("ar-sol", "#fff176")}${mk("ar-umb", "#e1b3ff")}
<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#ff6a5a" stroke-width="1.4" opacity=".28"/></pattern>
<clipPath id="cl-w"><polygon points="0,-8 ${pts(RIV_W.slice(1))} 0,368"/></clipPath>
<clipPath id="cl-e"><polygon points="${W},-8 ${pts(mirrorPts(RIV_W.slice(1)))} ${W},368"/></clipPath>
<clipPath id="cl-m"><polygon points="${pts(RIV_W)} ${pts(mirrorPts(RIV_W).reverse())}"/></clipPath>
<clipPath id="cl-map"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath></defs>`;
}

function zonePaint(): string {
  let s = `<g clip-path="url(#cl-map)">`;
  for (const mir of [false, true]) {
    const cx = mir ? W - CAP[0] : CAP[0];
    s += `<g clip-path="url(#${mir ? "cl-e" : "cl-w"})"><rect x="${mir ? 700 : -10}" y="-10" width="420" height="380" fill="${LAND_FILL[3]}"/>`;
    for (let k = 2; k >= 0; k--) s += `<ellipse cx="${cx}" cy="${CAP[1]}" rx="${r1(SH.u[k] * SH.A)}" ry="${r1(SH.u[k] * SH.B)}" fill="${LAND_FILL[k]}" stroke="#fff" stroke-opacity=".6" stroke-width=".55"/>`;
    s += `</g>`;
  }
  s += `<g clip-path="url(#cl-m)"><rect x="150" y="-10" width="800" height="380" fill="${RING_FILL[0]}"/>`;
  for (let k = 1; k <= 3; k++) {
    const vb = VB[4 - k]; // внешняя граница пояса k (1..3) → VB[3], VB[2], VB[1]; пояс 0 — фон. Большие эллипсы рисуются раньше малых
    s += `<ellipse cx="${AXIS}" cy="180" rx="${r1(FLD.rx * vb)}" ry="${r1(FLD.ry * vb)}" fill="${RING_FILL[k]}" stroke="#fff" stroke-opacity=".6" stroke-width=".55"/>`;
  }
  s += `<ellipse cx="${AXIS}" cy="180" rx="${FLD.rx}" ry="${FLD.ry}" fill="${FIELD_FILL}" stroke="#fff" stroke-opacity=".75" stroke-width=".8"/><ellipse cx="${AXIS}" cy="180" rx="${FLD.rx}" ry="${FLD.ry}" fill="url(#hatch)"/></g></g>`;
  return s;
}

/** Смещённая параллельно ломаная (для патрульных линий рядом с дорогой). */
function offsetLine(a: P[], d: number): P[] {
  return a.map((p, i) => {
    const p0 = a[Math.max(0, i - 1)], p1 = a[Math.min(a.length - 1, i + 1)];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / l) * d, p[1] + (dx / l) * d] as P;
  });
}
const line = (a: P[], stroke: string, w: number, extra = "") => `<polyline points="${pts(a)}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const road = (a: P[]) => line(a, ROAD_C, 2.9) + line(a, ROAD, 1.6);
/** Подпись над картой с цветной скобкой под ней. */
const hdSpan = (x0: number, x1: number, col: string, txt: string, tcol = "#fff") => `<line x1="${x0}" y1="-4" x2="${x1}" y2="-4" stroke="${col}" stroke-width="1.6"/><text class="t s7 b" x="${(x0 + x1) / 2}" y="-9" style="fill:${tcol}">${esc(txt)}</text>`;
const mirFac = (f: Fac): Fac => (f === "sol" ? "umb" : f === "umb" ? "sol" : f);

function planSvg(d: PlanData, riverGap: number): string {
  const { v, g } = d;
  const s = v.s;
  FLAGS.ok = 0; FLAGS.bad = 0;
  let o = defs();
  o += `<rect x="-4" y="-26" width="1108" height="416" fill="#0e1117"/>`;
  o += zonePaint();
  o += `<line x1="${AXIS}" y1="0" x2="${AXIS}" y2="${H}" stroke="#fff" stroke-opacity=".35" stroke-width=".5" stroke-dasharray="4 3"/>`;
  // реки до самой воды края; броды закрыты
  o += `<g clip-path="url(#cl-map)">`;
  for (const mir of [false, true]) {
    const path = mir ? mirrorPts(RIV_W) : RIV_W;
    o += line(path, "#1b4a85", RIV_HW * 2 + 1.1) + line(path, "#3d84cc", RIV_HW * 2) + line(path, "#78b4ee", 0.9, 'opacity=".75"');
  }
  o += `</g><rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#3b6fb6" stroke-width="6"/>`;
  for (const mir of [false, true]) for (const yy of [5.5, H - 5.5]) {
    const x = mir ? W - riverX(yy) : riverX(yy);
    o += `<circle cx="${r1(x)}" cy="${yy}" r="2.7" fill="#8a1f1f" stroke="#fff" stroke-width=".5"/><path d="M${r1(x - 1.4)},${yy - 1.4} L${r1(x + 1.4)},${yy + 1.4} M${r1(x + 1.4)},${yy - 1.4} L${r1(x - 1.4)},${yy + 1.4}" stroke="#fff" stroke-width=".8"/>`;
  }
  o += `<text class="t s45" x="${r1(riverX(5.5) + 4)}" y="9" style="text-anchor:start">брод закрыт</text>`;
  // мосты
  for (const b of BRIDGES) for (const mir of [false, true]) {
    const cx = mir ? W - riverX(b.y) : riverX(b.y);
    o += `<rect x="${r1(cx - 5.5)}" y="${b.y - 1.9}" width="11" height="3.8" fill="#b58d58" stroke="#2b1c0e" stroke-width=".6"/>`;
    for (let k = -4; k <= 4; k += 2) o += `<line x1="${r1(cx + k)}" y1="${b.y - 1.9}" x2="${r1(cx + k)}" y2="${b.y + 1.9}" stroke="#2b1c0e" stroke-width=".35"/>`;
  }
  // дороги
  for (const mir of [false, true]) for (const r of g.roads) o += road(mir ? mirrorPts(r.pts) : r.pts);
  // патрули на дорогах своих земель и маршруты отрядов на Полях
  for (const mir of [false, true]) {
    const f: Fac = mir ? "umb" : "sol";
    const col = mir ? "#e1b3ff" : "#fff176";
    for (const id of ["M", "N", "S"]) {
      const r = g.roads.find((q) => q.id === id)!;
      const a = offsetLine(mir ? mirrorPts(r.pts) : r.pts, mir ? -1.9 : 1.9);
      o += line(a, "#000", 2.1, 'opacity=".55"') + line(a, col, 1.05, 'stroke-dasharray="2.6 1.7"');
    }
    for (const q of g.squads) {
      const a = mir ? mirrorPts(q.pts) : q.pts;
      o += line(a, "#000", 2.2, 'opacity=".55"') + line(a, col, 1.15, `stroke-dasharray="2.4 1.6" marker-end="url(#ar-${f})"`);
    }
  }
  // кратчайшие пути до Эмберхолла
  /** Путь рисуется до ворот Эмберхолла (внутри города его закрыли бы подписи); полная длина — в таблице. */
  const drawPath = (pi: PathInfo, col: string, mir: boolean) => {
    const xe = AXIS - 25.5;
    const cut: P[] = [];
    let end: P = pi.poly[pi.poly.length - 1];
    for (let i = 0; i < pi.poly.length; i++) {
      const p = pi.poly[i];
      if (p[0] < xe) { cut.push(p); continue; }
      const q0 = pi.poly[i - 1];
      const t = q0 ? (xe - q0[0]) / (p[0] - q0[0]) : 0;
      end = q0 ? [xe, q0[1] + (p[1] - q0[1]) * t] : p;
      cut.push(end);
      break;
    }
    const poly = mir ? mirrorPts(cut) : cut;
    let q = line(poly, "#06232b", 2.7, 'opacity=".9"') + line(poly, col, 1.35);
    for (const t of pi.ticks) {
      if (t.at[0] > xe - 14) continue;
      const x = mir ? W - t.at[0] : t.at[0];
      q += `<circle cx="${r1(x)}" cy="${r1(t.at[1])}" r="2.9" fill="#06232b" stroke="${col}" stroke-width=".6"/><text class="t s4" x="${r1(x)}" y="${r1(t.at[1] + 1.4)}" style="stroke-width:0;font-size:3.9px">${t.d}</text>`;
    }
    return q;
  };

  // ---- города, форты, поселения
  const flags: string[] = [];
  const names: string[] = [];
  for (const mir of [false, true]) {
    const X = (x: number) => (mir ? W - x : x);
    const f: Fac = mir ? "umb" : "sol";
    const nm = (a: string, b: string) => (mir ? b : a);
    // столица
    const cx = X(CAP[0]), cy = CAP[1];
    o += keep(cx, cy, f, { gates: ["N", "S"] }) + stone(cx + 4, cy + 4, 2.1);
    names.push(`<text class="t s7 b" x="${r1(cx)}" y="${r1(cy - 1)}">${nm("АУРЕЛИОН", "МОРТХЕЙМ")}</text><text class="t s45" x="${r1(cx)}" y="${r1(cy + 5.8)}" style="stroke-width:1.2">столица ${nm("Сольгарда", "Умбрата")}</text>`);
    for (const [fx, fy] of [[-3.5, -12.5], [3.5, -12.5], [-3.5, 15.5], [3.5, 15.5]]) flags.push(flag(cx + fx, cy + fy, f));
    // поселения
    for (const st of g.settle) {
      const sx = X(st.at[0]), sy = st.at[1];
      o += settlement(sx, sy, f);
      names.push(`<text class="t s5" x="${r1(sx)}" y="${r1(sy + 12.5)}">${esc(st.set[mir ? 1 : 0])}</text>`);
      flags.push(flag(sx - 10, sy - 1, f, "ok", 5.5), flag(sx + 10, sy - 1, f, "ok", 5.5));
      o += ward(sx - 12.5, sy + 3.5) + ward(sx + 12.5, sy + 3.5);
    }
    // посты на мостах (на берегу своих земель)
    for (const b of BRIDGES) {
      const px = X(riverX(b.y) - 8);
      o += post(px, b.y, f);
    }
    // форт на краю Полей
    const fx = X(FORT[0]);
    o += keep(fx, FORT[1], f, { gates: ["W", "E", "N", "S"], fort: true }) + stone(fx, FORT[1] + 1, 2.2);
    names.push(`<text class="t s6 b" x="${r1(fx)}" y="${r1(FORT[1] - 15)}">ФОРТ ${nm("СОЛЬГАРДА", "УМБРАТА")}</text>`);
    for (const [dx, dy] of [[-12.5, -11.5], [12.5, -11.5], [-12.5, 14.5], [12.5, 14.5]]) flags.push(flag(fx + dx, FORT[1] + dy, f, "ok", 6));
    o += ward(fx - 17.5, FORT[1] - 5) + ward(fx + 17.5, FORT[1] - 5);
  }
  // Эмберхолл: безопасная полоса за частоколом, стены, ворота
  const E = g.emb;
  o += `<rect x="${AXIS - 33}" y="${E[1] - 28}" width="66" height="56" fill="#7bd88f" fill-opacity=".30"/>`;
  const pal = (a: P, b: P) => line([a, b], "#3b2610", 2.3) + line([a, b], "#a8794a", 1.5, 'stroke-dasharray="1.2 .7" stroke-linecap="butt"');
  const gx = 3;
  o += pal([AXIS - 33, E[1] - 28], [AXIS - gx, E[1] - 28]) + pal([AXIS + gx, E[1] - 28], [AXIS + 33, E[1] - 28]);
  o += pal([AXIS - 33, E[1] + 28], [AXIS - gx, E[1] + 28]) + pal([AXIS + gx, E[1] + 28], [AXIS + 33, E[1] + 28]);
  o += pal([AXIS - 33, E[1] - 28], [AXIS - 33, E[1] - gx]) + pal([AXIS - 33, E[1] + gx], [AXIS - 33, E[1] + 28]);
  o += pal([AXIS + 33, E[1] - 28], [AXIS + 33, E[1] - gx]) + pal([AXIS + 33, E[1] + gx], [AXIS + 33, E[1] + 28]);
  o += `<rect x="${AXIS - 25}" y="${E[1] - 20}" width="50" height="40" fill="#4b4f58" stroke="#c9ccd4" stroke-width="1.5"/>`;
  for (const [tx, ty] of [[-25, -20], [25, -20], [-25, 20], [25, 20]]) o += `<rect x="${AXIS + tx - 1.9}" y="${E[1] + ty - 1.9}" width="3.8" height="3.8" fill="#7d828d" stroke="#1d150d" stroke-width=".5"/>`;
  for (const [gxx, gyy, w, h] of [[0, -20, 4, 2.4], [0, 20, 4, 2.4], [-25, 0, 2.4, 3.4], [25, 0, 2.4, 3.4]]) o += `<rect x="${r1(AXIS + gxx - w / 2)}" y="${r1(E[1] + gyy - h / 2)}" width="${w}" height="${h}" fill="${ROAD}"/>`;
  o += `<rect x="${AXIS - 22}" y="${E[1] - 14}" width="44" height="30" fill="none" stroke="#ffffff55" stroke-width=".4"/>` + stone(AXIS, E[1] + 12.5, 2.3);
  names.push(`<text class="t s8 b" x="${AXIS}" y="${r1(E[1] - 8)}">ЭМБЕРХОЛЛ</text><text class="t s45" x="${AXIS}" y="${r1(E[1] - 3.2)}" style="stroke-width:1.2;fill:#d7f0ff">банк · заточка · сумки</text><text class="t s4" x="${AXIS}" y="${r1(E[1] + 1.6)}" style="stroke-width:1.1">камень откроется,</text><text class="t s4" x="${AXIS}" y="${r1(E[1] + 5.6)}" style="stroke-width:1.1">когда дошёл пешком</text>`);
  names.push(`<text class="t s45 gr" x="${AXIS}" y="${r1(E[1] + (s < 0 ? -31 : 36.5))}">безопасная полоса за частоколом</text>`);
  flags.push(flag(AXIS - 35.5, E[1] + 1, "sol", "ok", 7), flag(AXIS + 35.5, E[1] + 1, "umb", "ok", 7), flag(AXIS - 4.5, E[1] - 28.5, "emb", "ok", 6.5), flag(AXIS + 4.5, E[1] + 33, "emb", "ok", 6.5));

  // данж, мировой босс, сходка
  const D = g.dun;
  o += `<rect x="${AXIS - 28}" y="${D[1] - 19}" width="56" height="38" fill="#1c1b25" stroke="#8d5fbf" stroke-width="1.5"/>`;
  for (const [rx, ry, rw, rh] of [[-24, -14, 12, 9], [-8, -14, 14, 9], [10, -14, 14, 9], [-24, 2, 14, 11], [-6, 2, 10, 11], [8, 2, 16, 11]]) o += `<rect x="${AXIS + rx}" y="${D[1] + ry}" width="${rw}" height="${rh}" fill="#2c2a3b" stroke="#5d4a80" stroke-width=".4"/>`;
  o += `<polygon points="${AXIS - 3},${g.dunEnt[1] + s * 3.2} ${AXIS + 3},${g.dunEnt[1] + s * 3.2} ${AXIS},${g.dunEnt[1] - s * 0.4}" fill="#ffe14d" stroke="#1d150d" stroke-width=".4"/>`;
  names.push(`<text class="t s7 b" x="${AXIS}" y="${r1(D[1] + 1)}">ДАНЖ</text><text class="t s45" x="${AXIS}" y="${r1(D[1] + 6.5)}">вход с оси · зал босса внутри</text>`);
  o += boss(g.wb[0], g.wb[1], 15, true).replace(/fill="#d6372a" fill-opacity=".14"/, 'fill="#b04bff" fill-opacity=".14"');
  o += star(g.wb[0], g.wb[1], 6.2);
  names.push(`<text class="t s6 b" x="${AXIS}" y="${r1(g.wb[1] + (s < 0 ? 24 : -18))}" style="fill:#e3c2ff">МИРОВОЙ БОСС</text>`);
  o += crossedSwords(AXIS, 180);
  names.push(`<text class="t s5 b" x="${AXIS}" y="${r1(180 + 10.5)}">сходка отрядов</text>`);

  // боссы (парами), знаменосцы патрулей и отрядов
  for (const b of g.bosses) for (const mir of [false, true]) {
    const x = mir ? W - b.at[0] : b.at[0];
    o += boss(x, b.at[1], b.arena);
    names.push(`<text class="t s45" x="${r1(x)}" y="${r1(b.at[1] + b.arena + 5)}">${esc(b.label)} ≈${Math.round(levelAt(b.at[0], b.at[1]))}</text>`);
  }
  for (const mir of [false, true]) {
    const f: Fac = mir ? "umb" : "sol";
    const X = (x: number) => (mir ? W - x : x);
    flags.push(flag(X(66), 197, f, "ok", 5.5), flag(X(51), 167, f, "ok", 5.5), flag(X(121), 196, f, "ok", 5.5));
    for (const q of g.squads) flags.push(flag(X(q.pts[0][0] + 3), q.pts[0][1], f, "ok", 5.5));
  }
  // брошенные и повреждённые штандарты на Полях и в поясах кольца (много — главный мотив Полей)
  const R = rng(132 + (s < 0 ? 1 : 2));
  const fallen: { at: P; st: "torn" | "down" }[] = [];
  const near = (a: P[], t: number, off: number): P => {
    let acc = 0, tot = 0;
    for (let i = 0; i < a.length - 1; i++) tot += Math.hypot(a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]);
    for (let i = 0; i < a.length - 1; i++) {
      const L = Math.hypot(a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]);
      if (acc + L >= t * tot) {
        const k = (t * tot - acc) / L, dx = (a[i + 1][0] - a[i][0]) / L, dy = (a[i + 1][1] - a[i][1]) / L;
        return [a[i][0] + (a[i + 1][0] - a[i][0]) * k - dy * off, a[i][1] + (a[i + 1][1] - a[i][1]) * k + dx * off];
      }
      acc += L;
    }
    return a[a.length - 1];
  };
  for (const q of g.squads) for (const t of [0.22, 0.45, 0.68, 0.88]) fallen.push({ at: near(q.pts, t, (R() < 0.5 ? -1 : 1) * (5 + R() * 8)), st: R() < 0.5 ? "torn" : "down" });
  for (let i = 0; i < 7; i++) { const a = R() * Math.PI * 2, r = 9 + R() * 20; fallen.push({ at: [AXIS - 4 - Math.abs(Math.cos(a)) * r, 180 + Math.sin(a) * r], st: R() < 0.5 ? "torn" : "down" }); }
  for (const rid of ["Mr", "Er", "Dr"]) { const r = g.roads.find((q) => q.id === rid)!; for (const t of [0.45, 0.75]) fallen.push({ at: near(r.pts, t, (R() < 0.5 ? -1 : 1) * (4 + R() * 7)), st: R() < 0.5 ? "torn" : "down" }); }
  for (const f2 of fallen) {
    if (f2.at[0] > AXIS - 2 || f2.at[0] < 215) continue;
    flags.push(flag(f2.at[0], f2.at[1], "sol", f2.st, 5.5), flag(W - f2.at[0], f2.at[1], "umb", f2.st, 5.5));
  }
  o += drawPath(d.pA, "#35e0e6", false) + drawPath(d.pA, "#35e0e6", true);
  o += flags.join("");

  // подписи зон
  const zl = (x: number, y: number, lv: string, name?: string) => `<text class="t s9 b" x="${r1(x)}" y="${r1(y)}">${lv}</text>${name ? `<text class="t s6" x="${r1(x)}" y="${r1(y + 6.8)}">${esc(name)}</text>` : ""}`;
  const LB: P[] = [[56.5, 122], [56.5, 76], [56.5, 30], [158, 26]];
  LANDS.forEach((l, i) => {
    for (const mir of [false, true]) {
      const x = mir ? W - LB[i][0] : LB[i][0];
      names.push(zl(x, LB[i][1], l.lv, mir ? l.umb : l.sol));
      names.push(zl(x, 361 - LB[i][1] - 0, l.lv));
    }
  });
  const xEdge = (vv: number, y: number) => AXIS - FLD.rx * Math.sqrt(Math.max(0, vv * vv - ((y - 180) / FLD.ry) ** 2));
  for (const y of [138, 222]) for (let k = 0; k < 4; k++) {
    const xo = k === 0 ? riverX(y) : xEdge(VB[4 - k], y), xi = xEdge(VB[3 - k], y);
    const xm = (xo + xi) / 2;
    for (const mir of [false, true]) names.push(zl(mir ? W - xm : xm, y, RINGS[k]));
  }
  const fy = 180 + s * 58;
  names.push(`<text class="t s85 b" x="${AXIS}" y="${r1(fy)}">ПОЛЯ ВЕЧНЫХ БИТВ · 80–100</text>`);
  names.push(`<rect x="${AXIS - 33}" y="${r1(fy + 2.5)}" width="66" height="8.4" rx="1.5" fill="#c8261c" stroke="#fff" stroke-width=".6"/><text class="t s7 b" x="${AXIS}" y="${r1(fy + 8.9)}" style="stroke-width:0">ОПАСНАЯ ЗОНА</text>`);
  names.push(`<text class="t s5" x="${r1(riverX(100) + 15)}" y="106" style="stroke-width:1.2;fill:#bfe0ff">р. Светлая</text><text class="t s5" x="${r1(W - riverX(100) - 15)}" y="106" style="stroke-width:1.2;fill:#bfe0ff">р. Чёрная</text>`);
  names.push(`<text class="t s5" x="830" y="199" style="fill:#e1b3ff">новая прямая дорога Мортхейм → центр</text>`);

  // метки строк таблицы
  const mark = (n: number, x: number, y: number, pair: boolean) => {
    let q = badge(n, x, y);
    if (pair) q += badge(n, W - x, y);
    return q;
  };
  let bg = "";
  const rowOf = (n: number) => d.rows.find((r) => r.n === n)!;
  g.settle.forEach((st, i) => { bg += mark(1 + i, st.at[0] + 9, st.at[1] - 8, true); });
  for (let k = 0; k < 4; k++) { const p = rowOf(5 + k).p; bg += `<circle cx="${r1(p[0])}" cy="${p[1]}" r="1.2" fill="#fff" stroke="#000" stroke-width=".4"/><circle cx="${r1(W - p[0])}" cy="${p[1]}" r="1.2" fill="#fff" stroke="#000" stroke-width=".4"/>` + mark(5 + k, p[0], p[1] - 6.5, true); }
  bg += mark(9, xEdge(1, 142) - 1, 142, true);
  BRIDGES.forEach((b, i) => { bg += mark(10 + i, riverX(b.y) - 15, b.y - 5, true); });
  bg += mark(13, FORT[0] - 17.5, FORT[1] + 15, true);
  bg += mark(14, AXIS + 38.5, E[1] - 27, false);
  bg += mark(15, AXIS + 8, 176, false);
  bg += mark(16, g.wb[0] + 8, g.wb[1] - 6, false);
  bg += mark(17, AXIS + 10, g.dunEnt[1] + s * 8, false);
  g.bosses.forEach((b, i) => { bg += mark(18 + i, b.at[0] + 5, b.at[1] - 5, true); });

  // шапка и нижняя строка
  let hd = hdSpan(2, 207, "#5fba80", "ЗЕМЛИ СОЛЬГАРДА · безопасные 1–40") + hdSpan(W - 207, W - 2, "#5fba80", "ЗЕМЛИ УМБРАТА · безопасные 1–40");
  hd += hdSpan(213, 384, "#df9a42", "КОЛЬЦО 40–80 · небезопасная зона", "#ffd9a0") + hdSpan(W - 384, W - 213, "#df9a42", "КОЛЬЦО 40–80 · небезопасная зона", "#ffd9a0");
  hd += hdSpan(388, W - 388, "#e0392c", "ПОЛЯ ВЕЧНЫХ БИТВ 80–100 · ОПАСНАЯ ЗОНА", "#ff9a8e");
  const rm = RIV_W.reduce((a, p) => a + p[0], 0) / RIV_W.length;
  const yb = H + 14;
  const ft = `<line x1="${r1(rm)}" y1="${yb}" x2="${r1(W - rm)}" y2="${yb}" stroke="#fff" stroke-width=".7" marker-start="url(#ar-sol)" marker-end="url(#ar-sol)"/>`
    + `<text class="t s6 b" x="${AXIS}" y="${yb - 3}">между реками ≈${riverGap} тайлов (было 634, +${Math.round(((riverGap - 634) / 634) * 100)} %) · восток — зеркало запада: x → 1099 − x</text>`;
  return o + names.join("") + bg + hd + ft;
}

// ===================================================================== HTML
const CSS = `
:root{--bg:#0e1117;--panel:#161b24;--ink:#ebe8df;--mut:#9aa4b5;--line:#2a3243}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.35 "Segoe UI",Arial,sans-serif}
.page{width:2240px;padding:16px 12px 24px}
h1{font-size:27px;margin:0 0 2px}
.sub{color:var(--mut);margin:0 0 8px;font-size:16px}
svg.map{display:block}
.t{font-family:"Segoe UI",Arial,sans-serif;fill:#fff;paint-order:stroke;stroke:#0a0d12;stroke-width:1.5;stroke-linejoin:round;text-anchor:middle}
.s4{font-size:3.4px}.s45{font-size:4.6px}.s5{font-size:5.2px}.s6{font-size:6.2px}.s7{font-size:7.2px}.s8{font-size:8.2px}.s85{font-size:8.8px}.s9{font-size:9.4px}
.b{font-weight:700}.y{fill:#ffd23f}.bl{fill:#bfe0ff}.gr{fill:#c9f5d2}
.below{display:grid;grid-template-columns:690px 1fr;gap:26px;margin-top:14px;align-items:start}
.legend{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 14px}
.legend h2,.tbl h2{font-size:17px;margin:0 0 6px;color:#cfd6e4}
.li{display:flex;align-items:center;gap:10px;margin:3px 0;font-size:14.5px}
.li svg{flex:none}
.tbl{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 14px}
table{border-collapse:collapse;width:100%;font-size:14.5px}
th,td{padding:3px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--mut);font-weight:600}
td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
td.num{color:#fff;font-weight:700;width:30px}
small{color:var(--mut)}
tr.sec td{background:#1e2430;color:#cfd6e4;font-weight:700;padding:4px 8px}
.ok{color:#8fe3a1}.bad{color:#ff8f84;font-weight:700}
.foot{color:var(--mut);margin-top:8px;font-size:14px;line-height:1.5}.foot b{color:var(--ink)}
.warn{color:#ffb3a8}
`;
const VIEWBOX = "-4 -26 1108 416";
const svgWrap = (inner: string) => `<svg class="map" xmlns="http://www.w3.org/2000/svg" width="2216" height="832" viewBox="${VIEWBOX}">${inner}</svg>`;
const htmlPage = (title: string, sub: string, map: string, below: string) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="page"><h1>${esc(title)}</h1><p class="sub">${sub}</p>${svgWrap(map)}${below}</div></body></html>`;
const ico = (inner: string, w = 40, vb = `${-w / 4} -7.5 ${w / 2} 15`) => `<svg width="${w}" height="30" viewBox="${vb}">${inner}</svg>`;
const li = (icon: string, text: string) => `<div class="li">${icon}<span>${text}</span></div>`;

function planLegend(c: { ok: number; bad: number }): string {
  const items: string[] = [];
  const strip = (cols: string[]) => cols.map((col, i) => `<rect x="${-9 + i * 4.6}" y="-3" width="4.6" height="6" fill="${col}"/>`).join("");
  items.push(li(ico(strip(LAND_FILL), 40), "<b>Безопасные земли 1–40</b>: четыре зоны по 10 ур. вокруг столицы (поясами: чем дальше от столицы к реке, тем выше), граница — река"));
  items.push(li(ico(strip(RING_FILL), 40), "<b>Кольцо 40–80</b>: четыре пояса по 10 ур. вокруг Полей — небезопасная зона"));
  items.push(li(ico(`<rect x="-9" y="-3.5" width="18" height="7" fill="${FIELD_FILL}"/><rect x="-9" y="-3.5" width="18" height="7" fill="url(#hatch)"/>`, 40), "<b>Поля вечных битв 80–100</b>: подпись «Опасная зона»"));
  items.push(li(ico(`<line x1="-9" y1="0" x2="9" y2="0" stroke="#1b4a85" stroke-width="5"/><line x1="-9" y1="0" x2="9" y2="0" stroke="#3d84cc" stroke-width="4"/><circle cx="0" cy="0" r="2.7" fill="#8a1f1f" stroke="#fff" stroke-width=".5"/>`, 40), "Река непроходима и идёт до воды края карты: броды закрыты (красный знак)"));
  items.push(li(ico(`<rect x="-6" y="-1.9" width="11" height="3.8" fill="#b58d58" stroke="#2b1c0e" stroke-width=".6"/>`, 40), "Мост — единственный вход на безопасные земли (по три на реку: север, главный, юг)"));
  items.push(li(ico(post(0, 0, "sol"), 40), "Пост на мосту: стража, два штандарта и оберег (зелёный ромб) — раскрывает невидимок; обереги и у ворот поселений и фортов"));
  items.push(li(ico(`<rect x="-7" y="-5.5" width="14" height="11" fill="#2c2a33" stroke="${FC.sol}" stroke-width="1.4"/>`, 40), "Столица (стены 28×22, ворота север и юг): банк, заточка и сумки теперь и здесь"));
  items.push(li(ico(settlement(0, 0, "sol"), 40, "-12 -9 24 18"), "Поселение в каждой большой зоне (4 на фракцию): торговец, повар, стража, зона без мобов; у Сольгарда лагерь за частоколом, у Умбрата деревня в руинах"));
  items.push(li(ico(`<rect x="-7" y="-5.5" width="14" height="11" fill="#3a3026" stroke="${FC.umb}" stroke-width="1.8"/><rect x="-3" y="-2" width="6" height="4" fill="none" stroke="${FC.umb}" stroke-width=".4" stroke-dasharray="1 .7"/>`, 40), "Форт фракции на краю Полей (два, зеркально): плац, кузня, двор осадных машин"));
  items.push(li(ico(`<rect x="-9" y="-6" width="18" height="12" fill="#7bd88f" fill-opacity=".35"/><rect x="-6" y="-4" width="12" height="8" fill="#4b4f58" stroke="#c9ccd4" stroke-width="1"/><rect x="-9" y="-6" width="18" height="12" fill="none" stroke="#a8794a" stroke-width="1.3" stroke-dasharray="1.2 .7"/>`, 40), "Эмберхолл: безопасная полоса за частоколом из заострённых брёвен, четверо ворот"));
  items.push(li(ico(stone(0, 0, 3), 40), "Камень перемещения и точка возрождения: столицы, поселения, форты; в Эмберхолле камень открывается, когда герой дошёл пешком"));
  items.push(li(ico(flag(-6, 4, "sol") + flag(0, 4, "umb") + flag(6, 4, "emb"), 40), `<b>Места штандартов</b>: ворота и частокол поселений, стены фортов, посты на мостах, знаменосец в каждом патруле и отряде, ворота Эмберхолла — ${c.ok} на схеме`));
  items.push(li(ico(flag(-4, 4, "sol", "torn") + flag(4, 4, "umb", "down"), 40), `Повреждённые и брошенные штандарты — главный мотив Полей (${c.bad} на схеме, в игре будет больше)`));
  items.push(li(ico(line([[-9, 0], [9, 0]], ROAD_C, 2.9) + line([[-9, 0], [9, 0]], ROAD, 1.6), 40), "Дорога; у Умбрата теперь есть прямая дорога к центру, как у Сольгарда"));
  items.push(li(ico(line([[-9, 0], [9, 0]], "#000", 2.1, 'opacity=".55"') + line([[-9, 0], [9, 0]], "#fff176", 1.05, 'stroke-dasharray="2.6 1.7"') + line([[-9, 3], [9, 3]], "#000", 2.1, 'opacity=".55"') + line([[-9, 3], [9, 3]], "#e1b3ff", 1.05, 'stroke-dasharray="2.6 1.7"'), 40), "Маршрут патруля по дорогам своих земель: от ворот столицы до поста на мосту"));
  items.push(li(ico(line([[-9, 0], [7, 0]], "#000", 2.2, 'opacity=".55"') + line([[-9, 0], [7, 0]], "#fff176", 1.15, 'stroke-dasharray="2.4 1.6" marker-end="url(#ar-sol)"'), 40), "Маршруты отрядов на Полях: три из каждого форта к месту сходки в центре"));
  items.push(li(ico(line([[-9, 0], [9, 0]], "#06232b", 2.7) + line([[-9, 0], [9, 0]], "#35e0e6", 1.35) + `<circle cx="0" cy="0" r="2.5" fill="#06232b" stroke="#35e0e6" stroke-width=".6"/><text class="t s4" x="0" y="1.4" style="stroke-width:0">100</text>`, 40), "Кратчайший пешком путь от столицы до Эмберхолла; метки — пройдено тайлов"));
  items.push(li(ico(`<rect x="-8" y="-5" width="16" height="10" fill="#1c1b25" stroke="#8d5fbf" stroke-width="1.2"/><polygon points="-2,-6.5 2,-6.5 0,-4" fill="#ffe14d" stroke="#1d150d" stroke-width=".4"/>`, 40), "Данж на оси; вход со стороны центра (жёлтая стрелка)"));
  items.push(li(ico(boss(-4, 0, 4.5) + star(6, 0, 3.2), 40), "Места боссов (парами, зеркально) и мирового босса на оси; крест — сходка отрядов"));
  items.push(li(ico(`<circle cx="0" cy="0" r="3.3" fill="#0b0e13" stroke="#fff" stroke-width=".55"/><text class="t s45 b" x="0" y="1.6" style="stroke-width:0">7</text>`, 40), "Номер строки таблицы (цель, до которой считается путь)"));
  return `<div class="legend"><h2>Легенда</h2>${items.join("")}</div>`;
}

function planTable(d: PlanData): string {
  let h = `<div class="tbl"><h2>Зоны, уровни и путь пешком от столиц · ${esc(d.v.title)}</h2><table><thead><tr><th>№</th><th>Зона / место (Сольгард | Умбрат)</th><th>Ур.</th><th>Цель пути</th><th class="n">площадь<br><small>тыс. тайлов, одна сторона</small></th>`
    + `<th class="n">от Аурелиона<br><small>до зоны запада или оси</small></th><th class="n">от Мортхейма<br><small>до зеркальной зоны востока или оси</small></th><th class="n">Δ</th></tr></thead><tbody>`;
  d.rows.forEach((r, i) => {
    if (r.sec) { h += `<tr class="sec"><td colspan="8">${esc(r.sec)}</td></tr>`; return; }
    const { a, m } = d.vals[i];
    const diff = diffPct(a, m);
    h += `<tr><td class="num">${r.n}</td><td>${esc(r.name)}</td><td>${esc(r.lv)}</td><td>${esc(r.what)}</td><td class="n">${r.zid === undefined ? "" : (d.areas[r.zid] / 1000).toFixed(1).replace(".", ",")}</td><td class="n">${Math.round(a)} <small>${fmtT(a)}</small></td><td class="n">${Math.round(m)} <small>${fmtT(m)}</small></td><td class="n ${diff > 3 ? "bad" : "ok"}">${fmtPct(diff)}</td></tr>`;
  });
  h += `</tbody></table>`;
  const lv = (a: [number, number][]) => a.map(([dd, l]) => `${dd}→${Math.round(l)}`).join(" · ");
  h += `<div class="foot"><b>Макс. расхождение путей от двух столиц: ${fmtPct(d.maxDiff)}</b> при допуске 3 %. Путь — в тайлах и мин:сс (150 px/с = 4,69 тайла/с), по проходимым клеткам схемы: мосты и ворота открыты; река, край карты, броды и стены закрыты. `
    + `В парах «Сольгард | Умбрат» — путь от своей столицы до своей зоны (восток — зеркало запада); у осевых целей обе столицы идут к одной точке.<br>`
    + `<b>Рост уровней по пути к Эмберхоллу</b> (пройдено тайлов → уровень), расхождение ${d.maxLvDiff.toFixed(1).replace(".", ",")} ур.: Аурелион — ${lv(d.lvA)}; Мортхейм — ${lv(d.lvM)}<br>`
    + `<b>Дорога между столицами:</b> ${Math.round(d.capToCap)} тайлов (${fmtT(d.capToCap)}) через мосты и центр.<br>`
    + `<b>Проверки схемы:</b> ${d.checks.map(esc).join(" · ")}</div></div>`;
  return h;
}

function wasLegendAndTable(w: ReturnType<typeof buildWas>): string {
  const leg = `<div class="legend"><h2>Что на схеме</h2>
${li(ico(`<rect x="-9" y="-3" width="18" height="6" fill="#6aa84f" stroke="#fff" stroke-opacity=".6" stroke-width=".5"/>`, 40), "Белые линии — границы зон; подписи — название и уровни зоны")}
${li(ico(`<line x1="-9" y1="0" x2="9" y2="0" stroke="#3b6fb6" stroke-width="4"/>`, 40), "Реки (вода); тёмные пятна — деревья и скалы (непроходимо)")}
${li(ico(`<rect x="-6" y="-1.5" width="12" height="3" fill="#a8855a" stroke="#fff" stroke-width=".5"/>`, 40), "Мосты: у каждой реки два")}
${li(ico(`<circle cx="0" cy="0" r="3" fill="#d6372a" stroke="#fff" stroke-width=".6"/>`, 40), "Боссы")}
${li(ico(line([[-9, 0], [9, 0]], "#06232b", 2.7) + line([[-9, 0], [9, 0]], "#35e0e6", 1.35), 40), "Кратчайший путь Аурелион → Эмберхолл (голубой) и Мортхейм → Эмберхолл (оранжевый); метки — пройдено тайлов")}
${li(ico(`<line x1="-9" y1="0" x2="9" y2="0" stroke="#ffd23f" stroke-width="1" stroke-dasharray="3 2"/>`, 40), "Ось симметрии карты (x = 550): Эмберхолл стоит левее неё")}
<p class="foot"><b>Что не так сейчас</b>: центр сдвинут к западу, поэтому путь до него неравный; уровни растут к востоку, а не к центру; у Умбрата нет прямой дороги к центру; зал Ашлорда пешком недостижим; середина между реками уже, чем нужно; броды у краёв карты открыты.</p>
</div>`;
  let h = `<div class="tbl"><h2>Было: зоны, уровни и путь пешком по проходимым клеткам настоящей карты</h2><table><thead><tr><th>Зона</th><th>Ур.</th><th class="n">от Аурелиона<br><small>до зоны или центра</small></th><th class="n">от Мортхейма<br><small>до зеркальной точки или центра</small></th><th class="n">Δ</th></tr></thead><tbody>`;
  const cell = (v: number) => (isFinite(v) ? `${Math.round(v)} <small>${fmtT(v)}</small>` : "—");
  for (const r of w.rows) {
    if (typeof r === "string") { h += `<tr class="sec"><td colspan="5">${esc(r)}</td></tr>`; continue; }
    const diff = isFinite(r.a) && isFinite(r.m) ? diffPct(r.a, r.m) : NaN;
    h += `<tr><td>${esc(r.name)}${r.note ? ` <span class="warn">— ${esc(r.note)}</span>` : ""}</td><td>${esc(r.lv)}</td><td class="n">${cell(r.a)}</td><td class="n">${cell(r.m)}</td><td class="n ${!(diff <= 3) ? "bad" : "ok"}">${isFinite(diff) ? fmtPct(diff) : "—"}</td></tr>`;
  }
  h += `</tbody></table><div class="foot"><b>Эмберхолл: ${Math.round(w.pA)} тайлов от Аурелиона и ${Math.round(w.pM)} от Мортхейма — разница ${fmtPct(diffPct(w.pA, w.pM))}</b> (допуск 3 %). Между реками ${w.gap} тайлов. Пути — по проходимым клеткам настоящей карты (деревья, скалы, вода и стены закрыты), 16 направлений.<br><b>Рост уровней по пути до Эмберхолла</b> (пройдено тайлов → уровень середины зоны): Аурелион — ${w.lvA.map(([d, l]) => `${d}→${l}`).join(" · ")}; Мортхейм — ${w.lvM.map(([d, l]) => `${d}→${l}`).join(" · ")}.</div></div>`;
  return `<div class="below">${leg}${h}</div>`;
}

// ===================================================================== запуск
function chromePath(): string {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const want = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["was", "A", "B"]);
  const pages: { file: string; html: string }[] = [];
  const log: string[] = [];
  if (want.has("was")) {
    const w = buildWas();
    pages.push({ file: "1-bylo.png", html: htmlPage("Было: нынешняя карта «Поля вечных битв» (задача 132, шаг 1)", "Как в tools/preview-map.ts (4 px на тайл → 2 px), с подписями зон и уровней. Голубая и оранжевая линии — кратчайшие пути от столиц до Эмберхолла.", w.svg, wasLegendAndTable(w)) });
    log.push(`было: Аурелион→Эмберхолл ${Math.round(w.pA)}, Мортхейм→Эмберхолл ${Math.round(w.pM)} (Δ ${fmtPct(diffPct(w.pA, w.pM))}), между реками ${w.gap}`);
    for (const r of w.rows) if (typeof r !== "string") log.push(`  было ${r.name.padEnd(36)} ${r.lv.padEnd(8)} А ${isFinite(r.a) ? Math.round(r.a) : "—"} · М ${isFinite(r.m) ? Math.round(r.m) : "—"}`);
  }
  const rg = Math.round(W - 2 * (RIV_W.reduce((a, p) => a + p[0], 0) / RIV_W.length));
  for (const v of VARIANTS) {
    if (!want.has(v.id)) continue;
    const d = buildPlan(v);
    const sub = `Восток — зеркало запада (тайл x ↔ 1099 − x). Эмберхолл на оси симметрии ${v.word} (тайлы 550, ${d.g.emb[1]}); данж и мировой босс — на оси с другой стороны. ${v.note} 1 тайл = 2 px.`;
    const svg = planSvg(d, rg);
    const counts = { ...FLAGS };
    pages.push({ file: v.file, html: htmlPage(`Стало · ${v.title}`, sub, svg, `<div class="below">${planLegend(counts)}${planTable(d)}</div>`) });
    // допуск шага 1: пути и рост уровней от обеих столиц равны с точностью 3 %, проверки схемы без замечаний
    if (d.maxDiff > 3 || d.maxLvDiff > 3 || d.checks.some((c) => c.startsWith("ВНИМАНИЕ"))) { process.exitCode = 1; log.push(`ВНИМАНИЕ: вариант ${v.id} не прошёл проверку`); }
    log.push(`${v.id}: макс. Δ путей ${fmtPct(d.maxDiff)}, Δ уровней ${d.maxLvDiff.toFixed(1)}; штандартов ${counts.ok} + ${counts.bad} повреждённых; ${d.checks.join(" | ")}`);
    d.rows.forEach((r, i) => { if (!r.sec) log.push(`  ${String(r.n).padStart(2)} ${r.name.padEnd(36)} ${r.lv.padEnd(8)} А ${Math.round(d.vals[i].a)} · М ${Math.round(d.vals[i].m)}`); });
    log.push(`  Эмберхолл: путь ${Math.round(d.pA.len)}, уровни ${d.lvA.map(([a, b]) => `${a}→${Math.round(b)}`).join(" ")}`);
  }
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 2240, height: 900, deviceScaleFactor: 1 });
    for (const p of pages) {
      await page.setContent(p.html, { waitUntil: "load" });
      await page.screenshot({ path: `${OUT}/${p.file}` as `${string}.png`, fullPage: true });
      log.push(`PNG: ${OUT}/${p.file}`);
    }
  } finally {
    await browser.close();
  }
  console.log(log.join("\n"));
}

main().catch((e) => { console.error(e); process.exit(1); });
