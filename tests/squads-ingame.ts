/**
 * Отряды на Полях в игре (задача 132, шаг 11): отряд Сольгарда выходит из форта строем, отряды обеих фракций сходятся у центра Полей
 * и бьются, выжившие возвращаются, тела лежат. Сервер в этом же процессе, Vite и Chrome. Герой (team ≠ 0 — не враг отрядам) будит отряды.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2858"; $env:VITE_TEST_PORT="5258"; npx tsx tests/squads-ingame.ts
 * Выход — tools/out/squads/: exit.png, clash.png, return.png, report.json. Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import type { Mob } from "../server/src/game/Mob";
import type { Squad } from "../server/src/game/soldiers";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5258;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/squads");
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

async function enter(name: string, token: string, zoom: number) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string, z: number) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v2", String(z)); }, token, zoom);
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

/** Кадр мира w×h px вокруг (cx, cy) из холста. */
async function snap(cx: number, cy: number, w: number, h: number): Promise<PNG> {
  const c = await run<{ url: string; x: number; y: number; z: number }>(`
    const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    cam.stopFollow(); cam.centerOn(a.cx, a.cy);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const k = cv.width / g.scale.width;
    return { url: cv.toDataURL('image/png'), x: (a.cx - cam.worldView.x) * cam.zoom * k, y: (a.cy - cam.worldView.y) * cam.zoom * k, z: cam.zoom * k };`, { cx, cy });
  const src = PNG.sync.read(Buffer.from(c.url.split(",")[1], "base64"));
  const ww = Math.min(Math.round(w * c.z), src.width), hh = Math.min(Math.round(h * c.z), src.height);
  const x0 = Math.max(0, Math.min(src.width - ww, Math.round(c.x - ww / 2))), y0 = Math.max(0, Math.min(src.height - hh, Math.round(c.y - hh / 2)));
  const out = new PNG({ width: ww, height: hh });
  PNG.bitblt(src, out, x0, y0, ww, hh, 0, 0);
  return out;
}
const save = (name: string, p: PNG) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), PNG.sync.write(p)); };

const center = (g: Mob[]) => { const a = g.filter((m) => !m.dead); const l = a.length ? a : g; return { x: l.reduce((v, m) => v + m.x, 0) / l.length, y: l.reduce((v, m) => v + m.y, 0) / l.length }; };
const waitFor = async (ok: () => boolean, ms: number) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await sleep(100); return ok(); };

async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("squad_view", PASS, "Отрядник", "warrior");
  const w = W(), S = w.soldiers!;
  // таймер выходов — вручную; вышедшие по таймеру убираются
  S.squadAt.solgard = S.squadAt.umbrath = 1e15;
  for (const q of [...S.squads]) for (const g of [...q.group]) (S as unknown as { dropMember(m: Mob): void }).dropMember(g);
  const a: Squad = S.spawnSquad("solgard", "center")!, b: Squad = S.spawnSquad("umbrath", "center")!;
  check(!!a && !!b && a.group.length === 4 && b.group.length === 4, "отряды обеих фракций вышли (по 4 бойца)");
  // мобы у дорог отрядов не мешают
  for (const m of [...w.mobs.values()]) if (!m.faction && [...a.route, ...b.route].some((p) => Math.hypot(m.x - p.x, m.y - p.y) < 1200)) w.removeMob(m);
  await enter("Отрядник", token, 2);
  const H = heroOf("Отрядник");
  H.team = 1;
  let at = { x: a.route[0].x + 60, y: a.route[0].y + 120 };
  const keep = setInterval(() => {
    if (H.dead) { H.dead = false; H.unit.anim = 0; }
    H.unit.x = at.x; H.unit.y = at.y; H.moveTo = null; H.unit.hp = H.unit.maxHp;
  }, 50);
  try {
    // 1. выход из форта строем
    await sleep(9000);
    const c0 = center(a.group);
    check(Math.hypot(c0.x - a.route[0].x, c0.y - a.route[0].y) > 64, `отряд Сольгарда идёт от ворот форта (${Math.round(Math.hypot(c0.x - a.route[0].x, c0.y - a.route[0].y))} px)`);
    save("exit.png", await snap(c0.x, c0.y - 16, 300, 200));
    // 2. переносим отряды к последнему отрезку дороги (дорога ~3 мин) и героя к центру
    for (const q of [a, b]) {
      const r0 = q.route[q.route.length - 2], r1 = q.route[q.route.length - 1], p = { x: r0.x + (r1.x - r0.x) * 0.55, y: r0.y + (r1.y - r0.y) * 0.55 };
      for (const g of q.group) { g.unit.x = p.x; g.unit.y = p.y; g.soldier!.idx = q.route.length - 1; g.nav.reset(); }
    }
    const end = a.route[a.route.length - 1];
    at = { x: end.x, y: end.y - 260 };
    const met = await waitFor(() => a.clashed || b.clashed, 120000);
    check(met, `отряды сошлись у центра (между ведущими ${Math.round(Math.hypot(a.group[0].x - b.group[0].x, a.group[0].y - b.group[0].y))} px)`);
    await sleep(3500);
    const cc = center([...a.group, ...b.group]);
    save("clash.png", await snap(cc.x, cc.y - 16, 340, 230));
    // 3. стычка кончилась — выжившие уходят, тела лежат
    const back = await waitFor(() => a.phase === "back" && b.phase === "back" && !a.clashed && !b.clashed, 90000);
    const dead = [...a.group, ...b.group].filter((g) => g.dead).length;
    check(back && dead > 0, `стычка кончилась, павших ${dead}, выжившие возвращаются`);
    await sleep(6000);
    const alive = [...a.group, ...b.group].filter((g) => !g.dead);
    const bodies = [...a.group, ...b.group].filter((g) => g.dead);
    const moving = alive.filter((g) => g.unit.anim === 1).length;
    check(alive.length === 0 || moving > 0, `выжившие идут к форту (${moving} из ${alive.length})`);
    const cr = alive.length ? center(alive) : center(bodies);
    const mid = bodies.length ? { x: (cr.x + center(bodies).x) / 2, y: (cr.y + center(bodies).y) / 2 } : cr;
    save("return.png", await snap(mid.x, mid.y - 16, 380, 250));
    const cl = await run<number>(`return a.ids.filter((id) => sc.units.has(id)).length;`, { ids: bodies.map((g) => g.id) });
    check(cl === bodies.length, `тела на клиенте лежат (${cl} из ${bodies.length})`);
  } finally {
    clearInterval(keep);
  }
}

async function main() {
  await startServer();
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|AnimationManager key already exists/i.test(e));
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
  console.log(bad ? `\nСбоев: ${bad}` : "\nОтряды выходят, сходятся и возвращаются: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
