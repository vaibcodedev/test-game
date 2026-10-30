/** Задача 147: рост листов _b147 (силуэт) и края кадров — сводка для проверки. Запуск: npx tsx tools/gen/scale147/heights.ts */
import fs from "node:fs";
import path from "node:path";
import { A, png, unitHeight } from "./measure";
const man = JSON.parse(fs.readFileSync(path.join(A, "manifest.json"), "utf8"));
const out: string[] = [];
for (const [id, u] of Object.entries<any>(man.units)) if (id.endsWith("_b147")) { const r = unitHeight(path.join(A, "units", id + ".png"), u.frame, u.frame); out.push(`${id.replace("_b147", "")} ${r.h}${r.edge ? "!" : ""}`); }
console.log(out.sort().join("; "));
// края: непрозрачный пиксель на рамке любого кадра листа
const edge: string[] = [];
for (const [id, u] of Object.entries<any>(man.units)) if (id.endsWith("_b147")) {
  const p = png(path.join(A, "units", id + ".png")), N = u.frame;
  let hits = 0;
  for (let fy = 0; fy < p.height; fy += N) for (let fx = 0; fx < p.width; fx += N) for (let k = 0; k < N; k++)
    for (const [x, y] of [[fx + k, fy], [fx, fy + k], [fx + N - 1, fy + k]]) if (p.data[(y * p.width + x) * 4 + 3] > 40) hits++;
  if (hits) edge.push(`${id} ${hits}`);
}
console.log(edge.length ? `края: ${edge.join(", ")}` : "края чисты");
