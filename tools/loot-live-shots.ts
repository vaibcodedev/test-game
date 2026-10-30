/**
 * Снимки превью добычи в игре (ряд над мешком, тост-карточка + баннер легендарки, сундук зонного босса, баннеры мирового босса и рейда):
 * день и ночь, зум 2 и 3 → tools/out/loot-live/. Замок только tools/out/scenario.lock2. Запуск: npx tsx tools/loot-live-shots.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DAY_CYCLE_MS } from "../shared/daynight";

const DIR = path.resolve("tools/out/loot-live"), LOCK = path.resolve("tools/out/scenario.lock2");
fs.mkdirSync(DIR, { recursive: true });
const W = 1366, H = 768, ZOOMS = [2, 3], TIMES: [string, number][] = ([["day", 0.12], ["night", 0.85]] as [string, number][]).filter(([t]) => !process.env.ONLY || t === process.env.ONLY);
const it = (uid: string, base: string, rarity: number, extra: object = {}) => ({ uid, base, name: base, rarity, ilvl: 10, req: 1, stats: { dmgMin: 8, dmgMax: 14 + rarity * 4, str: rarity * 2 }, ...extra });
const ITEMS = [it("a1", "greatsword", 3, { legendary: "storm_blade" }), it("a2", "cloth_helm", 2, { stats: { armor: 9, int: 6 } }), it("a3", "hp_potion", 0, { qty: 5, stats: {} })];

async function main() {
  fs.mkdirSync(LOCK);
  fs.writeFileSync(path.join(LOCK, "owner"), `loot-live-shots ${process.pid} ${new Date().toISOString()}\n`);
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* ok */ }
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const VITE_PORT = 5274;
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", `--window-size=${W},${H}`, "--no-sandbox"], defaultViewport: { width: W, height: H }, protocolTimeout: 1800000 });
  let n = 0;
  try {
    for (const Z of ZOOMS) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("pageerror", String(e)));
      await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${Z}"); } catch {}
        (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; window.__setDay = (p) => { window.__dayOff = ((p * C - (n0() % C)) + C) % C; }; window.__setDay(0.12); Date.now = () => n0() + window.__dayOff; })();`);
      let name = "";
      for (let a = 0; ; a++) {
        await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0", timeout: 180000 });
        name = `Lt${Z}${n++}${Date.now() % 10000}`;
        await page.waitForSelector("#login-name");
        await page.type("#login-name", name); await page.type("#login-pass", "secret");
        await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
        try { await page.waitForSelector(".cs-create input[name=name]", { timeout: 45000 }); break; } catch (e) { if (a >= 2) throw e; }
      }
      await page.type(".cs-create input[name=name]", name);
      await page.$eval(`.cs-create [data-cls="warrior"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      await page.click(".cs-create [type=submit]");
      await page.waitForSelector(".cs-list .cs-slot[data-name]", { timeout: 20000 });
      await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      await page.click('.cs-list [data-a="play"]');
      await page.waitForFunction(() => document.getElementById("charsel")!.hidden, { timeout: 120000 });
      await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game"), { timeout: 120000 });
      await sleep(2500);
      const shot = (f: string) => page.screenshot({ path: path.join(DIR, `${f}-z${Z}.png`) });
      const bagPt = async () => (await page.evaluate(`(() => { if (!window.__game.scene.getScene("game").bagViews.size) window.__game.scene.getScene("game").syncBags(window.__LB || []); const sc = window.__game.scene.getScene("game"), cam = sc.cameras.main, cv = window.__game.canvas, r = cv.getBoundingClientRect(), k = r.width / cv.width, b = sc.bagViews.values().next().value; return [r.left + (b.x - cam.worldView.x) * cam.zoom * k, r.top + (b.y - 14 - cam.worldView.y) * cam.zoom * k]; })()`)) as number[];
      const sync = (bags: string) => page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"); window.__ITEMS = ${JSON.stringify(ITEMS)}; window.__LB = ${bags}; sc.syncBags(window.__LB); })()`);
      for (const [tn, ph] of TIMES) {
        await page.evaluate(`window.__setDay(${ph})`); await sleep(6000); // тени и свет пересчитываются шагом 5 с
        try {
        // 1. мешок: ряд содержимого, затем карточка иконки
        await sync(`[{ id: "tb", x: sc.pos.x + 60, y: sc.pos.y + 6, items: window.__ITEMS }]`);
        await sleep(1500);
        const [bx, by] = await bagPt();
        await page.mouse.move(bx, by); await sleep(900);
        await shot(`bag-row-${tn}`);
        const ic = await page.$(".lr-it");
        if (ic) { const bb = (await ic.boundingBox())!; await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(500); await shot(`bag-card-${tn}`); }
        await page.mouse.move(5, 5); await sleep(700);
        await sync(`[]`); await sleep(600);
        } catch (e) { console.log("пропуск", String(e).slice(0, 80)); }
        try {
        // 2. тост (эпик) и легендарка с баннером
        await page.evaluate(`window.__game.registry.get("hud").toast({ text: "Получено: шлем", kind: "loot", icon: "cloth_helm_1", item: window.__ITEMS[1] })`);
        await sleep(900); await shot(`toast-epic-${tn}`);
        await page.evaluate(`window.__game.registry.get("hud").toast({ text: "Получено: меч", kind: "loot", icon: "greatsword_2", item: window.__ITEMS[0] })`);
        await sleep(1800); await shot(`toast-legend-${tn}`);
        await sleep(4500);
        } catch (e) { console.log("пропуск", String(e).slice(0, 80)); }
        try {
        // 3. сундук зонного босса
        await sync(`[{ id: "tc", x: sc.pos.x + 40, y: sc.pos.y + 6, items: window.__ITEMS, boss: true }]`);
        await sleep(700); await shot(`chest-shake-${tn}`);
        await sleep(300); await shot(`chest-reveal-${tn}`);
        await sleep(3000);
        const [cx, cy] = await bagPt();
        await page.mouse.move(cx, cy); await sleep(900); await shot(`chest-row-${tn}`);
        await page.mouse.move(5, 5); await sleep(600);
        await sync(`[]`); await sleep(600);
        } catch (e) { console.log("пропуск", String(e).slice(0, 80)); }
        try {
        // 4. баннеры мирового босса и рейда
        await page.evaluate(`(async () => { const m = await import("/src/ui/lootfx.ts"); m.banner(document.body, { title: "ДОБЫЧА МИРОВОГО БОССА", name: "Клинок Рассвета", sub: "Ваш вклад: Золото · 128 400 · +2 предмета" }); })()`);
        await sleep(1900); await shot(`wboss-${tn}`);
        await sleep(4200);
        await page.evaluate(`(async () => { const m = await import("/src/ui/lootfx.ts"); m.banner(document.body, { title: "ДОБЫЧА РЕЙДА", name: "Клинок Рассвета", sub: "Достаётся: <b>${name}</b>", card: m.lootCard(window.__ITEMS[0], undefined) }); })()`);
        await sleep(2200); await shot(`raid-${tn}`);
        await sleep(4000);
        } catch (e) { console.log("пропуск", String(e).slice(0, 80)); }
        console.log("снято", Z, tn);
      }
      await page.close();
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}
setTimeout(() => { console.error("WATCHDOG"); try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch { /* ok */ } process.exit(2); }, 25 * 60 * 1000).unref();
const free = () => { try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch { /* ok */ } };
main().then(() => { free(); process.exit(0); }, (e) => { console.error(e); free(); process.exit(1); });
