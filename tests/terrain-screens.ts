/**
 * Браузерная проверка кусков мира у столицы (баг новой карты, задача 132): клиент иногда падал в terrain.ts createChunk —
 * Phaser PutTileAt читал tiles[index] = undefined — у Аурелиона (1808, 5776), на входе новым героем.
 * Причина: связь рвалась, пока BootScene ещё грузила ассеты (под нагрузкой вход длится десятки секунд, сторож связи не дожидался pong),
 * и после переподключения «switch» запускал сцену мира раньше конца загрузки: набора тайлов terrain ещё не было (addTilesetImage → null),
 * и первый же кусок у точки появления падал. Офлайн индексы тайлов проверяет tests/terrain-tiles.ts.
 * Сцена 1: terrain.png задержан, связь рвётся посреди загрузки — ошибок нет, мир встаёт после загрузки, слои земли есть.
 * Сцена 2: новый герой у столицы обходит её и окрестности (через границы кусков) телепортом и стрелками — ошибок страницы нет.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2821 VITE_TEST_PORT=5221 npx tsx tests/terrain-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { homeCity } from "../shared/cities";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5221;
/** Точка появления новых героев Сольгарда — центр площади Аурелиона (1808, 5776). */
const SPAWN = homeCity("solgard").spawn;
const LOADING = 3; // Phaser.Scenes.LOADING

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const ok = (s: string) => console.log("  ok   " + s);

/** Вход героем name (страница уже открыта): логин, выбор героя, «Играть». Сцену мира не ждёт. */
async function login(page: Page, name: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 15000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 15000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
}
const inWorld = (page: Page, timeout = 120000) =>
  page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout });
/** Слои земли (TilemapLayer) в сцене мира. */
const tileLayers = (page: Page) => page.evaluate(() => (window as any).__game.scene.getScene("game").children.list.filter((o: any) => o.type === "TilemapLayer").length) as Promise<number>;

/** Сцена 1: обрыв связи, пока BootScene грузит ассеты (terrain.png задержан до конца переподключения). */
async function bootRace(browser: Browser, name: string, errors: string[]): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  const held: HTTPRequest[] = [];
  let hold = true;
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (hold && r.url().includes("/assets/tiles/terrain.png")) held.push(r);
    else void r.continue();
  });
  await login(page, name);
  // игра создана, BootScene грузит (terrain.png задержан), связь с комнатой мира есть
  await page.waitForFunction((st) => {
    const w = window as any, b = w.__game?.scene?.getScene?.("boot");
    return !!b && b.sys.settings.status === st && w.__net?.online && !!w.__net?.self;
  }, { timeout: 60000 }, LOADING);
  // terrain.png запрашивается после manifest.json
  for (let i = 0; i < 300 && !held.length; i++) await sleep(100);
  must(held.length === 1, `terrain.png не задержан (${held.length})`);
  await page.evaluate(() => {
    const w = window as any;
    w.__switches = [];
    w.__net.on("switch", () => w.__switches.push({ boot: w.__game.scene.getScene("boot").sys.settings.status, game: w.__game.scene.getScene("game").sys.settings.status }));
    w.__net.room.connection.close(); // обрыв: net.dropped → recover → «switch»
  });
  await page.waitForFunction(() => (window as any).__switches.length > 0 && (window as any).__net.online, { timeout: 30000 });
  await sleep(1500);
  const sw = (await page.evaluate(() => (window as any).__switches[0])) as { boot: number; game: number };
  must(sw.boot === LOADING, `переподключение пришло не во время загрузки (статус BootScene ${sw.boot})`);
  const early = (await page.evaluate(() => (window as any).__game.scene.getScene("game").sys.settings.status)) as number;
  must(!errors.length, "ошибки страницы до конца загрузки: " + errors.join("; "));
  must(early < 2, `сцена мира запущена до конца загрузки ассетов (статус ${early})`);
  ok(`связь оборвалась посреди загрузки, переподключение прошло (BootScene — LOADING), сцена мира ждёт загрузки`);
  hold = false;
  for (const r of held.splice(0)) void r.continue();
  await inWorld(page);
  await sleep(1500);
  const n = await tileLayers(page);
  must(n > 0, "после загрузки нет слоёв земли");
  must(!errors.length, "ошибки страницы после загрузки: " + errors.join("; "));
  ok(`после загрузки мир построен: слоёв земли ${n}, ошибок нет`);
  return page;
}

/** Телепорт (команда dbg) и ожидание, пока герой и камера встанут на место, а куски вокруг достроятся. */
async function tp(page: Page, x: number, y: number) {
  await page.evaluate(([px, py]) => (window as any).__net.send("dbg", { op: "tp", x: px, y: py }), [x, y]);
  await page.waitForFunction(([px, py]) => {
    const s = (window as any).__game.scene.getScene("game"), c = s.cameras.main, me = s.me;
    return !!me && Math.hypot(s.pos.x - px, s.pos.y - py) < 2 && Math.abs(c.midPoint.x - px) < 200 && Math.abs(c.midPoint.y - py) < 200;
  }, { timeout: 20000, polling: 100 }, [x, y]);
  await sleep(900);
}

/** Сцена 2: новый герой у столицы обходит её и окрестности. */
async function walk(page: Page, errors: string[]) {
  const me = (await page.evaluate(() => { const s = (window as any).__game.scene.getScene("game"); return { x: s.pos.x, y: s.pos.y }; })) as { x: number; y: number };
  must(Math.hypot(me.x - SPAWN.x, me.y - SPAWN.y) < 96, `новый герой не у столицы: (${me.x}, ${me.y}), ждали (${SPAWN.x}, ${SPAWN.y})`);
  ok(`новый герой у столицы: (${Math.round(me.x)}, ${Math.round(me.y)})`);
  await page.evaluate(() => (window as any).__net.send("dbg", { op: "god" }));
  // кусок — 32×32 тайла (1024 px): шаги по 1100 px пересекают его границы во все стороны, 2300 — через кусок
  const steps = [[0, 0], [1100, 0], [1100, 1100], [0, 1100], [-1100, 1100], [-1100, 0], [-1100, -1100], [0, -1100], [1100, -1100], [2300, 0], [0, 2300], [0, 0]];
  for (const [dx, dy] of steps) {
    await tp(page, SPAWN.x + dx, SPAWN.y + dy);
    must(!errors.length, `ошибка страницы у (${SPAWN.x + dx}, ${SPAWN.y + dy}): ` + errors.join("; "));
  }
  ok(`телепорт по ${steps.length} точкам вокруг столицы (±1100 и 2300 px) — ошибок нет, слоёв земли ${await tileLayers(page)}`);
  for (const key of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"] as const) {
    await page.keyboard.down(key);
    await sleep(1800);
    await page.keyboard.up(key);
  }
  await sleep(500);
  must(!errors.length, "ошибки страницы при ходьбе: " + errors.join("; "));
  const end = (await page.evaluate(() => { const s = (window as any).__game.scene.getScene("game"); return { x: Math.round(s.pos.x), y: Math.round(s.pos.y) }; })) as { x: number; y: number };
  ok(`прогулка стрелками по площади — ошибок нет (герой в (${end.x}, ${end.y}))`);
}

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  // новые герои Сольгарда (Егерь, Храмовник) появляются в центре Аурелиона
  await ensureChar("Новобранец", "secret", "Новобранец", "ranger");
  await ensureChar("Пешеход", "secret", "Пешеход", "warrior");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1280, height: 800 } });
  try {
    const errors: string[] = [];
    const p1 = await bootRace(browser, "Новобранец", errors);
    await p1.browserContext().close();
    const errors2: string[] = [];
    const ctx = await (browser as any).createBrowserContext();
    const page: Page = await ctx.newPage();
    page.on("pageerror", (e) => errors2.push(String(e).slice(0, 300)));
    await login(page, "Пешеход");
    await inWorld(page);
    await sleep(1500);
    must(!errors2.length, "ошибки страницы на входе: " + errors2.join("; "));
    await walk(page, errors2);
    await ctx.close();
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("terrain-screens: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
