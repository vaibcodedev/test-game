/**
 * Аудит перспективы (docs/art-perspective.md): снимки объектов в игре (зум 3, утро — длинная тень по солнцу) и монтаж
 * tools/out/perspective/audit.png с подписями-диагнозами. Порты TEST_PORT 2871 / 5274. Замок tools/out/scenario.lock берёт сам.
 * MONTAGE=1 — только монтаж из уже снятых кадров.
 */
import fs from "node:fs";
import path from "node:path";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { generateMap } from "../shared/map";
import { MAP_SEED } from "../shared/constants";

const OUT = path.resolve("tools/out/volume-1030"), SHOTS = path.join(OUT, "game"), LOCK = path.resolve("tools/out/scenario.lock4");
fs.mkdirSync(SHOTS, { recursive: true });
/** вид, выбор экземпляра (min x — запад / Аурелион), подпись-диагноз */
type T = { kind: string; pick?: "west" | "first"; note: string };
export const TARGETS: T[] = (process.env.KINDS ?? "arena_gate,tavern,forge,bank,house,house_blue,weapon_rack,dummy,anvil,torch").split(",").map((kind) => ({ kind, note: "" }));
const W = 1366, H = 768; // утро: тень длинная, влево-вниз
const CW = 720, CH = 560; // вырез вокруг объекта (экранные px)

async function withLock<R>(f: () => Promise<R>): Promise<R> {
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(LOCK); break; } catch { if (i % 12 === 0) console.log("жду замок", fs.existsSync(path.join(LOCK, "owner")) ? fs.readFileSync(path.join(LOCK, "owner"), "utf8").trim() : ""); await new Promise((r) => setTimeout(r, 5000)); }
  }
  fs.writeFileSync(path.join(LOCK, "owner"), `volume-1030 ${process.pid} ${new Date().toISOString()}\n`);
  try { return await f(); } finally { fs.rmSync(LOCK, { recursive: true, force: true }); }
}

async function shots() {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const VITE_PORT = 5274;
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  const map = generateMap(MAP_SEED);
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", `--window-size=${W},${H}`, "--no-sandbox"], defaultViewport: { width: W, height: H }, protocolTimeout: 1800000 });
  try {
    for (const [Z, PH] of [[2, 0.3], [3, 0.3], [2, 0.83], [3, 0.83]] as [number, number][]) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("pageerror", String(e)));
      await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${Z}"); localStorage.setItem("shadowMode", "dynamic"); } catch {}
        (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; const off = ((${PH} * C - (n0() % C)) + C) % C; Date.now = () => n0() + off; })();`);
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      const name = "Vol" + Z + (PH > 0.5 ? "n" : "d");
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
      for (const t of TARGETS) {
        const all = map.objects.filter((o) => o.kind === t.kind);
        if (!all.length) { console.log("нет на карте", t.kind); continue; }
        const o = t.pick === "west" ? all.reduce((a, b) => (b.x < a.x ? b : a)) : all[0];
        // герой справа-снизу от объекта, камера на герое
        const hx = o.x, hy = o.y - 90;
        await dbg({ op: "tp", x: hx, y: hy });
        await sleep(5000);
        const ox = Math.round(W / 2 + (o.x - hx) * Z), oy = Math.round(H / 2 + (o.y - hy) * Z);
        const x = Math.max(0, Math.min(W - CW, ox - CW / 2)), y = Math.max(0, Math.min(H - CH, oy - CH + 100));
        await page.screenshot({ path: path.join(SHOTS, `${t.kind}_z${Z}_${PH > 0.5 ? "night" : "day"}.png`), clip: { x, y, width: CW, height: CH } });
        console.log("снят", t.kind, Math.round(o.x), Math.round(o.y));
      }
      await page.close();

    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}

withLock(shots).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
