/**
 * Коллизия объектов по основанию на настоящей карте мира (shared/map.ts objBoxHit, data/collision.json):
 * сервер и клиент считают проходимость одной функцией по одной карте; у каждого вида в мире основание непроходимо, а вплотную к нему
 * с юга встать можно; клетки CELL_OBJ закрыты для старого поиска пути только там, где стоит объект.
 * Запуск: npx tsx tests/unit/collision-world.ts
 */
import fs from "node:fs";
import { assert, done, section, test } from "./lib";
import { CELL_BLOCK, CELL_OBJ, generateMap, moveWithCollision, objBox, walkable } from "../../shared/map";
import { findPath, segmentWalkable } from "../../shared/path";
import { MAP_SEED, PLAYER_RADIUS, TILE } from "../../shared/constants";
import COLLISION from "../../data/collision.json";

const R = PLAYER_RADIUS, HH = R * 0.5;
const A = generateMap(MAP_SEED), B = generateMap(MAP_SEED);

section("сервер и клиент — одна проходимость");
await test("сервер (World.ts) и клиент (GameScene.ts) двигают героя одной moveWithCollision из shared/map с PLAYER_RADIUS", () => {
  const srv = fs.readFileSync("server/src/game/World.ts", "utf8"), cli = fs.readFileSync("client/src/game/GameScene.ts", "utf8");
  for (const [n, s] of [["World.ts", srv], ["GameScene.ts", cli]] as const) {
    assert.match(s, /import \{[^}]*\bmoveWithCollision\b[^}]*\} from "\.\.\/\.\.\/\.\.\/shared\/map"/, `${n}: moveWithCollision не из shared/map`);
    assert.match(s, /generateMap\(/, `${n}: карта не из generateMap`);
  }
  assert.match(cli, /moveWithCollision\(this\.map, this\.pos\.x, this\.pos\.y, [^)]*PLAYER_RADIUS\)/, "клиент: предсказание не с PLAYER_RADIUS");
});
await test("две сборки карты (сервер и клиент строят её сами) дают одинаковые клетки, объекты и проходимость", () => {
  assert.equal(A.objects.length, B.objects.length);
  assert.ok(A.cell.every((c, i) => c === B.cell[i]), "клетки различаются");
  let n = 0;
  for (let i = 0; i < A.objects.length; i += 7) {
    const o = A.objects[i], b = objBox(o);
    if (!b) continue;
    for (const [dx, dy] of [[0, 0], [-R - 1, 0], [R + 1, 0], [0, -HH - 1], [0, HH + 1], [-12, -20], [12, 6]]) {
      const x: number = (dx < 0 ? b[0] : dx > 0 ? b[1] : (b[0] + b[1]) / 2) + dx, y: number = (dy < 0 ? b[2] : dy > 0 ? b[3] : (b[2] + b[3]) / 2) + dy;
      assert.equal(walkable(A, x, y, R), walkable(B, x, y, R), `${o.kind} (${x}, ${y})`);
      n++;
    }
  }
  assert.ok(n > 1000, `проверено точек: ${n}`);
});

section("каждый вид в мире: основание непроходимо, вплотную встать можно");
const byKind = new Map<string, typeof A.objects>();
for (const o of A.objects) if (objBox(o)) (byKind.get(o.kind) ?? byKind.set(o.kind, []).get(o.kind)!).push(o);
await test(`виды в мире (${byKind.size})`, () => {
  const bad: string[] = [], touch: Record<string, number> = {};
  for (const [kind, list] of byKind) {
    let ok = 0, tried = 0;
    for (const o of list.slice(0, 40)) {
      const b = objBox(o)!, cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2;
      const c = A.cell[Math.floor((b[3] - 0.5) / TILE) * A.w + Math.floor(cx / TILE)];
      if ((c & (CELL_BLOCK | CELL_OBJ)) !== (CELL_BLOCK | CELL_OBJ)) continue; // клетка занята и чем-то ещё (стена, другой вид) — вся клетка непроходима
      tried++;
      if (walkable(A, cx, cy, R)) { bad.push(`${kind} @${o.x},${o.y}: в основании можно стоять`); continue; }
      // с юга: вплотную к основанию (зазор 1 px), если там не стоит ничего другого
      const y = b[3] + HH + 1;
      if (!walkable(A, cx, y + 40, R)) continue;
      let p = { x: cx, y: y + 40 };
      for (let k = 0; k < 20; k++) p = moveWithCollision(A, p.x, p.y, 0, -3, R); // шагами по 3 px, как за кадр клиента
      const g = (p.y - HH) - b[3];
      // зазор больше — между ними стоит другой объект (бочки парами, ряд ящиков): тогда не считаем
      if (g < 0) bad.push(`${kind} @${o.x},${o.y}: вошёл в основание (${g.toFixed(1)})`); else if (g <= 2) ok++;
    }
    touch[kind] = ok;
    const vRun = (COLLISION.rules.spanY as string[]).some((q) => kind.startsWith(q.replace("*", ""))); // звенья вертикального ряда: с юга — следующее звено
    if (tried && !ok && list.length > 3 && !vRun) bad.push(`${kind}: ни одного подхода вплотную с юга из ${tried}`);
  }
  assert.deepEqual(bad.slice(0, 20), [], `${bad.length} нарушений`);
});

section("поиск пути в мире: обход домов и деревьев, за дом можно попасть");
await test("путь от фасада дома до точки за домом проходим по прямым отрезкам", () => {
  const houses = A.objects.filter((o) => /^(sol_house|umb_house|house)$/.test(o.kind)).slice(0, 8);
  assert.ok(houses.length, "дома в мире есть");
  let found = 0;
  for (const o of houses) {
    const b = objBox(o)!;
    const cx = (b[0] + b[1]) / 2, sy = b[3] + 30, ty = b[2] - HH - 2;
    if (!walkable(A, cx, sy, R) || !walkable(A, cx, ty, R)) continue;
    const path = findPath(A, cx, sy, cx, ty, R);
    if (!path) continue;
    let px = cx, py = sy;
    for (const p of path) { assert.ok(segmentWalkable(A, px, py, p.x, p.y, R), `${o.kind} @${o.x},${o.y}: отрезок задевает`); px = p.x; py = p.y; }
    if (Math.hypot(px - cx, py - ty) < 1) found++;
  }
  assert.ok(found >= 1, `за дом дошли: ${found}`);
});

done();
