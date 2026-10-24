/** Объекты мира, иконки предметов и умений, эффекты. Опорная точка объектов — нижняя середина. */
import { PC, hash01, hex, mix, ramp, rng, shade, withA, type RGBA, type Ramp } from "./canvas";
import { DATA_SKILL_ICONS } from "../../shared/skills";
import { OUTLINE_SOFT, P } from "./palette";
import { FOOD } from "../../shared/food";
import { TOWN_ART } from "./town";
import { CITY_ART } from "./cities";
import { FACTION_ART } from "./factions";
import { BIOME_ART, resourceIcon } from "./biomes";
import { RESOURCE_IDS } from "../../shared/biomes";
import { lootObjects } from "./loot";

type Art = () => PC;

function leafClump(c: PC, cx: number, cy: number, r: number, leaf: Ramp, seed: number) {
  const R = rng(seed);
  const blobs: [number, number, number][] = [[cx, cy, r]];
  for (let i = 0; i < 7; i++) {
    const a = R() * Math.PI * 2, d = r * (0.45 + R() * 0.35);
    blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (0.45 + R() * 0.2)]);
  }
  blobs.sort((a, b) => a[1] - b[1]);
  for (const [x, y, rr] of blobs) c.shadedEllipse(x, y, rr, rr * 0.9, leaf);
  for (let i = 0; i < r * 1.6; i++) {
    const x = cx + (R() - 0.6) * r * 1.3, y = cy + (R() - 0.7) * r * 1.1;
    if (c.alpha(Math.round(x), Math.round(y))) c.set(x, y, leaf[leaf.length - 1]);
  }
}

// Деревья oak, pine и dead_tree убраны (задача 126, сторонние паки): в мире их заменяют v_basic_oak*, v_basic_pine, v_volcano_dead_tree*
// и v_graveyard_dead_tree* из tools/gen/vendor.ts. Пальмы, снежные сосны и кактусы остаются: аналогов в паках нет.
const bush: Art = () => {
  const c = new PC(32, 32);
  leafClump(c, 16, 22, 8, P.leaf, 21);
  for (const [x, y] of [[12, 20], [19, 23], [15, 26]]) c.ellipse(x, y, 1.2, 1.2, hex("#d84050"));
  return c.outline();
};
function rockShape(w: number, h: number, seed: number): PC {
  const c = new PC(w, h);
  const R = rng(seed);
  const pts: [number, number][] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rx = (w / 2 - 2) * (0.8 + R() * 0.2), ry = (h * 0.42) * (0.75 + R() * 0.25);
    pts.push([w / 2 + Math.cos(a) * rx, h - 2 - ry + Math.sin(a) * ry * (Math.sin(a) > 0 ? 0.55 : 1)]);
  }
  c.poly(pts, (x, y) => {
    const u = (x - w / 2) / w, v = (y - (h - 2 - h * 0.42)) / (h * 0.42);
    const l = -u * 0.8 - v * 0.9 + hash01(x, y, seed) * 0.25;
    return P.stone[l > 0.45 ? 4 : l > 0.1 ? 3 : l > -0.3 ? 2 : 1];
  });
  c.line(w * 0.35, h * 0.55, w * 0.5, h * 0.7, P.stone[0], 1);
  return c.outline();
}
const rock: Art = () => rockShape(32, 28, 31);
const bigRock: Art = () => rockShape(64, 44, 37);

function house(roof: Ramp): PC {
  const c = new PC(128, 128);
  // передняя стена
  c.shadedRect(6, 78, 116, 48, P.plaster);
  for (const x of [6, 44, 82, 118]) c.rect(x, 78, 4, 48, P.timber[1]);
  c.rect(6, 78, 116, 4, P.timber[2]);
  c.rect(6, 100, 116, 3, P.timber[1]);
  c.rect(6, 122, 116, 6, P.stone[1]);
  // дверь
  c.shadedRect(56, 96, 18, 30, P.wood, 2);
  c.rect(64, 98, 1, 28, P.wood[0]);
  c.ellipse(70, 112, 1, 1, P.gold[3]);
  // окна
  for (const x of [20, 94]) {
    c.rect(x - 1, 87, 16, 14, P.timber[0]);
    c.rect(x + 1, 89, 12, 10, P.glass[1]);
    c.rect(x + 1, 89, 12, 3, P.glass[2]);
    c.rect(x + 6, 89, 1, 10, P.timber[0]);
    c.rect(x - 2, 101, 18, 3, P.wood[2]);
    c.ellipse(x + 2, 103, 2, 1.5, hex("#e05a70"));
    c.ellipse(x + 10, 103, 2, 1.5, hex("#f0d050"));
  }
  // крыша с черепицей
  c.poly([[0, 82], [128, 82], [112, 14], [16, 14]], (x, y) => {
    const row = Math.floor((y - 14) / 7);
    const shift = row % 2 ? 4 : 0;
    const edge = (y - 14) % 7 === 6;
    const seam = (x + shift) % 8 === 0;
    const side = x < 30 ? 1 : x > 98 ? -1 : 0;
    let idx = 2 + (side > 0 ? 1 : side < 0 ? -1 : 0);
    if (edge) idx = 0;
    else if (seam) idx = 1;
    else if ((y - 14) % 7 < 2) idx = Math.min(4, idx + 1);
    return roof[idx];
  });
  c.rect(16, 12, 96, 4, roof[4]);
  c.rect(0, 80, 128, 3, roof[0]);
  // труба
  c.shadedRect(88, 0, 12, 22, P.stone);
  c.rect(86, 0, 16, 3, P.stone[3]);
  return c.outline();
}

const fountain: Art = () => {
  const c = new PC(64, 72);
  c.shadedEllipse(32, 52, 30, 18, P.stone);
  c.ellipse(32, 51, 25, 14, P.stone[1]);
  c.ellipse(32, 52, 24, 12.5, P.water[2]);
  c.ellipse(26, 49, 10, 4, P.water[3]);
  c.shadedRect(28, 26, 8, 26, P.stone);
  c.shadedEllipse(32, 26, 10, 4, P.stone);
  c.ellipse(32, 25.5, 7.5, 2.5, P.water[3]);
  c.shadedEllipse(32, 14, 4, 6, P.stone);
  for (const [x, y] of [[24, 30], [40, 30], [20, 40], [44, 40], [32, 20]]) c.ellipse(x, y, 1.2, 1.5, withA(P.water[4], 220));
  return c.outline();
};
const stall: Art = () => {
  const c = new PC(64, 72);
  for (const x of [6, 56]) c.shadedRect(x, 20, 3, 46, P.wood);
  c.shadedRect(2, 50, 60, 18, P.wood);
  c.rect(2, 50, 60, 3, P.wood[3]);
  // товары
  for (const [x, col] of [[10, P.magic.fire[2]], [20, P.magic.blue[2]], [30, P.magic.green[2]], [40, P.magic.fire[3]], [50, P.magic.purple[2]]] as [number, RGBA][]) {
    c.shadedEllipse(x + 2, 46, 3, 3.5, [shade(col, 0.6), col, mix(col, hex("#ffffff"), 0.4), hex("#ffffff")]);
    c.rect(x + 1, 41, 2, 2, P.wood[2]);
  }
  // навес в полоску
  c.poly([[0, 22], [64, 22], [58, 6], [6, 6]], (x) => (Math.floor(x / 8) % 2 ? hex("#e8e0d0") : P.cloth.red[2]));
  for (let x = 0; x < 64; x += 8) c.ellipse(x + 4, 23, 4, 2.5, Math.floor(x / 8) % 2 ? hex("#e8e0d0") : P.cloth.red[2]);
  return c.outline();
};
const lamp: Art = () => {
  const c = new PC(32, 64);
  c.rect(15, 18, 3, 44, P.darkSteel[2]);
  c.rect(15, 18, 1, 44, P.darkSteel[3]);
  c.rect(12, 60, 9, 4, P.darkSteel[1]);
  c.rect(10, 8, 13, 3, P.darkSteel[2]);
  c.rect(11, 11, 11, 9, P.glass[1]);
  c.rect(12, 12, 9, 4, P.glass[2]);
  c.rect(16, 11, 1, 9, P.darkSteel[1]);
  c.poly([[9, 8], [24, 8], [16, 2]], P.darkSteel[3]);
  return c.outline();
};
const well: Art = () => {
  const c = new PC(32, 48);
  c.shadedEllipse(16, 38, 14, 9, P.stone);
  c.ellipse(16, 37, 10, 5.5, hex("#141c2a"));
  for (const x of [4, 26]) c.shadedRect(x, 10, 3, 28, P.wood);
  c.poly([[0, 12], [32, 12], [24, 2], [8, 2]], P.roofRed[2]);
  c.line(7, 16, 25, 16, P.wood[1], 1);
  c.line(16, 16, 16, 30, hex("#c8b890"), 1);
  return c.outline();
};
const barrel: Art = () => {
  const c = new PC(32, 32);
  c.shadedEllipse(16, 19, 9, 11, P.wood);
  c.ellipse(16, 10, 8, 3, P.wood[1]);
  for (const y of [13, 25]) c.rect(7, y, 18, 2, P.darkSteel[2]);
  return c.outline();
};
const crate: Art = () => {
  const c = new PC(32, 32);
  c.shadedRect(5, 8, 22, 22, P.wood, 1);
  c.line(6, 9, 26, 29, P.wood[1], 2);
  c.rect(5, 8, 22, 2, P.wood[3]);
  return c.outline();
};
const pillar: Art = () => {
  const c = new PC(32, 64);
  c.shadedRect(9, 10, 14, 50, P.wallFace);
  for (let y = 16; y < 58; y += 9) c.rect(9, y, 14, 1, P.wallFace[0]);
  c.shadedRect(6, 4, 20, 7, P.wallFace);
  c.shadedRect(6, 58, 20, 6, P.wallFace);
  return c.outline();
};
const torch: Art = () => {
  const c = new PC(32, 32);
  c.rect(14, 14, 4, 12, P.wood[2]);
  c.rect(12, 12, 8, 3, P.darkSteel[2]);
  c.ellipse(16, 9, 4, 5, P.magic.fire[2]);
  c.ellipse(16, 10, 2.5, 3, P.magic.fire[3]);
  c.ellipse(16, 11, 1.2, 1.6, P.magic.fire[4]);
  return c.outline();
};

function tuft(kind: "flowers" | "tallgrass" | "fern" | "reeds"): PC {
  const c = new PC(32, 32);
  const R = rng(kind.length * 31);
  if (kind === "tallgrass" || kind === "reeds") {
    const n = kind === "reeds" ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const x = 9 + R() * 14, h = (kind === "reeds" ? 14 : 8) + R() * 6, lean = (R() - 0.5) * 4;
      c.line(x, 30, x + lean, 30 - h, kind === "reeds" ? P.leaf[2 + (i % 2)] : P.grass[3 + (i % 2)], 1);
      if (kind === "reeds" && i % 2) c.rect(x + lean - 1, 30 - h, 2, 4, P.wood[1]);
    }
  } else if (kind === "fern") {
    for (let i = -3; i <= 3; i++) {
      const ex = 16 + i * 4, ey = 18 + Math.abs(i) * 2;
      c.line(16, 30, ex, ey, P.leaf[2], 1);
      for (let t = 0.3; t < 1; t += 0.2) c.set(16 + (ex - 16) * t, 30 + (ey - 30) * t - 1, P.leaf[3]);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const x = 8 + R() * 16, y = 18 + R() * 10;
      c.line(x, y, x, 30, P.grass[2], 1);
      const col = [hex("#f4e070"), hex("#e86a8a"), hex("#ffffff"), hex("#9a8aff"), hex("#f4a050")][i];
      c.ellipse(x, y, 1.6, 1.6, col);
      c.set(x, y, hex("#f8f0a0"));
    }
  }
  return c.outline(OUTLINE_SOFT);
}
const mushrooms = (glow: boolean): Art => () => {
  const c = new PC(32, 32);
  for (const [x, s] of [[12, 1], [19, 1.3], [24, 0.8]]) {
    c.rect(x - 1, 30 - 6 * s, 2.5, 6 * s, P.bone[2]);
    const cap = glow ? P.magic.blue : P.cloth.red;
    c.shadedEllipse(x, 30 - 6 * s, 4 * s, 2.6 * s, cap);
    if (!glow) c.set(x - 1, 29 - 7 * s, hex("#ffffff"));
    else c.ellipse(x, 30 - 6 * s, 6 * s, 4 * s, withA(P.magic.blue[3], 50));
  }
  return c.outline();
};
const lilypad: Art = () => {
  const c = new PC(32, 32);
  c.shadedEllipse(14, 20, 7, 4, P.leaf);
  c.poly([[14, 20], [21, 18], [21, 22]], withA(P.water[2], 255));
  c.ellipse(20, 15, 2, 2, hex("#f0a0c0"));
  return c;
};
const bones: Art = () => {
  const c = new PC(32, 32);
  c.line(8, 26, 20, 22, P.bone[2], 2);
  c.line(14, 28, 24, 26, P.bone[2], 2);
  c.shadedEllipse(23, 21, 4, 3.5, P.bone);
  c.rect(21, 21, 1, 1, P.bone[0]);
  c.rect(24, 21, 1, 1, P.bone[0]);
  return c.outline();
};
const emberVent: Art = () => {
  const c = new PC(32, 32);
  c.shadedEllipse(16, 26, 9, 4, P.ash);
  c.ellipse(16, 26, 5, 2, P.lava[2]);
  c.ellipse(16, 26, 2.5, 1, P.lava[4]);
  return c.outline();
};
const crystal: Art = () => {
  const c = new PC(32, 32);
  for (const [x, h, w] of [[12, 16, 4], [17, 22, 5], [22, 12, 3]]) {
    c.poly([[x - w, 30], [x - w, 30 - h * 0.7], [x, 30 - h], [x + w, 30 - h * 0.7], [x + w, 30]], (px) => P.crystal[px < x ? 3 : 2]);
    c.line(x, 30 - h + 1, x, 28, P.crystal[4], 1);
  }
  return c.outline();
};
const bag = (boss: boolean): Art => () => {
  const c = new PC(32, 32);
  const r = boss ? P.cloth.purple : P.leather;
  c.shadedEllipse(16, 22, 9, 8, r);
  c.poly([[11, 15], [21, 15], [18, 11], [14, 11]], r[2]);
  c.rect(11, 15, 10, 2, P.gold[2]);
  c.ellipse(16, 21, 2.5, 2.5, P.gold[3]);
  if (boss) for (const [x, y] of [[8, 10], [24, 12], [16, 6]]) c.set(x, y, P.gold[4]);
  return c.outline();
};

/** Колонна цитадели 64×100: обсидиан с раскалёнными трещинами. */
const chaosPillar: Art = () => {
  const c = new PC(64, 100);
  const R = rng(114);
  // ствол с лёгким сужением
  c.poly([[14, 92], [50, 92], [47, 14], [17, 14]], (x) => P.obsidian[x < 26 ? 3 : x > 40 ? 1 : 2]);
  c.rect(14, 60, 3, 32, P.obsidian[4]);
  // базa и капитель
  c.shadedRect(8, 88, 48, 10, P.obsidian);
  c.shadedRect(10, 4, 44, 12, P.obsidian);
  for (let y = 24; y < 86; y += 12) c.rect(17, y, 30, 1, P.obsidian[0]);
  // раскалённые трещины
  for (let i = 0; i < 5; i++) {
    let x = 20 + R() * 24, y = 20 + R() * 12;
    const n = 4 + Math.floor(R() * 4);
    for (let j = 0; j < n; j++) {
      const nx = Math.max(18, Math.min(46, x + (R() - 0.5) * 8)), ny = y + 6 + R() * 8;
      c.line(x, y, nx, ny, P.lava[2], 1);
      c.set(x, y, P.lava[4]); c.set(nx, ny, P.lava[3]);
      x = nx; y = ny;
      if (y > 84) break;
    }
  }
  c.line(32, 90, 30, 80, P.lava[3], 1);
  c.rect(24, 94, 16, 2, P.lava[2]);
  return c.outline();
};
/** Портал выхода 48×64: тёмная арка с огненным провалом. */
const raidPortal: Art = () => {
  const c = new PC(48, 64);
  c.shadedEllipse(24, 34, 20, 29, P.obsidian, [-0.5, -0.7], false);
  c.ellipse(24, 36, 14, 23, P.lava[0]);
  c.ellipse(24, 38, 10, 18, P.lava[1]);
  c.ellipse(24, 40, 6, 12, P.lava[2]);
  c.ellipse(24, 42, 3, 6, P.lava[3]);
  const R = rng(7);
  for (let i = 0; i < 14; i++) c.set(14 + R() * 20, 14 + R() * 40, P.lava[R() < 0.5 ? 3 : 4]);
  c.shadedRect(2, 56, 44, 8, P.obsidian);
  c.rect(6, 58, 36, 1, P.lava[2]);
  return c.outline();
};

export const OBJECT_ART: Record<string, Art> = {
  bush, rock, big_rock: bigRock,
  house: () => house(P.roofRed), house_blue: () => house(P.roofBlue),
  fountain, stall, lamp, well, barrel, crate, pillar, torch,
  flowers: () => tuft("flowers"), tallgrass: () => tuft("tallgrass"), fern: () => tuft("fern"), reeds: () => tuft("reeds"),
  mushrooms: mushrooms(false), mushrooms_glow: mushrooms(true), lilypad, bones, ember_vent: emberVent, crystal, chaos_pillar: chaosPillar, raid_portal: raidPortal,
  bag: bag(false), bag_boss: bag(true),
  // добыча на земле: листы 20 кадров (tools/gen/loot.ts), клиент — client/src/game/lootView.ts
  ...lootObjects(),
  ...TOWN_ART,
  ...CITY_ART,
  ...FACTION_ART,
  ...BIOME_ART,
};

// ---------------- иконки 32×32 ----------------
function iconFrame(bg: Ramp): PC {
  const c = new PC(32, 32);
  for (let y = 1; y < 31; y++) for (let x = 1; x < 31; x++) {
    const d = Math.hypot(x - 12, y - 10) / 26;
    c.set(x, y, mix(bg[2], bg[0], Math.min(1, d)));
  }
  return c;
}
/** Иконки блюд: форма (миска, мясо, хлеб, пирог, рыба) и цвет из data/food.json. */
function foodIcon(shape: string, color: string): PC {
  const c = new PC(32, 32);
  const col = (P.cloth as Record<string, Ramp>)[color] ?? P.cloth.brown;
  switch (shape) {
    case "bowl":
      c.shadedEllipse(16, 15, 8, 3, col, [-0.3, -0.6], false);
      c.poly([[6, 15], [26, 15], [22, 25], [10, 25]], P.wood[2]); c.rect(8, 17, 16, 1, P.wood[3]);
      c.set(12, 10, P.steel[3]); c.set(16, 8, P.steel[3]); c.set(20, 10, P.steel[3]); break;
    case "meat":
      c.line(8, 25, 15, 18, P.bone[2], 3); c.shadedEllipse(19, 14, 8, 7, col); c.ellipse(17, 12, 2, 1.5, withA(hex("#ffffff"), 140)); break;
    case "loaf":
      c.shadedEllipse(16, 18, 10, 6, col); for (const x of [11, 16, 21]) c.line(x - 1, 14, x + 1, 18, col[3], 1); break;
    case "pie":
      c.shadedEllipse(16, 19, 10, 5, P.leather); c.shadedEllipse(16, 16, 8, 4, col); c.line(10, 16, 22, 16, P.leather[3], 1); c.line(16, 12, 16, 20, P.leather[3], 1); break;
    case "fish":
      c.shadedEllipse(15, 17, 9, 5, col); c.poly([[23, 17], [29, 12], [29, 22]], col[2]); c.set(9, 16, P.bone[3]); c.line(13, 14, 13, 20, col[0], 1); break;
  }
  return c.outline();
}
function itemIcon(kind: string): PC {
  if (kind.startsWith("res_")) return resourceIcon(kind);
  if (kind.startsWith("food_")) {
    const d = FOOD[kind.slice(5)];
    return foodIcon(d.shape, d.color);
  }
  const c = new PC(32, 32);
  const steel = P.steel;
  switch (kind) {
    case "sword":
      c.line(8, 25, 23, 8, steel[1], 3); c.line(9, 23, 22, 9, steel[3], 1); c.set(24, 7, steel[4]);
      c.line(6, 20, 12, 26, P.gold[2], 2); c.line(5, 27, 8, 24, P.wood[2], 2); break;
    case "axe":
      c.line(8, 27, 22, 6, P.wood[2], 2);
      c.poly([[16, 8], [26, 6], [27, 17], [20, 16]], steel[2]); c.line(26, 6, 27, 17, steel[4], 1); break;
    case "staff":
      c.line(8, 28, 21, 9, P.wood[2], 2); c.line(9, 28, 22, 9, P.wood[1], 1);
      c.ellipse(23, 7, 5, 5, withA(P.magic.blue[3], 90)); c.shadedEllipse(23, 7, 3.5, 3.5, P.magic.blue); break;
    case "bow":
      for (let t = -1; t <= 1.001; t += 0.05) { const x = 12 + (1 - t * t) * 9, y = 16 + t * 12; c.ellipse(x, y, 1.1, 1.1, P.wood[2]); }
      c.line(12, 4, 12, 28, hex("#e8e4d8"), 1); break;
    case "helmet":
      c.shadedEllipse(16, 16, 10, 9, steel); c.rect(6, 17, 20, 9, withA(steel[1], 255)); c.rect(8, 17, 16, 2, steel[3]);
      c.rect(10, 19, 12, 3, hex("#141018")); c.rect(15, 6, 2, 4, P.cloth.red[2]); break;
    case "armor":
      c.poly([[7, 8], [12, 6], [16, 9], [20, 6], [25, 8], [26, 16], [23, 16], [23, 27], [9, 27], [9, 16], [6, 16]], (x) => steel[x < 13 ? 3 : x > 20 ? 1 : 2]);
      c.line(16, 10, 16, 26, steel[1], 1); c.rect(9, 20, 14, 2, P.leather[2]); break;
    case "boots":
      for (const [x, d] of [[9, 0], [17, 1]]) { c.shadedRect(x, 8 + d, 6, 14, P.leather, 1); c.shadedRect(x, 20 + d, 10, 6, P.leather, 2); c.rect(x, 9 + d, 6, 2, P.leather[3]); }
      break;
    case "ring":
      c.ellipse(16, 18, 8, 8, P.gold[2]); c.ellipse(16, 18, 5, 5, [0, 0, 0, 0]);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (Math.hypot(x + 0.5 - 16, y + 0.5 - 18) < 5) c.clear(x, y);
      c.shadedEllipse(16, 10, 4, 4, P.magic.purple); c.set(15, 9, hex("#ffffff")); break;
    case "amulet":
      for (let t = 0; t <= 1; t += 0.03) c.set(8 + t * 16, 6 + Math.sin(t * Math.PI) * 10, P.gold[3]);
      c.shadedEllipse(16, 21, 6, 7, P.gold); c.shadedEllipse(16, 21, 3.5, 4, P.magic.green); break;
    case "potion_red":
    case "potion_blue": {
      const liquid = kind === "potion_red" ? P.cloth.red.map((x) => mix(x, hex("#ff3040"), 0.3)) : P.magic.blue;
      c.shadedEllipse(16, 20, 8, 8, liquid); c.rect(13, 6, 6, 8, withA(hex("#c8d8e8"), 220));
      c.rect(12, 4, 8, 3, P.wood[2]); c.ellipse(13, 17, 2, 2.5, withA(hex("#ffffff"), 160)); break;
    }
    case "mat_ash_ore":
      c.poly([[6, 22], [10, 10], [18, 7], [26, 14], [25, 25], [12, 26]], (x) => P.stone[x < 14 ? 3 : x > 20 ? 1 : 2]);
      for (const [x, y] of [[13, 14], [20, 17], [16, 21]]) c.ellipse(x, y, 2, 2, P.magic.fire[2]);
      break;
    case "mat_star_dust":
      for (const [x, y, r] of [[16, 16, 6], [8, 9, 3], [24, 10, 3], [22, 24, 3], [9, 23, 2]]) { c.ellipse(x, y, r, r, P.magic.blue[2]); c.ellipse(x, y, r / 2, r / 2, hex("#ffffff")); }
      break;
    case "coin":
      c.ellipse(16, 16, 13, 13, P.gold[0]);
      c.shadedEllipse(16, 16, 12, 12, P.gold);
      c.ellipse(16, 16, 9, 9, P.gold[1]);
      c.ellipse(16, 16, 8, 8, P.gold[3]);
      c.poly([[10, 21], [10, 12], [13, 16], [16, 10], [19, 16], [22, 12], [22, 21]], P.gold[1]);
      c.poly([[11, 20], [11, 14], [13, 17], [16, 12], [19, 17], [21, 14], [21, 20]], P.gold[4]);
      c.rect(10, 21, 12, 2, P.gold[1]);
      for (const x of [10, 16, 22]) c.set(x, x === 16 ? 9 : 11, P.gold[4]);
      c.line(7, 10, 10, 7, hex("#ffffff"), 1); c.set(6, 12, hex("#fff6c0"));
      break;
    case "gold":
      for (const [x, y] of [[12, 22], [20, 22], [16, 16]]) { c.shadedEllipse(x, y, 6, 4, P.gold); c.rect(x - 2, y - 1, 4, 1, P.gold[1]); }
      break;
  }
  return c.outline();
}

function skillIcon(kind: string, bg: Ramp, fg: Ramp): PC {
  if (kind.startsWith("ar_")) return archerGlyph(kind, bg, fg);
  const c = iconFrame(bg);
  const g = (x: number, y: number, r: number) => c.ellipse(x, y, r, r, withA(fg[3], 90));
  const W = fg[4] ?? fg[3];
  switch (kind) {
    case "taunt": for (const r of [5, 9, 13]) for (let a = -0.9; a < 0.9; a += 0.08) c.set(10 + Math.cos(a) * r, 16 + Math.sin(a) * r, fg[3]); c.shadedEllipse(9, 16, 4, 5, P.skin); c.rect(7, 18, 5, 2, P.cloth.red[2]); break;
    case "shieldblock": c.poly([[16, 4], [27, 8], [25, 21], [16, 29], [7, 21], [5, 8]], fg[2]); c.poly([[16, 7], [24, 10], [22, 20], [16, 26], [10, 20], [8, 10]], bg[2]); c.rect(15, 9, 2, 15, W); c.rect(10, 14, 12, 2, W); break;
    case "quake": c.line(4, 24, 28, 24, fg[2], 2); c.line(16, 24, 12, 16, W, 2); c.line(12, 16, 15, 9, W, 2); c.line(16, 24, 21, 17, fg[3], 2); c.line(21, 17, 19, 11, fg[3], 1); for (const [x, y] of [[8, 20], [24, 20], [6, 14], [26, 14]]) c.ellipse(x, y, 1.5, 1.5, fg[3]); break;
    case "unbending": c.rect(11, 6, 10, 20, fg[2]); c.rect(8, 22, 16, 4, fg[1]); c.rect(13, 8, 2, 14, W); c.poly([[11, 6], [16, 2], [21, 6]], fg[3]); break;
    case "laststand": c.poly([[16, 4], [27, 8], [25, 21], [16, 29], [7, 21], [5, 8]], fg[1]); c.poly([[16, 8], [23, 11], [21, 20], [16, 25], [11, 20], [9, 11]], bg[1]); c.poly([[17, 9], [13, 17], [16, 17], [15, 24], [20, 15], [17, 15]], W); break;
    case "cleave": for (let a = -2.4; a < -0.6; a += 0.04) c.ellipse(16 + Math.cos(a) * 11, 22 + Math.sin(a) * 11, 1.6, 1.6, a > -1.2 ? W : fg[2]); c.line(10, 24, 22, 10, P.steel[3], 2); break;
    case "charge": for (let i = 0; i < 3; i++) c.line(6 + i * 3, 12 + i * 4, 18 + i * 3, 12 + i * 4, fg[2 + (i % 2)], 2); c.poly([[18, 6], [28, 16], [18, 26]], W); break;
    case "toughness": c.poly([[16, 5], [26, 9], [24, 22], [16, 28], [8, 22], [6, 9]], fg[2]); c.poly([[16, 8], [23, 11], [21, 21], [16, 25]], fg[1]); c.ellipse(16, 16, 3, 3, W); break;
    case "warcry": for (const r of [5, 9, 13]) for (let a = -0.9; a < 0.9; a += 0.08) c.set(10 + Math.cos(a) * r, 16 + Math.sin(a) * r, fg[3]); c.shadedEllipse(9, 16, 4, 5, P.skin); break;
    case "bloodlust": c.poly([[16, 5], [23, 18], [16, 27], [9, 18]], fg[2]); c.shadedEllipse(16, 19, 7, 7, fg); c.set(13, 16, W); break;
    case "whirlwind": for (let t = 0; t < 14; t += 0.08) c.set(16 + Math.cos(t) * t * 0.85, 16 + Math.sin(t) * t * 0.85, t > 9 ? W : fg[2]); break;
    case "berserk": c.shadedEllipse(16, 15, 9, 9, P.bone); c.rect(10, 13, 4, 3, fg[3]); c.rect(18, 13, 4, 3, fg[3]); c.rect(12, 21, 8, 2, P.bone[0]); for (const s of [-1, 1]) c.line(16 + s * 6, 8, 16 + s * 10, 3, P.bone[3], 2); break;
    case "fireball": g(17, 15, 10); for (let i = 0; i < 4; i++) c.line(6 + i * 2, 26 - i, 14, 18, P.magic.fire[1 + i % 2], 2); c.shadedEllipse(18, 14, 7, 7, P.magic.fire); break;
    case "frostnova": for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.line(16, 16, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, fg[3], 2); c.line(16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 + Math.cos(a + 0.4) * 10, 16 + Math.sin(a + 0.4) * 10, W, 1); } c.ellipse(16, 16, 3, 3, W); break;
    case "wisdom": c.shadedRect(6, 9, 20, 16, P.cloth.blue); c.rect(15, 9, 2, 16, P.gold[3]); for (const y of [13, 16, 19]) { c.rect(8, y, 6, 1, P.bone[3]); c.rect(18, y, 6, 1, P.bone[3]); } break;
    case "blink": for (const [x, y, r] of [[10, 22, 3], [16, 15, 4], [23, 9, 5]]) { g(x, y, r + 2); c.ellipse(x, y, r * 0.5, r, W); c.ellipse(x, y, r, r * 0.5, fg[3]); } break;
    case "focus": c.ellipse(16, 16, 12, 7, P.bone[3]); c.shadedEllipse(16, 16, 6, 6, fg); c.ellipse(16, 16, 2.5, 2.5, hex("#141018")); c.set(14, 14, W); break;
    case "meteor": g(20, 12, 9); for (let i = 0; i < 5; i++) c.line(4 + i * 2, 4 + i, 18, 14, P.magic.fire[1 + (i % 3)], 2); c.shadedEllipse(20, 15, 7, 7, P.stone.map((x) => mix(x, hex("#ff6020"), 0.3))); c.line(15, 27, 27, 27, P.magic.fire[3], 2); break;
    case "shield": g(16, 16, 12); c.ellipse(16, 16, 11, 11, withA(fg[3], 120)); c.ellipse(16, 16, 8, 8, withA(fg[2], 160)); c.ellipse(12, 12, 3, 2, W); break;
    case "aimed": c.ellipse(16, 16, 10, 10, fg[2]); c.ellipse(16, 16, 8, 8, bg[1]); c.ellipse(16, 16, 5, 5, fg[3]); c.ellipse(16, 16, 2, 2, W); c.line(4, 28, 15, 17, P.wood[3], 2); break;
    case "volley": for (const a of [-0.5, 0, 0.5]) { const ex = 16 + Math.sin(a) * 13, ey = 16 - Math.cos(a) * 13; c.line(16 - Math.sin(a) * 8, 16 + Math.cos(a) * 10, ex, ey, P.wood[3], 1); c.ellipse(ex, ey, 1.5, 1.5, W); } break;
    case "precision": c.line(16, 3, 16, 29, fg[3], 1); c.line(3, 16, 29, 16, fg[3], 1); c.ellipse(16, 16, 8, 8, withA(fg[2], 255)); c.ellipse(16, 16, 6.5, 6.5, bg[1]); c.ellipse(16, 16, 1.5, 1.5, W); break;
    case "roll": for (let a = 0.5; a < 5.5; a += 0.05) c.ellipse(16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, 1.3, 1.3, a > 4.6 ? W : fg[2]); c.poly([[22, 6], [28, 12], [20, 14]], W); break;
    case "quickhands": c.shadedEllipse(14, 18, 6, 7, P.skin); for (let i = 0; i < 3; i++) c.line(20, 10 + i * 5, 28, 8 + i * 5, fg[3], 1); break;
    case "rain": for (let i = 0; i < 6; i++) { const x = 6 + i * 4, y = 6 + (i % 2) * 6; c.line(x, y, x - 2, y + 12, P.wood[3], 1); c.set(x - 2, y + 13, W); } c.line(4, 28, 28, 28, fg[2], 2); break;
    case "heal": g(16, 16, 12); c.rect(13, 7, 6, 18, W); c.rect(7, 13, 18, 6, W); c.rect(14, 8, 4, 16, fg[3]); c.rect(8, 14, 16, 4, fg[3]); break;
    case "circle": for (const r of [12, 8]) for (let a = 0; a < 6.3; a += 0.05) c.set(16 + Math.cos(a) * r, 18 + Math.sin(a) * r * 0.6, r === 12 ? fg[3] : W); for (const [x, y] of [[16, 10], [10, 18], [22, 18], [16, 24]]) c.ellipse(x, y, 1.5, 1.5, W); break;
    case "grace": c.poly([[16, 4], [26, 14], [16, 28], [6, 14]], fg[2]); c.poly([[16, 8], [22, 14], [16, 24], [10, 14]], bg[1]); c.ellipse(16, 14, 3, 3, W); break;
    case "renew": for (let i = 0; i < 3; i++) { const x = 8 + i * 8; c.rect(x - 2, 14, 5, 5, fg[3]); c.rect(x - 1, 11, 3, 11, fg[3]); c.set(x, 14, W); } c.line(4, 26, 28, 26, fg[1], 2); c.line(4, 8, 28, 8, fg[2], 1); break;
    case "smite": g(16, 16, 12); c.poly([[18, 2], [9, 17], [15, 17], [12, 30], [23, 12], [17, 12]], W); c.poly([[18, 5], [12, 16], [17, 16], [14, 26], [20, 13], [16, 13]], fg[3]); break;
    case "resurrect": g(16, 18, 11); c.shadedEllipse(16, 21, 7, 7, P.bone); c.rect(13, 20, 2, 2, hex("#141018")); c.rect(18, 20, 2, 2, hex("#141018")); for (const s of [-1, 1]) c.line(16 + s * 9, 14, 16 + s * 12, 4, W, 2); c.line(16, 3, 16, 12, fg[3], 2); c.line(12, 7, 20, 7, fg[3], 2); break;
    case "holyshield": g(16, 16, 12); c.poly([[16, 4], [27, 8], [25, 21], [16, 29], [7, 21], [5, 8]], fg[2]); c.poly([[16, 7], [24, 10], [22, 20], [16, 26], [10, 20], [8, 10]], bg[2]); c.rect(15, 10, 2, 13, W); c.rect(11, 14, 10, 2, W); break;
    case "insight": c.ellipse(16, 16, 12, 7, P.bone[3]); c.shadedEllipse(16, 16, 6, 6, fg); c.ellipse(16, 16, 2.5, 2.5, hex("#141018")); for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.6; c.line(16 + Math.cos(a - Math.PI / 2) * 9, 12 + Math.sin(a - Math.PI / 2) * 9, 16 + Math.cos(a - Math.PI / 2) * 13, 12 + Math.sin(a - Math.PI / 2) * 13, W, 1); } break;
    case "backstab": c.poly([[16, 3], [20, 18], [16, 24], [12, 18]], fg[3]); c.line(16, 5, 16, 20, W, 1); c.rect(10, 22, 12, 2, P.gold[2]); c.rect(15, 24, 2, 5, P.leather[2]); c.ellipse(24, 8, 2, 2, P.cloth.red[3]); c.ellipse(26, 12, 1.2, 1.2, P.cloth.red[2]); break;
    case "venom": c.line(8, 26, 20, 6, fg[2], 3); c.line(9, 25, 19, 7, W, 1); for (const [x, y, r] of [[22, 20, 3], [10, 12, 2], [25, 11, 2]] as number[][]) c.shadedEllipse(x, y, r, r, P.magic.green); c.poly([[22, 26], [25, 22], [19, 22]], P.magic.green[3]); break;
    case "deadly": c.ellipse(16, 16, 10, 10, fg[2]); c.ellipse(16, 16, 8, 8, bg[1]); c.poly([[16, 5], [18, 14], [27, 16], [18, 18], [16, 27], [14, 18], [5, 16], [14, 14]], W); break;
    case "shadowstep": c.poly([[8, 8], [14, 8], [14, 24], [8, 24]], withA(fg[1], 140)); c.poly([[12, 8], [18, 8], [18, 24], [12, 24]], withA(fg[2], 190)); c.poly([[18, 6], [28, 16], [18, 26]], W); break;
    case "evasion": for (let i = 0; i < 3; i++) c.line(6, 10 + i * 6, 20 - i * 2, 10 + i * 6, withA(fg[2], 170), 2); c.shadedEllipse(22, 16, 4, 6, fg); c.set(22, 12, W); break;
    case "poisoner": c.shadedEllipse(16, 20, 8, 8, P.magic.green); c.rect(13, 8, 6, 5, P.bone[2]); c.rect(12, 7, 8, 2, P.bone[3]); c.set(14, 18, W); c.ellipse(24, 8, 2, 2, fg[3]); c.ellipse(8, 10, 1.5, 1.5, fg[3]); break;
    case "stealth": c.ellipse(16, 12, 7, 8, fg[1]); c.poly([[9, 14], [23, 14], [26, 28], [6, 28]], fg[2]); c.rect(12, 11, 3, 2, W); c.rect(17, 11, 3, 2, W); for (const [x, y] of [[5, 6], [27, 8], [27, 22]]) c.ellipse(x, y, 1.5, 1.5, withA(W, 140)); break;
    case "hunter": for (let i = 0; i < 3; i++) c.line(9 + i * 6, 6, 5 + i * 6, 26, fg[2 + (i % 2)], 2); c.shadedEllipse(22, 22, 5, 5, P.cloth.red); break;
    case "bash": c.poly([[8, 5], [24, 5], [24, 18], [16, 27], [8, 18]], fg[2]); c.poly([[11, 8], [21, 8], [21, 17], [16, 22], [11, 17]], bg[2]); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.line(16 + Math.cos(a) * 3, 14 + Math.sin(a) * 3, 16 + Math.cos(a) * 9, 14 + Math.sin(a) * 9, i % 2 ? W : fg[3], 1); } break;
    case "glare": g(16, 16, 13); c.ellipse(16, 16, 5, 5, W); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; c.line(16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, i % 2 ? fg[3] : fg[2], 2); } break;
    case "hammer": c.rect(14, 12, 4, 17, P.wood[2]); c.rect(15, 12, 1, 17, P.wood[3]); c.shadedRect(7, 4, 18, 9, P.steel); c.rect(7, 4, 18, 1, W); c.set(24, 9, fg[3]); c.ellipse(26, 5, 2, 2, withA(fg[3], 160)); break;
    case "banner": c.rect(8, 3, 2, 26, P.wood[2]); c.poly([[10, 5], [26, 7], [22, 12], [26, 17], [10, 19]], fg[2]); c.poly([[10, 5], [24, 7], [10, 10]], fg[3]); c.rect(14, 9, 2, 6, W); c.rect(12, 11, 6, 2, W); c.ellipse(9, 3, 2, 2, fg[3]); break;
    case "divine": g(16, 16, 14); c.poly([[16, 5], [25, 8], [24, 19], [16, 26], [8, 19], [7, 8]], fg[2]); c.poly([[16, 8], [22, 10], [21, 18], [16, 22], [11, 18], [10, 10]], W); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.set(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, W); } break;
    case "anvil": c.poly([[5, 11], [27, 11], [24, 16], [19, 16], [20, 22], [24, 25], [8, 25], [12, 22], [13, 16], [8, 16]], P.steel[2]); c.rect(5, 11, 22, 2, P.steel[3]); c.rect(13, 22, 6, 3, P.steel[1]); for (const [x, y] of [[9, 6], [15, 4], [22, 6], [18, 8]]) c.ellipse(x, y, 1.2, 1.2, fg[3]); break;
    case "bulwark": c.rect(6, 5, 20, 22, fg[1]); c.rect(8, 7, 16, 18, bg[2]); c.rect(8, 7, 16, 2, fg[3]); c.rect(15, 7, 2, 18, fg[2]); c.rect(8, 15, 16, 2, fg[2]); for (const [x, y] of [[9, 8], [22, 8], [9, 23], [22, 23]]) c.set(x, y, W); break;
    case "heartshield": c.poly([[16, 28], [5, 14], [5, 9], [9, 5], [14, 6], [16, 9], [18, 6], [23, 5], [27, 9], [27, 14]], fg[1]); c.poly([[16, 25], [8, 14], [8, 10], [11, 8], [15, 9], [16, 12], [17, 9], [21, 8], [24, 10], [24, 14]], bg[2]); c.rect(15, 11, 2, 11, fg[3]); c.rect(11, 14, 10, 2, fg[3]); break;
    case "wing": for (let i = 0; i < 5; i++) c.poly([[6, 24 - i * 4], [10 + i * 3, 22 - i * 4], [26, 8 + i * 2 - 2], [12 + i * 2, 25 - i * 4]], i % 2 ? fg[2] : fg[3]); c.ellipse(8, 25, 2, 2, W); break;
    case "nova": for (const r of [13, 9]) for (let a = 0; a < 6.3; a += 0.05) c.set(16 + Math.cos(a) * r, 16 + Math.sin(a) * r, r === 13 ? fg[2] : fg[3]); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.line(16 + Math.cos(a) * 4, 16 + Math.sin(a) * 4, 16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8, W, 1); } c.ellipse(16, 16, 3, 3, W); break;
    case "martyr": c.shadedEllipse(10, 10, 4, 4, P.skin); c.poly([[5, 28], [6, 16], [14, 16], [15, 28]], fg[1]); c.shadedEllipse(23, 10, 4, 4, P.skin); c.poly([[18, 28], [19, 16], [27, 16], [28, 28]], fg[2]); c.line(14, 20, 19, 20, W, 2); c.ellipse(16, 20, 2, 2, fg[3]); break;
    case "sunblade": g(16, 16, 13); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.line(16 + Math.cos(a) * 8, 12 + Math.sin(a) * 8, 16 + Math.cos(a) * 12, 12 + Math.sin(a) * 12, fg[3], 1); } c.ellipse(16, 12, 6, 6, fg[2]); c.line(16, 4, 16, 24, W, 2); c.rect(11, 22, 10, 2, fg[3]); c.rect(15, 24, 2, 5, P.leather[2]); break;
    case "fangs": g(16, 14, 12); c.poly([[7, 8], [25, 8], [22, 12], [10, 12]], P.bone[2]); c.poly([[9, 10], [14, 10], [12, 26]], W); c.poly([[18, 10], [23, 10], [20, 26]], W); c.ellipse(12, 24, 1.5, 3, fg[3]); c.ellipse(20, 24, 1.5, 3, fg[3]); break;
    case "icearmor": c.poly([[8, 7], [24, 7], [27, 14], [23, 28], [9, 28], [5, 14]], fg[2]); c.poly([[11, 10], [21, 10], [23, 15], [20, 25], [12, 25], [9, 15]], bg[2]); for (const [x0, y0, x1, y1] of [[16, 8, 16, 26], [10, 14, 22, 20], [22, 14, 10, 20]]) c.line(x0, y0, x1, y1, fg[3], 1); c.ellipse(16, 17, 2, 2, W); break;
    case "icytouch": c.poly([[6, 26], [10, 10], [14, 8], [18, 10], [22, 6], [25, 12], [20, 18], [16, 26]], P.skinPale[2]); for (const [x, y, h] of [[20, 5, 7], [24, 8, 6], [14, 3, 6]]) c.poly([[x - 2, y + h], [x, y], [x + 2, y + h]], fg[3]); c.ellipse(24, 20, 3, 3, withA(fg[2], 200)); c.set(24, 20, W); break;
    case "snowflake": for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; c.line(16, 16, 16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, fg[3], 2); for (const s of [-1, 1]) c.line(16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8, 16 + Math.cos(a + s * 0.7) * 11, 16 + Math.sin(a + s * 0.7) * 11, W, 1); } c.ellipse(16, 16, 2, 2, W); break;
    case "rune": g(16, 16, 12); c.poly([[10, 4], [22, 4], [26, 10], [26, 22], [22, 28], [10, 28], [6, 22], [6, 10]], bg[2]); c.line(12, 8, 12, 24, fg[3], 2); c.line(12, 12, 20, 8, W, 2); c.line(12, 18, 20, 14, W, 2); c.line(12, 24, 20, 20, fg[3], 2); break;
    case "thorns": for (let i = 0; i < 7; i++) { const a = -Math.PI + (i / 6) * Math.PI; c.poly([[16 + Math.cos(a) * 6, 20 + Math.sin(a) * 6], [16 + Math.cos(a) * 13, 20 + Math.sin(a) * 13], [16 + Math.cos(a + 0.35) * 6, 20 + Math.sin(a + 0.35) * 6]], i % 2 ? W : fg[3]); } c.ellipse(16, 21, 7, 4, fg[1]); break;
    case "scythe": c.line(8, 29, 22, 5, P.wood[3], 3); for (let a = -2.2; a < -0.2; a += 0.06) c.ellipse(21 + Math.cos(a) * 9, 14 + Math.sin(a) * 9, 1.8, 1.8, a > -0.9 ? W : fg[2]); c.ellipse(26, 12, 1.5, 1.5, fg[3]); break;
    case "chainlink": for (const [x, y, r] of [[9, 9, 5], [16, 16, 5], [23, 23, 5]]) { c.ellipse(x, y, r, r - 1, fg[2]); c.ellipse(x, y, r - 2, r - 3, bg[1]); } c.line(11, 11, 14, 14, W, 1); c.line(18, 18, 21, 21, W, 1); break;
    case "runeblade": g(16, 16, 12); c.poly([[14, 3], [18, 3], [19, 22], [13, 22]], P.steel[3]); c.rect(15, 4, 1, 17, W); c.rect(9, 22, 14, 2, fg[2]); c.rect(15, 24, 2, 5, P.leather[2]); for (const y of [8, 13, 18]) c.set(16, y, fg[3]); c.ellipse(24, 8, 1.5, 1.5, fg[3]); c.ellipse(8, 14, 1.5, 1.5, fg[3]); break;
    case "skullmark": c.shadedEllipse(16, 14, 8, 8, P.bone); c.rect(10, 12, 4, 4, hex("#141018")); c.rect(18, 12, 4, 4, hex("#141018")); c.rect(13, 20, 6, 4, P.bone[2]); c.line(14, 20, 14, 24, hex("#141018"), 1); c.line(18, 20, 18, 24, hex("#141018"), 1); c.line(4, 4, 28, 28, fg[3], 2); c.line(28, 4, 4, 28, fg[3], 2); break;
    case "droplets": for (const [x, y, r] of [[16, 13, 7], [8, 22, 4], [24, 22, 4]]) { c.poly([[x, y - r - 3], [x + r, y + 1], [x, y + r], [x - r, y + 1]], fg[2]); c.ellipse(x, y + 1, r, r, fg[2]); c.set(x - 2, y - 1, W); } break;
    case "chains": for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; for (let j = 1; j <= 3; j++) c.ellipse(16 + Math.cos(a) * j * 4.2, 16 + Math.sin(a) * j * 4.2, 2.2, 1.6, j % 2 ? fg[3] : fg[2]); } c.shadedEllipse(16, 16, 4, 4, P.bone); break;
    case "soulorb": g(16, 16, 12); c.shadedEllipse(16, 17, 8, 8, fg); c.ellipse(13, 14, 2, 2, W); for (const [x, y] of [[8, 7], [24, 8], [26, 20], [6, 22]]) c.ellipse(x, y, 1.3, 1.3, fg[3]); c.line(16, 3, 16, 8, fg[3], 2); break;
    case "antimagic": c.ellipse(16, 16, 13, 13, withA(fg[1], 140)); for (let a = 0; a < 6.3; a += 0.04) c.set(16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, fg[3]); c.line(9, 9, 23, 23, W, 3); c.line(23, 9, 9, 23, W, 3); c.shadedEllipse(16, 16, 4, 4, bg); break;
    case "runefury": g(16, 16, 12); c.poly([[16, 3], [27, 16], [16, 29], [5, 16]], bg[2]); c.line(12, 10, 12, 22, fg[3], 2); c.line(12, 12, 20, 9, W, 2); c.line(12, 18, 20, 15, W, 2); for (let i = 0; i < 3; i++) c.line(22 + i, 8 + i * 6, 29, 6 + i * 6, fg[2], 1); break;
    case "coffin": c.poly([[12, 3], [20, 3], [26, 11], [21, 29], [11, 29], [6, 11]], P.wood[2]); c.poly([[13, 6], [19, 6], [23, 12], [19, 26], [13, 26], [9, 12]], bg[1]); c.rect(15, 9, 2, 12, fg[3]); c.rect(11, 12, 10, 2, fg[3]); c.set(16, 16, W); break;
    // ---- лекари: Клирик ----
    case "absolve": g(16, 16, 13); c.poly([[16, 8], [25, 11], [23, 22], [16, 28], [9, 22], [7, 11]], fg[2]); c.poly([[16, 11], [22, 13], [20, 21], [16, 25], [12, 21], [10, 13]], bg[2]); c.ellipse(16, 5, 7, 2.5, fg[3]); c.ellipse(16, 5, 5, 1.2, bg[1]); c.rect(15, 14, 2, 8, W); c.rect(12, 17, 8, 2, W); for (const x of [8, 24]) c.ellipse(x, 26, 1.5, 2.5, fg[3]); break;
    case "raybeam": g(16, 16, 12); c.poly([[3, 27], [8, 29], [28, 9], [24, 4]], withA(fg[2], 190)); c.poly([[5, 26], [8, 27], [26, 9], [23, 6]], W); for (const [x, y] of [[25, 6], [28, 12], [20, 4]]) c.ellipse(x, y, 1.6, 1.6, fg[3]); c.shadedEllipse(7, 25, 4, 4, fg); break;
    case "wardwrath": c.poly([[16, 4], [27, 8], [25, 21], [16, 29], [7, 21], [5, 8]], fg[2]); c.poly([[16, 8], [23, 11], [21, 20], [16, 25], [11, 20], [9, 11]], bg[2]); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.line(16 + Math.cos(a) * 4, 16 + Math.sin(a) * 4, 16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, i % 2 ? W : fg[3], 1); } c.ellipse(16, 16, 3, 3, W); break;
    case "bless": g(16, 14, 13); c.poly([[16, 2], [18, 11], [27, 13], [18, 16], [16, 25], [14, 16], [5, 13], [14, 11]], fg[3]); c.poly([[16, 6], [17, 12], [22, 13], [17, 15], [16, 20], [15, 15], [10, 13], [15, 12]], W); c.shadedEllipse(16, 27, 9, 3, P.skin); break;
    case "cleanse": g(16, 16, 12); c.poly([[16, 3], [24, 16], [22, 24], [16, 28], [10, 24], [8, 16]], fg[2]); c.poly([[16, 7], [21, 16], [19, 22], [16, 24], [13, 22], [11, 16]], bg[1]); c.set(13, 18, W); c.set(14, 17, W); for (const [x, y] of [[26, 8], [5, 10], [27, 24]]) { c.line(x - 2, y, x + 2, y, W, 1); c.line(x, y - 2, x, y + 2, W, 1); } break;
    case "purelight": g(16, 15, 13); c.poly([[16, 3], [22, 13], [20, 22], [12, 22], [10, 13]], fg[2]); c.poly([[16, 8], [19, 14], [18, 20], [14, 20], [13, 14]], W); c.rect(11, 23, 10, 3, P.steel[2]); c.rect(12, 26, 8, 2, P.steel[1]); for (const a of [-1.2, -0.6, 0.6, 1.2]) c.line(16 + Math.sin(a) * 6, 14 - Math.cos(a) * 6, 16 + Math.sin(a) * 13, 14 - Math.cos(a) * 13, fg[3], 1); break;
    case "echo": for (const [x, y, s, col] of [[9, 20, 5, fg[1]], [16, 16, 7, fg[2]], [23, 11, 9, fg[3]]] as [number, number, number, any][]) { c.rect(x - 1, y - s / 2, 3, s, col); c.rect(x - s / 2, y - 1, s, 3, col); } c.set(23, 11, W); for (let a = -0.5; a < 0.6; a += 0.1) c.set(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, withA(fg[3], 150)); break;
    case "holyspark": g(16, 16, 13); c.poly([[16, 27], [5, 15], [5, 10], [9, 6], [14, 7], [16, 10], [18, 7], [23, 6], [27, 10], [27, 15]], fg[1]); c.poly([[19, 3], [11, 16], [16, 16], [13, 29], [23, 12], [17, 12]], W); c.poly([[19, 6], [14, 15], [18, 15], [15, 25], [21, 13], [17, 13]], fg[3]); break;
    case "aegis": g(16, 16, 14); for (let a = 0; a < 6.3; a += 0.05) c.set(16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, fg[2]); c.poly([[16, 6], [24, 9], [22, 19], [16, 25], [10, 19], [8, 9]], fg[2]); c.poly([[16, 9], [21, 11], [20, 18], [16, 22], [12, 18], [11, 11]], bg[2]); c.rect(15, 11, 2, 9, W); c.rect(12, 14, 8, 2, W); for (const [x, y] of [[4, 16], [28, 16], [16, 3]]) c.ellipse(x, y, 1.8, 1.8, fg[3]); break;
    case "angel": g(16, 14, 13); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) c.poly([[16 + s * 3, 14 + i * 3], [16 + s * (13 - i * 2), 6 + i * 4], [16 + s * (14 - i * 2), 9 + i * 4], [16 + s * 4, 17 + i * 3]], i % 2 ? fg[2] : fg[3]); c.ellipse(16, 5, 6, 2, fg[3]); c.ellipse(16, 5, 4, 0.8, bg[1]); c.shadedEllipse(16, 15, 3, 3, P.skin); c.poly([[13, 18], [19, 18], [20, 28], [12, 28]], W); break;
    case "hymn": g(16, 16, 13); for (const r of [13, 9]) for (let a = -0.8; a < 0.8; a += 0.07) { c.set(10 + Math.cos(a) * r, 18 + Math.sin(a) * r, fg[2]); } c.shadedEllipse(12, 23, 4, 3, fg); c.rect(15, 7, 2, 16, W); c.poly([[17, 7], [25, 10], [25, 14], [17, 11]], W); break;
    case "lastgift": g(16, 16, 13); c.rect(14, 5, 4, 22, fg[2]); c.rect(8, 11, 16, 4, fg[2]); c.rect(15, 6, 2, 20, W); c.rect(9, 12, 14, 2, W); for (const [x, y] of [[5, 22], [27, 22], [8, 28], [24, 28], [16, 30]]) c.poly([[x, y - 3], [x + 2, y], [x, y + 1], [x - 2, y]], fg[3]); break;
    // ---- лекари: Кровотворец ----
    case "pulse": c.poly([[16, 28], [4, 14], [4, 9], [8, 5], [13, 6], [16, 9], [19, 6], [24, 5], [28, 9], [28, 14]], fg[1]); c.poly([[16, 25], [7, 14], [7, 10], [10, 8], [14, 9], [16, 12], [18, 9], [22, 8], [25, 10], [25, 14]], bg[1]); c.line(4, 17, 11, 17, W, 2); c.line(11, 17, 14, 9, W, 2); c.line(14, 9, 18, 24, W, 2); c.line(18, 24, 21, 17, W, 2); c.line(21, 17, 28, 17, W, 2); break;
    case "leech": c.line(6, 24, 12, 18, fg[1], 4); c.line(12, 18, 19, 17, fg[2], 4); c.line(19, 17, 24, 11, fg[2], 3); c.shadedEllipse(26, 8, 4, 4, fg); c.set(25, 6, W); for (const [x, y] of [[8, 10], [5, 16]]) c.poly([[x, y - 4], [x + 3, y], [x, y + 3], [x - 3, y]], fg[3]); c.line(6, 24, 4, 28, fg[3], 2); break;
    case "bloodburst": g(16, 16, 13); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 7 : 13; c.line(16, 16, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, i % 2 ? fg[3] : fg[2], 3); c.ellipse(16 + Math.cos(a) * (r + 2), 16 + Math.sin(a) * (r + 2), 1.4, 1.4, fg[3]); } c.shadedEllipse(16, 16, 5, 5, fg); c.set(14, 14, W); break;
    case "wrist": c.poly([[4, 18], [26, 10], [28, 17], [6, 25]], P.skin[2]); c.poly([[4, 18], [26, 10], [27, 13], [5, 21]], P.skin[3]); c.line(11, 14, 19, 22, fg[2], 2); for (const [x, y, r] of [[13, 25, 3], [20, 28, 2], [9, 29, 2]]) c.poly([[x, y - r - 2], [x + r, y], [x, y + r], [x - r, y]], fg[2]); c.set(12, 24, W); break;
    case "clot": g(16, 16, 12); c.shadedEllipse(16, 17, 11, 9, fg); for (const [x0, y0, x1, y1] of [[8, 14, 14, 18], [14, 18, 13, 24], [14, 18, 20, 16], [20, 16, 24, 20]]) c.line(x0, y0, x1, y1, bg[1], 1); c.ellipse(11, 13, 3, 2, W); c.poly([[22, 7], [24, 12], [20, 12]], fg[3]); break;
    case "pool": c.ellipse(16, 20, 14, 7, bg[1]); c.ellipse(16, 20, 12, 5.5, fg[1]); c.ellipse(16, 20, 8, 3.5, fg[2]); c.ellipse(16, 20, 4, 1.8, fg[3]); c.poly([[16, 4], [20, 10], [16, 14], [12, 10]], fg[3]); c.set(15, 8, W); for (const x of [5, 27]) c.ellipse(x, 24, 1.5, 1, W); break;
    case "transfuse": for (const [x, s] of [[8, 1], [24, -1]] as number[][]) { c.poly([[x, 5], [x + 6, 14], [x, 22], [x - 6, 14]], s > 0 ? fg[2] : fg[3]); c.ellipse(x, 17, 6, 6, s > 0 ? fg[2] : fg[3]); c.set(x - 2, 15, W); } c.line(10, 12, 22, 12, W, 2); c.poly([[22, 8], [27, 12], [22, 16]], W); c.line(22, 25, 10, 25, W, 2); c.poly([[10, 21], [5, 25], [10, 29]], W); break;
    case "resonance": for (const r of [13, 9, 5]) for (let a = -0.7; a < 0.7; a += 0.06) { c.set(8 + Math.cos(a) * r * 1.4, 16 + Math.sin(a) * r * 1.4, r === 5 ? W : fg[r === 9 ? 3 : 2]); } c.poly([[7, 8], [12, 16], [7, 23], [2, 16]], fg[2]); c.ellipse(7, 18, 5, 5, fg[2]); c.set(5, 16, W); break;
    case "bloodgift": g(16, 16, 12); c.poly([[16, 8], [24, 19], [16, 28], [8, 19]], fg[2]); c.ellipse(16, 21, 7, 6, fg[2]); c.set(13, 19, W); c.poly([[16, 1], [20, 7], [17, 7], [17, 12], [15, 12], [15, 7], [12, 7]], W); break;
    case "bloodring": for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - 1.57, x = 16 + Math.cos(a) * 10, y = 16 + Math.sin(a) * 10; c.line(16, 16, x, y, withA(fg[2], 180), 1); c.poly([[x, y - 5], [x + 3, y], [x, y + 3], [x - 3, y]], fg[2]); c.ellipse(x, y + 0.5, 3, 3, fg[2]); c.set(x - 1, y - 1, W); } for (let a = 0; a < 6.3; a += 0.05) c.set(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, withA(fg[3], 140)); c.shadedEllipse(16, 16, 4, 4, fg); break;
    case "bloodmana": c.poly([[16, 3], [26, 17], [16, 29], [6, 17]], fg[1]); c.poly([[16, 7], [23, 17], [16, 26], [9, 17]], fg[2]); c.poly([[16, 11], [20, 17], [16, 22], [12, 17]], P.magic.blue[3]); c.poly([[16, 13], [18, 17], [16, 20]], W); c.set(13, 14, W); break;
    case "lastdrop": g(16, 16, 12); c.poly([[16, 2], [26, 18], [24, 25], [16, 29], [8, 25], [6, 18]], fg[2]); c.poly([[16, 5], [23, 18], [21, 24], [16, 27], [11, 24], [9, 18]], bg[1]); c.poly([[16, 8], [20, 18], [16, 24], [12, 18]], fg[3]); c.line(16, 8, 14, 16, bg[0], 1); c.line(14, 16, 17, 20, bg[0], 1); c.set(13, 17, W); break;
    case "bloodwave": g(16, 16, 12); c.poly([[2, 26], [3, 18], [9, 10], [16, 8], [22, 11], [24, 17], [20, 15], [16, 15], [13, 19], [14, 26]], fg[2]); c.poly([[2, 28], [30, 28], [30, 24], [2, 24]], fg[1]); for (let a = 0; a < 3; a++) c.line(5 + a * 9, 24, 8 + a * 9, 20, fg[3], 2); for (const [x, y] of [[24, 7], [27, 12], [21, 4]]) c.poly([[x, y - 3], [x + 2, y], [x, y + 2], [x - 2, y]], fg[3]); c.set(10, 12, W); break;
    // ---- разбойники (задача 44): Ассасин и Потрошитель ----
    case "rg_weakpoint": g(16, 16, 12); c.ellipse(16, 16, 11, 11, fg[2]); c.ellipse(16, 16, 9, 9, bg[1]); c.ellipse(16, 16, 6, 6, fg[1]); c.ellipse(16, 16, 4, 4, bg[0]); for (const [x0, y0, x1, y1] of [[16, 2, 16, 8], [16, 24, 16, 30], [2, 16, 8, 16], [24, 16, 30, 16]]) c.line(x0, y0, x1, y1, fg[3], 2); c.poly([[16, 11], [19, 16], [16, 21], [13, 16]], fg[3]); c.set(15, 14, W); break;
    case "rg_flank": c.shadedEllipse(12, 14, 6, 6, P.skin); c.rect(7, 20, 10, 7, bg[2]); for (let a = -1.4; a < 1.3; a += 0.04) c.ellipse(14 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 1.4, 1.4, fg[3]); c.poly([[12, 29], [18, 24], [19, 31]], W); c.set(10, 12, W); break;
    case "rg_dose": g(16, 18, 11); c.rect(12, 2, 8, 3, P.wood[3]); c.rect(14, 5, 4, 6, P.steel[2]); c.poly([[14, 10], [18, 10], [26, 25], [22, 29], [10, 29], [6, 25]], fg[1]); c.poly([[15, 11], [17, 11], [23, 25], [20, 27], [12, 27], [9, 25]], bg[1]); c.poly([[10, 19], [22, 19], [24, 25], [20, 27], [12, 27], [8, 25]], fg[3]); c.ellipse(13, 23, 1.5, 1.5, W); c.ellipse(18, 21, 1, 1, W); c.ellipse(19, 25, 1, 1, W); break;
    case "rg_potency": for (const [x, y, s, i] of [[8, 22, 0.8, 1], [24, 22, 0.8, 1], [16, 15, 1.4, 2]]) { c.poly([[x, y - 6 * s], [x + 4 * s, y + 1 * s], [x, y + 5 * s], [x - 4 * s, y + 1 * s]], fg[i + 1]); c.ellipse(x, y + 1.5 * s, 3.6 * s, 3.4 * s, fg[i + 1]); c.set(x - 1.5 * s, y, W); } break;
    case "rg_fan": for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) { const x1 = 16 + Math.sin(a) * 25, y1 = 29 - Math.cos(a) * 26; c.line(16 + Math.sin(a) * 9, 29 - Math.cos(a) * 9, x1, y1, P.steel[3], 2); c.line(16 + Math.sin(a) * 3, 29 - Math.cos(a) * 3, 16 + Math.sin(a) * 9, 29 - Math.cos(a) * 9, fg[2], 2); c.set(x1, y1, W); } c.ellipse(16, 29, 3, 2, P.wood[3]); break;
    case "rg_ambush": c.poly([[16, 3], [27, 14], [25, 28], [7, 28], [5, 14]], fg[1]); c.poly([[16, 7], [23, 15], [22, 26], [10, 26], [9, 15]], bg[0]); c.rect(11, 14, 4, 2, fg[3]); c.rect(18, 14, 4, 2, fg[3]); c.set(12, 14, W); c.set(19, 14, W); c.line(13, 21, 19, 21, fg[1], 1); break;
    case "rg_cheap": g(16, 18, 11); c.line(16, 29, 16, 15, P.steel[3], 3); c.rect(11, 13, 10, 3, fg[2]); c.rect(14, 8, 4, 5, P.wood[3]); c.ellipse(16, 7, 3, 3, fg[3]); for (const [x, y] of [[6, 9], [26, 8], [9, 20], [24, 21]]) { c.line(x - 3, y, x + 3, y, W, 1); c.line(x, y - 3, x, y + 3, W, 1); c.set(x, y, fg[3]); } break;
    case "rg_riposte": c.line(5, 27, 22, 8, P.steel[3], 3); c.line(27, 27, 10, 8, fg[3], 3); c.rect(4, 25, 4, 4, P.wood[3]); c.rect(24, 25, 4, 4, P.wood[3]); g(16, 14, 8); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; c.line(16 + Math.cos(a) * 3, 14 + Math.sin(a) * 3, 16 + Math.cos(a) * 8, 14 + Math.sin(a) * 8, W, 1); } c.ellipse(16, 14, 2.5, 2.5, W); break;
    case "rg_smoke": for (const [x, y, r] of [[8, 24, 4], [24, 24, 4], [11, 18, 6], [21, 17, 7], [16, 11, 6]]) { c.ellipse(x, y, r, r, withA(fg[1], 230)); c.ellipse(x - 1, y - 1, r * 0.65, r * 0.65, withA(fg[2], 220)); c.ellipse(x - 2, y - 2, r * 0.3, r * 0.3, withA(fg[3], 200)); } c.ellipse(16, 14, 1.5, 1.5, W); c.ellipse(16, 17, 1.2, 1.2, W); break;
    case "rg_plague": c.shadedEllipse(16, 12, 8, 8, P.bone); c.rect(11, 17, 10, 6, P.bone[2]); for (const x of [12, 15, 18]) c.rect(x, 22, 2, 3, P.bone[1]); c.ellipse(12.5, 12, 2.2, 2.6, hex("#141018")); c.ellipse(19.5, 12, 2.2, 2.6, hex("#141018")); c.set(12, 11, fg[3]); c.set(19, 11, fg[3]); for (const [x, y] of [[5, 22], [27, 20], [8, 28], [24, 28]]) c.poly([[x, y - 3], [x + 2, y], [x, y + 2], [x - 2, y]], fg[2]); break;
    case "rg_escape": for (let i = 0; i < 4; i++) c.ellipse(26 - i * 6, 22 - i, 5 - i * 0.6, 3.5, withA(fg[2], 220 - i * 55)); c.poly([[17, 5], [24, 5], [24, 17], [29, 21], [29, 26], [17, 26]], fg[3]); c.poly([[17, 5], [19, 5], [19, 26], [17, 26]], fg[1]); c.line(3, 11, 11, 11, withA(fg[3], 160), 1); c.line(2, 16, 12, 16, withA(fg[3], 120), 1); break;
    case "rg_hunter": c.shadedEllipse(16, 14, 8, 8, P.bone); c.rect(11, 19, 10, 5, P.bone[2]); c.ellipse(12.5, 14, 2.2, 2.6, hex("#141018")); c.ellipse(19.5, 14, 2.2, 2.6, hex("#141018")); c.line(4, 28, 28, 4, P.steel[3], 2); c.rect(3, 26, 5, 3, P.wood[3]); c.set(27, 5, W); c.set(12, 13, fg[2]); c.set(19, 13, fg[2]); break;
    case "rg_dance": g(16, 16, 13); for (let a = 0; a < 6.3; a += 0.05) c.set(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, withA(fg[2], 170)); for (const [x, y] of [[7, 22], [25, 9], [8, 8]]) { c.ellipse(x, y, 3, 4, withA(fg[1], 140)); c.line(x - 2, y + 2, x + 2, y - 2, fg[3], 1); } c.line(7, 25, 25, 7, P.steel[3], 2); c.line(7, 7, 25, 25, W, 2); c.shadedEllipse(16, 16, 4, 4, fg); break;
    case "rg_scent": c.poly([[16, 5], [22, 17], [16, 25], [10, 17]], fg[1]); c.ellipse(16, 19, 6.5, 6, fg[2]); c.set(13, 17, W); c.set(14, 16, W); for (const r of [11, 14]) for (let a = -0.9; a < 0.9; a += 0.06) { c.set(16 + Math.cos(a) * r, 18 + Math.sin(a) * r * 0.9, fg[3]); c.set(16 - Math.cos(a) * r, 18 + Math.sin(a) * r * 0.9, fg[3]); } break;
    case "rg_deep": c.poly([[16, 2], [24, 16], [16, 30], [8, 16]], fg[1]); c.poly([[16, 5], [21, 16], [16, 27], [11, 16]], bg[0]); c.poly([[16, 8], [19, 16], [16, 24], [13, 16]], fg[2]); c.line(16, 8, 16, 24, fg[3], 1); for (const y of [12, 16, 20]) { c.line(10, y, 13, y, fg[3], 1); c.line(19, y, 22, y, fg[3], 1); } c.set(15, 13, W); break;
    case "rg_hamstring": c.shadedRect(12, 2, 8, 17, P.skin); c.poly([[11, 19], [21, 19], [22, 26], [27, 28], [27, 30], [9, 30], [9, 22]], bg[2]); c.line(4, 13, 28, 19, W, 2); c.line(4, 14, 28, 20, fg[3], 1); for (const [x, y] of [[17, 22], [14, 25], [21, 24]]) c.ellipse(x, y, 1.4, 1.8, fg[2]); break;
    case "rg_scars": c.shadedEllipse(16, 16, 11, 11, P.skin); c.line(9, 6, 24, 26, P.cloth.red[3], 2); for (let t = 0.15; t < 0.95; t += 0.15) { const x = 9 + 15 * t, y = 6 + 20 * t; c.line(x - 3, y + 2, x + 3, y - 2, fg[3], 1); } break;
    case "rg_taste": c.ellipse(16, 15, 12, 8, bg[0]); c.ellipse(16, 15, 11, 7, P.cloth.red[1]); for (let i = 0; i < 5; i++) { const x = 8 + i * 3.6; c.poly([[x, 9], [x + 3, 9], [x + 1.5, 14]], P.bone[3]); c.poly([[x + 1, 22], [x + 4, 22], [x + 2.5, 17]], P.bone[3]); } c.poly([[16, 23], [19, 28], [16, 31], [13, 28]], fg[2]); break;
    case "rg_cruelty": g(16, 16, 12); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283, r = i % 2 ? 9 : 14; c.line(16, 16, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, i % 2 ? fg[2] : fg[3], 2); } c.shadedEllipse(16, 16, 5, 5, P.cloth.red); c.set(14, 14, W); break;
    case "rg_reap": for (let a = 3.3; a < 5.9; a += 0.04) { const rr = Math.max(0.8, 2.4 - (a - 3.3) * 0.8); c.ellipse(15 + Math.cos(a) * 12, 20 + Math.sin(a) * 12, rr, rr, a > 5 ? W : P.steel[3]); } c.line(8, 29, 22, 12, P.wood[3], 2); for (const [x, y] of [[8, 14], [25, 22], [20, 27]]) c.poly([[x, y - 3], [x + 2, y], [x, y + 2], [x - 2, y]], fg[2]); break;
    case "rg_sweep": for (let k = 0; k < 3; k++) for (let a = -2.7 + k * 0.15; a < -0.4 - k * 0.15; a += 0.03) { const x = 16 + Math.cos(a) * (14 - k * 3), y = 25 + Math.sin(a) * (14 - k * 3); c.set(x, y, k === 2 ? W : k ? fg[3] : fg[2]); c.set(x, y + 1, k === 2 ? fg[3] : fg[1]); } c.line(6, 27, 26, 27, withA(fg[2], 150), 1); break;
    case "rg_gore": for (let i = 0; i < 3; i++) { c.line(7 + i * 7, 3, 13 + i * 7, 28, fg[2], 3); c.line(8 + i * 7, 4, 12 + i * 7, 24, fg[3], 1); c.ellipse(13 + i * 7, 29, 1.4, 1.8, fg[2]); } break;
    case "rg_anemia": c.poly([[16, 3], [25, 18], [23, 25], [16, 29], [9, 25], [7, 18]], fg[2]); c.poly([[16, 7], [22, 18], [20, 24], [16, 26], [12, 24], [10, 18]], bg[0]); c.poly([[10, 20], [22, 20], [20, 24], [16, 26], [12, 24]], fg[1]); c.line(16, 10, 14, 15, fg[3], 1); c.line(14, 15, 17, 19, fg[3], 1); c.poly([[24, 4], [30, 4], [27, 10]], P.cloth.red[3]); break;
    case "rg_fury": g(16, 16, 12); for (let i = 0; i < 3; i++) { const y = 20 - i * 7; c.poly([[16, y - 6], [27, y + 2], [23, y + 3], [16, y - 2], [9, y + 3], [5, y + 2]], fg[1 + i]); } break;
    case "rg_throw": for (let i = 0; i < 3; i++) c.line(2, 10 + i * 6, 11, 10 + i * 6, withA(fg[2], 200 - i * 50), 1); c.line(10, 27, 23, 6, P.wood[3], 3); c.poly([[18, 4], [28, 8], [29, 17], [24, 12], [20, 11]], P.steel[3]); c.poly([[20, 5], [27, 9], [27, 14], [23, 10]], W); break;
    case "rg_habit": c.shadedEllipse(16, 18, 10, 9, P.skin); for (let i = 0; i < 4; i++) c.shadedEllipse(9.5 + i * 4.3, 11, 2.8, 3.2, P.skin); c.rect(8, 25, 16, 5, bg[2]); c.rect(7, 19, 18, 3, P.bone[3]); c.line(7, 20, 25, 20, P.bone[2], 1); c.poly([[22, 3], [25, 8], [22, 10], [19, 8]], fg[2]); break;
    case "rg_carnage": g(16, 18, 12); for (const [x, y, s] of [[16, 12, 1.1], [8, 23, 0.85], [24, 23, 0.85]]) { c.shadedEllipse(x, y, 6 * s, 5.5 * s, P.bone); c.rect(x - 3 * s, y + 4 * s, 6 * s, 3 * s, P.bone[2]); c.ellipse(x - 2.2 * s, y, 1.5 * s, 1.8 * s, hex("#141018")); c.ellipse(x + 2.2 * s, y, 1.5 * s, 1.8 * s, hex("#141018")); c.set(x - 2.2 * s, y, fg[3]); c.set(x + 2.2 * s, y, fg[3]); } break;
    case "rg_defiance": g(16, 16, 12); c.ellipse(11, 12, 6, 6, fg[2]); c.ellipse(21, 12, 6, 6, fg[2]); c.poly([[5, 14], [27, 14], [16, 28]], fg[2]); c.ellipse(11, 12, 4, 4, fg[3]); c.set(9, 10, W); c.line(17, 8, 14, 14, bg[0], 2); c.line(14, 14, 18, 19, bg[0], 2); c.line(18, 19, 15, 24, bg[0], 2); c.poly([[16, 1], [19, 5], [16, 6], [13, 5]], P.magic.fire[3]); break;
    case "rg_massacre": g(16, 16, 13); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; c.poly([[16 + Math.cos(a - 0.35) * 5, 16 + Math.sin(a - 0.35) * 5], [16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12], [16 + Math.cos(a + 0.35) * 5, 16 + Math.sin(a + 0.35) * 5]], i % 2 ? fg[2] : P.steel[3]); } c.poly([[16, 9], [21, 17], [16, 23], [11, 17]], fg[1]); c.ellipse(16, 18, 4.5, 4, fg[2]); c.set(14, 16, W); break;
    // ---- маги: Боевой маг и Чернокнижник (задача 43) ----
    case "mg_bolt": g(16, 16, 13); c.poly([[20, 2], [8, 17], [14, 17], [10, 30], [24, 12], [17, 12], [22, 2]], fg[2]); c.poly([[19, 5], [11, 16], [16, 16], [13, 26], [21, 13], [15, 13]], W); for (const [x, y] of [[6, 8], [26, 22], [5, 24]]) { c.ellipse(x, y, 2, 2, fg[3]); c.set(x, y, W); } c.line(6, 8, 10, 12, fg[2], 1); c.line(26, 22, 22, 19, fg[2], 1); break;
    case "mg_barrier": g(16, 16, 14); for (let a = Math.PI; a <= Math.PI * 2; a += 0.03) { c.set(16 + Math.cos(a) * 13, 25 + Math.sin(a) * 19, fg[3]); c.set(16 + Math.cos(a) * 12, 25 + Math.sin(a) * 18, fg[2]); } c.ellipse(16, 21, 11, 8, withA(fg[1], 110)); c.rect(3, 25, 26, 2, fg[2]); c.poly([[16, 10], [18, 16], [24, 17], [19, 20], [21, 26], [16, 22], [11, 26], [13, 20], [8, 17], [14, 16]], W); break;
    case "mg_firewall": g(16, 18, 14); for (let i = 0; i < 4; i++) { const x = 5 + i * 7, h = 9 + (i % 2 ? 0 : 5) + (i === 1 ? 3 : 0); c.poly([[x - 4, 29], [x - 3, 29 - h * 0.6], [x - 1, 29 - h * 0.5], [x, 29 - h - 4], [x + 2, 29 - h * 0.6], [x + 4, 29 - h * 0.4], [x + 4, 29]], fg[2]); c.poly([[x - 2, 29], [x - 1, 29 - h * 0.5], [x, 29 - h * 0.8], [x + 2, 29 - h * 0.4], [x + 2, 29]], fg[3]); c.poly([[x - 1, 29], [x, 29 - h * 0.4], [x + 1, 29]], W); } c.rect(2, 29, 28, 2, P.stone[1]); break;
    case "mg_storm": g(16, 14, 13); for (const [x, y, r] of [[10, 9, 6], [19, 8, 7], [24, 12, 5], [15, 12, 7]]) c.shadedEllipse(x, y, r, r * 0.75, P.stone); c.poly([[17, 15], [11, 25], [15, 25], [12, 31], [21, 21], [17, 21], [20, 15]], W); c.line(7, 18, 5, 24, fg[2], 1); c.line(25, 17, 23, 23, fg[2], 1); break;
    case "mg_timewarp": g(16, 16, 14); for (let a = 0; a < 6.3; a += 0.03) { c.set(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, fg[3]); c.set(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, fg[2]); } c.ellipse(16, 16, 10, 10, withA(bg[1], 200)); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r = i % 3 ? 9 : 10; c.line(16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, fg[3], 1); } c.line(16, 16, 16, 8, W, 2); c.line(16, 16, 22, 19, W, 2); c.ellipse(16, 16, 1.6, 1.6, fg[3]); c.poly([[26, 3], [30, 8], [23, 8]], fg[3]); break;
    case "mg_ignite": g(16, 17, 13); c.poly([[16, 2], [22, 12], [26, 19], [24, 26], [16, 30], [8, 26], [6, 19], [10, 12], [13, 16]], fg[2]); c.poly([[16, 10], [21, 19], [19, 26], [16, 28], [12, 26], [11, 19]], fg[3]); c.poly([[16, 17], [18, 22], [16, 26], [14, 22]], W); for (const [x, y] of [[5, 8], [27, 6], [28, 15], [4, 16]]) c.ellipse(x, y, 1.3, 1.3, fg[3]); break;
    case "mg_shatter": g(16, 16, 13); c.poly([[16, 3], [26, 13], [22, 29], [10, 29], [6, 13]], fg[2]); c.poly([[16, 6], [22, 13], [19, 26], [13, 26], [10, 13]], fg[3]); c.line(16, 4, 14, 13, bg[0], 2); c.line(14, 13, 18, 19, bg[0], 2); c.line(18, 19, 15, 28, bg[0], 2); c.line(11, 12, 13, 13, W, 1); for (const [x, y] of [[4, 22], [28, 21], [6, 28], [26, 6]]) c.poly([[x, y - 3], [x + 2, y], [x, y + 3], [x - 2, y]], W); break;
    case "mg_conduction": g(16, 16, 13); for (const [x, y] of [[7, 24], [25, 8]]) { c.ellipse(x, y, 6, 6, withA(fg[2], 120)); c.shadedEllipse(x, y, 4, 4, fg); } c.line(10, 21, 15, 17, W, 2); c.line(15, 17, 13, 13, W, 2); c.line(13, 13, 19, 11, W, 2); c.line(19, 11, 22, 9, W, 2); for (const [x, y] of [[16, 26], [14, 5]]) c.ellipse(x, y, 1.5, 1.5, fg[3]); break;
    case "mg_phase": for (let i = 0; i < 3; i++) { const x = 8 + i * 8, a = [110, 180, 255][i], col = i < 2 ? withA(i ? fg[3] : fg[2], a) : W; c.ellipse(x, 9, 3.2, 3.6, col); c.poly([[x - 5, 27], [x - 2, 13], [x + 2, 13], [x + 5, 27]], col); c.rect(x - 1, 8, 1, 1, bg[0]); } for (let a = 0; a < 6.3; a += 0.05) c.set(16 + Math.cos(a) * 14, 29 + Math.sin(a) * 2.5, fg[3]); c.line(2, 15, 6, 15, fg[3], 1); c.line(3, 19, 7, 19, fg[2], 1); break;
    case "mg_rhythm": c.line(16, 8, 8, 23, fg[2], 1); c.line(8, 23, 24, 23, fg[2], 1); c.line(24, 23, 16, 8, fg[2], 1); for (const [x, y, r] of [[16, 8, P.magic.fire], [8, 23, P.magic.blue], [24, 23, P.magic.purple]] as [number, number, Ramp][]) { g(x, y, 7); c.shadedEllipse(x, y, 5, 5, r); c.set(x - 2, y - 2, W); } break;
    case "mg_manaward": c.poly([[16, 3], [27, 7], [25, 21], [16, 29], [7, 21], [5, 7]], fg[2]); c.poly([[16, 6], [24, 9], [22, 20], [16, 26], [10, 20], [8, 9]], bg[1]); c.poly([[16, 9], [21, 17], [16, 24], [11, 17]], fg[3]); c.ellipse(16, 18, 4, 4.5, fg[3]); c.set(14, 15, W); c.set(15, 14, W); c.set(14, 17, W); break;
    case "mg_expl_barrier": g(16, 16, 14); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, r1 = i % 2 ? 12 : 15; c.line(16 + Math.cos(a) * 6, 16 + Math.sin(a) * 6, 16 + Math.cos(a) * r1, 16 + Math.sin(a) * r1, i % 2 ? fg[2] : fg[3], 2); } c.ellipse(16, 16, 7, 7, bg[1]); c.shadedEllipse(16, 16, 5, 5, fg); c.line(12, 12, 20, 20, W, 1); c.line(20, 12, 15, 17, W, 1); break;
    case "mg_escape": for (let a = 0; a < 6.3; a += 0.04) c.set(9 + Math.cos(a) * 6, 24 + Math.sin(a) * 3, fg[3]); for (let i = 0; i < 3; i++) c.line(3, 8 + i * 4, 12 - i * 2, 8 + i * 4, withA(fg[2], 200), 1); c.line(11, 22, 24, 9, fg[2], 4); c.line(11, 22, 24, 9, W, 1); c.poly([[19, 3], [30, 2], [29, 13]], W); break;
    case "mg_hex": g(16, 16, 14); for (let a = 0; a < 6.3; a += 0.03) c.set(16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, fg[2]); for (let i = 0; i < 5; i++) { const a0 = Math.PI / 2 + i * 2.5133, a1 = Math.PI / 2 + (i + 1) * 2.5133; c.line(16 + Math.cos(a0) * 11, 16 + Math.sin(a0) * 11, 16 + Math.cos(a1) * 11, 16 + Math.sin(a1) * 11, fg[3], 1); } c.ellipse(16, 16, 3, 2, W); c.ellipse(16, 16, 1, 1, bg[0]); break;
    case "mg_siphon": g(22, 10, 9); for (let t = 0; t < 1; t += 0.03) { const x = 7 + t * 16 + Math.sin(t * 9) * 3, y = 25 - t * 15 + Math.cos(t * 9) * 2, r = 1.2 + t * 1.8; c.ellipse(x, y, r, r, withA(fg[t > 0.6 ? 3 : 2], 230)); } c.shadedEllipse(23, 9, 6, 6, fg); c.set(21, 7, W); c.shadedEllipse(7, 25, 4, 4, P.bone); c.set(6, 24, hex("#141018")); c.set(9, 24, hex("#141018")); break;
    case "mg_demon": g(16, 16, 13); for (const s of [-1, 1]) c.poly([[16 + s * 5, 10], [16 + s * 12, 3], [16 + s * 13, 12], [16 + s * 9, 14]], P.bone[3]); c.shadedEllipse(16, 18, 9, 9, fg); c.poly([[10, 15], [14, 17], [10, 18]], W); c.poly([[22, 15], [18, 17], [22, 18]], W); c.rect(12, 23, 8, 2, hex("#141018")); c.rect(13, 23, 1, 2, W); c.rect(18, 23, 1, 2, W); break;
    case "mg_detonate": g(16, 16, 14); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r1 = i % 2 ? 12 : 15; c.line(16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 + Math.cos(a) * r1, 16 + Math.sin(a) * r1, i % 2 ? fg[2] : fg[3], 2); } c.shadedEllipse(16, 16, 7, 7, fg); c.line(12, 11, 15, 16, bg[0], 1); c.line(15, 16, 13, 21, bg[0], 1); c.line(15, 16, 21, 15, bg[0], 1); c.set(13, 12, W); break;
    case "mg_meta": g(16, 14, 14); for (const s of [-1, 1]) { c.poly([[16 + s * 3, 12], [16 + s * 15, 2], [16 + s * 13, 10], [16 + s * 15, 16], [16 + s * 10, 15], [16 + s * 9, 20], [16 + s * 5, 18]], fg[1]); c.poly([[16 + s * 4, 13], [16 + s * 13, 5], [16 + s * 11, 11], [16 + s * 8, 15]], fg[2]); } c.poly([[11, 30], [12, 18], [20, 18], [21, 30]], bg[2]); c.shadedEllipse(16, 13, 4.5, 5, fg); c.line(12, 9, 10, 4, P.bone[3], 2); c.line(20, 9, 22, 4, P.bone[3], 2); c.rect(13, 12, 2, 1, W); c.rect(18, 12, 2, 1, W); break;
    case "mg_malice": g(16, 16, 13); c.shadedEllipse(16, 15, 11, 10, bg); c.poly([[7, 10], [14, 13], [8, 15]], fg[3]); c.poly([[25, 10], [18, 13], [24, 15]], fg[3]); for (let x = 8; x <= 24; x++) c.set(x, 20 + Math.round(Math.sin(((x - 8) / 16) * Math.PI) * 4), W); for (const x of [11, 14, 17, 20]) c.line(x, 21, x, 23, W, 1); break;
    case "mg_web": g(16, 16, 13); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.line(16, 16, 16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, fg[2], 1); } for (const r of [4, 8, 12]) for (let i = 0; i < 8; i++) { const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2; c.line(16 + Math.cos(a0) * r, 16 + Math.sin(a0) * r, 16 + Math.cos(a1) * r, 16 + Math.sin(a1) * r, fg[3], 1); } c.ellipse(25, 7, 2.5, 2.5, hex("#141018")); c.set(24, 6, W); break;
    case "mg_oppress": g(16, 18, 13); c.poly([[8, 3], [24, 3], [27, 14], [5, 14]], fg[1]); c.poly([[10, 5], [22, 5], [24, 12], [8, 12]], fg[2]); c.rect(13, 7, 6, 2, W); c.poly([[16, 30], [9, 22], [14, 22], [14, 17], [18, 17], [18, 22], [23, 22]], W); break;
    case "mg_leech": g(16, 17, 13); c.poly([[13, 4], [19, 4], [19, 12], [26, 26], [24, 29], [8, 29], [6, 26], [13, 12]], withA(P.bone[3], 200)); c.poly([[12, 20], [20, 20], [24, 27], [8, 27]], fg[2]); c.poly([[12, 20], [20, 20], [21, 22], [11, 22]], fg[3]); c.rect(12, 2, 8, 2, P.wood[3]); for (const [x, y] of [[16, 15], [14, 11]]) c.ellipse(x, y, 1.2, 1.2, fg[3]); c.poly([[13, 25], [14, 28], [15, 25]], W); c.poly([[17, 25], [18, 28], [19, 25]], W); break;
    case "mg_life_tap": g(16, 16, 13); c.poly([[16, 28], [4, 14], [4, 9], [8, 5], [13, 6], [16, 9], [19, 6], [24, 5], [28, 9], [28, 14]], fg[1]); c.poly([[16, 25], [7, 14], [7, 10], [10, 8], [14, 9], [16, 12], [18, 9], [22, 8], [25, 10], [25, 14]], fg[2]); c.set(10, 11, W); c.set(11, 10, W); c.line(29, 29, 19, 17, P.magic.purple[3], 2); c.poly([[8, 25], [10, 30], [6, 30]], fg[3]); break;
    case "mg_demonology": g(16, 16, 13); c.shadedRect(5, 4, 22, 24, P.cloth.purple); c.rect(5, 4, 3, 24, bg[0]); for (let a = 0; a < 6.3; a += 0.05) c.set(17 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, fg[3]); for (let i = 0; i < 5; i++) { const a0 = -Math.PI / 2 + i * 2.5133, a1 = -Math.PI / 2 + (i + 1) * 2.5133; c.line(17 + Math.cos(a0) * 7, 16 + Math.sin(a0) * 7, 17 + Math.cos(a1) * 7, 16 + Math.sin(a1) * 7, W, 1); } break;
    case "mg_pandemic": g(16, 16, 13); c.shadedEllipse(13, 14, 8, 8, P.bone); c.rect(9, 20, 8, 5, P.bone[2]); c.rect(9, 12, 3, 3, hex("#141018")); c.rect(15, 12, 3, 3, hex("#141018")); c.rect(11, 22, 1, 3, hex("#141018")); c.rect(14, 22, 1, 3, hex("#141018")); for (const [x, y, r] of [[26, 7, 3], [27, 20, 2.5], [22, 28, 2]]) { c.ellipse(x, y, r, r, withA(fg[2], 220)); c.set(x - 1, y - 1, W); } c.line(20, 11, 24, 8, fg[2], 1); c.line(21, 18, 25, 19, fg[2], 1); break;
    case "mg_shroud": g(16, 16, 13); c.poly([[16, 2], [25, 9], [28, 30], [4, 30], [7, 9]], bg[2]); c.ellipse(16, 12, 5, 6, hex("#0c0810")); c.rect(13, 11, 2, 2, W); c.rect(18, 11, 2, 2, W); c.line(16, 18, 16, 29, fg[3], 1); for (let i = 0; i < 3; i++) c.line(10, 21 + i * 3, 22, 21 + i * 3, fg[3], 1); break;
    case "mg_shards": g(16, 16, 13); c.shadedEllipse(16, 16, 6, 6, fg); c.set(14, 14, W); for (let i = 0; i < 5; i++) { const a = -1.57 + i * 1.2566, x = 16 + Math.cos(a) * 11, y = 16 + Math.sin(a) * 11; c.poly([[x, y - 3], [x + 2, y], [x, y + 3], [x - 2, y]], i % 2 ? fg[3] : W); } break;
    case "mg_eternal": g(16, 16, 13); for (let t = 0; t < 6.3; t += 0.04) { const d = 1 + Math.sin(t) ** 2, x = 16 + (12 * Math.cos(t)) / d, y = 19 + (12 * Math.sin(t) * Math.cos(t)) / d; c.ellipse(x, y, 1.5, 1.5, fg[t > 3.1 ? 3 : 2]); } c.poly([[16, 3], [19, 8], [16, 11], [13, 8]], fg[3]); c.poly([[16, 5], [17, 8], [16, 10], [15, 8]], W); break;
    case "mg_soul_ward": g(16, 16, 13); c.poly([[16, 3], [27, 7], [25, 21], [16, 29], [7, 21], [5, 7]], fg[1]); c.poly([[16, 5], [24, 9], [22, 20], [16, 26], [10, 20], [8, 9]], bg[1]); c.poly([[16, 8], [21, 12], [21, 22], [19, 20], [16, 23], [13, 20], [11, 22], [11, 12]], withA(P.bone[3], 235)); c.rect(13, 13, 2, 3, hex("#141018")); c.rect(17, 13, 2, 3, hex("#141018")); c.ellipse(16, 18, 1.5, 1.5, fg[3]); break;
  }
  return c;
}

export const ITEM_ICONS = ["sword", "axe", "staff", "bow", "helmet", "armor", "boots", "ring", "amulet", "potion_red", "potion_blue", "gold", "coin", ...Object.keys(FOOD).map((id) => `food_${id}`), "mat_ash_ore", "mat_star_dust", ...RESOURCE_IDS.map((id) => `res_${id}`)];
const R = P.cloth.red, B = P.cloth.blue, Pu = P.cloth.purple, G = P.cloth.green, Br = P.cloth.brown;
export const SKILL_ICONS: Record<string, [string, Ramp, Ramp]> = {
  sk_taunt: ["taunt", R, P.gold], sk_shieldblock: ["shieldblock", B, P.steel], sk_quake: ["quake", Br, P.gold], sk_unbending: ["unbending", P.cloth.black, P.steel], sk_laststand: ["laststand", R, P.gold],
  sk_cleave: ["cleave", R, P.steel], sk_charge: ["charge", Br, P.gold], sk_toughness: ["toughness", Br, P.steel], sk_warcry: ["warcry", R, P.gold],
  sk_bloodlust: ["bloodlust", P.cloth.black, P.cloth.red], sk_whirlwind: ["whirlwind", R, P.steel], sk_berserk: ["berserk", P.cloth.black, P.magic.fire],
  sk_fireball: ["fireball", Pu, P.magic.fire], sk_frostnova: ["frostnova", B, P.magic.blue], sk_wisdom: ["wisdom", Pu, P.gold], sk_blink: ["blink", Pu, P.magic.purple],
  sk_focus: ["focus", B, P.magic.purple], sk_meteor: ["meteor", P.cloth.black, P.magic.fire], sk_shield: ["shield", B, P.magic.blue],
  sk_aimed: ["aimed", G, P.magic.fire], sk_volley: ["volley", G, P.gold], sk_precision: ["precision", Br, P.magic.fire], sk_roll: ["roll", G, P.magic.green],
  sk_heal: ["heal", G, P.gold], sk_circle: ["circle", B, P.gold], sk_grace: ["grace", B, P.gold], sk_renew: ["renew", G, P.magic.green],
  sk_smite: ["smite", P.cloth.black, P.gold], sk_resurrect: ["resurrect", B, P.gold], sk_holyshield: ["holyshield", B, P.gold], sk_insight: ["insight", Pu, P.gold],
  sk_backstab: ["backstab", P.cloth.black, P.steel], sk_venom: ["venom", G, P.magic.green], sk_deadly: ["deadly", P.cloth.black, P.magic.fire],
  sk_shadowstep: ["shadowstep", Pu, P.magic.purple], sk_evasion: ["evasion", P.cloth.black, P.steel], sk_poisoner: ["poisoner", G, P.magic.green], sk_stealth: ["stealth", P.cloth.black, P.magic.purple],
  sk_quickhands: ["quickhands", Br, P.gold], sk_rain: ["rain", G, P.steel], sk_hunter: ["hunter", P.cloth.black, P.magic.green],
};
export function buildItemIcon(k: string) {
  return itemIcon(k);
}
// иконки умений из data/skills.json (классы Умбрата): рисунок + палитры по именам
const ICON_RAMP: Record<string, Ramp> = {
  black: P.cloth.black, purple: P.cloth.purple, red: P.cloth.red, green: P.magic.green, blue: P.magic.blue, frost: P.ice, bone: P.bone, gold: P.gold, steel: P.steel, fire: P.magic.fire, brown: P.cloth.brown,
};
for (const [id, ic] of Object.entries(DATA_SKILL_ICONS)) {
  const bg = ic.bg === "green" ? P.cloth.green : ic.bg === "red" ? P.cloth.red : ICON_RAMP[ic.bg] ?? P.cloth.black;
  const fg = ic.fg === "red" ? ramp("#5a0a14", "#a01828", "#e0304a", "#ff8a8a", "#ffd0d0") : ic.fg === "purple" ? P.magic.purple : ICON_RAMP[ic.fg] ?? P.magic.purple;
  SKILL_ICONS[id] = [ic.glyph, bg, fg];
}
export function buildSkillIcon(id: string) {
  const [k, bg, fg] = SKILL_ICONS[id];
  return skillIcon(k, bg, fg);
}

// ---------------- эффекты ----------------
function orb(r: number, cols: Ramp): PC {
  const s = Math.ceil(r * 2 + 4);
  const c = new PC(s, s);
  c.ellipse(s / 2, s / 2, r + 1.5, r + 1.5, withA(cols[2], 90));
  c.shadedEllipse(s / 2, s / 2, r, r, cols);
  c.set(s / 2 - 1, s / 2 - 1, hex("#ffffff"));
  return c;
}
function soft(r: number, col: RGBA): PC {
  const s = r * 2;
  const c = new PC(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
    if (d < 1) c.set(x, y, withA(col, Math.round(255 * (1 - d) * (1 - d))));
  }
  return c;
}
export const FX_ART: Record<string, () => PC> = {
  arrow: () => { const c = new PC(16, 6); c.line(1, 3, 12, 3, P.wood[3], 1); c.poly([[11, 1], [15, 3], [11, 5]], P.steel[3]); c.line(0, 1, 3, 3, hex("#e8e4d8"), 1); c.line(0, 5, 3, 3, hex("#e8e4d8"), 1); return c; },
  arcane: () => orb(4, P.magic.purple),
  fireball: () => orb(5, P.magic.fire),
  holy: () => orb(4, P.gold),
  fire: () => orb(4, P.magic.fire),
  poison: () => orb(4, P.magic.green),
  shadow: () => orb(4, [hex("#1a0a2a"), hex("#3a1a5a"), hex("#6a3a9a"), hex("#a080d0"), hex("#ffffff")]),
  frost: () => orb(4, P.magic.blue),
  spark: () => soft(4, hex("#ffffff")),
  glow: () => soft(16, hex("#ffffff")),
  smoke: () => soft(6, hex("#b0a8a0")),
  ember: () => { const c = new PC(3, 3); c.rect(0, 0, 3, 3, P.magic.fire[3]); c.set(1, 1, P.magic.fire[4]); return c; },
  leaf: () => { const c = new PC(5, 4); c.ellipse(2.5, 2, 2.5, 1.6, P.leaf[3]); c.set(1, 1, P.leaf[4]); return c; },
  shard: () => { const c = new PC(6, 6); c.poly([[3, 0], [6, 3], [3, 6], [0, 3]], P.magic.blue[3]); c.set(3, 2, hex("#ffffff")); return c; },
  bubble: () => { const c = new PC(5, 5); c.ellipse(2.5, 2.5, 2.5, 2.5, withA(P.magic.green[3], 200)); c.set(1, 1, hex("#ffffff")); return c; },
  shadow_blob: () => { const c = new PC(32, 12); c.ellipse(16, 6, 13, 5, withA(hex("#000000"), 70)); c.ellipse(16, 6, 9, 3.5, withA(hex("#000000"), 40)); return c; },
  slash: () => {
    const c = new PC(64, 64);
    for (let a = -1.2; a <= 1.2; a += 0.01) {
      const t = 1 - Math.abs(a) / 1.2;
      for (let r = 20; r < 20 + 9 * t; r++) c.set(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, withA(hex("#ffffff"), Math.round(80 + 175 * t * ((r - 20) / (9 * t + 0.01)))));
    }
    return c;
  },
  ring: () => { const c = new PC(64, 64); for (let a = 0; a < 6.3; a += 0.01) for (let r = 28; r < 31; r++) c.set(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, withA(hex("#ffffff"), r === 29 ? 255 : 140)); return c; },
  target: () => { const c = new PC(40, 16); for (let a = 0; a < 6.3; a += 0.02) { if (Math.floor(a * 3) % 2) continue; c.set(20 + Math.cos(a) * 18, 8 + Math.sin(a) * 6.5, hex("#ffd040")); c.set(20 + Math.cos(a) * 17, 8 + Math.sin(a) * 6, withA(hex("#ffd040"), 120)); } return c; },
};

// ---------------- иконки умений лучников (задача 42): glyph с префиксом ar_, см. data/skills_archers.json ----------------
function archerGlyph(kind: string, bg: Ramp, fg: Ramp): PC {
  const c = iconFrame(bg);
  const W = fg[4] ?? fg[3];
  const dark = hex("#141018");
  const glow = (x: number, y: number, r: number) => c.ellipse(x, y, r, r, withA(fg[3], 90));
  /** Стрела от (x0,y0) к (x1,y1): древко, наконечник у конца, оперение у начала. */
  const arrow = (x0: number, y0: number, x1: number, y1: number, head: RGBA = P.steel[3]) => {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    c.line(x0, y0, x1, y1, P.wood[3], 1);
    c.poly([[x1 + ux * 3.5, y1 + uy * 3.5], [x1 - ux * 2 + nx * 2.8, y1 - uy * 2 + ny * 2.8], [x1 - ux * 2 - nx * 2.8, y1 - uy * 2 - ny * 2.8]], head);
    c.line(x0, y0, x0 + ux * 3 + nx * 2.5, y0 + uy * 3 + ny * 2.5, P.bone[3], 1);
    c.line(x0, y0, x0 + ux * 3 - nx * 2.5, y0 + uy * 3 - ny * 2.5, P.bone[3], 1);
  };
  /** Ворон: тело, крылья, клюв. s — масштаб, f — направление (1 вправо, −1 влево). */
  const bird = (x: number, y: number, s: number, f: number, col: Ramp) => {
    c.poly([[x, y], [x - 5 * s, y - 6 * s], [x - 9 * s, y - 2 * s], [x - 4 * s, y + 1 * s]], col[1]);
    c.poly([[x, y], [x + 5 * s, y - 6 * s], [x + 9 * s, y - 2 * s], [x + 4 * s, y + 1 * s]], col[2]);
    c.shadedEllipse(x, y + 1 * s, 2.6 * s, 3.2 * s, col);
    c.poly([[x + f * 2 * s, y - 1 * s], [x + f * 5 * s, y], [x + f * 2 * s, y + 1.2 * s]], P.gold[3]);
    c.set(x + f * 1 * s, y - 1 * s, W);
  };
  switch (kind) {
    // ---- Егерь ----
    case "ar_steady": {
      c.line(3, 27, 29, 27, fg[1], 2); c.line(7, 30, 25, 30, fg[2], 1);
      c.poly([[10, 22], [22, 22], [16, 27]], fg[2]);
      const pts: [number, number][] = [];
      for (let a = -1.15; a <= 1.15; a += 0.07) pts.push([11 + Math.cos(a) * 9, 14 + Math.sin(a) * 11]);
      for (const [x, y] of pts) c.ellipse(x, y, 1.3, 1.3, P.wood[3]);
      const top = pts[0], bot = pts[pts.length - 1];
      c.line(top[0], top[1], 7, 14, W, 1); c.line(bot[0], bot[1], 7, 14, W, 1);
      arrow(7, 14, 29, 14, W);
      break;
    }
    case "ar_longshot": {
      for (let t = 0; t <= 1; t += 0.07) { const x = 6 + 15 * t, y = 24 - 18 * t - 12 * Math.sin(t * Math.PI) * 0.5; c.set(x, y, W); c.set(x + 1, y, fg[3]); }
      glow(25, 8, 8);
      for (const [r, col] of [[6, fg[2]], [4, bg[1]], [2.4, fg[2]]] as [number, RGBA][]) c.ellipse(25, 8, r, r, col);
      c.ellipse(25, 8, 1, 1, W);
      arrow(3, 28, 13, 19, W);
      break;
    }
    case "ar_trap": {
      c.line(16, 26, 22, 30, fg[3], 1); c.line(22, 30, 28, 29, fg[2], 1);
      c.ellipse(16, 17, 13, 10, fg[1]); c.ellipse(16, 17, 12, 9, fg[2]); c.ellipse(16, 17, 10, 7, bg[1]);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.poly([[16 + Math.cos(a - 0.2) * 10, 17 + Math.sin(a - 0.2) * 7], [16 + Math.cos(a + 0.2) * 10, 17 + Math.sin(a + 0.2) * 7], [16 + Math.cos(a) * 4.5, 17 + Math.sin(a) * 3.2]], W);
      }
      c.ellipse(16, 17, 2.6, 1.9, P.gold[3]); c.set(15, 16, P.gold[4]);
      break;
    }
    case "ar_mark": {
      glow(16, 19, 13);
      c.ellipse(16, 19, 10, 10, fg[2]); c.ellipse(16, 19, 8, 8, bg[1]);
      c.line(16, 11, 16, 27, fg[3], 1); c.line(8, 19, 24, 19, fg[3], 1);
      c.ellipse(16, 19, 2, 2, W);
      c.poly([[9, 2], [23, 2], [16, 11]], fg[2]); c.poly([[12, 3], [20, 3], [16, 8]], W);
      break;
    }
    case "ar_pierce": {
      for (const x of [9, 16, 23]) { c.ellipse(x, 16, 5, 7, P.bone[2]); c.ellipse(x, 16, 3, 5, bg[1]); }
      for (let i = 0; i < 4; i++) c.line(26, 13 + i * 2, 31, 12 + i * 3, fg[3], 1);
      arrow(1, 16, 28, 16, W);
      c.line(1, 14, 8, 14, withA(fg[3], 140), 1); c.line(1, 18, 8, 18, withA(fg[3], 140), 1);
      break;
    }
    case "ar_beast": {
      glow(16, 17, 14);
      c.shadedEllipse(16, 21, 7.5, 6, fg);
      for (const [x, y, rx, ry] of [[7, 14, 2.8, 3.6], [12.5, 8.5, 2.8, 3.8], [19.5, 8.5, 2.8, 3.8], [25, 14, 2.8, 3.6]] as number[][]) c.shadedEllipse(x, y, rx, ry, fg);
      c.set(14, 19, W);
      break;
    }
    case "ar_barrage": {
      for (const [x, y] of [[3, 17], [5, 24], [11, 28]]) arrow(x, y, x + 19, y - 9, W);
      for (const [x, y] of [[0, 14], [1, 21], [7, 26]]) c.line(x, y, x + 6, y - 3, withA(fg[3], 150), 1);
      for (const [x, y] of [[26, 6], [28, 14], [30, 20]]) { c.ellipse(x, y, 1.5, 1.5, fg[3]); c.set(x, y, W); }
      break;
    }
    case "ar_trapper": {
      glow(16, 16, 13);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.poly([[16 + Math.cos(a - 0.22) * 8, 16 + Math.sin(a - 0.22) * 8], [16 + Math.cos(a - 0.16) * 12, 16 + Math.sin(a - 0.16) * 12], [16 + Math.cos(a + 0.16) * 12, 16 + Math.sin(a + 0.16) * 12], [16 + Math.cos(a + 0.22) * 8, 16 + Math.sin(a + 0.22) * 8]], fg[2]); }
      c.shadedEllipse(16, 16, 9, 9, fg); c.ellipse(16, 16, 4, 4, bg[1]); c.ellipse(16, 16, 1.5, 1.5, W);
      c.line(4, 28, 12, 21, P.steel[3], 2);
      break;
    }
    case "ar_ricochet": {
      c.rect(3, 26, 26, 3, P.steel[2]); c.rect(3, 26, 26, 1, P.steel[4]);
      c.line(4, 5, 16, 24, P.wood[3], 1); c.line(4, 5, 7, 8, P.bone[3], 1); c.line(4, 5, 8, 4, P.bone[3], 1);
      arrow(16, 24, 28, 8, W);
      c.ellipse(16, 25, 4, 3, withA(fg[3], 150));
      for (const [x, y] of [[11, 24], [21, 25], [16, 20]]) c.set(x, y, W);
      break;
    }
    case "ar_trickroll": {
      for (let a = 0.6; a < 5.2; a += 0.05) c.ellipse(13 + Math.cos(a) * 8, 13 + Math.sin(a) * 8, 1.3, 1.3, a > 4.4 ? W : fg[2]);
      c.poly([[19, 3], [26, 8], [18, 11]], W);
      c.poly([[18, 29], [20, 22], [24, 19], [28, 23], [29, 29]], P.steel[2]);
      for (const x of [21, 24, 27]) c.poly([[x, 24], [x + 1, 21], [x + 2, 24]], P.steel[4]);
      break;
    }
    case "ar_hamstring": {
      c.poly([[12, 2], [20, 2], [20, 17], [27, 22], [28, 29], [9, 29], [9, 22], [12, 17]], P.leather[2]);
      c.poly([[13, 3], [17, 3], [17, 17], [13, 20]], P.leather[3]);
      c.rect(9, 26, 19, 3, P.leather[0]);
      arrow(1, 18, 29, 15, W);
      c.ellipse(15, 21, 1.5, 2.2, P.cloth.red[3]); c.ellipse(17, 25, 1.2, 1.8, P.cloth.red[2]);
      break;
    }
    case "ar_bond": {
      c.poly([[6, 3], [13, 11], [5, 15]], P.steel[2]); c.poly([[26, 3], [19, 11], [27, 15]], P.steel[2]);
      c.poly([[8, 6], [12, 11], [8, 13]], P.cloth.red[2]); c.poly([[24, 6], [20, 11], [24, 13]], P.cloth.red[2]);
      c.shadedEllipse(16, 16, 10, 9, P.steel);
      c.poly([[10, 20], [16, 28], [22, 20], [16, 23]], P.steel[3]);
      c.ellipse(11.5, 14, 2.2, 1.6, fg[3]); c.ellipse(20.5, 14, 2.2, 1.6, fg[3]); c.set(11, 14, W); c.set(20, 14, W);
      c.ellipse(16, 21, 2, 1.6, dark);
      for (const x of [10, 22]) { c.ellipse(x, 28, 3, 2, fg[2]); c.ellipse(x, 28, 1.6, 1, bg[1]); }
      c.line(12, 28, 20, 28, fg[3], 1);
      break;
    }
    case "ar_prey": {
      c.shadedEllipse(16, 21, 7.5, 6.5, P.bone);
      c.rect(11, 24, 10, 5, P.bone[2]); for (const x of [13, 16, 19]) c.rect(x, 26, 1, 3, dark);
      c.ellipse(12.5, 20, 2.2, 2.4, dark); c.ellipse(19.5, 20, 2.2, 2.4, dark); c.poly([[15, 23], [17, 23], [16, 25]], dark);
      for (const s of [-1, 1]) {
        c.line(16 + s * 5, 16, 16 + s * 10, 8, fg[3], 2); c.line(16 + s * 10, 8, 16 + s * 9, 2, fg[3], 2);
        c.line(16 + s * 8, 11, 16 + s * 13, 10, fg[3], 2); c.line(16 + s * 10, 6, 16 + s * 14, 4, fg[2], 1);
      }
      break;
    }
    // ---- Тёмный следопыт ----
    case "ar_detonate": {
      glow(18, 15, 13);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 8 : 13; c.line(18, 15, 18 + Math.cos(a) * r, 15 + Math.sin(a) * r, i % 2 ? fg[3] : fg[2], 3); }
      c.shadedEllipse(18, 15, 6, 6, fg); c.ellipse(16, 13, 2, 2, W);
      arrow(2, 29, 12, 21, W);
      break;
    }
    case "ar_hexswarm": {
      for (const [x, y] of [[6, 6], [16, 3], [26, 6]]) {
        arrow(16, 29, x, y + 4, P.steel[3]);
        c.shadedEllipse(x, y, 3.4, 3.4, fg); c.set(x - 1, y - 1, W);
      }
      c.ellipse(16, 29, 3, 1.5, withA(fg[2], 180));
      break;
    }
    case "ar_snare": {
      c.ellipse(16, 27, 12, 3.5, bg[0]); c.ellipse(16, 27, 9, 2.4, fg[1]);
      for (const [x1, y1] of [[5, 22], [27, 22], [3, 28], [29, 28], [9, 31], [23, 31]]) c.line(16, 27, x1, y1, fg[2], 1);
      arrow(16, 2, 16, 24, fg[3]);
      c.ellipse(16, 27, 2, 1.2, W);
      for (const y of [10, 14, 18]) c.line(12, y, 20, y, withA(fg[3], 120), 1);
      break;
    }
    case "ar_veil": {
      for (const [x, y, rx, ry, a, col] of [[9, 21, 8, 5, 210, fg[1]], [22, 20, 9, 6, 210, fg[2]], [15, 14, 9, 7, 235, fg[1]], [24, 11, 6, 4, 190, fg[2]], [8, 11, 5, 3.5, 190, fg[2]]] as [number, number, number, number, number, RGBA][]) c.ellipse(x, y, rx, ry, withA(col, a));
      c.ellipse(12.5, 14, 2, 1.4, W); c.ellipse(19.5, 14, 2, 1.4, W);
      c.set(12, 14, dark); c.set(20, 14, dark);
      for (const [x0, y0, x1, y1] of [[4, 27, 12, 24], [20, 27, 29, 24], [10, 29, 24, 28]]) c.line(x0, y0, x1, y1, withA(fg[3], 130), 1);
      break;
    }
    case "ar_ravens": {
      bird(10, 10, 0.9, 1, fg); bird(23, 14, 1.15, -1, fg); bird(14, 24, 1.3, 1, fg);
      for (const [x, y] of [[27, 5], [4, 20], [28, 26]]) c.set(x, y, W);
      break;
    }
    case "ar_malice": {
      glow(16, 16, 13);
      c.poly([[2, 16], [10, 9], [22, 9], [30, 16], [22, 23], [10, 23]], fg[1]);
      c.poly([[5, 16], [11, 11], [21, 11], [27, 16], [21, 21], [11, 21]], fg[2]);
      c.ellipse(16, 16, 5.5, 5.5, fg[3]); c.rect(15, 11, 2, 10, dark);
      c.set(13, 14, W);
      c.line(3, 6, 15, 11, dark, 3); c.line(29, 6, 17, 11, dark, 3);
      break;
    }
    case "ar_cursepower": {
      glow(16, 16, 14);
      for (let a = 0; a < 6.3; a += 0.04) c.set(16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, fg[2]);
      const pt = (i: number): [number, number] => [16 + Math.cos(-Math.PI / 2 + (i * Math.PI * 2) / 5) * 12, 16 + Math.sin(-Math.PI / 2 + (i * Math.PI * 2) / 5) * 12];
      for (let i = 0; i < 5; i++) { const a = pt(i), b = pt((i + 2) % 5); c.line(a[0], a[1], b[0], b[1], fg[3], 1); }
      c.shadedEllipse(16, 16, 3, 3, fg); c.set(15, 15, W);
      break;
    }
    case "ar_blight": {
      arrow(3, 27, 21, 9, fg[3]);
      for (const [x, y, r] of [[24, 14, 3.4], [27, 21, 2.4], [20, 20, 2.8]] as number[][]) { c.poly([[x, y - r - 3], [x + r, y + 1], [x - r, y + 1]], fg[2]); c.shadedEllipse(x, y + 1, r, r, fg); }
      for (const [x, y] of [[9, 8], [14, 5], [6, 14]]) { c.ellipse(x, y, 2, 2, withA(fg[3], 200)); c.set(x - 1, y - 1, W); }
      break;
    }
    case "ar_backline": {
      c.poly([[3, 14], [15, 14], [15, 24], [9, 30], [3, 24]], P.steel[2]);
      c.poly([[5, 16], [13, 16], [13, 23], [9, 27], [5, 23]], P.steel[3]);
      c.rect(8, 16, 2, 11, P.steel[1]); c.rect(5, 19, 8, 2, P.steel[1]);
      let px = 7, py = 11;
      for (let t = 0.05; t <= 1; t += 0.05) { const x = 7 + 20 * t, y = 11 - 4 * Math.sin(t * Math.PI) * 2 + 12 * t * t; c.line(px, py, x, y, P.wood[3], 1); px = x; py = y; }
      c.poly([[px + 3, py + 3], [px - 4, py - 1], [px + 1, py - 4]], W);
      c.ellipse(26, 25, 3, 3, fg[2]); c.ellipse(26, 25, 1.4, 1.4, bg[1]);
      break;
    }
    case "ar_ravenbond": {
      glow(14, 15, 13);
      c.poly([[2, 8], [8, 4], [10, 14], [4, 18]], fg[1]);
      c.shadedEllipse(14, 15, 9, 8, fg);
      c.poly([[20, 12], [30, 16], [20, 20]], P.gold[3]); c.line(20, 16, 29, 16, P.gold[1], 1);
      c.ellipse(16, 12, 2.2, 2.2, W); c.set(17, 12, dark);
      c.poly([[8, 22], [20, 22], [14, 30]], fg[1]);
      for (const x of [10, 14, 18]) c.line(x, 22, x - 1, 27, fg[3], 1);
      break;
    }
    case "ar_soulfeast": {
      c.poly([[5, 17], [27, 17], [23, 25], [9, 25]], P.steel[2]); c.rect(5, 17, 22, 2, P.steel[4]);
      c.rect(14, 25, 4, 3, P.steel[1]); c.rect(9, 28, 14, 2, P.steel[2]);
      c.ellipse(16, 18, 9, 2, fg[2]);
      for (const [x, y] of [[10, 9], [16, 5], [22, 10]]) {
        c.ellipse(x, y, 2.2, 3.2, fg[3]); c.set(x - 1, y - 1, W);
        c.line(x, y + 3, x + (x < 16 ? 2 : x > 16 ? -2 : 0), 17, withA(fg[2], 170), 1);
      }
      break;
    }
    case "ar_ambush": {
      c.poly([[16, 2], [26, 10], [28, 29], [4, 29], [6, 10]], bg[3] ?? bg[2]);
      c.poly([[16, 5], [23, 11], [24, 28], [8, 28], [9, 11]], bg[1]);
      c.shadedEllipse(16, 17, 6.5, 8, P.cloth.black);
      c.ellipse(16, 17, 5, 7, dark);
      for (const x of [13, 19]) { c.ellipse(x, 16, 2, 1.4, fg[3]); c.set(x, 16, W); }
      c.line(6, 10, 16, 2, fg[2], 1); c.line(26, 10, 16, 2, fg[2], 1);
      arrow(26, 30, 29, 24, fg[3]);
      break;
    }
    case "ar_verdict": {
      c.shadedEllipse(16, 10, 7, 6.5, P.bone);
      c.ellipse(12.5, 9, 2, 2.2, dark); c.ellipse(19.5, 9, 2, 2.2, dark); c.poly([[15, 12], [17, 12], [16, 14]], dark);
      c.rect(12, 15, 8, 3, P.bone[2]); for (const x of [14, 16, 18]) c.rect(x, 16, 1, 2, dark);
      c.rect(3, 22, 26, 7, dark); c.rect(4, 23, 24, 5, bg[1]);
      c.rect(4, 23, 6, 5, fg[3]); c.rect(4, 23, 6, 1, W);
      c.rect(11, 20, 1, 11, W);
      c.line(18, 24, 26, 27, fg[2], 1);
      break;
    }
    case "ar_contagion": {
      const nodes: [number, number, number][] = [[6, 24, 4.2], [15, 15, 3.4], [25, 22, 3.4], [25, 8, 3]];
      for (const [a, b] of [[0, 1], [1, 2], [1, 3]]) c.line(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], fg[2], 2);
      c.shadedEllipse(nodes[0][0], nodes[0][1], 4.2, 4.2, P.bone); c.set(5, 23, dark); c.set(8, 23, dark);
      for (const [x, y, r] of nodes.slice(1)) { glow(x, y, r + 3); c.shadedEllipse(x, y, r, r, fg); c.set(x - 1, y - 1, W); }
      for (const [x, y] of [[10, 18], [20, 18], [21, 12]]) c.ellipse(x, y, 1.2, 1.2, fg[3]);
      break;
    }
    case "ar_shadowmastery": {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const inA = Math.hypot(x - 14, y - 14) < 11.5, inB = Math.hypot(x - 20, y - 11) < 9.5;
        if (inA && !inB) c.set(x, y, Math.hypot(x - 11, y - 12) < 6 ? fg[3] : fg[2]);
      }
      arrow(4, 29, 24, 9, P.steel[3]);
      for (const [x, y] of [[26, 24], [28, 6], [22, 28]]) c.set(x, y, W);
      break;
    }
    case "ar_lastshadow": {
      c.shadedEllipse(16, 7, 4.5, 4.8, P.cloth.black);
      for (let y = 12; y < 31; y++) {
        const a = Math.max(0, 230 - (y - 12) * 13), w = 7 + (y - 12) * 0.3;
        c.rect(Math.round(16 - w), y, Math.round(w * 2), 1, withA(y < 18 ? fg[1] : fg[2], a));
      }
      for (const [x, y] of [[7, 20], [25, 24], [11, 28], [21, 16], [18, 29], [5, 27]]) c.set(x, y, withA(fg[3], 200));
      c.ellipse(14.5, 7, 1.2, 0.9, fg[3]); c.ellipse(18, 7, 1.2, 0.9, fg[3]);
      c.set(6, 14, W); c.set(27, 12, W);
      break;
    }
    default:
      c.ellipse(16, 16, 8, 8, fg[2]);
  }
  return c;
}
