/**
 * Стража Эмберхолла — Пепельнорождённые — и штандарты «Жаровня» в игре (задача 132, шаг 8): сервер в этом же процессе, Vite и Chrome.
 * 1) Строй у северной дороги за стеной: герой для масштаба, 4 набора стражи (data/ember-guard.json figs) и знаменосец.
 * 2) Северные ворота: башни со штандартами ember-std и часовые у ворот (первый из пары — знаменосец).
 * Снимки на зуме 2 и 3, днём и ночью. Проверяется: стража — тело nude_ashborn_<класс> со слоями и геральдикой ember, у знаменосца — лист
 * знамени, штандарты на башнях анимированы, ночью светящееся — поверх затемнения (слой glow), ошибок консоли нет.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2869"; $env:VITE_TEST_PORT="5269"; npx tsx tests/ember-ingame.ts
 * Выход — tools/out/ember-ingame/: guard-z<зум>-<day|night>.png, gate-z<зум>-<day|night>.png, report.json. Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import { TILE } from "../shared/constants";
import { Dir } from "../shared/protocol";
import { EMBER_SETS, npcGearStrings } from "../shared/npcGear";
import { TOWN, WALL } from "../shared/town";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5269;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/ember-ingame");
const PASS = "secret";
const DX = 72;

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
  await page.evaluate((t: string, z: number) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v1", String(z)); }, token, zoom);
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

async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("ember_view", PASS, "Эйра", "warrior");
  const w = W(), town = w.town!;
  // строй — на безопасной полосе к северу от стены, восточнее дороги; ворота — северные
  const row = { x: (TOWN.x + 4) * TILE, y: (TOWN.y - WALL.y - 5) * TILE + 16 };
  const gate = { x: (TOWN.x + 0.5) * TILE, y: (TOWN.y - WALL.y + 1) * TILE - 60 };
  for (const m of [...w.mobs.values()]) if (!m.faction && Math.hypot(m.x - row.x, m.y - row.y) < 1200) w.removeMob(m);
  // патрульные Эмберхолла (не часовые у ворот) встают в строй: 4 набора по очереди и знаменосец
  const patrol = town.folk.filter((f) => f.guard && !f.post && f.site === town.folk[0].site);
  if (patrol.length < 5) throw new Error(`патрульных Эмберхолла мало: ${patrol.length}`);
  const figs = [0, 1, 2, 3, 0].map((k, i) => {
    const f = patrol[i], s = EMBER_SETS[k], g = npcGearStrings(s, i === 4), u = f.unit;
    u.sprite = s.cls; u.gear = g.gear; u.weapon = g.weapon; u.herald = g.herald; u.name = i === 4 ? "Знаменосец" : s.title;
    const x = row.x + (i + 1) * DX, y = row.y;
    f.post = { x, y, dir: Dir.Down }; f.route = []; f.foe = null; f.x = x; f.y = y; u.x = x; u.y = y; u.dir = Dir.Down; f.dir = Dir.Down;
    return f;
  });
  let at = row;
  let H: Player | null = null;
  const hold = () => {
    if (H) { if (H.dead) { H.dead = false; H.unit.anim = 0; } H.unit.x = at.x; H.unit.y = at.y; H.moveTo = null; H.unit.hp = H.unit.maxHp; H.unit.dir = Dir.Down; }
    for (const f of figs) { f.x = f.post!.x; f.y = f.post!.y; f.dir = Dir.Down; f.foe = null; }
  };
  const keep = setInterval(hold, 50);
  const heroGear = "1:0:::plate_helm:plate_helm_18|1:0:::plate_armor:plate_armor_18|1:0:::plate_boots:plate_boots_18||1:0:::cloak_str:cloak_str_24";
  try {
    for (const zoom of [2, 3]) {
      await enter("Эйра", token, zoom);
      H = heroOf("Эйра");
      H.unit.gear = heroGear; H.unit.weapon = "greatsword:1:0::greatsword_24";
      for (const [tod, frac] of [["day", 0.3], ["night", 0.82]] as const) {
        await page.evaluate((f: number) => { const C = 20 * 60 * 1000, r = (window as any).__realNow(); (window as any).__dshift = f * C - (r % C); }, frac);
        // строй
        at = row; hold();
        await run("sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(a.x, a.y);", { x: row.x + 3 * DX, y: row.y - 30 });
        await sleep(3500);
        if (zoom === 2) {
          const st = await run<{ n: number; ash: number; layered: number; herald: number; bearer: number; glow: number }>(`
            let n = 0, ash = 0, layered = 0, herald = 0, bearer = 0, glow = 0;
            for (const v of sc.units.values()) { if (v.u.kind !== 4 || !v.u.gear) continue; n++; if (v.sprite.texture.key.startsWith('u_nude_ashborn_')) ash++; if (v.layers) layered++; if (v.herald && v.herald.H.ash) herald++; if (v.bearer && v.bearer.visible) bearer++; if (v.layers && v.layers.glow && v.layers.glow.visible) glow++; }
            return { n, ash, layered, herald, bearer, glow };`);
          check(st.n >= 5 && st.ash === st.n && st.layered === st.n, `стража Эмберхолла — тело nude_ashborn_<класс> со слоями: ${st.ash}/${st.n}, слои ${st.layered}`);
          check(st.herald === st.n, `геральдика ember (Пепельнорождённые) у всей стражи рядом: ${st.herald}/${st.n}`);
          check(st.bearer >= 1, `знаменосец со знаменем «Жаровня»: ${st.bearer}`);
          check(tod === "day" ? st.glow === 0 : st.glow === st.n, `${tod === "day" ? "днём слоя свечения нет" : "ночью светящееся — поверх затемнения"}: ${st.glow}/${st.n}`);
        }
        save(`guard-z${zoom}-${tod}.png`, await snap(row.x + 3 * DX, row.y - 30, 6 * DX + 30, 112));
        // ворота со штандартами
        at = { x: gate.x + 60, y: (TOWN.y - WALL.y - 3) * TILE }; hold();
        await run("sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(a.x, a.y);", gate);
        await sleep(2500);
        if (zoom === 2 && tod === "day") {
          const st = await run<{ n: number; frames: number }>(`
            const list = sc.children.list.filter((o) => o.texture && o.texture.key === 'vfx_ember-std');
            const f0 = list.map((o) => o.frame.name).join();
            await new Promise((r) => setTimeout(r, 400));
            return { n: list.length, frames: list.filter((o, i) => String(o.frame.name) !== f0.split(',')[i]).length };`);
          check(st.n >= 2, `штандарты «Жаровня» на башнях у ворот: ${st.n}`);
          check(st.frames >= 1, `штандарты колышутся (кадры листа сменились): ${st.frames}/${st.n}`);
        }
        save(`gate-z${zoom}-${tod}.png`, await snap(gate.x, gate.y + 20, 9 * TILE, 190));
      }
    }
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
    await page.evaluateOnNewDocument(() => {
      (window as any).__name = (t: unknown) => t;
      const real = Date.now.bind(Date);
      (window as any).__realNow = real; (window as any).__dshift = 0;
      Date.now = () => real() + (window as any).__dshift;
    });
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
  console.log(bad ? `\nСбоев: ${bad}` : "\nСтража и знамёна Эмберхолла в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
