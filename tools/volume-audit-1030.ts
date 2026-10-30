/** Аудит объёма объектов (задача 1030): метрики по кадрам + листы. Запуск: node node_modules/tsx/dist/cli.mjs tools/volume-audit-1030.ts [id ...] */
import fs from "node:fs";
import path from "node:path";
import { PC } from "./gen/canvas";
import { ROOT, readPng, writePng, scaleNN, paintGround, chipText, fill, BG } from "./gen/vendor-lib";
const OBJ = path.join(ROOT, "client/public/assets/objects"), OUT = path.join(ROOT, "tools/out/volume-1030");
fs.mkdirSync(OUT, { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(ROOT, "client/public/assets/manifest.json"), "utf8"));
export function metrics(pc: PC) {
  let op = 0, iso = 0; const cols = new Set<number>(); let dark = 0, botRows = 0;
  let maxY = -1;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y) > 40) maxY = y;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    if (pc.alpha(x, y) <= 40) continue; op++;
    const c = pc.get(x, y)!; cols.add((c[0] >> 3) << 10 | (c[1] >> 3) << 5 | (c[2] >> 3));
    let n = 0; for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (pc.alpha(x + dx, y + dy) > 40) { const d = pc.get(x + dx, y + dy)!; if (Math.abs(d[0]-c[0])+Math.abs(d[1]-c[1])+Math.abs(d[2]-c[2]) < 24) n++; }
    if (n === 0) iso++;
  }
  // нижние 3 ряда непрозрачного: есть ли тёмный контакт
  for (let y = Math.max(0, maxY - 2); y <= maxY; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y) > 40) { botRows++; const c = pc.get(x, y)!; if (c[0] + c[1] + c[2] < 150) dark++; }
  return { w: pc.w, h: pc.h, op, colors: cols.size, isoPct: +(100 * iso / Math.max(1, op)).toFixed(1), contactPct: +(100 * dark / Math.max(1, botRows)).toFixed(0), emptyBelow: pc.h - 1 - maxY };
}
if (process.argv[1].endsWith("volume-audit-1030.ts")) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(man.objects).filter((k) => !k.includes("__") && !k.startsWith("v_") && !/^(dg_|bf_)/.test(k));
  const rows: any[] = [];
  for (const id of ids) { const f = path.join(OBJ, id + ".png"); if (!fs.existsSync(f)) continue; rows.push({ id, ...metrics(readPng(f)) }); }
  fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(rows));
  for (const r of rows) console.log(r.id.padEnd(22), `${r.w}x${r.h}`.padEnd(8), "col", String(r.colors).padEnd(4), "iso%", String(r.isoPct).padEnd(5), "contact%", String(r.contactPct).padEnd(4), "below", r.emptyBelow);
}
