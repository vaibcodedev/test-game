/** Скриншоты редактора конфигов (задача 145) в tools/out/editor. Запускать под tools/out/scenario.lock (mkdir до, rmdir после). */
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

const srv = spawn(process.execPath, ["--import", "tsx", "editor/server/index.ts"], { env: { ...process.env, EDITOR_PORT: String(PORT) }, stdio: ["ignore", "pipe", "inherit"] });
try { if (srv.pid) os.setPriority(srv.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* не критично */ }
await new Promise<void>((res, rej) => { srv.stdout!.on("data", (d) => String(d).includes("http://") && res()); srv.on("exit", () => rej(new Error("сервер редактора не запустился"))); setTimeout(() => rej(new Error("таймаут запуска")), 30000); });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--window-size=1440,900"], defaultViewport: { width: 1440, height: 900 } });
const errors: string[] = [];
try {
  const page = await browser.newPage();
  await page.authenticate({ username: process.env.EDITOR_USER || "admin", password: process.env.EDITOR_PASS || "admin" });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const open = async (name: string) => { await page.evaluate((n) => (window as any).__editor.openFile(n), name); await new Promise((r) => setTimeout(r, 300)); };
  const shot = (f: string) => page.screenshot({ path: path.join(OUT, f) });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => (window as any).__editor);
  await shot("balance.png");

  // ползунок с объяснением: общая скорость ходьбы, значение сдвинуто ползунком
  await page.evaluate(() => (window as any).__editor.focusField("moveMul"));
  await page.evaluate(() => {
    const r = document.querySelector('.fld[data-path="moveMul"] input.range') as HTMLInputElement;
    r.value = "0.9"; r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 200));
  const fld = await page.$('.fld[data-path="moveMul"]');
  await fld!.scrollIntoView();
  await shot("slider-moveMul.png");
  await page.evaluate(() => (window as any).__editor.focusField("pvp.class.healer.dmg"));
  await new Promise((r) => setTimeout(r, 200));
  await shot("slider-pvp-healer.png");

  await open("mobs");
  await page.evaluate(() => (document.querySelector("table.tbl .open-btn") as HTMLElement).click());
  await new Promise((r) => setTimeout(r, 300));
  await shot("mob.png");

  await open("mounts");
  await page.evaluate(() => { const s = document.querySelector("#form details.sec"); void s; });
  await page.evaluate(() => (window as any).__editor.focusField("speeds.rare"));
  await new Promise((r) => setTimeout(r, 200));
  await shot("mount.png");

  await page.evaluate(() => { (document.querySelector("details.ed-sec[data-path=mounts] table.tbl .open-btn") as HTMLElement).click(); });
  await page.evaluate(() => (window as any).__editor.focusField("mounts.horse.price"));
  await new Promise((r) => setTimeout(r, 200));
  await shot("mount-table.png");

  await open("patrols");
  await page.evaluate(() => (window as any).__editor.focusField("units.melee.chaseSpeed"));
  await new Promise((r) => setTimeout(r, 200));
  await shot("patrols.png");

  await open("balance");
  // проверка: значение вне границ + tsc
  await page.evaluate(() => { const e = (window as any).__editor; e.state.draft.moveMul = 7; });
  await page.click("#b-check");
  await page.waitForFunction(() => /tsc: (ошибок нет|найдены|Failed)/.test(document.querySelector("#report")!.textContent || ""), { timeout: 180000 });
  await shot("check.png");
  await open("balance");
  await page.goto(`http://localhost:${PORT}/compare.html`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  await shot("compare.png");
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => (window as any).__editor);
  await page.evaluate(() => (window as any).__editor.showDiff('{\r\n  "moveMul": 0.75,\r\n  "aggroMul": 0.8,\r\n  "gcd": 0.75\r\n}\r\n', '{\r\n  "moveMul": 0.9,\r\n  "aggroMul": 0.8,\r\n  "gcd": 0.75\r\n}\r\n', "Было | стало — balance.json"));
  await new Promise((r) => setTimeout(r, 200));
  await shot("diff.png");
  if (errors.length) console.log("Ошибки в консоли браузера:\n" + errors.join("\n"));
} finally {
  await browser.close();
  srv.kill();
}
console.log("скриншоты:", OUT);
