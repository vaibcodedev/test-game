/**
 * Арена в игре: зелье на арене не перезагружает игру; запрещённые слоты заблокированы (замок, «Недоступно на арене»);
 * вступление боя (виньетка, «3 · 2 · 1», «В бой!»). Снимки → tools/out/arena-fix/.
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2851 VITE_TEST_PORT=5251 npx tsx tests/arena-fix-ingame.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5251;
const OUT = path.resolve("tools/out/arena-fix");

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
const send = (page: Page, t: string, m: object = {}) => page.evaluate((t, m) => (window as any).__net.send(t, m), t, m);
const phase = (page: Page) => page.evaluate(() => { const n = (window as any).__net; return n.kind === "arena" ? String(n.room?.state?.phase ?? "") : ""; });
const shot = (page: Page, f: string) => page.screenshot({ path: path.join(OUT, f) });

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1600,900", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"], defaultViewport: { width: 1600, height: 900 } });
  const errors: string[] = [];
  let ok = 0;
  let pg: Page | null = null;
  const check = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) {
      const st = pg ? await pg.evaluate(() => ({ ph: (window as any).__net.room?.state?.phase, cd: (window as any).__net.room?.state?.countdown, num: document.querySelector(".arena-intro .ai-num")?.textContent, kind: (window as any).__net.kind })).catch(() => null) : null;
      console.error(`  ✗ ${name}`, JSON.stringify(st), "ошибки страницы:", errors.join(" | "));
      throw e;
    }
    ok++; console.log(`  ✓ ${name}`);
  };
  try {
    await startServer(true, { ARENA_BOT_WAIT_MS: "0", ARENA_MATCH_MS: "60000" });
    const hero = "Гладиус";
    await ensureChar(hero, "secret", hero, "warrior");
    const page = await browser.newPage();
    pg = page;
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
    await enter(page, hero);
    await send(page, "dbg", { op: "level", v: 20 });
    for (const base of ["hp_potion", "mp_potion"]) await send(page, "dbg", { op: "item", base });
    await sleep(500);

    // очередь → бой с ботом предлагается сразу → принять → комната арены
    await send(page, "arena:queue", { mode: "1v1" });
    await page.waitForSelector(".arena-modal:not([hidden])", { timeout: 10000 });
    await send(page, "arena:accept");
    await page.waitForFunction(() => (window as any).__net.kind === "arena" && !!(window as any).__net.self && (window as any).__net.room?.state?.phase, { timeout: 30000 });
    // счётчик показов экрана загрузки и id комнаты: после зелья оба не должны меняться
    const roomId = await page.evaluate(() => {
      (window as any).__ld = 0;
      setInterval(() => { const l = document.querySelector<HTMLElement>(".loading"); if (l && !l.hidden && getComputedStyle(l).display !== "none") (window as any).__ld++; }, 50);
      return (window as any).__net.room.roomId as string;
    });

    await check("вступление: виньетка и баннер на отсчёте, «3 · 2 · 1», «В бой!»", async () => {
      await page.waitForFunction(() => (window as any).__net.room.state.phase === "countdown", { timeout: 20000 });
      await sleep(600);
      // проверка до снимка: снимок в безголовой вкладке идёт секунды, к его концу отсчёт может кончиться
      must(await page.$eval(".arena-intro", (e) => !(e as HTMLElement).hidden && !!e.querySelector(".ai-vs .ai-p")), "нет баннера соперников");
      await shot(page, "intro-1-banner.png");
      // безголовая вкладка (swiftshader) снимает кадр секундами — живой отсчёт проскакивает между снимками.
      // Поэтому после старта боя те же моменты повторяются в этом же матче вызовом того же кода (ui/arena.ts intro, game/arenaIntro.ts burst),
      // анимации ставятся на паузу на нужной фазе, снимок, затем всё возвращается
      await page.waitForFunction(() => (window as any).__net.room.state.phase === "fight", { timeout: 30000 });
      await sleep(2000);
      const stage = (what: "count" | "go") => page.evaluate((what) => {
        const sc = (window as any).__game.scene.getScene("game"), ui = sc.hud.arena;
        clearTimeout(ui.introHide);
        if (what === "count") { ui.lastPhase = "fight"; ui.introN = ""; ui.intro({ phase: "countdown", countdown: 2 }); }
        else { ui.lastPhase = "countdown"; ui.intro({ phase: "fight", countdown: 0 }); ui.lastPhase = "fight"; clearTimeout(ui.introHide); sc.arenaIntro.burst(); }
        // заморозить на выразительном кадре: время анимаций ставится явно (вкладка рисует редко — по таймеру они бы ещё не начались)
        const at = what === "count" ? 500 : 320;
        for (const a of document.getAnimations()) { a.pause(); a.currentTime = at; }
        if (what === "go") {
          const ring = sc.tweens.getTweens().at(-1);
          ring?.seek(260, 16.6, true);
          ring?.pause();
        }
      }, what);
      const unfreeze = () => page.evaluate(() => {
        for (const a of document.getAnimations()) a.play();
        for (const t of (window as any).__game.scene.getScene("game").tweens.getTweens()) t.resume();
      });
      await stage("count");
      await sleep(1300);
      await shot(page, "intro-2-count.png");
      must(await page.$eval(".arena-intro .ai-num", (e) => e.textContent === "2"), "отсчёт не показан");
      await unfreeze();
      await stage("go");
      await sleep(900);
      await shot(page, "intro-3-fight.png");
      must(await page.$eval(".arena-intro", (e) => e.classList.contains("go")), "нет «В бой!»");
      await unfreeze();
      await page.evaluate(() => { const ui = (window as any).__game.scene.getScene("game").hud.arena; ui.countdown.hidden = true; ui.countdown.classList.remove("go"); ui.introN = ""; });
    });

    await check("запрещённые слоты заблокированы: зелья серые с замком, подсказка «Недоступно на арене»", async () => {
      await sleep(1600);
      const st = await page.evaluate(() => {
        const slot = (i: number) => document.querySelector(`.hb-slot[data-bar="0"][data-i="${i}"]`)!;
        return {
          hp: slot(9).classList.contains("arenalock"), mp: slot(10).classList.contains("arenalock"),
          skill: slot(0).classList.contains("arenalock"),
          mount: !!document.querySelector(".hb-extras .slot.arenalock"),
        };
      });
      must(st.hp && st.mp, "зелья не заблокированы: " + JSON.stringify(st));
      must(!st.skill, "умение заблокировано");
      must(st.mount, "маунт/питомец не заблокированы");
      const box = await (await page.$('.hb-slot[data-bar="0"][data-i="9"]'))!.boundingBox();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await sleep(600);
      const tip = await page.evaluate(() => document.body.innerText.includes("Недоступно на арене"));
      must(tip, "нет подсказки «Недоступно на арене»");
      await shot(page, "locked-slots.png");
    });

    await check("зелье на арене не перезагружает игру (клавиша, клик, прямые сообщения серверу)", async () => {
      await page.evaluate(() => { (window as any).__ld = 0; }); // экран загрузки при входе на арену уже ушёл — считаем только после нажатий
      await page.mouse.move(800, 300);
      await sleep(400);
      await page.evaluate(() => (window as any).__game.scene.getScene("game").pressSlot(0, 9));
      await page.click('.hb-slot[data-bar="0"][data-i="10"]');
      // клиент в обход замка: сервер отвечает тостом, а не отключением (раньше — 4002 и экран загрузки)
      for (const [t, m] of [["use:base", { base: "hp_potion" }], ["use", { index: 0 }], ["pet:toggle", {}], ["mount:toggle", {}], ["equip", { index: 0 }], ["no:such:msg", {}]] as const) await send(page, t, m);
      await sleep(2500);
      const st = await page.evaluate(() => ({ kind: (window as any).__net.kind, room: (window as any).__net.room?.roomId, online: (window as any).__net.online, ld: (window as any).__ld }));
      must(st.kind === "arena" && st.room === roomId && st.online, "соединение с ареной сменилось: " + JSON.stringify(st));
      must(st.ld === 0, "показан экран загрузки: " + st.ld);
      must(await page.evaluate(() => document.body.innerText.includes("Недоступно на арене")), "нет тоста «Недоступно на арене»");
      must(["fight", "end"].includes(await phase(page)), "бой прервался");
      await shot(page, "potion-pressed.png");
    });
    must(!errors.length, "ошибки страницы: " + errors.join("; "));
    console.log(`arena-fix-ingame: ${ok}/3`);
  } finally {
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer();
  }
}

main().then(() => process.exit(0), (e) => { console.error("FAIL", e); process.exit(1); });
