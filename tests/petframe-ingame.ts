/**
 * Рамки питомцев (скелет + демон) в игре: tools/out/petframe.png. Под замком tools/out/scenario.lock или lock2: TEST_PORT=2871 VITE_TEST_PORT=5271 npx tsx tests/petframe-ingame.ts
 * (старый комментарий) Трибуны и толпа арены в настоящем бою на каждой из 4 карт: старт, овация, реплики, FPS с толпой и без неё.
 * Снимки → tools/out/arena/ingame/<карта>-*.png, замеры → tools/out/arena/ingame/perf.json.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2861 VITE_TEST_PORT=5261 npx tsx tests/arena-crowd-ingame.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { generateMap } from "../shared/map";
import { MAP_SEED } from "../shared/constants";
import { SKILLS } from "../shared/skills";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5271;
const OUT = path.resolve("tools/out/arena/ingame");
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
  fs.mkdirSync("tools/out", { recursive: true });
  const MAP = generateMap(MAP_SEED);
  const spawns = MAP.spawns;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1600,900", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], defaultViewport: { width: 1600, height: 900 } });
  try {
    await startServer(true, {});
    const hero = "Демонолог";
    await ensureChar(hero, "secret", hero, "warlock");
    const page = await (await browser.createBrowserContext()).newPage();
    await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
    await enter(page, hero);
    await send(page, "dbg", { op: "level", v: 100 });
    await sleep(600);
    for (const id of ["wl_demon", "wl_skeletons"]) { const learn = (k: string) => { const d = SKILLS[k]; if (d.req) learn(d.req.id); return send(page, "learn", { id: k }); }; await learn(id); }
    await sleep(600);
    const s = spawns[Math.floor(spawns.length * 0.2)] ?? MAP.playerSpawn;
    await send(page, "dbg", { op: "tp", x: s.x, y: s.y });
    await sleep(1500);
    const at = await page.evaluate(() => { const u = (window as any).__net.room.state.players.get((window as any).__net.id); return { x: u.x, y: u.y }; });
    await send(page, "skill", { id: "wl_skeletons", x: at.x + 60, y: at.y });
    await sleep(1800);
    await send(page, "skill", { id: "wl_demon", x: at.x + 60, y: at.y + 20 });
    await sleep(2500);
    const n = await page.evaluate(() => document.querySelectorAll(".hud-pet-card").length);
    must(n >= 2, `рамок питомцев ${n}`);
    await page.screenshot({ path: "tools/out/petframe.png", clip: { x: 0, y: 0, width: 520, height: 420 } });
    console.log("рамок:", n, "-> tools/out/petframe.png");
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer().catch(() => {});
  }
}
main().then(() => process.exit(0), (e) => { console.error("FAIL", e); process.exit(1); });
