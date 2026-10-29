/**
/**
 * Берег-срез воды (client/src/game/waterLava.ts, вид 2): «сейчас | B | B+берег» на озере, реке, болоте, у моста, днём и ночью, зум 2 и 3 → tools/out/shaders/water-bank5.png.
 * Места — по маске воды карты (generateMap), без ручной разметки. Запуск под замком tools/out/scenario.lock: TEST_PORT=2961 VITE_TEST_PORT=5461 npx tsx tests/water-bank-shots.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { generateMap, moveWithCollision, T, walkable, waterAtFeet, Zone, zoneAt } from "../shared/map";
import { MAP_SEED } from "../shared/constants";
import { PC } from "../tools/gen/canvas";
import { drawText } from "../tools/gen/vendor-lib";
import { sleep, startServer, stopServer, PORT } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5461;
const OUT = path.resolve("tools/out/shaders");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
const base = Math.floor(Date.now() / DAY_CYCLE_MS) * DAY_CYCLE_MS;
const DAY = base + DAY_CYCLE_MS * 0.3, NIGHT = base + DAY_CYCLE_MS * 0.82;
const CW = 320, CH = 200; // вырезка в пикселях экрана
const NAMES = ["сейчас", "B", "B + берег"];

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

const decode = (u: string) => PNG.sync.read(Buffer.from(u.split(",")[1], "base64"));
let focus = { x: 640, y: 400 }; // точка берега/лавы на экране
const crop = (src: PNG, w: number, h: number): PNG => { const o = new PNG({ width: w, height: h }); const x0 = Math.max(0, Math.min(src.width - w, Math.round(focus.x - w / 2))), y0 = Math.max(0, Math.min(src.height - h, Math.round(focus.y - h / 2))); PNG.bitblt(src, o, x0, y0, w, h, 0, 0); return o; };
const scale = (p: PNG, k: number): PNG => { // k>1 — увеличить, k<1 — уменьшить (ближайший сосед)
  const o = new PNG({ width: Math.round(p.width * k), height: Math.round(p.height * k) });
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) { const s = (Math.min(p.height - 1, Math.floor(y / k)) * p.width + Math.min(p.width - 1, Math.floor(x / k))) * 4, d = (y * o.width + x) * 4; for (let i = 0; i < 4; i++) o.data[d + i] = p.data[s + i]; }
  return o;
};
const label = (dst: PNG, text: string, x: number, y: number) => {
  const pc = new PC(text.length * 6 + 4, 9);
  for (let i = 0; i < pc.data.length; i += 4) { pc.data[i] = 0; pc.data[i + 1] = 0; pc.data[i + 2] = 0; pc.data[i + 3] = 200; }
  drawText(pc, text, 2, 1, [255, 240, 200, 255], 1);
  const k = 2;
  for (let yy = 0; yy < pc.h * k; yy++) for (let xx = 0; xx < pc.w * k; xx++) {
    const s = (Math.floor(yy / k) * pc.w + Math.floor(xx / k)) * 4, X = x + xx, Y = y + yy;
    if (X >= dst.width || Y >= dst.height) continue;
    const d = (Y * dst.width + X) * 4, a = pc.data[s + 3] / 255;
    for (let i = 0; i < 3; i++) dst.data[d + i] = Math.round(dst.data[d + i] * (1 - a) + pc.data[s + i] * a);
  }
};
const put = (sheet: PNG, p: PNG, x: number, y: number, cap: string) => { PNG.bitblt(p, sheet, 0, 0, p.width, p.height, x, y); label(sheet, cap, x + 4, y + 4); };


type Spot = { id: string; cap: string; x: number; y: number; t: number; zoom: number };
function spots(): Spot[] {
  const m = generateMap(MAP_SEED), V = (x: number, y: number) => m.vtx[y * (m.w + 1) + x];
  const R = 5, M = 16;
  const shore = (pred: (tx: number, ty: number) => boolean, near?: { x: number; y: number }) => {
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let ty = M; ty < m.h - M; ty += 2) for (let tx = M; tx < m.w - M; tx += 2) {
      if (!pred(tx, ty)) continue;
      let c = 0, n = 0; for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) { n++; if (V(tx + x, ty + y) === T.Water) c++; }
      const f = c / n; if (f < 0.3 || f > 0.6) continue;
      if (!(V(tx, ty - 3) > 1 && V(tx, ty + 3) === T.Water)) continue; // суша на севере, вода на юге: видна стенка
      const d = near ? Math.hypot(tx * 32 - near.x, ty * 32 - near.y) : Math.hypot(tx - m.playerSpawn.x / 32, ty - m.playerSpawn.y / 32);
      if (d < bd) { bd = d; best = { x: tx * 32, y: ty * 32 }; }
    }
    return best;
  };
  const inZ = (z: Zone) => (tx: number, ty: number) => zoneAt(tx, ty, MAP_SEED) === z;
  const bridges = m.objects.filter((o) => o.kind === "bridge_h" || o.kind === "bridge_v");
  const out: Spot[] = [];
  const add = (id: string, cap: string, p: { x: number; y: number } | null, t: number, zoom: number) => { if (p) out.push({ id, cap, x: p.x, y: p.y, t, zoom }); else console.log("нет места:", id); };
  add("lake", "озеро, день, зум 2", shore(inZ(Zone.Meadow)), DAY, 2);
  const b0 = bridges[0] ?? null;
  add("river", "река, день, зум 2", b0 ? shore(() => true, { x: b0.x, y: b0.y - 200 }) : null, DAY, 2);
  add("swamp", "болото, ночь, зум 2", shore(inZ(Zone.Swamp)), NIGHT, 2);
  add("bridge", "мост, день, зум 2", b0 ? { x: b0.x, y: b0.y - 16 } : null, DAY, 2);
  add("forest", "пруд в лесу, ночь, зум 2", shore(inZ(Zone.Forest)), NIGHT, 2);
  const bl = bridges.find((b) => zoneAt(b.x / 32, b.y / 32, MAP_SEED) !== Zone.Town && Math.hypot(b.x - (b0?.x ?? 0), b.y - (b0?.y ?? 0)) > 2000 && zoneAt(b.x / 32, b.y / 32, MAP_SEED) !== Zone.Snow) ?? null;
  add("river2", "река у другого моста, день, зум 2", bl ? shore(() => true, { x: bl.x, y: bl.y - 200 }) : null, DAY, 2);
  // маленький пруд 1–3 тайла: вода в окне 7x7 от 3 до 12 вершин, вокруг суша
  let pond: { x: number; y: number } | null = null, pd = Infinity;
  for (let ty = 20; ty < m.h - 20 && pd > 0; ty += 1) for (let tx = 20; tx < m.w - 20; tx += 1) {
    if (V(tx, ty) !== T.Water) continue;
    let c = 0, edge = 0; for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) { if (V(tx + x, ty + y) === T.Water) { c++; if (Math.abs(x) === 4 || Math.abs(y) === 4) edge++; } }
    if (c < 2 || c > 14 || edge) continue;
    if (m.spawns.some((sp) => Math.hypot(sp.x - tx * 32, sp.y - ty * 32) < 600)) continue;
    const d = Math.hypot(tx - m.playerSpawn.x / 32, ty - m.playerSpawn.y / 32); if (d < pd) { pd = d; pond = { x: tx * 32, y: ty * 32 }; }
  }
  // узкий ручей (ширина 2–3 вершины по x, вдоль ≥ 3), в болотной зоне; лучше рядом с пеплом/вулканом (в радиусе ~20 тайлов)
  let creek: { x: number; y: number } | null = null, cd = Infinity;
  const nearVolc = (tx: number, ty: number) => [[-20, 0], [20, 0], [0, -20], [0, 20], [-14, -14], [14, 14]].some(([dx, dy]) => [Zone.Ashlands, Zone.Volcano].includes(zoneAt(tx + dx, ty + dy, MAP_SEED)));
  for (let ty = 20; ty < m.h - 20; ty += 1) for (let tx = 20; tx < m.w - 20; tx += 1) {
    if (V(tx, ty) !== T.Water || V(tx - 1, ty) === T.Water || ![Zone.Swamp, Zone.Ashlands].includes(zoneAt(tx, ty, MAP_SEED))) continue;
    let w = 0; while (w < 6 && V(tx + w, ty) === T.Water) w++;
    if (w < 2 || w > 3 || V(tx + w, ty) === T.Water) continue;
    let ok = true; for (let k = 1; k < 3 && ok; k++) { let ww = 0; while (ww < 6 && V(tx + ww, ty + k) === T.Water) ww++; if (ww < 2 || ww > 4 || V(tx - 1, ty + k) === T.Water) ok = false; }
    if (!ok) continue;
    const d = (nearVolc(tx, ty) ? 0 : 1e6) + Math.hypot(tx - m.playerSpawn.x / 32, ty - m.playerSpawn.y / 32); if (d < cd) { cd = d; creek = { x: (tx + 1) * 32, y: (ty + 1) * 32 }; }
  }
  add("creek", "ручей в болоте 2–3 тайла, день, зум 2", creek, DAY, 2);
  add("puddle", "малый пруд (1–3 тайла), день, зум 2", pond, DAY, 2);
  const si = out.findIndex((q) => q.id === "swamp");
  if (si >= 0) out.push(...out.splice(si, 1));
  return out;
}

/** Ближайшая сухая проходимая точка к (x, y) — герой стоит на берегу, а не в воде. */
function dryNear(m: ReturnType<typeof generateMap>, x: number, y: number): { x: number; y: number } {
  for (let r = 0; r < 400; r += 16) for (let a = 0; a < 16; a++) {
    const px = x + Math.cos((a / 16) * 6.283) * r, py = y + Math.sin((a / 16) * 6.283) * r;
    if (walkable(m, px, py, 10) && !waterAtFeet(m, px, py)) return { x: px, y: py };
  }
  return { x, y };
}

async function main() {
  const list = spots();
  console.log(JSON.stringify(list));
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const gpuArgs = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--no-sandbox"];
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: [...gpuArgs, "--window-size=1280,800"], defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
  const errors: string[] = [];
  const rows: PNG[][] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, `Wb${process.pid % 1000}`);
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "god" });
    await page.evaluate(() => {
      const w = window as any;
      w.__cap = (delays: number[]) => new Promise((res) => { const g = w.__game, out: string[] = []; let i = 0, t0: number | null = null;
        const on = () => { const now = performance.now(); if (t0 === null) t0 = now; if (now - t0 >= delays[i]) { out.push(g.canvas.toDataURL("image/png")); i++; if (i >= delays.length) { g.events.off("postrender", on); res(out); } } };
        g.events.on("postrender", on); });
      w.__focus = (p: { x: number; y: number }) => { const sc = w.__game.scene.getScene("game"), c = sc.cameras.main, g = w.__game, k = g.canvas.width / g.scale.width; return { x: (p.x - c.worldView.x) * c.zoom * k, y: (p.y - c.worldView.y) * c.zoom * k }; };
    });
    /** Герой мог погибнуть от мобов у болота (серый кадр): воскрешаем и лечим перед каждым местом. */
    const revive = async () => { await page.evaluate(() => (window as any).__net.send("respawn", {})); await sleep(600); await dbg({ op: "god" }); await sleep(300); };
    const setNow = (ms: number) => page.evaluate((target) => { const w = window as any; const real = w.__realNow ??= Date.now.bind(Date); (Date as any).now = () => real() + (target - real()); }, ms);
    const shoot = async (sp: Spot) => {
      await page.evaluate((z) => (window as any).__game.scene.getScene("game").cameras.main.setZoom(z), sp.zoom);
      await setNow(sp.t);
      await page.evaluate(() => { const f = (window as any).__fx.debugFx; f.rain = 0; f.wet = 0; });
      const dry = dryNear(generateMap(MAP_SEED), sp.x + 16, sp.y + 16);
      await revive();
      await dbg({ op: "tp", x: dry.x, y: dry.y });
      await sleep(5500);
      const row: PNG[] = [];
      for (const look of [0, 1, 2]) {
        await page.evaluate((l) => { (window as any).__waterLook = l; }, look);
        await sleep(900);
        focus = await page.evaluate((p) => (window as any).__focus(p), { x: sp.x, y: sp.y + 8 });
        const [u] = (await page.evaluate(() => (window as any).__cap([0]))) as string[];
        row.push(crop(decode(u), CW, CH));
      }
      rows.push(row);
    };
    for (const sp of list.filter((q) => q.id !== "swamp")) await shoot(sp);
    try {
    // ноги у кромки: идём к воде по расчёту shared/map.ts (тот же moveWithCollision, что у сервера и предсказания), встаём и снимаем крупно
    const edgeShots: PNG[] = [], edgeCaps: string[] = [];
    const mm = generateMap(MAP_SEED);
    await page.evaluate(() => (window as any).__game.scene.getScene("game").cameras.main.setZoom(4));
    await setNow(DAY);
    for (const sp of list.filter((q) => ["lake", "river", "bridge", "creek", "puddle"].includes(q.id))) {
      let tries = 0;
      for (const [dx, dy, nm] of [[0, 1, "с севера"], [1, 0, "с запада"], [-1, 0, "с востока"], [0, -1, "с юга"]] as const) {
        if (tries >= 2) break;
        let x = sp.x - dx * 100, y = sp.y - dy * 100;
        const st = dryNear(mm, x, y); x = st.x; y = st.y;
        for (let i = 0; i < 200; i++) { const q = moveWithCollision(mm, x, y, dx * 4, dy * 4, 10); if (q.x === x && q.y === y) break; x = q.x; y = q.y; }
        if (!waterAtFeet(mm, x + dx * 6, y + dy * 6) || Math.hypot(x - sp.x, y - sp.y) > 160) continue; // не уткнулись в воду
        tries++;
        await revive();
        await dbg({ op: "tp", x, y });
        await sleep(3500);
        await page.evaluate((l) => { (window as any).__waterLook = l; }, 2);
        focus = await page.evaluate((p) => (window as any).__focus(p), { x, y });
        const [u] = (await page.evaluate(() => (window as any).__cap([0]))) as string[];
        const cr = crop(decode(u), 240, 150);
        edgeShots.push(cr); edgeCaps.push(`${sp.id} ${nm}`);
      }
    }
    if (edgeShots.length) {
      const cols = 2, sheetE = new PNG({ width: 480 * cols, height: 300 * Math.ceil(edgeShots.length / cols) });
      sheetE.data.fill(20);
      edgeShots.forEach((p2, i) => put(sheetE, scale(p2, 2), (i % cols) * 480, Math.floor(i / cols) * 300, edgeCaps[i]));
      fs.writeFileSync(path.join(OUT, "water-edge.png"), PNG.sync.write(sheetE));
    }
    } catch (e) { console.log("кадры ног не сняты:", String(e).slice(0, 200)); }
    for (const sp of list.filter((q) => q.id === "swamp")) await shoot(sp); // болото последним: мобы там убивают героя
    const sheet = new PNG({ width: CW * 2 * 3, height: CH * 2 * rows.length });
    sheet.data.fill(20);
    rows.forEach((row, r) => row.forEach((p, c) => put(sheet, scale(p, 2), c * CW * 2, r * CH * 2, `${list[r].cap}: ${NAMES[c]}`)));
    fs.writeFileSync(path.join(OUT, "water-bank5.png"), PNG.sync.write(sheet));
    console.log("water-bank5 записан");
    await page.close();
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  console.log("errors", JSON.stringify(errors.slice(0, 8)));
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
