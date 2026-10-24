/**
 * Задача 75: кадры героев всех 10 классов на открытом месте, зум 2 и 3, старт и макс. легендарка.
 * OUTDIR=tools/out/looks75/before npx tsx tests/looks75.ts   (CLASSES=warlock,reaver — подмножество)
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5199;
const OUT = path.resolve(process.env.OUTDIR || "tools/out/looks75/before");
fs.mkdirSync(OUT, { recursive: true });
const ALL = ["warrior", "mage", "ranger", "healer", "rogue", "deathknight", "bloodweaver", "darkranger", "warlock", "reaver"];
const CLASSES = process.env.CLASSES?.split(",") ?? ALL;
const UMB = ["deathknight", "bloodweaver", "darkranger", "warlock", "reaver"];

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((x) => x && fs.existsSync(x))!;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  try {
    for (const cls of CLASSES) {
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      await page.evaluateOnNewDocument(() => { try { localStorage.setItem("zoom:v1", "2"); } catch {} });
      const name = "L" + cls.slice(0, 8);
      await page.bringToFront();
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#login-name");
      await page.type("#login-name", name); await page.type("#login-pass", "secret");
      await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
      await page.waitForSelector(".cs-create input[name=name]", { timeout: 10000 });
      await page.type(".cs-create input[name=name]", name);
      if (UMB.includes(cls)) { await page.$eval(`.cs-create [data-faction="umbrath"]`, (b) => (b as HTMLElement).click()); await sleep(200); }
      await page.$eval(`.cs-create [data-cls="${cls}"]`, (b) => (b as HTMLElement).click());
      await page.$eval(`.cs-create [data-look="2"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      await page.click(".cs-create [type=submit]");
      await page.waitForSelector(".cs-list .cs-slot[data-name]", { timeout: 10000 });
      await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      await page.click('.cs-list [data-a="play"]');
      await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game"), { timeout: 120000 });
      await sleep(1500);
      const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
      await dbg({ op: "god" });
      const { PLACES } = await import("../shared/map");
      const p = PLACES.find((q) => q.id === (process.env.PLACE || (UMB.includes(cls) ? "shadow_cross" : "border_cross"))) ?? PLACES[0];
      const tx = (p.x + (UMB.includes(cls) ? -6 : 6)) * 32 + 16, ty = (p.y + 6) * 32 + 16;
      await dbg({ op: "tp", x: tx, y: ty });
      await page.waitForFunction((x, y) => { const m = (window as any).__game.scene.getScene("game").me; return m && Math.hypot(m.sprite.x - x, m.sprite.y - y) < 40; }, { timeout: 15000 }, tx, ty);
      await sleep(1500);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
      const key = (t: "keydown" | "keyup", k: string) => page.evaluate((tt, kk) => { window.dispatchEvent(new KeyboardEvent(tt, { code: ({ w: "ArrowUp", s: "ArrowDown", a: "ArrowLeft", d: "ArrowRight" } as Record<string, string>)[kk], key: ({ w: "ArrowUp", s: "ArrowDown", a: "ArrowLeft", d: "ArrowRight" } as Record<string, string>)[kk], bubbles: true })); }, t, k);
      /** Кадр 200×200 CSS-пикселей с героем в центре (камера у края карты или с запаздыванием не сдвигает героя из кадра). */
      const shot = async (file: string) => {
        await sleep(450);
        const c = await page.evaluate(() => { const g = (window as any).__game; const sc = g.scene.getScene("game"); const cam = sc.cameras.main, wv = cam.worldView, s = sc.me.sprite; const r = g.canvas.getBoundingClientRect();
          return { x: r.left + ((s.x - wv.x) / wv.width) * r.width, y: r.top + ((s.y - 12 - wv.y) / wv.height) * r.height }; });
        await page.screenshot({ path: path.join(OUT, file), clip: { x: Math.round(c.x - 100), y: Math.round(c.y - 100), width: 200, height: 200 } });
      };
      const setZoom = async (z: number) => {
        const cz = () => page.evaluate(() => (window as any).__game.scene.getScene("game").css);
        for (let i = 0; i < 8 && (await cz()) !== z; i++) {
          await page.evaluate((up) => { const cv = (window as any).__game.canvas as HTMLCanvasElement; cv.dispatchEvent(new WheelEvent("wheel", { deltaY: up ? -100 : 100, bubbles: true, cancelable: true })); }, (await cz()) < z);
          await sleep(120);
        }
        if ((await cz()) !== z) throw new Error("zoom " + z + " не выставлен");
        await sleep(700);
      };
      const umb = UMB.includes(cls);
      const wbase = ({ warrior: "sword", deathknight: "sword", mage: "staff", bloodweaver: "staff", warlock: "staff", healer: "scepter", ranger: "bow", darkranger: "bow", rogue: "dagger", reaver: "axe" } as Record<string, string>)[cls];
      const L = umb ? { weapon: wbase === "sword" ? "doom_blade" : wbase === "axe" ? "dawn_eater" : wbase === "bow" ? "night_bow" : "soul_staff", helmet: "void_horns" } : { weapon: wbase === "sword" ? "storm_blade" : wbase === "staff" ? "nova_staff" : wbase === "bow" ? "winter_bow" : wbase === "scepter" ? "sun_scepter" : wbase === "dagger" ? "shadow_fang" : "", helmet: "ember_helm" };
      const two = cls === "warrior" || cls === "deathknight";
      const off = two ? { offhand: { base: "shield", r: 3, plus: 10 } } : {};
      const sets: [string, Record<string, unknown>][] = [
        ["bare", { weapon: { base: wbase, r: 0 }, helmet: null, armor: null, boots: null, offhand: null }],
        ["start", { weapon: { base: wbase, r: 0 }, helmet: null, armor: { rags: true }, boots: { rags: true }, offhand: null }],
        ["leg", { weapon: L.weapon ? { leg: L.weapon, plus: 10 } : { base: wbase, r: 3, plus: 10 }, helmet: { leg: L.helmet, plus: 10 }, armor: { leg: umb ? "thorn_plate" : "arcane_mantle", plus: 10 }, boots: { leg: "hunter_treads", plus: 10 }, ...off }],
      ];
      for (const z of [2, 3]) {
        await setZoom(z);
        for (const [sn, slots] of sets) {
          await dbg({ op: "gear", slots, faction: umb ? "umbrath" : "solgard" });
          await dbg({ op: "god" });
          await dbg({ op: "tp", x: tx, y: ty });
          await sleep(1200);
          await shot(`${cls}-z${z}-${sn}-down.png`);
          await key("keydown", "d"); await sleep(300); await key("keyup", "d"); await sleep(300);
          await shot(`${cls}-z${z}-${sn}-side.png`);
          await key("keydown", "w"); await sleep(300); await key("keyup", "w"); await sleep(300);
          await shot(`${cls}-z${z}-${sn}-up.png`);
          await key("keydown", "a"); await sleep(300); await key("keyup", "a");
          await key("keydown", "s"); await sleep(300); await key("keyup", "s");
        }
      }
      await ctx.close();
    }
  } finally { await browser.close(); await vite.close(); await stopServer(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
