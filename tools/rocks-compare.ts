/**
 * Монтаж «сейчас | новое» для объёмного природного декора (tools/gen/nature3d.ts): крупно ×3 на своей земле и в сцене ×2, день и ночь.
 * Запуск (под tools/out/scenario.lock): npx tsx tools/rocks-compare.ts [rocks|nature]
 * Результат: tools/out/rocks/compare.png (камни, лёд, снега) или tools/out/rocks/nature-compare.png (деревья, кусты, кактусы и пр.).
 * Ничего в игру не пишет.
 */
import path from "node:path";
import fs from "node:fs";
import { PC, hex, mix, withA, type RGBA } from "./gen/canvas";
import { readPng, paintGround, drawText, textWidth, scaleNN, crop, ROOT } from "./gen/vendor-lib";
import { haloOf } from "./gen/nature3d-lib";
import { ROCKS3D, ICE_GLOW } from "./gen/nature3d";

export interface Group { label: string; ground: string; old: string[]; neu: PC[]; glow?: RGBA }
export interface Biome { label: string; ground: string; items: [string, number][]; } // [id группы, сколько штук]

const OBJ = path.join(ROOT, "client/public/assets/objects");
const oldPng = (id: string): PC | null => { const f = path.isAbsolute(id) ? `${id}.png` : path.join(OBJ, `${id}.png`); return fs.existsSync(f) ? readPng(f) : null; };
const BG = hex("#14121a"), INK = hex("#efe6d2"), GOLD = hex("#d6a84b"), DIM = hex("#8a8496");

function nightOf(pc: PC): PC {
  const o = pc.clone();
  o.map((c) => [Math.round(c[0] * 0.34), Math.round(c[1] * 0.4), Math.round(c[2] * 0.62), c[3]]);
  return o;
}
function addBlend(dst: PC, src: PC, x: number, y: number) {
  for (let j = 0; j < src.h; j++) for (let i = 0; i < src.w; i++) {
    const c = src.get(i, j)!; if (!c[3]) continue;
    const d = dst.get(x + i, y + j); if (!d) continue;
    const a = c[3] / 255;
    dst.set(x + i, y + j, [Math.min(255, d[0] + c[0] * a), Math.min(255, d[1] + c[1] * a), Math.min(255, d[2] + c[2] * a), 255]);
  }
}
/** Подпись крупным шрифтом. */
const label = (dst: PC, s: string, x: number, y: number, c = INK, k = 2) => drawText(dst, s, x, y, c, k);

/** Ряд крупно ×3: слева старые, справа новые варианты, на своей земле. */
function bigRow(g: Group, width: number): PC {
  const K = 3;
  const olds = g.old.map(oldPng).filter((p): p is PC => !!p);
  const maxH = Math.max(...[...olds, ...g.neu].map((p) => p.h)) * K;
  const H = maxH + 34;
  const row = new PC(width, H);
  row.rect(0, 0, width, H, BG);
  const half = Math.floor(width * 0.34);
  const paint = (x0: number, w: number) => {
    const tmp = new PC(Math.ceil(w / K), Math.ceil((H - 18) / K));
    paintGround(tmp, 0, 0, tmp.w, tmp.h, g.ground);
    row.blit(scaleNN(tmp, K), x0, 18);
  };
  paint(0, half - 4); paint(half + 4, width - half - 4);
  label(row, g.label, 4, 3, GOLD);
  label(row, "NOW", half - textWidth("NOW", 2) - 8, 3, DIM);
  label(row, "NEW", half + 10, 3, INK);
  let x = 8;
  for (const p of olds) { row.blit(scaleNN(p, K), x, H - 6 - p.h * K); x += p.w * K + 6; if (x > half - 20) break; }
  x = half + 12;
  for (const p of g.neu) { if (x + p.w * K > width - 4) break; row.blit(scaleNN(p, K), x, H - 6 - p.h * K); x += p.w * K + 8; }
  return row;
}

/** Сцена ×2: несколько штук на земле, сортировка по низу; night — затемнение и ореолы. */
function scene(b: Biome, groups: Record<string, Group>, neu: boolean, night: boolean, W = 200, Hh = 130): PC {
  const pc = new PC(W, Hh);
  paintGround(pc, 0, 0, W, Hh, b.ground);
  const hero = (() => { const u = readPng(path.join(ROOT, "client/public/assets/units/warrior.png")); return crop(u, 0, 0, 32, 32); })();
  type It = { p: PC; x: number; y: number; glow?: RGBA };
  const items: It[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let k = 0;
  for (const [id, n] of b.items) {
    const g = groups[id];
    for (let i = 0; i < n; i++) {
      const p = neu ? g.neu[(i + k) % g.neu.length] : g.old.length ? oldPng(g.old[i % g.old.length]) : null;
      const x = 14 + rnd() * (W - 28), y = 30 + rnd() * (Hh - 34);
      if (p) items.push({ p, x, y, glow: neu ? g.glow : undefined });
    }
    k++;
  }
  items.push({ p: hero, x: W / 2, y: Hh * 0.62 });
  items.sort((a, b2) => a.y - b2.y);
  for (const it of items) pc.blit(it.p, Math.round(it.x - it.p.w / 2), Math.round(it.y - it.p.h));
  const out = night ? nightOf(pc) : pc;
  if (night) for (const it of items) if (it.glow) {
    const pad = 6, big = new PC(it.p.w + pad * 2, it.p.h + pad * 2); big.blit(it.p, pad, pad);
    addBlend(out, haloOf(big, it.glow, 6, 0.17), Math.round(it.x - it.p.w / 2) - pad, Math.round(it.y - it.p.h) - pad);
    // внутренний свет льда ночью
    const inner = new PC(it.p.w, it.p.h);
    for (let y = 0; y < it.p.h; y++) for (let x = 0; x < it.p.w; x++) { const c = it.p.get(x, y)!; if (c[3] > 120 && c[2] > 150) inner.set(x, y, withA(mix(c, it.glow, 0.5), 45)); }
    addBlend(out, inner, Math.round(it.x - it.p.w / 2), Math.round(it.y - it.p.h));
  }
  return out;
}

export function montage(groups: Record<string, Group>, biomes: Biome[], file: string, title: string, show = groups, W = 1500, size: [number, number] = [180, 120]) {
  const rows: PC[] = [];
  const head = new PC(W, 26); head.rect(0, 0, W, 26, BG); label(head, title, 6, 6, GOLD, 3); rows.push(head);
  for (const g of Object.values(show)) rows.push(bigRow(g, W));
  // сцены: на биом — 4 панели ×2: сейчас день | новое день | сейчас ночь | новое ночь
  for (const b of biomes) {
    const S = 2, [sw, sh] = size;
    const r = new PC(W, sh * S + 22); r.rect(0, 0, W, r.h, BG);
    label(r, `${b.label}  X2: NOW DAY | NEW DAY | NOW NIGHT | NEW NIGHT`, 4, 4, GOLD);
    [[false, false], [true, false], [false, true], [true, true]].forEach(([n, ni], i) => r.blit(scaleNN(scene(b, groups, n, ni, sw, sh), S), 4 + i * (sw * S + 12), 20));
    rows.push(r);
  }
  const H = rows.reduce((s, r) => s + r.h + 4, 0);
  const out = new PC(W, H); out.rect(0, 0, W, H, BG);
  let y = 0; for (const r of rows) { out.blit(r, 0, y); y += r.h + 4; }
  out.save(file);
  console.log("saved", file, W, H);
}

function rocks() {
  const N = (id: string) => ROCKS3D[id]();
  const groups: Record<string, Group> = {
    rock: { label: "ROCK GREY", ground: "grass", old: ["rock"], neu: N("rock") },
    big_rock: { label: "BIG ROCK", ground: "grass", old: ["big_rock"], neu: N("big_rock") },
    rock_moss: { label: "ROCK MOSS", ground: "forest", old: ["rock"], neu: N("rock_moss") },
    sandstone: { label: "SANDSTONE", ground: "sand", old: ["sandstone"], neu: N("sandstone") },
    basalt: { label: "BASALT", ground: "ash", old: ["basalt"], neu: N("basalt") },
    ash_small: { label: "ASH ROCK SMALL", ground: "ash", old: ["v_volcano_rock_a", "v_volcano_rock_b", "v_volcano_rock_c"], neu: N("v_volcano_rock_a") },
    ash_big: { label: "ASH BOULDER", ground: "ash", old: ["v_volcano_boulder", "v_volcano_rock_pile"], neu: N("v_volcano_boulder") },
    snow_rock: { label: "SNOW ROCK", ground: "snow", old: ["snow_rock"], neu: N("snow_rock") },
    ice_spike: { label: "ICE SPIKE", ground: "snow", old: ["ice_spike"], neu: N("ice_spike"), glow: ICE_GLOW },
    snow_bush: { label: "SNOW BUSH", ground: "snow", old: ["snow_bush"], neu: N("snow_bush") },
    snowdrift: { label: "SNOWDRIFT", ground: "snow", old: [], neu: N("snowdrift") },
  };
  const biomes: Biome[] = [
    { label: "SNOW", ground: "snow", items: [["snow_rock", 3], ["ice_spike", 3], ["snow_bush", 3], ["snowdrift", 2]] },
    { label: "MEADOW", ground: "grass", items: [["rock", 4], ["big_rock", 1], ["rock_moss", 2]] },
    { label: "DESERT", ground: "sand", items: [["sandstone", 5]] },
    { label: "ASH", ground: "ash", items: [["basalt", 3], ["ash_small", 4], ["ash_big", 2]] },
  ];
  montage(groups, biomes, path.join(ROOT, "tools/out/rocks/compare.png"), "ROCKS ICE SNOW: NOW | NEW");
}

const which = process.argv[2] ?? "rocks";
if (which === "rocks") rocks();
else if (which === "nature") void import("./nature-compare").then((m) => m.nature());
