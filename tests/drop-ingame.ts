/** Выброс предметов в игре: меню ПКМ, подтверждение, мешок на земле. Запуск: замок tools/out/scenario.lock2; TEST_PORT, VITE_TEST_PORT. Выход — tools/out/drop/. */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5269;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/drop");
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
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
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


const shot = async (name: string) => { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, name) }); };
async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const token = await ensureChar("drop_view", PASS, "Дроп", "warrior");
  for (const zoom of [2]) {
    await enter("Дроп", token, zoom);
    await run("net.send('dbg', { op: 'calm' }); net.send('dbg', { op: 'item', base: 'ring', ilvl: 12, rarity: 2 }); for (let i = 0; i < 6; i++) net.send('dbg', { op: 'item', base: 'hp_potion' }); net.send('dbg', { op: 'gold', v: 500 });");
    await sleep(800);
    await page.keyboard.press("i");
    await sleep(800);
    const cells = await page.$$eval(".win:not([hidden]) .grid .cell", (l) => l.map((c, i) => (c.querySelector("img") ? i : -1)).filter((i) => i >= 0));
    check(cells.length > 0, `в сумке есть вещи: ${cells.length}`);
    const ring = await page.$$eval(".win:not([hidden]) .grid .cell", (l) => l.findIndex((c) => c.classList.contains("r2")));
    const cell = (await page.$$(".win:not([hidden]) .grid .cell"))[ring];
    const bb = (await cell.boundingBox())!;
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: "right" });
    await sleep(300);
    check(!!(await page.$(".dmenu")), "меню ПКМ появилось");
    await shot(`menu-z${zoom}.png`);
    await page.$eval(".dmenu-i", (b) => (b as HTMLElement).click());
    await sleep(400);
    check(!!(await page.$(".drop-dlg")), "окно подтверждения (эпик) появилось");
    await shot(`confirm-z${zoom}.png`);
    await page.$eval("[data-ok]", (b) => (b as HTMLElement).click());
    await sleep(1500);
    const n = await run<number>("return sc.bagViews.size");
    check(n >= 1, `мешок на земле: ${n}`);
    const pos = await run<{ x: number; y: number } | null>(`
      const cam = sc.cameras.main, r = window.__game.canvas.getBoundingClientRect(), k = cam.zoom * r.width / cam.width;
      const img = [...sc.bagViews.values()][0]; if (!img) return null;
      return { x: r.left + (img.x - cam.worldView.x) * k, y: r.top + (img.y - 8 - cam.worldView.y) * k };`);
    if (pos) { await page.keyboard.press("i"); await page.mouse.move(60, 400); await sleep(400); await page.mouse.move(pos.x - 40, pos.y - 20, { steps: 5 }); await sleep(100); await page.mouse.move(pos.x, pos.y - 6, { steps: 5 }); await sleep(900); }
    await shot(`bag-z${zoom}.png`);
    check(!!(await page.$(".lr:not([hidden]) .lr-it")), "ряд иконок над мешком виден");
    // золото
    await run("net.send('drop', { gold: 120 });");
    await sleep(1200);
    await page.mouse.move(pos ? pos.x + 3 : 600, pos ? pos.y + 3 : 400);
    await sleep(900);
    await shot(`gold-z${zoom}.png`);
  }
}

async function main() {
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
  console.log(bad ? `\nСбоев: ${bad}` : "\nВыброс в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
