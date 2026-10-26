/**
 * Мобы задачи 140 (партия 1, зоны 1–40) в настоящем браузере: сервер в этом процессе, Vite, Chrome без окна, зум 2.
 * Для мобов из нескольких зон: герой рядом, снимки покоя, удара (моб в погоне за героем), гибели и возрождения усиленным
 * (свой лист <спрайт>_elite и имя). Проверяется: лист загружен и у него анимации покоя/ходьбы/удара/гибели (BootScene, ≥ 45
 * столбцов), после возрождения усиленным клиент сменил лист, ошибок консоли нет.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2862"; $env:VITE_TEST_PORT="5262"; npx tsx tests/mobs-ingame.ts [--only=boarfolk_axe,...]
 *   партия 2 (зоны 40–100, данж): ... npx tsx tests/mobs-ingame.ts --batch=2 → tools/out/mobs-ingame2/
 * Выход — tools/out/mobs-ingame/: <моб>-idle|attack|death|elite.png, montage.png, report.json. Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep } from "./harness";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";
import type { Mob } from "../server/src/game/Mob";

// --batch=2 — партия 2 (зоны 40–100 и данж): по мобу из разных зон, снимки в tools/out/mobs-ingame2
const BATCH2 = process.argv.includes("--batch=2");
const ALL = BATCH2
  ? ["gnoll_archer", "golem_sandstone", "orc_shield", "harpy_scavenger", "butcher_hook", "slime_plague", "canine_frost", "banshee_wail", "orc_thunder", "fallen_spirit_warrior", "fallen_spirit_hollow", "golem_magma", "cultist_pyro"]
  : ["boarfolk_axe", "goblin_slinger", "zombie_digger", "wolffolk_chaser", "imp_caster", "hobgoblin_sword", "mummy_guard", "ogre_woodcutter", "troll_brute", "frogfolk_shaman"];
const ONLY = new Set(process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean) ?? []);
const MOBS = ALL.filter((m) => !ONLY.size || ONLY.has(m));
const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5262;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve(BATCH2 ? "tools/out/mobs-ingame2" : "tools/out/mobs-ingame");
const SHOT = { w: 220, h: 150 };

let page: Page;
const errors: string[] = [];
const lines: string[] = [];
let bad = 0;
const check = (ok: boolean, msg: string) => { lines.push(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; console.log(lines[lines.length - 1]); };
const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;

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
  const { dbFile } = await import("./harness");
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
  Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1", VITE_SERVER_URL: `ws://localhost:${PORT}` });
  await import("../server/src/index");
  const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
  W = () => WorldRoom.instance!.world;
  heroOf = (name) => W().findByName(name.toLowerCase())!;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch {} await sleep(150); }
  throw new Error("сервер не ответил");
}

async function enter(name: string, token: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v1", "2"); }, token);
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

async function snap(cx: number, cy: number): Promise<PNG> {
  const c = await run<{ url: string; x: number; y: number; z: number }>(`
    const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    cam.stopFollow(); cam.centerOn(a.cx, a.cy);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const k = cv.width / g.scale.width;
    return { url: cv.toDataURL('image/png'), x: (a.cx - cam.worldView.x) * cam.zoom * k, y: (a.cy - cam.worldView.y) * cam.zoom * k, z: cam.zoom * k };`, { cx, cy });
  const src = PNG.sync.read(Buffer.from(c.url.split(",")[1], "base64"));
  const ww = Math.min(Math.round(SHOT.w * c.z), src.width), hh = Math.min(Math.round(SHOT.h * c.z), src.height);
  const x0 = Math.max(0, Math.min(src.width - ww, Math.round(c.x - ww / 2))), y0 = Math.max(0, Math.min(src.height - hh, Math.round(c.y - hh / 2)));
  const out = new PNG({ width: ww, height: hh });
  PNG.bitblt(src, out, x0, y0, ww, hh, 0, 0);
  return out;
}
const shots: { id: string; kind: string; p: PNG }[] = [];
const save = (id: string, kind: string, p: PNG) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `${id}-${kind}.png`), PNG.sync.write(p)); shots.push({ id, kind, p }); };
function hold(p: Player, x: number, y: number) { p.unit.x = x; p.unit.y = y; p.moveTo = null; p.unit.maxHp = p.unit.hp = 999999; p.dead = false; }

async function scenario() {
  if (!ONLY.size) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("mob_view", "secret", "Эйра", "warrior");
  await enter("Эйра", token);
  const H = heroOf("Эйра");
  for (const id of MOBS) {
    const mob = [...W().mobs.values()].find((m) => m.def.id === id && !m.dead && !m.soldier) as Mob | undefined;
    check(!!mob, `${id}: моб есть в мире`);
    if (!mob) continue;
    mob.respawnAt = 0;
    const rnd = Math.random;
    Math.random = () => 0.99;
    mob.rollElite();
    Math.random = rnd;
    const bx = mob.home.x, by = mob.home.y;
    const ranged = !!mob.def.projectile;
    // дальник: сторона, откуда виден герой (в данже стены режут линию огня)
    const { lineClear } = await import("../shared/map");
    const side = ranged ? ([[110, 6], [-110, 6], [6, 110], [6, -110]] as const).find(([dx, dy]) => lineClear(W().map, bx, by, bx + dx, by + dy)) ?? [110, 6] : [34, 6];
    const hx = bx + side[0], hy = by + side[1];
    let keep = setInterval(() => hold(H, hx, hy), 50);
    hold(H, hx, hy);
    mob.unit.x = bx; mob.unit.y = by;
    await run("sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(a.x, a.y);", { x: bx + (ranged ? 50 : 0), y: by });
    await sleep(2200);
    const tex = await run<{ ok: boolean; frame: number; w: number } | null>(
      "for (const v of sc.units.values()) if (v.u.sprite === a) { const w = sc.textures.get('u_' + a).getSourceImage().width; return { ok: ['rest', 'walk', 'attack', 'death'].every((k) => sc.anims.exists(a + '-' + k + '-0')), frame: v.frame, w }; } return null", mob.def.sprite);
    check(!!tex?.ok, `${id}: лист ${mob.def.sprite} в игре (кадр ${tex?.frame}, ${tex ? tex.w / tex.frame : 0} столбцов), анимации покоя/ходьбы/удара/гибели`);
    save(id, "idle", await snap(bx + (ranged ? 50 : 0), by - 14));
    // удар: моб в погоне за героем
    mob.state = "chase"; mob.targetId = H.id; mob.addThreat(H.id, 1000);
    const a0 = mob.unit.aseq;
    for (let i = 0; i < 40 && mob.unit.aseq === a0; i++) await sleep(100);
    await sleep(220);
    check(mob.unit.aseq !== a0, `${id}: удар по герою`);
    save(id, "attack", await snap(bx + (ranged ? 50 : 0), by - 14));
    // гибель
    W().killMob(mob);
    await sleep(1300);
    save(id, "death", await snap(mob.unit.x, mob.unit.y - 14));
    // возрождение усиленным
    Math.random = () => 0;
    mob.respawnAt = 0;
    await sleep(400);
    Math.random = rnd;
    clearInterval(keep);
    keep = setInterval(() => hold(H, mob.home.x + 90, mob.home.y + 40), 50);
    await sleep(1800);
    const el = await run<{ sprite: string; name: string } | null>("const v = sc.units.get(a); return v ? { sprite: v.sid, name: v.u.name } : null", mob.id);
    check(mob.elite && !!mob.def.eliteSprite && el?.sprite === mob.def.eliteSprite, `${id}: усиленный — лист ${el?.sprite}, имя «${el?.name}»`);
    mob.state = "idle"; mob.targetId = ""; mob.unit.x = mob.home.x; mob.unit.y = mob.home.y;
    await sleep(600);
    save(id, "elite", await snap(mob.home.x, mob.home.y - 14));
    clearInterval(keep);
    Math.random = () => 0.99;
    mob.rollElite();
    Math.random = rnd;
  }
}

/** Общий монтаж: строка на моба — покой, удар, гибель, усиленный. */
function montage() {
  const ids = [...new Set(shots.map((s) => s.id))];
  const kinds = ["idle", "attack", "death", "elite"];
  const cw = shots[0]?.p.width ?? 1, ch = shots[0]?.p.height ?? 1;
  const out = new PNG({ width: kinds.length * (cw + 6) + 6, height: ids.length * (ch + 6) + 6 });
  out.data.fill(30);
  ids.forEach((id, r) => kinds.forEach((k, c) => {
    const s = shots.find((q) => q.id === id && q.kind === k);
    if (s) PNG.bitblt(s.p, out, 0, 0, Math.min(cw, s.p.width), Math.min(ch, s.p.height), 6 + c * (cw + 6), 6 + r * (ch + 6));
  }));
  fs.writeFileSync(path.join(OUT, "montage.png"), PNG.sync.write(out));
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
    montage();
    // повторные ключи анимаций боссов стартовых земель (sol_/umb_) — их лист и BootScene, не мобы этой партии
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|key already exists: (sol|umb)_/i.test(e));
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
  console.log(bad ? `\nСбоев: ${bad}` : "\nМобы 140 в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
