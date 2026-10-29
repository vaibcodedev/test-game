/**
 * Призывы чернокнижника в игре (скелет и демон, tools/gen/pets): чернокнижник на лугу призывает обоих — серия кадров появления,
 * затем покой днём и ночью на зуме 2 и 3. Сервер — в процессе, призыв — как в server/src/game/mages.ts (Pet + событие spawn).
 * Запуск (под замком): $env:TEST_PORT="2971"; $env:VITE_TEST_PORT="5471"; npx tsx tests/warlock-pets-shots.ts → tools/out/warlock-pets/ingame.png
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PNG } from "pngjs";
import { createServer } from "vite";
import { dbFile, ensureChar, PORT, sleep } from "./harness";
import { DAY_CYCLE_MS } from "../shared/daynight";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, zoneAtPx, walkable, Zone } from "../shared/map";
import { SUMMONS } from "../shared/skills";
import { PC } from "../tools/gen/canvas";
import { text, stackRows, type Row } from "../tools/gen/mobs/lib";

const chromePath = () => [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((x) => x && fs.existsSync(x))!;
const OUT = path.resolve("tools/out/warlock-pets");
const CW = 420, CH = 300;
async function main() {
  const VP = Number(process.env.VITE_TEST_PORT) || 5471;
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VP, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,800", "--no-sandbox"], defaultViewport: { width: 1280, height: 800 } });
  const shots: { label: string; png: PNG }[] = [];
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
    const hero = "Колдун"; await ensureChar(hero, "secret", hero, "warlock");
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
    await page.evaluate((ms) => { (window as any).__fakeMs = ms; (window as any).__shadowMs = ms; }, 0.3 * DAY_CYCLE_MS);
    await sleep(3000);
    const shot = async (label: string, zoom: number, cy = -6) => {
      for (let k = 0; k < 8; k++) {
        const cur = (await page.evaluate(() => (window as any).__game.scene.getScene("game").css)) as number;
        if (Math.abs(cur - zoom) < 0.01) break;
        await page.evaluate((dy) => { const c = document.querySelector("canvas")!; c.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true })); }, cur < zoom ? -100 : 100);
        await sleep(60);
      }
      await sleep(120);
      const buf = (await page.screenshot({ clip: { x: 640 - CW / 2 + 30 * zoom, y: 400 - CH / 2 + (cy + 4) * zoom, width: CW, height: CH } })) as Buffer;
      shots.push({ label, png: PNG.sync.read(buf) });
    };
    const summon = (id: string, dx: number, dy: number) => {
      const base = SUMMONS[id] as unknown as Record<string, unknown>;
      const def = { ...base, id, price: 0, level: 0, skills: [], temp: true } as never;
      const pet = new Pet(def, p, p.level);
      pet.unit.x = p.unit.x + dx; pet.unit.y = p.unit.y + dy;
      w.pets.set(pet.id, pet);
      w.state.mobs.set(pet.id, pet.unit);
      w.emit({ t: "spawn", id: pet.id, k: "smoke" });
      return pet;
    };
    
    await shot("ДО ПРИЗЫВА · ЗУМ 3", 3);
    summon("wl_skeleton", 30, 4);
    for (let k = 0; k < 5; k++) { await sleep(180); await shot(`СКЕЛЕТ ВСТАЁТ ИЗ ЗЕМЛИ · ${k + 1}`, 3); }
    await sleep(1500);
    summon("wl_demon", 66, 10);
    for (let k = 0; k < 5; k++) { await sleep(180); await shot(`ДЕМОН ИЗ ПЕЧАТИ · ${k + 1}`, 3); }
    await sleep(2500);
    for (const [name, ph] of [["ДЕНЬ", 0.3], ["НОЧЬ", 0.83]] as [string, number][]) {
      await page.evaluate((ms) => { (window as any).__fakeMs = ms; (window as any).__shadowMs = ms; }, ph * DAY_CYCLE_MS);
      await sleep(3500);
      await shot(`${name} · ЗУМ 2`, 2);
      await sleep(400);
      await shot(`${name} · ЗУМ 3`, 3);
    }
  } finally { await browser.close().catch(() => {}); await vite.close().catch(() => {}); }
  // лист
  const cols = 4;
  const rows: Row[] = [{ h: 40, draw: (c, y) => text(c, "ЧЕРНОКНИЖНИК ПРИЗЫВАЕТ СКЕЛЕТА И ДЕМОНА · ЛУГ · В ИГРЕ", 16, y + 8, 3) }];
  for (let i = 0; i < shots.length; i += cols) {
    const part = shots.slice(i, i + cols);
    rows.push({
      h: CH + 30,
      draw: (c, y0) => part.forEach((s, j) => {
        const x0 = 16 + j * (CW + 12);
        text(c, s.label, x0, y0 + 4, 2);
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const k = (y * s.png.width + x) * 4; c.set(x0 + x, y0 + 26 + y, [s.png.data[k], s.png.data[k + 1], s.png.data[k + 2], 255]); }
      }),
    });
  }
  stackRows(rows, 32 + cols * (CW + 12)).save(path.join(OUT, "ingame.png"));
  console.log(`  → ${path.join(OUT, "ingame.png")} (${shots.length} кадров)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
void PC;
