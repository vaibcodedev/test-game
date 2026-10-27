/**
 * Осада форта в игре (задача 132, шаг 15; dbg siege): закрытые для чужих ворота форта Умбрата, свой герой проходит ворота своего форта
 * (створки распахиваются), удар тарана с эскортом, пролом, королевское знамя во дворе, полоса осады и окно итогов. Сервер в этом же процессе, Vite и Chrome.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2848"; $env:VITE_TEST_PORT="5248"; npx tsx tests/fort-siege-ingame.ts
 * Выход — tools/out/siege/: gate-closed.png, gate-ally-open.png, ram-hit.png, siege-bar.png, gate-broken.png, banner-yard.png, result.png, report.json.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import { GATES, siegeBannerAt } from "../shared/siege";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5248;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/siege");
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
async function snap(cx: number, cy: number, w: number, h: number): Promise<PNG> {
  const c = await run<{ url: string; x: number; y: number; z: number }>(`
    const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    cam.stopFollow(); cam.centerOn(a.cx, a.cy);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
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
const shotEl = async (sel: string, name: string) => {
  const el = await page.$(sel);
  if (!el) return false;
  await el.screenshot({ path: path.join(OUT, name) });
  return true;
};
const waitFor = async (ok: () => boolean, ms: number) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await sleep(100); return ok(); };

async function scenario() {
  for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (f.startsWith("v2-")) fs.rmSync(path.join(OUT, f));
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("siege_view", PASS, "Осадник", "warrior");
  const w = W(), siege = w.siege!, war = w.war!;
  siege.debug("reset", {});
  war.debug("reset", {});
  const UG = GATES.find((g) => g.city === "fort_umbrath" && g.side === "s")!, SG = GATES.find((g) => g.city === "fort_solgard" && g.side === "s")!;
  // мобы у фортов и отряды не мешают
  for (const m of [...w.mobs.values()]) if (!m.faction && GATES.some((g) => g.siege && Math.hypot(m.x - g.x, m.y - g.y) < 1600)) w.removeMob(m);
  w.soldiers!.squadAt.solgard = w.soldiers!.squadAt.umbrath = 1e15;
  await enter("Осадник", token, 2);
  const H = heroOf("Осадник");
  H.save.level = 90;
  H.selfDirty = true;
  const { Player: PlayerCls, newSave } = await import("../server/src/game/Player");
  const allies: Player[] = [];
  for (const [i, cls] of (["healer", "ranger", "mage"] as const).entries()) {
    const s = newSave(cls, { x: 100 * 32, y: 20 * 32 });
    s.level = 90; s.faction = "solgard";
    const p = new PlayerCls(`ally${i}`, `Соратник${i + 1}`, s, () => {});
    w.addPlayer(p);
    allies.push(p);
  }
  let pin: { x: number; y: number } | null = null;
  let allyAt: ((i: number) => { x: number; y: number }) | null = null;
  const keep = setInterval(() => {
    for (const p of [H, ...allies]) { if (p.dead) { p.dead = false; p.unit.anim = 0; } p.unit.hp = p.unit.maxHp; p.inputAt = w.time; }
    if (pin) { H.unit.x = pin.x; H.unit.y = pin.y; H.moveTo = null; }
    allies.forEach((p, i) => { const q = allyAt ? allyAt(i) : { x: (100 + i) * 32, y: 20 * 32 }; p.unit.x = q.x; p.unit.y = q.y; p.moveTo = null; });
  }, 50);
  const at = (x: number, y: number) => { pin = { x, y }; (w.siege as unknown as { prev: Map<string, unknown> }).prev.delete(H.id); };
  try {
    // 1. чужие ворота закрыты: герой Сольгарда у южных ворот форта Умбрата, шаг вперёд — упирается
    at(UG.ox, UG.oy + 20);
    await sleep(2500);
    pin = null;
    H.input = { mx: 0, my: -1 };
    await sleep(1500);
    H.input = { mx: 0, my: 0 };
    check(H.y > UG.y1, `чужие ворота закрыты: герой у ворот (y ${Math.round(H.y)} > ${UG.y1})`);
    await sleep(600);
    save("v2-gate-closed.png", await snap(UG.x, UG.objY - 50, 340, 240));
    const loud = await run<number>(`let n = 0; for (const v of sc.units.values()) if ((v.u.kind === 4 || v.u.kind === 6) && !v.u.sprite.startsWith('siege_') && Math.abs(v.x - a.x) < 200 && Math.abs(v.y - a.y) < 200 && v.label.visible) n++; return n;`, { x: UG.x, y: UG.y });
    check(loud === 0, `у ворот ники стражи только под курсором (видно ${loud})`);
    // 2. свои ворота открываются: герой Сольгарда проходит в свой форт
    at(SG.ox, SG.oy + 90);
    await sleep(2500);
    pin = null;
    H.moveTo = { x: SG.x, y: SG.y - 4 * 32 };
    await waitFor(() => H.y < SG.y + 20, 15000);
    await sleep(250);
    save("v2-gate-ally-open.png", await snap(SG.x, SG.objY - 50, 340, 240));
    const passed = await waitFor(() => H.y < SG.y0 - 20, 10000);
    check(passed, `свой герой прошёл ворота своего форта (y ${Math.round(H.y)})`);
    const open = await run<number>(`const v = sc.siegeView.gates.find((x) => x.g.id === a); return v ? v.k : -1;`, SG.id);
    check(open > 0, `створки своих ворот открыты (k ${open.toFixed(2)})`);
    // 3. осада: таран с эскортом бьёт ворота форта Умбрата
    siege.debug("start", { att: "solgard" });
    await page.waitForFunction("document.querySelector('.siege-bar') && !document.querySelector('.siege-bar').hidden", { timeout: 15000, polling: 250 });
    const ram = siege.engines.find((e) => e.kind === "ram")!, gate = siege.gates.find((g) => g.def.side === "s")!;
    allyAt = (i) => (ram.mob ? { x: ram.mob.x + (i - 1) * 34, y: ram.mob.y + 26 } : { x: 100 * 32, y: 20 * 32 });
    at(UG.ox + 60, UG.oy + 80);
    const hp0 = gate.mob!.unit.hp;
    const hit = await waitFor(() => gate.mob!.unit.hp < hp0, 60000);
    await sleep(160);
    save("v2-ram-hit.png", await snap(UG.x, UG.objY - 30, 380, 300));
    check(hit, `таран бьёт ворота (здоровье ${Math.round((100 * gate.mob!.unit.hp) / gate.mob!.unit.maxHp)}%)`);
    await sleep(1200);
    check(await shotEl(".siege-bar", "v2-siege-bar.png"), "полоса осады: форт, таймер, стороны, ворота, знамя двора");
    // 4. пролом
    siege.debug("breach", { gate: "s" });
    // таран и эскорт отходят — пролом виден целиком
    allyAt = null;
    if (ram.mob) ram.mob.unit.y += 300;
    at(UG.ox + 150, UG.oy + 170);
    await sleep(2600);
    save("v2-gate-broken.png", await snap(UG.x, UG.objY - 50, 340, 240));
    const cliBroken = await run<boolean>(`const s = (await import('/src/ui/siege.ts')).siegeView.state; return !!s && s.broken.includes(a);`, UG.id).catch(() => false);
    check(gate.broken, `ворота пали${cliBroken ? ", клиент знает о проломе" : ""}`);
    // 5. королевское знамя во дворе: нападающие спускают знамя обороны
    const B = siegeBannerAt("fort_umbrath");
    allyAt = (i) => ({ x: B.x - 40 + i * 40, y: B.y + 30 });
    at(B.x + 30, B.y + 50);
    await waitFor(() => siege.banner.h < 0.7, 90000);
    await sleep(500);
    save("v2-banner-yard.png", await snap(B.x, B.y - 60, 420, 320));
    check(siege.banner.h < 1 && siege.banner.banner === "umbrath", `знамя обороны спускается (высота ${siege.banner.h.toFixed(2)})`);
    // 6. итоги
    siege.debug("end", { win: "solgard" });
    await page.waitForSelector(".siege-result", { timeout: 10000 });
    await sleep(800);
    check(await shotEl(".siege-result", "v2-result.png"), "окно итогов осады");
    const res = await page.$eval(".siege-result", (e) => e.textContent ?? "");
    check(/взят/.test(res) && /Победа/.test(res), "итог: форт взят, победа");
  } finally {
    clearInterval(keep);
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
    page = (await browser.pages())[0] ?? (await browser.newPage());
    await page.evaluateOnNewDocument(() => {
      (window as any).__name = (t: unknown) => t;
      window.addEventListener("unhandledrejection", (e) => console.error("unhandledrejection: " + String((e.reason && e.reason.stack) || e.reason)));
    });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
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
    fs.writeFileSync(path.join(OUT, "v2-report.json"), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nОсада форта в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
