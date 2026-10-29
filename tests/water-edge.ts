/**
 * Проходимость по видимой кромке воды (shared/map.ts waterAtFeet / moveWithCollision): герой идёт к воде с 8 направлений на озере, реке, болоте, у моста и у узкого ручья.
 * Проверяется: ноги не заходят в воду ни по маске, ни по видимому рисунку (альфа тайлов terrain.png), остановка в ≤ 4 px от видимой воды (по опоре ног), мост проходим по всей ширине.
 * Без браузера и сервера: npx tsx tests/water-edge.ts. Снимки ног у кромки — tests/water-bank-shots.ts (--edge), tools/out/shaders/water-edge.png.
 */
import fs from "node:fs";
import { PNG } from "pngjs";
import { MAP_SEED } from "../shared/constants";
import { BRIDGE_DECK_H, BRIDGE_DECK_V, CELL_BRIDGE, EDGE_COLLISION, FOOT_DY, FOOT_HW, generateMap, moveWithCollision, shoreAt, shoreStand, SHORE_BIOMES, SHORE_VARIANTS, T, TERRAIN_COUNT, waterAtFeet, walkable, Zone, zoneAt } from "../shared/map";
import { landT, shoreField } from "../tools/gen/shores";
import { COLS, terrainLayers } from "../client/src/game/terrainTiles";

if (!EDGE_COLLISION) { console.log("EDGE_COLLISION выключен (shared/map.ts): проверки кромки пропущены"); process.exit(0); }
const m = generateMap(MAP_SEED);
const png = PNG.sync.read(fs.readFileSync("client/public/assets/tiles/terrain.png"));
const layers = terrainLayers(m);
const V = (x: number, y: number) => m.vtx[y * (m.w + 1) + x];
/** Вода на экране в точке: ни один слой земли не закрывает пиксель (альфа тайла). */
function visibleWater(px: number, py: number): boolean {
  const x = Math.floor(px / 32), y = Math.floor(py / 32);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
  const lx = Math.min(31, Math.floor(px - x * 32)), ly = Math.min(31, Math.floor(py - y * 32));
  // берег автотайлом (shores.png): видимая суша — верх суши по полю рисунка (tools/gen/shores.ts), стенка и пена — уже вода
  const sh = shoreAt(m, x, y);
  if (sh) return !(shoreField(sh.mask, sh.variant, lx, ly) > landT(sh.biome));
  const low = Math.min(V(x, y), V(x + 1, y), V(x + 1, y + 1), V(x, y + 1));
  for (let t = 1; t < TERRAIN_COUNT; t++) {
    if (t === low && low === T.Lava) continue; // слой самой лавы — не суша
    const idx = layers[t]?.[y * m.w + x]; if (idx === undefined || idx < 0) continue;
    const col = idx % COLS, row = Math.floor(idx / COLS);
    if (png.data[((row * 32 + ly) * png.width + col * 32 + lx) * 4 + 3] > 128) return false;
  }
  return true;
}
/** Любая из трёх точек опоры (низ спрайта, ступни ±FOOT_HW) на видимой воде. */
const feetVisible = (px: number, py: number) => visibleWater(px, py + FOOT_DY) || visibleWater(px - FOOT_HW, py + FOOT_DY) || visibleWater(px + FOOT_HW, py + FOOT_DY);
let bad = 0;
const waterUnderFeet = (x: number, y: number) => waterAtFeet(m, x, y + FOOT_DY) || waterAtFeet(m, x - FOOT_HW, y + FOOT_DY) || waterAtFeet(m, x + FOOT_HW, y + FOOT_DY);
const ok = (c: boolean, msg: string) => { console.log(`${c ? "ok  " : "FAIL"} ${msg}`); if (!c) bad++; };

// таблица прохода (shared/shoreWalk.ts) совпадает с рисунком берега — иначе перегенерировать: npx tsx tools/gen/shores.ts
{
  let diff = 0;
  for (let b = 0; b < SHORE_BIOMES.length; b++) for (let v = 0; v < SHORE_VARIANTS; v++) for (let mk = 1; mk <= 15; mk++)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (shoreStand(b, mk, v, x, y) !== shoreField(mk, v, x, y) > landT(b)) diff++;
  ok(diff === 0, `таблица прохода берега = рисунок кромки (расхождений ${diff} px)`);
}

// места: берег с водой на юге и сушей на севере (как в water-bank-shots), по зонам
function shore(pred: (tx: number, ty: number) => boolean, near?: { x: number; y: number }, liq: number = T.Water) {
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let ty = 16; ty < m.h - 16; ty += 2) for (let tx = 16; tx < m.w - 16; tx += 2) {
    if (!pred(tx, ty)) continue;
    let c = 0; for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (V(tx + x, ty + y) === liq) c++;
    const f = c / 121; if (f < 0.3 || f > 0.6 || !(V(tx, ty - 3) > 1 && V(tx, ty + 3) === liq)) continue;
    const d = near ? Math.hypot(tx * 32 - near.x, ty * 32 - near.y) : Math.hypot(tx - m.playerSpawn.x / 32, ty - m.playerSpawn.y / 32);
    if (d < bd) { bd = d; best = { x: tx * 32 + 16, y: ty * 32 + 16 }; }
  }
  return best;
}
const inZ = (z: Zone) => (tx: number, ty: number) => zoneAt(tx, ty, MAP_SEED) === z;
const bridges = m.objects.filter((o) => o.kind === "bridge_h" || o.kind === "bridge_v");
const spots: [string, { x: number; y: number } | null][] = [
  ["озеро", shore(inZ(Zone.Meadow))], ["река", bridges[0] ? shore(() => true, { x: bridges[0].x, y: bridges[0].y - 200 }) : null],
  ["болото", shore(inZ(Zone.Swamp))], ["лес", shore(inZ(Zone.Forest))], ["пустыня", shore(inZ(Zone.Desert))],
];
// узкий ручей: вода шириной 2–3 вершины по x
let creek: { x: number; y: number } | null = null;
for (let ty = 20; ty < m.h - 20 && !creek; ty++) for (let tx = 20; tx < m.w - 20 && !creek; tx++) {
  if (V(tx, ty) !== T.Water || V(tx - 1, ty) === T.Water) continue;
  let w = 0; while (w < 6 && V(tx + w, ty) === T.Water) w++;
  if (w >= 2 && w <= 3 && V(tx + w, ty) !== T.Water && V(tx, ty + 1) === T.Water && V(tx - 1, ty + 1) !== T.Water) creek = { x: (tx - 1) * 32 + 16, y: ty * 32 + 16 };
}
spots.push(["ручей", creek]);
spots.push(["лава", shore(() => true, undefined, T.Lava)]); // берег у лавы: автотайл магмы, проход по кромке так же

const R = 10, STEP = 4;
let worstGap = 0, worstIn = 0, n = 0;
for (const [name, c] of spots) {
  if (!c) { console.log(`пропуск: нет места «${name}»`); continue; }
  let done = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, dx = Math.cos(a), dy = Math.sin(a);
    // старт: вдоль направления от центра места на суше за 140 px до воды; идём к воде, пока не упрёмся
    let sx = c.x - dx * 140, sy = c.y - dy * 140;
    if (!walkable(m, sx, sy, R) || feetVisible(sx, sy)) continue;
    let x = sx, y = sy, stuck = 0;
    for (let i = 0; i < 200 && stuck < 3; i++) { const q = moveWithCollision(m, x, y, dx * STEP, dy * STEP, R); stuck = q.x === x && q.y === y ? stuck + 1 : 0; x = q.x; y = q.y; }
    // дошёл ли до воды вообще (направление могло идти по суше)
    let gap = -1; for (let s = 0; s <= 40; s += 0.5) if (feetVisible(x + dx * s, y + dy * s)) { gap = s; break; }
    if (gap < 0) continue;
    done++; n++;
    const inWater = feetVisible(x, y), inMask = waterAtFeet(m, x, y + FOOT_DY);
    worstGap = Math.max(worstGap, gap); if (inWater) worstIn++;
    if (inMask || inWater || gap > 4.5) console.log(`  ${name} напр.${k}: стоп (${x.toFixed(1)}, ${y.toFixed(1)}) маска=${inMask} видимая вода=${inWater} зазор до видимой воды ${gap} px`);
  }
  ok(done > 0, `${name}: проверено направлений ${done}`);
}
ok(worstIn === 0, `ноги ни разу не заходят в видимую воду (${n} прогонов)`);
ok(worstGap <= 4.5, `остановка в ≤ 4 px от видимой воды (по опоре ног) (худший зазор ${worstGap} px)`);
// мост: между перилами (BRIDGE_DECK_H / _V от края моста) проходим поперёк реки по всей ширине настила; на перилах — нельзя (не упасть с края)
const b = bridges[0];
if (b) {
  const h = b.kind === "bridge_h";
  const top = b.y - 96, left = b.x - 48; // горизонтальный 192×96 (низ по центру), вертикальный 96×192
  const [lo, hi] = h ? BRIDGE_DECK_H : BRIDGE_DECK_V;
  const cross = (rel: number) => {
    let x = h ? b.x - 3 * 32 - 20 : left + rel, y = h ? top + rel - FOOT_DY : b.y - 6 * 32 - 20;
    const x0 = x, y0 = y, dx = h ? STEP : 0, dy = h ? 0 : STEP;
    let wet = false;
    for (let i = 0; i < 120; i++) { const q = moveWithCollision(m, x, y, dx, dy, R); x = q.x; y = q.y; if (waterUnderFeet(x, y)) wet = true; }
    return !wet && Math.hypot(x - x0, y - y0) > 150;
  };
  let crossed = 0, tried = 0;
  for (let rel = lo + 2; rel <= hi - 2; rel += 7) { tried++; if (cross(rel)) crossed++; }
  ok(crossed === tried, `мост: между перилами поперёк реки прошли ${crossed} из ${tried} линий`);
  ok(!cross(lo - 8) && !cross(hi + 8), "мост: по перилам и за краем настила пройти нельзя");
}
void CELL_BRIDGE;
console.log(bad ? `\nСбоев: ${bad}` : "\nПроходимость по кромке воды: все проверки пройдены");
process.exit(bad ? 1 : 0);
