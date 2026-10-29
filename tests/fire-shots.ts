/** Огонь мира в игре (tools/gen/fire.ts): у сгоревшей повозки и катапульты на Полях, костёр лагеря, жаровня; день и ночь, зум 2 и 3 → tools/out/fire/final.png.
 *  Запуск (под замком): TEST_PORT=2973 VITE_TEST_PORT=5473 npx tsx tests/fire-shots.ts */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PNG } from "pngjs";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { MAP_SEED } from "../shared/constants";
import { generateMap, walkable } from "../shared/map";

const chromePath = () => [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((x) => x && fs.existsSync(x))!;
async function main() {
  const VP = Number(process.env.VITE_TEST_PORT) || 5473, OUT = path.resolve("tools/out/fire");
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VP, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  try {
    for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
    Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1", VITE_SERVER_URL: `ws://localhost:${PORT}` });
    await import("../server/src/index");
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch {} await sleep(150); }
    const map = generateMap(MAP_SEED);
    // место 1: огонь Полей ближе всего к сгоревшей повозке или катапульте; место 2: костёр лагеря
    const fires = map.objects.filter((o) => o.kind === "bf-fire-s" || o.kind === "bf-fire-m");
    const wrecks = map.objects.filter((o) => /^bf_(wagon_broken|catapult_wreck)/.test(o.kind));
    const near = (re: RegExp) => { let bf = fires[0], bd = 1e9; for (const f of fires) for (const w of wrecks) if (re.test(w.kind)) { const d = Math.hypot(f.x - w.x, f.y - w.y); if (d < bd) { bd = d; bf = f; } } return { x: bf.x, y: bf.y, d: Math.round(bd) }; };
    const camp = map.objects.find((o) => o.kind === "campfire")!, brz = map.objects.find((o) => o.kind === "brazier");
    const spots = [{ name: "wagon", ...near(/wagon/) }, { name: "catapult", ...near(/catapult/) }, { name: "camp", x: camp.x, y: camp.y }, ...(brz ? [{ name: "brazier", x: brz.x, y: brz.y }] : [])];
    console.log("места", JSON.stringify(spots));
    const hero = "ОгоньТест"; await ensureChar(hero, "secret", hero, "warrior");
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(`window.__name = (f) => f; { const r = Date.now.bind(Date); window.__fakeMs = null; Date.now = () => window.__fakeMs ?? r(); }`);
    await page.goto(`http://localhost:${VP}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
    await page.type("#login-name", hero); await page.type("#login-pass", "secret"); await page.click("#login-go");
    await page.waitForSelector(`.cs-slot[data-name="${hero}"]`, { timeout: 15000 });
    await page.$eval(`.cs-slot[data-name="${hero}"]`, (b) => (b as HTMLElement).click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
    const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
    const p = WorldRoom.instance!.world.findByName(hero.toLowerCase())!;
    p.unit.maxHp = p.unit.hp = 99999;
    const tiles: { spot: string; time: string; zoom: number; png: PNG }[] = [];
    for (const s of spots) {
      // герой рядом с огнём (проходимая точка справа-снизу)
      let hx = s.x + 56, hy = s.y + 24;
      for (const [dx, dy] of [[56, 24], [-56, 24], [40, 50], [-40, 50], [70, 0], [-70, 0]]) if (walkable(map, s.x + dx, s.y + dy, 12)) { hx = s.x + dx; hy = s.y + dy; break; }
      p.unit.x = hx; p.unit.y = hy; p.moveTo = null;
      await sleep(3500);
      for (const [time, ph] of [["day", 0.3], ["night", 0.83]] as [string, number][]) {
        await page.evaluate((ms) => { (window as any).__fakeMs = ms; (window as any).__shadowMs = ms; }, ph * DAY_CYCLE_MS);
        for (const zoom of [2, 3]) {
          await page.evaluate((a) => { const c = (window as any).__game.scene.getScene("game").cameras.main; c.setZoom(a.z); c.stopFollow(); c.centerOn(a.x, a.y - 16); }, { z: zoom, x: (s.x + hx) / 2, y: (s.y + hy) / 2 });
          await sleep(3000);
          const shot = PNG.sync.read(await page.screenshot() as Buffer);
          const cw = 720, ch = 440, x0 = Math.round((shot.width - cw) / 2), y0 = Math.round((shot.height - ch) / 2);
          const t = new PNG({ width: cw, height: ch });
          PNG.bitblt(shot, t, x0, y0, cw, ch, 0, 0);
          tiles.push({ spot: s.name, time, zoom, png: t });
        }
      }
    }
    // сетка: строки — место×время, столбцы — зум 2 и 3
    const cw = 720, ch = 440, g = 8, W = cw * 2 + g * 3, H = (ch + g) * spots.length * 2 + g;
    const out = new PNG({ width: W, height: H });
    for (let i = 0; i < W * H; i++) { out.data[i * 4] = 18; out.data[i * 4 + 1] = 15; out.data[i * 4 + 2] = 22; out.data[i * 4 + 3] = 255; }
    tiles.forEach((t, i) => { const r = Math.floor(i / 2), c = i % 2; PNG.bitblt(t.png, out, 0, 0, cw, ch, g + c * (cw + g), g + r * (ch + g)); });
    const file = path.join(OUT, "final.png");
    fs.writeFileSync(file, PNG.sync.write(out));
    console.log("строки:", spots.map((s) => s.name + " день, ночь").join("; "), "; столбцы: зум 2 | 3 →", file);
  } finally { await browser.close().catch(() => {}); await vite.close().catch(() => {}); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
