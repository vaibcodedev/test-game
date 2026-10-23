/**
 * Браузерная проверка прицела (задача 115, шаг 6): лекарь лечит союзника под курсором, не меняя цель;
 * метеор с превью ложится в курсор, зажатый дальностью; Esc отменяет прицел.
 * AIM_SHOTS=<фаза> (задача 133): ещё снимки превью на зуме 2 и 3 в tools/out/aim133/<фаза> — тихий берег (метеор, шар, стена огня, мерцание в воду)
 * и стены подземелья (метеор, мерцание и шар за стену). Фазы s2… (шаг 2) — по сцене на каждую форму: стена огня, шар в моба, полоса до стены,
 * веер, конус, мерцание к воде, знамя, призыв на воду, капкан на воду, нова вокруг себя, Рывок к мобу и через воду, «Теневой шаг», «Хватка»
 * с «Железными цепями», рой на пачку, «Эгида» на союзника, «Сияние» (маг, егерь, ассасин, тёмный следопыт, храмовник, рыцарь смерти,
 * чернокнижник, клирик). Курсор каждого снимка проверяется: над интерфейсом — падение (превью тогда не по курсору).
 * Запуск: TEST_PORT=2799 VITE_TEST_PORT=5199 npx tsx tests/aim-screens.ts
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { MAP_SEED, TILE } from "../shared/constants";
import { CELL_WALL, generateMap, isTownZone, lineClear, T, walkable, zoneAtPx, type WorldMap } from "../shared/map";
import { SKILLS } from "../shared/skills";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5199;
const MAP = generateMap(MAP_SEED);
const town = MAP.playerSpawn;
const sp = MAP.spawns.filter((s) => s.mob === "slime").sort((a, b) => Math.hypot(a.x - town.x, a.y - town.y) - Math.hypot(b.x - town.x, b.y - town.y))[0];
const SHOTS = process.env.AIM_SHOTS ?? "";
const SHOT_DIR = process.env.AIM_OUT ? path.resolve(process.env.AIM_OUT) : path.resolve("tools/out/aim133", SHOTS || "_");

const mobsNear = (m: WorldMap, x: number, y: number, r: number) => m.spawns.reduce((n, s) => n + (Math.hypot(s.x - x, s.y - y) < r ? 1 : 0), 0);
const openAround = (m: WorldMap, x: number, y: number, r: number) => [0, 1, 2, 3, 4, 5, 6, 7].every((k) => walkable(m, x + Math.cos(k) * r, y + Math.sin(k) * r, 10));
/** Вода в клетке: все четыре угла клетки — вода (вершины поверхности, dual grid). */
const isWater = (m: WorldMap, px: number, py: number) => {
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE), W = m.w + 1;
  return [0, 1].every((j) => [0, 1].every((i) => m.vtx[(ty + j) * W + tx + i] === T.Water));
};
/** Тихий берег: вокруг героя суша, в 70 px справа вода, за ней видимость; мобов нет в 700 px, не город. */
function waterScene(m: WorldMap) {
  for (let ty = 30; ty < m.h - 30; ty += 2) for (let tx = 30; tx < m.w - 30; tx += 2) {
    const x = tx * TILE + 16, y = ty * TILE + 16, wx = x + 70;
    if (!walkable(m, x, y, 14) || walkable(m, wx, y, 10) || !isWater(m, wx, y) || !isWater(m, wx + 40, y) || m.cell[Math.floor(y / TILE) * m.w + Math.floor(wx / TILE)] & CELL_WALL) continue;
    if (!lineClear(m, x, y, x + 190, y) || !openAround(m, x - 40, y, 20) || isTownZone(zoneAtPx(m, x, y)) || mobsNear(m, x, y, 700)) continue;
    return { x, y };
  }
  throw new Error("нет тихого берега");
}
/** Интерфейс поверх поля в окне 1280×800 (с запасом): панель героя, чат, мини-карта с кнопками, панель умений. Курсор над ним — overUi, превью не по курсору. */
const UI_RECTS = [[0, 0, 300, 240], [0, 460, 420, 800], [1030, 0, 1280, 300], [210, 700, 1070, 800]];
/** Точка (dx, dy) от героя (центр экрана) на зуме 2 и 3 — над полем, не за краем окна и не под интерфейсом. */
const onField = (dx: number, dy: number) => [2, 3].every((z) => {
  const x = 640 + dx * z, y = 400 + dy * z;
  return x > 16 && x < 1264 && y > 16 && y < 784 && !UI_RECTS.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
});
/** Стены подземелья (стены есть только там): герой на открытом месте (босс дальше 450 px, мобов рядом меньше всего), за стеной в 160 px — проходимая точка без видимости;
 *  точка за стеной — над полем на обоих зумах (под чатом курсор уходит в интерфейс, и снимок показывает не тот прицел). */
function wallScene(m: WorldMap) {
  let x0 = m.w, y0 = m.h, x1 = -1, y1 = -1;
  for (let i = 0; i < m.cell.length; i++) if (m.cell[i] & CELL_WALL) { const tx = i % m.w, ty = (i / m.w) | 0; x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx); y1 = Math.max(y1, ty); }
  let best: { x: number; y: number; qx: number; qy: number; score: number } | null = null;
  for (let ty = Math.max(2, y0 - 4); ty <= Math.min(m.h - 3, y1 + 4); ty++) for (let tx = Math.max(2, x0 - 4); tx <= Math.min(m.w - 3, x1 + 4); tx++) {
    const x = tx * TILE + 16, y = ty * TILE + 16;
    if (!walkable(m, x, y, 14) || !openAround(m, x, y, 30) || Math.min(...m.bosses.map((b) => Math.hypot(b.x - x, b.y - y))) < 450) continue;
    for (let b = 0; b < Math.PI * 2; b += Math.PI / 8) {
      const qx = Math.round(x + Math.cos(b) * 160), qy = Math.round(y + Math.sin(b) * 160);
      if (!onField(qx - x, qy - y) || !walkable(m, qx, qy, 12) || lineClear(m, x, y, qx, qy)) continue;
      const score = mobsNear(m, x, y, 250) * 1000 + mobsNear(m, x, y, 400) * 50 + mobsNear(m, x, y, 700);
      if (!best || score < best.score) best = { x, y, qx, qy, score };
      break;
    }
  }
  if (!best) throw new Error("нет стены");
  return best;
}
/** Моб для шара с целью: спавн слизня (агро 120) вне города, других мобов в 300 px нет; герой в 170 px к западу на открытом месте и видит спавн. */
function mobScene(m: WorldMap) {
  for (const s of m.spawns) {
    if (s.mob !== "slime") continue;
    const x = Math.round(s.x - 170), y = Math.round(s.y);
    if (isTownZone(zoneAtPx(m, x, y)) || isTownZone(zoneAtPx(m, s.x, s.y)) || !walkable(m, x, y, 14) || !openAround(m, x, y, 30) || !lineClear(m, x, y, s.x, s.y)) continue;
    if (mobsNear(m, s.x, s.y, 300) > 1 || Math.min(...m.bosses.map((b) => Math.hypot(b.x - x, b.y - y))) < 600) continue;
    return { x, y, mx: s.x, my: s.y };
  }
  throw new Error("нет одинокого слизня");
}
/** Пачка для роя (круг 130): 3 и больше спавнов в 140 px от первого (спавны стоят не ближе 90 px друг к другу; вне города, босс дальше 600 px);
 *  герой в 150–190 px от их середины (8 сторон) на открытом месте, середина видна от героя и над полем на обоих зумах. */
function packScene(m: WorldMap) {
  for (const s of m.spawns) {
    if (isTownZone(zoneAtPx(m, s.x, s.y))) continue;
    const near = m.spawns.filter((q) => Math.hypot(q.x - s.x, q.y - s.y) < 140);
    if (near.length < 3) continue;
    const cx = Math.round(near.reduce((a, q) => a + q.x, 0) / near.length), cy = Math.round(near.reduce((a, q) => a + q.y, 0) / near.length);
    if (Math.min(...m.bosses.map((b) => Math.hypot(b.x - cx, b.y - cy))) < 600) continue;
    for (let k = 0; k < 8; k++) for (const d of [150, 170, 190]) {
      const a = (k / 8) * Math.PI * 2, x = Math.round(cx - Math.cos(a) * d), y = Math.round(cy - Math.sin(a) * d);
      if (isTownZone(zoneAtPx(m, x, y)) || !walkable(m, x, y, 14) || !openAround(m, x, y, 20) || !lineClear(m, x, y, cx, cy) || !onField(cx - x, cy - y)) continue;
      return { x, y, cx, cy };
    }
  }
  throw new Error("нет пачки мобов");
}
/** Суша за водой у тихого берега W на линии героя (видна, над полем на обоих зумах): там встанет герой-враг для Рывка через воду; нет — null. */
function acrossWater(m: WorldMap, W: { x: number; y: number }) {
  for (let d = 120; d <= 240; d += 4) if (walkable(m, W.x + d, W.y, 12) && lineClear(m, W.x, W.y, W.x + d, W.y) && onField(d, -10)) return { x: W.x + d, y: W.y };
  return null;
}
/** Союзник у тихого берега: суша рядом с W, видна от героя и над полем на обоих зумах — для «Эгиды» и «Сияния». */
function allySpot(m: WorldMap, W: { x: number; y: number }) {
  for (const [dx, dy] of [[60, 50], [40, 70], [-60, 60], [80, -50], [-70, -40]]) {
    const x = W.x + dx, y = W.y + dy;
    if (walkable(m, x, y, 12) && lineClear(m, W.x, W.y, x, y) && onField(dx, dy) && onField(dx, dy - 10)) return { x, y };
  }
  throw new Error("нет места для союзника у берега");
}

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}
const sent = (page: Page, type: string) => page.evaluate((t) => ((window as any).__sent as [string, any][]).filter((m) => m[0] === t).map((m) => m[1]), type);
const clear = (page: Page) => page.evaluate(() => { (window as any).__sent.length = 0; });
/** Опрос условия раз в 50 мс до таймаута (вместо фиксированной паузы: под нагрузкой клиент и сервер отвечают позже). */
async function waitCond(fn: () => Promise<boolean>, ms: number, what: string) {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error("таймаут: " + what);
    await sleep(50);
  }
}
const aimId = (page: Page) => page.evaluate(`(() => { const s = (window.__game.scene.getScene('game')); return s.aimState ? s.aimState.id : null; })()`) as Promise<string | null>;
const atPos = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = (window.__game.scene.getScene('game')); return !!s.me && Math.hypot(s.pos.x - ${x}, s.pos.y - ${y}) < 2 && Math.hypot(s.me.x - ${x}, s.me.y - ${y}) < 2; })()`) as Promise<boolean>;
const skillsSent = async (page: Page) => (await sent(page, "skill")).length;
const scene = "(window.__game.scene.getScene('game'))";

async function enter(browser: Browser, name: string): Promise<Page> {
  const ctx = await (browser as any).createBrowserContext();
  const page: Page = await ctx.newPage();
  // ошибка страницы — с героем и местом (герой, камера, масштаб): иначе видно только падение ожидания телепорта
  page.on("pageerror", (e) => {
    page.evaluate(`(() => { const s = window.__game?.scene?.getScene("game"), c = s?.cameras?.main; return s && c ? { pos: s.pos, view: [c.worldView.x, c.worldView.y, c.worldView.width, c.worldView.height], zoom: c.zoom } : null; })()`)
      .then((where) => console.log(`  ошибка страницы у ${name}: ${String(e).slice(0, 160)} — ${JSON.stringify(where)}`)).catch(() => {});
  });
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login-name", { visible: true, timeout: 10000 });
  await page.type("#login-name", name);
  await page.type("#login-pass", "secret");
  await page.click("#login-go");
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 15000 }).catch(async (e) => { console.log((await page.evaluate(() => document.body.innerText)).slice(0, 400)); throw e; });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await page.click('.cs-list [data-a="play"]');
  // вход в мир под нагрузкой (параллельные прогоны других задач) бывает дольше полутора минут
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game") && (window as any).__net?.online && !!(window as any).__net?.self, { timeout: 180000 });
  await sleep(800);
  await page.evaluate(() => {
    const w = window as any, net = w.__net, orig = net.send.bind(net);
    w.__sent = [];
    net.send = (t: string, m?: unknown) => { w.__sent.push([t, m]); return orig(t, m); };
  });
  return page;
}
/** Экранные координаты точки мира. */
const toClient = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = ${scene}, c = s.cameras.main, r = s.game.canvas.getBoundingClientRect();
  return { x: r.left + (${x} - c.worldView.x) * (r.width / c.worldView.width), y: r.top + (${y} - c.worldView.y) * (r.height / c.worldView.height) }; })()`) as Promise<{ x: number; y: number }>;
const state = (page: Page) => page.evaluate(`(() => { const s = ${scene}; return { x: s.pos.x, y: s.pos.y, target: s.targetId, aim: s.aimState ? s.aimState.id : null, cur: s.cameras.main.getWorldPoint(s.input.activePointer.x, s.input.activePointer.y), ui: s.overUi }; })()`) as Promise<{ x: number; y: number; target: string | null; aim: string | null; cur: { x: number; y: number }; ui: boolean }>;
const keyFor = async (page: Page, skill: string) => {
  const i = await page.evaluate((id) => (window as any).__net.self.bars[0].findIndex((r: any) => r && r.s === id), skill);
  if (i < 0) throw new Error("умения нет на панели: " + skill);
  const label = await page.$eval(`.hb-slot[data-bar="0"][data-i="${i}"] kbd`, (e) => e.textContent ?? "");
  return /^\d$/.test(label) ? `Digit${label}` : `Key${label}`;
};

/** Масштаб 2–3 колесом над полем (шаг 0,25), как игрок. */
async function setZoom(page: Page, z: number) {
  for (let i = 0; i < 10; i++) {
    const css = (await page.evaluate(`${scene}.css`)) as number;
    if (Math.abs(css - z) < 1e-9) return;
    await page.evaluate((dy) => { const c = (window as any).__game.canvas as HTMLCanvasElement; c.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true })); }, css < z ? -100 : 100);
    await waitCond(async () => Math.abs(((await page.evaluate(`${scene}.css`)) as number) - css) > 1e-9, 1000, "смена масштаба").catch(() => {});
  }
  throw new Error("масштаб не сменился на " + z);
}
/** Курсор над интерфейсом — превью строится не по курсору (по взгляду или цели): такой снимок показывал бы не тот прицел. */
async function mustOverField(page: Page, name: string) {
  const st = await state(page);
  if (st.ui) throw new Error(`снимок ${name}: курсор над интерфейсом — превью не по курсору; возьмите точку над полем (onField)`);
}
/** Снимок превью: курсор в точку мира (corner — в угол поля), клавиша умения зажата, снимок, Esc снимает прицел без каста. */
async function shot(page: Page, skill: string, at: { x: number; y: number } | "corner", name: string) {
  if (await page.evaluate(`!!${scene}.me?.dead`)) throw new Error(`герой погиб до снимка ${name}`);
  await page.evaluate(() => (window as any).__net.send("dbg", { op: "god" }));
  const key = await keyFor(page, skill);
  // угол — правый нижний над полем (не над панелью и чатом): на зуме 2 дальше дальности метеора
  const c = at === "corner" ? { x: 1272, y: 704 } : await toClient(page, at.x, at.y);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await sleep(250);
  await mustOverField(page, name);
  await page.keyboard.down(key as any);
  // снимок — когда прицел уже на поле (мягко: без прицела снимок всё равно делается, как раньше)
  await waitCond(async () => (await aimId(page)) === skill, 2000, "прицел " + skill).catch(() => {});
  await page.screenshot({ path: path.join(SHOT_DIR, name + ".png") as `${string}.png` });
  await page.keyboard.press("Escape");
  await page.keyboard.up(key as any);
  await waitCond(async () => (await aimId(page)) === null, 1000, "снятие прицела").catch(() => {});
}
/** Снимки превью (AIM_SHOTS): маг учит «Огненную стену» (шар до 3 ранга), берег и стены подземелья на зуме 2 и 3. */
async function shots(page: Page) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const W = waterScene(MAP), D = wallScene(MAP);
  console.log(`  снимки: берег (${W.x}, ${W.y}), стена (${D.x}, ${D.y}) → (${D.qx}, ${D.qy})`);
  for (const id of ["fireball", "fireball", "mg_firewall"]) { await page.evaluate((i) => (window as any).__net.send("learn", { id: i }), id); await sleep(250); }
  await page.waitForFunction(() => ((window as any).__net.self.skills.mg_firewall || 0) > 0, { timeout: 5000 });
  const has = await page.evaluate(() => (window as any).__net.self.bars[0].some((r: any) => r && r.s === "mg_firewall"));
  if (!has) {
    const free = await page.evaluate(() => (window as any).__net.self.bars[0].findIndex((r: any) => !r));
    await page.evaluate((i) => (window as any).__net.send("bars:set", { bar: 0, i, ref: { s: "mg_firewall" } }), free < 0 ? 9 : free);
    await page.waitForFunction(() => (window as any).__net.self.bars[0].some((r: any) => r && r.s === "mg_firewall"), { timeout: 5000 });
  }
  // после телепорта ждём, пока предсказание и спрайт встанут на место, а камера (lerp 0,15, округление до пикселя — может замереть
  // в нескольких пикселях от героя) перестанет двигаться 4 опроса подряд рядом с героем: иначе снимок с поля не по центру
  const tp = async (p: { x: number; y: number }) => {
    await page.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [p.x, p.y]);
    await page.waitForFunction(([x, y]) => {
      const w = window as any, s = w.__game.scene.getScene("game"), c = s.cameras.main, me = s.me;
      if (!me || Math.hypot(s.pos.x - x, s.pos.y - y) >= 2 || Math.hypot(me.x - x, me.y - y) >= 2) { w.__camN = 0; return false; }
      const k = `${c.midPoint.x.toFixed(1)},${c.midPoint.y.toFixed(1)}`;
      w.__camN = k === w.__camK ? (w.__camN || 0) + 1 : 0;
      w.__camK = k;
      return w.__camN >= 4 && Math.abs(c.midPoint.x - me.x) < 24 && Math.abs(c.midPoint.y - me.y) < 24;
    }, { timeout: 30000, polling: 100 }, [p.x, p.y]).catch(async (e) => {
      console.log("  не встали:", JSON.stringify(await page.evaluate(`(() => { const s = ${scene}, c = s.cameras.main, me = s.me; return { pos: s.pos, me: me && { x: me.x, y: me.y }, mid: { x: c.midPoint.x, y: c.midPoint.y }, srv: window.__net.self && { x: window.__net.self.x, y: window.__net.self.y } }; })()`)));
      throw e;
    });
    await sleep(400);
  };
  for (const z of [2, 3]) {
    await setZoom(page, z);
    await tp(W);
    await page.evaluate(() => (window as any).__net.send("dbg", { op: "god" }));
    await shot(page, "meteor", { x: W.x + 150, y: W.y + 40 }, `meteor-near-z${z}`);
    await shot(page, "meteor", "corner", `meteor-far-z${z}`);
    await shot(page, "fireball", { x: W.x + 120, y: W.y - 60 }, `fireball-z${z}`);
    await shot(page, "mg_firewall", { x: W.x + 140, y: W.y + 30 }, `firewall-z${z}`);
    await shot(page, "blink", { x: W.x + 190, y: W.y }, `blink-water-z${z}`);
    await tp(D);
    await page.evaluate(() => (window as any).__net.send("dbg", { op: "god" }));
    await shot(page, "meteor", { x: D.qx, y: D.qy }, `meteor-wall-z${z}`);
    await shot(page, "blink", { x: D.qx, y: D.qy }, `blink-wall-z${z}`);
    await shot(page, "fireball", { x: D.qx, y: D.qy }, `fireball-wall-z${z}`);
    console.log(`  ok   снимки превью на зуме ${z}: ${SHOT_DIR}`);
  }
  await setZoom(page, 2);
}

/** Изучить умения с требованиями дерева (ранги), в порядке зависимостей; ждём, пока изучены все. */
async function learnAll(page: Page, ids: string[]) {
  const need = new Map<string, number>();
  const add = (id: string, rank: number) => { const d = SKILLS[id]; if (d.req) add(d.req.id, d.req.rank); need.set(id, Math.max(need.get(id) ?? 0, rank)); };
  for (const id of ids) add(id, 1);
  const have = (await page.evaluate(() => ({ ...(window as any).__net.self.skills }))) as Record<string, number>;
  for (const [id, r] of need) for (let i = have[id] ?? 0; i < r; i++) await page.evaluate((s) => (window as any).__net.send("learn", { id: s }), id);
  await page.waitForFunction((list: [string, number][]) => list.every(([id, r]) => ((window as any).__net.self.skills[id] || 0) >= r), { timeout: 8000 }, [...need]);
}
/** Умения — на первую панель (свободные ячейки, иначе с конца, не трогая нужные). */
async function onBar(page: Page, ids: string[]) {
  for (const id of ids) {
    const bar = (await page.evaluate(() => (window as any).__net.self.bars[0])) as ({ s?: string } | null)[];
    if (bar.some((r) => r && r.s === id)) continue;
    let i = bar.findIndex((r) => !r);
    if (i < 0) for (let k = bar.length - 1; k >= 0; k--) if (!ids.includes(bar[k]?.s ?? "")) { i = k; break; }
    await page.evaluate(([n, s]) => (window as any).__net.send("bars:set", { bar: 0, i: n, ref: { s } }), [i, id] as [number, string]);
    await page.waitForFunction((s) => (window as any).__net.self.bars[0].some((r: any) => r && r.s === s), { timeout: 5000 }, id);
  }
}
/** Телепорт и ожидание: предсказание и спрайт на месте, камера (lerp 0,15, округление до пикселя) 4 опроса подряд стоит рядом с героем.
 *  Бессмертие — и до телепорта: изучение умений пересчитывает здоровье, а у берега бывает засада разбойников (новая карта, задача 132). */
async function tpWait(page: Page, p: { x: number; y: number }) {
  if (await page.evaluate(`!!${scene}.me?.dead`)) throw new Error("герой погиб до снимка — снимки были бы не те");
  await page.evaluate(() => (window as any).__net.send("dbg", { op: "god" }));
  await page.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [p.x, p.y]);
  await page.waitForFunction(([x, y]) => {
    const w = window as any, s = w.__game.scene.getScene("game"), c = s.cameras.main, me = s.me;
    if (!me || Math.hypot(s.pos.x - x, s.pos.y - y) >= 2 || Math.hypot(me.x - x, me.y - y) >= 2) { w.__camN = 0; return false; }
    const k = `${c.midPoint.x.toFixed(1)},${c.midPoint.y.toFixed(1)}`;
    w.__camN = k === w.__camK ? (w.__camN || 0) + 1 : 0;
    w.__camK = k;
    return w.__camN >= 4 && Math.abs(c.midPoint.x - me.x) < 24 && Math.abs(c.midPoint.y - me.y) < 24;
  }, { timeout: 30000, polling: 100 }, [p.x, p.y]);
  await page.evaluate(() => (window as any).__net.send("dbg", { op: "god" }));
  await sleep(400);
}
/** Курсор на юните (find — его ноги в мире; ищется заново: моб может сдвинуться), клавиша зажата, снимок. По телу — на 10 px выше ног. */
async function shotAt(page: Page, skill: string, find: () => Promise<{ x: number; y: number } | null>, name: string, what: string, dy = -10) {
  if (await page.evaluate(`!!${scene}.me?.dead`)) throw new Error(`герой погиб до снимка ${name}`);
  await page.evaluate(() => (window as any).__net.send("dbg", { op: "god" }));
  const key = await keyFor(page, skill);
  let u = await find();
  for (let i = 0; i < 40 && !u; i++) { await sleep(150); u = await find(); }
  if (!u) throw new Error(`${what} не виден`);
  let c = await toClient(page, u.x, u.y + dy);
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.keyboard.down(key as any);
  await waitCond(async () => (await aimId(page)) === skill, 2000, "прицел " + skill).catch(() => {});
  u = (await find()) ?? u;
  c = await toClient(page, u.x, u.y + dy);
  await page.mouse.move(c.x, c.y);
  await waitCond(async () => (await aimId(page)) === skill, 1000, "прицел после сдвига курсора").catch(() => {});
  await mustOverField(page, name);
  await page.screenshot({ path: path.join(SHOT_DIR, name + ".png") as `${string}.png` });
  await page.keyboard.press("Escape");
  await page.keyboard.up(key as any);
  await waitCond(async () => (await aimId(page)) === null, 1000, "снятие прицела").catch(() => {});
}
/** Ближайший к точке живой моб (в 260 px). */
const mobNear = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = ${scene}; let b = null, bd = 260; for (const v of s.units.values()) { if (v.u.kind !== 1 || v.dead) continue;
  const d = Math.hypot(v.x - ${x}, v.y - ${y}); if (d < bd) { bd = d; b = { x: v.x, y: v.y }; } } return b; })()`) as Promise<{ x: number; y: number } | null>;
/** Середина живых мобов в 220 px от точки (пачка для роя), если их хотя бы 2. */
const packNear = (page: Page, x: number, y: number) => page.evaluate(`(() => { const s = ${scene}; let n = 0, sx = 0, sy = 0; for (const v of s.units.values()) { if (v.u.kind !== 1 || v.dead) continue;
  if (Math.hypot(v.x - ${x}, v.y - ${y}) < 220) { n++; sx += v.x; sy += v.y; } } return n >= 2 ? { x: sx / n, y: sy / n } : null; })()`) as Promise<{ x: number; y: number } | null>;
/** Герой по имени (ноги). */
const heroNamed = (page: Page, name: string) => page.evaluate(`(() => { const s = ${scene}; for (const v of s.units.values()) if (v.u.kind === 0 && !v.dead && v.u.name === ${JSON.stringify(name)}) return { x: v.x, y: v.y }; return null; })()`) as Promise<{ x: number; y: number } | null>;
/** Шар (и умения на цель) в моба: курсор каждый раз заново на теле ближайшего к спавну моба (слизень может сдвинуться), клавиша зажата, снимок. */
const shotMob = (page: Page, skill: string, M: { mx: number; my: number }, name: string) => shotAt(page, skill, () => mobNear(page, M.mx, M.my), name, "моб у спавна");
/**
 * Снимки шага 2 задачи 133 (AIM_SHOTS=s2before до правок, s2 — после): по сцене на каждую новую форму, зум 2 и 3. Тихий берег W (вода в 70 px справа),
 * стены подземелья D, одинокий слизень M, пачка мобов P. Маг — стена огня, шар в моба, мерцание к воде, нова вокруг себя; егерь — луч до стены, веер,
 * капкан на воду; ассасин — конус, «Теневой шаг»; храмовник — знамя, Рывок к слизню и через воду (во врага-героя за водой); чернокнижник — скелеты
 * на воду; тёмный следопыт — рой на пачку (метки n целей); рыцарь смерти — «Хватка» с «Железными цепями»; клирик — «Эгида» на союзника (метка)
 * и «Сияние». Курсор каждого снимка — над полем (иначе превью не по курсору — снимок падает).
 */
async function shots2(browser: Browser, mage: Page, errors: string[]) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const W = waterScene(MAP), D = wallScene(MAP), M = mobScene(MAP), P = packScene(MAP), X = acrossWater(MAP, W), A = allySpot(MAP, W);
  // мерцание к воде — с суши в 60–100 px от берега: путь, место у кромки и тусклый остаток до курсора над водой
  const S = [100, 90, 80, 70, 60].map((d) => ({ x: W.x - d, y: W.y })).find((p) => walkable(MAP, p.x, p.y, 14) && lineClear(MAP, p.x, p.y, W.x + 190, W.y)) ?? W;
  console.log(`  снимки шага 2: берег (${W.x}, ${W.y}), мерцание с (${S.x}, ${S.y}), стена (${D.x}, ${D.y}) → (${D.qx}, ${D.qy}), слизень (${M.mx}, ${M.my}), ` +
    `пачка (${P.cx}, ${P.cy}), за водой ${X ? `(${X.x}, ${X.y})` : "— нет"}, союзник (${A.x}, ${A.y})`);
  type Scene = (page: Page, z: number) => Promise<void>;
  /** Герой-враг за водой для Рывка (тёмный следопыт): его страница живёт до конца сцен храмовника (release) — дольше держать её незачем. */
  let foePage: Page | null = null;
  const heroes: { page?: Page; name: string; cls: string; skills: string[]; bar?: string[]; keep?: boolean; release?: boolean; scenes: Scene[] }[] = [
    { page: mage, name: "Метеор", cls: "mage", skills: ["fireball", "mg_firewall", "frostnova", "blink"], scenes: [
      async (p, z) => { await tpWait(p, W); await shot(p, "mg_firewall", { x: W.x + 140, y: W.y + 30 }, `wall-z${z}`); },
      async (p, z) => { await shot(p, "blink", { x: W.x + 190, y: W.y }, `dash-water-z${z}`); },
      async (p, z) => { await shot(p, "frostnova", { x: W.x + 90, y: W.y + 60 }, `self-aoe-z${z}`); },
      async (p, z) => { await tpWait(p, S); await shot(p, "blink", { x: S.x + 190, y: S.y }, `dash-shore-z${z}`); },
      async (p, z) => { await tpWait(p, M); await shotMob(p, "fireball", M, `bolt-target-z${z}`); },
    ] },
    { name: "Стрелок", cls: "ranger", skills: ["volley", "hr_pierce", "hr_trap"], scenes: [
      // точка — ниже линии героя: (W.x + 150, W.y − 40) на зуме 3 ложилась под мини-карту (курсор над интерфейсом — веер по взгляду, а не на курсор)
      async (p, z) => { await tpWait(p, W); await shot(p, "volley", { x: W.x + 150, y: W.y + 40 }, `fan-z${z}`); },
      async (p, z) => { await shot(p, "hr_trap", { x: W.x + 92, y: W.y }, `trap-water-z${z}`); },
      async (p, z) => { await tpWait(p, D); await shot(p, "hr_pierce", { x: D.qx, y: D.qy }, `band-wall-z${z}`); },
    ] },
    { name: "Тень", cls: "rogue", skills: ["as_fan", "shadowstep"], scenes: [
      async (p, z) => { await tpWait(p, W); await shot(p, "as_fan", { x: W.x + 120, y: W.y + 20 }, `cone-z${z}`); },
      async (p, z) => { await tpWait(p, M); await shotMob(p, "shadowstep", M, `behind-z${z}`); },
    ] },
    { name: "Порча", cls: "darkranger", skills: ["dr_hexswarm"], keep: true, scenes: [
      async (p, z) => { await tpWait(p, P); await shotAt(p, "dr_hexswarm", () => packNear(p, P.cx, P.cy), `swarm-z${z}`, "пачка мобов", 0); },
    ] },
    { name: "Знаменосец", cls: "warrior", skills: ["tp_banner", "charge"], release: true, scenes: [
      async (p, z) => { await tpWait(p, W); await shot(p, "tp_banner", { x: W.x + 40, y: W.y - 50 }, `banner-z${z}`); },
      async (p, z) => { await tpWait(p, M); await shotMob(p, "charge", M, `leap-z${z}`); },
      async (p, z) => {
        if (!X || !foePage) return;
        await tpWait(foePage, X);
        await tpWait(p, W);
        await shotAt(p, "charge", () => heroNamed(p, "Порча"), `leap-water-z${z}`, "враг за водой");
      },
    ] },
    { name: "Жнец", cls: "deathknight", skills: ["dk_death_grip", "dk_iron_chains"], bar: ["dk_death_grip"], scenes: [
      async (p, z) => { await tpWait(p, M); await shotMob(p, "dk_death_grip", M, `pull-z${z}`); },
    ] },
    { name: "Призыватель", cls: "warlock", skills: ["wl_skeletons"], scenes: [
      async (p, z) => { await tpWait(p, W); await shot(p, "wl_skeletons", { x: W.x + 110, y: W.y }, `summon-water-z${z}`); },
    ] },
    { name: "Клирик", cls: "healer", skills: ["cl_aegis", "cl_radiance"], scenes: [
      async (p, z) => { await tpWait(mage, A); await tpWait(p, W); await shotAt(p, "cl_aegis", () => heroNamed(p, "Метеор"), `aegis-z${z}`, "союзник", 0); },
      async (p, z) => { await shotAt(p, "cl_radiance", () => heroNamed(p, "Метеор"), `radiance-z${z}`, "союзник", 0); },
    ] },
  ];
  // AIM_HEROES=Имя,Имя — только эти герои (переснять часть сцен); маг (главная страница) открыт всегда
  const only = (process.env.AIM_HEROES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const h of heroes) {
    if (only.length && !only.includes(h.name)) continue;
    const own = !h.page;
    const page = h.page ?? (await enter(browser, h.name));
    if (own) {
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 99 }); n.send("dbg", { op: "god" }); });
      await sleep(500);
    }
    await learnAll(page, h.skills);
    await onBar(page, h.bar ?? h.skills);
    // AIM_LOOK=A|B|C — вариант вида превью; AIM_NIGHT=1 — клиентские часы сдвинуты в ночь (сервер не затронут)
    await page.evaluate(`(() => { window.__aimLook = ${JSON.stringify(process.env.AIM_LOOK ?? "")}; if (${process.env.AIM_NIGHT ? 1 : 0}) { const D = 20 * 60 * 1000, n = Date.now.bind(Date); Date.now = () => Math.floor(n() / D) * D + 0.8 * D; } })()`);
    for (const z of [2, 3]) {
      await setZoom(page, z);
      for (const sc of h.scenes) await sc(page, z);
    }
    await setZoom(page, 2);
    console.log(`  ok   снимки шага 2: ${h.name} (${h.cls}) — ${SHOT_DIR}`);
    if (h.keep) foePage = page;
    else if (own) await page.browserContext().close();
    if (h.release && foePage) { await foePage.browserContext().close(); foePage = null; }
  }
  if (foePage) await foePage.browserContext().close();
}

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  await ensureChar("Целитель", "secret", "Целитель", "healer");
  await ensureChar("Метеор", "secret", "Метеор", "mage");
  if (SHOTS.startsWith("s2")) {
    const extra = [["Стрелок", "ranger"], ["Тень", "rogue"], ["Порча", "darkranger"], ["Знаменосец", "warrior"], ["Жнец", "deathknight"], ["Призыватель", "warlock"], ["Клирик", "healer"]];
    for (const [n, c] of extra) await ensureChar(n, "secret", n, c);
  }
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,800", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"], defaultViewport: { width: 1280, height: 800 } });
  const ok = (s: string) => console.log("  ok   " + s);
  const must = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };
  const errors: string[] = [];
  try {
    const healer = await enter(browser, "Целитель");
    const mage = await enter(browser, "Метеор");
    for (const p of [healer, mage]) p.on("pageerror", (e) => errors.push(String(e)));
    await mage.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 99 }); n.send("dbg", { op: "god" }); });
    await healer.evaluate(() => { const n = (window as any).__net; n.send("dbg", { op: "level", v: 10 }); n.send("dbg", { op: "god" }); });
    await healer.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [sp.x + 150, sp.y]);
    await waitCond(async () => (await atPos(healer, sp.x + 150, sp.y)) && (await atPos(mage, sp.x + 150, sp.y - 70)), 15000, "телепорт лекаря и мага").catch(() => {});
    for (const id of ["frostnova", "blink", "meteor"]) { await mage.evaluate((i) => (window as any).__net.send("learn", { id: i }), id); await sleep(250); }
    await mage.waitForFunction(() => (window as any).__net.self.skills.meteor && (window as any).__net.self.bars[0].some((r: any) => r && r.s === "meteor"), { timeout: 5000 });
    // снимки превью (задача 133) — до проверок: их отказ не должен оставить фазу без снимков
    if (SHOTS) {
      if (SHOTS.startsWith("s2")) await shots2(browser, mage, errors); else await shots(mage);
      await mage.evaluate(([x, y]) => (window as any).__net.send("dbg", { op: "tp", x, y }), [sp.x + 150, sp.y - 70]);
      await waitCond(() => atPos(mage, sp.x + 150, sp.y - 70), 15000, "возврат мага").catch(() => {});
    }

    // ---- лекарь: союзник под курсором, цель не меняется ----
    await healer.keyboard.press("Tab");
    await waitCond(async () => !!(await state(healer)).target, 5000, "Tab выбрал врага").catch(() => {});
    const before = await state(healer);
    must(before.target, "Tab не выбрал врага");
    await waitCond(async () => !!(await healer.evaluate(`(() => { const s = ${scene}; for (const [id, v] of s.units) if (id !== window.__net.id && v.u.name === "Метеор") return true; return false; })()`)), 5000, "союзник виден лекарю").catch(() => {});
    const ally = (await healer.evaluate(`(() => { const s = ${scene}; for (const [id, v] of s.units) if (id !== window.__net.id && v.u.name === "Метеор") return { id, x: v.x, y: v.y }; return null; })()`)) as { id: string; x: number; y: number } | null;
    must(ally, "союзник не виден лекарю");
    const sc = await toClient(healer, ally!.x, ally!.y - 14);
    await healer.mouse.move(sc.x, sc.y, { steps: 4 });
    await sleep(300);
    const heal = await keyFor(healer, "heal");
    await clear(healer);
    await healer.keyboard.down(heal as any);
    await waitCond(async () => (await aimId(healer)) === "heal", 2000, "прицел лечения").catch(() => {});
    must((await state(healer)).aim === "heal", "с превью: при зажатой клавише нет прицела");
    must(!(await sent(healer, "skill")).length, "каст ушёл до отпускания клавиши");
    await healer.keyboard.up(heal as any);
    await waitCond(async () => (await skillsSent(healer)) >= 1, 2000, "каст лечения").catch(() => {});
    const casts = await sent(healer, "skill");
    must(casts.length === 1 && casts[0].id === "heal" && casts[0].target === ally!.id, "лечение не ушло в союзника под курсором: " + JSON.stringify(casts) + " ally=" + JSON.stringify(ally) + " sc=" + JSON.stringify(sc) + " st=" + JSON.stringify(await state(healer)) + " dbg=" + JSON.stringify(await healer.evaluate((p: any) => { const sc_id = p.id; const s = (window as any).__game.scene.getScene("game"); const e = document.elementFromPoint(p.x, p.y) as HTMLElement; const ap = s.input.activePointer; return { el: e?.tagName + "." + e?.className, overUi: s.overUi, px: ap.x, py: ap.y, al: (() => { const v = s.units.get(sc_id); return v && { en: s.isEnemy(v), k: v.u.kind, f: v.u.faction, mf: (window as any).__net.self.faction, ht: v.hitTest(s.cameras.main.getWorldPoint(ap.x, ap.y).x, s.cameras.main.getWorldPoint(ap.x, ap.y).y), vx: v.x, vy: v.y }; })(), pf: s.pickFriend(s.cameras.main.getWorldPoint(ap.x, ap.y).x, s.cameras.main.getWorldPoint(ap.x, ap.y).y) }; }, { ...sc, id: ally!.id })) + " self=" + (await healer.evaluate(() => (window as any).__net.id)));
    must((await state(healer)).target === before.target, "цель сменилась");
    ok("лекарь: лечение ушло в союзника под курсором, выбранная цель не изменилась");

    // ---- маг: метеор с превью ложится в курсор, зажатый дальностью ----
    await waitCond(() => atPos(mage, sp.x + 150, sp.y - 70), 5000, "маг на месте").catch(() => {});
    const me = await state(mage);
    const far = await toClient(mage, me.x, me.y); far.x = 8; far.y = 8;
    await mage.mouse.move(far.x, far.y, { steps: 4 });
    await sleep(300);
    const met = await keyFor(mage, "meteor");
    await clear(mage);
    await mage.keyboard.down(met as any);
    await waitCond(async () => (await aimId(mage)) === "meteor", 2000, "прицел метеора").catch(() => {});
    must((await state(mage)).aim === "meteor", "метеор: нет прицела при зажатой клавише");
    await mage.keyboard.up(met as any);
    await waitCond(async () => (await skillsSent(mage)) >= 1, 2000, "каст метеора").catch(() => {});
    const m = (await sent(mage, "skill"))[0];
    must(m && m.id === "meteor", "метеор не отправлен: " + JSON.stringify(m));
    const d = Math.hypot(m.x - me.x, m.y - me.y);
    const cur = (await state(mage)).cur, cd = Math.hypot(cur.x - me.x, cur.y - me.y), k = 340 / cd, ex = me.x + (cur.x - me.x) * k, ey = me.y + (cur.y - me.y) * k;
    must(cd > 345, `курсор не дальше дальности: ${cd.toFixed(0)} px, интерфейс=${(await state(mage)).ui}`);
    must(Math.hypot(m.x - ex, m.y - ey) < 4, `точка не зажата дальностью 340: d=${d.toFixed(1)} (${m.x},${m.y}) ожидали (${ex.toFixed(0)},${ey.toFixed(0)})`);
    ok(`метеор: курсор дальше дальности, точка каста в ${d.toFixed(0)} px (дальность 340)`);

    // ближе дальности — ровно в курсор: проверяем сообщение клиента, поэтому перезарядку метеора у клиента снимаем (иначе предпроверка castNow не шлёт каст)
    const near = await toClient(mage, me.x + 150, me.y + 40);
    await mage.mouse.move(near.x, near.y, { steps: 4 });
    await sleep(400);
    await mage.evaluate(() => { const c = (window as any).__net.cooldowns as Map<string, number>; c.delete("meteor"); c.delete("gcd"); });
    await clear(mage);
    await mage.keyboard.down(met as any);
    await waitCond(async () => (await aimId(mage)) === "meteor", 2000, "прицел метеора (ближе)").catch(() => {});
    await mage.keyboard.up(met as any);
    await waitCond(async () => (await skillsSent(mage)) >= 1, 2000, "каст метеора (ближе)").catch(() => {});
    const m2 = (await sent(mage, "skill"))[0];
    must(m2 && Math.hypot(m2.x - (me.x + 150), m2.y - (me.y + 40)) < 4, "ближняя точка не совпала с курсором: " + JSON.stringify(m2));
    ok("метеор ближе дальности ложится ровно в курсор");

    // ---- Esc отменяет прицел ----
    await clear(mage);
    await mage.keyboard.down(met as any);
    await waitCond(async () => (await aimId(mage)) === "meteor", 2000, "прицел перед Esc").catch(() => {});
    must((await state(mage)).aim === "meteor", "нет прицела перед Esc");
    await mage.keyboard.press("Escape");
    await waitCond(async () => (await aimId(mage)) === null, 2000, "Esc снимает прицел").catch(() => {});
    must((await state(mage)).aim === null, "Esc не снял прицел");
    await mage.keyboard.up(met as any);
    await sleep(300);
    must(!(await sent(mage, "skill")).length, "после Esc ушёл каст");
    ok("Esc отменяет прицел, при отпускании клавиши каста нет");

    must(!errors.length, "ошибки страницы: " + errors.join("; "));
  } finally {
    await browser.close();
    await vite.close();
    await stopServer();
  }
  console.log("aim-screens: готово");
}
main().catch((e) => { console.error(e); process.exit(1); });
