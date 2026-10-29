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

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5351, OUT = path.resolve("tools/out/wboss-ui");
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

async function pass(browser: Browser, w: number, h: number) {
  const tag = String(w);
  const p = await newPage(browser, w, h);
  await login(p, `Колоссов${w}`, "warrior");
  await dbg(p, { op: "level", v: 100 }); await sleep(600);
  await dbg(p, { op: "god" });
  await zoom2(p);
  const herald = RAID_HERALDS.find((q) => q.id.endsWith("ember")) ?? RAID_HERALDS[0];
  await dbg(p, { op: "tp", x: herald.x, y: herald.y + 40 }); await sleep(1200);
  await dbg(p, { op: "wboss", act: "reset" }); await sleep(800);
  await key(p, "KeyJ"); await sleep(1200); await shot(p, tag, "01_sleep_window");
  await closeAll(p);
  await dbg(p, { op: "wboss", act: "soon", ms: 10 * MIN }); await sleep(1500);
  await shot(p, tag, "02_soon_say");
  await send(p, "wboss:join", {}); await sleep(1000);
  await key(p, "KeyJ"); await sleep(1200); await shot(p, tag, "03_soon_window");
  await closeAll(p);
  await openMap(p); await sleep(1000); await shot(p, tag, "04_worldmap_soon");
  await closeAll(p);
  await dbg(p, { op: "wboss", act: "start" }); await sleep(1800);
  await shot(p, tag, "05_alive_far");
  await openMap(p); await sleep(1000); await shot(p, tag, "06_worldmap_alive");
  await closeAll(p);
  const st = await p.evaluate(`(() => { const v = window.__wbView; const s = v ? [...v.states.values()][0] : null; return s ? { x: s.s.x, y: s.s.y } : null; })()`) as { x: number; y: number } | null;
  const pos = st ?? { x: 550.5 * 32, y: 245.5 * 32 };
  await dbg(p, { op: "tp", x: pos.x + 160, y: pos.y + 160 }); await sleep(2500);
  // мой вклад — то же сообщение, что шлёт сервер раз в секунду в бою (бить босса вручную долго)
  await p.evaluate(`window.__net.emit("wboss:me", { id: "colossus", v: 41250, tier: "bronze", next: 120000, rank: 9 })`);
  await sleep(700); await shot(p, tag, "07_bar_contrib");
  await dbg(p, { op: "wboss", act: "kill" }); await sleep(3500);
  // герой без удара в круге не попадает в вклад — тогда итог приходит синтетикой (то же сообщение, что шлёт сервер)
  if (!(await p.$(".wb-result"))) {
    const rows = (names: string[], cls: string, base: number) => names.map((n, i) => ({ name: n, cls, faction: i % 2 ? "umbrath" : "solgard", v: base - i * 9000 }));
    const msg = {
      boss: "colossus", win: "solgard",
      me: { v: 184200, tier: "silver", marks: 120, xp: 54000, items: ["Наплечники Пепельного Знамени"], locked: false, titles: [], frame: "", trophy: [] },
      entry: { boss: "colossus", name: "Колосс Пепельного Знамени", at: Date.now(), durationMs: 421000, win: "solgard", totals: [812000, 604000], heroes: 38, last: "Бран",
        top: { dmg: rows(["Бран", "Тельва", "Орс", "Мирра", "Кай"], "warrior", 90000), heal: rows(["Лиин", "Сорн"], "healer", 60000), tank: rows(["Хрон"], "warrior", 70000) } },
    };
    await p.evaluate((m) => (window as any).__net.emit("wboss:result", m), msg);
    await sleep(800);
  }
  await shot(p, tag, "08_result");
  await closeAll(p);
  await key(p, "KeyJ"); await sleep(600);
  await p.evaluate(`document.querySelector('.win-muster .tab[data-tab="chron"]').click()`); await sleep(1000);
  await shot(p, tag, "09_chronicle");
  await dbg(p, { op: "tp", x: herald.x, y: herald.y + 40 }); await sleep(800);
  await p.evaluate(`document.querySelector('.win-muster .tab[data-tab="raid"]').click()`); await sleep(1000);
  await shot(p, tag, "10_raid_tab");
  await p.close();
}

async function montage(browser: Browser) {
  const img = (f: string) => fs.existsSync(f) ? `<img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}">` : `<div class="none">нет</div>`;
  const body = SIZES.map(([w]) => `<h1>${w}</h1><div class="g">${NAMES.map((n) => `<figure>${img(path.join(OUT, `${w}_${n}.png`))}<figcaption>${n}</figcaption></figure>`).join("")}</div>`).join("");
  const html = `<html><head><meta charset="utf-8"><style>body{margin:0;padding:8px;background:#0e0c12;color:#efe6d2;font:14px sans-serif}h1{color:#d6a84b;margin:6px 0}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}figure{margin:0}img{width:100%;display:block}figcaption{color:#b8b0c0;font-size:12px}.none{height:200px;background:#18151e}</style></head><body>${body}</body></html>`;
  const page = await newPage(browser, 1600, 900);
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: path.join(OUT, "montage.png") as `${string}.png`, fullPage: true });
  await page.close();
}

async function main() {
  const chromeArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1920,1080", "--no-sandbox"];
  if (process.env.MONTAGE) {
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: chromeArgs });
    try { await montage(browser); } finally { await browser.close(); }
    return;
  }
  const lock = await acquire();
  try {
    try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* ok */ }
    process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
    await startServer(true, {});
    const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
    await vite.listen();
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: chromeArgs, defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
    try {
      { const w = await newPage(browser, 1366, 768); await w.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" }); await sleep(12000); await w.close(); }
      for (const [w, h] of SIZES) await pass(browser, w, h);
      await montage(browser);
      log(`ошибок консоли: ${errors.length}`); for (const e of [...new Set(errors)].slice(0, 8)) log(`  ${e}`);
    } finally { await browser.close(); await vite.close(); await stopServer(); }
  } finally { try { fs.unlinkSync(lock); } catch { /* ok */ } }
}
setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 40 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
