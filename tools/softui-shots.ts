/**
 * Подписи мира: рынок Аурелиона, 1366×768 (+1920×1080 без ONLY1366) и крупный план → tools/out/softui/final-*.png. Порты 2845 / 5246, один headless-таб. Запуск под замком tools/out/scenario.lock снаружи.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { sleep, startServer, stopServer, PORT } from "../tests/harness";

const VITE_PORT = 5246, OUT = path.resolve("tools/out/softui");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;

async function login(page: Page, name: string) {
  try { await login0(page, name); } catch (e) { const st = await Promise.race([page.evaluate(`JSON.stringify({ scenes: (window.__game && window.__game.scene.scenes.map((s) => s.sys.settings.key + ":" + s.sys.settings.status)), loader: window.__game && window.__game.scene.scenes.map((s) => s.load && s.load.totalFailed + "/" + s.load.totalComplete + "/" + s.load.totalToLoad) })`), sleep(20000).then(() => "evaluate hung")]); console.error("STATE", st); await page.screenshot({ path: path.join(OUT, "debug-login.png") }); throw e; }
}
async function login0(page: Page, name: string) {
  await page.waitForSelector("#login-name");
  await page.type("#login-name", name); await page.type("#login-pass", "secret");
  await page.click("#login-new"); await page.type("#login-pass2", "secret"); await page.click("#login-new");
  await page.waitForSelector(".cs-create input[name=name]", { timeout: 10000 });
  await page.type(".cs-create input[name=name]", name);
  await page.$eval(`.cs-create [data-cls="warrior"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click(".cs-create [type=submit]");
  await page.waitForSelector(".cs-list .cs-slot[data-name]", { timeout: 10000 });
  await page.$eval(`.cs-slot[data-name="${name}"]`, (b) => (b as HTMLElement).click());
  await sleep(300);
  await page.click('.cs-list [data-a="play"]');
  await page.waitForFunction(() => document.getElementById("charsel")!.hidden, { timeout: 120000 });
  await page.waitForFunction(() => (window as any).__game?.scene?.isActive("game"), { timeout: 120000 });
  await sleep(1500);
}
const _unused = (page: Page, ms: number) => page.evaluate(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < ${ms}) requestAnimationFrame(f); else res((n * 1000) / (performance.now() - t0)); }; requestAnimationFrame(f); })`) as Promise<number>;

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 1800000 });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
    await login(page, "Мягко");
    const dbg = (m: Record<string, unknown>) => page.evaluate((x) => (window as any).__net.send("dbg", x), m);
    await dbg({ op: "tp", x: 56 * 32, y: 182 * 32 }); await sleep(3000);
    const r = await page.evaluate(`(() => { const e = document.querySelector("#hp-fill").parentElement.getBoundingClientRect(); return { x: Math.max(0, e.x - 20), y: Math.max(0, e.y - 12), width: e.width + 40, height: e.height + 24 }; })()`) as { x: number; y: number; width: number; height: number };
    const shot = async (t: string) => ({ t, b64: Buffer.from(await page.screenshot({ clip: r }) as Uint8Array).toString("base64") });
    const frames: { t: string; b64: string }[] = [];
    await dbg({ op: "hp", v: 142 }); await sleep(1500);
    await dbg({ op: "hurt", v: 90 }); frames.push(await shot("урон +0")); await sleep(150); frames.push(await shot("урон +150"));await sleep(500); frames.push(await shot("урон +650"));
    await sleep(1200);
    await dbg({ op: "hp", v: 142 }); await sleep(120); frames.push(await shot("лечение +120")); frames.push(await shot("лечение +"));  await sleep(250); frames.push(await shot("лечение +350"));
    const sp = await browser.newPage();
    await sp.setViewport({ width: (Math.ceil(r.width * 2) + 6) * frames.length, height: 110 });
    await sp.setContent(`<body style="margin:0;background:#222;display:flex;gap:6px;color:#fff;font:11px sans-serif">${frames.map((f) => `<div><div>${f.t}</div><img style="width:${Math.ceil(r.width * 2)}px;image-rendering:pixelated" src="data:image/png;base64,${f.b64}"></div>`).join("")}</body>`);
    await sp.screenshot({ path: path.join(OUT, "hpbar.png") });
  } finally { await browser.close(); await vite.close(); await stopServer(); }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
