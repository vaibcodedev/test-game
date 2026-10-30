/** Проверка обрезки: непрозрачные пиксели в крайних столбцах/строках кадра. npx tsx tools/edge-check-1030c.ts [prefix...] ; BEFORE=1 — по tools/out/volume-1030c/before */
import fs from "node:fs";
import path from "node:path";
import { ROOT, readPng } from "./gen/vendor-lib";
const dir = process.env.BEFORE ? path.join(ROOT, "tools/out/volume-1030c/before") : path.join(ROOT, "client/public/assets/objects");
const pre = process.argv.slice(2).length ? process.argv.slice(2) : ["umb_", "pal_", "bridge_"];
let bad = 0;
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith(".png") || !pre.some((p) => f.startsWith(p))) continue;
  const c = readPng(path.join(dir, f)), e: string[] = [];
  const col = (x: number) => { let n = 0; for (let y = 0; y < c.h; y++) if (c.alpha(x, y)) n++; return n; };
  const row = (y: number) => { let n = 0; for (let x = 0; x < c.w; x++) if (c.alpha(x, y)) n++; return n; };
  if (col(c.w - 1) > 2) e.push(`право:${col(c.w - 1)}`); if (col(0) > 2) e.push(`лево:${col(0)}`); if (row(0) > 2) e.push(`верх:${row(0)}`);
  if (e.length) { bad++; console.log(f, c.w + "x" + c.h, e.join(" ")); }
}
console.log("кадров с касанием края:", bad);
