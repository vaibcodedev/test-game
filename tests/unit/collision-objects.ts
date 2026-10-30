/**
 * Коллизия объектов по основанию (data/collision.json, shared/map.ts objBoxHit; docs/art/perspective.md «Коллизии объектов»).
 * Для каждого вида с прямоугольником основания на пустой карте: герой (PLAYER_RADIUS) подходит с 4 сторон и по диагоналям до зазора ≤ 2 px,
 * внутрь не заходит, за верх высокого объекта (здание, дерево) проходит, в углу между двумя объектами не застревает, путь обходит объект.
 * Запуск: npx tsx tests/unit/collision-objects.ts
 */
import { assert, done, section, test } from "./lib";
import { CELL_BLOCK, CELL_OBJ, GROUND_OBJECTS, OBJECT_FOOTPRINT, hasObjBox, moveWithCollision, objBox, walkable, type MapObject, type WorldMap } from "../../shared/map";
import { findPath, segmentWalkable } from "../../shared/path";
import { moveGated } from "../../shared/siege";
import { PLAYER_SPEED, TICK_MS } from "../../shared/constants";
import { PLAYER_RADIUS, TILE } from "../../shared/constants";
import COLLISION from "../../data/collision.json";

const R = PLAYER_RADIUS, HH = R * 0.5; // тело юнита: ±R по x, ±R/2 по y (shared/map.ts walkIn)
const N = 32;

function emptyMap(): WorldMap {
  return { w: N, h: N, seed: 0, vtx: new Uint8Array(0), cell: new Uint8Array(N * N), zone: new Uint8Array(N * N), objects: [], spawns: [], bosses: [], nodes: [], playerSpawn: { x: 0, y: 0 }, merchant: { x: 0, y: 0 }, merchants: [] };
}
/** Как place() в shared/map.ts generateMap: клетки следа от привязки вправо и вверх, точка — нижняя середина следа, на 2 px выше низа клетки. */
function put(m: WorldMap, kind: string, ax: number, ay: number, v?: string): MapObject {
  const fp = OBJECT_FOOTPRINT[kind]!;
  for (let j = 0; j < fp.h; j++) for (let i = 0; i < fp.w; i++) {
    const k = (ay - j) * m.w + ax + i, c = m.cell[k];
    m.cell[k] = hasObjBox(kind) && (!(c & CELL_BLOCK) || c & CELL_OBJ) ? c | CELL_BLOCK | CELL_OBJ : (c | CELL_BLOCK) & ~CELL_OBJ;
  }
  const o: MapObject = { kind, x: (ax + fp.w / 2) * TILE, y: (ay + 1) * TILE - 2, ...(v ? { v } : {}) };
  m.objects = [...m.objects, o]; // новый массив — индекс прямоугольников пересоберётся
  return o;
}
/** Зазор между телом в (x, y) и прямоугольником: < 0 — внутри. */
function gap(b: number[], x: number, y: number) {
  return Math.max(b[0] - (x + R), (x - R) - b[1], b[2] - (y + HH), (y - HH) - b[3]);
}
/** Идти к точке (tx, ty) шагами по 3 px (как клиент за кадр), пока не упрёмся. */
function walkTo(m: WorldMap, x: number, y: number, tx: number, ty: number, steps = 200) {
  for (let i = 0; i < steps; i++) {
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy);
    if (d < 0.5) break;
    const s = Math.min(3, d), n = moveWithCollision(m, x, y, (dx / d) * s, (dy / d) * s, R);
    if (Math.abs(n.x - x) < 1e-6 && Math.abs(n.y - y) < 1e-6) break;
    x = n.x; y = n.y;
  }
  return { x, y };
}

const rules = COLLISION.rules as { cell: string[] };
const isCellKind = (k: string) => rules.cell.some((p) => (p.endsWith("*") ? k.startsWith(p.slice(0, -1)) : k === p));
const KINDS = Object.keys(OBJECT_FOOTPRINT).filter((k) => !GROUND_OBJECTS.has(k) && hasObjBox(k)).sort();
const TALL = (k: string) => /house|tavern|bank|forge|hut_|temple|church|crypt|ziggurat|tent|oak|pine|tree|palm|cactus|spire|statue|obelisk|lamp|pillar/.test(k);
const DIRS: [string, number, number][] = [["юг", 0, 1], ["север", 0, -1], ["запад", -1, 0], ["восток", 1, 0], ["юго-запад", -1, 1], ["юго-восток", 1, 1], ["северо-запад", -1, -1], ["северо-восток", 1, -1]];

section("виды объектов: у каждого непроходимого вида есть прямоугольник основания или правило cell");
await test("все непроходимые виды учтены", () => {
  const miss = Object.keys(OBJECT_FOOTPRINT).filter((k) => !GROUND_OBJECTS.has(k) && !hasObjBox(k) && !isCellKind(k));
  assert.deepEqual(miss, [], `без коллизии по основанию и без правила cell: ${miss.join(", ")}`);
});
await test("прямоугольник не шире следа и не ниже клетки", () => {
  for (const k of KINDS) {
    const m = emptyMap(), fp = OBJECT_FOOTPRINT[k]!, o = put(m, k, 10, 20), b = objBox(o)!;
    assert.ok(b[0] >= 10 * TILE && b[1] <= (10 + fp.w) * TILE, `${k}: по x ${b[0]}..${b[1]} вне следа`);
    assert.ok(b[2] >= (21 - fp.h) * TILE && b[3] <= 21 * TILE, `${k}: по y ${b[2]}..${b[3]} вне следа`);
    assert.ok(b[1] - b[0] >= 2 && b[3] - b[2] >= 2, `${k}: пустой прямоугольник`);
  }
});

section("подход вплотную с 8 сторон (зазор 0–2 px), внутрь нельзя");
for (const k of KINDS) {
  await test(k, () => {
    const m = emptyMap(), o = put(m, k, 10, 20), b = objBox(o)!;
    const cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2, hw = (b[1] - b[0]) / 2, hh = (b[3] - b[2]) / 2;
    assert.ok(!walkable(m, cx, cy, R), "в середине основания стоять нельзя");
    for (const [name, sx, sy] of DIRS) {
      const x0 = cx + sx * (hw + R + 40), y0 = cy + sy * (hh + HH + 40);
      assert.ok(walkable(m, x0, y0, R), `${name}: старт непроходим`);
      // по осям — прямо к основанию (вдоль оси, чтобы мерить зазор по этой стороне); по диагонали — к середине
      const p = walkTo(m, x0, y0, sx && sy ? cx : cx + sx * 0, sx && sy ? cy : cy + sy * 0);
      const g = gap(b, p.x, p.y);
      assert.ok(g >= 0, `${name}: тело вошло в основание (зазор ${g.toFixed(2)})`);
      assert.ok(g <= 2, `${name}: не дошёл вплотную — зазор ${g.toFixed(2)} px`);
    }
  });
}

section("за верхом высокого объекта можно пройти (здания, деревья: крона и крыша закрывают героя, здание гаснет)");
for (const k of KINDS.filter((k) => TALL(k) && !(COLLISION.rules.spanY as string[]).some((p) => k.startsWith(p.replace("*", ""))))) {
  await test(k, () => {
    const m = emptyMap(), o = put(m, k, 10, 20), b = objBox(o)!, fp = OBJECT_FOOTPRINT[k]!;
    const y = b[2] - HH - 1; // ноги сразу за основанием — в пределах кадра (выше основания)
    assert.ok(y < o.y, "точка за основанием");
    const xl = 10 * TILE - R - 8, xr = (10 + fp.w) * TILE + R + 8;
    assert.ok(walkable(m, xl, y, R) && walkable(m, xr, y, R), "края прохода свободны");
    const p = walkTo(m, xl, y, xr, y, 400);
    assert.ok(Math.abs(p.x - xr) < 1 && Math.abs(p.y - y) < 1, `прошёл за объектом до x=${p.x.toFixed(1)} из ${xr}`);
    // и с севера вниз — до самого основания (герой «за» объектом по глубине)
    const q = walkTo(m, (b[0] + b[1]) / 2, (20 - fp.h) * TILE - 20, (b[0] + b[1]) / 2, o.y + 40, 400);
    assert.ok(gap(b, q.x, q.y) >= 0 && gap(b, q.x, q.y) <= 2, `с севера упёрся с зазором ${gap(b, q.x, q.y).toFixed(2)}`);
  });
}

section("шаг тика сервера (moveGated в мире с осадой и moveWithCollision): вплотную, а не за шаг до основания");
for (const k of ["barrel", "rock", "house", "v_basic_oak"]) {
  await test(k, () => {
    const m = emptyMap(), o = put(m, k, 10, 20), b = objBox(o)!, step = PLAYER_SPEED * TICK_MS / 1000 * 1.5; // с маунтом быстрее
    for (const [name, mv] of [["moveGated", (x: number, y: number, dx: number, dy: number) => moveGated(m, x, y, dx, dy, R, "sol")], ["moveWithCollision", (x: number, y: number, dx: number, dy: number) => moveWithCollision(m, x, y, dx, dy, R)]] as const) {
      for (const [side, sx, sy] of DIRS.slice(0, 4)) {
        const cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2;
        let p = { x: cx + sx * ((b[1] - b[0]) / 2 + R + 37), y: cy + sy * ((b[3] - b[2]) / 2 + HH + 37) };
        for (let i = 0; i < 30; i++) p = mv(p.x, p.y, -sx * step, -sy * step);
        const g = gap(b, p.x, p.y);
        assert.ok(g >= 0 && g <= 2, `${name}, ${side}: зазор ${g.toFixed(2)} (шаг ${step} px)`);
      }
    }
  });
}

section("углы между двумя объектами: не застревает");
const PAIRS: [string, [number, number], string, [number, number]][] = [
  ["barrel", [10, 20], "barrel", [11, 20]],
  ["barrel", [10, 20], "crate", [11, 19]],
  ["rock", [10, 20], "v_basic_pine", [11, 19]],
  ["house", [8, 20], "barrel", [12, 20]],
  ["house", [8, 20], "crate", [12, 21]],
  ["big_rock", [10, 20], "rock", [10, 19]],
  ["pal_h", [10, 20], "pal_v", [11, 19]],
  ["stall", [10, 20], "well", [12, 20]],
];
for (const [a, pa, b2, pb] of PAIRS) {
  await test(`${a} + ${b2}`, () => {
    const m = emptyMap();
    const A = objBox(put(m, a, pa[0], pa[1]))!, B = objBox(put(m, b2, pb[0], pb[1]))!;
    // точка между объектами (середина отрезка между ближайшими сторонами) и подход к ней с 8 сторон
    const mx = (Math.max(A[0], B[0]) + Math.min(A[1], B[1])) / 2, my = (Math.max(A[2], B[2]) + Math.min(A[3], B[3])) / 2;
    for (const [name, sx, sy] of DIRS) {
      const x0 = mx + sx * 90, y0 = my + sy * 70;
      if (!walkable(m, x0, y0, R)) continue;
      const p = walkTo(m, x0, y0, mx, my);
      assert.ok(gap(A, p.x, p.y) >= 0 && gap(B, p.x, p.y) >= 0, `${name}: вошёл в объект`);
      const back = walkTo(m, p.x, p.y, x0, y0, 300);
      assert.ok(Math.hypot(back.x - x0, back.y - y0) < 1, `${name}: застрял в (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), назад дошёл до (${back.x.toFixed(1)}, ${back.y.toFixed(1)})`);
    }
  });
}

section("сплошные ряды (частокол, ограды, уступы): между звеньями не пройти");
await test("горизонтальный ряд pal_h и вертикальный pal_v с угловым столбом", () => {
  const m = emptyMap();
  for (let x = 6; x <= 12; x++) put(m, "pal_h_sol", x, 20);
  put(m, "pal_corner_sol", 13, 20);
  for (let y = 14; y <= 19; y++) put(m, "pal_v_sol", 13, y);
  // снаружи (юг) внутрь (север) поперёк ряда и с востока на запад поперёк столбца
  for (let x = 6 * TILE + 4; x < 13 * TILE; x += 3) assert.ok(!segmentWalkable(m, x, 21 * TILE + 12, x, 19 * TILE, R), `поперёк pal_h в x=${x}`);
  for (let y = 14 * TILE + 4; y < 21 * TILE; y += 3) assert.ok(!segmentWalkable(m, 15 * TILE, y, 12 * TILE, y, R), `поперёк pal_v в y=${y}`);
});
for (const k of ["ledge_grass", "v_basic_fence_row", "v_graveyard_fence_long", "v_basic_palisade_5"]) {
  await test(`ряд ${k}`, () => {
    const m = emptyMap(), fw = OBJECT_FOOTPRINT[k]!.w;
    for (let i = 0; i < 3; i++) put(m, k, 4 + i * fw, 20);
    for (let x = 4 * TILE + 4; x < (4 + 3 * fw) * TILE - 4; x += 3) assert.ok(!segmentWalkable(m, x, 21 * TILE + 12, x, 18 * TILE, R), `поперёк в x=${x}`);
  });
}

section("поиск пути обходит объект");
for (const k of ["barrel", "rock", "house", "tavern", "v_basic_oak", "stall", "tent", "pal_v"]) {
  await test(k, () => {
    const m = emptyMap(), o = put(m, k, 10, 20), b = objBox(o)!;
    const cx = (b[0] + b[1]) / 2;
    const sx = cx, sy = b[3] + 60, tx = cx, ty = b[2] - 90;
    const path = findPath(m, sx, sy, tx, ty, R);
    assert.ok(path && path.length, "путь найден");
    let px = sx, py = sy;
    for (const p of path!) { assert.ok(segmentWalkable(m, px, py, p.x, p.y, R), `отрезок (${px},${py})→(${p.x},${p.y}) задевает объект`); px = p.x; py = p.y; }
    assert.ok(Math.hypot(px - tx, py - ty) < 1, `дошёл до цели (${px}, ${py})`);
  });
}

done();
