/**
 * Выравнивание надписи подъёма уровня: в настоящем браузере на экране входа (сервер игры не нужен) вставляется DOM надписи,
 * анимации ставятся на 1,6 с, меряются центры кикера, заголовка, строки наград и зазоры орнаментов при 1920×1080 и 1366×768
 * (и при zoom корня интерфейса 1,25 — надпись лежит в body и от него не зависит). Снимок — tools/out/levelup/banner-align.png.
 * Под замком tools/out/scenario.lock. Запуск: $env:VITE_TEST_PORT="5278"; npx tsx tests/levelup-banner-align.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";

const OUT = path.resolve("tools/out/levelup");
const LOCK = path.resolve("tools/out/scenario.lock");
const PORT = Number(process.env.VITE_TEST_PORT) || 5278;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (let i = 0; ; i++) { try { fs.mkdirSync(LOCK); break; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; if (i % 15 === 0) console.log("замок занят, жду…"); await sleep(2000); } }
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  let vite: Awaited<ReturnType<typeof createServer>> | null = null;
  try {
    vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
    await vite.listen();
    const exe = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || exe, headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage();
    const shots: Buffer[] = [];
    await page.evaluateOnNewDocument("window.__name = (f) => f");   // tsx кладёт __name в функции evaluate
    for (const [w, h, zoom] of [[1920, 1080, 1], [1366, 768, 1], [1366, 768, 1.25]] as const) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#login-name", { timeout: 20000 });
      await page.evaluate((zoom) => {
        (document.getElementById("ui") ?? document.body.firstElementChild as HTMLElement | null)?.style.setProperty("zoom", String(zoom));
        const r = document.createElement("div");
        r.className = "lvb";
        r.innerHTML = `<div class="lvb-plate"><div class="lvb-k">Подъём уровня</div><div class="lvb-line"><i class="lvb-orn"></i><span>Уровень 11</span><i class="lvb-orn r"></i></div><div class="lvb-sub"><span><em>+27</em> очк. характеристик <kbd>C</kbd></span><span><em>+9</em> очк. умений <kbd>K</kbd></span><span>Новое умение: <b>Удар щитом</b></span></div></div>`;
        document.body.append(r);
      }, zoom);
      await sleep(300);
      await page.evaluate(() => document.getAnimations().filter((a) => (a.effect as any)?.target?.closest?.(".lvb")).forEach((a) => { a.pause(); a.currentTime = 1600; }));
      await sleep(300);
      const m = await page.evaluate(() => {
        const q = (s: string) => document.querySelector(s)!;
        const txt = (el: Element) => el.getBoundingClientRect();   // рамка элемента: padding-left компенсирует хвостовой трекинг, значит глифы в ней по центру
        const k = txt(q(".lvb-k")), t = txt(q(".lvb-line span")), sub = txt(q(".lvb-sub"));
        const o = [...document.querySelectorAll(".lvb-orn")].map((e) => e.getBoundingClientRect());
        const c = (b: DOMRect) => +(b.left + b.width / 2).toFixed(1);
        return { screen: innerWidth / 2, k: c(k), t: c(t), sub: c(sub), gapL: +(t.left - o[0].right).toFixed(1), gapR: +(o[1].left - t.right).toFixed(1), wL: +o[0].width.toFixed(1), wR: +o[1].width.toFixed(1), plate: q(".lvb-plate").getBoundingClientRect().top };
      });
      console.log(`${w}x${h} zoom ${zoom}:`, JSON.stringify(m));
      if (zoom === 1 && w === 1920) shots.push(Buffer.from((await page.screenshot({ type: "png", clip: { x: 360, y: 190, width: 1200, height: 190 } })) as Uint8Array));
      if (w === 1366 && zoom === 1) shots.push(Buffer.from((await page.screenshot({ type: "png", clip: { x: 83, y: 120, width: 1200, height: 150 } })) as Uint8Array));
    }
    const mp = await browser.newPage();
    await mp.setViewport({ width: 1240, height: 400 });
    await mp.setContent(`<body style="margin:0;background:#111">${shots.map((b) => `<img style="display:block;width:1200px;margin:6px 20px;outline:1px dashed #f0f" src="data:image/png;base64,${b.toString("base64")}">`).join("")}<div style="position:fixed;left:620px;top:0;bottom:0;width:1px;background:#0f0"></div></body>`);
    await mp.waitForFunction("[...document.images].every((i) => i.complete)");
    await mp.setViewport({ width: 1240, height: await mp.evaluate(() => document.body.scrollHeight) });
    await mp.screenshot({ path: path.join(OUT, "banner-align.png"), fullPage: true });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (vite) await vite.close().catch(() => {});
    fs.rmSync(LOCK, { recursive: true, force: true });
  }
}
main().then(() => process.exit(0), (e) => { console.error("ОШИБКА:", e); process.exit(1); });
