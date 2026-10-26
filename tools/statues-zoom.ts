import { PNG } from "pngjs";
import fs from "node:fs";
import { PC, hex } from "./gen/canvas";
const read = (f: string) => { const p = PNG.sync.read(fs.readFileSync(f)); const pc = new PC(p.width, p.height); pc.data.set(p.data); return pc; };
const [f, x0, y0, w, h, k, out] = process.argv.slice(2); const s = read(f); const K = +k;
const o = new PC(+w * K, +h * K);
for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const p = s.get(+x0 + Math.floor(x / K), +y0 + Math.floor(y / K)); o.set(x, y, p && p[3] ? p : hex("#4c7a3a")); }
o.save(out);
