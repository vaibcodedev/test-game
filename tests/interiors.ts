/**
 * Интерьеры зданий (задача 144): данные и клетки залов, путь внутри, и по сети — вход по двери, отказ в бою и издалека, выход на то же место,
 * сохранение героя из зала на улицу. Запуск: npx tsx tests/interiors.ts
 */
import { CITY_ENTRANCES } from "../shared/cities";
import { MAP_SEED, MAP_W, TILE } from "../shared/constants";
import { DOOR_RANGE, INTERIORS, interiorAt, playWidth } from "../shared/interiors";
import { cellAt, CELL_BLOCK, generateMap, lineClear, walkable, zoneAtPx, ZONES } from "../shared/map";
import { findPath } from "../shared/path";
import { PLAYER_RADIUS } from "../shared/constants";
import { Bot, assert, check, passedCount, sleep, startServer, stopServer } from "./harness";

const map = generateMap(MAP_SEED);
const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

async function main() {
  await check("залы: оба пилотных здания с дверью, залы за краем карты и не пересекаются", () => {
    assert(INTERIORS.length === 2, `залов ${INTERIORS.length}, ждали 2`);
    for (const r of INTERIORS) {
      assert(CITY_ENTRANCES.some((e) => e.kind === r.kind && e.city === r.city), `${r.id}: нет двери в CITY_ENTRANCES`);
      assert(r.ox >= MAP_W * TILE + 1000, `${r.id}: зал слишком близко к карте`);
      for (const o of INTERIORS) if (o !== r) assert(Math.abs(o.ox - r.ox) >= (r.w * TILE) + 1000, `${r.id} и ${o.id} рядом`);
      assert(r.ox + r.w * TILE <= playWidth(map), `${r.id}: за пределом клика`);
    }
  });
  await check("клетки: вход и выход проходимы, стены зала и пустота между залами непроходимы, зона — город", () => {
    for (const r of INTERIORS) {
      assert(walkable(map, r.entry.x, r.entry.y, PLAYER_RADIUS), `${r.id}: точка входа в стене`);
      assert(walkable(map, r.outSpot.x, r.outSpot.y, PLAYER_RADIUS), `${r.id}: точка выхода на улице в стене`);
      assert(d(r.entry, r.exitDoor) < DOOR_RANGE - 20, `${r.id}: дверь изнутри далеко от входа`);
      assert(d(r.outSpot, r.outDoor) < DOOR_RANGE - 20, `${r.id}: дверь снаружи далеко от выхода`);
      assert(cellAt(map, r.ox + 5, r.oy + 5) & CELL_BLOCK, `${r.id}: задняя стена проходима`);
      // алтарь занимает клетки до стены: ни встать на него, ни зайти за него
      const al = r.props.find((p) => p.kind.startsWith("altar"))!;
      for (let j = 0; j < al.h; j++) for (let i = 0; i < al.w; i++) assert(cellAt(map, r.ox + (al.x + i) * TILE + 16, r.oy + (al.y + j) * TILE + 16) & CELL_BLOCK, `${r.id}: клетка алтаря проходима`);
      assert(al.y === r.wall, `${r.id}: между алтарём и стеной есть проход`);
      assert(cellAt(map, r.ox - 40, r.oy + 100) & CELL_BLOCK, `${r.id}: пустота у зала проходима`);
      assert(interiorAt(r.entry.x, r.entry.y) === r && !interiorAt(r.outSpot.x, r.outSpot.y), `${r.id}: interiorAt`);
      const zi = zoneAtPx(map, r.entry.x, r.entry.y), zo = zoneAtPx(map, r.outSpot.x, r.outSpot.y);
      assert(zi === zo, `${r.id}: зона зала ${ZONES[zi]?.name} ≠ улицы ${ZONES[zo]?.name}`);
      // путь от входа к дальнему углу у задней стены обходит убранство
      const goal = { x: r.ox + 2 * TILE + 16, y: r.oy + (r.wall + 1) * TILE + 8 };
      const p = findPath(map, r.entry.x, r.entry.y, goal.x, goal.y, PLAYER_RADIUS);
      assert(p && p.length && d(p[p.length - 1], goal) < 24, `${r.id}: нет пути внутри зала`);
      assert(!lineClear(map, r.outSpot.x, r.outSpot.y, r.entry.x, r.entry.y) || d(r.outSpot, r.entry) > 30000, `${r.id}: улица видит зал`);
    }
    // карта мира не задета: клетки у края по-прежнему из сетки, за западным краем — стена
    assert(cellAt(map, -5, 100) & CELL_BLOCK, "за западным краем проходимо");
  });

  await startServer(true);
  try {
    const a = await Bot.join("Прихожанин", "secret", "warrior");
    const b = await Bot.join("Прохожий", "secret", "warrior");
    a.send("dbg", { op: "god" });
    const sol = INTERIORS.find((r) => r.city === "aurelion")!;
    const near = { x: sol.outSpot.x, y: sol.outSpot.y + 8 };
    await check("издалека дверь не открывается", async () => {
      a.send("dbg", { op: "tp", x: near.x + 400, y: near.y });
      await sleep(250);
      a.toasts.length = 0;
      a.send("door", { id: sol.id });
      await a.until(() => a.toasts.some((t) => t.includes("Подойдите к двери")), 2000, "отказ издалека");
    });
    await check("в бою войти нельзя", async () => {
      a.send("dbg", { op: "tp", x: near.x, y: near.y });
      await sleep(250);
      a.send("dbg", { op: "fight" });
      a.toasts.length = 0;
      a.send("door", { id: sol.id });
      await a.until(() => a.toasts.some((t) => t.includes("в бою")), 2000, "отказ в бою");
      await sleep(400);
      assert(!interiorAt(a.me().x, a.me().y), "вошёл в бою");
      a.send("dbg", { op: "calm" });
    });
    let msgs: { ph: string; id: string }[] = [];
    a.room.onMessage("int", (m) => msgs.push(m));
    await check("вход: затемнение, герой в зале у двери, второй игрок остаётся снаружи далеко", async () => {
      b.send("dbg", { op: "tp", x: near.x + 30, y: near.y });
      msgs = [];
      a.send("door", { id: sol.id });
      await a.until(() => !!interiorAt(a.me().x, a.me().y), 2000, "герой в зале");
      assert(msgs[0]?.ph === "fade" && msgs.some((m) => m.ph === "arrive" && m.id === sol.id), `сообщения перехода: ${JSON.stringify(msgs)}`);
      assert(d(a.me(), sol.entry) < 4, "не у входа");
      await sleep(200);
      const bu = b.me(), au = [...b.room.state.players.values()].find((u: any) => u.name === "Прихожанин") as { x: number; y: number };
      assert(!interiorAt(bu.x, bu.y), "второй тоже в зале");
      assert(d(au, bu) > 2000, "второй игрок рядом с вошедшим");
    });
    await check("внутри можно ходить (клик-шаг за край карты мира принимается)", async () => {
      const goal = { x: sol.entry.x - 64, y: sol.entry.y - 40 };
      a.send("moveTo", goal);
      await a.until(() => d(a.me(), goal) < 8, 3000, "дошёл внутри зала");
    });
    await check("сохранение из зала — на улицу перед дверью", async () => {
      // перезаход: герой выходит из игры в зале и возвращается на улицу перед дверью
      const token = a.token;
      await a.leave();
      await sleep(600);
      const a2 = await Bot.enter(token, "Прихожанин");
      assert(!interiorAt(a2.me().x, a2.me().y) && d(a2.me(), sol.outSpot) < 4, `после перезахода в (${a2.me().x}, ${a2.me().y})`);
      // снова внутрь и выход по двери изнутри — на то же место у двери
      a2.send("door", { id: sol.id });
      await a2.until(() => !!interiorAt(a2.me().x, a2.me().y), 2000, "снова в зале");
      a2.send("door", { id: sol.id });
      await a2.until(() => !interiorAt(a2.me().x, a2.me().y), 2000, "вышел");
      assert(d(a2.me(), sol.outSpot) < 4, "вышел не к двери");
      await a2.leave();
    });
    await b.leave();
  } finally {
    await stopServer();
  }
  console.log(`interiors: ${passedCount()} проверок пройдено`);
}
main().catch((e) => { console.error(e); process.exit(1); });
