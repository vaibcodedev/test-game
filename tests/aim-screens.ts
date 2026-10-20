/**
 * Браузерная проверка прицела (задача 115, шаг 6): лекарь лечит союзника под курсором, не меняя цель;
 * метеор с превью ложится в курсор, зажатый дальностью; Esc отменяет прицел.
 * Запуск: TEST_PORT=2799 VITE_TEST_PORT=5199 npx tsx tests/aim-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5199;
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

async function enter(browser: Browser, name: string): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
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
  await ensureChar("Целитель", "secret", "Целитель", "healer");
  await ensureChar("Метеор", "secret", "Метеор", "mage");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1280, height: 800 } });
  const ok = (s: string) => console.log("  ok   " + s);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  const errors: string[] = [];
  try {
    const healer = await enter(browser, "Целитель");
    const mage = await enter(browser, "Метеор");
    for (const p of [healer, mage]) p.on("pageerror", (e) => errors.push(String(e)));
    await mage.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 99 }); n.send("dbg", { op: "god" }); });
    await healer.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 10 }); n.send("dbg", { op: "god" }); });
    await healer.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [sp.x + 150, sp.y]);
    await mage.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [sp.x + 150, sp.y - 70]);
    await sleep(1500);
    for (const id of ["frostnova", "blink", "meteor"]) { await mage.evaluate((i) => (window as any).__net.send("learn", { id: i }), id); await sleep(250); }
    await mage.waitForFunction(() => (window as any).__net.self.skills.meteor && (window as any).__net.self.bars[0].some((r: any) => r && r.s === "meteor"), { timeout: 5000 });

    // ---- лекарь: союзник под курсором, цель не меняется ----
    await sleep(2500);
    await healer.keyboard.press("Tab");
    await sleep(500);
    const before = await state(healer);
    must(before.target, "Tab не выбрал врага");
    const ally = (await healer.evaluate(`(() => { const s = ${scene}; for (const [id, v] of s.units) if (id !== window.__net.id && v.u.name === "Метеор") return { id, x: v.x, y: v.y }; return null; })()`)) as { id: string; x: number; y: number } | null;
    must(ally, "союзник не виден лекарю");
    const sc = await toClient(healer, ally!.x, ally!.y - 14);
    await healer.mouse.move(sc.x, sc.y, { steps: 4 });
    await sleep(300);
    const heal = await keyFor(healer, "heal");
    await clear(healer);
    await healer.keyboard.down(heal as any);
    await sleep(150);
    must((await state(healer)).aim === "heal", "с превью: при зажатой клавише нет прицела");
    must(!(await sent(healer, "skill")).length, "каст ушёл до отпускания клавиши");
    await healer.keyboard.up(heal as any);
    await sleep(300);
    const casts = await sent(healer, "skill");
    must(casts.length === 1 && casts[0].id === "heal" && casts[0].target === ally!.id, "лечение не ушло в союзника под курсором: " + JSON.stringify(casts) + " ally=" + JSON.stringify(ally) + " sc=" + JSON.stringify(sc) + " st=" + JSON.stringify(await state(healer)) + " dbg=" + JSON.stringify(await healer.evaluate((p: any) => { const sc_id = p.id; const s = (window as any).__game.scene.getScene("game"); const e = document.elementFromPoint(p.x, p.y) as HTMLElement; const ap = s.input.activePointer; return { el: e?.tagName + "." + e?.className, overUi: s.overUi, px: ap.x, py: ap.y, al: (() => { const v = s.units.get(sc_id); return v && { en: s.isEnemy(v), k: v.u.kind, f: v.u.faction, mf: (window as any).__net.self.faction, ht: v.hitTest(s.cameras.main.getWorldPoint(ap.x, ap.y).x, s.cameras.main.getWorldPoint(ap.x, ap.y).y), vx: v.x, vy: v.y }; })(), pf: s.pickFriend(s.cameras.main.getWorldPoint(ap.x, ap.y).x, s.cameras.main.getWorldPoint(ap.x, ap.y).y) }; }, { ...sc, id: ally!.id })) + " self=" + (await healer.evaluate(() => (window as any).__net.id)));
    must((await state(healer)).target === before.target, "цель сменилась");
    ok("лекарь: лечение ушло в союзника под курсором, выбранная цель не изменилась");

    // ---- маг: метеор с превью ложится в курсор, зажатый дальностью ----
    await sleep(3000);
    const me = await state(mage);
    const far = await toClient(mage, me.x, me.y); far.x = 8; far.y = 8;
    await mage.mouse.move(far.x, far.y, { steps: 4 });
    await sleep(300);
    const met = await keyFor(mage, "meteor");
    await clear(mage);
    await mage.keyboard.down(met as any);
    await sleep(200);
    must((await state(mage)).aim === "meteor", "метеор: нет прицела при зажатой клавише");
    await mage.keyboard.up(met as any);
    await sleep(300);
    const m = (await sent(mage, "skill"))[0];
    must(m && m.id === "meteor", "метеор не отправлен: " + JSON.stringify(m));
    const d = Math.hypot(m.x - me.x, m.y - me.y);
    const cur = (await state(mage)).cur, cd = Math.hypot(cur.x - me.x, cur.y - me.y), k = 340 / cd, ex = me.x + (cur.x - me.x) * k, ey = me.y + (cur.y - me.y) * k;
    must(cd > 345, `курсор не дальше дальности: ${cd.toFixed(0)} px, интерфейс=${(await state(mage)).ui}`);
    must(Math.hypot(m.x - ex, m.y - ey) < 4, `точка не зажата дальностью 340: d=${d.toFixed(1)} (${m.x},${m.y}) ожидали (${ex.toFixed(0)},${ey.toFixed(0)})`);
    ok(`метеор: курсор дальше дальности, точка каста в ${d.toFixed(0)} px (дальность 340)`);

    // ближе дальности — ровно в курсор (перезарядка метеора не мешает: проверяем сообщение клиента)
    const near = await toClient(mage, me.x + 150, me.y + 40);
    await mage.mouse.move(near.x, near.y, { steps: 4 });
    await sleep(400);
    await clear(mage);
    await mage.keyboard.down(met as any);
    await sleep(150);
    await mage.keyboard.up(met as any);
    await sleep(300);
    const m2 = (await sent(mage, "skill"))[0];
    must(m2 && Math.hypot(m2.x - (me.x + 150), m2.y - (me.y + 40)) < 4, "ближняя точка не совпала с курсором: " + JSON.stringify(m2));
    ok("метеор ближе дальности ложится ровно в курсор");

    // ---- Esc отменяет прицел ----
    await clear(mage);
    await mage.keyboard.down(met as any);
    await sleep(150);
    must((await state(mage)).aim === "meteor", "нет прицела перед Esc");
    await mage.keyboard.press("Escape");
    await sleep(100);
    must((await state(mage)).aim === null, "Esc не снял прицел");
    await mage.keyboard.up(met as any);
    await sleep(300);
    must(!(await sent(mage, "skill")).length, "после Esc ушёл каст");
    ok("Esc отменяет прицел, при отпускании клавиши каста нет");

    must(!errors.length, "ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("aim-screens: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
