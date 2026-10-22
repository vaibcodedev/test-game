/**
 * Браузерная проверка двух решений по интерфейсу: эмблема на экране загрузки и окно «Авторы» в меню Esc.
 *
 * Экран загрузки (нужен только Vite): эмблема над названием целым множителем пикселя экрана — ×2 на 1280×800, ×3 на 1920×1080, ×1 на низких окнах,
 * при масштабе экрана 125% и 150% пиксель картинки ложится на целое число пикселей экрана; снимки «до | после» (слева без эмблемы).
 * Название «Пепельный Предел» стоит в одну строку при масштабе 80–175% (кегль округляется вверх до 62–67px и без запаса переносился на вторую строку),
 * а в узком окне (480 px) переносится, и полосы золота повторяются на каждой строке.
 * Окно «Авторы» (нужен сервер): пункт сразу после «Настройки», меню не получает прокрутки на 1280×800 (и у админа), окно открывается из меню,
 * держит весь текст CREDITS.md (CC BY 3.0 с авторами иконок, CC BY 4.0, просьба Sentient Dream Studio), ссылки в новой вкладке,
 * у всех элементов курсор игры (не системный), тянется за заголовок, закрывается Esc и крестиком, на 800×600 помещается; ошибок страницы нет.
 *
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2893 VITE_TEST_PORT=5293 npx tsx tests/ui-logo-screens.ts   (Chrome: CHROME_PATH или стандартные пути);
 * UI_LOGO_ONLY=loading — только экран загрузки (сервер игры не нужен).
 * Снимки (tools/out/ui-logo/): loading-1280x800.png и loading-1920x1080.png («до | после»), loading-*-before.png / -after.png,
 * loading-1536x864-125.png (масштаб 125%), loading-480x800.png (узкое окно, название в две строки),
 * menu.png, menu-admin.png, credits.png, credits-icons.png (раскрыт список иконок), credits-bottom.png, credits-narrow.png (800×600).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5293;
const OUT = path.resolve("tools/out/ui-logo");
const BASE = `http://localhost:${VITE_PORT}/`;
/** Ошибки, из-за которых прогон падает: исключения страницы и сбои наших файлов (эмблема, данные окна). */
const errors: string[] = [];
/** Остальное (console.error, чужие запросы с ответом 4xx и сбоями) — только в вывод. */
const consoleErrors: string[] = [];
const MINE = /logo-emblem|credits/;

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const ok = (s: string) => console.log(`  ok   ${s}`);
const must: (cond: unknown, msg: string) => asserts cond = (cond, msg) => { if (!cond) throw new Error(msg); };

async function newPage(browser: Browser, width: number, height: number, dpr = 1): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("requestfailed", (r) => (MINE.test(r.url()) ? errors : consoleErrors).push(`запрос не прошёл: ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) (MINE.test(r.url()) ? errors : consoleErrors).push(`${r.status()} ${r.url()}`); });
  await page.setViewport({ width, height, deviceScaleFactor: dpr }); // до goto: main.ts считает --hu по devicePixelRatio при старте
  return page;
}

/** Два снимка рядом: слева «до», справа «после», между ними полоса 8 px. */
function sideBySide(left: string, right: string, out: string) {
  const a = PNG.sync.read(fs.readFileSync(left)), b = PNG.sync.read(fs.readFileSync(right));
  const gap = 8, o = new PNG({ width: a.width + gap + b.width, height: Math.max(a.height, b.height) });
  for (let i = 0; i < o.data.length; i += 4) { o.data[i] = 214; o.data[i + 1] = 168; o.data[i + 2] = 75; o.data[i + 3] = 255; }
  PNG.bitblt(a, o, 0, 0, a.width, a.height, 0, 0);
  PNG.bitblt(b, o, 0, 0, b.width, b.height, a.width + gap, 0);
  fs.writeFileSync(out, PNG.sync.write(o));
}

interface Emblem {
  w: number; h: number; nat: [number, number]; dpr: number; hu: string; pix: string; boxTop: number; boxBottom: number; vh: number; vw: number; cx: number; shown: boolean;
  /** Название: высота, высота строки, ширина блока и текста, фон (размер полосы золота), кегль. */
  title: { h: number; lh: number; w: number; textW: number; bgSize: string; fs: number };
  boxW: number;
}
/** Экран загрузки в том же виде, что при входе в мир: подпись героя, этап и 62%. Возвращает размеры эмблемы. */
async function showLoading(page: Page): Promise<Emblem> {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 20000 });
  await page.evaluate(`import('/src/ui/loading.ts').then((m) => { m.loading.show('Вход в мир · Подписи', 'Загрузка графики…'); m.loading.progress(0.62); })`);
  await page.waitForFunction(() => { const i = document.querySelector<HTMLImageElement>(".ld-emblem"); return !i || (i.complete && i.naturalWidth > 0); }, { timeout: 10000 });
  await sleep(300);
  return page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(".ld-emblem");
    const box = document.querySelector(".ld-box")!.getBoundingClientRect();
    const r = img?.getBoundingClientRect();
    const cs = img ? getComputedStyle(img) : null;
    const t = document.querySelector<HTMLElement>(".ld-title")!, tcs = getComputedStyle(t), range = document.createRange();
    range.selectNodeContents(t);
    return {
      w: r?.width ?? 0, h: r?.height ?? 0, nat: [img?.naturalWidth ?? 0, img?.naturalHeight ?? 0] as [number, number],
      dpr: devicePixelRatio, hu: getComputedStyle(document.documentElement).getPropertyValue("--hu"), pix: cs?.imageRendering ?? "",
      boxTop: box.top, boxBottom: box.bottom, vh: innerHeight, vw: innerWidth, cx: r ? r.left + r.width / 2 : 0,
      shown: !!img && cs!.display !== "none",
      boxW: box.width,
      title: { h: t.getBoundingClientRect().height, lh: parseFloat(tcs.lineHeight), w: t.getBoundingClientRect().width, textW: Math.max(...[...range.getClientRects()].map((q) => q.width)), bgSize: tcs.backgroundSize, fs: parseFloat(tcs.fontSize) },
    };
  });
}

/** Название в одну строку: высота блока не больше 1,1 строки (раньше при масштабе 110%, 125% и 175% оно переносилось: кегль округляется
 *  вверх до 62–64px, ширина 528–538px при блоке 520px, и верхняя строка была светлой, а нижняя тёмной). */
function checkTitleOneLine(e: Emblem, label: string) {
  must(e.title.h <= e.title.lh * 1.1, `${label}: название в ${Math.round(e.title.h / e.title.lh)} строки (высота ${e.title.h.toFixed(1)} при строке ${e.title.lh.toFixed(1)}, кегль ${e.title.fs.toFixed(1)}, блок ${e.boxW.toFixed(0)})`);
  must(e.title.textW <= e.boxW, `${label}: название шире блока (${e.title.textW.toFixed(1)} > ${e.boxW.toFixed(0)})`);
}

/** Эмблема целым множителем: ширина в пикселях экрана кратна 105, высота — 118 при том же множителе. */
function checkScale(e: Emblem, label: string, want?: number): number {
  must(e.nat[0] === 105 && e.nat[1] === 118, `${label}: файл не 105×118 (${e.nat})`);
  const k = Math.round((e.w * e.dpr) / 105);
  must(Math.abs(e.w * e.dpr - k * 105) < 0.02 && Math.abs(e.h * e.dpr - k * 118) < 0.05, `${label}: дробный масштаб, ${(e.w * e.dpr).toFixed(2)}×${(e.h * e.dpr).toFixed(2)} px экрана при множителе ${k}`);
  must(e.pix === "pixelated", `${label}: image-rendering ${e.pix}`);
  must(Math.abs(e.cx - e.vw / 2) <= 1, `${label}: эмблема не по центру (${e.cx.toFixed(1)} из ${e.vw / 2})`);
  must(e.boxTop >= 0 && e.boxBottom <= e.vh, `${label}: лого и полоса не помещаются в окно (${e.boxTop.toFixed(0)}…${e.boxBottom.toFixed(0)} из ${e.vh})`);
  if (want !== undefined) must(k === want, `${label}: множитель ×${k}, ждали ×${want}`);
  return k;
}

async function loadingPhase(browser: Browser) {
  // снимки до | после на двух размерах из задания
  for (const [w, h, want] of [[1280, 800, 2], [1920, 1080, 3]] as const) {
    const page = await newPage(browser, w, h);
    const e = await showLoading(page);
    const k = checkScale(e, `${w}×${h}`, want);
    checkTitleOneLine(e, `${w}×${h}`);
    const after = path.join(OUT, `loading-${w}x${h}-after.png`), before = path.join(OUT, `loading-${w}x${h}-before.png`);
    await page.screenshot({ path: after });
    await page.addStyleTag({ content: ".ld-emblem { display: none !important; }" });
    await sleep(200);
    await page.screenshot({ path: before });
    sideBySide(before, after, path.join(OUT, `loading-${w}x${h}.png`));
    ok(`${w}×${h}: эмблема ×${k} (${e.w}×${e.h}), по центру, весь экран загрузки в окне (${e.boxTop.toFixed(0)}…${e.boxBottom.toFixed(0)} из ${e.vh})`);
    await page.close();
  }
  // другие размеры и масштаб экрана: без снимков, только расчёт
  const cases: [number, number, number, number | undefined][] = [
    [1280, 720, 1, 2], [1366, 768, 1, 2], [1440, 900, 1, 3], [800, 600, 1, 1], [1280, 800, 1.25, undefined], [1536, 864, 1.25, undefined], [1280, 720, 1.5, undefined],
    [1280, 720, 1.1, undefined], [1280, 720, 1.75, undefined], [2400, 1350, 0.8, undefined],   // 110%, 175% и 80%: кегль названия округляется вверх, раньше оно переносилось
  ];
  for (const [w, h, dpr, want] of cases) {
    const page = await newPage(browser, w, h, dpr);
    const e = await showLoading(page);
    const k = checkScale(e, `${w}×${h} при ${dpr * 100}%`, want);
    checkTitleOneLine(e, `${w}×${h} при ${dpr * 100}%`);
    ok(`${w}×${h} при масштабе экрана ${dpr * 100}%: ${(e.w * e.dpr).toFixed(0)}×${(e.h * e.dpr).toFixed(0)} px экрана = ×${k} от 105×118, --hu ${e.hu.trim()}; название ${e.title.fs.toFixed(1)}px в одну строку (${e.title.textW.toFixed(0)} из ${e.boxW.toFixed(0)})`);
    if (w === 800 || dpr === 1.25 && w === 1536) await page.screenshot({ path: path.join(OUT, `loading-${w}x${h}${dpr === 1 ? "" : `-${dpr * 100}`}.png`) });
    await page.close();
  }
  // совсем низкое окно: эмблемы нет, экран как раньше
  const low = await newPage(browser, 900, 420);
  const e = await showLoading(low);
  must(!e.shown, "на высоте 420 эмблема должна уйти");
  must(e.boxTop >= 0 && e.boxBottom <= e.vh, `на высоте 420 без эмблемы экран не помещается (${e.boxTop.toFixed(0)}…${e.boxBottom.toFixed(0)} из ${e.vh})`);
  checkTitleOneLine(e, "900×420");
  ok("900×420: эмблемы нет, остальное в окне");
  await low.screenshot({ path: path.join(OUT, "loading-900x420.png") });
  await low.close();
  // узкое окно: название не помещается и переносится на вторую строку — полосы золота повторяются на каждой строке, а не растянуты на обе
  const narrow = await newPage(browser, 480, 800);
  const n = await showLoading(narrow);
  checkScale(n, "480×800");
  const lines = Math.round(n.title.h / n.title.lh), band = parseFloat(n.title.bgSize.trim().split(/\s+/).pop()!);
  must(lines === 2, `480×800: название должно переноситься на две строки, а оно в ${lines}`);
  must(Math.abs(band - n.title.lh) < 0.6, `480×800: полоса золота «${n.title.bgSize}» не равна строке ${n.title.lh.toFixed(1)}px, вторая строка станет тёмной`);
  ok(`480×800: название в две строки, полоса золота ${band.toFixed(1)}px = строке ${n.title.lh.toFixed(1)}px`);
  await narrow.screenshot({ path: path.join(OUT, "loading-480x800.png") });
  await narrow.close();
}

// ---------- мир ----------
async function enter(browser: Browser, name: string): Promise<Page> {
  const page = await newPage(browser, 1280, 800);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 20000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
  // экран загрузки уходит сам, когда мир построен
  await page.waitForFunction(() => { const l = document.getElementById("loading"); return !l || l.hidden; }, { timeout: 30000 });
  await sleep(500);
  return page;
}

const VISIBLE = `(e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return !e.closest('[hidden]') && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1; }`;
const visible = (page: Page, sel: string) => page.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].some(${VISIBLE})`) as Promise<boolean>;
const waitVisible = (page: Page, sel: string, timeout = 8000) => page.waitForFunction(`[...document.querySelectorAll(${JSON.stringify(sel)})].some(${VISIBLE})`, { timeout, polling: 100 });
const waitGone = (page: Page, sel: string, timeout = 8000) => page.waitForFunction(`![...document.querySelectorAll(${JSON.stringify(sel)})].some(${VISIBLE})`, { timeout, polling: 100 });
const hud = "window.__game.scene.getScene('game').hud";
const park = (page: Page) => page.mouse.move(1270, 790);
const clickItem = (page: Page, text: string) => page.evaluate((t) => { const b = [...document.querySelectorAll<HTMLButtonElement>(".gm-item")].find((x) => x.textContent?.includes(t)); if (!b) throw new Error("нет пункта " + t); b.click(); }, text);

/** Системные курсоры: у каждого элемента внутри корней computed cursor — картинка игры (url(...)), а не auto/default/pointer. */
const cursorOffenders = (page: Page, roots: string) => page.evaluate((sel) => {
  const bad: string[] = [];
  for (const root of document.querySelectorAll(sel)) for (const e of [root, ...root.querySelectorAll("*")]) {
    const c = getComputedStyle(e).cursor;
    if (!c.startsWith("url(")) bad.push(`${e.tagName.toLowerCase()}.${(e as HTMLElement).className} → ${c}`);
  }
  return bad;
}, roots);

async function worldPhase(browser: Browser) {
  const name = "Титры";
  await ensureChar(name, "secret", name, "warrior");
  const page = await enter(browser, name);

  // 1. меню Esc: «Авторы» сразу после «Настройки»
  await page.keyboard.press("Escape");
  await waitVisible(page, ".gmenu-back .gm-item");
  const labels = await page.evaluate(() => [...document.querySelectorAll(".gmenu .gm-item > span")].map((e) => e.textContent!));
  const iS = labels.indexOf("Настройки"), iC = labels.indexOf("Авторы");
  must(iS >= 0 && iC === iS + 1, `«Авторы» не сразу после «Настройки»: ${labels.join(" | ")}`);
  ok(`меню: «Настройки» → «Авторы» → «${labels[iC + 1]}» (пунктов ${labels.length})`);
  const fit = () => page.evaluate(() => { const g = document.querySelector(".gmenu")!; return { sh: g.scrollHeight, ch: g.clientHeight, n: g.querySelectorAll(".gm-item").length }; });
  let f = await fit();
  must(f.sh <= f.ch + 1, `меню на 1280×800 прокручивается: ${f.sh} > ${f.ch} при ${f.n} пунктах`);
  ok(`меню на 1280×800 без прокрутки: ${f.sh} из ${f.ch} при ${f.n} пунктах`);
  await park(page);
  await page.screenshot({ path: path.join(OUT, "menu.png") });
  // у админа пунктов на один больше: подставляем флаг и открываем меню заново
  await page.evaluate(`(() => { const h = ${hud}; h.gameMenu.close(); window.__net.self.isAdmin = true; h.gameMenu.open(); })()`);
  await waitVisible(page, ".gmenu-back .gm-item");
  f = await fit();
  must(f.sh <= f.ch + 1, `меню админа на 1280×800 прокручивается: ${f.sh} > ${f.ch} при ${f.n} пунктах`);
  ok(`меню админа на 1280×800 без прокрутки: ${f.sh} из ${f.ch} при ${f.n} пунктах`);
  await page.screenshot({ path: path.join(OUT, "menu-admin.png") });
  await page.evaluate(`(() => { const h = ${hud}; h.gameMenu.close(); window.__net.self.isAdmin = false; h.gameMenu.open(); })()`);
  await waitVisible(page, ".gmenu-back .gm-item");

  // 2. клик по «Авторы»: меню закрылось, окно открылось
  must(!(await cursorOffenders(page, ".gmenu-back")).length, "в меню системные курсоры: " + (await cursorOffenders(page, ".gmenu-back")).join("; "));
  await clickItem(page, "Авторы");
  await waitVisible(page, ".win-credits");
  must(!(await visible(page, ".gmenu-back")), "меню осталось открытым после клика «Авторы»");
  ok("«Авторы» открывает окно, меню закрывается");

  // 3. содержимое: разделы, строки, обязательные упоминания, ссылки
  const info = await page.evaluate(() => {
    const w = document.querySelector<HTMLElement>(".win-credits")!, body = w.querySelector<HTMLElement>(".body")!, r = w.getBoundingClientRect();
    const links = [...w.querySelectorAll<HTMLAnchorElement>("a")];
    return {
      title: w.querySelector("h2 > span")!.textContent, secs: [...w.querySelectorAll(".sec-h")].map((e) => e.textContent), rows: w.querySelectorAll(".row").length,
      text: w.textContent!, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, scroll: body.scrollHeight > body.clientHeight + 1, hscroll: body.scrollWidth > body.clientWidth + 1,
      links: links.length, badLinks: links.filter((a) => a.target !== "_blank" || !/noopener/.test(a.rel) || !/^https:\/\//.test(a.href)).map((a) => a.outerHTML.slice(0, 120)),
      chips: [...w.querySelectorAll(".chip")].map((c) => c.textContent), cls: w.className,
    };
  });
  must(info.title === "Авторы", "заголовок окна: " + info.title);
  must(info.secs.length === 5, "разделов не 5: " + info.secs.join(" | "));
  for (const need of ["CC BY 3.0", "CC BY 4.0", "Pixel art effects by Sentient Dream Studio", "Caro Asercion", "DarkZaitzev", "Delapouite", "Lorc", "Skoll", "sbed", "Various Artists", "Schwarnhild", "0_mem0ry", "Kenney", "cathean", "TakWolf", "Rubik", "frosty_rabbid", "Henrique Lazarini", "Foozle", "Pixel-boy", "pimen", "ImpactForge", "SrZolda", "Phaser", "Colyseus", "puppeteer-core", "Electron", "node:sqlite"]) must(info.text.includes(need), `в окне нет «${need}»`);
  must(info.badLinks.length === 0, "ссылки без target=_blank, noopener или https: " + info.badLinks.join("; "));
  must(info.rect.x >= 0 && info.rect.y >= 0 && info.rect.x + info.rect.w <= 1280 && info.rect.y + info.rect.h <= 800, "окно выходит за экран: " + JSON.stringify(info.rect));
  must(info.scroll && !info.hscroll, `прокрутка: вертикальная ${info.scroll}, горизонтальная ${info.hscroll}`);
  ok(`окно: ${info.secs.join(" · ")}; строк ${info.rows}, ссылок ${info.links}, плашек лицензий ${info.chips.length}; ${info.rect.w}×${info.rect.h} в окне 1280×800, тело прокручивается`);
  const bad = await cursorOffenders(page, ".win-credits");
  must(!bad.length, "в окне «Авторы» системные курсоры: " + bad.slice(0, 5).join("; "));
  ok("курсоры: у всех элементов окна и меню — курсор игры, системных нет");
  await park(page);
  await page.screenshot({ path: path.join(OUT, "credits.png") });

  // 4. список иконок game-icons.net раскрывается; снимок раскрытым
  await page.evaluate(() => { const d = document.querySelector<HTMLDetailsElement>(".win-credits details")!; d.open = true; d.scrollIntoView({ block: "center" }); });
  await sleep(250);
  must(await visible(page, ".win-credits .cr-auth"), "список иконок не раскрылся");
  await page.screenshot({ path: path.join(OUT, "credits-icons.png") });
  await page.evaluate(() => { document.querySelector<HTMLDetailsElement>(".win-credits details")!.open = false; });
  // 5. прокрутка до конца: библиотеки
  await page.evaluate(() => { const b = document.querySelector<HTMLElement>(".win-credits .body")!; b.scrollTop = b.scrollHeight; });
  await sleep(250);
  await page.screenshot({ path: path.join(OUT, "credits-bottom.png") });
  await page.evaluate(() => { document.querySelector<HTMLElement>(".win-credits .body")!.scrollTop = 0; });

  // 6. окно тянется за заголовок
  const h2 = await page.evaluate(() => { const r = document.querySelector(".win-credits h2 > span")!.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 }; });
  const before = await page.evaluate(() => { const r = document.querySelector(".win-credits")!.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await page.mouse.move(h2.x, h2.y);
  await page.mouse.down();
  await page.mouse.move(h2.x + 60, h2.y + 30, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => { const r = document.querySelector(".win-credits")!.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  must(Math.abs(after.x - before.x - 60) <= 2 && Math.abs(after.y - before.y - 30) <= 2, `окно не потянулось: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  ok("окно тянется за заголовок");

  // 7. Esc закрывает окно; повторный Esc открывает меню, а не что-то другое
  await page.keyboard.press("Escape");
  await waitGone(page, ".win-credits");
  must(!(await visible(page, ".gmenu-back")), "Esc закрыл окно, но открыл и меню");
  ok("Esc закрывает окно «Авторы»");
  await page.keyboard.press("Escape");
  await waitVisible(page, ".gmenu-back .gm-item");
  // 8. снова из меню, закрытие крестиком
  await clickItem(page, "Авторы");
  await waitVisible(page, ".win-credits");
  await page.click(".win-credits .x");
  await waitGone(page, ".win-credits");
  ok("крестик закрывает окно; пункт меню открывает его снова");

  // 9. окно 800×600: помещается, без горизонтальной прокрутки — и с местом, куда его перетащили на большом экране, и на своём месте по умолчанию
  await page.setViewport({ width: 800, height: 600 });
  await sleep(400);
  const frames = () => page.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())))); // перетащенное окно встаёт в границы экрана на кадр позже открытия (drag.ts)
  const fitNarrow = async (label: string) => {
    await page.keyboard.press("Escape");
    await waitVisible(page, ".gmenu-back .gm-item");
    await clickItem(page, "Авторы");
    await waitVisible(page, ".win-credits");
    await frames();
    const n = await page.evaluate(() => {
      const w = document.querySelector<HTMLElement>(".win-credits")!, body = w.querySelector<HTMLElement>(".body")!, r = w.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, hscroll: body.scrollWidth > body.clientWidth + 1, vw: innerWidth, vh: innerHeight };
    });
    must(n.l >= 0 && n.r <= n.vw && n.t >= 0 && n.b <= n.vh && !n.hscroll, `на 800×600 (${label}) окно не помещается: ` + JSON.stringify(n));
    ok(`800×600, ${label}: окно ${n.l.toFixed(0)}…${n.r.toFixed(0)} × ${n.t.toFixed(0)}…${n.b.toFixed(0)}, без горизонтальной прокрутки`);
  };
  await fitNarrow("после перетаскивания на большом экране");
  await park(page);
  await page.mouse.move(795, 595);
  await page.screenshot({ path: path.join(OUT, "credits-narrow-dragged.png") });
  await page.keyboard.press("Escape");
  await waitGone(page, ".win-credits");
  // забыть перетаскивание: окно встаёт по умолчанию (по центру, 70 px от верха)
  await page.evaluate((n) => { try { localStorage.removeItem("winpos:" + n); } catch {} const w = document.querySelector<HTMLElement>(".win-credits")!; w.style.cssText = ""; delete w.dataset.moved; }, name);
  await fitNarrow("по умолчанию");
  await park(page);
  await page.mouse.move(795, 595);
  await page.screenshot({ path: path.join(OUT, "credits-narrow.png") });
  await page.keyboard.press("Escape");
  await waitGone(page, ".win-credits");

  // 10. выход из мира (Hud.reset: смена героя, выход, обрыв связи) при открытом окне — окно закрывается, иначе после входа героем оно уже открыто
  await page.keyboard.press("Escape");
  await waitVisible(page, ".gmenu-back .gm-item");
  await clickItem(page, "Авторы");
  await waitVisible(page, ".win-credits");
  await page.evaluate(`${hud}.reset()`);
  must(!(await visible(page, ".win-credits")), "Hud.reset() (выход из мира) не закрыл окно «Авторы»");
  ok("выход из мира закрывает окно «Авторы»");
  await page.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  // fs.strict: false — прогон из git worktree, где node_modules — ссылка на основное дерево (шрифты лежат вне корня)
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] }, fs: { strict: false } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1280, height: 800 } });
  try {
    const loadingOnly = process.env.UI_LOGO_ONLY === "loading";
    if (!loadingOnly) await startServer(true);
    console.log("экран загрузки:");
    await loadingPhase(browser);
    if (!loadingOnly) {
      console.log("окно «Авторы»:");
      await worldPhase(browser);
    }
    if (consoleErrors.length) console.log(`  (прочие сообщения об ошибках: ${consoleErrors.length}; уникальные: ${[...new Set(consoleErrors.map((s) => s.slice(0, 200)))].slice(0, 5).join(" | ")})`);
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
    ok("ошибок страницы нет: ни исключений, ни сбоев эмблемы и данных окна");
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("ui-logo-screens: готово, снимки в " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
