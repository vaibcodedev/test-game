/**
 * Браузерная проверка ввода (задача 115, шаг 1): нынешние клавиши работают через раскладку «Классика»; после ползунка громкости
 * и флажка WASD ходят сразу; в чате хоткеи молчат; Ctrl+C не открывает «Героя»; кнопка HUD не нажимается второй раз от Пробела;
 * справка, приветствие и подписи панели строятся из раскладки («1–9»); Tab и F1–F5 не доходят до браузера.
 * Скриншоты: tools/out/shot-keys-*.png. Запуск: TEST_PORT=2796 npx tsx tests/keybinds-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type KeyInput, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5196;
const OUT = path.resolve("tools/out");
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `shot-keys-${name}.png`) });

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

async function enter(page: Page, login: string, hero: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#login-name");
  await page.type("#login-name", login);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${hero}"]`, { timeout: 10000 });
  await page.$eval(`.cs-slot[data-name="${hero}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 30000 });
}

const pos = (page: Page) => page.evaluate(() => { const n = (window as any).__net; const p = n.room.state.players.get(n.id); return { x: p.x as number, y: p.y as number }; });
/** Удержать клавишу; возвращает направление движения, которое сцена видела в середине удержания (не зависит от стен на пути героя). */
const hold = async (page: Page, code: KeyInput, ms = 500) => {
  await page.keyboard.down(code);
  await sleep(ms / 2);
  const axis = (await page.evaluate(() => (window as any).__game.scene.getScene("game").held.axis())) as { mx: number; my: number };
  await sleep(ms / 2);
  await page.keyboard.up(code);
  await sleep(250);
  return axis;
};
const open = (page: Page, sel: string) => page.evaluate((s) => { const e = document.querySelector<HTMLElement>(s); return !!e && !e.hidden; }, sel);
const active = (page: Page) => page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return a ? (a.id || a.tagName) : ""; });
const sent = (page: Page, type: string) => page.evaluate((t) => ((window as any).__sent as [string, any][]).filter((m) => m[0] === t).map((m) => m[1]), type);
const clearSent = (page: Page) => page.evaluate(() => { (window as any).__sent.length = 0; });
const toasts = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>(".toasts")?.innerText ?? "");
const scene = (page: Page) => page.evaluate(() => { const s = (window as any).__game.scene.getScene("game"); return { target: s.targetId as string | null, units: s.units.size as number }; });
const diag = (page: Page) => page.evaluate(() => { const s = (window as any).__game.scene.getScene("game"); const a = document.activeElement as HTMLElement | null; return JSON.stringify({ fps: Math.round((window as any).__game.loop.actualFps), typing: s.hud.isTyping(), active: `${a?.tagName}#${a?.id}`, axis: s.held.axis(), keys: (window as any).__keys.slice(-3) }); });
const wins = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".win, .gmenu-back")].filter((e) => !e.hidden).map((e) => e.className).join(" | "));
/** Закрыть всё открытое (Пробел у NPC открывает его окно): Esc, пока что-то есть. */
const closeAll = async (page: Page) => { for (let i = 0; i < 5 && (await wins(page)); i++) { await page.keyboard.press("Escape"); await sleep(150); } };
const clickMenuItem = async (page: Page, text: string) => {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".gmenu-back:not([hidden]) .gm-item", { timeout: 3000 });
  await page.evaluate((t) => [...document.querySelectorAll<HTMLButtonElement>(".gm-item")].find((b) => b.textContent?.includes(t))!.click(), text);
  await sleep(250);
};

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("Клавиши", "secret", "Клавиши", "warrior");
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox"],
    defaultViewport: { width: 1280, height: 800 },
  });
  const errors: string[] = [];
  let n = 0;
  const ok = (s: string) => { n++; console.log("  ok   " + s); };
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  try {
    const page = await browser.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await enter(page, "Клавиши", "Клавиши");
    await sleep(1500);
    // запись исходящих сообщений и нажатий (listener после сцены: defaultPrevented уже решён игрой)
    await page.evaluate(() => {
      const w = window as any, net = w.__net, orig = net.send.bind(net);
      w.__sent = [];
      net.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); };
      w.__keys = [];
      window.addEventListener("keydown", (e) => w.__keys.push({ code: e.code, ctrl: e.ctrlKey, prevented: e.defaultPrevented }));
    });
    await shot(page, "0-game");
    await page.evaluate(() => {
      const w = window as any, h = w.__game.scene.getScene("game").hud, o = h.escape.bind(h);
      w.__esc = [];
      h.escape = (has: boolean, clear: () => void) => { w.__esc.push({ has, menu: h.gameMenu.isOpen, wins: [...document.querySelectorAll<HTMLElement>(".win")].filter((e) => !e.hidden).map((e) => e.className) }); return o(has, clear); };
    });

    // 0. подписи из раскладки
    const kbd = await page.$$eval(".hud-bar .slot kbd", (els) => els.map((e) => e.textContent));
    must(JSON.stringify(kbd.slice(0, 9)) === JSON.stringify(["1", "2", "3", "4", "5", "6", "7", "8", "9"]), "подписи умений: " + kbd.join(","));
    must(kbd.slice(-4).join(",") === "Q,E,X,G", "подписи зелий, маунта, питомца: " + kbd.join(","));
    const log = await page.$eval(".hud-chat .log", (e) => (e as HTMLElement).innerText);
    must(log.includes("Умения: 1–9") && log.includes("Арена — клавиша P"), "приветствие: " + log.slice(0, 160));
    ok("панель и приветствие построены из раскладки: 1–9, Q, E, X, G, «Умения: 1–9»");

    // 1. ходьба
    let moved = 0;
    for (const [code, mx, my] of [["KeyD", 1, 0], ["KeyA", -1, 0], ["KeyS", 0, 1], ["KeyW", 0, -1], ["ArrowRight", 1, 0], ["ArrowLeft", -1, 0], ["ArrowDown", 0, 1], ["ArrowUp", 0, -1]] as const) {
      const a = await pos(page);
      const ax = await hold(page, code);
      const b = await pos(page);
      must(ax.mx === mx && ax.my === my, `${code}: сцена видит направление ${JSON.stringify(ax)}`);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 8) moved++;
    }
    must(moved >= 6, `герой сдвинулся только от ${moved} из 8 клавиш`);
    ok(`WASD и стрелки задают направление, герой идёт (${moved} из 8 сдвинули его)`);
    {
      // Shift не мешает ходьбе
      await page.keyboard.down("ShiftLeft");
      const ax = await hold(page, "KeyD");
      await page.keyboard.up("ShiftLeft");
      must(ax.mx === 1 && ax.my === 0, "Shift+D не идёт: " + JSON.stringify(ax));
      ok("Shift+D идёт, как D");
    }

    // 2. после ползунка громкости и флажка
    await clickMenuItem(page, "Настройки");
    await page.waitForSelector(".win-settings:not([hidden]) #set-vol");
    await shot(page, "1-settings");
    await page.click("#set-vol");
    must((await active(page)) !== "set-vol", "после клика ползунок остался в фокусе");
    {
      const ax = await hold(page, "KeyD");
      must(ax.mx === 1, `после ползунка громкости WASD не работает: ${JSON.stringify(ax)} ${await diag(page)}`);
    }
    ok("после клика по ползунку громкости WASD работают сразу (ползунок теряет фокус)");
    await page.focus("#set-vol");
    must((await active(page)) === "set-vol", "не удалось поставить фокус на ползунок");
    {
      const v0 = await page.$eval("#set-vol", (e) => (e as HTMLInputElement).value);
      const arrow = await hold(page, "ArrowRight");
      const wasd = await hold(page, "KeyD");
      must(arrow.mx === 1 && wasd.mx === 1, `с фокусом на ползунке герой не идёт: ${JSON.stringify([arrow, wasd])} ${await diag(page)}`);
      must((await page.$eval("#set-vol", (e) => (e as HTMLInputElement).value)) === v0, "стрелка сдвинула ползунок вместо хоткея");
    }
    ok("даже при фокусе на ползунке WASD и стрелки ведут героя, ползунок не двигается");
    await page.click("#set-mute");
    must((await active(page)) !== "set-mute", "флажок остался в фокусе");
    {
      const ax = await hold(page, "KeyA");
      must(ax.mx === -1, "после флажка WASD не работает: " + JSON.stringify(ax));
    }
    await page.click("#set-mute");
    ok("после флажка WASD работают сразу");
    // список клавиш в настройках — из раскладки
    const setKeys = await page.$eval(".win-settings dl.keys", (e) => (e as HTMLElement).innerText);
    must(setKeys.includes("1–9") && !setKeys.includes("1–4"), "настройки: " + setKeys);
    await page.keyboard.press("Escape");
    await sleep(200);
    must(!(await open(page, ".win-settings")), "Esc не закрыл настройки");
    ok("Esc закрывает верхнее окно; «Горячие клавиши» в настройках — «1–9»");

    // 3. кнопка HUD не нажимается второй раз
    await page.click(".hud-menu .mbtn");
    await sleep(200);
    must(await open(page, ".win-inv"), "кнопка «Сумка» не открыла сумку");
    must((await active(page)) === "BODY", "кнопка HUD осталась в фокусе: " + (await active(page)));
    await page.keyboard.press("Space");
    await sleep(250);
    must(await open(page, ".win-inv"), "Пробел повторно нажал кнопку «Сумка» (окно закрылось)");
    await page.keyboard.press("KeyI");
    await sleep(200);
    must(!(await open(page, ".win-inv")), "I не закрыла сумку");
    await closeAll(page);
    ok("кнопка HUD теряет фокус после клика: Пробел её не нажимает снова, I закрывает сумку");

    // 4. Ctrl+C и окна
    await page.keyboard.down("ControlLeft");
    await page.keyboard.press("KeyC");
    await page.keyboard.up("ControlLeft");
    await sleep(200);
    must(!(await open(page, ".win-char")), "Ctrl+C открыл «Героя»");
    ok("Ctrl+C не открывает «Героя»");
    for (const [code, sel] of [["KeyC", ".win-char"], ["KeyI", ".win-inv"], ["KeyK", ".win-skills"], ["KeyM", ".win-worldmap"], ["KeyB", ".win-bestiary"], ["KeyP", ".win-arena"]] as const) {
      await page.keyboard.press(code);
      await sleep(250);
      must(await open(page, sel), `${code} не открыла ${sel}`);
      await page.keyboard.press(code);
      await sleep(250);
      must(!(await open(page, sel)), `${code} не закрыла ${sel}`);
    }
    ok("C, I, K, M, B, P открывают и закрывают свои окна");

    // 5. чат: Enter, хоткеи молчат, Esc
    await page.keyboard.press("Enter");
    must((await active(page)) === "chat-input", "Enter не поставил фокус в чат: " + (await active(page)));
    {
      const a = await pos(page);
      await clearSent(page);
      await page.keyboard.down("KeyD");
      await sleep(400);
      await page.keyboard.up("KeyD");
      await page.keyboard.type("1wc");
      await sleep(250);
      const b = await pos(page);
      must(Math.abs(b.x - a.x) < 4, "в чате герой пошёл");
      must(!(await open(page, ".win-char")), "в чате сработал хоткей C");
      must((await sent(page, "skill")).length === 0, "в чате сработало умение");
      must((await page.$eval("#chat-input", (e) => (e as HTMLInputElement).value)).endsWith("1wc"), "текст не попал в чат");
    }
    await page.keyboard.press("Escape");
    must((await active(page)) === "BODY", "Esc не снял фокус с чата");
    must(!(await open(page, ".gmenu-back:not([hidden])")), "Esc в чате открыл меню");
    await page.$eval("#chat-input", (e) => ((e as HTMLInputElement).value = ""));
    await page.keyboard.press("KeyC");
    await sleep(200);
    must(await open(page, ".win-char"), "после чата хоткеи не работают");
    await page.keyboard.press("KeyC");
    ok("Enter — чат; в чате ни ходьба, ни хоткеи; Esc возвращает управление");

    // 6. Q, X, G уходят на сервер
    await clearSent(page);
    await page.keyboard.press("KeyQ");
    await sleep(200);
    must((await sent(page, "use")).length === 1 || (await toasts(page)).includes("зелий"), "Q: ни use, ни «Нет зелий»");
    await page.keyboard.press("KeyX");
    await page.keyboard.press("KeyG");
    await sleep(200);
    must((await sent(page, "mount:toggle")).length === 1, "X не отправил mount:toggle");
    must((await sent(page, "pet:toggle")).length === 1, "G не отправил pet:toggle");
    ok("Q (зелье), X (маунт), G (питомец) доходят до сервера");

    // 7. Tab, умение 1, Esc: цель
    await closeAll(page);
    const map = generateMap(MAP_SEED);
    const spawn = map.spawns.map((s) => ({ s, d: Math.hypot(s.x - map.playerSpawn.x, s.y - map.playerSpawn.y) })).sort((a, b) => a.d - b.d)[0].s;
    await page.evaluate((x, y) => { const net = (window as any).__net; net.send("dbg", { op: "god" }); net.send("dbg", { op: "tp", x, y }); }, spawn.x + 40, spawn.y);
    await sleep(2000);
    await page.keyboard.press("Tab");
    await sleep(300);
    const sc = await scene(page);
    must(sc.target, `Tab не выбрал цель (юнитов ${sc.units}, спавн ${spawn.mob})`);
    ok("Tab выбирает ближайшего врага");
    await clearSent(page);
    await page.keyboard.press("Digit1");
    await sleep(250);
    const sk = await sent(page, "skill");
    must(sk.length === 1, "Digit1: умение не ушло " + JSON.stringify(sk) + " " + (await toasts(page)));
    ok("1 кастует первое умение");
    await shot(page, "2-target");
    await page.keyboard.press("Escape");
    await sleep(200);
    { const t = (await scene(page)).target; must(!t, `Esc не снял цель ${t}; открыто: ${await wins(page)}; ${await diag(page)}; esc ${JSON.stringify(await page.evaluate(() => (window as any).__esc))}`); }
    ok("Esc без окон снимает цель");

    // 8. NPC: F и Пробел у торговки
    await page.evaluate((x, y) => (window as any).__net.send("dbg", { op: "tp", x, y }), map.merchant.x, map.merchant.y + 26);
    await sleep(1200);
    await page.keyboard.press("KeyF");
    await sleep(300);
    must(await open(page, ".win-shop"), "F не открыла торговку");
    await page.keyboard.press("Escape");
    await sleep(200);
    must(!(await open(page, ".win-shop")), "Esc не закрыл торговку");
    await page.keyboard.press("Space");
    await sleep(300);
    must(await open(page, ".win-shop"), "Пробел не открыл торговку");
    await shot(page, "3-shop");
    await page.keyboard.press("Escape");
    await sleep(200);
    ok("F и Пробел у торговки открывают магазин, Esc закрывает");

    // 9. Esc открывает и закрывает меню; справка
    await page.keyboard.press("Escape");
    await sleep(200);
    must(await open(page, ".gmenu-back"), "Esc не открыл меню");
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>(".gm-item")].find((b) => b.textContent?.includes("Помощь"))!.click());
    await sleep(300);
    const help = await page.$eval(".win-help .keys", (e) => (e as HTMLElement).innerText);
    must(help.includes("1–9") && !help.includes("1–4") && help.includes("G / Shift+G"), "справка: " + help);
    await shot(page, "4-help");
    await page.keyboard.press("Escape");
    await sleep(200);
    ok("Esc — меню; справка показывает «1–9» и питомца (G / Shift+G)");

    // 10. Tab и F1–F5 не доходят до браузера, Ctrl+C — доходит
    await page.evaluate(() => { (window as any).__keys.length = 0; (window as any).__alive = 1; });
    const fkeys = ["Tab", "F1", "F2", "F3", "F4", "F5"] as const;
    for (const code of fkeys) { await page.keyboard.press(code); await sleep(80); }
    await page.keyboard.down("ControlLeft");
    await page.keyboard.press("KeyC");
    await page.keyboard.up("ControlLeft");
    await sleep(300);
    const keys = (await page.evaluate(() => (window as any).__keys)) as { code: string; ctrl: boolean; prevented: boolean }[];
    for (const code of fkeys) must(keys.find((k) => k.code === code)?.prevented, `${code}: умолчание браузера не отменено`);
    must(keys.find((k) => k.code === "KeyC" && k.ctrl)?.prevented === false, "Ctrl+C отменён (копирование сломано)");
    must((await page.evaluate(() => (window as any).__alive)) === 1, "F5 перезагрузила страницу");
    ok("Tab и F1–F5 — preventDefault; Ctrl+C остаётся браузеру");

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

main().catch((e) => {
  console.error(e);
  stopServer().finally(() => process.exit(1));
});
