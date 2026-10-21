/**
 * Браузерная проверка подписей при переключении настроек (баги от пользователя): после выключения и включения «Ники всех остальных» и «Мой ник»
 * ник возвращается сам, без наведения; при выключенных «Полоски здоровья» и «Моя полоска» ник опускается на место полоски (на 4 px),
 * под курсором (полоска видна) плавно поднимается обратно, без наведения — снова опускается. Зум 3, свой герой и слизень рядом.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2872 VITE_TEST_PORT=5272 npx tsx tests/name-toggle-screens.ts   (Chrome: CHROME_PATH или стандартные пути)
 * Снимки: tools/out/name-toggle/{bars-on,bars-off,bars-off-hover,names-back}-z3.png (вырезка вокруг героя и слизня, ×3)
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5272;
const OUT = path.resolve("tools/out/name-toggle");
const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const sp = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];
const ZOOM = 3;

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const scene = "(window.__game.scene.getScene('game'))";

async function enter(browser: Browser, name: string): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  await page.evaluateOnNewDocument((z) => { try { localStorage.setItem("zoom:v1", String(z)); } catch {} }, ZOOM);
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 15000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
  await sleep(800);
  return page;
}
/** Экранные координаты точки мира. */
const toClient = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = ${scene}, c = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
  return { x: r.left + (${x} - c.worldView.x) * (r.width / c.worldView.width), y: r.top + (${y} - c.worldView.y) * (r.height / c.worldView.height) }; })()`) as Promise<{ x: number; y: number }>;
interface Lab { vis: boolean; y: number; top: number; bar: number }
interface St { me: Lab; sl: Lab; sx: number; sy: number }
/** Ник (виден, низ блока по y) и верх подписи (topY) у своего героя и слизня; bar — есть ли полоска здоровья. */
const state = (page: Page, id: string) => page.evaluate(`(() => { const s = ${scene}, sl = s.units.get(${JSON.stringify(id)}), me = s.me;
  const lab = (v) => ({ vis: v.label.visible, y: v.label.y, top: Math.round(v.topY), bar: v.bar.commandBuffer.length });
  return { me: lab(me), sl: lab(sl), sx: sl.x, sy: sl.y }; })()`) as Promise<St>;
/** Переключить настройку подписи так же, как флажок в настройках (тот же модуль, что у игры). */
const setOv = (page: Page, key: string, on: boolean) => page.evaluate(`import('/src/game/overlay.ts').then((m) => m.setOverlay(${JSON.stringify(key)}, ${on}))`);
const slimeId = (page: Page) => page.evaluate(`(() => { const s = ${scene}; let b = null, bd = 1e9; for (const v of s.units.values()) { if (v.u.sprite !== 'slime' || v.dead) continue; const d = Math.hypot(v.x - s.pos.x, v.y - s.pos.y); if (d < bd) { bd = d; b = v.id; } } return b; })()`) as Promise<string | null>;

/** Ждать, пока cond(state) не станет true (ник сдвигается плавно; под нагрузкой кадров мало — фиксированной паузы мало), не дольше ms. */
async function until(page: Page, id: string, cond: (s: St) => boolean, ms = 6000): Promise<St> {
  let s = await state(page, id);
  for (const t0 = Date.now(); !cond(s) && Date.now() - t0 < ms; s = await state(page, id)) await sleep(150);
  return s;
}

async function run(browser: Browser, errors: string[]) {
  const name = "Подписи";
  await ensureChar(name, "secret", name, "warrior");
  const page = await enter(browser, name);
  page.on("pageerror", (e) => errors.push(String(e)));
  const ok = (s: string) => console.log(`  ok   ${s}`);
  const must: (cond: unknown, msg: string) => asserts cond = (cond, msg) => { if (!cond) throw new Error(msg); };
  await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 10 }); n.send("dbg", { op: "god" }); });
  // герой в 150 px справа от слизня (аггро слизня — 120): боя нет, оба стоят, полоска слизня без наведения скрыта (он цел)
  await page.evaluate(([px, py]) => (window as any).__net.send("dbg", { op: "tp", x: px, y: py }), [sp.x + 150, sp.y - 70]);
  let id: string | null = null;
  for (let i = 0; i < 40 && !id; i++) { await sleep(300); id = await slimeId(page); }
  must(id, "слизень не появился рядом с героем");
  // герой в 150 px слева от слизня на той же высоте: слизень справа от центра экрана, вдали от чата и панелей (над окнами наведения нет)
  const near = await state(page, id);
  await page.evaluate(([px, py]) => (window as any).__net.send("dbg", { op: "tp", x: px, y: py }), [near.sx - 150, near.sy + 4]);
  for (let i = 0; i < 40; i++) {
    const a = await state(page, id); await sleep(400); const b = await state(page, id);
    if (Math.hypot(a.sx - b.sx, a.sy - b.sy) < 1 && i > 1) break;
  }
  // мышь в угол — никого не наводим
  await page.mouse.move(5, 5);
  await sleep(600);
  /** Вырезка вокруг героя и слизня (с подписями), ×2. */
  const clip = async (file: string) => {
    // камера догоняет героя после телепорта плавно: снимаем, когда она встала
    const cam = () => page.evaluate(`(() => { const c = ${scene}.cameras.main; return c.scrollX + "," + c.scrollY; })()`);
    for (let i = 0, prev = ""; i < 30; i++) { const c = await cam(); if (c === prev) break; prev = c as string; await sleep(200); }
    const s = await state(page, id!);
    const me = (await page.evaluate(`(() => { const m = ${scene}.me; return { x: m.x, y: m.y }; })()`)) as { x: number; y: number };
    const a = await toClient(page, Math.min(s.sx, me.x) - 34, Math.min(s.sy, me.y) - 62);
    const b = await toClient(page, Math.max(s.sx, me.x) + 34, Math.max(s.sy, me.y) + 8);
    await page.screenshot({ path: path.join(OUT, file), clip: { x: Math.max(0, a.x), y: Math.max(0, a.y), width: b.x - a.x, height: b.y - a.y, scale: 2 } });
  };

  // 1. всё включено: ник над полоской (4 px зазора от верха подписи)
  for (const k of ["selfNames", "selfBars", "names", "bars"]) await setOv(page, k, true);
  const on = await until(page, id!, (s) => s.me.top - s.me.y === 4 && s.sl.top - s.sl.y === 4);
  must(on.me.vis && on.sl.vis, "ники видны при включённых настройках");
  must(on.me.top - on.me.y === 4 && on.sl.top - on.sl.y === 4, `ник на 4 px выше верха подписи (герой ${on.me.top - on.me.y}, слизень ${on.sl.top - on.sl.y})`);
  ok("всё включено: ники видны, зазор под полоску 4 px");
  await clip(`bars-on-z${ZOOM}.png`);

  // 2. полоски выключены: ник опускается на место полоски — у себя и у остальных
  await setOv(page, "selfBars", false);
  await setOv(page, "bars", false);
  const off = await until(page, id!, (s) => s.me.top - s.me.y === 0 && s.sl.top - s.sl.y === 0);
  must(off.me.top - off.me.y === 0 && off.sl.top - off.sl.y === 0, `ник опустился на место полоски (герой ${off.me.top - off.me.y}, слизень ${off.sl.top - off.sl.y})`);
  must(off.me.bar === 0, "своей полоски нет при выключенной «Моя полоска»");
  ok("полоски выключены: ник опустился на 4 px у героя и у слизня");
  await clip(`bars-off-z${ZOOM}.png`);

  // 3. под курсором у слизня видна полоска — ник плавно поднимается; курсор ушёл — опускается.
  // Слизень бродит: наводим на центр тела по свежей позиции, пока он не окажется под курсором
  let hov: St | null = null;
  for (let i = 0; i < 20 && !hov; i++) {
    const s = await state(page, id!);
    const body = await toClient(page, s.sx, s.sy - 12);
    await page.mouse.move(body.x, body.y);
    await sleep(250);
    if ((await page.evaluate(`${scene}.hoverId`)) === id) hov = await until(page, id!, (s) => s.sl.top - s.sl.y === 4);
  }
  must(hov, "слизень не наводится курсором");
  must(hov.sl.bar > 0, "под курсором у слизня видна полоска");
  must(hov.sl.top - hov.sl.y === 4, `под курсором ник поднялся над полоской (зазор ${hov.sl.top - hov.sl.y})`);
  ok("под курсором: полоска видна, ник поднялся на 4 px");
  await clip(`bars-off-hover-z${ZOOM}.png`);
  await page.mouse.move(5, 5);
  const back = await until(page, id!, (s) => s.sl.top - s.sl.y === 0);
  must(back.sl.top - back.sl.y === 0, `без курсора ник снова опустился (зазор ${back.sl.top - back.sl.y})`);
  ok("курсор ушёл: ник снова на месте полоски");

  // 4. ники выключены и включены обратно: возвращаются сами, без наведения
  await setOv(page, "selfNames", false);
  await setOv(page, "names", false);
  const hid = await until(page, id!, (s) => !s.me.vis && !s.sl.vis);
  must(!hid.me.vis && !hid.sl.vis, "ники спрятаны при выключенных настройках");
  await setOv(page, "selfNames", true);
  await setOv(page, "names", true);
  const ret = await until(page, id!, (s) => s.me.vis && s.sl.vis);
  must(ret.me.vis && ret.sl.vis, `ники вернулись после включения (герой ${ret.me.vis}, слизень ${ret.sl.vis})`);
  ok("ники выключены и включены: вернулись у героя и у слизня");
  for (const k of ["selfBars", "bars"]) await setOv(page, k, true);
  const fin = await until(page, id!, (s) => s.me.top - s.me.y === 4);
  await clip(`names-back-z${ZOOM}.png`);
  must(fin.me.top - fin.me.y === 4, "полоски включены обратно: ник снова над полоской");
  ok("полоски включены обратно: ник над полоской");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  // fs.strict: false — прогон из git worktree, где node_modules — ссылка на основное дерево (шрифты лежат вне корня)
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] }, fs: { strict: false } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  try {
    await startServer(true);
    await run(browser, errors);
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("name-toggle-screens: готово, снимки в " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
