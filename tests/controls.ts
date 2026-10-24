/** Цель ≠ атака (задача 115, шаг 2): TEST_PORT=2661 npx tsx tests/controls.ts */
import { assert, Bot, check, passedCount, sleep, startServer, stopServer } from "./harness";
import { generateMap } from "../shared/map";
import { homeCity } from "../shared/cities";
import { MAP_SEED } from "../shared/constants";
import { bodyDist, pickOrder, type PickCtx, type PickKind, type PickSource } from "../client/src/game/castResolve";

const MAP = generateMap(MAP_SEED);
// слизень — у столицы героя (воин — Сольгард, Аурелион): ближайший к Эмберхоллу теперь у вражеской столицы, где героя бьёт стража (задача 132)
const home = homeCity("solgard").spawn;
const spawns = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y));
/** Точка появления слизня, которого нашёл setup(): позиции проверок считаются от неё (убитый слизень возрождается не сразу, живой — на соседней точке). */
let cur: { x: number; y: number } = spawns[0];

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
      // слизней на карте немного и они далеко друг от друга (задача 132): обходим точки, пока не найдётся живой
      let s: { id: string; x: number; y: number } | null = null;
      for (const sp of spawns) {
        a.send("dbg", { op: "tp", x: sp.x + 30, y: sp.y });
        await sleep(500);
        if ((s = slimeNear(a))) break;
      }
      assert(s, "слизень не найден");
      cur = s;
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
      a.send("moveTo", { x: cur.x + 330, y: cur.y + 160 });
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
      a.send("moveTo", { x: cur.x + 330, y: cur.y + 160 });
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
      a.send("dbg", { op: "tp", x: cur.x + 400, y: cur.y });
      await sleep(300);
      a.send("skill", { id: "taunt", x: cur.x, y: cur.y, target: id, q: 0, ap: false });
      await a.until(() => la.toast.some((t) => t.code === "range"), 2000, "code range");
      assert(/Слишком далеко: ещё \d+ кл\./.test(la.toast.find((t) => t.code === "range")!.text), "текст дальности: " + la.toast.map((t) => t.text));
      a.send("skill", { id: "quake", x: 0, y: 0, q: 0 });
      await a.until(() => la.toast.some((t) => t.code === "learn"), 2000, "code learn");
    });

    await check("каст вне дальности подводит героя и кастует (подход)", async () => {
      const id = await setup();
      // слизень помнит угрозу прошлых проверок и сам бежит к герою (тогда подходить не нужно): уводим героя за поводок — моб возвращается домой и забывает угрозу
      a.send("dbg", { op: "tp", x: cur.x + 900, y: cur.y });
      await a.until(() => { const m = mob(a, id); return !!m && Math.hypot(m.x - cur.x, m.y - cur.y) < 70 && m.anim !== 1; }, 6000, "слизень вернулся домой");
      await sleep(400);
      a.send("dbg", { op: "tp", x: cur.x + 420, y: cur.y });
      await sleep(300);
      const n0 = countCd(la, "taunt"), d0 = dist(a, id);
      a.send("skill", { id: "taunt", x: cur.x, y: cur.y, target: id, q: 400, ap: true });
      await a.until(() => la.queue.some((m) => m.pend), 1000, "подход начат");
      await a.until(() => countCd(la, "taunt") > n0, 4500, "каст после подхода");
      assert(dist(a, id) < d0 - 60, "герой не подошёл");
      assert(dist(a, id) <= 260 + 40, "каст вне дальности: " + dist(a, id));
    });

    await check("WASD отменяет подход", async () => {
      await sleep(8500);
      const id = await setup();
      a.send("dbg", { op: "tp", x: cur.x + 420, y: cur.y });
      await sleep(300);
      const n0 = countCd(la, "taunt");
      la.queue.length = 0;
      a.send("skill", { id: "taunt", x: cur.x, y: cur.y, target: id, q: 400, ap: true });
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
    // своя столица, не Эмберхолл: там атакующие умения запрещены (решение 11 задачи 132)
    m.send("dbg", { op: "tp", x: home.x, y: home.y });
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

    // ---------- задача 134, шаг 1: допуск, магнит и порядок выбора мышью — от живых координат моба с сервера ----------
    // В конце файла: слизень после прежних проверок гонится за героем-богом, и лишняя проверка перед шагом 7 сдвигала бы их по времени (подход считает дальность от точки появления)
    await check("выбор мышью: допуск 12 px, магнит ЛКМ 40 px, порядок (мешок под мобом, NPC рядом, союзник на мобе); ЛКМ только выбирает", async () => {
      const id = await setup();
      const ally = await Bot.join("Союзник3", "secret", "mage");
      try {
        // союзник стоит у героя, вдали от слизня: иначе слизень уйдёт за ним, а следующим проверкам нужен на месте
        ally.send("dbg", { op: "god" });
        ally.send("dbg", { op: "tp", x: a.me().x + 40, y: a.me().y });
        await sleep(300);
        const m = mob(a, id);
        const mx: number = m.x, my: number = m.y, cy = my - 12; // снимок живого моба; центр тела — на 12 px выше ног
        // клик: масштаб CSS 2 (допуск 6 и магнит 20 px мира), «Экшен», мир; юниты — снимок (враг — живой моб, союзник — в геометрии на 60 px правее него, id настоящий)
        type U = { id: string; x: number; y: number; foe: boolean; mine?: boolean };
        const foe: U = { id, x: mx, y: my, foe: true }, tank: U = { id: ally.id, x: mx + 60, y: my, foe: false };
        const click = (units: U[], items: { kind: "bag" | "npc"; x: number; y: number; r: number }[], wx: number, wy: number, o: Partial<PickCtx> = {}): [PickKind, string | null] => {
          // mine — мой герой: он берётся без допуска (own), остальные — с допуском
          const nearest = (list: U[], reach: number, own = reach) => { let b: string | null = null, bd = Infinity; for (const u of list) { const d = bodyDist(u.x, u.y, false, false, wx, wy, u.mine ? own : reach); if (d < bd) { bd = d; b = u.id; } } return b; };
          const src: PickSource = {
            foe: (r) => nearest(units.filter((u) => u.foe), r),
            townFoe: () => null,
            item: (out) => { const it = items.find((i) => Math.hypot(i.x - wx, i.y - wy) < i.r); if (!it) return false; out.kind = it.kind; return true; },
            menu: (r) => nearest(units.filter((u) => !u.foe && !u.mine), r),
            friend: (r, own) => nearest(units.filter((u) => !u.foe), r, own),
          };
          const res = pickOrder({ aim: false, right: false, action: true, world: true, css: 2, bigTargets: false, ...o }, src, { kind: "ground", id: null, ref: null });
          return [res.kind, res.id];
        };
        const is = (r: [PickKind, string | null], kind: PickKind, rid: string | null, what: string) => assert(r[0] === kind && r[1] === rid, `${what}: ${r[0]} ${r[1]}`);
        // допуск: клик в 19 px от центра тела (зона 14 + допуск 6) — враг; ЛКМ только выбирает — герой стоит, моб цел
        const p0 = { x: a.me().x, y: a.me().y }, hp0 = m.hp;
        let r = click([foe], [], mx + 19, cy);
        is(r, "foe", id, "ЛКМ в допуске");
        is(click([foe], [], mx + 21, cy, { right: true }), "ground", null, "ПКМ вне допуска: магнита нет");
        a.send("target", { id: r[1] });
        await a.until(() => a.me().target === id, 1500, "ЛКМ выбрал моба");
        await sleep(500);
        assert(Math.hypot(a.me().x - p0.x, a.me().y - p0.y) < 5, "ЛКМ повёл героя");
        assert(mob(a, id).hp >= hp0, "ЛКМ атаковал");
        // магнит: в 30 px — только ЛКМ «Экшена»; ПКМ и «Классика» — земля; дальше 34 px — земля у всех
        a.send("target", { id: null });
        await a.until(() => a.me().target !== id, 1500, "цель снята");
        is(click([foe], [], mx + 30, cy, { right: true }), "ground", null, "ПКМ в 30 px");
        is(click([foe], [], mx + 30, cy, { action: false }), "ground", null, "«Классика» в 30 px");
        is(click([foe], [], mx + 35, cy), "ground", null, "ЛКМ дальше магнита");
        r = click([foe], [], mx + 30, cy);
        is(r, "magnet", id, "ЛКМ «Экшена» в 30 px");
        a.send("target", { id: r[1] });
        await a.until(() => a.me().target === id, 1500, "магнит выбрал моба");
        // порядок: мешок под мобом и NPC рядом с врагом, союзник на мобе
        is(click([foe], [{ kind: "bag", x: mx, y: my - 10, r: 16 }], mx, cy, { right: true }), "foe", id, "мешок под мобом");
        is(click([foe], [{ kind: "npc", x: mx + 25, y: cy, r: 18 }], mx + 25, cy, { right: true }), "npc", null, "NPC рядом с врагом");
        is(click([foe, { ...tank, x: mx }], [], mx, cy, { right: true }), "foe", id, "союзник на мобе: враг важнее меню");
        is(click([foe, tank], [], tank.x, cy, { right: true }), "menu", ally.id, "ПКМ по союзнику: меню обмена");
        r = click([foe, tank], [], tank.x, cy);
        is(r, "friend", ally.id, "ЛКМ по союзнику: выбор");
        a.send("target", { id: r[1] });
        await a.until(() => a.me().target === ally.id, 1500, "ЛКМ выбрал союзника");
        // свой герой — только по телу (камера держит его в центре экрана): клик в 17 px от центра тела (тело 14, допуск 6) — шаг, а не выбор себя
        const hero = a.me(), self: U = { id: a.id, x: hero.x, y: hero.y, foe: false, mine: true };
        is(click([self], [], hero.x + 17, hero.y - 12, { right: true }), "ground", null, "ПКМ в 17 px от героя: шаг");
        is(click([self], [], hero.x + 10, hero.y - 12, { right: true }), "friend", a.id, "ПКМ по телу героя: выбор себя");
      } finally {
        await ally.leave();
      }
    });
  } finally {
    await stopServer();
  }
  console.log(`controls: ${passedCount()} проверок пройдено`);
}
main().catch((e) => { console.error(e); process.exit(1); });
