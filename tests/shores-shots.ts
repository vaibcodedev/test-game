/**
 * Снимки берегов автотайлами (tools/gen/shores.ts, docs/water-shores.md) в игре: озеро у травы, река с песком, мост, пруд, лес у воды.
 * Герой подходит к воде с севера тем же moveWithCollision, что у сервера, и встаёт у кромки (ноги на кромке, под ним — стенка).
 * Каждое место: день зум 2 и вечер зум 3 → tools/out/shores/ingame1.png. Под замком: TEST_PORT=2947 VITE_TEST_PORT=5447 npx tsx tests/shores-shots.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { generateMap, moveWithCollision, shoreAt, T, walkable, waterAtFeet } from "../shared/map";
import { MAP_SEED } from "../shared/constants";
import { PC } from "../tools/gen/canvas";
import { drawText } from "../tools/gen/vendor-lib";
import { sleep, startServer, stopServer, PORT } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5447;
const OUT = path.resolve("tools/out/shores");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
const base = Math.floor(Date.now() / DAY_CYCLE_MS) * DAY_CYCLE_MS;
const DAY = base + DAY_CYCLE_MS * 0.3, EVE = base + DAY_CYCLE_MS * 0.72;
const CW = 400, CH = 260;

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
const decode = (u: string) => PNG.sync.read(Buffer.from(u.split(",")[1], "base64"));
const crop = (src: PNG, f: { x: number; y: number }, w: number, h: number): PNG => { const o = new PNG({ width: w, height: h }); const x0 = Math.max(0, Math.min(src.width - w, Math.round(f.x - w / 2))), y0 = Math.max(0, Math.min(src.height - h, Math.round(f.y - h / 2))); PNG.bitblt(src, o, x0, y0, w, h, 0, 0); return o; };
const label = (dst: PNG, text: string, x: number, y: number) => {
  const pc = new PC(text.length * 6 + 4, 9);
  for (let i = 0; i < pc.data.length; i += 4) { pc.data[i + 3] = 200; }
  drawText(pc, text, 2, 1, [255, 240, 200, 255], 1);
  for (let yy = 0; yy < pc.h * 2; yy++) for (let xx = 0; xx < pc.w * 2; xx++) {
    const s = (Math.floor(yy / 2) * pc.w + Math.floor(xx / 2)) * 4, X = x + xx, Y = y + yy;
    if (X >= dst.width || Y >= dst.height) continue;
    const d = (Y * dst.width + X) * 4, a = pc.data[s + 3] / 255;
    for (let i = 0; i < 3; i++) dst.data[d + i] = Math.round(dst.data[d + i] * (1 - a) + pc.data[s + i] * a);
  }
};

type Spot = { id: string; cap: string; x: number; y: number };
const m = generateMap(MAP_SEED);
/** Клетка северного берега нужного биома (маска 3: суша сверху, вода снизу), с водой в окне 25–65 %, ближе к точке near или к старту. */
function northShore(biome: number, near?: { x: number; y: number }, pond = false): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bd = Infinity;
  const V = (x: number, y: number) => m.vtx[y * (m.w + 1) + x];
  for (let ty = 12; ty < m.h - 12; ty++) for (let tx = 12; tx < m.w - 12; tx++) {
    const s = shoreAt(m, tx, ty);
    if (!s || s.biome !== biome || s.mask !== 3) continue;
    let c = 0; for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (V(tx + x, ty + y) === T.Water) c++;
    if (pond ? c < 4 || c > 20 : c < 20 || c > 52) continue;
    const d = near ? Math.hypot(tx * 32 - near.x, ty * 32 - near.y) : Math.hypot(tx * 32 - m.playerSpawn.x, ty * 32 - m.playerSpawn.y);
    if (d < bd) { bd = d; best = { x: tx * 32 + 16, y: ty * 32 + 16 }; }
  }
  return best;
}
function dryNear(x: number, y: number) {
  for (let r = 0; r < 400; r += 8) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos((a / 16) * 6.283) * r, py = y + Math.sin((a / 16) * 6.283) * r;
    if (walkable(m, px, py, 10) && !waterAtFeet(m, px, py)) return { x: px, y: py };
  }
  return { x, y };
}
/** Стоянка у кромки: с севера шагами по 2 px вниз, пока пускает moveWithCollision. */
function edgeStand(sp: { x: number; y: number }) {
  let { x, y } = dryNear(sp.x, sp.y - 40);
  for (let i = 0; i < 100; i++) { const q = moveWithCollision(m, x, y, 0, 2, 10); if (q.y === y) break; x = q.x; y = q.y; }
  return { x, y };
}

async function main() {
  const bridge = m.objects.find((o) => o.kind === "bridge_h" || o.kind === "bridge_v");
  const list: Spot[] = [];
  const add = (id: string, cap: string, p: { x: number; y: number } | null) => { if (p) list.push({ id, cap, ...p }); else console.log("нет места:", id); };
  add("grass", "озеро у травы", northShore(0));
  add("sand", "река с песком", northShore(1, bridge ? { x: bridge.x, y: bridge.y - 300 } : undefined));
  add("forest", "лес у воды", northShore(2));
  add("pond", "пруд", northShore(1, undefined, true) ?? northShore(0, undefined, true));
  if (bridge) list.push({ id: "bridge", cap: "мост", x: bridge.x, y: bridge.y - 40 });
  console.log(JSON.stringify(list));
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-sandbox", "--window-size=1280,800"], defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
  const errors: string[] = [];
  const shots: [PNG, string][] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (c) => { if (c.type() === "error") errors.push(c.text()); });
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, `Sh${process.pid % 1000}`);
    const dbg = (x: Record<string, unknown>) => page.evaluate((v) => (window as any).__net.send("dbg", v), x);
    await dbg({ op: "god" });
    const setNow = (ms: number) => page.evaluate((target) => { const w = window as any; const real = w.__realNow ??= Date.now.bind(Date); (Date as any).now = () => real() + (target - real()); }, ms);
    const focusOf = (p: { x: number; y: number }) => page.evaluate((q) => { const w = window as any, c = w.__game.scene.getScene("game").cameras.main, g = w.__game, k = g.canvas.width / g.scale.width; return { x: (q.x - c.worldView.x) * c.zoom * k, y: (q.y - c.worldView.y) * c.zoom * k }; }, p);
    const cap = async () => decode(await page.evaluate(() => new Promise<string>((res) => { const g = (window as any).__game; g.events.once("postrender", () => res(g.canvas.toDataURL("image/png"))); })));
    for (const sp of list) {
      const st = sp.id === "bridge" ? dryNear(sp.x, sp.y) : edgeStand(sp);
      await page.evaluate(() => (window as any).__net.send("respawn", {})); await sleep(500); await dbg({ op: "god" });
      await dbg({ op: "tp", x: st.x, y: st.y });
      await page.evaluate(() => { const w = window as any; w.__waterLook = 1; const f = w.__fx?.debugFx; if (f) { f.rain = 0; f.wet = 0; } });
      for (const [t, z, nm] of [[DAY, 2, "день, зум 2"], [EVE, 3, "вечер, зум 3"]] as const) {
        await setNow(t);
        await page.evaluate((zz) => (window as any).__game.scene.getScene("game").cameras.main.setZoom(zz), z);
        await sleep(4000);
        const f = await focusOf({ x: st.x, y: st.y });
        shots.push([crop(await cap(), f, CW, CH), `${sp.cap}: ${nm}`]);
      }
      const feet = waterAtFeet(m, st.x, st.y + 6);
      console.log(sp.id, "стоянка", Math.round(st.x), Math.round(st.y), "ноги в воде:", feet);
    }
    const cols = 2, sheet = new PNG({ width: CW * 2 * cols, height: CH * 2 * Math.ceil(shots.length / cols) });
    sheet.data.fill(20);
    shots.forEach(([p, c], i) => {
      const big = new PNG({ width: CW * 2, height: CH * 2 });
      for (let y = 0; y < big.height; y++) for (let x = 0; x < big.width; x++) { const s = ((y >> 1) * CW + (x >> 1)) * 4, d = (y * big.width + x) * 4; for (let k = 0; k < 4; k++) big.data[d + k] = p.data[s + k]; }
      const X = (i % cols) * CW * 2, Y = Math.floor(i / cols) * CH * 2;
      PNG.bitblt(big, sheet, 0, 0, big.width, big.height, X, Y);
      label(sheet, c, X + 6, Y + 6);
    });
    fs.writeFileSync(path.join(OUT, "ingame1.png"), PNG.sync.write(sheet));
    console.log("ingame1.png записан");
    await page.close();
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  console.log("errors", JSON.stringify(errors.slice(0, 8)));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
