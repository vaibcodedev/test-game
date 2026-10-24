/**
 * Отладка: рендер участка карты тайлами (dual grid) и объектами в tools/out/region.png.
 * Аргументы: x y w h (в тайлах), «town» — весь Эмберхолл, «bridge N|M|S [east]» — ворота, мост и кусок стены вдоль реки (запад или восток);
 * в конце можно добавить «--out файл.png». Переменная MARKS="x,y;x,y" ставит метки (пиксели мира).
 */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import world from "../data/world.json";
import { MAP_SEED, MAP_W } from "../shared/constants";
import { CELL_WALL, GROUND_OBJECTS, generateMap, riverX, T, TOWN } from "../shared/map";
import { TOWN_HALF } from "../shared/town";
import { PC } from "./gen/canvas";

const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const OUT = oi >= 0 ? args.splice(oi, 2)[1] : "tools/out/region.png";
let region: number[];
if (args[0] === "town") region = [TOWN.x - TOWN_HALF.x - 3, TOWN.y - TOWN_HALF.y - 4, TOWN_HALF.x * 2 + 7, TOWN_HALF.y * 2 + 8];
else if (args[0] === "bridge") {
  const b = world.bridges.find((q) => q.id === args[1]) ?? world.bridges[1];
  const east = args[2] === "east";
  // от стены (6,5 тайла западнее реки) с запасом до дальнего берега: 34×22 тайла вокруг моста, восток — зеркально
  const wx = Math.floor(riverX(b.y)) - 18;
  region = [east ? MAP_W - (wx + 34) : wx, Math.floor(b.y) - 11, 34, 22];
} else region = args.length === 4 ? args.map(Number) : [20, 56, 30, 22];
const [x0, y0, w, h] = region;
const m = generateMap(MAP_SEED);
const read = (f: string) => {
  const png = PNG.sync.read(fs.readFileSync(f));
  const pc = new PC(png.width, png.height);
  pc.data.set(png.data);
  return pc;
};
const tiles = read("client/public/assets/tiles/terrain.png");
const water = read("client/public/assets/tiles/water.png");
const COLS = 18;
const out = new PC(w * 32, h * 32);
const V = (x: number, y: number) => m.vtx[y * (m.w + 1) + x];
const blitTile = (tx: number, ty: number, dx: number, dy: number) => {
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    const c = tiles.get(tx * 32 + i, ty * 32 + j)!;
    if (c[3]) out.set(dx + i, dy + j, c);
  }
};
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const cx = x0 + x, cy = y0 + y;
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) out.set(x * 32 + i, y * 32 + j, water.get((x * 32 + i) % 64, (y * 32 + j) % 64)!);
  const c = [V(cx, cy), V(cx + 1, cy), V(cx + 1, cy + 1), V(cx, cy + 1)];
  const lowest = Math.min(...c);
  for (let t = 1; t < 15; t++) {
    if (!c.includes(t)) continue;
    const mask = t === lowest ? 15 : (c[0] >= t ? 1 : 0) | (c[1] >= t ? 2 : 0) | (c[2] >= t ? 4 : 0) | (c[3] >= t ? 8 : 0);
    let col = mask - 1;
    if (mask === 15) {
      const v = ((cx * 7 + cy * 13) ^ (cx * cy)) % 7;
      col = v < 4 ? 14 : 14 + (v - 3);
    }
    blitTile(col, t, x * 32, y * 32);
  }
  if (m.cell[cy * m.w + cx] & CELL_WALL) {
    const below = m.cell[(cy + 1) * m.w + cx] & CELL_WALL;
    blitTile(below ? (cx + cy) % 2 : 2 + ((cx * 3 + cy) % 4), 10, x * 32, y * 32);
  }
}
// объекты: по глубине (нижний край), опора — нижняя середина; лежащие на земле (GROUND_OBJECTS) — первыми.
// Анимированные (vfx/manifest.json: огонь, горны, штандарты Полей) — первый кадр с якорем листа; flip — зеркальная копия
const vfxm = JSON.parse(fs.readFileSync("client/public/assets/vfx/manifest.json", "utf8")) as Record<string, { frameW: number; frameH: number; anchor: [number, number]; r?: 1 }>;
const objs = m.objects.filter((o) => o.x > x0 * 32 - 160 && o.x < (x0 + w) * 32 + 160 && o.y > y0 * 32 && o.y < (y0 + h) * 32 + 200)
  .sort((a, b) => (GROUND_OBJECTS.has(b.kind) ? 1 : 0) - (GROUND_OBJECTS.has(a.kind) ? 1 : 0) || a.y - b.y);
const cache = new Map<string, { img: PC; ax: number; ay: number } | null>();
const frame0 = (src: PC, fw: number, fh: number) => {
  const pc = new PC(fw, fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) for (let q = 0; q < 4; q++) pc.data[(y * fw + x) * 4 + q] = src.data[(y * src.w + x) * 4 + q];
  return pc;
};
const mirrorX = (src: PC) => {
  const pc = new PC(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) for (let q = 0; q < 4; q++) pc.data[(y * src.w + x) * 4 + q] = src.data[(y * src.w + src.w - 1 - x) * 4 + q];
  return pc;
};
for (const o of objs) {
  const key = o.kind + (o.flip ? "|f" : "");
  if (!cache.has(key)) {
    const f = `client/public/assets/objects/${o.kind}.png`, e = vfxm[o.kind];
    const vf = e && `client/public/assets/vfx/${e.r ? "r/" : ""}${o.kind}.png`;
    let v: { img: PC; ax: number; ay: number } | null = null;
    if (fs.existsSync(f)) v = { img: read(f), ax: 0.5, ay: 1 };
    else if (vf && fs.existsSync(vf)) v = { img: frame0(read(vf), e.frameW, e.frameH), ax: e.anchor[0], ay: e.anchor[1] };
    if (v && o.flip) v = { img: mirrorX(v.img), ax: 1 - v.ax, ay: v.ay };
    cache.set(key, v);
  }
  const v = cache.get(key);
  if (!v) continue;
  out.blit(v.img, Math.round(o.x - x0 * 32 - v.img.w * v.ax), Math.round(o.y - y0 * 32 - v.img.h * v.ay));
}
// отметки (x,y в пикселях мира) из MARKS="x,y;x,y"
for (const mk of (process.env.MARKS ?? "").split(";").filter(Boolean)) {
  const [mx, my] = mk.split(",").map(Number);
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) out.set(mx - x0 * 32 + i, my - y0 * 32 + j, [255, 0, 255, 255]);
}
const png = new PNG({ width: out.w, height: out.h });
Buffer.from(out.data.buffer).copy(png.data);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(png));
console.log(OUT, out.w, out.h);
