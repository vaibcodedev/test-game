/**
 * Снимки сценок фортов (задача 132, шаг 12): по кадру каждого вида у обоих фортов в tools/out/fort-scenes/.
 * Время клиента (Date.now) сдвигается так, чтобы кадр попал в нужную секунду петли. Сервер в этом же процессе, Vite и Chrome.
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2852"; $env:VITE_TEST_PORT="5252"; npx tsx tools/fort-scenes-shots.ts
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "../tests/harness";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";
import { FORT_SCENES } from "../shared/fortScenes";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5252;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/fort-scenes");
const PASS = "secret";
/** Секунды петли для кадров (с запасом на задержку снимка). */
/** zoom — масштаб камеры на кадр (1 — широкий: виден дальний полёт камня), ox/oy — сдвиг центра кадра от якоря в px (в сторону врага — знак у фракции). */
type Moment = { sec: number; zoom?: number; ox?: number; oy?: number; w?: number; h?: number; wait?: number };
const MOMENT: Record<string, Moment[]> = {
  drill: [{ sec: 2.4 }], smith: [{ sec: 0.4, wait: 300 }], orders: [{ sec: 1.3 }, { sec: 8.3 }],
  catapult: [{ sec: 14.95, wait: 600, oy: -60 }, { sec: 14.95, wait: 2000, zoom: 1, ox: 260, oy: -80, w: 1000, h: 560 }],
};
let page: Page;
const errors: string[] = [];

const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), net = window.__net, a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;
function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
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
  await page.evaluate((t: string, z: number) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v1", String(z)); }, token, zoom);
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
async function snap(cx: number, cy: number, w: number, h: number, period: number, sec: number, zoom: number, wait: number): Promise<PNG> {
  const c = await run<{ url: string; x: number; y: number; z: number }>(`
    const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    const z0 = cam.zoom; cam.stopFollow(); if (a.zoom) cam.setZoom(a.zoom); cam.centerOn(a.cx, a.cy);
    if (!window.__dn) window.__dn = Date.now.bind(Date);
    const real = window.__dn(), per = a.period * 1000, want = a.sec * 1000;
    const off = Math.floor(real / per) * per + want - real + (want < real % per ? per : 0);
    Date.now = () => window.__dn() + off;
    await new Promise((r) => setTimeout(r, a.wait));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const k = cv.width / g.scale.width;
    const out = { url: cv.toDataURL("image/png"), x: (a.cx - cam.worldView.x) * cam.zoom * k, y: (a.cy - cam.worldView.y) * cam.zoom * k, z: cam.zoom * k };
    Date.now = window.__dn;
    cam.setZoom(z0);
    return out;`, { cx, cy, period, sec, zoom, wait });
  const src = PNG.sync.read(Buffer.from(c.url.split(",")[1], "base64"));
  const ww = Math.min(Math.round(w * c.z), src.width), hh = Math.min(Math.round(h * c.z), src.height);
  const x0 = Math.max(0, Math.min(src.width - ww, Math.round(c.x - ww / 2))), y0 = Math.max(0, Math.min(src.height - hh, Math.round(c.y - hh / 2)));
  const out = new PNG({ width: ww, height: hh });
  PNG.bitblt(src, out, x0, y0, ww, hh, 0, 0);
  return out;
}

async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("fort_view", PASS, "Смотритель", "warrior");
  await enter("Смотритель", token, 2);
  const H = heroOf("Смотритель");
  H.team = 1;
  let at = { x: 0, y: 0 };
  const keep = setInterval(() => { if (H.dead) { H.dead = false; H.unit.anim = 0; } H.unit.x = at.x; H.unit.y = at.y; H.moveTo = null; H.unit.hp = H.unit.maxHp; }, 50);
  try {
    for (const s of FORT_SCENES) {
      at = { x: s.x, y: s.y + 240 };
      await sleep(2500); // герой на месте, сценка проснулась
      for (const [i, m] of (MOMENT[s.kind] ?? [{ sec: 1 }]).entries()) {
        const dir = s.fort === "solgard" ? 1 : -1, z = m.zoom ?? 2;
        const shot = await snap(s.x + (m.ox ?? 0) * dir, s.y + (m.oy ?? -20), m.w ?? 380, m.h ?? 260, s.def.period, m.sec, m.zoom ?? 0, m.wait ?? 40);
        fs.writeFileSync(path.join(OUT, `${s.fort}-${s.kind}${i ? "-" + (i + 1) : ""}.png`), PNG.sync.write(shot));
        void z;
      }
    }
  } finally { clearInterval(keep); }
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
  let bad = 0;
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    const warn = errors.filter((e) => !/переподключение|seat reservation|favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|AnimationManager key already exists/i.test(e));
    if (warn.length) { bad++; console.log("ошибки консоли:", warn.slice(0, 5).join(" | ")); }
  } catch (e) { console.log(String((e as Error)?.stack ?? e).slice(0, 1200)); bad++; }
  finally { await browser.close().catch(() => {}); await vite.close().catch(() => {}); }
  console.log(bad ? "\nСбоев: " + bad : "\nСнимки сценок готовы: " + OUT);
  process.exit(bad ? 1 : 0);
}
main();
