/** Ворота 4 арен: спрайты ×4 (tools/out/arena/gates-art.png) и, если есть снимки боя v2/<карта>-<TAG>-C.png, лист gates.png (спрайты + бой крупно). */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hex } from "./canvas";
import { gateSprite } from "./arena-sprites";

const D = path.resolve("tools/out/arena"), TAG = process.env.TAG || "gate";
const ids = ["ash", "sun", "pit", "frost"], Z = 4;
const zoom = (src: PC, z: number): PC => { const o = new PC(src.w * z, src.h * z); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const c = src.get(Math.floor(x / z), Math.floor(y / z)); if (c && c[3]) o.set(x, y, c); } return o; };
function load(f: string): PC { const p = PNG.sync.read(fs.readFileSync(f)), pc = new PC(p.width, p.height); pc.data.set(p.data); return pc; }
function down(src: PC, w: number): PC {
  const f = src.w / w, h = Math.round(src.h / f), o = new PC(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = Math.floor(y * f); j < Math.min(src.h, Math.ceil((y + 1) * f)); j++) for (let i = Math.floor(x * f); i < Math.min(src.w, Math.ceil((x + 1) * f)); i++) { const c = src.get(i, j)!; r += c[0]; g += c[1]; b += c[2]; n++; }
    o.set(x, y, [r / n, g / n, b / n, 255]);
  }
  return o;
}
const sprites = ids.map((id) => zoom(gateSprite(id), Z));
const bgs: Record<string, string> = { ash: "#241820", sun: "#c9b48c", pit: "#2a3622", frost: "#e6eef8" };
const row = new PC(sprites.reduce((a, s) => a + s.w + 8, 0), sprites[0].h + 8);
row.rect(0, 0, row.w, row.h, hex("#0e0c12"));
let x = 0;
sprites.forEach((s, i) => { row.rect(x, 0, s.w, s.h + 8, hex(bgs[ids[i]])); row.blit(s, x, 4); x += s.w + 8; });
row.save(path.join(D, "gates-art.png"));
const shots = ids.map((id) => path.join(D, `v2/${id}-${TAG}-C.png`));
if (shots.every((f) => fs.existsSync(f))) {
  const TW = Math.floor(row.w / 2) - 4, tiles = shots.map((f) => down(load(f), TW));
  const th = tiles[0].h, sheet = new PC(row.w, row.h + 8 + (th + 8) * 2);
  sheet.rect(0, 0, sheet.w, sheet.h, hex("#0e0c12"));
  sheet.blit(row, 0, 0);
  tiles.forEach((t, i) => sheet.blit(t, (i % 2) * (TW + 8), row.h + 8 + Math.floor(i / 2) * (th + 8)));
  sheet.save(path.join(D, "gates.png"));
  console.log("gates sheet", sheet.w, sheet.h);
} else console.log("gates art", row.w, row.h);
