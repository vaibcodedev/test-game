/**
 * Задача 142: сверка каталога маунтов с артом. Для каждого id из data/mounts.json: имя и описание из data, печать
 * icons/mseal_<id>.png и иконка icons/mount_<id>.png из игры, первый кадр покоя и бега новой модели (ART в catalog.ts),
 * вердикт и предложение текста (proposals.ts); ниже — новые модели без маунта в data. Гербовые — Сольгард и Умбрат.
 * Запуск (под tools/out/scenario.lock, с низким приоритетом): npx tsx tools/gen/mounts/audit.ts
 *   → tools/out/mounts-audit.html, tools/out/mounts-audit.png (снимок страницы), tools/out/mounts-final/umbrath-pairs.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { renderMount, loadAssets, sceneRow, stackRows, pngDataUrl, crop, type Cell } from "./lib";
import { PC, loadPC } from "../mobs/lib";
import { MODELS, ART, modelById } from "./catalog";
import { PROPOSALS } from "./proposals";
import { iconFromFrame } from "./build";
import { sealIconFor } from "../icons-items";
import type { Fac } from "./lib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ICONS = path.join(ROOT, "client", "public", "assets", "icons");
const A = loadAssets(ROOT);

function frame(model: string, fac: Fac, anim: "idle" | "run", i: number, rider: boolean): PC {
  const spec = modelById(model)!.spec(fac);
  const L = renderMount(spec, { anim, i, n: anim === "run" ? 20 : 24 }, "side");
  const N = spec.N, c = new PC(N, N);
  c.blit(L.back, 0, 0);
  if (rider) c.blit(crop(fac === "umbrath" ? A.heroes.deathknight : A.heroes.warrior, 0, 64, 32, 32), N / 2 + Math.round(L.seat[0]) - 16, spec.GY + Math.round(L.seat[1]) + 9 - 30);
  c.blit(L.front, 0, 0);
  // обрезка по содержимому с полем
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (c.alpha(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return crop(c, x0 - 2, y0 - 2, x1 - x0 + 5, y1 - y0 + 5);
}
/** Иконка маунта и печати модели для фракции (как пишет build.ts) — пара «Сольгард | Умбрат» в сверке. */
function iconPair(model: string, fac: Fac): [string, string] {
  const spec = modelById(model)!.spec(fac);
  const L = renderMount(spec, { anim: "idle", i: 0, n: 24 }, "side");
  const f = new PC(spec.N, spec.N); f.blit(L.back, 0, 0); f.blit(L.front, 0, 0);
  const ic = iconFromFrame(f);
  const seal = path.join(ICONS, "mount_seal.png");
  return [pngDataUrl(ic), fs.existsSync(seal) ? pngDataUrl(sealIconFor(loadPC(seal), ic)) : ""];
}
const icon = (f: string) => (fs.existsSync(f) ? pngDataUrl(loadPC(f)) : "");
const img = (src: string, k = 2) => (src ? `<img src="${src}" style="image-rendering:pixelated;zoom:${k}">` : `<span class="no">нет</span>`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "mounts.json"), "utf8")).mounts as Record<string, { name: string; desc: string; tier: string; source: string; faction: string; flying: boolean; names?: Record<string, { name?: string; desc?: string }> }>;
  const pairs = (n?: Record<string, { name?: string; desc?: string }>) => (n ? `<br><small>Сольгард: «${esc(n.solgard?.name ?? "")}»<br>Умбрат: «${esc(n.umbrath?.name ?? "")}»</small>` : "");
  const ppairs = (n?: { solgard: [string, string]; umbrath: [string, string] }) => (n ? `<br><small><b>Сольгард:</b> «${esc(n.solgard[0])}» — ${esc(n.solgard[1])}<br><b>Умбрат:</b> «${esc(n.umbrath[0])}» — ${esc(n.umbrath[1])}</small>` : "");
  const rows: string[] = [];
  const issues: string[] = [];
  for (const [id, d] of Object.entries(data)) {
    const model = ART[id], m = model ? modelById(model) : undefined, pr = PROPOSALS.find((p) => p.id === id);
    const idle = m ? pngDataUrl(frame(model, "solgard", "idle", 0, false)) : "";
    const run = m ? pngDataUrl(frame(model, "solgard", "run", 4, true)) : "";
    const um = m?.heraldic ? pngDataUrl(frame(model, "umbrath", "idle", 0, true)) : "";
    const same = pr && pr.name === d.name;
    const verdict = !m ? "нет модели" : same ? "совпадает" : "не совпадает: имя/описание о другом звере или броне";
    if (!same) issues.push(`${id}: «${d.name}» → арт «${m?.ru ?? "—"}»`);
    rows.push(`<tr><td><b>${id}</b><br><small>${d.tier} · ${d.source}${d.faction ? " · " + d.faction : ""}${d.flying ? " · летающий" : ""}</small></td>
      <td>${esc(d.name)}${pairs(d.names)}</td><td class="ic">${img(icon(path.join(ICONS, `mount_${id}.png`)))}</td><td class="ic">${img(icon(path.join(ICONS, `mseal_${id}.png`)))}</td>
      <td class="ic">${m ? (() => { const so = iconPair(model, "solgard"); const um2 = m.heraldic ? iconPair(model, "umbrath") : null; return `${img(so[0])} ${img(so[1])}${um2 ? `<br>${img(um2[0])} ${img(um2[1])}<br><small>Сольгард | Умбрат</small>` : ""}`; })() : ""}</td>
      <td class="fr">${img(idle)}${um ? `<br>${img(um)}<br><small>Умбрат</small>` : ""}</td><td class="fr">${img(run)}</td>
      <td><small>${esc(d.desc)}</small></td><td class="${same ? "ok" : "bad"}">${verdict}</td>
      <td>${pr ? `<b>${esc(pr.name)}</b><br><small>${esc(pr.desc)}</small><br><small>${pr.tier} · ${pr.source}${pr.faction !== undefined ? ` · фракция «${pr.faction}»` : ""}${pr.note ? ` · ${esc(pr.note)}` : ""}</small>${ppairs(pr.names)}` : ""}</td></tr>`);
  }
  const spare: string[] = [];
  for (const pr of PROPOSALS.filter((p) => p.isNew)) {
    const m = modelById(pr.model)!;
    spare.push(`<tr><td><b>${pr.id}</b><br><small>новый</small></td><td>${esc(pr.name)}</td>
      <td class="fr">${img(pngDataUrl(frame(pr.model, "solgard", "idle", 0, false)))}${m.heraldic ? `<br>${img(pngDataUrl(frame(pr.model, "umbrath", "idle", 0, true)))}<br><small>Умбрат</small>` : ""}</td>
      <td class="fr">${img(pngDataUrl(frame(pr.model, "solgard", "run", 4, true)))}</td>
      <td><small>${esc(pr.desc)}</small>${ppairs(pr.names)}</td><td><small>${pr.tier} · ${pr.source}${pr.note ? " · " + esc(pr.note) : ""}</small></td><td><small>${m.refs.join(", ")}</small></td></tr>`);
  }
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Маунты: сверка</title><style>
body{background:#1b1820;color:#e8e0d0;font:13px system-ui;margin:16px;width:1880px}table{border-collapse:collapse;width:100%;margin-bottom:24px}
td,th{border:1px solid #3a3440;padding:6px;vertical-align:middle}th{background:#2a2430;text-align:left}.ic{background:#2e2a34;text-align:center}
.fr{background:#5f7f48;text-align:center}.ok{color:#8fe08f}.bad{color:#ff9a7a}.no{color:#888}small{color:#b8b0a4}h2{font-size:16px}</style></head><body>
<h1 style="font-size:18px">Задача 142 — сверка маунтов: id | имя | иконка и печать в игре | новые иконка и печать (у гербовых — Сольгард | Умбрат) | покой | бег | описание (data) | вердикт | предложение</h1>
<table><tr><th>id</th><th>имя (data)</th><th>иконка (игра)</th><th>печать (игра)</th><th>новые иконка и печать</th><th>покой ×2</th><th>бег ×2</th><th>описание (data)</th><th>вердикт</th><th>предложение под новый арт</th></tr>${rows.join("")}</table>
<h2>Новые модели по референсам (в data ещё нет) — предложение</h2>
<table><tr><th>id</th><th>имя</th><th>покой ×2</th><th>бег ×2</th><th>описание</th><th>ярус · источник</th><th>референс</th></tr>${spare.join("")}</table>
<h2>Расхождения (${issues.length})</h2><ul>${issues.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
<p>Печати mseal_* нарисованы под старых зверей — после согласования имён их надо перерисовать (icons-items.ts — не мой файл).</p></body></html>`;
  const out = path.join(ROOT, "tools", "out");
  fs.writeFileSync(path.join(out, "mounts-audit.html"), html);
  fs.writeFileSync(path.join(out, "mounts-audit.json"), JSON.stringify({ issues, proposals: PROPOSALS }, null, 1));
  // пары гербовых: Сольгард | Умбрат, вбок и вниз, с героем своей фракции
  const pr: ReturnType<typeof sceneRow>[] = [];
  for (const m of MODELS.filter((q) => q.heraldic)) {
    const cells: Cell[] = [];
    for (const fac of ["solgard", "umbrath"] as Fac[]) for (const v of ["side", "down", "up"] as const) {
      const spec = m.spec(fac), L = renderMount(spec, { anim: "idle", i: 0, n: 24 }, v), N = spec.N, c = new PC(N, N);
      c.blit(L.back, 0, 0);
      c.blit(crop(fac === "umbrath" ? A.heroes.deathknight : A.heroes.warrior, 0, { side: 2, down: 0, up: 1 }[v] * 32, 32, 32), N / 2 + Math.round(L.seat[0]) - 16, spec.GY + Math.round(L.seat[1]) + 9 - 30);
      c.blit(L.front, 0, 0);
      cells.push({ img: c, GY: spec.GY });
      if (v === "up") cells.push({ img: new PC(1, 1), GY: 0, label: "|" });
    }
    pr.push(sceneRow(`×2 · ${m.ru.toUpperCase()} · СОЛЬГАРД | УМБРАТ · ВБОК ВНИЗ ВВЕРХ`, cells, A, false, 2400, 2, 200));
  }
  fs.mkdirSync(path.join(out, "mounts-final"), { recursive: true });
  stackRows(pr, 2400).save(path.join(out, "mounts-final", "umbrath-pairs.png"));
  // снимок страницы сверки: Chrome без окна, одна вкладка
  const chrome = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((x) => x && fs.existsSync(x))!;
  const br = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await br.newPage();
    await page.setViewport({ width: 1920, height: 1000 });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: path.join(out, "mounts-audit.png"), fullPage: true });
  } finally { await br.close(); }
  console.log(`расхождений: ${issues.length}\n${issues.join("\n")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
