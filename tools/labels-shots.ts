/**
 * Подписи мира: рынок Аурелиона, 1366×768 (+1920×1080 без ONLY1366) и крупный план → tools/out/labels/final-*.png. Порты 2845 / 5245, один headless-таб. Запуск под замком tools/out/scenario.lock снаружи.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { sleep, startServer, stopServer, PORT } from "../tests/harness";

const VITE_PORT = 5245, OUT = path.resolve("tools/out/labels");
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
const _unused = (page: Page, ms: number) => page.evaluate(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else res((n * 1000) / (performance.now() - t0)); }; requestAnimationFrame(f); })`) as Promise<number>;

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  const clips: [string, Buffer][] = [];
  try {
    const variants = (process.env.VARS ?? "final").split(",");
    let first = true;
    for (const v of variants) {
      for (const [w, h] of process.env.ONLY1366 ? [[1366, 768]] : [[1366, 768], [1920, 1080]]) {
        const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
        page.on("pageerror", (e) => console.error("pageerror", String(e)));
        await page.setViewport({ width: w, height: h });
        await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
        await login(page, "Метки" + v + w);
        const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
        await dbg({ op: "god" });
        await dbg({ op: "tp", x: 56 * 32, y: 182 * 32 });
        await sleep(4000);
        await page.screenshot({ path: path.join(OUT, `${v}-${w}.png`) });
        if (w === 1366) {
          await dbg({ op: "tp", x: 50 * 32, y: 182 * 32 });
          await sleep(5500);
          const clip = await page.screenshot({ clip: { x: 380, y: 90, width: 380, height: 440 } });
          clips.push([v, Buffer.from(clip)]);
        }
        void first; first = false;
        await page.close(); await ctx.close();
      }
    }
    // крупные планы: увеличение x3 без сглаживания, на пустой странице
    const page = await browser.newPage();
    await page.setViewport({ width: 950, height: 1100 });
    for (const [v, buf] of clips) {
      await page.goto("about:blank");
      await page.evaluate(async (b64) => {
        const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
        const c = document.createElement("canvas"); c.width = img.width * 2.5; c.height = img.height * 2.5; c.style.cssText = "position:fixed;left:0;top:0";
        const g = c.getContext("2d")!; g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, c.width, c.height); document.body.style.margin = "0"; document.body.appendChild(c);
      }, buf.toString("base64"));
      await page.screenshot({ path: path.join(OUT, `${v}-close.png`) });
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}
setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 25 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
