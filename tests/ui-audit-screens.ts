/**
 * Скриншоты ВСЕГО интерфейса для визуального аудита (задача 126: единый стиль UI).
 * Поднимает тестовый сервер и Vite, входит в игру через Chrome (puppeteer-core), по очереди открывает каждое окно и
 * каждую поверхность (вход, HUD, окна, NPC, подсказки, меню, системные окна) и снимает их.
 *
 * Запуск (порты свободные, заданные TEST_PORT / VITE_TEST_PORT):
 *   $env:TEST_PORT="2801"; $env:VITE_TEST_PORT="5399"; npx tsx tests/ui-audit-screens.ts [--narrow] [--phase=hud,npc]
 * Флаг --phase (отладка): только перечисленные фазы — hud, windows, arena, bot, npc, combat, menus, admin; вход, создание героя
 * и его подготовка идут всегда; результат — в подпапке _partial, основной manifest не затирается.
 *
 * Выход — tools/out/audit/ (с --narrow: 800×600 в tools/out/audit/narrow/):
 *   <id>.png         снимок всего окна браузера (1280×800, deviceScaleFactor 1)
 *   <id>-zoom.png    крупный план (×2) для мелких частей HUD (рамка героя, миникарта, панель умений, чат...)
 *   <id>.html        outerHTML корня окна или поверхности (до 20 КБ): классы для поиска правил в styles.css
 *   manifest.json    [{id, title, selector, png, html, how, ok, error, ...}] по всем пунктам, включая неудавшиеся
 *   failed/<id>.png  отладочный снимок на момент сбоя (в manifest у таких png = null)
 * Каждый пункт идёт в своём try/catch: сбой записывается в manifest, прогон продолжается.
 * Сверх схемы в записях есть необязательные поля: zoom (крупный план), rect (рамка корня в окне браузера),
 * notes (автопроверка: выход за экран, переполнение, выступающие потомки), skipped (поверхности нет или она недостижима).
 * Путь к Chrome: переменная CHROME_PATH, иначе стандартные пути Windows/Linux/macOS.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { Bot, dbFile, PORT, sleep, startServer, stopServer } from "./harness";
import { ARENA_NPC } from "../shared/arena";
import { BAGMAN } from "../shared/bags";
import { BANKER } from "../shared/bank";
import { CITIES } from "../shared/cities";
import { MAP_SEED } from "../shared/constants";
import { COOK, FOOD_IDS } from "../shared/food";
import { generateMap, PLACES } from "../shared/map";
import { MOBS } from "../shared/mobs";
import { RAID_HERALDS } from "../shared/raid";
import { RUMOR_NPCS } from "../shared/rumors";
import { canLearn, classSkills } from "../shared/skills";
import { SMITH } from "../shared/upgrade";

const NARROW = process.argv.includes("--narrow");
/** Отладка сценария: --phase=hud,npc выполняет только эти фазы (вход, подготовка героя и выбор схемы идут всегда); результат — в подпапке _partial. */
const ONLY = (process.argv.find((a) => a.startsWith("--phase="))?.slice(8) ?? "").split(",").filter(Boolean);
const VIEW = NARROW ? { width: 800, height: 600 } : { width: 1280, height: 800 };
const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5199;
const OUT = path.resolve("tools/out/audit", NARROW ? "narrow" : "", ONLY.length ? "_partial" : "");
const FAILED = path.join(OUT, "failed");
const HERO = "Скриншот";
const PASS = "secret";
const BOT_NAME = "Спутница";

// ---------- вывод и manifest ----------
interface Entry {
  id: string;
  title: string;
  selector: string;
  png: string | null;
  html: string | null;
  how: string;
  ok: boolean;
  error: string | null;
  skipped?: boolean;
  zoom?: string | null;
  rect?: { x: number; y: number; width: number; height: number } | null;
  notes?: string[];
}
const manifest: Entry[] = [];
const errors: string[] = [];
const t0 = Date.now();

function cleanOut() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(FAILED, { recursive: true, force: true });
  fs.mkdirSync(FAILED, { recursive: true });
  // только файлы этого прохода: подпапка narrow/ основного прохода не трогается
  for (const f of fs.readdirSync(OUT, { withFileTypes: true })) if (f.isFile() && /\.(png|html|json)$/.test(f.name)) fs.rmSync(path.join(OUT, f.name), { force: true });
}
const flush = () => fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
const errText = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0].slice(0, 300);

/** Обрезка текста до 20 КБ (по байтам UTF-8). */
function clip20k(s: string): string {
  const MAX = 20 * 1024, mark = "\n<!-- … обрезано до 20 КБ -->\n";
  if (Buffer.byteLength(s) <= MAX) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Buffer.byteLength(s.slice(0, mid)) <= MAX - Buffer.byteLength(mark)) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + mark;
}

function chromePath() {
  const list = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

// ---------- работа со страницей ----------
let page: Page;
let bot: Bot | null = null;

/** Выполняет тело функции в странице; доступны sc (GameScene), hud, net и a (аргумент). Возврат — через return. */
const run = <T = any>(body: string, arg: unknown = null): Promise<T> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), hud = sc && sc.hud, net = window.__net, a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<T>;
const dbg = (m: Record<string, unknown>) => run("net.send('dbg', a)", m);
const sendNet = (type: string, msg: unknown = {}) => run("net.send(a.type, a.msg)", { type, msg });
const self = () => run<any>("return net.self");
const heroPos = () => run<{ x: number; y: number }>("return { x: sc.pos.x, y: sc.pos.y }");
/** Ожидания с запасом: машина часто загружена параллельными прогонами, а Phaser на программном GL отдаёт кадры редко. Опрос по таймеру, не по rAF. */
const SLOW = 2.5;
const waitFn = (expr: string, timeout = 8000) => page.waitForFunction(expr, { timeout: timeout * SLOW, polling: 250 });
const VISIBLE_JS = `(e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return !e.closest('[hidden]') && cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 1 && r.height > 1; }`;
const waitSel = (sel: string, timeout = 6000) => waitFn(`[...document.querySelectorAll(${JSON.stringify(sel)})].some(${VISIBLE_JS})`, timeout);
const clickEl = async (sel: string) => { await page.waitForSelector(sel, { timeout: 12000 }); await page.$eval(sel, (b) => (b as HTMLElement).click()); };
const clickText = (sel: string, text: string) => run(
  "const b = [...document.querySelectorAll(a.sel)].find((e) => e.offsetParent && e.textContent.includes(a.text)); if (!b) throw new Error('нет кнопки «' + a.text + '» в ' + a.sel); b.click();",
  { sel, text },
);
const park = () => page.mouse.move(VIEW.width - 3, VIEW.height - 3);
async function tp(x: number, y: number, wait = 1500) {
  await dbg({ op: "tp", x, y });
  await sleep(wait);
  // камера догоняет героя плавно, а при редких кадрах — долго: ставим её на героя сразу
  await run("const u = sc && sc.units && sc.units.get(net.id); if (u) sc.cameras.main.centerOn(u.x, u.y);").catch(() => {});
}
const near = (n: { x: number; y: number }, wait?: number) => tp(n.x, n.y + 30, wait);

/** Закрыть всё: окна, меню, подсказки, модальные окна и полосы — чтобы каждый снимок показывал одну поверхность. */
async function reset() {
  // «зависшее» переназначение клавиши или вопрос окна управления глотают все нажатия клавиш: сначала закрываем их
  const ctl = await run<{ wait: boolean; modal: boolean }>("return { wait: !!document.querySelector('.ctl-chip.wait'), modal: !!document.querySelector('.ctl-modal') }");
  if (ctl.modal) await run("const b = [...document.querySelectorAll('.ctl-modal [data-i]')].pop(); if (b) b.click();");
  if (ctl.wait) await page.keyboard.press("Escape");
  await run(`
    if (!hud) return;
    for (const m of [hud.bestiary, hud.admin, hud.rumor, hud.enc, hud.cook, hud.quest, hud.tp, hud.smith, hud.bank, hud.bags, hud.arena, hud.raid, hud.trade, hud.inspect]) { try { m.close(); } catch (e) {} }
    try { hud.quest.closeLog(); } catch (e) {}
    for (const w of Object.values(hud.wins)) w.hidden = true;
    try { hud.gameMenu.close(); } catch (e) {}
    hud.tip.hidden = true;
    hud.trade.menu.hidden = true;
    hud.trade.ask.hidden = true;
    for (const e of document.querySelectorAll('.arena-modal, .raid-modal')) e.hidden = true;
    for (const e of document.querySelectorAll('.sys-back.reconnect')) e.hidden = true;
    document.getElementById('mount-cast')?.remove();
    document.getElementById('air-bar')?.remove();
    hud.errLine.classList.remove('on');
    hud.zoneBanner.classList.remove('show');
    hud.toasts.replaceChildren();
    hud.admin.banner.hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  `);
  await park();
}

/** Зонд поверхности: видимость, рамка, outerHTML, автозамечания (выход за экран, переполнение, выступающие потомки). */
const PROBE = `
  const sel = a.sel;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return !e.closest('[hidden]') && cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 1 && r.height > 1; };
  const tag = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const all = [...document.querySelectorAll(sel)];
  const els = all.filter(vis);
  if (!els.length) return { ok: false, n: all.length };
  const rs = els.map((e) => e.getBoundingClientRect());
  const x1 = Math.min(...rs.map((r) => r.left)), y1 = Math.min(...rs.map((r) => r.top)), x2 = Math.max(...rs.map((r) => r.right)), y2 = Math.max(...rs.map((r) => r.bottom));
  const notes = [];
  try {
    // внутри прокручиваемого родителя (окно настроек) рамка элемента может быть за экраном законно — это не замечание
    const inScroll = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) return true; } return false; };
    if (!els.some(inScroll) && (x1 < -1 || y1 < -1 || x2 > innerWidth + 1 || y2 > innerHeight + 1)) notes.push('выходит за экран: [' + [x1, y1, x2, y2].map(Math.round).join(', ') + '] при окне ' + innerWidth + '×' + innerHeight);
    // потомок обрезан, если сам корень или кто-то между ними прокручивается или обрезает содержимое
    const clippedBy = (c, root) => { for (let p = c.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p); if (o.overflowX !== 'visible' || o.overflowY !== 'visible') return true; if (p === root) break; } return false; };
    for (const e of els.slice(0, 4)) {
      const cs = getComputedStyle(e);
      if (e.scrollWidth > e.clientWidth + 1) notes.push('горизонтальное переполнение у ' + tag(e) + ' (scrollWidth ' + e.scrollWidth + ' > ' + e.clientWidth + ')');
      if (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY)) notes.push('внутренняя вертикальная прокрутка у ' + tag(e) + ' (' + e.scrollHeight + ' > ' + e.clientHeight + ')');
      const R = e.getBoundingClientRect(); let bad = 0, n = 0;
      for (const c of e.querySelectorAll('*')) {
        if (++n > 600) break;
        if (c instanceof SVGElement || !vis(c) || clippedBy(c, e)) continue;
        const r = c.getBoundingClientRect();
        if (r.right > R.right + 1.5 || r.bottom > R.bottom + 1.5 || r.left < R.left - 1.5 || r.top < R.top - 1.5) { if (bad++ < 3) notes.push('выступает за край ' + tag(e) + ': ' + tag(c) + ' (dx лево/право/низ: ' + [r.left - R.left, r.right - R.right, r.bottom - R.bottom].map(Math.round).join('/') + ')'); }
      }
    }
    const txt = els.map((e) => e.innerText || '').join('').trim().length;
    if (!txt && !els.some((e) => e.querySelector('img, canvas, svg'))) notes.push('нет текста и картинок');
  } catch (e) { notes.push('автопроверка не отработала: ' + e.message); }
  const tips = [...document.querySelectorAll('.tip, .ctx-menu')].filter((t) => vis(t) && !els.includes(t) && !els.some((r) => r.contains(t)));
  return { ok: true, n: els.length, rect: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }, html: els.map((e) => e.outerHTML).join('\\n'), tip: tips.map((t) => t.outerHTML).join('\\n'), notes };
`;

interface ItemOpts {
  /** Пауза после подготовки, мс (по умолчанию 350). */
  settle?: number;
  /** Крупный план ×2 по рамке корня (true) с полем zoomPad (по умолчанию 10 px). */
  zoom?: boolean;
  zoomPad?: number;
  /** Не закрывать окна перед подготовкой (когда нужно продолжить прошлое состояние). */
  keep?: boolean;
  /** Выполнить после снимка (вернуть состояние), даже если снимок не удался. */
  after?: () => Promise<unknown> | void;
}

/** Остановить цикл Phaser на время снимка: на программном GL он отдаёт кадры редко, и каждый вызов к странице стоит секунды. Картинка холста остаётся. */
const freeze = () => run("if (window.__game && window.__game.loop && window.__game.loop.running) window.__game.loop.sleep();").catch(() => {});
const thaw = () => run("if (window.__game && window.__game.loop && !window.__game.loop.running) window.__game.loop.wake(true);").catch(() => {});

/** Один пункт аудита: подготовка → проверка, что поверхность видна → снимки → HTML → запись в manifest. */
async function item(id: string, title: string, selector: string, how: string, setup: () => Promise<unknown> | void, o: ItemOpts = {}) {
  const e: Entry = { id, title, selector, png: null, html: null, how, ok: false, error: null };
  manifest.push(e);
  const t = Date.now();
  try {
    if (!o.keep) await reset();
    await setup();
    await sleep(o.settle ?? 350);
    await freeze();
    const pr = await run<any>(PROBE, { sel: selector });
    if (!pr.ok) throw new Error(`поверхность не видна: ${selector} (элементов в DOM: ${pr.n})`);
    e.rect = { x: Math.round(pr.rect.x), y: Math.round(pr.rect.y), width: Math.round(pr.rect.width), height: Math.round(pr.rect.height) };
    if (pr.notes?.length) e.notes = pr.notes;
    await page.screenshot({ path: path.join(OUT, `${id}.png`) });
    e.png = `${id}.png`;
    if (o.zoom) {
      const pad = o.zoomPad ?? 10;
      const x = Math.max(0, Math.floor(pr.rect.x - pad)), y = Math.max(0, Math.floor(pr.rect.y - pad));
      const w = Math.min(VIEW.width - x, Math.ceil(pr.rect.width + pad * 2)), h = Math.min(VIEW.height - y, Math.ceil(pr.rect.height + pad * 2));
      await page.screenshot({ path: path.join(OUT, `${id}-zoom.png`), clip: { x, y, width: w, height: h, scale: 2 } });
      e.zoom = `${id}-zoom.png`;
    }
    const head = `<!-- ${id}: ${title}\n     selector: ${selector}\n     rect: ${JSON.stringify(e.rect)} · окно ${VIEW.width}×${VIEW.height} -->\n`;
    const body = pr.html + (pr.tip ? `\n<!-- подсказка / контекстное меню, видимые на снимке -->\n${pr.tip}` : "");
    fs.writeFileSync(path.join(OUT, `${id}.html`), clip20k(head + body));
    e.html = `${id}.html`;
    e.ok = true;
  } catch (err) {
    e.error = errText(err);
    try { await page.screenshot({ path: path.join(FAILED, `${id}.png`) }); } catch {}
  } finally {
    await thaw();
    try { await o.after?.(); } catch {}
  }
  flush();
  console.log(`  ${e.ok ? "ok  " : "FAIL"} ${id}${e.ok ? "" : ": " + e.error} (${Date.now() - t} мс)${e.notes?.length ? `  [замечаний: ${e.notes.length}]` : ""}`);
}

/** Поверхности нет в клиенте или её нельзя получить в этом сценарии: запись в manifest без снимка. */
function skip(id: string, title: string, selector: string, how: string, reason: string) {
  manifest.push({ id, title, selector, png: null, html: null, how, ok: false, error: reason, skipped: true });
  flush();
  console.log(`  skip ${id}: ${reason}`);
}

/** Подготовительный шаг (не пункт аудита): ошибка выводится, прогон продолжается. */
async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.log(`  !! шаг «${name}»: ${errText(e)}`);
  }
}

// ---------- вход в аккаунт и герой ----------
async function openClient(browser: Browser) {
  page = await browser.newPage();
  // tsx/esbuild добавляет вспомогательный __name в вызываемые функции — в странице его нет
  await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 20000 });
  // окно выбора схемы клавиш при первом входе в мир (в автотестах оно отключено без этого флага)
  await page.evaluate(() => { try { localStorage.setItem("controls:force-offer", "1"); } catch {} });
}

async function stageAccount() {
  await item("login", "Экран входа", "#login-form", "страница загружена, форма пустая", async () => {});
  await item("login-error", "Экран входа: ошибка (неверный пароль)", "#login-form", "ввести несуществующий логин и войти → строка ошибки", async () => {
    await page.type("#login-name", "Нет_такого");
    await page.type("#login-pass", "wrongpass");
    await page.click("#login-go");
    await waitFn("document.getElementById('login-error').textContent.trim().length > 0", 6000);
  }, { settle: 200 });
  // очистка полей для следующих шагов
  await page.$eval("#login-name", (e) => ((e as HTMLInputElement).value = ""));
  await page.$eval("#login-pass", (e) => ((e as HTMLInputElement).value = ""));
  await item("sys-crash", "Системное окно «Что-то пошло не так»", ".sys-back:not(.reconnect):not([hidden]) .sys-panel", "window.__crash() на экране входа (перехват ошибок main.ts)", async () => {
    await page.evaluate("window.__crash('Проверка перехвата ошибок')");
    await waitSel(".sys-back:not(.reconnect):not([hidden]) .sys-panel", 4000);
  }, { keep: true, after: async () => {
    // «Переподключиться» без сессии возвращает на экран входа
    await page.evaluate("document.querySelector('.sys-back:not(.reconnect) .btn.primary')?.click()").catch(() => {});
    await sleep(500);
  } });

  await item("register", "Регистрация аккаунта", "#login-form", "«Создать аккаунт» → режим регистрации с повтором пароля", async () => {
    await page.evaluate("document.getElementById('login-name').value = ''");
    await clickEl("#login-new");
    await page.type("#login-name", HERO);
    await page.type("#login-pass", PASS);
    await page.type("#login-pass2", PASS);
  }, { keep: true });
  await item("register-error", "Регистрация: пароли не совпадают", "#login-form", "повтор пароля отличается → «Зарегистрироваться» → строка ошибки", async () => {
    await page.$eval("#login-pass2", (e) => ((e as HTMLInputElement).value = "другой"));
    await clickEl("#login-new");
    await waitFn("document.getElementById('login-error').textContent.trim().length > 0", 4000);
  }, { keep: true, settle: 200 });
  await page.$eval("#login-pass2", (e, v) => ((e as HTMLInputElement).value = v), PASS);
  await clickEl("#login-new");
  await page.waitForSelector(".cs-create input[name=name]", { timeout: 12000 });
  await sleep(500);

  await item("create-solgard", "Создание героя: Сольгард (по умолчанию)", ".cs-create", "после регистрации аккаунта без героев открывается создание", async () => {}, { keep: true });
  await item("create-umbrath", "Создание героя: Умбрат (тёмная палитра)", ".cs-create", "клик по фракции Умбрат, класс и внешность", async () => {
    await page.$eval(`.cs-create [data-faction="umbrath"]`, (b) => (b as HTMLElement).click());
    await sleep(250);
    await page.$eval(`.cs-create [data-cls="warlock"]`, (b) => (b as HTMLElement).click());
    await page.$eval(`.cs-create [data-look="4"]`, (b) => (b as HTMLElement).click());
    await page.type(".cs-create input[name=name]", "Тёмный");
  }, { keep: true });
  await item("create-error", "Создание героя: ошибка имени", ".cs-create", "имя с недопустимым символом → «Создать героя» → строка ошибки", async () => {
    await page.$eval(`.cs-create [data-faction="solgard"]`, (b) => (b as HTMLElement).click());
    await sleep(200);
    await page.$eval(".cs-create input[name=name]", (e) => ((e as HTMLInputElement).value = "Бот!!"));
    await page.click(".cs-create [type=submit]");
    await waitFn("document.querySelector('.cs-create .error').textContent.trim().length > 0", 4000);
  }, { keep: true, settle: 200 });
  // настоящий герой: Сольгард, воин, внешность 2
  await page.$eval(".cs-create input[name=name]", (e) => ((e as HTMLInputElement).value = ""));
  await page.type(".cs-create input[name=name]", HERO);
  await page.$eval(`.cs-create [data-cls="warrior"]`, (b) => (b as HTMLElement).click());
  await page.$eval(`.cs-create [data-look="2"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click(".cs-create [type=submit]");
  await page.waitForSelector(".cs-list .cs-slot[data-name]", { timeout: 12000 });
  // ещё двое героев через API, чтобы экран выбора был заполнен
  const token = await page.evaluate(() => sessionStorage.getItem("emberfall-token"));
  for (const [n, c, l] of [["Лучница", "ranger", 4], ["Целитель", "healer", 0]] as const)
    await fetch(`http://localhost:${PORT}/api/chars`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: n, cls: c, look: l }) });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".cs-list .cs-slot[data-name]", { timeout: 12000 });
  await page.$eval(`.cs-slot[data-name="${HERO}"]`, (b) => (b as HTMLElement).click());
  await item("charselect", "Выбор героя", "#charsel .charsel", "три героя на аккаунте, выбран основной", async () => { await sleep(500); }, { keep: true });
  await item("charselect-delete", "Выбор героя: подтверждение удаления", ".modal .cs-del", "кнопка «Удалить» → диалог с вводом имени", async () => {
    await clickEl('.cs-list [data-a="del"]');
    await waitSel(".modal .cs-del", 3000);
  }, { keep: true, after: async () => { await page.$eval('.modal [data-a="no"]', (b) => (b as HTMLElement).click()).catch(() => {}); } });
}

async function enterWorld() {
  await page.$eval(`.cs-slot[data-name="${HERO}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await waitFn("document.getElementById('charsel').hidden", 20000);
  await waitFn("window.__game && window.__game.scene.isActive('game')", 20000);
  await waitFn("window.__net && window.__net.self && window.__net.online", 15000);
  await sleep(1800);
}

// ---------- мир: данные карты и NPC ----------
const map = generateMap(MAP_SEED);
const spawn = map.playerSpawn;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const styledCity = CITIES.find((c) => c.style && c.quest)!;
const bossId = Object.keys(MOBS).find((id) => MOBS[id].boss)!;
const mobSpawn = map.spawns.filter((s) => !MOBS[s.mob]?.boss).sort((a, b) => dist(a, spawn) - dist(b, spawn))[0];

/** Подготовка героя: уровень, золото, снаряжение с заточкой и легендарками, вещи в сумке, умения, очки, чат. */
async function prepHero() {
  await step("уровень и золото", async () => {
    await dbg({ op: "level", v: 20 });
    await dbg({ op: "gold", v: 8000 });
    await sleep(600);
  });
  await step("снаряжение", async () => {
    await dbg({
      op: "gear",
      slots: {
        weapon: { leg: "storm_blade", plus: 3 }, offhand: { base: "shield", r: 1, plus: 2 }, helmet: { leg: "ember_helm", plus: 2 },
        armor: { r: 2, plus: 4 }, boots: { r: 0 }, cloak: { r: 1 }, ring: { r: 2, plus: 1 }, amulet: { r: 1 },
      },
    });
    await sleep(400);
  });
  await step("вещи в сумке", async () => {
    const adds: Record<string, unknown>[] = [
      { base: "sword", ilvl: 14, rarity: 1 }, { base: "sword", ilvl: 20, rarity: 2 }, { base: "armor", ilvl: 12, rarity: 0 },
      { base: "helmet", ilvl: 20, rarity: 2 }, { base: "boots", ilvl: 18, rarity: 1 }, { base: "ring", ilvl: 20, rarity: 2 },
      { base: "amulet", ilvl: 16, rarity: 1 }, { unique: "rootbreaker" }, { unique: "ashbringer" },
      { base: "hp_potion", ilvl: 1, rarity: 0 }, { base: "hp_potion", ilvl: 1, rarity: 0 }, { base: "mp_potion", ilvl: 1, rarity: 0 },
    ];
    for (const m of adds) { await dbg({ op: "item", ...m }); await sleep(70); }
    await sleep(500);
  });
  await step("умения", async () => {
    const defs = classSkills("warrior");
    let n = 0;
    for (const target of [1, 2, 3]) {
      for (;;) {
        const s = await self();
        if (s.skillPoints <= 4 || n >= 24) break;
        const pick = defs
          .filter((d) => (s.skills[d.id] || 0) < target && !canLearn(d, s.skills, s.level, s.skillPoints))
          .sort((a, b) => a.tree[0] - b.tree[0] || a.tree[1] - b.tree[1])[0];
        if (!pick) break;
        n++;
        await sendNet("learn", { id: pick.id });
        await waitFn(`(window.__net.self.skills['${pick.id}'] || 0) > ${s.skills[pick.id] || 0}`, 2500).catch(() => {});
      }
    }
  });
  await step("очки характеристик", async () => {
    for (const [stat, n] of [["str", 6], ["vit", 4], ["agi", 2]] as const) for (let i = 0; i < n; i++) { await sendNet("alloc", { stat }); await sleep(70); }
    await sleep(300);
  });
  await step("чат", async () => {
    const b = await ensureBot();
    const hp = await heroPos();
    b.send("dbg", { op: "tp", x: hp.x + 90, y: hp.y + 40 });
    for (const t of ["Привет всем! Кто на арену?", "Продам эпический шлем, пишите в личку", "Нужен танк в группу на болота"]) { b.send("chat", { text: t }); await sleep(250); }
    await sendNet("chat", { text: "Иду к кузнецу, апаю меч" });
    await run(`
      hud.chatLine({ from: 'Тайный Умбрат', text: 'Хрррак гхот мурр', cls: 'warlock', faction: 'umbrath', foreign: true });
      hud.chatLine({ from: '', text: 'Вы заработали 120 з за задание', sys: true });
      hud.chatLine({ from: 'Хранитель Пепла', text: 'Вы не пройдёте!', boss: true });
      hud.chatLine({ from: 'Рейд', text: 'Танк, держи босса!', raid: true });
      hud.toast({ text: 'Получено: Меч Бури', kind: 'loot', icon: 'sword', classes: ['warrior'] });
    `);
    await sleep(500);
  });
}

async function ensureBot(): Promise<Bot> {
  if (!bot) bot = await Bot.join(BOT_NAME, PASS, "mage");
  return bot;
}

/** Окно с подсказкой: наводим курсор на элемент (индекс среди совпадений) и ждём, пока подсказка появится. */
async function hover(sel: string, index = 0) {
  const els = await page.$$(sel);
  if (!els[index]) throw new Error(`нет элемента для наведения: ${sel}[${index}]`);
  await els[index].hover();
  await waitSel(".tip", 5000);
  await sleep(150);
}

/** Первый вход в мир: окно выбора схемы клавиш (флаг controls:force-offer), затем подготовка героя. */
async function stageEntry() {
  await item("scheme-offer", "Окно выбора схемы клавиш при первом входе", ".ctl-modal .ctl-ask", "флаг controls:force-offer → окно появляется при создании HUD", async () => {
    await waitSel(".ctl-modal .ctl-ask", 6000);
  }, { keep: true, after: async () => { await page.$eval('.ctl-modal [data-i="0"]', (b) => (b as HTMLElement).click()).catch(() => {}); await sleep(300); } });
  await prepHero();
  await sleep(800);
}

// ---------- мир: HUD ----------
async function stageHud() {
  await item("hud-overview", "HUD в мире: общий вид", ".hud-player, .hud-mini, .hud-bar, .hud-chat", "герой в городе, окна закрыты, в чате несколько строк (в т.ч. чужая фракция, система, босс)", async () => {
    await tp(spawn.x, spawn.y, 4500); // пока не исчезнут баннер зоны и тост «Открыт телепорт»
  });
  await item("hud-player", "Рамка героя", ".hud-player", "dbg hp: здоровье ~60%; видны очки характеристик/умений, золото, фракция", async () => {
    const s = await self();
    await dbg({ op: "hp", v: Math.round(s.derived.maxHp * 0.62) });
    await sleep(300);
  }, { zoom: true });
  await item("hud-player-combat", "Рамка героя: «В бою»", ".hud-player", "hud.setCombat(true)", () => run("hud.setCombat(true)"), { zoom: true, after: () => run("hud.setCombat(false)") });
  // сроки подлиннее: отсчёт идёт в самой странице, и значки не должны истечь, пока делается снимок
  await item("hud-player-auras", "Рамка героя: бафы и дебафы", ".hud-player", "hud.setAuras(): синтетический список — бафы (щит, обновление, ускорение, ярость со стаками, еда на 1 ч), затем дебафы (оглушение, замедление, кровотечение и яд со стаками, горение, бессрочный «Чужак»)", () => run(`
    window.__aurasKeep = hud.auras;
    hud.setAuras(a);
  `, [
    { k: "shield", ms: 45000, v: 340 },
    { k: "renew", ms: 58000, v: 52 },
    { k: "haste", ms: 30000, v: 25 },
    { k: "fury", ms: 120000, n: 4 },
    { k: "food_feast", ms: 3600000 },
    { k: "stun", ms: 40000 },
    { k: "slow", ms: 90000, v: 30 },
    { k: "bleed", ms: 300000, n: 2 },
    { k: "venom", ms: 55000, n: 3 },
    { k: "burn", ms: 35000 },
    { k: "intruder", ms: 0 },
  ]), { zoom: true, after: () => run("hud.auras = window.__aurasKeep || []; delete window.__aurasKeep; hud.renderAuras();") });
  await item("hud-minimap", "Миникарта с кнопками меню", ".hud-mini", "кнопки «Сумка/Умения/Карта/Меню» и кнопка сворачивания", async () => {}, { zoom: true });
  await item("hud-minimap-collapsed", "Миникарта свёрнута", ".hud-mini", "hud.toggleMinimap()", () => run("hud.toggleMinimap()"), { zoom: true, after: () => run("hud.toggleMinimap()") });
  await item("hud-hotbar", "Панель умений (хотбар)", ".hud-bar", "изученные умения встали на панель, рядом слоты маунта и питомца", async () => {}, { zoom: true });
  // слот панели по содержимому, до которого может дойти курсор (левые слоты у края частично закрыты окном чата — это видно на снимках)
  const slotAt = (sel: string, pred: string) => run<number>(`
    const hit = (e) => { const r = e.getBoundingClientRect(); if (r.width < 5) return false; const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (e === t || e.contains(t)); };
    return [...document.querySelectorAll(${JSON.stringify(sel)})].findIndex((e) => hit(e) && ${pred});`);
  await item("hud-hotbar-tooltip", "Панель умений: подсказка умения", ".hud-bar, .tip", "наведение на слот с умением", async () => {
    await hover(".hud-bar .hb-slot", await slotAt(".hud-bar .hb-slot", "!!e.querySelector('img') && !e.querySelector('.qty')"));
  });
  await item("hud-hotbar-tooltip-potion", "Панель умений: подсказка зелья", ".hud-bar, .tip", "наведение на слот с зельем", async () => {
    await hover(".hud-bar .hb-slot", await slotAt(".hud-bar .hb-slot", "!!e.querySelector('.qty')"));
  });
  await item("hud-hotbar-tooltip-mount", "Панель умений: подсказка слота маунта", ".hud-bar, .tip", "наведение на слот «Маунт» (клавиша X справа от панели)", async () => {
    await hover(".hud-bar .hb-extras .slot", 0);
  });
  await item("hud-hotbar-tooltip-pet", "Панель умений: подсказка слота питомца", ".hud-bar, .tip", "наведение на слот «Питомец» (клавиша Z справа от панели)", async () => {
    await hover(".hud-bar .hb-extras .slot", 1);
  });
  await item("hud-chat", "Чат с несколькими строками", ".hud-chat", "строки игроков (цвет класса), система, чужая фракция, лут, босс, рейд", async () => {}, { zoom: true });
  await item("hud-chat-input", "Чат: поле ввода в фокусе", ".hud-chat", "hud.focusChat() и набор текста", async () => {
    await run("hud.focusChat()");
    await page.keyboard.type("Привет, как дела?");
  }, { zoom: true, after: () => run("hud.chatInput.value = ''; hud.chatInput.blur();") });
  await item("hud-toasts", "Всплывающие сообщения: лут, уровень, ошибка, инфо", ".toasts", "hud.toast() четырёх видов подряд", async () => {
    await run(`
      hud.toast({ text: 'Получено: Меч Бури', kind: 'loot', icon: 'sword', classes: ['warrior', 'deathknight'] });
      hud.toast({ text: 'Новый уровень: 21! Очки характеристик и умений ждут (C, K)', kind: 'level' });
      hud.toast({ text: 'Не хватает золота для покупки', kind: 'error' });
      hud.toast({ text: 'Вы вошли в зону: Эмберхолл', kind: 'info' });
    `);
  }, { zoom: true, zoomPad: 20, settle: 200 });
  await item("hud-errline", "Строка ошибок над панелью умений", ".errline.on", "hud.castError() — виден 1,5 с", () => run("hud.castError('Недостаточно маны')"), { zoom: true, zoomPad: 30, settle: 120 });
  await item("hud-zone-banner", "Баннер зоны", ".hud-zone.show", "hud.showZone()", () => run("hud.showZone('Эмберхолл', 'Город · безопасно', '#ffd27a')"), { zoom: true, zoomPad: 20, settle: 700 });
  await item("mount-cast", "Полоса призыва маунта / каста", "#mount-cast", "net.emit('mountcast') — так сервер присылает сообщение", async () => {
    await run("net.emit('mountcast', { ms: 20000, name: 'Бурый конь' })");
  }, { zoom: true, zoomPad: 20, settle: 1500 });
  await item("air-bar", "Шкала воздуха под водой", "#air-bar", "net.emit('air', { air: 14, max: 20 })", () => run("net.emit('air', { air: 14, max: 20 })"), { zoom: true, zoomPad: 20, settle: 300 });
  await item("air-bar-low", "Шкала воздуха: мало", "#air-bar", "net.emit('air', { air: 3, max: 20 })", () => run("net.emit('air', { air: 3, max: 20 })"), { zoom: true, zoomPad: 20, settle: 300 });
  await item("sys-reconnect", "Окно «Переподключение…»", ".sys-back.reconnect:not([hidden]) .sys-panel", "net.emit('reconnecting')", async () => {
    await run("net.emit('reconnecting', { attempt: 2, nextAt: performance.now() + 8000, since: performance.now() - 14000 })");
  }, { after: () => run("net.emit('reconnected', 1)") });
}

// ---------- мир: окна без NPC ----------
async function stageWindows() {
  await item("win-char", "Окно «Герой» (C)", ".win-char", "hud.toggle('char'): характеристики с «+», производные, 8 строк снаряжения, легенда свечения", () => run("hud.toggle('char')"));
  await item("win-char-tooltip", "Окно «Герой»: подсказка характеристики", ".win-char, .tip", "наведение на название «Сила»", async () => {
    await run("hud.toggle('char')");
    await hover(".win-char .stats .k");
  });
  await item("win-char-item-tooltip", "Окно «Герой»: подсказка надетой вещи", ".win-char, .tip", "наведение на строку надетого оружия (легендарка с заточкой)", async () => {
    await run("hud.toggle('char')");
    await hover(".win-char .gear-row:not(.empty)");
  });

  await item("win-inv", "Окно «Снаряжение и сумка» (I)", ".win-inv", "hud.toggle('inv'): надетое, питомец/маунт, сетка сумки, золото", () => run("hud.toggle('inv')"));
  const inv = (await self()).inventory as any[];
  const idxEpic = inv.findIndex((it) => it && it.rarity >= 2 && !it.unique && !/potion/.test(it.base));
  const idxUnique = inv.findIndex((it) => it?.unique === "ashbringer");
  await item("win-inv-tooltip", "Сумка: подсказка эпической вещи со сравнением", ".win-inv, .tip", `наведение на ячейку ${idxEpic + 1}`, async () => {
    await run("hud.toggle('inv')");
    await hover(`.win-inv .grid .cell:nth-child(${idxEpic + 1})`);
  });
  await item("win-inv-tooltip-unique", "Сумка: подсказка уникальной вещи (уровень выше моего)", ".win-inv, .tip", `наведение на ячейку ${idxUnique + 1}`, async () => {
    await run("hud.toggle('inv')");
    await hover(`.win-inv .grid .cell:nth-child(${idxUnique + 1})`);
  });
  await item("win-inv-tooltip-equipped", "Сумка: подсказка надетой легендарной вещи", ".win-inv, .tip", "наведение на надетое оружие", async () => {
    await run("hud.toggle('inv')");
    await hover(".win-inv .equip .cell.r3");
  });
  await item("win-inv-pet-popup", "Сумка: список питомцев", ".win-inv, .comp-pop", "клик по слоту «Питомец»", async () => {
    await run("hud.toggle('inv')");
    await page.$$eval(".win-inv .cell.comp", (c) => (c[0] as HTMLElement).click());
  }, { after: () => run("hud.petPop = null") });
  await item("win-inv-mount-popup", "Сумка: список маунтов", ".win-inv, .comp-pop", "клик по слоту «Маунт»", async () => {
    await run("hud.toggle('inv')");
    await page.$$eval(".win-inv .cell.comp", (c) => (c[1] as HTMLElement).click());
  }, { after: () => run("hud.petPop = null") });

  await item("win-skills", "Окно «Дерево умений» (K)", ".win-skills", "hud.toggle('skills'): изученные и закрытые узлы, линии связей", () => run("hud.toggle('skills')"), { settle: 600 });
  await item("win-skills-tooltip", "Умения: подсказка изученного умения", ".win-skills, .tip", "наведение на изученный узел", async () => {
    await run("hud.toggle('skills')");
    await sleep(300);
    await hover(".win-skills .node:not(.passive) .slot:not(.locked)");
  });
  await item("win-skills-tooltip-locked", "Умения: подсказка закрытого умения", ".win-skills, .tip", "наведение на неизученный узел", async () => {
    await run("hud.toggle('skills')");
    await sleep(300);
    await hover(".win-skills .slot.locked");
  });

  await item("win-bestiary-empty", "Бестиарий (пустой, записи закрыты)", ".win-bestiary", "hud.toggle('bestiary') у героя без убийств", () => run("hud.toggle('bestiary')"));

  await item("win-worldmap", "Карта мира (M)", ".win-worldmap", "hud.openWorldMap()", () => run("hud.openWorldMap()"), { settle: 1000 });
  await item("win-worldmap-zoom", "Карта мира: приближение колесом", ".win-worldmap", "колесо мыши над картой ×3", async () => {
    await run("hud.openWorldMap()");
    await sleep(600);
    const box = await page.$eval(".wm-view canvas", (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel({ deltaY: -300 }); await sleep(120); }
  }, { settle: 500 });

  await item("win-settings", "Окно «Настройки»", ".win-settings", "hud.toggle('settings'): ползунки, флажки, режим свечения", () => run("hud.toggle('settings')"));
  await item("win-settings-keys", "Настройки: список горячих клавиш (конец окна)", ".win-settings", "прокрутка окна настроек вниз", async () => {
    await run("hud.toggle('settings'); const w = hud.wins.settings; for (const e of [w, w.querySelector('.body')]) e.scrollTop = e.scrollHeight;");
  });
  await item("win-controls", "Настройки → «Управление»: схема, опции мыши, клавиши", "#set-controls", "прокрутка окна настроек к разделу «Управление»", async () => {
    await run("hud.toggle('settings'); document.getElementById('set-controls').scrollIntoView({ block: 'start' });");
  });
  await item("win-controls-capture", "Управление: ожидание нажатия клавиши", "#set-controls", "клик по сочетанию → «Нажмите клавишу»", async () => {
    await run("hud.toggle('settings'); document.getElementById('set-controls').scrollIntoView({ block: 'start' });");
    await sleep(150);
    await clickEl("#set-controls .ctl-chip[data-a]");
    await waitSel("#set-controls .ctl-chip.wait", 3000);
  }, { after: async () => { await page.keyboard.press("Escape"); await sleep(200); } });
  await item("win-controls-ask", "Управление: вопрос «Поменять местами?» / «Сбросить?»", ".ctl-modal .ctl-ask", "переназначить клавишу, затем «Сбросить по умолчанию»", async () => {
    await run("hud.toggle('settings'); document.getElementById('set-controls').scrollIntoView({ block: 'start' });");
    await sleep(150);
    await clickEl("#set-controls .ctl-chip[data-a]");
    await waitSel("#set-controls .ctl-chip.wait", 3000);
    await page.keyboard.press("KeyJ");
    // клавиша либо занята (сразу вопрос про обмен), либо переназначена без вопроса
    await waitFn("!!document.querySelector('.ctl-modal') || !document.querySelector('.ctl-chip.wait')", 3000);
    if (!(await page.$(".ctl-modal .ctl-ask"))) {
      await clickEl("#ctl-reset");
      await waitSel(".ctl-modal .ctl-ask", 3000);
    }
  }, { after: async () => {
    // вопрос про обмен — «Отмена» (раскладка не менялась); вопрос про сброс — «Сбросить» (возвращает схему по умолчанию)
    const txt = await page.$eval(".ctl-modal .ctl-ask p", (p) => p.textContent ?? "").catch(() => "");
    if (txt) await page.$eval(`.ctl-modal [data-i="${/Поменять/.test(txt) ? 1 : 0}"]`, (b) => (b as HTMLElement).click());
    await sleep(300);
  } });
  await item("win-help", "Окно «Помощь»", ".win-help", "hud.toggle('help'): клавиши и советы", () => run("hud.toggle('help')"));

  await item("menu-esc", "Игровое меню (Esc)", ".gmenu-back .gmenu", "hud.gameMenu.open()", () => run("hud.gameMenu.open()"));
  await item("win-inspect", "Окно «Осмотр» (свой герой)", ".win-inspect", "hud.inspect.open(net.id): сервер отвечает снаряжением", async () => {
    await run("hud.inspect.open(net.id)");
    await waitSel(".win-inspect", 4000);
  });
  await item("win-inspect-tooltip", "Осмотр: подсказка вещи", ".win-inspect, .tip", "наведение на строку снаряжения", async () => {
    await run("hud.inspect.open(net.id)");
    await waitSel(".win-inspect .gear-row:not(.empty)", 4000);
    await hover(".win-inspect .gear-row:not(.empty)");
  });
}

// ---------- арена ----------
async function stageArena() {
  await step("рейтинги и сезон арены", async () => {
    await dbg({ op: "rating", mode: "1v1", v: 1480 });
    await dbg({ op: "rating", mode: "2v2", v: 1250 });
    await dbg({ op: "season:end" });
    await sleep(600);
    await dbg({ op: "rating", mode: "1v1", v: 1420 });
    await dbg({ op: "rating", mode: "2v2", v: 1180 });
    await sleep(400);
  });
  await item("win-arena", "Окно «Арена» (P): рейтинг и очередь", ".win-arena", "hud.toggle('arena'): карточки 1×1 и 2×2, группа, титулы", async () => {
    await run("hud.arena.open()");
    await waitSel(".win-arena .mode-card", 4000);
  });
  await item("win-arena-queue", "Арена: состояние очереди", ".win-arena", "кнопка «В очередь» на карточке 1×1", async () => {
    await run("hud.arena.open()");
    await waitSel(".win-arena .mode-card .btn.primary", 4000);
    await page.$eval(".win-arena .mode-card .btn.primary", (b) => (b as HTMLElement).click());
    await waitSel(".win-arena .queue-status", 4000);
  });
  await item("arena-found", "Арена: «Сразиться с ботом?» / «Матч найден»", ".arena-modal:not([hidden]) .arena-dialog", "ждём предложения боя с ботом (ARENA_BOT_WAIT_MS=30000 на тестовом сервере)", async () => {
    await waitSel(".arena-modal:not([hidden]) .arena-dialog", 24000);
  }, { keep: true, settle: 100, after: async () => {
    await page.$eval('.arena-modal:not([hidden]) [data-a="0"]', (b) => (b as HTMLElement).click()).catch(() => {});
    await sendNet("arena:cancel");
    await sleep(500);
  } });
  await item("win-arena-top", "Арена: вкладка «Лидеры»", ".win-arena", "вкладка «Лидеры»", async () => {
    await run("hud.arena.open()");
    await waitSel(".win-arena [data-tab=top]", 4000);
    await page.$eval(".win-arena [data-tab=top]", (b) => (b as HTMLElement).click());
    await sleep(700);
  });
  await item("win-arena-history", "Арена: вкладка «История»", ".win-arena", "вкладка «История» (боёв ещё не было)", async () => {
    await run("hud.arena.open()");
    await waitSel(".win-arena [data-tab=history]", 4000);
    await page.$eval(".win-arena [data-tab=history]", (b) => (b as HTMLElement).click());
    await sleep(700);
  }, { after: () => run("hud.arena.tab = 'rating'") });
  // титул и рамка за сезон: выбираем первый титул
  await step("титул арены", async () => {
    await run("hud.arena.open()");
    await waitSel(".win-arena .title-list .btn", 4000);
    const titles = await page.$$(".win-arena .title-list .btn");
    if (titles[1]) await titles[1].evaluate((b) => (b as HTMLElement).click());
    await sleep(800);
  });
  await item("hud-player-framed", "Рамка героя с наградной рамкой арены", ".hud-player", "арена: титул сезона выбран → цветная рамка (при сбое выбора рамка выставляется вручную)", async () => {
    await run("if (net.arenaInfo && !net.arenaInfo.frame) { net.arenaInfo.frame = 'gold'; hud.applyFrame(); }");
  }, { zoom: true });
  await item("win-arena-titles", "Арена: титулы сезона выбраны", ".win-arena", "блок «Титул и рамка» с выбранным титулом", async () => {
    await run("hud.arena.open()");
    await waitSel(".win-arena .title-list", 4000);
  });
  await item("arena-result", "Арена: окно результатов боя", ".arena-modal:not([hidden]) .arena-dialog.wide", "hud.arena.showResult() с составленным сообщением (синтетика)", async () => {
    await run(`
      const me = net.self.name;
      hud.arena.showResult({ mode: '1v1', winner: 1, reason: 'kill', durationMs: 84000, players: [
        { name: me, cls: 'warrior', team: 1, damage: 5230, healing: 0, kills: 1, deaths: 0, left: false, ratingBefore: 1420, ratingAfter: 1441, won: true, draw: false },
        { name: 'Тень', cls: 'rogue', team: 2, damage: 3120, healing: 0, kills: 0, deaths: 1, left: false, ratingBefore: 1405, ratingAfter: 1384, won: false, draw: false } ] });
      clearTimeout(hud.arena.resultTimer);
    `);
  }, { after: () => run("hud.arena.results.hidden = true; clearTimeout(hud.arena.resultTimer);") });
}

// ---------- второй игрок: обмен, группа, контекстное меню ----------
async function stageBot() {
  const b = await ensureBot();
  const sid = await run<string>("return net.id");
  const heroName = HERO;
  const bringBot = async () => {
    const hp = await heroPos();
    b.send("dbg", { op: "tp", x: hp.x + 60, y: hp.y + 20 });
    await sleep(800);
  };
  await step("герой и спутница спокойны", async () => {
    await tp(spawn.x, spawn.y, 1000);
    await dbg({ op: "calm" });
    b.send("dbg", { op: "calm" });
    await bringBot();
  });

  await item("ctx-menu-player", "Контекстное меню игрока (ПКМ)", ".ctx-menu:not([hidden])", "hud.trade.showMenu() для спутницы — как при ПКМ по игроку", async () => {
    await run("hud.trade.showMenu(a.sid, a.name, 520, 330, () => hud.inspect.open(a.sid), () => {})", { sid: b.id, name: BOT_NAME });
  });
  skip("ctx-menu-item", "Контекстное меню предмета (ПКМ по предмету)", "", "ПКМ по ячейке сумки", "в клиенте нет такой поверхности: у предметов нет обработчика contextmenu (ПКМ ничего не открывает), есть только меню игрока");

  await item("party-invite", "Приглашение в группу", ".arena-modal:not([hidden]) .arena-dialog", "спутница шлёт party:invite", async () => {
    b.send("party:invite", { name: heroName });
    await waitSel(".arena-modal:not([hidden]) .arena-dialog", 8000);
  }, { after: async () => { await page.$eval('.arena-modal:not([hidden]) [data-a="1"]', (x) => (x as HTMLElement).click()).catch(() => {}); await sleep(800); } });
  await item("hud-party", "Рамка группы под рамкой героя", ".hud-party", "приглашение принято: напарник и его здоровье", async () => {
    await waitSel(".hud-party", 8000);
    await sleep(800);
  }, { zoom: true, after: async () => { await sendNet("party:leave"); await sleep(500); } });

  await item("win-trade-ask", "Обмен: запрос на обмен", ".arena-modal:not([hidden]) .arena-dialog", "спутница шлёт trade:request", async () => {
    await bringBot();
    b.send("trade:request", { id: sid });
    await waitSel(".arena-modal:not([hidden]) .arena-dialog", 8000);
  });
  await item("win-trade", "Окно «Обмен»", ".win-trade", "запрос принят; обе стороны выложили вещи и золото", async () => {
    await bringBot();
    b.send("trade:request", { id: sid });
    await waitSel(".arena-modal:not([hidden]) [data-a='1']", 8000);
    await page.$eval(".arena-modal:not([hidden]) [data-a='1']", (x) => (x as HTMLElement).click());
    await waitSel(".win-trade", 8000);
    // мои вещи: три обычные из сумки; золото
    const inv = (await self()).inventory as any[];
    const mine = inv.map((it, i) => ({ it, i })).filter((x) => x.it && !x.it.unique && !x.it.legendary && x.it.rarity <= 2).slice(0, 3);
    for (const m of mine) { await run("hud.trade.offer(a)", m.i); await sleep(150); }
    await sendNet("trade:gold", { v: 150 });
    // вещи спутницы
    b.send("dbg", { op: "item", base: "ring", ilvl: 8, rarity: 1 });
    b.send("dbg", { op: "item", base: "hp_potion", ilvl: 1, rarity: 0 });
    await sleep(600);
    const theirs = ((b.self?.inventory ?? []) as any[]).map((it, i) => ({ it, i })).filter((x) => x.it).slice(-2);
    for (const t of theirs) { b.send("trade:add", { index: t.i }); await sleep(150); }
    b.send("trade:gold", { v: 35 });
    b.send("trade:ready", {});
    await sleep(700);
  }, { keep: true });
  await item("win-trade-tooltip", "Обмен: подсказка вещи в окне обмена", ".win-trade, .tip", "наведение на последнюю вещь в окне (колонка «Вы получаете»)", async () => {
    const n = await run<number>("return document.querySelectorAll('.win-trade .trade-grid .cell[class*=\" r\"]').length");
    await hover('.win-trade .trade-grid .cell[class*=" r"]', Math.max(0, n - 1));
  }, { keep: true });
  await item("win-trade-ready", "Обмен: обе стороны готовы, кнопка «Обменять»", ".win-trade", "после «Готов» у обоих через 3 с появляется подтверждение", async () => {
    await sendNet("trade:ready");
    await sleep(3600);
  }, { keep: true, after: async () => { await run("hud.trade.close()"); await sleep(400); } });
}

// ---------- NPC ----------
async function stageNpc() {
  const merchant = map.merchant;
  await item("hud-interact-tip", "Подсказка взаимодействия над панелью", ".interact-tip", "рядом с торговкой сцена показывает «Поговорить: …»", async () => { await near(merchant, 1800); }, { zoom: true, zoomPad: 30, settle: 500 });

  await item("win-shop-buy", "Лавка торговки: вкладка «Купить»", ".win-shop", "hud.openShop() у торговки: зелья, ездовые животные, питомцы", async () => {
    await near(merchant, 1200);
    await run("hud.openShop()");
    await sleep(700);
  });
  await step("покупка питомца и маунта", async () => {
    for (let i = 0; i < 2; i++) {
      const clicked = await run<boolean>("const b = [...document.querySelectorAll('.win-shop .si-btns .btn')].find((e) => e.textContent.includes('Купить') && !e.disabled); if (!b) return false; b.click(); return true;");
      if (!clicked) break;
      await sleep(900);
    }
  });
  await step("полная сумка", async () => { await dbg({ op: "fill" }); await sleep(700); });
  await item("win-inv-full", "Сумка, заполненная до краёв", ".win-inv", "dbg fill: все пустые ячейки заняты", () => run("hud.toggle('inv')"));
  await item("win-shop-sell", "Лавка торговки: вкладка «Продать»", ".win-shop", "вкладка «Продать» с полной сумкой: обычные вещи выбраны, итог и «Продать выбранное» в подвале", async () => {
    await run("hud.openShop()");
    await sleep(400);
    await page.$$eval(".win-shop .shop-tabs .btn", (b) => (b[1] as HTMLElement).click());
    await sleep(400);
    await page.evaluate("document.querySelector('.win-shop .sell-quick')?.click()"); // «Выбрать обычные»
    await sleep(300);
  }, { after: async () => {
    // освободить сумку: «Продать выбранное» (обычные вещи без заточки выбраны в setup)
    await page.evaluate("[...document.querySelectorAll('.win-shop .sell-go')].find((e) => !e.disabled)?.click()").catch(() => {});
    await sleep(1500);
  } });

  await item("win-shop-sell-tooltip", "Лавка: подсказка вещи на вкладке «Продать»", ".win-shop, .tip", "наведение на вещь в сетке продажи", async () => {
    await run("hud.openShop()");
    await sleep(500);
    await hover(".win-shop .sell-grid .tile");
  });

  await item("win-bags", "Сумочник: расширение сумки", ".win-bags", "hud.bags.open() у Кожемякина", async () => {
    await near(BAGMAN, 1200);
    await run("hud.bags.open()");
  });
  await step("расширение сумки", async () => { await clickEl(".win-bags .bank-buy .btn").catch(() => {}); await sleep(700); });

  await item("win-cook", "Повар: окно блюд", ".win-cook", "hud.cook.open() у повара Борщана", async () => {
    await near(COOK, 1200);
    await run("hud.cook.open('cook')");
  });
  await step("еда", async () => {
    await clickEl(".win-cook .row .btn").catch(() => {});
    await sleep(900);
    const inv = (await self()).inventory as any[];
    const i = inv.findIndex((it) => it && FOOD_IDS.includes(it.base));
    if (i >= 0) { await sendNet("use", { index: i }); await sleep(900); }
  });
  await item("hud-player-food", "Рамка героя: значок активной еды", ".hud-player", "купить блюдо у повара и съесть", async () => {}, { zoom: true });

  await item("win-smith", "Кузнец: окно улучшения (выбора нет)", ".win-smith", "hud.smith.open() у Грома", async () => {
    await near(SMITH, 1200);
    await run("hud.smith.open()");
  });
  await step("материалы кузнеца", async () => {
    await run("hud.smith.open()");
    for (let k = 0; k < 2; k++) {
      await page.$$eval(".win-smith .smith-mats .shoprow", (rows, k) => { const b = rows[k]?.querySelectorAll(".btn"); (b?.[b.length - 1] as HTMLElement | undefined)?.click(); }, k);
      await sleep(600);
    }
  });
  await item("win-smith-selected", "Кузнец: выбрана вещь, показана стоимость улучшения", ".win-smith", "клик по вещи в блоке «Надето»", async () => {
    await run("hud.smith.open()");
    await sleep(300);
    await page.$$eval(".win-smith .smith-pick .cell", (c) => (c[0] as HTMLElement).click());
    await sleep(300);
  });

  await item("win-bank", "Банк Голдмунда: вкладка 1", ".win-bank", "hud.bank.open() у банкира: вещи и золото положены", async () => {
    await near(BANKER, 1200);
    await run("hud.bank.open()");
    await sleep(900);
    const inv = (await self()).inventory as any[];
    const take = inv.map((it, i) => ({ it, i })).filter((x) => x.it && !x.it.unique && !x.it.legendary && !/potion/.test(x.it.base)).slice(0, 4);
    for (const t of take) { await run("hud.bank.deposit(a)", t.i); await sleep(250); }
    await sendNet("bank:gold", { v: 500 });
    await sleep(700);
  });
  await item("win-bank-tooltip", "Банк: подсказка вещи", ".win-bank, .tip", "наведение на вещь во вкладке 1", async () => {
    await run("hud.bank.open()");
    await sleep(600);
    await hover('.win-bank .bank-grid .cell[class*=" r"]');
  });
  await item("win-bank-shared", "Банк: вкладка «Общий склад»", ".win-bank", "вкладка «Общий склад»", async () => {
    await run("hud.bank.open()");
    await sleep(600);
    await clickText(".win-bank .bank-tabs .btn", "Общий склад");
    await sleep(300);
  });

  const rumor = RUMOR_NPCS[0];
  await item("win-rumor", "Сплетник: диалог со слухом", ".win-rumor", "hud.rumor.open() у городского сплетника", async () => {
    await near(rumor, 1200);
    await run("hud.rumor.open(a.id, a.name)", { id: rumor.id, name: rumor.name });
    await sleep(900);
  });

  const giver = styledCity.quest!;
  await item("win-quest", "Диалог задания", ".win-quest", `hud.quest.open() у «${giver.name}» (${styledCity.name})`, async () => {
    await near(giver, 1800);
    await run("hud.quest.open(a)", giver.id);
    await sleep(500);
  });
  await step("принять задание", async () => {
    await run("hud.quest.open(a)", giver.id);
    await waitSel(".win-quest .quest-row .btn:not([disabled])", 6000);
    await clickEl(".win-quest .quest-row .btn:not([disabled])");
    await sleep(1500);
    const st = await run<any>("return { quests: net.self.quests, toasts: [...document.querySelectorAll('.toast, .errline')].map((t) => t.textContent), x: Math.round(sc.pos.x), y: Math.round(sc.pos.y) }");
    console.log("  · задание:", JSON.stringify(st), "giver", Math.round(giver.x), Math.round(giver.y));
  });
  await item("win-quest-accepted", "Диалог задания: после принятия", ".win-quest", "кнопка «В процессе»", async () => {
    await run("hud.quest.open(a)", giver.id);
    await sleep(400);
  });
  await item("win-qlog", "Журнал заданий", ".win-qlog", "hud.quest.toggleLog() с активным заданием", () => run("hud.quest.toggleLog()"));
  await item("hud-quests", "Трекер заданий под рамкой героя", ".hud-quests", "активное задание принято", async () => {}, { zoom: true });

  await item("win-tp", "Камень телепорта", ".win-tp", "hud.tp.open() у камня города", async () => {
    await tp(styledCity.stone.x + 34, styledCity.stone.y + 6, 1500);
    await run("hud.tp.open(sc.pos)");
    await sleep(400);
  });
  const herald = RAID_HERALDS[0];
  await item("win-raid", "Вестник Цитадели: окно сбора рейда", ".raid-modal:not([hidden]) .raid-dialog", "hud.raid.open() у вестника", async () => {
    await near(herald, 1500);
    await run("hud.raid.open(a)", herald.id);
    await sleep(900);
  });
  await item("raid-result", "Рейд: итоги боя", ".raid-modal:not([hidden]) .raid-res", "hud.raid.showResult() с составленным сообщением (синтетика)", async () => {
    await run(`hud.raid.showResult({ win: true, durationMs: 412000, attempt: 2, locked: false, title: 'Сокрушитель Цитадели', frame: 'Рамка Рассвета',
      players: [
        { name: net.self.name, cls: 'warrior', level: 100, role: 'tank', damage: 182340, healing: 0, deaths: 1, revives: 0 },
        { name: 'Спутница', cls: 'mage', level: 100, role: 'ranged', damage: 241900, healing: 0, deaths: 0, revives: 1 },
        { name: 'Страж-1', cls: 'healer', level: 100, role: 'healer', damage: 21000, healing: 388200, deaths: 0, revives: 2, bot: true } ],
      loot: [{ name: 'Знамя Рассвета', rarity: 3 }, { name: 'Эпический шлем', rarity: 2 }, { name: 'Зелье здоровья', rarity: 0, qty: 5 }] });`);
  }, { after: () => run("hud.raid.result.hidden = true") });
  await item("raid-banner", "Рейд: баннер фазы боя", ".raid-banner:not([hidden])", "hud.raid.showBanner() (синтетика)", async () => {
    await run("hud.raid.showBanner({ kind: 'phase', text: 'Фаза II', sub: 'Огонь с небес' })");
  }, { settle: 700, zoom: true, zoomPad: 30 });
  skip("raid-hud", "Рейд: полоса босса, рамки рейда, отсчёт", ".raid-top, .raid-frames, .raid-count", "вход в рейд (сбор у Вестника → бой с боссом)", "показывается только внутри комнаты рейда (сбор и бой длятся минуты, нужны боты и уровень 80): сценарий не заходит в рейд");
  skip("arena-board", "Арена: табло матча и отсчёт «3… 2… 1… В бой!»", ".arena-board, .arena-countdown", "матч на арене", "показывается только внутри комнаты арены: сценарий отклоняет бой с ботом и не заходит в матч");
  await item("win-arena-npc", "Распорядитель арены (клик по NPC открывает окно арены)", ".win-arena", "hud.arena.open() у распорядителя", async () => {
    await near(ARENA_NPC, 1500);
    await run("hud.arena.open()");
    await sleep(600);
  });
  await tp(spawn.x, spawn.y, 1500);
}

// ---------- бой и смерть ----------
async function stageCombat() {
  // питомца призываем в городе: в бою призыв не идёт, а в поле волчонок гибнет за секунды
  await tp(spawn.x, spawn.y, 2500);
  await dbg({ op: "calm" });
  await item("hud-pet", "Рамка питомца под рамкой героя", ".hud-pet", "pet:toggle: питомец призван (2 с), рамка под рамкой героя", async () => {
    await sendNet("pet:toggle");
    await waitSel(".hud-pet", 10000);
    await sleep(500);
  }, { zoom: true });
  await sendNet("pet:toggle").catch(() => {});
  await sleep(600);
  await item("hud-target", "Плашка цели: моб", ".hud-target", "телепорт к мобу, Tab — выбрать ближайшего врага", async () => {
    await tp(mobSpawn.x + 60, mobSpawn.y + 20, 1800);
    await page.keyboard.press("Tab");
    await sleep(700);
    if (await run<boolean>("return document.querySelector('.hud-target').hidden")) {
      await run(`
        let best = null, bd = 1e9;
        net.room.state.mobs.forEach((m, k) => { const d = Math.hypot(m.x - sc.pos.x, m.y - sc.pos.y); if (d < bd) { bd = d; best = k; } });
        if (best) sc.setTarget(best);
      `);
    }
    await waitSel(".hud-target:not([hidden])", 6000);
  }, { zoom: true });
  await item("world-combat", "Бой в мире: цель, подписи над головами, цифры урона", "#game canvas, .hud-target, .hud-bar", "умение с первого слота панели по цели", async () => {
    await run("hud.ctx.pressSlot(0, 0)");
    await sleep(350);
  }, { keep: true, settle: 100 });
  await item("hud-hotbar-cooldown", "Панель умений: перезарядка после каста", ".hud-bar", "сразу после умения с первого слота (затемнение слота и таймер)", async () => {}, { keep: true, settle: 50, zoom: true });
  await tp(spawn.x, spawn.y, 1500);
  await dbg({ op: "calm" });

  await item("death", "Экран смерти", ".death:not([hidden]) .panel", "dbg hurt: герой погибает", async () => {
    await dbg({ op: "hurt", v: 99999999 });
    await waitSel(".death:not([hidden]) .panel", 6000);
  }, { settle: 600, after: async () => {
    await sleep(4300);
    await page.$eval("#respawn", (b) => (b as HTMLElement).click()).catch(() => {});
    await sleep(2000);
  } });
  await waitFn("document.querySelector('.death').hidden", 8000).catch(() => {});
  await tp(spawn.x, spawn.y, 1500);
}

// ---------- меню выхода и системные окна ----------
async function stageMenus() {
  const menuItem = (text: string) => clickText(".gmenu .gm-item", text);
  await item("menu-logout-char", "Меню: подтверждение «Сменить героя?»", ".gmenu-back .gmenu", "Esc → «Сменить персонажа»", async () => {
    await run("hud.gameMenu.open()");
    await menuItem("Сменить персонажа");
  });
  await item("menu-logout-account", "Меню: подтверждение «Выйти из аккаунта?»", ".gmenu-back .gmenu", "Esc → «Выйти из аккаунта»", async () => {
    await run("hud.gameMenu.open()");
    await menuItem("Выйти из аккаунта");
  });
  await item("menu-logout-wait", "Меню: выход в бою (отсчёт 10 с)", ".gmenu-back .gmenu .logout-wait", "dbg fight → «Сменить персонажа» → «Сменить героя»: сервер присылает отсчёт", async () => {
    await dbg({ op: "fight" });
    await run("hud.gameMenu.open()");
    await menuItem("Сменить персонажа");
    await menuItem("Сменить героя");
    await waitSel(".gmenu .logout-wait", 4000);
  }, { after: async () => { await menuItem("Отмена").catch(() => {}); await dbg({ op: "calm" }); await sleep(500); } });
  await item("sys-kicked", "Системное окно «Сессия закрыта»", ".sys-back:not(.reconnect):not([hidden]) .sys-panel", "net.emit('kicked'): вытеснение другой вкладкой", async () => {
    await run("net.emit('kicked', 'Вы вошли в игру с другого устройства или вкладки. Эта сессия закрыта.')");
    await waitSel(".sys-back:not(.reconnect):not([hidden]) .sys-panel", 4000);
  }, { keep: true });
  // «Войти снова»: мир строится заново
  await page.evaluate("document.querySelector('.sys-back:not(.reconnect) .btn.primary')?.click()").catch(() => {});
  await waitFn("window.__game && window.__game.scene.isActive('game') && !document.getElementById('ui').hidden && window.__net.self", 25000).catch(() => {});
  await sleep(2500);
}

/** Выход к выбору героя через меню, правка БД (админ, бестиарий), повторный вход. */
async function relogAsAdmin() {
  const atSelect = await page.evaluate(() => !document.getElementById("charsel")!.hidden);
  if (!atSelect) {
    await reset();
    await dbg({ op: "calm" });
    await sleep(1500);
    await run("hud.gameMenu.open()");
    await clickText(".gmenu .gm-item", "Сменить персонажа");
    await clickText(".gmenu .gm-item", "Сменить героя");
    // в бою сервер сначала отсчитывает 10 с
    await waitFn("!document.getElementById('charsel').hidden", 30000);
  }
  await sleep(2500);
  const d = new DatabaseSync(dbFile);
  try {
    const key = HERO.toLowerCase();
    const row = d.prepare("SELECT data FROM players WHERE name_key = ?").get(key) as { data: string } | undefined;
    if (!row) throw new Error("герой не найден в БД");
    const save = JSON.parse(row.data);
    const ids = Object.keys(MOBS);
    const normal = ids.filter((id) => !MOBS[id].boss), bosses = ids.filter((id) => MOBS[id].boss);
    save.mobKills = Object.fromEntries([...normal.map((id, i) => [id, i < 6 ? 99 : i < 9 ? 1 : 0]), ...bosses.map((id) => [id, 99])].filter(([, n]) => n));
    save.bossKills = Object.fromEntries(bosses.map((id) => [id, 3]));
    d.prepare("UPDATE players SET data = ? WHERE name_key = ?").run(JSON.stringify(save), key);
    d.prepare("UPDATE accounts SET admin = 1 WHERE id = (SELECT account_id FROM players WHERE name_key = ?)").run(key);
  } finally {
    d.close();
  }
  await enterWorld();
}

// ---------- админ-сессия ----------
async function stageAdmin() {
  await waitFn("window.__net.self && window.__net.self.isAdmin", 10000);
  await item("menu-esc-admin", "Игровое меню (Esc) у админа: пункт «Админ-панель»", ".gmenu-back .gmenu", "hud.gameMenu.open() у героя с admin=1", () => run("hud.gameMenu.open()"));
  await item("win-bestiary", "Бестиарий: открытые записи", ".win-bestiary", "hud.toggle('bestiary') после правки mobKills в БД", () => run("hud.toggle('bestiary')"));
  await item("win-bestiary-boss", "Бестиарий: запись босса", ".win-bestiary", "клик по боссу в списке", async () => {
    await run("hud.toggle('bestiary')");
    await sleep(200);
    await clickEl(`.win-bestiary .bst-list [data-id="${bossId}"]`);
    await sleep(300);
  });

  await step("логи админа", async () => {
    await sendNet("admin:announce", { text: "Через 10 минут рестарт сервера" });
    await sleep(300);
  });
  await item("admin-banner", "Админ-объявление (баннер)", ".adm-banner:not([hidden])", "admin:announce", async () => {
    await sendNet("admin:announce", { text: "Через 10 минут рестарт сервера" });
    await waitSel(".adm-banner:not([hidden])", 3000);
  }, { zoom: true, zoomPad: 20 });
  await item("win-admin-players", "Админ-панель: «Игроки»", ".win-admin", "hud.admin.toggle()", async () => {
    await run("hud.admin.toggle()");
    await sleep(900);
  });
  const tab = async (name: string, wait = 900) => {
    await run("hud.admin.toggle()");
    await sleep(500);
    await page.$eval(`.win-admin [data-tab="${name}"]`, (b) => (b as HTMLElement).click());
    await sleep(wait);
  };
  await item("win-admin-give", "Админ-панель: «Выдача» (каталог предметов)", ".win-admin", "вкладка «Выдача»", () => tab("give", 1400));
  await item("win-admin-world", "Админ-панель: «Мир»", ".win-admin", "вкладка «Мир»", () => tab("world"));
  await item("win-admin-logs", "Админ-панель: «Логи»", ".win-admin", "вкладка «Логи»", () => tab("logs", 1200));

  // лавка встречи: настоящий бродячий торговец
  const place = PLACES.find((q) => q.id === "clear_dale") ?? PLACES[0];
  await item("win-enc-shop", "Лавка встречи (бродячий торговец)", ".win-enc", "admin:encounter merchant на открытом месте, затем hud.enc.open()", async () => {
    await tp(place.x * 32 + 16, place.y * 32 + 16, 1800);
    await sendNet("admin:encounter", { kind: "merchant" });
    await waitFn("window.__game.scene.getScene('game').npcs.some((n) => n.kind === 'enc')", 6000);
    const n = await run<{ id: string; x: number; y: number }>("const n = sc.npcs.find((n) => n.kind === 'enc'); return { id: n.id, x: n.sprite.x, y: n.sprite.y };");
    await tp(n.x, n.y + 28, 900);
    await run("hud.enc.open(a)", n.id);
    await waitSel(".win-enc", 5000);
  });
  await item("win-enc-tooltip", "Лавка встречи: подсказка вещи", ".win-enc, .tip", "наведение на вещь в лавке", async () => {
    await hover(".win-enc .row .cell");
  }, { keep: true });
  await item("win-enc-dialog", "Встреча: диалог путника", ".win-enc", "hud.enc.dialog() с текстом путника (синтетика: настоящая встреча уже занята лавкой)", async () => {
    await run(`hud.enc.dialog({ id: 'x', name: 'Усталый путник', text: 'Фух... Далеко же я забрёл. Нет ли у вас зелья здоровья? Я отблагодарю.', opts: [{ id: 'potion', label: 'Отдать зелье здоровья' }, { id: 'guard', label: 'Предложить охрану' }] });`);
  });
  await sendNet("dbg", { op: "calm" }).catch(() => {});

  // босс как цель
  await item("hud-target-boss", "Плашка цели: босс", ".hud-target.boss", "admin:spawn boss рядом, Tab", async () => {
    await dbg({ op: "god" });
    await tp(mobSpawn.x + 60, mobSpawn.y + 20, 1500);
    await sendNet("admin:spawn", { mob: bossId });
    // Tab выбирает ближайшего врага (рядом бродят кабаны): босса выбираем по его спрайту
    const bossSprite = MOBS[bossId].sprite;
    await waitFn("(() => { let f = false; window.__net.room.state.mobs.forEach((m) => { if (m.sprite === '" + bossSprite + "') f = true; }); return f; })()", 6000);
    await sleep(800);
    await run("let id = null; net.room.state.mobs.forEach((m, k) => { if (m.sprite === a) id = k; }); if (!id) throw new Error('босс не появился'); sc.setTarget(id);", bossSprite);
    await waitSel(".hud-target.boss", 6000);
  }, { zoom: true, after: async () => { await dbg({ op: "gear", slots: {} }); await tp(spawn.x, spawn.y, 1000); } });
}

// ---------- запуск ----------
function summary() {
  const ok = manifest.filter((e) => e.ok), skipped = manifest.filter((e) => e.skipped), failed = manifest.filter((e) => !e.ok && !e.skipped);
  const tried = manifest.length - skipped.length;
  console.log(`\nСнято ${ok.length} из ${tried} (${tried ? Math.round((ok.length / tried) * 100) : 0}%), пропущено как несуществующие/недостижимые: ${skipped.length}, не удалось: ${failed.length}`);
  for (const f of failed) console.log(`  не удалось: ${f.id} — ${f.error}`);
  for (const s of skipped) console.log(`  пропущено: ${s.id} — ${s.error}`);
  const notes = manifest.filter((e) => e.notes?.length);
  console.log(`Автозамечания (выход за экран, переполнение, выступающие потомки): ${notes.length} пунктов, подробности — notes в manifest.json`);
  const real = errors.filter((t) => !/\[test\]|Проверка перехвата/.test(t));
  console.log(real.length ? "Ошибки в консоли браузера:\n" + real.slice(0, 15).join("\n") : "Ошибок в консоли браузера нет.");
  console.log(`Время прогона: ${Math.round((Date.now() - t0) / 1000)} с. Снимки: ${path.relative(process.cwd(), OUT)}`);
}

async function main() {
  console.log(`Аудит интерфейса ${VIEW.width}×${VIEW.height} → ${path.relative(process.cwd(), OUT)}${NARROW ? " (узкий проход)" : ""}`);
  cleanOut();
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  // бой с ботом предлагается через 30 с ожидания в очереди (по умолчанию 45 с): окно «Сразиться с ботом?» снимается как настоящее
  await startServer(true, { ARENA_BOT_WAIT_MS: "30000" });
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  try {
    const phases: { key: string; name: string; fn: () => Promise<void>; always?: boolean }[] = [
      { key: "account", name: "вход и создание героя", always: true, fn: async () => { await openClient(browser); await stageAccount(); await enterWorld(); } },
      { key: "entry", name: "первый вход в мир и подготовка героя", always: true, fn: stageEntry },
      { key: "hud", name: "HUD", fn: stageHud },
      { key: "windows", name: "окна без NPC", fn: stageWindows },
      { key: "arena", name: "арена", fn: stageArena },
      { key: "bot", name: "второй игрок", fn: stageBot },
      { key: "npc", name: "NPC", fn: stageNpc },
      { key: "combat", name: "бой и смерть", fn: stageCombat },
      { key: "menus", name: "меню и системные окна", fn: stageMenus },
      { key: "admin", name: "админ-сессия", fn: async () => { await relogAsAdmin(); await stageAdmin(); } },
    ];
    for (const { key, name, fn, always } of phases) {
      if (ONLY.length && !always && !ONLY.includes(key)) continue;
      console.log(`\n== ${name}`);
      try {
        await fn();
      } catch (e) {
        console.log(`  !! фаза «${name}» прервана: ${errText(e)}`);
        try { await page.screenshot({ path: path.join(FAILED, `_phase-${name.replace(/[^\p{L}\p{N}]+/gu, "_")}.png`) }); } catch {}
      }
    }
  } finally {
    flush();
    try { await bot?.leave(); } catch {}
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer();
  }
  summary();
}

main().catch(async (e) => {
  console.error(e);
  flush();
  await stopServer();
  process.exit(1);
});
