/**
 * Панель умений (ui/hotbar.ts, styles/hotbar.css): компактная лента с крыльями и гербом.
 * Проверки на 1920×1080 и 1366×768 при масштабе интерфейса 100%: чат стоит слева от панели и не налезает на неё,
 * полоса каста над панелью не перекрывает её (и с открытым рядом ⇧). Снимки с чатом → tools/out/hotbar/final-1920.png, final-1366.png.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2857 VITE_TEST_PORT=5257 npx tsx tests/x
 */
import { activeSkills } from "../shared/skills";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";

import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5257;
const OUT = path.resolve("tools/out/hotbar-a");

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const must = (c: unknown, m: string) => { if (!c) throw new Error(m); };

async function enter(page: Page, name: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 20000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 120000 });
  await sleep(2000);
}


type R = { l: number; r: number; t: number; b: number };
const hit = (a: R, b: R) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const rects = (page: Page) => page.evaluate(() => {
  const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  return { bar: r(".hud-bar")!, chat: r(".hud-chat")!, cast: r("#mount-cast:not([hidden])"), lock: r(".hb-lock")!, crest: r(".hb-row.r1 .hb-crest")!, z: r(".hb-hold.r .hb-extras .slot")! };
});
function check(tag: string, x: Awaited<ReturnType<typeof rects>>) {
  const mid = (x.bar.l + x.bar.r) / 2, cm = (x.crest.l + x.crest.r) / 2;
  must(Math.abs(mid - cm) <= 1, `${tag}: герб не по центру (панель ${mid}, герб ${cm})`);
  must(!hit(x.lock, x.z), `${tag}: замок перекрывает слот Z`);
  must(x.lock.l >= x.bar.l && x.lock.r <= x.bar.r && x.lock.t >= x.bar.t, `${tag}: замок вне рамки`);
  must(x.chat.r <= x.bar.l - 8, `${tag}: чат налезает на панель`);
  if (x.cast) must(x.cast.b <= x.bar.t - 4, `${tag}: каст (низ ${x.cast.b}) перекрывает панель (верх ${x.bar.t})`);
  console.log(`  ok   ${tag}: герб ${(cm - mid).toFixed(2)}px от центра, панель ${Math.round(x.bar.r - x.bar.l)}x${Math.round(x.bar.b - x.bar.t)}`);
}
const drag = (page: Page, from: string, to: string) => page.evaluate((from, to) => {
  const a = document.querySelector(from)!, b = document.querySelector(to)!, dt = new DataTransfer();
  a.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt, shiftKey: true }));
  b.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  b.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  document.dispatchEvent(new Event("dragend"));
}, from, to);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1920,1080", "--no-sandbox"], defaultViewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  try {
    await startServer(true);
    for (const [hero, cls, fac] of [["ПанельСольгард", "mage", "sol"], ["ПанельУмбрат", "warlock", "umb"]] as const) {
      await ensureChar(hero, "secret", hero, cls);
      const ctxB = await browser.createBrowserContext(); const page = await ctxB.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
      await enter(page, hero);
      await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 40 }); n.send("dbg", { op: "god" }); for (let k = 0; k < 4; k++) { n.send("dbg", { op: "item", base: "hp_potion" }); n.send("dbg", { op: "item", base: "mp_potion" }); } });
      await sleep(1000);
      for (let round = 0; round < 3; round++) {
        await page.evaluate((ids) => { const n = (window as any).__net; for (const id of ids) if (!n.self.skills[id]) n.send("learn", { id }); }, activeSkills(cls).map((d) => d.id));
        await sleep(800);
      }
      await page.evaluate(() => { document.querySelectorAll(".toasts .toast").forEach((t) => t.remove()); const n = (window as any).__net; for (const t of ["Всем привет! Кто идёт в подземелье?", "Ищу группу на рейд, нужен лекарь"]) n.send("chat", { text: t }); });
      await sleep(800);
      // drag-and-drop: умение 0 -> пустой слот Shift-блока (bar 1, слот 9), затем обратно
      const sk0 = await page.evaluate(() => JSON.stringify((window as any).__net.self.bars[0][0]));
      await drag(page, '.hb-slot[data-bar="0"][data-i="0"]', '.hb-slot[data-bar="1"][data-i="9"]');
      // ответ сервера (self.bars) под нагрузкой приходит позже 700 мс: ждём условие до 6 с
      await page.waitForFunction((want) => JSON.stringify((window as any).__net.self.bars[1][9]) === want, { timeout: 6000, polling: 100 }, sk0).catch(() => {});
      const moved = await page.evaluate(() => JSON.stringify((window as any).__net.self.bars[1][9]));
      must(moved === sk0, `${fac}: drag-and-drop в блок слева не сработал (${moved} vs ${sk0})`);
      console.log(`  ok   ${fac}: drag-and-drop в левый блок`);
      await drag(page, '.hb-slot[data-bar="1"][data-i="9"]', '.hb-slot[data-bar="0"][data-i="0"]');
      await sleep(700);
      // кулдаун и счётчики видны, ряд ⇧ раскрывается
      await page.evaluate(() => { const s = document.querySelector<HTMLElement>('.hb-row.r1 .hb-slot[data-i="1"]')!; s.classList.add("oncd"); s.querySelector<HTMLElement>(".cd")!.style.setProperty("--p", ".62"); s.querySelector(".cdt")!.textContent = "7"; });
      const qty = await page.evaluate(() => [...document.querySelectorAll(".hb-hold.r .qty")].map((e) => e.textContent));
      must(qty.some((q) => q && Number(q) > 0), `${fac}: нет счётчиков зелий`);
      const cast = (ms: number, nm: string) => page.evaluate((ms, nm) => (window as any).__net.emit("mountcast", { ms, name: nm }), ms, nm);
      for (const [w, h] of [[1366, 768], [1920, 1080]] as const) {
        await page.setViewport({ width: w, height: h });
        await page.mouse.move(w / 2, 200);
        await sleep(1200);
        await cast(30000, "Телепорт: Сольгард");
        await sleep(700);
        await page.screenshot({ path: path.join(OUT, `final-${fac}-${w}.png`) }); console.log(JSON.stringify(await page.evaluate(() => ({ b1: (window as any).__net.self.bars[1], cls: document.querySelector(".hb-row.r2")!.className, h: document.querySelector(".hud-bar")!.getBoundingClientRect().height })))); check(`${fac} ${w}×${h}`, await rects(page));
        await page.evaluate(() => document.querySelector(".hb")!.classList.add("dragging"));
        await sleep(300);
        check(`${fac} ${w}×${h} с рядом ⇧`, await rects(page));
        await page.evaluate(() => document.querySelector(".hb")!.classList.remove("dragging"));
        await cast(0, "");
        await sleep(600);
      }
      await page.close(); await ctxB.close();
    }
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("hotbar-a: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
