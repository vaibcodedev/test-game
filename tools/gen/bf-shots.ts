/**
 * Динамические тени: кадры в 4 времена суток на площади столицы Сольгарда и в лесу + замер FPS (1366×768) в режимах Выкл / Простые / Динамические.
 * Порты 2856 / 5256, один headless-таб, один сервер. Запуск под замком tools/out/scenario.lock снаружи.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { sleep, startServer, stopServer, PORT } from "../../tests/harness";
import { generateMap } from "../../shared/map";
import { MAP_SEED } from "../../shared/constants";

const VITE_PORT = 5256, OUT = path.resolve("tools/out/bf-volume");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;

async function login(page: Page, name: string) {
  try { await login0(page, name); } catch (e) { const st = await Promise.race([page.evaluate(`JSON.stringify({ scenes: (window.__game && window.__game.scene.scenes.map((s) => s.sys.settings.key + ":" + s.sys.settings.status)), loader: window.__game && window.__game.scene.scenes.map((s) => s.load && s.load.totalFailed + "/" + s.load.totalComplete + "/" + s.load.totalToLoad) })`), sleep(20000).then(() => "evaluate hung")]); console.error("STATE", st); await page.screenshot({ path: path.join(OUT, "debug-login.png") }); throw e; }
}
async function login0(page: Page, name: string) {
  await page.waitForSelector("#login-name");
  await page.type("#login-name", name); await page.type("#login-pass", "secret");
  await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
  await page.waitForSelector(".cs-create input[name=name]", { timeout: 10000 });
  await page.type(".cs-create input[name=name]", name);
  await page.$eval(`.cs-create [data-cls="warrior"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click(".cs-create [type=submit]");
  await page.waitForSelector(".cs-list .cs-slot[data-name]", { timeout: 10000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => document.getElementById("charsel")!.hidden, { timeout: 120000 });
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game"), { timeout: 120000 });
  await sleep(1500);
}
const fps = (page: Page, ms: number) => page.evaluate(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else res((n * 1000) / (performance.now() - t0)); }; requestAnimationFrame(f); })`) as Promise<number>;


async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, "Поля");
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    const map = generateMap(MAP_SEED);
    const half = map.w * 32 / 2;
    const want = (k: string) => k.startsWith("bf_horse");
    const bins = new Map<string, Set<string>>();
    for (const o of map.objects) { if (!want(o.kind) || o.x > half) continue; const k = `${Math.floor(o.x / 300)},${Math.floor(o.y / 220)}`; (bins.get(k) ?? bins.set(k, new Set()).get(k)!).add(o.kind); }
    const best = [...bins.entries()].sort((a, b) => b[1].size - a[1].size)[0];
    console.log("место", best[0], [...best[1]].join(","));
    const [bx, by] = best[0].split(",").map(Number);
    await dbg({ op: "tp", x: bx * 300 + 150, y: by * 220 + 110 });
    await sleep(4500);
    await page.screenshot({ path: path.join(OUT, "horses-field.png") });
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}
setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 30 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
