/**
 * Браузерная проверка панели умений (задача 115, шаг 5): умение из окна K — в слот, клавиша слота — каст,
 * снятие, после перезагрузки раскладка та же. HTML5 DnD в headless не воспроизвести мышью, поэтому события
 * dragstart/dragover/drop/dragend подаются напрямую с общим DataTransfer — как это делает браузер.
 * Запуск: TEST_PORT=2798 npx tsx tests/hotbar-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
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
const bars = (page: Page) => page.evaluate(() => (window as any).__net.self?.bars as any[][]);
const slotSel = (bar: number, i: number) => `.hb-slot[data-bar="${bar}"][data-i="${i}"]`;

/** Перетаскивание: dragstart на from, dragover и drop на to (если есть), dragend с итоговым dropEffect. */
async function drag(page: Page, from: string, to: string | null, shift = false) {
  await page.evaluate(([f, t, sh]) => {
    const dt = new DataTransfer();
    const init = { bubbles: true, cancelable: true, dataTransfer: dt, shiftKey: sh as boolean };
    const a = document.querySelector(f as string)!;
    // отменённый dragstart — перетаскивания нет, drop и dragend не будет (как в браузере)
    if (!a.dispatchEvent(new DragEvent("dragstart", init))) return;
    if (t) {
      const b = document.querySelector(t as string)!;
      b.dispatchEvent(new DragEvent("dragover", init));
      b.dispatchEvent(new DragEvent("drop", init));
      dt.dropEffect = "move";
    } else dt.dropEffect = "none";
    a.dispatchEvent(new DragEvent("dragend", init));
  }, [from, to, shift] as const);
}

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("Панель", "secret", "Панель", "warrior");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  const ok = (s: string) => console.log("  ok   " + s);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  const errors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    const enter = async () => {
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      // после перезагрузки сессия может сохраниться: тогда сразу выбор героя
      const stage = await Promise.race([
        page.waitForSelector("#login-name", { visible: true, timeout: 10000 }).then(() => "login"),
        page.waitForSelector('.cs-slot[data-name="Панель"]', { visible: true, timeout: 10000 }).then(() => "cs"),
      ]);
      if (stage === "login") {
        await page.type("#login-name", "Панель");
        await page.type("#login-pass", "secret");
        await page.click("#login-go");
        await page.waitForSelector('.cs-slot[data-name="Панель"]', { timeout: 10000 });
      }
      await page.$eval('.cs-slot[data-name="Панель"]', (b) => (b as HTMLElement).click());
      await page.click('.cs-list [data-a="play"]');
      await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 30000 });
      await sleep(800);
      await page.evaluate(() => {
        const w = window as any, net = w.__net, orig = net.send.bind(net);
        w.__sent = [];
        net.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); };
      });
    };
    await enter();
    await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 10 }); n.send("dbg", { op: "god" }); });
    await page.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [sp.x + 150, sp.y]);
    await sleep(1200);

    const first = (await bars(page))[0][0];
    must(first && first.s === "taunt", "в слоте 1 нет стартового умения: " + JSON.stringify(first));
    const label = await page.$eval(slotSel(0, 0) + " kbd", (e) => e.textContent ?? "");
    must(label, "у слота нет подписи клавиши");
    ok(`панель построена, слот 1 — «${label}», стартовое умение на месте`);

    // закрытая панель не отпускает слот без Shift, с Shift — снимает
    await drag(page, slotSel(0, 0), null);
    await sleep(500);
    must((await bars(page))[0][0], "закрытая панель отпустила слот без Shift");
    await drag(page, slotSel(0, 0), null, true);
    await page.waitForFunction(() => !(window as any).__net.self.bars[0][0], { timeout: 3000 });
    must(!(await page.$(slotSel(0, 0) + " img")), "иконка осталась после снятия");
    ok("замок: без Shift слот на месте, с Shift умение снято с панели");

    // из окна K в слот
    await sleep(1100);
    await page.keyboard.press("KeyK");
    await page.waitForSelector(".win-skills .node .slot[draggable=true]", { timeout: 3000 });
    await page.evaluate(() => {
      // перетаскиваем «Провокацию» (первый узел дерева воина)
      const dt = new DataTransfer();
      const btn = document.querySelector(".win-skills .node .slot[draggable=true]")!;
      btn.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      const to = document.querySelector('.hb-slot[data-bar="0"][data-i="0"]')!;
      to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      btn.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
    });
    await page.waitForFunction(() => (window as any).__net.self.bars[0][0]?.s, { timeout: 3000 });
    const placed = (await bars(page))[0][0];
    must(placed.s === "taunt", "в слот попало не то: " + JSON.stringify(placed));
    await page.keyboard.press("KeyK");
    ok("умение из окна K перетащено в слот 1");

    // клавиша слота — каст (нужна цель: Tab выбирает ближайшего врага)
    await page.keyboard.press("Tab");
    await sleep(500);
    await clear(page);
    const code = /^\d$/.test(label) ? `Digit${label}` : `Key${label}`;
    await page.keyboard.press(code as any);
    await sleep(400);
    const casts = await sent(page, "skill");
    must(casts.length === 1 && casts[0].id === "taunt", "клавиша слота не кастует: " + JSON.stringify(casts));
    ok(`клавиша «${label}» отправила каст taunt`);

    // второй ряд появляется при перетаскивании и держит умение
    await sleep(1100);
    await page.evaluate(() => (window as any).__net.send("bars:set", { bar: 1, i: 2, ref: { a: "pet" } }));
    await page.waitForFunction(() => !!(window as any).__net.self.bars[1][2], { timeout: 3000 });
    must(await page.$eval(".hb-row.r2", (e) => getComputedStyle(e).display !== "none"), "второй ряд скрыт, хотя не пуст");
    await sleep(1100);
    await page.evaluate(() => (window as any).__net.send("bars:set", { bar: 1, i: 2, ref: null }));
    await page.waitForFunction(() => (window as any).__net.self.bars[1].every((x: unknown) => !x), { timeout: 3000 });
    must(await page.$eval(".hb-row.r2", (e) => getComputedStyle(e).display === "none"), "пустой второй ряд виден");
    ok("второй ряд виден, только пока в нём что-то есть");

    // после перезагрузки раскладка та же
    const before = JSON.stringify(await bars(page));
    await sleep(800);
    await enter();
    await sleep(500);
    must(JSON.stringify(await bars(page)) === before, "после перезагрузки раскладка другая: " + JSON.stringify(await bars(page)));
    must(await page.$eval(slotSel(0, 0) + " img", (e) => (e as HTMLImageElement).src.includes("sk_taunt")), "иконка умения не нарисована");
    ok("после перезагрузки раскладка та же");

    must(!errors.length, "ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("hotbar-screens: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
