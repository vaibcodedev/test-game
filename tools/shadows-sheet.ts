/** Сводный лист декора на траве рядом с героем (проверка теней): tools/out/shadows/<name>.png. Аргумент — имя файла (before | after). */
import { PNG } from "pngjs";
import fs from "node:fs";
import { PC, hex } from "./gen/canvas";
import { WORLD_VOLUME } from "./gen/volume-world";
import { BF_VOLUME } from "./gen/volume-bf";
import * as P from "./gen/walls141-props";
import { solStatue, umbStatue } from "./gen/statues";
import { LOOKS } from "./gen/walls141-lib";
const name = process.argv[2] ?? "after";
const read = (f: string) => { const p = PNG.sync.read(fs.readFileSync(f)); const pc = new PC(p.width, p.height); pc.data.set(p.data); return pc; };
const hero = new PC(32, 32); { const s = read("client/public/assets/units/warrior.png"); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const p = s.get(x, y); if (p) hero.set(x, y, p); } }
const items: [string, PC][] = [];
const add = (k: string, f: () => PC) => { try { items.push([k, f()]); } catch (e) { console.error(k, String(e).slice(0, 80)); } };
for (const [k, f] of Object.entries(WORLD_VOLUME)) add(k, f);
for (const [k, f] of Object.entries(BF_VOLUME)) add(k, f);
add("barrel", P.barrel); add("crate", P.crate); add("stall", () => P.stall(hex("#c03838"), "food")); add("weaponRack", P.weaponRack); add("cauldron", P.cauldron); add("hay", P.hay); add("well", P.well); add("teleport_stone", P.teleportStone);
add("sun_statue", solStatue); add("umb_statue", umbStatue);
const GAP = 10, COLS = 6, grass = hex("#4c7a3a"), grass2 = hex("#46722f");
const rows: PC[][] = []; for (let i = 0; i < items.length; i += COLS) rows.push(items.slice(i, i + COLS).map((q) => q[1]));
const rowH = rows.map((r) => Math.max(40, ...r.map((p) => p.h)) + GAP);
const cellW = Math.max(...items.map(([, p]) => p.w)) + 40 + GAP;
const out = new PC(COLS * cellW, rowH.reduce((a, b) => a + b, 0));
for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.set(x, y, (x * 7 + y * 13) % 11 === 0 ? grass2 : grass);
let y0 = 0;
rows.forEach((r, ri) => { r.forEach((p, ci) => { const x = ci * cellW + 4, by = y0 + rowH[ri] - GAP / 2; out.blit(p, x, by - p.h); out.blit(hero, x + p.w + 2, by - 32 + 1); }); y0 += rowH[ri]; });
// ×2 для чтения
const k = 2, big = new PC(out.w * k, out.h * k);
for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) big.set(x, y, out.get(Math.floor(x / k), Math.floor(y / k))!);
big.save(`tools/out/shadows/${name}.png`);
console.log(items.length, items.map((q) => q[0]).join(","));
