/**
 * Полоса каста (ui/castbar.ts, styles/castbar.css): кольцо (c) — призыв маунта и питомца, рамка (a) — остальные касты.
 * Живой прогон через сообщение mountcast: нужный вид, каст до конца — .ok, отмена на середине — .fail; одинаковый тост не дублируется.
 * Снимок «A на телепорте + C на маунте» → tools/out/castbar/final.png.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2852 VITE_TEST_PORT=5252 npx tsx tests/castbar-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5252;
const OUT = path.resolve("tools/out/castbar");
const NAME = "Латный дестриэ";
const CLIP = { x: 380, y: 556, width: 520, height: 244 };

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const must = (c: unknown, m: string) => { if (!c) throw new Error(m); };

async function enter(page: Page, name: string) {
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("zoom:v2", "2"); } catch {} });
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 15000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
  await sleep(1500);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], defaultViewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  try {
    await startServer(true);
    const hero = "КастПоказ";
    await ensureChar(hero, "secret", hero, "mage");
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await enter(page, hero);
    await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 40 }); n.send("dbg", { op: "god" }); });
    await sleep(800);
    const emit = (ms: number, nm: string) => page.evaluate((ms, nm) => (window as any).__net.emit("mountcast", { ms, name: nm }), ms, nm);
    const TP = "Телепорт: Сольгард";
    for (const [v, nm] of [["c", NAME], ["a", TP], ["a", "Воскрешение"]] as const) {
      await emit(1200, nm);
      await sleep(400);
      must(await page.$(`.cb.cb-${v}:not([hidden])`), `${nm}: нет полосы вида ${v}`);
      await sleep(900);
      await emit(0, "");
      await sleep(60);
      must(await page.$(`.cb.cb-${v}.ok`), `${nm}: нет вспышки успеха`);
      await sleep(700);
      must(await page.$(`.cb.cb-${v}[hidden]`), `${nm}: полоса не ушла после успеха`);
      await emit(2000, nm);
      await sleep(600);
      await emit(0, "");
      await sleep(60);
      must(await page.$(`.cb.cb-${v}.fail`), `${nm}: нет прерывания`);
      await sleep(900);
      console.log(`  ok   ${nm}: вид ${v}, успех, прерывание`);
    }
    // смена вида посреди каста: прежняя полоса уходит сразу
    await emit(3000, TP);
    await sleep(300);
    await emit(3000, NAME);
    await sleep(100);
    must(await page.$(".cb.cb-a[hidden]") && await page.$(".cb.cb-c:not([hidden])"), "две полосы сразу");
    await emit(0, "");
    await sleep(900);
    const shots: string[] = [];
    for (const nm of [TP, NAME]) {
      await emit(2000, nm);
      await sleep(1000);
      const f = path.join(OUT, `_shot-${shots.length}.png`);
      await page.screenshot({ path: f, clip: CLIP });
      shots.push(f);
      await emit(0, "");
      await sleep(900);
    }
    // повтор одинакового тоста — продление, а не второй тост
    await page.evaluate(() => { const n = (window as any).__net; n.emit("toast", { text: "Нельзя призвать маунта в бою", kind: "error" }); n.emit("toast", { text: "Нельзя призвать маунта в бою", kind: "error" }); });
    await sleep(100);
    const nt = await page.$$eval(".toasts .toast", (l) => l.filter((e) => e.textContent === "Нельзя призвать маунта в бою").length);
    must(nt === 1, `одинаковых тостов: ${nt}`);
    console.log("  ok   одинаковый тост не дублируется");

    const img = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
    const html = `<html><body style="margin:0;background:#120f16;color:#d6a84b;font:600 14px Rubik,Trebuchet MS,sans-serif;padding:12px">
      <div style="display:grid;grid-template-columns:repeat(2,${CLIP.width}px);gap:8px"><div>A — телепорт (и прочие касты)</div><div>C — призыв маунта и питомца</div>
      ${shots.map((f) => `<img src="${img(f)}" width="${CLIP.width}" height="${CLIP.height}" style="display:block;border:1px solid #4d3f4a">`).join("")}</div></body></html>`;
    const sheet = await browser.newPage();
    await sheet.setViewport({ width: 2 * CLIP.width + 8 + 24, height: 300 });
    await sheet.setContent(html, { waitUntil: "load" });
    await sheet.screenshot({ path: path.join(OUT, "final.png"), fullPage: true });
    for (const f of shots) fs.rmSync(f);
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("castbar-screens: готово, " + path.join(OUT, "final.png"));
}
main().catch((e) => { console.error(e); process.exit(1); });
