/** Снимки вау-эффектов из НАСТОЯЩЕЙ игры (fx/host.ts, включено через localStorage wowFx=1): город, Поля, пустошь, бой, вход к боссу, телепорт.
 *  Лист → tools/out/wow/ingame.png. Запуск под замком tools/out/scenario.lock снаружи. Порты 2852 / 5252 (как fx-shots, но свои). */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { sleep, startServer, stopServer, PORT } from "./harness";

const VITE_PORT = 5252, OUT = path.resolve("tools/out/wow");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
const base = Math.floor(Date.now() / DAY_CYCLE_MS) * DAY_CYCLE_MS, dayMs = base + DAY_CYCLE_MS * 0.3;

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

/** Ждёт, пока камера встанет: scroll не меняется ~0,8 с подряд. */
async function settle(page: Page) {
  let prev = "", same = 0;
  for (let i = 0; i < 80 && same < 3; i++) {
    const cur = await page.evaluate(() => { const c = (window as any).__game.scene.getScene("game").cameras.main; return `${c.scrollX.toFixed(1)},${c.scrollY.toFixed(1)}`; });
    same = cur === prev ? same + 1 : 0; prev = cur; await sleep(300);
  }
}

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"], defaultViewport: { width: 1000, height: 600 }, protocolTimeout: 600000 });
  const shots: { label: string; png: Buffer }[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    page.on("console", (m) => { if (m.text().startsWith("[wow]")) console.log(m.text()); });
    await page.evaluateOnNewDocument(() => { (window as any).__name = (f: unknown) => f; try { localStorage.setItem("vfxMode", "full"); localStorage.setItem("wowFx", "1"); } catch {} });
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, `Wow${process.pid % 1000}`);
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    await page.evaluate((C) => { const D = Date.now.bind(Date); (Date as any).now = () => Math.floor(D() / C) * C + Math.round(C * 0.3); (window as any).__fx.debugFx.rain = 0; }, DAY_CYCLE_MS);
    const goto = async (x: number, y: number) => {
      await dbg({ op: "tp", x, y });
      await page.waitForFunction((tx: number, ty: number) => { const sc = (window as any).__game.scene.getScene("game"); return Math.hypot(sc.pos.x - tx, sc.pos.y - ty) < 120; }, { timeout: 30000 }, x, y).catch(() => console.log("tp не дошёл", x, y));
      await sleep(3500);
    };
    const snap = async (label: string, waitMs = 0, full = false) => {
      if (waitMs) await sleep(waitMs);
      await page.evaluate((c) => { const d = document.createElement("div"); d.id = "fxcap"; d.textContent = c; d.style.cssText = "position:fixed;left:182px;top:102px;z-index:99999;background:#000c;color:#fff;font:bold 13px Arial;padding:3px 6px"; document.body.appendChild(d); }, label);
      shots.push({ label, png: Buffer.from(await page.screenshot({ clip: full ? { x: 0, y: 0, width: 1000, height: 600 } : { x: 180, y: 100, width: 640, height: 400 } })) });
      await page.evaluate(() => document.getElementById("fxcap")?.remove());
    };
    // точка зоны: ближайшая к центру тяжести клеток зоны
    const zonePt = (z: number) => page.evaluate((zz) => {
      const m = (window as any).__game.scene.getScene("game").map; let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < m.h; y += 4) for (let x = 0; x < m.w; x += 4) if (m.zone[y * m.w + x] === zz) { sx += x; sy += y; n++; }
      if (!n) return null; const cx = sx / n, cy = sy / n; let best: any = null, bd = 1e9;
      for (let y = 0; y < m.h; y += 4) for (let x = 0; x < m.w; x += 4) if (m.zone[y * m.w + x] === zz) { const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = { x: x * 32 + 16, y: y * 32 + 16 }; } }
      return best as { x: number; y: number } | null;
    }, z);
    const houseNear = (x: number, y: number) => page.evaluate((nx, ny) => {
      const o = (window as any).__game.scene.getScene("game").map.objects.filter((o: any) => /house|shop|temple|hall/.test(o.kind)).sort((a: any, b: any) => Math.hypot(a.x - nx, a.y - ny) - Math.hypot(b.x - nx, b.y - ny));
      return o[0] ? { x: o[0].x as number, y: o[0].y as number, kind: o[0].kind as string } : null;
    }, x, y);
    const view = () => page.evaluate(() => { const v = (window as any).__game.scene.getScene("game").cameras.main.worldView; return { x: v.x as number, y: v.y as number, w: v.width as number, h: v.height as number }; });

    await sleep(1500);
    console.log("diag", JSON.stringify(await page.evaluate(() => { const w = (window as any).__wow; return { has: !!w, ls: localStorage.getItem("wowFx"), birds: !!w?.birds, clouds: !!w?.clouds, nums: !!w?.nums, decals: !!w?.decals, pick: !!w?.pick, ropes: !!w?.ropes, tts: (window as any).__game.scene.getScene("game").tweens.timeScale, tms: (window as any).__game.scene.getScene("game").time.timeScale, tw: (window as any).__game.scene.getScene("game").tweens.getTweens().length }; })));
    const zoomTo = (z: number) => page.evaluate((zz) => { (window as any).__game.scene.getScene("game").cameras.main.setZoom(zz); }, z);
    const evalHero = <T>(fn: string) => page.evaluate(fn) as Promise<T>;
    void evalHero;
    const fpsNow = async () => { await sleep(2500); const a: number[] = []; for (let i = 0; i < 6; i++) { a.push(await page.evaluate(() => (window as any).__game.loop.actualFps as number)); await sleep(500); } return a.reduce((x, y) => x + y, 0) / a.length; };
    // точка с поверхностью: ближайшая к центру тяжести клеток, где углы тайла — нужные типы
    const surfPt = (types: number[]) => page.evaluate((ts) => {
      const m = (window as any).__game.scene.getScene("game").map; let sx = 0, sy = 0, n = 0; const ok = (x: number, y: number) => ts.includes(m.vtx[y * (m.w + 1) + x]) && ts.includes(m.vtx[(y + 3) * (m.w + 1) + x + 3]) && ts.includes(m.vtx[(y + 6) * (m.w + 1) + x + 6]);
      for (let y = 0; y < m.h - 8; y += 3) for (let x = 0; x < m.w - 8; x += 3) if (ok(x, y)) { sx += x; sy += y; n++; }
      if (!n) return null; const north = ts.includes(10); const cx = sx / n, cy = north ? 0 : sy / n; let best: any = null, bd = 1e9;
      for (let y = 0; y < m.h - 8; y += 3) for (let x = 0; x < m.w - 8; x += 3) if (ok(x, y)) { const d = north ? Math.abs(x - cx) * 0.3 + y : Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = { x: x * 32 + 48, y: y * 32 + 48, n }; } }
      return best as { x: number; y: number; n: number } | null;
    }, types);
    const heroEval = (code: string) => page.evaluate(code);
    void heroEval;
    // 1. пустошь: вороны (тёмная зона, поэтому крупно)
    const ash = await zonePt(4);
    if (ash) {
      await goto(ash.x, ash.y);
      await page.evaluate(() => { const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"); for (let i = 0; i < 3; i++) w.birds?.spawn(sc.pos.x - 180 - i * 60, sc.pos.y - 50 + i * 15, 1, 6, undefined, "raven"); w.clouds?.fill(2, 0); });
      const fFull = await fpsNow();
      await page.evaluate(() => (window as any).__fx.setVfxMode("simple")); const fSimple = await fpsNow();
      await page.evaluate(() => (window as any).__fx.setVfxMode("full")); await sleep(1500);
      console.log(`FPS пустошь: полные ${fFull.toFixed(1)} | простые ${fSimple.toFixed(1)}`);
      await zoomTo(3);
      await page.evaluate(() => { const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"); w.birds?.spawn(sc.pos.x - 95, sc.pos.y - 40, 1, 7, undefined, "raven"); w.birds?.spawn(sc.pos.x - 130, sc.pos.y - 18, 1, 5, undefined, "raven"); });
      await snap("Птицы: вороны над пустошью, тени на земле (зум 3)", 2200);
      await zoomTo(2);
    }
    // 2. Поля (светлая трава): цифры, золото и души, кровь и ожог, облака, знамёна
    const field = await zonePt(16) ?? await zonePt(1);
    if (field) {
      await goto(field.x, field.y);
      await zoomTo(4);
      await page.evaluate(() => {
        const sc = (window as any).__game.scene.getScene("game"), w = (window as any).__wow, hx = sc.pos.x, hy = sc.pos.y - 30, saved = w.nums;
        for (const dx of [-40, 40]) {
          if (dx < 0) w.nums = undefined; else w.nums = saved;
          sc.fx.number(hx + dx, hy, "124", "#ffe060", false, 1, "", false, 1, false); sc.fx.number(hx + dx, hy - 14, "387!", "#ffd84a", true, 1, "", false, 1, false); sc.fx.number(hx + dx, hy + 12, "+45", "#7aff7a", false, 1, "", false, 1, false);
        }
      });
      await snap("Цифры урона: слева было (Text), справа стало (BitmapText); зум 4", 330);
      await page.evaluate(() => { const sc = (window as any).__game.scene.getScene("game"), w = (window as any).__wow; sc.fx.number(sc.pos.x - 30, sc.pos.y - 30, "62", "#ffe060", false, 1, "", false, 1, false); sc.fx.number(sc.pos.x + 30, sc.pos.y - 30, "1204!", "#ffd84a", true, 1, "", false, 1, false); void w; });
      await snap("Цифры урона: крит с блеском и тряской (зум 4)", 120);
      await zoomTo(3);
      await page.evaluate(() => { const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"); w.pick?.gold(sc.pos.x - 110, sc.pos.y - 10, 8); w.pick?.souls(sc.pos.x - 100, sc.pos.y - 30, 7); });
      await snap("Золото (иконка игры) и души летят к герою (зум 3)", 650);
      await page.evaluate(() => { const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"); w.pick?.souls(sc.pos.x - 90, sc.pos.y - 25, 9); });
      await snap("Души: янтарное свечение и шлейф (зум 3)", 480);
      await page.evaluate(() => { const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"), hx = sc.pos.x, hy = sc.pos.y; for (let i = 0; i < 6; i++) w.decals.add("blood", hx - 60 + i * 9, hy - 10 + (i % 3) * 7, 0, undefined, 0.9 + (i % 3) * 0.2); w.decals.add("blood", hx - 40, hy + 24, 0, undefined, 1.5); w.decals.add("scorch", hx + 40, hy - 5, 0, undefined, 1.3); w.decals.add("scorch", hx + 70, hy + 25, 0, undefined, 1); });
      await snap("Кровь и ожог с тлеющими искрами на земле (зум 3)", 700);
      await zoomTo(2);
      await page.evaluate(() => { (window as any).__wow.clouds?.fill(2, 0); });
      await snap("Поля: редкие мягкие тени облаков, знамёна на ветру (зум 2)", 1500);
    }
    // 3. следы: песок и реальный снег
    for (const [types, nm] of [[[2, 13], "песке"], [[10, 11], "снегу"]] as [number[], string][]) {
      const pt = await surfPt(types);
      if (!pt) { console.log("нет поверхности", nm); continue; }
      console.log("поверхность", nm, JSON.stringify(pt));
      await goto(pt.x, pt.y);
      for (let k = 1; k <= 26; k++) { await dbg({ op: "tp", x: pt.x + k * 11, y: pt.y + Math.sin(k / 4) * 14 }); await sleep(130); }
      await sleep(300);
      await zoomTo(3);
      await snap(`Шаги на ${nm} (зум 3)`, 200);
      await zoomTo(2);
    }
    // 4. город: чайки на конёк
    const city = await zonePt(14) ?? await zonePt(0);
    if (city) {
      const h = await houseNear(city.x, city.y); const at = h ?? city;
      await goto(at.x, at.y + 24);
      await page.evaluate(() => { const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"); w.birds?.spawn(sc.pos.x - 150, sc.pos.y - 60, 1, 6, undefined, "gull"); const roofs = w.roofs().sort((a: any, b: any) => Math.hypot(a.x - sc.pos.x, a.y - sc.pos.y) - Math.hypot(b.x - sc.pos.x, b.y - sc.pos.y)); if (roofs[0]) w.birds?.spawn(roofs[0].x - 70, roofs[0].y - 10, 1, 5, roofs[0], "gull"); });
      await zoomTo(3);
      await snap("Город: чайки пролетают и садятся на конёк (зум 3)", 3800);
      await zoomTo(2);
    }
    // 5. настоящий босс Гнашера (слот r55n, восток: клетка 1099-282, 110): вступление B и цепи на нём
    const GN = { x: (1099 - 282 + 0.5) * 32, y: 110.5 * 32 };
    await page.evaluate(async () => { const u = "/src/game/fx/config.ts"; const c = await import(/* @vite-ignore */ u); (c.wowCfg("bossIntro") as any).totalMs = 9000; });
    await dbg({ op: "tp", x: GN.x - 520, y: GN.y }); await sleep(2500);
    await dbg({ op: "tp", x: GN.x - 250, y: GN.y });
    await page.waitForFunction(() => !!(window as any).__wow.intro?.active, { timeout: 30000 }).then(() => console.log("вступление запущено настоящим боссом")).catch(() => console.log("вступление само не запустилось"));
    const real = await page.evaluate(() => { const sc = (window as any).__game.scene.getScene("game"); return [...sc.units.values()].some((u: any) => u.u.sprite === "umb_plague_priestess"); });
    console.log("Гнашера в юнитах:", real);
    await sleep(3000);
    await snap("Вступление B на настоящем боссе: полосы, плашка, имя", 600, true);
    await sleep(2500);
    await snap("Вступление B: титул, подпись, искры цвета босса", 0, true);
    await page.waitForFunction(() => !(window as any).__wow.intro?.active, { timeout: 30000 }).catch(() => {});
    await dbg({ op: "tp", x: GN.x - 80, y: GN.y + 20 }); await sleep(2500); await settle(page);
    await zoomTo(4);
    await snap("Цепи на настоящей Гнашере: Rope качается на ветру (зум 4)", 600);
    await zoomTo(2);
    // 6. портал: полная последовательность (застывшие кадры: схлопывание, вспышка, раскрытие)
    for (const [k, nm] of [[0.3, "вход 0,3: линза"], [0.6, "вход 0,6: пиксели и вихрь"], [0.92, "вспышка, экран закрыт"], [0.55, "выход 0,55: раскрывается"], [0.2, "выход 0,2: почти обычный"]] as [number, string][]) {
      await page.evaluate((kk) => (window as any).__wow.debugWarp(kk), k);
      await sleep(250);
      await snap(`Телепорт, ${nm}`, 0, true);
    }
    await page.evaluate(() => (window as any).__wow.debugWarp(-1));
    await page.close();
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  const W = 640, H = 400, rows = Math.ceil(shots.length / 2), sheet = new PNG({ width: W * 2, height: H * rows });
  shots.forEach((s, i) => {
    const p = PNG.sync.read(s.png), ox = (i % 2) * W, oy = Math.floor(i / 2) * H;
    if (p.width > W) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = (Math.floor(y * p.height / H) * p.width + Math.floor(x * p.width / W)) * 4, b = ((oy + y) * sheet.width + ox + x) * 4; for (let k = 0; k < 4; k++) sheet.data[b + k] = p.data[a + k]; } }
    else PNG.bitblt(p, sheet, 0, 0, Math.min(W, p.width), Math.min(H, p.height), ox, oy);
  });
  fs.writeFileSync(path.join(OUT, "ingame.png"), PNG.sync.write(sheet));
  console.log("ingame.png готов", shots.map((s) => s.label).join(" | "));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
