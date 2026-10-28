/** Сводный лист арен: tools/out/arena/ingame.png (снимки боя 4 карт) и sheet.png (превью арт + снимки). */
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
const ids = ["ash", "sun", "pit", "frost"], kinds = ["1-start", "2-ovation", "3-bubbles"];
const TW = 620, G = 8;
const tiles = ids.map((id) => kinds.map((k) => down(load(path.join(D, `ingame/${id}-${k}.png`)), TW)));
const th = tiles[0][0].h;
const shots = new PC((TW + G) * 3, (th + G) * 4);
shots.rect(0, 0, shots.w, shots.h, hex("#0e0c12"));
tiles.forEach((row, j) => row.forEach((t, i) => shots.blit(t, i * (TW + G), j * (th + G))));
shots.save(path.join(D, "ingame.png"));
const art = load(path.join(D, "preview.png")), W = Math.max(art.w, shots.w);
const sheet = new PC(W, art.h + G + shots.h);
sheet.rect(0, 0, W, sheet.h, hex("#0e0c12"));
sheet.blit(art, 0, 0);
sheet.blit(shots, 0, art.h + G);
sheet.save(path.join(D, "sheet.png"));
console.log("sheet", sheet.w, sheet.h);
