/**
 * Интерьеры в игре (задача 144): вход в храм Аурелиона по двери (ЛКМ), зал виден вошедшему, второй игрок у двери снаружи его не видит,
 * выход клавишей взаимодействия — на то же место у двери; зиккурат Мортхейма — вход ПКМ. Подпись двери при наведении и курсор как у NPC.
 * Сервер в этом же процессе, Vite и Chrome; два героя — две вкладки. Снимки для показа: вход, залы днём и ночью, выход.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2857"; $env:VITE_TEST_PORT="5257"; npx tsx tests/interiors-ingame.ts
 * Выход — tools/out/interiors/: 01-sol-entrance.png, 02-sol-day.png, 03-sol-night.png, 04-sol-exit.png, 05-umb-entrance.png, 06-umb-day.png,
 * 07-umb-night.png, report.json. Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { INTERIORS, interiorAt, type Interior } from "../shared/interiors";
import { Bot, dbFile, ensureChar, PORT, sleep } from "./harness";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5257;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/interiors");
const PASS = "secret";

const errors: string[] = [];
const lines: string[] = [];
let bad = 0;
const check = (ok: boolean, msg: string) => { lines.push(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; console.log(lines[lines.length - 1]); };
const run = <R = any>(page: Page, body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), net = window.__net, a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const busy = (port: number) => new Promise<boolean>((res) => { const c = net.createConnection({ port, host: "127.0.0.1" }); c.once("connect", () => { c.destroy(); res(true); }); c.once("error", () => res(false)); });

let W: () => World;
let heroOf: (name: string) => Player;
async function startServer() {
  if (await busy(PORT)) throw new Error(`порт ${PORT} занят: задайте свободный TEST_PORT`);
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
  Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1", VITE_SERVER_URL: `ws://localhost:${PORT}` });
  await import("../server/src/index");
  const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
  W = () => WorldRoom.instance!.world;
  heroOf = (name) => W().findByName(name.toLowerCase())!;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch {} await sleep(150); }
  throw new Error("сервер не ответил");
}

async function newPage(browser: Browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(180000);
  page.setDefaultTimeout(120000);
  await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
  return page;
}
/** Вход героя; страница может перезагрузиться посреди входа (Vite догружает зависимости) — тогда ещё раз. */
async function enter(page: Page, name: string, token: string) {
  for (let k = 0; ; k++) {
    try { return await enterOnce(page, name, token); } catch (e) { if (k >= 2) throw e; console.log(`повтор входа ${name}: ${String((e as Error).message).slice(0, 80)}`); }
  }
}
async function enterOnce(page: Page, name: string, token: string) {
  console.log(`вход: ${name}`);
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v1", "2"); }, token);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 180000, polling: 500 });
  await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 180000, polling: 500 });
  await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 120000, polling: 500 });
  await sleep(1500);
}
/** Время суток на странице: сдвиг Date.now к нужной доле цикла (0.3 — день, 0.8 — ночь); затемнение доходит до цели за ~2 с. */
async function setTime(page: Page, phase: number) {
  await page.evaluate((phase: number, cycle: number) => {
    const w = window as any;
    w.__realNow ??= Date.now.bind(Date);
    const now = w.__realNow(), cur = ((now % cycle) + cycle) % cycle;
    const off = phase * cycle - cur;
    Date.now = () => w.__realNow() + off;
  }, phase, DAY_CYCLE_MS);
}
const shot = async (page: Page, name: string) => { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, name) as `${string}.png` }); };
/** Точка мира на экране (CSS px) и состояние камеры. */
const screenOf = (page: Page, x: number, y: number) => run<{ sx: number; sy: number }>(page, `
  const cam = sc.cameras.main, g = window.__game, r = g.canvas.getBoundingClientRect();
  return { sx: r.left + (a.x - cam.worldView.x) * cam.zoom * r.width / g.canvas.width, sy: r.top + (a.y - cam.worldView.y) * cam.zoom * r.height / g.canvas.height };`, { x, y });
/** Виден ли юнит name в кадре камеры страницы. */
const seesUnit = (page: Page, name: string) => run<boolean>(page, `
  const view = sc.cameras.main.worldView;
  for (const v of sc.units.values()) if (v.u.name === a && v.sprite.visible && view.contains(v.x, v.y)) return true;
  return false;`, name);
const placeHero = (h: Player, x: number, y: number) => { h.unit.x = x; h.unit.y = y; h.moveTo = null; h.input = { mx: 0, my: 0 }; h.nav.reset(); h.combatAt = -1e9; };

async function useDoorByMouse(page: Page, r: Interior, button: "left" | "right", h: Player) {
  const s = await screenOf(page, r.outDoor.x, r.outDoor.y - 14);
  await page.mouse.move(s.sx, s.sy);
  await sleep(500);
  const tip = await page.$eval(".interact-tip", (e) => e.textContent ?? "").catch(() => "");
  const cur = await page.evaluate(() => (window as any).__game.canvas.style.cursor as string);
  check(tip.includes(`Войти: ${r.name}`), `подпись двери при наведении: «${tip}»`);
  check(cur.includes("cursor_talk"), `курсор над дверью как у NPC: ${cur.slice(0, 60)}`);
  return s;
}

/** Сквозь алтарь не пройти: герой идёт от подножия алтаря к стене за ним — ни в одной точке пути он не внутри следа алтаря. */
async function altarSolid(r: Interior, h: Player) {
  const al = r.props.find((p) => p.kind.startsWith("altar"))!;
  const x0 = r.ox + al.x * 32, x1 = x0 + al.w * 32, y0 = r.oy + al.y * 32, y1 = y0 + al.h * 32, mx = (x0 + x1) / 2;
  placeHero(h, mx, y1 + 20);
  await sleep(300);
  h.moveTo = { x: mx, y: y0 + 8 };
  let inside = 0, minY = Infinity;
  for (let i = 0; i < 30; i++) { if (h.x > x0 + 2 && h.x < x1 - 2 && h.y > y0 + 2 && h.y < y1 - 2) inside++; minY = Math.min(minY, h.y); await sleep(100); }
  check(inside === 0, `алтарь непроходим: точек пути внутри следа ${inside}, ближе всего к стене y−низ алтаря = ${Math.round(minY - y1)}`);
  placeHero(h, r.entry.x, r.entry.y);
}

/** Зал по центру экрана на разных окнах: по оси, где зал меньше кадра, центр камеры = центр зала ±4 px; где больше — герой в кадре. */
async function roomCentred(page: Page, r: Interior, h: Player) {
  const cx = r.ox + (r.w * 32) / 2, cy = r.oy + (r.h * 32) / 2;
  for (const [w, hh] of [[1366, 768], [1920, 950], [1920, 1080], [2560, 1440]]) {
    await page.setViewport({ width: w, height: hh, deviceScaleFactor: 1 });
    placeHero(h, r.entry.x, r.entry.y);
    await sleep(2500);
    const c = await run<{ mx: number; my: number; vw: number; vh: number; hx: number; hy: number; inView: boolean }>(page, `const cam = sc.cameras.main, v = cam.worldView, me = sc.units.get(net.id); return { mx: v.centerX, my: v.centerY, vw: v.width, vh: v.height, hx: me.x, hy: me.y, inView: v.contains(me.x, me.y) };`);
    const fitX = r.w * 32 <= c.vw, fitY = r.h * 32 <= c.vh;
    const okX = fitX ? Math.abs(c.mx - cx) <= 4 : c.inView, okY = fitY ? Math.abs(c.my - cy) <= 4 : c.inView;
    // тьма вокруг зала — поровну с обеих сторон (не полоса только справа или снизу)
    const left = r.ox - (c.mx - c.vw / 2), right = c.mx + c.vw / 2 - (r.ox + r.w * 32), up = r.oy - (c.my - c.vh / 2), down = c.my + c.vh / 2 - (r.oy + r.h * 32);
    check((!fitX || Math.abs(left - right) <= 4) && (!fitY || Math.abs(up - down) <= 4) && (fitX || (left <= 0 && right <= 0)) && (fitY || (up <= 0 && down <= 0)), `${w}×${hh}: поля тьмы слева/справа ${Math.round(left)}/${Math.round(right)}, сверху/снизу ${Math.round(up)}/${Math.round(down)}`);
    check(okX && okY, `${w}×${hh}: кадр ${Math.round(c.vw)}×${Math.round(c.vh)}, центр камеры − центр зала = (${Math.round(c.mx - cx)}, ${Math.round(c.my - cy)}) (${fitX ? "по ширине влезает" : "шире кадра"}, ${fitY ? "по высоте влезает" : "выше кадра"}), герой в кадре: ${c.inView}`);
    await page.mouse.move(5, 5);
    await shot(page, `center-${w}x${hh}.png`);
  }
  await page.setViewport({ width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 });
  await sleep(1000);
}

async function scenario(browser: Browser) {
  // снимки «до|после» правок (fix-*.png) сценарий не трогает
  if (fs.existsSync(OUT)) for (const f of fs.readdirSync(OUT)) if (!f.startsWith("fix-")) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const sol = INTERIORS.find((r) => r.city === "aurelion")!, umb = INTERIORS.find((r) => r.city === "morthaim")!;
  const tA = await ensureChar("int_pilgrim", PASS, "Паломник", "warrior");
  const tB = await ensureChar("int_gawker", PASS, "Зевака", "warrior");
  const tC = await ensureChar("int_cultist", PASS, "Культист", "deathknight");
  // одна вкладка (нагрузка на машину): второй игрок — сетевой бот без браузера, видит то же состояние, что клиент
  const pA = await newPage(browser);
  await enter(pA, "Паломник", tA);
  // герой 100 уровня (как у пользователя): полная панель умений и рамки
  await run(pA, `net.send("dbg", { op: "level", v: 100 });`);
  const bot = await Bot.enter(tB, "Зевака");
  /** Видит ли второй игрок вошедшего: его юнит в кадре вокруг второго (экран 1280×800 при масштабе 2 — 320×200 px мира от центра). */
  const botSees = () => { const me = bot.me(), u = [...bot.room.state.players.values()].find((x: any) => x.name === "Паломник") as { x: number; y: number } | undefined; return !!u && Math.abs(u.x - me.x) < 340 && Math.abs(u.y - me.y) < 220; };
  const A = heroOf("Паломник"), B = heroOf("Зевака");
  for (const h of [A, B]) { h.unit.maxHp = h.unit.hp = 999999; }
  placeHero(A, sol.outSpot.x - 20, sol.outSpot.y + 6);
  placeHero(B, sol.outSpot.x + 50, sol.outSpot.y + 8);
  await setTime(pA, 0.3);
  // камера доезжает до героя, надпись зоны уходит (иначе точка двери на экране не та и курсор над интерфейсом)
  await sleep(6000);
  check(botSees() && (await seesUnit(pA, "Зевака")), "до входа игроки видят друг друга");

  // вход ЛКМ по двери
  const s = await useDoorByMouse(pA, sol, "left", A);
  await shot(pA, "01-sol-entrance.png");
  await pA.mouse.click(s.sx, s.sy, { button: "left" });
  for (let i = 0; i < 40 && !interiorAt(A.x, A.y); i++) await sleep(100);
  check(interiorAt(A.x, A.y) === sol, `ЛКМ по двери: герой в зале «${sol.name}» (${Math.round(A.x)}, ${Math.round(A.y)})`);
  await sleep(1400);
  const inA = await run<{ room: string | null; bx: number; bw: number }>(pA, `const b = sc.cameras.main.getBounds(); return { room: sc.room ? sc.room.id : null, bx: b.x, bw: b.width };`);
  check(inA.room === sol.id && inA.bx === sol.ox, `камера вошедшего ограничена залом: ${JSON.stringify(inA)}`);
  check(!(await seesUnit(pA, "Зевака")), "вошедший не видит улицу и второго игрока");
  check(!botSees(), "второй игрок снаружи не видит вошедшего");
  // по залу можно пройтись (клик-шаг ПКМ: ЛКМ ведёт героя только в «Классике»)
  const step = await screenOf(pA, sol.entry.x - 70, sol.entry.y - 60);
  await pA.mouse.click(step.sx, step.sy, { button: "right" });
  await sleep(1500);
  check(!!interiorAt(A.x, A.y) && Math.hypot(A.x - sol.entry.x, A.y - sol.entry.y) > 40, `ход по залу кликом: от входа к (${Math.round(A.x - sol.ox)}, ${Math.round(A.y - sol.oy)}) в зале`);
  placeHero(A, sol.entry.x, sol.entry.y - 120);
  await sleep(800);
  await pA.mouse.move(5, 5);
  await shot(pA, "02-sol-day.png");
  await setTime(pA, 0.8);
  await sleep(3000);
  await shot(pA, "03-sol-night.png");
  await roomCentred(pA, sol, A);
  await altarSolid(sol, A);
  await setTime(pA, 0.3);
  // выход клавишей взаимодействия у двери изнутри
  placeHero(A, sol.entry.x, sol.entry.y);
  await sleep(500);
  for (const key of ["KeyF", "Space", "KeyG"]) {
    if (!interiorAt(A.x, A.y)) break;
    await pA.keyboard.press(key as any);
    for (let i = 0; i < 15 && interiorAt(A.x, A.y); i++) await sleep(100);
  }
  check(!interiorAt(A.x, A.y) && Math.hypot(A.x - sol.outSpot.x, A.y - sol.outSpot.y) < 4, `клавиша у двери изнутри: вышел на то же место у двери (${Math.round(A.x)}, ${Math.round(A.y)})`);
  await sleep(1500);
  check(botSees(), "после выхода второй игрок снова видит первого");
  await bot.leave();
  await shot(pA, "04-sol-exit.png");

  // зиккурат: герой Умбрата у своей столицы, вход ПКМ
  await enter(pA, "Культист", tC);
  const C = heroOf("Культист");
  C.unit.maxHp = C.unit.hp = 999999;
  placeHero(C, umb.outSpot.x + 10, umb.outSpot.y + 6);
  await setTime(pA, 0.3);
  // надпись зоны «Мортхейм» по центру экрана перекрывает холст — ждём, пока уйдёт
  await sleep(6000);
  const s2 = await useDoorByMouse(pA, umb, "right", C);
  await shot(pA, "05-umb-entrance.png");
  await pA.mouse.click(s2.sx, s2.sy, { button: "right" });
  for (let i = 0; i < 40 && !interiorAt(C.x, C.y); i++) await sleep(100);
  check(interiorAt(C.x, C.y) === umb, `ПКМ по двери: герой в зале «${umb.name}»`);
  placeHero(C, umb.entry.x, umb.entry.y - 100);
  await sleep(1600);
  await pA.mouse.move(5, 5);
  await shot(pA, "06-umb-day.png");
  await setTime(pA, 0.8);
  await sleep(3000);
  await shot(pA, "07-umb-night.png");
  // в бою не входят: отказ на сервере (повтор у двери снаружи)
  placeHero(C, umb.outSpot.x, umb.outSpot.y);
  await sleep(400);
  C.combatAt = W().time;
  await run(pA, `net.send("door", { id: a });`, umb.id);
  await sleep(700);
  check(!interiorAt(C.x, C.y), "в бою дверь не пускает");
}

async function main() {
  await startServer();
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const launch = () => puppeteer.launch({
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], protocolTimeout: 120000,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  const browser: Browser = await launch();
  try {
    await scenario(browser);
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|AnimationManager key already exists|Missing animation: [a-z_]+-walk/i.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    lines.push(`EXC ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
    console.log(lines[lines.length - 1]);
    bad++;
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nИнтерьеры работают: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
