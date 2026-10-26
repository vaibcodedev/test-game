/** Еда, зелья, самоцветы и материалы из 496 pixel art icons (7Soul1, CC0) под нашу графику (задача 127, шаг 1: превью; в игру ничего не кладётся).
 *  Запуск: npx tsx tools/gen/icons-items.ts  →  tools/out/icons-preview/items.png (наша | 7Soul1 до | после) и items/<наш id>.png (32×32).
 *  Подгонка:
 *  1. Рамка: поля прозрачности срезаются; 34 → 32 без порчи пикселя — срез полей, а если предмет шире 30 px (с контуром 32), уменьшение по блокам (downscaleMode + tidy).
 *  2. Контур: свой (#1b1422, как PC.outline у im_*): у 7Soul1 тёмная или белая обводка по краю снимается и рисуется заново снаружи.
 *  3. Палитра: каждый пиксель переходит в ближайший цвет объединения рядов tools/gen/palette.ts (P.*), насыщенность сохраняется — оттенок не уходит в чужой ряд.
 *  4. Светотень: у 7Soul1 свет сверху-слева, как у наших; нижняя и правая кромки тела затемняются на один тон ряда (как shadedEllipse у наших предметов).
 *  Таблица: data/item-icons.json ({ "<наша иконка>": { "src": "7soul1", "file": "<имя без .png>" } }); reserve — отобранное про запас (свитки, самоцветы). */
import fs from "node:fs";
import path from "node:path";
import { PC, OUTLINE, hex, type RGBA } from "./canvas";
import { P } from "./palette";
import { ROOT, readPng, writePng, trim, scaleNN, downscaleMode, tidy, luma, hsv, drawText, BG, BEIGE, GOLD } from "./vendor-lib";

const OUT = path.join(ROOT, "tools/out/icons-preview");
const SRC = path.join(ROOT, "vendor/7soul1/src");

/** Наши предметы без модели на герое → иконка 7Soul1. */
export const ITEM_MAP: Record<string, string> = {
  food_bread: "I_C_Bread", food_porridge: "I_C_Nut", food_fish_soup: "I_C_RawFish", food_pie: "I_C_Pie", food_borsch: "I_C_Radish",
  food_roast: "I_C_Meat", food_trout: "I_C_Fish", food_feast: "I_C_Pineapple", food_heat_stew: "I_C_RedPepper",
  potion_red: "P_Red05", potion_blue: "P_Blue05",
  res_cactus_juice: "P_Green05", res_ice_crystal: "I_Crystal01", res_obsidian: "I_Coal", res_pearl: "I_Opal",
  mat_ash_ore: "I_Rock04", mat_star_dust: "I_Diamond",
  // конюшня (задача 142): «Печать скакуна» и детали маунтов (data/mounts.json seal, parts)
  mount_seal: "I_Scroll02", mpart_saddle: "I_SolidShell", mpart_barding: "A_Armor04", mpart_egg: "I_Jade", mpart_feather: "I_Feather02", mpart_gladiator: "Ac_Medal01",
};
/** Про запас: предметов в игре пока нет (свитки, самоцветы). */
export const RESERVE = ["I_Scroll", "I_Scroll02", "I_Map", "I_Ruby", "I_Sapphire", "I_Agate", "I_Amethist", "I_Jade"];

const ALL_RAMPS: RGBA[][] = [P.skin, P.skinPale, P.goblin, P.bone, P.drowned, P.steel, P.gold, P.wood, P.leather, P.cloth.red, P.cloth.purple, P.cloth.green, P.cloth.blue, P.cloth.brown, P.cloth.black,
  P.magic.blue, P.magic.purple, P.magic.green, P.magic.fire, P.leaf, P.grass, P.ice, P.stone, P.dirt, P.sand, P.snow, P.lava, P.coral.pink, P.coral.orange, P.crystal, P.obsidian];
/** Яркий красный ряд (как fg red у иконок умений в objects.ts). */
const RED: RGBA[] = ["#5a0a14", "#a01828", "#e0304a", "#ff8a8a", "#ffd0d0"].map((c) => hex(c));
ALL_RAMPS.push(RED);
const PAL: RGBA[] = [...new Map(ALL_RAMPS.flat().map((c) => [c.join(","), c] as const)).values()];

function nearest(c: RGBA): RGBA {
  const [h, s, v] = hsv(c[0], c[1], c[2]);
  let best = PAL[0], bd = 1e9;
  for (const q of PAL) {
    const [qh, qs, qv] = hsv(q[0], q[1], q[2]);
    const dh = Math.min(Math.abs(h - qh), 360 - Math.abs(h - qh)) / 180;
    const w = Math.min(s, qs) * Math.min(v, qv) > 0.04 ? 1 : 0.15; // у серого оттенок не важен
    const d = (c[0] - q[0]) ** 2 * 0.3 + (c[1] - q[1]) ** 2 * 0.59 + (c[2] - q[2]) ** 2 * 0.11 + w * dh * dh * 9000;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

export function adapt(src: PC): PC {
  // 1. снять обводку 7Soul1 (тёмную и белую) по краю
  const a = src.clone();
  const solid = (x: number, y: number) => a.alpha(x, y) > 0;
  const edge: [number, number][] = [];
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    if (!solid(x, y)) continue;
    if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) {
      const c = a.get(x, y)!, l = luma(c[0], c[1], c[2]), [, s] = hsv(c[0], c[1], c[2]);
      if (l < 55 || (l > 205 && s < 0.25)) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) a.clear(x, y);
  let t = trim(a).pc;
  // 2. размер: вместе с контуром 32×32
  const maxSide = 30;
  if (t.w > maxSide || t.h > maxSide) {
    const k = maxSide / Math.max(t.w, t.h);
    t = trim(tidy(downscaleMode(t, Math.max(1, Math.round(t.w * k)), Math.max(1, Math.round(t.h * k))))).pc;
  }
  // 3. палитра: каждый пиксель → ряд нашей палитры по оттенку, тон ряда — по яркости внутри группы (3–4 тона, как у наших im_*)
  const grp = (c: RGBA) => { const [hh, ss] = hsv(c[0], c[1], c[2]); if ((hh < 18 || hh > 340) && ss > 0.45) return ALL_RAMPS.length - 1; const n = nearest(c); const i = ALL_RAMPS.findIndex((r) => r.some((q) => q[0] === n[0] && q[1] === n[1] && q[2] === n[2])); return i < 0 ? 0 : i; };
  const lum = new Map<number, number[]>();
  const gid = new Int16Array(t.w * t.h).fill(-1), ly = new Float32Array(t.w * t.h);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const c = t.get(x, y)!;
    if (c[3] < 128) continue;
    const k = y * t.w + x; gid[k] = grp(c); ly[k] = luma(c[0], c[1], c[2]);
    (lum.get(gid[k]) ?? lum.set(gid[k], []).get(gid[k])!).push(ly[k]);
  }
  const rng = new Map<number, [number, number]>();
  for (const [g, v] of lum) { v.sort((p, q) => p - q); rng.set(g, [v[Math.floor(v.length * 0.05)], v[Math.floor(v.length * 0.95)]]); }
  const isSol = (x: number, y: number) => x >= 0 && y >= 0 && x < t.w && y < t.h && gid[y * t.w + x] >= 0;
  const q = new PC(t.w, t.h);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const k = y * t.w + x;
    if (gid[k] < 0) continue;
    const ramp = ALL_RAMPS[gid[k]], [lo, hi] = rng.get(gid[k])!;
    const tt = hi - lo < 8 ? 0.5 : Math.max(0, Math.min(1, (ly[k] - lo) / (hi - lo)));
    const top = ramp.length - 1;
    let idx = 1 + Math.round(tt * (top - 1)); // индексы 1…top: самый тёмный тон ряда — для теней и контура
    // свет сверху-слева: кромка у освещённой стороны на тон светлее, у теневой — темнее
    if (!isSol(x, y - 1) || !isSol(x - 1, y)) idx = Math.min(top, idx + 1);
    else if (!isSol(x, y + 1) || !isSol(x + 1, y)) idx = Math.max(1, idx - 1);
    q.set(x, y, ramp[idx]);
  }
  const shaded = q;
  // 5. наш контур и холст 32×32 (по центру)
  const body = new PC(shaded.w + 2, shaded.h + 2);
  body.blit(shaded, 1, 1);
  body.outline(OUTLINE);
  const out = new PC(32, 32);
  out.blit(body, Math.floor((32 - body.w) / 2), Math.floor((32 - body.h) / 2));
  return out;
}

function main() {
  fs.mkdirSync(path.join(OUT, "items"), { recursive: true });
  const ids = Object.keys(ITEM_MAP);
  const cols = 3, cw = 3 * 34 + 8 + 3 * 32 + 8 + 2 * 32 + 20, ch = 3 * 34 + 20;
  const rows = Math.ceil(ids.length / cols);
  const sheet = new PC(cols * cw, rows * ch + 16);
  sheet.rect(0, 0, sheet.w, sheet.h, BG);
  drawText(sheet, "ours (x2) | 7soul1 before (x3) | after (x3)", 4, 4, GOLD);
  ids.forEach((id, i) => {
    const x = (i % cols) * cw + 4, y = 16 + Math.floor(i / cols) * ch;
    const src = readPng(path.join(SRC, ITEM_MAP[id] + ".png"));
    const after = adapt(src);
    writePng(after, path.join(OUT, "items", id + ".png"));
    const ourFile = path.join(ROOT, "client/public/assets/icons", id + ".png");
    if (fs.existsSync(ourFile)) sheet.blit(scaleNN(readPng(ourFile), 2), x, y);
    sheet.blit(scaleNN(src, 3), x + 72, y);
    sheet.blit(scaleNN(after, 3), x + 72 + 110, y);
    drawText(sheet, `${id} < ${ITEM_MAP[id]}`.slice(0, 40), x, y + 3 * 34 + 4, BEIGE);
  });
  writePng(sheet, path.join(OUT, "items.png"));
  const table: Record<string, unknown> = { _doc: "Иконки еды, зелий и материалов (задача 127, шаг 1, на утверждение): 7Soul1 «496 pixel art icons for medieval/fantasy RPG», CC0. Файл: vendor/7soul1/src/<file>.png; подгонка под нашу графику — tools/gen/icons-items.ts. reserve — отобрано про запас (свитков и самоцветов как предметов в игре пока нет)." };
  for (const [id, f] of Object.entries(ITEM_MAP)) table[id] = { src: "7soul1", file: f };
  table.reserve = RESERVE.map((f) => ({ src: "7soul1", file: f }));
  fs.writeFileSync(path.join(ROOT, "data/item-icons.json"), JSON.stringify(table, null, 1) + "\n");
  console.log("items", ids.length, "->", OUT);
}
if (process.argv[1] && /icons-items\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) main();

/** Для tools/gen-assets.ts: адаптированная иконка 7Soul1 по data/item-icons.json; "keep" — исходников (vendor/7soul1) нет, готовый файл оставить; null — в таблице нет. */
export function newItemIcon(name: string, target: string): PC | "keep" | null {
  const table = JSON.parse(fs.readFileSync(path.join(ROOT, "data/item-icons.json"), "utf8")) as Record<string, { src?: string; file?: string }>;
  const e = table[name];
  if (!e || e.src !== "7soul1" || !e.file) return null;
  const file = path.join(SRC, e.file + ".png");
  if (!fs.existsSync(file)) return fs.existsSync(target) ? "keep" : null;
  return adapt(readPng(file));
}

/** «Печать скакуна» маунта (задача 142): свиток печати (mount_seal) и уменьшенный маунт в своих цветах с контуром в правом нижнем углу.
 *  seal — готовая иконка свитка 32×32, mount — иконка маунта (48×48, assets/icons/mount_<id>.png). */
export function sealIconFor(seal: PC, mount: PC): PC {
  const out = seal.clone();
  const { pc } = trim(mount, 128);
  const W = 23, H = 20, k = Math.min(W / pc.w, H / pc.h);
  const w = Math.max(1, Math.round(pc.w * k)), h = Math.max(1, Math.round(pc.h * k));
  const small = downscaleMode(pc, w, h, 0.4);
  const ox = 32 - w - 1, oy = 32 - h - 1;
  const solid = (x: number, y: number) => small.alpha(x, y) > 0;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) out.set(ox + x, oy + y, OUTLINE);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (solid(x, y)) out.set(ox + x, oy + y, small.get(x, y)!);
  return out;
}
