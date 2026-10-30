/** Второй проход 1030: пишет ТОЛЬКО свои id (PROPS2) в client/public/assets/objects, размер кадра — по манифесту. Без npm run assets. Затем: npx tsx tools/gen/atlas.ts */
import fs from "node:fs";
import path from "node:path";
import { PC } from "./gen/canvas";
import { ROOT, writePng } from "./gen/vendor-lib";
import { PROPS2 } from "./gen/volume-props2";
const OBJ = path.join(ROOT, "client/public/assets/objects");
const man = JSON.parse(fs.readFileSync(path.join(ROOT, "client/public/assets/manifest.json"), "utf8"));
const only = process.argv.slice(2);
for (const [id, f] of Object.entries(PROPS2)) {
  if (only.length && !only.includes(id)) continue;
  const pc: PC = f(), want = man.objects[id];
  let x0 = pc.w, y0 = pc.h, x1 = -1, y1 = -1;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (pc.alpha(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, o = new PC(want.w, want.h);
  if (tw > want.w || th > want.h) throw new Error(`${id}: ${tw}x${th} > ${want.w}x${want.h}`);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const c = pc.get(x0 + x, y0 + y)!; if (c[3]) o.set(Math.floor((want.w - tw) / 2) + x, want.h - th + y, c); }
  writePng(o, path.join(OBJ, id + ".png"));
  console.log(id, `${tw}x${th} -> ${want.w}x${want.h}`);
}
