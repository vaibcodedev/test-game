/**
 * Ум NPC в игре (docs/plan/next.md раздел 3): снимки для владельца. Сервер в этом же процессе, Vite и Chrome (как tests/ember-ingame.ts).
 * 1) Площадь Эмберхолла днём (горожане у прилавков и фонтана лицом к делу), 2) вечером (терраса таверны, лицом друг к другу),
 * 3) толпа у рынка утром — герой идёт сквозь неё, жители расступаются, 4) моб по дороге домой обходит камень (след линией) без телепорта.
 * Часы распорядка сервера (town.clockShift) и клиента (Date.now) сдвигаются вместе. Лист сравнения — compare.png с подписями.
 *
 * Запуск (строго по одному, под замком tools/out/scenario.lock):
 *   $env:TEST_PORT="2871"; $env:VITE_TEST_PORT="5271"; npx tsx tests/npc-ai-ingame.ts
 * Выход — tools/out/npcai/: square-day.png, square-evening.png, market-crowd.png, mob-rock.png, compare.png, report.json.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import { TILE } from "../shared/constants";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { walkable } from "../shared/map";
import { findPath, segmentWalkable } from "../shared/path";
import { MOBS } from "../shared/mobs";
import { TOWN } from "../shared/town";
import SCH from "../data/schedules.json";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";
import { Mob } from "../server/src/game/Mob";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5271;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/npcai");
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
const shots: { file: string; title: string }[] = [];
const save = (file: string, title: string, p: PNG) => { fs.writeFileSync(path.join(OUT, file), PNG.sync.write(p)); shots.push({ file, title }); };

/** Сдвиг часов распорядка сервера и клиента в фазу (доля внутри фазы). */
async function setPhase(name: string, into: number) {
  const ph = SCH.phases as unknown as [string, number][];
  const frac = ph.find(([n]) => n === name)![1] + into;
  const town = W().town!;
  town.clockShift = frac * DAY_CYCLE_MS - (Date.now() % DAY_CYCLE_MS);
  await page.evaluate((f: number, C: number) => { const r = (window as any).__realNow(); (window as any).__dshift = f * C - (r % C); }, frac, DAY_CYCLE_MS);
  town.resettle();
}

async function scenario() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/\.png$/.test(f)) fs.rmSync(path.join(OUT, f));
  const token = await ensureChar("npcai_view", PASS, "Ората", "warrior");
  const w = W(), town = w.town!;
  const px = (dx: number, dy: number) => ({ x: (TOWN.x + dx) * TILE + 16, y: (TOWN.y + dy) * TILE + 16 });
  await enter("Ората", token, 2);
  const H = heroOf("Ората");
  let at = px(3, 1);
  const hold = () => { if (H.dead) { H.dead = false; H.unit.anim = 0; } H.unit.hp = H.unit.maxHp; };
  const keep = setInterval(hold, 100);
  const place = (p: { x: number; y: number }) => { at = p; H.unit.x = p.x; H.unit.y = p.y; H.moveTo = null; };
  const ember = town.folk.find((f) => !f.guard)!.site;
  const cits = () => town.folk.filter((f) => !f.guard && f.site === ember);
  try {
    // 1) площадь днём: рынок и фонтан
    place(px(1, 4));
    await setPhase("day", 0.1);
    await sleep(6000);
    const facing = (list: ReturnType<typeof cits>) => list.filter((f) => f.goal && !f.walking && !f.chat && Math.hypot(f.goal.x - f.x, f.goal.y - f.y) < 8).length;
    check(facing(cits()) >= 4, `днём горожане стоят у мест распорядка: ${facing(cits())}/${cits().length}`);
    check(cits().some((f) => f.unit.dir !== 0), `и смотрят не только вниз: ${cits().map((f) => f.unit.dir).join(",")}`);
    save("square-day.png", "Площадь Эмберхолла днём: у прилавков и фонтана, лицом к делу", await snap((TOWN.x) * TILE, (TOWN.y - 2.5) * TILE, 26 * TILE, 13 * TILE));

    // 2) вечер: терраса таверны
    place(px(-12, 1));
    await setPhase("evening", 0.04);
    await sleep(6000);
    const tav = cits().filter((f) => f.place === "tavern").length;
    check(tav >= 4, `вечером в таверне: ${tav}/${cits().length}`);
    save("square-evening.png", "Вечер: горожане собрались у таверны, лицом друг к другу", await snap((TOWN.x - 16) * TILE, (TOWN.y - 2) * TILE, 16 * TILE, 9 * TILE));

    // 3) утро: толпа у рынка, герой идёт сквозь неё
    place(px(-12, -5));
    await setPhase("morning", 0.05);
    await sleep(3000);
    H.moveTo = { x: px(12, -5).x, y: px(12, -5).y };
    at = { x: NaN, y: NaN };
    let minGap = Infinity;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      for (const f of cits()) minGap = Math.min(minGap, Math.hypot(f.x - H.unit.x, f.y - H.unit.y));
      if (i === 14) save("market-crowd.png", "Утро, рынок: горожане у прилавков, герой идёт сквозь толпу — расступаются", await snap((TOWN.x - 0.5) * TILE, (TOWN.y - 5) * TILE, 22 * TILE, 8 * TILE));
    }
    check(minGap > 6, `герой не проходит «сквозь» горожан: ближе всего ${minGap.toFixed(1)} px`);

    // 4) моб обходит камень по дороге домой: настоящее препятствие карты рядом с героем
    const def = Object.values(MOBS).find((d) => !d.boss && !d.raid && !d.projectile && d.speed > 0 && d.radius <= 20)!;
    let pair: { a: { x: number; y: number }; b: { x: number; y: number } } | null = null;
    const r = 8;
    for (let ty = TOWN.y + 30; ty < TOWN.y + 120 && !pair; ty += 2) for (let tx = TOWN.x - 60; tx < TOWN.x + 60 && !pair; tx += 2) {
      const a = { x: tx * TILE + 16, y: ty * TILE + 16 };
      if (w.inTown(a.x, a.y) || !walkable(w.map, a.x, a.y, 12)) continue;
      for (const [dx, dy] of [[6, 0], [0, 6], [-6, 0]]) {
        const b = { x: a.x + dx * TILE, y: a.y + dy * TILE };
        if (w.inTown(b.x, b.y) || !walkable(w.map, b.x, b.y, 12) || segmentWalkable(w.map, a.x, a.y, b.x, b.y, r)) continue;
        const path = findPath(w.map, a.x, a.y, b.x, b.y, r);
        if (path && path.length >= 2 && path.length <= 8) { pair = { a, b }; break; }
      }
    }
    if (!pair) throw new Error("не нашёл камня у дороги");
    for (const m of [...w.mobs.values()]) if (!m.faction && Math.hypot(m.x - pair.a.x, m.y - pair.a.y) < 900) w.removeMob(m);
    place({ x: (pair.a.x + pair.b.x) / 2 + 3 * TILE, y: (pair.a.y + pair.b.y) / 2 + 4 * TILE });
    H.stealthUntil = 0;
    const m = w.addMob(new Mob("npcai_rock", def, 1, { ...pair.b }));
    m.unit.x = pair.a.x; m.unit.y = pair.a.y;
    m.state = "return";
    const cx = (pair.a.x + pair.b.x) / 2, cy = (pair.a.y + pair.b.y) / 2;
    await run("sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(a.x, a.y); window.__trail = sc.add.graphics().setDepth(1e6);", { x: cx, y: cy });
    const trail: { x: number; y: number }[] = [];
    let jump = 0;
    for (let i = 0; i < 80 && m.state === "return"; i++) {
      const last = trail[trail.length - 1];
      trail.push({ x: m.x, y: m.y });
      if (last) jump = Math.max(jump, Math.hypot(m.x - last.x, m.y - last.y));
      await run("const g = window.__trail; g.clear(); g.lineStyle(2, 0xffd040, 0.9); g.beginPath(); a.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.strokePath(); g.fillStyle(0x40ff80, 1); g.fillCircle(a[a.length - 1].x, a[a.length - 1].y, 3);", trail);
      await sleep(100);
    }
    const home = Math.hypot(m.x - pair.b.x, m.y - pair.b.y);
    check(home < 10, `моб обошёл камень и дома: ${home.toFixed(1)} px от точки появления`);
    check(jump < 40, `без телепорта: самый большой шаг между замерами ${jump.toFixed(1)} px`);
    save("mob-rock.png", "Моб по дороге домой обходит препятствие (жёлтая линия — его путь), без телепорта", await snap(cx, cy, 12 * TILE, 9 * TILE));
    await run("window.__trail && window.__trail.destroy();");
  } finally {
    clearInterval(keep);
  }
}

/** Лист сравнения: снимки сеткой 2×2 с подписями (рисует холст страницы). */
async function compare() {
  const imgs = shots.map((s) => ({ title: s.title, url: "data:image/png;base64," + fs.readFileSync(path.join(OUT, s.file)).toString("base64") }));
  const url = await page.evaluate(async (list: { title: string; url: string }[]) => {
    const load = (u: string) => new Promise<HTMLImageElement>((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const im = await Promise.all(list.map((l) => load(l.url)));
    const cw = 760, pad = 14, cap = 30;
    const scaled = im.map((i) => ({ i, w: cw, h: Math.round((i.height * cw) / i.width) }));
    const rows: (typeof scaled)[] = [];
    for (let k = 0; k < scaled.length; k += 2) rows.push(scaled.slice(k, k + 2));
    const H = 50 + rows.reduce((s, r) => s + Math.max(...r.map((x) => x.h)) + cap + pad, 0) + pad;
    const c = document.createElement("canvas");
    c.width = pad + 2 * (cw + pad); c.height = H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#16130f"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f0e2c0"; g.font = "bold 22px sans-serif"; g.fillText("Ум NPC и мобов: распорядок, взгляд, разведение толпы, обход без телепорта", pad, 32);
    let y = 50, k = 0;
    for (const r of rows) {
      const rh = Math.max(...r.map((x) => x.h));
      r.forEach((s, j) => {
        const x = pad + j * (cw + pad);
        g.fillStyle = "#d8c8a0"; g.font = "16px sans-serif"; g.fillText(list[k + j].title, x, y + 20);
        g.imageSmoothingEnabled = false;
        g.drawImage(s.i, x, y + cap, s.w, s.h);
      });
      k += r.length;
      y += rh + cap + pad;
    }
    return c.toDataURL("image/png");
  }, imgs);
  fs.writeFileSync(path.join(OUT, "compare.png"), Buffer.from(url.split(",")[1], "base64"));
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
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    await compare();
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
  console.log(bad ? `\nСбоев: ${bad}` : "\nУм NPC в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
