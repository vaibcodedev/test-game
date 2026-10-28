/** Лист «до / после» для 4 арен в бою на зуме 1,75: tools/out/arena/v2.png (из tools/out/arena/v2/<карта>-<before|after>-<A|B>.png). */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hex } from "./canvas";

const D = path.resolve("tools/out/arena");
function load(f: string): PC {
  const p = PNG.sync.read(fs.readFileSync(f)), pc = new PC(p.width, p.height);
  pc.data.set(p.data);
  return pc;
}
function down(src: PC, w: number): PC {
  const f = src.w / w, h = Math.round(src.h / f), o = new PC(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = Math.floor(y * f); j < Math.min(src.h, Math.ceil((y + 1) * f)); j++) for (let i = Math.floor(x * f); i < Math.min(src.w, Math.ceil((x + 1) * f)); i++) { const c = src.get(i, j)!; r += c[0]; g += c[1]; b += c[2]; n++; }
    o.set(x, y, [r / n, g / n, b / n, 255]);
  }
  return o;
}
const ids = ["ash", "sun", "pit", "frost"], TW = 780, G = 8;
const rows: PC[][] = [];
for (const id of ids) for (const v of ["A", "B"]) rows.push((process.env.TAGS || "before,after").split(",").map((t) => down(load(path.join(D, `v2/${id}-${t}-${v}.png`)), TW)));
const th = rows[0][0].h, out = new PC((TW + G) * 2, (th + G) * rows.length);
out.rect(0, 0, out.w, out.h, hex("#0e0c12"));
rows.forEach((r, j) => r.forEach((t, i) => out.blit(t, i * (TW + G), j * (th + G))));
out.save(path.join(D, process.env.OUTNAME || "v2.png"));
console.log("v2", out.w, out.h);
