/** (rain-shots) Дождь и лужи; см. также fx-shots. Снимки встроенных эффектов Phaser (lights.ts, postfx.ts, weather.ts): ночь у факелов, лава, гроза, низкое здоровье — «Полные» и «Простые». Лист → tools/out/fx/compare.png.
 *  Время подменяется через Date.now. Порты 2851 / 5251. Запуск под замком tools/out/scenario.lock снаружи. */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { weatherAt, WEATHER_SLOT_MS } from "../shared/weather";
import { sleep, startServer, stopServer, PORT } from "./harness";

const VITE_PORT = 5252, OUT = path.resolve("tools/out/fx");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
// смещения часов: ночь без дождя, день с дождём
const base = Math.floor(Date.now() / DAY_CYCLE_MS) * DAY_CYCLE_MS;
let nightMs = base + DAY_CYCLE_MS * 0.82;
for (let t = nightMs; t < nightMs + 40 * WEATHER_SLOT_MS; t += WEATHER_SLOT_MS) if (weatherAt(t).rain === 0) { nightMs = t; break; }

async function login(page: Page, name: string) {
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

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: process.env.GPU === "1" ? ["--ignore-gpu-blocklist", "--disable-gpu-sandbox", "--no-sandbox"] : ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"], defaultViewport: { width: 1000, height: 600 }, protocolTimeout: 600000 });
  const shots: Buffer[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, `Rn${process.pid % 1000}`);
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    const setNow = (ms: number) => page.evaluate((target) => { const real = Date.now.bind(Date), off = target - real(); (Date as any).now = () => real() + off; }, ms);
    await page.evaluate(() => (window as any).__game.scene.getScene("game").cameras.main.setZoom(1.75));
    const fx = (code: string) => page.evaluate(code);
    await setNow(base + DAY_CYCLE_MS * 0.3);
    await dbg({ op: "tp", x: 1900, y: 5600 });
    await page.waitForFunction(() => { const sc = (window as any).__game.scene.getScene("game"); return Math.hypot(sc.pos.x - 1900, sc.pos.y - 5600) < 120; }, { timeout: 30000 }).catch(() => {});
    await sleep(5000);
    const snap = async (cap: string) => {
      await page.evaluate((c) => { const d = document.createElement("div"); d.id = "fxcap"; d.textContent = c; d.style.cssText = "position:fixed;left:182px;top:102px;z-index:99999;background:#000c;color:#fff;font:bold 13px sans-serif;padding:3px 8px"; document.body.appendChild(d); }, cap);
      shots.push(Buffer.from(await page.screenshot({ clip: { x: 180, y: 100, width: 640, height: 400 } })));
      await page.evaluate(() => document.getElementById("fxcap")?.remove());
    };
    await fx(`window.__fx.debugFx.wet = 0; window.__fx.debugFx.rain = -1`); await sleep(2500); await snap("Сухо (день)");
    await fx(`window.__fx.debugFx.rain = 1; window.__fx.debugFx.wet = 0.3`); await sleep(5000); await snap("Дождь, лужи проступают (мокрость 0.3)");
    await fx(`window.__fx.debugFx.wet = 1`); await sleep(2500); console.log("PROBE", JSON.stringify(await page.evaluate(() => { const sc = (window as any).__game.scene.getScene("game"), m = sc.map, pd = sc.weather.puddles; const tx = Math.floor(sc.pos.x / 32), ty = Math.floor(sc.pos.y / 32); const v: number[] = [], c: number[] = []; for (let d = -6; d <= 6; d += 3) { v.push(m.vtx[(ty + d) * (m.w + 1) + tx + d]); c.push(m.cell[(ty + d) * m.w + tx + d]); } return { sites: pd.sites.length, wet: pd.wet, vis: pd.pool.filter((p: any) => p.visible).length, v, c, p0: pd.pool.filter((p: any) => p.visible).slice(0, 3).map((p: any) => [Math.round(p.x), Math.round(p.y), p.scaleX.toFixed(2), p.alpha.toFixed(2), p.depth, p.width, p.height, p.displayList ? "dl" : "nodl", p.texture.key]), view: [Math.round(sc.cameras.main.worldView.x), Math.round(sc.cameras.main.worldView.y), Math.round(sc.cameras.main.worldView.width)], hero: [Math.round(sc.pos.x), Math.round(sc.pos.y)] }; }))); await snap("Дождь, лужи полные");
    await setNow(nightMs); await sleep(5000); await snap("Ночь: дождь, лужи");
    await setNow(base + DAY_CYCLE_MS * 0.3);
    await fx(`window.__fx.debugFx.rain = 0; window.__fx.debugFx.wet = 0.6`); await sleep(5000); await snap("После дождя: лужи сохнут (0.6)");
    await fx(`window.__fx.debugFx.wet = 0.25`); await sleep(2500); await snap("Почти высохли (0.25)");
    await page.close();
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  const W = 640, H = 400, sheet = new PNG({ width: W * 3, height: H * 2 });
  shots.forEach((b, i) => { const p = PNG.sync.read(b); PNG.bitblt(p, sheet, 0, 0, W, H, (i % 3) * W, Math.floor(i / 3) * H); });
  fs.writeFileSync(path.join(OUT, "rain.png"), PNG.sync.write(sheet));
  console.log("rain.png готов");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
