/** Превью частокола: старый | вариант A | вариант B рядом с шатром, стойкой, костром на траве, зум 2 -> tools/out/props/plank.png */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hash01, hex } from "./canvas";
import { GOBLIN_PALISADE } from "./goblin-palisade";
const OBJ = path.resolve("client/public/assets/objects");
const load = (id: string): PC => { const p = PNG.sync.read(fs.readFileSync(path.join(OBJ, id + ".png"))); const pc = new PC(p.width, p.height); pc.data.set(new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length)); return pc; };
const G = [hex("#4f7a34"), hex("#5a8a3a"), hex("#68993f")];
const Z = 2, cw = 480, ch = 250;
const scene = new PC(cw, ch);
for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) scene.set(x, y, G[hash01(x >> 1, y >> 1, 5) < 0.2 ? 2 : hash01(x >> 2, y >> 2, 6) < 0.25 ? 0 : 1]);
const cols: [string, ((id: string) => PC)][] = [["old", load], ["A", (id) => GOBLIN_PALISADE.a[id]()], ["B", (id) => GOBLIN_PALISADE.b[id]()]];
cols.forEach(([, f], c) => {
  const ox = 8 + c * 156, by = 100;
  scene.blit(f("v_basic_palisade_5"), ox, by - 58);
  scene.blit(f("v_basic_palisade_2"), ox + 66, by - 58);
  scene.blit(f("v_basic_palisade_1"), ox + 102, by - 58);
  for (const [id, dx, dy] of [["tent", 4, 58], ["weapon_rack", 90, 62], ["campfire", 120, 70]] as const) { try { const o = load(id); scene.blit(o, ox + dx, by + dy - o.h + 12); } catch { /* нет */ } }
});
const out = new PC(cw * Z, ch * Z);
for (let y = 0; y < ch * Z; y++) for (let x = 0; x < cw * Z; x++) { const c = scene.get(x >> 1, y >> 1); if (c) out.set(x, y, c); }
out.save(path.resolve("tools/out/props/plank.png"));
console.log("ok");
