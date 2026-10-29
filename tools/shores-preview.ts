/**
 * Офлайн-превью берегов на настоящей карте (без браузера): вода water.png + слои земли terrainTiles.ts (terrain.png и shores.png),
 * без объектов. Места: озеро у травы, берег с песком, у моста. Красным (флаг --walk) — граница «можно стоять» (waterAtFeet).
 * Запуск: npx tsx tools/shores-preview.ts [--walk] → tools/out/shores/preview.png
 */
import fs from "node:fs";
import { PNG } from "pngjs";
import { MAP_SEED } from "../shared/constants";
import { generateMap, T, waterAtFeet, Zone, zoneAt } from "../shared/map";
import { COLS, shoreSpillLayer, terrainLayers } from "../client/src/game/terrainTiles";
import { SHORE_GID, SHORE_COLS, shoreAt } from "../shared/map";
import { PC } from "./gen/canvas";

const walkLine = process.argv.includes("--walk");
const m = generateMap(MAP_SEED);
const layers = [shoreSpillLayer(m), ...terrainLayers(m)];
const terrain = PNG.sync.read(fs.readFileSync("client/public/assets/tiles/terrain.png"));
const shores = PNG.sync.read(fs.readFileSync("client/public/assets/tiles/shores.png"));
const water = PNG.sync.read(fs.readFileSync("client/public/assets/tiles/water.png"));
const V = (x: number, y: number) => m.vtx[y * (m.w + 1) + x];

function render(cx: number, cy: number, tw: number, th: number): PC {
  const out = new PC(tw * 32, th * 32);
  const x0 = cx - (tw >> 1), y0 = cy - (th >> 1);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const k = ((((y0 * 32 + y) % 64) * 64) + ((x0 * 32 + x) % 64)) * 4;
    out.set(x, y, [water.data[k], water.data[k + 1], water.data[k + 2], 255]);
  }
  for (const L of layers) {
    if (!L) continue;
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
      const tx = x0 + i, ty = y0 + j;
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
      const idx = L[ty * m.w + tx];
      if (idx < 0) continue;
      const [png, cols, id] = idx >= SHORE_GID ? [shores, SHORE_COLS, idx - SHORE_GID] : [terrain, COLS, idx];
      const sx = (id % cols) * 32, sy = Math.floor(id / cols) * 32;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const k = ((sy + y) * png.width + sx + x) * 4;
        if (png.data[k + 3]) out.set(i * 32 + x, j * 32 + y, [png.data[k], png.data[k + 1], png.data[k + 2], png.data[k + 3]]);
      }
    }
  }
  if (walkLine) for (let y = 0; y < out.h - 1; y++) for (let x = 0; x < out.w - 1; x++) {
    const wx = x0 * 32 + x, wy = y0 * 32 + y;
    const a = waterAtFeet(m, wx, wy);
    if (a !== waterAtFeet(m, wx + 1, wy) || a !== waterAtFeet(m, wx, wy + 1)) out.set(x, y, [255, 40, 40, 255]);
  }
  return out;
}
/** Место, где у воды суша нужного типа: доля воды в окне 30–60 %. */
function spot(pred: (t: number, tx: number, ty: number) => boolean, skip = 0) {
  const found: [number, number][] = [];
  for (let ty = 12; ty < m.h - 12; ty += 3) for (let tx = 12; tx < m.w - 12; tx += 3) {
    let c = 0, s = 0;
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) { const v = V(tx + x, ty + y); if (v === T.Water) c++; else if (pred(v, tx, ty)) s++; }
    if (c > 35 && c < 70 && s > 40) found.push([tx, ty]);
  }
  return found[Math.min(found.length - 1, skip)];
}
const up = (pc: PC, k: number) => { const o = new PC(pc.w * k, pc.h * k); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, pc.get(Math.floor(x / k), Math.floor(y / k))!); return o; };
/** Клетка северного берега биома bi (маска 3) с водой 25–60 % в окне — первая по ходу карты, skip — пропустить столько найденных. */
function shoreSpot(bi: number, skip = 0, lo = 30, hi = 72): [number, number] | null {
  let n = 0;
  for (let ty = 6; ty < m.h - 6; ty++) for (let tx = 8; tx < m.w - 8; tx++) {
    const s = shoreAt(m, tx, ty);
    if (!s || s.biome !== bi || s.mask !== 3) continue;
    let c = 0; for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (V(tx + x, ty + y) <= T.Lava) c++;
    if (c < lo || c > hi) continue;
    if (n++ >= skip) return [tx, ty];
  }
  return null;
}
const want = (process.argv.find((a) => a.startsWith("--biomes="))?.slice(9) ?? "2,3,4,5,6,7").split(",").map(Number);
const spots = want.map((b) => shoreSpot(b, 3) ?? shoreSpot(b) ?? shoreSpot(b, 0, 12, 110)).filter(Boolean) as [number, number][];
const TW = 12, TH = 8;
const out = new PC(2 * TW * 32 * 2 + 10, Math.ceil(spots.length / 2) * (TH * 32 * 2 + 10));
spots.forEach(([x, y], i) => out.blit(up(render(x, y, TW, TH), 2), (i % 2) * (TW * 64 + 10), Math.floor(i / 2) * (TH * 64 + 10)));
fs.mkdirSync("tools/out/shores", { recursive: true });
out.save(`tools/out/shores/preview${walkLine ? "-walk" : ""}.png`);
console.log("spots", spots);
