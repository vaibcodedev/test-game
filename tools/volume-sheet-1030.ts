/** Лист объектов на траве: node ... tools/volume-sheet-1030.ts out.png scale id id ... ; id вида a|b даёт пару «было|стало» из пути tools/out/volume-1030/before/<id>.png */
import fs from "node:fs";
import path from "node:path";
import { PC } from "./gen/canvas";
import { ROOT, readPng, writePng, scaleNN, paintGround, chipText, fill, BG } from "./gen/vendor-lib";
const OBJ = path.join(ROOT, "client/public/assets/objects"), OUT = path.join(ROOT, "tools/out/volume-1030");
const [name, ks, ...ids] = process.argv.slice(2); const k = +ks;
const W = 1200, items = ids.map((id) => ({ id, pc: readPng(path.join(OBJ, id + ".png")), bf: fs.existsSync(path.join(OUT, "before", id + ".png")) && process.env.PAIR ? readPng(path.join(OUT, "before", id + ".png")) : null }));
let x = 6, y = 0, rowH = 0; const pos: any[] = [];
for (const it of items) { const w = (it.pc.w + (it.bf ? it.bf.w + 8 : 0) + 10); if (x + w > W / k) { x = 6; y += rowH + 12; rowH = 0; } pos.push({ ...it, x, y }); x += w; rowH = Math.max(rowH, it.pc.h, it.bf?.h ?? 0); }
const H = y + rowH + 20, sh = new PC(W / k, H); fill(sh, BG); paintGround(sh, 0, 0, W / k, H, "grass");
for (const p of pos) { const base = p.y + 8 + Math.max(p.pc.h, p.bf?.h ?? 0); let px = p.x; if (p.bf) { sh.blit(p.bf, px, base - p.bf.h); px += p.bf.w + 8; } sh.blit(p.pc, px, base - p.pc.h); chipText(sh, p.id.toUpperCase().slice(0, 14), p.x, p.y); }
writePng(scaleNN(sh, k), path.join(OUT, name));
