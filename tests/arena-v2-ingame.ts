/**
 * Снимки арен в бою на зуме 1,75 для сравнения «до/после» (TAG=before|after): tools/out/arena/v2/<карта>-<TAG>-<A|B>.png.
 * A — камера на герое у ворот, B — у дальней трибуны с овацией. Запуск (под замком tools/out/scenario.lock):
 * TAG=after TEST_PORT=2871 VITE_TEST_PORT=5271 npx tsx tests/arena-v2-ingame.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5271;
const TAG = process.env.TAG || "after";
const OUT = path.resolve("tools/out/arena/v2");
const MAPS = (process.env.ARENAS || "ash,sun,pit,frost").split(",");
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((x) => fs.existsSync(x))!;
const must = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const send = (page: Page, t: string, m: object = {}) => page.evaluate((t, m) => (window as any).__net.send(t, m), t, m);

async function enter(page: Page, name: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 20000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 120000 });
  await sleep(2000);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1600,900", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], defaultViewport: { width: 1600, height: 900 } });
  const errors: string[] = [];
  try {
    for (const id of MAPS) {
      await startServer(true, { ARENA_BOT_WAIT_MS: "0", ARENA_MATCH_MS: "60000", ARENA_MAP: id });
      const hero = "Гладиус";
      await ensureChar(hero, "secret", hero, "warrior");
      const bctx = await browser.createBrowserContext();
      const page = await bctx.newPage();
      page.on("pageerror", (e) => errors.push(`${id}: ${e}`));
      await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
      await enter(page, hero);
      await send(page, "dbg", { op: "level", v: 20 });
      await sleep(500);
      await send(page, "arena:queue", { mode: "1v1" });
      await page.waitForSelector(".arena-modal:not([hidden])", { timeout: 10000 });
      await send(page, "arena:accept");
      await page.waitForFunction(() => (window as any).__net.kind === "arena" && (window as any).__net.arena?.map && (window as any).__net.room?.state?.phase === "fight", { timeout: 60000 });
      await page.waitForFunction(() => !!(window as any).__game.scene.getScene("game").arenaCrowd?.blit, { timeout: 30000 });
      const cr = (code: string) => page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"), c = sc.arenaCrowd; ${code} })()`);
      const dim = await page.evaluate(() => { const c = (window as any).__game.scene.getScene("game").arenaCrowd; return { w: c.bg.width, h: c.bg.height }; });
      await cr(`sc.cameras.main.setZoom(1.75);`);
      await sleep(2500);
      await page.screenshot({ path: path.join(OUT, `${id}-${TAG}-A.png`) });
      await cr(`sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(${dim.w / 2}, ${dim.h * 0.54 - dim.h * 0.3}); c.react("kill", "Гладиус"); c.ovation(performance.now(), 60000, 0.3); c.toss(30);`);
      await sleep(1800);
      await page.screenshot({ path: path.join(OUT, `${id}-${TAG}-B.png`) });
      // C — левые ворота крупно (зум 2,6), камера на проёме
      const rxs: Record<string, number> = { ash: 430, sun: 430, pit: 262, frost: 250 };
      await cr(`c.ovationUntil = 0; sc.cameras.main.setZoom(2.6); sc.cameras.main.centerOn(${dim.w / 2 - rxs[id] - 20}, ${dim.h * 0.54 - 24});`);
      await sleep(1500);
      await page.screenshot({ path: path.join(OUT, `${id}-${TAG}-C.png`) });
      console.log(id, TAG, dim.w, dim.h);
      await bctx.close();
      await stopServer();
    }
    must(!errors.length, "ошибки страницы: " + errors.join("; "));
    console.log("arena-v2-ingame: ok");
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer().catch(() => {});
  }
}
main().then(() => process.exit(0), (e) => { console.error("FAIL", e); process.exit(1); });
