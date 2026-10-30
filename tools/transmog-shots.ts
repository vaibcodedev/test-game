/**
 * Снимки перековки (docs/transmog.md) в tools/out/transmog/: окно Перековщика (снять оболочку, наложить с превью «было | станет»),
 * подсказка «Оболочки» и герой до и после — днём и ночью, зум 2 и 3. Порты TEST_PORT 2891 / 5291; замок tools/out/scenario.lock
 * берёт сам (чужой не трогает — ждёт), приоритет BelowNormal. Запуск: npx tsx tools/transmog-shots.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { REFORGER } from "../shared/transmog";

process.env.TEST_PORT ??= "2891";
const OUT = path.resolve("tools/out/transmog"), LOCK = path.resolve("tools/out/scenario.lock");
fs.mkdirSync(OUT, { recursive: true });
const W = 1366, H = 768, VITE_PORT = 5291;
const TIMES: [string, number][] = [["day", 0.3], ["night", 0.82]];
/** Цели (надеты) и доноры вида: двуручник, латы, латный шлем. */
const TARGETS = ["greatsword_6", "plate_armor_6", "plate_helm_6"];
const DONORS = ["greatsword_100", "plate_armor_100", "plate_helm_100"];

async function withLock<R>(f: () => Promise<R>): Promise<R> {
  try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* нет прав — как есть */ }
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(LOCK); break; } catch { if (i % 12 === 0) console.log("жду замок"); await new Promise((r) => setTimeout(r, 5000)); }
  }
  fs.writeFileSync(path.join(LOCK, "owner"), `transmog-shots ${process.pid} ${new Date().toISOString()}\n`);
  try { return await f(); } finally { fs.rmSync(LOCK, { recursive: true, force: true }); }
}

async function shots() {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, timeout: 120000, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", `--window-size=${W},${H}`, "--no-sandbox"], defaultViewport: { width: W, height: H }, protocolTimeout: 1800000 });
    for (const Z of (process.env.ZOOMS ?? "2,3").split(",").map(Number)) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("pageerror", String(e)));
      page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") console.log("console", m.type(), m.text().slice(0, 300)); });
      await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${Z}"); localStorage.setItem("shadowMode", "dynamic"); } catch {}
        (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; window.__setDay = (p) => { window.__dayOff = ((p * C - (n0() % C)) + C) % C; }; window.__setDay(${TIMES[0][1]}); Date.now = () => n0() + window.__dayOff; })();`);
      const name = `Tm${Z}${Date.now() % 100000}`;
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#login-name");
      await page.type("#login-name", name); await page.type("#login-pass", "secret");
      await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
      await page.waitForSelector(".cs-create input[name=name]", { timeout: 45000 });
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
      await sleep(1500);
      const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
      const send = (t: string, m: Record<string, unknown>) => page.evaluate((a, b) => (window as any).__net.send(a, b), t, m);
      const inv = () => page.evaluate(() => (window as any).__net.self.inventory.map((it: any) => it && { base: it.base, model: it.model, ap: it.appearance?.base }));
      await dbg({ op: "god" });
      // уровень 100 (вещи 100 надеваются) — с повтором: первая команда сразу после входа иногда теряется
      for (let t = 0; t < 5 && !(await page.evaluate(() => (window as any).__net.self?.level >= 100)); t++) { await dbg({ op: "level", v: 100 }); await sleep(2000); }
      console.log("этап: уровень");
      await dbg({ op: "gold", v: 200000 });
      const hx = REFORGER.x + 44, hy = REFORGER.y + 26;
      await dbg({ op: "tp", x: hx, y: hy });
      await sleep(500);
      // цели надеваем, доноров кладём в сумку
      for (const id of TARGETS) {
        await dbg({ op: "item", base: id, ilvl: 6, rarity: 0 });
        await sleep(250);
        const i = (await inv()).findIndex((it: any) => it?.model === id);
        await send("equip", { index: i });
        await sleep(250);
      }
      for (const id of DONORS) await dbg({ op: "item", base: id, ilvl: 100, rarity: 2 });
      await sleep(4000);
      const hero = async (tag: string) => {
        for (const [tn, ph] of TIMES) {
          await page.evaluate(`window.__setDay(${ph})`);
          await sleep(5500);
          const [ox, oy] = (await page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"), cam = sc.cameras.main, cv = window.__game.canvas, r = cv.getBoundingClientRect(), k = r.width / cv.width; return [r.left + (${hx} - cam.worldView.x) * cam.zoom * k, r.top + (${hy} - cam.worldView.y) * cam.zoom * k]; })()`)) as number[];
          const cw = 110 * Z, ch = 90 * Z;
          await page.screenshot({ path: path.join(OUT, `hero-z${Z}-${tn}-${tag}.png`), clip: { x: Math.round(Math.max(0, ox - cw / 2)), y: Math.round(Math.max(0, oy - ch * 0.75)), width: cw, height: ch } });
        }
        await page.evaluate(`window.__setDay(${TIMES[0][1]})`);
      };
      await hero("before");
      const ui = (js: string) => page.evaluate(js);
      await ui(`window.__game.scene.getScene("game").hud.transmog.open("reforger")`);
      await sleep(400);
      for (let k = 0; k < DONORS.length; k++) {
        // снять оболочку: первая подходящая вещь-донор
        await ui(`document.querySelector('#tm-tab-extract').click()`);
        await sleep(200);
        const di = (await inv()).findIndex((it: any) => it?.model === DONORS[k]);
        const cells = await page.$$(".win-tm .smith-pick .cell");
        const donors = (await inv()).map((it: any, i: number) => [it, i] as const).filter(([it]: readonly [any, number]) => it && !it.ap && it.base !== "tm_shell" && it.base !== "hp_potion" && it.base !== "mp_potion").map(([, i]: readonly [any, number]) => i);
        await cells[donors.indexOf(di)].click();
        await sleep(1500);
        await ui(`document.querySelector('.win-tm .body').scrollTop = 9999`);
        await sleep(200);
        if (k === 0) await (await page.$(".win-tm"))!.screenshot({ path: path.join(OUT, `window-extract-z${Z}.png`) });
        await ui(`document.querySelectorAll('.win-tm .win-foot .smith-go')[0].click()`);
        await sleep(700);
        // наложить: оболочка, затем надетая цель
        await ui(`document.querySelector('#tm-tab-apply').click()`);
        await sleep(200);
        await ui(`document.querySelector('.win-tm .sec .cells .cell').click()`);
        await sleep(200);
        await ui(`document.querySelectorAll('.win-tm .sec')[1].querySelector('.cell').click()`);
        await sleep(1500);
        await ui(`document.querySelector('.win-tm .body').scrollTop = 9999`);
        await sleep(200);
        if (k === 0) await (await page.$(".win-tm"))!.screenshot({ path: path.join(OUT, `window-apply-z${Z}.png`) });
        await ui(`[...document.querySelectorAll('.win-tm .win-foot .smith-go')].pop().click()`);
        await sleep(700);
      }
      // подсказка оболочки: ещё одна оболочка в сумке
      await dbg({ op: "item", base: "greatsword_84", ilvl: 84, rarity: 1 });
      await sleep(400);
      await ui(`document.querySelector('#tm-tab-extract').click()`);
      await sleep(200);
      await ui(`[...document.querySelectorAll('.win-tm .smith-pick .cell')].find((c) => c.querySelector('img').src.includes('im_greatsword_84')).click()`);
      await sleep(200);
      await ui(`document.querySelectorAll('.win-tm .win-foot .smith-go')[0].click()`);
      await sleep(700);
      await ui(`window.__game.scene.getScene("game").hud.transmog.close()`);
      await page.keyboard.press("KeyI");
      await sleep(600);
      const sh = await page.$$eval(".win-inv .grid .cell", (cs) => cs.findIndex((c) => !!c.querySelector("img")?.getAttribute("src")?.includes("im_greatsword_84")));
      const cell = (await page.$$(".win-inv .grid .cell"))[sh];
      if (cell) {
        await cell.hover();
        await sleep(1500);
        await cell.hover();
        await sleep(400);
        const tip = await page.$(".tip:not([hidden])");
        if (tip) await tip.screenshot({ path: path.join(OUT, `shell-tip-z${Z}.png`) });
      }
      await page.keyboard.press("KeyI");
      await sleep(400);
      await hero("after");
      await page.close();
      console.log("снято, зум", Z);
    }
  } finally {
    await browser?.close(); await vite.close(); await stopServer();
  }
}

setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 30 * 60 * 1000).unref();
withLock(shots).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
