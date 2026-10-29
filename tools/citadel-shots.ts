/**
 * Цитадель Хаоса (рейд) в движке: «было | стало» (флаг window.__citadelV2, client/src/game/citadelV2.ts) на 6 местах, зум 2 и 3.
 * Свой сервер и Vite, headless. Запуск под tools/out/scenario.lock(2):
 *   $env:TEST_PORT="2947"; $env:PASS="old"; $env:SHOTS="tools/out/citadel/shots"; npx tsx tools/citadel-shots.ts
 *   PASS=new — то же с флагом; MONTAGE=audit|compare — сборка tools/out/citadel/{audit,compare}.png из SHOTS.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, sleep, startServer, stopServer, PORT } from "../tests/harness";
import { RAID_HERALDS } from "../shared/raid";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5347, OUT = path.resolve("tools/out/citadel");
const SHOTS = path.resolve(process.env.SHOTS ?? "tools/out/citadel/shots");
const CW = 600, CH = 380;
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
const log = (s: string) => console.log(s);
/** Места съёмки (тайлы карты рейда). */
export const SPOTS: { id: string; name: string; x: number; y: number }[] = [
  { id: "ante", name: "Вход: Преддверие и портал", x: 24, y: 39 },
  { id: "bridge", name: "Путь: мост через лаву", x: 24, y: 33 },
  { id: "pillar", name: "Зал: колонна и край лавы (юго-запад)", x: 13.5, y: 26 },
  { id: "boss", name: "Зал босса: печать и помост", x: 24, y: 16 },
  { id: "north", name: "Северная стена и башни", x: 24, y: 6 },
  { id: "east", name: "Восточный край: лава и обрыв", x: 39, y: 22 },
];

/** Круг 2 (SET=2): объекты крупно — колонна, жаровня на берегу, череп у края; места — из data/citadel.json. */
function spots2() {
  const d = JSON.parse(fs.readFileSync(path.resolve("data/citadel.json"), "utf8")) as { objects: { kind: string; x: number; y: number }[] };
  const f = (k: string) => d.objects.find((o) => o.kind.startsWith(k))!;
  const p = f("cit_pillar"), b = f("cit_brazier"), k = f("cit_skull");
  return [
    { id: "s2pillar", name: "Колонна", x: p.x / 32, y: (p.y - 60) / 32 },
    { id: "s2brazier", name: "Жаровня на берегу", x: b.x / 32, y: (b.y - 20) / 32 },
    { id: "s2skull", name: "Кости у края пола", x: k.x / 32, y: (k.y - 8) / 32 },
  ];
}
const SET2 = process.env.SET === "2";
async function login(page: Page, name: string) {
  const token = await ensureChar(`ct${Array.from(name).map((c) => c.charCodeAt(0).toString(36)).join("")}`.slice(0, 16), "secret", name, "warrior");
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
async function clipShot(page: Page) {
  const r = (await page.evaluate(`(() => { const b = document.querySelector("canvas").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`)) as { x: number; y: number; w: number; h: number };
  return (await page.screenshot({ clip: { x: Math.round(r.x + r.w / 2 - CW / 2), y: Math.round(r.y + r.h / 2 - CH / 2), width: CW, height: CH } })) as Buffer;
}
const errors: string[] = [];
async function newPage(browser: Browser) {
  const p = await browser.newPage();
  p.setDefaultNavigationTimeout(300000); p.setDefaultTimeout(180000);
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  p.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  await p.setViewport({ width: 1366, height: 768 });
  return p;
}

async function pass(browser: Browser, v2: boolean) {
  const p = await newPage(browser);
  if (v2) await p.evaluateOnNewDocument(() => { (window as any).__citadelV2 = true; });
  await login(p, v2 ? "ЦитаН" : "ЦитаС");
  await dbg(p, { op: "level", v: 100 }); await sleep(800);
  const h = RAID_HERALDS.find((q) => q.id.endsWith("ember")) ?? RAID_HERALDS[0];
  await dbg(p, { op: "tp", x: h.x, y: h.y + 40 }); await sleep(1500);
  await p.evaluate(`window.__net.send("raid:join", {})`); await sleep(800);
  await p.evaluate(`window.__net.send("raid:start", {})`);
  await p.waitForFunction(`window.__net.kind === "raid"`, { timeout: 60000 });
  await sleep(2500);
  await dbg(p, { op: "god" });
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const s of SET2 ? spots2() : SPOTS) for (const zoom of [2, 3]) {
    await camLock(p, s.x * 32, s.y * 32, zoom);
    await sleep(1100);
    fs.writeFileSync(path.join(SHOTS, `${v2 ? 1 : 0}_${s.id}_${zoom}.png`), await clipShot(p));
  }
  // таймер сбора (верх экрана)
  if (SET2) fs.writeFileSync(path.join(SHOTS, `${v2 ? 1 : 0}_ui.png`), (await p.screenshot({ clip: { x: 383, y: 0, width: 600, height: 380 } })) as Buffer);
  log(`снято: ${v2 ? "стало" : "было"}`);
  await p.close();
}

async function montage(browser: Browser, kind: string) {
  const img = (f: string) => fs.existsSync(f) ? `<img src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}">` : `<div class="none">нет снимка</div>`;
  const notes = process.env.NOTES ? fs.readFileSync(process.env.NOTES, "utf8") : "";
  let body = "";
  if (kind === "compare2") {
    const A = path.resolve("client/public/assets"), px = (f: string, label: string) => fs.existsSync(f) ? `<figure class="obj"><img class="px" src="data:image/png;base64,${fs.readFileSync(f).toString("base64")}" onload="this.style.width=this.naturalWidth*3+'px';this.style.height=this.naturalHeight*3+'px'"><figcaption>${label}</figcaption></figure>` : "";
    const pairs: [string, [string, string][], [string, string][]][] = [
      ["Колонна (след 2×2 = плинт 62 px)", [[`${A}/objects/chaos_pillar.png`, "было"]], [[`${A}/citadel/cit_pillar.png`, "стало"]]],
      ["Жаровня (огонь — fire v2, лист fire-brazier, в игре)", [], [[`${A}/citadel/cit_brazier.png`, "стало: треножник и чаша"], [`${A}/vfx/fire-brazier.png`, "огонь fire v2 (лист)"]]],
      ["Кости и черепа", [[`${A}/objects/bones.png`, "было"], [`${A}/objects/bone_pile.png`, "было"], [`${A}/objects/v_volcano_skull.png`, "было"]], [[`${A}/citadel/cit_ribs_0.png`, "стало"], [`${A}/citadel/cit_skull_2.png`, "стало"], [`${A}/citadel/cit_skull_0.png`, "стало"], [`${A}/citadel/cit_skull_1.png`, "стало"]]],
    ];
    body = `<h1>Цитадель Хаоса, круг 2 — объекты крупно (×3) и в сцене; флаг __citadelV2</h1>${notes}` +
      pairs.map(([t, a, b]) => `<h2>${t}</h2><div class="row objs">${a.map(([f, l]) => px(f, l)).join("")}<div class="sep"></div>${b.map(([f, l]) => px(f, l)).join("")}</div>`).join("") +
      spots2().map((s) => `<h2>В сцене: ${s.name}</h2><div class="row"><figure>${img(path.join(SHOTS, `0_${s.id}_3.png`))}<figcaption>было, зум 3</figcaption></figure><figure>${img(path.join(SHOTS, `1_${s.id}_3.png`))}<figcaption>стало, зум 3</figcaption></figure><figure>${img(path.join(SHOTS, `1_${s.id}_2.png`))}<figcaption>стало, зум 2</figcaption></figure></div>`).join("") +
      `<h2>Таймер сбора рейда</h2><div class="row"><figure>${img(path.join(SHOTS, "0_ui.png"))}<figcaption>было</figcaption></figure><figure>${img(path.join(SHOTS, "1_ui.png"))}<figcaption>стало</figcaption></figure></div>`;
  } else if (kind === "audit") {
    body = `<h1>Цитадель Хаоса — аудит (сейчас), зум 2 | зум 3</h1>${notes}` + SPOTS.map((s) => `<h2>${s.name}</h2><div class="row">${[2, 3].map((z) => `<figure>${img(path.join(SHOTS, `0_${s.id}_${z}.png`))}<figcaption>зум ${z}</figcaption></figure>`).join("")}</div>`).join("");
  } else {
    const z = Number(process.env.ZOOM ?? 2);
    body = `<h1>Цитадель Хаоса — было | стало (зум ${z}; справа — стало на зуме 3)</h1>${notes}` + SPOTS.map((s) => `<h2>${s.name}</h2><div class="row"><figure>${img(path.join(SHOTS, `0_${s.id}_${z}.png`))}<figcaption>было, зум ${z}</figcaption></figure><figure>${img(path.join(SHOTS, `1_${s.id}_${z}.png`))}<figcaption>стало, зум ${z}</figcaption></figure><figure>${img(path.join(SHOTS, `1_${s.id}_3.png`))}<figcaption>стало, зум 3</figcaption></figure></div>`).join("");
  }
  const cols = kind === "audit" ? 2 : 3;
  const html = `<html><head><meta charset="utf-8"><style>body{margin:0;padding:10px;background:#0e0c12;color:#efe6d2;font:15px sans-serif}h1{color:#d6a84b;font-size:20px;margin:4px 0 8px}h2{color:#d6a84b;font-size:16px;margin:10px 0 4px}
.row{display:flex;gap:8px}figure{margin:0}img{display:block;width:${CW}px;height:${CH}px}figcaption{color:#b8b0c0;font-size:13px;padding:3px 0}.none{width:${CW}px;height:${CH}px;background:#18151e;color:#6e6878;display:flex;align-items:center;justify-content:center}
.objs{align-items:flex-end;background:#3c3240;padding:10px;gap:18px;flex-wrap:wrap}.objs img{width:auto;height:auto;image-rendering:pixelated}.sep{width:3px;align-self:stretch;background:#d6a84b}
ul{margin:4px 0 8px 18px;padding:0;color:#e8d8c0;max-width:${CW * cols}px}li{margin:2px 0}</style></head><body>${body}</body></html>`;
  const page = await newPage(browser);
  await page.setViewport({ width: CW * cols + 8 * cols + 20, height: 800 });
  await page.setContent(html, { waitUntil: "load" });
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${kind}.png`) as `${string}.png`, fullPage: true });
  await page.close();
}

async function main() {
  const chromeArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1366,768", "--no-sandbox"];
  if (process.env.MONTAGE) {
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: chromeArgs });
    try { await montage(browser, process.env.MONTAGE); log(`${process.env.MONTAGE}.png готов`); } finally { await browser.close(); }
    return;
  }
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  // сбор в рейде на 10 минут — снимки без боя (RaidRoom: RAID_GATHER_MS, RAID_HURRY_MS)
  await startServer(true, { RAID_GATHER_MS: "600000", RAID_HURRY_MS: "600000" });
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: chromeArgs, defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  try {
    { const w = await newPage(browser); await w.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" }); await sleep(12000); await w.close(); }
    await pass(browser, process.env.PASS === "new");
    log(`ошибок консоли: ${errors.length}`); for (const e of [...new Set(errors)].slice(0, 8)) log(`  ${e}`);
  } finally { await browser.close(); await vite.close(); await stopServer(); }
}
setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 25 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
