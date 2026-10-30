/**
 * «Было | стало» исправления парения (docs/art/perspective.md §4): опора по основанию (manifest.foot), AO под кадрами без контакта,
 * тени анимированных знамён и оберегов, камень телепорта v2. TAG=before — снимать до пересборки ассетов (window.__perspOld выключает
 * новое в клиенте), TAG=after — после npm run assets. Утро и вечер, зум 2 и 3. MONTAGE=1 — монтаж tools/out/perspective/fix.png.
 * Порты TEST_PORT 2873 / 5273, замок tools/out/scenario.lock берёт сам.
 */
import fs from "node:fs";
import path from "node:path";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { generateMap } from "../shared/map";
import { CITIES } from "../shared/cities";
import { MAP_SEED } from "../shared/constants";

const OUT = path.resolve("tools/out/perspective"), DIR = path.join(OUT, "fix"), LOCK = path.resolve("tools/out/scenario.lock");
fs.mkdirSync(DIR, { recursive: true });
const TAG = process.env.TAG ?? "after", W = 1366, H = 768, CW = 440, CH = 330;
const ZOOMS = [2, 3], TIMES: [string, number][] = [["morning", 0.12], ["evening", 0.58]];

function places(): [string, string, number, number][] {
  const m = generateMap(MAP_SEED), st = (id: string) => CITIES.find((c) => c.id === id)!.stone;
  const first = (k: string) => m.objects.find((o) => o.kind === k)!;
  // камни на лугу: камень, вокруг которого больше всего дубов
  const oaks = m.objects.filter((o) => o.kind === "v_basic_oak" || o.kind === "v_basic_oak_small");
  let rock = first("rock"), best = -1;
  for (const r of m.objects) if (r.kind === "rock" || r.kind === "big_rock") { const n = oaks.filter((o) => Math.abs(o.x - r.x) < 160 && Math.abs(o.y - r.y) < 160).length; if (n > best) { best = n; rock = r; } }
  return [
    ["aurelion", "Аурелион, камень телепорта", st("aurelion").x, st("aurelion").y],
    ["meadow", "камни на лугу", rock.x, rock.y],
    ["well", "колодец (Эмберхолл)", first("well").x, first("well").y],
    ["market", "рынок, прилавки", first("stall_blue").x, first("stall_blue").y],
    ["palisade", "ворота частокола", first("pal_gate_sol").x, first("pal_gate_sol").y],
    ["tents", "шатры форта", first("bf_tent_sol").x, first("bf_tent_sol").y],
    ["banner", "знамя (анимация)", first("std-home-sol").x, first("std-home-sol").y],
    ["morthaim", "Мортхейм, камень телепорта", st("morthaim").x, st("morthaim").y],
  ];
}

async function withLock<R>(f: () => Promise<R>): Promise<R> {
  // два слота тяжёлых прогонов: scenario.lock и scenario.lock2 — берём любой свободный
  let lock = "";
  for (let i = 0; !lock; i++) {
    for (const l of [LOCK, LOCK + "2"]) { try { fs.mkdirSync(l); lock = l; break; } catch { /* занят */ } }
    if (!lock) { if (i % 12 === 0) console.log("жду замок"); await new Promise((r) => setTimeout(r, 5000)); }
  }
  fs.writeFileSync(path.join(lock, "owner"), `fix-shots ${TAG} ${process.pid} ${new Date().toISOString()}\n`);
  try { return await f(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}

async function shots() {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const VITE_PORT = 5273;
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", `--window-size=${W},${H}`, "--no-sandbox"], defaultViewport: { width: W, height: H }, protocolTimeout: 1800000 });
  const P = places();
  let n = 0;
  try {
    for (const Z of ZOOMS) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("pageerror", String(e)));
      // время суток меняется на лету: window.__dayOff (смещение Date.now), длинные тени — от него же
      await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${Z}"); localStorage.setItem("shadowMode", "dynamic"); } catch {}
        ${TAG === "before" ? "window.__perspOld = true;" : ""}
        (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; window.__setDay = (p) => { window.__dayOff = ((p * C - (n0() % C)) + C) % C; }; window.__setDay(${TIMES[0][1]}); Date.now = () => n0() + window.__dayOff; })();`);
      let name = "";
      for (let a = 0; ; a++) {
        await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
        name = `Fx${TAG[0]}${n++}${Date.now() % 10000}`;
        await page.waitForSelector("#login-name");
        await page.type("#login-name", name); await page.type("#login-pass", "secret");
        await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
        try { await page.waitForSelector(".cs-create input[name=name]", { timeout: 45000 }); break; } catch (e) { if (a >= 2) throw e; console.log("повтор входа", a + 1); }
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
      await sleep(1500);
      const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
      await dbg({ op: "god" });
      for (const [id, , x, y] of P) {
        await dbg({ op: "tp", x: x + 40, y: y + 10 });
        await sleep(6000);
        for (const [tn, ph] of TIMES) {
          await page.evaluate(`window.__setDay(${ph})`);
          await sleep(5500); // тени пересчитываются шагом 5 с
          const [ox, oy] = (await page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"), cam = sc.cameras.main, cv = window.__game.canvas, r = cv.getBoundingClientRect(), k = r.width / cv.width; return [r.left + (${x} - cam.worldView.x) * cam.zoom * k, r.top + (${y} - cam.worldView.y) * cam.zoom * k]; })()`)) as number[];
          const clip = { x: Math.round(Math.max(0, Math.min(W - CW, ox - CW / 2))), y: Math.round(Math.max(0, Math.min(H - CH, oy - CH + 90))), width: CW, height: CH };
          await page.screenshot({ path: path.join(DIR, `${id}-z${Z}-${tn}-${TAG}.png`), clip });
        }
        console.log("снят", id, Z, TAG);
      }
      await page.close();
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}

async function montage() {
  const puppeteer = (await import("puppeteer-core")).default;
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  const img = (f: string) => fs.existsSync(path.join(DIR, f)) ? `<img src="data:image/png;base64,${fs.readFileSync(path.join(DIR, f)).toString("base64")}">` : "<div class=miss>нет кадра</div>";
  let rows = "";
  for (const [id, label] of places()) {
    rows += `<h4>${label}</h4><div class=row>`;
    for (const Z of ZOOMS) for (const [tn] of TIMES) rows += `<figure><div class=pair>${img(`${id}-z${Z}-${tn}-before.png`)}${img(`${id}-z${Z}-${tn}-after.png`)}</div><figcaption>зум ${Z}, ${tn === "morning" ? "утро" : "вечер"}: слева было · справа стало</figcaption></figure>`;
    rows += "</div>";
  }
  const html = `<html><body><h3>Парение объектов: «было | стало» (опора по основанию, AO, тени анимированных, камень телепорта v2)</h3>${rows}
  <style>body{margin:0;padding:8px;background:#14121a;color:#f0e2c0;font:13px "Segoe UI",sans-serif}h3,h4{margin:6px 4px;color:#ffd890}.row{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0;background:#1e1a26;padding:4px;border:1px solid #3a3448}.pair{display:flex;gap:4px}.pair img{width:330px;height:248px}img{image-rendering:pixelated;display:block}figcaption{padding-top:3px;color:#9be08a}.miss{width:330px;height:248px;color:#f66}</style></body></html>`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"], defaultViewport: { width: 2760, height: 900 } });
  try { const page = await browser.newPage(); await page.setContent(html); await page.screenshot({ path: path.join(OUT, "fix.png"), fullPage: true }); } finally { await browser.close(); }
  console.log("fix.png");
}

setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 50 * 60 * 1000).unref();
if (process.env.MONTAGE) montage().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
else withLock(shots).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
