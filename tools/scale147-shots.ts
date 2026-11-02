/**
 * Задача 147, масштаб мира под героя Б: снимки в игре с флагом героя Б, включённым только в этом процессе (HERO_B=1 для сервера,
 * VITE_HERO_B=1 для клиента, heroB.on() в консоли; data/hero-b.json не меняется). Герой Б рядом с NPC (кузнец столицы, стража, горожане), скелетами, мобами зон 1–40
 * и 40–100, великанами, боссом стартовых земель, верхом; день и ночь, зум 2 и 3; наведение на моба (свечение = силуэт).
 * Сервер в этом процессе, Vite, Chrome без окна. Строго по одному: замок tools/out/scenario.lock* (свободный берётся сам).
 *   $env:TEST_PORT="2871"; $env:VITE_TEST_PORT="5271"; npx tsx tools/scale147-shots.ts → tools/out/scale147/check/
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep } from "../tests/harness";
import { DAY_CYCLE_MS } from "../shared/daynight";
import type { World } from "../server/src/game/World";
import type { Player } from "../server/src/game/Player";
import type { Mob } from "../server/src/game/Mob";


const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5271;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/scale147/check");
const SHOT = { w: 200, h: 120 };
const lines: string[] = [], errors: string[] = [];
let bad = 0, page: Page, W: () => World, heroOf: (n: string) => Player;
const check = (ok: boolean, m: string) => { lines.push(`${ok ? "ok  " : "FAIL"} ${m}`); if (!ok) bad++; console.log(lines[lines.length - 1]); };
const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;
const busy = (port: number) => new Promise<boolean>((res) => { const c = net.createConnection({ port, host: "127.0.0.1" }); c.once("connect", () => { c.destroy(); res(true); }); c.once("error", () => res(false)); });

// замок: первый свободный tools/out/scenario.lock, lock2..4 (каталог с pid)
let LOCK = "";
function takeLock() {
  for (const s of ["", "2", "3", "4"]) {
    const d = path.resolve(`tools/out/scenario.lock${s}`);
    try { fs.mkdirSync(d); fs.writeFileSync(path.join(d, "pid"), String(process.pid)); LOCK = d; return; } catch { /* занят */ }
  }
  throw new Error("все замки tools/out/scenario.lock* заняты");
}

async function startServer() {
  if (await busy(PORT)) throw new Error(`порт ${PORT} занят`);
  const { dbFile } = await import("../tests/harness");
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
  Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1", VITE_SERVER_URL: `ws://localhost:${PORT}` });
  await import("../server/src/index");
  const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
  W = () => WorldRoom.instance!.world;
  heroOf = (n) => W().findByName(n.toLowerCase())!;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch {} await sleep(150); }
  throw new Error("сервер не ответил");
}
async function enter(name: string, token: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v2", "2"); }, token);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 60000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 120000, polling: 250 });
  await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 120000, polling: 250 });
  await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 60000, polling: 250 });
  await sleep(2500);
}
/** Кадр холста вокруг точки мира (cx, cy) при зуме z. */
async function snap(cx: number, cy: number, z: number): Promise<PNG> {
  const c = await run<{ url: string; x: number; y: number; k: number }>(`
    const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    cam.stopFollow(); cam.setZoom(a.z); cam.centerOn(a.cx, a.cy);
    await new Promise((r) => setTimeout(r, 700));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const k = cv.width / g.scale.width;
    return { url: cv.toDataURL('image/png'), x: (a.cx - cam.worldView.x) * cam.zoom * k, y: (a.cy - cam.worldView.y) * cam.zoom * k, k: cam.zoom * k };`, { cx, cy, z });
  const src = PNG.sync.read(Buffer.from(c.url.split(",")[1], "base64"));
  const ww = Math.min(Math.round(SHOT.w * c.k), src.width), hh = Math.min(Math.round(SHOT.h * c.k), src.height);
  const x0 = Math.max(0, Math.min(src.width - ww, Math.round(c.x - ww / 2))), y0 = Math.max(0, Math.min(src.height - hh, Math.round(c.y - hh / 2)));
  const out = new PNG({ width: ww, height: hh });
  PNG.bitblt(src, out, x0, y0, ww, hh, 0, 0);
  return out;
}
const save = (tag: string, p: PNG) => { fs.writeFileSync(path.join(OUT, `${tag}.png`), PNG.sync.write(p)); console.log(`  снят ${tag}`); };
const hold = (p: Player, x: number, y: number) => { p.unit.x = x; p.unit.y = y; p.moveTo = null; p.unit.maxHp = p.unit.hp = 999999; p.dead = false; };

/** Четыре снимка точки: день / ночь × зум 2 / 3. */
async function four(tag: string, cx: number, cy: number) {
  for (const [ph, pn] of [[0.3, "day"], [0.83, "night"]] as const) {
    await page.evaluate((v: number) => { (window as any).__phase = v; }, ph);
    await sleep(1200);
    for (const z of [2, 3]) save(`${tag}_${pn}_z${z}`, await snap(cx, cy, z));
  }
  await page.evaluate(() => { (window as any).__phase = 0.3; });
}

async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("scale147_view", "secret", "Мерка", "warrior");
  await enter("Мерка", token);
  const H = heroOf("Мерка");
  check(!!(await run<string>("return window.heroB ? window.heroB.on() : ''")), "консоль героя Б: heroB.on()");
  // ждём лист героя Б (сведение асинхронно)
  for (let i = 0; i < 120; i++) { if (await run<boolean>("const v = sc.units.get(window.__net.id); return !!(v && v.hb)")) break; await sleep(500); }
  check(await run<boolean>("const v = sc.units.get(window.__net.id); return !!(v && v.hb)"), "свой герой — основа Б");

  // 1. NPC столицы: кузнец, рядом стража и горожане
  const { SMITHS } = await import("../shared/upgrade");
  const sm = SMITHS.find((s: any) => s.faction === H.faction) ?? SMITHS[0];
  let keep = setInterval(() => hold(H, sm.x + 26, sm.y + 18), 50);
  await sleep(3000);
  await four("npc_smith", sm.x + 10, sm.y);
  clearInterval(keep);

  // 2. мобы: скелет, гуманоиды 1–40, огр, гуманоид 40–100, великан 40–100; рядом с героем, наведение на моба
  const mobsAt = ["skeleton_sword", "boarfolk_axe", "ogre_woodcutter", "orc_axe", "golem_sandstone"];
  for (const id of mobsAt) {
    const find = () => [...W().mobs.values()].find((m) => m.def.id === id && !m.dead && !m.soldier) as Mob | undefined;
    let mob = find();
    for (let k = 0; !mob && k < 40; k++) { await sleep(500); mob = find(); }
    check(!!mob, `${id}: моб есть в мире`);
    if (!mob) continue;
    const bx = mob.home.x, by = mob.home.y;
    mob.state = "idle"; mob.unit.x = bx; mob.unit.y = by;
    keep = setInterval(() => { hold(H, bx + 30, by + 2); mob!.unit.x = bx; mob!.unit.y = by; mob!.targetId = ""; }, 50);
    await sleep(2500);
    const info = await run<{ sid: string; frame: number; afps: number; rise: number } | null>(
      "for (const v of sc.units.values()) if (v.u.sprite === a) { const k = v.sid + '-attack-0', an = sc.anims.get(k); return { sid: v.sid, frame: v.frame, afps: an ? an.frameRate : 0, rise: Math.round(v.y - v.label.y) }; } return null", mob.def.sprite);
    check(!!info && info.sid.endsWith("_b147"), `${id}: лист ${info?.sid} (кадр ${info?.frame}), атака ${info?.afps} к/с, ник на ${info?.rise} px над ступнями`);
    await four(`mob_${id}`, bx + 14, by - 14);
    // наведение: курсор на середину силуэта моба (зум 3)
    await run("const cam = sc.cameras.main; cam.stopFollow(); cam.setZoom(3); cam.centerOn(a.x, a.y);", { x: bx + 14, y: by - 14 });
    await sleep(500);
    const scr = await run<{ x: number; y: number }>("const cam = sc.cameras.main, r = sc.game.canvas.getBoundingClientRect(); return { x: r.left + (a.x - cam.worldView.x) * cam.zoom * r.width / sc.game.canvas.width * (sc.game.canvas.width / cam.width), y: r.top + (a.y - cam.worldView.y) * cam.zoom * r.height / sc.game.canvas.height * (sc.game.canvas.height / cam.height) };", { x: bx, y: by - 14 });
    await page.mouse.move(scr.x, scr.y);
    await sleep(900);
    const hov = await run<string>("for (const v of sc.units.values()) if (v.u.sprite === a) return String(!!(v.glowSpr && v.glowSpr.visible) || v.ring.visible); return 'нет'", mob.def.sprite);
    check(hov === "true", `${id}: наведение подсвечивает моба (${hov})`);
    save(`mob_${id}_hover_z3`, await snap(bx + 14, by - 14, 3));
    await page.mouse.move(5, 5);
    clearInterval(keep);
  }

  // 3. босс стартовых земель рядом с героем
  const boss = [...W().mobs.values()].find((m) => m.def.boss && !m.dead && !m.def.raid && !m.def.wboss) as Mob | undefined;
  check(!!boss, `босс стартовых земель: ${boss?.def.id}`);
  if (boss) {
    const bx = boss.home.x, by = boss.home.y;
    keep = setInterval(() => { hold(H, bx + 44, by + 4); boss.unit.x = bx; boss.unit.y = by; boss.targetId = ""; boss.state = "idle"; }, 50);
    await sleep(2500);
    await four(`boss_${boss.def.id}`, bx + 20, by - 24);
    clearInterval(keep);
  }

  // 4. верхом (седло под героя Б): конь и боевой конь
  for (const m of ["horse", "war_horse"]) {
    H.unit.mount = m; H.selfDirty = true;
    keep = setInterval(() => hold(H, sm.x + 60, sm.y + 80), 50);
    await sleep(3000);
    for (const z of [2, 3]) save(`ride_${m}_day_z${z}`, await snap(sm.x + 60, sm.y + 64, z));
    clearInterval(keep);
  }
  H.unit.mount = ""; H.selfDirty = true;
}

async function main() {
  takeLock();
  // флаг — только в этом процессе: сервер (shared/mobs.ts — HERO_B) и клиент (scale147.ts — VITE_HERO_B); data/hero-b.json не меняется
  process.env.HERO_B = "1"; process.env.VITE_HERO_B = "1";
  let browser: Browser | null = null, vite: Awaited<ReturnType<typeof createServer>> | null = null;
  try {
    await startServer();
    vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
    await vite.listen();
    const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => p && fs.existsSync(p))!;
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"], defaultViewport: { ...VIEW, deviceScaleFactor: 1 } });
    page = await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.evaluateOnNewDocument(`(window.__name = (t) => t);
      (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; let ph = -1, off = 0; window.__phase = 0.3;
        Date.now = () => { const t = n0(); if (window.__phase !== ph) { ph = window.__phase; off = ((ph * C - (t % C)) + C) % C; } return t + off; }; })();`);
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
    await scenario();
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|key already exists: (sol|umb|wb|plg)_/i.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    check(false, `EXC ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser?.close().catch(() => {});
    await vite?.close().catch(() => {});
    if (LOCK) fs.rmSync(LOCK, { recursive: true, force: true });
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nСнимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
