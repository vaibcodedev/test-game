/**
 * Браузерная проверка наведения мышью (задача 134, шаг 1): кольцо под ногами, ник и полоска HP у моба под курсором (вместо тинта),
 * допуск клика 12 px экрана и магнит ЛКМ 40 px (меч — только в допуске), пересчёт каждый кадр при неподвижной мыши; кольцо ровно цвета палитры (заливка) над кругами бафов,
 * мышь вне окна и на своём герое — без подсветки. Зум 2 и 3, «Экшен».
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2871 VITE_TEST_PORT=5271 npx tsx tests/hover-screens.ts   (Chrome: CHROME_PATH или стандартные пути)
 * Снимки: tools/out/hover/hover-{off,on,magnet}-z{2,3}.png (вырезка вокруг слизня, ×3)
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED } from "../shared/constants";
import { generateMap } from "../shared/map";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5271;
const OUT = path.resolve("tools/out/hover");
const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const sp = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const scene = "(window.__game.scene.getScene('game'))";

async function enter(browser: Browser, name: string, zoom: number): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  await page.evaluateOnNewDocument((z) => { try { localStorage.setItem("zoom:v1", String(z)); } catch {} }, zoom);
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 15000 }).catch(async (e) => { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 400)); throw e; });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
  await sleep(800);
  return page;
}
/** Экранные координаты точки мира. */
const toClient = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = ${scene}, c = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
  return { x: r.left + (${x} - c.worldView.x) * (r.width / c.worldView.width), y: r.top + (${y} - c.worldView.y) * (r.height / c.worldView.height) }; })()`) as Promise<{ x: number; y: number }>;
interface Snap { id: string; x: number; y: number; hx: number; hy: number; hover: string | null; cursor: string; css: number; d: number; ring: { vis: boolean; alpha: number; tint: number; fill: boolean; depth: number }; label: boolean; bar: number; tinted: boolean; canvasCursor: string; ui: boolean }
/** Слизень и состояние наведения сейчас: d — расстояние от курсора (activePointer) до центра тела слизня в пикселях мира. */
const snap = (page: Page, id: string) => page.evaluate(`(() => { const s = ${scene}, v = s.units.get(${JSON.stringify(id)}), ap = s.input.activePointer, c = s.cameras.main.getWorldPoint(ap.x, ap.y);
  return { id: v.id, x: v.x, y: v.y, hx: s.pos.x, hy: s.pos.y, hover: s.hoverId, cursor: s.cursorKind, css: s.css, d: Math.hypot(c.x - v.x, c.y - (v.y - 12)),
    ring: { vis: v.ring.visible, alpha: v.ring.alpha, tint: v.ring.tintTopLeft, fill: v.ring.tintFill, depth: v.ring.depth }, label: v.label.visible, bar: v.bar.commandBuffer.length, tinted: v.sprite.isTinted,
    canvasCursor: s.game.canvas.style.cursor, ui: s.overUi }; })()`) as Promise<Snap>;
/** Живой слизень рядом с героем, не дальше 400 px (id). */
const slimeId = (page: Page) => page.evaluate(`(() => { const s = ${scene}; let b = null, bd = 400; for (const v of s.units.values()) { if (v.u.sprite !== 'slime' || v.dead) continue; const d = Math.hypot(v.x - s.pos.x, v.y - s.pos.y); if (d < bd) { bd = d; b = v.id; } } return b; })()`) as Promise<string | null>;
/** Ждём, пока слизень стоит (сдвиг за 400 мс меньше 1 px). */
async function still(page: Page, id: string) {
  for (let i = 0; i < 40; i++) {
    const a = await snap(page, id); await sleep(400); const b = await snap(page, id);
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1) return;
  }
  throw new Error("слизень не успокоился");
}

async function run(browser: Browser, zoom: number, errors: string[]) {
  const name = zoom === 2 ? "ХоверА" : "ХоверБ";
  await ensureChar(name, "secret", name, "warrior");
  const page = await enter(browser, name, zoom);
  page.on("pageerror", (e) => errors.push(String(e)));
  const ok = (s: string) => console.log(`  ok   [зум ${zoom}] ${s}`);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(`[зум ${zoom}] ${msg}`); };
  await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 10 }); n.send("dbg", { op: "god" }); });
  const tp = (x: number, y: number) => page.evaluate(([px, py]) => (window as any).__net.send("dbg", { op: "tp", x: px, y: py }), [x, y]);
  await tp(sp.x + 150, sp.y - 70);
  // герой входит у столицы своей фракции, а рядом с ней тоже бродят слизни: пока телепорт не дошёл до клиента, в units ещё они — ждём героя на месте
  for (let i = 0; i < 40; i++) {
    const p = await page.evaluate(`(() => { const s = ${scene}; return [s.pos.x, s.pos.y]; })()`) as number[];
    if (Math.hypot(p[0] - sp.x - 150, p[1] - sp.y + 70) < 64) break;
    await sleep(300);
  }
  let id: string | null = null;
  for (let i = 0; i < 40 && !id; i++) { await sleep(300); id = await slimeId(page); }
  must(id, "слизень не появился рядом с героем");
  // герой в 150 px слева от слизня (его аггро — 120): боя и следов ударов поверх слизня на снимках нет
  const near = await snap(page, id!);
  await tp(near.x - 150, near.y + 4);
  await sleep(1500);
  await still(page, id!);
  const s0 = await snap(page, id!);
  must(Math.abs(s0.css - zoom) < 1e-9, `масштаб CSS ${s0.css}, ждали ${zoom}`);

  // камера отвязана от героя и стоит на слизне: он в центре экрана, вдали от интерфейса (на зуме 3 при слежке за героем он уезжал под правую панель)
  await page.evaluate(`(() => { const c = ${scene}.cameras.main; c.stopFollow(); c.centerOn(${s0.x}, ${s0.y - 12}); })()`);
  await sleep(200);
  const tol = 12 / zoom, mag = 40 / zoom, R = 14;
  // направление от центра тела слизня, в котором точки проверки (0…40 px и «вдали») свободны от других существ и интерфейса: рядом бродят другие слизни и сам герой
  const others = await page.evaluate(`(() => { const s = ${scene}, out = []; for (const v of s.units.values()) if (v.id !== ${JSON.stringify(id)} && !v.dead) out.push({ x: v.x, y: v.y - (v.frame > 32 ? 28 : 12) }); return out; })()`) as { x: number; y: number }[];
  let dir: [number, number] | null = null, free = -1;
  for (const [ux, uy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]] as [number, number][]) {
    let min = Infinity, inside = true;
    for (const d of [0, 10, 20, 30, 40, R + mag + 60]) {
      const px = s0.x + ux * d, py = s0.y - 12 + uy * d, c = await toClient(page, px, py);
      for (const o of others) min = Math.min(min, Math.hypot(o.x - px, o.y - py));
      if (c.x < 120 || c.x > 1160 || c.y < 90 || c.y > 620) inside = false;
    }
    if (inside && min > free) { free = min; dir = [ux, uy]; }
  }
  must(dir && free > R + mag + 12, `нет свободного направления для проверки (до других существ ${free.toFixed(0)} px)`);
  const [ux, uy] = dir!;
  const clip = async (file: string) => {
    // вырезка 70×70 px мира вокруг слизня (от ника до кольца под ногами), ×3
    const s = await snap(page, id!), c = await toClient(page, s.x, s.y - 12), w = 70 * zoom;
    await page.screenshot({ path: path.join(OUT, file), clip: { x: Math.max(0, c.x - w / 2), y: Math.max(0, c.y - 42 * zoom), width: w, height: w, scale: 3 } });
  };
  /** Сообщения серверу, которые клиент отправил после clear(): чем кончился клик. */
  const sent = (type: string) => page.evaluate((t) => ((window as any).__sent as [string, any][]).filter((m) => m[0] === t).map((m) => m[1]), type);
  const clear = () => page.evaluate(() => { (window as any).__sent.length = 0; });
  await page.evaluate(() => {
    const w = window as any, n = w.__net, orig = n.send.bind(n);
    w.__sent = [];
    n.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); };
  });
  /** Мышь на dx px мира от центра тела слизня в выбранном направлении (ux, uy). */
  const mouseAt = async (dx: number) => {
    const s = await snap(page, id!), c = await toClient(page, s.x + ux * dx, s.y - 12 + uy * dx);
    await page.mouse.move(c.x, c.y, { steps: 3 });
    await sleep(160);
    const r = await snap(page, id!);
    must(!r.ui, "курсор над интерфейсом, а не над полем: " + JSON.stringify(r));
    return r;
  };

  // мышь вдали от слизня: подсветки нет, полоска целого моба скрыта, ник виден
  let s = await mouseAt(R + mag + 60);
  must(s.hover === null && !s.ring.vis && s.bar === 0 && s.cursor === "arrow", "мышь вдали: подсветка есть: " + JSON.stringify(s));
  must(s.label, "ник слизня не виден");
  await clip(`hover-off-z${zoom}.png`);
  ok("мышь вдали: кольца и полоски у целого моба нет, ник виден");

  // мышь на слизне: красное кольцо вдвое бледнее кольца выбора, полоска HP, меч, спрайт без тинта (вместо тинта наведения)
  s = await mouseAt(2);
  must(s.hover === id && s.ring.vis && Math.abs(s.ring.alpha - 0.35) < 1e-6 && s.ring.tint === 0xff3030, "нет красного кольца наведения: " + JSON.stringify(s));
  // цвет на экране — ровно палитра: текстура кольца золотая, умножающий тинт дал бы (255, 39, 12), заливающий — (255, 48, 48); кольцо над кругами бафов (ground + 7)
  must(s.ring.fill, "кольцо тонировано умножением (setTint), а не заливкой: на экране не цвет палитры " + JSON.stringify(s.ring));
  must(s.ring.depth > -600 + 7, "кольцо лежит не выше кругов бафов (DEPTH.ground = -600, круги на +7): " + JSON.stringify(s.ring));
  must(s.bar > 0, "полоска HP не показана при наведении");
  must(s.label, "ник не виден при наведении");
  must(s.cursor === "attack" && s.canvasCursor.includes("cursor_attack"), "курсор не меч: " + s.cursor + " " + s.canvasCursor);
  must(!s.tinted, "спрайт под курсором затемнён тинтом");
  await clip(`hover-on-z${zoom}.png`);
  ok("мышь на слизне: красное кольцо 0,35 цвета палитры над кругами бафов, полоска HP, меч, без тинта");

  // мышь вышла из окна (mouseout холста): activePointer хранит последнюю точку над слизнем, но подсветки и меча нет; вернулась (mouseover) — они возвращаются
  const canvasEvent = (type: string) => page.evaluate(`${scene}.game.canvas.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, { bubbles: true, relatedTarget: null }))`);
  await canvasEvent("mouseout");
  await sleep(160);
  s = await snap(page, id!);
  must(s.hover === null && s.cursor === "arrow" && !s.ring.vis, "мышь вышла из окна, а подсветка и меч остались: " + JSON.stringify(s));
  await canvasEvent("mouseover");
  // наведение пересчитывается в update(): под нагрузкой кадр приходит не за 160 мс — ждём, пока подсветка придёт к тому, что даёт расстояние (до 2 с)
  for (let t = 0; t < 2000; t += 100) {
    await sleep(100);
    s = await snap(page, id!);
    if ((s.hover === id) === (s.d < R + mag) && s.ring.vis === (s.hover === id)) break;
  }
  // слизень бродит: ждём то, что даёт его живое расстояние до неподвижной мыши (у границ зон — пропуск)
  if ([R + tol, R + mag].some((e) => Math.abs(s.d - e) < 1.5)) console.log(`  skip [зум ${zoom}] возврат мыши: слизень у границы зоны (d=${s.d.toFixed(1)})`);
  else must((s.hover === id) === (s.d < R + mag) && s.ring.vis === (s.hover === id) && s.cursor === (s.d < R + tol ? "attack" : "arrow"), `мышь вернулась, а подсветка и меч не вернулись (d=${s.d.toFixed(1)}): ` + JSON.stringify(s));
  ok("мышь вышла из окна: подсветка и меч сняты, вернулась — на месте");

  // мышь на своём герое (он стоит в 150 px левее слизня): себя не подсвечиваем — ни кольца под ногами, ни принудительных ника и полоски
  const hero = await toClient(page, s0.hx, s0.hy - 12);
  if (hero.x > 120 && hero.x < 1160 && hero.y > 90 && hero.y < 620) {
    await page.mouse.move(hero.x, hero.y, { steps: 3 });
    await sleep(160);
    const me = await page.evaluate(`(() => { const s = ${scene}, h = s.me; return { hover: s.hoverId, ring: h.ring.visible, ui: s.overUi, body: Number.isFinite(h.hitTest(s.mouse.x, s.mouse.y)) }; })()`) as { hover: string | null; ring: boolean; ui: boolean; body: boolean };
    must(!me.ui && me.body, "мышь не на теле героя: " + JSON.stringify(me));
    must(me.hover === null && !me.ring, "герой подсвечен под курсором: " + JSON.stringify(me));
    ok("мышь на своём герое: подсветки нет");
  } else console.log(`  skip [зум ${zoom}] свой герой вне безопасной области экрана (${hero.x.toFixed(0)}, ${hero.y.toFixed(0)})`);
  s = await mouseAt(2);

  // допуск и магнит: расстояние до центра тела s.d (живое). «Точно» — до R + 12/зум, магнит ЛКМ — до R + 40/зум; меч — только «точно»
  const edge = [R + tol, R + mag];
  for (const dx of [R + tol - 4, R + tol + 4, R + mag - 4, R + mag + 5]) {
    s = await mouseAt(dx);
    if (edge.some((e) => Math.abs(s.d - e) < 1.5)) { console.log(`  skip [зум ${zoom}] dx=${dx.toFixed(1)}: слизень сдвинулся к границе (d=${s.d.toFixed(1)})`); continue; }
    const exact = s.d < R + tol, magnet = s.d < R + mag;
    must((s.hover === id) === magnet, `d=${s.d.toFixed(1)}: подсветка ${s.hover === id}, ждали ${magnet}`);
    must(s.cursor === (exact ? "attack" : "arrow"), `d=${s.d.toFixed(1)}: курсор ${s.cursor}, ждали ${exact ? "attack" : "arrow"}`);
    if (!exact && magnet) await clip(`hover-magnet-z${zoom}.png`);
  }
  ok(`допуск ${tol.toFixed(1)} px мира: меч и подсветка; магнит до ${mag.toFixed(1)} px: только подсветка (курсор — стрелка), дальше — ничего`);

  // мышь не двигается, а камера едет (80 px мира вбок и обратно): подсветка и курсор пересчитываются сами, без событий мыши
  await still(page, id!);
  s = await mouseAt(2);
  must(s.hover === id && s.cursor === "attack", "перед проверкой кадра подсветки нет: " + JSON.stringify(s));
  const scroll = (dx: number) => page.evaluate(`(() => { const c = ${scene}.cameras.main; if (${dx} > 0) c.stopFollow(); c.scrollX += ${dx}; })()`);
  await scroll(80);
  await sleep(150);
  const gone = await snap(page, id!);
  must(gone.hover === null && gone.cursor === "arrow" && !gone.ring.vis, "камера уехала, а подсветка и меч остались: " + JSON.stringify(gone));
  await scroll(-80);
  await sleep(150);
  const back = await snap(page, id!);
  // слизень бродит: ждём то, что даёт его живое расстояние до неподвижной мыши (у границ зон — пропуск)
  if (edge.some((e) => Math.abs(back.d - e) < 1.5) || back.d > R + mag - 1.5) console.log(`  skip [зум ${zoom}] возврат камеры: слизень ушёл от мыши (d=${back.d.toFixed(1)})`);
  else must((back.hover === id) && back.cursor === (back.d < R + tol ? "attack" : "arrow") && back.ring.vis, "камера вернулась, а подсветка и курсор не вернулись: " + JSON.stringify(back));
  ok("мышь стоит, камера едет: подсветка и меч снимаются и возвращаются сами, без движения мыши");

  // клики по тому же порядку (pickOrder): ЛКМ только выбирает (в допуске и магнитом), ЛКМ по земле молчит, ПКМ мимо ведёт героя, ПКМ в допуске атакует
  const click = async (dx: number, button: "left" | "right") => {
    await still(page, id!);
    const m = await snap(page, id!), c = await toClient(page, m.x + ux * dx, m.y - 12 + uy * dx);
    await clear();
    await page.mouse.click(c.x, c.y, { button });
    await sleep(250);
    return m;
  };
  const msgs = async () => ({ target: await sent("target"), attack: await sent("attack"), moveTo: await sent("moveTo") });
  await click(2, "left");
  let m = await msgs();
  must(m.target.length === 1 && m.target[0].id === id && !m.attack.length && !m.moveTo.length, "ЛКМ по слизню: ждали только target: " + JSON.stringify(m));
  must(await page.evaluate(`${scene}.targetId`) === id, "слизень не выбран");
  s = await snap(page, id!);
  must(s.ring.vis && Math.abs(s.ring.alpha - 0.7) < 1e-6 && s.ring.fill && s.ring.tint === 0xff3030, "кольцо выбранного не красное 0,7 заливкой цвета палитры: " + JSON.stringify(s.ring));
  await clip(`hover-selected-z${zoom}.png`);
  ok("ЛКМ по слизню: только выбор (target), кольцо выбора ярче кольца наведения");
  await page.evaluate(`${scene}.setTarget(null)`);
  const dMid = (R + tol + R + mag) / 2; // между «точно» и магнитом: ЛКМ магнитом выбирает, ПКМ только допуск
  await click(dMid, "left");
  m = await msgs();
  must(m.target.length === 1 && m.target[0].id === id && !m.attack.length && !m.moveTo.length, "ЛКМ в магните: ждали target: " + JSON.stringify(m));
  await page.evaluate(`${scene}.setTarget(null)`);
  await click(R + mag + 40, "left");
  m = await msgs();
  must(!m.target.length && !m.attack.length && !m.moveTo.length, "ЛКМ по земле в «Экшене» что-то отправил: " + JSON.stringify(m));
  ok("ЛКМ в магните выбирает, ЛКМ по земле — ничего");
  await click(dMid, "right");
  m = await msgs();
  must(m.moveTo.length === 1 && !m.attack.length && !m.target.length, "ПКМ вне допуска: ждали moveTo: " + JSON.stringify(m));
  await sleep(1500); // герой дошёл
  await still(page, id!);
  await click(2, "right");
  m = await msgs();
  must(m.attack.length === 1 && m.attack[0].id === id && !m.moveTo.length, "ПКМ по слизню: ждали attack: " + JSON.stringify(m));
  ok("ПКМ вне допуска ведёт героя (moveTo), ПКМ по слизню атакует (attack)");
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
    // свежий сервер на каждый зум: прогон кончается атакой на слизня, раненый слизень показывал бы полоску и без наведения
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
  console.log("hover-screens: готово, снимки в " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
