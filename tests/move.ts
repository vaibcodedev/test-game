/** Движение по клику (moveTo): герой останавливается в точке клика и стоит; новый клик сразу меняет цель. */
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, walkable } from "../shared/map";
import { segmentWalkable } from "../shared/path";
import { World } from "../server/src/game/World";
import { Player, newSave } from "../server/src/game/Player";
import { WorldState } from "../server/src/rooms/schema";
import { Anim } from "../shared/protocol";
import { assert, check, passedCount } from "./harness";

const MAP = generateMap(MAP_SEED);
const R = 14;
const ok = (x: number, y: number) => walkable(MAP, x, y, R);

/** Точка a и b: обе проходимы, прямой путь закрыт, расстояние 120–400 px. */
function blockedPair(): { a: { x: number; y: number }; b: { x: number; y: number } } | null {
  for (let ty = 40; ty < MAP.h - 40; ty += 3) for (let tx = 40; tx < MAP.w - 40; tx += 3) {
    const a = { x: tx * TILE + 16, y: ty * TILE + 16 };
    if (!ok(a.x, a.y)) continue;
    for (const [dx, dy] of [[6, 0], [0, 6], [8, 3], [-7, 5], [10, -4]]) {
      const b = { x: a.x + dx * TILE, y: a.y + dy * TILE };
      if (ok(b.x, b.y) && !segmentWalkable(MAP, a.x, a.y, b.x, b.y, R)) return { a, b };
    }
  }
  return null;
}
function openSpot(): { x: number; y: number } | null {
  for (let ty = 40; ty < MAP.h - 40; ty += 2) for (let tx = 40; tx < MAP.w - 40; tx += 2) {
    const x = tx * TILE + 16, y = ty * TILE + 16;
    if (ok(x, y) && ok(x + 300, y) && segmentWalkable(MAP, x, y, x + 300, y, R) && ok(x + 120, y + 30) && segmentWalkable(MAP, x, y, x + 120, y + 30, R)) return { x, y };
  }
  return null;
}

function setup(at: { x: number; y: number }) {
  const w = new World(new WorldState(), () => {});
  for (const m of [...w.mobs.values()]) w.removeMob(m);
  const p = new Player("mv", "Ходок", newSave("warrior", at), () => {});
  w.addPlayer(p);
  p.unit.x = at.x; p.unit.y = at.y;
  return { w, p };
}
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) w.update(50); };
const click = (p: Player, x: number, y: number) => { p.moveTo = { x, y }; p.targetId = null; };

/** Идём до остановки, затем проверяем, что стоим на месте и анимация Idle. */
function settle(w: World, p: Player, x: number, y: number, tol: number, what: string) {
  run(w, 200);
  const d = Math.hypot(p.unit.x - x, p.unit.y - y);
  assert(d <= tol, `${what}: остановился в ${d.toFixed(1)} px от точки клика`);
  const sx = p.unit.x, sy = p.unit.y;
  run(w, 20);
  assert(p.unit.x === sx && p.unit.y === sy, `${what}: побежал дальше`);
  assert(p.unit.anim === Anim.Idle && !p.moveTo, `${what}: анимация бега не остановилась (anim ${p.unit.anim}, moveTo ${JSON.stringify(p.moveTo)}, pos ${p.unit.x},${p.unit.y})`);
}

(async () => {
  await check("клик в открытом поле: стоп в точке клика", () => {
    const s = openSpot()!;
    const { w, p } = setup(s);
    click(p, s.x + 300, s.y);
    settle(w, p, s.x + 300, s.y, 4, "поле");
    click(p, s.x + 120, s.y + 30);
    settle(w, p, s.x + 120, s.y + 30, 4, "обратный клик");
  });

  await check("клик за препятствием (путь) и новый клик ближе 40 px сразу меняет цель", () => {
    const pr = blockedPair();
    assert(!!pr, "нет пары точек для теста");
    const { a, b } = pr!;
    const { w, p } = setup(a);
    click(p, b.x, b.y);
    settle(w, p, b.x, b.y, 6, "за препятствием");
    // второй сценарий: цель сменилась на близкую (до 40 px) во время пути
    const q = setup(a);
    click(q.p, b.x, b.y);
    run(q.w, 6);
    for (const [dx, dy] of [[24, 0], [-24, 0], [0, 24], [0, -24], [20, 20], [-20, -20]]) {
      const c = { x: b.x + dx, y: b.y + dy };
      if (!ok(c.x, c.y)) continue;
      click(q.p, c.x, c.y);
      settle(q.w, q.p, c.x, c.y, 6, "смена цели");
      return;
    }
  });

  await check("клик в стену: остановка у ближайшей точки и покой", () => {
    const pr = blockedPair()!;
    const { w, p } = setup(pr.a);
    // центр блокирующей клетки между a и b
    let wall: { x: number; y: number } | null = null;
    for (let i = 1; i < 40 && !wall; i++) {
      const x = pr.a.x + ((pr.b.x - pr.a.x) * i) / 40, y = pr.a.y + ((pr.b.y - pr.a.y) * i) / 40;
      if (!ok(x, y)) wall = { x, y };
    }
    click(p, wall!.x, wall!.y);
    run(w, 200);
    const sx = p.unit.x, sy = p.unit.y;
    run(w, 20);
    assert(p.unit.x === sx && p.unit.y === sy && p.unit.anim === Anim.Idle, "у стены герой не стоит");
  });

  console.log(`\nДвижение по клику: проверок пройдено ${passedCount()}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
