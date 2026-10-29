/**
 * Объёмный природный декор в игре (tools/gen/nature3d*.ts): лес, пустыня, пепел, болото, зима и герой за деревом (полупрозрачная крона),
 * днём на зуме 2 и вечером на зуме 2, «за деревом» — на зуме 3 → tools/out/rocks/ingame.png (кадры 900×500 из середины экрана), кадры затем удаляются.
 * Места — самые густые по декору точки биомов (generateMap). Порты TEST_PORT 2871 / VITE 5271. Запуск под tools/out/scenario.lock снаружи.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { generateMap } from "../shared/map";
import { MAP_SEED } from "../shared/constants";

process.env.TEST_PORT ??= "2871";
const OUT = path.resolve("tools/out/rocks"), TMP = path.join(OUT, "ingame-shots");
const m = generateMap(MAP_SEED);
const nearest = (kinds: string[], x: number, y: number) => m.objects.filter((o) => kinds.includes(o.kind)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
const oak = nearest(["v_basic_oak", "v_basic_oak_big"], 3147, 7294);
// место, x, y героя (пиксели мира): герой чуть ниже середины, чтобы декор был в кадре
const PLACES: [string, number, number][] = [
  ["forest", 3147, 7294 + 60], ["desert", 9488, 8158 + 60], ["ash", 30323, 3486 + 60], ["swamp", 26099, 10014 + 60], ["winter", 11728, 1630 + 60],
  ["behind-tree", oak.x + 3, oak.y - 38],
];
const BLOCKS: [string, number, number][] = [["day", 0.3, 2], ["evening", 0.62, 2], ["day3", 0.3, 3]];
const W = 900, H = 500;

function montage() {
  const rows = BLOCKS.length, cols = PLACES.length;
  const out = new PNG({ width: W * cols, height: H * rows });
  BLOCKS.forEach(([b], r) => PLACES.forEach(([p], c) => {
    const f = path.join(TMP, `${p}-${b}.png`);
    if (!fs.existsSync(f)) return;
    const src = PNG.sync.read(fs.readFileSync(f)), x0 = Math.floor((src.width - W) / 2), y0 = Math.floor((src.height - H) / 2);
    for (let y = 0; y < H; y++) src.data.copy(out.data, ((r * H + y) * out.width + c * W) * 4, ((y0 + y) * src.width + x0) * 4, ((y0 + y) * src.width + x0 + W) * 4);
  }));
  fs.writeFileSync(path.join(OUT, "ingame.png"), PNG.sync.write(out));
  const missing = BLOCKS.flatMap(([b]) => PLACES.map(([p]) => `${p}-${b}.png`)).filter((f) => !fs.existsSync(path.join(TMP, f)));
  if (missing.length) console.log("нет кадров:", missing.join(" "));
  else fs.rmSync(TMP, { recursive: true, force: true });
  console.log("montage ok: ряды", BLOCKS.map(([b]) => b).join(" | "), "; столбцы", PLACES.map(([p]) => p).join(" | "));
}

async function shots() {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5271;
  fs.mkdirSync(TMP, { recursive: true });
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  let n = 0, id = 0;
  try {
    for (const [tn, ph, z] of BLOCKS) for (let attempt = 0; attempt < 3; attempt++) {
      const places = PLACES.filter(([p]) => !fs.existsSync(path.join(TMP, `${p}-${tn}.png`)));
      if (!places.length) break;
      await stopServer(); await startServer(true); // регистрация ограничена: свежий сервер на страницу
      const page = await browser.newPage();
      try {
        page.on("pageerror", (e) => console.error("pageerror", String(e)));
        await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${z}"); } catch {}
          (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; const off = ((${ph} * C - (n0() % C)) + C) % C; Date.now = () => n0() + off; })();`);
        await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
        const name = `Nt${id++}x`;
        await page.waitForSelector("#login-name");
        await page.type("#login-name", name); await page.type("#login-pass", "secret");
        await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
        await page.waitForSelector(".cs-create input[name=name]", { timeout: 30000 });
        await page.type(".cs-create input[name=name]", name);
        await page.$eval(`.cs-create [data-cls="warrior"]`, (b) => (b as HTMLElement).click());
        await sleep(300);
        await page.click(".cs-create [type=submit]");
        await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 30000 });
        await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
        await sleep(300);
        await page.click('.cs-list [data-a="play"]');
        await page.waitForFunction(() => document.getElementById("charsel")!.hidden, { timeout: 120000 });
        await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game"), { timeout: 120000 });
        await sleep(1500);
        const dbg = (msg: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), msg);
        await dbg({ op: "god" });
        await page.evaluate(() => { const f = (window as any).__fx?.debugFx; if (f) { f.rain = 0; f.wet = 0; f.storm = false; f.thunder = false; } });
        for (const [p, x, y] of places) {
          await dbg({ op: "tp", x, y });
          for (let w = 0; w < 8; w++) { await dbg({ op: "god" }); await dbg({ op: "calm" }); await sleep(1000); }
          if (!(await page.evaluate(() => !!(window as any).__net?.online))) throw new Error("нет связи с сервером");
          await page.screenshot({ path: path.join(TMP, `${p}-${tn}.png`) });
          n++;
        }
      } catch (e) { console.error("попытка", attempt + 1, String(e).slice(0, 160)); }
      await page.close();
      await sleep(1000);
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  console.log("shots", n);
  montage();
}

if (process.env.MONTAGE) montage();
else shots().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
