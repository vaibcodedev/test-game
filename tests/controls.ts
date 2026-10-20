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

    // ---------- шаг 7: GCD, очередь, подход, отмена; шаг 8: коды отказов ----------
    const watch = (b: Bot) => {
      const log = { cd: [] as { id: string; ms: number; at: number }[], toast: [] as { text: string; code?: string; at: number }[], queue: [] as { id: string | null; pend: boolean }[] };
      b.room.onMessage("cd", (c: any) => log.cd.push({ id: c.id, ms: c.ms, at: Date.now() }));
      b.room.onMessage("toast", (t: any) => log.toast.push({ text: t.text, code: t.code, at: Date.now() }));
      b.room.onMessage("queue", (m: any) => log.queue.push(m));
      return log;
    };
    const la = watch(a);
    const countCd = (log: ReturnType<typeof watch>, id: string) => log.cd.filter((c) => c.id === id).length;

    await check("отказы несут code: цель, дальность, перезарядка, не изучено", async () => {
      const id = await setup();
      la.toast.length = 0;
      a.send("skill", { id: "taunt", x: 0, y: 0, target: null, q: 0 });
      await a.until(() => la.toast.some((t) => t.code === "target"), 2000, "code target");
      assert(la.toast.find((t) => t.code === "target")!.text.includes("Tab"), "текст «Нет цели» без подсказки");
      a.send("dbg", { op: "tp", x: spawns[0].x + 400, y: spawns[0].y });
      await sleep(300);
      a.send("skill", { id: "taunt", x: spawns[0].x, y: spawns[0].y, target: id, q: 0, ap: false });
      await a.until(() => la.toast.some((t) => t.code === "range"), 2000, "code range");
      assert(/Слишком далеко: ещё \d+ кл\./.test(la.toast.find((t) => t.code === "range")!.text), "текст дальности: " + la.toast.map((t) => t.text));
      a.send("skill", { id: "quake", x: 0, y: 0, q: 0 });
      await a.until(() => la.toast.some((t) => t.code === "learn"), 2000, "code learn");
    });

    await check("каст вне дальности подводит героя и кастует (подход)", async () => {
      const id = await setup();
      a.send("dbg", { op: "tp", x: spawns[0].x + 420, y: spawns[0].y });
      await sleep(300);
      const n0 = countCd(la, "taunt"), d0 = dist(a, id);
      a.send("skill", { id: "taunt", x: spawns[0].x, y: spawns[0].y, target: id, q: 400, ap: true });
      await a.until(() => la.queue.some((m) => m.pend), 1000, "подход начат");
      await a.until(() => countCd(la, "taunt") > n0, 4500, "каст после подхода");
      assert(dist(a, id) < d0 - 60, "герой не подошёл");
      assert(dist(a, id) <= 260 + 40, "каст вне дальности: " + dist(a, id));
    });

    await check("WASD отменяет подход", async () => {
      await sleep(8500);
      const id = await setup();
      a.send("dbg", { op: "tp", x: spawns[0].x + 420, y: spawns[0].y });
      await sleep(300);
      const n0 = countCd(la, "taunt");
      la.queue.length = 0;
      a.send("skill", { id: "taunt", x: spawns[0].x, y: spawns[0].y, target: id, q: 400, ap: true });
      await sleep(200);
      a.send("input", { mx: 1, my: 0 });
      await sleep(100);
      a.send("input", { mx: 0, my: 0 });
      await sleep(2500);
      assert(countCd(la, "taunt") === n0, "подход не отменился");
      assert(la.queue.some((m) => !m.pend) , "сервер не сообщил об отмене подхода");
    });

    const m = await Bot.join("МагУправ", "secret", "mage");
    m.send("dbg", { op: "level", v: 20 });
    m.send("dbg", { op: "god" });
    await sleep(300);
    m.send("dbg", { op: "tp", x: town.x, y: town.y });
    m.send("learn", { id: "frostnova" });
    await sleep(200);
    m.send("learn", { id: "blink" });
    await sleep(300);
    const lm = watch(m);
    const fb = (q = 0) => m.send("skill", { id: "fireball", x: m.me().x + 120, y: m.me().y, q });
    const lastCd = (id: string) => lm.cd.filter((c) => c.id === id).slice(-1)[0];

    await check("GCD держит второе умение, offGcd — нет", async () => {
      assert(m.self!.skills.frostnova && m.self!.skills.blink, "умения не изучены " + JSON.stringify(m.self!.skills) + m.toasts.join("|"));
      await sleep(2600);
      lm.cd.length = 0;
      fb();
      await a.until(() => countCd(lm, "fireball") > 0, 1500, "огненный шар");
      assert(countCd(lm, "gcd") > 0, "нет cd gcd");
      m.send("skill", { id: "frostnova", x: m.me().x, y: m.me().y, q: 0 });
      await sleep(300);
      assert(countCd(lm, "frostnova") === 0, "GCD не удержал умение");
      m.send("skill", { id: "blink", x: m.me().x + 40, y: m.me().y, q: 0 });
      await a.until(() => countCd(lm, "blink") > 0, 1500, "offGcd-умение прошло");
    });

    await check("очередь: за 300 мс до готовности исполняется, за 600 мс — нет", async () => {
      await sleep(2600);
      lm.cd.length = 0; lm.queue.length = 0;
      fb();
      await a.until(() => countCd(lm, "fireball") === 1, 1500, "первый шар");
      const c0 = lastCd("fireball"), t0 = c0.at;
      await sleep(Math.max(0, c0.ms - 300 - (Date.now() - t0)));
      fb(400);
      await a.until(() => lm.queue.some((q) => q.id === "fireball"), 1000, "умение в очереди");
      await a.until(() => countCd(lm, "fireball") === 2, 1500, "исполнено из очереди");
      assert(lastCd("fireball").at - t0 >= c0.ms - 120, "исполнено раньше готовности");
      // за 600 мс — отбрасывается
      const c1 = lastCd("fireball");
      await sleep(Math.max(0, c1.ms - 600 - (Date.now() - c1.at)));
      fb(400);
      await sleep(1400);
      assert(countCd(lm, "fireball") === 2, "нажатие за 600 мс не должно исполняться");
      // удержание: код cd отдаётся при нажатии на перезарядке вне окна очереди
    });
    await m.leave();
  } finally {
    await stopServer();
  }
  console.log(`controls: ${passedCount()} проверок пройдено`);
}
main().catch((e) => { console.error(e); process.exit(1); });
