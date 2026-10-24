/**
 * Браузерная проверка: ЛКМ берёт узлы добычи и мешки (решение пользователя 2026-10-24; castResolve.pickOrder, docs/controls.md §11), «Экшен», зум 2.
 * 1) ЛКМ по ближайшему узлу добычи — курсор-перчатка и свечение, герой подходит, сервер отмечает узел собранным;
 * 2) ЛКМ по мешку (мешок клиента — картинка в bagViews, сервер о нём не знает) — подход и запрос pickup с его id;
 * 3) ЛКМ по слизню, под которым лежит мешок, — только выбор цели: ни pickup, ни шага, ни атаки.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2879 VITE_TEST_PORT=5279 npx tsx tests/take-screens.ts
 * Снимки: tools/out/take/take-{node,bag}.png
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5279;
const OUT = path.resolve("tools/out/take");
const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const node = MAP.nodes.filter((n) => n.y > 800 && n.x > 800 && n.x < MAP.w * 32 - 800 && n.y < MAP.h * 32 - 800).sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];
const sp = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];
const scene = "(window.__game.scene.getScene('game'))";

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

async function enter(browser: Browser, name: string): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("zoom:v1", "2"); } catch {} });
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
const toClient = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = ${scene}, c = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
  return { x: r.left + (${x} - c.worldView.x) * (r.width / c.worldView.width), y: r.top + (${y} - c.worldView.y) * (r.height / c.worldView.height) }; })()`) as Promise<{ x: number; y: number }>;

async function run(browser: Browser, errors: string[]) {
  const name = "ВзятьА";
  await ensureChar(name, "secret", name, "warrior");
  const page = await enter(browser, name);
  page.on("pageerror", (e) => errors.push(String(e)));
  const ok = (s: string) => console.log(`  ok   ${s}`);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 10 }); n.send("dbg", { op: "god" }); });
  const tp = async (x: number, y: number) => {
    await page.evaluate(([px, py]) => (window as any).__net.send("dbg", { op: "tp", x: px, y: py }), [x, y]);
    for (let i = 0; i < 40; i++) {
      const p = await page.evaluate(`(() => { const s = ${scene}; return [s.pos.x, s.pos.y]; })()`) as number[];
      if (Math.hypot(p[0] - x, p[1] - y) < 40) break;
      await sleep(300);
    }
    await sleep(600);
  };
  await page.evaluate(() => { const w = window as any, n = w.__net, orig = n.send.bind(n); w.__sent = []; n.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); }; });
  const clear = () => page.evaluate(() => { (window as any).__sent.length = 0; });
  const sent = (type: string) => page.evaluate((t) => ((window as any).__sent as [string, any][]).filter((m) => m[0] === t).map((m) => m[1]), type);
  const hover = async (x: number, y: number) => {
    await page.evaluate(`(() => { const c = ${scene}.cameras.main; c.stopFollow(); c.centerOn(${x}, ${y}); })()`);
    await sleep(200);
    const c = await toClient(page, x, y); await page.mouse.move(c.x, c.y, { steps: 3 }); await sleep(250); return c; };
  const state = () => page.evaluate(`(() => { const s = ${scene}; return { cur: s.cursorKind, glow: s.takeGlow.visible, gather: s.pendingGather, pickup: s.pendingPickup, target: s.targetId }; })()`) as Promise<{ cur: string; glow: boolean; gather: number | null; pickup: string | null; target: string | null }>;
  const shot = async (file: string, x: number, y: number) => {
    const c = await toClient(page, x - 40, y - 40);
    await page.screenshot({ path: path.join(OUT, file), clip: { x: Math.max(0, c.x), y: Math.max(0, c.y), width: 160, height: 160, scale: 2 } });
  };

  // 1. узел добычи: герой в 90 px — ЛКМ ведёт к узлу и собирает
  await tp(node.x - 90, node.y + 26);
  must(!(await page.evaluate(`${scene}.depletedNodes.has(${node.id})`)), "узел уже собран");
  let c = await hover(node.x, node.y - 16);
  let st = await state();
  must(st.cur === "take" && st.glow, "над узлом нет перчатки или свечения: " + JSON.stringify(st) + await page.evaluate(`JSON.stringify((() => { const s = ${scene}; return { seen: s.mouseSeen, ui: s.overUi, over: s.input.manager.isOver, m: [s.mouse.x, s.mouse.y], pos: [s.pos.x, s.pos.y], node: ${JSON.stringify(node)}, cn: s.map.nodes.find((q) => q.id === ${node.id}), pick: s.hoverPick.kind, wv: [s.cameras.main.worldView.x, s.cameras.main.worldView.y] }; })())`) + JSON.stringify(c));
  await shot("take-node.png", node.x, node.y - 16);
  await clear();
  await page.mouse.click(c.x, c.y, { button: "left" });
  await sleep(200);
  st = await state();
  must(st.gather === node.id || (await sent("gather")).length, "ЛКМ по узлу не начал сбор: " + JSON.stringify(st));
  for (let i = 0; i < 60 && !(await page.evaluate(`${scene}.depletedNodes.has(${node.id})`)); i++) await sleep(300);
  must(await page.evaluate(`${scene}.depletedNodes.has(${node.id})`), "узел не собран за 18 с; отправлено: " + JSON.stringify(await sent("gather")));
  ok(`ЛКМ по узлу ${node.res}: перчатка, свечение, подход и сбор`);

  // 2. мешок клиента рядом с героем (в 70 px): ЛКМ — подход и pickup с его id
  const me = await page.evaluate(`(() => { const s = ${scene}; return [s.pos.x, s.pos.y]; })()`) as number[];
  const bx = Math.round(me[0] + 70), by = Math.round(me[1]);
  await page.evaluate(`${scene}.bagViews.set('tbag', ${scene}.add.image(${bx}, ${by}, 'o_bag').setOrigin(0.5, 1).setDepth(${by - 1}))`);
  await sleep(600);
  c = await hover(bx, by - 10);
  st = await state();
  must(st.cur === "take" && st.glow, "над мешком нет перчатки или свечения: " + JSON.stringify(st));
  await shot("take-bag.png", bx, by - 10);
  await clear();
  await page.mouse.click(c.x, c.y, { button: "left" });
  for (let i = 0; i < 30 && !(await sent("pickup")).length; i++) await sleep(200);
  const pk = await sent("pickup");
  must(pk.length && pk[0].bag === "tbag", "ЛКМ по мешку не подобрал: " + JSON.stringify(await page.evaluate(() => (window as any).__sent)));
  ok("ЛКМ по мешку: перчатка, свечение, подход и pickup");

  // 3. слизень над мешком: ЛКМ по телу слизня — только выбор
  await tp(sp.x - 150, sp.y);
  let id: string | null = null;
  for (let i = 0; i < 40 && !id; i++) {
    await sleep(300);
    id = await page.evaluate(`(() => { const s = ${scene}; let b = null, bd = 400; for (const v of s.units.values()) { if (v.u.sprite !== 'slime' || v.dead) continue; const d = Math.hypot(v.x - s.pos.x, v.y - s.pos.y); if (d < bd) { bd = d; b = v.id; } } return b; })()`) as string | null;
  }
  must(id, "слизень не появился");
  await page.evaluate(`(() => { const s = ${scene}, v = s.units.get(${JSON.stringify(id)}); window.__hold = { x: v.u.x, y: v.u.y };
    window.__holdT = setInterval(() => { const h = window.__hold; v.u.x = h.x; v.u.y = h.y; }, 5); })()`);
  await sleep(400);
  const v = await page.evaluate(`(() => { const v = ${scene}.units.get(${JSON.stringify(id)}); return [v.x, v.y]; })()`) as number[];
  await page.evaluate(`${scene}.bagViews.set('ubag', ${scene}.add.image(${Math.round(v[0])}, ${Math.round(v[1]) + 2}, 'o_bag').setOrigin(0.5, 1).setDepth(${Math.round(v[1]) + 1}))`);
  await page.evaluate(`(() => { const c = ${scene}.cameras.main; c.stopFollow(); c.centerOn(${v[0]}, ${v[1] - 20}); })()`);
  await sleep(500);
  c = await hover(v[0], v[1] - 10);
  await clear();
  await page.mouse.click(c.x, c.y, { button: "left" });
  await sleep(600);
  st = await state();
  const all = await page.evaluate(() => (window as any).__sent) as [string, any][];
  must(st.target === id, "ЛКМ по слизню над мешком не выбрала его: " + JSON.stringify(st));
  must(!st.pickup && !all.some((m) => m[0] === "pickup" || m[0] === "moveTo" || m[0] === "attack"), "ЛКМ по слизню над мешком подбирает, шагает или атакует: " + JSON.stringify(all));
  ok("ЛКМ по слизню над мешком — только выбор цели");
  await page.evaluate(() => { clearInterval((window as any).__holdT); });
  await page.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
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
  console.log("take-screens: готово, снимки в " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
