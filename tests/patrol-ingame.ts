/**
 * Патруль фракции в игре (жалоба пользователя 2026-10-24): бойцы идут строем (ведущий впереди, ближник сбоку, дальники сзади), не в одной клетке,
 * и ход плавный — без рывков раз в SYNC_MS (сервер пишет позицию бойцов вне боя раз в 200 мс, клиент доводит ровным ходом: UnitView.update).
 * Сервер в этом же процессе, Vite и Chrome. Герой Сольгарда (свой для патруля) стоит у дороги, чтобы патруль шёл (walkNear).
 * Проверяется: на ходу и на остановке у конца дороги бойцы не ближе MIN_GAP px друг к другу; ход на клиенте ровный (разброс скорости отрисовки
 * по кадрам — CV — мал); ошибок консоли нет. Снимки — кадры хода и лист кадров.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2853"; $env:VITE_TEST_PORT="5253"; npx tsx tests/patrol-ingame.ts
 * Выход — tools/out/patrol-fix/: walk-NN.png, sheet.png, report.json. Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import type { Mob } from "../server/src/game/Mob";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";
import { isLeaderPower } from "../server/src/game/soldiers";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5253;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/patrol-fix");
const PASS = "secret";
/** Наименьший допустимый зазор между бойцами, px: тела (радиус 11) почти не перекрываются даже на развороте строя у конца дороги. */
const MIN_GAP = 16;

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

/** Наименьшее расстояние между живыми бойцами отряда (px, сервер). */
const minGap = (g: Mob[]) => {
  let best = Infinity;
  const a = g.filter((m) => !m.dead);
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) best = Math.min(best, Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y));
  return best;
};

async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("patrol_view", PASS, "Патрон", "warrior");
  const w = W();
  // патруль Сольгарда на дороге: самый длинный участок
  const leads = w.soldiers!.list.filter((m) => m.faction === "solgard" && m.soldier!.role === "patrol");
  const groups = [...new Set(leads.map((m) => m.soldier!.group))];
  const group = groups.sort((a, b) => b[0].soldier!.route.length - a[0].soldier!.route.length)[0];
  const route = group[0].soldier!.route;
  check(group.length >= 3, `отряд патруля: ${group.length} бойцов, маршрут ${route.length} точек`);
  // мобы вокруг маршрута не мешают
  for (const m of [...w.mobs.values()]) if (!m.faction && route.some((p) => Math.hypot(m.x - p.x, m.y - p.y) < 1400)) w.removeMob(m);
  await enter("Патрон", token, 2);
  const H = heroOf("Патрон");
  // герой рядом с отрядом (в walkNear), чуть в стороне от дороги
  let at = { x: group[0].x + 90, y: group[0].y - 110 };
  const keep = setInterval(() => {
    const lead = group.find((m) => !m.dead)!;
    if (Math.hypot(at.x - lead.x, at.y - lead.y) > 400) at = { x: lead.x + 90, y: lead.y - 110 };
    if (H.dead) { H.dead = false; H.unit.anim = 0; }
    H.unit.x = at.x; H.unit.y = at.y; H.moveTo = null; H.unit.hp = H.unit.maxHp;
  }, 50);
  try {
    // строй собирается
    await sleep(6000);
    // зазор строя на сервере каждые 50 мс: наименьший и обстановка в тот миг
    const lead = () => group.find((m) => (m.soldier!.power === "champion" || isLeaderPower(m.soldier!.power)) && !m.dead) ?? group.find((m) => !m.soldier!.ranged && !m.dead)!;
    let worst = { g: Infinity, why: "" };
    const probe = setInterval(() => {
      const a = group.filter((m) => !m.dead);
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
        const g = Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y);
        if (g < worst.g) {
          const L = lead(), ls = L.soldier!;
          const tag = (m: Mob) => (m.soldier!.ranged ? "дальник" : "ближник") + (m === L ? "-ведущий" : "");
          worst = { g, why: `${tag(a[i])} и ${tag(a[j])}, ведущий ${ls.waitUntil > w.time ? "ждёт" : "идёт"}, idx ${ls.idx}, состояния ${a.map((m) => m.state).join("/")}` };
        }
      }
    }, 50);
    const gaps: number[] = [];
    let stopGap = Infinity, stops = 0;
    // плавность на клиенте: скорость отрисовки бойцов по кадрам (px/с) за 3 с хода
    const ids = group.map((m) => m.id);
    const smooth = await run<{ cv: number[]; n: number[] }>(`
      const ids = a.ids, tr = new Map(ids.map((id) => [id, []]));
      const t0 = performance.now();
      // замер после каждого кадра сцены (postupdate): время кадра — шаг игрового цикла, а не rAF (иначе разброс — от расхождения rAF и цикла Phaser)
      let tl = 0;
      await new Promise((done) => { const tick = () => { tl += sc.game.loop.delta; for (const id of ids) { const v = sc.units.get(id); if (v) tr.get(id).push([tl, v.x, v.y]); } if (performance.now() - t0 >= 3000) { sc.events.off('postupdate', tick); done(); } }; sc.events.on('postupdate', tick); });
      const cv = [], n = [];
      for (const id of ids) {
        const s = tr.get(id), sp = [];
        for (let i = 1; i < s.length; i++) { const dt = (s[i][0] - s[i - 1][0]) / 1000; if (dt <= 0) continue; const v = Math.hypot(s[i][1] - s[i - 1][1], s[i][2] - s[i - 1][2]) / dt; if (v > 8) sp.push(v); }
        const mean = sp.reduce((x, y) => x + y, 0) / (sp.length || 1);
        const sd = Math.sqrt(sp.reduce((x, y) => x + (y - mean) ** 2, 0) / (sp.length || 1));
        cv.push(+(sd / (mean || 1)).toFixed(3)); n.push(sp.length);
      }
      return { cv, n };`, { ids });
    // кадров с ходом — не меньше 20 при обычных 7+ к/с; в Chrome без окна под нагрузкой 3–5 к/с хватает 10 (2026-10-31)
    const moving = smooth.cv.filter((_, i) => smooth.n[i] >= 10);
    check(moving.length >= 2, `на клиенте идут ${moving.length} бойцов (кадров с ходом: ${smooth.n.join(", ")})`);
    check(moving.every((c) => c < 0.35), `ход ровный: разброс скорости отрисовки по кадрам (CV) ${smooth.cv.join(", ")} < 0.35`);
    // кадры хода и расстояния в строю
    const frames: PNG[] = [];
    // кадры — на ходу: ждём, пока ведущий отдохнёт у конца дороги
    for (let i = 0; i < 100 && (lead().soldier!.waitUntil > w.time || lead().unit.anim !== 1); i++) await sleep(100);
    for (let i = 0; i < 8; i++) {
      gaps.push(minGap(group));
      // камера идёт за отрядом: центр — середина строя
      const al = group.filter((m) => !m.dead), mx = al.reduce((v, m) => v + m.x, 0) / al.length, my = al.reduce((v, m) => v + m.y, 0) / al.length;
      const f = await snap(mx, my - 16, 220, 160);
      frames.push(f);
      save(`walk-${String(i).padStart(2, "0")}.png`, f);
      await sleep(120);
    }
    // остановка у конца дороги: ждём передышку ведущего
    for (let i = 0; i < 400 && stops < 6; i++) {
      const L = lead();
      if (L.soldier!.waitUntil > w.time && L.unit.anim !== 1) {
        await sleep(600);
        stopGap = Math.min(stopGap, minGap(group));
        stops++;
        if (stops === 1) {
          const f = await snap(L.x, L.y - 16, 260, 200);
          save("stop.png", f);
        }
      }
      gaps.push(minGap(group));
      await sleep(100);
    }
    clearInterval(probe);
    const g = Math.min(worst.g, ...gaps);
    check(g >= MIN_GAP, `на ходу бойцы не в одной клетке: наименьший зазор ${g.toFixed(1)} px ≥ ${MIN_GAP} (${worst.why})`);
    check(stops > 0 && stopGap >= MIN_GAP, `на остановке у конца дороги строй не сходится в точку: зазор ${stopGap.toFixed(1)} px (замеров ${stops})`);
    // лист кадров 4×2
    const fw = frames[0].width, fh = frames[0].height, sheet = new PNG({ width: fw * 4, height: fh * 2 });
    frames.forEach((f, i) => PNG.bitblt(f, sheet, 0, 0, fw, fh, (i % 4) * fw, Math.floor(i / 4) * fh));
    save("sheet.png", sheet);
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
  console.log(bad ? `\nСбоев: ${bad}` : "\nПатруль идёт строем и плавно: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
