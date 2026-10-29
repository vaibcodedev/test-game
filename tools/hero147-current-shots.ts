/**
 * Задача 147, шаг 1: снимок ТЕКУЩЕГО героя в игре для сравнения с вариантами новой основы.
 * Пятеро героев (Сольгард: воин в латах, маг, воин в стартовых лохмотьях; Умбрат: рыцарь смерти, чернокнижник) на лугу,
 * зум 2 и 3, день и вечер → tools/out/hero/current-ingame.png. Замок: свободный из tools/out/scenario.lock / scenario.lock2.
 * Запуск: $env:TEST_PORT="2991"; $env:VITE_TEST_PORT="5491"; npx tsx tools/hero147-current-shots.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PNG } from "pngjs";
import { createServer } from "vite";
import { Bot, dbFile, ensureChar, PORT, sleep } from "../tests/harness";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, zoneAtPx, walkable, Zone } from "../shared/map";
import { makeItem, Rarity } from "../shared/items";

const OUT = path.resolve("tools/out/hero");
const LOCKS = ["tools/out/scenario.lock", "tools/out/scenario.lock2"].map((p) => path.resolve(p));
const chromePath = () => [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((x) => x && fs.existsSync(x))!;

async function lock(): Promise<string> {
  for (;;) {
    for (const l of LOCKS) {
      try { const fd = fs.openSync(l, "wx"); fs.writeSync(fd, `hero147-current ${process.pid} ${new Date().toTimeString().slice(0, 8)}`); fs.closeSync(fd); return l; } catch {}
    }
    await sleep(5000);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const held = await lock();
  console.log("замок", held);
  const VP = Number(process.env.VITE_TEST_PORT) || 5491;
  const shots: { label: string; png: PNG }[] = [];
  let browser: any = null, vite: any = null;
  try {
    process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
    vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VP, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
    await vite.listen();
    browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
    for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
    Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1" });
    await import("../server/src/index");
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch {} await sleep(150); }
    const map = generateMap(MAP_SEED);
    let best: { x: number; y: number } | null = null, bd = 1e9;
    for (let ty = 8; ty < map.h - 8; ty += 3) for (let tx = 8; tx < map.w - 8; tx += 3) {
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      if (zoneAtPx(map, x, y) !== Zone.Meadow || !walkable(map, x, y, 60)) continue;
      if (![[160, 0], [-160, 0], [0, 120], [0, -120]].every(([dx, dy]) => zoneAtPx(map, x + dx, y + dy) === Zone.Meadow && walkable(map, x + dx, y + dy, 20))) continue;
      const d = Math.hypot(tx - map.w / 2, ty - map.h / 2);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (!best) throw new Error("нет луга");
    const hero = "Обзорный"; await ensureChar(hero, "secret", hero, "warrior");
    const cast: [string, string][] = [["Магесса", "mage"], ["Новичок", "warrior"], ["Рыцарьсм", "deathknight"], ["Чернокн", "warlock"]];
    const bots: Bot[] = [];
    for (const [n, c] of cast) bots.push(await Bot.join(n, "secret", c));
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = (f) => f; { const r = Date.now.bind(Date); window.__fakeMs = null; Date.now = () => window.__fakeMs ?? r(); }");
    await page.goto(`http://localhost:${VP}/`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForSelector("#login-name", { visible: true, timeout: 240000 });
    await page.type("#login-name", hero); await page.type("#login-pass", "secret"); await page.click("#login-go");
    await page.waitForSelector(`.cs-slot[data-name="${hero}"]`, { timeout: 120000 });
    await page.$eval(`.cs-slot[data-name="${hero}"]`, (b: any) => b.click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
    const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
    const w = WorldRoom.instance!.world;
    const gear: Record<string, string[]> = {
      [hero]: ["plate_helm_60", "plate_armor_60", "plate_boots_60", "sword_60", "shield_60"],
      Магесса: ["cloth_helm_37", "cloth_armor_37", "cloth_boots_37", "staff_37"],
      Новичок: [],
      Рыцарьсм: ["plate_helm_68", "plate_armor_68", "plate_boots_68", "greatsword_68"],
      Чернокн: ["cloth_helm_44", "cloth_armor_44", "cloth_boots_44", "scepter_44"],
    };
    const slotOf = (id: string) => (/helm/.test(id) ? "helmet" : /armor/.test(id) ? "armor" : /boots/.test(id) ? "boots" : /shield|orb|tome/.test(id) ? "offhand" : "weapon");
    const names = [hero, ...cast.map((c) => c[0])];
    const order = ["Новичок", hero, "Магесса", "Рыцарьсм", "Чернокн"];
    for (const n of names) {
      const p = w.findByName(n.toLowerCase())!;
      p.save.level = 70;
      for (const id of gear[n]) { try { (p.save.equip as any)[slotOf(id)] = makeItem(id, 60, Rarity.Rare); } catch (e) { console.log("нет модели", id); } }
      p.recalc();
      p.unit.maxHp = p.unit.hp = 99999; p.moveTo = null;
      const i = order.indexOf(n);
      p.unit.x = best.x + (i - 2) * 30; p.unit.y = best.y;
    }
    const setTime = async (ph: number) => { await page.evaluate((ms: number) => { (window as any).__fakeMs = ms; (window as any).__shadowMs = ms; }, ph * DAY_CYCLE_MS); };
    const zoomTo = async (zoom: number) => {
      for (let k = 0; k < 12; k++) {
        const cur = (await page.evaluate(() => (window as any).__game.scene.getScene("game").css)) as number;
        if (Math.abs(cur - zoom) < 0.01) break;
        await page.evaluate((dy: number) => { const c = document.querySelector("canvas")!; c.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true })); }, cur < zoom ? -100 : 100);
        await sleep(60);
      }
    };
    for (const [nm, ph] of [["ДЕНЬ", 0.3], ["ВЕЧЕР", 0.66]] as [string, number][]) {
      await setTime(ph); await sleep(2500);
      for (const z of [2, 3]) {
        await zoomTo(z); await sleep(400);
        const CW = Math.round(180 * z), CH = Math.round(70 * z);
        const buf = (await page.screenshot({ clip: { x: 640 - CW / 2 + 30 * z, y: 400 - CH * 0.45, width: CW, height: CH } })) as Buffer;
        shots.push({ label: `${nm} ЗУМ ${z}`, png: PNG.sync.read(buf) });
      }
    }
    for (const b of bots) b.room?.leave?.();
  } finally {
    await browser?.close().catch(() => {}); await vite?.close().catch(() => {});
    fs.rmSync(held, { force: true });
  }
  // монтаж: столбиком
  const W = Math.max(...shots.map((s) => s.png.width)) + 20, H = shots.reduce((a, s) => a + s.png.height + 10, 10);
  const out = new PNG({ width: W, height: H });
  out.data.fill(0); for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
  let y = 10;
  for (const s of shots) { PNG.bitblt(s.png, out, 0, 0, s.png.width, s.png.height, 10, y); y += s.png.height + 10; }
  fs.writeFileSync(path.join(OUT, "current-ingame.png"), PNG.sync.write(out));
  for (const s of shots) fs.writeFileSync(path.join(OUT, `current-${s.label.replace(/\s+/g, "_")}.png`), PNG.sync.write(s.png));
  console.log("→ tools/out/hero/current-ingame.png", shots.map((s) => s.label).join(", "));
  process.exit(0);
}
main().catch((e) => { console.error(e); for (const l of LOCKS) { try { if (fs.readFileSync(l, "utf8").includes(`hero147-current ${process.pid}`)) fs.rmSync(l); } catch {} } process.exit(1); });
