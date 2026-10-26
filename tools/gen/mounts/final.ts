/**
 * Задача 142: «пропорции» — все модели маунтов из игры (client/public/assets/mounts, manifest.mounts) в одном масштабе рядом
 * с героем: стоящий герой, маунт без всадника и с всадником; вид вправо в покое и все 4 направления; гербовые — обе фракции.
 * Запуск: npx tsx tools/gen/mounts/final.ts → tools/out/mounts-final/proportions.png, directions.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAssets, withRider, sceneRow, stackRows, crop, type Cell } from "./lib";
import { loadPC, PC } from "../mobs/lib";
import { MODELS, ART } from "./catalog";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "tools", "out", "mounts-final");
const ASSETS = path.join(ROOT, "client", "public", "assets");

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const A = loadAssets(ROOT);
  const man = JSON.parse(fs.readFileSync(path.join(ASSETS, "manifest.json"), "utf8")).mounts;
  const W = 4200, k = 3;
  const heroCell = (h: PC): Cell => { const c = new PC(40, 40); c.blit(crop(h, 0, 2 * 32, 32, 32), 4, 6); return { img: c, GY: 36 }; };
  const rows = [];
  const items: { id: string; ru: string; fac: "" | "umbrath"; meta: any }[] = [];
  for (const m of MODELS) {
    const meta = man[m.id];
    if (!meta) continue;
    items.push({ id: m.id, ru: m.ru, fac: "", meta });
    if (m.heraldic) items.push({ id: m.id, ru: m.ru + " (Умбрат)", fac: "umbrath", meta });
  }
  const sheetOf = (id: string, fac: string) => loadPC(path.join(ASSETS, "mounts", `${id}${fac ? "_" + fac : ""}.png`));
  for (let g = 0; g < items.length; g += 5) {
    const part = items.slice(g, g + 5);
    for (const night of [false]) {
      const cells: Cell[] = [heroCell(A.heroes.warrior)];
      for (const it of part) {
        const s = sheetOf(it.id, it.fac), M = it.meta, col = M.run;
        cells.push({ img: withRider(s, M.frame, M.gy, col, 2, M.seat[2][col], null).img, GY: M.gy });
        cells.push({ img: withRider(s, M.frame, M.gy, col, 2, M.seat[2][col], it.fac ? A.heroes.deathknight : A.heroes.warrior).img, GY: M.gy });
        cells.push({ img: new PC(1, 1), GY: 0, label: "|" });
      }
      rows.push(sceneRow(`×${k} · ПРОПОРЦИИ · ГЕРОЙ | ${part.map((p) => p.ru.toUpperCase()).join(" | ")}`, cells, A, night, W, k, 200));
    }
  }
  stackRows(rows, W).save(path.join(OUT, "proportions.png"));
  // 4 направления с всадником, покой, ×2
  const rows2 = [];
  for (let g = 0; g < items.length; g += 4) {
    const part = items.slice(g, g + 4), cells: Cell[] = [];
    for (const it of part) {
      const s = sheetOf(it.id, it.fac), M = it.meta, col = M.run;
      for (let r = 0; r < 4; r++) cells.push({ img: withRider(s, M.frame, M.gy, col, r, M.seat[r][col], it.fac ? A.heroes.deathknight : A.heroes.warrior).img, GY: M.gy });
      cells.push({ img: new PC(1, 1), GY: 0, label: "|" });
    }
    rows2.push(sceneRow(`×2 · ВНИЗ ВВЕРХ ВПРАВО ВЛЕВО · ${part.map((p) => p.ru.toUpperCase()).join(" | ")}`, cells, A, false, W, 2, 200));
  }
  stackRows(rows2, W).save(path.join(OUT, "directions.png"));
  const map = Object.entries(ART).map(([id, m]) => `${id} → ${m}`).join(", ");
  console.log(`${OUT}\n${map}`);
}
main();
