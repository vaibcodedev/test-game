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
  await page.evaluate((t: string, z: number) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v2", String(z)); }, token, zoom);
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
/** --rules: окно правил «Знамён Предела» — кнопка «?» на полосе битвы; снимок tools/out/banners-event/rules.png (окно целиком). */
async function scenarioRules() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("war_view", PASS, "Знаменосец", "warrior");
  const w = W();
  w.war!.debug("reset", {});
  await enter("Знаменосец", token, 2);
  w.war!.debug("start", { front: "center" });
  await page.waitForFunction("document.querySelector('.war-bar') && !document.querySelector('.war-bar').hidden", { timeout: 20000, polling: 250 });
  await sleep(1000);
  await page.$eval("[data-war-rules]", (b) => (b as HTMLElement).click()); // полоса перерисовывается раз в 0,5 с — щелчок мышью может попасть в снятый узел
  await page.waitForSelector(".win-help .war-rules", { timeout: 5000 });
  await sleep(800);
  // окно целиком: снять ограничение высоты на время снимка
  await page.evaluate(() => { const w = document.querySelector(".win-help") as HTMLElement; w.style.maxHeight = "none"; (w.querySelector(".body") as HTMLElement).style.overflow = "visible"; });
  await page.setViewport({ width: VIEW.width, height: 2200, deviceScaleFactor: 1 });
  await sleep(600);
  check(await page.$eval(".win-help", (w) => !(w as HTMLElement).hidden && w.querySelector("#help-tab-war")?.getAttribute("aria-selected") === "true"), "«?» на полосе открывает «Помощь» на вкладке «Знамёна Предела»");
  const el = await page.$(".win-help");
  if (el) await el.screenshot({ path: path.join(OUT, "rules.png") });
  const text = await page.$eval(".war-rules", (e) => e.textContent ?? "");
  check(!!el && /Идёт битва/.test(text) && /Осада/.test(text) && /Перемирие/.test(text) && /Свободно/.test(text), "окно правил: живая строка, все разделы, знаки карты");
  await page.setViewport({ width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 });
  await page.keyboard.press("Escape");
  await sleep(500);
  // бафы земли: раскладка владельцев на всех фронтах
  for (const [id, f] of [["north_w", "solgard"], ["north_h", "solgard"], ["center_e", "solgard"], ["south_w", "solgard"], ["north_e", "umbrath"], ["center_h", "umbrath"], ["south_e", "umbrath"], ["south_h", "umbrath"]] as const) w.war!.debug("owner", { base: id, f });
  const buffShot = async (name: string) => {
    await sleep(2500);
    const cell = await page.$('.auras .cell img[src*="war_"]');
    if (cell) { await cell.hover(); await sleep(500); }
    const box = await page.evaluate(() => {
      const r = [...document.querySelectorAll(".auras")].map((e) => e.getBoundingClientRect()).find((q) => q.width > 0);
      const t = [...document.querySelectorAll(".tip, .tooltip, #tip")].map((e) => e.getBoundingClientRect()).find((q) => q.width > 0);
      const all = [r, t].filter(Boolean) as DOMRect[];
      const x0 = Math.min(...all.map((q) => q.left)) - 8, y0 = Math.min(...all.map((q) => q.top)) - 8, x1 = Math.max(...all.map((q) => q.right)) + 8, y1 = Math.max(...all.map((q) => q.bottom)) + 8;
      return { x: Math.max(0, x0), y: Math.max(0, y0), width: Math.min(1280, x1) - Math.max(0, x0), height: Math.min(800, y1) - Math.max(0, y0), n: document.querySelectorAll('.auras .cell img[src*="war_"]').length };
    });
    await page.screenshot({ path: path.join(OUT, name), clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    return box.n;
  };
  const nSol = await buffShot("buffs-sol.png");
  check(nSol >= 3, `бафы земли Сольгарда в рамке героя: ${nSol}`);
  // карта мира: три масштаба, подписи под своими значками
  await page.mouse.move(5, 795);
  await run(`window.__game.registry.get("hud").openWorldMap(); return 0;`);
  await sleep(1000);
  for (const [name, k] of [["map-zoom-min.png", 1], ["map-zoom-mid.png", 3], ["map-zoom-max.png", 7]] as const) {
    await run(`const v = window.__game.registry.get("hud").wmView; v.s = Math.max(v.fit, Math.min(14, v.fit * a.k)); v.cx = 550; v.cy = 192; v.clamp(); return 0;`, { k });
    await sleep(700);
    await page.screenshot({ path: path.join(OUT, name) });
  }
  await page.keyboard.press("m").catch(() => {});
  await run(`const h = window.__game.registry.get("hud"); document.querySelector(".win-worldmap") && (document.querySelector(".win-worldmap").hidden = true); return 0;`).catch(() => 0);
  // герой Умбрата: свои бафы
  const tokU = await ensureChar("war_view_u", PASS, "Костяной", "deathknight");
  await enter("Костяной", tokU, 2);
  const HU = heroOf("Костяной");
  HU.save.level = 90; HU.selfDirty = true;
  const nUmb = await buffShot("buffs-umb.png");
  check(nUmb >= 3, `бафы земли Умбрата в рамке героя: ${nUmb}`);
  // склейка: Сольгард | Умбрат
  const a = PNG.sync.read(fs.readFileSync(path.join(OUT, "buffs-sol.png"))), b = PNG.sync.read(fs.readFileSync(path.join(OUT, "buffs-umb.png")));
  const outp = new PNG({ width: a.width + b.width + 16, height: Math.max(a.height, b.height) });
  for (let i = 0; i < outp.data.length; i += 4) { outp.data[i] = 18; outp.data[i + 1] = 15; outp.data[i + 2] = 22; outp.data[i + 3] = 255; }
  PNG.bitblt(a, outp, 0, 0, a.width, a.height, 0, 0);
  PNG.bitblt(b, outp, 0, 0, b.width, b.height, a.width + 16, 0);
  fs.writeFileSync(path.join(OUT, "buffs.png"), PNG.sync.write(outp));
  for (const f of ["buffs-sol.png", "buffs-umb.png"]) fs.rmSync(path.join(OUT, f), { force: true });
}
/**
 * --ux: новичок 80 ур. входит во время битвы и идёт только по подсказкам полосы и стрелке: карточка знакомства, «Идите на фронт»,
 * «Встаньте в круг», не воюющий фронт, маунт, «нужен перевес 2 против 3», подъём, спор, захват и печать, закрытое Сердце.
 * Снимки — tools/out/banners-event/ux-*.png; каждая подсказка проверяется по тексту полосы.
 */
async function scenarioUx() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.startsWith("ux-")) fs.rmSync(path.join(OUT, f));
  const token = await ensureChar("war_newbie", PASS, "Новобранец", "warrior");
  const w = W(), war = w.war!;
  war.debug("reset", {});
  w.soldiers!.squadAt.solgard = w.soldiers!.squadAt.umbrath = 1e15;
  const base = warBase("center_w")!;
  for (const m of [...w.mobs.values()]) if (!m.faction && Math.hypot(m.x - base.x, m.y - base.y) < 3000) w.removeMob(m);
  await enter("Новобранец", token, 2);
  const H = heroOf("Новобранец");
  H.save.level = 80; H.selfDirty = true;
  const { Player: PlayerCls, newSave } = await import("../server/src/game/Player");
  const mk = (f: "solgard" | "umbrath", i: number) => {
    const sv = newSave(f === "solgard" ? "healer" : "deathknight", { x: 0, y: 0 });
    sv.level = 90; sv.faction = f;
    const p = new PlayerCls(`ux${f}${i}`, `${f === "solgard" ? "Соратник" : "Враг"}${i + 1}`, sv, () => {});
    w.addPlayer(p);
    return p;
  };
  const ally = mk("solgard", 0), foes = [0, 1, 2].map((i) => mk("umbrath", i));
  const where = new Map<Player, { x: number; y: number } | null>();
  const park = { x: base.x - 3000, y: base.y + 900 };
  const keep = setInterval(() => {
    for (const p of [H, ally, ...foes]) { if (p.dead) { p.dead = false; p.unit.anim = 0; } p.unit.hp = p.unit.maxHp; p.inputAt = w.time; p.moveTo = null; p.targetId = null; p.combatAt = -1e9; }
    for (const [p, q] of where) { const t = q ?? park; p.unit.x = t.x; p.unit.y = t.y; }
  }, 50);
  const put = (p: Player, q: { x: number; y: number } | null) => where.set(p, q);
  const hint = () => page.$eval(".war-bar", (e) => e.querySelector(".war-hint")?.textContent ?? "").catch(() => "");
  const shot = async (name: string, re: RegExp, what: string) => {
    await sleep(1200);
    const h = await hint();
    await page.screenshot({ path: path.join(OUT, name) });
    check(re.test(h), `${what}: «${h}»`);
  };
  /** Цель подсказки (куда ведут полоса и стрелка) — с клиента. */
  /** Крупно у постамента (×1, как в игре): камера на основании, вырезка вокруг него. */
  const close = async (name: string, b: { x: number; y: number }) => {
    await run(`const cam = sc.cameras.main; cam.stopFollow(); cam.centerOn(a.x, a.y - 40); return 0;`, { x: b.x, y: b.y });
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 320, y: 120, width: 640, height: 560 } });
    await run(`const cam = sc.cameras.main, u = sc.units.get(window.__net.id); if (u && u.sprite) cam.startFollow(u.sprite, true); return 0;`).catch(() => 0);
  };
  const target = () => run<{ id: string; x: number; y: number } | null>(`const m = await import('/src/ui/bannerWar.ts'); const h = m.warHint(); return h && h.target ? { id: h.target.id, x: h.target.x, y: h.target.y } : null;`);
  try {
    put(ally, null); foes.forEach((f) => put(f, null));
    put(H, { x: H.x, y: H.y });
    war.debug("start", { front: "center" });
    await page.waitForSelector(".war-intro", { timeout: 15000 });
    await shot("ux-intro.png", /Идите на/, "карточка знакомства и первая подсказка");
    await page.click(".war-intro [data-ok]");
    // идём по стрелке: сначала далеко — «Идите на фронт», стрелка у края экрана
    const t0 = await target();
    check(!!t0, `цель подсказки есть (${t0?.id})`);
    await shot("ux-go-front.png", /Идите на Центральный фронт/, "далеко от фронта");
    const arrow = await run<boolean>(`return !!sc.bannerBases && sc.bannerBases.arrow.visible;`);
    check(arrow, "стрелка у края экрана к знамени");
    // ближе: «Встаньте в круг»
    const t1 = (await target())!;
    put(H, { x: t1.x - 30 * 32, y: t1.y + 4 * 32 });
    await shot("ux-step-in.png", /Встаньте в круг/, "рядом с фронтом");
    // забрёл в круг не воюющего фронта
    const north = warBase("north_e")!;
    put(H, { x: north.x + 60, y: north.y + 120 });
    await shot("ux-inactive.png", /не воюет/, "круг не воюющего фронта: серое кольцо и объявление");
    // в круг цели верхом
    const t2 = (await target())!, tb = warBase(t2.id)!;
    put(H, { x: tb.x + 70, y: tb.y + 140 });
    put(ally, { x: tb.x - 90, y: tb.y + 120 });
    await run(`window.__net.send("dbg", { op: "mount", id: "horse" }); return 0;`);
    await shot("ux-mounted.png", /Слезьте с маунта/, "верхом в круге");
    await close("ux-counter-mount.png", tb);
    await run(`window.__net.send("dbg", { op: "mount", id: "" }); return 0;`);
    // 2 против 3: перевес нужен
    put(ally, { x: tb.x - 90, y: tb.y + 120 });
    foes.forEach((f, i) => put(f, { x: tb.x - 120 + i * 120, y: tb.y - 150 }));
    await shot("ux-outnumbered.png", /Нужен перевес: в круге 2 против 3/, "2 против 3");
    await close("ux-counter-outnumbered.png", tb);
    // враги ушли: вывешиваем и поднимаем
    foes.forEach((f) => put(f, null));
    await waitFor(() => (war.bases.get(tb.id)!.h ?? 0) > 0.12, 40000);
    await shot("ux-raising.png", /Поднимаете знамя · \d+ %/, "подъём знамени");
    await close("ux-counter-raising.png", tb);
    // поровну — спор
    put(foes[0], { x: tb.x - 120, y: tb.y - 150 }); put(foes[1], { x: tb.x + 120, y: tb.y - 150 });
    await shot("ux-contest.png", /Спор: в круге 2 против 2/, "спор 2 на 2");
    await close("ux-counter-contest.png", tb);
    foes.forEach((f) => put(f, null));
    await waitFor(() => war.bases.get(tb.id)!.owner === "solgard", 90000);
    await shot("ux-captured.png", /Печать|Точка ваша/, "точка взята");
    // толпа из 8 героев вплотную к постаменту: места хватает (непроходимо только каменное ядро 2×1)
    {
      const { walkable } = await import("../shared/map");
      const crowd = [ally, ...foes, ...[0, 1, 2, 3].map((i) => mk("solgard", 10 + i))];
      const drop = WAR_LOOK_DROP;
      const spots = crowd.map((_, i) => { const a = (i / crowd.length) * Math.PI * 2; return { x: tb.x + Math.cos(a) * 62, y: tb.y + drop + Math.sin(a) * 34 }; });
      const okSpots = spots.filter((q) => walkable(w.map, q.x, q.y, 10)).length;
      crowd.forEach((p, i) => put(p, spots[i]));
      put(H, { x: tb.x + 20, y: tb.y + drop + 46 });
      await sleep(1500);
      await close("ux-hitbox.png", tb);
      check(okSpots >= 7, `8 героев вплотную к постаменту: проходимо ${okSpots} из 8 мест`);
      crowd.forEach((p) => put(p, null));
    }
    // Сердце закрыто
    const heart = warBase("center_h")!;
    put(H, { x: heart.x + 60, y: heart.y + 130 }); put(ally, null);
    await shot("ux-heart.png", /Сердце откроется через/, "Сердце закрыто до 20-й минуты");
  } finally {
    clearInterval(keep);
  }
}
/** --start: миг начала битвы, герой с титулом стоит у постамента — объявление, полоса, подписи не налезают; 1366×768 и 1920×1080. */
async function scenarioStart() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("war_start", PASS, "Ратоборец", "warrior");
  const w = W(), war = w.war!;
  war.debug("reset", {});
  w.soldiers!.squadAt.solgard = w.soldiers!.squadAt.umbrath = 1e15;
  const base = warBase("center_w")!;
  for (const m of [...w.mobs.values()]) if (!m.faction && Math.hypot(m.x - base.x, m.y - base.y) < 2000) w.removeMob(m);
  await enter("Ратоборец", token, 2);
  const H = heroOf("Ратоборец");
  H.save.level = 90; H.save.title = "Сокрушитель Хаоса"; H.applyCosmetics(); H.selfDirty = true;
  const at = { x: base.x + 10, y: base.y + WAR_LOOK_DROP + 70 };
  const keep = setInterval(() => { H.unit.x = at.x; H.unit.y = at.y; H.moveTo = null; H.inputAt = w.time; H.unit.hp = H.unit.maxHp; }, 50);
  try {
    for (const [name, vw, vh] of [["ux-start-1366.png", 1366, 768], ["ux-start-1920.png", 1920, 1080]] as const) {
      await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
      await sleep(1500);
      if (war.phase === "battle") war.debug("end", {});
      await page.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()));
      war.debug("start", { front: "center" });
      await page.waitForFunction(() => /Битва за знамёна/.test((document.querySelector(".war-banner:not([hidden])") as HTMLElement | null)?.textContent ?? ""), { timeout: 12000, polling: 100 }).catch(() => 0);
      await sleep(500);
      await page.screenshot({ path: path.join(OUT, name) });
      const r = await page.evaluate(() => {
        const box = (sel: string) => { const e = document.querySelector(sel) as HTMLElement | null; if (!e || e.hidden) return null; const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom }; };
        return { bar: box(".war-bar"), banner: box(".war-banner"), mini: box(".hud-mini"), frame: box(".hud-frame, .hud-hero, #hero-frame") };
      });
      const hit = (a: typeof r.bar, b: typeof r.bar) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      check(!!r.bar && !hit(r.bar, r.banner) && !hit(r.bar, r.mini) && !hit(r.banner, r.mini), `${vw}×${vh}: полоса, объявление и мини-карта не налезают (${JSON.stringify(r)})`);
    }
  } finally {
    clearInterval(keep);
  }
}
const START = process.argv.includes("--start");
/**
 * --life: жизненный цикл полосы (плашка до битвы, итог после и исчезновение по закрытию окна итогов) и три варианта полосы на выбор
 * (localStorage war:barv): до захвата, подъём, спор, итог — ×1 и ×2. Выход: chip-before.png, bar-after-end.png, bar-v1..v3.png.
 */
async function scenarioLife() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("war_life", PASS, "Летописец", "warrior");
  const w = W(), war = w.war!;
  war.debug("reset", {});
  w.soldiers!.squadAt.solgard = w.soldiers!.squadAt.umbrath = 1e15;
  const base = warBase("center_w")!;
  for (const m of [...w.mobs.values()]) if (!m.faction && Math.hypot(m.x - base.x, m.y - base.y) < 2000) w.removeMob(m);
  await enter("Летописец", token, 2);
  const H = heroOf("Летописец");
  H.save.level = 90; H.selfDirty = true;
  await page.evaluate(() => { try { localStorage.setItem("war:intro:v1", "1"); } catch {} });
  const { Player: PlayerCls, newSave } = await import("../server/src/game/Player");
  const mk = (f: "solgard" | "umbrath", i: number) => { const sv = newSave(f === "solgard" ? "healer" : "deathknight", { x: 0, y: 0 }); sv.level = 90; sv.faction = f; const p = new PlayerCls(`lf${f}${i}`, `${f === "solgard" ? "Соратник" : "Враг"}${i + 1}`, sv, () => {}); w.addPlayer(p); return p; };
  const allies = [0, 1, 2, 3].map((i) => mk("solgard", i)), foes = [0, 1, 2, 3, 4].map((i) => mk("umbrath", i));
  const inside = new Set<Player>();
  const park = { x: base.x - 3000, y: base.y + 900 };
  const keep = setInterval(() => {
    [H, ...allies, ...foes].forEach((p, i) => {
      if (p.dead) { p.dead = false; p.unit.anim = 0; }
      p.unit.hp = p.unit.maxHp; p.inputAt = w.time; p.moveTo = null; p.targetId = null; p.combatAt = -1e9;
      const q = inside.has(p) ? { x: base.x - 160 + (i % 6) * 64, y: base.y + 120 + Math.floor(i / 6) * 50 } : p === H ? { x: base.x + 40, y: base.y + 260 } : park;
      p.unit.x = q.x; p.unit.y = q.y;
    });
  }, 50);
  const barShot = async (file: string, scale = 1) => {
    if (scale !== 1) await page.setViewport({ width: VIEW.width, height: VIEW.height, deviceScaleFactor: scale });
    await sleep(600);
    const el = await page.$(".war-bar:not([hidden])");
    if (el) await el.screenshot({ path: file });
    if (scale !== 1) { await page.setViewport({ width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 }); await sleep(400); }
    return !!el;
  };
  /** Свернуть/развернуть полосу (клик в странице: полоса перерисовывается раз в 250 мс, ручка из puppeteer устаревает). */
  const fold = () => page.evaluate(() => (document.querySelector("[data-war-fold]") as HTMLElement | null)?.click());
  const closeModals = () => page.evaluate(() => document.querySelectorAll(".modal").forEach((m) => m.remove()));
  try {
    // 1. плашка до битвы (за 14:59, с «В форт»)
    war.debug("prep", { ms: 899000 });
    await sleep(1500);
    const chip = await page.$eval(".war-bar", (e) => ({ chip: e.classList.contains("war-mini"), hidden: (e as HTMLElement).hidden, text: e.textContent ?? "" })).catch(() => null);
    await barShot(path.join(OUT, "chip-before.png"));
    check(!!chip && chip.chip && !chip.hidden && /Битва через/.test(chip.text) && /В форт/.test(chip.text), `до битвы — плашка: «${chip?.text?.trim()}»`);
    // 2. варианты полосы: до захвата, подъём, спор, итог
    const tmp = path.join(OUT, "tmp-bar");
    fs.mkdirSync(tmp, { recursive: true });
    for (const v of ["final"]) {
      await page.evaluate((x) => { try { localStorage.setItem("war:barv", x); } catch {} }, v);
      await page.evaluate(() => { try { sessionStorage.setItem("war:collapsed", "0"); } catch {} });
      inside.clear();
      war.debug("reset", {});
      war.debug("start", { front: "center" });
      await sleep(1500);
      const states: [string, () => Promise<void>][] = [
        ["before", async () => { await sleep(500); }],
        ["raising", async () => { inside.add(H); allies.forEach((p) => inside.add(p)); await waitFor(() => war.bases.get("center_w")!.h >= 0.4, 40000); }],
        ["contest", async () => { foes.forEach((p) => inside.add(p)); await sleep(2500); }],
        ["chip", async () => { await fold(); await sleep(500); }],
        ["result", async () => { await fold(); war.debug("end", {}); await sleep(1500); await closeModals(); await sleep(300); }],
      ];
      for (const [st, go] of states) {
        await go();
        await barShot(path.join(tmp, `${v}-${st}-1.png`), 1);
        await barShot(path.join(tmp, `${v}-${st}-2.png`), 2);
      }
      // склейка: строки — состояния, слева ×1, справа ×2
      const imgs = states.map(([st]) => [1, 2].map((k) => { const f = path.join(tmp, `${v}-${st}-${k}.png`); return fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : new PNG({ width: 1, height: 1 }); }));
      const Wd = Math.max(...imgs.map(([a, b]) => a.width + b.width + 24)), Hd = imgs.reduce((h, [a, b]) => h + Math.max(a.height, b.height) + 12, 12);
      const out = new PNG({ width: Wd + 12, height: Hd });
      for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 18; out.data[i + 1] = 15; out.data[i + 2] = 22; out.data[i + 3] = 255; }
      let y = 12;
      for (const [a, b] of imgs) { PNG.bitblt(a, out, 0, 0, a.width, a.height, 12, y); PNG.bitblt(b, out, 0, 0, b.width, b.height, 24 + a.width, y); y += Math.max(a.height, b.height) + 12; }
      fs.writeFileSync(path.join(OUT, `bar-${v}.png`), PNG.sync.write(out));
      check(imgs.every(([a]) => a.width > 10), `вариант ${v}: 4 состояния ×1 и ×2`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    // 3. после битвы (вариант по умолчанию): строка итога, исчезает при закрытии окна итогов
    await page.evaluate(() => { try { localStorage.removeItem("war:barv"); } catch {} });
    inside.clear();
    war.debug("reset", {});
    war.debug("start", { front: "center" });
    await sleep(1200);
    war.debug("owner", { base: "center_h", f: "umbrath" });
    await sleep(800);
    war.debug("end", {});
    await page.waitForSelector(".war-result", { timeout: 8000 }).catch(() => 0);
    await sleep(800);
    const endText = await page.$eval(".war-bar", (e) => e.textContent ?? "").catch(() => "");
    await page.screenshot({ path: path.join(OUT, "bar-after-end.png"), clip: { x: 380, y: 0, width: 640, height: 140 } });
    check(/Победа: Умбрат/.test(endText), `после битвы — итог в полосе: «${endText.trim()}»`);
    await page.click(".war-result [data-x]").catch(() => 0);
    await sleep(800);
    const gone = await page.$eval(".war-bar", (e) => (e as HTMLElement).hidden).catch(() => true);
    check(gone, "окно итогов закрыто — полосы нет");
  } finally {
    clearInterval(keep);
  }
}
const LIFE = process.argv.includes("--life");
const UX = process.argv.includes("--ux");
import WARDATA from "../data/faction-war.json";
const WAR_LOOK_DROP = WARDATA.look.plinthDrop;
const RULES = process.argv.includes("--rules");
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
    if ((V2 || RULES || UX || START || LIFE) && !process.argv.includes("--with-siege")) await page.evaluateOnNewDocument(() => {
      setInterval(() => { const sc = (window as any).__game?.scene?.getScene?.("game"); if (sc && sc.siegeView) { try { sc.siegeView.destroy?.(); } catch {} sc.siegeView = null; } }, 20);
    });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await (V2 ? scenarioV2() : RULES ? scenarioRules() : UX ? scenarioUx() : START ? scenarioStart() : LIFE ? scenarioLife() : scenario());
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
    fs.writeFileSync(path.join(OUT, V2 ? "v2-report.json" : RULES ? "rules-report.json" : UX ? "ux-report.json" : START ? "start-report.json" : LIFE ? "life-report.json" : "report.json"), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nЗнамёна Предела в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
