/**
 * Монтаж щитов героя Б: npx tsx tools/gen/gear147/shieldsheet.ts → tools/out/gear147/shields.png
 * Ряд на щит: иконка ×1/×3 в ячейке редкости | покой вниз, вверх, вправо, влево | шаг | удар одноручным | блок (зум 3, земля) | «наш | эталон» (иконка Рыцаря Хаоса).
 */
import path from "node:path";
import { PC, type RGBA } from "../canvas";
import { text } from "../mobs/lib";
import { type AnimId } from "../hero147/base_b";
import { GD, dress, renderView, setOf, type SetDef, type View4 } from "./gear";
import { cell, icon } from "./icons";

const IDS = Object.keys(GD.sets).filter((k) => setOf(k).items.offhand);
const LOOK = { fac: "sol" as const, sex: "m" as const, hair: "tousled" };
const SHOTS: [AnimId, View4, number, string][] = [["idle", "down", 0, "ПОКОЙ ВНИЗ"], ["idle", "up", 0, "ВВЕРХ"], ["idle", "side", 0, "ВПРАВО"], ["idle", "left", 0, "ВЛЕВО"], ["run", "down", 3, "БЕГ"], ["atk1h", "side", 6, "УДАР"], ["atk1h", "down", 4, "УДАР ВНИЗ"], ["block", "down", 5, "БЛОК"], ["block", "left", 5, "БЛОК ВЛЕВО"]];
const BG: RGBA = [24, 20, 26, 255], GRASS: RGBA = [62, 84, 52, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255];
const K = 3, FW = 48 * K, lw = 330, rh = FW + 34;
const out = new PC(lw + SHOTS.length * (FW + 6) + 20, 50 + IDS.length * rh + rh);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255; }
text(out, "ЩИТЫ ГЕРОЯ Б · СЛОЙ ВТОРОЙ РУКИ · ИКОНКА = ВЕЩЬ НА ГЕРОЕ · ЗУМ 3", 10, 10, 2, GOLD);
const blit = (im: PC, ox: number, oy: number, k: number) => { for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const q = im.get(x, y); if (q && q[3]) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) out.set(ox + x * k + a, oy + y * k + b, q); } };
const row = (y: number, name: string, set: SetDef, slot: "offhand" | "helm") => {
  text(out, name.toUpperCase().slice(0, 30), 10, y, 1, DIM);
  const ic = icon(slot, set.items[slot], "sol", set.rarity).img;
  blit(cell(ic, set.rarity), 10, y + 14, 1); blit(cell(ic, set.rarity), 70, y + 14, 3);
  if (slot !== "offhand") return;
  const l = dress(LOOK, set, "sol");
  SHOTS.forEach(([a, v, i, cap], j) => {
    const x0 = lw + j * (FW + 6), f = renderView(l, v, a, i).img;
    if (y === 50) text(out, cap, x0, 32, 1, GOLD);
    for (let yy = 0; yy < FW; yy++) for (let xx = 0; xx < FW; xx++) out.set(x0 + xx, y + 14 + yy, GRASS);
    for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) if (f.has(xx, yy)) { const q = f.get(xx, yy); for (let p = 0; p < K; p++) for (let b = 0; b < K; b++) out.set(x0 + xx * K + p, y + 14 + yy * K + b, [q[0], q[1], q[2], 255]); }
  });
};
IDS.forEach((id, n) => row(50 + n * rh, `${setOf(id).name} · ${setOf(id).rarity} · ${setOf(id).level} ур.`, setOf(id), "offhand"));
row(50 + IDS.length * rh, "ЭТАЛОН · РОГАТЫЙ ШЛЕМ ХАОСА", setOf("chaos-knight"), "helm");
out.save(path.resolve("tools/out/gear147/shields.png"));
console.log("→ tools/out/gear147/shields.png", IDS.join(", "));
