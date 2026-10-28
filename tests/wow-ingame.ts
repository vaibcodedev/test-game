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
    await page.evaluateOnNewDocument(() => { try { localStorage.setItem("vfxMode", "full"); localStorage.setItem("wowFx", "1"); } catch {} });
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, `Wow${process.pid % 1000}`);
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    await page.evaluate((target) => { const real = Date.now.bind(Date), off = target - real(); (Date as any).now = () => real() + off; (window as any).__fx.debugFx.rain = 0; }, dayMs);
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
    // 1. город: стайка над городом и стайка на крыше
    const city = await zonePt(14) ?? await zonePt(0);
    if (city) {
      const h = await houseNear(city.x, city.y); const at = h ?? city; console.log("город", JSON.stringify(h));
      await goto(at.x, at.y + 24);
      await page.evaluate(() => {
        const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"), hx = sc.pos.x, hy = sc.pos.y;
        w.birds?.spawn(hx - 175, hy - 62, 1, 6, undefined, "gull");
        const roofs = w.roofs().sort((a: any, b: any) => Math.hypot(a.x - hx, a.y - hy) - Math.hypot(b.x - hx, b.y - hy));
        if (roofs[0]) w.birds?.spawn(roofs[0].x - 80, roofs[0].y - 12, 1, 5, roofs[0], "raven");
      });
      await sleep(3000);
      console.log("birds", JSON.stringify(await page.evaluate(() => { const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"), v = sc.cameras.main.worldView, f = w.birds.flocks; return { n: f.length, view: [v.x, v.y, v.width, v.height], zoom: sc.cameras.main.zoom, fps: (window as any).__game.loop.actualFps, b: f.map((q: any) => ({ x: q.x, y: q.y, st: q.state, img: q.birds[0] && [q.birds[0].img.x, q.birds[0].img.y, q.birds[0].img.visible, q.birds[0].img.depth, q.birds[0].img.frame.name] })) }; })));
      await snap("Город: птицы над крышами, тень на земле", 0);
      await snap("Город: стайка села на конёк", 4500);
      await page.evaluate(() => { const w = (window as any).__wow; for (const [, v] of w.o.units()) void v; }); // прогон
    }
    // 2. Поля: тени облаков + знамёна (если рядом)
    const field = await zonePt(16) ?? await zonePt(1);
    if (field) {
      await goto(field.x, field.y);
      await page.evaluate(() => { const w = (window as any).__wow; w.clouds?.fill(2, 0); });
      await snap("Поля: редкие мягкие тени облаков", 1500);
    }
    // 3. пустошь: вороны, бой (цифры, кровь, ожог), души и золото
    const ash = await zonePt(4);
    if (ash) {
      await goto(ash.x, ash.y);
      await page.evaluate(() => { const w = (window as any).__wow, v = (window as any).__game.scene.getScene("game").cameras.main.worldView; const sc = (window as any).__game.scene.getScene("game"); w.birds?.spawn(sc.pos.x - 175, sc.pos.y - 50, 1, 5, undefined, "raven"); void v; });
      await snap("Пустошь: вороны", 2600);
      await page.evaluate(() => {
        const sc = (window as any).__game.scene.getScene("game"), me = sc.units.get((window as any).__net.id);
        const mob = [...sc.units.values()].filter((u: any) => u.u.kind === 1 && Math.hypot(u.x - me.x, u.y - me.y) < 150).sort((a: any, b: any) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0] ?? me; const id = mob.id;
        sc.fx.play([{ t: "dmg", id, v: 124, k: "phys" }, { t: "dmg", id, v: 387, crit: true, k: "phys" }, { t: "dmg", id, v: 61, k: "fire" }]);
        const w = (window as any).__wow; w.decals?.add("scorch", mob.x + 24, mob.y + 6, 0, undefined, 1.3); w.decals?.add("blood", mob.x - 20, mob.y + 8, 0, undefined, 1.4);
        sc.fx.play([{ t: "dmg", id: me.id, v: 45, heal: true }]);
      });
      await snap("Бой: цифры (BitmapText), кровь, ожог", 260);
      await page.evaluate(() => { const sc = (window as any).__game.scene.getScene("game"), w = (window as any).__wow, me = sc.units.get((window as any).__net.id); const mob = me; w.pick?.gold(mob.x, mob.y - 10, 7); w.pick?.souls(mob.x, mob.y - 14, 6); });
      await snap("Золото и души летят к герою", 520);
    }
    // 4. снег и песок: следы шагов
    for (const [zn, nm] of [[9, "снегу"], [8, "песке"]] as [number, string][]) {
      const pt = await zonePt(zn);
      if (!pt) continue;
      await goto(pt.x, pt.y);
      await page.evaluate(() => (window as any).__net.send("dbg", { op: "god" }));
      await page.evaluate(() => { const w = (window as any).__wow, sc = (window as any).__game.scene.getScene("game"), hx = sc.pos.x, hy = sc.pos.y;
        for (let k = 0; k < 9; k++) w.decals.step("sand", hx - 130 + k * 13, hy - 36 + Math.sin(k / 2) * 8, 1, Math.cos(k / 2) * 0.5, k, false);
        for (let k = 0; k < 8; k++) w.decals.step("sand", hx - 120 + k * 17, hy + 30 - Math.sin(k / 2) * 8, 1, -Math.cos(k / 2) * 0.5, k, true); });
      await snap(`Шаги на ${nm}`, 100);
    }
    await page.evaluate(async () => { const u = "/src/game/fx/config.ts"; const c = await import(/* @vite-ignore */ u); (c.wowCfg("bossIntro") as any).totalMs = 8000; (c.wowCfg("portalWarp") as any).outMs = 3000; });
    // 5. вход к боссу: найти босса кольца среди юнитов или в map.bosses
    const bossPt = await page.evaluate(() => {
      const sc = (window as any).__game.scene.getScene("game"); const b = sc.map.bosses?.[0]; return b ? { x: b.x as number, y: b.y as number } : null;
    });
    if (bossPt) {
      await goto(bossPt.x - 360, bossPt.y);
      await page.evaluate((bx, by) => { (window as any).__net.send("dbg", { op: "tp", x: bx - 200, y: by }); }, bossPt.x, bossPt.y);
      await sleep(1700);
      const started = await page.evaluate(() => !!(window as any).__wow.intro?.active);
      if (!started) await page.evaluate((bx, by) => { const sc = (window as any).__game.scene.getScene("game"); (window as any).__wow.startIntro(bx, by, "Гнашера", "Жрица котла", 0x8adf6a); void sc; }, bossPt.x, bossPt.y);
      await sleep(600);
      console.log("intro", JSON.stringify(await page.evaluate(() => { const i = (window as any).__wow.intro; return { active: i?.active, objs: i?.objs?.map((o: any) => [o.type, o.x, o.y, o.alpha, o.visible]) }; })));
      await snap("Вход к боссу: полосы, камера, имя", 0, true);
      await snap("Вступление босса: имя и титул", 500, true);
    } else console.log("боссов в map.bosses нет");
    // 6. телепорт: схлопывание экрана
    await page.evaluate(() => { const w = (window as any).__wow; w.tp({ t: "tp", id: (window as any).__net.id, ph: "go", x: 0, y: 0 }); });
    await snap("Телепорт: линза, пиксели и вихрь", 0, true);
    void view;
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
