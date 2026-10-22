/**
 * Карта мира в режиме телепорта админа (админ-панель → «Мир» → «Телепорт» → «Карта»): проверки сценария в Chrome и снимки tools/out/shot-admin-tp-*.png.
 * Окно админки прячется; у карты прицел, подсказка и подпись «тайл и зона» под курсором; перетаскивание не телепортирует; Esc возвращает окно админки;
 * клик телепортирует (admin:tp { x, y }) и закрывает карту.
 * Запуск: TEST_PORT=2735 VITE_TEST_PORT=5235 npx tsx tests/admin-tp-screens.ts   (Chrome: переменная CHROME_PATH или стандартные пути)
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { TILE } from "../shared/constants";
import { dbFile, ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5197;
const OUT = path.resolve("tools/out");
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `shot-admin-tp-${name}.png`) });
const must: (cond: unknown, msg: string) => asserts cond = (cond, msg) => { if (!cond) throw new Error(msg); };

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("Админ1", "secret", "Админ1", "warrior");
  const d = new DatabaseSync(dbFile);
  d.prepare("UPDATE players SET admin = 1 WHERE name_key = 'админ1'").run();
  d.close();
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900", "--no-sandbox"],
    defaultViewport: { width: 1440, height: 900 },
  });
  const errors: string[] = [];
  let last: Page | undefined;
  try {
    const page = await browser.newPage();
    last = page;
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await page.waitForSelector("#login-name");
    await page.type("#login-name", "Админ1");
    await page.type("#login-pass", "secret");
    await page.click("#login-go");
    await page.waitForSelector('.cs-slot[data-name="Админ1"]', { timeout: 10000 });
    await page.$eval('.cs-slot[data-name="Админ1"]', (b) => (b as HTMLElement).click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self?.isAdmin, { timeout: 90000 });
    await sleep(1500);

    const click = async (sel: string) => { await page.waitForSelector(sel, { timeout: 5000 }); await page.$eval(sel, (b) => (b as HTMLElement).click()); await sleep(250); };
    const shown = (sel: string) => page.evaluate((s) => { const e = document.querySelector<HTMLElement>(s); return !!e && !e.hidden && getComputedStyle(e).display !== "none"; }, sel);
    const pos = () => page.evaluate(() => { const n = (window as any).__net; const p = n.room.state.players.get(n.id); return { x: p.x as number, y: p.y as number }; });
    const canvas = async () => page.$eval(".wm-view canvas", (c) => { const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    const tipText = () => page.evaluate(() => { const t = document.querySelector<HTMLElement>(".wm-tip"); return t && !t.hidden ? t.innerText.replace(/\s+/g, " ").trim() : ""; });
    const openPicker = async () => {
      await click('[data-act="tp-map"]');
      await sleep(500);
      must(await shown(".win-worldmap"), "карта не открылась по кнопке «Карта»");
      must(!(await shown(".win-admin")), "окно админки осталось поверх карты");
    };

    // 1. раздел «Телепорт»: кнопка «Карта»
    await page.evaluate(() => (window as any).__game.scene.getScene("game").hud.toggle("admin"));
    await sleep(500);
    await click('[data-tab="world"]');
    await sleep(300);
    const btn = await page.$eval('[data-act="tp-map"]', (b) => b.textContent);
    must(btn === "Карта", "нет кнопки «Карта» в разделе «Телепорт»: " + btn);
    await shot(page, "1-section");

    // 2. карта в режиме телепорта: окно админки спрятано, рамка на тайле вместо курсора, подсказка, под курсором тайл и зона
    const before = await pos();
    await openPicker();
    must(await page.$eval(".wm", (e) => e.classList.contains("picking")), "у карты нет режима выбора точки");
    const cursor = await page.$eval(".wm-view canvas", (c) => getComputedStyle(c).cursor);
    // курсор — золотая рамка на тайле, её рисует карта; курсор страницы над картой спрятан, чтобы не было двух прицелов
    must(cursor === "none", "над картой виден второй курсор: " + cursor);
    const hint = await page.$eval(".wm .chip", (e) => (e as HTMLElement).hidden ? "" : (e as HTMLElement).innerText);
    must(hint === "Клик — телепорт сюда · Esc — выход", "подсказка: " + JSON.stringify(hint));
    let r = await canvas();
    await page.mouse.move(r.x + r.w * 0.5, r.y + r.h * 0.5);
    await sleep(300);
    const tip0 = await tipText();
    must(/^Тайл \d+, \d+ \S/.test(tip0), "под курсором нет тайла и зоны: " + JSON.stringify(tip0));
    console.log("общий план, под курсором:", tip0);
    await shot(page, "2-map");

    // 3. приближение к герою: рамка тайла и риски прицела видны на местности
    await page.$$eval(".wm-btn", (bs) => (bs.find((b) => b.textContent?.startsWith("Центр")) as HTMLElement).click());
    await sleep(400);
    r = await canvas();
    const aim = { x: r.x + r.w / 2 + 90, y: r.y + r.h / 2 + 40 };
    await page.mouse.move(aim.x, aim.y);
    await sleep(300);
    const tip1 = await tipText();
    must(/^Тайл \d+, \d+ \S/.test(tip1), "при приближении под курсором нет тайла и зоны: " + JSON.stringify(tip1));
    console.log("вблизи, под курсором:", tip1);
    await shot(page, "3-zoom");

    // 4. перетаскивание карты кликом не считается: телепорта нет, режим остаётся
    await page.mouse.down();
    await page.mouse.move(aim.x + 60, aim.y + 30, { steps: 6 });
    await page.mouse.up();
    await sleep(500);
    const afterDrag = await pos();
    must(await shown(".win-worldmap") && await page.$eval(".wm", (e) => e.classList.contains("picking")), "перетаскивание закрыло карту или выключило режим");
    must(Math.hypot(afterDrag.x - before.x, afterDrag.y - before.y) < 2, "перетаскивание телепортировало героя: " + JSON.stringify([before, afterDrag]));

    // 5. Esc: выход из режима, окно админки возвращается, телепорта нет
    await page.keyboard.press("Escape");
    await sleep(500);
    must(!(await shown(".win-worldmap")), "Esc не закрыл карту");
    must(await shown(".win-admin"), "после Esc окно админки не вернулось");
    must(!(await page.$eval(".wm", (e) => e.classList.contains("picking"))), "после Esc режим выбора остался");
    const afterEsc = await pos();
    must(Math.hypot(afterEsc.x - before.x, afterEsc.y - before.y) < 2, "Esc телепортировал героя");
    await shot(page, "4-after-esc");

    // 6. клик по карте: телепорт к выбранному тайлу (или к ближайшей проходимой клетке), карта закрывается
    await openPicker();
    r = await canvas();
    const cx = r.x + r.w / 2 + 90, cy = r.y + r.h / 2 + 40;
    await page.mouse.move(cx - 20, cy);
    await page.mouse.move(cx, cy);
    await sleep(300);
    const tip2 = await tipText();
    const m = /^Тайл (\d+), (\d+)/.exec(tip2);
    must(m, "перед кликом нет подписи тайла: " + JSON.stringify(tip2));
    const want = { x: (Number(m[1]) + 0.5) * TILE, y: (Number(m[2]) + 0.5) * TILE };
    await page.mouse.click(cx, cy);
    for (let i = 0; i < 20 && Math.hypot((await pos()).x - before.x, (await pos()).y - before.y) < 8; i++) await sleep(150);
    const landed = await pos();
    const off = Math.hypot(landed.x - want.x, landed.y - want.y) / TILE;
    console.log(`клик по тайлу ${m[1]}, ${m[2]}: герой в ${Math.round(landed.x)}, ${Math.round(landed.y)}, от цели ${off.toFixed(2)} тайла`);
    must(Math.hypot(landed.x - before.x, landed.y - before.y) >= 8, "клик по карте не телепортировал героя");
    must(off <= 6.5, `герой дальше 6 тайлов от выбранной точки: ${off.toFixed(2)}`);
    must(!(await shown(".win-worldmap")), "после клика карта осталась открытой");
    must(!(await shown(".win-admin")), "после клика окно админки вернулось и закрывает место телепорта");
    must(!(await page.$eval(".wm", (e) => e.classList.contains("picking"))), "после клика режим выбора остался");
    await sleep(1500);
    await shot(page, "5-after-click");

    // 7. обычная карта (клавиша M) без режима: прицела и подсказки нет
    await page.evaluate(() => (window as any).__game.scene.getScene("game").hud.openWorldMap());
    await sleep(400);
    must(!(await page.$eval(".wm .chip", (e) => !(e as HTMLElement).hidden)), "подсказка телепорта видна на обычной карте");
    const cur2 = await page.$eval(".wm-view canvas", (c) => getComputedStyle(c).cursor);
    must(cur2 !== "none" && cur2.includes("cursor_take.png"), "на обычной карте нет руки: " + cur2);
    console.log("сценарий пройден");
  } finally {
    if (errors.length) console.log("ошибки страницы:", errors.slice(0, 8));
    if (process.exitCode || errors.length) await last?.screenshot({ path: path.join(OUT, "shot-admin-tp-fail.png") }).catch(() => {});
    await browser.close();
    await vite.close();
    await stopServer();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; setTimeout(() => process.exit(1), 4000); });
