/**
 * Мировые боссы, интерфейс (задача 151, партия 3): снимки окна «Сборы», трекера, миникарты, карты мира, полосы вклада, итога и Летописи
 * на 1366×768 и 1920×1080, зум игры 2. Свой сервер и Vite, headless; замки tools/out/scenario.lock / scenario.lock2 (чужой не трогать).
 *   $env:TEST_PORT="2951"; $env:VITE_TEST_PORT="5351"; npx tsx tools/wboss-ui-shots.ts   → tools/out/wboss-ui/*.png, montage.png
 *   MONTAGE=1 — только пересобрать montage.png из готовых снимков.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, sleep, startServer, stopServer, PORT } from "../tests/harness";
import { RAID_HERALDS } from "../shared/raid";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5351, OUT = path.resolve("tools/out/fixes-1030");
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
const log = (s: string) => console.log(s);
const MIN = 60000;
const SIZES: [number, number][] = [[1366, 768], [1920, 1080]];
const NAMES = ["01_sleep_window", "02_soon_say", "03_soon_window", "04_worldmap_soon", "05_alive_far", "06_worldmap_alive", "07_bar_contrib", "08_result", "09_chronicle", "10_raid_tab"];

async function acquire(): Promise<string> {
  for (let k = 0; k < 720; k++) {
    for (const n of ["scenario.lock", "scenario.lock2"]) {
      const f = path.resolve("tools/out", n);
      try { fs.writeFileSync(f, `wboss-ui ${process.pid} ${new Date().toTimeString().slice(0, 8)}`, { flag: "wx" }); return f; } catch { /* занят */ }
    }
    if (k % 12 === 0) log("жду замок сценариев…");
    await sleep(5000);
  }
  throw new Error("замок не освободился");
}

const errors: string[] = [];
async function newPage(browser: Browser, w: number, h: number) {
  const p = await browser.newPage();
  p.setDefaultNavigationTimeout(300000); p.setDefaultTimeout(180000);
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  p.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  await p.setViewport({ width: w, height: h });
  return p;
}
async function login(page: Page, name: string, cls: string) {
  const token = await ensureChar(`wu${Array.from(name).map((c) => c.charCodeAt(0).toString(36)).join("")}`.slice(0, 16), "secret", name, cls);
  for (let k = 0; ; k++) {
    try {
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); }, token);
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 30000 });
      await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      await page.click('.cs-list [data-a="play"]');
      await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 120000, polling: 500 });
      await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 120000, polling: 500 });
      await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 60000, polling: 500 });
      await sleep(2000);
      return;
    } catch (e) { if (k >= 2) throw e; log(`повтор входа: ${String((e as Error).message).slice(0, 80)}`); }
  }
}
const dbg = (page: Page, m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
const send = (page: Page, t: string, m: Record<string, unknown> = {}) => page.evaluate((a: string, b: unknown) => (window as any).__net.send(a, b), t, m);
const zoom2 = (page: Page) => page.evaluate(`(() => { const s = window.__game.scene.getScene("game"); s.cameras.main.setZoom(2); })()`);
const shot = async (page: Page, tag: string, id: string) => { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, `${tag}_${id}.png`) as `${string}.png` }); };
const closeAll = (page: Page) => page.evaluate(`(() => { document.querySelectorAll(".win-muster,.win-worldmap").forEach((e) => (e.hidden = true)); document.querySelectorAll(".modal").forEach((e) => e.remove()); })()`);
const key = (page: Page, code: string) => page.keyboard.press(code as never);
const openMap = (page: Page) => page.evaluate(`window.__game.scene.getScene("game").hud.openWorldMap()`);

/** Ждёт конец заставки босса (.bi-root) и возврат интерфейса. */
const calm = async (p: Page) => { await p.waitForFunction(`!document.querySelector(".bi-root")`, { timeout: 40000, polling: 300 }).catch(() => {}); await p.evaluate(`document.body.classList.remove("bi-cine")`); await sleep(1800); };


async function run(browser: Browser) {
  const p = await newPage(browser, 1366, 768);
  await login(p, "Фикс1030", "warrior");
  await dbg(p, { op: "level", v: 100 }); await sleep(600);
  await dbg(p, { op: "god" });
  await zoom2(p);
  const herald = RAID_HERALDS.find((q) => q.id.endsWith("ember")) ?? RAID_HERALDS[0];
  await dbg(p, { op: "tp", x: herald.x, y: herald.y + 40 }); await sleep(1200);
  await dbg(p, { op: "wboss", act: "reset" }); await sleep(800);
  await dbg(p, { op: "wboss", act: "soon", ms: 10 * MIN }); await sleep(1500);
  await openMap(p); await sleep(1000); await shot(p, "after", "1_worldmap_heart_label");
  await closeAll(p);
  await key(p, "KeyJ"); await sleep(1200); await shot(p, "after", "2_muster_before_fort");
  const pos0 = await p.evaluate(`(() => { const c = window.__game.scene.getScene("game").cameras.main.midPoint; return { x: c.x, y: c.y }; })()`) as { x: number; y: number };
  await p.evaluate(`document.querySelector('.win-muster [data-a="tp"]').click()`);
  await sleep(900); await shot(p, "after", "3_cast_windows_closed");
  const mid = await p.evaluate(`({ muster: !document.querySelector(".win-muster").hidden, cast: !!document.getElementById("mount-cast"), toasts: [...document.querySelectorAll(".toast")].map((t) => t.textContent) })`);
  log(`во время каста: ${JSON.stringify(mid)}`);
  await sleep(4500); await shot(p, "after", "4_arrived_fort");
  await sleep(1500);
  const pos1 = await p.evaluate(`(() => { const c = window.__game.scene.getScene("game").cameras.main.midPoint; return { x: c.x, y: c.y }; })()`) as { x: number; y: number };
  log(`позиция до ${JSON.stringify(pos0)} после ${JSON.stringify(pos1)} перенос=${Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y) > 500}`);
  await p.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const lock = path.resolve("tools/out/scenario.lock");
  for (let k = 0; ; k++) { try { fs.mkdirSync(lock); break; } catch { if (k > 240) throw new Error("замок"); await sleep(5000); } }
  try {
    try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* ok */ }
    process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
    const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
    await vite.listen();
    await startServer(true);
    try {
      const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 600000 });
      try { { const w = await newPage(browser, 1366, 768); await w.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" }); await sleep(12000); await w.close(); } try { await run(browser); } catch (e) { log(`FAIL ${(e as Error).message.slice(0,100)}`); for (const x of [...new Set(errors)].slice(0, 10)) log(`  ${x}`); throw e; } log(`ошибки консоли: ${errors.length}`); for (const e of [...new Set(errors)].slice(0, 8)) log(`  ${e}`); } finally { await browser.close(); }
    } finally { await vite.close(); await stopServer(); }
  } finally { try { fs.rmdirSync(lock); } catch { /* ok */ } }
}
main().catch((e) => { console.error(e); process.exit(1); });
