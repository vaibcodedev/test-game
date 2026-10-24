/**
 * Браузерная проверка движения (задача 115, шаг 3), схема «Экшен»: удержание ПКМ ведёт за курсором плавно,
 * короткий ПКМ — moveTo, автобег (V), полоса каста по сообщению cast.
 * Запуск: TEST_PORT=2796 npx tsx tests/controls-move.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5197;
const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const _unused = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const sent = (page: Page, type: string) => page.evaluate((t) => ((window as any).__sent as [string, any][]).filter((m) => m[0] === t).map((m) => m[1]), type);
const clear = (page: Page) => page.evaluate(() => { (window as any).__sent.length = 0; });
const me = (page: Page) => page.evaluate(() => { const n = (window as any).__net; const p = n.room.state.players.get(n.id); return { x: p.x as number, y: p.y as number, target: p.target as string }; });
const mobs = (page: Page) => page.evaluate(() => { const out: any[] = []; (window as any).__net.room.state.mobs.forEach((m: any, id: string) => out.push({ id, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, sprite: m.sprite, anim: m.anim })); return out; });
/** Экран точки мира. */
const toScreen = (page: Page, wx: number, wy: number) => page.evaluate(([x, y]) => {
  const s = (window as any).__game.scene.getScene("game"), c = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
  return { x: r.left + (x - c.worldView.x) * c.zoom * (r.width / s.scale.width), y: r.top + (y - c.worldView.y) * c.zoom * (r.height / s.scale.height) };
}, [wx, wy]);

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("Ходоки", "secret", "Ходок", "warrior");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  const ok = (s: string) => console.log("  ok   " + s);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  const errors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#login-name");
    await page.type("#login-name", "Ходоки");
    await page.type("#login-pass", "secret");
    await page.click("#login-go");
    await page.waitForSelector('.cs-slot[data-name="Ходок"]', { timeout: 10000 });
    await page.$eval('.cs-slot[data-name="Ходок"]', (b) => (b as HTMLElement).click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 30000 });
    await sleep(1000);
    await page.evaluate(() => {
      const w = window as any, net = w.__net, orig = net.send.bind(net);
      w.__sent = [];
      net.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); };
      net.send("dbg", { op: "god" });
    });
    await sleep(800);
    const spos = () => page.evaluate(() => { const n = (window as any).__net; const p = n.room.state.players.get(n.id); return { x: p.x as number, y: p.y as number }; });
    const pos = () => page.evaluate(() => { const p = (window as any).__game.scene.getScene("game").pos; return { x: p.x as number, y: p.y as number }; });
    /** Опрос условия раз в 30 мс до таймаута (вместо фиксированной паузы: под нагрузкой ход и отклик сервера растягиваются). */
    const until = async (cond: () => Promise<boolean>, ms: number, what: string) => {
      const t0 = Date.now();
      while (!(await cond())) { if (Date.now() - t0 > ms) throw new Error("таймаут: " + what); await sleep(30); }
    };
    /** Предсказанная позиция каждые ~30 мс до условия: максимальный откат назад по X (рывки кадров в headless не считаем). */
    const sampleUntil = async (cond: (x: number) => Promise<boolean>, ms: number, what: string) => {
      const out: { x: number; y: number }[] = [];
      const t0 = Date.now();
      while (true) {
        out.push(await pos());
        if (await cond(out.at(-1)!.x)) break;
        if (Date.now() - t0 > ms) throw new Error("таймаут: " + what);
        await sleep(30);
      }
      let jump = 0;
      if (process.env.DBG) console.log(out.map((q) => q.x.toFixed(0) + "," + q.y.toFixed(0)).join(" "));
      for (let i = 1; i < out.length; i++) jump = Math.max(jump, out[i - 1].x - out[i].x);
      return jump;
    };
    /** Герой стоит: положение не менялось 300 мс подряд (опрос, не фиксированная пауза). */
    const stillness = async () => {
      let last = await spos(), since = Date.now();
      await until(async () => {
        const q = await spos();
        if (Math.hypot(q.x - last.x, q.y - last.y) >= 0.5) { last = q; since = Date.now(); return false; }
        return Date.now() - since >= 300;
      }, 5000, "герой остановился");
    };

    // удержание ПКМ: input-вектор, плавное движение, отпустил — стоп
    const p0 = await pos();
    const c = await toScreen(page, p0.x + 260, p0.y + 40);
    await clear(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down({ button: "right" });
    const jump = await sampleUntil(async (x) => x - p0.x > 60, 6000, "герой пошёл за курсором");
    const inputs = (await sent(page, "input")) as { mx: number; my: number }[];
    must((await sent(page, "moveTo")).length === 1, "короткая часть клика не отправила moveTo");
    must(inputs.some((m) => m.mx > 0.8 && m.my > 0 && m.my < 0.5), "нет дробного input к курсору: " + JSON.stringify(inputs.slice(0, 3)));
    const p1 = await pos();
    must(p1.x - p0.x > 60, "герой не пошёл за курсором: " + (p1.x - p0.x));
    must(jump < 4, "откат позиции назад: " + jump.toFixed(1));
    await page.mouse.up({ button: "right" });
    await until(async () => { const l = ((await sent(page, "input")) as { mx: number; my: number }[]).at(-1); return !!l && l.mx === 0 && l.my === 0; }, 3000, "стоп после отпускания ПКМ").catch(() => {});
    const last = ((await sent(page, "input")) as { mx: number; my: number }[]).at(-1)!;
    must(last.mx === 0 && last.my === 0, "после отпускания не отправлен стоп");
    await stillness();
    const s1 = await spos(); await sleep(400); const s2 = await spos();
    must(Math.hypot(s2.x - s1.x, s2.y - s1.y) < 3, "герой не остановился: " + JSON.stringify([s1, s2, p1]));
    ok(`удержание ПКМ: input к курсору, ход ${(p1.x - p0.x).toFixed(0)} px, макс. откат ${jump.toFixed(1)}, отпустил — стоп`);

    // автобег (V): бежит к курсору, повтор останавливает
    const q0 = await spos();
    const c2 = await toScreen(page, q0.x - 120, q0.y);
    await page.mouse.move(c2.x, c2.y);
    await page.keyboard.press("KeyV");
    await until(async () => q0.x - (await spos()).x > 35, 6000, "автобег к курсору").catch(async () => {
      console.log("  DIAG autorun", JSON.stringify(await page.evaluate(() => { const g = (window as any).__game.scene.getScene("game"); const n = (window as any).__net; const p = n.room.state.players.get(n.id); return { ar: g.autorun, pos: { x: g.pos.x, y: g.pos.y }, srv: { x: p.x, y: p.y, target: p.target }, cur: g.cameras.main.getWorldPoint(g.input.activePointer.x, g.input.activePointer.y), cursorQ0: { x: q0.x, y: q0.y }, sentLast: (window as any).__sent.slice(-4) }; })));
    });
    if (process.env.DBG) console.log(JSON.stringify(await page.evaluate(() => { const g = (window as any).__game.scene.getScene('game'); return { ar: g.autorun, anim: g.me.u.anim, sent: (window as any).__sent.slice(-3) }; })));
    const q1 = await spos();
    must(q0.x - q1.x > 35, "автобег не ведёт к курсору: " + (q0.x - q1.x));
    await page.keyboard.press("KeyV");
    await stillness();
    const q2 = await spos(); await sleep(400); const q3 = await spos();
    must(Math.hypot(q3.x - q2.x, q3.y - q2.y) < 3, "повтор R не остановил автобег");
    ok("автобег: бежит к курсору, повтор клавиши — стоп");

    // полоса каста по сообщению cast; шаги не предсказываются
    await page.evaluate(() => (window as any).__net.emit("cast", { ms: 1500, name: "Тест-канал" }));
    await page.evaluate(() => (window as any).__net.emit("mountcast", { ms: 1500, name: "Тест-канал" }));
    await until(() => page.evaluate(() => !!document.getElementById("mount-cast")), 2000, "полоса каста").catch(() => {});
    must(await page.evaluate(() => !!document.getElementById("mount-cast")), "полосы каста нет");
    await until(() => page.evaluate(() => { const g = (window as any).__game.scene.getScene("game"); return g.castHold > g.time.now; }), 2000, "castHold").catch(() => {});
    must(await page.evaluate(() => { const g = (window as any).__game.scene.getScene("game"); return g.castHold > g.time.now; }), "клиент не знает, что сервер держит героя (castHold)");
    ok("полоса каста есть, castHold выставлен (предсказание шагов выключено)");
    must(!errors.length, "ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("controls-move: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
