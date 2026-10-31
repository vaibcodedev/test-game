/**
 * Снимки «герой вплотную к объекту» (docs/art/perspective.md «Коллизии объектов»): бочка, дом, камень, дерево — с 4 сторон, зум 3, день.
 * Герой ставится в 50 px от основания и идёт клавишей к объекту до упора; в лог — зазор тела до прямоугольника основания (сервер и клиент).
 * Замок tools/out/scenario.lock2 (берёт сам, чужой не трогает), свой порт: $env:TEST_PORT="2961"; npx tsx tools/collision-shots.ts
 * → tools/out/collision/<объект>-<сторона>.png
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { generateMap, moveWithCollision, objBox, walkable, type MapObject, type WorldMap } from "../shared/map";
import { MAP_SEED, PLAYER_RADIUS, TILE } from "../shared/constants";

const OUT = path.resolve("tools/out/collision"), LOCK = path.resolve("tools/out/scenario.lock2");
const W = 1366, H = 768, CW = 520, CH = 400, VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5361, R = PLAYER_RADIUS, HH = R / 2;
type Side = "south" | "north" | "west" | "east";
const SIDES: [Side, number, number, string][] = [["south", 0, 1, "ArrowUp"], ["north", 0, -1, "ArrowDown"], ["west", -1, 0, "ArrowRight"], ["east", 1, 0, "ArrowLeft"]];

/** Старт в 50 px от основания с этой стороны и точка упора (симуляция той же moveWithCollision). */
function plan(m: WorldMap, o: MapObject) {
  const b = objBox(o)!, cx = b[1] - b[0] > 60 ? b[0] + (b[1] - b[0]) * 0.22 : (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2; // у дома — в стороне от двери (вход в зал)
  const out: { side: Side; key: string; sx: number; sy: number; ex: number; ey: number }[] = [];
  for (const [side, dx, dy, key] of SIDES) {
    const sx = dx ? (dx < 0 ? b[0] - R - 50 : b[1] + R + 50) : cx, sy = dy ? (dy < 0 ? b[2] - HH - 50 : b[3] + HH + 50) : cy;
    if (!walkable(m, sx, sy, R)) return null;
    let p = { x: sx, y: sy };
    for (let k = 0; k < 40; k++) p = moveWithCollision(m, p.x, p.y, -dx * 3, -dy * 3, R);
    const g = Math.max(b[0] - (p.x + R), (p.x - R) - b[1], b[2] - (p.y + HH), (p.y - HH) - b[3]);
    if (g < 0 || g > 2) return null;
    out.push({ side, key, sx, sy, ex: p.x, ey: p.y });
  }
  return out;
}
function targets() {
  const m = generateMap(MAP_SEED), res: { id: string; o: MapObject; p: NonNullable<ReturnType<typeof plan>> }[] = [];
  for (const [id, re] of [["barrel", /^barrel$/], ["house", /^(house|sol_house)$/], ["rock", /^rock$/], ["tree", /^v_basic_oak(_big)?$/]] as const) {
    for (const o of m.objects) { if (!re.test(o.kind)) continue; const p = plan(m, o); if (p) { res.push({ id, o, p }); break; } }
  }
  return { m, res };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { res } = targets();
  for (const t of res) console.log("объект", t.id, t.o.kind, t.o.x, t.o.y, objBox(t.o));
  if (process.env.PLAN) return;
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(LOCK); break; } catch { if (i % 12 === 0) console.log("жду замок lock2"); await new Promise((r) => setTimeout(r, 5000)); }
  }
  fs.writeFileSync(path.join(LOCK, "owner"), `collision-shots ${process.pid} ${new Date().toISOString()}\n`);
  try {
    try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* ok */ }
    await shots(res);
  } finally { fs.rmSync(LOCK, { recursive: true, force: true }); }
}

async function shots(res: ReturnType<typeof targets>["res"]) {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", `--window-size=${W},${H}`, "--no-sandbox"], defaultViewport: { width: W, height: H }, protocolTimeout: 1800000 });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    page.on("pageerror", (e) => console.error("pageerror", String(e).slice(0, 160)));
    await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "3"); } catch {}
      (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; const off = ((0.3 * C - (n0() % C)) + C) % C; Date.now = () => n0() + off; })();`);
    const name = `Col${Date.now() % 100000}`;
    for (let a = 0; ; a++) {
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      await page.waitForSelector("#login-name");
      await page.type("#login-name", name + a); await page.type("#login-pass", "secret");
      await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
      try { await page.waitForSelector(".cs-create input[name=name]", { timeout: 45000 }); break; } catch (e) { if (a >= 2) throw e; }
    }
    await page.type(".cs-create input[name=name]", name);
    await page.$eval(`.cs-create [data-cls="warrior"]`, (b) => (b as HTMLElement).click());
    await sleep(300);
    await page.click(".cs-create [type=submit]");
    await page.waitForSelector(".cs-list .cs-slot[data-name]", { timeout: 20000 });
    await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
    await sleep(300);
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => document.getElementById("charsel")!.hidden, { timeout: 120000 });
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game"), { timeout: 120000 });
    await sleep(2000);
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    await page.evaluate(`(() => { const a = document.activeElement; if (a && a.blur) a.blur(); })()`);
    for (const t of res) {
      const b = objBox(t.o)!;
      for (const s of t.p) {
        await dbg({ op: "tp", x: s.sx, y: s.sy });
        // ждать, пока клиент примет позицию сервера (поправка предсказания приходит не сразу)
        for (let k = 0; k < 60; k++) { await sleep(500); const q = (await page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"); return [sc.pos.x, sc.pos.y]; })()`)) as number[]; if (Math.hypot(q[0] - s.sx, q[1] - s.sy) < 1) break; if (k === 59) console.log("не дождался тп", t.id, s.side, q); }
        await sleep(t.p.indexOf(s) ? 1000 : 5000);
        // держать клавишу, пока герой идёт (headless рисует медленно: шаг за кадр мал), максимум 25 с
        const pos = async () => (await page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"); return [sc.pos.x, sc.pos.y]; })()`)) as number[];
        // ввод — тем же сообщением input, что шлёт клавиатура клиента (сервер двигает героя той же moveWithCollision)
        const dir = SIDES.find((q) => q[0] === s.side)!, inp = (mx: number, my: number) => page.evaluate((a: number, b2: number) => (window as any).__net.send("input", { mx: a, my: b2 }), mx, my);
        let prev = await pos(), still = 0;
        for (let k = 0; k < 60 && still < 3; k++) { await inp(-dir[1], -dir[2]); await sleep(400); const q = await pos(); still = Math.hypot(q[0] - prev[0], q[1] - prev[1]) < 0.05 && Math.hypot(q[0] - s.sx, q[1] - s.sy) > 5 ? still + 1 : 0; prev = q; }
        await inp(0, 0); await sleep(1500);
        const hp = await pos();
        const g = Math.max(b[0] - (hp[0] + R), (hp[0] - R) - b[1], b[2] - (hp[1] + HH), (hp[1] - HH) - b[3]);
        const [ox, oy] = (await page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"), cam = sc.cameras.main, cv = window.__game.canvas, r = cv.getBoundingClientRect(), k = r.width / cv.width; return [r.left + (${(b[0] + b[1]) / 2} - cam.worldView.x) * cam.zoom * k, r.top + (${b[3]} - cam.worldView.y) * cam.zoom * k]; })()`)) as number[];
        const clip = { x: Math.round(Math.max(0, Math.min(W - CW, ox - CW / 2))), y: Math.round(Math.max(0, Math.min(H - CH, oy - CH * 0.62))), width: CW, height: CH };
        await page.screenshot({ path: path.join(OUT, `${t.id}-${s.side}.png`) as `${string}.png`, clip });
        console.log(`${t.id} ${s.side}: герой (${hp[0].toFixed(1)}, ${hp[1].toFixed(1)}), ожидали (${s.ex.toFixed(1)}, ${s.ey.toFixed(1)}), зазор ${g.toFixed(2)} px`);
      }
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}
void TILE;
main().catch((e) => { console.error(e); process.exit(1); });
