/**
 * Рейд в настоящем браузерном клиенте (Chrome через puppeteer-core): окно сбора у Вестника, переход в цитадель, начало боя,
 * фазы I–IV (здоровье босса — отладочной командой), реплики, итоги. Героя ведёт ИИ рейда (dbg auto), чтобы он был в бою.
 * Скриншоты — tools/out/raid-*.png. Запуск: npm run screenshot:raid (порт — TEST_PORT, клиент — 5207).
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";
import { RAID_HERALDS } from "../shared/raid";

const OUT = path.resolve("tools/out");
fs.mkdirSync(OUT, { recursive: true });
const errors: string[] = [];
const VITE_PORT = Number(process.env.VITE_PORT) || 5207;

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
async function openClient(browser: Browser, name: string, cls: string): Promise<Page> {
  await ensureChar(name, "secret", name, cls);
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${name}: ${(e as Error).stack ?? e}`));
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem("mouse:v1", JSON.stringify({})); } catch {} });
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 15000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 15000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
  await sleep(1000);
  return page;
}
const send = (p: Page, type: string, m: Record<string, unknown> = {}) => p.evaluate((t, x) => (window as any).__net.send(t, x), type, m);
const stage = (p: Page) => p.evaluate(() => (window as any).__net.room?.state?.stage as string);
async function waitFor(p: Page, fn: () => boolean, ms = 15000, what = "") {
  try {
    await p.waitForFunction(fn, { timeout: ms });
  } catch {
    await p.screenshot({ path: path.join(OUT, "raid-fail.png") });
    const st = await p.evaluate(() => { const n = (window as any).__net; return JSON.stringify({ kind: n.kind, stage: n.room?.state?.stage, toasts: [...document.querySelectorAll(".toast")].map((t) => t.textContent) }); });
    throw new Error(`не дождались ${what || fn.toString()} — ${st}`);
  }
}
async function clickText(p: Page, selector: string, text: string) {
  await p.waitForFunction((s, t) => [...document.querySelectorAll<HTMLElement>(s)].some((b) => b.offsetParent && b.textContent?.includes(t)), { timeout: 10000 }, selector, text);
  await p.evaluate((s, t) => [...document.querySelectorAll<HTMLElement>(s)].find((b) => b.offsetParent && b.textContent?.includes(t))!.click(), selector, text);
}
/** Выбрать целью босса (boss=true) или чужого героя. */
const pick = (p: Page, boss: boolean) => p.evaluate((b) => { const sc = (window as any).__game.scene.getScene("game"); for (const [id, v] of sc.units) if (id !== (window as any).__net.id && !v.dead && (v.frame >= 96) === b && (b || v.u.kind === 0)) { sc.setTarget(id); return; } }, boss);
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(OUT, `raid-${name}.png`) });
/** Состояние босса у клиента. */
const boss = (p: Page) => p.evaluate(() => {
  const n = (window as any).__net, id = n.room.state.boss, u = n.room.state.mobs.get(id);
  return u ? { hp: u.hp / u.maxHp, phase: u.phase, anim: u.anim } : null;
});

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true, { RAID_MUSTER_MS: "120000", RAID_GATHER_MS: "4000", RAID_PULL_MS: "9000", RAID_HURRY_MS: "3000", RAID_END_MS: "60000" });
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
  try {
    const a = await openClient(browser, "Сокрушитель", "warrior");
    await send(a, "dbg", { op: "level", v: 100 });
    await sleep(500);
    // Вестник в Эмберхолле: подойти и открыть окно сбора
    const h = RAID_HERALDS[0];
    await send(a, "dbg", { op: "tp", x: h.x, y: h.y + 26 });
    // ждём, пока телепорт дойдёт до клиента (на медленной машине 1,2 с бывало мало — F жали вдали от Вестника)
    await a.waitForFunction((x, y) => { const n = (window as any).__net, s = n.room?.state?.players?.get?.(n.id); return s && Math.hypot(s.x - x, s.y - y) < 40; }, { timeout: 10000 }, h.x, h.y + 26)
      .catch(async () => { throw new Error(`телепорт к ${h.id} (${h.x},${h.y + 26}) не дошёл: ${await a.evaluate(() => { const n = (window as any).__net, u = n.room?.state?.players?.get?.(n.id); return JSON.stringify(u && [u.x, u.y]); })}`); });
    await sleep(600);
    await a.keyboard.press("g"); // «Экшен» по умолчанию: G — взаимодействие, F — умение 8
    await sleep(500);
    const opened = await a.evaluate(() => !!document.querySelector(".raid-dialog"));
    console.log(`  вестник ${h.id}: окно по G — ${opened ? "да" : "нет, открываем напрямую"}`);
    if (!opened) await a.evaluate((id) => (window as any).__game.registry.get("hud").raid.open(id), h.id);
    await waitFor(a, () => !!document.querySelector(".raid-dialog"), 5000, "окно сбора");
    await sleep(600);
    await shot(a, "1-herald");
    await clickText(a, ".raid-dialog .btn", "Встать в рейд");
    await waitFor(a, () => [...document.querySelectorAll(".raid-dialog .btn")].some((b) => b.textContent?.includes("Начать сейчас")), 5000, "кнопка «Начать сейчас»");
    await sleep(500);
    await shot(a, "2-muster");
    await clickText(a, ".raid-dialog .btn", "Начать сейчас");
    await waitFor(a, () => (window as any).__net.kind === "raid", 20000, "переход в рейд");
    await sleep(1500);
    await shot(a, "3-antechamber");
    await send(a, "dbg", { op: "auto" });
    await send(a, "dbg", { op: "god" });
    await waitFor(a, () => (window as any).__net.room?.state?.stage === "pull", 30000, "этап pull");
    await sleep(700);
    await shot(a, "4-start-banner");
    await waitFor(a, () => (window as any).__net.room?.state?.stage === "fight", 40000, "бой");
    await sleep(2200);
    await shot(a, "5-awake-yell");
    await sleep(6000);
    await shot(a, "6-phase1");
    // фазы: здоровье босса чуть ниже порога — пауза-каст, реплика, баннер
    for (const [i, v] of [[2, 0.74], [3, 0.49], [4, 0.24]] as const) {
      await send(a, "dbg", { op: "bosshp", v });
      await waitFor(a, () => !!document.querySelector(".raid-banner:not([hidden])"), 6000, `баннер фазы ${i}`);
      await sleep(900);
      await shot(a, `${6 + i - 1}-phase${i}`);
      await sleep(i === 3 ? 9000 : 7000);
      await pick(a, i !== 3);
      await sleep(400);
      await shot(a, `${6 + i - 1}-phase${i}-fight`);
    }
    console.log("  босс:", JSON.stringify(await boss(a)));
    await send(a, "dbg", { op: "bosshp", v: 0.0001 });
    await waitFor(a, () => !!document.querySelector(".raid-res"), 20000, "итоги");
    await sleep(1200);
    await shot(a, "10-victory");
    console.log("  этап:", await stage(a));
    await clickText(a, ".raid-res .btn", "В мир");
    await waitFor(a, () => (window as any).__net.kind === "world", 15000, "возврат в мир");
    await sleep(1500);
    await shot(a, "11-back");
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  if (errors.length) {
    console.log("Ошибки в консоли браузера:\n" + errors.slice(0, 20).join("\n"));
    process.exitCode = 1;
  } else console.log("Ошибок в консоли нет. Скриншоты: tools/out/raid-*.png");
}

main().catch(async (e) => {
  console.error(e);
  if (errors.length) console.log("Ошибки в консоли браузера:\n" + errors.slice(0, 20).join("\n"));
  await stopServer();
  process.exit(1);
});
