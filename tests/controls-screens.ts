/**
 * Браузерная проверка шагов 7–8 «Управления»: подсказка взаимодействия у NPC, строка ошибок «Слишком далеко», золотая рамка очереди.
 * Запуск: TEST_PORT=2680 VITE_TEST_PORT=5280 npx tsx tests/controls-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5280;
const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const sp = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const scene = "(window.__game.scene.getScene('game'))";

async function enter(browser: Browser, name: string, opts: object): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  await page.evaluateOnNewDocument((o) => { try { localStorage.setItem("mouse:v1", JSON.stringify(o)); } catch {} }, opts);
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
const keyFor = async (page: Page, skill: string) => {
  const i = await page.evaluate((id) => (window as any).__net.self.bars[0].findIndex((r: any) => r && r.s === id), skill);
  if (i < 0) throw new Error("умения нет на панели: " + skill);
  const label = await page.$eval(`.hb-slot[data-bar="0"][data-i="${i}"] kbd`, (e) => e.textContent ?? "");
  return /^\d$/.test(label) ? `Digit${label}` : `Key${label}`;
};
const tp = (page: Page, x: number, y: number) => page.evaluate(([a, b]) => (window as any).__net.send("dbg", { op: "tp", x: a, y: b }), [x, y]);

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("УправВ", "secret", "УправВ", "warrior");
  await ensureChar("УправМ", "secret", "УправМ", "mage");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1280, height: 800 } });
  const ok = (s: string) => console.log("  ok   " + s);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  const errors: string[] = [];
  try {
    const war = await enter(browser, "УправВ", { approach: false, aimMode: "quick" });
    const mage = await enter(browser, "УправМ", { aimMode: "quick" });
    for (const p of [war, mage]) {
      p.on("pageerror", (e) => errors.push(String(e)));
      await p.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 20 }); n.send("dbg", { op: "god" }); });
    }

    // подсказка взаимодействия у торговки
    await tp(war, MAP.merchant.x, MAP.merchant.y + 40);
    await sleep(1200);
    const tip = await war.$eval(".interact-tip", (e) => e.textContent ?? "");
    must(/^\[[^\]]+\] Поговорить: Торговка/.test(tip), "подсказка у NPC: «" + tip + "»");
    ok("подсказка у NPC: " + tip);

    // строка ошибок: враг вне дальности, подход выключен
    await tp(war, sp.x + 450, sp.y);
    await sleep(800);
    const id = await war.evaluate(`(() => { const s = ${scene}; let b = null, bd = 1e9; for (const [id, v] of s.units) { if (!s.isEnemy(v)) continue; const d = Math.hypot(v.x - s.pos.x, v.y - s.pos.y); if (d > 300 && d < bd) { bd = d; b = id; } } return b; })()`);
    must(id, "враг не найден");
    await war.evaluate(`${scene}.setTarget(${JSON.stringify(id)})`);
    await sleep(300);
    const wk = await keyFor(war, "taunt");
    await war.keyboard.press(wk as any);
    await sleep(200);
    const err = await war.$eval(".errline.on", (e) => e.textContent ?? "").catch(() => "");
    if (!err) console.log(await war.evaluate(`(() => { const s = ${scene}; const v = s.units.get(s.targetId); return JSON.stringify({ t: s.targetId, pos: [s.pos.x, s.pos.y], v: v && [v.x, v.y], ap: window.__net.self.skills, text: document.querySelector('.errline')?.textContent, cls: document.querySelector('.errline')?.className }); })()`));
    must(/^Слишком далеко: ещё \d+ кл\.$/.test(err), "строка ошибок: «" + err + "»");
    ok("строка ошибок: " + err);

    // очередь: нажатие за ≤ 400 мс до конца перезарядки — золотая рамка
    await tp(mage, town.x, town.y);
    await sleep(600);
    await mage.evaluate(() => { const w = window as any, n = w.__net, o = n.send.bind(n); w.__sent = []; n.send = (t: string, m?: unknown) => { w.__sent.push([t, JSON.stringify(m), Math.round(performance.now())]); return o(t, m); }; n.room.onMessage("queue", (m: unknown) => w.__sent.push(["Q", JSON.stringify(m), Math.round(performance.now())])); });
    const mk = await keyFor(mage, "fireball");
    await mage.keyboard.press(mk as any);
    // нажатие делаем внутри страницы, чтобы точно попасть в окно очереди
    await mage.evaluate(`(async () => { for (;;) { const left = window.__net.cooldowns.get("fireball") - performance.now(); if (left <= 330) { ${scene}.useSkillId("fireball"); return; } await new Promise((r) => setTimeout(r, 4)); } })()`);
    await sleep(120);
    const queued = await mage.$(".hb-slot.queued");
    if (!queued) console.log(await mage.evaluate(`JSON.stringify({ sent: window.__sent, now: Math.round(performance.now()), q: window.__net.queued, err: document.querySelector('.errline')?.textContent, mp: window.__net.self.mp, me: ${scene}.me.u.mp })`));
    must(queued, "слот в очереди без золотой рамки");
    ok("очередь: слот подсвечен (.queued)");

    must(!errors.length, "ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("controls-screens: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
