/**
 * Щиты и круги на герое в настоящем браузере: идут за героем пиксель в пиксель на бегу, а buff с ms 0 (щит пробит, вихрь прерван, эффект снят)
 * убирает картинку сразу. Бой не нужен: клиентский путь (GameScene.fx.play) получает синтетические fx, время идёт вручную шагами game.step.
 * Проверяется: пузырь щита без спрайта умения (UnitView.attach, body), круг под ногами (attach на земле), спрайтовый щит умения (Vfx.followUnit),
 * снятие без метки умения и с чужой меткой (реестр циклов по виду, Vfx.endBuff), точечное снятие по метке (вид enrage делят два умения),
 * разовая вспышка ярости босса (ms 0 у вида без картинки) и отсутствие ошибок консоли.
 *
 * Запуск (свободные порты): $env:TEST_PORT="2921"; $env:VITE_TEST_PORT="5421"; npx tsx tests/shield-follow.ts   (путь к Chrome: CHROME_PATH)
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { createServer } from "vite";
import { ensureChar, PORT, sleep, startServer, stopServer } from "./harness";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5299;
const VIEW = { width: 1280, height: 800 };
/** Шаг ручного времени, мс. */
const STEP = 40;

let page: Page;
const errors: string[] = [];
const results: string[] = [];
let bad = 0;
const check = (ok: boolean, msg: string) => { results.push(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) bad++; };

const run = <R = any>(body: string, arg: unknown = null): Promise<R> =>
  page.evaluate(`(async () => { const sc = window.__game && window.__game.scene.getScene("game"), net = window.__net, a = ${JSON.stringify(arg) ?? "null"};\n${body}\n})()`) as Promise<R>;
const waitFn = (expr: string, timeout = 8000) => page.waitForFunction(expr, { timeout: timeout * 2.5, polling: 250 });
const adv = (ms: number) => run("window.__adv(a)", ms);
const play = (list: unknown[]) => run("sc.fx.play(a)", list);

function chromePath() {
  const list = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const p = list.find((x) => x && fs.existsSync(x));
  if (!p) throw new Error("Chrome не найден: задайте CHROME_PATH");
  return p;
}

// объекты сцены: эллипсы (пузырь и круг) по цвету заливки, спрайты vfx по текстуре
const ell = (color: number) => `sc.children.list.filter((o) => o.type === 'Ellipse' && o.active && o.fillColor === ${color})`;
const spr = (tex: string) => `sc.children.list.filter((o) => o.texture && o.texture.key === 'vfx_${tex}' && o.active && o.visible)`;
const count = (expr: string) => run<number>(`return ${expr}.length`);

/** Ждём состояния: шаги по 40 мс с паузой в реальном времени (твины затухания идут по часам, один длинный adv их не двигает). */
async function settle(expr: string, steps = 30) {
  for (let i = 0; i < steps; i++) {
    if (await run(`return !!(${expr})`)) return true;
    await adv(STEP);
    await sleep(40);
  }
  return !!(await run(`return !!(${expr})`));
}

/** Бег: каждый кадр сдвигаем клиентскую позицию героя дробно; смещение объекта от героя должно быть неизменным.
 *  На теле — от спрайта героя (с покачиванием в стойке), на земле — от позиции юнита в целых пикселях. */
async function follow(find: string, label: string, ground = false) {
  const offs: { dx: number; dy: number; hx: number }[] = [];
  for (let i = 0; i < 14; i++) {
    await run("sc.pos.x += 30.37; sc.pos.y += 0.41; sc.units.get(net.id).u.x = sc.pos.x; sc.units.get(net.id).u.y = sc.pos.y;");
    await adv(STEP);
    const o = await run<{ dx: number; dy: number; hx: number } | null>(`const me = sc.units.get(net.id), o = ${find}[0]; const bx = ${ground ? "Math.round(me.x)" : "me.sprite.x"}, by = ${ground ? "Math.round(me.y)" : "me.sprite.y"}; return o ? { dx: o.x - bx, dy: o.y - by, hx: me.sprite.x } : null;`);
    if (o) offs.push(o);
  }
  const same = offs.length >= 12 && offs.every((o) => o.dx === offs[0].dx && o.dy === offs[0].dy);
  const moved = offs.length ? Math.max(...offs.map((o) => o.hx)) - Math.min(...offs.map((o) => o.hx)) : 0;
  check(same && moved > 10, `${label}: смещение от героя при беге ${offs.length ? `${offs[0].dx},${offs[0].dy}` : "объекта нет"} неизменно на ${offs.length} кадрах, герой прошёл ${Math.round(moved)} px`);
}

async function enter(name: string) {
  const token = await ensureChar(name, "secret", name, "healer", 0);
  await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
  await page.evaluate((t: string) => { sessionStorage.setItem("emberfall-token", t); localStorage.removeItem("zoom:v1"); }, token);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(`.cs-slot[data-name="${name}"]`, { timeout: 20000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await waitFn("document.getElementById('charsel').hidden", 20000);
  await waitFn("window.__game && window.__game.scene.isActive('game')", 20000);
  await waitFn("window.__net && window.__net.self && window.__net.online", 15000);
  await sleep(1500);
  // ручное время: цикл Phaser спит, сцену двигаем шагами game.step
  await run(`window.__vt = performance.now(); window.__adv = (ms) => { const g = window.__game; const n = Math.max(1, Math.round(ms / ${STEP})); for (let i = 0; i < n; i++) { window.__vt += ${STEP}; g.loop.delta = ${STEP}; g.step(window.__vt, ${STEP}); } };`);
  await run("const l = window.__game.loop; if (l.running) l.sleep(); window.__vt = performance.now(); sc.cameras.main.stopFollow();");
  await adv(400);
}

async function scenario() {
  const meId = await run<string>("return net.id");

  // A. пузырь без спрайта умения (щит пассивки): идёт за телом героя и снимается сразу
  await play([{ t: "buff", id: meId, k: "shield", ms: 6000 }]);
  await adv(200);
  check((await count(ell(0xffd84a))) === 1, "пузырь щита создан");
  await follow(ell(0xffd84a), "пузырь щита");
  await play([{ t: "buff", id: meId, k: "shield", ms: 0 }]);
  check(await settle(`${ell(0xffd84a)}.length === 0`), "пузырь снят по buff ms 0");
  check(await run("return sc.units.get(net.id).attached.length === 0"), "после снятия пузыря в UnitView.attached пусто");

  // B. круг под ногами (bless): идёт за героем по земле
  await play([{ t: "buff", id: meId, k: "bless", ms: 6000 }]);
  await adv(200);
  check((await count(ell(0xffe890))) === 1, "круг bless создан");
  await follow(ell(0xffe890), "круг под ногами", true);
  await play([{ t: "buff", id: meId, k: "bless", ms: 0 }]);
  check(await settle(`${ell(0xffe890)}.length === 0`), "круг bless снят по buff ms 0");

  // C. спрайтовый щит умения: идёт за телом, снимается без метки умения и с чужой меткой (пробит ударом чужого умения)
  for (const [label, tag] of [["без метки", {}], ["с чужой меткой", { s: "fireball", c: "someone" }]] as const) {
    await play([{ t: "buff", id: meId, k: "shield", ms: 6000, s: "holyshield", c: meId }]);
    await adv(300);
    check((await count(spr("bubble-holy"))) >= 1, `спрайт «Святого щита» (bubble-holy) создан (${label})`);
    if (label === "без метки") await follow(spr("bubble-holy"), "спрайт щита bubble-holy");
    await play([{ t: "buff", id: meId, k: "shield", ms: 0, ...tag }]);
    check(await settle(`${spr("bubble-holy")}.length === 0`), `спрайт щита снят по buff ms 0 ${label}`);
  }

  // D. вид enrage делят два умения: с меткой снимается только своё
  await play([{ t: "buff", id: meId, k: "enrage", ms: 6000, s: "rv_frenzy", c: meId }, { t: "buff", id: meId, k: "enrage", ms: 6000, s: "rv_massacre", c: meId }]);
  await adv(300);
  const a1 = await count(spr("aura-rage")), t1 = await count(spr("tornado-blood"));
  check(a1 >= 1 && t1 >= 1, `оба цикла enrage идут (aura-rage ${a1}, tornado-blood ${t1})`);
  await play([{ t: "buff", id: meId, k: "enrage", ms: 0, s: "rv_massacre", c: meId }]);
  await settle(`${spr("tornado-blood")}.length === 0`);
  const a2 = await count(spr("aura-rage")), t2 = await count(spr("tornado-blood"));
  check(a2 >= 1 && t2 === 0, `с меткой снят только вихрь (aura-rage ${a2}, tornado-blood ${t2})`);
  await play([{ t: "buff", id: meId, k: "enrage", ms: 0 }]);
  check(await settle(`${spr("aura-rage")}.length === 0`), "без метки снят и остаток вида enrage");

  // E. повторный щит заменяет прежний, реестр циклов по виду не копит мусор
  for (let i = 0; i < 3; i++) { await play([{ t: "buff", id: meId, k: "shield", ms: 3000, s: "holyshield", c: meId }]); await adv(100); }
  await play([{ t: "buff", id: meId, k: "shield", ms: 0 }]);
  check(await settle(`${spr("bubble-holy")}.length === 0`), "после серии повторов снятие убирает все циклы");
  check(await run("return sc.fx.vfx.byKind.size === 0"), "реестр циклов по виду пуст");

  // F. ms 0 у видов без картинки на герое — разовая вспышка (ярость босса при смене фазы); у видов с картинкой — только снятие, без вспышки
  await run("window.__bursts = 0; const o = sc.fx.burst; sc.fx.burst = function (...a) { window.__bursts++; return o.apply(this, a); };");
  await play([{ t: "buff", id: meId, k: "shield", ms: 0 }, { t: "buff", id: meId, k: "block", ms: 0 }, { t: "buff", id: meId, k: "bless", ms: 0 }]);
  check((await run<number>("return window.__bursts")) === 0, "снятие щита, блока и круга, которых уже нет, не даёт вспышек");
  await play([{ t: "buff", id: meId, k: "enrage", ms: 0 }]);
  check((await run<number>("return window.__bursts")) > 0, "buff enrage с ms 0 без цикла — по-прежнему разовая вспышка (ярость босса)");
}

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser: Browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, ignoreDefaultArgs: ["--hide-scrollbars"],
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", `--window-size=${VIEW.width},${VIEW.height}`, "--no-sandbox"],
    defaultViewport: { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1 },
  });
  try {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { (window as any).__name = (t: unknown) => t; });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e)}`));
    await enter("shield_follow");
    await scenario();
    const warn = errors.filter((e) => !/favicon|DevTools|WebGL|GPU stall|swiftshader|AudioContext/i.test(e));
    check(warn.length === 0, `ошибок консоли нет${warn.length ? `: ${warn.slice(0, 5).join(" | ")}` : ""}`);
  } catch (e) {
    results.push(`EXC ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
    bad++;
  } finally {
    console.log(results.join("\n"));
    await browser.close().catch(() => {});
    await vite.close().catch(() => {});
    await stopServer();
  }
  console.log(bad ? `\nСбоев: ${bad}` : "\nЩиты и круги за героем: все проверки пройдены");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await stopServer();
  process.exit(1);
});
