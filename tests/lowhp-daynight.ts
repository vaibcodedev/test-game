/**
 * Низкое здоровье (пульс полоски HP в рамке героя) и значок суток + ночная миникарта.
 * Снимок → tools/out/ui/lowhp-daynight.png: рамка героя в двух кадрах пульса, миникарта днём / на закате / ночью / на рассвете с подсказками значка.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2846 VITE_TEST_PORT=5246 npx tsx tests/lowhp-daynight.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";
import { DAY_CYCLE_MS } from "../shared/daynight";

const must = (c: unknown, m: string) => { if (!c) throw new Error("FAIL: " + m); };
const chromePath = () => {
  const p = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
};

async function main() {
  const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5246;
  const OUT = path.resolve("tools/out/ui");
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  try {
    await startServer(true);
    const hero = "ПульсПоказ";
    await ensureChar(hero, "secret", hero, "warrior");
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument("window.__name = (f) => f");
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
    await page.type("#login-name", hero); await page.type("#login-pass", "secret"); await page.click("#login-go");
    await page.waitForSelector(`.cs-slot[data-name="${hero}"]`, { timeout: 15000 });
    await page.$eval(`.cs-slot[data-name="${hero}"]`, (b) => (b as HTMLElement).click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
    await sleep(1500);

    // низкое здоровье: подменяем hp в кадре, который получает рамка героя
    await page.evaluate(() => {
      const hud = (window as any).__game.scene.getScene("game").hud;
      const orig = hud.frame.bind(hud);
      hud.frame = (i: any) => orig((window as any).__lowHp >= 0 && i.me ? { ...i, me: { ...i.me, hp: Math.round(i.me.maxHp * (window as any).__lowHp) } } : i);
      (window as any).__lowHp = 0.2;
    });
    const alpha = () => page.evaluate(() => { const b = document.querySelector<HTMLElement>(".hud-player .bar.hp"); const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(b?.style.boxShadow ?? ""); return m ? Number(m[1]) : 0; });
    const shot = async (name: string, sel: string, pad = 8) => {
      const r = await page.$eval(sel, (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
      const f = path.join(OUT, name);
      await page.screenshot({ path: f, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2 } });
      return fs.readFileSync(f).toString("base64");
    };
    await sleep(1500);
    let hi = 0, lo = 9;
    for (let i = 0; i < 40; i++) { const a = await alpha(); hi = Math.max(hi, a); lo = Math.min(lo, a); await sleep(60); }
    if (!(hi > 0.5)) console.log("debug", errors.slice(0, 3), JSON.stringify(await page.evaluate(() => { const b = document.querySelector<HTMLElement>(".hud-player .bar.hp"); return { has: !!b, sh: b?.style.boxShadow, low: (window as any).__lowHp, txt: document.getElementById("hp-text")?.textContent }; })));
    must(hi > 0.5 && lo < hi - 0.2, `полоска пульсирует: ${lo}..${hi}`);
    let peak = "", dim = "";
    for (let i = 0; i < 60 && !peak; i++) { if ((await alpha()) > hi - 0.08) peak = await shot("_hp1.png", ".hud-player"); else await sleep(30); }
    for (let i = 0; i < 60 && !dim; i++) { if ((await alpha()) < lo + 0.12) dim = await shot("_hp2.png", ".hud-player"); else await sleep(30); }
    must(peak && dim, "кадры пульса пойманы");
    await page.evaluate(() => { (window as any).__lowHp = -1; });
    await sleep(2500);
    must((await alpha()) === 0, "свечение погасло при высоком HP");

    // миникарта: день, закат, ночь, рассвет
    const tods: [string, number][] = [["День", 0.3], ["Закат", 0.67], ["Ночь", 0.82], ["Рассвет", 0.93]];
    const minis: { label: string; tip: string; img: string }[] = [];
    for (const [label, ph] of tods) {
      await page.evaluate((ms) => { (window as any).__shadowMs = ms; }, ph * DAY_CYCLE_MS);
      await sleep(900);
      const tip = await page.$eval(".hud-mini .tod", (e) => (e as HTMLElement).title);
      must(tip.length > 3, `подсказка значка (${label})`);
      minis.push({ label, tip, img: await shot(`_mini-${label}.png`, ".hud-mini", 6) });
    }
    await page.evaluate(() => { delete (window as any).__shadowMs; });

    const sheet = await browser.newPage();
    await sheet.setViewport({ width: 1100, height: 760 });
    await sheet.setContent(`<body style="margin:0;background:#120a10;color:#e8dcc0;font:14px sans-serif;padding:12px">
      <div>Низкое здоровье: пик и спад пульса</div>
      <div style="display:flex;gap:12px;margin:6px 0 16px"><img src="data:image/png;base64,${peak}"><img src="data:image/png;base64,${dim}"></div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">${minis.map((m) => `<div style="width:250px"><div>${m.label}: «${m.tip}»</div><img src="data:image/png;base64,${m.img}"></div>`).join("")}</div></body>`);
    await sheet.screenshot({ path: path.join(OUT, "lowhp-daynight.png"), fullPage: true });
    for (const f of fs.readdirSync(OUT)) if (f.startsWith("_")) fs.rmSync(path.join(OUT, f));
    must(!errors.length, "ошибки страницы: " + errors.slice(0, 3).join(" | "));
    console.log("lowhp-daynight: ok", minis.map((m) => m.tip).join(" / "));
  } finally {
    await browser.close().catch(() => {});
    await stopServer();
    await vite.close();
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
