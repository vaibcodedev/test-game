/**
 * Задача 141, этап 1 (превью, в игру не ставится): общая основа новых стен, башен, ворот и зданий.
 *   Look — стиль фракции и уровня: столица ≠ форт ≠ поселение (Сольгард — белый камень, золото, лазурь; Умбрат — тёмный
 *   камень, фиолетовое стекло; Эмберхолл — тёплый песчаник, кирпич, медь и терракота).
 *   Кладка — бесшовные тайлы 32×32 (ряды тёсаных блоков, кирпич, бут, крупный блок) со светом сверху слева,
 *   фасками и швами; верх стен — плиты. Износ — трещины, мох, плющ, заплатки, сколы (накладываются на готовый кадр).
 * Вид 3/4 с фасадом, как Free Medieval Fortress Top-Down Kit и [LPC] Medieval Village Decorations.
 */
import { PC, hash01, hex, mix, pnoise, ramp, shade, withA, type RGBA, type Ramp } from "./canvas";

export type Tier = "capital" | "fort" | "settle";
export type Masonry = "ashlar" | "brick" | "rubble" | "block" | "gothic";
export type Crest = "merlon" | "spike" | "swallow" | "plain";
export type Wear = "clean" | "crack" | "moss" | "ivy" | "patch" | "chip";
export const WEARS: Wear[] = ["clean", "crack", "moss", "ivy", "patch", "chip"];

export interface Look {
  id: string;
  name: string;
  faction: "sol" | "umb" | "ember";
  tier: Tier;
  /** камень, 6 тонов от тёмного к светлому */
  stone: Ramp;
  /** шов кладки */
  mortar: RGBA;
  masonry: Masonry;
  crest: Crest;
  /** отделка: карнизы, оковка, навершия (5 тонов) */
  trim: Ramp;
  /** стекло окон: рама в тени, стекло, свет */
  glass: Ramp;
  /** кровля: основная и запасные варианты (5 тонов) */
  roofs: Ramp[];
  /** дерево створок, балок, брёвен (5 тонов) */
  wood: Ramp;
  /** мох или лишайник (3 тона) */
  moss: Ramp;
  /** штукатурка фахверка (4 тона) */
  plaster: Ramp;
  /** ткань навесов и знамён (4 тона) и второй цвет */
  cloth: Ramp;
  cloth2: Ramp;
}

const GOLD = ramp("#5a3810", "#9a6418", "#d8a02c", "#ffd45e", "#fff2b4");
const IRON = ramp("#16141c", "#2a2834", "#45434f", "#6c6a78", "#a2a0ae");
const DIRON = ramp("#0c0a12", "#1c1826", "#302a40", "#4a4262", "#6e6490");
const COPPER = ramp("#3a1a10", "#6e3218", "#a85a26", "#d88a3c", "#ffc070");
const OAK = ramp("#2a160c", "#4a2a16", "#6e4224", "#946034", "#b8844c");
const DARKWOOD = ramp("#0e0a10", "#1c1418", "#2e2024", "#443034", "#5c4448");
const GREENMOSS = ramp("#1e3a1c", "#365e28", "#5a8a36");
const LICHEN = ramp("#1a2a30", "#2c4a4a", "#4a7a6a");
const ASHMOSS = ramp("#3a2a18", "#5e4a26", "#8a7a3a");

export const LOOKS: Record<string, Look> = {
  sol_capital: {
    id: "sol_capital", name: "Аурелион — столица", faction: "sol", tier: "capital",
    stone: ramp("#7e786c", "#aca596", "#d0cabb", "#e8e2d3", "#f6f1e5", "#fffdf6"), mortar: hex("#9a9284"),
    masonry: "ashlar", crest: "merlon", trim: GOLD,
    glass: ramp("#1a2e58", "#3a78c8", "#a8e0ff"),
    roofs: [ramp("#122046", "#1c3570", "#2a52a0", "#4078c8", "#70a8e8"), ramp("#5a3810", "#9a6418", "#d8a02c", "#ffd45e", "#fff2b4"), ramp("#2a3448", "#3e4a64", "#56647e", "#74829c", "#98a6be")],
    wood: OAK, moss: GREENMOSS, plaster: ramp("#a89c88", "#cfc4ae", "#e8dfcc", "#faf4e6"),
    cloth: ramp("#16285a", "#24438a", "#3a66bc", "#6a98e0"), cloth2: GOLD.slice(1) as Ramp,
  },
  sol_fort: {
    id: "sol_fort", name: "Рассветный форт", faction: "sol", tier: "fort",
    stone: ramp("#4a4640", "#6a655c", "#8c867a", "#aaa396", "#c4bdae", "#dcd5c6"), mortar: hex("#56514a"),
    masonry: "block", crest: "merlon", trim: IRON,
    glass: ramp("#1a2030", "#2e4a6a", "#ffd27a"),
    roofs: [ramp("#2a1a10", "#4a2e1a", "#6e4628", "#8e6036", "#ae7e4a"), ramp("#1e2436", "#2e3850", "#42506c", "#5c6c8a", "#7c8caa")],
    wood: OAK, moss: GREENMOSS, plaster: ramp("#8a7e6a", "#b0a48c", "#cdc2aa", "#e2d8c2"),
    cloth: ramp("#16285a", "#24438a", "#3a66bc", "#6a98e0"), cloth2: ramp("#e8e0cc", "#f4eedc", "#fffaee", "#ffffff"),
  },
  sol_settle: {
    id: "sol_settle", name: "Поселение Сольгарда", faction: "sol", tier: "settle",
    stone: ramp("#3e3a34", "#5a554c", "#78726a", "#968f84", "#b2ab9e", "#cac3b6"), mortar: hex("#3a3630"),
    masonry: "rubble", crest: "plain", trim: IRON,
    glass: ramp("#1c1a1a", "#3a3020", "#ffd27a"),
    roofs: [ramp("#4a3414", "#765626", "#a07e3a", "#c8a452", "#e6c878"), ramp("#2a1a10", "#4a2e1a", "#6e4628", "#8e6036", "#ae7e4a")],
    wood: ramp("#2e1c10", "#4e321c", "#74502e", "#9a7042", "#be925a"), moss: GREENMOSS, plaster: ramp("#9a8c72", "#c2b496", "#ddd0b2", "#f0e6cc"),
    cloth: ramp("#16285a", "#24438a", "#3a66bc", "#6a98e0"), cloth2: GOLD.slice(1) as Ramp,
  },
  umb_capital: {
    id: "umb_capital", name: "Мортхейм — столица", faction: "umb", tier: "capital",
    stone: ramp("#0c0a12", "#19151f", "#26202e", "#352d40", "#463c54", "#5c506c"), mortar: hex("#08060c"),
    masonry: "gothic", crest: "spike", trim: DIRON,
    glass: ramp("#1a0830", "#7a34d0", "#e0b0ff"),
    roofs: [ramp("#0a0810", "#16101e", "#241a32", "#38284a", "#504066"), ramp("#140c1c", "#24142e", "#3a2048", "#56306a", "#784a8e")],
    wood: DARKWOOD, moss: LICHEN, plaster: ramp("#2a2430", "#3c3444", "#4e4558", "#62586c"),
    cloth: ramp("#1e0c30", "#3a1858", "#5e2a8a", "#8a4cb8"), cloth2: ramp("#3a3a3a", "#6a6a6a", "#a8a8a8", "#dedede"),
  },
  umb_fort: {
    id: "umb_fort", name: "Форт Чёрной Вахты", faction: "umb", tier: "fort",
    stone: ramp("#121016", "#201c24", "#2e2a32", "#3e3942", "#504a54", "#645e68"), mortar: hex("#0a080c"),
    masonry: "block", crest: "spike", trim: IRON,
    glass: ramp("#100818", "#4a2080", "#b080f0"),
    roofs: [ramp("#0e0a0c", "#1c1416", "#2c2022", "#3e2e30", "#544244"), ramp("#0a0810", "#16101e", "#241a32", "#38284a", "#504066")],
    wood: DARKWOOD, moss: LICHEN, plaster: ramp("#2a2628", "#3c3638", "#4e4648", "#625a5a"),
    cloth: ramp("#1e0c30", "#3a1858", "#5e2a8a", "#8a4cb8"), cloth2: ramp("#101010", "#202020", "#383838", "#585858"),
  },
  umb_settle: {
    id: "umb_settle", name: "Поселение Умбрата", faction: "umb", tier: "settle",
    stone: ramp("#16141a", "#24212a", "#34303a", "#46414c", "#5a5460", "#6e6874"), mortar: hex("#0e0c10"),
    masonry: "rubble", crest: "plain", trim: IRON,
    glass: ramp("#100818", "#3a1a60", "#9a6ae0"),
    roofs: [ramp("#1c1610", "#2e2418", "#423622", "#5a4a2e", "#72603c"), ramp("#0e0a0c", "#1c1416", "#2c2022", "#3e2e30", "#544244")],
    wood: ramp("#100c0c", "#201816", "#322622", "#463630", "#5c4a40"), moss: LICHEN, plaster: ramp("#36302c", "#4a423c", "#5e544c", "#72685e"),
    cloth: ramp("#1e0c30", "#3a1858", "#5e2a8a", "#8a4cb8"), cloth2: ramp("#3a3a3a", "#6a6a6a", "#a8a8a8", "#dedede"),
  },
  ember: {
    id: "ember", name: "Эмберхолл", faction: "ember", tier: "capital",
    stone: ramp("#3a2016", "#5c3624", "#82502e", "#a86c3e", "#c88c56", "#e4ae76"), mortar: hex("#3a2418"),
    masonry: "brick", crest: "swallow", trim: COPPER,
    glass: ramp("#2a1008", "#e06a1a", "#ffd890"),
    roofs: [ramp("#3a140c", "#6a2414", "#9a3a1c", "#c85a2c", "#e8844a"), ramp("#1e1a1c", "#302a2c", "#463e3e", "#5e5452", "#786c68")],
    wood: OAK, moss: ASHMOSS, plaster: ramp("#9a7a5a", "#c09a74", "#dcb890", "#f0d2aa"),
    cloth: ramp("#4a1208", "#7e2410", "#b8401a", "#e8702e"), cloth2: COPPER.slice(1) as Ramp,
  },
};

export const OUT: RGBA = hex("#141018");
export const SHADOW: RGBA = [10, 6, 16, 255];

/** Тон рампы с дробным индексом и ограничением. */
export function tone(r: Ramp, i: number): RGBA {
  const k = Math.max(0, Math.min(r.length - 1, i));
  const a = Math.floor(k), b = Math.min(r.length - 1, a + 1);
  return k - a < 0.5 ? r[a] : r[b];
}
/** Затемнение пикселя на месте (тени, глубина). */
export function darken(c: PC, x: number, y: number, k: number) {
  const p = c.get(x, y);
  if (!p || !p[3]) return;
  const i = (y * c.w + x) * 4;
  c.data[i] = p[0] * k; c.data[i + 1] = p[1] * k; c.data[i + 2] = p[2] * k;
}
export function tint(c: PC, x: number, y: number, col: RGBA, t: number) {
  const p = c.get(x, y);
  if (!p || !p[3]) return;
  const m = mix(p, col, t);
  const i = (y * c.w + x) * 4;
  c.data[i] = m[0]; c.data[i + 1] = m[1]; c.data[i + 2] = m[2];
}

// ---------------- кладка: бесшовные тайлы ----------------
/** Тайл кладки 32×32 (период 32 по обеим осям): блоки с фаской сверху слева, тенью снизу справа, швами и выбоинами. */
export function masonryTile(look: Look, kind: Masonry = look.masonry, seed = 1, lift = 0): PC {
  const c = new PC(32, 32), S = look.stone;
  if (kind === "rubble") return rubbleTile(look, seed, lift);
  const rows = kind === "brick" ? [4, 4, 4, 4, 4, 4, 4, 4] : kind === "ashlar" ? [8, 8, 8, 8] : kind === "gothic" ? [6, 10, 6, 10] : [11, 10, 11];
  const [minW, maxW] = kind === "brick" ? [7, 9] : kind === "ashlar" ? [12, 18] : kind === "gothic" ? [8, 12] : [10, 20];
  let y = 0;
  rows.forEach((rh, ri) => {
    // ширины блоков ряда, сумма 32, сдвиг ряда
    const ws: number[] = [];
    let sum = 0, k = 0;
    while (sum < 32) {
      let w = minW + Math.floor(hash01(ri, k++, seed) * (maxW - minW + 1));
      if (32 - sum - w < minW && 32 - sum - w !== 0) w = 32 - sum;
      ws.push(w); sum += w;
    }
    const off = kind === "brick" ? (ri % 2) * 4 : Math.floor(hash01(ri, 77, seed) * 32);
    let x = 0;
    ws.forEach((w, bi) => {
      const base = 2 + lift + (hash01(ri * 31 + bi, 5, seed) < 0.3 ? -0.6 : hash01(ri * 31 + bi, 6, seed) < 0.3 ? 0.6 : 0)
        + (kind === "brick" && hash01(ri * 31 + bi, 9, seed) < 0.12 ? -1 : 0);
      for (let j = 0; j < rh; j++) for (let i = 0; i < w; i++) {
        const px = (x + i + off) % 32, py = y + j;
        let v = base;
        if (j === rh - 1 || i === w - 1) { c.set(px, py, look.mortar); continue; }
        if (j === 0) v += 1.3;
        else if (i === 0) v += 0.7;
        else if (j === rh - 2 || i === w - 2) v -= 0.8;
        const n = pnoise(px, py, 4, 32, seed + ri) - 0.5;
        v += n * 0.9;
        const h = hash01(px, py, seed + 13);
        if (h < 0.035) v -= 1.2; // выбоина
        else if (h > 0.975) v += 0.8; // блик
        c.set(px, py, tone(S, v));
      }
      x += w;
    });
    y += rh;
  });
  return c;
}

/** Бут: неровные камни разной величины (ячейки Вороного, период 32) — поселения и фундаменты. */
function rubbleTile(look: Look, seed: number, lift: number): PC {
  const c = new PC(32, 32), S = look.stone;
  const pts: [number, number, number][] = [];
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++)
    pts.push([gx * 8 + 1 + hash01(gx, gy, seed) * 6, gy * 8 + 1 + hash01(gy, gx, seed + 1) * 6, hash01(gx, gy, seed + 2)]);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0;
    pts.forEach((p, i) => {
      for (const ox of [-32, 0, 32]) for (const oy of [-32, 0, 32]) {
        const dx = x + 0.5 - (p[0] + ox), dy = (y + 0.5 - (p[1] + oy)) * 1.35;
        const d = Math.hypot(dx, dy);
        if (d < d1) { d2 = d1; d1 = d; best = i; bx = dx; by = dy; } else if (d < d2) d2 = d;
      }
    });
    if (d2 - d1 < 1.1) { c.set(x, y, look.mortar); continue; }
    let v = 2 + lift + (pts[best][2] - 0.5) * 1.4;
    const r = Math.max(d1, 0.5);
    v += (-by / 5 - bx / 9) * 0.9 * Math.min(1, r / 3);
    if (d2 - d1 < 2.2) v -= 0.7;
    v += (pnoise(x, y, 4, 32, seed + 3) - 0.5) * 0.8;
    c.set(x, y, tone(S, v));
  }
  return c;
}

/** Плиты верха стены и площадок (светлее фасада: на них падает свет сверху). */
export function slabTile(look: Look, seed = 2): PC {
  const c = new PC(32, 32), S = look.stone;
  for (let ry = 0; ry < 4; ry++) {
    const off = (ry % 2) * 8;
    for (let bx = 0; bx < 2; bx++) {
      const base = 3.4 + (hash01(ry, bx, seed) - 0.5) * 0.6;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 16; i++) {
        const px = (bx * 16 + i + off) % 32, py = ry * 8 + j;
        if (j === 7 || i === 15) { c.set(px, py, tone(S, 2.2)); continue; }
        let v = base + (j === 0 ? 0.6 : 0) + (pnoise(px, py, 4, 32, seed) - 0.5) * 0.8;
        if (hash01(px, py, seed + 5) < 0.03) v -= 1;
        c.set(px, py, tone(S, v));
      }
    }
  }
  return c;
}

/** Выборка из тайла с повтором. */
export const tex = (t: PC, x: number, y: number) => t.get(((x % t.w) + t.w) % t.w, ((y % t.h) + t.h) % t.h)!;

/** Заливка прямоугольника тайлом со сдвигом и множителем яркости по вертикали (затенение у земли, под карнизом). */
export function fillTex(c: PC, t: PC, x0: number, y0: number, w: number, h: number, ox = 0, oy = 0, light?: (x: number, y: number) => number) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const p = tex(t, x + ox, y + oy);
    const k = light ? light(x - x0, y - y0) : 1;
    c.set(x, y, k === 1 ? p : shade(p, k));
  }
}

// ---------------- износ ----------------
/** Трещина: ломаная тёмная линия со светлой кромкой снизу. */
export function crack(c: PC, x: number, y: number, len: number, seed: number, dark: RGBA, lit: RGBA) {
  let px = x, py = y;
  for (let s = 0; s < len; s++) {
    c.set(px, py, dark);
    c.set(px + 1, py, withA(lit, 120));
    const h = hash01(s, seed, 7);
    py += 1;
    px += h < 0.33 ? -1 : h > 0.66 ? 1 : 0;
    if (hash01(s, seed, 8) < 0.12) { // ответвление
      let qx = px, qy = py;
      const dir = hash01(s, seed, 9) < 0.5 ? -1 : 1;
      for (let k = 0; k < 4; k++) { qx += dir; qy += hash01(k, s, seed) < 0.5 ? 1 : 0; c.set(qx, qy, dark); }
    }
  }
}

/** Мох: пятна на верхних гранях и у земли — только по непрозрачным пикселям, гуще у верха/низа зоны. */
export function mossPatch(c: PC, x0: number, y0: number, w: number, h: number, look: Look, seed: number, fromTop = true) {
  const M = look.moss;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (!c.alpha(x, y)) continue;
    const t = fromTop ? (y - y0) / h : 1 - (y - y0) / h;
    const n = pnoise(x, y, 5, 64, seed) * 0.8 + hash01(x, y, seed) * 0.2;
    if (n - t * 0.55 > 0.5) c.set(x, y, M[n - t * 0.55 > 0.68 ? 2 : n - t * 0.55 > 0.58 ? 1 : 0]);
  }
}

/** Плющ: побеги свисают сверху вниз с листьями двух тонов. */
export function ivy(c: PC, x0: number, y0: number, w: number, maxLen: number, seed: number, leaf: Ramp = ramp("#173a1c", "#2a5e28", "#46883a", "#72b04c")) {
  const vines = Math.max(1, Math.floor(w / 9));
  for (let v = 0; v < vines; v++) {
    let x = x0 + Math.floor(hash01(v, seed, 1) * w), y = y0;
    const len = Math.floor(maxLen * (0.45 + hash01(v, seed, 2) * 0.55));
    for (let s = 0; s < len; s++) {
      if (c.alpha(x, y)) c.set(x, y, leaf[0]);
      if (hash01(s, v, seed) < 0.55) {
        const lx = x + (hash01(s, v, seed + 1) < 0.5 ? -1 : 1);
        for (const [dx, dy, t] of [[0, 0, 2], [1, 0, 1], [0, 1, 1], [-1, 0, 2], [0, -1, 3]] as const)
          if (c.alpha(lx + dx, y + dy)) c.set(lx + dx, y + dy, leaf[t]);
      }
      y++;
      const h = hash01(s, v, seed + 3);
      x += h < 0.2 ? -1 : h > 0.8 ? 1 : 0;
      x = Math.max(x0, Math.min(x0 + w - 1, x));
    }
  }
}

/** Заплатка: прямоугольник кладки другого тона (свежий камень или кирпич) с тёмной кромкой. */
export function patch(c: PC, x: number, y: number, w: number, h: number, look: Look, seed: number, kind: Masonry = "brick", lift = 0.6) {
  const t = masonryTile(look, kind, seed + 50, lift);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!c.alpha(x + i, y + j)) continue;
    const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1;
    c.set(x + i, y + j, edge ? look.mortar : tex(t, i, j));
  }
}

/** Скол: выщербленный угол — пиксели убираются по неровной границе, кромка затеняется. */
export function chip(c: PC, x: number, y: number, r: number, seed: number) {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const d = Math.hypot(i, j) + hash01(i, j, seed) * 1.6;
    if (d < r * 0.8) c.clear(x + i, y + j);
    else if (d < r * 1.1) darken(c, x + i, y + j, 0.7);
  }
}

/** Мягкая тень у основания (полупрозрачная полоса). */
export function groundShadow(c: PC, x: number, y: number, w: number, h: number, a = 110) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const t = 1 - j / h;
    const edge = Math.min(1, Math.min(i + 1, w - i) / 3);
    c.set(x + i, y + j, withA(SHADOW, a * t * edge));
  }
}

/** Контур только по внешнему краю силуэта (как у паков: тёмный, но не чёрный). */
export const outlined = (c: PC, col: RGBA = OUT) => c.outline(col);
export { PC, hash01, hex, mix, ramp, shade, withA, pnoise };
export type { RGBA, Ramp };

/** Переход к земле (задача 141, правки 2: «стены будто висят»): контактная тень на нижних рядах цоколя, полоса утоптанной земли
 *  с неровным краем у основания и пучки травы, заходящие на цоколь. y — низ цоколя; ниже рисуется до 4 рядов. */
export function groundHug(c: PC, x0: number, w: number, y: number, look: Look, seed: number) {
  const dirt = ramp("#3e2a1c", "#5a3e28", "#76553a"), grass = look.faction === "umb" ? ramp("#1c2a1e", "#2a3e2a", "#3c5636") : ramp("#2c5530", "#3b6e36", "#4f873c", "#6aa245");
  for (let x = x0; x < x0 + w; x++) {
    for (const [dy, k] of [[-1, 0.62], [-2, 0.74], [-3, 0.86]] as const) darken(c, x, y + dy, k);
    const ragged = hash01(x, 1, seed) < 0.3 ? 1 : 0;
    for (let j = 0; j < 4; j++) {
      const a = [200, 170, 120, 60][j];
      if (j === 0 && ragged) continue;
      c.set(x, y + j, withA(dirt[Math.min(2, j === 0 ? 0 : 1 + (hash01(x, j, seed) < 0.4 ? 1 : 0))], a));
    }
    const h = hash01(x, 7, seed);
    if (h < 0.28) { const t = 1 + Math.floor(hash01(x, 9, seed) * 3); for (let k = 0; k < t; k++) c.set(x, y + 1 - k, grass[Math.min(grass.length - 1, k + 1)]); }
  }
}
