/**
 * Задача 142: маунты в игре — новый лист (4 вида, бег 12, покой 24, гербовые по фракции всадника). Для каждого проверяемого
 * маунта: посадка (dbg mount), покой, бег в 4 направления; снимки → tools/out/mounts-final/ingame.png. Ошибок страницы быть не должно,
 * текстура и анимации маунта должны существовать (ключи mountTex).
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2860 VITE_TEST_PORT=5260 npx tsx tests/mounts-ingame.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5260;
const OUT = path.resolve("tools/out/mounts-final");
const CLIP = { x: 490, y: 250, width: 300, height: 260 };
const MOUNTS = (process.env.MOUNTS || "horse,war_horse,griffin,lion,nightmare,phoenix").split(",");

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const must = (c: unknown, m: string) => { if (!c) throw new Error(m); };

async function enter(page: Page, name: string) {
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("zoom:v1", "3"); } catch {} });
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
  const shots: { f: string; label: string }[] = [];
  try {
    await startServer(true);
    for (const [hero, cls] of [["МаунтСол", "warrior"], ["МаунтУмб", "deathknight"]] as const) {
      await ensureChar(hero, "secret", hero, cls);
      // свой контекст на героя: сессия прошлого аккаунта в localStorage не мешает входу
      const ctxB = await browser.createBrowserContext();
      const page = await ctxB.newPage();
      page.on("pageerror", (e) => errors.push(String(e)));
      await enter(page, hero);
      await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 70 }); n.send("dbg", { op: "god" }); });
      await sleep(600);
      for (const id of hero === "МаунтСол" ? MOUNTS : ["war_horse", "skel_horse", "griffin"]) {
        await page.evaluate((id) => (window as any).__net.send("dbg", { op: "mount", id }), id);
        await sleep(900);
        const st = await page.evaluate((id) => {
          const g = (window as any).__game, sc = g.scene.getScene("game"), man = sc.cache.json.get("manifest");
          const m = man?.mounts?.[id], fac = (window as any).__net.self?.faction ?? "";
          const key = m ? `m_${m.sheet ?? id}${m.fac && fac === "umbrath" ? "_umbrath" : ""}` : "";
          return { has: !!m, key, tex: key && sc.textures.exists(key), anim: key && sc.anims.exists(`${key}-idle-0`) && sc.anims.exists(`${key}-run-3`) && sc.anims.exists(`${key}-idle-7`), views: m?.views };
        }, id);
        must(st.has && st.tex && st.anim && st.views === 4, `${hero}: маунт ${id}: ${JSON.stringify(st)}`);
        const snap = async (label: string) => {
          const f = path.join(OUT, `_s${shots.length}.png`);
          await page.screenshot({ path: f, clip: CLIP });
          shots.push({ f, label });
        };
        await sleep(700);
        await snap(`${id} · ${st.key.slice(2)} · покой`);
        for (const [mx, my, nm] of [[0, 1, "вниз"], [0, -1, "вверх"], [1, 0, "вправо"], [-1, 0, "влево"]] as const) {
          await page.evaluate((mx, my) => (window as any).__net.send("input", { mx, my }), mx, my);
          await sleep(450);
          await snap(`${id} · ${nm}`);
          await page.evaluate(() => (window as any).__net.send("input", { mx: 0, my: 0 }));
          await sleep(250);
        }
        console.log(`  ok   ${hero}: ${id} → ${st.key}`);
      }
      await page.close();
      await ctxB.close();
    }
    const img = (f: string) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
    const html = `<html><body style="margin:0;background:#120f16;color:#e8dcc0;font:600 12px Rubik,Trebuchet MS,sans-serif;padding:10px">
      <div style="display:grid;grid-template-columns:repeat(5,${CLIP.width}px);gap:6px">${shots.map((s) => `<div><div style="height:16px">${s.label}</div><img src="${img(s.f)}" width="${CLIP.width}" height="${CLIP.height}" style="display:block;border:1px solid #4d3f4a"></div>`).join("")}</div></body></html>`;
    const sheet = await browser.newPage();
    await sheet.setViewport({ width: 5 * (CLIP.width + 6) + 20, height: 400 });
    await sheet.setContent(html, { waitUntil: "load" });
    await sheet.screenshot({ path: path.join(OUT, "ingame.png"), fullPage: true });
    for (const s of shots) fs.rmSync(s.f);
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("mounts-ingame: готово, " + path.join(OUT, "ingame.png"));
}
main().catch((e) => { console.error(e); process.exit(1); });
