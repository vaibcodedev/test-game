/**
 * Полы помещений в движке «сейчас | новое» (флаг window.__floorsV2, client/src/game/floorsV2.ts): храм Аурелиона, зиккурат Мортхейма,
 * три зала данжа «Пепельные чертоги» (собор, переход, пепельный склеп) и зал рейда; день и ночь, зум 2 и 3.
 * Свой сервер (TEST_PORT=2893) и Vite 5293, headless. Запуск под tools/out/scenario.lock:
 *   $env:TEST_PORT="2893"; npx tsx tools/floors-ingame.ts → tools/out/floors/ingame.png
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, sleep, startServer, stopServer, PORT } from "../tests/harness";
import { DUNGEON_ROOMS } from "../shared/dungeon";
import { DUNGEON_DOOR } from "../shared/map";
import { INTERIORS } from "../shared/interiors";
import { RAID, RAID_HERALDS } from "../shared/raid";
import { DAY_CYCLE_MS } from "../shared/daynight";



const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5293, OUT = path.resolve("tools/out/floors");
const CW = 560, CH = 360;
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
type Shot = { spot: string; zoom: number; night: boolean; v2: boolean; buf: Buffer | null };
const shots: Shot[] = [];
const consoleErrors: string[] = [];
/** Режим по частям: PASS=now|new — один проход (свой сервер на проход: рейд в одном сервере дважды не собрать), снимки в SHOTS;
 *  MONTAGE=1 — монтаж из файлов SHOTS в OUTNAME. */
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : "";
const NAMES: Record<string, string> = { sol_church: "Храм Солнца", umb_ziggurat: "Зиккурат Тьмы", dg_cathedral: "Данж: собор", dg_transition: "Данж: переход", dg_ashen: "Данж: пепельный склеп", raid: "Рейд: Цитадель Хаоса (до боя)" };
const log = (s: string) => console.log(s);

/** Вход героя по токену (как tests/interiors-ingame.ts); страница может перезагрузиться посреди входа (Vite догружает зависимости) — тогда ещё раз. */
async function login(page: Page, name: string) {
  const token = await ensureChar(`fl${Array.from(name).map((c) => c.charCodeAt(0).toString(36)).join("")}`.slice(0, 16), "secret", name, "warrior");
  for (let k = 0; ; k++) {
    try {
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); }, token);
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 30000 });
      await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      await page.click('.cs-list [data-a="play"]');
      await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 120000, polling: 500 });
      await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 120000, polling: 500 });
      await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 60000, polling: 500 });
      await sleep(2000);
      return;
    } catch (e) { if (k >= 2) throw e; log(`повтор входа ${name}: ${String((e as Error).message).slice(0, 80)}`); }
  }
}
const dbg = (page: Page, m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
const camLock = (page: Page, wx: number, wy: number, z: number) => page.evaluate(`(() => { const s = window.__game.scene.getScene("game"), c = s.cameras.main; c.stopFollow(); c.setZoom(${z}); window.__lock = [${wx}, ${wy}]; if (window.__lockFn && window.__lockScene) window.__lockScene.events.off("postupdate", window.__lockFn); window.__lockScene = s; window.__lockFn = () => { try { if (window.__lock && s.cameras && s.cameras.main) { s.cameras.main.stopFollow(); s.cameras.main.setZoom(${z}); s.cameras.main.centerOn(window.__lock[0], window.__lock[1]); } } catch (e) {} }; s.events.on("postupdate", window.__lockFn); })()`);
const setTime = (page: Page, phase: number) => page.evaluate((phase: number, cycle: number) => {
  const w = window as any; w.__realNow ??= Date.now.bind(Date);
  const now = w.__realNow(), cur = ((now % cycle) + cycle) % cycle, off = phase * cycle - cur;
  Date.now = () => w.__realNow() + off;
}, phase, DAY_CYCLE_MS);
async function clipShot(page: Page) {
  const r = (await page.evaluate(`(() => { const b = document.querySelector("canvas").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`)) as { x: number; y: number; w: number; h: number };
  return (await page.screenshot({ clip: { x: Math.round(r.x + r.w / 2 - CW / 2), y: Math.round(r.y + r.h / 2 - CH / 2), width: CW, height: CH } })) as Buffer;
}
/** Снимки точки: зум 2 и 3, день и ночь. */
async function spot(page: Page, id: string, name: string, x: number, y: number, v2: boolean, fast = false) {
  for (const zoom of [2, 3]) for (const night of [false, true]) {
    await setTime(page, night ? 0.8 : 0.3);
    await camLock(page, x, y, zoom);
    await sleep(fast ? 900 : 2200);
    await page.waitForFunction("window.__net && window.__net.online", { timeout: 60000, polling: 500 }).catch(() => log("связь не восстановилась"));
    const buf = await clipShot(page);
    shots.push({ spot: name, zoom, night, v2, buf });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, `${v2 ? 1 : 0}_${id}_${zoom}_${night ? 1 : 0}.png`), buf); }
    if (!v2 && zoom === 2 && !night) { fs.mkdirSync(path.join(OUT, "now"), { recursive: true }); await page.screenshot({ path: path.join(OUT, "now", `${id}.png`) as `${string}.png` }); }
  }
  log(`снято: ${name} ${v2 ? "новое" : "сейчас"}`);
}

async function pass(browser: Browser, v2: boolean) {
  const tag = v2 ? "Н" : "С";
  // мир: залы храма и зиккурата, затем данж
  const page = await newPage(browser);
  await page.setViewport({ width: 1366, height: 768 });
  page.on("pageerror", (e) => console.error("pageerror", String(e)));
  if (v2) await page.evaluateOnNewDocument(() => { (window as any).__floorsV2 = true; });
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await login(page, `Пол${tag}а`);
  await dbg(page, { op: "god" });
  for (const r of process.env.PART === "dg" ? [] : INTERIORS) {
    await dbg(page, { op: "tp", x: r.entry.x, y: r.entry.y - 96 }); await sleep(2500);
    await spot(page, r.id, r.name, r.ox + (r.w * 32) / 2, r.oy + (r.h * 32) / 2 + 24, v2);
  }
  await page.evaluate("window.__lock = null");
  await dbg(page, { op: "tp", x: DUNGEON_DOOR.x, y: DUNGEON_DOOR.y + 28 }); await sleep(1200);
  for (let k = 0; ; k++) {
    await page.evaluate(`window.__net.send("dungeon:enter", {})`);
    try { await page.waitForFunction(`window.__net.kind === "dungeon"`, { timeout: 60000 }); break; } catch (e) { if (k >= 2) throw e; log("повтор входа в данж"); await sleep(5000); }
  }
  await sleep(3000);
  await dbg(page, { op: "god" });
  for (const [i, label, id] of [[4, "Данж: собор", "dg_cathedral"], [6, "Данж: переход", "dg_transition"], [9, "Данж: пепельный склеп", "dg_ashen"]] as const) {
    const [x0, y0, x1, y1] = DUNGEON_ROOMS[i], cx = ((x0 + x1) / 2) * 32, cy = ((y0 + y1) / 2) * 32;
    await dbg(page, { op: "tp", x: cx, y: cy + 40 }); await sleep(2500);
    await spot(page, id, label, cx, cy, v2);
  }
  await page.close();
  // рейд: свой герой, уровень 80, у вестника Эмберхолла
  const p2 = await newPage(browser);
  await p2.setViewport({ width: 1366, height: 768 });
  if (v2) await p2.evaluateOnNewDocument(() => { (window as any).__floorsV2 = true; });
  try {
    await p2.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(p2, `Пол${tag}р`);
    await dbg(p2, { op: "level", v: 100 }); await sleep(800);
    const h = RAID_HERALDS.find((q) => q.id.endsWith("ember")) ?? RAID_HERALDS[0];
    await dbg(p2, { op: "tp", x: h.x, y: h.y + 40 }); await sleep(1500);
    await p2.evaluate(`window.__net.send("raid:join", {})`); await sleep(800);
    await p2.evaluate(`window.__net.send("raid:start", {})`);
    await p2.waitForFunction(`window.__net.kind === "raid"`, { timeout: 60000 });
    await sleep(1500);
    const hall = (RAID as any).map.hall as { x: number; y: number };
    await spot(p2, "raid", "Рейд: Цитадель Хаоса", hall.x * 32, hall.y * 32 + 96, v2, true);
  } catch (e) { log(`рейд не снят (${v2 ? "новое" : "сейчас"}): ${String((e as Error).message).slice(0, 120)}`); }
  await p2.close();
}

async function newPage(browser: Browser) {
  const p = await browser.newPage();
  p.setDefaultNavigationTimeout(300000); p.setDefaultTimeout(180000);
  p.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
  p.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));
  return p;
}
async function montage(browser: Browser) {
  const spots = [...new Set(shots.map((s) => s.spot))];
  const img = (s: Shot | undefined) => (s?.buf ? `<img src="data:image/png;base64,${s.buf.toString("base64")}">` : `<div class="none">нет снимка</div>`);
  const rows: string[] = [];
  for (const sp of spots) for (const zoom of [2, 3]) {
    const f = (v2: boolean, night: boolean) => shots.find((s) => s.spot === sp && s.zoom === zoom && s.v2 === v2 && s.night === night);
    rows.push(`<h2>${sp} — зум ${zoom}</h2><div class="row">${[[false, false], [true, false], [false, true], [true, true]].map(([v2, n]) => `<figure>${img(f(v2, n))}<figcaption>${v2 ? "новое" : "сейчас"}, ${n ? "ночь" : "день"}</figcaption></figure>`).join("")}</div>`);
  }
  const html = `<html><head><style>body{margin:0;padding:10px;background:#0e0c12;color:#efe6d2;font:15px sans-serif}h1{color:#d6a84b;font-size:20px;margin:4px 0 8px}h2{color:#d6a84b;font-size:16px;margin:10px 0 4px}
.row{display:flex;gap:8px}figure{margin:0}img{display:block;width:${CW}px;height:${CH}px}figcaption{color:#b8b0c0;font-size:13px;padding:3px 0}.none{width:${CW}px;height:${CH}px;background:#18151e;color:#6e6878;display:flex;align-items:center;justify-content:center}</style></head>
<body><h1>Полы помещений в игре: сейчас | новое (флаг __floorsV2)</h1>${rows.join("")}</body></html>`;
  const page = await newPage(browser);
  await page.setViewport({ width: CW * 4 + 44, height: 800 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: path.join(OUT, process.env.OUTNAME ?? "ingame.png"), fullPage: true });
  await page.close();
}

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  try {
    // прогрев: Vite догружает зависимости при первом открытии и перезагружает страницу — до входа героев
    { const w = await newPage(browser); await w.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" }); await sleep(15000); await w.close(); }
    if (process.env.MONTAGE) {
      for (const f of fs.readdirSync(SHOTS)) { const [v, ...rest] = f.replace(".png", "").split("_"); const night = rest.pop() === "1", zoom = Number(rest.pop()), id = rest.join("_"); shots.push({ spot: NAMES[id] ?? id, zoom, night, v2: v === "1", buf: fs.readFileSync(path.join(SHOTS, f)) }); }
      const order = Object.values(NAMES); shots.sort((a, b) => order.indexOf(a.spot) - order.indexOf(b.spot));
      await montage(browser); log("монтаж готов"); return;
    }
    if (process.env.PASS !== "new") await pass(browser, false);
    if (process.env.PASS !== "now") await pass(browser, true);
    log(`ошибок консоли: ${consoleErrors.length}`); for (const e of [...new Set(consoleErrors)].slice(0, 8)) log(`  ${e}`);
    fs.mkdirSync(OUT, { recursive: true });
    await montage(browser);
    log("ingame.png готов");
  } finally { await browser.close(); await vite.close(); await stopServer(); }
}
setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 40 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
