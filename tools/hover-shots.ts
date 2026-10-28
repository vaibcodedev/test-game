/**
 * Наведение на объекты (задача: единое попадание по силуэту): камень телепорта Аурелиона на зуме 2 и 3 — верх, середина, основание, рядом мимо; NPC и статуя.
 * Проверка: курсор канваса, свечение (hoverGlow), подсказка «G»; кадры верха камня в tools/out/hover. Порты 2858 / 5258. Запуск под замком tools/out/scenario.lock снаружи.
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";
import { sleep, startServer, stopServer, PORT } from "../tests/harness";
import { CITIES } from "../shared/cities";

const VITE_PORT = Number(process.env.VITE_TEST_PORT) || 5258, OUT = path.resolve("tools/out/hover");
fs.mkdirSync(OUT, { recursive: true });
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;

async function login(page: Page, name: string) {
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

async function main() {
  process.env.VITE_SERVER_URL = `ws://localhost:${PORT}`;
  await startServer(true);
  const vite = await createServer({ configFile: path.resolve("vite.config.ts"), server: { port: VITE_PORT, strictPort: true, watch: { ignored: ["**/*"] } }, logLevel: "error" });
  await vite.listen();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, ignoreDefaultArgs: ["--hide-scrollbars"], args: ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader", "--disable-gpu-sandbox", "--window-size=1366,768", "--no-sandbox"], defaultViewport: { width: 1366, height: 768 }, protocolTimeout: 600000 });
  const stone = CITIES.find((c) => /Аурелион/.test(c.name))!.stone;
  let bad = 0;
  try {
    for (const zoom of [2, 3]) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("pageerror", String(e)));
      await page.evaluateOnNewDocument(`try { localStorage.setItem("zoom:v2", "${zoom}"); } catch {}`);
      await page.goto(`http://localhost:${VITE_PORT}/`, { waitUntil: "networkidle0" });
      await login(page, `Hv${zoom}`);
      await page.evaluate((x) => (window as any).__net.send("dbg", x), { op: "god" });
      await page.evaluate((x) => (window as any).__net.send("dbg", x), { op: "tp", x: stone.x + 70, y: stone.y + 50 });
      await sleep(3500);
      // точка мира → экран канваса (в CSS-пикселях страницы)
      const probe = async (label: string, wx: number, wy: number, want: "hit" | "miss", shot = false) => {
        const pos = await page.evaluate(`(() => { const s = window.__game.scene.getScene("game"), c = document.querySelector("#game canvas").getBoundingClientRect(), v = s.cameras.main.worldView; return { x: c.left + (${wx} - v.x) / v.width * c.width, y: c.top + (${wy} - v.y) / v.height * c.height }; })()`) as { x: number; y: number };
        await page.mouse.move(pos.x - 30, pos.y); await page.mouse.move(pos.x, pos.y);
        await sleep(450);
        const st = await page.evaluate(`(() => { const s = window.__game.scene.getScene("game"); return { cur: document.querySelector("#game canvas").style.cursor, glow: s.hoverGlow.img.visible && s.hoverGlow.img.alpha > 0.2, tip: !!document.querySelector(".interact-tip.show"), item: s.hoverItem && (s.hoverItem.kind || s.hoverItem.id || String(s.hoverItem)), m: [Math.round(s.mouse.x), Math.round(s.mouse.y)] }; })()`) as { cur: string; glow: boolean; tip: boolean; item: string; m: number[] };
        const hit = st.cur !== "" && st.glow && st.tip;
        const ok = want === "hit" ? hit : st.cur === "" && !st.glow;
        if (!ok) bad++;
        console.log(`зум ${zoom} ${label}: курсор ${st.cur ? "взять/говорить" : "стрелка"}, свечение ${st.glow}, подсказка ${st.tip}, под курсором ${st.item}@${st.m} -> ${ok ? "OK" : "ОШИБКА"}`);
        if (shot) await page.screenshot({ path: path.join(OUT, `z${zoom}-${label}.png`) });
      };
      await probe("верх", stone.x, stone.y - 40, "hit", true);
      await probe("макушка", stone.x, stone.y - 65, "hit");
      await probe("середина", stone.x, stone.y - 22, "hit");
      await probe("основание", stone.x, stone.y - 3, "hit");
      await probe("мимо", stone.x + 40, stone.y - 22, "miss", true);
      await probe("над", stone.x, stone.y - 160, "miss");
      // стоит мышь, герой не двигается: курсор держится; уводим мышь и проверяем сброс
      await probe("мимо2", stone.x + 40, stone.y - 22, "miss"); await sleep(400);
      const cur = await page.evaluate(`document.querySelector("#game canvas").style.cursor`);
      if (cur !== "") { bad++; console.log("после ухода курсор завис:", cur, await page.evaluate(`(() => { const s = window.__game.scene.getScene("game"); return JSON.stringify({ over: s.overUi, k: s.cursorKind, m: s.mouse, item: s.hoverItem && (s.hoverItem.kind || s.hoverItem.id || String(s.hoverItem)) }); })()`)); }

      // красное свечение врага: только контур. Запекаем свечение кадров разного размера (герой 32, питомец/моб, кадр побольше) и считаем заливку внутри силуэта
      const fill = await page.evaluate(`(() => { const s = window.__game.scene.getScene("game"), out = [];
        const keys = [...new Set([...s.units.values()].map((v) => v.sprite && v.sprite.texture && v.sprite.texture.key + "|" + v.sprite.frame.name).filter(Boolean))].slice(0, 6);
        for (const k of keys) { const [tex, fr] = k.split("|"); const key = s.hoverGlow.bake(tex, fr, "rgb(230,70,60)"); if (!key) continue;
          const f = s.textures.getFrame(tex, fr), g = s.textures.get(key).getSourceImage(), cx = g.getContext("2d"), P = 12;
          const bd = cx.getImageData(0, 0, g.width, g.height).data, sc = document.createElement("canvas"); sc.width = f.cutWidth; sc.height = f.cutHeight;
          const sx = sc.getContext("2d"); sx.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
          const sd = sx.getImageData(0, 0, sc.width, sc.height).data; let inside = 0, filled = 0, ring = 0;
          for (let y = 0; y < sc.height; y++) for (let x = 0; x < sc.width; x++) { const a = sd[(y * sc.width + x) * 4 + 3] > 200, b = bd[((y + P) * g.width + x + P) * 4 + 3]; if (a) { inside++; if (b > 40) filled++; } else if (b > 40) ring++; }
          out.push({ k, inside, filled, ring }); }
        return out; })()`) as { k: string; inside: number; filled: number; ring: number }[];
      for (const f of fill) {
        const ok = f.inside > 0 && f.filled / f.inside < 0.03 && f.ring > 0;
        if (!ok) bad++;
        console.log(`зум ${zoom} свечение ${f.k}: внутри ${f.inside}, залито ${f.filled}, контур ${f.ring} -> ${ok ? "OK" : "ОШИБКА (заливка)"}`);
      }
      if (!fill.length) { bad++; console.log("нет кадров для проверки свечения"); }
      await page.close();
    }
  } finally {
    await browser.close(); await vite.close(); await stopServer();
  }
  console.log(bad ? `ОШИБОК: ${bad}` : "hover: всё OK");
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
