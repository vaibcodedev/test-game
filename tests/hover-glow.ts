/** Свечение под курсором (client/src/game/hoverGlow.ts): торговец, статуя, камень телепорта светятся при наведении и гаснут при уходе; кадры → tools/out/hover/ingame.png и anim-strip.png.
 *  Порты 2846 / 5246. Запуск под замком tools/out/scenario.lock снаружи. */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { assert, check, passedCount, sleep, startServer, stopServer, PORT } from "./harness";

const VITE_PORT = 5246, OUT = path.resolve("tools/out/hover");
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

/** Ждёт, пока камера встанет: scroll не меняется ~0,8 с подряд. */
async function settle(page: Page) {
  let prev = "", same = 0;
  for (let i = 0; i < 80 && same < 3; i++) {
    const cur = await page.evaluate(() => { const c = (window as any).__game.scene.getScene("game").cameras.main; return `${c.scrollX.toFixed(1)},${c.scrollY.toFixed(1)}`; });
    same = cur === prev ? same + 1 : 0; prev = cur; await sleep(300);
  }
}

const glowState = (page: Page) => page.evaluate(() => { const h = (window as any).__game.scene.getScene("game").hoverGlow, g = h.img; return { vis: g.visible as boolean, a: (g.visible ? g.alpha : 0) as number, key: h.key as string }; });

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 600000 });
  const clips: Buffer[] = [], strip: Buffer[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    // --no-atlas: объекты карты по одному (localStorage atlas:off, BootScene) — сравнение с атласом объектов
    if (process.argv.includes("--no-atlas")) { await page.evaluate(() => localStorage.setItem("atlas:off", "1")); await page.reload({ waitUntil: "networkidle0" }); }
    else await page.evaluate(() => localStorage.removeItem("atlas:off"));
    await login(page, "Свеч" + (process.pid % 1000));
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    // ручной шаг времени свечения: __dt (мс) расходуется одним кадром, пока 0 — картинка стоит
    await page.evaluate(() => {
      const w = window as any, sc = w.__game.scene.getScene("game"), hg = sc.hoverGlow, orig = hg.update.bind(hg);
      w.__t = 0; w.__dt = 0; w.__manual = false;
      hg.update = (tg: unknown, dt: number, t: number) => {
        if (!w.__manual) return orig(tg, dt, t);
        const d = w.__dt; w.__dt = 0; w.__t += d; return orig(tg, d, w.__t);
      };
    });
    const pick = (kind: string) => page.evaluate((k) => {
      const sc = (window as any).__game.scene.getScene("game");
      const list = sc.npcs.filter((n: any) => n.kind === k);
      list.sort((a: any, b: any) => Math.hypot(a.sprite.x - 56 * 32, a.sprite.y - 182 * 32) - Math.hypot(b.sprite.x - 56 * 32, b.sprite.y - 182 * 32));
      const n = list[0]; return n ? { x: n.sprite.x as number, y: n.sprite.y as number, dy: (n.hit?.dy ?? 14) as number } : null;
    }, kind);
    const toScreen = (wx: number, wy: number) => page.evaluate(([x, y]) => {
      const sc = (window as any).__game.scene.getScene("game"), cam = sc.cameras.main, r = (window as any).__game.canvas.getBoundingClientRect();
      return { x: r.left + (x - cam.worldView.x) * cam.zoom * r.width / cam.width, y: r.top + (y - cam.worldView.y) * cam.zoom * r.height / cam.height, zoom: cam.zoom as number };
    }, [wx, wy]);

    for (const kind of ["shop", "statue", "stone"]) {
      const t = await pick(kind);
      await check(`цель ${kind} найдена`, () => assert(t, kind));
      if (!t) continue;
      await dbg({ op: "tp", x: t.x, y: t.y + 70 }); await page.evaluate(() => (window as any).__game.scene.getScene("game").cameras.main.setZoom(1.75)); await sleep(1500);
      await settle(page); // камера доезжает до героя (на медленной видеокарте lerp идёт десятки кадров): ждём, пока scroll перестанет меняться
      const p = await toScreen(t.x, t.y - t.dy);
      await page.mouse.move(p.x - 40, p.y - 40); await sleep(300);
      await page.mouse.move(p.x, p.y, { steps: 4 });
      await sleep(900);
      // проявление идёт по кадрам: при 3–5 к/с (Chrome без окна под нагрузкой) 900 мс мало — ждём до 6 с
      let st = await glowState(page);
      for (let k = 0; k < 12 && !(st.vis && st.a >= 0.55); k++) { await sleep(500); st = await glowState(page); }
      await check(`${kind}: свечение включено при наведении (alpha ${st.a.toFixed(2)}, zoom ${p.zoom})`, () => assert(st.vis && st.a >= 0.55, JSON.stringify(st)));
      clips.push(Buffer.from(await page.screenshot({ clip: { x: Math.max(0, p.x - 110), y: Math.max(0, p.y - 150), width: 220, height: 250 } })));
      await page.mouse.move(p.x + 300, p.y + 200, { steps: 3 });
      // угасание идёт по кадрам игры (game.loop.delta): под нагрузкой кадров мало и 900 мс не хватает — ждём условие до 5 с
      await page.waitForFunction((was) => { const h = (window as any).__game.scene.getScene("game").hoverGlow; return !h.img.visible || h.key !== was; }, { timeout: 5000, polling: 100 }, st.key).catch(() => {});
      const off = await glowState(page);
      // курсор в 360 px от цели может попасть на другой объект (у камня теперь декор рядом) — тогда светится он, а не прежняя цель
      await check(`${kind}: свечение погасло после ухода`, () => assert(!off.vis || off.key !== st.key, JSON.stringify({ off, was: st.key })));
      if (kind === "shop") {
        // последовательность: наведение 0..180 мс, пик пульса, уход 0..150 мс; время шагается вручную
        const steps = [0, 30, 30, 30, 30, 60, 300, 0, 50, 50, 50];
        await page.evaluate(() => { (window as any).__manual = true; (window as any).__t = 0; });
        await page.mouse.move(p.x - 40, p.y - 40); await sleep(200);
        const sc = { x: Math.max(0, p.x - 60), y: Math.max(0, p.y - 80), width: 120, height: 130 };
        const alphas: number[] = [];
        for (const [i, d] of steps.entries()) {
          if (i === 0) await page.mouse.move(p.x, p.y, { steps: 2 });
          if (i === 7) await page.mouse.move(p.x + 300, p.y + 200, { steps: 2 });
          await sleep(150);
          await page.evaluate((dd) => { (window as any).__dt = dd; }, d); await sleep(150);
          alphas.push((await glowState(page)).a);
          strip.push(Buffer.from(await page.screenshot({ clip: sc })));
        }
        console.log("alpha по кадрам:", alphas.map((a) => a.toFixed(2)).join(" "));
        await check("плавность: появление растёт, уход убывает до нуля", () => {
          for (let i = 1; i <= 5; i++) assert(alphas[i] >= alphas[i - 1] - 0.02, "in " + alphas.join());
          for (let i = 8; i < alphas.length; i++) assert(alphas[i] <= alphas[i - 1] + 1e-6, "out " + alphas.join());
          assert(alphas[alphas.length - 1] < 1e-6, "off " + alphas.join());
        });
        await page.evaluate(() => { (window as any).__manual = false; });
      }
    }
    const page2 = await browser.newPage();
    const compose = async (bufs: Buffer[], scale: number, file: string, labels?: string[]) => {
      await page2.goto("about:blank");
      await page2.setViewport({ width: 1400, height: 700 });
      await page2.evaluate(async (arr: string[], sc: number, labs: string[] | null) => {
        const imgs = await Promise.all(arr.map((b) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = "data:image/png;base64," + b; })));
        const w = imgs[0].width * sc, h = imgs[0].height * sc, gap = 6, per = labs ? 6 : 3, rows = Math.ceil(imgs.length / per);
        const c = document.createElement("canvas"); c.width = Math.min(imgs.length, per) * (w + gap); c.height = rows * (h + 18 + gap);
        const g = c.getContext("2d")!; g.imageSmoothingEnabled = false; g.fillStyle = "#1c1814"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#e8dcc0"; g.font = "13px sans-serif";
        imgs.forEach((im, i) => { const x = (i % per) * (w + gap), y = Math.floor(i / per) * (h + 18 + gap); g.drawImage(im, x, y + 16, w, h); if (labs) g.fillText(labs[i], x + 4, y + 12); });
        c.style.cssText = "position:fixed;left:0;top:0"; c.id = "cc"; document.body.style.margin = "0"; document.body.appendChild(c);
      }, bufs.map((b) => b.toString("base64")), scale, labels ?? null);
      await (await page2.$("#cc"))!.screenshot({ path: path.join(OUT, file) });
    };
    await compose(clips, 2, "ingame.png");
    await compose(strip, 2, "anim-strip.png", ["наведение +0", "+30 мс", "+60", "+90", "+120", "+180", "пик пульса", "уход 0", "-50 мс", "-100", "-150"]);
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  console.log(`\n${passedCount()} ok`);
}
setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 12 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
