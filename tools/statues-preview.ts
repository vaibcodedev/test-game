import { PNG } from "pngjs";
import fs from "node:fs";
import { PC, hex } from "./gen/canvas";
import { solStatue, umbStatue, writeStatueFire } from "./gen/statues";
const D = "tools/out/statues";
const read = (f: string) => { const p = PNG.sync.read(fs.readFileSync(f)); const pc = new PC(p.width, p.height); pc.data.set(p.data); return pc; };
const crop = (s: PC, x0: number, y0: number, w: number, h: number) => { const o = new PC(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = s.get(x0 + x, y0 + y); if (p) o.set(x, y, p); } return o; };
const up = (s: PC, k: number) => { const o = new PC(s.w * k, s.h * k); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const p = s.get(Math.floor(x / k), Math.floor(y / k)); if (p) o.set(x, y, p); } return o; };
const hero = crop(read("client/public/assets/units/warrior.png"), 0, 0, 32, 32);
const sol = solStatue(), umb = umbStatue();
sol.save(`${D}/sun_statue.png`); umb.save(`${D}/umb_statue.png`);
const scene = (k: number) => {
  const W = 64 * 2 + 32 + 50, o = new PC(W, 160);
  for (let y = 0; y < 160; y++) for (let x = 0; x < W; x++) o.set(x, y, hex("#4c7a3a"));
  o.blit(sol, 8, 4); o.blit(hero, 8 + 64 + 6, 160 - 32 - 4); o.blit(umb, 8 + 64 + 6 + 32 + 6, 4);
  return up(o, k);
};
const a = scene(1), b = scene(3);
const out = new PC(b.w, b.h + a.h + 8);
out.blit(b, 0, 0); out.blit(a, 0, b.h + 8);
out.save(`${D}/close.png`);
if (process.argv[2] === "install") { writeStatueFire("client/public/assets"); sol.save("client/public/assets/objects/sun_statue.png"); umb.save("client/public/assets/objects/umb_statue.png"); }
