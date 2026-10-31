/**
 * Боссы стартовых земель в настоящем браузере (задача 136, шаг 4): сервер в этом же процессе, Vite и Chrome, зум 2.
 * Для каждого из 8 боссов: герой рядом с ним на его арене, снимок покоя, затем каждое умение — снимок посреди замаха
 * (предупреждение на земле и поза удержания) и сразу после удара (эффект мира в метках). Проверяется: лист босса загружен
 * (кадр 64×64, каталог /assets/zone-bosses/manifest.json), событие zb доходит до клиента и запускает связку, ошибок консоли нет.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir; порты свободные):
 *   $env:TEST_PORT="2867"; $env:VITE_TEST_PORT="5267"; npx tsx tests/zone-bosses-ingame.ts [--only=sol_raider_chief,...]
 * Выход — tools/out/zone-bosses-ingame/: <id>-idle.png, <id>-<умение>-wind.png, <id>-<умение>-hit.png, report.json. Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { Bot, dbFile, ensureChar, PORT, sleep } from "./harness";
import cards from "../data/zone-bosses.json";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";
import type { Mob } from "../server/src/game/Mob";
import type { ZbCard } from "../shared/zoneBosses";

const ONLY = new Set(process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean) ?? []);
const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5267;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/zone-bosses-ingame");
const PASS = "secret";
const CARDS = (cards.bosses as unknown as ZbCard[]).filter((c) => !ONLY.size || ONLY.has(c.id));

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

async function enter(name: string, token: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v2", "2"); }, token);
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

/** Кадр мира w×h px вокруг (cx, cy) из холста (камера стоит на точке, игра идёт вживую). */
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

type BossCtl = { abilities: { at: number }[]; run: (ab: unknown) => void };
function hold(p: Player, x: number, y: number) { p.unit.x = x; p.unit.y = y; p.moveTo = null; p.unit.maxHp = p.unit.hp = 999999; p.dead = false; }

async function scenario() {
  if (!ONLY.size) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("zb_view", PASS, "Эйра", "warrior");
  const bot = await Bot.enter(await ensureChar("zb_far", PASS, "Торвин", "ranger"), "Торвин");
  await enter("Эйра", token);
  const H = heroOf("Эйра"), F = heroOf("Торвин");
  void bot;
  const ok0 = await run<boolean>("const m = sc.cache.json.get('zbm'); return !!(m && m.bosses && Object.keys(m.bosses).length >= 8)");
  check(ok0, "каталог боссов стартовых земель загружен (8 боссов)");
  for (const c of CARDS) {
    const mob = [...W().mobs.values()].find((m) => m.def.id === c.id) as Mob;
    const boss = mob.boss as unknown as BossCtl;
    mob.reset();
    for (const a of boss.abilities) a.at = 1e9;
    const bx = mob.home.x, by = mob.home.y;
    // герой — справа снизу (ближний бой), второй — дальше (цель «дальнего», рядов и тарана)
    const keep = setInterval(() => { hold(H, bx + 70, by + 24); hold(F, bx - 150, by + 90); }, 50);
    hold(H, bx + 70, by + 24); hold(F, bx - 150, by + 90);
    await run("sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(a.x, a.y);", { x: bx, y: by });
    await sleep(2500);
    mob.state = "chase"; mob.targetId = H.id; mob.addThreat(H.id, 1000);
    await sleep(600);
    const tex = await run<{ w: number; frame: number; zb: boolean } | null>("for (const v of sc.units.values()) if (v.u.sprite === a) return { w: sc.textures.get('u_' + a).getSourceImage().width, frame: v.frame, zb: true }; return null", c.id);
    check(!!tex && tex.frame === 64, `${c.id}: лист босса в игре, кадр ${tex?.frame}`);
    save(`${c.id}-idle.png`, await snap(bx, by - 20, 400, 300));
    for (const ab of c.abilities) {
      for (const a of boss.abilities) a.at = 1e9;
      boss.run(ab);
      const total = [ab, ...(ab.then ?? [])].reduce((s, wv) => s + wv.windupMs + ((wv.at === "path" || wv.at === "hunt") && wv.count ? (wv.count - 1) * (wv.stepMs ?? 0) : 0), 0);
      // под нагрузкой (3–5 к/с) событие zb и смена кадра запаздывают — опрос с 40 % замаха до его конца, а не один замер на 65 %
      const t0 = Date.now();
      await sleep(Math.round(ab.windupMs * 0.4));
      // замах (сразу, до снимка: снимок под SwiftShader идёт долго): кадр босса — из связки умения (событие zb дошло и запустило анимацию)
      let fr: { col: number; ok: boolean } | null = null;
      do fr = await run<{ col: number; ok: boolean } | null>("const m = sc.cache.json.get('zbm').bosses[a.id]; for (const v of sc.units.values()) if (v.u.sprite === a.id) { const col = Number(v.sprite.frame.name) % m.cols; const w0 = m.skills[a.ab].waves[0]; const ok = [...(w0.pre || []), w0.strike].some((k) => { const q = m.anims[k]; return col >= q.col && col < q.col + q.n; }); return { col, ok }; } return null", { id: c.id, ab: ab.id });
      while (!fr?.ok && Date.now() - t0 < ab.windupMs && (await sleep(80), true));
      check(!!fr?.ok, `${c.id}.${ab.id}: замах из связки умения (столбец ${fr?.col})`);
      save(`${c.id}-${ab.id}-wind.png`, await snap(bx, by - 10, 440, 330));
      await sleep(Math.round(ab.windupMs * 0.35) + 120);
      save(`${c.id}-${ab.id}-hit.png`, await snap(bx, by - 10, 440, 330));
      await sleep(Math.max(0, total - ab.windupMs) + 1500);
      mob.unit.x = mob.home.x; mob.unit.y = mob.home.y;
    }
    clearInterval(keep);
    mob.reset();
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
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext/i.test(e));
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
  console.log(bad ? `\nСбоев: ${bad}` : "\nБоссы стартовых земель в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
