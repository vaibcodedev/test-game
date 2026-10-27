/**
 * Динамические тени: кадры в 4 времена суток на площади столицы Сольгарда и в лесу + замер FPS (1366×768) в режимах Выкл / Простые / Динамические.
 * Порты 2856 / 5256, один headless-таб, один сервер. Запуск под замком tools/out/scenario.lock снаружи.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { sleep, startServer, stopServer, PORT } from "../../tests/harness";
import { DUNGEON_ROOMS } from "../../shared/dungeon";
import { DUNGEON_DOOR } from "../../shared/map";

const VITE_PORT = 5256, OUT = path.resolve("tools/out/dungeon");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;

async function login(page: Page, name: string) {
  try { await login0(page, name); } catch (e) { const st = await Promise.race([page.evaluate(`JSON.stringify({ scenes: (window.__game && window.__game.scene.scenes.map((s) => s.sys.settings.key + ":" + s.sys.settings.status)), loader: window.__game && window.__game.scene.scenes.map((s) => s.load && s.load.totalFailed + "/" + s.load.totalComplete + "/" + s.load.totalToLoad) })`), sleep(20000).then(() => "evaluate hung")]); console.error("STATE", st); await page.screenshot({ path: path.join(OUT, "debug-login.png") }); throw e; }
}
async function login0(page: Page, name: string) {
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
const fps = (page: Page, ms: number) => page.evaluate(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else res((n * 1000) / (performance.now() - t0)); }; requestAnimationFrame(f); })`) as Promise<number>;


async function main() {
  const prefix = process.env.PREFIX ?? "before";
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, "Данж");
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    /** Камера на точку (wx, wy) с зумом z, закреплена на каждом кадре; clip-снимок вокруг центра экрана размером w×h px. */
    const camLock = (wx: number, wy: number, z: number) => page.evaluate(`(() => { const s = window.__game.scene.getScene("game"), c = s.cameras.main; c.stopFollow(); c.setZoom(${z}); window.__lock = [${wx}, ${wy}]; if (window.__lockFn && window.__lockScene) window.__lockScene.events.off("postupdate", window.__lockFn); window.__lockScene = s; window.__lockFn = () => { try { if (window.__lock && s.cameras && s.cameras.main) { s.cameras.main.stopFollow(); s.cameras.main.centerOn(window.__lock[0], window.__lock[1]); } } catch (e) {} }; s.events.on("postupdate", window.__lockFn); })()`);
    const clipShot = async (w: number, h: number) => {
      const r = (await page.evaluate(`(() => { const b = document.querySelector("canvas").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`)) as { x: number; y: number; w: number; h: number };
      return (await page.screenshot({ clip: { x: Math.round(r.x + r.w / 2 - w / 2), y: Math.round(r.y + r.h / 2 - h / 2), width: w, height: h } })) as Buffer;
    };
    const sheetOf = async (items: { buf: Buffer; label: string }[], cols: number, tile: [number, number], file: string, zoomCrop = 0) => {
      const p2 = await browser.newPage();
      const imgs = items.map((it) => `<figure style="margin:0;width:${tile[0]}px"><div style="width:${tile[0]}px;height:${tile[1]}px;overflow:hidden;background:#111"><img src="data:image/png;base64,${it.buf.toString("base64")}" style="image-rendering:pixelated;display:block;${zoomCrop ? `width:${tile[0] * zoomCrop}px;margin:${-tile[1] * (zoomCrop - 1) / 2}px 0 0 ${-tile[0] * (zoomCrop - 1) / 2}px` : ""}"></div><figcaption style="font:12px monospace;color:#ddd;background:#222;padding:2px;line-height:14px">${it.label}</figcaption></figure>`).join("");
      await p2.setViewport({ width: cols * tile[0] + 8, height: Math.ceil(items.length / cols) * (tile[1] + 20) + 8 });
      await p2.setContent(`<body style="margin:4px;background:#000;line-height:0;display:grid;grid-template-columns:repeat(${cols},${tile[0]}px);gap:0">${imgs}</body>`);
      await sleep(500);
      await p2.screenshot({ path: path.join(OUT, file) });
      await p2.close();
    };
    if (process.env.ENTR3) {
      // три варианта входа в движке рядом (зум 2, герой у входа): entrance3-variants.png
      await page.setViewport({ width: 1920, height: 1080 }); await sleep(1500);
      await camLock(DUNGEON_DOOR.x, DUNGEON_DOOR.y - 60, 2);
      await dbg({ op: "tp", x: DUNGEON_DOOR.x, y: DUNGEON_DOOR.y + 44 }); await sleep(3500);
      await page.evaluate(`(() => { const s = window.__game.scene.getScene("game"); s.children.list.filter((o) => o.texture && o.texture.key === "o_dg_entrance").forEach((o) => o.setVisible(false)); ["a", "b", "c"].forEach((v, i) => { const x = ${DUNGEON_DOOR.x} + (i - 1) * 300, y = ${DUNGEON_DOOR.y} + 2; s.add.image(x, y, v === "a" ? "o_dg_entrance" : "o_dg_entrance_" + v).setOrigin(0.5, 1).setDepth(y); s.add.text(x - 6, y - 200, v.toUpperCase(), { fontSize: "22px", color: "#ffe08a" }).setDepth(1e6); }); })()`);
      await sleep(600);
      await page.screenshot({ path: path.join(OUT, "entrance3-variants.png") });
      return;
    }
    if (process.env.ENTR) {
      // вход в «Пепельные чертоги» снаружи: герой у подножия лестницы, зум 2, затем наведение мыши (подсказка) — entrance-final.png, entrance-final-hover.png
      await camLock(DUNGEON_DOOR.x, DUNGEON_DOOR.y - 44, 2);
      await dbg({ op: "tp", x: DUNGEON_DOOR.x, y: DUNGEON_DOOR.y + 40 }); await sleep(3500);
      await page.screenshot({ path: path.join(OUT, "entrance-final.png") });
      const r = (await page.evaluate(`(() => { const b = document.querySelector("canvas").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`)) as { x: number; y: number; w: number; h: number };
      await page.mouse.move(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2 + 2 * 30)); await sleep(700);
      await page.screenshot({ path: path.join(OUT, "entrance-final-hover.png") });
      return;
    }
    if (process.env.FORT || process.env.CITY) {
      // ворота форта своей фракции (общие правила ворот): герой подходит — створки открываются, уходит — закрываются; камера на воротах, один ракурс
      const { GATES } = await import("../../shared/siege");
      const city = !!process.env.CITY, g = GATES.find((q) => q.faction === "solgard" && q.city.startsWith("fort") !== city) ?? GATES[0], dir = g.side === "n" ? -1 : 1;
      await camLock(g.x, g.y - dir * 20, 1.5);
      const items: { buf: Buffer; label: string }[] = [];
      await dbg({ op: "tp", x: g.x + 60, y: g.y + dir * 300 }); await sleep(3500); items.push({ buf: await clipShot(360, 300), label: "старт: герой ещё далеко" });
      await dbg({ op: "tp", x: g.x + 60, y: g.y + dir * 40 }); await sleep(1500);
      for (let f = 1; f <= 8; f++) { await page.evaluate(`window.__gateFrame = ${f}`); await sleep(150); items.push({ buf: await clipShot(360, 300), label: `кадр ${f}${f === 8 ? " (распахнуты)" : ""}` }); }
      await page.evaluate("window.__gateFrame = undefined");
      await dbg({ op: "tp", x: g.x + 60, y: g.y + dir * 300 });
      for (let i = 1; i <= 3; i++) { await sleep(i === 1 ? 1700 : 300); items.push({ buf: await clipShot(360, 300), label: `закрытие (в реальном времени) ${i}` }); }
      await sheetOf(items, 5, [360, 300], city ? "city-gate-sheet.png" : "fort-gate-sheet.png");
      return;
    }
    let exit2Entr: Buffer | null = null;
    if (process.env.EXIT2) {
      await camLock(DUNGEON_DOOR.x, DUNGEON_DOOR.y - 60, 2);
      await dbg({ op: "tp", x: DUNGEON_DOOR.x, y: DUNGEON_DOOR.y + 44 }); await sleep(3500);
      exit2Entr = await clipShot(520, 440);
    }
    await dbg({ op: "god" });
    // спуск по лестнице входа (общая комната подземелья), затем снимки внутри
    await dbg({ op: "tp", x: DUNGEON_DOOR.x, y: DUNGEON_DOOR.y + 28 });
    await sleep(800);
    await page.evaluate(`window.__net.send("dungeon:enter", {})`);
    await page.waitForFunction(`window.__net.kind === "dungeon"`, { timeout: 30000 });
    await sleep(2500);
    await dbg({ op: "god" });
    if (process.env.EXIT2) {
      await page.evaluate(`window.__lock = null`);
      await camLock(1040, 138, 2);
      await dbg({ op: "tp", x: 1040, y: 7 * 32 + 8 }); await sleep(3000);
      const cv = (await page.evaluate(`(() => { const b = document.querySelector("canvas").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`)) as { x: number; y: number; w: number; h: number };
      const exitBuf = (await page.screenshot({ clip: { x: Math.round(cv.x + cv.w / 2 - 260), y: Math.round(cv.y), width: 520, height: 640 } })) as Buffer; // камера упирается в верх карты: берём от верха кадра
      const sprite = fs.readFileSync(path.resolve("client/public/assets/objects/dg_exit.png"));
      const p2 = await browser.newPage();
      const im = (b: Buffer, w: number, label: string, pix = true) => `<figure style="margin:0 6px 0 0"><img src="data:image/png;base64,${b.toString("base64")}" style="${pix ? "image-rendering:pixelated;" : ""}width:${w}px;display:block"><figcaption style="font:13px monospace;color:#ddd;background:#222;padding:3px">${label}</figcaption></figure>`;
      await p2.setViewport({ width: 520 * 2 + 600 + 40, height: 700 });
      await p2.setContent(`<body style="margin:4px;background:#000;display:flex;align-items:flex-start">${im(exit2Entr!, 520, "вход C снаружи, зум 2", false)}${im(exitBuf, 520, "выход, зум 2, герой у подножия", false)}${im(sprite, 600, "выход ×3 (спрайт)")}</body>`);
      await sleep(700);
      await p2.screenshot({ path: path.join(OUT, "exit5.png") });
      await p2.close();
      return;
    }
    if (process.env.EXIT3) {
      // три варианта выхода в движке рядом внутри подземелья (зум 2, герой рядом): exit-variants.png
      await page.setViewport({ width: 1920, height: 1080 }); await sleep(1500);
      await dbg({ op: "tp", x: 944, y: 18 * 32 });
      await camLock(944, 14 * 32 + 8, 2); await sleep(2500);
      await page.evaluate(`(() => { const s = window.__game.scene.getScene("game"); s.children.list.filter((o) => o.texture && o.texture.key === "o_dg_exit").forEach((o) => o.setVisible(false)); ["a", "b", "c"].forEach((v, i) => { const x = 944 + (i - 1) * 300, y = 17 * 32; s.add.image(x, y, "o_dg_exit_" + v).setOrigin(0.5, 1).setDepth(y); s.add.text(x - 6, y - 150, v.toUpperCase(), { fontSize: "22px", color: "#ffe08a" }).setDepth(1e6); }); })()`);
      await sleep(700);
      await page.screenshot({ path: path.join(OUT, "exit-variants.png") });
      return;
    }
    if (process.env.GATES) {
      // ворота данжа: все 8 кадров створок (принудительно), герой под перемычкой и за ней; камера на воротах, зум 2, один ракурс
      const items: { buf: Buffer; label: string }[] = [];
      for (const [name, id, cx, row] of [["двери собора", "g56", 1024, 8], ["решётка склепа", "g75", 960, 27]] as const) {
        await camLock(cx, (row + 1) * 32 - 56, 2);
        await dbg({ op: "tp", x: cx, y: (row + 2) * 32 + 8 }); await sleep(1200);
        for (let k = 0; k < 8; k++) {
          await page.evaluate(`window.__dgGateForce.set("${id}", ${k})`); await sleep(160);
          items.push({ buf: await clipShot(340, 300), label: `${name}: кадр ${k}${k === 0 ? " (закрыты)" : k === 7 ? " (открыты)" : ""}` });
        }
        await page.evaluate(`window.__dgGateForce.set("${id}", 7)`);
        await dbg({ op: "tp", x: cx, y: row * 32 + 20 }); await sleep(900); items.push({ buf: await clipShot(340, 300), label: `${name}: герой под перемычкой` });
        await dbg({ op: "tp", x: cx, y: (row - 1) * 32 + 22 }); await sleep(900); items.push({ buf: await clipShot(340, 300), label: `${name}: герой за перемычкой` });
        await page.evaluate(`window.__dgGateForce.delete("${id}")`);
      }
      await sheetOf(items, 5, [340, 300], "doors3-sheet.png");
      await sheetOf([0, 3, 7, 8, 9, 10, 13, 17, 18, 19].map((i) => items[i]), 5, [340, 300], "doors3-sheet-x2.png", 2);
      return;
    }
    // входной зал, северный зал и зал босса (центры комнат DUNGEON_ROOMS в тайлах)
    const spots = (process.env.SPOTS ?? "4,6,9").split(",").map((i) => DUNGEON_ROOMS[Number(i)]);
    let i = 1;
    for (const [x0, y0, x1, y1] of spots) {
      await dbg({ op: "tp", x: ((x0 + x1) / 2) * 32, y: ((y0 + y1) / 2 + (process.env.DY ? Number(process.env.DY) : 0)) * 32 });
      await sleep(4500);
      await page.screenshot({ path: path.join(OUT, `${prefix}-${i}.png`) });
      i++;
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
}
setTimeout(() => { console.error("WATCHDOG"); process.exit(2); }, 30 * 60 * 1000).unref();
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
