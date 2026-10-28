/** Снимки встроенных эффектов Phaser (lights.ts, postfx.ts, weather.ts): ночь у факелов, лава, гроза, низкое здоровье — «Полные» и «Простые». Лист → tools/out/fx/compare.png.
 *  Время подменяется через Date.now. Порты 2851 / 5251. Запуск под замком tools/out/scenario.lock снаружи. */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { weatherAt, WEATHER_SLOT_MS } from "../shared/weather";
import { sleep, startServer, stopServer, PORT } from "./harness";

const VITE_PORT = 5251, OUT = path.resolve("tools/out/fx");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
// смещения часов: ночь без дождя, день с дождём
const base = Math.floor(Date.now() / DAY_CYCLE_MS) * DAY_CYCLE_MS;
let nightMs = base + DAY_CYCLE_MS * 0.82;
for (let t = nightMs; t < nightMs + 40 * WEATHER_SLOT_MS; t += WEATHER_SLOT_MS) if (weatherAt(t).rain === 0) { nightMs = t; break; }

async function login(page: Page, name: string) {
  await page.waitForSelector("#login-name");
  await page.type("#login-name", name); await page.type("#login-pass", "secret");
  await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
  await page.waitForSelector(".cs-create input[name=name]", { timeout: 10000 });
  await page.type(".cs-create input[name=name]", name);
  await page.$eval(`.cs-create [data-cls="warrior"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click(".cs-create [type=submit]");
  await page.waitForSelector(".cs-list .cs-slot[data-name]", { timeout: 10000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => document.getElementById("charsel")!.hidden, { timeout: 120000 });
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game"), { timeout: 120000 });
  await sleep(1500);
}

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const gpu = process.env.GPU === "1";
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: gpu ? ["--ignore-gpu-blocklist", "--disable-gpu-sandbox", "--no-sandbox"] : ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"], defaultViewport: { width: 1000, height: 600 }, protocolTimeout: 600000 });
  const shots: Record<string, Buffer> = {};
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, `Fx${process.pid % 1000}`);
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    const setNow = (ms: number) => page.evaluate((target) => { const real = Date.now.bind(Date), off = target - real(); (Date as any).now = () => real() + off; }, ms);
    await page.evaluate(() => (window as any).__game.scene.getScene("game").cameras.main.setZoom(1.75));
    const fps = (ms = 5000) => page.evaluate((d) => new Promise<number>((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < d) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }), ms);
    const goto = async (x: number, y: number) => {
      await dbg({ op: "tp", x, y });
      await page.waitForFunction((tx: number, ty: number) => { const sc = (window as any).__game.scene.getScene("game"); return Math.hypot(sc.pos.x - tx, sc.pos.y - ty) < 120; }, { timeout: 30000 }, x, y).catch(() => console.log("tp не дошёл", x, y));
      await sleep(5000);
    };
    // один и тот же кадр в трёх режимах, одна вкладка: old — Простые + плоское затемнение; nomask — Полные без маски; new — Полные + маска
    const cfg = async (m: "old" | "nomask" | "new") => { await page.evaluate((mm) => { const f = (window as any).__fx; f.setVfxMode(mm === "old" ? "simple" : "full"); f.setNightMask(mm === "new"); }, m); await sleep(1800); };
    const LBL: Record<string, string> = { old: "ДО: простые, плоское затемнение", nomask: "полные, без маски", new: "ПОСЛЕ: полные, свет + маска" };
    const snap = async (name: string, label: string, m: "old" | "new", full = false, extra = "") => {
      const cap = `${label} | ${LBL[m]}${extra}`;
      await page.evaluate((c, fl) => { const d = document.createElement("div"); d.id = "fxcap"; d.textContent = c; d.style.cssText = `position:fixed;left:${fl ? 2 : 262}px;top:${fl ? 2 : 152}px;z-index:99999;background:#000c;color:#fff;font:bold ${fl ? 26 : 13}px sans-serif;padding:3px 8px`; document.body.appendChild(d); }, cap, full);
      shots[`${name}-${m}`] = Buffer.from(await page.screenshot({ clip: full ? { x: 0, y: 0, width: 1000, height: 600 } : { x: 260, y: 150, width: 480, height: 300 } }));
      await page.evaluate(() => document.getElementById("fxcap")?.remove());
    };
    const find = (kinds: string[], nx: number, ny: number) => page.evaluate((ks, nx, ny) => {
      const o = (window as any).__game.scene.getScene("game").map.objects.filter((o: any) => ks.includes(o.kind));
      o.sort((a: any, b: any) => Math.hypot(a.x - nx, a.y - ny) - Math.hypot(b.x - nx, b.y - ny));
      return o[0] ? { x: o[0].x as number, y: o[0].y as number, kind: o[0].kind as string } : null;
    }, kinds, nx, ny);
    const lamp = await find(["lamp"], 1800, 5800);
    const torch = await find(["torch", "brazier", "bf-fire-s", "bf-fire-m", "bf-forge-small", "soul_brazier"], 1800, 5800);
    const tavern = await find(["tavern"], 1800, 5800);
    const camp = await find(["campfire"], 1800, 5800);
    const vent = await find(["ember_vent"], 1800, 5800);
    console.log(JSON.stringify({ lamp, torch, tavern, camp, vent }));
    await setNow(nightMs);
    const night: [string, string, { x: number; y: number } | null][] = [["lamp", "Ночь: улица, фонари", lamp], ["torch", "Ночь: факелы / жаровни", torch], ["tavern", "Ночь: окна таверны", tavern], ["camp", "Ночь: костёр в лесу", camp], ["vent", "Ночь: лава / жар", vent]];
    for (const [n, label, sp] of night) {
      if (!sp) { console.log("нет точки", n); continue; }
      await goto(sp.x + (n === "lamp" ? 40 : 0), sp.y + (n === "lamp" ? 6 : 50));
      if (n === "lamp") { for (const m of ["old", "nomask", "new"] as const) { await cfg(m); console.log("fps лампа", m, (await fps()).toFixed(1)); } }
      for (const m of ["old", "new"] as const) { await cfg(m); await snap(n, label, m); }
    }
    if (lamp) {
      await setNow(base + DAY_CYCLE_MS * 0.3); await goto(lamp.x, lamp.y + 50);
      const fx = (code: string) => page.evaluate(code);
      await fx(`window.__fx.debugFx.rain = 1; window.__fx.debugFx.storm = true`);
      for (const m of ["old", "new"] as const) {
        await cfg(m); await sleep(3000);
        await fx(`window.__fx.debugFx.thunder = true`); await sleep(250);
        await snap("rain", "Дождь с грозой (принудительно)", m, true);
      }
      await fx(`window.__fx.debugFx.rain = -1; window.__fx.debugFx.hp = 0.12`);
      for (const m of ["old", "new"] as const) { await cfg(m); await snap("lowhp", "Низкое здоровье: виньетка", m, true); }
      await fx(`window.__fx.debugFx.hp = -1; window.__fx.debugFx.dead = true`);
      for (const m of ["old", "new"] as const) { await cfg(m); await snap("death", "Смерть героя: мир сереет", m, true); }
    }
    await page.close();
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  const scenes = ["lamp", "torch", "tavern", "camp", "vent", "rain", "lowhp", "death"].filter((n) => shots[`${n}-old`] && shots[`${n}-new`]);
  const W = 480, H = 300, rows = Math.ceil(scenes.length / 2), sheet = new PNG({ width: W * 4, height: H * rows });
  scenes.forEach((n, i) => ["old", "new"].forEach((m, c) => { const r = Math.floor(i / 2), cc = (i % 2) * 2 + c; const p = PNG.sync.read(shots[`${n}-${m}`]); if (p.width > W * 1.5) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = ((y * 2) * p.width + x * 2) * 4, b = ((r * H + y) * sheet.width + cc * W + x) * 4; for (let k = 0; k < 4; k++) sheet.data[b + k] = p.data[a + k]; } } else PNG.bitblt(p, sheet, 0, 0, Math.min(W, p.width), Math.min(H, p.height), cc * W, r * H); fs.writeFileSync(path.join(OUT, `${n}-${m}.png`), shots[`${n}-${m}`]); }));
  fs.writeFileSync(path.join(OUT, "compare.png"), PNG.sync.write(sheet));
  console.log("compare.png готов");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
