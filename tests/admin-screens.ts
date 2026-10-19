/**
 * Скриншоты вкладки «Выдача» админ-панели (каталог предметов): tools/out/shot-admin-*.png.
 * Запуск: TEST_PORT=2688 npx tsx tests/admin-screens.ts   (Chrome: переменная CHROME_PATH или стандартные пути)
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { Bot, dbFile, ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5197;
const OUT = path.resolve("tools/out");
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `shot-admin-${name}.png`) });

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
  // игроки онлайн для списка получателей
  const bots = [await Bot.join("Магиня", "secret", "mage"), await Bot.join("Лучник", "secret", "ranger"), await Bot.join("Тень", "secret", "rogue")];
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
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self?.isAdmin, { timeout: 25000 });
    await sleep(1200);
    const click = async (sel: string) => { await page.waitForSelector(sel, { timeout: 5000 }); await page.$eval(sel, (b) => (b as HTMLElement).click()); await sleep(250); };
    await page.evaluate(() => (window as any).__game.scene.getScene("game").hud.toggle("admin"));
    await sleep(500);
    await click('[data-tab="give"]');
    await sleep(900);
    await shot(page, "1-default");

    // оружие → парные мечи, самый верхний предмет, легендарка, заточка +10; получатель — Магиня (маг)
    await page.select("#ag-pick", "Магиня");
    await sleep(300);
    await click('[data-a="grp"][data-v="weapon"]');
    await click('[data-a="cat"][data-v="twinblades"]');
    // маг не носит парные мечи: список пуст, подсказка называет причину и даёт кнопку «Показать для всех классов»
    await shot(page, "2a-class-hidden");
    const hidden = await page.$eval("#ag-cards", (e) => e.textContent ?? "");
    if (!/Скрыто фильтром класса/.test(hidden)) throw new Error("пустой список не объясняет фильтр класса: " + hidden);
    await click('[data-a="cls-all"]');
    await sleep(300);
    await click('.ag-card[data-k="m:twinblades_100"]');
    // редкость 3 у обычной модели недоступна (только у легендарок), доступны 0..2
    const r3 = await page.$eval('[data-a="rar"][data-v="3"]', (b) => (b as HTMLButtonElement).disabled);
    if (!r3) throw new Error("кнопка «Легендарное» у обычной модели не отключена");
    await click('[data-a="rar"][data-v="2"]');
    await click('[data-a="plus"][data-v="10"]');
    // ввод уровня ниже уровня модели: бейдж и предупреждение обновляются сразу, без «Выдать»
    await page.$eval("#ag-ilvl", (el) => { (el as HTMLInputElement).value = "50"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    const ilBadge = await page.$eval("#ag-ilbadge", (e) => e.textContent ?? ""), ilNote = await page.$eval("#ag-ilnote", (e) => e.textContent ?? "");
    if (!ilBadge.includes("100") || !/Ниже уровня модели/.test(ilNote)) throw new Error("бейдж/предупреждение ур. предмета не обновились: " + ilBadge + " | " + ilNote);
    await page.$eval("#ag-ilvl", (el) => el.dispatchEvent(new Event("change", { bubbles: true })));
    const ilVal = await page.$eval("#ag-ilvl", (e) => (e as HTMLInputElement).value);
    if (ilVal !== "100") throw new Error("поле ур. предмета не нормализовано: " + ilVal);
    await shot(page, "2-twinblades-top");

    // броня: матрица слот × тип, ТОП 90+, класс получателя (по умолчанию)
    await page.select("#ag-cls", "auto");
    await click('[data-a="grp"][data-v="armor"]');
    await click('[data-a="top90"]');
    await click('[data-a="rar"][data-v="2"]');
    await click('[data-a="plus"][data-v="7"]');
    const pressed = await page.$$eval('.ag-pl[aria-pressed="true"]', (b) => b.map((x) => x.textContent));
    if (pressed.length !== 1 || pressed[0] !== "+7") throw new Error("заточка: выбрана не одна кнопка: " + pressed);
    await shot(page, "3-armor-top90");

    // бижутерия + «все» классы и получатель-воин: приглушённые строки
    await page.select("#ag-pick", "Админ1");
    await click('[data-a="grp"][data-v="jewelry"]');
    await page.select("#ag-cls", "all");
    await click('[data-a="grp"][data-v="weapon"]');
    await click('[data-a="reset"]');
    await page.select("#ag-pick", "Магиня");
    await page.select("#ag-cls", "all");
    await page.select("#ag-sort", "lvl-asc");
    await sleep(1500);
    await shot(page, "4-all-classes-dim");

    // выдача: «Выдать и надеть» себе (воин ур.1, меч 1 ур.)
    await page.select("#ag-pick", "Админ1");
    await click('[data-a="reset"]');
    await click('[data-a="grp"][data-v="weapon"]');
    await click('[data-a="cat"][data-v="sword"]');
    await page.select("#ag-sort", "lvl-asc");
    await sleep(200);
    await click('.ag-card[data-k="m:sword_1"]');
    await click('[data-a="plus"][data-v="4"]');
    await click('[data-a="give-eq"]');
    await sleep(900);
    await shot(page, "5-give-equip");
    const eq = await page.evaluate(() => { const w = (window as any).__net.self.equip.weapon; return w ? { model: w.model, plus: w.plus, rarity: w.rarity } : null; });
    console.log("надето:", JSON.stringify(eq));
    if (!eq || eq.model !== "sword_1" || eq.plus !== 4) throw new Error("«Выдать и надеть» не сработало: " + JSON.stringify(eq));

    // легендарные и расходники
    await click('[data-a="reset"]');
    await click('[data-a="grp"][data-v="legend"]');
    await page.select("#ag-pick", "Магиня");
    await page.select("#ag-cls", "all");
    await click('.ag-card[data-k="l:nova_staff"]');
    await click('[data-a="plus"][data-v="9"]');
    await shot(page, "6-legendary");
    await click('[data-a="grp"][data-v="stuff"]');
    await click('.ag-card[data-k="s:hp_potion"]');
    await click('[data-a="qty"][data-v="20"]');
    await shot(page, "7-stuff");

    // производительность: переключение групп на полном каталоге
    const ms = (await page.evaluate(`(async () => {
      const q = (s) => document.querySelector(s);
      q('[data-a="reset"]').click();
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) { q('[data-a="grp"][data-v="armor"]').click(); q('[data-a="grp"][data-v="all"]').click(); }
      return (performance.now() - t0) / 40;
    })()`)) as number;
    const cards = await page.$$eval(".ag-card", (c) => c.length);
    console.log(`рендер каталога: ${ms.toFixed(1)} мс на переключение, карточек в DOM: ${cards}`);
  } finally {
    if (errors.length) console.log("ошибки страницы:", errors.slice(0, 8));
    if (process.exitCode || errors.length) await last?.screenshot({ path: path.join(OUT, "shot-admin-fail.png") }).catch(() => {});
    await browser.close();
    await vite.close();
    for (const b of bots) await b.leave().catch(() => {});
    await stopServer();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; setTimeout(() => process.exit(1), 4000); });
