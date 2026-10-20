/**
 * Браузерная проверка движения (задача 115, шаг 3), схема «Экшен»: удержание ПКМ ведёт за курсором плавно,
 * короткий ПКМ — moveTo, автобег (Shift+R), полоса каста по сообщению cast.
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
    /** Предсказанная позиция каждые ~30 мс: максимальный откат назад по X (рывки кадров в headless не считаем). */
    const sample = async (ms: number) => {
      const out: { x: number; y: number }[] = [];
      for (let t = 0; t < ms; t += 30) { out.push(await pos()); await sleep(30); }
      let jump = 0;
      if (process.env.DBG) console.log(out.map((q) => q.x.toFixed(0) + "," + q.y.toFixed(0)).join(" "));
      for (let i = 1; i < out.length; i++) jump = Math.max(jump, out[i - 1].x - out[i].x);
      return jump;
    };

    // удержание ПКМ: input-вектор, плавное движение, отпустил — стоп
    const p0 = await pos();
    const c = await toScreen(page, p0.x + 260, p0.y + 40);
    await clear(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down({ button: "right" });
    const jump = await sample(1000);
    const inputs = (await sent(page, "input")) as { mx: number; my: number }[];
    must((await sent(page, "moveTo")).length === 1, "короткая часть клика не отправила moveTo");
    must(inputs.some((m) => m.mx > 0.8 && m.my > 0 && m.my < 0.5), "нет дробного input к курсору: " + JSON.stringify(inputs.slice(0, 3)));
    const p1 = await pos();
    must(p1.x - p0.x > 60, "герой не пошёл за курсором: " + (p1.x - p0.x));
    must(jump < 4, "откат позиции назад: " + jump.toFixed(1));
    await page.mouse.up({ button: "right" });
    await sleep(500);
    const last = ((await sent(page, "input")) as { mx: number; my: number }[]).at(-1)!;
    must(last.mx === 0 && last.my === 0, "после отпускания не отправлен стоп");
    const s1 = await spos(); await sleep(400); const s2 = await spos();
    must(Math.hypot(s2.x - s1.x, s2.y - s1.y) < 3, "герой не остановился: " + JSON.stringify([s1, s2, p1]));
    ok(`удержание ПКМ: input к курсору, ход ${(p1.x - p0.x).toFixed(0)} px, макс. откат ${jump.toFixed(1)}, отпустил — стоп`);

    // автобег (Shift+R): бежит к курсору, повтор останавливает
    const q0 = await spos();
    const c2 = await toScreen(page, q0.x - 120, q0.y);
    await page.mouse.move(c2.x, c2.y);
    await page.keyboard.down("Shift"); await page.keyboard.press("KeyR"); await page.keyboard.up("Shift");
    await sleep(400);
    if (process.env.DBG) console.log(JSON.stringify(await page.evaluate(() => { const g = (window as any).__game.scene.getScene('game'); return { ar: g.autorun, anim: g.me.u.anim, sent: (window as any).__sent.slice(-3) }; })));
    await sleep(800);
    const q1 = await spos();
    must(q0.x - q1.x > 35, "автобег не ведёт к курсору: " + (q0.x - q1.x));
    await page.keyboard.down("Shift"); await page.keyboard.press("KeyR"); await page.keyboard.up("Shift");
    await sleep(600);
    const q2 = await spos(); await sleep(400); const q3 = await spos();
    must(Math.hypot(q3.x - q2.x, q3.y - q2.y) < 3, "повтор R не остановил автобег");
    ok("автобег: бежит к курсору, повтор клавиши — стоп");

    // полоса каста по сообщению cast; шаги не предсказываются
    await page.evaluate(() => (window as any).__net.emit("cast", { ms: 1500, name: "Тест-канал" }));
    await page.evaluate(() => (window as any).__net.emit("mountcast", { ms: 1500, name: "Тест-канал" }));
    await sleep(150);
    must(await page.evaluate(() => !!document.getElementById("mount-cast")), "полосы каста нет");
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
