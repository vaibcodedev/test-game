/** Цель ≠ атака (задача 115, шаг 2): TEST_PORT=2661 npx tsx tests/controls.ts */
import { assert, Bot, check, passedCount, sleep, startServer, stopServer } from "./harness";
import { generateMap } from "../shared/map";
import { MAP_SEED } from "../shared/constants";

const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const spawns = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y));

/** Живой слизень у ближайшей точки появления, на которой он есть. */
function slimeNear(b: Bot): { id: string; x: number; y: number } | null {
  for (const s of spawns) {
    let id: string | null = null, bd = 150;
    b.room.state.mobs.forEach((m: any, k: string) => { const d = Math.hypot(m.x - s.x, m.y - s.y); if (m.anim !== 4 && m.sprite === "slime" && d < bd) { bd = d; id = k; } });
    if (id) return { id, x: s.x, y: s.y };
  }
  return null;
}
const mob = (b: Bot, id: string) => b.room.state.mobs.get(id);
const dist = (b: Bot, id: string) => { const m = mob(b, id), me = b.me(); return m ? Math.hypot(m.x - me.x, m.y - me.y) : Infinity; };

async function main() {
  await startServer();
  try {
    const a = await Bot.join("Управленец", "secret");
    a.send("dbg", { op: "level", v: 10 });
    a.send("dbg", { op: "god" });
    await sleep(400);
    /** Встать в 160 px от слизня и вернуть его id. */
    async function setup(): Promise<string> {
      a.send("dbg", { op: "tp", x: spawns[0].x + 30, y: spawns[0].y });
      await sleep(500);
      const s = slimeNear(a);
      assert(s, "слизень не найден");
      a.send("target", { id: null });
      a.send("attack", { id: null });
      a.send("chase", { on: false });
      a.send("dbg", { op: "tp", x: s.x + 160, y: s.y });
      await sleep(300);
      return s.id;
    }

    await check("target только выбирает: герой стоит, моб цел", async () => {
      const id = await setup();
      const p0 = { x: a.me().x, y: a.me().y }, hp0 = mob(a, id).hp;
      a.send("target", { id });
      await sleep(1800);
      assert(a.me().target === id, "цель не выбрана: " + a.me().target);
      assert(Math.hypot(a.me().x - p0.x, a.me().y - p0.y) < 5, "герой пошёл к цели");
      assert(mob(a, id).hp >= hp0, "выбор атаковал");
    });

    await check("attack: герой подходит и бьёт", async () => {
      const id = await setup();
      const d0 = dist(a, id);
      a.send("attack", { id });
      await a.until(() => mob(a, id).anim === 4 || mob(a, id).hp < mob(a, id).maxHp, 8000, "урон по цели");
      assert(a.me().target === id, "цель потеряна");
      assert(dist(a, id) < d0 || mob(a, id).anim === 4, "герой не подошёл");
    });

    await check("moveTo сохраняет цель и гасит подход и автоатаку", async () => {
      const id = await setup();
      a.send("attack", { id });
      await sleep(300);
      a.send("moveTo", { x: spawns[0].x + 330, y: spawns[0].y + 160 });
      await sleep(2500);
      assert(a.me().target === id, "moveTo снял цель");
      const p1 = { x: a.me().x, y: a.me().y };
      await sleep(1200);
      assert(Math.hypot(a.me().x - p1.x, a.me().y - p1.y) < 5, "герой сам пошёл к цели без chase");
    });

    await check("WASD-ввод цель не снимает", async () => {
      const id = await setup();
      a.send("attack", { id });
      await sleep(300);
      a.send("input", { mx: 1, my: 0 });
      await sleep(400);
      a.send("input", { mx: 0, my: 0 });
      assert(a.me().target === id, "ввод снял цель");
    });

    await check("chase: после шага в сторону герой возвращается к цели", async () => {
      const id = await setup();
      a.send("chase", { on: true });
      a.send("attack", { id });
      await sleep(200);
      a.send("moveTo", { x: spawns[0].x + 330, y: spawns[0].y + 160 });
      await sleep(600);
      await a.until(() => mob(a, id).anim === 4 || dist(a, id) < 60, 8000, "возврат к цели");
      assert(a.me().target === id, "цель потеряна");
      a.send("chase", { on: false });
    });

    await check("союзник выбирается, но не атакуется", async () => {
      const ally = await Bot.join("Союзник2", "secret", "mage");
      ally.send("dbg", { op: "tp", x: a.me().x + 40, y: a.me().y });
      await sleep(300);
      a.send("target", { id: ally.id });
      await sleep(300);
      assert(a.me().target === ally.id, "союзник не выбран");
      a.send("attack", { id: ally.id });
      await sleep(400);
      assert(ally.me().hp === ally.me().maxHp, "союзник ранен");
      await ally.leave();
    });
  } finally {
    await stopServer();
  }
  console.log(`controls: ${passedCount()} проверок пройдено`);
}
main().catch((e) => { console.error(e); process.exit(1); });
