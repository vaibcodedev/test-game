/** Превью арен: tools/out/arena/preview.png (обзор, трибуны ×2, кадры оваций) + full_<id>.png. */
import path from "node:path";
import { PC, hex, hash01 } from "./canvas";
import { SPECS, renderArena, drawSpectator, lookOfType } from "./arena-art";

const OUT = path.resolve("tools/out/arena");
function down(src: PC, w: number): PC {
  const f = src.w / w, h = Math.round(src.h / f), o = new PC(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = Math.floor(y * f); j < Math.min(src.h, Math.ceil((y + 1) * f)); j++) for (let i = Math.floor(x * f); i < Math.min(src.w, Math.ceil((x + 1) * f)); i++) { const c = src.get(i, j)!; r += c[0]; g += c[1]; b += c[2]; n++; }
    o.set(x, y, [r / n, g / n, b / n, 255]);
  }
  return o;
}
function crop(src: PC, x: number, y: number, w: number, h: number, z: number): PC {
  const o = new PC(w * z, h * z);
  for (let j = 0; j < h * z; j++) for (let i = 0; i < w * z; i++) { const c = src.get(x + Math.floor(i / z), y + Math.floor(j / z)); if (c) o.set(i, j, c); }
  return o;
}
const GAP = 12, BG = hex("#0e0c12");
const arts = SPECS.map((s) => renderArena(s));
arts.forEach((a) => a.img.save(path.join(OUT, `full_${a.spec.id}.png`)));
export {};

// строка кадров оваций: 6 кадров по 48×30, зум 4
function strip(id: import("../../shared/arenaCrowd").ArenaId, th: (typeof arts)[number]["theme"], seed: number): PC {
  const FW = 48, FH = 30, Z = 4, out = new PC((FW * Z + GAP) * 6, FH * Z);
  const names = ["покой", "волна", "встали", "руки вверх", "шапки летят", "флажки"];
  void names;
  for (let f = 0; f < 6; f++) {
    const pc = new PC(FW, FH);
    for (let r = 0; r < 3; r++) {
      const y0 = r * 10;
      for (let y = 0; y < 10; y++) for (let x = 0; x < FW; x++) pc.set(x, y0 + y, y < 3 ? th.riser[1 + (y > 0 ? 1 : 0)] : th.top[1 + ((x >> 3) & 1) * 0 + (y > 7 ? -1 : 1)] ?? th.top[0]);
      for (let i = 0; i < 6; i++) {
        const x = 5 + i * 8 + (r & 1) * 3, look = lookOfType(Math.floor(hash01(i, r, seed) * 24));
        let pose = 0, lift = 0;
        const wave = (i + r * 2) / 12; // волна идёт слева направо и вверх по рядам
        if (f === 1) pose = wave < 0.35 ? 1 : 0;
        else if (f === 2) pose = wave < 0.7 ? 1 : 0;
        else if (f === 3) pose = 2;
        else if (f === 4) { pose = (i + r) % 2 ? 5 : 2; lift = 3 + ((i * 3 + r) % 5); }
        else if (f === 5) pose = (i + r) % 3 === 0 ? 3 + (f & 1) : 2;
        drawSpectator(pc, x, y0 + 9, look, id, pose, lift);
      }
    }
    out.blit(crop(pc, 0, 0, FW, FH, Z), f * (FW * Z + GAP), 0);
  }
  return out;
}
const strips = arts.map((a, i) => strip(a.spec.id, a.theme, 10 + i));

const OW = 465, over = arts.map((a) => down(a.img, OW - GAP));
const zooms = arts.map((a) => {
  const cw = 300, ch = 170, x = Math.round(a.cx - cw / 2 + 0), y = Math.round(a.cy - (a.rx * 0.58 + a.spec.rings * a.spec.ringW * 0.62 + a.spec.wallH) - 40);
  return crop(a.img, x, Math.max(0, y), cw * 0.75 | 0, ch * 0.75 | 0, 2);
});
const rowA = Math.max(...over.map((o) => o.h)), rowB = 340, rowC = strips[0].h * 4 + GAP * 3;
const total = new PC(OW * 4, rowA + GAP + rowB + GAP + rowC + GAP);
total.rect(0, 0, total.w, total.h, BG);
over.forEach((o, i) => total.blit(o, i * OW, 0));
zooms.forEach((z, i) => total.blit(z, i * OW, rowA + GAP));
strips.forEach((s, i) => total.blit(s, 0, rowA + GAP + rowB + GAP + i * (s.h + GAP)));
total.save(path.join(OUT, "preview.png"));
console.log("preview saved", total.w, total.h, arts.map((a) => a.spectators.length).join("/"));
