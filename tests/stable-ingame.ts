/**
 * Конюший в игре (задача 142): ЛКМ по конюшему Аурелиона открывает каталог; покупка печати, изучение (маунт в коллекции),
 * сборка из деталей, боевой конь за репутацию и знаки. Снимки → tools/out/stable/.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2859 VITE_TEST_PORT=5259 npx tsx tests/stable-ingame.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { sealBase } from "../shared/mounts";
import { STABLEMASTERS } from "../shared/stables";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5259;
const OUT = path.resolve("tools/out/stable");

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
const dbg = (page: Page, m: object) => page.evaluate((m) => (window as any).__net.send("dbg", m), m);
const self = (page: Page) => page.evaluate(() => { const s = (window as any).__net.self; return { mounts: s.mounts as string[], inv: (s.inventory as ({ base: string; qty?: number; bound?: boolean } | null)[]), gold: s.gold as number, marks: s.marks as number }; });

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1600,900", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], defaultViewport: { width: 1600, height: 900 } });
  const errors: string[] = [];
  try {
    await startServer(true);
    const hero = "Конюшня";
    await ensureChar(hero, "secret", hero, "warrior");
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
    await enter(page, hero);
    const st = STABLEMASTERS.find((n) => n.id === "aurelion_stable")!;
    await dbg(page, { op: "level", v: 45 });
    await dbg(page, { op: "god" });
    await dbg(page, { op: "gold", v: 300000 });
    await dbg(page, { op: "tp", x: st.x - 40, y: st.y - 30 });
    await sleep(2500);
    // ЛКМ по конюшему: точка над ногами его спрайта в экранных координатах
    const at = async () => page.evaluate(() => {
      const g = (window as any).__game, sc = g.scene.getScene("game"), cam = sc.cameras.main, r = g.canvas.getBoundingClientRect();
      const n = sc.npcs.find((n: any) => n.kind === "stable" && n.id === "aurelion_stable");
      if (!n) return null;
      // обратное к cam.getWorldPoint: экран игры → CSS-пиксели страницы
      const w0 = cam.getWorldPoint(0, 0), w1 = cam.getWorldPoint(100, 100);
      const gx = (n.sprite.x - w0.x) * 100 / (w1.x - w0.x), gy = (n.sprite.y - 14 - w0.y) * 100 / (w1.y - w0.y);
      return { x: r.left + gx * r.width / g.scale.width, y: r.top + gy * r.height / g.scale.height };
    });
    // камера догоняет героя после телепорта: точку берём заново перед каждой попыткой
    let opened = false;
    for (let k = 0; k < 4 && !opened; k++) {
      await sleep(700);
      const pt = await at();
      must(pt, "конюший не стоит в мире");
      await page.mouse.move(pt!.x, pt!.y);
      await sleep(300);
      if (k === 0) await page.screenshot({ path: path.join(OUT, "0-npc.png") });
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      opened = await page.waitForSelector(".win-stable:not([hidden])", { timeout: 2500 }).then(() => true, () => false);
    }
    must(opened, "ЛКМ по конюшему не открыла окно");
    await sleep(800);
    console.log("  ok   ЛКМ по конюшему — каталог открыт");
    await page.screenshot({ path: path.join(OUT, "1-catalog.png") });

    // покупка: печать вепря в сумку
    await page.$eval('.win-stable button[data-act="buy"][data-id="boar"]', (b) => (b as HTMLButtonElement).click());
    await sleep(900);
    let s = await self(page);
    const i = s.inv.findIndex((it) => it?.base === sealBase("boar"));
    must(i >= 0, "печать вепря не пришла в сумку");
    must(!s.inv[i]!.bound, "купленная печать не должна быть привязана");
    console.log("  ok   покупка: «Печать скакуна» в сумке, не привязана");
    await page.screenshot({ path: path.join(OUT, "2-bought.png") });
    // изучение печати (как ПКМ по ней в сумке)
    await page.evaluate((i) => (window as any).__net.send("use", { index: i }), i);
    await sleep(900);
    s = await self(page);
    must(s.mounts.includes("boar") && !s.inv.some((it) => it?.base === sealBase("boar")), "изучение: маунт не в коллекции или печать осталась");
    console.log("  ok   изучение: вепрь в коллекции, печать исчезла");

    // сборка медведя из деталей и боевой конь за репутацию и знаки
    for (let k = 0; k < 4; k++) await dbg(page, { op: "item", base: "mpart_saddle" });
    await dbg(page, { op: "item", base: "mpart_barding" });
    await dbg(page, { op: "rep", rep: 1100, marks: 105 });
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, "3-ready.png") });
    // окно пересобирается после каждого ответа сервера: кнопку ищем заново
    const press = async (sel: string) => { await page.$eval(sel, (b) => (b as HTMLButtonElement).click()); await sleep(900); };
    await press('.win-stable button[data-act="craft"][data-id="bear"]');
    await press('.win-stable button[data-act="buy"][data-id="war_horse"]');
    s = await self(page);
    must(s.inv.some((it) => it?.base === sealBase("bear")), "сборка: печать медведя не пришла");
    must(!s.inv.some((it) => it?.base === "mpart_saddle" || it?.base === "mpart_barding"), "сборка: детали не списаны");
    must(s.inv.some((it) => it?.base === sealBase("war_horse")) && s.marks === 5, "боевой конь: печать или списание знаков");
    console.log("  ok   сборка медведя из деталей, боевой конь за репутацию и знаки");
    await page.evaluate(() => document.querySelector('.win-stable button[data-id="lion"]')?.closest(".row")?.scrollIntoView({ block: "center" }));
    await sleep(300);
    await page.screenshot({ path: path.join(OUT, "4-after.png") });

    // окно на двух разрешениях: ничего не вылезает (окно в экране, строки карточек без обрезки, кнопки внутри карточек)
    for (const [vw, vh] of [[1920, 1080], [1366, 768]] as const) {
      await page.setViewport({ width: vw, height: vh });
      await sleep(900);
      await page.evaluate(() => { const b = document.querySelector<HTMLElement>(".win-stable .body"); if (b) b.scrollTop = 0; });
      await page.mouse.move(vw - 5, vh / 2);
      await sleep(300);
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        const w = document.querySelector(".win-stable")!.getBoundingClientRect();
        if (w.left < 0 || w.top < 0 || w.right > innerWidth || w.bottom > innerHeight) out.push(`окно за экраном ${JSON.stringify(w)}`);
        const hs = new Set<number>();
        for (const c of document.querySelectorAll<HTMLElement>(".win-stable .st-card")) {
          const r = c.getBoundingClientRect();
          hs.add(Math.round(r.height));
          for (const l of c.querySelectorAll<HTMLElement>(".st-line")) if (l.scrollWidth > l.clientWidth + 1) out.push(`обрезано: ${l.textContent}`);
          for (const k of c.querySelectorAll<HTMLElement>(".st-act > *, .st-icon")) { const q = k.getBoundingClientRect(); if (q.right > r.right + 0.5 || q.left < r.left - 0.5 || q.bottom > r.bottom + 0.5) out.push(`вылезает в карточке: ${k.className}`); }
        }
        if (hs.size !== 1) out.push(`разная высота карточек: ${[...hs].join(", ")}`);
        for (const c of document.querySelectorAll<HTMLElement>(".win-stable .st-stat")) if (c.scrollWidth > c.clientWidth + 1) out.push(`подвал: ${c.textContent}`);
        return out;
      });
      must(!bad.length, `${vw}×${vh}: ${bad.join("; ")}`);
      await page.screenshot({ path: path.join(OUT, `fix-window-${vw}.png`) });
      console.log(`  ok   окно ${vw}×${vh}: карточки одной высоты, без обрезки и вылезания`);
    }

    // подсказки печати, детали и Печати гладиатора (наведение на ячейку сумки)
    await dbg(page, { op: "item", base: "mpart_saddle" });
    await dbg(page, { op: "item", base: "mpart_gladiator" });
    await sleep(900);
    for (const [base, file] of [[sealBase("bear"), "fix-tip-seal"], ["mpart_saddle", "fix-tip-part"], ["mpart_gladiator", "fix-tip-gladiator"]] as const) {
      const at = await page.evaluate((base) => {
        const s = (window as any).__net.self, i = s.inventory.findIndex((it: any) => it?.base === base);
        const img = [...document.querySelectorAll<HTMLImageElement>(".grid img")].find((im) => im.src.includes(`/icons/${base === "mpart_saddle" ? "mpart_saddle" : base === "mpart_gladiator" ? "mpart_gladiator" : base}.png`));
        if (i < 0 || !img) return null;
        const r = img.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, base);
      must(at, `нет в сумке: ${base}`);
      await page.mouse.move(at!.x, at!.y);
      await sleep(600);
      const tip = await page.evaluate(() => { const t = document.querySelector<HTMLElement>(".tip:not([hidden])"); return t ? t.innerText : ""; });
      must(tip.includes(base.startsWith("mseal_") ? "изучить" : "конюшего"), `${base}: подсказка без нужных строк: ${tip}`);
      await page.screenshot({ path: path.join(OUT, `${file}.png`) });
      console.log(`  ok   подсказка ${base}`);
    }
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("stable-ingame: готово, " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
