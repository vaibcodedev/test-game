/**
 * Слои интерфейса (client/src/styles/tokens.css, --z-*; таблица — docs/art/ui-style.md 1.6a).
 * Часть 1 (без браузера): в client/src нет числовых z-index вне tokens.css (допустимы var(--z-*) и счётчик окон в ui/drag.ts); порядок токенов верный.
 * Часть 2 (браузер): магазин, сумка, стойла — клики по очереди выводят окно наверх; тост, подсказка, модалка — порядок по computed z-index и elementFromPoint.
 * Снимки → tools/out/ui-layers/*.png.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2846 VITE_TEST_PORT=5246 npx tsx tests/ui-layers.ts      (только статика: --static)
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const must = (c: unknown, m: string) => { if (!c) throw new Error("FAIL: " + m); };
const SRC = path.resolve("client/src");

function walk(d: string, out: string[] = []) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(css|ts|html)$/.test(f.name)) out.push(p);
  }
  return out;
}

function staticPart() {
  const bad: string[] = [];
  for (const f of walk(SRC)) {
    if (f.endsWith("tokens.css")) continue;
    fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(/z-index\s*:\s*([^;}"]+)/gi)) {
        if (!/^var\(--z-[\w-]+\)(\s*!important)?\s*$/.test(m[1].trim())) bad.push(`${path.relative(SRC, f)}:${i + 1} z-index: ${m[1].trim()}`);
      }
      for (const m of line.matchAll(/\.zIndex\s*=\s*([^;]+)/g)) if (!f.endsWith("drag.ts")) bad.push(`${path.relative(SRC, f)}:${i + 1} zIndex = ${m[1]}`);
    });
  }
  must(!bad.length, "z-index вне токенов:\n  " + bad.join("\n  "));
  const t = fs.readFileSync(path.join(SRC, "styles/tokens.css"), "utf8");
  const v = (n: string) => Number(new RegExp(`--${n}:\\s*(\\d+)`).exec(t)?.[1]);
  const order = ["z-world-ui", "z-hud", "z-chat", "z-hud-event", "z-castbar", "z-window", "z-window-max", "z-window-pinned", "z-announce", "z-toast", "z-modal", "z-loading", "z-modal-sys", "z-tooltip", "z-drag"].map(v);
  must(order.every((x, i) => Number.isFinite(x) && (i === 0 || x > order[i - 1])), "порядок слоёв в tokens.css нарушен: " + order.join(" < "));
  console.log("static ok");
}

function chromePath() {
  const p = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome"].find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

async function browserPart() {
  const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5246;
  const OUT = path.resolve("tools/out/ui-layers");
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  try {
    await startServer(true);
    const hero = "СлоиПоказ";
    await ensureChar(hero, "secret", hero, "warrior");
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument("window.__name = (f) => f"); // tsx вставляет __name в вычисляемые в странице функции
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
    await page.type("#login-name", hero); await page.type("#login-pass", "secret"); await page.click("#login-go");
    await page.waitForSelector(`.cs-slot[data-name="${hero}"]`, { timeout: 15000 });
    await page.$eval(`.cs-slot[data-name="${hero}"]`, (b) => (b as HTMLElement).click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
    await sleep(1500);

    const z = (sel: string) => page.$eval(sel, (e) => parseInt(getComputedStyle(e).zIndex, 10));
    const wins = [".win-shop", ".win-bags", ".win-stable"];
    await page.evaluate((ws) => {
      ws.forEach((s: string, i: number) => {
        const w = document.querySelector<HTMLElement>(s)!;
        w.style.left = 200 + i * 30 + "px"; w.style.top = 120 + i * 20 + "px"; w.style.transform = "none"; w.hidden = false;
      });
    }, wins);
    await sleep(300);
    const topAt = (x: number, y: number) => page.evaluate((x, y) => document.elementFromPoint(x, y)?.closest(".win")?.className ?? "", x, y);
    const pt = await page.evaluate((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.left + 80, y: r.top + 80 }; }, wins[2]);
    must((await topAt(pt.x, pt.y)).includes("win-stable"), "после открытия сверху стойла (открыты последними)");
    await page.screenshot({ path: path.join(OUT, "1-open.png") });
    for (const s of [wins[0], wins[1], wins[0]]) {
      await page.evaluate((s) => document.querySelector<HTMLElement>(s + " h2")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), s); // окна перекрываются: шапка может быть под другим окном
      const zs = await Promise.all(wins.map(z));
      const mine = zs[wins.indexOf(s)];
      must(zs.every((v) => v <= mine) && zs.filter((v) => v === mine).length === 1, `после клика ${s} выше остальных: ${zs}`);
      must(mine >= 1000 && mine <= 1999, `z окна в диапазоне слоя: ${mine}`);
    }
    await page.screenshot({ path: path.join(OUT, "2-clicked.png") });
    for (let i = 0; i < 1200; i++) await page.evaluate((s) => document.querySelector<HTMLElement>(s)!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), wins[i % 3]);
    const zs2 = await Promise.all(wins.map(z));
    must(Math.max(...zs2) <= 1999 && Math.min(...zs2) >= 1000, `счётчик в диапазоне: ${zs2}`);

    const r = await page.evaluate(() => {
      const ui = document.getElementById("ui")!;
      const toasts = document.querySelector<HTMLElement>(".toasts")!;
      const t = document.createElement("div"); t.className = "toast"; t.textContent = "Тост"; toasts.append(t);
      const tip = document.querySelector<HTMLElement>(".tip")!; tip.hidden = false; tip.innerHTML = "Подсказка";
      const m = document.createElement("div"); m.className = "modal"; m.id = "t-modal"; m.innerHTML = '<div class="dialog">Диалог</div>'; ui.append(m);
      const zz = (e: Element) => parseInt(getComputedStyle(e).zIndex, 10);
      const w = Math.max(...[...document.querySelectorAll(".win")].filter((e) => !(e as HTMLElement).hidden).map(zz));
      return { w, toast: zz(toasts), modal: zz(m), tip: zz(tip) };
    });
    must(r.w < r.toast && r.toast < r.modal && r.modal < r.tip, `окно < тост < модалка < подсказка: ${JSON.stringify(r)}`);
    const hit = await page.evaluate(() => { const d = document.querySelector("#t-modal")!.getBoundingClientRect(); return !!document.elementFromPoint(d.left + 220, d.top + 130)?.closest("#t-modal"); });
    must(hit, "модалка перекрывает окна");
    await page.screenshot({ path: path.join(OUT, "3-overlays.png") });
    must(!errors.length, "ошибки страницы: " + errors.join("; "));
    console.log("browser ok", JSON.stringify(r));
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer().catch(() => {});
  }
}

(async () => {
  staticPart();
  if (!process.argv.includes("--static")) await browserPart();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
