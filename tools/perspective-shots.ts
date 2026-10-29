/**
 * Аудит перспективы (docs/art-perspective.md): снимки объектов в игре (зум 3, утро — длинная тень по солнцу) и монтаж
 * tools/out/perspective/audit.png с подписями-диагнозами. Порты TEST_PORT 2871 / 5271. Замок tools/out/scenario.lock берёт сам.
 * MONTAGE=1 — только монтаж из уже снятых кадров.
 */
import fs from "node:fs";
import path from "node:path";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { generateMap } from "../shared/map";
import { MAP_SEED } from "../shared/constants";

const OUT = path.resolve("tools/out/perspective"), SHOTS = path.join(OUT, "shots"), LOCK = path.resolve("tools/out/scenario.lock");
fs.mkdirSync(SHOTS, { recursive: true });
/** вид, выбор экземпляра (min x — запад / Аурелион), подпись-диагноз */
type T = { kind: string; pick?: "west" | "first"; note: string };
export const TARGETS: T[] = [
  { kind: "teleport_stone", pick: "west", note: "" },
  { kind: "sun_statue", note: "" },
  { kind: "well", note: "" },
  { kind: "lamp", note: "" },
  { kind: "fountain", note: "" },
  { kind: "barrel", note: "" },
  { kind: "crate", note: "" },
  { kind: "stall_blue", note: "" },
  { kind: "ward-sol", note: "" },
  { kind: "std-home-sol", note: "" },
  { kind: "soul_brazier", note: "" },
  { kind: "campfire", note: "" },
  { kind: "dark_obelisk", note: "" },
  { kind: "crystal", note: "" },
  { kind: "rock", note: "" },
  { kind: "big_rock", note: "" },
  { kind: "snow_rock", note: "" },
  { kind: "node_obsidian", note: "" },
  { kind: "obsidian_spire", note: "" },
  { kind: "ruin_pillar", note: "" },
  { kind: "v_basic_stairs", note: "" },
  { kind: "v_basic_cliff_h", note: "" },
  { kind: "signpost", note: "" },
  { kind: "dg_entrance", note: "" },
  { kind: "v_graveyard_statue_a", note: "" },
  { kind: "pal_gate_sol", note: "" },
];
const Z = 3, W = 1366, H = 768, PH = 0.12; // утро: тень длинная, влево-вниз
const CW = 330, CH = 330; // вырез вокруг объекта (экранные px)

async function withLock<R>(f: () => Promise<R>): Promise<R> {
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(LOCK); break; } catch { if (i % 12 === 0) console.log("жду замок", fs.existsSync(path.join(LOCK, "owner")) ? fs.readFileSync(path.join(LOCK, "owner"), "utf8").trim() : ""); await new Promise((r) => setTimeout(r, 5000)); }
  }
  fs.writeFileSync(path.join(LOCK, "owner"), `perspective ${process.pid} ${new Date().toISOString()}\n`);
  try { return await f(); } finally { fs.rmSync(LOCK, { recursive: true, force: true }); }
}

async function shots() {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const VITE_PORT = 5271;
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  const map = generateMap(MAP_SEED);
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", `--window-size=${W},${H}`, "--no-sandbox"], defaultViewport: { width: W, height: H }, protocolTimeout: 1800000 });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${Z}"); localStorage.setItem("shadowMode", "dynamic"); } catch {}
      (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; const off = ((${PH} * C - (n0() % C)) + C) % C; Date.now = () => n0() + off; })();`);
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    const name = "Persp";
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
      const hx = o.x + 44, hy = o.y + 14;
      await dbg({ op: "tp", x: hx, y: hy });
      await sleep(5000);
      const ox = Math.round(W / 2 + (o.x - hx) * Z), oy = Math.round(H / 2 + (o.y - hy) * Z);
      const x = Math.max(0, Math.min(W - CW, ox - CW / 2)), y = Math.max(0, Math.min(H - CH, oy - CH + 70));
      await page.screenshot({ path: path.join(SHOTS, `${t.kind}.png`), clip: { x, y, width: CW, height: CH } });
      console.log("снят", t.kind, Math.round(o.x), Math.round(o.y));
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}

/** Монтаж через headless-браузер (шрифты с кириллицей): сетка 6 колонок, подпись — вид и диагноз из notes.json. */
async function montage() {
  const puppeteer = (await import('puppeteer-core')).default;
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p))!;
  const notes: Record<string, string> = fs.existsSync(path.join(OUT, 'notes.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'notes.json'), 'utf8')) : {};
  const files = TARGETS.map((t) => t.kind).filter((k) => fs.existsSync(path.join(SHOTS, k + '.png')));
  const cells = files.map((k, i) => '<div class=c><img src="data:image/png;base64,' + fs.readFileSync(path.join(SHOTS, k + '.png')).toString('base64') + '"><b>' + (i + 1) + '. ' + k + '</b><i>' + (notes[k] ?? '') + '</i></div>').join('');
  const html = '<html><body style="margin:0;background:#14121a;font:13px Segoe UI,sans-serif;color:#f0e2c0"><h3 style="margin:8px 10px">Аудит перспективы: зум 3, утро (длинная тень по солнцу). Оранжевым — почему объект «парит» или читается неверно</h3><div style="display:grid;grid-template-columns:repeat(6,330px);gap:4px;padding:4px">' + cells + '</div><style>.c{background:#1e1a26;display:flex;flex-direction:column}.c img{width:330px;height:330px;image-rendering:pixelated}.c b{padding:4px 6px 0}.c i{font-style:normal;color:#ffb070;padding:2px 6px 6px;min-height:46px}</style></body></html>';
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 6 * 334 + 8, height: 600 } });
  try { const page = await browser.newPage(); await page.setContent(html); await page.screenshot({ path: path.join(OUT, 'audit.png'), fullPage: true }); } finally { await browser.close(); }
  console.log('audit.png', files.length);
}

if (process.env.MONTAGE) montage().catch((e) => { console.error(e); process.exit(1); });
else withLock(shots).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
