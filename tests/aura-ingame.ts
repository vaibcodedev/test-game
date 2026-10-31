/**
 * Обозначения бафов и дебафов на юнитах в настоящем браузере (задача 129, шаг 2): сервер в этом же процессе (файлы героев ставят эффекты прямо в мир),
 * Vite и Chrome. Герой-зритель в браузере, рядом бот-герой с эффектами: зритель видит обозначения другого игрока, как и свои.
 * Проверяется: набор Unit.fx доходит до клиента; слоты (один круг + бусины, один купол, два значка по приоритету), ряд значков, снятие (плавно,
 * спрайты возвращаются в пул), зона знамени (кольцо у храмовника, эмблема у союзника), скрытый — без обозначений, толпа, все 65 обозначений в игре на зуме 2 и 3
 * (листы-галереи), зазор между значком и ником на дробной высоте героя и ник соседа не под значками (gap), кадры в секунду с 20 юнитами с эффектами и без них,
 * ошибок в консоли нет.
 * Время сцены идёт вручную шагами (как в tests/vfx-screens.ts), поэтому кадр не зависит от нагрузки машины; замер кадров — в живом цикле.
 *
 * Запуск (строго по одному; перед прогоном mkdir tools/out/scenario.lock, после — rmdir; порты свободные):
 *   $env:TEST_PORT="2931"; $env:VITE_TEST_PORT="5431"; npx tsx tests/aura-ingame.ts [--only=pair,row,gap,gallery,zones,stealth,mount,crowd,fps] [--secs=6] [--gpu]
 * Выход — tools/out/aura-ingame/: pair-z2.png, pair-z3.png, gallery-z2.png, gallery-z3.png, banner-z2.png, crowd-z2.png, report.json. Путь к Chrome: CHROME_PATH.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { PNG } from "pngjs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { Bot, dbFile, ensureChar, PORT, sleep } from "./harness";
import { PC } from "../tools/gen/canvas";
import { BG, BEIGE, drawText, fill } from "../tools/gen/vendor-lib";
import { MAP_SEED, TILE } from "../shared/constants";
import { generateMap, T, walkable } from "../shared/map";
import type { Player } from "../server/src/game/Player";
import type { World } from "../server/src/game/World";
import type { ClassId } from "../shared/classes";

const argv = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3).split(",").filter(Boolean) ?? [];
const ONLY = new Set(argv("only"));
const want = (s: string) => !ONLY.size || ONLY.has(s);
const SECS = Number(argv("secs")[0] ?? 6);
/** --gpu: WebGL на видеокарте вместо программного SwiftShader (на SwiftShader кадр упирается в растеризацию, замер кадров не показателен). */
const GPU = process.argv.includes("--gpu");
const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5199;
const VIEW = { width: 1280, height: 800 };
const OUT = path.resolve("tools/out/aura-ingame");
const STEP = 40;
const PASS = "secret";

let page: Page;
const errors: string[] = [];
const lines: string[] = [];
let bad = 0;
const report: Record<string, unknown> = {};
const check = (ok: boolean, msg: string) => { lines.push(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; console.log(lines[lines.length - 1]); };
const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), net = window.__net, afx = window.__afx, a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;
const adv = (ms: number) => run("window.__adv(a)", ms);

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const busy = (port: number) => new Promise<boolean>((res) => { const c = net.createConnection({ port, host: "127.0.0.1" }); c.once("connect", () => { c.destroy(); res(true); }); c.once("error", () => res(false)); });

// ---------- сервер в этом процессе ----------
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

// ---------- эффекты, которые ставим героям прямо в мир (поля Player: их читает auraList) ----------
const long = () => W().time + 3_600_000;
const KIT: Record<string, (p: Player) => void> = {
  stun: (p) => { p.stunUntil = long(); }, root: (p) => { p.rootUntil = long(); }, slow: (p) => { p.slowUntil = long(); p.slowPct = 30; },
  weak: (p) => { p.weakUntil = long(); p.weakPct = 20; }, bleed: (p) => { p.bleedUntil = long(); p.bleedStacks = 2; }, poison: (p) => { p.poisonUntil = long(); },
  venom: (p) => { p.venomUntil = long(); p.venomStacks = 3; }, burn: (p) => { p.burnUntil = long(); }, curse: (p) => { p.curseUntil = long(); }, outlaw: (p) => { p.outlawUntil = long(); },
  shield: (p) => { p.shieldUntil = long(); p.shieldAmt = 400; p.shieldBy = p; }, block: (p) => { p.blockUntil = long(); p.blockPct = 40; },
  bone: (p) => { p.boneUntil = long(); p.boneChill = 10; }, laststand: (p) => { p.lastStandUntil = long(); p.lastStandPct = 20; },
  renew: (p) => { p.renewUntil = long(); p.renewAmt = 50; p.renewBy = p; }, bond: (p) => { p.bondUntil = long(); p.bondShare = 30; p.bondBy = p; },
  frenzy: (p) => { p.frenzyUntil = long(); p.frenzyLeech = 10; }, haste: (p) => { p.hasteUntil = long(); p.hastePct = 30; }, warcry: (p) => { p.warcryUntil = long(); p.warcryDmg = 10; },
  critnext: (p) => { p.critNextUntil = long(); }, stealth: (p) => { p.stealthUntil = long(); },
};
const FIELDS0 = ["stunUntil", "rootUntil", "slowUntil", "weakUntil", "bleedUntil", "poisonUntil", "venomUntil", "burnUntil", "curseUntil", "outlawUntil", "shieldUntil", "blockUntil", "boneUntil", "lastStandUntil", "renewUntil", "bondUntil", "frenzyUntil", "hasteUntil", "warcryUntil", "critNextUntil", "stealthUntil"] as const;
function setKit(p: Player, keys: string[]) {
  for (const f of FIELDS0) (p as unknown as Record<string, number>)[f] = 0;
  p.shieldAmt = 0;
  for (const k of keys) KIT[k](p);
}
function put(p: Player, x: number, y: number) { p.unit.x = x; p.unit.y = y; p.moveTo = null; p.unit.maxHp = p.unit.hp = 999999; }

// ---------- место: ровная трава подальше от стоянок мобов ----------
function findSpot() {
  const map = W().map ?? generateMap(MAP_SEED);
  const vt = (x: number, y: number) => map.vtx[y * (map.w + 1) + x];
  const solid = (tx: number, ty: number, rx = 7, ry = 6) => { for (let y = ty - ry; y <= ty + ry; y++) for (let x = tx - rx; x <= tx + rx; x++) if (vt(x, y) !== T.Grass) return false; return true; };
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let ty = 10; ty < map.h - 10; ty += 2) for (let tx = 10; tx < map.w - 10; tx += 2) {
    if (!solid(tx, ty)) continue;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2, d = Math.hypot(x - map.playerSpawn.x, y - map.playerSpawn.y);
    if (d < bd && walkable(map, x, y, 60) && map.spawns.every((sp) => Math.hypot(sp.x - x, sp.y - y) > 480) && (map.bosses ?? []).every((b) => Math.hypot(b.x - x, b.y - y) > 700)) { bd = d; best = { x, y }; } // боссы стартовых земель у точки появления убивали героев (Лютобор, 2026-10-31)
  }
  if (!best) throw new Error("нет ровной травы");
  return best;
}

// ---------- страница ----------
async function enter(name: string, token: string) {
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); localStorage.setItem("zoom:v2", "2"); }, token);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction("document.getElementById('charsel').hidden", { timeout: 50000, polling: 250 });
  await page.waitForFunction("window.__game && window.__game.scene.isActive('game')", { timeout: 50000, polling: 250 });
  await page.waitForFunction("window.__net && window.__net.self && window.__net.online", { timeout: 40000, polling: 250 });
  await sleep(1500);
  await run(`window.__vt = performance.now(); window.__adv = (ms) => { const g = window.__game, tw = g.scene.getScene('game').tweens; const n = Math.max(1, Math.round(ms / ${STEP})); for (let i = 0; i < n; i++) { const now = Date.now(); tw.startTime += now - tw.prevTime - ${STEP}; tw.prevTime = now - ${STEP}; window.__vt += ${STEP}; g.loop.delta = ${STEP}; g.step(window.__vt, ${STEP}); } };`);
}
/** Камера на точку мира (юниты вне кадра обозначений не считают и не рисуют). */
const look = (x: number, y: number) => run("const cam = sc.cameras.main; cam.stopFollow(); cam.centerOn(a.x, a.y);", { x, y });
const freeze = () => run("const l = window.__game.loop; if (l.running) l.sleep(); window.__vt = performance.now();");
const thaw = () => run("const l = window.__game.loop; if (!l.running) l.wake(true);");
const fxOf = (id: string) => run<string>("const u = net.unit(a); return u ? u.fx : null", id);
const decode = (s: string) => run<string[]>("return [...a].map((c) => { const code = c.charCodeAt(0) - 32; return afx.fx[code & 127].key + ((code >> 7) ? '×' + (code >> 7) : ''); })", s);
const keysOnClient = async (id: string) => decode((await fxOf(id)) ?? "");
/** Дождаться, пока набор эффектов героев дойдёт до клиента (игра идёт): под нагрузкой патч приходит позже фиксированной паузы. */
async function waitKits(want: [string, string[]][], ms = 8000) {
  await thaw();
  const t0 = Date.now();
  for (;;) {
    let ok = true;
    for (const [id, keys] of want) { const got = (await keysOnClient(id)).map((k) => k.split("×")[0]); if (!keys.every((k) => got.includes(k)) || got.length !== keys.length) ok = false; }
    if (ok || Date.now() - t0 > ms) break;
    await sleep(150);
  }
  await sleep(300);
  await freeze();
}
/** Состояние обозначений юнита в клиенте: что выбрано, роль, плавность, число видимых спрайтов. */
const stateOf = (id: string) => run<{ k: string; role: number; want: boolean; vis: number; imgs: number; n: number; hdx: number; lift: number }[]>(
  "const v = sc.units.get(a); const au = v && v.afxView; return au ? au.insts.map((i) => ({ k: i.fx.key, role: i.role, want: i.want, vis: +i.vis.toFixed(2), imgs: i.items.flat().filter((m) => m.im.visible).length + (i.beadImg && i.beadImg.visible ? 1 : 0), n: i.n, hdx: i.hdx, lift: i.lift })) : []", id);
const visibleAfx = () => run<number>("return sc.children.list.filter((o) => o.texture && /^afx/.test(o.texture.key) && o.visible && o.active).length");

/** Кадр мира: центр камеры на (cx, cy), шаги времени, чтение canvas в том же вызове; вырезка w×h пикселей мира вокруг центра. */
async function snap(cx: number, cy: number, w: number, h: number, steps = 0): Promise<{ png: PNG; z: number }> {
  const c = await run<{ url: string; x: number; y: number; z: number }>(`
    const cam = sc.cameras.main, g = window.__game, cv = g.canvas;
    cam.stopFollow(); cam.centerOn(a.cx, a.cy);
    if (a.steps) window.__adv(a.steps); else window.__adv(${STEP});
    const k = cv.width / g.scale.width;
    return { url: cv.toDataURL('image/png'), x: (a.cx - cam.worldView.x) * cam.zoom * k, y: (a.cy - cam.worldView.y) * cam.zoom * k, z: cam.zoom * k };`, { cx, cy, steps });
  const src = PNG.sync.read(Buffer.from(c.url.split(",")[1], "base64"));
  const ww = Math.min(Math.round(w * c.z), src.width), hh = Math.min(Math.round(h * c.z), src.height);
  const x0 = Math.max(0, Math.min(src.width - ww, Math.round(c.x - ww / 2))), y0 = Math.max(0, Math.min(src.height - hh, Math.round(c.y - hh / 2)));
  const out = new PNG({ width: ww, height: hh });
  PNG.bitblt(src, out, x0, y0, ww, hh, 0, 0);
  return { png: out, z: c.z };
}
const up = (p: PNG, k: number): PNG => {
  const o = new PNG({ width: p.width * k, height: p.height * k });
  for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) { const s = (Math.floor(y / k) * p.width + Math.floor(x / k)) * 4, d = (y * o.width + x) * 4; for (let i = 0; i < 4; i++) o.data[d + i] = p.data[s + i]; }
  return o;
};
const save = (name: string, p: PNG) => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), PNG.sync.write(p)); };

// ---------- сцена ----------
async function scenario() {
  // полный прогон начисто; частичный (--only) оставляет снимки прошлых прогонов
  if (!ONLY.size) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const spot = findSpot();
  const tokenView = await ensureChar("afx_view", PASS, "Лира", "healer");
  const mk = async (login: string, name: string, cls: ClassId) => Bot.enter(await ensureChar(login, PASS, name, cls), name);
  const botA = await mk("afx_a", "Альдрик", "warrior");
  const botC = await mk("afx_c", "Кель", "mage");
  await enter("Лира", tokenView);
  const idB = await run<string>("return net.id"), idA = botA.id, idC = botC.id;
  const B = heroOf("Лира"), A = heroOf("Альдрик"), Cc = heroOf("Кель");
  put(B, spot.x, spot.y); put(A, spot.x + 56, spot.y); put(Cc, spot.x, spot.y - 150);
  await sleep(1500);
  await freeze();
  check(await run<boolean>("return !!afx && afx.ready && afx.fx.length === 65", null), "каталог обозначений загружен: 65 ключей, лист на месте");
  await run("sc.cameras.main.stopFollow();");

  // A. пара героев: у каждого несколько баффов и дебафф; зритель видит чужие обозначения
  if (want("pair")) {
    setKit(A, ["block", "laststand", "haste", "root", "bleed"]);
    setKit(B, ["shield", "renew", "slow", "venom"]);
    W().update(50);
    await thaw(); await sleep(900); await freeze();
    await look(spot.x + 28, spot.y - 30);
    const ka = await keysOnClient(idA), kb = await keysOnClient(idB);
    check(["block", "laststand", "haste", "root", "bleed×2"].every((k) => ka.includes(k)), `зритель видит набор чужого героя (со стаками): ${ka.join(" ")}`);
    check(["shield", "renew", "slow", "venom×3"].every((k) => kb.includes(k)), `и свой набор: ${kb.join(" ")}`);
    await adv(800);
    const sa = await stateOf(idA);
    const shown = sa.filter((i) => i.want).map((i) => `${i.k}:${i.role}`).sort().join(" ");
    check(shown === "block:3 laststand:4 bleed:4 root:1".split(" ").sort().join(" "), `у чужого героя по правилам слотов: круг root, купол block, два значка laststand и bleed (haste не влезает): ${shown}`);
    check(sa.filter((i) => i.want).every((i) => i.vis > 0.95 && i.imgs >= 1), "выбранные обозначения полностью проявились, спрайты на месте");
    check(!sa.find((i) => i.k === "haste")!.want && sa.find((i) => i.k === "haste")!.imgs === 0, "обозначение вне слотов не рисуется");
    const sb = await stateOf(idB);
    check(sb.filter((i) => i.want).map((i) => i.k).sort().join() === "renew,shield,slow,venom", `у своего героя: ${sb.filter((i) => i.want).map((i) => `${i.k}:${i.role}`).join(" ")}`);
    const ah = sa.filter((i) => i.want && i.role === 4);
    check(ah.length === 2 && ah.some((i) => i.k === "laststand" && i.hdx !== 0 || i.k === "bleed"), "значок над подписью и частицы на теле");
    // зум 2 и 3
    for (const z of [2, 3]) {
      await run("sc.cameras.main.setZoom(a)", z);
      await adv(600);
      const s = await snap(spot.x + 28, spot.y - 30, 210, 140, 400);
      save(`pair-z${z}.png`, up(s.png, 2));
      check(await visibleAfx() >= 8, `зум ${z}: спрайтов обозначений в кадре ${await visibleAfx()}`);
    }
    await run("sc.cameras.main.setZoom(2)");
    // снятие: плавно, спрайты возвращаются в пул
    setKit(A, []); setKit(B, []); W().update(50);
    await thaw(); await sleep(700); await freeze();
    check((await fxOf(idA)) === "", "эффекты сняты — набор у чужого героя пуст");
    await adv(900);
    const gone = await stateOf(idA);
    check(gone.length === 0 || gone.every((i) => i.imgs === 0), `спрайты чужого героя возвращены в пул (${gone.length} экземпляров, спрайтов ${gone.reduce((q, i) => q + i.imgs, 0)})`);
  }

  // А2. два значка над подписью идут в ряд без наложения (старший слева); со стаками (яд) оба выше на 3 px, точки — под своим значком
  if (want("row")) {
    setKit(A, ["laststand", "venom"]); setKit(B, ["curse", "weak"]);
    W().update(50);
    await waitKits([[idA, ["laststand", "venom"]], [idB, ["curse", "weak"]]]);
    await look(spot.x + 28, spot.y - 30);
    await adv(900);
    for (const [who, id, a, b, lift] of [["А", idA, "laststand", "venom", -3], ["Б", idB, "weak", "curse", 0]] as const) {
      const st = (await stateOf(id)).filter((i) => i.want && i.role === 4);
      const left = st.find((i) => i.hdx < 0), right = st.find((i) => i.hdx > 0);
      check(st.length === 2 && !!left && !!right && left.k === a && right.k === b && st.every((i) => i.lift === lift), `герой ${who}: значки в ряд — слева ${left?.k} (${left?.hdx}), справа ${right?.k} (${right?.hdx}), подъём ${st[0]?.lift}`);
    }
    for (const z of [2, 3]) {
      await run("sc.cameras.main.setZoom(a)", z);
      await adv(600);
      const s = await snap(spot.x + 28, spot.y - 30, 210, 140, 300);
      save(`row-z${z}.png`, up(s.png, 2));
    }
    await run("sc.cameras.main.setZoom(2)");
    setKit(A, []); setKit(B, []); W().update(50);
    await thaw(); await sleep(600); await freeze();
  }

  // А3. значки и подписи: зазор между низом значка и верхом ника не дрожит, пока высота героя дробная (при ходьбе), а ник соседа, которого разводка
  // подписей подняла, не ложится под значки (ряд значков входит в блок подписи: UnitView.blockW, blockH)
  if (want("gap")) {
    setKit(A, ["laststand"]); setKit(B, []);
    W().update(50);
    await waitKits([[idA, ["laststand"]], [idB, []]]);
    const gapOf = (id: string) => run<number | null>(`const v = sc.units.get(a), au = v && v.afxView, it = au && au.insts.find((i) => i.fx.key === 'laststand' && i.role === 4), m = it && it.items[0] && it.items[0][0];
      if (!m || !m.im.visible) return null;
      return +((v.label.y - Math.round(v.label.height)) - (m.im.y + m.im.displayHeight)).toFixed(3);`, id);
    for (const z of [2, 3]) {
      await run("sc.cameras.main.setZoom(a)", z);
      const gaps: (number | null)[] = [];
      for (let f = 0; f < 8; f++) {
        put(A, spot.x + 56, spot.y + f / 8);
        await thaw(); await sleep(250); await freeze();
        await look(spot.x + 28, spot.y - 30);
        await adv(1000);
        gaps.push(await gapOf(idA));
      }
      check(gaps.every((g) => g !== null && Math.abs(g - 1) < 0.01), `зум ${z}: зазор между низом значка и верхом ника всегда 1 px, пока высота героя дробная (шаг 1/8 px): ${gaps.join(" ")}`);
    }
    // сосед: свой герой с рядом значков, рядом чужой вплотную — ник чужого, поднятый разводкой, не налезает на значки
    await run("sc.cameras.main.setZoom(2)");
    setKit(A, ["block"]); setKit(B, ["laststand", "venom"]);
    put(B, spot.x, spot.y); put(A, spot.x + 22, spot.y + 8);
    W().update(50);
    await waitKits([[idA, ["block"]], [idB, ["laststand", "venom"]]]);
    await look(spot.x + 11, spot.y - 30);
    await adv(1500);
    const hit = await run<{ n: number; hits: number; own: number; blockH: number; blockUp: number }>(`const A = sc.units.get(a.A), B = sc.units.get(a.B), au = B.afxView;
      const boxes = au.insts.filter((i) => i.role === 4 && i.fx.layers[0].at === 3).flatMap((i) => i.items.flat()).filter((m) => m.im.visible).map((m) => ({ l: m.im.x + 1, t: m.im.y + 1, r: m.im.x + m.im.displayWidth - 1, b: m.im.y + m.im.displayHeight - 1 }));
      const lab = A.label, lb = { l: lab.x, t: lab.y - lab.height, r: lab.x + lab.width, b: lab.y };
      return { n: boxes.length, hits: boxes.filter((q) => lb.l < q.r && lb.r > q.l && lb.t < q.b && lb.b > q.t).length, own: au.rowH, blockH: B.blockH(), blockUp: B.blockUp };`, { A: idA, B: idB });
    check(hit.n >= 2 && hit.own > 0 && hit.blockH === hit.blockUp + 3 + hit.own, `разводке подписей отдан ряд значков: высота блока ${hit.blockH} = подпись ${hit.blockUp + 3} + ряд ${hit.own}`);
    check(hit.hits === 0, `ник соседа не налезает на значки (пересечений ${hit.hits} из ${hit.n} значков)`);
    const s = await snap(spot.x + 11, spot.y - 30, 160, 110, 100);
    save("gap-z2.png", up(s.png, 3));
    setKit(A, []); setKit(B, []); W().update(50);
    await thaw(); await sleep(600); await freeze();
  }

  // Б. все 65 обозначений в игре: набор ставим на клиенте (в схеме юнита) герою-приманке, снимаем лист
  if (want("gallery")) {
    const keys = await run<string[]>("return afx.fx.map((f) => f.key)");
    // ночное затемнение мира (день и ночь) убираем: листы сравниваются с превью при дневном свете
    const dark = () => run("if (sc.world && sc.world.dark) { sc.world.dark.setVisible(false); sc.world.dark.setAlpha(0); }");
    for (const z of [2, 3]) {
      await run("sc.cameras.main.setZoom(a)", z);
      const cols = z === 2 ? 13 : 10, cw = 64 * z, ch = 84 * z + 14, rows = Math.ceil(keys.length / cols);
      const sheet = new PC(cols * (cw + 2), rows * ch); fill(sheet, BG);
      const cc = { x: Cc.unit.x, y: Cc.unit.y };
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        await run(`const u = net.unit(a.id); const f = afx.byKey.get(a.k); u.fx = f && !f.legacy ? String.fromCharCode(32 + f.idx + 128 * (a.n || 0)) : "";`, { id: idC, k, n: ["rhythm", "shards", "fury", "venom", "leg_frenzy"].includes(k) ? 3 : k === "mortality" ? 2 : 0 });
        await adv(700);
        await dark();
        const s = await snap(cc.x, cc.y - 26, 64, 84, 360);
        const x = (i % cols) * (cw + 2), y = Math.floor(i / cols) * ch;
        for (let yy = 0; yy < s.png.height && yy < ch - 14; yy++) for (let xx = 0; xx < s.png.width && xx < cw; xx++) {
          const si = (yy * s.png.width + xx) * 4, di = ((y + yy) * sheet.w + x + xx) * 4;
          for (let q = 0; q < 4; q++) sheet.data[di + q] = s.png.data[si + q];
        }
        drawText(sheet, k.toUpperCase().replace("@", "_"), x + 3, y + ch - 11, BEIGE);
      }
      sheet.save(path.join(OUT, `gallery-z${z}.png`));
      await run(`net.unit(a).fx = ""`, idC);
    }
    await run("sc.cameras.main.setZoom(2)");
    await adv(800);
    check((await visibleAfx()) <= 2, `после галереи спрайтов обозначений не осталось (${await visibleAfx()})`);
  }

  // В. зоны: знамя храмовника (кольцо у него, эмблема у союзника в круге), огненная стена и круг света — на юнитах внутри
  if (want("zones")) {
    setKit(A, []); setKit(B, []); setKit(Cc, []);
    A.save.skills.tp_banner = 1; Cc.save.skills.mg_firewall = 1;
    const { castSkill } = await import("../server/src/game/skills");
    A.unit.mp = A.unit.maxMp; A.gcdUntil = 0;
    const err = castSkill(W(), A, "tp_banner", A.x + 10, A.y, null);
    check(err === null, `знамя поставлено (${err})`);
    await thaw(); await sleep(1200); await freeze();
    const ka = await keysOnClient(idA), kb = await keysOnClient(idB), kc = await keysOnClient(idC);
    check(ka.includes("tp_banner"), `храмовник со знаменем: ${ka.join(" ")}`);
    check(kb.join() === "zone_banner_solgard", `союзник в круге знамени: ${kb.join(" ")}`);
    check(kc.length === 0, `далёкий герой вне круга: ${kc.join(" ") || "—"}`);
    await adv(700);
    const s = await snap(spot.x + 28, spot.y - 20, 210, 120, 200);
    save("banner-z2.png", up(s.png, 2));
    await sleep(100);
    // огонь: моб рядом с магом в стене
    const { Mob } = await import("../server/src/game/Mob");
    const { MOBS } = await import("../shared/mobs");
    put(Cc, spot.x, spot.y - 150);
    const mob = W().addMob(new Mob(W().uid("m"), MOBS.goblin_slasher, 5, { x: Cc.x + 40, y: Cc.y }));
    mob.slowUntil = long();
    Cc.unit.mp = Cc.unit.maxMp; Cc.gcdUntil = 0;
    const e2 = castSkill(W(), Cc, "mg_firewall", mob.x, mob.y, null);
    check(e2 === null, `стена огня поставлена (${e2})`);
    await thaw(); await sleep(900); await freeze();
    const km = await run<string[]>("const u = net.unit(a); return u ? [...u.fx].map((c) => afx.fx[(c.charCodeAt(0) - 32) & 127].key) : null", mob.id);
    check(!!km && km.includes("zone_fire") && km.includes("slow"), `моб в стене огня: ${km?.join(" ")}`);
    if (km) { await adv(500); const sm = await snap(Cc.x + 20, Cc.y - 14, 160, 100, 300); save("firewall-z2.png", up(sm.png, 2)); }
    setKit(A, []); mob.stunUntil = 0;
  }

  // Г. скрытный игрок: обозначений нет; потом вышел из скрытности — появились
  if (want("stealth")) {
    const botR = await mk("afx_r", "Тень", "rogue");
    const R = heroOf("Тень");
    put(R, spot.x + 110, spot.y + 40);
    setKit(R, ["haste", "block", "stealth"]);
    await thaw(); await sleep(1500); await freeze();
    await look(R.x, R.y - 20);
    await adv(500);
    // с B40 (2026-10-30) сервер не шлёт врага-невидимку вовсе: юнита на клиенте нет — это тоже «невидим»
    const v = await run<{ unseen: boolean; n: number }>("const v = sc.units.get(a); return v ? { unseen: v.unseen, n: v.afxView ? v.afxView.insts.length : 0 } : { unseen: true, n: 0 }", botR.id);
    const imgs = (await stateOf(botR.id)).reduce((q, i) => q + i.imgs, 0);
    check(v.unseen && imgs === 0, `скрытый чужой игрок невидим, обозначений нет (unseen ${v.unseen}, спрайтов ${imgs})`);
    setKit(R, ["haste", "block"]);
    await thaw(); await sleep(1500); await freeze();
    await look(R.x, R.y - 20);
    await adv(700);
    const imgs2 = (await stateOf(botR.id)).reduce((q, i) => q + i.imgs, 0);
    check(imgs2 >= 2, `вышел из скрытности — обозначения появились (спрайтов ${imgs2})`);
    setKit(R, []);
    await botR.leave();
  }
  void botA; void botC;

  // Е. маунт: пыль за копытами только в движении (обозначение mount), у стоящего всадника её нет; зеркалится по взгляду
  if (want("mount")) {
    setKit(A, []); setKit(B, []); setKit(Cc, []);
    await run("sc.cameras.main.setZoom(2);");
    await look(Cc.x, Cc.y - 20);
    await run("const u = net.unit(a); u.mount = 'horse'; u.anim = 0; u.dir = 3;", idC);
    await adv(600);
    const still = (await stateOf(idC)).find((i) => i.k === "mount");
    check(!!still && still.imgs === 0, `верховой стоит — пыли нет (обозначение есть: ${!!still}, спрайтов ${still?.imgs ?? 0})`);
    await run("const u = net.unit(a); u.anim = 1;", idC);
    await adv(800);
    const moving = (await stateOf(idC)).find((i) => i.k === "mount");
    check(!!moving && moving.imgs >= 1, `верховой бежит — пыль за копытами (спрайтов ${moving?.imgs ?? 0})`);
    const sm = await snap(Cc.x, Cc.y - 20, 120, 100, 200);
    save("mount-z2.png", up(sm.png, 3));
    // пыль идёт назад от взгляда: смотрит вправо — слева от всадника, влево — справа
    const dust = (dir: number) => run<{ dx: number }>(`const u = net.unit(a.id); u.dir = a.dir; window.__adv(400); const v = sc.units.get(a.id), m = v.afxView.insts.find((i) => i.fx.key === 'mount').items[0][0].im; return { dx: m.x + m.displayWidth / 2 - v.x };`, { id: idC, dir });
    const right = await dust(3), left = await dust(2);
    check(right.dx < 0 && left.dx > 0, `пыль за копытами по взгляду: вправо — слева от всадника (${right.dx.toFixed(1)}), влево — справа (${left.dx.toFixed(1)})`);
    await run("const u = net.unit(a); u.mount = ''; u.anim = 0;", idC);
    await adv(800);
    check(((await stateOf(idC)).find((i) => i.k === "mount")?.imgs ?? 0) === 0, "слез с маунта — пыли нет");
  }

  // Д. толпа и кадры в секунду: 20 героев в кадре. Толпа (больше 6 героев): у чужих союзников остаётся круг (бледнее), купол блока и инвулна,
  // оглушение, скрытность, «вне закона»; у своего героя — всё. Затем кадры в секунду: эффекты есть и сняты, правила толпы включены и выключены
  if (want("crowd") || want("fps")) {
    const SOL: ClassId[] = ["warrior", "healer", "mage", "rogue", "ranger"], UMB: ClassId[] = ["deathknight", "bloodweaver", "darkranger", "warlock", "reaver"];
    const bots: { b: Bot; p: Player; cls: ClassId }[] = [];
    for (let i = 0; i < 18; i++) {
      const cls = (i % 2 ? UMB : SOL)[Math.floor(i / 2) % 5];
      const name = `Бот${i + 1}`;
      const b = await Bot.enter(await ensureChar(`afx_b${i}`, PASS, name, cls), name);
      bots.push({ b, p: heroOf(name), cls });
    }
    setKit(A, []); setKit(B, []); setKit(Cc, []);
    const cx = spot.x + 20, cy = spot.y + 30;
    const members: Player[] = [B, A, Cc, ...bots.map((x) => x.p)];
    members.forEach((p, i) => put(p, cx + (i % 5 - 2) * 52, cy + (Math.floor(i / 5) - 1.5) * 38));
    const RING = ["root", "slow", "frenzy"], DOME = ["shield", "block", "bone"], OV = ["laststand", "renew", "bond", "bleed", "poison", "burn", "curse", "weak", "venom", "critnext", "stun", "haste", "warcry"];
    const kitFor = (i: number) => [RING[i % 3], DOME[(i + 1) % 3], OV[i % OV.length], OV[(i * 5 + 3) % OV.length], OV[(i * 7 + 5) % OV.length]];
    const arm = (on: boolean) => members.forEach((p, i) => setKit(p, on ? kitFor(i) : []));
    await run("sc.cameras.main.setZoom(2);");
    if (want("crowd")) {
      arm(true);
      await thaw(); await sleep(1800); await freeze();
      await look(cx, cy - 10);
      await adv(900);
      const ids = [Cc.id, A.id, ...bots.filter((x) => SOL.includes(x.cls)).map((x) => x.b.id)];
      const crowd = await run<boolean>("return Math.max(0, 0) === 0 && sc.units.size > afx.crowd");
      check(crowd, "в кадре больше 6 героев — включены правила толпы");
      let okAll = true, sample = "";
      for (const id of ids) {
        const st = await stateOf(id), w = st.filter((i) => i.want);
        // круг (любой, один) и бусины, купол только блока или инвулна, значки и частицы — только оглушение, скрытность, «вне закона»
        const allowed = w.every((i) => i.role === 1 || i.role === 2 || (i.role === 3 ? ["block", "invuln"].includes(i.k) : ["stun", "stealth", "outlaw"].includes(i.k)));
        const ring = w.filter((i) => i.role === 1).length <= 1 && w.filter((i) => i.role === 3).length <= 1 && w.filter((i) => i.role === 4).length <= 2;
        if (!allowed || !ring) { okAll = false; sample = `${id}: ${w.map((i) => `${i.k}:${i.role}`).join(" ")}`; }
      }
      check(okAll, `толпа: у чужих союзников только круг, купол блока/инвулна и оглушение${sample ? " — нарушено " + sample : ""}`);
      // враги (чужая фракция): только оглушение, корни, «вне закона»
      let foesOk = true, foeSample = "";
      for (const x of bots.filter((q) => UMB.includes(q.cls))) {
        const w = (await stateOf(x.b.id)).filter((i) => i.want);
        if (!w.every((i) => ["stun", "root", "outlaw"].includes(i.k))) { foesOk = false; foeSample = `${x.b.id}: ${w.map((i) => i.k).join(" ")}`; }
      }
      check(foesOk, `толпа: у врагов только оглушение, корни, «вне закона»${foeSample ? " — нарушено " + foeSample : ""}`);
      const mine = (await stateOf(idB)).filter((i) => i.want);
      check(mine.length >= 4, `у своего героя в толпе правила слотов, а не толпы: ${mine.map((i) => `${i.k}:${i.role}`).join(" ")}`);
      const s = await snap(cx, cy - 10, 330, 210, 200);
      save("crowd-z2.png", up(s.png, 1));
    }
    if (want("fps")) {
      await thaw();
      // кадры по requestAnimationFrame и время кадра на стороне JS (от prestep до postrender: обновление сцены и команды отрисовки, без ожидания видеокарты)
      await run(`window.__cpu = { sum: 0, n: 0, t: 0 };
        window.__game.events.on("prestep", () => { window.__cpu.t = performance.now(); });
        window.__game.events.on("postrender", () => { window.__cpu.sum += performance.now() - window.__cpu.t; window.__cpu.n++; });
        window.__fps = (ms) => new Promise((res) => { const dts = []; let last = performance.now(); const t0 = last; window.__cpu.sum = 0; window.__cpu.n = 0; const f = (t) => { dts.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else { dts.sort((x, y) => x - y); const n = dts.length; res({ n, fps: n / ((t - t0) / 1000), p50: dts[n >> 1], p95: dts[Math.floor(n * 0.95)], max: dts[n - 1], cpu: window.__cpu.sum / Math.max(1, window.__cpu.n) }); } }; requestAnimationFrame(f); });`);
      type Fps = { n: number; fps: number; p50: number; p95: number; max: number; cpu: number };
      const modes: { name: string; on: boolean; crowd: number }[] = [
        { name: "без эффектов", on: false, crowd: 6 },
        { name: "с эффектами (правила толпы)", on: true, crowd: 6 },
        { name: "с эффектами (полные наборы)", on: true, crowd: 999 },
      ];
      const res: Record<string, Fps[]> = {};
      const jsMs: Record<string, number> = {};
      const listBefore = await run<number>("return sc.children.length");
      // порядок режимов сдвигается каждый раунд (нагрузка машины со временем не смещает один режим), сравнение — по лучшему раунду: помехи только занижают кадры
      for (let round = 0; round < 3; round++) for (const m of modes.map((_, i) => modes[(i + round) % modes.length])) {
        arm(m.on);
        await run("afx.crowd = a", m.crowd);
        await sleep(1800);
        // стоимость самого модуля за кадр: обёртка вокруг UnitAuras.update
        await run(`const P = [...sc.units.values()].map((v) => v.afxView).find(Boolean); window.__afxMs = 0; window.__afxN = 0;
          if (P && !window.__wrapped) { window.__wrapped = true; const proto = Object.getPrototypeOf(P), o = proto.update; proto.update = function (...x) { const t = performance.now(); const r = o.apply(this, x); window.__afxMs += performance.now() - t; window.__afxN++; return r; }; }`);
        const r = await run<Fps>("return await window.__fps(a)", SECS * 1000);
        const js = await run<{ ms: number; n: number }>("return { ms: window.__afxMs, n: window.__afxN }");
        (res[m.name] ??= []).push(r);
        jsMs[m.name] = Math.round((js.ms / Math.max(1, r.n)) * 1000) / 1000;
        console.log(`  ${m.name}, раунд ${round + 1}: ${r.fps.toFixed(1)} к/с, кадр p50 ${r.p50.toFixed(1)} мс p95 ${r.p95.toFixed(1)} мс; JS на кадр ${r.cpu.toFixed(2)} мс, из них модуль ${jsMs[m.name]} мс`);
      }
      const med = (a: number[]) => [...a].sort((x, y) => y - x)[0];   // лучший раунд
      const base = med(res["без эффектов"].map((r) => r.fps));
      const medLow = (a: number[]) => [...a].sort((x, y) => x - y)[0];   // у времени кадра на JS лучший раунд — наименьший
      const baseCpu = medLow(res["без эффектов"].map((r) => r.cpu));
      for (const m of modes.slice(1)) {
        const f = med(res[m.name].map((r) => r.fps)), drop = ((base - f) / base) * 100, cpu = medLow(res[m.name].map((r) => r.cpu));
        report[`fps ${m.name}`] = { base: +base.toFixed(2), with: +f.toFixed(2), dropPct: +drop.toFixed(1), jsMsBase: +baseCpu.toFixed(2), jsMsWith: +cpu.toFixed(2), moduleMsPerFrame: jsMs[m.name], rounds: res[m.name].map((r) => +r.fps.toFixed(1)) };
        // при 3–5 к/с (Chrome без окна под нагрузкой, кадр 230–250 мс) к/с квантуется шагом ~7 % и гуляет между раундами —
        // тогда судим по времени самого модуля: оно должно быть < 1 % кадра (2026-10-31)
        const slowGpu = base < 15, modOk = jsMs[m.name] < (1000 / base) * 0.01;
        check(drop <= 5 || (slowGpu && modOk), `20 юнитов, ${m.name}: ${f.toFixed(1)} к/с против ${base.toFixed(1)} без эффектов (потеря ${drop.toFixed(1)} %, допуск 5 %, лучший из 3 раундов); JS на кадр ${cpu.toFixed(2)} мс против ${baseCpu.toFixed(2)} мс`);
      }
      // без аллокаций в кадре: выборочный профиль кучи (включая уже собранные объекты) за 3 с с полными наборами — байты, выделенные кодом auraFx.ts
      try {
        arm(true);
        await run("afx.crowd = 999");
        await sleep(1500);
        const cdp = await page.createCDPSession();
        await cdp.send("HeapProfiler.enable");
        const heap = async (ms: number) => {
          await cdp.send("HeapProfiler.startSampling", { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } as never);
          await sleep(ms);
          type Node = { callFrame: { url: string; functionName: string; lineNumber: number }; selfSize: number; children: Node[] };
          const { profile } = (await cdp.send("HeapProfiler.stopSampling")) as unknown as { profile: { head: Node } };
          const by: Record<string, number> = {};
          const walk = (n: Node) => {
            const u = (n.callFrame.url.split("/").pop() ?? "").split("?")[0] || "(нативный)";
            by[u] = (by[u] ?? 0) + n.selfSize;
            if (u === "auraFx.ts" && n.selfSize) by[`auraFx.ts:${n.callFrame.functionName || "?"}:${n.callFrame.lineNumber}`] = (by[`auraFx.ts:${n.callFrame.functionName || "?"}:${n.callFrame.lineNumber}`] ?? 0) + n.selfSize;
            for (const c of n.children) walk(c);
          };
          walk(profile.head);
          return by;
        };
        const withFx = await heap(3000);
        arm(false);
        await sleep(1500);
        const without = await heap(3000);
        await cdp.send("HeapProfiler.disable");
        const kb = (b: number) => Math.round(b / 102.4) / 10;
        const files = Object.entries(withFx).filter(([k]) => !k.startsWith("auraFx.ts:")), sites = Object.entries(withFx).filter(([k]) => k.startsWith("auraFx.ts:"));
        const mine = withFx["auraFx.ts"] ?? 0, total = files.reduce((q, [, x]) => q + x, 0), totalWithout = Object.entries(without).filter(([k]) => !k.startsWith("auraFx.ts:")).reduce((q, [, x]) => q + x, 0);
        report.heap = { auraFxBytes3s: mine, totalBytes3sWithFx: total, totalBytes3sWithout: totalWithout, top: files.sort((x, y) => y[1] - x[1]).slice(0, 6), auraFxSites: sites.sort((x, y) => y[1] - x[1]).slice(0, 8) };
        check(mine <= 0.02 * total, `auraFx.ts за 3 с с полными наборами на 20 юнитах выделил ${kb(mine)} КБ — ${((100 * mine) / total).toFixed(2)} % выделений игры (${kb(total)} КБ с эффектами, ${kb(totalWithout)} КБ без): только упаковка дробных чисел в аргументах сеттеров, ни объектов, ни массивов, ни замыканий в кадре`);
      } catch (e) { lines.push(`пропуск профиля кучи: ${String(e).slice(0, 200)}`); }
      const listAfter = await run<number>("return sc.children.length");
      check(listAfter <= listBefore + 130, `после циклов «наложить и снять» объектов сцены ${listAfter} (было ${listBefore}): спрайты возвращаются в пул, без утечек`);
      report["fps без эффектов"] = res["без эффектов"].map((r) => +r.fps.toFixed(1));
      report.gpu = GPU;
      await run("afx.crowd = 6");
    }
    for (const x of bots) await x.b.leave().catch(() => {});
  }
}

main().catch(async (e) => { console.error(e); process.exit(1); });
async function main() {
  await startServer();
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: [...(GPU ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]), `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await scenario();
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext/i.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    lines.push(`EXC ${String((e as Error)?.stack ?? e).slice(0, 1200)}`);
    console.log(lines[lines.length - 1]);
    bad++;
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, ONLY.size ? `report-${[...ONLY].join("+")}${GPU ? "-gpu" : ""}.json` : "report.json"), JSON.stringify({ ...report, gpu: GPU, lines, errors: errors.slice(0, 20) }, null, 1));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nОбозначения в игре: все проверки пройдены");
  process.exit(bad ? 1 : 0);
}
