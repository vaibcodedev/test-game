/**
 * Эффекты цели в плашке цели (как в WoW) в настоящем браузере: сервер в этом же процессе, Vite и Chrome.
 * Герой-зритель выбирает моба со своими (замедление, кровотечение) и чужими (оглушение от бота) дебафами, затем союзника
 * со своим «Обновлением» и его собственными бафами. Снимки плашки цели рядом с рамкой героя на зуме 2.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2887"; $env:VITE_TEST_PORT="5287"; npx tsx tests/target-auras-screens.ts
 * Выход — tools/out/target-auras/: mob-z2.png, ally-z2.png, report.json. Путь к Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { Bot, dbFile, ensureChar, PORT, sleep } from "./harness";
import { MOBS } from "../shared/mobs";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, T, walkable } from "../shared/map";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5287;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/target-auras");
const PASS = "secret";

let page: Page;
const errors: string[] = [];
const lines: string[] = [];
let bad = 0;
const check = (ok: boolean, msg: string) => { lines.push(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; console.log(lines[lines.length - 1]); };
const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
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

/** Ровная трава подальше от стоянок мобов и городов (как в tests/aura-ingame.ts). */
function findSpot() {
  const map = W().map ?? generateMap(MAP_SEED);
  const vt = (x: number, y: number) => map.vtx[y * (map.w + 1) + x];
  const solid = (tx: number, ty: number, rx = 7, ry = 6) => { for (let y = ty - ry; y <= ty + ry; y++) for (let x = tx - rx; x <= tx + rx; x++) if (vt(x, y) !== T.Grass) return false; return true; };
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let ty = 10; ty < map.h - 10; ty += 2) for (let tx = 10; tx < map.w - 10; tx += 2) {
    if (!solid(tx, ty)) continue;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2, d = Math.hypot(x - map.playerSpawn.x, y - map.playerSpawn.y);
    if (d < bd && !W().inTown(x, y) && walkable(map, x, y, 60) && map.spawns.every((sp) => Math.hypot(sp.x - x, sp.y - y) > 480)) { bd = d; best = { x, y }; }
  }
  if (!best) throw new Error("нет ровной травы");
  return best;
}

async function enter(name: string, token: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v1", "2"); }, token);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 50000, polling: 250 });
  await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 50000, polling: 250 });
  await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 40000, polling: 250 });
  await sleep(1500);
}

/** Снимок левого верха: рамка героя и плашка цели. */
async function shot(name: string) {
  const box = await page.$eval(".hud-target", (e) => { const r = (e as HTMLElement).getBoundingClientRect(); return { r: r.right, b: r.bottom }; });
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name) as `${string}.png`, clip: { x: 0, y: 0, width: Math.min(VIEW.width, Math.ceil(box.r) + 16), height: Math.min(VIEW.height, Math.ceil(box.b) + 16) } });
}
const cells = () => run<{ k: string; mine: boolean; tm: string; n: string; w: number }[]>(
  "return [...document.querySelectorAll('.hud-target .auras .cell')].filter((c) => !c.closest('[hidden]')).map((c) => ({ k: c.getAttribute('aria-label'), mine: c.classList.contains('mine'), tm: c.querySelector('.tm').textContent, n: c.querySelector('.qty').textContent, w: c.getBoundingClientRect().width }))");

async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const token = await ensureChar("ta_view", PASS, "Лира", "healer");
  const ally = await Bot.enter(await ensureChar("ta_ally", PASS, "Альдрик", "warrior"), "Альдрик");
  const foeBot = await Bot.enter(await ensureChar("ta_other", PASS, "Кель", "mage"), "Кель");
  await enter("Лира", token);
  const me = heroOf("Лира"), al = heroOf("Альдрик"), other = heroOf("Кель");
  const { x: sx, y: sy } = findSpot();
  const put = (p: Player, x: number, y: number) => { p.unit.x = x; p.unit.y = y; p.moveTo = null; p.unit.maxHp = p.unit.hp = 999999; };
  put(me, sx, sy); put(al, sx + 50, sy); put(other, sx - 50, sy);
  const { Mob } = await import("../server/src/game/Mob");
  const { applySlow, applyStun, applyWeaken } = await import("../server/src/game/effects");
  const { addDot } = await import("../server/src/game/umbrath");
  const mob = W().addMob(new Mob(W().uid("m"), MOBS.goblin, 20, { x: sx, y: sy + 70 }));
  mob.unit.maxHp = mob.unit.hp = 1_000_000;
  (mob as unknown as { aggro?: unknown }).aggro = undefined;
  await sleep(800);

  // моб: мои замедление и кровотечение (3 стака), чужие оглушение и ослабление
  const tick = () => { mob.unit.hp = mob.unit.maxHp; mob.stunUntil = Math.max(mob.stunUntil, W().time + 25_000); };
  check(applySlow(W(), me, mob, 30, 30_000), "замедление легло");
  for (let i = 0; i < 3; i++) addDot(W(), me, mob, "bleed", 1, 30, "blood", 3);
  applyStun(W(), other, mob, 25_000);
  applyWeaken(W(), other, mob, 15, 40_000);
  const keep = setInterval(tick, 200);
  await run("sc.setTarget(a)", mob.id);
  await page.waitForFunction("document.querySelectorAll('.hud-target .auras .cell').length >= 4 && !document.querySelector('.hud-target .auras').hidden", { timeout: 8000, polling: 100 }).catch(() => {});
  await sleep(600);
  const cm = await cells();
  check(cm.length === 4, `моб: 4 значка в плашке цели (${cm.map((c) => `${c.k}${c.mine ? "*" : ""} ${c.tm}${c.n ? " ×" + c.n : ""}`).join(", ")})`);
  check(cm.filter((c) => c.mine).length === 2 && cm.slice(0, 2).every((c) => c.mine), "мои дебафы — первыми и с пометкой mine");
  check(cm.every((c) => c.tm !== ""), "у всех — время до конца");
  check(cm.some((c) => c.n === "3"), "стаки кровотечения");
  const wm = cm.find((c) => c.mine)?.w ?? 0, wo = cm.find((c) => !c.mine)?.w ?? 0;
  check(wm > wo, `мои значки крупнее (${wm} > ${wo} px)`);
  await shot("mob-z2.png");

  // снятие: замедление сняли — значок пропал
  mob.slowUntil = 0;
  await sleep(700);
  check(!(await cells()).some((c) => c.k === "Замедление"), "замедление снято — значка нет");
  clearInterval(keep);

  // союзник: моё «Обновление», его ускорение и щит
  al.renewUntil = W().time + 40_000; al.renewAmt = 50; al.renewBy = me;
  al.hasteUntil = W().time + 20_000; al.hastePct = 25;
  al.blockUntil = W().time + 9_000; al.blockPct = 40;
  await run("sc.setTarget(a)", al.id);
  await page.waitForFunction("document.querySelectorAll('.hud-target .auras .cell').length >= 3", { timeout: 8000, polling: 100 }).catch(() => {});
  await sleep(600);
  const ca = await cells();
  check(ca.length === 3 && ca[0].mine && ca.filter((c) => c.mine).length === 1, `союзник: 3 бафа, моё «Обновление» первым (${ca.map((c) => `${c.k}${c.mine ? "*" : ""} ${c.tm}`).join(", ")})`);
  await shot("ally-z2.png");
  await run("sc.setTarget(null)");
  await sleep(500);
  await ally.leave().catch(() => {});
  await foeBot.leave().catch(() => {});
}

main().catch(async (e) => { console.error(e); process.exit(1); });
async function main() {
  await startServer();
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext/i.test(e));
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
  console.log(bad ? `\nСбоев: ${bad}` : "\nЭффекты цели: все проверки пройдены");
  process.exit(bad ? 1 : 0);
}
