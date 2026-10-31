/**
 * Показ «Оболочек» перековки: снимки сумки, подсказок, окна Перековщика, примерки → tools/out/shell-show/, монтаж shells.png.
 * Замок tools/out/scenario.lock3, приоритет ниже обычного.  $env:TEST_PORT="2978"; $env:VITE_TEST_PORT="5378"; npx tsx tools/shell-show.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { PNG } from "pngjs";
import { ensureChar, sleep, startServer, stopServer, PORT } from "../tests/harness";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { REFORGER } from "../shared/transmog";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5378, OUT = path.resolve("tools/out/shell-show"), LOCK = path.resolve("tools/out/scenario.lock3");
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
const log = (s: string) => { console.log(s); try { fs.appendFileSync(path.resolve("tools/out/shell-show.log"), s + String.fromCharCode(10)); } catch {} };
const errors: string[] = [];
const files: string[] = [];

async function newPage(browser: Browser) {
  const p = await browser.newPage();
  p.setDefaultNavigationTimeout(300000); p.setDefaultTimeout(180000);
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  p.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  await p.setViewport({ width: 1366, height: 768 });
  await p.evaluateOnNewDocument(`try { localStorage.setItem("shadowMode", "dynamic"); } catch {}
    (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; let ph = -1, off = 0; window.__phase = 0.3;
      Date.now = () => { const t = n0(); if (window.__phase !== ph) { ph = window.__phase; off = ((ph * C - (t % C)) + C) % C; } return t + off; }; })();`);
  return p;
}
async function login(page: Page, name: string, cls: string) {
  const token = await ensureChar("shell" + Date.now().toString(36).slice(-6), "secret", name, cls);
  for (let k = 0; ; k++) {
    try {
      log("goto"); await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "load" });
      await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); }, token);
      log("reload"); await page.reload({ waitUntil: "load" });
      await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 30000 });
      await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      log("play"); await page.click('.cs-list [data-a="play"]');
      await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 120000, polling: 500 });
      await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 120000, polling: 500 });
      await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 60000, polling: 500 });
      await sleep(2000); log("вход ок");
      return;
    } catch (e) { if (k >= 2) throw e; log(`повтор входа: ${String((e as Error).message).slice(0, 80)}`); }
  }
}
const dbg = (page: Page, m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
const ev = <T>(p: Page, s: string) => p.evaluate(s) as Promise<T>;
const keep = (id: string) => { files.push(id); log("снят " + id); return path.join(OUT, id + ".png") as `${string}.png`; };
const full = async (p: Page, id: string) => { await p.screenshot({ path: keep(id) }); };
async function elShot(p: Page, sel: string, id: string, pad = 6) {
  const el = await p.$(sel); if (!el) { log("нет элемента " + sel); return false; }
  const b = await el.boundingBox(); if (!b) return false;
  await p.screenshot({ path: keep(id), clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(1366, b.width + pad * 2), height: Math.min(768, b.height + pad * 2) } });
  return true;
}
const clipHero = async (p: Page, id: string, W = 260, H = 240) => p.screenshot({ path: keep(id), clip: { x: 683 - W / 2, y: 384 - H / 2 - 30, width: W, height: H } });

/** Что выдаём: донор → оболочка. */
const DONORS: { base: string; ilvl: number; r: number; unique?: string; tag: string }[] = [
  { base: "sword", ilvl: 20, r: 0, tag: "sword-common" },
  { base: "greatsword", ilvl: 40, r: 2, tag: "greatsword-epic" },
  { base: "hb147_chaos_weapon", ilvl: 100, r: 3, tag: "chaos-blade-legendary" },
  { base: "dagger", ilvl: 30, r: 1, tag: "dagger-rare" },
  { base: "axe", ilvl: 30, r: 2, tag: "axe-epic" },
  { base: "greataxe", ilvl: 50, r: 3, tag: "greataxe-legendary" },
  { base: "staff", ilvl: 31, r: 3, unique: "cinder_staff", tag: "staff-unique-cinder" },
  { base: "bow", ilvl: 30, r: 1, tag: "bow-rare" },
  { base: "plate_armor", ilvl: 60, r: 3, tag: "plate-armor-legendary" },
  { base: "cloth_helm", ilvl: 40, r: 2, tag: "cloth-helm-epic" },
];

async function inv(p: Page) { return ev<any[]>(p, `window.__net.self.inventory.map((it, i) => it ? { i, base: it.base, name: it.name, rarity: it.rarity, ap: it.appearance ? it.appearance.base + "/" + it.appearance.rarity + "/" + it.appearance.name : null } : null).filter(Boolean)`); }

async function run(browser: Browser) {
  const A = await newPage(browser);
  await login(A, "Оболочка", "warrior");
  await dbg(A, { op: "god" }); await dbg(A, { op: "level", v: 100 }); await dbg(A, { op: "gold", v: 2000000 });
  await sleep(500);
  await dbg(A, { op: "tp", x: REFORGER.x, y: REFORGER.y + 24 }); await dbg(A, { op: "calm" });
  await sleep(1500);
  await ev(A, `window.__game.scene.getScene("game").cameras.main.setZoom(2)`);
  // 1) выдача доноров, снятие оболочек; рядом оставляем настоящие вещи тех же видов (для сравнения)
  const REAL = [{ base: "sword", ilvl: 20, r: 0 }, { base: "greatsword", ilvl: 40, r: 2 }, { base: "plate_armor", ilvl: 60, r: 3 }];
  const before = await inv(A);
  const startIdx = new Set(before.map((q: any) => q.i));
  for (const d of DONORS) { await dbg(A, d.unique ? { op: "item", unique: d.unique } : { op: "item", base: d.base, ilvl: d.ilvl, rarity: d.r }); await sleep(150); }
  for (const d of REAL) { await dbg(A, { op: "item", base: d.base, ilvl: d.ilvl, rarity: d.r }); await sleep(150); }
  await dbg(A, { op: "item", base: "greatsword", ilvl: 40, rarity: 1 }); // донор для вкладки «Снять»
  await sleep(800);
  const got = (await inv(A)).filter((q: any) => !startIdx.has(q.i));
  log("выдано: " + got.map((q: any) => `${q.i}:${q.base}/${q.rarity}`).join(" "));
  // индексы доноров = первые len(DONORS) новых вещей по порядку выдачи
  const donorIdx = got.slice(0, DONORS.length).map((q: any) => q.i);
  const realIdx = got.slice(DONORS.length, DONORS.length + REAL.length).map((q: any) => q.i);
  const spareIdx = got[DONORS.length + REAL.length]?.i;
  for (let k = 0; k < DONORS.length; k++) {
    const i = donorIdx[k];
    await ev(A, `window.__net.send("tm:extract", { index: ${i} })`);
    await A.waitForFunction(`window.__net.self.inventory[${i}] && window.__net.self.inventory[${i}].base === "tm_shell"`, { timeout: 8000, polling: 200 }).catch(() => log("НЕ снялась: " + DONORS[k].tag));
    await sleep(300);
  }
  const after = await inv(A);
  log("после снятия: " + after.filter((q: any) => donorIdx.includes(q.i) || realIdx.includes(q.i)).map((q: any) => `${q.i}:${q.base}[${q.name}]ap=${q.ap}`).join(" | "));
  log("золото: " + await ev(A, `window.__net.self.gold`));

  // 2) сумка: окно целиком и подсказки
  const hud = `window.__game.registry.get("hud")`;
  await ev(A, `${hud}.toggle('inv')`); await sleep(800);
  await A.mouse.move(5, 5);
  await elShot(A, ".win-inv", "bag");
  const cellSel = (i: number) => `.win-inv .grid .cell:nth-child(${i + 1})`;
  const hoverShot = async (i: number, id: string) => {
    const c = await A.$(cellSel(i)); if (!c) { log("нет ячейки " + i); return; }
    await c.hover(); await sleep(500);
    const ok = await elShot(A, ".tip:not([hidden])", id);
    if (!ok) log("нет подсказки " + id);
  };
  for (let k = 0; k < DONORS.length; k++) await hoverShot(donorIdx[k], `tip_shell_${DONORS[k].tag}`);
  for (let k = 0; k < REAL.length; k++) await hoverShot(realIdx[k], `tip_real_${REAL[k].base}`);
  // сумка крупно: оболочки и настоящие вещи рядом (ячейки)
  const rects = await ev<any>(A, `(() => { const g = [...document.querySelectorAll(".win-inv .grid .cell")]; const idx = ${JSON.stringify([...donorIdx, ...realIdx])}; const r = idx.map((i) => g[i].getBoundingClientRect()); return { x0: Math.min(...r.map((q) => q.left)), y0: Math.min(...r.map((q) => q.top)), x1: Math.max(...r.map((q) => q.right)), y1: Math.max(...r.map((q) => q.bottom)) }; })()`);
  await A.mouse.move(5, 5); await sleep(300);
  await A.screenshot({ path: keep("bag_cells"), clip: { x: rects.x0 - 8, y: rects.y0 - 8, width: rects.x1 - rects.x0 + 16, height: rects.y1 - rects.y0 + 16 } });
  // ПКМ-меню оболочки
  const sc = await A.$(cellSel(donorIdx[2]));
  if (sc) { const b = (await sc.boundingBox())!; await A.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: "right" }); await sleep(400); await full(A, "ctx_menu"); await A.keyboard.press("Escape"); await sleep(200); }
  await ev(A, `${hud}.toggle('inv')`); await sleep(300);

  // 3) окно Перековщика
  await ev(A, `${hud}.transmog.open(${JSON.stringify(REFORGER.id)})`); await sleep(800);
  const win = ".win-tm";
  await elShot(A, win, "tm_extract_empty");
  const spareCell = `${win} .cells .cell:nth-child(${1})`;
  // выбрать донора: двуручный меч редкий (spare)
  const pick = await A.$$(`${win} .cells .cell`);
  log("ячеек в «Снять»: " + pick.length);
  await pick[Math.min(pick.length - 1, 0)]?.click(); await sleep(600);
  await elShot(A, win, "tm_extract_pick1");
  // донор — легендарный двуручный (последний по списку доноров)? выберем по заголовку
  const titles = await A.$$eval(`${win} .cells .cell`, (cs) => cs.map((c) => (c as HTMLElement).title));
  log("донорские ячейки: " + titles.join(" | "));
  const pickByName = async (part: string) => { const i = titles.findIndex((t) => t.includes(part)); if (i >= 0) { await (await A.$$(`${win} .cells .cell`))[i].click(); await sleep(600); } return i; };
  if ((await pickByName("Двуручный")) >= 0) await elShot(A, win, "tm_extract_greatsword");
  await pickByName("Нагрудник"); await elShot(A, win, "tm_extract_plate");
  await A.click("#tm-tab-apply"); await sleep(600);
  await elShot(A, win, "tm_apply_empty");
  // выбрать оболочку «Пылающий клинок»: ищем среди ячеек по title
  const clickCellTitle = async (section: number, part: string) => {
    const cells = await A.$$(`${win} section.sec:nth-of-type(${section}) .cells .cell`);
    for (const c of cells) { const t = await c.evaluate((e) => (e as HTMLElement).title); if (t.includes(part)) { await c.click(); await sleep(600); return true; } }
    return false;
  };
  const shellTitles = await A.$$eval(`${win} .cells .cell`, (cs) => cs.map((c) => (c as HTMLElement).title));
  log("оболочки/цели в «Наложить»: " + shellTitles.join(" | "));
  // экипируем двуручник и одноручник для наложения
  await dbg(A, { op: "gear", slots: { weapon: { base: "greatsword", r: 1 } } }); await sleep(800);
  await clickCellTitle(1, "Пылающий");
  await sleep(300);
  const tgt = await A.$$(`${win} section.sec .cells`);
  log("групп ячеек: " + tgt.length);
  const t2 = await A.$$(`${win} section.sec:nth-of-type(2) .cells .cell`);
  if (t2.length) { await t2[0].click(); await sleep(700); }
  await elShot(A, win, "tm_apply_chaos_on_greatsword");
  // оболочка меча на одноручник
  await dbg(A, { op: "gear", slots: { weapon: { base: "axe", r: 2 } } }); await sleep(800);
  await A.click("#tm-tab-extract"); await A.click("#tm-tab-apply"); await sleep(500);
  const ss = await A.$$(`${win} section.sec:nth-of-type(1) .cells .cell`);
  for (const c of ss) { const t = await c.evaluate((e) => (e as HTMLElement).title); if (/Меч$|Меч\b/.test(t) && !t.includes("Двуруч") && !t.includes("клинок")) { await c.click(); break; } }
  await sleep(400);
  const t3 = await A.$$(`${win} section.sec:nth-of-type(2) .cells .cell`);
  if (t3.length) { await t3[0].click(); await sleep(700); }
  await elShot(A, win, "tm_apply_sword_on_axe");
  await full(A, "tm_full_scene");
  await ev(A, `${hud}.transmog.close()`); await sleep(300);

  // 4) примерка ПКМ на герое: обычный и герой Б
  const tryOn = async (tag: string, slots: Record<string, unknown>, shellIdx: number) => {
    await dbg(A, { op: "gear", slots }); await sleep(900);
    await ev(A, `${hud}.toggle('inv')`); await sleep(500);
    const c = await A.$(cellSel(shellIdx)); if (!c) { log("нет ячейки для примерки"); await ev(A, `${hud}.toggle('inv')`); return; }
    await c.evaluate((e) => e.scrollIntoView({ block: "center" }));
    const b = (await c.boundingBox())!;
    await A.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { button: "right" }); await sleep(400);
    const items = await A.$$(".ctx button, .ctx-menu button, .menu button, [role=menu] button, .ctx div, .ctx li");
    let hit = false;
    for (const it of items) { const t = await it.evaluate((e) => (e as HTMLElement).textContent || ""); if (t.includes("Примерить")) { await it.click(); hit = true; break; } }
    if (!hit) log("пункт «Примерить» не найден: " + tag);
    await sleep(300);
    await ev(A, `${hud}.toggle('inv')`); await sleep(1200);
    await A.mouse.move(5, 5);
    return hit;
  };
  const CASES: { tag: string; slots: Record<string, unknown>; shell: number }[] = [
    { tag: "sword-on-axe", slots: { weapon: { base: "axe", r: 1 } }, shell: donorIdx[0] },
    { tag: "chaos-blade-on-greatsword", slots: { weapon: { base: "greatsword", r: 1 } }, shell: donorIdx[2] },
    { tag: "dagger-on-twinblades", slots: { weapon: { base: "twinblades", r: 1 } }, shell: donorIdx[3] },
    { tag: "plate-armor-on-plate", slots: { weapon: { base: "sword", r: 1 }, armor: { base: "plate_armor", r: 1 } }, shell: donorIdx[8] },
  ];
  // герой в удобном месте и без помех
  await ev(A, `window.__phase = 0.3; window.__game.scene.getScene("game").cameras.main.setZoom(3);`);
  for (const mode of ["normal", "heroB"]) {
    if (mode === "heroB") { log(await ev<string>(A, `window.heroB.self()`)); await sleep(4000); }
    for (const c of CASES) {
      // базовый снимок «без примерки»
      await dbg(A, { op: "gear", slots: c.slots }); await sleep(1800);
      await clipHero(A, `try_${mode}_${c.tag}_0before`);
      const ok = await tryOn(c.tag, c.slots, c.shell);
      await sleep(600);
      await clipHero(A, `try_${mode}_${c.tag}_1after`);
      if (mode === "normal" && c.tag === "chaos-blade-on-greatsword") {
        await ev(A, `window.__game.scene.getScene("game").cameras.main.setZoom(2); window.__phase = 0.83;`); await sleep(1500);
        await clipHero(A, `try_normal_${c.tag}_z2_night`, 200, 180);
        await ev(A, `window.__game.scene.getScene("game").cameras.main.setZoom(3); window.__phase = 0.3;`); await sleep(800);
      }
      void ok;
      await sleep(10500); // примерка истекла
    }
  }
  await full(A, "final_scene");
  await A.close();
}

function montage() {
  const read = (id: string) => PNG.sync.read(fs.readFileSync(path.join(OUT, id + ".png")));
  const W = 2400, PAD = 14;
  const imgs = files.filter((f) => f !== "tm_full_scene" && f !== "final_scene" && !f.endsWith("_0before")).map((f) => ({ id: f, im: read(f) }));
  // раскладка по рядам
  let x = PAD, y = PAD, rowH = 0; const pos: { x: number; y: number; im: PNG }[] = [];
  for (const { im } of imgs) {
    if (x + im.width + PAD > W) { x = PAD; y += rowH + PAD; rowH = 0; }
    pos.push({ x, y, im }); x += im.width + PAD; rowH = Math.max(rowH, im.height);
  }
  const H = y + rowH + PAD, out = new PNG({ width: W, height: H });
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 24; out.data[i + 1] = 22; out.data[i + 2] = 28; out.data[i + 3] = 255; }
  for (const p of pos) PNG.bitblt(p.im, out, 0, 0, p.im.width, p.im.height, p.x, p.y);
  fs.writeFileSync(path.join(OUT, "shells.png"), PNG.sync.write(out));
  log("порядок монтажа: " + imgs.map((i) => i.id).join(", "));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (let k = 0; ; k++) { try { fs.mkdirSync(LOCK); break; } catch { if (k % 12 === 0) log("жду замок scenario.lock3…"); if (k > 720) throw new Error("замок"); await sleep(5000); } }
  try {
    fs.writeFileSync(path.join(LOCK, "owner"), `shell-show ${process.pid} ${new Date().toISOString()}\n`);
    try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* ok */ }
    process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
    const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
    await vite.listen();
    await startServer(true);
    try {
      const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 600000 });
      try { await run(browser); } finally { await browser.close(); }
    } finally { await vite.close(); await stopServer(); }
  } finally { fs.rmSync(LOCK, { recursive: true, force: true }); }
  montage();
  if (errors.length) log(`ошибки страницы (${errors.length}):\n` + [...new Set(errors)].slice(0, 12).join("\n"));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
