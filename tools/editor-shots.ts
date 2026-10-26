/** Скриншоты редактора конфигов в tools/out/editor. Запускать под tools/out/scenario.lock (mkdir до, rmdir после). */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const PORT = 2855;
const OUT = path.resolve("tools/out/editor");
fs.mkdirSync(OUT, { recursive: true });
const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((x) => x && fs.existsSync(x));
if (!chrome) throw new Error("Chrome не найден: задайте CHROME_PATH");

// собственный временный логин для этого запуска: сервер редактора требует вход
const USER = "shots", PASS = Math.random().toString(36).slice(2);
const srv = spawn(process.execPath, ["--import", "tsx", "editor/server/index.ts"], { env: { ...process.env, EDITOR_PORT: String(PORT), EDITOR_USER: USER, EDITOR_PASS: PASS }, stdio: ["ignore", "pipe", "inherit"] });
try { if (srv.pid) os.setPriority(srv.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* не критично */ }
await new Promise<void>((res, rej) => { srv.stdout!.on("data", (d) => String(d).includes("http://") && res()); srv.on("exit", () => rej(new Error("сервер редактора не запустился"))); setTimeout(() => rej(new Error("таймаут запуска")), 30000); });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--window-size=1600,900"], defaultViewport: { width: 1600, height: 900 } });
const errors: string[] = [];
try {
  const page = await browser.newPage();
  await page.authenticate({ username: USER, password: PASS });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
  const shot = (f: string) => page.screenshot({ path: path.join(OUT, f) });
  const ed = (fn: string, ...a: unknown[]) => page.evaluate(`window.__editor.${fn}(...${JSON.stringify(a)})`);

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.__editor");
  await wait(500);
  // ползунок: общая скорость ходьбы
  await ed("navigate", "balance", ["moveMul"]);
  await wait(500);
  await page.evaluate(() => {
    const r = document.querySelector('.fc[data-path="moveMul"] input.range') as HTMLInputElement;
    r.value = "0.9"; r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(300);
  await shot("balance.png");
  // «Что изменится»
  await page.click("#b-diff");
  await wait(700);
  await shot("diff.png");
  await page.evaluate(() => (window as any).__editor.close());
  // история файла в git
  await ed("panel", "history");
  await wait(800);
  await page.evaluate(() => (document.querySelector(".hist-item") as HTMLElement)?.click());
  await wait(800);
  await shot("history.png");
  await page.evaluate(() => (window as any).__editor.close());
  // поиск
  await page.keyboard.down("Control"); await page.keyboard.press("k"); await page.keyboard.up("Control");
  await page.waitForSelector("#search .input");
  await page.type("#search .input", "агр");
  await wait(2500);
  await shot("search.png");
  await page.keyboard.press("Escape");
  // PvP-кривая по классу
  await ed("navigate", "balance", ["pvp", "class", "healer", "dmg"]);
  await wait(500);
  await shot("slider-pvp-healer.png");
  // мобы (таблица + карточка), маунты, боссы
  await ed("openFile", "mobs");
  await wait(600);
  await page.evaluate(() => (document.querySelector(".ent-list tbody tr") as HTMLElement).click());
  await wait(400);
  await shot("mob.png");
  await ed("openFile", "mounts");
  await wait(500);
  await page.evaluate(() => (document.querySelector(".ent-list tbody tr") as HTMLElement).click());
  await wait(400);
  await shot("mount.png");
  await ed("openFile", "patrols");
  await wait(500);
  await shot("patrols.png");
  await ed("openFile", "gameplay");
  await wait(500);
  await shot("gameplay.png");
  if (errors.length) console.log("Ошибки в консоли браузера:\n" + errors.join("\n"));
} finally {
  await browser.close();
  srv.kill();
}
console.log("скриншоты:", OUT);
