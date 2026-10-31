/**
 * Монтаж топоров и секир героя Б: npx tsx tools/gen/gear147/axesheet.ts → tools/out/gear147/axes.png
 * Ряд на оружие: иконка ×1/×3 | покой вниз, вверх, вправо, влево | бег | удар (кадр контакта) вниз и вбок | силуэт оружия (залит одним цветом) | эталон — Пылающий клинок Хаоса.
 */
import path from "node:path";
import { PC, type RGBA } from "../canvas";
import { text } from "../mobs/lib";
import { DATA, renderLayers, type AnimId } from "../hero147/base_b";
import { GD, dress, renderView, setOf, viewLook, type SetDef, type View4 } from "./gear";
import { cell, icon } from "./icons";

const IDS = Object.keys(GD.sets).filter((k) => setOf(k).items.weapon?.head === "axe").sort((a, b) => (setOf(a).items.weapon.kind === "one" ? 0 : 1) - (setOf(b).items.weapon.kind === "one" ? 0 : 1) || ["common", "rare", "epic", "legendary"].indexOf(setOf(a).rarity) - ["common", "rare", "epic", "legendary"].indexOf(setOf(b).rarity));
const LOOK = { fac: "sol" as const, sex: "m" as const, hair: "tousled" };
const SHOTS: [AnimId | "atk", View4, number, string][] = [["idle", "down", 0, "ПОКОЙ ВНИЗ"], ["idle", "up", 0, "ВВЕРХ"], ["idle", "side", 0, "ВПРАВО"], ["idle", "left", 0, "ВЛЕВО"], ["run", "down", 3, "БЕГ"], ["atk", "down", 3, "ЗАМАХ"], ["atk", "down", -1, "КОНТАКТ ВНИЗ"], ["atk", "side", -1, "КОНТАКТ ВБОК"], ["idle", "down", -2, "СИЛУЭТ ОРУЖИЯ"]];
const BG: RGBA = [24, 20, 26, 255], GRASS: RGBA = [62, 84, 52, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255];
const K = 2, FW = 64 * K, lw = 330, rh = FW + 34;
const out = new PC(lw + SHOTS.length * (FW + 6) + 20, 50 + IDS.length * rh + rh);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255; }
text(out, "ТОПОРЫ И СЕКИРЫ ГЕРОЯ Б · 4 РЕДКОСТИ — РАЗНЫЕ ФОРМЫ · ИКОНКА = ВЕЩЬ НА ГЕРОЕ · КУЛАК НА РУКОЯТИ · ЗУМ 2", 10, 10, 2, GOLD);
const blit = (im: PC, ox: number, oy: number, k: number) => { for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const q = im.get(x, y); if (q && q[3]) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) out.set(ox + x * k + a, oy + y * k + b, q); } };
const row = (y: number, name: string, set: SetDef, slot: "weapon") => {
  text(out, name.toUpperCase().slice(0, 30), 10, y, 1, DIM);
  const ic = icon(slot, set.items[slot], "sol", set.rarity).img;
  blit(cell(ic, set.rarity), 10, y + 14, 1); blit(cell(ic, set.rarity), 70, y + 14, 3);
  const l = dress(LOOK, set, "sol");
  if (set.items.weapon.glow) return; // эталон — только иконка
  const great = set.items.weapon.kind === "great", ATK: AnimId = great ? "atk2h" : "atk1h";
  SHOTS.forEach(([a0, v, i0, cap], j) => {
    const a: AnimId = a0 === "atk" ? ATK : a0, i = i0 === -1 ? (DATA.anims[a].hit ?? 7) : Math.max(0, i0);
    const x0 = lw + j * (FW + 6), f0 = renderView(l, v, a, i).img;
    const f = i0 !== -2 ? f0 : (() => { const [all, wp] = renderLayers(viewLook(l, "down"), "down", "idle", 0, [() => true, (p) => p.slot === "weapon" && !/^w_(fist|fistL|thumb)$/.test(p.g)]); return { w: all.img.w, h: all.img.h, has: (x: number, y: number) => all.img.has(x, y), get: (x: number, y: number) => (wp.img.has(x, y) ? [240, 200, 60, 255] : all.img.get(x, y)) } as any; })();
    if (y === 50) text(out, cap, x0, 32, 1, GOLD);
    for (let yy = 0; yy < FW; yy++) for (let xx = 0; xx < FW; xx++) out.set(x0 + xx, y + 14 + yy, GRASS);
    for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) if (f.has(xx, yy)) { const q = f.get(xx, yy); for (let p = 0; p < K; p++) for (let b = 0; b < K; b++) out.set(x0 + xx * K + p, y + 14 + yy * K + b, [q[0], q[1], q[2], 255]); }
  });
};
IDS.forEach((id, n) => row(50 + n * rh, `${setOf(id).name} · ${setOf(id).items.weapon.kind === "great" ? "двуруч." : "одноруч."} · ${setOf(id).rarity}`, setOf(id), "weapon"));
row(50 + IDS.length * rh, "ЭТАЛОН · ПЫЛАЮЩИЙ КЛИНОК ХАОСА", setOf("chaos-knight"), "weapon");
out.save(path.resolve("tools/out/gear147/axes.png"));
console.log("→ tools/out/gear147/axes.png", IDS.join(", "));
