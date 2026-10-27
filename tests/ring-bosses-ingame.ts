/**
 * Боссы кольца 40–80 в настоящем браузере (задача 139): сервер в этом же процессе, Vite и Chrome без окна, зум 2.
 * Пилот — Ведрас Неугасимый (umb_crown_lich, слот r75n восток). Сценарий боя: двое героев на арене (бессмертные, держатся
 * на местах), снимок покоя; каждое умение — посреди замаха и сразу после удара (метки, эффекты мира); «Зов Мёртвой Короны» —
 * не сорван (полоса каста над экраном, столбы душ) и сорван (оглушение, звёзды над короной); переход фазы на 50 %; живой бой
 * ~20 с с умениями по откатам; гибель (груда, череп и корона) и мешок добычи у героя. Проверяется: лист 80×80 из каталога
 * /assets/zone-bosses/manifest.json, событие zb запускает связку, полоса каста видна, ошибок консоли нет.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir; порты свободные):
 *   $env:TEST_PORT="2871"; $env:VITE_TEST_PORT="5271"; npx tsx tests/ring-bosses-ingame.ts [--boss=umb_ash_executioner]
 * Выход — tools/out/bosses139/<префикс>ingame-*.png и …ingame-report.json (лич — без префикса, палач — exec-). Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { Bot, dbFile, ensureChar, PORT, sleep } from "./harness";
import ring from "../data/ring-bosses.json";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";
import type { Mob } from "../server/src/game/Mob";
import type { ZbCard } from "../shared/zoneBosses";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5271;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/bosses139");
const PASS = "secret";
const BOSS = process.argv.find((a) => a.startsWith("--boss="))?.slice(7) ?? "umb_crown_lich";
const CARD = (ring.bosses as unknown as ZbCard[]).find((c) => c.id === BOSS)!;
const FR = CARD.frame ?? 64;
/** Префикс снимков: лич — как раньше, остальные — по короткому имени. */
const PFX = BOSS === "umb_crown_lich" ? "" : BOSS === "umb_ash_executioner" ? "exec-" : BOSS === "sol_mirage_sorcerer" ? "mir-" : `${BOSS}-`;

let page: Page;
const errors: string[] = [];
const allLog: string[] = [];
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

async function enter(name: string, token: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v2", "2"); }, token);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 180000, polling: 250 });
  try {
    await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 90000, polling: 250 });
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `${PFX}ingame-fail-enter.png`) });
    const st = await page.evaluate(() => ({ text: document.body.innerText.slice(0, 400), scenes: (window as any).__game ? (window as any).__game.scene.scenes.map((s: any) => `${s.sys.settings.key}:${s.sys.settings.status}`) : null }));
    lines.push(`вход: ${JSON.stringify(st)}`, ...allLog.slice(-40));
    throw e;
  }
  await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 120000, polling: 250 });
  await sleep(1500);
}

/** Кадр мира w×h px вокруг (cx, cy) из холста (камера стоит на точке, игра идёт вживую). */
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

type BossCtl = { abilities: { at: number }[]; run: (ab: unknown) => void };
function hold(p: Player, x: number, y: number) { p.unit.x = x; p.unit.y = y; p.moveTo = null; p.unit.maxHp = p.unit.hp = 999999; p.dead = false; }
const colOf = (name: string) => run<{ col: number; anim: string } | null>(
  "const m = sc.cache.json.get('zbm').bosses[a]; for (const v of sc.units.values()) if (v.u.sprite === a) { const f = Number(v.sprite.frame.name), w = m.wrap || m.cols, per = Math.ceil(m.cols / w), col = (Math.floor(f / w) % per) * w + (f % w); const anim = Object.keys(m.anims).find((k) => col >= m.anims[k].col && col < m.anims[k].col + m.anims[k].n) || ''; return { col, anim }; } return null", name);

async function scenario() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(`${PFX}ingame-`)) fs.rmSync(path.join(OUT, f));
  const token = await ensureChar("rb_view", PASS, "Эйра", "warrior");
  const bot = await Bot.enter(await ensureChar("rb_far", PASS, "Торвин", "ranger"), "Торвин");
  await enter("Эйра", token);
  const H = heroOf("Эйра"), F = heroOf("Торвин");
  void bot;
  H.save.level = F.save.level = CARD.levels.boss;
  const ok0 = await run<boolean>("const m = sc.cache.json.get('zbm'); return !!(m && m.bosses && m.bosses[a.id] && m.bosses[a.id].fw === a.fr)", { id: CARD.id, fr: FR });
  check(ok0, `${CARD.id}: в каталоге боссов, кадр ${FR}`);
  const mob = [...W().mobs.values()].find((m) => m.def.id === CARD.id) as Mob;
  check(!!mob, `${CARD.id}: стоит на карте (${mob ? `${Math.round(mob.home.x / 32)}, ${Math.round(mob.home.y / 32)}` : "нет"})`);
  if (!mob) return;
  const boss = mob.boss as unknown as BossCtl;
  mob.reset();
  for (const a of boss.abilities) a.at = 1e9;
  const bx = mob.home.x, by = mob.home.y;
  const keep = setInterval(() => { hold(H, bx + 72, by + 26); hold(F, bx - 150, by + 96); }, 50);
  hold(H, bx + 72, by + 26); hold(F, bx - 150, by + 96);
  await run("sc.cameras.main.stopFollow(); sc.cameras.main.centerOn(a.x, a.y);", { x: bx, y: by });
  await sleep(3000);
  const tex = await run<{ frame: number } | null>("for (const v of sc.units.values()) if (v.u.sprite === a) return { frame: v.sprite.frame.width }; return null", CARD.id);
  check(!!tex && tex.frame === FR, `${CARD.id}: лист в игре, кадр ${tex?.frame}`);
  save(`${PFX}ingame-idle.png`, await snap(bx, by - 20, 440, 300));
  mob.state = "chase"; mob.targetId = H.id; mob.addThreat(H.id, 1000);
  await sleep(500);

  // умения: замах и удар
  for (const ab of CARD.abilities) {
    for (const a of boss.abilities) a.at = 1e9;
    mob.unit.hp = mob.unit.maxHp;
    boss.run(ab);
    const t0 = Date.now();
    const total = [ab, ...(ab.then ?? [])].reduce((s, wv) => s + wv.windupMs, 0);
    await sleep(Math.round(ab.windupMs * 0.6));
    const fr = await colOf(CARD.id);
    const chain = await run<string[]>("const s = sc.cache.json.get('zbm').bosses[a.id].skills[a.ab]; return s ? s.waves.flatMap((w) => [...(w.pre || []), w.strike]) : []", { id: CARD.id, ab: ab.id });
    check(!!fr && chain.includes(fr.anim), `${CARD.id}.${ab.id}: кадр из связки умения (${fr?.anim})`);
    const hasFx = await run<boolean>("const s = sc.cache.json.get('zbm').bosses[a.id].skills[a.ab]; return !!(s && s.fx.length)", { id: CARD.id, ab: ab.id });
    if (ab.break) {
      const vis = await run<boolean>("const el = document.querySelector('.zb-cast .cb'); return !!el && !el.hidden");
      check(vis, `${CARD.id}.${ab.id}: полоса каста видна`);
      await page.screenshot({ path: path.join(OUT, `${PFX}ingame-call-castbar.png`) });
    }
    // замах: снимок только у долгих замахов — часы сцены после паузы догоняют настоящее время, короткий удар успел бы пройти
    if (ab.windupMs >= 1500 && !(hasFx && ab.windupMs < 3000)) {
      await run("sc.scene.pause();");
      save(`${PFX}ingame-${ab.id}-wind.png`, await snap(bx, by - 10, 480, 340));
      await run("sc.scene.resume();");
    }
    // удар: эффект мира идёт ~1,2 с от конца предупреждения — снимок через 250 мс после него (снимок замаха под SwiftShader долгий)
    // удар: ждём, пока эффект мира станет виден, ставим сцену на паузу (кадр замирает) — снимок под SwiftShader долгий
    let vis = 0;
    if (!hasFx) { await sleep(Math.max(0, ab.windupMs + 250 - (Date.now() - t0))); vis = -1; }
    for (let k = 0; k < 80 && !vis; k++) {
      vis = await run<number>("const z = sc.fx && sc.fx.zb; if (!z) return 0; const n = z.fxs.filter((e) => e.boss === a && e.spr.some((s) => s.visible)).length; if (n) sc.scene.pause(); return n;", CARD.id);
      if (!vis) await sleep(40);
    }
    const dbg = vis !== 0 ? "" : await run<string>("const z = sc.fx && sc.fx.zb; if (!z) return 'нет zb'; const mine = z.fxs.filter((e) => e.boss === a); const now = sc.time.now; const fx = sc.cache.json.get('zbm').bosses[a].fx; return 'fx ' + z.fxs.length + ', свои ' + mine.length + ', текстуры ' + Object.keys(fx).map((k) => k + ':' + sc.textures.exists('zbfx_' + a + '_' + k)).join('/') + ', сегменты ' + mine.slice(0, 2).map((e) => e.segs.map((g) => g.a + ' ' + Math.round(g.t0 - now) + '..' + Math.round(g.t1 - now)).join(';') + ' спр ' + e.spr.length).join(' | ');", CARD.id);
    if (vis >= 0) check(vis > 0, `${CARD.id}.${ab.id}: эффект мира виден (${vis}) ${dbg}`);
    save(`${PFX}ingame-${ab.id}-hit.png`, await snap(bx, by - 10, 480, 340));
    await run("sc.scene.resume();");
    await sleep(Math.max(0, total - ab.windupMs) + 1600);
    mob.unit.x = mob.home.x; mob.unit.y = mob.home.y;
  }

  // клетки: кол стоит — клетка видна и босс под щитом; кол сломан — клетка распадается
  const cageAb = CARD.abilities.find((a) => a.cage);
  if (cageAb) {
    for (const a of boss.abilities) a.at = 1e9;
    mob.unit.hp = mob.unit.maxHp;
    boss.run(cageAb);
    await sleep(cageAb.windupMs + 900);
    const stake = [...W().mobs.values()].find((m) => m.def.id === `${CARD.id}_cage` && !m.dead) as Mob | undefined;
    check(!!stake && mob.dmgTakenMul === cageAb.cage!.shield, `${CARD.id}: кандальный кол стоит, босс под щитом ×${mob.dmgTakenMul}`);
    const stakeTex = await run<boolean>("for (const v of sc.units.values()) if (v.u.sprite === a) return sc.textures.exists('u_' + a); return false", `${CARD.id}_cage`);
    check(stakeTex, `${CARD.id}: кол виден в игре (лист ${CARD.id}_cage)`);
    // (снимок целой клетки — ingame-chain_cages-hit.png; пауза здесь сдвинула бы часы сцены и эффект клетки кончился бы)
    // ломаем все колы (клеток две — щит снимается, когда сломаны все)
    for (const m of [...W().mobs.values()]) if (m.def.id === `${CARD.id}_cage` && !m.dead) W().killMob(m, H);
    await sleep(120);
    const out = await run<string>("const z = sc.fx && sc.fx.zb; return z ? z.fxs.filter((e) => e.boss === a).map((e) => (e.segs[0] ? e.segs[0].a : '-') + '@' + Math.round(e.x) + ',' + Math.round(e.y)).join(' ') : 'нет zb'", CARD.id);
    check(/cageOut/.test(out) && mob.dmgTakenMul === 1, `${CARD.id}: колы сломаны — клетки распадаются, щит снят (×${mob.dmgTakenMul}; эффекты: ${out})`);
    await run("sc.scene.pause();");
    save(`${PFX}ingame-cage-broken.png`, await snap(bx, by + 10, 480, 340));
    await run("sc.scene.resume();");
    await sleep(cageAb.cage!.holdMs);
  }

  // двойники: после замаха стоят по краю арены (лист <босс>_mirage в игре), убитый исчезает
  const dblAb = CARD.abilities.find((a) => a.doubles);
  if (dblAb) {
    for (const a of boss.abilities) a.at = 1e9;
    mob.unit.hp = mob.unit.maxHp;
    boss.run(dblAb);
    await sleep(dblAb.windupMs + 900);
    const ds = [...W().mobs.values()].filter((m) => m.def.id === `${CARD.id}_mirage` && !m.dead) as Mob[];
    check(ds.length === dblAb.doubles!.count, `${CARD.id}: двойников на арене ${ds.length} из ${dblAb.doubles!.count}`);
    const mt = await run<boolean>("return sc.textures.exists('u_' + a)", `${CARD.id}_mirage`);
    const seen = await run<number>("let n = 0; for (const v of sc.units.values()) if (v.u.sprite === a) n++; return n;", `${CARD.id}_mirage`);
    check(mt && seen === ds.length, `${CARD.id}: лист двойника в игре, на экране ${seen}`);
    await run("sc.scene.pause();");
    save(`${PFX}ingame-doubles.png`, await snap(bx, by - 10, 640, 460));
    await run("sc.scene.resume();");
    if (ds[0]) W().killMob(ds[0], H);
    await sleep(900);
    const left = [...W().mobs.values()].filter((m) => m.def.id === `${CARD.id}_mirage` && !m.dead).length;
    check(left === ds.length - 1, `${CARD.id}: убитый двойник исчез (осталось ${left})`);
  }

  // зов сорван: группа сняла 6 % — оглушение
  const brk = CARD.abilities.find((a) => a.break);
  if (brk) {
    const ab = brk;
    for (const a of boss.abilities) a.at = 1e9;
    mob.unit.hp = mob.unit.maxHp;
    boss.run(ab);
    await sleep(1500);
    mob.unit.hp -= Math.ceil(ab.break!.pct * mob.unit.maxHp) + 10;
    await sleep(900);
    const fr = await colOf(CARD.id);
    check(fr?.anim === "stun", `${CARD.id}: зов сорван — оглушение (${fr?.anim})`);
    save(`${PFX}ingame-call-broken-stun.png`, await snap(bx, by - 20, 440, 300));
    await sleep(3000);
  }

  // переход фазы
  {
    for (const a of boss.abilities) a.at = 1e9;
    mob.reset();
    mob.state = "chase"; mob.targetId = H.id; mob.addThreat(H.id, 1000);
    mob.unit.hp = Math.floor(mob.unit.maxHp * 0.49);
    // кадр перехода ловим опросом (связка ~0,8 с, приход события зависит от нагрузки)
    let fr = await colOf(CARD.id);
    for (let k = 0; k < 40 && fr?.anim !== "phase"; k++) { await sleep(60); fr = await colOf(CARD.id); }
    check(fr?.anim === "phase", `${CARD.id}: переход фазы (${fr?.anim})`);
    save(`${PFX}ingame-phase.png`, await snap(bx, by - 20, 440, 300));
    await sleep(2500);
  }

  // живой бой: умения по откатам (сжаты), 4 снимка
  {
    const seen = new Set<string>();
    const t0 = Date.now();
    const off = (W() as unknown as { emit: (f: { t: string; ab?: string }) => void });
    const emit0 = off.emit.bind(W());
    off.emit = (f) => { if (f.t === "zb" && f.ab) seen.add(f.ab); emit0(f); };
    boss.abilities.forEach((a, i) => (a.at = 1 + i * 4));
    for (let k = 0; k < 4; k++) {
      await sleep(4500);
      save(`${PFX}ingame-fight-${k + 1}.png`, await snap(bx, by - 10, 480, 340));
    }
    off.emit = emit0;
    check(seen.size >= 2, `живой бой ${Math.round((Date.now() - t0) / 1000)} с: умения ${[...seen].join(", ")}`);
  }

  // гибель: груда, череп и корона; мешок добычи у героя
  {
    for (const a of boss.abilities) a.at = 1e9;
    await sleep(6000);
    const bags0 = H.bags.size;
    mob.damageBy.set(H.id, 1);
    W().killMob(mob, H);
    await sleep(1400);
    const fr = await colOf(CARD.id);
    check(fr?.anim === "death", `${CARD.id}: гибель (${fr?.anim})`);
    save(`${PFX}ingame-death-mid.png`, await snap(bx, by - 20, 440, 300));
    await sleep(1500);
    save(`${PFX}ingame-death.png`, await snap(bx, by - 20, 440, 300));
    check(H.bags.size === bags0 + 1, `добыча: мешок у героя (${H.bags.size - bags0})`);
  }
  clearInterval(keep);
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
      window.addEventListener("unhandledrejection", (e) => console.error("unhandled: " + String((e as PromiseRejectionEvent).reason?.stack ?? (e as PromiseRejectionEvent).reason)));
      window.addEventListener("error", (e) => console.error("error: " + String((e as ErrorEvent).error?.stack ?? (e as ErrorEvent).message)));
    });
    page.on("console", (m) => { allLog.push(`${m.type()}: ${m.text()}`.slice(0, 300)); if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("requestfailed", (r) => allLog.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    // «AnimationManager key already exists» у боссов стартовых земель — давнее: лист босса и в units/manifest.json, и в каталоге боссов (zbCreate создаёт свои раньше BootScene)
    const warn = errors.filter((e) => !/favicon|DevTools|GPU stall|swiftshader|AudioContext/i.test(e) && !/key already exists: (sol|umb)_/.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    lines.push(`EXC ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
    console.log(lines[lines.length - 1]);
    bad++;
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${PFX}ingame-report.json`), JSON.stringify({ lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nБосс кольца в игре: снимки готовы");
  process.exit(bad ? 1 : 0);
}
main();
