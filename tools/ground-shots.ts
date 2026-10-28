/**
 * Земля в игре: 5 мест (луг с тропой у Ясного Дола, площадь Аурелиона, пепел Умбрата, болото, снег) днём и ночью на зуме 2 и 3.
 * TAG=before|after → tools/out/ground/shots/<TAG>/<место>-z<зум>-<день|ночь>.png; MONTAGE=1 — только склейка «было | стало»
 * в tools/out/ground/final.png (зум 2) и final-z3.png (зум 3). Порты TEST_PORT 2862 / 5262. Запуск под замком tools/out/scenario.lock снаружи.
 * Время суток — сдвиг Date.now на странице (фаза цикла DAY_CYCLE_MS: 0.3 — день, 0.83 — ночь).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { DAY_CYCLE_MS } from "../shared/daynight";

const OUT = path.resolve("tools/out/ground");
const PLACES: [string, number, number][] = [
  ["meadow", 70 * 32 + 480, 198 * 32 + 300],
  ["city", 38 * 32 + 480, 170 * 32 + 330],
  ["ash", 826 * 32 + 480, 4 * 32 + 270],
  ["bog", 909 * 32 + 480, 87 * 32 + 300],
  ["snow", 308 * 32 + 600, 50 * 32 + 380],
];
const TIMES: [string, number][] = [["day", 0.3], ["night", 0.83]];

function montage() {
  const read = (f: string) => PNG.sync.read(fs.readFileSync(f));
  for (const z of [2, 3]) {
    const W = 683, H = 384, cols = 4;
    const out = new PNG({ width: W * cols, height: H * PLACES.length });
    PLACES.forEach(([p], r) => {
      let c = 0;
      for (const [t] of TIMES) for (const tag of ["before", "after"]) {
        const f = path.join(OUT, "shots", tag, `${p}-z${z}-${t}.png`);
        if (fs.existsSync(f)) {
          const src = read(f);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const si = ((y * 2) * src.width + x * 2) * 4, di = ((r * H + y) * out.width + c * W + x) * 4;
            for (let q = 0; q < 4; q++) out.data[di + q] = src.data[si + q];
          }
        }
        c++;
      }
    });
    fs.writeFileSync(path.join(OUT, z === 2 ? "final.png" : "final-z3.png"), PNG.sync.write(out));
  }
  console.log("montage ok");
}

async function shots() {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const TAG = process.env.TAG ?? "after", VITE_PORT = 5262, DIR = path.join(OUT, "shots", TAG);
  fs.mkdirSync(DIR, { recursive: true });
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  let n = 0;
  try {
    for (const z of [2, 3]) for (const [tn, ph] of TIMES) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("pageerror", String(e)));
      await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${z}"); } catch {}
        (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; const off = ((${ph} * C - (n0() % C)) + C) % C; Date.now = () => n0() + off; })();`);
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      const name = `Gr${z}${tn[0]}${TAG[0]}`;
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
      const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
      await dbg({ op: "god" });
      for (const [p, x, y] of PLACES) {
        await dbg({ op: "tp", x, y });
        await sleep(7000);
        await page.screenshot({ path: path.join(DIR, `${p}-z${z}-${tn}.png`) });
        n++;
      }
      await page.close();
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  console.log("shots", TAG, n);
}

if (process.env.MONTAGE) montage();
else shots().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
