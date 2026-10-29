/**
 * Монтаж «сейчас | новое» для полов помещений (tools/gen/floors.ts). Слева — снимок из игры на зуме 2 (интерьеры храма и зиккурата,
 * залы данжа) или, где помещения в игре нет, — тайлы атласа / пометка; справа — новый образец зала ×2. Ничего в игру не пишет.
 * Входы: tools/out/floors/now/*.png (снимки «сейчас» из tools/floors-ingame.ts), tools/out/floors/new/*.png. Запуск под tools/out/scenario.lock:
 *   npx tsx tools/floors-compare.ts → tools/out/floors/compare.png
 */
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PC } from "./gen/canvas";
import { readPng, crop, scaleNN } from "./gen/vendor-lib";
import { ROOMS } from "./gen/floors";
import { T } from "../shared/map";

const OUT = path.resolve("tools/out/floors");
const CW = 896, CH = 640;
const b64 = (pc: PC) => { const f = path.join(OUT, "_tmp.png"); pc.save(f); const d = fs.readFileSync(f).toString("base64"); fs.rmSync(f); return d; };
const shotCrop = (file: string, dy = 0): PC | null => {
  if (!fs.existsSync(file)) return null;
  const p = readPng(file);
  return crop(p, Math.max(0, Math.round(p.w / 2 - CW / 2)), Math.max(0, Math.round(p.h / 2 - CH / 2 + dy)), Math.min(CW, p.w), Math.min(CH, p.h));
};
/** Поле из полных тайлов атласа (столбцы 14–17 — варианты сплошного тайла) ×2. */
function atlasPatch(kinds: T[]): PC {
  const atlas = readPng(path.resolve("client/public/assets/tiles/terrain.png"));
  const pc = new PC(CW / 2, CH / 2);
  for (let ty = 0; ty < CH / 64; ty++) for (let tx = 0; tx < CW / 64; tx++) {
    const t = kinds[(tx * 7 + ty * 3) % kinds.length], v = (tx * 5 + ty * 11) % 4;
    pc.blit(crop(atlas, (14 + v) * 32, t * 32, 32, 32), tx * 32, ty * 32);
  }
  return scaleNN(pc, 2);
}

const NOW: Record<string, () => { pc: PC | null; note: string }> = {
  sol_church: () => ({ pc: shotCrop("tools/out/floors/now/sol_church.png"), note: "в игре, зум 2, день" }),
  umb_ziggurat: () => ({ pc: shotCrop("tools/out/floors/now/umb_ziggurat.png"), note: "в игре, зум 2, день" }),
  dg_cathedral: () => ({ pc: shotCrop("tools/out/floors/now/dg_cathedral.png"), note: "в игре, зум 2" }),
  dg_transition: () => ({ pc: shotCrop("tools/out/floors/now/dg_transition.png"), note: "в игре, зум 2" }),
  dg_ashen: () => ({ pc: shotCrop("tools/out/floors/now/dg_ashen.png"), note: "в игре, зум 2" }),
  crypt: () => ({ pc: atlasPatch([T.Marble, T.CrackedMarble]), note: "отдельного пола нет — тайлы атласа (мрамор), ×2" }),
  raid: () => (fs.existsSync("tools/out/floors/now/raid.png") ? { pc: shotCrop("tools/out/floors/now/raid.png"), note: "в игре, зум 2, день" } : { pc: atlasPatch([T.Obsidian, T.Obsidian, T.Ash, T.Cobble]), note: "тайлы атласа рейда (обсидиан, пепел, брусчатка), ×2" }),
};

async function main() {
  const rows: string[] = [];
  for (const r of ROOMS) {
    const neu = readPng(path.join(OUT, "new", `${r.id}.png`));
    const now = NOW[r.id]?.() ?? { pc: null, note: "в игре помещения нет (вход только в храмы столиц)" };
    const left = now.pc ? `<img src="data:image/png;base64,${b64(now.pc)}">` : `<div class="none">помещения нет</div>`;
    rows.push(`<section><h2>${r.title}</h2><div class="pair"><figure>${left}<figcaption>сейчас — ${now.note}</figcaption></figure><figure><img src="data:image/png;base64,${b64(scaleNN(neu, 2))}"><figcaption>новое — образец зала ×2 (свет сверху-слева)</figcaption></figure></div></section>`);
  }
  const html = `<html><head><style>body{margin:0;padding:12px;background:#0e0c12;color:#efe6d2;font:16px sans-serif}h1{font-size:22px;margin:4px 0 12px;color:#d6a84b}
h2{font-size:18px;margin:14px 0 6px;color:#d6a84b}.pair{display:flex;gap:12px}figure{margin:0;width:${CW}px}img{display:block;image-rendering:pixelated;width:${CW}px;height:${CH}px;object-fit:none;object-position:center;background:#000}
figcaption{font-size:14px;color:#b8b0c0;padding:4px 0}.none{width:${CW}px;height:${CH}px;display:flex;align-items:center;justify-content:center;background:#18151e;color:#6e6878;font-size:28px}</style></head>
<body><h1>Полы помещений: сейчас | новое</h1>${rows.join("")}</body></html>`;
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: CW * 2 + 36, height: 800 });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: path.join(OUT, "compare.png"), fullPage: true });
  } finally { await browser.close(); }
  console.log("compare.png готов");
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
