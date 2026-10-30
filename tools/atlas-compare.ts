/**
 * Лист сравнения атласа объектов (docs/plan/next.md, 3.1): строки «до | после | разница» по снимкам tests/perf-run.ts --only=stills
 * (tools/out/atlas/{before,after}-{city,forest}-z{2.25,1.75}.png) и цифры замера (tools/out/perf/atlas-{before,after}/report.json):
 * вызовы отрисовки на кадр и p95 кадра. Результат — tools/out/atlas/compare.png и compare.json.
 * Запуск: npx tsx tools/atlas-compare.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, type RGBA } from "./gen/canvas";
import { drawText } from "./gen/vendor-lib";

const DIR = path.resolve("tools/out/atlas"), PERF = path.resolve("tools/out/perf");
const r1 = (v: number) => Math.round(v * 10) / 10;
const rep = (label: string) => { try { return JSON.parse(fs.readFileSync(path.join(PERF, label, "report.json"), "utf8")); } catch { return null; } };
const before = rep("atlas-before"), after = rep("atlas-after");
const seg = (r: any, s: string) => (r?.[s] ? { draw: r1((r[s].perSecond?.draw ?? 0) / r[s].fps), p95: r[s].dt.p95, p50: r[s].dt.p50, fps: r[s].fps, texUpload: r1((r[s].perSecond?.texUpload ?? 0)) } : null);
const nums = Object.fromEntries(["city", "forest"].map((s) => [s, { before: seg(before, s), after: seg(after, s) }]));

const rows: { name: string; a: PNG; b: PNG; diff: number; total: number }[] = [];
for (const z of ["2.25", "1.75"]) for (const place of ["city", "forest"]) {
  const fa = path.join(DIR, `before-${place}-z${z}.png`), fb = path.join(DIR, `after-${place}-z${z}.png`);
  if (!fs.existsSync(fa) || !fs.existsSync(fb)) continue;
  const a = PNG.sync.read(fs.readFileSync(fa)), b = PNG.sync.read(fs.readFileSync(fb));
  let diff = 0;
  if (a.width === b.width && a.height === b.height) for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 12) diff++;
  rows.push({ name: `${place} zoom ${z}`, a, b, diff, total: a.width * a.height });
}
if (!rows.length) throw new Error("нет снимков в tools/out/atlas");

const W = rows[0].a.width, H = rows[0].a.height, GAP = 8, HEAD = 70, LAB = 22;
const out = new PC(W * 3 + GAP * 4, HEAD + rows.length * (H + LAB + GAP) + GAP);
out.data.fill(0); for (let i = 3; i < out.data.length; i += 4) { out.data[i] = 255; out.data[i - 3] = 24; out.data[i - 2] = 20; out.data[i - 1] = 28; }
const T: RGBA = [239, 230, 210, 255], G: RGBA = [140, 230, 120, 255], R: RGBA = [255, 120, 100, 255];
const line = (s: string, y: number, c: RGBA = T) => drawText(out, s, GAP, y, c, 3);
line("ATLAS OF MAP OBJECTS: BEFORE (ONE TEXTURE PER OBJECT) | AFTER (OBJS ATLASES) | DIFF", 6);
for (const [i, s] of (["city", "forest"] as const).entries()) {
  const n = nums[s];
  if (!n.before || !n.after) continue;
  line(`${s.toUpperCase()}: DRAW CALLS/FRAME ${n.before.draw} -> ${n.after.draw}   P95 FRAME ${n.before.p95} -> ${n.after.p95} MS   FPS ${n.before.fps} -> ${n.after.fps}`, 28 + i * 20, n.after.draw < n.before.draw ? G : R);
}
const blit = (src: PNG, x0: number, y0: number) => { for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) { const i = (y * src.width + x) * 4, o = ((y0 + y) * out.w + x0 + x) * 4; out.data[o] = src.data[i]; out.data[o + 1] = src.data[i + 1]; out.data[o + 2] = src.data[i + 2]; out.data[o + 3] = 255; } };
rows.forEach((r, k) => {
  const y0 = HEAD + k * (H + LAB + GAP);
  drawText(out, `${r.name.toUpperCase()}   BEFORE`, GAP, y0, T, 3);
  drawText(out, "AFTER", GAP * 2 + W, y0, T, 3);
  drawText(out, `DIFF ${r.diff} PX (${r1((r.diff / r.total) * 100)}%)`, GAP * 3 + W * 2, y0, r.diff ? R : G, 3);
  blit(r.a, GAP, y0 + LAB); blit(r.b, GAP * 2 + W, y0 + LAB);
  // разница: тусклая картинка «после», отличающиеся пиксели — красным
  const dx = GAP * 3 + W * 2;
  for (let y = 0; y < r.a.height; y++) for (let x = 0; x < r.a.width; x++) {
    const i = (y * r.a.width + x) * 4, o = ((y0 + LAB + y) * out.w + dx + x) * 4;
    const d = Math.abs(r.a.data[i] - r.b.data[i]) + Math.abs(r.a.data[i + 1] - r.b.data[i + 1]) + Math.abs(r.a.data[i + 2] - r.b.data[i + 2]);
    if (d > 12) { out.data[o] = 255; out.data[o + 1] = 40; out.data[o + 2] = 40; }
    else { out.data[o] = r.b.data[i] * 0.3; out.data[o + 1] = r.b.data[i + 1] * 0.3; out.data[o + 2] = r.b.data[i + 2] * 0.3; }
    out.data[o + 3] = 255;
  }
});
out.save(path.join(DIR, "compare.png"));
fs.writeFileSync(path.join(DIR, "compare.json"), JSON.stringify({ nums, shots: rows.map((r) => ({ name: r.name, diffPx: r.diff, pct: r1((r.diff / r.total) * 100) })) }, null, 1));
console.log(JSON.stringify(nums));
for (const r of rows) console.log(`${r.name}: разница ${r.diff} px (${r1((r.diff / r.total) * 100)}%)`);
console.log(`-> ${path.relative(process.cwd(), path.join(DIR, "compare.png"))}`);
