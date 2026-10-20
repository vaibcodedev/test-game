/**
 * Браузерная проверка «Настройки → Управление» (задача 115, шаг 9): переназначить умение, обмен при конфликте, Mouse4, запрет, Backspace,
 * перезагрузка сохраняет, новая клавиша работает; окно выбора схемы показывается один раз. Скриншоты: tools/out/shot-ctl-*.png.
 * Запуск: TEST_PORT=2797 npx tsx tests/controls-settings-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5197;
const OUT = path.resolve("tools/out");
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `shot-ctl-${name}.png`) });
function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
async function enter(page: Page, login: string, hero: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#login-name");
  await page.$eval("#login-name", (e) => ((e as HTMLInputElement).value = ""));
  await page.$eval("#login-pass", (e) => ((e as HTMLInputElement).value = ""));
  await page.type("#login-name", login);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${hero}"]`, { timeout: 10000 });
  await page.$eval(`.cs-slot[data-name="${hero}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 30000 });
  await sleep(1200);
}
const chip = (a: string, i: number) => `.win-settings .ctl-chip[data-a="${a}"][data-i="${i}"]`;
const chipText = (page: Page, a: string, i: number) => page.$eval(chip(a, i), (e) => e.textContent);
const hint = (page: Page) => page.$eval("#ctl-hint", (e) => (e as HTMLElement).innerText);
const sent = (page: Page, type: string) => page.evaluate((t) => ((window as any).__sent as [string, any][]).filter((m) => m[0] === t).length, type);
async function openSettings(page: Page) {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".gmenu-back:not([hidden]) .gm-item", { timeout: 3000 });
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".gm-item")].find((b) => b.textContent?.includes("Настройки"))!.click());
  await page.waitForSelector(".win-settings:not([hidden]) #ctl-groups");
  await sleep(200);
}
/** Нажать на сочетание в списке (окно настроек прокручивается). */
const clickChip = async (page: Page, a: string, i: number) => {
  await page.$eval(chip(a, i), (e) => (e as HTMLElement).scrollIntoView({ block: "center" }));
  await page.click(chip(a, i));
  await sleep(100);
};
const preset = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("keybinds:v1")!).preset as string);

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("Управа", "secret", "Управа", "warrior");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,900", "--no-sandbox"],
    defaultViewport: { width: 1280, height: 900 },
  });
  const errors: string[] = [];
  let n = 0;
  const ok = (s: string) => { n++; console.log("  ok   " + s); };
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  try {
    const mk = async () => {
      const p = await browser.newPage();
      // только первая загрузка: дальше настройки живут в localStorage, как у игрока
      await p.evaluateOnNewDocument(() => {
        if (!localStorage.getItem("ctl:init")) { localStorage.setItem("ctl:init", "1"); localStorage.setItem("keybinds:v1", JSON.stringify({ v: 1, preset: "classic", custom: {} })); }
      });
      p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      p.on("pageerror", (e) => errors.push(String(e)));
      return p;
    };
    let page = await mk();
    await enter(page, "Управа", "Управа");
    await openSettings(page);
    await shot(page, "1-settings");

    // 1. умение 1 → Z
    must((await chipText(page, "slot1", 0)) === "1", "исходная клавиша слота 1: " + (await chipText(page, "slot1", 0)));
    await clickChip(page, "slot1", 0);
    must((await chipText(page, "slot1", 0)) === "Нажмите клавишу", "нет приглашения «Нажмите клавишу»");
    await page.keyboard.press("KeyZ");
    await sleep(150);
    must((await chipText(page, "slot1", 0)) === "Z", "слот 1 не стал Z: " + (await chipText(page, "slot1", 0)));
    must((await page.$$eval(".hud-bar .hb-row.r1 .hb-slot kbd", (els) => els[0].textContent)) === "Z", "панель не обновила подпись");
    ok("клик → «Нажмите клавишу» → Z: список и панель умений сразу показывают Z");

    // 2. Esc — отмена, Backspace — очистить
    await clickChip(page, "slot3", 0);
    await page.keyboard.press("Escape");
    await sleep(150);
    must((await chipText(page, "slot3", 0)) === "3", "Esc не отменил");
    must(await page.$eval(".win-settings", (e) => !(e as HTMLElement).hidden), "Esc закрыл окно настроек вместо отмены");
    await clickChip(page, "slot3", 0);
    await page.keyboard.press("Backspace");
    await sleep(400);
    must((await page.$eval("#ctl-groups", (e) => [...e.querySelectorAll(".ctl-row")].find((r) => r.textContent?.includes("Умение 3"))!.querySelector(".ctl-chip")!.textContent)) === "—", "Backspace не очистил слот 3: " + (await page.$eval("#ctl-groups", (e) => [...e.querySelectorAll(".ctl-row")].find((r) => r.textContent?.includes("Умение 3"))?.textContent)));
    ok("Esc отменяет (окно не закрывается), Backspace очищает сочетание");

    // 3. запрещённое
    await clickChip(page, "slot4", 0);
    await page.keyboard.press("F12");
    await sleep(120);
    must(/занято браузером/.test(await hint(page)), "нет подсказки про F12: " + (await hint(page)));
    must((await chipText(page, "slot4", 0)) === "Нажмите клавишу", "после запрета ожидание должно продолжаться");
    await shot(page, "2-forbidden");
    await page.keyboard.down("ControlLeft");
    await page.keyboard.press("KeyW");
    await page.keyboard.up("ControlLeft");
    await sleep(120);
    must((await chipText(page, "slot4", 0)) === "Нажмите клавишу", "Ctrl+W принят");
    ok("F12 и Ctrl+W не принимаются: подсказка, ожидание продолжается");

    // 4. Mouse4
    await page.mouse.down({ button: "back" });
    await page.mouse.up({ button: "back" });
    await sleep(150);
    must((await chipText(page, "slot4", 0)) === "Mouse4", "Mouse4 не назначилась: " + (await chipText(page, "slot4", 0)));
    ok("боковая кнопка мыши назначается (Mouse4)");

    // 5. конфликт: слот 5 на «2» (занято слотом 2)
    await clickChip(page, "slot5", 0);
    await page.keyboard.press("Digit2");
    await page.waitForSelector(".ctl-ask");
    await shot(page, "3-swap");
    await page.click('.ctl-ask [data-i="0"]');
    await sleep(150);
    must((await chipText(page, "slot5", 0)) === "2" && (await chipText(page, "slot2", 0)) === "5", `обмен: слот5=${await chipText(page, "slot5", 0)} слот2=${await chipText(page, "slot2", 0)}`);
    await clickChip(page, "slot6", 0);
    await page.keyboard.press("Digit2");
    await page.waitForSelector(".ctl-ask");
    await page.keyboard.press("Escape");
    await sleep(150);
    must((await chipText(page, "slot6", 0)) === "6" && (await chipText(page, "slot5", 0)) === "2", "отказ от обмена изменил клавиши");
    ok("конфликт: предложено поменять местами; «Поменять» меняет, Esc оставляет как было");

    // 6. опции
    await page.evaluate(() => document.querySelector("#ctl-opts")!.scrollIntoView());
    await page.click("#ctl-autoTarget");
    await page.click('#ctl-aim [data-m="confirm"]');
    await page.$eval("#ctl-queueMs", (e) => { const i = e as HTMLInputElement; i.value = "250"; i.dispatchEvent(new Event("input", { bubbles: true })); });
    await shot(page, "4-options");
    const mo = await page.evaluate(() => JSON.parse(localStorage.getItem("mouse:v1")!));
    must(mo.autoTarget === true && mo.aimMode === "confirm" && mo.queueMs === 250, "опции не сохранились: " + JSON.stringify(mo));
    await page.click("#ctl-autoTarget");
    await page.click('#ctl-aim [data-m="preview"]'); // дальше проверяем каст: режим прицела по умолчанию
    ok("опции мыши и прицела пишутся в mouse:v1");

    // 7. смена схемы с подтверждением (есть свои назначения)
    await page.evaluate(() => document.querySelector("#ctl-preset")!.scrollIntoView());
    await page.click('#ctl-preset [data-p="action"]');
    await page.waitForSelector(".ctl-ask");
    await page.click('.ctl-ask [data-i="1"]');
    await sleep(100);
    must((await preset(page)) === "classic", "отмена всё равно сменила схему");
    await page.click('#ctl-preset [data-p="action"]');
    await page.waitForSelector(".ctl-ask");
    await page.click('.ctl-ask [data-i="0"]');
    await sleep(150);
    must((await chipText(page, "slot1", 0)) === "Q", "схема «Экшен» не применилась");
    ok("смена схемы просит подтверждение при своих назначениях");

    // 8. перезагрузка: своя клавиша живёт и работает
    await page.click('#ctl-preset [data-p="classic"]'); // своих назначений нет — без вопроса
    await sleep(150);
    await clickChip(page, "slot1", 0);
    await page.keyboard.press("KeyZ");
    await sleep(150);
    await page.close(); // старая сессия держит героя в мире
    await sleep(1500);
    page = await mk();
    await enter(page, "Управа", "Управа");
    await page.evaluate(() => {
      const w = window as any, net = w.__net, orig = net.send.bind(net);
      w.__sent = [];
      net.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); };
    });
    must((await page.$$eval(".hud-bar .hb-row.r1 .hb-slot kbd", (els) => els[0].textContent)) === "Z", "после перезагрузки подпись не Z");
    const map = generateMap(MAP_SEED);
    const spawn = map.spawns.map((s) => ({ s, d: Math.hypot(s.x - map.playerSpawn.x, s.y - map.playerSpawn.y) })).sort((a, b) => a.d - b.d)[0].s;
    await page.evaluate((x, y) => { const net = (window as any).__net; net.send("dbg", { op: "god" }); net.send("dbg", { op: "tp", x, y }); }, spawn.x + 40, spawn.y);
    await sleep(2000);
    for (let i = 0; i < 8 && !(await page.evaluate(() => (window as any).__game.scene.getScene("game").targetId)); i++) { await page.keyboard.press("Tab"); await sleep(600); }
    const before = await sent(page, "skill");
    await page.keyboard.press("KeyZ");
    await sleep(300);
    must((await sent(page, "skill")) > before, "Z после перезагрузки не кастует умение 1: " + JSON.stringify(await page.evaluate(() => ({ t: (window as any).__game.scene.getScene("game").targetId, sent: (window as any).__sent.map((m: any) => m[0]), toasts: document.querySelector<HTMLElement>(".toasts")?.innerText }))));
    ok("после перезагрузки слот 1 = Z и Z кастует умение");

    // 9. окно выбора схемы — один раз
    await page.evaluate(() => { localStorage.removeItem("controls:scheme-chosen"); localStorage.setItem("controls:force-offer", "1"); });
    await page.close();
    await sleep(1500);
    page = await mk();
    await enter(page, "Управа", "Управа");
    must(await page.$(".ctl-ask"), "окно выбора схемы не показано");
    await shot(page, "5-offer");
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".ctl-ask [data-i]")].find((b) => b.textContent === "Экшен")!.click());
    await sleep(200);
    must((await preset(page)) === "action", "выбор «Экшен» не применился");
    await page.close();
    await sleep(1500);
    page = await mk();
    await enter(page, "Управа", "Управа");
    must(!(await page.$(".ctl-ask")), "окно выбора показано повторно");
    ok("окно выбора схемы появляется один раз");

    const bad = errors.filter((e) => !/Failed to load resource|favicon/i.test(e));
    console.log(bad.length ? "Ошибки страницы:\n" + bad.slice(0, 15).join("\n") : "Ошибок страницы нет");
    must(!bad.length, "ошибки в консоли страницы");
    console.log(`\nБраузерные проверки пройдены: ${n}`);
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
}
main().catch((e) => { console.error(e); stopServer().finally(() => process.exit(1)); });
