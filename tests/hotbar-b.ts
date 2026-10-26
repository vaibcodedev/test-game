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



const hit = (a: any, b: any) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const CSS = `
.hud-bar .mkS{width:var(--mk)!important;height:var(--mk)!important;--sz:var(--mk)!important}
.hud-bar .mkS img{width:calc(var(--mk) - 2px)!important;height:calc(var(--mk) - 2px)!important;left:1px!important;top:1px!important}
.hud-bar .mkS kbd{font-size:calc(var(--mk) * .3)!important}.hud-bar .mkS .qty{font-size:calc(var(--mk) * .3)!important}
.hud-bar .mkS > span:not(.qty):not(.cdt),.hud-bar .mkS .act{font-size:calc(var(--mk) * .5)!important;line-height:calc(var(--mk) - 2px)!important}
.hb-blank.mkS{border-radius:3px}
.mk-hold{display:grid;gap:2px;flex:none}
.mk-hold.l{margin-right:8px;padding-right:8px;background:linear-gradient(transparent 6%,#e8c878 50%,transparent 94%) right center/2px 100% no-repeat}
.mk-hold.r{margin-left:8px;padding-left:8px;background:linear-gradient(transparent 6%,#e8c878 50%,transparent 94%) left center/2px 100% no-repeat}
.mk-wing{position:absolute;bottom:calc(100% + 8px);display:flex;gap:2px;padding:3px 3px 0;background:linear-gradient(#211925,#100c13);border:1px solid #000;border-bottom:0;border-radius:6px 6px 0 0;box-shadow:0 0 0 1px #8a6a4a}
.mk-tier{display:flex;gap:2px;align-items:center;justify-content:center;padding:3px 0 4px}
.mk-tier .hb-crest{margin:0 8px!important}
.hb-row.r2{display:none!important}
`;
const SHAPE = (v: string) => `(() => {
  const q = (s) => document.querySelector(s), bar = q('.hud-bar'), r1 = q('.hb-row.r1');
  const hl = r1.querySelector('.hb-hold.l'), hr = r1.querySelector('.hb-hold.r');
  const L = [...hl.querySelectorAll('.hb-slot')], R = [...hr.querySelectorAll('.hb-slot')];
  const petWrap = hr.querySelector('.hb-extras'), blank = hl.querySelector('.hb-blank'), crest = r1.querySelector('.hb-crest');
  const sz = (els, n) => els.forEach((e) => { e.classList.add('mkS'); e.style.setProperty('--mk', n + 'px'); });
  const pet = petWrap.querySelector('.slot');
  hl.className = 'mk-hold l'; hr.className = 'mk-hold r';
  const div = (c, kids) => { const d = document.createElement('div'); d.className = c; d.append(...kids); return d; };
  if ('${v}' === 'B1') {
    sz([L[0], L[1], R[0], R[1]], 39); sz([L[2], R[2], pet], 26);
    hl.style.gridTemplateColumns = 'repeat(2,39px)'; hr.style.gridTemplateColumns = 'repeat(2,39px)';
    hl.replaceChildren(L[0], L[1]); hr.replaceChildren(R[0], R[1]);
    const wl = div('mk-wing', [L[2]]), wr = div('mk-wing', [R[2], petWrap]);
    wl.style.left = '26px'; wr.style.right = '26px'; bar.append(wl, wr);
  } else if ('${v}' === 'B2') {
    sz([...L, ...R, blank, pet], 32);
    hl.style.gridTemplateColumns = 'repeat(2,32px)'; hr.style.gridTemplateColumns = 'repeat(2,32px)';
  } else {
    hl.remove(); hr.remove();
    sz([...L, ...R, pet], 30);
    crest.remove();
    const tier = div('mk-tier', [R[0], R[1], R[2], crest, L[0], L[1], petWrap]);
    r1.before(tier);
  }
  return true; })()`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 } });
  try {
    await startServer(true);
    const hero = "ПанельСольгард";
    await ensureChar(hero, "secret", hero, "mage");
    for (const v of ["B1", "B2", "B3"]) {
      const ctxB = await browser.createBrowserContext(); const page = await ctxB.newPage();
      await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
      await enter(page, hero);
      await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 40 }); n.send("dbg", { op: "god" }); for (let k = 0; k < 4; k++) { n.send("dbg", { op: "item", base: "hp_potion" }); n.send("dbg", { op: "item", base: "mp_potion" }); } });
      await sleep(1000);
      for (let r = 0; r < 2; r++) { await page.evaluate((ids) => { const n = (window as any).__net; for (const id of ids) if (!n.self.skills[id]) n.send("learn", { id }); }, activeSkills("mage").map((d) => d.id)); await sleep(800); }
      await page.evaluate(() => { const n = (window as any).__net; for (const t of ["Всем привет!", "Ищу группу на рейд"]) n.send("chat", { text: t }); const s = (b: number, i: number, ref: any) => n.send("bars:set", { bar: b, i, ref }); s(1, 9, { i: "hp_potion" }); s(1, 10, { i: "mp_potion" }); });
      await sleep(1200);
      await page.addStyleTag({ content: CSS });
      await page.evaluate(SHAPE(v));
      await page.evaluate(() => { document.querySelectorAll(".toasts .toast").forEach((t) => t.remove()); (window as any).__net.emit("mountcast", { ms: 30000, name: "Телепорт: Сольгард" }); });
      await page.mouse.move(683, 150);
      await sleep(900);
      const m = await page.evaluate(() => {
        const r = (e: Element) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
        const bar = r(document.querySelector(".hud-bar")!), c = r(document.querySelector(".hb-row.r1 .hb-crest, .mk-tier .hb-crest")!);
        const sizes = [...document.querySelectorAll(".mkS")].map((e) => Math.round(e.getBoundingClientRect().width) + "x" + Math.round(e.getBoundingClientRect().height));
        const wings = [...document.querySelectorAll(".mk-wing")].map(r);
        return { bar, c: (c.l + c.r) / 2, chat: r(document.querySelector(".hud-chat")!), cast: document.querySelector("#mount-cast:not([hidden])") ? r(document.querySelector("#mount-cast")!) : null, sizes: [...new Set(sizes)], wings, lock: r(document.querySelector(".hb-lock")!) };
      });
      const off = m.c - (m.bar.l + m.bar.r) / 2;
      console.log(v, "crest off", off.toFixed(2), "bar", Math.round(m.bar.r - m.bar.l), "x", Math.round(m.bar.b - m.bar.t), "slot sizes", m.sizes.join(","), "chat/bar gap", Math.round(m.bar.l - m.chat.r),
        "cast overlap", m.cast ? [m.bar, ...m.wings].some((x) => hit(x, m.cast)) : "n/a", "lock in bar", m.lock.l >= m.bar.l && m.lock.r <= m.bar.r && m.lock.t >= m.bar.t);
      await page.screenshot({ path: path.join(OUT, `${v}.png`) });
      await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 3 });
      await sleep(500);
      await page.screenshot({ path: path.join(OUT, `${v}-zoom.png`), clip: { x: m.bar.l - 20, y: m.bar.t - 70, width: m.bar.r - m.bar.l + 40, height: m.bar.b - m.bar.t + 90 } });
      await page.close(); await ctxB.close();
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
