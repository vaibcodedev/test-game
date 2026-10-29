/**
 * Питомцы зверинца в игре (проход 4, tools/gen/pets2): каждый из 10 питомцев рядом с героем на лугу, зум 2, день и вечер,
 * плюс окно смотрителя зверинца. Сервер — в процессе, питомец ставится как в tests/menagerie.ts (new Pet + событие spawn).
 * Запуск (под замком tools/out/scenario.lock): $env:TEST_PORT="2977"; $env:VITE_TEST_PORT="5477"; npx tsx tools/pets-ingame-shots.ts
 *   → tools/out/pets/ingame.png
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PNG } from "pngjs";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "../tests/harness";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, zoneAtPx, walkable, Zone } from "../shared/map";
import { PETS, PET_IDS } from "../shared/pets";
import { text, stackRows, type Row } from "./gen/mobs/lib";

const chromePath = () => [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((x) => x && fs.existsSync(x))!;
const OUT = path.resolve("tools/out/pets");
const CW = 360, CH = 220;
async function main() {
  const VP = Number(process.env.VITE_TEST_PORT) || 5477;
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VP, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  const shots: { label: string; png: PNG; w: number; h: number }[] = [];
  let win: PNG | null = null;
  try {
    for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
    Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1", VITE_SERVER_URL: `ws://localhost:${PORT}` });
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
    const hero = "Смотрящий"; await ensureChar(hero, "secret", hero, "warrior");
    const page = await browser.newPage();
    await page.evaluateOnNewDocument("window.__name = (f) => f; { const r = Date.now.bind(Date); window.__fakeMs = null; Date.now = () => window.__fakeMs ?? r(); }");
    await page.goto(`http://localhost:${VP}/`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForSelector("#login-name", { visible: true, timeout: 240000 });
    await page.type("#login-name", hero); await page.type("#login-pass", "secret"); await page.click("#login-go");
    await page.waitForSelector(`.cs-slot[data-name="${hero}"]`, { timeout: 120000 });
    await page.$eval(`.cs-slot[data-name="${hero}"]`, (b) => (b as HTMLElement).click());
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 90000 });
    const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
    const { Pet } = await import("../server/src/game/Pet");
    const w = WorldRoom.instance!.world;
    const p = w.findByName(hero.toLowerCase())!;
    p.unit.x = best.x; p.unit.y = best.y; p.moveTo = null; p.unit.maxHp = p.unit.hp = 99999;
    p.save.pets = Object.fromEntries(PET_IDS.slice(0, 6).map((id) => [id, { level: PETS[id].level, xp: 0 }]));
    const setTime = async (ph: number) => { await page.evaluate((ms) => { (window as any).__fakeMs = ms; (window as any).__shadowMs = ms; }, ph * DAY_CYCLE_MS); };
    await setTime(0.3);
    await sleep(3000);
    const zoomTo = async (zoom: number) => {
      for (let k = 0; k < 10; k++) {
        const cur = (await page.evaluate(() => (window as any).__game.scene.getScene("game").css)) as number;
        if (Math.abs(cur - zoom) < 0.01) break;
        await page.evaluate((dy) => { const c = document.querySelector("canvas")!; c.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true })); }, cur < zoom ? -100 : 100);
        await sleep(60);
      }
    };
    const shot = async (label: string, zoom: number) => {
      await zoomTo(zoom); await sleep(150);
      const buf = (await page.screenshot({ clip: { x: 640 - CW / 2 + 22 * zoom, y: 400 - CH / 2 - 8 * zoom, width: CW, height: CH } })) as Buffer;
      shots.push({ label, png: PNG.sync.read(buf), w: CW, h: CH });
    };
    let cur: InstanceType<typeof Pet> | null = null;
    const place = (id: string) => {
      if (cur) { w.pets.delete(cur.id); w.state.mobs.delete(cur.id); }
      const pet = new Pet(PETS[id], p, PETS[id].level);
      pet.unit.x = p.unit.x + 40; pet.unit.y = p.unit.y + 2;
      w.pets.set(pet.id, pet); w.state.mobs.set(pet.id, pet.unit);
      w.emit({ t: "spawn", id: pet.id, k: "smoke" });
      cur = pet;
    };
    for (const [name, ph] of [["ДЕНЬ", 0.3], ["ВЕЧЕР", 0.66]] as [string, number][]) {
      await setTime(ph); await sleep(2500);
      for (const id of PET_IDS) {
        place(id);
        await sleep(2600);
        p.unit.x = best.x; p.unit.y = best.y;
        await shot(`${PETS[id].name.toUpperCase()} · ${name} · ЗУМ 2`, 2);
      }
    }
    // окно смотрителя зверинца
    await setTime(0.3); await sleep(1500);
    await page.evaluate(() => { const h = (window as any).__game.scene.getScene("game").hud; h.menagerie.open(); });
    await sleep(800);
    win = PNG.sync.read((await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } })) as Buffer);
  } finally { await browser.close().catch(() => {}); await vite.close().catch(() => {}); }
  const cols = 4, W = 32 + cols * (CW + 12);
  const rows: Row[] = [{ h: 40, draw: (c, y) => text(c, "ПИТОМЦЫ ЗВЕРИНЦА В ИГРЕ · ПРОХОД 4 · РЯДОМ С ГЕРОЕМ · ЗУМ 2", 16, y + 8, 3) }];
  for (let i = 0; i < shots.length; i += cols) {
    const part = shots.slice(i, i + cols);
    rows.push({
      h: CH + 30,
      draw: (c, y0) => part.forEach((s, j) => {
        const x0 = 16 + j * (CW + 12);
        text(c, s.label, x0, y0 + 4, 1);
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const k = (y * s.png.width + x) * 4; c.set(x0 + x, y0 + 20 + y, [s.png.data[k], s.png.data[k + 1], s.png.data[k + 2], 255]); }
      }),
    });
  }
  if (win) {
    const wp = win, k = Math.min(1, (W - 32) / wp.width);
    rows.push({
      h: Math.round(wp.height * k) + 30,
      draw: (c, y0) => {
        text(c, "ОКНО СМОТРИТЕЛЯ ЗВЕРИНЦА", 16, y0 + 4, 2);
        for (let y = 0; y < Math.round(wp.height * k); y++) for (let x = 0; x < Math.round(wp.width * k); x++) { const q = (Math.floor(y / k) * wp.width + Math.floor(x / k)) * 4; c.set(16 + x, y0 + 26 + y, [wp.data[q], wp.data[q + 1], wp.data[q + 2], 255]); }
      },
    });
  }
  stackRows(rows, W).save(path.join(OUT, "ingame.png"));
  console.log(`  → ${path.join(OUT, "ingame.png")} (${shots.length} кадров)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
