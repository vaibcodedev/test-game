/** Иконки экипировки 32×32: тип × класс (шлем/доспех/сапоги) × редкость, уникальные; легендарные 48×48 и модели каталога (equip-models.ts). */
import { PC, hex, mix, ramp, withA, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { LEGENDARIES, type LegendaryDef } from "../../shared/legendary";
import { BASE_ITEMS, ICON_VARIANT_SLOTS, ICON_VARIANTS, ITEM_PALETTES, UNIQUES, iconId, type ModelLook, type Rarity } from "../../shared/items";
import { BASE_SHAPE, ICON, buildAllModelIcons, buildBaseIcons, crestAt, drawModel, MODEL_CATS } from "./equip-models";

const GEM: Ramp[] = [P.magic.green, P.magic.blue, P.magic.purple];
const GLOW: RGBA[] = [hex("#ffffff"), hex("#7ab8ff"), hex("#c47bff")];
const TRIM: Ramp[] = [P.steel, P.gold, P.gold];

type V = "warrior" | "mage" | "ranger" | "healer";

function draw(kind: string, v: V, r: number): PC {
  const c = new PC(32, 32);
  const gem = GEM[r], trim = TRIM[r], dark = hex("#141018");
  const gemDot = (x: number, y: number, s = 2) => { c.shadedEllipse(x, y, s, s, gem); c.set(x - 1, y - 1, hex("#ffffff")); };
  switch (kind) {
    case "sword": {
      c.line(8, 25, 23, 8, P.steel[1], 3); c.line(9, 23, 22, 9, P.steel[3], 1); c.set(24, 7, P.steel[4]);
      c.line(6, 20, 12, 26, trim[2], 2); c.line(5, 27, 8, 24, P.wood[2], 2);
      if (r) gemDot(9, 23, 1.6);
      if (r === 2) { c.line(11, 21, 21, 10, GEM[2][4], 1); }
      break;
    }
    case "axe": {
      c.line(8, 27, 22, 6, P.wood[2], 2);
      c.poly([[16, 8], [26, 6], [27, 17], [20, 16]], P.steel[2 + (r ? 1 : 0)]); c.line(26, 6, 27, 17, P.steel[4], 1);
      if (r) { c.line(17, 9, 20, 15, gem[3], 1); c.line(10, 24, 12, 21, trim[3], 2); }
      if (r === 2) { c.set(24, 9, hex("#ffffff")); c.set(23, 13, gem[4]); }
      break;
    }
    case "staff": {
      c.line(8, 28, 21, 9, P.wood[2], 2); c.line(9, 28, 22, 9, P.wood[1], 1);
      if (r) { c.line(12, 23, 15, 19, trim[3], 2); }
      c.shadedEllipse(23, 7, 3.5, 3.5, GEM[r === 0 ? 1 : r]);
      if (r === 2) { for (const [x, y] of [[18, 3], [28, 4], [27, 12]]) c.set(x, y, GEM[2][4]); }
      if (r === 1) c.poly([[20, 12], [23, 14], [26, 12], [23, 10]], trim[3]);
      break;
    }
    case "scepter": {
      c.line(9, 28, 20, 11, P.gold[2], 2); c.line(10, 28, 21, 11, P.gold[1], 1);
      c.poly([[22, 3], [26, 7], [22, 12], [18, 7]], r ? trim[3] : P.gold[3]); c.shadedEllipse(22, 7, 2.2, 2.2, GEM[r === 0 ? 1 : r]);
      if (r) { c.rect(14, 18, 5, 2, trim[3]); c.line(17, 4, 17, 8, trim[2], 1); c.line(27, 4, 27, 8, trim[2], 1); }
      if (r === 2) for (const [x, y] of [[18, 2], [28, 11], [16, 12]]) c.set(x, y, GEM[2][4]);
      break;
    }
    case "dagger": {
      for (const [dx, a] of [[0, 1], [7, 0]] as [number, number][]) {
        c.line(8 + dx, 25, 17 + dx, 8, P.steel[1 + a], 3); c.line(9 + dx, 23, 16 + dx, 9, P.steel[3], 1); c.set(18 + dx, 7, P.steel[4]);
        c.line(6 + dx, 22, 11 + dx, 24, trim[2], 2); c.line(6 + dx, 27, 8 + dx, 24, P.leather[2], 2);
      }
      if (r) { gemDot(11, 24, 1.4); }
      if (r === 2) { c.line(10, 22, 16, 10, GEM[2][4], 1); c.line(17, 22, 23, 10, GEM[2][4], 1); }
      break;
    }
    case "bow": {
      const col = r ? trim[2] : P.wood[2];
      for (let t = -1; t <= 1.001; t += 0.05) { const x = 12 + (1 - t * t) * 9, y = 16 + t * 12; c.ellipse(x, y, 1.1, 1.1, col); }
      c.line(12, 4, 12, 28, hex("#e8e4d8"), 1);
      if (r) { c.rect(19, 14, 3, 5, P.leather[2]); gemDot(20, 16, 1.5); }
      if (r === 2) { c.set(17, 6, GEM[2][4]); c.set(17, 26, GEM[2][4]); }
      break;
    }
    case "mace": {
      c.line(8, 27, 21, 10, P.wood[2], 2); c.line(9, 27, 22, 10, P.wood[1], 1);
      c.shadedEllipse(22, 8, 5, 5, P.steel);
      for (const [x, y] of [[22, 2], [28, 8], [22, 14], [16, 8]]) c.line(22, 8, x, y, P.steel[3], 2);
      if (r) { c.rect(12, 20, 5, 2, trim[3]); gemDot(22, 8, 1.8); }
      if (r === 2) { for (const [x, y] of [[26, 3], [17, 3], [27, 13]]) c.set(x, y, GEM[2][4]); }
      break;
    }
    case "shield": {
      c.poly([[5, 5], [27, 5], [26, 17], [16, 29], [6, 17]], (x) => P.steel[x < 12 ? 3 : x > 20 ? 1 : 2]);
      c.poly([[8, 8], [24, 8], [23, 16], [16, 25], [9, 16]], v === "mage" ? P.cloth.purple[2] : P.cloth.red[2]);
      c.line(16, 8, 16, 25, trim[2], 2); c.line(8, 14, 24, 14, trim[2], 2);
      c.shadedEllipse(16, 14, 3, 3, r ? gem : P.steel);
      if (r) c.line(5, 5, 27, 5, trim[3], 1);
      if (r === 2) { for (const [x, y] of [[6, 6], [26, 6], [16, 27]]) c.set(x, y, GEM[2][4]); }
      break;
    }
    case "helmet": {
      if (v === "warrior") {
        c.shadedEllipse(16, 16, 10, 9, P.steel); c.rect(6, 17, 20, 9, P.steel[1]); c.rect(8, 17, 16, 2, P.steel[3]);
        c.rect(10, 19, 12, 3, dark); c.rect(15, 19, 2, 7, P.steel[2]);
        c.rect(15, 5, 2, 5, r ? gem[2] : P.cloth.red[2]); c.rect(14, 4, 4, 2, r ? gem[3] : P.cloth.red[3]);
        if (r) { c.rect(6, 25, 20, 1, trim[2]); c.rect(8, 16, 16, 1, trim[3]); }
        if (r === 2) gemDot(16, 14, 1.8);
      } else if (v === "healer") {
        c.poly([[16, 3], [24, 10], [26, 25], [20, 22], [12, 22], [6, 25], [8, 10]], (x) => P.cloth.white[x < 12 ? 2 : x > 20 ? 1 : 3]);
        c.poly([[16, 7], [21, 12], [21, 20], [11, 20], [11, 12]], P.cloth.white[0]);
        c.rect(7, 22, 18, 2, r ? trim[2] : P.gold[2]); c.rect(15, 11, 2, 7, P.gold[3]); c.rect(13, 13, 6, 2, P.gold[3]);
        if (r === 2) gemDot(16, 21, 1.5);
      } else if (v === "mage") {
        c.ellipse(16, 24, 13, 4, P.cloth.purple[1]); c.ellipse(16, 23, 12, 3, P.cloth.purple[2]);
        c.poly([[16, 2], [22, 12], [25, 23], [7, 23], [11, 12]], (x) => P.cloth.purple[x < 14 ? 3 : x > 19 ? 1 : 2]);
        c.poly([[16, 2], [21, 4], [20, 8], [17, 5]], P.cloth.purple[2]);
        c.rect(9, 19, 14, 3, r ? trim[2] : P.cloth.blue[2]);
        gemDot(16, 20, r ? 2 : 1.4);
        if (r === 2) { for (const [x, y] of [[13, 10], [18, 14], [15, 6]]) c.set(x, y, GEM[2][4]); }
      } else {
        c.poly([[16, 3], [24, 10], [26, 26], [20, 22], [12, 22], [6, 26], [8, 10]], (x) => P.cloth.green[x < 12 ? 3 : x > 20 ? 1 : 2]);
        c.poly([[16, 6], [21, 12], [21, 21], [11, 21], [11, 12]], dark);
        c.rect(13, 14, 2, 2, hex("#ffe070")); c.rect(17, 14, 2, 2, hex("#ffe070"));
        c.line(16, 3, 16, 7, P.cloth.green[3], 1);
        if (r) { c.line(8, 24, 24, 24, trim[2], 1); c.rect(15, 23, 3, 3, trim[3]); }
        if (r === 2) gemDot(16, 8, 1.5);
      }
      break;
    }
    case "armor": {
      if (v === "warrior") {
        c.poly([[7, 8], [12, 6], [16, 9], [20, 6], [25, 8], [26, 16], [23, 16], [23, 27], [9, 27], [9, 16], [6, 16]], (x) => P.steel[x < 13 ? 3 : x > 20 ? 1 : 2]);
        c.line(16, 10, 16, 26, P.steel[1], 1); c.rect(9, 20, 14, 2, r ? trim[2] : P.leather[2]);
        if (r) { c.rect(7, 8, 5, 2, trim[3]); c.rect(20, 8, 5, 2, trim[3]); gemDot(16, 21, 1.8); }
        if (r === 2) { c.line(10, 12, 10, 18, trim[3], 1); c.line(22, 12, 22, 18, trim[3], 1); }
      } else if (v === "healer") {
        c.poly([[11, 5], [16, 8], [21, 5], [27, 15], [24, 17], [23, 14], [25, 28], [7, 28], [9, 14], [8, 17], [5, 15]], (x) => P.cloth.white[x < 13 ? 2 : x > 20 ? 1 : 3]);
        c.poly([[13, 5], [16, 8], [19, 5], [16, 14]], P.gold[3]);
        c.rect(8, 19, 16, 2, P.gold[2]); c.rect(15, 21, 2, 6, P.gold[3]); c.rect(13, 23, 6, 2, P.gold[3]);
        if (r) c.rect(7, 26, 18, 2, trim[2]);
        if (r === 2) gemDot(16, 20, 1.6);
      } else if (v === "mage") {
        c.poly([[11, 5], [16, 8], [21, 5], [27, 15], [24, 17], [23, 14], [25, 28], [7, 28], [9, 14], [8, 17], [5, 15]], (x) => P.cloth.purple[x < 13 ? 3 : x > 20 ? 1 : 2]);
        c.poly([[13, 5], [16, 8], [19, 5], [16, 14]], P.cloth.blue[3]);
        c.rect(8, 19, 16, 2, r ? trim[2] : P.leather[2]); gemDot(16, 20, r ? 1.8 : 1.2);
        c.line(16, 14, 16, 28, P.cloth.purple[0], 1);
        if (r) c.rect(7, 26, 18, 2, trim[2]);
        if (r === 2) { for (const [x, y] of [[11, 24], [20, 24], [16, 24]]) c.set(x, y, GEM[2][4]); }
      } else {
        c.poly([[10, 6], [16, 9], [22, 6], [25, 10], [24, 16], [22, 16], [22, 27], [10, 27], [10, 16], [8, 16], [7, 10]], (x) => P.leather[x < 13 ? 3 : x > 20 ? 1 : 2]);
        c.line(11, 7, 21, 25, P.leather[0], 2); c.rect(10, 21, 12, 2, P.cloth.green[2]);
        c.poly([[10, 6], [16, 9], [22, 6], [16, 12]], P.cloth.green[2]);
        if (r) { c.rect(10, 26, 12, 1, trim[2]); gemDot(16, 22, 1.5); }
        if (r === 2) { c.line(8, 10, 8, 15, trim[3], 1); c.line(24, 10, 24, 15, trim[3], 1); }
      }
      break;
    }
    case "boots": {
      if (v === "warrior") {
        for (const [x, d] of [[8, 0], [17, 1]]) { c.shadedRect(x, 7 + d, 7, 14, P.steel, 1); c.shadedRect(x, 20 + d, 11, 6, P.steel, 2); c.rect(x, 8 + d, 7, 2, r ? trim[3] : P.steel[4]); if (r) c.rect(x + 3, 14 + d, 2, 2, gem[3]); }
      } else if (v === "healer") {
        for (const [x, d] of [[9, 0], [18, 1]]) {
          c.shadedRect(x, 9 + d, 6, 12, P.cloth.white, 1);
          c.poly([[x, 20 + d], [x + 6, 20 + d], [x + 9, 24 + d], [x + 12, 22 + d], [x + 11, 26 + d], [x, 26 + d]], P.cloth.white[2]);
          c.rect(x, 10 + d, 6, 2, r ? trim[3] : P.gold[3]);
          if (r) c.set(x + 3, 15 + d, gem[3]);
        }
      } else if (v === "mage") {
        for (const [x, d] of [[9, 0], [18, 1]]) {
          c.shadedRect(x, 9 + d, 6, 12, P.cloth.purple, 1);
          c.poly([[x, 20 + d], [x + 6, 20 + d], [x + 9, 24 + d], [x + 12, 22 + d], [x + 11, 26 + d], [x, 26 + d]], P.cloth.purple[2]);
          c.rect(x, 10 + d, 6, 2, r ? trim[3] : P.cloth.blue[3]);
          if (r) c.set(x + 3, 15 + d, gem[3]);
        }
      } else {
        for (const [x, d] of [[9, 0], [17, 1]]) { c.shadedRect(x, 8 + d, 6, 14, P.leather, 1); c.shadedRect(x, 20 + d, 10, 6, P.leather, 2); c.rect(x - 1, 8 + d, 8, 3, P.cloth.green[2]); c.rect(x - 1, 8 + d, 8, 1, P.cloth.green[3]); if (r) c.rect(x, 14 + d, 6, 1, trim[2]); if (r === 2) c.set(x + 3, 17 + d, gem[4]); }
      }
      break;
    }
    case "ring": {
      c.ellipse(16, 18, 8, 8, trim[2]); c.ellipse(16, 18, 8, 3, trim[3]);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (Math.hypot(x + 0.5 - 16, y + 0.5 - 18) < 5) c.clear(x, y);
      c.shadedEllipse(16, 10, r ? 4.5 : 3.5, r ? 4.5 : 3.5, gem); c.set(15, 8, hex("#ffffff"));
      if (r === 2) { c.set(10, 8, gem[4]); c.set(22, 8, gem[4]); c.set(16, 4, gem[4]); }
      break;
    }
    case "amulet": {
      for (let t = 0; t <= 1; t += 0.03) c.set(8 + t * 16, 6 + Math.sin(t * Math.PI) * 10, trim[3]);
      c.shadedEllipse(16, 21, 6, 7, r ? P.gold : P.steel); c.shadedEllipse(16, 21, 3.5, 4, gem);
      if (r) for (const [x, y] of [[16, 13], [10, 21], [22, 21], [16, 29]]) c.set(x, y, P.gold[4]);
      if (r === 2) c.set(15, 19, hex("#ffffff"));
      break;
    }
  }
  c.outline();
  if (r === 2) {
    // свечение эпика: мягкий ореол вокруг силуэта
    const g = new PC(32, 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (c.alpha(x, y)) continue;
      let near = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (c.alpha(x + dx, y + dy) > 200) near = Math.max(near, 3 - Math.max(Math.abs(dx), Math.abs(dy)));
      if (near) g.set(x, y, withA(GLOW[2], near === 2 ? 70 : 35));
    }
    g.blit(c, 0, 0);
    return g;
  }
  return c;
}

/** Окраска уникальных предметов: [цвет, сила]; для медалей арены — металл. */
const UNIQUE_TINT: Record<string, [string, number, V]> = {
  heartwood_staff: ["#4fa840", 0.4, "mage"], rootbreaker: ["#8a5a2a", 0.4, "warrior"], whisperwind: ["#50d0a0", 0.4, "ranger"],
  bark_helm: ["#7a5a30", 0.5, "warrior"], hexed_ring: ["#c040a0", 0.4, "mage"], bog_mantle: ["#5a8a40", 0.5, "ranger"],
  witch_eye: ["#d03070", 0.4, "mage"], swamp_treads: ["#4a7a50", 0.5, "ranger"], ashbringer: ["#ff6a20", 0.5, "warrior"],
  cinder_staff: ["#ff5010", 0.5, "mage"], phoenix_bow: ["#ff8a20", 0.5, "ranger"], ashen_crown: ["#ff7030", 0.45, "warrior"],
  arena_bronze: ["#b0703a", 0.6, "warrior"], arena_silver: ["#d0d8e8", 0.6, "warrior"], arena_gold: ["#ffc830", 0.6, "warrior"],
  arena_platinum: ["#a0f0e8", 0.6, "warrior"], arena_diamond: ["#70d8ff", 0.7, "warrior"],
};

export function buildUniqueIcon(id: string): PC {
  const u = UNIQUES[id];
  const [col, k, v] = UNIQUE_TINT[id];
  const tint = hex(col);
  const c = draw(BASE_ITEMS[u.base].icon, v, 2);
  c.map((p) => (p[3] < 255 || p[0] + p[1] + p[2] < 110 ? p : mix(p, tint, k)));
  // искры уникального предмета
  for (const [x, y] of [[3, 4], [28, 3], [27, 27], [4, 26]]) { c.set(x, y, hex("#ffffff")); c.set(x + 1, y, withA(tint, 200)); c.set(x, y + 1, withA(tint, 200)); }
  return c;
}

// ---------------- легендарные иконки 48×48 ----------------
const WH = hex("#ffffff"), DK = hex("#120e16"), BONE = hex("#e8e0d0"), BONED = hex("#a89c80"), ORANGE = hex("#ff9a2e"), ORANGE_D = hex("#b05a10");
/** Класс брони варианта: для старых универсальных баз helmet / armor / boots. */
const ARMOR_OF: Record<string, string> = { warrior: "plate", deathknight: "plate", reaver: "plate", rogue: "leather", ranger: "leather", darkranger: "leather", mage: "cloth", healer: "cloth", warlock: "cloth", bloodweaver: "cloth" };
/** Архетип старых баз (их нет в BASE_SHAPE). */
const OLD_SHAPE: Record<string, string> = { sword: "broad", axe: "bearded", mace: "flanged", dagger: "dagger", bow: "long", staff: "rings", scepter: "sun", shield: "heater", ring: "signet", amulet: "medallion" };
const tintRamp = (c: RGBA): Ramp => [mix(c, DK, 0.62), mix(c, DK, 0.36), c, mix(c, WH, 0.45), WH];
const palRamp = (key: string, tint: RGBA, k: number): Ramp => ramp(...ITEM_PALETTES[key]).map((c) => mix(c, tint, k));
const legendCat = (u: LegendaryDef): string => {
  const a = ARMOR_OF[u.variant] ?? "plate";
  return u.base === "helmet" ? `${a}_helm` : u.base === "armor" ? `${a}_armor` : u.base === "boots" ? `${a}_boots` : u.base;
};
function bbox(c: PC) {
  let x0 = ICON, y0 = ICON, x1 = -1, y1 = -1;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.alpha(x, y) > 120) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
/** Знамя-штандарт (плащ с back = banner): древко, перекладина, полотнище с гербом и ласточкиным хвостом, кисти с яруса 85. */
function bannerIcon(u: LegendaryDef, tint: RGBA, c2: RGBA): PC {
  const c = new PC(ICON, ICON), umb = u.faction === "umbrath", ti = u.ti;
  const flag = hex(u.look.flag ?? (umb ? "#4a1a6a" : "#a8242c")), F = tintRamp(flag), metal = umb ? BONE : hex("#f0c040");
  const pole = umb ? [hex("#1c1822"), hex("#3a3446")] : [hex("#5a3a1e"), hex("#8a5a2a")];
  c.line(11, 46, 11, 4, pole[0], 3); c.line(10, 46, 10, 4, pole[1], 1);
  if (umb) { c.shadedEllipse(11, 3, 3, 2.6, ramp("#6a6050", "#a89c80", "#d8d0b8", "#e8e0d0", "#ffffff")); c.set(10, 3, DK); c.set(12, 3, DK); }
  else { c.poly([[11, -1], [14, 4], [8, 4]], metal); c.line(11, 0, 11, 3, WH, 1); }
  c.rect(9, 6, 33, 2, metal); c.rect(9, 6, 33, 1, mix(metal, WH, 0.4));
  const x0 = 13, x1 = 40, top = 8, h = 25 + ti, form = u.look.form ?? "swallow";
  for (let x = x0; x <= x1; x++) {
    const f = (x - x0) / (x1 - x0), off = Math.round(Math.sin(f * 5.2) * 1.6 * f);
    // низ полотнища: ласточкин хвост | рваный край | вымпел | двойное (два полотнища разной длины, щель между ними)
    let cut = Math.max(0, 7 - Math.abs(x - (x0 + x1) / 2) * 1.1);
    if (form === "torn") cut = 2 + ((x * 7) % 5) * 1.7 + f * 4;
    else if (form === "pennant") cut = h * 0.86 * f;
    else if (form === "double") { if (Math.abs(x - (x0 + x1) / 2) < 1.2) continue; cut = (x < (x0 + x1) / 2 ? 6 : 0) + Math.max(0, 3 - Math.abs(x - (x < (x0 + x1) / 2 ? x0 + 6 : x1 - 6)) * 0.7); }
    const hh = h - cut, fold = Math.sin(f * 5.2 + 1.2);
    for (let y = top; y < top + hh + off; y++) c.set(x, y, F[fold > 0.4 ? 3 : fold < -0.4 ? 1 : 2]);
    c.set(x, top + hh + off, ORANGE); c.set(x, top + hh + off + 1, ORANGE_D);
  }
  for (let y = top; y < top + h - 7; y++) { c.set(x0, y, ORANGE); c.set(x1, y + Math.round(Math.sin(5.2) * 1.6), ORANGE); }
  const crest = u.look.crest ?? (umb ? "skull" : "sun");
  if (form === "double") { crestAt(c, crest, 33, top + 12, 2.4, tint, c2); crestAt(c, "star", 19, top + 8, 2, c2, tint); }
  else if (form === "pennant") crestAt(c, crest, 21, top + 7, 2.6, tint, c2);
  else crestAt(c, crest, 27, top + 11, 3, tint, c2);
  if (ti >= 3) for (const x of [9, 41]) { c.line(x, 8, x, 15, c2, 1); c.rect(x - 1, 15, 3, 3, tint); }
  c.outline();
  return c;
}
/** Крылья за предметом: перья / кости с перепонкой / пламя; размах растёт с ярусом. */
function wingsIcon(c: PC, kind: string, tint: RGBA, c2: RGBA, ti: number, cy: number) {
  const nf = 5 + ti, span = 20 + ti;
  for (const s of [-1, 1]) {
    const rx = 24 + s * 3, ry = cy;
    const tips: [number, number][] = [];
    for (let j = 0; j < nf; j++) { const f = j / (nf - 1), ang = 1.15 - f * 1.5, l = span * (1 - 0.32 * Math.abs(f - 0.2)); tips.push([rx + s * Math.cos(ang) * l, ry - Math.sin(ang) * l * 0.9]); }
    if (kind === "bone") {
      const ex = rx + (tips[0][0] - rx) * 0.45, ey = ry + (tips[0][1] - ry) * 0.45;
      for (let j = 1; j < nf; j++) c.poly([[ex, ey], tips[j - 1], tips[j]], withA(mix(tint, DK, 0.45), 120));
      c.line(rx, ry, ex, ey, BONED, 3); c.line(ex, ey, tips[0][0], tips[0][1], BONE, 2);
      for (let j = 1; j < nf; j++) c.line(ex, ey, tips[j][0], tips[j][1], j % 2 ? BONE : BONED, 1);
      c.set(Math.round(tips[0][0]), Math.round(tips[0][1]) - 1, c2);
    } else for (let j = nf - 1; j >= 0; j--) {
      const [x, y] = tips[j], mx = rx + (x - rx) * 0.55, my = ry + (y - ry) * 0.55;
      if (kind === "crystal") { c.poly([[rx, ry - 2], [rx, ry + 2], [x, y]], j % 2 ? hex("#cfe0ff") : mix(c2, WH, 0.35)); c.line(rx, ry, x, y, j % 2 ? c2 : WH, 1); c.set(Math.round(x), Math.round(y), tint); }
      else if (kind === "shadow") { c.line(rx, ry, mx, my, withA(mix(tint, DK, 0.65), 190), 4); c.line(mx, my, x, y, withA(mix(tint, DK, 0.5), 140), 2); c.set(Math.round(x), Math.round(y), withA(c2, 220)); if (j % 2) c.set(Math.round(mx), Math.round(my) + 2, withA(c2, 140)); }
      else if (kind === "leaf") { c.line(rx, ry, mx, my, hex("#3a6a2a"), 2); c.ellipse(x, y, 3.2, 2, j % 2 ? hex("#5fa040") : hex("#8ac060")); c.line(mx, my, x, y, c2, 1); c.set(Math.round(x), Math.round(y), tint); }
      else if (kind === "flame") { c.line(rx, ry, mx, my, tint, 3); c.line(mx, my, x, y, c2, 2); c.set(Math.round(x), Math.round(y), WH); }
      else { c.line(rx, ry, mx, my, j % 2 ? hex("#dce2ec") : c2, 3); c.line(mx, my, x, y, j % 2 ? c2 : WH, 2); c.set(Math.round(x), Math.round(y), tint); }
    }
  }
}
/** Уменьшение (ближайший сосед) с неподвижной точкой (ax, ay): предмет уступает место крыльям и короне. */
function shrink(src: PC, k: number, ax: number, ay: number): PC {
  const out = new PC(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const p = src.get(Math.floor(ax + (x + 0.5 - ax) / k), Math.floor(ay + (y + 0.5 - ay) / k)); if (p && p[3]) out.set(x, y, p); }
  return out;
}
const sparkle = (c: PC, x: number, y: number, col: RGBA) => { c.set(x, y, WH); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + dx, y + dy, withA(col, 200)); };
const ICEC = hex("#cfe0ff"), GREENC = hex("#5fa040");
/** Мелкий знак темы (5–7 px): парящий предмет look.orbit или частица look.fx. */
function glyph(c: PC, kind: string, x: number, y: number, tint: RGBA, c2: RGBA) {
  switch (kind) {
    case "blades": c.line(x, y - 3, x, y + 2, c2, 1); c.set(x, y - 3, WH); c.line(x - 1, y + 2, x + 1, y + 2, tint, 1); c.set(x, y + 3, mix(tint, DK, 0.4)); break;
    case "runes": c.rect(x - 1, y - 1, 3, 1, tint); c.set(x - 1, y, c2); c.set(x + 1, y + 1, c2); c.rect(x - 1, y + 2, 3, 1, tint); break;
    case "motes": c.ellipse(x, y, 2.6, 2.6, withA(tint, 90)); c.shadedEllipse(x, y, 1.6, 1.6, tintRamp(tint)); c.set(x - 1, y - 1, c2); break;
    case "shards": case "ice": c.poly([[x, y - 4], [x + 2, y], [x, y + 3], [x - 2, y]], ICEC); c.line(x, y - 4, x, y + 3, c2, 1); c.set(x - 1, y - 1, WH); break;
    case "leaves": case "leaf": c.ellipse(x, y, 1.8, 3.2, GREENC); c.line(x, y - 3, x, y + 3, c2, 1); c.set(x, y - 3, tint); break;
    case "drops": case "blood": c.poly([[x, y - 4], [x + 2, y], [x, y + 3], [x - 2, y]], tint); c.set(x - 1, y - 1, WH); c.set(x, y + 1, mix(tint, DK, 0.4)); break;
    case "bolts": case "bolt": c.line(x + 1, y - 4, x - 1, y - 1, c2, 1); c.line(x - 1, y - 1, x + 1, y, c2, 1); c.line(x + 1, y, x - 1, y + 4, c2, 1); c.set(x + 1, y - 4, WH); c.set(x, y - 1, tint); break;
    case "stars": case "stardust": c.set(x, y, WH); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.set(x + dx, y + dy, tint); c.set(x + dx * 2, y + dy * 2, withA(c2, 200)); } break;
    case "bones": case "bonespike": c.rect(x - 3, y, 7, 1, BONE); for (const sx of [-3, 3]) { c.set(x + sx, y - 1, BONE); c.set(x + sx, y + 1, BONE); } c.set(x, y, c2); break;
    case "vortex": for (let i = 0; i < 14; i++) { const a = i * 0.7, r = 0.5 + i * 0.22; c.set(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), i % 2 ? c2 : tint); } break;
  }
}
const FX_GLYPH = new Set(["vortex", "ice", "bones", "stardust", "blood", "bolt"]);
function orbitIcon(c: PC, kind: string, tint: RGBA, c2: RGBA) {
  for (const [x, y] of [[6, 7], [41, 6], [42, 40], [5, 41]]) glyph(c, kind, x, y, tint, c2);
}

/**
 * Легендарная иконка 48×48: модель категории (архетип look.shape) в палитре темы — камень и руны цвета tint/c2, металл и ткань
 * с оттенком темы; за предметом — крылья, знамя заменяет плащ; поверх — навершие, гравировка, корона/нимб, наплечники, цепи,
 * парящие руны и клинки; призрачная копия оружия. Кайма двойная оранжевая (цвет редкости), с яруса 85 — ореол темы.
 */
export function buildLegendaryIcon(id: string): PC {
  const u = LEGENDARIES[id], lk = u.look, ti = u.ti;
  const tint = hex(u.tint), c2 = hex(lk.c2), umb = u.faction === "umbrath", cat = legendCat(u), slot = BASE_ITEMS[u.base].slot;
  let item: PC;
  if (lk.back === "banner") item = bannerIcon(u, tint, c2);
  else {
    const shape = lk.form ?? lk.shape ?? BASE_SHAPE[cat] ?? OLD_SHAPE[cat] ?? "broad";
    const look: ModelLook = { shape, mat: umb ? "darksteel" : "silver", trim: umb ? "bone" : "gold", haft: umb ? "darkwood" : "yew", cloth: umb ? "shroud" : "crimson", hide: umb ? "blackleather" : "darkleather", gem: "diamond", rich: 3 };
    if (lk.helm === "horns" || lk.pauld === "spikes") look.deco = lk.helm === "horns" ? "horns" : "spikes";
    const T = tintRamp(tint), T2 = tintRamp(c2);
    item = drawModel(cat, look, u.faction, id.length * 131 + ti, 3, {
      gem: T, stone: T, fx: T2, mat: palRamp(look.mat, tint, 0.22), trim: palRamp(look.trim, ORANGE, 0.25),
      cloth: tintRamp(lk.flag ? hex(lk.flag) : mix(tint, DK, 0.25)), hide: palRamp(look.hide!, tint, 0.15),
      crestKind: slot === "offhand" ? lk.crest : undefined, stoneKind: lk.stone, setting: lk.setting,
    });
  }
  // крылья, корона, нимб и пламя над шлемом: предмет меньше и ниже, чтобы тема читалась
  const roomy = lk.back === "wings" || (slot === "helmet" && !!lk.helm && lk.helm !== "horns") || (slot === "armor" && (lk.pauld === "flame" || lk.pauld === "frost"));
  if (roomy) item = shrink(item, lk.back === "wings" ? 0.66 : 0.8, 24, 46);
  const b = bbox(item), out = new PC(ICON, ICON);
  // фон: ореол темы с яруса 85, крылья
  if (ti >= 3) for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) { const d = Math.hypot(x + 0.5 - b.cx, y + 0.5 - b.cy) / 26; if (d < 1) out.set(x, y, withA(tint, Math.round(70 * (1 - d) * (ti === 4 ? 1.3 : 1)))); }
  if (lk.back === "wings") { const wl = new PC(ICON, ICON); wingsIcon(wl, lk.wings ?? "feather", tint, c2, ti, Math.round(b.y0 + (b.y1 - b.y0) * 0.25)); wl.outline(); out.blit(wl, 0, 0); }
  // призрачная копия оружия — сдвинута поперёк клинка, полупрозрачная, цвета c2
  if (lk.ghost && slot === "weapon") { const g = item.clone().map((p) => withA(mix(p, c2, 0.75), Math.round(p[3] * 0.42))); out.blit(g, 4, 3); }
  out.blit(item, 0, 0);
  // двойная оранжевая кайма по силуэту предмета: внутренняя яркая, внешняя тёмная (детали темы ложатся поверх)
  const ring = (src: PC, col: RGBA) => { const r = new PC(ICON, ICON); for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) { if (src.alpha(x, y) > 150) continue; if (src.alpha(x - 1, y) > 150 || src.alpha(x + 1, y) > 150 || src.alpha(x, y - 1) > 150 || src.alpha(x, y + 1) > 150) r.set(x, y, col); } return r; };
  const solid = new PC(ICON, ICON); solid.blit(item, 0, 0);
  const r1 = ring(solid, ORANGE); solid.blit(r1, 0, 0);
  const r2 = ring(solid, withA(ORANGE_D, 210));
  out.blit(r1, 0, 0); out.blit(r2, 0, 0);
  // поверх: навершие и гравировка оружия (рукоять — внизу слева, острие — вверху справа)
  if (slot === "weapon" || slot === "offhand") {
    let hx = 0, hy = 0, tx = 0, ty = 0, lo = Infinity, hi = -Infinity;
    for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) if (item.alpha(x, y) > 200) { const v = x - y; if (v < lo) { lo = v; hx = x; hy = y; } if (v > hi) { hi = v; tx = x; ty = y; } }
    if (lk.pommel === "skull") { out.shadedEllipse(hx + 2, hy - 2, 3, 2.8, ramp("#6a6050", "#a89c80", "#d8d0b8", "#e8e0d0", "#ffffff")); out.set(hx + 1, hy - 2, tint); out.set(hx + 3, hy - 2, tint); }
    else if (lk.pommel === "eye") { out.ellipse(hx + 2, hy - 2, 3.6, 2.4, BONE); out.ellipse(hx + 2, hy - 2, 1.5, 1.5, tint); out.set(hx + 2, hy - 2, DK); out.set(hx + 1, hy - 3, WH); }
    else if (lk.pommel === "flame") for (let q = 0; q < 3; q++) { const x = hx + q * 2; out.line(x, hy - 1, x, hy - 5 - (q === 1 ? 3 : 1), q === 1 ? c2 : tint, 2); out.set(x, hy - 6 - (q === 1 ? 3 : 1), WH); }
    else if (lk.pommel === "gem") { out.shadedEllipse(hx + 2, hy - 2, 3, 3, tintRamp(tint)); out.set(hx + 1, hy - 3, WH); out.ellipse(hx + 2, hy - 2, 4, 4, withA(c2, 80)); }
    else if (lk.pommel === "fang") { out.poly([[hx - 1, hy - 4], [hx + 4, hy - 4], [hx + 1, hy + 3]], BONE); out.poly([[hx + 1, hy - 4], [hx + 4, hy - 4], [hx + 1, hy + 3]], BONED); out.set(hx + 1, hy - 3, c2); }
    else if (lk.pommel === "leaf") { out.poly([[hx - 2, hy], [hx + 1, hy - 6], [hx + 5, hy - 2]], GREENC); out.line(hx - 1, hy - 1, hx + 4, hy - 3, c2, 1); }
    else if (lk.pommel === "drop") { out.poly([[hx + 2, hy - 6], [hx + 5, hy - 2], [hx + 2, hy + 1], [hx - 1, hy - 2]], tint); out.set(hx + 1, hy - 3, WH); }
    else if (lk.pommel === "star") { out.line(hx - 1, hy - 1, hx + 5, hy - 1, tint, 1); out.line(hx + 2, hy - 4, hx + 2, hy + 2, tint, 1); out.set(hx + 2, hy - 1, WH); out.set(hx, hy - 3, c2); out.set(hx + 4, hy + 1, c2); }
    if (lk.blade === "jagged") for (let f = 0.3; f < 0.92; f += 0.1) { const x = Math.round(hx + (tx - hx) * f), y = Math.round(hy + (ty - hy) * f); out.poly([[x, y - 1], [x + 2, y - 4], [x + 3, y - 1]], f > 0.8 ? WH : c2); }
    if (lk.blade === "flaming") for (let f = 0.35; f < 0.95; f += 0.12) { const x = Math.round(hx + (tx - hx) * f), y = Math.round(hy + (ty - hy) * f); out.line(x, y - 1, x - 1, y - 5 - (f > 0.6 ? 2 : 0), tint, 2); out.set(x - 1, y - 6 - (f > 0.6 ? 2 : 0), c2); }
    if (lk.blade === "crystal") for (let f = 0.3; f < 0.95; f += 0.1) { const x = Math.round(hx + (tx - hx) * f), y = Math.round(hy + (ty - hy) * f); if (item.alpha(x, y) > 200) { out.set(x, y, f > 0.8 ? WH : ICEC); out.set(x + 1, y - 1, withA(c2, 220)); } }
    if (lk.blade === "long") for (let f = 0.45; f < 0.92; f += 0.07) { const x = Math.round(hx + (tx - hx) * f), y = Math.round(hy + (ty - hy) * f); if (item.alpha(x, y) > 200) out.set(x, y, f > 0.85 ? WH : c2); }
  }
  // шлем: корона, нимб, рога уже в модели (deco), светящиеся глаза в прорези
  if (slot === "helmet") {
    const gold = umb ? tint : hex("#f0c040");
    if (lk.helm === "crown") {
      // корона: обруч и пять зубцов-треугольников (средний выше, растут с ярусом), камни цвета c2
      const G = tintRamp(gold), cx = Math.round(b.cx), base = b.y0 + 1, w = 9;
      for (let k = -2; k <= 2; k++) { const x = cx + k * 4, hh = (k === 0 ? 8 : Math.abs(k) === 1 ? 5 : 6) + ti; out.poly([[x - 2, base], [x + 2, base], [x + 0.5, base - hh]], (px) => G[px < x ? 3 : 2]); out.set(x, base - hh + 1, k === 0 ? c2 : WH); }
      out.rect(cx - w - 1, base - 1, 2 * w + 3, 3, G[2]); out.rect(cx - w - 1, base - 1, 2 * w + 3, 1, G[3]);
      for (const k of [-2, 0, 2]) out.rect(cx + k * 4 - 1, base, 2, 1, c2);
    }
    if (lk.helm === "flame") for (let q = 0; q < 5; q++) { const x = Math.round(b.cx - 6 + q * 3), hh = 6 + ti + (q === 2 ? 4 : q % 2 ? 2 : 0); out.line(x, b.y0 + 1, x, b.y0 + 1 - hh, tint, 2); out.line(x, b.y0, x, b.y0 + 2 - hh, c2, 1); out.set(x, b.y0 + 1 - hh, WH); }
    if (lk.helm === "wings") for (const s of [-1, 1]) for (let q = 0; q < 4; q++) { const x0 = s < 0 ? b.x0 + 2 : b.x1 - 2; out.line(x0, b.cy - q, x0 + s * (6 + q * 2), b.cy - 6 - q * 3, q % 2 ? c2 : WH, 2); out.set(x0 + s * (6 + q * 2), b.cy - 6 - q * 3, tint); }
    if (lk.helm === "antlers") for (const s of [-1, 1]) { const x0 = b.cx + s * 7, y0 = b.y0 + 4; out.line(x0, y0, x0 + s * 4, y0 - 7, BONE, 3); out.line(x0 + s * 4, y0 - 7, x0 + s * 5, y0 - 13, BONE, 2); out.line(x0 + s * 2, y0 - 3, x0 + s * 8, y0 - 6, BONE, 2); out.line(x0 + s * 4.5, y0 - 9, x0 + s * 9, y0 - 12, BONED, 2); out.set(x0 + s * 5, y0 - 14, tint); out.set(x0 + s * 9, y0 - 12, c2); out.set(x0 + s * 8, y0 - 6, c2); }
    if (lk.helm === "spires") for (let q = -3; q <= 3; q++) { const x = Math.round(b.cx + q * 3.2), hh = 7 + ti + (3 - Math.abs(q)) * 2; out.poly([[x - 1.6, b.y0 + 2], [x, b.y0 + 2 - hh], [x + 1.6, b.y0 + 2]], q % 2 ? tint : c2); out.set(x, b.y0 + 2 - hh, WH); out.line(x, b.y0 + 2, x, b.y0 + 4 - hh, mix(tint, WH, 0.5), 1); }
    if (lk.helm === "thorns") for (let q = 0; q < 9; q++) { const x = Math.round(b.x0 + 3 + q * ((b.x1 - b.x0 - 6) / 8)), hh = 6 + ti + (q % 2 ? 0 : 4); out.poly([[x - 1.4, b.y0 + 3], [x + (q - 4) * 0.4, b.y0 + 3 - hh], [x + 1.4, b.y0 + 3]], q % 2 ? BONED : BONE); out.set(Math.round(x + (q - 4) * 0.4), b.y0 + 3 - hh, q % 3 ? tint : c2); }
    if (lk.helm === "moon") { const my = b.y0 - 5 - ti; out.ellipse(b.cx, my, 9, 9, mix(tint, WH, 0.15)); for (let y = my - 11; y < my + 11; y++) for (let x = Math.round(b.cx - 12); x < b.cx + 12; x++) if (Math.hypot(x + 0.5 - (b.cx + 3.5), y + 0.5 - (my - 2)) < 8) out.clear(x, y); out.ellipse(b.cx - 1, my + 4, 1.6, 1.6, c2); out.set(Math.round(b.cx + 5), Math.round(my - 6), WH); }
    if (lk.helm === "plume") for (let q = 0; q < 6; q++) { const sx = b.cx - 1, sy = b.y0 + 3, ex = sx + 3 + q * 2.6, ey = sy - 12 + q * 1.5; out.line(sx, sy, (sx + ex) / 2 - 2, (sy + ey) / 2 - 5, q % 2 ? c2 : tint, 3); out.line((sx + ex) / 2 - 2, (sy + ey) / 2 - 5, ex, ey, q % 2 ? WH : c2, 2); }
    if (lk.helm === "halo") { for (let a = 0; a < Math.PI * 2; a += 0.05) out.set(Math.round(b.cx + Math.cos(a) * 11), Math.round(b.y0 - 1 + Math.sin(a) * 3), c2); }
    if (lk.eyes) {
      let row = -1, best = 0;
      for (let y = Math.round(b.y0 + (b.y1 - b.y0) * 0.3); y < b.y0 + (b.y1 - b.y0) * 0.75; y++) { let n = 0; for (let x = Math.round(b.cx - 8); x <= b.cx + 8; x++) { const p = item.get(x, y); if (p && p[3] > 200 && p[0] + p[1] + p[2] < 150) n++; } if (n > best) { best = n; row = y; } }
      if (row < 0) row = Math.round(b.cy);
      for (const ex of [Math.round(b.cx - 5), Math.round(b.cx + 3)]) { out.rect(ex - 2, row - 2, 6, 5, withA(c2, 90)); out.rect(ex - 1, row - 1, 4, 3, withA(c2, 200)); out.rect(ex, row, 2, 1, WH); }
    }
  }
  // доспех: пламенные / ледяные наплечники над плечами, цепи
  if (slot === "armor") {
    for (const [sx, s] of [[b.x0 + 5, -1], [b.x1 - 5, 1]] as const) {
      if (lk.pauld === "flame") for (let q = 0; q < 3; q++) { const x = sx + (q - 1) * 2, hh = 5 + ti + (q === 1 ? 2 : 0); out.line(x, b.y0 + 2, x + s, b.y0 + 2 - hh, tint, 2); out.line(x, b.y0 + 1, x + s, b.y0 + 3 - hh, c2, 1); out.set(x + s, b.y0 + 2 - hh, WH); }
      if (lk.pauld === "feathers") for (let q = 0; q < 4; q++) { const x = sx + (q - 1.5) * 2.4, hh = 7 + ti - Math.abs(q - 1.5) * 2; out.line(x, b.y0 + 3, x + s * (q - 1.5) * 1.5, b.y0 + 3 - hh, q % 2 ? hex("#dce2ec") : c2, 2); out.line(x, b.y0 + 2, x + s * (q - 1.5) * 1.5, b.y0 + 3 - hh, WH, 1); out.set(Math.round(x + s * (q - 1.5) * 1.5), b.y0 + 3 - hh, tint); }
      if (lk.pauld === "bone") for (let q = 0; q < 3; q++) { const x = sx + (q - 1) * 3; out.poly([[x - 1.6, b.y0 + 4], [x + s * (q - 1) * 1.4, b.y0 + 4 - 6 - ti - (q === 1 ? 3 : 0)], [x + 1.6, b.y0 + 4]], q === 1 ? BONE : BONED); out.set(x, b.y0 + 3, c2); }
      if (lk.pauld === "leaves") for (let q = 0; q < 3; q++) { const x = sx + (q - 1) * 3, hh = 6 + ti - Math.abs(q - 1) * 2; out.ellipse(x + s * (q - 1) * 2, b.y0 + 2 - hh * 0.55, 2, hh * 0.55, q % 2 ? hex("#5fa040") : hex("#8ac060")); out.line(x, b.y0 + 3, x + s * (q - 1) * 2, b.y0 + 2 - hh, c2, 1); }
      if (lk.pauld === "stars") { for (const [dx, dy, r] of [[0, 4, 3], [-s * 4, 8, 2], [s * 3, 10, 2]] as number[][]) { const x = sx + dx, y = b.y0 + 4 - dy; out.set(x, y, WH); for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { for (let k2 = 1; k2 <= r; k2++) out.set(x + ax * k2, y + ay * k2, k2 === 1 ? tint : withA(c2, 190)); } } }
      if (lk.pauld === "frost") for (let q = 0; q < 3; q++) { const x = sx + (q - 1) * 2, hh = 4 + ti - Math.abs(q - 1); out.line(x, b.y0 + 3, x + s * (q - 1), b.y0 + 2 - hh, hex("#8ea4d8"), 2); out.line(x, b.y0 + 2, x + s * (q - 1), b.y0 + 2 - hh, q === 1 ? c2 : hex("#d0dcff"), 1); }
    }
  }
  if (slot === "boots" && lk.boots === "wings") for (const s of [-1, 1]) for (let q = 0; q < 3; q++) { const x0 = s < 0 ? b.x0 + 1 : b.x1 - 1, y0 = b.y0 + 6 + q * 2; out.line(x0, y0, x0 + s * (5 + q), y0 - 6 + q, q % 2 ? c2 : WH, 2); }
  if (slot === "boots" && lk.boots === "rune") for (const s of [-1, 1]) for (let q = 0; q < 3; q++) { const x = Math.round(s < 0 ? b.x0 + 2 : b.x1 - 3), y = b.y0 + 4 + q * 4; out.rect(x, y, 2, 3, withA(c2, 220)); out.set(x, y + 1, WH); out.set(x + (s < 0 ? 2 : -1), y + 2, tint); }
  if (slot === "boots" && lk.boots === "frost") for (const s of [-1, 1]) for (let q = 0; q < 3; q++) { const x0 = s < 0 ? b.x0 + 1 : b.x1 - 1, y0 = b.y0 + 6 + q * 4; out.poly([[x0, y0 - 2], [x0 + s * (5 + q), y0 + 1], [x0, y0 + 2]], q % 2 ? ICEC : mix(c2, WH, 0.3)); out.line(x0, y0, x0 + s * (5 + q), y0 + 1, WH, 1); }
  if (slot === "boots" && lk.boots === "shadow") for (let q = 0; q < 7; q++) { const x = b.x0 + 2 + q * ((b.x1 - b.x0 - 4) / 6); out.line(x, b.y1 - 2, x + (q % 2 ? 2 : -2), b.y1 - 9 - (q % 3) * 3, withA(mix(tint, DK, 0.6), 190), 3); out.line(x, b.y1 - 4, x + (q % 2 ? 2 : -2), b.y1 - 9 - (q % 3) * 3, withA(c2, 150), 1); }
  if (slot === "boots" && lk.boots === "thorns") for (const s of [-1, 1]) for (let q = 0; q < 3; q++) { const x0 = s < 0 ? b.x0 + 1 : b.x1 - 1, y0 = b.y0 + 6 + q * 5; out.poly([[x0, y0 - 1.5], [x0 + s * 6, y0 - 4 + q], [x0, y0 + 1.5]], BONE); out.set(x0 + s * 6, y0 - 4 + q, c2); }
  if (slot === "boots" && lk.boots === "spark") for (const s of [-1, 1]) { const x0 = s < 0 ? b.x0 : b.x1; out.line(x0, b.y0 + 4, x0 + s * 3, b.y0 + 8, c2, 1); out.line(x0 + s * 3, b.y0 + 8, x0 + s * 1, b.y0 + 10, c2, 1); out.line(x0 + s, b.y0 + 10, x0 + s * 4, b.y0 + 15, c2, 1); out.set(x0, b.y0 + 4, WH); }
  if (slot === "boots" && lk.boots === "flame") for (let q = 0; q < 6; q++) { const x = b.x0 + 3 + q * ((b.x1 - b.x0 - 6) / 5), hh = 4 + (q % 2) * 3; out.line(x, b.y1, x, b.y1 - hh, tint, 2); out.set(Math.round(x), b.y1 - hh, c2); }
  if (lk.chains && (slot === "armor" || slot === "cloak")) {
    const n = 12;
    for (let q = 0; q <= n; q++) { const f = q / n, x = b.x0 + 2 + (b.x1 - b.x0 - 4) * f, y = b.y0 + (b.y1 - b.y0) * (0.3 + 0.45 * f) + Math.sin(f * Math.PI) * 3; if (q % 2) out.rect(x - 1, y, 3, 1, withA(c2, 200)); else out.rect(x, y - 1, 1, 3, withA(q % 3 ? c2 : tint, 220)); }
  }
  if (lk.back === "plumage") for (let row = 0; row < 3; row++) for (let q = 0; q < 8; q++) { const x = b.x0 + 3 + q * ((b.x1 - b.x0 - 6) / 7) + (row % 2) * 2, y = b.y0 + 6 + row * 9; out.line(x, y, x + (q < 4 ? -1 : 1), y + 8, (q + row) % 2 ? hex("#dce2ec") : c2, 3); out.line(x, y + 1, x + (q < 4 ? -1 : 1), y + 8, (q + row) % 3 ? WH : tint, 1); }
  if (lk.back === "shadow") for (let q = 0; q < 9; q++) { const x = b.x0 + 2 + q * ((b.x1 - b.x0 - 4) / 8), y = b.y1 - 3; out.line(x, y, x + (q % 2 ? 3 : -3), y + 3 + (q % 3) * 2, withA(mix(tint, DK, 0.65), 200), 3); out.line(x, y - 6, x + (q % 2 ? 2 : -2), y + 2, withA(c2, 120), 1); }
  if (lk.orbit) orbitIcon(out, lk.orbit, tint, c2);
  else if (FX_GLYPH.has(lk.fx)) for (const [x, y] of [[6, 8], [41, 7], [41, 41]]) glyph(out, lk.fx, x, y, tint, c2);
  // искры по углам: больше с ярусом
  const sp: [number, number][] = [[3, 3], [44, 3], [44, 44], [3, 44], [24, 1], [46, 24]];
  for (const [x, y] of sp.slice(0, 2 + Math.min(4, ti + 1))) if (!out.alpha(x, y)) sparkle(out, x, y, ti >= 3 ? tint : ORANGE);
  return out;
}

const OLD_KINDS = new Set(["sword", "axe", "staff", "scepter", "dagger", "bow", "mace", "shield", "helmet", "armor", "boots", "ring", "amulet"]);

/** Все id иконок экипировки: имя -> холст. */
export function buildEquipIcons(): Record<string, PC> {
  const out: Record<string, PC> = {};
  for (const b of Object.values(BASE_ITEMS)) {
    if (b.slot === "consumable") continue;
    // новые базы рисует генератор моделей (equip-models.ts); старые — прежний рисовальщик
    if (MODEL_CATS.includes(b.id) && !OLD_KINDS.has(b.icon)) continue;
    const variants = ICON_VARIANT_SLOTS.includes(b.icon) ? ICON_VARIANTS : [ICON_VARIANTS[0]];
    for (const v of variants) for (const r of [0, 1, 2] as Rarity[]) out[iconId(b.icon, v, r)] = draw(b.icon, v as V, r);
  }
  Object.assign(out, buildBaseIcons(), buildAllModelIcons());
  for (const id of Object.keys(UNIQUES)) out["uq_" + id] = buildUniqueIcon(id);
  for (const id of Object.keys(LEGENDARIES)) out["lg_" + id] = buildLegendaryIcon(id);
  return out;
}
