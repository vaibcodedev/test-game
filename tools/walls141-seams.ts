/**
 * Задача 141: проверка стыков стен, башен, ворот и частокола без щелей (по маске непрозрачности).
 * Рисуются только объекты ограды (стены, башни, ворота, частокол, вышки лучников) с вариантами и сдвигом глубины, как в игре;
 * по линиям через фасады стен и брёвна частокола (от угла до угла, сквозь ворота) все пиксели должны быть непрозрачны.
 * Запуск: npx tsx tools/walls141-seams.ts [--out папка] — при щелях код выхода 1 и маска с метками в tools/out/walls141/seams-<место>.png.
 */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, type MapObject } from "../shared/map";
import { CITIES, CITY_WALL } from "../shared/cities";
import { SETTLEMENTS, gateCells } from "../shared/settlements";
import { TOWN, WALL } from "../shared/town";
import { ART_KINDS } from "../shared/cityart";
import { PC } from "./gen/canvas";

const oi = process.argv.indexOf("--out");
const OUT = oi > 0 ? process.argv[oi + 1] : "tools/out/walls141";
const m = generateMap(MAP_SEED);
const cache = new Map<string, PC | null>();
const img = (o: MapObject) => {
  const f = o.v && fs.existsSync(`client/public/assets/objects/${o.kind}__${o.v}.png`) ? `client/public/assets/objects/${o.kind}__${o.v}.png` : `client/public/assets/objects/${o.kind}.png`;
  if (!cache.has(f)) {
    if (!fs.existsSync(f)) cache.set(f, null);
    else { const p = PNG.sync.read(fs.readFileSync(f)); const c = new PC(p.width, p.height); c.data.set(p.data); cache.set(f, c); }
  }
  return cache.get(f)!;
};
const FENCE = (k: string) => !!ART_KINDS[k] && ART_KINDS[k].role !== "house" || k.startsWith("bf_wall_tower_");
/** Маска объектов ограды в прямоугольнике (тайлы). */
function mask(x0: number, y0: number, w: number, h: number): PC {
  const out = new PC(w * TILE, h * TILE);
  const objs = m.objects.filter((o) => FENCE(o.kind) && o.x > x0 * TILE - 200 && o.x < (x0 + w) * TILE + 200 && o.y > y0 * TILE && o.y < (y0 + h) * TILE + 260)
    .sort((a, b) => a.y + (a.dz ?? 0) - b.y - (b.dz ?? 0));
  for (const o of objs) { const c = img(o); if (c) out.blit(c, Math.round(o.x - x0 * TILE - c.w / 2), Math.round(o.y - y0 * TILE - c.h)); }
  return out;
}
let bad = 0;
/** Линия от (ax, ay) до (bx, by) в пикселях мира: все пиксели маски непрозрачны. */
function line(id: string, mk: PC, x0: number, y0: number, ax: number, ay: number, bx: number, by: number, holes: [number, number][]) {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  let gaps = 0;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n) - x0 * TILE, y = Math.round(ay + ((by - ay) * i) / n) - y0 * TILE;
    if (mk.alpha(x, y) < 200) { gaps++; holes.push([x, y]); }
  }
  if (gaps) { bad++; console.log(`FAIL ${id}: ${gaps} прозрачных px`); }
}
function place(id: string, x0: number, y0: number, w: number, h: number, lines: [number, number, number, number][]) {
  const mk = mask(x0, y0, w, h), holes: [number, number][] = [];
  for (const [ax, ay, bx, by] of lines) line(id, mk, x0, y0, ax, ay, bx, by, holes);
  if (holes.length) {
    for (const [x, y] of holes) for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) mk.set(x + i, y + j, [255, 0, 255, 255]);
    const png = new PNG({ width: mk.w, height: mk.h }); Buffer.from(mk.data.buffer).copy(png.data);
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `seams-${id}.png`), PNG.sync.write(png));
  } else console.log(`ok   ${id}: стыки без щелей (${lines.length} линий)`);
}
/** Города: ряды стен на высоте фасада (низ клетки − 20 px) и верха прохода (− 60 px), столбцы стен V по середине клетки. */
function city(id: string, cx: number, cy: number, hx: number, hy: number) {
  const L = (cx - hx) * TILE, R = (cx + hx + 1) * TILE, T = (cy - hy + 1) * TILE, B = (cy + hy + 1) * TILE;
  const lines: [number, number, number, number][] = [];
  const gl = (cx - 1) * TILE + 2, gr = (cx + 2) * TILE - 2;
  // проём ворот открыт насквозь (правки 2) — обе линии обходят его, над аркой — третья линия по своду (−90 px)
  for (const yb of [T, B]) {
    for (const up of [20, 60]) { lines.push([L + 16, yb - up, gl, yb - up]); lines.push([gr, yb - up, R - 16, yb - up]); }
    lines.push([gl - 40, yb - 90, gr + 40, yb - 90]);
  }
  // боковые ворота Эмберхолла — проём без арки
  const side = id === "ember", sg0 = (cy - 1) * TILE - 40, sg1 = (cy + 2) * TILE + 20;
  for (const x of [L + 16, R - 16]) {
    if (side) { lines.push([x, T + 10, x, sg0]); lines.push([x, sg1, x, B - 50]); } else lines.push([x, T + 10, x, B - 50]);
  }
  place(id, cx - hx - 3, cy - hy - 6, hx * 2 + 7, hy * 2 + 8, lines);
}
for (const c of CITIES.filter((q) => q.style)) city(c.id, c.x, c.y, CITY_WALL.x, CITY_WALL.y);
city("ember", TOWN.x, TOWN.y, WALL.x, WALL.y);
/** Поселения: ряды частокола на высоте брёвен, столбцы по бокам; у ворот n/s — сквозь столбы и створки (кадр «открыто»: проём пропускается). */
for (const s of SETTLEMENTS) {
  const x0 = s.x - s.ring.w, x1 = s.x + s.ring.w, y0 = s.y - s.ring.n, y1 = s.y + s.ring.s;
  const gate = gateCells(s), lines: [number, number, number, number][] = [];
  for (const y of [y0, y1]) {
    const gy = gate.every(([, gy]) => gy === y) ? gate : null, yy = (y + 1) * TILE - 24;
    if (gy) { lines.push([x0 * TILE + 4, yy, (s.x - 1) * TILE - 1, yy]); lines.push([(s.x + 2) * TILE, yy, (x1 + 1) * TILE - 4, yy]); }
    else lines.push([x0 * TILE + 4, yy, (x1 + 1) * TILE - 4, yy]);
  }
  for (const x of [x0, x1]) {
    const gx = gate.every(([gx]) => gx === x), xx = x * TILE + 16;
    if (gx) { lines.push([xx, (y0 + 1) * TILE, xx, (s.y - 1) * TILE - 30]); lines.push([xx, (s.y + 2) * TILE, xx, (y1 + 1) * TILE - 30]); }
    else lines.push([xx, (y0 + 1) * TILE, xx, (y1 + 1) * TILE - 30]);
  }
  place(s.id, x0 - 2, y0 - 4, x1 - x0 + 5, y1 - y0 + 7, lines);
}
console.log(bad ? `\nЩелей: ${bad}` : "\nстыки: ок");
process.exit(bad ? 1 : 0);
