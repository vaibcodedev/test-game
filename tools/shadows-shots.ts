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
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  const res: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("requestfailed", (r) => console.error("REQFAIL", r.url().slice(0, 120), r.failure()?.errorText)); page.on("response", (r) => { if (r.status() >= 400) console.error("HTTP", r.status(), r.url().slice(0, 120)); });
    page.on("console", (m) => { if (m.type() === "warn" && !/AnimationManager/.test(m.text())) console.error("warn", m.text().slice(0, 160)); });
    page.on("error", (e) => console.error("PAGE CRASH", String(e))); page.on("pageerror", (e) => console.error("pageerror", String(e))); page.on("console", (m) => { if (m.type() === "error") console.error("console", m.text().slice(0, 160)); }); page.on("framenavigated", (f) => console.error("NAV", f.url()));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, "Тени");
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    // лес: ячейка 12×12 тайлов с наибольшим числом деревьев вне городов
    const map = generateMap(MAP_SEED);
    const trees = map.objects.filter((o) => /oak|pine|birch|tree/.test(o.kind) && !/dead/.test(o.kind));
    const bins = new Map<string, number>();
    for (const o of trees) { const k = `${Math.floor(o.x / 384)},${Math.floor(o.y / 384)}`; bins.set(k, (bins.get(k) ?? 0) + 1); }
    const best = [...bins.entries()].filter(([k]) => { const [a, b] = k.split(",").map(Number); return !(a >= 1 && a <= 3); }).sort((a, b) => b[1] - a[1])[0];
    const [bx, by] = best[0].split(",").map(Number);
    const spots = { capital: { x: 61 * 32, y: 186 * 32 }, forest: { x: bx * 384 + 192, y: by * 384 + 192 } } as const;
    console.log("лес", spots.forest, "деревьев в ячейке", best[1]);
    const all: [string, number][] = [["morning", 0.04], ["noon", 0.3], ["evening", 0.58], ["night", 0.82]];
    // SHOTS="morning,evening" — только эти времена суток; NOFPS=1 — без замера
    const only = (process.env.SHOTS ?? "").split(",").filter(Boolean), times = only.length ? all.filter(([n]) => only.includes(n)) : all;
    const C = 20 * 60 * 1000;
    for (const [place, pos] of Object.entries(spots)) {
      await dbg({ op: "tp", x: pos.x, y: pos.y });
      await sleep(3000);
      for (const [tn, p] of times) {
        await page.evaluate((p, C) => { (window as any).__shadowMs = Math.floor(Date.now() / C) * C + p * C; }, p, C);
        await sleep(3500);
        await page.screenshot({ path: path.join(OUT, `dyn-${place}-${tn}.png`) });
      }
      if (process.env.NOFPS) continue;
      // замер: день (вечер) в трёх режимах
      await page.evaluate((p, C) => { (window as any).__shadowMs = Math.floor(Date.now() / C) * C + p * C; }, 0.58, C);
      await sleep(2500);
      for (const m of ["off", "simple", "dynamic"]) {
        await page.evaluate((m) => (window as any).__setShadowMode(m), m);
        await sleep(1500);
        const f = await fps(page, 7000);
        const n = await page.evaluate(() => (window as any).__game.scene.getScene("game").children.list.length);
        res.push(`${place} ${m}: ${f.toFixed(1)} fps (объектов в сцене ${n})`);
        console.log(res[res.length - 1]);
      }
      await page.evaluate(() => (window as any).__setShadowMode("dynamic"));
    }
    fs.writeFileSync(path.join(OUT, "fps.txt"), res.join("\n") + "\n");
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}
setTimeout(() => { console.error('WATCHDOG'); process.exit(2); }, 45 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
