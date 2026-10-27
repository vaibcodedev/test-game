/**
 * «Знамёна Предела» в игре (задача 132, шаг 14): битва на центральном фронте (отладка dbg war start), герой Сольгарда и союзники
 * поднимают знамя на Западной заставе. Снимки: основание до захвата, во время подъёма (знамя на середине мачты, кольцо прогресса),
 * после захвата (знамя наверху, круг в цвете владельца, печать); полоса битвы со счётом и окно итогов. Сервер в этом же процессе, Vite и Chrome.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2856"; $env:VITE_TEST_PORT="5256"; npx tsx tests/banners-event-ingame.ts
 * Выход — tools/out/banners-event/: base-before.png, base-during.png, base-after.png, score-bar.png, result.png, screen.png, report.json.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import { warBase } from "../shared/bannerWar";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5256;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/banners-event");
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
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm", dbFile.replace(/\.sqlite$/, "") + "-war.json"]) fs.rmSync(f, { force: true });
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
  await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 60000, polling: 500 });
  await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 60000, polling: 500 });
  await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 120000, polling: 500 });
  await sleep(1500);
}

/** Кадр мира w×h px вокруг (cx, cy) из холста. */
async function snap(cx: number, cy: number, w: number, h: number, zoom = 0): Promise<PNG> {
  const c = await run<{ url: string; x: number; y: number; z: number }>(`
    const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    cam.stopFollow(); if (a.zoom) cam.setZoom(a.zoom); cam.centerOn(a.cx, a.cy);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const k = cv.width / g.scale.width;
    return { url: cv.toDataURL('image/png'), x: (a.cx - cam.worldView.x) * cam.zoom * k, y: (a.cy - cam.worldView.y) * cam.zoom * k, z: cam.zoom * k };`, { cx, cy, zoom });
  const src = PNG.sync.read(Buffer.from(c.url.split(",")[1], "base64"));
  const ww = Math.min(Math.round(w * c.z), src.width), hh = Math.min(Math.round(h * c.z), src.height);
  const x0 = Math.max(0, Math.min(src.width - ww, Math.round(c.x - ww / 2))), y0 = Math.max(0, Math.min(src.height - hh, Math.round(c.y - hh / 2)));
  const out = new PNG({ width: ww, height: hh });
  PNG.bitblt(src, out, x0, y0, ww, hh, 0, 0);
  return out;
}
const save = (name: string, p: PNG) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), PNG.sync.write(p)); };
const shotEl = async (sel: string, name: string) => {
  const el = await page.$(sel);
  if (!el) return false;
  await el.screenshot({ path: path.join(OUT, name) });
  return true;
};
const waitFor = async (ok: () => boolean, ms: number) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await sleep(100); return ok(); };

async function scenario() {
  for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (!f.startsWith("v2-")) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("war_view", PASS, "Знаменосец", "warrior");
  const w = W(), war = w.war!;
  war.debug("reset", {});
  // мобы и отряды у основания не мешают
  const base = warBase("center_w")!;
  for (const m of [...w.mobs.values()]) if (!m.faction && Math.hypot(m.x - base.x, m.y - base.y) < 1600) w.removeMob(m);
  w.soldiers!.squadAt.solgard = w.soldiers!.squadAt.umbrath = 1e15;
  await enter("Знаменосец", token, 2);
  const H = heroOf("Знаменосец");
  H.save.level = 90;
  H.selfDirty = true;
  // союзники Сольгарда (в памяти сервера, без клиента): перевес +4 — подъём быстрее
  const { Player: PlayerCls, newSave } = await import("../server/src/game/Player");
  const allies: Player[] = [];
  for (const [i, cls] of (["healer", "ranger", "mage"] as const).entries()) {
    const s = newSave(cls, { x: base.x, y: base.y });
    s.level = 90; s.faction = "solgard";
    const p = new PlayerCls(`ally${i}`, `Соратник${i + 1}`, s, () => {});
    w.addPlayer(p);
    allies.push(p);
  }
  let at = { x: base.x - 330, y: base.y + 60 };
  const allyAt = (inside: boolean, i: number) => (inside ? { x: base.x - 70 + i * 60, y: base.y + 70 + (i % 2) * 30 } : { x: base.x - 380 - i * 40, y: base.y + 120 });
  let inside = false;
  const keep = setInterval(() => {
    for (const p of [H, ...allies]) { if (p.dead) { p.dead = false; p.unit.anim = 0; } p.unit.hp = p.unit.maxHp; p.inputAt = w.time; p.moveTo = null; }
    H.unit.x = at.x; H.unit.y = at.y;
    allies.forEach((p, i) => { const q = allyAt(inside, i); p.unit.x = q.x; p.unit.y = q.y; });
  }, 50);
  try {
    war.debug("start", { front: "center" });
    await page.waitForFunction("window.__net && document.querySelector('.war-bar') && !document.querySelector('.war-bar').hidden", { timeout: 15000, polling: 250 });
    await sleep(2500);
    // 1. до захвата: пустое основание, нейтральный круг
    save("base-before.png", await snap(base.x, base.y - 40, 420, 300));
    check(!war.bases.get("center_w")!.banner, "основание пустое до захвата");
    // 2. подъём: герой и союзники в круге
    at = { x: base.x + 50, y: base.y + 40 };
    inside = true;
    const mid = await waitFor(() => (war.bases.get("center_w")!.h ?? 0) >= 0.5, 60000);
    await sleep(700);
    check(mid, `знамя поднимается (высота ${war.bases.get("center_w")!.h.toFixed(2)})`);
    save("base-during.png", await snap(base.x, base.y - 40, 420, 300));
    const cli = await run<{ h: number; b: string }>(`const b = (await import('/src/ui/bannerWar.ts')).warView.byId.get('center_w'); return { h: b ? b.h : -1, b: b ? b.b : '' };`);
    check(cli.b === "solgard" && cli.h > 0.3, `клиент видит знамя Сольгарда на мачте (h ${cli.h})`);
    // 3. захват
    const took = await waitFor(() => war.bases.get("center_w")!.owner === "solgard", 60000);
    await sleep(1500);
    check(took, "Западная застава взята Сольгардом, печать");
    save("base-after.png", await snap(base.x, base.y - 40, 420, 300));
    // полоса битвы — подождать очков
    await sleep(11000);
    check(await shotEl(".war-bar", "score-bar.png"), "полоса битвы: фронт, таймер, счёт, основания");
    const barText = await page.$eval(".war-bar", (e) => e.textContent ?? "");
    check(/Центральный фронт/.test(barText) && war.score[0] > 0, `счёт Сольгарда ${war.score[0]} : ${war.score[1]}`);
    // полный экран — с мини-картой
    await run(`sc.cameras.main.startFollow(sc.units.get(net.id).sprite ?? sc.units.get(net.id), true); return 0;`).catch(() => 0);
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, "screen.png") });
    // 4. итоги
    war.debug("end", {});
    await page.waitForSelector(".war-result", { timeout: 10000 });
    await sleep(800);
    check(await shotEl(".war-result", "result.png"), "окно итогов битвы");
    const res = await page.$eval(".war-result", (e) => e.textContent ?? "");
    check(/Победа/.test(res) && (H.save.marks ?? 0) > 0, `итог: победа, Знаки Полей +${H.save.marks ?? 0}`);
  } finally {
    clearInterval(keep);
  }
}

/**
 * v2 (--v2; отзыв пользователя: «захват красивый, круги больше, много игроков»): ничьё основание, толпа 18 героев поднимает знамя,
 * спор 6 на 6, миг захвата (луч, вспышка, волна), карта мира со всеми основаниями и подсказкой; замер FPS с 30 героями в круге.
 * Выход — tools/out/banners-event/v2-neutral.png, v2-crowd.png, v2-contest.png, v2-capture.png, v2-map.png, v2-report.json.
 */
async function scenarioV2() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/^v[234]-(neutral|crowd|contest|capture|map.png|centre|minimap)/.test(f) && f.endsWith(".png")) fs.rmSync(path.join(OUT, f));
  const token = await ensureChar("war_view", PASS, "Знаменосец", "warrior");
  const w = W(), war = w.war!;
  war.debug("reset", {});
  const base = warBase("center_w")!;
  for (const m of [...w.mobs.values()]) if (!m.faction && Math.hypot(m.x - base.x, m.y - base.y) < 2400) w.removeMob(m);
  w.soldiers!.squadAt.solgard = w.soldiers!.squadAt.umbrath = 1e15;
  await enter("Знаменосец", token, 1);
  const H = heroOf("Знаменосец");
  H.save.level = 90; H.selfDirty = true;
  const { Player: PlayerCls, newSave } = await import("../server/src/game/Player");
  const SOLC = ["warrior", "healer", "ranger", "mage", "rogue"] as const, UMBC = ["deathknight", "bloodweaver", "darkranger", "warlock", "reaver"] as const;
  const mk = (f: "solgard" | "umbrath", i: number) => {
    const s = newSave((f === "solgard" ? SOLC : UMBC)[i % 5], { x: base.x, y: base.y });
    s.level = 90; s.faction = f;
    const p = new PlayerCls(`${f}${i}`, `${f === "solgard" ? "Соратник" : "Враг"}${i + 1}`, s, () => {});
    w.addPlayer(p);
    return p;
  };
  const sol = Array.from({ length: 29 }, (_, i) => mk("solgard", i)), umb = Array.from({ length: 6 }, (_, i) => mk("umbrath", i));
  const inside = new Set<Player>();
  const spot = (i: number, n: number) => { const a = (i / n) * Math.PI * 2 + 0.3, r = 150 + (i % 3) * 90; return { x: base.x + Math.cos(a) * r, y: base.y + 40 + Math.sin(a) * r * 0.8 }; };
  const keep = setInterval(() => {
    const all = [H, ...sol, ...umb];
    all.forEach((p) => { if (p.dead) { p.dead = false; p.unit.anim = 0; } p.unit.hp = p.unit.maxHp; p.inputAt = w.time; p.moveTo = null; p.targetId = null; });
    const ins = all.filter((p) => inside.has(p) && p !== H);
    ins.forEach((p, i) => { const q = spot(i, ins.length); p.unit.x = q.x; p.unit.y = q.y; });
    if (inside.has(H)) { H.unit.x = base.x + 40; H.unit.y = base.y + 120; }
    all.filter((p) => !inside.has(p)).forEach((p, i) => { p.unit.x = base.x - 1400 - (i % 6) * 40; p.unit.y = base.y + 600 + Math.floor(i / 6) * 40; });
  }, 50);
  // общий план (zoom 1: весь круг) и крупно (zoom 2, как в игре)
  const shoot = async (name: string) => { save(name, await snap(base.x, base.y + 10, 1240, 780, 1)); save(name.replace(".png", "-close.png"), await snap(base.x, base.y - 40, 600, 380, 2)); };
  try {
    war.debug("start", { front: "center" });
    await page.waitForFunction("document.querySelector('.war-bar') && !document.querySelector('.war-bar').hidden", { timeout: 20000, polling: 250 });
    await sleep(3500);
    await shoot("v2-neutral.png");
    check(!war.bases.get("center_w")!.banner, "ничьё основание: снимок");
    inside.add(H); sol.slice(0, 17).forEach((p) => inside.add(p));
    const mid = await waitFor(() => war.bases.get("center_w")!.h >= 0.45, 60000);
    await sleep(600);
    await shoot("v2-crowd.png");
    check(mid, `толпа 18 героев поднимает знамя (h ${war.bases.get("center_w")!.h.toFixed(2)})`);
    sol.slice(5, 17).forEach((p) => inside.delete(p));
    umb.forEach((p) => inside.add(p));
    await sleep(2500);
    const h0 = war.bases.get("center_w")!.h;
    await sleep(1500);
    await shoot("v2-contest.png");
    check(war.view().bases.find((b) => b.id === "center_w")!.c && Math.abs(war.bases.get("center_w")!.h - h0) < 0.005, "спор 6 на 6: знамя стоит, дуга мерцает двумя цветами");
    umb.forEach((p) => inside.delete(p));
    sol.slice(0, 17).forEach((p) => inside.add(p));
    const shot = await run<{ url: string; x: number; y: number; z: number }>(`
      const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
      cam.stopFollow(); cam.setZoom(1); cam.centerOn(a.cx, a.cy);
      const mod = await import('/src/ui/bannerWar.ts');
      const t0 = performance.now();
      while (performance.now() - t0 < 60000) { const b = mod.warView.byId.get('center_w'); if (b && b.o === 'solgard') break; await new Promise((r) => setTimeout(r, 30)); }
      await new Promise((r) => setTimeout(r, 330));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const k = cv.width / g.scale.width;
      return { url: cv.toDataURL('image/png'), x: (a.cx - cam.worldView.x) * cam.zoom * k, y: (a.cy - cam.worldView.y) * cam.zoom * k, z: cam.zoom * k };`, { cx: base.x, cy: base.y + 10 });
    {
      const src = PNG.sync.read(Buffer.from(shot.url.split(",")[1], "base64"));
      const ww = Math.min(Math.round(1240 * shot.z), src.width), hh = Math.min(Math.round(780 * shot.z), src.height);
      const x0 = Math.max(0, Math.min(src.width - ww, Math.round(shot.x - ww / 2))), y0 = Math.max(0, Math.min(src.height - hh, Math.round(shot.y - hh / 2)));
      const out = new PNG({ width: ww, height: hh }); PNG.bitblt(src, out, x0, y0, ww, hh, 0, 0); save("v2-capture.png", out);
    }
    check(war.bases.get("center_w")!.owner === "solgard", "миг захвата: снимок");
    // v3: постамент по центру кольца — крупно (zoom 2) и общим планом (zoom 1), после вспышки
    await sleep(2500);
    save("v4-centre.png", await snap(base.x, base.y - 20, 560, 400, 2));
    save("v4-centre-wide.png", await snap(base.x, base.y, 1240, 780, 1));
    await run(`sc.cameras.main.setZoom(2); sc.cameras.main.centerOn(a.x, a.y); return 0;`, { x: base.x, y: base.y });
    await sleep(800);
    const mini = await page.$(".hud-mini");
    if (mini) await mini.screenshot({ path: path.join(OUT, "v3-minimap.png") });
    sol.forEach((p) => inside.add(p));
    await sleep(2500);
    const fps = (cx: number, cy: number) => run<number>(`const cam = sc.cameras.main; cam.stopFollow(); cam.centerOn(a.cx, a.cy); await new Promise((r) => setTimeout(r, 1500)); let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else r(0); }; requestAnimationFrame(f); }); return n / ((performance.now() - t0) / 1000);`, { cx, cy });
    await run(`sc.cameras.main.setZoom(2); return 0;`);
    const fBase = await fps(base.x, base.y);
    await run(`const bb = sc.bannerBases; sc.bannerBases = null; bb.destroy(); return 0;`);
    const fBare = await fps(base.x, base.y);
    check(fBase >= fBare * 0.75, `FPS (headless, swiftshader, zoom 2): 30 героев у основания со всеми эффектами ${fBase.toFixed(1)}, те же герои без основания ${fBare.toFixed(1)}`);
    for (const [id, f] of [["north_w", "solgard"], ["north_e", "umbrath"], ["south_h", "umbrath"], ["south_w", "umbrath"]] as const) war.debug("owner", { base: id, f });
    umb.forEach((p) => inside.add(p));
    await sleep(1500);
    await run(`window.__game.registry.get("hud").openWorldMap(); return 0;`);
    await sleep(1200);
    const hit = await run<{ x: number; y: number } | null>(`const v = window.__game.registry.get("hud").wmView; const h = v.hits.find((q) => q.title === "Западное знамя Центра"); if (!h) return null; const r = v.cv.getBoundingClientRect(); return { x: r.left + h.x, y: r.top + h.y };`);
    if (hit) { await page.mouse.move(hit.x, hit.y); await sleep(600); }
    await page.screenshot({ path: path.join(OUT, "v2-map.png") });
    check(!!hit, "карта мира: 9 оснований, подсказка у «Западное знамя Центра»");
  } finally {
    clearInterval(keep);
  }
}
const V2 = process.argv.includes("--v2");

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
    page = (await browser.pages())[0] ?? (await browser.newPage());
    await page.evaluateOnNewDocument(() => {
      (window as any).__name = (t: unknown) => t;
      window.addEventListener("unhandledrejection", (e) => console.error("unhandledrejection: " + String((e.reason && e.reason.stack) || e.reason)));
    });
    // v2: вид осады (шаг 15, client/src/game/siegeView.ts) соседнего агента сейчас роняет кадр — на время снимков знамён он выключен
    if (V2 && !process.argv.includes("--with-siege")) await page.evaluateOnNewDocument(() => {
      setInterval(() => { const sc = (window as any).__game?.scene?.getScene?.("game"); if (sc && sc.siegeView) { try { sc.siegeView.destroy?.(); } catch {} sc.siegeView = null; } }, 20);
    });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await (V2 ? scenarioV2() : scenario());
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|AnimationManager key already exists/i.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    try {
      await page.screenshot({ path: path.join(OUT, "fail.png") });
      lines.push(`DIAG ${JSON.stringify(await page.evaluate(`(() => { const g = window.__game; return { scenes: g ? g.scene.scenes.map((s) => s.sys.settings.key + ":" + s.sys.settings.status) : null, load: document.getElementById("loading")?.textContent?.slice(0, 200) ?? "", online: !!(window.__net && window.__net.online) }; })()`))}`);
    } catch {}
    lines.push(`EXC ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
    console.log(lines[lines.length - 1]);
    bad++;
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, V2 ? "v2-report.json" : "report.json"), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nЗнамёна Предела в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
