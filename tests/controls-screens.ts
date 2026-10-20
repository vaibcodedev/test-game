/**
 * Браузерная проверка «Цель ≠ атака» (задача 115, шаг 2), схема «Экшен» по умолчанию:
 * Tab выбирает и не пуллит; ПКМ по врагу атакует; ЛКМ по земле цель не снимает и не двигает; ПКМ по земле двигает.
 * Запуск: TEST_PORT=2797 npx tsx tests/controls-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5197;
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
const me = (page: Page) => page.evaluate(() => { const n = (window as any).__net; const p = n.room.state.players.get(n.id); return { x: p.x as number, y: p.y as number, target: p.target as string }; });
const mobs = (page: Page) => page.evaluate(() => { const out: any[] = []; (window as any).__net.room.state.mobs.forEach((m: any, id: string) => out.push({ id, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, sprite: m.sprite, anim: m.anim })); return out; });
/** Экран точки мира. */
const toScreen = (page: Page, wx: number, wy: number) => page.evaluate(([x, y]) => {
  const s = (window as any).__game.scene.getScene("game"), c = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
  return { x: r.left + (x - c.worldView.x) * c.zoom * (r.width / s.scale.width), y: r.top + (y - c.worldView.y) * c.zoom * (r.height / s.scale.height) };
}, [wx, wy]);

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("Цели", "secret", "Цели", "warrior");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  const ok = (s: string) => console.log("  ok   " + s);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  const errors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#login-name");
    await page.type("#login-name", "Цели");
    await page.type("#login-pass", "secret");
    await page.click("#login-go");
    await page.waitForSelector('.cs-slot[data-name="Цели"]', { timeout: 10000 });
    await page.$eval('.cs-slot[data-name="Цели"]', (b) => (b as HTMLElement).click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 30000 });
    await sleep(1000);
    await page.evaluate(() => {
      const w = window as any, net = w.__net, orig = net.send.bind(net);
      w.__sent = [];
      net.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); };
      net.send("dbg", { op: "level", v: 10 });
      net.send("dbg", { op: "god" });
    });
    await page.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [sp.x + 150, sp.y]);
    await sleep(1500);
    const scheme = await page.evaluate(() => (JSON.parse(localStorage.getItem("keybinds:v1") ?? "null")?.preset) ?? "(по умолчанию)");
    must(await page.evaluate(() => (window as any).__game.scene.getScene("game").constructor && true), "сцена");
    ok("схема по умолчанию: " + scheme);

    // Tab: выбор без подхода и атаки (в «Экшене» Tab не занят)
    const p0 = await me(page);
    const near = (await mobs(page)).filter((m) => m.sprite === "slime" && m.anim !== 4 && Math.hypot(m.x - p0.x, m.y - p0.y) < 420).sort((a, b) => Math.hypot(a.x - p0.x, a.y - p0.y) - Math.hypot(b.x - p0.x, b.y - p0.y));
    must(near.length, "нет слизней рядом");
    await clear(page);
    await page.keyboard.press("Tab");
    await sleep(1800);
    const p1 = await me(page);
    must((await sent(page, "target")).length === 1 && p1.target, "Tab не выбрал цель: " + JSON.stringify(await sent(page, "target")));
    must(Math.hypot(p1.x - p0.x, p1.y - p0.y) < 5, "Tab повёл героя к цели");
    const picked = (await mobs(page)).find((m) => m.id === p1.target)!;
    must(picked.hp === picked.maxHp, "Tab атаковал");
    ok("Tab выбирает цель, герой стоит, моб цел");

    // ЛКМ по земле: цель на месте, moveTo не отправлен
    await clear(page);
    const g = await toScreen(page, p1.x - 90, p1.y + 40);
    await page.mouse.click(g.x, g.y, { button: "left" });
    await sleep(600);
    must((await sent(page, "moveTo")).length === 0, "ЛКМ по земле двигает героя");
    must((await sent(page, "target")).length === 0 && (await me(page)).target === p1.target, "ЛКМ по земле снял цель");
    ok("ЛКМ по земле: цель не снята, герой не двинулся");

    // ПКМ по земле: движение, цель сохраняется
    const g2 = await toScreen(page, p1.x - 90, p1.y + 40);
    await page.mouse.click(g2.x, g2.y, { button: "right" });
    await sleep(1200);
    must((await sent(page, "moveTo")).length === 1, "ПКМ по земле не двигает");
    must((await me(page)).target === p1.target, "ПКМ по земле снял цель");
    ok("ПКМ по земле: moveTo, цель сохранена");

    // ПКМ по врагу: attack, моб получает урон
    await clear(page);
    const cur = (await mobs(page)).find((m) => m.id === p1.target)!;
    const e = await toScreen(page, cur.x, cur.y - 10);
    await page.mouse.click(e.x, e.y, { button: "right" });
    await sleep(300);
    must((await sent(page, "attack")).length === 1, "ПКМ по врагу не шлёт attack: " + JSON.stringify(await sent(page, "attack")));
    await page.waitForFunction((id) => { const m = (window as any).__net.room.state.mobs.get(id); return !m || m.anim === 4 || m.hp < m.maxHp; }, { timeout: 10000 }, p1.target);
    ok("ПКМ по врагу: attack, герой подошёл и ударил");
    must(!errors.length, "ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("controls-screens: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
