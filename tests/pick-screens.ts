/**
 * Браузерная проверка попадания мышью (задача 134, шаг 2; client/src/game/hit.ts) на зуме 2 и 3, «Экшен». Всё — ПКМ (только допуск, без магнита):
 * ник слизня (выше силуэта больше допуска) — атака; всадник — круп коня вне кадра героя; рейд-босс (кадр 128, юнит клиента) — голова и плечо,
 * слизень перед ним — по глубине раньше босса; бегущий слизень (200 px/с) — клик в след за ним (вне тела больше допуска).
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2863 VITE_TEST_PORT=5263 npx tsx tests/pick-screens.ts   (Chrome: CHROME_PATH или стандартные пути)
 * Снимки: tools/out/pick/pick-{nick,rider,boss}-z{2,3}.png
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5263;
const OUT = path.resolve("tools/out/pick");
const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const sp = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];
const scene = "(window.__game.scene.getScene('game'))";

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

async function enter(browser: Browser, name: string, zoom: number): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  await page.evaluateOnNewDocument((z) => { try { localStorage.setItem("zoom:v1", String(z)); } catch {} }, zoom);
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 15000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
  await sleep(800);
  return page;
}
const toClient = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = ${scene}, c = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
  return { x: r.left + (${x} - c.worldView.x) * (r.width / c.worldView.width), y: r.top + (${y} - c.worldView.y) * (r.height / c.worldView.height) }; })()`) as Promise<{ x: number; y: number }>;
interface V { x: number; y: number; body: { x0: number; y0: number; x1: number; y1: number }; plate: { x0: number; y0: number; x1: number; y1: number }; label: boolean }
const view = (page: Page, id: string) => page.evaluate(`(() => { const v = ${scene}.units.get(${JSON.stringify(id)}); return v ? { x: v.x, y: v.y, body: { ...v.body }, plate: { ...v.plate }, label: v.label.visible } : null; })()`) as Promise<V | null>;

async function run(browser: Browser, zoom: number, errors: string[]) {
  const name = zoom === 2 ? "ПикА" : "ПикБ";
  await ensureChar(name, "secret", name, "warrior");
  const page = await enter(browser, name, zoom);
  page.on("pageerror", (e) => errors.push(String(e)));
  const ok = (s: string) => console.log(`  ok   [зум ${zoom}] ${s}`);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(`[зум ${zoom}] ${msg}`); };
  const tol = 12 / zoom;
  await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 10 }); n.send("dbg", { op: "god" }); });
  const tp = (x: number, y: number) => page.evaluate(([px, py]) => (window as any).__net.send("dbg", { op: "tp", x: px, y: py }), [x, y]);
  await tp(sp.x + 150, sp.y - 70);
  for (let i = 0; i < 40; i++) {
    const p = await page.evaluate(`(() => { const s = ${scene}; return [s.pos.x, s.pos.y]; })()`) as number[];
    if (Math.hypot(p[0] - sp.x - 150, p[1] - sp.y + 70) < 64) break;
    await sleep(300);
  }
  // слизень рядом, герой в 150 px от него (вне аггро); камера отвязана и стоит на слизне
  let id: string | null = null;
  const slimeId = () => page.evaluate(`(() => { const s = ${scene}; let b = null, bd = 400; for (const v of s.units.values()) { if (v.u.sprite !== 'slime' || v.dead) continue; const d = Math.hypot(v.x - s.pos.x, v.y - s.pos.y); if (d < bd) { bd = d; b = v.id; } } return b; })()`) as Promise<string | null>;
  for (let i = 0; i < 40 && !id; i++) { await sleep(300); id = await slimeId(); }
  must(id, "слизень не появился рядом с героем");
  let v0 = (await view(page, id!))!;
  await tp(v0.x - 150, v0.y + 4);
  await sleep(1500);
  // «замороженный» слизень: клиент держит его позицию (u.x, u.y) сам — сервер шлёт её, только когда слизень бредёт
  await page.evaluate(`(() => { const s = ${scene}, v = s.units.get(${JSON.stringify(id)}); window.__hold = { x: v.u.x, y: v.u.y };
    window.__holdT = setInterval(() => { const h = window.__hold; if (h) { v.u.x = h.x; v.u.y = h.y; } }, 5); })()`);
  await sleep(400);
  v0 = (await view(page, id!))!;
  await page.evaluate(`(() => { const c = ${scene}.cameras.main; c.stopFollow(); c.centerOn(${v0.x}, ${v0.y - 30}); })()`);
  // атака, шаг и выбор цели только записываются: герой не идёт к слизню и не заслоняет его своими зонами
  await page.evaluate(() => { const w = window as any, n = w.__net, orig = n.send.bind(n); w.__sent = []; n.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return t === "attack" || t === "moveTo" || t === "target" ? undefined : orig(t, m); }; });
  const clear = () => page.evaluate(() => { (window as any).__sent.length = 0; });
  const sent = (type: string) => page.evaluate((t) => ((window as any).__sent as [string, any][]).filter((m) => m[0] === t).map((m) => m[1]), type);
  const shot = async (file: string, x: number, y: number, w: number, h: number) => {
    const c = await toClient(page, x - w / 2, y - h / 2);
    await page.screenshot({ path: path.join(OUT, file), clip: { x: Math.max(0, c.x), y: Math.max(0, c.y), width: w * zoom, height: h * zoom, scale: 2 } });
  };
  let last = "";
  /** ПКМ в точке мира: id атакуемого или null (moveTo); last — что было под курсором (для сообщений об ошибке). */
  const rclick = async (x: number, y: number): Promise<string | null> => {
    await page.evaluate(`(() => { const c = ${scene}.cameras.main; c.stopFollow(); c.centerOn(${x}, ${y}); })()`);
    await sleep(120);
    const c = await toClient(page, x, y);
    await page.mouse.move(c.x, c.y, { steps: 2 });
    await sleep(150);
    await clear();
    await page.mouse.click(c.x, c.y, { button: "right" });
    await sleep(200);
    const a = await sent("attack");
    last = await page.evaluate(`(() => { const s = ${scene}, v = s.units.get(${JSON.stringify(id)}); return JSON.stringify({ at: [${x}, ${y}], mouse: [s.mouse.x, s.mouse.y], pick: s.clickPick, plate: v.plate, body: v.body, sent: window.__sent }); })()`) as string;
    await page.evaluate(`${scene}.setTarget(null)`);
    return a.length ? a[0].id : null;
  };

  // 1. ник: верх надписи выше силуэта больше допуска — круг у ног и силуэт его не берут, плашка берёт
  const v = (await view(page, id!))!;
  must(v.label && v.plate.x1 > v.plate.x0, "ник слизня не виден: " + JSON.stringify(v));
  const ny = v.plate.y0 + 1;
  must(v.body.y0 - ny > tol + 1, `ник слишком близко к силуэту (${(v.body.y0 - ny).toFixed(1)} px)`);
  const cur = async () => page.evaluate(`${scene}.cursorKind`) as Promise<string>;
  must(await rclick((v.plate.x0 + v.plate.x1) / 2, ny) === id, "ПКМ по нику не атакует слизня: " + last);
  await page.mouse.move(...Object.values(await toClient(page, (v.plate.x0 + v.plate.x1) / 2, ny)) as [number, number]);
  await sleep(150);
  must(await cur() === "attack", "курсор над ником не меч");
  must(await rclick((v.plate.x0 + v.plate.x1) / 2, v.plate.y0 - 2 - tol - 4) === null, "ПКМ над ником (мимо плашки) атакует");
  await shot(`pick-nick-z${zoom}.png`, v.x, v.y - 24, 60, 60);
  ok("ПКМ по нику — атака, курсор-меч; выше ника — мимо");

  // 2. всадник: слизень верхом на коне (кадр 96, зона — непрозрачные пиксели кадра коня). Анфас конь узкий: сбоку от него — мимо;
  //    боком (взгляд вправо) — круп коня вне кадра героя больше допуска кликается
  await page.evaluate(`(() => { const v = ${scene}.units.get(${JSON.stringify(id)}); v.u.mount = 'horse'; v.u.dir = 0; })()`);
  await sleep(400);
  const rf = (await view(page, id!))!;
  must(rf.body.x1 - rf.body.x0 < 50, "анфас зона коня шире 50 px: " + JSON.stringify(rf.body));
  must(await rclick(rf.body.x1 + tol + 3, rf.y - 8) === null, "ПКМ сбоку от коня анфас атакует");
  await shot(`pick-rider-front-z${zoom}.png`, rf.x, rf.y - 30, 110, 90);
  await page.evaluate(`(() => { const v = ${scene}.units.get(${JSON.stringify(id)}); v.u.dir = 3; })()`);
  await sleep(400);
  const r = (await view(page, id!))!;
  must(r.body.x1 - r.body.x0 > 50, "кадр коня боком не вошёл в зону: " + JSON.stringify(r.body));
  const rx = r.body.x1 - 4, ry = r.y - 8;
  must(rx - (r.x + 13.4) > tol + 1, "круп слишком близко к всаднику");
  must(await rclick(rx, ry) === id, "ПКМ по крупу коня не атакует всадника");
  must(await rclick(r.body.x1 + tol + 4, ry) === null, "ПКМ за конём атакует");
  await shot(`pick-rider-z${zoom}.png`, r.x, r.y - 30, 110, 90);
  await page.evaluate(`(() => { const v = ${scene}.units.get(${JSON.stringify(id)}); v.u.mount = ''; v.u.dir = 0; })()`);
  await sleep(300);
  ok("всадник: анфас — сбоку от коня мимо; боком — круп атака, за конём мимо");

  // 3. рейд-босс (кадр 128): юнит клиента за слизнем (на 6 px выше ног) — голова и плечо его, тело слизня спереди — слизня
  const bx = v0.x, by = v0.y - 6;
  await page.evaluate(`(() => { const s = ${scene}, src = s.units.get(${JSON.stringify(id)}).u, o = {};
    for (const k of Object.keys(src).concat(['kind','sprite','name','level','hp','maxHp','anim','dir','aseq','buffs','mount','fx','elite','look','title','frame','faction','team','outlaw','gear','weapon','ownerId'])) o[k] = src[k];
    Object.assign(o, { kind: 2, sprite: 'chaos_knight', name: 'Пробный босс', x: ${bx}, y: ${by}, mount: '', hp: 100, maxHp: 100, elite: false });
    s.addUnit('pick_boss', o, true); })()`);
  await sleep(400);
  const b = (await view(page, "pick_boss"))!;
  must(b && b.body.y1 - b.body.y0 > 100, "кадр 128 не дал зону босса: " + JSON.stringify(b?.body));
  must(await rclick(bx, by - 105) === "pick_boss", "ПКМ по голове рейд-босса не атакует его");
  must(await rclick(bx + 48, by - 60) === "pick_boss", "ПКМ по плечу рейд-босса не атакует его");
  const sv = (await view(page, id!))!;
  must(await rclick(sv.x, sv.y - 8) === id, "ПКМ по слизню перед боссом взяла босса (порядок по глубине)");
  await shot(`pick-boss-z${zoom}.png`, bx, by - 60, 140, 140);
  await page.evaluate(`${scene}.removeUnit('pick_boss')`);
  ok("рейд-босс 128: голова и плечо — атака; слизень спереди — раньше босса");

  // 4. бегущий: слизень едет вправо 200 px/с (клиент двигает u.x), ПКМ на 8 px за его задним краем — в след за 120 мс (вне тела больше допуска)
  await page.evaluate(`(() => { const s = ${scene}, v = s.units.get(${JSON.stringify(id)}); window.__pd = [];
    s.game.canvas.addEventListener('mousedown', () => { const m = s.input.activePointer; window.__pd.push({ trail: v.hitTest(m.worldX, m.worldY, 0) < Infinity, body: v.hitTest(m.worldX, m.worldY, ${tol}, false) < Infinity }); }); })()`);
  let good = 0, tries = 0;
  for (; tries < 8 && good < 2; tries++) {
    const start = (await view(page, id!))!;
    await page.evaluate(`(() => { const h = window.__hold; h.x0 = h.x; h.t0 = performance.now(); window.__run = setInterval(() => { h.x = h.x0 + (performance.now() - h.t0) * 0.2; }, 5); })()`);
    await sleep(450);
    const m = (await view(page, id!))!;
    await clear();
    await page.evaluate(() => { (window as any).__pd.length = 0; });
    const c = await toClient(page, m.body.x0 - 8, m.y - 8);
    await page.mouse.click(c.x, c.y, { button: "right" });
    await sleep(200);
    await page.evaluate(`(() => { clearInterval(window.__run); const h = window.__hold; h.x = ${start.x}; })()`);
    const pd = await page.evaluate(() => (window as any).__pd) as { trail: boolean; body: boolean }[];
    const a = await sent("attack");
    await page.evaluate(`${scene}.setTarget(null)`);
    await sleep(500);
    if (pd.length !== 1 || !pd[0].trail || pd[0].body) { console.log(`  skip [зум ${zoom}] попытка ${tries + 1}: клик пришёл не в след (${JSON.stringify(pd)})`); continue; }
    must(a.length === 1 && a[0].id === id, "ПКМ в след бегущего не атакует: " + JSON.stringify(a));
    good++;
  }
  must(good >= 1, `ни один клик не пришёл в след за ${tries} попыток (машина лагает?)`);
  ok(`бегущий 200 px/с: ПКМ в след за ним — атака (${good} из ${tries})`);
  await page.evaluate(() => { clearInterval((window as any).__holdT); });
  await page.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  try {
    for (const zoom of [2, 3]) {
      await startServer(true);
      try { await run(browser, zoom, errors); } finally { await stopServer(); }
    }
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("pick-screens: готово, снимки в " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
