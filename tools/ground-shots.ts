/**
 * Земля в игре: снимки мест днём и ночью на зуме 2 и 3, по 2 места в ряд (кадры 960×540 из середины экрана без масштаба), кадры затем удаляются.
 * MODE=final (по умолчанию) — финал круга 3 (Аурелион, Мортхейм, Эмберхолл, гарь у повозки, вулкан, снег) → tools/out/ground/final3.png;
 * MODE=scorch — гарь «сейчас | новое» (новое — localStorage scorch = v2, client/src/game/scorch.ts) у повозки, шатра, катапульты, костра, воронки
 * на траве и на голой земле → tools/out/ground/scorch2.png.
 * Порты TEST_PORT 2862 / 5262. Запуск под замком tools/out/scenario.lock снаружи. Время суток — сдвиг Date.now (фаза 0.3 — день, 0.83 — ночь).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { DAY_CYCLE_MS } from "../shared/daynight";

const OUT = path.resolve("tools/out/ground"), TMP = path.join(OUT, `shots-${process.env.MODE ?? "final"}`);
const MODE = process.env.MODE ?? "final";
// место, x, y (пиксели мира); у героя смещение вниз, чтобы место было в середине кадра и не под ногами
const PLACES: [string, number, number][] = MODE === "scorch3" || MODE === "scorchf" ? [
  ["wagon-grass", 14768, 702 + 70], ["tent-bare", 12592, 4606 + 70], ["catapult", 15760, 3550 + 70],
] : MODE === "scorch" ? [
  ["wagon-grass", 14768, 702 + 70], ["tent-bare", 12592, 4606 + 70], ["catapult", 15760, 3550 + 70], ["campfire", 13939, 9116 + 70], ["crater", 15634, 509 + 70],
] : [
  ["aurelion", 38 * 32 + 480, 170 * 32 + 330], ["morthaim", 1047 * 32, 178 * 32], ["emberhall", 535 * 32 + 480, 56 * 32 + 300],
  ["wagon", 472 * 32 + 240, 11 * 32 + 170], ["volcano", 519 * 32 + 480, 339 * 32 + 270], ["snow", 308 * 32 + 600, 50 * 32 + 380],
];
/** Колонки на место: final — один кадр; scorch — «сейчас | новое» (флаг scorch = v2). */
const TAGS: [string, string | null][] = MODE === "scorchf" ? [["now", null]] : MODE === "scorch3" ? [["v2", "v2"], ["A", "A"], ["B", "B"], ["C", "C"]] : MODE === "scorch" ? [["now", null], ["new", "v2"]] : [["now", null]];
const RESULT = MODE === "scorchf" ? "scorch-final.png" : MODE === "scorch3" ? "scorch3.png" : MODE === "scorch" ? "scorch2b.png" : "final3.png";
// день и вечер (фаза 0.66: сумерки, мир читается — по CLAUDE.md ночь светлее, глубокую ночь не снимаем)
const TIMES: [string, number][] = [["day", 0.3], ["evening", 0.6]];
/** Зумы: гарь — только 2 (крупно, 4 страницы на прогон: регистрация — 5 в час с адреса, сервер один). */
const ZOOMS = MODE.startsWith("scorch") ? [2] : [2, 3];
/** Мест в ряд: гарь — одно («сейчас | v2» на всю ширину), финал — два. */
const ROW = MODE.startsWith("scorch") ? 1 : 2;

function montage() {
  const W = 960, H = 540, per = TAGS.length, rowsPer = Math.ceil(PLACES.length / ROW), blocks: [number, string][] = [];
  for (const z of ZOOMS) for (const [t] of TIMES) blocks.push([z, t]);
  const out = new PNG({ width: W * ROW * per, height: H * rowsPer * blocks.length });
  blocks.forEach(([z, t], b) => PLACES.forEach(([p], i) => {
    TAGS.forEach(([tag], k) => {
      const f = path.join(TMP, `${tag}-${p}-z${z}-${t}.png`);
      if (!fs.existsSync(f)) return;
      const src = PNG.sync.read(fs.readFileSync(f)), x0 = Math.floor((src.width - W) / 2), y0 = Math.floor((src.height - H) / 2);
      const cx = ((i % ROW) * per + k) * W, cy = (b * rowsPer + Math.floor(i / ROW)) * H;
      for (let y = 0; y < H; y++) src.data.copy(out.data, ((cy + y) * out.width + cx) * 4, ((y0 + y) * src.width + x0) * 4, ((y0 + y) * src.width + x0 + W) * 4);
    });
  }));
  fs.writeFileSync(path.join(OUT, RESULT), PNG.sync.write(out));
  const missing = blocks.flatMap(([z, t]) => PLACES.flatMap(([p]) => TAGS.map(([tag]) => `${tag}-${p}-z${z}-${t}.png`))).filter((f) => !fs.existsSync(path.join(TMP, f)));
  if (missing.length) console.log("нет кадров:", missing.join(" ")); // кадры остаются — повторный запуск доснимет
  else fs.rmSync(TMP, { recursive: true, force: true });
  console.log("montage ok", blocks.map(([z, t]) => `z${z}-${t}`).join(" "), "— в каждом блоке ряды по 2 места", TAGS.map(([t]) => t).join(" | "));
}

async function shots() {
  const puppeteer = (await import("puppeteer-core")).default;
  const { createServer } = await import("vite");
  const { sleep, startServer, stopServer, PORT } = await import("../tests/harness");
  const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5262;
  fs.mkdirSync(TMP, { recursive: true });
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  // страница на колонку: «сейчас» — без флага, «новое» — флаг гари v2
  let n = 0, id = 0, block = "", acct = "", made = false;
  try {
    for (const z of ZOOMS) for (const [tn, ph] of TIMES) for (const [tag, flag] of TAGS) for (let attempt = 0; attempt < 3; attempt++) {
      // регистрация — 5 в час с адреса (счётчик в памяти сервера): больше 4 страниц на прогон — новый сервер на блок времени суток
      // свежий сервер на каждую страницу (лимит регистраций в памяти сервера) — аккаунт и герой создаются заново
      { await stopServer(); await startServer(true); block = `${z}${tn}`; acct = ""; made = false; }
      // регистрация ограничена 5 в час с адреса: сервер с чистой базой заново на каждый блок (зум × время, 4 страницы)
      // уже снятые кадры пропускаем (повторный запуск продолжает с места сбоя); сбой входа — ещё попытка новой страницей
      const places = PLACES.filter(([p]) => !fs.existsSync(path.join(TMP, `${tag}-${p}-z${z}-${tn}.png`)));
      if (!places.length) break;
      const page = await browser.newPage();
      try {
      page.on("pageerror", (e) => console.error("pageerror", String(e)));
      await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${z}"); ${flag ? `localStorage.setItem("scorch", "${flag}");` : `localStorage.removeItem("scorch");`} } catch {}
        (() => { const n0 = Date.now.bind(Date), C = ${DAY_CYCLE_MS}; const off = ((${ph} * C - (n0() % C)) + C) % C; Date.now = () => n0() + off; })();`);
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      // один аккаунт на сервер (регистрация ограничена): первая страница создаёт, остальные входят
      if (!acct) acct = `Gs${id++}x`;
      const name = acct;
      await page.waitForSelector("#login-name");
      await page.type("#login-name", name); await page.type("#login-pass", "secret");
      if (!made) {
        await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
        await page.waitForSelector(".cs-create input[name=name]", { timeout: 30000 });
        await page.type(".cs-create input[name=name]", name);
        await page.$eval(`.cs-create [data-cls="warrior"]`, (b) => (b as HTMLElement).click());
        await sleep(300);
        await page.click(".cs-create [type=submit]");
        made = true;
      } else await page.click("#login-go");
      await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 30000 });
      await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
      await sleep(300);
      await page.click('.cs-list [data-a="play"]');
      await page.waitForFunction(() => document.getElementById("charsel")!.hidden, { timeout: 120000 });
      await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game"), { timeout: 120000 });
      await sleep(1500);
      const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
      await dbg({ op: "god" });
      await page.evaluate(() => { const f = (window as any).__fx?.debugFx; if (f) { f.rain = 0; f.wet = 0; f.storm = false; f.thunder = false; } }); // без дождя и грозы — земля видна
      for (const [p, x, y] of places) {
        await dbg({ op: "tp", x, y });
        // неуязвимость: hp восстанавливается всё ожидание (мобы Полей не убивают героя), без дождя
        for (let w = 0; w < 9; w++) { await dbg({ op: "god" }); await dbg({ op: "calm" }); await sleep(1000); }
        // связь потеряна (окно «Переподключение») — кадр не снимаем, страница уйдёт на новую попытку
        if (!(await page.evaluate(() => !!(window as any).__net?.online))) throw new Error("нет связи с сервером");
        await page.screenshot({ path: path.join(TMP, `${tag}-${p}-z${z}-${tn}.png`) });
        n++;
      }
      } catch (e) { console.error("попытка", attempt + 1, String(e).slice(0, 120), await page.$eval("#login-error", (el) => el.textContent).catch(() => "")); }
      await page.close();
      await sleep(1000);
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  console.log("shots", n);
  montage();
}

if (process.env.MONTAGE) montage();
else shots().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
