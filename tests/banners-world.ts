/**
 * Знамёна мира (задача 132, решение 5): снимки ворот и стен обеих столиц, обоих фортов, двух поселений и поста у Главного моста
 * на зуме 2, днём и ночью, в игре (сервер в этом же процессе, Vite и Chrome) и рендером карты (tools/preview-region.ts, ×2).
 * Снимки двух прогонов (TAG) складываются в сравнения <CMP>-<место>-<день|ночь|карта>.png: A — сверху, B — снизу (по умолчанию
 * before | after → cmp-*; прореживание по отзыву пользователя: A=now B=thin CMP=thin — «как было после первой расстановки | стало»).
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   TAG — метка прогона (before, after, now, thin): $env:TAG="thin"; $env:TEST_PORT="2851"; $env:VITE_TEST_PORT="5251"; npx tsx tests/banners-world.ts
 *   только рендер карты без сервера: npx tsx tests/banners-world.ts --regions; сравнения: $env:A="now"; $env:B="thin"; $env:CMP="thin"; npx tsx tests/banners-world.ts --compose
 * Выход — tools/out/banners-world/ (OUT_DIR — другая папка). Chrome: CHROME_PATH. DAY_ONLY=1 — только день.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PNG } from "pngjs";
import { MAP_W, TILE } from "../shared/constants";

const OUT = path.resolve(process.env.OUT_DIR || "tools/out/banners-world");
const TAG = process.env.TAG || "after";
/** Прогоны «до»: в них новых знамён нет или их ещё не проверяем. */
const OLD = TAG === "before" || TAG === "now";
const VIEW = { width: 1600, height: 1000 };
/** Кадр в пикселях мира (на зуме 2 — 1600×960). */
const FW = 800, FH = 480;
/** Места: центр кадра в тайлах (непрерывные). Восток — зеркало запада (x → 1100 − x). */
const mir = (x: number) => MAP_W - x;
const SPOTS: { id: string; x: number; y: number; nb?: true; hero?: [number, number] }[] = [
  { id: "aurelion-n", x: 56.5, y: 167.5 }, { id: "aurelion-s", x: 56.5, y: 190 },
  { id: "morthaim-n", x: mir(56.5), y: 167.5 }, { id: "morthaim-s", x: mir(56.5), y: 190 },
  { id: "fort-sol-n", x: 392.5, y: 167.5 }, { id: "fort-sol-s", x: 392.5, y: 190 },
  { id: "fort-umb-n", x: mir(392.5), y: 167.5 }, { id: "fort-umb-s", x: mir(392.5), y: 190 },
  { id: "clear-dale", x: 96.5, y: 214.5 }, { id: "sorrow-yard", x: mir(96.5), y: 214.5 },
  { id: "bridge-m-w", x: 204, y: 180.5 }, { id: "bridge-m-e", x: mir(204), y: 180.5 },
  // задача 141: середины городов (дома, храмы) и Эмберхолл
  { id: "aurelion-c", x: 56.5, y: 180, nb: true }, { id: "morthaim-c", x: mir(56.5), y: 180, nb: true }, { id: "fort-sol-c", x: 392.5, y: 180, nb: true }, { id: "fort-umb-c", x: mir(392.5), y: 180, nb: true },
  // задача 141: герой стоит в проёме южных ворот Аурелиона (свод над ним, мостовая под ним)
  { id: "aurelion-gate", x: 56.5, y: 189, nb: true, hero: [56.5, 191.6] },
  { id: "ember-n", x: 550.5, y: 43, nb: true },
  // задача 141 (правки 2): углы частокола, боковые и южные ворота поселений, вышка лучника крупно
  { id: "sorrow-corner", x: 998, y: 211, nb: true }, { id: "dale-corner-se", x: 102, y: 219, nb: true },
  { id: "black-post", x: 919.5, y: 155, nb: true }, { id: "white-tower", x: 964, y: 262.5, nb: true }, { id: "archer-tower", x: 202, y: 175, nb: true },
  { id: "aurelion-gate-n", x: 56.5, y: 170, nb: true, hero: [56.5, 169.4] }, { id: "ember-gate-n", x: 550.5, y: 43, nb: true, hero: [550.5, 41.4] }, { id: "ember-w", x: 534, y: 57, nb: true }, { id: "ember-s", x: 550.5, y: 79, nb: true }, { id: "mill-ford", x: 112.5, y: 124 }, { id: "hunters-camp", x: 132, y: 262.5 },
];
const save = (name: string, p: PNG) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), PNG.sync.write(p)); };
const read = (f: string) => PNG.sync.read(fs.readFileSync(f));

/** Рендер карты ×2 (tools/preview-region.ts): region-<tag>-<место>.png. */
function regions() {
  for (const s of SPOTS) {
    const tw = FW / TILE, th = FH / TILE, raw = path.join(OUT, `_raw-${s.id}.png`);
    execFileSync("npx", ["tsx", "tools/preview-region.ts", String(Math.round(s.x - tw / 2)), String(Math.round(s.y - th / 2)), String(tw), String(th), "--out", raw], { stdio: "inherit", shell: true });
    const src = read(raw), k = 2, out = new PNG({ width: src.width * k, height: src.height * k });
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) src.data.copy(out.data, (y * out.width + x) * 4, (((y / k) | 0) * src.width + ((x / k) | 0)) * 4, (((y / k) | 0) * src.width + ((x / k) | 0)) * 4 + 4);
    save(`region-${TAG}-${s.id}.png`, out);
    fs.rmSync(raw, { force: true });
  }
}

/** Сравнения: было сверху, стало снизу, полоса 8 px между ними. */
function compose() {
  for (const s of SPOTS) for (const [kind, file] of [["day", `ingame-%-${s.id}-day.png`], ["night", `ingame-%-${s.id}-night.png`], ["map", `region-%-${s.id}.png`]]) {
    const a = path.join(OUT, file.replace("%", process.env.A || "before")), b = path.join(OUT, file.replace("%", process.env.B || "after"));
    if (!fs.existsSync(a) || !fs.existsSync(b)) continue;
    const A = read(a), B = read(b), gap = 8, out = new PNG({ width: Math.max(A.width, B.width), height: A.height + gap + B.height });
    for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 22; out.data[i + 1] = 19; out.data[i + 2] = 26; out.data[i + 3] = 255; }
    PNG.bitblt(A, out, 0, 0, A.width, A.height, 0, 0);
    PNG.bitblt(B, out, 0, 0, B.width, B.height, 0, A.height + gap);
    save(`${process.env.CMP || "cmp"}-${s.id}-${kind}.png`, out);
  }
}

if (process.argv.includes("--regions")) { regions(); process.exit(0); }
if (process.argv.includes("--compose")) { compose(); process.exit(0); }

// ---------------------------------------------------------------- снимки в игре
const { default: puppeteer } = await import("puppeteer-core");
const { createServer } = await import("vite");
const { dbFile, ensureChar, PORT, sleep } = await import("./harness");
type Page = import("puppeteer-core").Page;
type Player = import("../server/src/game/Player").Player;
type World = import("../server/src/game/World").World;

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5251;
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
/** Кадр мира w×h px вокруг (cx, cy) из холста. */
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

async function scenario() {
  const token = await ensureChar("banners_view", "secret", "Эйра", "warrior");
  await enter("Эйра", token);
  const H = heroOf("Эйра");
  // герой стоит под кадром (вне его), здоровье держится: в чужой столице и форте бьёт стража
  let at = { x: 0, y: 0 };
  const hold = () => { if (H.dead) { H.dead = false; H.unit.anim = 0; } H.unit.x = at.x; H.unit.y = at.y; H.moveTo = null; H.unit.hp = H.unit.maxHp; };
  const keep = setInterval(hold, 50);
  try {
    // DAY_ONLY=1 — только дневные снимки (задача 141: «было | стало» днём)
    for (const [tod, frac] of ([["day", 0.3], ["night", 0.82]] as const).filter(([t]) => !process.env.DAY_ONLY || t === "day")) {
      await page.evaluate((f: number) => { const C = 20 * 60 * 1000, r = (window as any).__realNow(); (window as any).__dshift = f * C - (r % C); }, frac);
      // ONLY=id,id — снять только эти места
      for (const s of SPOTS.filter((q) => !process.env.ONLY || process.env.ONLY.split(",").includes(q.id))) {
        const cx = s.x * TILE, cy = s.y * TILE;
        at = s.hero ? { x: s.hero[0] * TILE, y: s.hero[1] * TILE } : { x: cx, y: cy + FH / 2 + 60 };
        hold();
        await sleep(2600);
        await run("sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(a.x, a.y);", { x: cx, y: cy });
        await sleep(1400);
        if (!OLD && tod === "day" && !s.nb) {
          const n = await run<number>("let n = 0; for (const o of sc.children.list) if (o.type === 'Sprite' && o.texture && /^vfx_std-(home|pennant|drape)-/.test(o.texture.key) && o.anims && o.anims.isPlaying && Math.abs(o.x - a.x) < 400 && Math.abs(o.y - a.y) < 320) n++; return n;", { x: cx, y: cy });
          check(n > 0, `${s.id}: знамёна в кадре играют анимацию (${n})`);
        }
        save(`ingame-${TAG}-${s.id}-${tod}.png`, await snap(cx, cy, FW, FH));
      }
    }
  } finally { clearInterval(keep); }
}

async function main() {
  await startServer();
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      (window as any).__name = (t: unknown) => t;
      const real = Date.now.bind(Date);
      (window as any).__realNow = real; (window as any).__dshift = 0;
      Date.now = () => real() + (window as any).__dshift;
    });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|AnimationManager key already exists/i.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    lines.push(`EXC ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
    console.log(lines[lines.length - 1]);
    bad++;
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `report-${TAG}.json`), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : `\nЗнамёна мира (${TAG}): снимки готовы`);
  process.exit(bad ? 1 : 0);
}
await main();
