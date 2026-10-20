/**
 * Браузерная проверка режимов прицела (задача 115, шаг 10): «Быстрый» (каст сразу) и «С подтверждением»
 * (клавиша → прицел → ЛКМ; отмена ПКМ или Esc), клик по слоту панели в каждом режиме.
 * Запуск: TEST_PORT=2798 VITE_TEST_PORT=5198 npx tsx tests/aim-modes-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5198;
const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const sp = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const sent = (page: Page, type: string) => page.evaluate((t) => ((window as any).__sent as [string, any][]).filter((m) => m[0] === t).map((m) => m[1]), type);
const clear = (page: Page) => page.evaluate(() => { (window as any).__sent.length = 0; });
const scene = "(window.__game.scene.getScene('game'))";

async function enter(browser: Browser, name: string, mode: string): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  await page.evaluateOnNewDocument((m) => { try { localStorage.setItem("mouse:v1", JSON.stringify({ aimMode: m })); } catch {} }, mode);
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 15000 }).catch(async (e) => { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 400)); throw e; });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
  await sleep(800);
  await page.evaluate(() => {
    const w = window as any, net = w.__net, orig = net.send.bind(net);
    w.__sent = [];
    net.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); };
  });
  return page;
}
/** Экранные координаты точки мира. */
const toClient = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = ${scene}, c = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
  return { x: r.left + (${x} - c.worldView.x) * (r.width / c.worldView.width), y: r.top + (${y} - c.worldView.y) * (r.height / c.worldView.height) }; })()`) as Promise<{ x: number; y: number }>;
const state = (page: Page) => page.evaluate(`(() => { const s = ${scene}; return { x: s.pos.x, y: s.pos.y, target: s.targetId, aim: s.aimState ? s.aimState.id : null, cur: s.cameras.main.getWorldPoint(s.input.activePointer.x, s.input.activePointer.y), ui: s.overUi }; })()`) as Promise<{ x: number; y: number; target: string | null; aim: string | null; cur: { x: number; y: number }; ui: boolean }>;
const keyFor = async (page: Page, skill: string) => {
  const i = await page.evaluate((id) => (window as any).__net.self.bars[0].findIndex((r: any) => r && r.s === id), skill);
  if (i < 0) throw new Error("умения нет на панели: " + skill);
  const label = await page.$eval(`.hb-slot[data-bar="0"][data-i="${i}"] kbd`, (e) => e.textContent ?? "");
  return /^\d$/.test(label) ? `Digit${label}` : `Key${label}`;
};

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("МетеорБ", "secret", "МетеорБ", "mage");
  await ensureChar("МетеорП", "secret", "МетеорП", "mage");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1280, height: 800 } });
  const ok = (s: string) => console.log("  ok   " + s);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  const errors: string[] = [];
  try {
    const quick = await enter(browser, "МетеорБ", "quick");
    const conf = await enter(browser, "МетеорП", "confirm");
    for (const p of [quick, conf]) {
      p.on("pageerror", (e) => errors.push(String(e)));
      await p.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 99 }); n.send("dbg", { op: "god" }); });
      await p.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [sp.x + 150, sp.y - 70]);
    }
    await sleep(1500);
    for (const p of [quick, conf]) {
      for (const id of ["frostnova", "blink", "meteor"]) { await p.evaluate((i) => (window as any).__net.send("learn", { id: i }), id); await sleep(250); }
      await p.waitForFunction(() => (window as any).__net.self.skills.meteor && (window as any).__net.self.bars[0].some((r: any) => r && r.s === "meteor"), { timeout: 5000 });
    }
    await sleep(2500);
    const slotOf = async (p: Page) => p.evaluate(() => (window as any).__net.self.bars[0].findIndex((r: any) => r && r.s === "meteor"));
    const around = async (p: Page, dx: number, dy: number) => { const me = await state(p); const c = await toClient(p, me.x + dx, me.y + dy); await p.mouse.move(c.x, c.y, { steps: 4 }); await sleep(300); return me; };

    // ---- «Быстрый»: клавиша кастует сразу, прицела нет ----
    let me = await around(quick, 120, 30);
    const qk = await keyFor(quick, "meteor");
    await clear(quick);
    await quick.keyboard.down(qk as any);
    await sleep(250);
    must((await state(quick)).aim === null, "быстрый: появился прицел");
    let c = await sent(quick, "skill");
    must(c.length === 1 && c[0].id === "meteor" && Math.hypot(c[0].x - (me.x + 120), c[0].y - (me.y + 30)) < 14, "быстрый: каст не ушёл сразу в курсор: " + JSON.stringify(c) + " me=" + JSON.stringify(me) + " st=" + JSON.stringify(await state(quick)));
    await quick.keyboard.up(qk as any);
    await sleep(200);
    must((await sent(quick, "skill")).length === 1, "быстрый: отпускание клавиши дало второй каст");
    ok("быстрый: клавиша кастует сразу в курсор, без прицела");
    await clear(quick);
    await quick.click(`.hb-slot[data-bar="0"][data-i="${await slotOf(quick)}"]`);
    await sleep(250);
    c = await sent(quick, "skill");
    must(c.length === 1 && c[0].id === "meteor" && (await state(quick)).aim === null, "быстрый: клик по слоту не скастовал сразу: " + JSON.stringify(c));
    ok("быстрый: клик по слоту кастует сразу");

    // ---- «С подтверждением» ----
    me = await around(conf, 110, 20);
    const ck = await keyFor(conf, "meteor");
    await clear(conf);
    await conf.keyboard.down(ck as any);
    await conf.keyboard.up(ck as any);
    await sleep(250);
    must((await state(conf)).aim === "meteor", "подтверждение: нет прицела после нажатия");
    must(!(await sent(conf, "skill")).length, "подтверждение: каст ушёл без ЛКМ");
    await conf.mouse.click(...(Object.values(await toClient(conf, me.x + 110, me.y + 20)) as [number, number]));
    await sleep(300);
    c = await sent(conf, "skill");
    must(c.length === 1 && c[0].id === "meteor" && Math.hypot(c[0].x - (me.x + 110), c[0].y - (me.y + 20)) < 14, "подтверждение: ЛКМ не скастовал в курсор: " + JSON.stringify(c));
    must((await state(conf)).aim === null, "подтверждение: прицел остался после каста");
    ok("с подтверждением: клавиша -> прицел -> ЛКМ кастует в курсор");

    // отмена ПКМ
    await clear(conf);
    await conf.keyboard.press(ck as any);
    await sleep(150);
    must((await state(conf)).aim === "meteor", "подтверждение: нет прицела перед отменой ПКМ");
    await conf.mouse.click(600, 400, { button: "right" });
    await sleep(250);
    must((await state(conf)).aim === null && !(await sent(conf, "skill")).length, "подтверждение: ПКМ не отменил прицел или ушёл каст");
    ok("с подтверждением: ПКМ отменяет прицел без каста");
    // отмена Esc
    await conf.keyboard.press(ck as any);
    await sleep(150);
    must((await state(conf)).aim === "meteor", "подтверждение: нет прицела перед Esc");
    await conf.keyboard.press("Escape");
    await sleep(150);
    must((await state(conf)).aim === null && !(await sent(conf, "skill")).length, "подтверждение: Esc не отменил прицел или ушёл каст");
    ok("с подтверждением: Esc отменяет прицел без каста");
    // клик по слоту
    const sel = `.hb-slot[data-bar="0"][data-i="${await slotOf(conf)}"]`;
    await conf.click(sel);
    await sleep(250);
    must((await state(conf)).aim === "meteor" && !(await sent(conf, "skill")).length, "подтверждение: клик по слоту не включил прицел");
    await conf.mouse.click(...(Object.values(await toClient(conf, me.x + 90, me.y + 10)) as [number, number]));
    await sleep(300);
    c = await sent(conf, "skill");
    must(c.length === 1 && c[0].id === "meteor", "подтверждение: слот -> ЛКМ не скастовал: " + JSON.stringify(c));
    ok("с подтверждением: клик по слоту -> прицел -> ЛКМ кастует");

    must(!errors.length, "ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("aim-modes-screens: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
