/** Лист превью вау-эффектов (client/src/game/fx/*): tools/out/wow/preview.png. Без сервера: только vite + headless Chrome.
 *  Запускать под замком tools/out/scenario.lock снаружи. Порт 5262. */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";

const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
const OUT = path.resolve("tools/out/wow");
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: 5262, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--no-sandbox"], defaultViewport: { width: 400, height: 240 }, protocolTimeout: 600000 });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.error("pageerror", String(e)));
    page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text()); });
    await page.goto("http://localhost:5262/fx-preview.html", { waitUntil: "networkidle0" });
    await page.evaluate(() => (window as any).__wow.ready);
    const r = await page.evaluate(() => (window as any).__wow.runAll()) as { sheet: string; bt: { fps: number; ms: number }; bb: { fps: number; ms: number } };
    fs.writeFileSync(path.join(OUT, "preview.png"), Buffer.from(r.sheet.split(",")[1], "base64"));
    console.log(`Text ${r.bt.fps.toFixed(1)} fps (${r.bt.ms.toFixed(1)} ms) | BitmapText ${r.bb.fps.toFixed(1)} fps (${r.bb.ms.toFixed(1)} ms)`);
  } finally { await browser.close(); await vite.close(); }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
