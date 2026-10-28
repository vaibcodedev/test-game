/**
 * ФИНАЛ: три прироста опыта подряд (цифры «+N оп.», полоска), затем подъём 10→11: кадры 0 / 0,3 / 1 / 2 с (герой, надпись, полоска). Результат — tools/out/levelup/final.png.
 * Ниже — прежний вводный комментарий к сценарию.
 * Снимки опыта и подъёма уровня в настоящем браузере (1920×1080, зум 2): герой 10 ур. на поляне вне города.
 * Шаг 1 — выдача опыта (dbg xp): снимки сразу и через 0,3 и 0,8 с (полоска опыта в HUD, «+N опыта» — если появится).
 * Шаг 2 — выдача опыта до следующего уровня (dbg xp): серия кадров эффекта подъёма около 0, 0,2, 0,5, 1 и 2 с
 * (вспышка lvl на герое, надпись «Уровень N!», строка в чате). Кадры — tools/out/levelup/, монтаж с подписями — montage.png.
 *
 * Запуск (под замком tools/out/scenario.lock: скрипт ждёт, пока его нет, создаёт и снимает в finally; порты свободные):
 *   $env:TEST_PORT="2611"; $env:VITE_TEST_PORT="5211"; npx tsx tests/levelup-shots.ts
 * Chrome: CHROME_PATH, иначе стандартный путь Windows. Отдельные кадры после монтажа удаляются, остаётся montage.png.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";
import { PLACES } from "../shared/map";
import { xpToNext } from "../shared/formulas";

const VIEW = { width: 1920, height: 1080 };
const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5211;
const OUT = path.resolve("tools/out/levelup");
const LOCK = path.resolve("tools/out/scenario.lock");
const HERO = "ТестУровня";
const LEVEL = 10;

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

/** Замок: mkdir атомарен; чужой замок (scenario.lock) ждём, не трогая. */
async function acquireLock() {
  for (let i = 0; ; i++) {
    try {
      fs.mkdirSync(LOCK);
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (i % 15 === 0) console.log("замок занят, жду…");
      await sleep(2000);
    }
  }
}

async function enter(page: Page, name: string) {
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("zoom:v2", "2"); } catch {} });
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 15000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000, polling: 250 });
  await sleep(1500);
}

type Crop = { x: number; y: number; w: number; h: number };
interface Shot { buf: Buffer; crop: Crop; label: string }
type Rows = { label: string; frames: Shot[] }[];
type Br = Awaited<ReturnType<typeof puppeteer.launch>>;

async function montage(browser: Br, file: string, title: string, rows: Rows, cw: number, perRow: number) {
  const cells = (r: { frames: Shot[] }) => r.frames.map((f) => {
    const sc = Math.min(1.5, cw / f.crop.w), ch = Math.round(f.crop.h * sc);
    return `<figure style="width:${cw}px"><figcaption>${f.label}</figcaption><div style="width:${cw}px;height:${ch}px;overflow:hidden;position:relative"><img style="position:absolute;width:${Math.round(1920 * sc)}px;left:${-Math.round(f.crop.x * sc)}px;top:${-Math.round(f.crop.y * sc)}px" src="data:image/jpeg;base64,${f.buf.toString("base64")}"></div></figure>`;
  }).join("");
  const W = perRow * (cw + 14) + 40;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#111;color:#eee;font:20px sans-serif;padding:16px;width:${W - 32}px}
    h1{font-size:26px;margin:0 0 12px;font-weight:600} h2{font-size:24px;color:#ffd84a;margin:18px 0 6px}
    .g{display:grid;grid-template-columns:repeat(${perRow},${cw}px);gap:10px 14px}
    figure{margin:0;background:#1d1d1d;padding:4px} figcaption{font-size:16px;color:#aaa;margin:0 0 4px}
  </style></head><body><h1>${title}</h1>${rows.map((r) => `<h2>${r.label}</h2><div class="g">${cells(r)}</div>`).join("")}</body></html>`;
  const mp = await browser.newPage();
  await mp.setViewport({ width: W, height: 400, deviceScaleFactor: 1 });
  await mp.setContent(html, { waitUntil: "load" });
  await mp.waitForFunction("[...document.images].every((i) => i.complete)", { timeout: 30000 });
  const fullH = await mp.evaluate(() => document.body.scrollHeight);
  await mp.setViewport({ width: W, height: fullH, deviceScaleFactor: 1 });
  await mp.screenshot({ path: path.join(OUT, file), fullPage: true });
  await mp.close();
  console.log(`монтаж: ${path.join(OUT, file)}`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/\.(png|html)$/.test(f)) fs.rmSync(path.join(OUT, f), { force: true });
  await acquireLock();
  const errors: string[] = [];
  let browser: Br | null = null;
  let vite: Awaited<ReturnType<typeof createServer>> | null = null;
  try {
    process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
    await startServer(true);
    vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
    await vite.listen();
    const br: Br = browser = await puppeteer.launch({
      executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox", "--disable-background-timer-throttling"],
      defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
    });
    const dale = PLACES.find((p) => p.id === "clear_dale") ?? PLACES[0];
    const HERO_C: Crop = { x: 740, y: 150, w: 440, h: 520 };
    const page = await (await br.createBrowserContext()).newPage();
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`.slice(0, 300)); });
    await ensureChar(HERO, "secret", HERO, "warrior");
    await enter(page, HERO);
    const dbg = (m: Record<string, unknown>) => page.evaluate((m) => (window as any).__net.send("dbg", m), m);
    const self = () => page.evaluate(() => { const s = (window as any).__net.self; return { level: s.level, xp: s.xp, xpNext: s.xpNext }; });
    await dbg({ op: "level", v: LEVEL });
    await dbg({ op: "god" });
    await dbg({ op: "tp", x: dale.x * 32 + 16, y: dale.y * 32 + 16 });
    await sleep(2000);
    await page.evaluate(() => { const g = (window as any).__game.scene.getScene("game"); const u = g.units.get((window as any).__net.id); g.cameras.main.centerOn(u.x, u.y); });
    await sleep(2000);
    const jpg = async () => Buffer.from((await page.screenshot({ type: "jpeg", quality: 90 })) as Uint8Array);
    const rect = (sel: string) => page.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; }, sel);
    const r = await rect(".hud-bar");
    const BAR: Crop = r ? { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 70), w: Math.min(1920, r.w + 24), h: r.h + 82 } : { x: 600, y: 900, w: 720, h: 170 };
    const rows: Rows = [];

    // ---- опыт: три прироста подряд, сцена замедлена в 4 раза ----
    await page.evaluate(() => { const g = (window as any).__game.scene.getScene("game"); g.tweens.timeScale = 0.25; g.time.timeScale = 0.25; });
    const g = Math.floor(xpToNext(LEVEL) * 0.08);
    const t0 = Date.now(), at = async (ms: number) => { const w = ms - (Date.now() - t0); if (w > 0) await sleep(w); };
    await dbg({ op: "xp", v: g });
    await at(150); const xa = await jpg();
    await at(500); await dbg({ op: "xp", v: g * 2 });
    await at(900); await dbg({ op: "xp", v: g });
    await at(2200); const xb = await jpg();
    await at(4500); const xc = await jpg();
    const bx = await rect(".xpb");
    if (bx) await page.mouse.move(bx.x + bx.w * 0.3, bx.y + bx.h / 2);
    await at(7000); const xd = await jpg();
    rows.push({ label: "Опыт: +N оп. над героем (три прироста подряд, сцена замедлена в 4 раза) и полоска с подсказкой", frames: [
      { buf: xb, crop: HERO_C, label: "после 3-го прироста" }, { buf: xc, crop: HERO_C, label: "позже" }, { buf: xd, crop: BAR, label: "полоска, курсор на ней" } ] });
    rows[0].frames.unshift({ buf: xa, crop: BAR, label: "полоска сразу после прироста (вспышка, хвост)" });
    await page.evaluate(() => { const g = (window as any).__game.scene.getScene("game"); g.tweens.timeScale = 1; g.time.timeScale = 1; });
    await page.mouse.move(100, 100);
    await sleep(2500);

    // ---- подъём: кадры 0 / 0,3 / 1 / 2 с (время эффекта и CSS-анимаций задаётся из сценария) ----
    const s1 = await self();
    await page.evaluate(() => { (window as any).__lvlKeep = 60000; (window as any).__lvlFxT = 0; });
    await dbg({ op: "xp", v: Math.max(1, (s1.xpNext ?? xpToNext(LEVEL)) - s1.xp) });
    await page.waitForFunction(() => document.querySelector(".lvb"), { timeout: 8000 }).catch(() => {});
    let cur = 0;
    const BAN: Crop = { x: 510, y: 180, w: 900, h: 190 };
    for (const [ms, lb] of [[0, "0 с"], [300, "0,3 с"], [1000, "1 с"], [2000, "2 с"]] as [number, string][]) {
      while (cur < ms) { cur = Math.min(ms, cur + 100); await page.evaluate((T) => { (window as any).__lvlFxT = T; }, cur); await sleep(130); }
      await page.evaluate((T) => document.getAnimations().filter((a) => (a.effect as any)?.target?.closest?.(".lvb")).forEach((a) => { a.pause(); a.currentTime = T; }), ms);
      await sleep(350);
      const b = await jpg();
      rows.push({ label: `Подъём уровня: ${lb}`, frames: [{ buf: b, crop: HERO_C, label: "герой" }, { buf: b, crop: BAN, label: "надпись" }, { buf: b, crop: BAR, label: "полоска" }] });
    }
    // поиск лишних надписей про уровень: все видимые DOM-элементы с текстом «уровень», кроме нашей надписи
    const found = await page.evaluate("[...document.body.querySelectorAll('*')].filter((e) => e.children.length === 0 && /уровн|Уровн/.test(e.textContent || '') && e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return `${e.className || e.tagName} | ${(e.textContent || '').trim().slice(0, 60)} | ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} | в .lvb: ${!!e.closest('.lvb')}`; })");
    console.log("DOM «уровень»:", JSON.stringify(found));
    await montage(br, "final.png", "Опыт и подъём уровня — финальная версия (герой 10→11 ур., 1920×1080)", rows, 620, 4);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (vite) await vite.close().catch(() => {});
    await stopServer().catch(() => {});
    fs.rmSync(LOCK, { recursive: true, force: true });
    console.log(`ошибки консоли: ${errors.length ? errors.slice(0, 10).join(" | ") : "нет"}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error("ОШИБКА:", e); process.exit(1); });
