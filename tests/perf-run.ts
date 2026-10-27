/**
 * Замер плавности бега (баг «при беге по экрану бегают полоски, иногда сильно лагает»).
 * Поднимает тестовый сервер и Vite (как tests/ui-audit-screens.ts), входит героем и бежит стрелками по кругу (прямоугольник)
 * по Эмберхоллу (city) и по лесу Meadow/Forest, где больше всего деревьев Basic (forest), затем идёт по лесу кликами ПКМ
 * через несколько кусков мира (trek) и снимает кадры на бегу и стоя (shots).
 *
 * Собирается:
 *   - время кадра по requestAnimationFrame (p50/p95/p99, максимум, пики > 50 мс во времени) и game.loop.actualFps;
 *   - на каждый кадр: время update/render Phaser, перерисовки текстов (updateText), сообщения сервера, ResizeObserver,
 *     MutationObserver, создание кусков мира — чтобы пики можно было объяснить, а не усреднить; у 12 худших кадров —
 *     события trace длиннее 2 мс и функции по выборкам профиля;
 *   - раз в секунду: объекты в списке отрисовки, твины (всего и идущих), юниты, Graphics, текстуры, куча JS, размер холста;
 *   - счётчики: setResolution у текстов, ResizeObserver, MutationObserver, layoutBottom, вызовы отрисовки GL, загрузки текстур;
 *   - сеть: промежутки между пакетами состояния и поправка своего героя; загрузка процессора всей машины по секундам;
 *   - Chrome trace (GC, Layout, пересчёт стилей; с --inval — и их источники) и профиль CPU с топом горячих функций;
 *   - «полосы» на снимках: ширины одинаковых столбцов и строк в середине кадра (при неровной растяжке — 2 и 3 px вперемешку).
 *
 * Запуск (строго по одному, порты свободные):
 *   $env:TEST_PORT="2801"; $env:VITE_TEST_PORT="5399"; npx tsx tests/perf-run.ts [--label=before] [--dpr=1.25] [--zoom=2.25] [--secs=20] [--gpu] [--no-trace] [--inval] [--only=forest,trek,shots]
 * --dpr — эмуляция масштаба экрана (deviceScaleFactor), --zoom — масштаб в пикселях CSS, как выставленный колесом (zoom:v2),
 * --gpu — WebGL на видеокарте вместо программного SwiftShader (на SwiftShader кадр упирается в растеризацию и замер не показателен).
 * Выход — tools/out/perf/<label>/: report.json (всё собранное), trace-<сегмент>.json, shots/*.png.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type KeyInput, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";
import { MAP_SEED, PLAYER_RADIUS, PLAYER_SPEED, TILE } from "../shared/constants";
import { SWAY_TREES } from "../shared/decor";
import { generateMap, walkable, Zone, zoneAtPx } from "../shared/map";
import { TOWN } from "../shared/town";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const LABEL = arg("label") ?? "run";
const DPR = Number(arg("dpr") ?? 1);
const ZOOM = arg("zoom") ? Number(arg("zoom")) : null;
const SECS = Number(arg("secs") ?? 20);
const GPU = process.argv.includes("--gpu");
const TRACE = !process.argv.includes("--no-trace");
/** --inval: в trace ещё и источники пересчёта стилей и вёрстки (какой узел и почему), счёт по видам. */
const INVAL = process.argv.includes("--inval");
/** --only=forest,trek,shots — только эти сегменты (city, forest, trek) и снимки (shots). */
const ONLY = (arg("only") ?? "").split(",").filter(Boolean);
const VIEW = { width: 1280, height: 800 };
const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5199;
const OUT = path.resolve("tools/out/perf", LABEL);
const LOGIN = "perfrun", PASS = "secret", HERO = "Бегун";

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

// ---------- маршруты бега ----------
const map = generateMap(MAP_SEED);
/** Прямоугольник бега: вправо LX, вниз LY, влево LX, вверх LY — весь путь проходим (проверка по точкам через 4 px). */
const LX = Math.round(PLAYER_SPEED * 2.5), LY = Math.round(PLAYER_SPEED * 1.5);
function loopFree(x: number, y: number): boolean {
  const pts: [number, number][] = [];
  for (let d = 0; d <= LX; d += 4) pts.push([x + d, y], [x + d, y + LY]);
  for (let d = 0; d <= LY; d += 4) pts.push([x, y + d], [x + LX, y + d]);
  return pts.every(([px, py]) => walkable(map, px, py, PLAYER_RADIUS + 2));
}
/** Старт маршрута рядом с (cx, cy): свободный прямоугольник с наибольшим счётом score. */
function findLoop(cx: number, cy: number, span: number, score: (x: number, y: number) => number, step = 16) {
  let best: { x: number; y: number; s: number } | null = null;
  for (let y = cy - span; y <= cy + span; y += step) for (let x = cx - span; x <= cx + span; x += step) {
    if (!loopFree(x, y)) continue;
    const s = score(x, y) - Math.hypot(x - cx, y - cy) * 0.001;
    if (!best || s > best.s) best = { x, y, s };
  }
  if (!best) throw new Error(`нет свободного маршрута у ${cx},${cy}`);
  return best;
}
const trees = map.objects.filter((o) => SWAY_TREES.has(o.kind));
/** Деревья Basic в кадре вокруг маршрута (кадр 640×400 мира при zoom 2). */
const treesNear = (x: number, y: number) => trees.reduce((n, o) => n + (Math.abs(o.x - (x + LX / 2)) < 420 && Math.abs(o.y - (y + LY / 2)) < 300 ? 1 : 0), 0);
function forestSpot() {
  // клетки 640×400 с наибольшим числом деревьев в зонах Meadow/Forest
  const cells = new Map<string, number>();
  for (const o of trees) {
    const z = zoneAtPx(map, o.x, o.y);
    if (z !== Zone.Meadow && z !== Zone.Forest) continue;
    const k = `${Math.floor(o.x / 640)},${Math.floor(o.y / 400)}`;
    cells.set(k, (cells.get(k) ?? 0) + 1);
  }
  const top = [...cells.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);
  let best: { x: number; y: number; s: number } | null = null;
  for (const [k] of top) {
    const [cx, cy] = k.split(",").map(Number);
    try {
      const l = findLoop(cx * 640 + 320 - LX / 2, cy * 400 + 200 - LY / 2, 384, treesNear, 32);
      if (!best || l.s > best.s) best = l;
    } catch {}
  }
  if (!best) throw new Error("в лесу нет свободного маршрута");
  return best;
}
const ROUTES = {
  city: findLoop(TOWN.x * TILE - LX / 2, TOWN.y * TILE - LY / 2, 320, () => 0),
  forest: forestSpot(),
};

// ---------- зонды в странице ----------
/** Ставится до скриптов игры: rAF-лента кадров, обёртки ResizeObserver и MutationObserver, счётчики на кадр. */
const PROBE_EARLY = `(() => {
  const P = window.__perf = { on: false, frames: [], samples: [], cnt: {}, ms: {}, msg: {}, msgMs: {}, cur: { text: 0, msg: 0, ro: 0, mo: 0, chunk: 0, upd: 0, rnd: 0, lb: 0 }, long: [] };
  P.add = (k, n = 1) => { P.cnt[k] = (P.cnt[k] || 0) + n; };
  P.time = (k, ms) => { P.ms[k] = (P.ms[k] || 0) + ms; };
  const wrapObs = (Name, key) => {
    const O = window[Name];
    window[Name] = class extends O {
      constructor(cb) {
        super((a, b) => {
          const t = performance.now();
          try { cb(a, b); } finally { if (P.on) { P.add(key); P.add(key + 'Entries', a.length); P.time(key, performance.now() - t); P.cur[key === 'ro' ? 'ro' : 'mo']++; } }
        });
      }
    };
  };
  wrapObs('ResizeObserver', 'ro');
  wrapObs('MutationObserver', 'mo');
  let last = 0;
  const loop = (t) => {
    if (P.on && last) { const c = P.cur; P.frames.push([Math.round(t * 10) / 10, Math.round((t - last) * 10) / 10, c.text, c.msg, c.ro, c.mo, c.chunk, Math.round(c.upd * 10) / 10, Math.round(c.rnd * 10) / 10, c.lb]); }
    P.cur = { text: 0, msg: 0, ro: 0, mo: 0, chunk: 0, upd: 0, rnd: 0, lb: 0 };
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => { if (P.on) for (const e of l.getEntries()) P.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: false }); } catch (e) {}
})();`;

/** Ставится в мире: обёртки Phaser (тексты, update/render, куски мира), сети и HUD; выборка раз в секунду. */
const PROBE_WORLD = `(() => {
  const P = window.__perf, game = window.__game, sc = game.scene.getScene('game'), hud = sc.hud, net = window.__net;
  let any = sc.children.list.find((o) => o.type === 'Text');
  const tmp = any ? null : (any = sc.add.text(0, 0, ''));
  const TP = Object.getPrototypeOf(any);
  tmp && tmp.destroy();
  const oRes = TP.setResolution;
  TP.setResolution = function (v) { if (P.on) P.add('setResolution'); return oRes.call(this, v); };
  const oUpd = TP.updateText;
  TP.updateText = function () { const t = performance.now(); const r = oUpd.call(this); if (P.on) { P.add('updateText'); P.time('updateText', performance.now() - t); P.cur.text++; } return r; };
  const sm = game.scene, oU = sm.update.bind(sm), oR = sm.render.bind(sm);
  sm.update = (a, b) => { const t = performance.now(); oU(a, b); if (P.on) { const d = performance.now() - t; P.cur.upd += d; P.time('phaserUpdate', d); } };
  sm.render = (r) => { const t = performance.now(); oR(r); if (P.on) { const d = performance.now() - t; P.cur.rnd += d; P.time('phaserRender', d); } };
  const oTm = sc.make.tilemap.bind(sc.make);
  sc.make.tilemap = (c) => { if (P.on) { P.add('chunk'); P.cur.chunk++; } return oTm(c); };
  const oEmit = net.emit.bind(net);
  net.emit = (ev, v) => { const t = performance.now(); try { return oEmit(ev, v); } finally { if (P.on) { P.msg[ev] = (P.msg[ev] || 0) + 1; P.msgMs[ev] = (P.msgMs[ev] || 0) + performance.now() - t; P.cur.msg++; } } };
  // вызовы отрисовки и загрузки текстур в GL (сброс пакета Phaser = вызов drawArrays/drawElements)
  const gl = game.renderer.gl;
  if (gl) for (const [fn, key] of [['drawArrays', 'draw'], ['drawElements', 'draw'], ['texImage2D', 'texUpload'], ['texSubImage2D', 'texUpload']]) {
    const o = gl[fn].bind(gl);
    gl[fn] = (...a) => { if (P.on) P.add(key); return o(...a); };
  }
  // сеть: промежутки между пакетами состояния с сервера (20 Гц = 50 мс; провал — пауза сервера) и поправка своего героя (сервер против предсказания)
  P.patches = [];
  net.room.onStateChange(() => { if (P.on) P.patches.push(performance.now()); });
  const oFrame = hud.frame.bind(hud);
  hud.frame = (info) => { oFrame(info); if (P.on && info.me) { const e = Math.hypot(info.me.x - info.pos.x, info.me.y - info.pos.y); P.errMax = Math.max(P.errMax || 0, e); if (e > 24) P.add('err24'); } };
  if (typeof hud.layoutBottom === 'function') {
    const oLb = hud.layoutBottom.bind(hud);
    hud.layoutBottom = () => { const t = performance.now(); oLb(); if (P.on) { P.add('layoutBottom'); P.time('layoutBottom', performance.now() - t); P.cur.lb++; } };
  }
  setInterval(() => {
    if (!P.on) return;
    const cam = sc.cameras.main, list = sc.children.list;
    P.samples.push({
      t: Math.round(performance.now()), fps: Math.round(game.loop.actualFps * 10) / 10,
      objs: list.length, visible: list.filter((o) => o.visible !== false && o.willRender && o.willRender(cam)).length,
      texts: list.filter((o) => o.type === 'Text').length, tweens: sc.tweens.getTweens().length, activeTweens: sc.tweens.getTweens().filter((t) => !t.paused).length, units: sc.units.size,
      textures: Object.keys(game.textures.list).length,
      // Graphics с командами (перестраиваются каждый кадр): по слою глубины — top-N (подписи, полоски), ground+N (круги на земле), y (по юниту)
      gfx: list.filter((o) => o.type === 'Graphics' && o.commandBuffer.length && o.visible).reduce((m, o) => { const d = o.depth, k = d > 9e5 ? 'top-' + Math.round(1e6 - d) : d < -500 ? 'ground' + Math.round(d + 600) : 'y'; m[k] = (m[k] || 0) + 1; m.cmds = (m.cmds || 0) + o.commandBuffer.length; return m; }, {}),
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null,
      zoom: cam.zoom, scroll: [Math.round(cam.scrollX), Math.round(cam.scrollY)], pos: [Math.round(sc.pos.x), Math.round(sc.pos.y)],
      canvas: [game.canvas.width, game.canvas.height, game.canvas.clientWidth, game.canvas.clientHeight],
    });
  }, 1000);
  return { textProto: !!TP.updateText, layoutBottom: typeof hud.layoutBottom, gl: !!gl };
})()`;

let page: Page;
const run = <T = any>(body: string): Promise<T> => page.evaluate(body) as Promise<T>;
const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);

async function tp(x: number, y: number) {
  await dbg({ op: "tp", x, y });
  await sleep(1200);
  await run(`(() => { const sc = window.__game.scene.getScene('game'), u = sc.units.get(window.__net.id); if (u) sc.cameras.main.centerOn(u.x, u.y); })()`);
  await sleep(2500); // догрузка кусков мира и листов вокруг новой точки — до начала замера
}

/** Бег по прямоугольнику стрелками в течение ms. */
async function runLoop(ms: number, onTick?: (t: number) => Promise<void>) {
  const legs: [KeyInput, number][] = [["ArrowRight", (LX / PLAYER_SPEED) * 1000], ["ArrowDown", (LY / PLAYER_SPEED) * 1000], ["ArrowLeft", (LX / PLAYER_SPEED) * 1000], ["ArrowUp", (LY / PLAYER_SPEED) * 1000]];
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < ms) {
    const [key, len] = legs[i++ % 4];
    await page.keyboard.down(key);
    const end = Math.min(Date.now() + len, t0 + ms);
    while (Date.now() < end) {
      await sleep(Math.min(100, end - Date.now()));
      if (onTick) await onTick(Date.now() - t0);
    }
    await page.keyboard.up(key);
  }
}

// ---------- разбор ----------
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))] : 0; };
const r1 = (v: number) => Math.round(v * 10) / 10;

interface TraceEv { name: string; ph: string; ts: number; dur?: number; tid: number; pid: number; args?: any; cat?: string }
function parseTrace(file: string, syncPerf: number, syncName: string) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const evs: TraceEv[] = Array.isArray(raw) ? raw : raw.traceEvents;
  const threads = new Map<string, string>();
  for (const e of evs) if (e.ph === "M" && e.name === "thread_name") threads.set(`${e.pid}:${e.tid}`, e.args.name);
  const sync = evs.find((e) => e.name === "TimeStamp" && e.args?.data?.message === syncName);
  const off = sync ? sync.ts / 1000 - syncPerf : null; // trace мс = perf мс + off
  // главный поток страницы — тот, где наш TimeStamp
  const main = sync ? `${sync.pid}:${sync.tid}` : [...threads.entries()].find(([, n]) => n === "CrRendererMain")?.[0];
  const byThread = new Map<string, Map<string, { n: number; ms: number }>>();
  const complete: { name: string; start: number; dur: number; fn?: string }[] = [];
  const open = new Map<string, TraceEv[]>();
  const put = (th: string, name: string, dur: number) => {
    const m = byThread.get(th) ?? new Map();
    byThread.set(th, m);
    const v = m.get(name) ?? { n: 0, ms: 0 };
    v.n++; v.ms += dur;
    m.set(name, v);
  };
  for (const e of evs) {
    const key = `${e.pid}:${e.tid}`;
    const th = threads.get(key) ?? key;
    if (e.ph === "X" && e.dur !== undefined) {
      put(th, e.name, e.dur / 1000);
      if (key === main && e.dur > 2000) complete.push({ name: e.name, start: e.ts / 1000, dur: e.dur / 1000, fn: e.args?.data?.functionName || e.args?.data?.type });
    } else if (e.ph === "B") (open.get(key + e.name) ?? open.set(key + e.name, []).get(key + e.name)!).push(e);
    else if (e.ph === "E") {
      const b = open.get(key + e.name)?.pop();
      if (b) {
        put(th, e.name, (e.ts - b.ts) / 1000);
        if (key === main && e.ts - b.ts > 2000) complete.push({ name: e.name, start: b.ts / 1000, dur: (e.ts - b.ts) / 1000 });
      }
    }
  }
  const tops: Record<string, { name: string; n: number; ms: number }[]> = {};
  for (const [th, m] of byThread) {
    if (!/CrRendererMain|CrGpuMain|Compositor|VizCompositor|GpuMemory|ThreadPoolForeg/.test(th) && !(main && th === threads.get(main))) continue;
    tops[th] = [...m.entries()].map(([name, v]) => ({ name, n: v.n, ms: r1(v.ms) })).sort((a, b) => b.ms - a.ms).slice(0, 18);
  }
  const inval = new Map<string, number>();
  for (const e of evs) if (/InvalidationTracking/.test(e.name) && `${e.pid}:${e.tid}` === main) {
    const d = e.args?.data ?? {};
    const k = `${e.name.replace("InvalidationTracking", "")} ${d.reason ?? d.invalidationSet?.[0]?.id ?? ""} ${d.nodeName ?? ""} ${d.changedClass ?? d.changedAttribute ?? d.changedId ?? ""}`.trim();
    inval.set(k, (inval.get(k) ?? 0) + 1);
  }
  const invalTop = [...inval.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  const gc = [...(byThread.get(threads.get(main ?? "") ?? "")?.entries() ?? [])].filter(([n]) => /GC|Scaveng|MarkCompact|Sweep/i.test(n)).map(([name, v]) => ({ name, n: v.n, ms: r1(v.ms) }));
  return { off, tops, gc, complete, invalTop };
}

/** Функции (своё время, мс) по выборкам профиля в окне [from, to] (мс часов trace). Часы профиля и trace общие (мкс). */
function profileWindow(p: any, from: number, to: number, n = 5) {
  const nodes = new Map<number, any>(p.nodes.map((q: any) => [q.id, q]));
  const by = new Map<string, number>();
  let t = p.startTime;
  for (let i = 0; i < p.samples.length; i++) {
    t += p.timeDeltas[i] ?? 0;
    const ms = t / 1000;
    if (ms < from || ms > to) continue;
    const f = nodes.get(p.samples[i]).callFrame;
    const k = `${f.functionName || "(anon)"}:${(f.url || "").split("/").pop()?.split("?")[0]}:${f.lineNumber + 1}`;
    by.set(k, (by.get(k) ?? 0) + (p.timeDeltas[i + 1] ?? 0) / 1000);
  }
  return [...by.entries()].filter(([k]) => !/^\(idle\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${r1(v)}`);
}

function parseProfile(p: any) {
  const nodes = new Map<number, any>(p.nodes.map((n: any) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const self = new Map<number, number>();
  for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000);
  const label = (n: any) => { const f = n.callFrame; return `${f.functionName || "(anon)"} ${(f.url || "").split("/").pop()?.split("?")[0]}:${f.lineNumber + 1}`; };
  const selfBy = new Map<string, number>(), totalBy = new Map<string, number>();
  for (const [id, ms] of self) {
    const n = nodes.get(id);
    selfBy.set(label(n), (selfBy.get(label(n)) ?? 0) + ms);
    // общее время: каждая функция на стеке один раз
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const l = label(nodes.get(cur));
      if (seen.has(l)) continue;
      seen.add(l);
      totalBy.set(l, (totalBy.get(l) ?? 0) + ms);
    }
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  const top = (m: Map<string, number>, n: number) => [...m.entries()].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ fn: k, ms: r1(v), pct: r1((v / total) * 100) }));
  const idle = [...selfBy.entries()].filter(([k]) => /^\(idle\)/.test(k)).reduce((a, [, v]) => a + v, 0);
  const gc = [...selfBy.entries()].filter(([k]) => /^\(garbage collector\)/.test(k)).reduce((a, [, v]) => a + v, 0);
  // функции мира и HUD, за которыми следим отдельно (общее время за сегмент)
  const focus = Object.fromEntries([...totalBy.entries()].filter(([k]) => /^(createChunk|dropChunk|makeObject|cull|showCell|syncTextRes|layoutBottom|layout|cursorAt|drawMini|tickAuras) /.test(k)).map(([k, v]) => [k, r1(v)]));
  return { totalMs: r1(total), idleMs: r1(idle), gcMs: r1(gc), self: top(selfBy, 25), inclusive: top(totalBy, 40), focus };
}

/** Полосы на кадре: ширины «текселей» по столбцам и строкам полосы в середине экрана (одинаковые соседние столбцы — один тексель). */
function stripeStats(file: string) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const { width: W, height: H, data } = png;
  const runs = (axis: "col" | "row") => {
    const n = axis === "col" ? W : H;
    // полоса посередине, подальше от HUD: для столбцов — строки 35–60% высоты, для строк — столбцы 30–70% ширины
    const a0 = Math.floor((axis === "col" ? H : W) * (axis === "col" ? 0.35 : 0.3)), a1 = Math.floor((axis === "col" ? H : W) * (axis === "col" ? 0.6 : 0.7));
    const px = (i: number, j: number) => { const o = axis === "col" ? (j * W + i) * 4 : (i * W + j) * 4; return (data[o] << 16) | (data[o + 1] << 8) | data[o + 2]; };
    const same = (i: number) => { for (let j = a0; j < a1; j++) if (px(i, j) !== px(i - 1, j)) return false; return true; };
    const hist: Record<string, number> = {};
    let len = 1;
    for (let i = 1; i < n; i++) {
      if (same(i)) len++;
      else { const k = len >= 8 ? "8+" : String(len); hist[k] = (hist[k] ?? 0) + 1; len = 1; }
    }
    return hist;
  };
  return { size: [W, H], cols: runs("col"), rows: runs("row") };
}

/** Переход по лесу кликами: ПКМ у правого края кадра раз в секунду — герой идёт по пути в обход деревьев и пересекает несколько кусков мира. */
async function trek(ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await page.mouse.click(VIEW.width - 90, VIEW.height / 2 - 20, { button: "right" });
    await sleep(1000);
  }
}

async function segment(name: "city" | "forest" | "trek", cdp: Awaited<ReturnType<Page["createCDPSession"]>>) {
  const r = ROUTES[name === "trek" ? "forest" : name];
  console.log(`\n== ${name}: старт ${r.x},${r.y}${name === "forest" ? `, деревьев Basic у маршрута: ${treesNear(r.x, r.y)}` : ""}`);
  await tp(r.x, r.y);
  await run(`(() => { const P = window.__perf; P.frames = []; P.samples = []; P.cnt = {}; P.ms = {}; P.msg = {}; P.msgMs = {}; P.long = []; P.patches = []; P.errMax = 0; })()`);
  const traceFile = path.join(OUT, `trace-${name}.json`);
  if (TRACE) await page.tracing.start({ path: traceFile, categories: ["devtools.timeline", "v8", "disabled-by-default-v8.gc", ...(INVAL ? ["disabled-by-default-devtools.timeline.invalidationTracking"] : [])] });
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 250 });
  await cdp.send("Profiler.start");
  const syncName = `perf-sync-${name}`;
  const syncPerf = await run<number>(`(() => { const t = performance.now(); console.timeStamp('${syncName}'); window.__perf.on = true; return t; })()`);
  // загрузка процессора всей машины раз в секунду (тормоза могут идти не от игры, а от соседних процессов)
  const cpuAt = () => os.cpus().reduce((a, c) => { const t = c.times; a.busy += t.user + t.nice + t.sys + t.irq; a.all += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { busy: 0, all: 0 });
  const cpu: number[] = [];
  let prev = cpuAt();
  const cpuTimer = setInterval(() => { const c = cpuAt(); cpu.push(Math.round(((c.busy - prev.busy) / Math.max(1, c.all - prev.all)) * 100)); prev = c; }, 1000);
  if (name === "trek") await trek(SECS * 1000);
  else await runLoop(SECS * 1000);
  clearInterval(cpuTimer);
  const data = await run<any>(`(() => { const P = window.__perf; P.on = false; return { frames: P.frames, samples: P.samples, cnt: P.cnt, ms: P.ms, msg: P.msg, msgMs: P.msgMs, long: P.long, patches: P.patches, errMax: P.errMax || 0 }; })()`);
  const { profile } = await cdp.send("Profiler.stop");
  if (TRACE) await page.tracing.stop();

  const dts: number[] = data.frames.map((f: number[]) => f[1]);
  const secs = dts.reduce((a, b) => a + b, 0) / 1000;
  const spikesAt = (lim: number) => data.frames.filter((f: number[]) => f[1] > lim).length;
  const tr = TRACE ? parseTrace(traceFile, syncPerf, syncName) : null;
  // пики: 12 худших кадров с тем, что в них было (счётчики кадра и события trace длиннее 2 мс)
  const t0 = data.frames[0]?.[0] ?? 0;
  const worst = [...data.frames].sort((a: number[], b: number[]) => b[1] - a[1]).slice(0, 12).map((f: number[]) => {
    const [t, dt, text, msg, ro, mo, chunk, upd, rnd, lb] = f;
    const ev = tr && tr.off !== null ? tr.complete.filter((e) => e.start < t + tr.off! && e.start + e.dur > t - dt + tr.off!).map((e) => `${e.name}${e.fn ? `(${e.fn})` : ""} ${r1(e.dur)}`).slice(0, 8) : [];
    const cpu = tr && tr.off !== null ? profileWindow(profile, t - dt + tr.off, t + tr.off) : [];
    return { at: r1((t - t0) / 1000), dt, upd, rnd, text, msg, ro, mo, chunk, lb, trace: ev, cpu };
  });
  const res = {
    route: r,
    frames: dts.length, seconds: r1(secs), fps: r1(dts.length / secs),
    dt: { mean: r1((secs * 1000) / dts.length), p50: pct(dts, 0.5), p95: pct(dts, 0.95), p99: pct(dts, 0.99), max: Math.max(...dts) },
    spikes: { over33: spikesAt(33.4), over50: spikesAt(50), over100: spikesAt(100) },
    spikeTimeline: data.frames.filter((f: number[]) => f[1] > 50).map((f: number[]) => r1((f[0] - t0) / 1000)),
    phaser: { updateMsPerFrame: r1((data.ms.phaserUpdate ?? 0) / dts.length), renderMsPerFrame: r1((data.ms.phaserRender ?? 0) / dts.length) },
    actualFps: data.samples.map((s: any) => s.fps),
    samples: data.samples,
    perSecond: Object.fromEntries(Object.entries(data.cnt).map(([k, v]) => [k, r1((v as number) / secs)])),
    msTotal: Object.fromEntries(Object.entries(data.ms).map(([k, v]) => [k, r1(v as number)])),
    messages: Object.fromEntries(Object.entries(data.msg).map(([k, v]) => [k, { perSec: r1((v as number) / secs), ms: r1(data.msgMs[k]) }])),
    longTasks: data.long,
    machineCpu: cpu,
    // кадры, в которых создавались куски мира: [кусков, длительность кадра, update Phaser]
    chunkFrames: data.frames.filter((f: number[]) => f[6] > 0).map((f: number[]) => [f[6], f[1], f[7]]),
    net: (() => { const iv = (data.patches as number[]).slice(1).map((t, i) => t - data.patches[i]); return { patches: iv.length + 1, p50: r1(pct(iv, 0.5)), p99: r1(pct(iv, 0.99)), max: r1(Math.max(0, ...iv)), over150: iv.filter((d) => d > 150).length, heroErrMax: r1(data.errMax), heroErrOver24: data.cnt.err24 ?? 0 }; })(),
    worst,
    trace: tr ? { tops: tr.tops, gc: tr.gc, inval: tr.invalTop } : null,
    profile: parseProfile(profile),
  };
  const s = res.samples.at(-1) ?? {};
  console.log(`  fps ${res.fps} (actualFps ${res.actualFps.join(" ")}) | кадр p50 ${res.dt.p50} p95 ${res.dt.p95} p99 ${res.dt.p99} max ${res.dt.max} мс | >50 мс: ${res.spikes.over50}, >100 мс: ${res.spikes.over100}`);
  console.log(`  Phaser на кадр: update ${res.phaser.updateMsPerFrame} мс, render ${res.phaser.renderMsPerFrame} мс | объекты ${s.objs} (видимых ${s.visible}), твины ${s.tweens} (идут ${s.activeTweens}), юниты ${s.units}, тексты ${s.texts}, Graphics ${JSON.stringify(s.gfx)}, куча ${s.heap} МБ, холст ${s.canvas}`);
  console.log(`  в секунду: ${JSON.stringify(res.perSecond)}`);
  console.log(`  загрузка ЦП машины по секундам, %: ${cpu.join(" ")}`);
  console.log(`  кадры с созданием кусков мира [кусков, кадр мс, update мс]: ${JSON.stringify(res.chunkFrames)} | ${JSON.stringify(res.profile.focus)}`);
  console.log(`  сеть: пакеты состояния p50 ${res.net.p50} p99 ${res.net.p99} max ${res.net.max} мс, > 150 мс: ${res.net.over150} | поправка героя max ${res.net.heroErrMax} px, кадров с > 24 px: ${res.net.heroErrOver24}`);
  console.log(`  сообщения/с: ${Object.entries(res.messages).map(([k, v]) => `${k} ${v.perSec}`).join(", ")}`);
  console.log(`  пики > 50 мс на секундах: ${res.spikeTimeline.join(" ")}`);
  if (tr && INVAL) console.log(`  пересчёт стилей и вёрстки, источники: ${tr.invalTop.slice(0, 12).map(([k, n]) => `${k} ×${n}`).join(" | ")}`);
  if (tr) console.log(`  GC (главный поток): ${tr.gc.map((g) => `${g.name} ×${g.n} ${g.ms} мс`).join(", ")}`);
  console.log(`  горячие функции (своё время): ${res.profile.self.slice(0, 10).map((f) => `${f.fn} ${f.pct}%`).join(" | ")}`);
  return res;
}

async function shots() {
  // кадры на бегу в лесу: 4 снимка подряд при беге вправо, затем 2 снимка стоя (покачивание деревьев без движения камеры)
  const r = ROUTES.forest;
  await tp(r.x, r.y);
  fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
  const list: { file: string; moving: boolean; stripes: ReturnType<typeof stripeStats> }[] = [];
  await page.keyboard.down("ArrowRight");
  await sleep(700);
  for (let i = 0; i < 4; i++) {
    const file = path.join(OUT, "shots", `run-${i}.png`);
    await page.screenshot({ path: file as `${string}.png` });
    list.push({ file: path.relative(process.cwd(), file), moving: true, stripes: stripeStats(file) });
    await sleep(120);
  }
  await page.keyboard.up("ArrowRight");
  await sleep(1500);
  for (let i = 0; i < 2; i++) {
    const file = path.join(OUT, "shots", `still-${i}.png`);
    await page.screenshot({ path: file as `${string}.png` });
    list.push({ file: path.relative(process.cwd(), file), moving: false, stripes: stripeStats(file) });
    await sleep(400);
  }
  for (const s of list) console.log(`  ${path.basename(s.file)}: ширины столбцов ${JSON.stringify(s.stripes.cols)} | строк ${JSON.stringify(s.stripes.rows)}`);
  // стоя: сколько пикселей меняется между двумя кадрами (покачивание деревьев, вода, огни) — камера неподвижна
  const a = PNG.sync.read(fs.readFileSync(list[4].file)), b = PNG.sync.read(fs.readFileSync(list[5].file));
  let diff = 0;
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) diff++;
  console.log(`  стоя, разница двух кадров: ${diff} px (${r1((diff / (a.width * a.height)) * 100)}%)`);
  return { list, stillDiff: diff };
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`Замер бега «${LABEL}»: dpr ${DPR}, zoom ${ZOOM ?? "авто"}, ${SECS} с на сегмент, ${GPU ? "GPU" : "SwiftShader"} → ${path.relative(process.cwd(), OUT)}`);
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const gl = GPU ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: [...gl, `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox", "--enable-precise-memory-info"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: DPR },
  });
  const errors: string[] = [];
  const report: Record<string, unknown> = { label: LABEL, dpr: DPR, zoom: ZOOM, secs: SECS, gpu: GPU, routes: ROUTES };
  try {
    await ensureChar(LOGIN, PASS, HERO, "warrior", 2);
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    await page.evaluateOnNewDocument(PROBE_EARLY);
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await page.evaluate((z) => { try { if (z) localStorage.setItem("zoom:v2", String(z)); else localStorage.removeItem("zoom:v2"); } catch {} }, ZOOM);
    await page.waitForSelector("#login-name", { visible: true, timeout: 20000 });
    await page.type("#login-name", LOGIN);
    await page.type("#login-pass", PASS);
    await page.click("#login-go");
    await page.waitForSelector(`.cs-slot[data-name="${HERO}"]`, { timeout: 15000 });
    await page.$eval(`.cs-slot[data-name="${HERO}"]`, (b) => (b as HTMLElement).click());
    await sleep(300);
    await page.click('.cs-list [data-a="play"]');
    await page.waitForFunction("window.__game && window.__game.scene.isActive('game') && window.__net && window.__net.self && window.__net.online", { timeout: 40000, polling: 250 });
    await sleep(2500);
    report.gl = await run(`(() => { const g = window.__game.renderer.gl; if (!g) return 'canvas'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); })()`);
    console.log(`WebGL: ${report.gl}`);
    report.probe = await run(PROBE_WORLD);
    await dbg({ op: "level", v: 20 });
    await dbg({ op: "god" });
    await sleep(500);
    const cdp = await page.createCDPSession();
    for (const s of ["city", "forest", "trek"] as const) if (!ONLY.length || ONLY.includes(s)) report[s] = await segment(s, cdp);
    if (!ONLY.length || ONLY.includes("shots")) report.shots = await shots();
  } finally {
    report.errors = errors.slice(0, 20);
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer();
  }
  if (errors.length) console.log("Ошибки в консоли браузера:\n" + errors.slice(0, 10).join("\n"));
  console.log(`\nГотово: ${path.relative(process.cwd(), path.join(OUT, "report.json"))}`);
}

main().catch(async (e) => {
  console.error(e);
  await stopServer();
  process.exit(1);
});
