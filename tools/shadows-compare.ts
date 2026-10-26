import { PNG } from "pngjs";
import fs from "node:fs";
import { PC } from "./gen/canvas";
const read = (f: string) => { const p = PNG.sync.read(fs.readFileSync(f)); const pc = new PC(p.width, p.height); pc.data.set(p.data); return pc; };
const a = read("tools/out/shadows/before.png"), b = read("tools/out/shadows/after.png");
const out = new PC(a.w + b.w + 20, a.h);
out.blit(a, 0, 0); out.blit(b, a.w + 20, 0);
out.save("tools/out/shadows/before-after.png");
