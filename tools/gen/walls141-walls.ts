/**
 * Задача 141, этап 1: стены, башни, ворота и частокол нового вида (превью; в игру не ставятся, старые генераторы не тронуты).
 *   Стена H (44×86, нахлёст 6 px): верх — плиты прохода с задним бортиком, передний парапет с зубцами (у Сольгарда прямые, у Умбрата
 *   заострённые с шипом, у Эмберхолла — «ласточкин хвост»), карниз, фасад кладки, цоколь, тень. Опора — низ середины.
 *   Стена V (40×86): сверху — полоса прохода с парапетами по бокам, ниже — торец (виден только у последней клетки).
 *   Башня (80×200, тело шире следа): квадратная или круглая; верх — зубцы, конус, купол, шпиль или деревянная галерея.
 *   Ворота (96×146): надвратная арка; кадры створок — закрыто, открыто, разбито (этап 2 сделает их открываемыми).
 *   Частокол (поселения): H 32×64, V 32×88 столб 32×96 и ворота 160×112 с теми же тремя кадрами.
 */
import {
  type Look, type Wear, type Ramp, type RGBA, LOOKS, OUT, PC, chip, crack, darken, fillTex, groundShadow, hash01, hex, ivy,
  masonryTile, mix, mossPatch, patch, pnoise, shade, slabTile, tex, tint, tone, withA, groundHug, ramp,
} from "./walls141-lib";

export const WALL_H = 86;
const FACE_Y = 42; // карниз фасада
const BASE_Y = 82; // низ цоколя (дальше переход к земле: тень, земля, трава)

/** Передний парапет с зубцами по ширине w (период 16 — бесшовно между клетками). */
function crest(c: PC, look: Look, x0: number, w: number, yCap: number, face: PC, seed: number) {
  const S = look.stone;
  // непрерывный парапет между зубцами
  const pc = yCap + 9;
  for (let x = x0; x < x0 + w; x++) {
    c.set(x, pc, S[4]); c.set(x, pc + 1, S[3]);
    for (let y = pc + 2; y < FACE_Y; y++) c.set(x, y, shade(tex(face, x, y), y === pc + 2 ? 0.8 : 0.95));
  }
  if (look.crest === "plain") return;
  for (let x = x0; x < x0 + w; x++) for (let y = yCap - 6; y < pc; y++) darken(c, x, y, y > pc - 4 ? 0.62 : 0.8);
  const edge = mix(OUT, S[0], 0.5);
  for (let gx = x0 - 16; gx < x0 + w; gx += 16) {
    const mx = gx + 3, mw = look.crest === "spike" ? 8 : 10;
    const mx0 = Math.max(x0, mx), mx1 = Math.min(x0 + w, mx + mw);
    if (mx1 <= mx0) continue;
    for (let x = mx0; x < mx1; x++) {
      const i = x - mx, lit = i < 2, dark = i >= mw - 1;
      let top = yCap;
      if (look.crest === "spike") top = yCap - 5 + Math.abs(i - (mw - 1) / 2) * 1.4;
      if (look.crest === "swallow") top = yCap - 2 + Math.max(0, 3 - Math.abs(i - (mw - 1) / 2) * 1.2);
      top = Math.round(top);
      for (let y = top; y < pc; y++) {
        let col: RGBA;
        if (y < top + 2) col = look.crest === "spike" ? (i < mw / 2 ? S[4] : S[2]) : y === top ? S[5] : S[4];
        else if (look.crest === "spike" && y < yCap + 1) col = i < mw / 2 ? S[3] : S[2];
        else col = shade(tex(face, x, y), lit ? 1.08 : dark ? 0.78 : 1);
        c.set(x, y, col);
      }
      if (look.crest === "spike" && i === Math.floor(mw / 2)) { c.set(x, top - 1, look.trim[3]); c.set(x, top - 2, look.trim[4]); }
      else if (x >= x0 && x < x0 + w) c.set(x, top - 1, edge);
    }
    for (let y = yCap - 1; y < pc; y++) for (const ex of [mx - 1, mx + mw]) if (ex >= x0 && ex < x0 + w && y >= yCap + (look.crest === "spike" ? 0 : 0)) c.set(ex, y, edge);
    // тень зубца на парапет справа
    for (let y = pc; y < pc + 4; y++) for (const dx of [0, 1]) darken(c, mx + mw + dx, y, 0.72);
    // бойница в зубце у фортов
    if (look.tier === "fort") for (let y = yCap + 4; y < yCap + 9; y++) { const x = mx + (mw >> 1); if (x >= x0 && x < x0 + w) c.set(x, y, OUT); }
  }
}

/** Карниз, фасад, цоколь и тень от y0 вниз по ширине w. feature: бойница, знак или ничего. */
function facade(c: PC, look: Look, x0: number, w: number, y0: number, yBase: number, face: PC, feature: string, seed: number) {
  const S = look.stone, T = look.trim;
  // карниз: верхняя кромка светлая, полоса отделки (золото, оковка, медь), тень под выступом
  for (let x = x0; x < x0 + w; x++) {
    c.set(x, y0, S[5]);
    c.set(x, y0 + 1, look.tier === "capital" ? T[3] : S[3]);
    c.set(x, y0 + 2, look.tier === "capital" ? T[1] : S[1]);
  }
  const plinth = masonryTile(look, look.masonry === "brick" ? "block" : "block", seed + 9, -0.4);
  fillTex(c, face, x0, y0 + 3, w, yBase - y0 - 9, 0, 0, (_x, y) => (y < 2 ? 0.74 : y < 4 ? 0.88 : 1 - (y / (yBase - y0)) * 0.12));
  // цоколь с фаской
  for (let x = x0; x < x0 + w; x++) {
    c.set(x, yBase - 6, S[4]); c.set(x, yBase - 5, S[2]);
    for (let y = yBase - 4; y < yBase; y++) c.set(x, y, shade(tex(plinth, x, y), y === yBase - 1 ? 0.7 : 0.92));
  }
  const cx = x0 + (w >> 1);
  if (feature === "slit") {
    for (let y = y0 + 10; y < y0 + 23; y++) {
      const wide = y > y0 + 15 && y < y0 + 18 ? 2 : 0;
      for (let x = cx - 1 - wide; x <= cx + wide; x++) c.set(x, y, look.faction === "umb" && y > y0 + 13 ? mix(OUT, look.glass[1], 0.5) : OUT);
      c.set(cx - 2 - wide, y, S[4]);
      c.set(cx + 1 + wide, y, S[1]);
    }
    for (let x = cx - 2; x <= cx + 1; x++) c.set(x, y0 + 9, S[5]);
  } else if (feature === "emblem") {
    const ey = y0 + 15;
    if (look.faction === "sol") {
      c.ellipse(cx, ey, 4.5, 4.5, look.trim[1]);
      c.ellipse(cx, ey, 3.5, 3.5, look.trim[3]);
      c.ellipse(cx - 0.6, ey - 0.6, 1.6, 1.6, look.trim[4]);
      for (const [dx, dy] of [[0, -6], [0, 6], [-6, 0], [6, 0], [-4, -4], [4, 4], [4, -4], [-4, 4]]) c.set(cx + dx, ey + dy, look.trim[2]);
    } else if (look.faction === "umb") {
      // руна в камне: светится фиолетовым
      const g = look.glass;
      for (const [dx, dy] of [[0, -5], [0, -4], [0, -3], [0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [0, 3], [-2, -3], [2, -3], [-1, -4], [1, -4], [-2, 1], [2, 1], [-3, 2], [3, 2]])
        c.set(cx + dx, ey + dy, dy < 0 ? g[2] : g[1]);
      for (const [dx, dy] of [[-1, -5], [1, -5], [-1, 3], [1, 3]]) tint(c, cx + dx, ey + dy, g[1], 0.5);
    } else {
      // медная решётка-отдушина Эмберхолла с отсветом огня
      c.rect(cx - 4, ey - 4, 8, 8, look.trim[0]);
      c.rect(cx - 3, ey - 3, 6, 6, look.glass[1]);
      c.rect(cx - 2, ey - 1, 4, 3, look.glass[2]);
      for (const d of [-2, 0, 2]) c.rect(cx + d, ey - 3, 1, 6, look.trim[2]);
      c.rect(cx - 4, ey - 4, 8, 1, look.trim[3]);
    }
  } else if (feature === "putlog") {
    for (const dx of [-10, 6]) { c.rect(cx + dx, y0 + 8, 3, 3, OUT); c.rect(cx + dx, y0 + 7, 3, 1, S[4]); }
  }
  groundHug(c, x0, w, yBase, look, seed + x0);
}

/** Износ поверх готового сегмента стены. */
export function wearWall(c: PC, look: Look, wear: Wear, seed: number, x0 = 0, w = 32, faceY = FACE_Y, base = BASE_Y) {
  const S = look.stone;
  if (wear === "crack") {
    crack(c, x0 + 6 + Math.floor(hash01(seed, 1, 3) * (w - 12)), faceY + 4, 16 + Math.floor(hash01(seed, 2, 3) * 14), seed, mix(OUT, S[0], 0.4), S[4]);
    if (w > 40) crack(c, x0 + Math.floor(w * 0.7), faceY + 10, 18, seed + 9, mix(OUT, S[0], 0.4), S[4]);
  } else if (wear === "moss") {
    mossPatch(c, x0, 0, w, faceY + 6, look, seed, false);
    mossPatch(c, x0, base - 18, w, 18, look, seed + 4, false);
  } else if (wear === "ivy") {
    ivy(c, x0 + 2, faceY + 1, w - 4, base - faceY - 4, seed);
    mossPatch(c, x0, base - 8, w, 8, look, seed + 2, false);
  } else if (wear === "patch") {
    const pw = Math.min(w - 8, 12 + Math.floor(hash01(seed, 5, 1) * 8)), ph = 9 + Math.floor(hash01(seed, 6, 1) * 6);
    patch(c, x0 + 4 + Math.floor(hash01(seed, 7, 1) * (w - pw - 8)), faceY + 8 + Math.floor(hash01(seed, 8, 1) * 10), pw, ph, look, seed,
      look.masonry === "brick" ? "ashlar" : look.masonry === "rubble" ? "brick" : look.faction === "ember" ? "ashlar" : "brick", 0.4);
  } else if (wear === "chip") {
    chip(c, x0 + 3 + Math.floor(hash01(seed, 3, 9) * (w - 10)), faceY - 19, 4, seed);
    chip(c, x0 + Math.floor(hash01(seed, 4, 9) * w), faceY + 2, 3, seed + 1);
    crack(c, x0 + Math.floor(w / 2), faceY + 3, 9, seed + 2, mix(OUT, S[0], 0.4), S[4]);
    // крошка у подножия
    for (let i = 0; i < 6; i++) { const x = x0 + Math.floor(hash01(i, seed, 6) * w), y = base - 1 + Math.floor(hash01(i, seed, 7) * 4); c.rect(x, y, 2, 2, S[2]); c.set(x, y, S[4]); }
  }
}

/** Горизонтальный сегмент стены 32×76. feature — "none" | "slit" | "emblem" | "putlog". */
export function wallH(look: Look, wear: Wear = "clean", seed = 1, feature = "none"): PC {
  // кадр 44 px: на 6 px шире клетки с каждой стороны (кладка и зубцы периодичны — нахлёст с соседями бесшовный, торцы уходят под башни)
  const src = wallHWide(look, wear, seed, feature), c = new PC(WALL_HW, WALL_H);
  for (let y = 0; y < WALL_H; y++) for (let x = 0; x < WALL_HW; x++) { const p = src.get(26 + x, y)!; if (p[3]) c.set(x, y, p); }
  return c;
}
export const WALL_HW = 44;
function wallHWide(look: Look, wear: Wear, seed: number, feature: string): PC {
  const c = new PC(96, WALL_H), S = look.stone;
  const face = masonryTile(look, look.masonry, 11), top = slabTile(look, 12);
  // задний бортик
  for (let x = 0; x < 96; x++) { c.set(x, 0, S[4]); c.set(x, 1, S[3]); c.set(x, 2, S[1]); }
  // проход: плиты, к переднему парапету темнее
  fillTex(c, top, 0, 3, 96, 28, 0, 0, (_x, y) => (y < 2 ? 0.8 : y > 21 ? 0.82 : 1));
  crest(c, look, 0, 96, 23, face, seed);
  const f = new PC(96, WALL_H);
  facade(f, look, 0, 96, FACE_Y, BASE_Y, face, "none", seed);
  c.blit(f, 0, 0);
  if (feature !== "none") { const g = new PC(96, WALL_H); facade(g, look, 32, 32, FACE_Y, BASE_Y, face, feature, seed); for (let y = FACE_Y; y < BASE_Y; y++) for (let x = 32; x < 64; x++) { const p = g.get(x, y)!; if (p[3]) c.set(x, y, p); } }
  wearWall(c, look, wear === "chip" && look.faction === "ember" ? "crack" : wear, seed, 32, 32);
  return c;
}

/** Вертикальный сегмент стены 40×86 (шире клетки на 4 px с каждой стороны): сверху проход с толстыми парапетами и зубцами
 *  по обе стороны (период 16 px — стык с соседними клетками ровный), ниже — торец (виден только у последней клетки ряда). */
export function wallV(look: Look, wear: Wear = "clean", seed = 1): PC {
  const VW = 40, c = new PC(VW, WALL_H), S = look.stone;
  const face = masonryTile(look, look.masonry, 11), top = slabTile(look, 12);
  facade(c, look, 0, VW, FACE_Y, BASE_Y, face, "none", seed);
  // полоса прохода
  fillTex(c, top, 10, 0, 20, FACE_Y, 8, 0, (x) => (x < 4 ? 0.72 : x > 16 ? 0.88 : 1));
  for (const [px, outer] of [[0, 0], [30, 9]] as const) {
    // парапет 10 px: внешняя грань тёмная, верх светлый, внутренняя кромка
    for (let y = 0; y < FACE_Y; y++) {
      for (let x = px; x < px + 10; x++) {
        const i = x - px;
        let col: RGBA = tone(S, 3.3 + (pnoise(x, y, 4, 32, seed) - 0.5) * 0.8);
        if (i === outer) col = OUT;
        else if ((outer === 0 && i === 1) || (outer === 9 && i === 8)) col = outer === 0 ? S[2] : S[1];
        else if ((outer === 0 && i === 9) || (outer === 9 && i === 0)) col = outer === 0 ? S[1] : S[4];
        else if ((outer === 0 && i === 2) || (outer === 9 && i === 1)) col = S[5];
        c.set(x, y, col);
      }
    }
    if (look.crest === "plain") continue;
    for (const k of [0, 16, 32]) {
      const y0 = k + 1;
      if (y0 + 10 > FACE_Y + 4) continue;
      for (let x = px + 1; x < px + 9; x++) {
        for (let y = y0; y < Math.min(FACE_Y, y0 + 6); y++) c.set(x, y, y === y0 ? S[5] : x === px + 1 ? S[5] : S[4]);
        for (let y = y0 + 6; y < Math.min(FACE_Y, y0 + 10); y++) c.set(x, y, shade(tex(face, x, y), x === px + 8 ? 0.78 : 1));
      }
      if (look.crest === "spike") { const mx = px + 4; c.set(mx, y0 + 2, look.trim[3]); c.set(mx, y0 + 1, look.trim[4]); c.set(mx - 1, y0 + 3, look.trim[2]); c.set(mx, y0 + 3, look.trim[2]); }
      if (look.crest === "swallow") for (const d of [-1, 0]) { c.set(px + 4 + d, y0, S[2]); c.set(px + 4 + d, y0 + 1, S[3]); }
      for (let y = y0; y < Math.min(FACE_Y, y0 + 10); y++) { c.set(px, y, OUT); c.set(px + 9, y, mix(OUT, S[0], 0.5)); }
      // тень зубца вправо-вниз на проход (у левого парапета) или на внутреннюю кромку (у правого)
      if (px === 0) for (let y = y0 + 3; y < Math.min(FACE_Y, y0 + 13); y++) for (let dx = 0; dx < 4; dx++) darken(c, px + 10 + dx, y, 0.72);
    }
  }
  if (wear !== "patch") wearWall(c, look, wear === "ivy" ? "moss" : wear, seed, 0, VW);
  else patch(c, 11, 6 + Math.floor(hash01(seed, 1, 1) * 14), 18, 10, look, seed, "brick", 0.4);
  return c;
}

// ---------------- башни ----------------
export type TowerTop = "crest" | "cone" | "dome" | "spire" | "hoard" | "pyramid";

/** Конусная кровля над окружностью (cx, yb), полуширина r, высота h: ряды черепицы с чешуёй, свет слева. */
function coneRoof(c: PC, cx: number, yb: number, r: number, h: number, R: Ramp, seed: number, scale = true) {
  for (let y = Math.floor(yb - h); y <= yb + 6; y++) {
    const t = (y - (yb - h)) / h; // 0 у вершины, 1 у карниза
    const hw = r * Math.min(1, Math.max(0, t));
    const ell = y > yb ? Math.sqrt(Math.max(0, 1 - ((y - yb) / 6) ** 2)) : 1;
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx;
      if (y <= yb ? Math.abs(dx) > hw : Math.abs(dx) > r * ell) continue;
      const u = hw > 0.5 ? dx / Math.max(hw, r * ell * (y > yb ? 1 : 0)) : 0;
      const uu = Math.max(-1, Math.min(1, y <= yb ? dx / Math.max(1, hw) : dx / r));
      const lam = -0.65 * uu + 0.75 * Math.sqrt(1 - uu * uu);
      let v = 1 + lam * 2.6;
      // ряды черепицы: по длине ската, чешуя по окружности
      const row = Math.floor((y - (yb - h)) / 5);
      const col = Math.floor(((Math.asin(uu) / Math.PI) * 24 + (row % 2) * 0.5) + 100);
      const fy = ((y - (yb - h)) % 5);
      const fx = ((Math.asin(uu) / Math.PI) * 24 + (row % 2) * 0.5 + 100) - col;
      if (scale && fy === 4) v -= 1.1;
      else if (scale && Math.abs(fx - 0.5) > 0.42 && fy > 1) v -= 0.7;
      if (fy === 0) v += 0.4;
      if (hash01(col, row, seed) < 0.08) v -= 0.5;
      void u;
      c.set(x, y, tone(R, v));
    }
  }
  // карниз: тёмная кромка
  for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const ell = Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / r) ** 2));
    c.set(x, Math.round(yb + 6 * ell), R[0]);
  }
}

/** Навершие: золотой шар с шипом (Сольгард), шип с кольцом (Умбрат), медный флюгер-пламя (Эмберхолл). */
function finial(c: PC, look: Look, cx: number, y: number) {
  const T = look.trim;
  if (look.faction === "sol") {
    c.rect(cx - 1, y - 10, 2, 10, T[1]);
    c.shadedEllipse(cx, y - 11, 3, 3, T);
    c.rect(cx, y - 19, 1, 6, T[3]);
  } else if (look.faction === "umb") {
    c.poly([[cx - 2, y], [cx + 2, y], [cx, y - 22]], (x) => (x < cx ? T[3] : T[1]));
    c.ellipse(cx, y - 9, 3, 1.2, look.glass[1]);
    c.set(cx, y - 10, look.glass[2]);
  } else {
    c.rect(cx - 1, y - 8, 2, 8, T[1]);
    c.poly([[cx - 4, y - 8], [cx + 4, y - 8], [cx + 2, y - 14], [cx + 1, y - 11], [cx, y - 18], [cx - 2, y - 12], [cx - 3, y - 14]], (x, yy) => (yy < y - 12 ? look.glass[2] : x < cx ? T[3] : T[2]));
  }
}

/** Ширина кадра башни: тело 72 px шире следа (64) на 4 px с каждой стороны — перекрывает торцы стен и ворот (стык без щели). */
export const TOWER_W = 80;

/** Квадратная башня 80×200 (след 2×2): площадка с зубцами или кровля, машикули, фасад с окном, бойницей и угловым рустом. */
export function towerSquare(look: Look, topKind: TowerTop, wear: Wear = "clean", seed = 1): PC {
  const H = 200, WD = TOWER_W, c = new PC(WD, H), S = look.stone;
  const face = masonryTile(look, look.masonry, 21), top = slabTile(look, 22);
  const base = H - 4, bodyTop = base - 92, bx0 = 4, bx1 = WD - 4, cx = WD / 2;
  fillTex(c, face, bx0, bodyTop, bx1 - bx0, base - bodyTop - 6, 0, 0, (x, y) => (y < 3 ? 0.72 : 1 - (y / 92) * 0.12) * (x > bx1 - bx0 - 9 ? 0.82 : x < 2 ? 1.1 : 1));
  // угловой руст
  if (look.tier !== "settle") for (let y = bodyTop + 3, k = 0; y < base - 6; y += 8, k++) {
    for (const [x0, flip] of [[bx0, false], [bx1, true]] as const) {
      const w = k % 2 ? 6 : 10;
      for (let j = 0; j < 7; j++) for (let i = 0; i < w; i++) {
        const x = flip ? x0 - 1 - i : x0 + i;
        c.set(x, y + j, tone(S, 3.3 + (j === 0 ? 1.2 : 0) + (i === 0 && !flip ? 0.8 : 0) - (j === 6 ? 1.8 : 0) - (flip ? 0.9 : 0)));
      }
    }
  }
  for (let x = bx0 - 1; x < bx1 + 1; x++) {
    c.set(x, base - 7, S[4]); c.set(x, base - 6, S[2]);
    for (let y = base - 5; y < base; y++) c.set(x, y, tone(S, 1.6 + (y === base - 1 ? -1 : 0) + (pnoise(x, y, 3, 64, seed) - 0.5)));
  }
  archWindow(c, look, cx, bodyTop + 16, 6, 16);
  slit(c, look, cx, bodyTop + 52, 14);
  if (look.tier === "capital") {
    const g = new PC(WD, H);
    facade(g, look, cx - 10, 20, bodyTop + 30, bodyTop + 50, face, "emblem", seed);
    for (let y = bodyTop + 38; y < bodyTop + 52; y++) for (let x = cx - 8; x < cx + 8; x++) { const p = g.get(x, y)!; if (p[3] && (p[0] !== tex(face, x, y)[0] || p[1] !== tex(face, x, y)[1])) c.set(x, y, p); }
  }
  const mY = bodyTop - 8;
  for (let x = 0; x < WD; x++) {
    c.set(x, mY, S[5]); c.set(x, mY + 1, S[4]);
    const k = (x + 2) % 8;
    for (let y = mY + 2; y < bodyTop; y++) c.set(x, y, k < 4 ? tone(S, 3 - (y - mY) * 0.25 + (k === 0 ? 0.7 : 0)) : OUT);
  }
  for (let x = bx0; x < bx1; x++) { darken(c, x, bodyTop, 0.6); darken(c, x, bodyTop + 1, 0.8); }
  if (topKind === "hoard") {
    const W = look.wood;
    for (let x = 0; x < WD; x++) for (let y = mY - 14; y < mY + 2; y++) {
      const plank = Math.floor(x / 5);
      let v = 2.4 + (hash01(plank, 3, seed) - 0.5) + (x % 5 === 4 ? -1.2 : 0) + (y === mY - 14 ? 1 : 0) + (y > mY - 1 ? -1 : 0);
      if ((x + 6) % 16 === 0 && y > mY - 10 && y < mY - 3) v = -3;
      c.set(x, y, v < -2 ? OUT : tone(W, v));
    }
    coneRoofPyramid(c, look.roofs[0], cx, mY - 14, cx - 1, 38, seed);
  } else if (topKind === "pyramid") {
    coneRoofPyramid(c, look.roofs[0], cx, mY + 1, cx - 1, 56, seed);
    finial(c, look, cx, mY - 55);
  } else {
    const fy = mY - 30;
    fillTex(c, top, 2, fy, WD - 4, 30, 0, 0, (_x, y) => (y < 6 ? 0.7 : 0.95));
    for (let y = fy - 4; y < mY; y++) for (const x of [0, 1, WD - 2, WD - 1]) c.set(x, y, x === 0 || x === WD - 1 ? OUT : x === 1 ? S[4] : S[1]);
    for (let x = 1; x < WD - 1; x++) { c.set(x, fy - 4, S[5]); for (let y = fy - 3; y < fy; y++) c.set(x, y, S[2]); }
    for (let gx = 3; gx < WD - 4; gx += 14) c.rect(gx, fy - 9, 8, 6, S[4]), c.rect(gx, fy - 9, 8, 1, S[5]), c.rect(gx + 7, fy - 9, 1, 6, S[2]);
    const g = new PC(WD, H);
    crestRow(g, look, 0, WD, mY - 15, face, mY);
    c.blit(g, 0, 0);
    if (topKind === "cone" || topKind === "spire") {
      coneRoof(c, cx, mY - 4, topKind === "spire" ? 30 : cx - 1, topKind === "spire" ? 96 : 68, look.roofs[0], seed);
      finial(c, look, cx, mY - 4 - (topKind === "spire" ? 96 : 68));
      if (topKind === "spire") for (const sx of [7, WD - 7]) { c.poly([[sx - 4, mY - 2], [sx + 4, mY - 2], [sx, mY - 26]], (x) => (x < sx ? look.roofs[0][3] : look.roofs[0][1])); finial(c, look, sx, mY - 24); }
    } else if (topKind === "dome") dome(c, look, cx, mY - 6, 32, 32, look.roofs[1] ?? look.trim, seed);
  }
  c.outline(OUT);
  groundHug(c, bx0 - 1, bx1 - bx0 + 2, base, look, seed);
  towerWear(c, look, wear, seed, bx0, bx1 - bx0, bodyTop, base);
  return c;
}

/** Бойница с откосами: тёмная щель, светлый левый откос, тень справа, расширение посередине, у Умбрата — свечение изнутри. */
function slit(c: PC, look: Look, cx: number, y0: number, h: number) {
  const S = look.stone;
  for (let y = y0; y < y0 + h; y++) {
    const wide = y > y0 + h / 2 - 2 && y < y0 + h / 2 + 1 ? 2 : 0;
    for (let x = cx - 1 - wide; x <= cx + wide; x++) c.set(x, y, look.faction === "umb" && y > y0 + 3 ? mix(OUT, look.glass[1], 0.45) : OUT);
    c.set(cx - 2 - wide, y, S[5]); c.set(cx + 1 + wide, y, S[1]); darken(c, cx + 2 + wide, y + 1, 0.75);
  }
  for (let x = cx - 2; x <= cx + 1; x++) { c.set(x, y0 - 1, S[5]); c.set(x, y0 + h, S[4]); darken(c, x + 1, y0 + h + 1, 0.7); }
}

/** Парапет с зубцами до yEnd (общий с crest, но с заданным низом). */
function crestRow(c: PC, look: Look, x0: number, w: number, yCap: number, face: PC, yEnd: number) {
  const S = look.stone;
  const pc = yCap + 9;
  for (let x = x0; x < x0 + w; x++) {
    c.set(x, pc, S[4]); c.set(x, pc + 1, S[3]);
    for (let y = pc + 2; y < yEnd; y++) c.set(x, y, shade(tex(face, x, y), 0.95));
  }
  for (let gx = x0 + 1; gx < x0 + w - 4; gx += 14) {
    const mw = 9;
    for (let i = 0; i < mw && gx + i < x0 + w; i++) {
      const x = gx + i;
      let topY = yCap;
      if (look.crest === "spike") topY = Math.round(yCap - 5 + Math.abs(i - 4) * 1.4);
      if (look.crest === "swallow") topY = Math.round(yCap - 2 + Math.max(0, 3 - Math.abs(i - 4) * 1.2));
      for (let y = topY; y < pc; y++) c.set(x, y, y < topY + 2 ? (look.crest === "spike" ? (i < 4 ? S[4] : S[2]) : y === topY ? S[5] : S[4]) : shade(tex(face, x, y), i < 2 ? 1.08 : i === mw - 1 ? 0.78 : 1));
      if (look.crest === "spike" && i === 4) { c.set(x, topY - 1, look.trim[3]); c.set(x, topY - 2, look.trim[4]); }
    }
  }
}

/** Пирамидальная (шатровая) кровля над квадратом: два видимых ската, свет слева, ряды черепицы или дранки. */
function coneRoofPyramid(c: PC, R: Ramp, cx: number, yb: number, hw: number, h: number, seed: number) {
  for (let y = yb - h; y <= yb; y++) {
    const t = (y - (yb - h)) / h, w = hw * t;
    for (let x = Math.floor(cx - w); x <= cx + w; x++) {
      const left = x < cx;
      const row = Math.floor((y - yb + h) / 5), fy = (y - yb + h) % 5;
      const along = left ? (cx - x) : (x - cx);
      const col = Math.floor((along / Math.max(1, t)) / 6 + (row % 2) * 0.5);
      let v = left ? 3.1 : 1.7;
      if (fy === 4) v -= 1.1;
      else if (fy === 0) v += 0.5;
      if (Math.abs(((along / Math.max(1, t)) / 6 + (row % 2) * 0.5) - col - 0.5) > 0.44 && fy > 1) v -= 0.6;
      if (hash01(col, row * (left ? 1 : 3), seed) < 0.08) v -= 0.5;
      if (Math.abs(x + 0.5 - cx) < 1) v = 4; // ребро
      c.set(x, y, tone(R, v));
    }
  }
  for (let x = cx - hw; x <= cx + hw; x++) { c.set(x, yb + 1, R[0]); c.set(x, yb + 2, withA(R[0], 120)); }
}

/** Купол с рёбрами (золото Аурелиона). */
function dome(c: PC, look: Look, cx: number, yb: number, rx: number, ry: number, R: Ramp, seed: number) {
  for (let y = yb - ry; y <= yb; y++) for (let x = cx - rx; x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - yb) / ry;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2);
    let lam = -0.55 * dx - 0.45 * dy * -1 * -1 + 0.7 * nz;
    lam = -0.6 * dx + -0.35 * dy + 0.6 * nz;
    let v = 0.6 + lam * 3.6;
    const lon = Math.asin(Math.max(-1, Math.min(1, dx / Math.sqrt(Math.max(0.01, 1 - dy * dy)))));
    if (Math.abs(((lon / Math.PI) * 8 + 10) % 1 - 0.5) > 0.44) v -= 1; // рёбра
    c.set(x, y, tone(R, v));
  }
  for (let x = cx - rx - 2; x <= cx + rx + 2; x++) { c.set(x, yb, look.stone[4]); c.set(x, yb + 1, look.stone[3]); c.set(x, yb + 2, look.stone[1]); }
  finial(c, look, cx, yb - ry);
  void seed;
}

/** Окно-арка с глубиной: свет изнутри растекается по кладке, клинчатая обрамка (свет слева-сверху), откос в тени,
 *  стекло с переплётом и бликом, выступающий подоконник с тенью под ним. */
export function archWindow(c: PC, look: Look, cx: number, y0: number, hw: number, h: number) {
  const G = look.glass, S = look.stone;
  // отсвет изнутри на кладке
  for (let y = y0 - 6; y < y0 + h + 4; y++) for (let x = cx - hw - 6; x < cx + hw + 6; x++) {
    const d = Math.hypot((x + 0.5 - cx) / (hw + 6), (y - (y0 + h * 0.55)) / (h * 0.75));
    if (d < 1) tint(c, x, y, G[1], 0.16 * (1 - d));
  }
  const inside = (x: number, y: number, r: number) => { const dy = y - (y0 + hw), dx = x + 0.5 - cx; return y >= y0 + hw || dx * dx + dy * dy <= r * r; };
  for (let y = y0 - 3; y <= y0 + h + 1; y++) for (let x = cx - hw - 3; x < cx + hw + 3; x++) {
    if (!inside(x, y, hw + 3) || inside(x, y, hw + 0.5) && y < y0 + h && Math.abs(x + 0.5 - cx) < hw) continue;
    const lit = x + 0.5 < cx && y < y0 + hw + 2;
    c.set(x, y, x + 0.5 - cx < -hw - 1.5 || y < y0 - 1 ? S[5] : lit ? S[4] : S[2]);
  }
  for (let y = y0; y < y0 + h; y++) for (let x = cx - hw; x < cx + hw; x++) {
    if (!inside(x, y, hw)) continue;
    const dx = x + 0.5 - cx, inner = Math.hypot(dx / hw, (y - (y0 + h * 0.5)) / (h * 0.5));
    let col = inner < 0.55 ? G[2] : G[1];
    // откос: левый и верхний край в тени
    if (x <= cx - hw + 1 || !inside(x, y - 2, hw)) col = mix(G[0], OUT, 0.35);
    else if (x === cx + hw - 1) col = mix(col, S[3], 0.4);
    if (Math.abs(dx) < 0.6 || y === y0 + Math.floor(h * 0.55)) col = mix(G[0], OUT, 0.2);
    if (x === cx - hw + 2 && y > y0 + hw && y < y0 + hw + 4) col = mix(col, hex("#ffffff"), 0.45);
    c.set(x, y, col);
  }
  for (let x = cx - hw - 3; x < cx + hw + 3; x++) { c.set(x, y0 + h, S[5]); c.set(x, y0 + h + 1, S[2]); darken(c, x + 1, y0 + h + 2, 0.6); darken(c, x + 1, y0 + h + 3, 0.8); }
}

function towerWear(c: PC, look: Look, wear: Wear, seed: number, x0: number, w: number, top: number, base: number) {
  if (wear === "clean") return;
  if (wear === "ivy") { ivy(c, x0 + 4, top + 30, w - 8, base - top - 34, seed); mossPatch(c, x0, base - 14, w, 14, look, seed, false); return; }
  if (wear === "moss") { mossPatch(c, x0, top - 40, w, 44, look, seed, false); mossPatch(c, x0, base - 22, w, 22, look, seed + 2, false); return; }
  wearWall(c, look, wear, seed, x0, w, top + 2, base);
}

/** Круглая башня 64×200: цилиндр с изогнутыми рядами кладки, парапет-кольцо, конус, купол или шпиль. */
export function towerRound(look: Look, topKind: TowerTop, wear: Wear = "clean", seed = 1): PC {
  const H = 200, c = new PC(TOWER_W, H), S = look.stone;
  const face = masonryTile(look, look.masonry, 31);
  const base = H - 8, bodyTop = base - 86, cx = TOWER_W / 2, r = 36, ry = 7, pb = H - 4;
  const cyl = (x: number) => { const u = (x + 0.5 - cx) / r; return { u, z: Math.sqrt(Math.max(0, 1 - u * u)) }; };
  const shadeAt = (u: number, z: number) => 0.6 + 0.5 * Math.max(0, -0.62 * u + 0.78 * z);
  for (let x = cx - r; x < cx + r; x++) {
    const { u, z } = cyl(x), k = shadeAt(u, z);
    const s = Math.round((Math.asin(u) / (Math.PI / 2)) * 52 + 64);
    for (let y = Math.round(bodyTop + ry * z) - 14; y < Math.round(base - ry + ry * z); y++) {
      const ty = Math.round(y - ry * z);
      const parapet = ty < bodyTop;
      let p = tex(face, s, ty);
      let kk = k * (ty < bodyTop + 3 && !parapet ? 0.7 : 1);
      if (parapet) {
        const gap = Math.floor((s + 3) / 9) % 2 === 1;
        if (gap && ty < bodyTop - 7) continue;
        if (ty === bodyTop - 14 || (gap && ty === bodyTop - 7)) p = S[5];
        else if (ty === bodyTop - 13 || (gap && ty === bodyTop - 6)) p = S[4];
      }
      if (ty > base - ry - 7) { p = tone(S, 1.8 + (pnoise(s, ty, 3, 128, seed) - 0.5)); if (ty === base - ry - 6) p = S[4]; }
      c.set(x, y, shade(p, kk));
    }
  }
  // цоколь-плинт: шире тела, верх по кривой цилиндра, низ ровно на линии земли — там же, где низ пролётов стен (H − 6)
  for (let x = cx - r - 2; x < cx + r + 2; x++) {
    const u = Math.max(-1, Math.min(1, (x + 0.5 - cx) / (r + 2))), z = Math.sqrt(Math.max(0, 1 - u * u)), k = shadeAt(u, z);
    const top = Math.round(pb - 12 - ry + ry * z);
    for (let y = top; y < pb; y++) c.set(x, y, shade(tone(S, y === top ? 4.2 : y === top + 1 ? 3 : 2 + (pnoise(x, y, 3, 128, seed) - 0.5) * 0.8 - (y > pb - 2 ? 0.8 : 0)), k));
  }
  // внутренность кольца: пол и задняя стенка парапета
  const ringY = bodyTop - 14;
  if (topKind === "crest" || topKind === "hoard") {
    for (let y = ringY - ry - 8; y <= ringY + ry; y++) for (let x = cx - r + 3; x < cx + r - 3; x++) {
      const dx = (x + 0.5 - cx) / (r - 3), dy = (y - ringY) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if (c.alpha(x, y)) continue;
      c.set(x, y, tone(S, 1.6 - dy));
    }
    for (let x = cx - r; x < cx + r; x++) { const { z } = cyl(x); c.set(x, Math.round(ringY - ry * z), S[5]); c.set(x, Math.round(ringY - ry * z) + 1, S[2]); }
  }
  if (topKind === "cone" || topKind === "spire") {
    coneRoof(c, cx, ringY + 2, topKind === "spire" ? 30 : r + 3, topKind === "spire" ? 100 : 72, look.roofs[0], seed);
    finial(c, look, cx, ringY + 2 - (topKind === "spire" ? 100 : 72));
  } else if (topKind === "dome") dome(c, look, cx, ringY + 2, r, 30, look.roofs[1] ?? look.trim, seed);
  // окна по оси цилиндра и пояс отделки
  archWindow(c, look, cx - 2, bodyTop + 18, 5, 15);
  slit(c, look, cx - 1, bodyTop + 54, 13);
  if (look.tier === "capital") for (let x = cx - r; x < cx + r; x++) {
    const { u, z } = cyl(x), yy = Math.round(bodyTop + 42 + ry * z);
    c.set(x, yy, shade(look.trim[3], shadeAt(u, z) + 0.1)); c.set(x, yy + 1, shade(look.trim[1], shadeAt(u, z)));
  }
  c.outline(OUT);
  groundHug(c, cx - r - 2, 2 * r + 4, pb, look, seed);
  towerWear(c, look, wear, seed, cx - r + 4, 2 * r - 8, bodyTop, base - ry);
  return c;
}

/** Деревянная вышка поселения 64×200: ноги из брёвен с раскосами, площадка с плетнём и соломенная кровля. */
export function watchTower(look: Look, wear: Wear = "clean", seed = 1): PC {
  const H = 200, c = new PC(64, H), W = look.wood;
  const base = H - 6, deck = base - 86;
  const log = (x: number, y0: number, y1: number, w = 6) => {
    for (let y = y0; y < y1; y++) for (let i = 0; i < w; i++) c.set(x + i, y, tone(W, [1, 3, 4, 3, 2, 1][Math.floor((i * 6) / w)] + (hash01(x + i, y >> 2, seed) < 0.15 ? -0.8 : 0)));
  };
  // задние ноги темнее, раскосы
  log(10, deck, base - 10, 5); log(49, deck, base - 10, 5);
  for (let y = 0; y < 60; y++) { c.set(12 + Math.round((y / 60) * 38), deck + 14 + y, W[1]); c.set(51 - Math.round((y / 60) * 38), deck + 14 + y, W[2]); c.set(13 + Math.round((y / 60) * 38), deck + 14 + y, W[2]); }
  log(4, deck, base, 7); log(53, deck, base, 7);
  // площадка и плетёный бортик
  for (let x = 0; x < 64; x++) for (let y = deck - 16; y < deck + 4; y++) {
    const weave = ((x >> 2) + (y >> 1)) % 2;
    c.set(x, y, y >= deck + 1 ? W[1] : tone(W, 2.3 + weave * 0.8 + (y === deck - 16 ? 1.2 : 0)));
  }
  for (const x of [0, 20, 42, 60]) log(x, deck - 20, deck + 4, 4);
  // кровля
  coneRoofPyramid(c, look.roofs[0], 32, deck - 28, 38, 40, seed);
  for (const x of [4, 56]) log(x, deck - 28, deck - 16, 3);
  groundShadow(c, 0, base, 64, 6, 110);
  c.outline(OUT);
  if (wear === "moss") mossPatch(c, 0, deck - 70, 64, 44, look, seed, false);
  if (wear === "patch") { for (let x = 20; x < 34; x++) for (let y = deck - 12; y < deck - 2; y++) c.set(x, y, tone(look.wood, 3.6 + ((x + y) % 3 === 0 ? -0.6 : 0))); }
  return c;
}

/** Поза лучника: b — вдох (плечи и голова на 1 px выше), h — поворот головы (−1 влево, 1 вправо), d — натяжение 0…1 (0 — лук опущен,
 *  тетива прямая; 1 — тетива у щеки, стрела на тетиве), g — перехват лука (лук на 1 px ниже). */
export interface ArcherPose { b: number; h: number; d: number; g: number }
export const ARCHER_W = 36, ARCHER_H = 36;
/** Лучник на вышке 36×36 (≈1,12 роста героя: стоит на площадке): шлем-капеллина (Сольгард) или капюшон (Умбрат), лицо, табард фракции
 *  с каймой и гербом, кольчужные рукава, колчан, лук. Свет слева, контур как у спрайтов. Ноги ниже зубцов площадки в кадр не входят. */
export function archerFigure(look: Look, pose: ArcherPose = { b: 0, h: 0, d: 1, g: 0 }): PC {
  const S = 1.15, f = new PC(ARCHER_W, ARCHER_H), sol = look.faction === "sol";
  const P_ = (v: number) => Math.round(v * S);
  const skin = ramp("#6e3f35", "#a8644e", "#d9956f", "#f2c49b"), steel = ramp("#3a3f4c", "#5e6678", "#8f99ad", "#c8d0de", "#f2f6ff");
  const cl = sol ? ramp("#1a3270", "#2a52b0", "#3f78e0", "#7ab0ff") : ramp("#2a1048", "#4a1e7e", "#7a34c0", "#b070f0");
  const trim = sol ? ramp("#7a5410", "#c08a1c", "#f0c040", "#fff0a0") : ramp("#2a2a38", "#6a6a84", "#b8b8d0", "#f0f0ff");
  const wood = ramp("#3a2216", "#5e3a22", "#8a5a34", "#b07e4c");
  const by = 4 - pose.b, hx = P_(12) + 2, hy = P_(8) + by;
  // колчан
  f.rect(P_(4) + 2, P_(5) + by, P_(3), P_(10), wood[1]); f.rect(P_(4) + 2, P_(5) + by, 1, P_(10), wood[2]);
  for (const [x, col] of [[4, hex("#f0ece0")], [5.2, hex("#c83a3a")], [6.4, hex("#f0ece0")]] as const) f.rect(P_(x) + 2, P_(3) + by, 1, 2, col);
  // торс: табард со светом слева, кайма, пояс, герб
  for (let y = P_(13) + by; y < ARCHER_H; y++) {
    const half = y < P_(15) + by ? P_(5.2) : P_(4.3);
    for (let x = Math.round(hx - half); x < hx + half; x++) {
      const u = (x + 0.5 - hx) / half, k = 0.66 + 0.52 * Math.max(0, -0.6 * u + 0.8 * Math.sqrt(Math.max(0, 1 - u * u)));
      const sleeve = y < P_(15.5) + by && Math.abs(x + 0.5 - hx) > P_(2.6);
      let col = shade(sleeve ? steel[3] : cl[2], k);
      if (!sleeve && Math.abs(x + 0.5 - hx) > half - 1.2) col = trim[1];
      f.set(x, y, col);
    }
  }
  for (let x = hx - P_(4.3); x < hx + P_(4.3); x++) { f.set(x, P_(23) + by, wood[0]); }
  f.rect(hx - 2, P_(16) + by, 5, 4, trim[2]); f.rect(hx - 1, P_(16) + by + 1, 3, 2, sol ? trim[3] : cl[3]);
  // голова
  const hr = 3.4 * S;
  for (let y = Math.floor(hy - hr); y <= hy + hr; y++) for (let x = Math.floor(hx - hr); x <= hx + hr; x++) {
    const dx = (x + 0.5 - hx) / hr, dy = (y + 0.5 - hy) / hr;
    if (dx * dx + dy * dy > 1) continue;
    f.set(x, y, skin[dx < -0.25 ? 3 : dx > 0.35 ? 1 : 2]);
  }
  const ex = hx + pose.h;
  f.set(ex - 2, hy, OUT); f.set(ex + 1, hy, OUT); f.set(ex - 1 + (pose.h > 0 ? 1 : 0), hy + 3, skin[1]);
  if (sol) {
    for (let y = Math.floor(hy - 6 * S); y <= hy - 1; y++) for (let x = Math.floor(hx - 4 * S); x <= hx + 4 * S; x++) {
      const dx = (x + 0.5 - hx) / (3.8 * S), dy = (y + 0.5 - (hy - 1)) / (5 * S);
      if (dx * dx + dy * dy <= 1) f.set(x, y, steel[dx < -0.3 ? 4 : dx > 0.3 ? 2 : 3]);
    }
    for (let x = Math.round(hx - 5.3 * S); x <= hx + 5.3 * S; x++) f.set(x, hy - 1, x < hx ? steel[3] : steel[1]);
    f.set(hx, Math.round(hy - 6 * S), trim[3]);
  } else {
    for (let y = Math.floor(hy - 5.5 * S); y <= hy + 4 * S; y++) for (let x = Math.floor(hx - 4.6 * S); x <= hx + 4.6 * S; x++) {
      const dx = (x + 0.5 - hx) / (4.6 * S), dy = (y + 0.5 - (hy - 0.5)) / (5.2 * S);
      if (dx * dx + dy * dy > 1) continue;
      if (Math.abs(x + 0.5 - ex) < 2.6 * S && y > hy - 3 * S) continue;
      f.set(x, y, shade(cl[1], dx < 0 ? 1.2 : 0.8));
    }
    f.set(ex - 2, hy, look.glass[2]); f.set(ex + 1, hy, look.glass[2]);
  }
  // лук: в покое опущен и ближе к телу, при натяжении поднят и вынесен в сторону
  const d = pose.d, bx = Math.round(hx + P_(7) + d * 3), bt = Math.round(2 + (1 - d) * 5 + pose.g), bb = bt + P_(23), mid = Math.round((bt + bb) / 2);
  for (let y = bt; y <= bb; y++) { const t = (y - bt) / (bb - bt), x = Math.round(bx - Math.sin(t * Math.PI) * 3.6 * S); f.set(x, y, wood[t < 0.5 ? 3 : 2]); f.set(x + 1, y, wood[1]); }
  const gx = bx - 4, gy = mid; // кисть на рукояти
  for (let x = hx + P_(4); x < gx; x++) { f.set(x, gy, steel[3]); f.set(x, gy + 1, steel[1]); }
  f.rect(gx, gy - 1, 3, 3, skin[2]);
  // тетива и правая рука: кисть от рукояти (d=0) к щеке (d=1)
  const cx = Math.round(bx + 1 - d * (bx + 1 - (hx + P_(3)))), cy = Math.round(gy + d * ((hy + 3) - gy));
  f.line(bx + 1, bt, cx, cy, hex("#ece4d4")); f.line(bx + 1, bb, cx, cy, hex("#ece4d4"));
  if (d > 0.25) { f.line(cx, cy, bx + 3, cy, wood[3]); f.rect(bx + 3, cy - 1, 2, 3, steel[4]); f.set(cx - 1, cy, hex("#f0ece0")); }
  const sx = hx - P_(4.5), sy = P_(14.5) + by;
  if (d > 0.25) { const ex2 = Math.round(sx - 2 - d * 2), ey2 = cy; f.line(sx, sy, ex2, ey2, steel[3], 2); f.line(ex2, ey2, cx, cy, steel[3], 2); }
  else f.line(sx, sy, sx - 1, sy + 7, steel[3], 2);
  f.rect(cx, cy - 1, 2, 3, skin[2]);
  return f.outline(OUT);
}
/** Кадры лучника: 24 кадра покоя (дыхание, поворот головы, перехват лука) и 8 кадров «натянул и целится» — цикл ≈5 с при 6 к/с. */
export function archerFrames(look: Look): PC[] {
  const out: PC[] = [];
  const breath = [0, 0, 1, 1, 1, 1, 0, 0];
  for (let k = 0; k < 24; k++) out.push(archerFigure(look, { b: breath[k % 8], h: k >= 8 && k < 14 ? -1 : k >= 18 && k < 22 ? 1 : 0, d: 0, g: k >= 14 && k < 18 ? 1 : 0 }));
  for (const d of [0.2, 0.45, 0.7, 0.9, 1, 1, 1, 0.05]) out.push(archerFigure(look, { b: 1, h: 1, d, g: 0 }));
  return out;
}

/** Вышка лучника у мостов и постов 80×176 (след 2×2) в стиле 141: каменное тело в 3/4 (лицо и боковая грань в тени),
 *  герб фракции, бойницы с откосами, дверь; наверху — площадка с зубцами, лучник на ней, деревянный навес на столбах.
 *  Тело шире следа (4…76 px): стена вдоль реки идёт по правой (запад) или левой (восток) клетке следа — башня перекрывает её торцы. */
export function archerTower(look: Look, seed = 1): PC {
  const WD = TOWER_W, H = 194, c = new PC(WD, H), S = look.stone, T = look.trim, Wd = look.wood;
  const face = masonryTile(look, look.masonry, 51), top = slabTile(look, 52);
  const base = H - 4, D = 12, K = 7, fx0 = 4, fx1 = WD - 4 - D, bodyTop = base - 96, cx = Math.round((fx0 + fx1) / 2);
  c.poly([[fx0 + 2, base], [fx1 + D, base - K], [fx1 + D + 6, base - K + 3], [fx1 + D + 6, base + 3], [fx0 + 4, base + 5]], withA([12, 8, 18, 255], 110));
  // боковая грань в тени
  for (let i = 0; i < D; i++) { const off = Math.round(((i + 0.5) / D) * K); for (let y = bodyTop - off; y < base - off; y++) c.set(fx1 + i, y, shade(tex(face, fx1 + i, y + off), 0.58 - i * 0.01)); }
  // лицо
  fillTex(c, face, fx0, bodyTop, fx1 - fx0, base - bodyTop, 0, 0, (x, y) => (y < 3 ? 0.72 : 1 - (y / 96) * 0.12) * (x < 1 ? 1.15 : 1));
  for (let x = fx0 - 1; x < fx1 + 1; x++) { c.set(x, base - 8, S[4]); c.set(x, base - 7, S[2]); for (let y = base - 6; y < base; y++) c.set(x, y, tone(S, 1.6 + (pnoise(x, y, 3, 64, seed) - 0.5))); }
  // пояс под площадкой (карниз с консолями) и тень
  for (let x = fx0 - 3; x < fx1 + D + 1; x++) {
    const off = x >= fx1 ? Math.round(((x - fx1) / D) * K) : 0;
    c.set(x, bodyTop - 1 - off, S[5]); c.set(x, bodyTop - off, look.tier === "fort" ? S[3] : T[3]); c.set(x, bodyTop + 1 - off, S[1]);
    if ((x + 1) % 6 < 3 && x < fx1) { c.set(x, bodyTop + 2, S[3]); c.set(x, bodyTop + 3, S[2]); }
    for (let k = 3; k < 7; k++) darken(c, x, bodyTop + k - off, 0.72 + k * 0.04);
  }
  // герб фракции (щит)
  const sy = bodyTop + 30, sol = look.faction === "sol";
  c.poly([[cx - 8, sy], [cx + 8, sy], [cx + 8, sy + 10], [cx, sy + 17], [cx - 8, sy + 10]], (x) => shade(sol ? look.cloth[2] : look.cloth[1], x < cx ? 1.1 : 0.85));
  c.poly([[cx - 8, sy], [cx + 8, sy], [cx + 8, sy + 1], [cx - 8, sy + 1]], T[3]);
  if (sol) { c.ellipse(cx, sy + 7, 3.5, 3.5, T[3]); c.ellipse(cx - 0.5, sy + 6.5, 1.5, 1.5, T[4]); for (let a = 0; a < 8; a++) { const an = (a / 8) * Math.PI * 2; c.set(Math.round(cx + Math.cos(an) * 5.5), Math.round(sy + 7 + Math.sin(an) * 5.5), T[2]); } }
  else { c.ellipse(cx, sy + 7, 3.4, 3, hex("#d8d0bc")); c.rect(cx - 2, sy + 9, 4, 2, hex("#b8b09c")); c.set(cx - 1, sy + 7, OUT); c.set(cx + 1, sy + 7, OUT); for (const d of [-4, 0, 4]) c.set(cx + d, sy + 2, look.glass[2]); }
  for (let y = sy; y < sy + 17; y++) darken(c, cx + 9, y + 1, 0.7);
  slit(c, look, cx - 12, bodyTop + 40, 14); slit(c, look, cx + 12, bodyTop + 40, 14);
  archWindow(c, look, fx1 + Math.round(D / 2), bodyTop + 30 - 4, 2, 10);
  // дверь
  const dw = 14, dh = 30, dx0 = cx - dw / 2;
  for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
    if (j < dw / 2) { const ex = i + 0.5 - dw / 2, ey = j - dw / 2; if (ex * ex + ey * ey > (dw / 2) ** 2) continue; }
    c.set(dx0 + i, base - 1 - dh + j, j === Math.floor(dh * 0.35) || j === dh - 7 ? T[2] : tone(Wd, 2 + (i % 4 === 3 ? -1 : i % 4 === 0 ? 0.4 : 0) - (sol ? 0 : 0.5)));
  }
  for (let j = 0; j < dh; j++) { c.set(dx0 - 1, base - 1 - dh + j, S[5]); c.set(dx0 + dw, base - 1 - dh + j, S[1]); }
  c.set(dx0 + dw - 4, base - 16, T[4]);
  for (let x = dx0 - 3; x < dx0 + dw + 3; x++) { c.set(x, base - 1, S[5]); c.set(x, base, S[3]); c.set(x, base + 1, S[1]); }
  // площадка: пол в 3/4, зубцы спереди и сбоку
  const fy = bodyTop - 4;
  for (let j = 0; j < K + 8; j++) for (let x = fx0 - 3 + Math.round((j * D) / (K + 8)); x < fx1 + 3 + Math.round((j * D) / (K + 8)); x++) c.set(x, fy - j, shade(tex(top, x, j), 0.9));
  const g = new PC(WD, H);
  crestRow(g, look, fx0 - 3, fx1 - fx0 + 6, fy - 12, face, fy + 2);
  // лучник на площадке (за зубцами): фигура уровня спрайтов стражи — шлем или капюшон, лицо, табард с гербом, кольчужные рукава,
  // натянутый лук и колчан за плечом; низ закрывают зубцы
  // лучник — отдельный анимированный объект поверх вышки (archer-sol/umb, tools/gen/walls141-game.ts writeArchersGame): правки 8
  c.blit(g, 0, 0);
  for (let i = 0; i < D; i++) { const off = Math.round(((i + 0.5) / D) * K); for (let y = fy - 12 - off; y < fy + 2 - off; y++) c.set(fx1 + 3 + i, y, shade(tex(face, fx1 + i, y + off), y < fy - 10 - off ? 0.85 : 0.55)); }
  // навес на столбах
  const roofB = fy - 48; // навес выше головы лучника (правки 10)
  // задняя стенка беседки (правки 10): глухие доски в тени — сквозь навес не видно бойцов позади вышки, лучник рисуется перед ней
  for (let y = roofB; y < fy - 6; y++) for (let x = fx0 - 1; x < fx1 + D; x++) {
    if (c.alpha(x, y)) continue;
    const off = x >= fx1 ? Math.round(((x - fx1) / D) * K) : 0;
    if (y < roofB + 2 - off && x >= fx1) continue;
    c.set(x, y, tone(Wd, 1 + ((x - fx0) % 5 === 4 ? -0.8 : 0) + (y < roofB + 6 ? -0.5 : 0) - (x >= fx1 ? 0.4 : 0) + (hash01(x, y >> 2, seed) - 0.5) * 0.4));
  }
  for (const px of [fx0 - 1, fx1 + 1, fx1 + D - 1]) for (let y = roofB; y < fy - 10; y++) { c.set(px, y, Wd[3]); c.set(px + 1, y, Wd[1]); }
  coneRoofPyramid(c, look.roofs[0], Math.round((fx0 + fx1 + D) / 2), roofB, Math.round((fx1 - fx0 + D) / 2) + 6, 26, seed);
  for (let x = fx0 - 4; x < fx1 + D + 6; x++) for (let k = 3; k < 6; k++) darken(c, x, roofB + k, 0.7);
  c.outline(OUT);
  groundHug(c, fx0 - 1, fx1 - fx0 + D + 2, base, look, seed);
  return c;
}


// ---------------- ворота ----------------
export type GateState = "closed" | "open" | "broken";
export const GATE_W = 96, GATE_H = 146;

/** Створки по форме арки (полуширина aw, свод с вершиной ay, низ by): доски, оковка, заклёпки, кольца. */
function leaves(c: PC, look: Look, cx: number, aw: number, ay: number, spring: number, by: number, seed: number, state: GateState) {
  const W = look.wood, T = look.trim;
  const inside = (x: number, y: number) => {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) > aw || y > by) return false;
    if (y >= spring) return true;
    const dy = (y + 0.5 - spring) / (spring - ay);
    return (dx / aw) ** 2 + dy * dy <= 1;
  };
  const bands = [spring - 6, spring + Math.floor((by - spring) * 0.45), by - 8];
  for (let y = ay; y < by; y++) for (let x = cx - aw; x < cx + aw; x++) {
    if (!inside(x, y)) continue;
    const lx = x - (cx - aw), plank = Math.floor(lx / 6), fx = lx % 6;
    let v = 2.3 + (hash01(plank, 0, seed) - 0.5) * 0.9 + (fx === 0 ? 0.6 : fx === 5 ? -1.1 : 0) + (pnoise(x, y, 3, 96, seed) - 0.5) * 0.7;
    if (hash01(x, y >> 1, seed + 2) < 0.06) v -= 0.6; // волокна
    if (look.faction === "umb") v -= 0.3;
    let col = tone(W, v);
    if (Math.abs(x + 0.5 - cx) < 1) col = OUT; // стык створок
    for (const b of bands) if (y >= b && y < b + 3) col = y === b ? T[3] : y === b + 1 ? T[2] : T[1];
    c.set(x, y, col);
  }
  // заклёпки на полосах, кольца, знак
  for (const b of bands) for (let x = cx - aw + 3; x < cx + aw - 2; x += 5) if (inside(x, b + 1) && Math.abs(x - cx) > 1) { c.set(x, b + 1, T[4]); c.set(x, b + 2, T[0]); }
  if (look.tier !== "settle") for (const d of [-5, 4]) { c.ellipse(cx + d + 0.5, bands[1] + 9, 2.2, 2.2, T[2]); c.ellipse(cx + d + 0.5, bands[1] + 9, 1.1, 1.1, OUT); c.set(cx + d, bands[1] + 6, T[4]); }
  if (look.tier === "fort" || look.tier === "settle") { // раскосы Z
    for (const sgn of [-1, 1]) for (let t = 0; t < 1; t += 0.01) {
      const x = Math.round(cx + sgn * (aw - 3 - t * (aw - 6))), y = Math.round(bands[1] + 3 + t * (bands[2] - bands[1] - 3));
      c.set(x, y, W[4]); c.set(x, y + 1, W[3]); c.set(x, y + 2, W[1]);
    }
  }
  if (look.faction === "umb") for (const b of bands) for (let x = cx - aw + 6; x < cx + aw - 4; x += 10) { c.set(x, b - 1, T[3]); c.set(x, b - 2, T[4]); }
  void state;
}

/** Цвет глубины проёма в точке (низ прозрачнеет — сквозь него видна дорога). */
/** Расстояние (px) от точки проёма вниз до свода арки (полукруг rx = aw над spring ≈ by − 40, вершина ay). */
function archDepth(x: number, y: number, cx: number, aw: number, ay: number, spring: number) {
  const dx = Math.abs(x + 0.5 - cx);
  const ry = spring - ay, top = dx >= aw ? spring : spring - ry * Math.sqrt(Math.max(0, 1 - (dx / aw) ** 2));
  return y - top;
}
/** Высота прозрачного низа проёма (px): рост героя с запасом — герой в проёме виден целиком, над ним свод ворот. */
const CLEAR = 46;
function passageCol(look: Look, x: number, y: number, cx: number, aw: number, ay: number, by: number, spring = ay + Math.round((by - ay) * 0.4)): RGBA {
  // проём открыт насквозь (правки 2: «снизу вверх — сплошная стена»): виден только откос свода под аркой (≈7 px), ниже — дорога
  const dx = x + 0.5 - cx, d = archDepth(x, y, cx, aw, ay, spring);
  const fy = by - CLEAR;
  const a = d > 9 ? 0 : d > 6 ? Math.round(255 * ((9 - d) / 3)) : y >= fy ? 0 : 255;
  const t = Math.max(0, Math.min(1, (y - ay) / Math.max(1, fy - ay)));
  const ring = (y - ay) % 7 === 0 && t < 0.8;
  // свод в тени, к низу — отсвет выхода с той стороны
  const base = mix(OUT, look.stone[1], ring ? 0.6 : 0.2 + 0.1 * (1 - t));
  return withA(shade(mix(base, look.stone[3], Math.max(0, t - 0.6) * 0.8), Math.abs(dx) > aw - 6 ? 0.7 : 1), a);
}
/** Проём ворот: свод в тени, снизу пол просвечивает (дорога видна сквозь проём). */
function passage(c: PC, look: Look, cx: number, aw: number, ay: number, spring: number, by: number) {
  for (let y = ay; y < by; y++) for (let x = cx - aw; x < cx + aw; x++) {
    const dx = x + 0.5 - cx;
    if (y < spring && (dx / aw) ** 2 + ((y + 0.5 - spring) / (spring - ay)) ** 2 > 1) continue;
    // своды: ряды кладки в глубине; низ проёма прозрачен (дорога и герой в проёме видны, свод — над ним)
    const p = passageCol(look, x, y, cx, aw, ay, by, spring);
    c.clear(x, y); // под проёмом — кладка фасада: стираем, иначе низ проёма непрозрачен
    if (p[3]) c.set(x, y, p);
  }
}

/** Надвратная арка 96×136; state — кадр створок. */
export function gate(look: Look, state: GateState = "closed", wear: Wear = "clean", seed = 1): PC {
  const c = new PC(GATE_W, GATE_H), S = look.stone, T = look.trim;
  const face = masonryTile(look, look.masonry, 41), top = slabTile(look, 42);
  const by = GATE_H - 4, cx = 48, aw = 30, spring = by - 40, ay = spring - 26;
  // верх: проход, зубцы, карниз
  for (let x = 0; x < 96; x++) { c.set(x, 0, S[4]); c.set(x, 1, S[3]); c.set(x, 2, S[1]); }
  fillTex(c, top, 0, 3, 96, 28, 0, 0, (_x, y) => (y < 2 ? 0.8 : y > 21 ? 0.82 : 1));
  crest(c, look, 0, 96, 23, face, seed);
  // фасад и пилоны (выступают: светлая кромка слева, тень справа)
  const fg = new PC(GATE_W, GATE_H);
  facade(fg, look, 0, 96, FACE_Y, by, face, "none", seed);
  c.blit(fg, 0, 0);
  for (const px of [0, 86]) for (let y = FACE_Y + 3; y < by - 6; y++) { c.set(px, y, S[5]); c.set(px + 9, y, S[1]); for (let x = px + 1; x < px + 9; x++) tint(c, x, y, S[5], 0.12); }
  // проём
  passage(c, look, cx, aw, ay, spring, by);
  // правки 6: в проёме у земли ни полосы земли/травы, ни тени — только дорога насквозь (кадр рисуется поверх героя в проёме)
  for (let y = by - 3; y < GATE_H; y++) for (let x = cx - aw; x < cx + aw; x++) if (y >= by || !c.alpha(x, y) || c.get(x, y)![3] < 255) c.clear(x, y);
  if (state === "open") {
    // створки распахнуты к стенам проёма: видны в ракурсе — доски, оковка, тень на мостовой; решётка поднята (зубья под сводом)
    for (const sgn of [-1, 1]) for (let i = 0; i < 9; i++) {
      const x = sgn < 0 ? cx - aw + i : cx + aw - 1 - i, top = spring - 12 + Math.round(i * 0.8);
      for (let y = top; y < by - 1 - Math.round(i * 0.3); y++) {
        const v = (sgn < 0 ? 2.6 : 1.5) + (i === 8 ? -1 : i === 0 ? 0.6 : 0) + (i % 3 === 2 ? -0.4 : 0) - (y > by - 6 ? 0.6 : 0);
        c.set(x, y, tone(look.wood, v + (look.faction === "umb" ? -0.4 : 0)));
        if ([spring - 4, Math.round((spring + by) / 2), by - 9].some((b) => y === b || y === b + 1)) c.set(x, y, y % 2 ? T[1] : T[3]);
      }
    }

    if (look.tier !== "settle") for (let x = cx - aw + 6; x < cx + aw - 6; x++) {
      const k = (x - cx + aw) % 6;
      for (let y = ay + 3; y < ay + 12; y++) {
        const dx = x + 0.5 - cx;
        if ((dx / aw) ** 2 + ((y + 0.5 - spring) / (spring - ay)) ** 2 > 0.92) continue;
        if (k === 0 || y === ay + 6) c.set(x, y, k === 0 ? T[1] : T[2]);
      }
      if (k === 0) { c.set(x, ay + 12, T[2]); c.set(x, ay + 13, T[3]); }
    }
  } else leaves(c, look, cx, aw, ay, spring, by, seed, state);
  if (state === "broken") brokenLeaves(c, look, cx, aw, ay, spring, by, seed);
  // замковый камень и клинчатые камни свода
  const vr = 7;
  for (let y = ay - vr; y < spring + 1; y++) for (let x = cx - aw - vr; x < cx + aw + vr; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - spring;
    const inner = (dx / aw) ** 2 + (dy / (spring - ay)) ** 2, outer = (dx / (aw + vr)) ** 2 + (dy / (spring - ay + vr)) ** 2;
    if (inner <= 1 || outer > 1) continue;
    const ang = Math.atan2(-dy / (spring - ay), dx / aw);
    const seg = Math.floor((ang / Math.PI) * 13);
    const fa = (ang / Math.PI) * 13 - seg;
    let v = 3.3 + (hash01(seg, 1, seed) - 0.5) * 0.8 - (outer > 0.86 ? 0.8 : 0) + (inner < 1.1 ? 0.9 : 0);
    if (fa < 0.12) v = 1;
    c.set(x, y, tone(S, v));
  }
  // замковый камень со знаком фракции
  c.poly([[cx - 6, ay - vr - 3], [cx + 6, ay - vr - 3], [cx + 4, ay + 4], [cx - 4, ay + 4]], (x, y) => (y === ay - vr - 3 ? S[5] : x < cx - 3 ? S[5] : x > cx + 2 ? S[2] : S[4]));
  if (look.tier === "capital") {
    if (look.faction === "sol") { c.ellipse(cx, ay - 3, 3.2, 3.2, T[1]); c.ellipse(cx, ay - 3, 2.2, 2.2, T[3]); c.set(cx - 1, ay - 4, T[4]); }
    else if (look.faction === "umb") { c.rect(cx - 1, ay - 7, 2, 7, look.glass[1]); c.set(cx - 1, ay - 7, look.glass[2]); c.rect(cx - 3, ay - 5, 6, 1, look.glass[1]); }
    else { c.poly([[cx - 3, ay], [cx + 3, ay], [cx + 1, ay - 5], [cx, ay - 3], [cx - 1, ay - 7]], (_x, y) => (y < ay - 3 ? look.glass[2] : look.glass[1])); }
  }
  // фонари или жаровни по сторонам у столиц
  if (look.tier === "capital") for (const lx of [6, 84]) {
    c.rect(lx + 2, spring - 4, 2, 6, T[1]);
    c.rect(lx, spring - 12, 6, 8, T[1]);
    c.rect(lx + 1, spring - 11, 4, 6, look.glass[2]);
    c.rect(lx + 1, spring - 8, 4, 3, look.glass[1]);
    c.rect(lx - 1, spring - 13, 8, 1, T[3]);
  }
  wearWall(c, look, wear, seed, 0, 96, FACE_Y, by);
  c.outline(OUT);
  return c;
}

/** Разбитые створки: пролом в левой, правая перекошена и без низа, щепа вокруг, обломки досок перед воротами, копоть. */
function brokenLeaves(c: PC, look: Look, cx: number, aw: number, ay: number, spring: number, by: number, seed: number) {
  const W = look.wood;
  // пролом
  const hx = cx - aw * 0.5, hy = spring + 10;
  for (let y = ay; y < by; y++) for (let x = cx - aw; x < cx; x++) {
    const d = Math.hypot((x - hx) / 11, (y - hy) / 17) + (pnoise(x, y, 4, 96, seed + 3) - 0.5) * 0.9 + (hash01(x, y, seed) - 0.5) * 0.2;
    const ang = Math.atan2(y - hy, x - hx), spl = 0.16 * Math.abs(Math.sin(ang * 7 + seed));
    if (d < 1 - spl) { c.clear(x, y); c.set(x, y, passageCol(look, x, y, cx, aw, ay, by)); }
    else if (d < 1.12 && hash01(x, y, seed + 1) < 0.55) c.set(x, y, hash01(x, y, seed + 2) < 0.5 ? W[3] : mix(W[4], hex("#e0c498"), 0.4));
  }
  // правая створка: нижняя часть выломана
  for (let y = by - 22; y < by; y++) for (let x = cx + 1; x < cx + aw; x++) {
    const edge = by - 22 + Math.floor(hash01(x >> 1, 9, seed) * 9);
    if (y > edge) { c.clear(x, y); c.set(x, y, passageCol(look, x, y, cx, aw, ay, by)); }
    else if (y === edge) c.set(x, y, mix(W[4], hex("#e0c498"), 0.5));
  }
  // копоть вокруг
  for (let y = ay; y < by; y++) for (let x = cx - aw - 6; x < cx + aw + 6; x++) {
    const n = pnoise(x, y, 6, 96, seed + 7);
    if (n > 0.62) darken(c, x, y, 0.7);
  }
  // доски на земле перед воротами
  for (let k = 0; k < 5; k++) {
    const x0 = cx - aw + Math.floor(hash01(k, seed, 4) * aw * 2 - 4), y0 = by - 4 + Math.floor(hash01(k, seed, 5) * 6);
    const len = 8 + Math.floor(hash01(k, seed, 6) * 8), dir = hash01(k, seed, 7) < 0.5 ? 1 : -1;
    for (let i = 0; i < len; i++) { const y = y0 + Math.round((i * dir) / 4); c.set(x0 + i, y, W[3]); c.set(x0 + i, y + 1, W[1]); }
  }
  for (let i = 0; i < 8; i++) { const x = cx - aw + Math.floor(hash01(i, seed, 8) * aw * 2), y = by - 2 + Math.floor(hash01(i, seed, 9) * 5); c.rect(x, y, 2, 2, look.stone[3]); c.set(x, y, look.stone[5]); }
}

// ---------------- частокол поселений (правки 3, docs/walls-141.md: как в LPC — торцы-спилы, столбец спилов по бокам, угловой столб) ----------------
/** Бревно частокола в 3/4: тело-цилиндр (свет слева), кора с продольными бороздами, сверху торец-спил эллипсом с кольцами;
 *  у Умбрата на части брёвен — кованый шип из торца. top — верх торца, bottom — низ бревна. */
function log(c: PC, look: Look, x0: number, w: number, top: number, bottom: number, seed: number, o: { fresh?: boolean; broken?: boolean; spike?: boolean; ry?: number } = {}) {
  const W = look.wood, ry = o.ry ?? Math.max(2, Math.round(w / 3.5)), cx = x0 + w / 2;
  const cut = o.fresh ? [hex("#f0dcb4"), hex("#d8bc8a"), hex("#b89a68")] : look.faction === "umb" ? [mix(W[4], hex("#b8a488"), 0.45), mix(W[3], hex("#9a8468"), 0.4), W[2]] : [mix(W[4], hex("#ecd4a4"), 0.5), mix(W[3], hex("#d0b080"), 0.45), W[3]];
  const t0 = o.broken ? top + 6 : top;
  for (let i = 0; i < w; i++) {
    const u = (i + 0.5 - w / 2) / (w / 2), z = Math.sqrt(Math.max(0, 1 - u * u)), lam = Math.max(0, -0.62 * u + 0.78 * z);
    const groove = hash01(x0 + i, 3, seed) < 0.22;
    for (let y = t0 + Math.round(ry * z); y < bottom; y++) {
      let v = 0.5 + lam * 3 + (o.fresh ? 0.5 : 0) + (groove ? -0.6 : 0) + (hash01(x0 + i, y >> 2, seed) < 0.1 ? -0.5 : 0);
      if (look.faction === "umb") v -= 0.3;
      c.set(x0 + i, y, tone(W, v));
    }
  }
  // торец-спил: тёмная кромка коры, светлое кольцо (лит слева-сверху), сердцевина и трещина
  for (let y = t0 - ry; y <= t0 + ry; y++) for (let x = Math.floor(x0); x < x0 + w; x++) {
    const dx = (x + 0.5 - cx) / (w / 2), dy = (y + 0.5 - t0) / ry, d = Math.hypot(dx, dy);
    if (d > 1) continue;
    let col = d > 0.78 ? W[1] : d > 0.5 ? cut[dx + dy < -0.2 ? 0 : 1] : d > 0.22 ? cut[1] : cut[2];
    if (o.broken && hash01(x, y, seed) < 0.35) col = W[1];
    c.set(x, y, col);
  }
  c.set(Math.round(cx), t0, cut[2]);
  if (o.spike) { for (let k = 1; k <= 5; k++) c.set(Math.round(cx) - (k > 3 ? 0 : 0), t0 - k, look.trim[k < 3 ? 2 : 3]); c.set(Math.round(cx), t0 - 6, look.trim[4]); }
}
/** Перевязь поперёк брёвен (верёвка у Сольгарда, кованая полоса у Умбрата) с тенью под ней. */
function band(c: PC, look: Look, x0: number, x1: number, y: number) {
  for (let x = x0; x < x1; x++) {
    if (!c.alpha(x, y)) continue;
    if (look.faction === "umb") { c.set(x, y, look.trim[3]); c.set(x, y + 1, look.trim[1]); if (x % 8 === 4) c.set(x, y, look.trim[4]); }
    else { c.set(x, y, (x + y) % 3 === 0 ? hex("#9a7a48") : hex("#c8a870")); c.set(x, y + 1, hex("#7a5a30")); }
    darken(c, x, y + 2, 0.7);
  }
}
/** Насыпь у основания: камни и земля. */
function mound(c: PC, look: Look, x0: number, x1: number, y: number, seed: number) {
  for (let x = x0; x < x1; x++) for (let yy = y - 5; yy < y + 1; yy++) {
    const h = y - 5 + Math.round(1.5 + Math.sin(x * 0.7 + seed) * 1.3);
    if (yy >= h) c.set(x, yy, tone(look.stone, 2 + (yy === h ? 1.4 : 0) + (pnoise(x, yy, 3, 64, seed) - 0.5) * 1.6));
  }
}

/** Частокол H 32×64: четыре бревна лицом к зрителю, торцы-спилы, две перевязи, насыпь. */
export function palisadeH(look: Look, wear: Wear = "clean", seed = 1): PC {
  const c = new PC(32, 64);
  for (let k = 0; k < 4; k++) {
    const top = 7 + Math.floor(hash01(k, seed, 1) * 4);
    log(c, look, k * 8, 8, top, 58, seed + k, { fresh: wear === "patch" && k === Math.floor(hash01(seed, 3, 3) * 4), broken: wear === "chip" && k === 1 + Math.floor(hash01(seed, 2, 2) * 2), spike: look.faction === "umb" && k % 2 === 1 });
  }
  band(c, look, 0, 32, 24); band(c, look, 0, 32, 44);
  mound(c, look, 0, 32, 60, seed);
  if (wear === "moss") mossPatch(c, 0, 36, 32, 24, look, seed, false);
  if (wear === "ivy") ivy(c, 2, 22, 28, 34, seed);
  if (look.faction === "umb" && wear === "clean") { const sx = 4 + Math.floor(hash01(seed, 4, 4) * 2) * 16; c.ellipse(sx, 6, 3, 3, hex("#d8d0bc")); c.rect(sx - 2, 8, 4, 2, hex("#b8b09c")); c.set(sx - 1, 6, OUT); c.set(sx + 1, 6, OUT); }
  c.outline(OUT);
  groundHug(c, 0, 32, 61, look, seed);
  return c;
}

/** Частокол V 40×88 (стороны W/E, правки 5): ОДИН ряд брёвен, как ряд H, — столбец спилов той же толщины (8 px), брёвна уходят вглубь
 *  по 8 px (стык с соседними клетками ровный), и узкая видимая наружная грань этого же ряда (side «w» — запад, освещена; «e» — восток, в тени).
 *  У Умбрата — шипы и черепа. */
export function palisadeV(look: Look, side: "w" | "e" = "w", wear: Wear = "clean", seed = 1): PC {
  const IW = 40, c = new PC(IW, 88), W = look.wood, flip = side === "e";
  const X = (x: number, w = 1) => (flip ? IW - x - w : x);
  const lx = 16, fx = 12, fw = 4;
  // узкая наружная грань ряда: бока тех же брёвен, стыки через 8 px, перевязи
  for (let i = 0; i < fw; i++) for (let y = 24; y < 84; y++) {
    const within = (y + 4) % 8;
    let v = (flip ? 0.9 : 1.5) + (i === 0 ? -0.5 : 0) + (within === 0 ? -0.8 : within === 1 ? 0.3 : 0) + (hash01(i, y >> 3, seed) - 0.5) * 0.4;
    if (look.faction === "umb") v -= 0.3;
    c.set(X(fx + i), y, tone(W, v));
  }
  for (const by of [50, 70]) for (let i = 0; i < fw; i++) { c.set(X(fx + i), by, look.faction === "umb" ? look.trim[2] : hex("#a8885a")); c.set(X(fx + i), by + 1, look.faction === "umb" ? look.trim[0] : hex("#6a4a28")); }
  for (let k = 0; k < 4; k++) {
    const dy = (3 - k) * 8;
    log(c, look, X(lx, 8), 8, 26 - dy, 82 - dy, seed + k, { ry: 2, fresh: wear === "patch" && k === 2, broken: wear === "chip" && k === 1, spike: look.faction === "umb" && k % 2 === 1 });
  }
  for (let y = 30; y < 82; y++) { darken(c, X(24), y, 0.55); darken(c, X(25), y, 0.78); }
  band(c, look, flip ? IW - 24 : 16, flip ? IW - 16 : 24, 52); band(c, look, flip ? IW - 24 : 16, flip ? IW - 16 : 24, 70);
  if (look.faction === "umb" && wear === "clean" && seed % 2 === 1) { const sx = X(20); c.ellipse(sx, 13, 3, 2.8, hex("#d8d0bc")); c.rect(sx - 2, 15, 4, 2, hex("#b8b09c")); c.set(sx - 1, 13, OUT); c.set(sx + 1, 13, OUT); }
  mound(c, look, 9, 29, 84, seed);
  if (wear === "moss") mossPatch(c, 10, 58, 18, 28, look, seed, false);
  if (wear === "ivy") ivy(c, X(12, 4), 40, 4, 40, seed);
  c.outline(OUT);
  groundHug(c, 9, 20, 85, look, seed);
  return c;
}

/** Угол частокола 40×96 (один кусок, «e» — ряд H уходит вправо, «w» — влево): угловой столб в 1,25 бревна, на пару px выше ряда,
 *  к нему подходит полуряд брёвен ряда H; столбец спилов стороны начинается под столбом. Перевязи огибают столб. */
export function palisadeCorner(look: Look, side: "e" | "w" = "e", wear: Wear = "clean", seed = 1): PC {
  const c = new PC(40, 96), by = 90, px = 20, half = 5; // столб 10 px (≈1,25 бревна), чуть выше ряда (правки 5)
  // полуряд H со стороны side (брёвна 8 px, как у звена; продолжаются под соседнее звено на 4 px)
  const xs = side === "e" ? [24, 32] : [0, 8];
  for (const [i, x] of xs.entries()) log(c, look, x, 8, 39 + Math.floor(hash01(i, seed, 5) * 4), by, seed + 20 + i, { spike: look.faction === "umb" && i === 0 });
  band(c, look, side === "e" ? 22 : 0, side === "e" ? 40 : 18, 56); band(c, look, side === "e" ? 22 : 0, side === "e" ? 40 : 18, 76);
  // угловой столб
  log(c, look, px - half, half * 2, 35, by, seed + 7, { spike: look.faction === "umb" });
  for (let y = 38; y < by; y++) darken(c, side === "e" ? px - half - 1 : px + half, y, 0.6);
  for (const yy of [55, 75]) for (let x = px - half; x < px + half; x++) {
    const yc = yy + Math.round(Math.sqrt(Math.max(0, 1 - ((x + 0.5 - px) / half) ** 2)) * 2);
    if (look.faction === "umb") { c.set(x, yc, look.trim[3]); c.set(x, yc + 1, look.trim[1]); }
    else { c.set(x, yc, x < px ? hex("#d8b880") : hex("#a88850")); c.set(x, yc + 1, hex("#7a5a30")); }
  }
  if (look.faction === "umb" && wear === "clean") { c.ellipse(px, 26, 3.4, 3.2, hex("#d8d0bc")); c.rect(px - 2, 28, 4, 2, hex("#b8b09c")); c.set(px - 1, 26, OUT); c.set(px + 1, 26, OUT); }
  mound(c, look, 2, 38, by + 2, seed);
  if (wear === "moss") mossPatch(c, 4, 54, 32, 40, look, seed, false);
  if (wear === "ivy") ivy(c, px - 6, 34, 12, 50, seed);
  c.outline(OUT);
  groundHug(c, 2, 36, by + 3, look, seed);
  return c;
}

/** Столб у бокового проёма ворот частокола 32×96: тот же угловой столб без полуряда — проём обрамлён толстыми брёвнами. */
export function palisadePost(look: Look, wear: Wear = "clean", seed = 1): PC {
  const c = new PC(32, 96), by = 90, px = 16, half = 5;
  log(c, look, px - half, half * 2, 35, by, seed + 7, { spike: look.faction === "umb" });
  for (let y = 38; y < by; y++) darken(c, px + half, y, 0.6);
  for (const yy of [55, 75]) for (let x = px - half; x < px + half; x++) {
    const yc = yy + Math.round(Math.sqrt(Math.max(0, 1 - ((x + 0.5 - px) / half) ** 2)) * 2);
    if (look.faction === "umb") { c.set(x, yc, look.trim[3]); c.set(x, yc + 1, look.trim[1]); }
    else { c.set(x, yc, x < px ? hex("#d8b880") : hex("#a88850")); c.set(x, yc + 1, hex("#7a5a30")); }
  }
  mound(c, look, 3, 29, by + 2, seed);
  if (wear === "moss") mossPatch(c, 6, 54, 20, 40, look, seed, false);
  c.outline(OUT);
  groundHug(c, 3, 26, by + 3, look, seed);
  return c;
}

/** Старое бревно-доска с острием — для створок ворот частокола. */
function stake(c: PC, look: Look, x0: number, w: number, top: number, bottom: number, seed: number) {
  const W = look.wood, half = (w - 1) / 2;
  for (let i = 0; i < w; i++) {
    const prof = [1, 2.6, 3.4, 3.2, 2.8, 2.3, 1.8, 1.2, 0.8][Math.floor((i * 9) / w)];
    const t = top + Math.round(Math.abs(i - half) * (6 / half));
    for (let y = t; y < bottom; y++) c.set(x0 + i, y, y < t + 2 ? (i < half ? mix(W[4], hex("#e8d0a8"), 0.4) : W[2]) : tone(W, prof + (hash01(x0 + i, y >> 2, seed) < 0.18 ? -0.7 : 0) - (look.faction === "umb" ? 0.2 : 0)));
  }
}

/** Ворота частокола 160×112 (5 клеток): проём в 3 клетки, по бокам — по два толстых бревна с торцами-спилами на крайних звеньях
 *  (обрамляют проём, как столбы ворот в LPC), перекладина на их верхушках с вывеской; створки — закрыто, открыто, разбито. */
export function palisadeGate(look: Look, state: GateState = "closed", wear: Wear = "clean", seed = 1): PC {
  const GW = 160, c = new PC(GW, 112), W = look.wood;
  const by = 104, cx = 80, aw = 46;
  passage(c, look, cx, aw, 34, 34, by);
  if (state === "open") for (const sgn of [-1, 1]) for (let y = 36; y < by - 1; y++) for (let i = 0; i < 7; i++) {
    const x = sgn < 0 ? cx - aw + i : cx + aw - 1 - i;
    c.set(x, y, tone(W, (sgn < 0 ? 2.2 : 1.3) + (i === 0 ? 0.6 : 0) - (y > by - 5 ? 0.7 : 0)));
    if (y === 50 || y === 80) c.set(x, y, W[4]);
  }
  else {
    for (let k = 0; k < 12; k++) stake(c, look, cx - aw + k * 8 - 2, 8, 30 + (k % 2) * 3, by, seed + 30 + k);
    for (const yy of [48, 78]) for (let x = cx - aw; x < cx + aw; x++) { c.set(x, yy, W[4]); c.set(x, yy + 1, W[3]); c.set(x, yy + 2, W[1]); }
    for (let t = 0; t < 1; t += 0.01) for (const sgn of [-1, 1]) { const x = Math.round(cx + sgn * (aw - 3 - t * (aw - 5))), y = Math.round(51 + t * 26); c.set(x, y, W[4]); c.set(x, y + 1, W[2]); }
    c.rect(cx, 30, 1, by - 30, OUT);
    if (look.faction === "umb") for (const yy of [48, 78]) for (let x = cx - aw + 3; x < cx + aw; x += 7) c.set(x, yy + 1, look.trim[4]);
    if (state === "broken") brokenLeaves(c, look, cx, aw, 30, 40, by, seed);
  }
  // перекладина (за столбами)
  for (let x = 14; x < GW - 14; x++) for (let y = 22; y < 30; y++) c.set(x, y, tone(W, (y === 22 ? 3.6 : y === 29 ? 0.5 : 2.4) + (x % 7 === 0 ? -0.8 : 0)));
  for (let x = 14; x < GW - 14; x++) for (let k = 0; k < 3; k++) darken(c, x, 30 + k, 0.7);
  // столбы: по два толстых бревна на крайних клетках, выше ограды
  for (const px of [0, GW - 32]) {
    for (let k = 0; k < 2; k++) log(c, look, px + k * 16, 16, 8 + ((k + (px ? 1 : 0)) % 2) * 3, by - 2, seed + px + k, { spike: look.faction === "umb" });
    band(c, look, px, px + 32, 40); band(c, look, px, px + 32, 72);
    mound(c, look, px, px + 32, by, seed);
  }
  for (let x = cx - 16; x < cx + 16; x++) for (let y = 11; y < 22; y++) {
    const edge = x === cx - 16 || x === cx + 15 || y === 11 || y === 21;
    c.set(x, y, edge ? W[1] : look.faction === "sol" ? (y < 16 ? look.cloth[2] : look.cloth[1]) : look.cloth[1]);
  }
  if (look.faction === "sol") { c.ellipse(cx, 16, 3, 3, look.cloth2[2]); c.ellipse(cx, 16, 1.6, 1.6, look.cloth2[3]); }
  else { c.ellipse(cx, 16, 3, 3, hex("#d8d0bc")); c.set(cx - 1, 15, OUT); c.set(cx + 1, 15, OUT); }
  if (wear === "moss") mossPatch(c, 0, 70, GW, 36, look, seed, false);
  if (wear === "ivy") { ivy(c, 4, 30, 24, 60, seed); ivy(c, GW - 28, 30, 24, 60, seed + 1); }
  c.outline(OUT);
  groundHug(c, 0, 32, by + 1, look, seed); groundHug(c, GW - 32, 32, by + 1, look, seed + 1);
  return c;
}

export { LOOKS };
