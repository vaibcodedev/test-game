/** Курганы Мёртвых: темнота по слоям в сумерки/полночь/день. Запуск (под замком): TEST_PORT=2961 VITE_TEST_PORT=5461 npx tsx tests/night-fix-shots.ts before|after */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, zoneAtPx, walkable } from "../shared/map";
import { Zone } from "../shared/map";

const tag = process.argv[2] ?? "after";
const chromePath = () => [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((x) => x && fs.existsSync(x))!;
async function main() {
  const VP = Number(process.env.VITE_TEST_PORT) || 5461, OUT = path.resolve("tools/out/night-fix");
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VP, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  try {
    for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
    Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1", VITE_SERVER_URL: `ws://localhost:${PORT}` });
    await import("../server/src/index");
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch {} await sleep(150); }
    const map = generateMap(MAP_SEED);
    let best: { x: number; y: number } | null = null;
    const cx = map.w / 2, cy = map.h / 2; let bd = 1e9;
    for (let ty = 8; ty < map.h - 8; ty += 3) for (let tx = 8; tx < map.w - 8; tx += 3) {
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      if (zoneAtPx(map, x, y) !== Zone.Barrows || !walkable(map, x, y, 40)) continue;
      // подальше от краёв зоны: все 4 стороны на 200 px тоже Курганы
      if (![[200, 0], [-200, 0], [0, 200], [0, -200]].every(([dx, dy]) => zoneAtPx(map, x + dx, y + dy) === Zone.Barrows)) continue;
      const d = Math.hypot(tx - cx, ty - cy); if (d < bd) { bd = d; best = { x, y }; }
    }
    if (!best) throw new Error("нет Курганов");
    const hero = "НочьТест"; await ensureChar(hero, "secret", hero, "warrior");
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = (f) => f; { const r = Date.now.bind(Date); window.__fakeMs = null; Date.now = () => window.__fakeMs ?? r(); }");
    await page.goto(`http://localhost:${VP}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
    await page.type("#login-name", hero); await page.type("#login-pass", "secret"); await page.click("#login-go");
    await page.waitForSelector(`.cs-slot[data-name="${hero}"]`, { timeout: 15000 });
    await page.$eval(`.cs-slot[data-name="${hero}"]`, (b) => (b as HTMLElement).click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
    const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
    const p = WorldRoom.instance!.world.findByName(hero.toLowerCase())!;
    p.unit.x = best.x; p.unit.y = best.y; p.moveTo = null; p.unit.maxHp = p.unit.hp = 99999;
    await sleep(2500);
    const res: any = {};
    if (process.env.ZOOM) await page.evaluate((z) => (window as any).__game.scene.getScene("game").cameras.main.setZoom(z), Number(process.env.ZOOM));
    if (tag === "scan") {
      const { PNG } = await import("pngjs");
      for (let ph = 0.5; ph <= 0.95; ph += 0.03) {
        await page.evaluate((ms) => { (window as any).__fakeMs = ms; (window as any).__shadowMs = ms; }, ph * DAY_CYCLE_MS);
        await sleep(2500);
        const st = await page.evaluate(() => { const sc = (window as any).__game.scene.getScene("game"), d = sc.world.dark; return `dark ${d.alpha.toFixed(2)} vis ${d.visible} mask ${sc.nightMask.active}`; });
        const png = PNG.sync.read(await page.screenshot() as Buffer); let sum = 0, n = 0;
        for (let y = 200; y < 600; y += 4) for (let x = 300; x < 1000; x += 4) { const i = (y * png.width + x) * 4; sum += (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; n++; }
        console.log(ph.toFixed(2), "lum", (sum / n).toFixed(1), st);
      }
      return;
    }
    for (const [name, ph] of [["dusk", 0.68], ["midnight", 0.83], ["day", 0.3]] as [string, number][]) {
      await page.evaluate((ms) => { (window as any).__fakeMs = ms; (window as any).__shadowMs = ms; }, ph * DAY_CYCLE_MS);
      await sleep(4500);
      res[name] = await page.evaluate(() => {
        const sc = (window as any).__game.scene.getScene("game"), d = sc.world.dark, m = sc.nightMask;
        return { zone: sc.zone ?? null, darkAlpha: +d.alpha.toFixed(3), darkVisible: d.visible, darkColor: d.fillColor.toString(16), maskActive: m.active, weatherDim: sc.weather.dim, rtVisible: m.rt?.visible };
      });
      const f = path.join(OUT, `${tag}-${name}.png`);
      await page.screenshot({ path: f });
      res[name].file = f;
    }
    console.log(JSON.stringify(res, null, 1));
    fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(res, null, 1));
  } finally { await browser.close().catch(() => {}); await vite.close().catch(() => {}); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
