/**
 * Пачка улучшений из docs/plan/next.md (11, 12, 13, 17 + сетка проходимости админки): кадры и монтаж tools/out/phaser-wow/montage.png.
 * Дождь у домов (deathZone), ворота осады (обломки), прыжок (дуга и тень), спираль искр, камера в беге, сетка проходимости.
 * Запуск под замком tools/out/scenario.lock: TEST_PORT=2961 VITE_TEST_PORT=5461 npx tsx tools/phaser-wow-shots.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { sleep, startServer, stopServer, PORT } from "../tests/harness";
import { GATES } from "../shared/siege";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5461, OUT = path.resolve("tools/out/phaser-wow");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;

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

const sc = `window.__game.scene.getScene("game")`;
const frames: string[] = [];

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"], defaultViewport: { width: 960, height: 600 }, protocolTimeout: 600000 });
  const dbg = (page: Page, m: object) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
  const shot = async (page: Page, name: string) => { const f = path.join(OUT, name + ".png"); await page.screenshot({ path: f }); frames.push(f); };
  const fps = (page: Page, ms = 4000) => page.evaluate(`new Promise((r) => { const g = window.__game; setTimeout(() => r(Math.round(g.loop.actualFps * 10) / 10), ${ms}); })`);
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "2"); } catch {}`);
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, "Pw1");
    await dbg(page, { op: "god" });

    // 1. дождь у домов
    const h = (await page.evaluate(`(() => { const s = ${sc}, sp = s.map.playerSpawn; let b = null, bd = 1e9; for (const o of s.map.objects) if (/house/.test(o.kind)) { const d = Math.hypot(o.x - sp.x, o.y - sp.y); if (d < bd) { bd = d; b = o; } } return b ? { x: b.x, y: b.y, kind: b.kind, n: s.weather.roofs.length } : null; })()`)) as { x: number; y: number; kind: string; n: number } | null;
    console.log("дом:", h);
    if (h) {
      await dbg(page, { op: "tp", x: h.x, y: h.y + 70 });
      await page.evaluate(`window.__fx.debugFx.rain = 1; window.__fx.debugFx.storm = false;`);
      await sleep(7000);
      await shot(page, "1-rain-roofs");
      console.log("fps дождь с крышами:", await fps(page));
      await page.evaluate(`(() => { const w = ${sc}.weather; w.roofs = []; w.vis = []; w.drops.deathZones.length = 0; })()`);
      console.log("fps дождь без крыш (до):", await fps(page));
      await page.evaluate(`window.__fx.debugFx.rain = -1;`);
    }

    // 2. ворота осады, обломки
    const g = GATES.find((q) => q.city === "fort_umbrath" && q.side === "s")!;
    await dbg(page, { op: "tp", x: g.x, y: g.objY + 90 });
    await dbg(page, { op: "siege", act: "start", att: "solgard" });
    await sleep(2500);
    await dbg(page, { op: "siege", act: "breach", gate: "s" });
    await sleep(350);
    await shot(page, "2-gate-debris");
    await sleep(1500);
    await dbg(page, { op: "siege", act: "reset" });

    // 3. прыжок: герой как прыгун, кадр на пике (цикл игры спит)
    const sp = (await page.evaluate(`(() => { const s = ${sc}; return { x: s.map.playerSpawn.x, y: s.map.playerSpawn.y + 200 }; })()`)) as { x: number; y: number };
    await dbg(page, { op: "tp", x: sp.x, y: sp.y });
    await sleep(2500);
    await page.evaluate(`(() => { const s = ${sc}, me = s.units.get(window.__net.id); s.fx.play([{ t: "blink", id: window.__net.id, x0: me.x - 170, y0: me.y, x1: me.x + 170, y1: me.y, k: "leap" }]); })()`);
    await sleep(170);
    await page.evaluate(`window.__game.loop.sleep()`);
    await shot(page, "3-jump");
    await page.evaluate(`window.__game.loop.wake()`);
    await sleep(900);

    // 4. спираль искр
    await page.evaluate(`(() => { const s = ${sc}, me = s.units.get(window.__net.id); s.fx.zb.spiral(me, 4000, 0xffd27a); })()`);
    await sleep(1600);
    await shot(page, "4-spiral");
    console.log("fps со спиралью:", await fps(page, 2000));

    // 5. камера в беге: смещение followOffset, герой не по центру
    // клавиатура в headless не доходит до игры: бег подаётся прямо в camLeadStep (то же, что делает update при ходьбе вправо)
    await page.evaluate(`(() => { const s = ${sc}; window.__lead = setInterval(() => s.camLeadStep(0.016, { x: 1, y: 0 }), 16); })()`);
    await sleep(2500);
    const cam = await page.evaluate(`(() => { const s = ${sc}, c = s.cameras.main, me = s.units.get(window.__net.id); return { lead: s.camLead, fo: [c.followOffset.x, c.followOffset.y], dx: me.sprite.x - c.midPoint.x, dead: s.camDead }; })()`);
    console.log("камера в беге:", JSON.stringify(cam));
    await shot(page, "5-camera-run");
    await page.evaluate(`clearInterval(window.__lead)`);
    await sleep(2500);
    console.log("камера стоя:", JSON.stringify(await page.evaluate(`(() => { const s = ${sc}; return s.camLead; })()`)));
    console.log("fps камера вкл:", await fps(page, 2500));

    // 6. сетка проходимости
    await page.evaluate(`(async () => { (await import('/src/game/collisionDebug.ts')).collisionDebug.on = true; })()`);
    await sleep(1200);
    await shot(page, "6-collision-grid");
    await page.evaluate(`(async () => { (await import('/src/game/collisionDebug.ts')).collisionDebug.on = false; })()`);
    await page.close();
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  // монтаж 3x2: центр каждого кадра 640x400
  const W = 640, H = 400, cols = 3, rows = Math.ceil(frames.length / cols), out = new PNG({ width: W * cols, height: H * rows });
  frames.forEach((f, i) => {
    const src = PNG.sync.read(fs.readFileSync(f)), ox = Math.max(0, (src.width - W) >> 1), oy = Math.max(0, (src.height - H) >> 1);
    PNG.bitblt(src, out, ox, oy, Math.min(W, src.width), Math.min(H, src.height), (i % cols) * W, Math.floor(i / cols) * H);
  });
  fs.writeFileSync(path.join(OUT, "montage.png"), PNG.sync.write(out));
  for (const f of frames) fs.rmSync(f, { force: true });
  console.log("монтаж:", path.join(OUT, "montage.png"));
}
main().catch((e) => { console.error(e); process.exit(1); });
