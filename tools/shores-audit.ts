/**
 * Аудит берегов воды и лавы по маске карты (без браузера): у каждой клетки на кромке жидкости — «трудность» (узкая протока, седло-диагональ,
 * смесь суши в клетке, лава, конец моста, кромка без автотайла); окна 5×5 суммируются, берутся 14 худших мест (не ближе 24 клеток).
 * Монтаж «до | после»: до — прежние тайлы земли без автотайлов берега, после — автотайлы (shores.png) и свес стенок; вода — water.png, лава — тайл
 * terrain.png (без шейдеров), мост — bridge_h/v. Запуск под замком: npx tsx tools/shores-audit.ts → tools/out/shores/audit.png
 */
import fs from "node:fs";
import { PNG } from "pngjs";
import { MAP_SEED } from "../shared/constants";
import { CELL_BRIDGE, generateMap, SHORE_COLS, SHORE_GID, shoreAt, T, TERRAIN_KEYS } from "../shared/map";
import { COLS, shoreSpillLayer, terrainLayers } from "../client/src/game/terrainTiles";
import { PC } from "./gen/canvas";
import { drawText } from "./gen/vendor-lib";

const m = generateMap(MAP_SEED);
const W1 = m.w + 1, V = (x: number, y: number) => m.vtx[y * W1 + x];
const read = (f: string) => PNG.sync.read(fs.readFileSync(f));
const terrain = read("client/public/assets/tiles/terrain.png"), shores = read("client/public/assets/tiles/shores.png"), water = read("client/public/assets/tiles/water.png");
const bh = read("client/public/assets/objects/bridge_h.png"), bv = read("client/public/assets/objects/bridge_v.png");
const before = terrainLayers(m, false), after = [shoreSpillLayer(m), ...terrainLayers(m, true)];

// ---- трудность клеток ----
const score = new Float32Array(m.w * m.h);
const reasons = new Map<number, Set<string>>();
const add = (x: number, y: number, s: number, r: string) => { const i = y * m.w + x; score[i] += s; (reasons.get(i) ?? reasons.set(i, new Set()).get(i)!).add(r); };
for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
  const c = [V(x, y), V(x + 1, y), V(x + 1, y + 1), V(x, y + 1)];
  const liq = c.includes(T.Water) ? T.Water : c.includes(T.Lava) ? T.Lava : -1;
  if (liq < 0 || c.every((v) => v === liq)) continue;
  const sh = shoreAt(m, x, y);
  if (!sh) add(x, y, 4, "без автотайла");
  else if (sh.mask === 5 || sh.mask === 10) add(x, y, 3, "диагональ");
  if (new Set(c.filter((v) => v !== liq)).size > 1) add(x, y, 2, "смесь суши");
  if (liq === T.Lava) add(x, y, 1, "лава");
  const narrowX = V(x - 1, y) !== liq && V(x + 1, y) !== liq && V(x, y) === liq, narrowY = V(x, y - 1) !== liq && V(x, y + 1) === liq && V(x, y + 2) !== liq;
  if (narrowX || narrowY) add(x, y, 3, "протока в 1 клетку");
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (m.cell[(y + dy) * m.w + x + dx] & CELL_BRIDGE) { add(x, y, 3, "конец моста"); break; }
}
const win = (x: number, y: number) => { let s = 0; for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h) s += score[yy * m.w + xx]; } return s; };
const cand: [number, number, number][] = [];
for (let y = 4; y < m.h - 4; y += 2) for (let x = 5; x < m.w - 5; x += 2) { const s = win(x, y); if (s > 0) cand.push([s, x, y]); }
cand.sort((a, b) => b[0] - a[0]);
const atArg = process.argv.find((a) => a.startsWith("--at="));
const picks: [number, number, number][] = atArg ? atArg.slice(5).split(";").map((q) => { const [x, y] = q.split(",").map(Number); return [0, x, y] as [number, number, number]; }) : [];
if (!atArg) for (const c of cand) { if (picks.length >= 14) break; if (picks.every((p) => Math.hypot(p[1] - c[1], p[2] - c[2]) > 24)) picks.push(c); }

// ---- отрисовка ----
const TW = 9, TH = 6;
function render(layers: (Int16Array | null)[], cx: number, cy: number): PC {
  const out = new PC(TW * 32, TH * 32), x0 = cx - (TW >> 1), y0 = cy - (TH >> 1);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) { const k = ((((y0 * 32 + y) % 64 + 64) % 64) * 64 + (((x0 * 32 + x) % 64) + 64) % 64) * 4; out.set(x, y, [water.data[k], water.data[k + 1], water.data[k + 2], 255]); }
  for (const L of layers) {
    if (!L) continue;
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
      const tx = x0 + i, ty = y0 + j;
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
      const idx = L[ty * m.w + tx];
      if (idx < 0) continue;
      const [png, cols, id] = idx >= SHORE_GID ? [shores, SHORE_COLS, idx - SHORE_GID] : [terrain, COLS, idx];
      const sx = (id % cols) * 32, sy = Math.floor(id / cols) * 32;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const k = ((sy + y) * png.width + sx + x) * 4; if (png.data[k + 3]) out.set(i * 32 + x, j * 32 + y, [png.data[k], png.data[k + 1], png.data[k + 2], png.data[k + 3]]); }
    }
  }
  for (const o of m.objects) if (o.kind === "bridge_h" || o.kind === "bridge_v") {
    const img = o.kind === "bridge_h" ? bh : bv, ox = o.x - img.width / 2 - x0 * 32, oy = o.y - img.height - y0 * 32;
    if (ox > out.w || oy > out.h || ox + img.width < 0 || oy + img.height < 0) continue;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) { const k = (y * img.width + x) * 4; if (img.data[k + 3]) out.set(Math.round(ox + x), Math.round(oy + y), [img.data[k], img.data[k + 1], img.data[k + 2], img.data[k + 3]]); }
  }
  return out;
}
const up = (pc: PC, k: number) => { const o = new PC(pc.w * k, pc.h * k); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, pc.get(Math.floor(x / k), Math.floor(y / k))!); return o; };
const PW = TW * 64, PH = TH * 64, GAP = 6;
const out = new PC(2 * (2 * PW + GAP) + 20, Math.ceil(picks.length / 2) * (PH + 24));
out.rect(0, 0, out.w, out.h, [18, 16, 22, 255]);
picks.forEach(([s, x, y], n) => {
  const X = (n % 2) * (2 * PW + GAP + 20), Y = Math.floor(n / 2) * (PH + 24);
  out.blit(up(render(before, x, y), 2), X, Y + 20);
  out.blit(up(render(after, x, y), 2), X + PW + GAP, Y + 20);
  const rs = new Set<string>(); for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) reasons.get((y + j) * m.w + x + i)?.forEach((r) => rs.add(r));
  const land = new Set<string>(); for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) land.add(TERRAIN_KEYS[V(x + i, y + j)]);
  drawText(out, `${n + 1}. (${x * 32}, ${y * 32}) ${[...land].join("/")}: ${[...rs].join(", ")}  | до | после`, X + 4, Y + 6, [255, 236, 190, 255], 1);
});
fs.mkdirSync("tools/out/shores", { recursive: true });
out.save(atArg ? "tools/out/shores/audit-at.png" : "tools/out/shores/audit.png");
console.log(picks.map(([s, x, y]) => `${s.toFixed(0)} @ ${x},${y}`).join("; "));
