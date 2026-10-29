/**
 * Камень телепорта v2 (tools/gen/teleport-v2.ts) «сейчас | новое» в сцене: в браузере текстура камня подменяется на лету (игра и ассеты
 * не меняются), снимки на тех же местах — Аурелион (sol), Мортхейм (umb), Эмберхолл (neutral), зум 1,75 и 3, день и ночь.
 * Монтаж → tools/out/perspective/teleport.png. Порты TEST_PORT 2872 / 5272, замок tools/out/scenario.lock берёт сам. MONTAGE=1 — только монтаж.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { CITIES } from "../shared/cities";
import { teleportStoneV2, type TpVariant } from "./gen/teleport-v2";

const OUT = path.resolve("tools/out/perspective"), DIR = path.join(OUT, "tp"), LOCK = path.resolve("tools/out/scenario.lock");
fs.mkdirSync(DIR, { recursive: true });
const PLACES: [string, TpVariant][] = [["aurelion", "sol"], ["morthaim", "umb"], ["ember", "neutral"]];
const ZOOMS = process.env.ZOOMS ? process.env.ZOOMS.split(",").map(Number) : [1.75, 2, 3], TIMES: [string, number][] = [["day", 0.3], ["night", 0.83]];
const W = 1366, H = 768, CW = 420, CH = 330;
const pngB64 = (v: TpVariant) => { const c = teleportStoneV2(v); const p = new PNG({ width: c.w, height: c.h }); Buffer.from(c.data.buffer).copy(p.data); return PNG.sync.write(p).toString("base64"); };

async function withLock<R>(f: () => Promise<R>): Promise<R> {
  for (let i = 0; ; i++) {
    try { fs.mkdirSync(LOCK); break; } catch { if (i % 12 === 0) console.log("жду замок"); await new Promise((r) => setTimeout(r, 5000)); }
  }
  fs.writeFileSync(path.join(LOCK, "owner"), `teleport-v2 ${process.pid} ${new Date().toISOString()}\n`);
  try { return await f(); } finally { fs.rmSync(LOCK, { recursive: true, force: true }); }
}

/** Подмена текстуры камня строкой (tsx вставляет __name в функции, переданные в evaluate). */
const SWAP_JS = (b64: string, key: string) => `(async () => {
  const sc = window.__game.scene.getScene("game");
  if (!sc.textures.exists("${key}")) { const img = new Image(); img.src = "data:image/png;base64,${b64}"; await img.decode(); sc.textures.addImage("${key}", img); sc.textures.get("${key}").setFilter(1); }
  let k = 0;
  const walk = function (list) { for (const o of list) { if (o.list) walk(o.list); const f = o.frame && o.frame.name, t = o.texture && o.texture.key; if (f === "teleport_stone" || t === "o_teleport_stone") { o.setTexture("${key}"); k++; } } };
  walk(sc.children.list);
  return k;
})()`;

async function shots() {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const VITE_PORT = 5272;
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", `--window-size=${W},${H}`, "--no-sandbox"], defaultViewport: { width: W, height: H }, protocolTimeout: 1800000 });
  const tex = Object.fromEntries(PLACES.map(([, v]) => [v, pngB64(v)]));
  try {
    let n = 0;
    for (const Z of ZOOMS) for (const [tn, ph] of TIMES) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("pageerror", String(e)));
      await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${Z}"); localStorage.setItem("shadowMode", "dynamic"); } catch {}
        (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; const off = ((${ph} * C - (n0() % C)) + C) % C; Date.now = () => n0() + off; })();`);
      let name = "";
      for (let a = 0; ; a++) { // регистрация иногда не успевает (тяжёлая страница на swiftshader): повтор с новым именем
        await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
        name = `Tp${n++}${tn[0]}${Date.now() % 10000}`;
        await page.waitForSelector("#login-name");
        await page.type("#login-name", name); await page.type("#login-pass", "secret");
        await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
        try { await page.waitForSelector(".cs-create input[name=name]", { timeout: 45000 }); break; } catch (e) { if (a >= 2) throw e; console.log("повтор входа", a + 1); }
      }
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
      const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
      await dbg({ op: "god" });
      for (const [id, v] of PLACES) {
        const c = CITIES.find((q) => q.id === id)!;
        const hx = c.stone.x + 30, hy = c.stone.y + 6;
        await dbg({ op: "tp", x: hx, y: hy });
        await sleep(6000);
        // экранная точка камня по камере и масштабу холста (у камеры бывает смещение от героя)
        const [ox, oy] = (await page.evaluate(`(() => { const sc = window.__game.scene.getScene("game"), cam = sc.cameras.main, cv = window.__game.canvas, r = cv.getBoundingClientRect(), k = r.width / cv.width; return [r.left + (${c.stone.x} - cam.worldView.x) * cam.zoom * k, r.top + (${c.stone.y} - cam.worldView.y) * cam.zoom * k]; })()`)) as number[];
        const clip = { x: Math.round(Math.max(0, Math.min(W - CW, ox - CW / 2 + 20))), y: Math.round(Math.max(0, Math.min(H - CH, oy - CH + 70))), width: CW, height: CH };
        const tag = `${id}-z${Z}-${tn}`;
        await page.screenshot({ path: path.join(DIR, `${tag}-now.png`), clip });
        // подмена текстуры камня (и его тени — копии кадра) на v2, только в этой вкладке
        const swapped = await page.evaluate(SWAP_JS(tex[v], `tp2_${v}`));
        await sleep(800);
        await page.screenshot({ path: path.join(DIR, `${tag}-new.png`), clip });
        console.log("снят", tag, "подменено", swapped);
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
  // крупно: кадры ×4 на земле каждой площади
  const big = (v: TpVariant) => `<img class=big src="data:image/png;base64,${pngB64(v)}">`;
  const names: Record<string, string> = { aurelion: "Аурелион (Сольгард)", morthaim: "Мортхейм (Умбрат)", ember: "Эмберхолл (нейтральный)" };
  let rows = "";
  for (const [id, v] of PLACES) {
    rows += `<h4>${names[id]} — вариант ${v}</h4><div class=row><figure>${big(v)}<figcaption>новый кадр 48×76, ×4</figcaption></figure>`;
    for (const Z of ZOOMS) for (const [tn] of TIMES) rows += `<figure><div class=pair>${img(`${id}-z${Z}-${tn}-now.png`)}${img(`${id}-z${Z}-${tn}-new.png`)}</div><figcaption>зум ${Z}, ${tn === "day" ? "день" : "ночь"}: слева сейчас · справа новое</figcaption></figure>`;
    rows += "</div>";
  }
  const html = `<html><body><h3>Камень телепорта v2 — «сейчас | новое» на тех же местах карты (в игру не включён)</h3>
  <p>Цоколь-ступень 32 px = клетка коллизии, видны верх и лицо · постамент с верхом и рунами фракции · кристалл в оправе, его тень на постаменте · AO 2 px под цоколем, пустых рядов снизу нет — длинная тень от основания.</p>${rows}
  <style>body{margin:0;padding:8px;background:#14121a;color:#f0e2c0;font:13px "Segoe UI",sans-serif}h3,h4{margin:6px 4px;color:#ffd890}p{margin:4px}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}figure{margin:0;background:#1e1a26;padding:4px;border:1px solid #3a3448}.pair{display:flex;gap:4px}.pair img{width:420px;height:330px}img{image-rendering:pixelated;display:block}.big{width:192px;height:304px;background:#463e40}figcaption{padding-top:3px;color:#9be08a}.miss{width:420px;height:330px;color:#f66}</style></body></html>`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"], defaultViewport: { width: 2000, height: 900 } });
  try { const page = await browser.newPage(); await page.setContent(html); await page.screenshot({ path: path.join(OUT, "teleport.png"), fullPage: true }); } finally { await browser.close(); }
  console.log("teleport.png");
}

if (process.env.MONTAGE) montage().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
else withLock(shots).then(() => montage()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
