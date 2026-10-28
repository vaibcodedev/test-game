/**
 * Трибуны и толпа арены в настоящем бою на каждой из 4 карт: старт, овация, реплики, FPS с толпой и без неё.
 * Снимки → tools/out/arena/ingame/<карта>-*.png, замеры → tools/out/arena/ingame/perf.json.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2861 VITE_TEST_PORT=5261 npx tsx tests/arena-crowd-ingame.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5261;
const OUT = path.resolve("tools/out/arena/ingame");
const MAPS = (process.env.ARENAS || "ash,sun,pit,frost").split(",");
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((x) => fs.existsSync(x))!;
const must = (c: unknown, m: string) => { if (!c) throw new Error(m); };
const send = (page: Page, t: string, m: object = {}) => page.evaluate((t, m) => (window as any).__net.send(t, m), t, m);

async function enter(page: Page, name: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 20000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 120000 });
  await sleep(2000);
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1600,900", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], defaultViewport: { width: 1600, height: 900 } });
  const perf: Record<string, unknown> = {};
  const errors: string[] = [];
  try {
    for (const id of MAPS) {
      await startServer(true, { ARENA_BOT_WAIT_MS: "0", ARENA_MATCH_MS: "40000", ARENA_MAP: id });
      const hero = "Гладиус";
      await ensureChar(hero, "secret", hero, "warrior");
      const bctx = await browser.createBrowserContext();
      const page = await bctx.newPage();
      page.on("pageerror", (e) => errors.push(`${id}: ${e}`));
      await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
      await enter(page, hero);
      await send(page, "dbg", { op: "level", v: 20 });
      await sleep(500);
      await send(page, "arena:queue", { mode: "1v1" });
      await page.waitForSelector(".arena-modal:not([hidden])", { timeout: 10000 });
      await send(page, "arena:accept");
      await page.waitForFunction(() => (window as any).__net.kind === "arena" && (window as any).__net.arena?.map && (window as any).__net.room?.state?.phase === "fight", { timeout: 60000 });
      const got = await page.evaluate(() => (window as any).__net.arena.map);
      must(got === id, `карта матча ${got}, ждали ${id}`);
      await page.waitForFunction(() => !!(window as any).__game.scene.getScene("game").arenaCrowd?.blit, { timeout: 30000 });
      // реальные события сервера считаем
      await page.evaluate(() => { (window as any).__ev = []; (window as any).__net.on("arena:ev", (m: unknown) => (window as any).__ev.push(m)); });
      const cr = (code: string) => page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"), c = sc.arenaCrowd; ${code} })()`);
      const fit = (zoom: number, x: number, y: number) => cr(`sc.cameras.main.stopFollow(); sc.cameras.main.setZoom(${zoom}); sc.cameras.main.centerOn(${x}, ${y});`);
      const spec = await page.evaluate(() => { const c = (window as any).__game.scene.getScene("game").arenaCrowd; return { n: c.spec.length, w: c.bg.width, h: c.bg.height }; });
      console.log(id, "зрителей", spec.n, `${spec.w}×${spec.h}`);
      // 1. старт: волна по кругу, всё поле
      await cr(`c.react("start"); c.addWave(60000, 1); c.wave[c.wave.length - 1].t0 = performance.now() - 15000;`);
      await fit(Math.min(1600 / spec.w, 900 / spec.h), spec.w / 2, spec.h / 2);
      await sleep(1500);
      await page.screenshot({ path: path.join(OUT, `${id}-1-start.png`) });
      // 2. овация на убийстве: руки вверх, флажки, шапки; крупно на трибуне
      await cr(`c.wave = []; c.react("kill", "Гладиус"); c.ovation(performance.now(), 60000, 0.3);`);
      await fit(2.6, spec.w / 2 - 120, spec.h * 0.54 - spec.h * 0.33);
      await sleep(1200);
      await cr(`c.toss(40);`);
      await sleep(250);
      await page.screenshot({ path: path.join(OUT, `${id}-2-ovation.png`) });
      // 3. реплики: три пузыря живут долго
      await cr(`const cam = sc.cameras.main.worldView; for (const t of c.tips) { t.on = false; t.box.setVisible(false); } c.burst = []; c.say("win", "Гладиус", cam); c.say("crit", undefined, cam); c.say("kill", "Гладиус", cam); for (const t of c.tips) t.life = 60000;`);
      await sleep(700);
      const tips = (await cr(`return c.tips.filter((t) => t.on).map((t) => t.txt.text);`)) as string[];
      await page.screenshot({ path: path.join(OUT, `${id}-3-bubbles.png`) });
      must(tips.length >= 1 && tips.length <= 3, `реплик ${tips.length}`);
      // 4. замер: кадры с толпой (покой и овация) против без неё
      await cr(`c.ovationUntil = 0; c.wave = []; c.hasMotion = true; for (const t of c.tips) { t.on = false; t.box.setVisible(false); } sc.cameras.main.setZoom(1.6); sc.cameras.main.centerOn(sc.pos.x, sc.pos.y);`);
      await sleep(1000);
      const measure = async (label: string, pre: string) => {
        await cr(pre);
        await sleep(800);
        const r = await page.evaluate(() => new Promise<{ fps: number; upd: number }>((res) => {
          const sc = (window as any).__game.scene.getScene("game"), c = sc.arenaCrowd;
          let n = 0, upd = 0;
          const t0 = performance.now();
          const orig = c.update.bind(c);
          c.update = (dt: number) => { const a = performance.now(); orig(dt); upd += performance.now() - a; };
          const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else { c.update = orig; res({ fps: Math.round((n / 4) * 10) / 10, upd: Math.round((upd / Math.max(1, n)) * 100) / 100 }); } };
          requestAnimationFrame(f);
        }));
        console.log("  ", label, JSON.stringify(r));
        return r;
      };
      const res: Record<string, unknown> = { spectators: spec.n };
      res.idle = await measure("с толпой, покой", `c.blit.setVisible(true);`);
      res.ovation = await measure("с толпой, овация", `c.ovation(performance.now(), 60000, 0.3);`);
      res.off = await measure("без толпы (Blitter скрыт)", `c.ovationUntil = 0; c.blit.setVisible(false); c.hatBlit.setVisible(false);`);
      await cr(`c.blit.setVisible(true); c.hatBlit.setVisible(true);`);
      res.events = await page.evaluate(() => (window as any).__ev);
      perf[id] = res;
      await bctx.close();
      fs.writeFileSync(path.join(OUT, "perf.json"), JSON.stringify(perf, null, 1));
      await stopServer();
    }
    fs.writeFileSync(path.join(OUT, "perf.json"), JSON.stringify(perf, null, 1));
    must(!errors.length, "ошибки страницы: " + errors.join("; "));
    console.log("arena-crowd-ingame: ok");
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer().catch(() => {});
  }
}
main().then(() => process.exit(0), (e) => { console.error("FAIL", e); process.exit(1); });
