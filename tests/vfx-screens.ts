/**
 * Скриншоты анимаций умений (задача 127, data/skill-fx.json): по кадру на пике каждой фазы — cast, proj (в полёте), hit, aura и end
 * (баф снят) — для списка умений: у каждого класса свой герой, рядом цель (моб на траве или спутница на брусчатке).
 * Бой не нужен: клиентский путь проигрывания (GameScene.fx.play) получает синтетические fx с метками s (умение) и c (кастер).
 * Время идёт вручную: цикл Phaser усыплён, сцену двигаем шагами game.step по 40 мс, поэтому пик кадра не зависит от загрузки машины.
 *
 * Запуск (порты свободные, TEST_PORT / VITE_TEST_PORT):
 *   $env:TEST_PORT="2801"; $env:VITE_TEST_PORT="5399"; npx tsx tests/vfx-screens.ts [--only=fireball,meteor] [--phase=cast,hit] [--both] [--field=grass|cobble] [--zoom=3]
 *     [--variants=снаряд:удар,снаряд:удар]
 * По умолчанию умения чередуют поле (чётные — трава, нечётные — брусчатка); --both снимает на обоих (вдвое дольше), --field фиксирует одно.
 * --zoom — масштаб камеры (2 или 3, как колесо в игре). Ауры-орбиты (руны) снимаются серией: вход, оборот, выход; при нескольких значениях
 *   (--zoom=2,3) оборот снимается при каждом по очереди, масштаб меняется посреди оборота, как колесом: <умение>-z<N>-sw1..2 — первые кадры после смены.
 * --variants — сравнение листов для умения из --only: каждая пара «снаряд:удар» (id из манифеста, снаряд можно опустить) летит к цели,
 *   удар снимается серией из 5 кадров (<умение>-v<n>-<id удара>-h1..h5).
 * Выход — tools/out/vfx-shots/: <умение>-<фаза>.png (кроп 400×300 вокруг героя и цели, 1 пиксель кадра = 1 пиксель экрана, камера ×2),
 * sheet.png (все кадры с подписями, вдвое меньше) и manifest.json. Путь к Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { PNG } from "pngjs";
import { createServer } from "vite";
import { Bot, ensureChar, PORT, sleep, startServer, stopServer } from "./harness";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, T, walkable, type WorldMap } from "../shared/map";
import { SKILLS } from "../shared/skills";
import type { ClassId } from "../shared/classes";
import { PC } from "../tools/gen/canvas";
import { BG, BEIGE, drawText, fill, readPng } from "../tools/gen/vendor-lib";
import { peakIndex, sliceSheet } from "../tools/gen/vfx-lib";

type Phase = "cast" | "proj" | "hit" | "aura" | "end" | "series" | "run" | "banner";
const argv = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3).split(",").filter(Boolean) ?? [];
const ONLY = argv("only");
const PHASES = new Set<string>(argv("phase"));
const FIELD = argv("field")[0] as "grass" | "cobble" | undefined;
const BOTH = process.argv.includes("--both");
const ZOOMS = argv("zoom").map(Number).filter((z) => z > 0);
const ZOOM = ZOOMS[0] || 0;
const VARIANTS = argv("variants").map((v) => { const [a, b] = v.includes(":") ? v.split(":") : ["", v]; return { proj: a || undefined, hit: b }; });
const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5199;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/vfx-shots");
const PASS = "secret";
const CROP = { w: 400, h: 300 };
/** Текущий размер кропа: большие площадные эффекты (сотрясение, радиус 130) снимаются шире. */
let crop = { ...CROP };
/** Шаг ручного времени, мс: меньше — точнее пик, но дольше (каждый шаг — отрисовка кадра на программном GL). */
const STEP = 40;

/** Умения для проверки: просьба координатора плюс по одному на класс (порядок — как в списке). */
const SKILL_LIST = [
  "fireball", "meteor", "blink", "mg_bolt", "mg_storm", "mg_barrier", "mg_firewall",
  "shieldblock", "tp_divine", "tp_banner",
  "heal", "cl_radiance", "holyshield",
  "as_smoke", "backstab", "shadowstep",
  "hr_trap", "rain",
  "wl_doom", "wl_demon",
  "dr_veil", "dr_raven",
  "bw_crimson_pool", "bw_blood_bolt",
  "rv_frenzy", "rv_lacerate",
  "dk_death_grip", "dk_bone_armor",
];
/** Умения-цепи: вместо снаряда и круга шлём fx chain между героем и целью. */
const CHAINS = new Set(["mg_bolt", "dk_death_grip", "wl_siphon"]);
/** Зоны на земле: aura рисуется по hazard (лужа крови — по tele). */
const ZONES = new Set(["tp_banner", "as_smoke", "wl_doom", "dr_veil", "mg_firewall", "bw_crimson_pool"]);

const table = JSON.parse(fs.readFileSync(path.resolve("data/skill-fx.json"), "utf8")) as Record<string, Partial<Record<"cast" | "proj" | "hit" | "aura", string>>>;
const catalog = JSON.parse(fs.readFileSync(path.resolve("client/public/assets/vfx/manifest.json"), "utf8")) as Record<string, { frameW: number; frameH: number; frames: number; fps: number; r?: 1 }>;

/** Время пика листа, мс (кадр с наибольшей площадью / fps); цикл — 900. */
function peakMs(id: string | undefined, loop = false): number {
  const e = id ? catalog[id] : undefined;
  if (!e || loop) return 900;
  const file = path.resolve("client/public/assets/vfx", e.r ? "r" : "", `${id}.png`);
  if (!fs.existsSync(file)) return 400;
  const fr = sliceSheet(readPng(file), e.frameW, e.frameH);
  return Math.max(80, Math.round(((peakIndex(fr) + 0.6) / e.fps) * 1000));
}

// ---------- мир: места на траве и брусчатке ----------
const map: WorldMap = generateMap(MAP_SEED);
const vt = (x: number, y: number) => map.vtx[y * (map.w + 1) + x];
const solid = (tx: number, ty: number, type: T, rx = 4, ry = 3) => { for (let y = ty - ry; y <= ty + ry; y++) for (let x = tx - rx; x <= tx + rx; x++) if (vt(x, y) !== type) return false; return true; };
function findSpot(type: T, near: { x: number; y: number }) {
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let ty = 6; ty < map.h - 6; ty++) for (let tx = 6; tx < map.w - 6; tx++) {
    if (!solid(tx, ty, type)) continue;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2, d = Math.hypot(x - near.x, y - near.y);
    if (d < bd && walkable(map, x, y, 60) && (type !== T.Grass || map.spawns.every((sp) => Math.hypot(sp.x - x, sp.y - y) > 480))) { bd = d; best = { x, y }; }
  }
  if (!best) throw new Error(`нет ровного места поверхности ${T[type]}`);
  return best;
}
const grass = findSpot(T.Grass, map.playerSpawn), cobble = findSpot(T.Cobble, map.playerSpawn);

// ---------- страница ----------
let page: Page;
const errors: string[] = [];
const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), net = window.__net, a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;
const dbg = (m: Record<string, unknown>) => run("net.send('dbg', a)", m);
const waitFn = (expr: string, timeout = 8000) => page.waitForFunction(expr, { timeout: timeout * 2.5, polling: 250 });
const errText = (e: unknown) => String((e as Error)?.message ?? e).split("\n")[0].slice(0, 300);

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

/** Вход героем класса: аккаунт и герой через API, токен в sessionStorage, выбор героя и «Играть». */
async function enterAs(cls: ClassId) {
  const name = `vfx_${cls}`;
  const token = await ensureChar(name, PASS, name, cls, 0);
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t, z) => { sessionStorage.setItem("emberfall-token", t); if (z) localStorage.setItem("zoom:v1", String(z)); else localStorage.removeItem("zoom:v1"); }, token, ZOOM);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await waitFn("document.getElementById('charsel').hidden", 20000);
  await waitFn("window.__game && window.__game.scene.isActive('game')", 20000);
  await waitFn("window.__net && window.__net.self && window.__net.online", 15000);
  await sleep(1200);
  // ручное время: шаг сцены на ms миллисекунд маленькими шагами (цикл Phaser при этом спит); часы твинов (Date.now в TweenManager.getDelta)
  // сдвигаются так, что твины тоже идут ровно на шаг: иначе растворения и полёты идут по реальному времени и снимок ловит не тот момент
  await run(`window.__vt = performance.now(); window.__adv = (ms) => { const g = window.__game, tw = g.scene.getScene('game').tweens; const n = Math.max(1, Math.round(ms / ${STEP})); for (let i = 0; i < n; i++) { const now = Date.now(); tw.startTime += now - tw.prevTime - ${STEP}; tw.prevTime = now - ${STEP}; window.__vt += ${STEP}; g.loop.delta = ${STEP}; g.step(window.__vt, ${STEP}); } };`);
}

const freeze = () => run("const l = window.__game.loop; if (l.running) l.sleep(); window.__vt = performance.now();");
const thaw = () => run("const l = window.__game.loop; if (!l.running) l.wake(true);");
const adv = (ms: number) => run("window.__adv(a)", ms);

async function place(field: "grass" | "cobble", bot: Bot): Promise<{ hero: string; target: string }> {
  const spot = field === "grass" ? grass : cobble;
  await thaw();
  await dbg({ op: "god" });
  // телепорт проверяем по клиенту: герой должен оказаться на месте, а «Спутница» рядом справа (иначе повтор)
  for (let i = 0; i < 4; i++) {
    await dbg({ op: "tp", x: spot.x, y: spot.y });
    bot.send("dbg", { op: "tp", x: spot.x + 80, y: spot.y });
    await sleep(1800);
    const ok = await run<boolean>(`const me = sc.units.get(net.id), b = sc.units.get(a.bot); return !!me && !!b && Math.hypot(me.u.x - a.x, me.u.y - a.y) < 40 && Math.hypot(b.u.x - a.x - 80, b.u.y - a.y) < 60;`, { x: spot.x, y: spot.y, bot: bot.id });
    if (ok) break;
    if (i === 3) throw new Error(`герой или спутница не встали на место (${field})`);
  }
  await dbg({ op: "god" });
  await run("sc.cameras.main.stopFollow(); const me = sc.units.get(net.id); sc.cameras.main.centerOn(me.x + 40, me.y - 10);");
  return { hero: await run<string>("return net.id"), target: bot.id };
}

// ---------- снимки ----------
interface Shot { skill: string; phase: Phase; file: string; field: string }
const shots: Shot[] = [];
const failed: string[] = [];

/** Кадр мира: сначала шагаем время на wait мс, затем в том же вызове читаем canvas (WebGL до показа кадра хранит буфер) — HUD и окна в кадр не попадают. */
async function snap(skill: string, phase: Phase | string, field: string, ids: { hero: string; target: string }, wait = 0, name?: string) {
  if (PHASES.size && !PHASES.has(String(phase).replace(/\d+$/, "")) && !PHASES.has(String(phase))) { if (wait) await adv(wait); return; }
  const c = await run<{ url: string; cx: number; cy: number; w: number; h: number }>(`
    const u = sc.units.get(a.hero), t = sc.units.get(a.target) || u, cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    cam.stopFollow(); cam.centerOn((u.x + t.x) / 2, (u.y + t.y) / 2 - 12);
    window.__adv(a.wait || ${STEP});
    const k = cv.width / g.scale.width;
    return { url: cv.toDataURL('image/png'), cx: (((u.x + t.x) / 2) - cam.worldView.x) * cam.zoom * k, cy: (((u.y + t.y) / 2 - 12) - cam.worldView.y) * cam.zoom * k, w: cv.width, h: cv.height };`, { ...ids, wait });
  const src = PNG.sync.read(Buffer.from(c.url.split(",")[1], "base64"));
  const w = Math.min(crop.w, src.width), h = Math.min(crop.h, src.height);
  const x0 = Math.max(0, Math.min(src.width - w, Math.round(c.cx - w / 2))), y0 = Math.max(0, Math.min(src.height - h, Math.round(c.cy - h / 2)));
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, x0, y0, w, h, 0, 0);
  const file = `${name ?? `${skill}-${phase}`}${BOTH ? "-" + field : ""}.png`;
  fs.writeFileSync(path.join(OUT, file), PNG.sync.write(out));
  shots.push({ skill, phase: phase as Phase, file, field });
  // VFX_DEBUG=1: состояние спрайтов эффектов на момент кадра (альфа, масштаб, позиция, анимация, кадр)
  if (process.env.VFX_DEBUG) console.log(`    ${file}`, JSON.stringify(await run("return sc.children.list.filter((o) => o.texture && o.texture.key.startsWith('vfx_') && o.active).map((o) => ({ k: o.texture.key.slice(4), a: +o.alpha.toFixed(2), s: +o.scale.toFixed(2), x: Math.round(o.x), y: Math.round(o.y), anim: o.anims && o.anims.currentAnim && o.anims.currentAnim.key.slice(4), f: o.frame && o.frame.name }))")));
}

const fxArr = (list: unknown[]) => run("sc.fx.play(a)", list);

/** Рывки и мерцания: портал и подобные эффекты снимаются серией по времени (открытие, удержание, закрытие). */
const BLINKS = new Set(["blink", "shadowstep"]);
const SERIES_T = [150, 270, 380, 400, 350, 450];
/** Умения со щитом на герое: серия кадров бега с щитом, смещение щита относительно героя обязано быть одним и тем же. */
const RUN_SHIELD = new Set(["shieldblock", "mg_barrier"]);
/** Ауры-орбиты (позиции считает клиент каждый кадр): вход 3 кадра, оборот 8 кадров через 1/16 периода, выход 3 кадра. */
const ORBITS = new Set(["dk_rune_blade"]);
/** Удар после снаряда: серия из 5 кадров (замах, падение, удар, разлёт, затухание), мс от прилёта (кадр листа при 14 fps — 71 мс). */
const HIT_SERIES = [160, 240, 320, 400, 560];
const follow: Record<string, { dx: number; dy: number }[] | null> = {};

/** Все фазы одного умения: каждая — запуск синтетического fx, ручное время до пика, снимок. */
async function shootSkill(skill: string, field: "grass" | "cobble", ids: { hero: string; target: string }) {
  const slots = table[skill];
  if (!slots) throw new Error(`умения ${skill} нет в data/skill-fx.json`);
  const def = SKILLS[skill];
  const mark = { s: skill, c: ids.hero };
  const pos = await run<{ hx: number; hy: number; tx: number; ty: number }>("const u = sc.units.get(a.hero), t = sc.units.get(a.target); return { hx: u.x, hy: u.y, tx: t.x, ty: t.y };", ids);
  const tp = { x: pos.tx, y: pos.ty };
  const self = def.target === "self" || def.target === "point";
  await freeze();
  await adv(1800); // дать доиграть следам прошлого умения
  if (skill === "tp_banner") {
    // штандарт: для каждой фракции кастера — установка (3 кадра падения и удара) и 6 кадров ветра
    for (const fac of ["solgard", "umbrath"]) {
      await thaw();
      await dbg({ op: "gear", slots: {}, faction: fac });
      await sleep(1000);
      await freeze();
      await adv(1200);
      const haz = (ms: number) => ({ t: "hazard", id: `h_banner_${fac}`, k: "holy", x: pos.hx + 45, y: pos.hy, r: 130, ms, ...mark });
      await fxArr([haz(6000)]);
      for (const [i, w] of [90, 130, 200].entries()) await snap(skill, "banner", field, ids, w, `${skill}-${fac}-i${i + 1}`);
      await adv(500);
      for (let i = 0; i < 6; i++) await snap(skill, "banner", field, ids, 110, `${skill}-${fac}-w${i + 1}`);
      await fxArr([haz(0)]);
      await snap(skill, "banner", field, ids, 150, `${skill}-${fac}-end`);
      await adv(900);
    }
    await thaw();
    return;
  }
  if (skill === "quake") {
    // сотрясение: самоцель, круг вокруг кастера; 4 кадра по ходу удара (вспышка, волна, шипы, оседание)
    crop = { w: 760, h: 540 };
    await fxArr([{ t: "aoe", k: "quake", x: pos.hx, y: pos.hy, r: 130, ...mark }]);
    for (const [i, w] of [200, 280, 360, 520].entries()) await snap(skill, "series", field, ids, w, `${skill}-s${i + 1}`);
    crop = { ...CROP };
    await adv(1500);
    await thaw();
    return;
  }
  if (BLINKS.has(skill)) {
    // герой остаётся, портал открывается у него и в точке перехода справа
    await fxArr([{ t: "blink", id: ids.hero, x0: pos.hx, y0: pos.hy, x1: pos.hx + 90, y1: pos.hy - 20, k: "arcane", ...mark }]);
    for (let i = 0; i < SERIES_T.length; i++) {
      await snap(skill, "series", field, ids, SERIES_T[i], `${skill}-s${i + 1}`);
    }
    await adv(1500);
    await thaw();
    return;
  }
  if (VARIANTS.length) {
    for (const [n, v] of VARIANTS.entries()) {
      const tag = `${skill}-v${n + 1}-${v.hit}`;
      if (v.proj) {
        // полёт — твин (его часы идут шагами __adv): ждём середину пути и попадание по состоянию
        await run("window.__arrived = false; sc.fx.vfx.projectile(a.p, a.hx, a.hy - 12, a.tx, a.ty - 12, 700, () => { window.__arrived = true; sc.fx.vfx.atBody(a.h, a.tx, a.ty - 12); });", { p: v.proj, h: v.hit, ...pos });
        await run(`let i = 0; while (i++ < 300) { const o = sc.children.list.find((q) => q.active && q.texture && q.texture.key === a.tex); if (!o || o.x >= a.mx) break; window.__adv(${STEP}); }`, { tex: `vfx_${v.proj}`, mx: (pos.hx + pos.tx) / 2 });
        await snap(skill, "proj", field, ids, 0, `${tag}-p`);
        await run(`let i = 0; while (!window.__arrived && i++ < 400) window.__adv(${STEP});`);
      } else await run("sc.fx.vfx.atBody(a.h, a.tx, a.ty - 12)", { h: v.hit, ...pos });
      let prev = 0;
      for (const [i, t] of HIT_SERIES.entries()) { await snap(skill, "hit", field, ids, t - prev, `${tag}-h${i + 1}`); prev = t; }
      await adv(1600);
    }
    await thaw();
    return;
  }
  // cast
  if (slots.cast) {
    await fxArr([{ t: "pose", id: ids.hero, k: "idle", ms: 1, ...mark }, ...(def.target === "point" ? [{ t: "tele", shape: "ring", k: "phys", x: tp.x, y: tp.y, r: 20, ms: 100, ...mark }] : [])]);
    await snap(skill, "cast", field, ids, peakMs(slots.cast));
    await adv(1800);
  }
  // proj и hit
  if (CHAINS.has(skill)) {
    await fxArr([{ t: "chain", pts: [pos.hx, pos.hy - 12, tp.x, tp.y - 12], k: "shadow", ...mark }]);
    if (slots.proj) await snap(skill, "proj", field, ids, 250);
    if (slots.hit) await snap(skill, "hit", field, ids, peakMs(slots.hit));
  } else if (slots.proj) {
    const ms = 900;
    await fxArr([{ t: "proj", k: "shadow", from: ids.hero, to: ids.target, tx: tp.x, ty: tp.y, ms, ...mark }]);
    // ручное время идёт медленнее часов твинов, поэтому ждём по состоянию: снаряд на полпути, затем снаряд ушёл (попал)
    const tex = `vfx_${slots.proj}`;
    await run(`let i = 0; while (i++ < 60) { const o = sc.children.list.find((q) => q.active && q.texture && q.texture.key === a.tex); if (!o || o.x >= a.mx) break; window.__adv(${STEP}); }`, { tex, mx: (pos.hx + tp.x) / 2 });
    await snap(skill, "proj", field, ids, 0);
    await run(`let i = 0; while (i++ < 80) { const o = sc.children.list.find((q) => q.active && q.texture && q.texture.key === a.tex); if (!o) break; window.__adv(${STEP}); }`, { tex });
    if (slots.hit) await snap(skill, "hit", field, ids, peakMs(slots.hit));
  } else if (slots.hit) {
    await fxArr([{ t: "aoe", k: "phys", x: tp.x, y: tp.y, r: 60, ...mark }]);
    await snap(skill, "hit", field, ids, peakMs(slots.hit));
  }
  await adv(1800);
  // aura: зона на земле (hazard/tele) или баф на герое; потом снятие
  if (slots.aura) {
    if (ZONES.has(skill)) {
      const at = self && def.target !== "point" ? { x: pos.hx, y: pos.hy } : tp;
      await fxArr([skill === "bw_crimson_pool" ? { t: "tele", shape: "circle", k: "fire", x: at.x, y: at.y, r: 70, ms: 2400, ...mark } : { t: "hazard", id: `h_${skill}`, k: "poison", x: at.x, y: at.y, r: 70, ms: 2400, ...mark }]);
      await snap(skill, "aura", field, ids, 900);
      await adv(2000);
    } else {
      if (ORBITS.has(skill) && ZOOMS.length) await run("sc.cameras.main.setZoom(a)", ZOOMS[0]);
      await fxArr([{ t: "buff", id: ids.hero, k: "shield", ms: ORBITS.has(skill) ? 4000 + 2000 * Math.max(0, ZOOMS.length - 1) : 4000, ...mark }]);
      if (ORBITS.has(skill)) {
        const zs = ZOOMS.length ? ZOOMS : [0], tag = (z: number) => (zs.length > 1 ? `-z${z}` : "");
        for (const [i, w] of [80, 120, 200].entries()) await snap(skill, "aura", field, ids, w, `${skill}${tag(zs[0])}-in${i + 1}`);
        for (const [j, z] of zs.entries()) {
          // смена масштаба посреди оборота, как колесом: орбита сама берёт лист под новый зум; два кадра сразу после смены
          if (j > 0) {
            await run("sc.cameras.main.setZoom(a)", z);
            for (let i = 0; i < 2; i++) await snap(skill, "aura", field, ids, STEP, `${skill}${tag(z)}-sw${i + 1}`);
          }
          for (let i = 0; i < 8; i++) await snap(skill, "aura", field, ids, 175, `${skill}${tag(z)}-o${i + 1}`);
        }
        await fxArr([{ t: "buff", id: ids.hero, k: "shield", ms: 0, ...mark }]);
        for (const [i, w] of [120, 120, 160].entries()) await snap(skill, "end", field, ids, w, `${skill}-out${i + 1}`);
        await thaw();
        return;
      }
      await snap(skill, "aura", field, ids, 900);
      if (RUN_SHIELD.has(skill)) await runSeries(skill, slots.aura, field, ids);
      await fxArr([{ t: "buff", id: ids.hero, k: "shield", ms: 0, ...mark }]);
      await snap(skill, "end", field, ids, 150);
      await snap(skill, "end", field, ids, 200, `${skill}-end2`);
    }
  }
  await thaw();
}

/** Бег с щитом: клавиша движения зажата, 4 снимка через 40 мс; смещение спрайта щита от спрайта героя измеряется на каждом шаге. */
async function runSeries(skill: string, aura: string, field: string, ids: { hero: string; target: string }) {
  const probe = () => run<{ dx: number; dy: number } | null>(`
    const u = sc.units.get(a.hero), key = 'vfx_' + a.aura;
    const spr = sc.children.list.find((o) => o.texture && o.texture.key === key && o.visible && o.active);
    return spr && u ? { dx: spr.x - Math.round(u.x), dy: spr.y - Math.round(u.y), hx: u.x } : null;`, { ...ids, aura });
  const offs: { dx: number; dy: number; hx?: number }[] = [];
  await page.keyboard.down("d");
  try {
    await adv(120);
    for (let i = 0; i < 4; i++) {
      await run("sc.pos.x += 30; sc.pos.y += 4"); // шаг героя вправо на каждом кадре (клиентская позиция, к ней UnitView идёт без сети)
      await snap(skill, "run", field, ids, STEP, `${skill}-run${i + 1}`);
      const o = await probe();
      if (o) offs.push(o);
    }
  } finally {
    await page.keyboard.up("d");
  }
  follow[skill] = offs;
  const same = offs.length >= 2 && offs.every((o) => o.dx === offs[0].dx && o.dy === offs[0].dy);
  const hxs = offs.map((o) => o.hx ?? 0), moved = hxs.length ? Math.round(Math.max(...hxs) - Math.min(...hxs)) : 0;
  console.log(`  ${same && moved > 4 ? "ok  " : "FAIL"} щит ${skill} при беге: смещения ${offs.map((o) => `${o.dx},${o.dy}`).join(" ")}; герой прошёл ${moved} px`);
  if (!same || moved <= 4) failed.push(`${skill}:follow`);
}

// ---------- сводный лист ----------
function buildSheet() {
  const cols = 6, cw = CROP.w / 2, ch = CROP.h / 2, lab = 9;
  const rows = Math.ceil(shots.length / cols);
  const sheet = new PC(cols * (cw + 2) + 2, rows * (ch + lab + 2) + 2);
  fill(sheet, BG);
  shots.forEach((s, i) => {
    const img = readPng(path.join(OUT, s.file));
    const x0 = 2 + (i % cols) * (cw + 2), y0 = 2 + Math.floor(i / cols) * (ch + lab + 2);
    // уменьшение вдвое усреднением 2×2
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      let r = 0, g = 0, b = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const p = img.get(x * 2 + dx, y * 2 + dy) ?? [0, 0, 0, 255]; r += p[0]; g += p[1]; b += p[2]; }
      sheet.set(x0 + x, y0 + lab + y, [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4), 255]);
    }
    drawText(sheet, `${s.skill} ${s.phase}${s.field === "cobble" ? " C" : ""}`.slice(0, 48), x0 + 1, y0 + 2, BEIGE);
  });
  sheet.save(path.join(OUT, "sheet.png"));
}

async function main() {
  const list = (ONLY.length ? ONLY : SKILL_LIST).filter((s) => {
    if (!table[s] || !SKILLS[s]) { console.log(`  пропуск: нет умения ${s}`); return false; }
    return true;
  });
  const byClass = new Map<ClassId, string[]>();
  for (const s of list) { const c = SKILLS[s].cls; byClass.set(c, [...(byClass.get(c) ?? []), s]); }
  console.log(`Анимации умений: ${list.length} умений, ${byClass.size} классов → ${path.relative(process.cwd(), OUT)}`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  let bot: Bot | null = null;
  const t0 = Date.now();
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    // всегда день: часы страницы сдвинуты к середине светлой части цикла (shared/daynight, 20 мин), иначе снимки зависят от времени суток;
    // сдвиг постоянный — дельты времени (твины) не меняются
    await page.evaluateOnNewDocument(() => { const C = 20 * 60 * 1000, real = Date.now.bind(Date), p = (real() % C) / C, off = ((1.3 - p) % 1) * C; Date.now = () => real() + off; });
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    bot = await Bot.join("Спутница", PASS, "mage");
    let n = 0;
    for (const [cls, skills] of byClass) {
      console.log(`\n== ${cls}: ${skills.join(", ")}`);
      try {
        await enterAs(cls);
      } catch (e) {
        console.log(`  !! вход ${cls}: ${errText(e)}`);
        failed.push(...skills);
        continue;
      }
      if (process.env.VFX_PROBE) {
        await freeze();
        console.log("  зонд времени:", JSON.stringify(await run(`const o = { v: 0 }; sc.tweens.add({ targets: o, v: 1, duration: 400, ease: 'Linear' }); const t0 = sc.time.now; window.__adv(200); const a1 = o.v; window.__adv(200); const a2 = o.v; window.__adv(400); return { a1, a2, a3: o.v, clock: sc.time.now - t0, loopDelta: window.__game.loop.delta };`)));
        await thaw();
      }
      const placed: Partial<Record<"grass" | "cobble", { hero: string; target: string }>> = {};
      for (const skill of skills) {
        const fields: ("grass" | "cobble")[] = FIELD ? [FIELD] : BOTH ? ["grass", "cobble"] : [n % 2 === 0 ? "grass" : "cobble"];
        n++;
        for (const field of fields) {
          const t = Date.now();
          try {
            placed[field] ??= await place(field, bot!);
            try {
              await shootSkill(skill, field, placed[field]!);
            } catch (e1) {
              console.log(`  повтор ${skill}: ${errText(e1)}`);
              await thaw().catch(() => {});
              placed[field] = await place(field, bot!);
              await shootSkill(skill, field, placed[field]!);
            }
            console.log(`  ok   ${skill} (${field}, ${Date.now() - t} мс)`);
          } catch (e) {
            failed.push(skill);
            console.log(`  FAIL ${skill} (${field}): ${errText(e)}`);
            try { await page.screenshot({ path: path.join(OUT, `_fail-${skill}.png`) }); } catch {}
            await thaw().catch(() => {});
            delete placed[field];
          }
        }
      }
    }
  } finally {
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ shots, failed, follow, errors: errors.slice(0, 30) }, null, 1));
    if (shots.length) buildSheet();
    try { await bot?.leave(); } catch {}
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer();
  }
  console.log(`\nКадров: ${shots.length}, сбоев: ${failed.length}${errors.length ? `, ошибок консоли: ${errors.length} (первые в manifest.json)` : ""}, ${Math.round((Date.now() - t0) / 1000)} с → ${path.relative(process.cwd(), OUT)}/sheet.png`);
}

main().catch(async (e) => {
  console.error(e);
  await stopServer();
  process.exit(1);
});
