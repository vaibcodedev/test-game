/**
 * Ворота арен в бою: общий план на зуме 1,75 и северные/южные ворота на 2,6 → tools/out/arena/gates2/<карта>-<A|N|S>.png и лист tools/out/arena/gates2.png.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2871 VITE_TEST_PORT=5271 npx tsx tests/arena-gates-ingame.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ARENA_VARIANTS, arenaCy } from "../shared/arena";
import type { ArenaId } from "../shared/arenaCrowd";
import { PC, hex } from "../tools/gen/canvas";
import { PNG } from "pngjs";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5271;
const TAG = process.env.TAG || "after";
const OUT = path.resolve("tools/out/arena/gates2");
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
      await page.waitForSelector(".arena-modal:not([hidden])", { timeout: 30000 });
      await send(page, "arena:accept");
      await page.waitForFunction(() => (window as any).__net.kind === "arena" && (window as any).__net.arena?.map && (window as any).__net.room?.state?.phase === "fight", { timeout: 60000 });
      await page.waitForFunction(() => !!(window as any).__game.scene.getScene("game").arenaCrowd?.blit, { timeout: 30000 });
      const cr = (code: string) => page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"), c = sc.arenaCrowd; ${code} })()`);
      const dim = await page.evaluate(() => { const c = (window as any).__game.scene.getScene("game").arenaCrowd; return { w: c.bg.width, h: c.bg.height }; });
      const V = ARENA_VARIANTS[id as ArenaId], cy = arenaCy(V), cx = dim.w / 2;
      const shots: [string, number, number][] = [["S", 2.6, cy + V.ry + 10], ["N", 2.6, cy - V.ry - 30], ["A", 1.75, cy]];
      for (const [k, z, y] of shots) {
        await cr(`sc.cameras.main.stopFollow(); sc.cameras.main.setZoom(${z}); sc.cameras.main.centerOn(${cx}, ${y});`);
        await sleep(600);
        await page.screenshot({ path: path.join(OUT, `${id}-${k}.png`) });
      }
      console.log(id, TAG, dim.w, dim.h);
      await bctx.close();
      await stopServer();
    }
    must(!errors.length, "ошибки страницы: " + errors.join("; "));
    // лист: строка на арену — общий план 1,75 | северные ворота 2,6 | южные ворота 2,6
    const load = (f: string) => { const p = PNG.sync.read(fs.readFileSync(f)), pc = new PC(p.width, p.height); pc.data.set(p.data); return pc; };
    const TW = 760, half = (src: PC) => { const f = src.w / TW, h = Math.round(src.h / f), o = new PC(TW, h); for (let y = 0; y < h; y++) for (let x = 0; x < TW; x++) o.set(x, y, src.get(Math.floor(x * f), Math.floor(y * f))!); return o; };
    const rows = ["ash", "sun", "pit", "frost"].map((id) => ["A", "N", "S"].map((k) => half(load(path.join(OUT, `${id}-${k}.png`)))));
    const th = rows[0][0].h, sheet = new PC(TW * 3 + 16, (th + 8) * rows.length);
    sheet.rect(0, 0, sheet.w, sheet.h, hex("#0e0c12"));
    rows.forEach((r, j) => r.forEach((t, i) => sheet.blit(t, i * (TW + 8), j * (th + 8))));
    sheet.save(path.resolve("tools/out/arena/gates2.png"));
    console.log("arena-gates-ingame: ok");
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer().catch(() => {});
  }
}
main().then(() => process.exit(0), (e) => { console.error("FAIL", e); process.exit(1); });
