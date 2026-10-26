/**
 * Нейм-плейты (client/src/game/nameplate.ts) и цифры урона (effects.ts): итоговые снимки в игре.
 * final-crowd.png — 5 мобов и 3 героя (плейты настоящие, удары через Effects.number), final-fight-x1.png / final-fight-x3.png — настоящий бой героя с мобом.
 * Время анимации плейтов виртуальное. → tools/out/nameplates/final-*.png
 * Запуск (под замком tools/out/scenario.lock): TEST_PORT=2854 VITE_TEST_PORT=5254 npx tsx tests/nameplates-shots.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5254;
const OUT = path.resolve("tools/out/nameplates");
import { generateMap } from "../shared/map";
import { MAP_SEED } from "../shared/constants";
const MOB = generateMap(MAP_SEED).spawns.filter((s: { mob: string }) => s.mob === "ratfolk_cutter")[0];
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((x) => fs.existsSync(x))!;

async function enter(page: Page, name: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 20000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 120000 });
  await sleep(2000);
}

/** Всё демо живёт на странице: window.__demo.show(v) / strip(v) / view(r, z). */
const DEMO = `(async () => {
  const np = await import('/src/game/nameplate.ts');
  const game = window.__game, sc = game.scene.getScene("game");
  const objs = [];
  const mk = () => { const g = sc.add.graphics().setDepth(999998); objs.push(g); return g; };
  const foe = (k) => (k > 0.5 ? 0xd8443a : k > 0.25 ? 0xe0902a : 0xff3a2a);
  const mp = sc.cameras.main.midPoint, BASE = { x: Math.round(mp.x), y: Math.round(mp.y) + 90 };
  const clear = () => { sc.tweens.timeScale = 1; objs.splice(0).forEach((o) => o.destroy()); };
  const D = 0.016;
  /** однотонная подложка под демо: город вокруг героя слишком пёстрый */
  const bg = (r) => { const g = sc.add.rectangle(r.cx, r.cy, r.w, r.h, 0x3a4a34).setDepth(999997); objs.push(g); return r; };
  /** плейт: стартовое k0 в момент 0, затем k1 в момент 1000 и шаги по 16 мс до 1000+after (after < 0 — только стартовое состояние) */
  const run = (x, y, o, k0, k1, after) => {
    const g = mk(), st = np.newPlate(), at = (k) => ({ x, y, ...o, k, col: o.colf ? o.colf(k) : o.col });
    np.drawPlate(g, st, at(k0), 0, D);
    if (after < 0) return;
    let t = 1000; np.drawPlate(g, st, at(k1), t, D);
    while (t < 1000 + after) { t = Math.min(1000 + after, t + 16); np.drawPlate(g, st, at(k1), t, D); }
  };
  const show = (v) => {
    clear(); 
    const S = 47, X = (i) => BASE.x + (i - 2.5) * S;
    [[20, .9, 0], [20, .75, 0], [20, .55, 0], [20, .35, 0], [20, .18, 0], [20, .07, 0]].forEach(([w, k], i) => run(X(i), BASE.y, { w, colf: foe }, k, k, -1));
    [[40, .6, 0], [28, .7, 1], [28, .3, 1], [40, .45, 2], [40, 1, 2], [40, .12, 2]].forEach(([w, k, t], i) => run(X(i), BASE.y + 22, { w, colf: foe, elite: t === 1, boss: t === 2 }, k, k, -1));
    [[20, .85, 0x5ad04a, .35], [20, .4, 0x5ad04a, 0], [20, .55, 0x4ab0ff, 0], [20, .7, 0xe24a4a, 0], [20, .9, 0x6ad06a, 0], [28, .7, 0xd8443a, .4]].forEach(([w, k, col, ab], i) => run(X(i), BASE.y + 44, { w, col, absorb: ab, elite: i === 5 }, k, k, -1));
    // лечение 45% -> 85% (кадры 16 и 400 мс), удар 80% -> 40% (кадры 48 и 300 мс)
    run(X(0), BASE.y + 66, { w: 20, col: 0x5ad04a }, .45, .85, 16);
    run(X(1), BASE.y + 66, { w: 20, col: 0x5ad04a }, .45, .85, 400);
    run(X(2), BASE.y + 66, { w: 20, colf: foe }, .8, .4, 48);
    run(X(3), BASE.y + 66, { w: 20, colf: foe }, .8, .4, 300);
    return bg({ cx: BASE.x, cy: BASE.y + 34, w: 310, h: 100 });
  };
  /** лента: 8 кадров (мс после удара); строки — удар 100->62, элита 62->20, лечение 35->80, большой моб 100->60 */
  const OFF = [-1, 16, 48, 112, 208, 352, 560, 900];
  const strip = (v) => {
    clear(); 
    const S = 34, X = (i) => BASE.x + (i - 3.5) * S;
    OFF.forEach((t, i) => {
      run(X(i), BASE.y, { w: 28, colf: foe }, 1, .62, t);
      run(X(i), BASE.y + 18, { w: 28, colf: foe, elite: true }, .62, .2, t);
      run(X(i), BASE.y + 36, { w: 28, col: 0x5ad04a }, .35, .8, t);
      run(X(i), BASE.y + 54, { w: 40, colf: foe }, 1, .6, t);
    });
    return bg({ cx: BASE.x, cy: BASE.y + 27, w: 8 * 34 + 20, h: 76 });
  };
  /** толпа: 5 мобов (среди них элита) и 3 героя, крит-удары, тики DoT и входящий урон по герою; цифры — настоящие Effects.number */
  const crowd = async (v) => {
    clear();  view(bg({ cx: BASE.x, cy: BASE.y + 76, w: 300, h: 190 }), 3);
    const fx = sc.fx, X0 = BASE.x - 110, FY = BASE.y + 70;
    const body = (x, y, c) => { const r = sc.add.rectangle(x, y - 12, 12, 24, c).setDepth(999998); objs.push(r); };
    const mobs = [[.8, 0], [.55, 0], [.35, 1], [.9, 0], [.2, 0]];
    mobs.forEach(([k, el], i) => { const x = X0 + i * 55, y = FY; body(x, y, 0x6a4a3a); run(x, y - 30, { w: el ? 28 : 20, colf: foe, elite: !!el }, k + .15, k, 1); });
    const heroes = [[.9, 0x5ad04a], [.6, 0x4ab0ff], [.75, 0x4ab0ff]];
    heroes.forEach(([k, c], i) => { const x = X0 + 30 + i * 80, y = FY + 60; body(x, y, 0x3a5a8a); run(x, y - 30, { w: 20, col: c }, k, k, -1); });
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const hit = (i, v, crit, small) => fx.number(X0 + i * 55, FY - 28, crit ? v + "!" : "" + v, crit ? "#ffd84a" : small ? "#e0902a" : "#ffffff", crit, 1, "m" + i, small, 1);
    for (let round = 0; round < 3; round++) {
      mobs.forEach((m, i) => { hit(i, 40 + i * 7 + round * 3, (i + round) % 3 === 0, false); if (round !== 1) hit(i, 5 + i, false, true); });
      heroes.forEach((h, i) => fx.number(X0 + 30 + i * 80, FY + 60 - 28, "" + (22 + i * 6), "#ff6a5a", false, 1, "h" + i, false, i === 0 ? 1 : 0.5, i === 0));
      await w(200);
    }
    await w(30); sc.tweens.timeScale = 0; // кадр замораживаем, чтобы скриншот поймал цифры в полёте
    return { cx: BASE.x, cy: BASE.y + 76, w: 300, h: 190 };
  };
  function view(r, z) { const c = sc.cameras.main; c.stopFollow(); c.setZoom(z); c.centerOn(r.cx, r.cy); }
  window.__demo = { show, strip, crowd, clear, view };
})()`;

async function shot(page: Page, r: { cx: number; cy: number; w: number; h: number }, z: number, file: string, wait = 500) {
  if (wait) { await page.evaluate((r, z) => (window as any).__demo.view(r, z), r, z); await sleep(wait); }
  const box = await page.evaluate((r, z) => {
    const cv = document.querySelector("canvas")!.getBoundingClientRect(), g = (window as any).__game;
    const k = (cv.width / g.scale.width) * z; // css px на пиксель мира
    return { x: cv.left + cv.width / 2 - (r.w * k) / 2, y: cv.top + cv.height / 2 - (r.h * k) / 2, width: r.w * k, height: r.h * k };
  }, r, z);
  if (process.env.NP_DEBUG) {
    console.log(JSON.stringify(await page.evaluate(() => { const g = (window as any).__game, sc = g.scene.getScene("game"), c = sc.cameras.main, me = (window as any).__net.self; return { me: [me.x, me.y], scroll: [c.scrollX, c.scrollY], zoom: c.zoom, mid: [c.midPoint.x, c.midPoint.y], cams: sc.cameras.cameras.length, canv: document.querySelectorAll("canvas").length, scale: [g.scale.width, g.scale.height] }; })), JSON.stringify(box));
    await page.screenshot({ path: file.replace(".png", "-full.png") });
  }
  await page.screenshot({ path: file, clip: box });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  try {
    await startServer(true);
    const hero = "ПлейтПоказ";
    await ensureChar(hero, "secret", hero, "warrior");
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.evaluateOnNewDocument("window.__name = (f) => f; try { localStorage.removeItem('uiScale'); } catch {}");
    await enter(page, hero);
    await page.evaluate(DEMO);
    await sleep(300);
    const r = await page.evaluate(() => (window as any).__demo.crowd());
    await shot(page, r, 3, path.join(OUT, "final-crowd.png"), 0);
    await page.evaluate(() => (window as any).__demo.clear());
    // настоящий бой: герой у ближайшего моба-крысолюда, бьёт его
    await page.evaluate(([x, y]) => { const n = (window as any).__net; n.send("dbg", { op: "god" }); n.send("dbg", { op: "tp", x, y }); }, [MOB.x + 30, MOB.y]);
    await sleep(2500);
    await page.evaluate(() => { const sc = (window as any).__game.scene.getScene("game"); sc.cameras.main.startFollow([...sc.units.values()].find((v: any) => v.isSelf).sprite, true, 0.15, 0.15, 0, 12); });
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => {
        const sc = (window as any).__game.scene.getScene("game"), net = (window as any).__net;
        let best: any = null, bd = 1e9;
        for (const v of sc.units.values()) if (v.u.kind === 1 && !v.dead) { const d = Math.hypot(v.x - net.self.x, v.y - net.self.y); if (d < bd) { bd = d; best = v; } }
        if (best) { if (bd > 300) net.send("dbg", { op: "tp", x: best.x + 26, y: best.y }); net.send("attack", { id: best.id }); sc.targetId = best.id; }
      });
      await page.keyboard.press("q");
      await sleep(180);
      if (i >= 4 && i % 2 === 0) await page.screenshot({ path: path.join(OUT, `final-fight-x1-${i}.png`) });
    }
    if (errors.length) throw new Error("ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("nameplates-shots: готово, " + OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
