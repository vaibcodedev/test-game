/**
 * Динамические тени: кадры в 4 времена суток на площади столицы Сольгарда и в лесу + замер FPS (1366×768) в режимах Выкл / Простые / Динамические.
 * Порты 2856 / 5256, один headless-таб, один сервер. Запуск под замком tools/out/scenario.lock снаружи.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { sleep, startServer, stopServer, PORT } from "../tests/harness";
import { generateMap } from "../shared/map";
import { MAP_SEED } from "../shared/constants";

const VITE_PORT = 5256, OUT = path.resolve("tools/out/shadows");
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
  const tag = process.env.TAG ?? "before";
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  try {
    const page = await browser.newPage();
    if (tag === "before") await page.evaluateOnNewDocument(() => { (window as any).__noWallMerge = true; });
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, "Стена");
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    const map = generateMap(MAP_SEED);
    const w = map.objects.filter((o) => /^sol_wall_[hv]$/.test(o.kind) && !!o.v?.startsWith("fort"));
    const xs = w.map((o) => o.x), ys = w.map((o) => o.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const gate = map.objects.find((o) => o.kind === "sol_gate" && !!o.v?.startsWith("fort") && o.x > x0 && o.x < x1 && o.y > y0 - 40 && o.y < y1 + 40);
    console.log("форт", x0, x1, y0, y1, "ворота", gate?.x, gate?.y);
    const spots: Record<string, { x: number; y: number }> = {
      west: { x: x0 + 20, y: (y0 + y1) / 2 }, east: { x: x1 + 20, y: (y0 + y1) / 2 }, north: { x: (x0 + x1) / 2 + 200, y: y0 + 20 },
      corner: { x: x0 + 20, y: y0 + 30 }, ...(gate ? { gate: { x: gate.x, y: gate.y + 20 } } : {}),
    };
    const C = 20 * 60 * 1000;
    for (const mode of ["dynamic", "simple"]) {
      await page.evaluate((m) => (window as any).__setShadowMode(m), mode);
      for (const [name, pos] of Object.entries(spots)) {
        await dbg({ op: "tp", x: pos.x, y: pos.y });
        await sleep(2500);
        await page.evaluate((C) => { (window as any).__shadowMs = Math.floor(Date.now() / C) * C + 0.06 * C; (window as any).__game.scene.getScene("game").cameras.main.setZoom(1.75); }, C);
        await sleep(2500);
        if (process.env.DBG && name === "gate") console.log("snap", await page.evaluate(() => new Promise((res) => { const sc = (window as any).__game.scene.getScene("game"); const rt: any = sc.children.list.find((c: any) => c.type === "Container" && c.list[0]?.type === "RenderTexture")?.list[0]; if (!rt) return res("none"); rt.snapshot((img: HTMLImageElement) => { const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height; const g = cv.getContext("2d")!; g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; res(img.width + "x" + img.height + " nonzero " + n); }); }))); 
        if (process.env.DBG) console.log(name, await page.evaluate(() => { const sc = (window as any).__game.scene.getScene("game"); const rts: any[] = []; sc.children.list.forEach((c: any) => { if (c.type === "Container") c.list.forEach((k: any) => { if (k.type === "RenderTexture") rts.push(c.x + "," + c.y + " a" + c.alpha + " s" + c.scaleX.toFixed(2) + "," + c.scaleY.toFixed(2) + " v" + c.visible + " " + k.width + "x" + k.height); }); }); return rts.length + " " + rts.slice(0, 3).join(" | "); }));
        if (process.env.DBG2) await page.evaluate((mode2) => { const sc = (window as any).__game.scene.getScene("game"); sc.children.list.forEach((c: any) => { if (c.type === "Container" && c.list[0]?.type === "RenderTexture") { if (mode2 === "a") c.setAlpha(1); else c.setDepth(100000); } }); }, process.env.DBG2);
        await page.screenshot({ path: path.join(OUT, `wall-${tag}-${mode}-${name}.png`) });
      }
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}
setTimeout(() => { console.error('WATCHDOG'); process.exit(2); }, 20 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
