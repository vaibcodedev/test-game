/**
 * Сеты стражи и бойцов в игре (задача 132, шаг 8, вторая часть): сервер в этом же процессе, Vite и Chrome. Бойцы обеих фракций
 * (data/npc-gear.json) по рангам — ближник 1/2, дальник 1/2, знаменосец — выстраиваются рядами на открытом поле рядом с героем
 * (Сольгард — воин, Умбрат — рыцарь смерти), снимки каждого ряда на зуме 2 и 3, днём и ночью. Подписи бойцов в снимке — названия наборов.
 * Проверяется: бойцы рисуются телом nude_<класс> со слоями снаряжения (GearLayers), геральдика пришла (u.herald), ошибок консоли нет.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir):
 *   $env:TEST_PORT="2869"; $env:VITE_TEST_PORT="5269"; npx tsx tests/npc-sets-ingame.ts
 * Выход — tools/out/npc-sets-ingame/: <фракция>-<ранг>-z<зум>-<day|night>.png, report.json. Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { Bot, dbFile, ensureChar, PORT, sleep } from "./harness";
import { TILE } from "../shared/constants";
import { walkable } from "../shared/map";
import { Dir } from "../shared/protocol";
import { NPC_GEAR, npcGearStrings, type NpcTier } from "../shared/npcGear";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";
import type { Mob } from "../server/src/game/Mob";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5269;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/npc-sets-ingame");
const PASS = "secret";
const TIERS: NpcTier[] = ["weak", "mid", "strong", "mega"];
const FACS = ["solgard", "umbrath"] as const;
/** Шаг между фигурами и рядами (пиксели мира): подписи не налезают на соседний ряд. */
const DX = 52, DY = 104;

let page: Page;
const errors: string[] = [];
const lines: string[] = [];
let bad = 0;
const check = (ok: boolean, msg: string) => { lines.push(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; console.log(lines[lines.length - 1]); };
const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), net = window.__net, a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const busy = (port: number) => new Promise<boolean>((res) => { const c = net.createConnection({ port, host: "127.0.0.1" }); c.once("connect", () => { c.destroy(); res(true); }); c.once("error", () => res(false)); });

let W: () => World;
let heroOf: (name: string) => Player;
async function startServer() {
  if (await busy(PORT)) throw new Error(`порт ${PORT} занят: задайте свободный TEST_PORT`);
  for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) fs.rmSync(f, { force: true });
  Object.assign(process.env, { PORT: String(PORT), DB_PATH: dbFile, TEST_MODE: "1", VITE_SERVER_URL: `ws://localhost:${PORT}` });
  await import("../server/src/index");
  const { WorldRoom } = await import("../server/src/rooms/WorldRoom");
  W = () => WorldRoom.instance!.world;
  heroOf = (name) => W().findByName(name.toLowerCase())!;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch {} await sleep(150); }
  throw new Error("сервер не ответил");
}

async function enter(name: string, token: string, zoom: number) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string, z: number) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v1", String(z)); }, token, zoom);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 50000, polling: 250 });
  await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 50000, polling: 250 });
  await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 40000, polling: 250 });
  await sleep(1500);
}

/** Кадр мира w×h px вокруг (cx, cy) из холста. */
async function snap(cx: number, cy: number, w: number, h: number): Promise<PNG> {
  const c = await run<{ url: string; x: number; y: number; z: number }>(`
    const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    cam.stopFollow(); cam.centerOn(a.cx, a.cy);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const k = cv.width / g.scale.width;
    return { url: cv.toDataURL('image/png'), x: (a.cx - cam.worldView.x) * cam.zoom * k, y: (a.cy - cam.worldView.y) * cam.zoom * k, z: cam.zoom * k };`, { cx, cy });
  const src = PNG.sync.read(Buffer.from(c.url.split(",")[1], "base64"));
  const ww = Math.min(Math.round(w * c.z), src.width), hh = Math.min(Math.round(h * c.z), src.height);
  const x0 = Math.max(0, Math.min(src.width - ww, Math.round(c.x - ww / 2))), y0 = Math.max(0, Math.min(src.height - hh, Math.round(c.y - hh / 2)));
  const out = new PNG({ width: ww, height: hh });
  PNG.bitblt(src, out, x0, y0, ww, hh, 0, 0);
  return out;
}
const save = (name: string, p: PNG) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), PNG.sync.write(p)); };

/** Открытые полосы под ряды: n прямоугольников tw×th тайлов, проходимых и без объектов карты, не ближе 4 тайлов друг к другу. */
function fields(w: World, n: number, tw: number, th: number): { x: number; y: number }[] {
  const m = w.map, occupied = new Set<number>(), out: { x: number; y: number }[] = [];
  for (const o of m.objects) { const cx = Math.floor(o.x / TILE), cy = Math.floor(o.y / TILE); for (let j = -7; j <= 1; j++) for (let i = -3; i <= 4; i++) occupied.add((cy + j) * m.w + cx + i); }
  for (let y = 4; y < m.h - th - 4 && out.length < n; y++) for (let x = 4; x < m.w - tw - 4 && out.length < n; x++) {
    if (out.some((f) => x > f.x - tw - 4 && x < f.x + tw + 4 && y > f.y - th - 4 && y < f.y + th + 4)) continue;
    let ok = true;
    for (let j = 0; j < th && ok; j++) for (let i = 0; i < tw && ok; i++) if (occupied.has((y + j) * m.w + x + i) || !walkable(m, (x + i) * TILE + 16, (y + j) * TILE + 16, 12)) ok = false;
    if (ok) out.push({ x, y });
  }
  if (out.length < n) throw new Error(`открытых полос под ряды: ${out.length} из ${n}`);
  return out.map((f) => ({ x: f.x * TILE, y: f.y * TILE }));
}

type Fig = { m: Mob; x: number; y: number };
async function scenario() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const token = await ensureChar("npcset_view", PASS, "Эйра", "warrior");
  const bot = await Bot.enter(await ensureChar("npcset_dk", PASS, "Моргрим", "deathknight"), "Моргрим");
  const w = W(), D = heroOf("Моргрим");
  let H: Player | null = null;
  // ряд на ранг и фракцию — своя открытая полоса: герой (у Умбрата — рыцарь смерти, воин левее за кадром), ближник 1/2, дальник 1/2, знаменосец
  const tw = Math.ceil((7 * DX + 40) / TILE) + 1, th = 5;
  const slots = fields(w, FACS.length * TIERS.length, tw, th);
  const rows = new Map<string, { x: number; y: number }>();
  TIERS.forEach((t, r) => FACS.forEach((f, k) => { const sl = slots[r * FACS.length + k]; rows.set(`${f}-${t}`, { x: sl.x + 40 + 1.5 * DX, y: sl.y + 4 * TILE }); }));
  // мобы у рядов не мешают
  for (const m of [...w.mobs.values()]) if (!m.faction && [...rows.values()].some((r) => Math.hypot(m.x - r.x, m.y - r.y) < 900)) w.removeMob(m);
  // бойцы для строя — издалека от всех рядов (клиент создаёт их вид заново, когда подойдут)
  const pool = w.soldiers!.list.filter((m) => [...rows.values()].every((r) => Math.hypot(m.x - r.x, m.y - r.y) > 2600));
  const figs: Fig[] = [];
  const place = (fac: "solgard" | "umbrath", tier: NpcTier) => {
    const S = NPC_GEAR.sets[fac][tier], R0 = rows.get(`${fac}-${tier}`)!;
    const list = [{ s: S.melee[0], k: "melee" }, { s: S.melee[1], k: "melee" }, { s: S.ranged[0], k: "ranged" }, { s: S.ranged[1], k: "ranged" }, { s: S.melee[0], k: "melee", b: true }];
    list.forEach((e, i) => {
      const at = pool.findIndex((m) => m.faction === fac);
      if (at < 0) throw new Error("не хватило бойцов для строя");
      const m = pool.splice(at, 1)[0];
      const g = npcGearStrings(e.s, !!e.b), u = m.unit, s = m.soldier!;
      const x = R0.x + (i + 1) * DX, y = R0.y;
      u.sprite = e.s.cls; u.gear = g.gear; u.weapon = g.weapon; u.herald = g.herald;
      u.name = e.b ? "Знаменосец" : e.s.title;
      u.title = tier === "mega" && i < 2 ? NPC_GEAR.championTitle[fac] : "";
      s.ranged = e.k === "ranged"; s.role = "post"; s.site = null; s.route = []; s.post = { x, y, dir: Dir.Down }; s.anchor = { x, y };
      s.foe = null; s.mobFoe = null; m.state = "idle";
      u.x = s.px = s.wx = x; u.y = s.py = s.wy = y; u.dir = Dir.Down;
      figs.push({ m, x, y });
    });
  };
  TIERS.forEach((t) => FACS.forEach((f) => place(f, t)));
  // герои — не враги бойцам (команда арены): у ряда Сольгарда — воин, у ряда Умбрата — рыцарь смерти (воин левее, за кадром: вокруг него клиент держит юниты)
  D.team = 1;
  let cur = rows.get("solgard-weak")!, curFac: string = "solgard";
  const hold = () => {
    const put = (p: Player | null, x: number, y: number) => { if (!p) return; if (p.dead) { console.log(`${p.unit.name} мёртв — поднимаю`); p.dead = false; p.unit.anim = 0; } p.unit.x = x; p.unit.y = y; p.moveTo = null; p.unit.hp = p.unit.maxHp; p.unit.dir = Dir.Down; };
    put(H, curFac === "solgard" ? cur.x : cur.x - 90, cur.y);
    if (curFac === "umbrath") put(D, cur.x, cur.y); else put(D, rows.get("umbrath-weak")!.x, rows.get("umbrath-weak")!.y);
    for (const f of figs) { const u = f.m.unit; if (u.x !== f.x || u.y !== f.y) { u.x = f.x; u.y = f.y; } u.hp = u.maxHp; u.dir = Dir.Down; f.m.soldier!.foe = null; u.target = ""; }
  };
  hold();
  const keep = setInterval(hold, 50);
  // снаряжение героя для масштаба — как у героя на монтаже (латы 18 ур., редкие)
  const heroGear = "1:0:::plate_helm:plate_helm_18|1:0:::plate_armor:plate_armor_18|1:0:::plate_boots:plate_boots_18||1:0:::cloak_str:cloak_str_24";
  const heroWeapon = "greatsword:1:0::greatsword_24";
  try {
    for (const zoom of [2, 3]) {
      await enter("Эйра", token, zoom);
      H = heroOf("Эйра");
      H.team = 1;
      for (const p of [H, D]) { p.unit.gear = heroGear; p.unit.weapon = heroWeapon; }
      for (const [tod, frac] of [["day", 0.3], ["night", 0.82]] as const) {
        await page.evaluate((f: number) => { const C = 20 * 60 * 1000, r = (window as any).__realNow(); (window as any).__dshift = f * C - (r % C); }, frac);
        let first = true;
        for (const tier of TIERS) for (const fac of FACS) {
          cur = rows.get(`${fac}-${tier}`)!; curFac = fac;
          hold();
          await run("sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(a.x, a.y);", { x: cur.x + 2.5 * DX, y: cur.y - 22 });
          await sleep(first ? 3500 : 2000);
          if (zoom === 2 && tod === "day" && first) {
            const st = await run<{ n: number; nude: number; layered: number; herald: number }>(
              "let n = 0, nude = 0, layered = 0, herald = 0; for (const v of sc.units.values()) { if (v.u.kind !== 6) continue; n++; if (v.sprite.texture.key.startsWith('u_nude_')) nude++; if (v.layers) layered++; if (v.u.herald) herald++; } return { n, nude, layered, herald };");
            check(st.n >= 5 && st.nude === st.n && st.layered === st.n, `бойцы рядом рисуются телом nude_<класс> со слоями: ${st.nude}/${st.n}, слои ${st.layered}`);
            check(st.herald === st.n, `геральдика пришла у всех бойцов рядом: ${st.herald}/${st.n}`);
          }
          first = false;
          save(`${fac}-${tier}-z${zoom}-${tod}.png`, await snap(cur.x + 2.5 * DX, cur.y - 22, 6 * DX + 24, DY - 4));
        }
      }
    }
  } finally {
    clearInterval(keep);
    void bot;
  }
}

async function main() {
  await startServer();
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      (window as any).__name = (t: unknown) => t;
      // часы дня и ночи (shared/daynight.ts берёт Date.now): сдвиг задаёт сценарий
      const real = Date.now.bind(Date);
      (window as any).__realNow = real; (window as any).__dshift = 0;
      Date.now = () => real() + (window as any).__dshift;
    });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    // повторный вход после перезагрузки страницы (смена зума) заново регистрирует анимации боссов — не ошибка сценария
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext|AnimationManager key already exists/i.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    lines.push(`EXC ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
    console.log(lines[lines.length - 1]);
    bad++;
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nСеты бойцов в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
