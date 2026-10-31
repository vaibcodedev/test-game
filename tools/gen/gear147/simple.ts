/**
 * Монтаж простых вещей нижних ступеней рядом с эталоном: npx tsx tools/gen/gear147/simple.ts → tools/out/gear147/simple-items.png
 * Шапели и топфхельмы (style chapel / great), мантии-туники (robe, cut tunic) | эталон — рогатый шлем Хаоса и кожаная кираса разбойника Хаоса.
 * Иконка ×3 и вещь на герое ×4 (покой вниз) — проверка ровной планки детализации (docs/art/icons.md §4).
 */
import path from "node:path";
import { PC, type RGBA } from "../canvas";
import { text } from "../mobs/lib";
import { renderLayers, type Part } from "../hero147/base_b";
import { allItems, heroLook } from "./match";
import { viewLook } from "./gear";
import { cell, icon } from "./icons";
import { helmModel } from "./helm";

const all = allItems();
const pick = (x: (typeof all)[number]) => (x.slot === "helm" && x.it.style !== "horned" && x.it.style !== "hood" && ["flat", "round"].includes(helmModel(x.it).shape.dome) && ["cap", "full"].includes(helmModel(x.it).shape.cover) && (x.it.style === "chapel" || x.it.style === "great")) || (x.slot === "armor" && x.it.style === "robe" && (x.it.cut === "tunic" || x.it.cut === "mid"));
const list = [...all.filter((x) => x.id === "chaos-knight/helm" || x.id === "rogue-chaos/armor"), ...all.filter(pick).filter((x) => process.argv[2] ? x.id.includes(process.argv[2]) : true)];
const BG: RGBA = [24, 20, 26, 255], GRASS: RGBA = [62, 84, 52, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255];
const C = 6, cw = 48 * 3 + 130, chh = 48 * 3 + 30, out = new PC(C * cw + 20, 50 + Math.ceil(list.length / C) * chh);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255; }
text(out, "ПРОСТЫЕ ШЛЕМЫ И МАНТИИ НИЖНИХ СТУПЕНЕЙ · ПЕРВЫЕ ДВА — ЭТАЛОН · ИКОНКА ×3 И ВЕЩЬ НА ГЕРОЕ ×4", 10, 10, 2, GOLD);
const blit = (im: { w: number; h: number; get: (x: number, y: number) => any; has?: (x: number, y: number) => boolean }, bx: number[], ox: number, oy: number, k: number, bg?: RGBA) => {
  for (let y = bx[1]; y <= bx[3]; y++) for (let x = bx[0]; x <= bx[2]; x++) { const has = im.has ? im.has(x, y) : (im.get(x, y)?.[3] ?? 0) > 0; const q = has ? im.get(x, y) : bg; if (!q) continue; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) out.set(ox + (x - bx[0]) * k + a, oy + (y - bx[1]) * k + b, [q[0], q[1], q[2], 255]); }
};
list.forEach((x, n) => {
  const x0 = 10 + (n % C) * cw, y0 = 44 + Math.floor(n / C) * chh;
  text(out, (n < 2 ? "ЭТАЛОН " : "") + x.id.replace(/^tier\//, "").toUpperCase().slice(0, 34), x0, y0, 1, n < 2 ? GOLD : DIM);
  blit(cell(icon(x.slot, x.it, "sol", x.rarity).img, x.rarity), [0, 0, 47, 47], x0, y0 + 14, 3);
  const lk = heroLook(x), mine = (p: Part) => p.slot === x.slot || p.slot === "crest";
  const [full, it] = renderLayers(viewLook(lk, "down"), "down", "idle", 0, [() => true, mine]);
  let a = 1e9, b = 1e9, c = -1, d = -1; for (let y = 0; y < it.img.h; y++) for (let xx = 0; xx < it.img.w; xx++) if (it.img.has(xx, y)) { a = Math.min(a, xx); b = Math.min(b, y); c = Math.max(c, xx); d = Math.max(d, y); }
  const bx = [a - 2, b - 2, c + 2, d + 2], k = Math.max(2, Math.min(4, Math.floor(Math.min(120 / (bx[2] - bx[0] + 1), 144 / (bx[3] - bx[1] + 1)))));
  blit(full.img as any, bx, x0 + 150, y0 + 14, k, GRASS);
});
out.save(path.resolve("tools/out/gear147/simple-items.png"));
console.log("→ tools/out/gear147/simple-items.png:", list.length - 2, "вещей");
