/**
 * Панель умений (ui/hotbar.ts, styles/hotbar.css): компактная лента с крыльями и гербом.
 * Проверки на 1920×1080 и 1366×768 при масштабе интерфейса 100%: чат стоит слева от панели и не налезает на неё,
 * полоса каста над панелью не перекрывает её (и с открытым рядом ⇧). Снимки с чатом → tools/out/hotbar/final-1920.png, final-1366.png.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2854 VITE_TEST_PORT=5254 npx tsx tests/hotbar-final.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { activeSkills } from "../shared/skills";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5254;
const OUT = path.resolve("tools/out/hotbar");

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
const rects = (page: Page) => page.evaluate(() => {
  const r = (s: string) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  return { bar: r(".hud-bar")!, chat: r(".hud-chat")!, cast: r("#mount-cast:not([hidden])") };
});

/** Чат слева от панели (рамка панели выступает на 8px), полоса каста выше панели. */
function checkLayout(tag: string, x: { bar: R; chat: R; cast: R | null }) {
  must(x.chat.r <= x.bar.l - 8, `${tag}: чат (правый край ${x.chat.r}) налезает на панель (левый край ${x.bar.l})`);
  must(x.chat.b >= x.bar.b - 40, `${tag}: чат не рядом с панелью, а над ней`);
  if (x.cast) must(x.cast.b <= x.bar.t - 8, `${tag}: полоса каста (низ ${x.cast.b}) перекрывает панель (верх ${x.bar.t})`);
  console.log(`  ok   ${tag}: панель ${Math.round(x.bar.r - x.bar.l)}px, чат ${Math.round(x.chat.r - x.chat.l)}px слева, каст выше панели`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1920,1080", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], defaultViewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  try {
    await startServer(true);
    const hero = "ПанельПоказ";
    await ensureChar(hero, "secret", hero, "mage");
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
    await enter(page, hero);
    await page.evaluate(() => {
      const n = (window as any).__net;
      n.send("dbg", { op: "level", v: 40 }); n.send("dbg", { op: "god" });
      for (let k = 0; k < 4; k++) { n.send("dbg", { op: "item", base: "hp_potion" }); n.send("dbg", { op: "item", base: "mp_potion" }); }
    });
    await sleep(1200);
    const ids = activeSkills("mage").map((d) => d.id);
    for (let round = 0; round < 3; round++) {
      await page.evaluate((ids) => { const n = (window as any).__net; for (const id of ids) if (!n.self.skills[id]) n.send("learn", { id }); }, ids);
      await sleep(900);
    }
    await page.evaluate(() => {
      document.querySelectorAll(".toasts .toast").forEach((t) => t.remove());
      const n = (window as any).__net;
      for (const t of ["Всем привет! Кто идёт в подземелье?", "Ищу группу на рейд, нужен лекарь", "Продам зелья маны, дёшево", "Панель стала компактнее — чат влезает слева"]) n.send("chat", { text: t });
    });
    await sleep(800);
    // состояния для снимка: откат на W, нет маны на E (frame() снимает только свои классы — эти остаются)
    await page.evaluate(() => {
      const s = (i: number) => document.querySelector<HTMLElement>(`.hb-row.r1 .hb-slot[data-i="${i}"]`)!;
      s(1).classList.add("oncd"); s(1).querySelector<HTMLElement>(".cd")!.style.setProperty("--p", ".62"); s(1).querySelector(".cdt")!.textContent = "7";
      s(2).classList.add("nomana");
    });
    const cast = (ms: number, nm: string) => page.evaluate((ms, nm) => (window as any).__net.emit("mountcast", { ms, name: nm }), ms, nm);

    for (const [w, h] of [[1920, 1080], [1366, 768]] as const) {
      await page.setViewport({ width: w, height: h });
      await page.mouse.move(w / 2, 200);
      await sleep(1200);
      await cast(30000, "Телепорт: Сольгард");
      await sleep(700);
      checkLayout(`${w}×${h}`, await rects(page));
      await page.screenshot({ path: path.join(OUT, `final-${w}.png`) });
      // ряд ⇧ (при перетаскивании или когда он заполнен) делает панель выше — каст всё равно над ней
      await page.evaluate(() => document.querySelector(".hb")!.classList.add("dragging"));
      await sleep(300);
      checkLayout(`${w}×${h} с рядом ⇧`, await rects(page));
      await page.evaluate(() => document.querySelector(".hb")!.classList.remove("dragging"));
      await cast(0, "");
      await sleep(900);
    }
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("hotbar-final: готово, " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
