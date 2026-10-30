/** Выброс предметов в игре: меню ПКМ, подтверждение, мешок на земле. Запуск: замок tools/out/scenario.lock2; TEST_PORT, VITE_TEST_PORT. Выход — tools/out/loot-hint/. */
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { nightLevel } from "../shared/daynight";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5269;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/loot-hint");
const PASS = "secret";
const DX = 72;

let page: Page;
const errors: string[] = [];
const lines: string[] = [];
let bad = 0;
const check = (ok: boolean, msg: string) => { lines.push(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; console.log(lines[lines.length - 1]); };
const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), net = window.__net, a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const busy = (port: number) => new Promise<boolean>((res) => { const c = net.createConnection({ port, host: "127.0.0.1" }); c.once("connect", () => { c.destroy(); res(true); }); c.once("error", () => res(false)); });

let W: () => World;
let heroOf: (name: string) => Player;
async function startServer() {
  if (await busy(PORT)) throw new Error(`порт ${PORT} занят: задайте свободный TEST_PORT`);
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
  Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1", VITE_SERVER_URL: `ws://localhost:${PORT}` });
  await import("../server/src/index");
  const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
  W = () => WorldRoom.instance!.world;
  heroOf = (name) => W().findByName(name.toLowerCase())!;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch {} await sleep(150); }
  throw new Error("сервер не ответил");
}

async function enter(name: string, token: string, zoom: number) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0", timeout: 120000 });
  await page.evaluate((t: string, z: number) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v2", String(z)); }, token, zoom);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 50000, polling: 250 });
  await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 50000, polling: 250 });
  await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 40000, polling: 250 });
  await sleep(1500);
}


const shot = async (name: string, clip?: { x: number; y: number; width: number; height: number }) => { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, name), clip }); };
const item = (r: number) => ({ uid: "x" + r, base: "ring", ilvl: 10, rarity: r, stats: {} });
async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const token = await ensureChar("loothint", PASS, "Лут", "warrior");
  let nightShift = 0;
  for (let h = 0; h < 48 * 3600e3; h += 60e3) if (nightLevel(Date.now() + h) >= 1) { nightShift = h; break; }
  let dayShift = 0;
  for (let h = 0; h < 48 * 3600e3; h += 60e3) if (nightLevel(Date.now() + h) <= 0 && nightLevel(Date.now() + h + 3600e3) <= 0) { dayShift = h; break; }
  for (const zoom of [2, 3]) {
    await enter("Лут", token, zoom);
    await run("net.send('dbg', { op: 'calm' });");
    for (const [tn, shift] of [["day", dayShift], ["night", nightShift]] as const) {
      await page.evaluate((s: number) => { (window as any).__dshift = s; }, shift);
      await sleep(900);
      const cases: any[] = [
        { n: "one", items: [{ uid: "a1", base: "ring", ilvl: 10, rarity: 2, stats: {}, name: "Кольцо Пепла" }] },
        { n: "three", items: [0, 1, 3].map((r) => ({ uid: "b" + r, name: ["Простое кольцо","Кольцо стража","","Перстень Бездны"][r], base: "ring", ilvl: 10, rarity: r, stats: {} })) },
        { n: "stack", gold: 125, items: [{ uid: "c1", name: "Серебряное кольцо", base: "ring", ilvl: 10, rarity: 1, stats: {} }, { uid: "c2", name: "Малое зелье", base: "hp_potion", ilvl: 1, rarity: 0, stats: {}, qty: 5 }] },
        { n: "foreign", lock: 42, items: [{ uid: "d1", name: "Клинок Пепельного Предела", base: "ring", ilvl: 10, rarity: 3, stats: {} }, { uid: "d2", name: "Кольцо стража", base: "ring", ilvl: 10, rarity: 2, stats: {} }] },
        { n: "many", gold: 40, items: [0, 1, 2, 3, 1, 2].map((r, i) => ({ uid: "e" + i, name: "Кольцо №" + (i + 1), base: "ring", ilvl: 10, rarity: r, stats: {} })) },
      ];
      for (const c of cases) {
        await run(`const p = sc.pos; sc.syncBags([{ id: 'fx1', x: p.x + 20, y: p.y + 40, items: a.items, gold: a.gold, lock: a.lock }]);`, c);
        await sleep(1800);
        const pt = await run<any>(`const cam = sc.cameras.main, r = window.__game.canvas.getBoundingClientRect(), k = cam.zoom * r.width / cam.width, img = sc.bagViews.get('fx1'); return { x: r.left + (img.x - cam.worldView.x) * k, y: r.top + (img.y - 8 - cam.worldView.y) * k };`);
        await page.mouse.move(pt.x - 30, pt.y - 30); await page.mouse.move(pt.x, pt.y, { steps: 4 });
        await sleep(1200);
        const hov = await run<boolean>(`return !!document.querySelector('.lr:not([hidden])');`);
        check(hov, `${c.n} ${tn} z${zoom}: карточка видна`);
        const tips = await run<number>(`return document.querySelectorAll('.interact-tip.show').length;`);
        check(tips <= 1, `${c.n}: плашка G одна (${tips})`);
        await shot(`${c.n}-${tn}-z${zoom}.png`);
        if (c.n === "three" && tn === "day") {
          const row = await page.$(".lr .lr-it:nth-child(2)");
          if (row) { await row.hover(); await sleep(400); await shot(`three-card-z${zoom}.png`); }
        }
        await page.mouse.move(5, 5); await sleep(600);
      }
      await run(`sc.syncBags([]);`); await sleep(500);
    }
    await page.evaluate(() => { (window as any).__dshift = 0; });
  }
}

async function main() {
  const lock = path.join("tools", "out", "scenario.lock2");
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
  try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
  try { await main2(); } finally { fs.rmSync(lock, { force: true }); }
}
async function main2() {
  await startServer();
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      (window as any).__name = (t: unknown) => t;
      const real = Date.now.bind(Date);
      (window as any).__realNow = real; (window as any).__dshift = 0;
      Date.now = () => real() + (window as any).__dshift;
    });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|AnimationManager key already exists/i.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    lines.push(`EXC ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
    console.log(lines[lines.length - 1]);
    bad++;
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nЭффекты добычи: снимки готовы");
  process.exitCode = bad ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => process.exit());
