/**
 * Примеры к docs/art/perspective.md: «неправильно | правильно» на наших объектах и схемах (уступ с лестницей, колонна, здание,
 * обрыв, вода ниже уровня, полёт). Игру и ассеты не меняет: читает кадры из client/public/assets, рисует в tools/out/perspective/ex/,
 * монтаж с подписями — headless-браузером в tools/out/perspective/rules-example.png. Длинная тень — та же матрица, что в shadows.ts (SIMPLE).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC, hex, mix, shade, withA, type RGBA, type Ramp } from "./gen/canvas";
import { P, FACTION, TOWN } from "./gen/palette";

const A = "client/public/assets", OUT = path.resolve("tools/out/perspective"), EX = path.join(OUT, "ex");
fs.mkdirSync(EX, { recursive: true });
const tone = (r: Ramp, i: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
const h01 = (x: number, y: number, s = 1) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function readPng(f: string) { const p = PNG.sync.read(fs.readFileSync(f)); const c = new PC(p.width, p.height); c.data.set(p.data); return c; }
const atlas: Record<string, { img: PC; fr: { x: number; y: number; w: number; h: number } }> = {};
for (const a of ["objs0", "objs1"]) { const j = JSON.parse(fs.readFileSync(`${A}/atlas/${a}.json`, "utf8")); const img = readPng(`${A}/atlas/${a}.png`); for (const [k, f] of Object.entries<any>(j.frames)) atlas[k] = { img, fr: f.frame }; }
function obj(k: string): PC {
  const e = atlas[k]; if (!e) return readPng(`${A}/objects/${k}.png`);
  const c = new PC(e.fr.w, e.fr.h); for (let y = 0; y < e.fr.h; y++) for (let x = 0; x < e.fr.w; x++) { const p = e.img.get(e.fr.x + x, e.fr.y + y); if (p && p[3]) c.set(x, y, p); } return c;
}
const heroSheet = readPng(`${A}/units/warrior.png`);
const hero = (() => { const c = new PC(32, 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const p = heroSheet.get(x, y); if (p && p[3]) c.set(x, y, p); } return c; })();
/** Пиксель запечённой контактной тени (tools/gen/shadow.ts: тёмный, полупрозрачный). */
const isShadowPx = (p: RGBA | null) => !!p && p[3] > 0 && p[3] <= 130 && p[0] < 50 && p[1] < 50 && p[2] < 60;

// ---------- фон ----------
const G = P.grass, ST = P.stone, DIRT = P.dirt, WATER = P.water, WOOD = P.wood;
function ground(w: number, h: number, kind: "grass" | "stone" = "grass"): PC {
  const c = new PC(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = h01(x >> 1, y >> 1, 3);
    c.set(x, y, kind === "grass" ? tone(G, 2 + (n < 0.15 ? -1 : n > 0.9 ? 1 : 0)) : tone(ST, 2 + ((x % 32 === 0 || y % 32 === 0) ? -1 : n > 0.92 ? 1 : 0)));
  }
  return c;
}
/** Пунктир клетки коллизии (TILE 32) с низом на yb (= нижняя кромка клетки). */
function collTile(c: PC, x0: number, yb: number, n = 1) {
  const col = hex("#ffe24a", 200);
  for (let i = 0; i < 32 * n; i++) if ((i >> 1) % 2 === 0) { c.set(x0 + i, yb - 32, col); c.set(x0 + i, yb - 1, col); }
  for (let j = 0; j < 32; j++) if ((j >> 1) % 2 === 0) { c.set(x0, yb - 32 + j, col); c.set(x0 + 32 * n - 1, yb - 32 + j, col); }
}
/** Точка опоры (origin) — красный крестик. */
function originMark(c: PC, x: number, y: number) { const r = hex("#ff3030"); for (let d = -2; d <= 2; d++) { c.set(x + d, y, r); c.set(x, y + d, r); } }

/** Длинная тень клиента (client/src/game/shadows.ts, режим «Простые»: матрица [[1, −k], [0, −sy]] от точки опоры кадра). */
function dynShadow(dst: PC, src: PC, px: number, py: number, ox: number, oy: number, k = -0.55, sy = 0.3, a = 0.46) {
  const W = src.w, Hh = src.h;
  for (let Y = 0; Y < Math.ceil(Hh * sy) + 2; Y++) for (let X = -W - Math.ceil(Math.abs(k) * Hh); X < W + Math.ceil(Math.abs(k) * Hh); X++) {
    const ly = -Y / sy, lx = X + k * ly; // локальные координаты источника относительно опоры (ly < 0 — вверх)
    const sx = Math.floor(ox + lx), syy = Math.floor(oy + ly);
    const p = src.get(sx, syy);
    if (p && p[3] > 40) dst.set(px + X, py + Y, withA(hex("#000000"), Math.round(255 * a)));
  }
}
/** Симметричный контакт (AO) под основанием: полоса 2 px по ширине опоры + 1 px по бокам. */
function contact(dst: PC, x0: number, x1: number, yb: number) {
  for (let x = x0 - 1; x <= x1 + 1; x++) { dst.set(x, yb, withA(hex("#0c0812"), x < x0 || x > x1 ? 90 : 150)); if (x >= x0 && x <= x1) dst.set(x, yb + 1, withA(hex("#0c0812"), 70)); }
}
function baseRow(s: PC) { for (let y = s.h - 1; y >= 0; y--) for (let x = 0; x < s.w; x++) { const p = s.get(x, y); if (p && p[3] >= 160 && !isShadowPx(p)) return y; } return s.h - 1; }

/** Пара «как сейчас в игре | исправлено» для реального кадра: опора у низа кадра (пустые ряды → зазор) против опоры по основанию. */
function pairReal(k: string) {
  const s = obj(k), b = baseRow(s), pad = s.h - 1 - b, W = s.w + 70, H = s.h + 30;
  const L = ground(W, H), R = ground(W, H), px = 26 + Math.round(s.w / 2), py = H - 14;
  // слева: как в игре — кадр с origin (0.5, 1), тень разворачивается от нижней кромки кадра (под ней — pad пустых рядов)
  dynShadow(L, s, px, py, s.w / 2, s.h);
  L.blit(s, px - Math.round(s.w / 2), py - s.h);
  originMark(L, px, py);
  // справа: пустые ряды и косая запечённая тень срезаны, опора = нижняя кромка основания, тень и AO начинаются от неё
  const t = new PC(s.w, b + 1);
  for (let y = 0; y <= b; y++) for (let x = 0; x < s.w; x++) { const p = s.get(x, y); if (p && p[3] && !isShadowPx(p)) t.set(x, y, p); }
  dynShadow(R, t, px, py, t.w / 2, t.h);
  let x0 = t.w, x1 = 0; for (let x = 0; x < t.w; x++) { const p = t.get(x, b); if (p && p[3] > 160) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
  contact(R, px - Math.round(t.w / 2) + x0, px - Math.round(t.w / 2) + x1, py);
  R.blit(t, px - Math.round(t.w / 2), py - t.h + 1);
  originMark(R, px, py);
  return { L, R, pad };
}

// ---------- колонна ----------
function column(right: boolean): PC {
  const c = ground(96, 112, "stone"), cx = 48, yb = 96; // yb — нижняя кромка клетки коллизии (тайл 32..64 по x)
  if (right) {
    // след = клетка: плинт 30 px шириной, верх 12 px глубиной, лицо 6 px; AO под лицом и по краю верха
    for (let x = cx - 15; x < cx + 15; x++) { c.set(x, yb, withA(hex("#0c0812"), 150)); c.set(x, yb + 1, withA(hex("#0c0812"), 70)); }
    for (let y = yb - 6; y < yb; y++) for (let x = cx - 15; x < cx + 15; x++) c.set(x, y, tone(ST, y === yb - 6 ? 3 : x < cx - 8 ? 2 : x > cx + 9 ? 1 : 2));
    for (let y = yb - 18; y < yb - 6; y++) for (let x = cx - 15; x < cx + 15; x++) c.set(x, y, tone(ST, y === yb - 18 ? 4 : 3));
    // ствол стоит на плинте (низ ствола в середине верхней плоскости), тень ствола на плинте справа
    const sb = yb - 11;
    for (let y = sb - 56; y < sb; y++) for (let x = cx - 8; x < cx + 8; x++) { const u = (x + 0.5 - cx) / 8; c.set(x, y, tone(ST, 3.2 - 1.6 * (u + 0.3) * (u > -0.3 ? 1.4 : 0.6))); }
    for (let x = cx - 9; x < cx + 9; x++) c.set(x, sb, withA(hex("#0c0812"), 120));
    for (let y = sb - 64; y < sb - 56; y++) for (let x = cx - 12; x < cx + 12; x++) c.set(x, y, tone(ST, y < sb - 61 ? 4 : 2));
  } else {
    // ствол прямо на полу: нет основания, нет контакта, низ — прямая черта; где кончается проходимость — не понять
    for (let y = yb - 70; y < yb - 4; y++) for (let x = cx - 8; x < cx + 8; x++) { const u = (x + 0.5 - cx) / 8; c.set(x, y, tone(ST, 3.2 - 1.6 * (u + 0.3) * (u > -0.3 ? 1.4 : 0.6))); }
    for (let y = yb - 78; y < yb - 70; y++) for (let x = cx - 12; x < cx + 12; x++) c.set(x, y, tone(ST, y < yb - 75 ? 4 : 2));
  }
  collTile(c, cx - 16, yb);
  c.blit(hero, cx + 18, yb - 31);
  return c;
}

// ---------- уступ (24 px) с лестницей на 3 ступени ----------
function ledge(right: boolean): PC {
  const W = 160, H = 128, c = new PC(W, H), foot = 100, LH = 24; // foot — линия подножия; верх обрыва — foot − LH
  const top = foot - LH;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, tone(G, 2 + (h01(x >> 1, y >> 1, 7) > 0.9 ? 1 : 0)));
  // плато: трава выше (светлее на ступень), лицо обрыва — камень рядами, темнеет книзу; кромка травы нависает на 1–2 px
  for (let y = 0; y < top; y++) for (let x = 0; x < W; x++) c.set(x, y, tone(G, 3 + (h01(x >> 1, y >> 1, 9) > 0.9 ? 1 : 0)));
  const sx0 = 64, sx1 = 96; // проём лестницы (1 тайл)
  for (let y = top; y < foot; y++) for (let x = 0; x < W; x++) {
    if (right && x >= sx0 && x < sx1) continue;
    const row = Math.floor((y - top) / 6), brick = Math.floor((x + row * 7) / 12);
    const v = 2.6 - ((y - top) / LH) * 1.4 + (h01(brick, row, 4) - 0.5) * 0.7 - ((y - top) % 6 === 5 || (x + row * 7) % 12 === 0 ? 0.9 : 0);
    c.set(x, y, tone(ST, v));
  }
  for (let x = 0; x < W; x++) { if (right && x >= sx0 && x < sx1) continue; c.set(x, top, tone(G, 4)); c.set(x, top + 1, tone(G, h01(x, 1, 2) > 0.5 ? 1 : 2)); if (h01(x, 3, 3) > 0.7) c.set(x, top + 2, tone(G, 1)); }
  // AO у подножия: 2 px темнее по траве
  for (let x = 0; x < W; x++) { if (right && x >= sx0 && x < sx1) continue; c.set(x, foot, withA(hex("#0c0812"), 140)); c.set(x, foot + 1, withA(hex("#0c0812"), 60)); }
  if (right) {
    // 3 ступени, вырубленные в уступ: подступёнок 8 px (тёмный, лицо), проступь 8 px (светлый верх); верх 3-й проступи = уровень плато
    for (let i = 0; i < 3; i++) {
      const rb = foot - i * 16, rt = rb - 8, tt = rt - 8;
      for (let y = rt; y < rb; y++) for (let x = sx0; x < sx1; x++) c.set(x, y, tone(ST, 1.6 - (y - rt) * 0.08 + (x === sx0 ? 0.6 : 0)));
      for (let y = tt; y < rt; y++) for (let x = sx0; x < sx1; x++) c.set(x, y, tone(ST, y === rt - 1 ? 4 : 3));
      for (let x = sx0; x < sx1; x++) c.set(x, rb, withA(hex("#0c0812"), 120));
    }
    // щёки проёма: левая освещена 1 px, правая — тень 2 px (свет слева); выше плато щёки — трава
    for (let y = foot - 48; y < foot; y++) { c.set(sx0, y, tone(ST, 4)); c.set(sx1 - 1, y, withA(hex("#0c0812"), 150)); c.set(sx1 - 2, y, withA(hex("#0c0812"), 70)); }
    c.blit(hero, 104, foot - 30 - LH); // герой на плато
    c.blit(hero, 28, foot - 30); // герой внизу
  } else {
    // «полоски»: лестница — светлые и тёмные штрихи прямо по траве, без лица обрыва и без подступёнков
    for (let i = 0; i < 6; i++) for (let x = sx0; x < sx1; x++) c.set(x, foot - 40 + i * 8, tone(WOOD, 3));
    c.blit(hero, 104, foot - 30 - LH); c.blit(hero, 28, foot - 30);
  }
  return c;
}

// ---------- здание ----------
function house(): PC {
  const W = 150, H = 150, c = ground(W, H), x0 = 30, x1 = 118, yb = 132, wallH = 44, roofH = 34, eave = 3;
  // тень здания на землю (утро — влево-вниз) от линии фасада
  for (let y = yb; y < yb + 10; y++) for (let x = x0 - 18 + (y - yb); x < x1 - 4; x++) c.set(x, y, withA(hex("#000000"), 90));
  // фасад: доски, темнее к низу; AO у основания
  for (let y = yb - wallH; y < yb; y++) for (let x = x0; x < x1; x++) c.set(x, y, tone(WOOD, 3 - ((y - (yb - wallH)) / wallH) * 1.2 - ((x - x0) % 8 === 0 ? 1 : 0)));
  for (let x = x0 - 1; x <= x1; x++) { c.set(x, yb, withA(hex("#0c0812"), 160)); c.set(x, yb + 1, withA(hex("#0c0812"), 70)); }
  // дверь у основания (низ двери = земля), порог 2 px
  for (let y = yb - 22; y < yb; y++) for (let x = 66; x < 80; x++) c.set(x, y, tone(WOOD, 0.6));
  for (let x = 64; x < 82; x++) { c.set(x, yb - 1, tone(ST, 3)); c.set(x, yb - 2, tone(ST, 4)); }
  for (const wx of [40, 94]) for (let y = yb - 34; y < yb - 22; y++) for (let x = wx; x < wx + 12; x++) c.set(x, y, y === yb - 34 ? tone(ST, 4) : hex("#2a3550"));
  // скат крыши: видна верхняя плоскость (черепица рядами, светлеет к коньку), свес eave px за фасад + тень под свесом 3 px
  const ry0 = yb - wallH - roofH;
  for (let y = ry0; y < yb - wallH + eave; y++) for (let x = x0 - eave; x < x1 + eave; x++) c.set(x, y, tone(P.roofRed, 1.4 + ((yb - wallH - y) / roofH) * 2.2 - ((y - ry0) % 5 === 4 ? 0.8 : 0)));
  for (let x = x0 - eave; x < x1 + eave; x++) c.set(x, ry0, tone(P.roofRed, 4));
  for (let y = yb - wallH + eave; y < yb - wallH + eave + 3; y++) for (let x = x0; x < x1; x++) c.set(x, y, withA(hex("#0c0812"), 110));
  c.blit(hero, 122, yb - 30);
  return c;
}

// ---------- обрыв (пропасть) и вода ниже уровня ----------
function chasm(): PC {
  const W = 150, H = 110, c = new PC(W, H), edge = 50;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, mix(mix(hex("#05040a"), hex("#1a1626"), Math.max(0, 1 - (y - edge) / 50)), hex("#5a140c"), Math.max(0, (y - H + 22) / 40)));
  for (let y = 0; y < edge; y++) for (let x = 0; x < W; x++) c.set(x, y, tone(ST, 2 + ((x % 32 === 0 || y % 32 === 0) ? -1 : 0)));
  // кромка 1 px светлая, торец плит 10 px вниз — темнеет по глубине, ниже — темнота с размытием
  for (let x = 0; x < W; x++) c.set(x, edge - 1, tone(ST, 4));
  for (let y = edge; y < edge + 10; y++) for (let x = 0; x < W; x++) c.set(x, y, mix(tone(ST, 1.6 - (x % 32 === 0 ? 1 : 0)), hex("#05040a"), (y - edge) / 12));
  for (let y = edge + 10; y < edge + 26; y++) for (let x = 0; x < W; x++) if (h01(x, y, 5) < 0.25 - (y - edge - 10) / 70) c.set(x, y, tone(ST, 0));
  c.blit(hero, 60, edge - 34);
  return c;
}
function pond(): PC {
  const W = 150, H = 110, c = ground(W, H), cx = 75, cy = 62, rx = 52, ry = 30, lip = 5;
  // вода на 5 px ниже земли: дальний (верхний) берег показывает внутреннюю стенку 5 px (земля/камень), ближний — только кромка
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d >= 1) continue;
    const dUp = Math.hypot((x - cx) / rx, (y - lip - cy) / ry); // точка на 5 px выше — ещё внутри?
    const wall = dUp >= 1; // под дальним берегом — стенка
    c.set(x, y, wall ? tone(DIRT, 1.2 + ((y % 3 === 0) ? -0.6 : 0)) : tone(WATER, 2 + (h01(x >> 2, y, 6) > 0.93 ? 2 : 0) - (Math.hypot((x - cx) / rx, (y - lip * 2 - cy) / ry) >= 1 ? 0.8 : 0)));
  }
  // кромка берега 1 px светлее по всей окружности
  for (let a = 0; a < 360; a += 0.5) { const t = (a * Math.PI) / 180; c.set(Math.round(cx + Math.cos(t) * rx), Math.round(cy + Math.sin(t) * ry), tone(G, 4)); }
  c.blit(hero, 12, 56);
  return c;
}

// ---------- храм на цоколе с центральной лестницей (Сольгард, белый камень Аурелиона, пепельная земля) ----------
function temple(): PC {
  const W = 170, H = 170, c = new PC(W, H), WH = FACTION.WHITE, ASH = P.ash;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, tone(ASH, 2 + (h01(x >> 1, y >> 1, 4) > 0.9 ? 1 : h01(x >> 1, y >> 1, 5) < 0.08 ? -1 : 0)));
  const px0 = 25, px1 = 145, ptop = 58, pfront = 128, plH = 12; // площадка: верх ptop..pfront-plH, лицо цоколя plH px
  const pt = pfront - plH;
  // AO у подножия цоколя и тень от него (утро — влево-вниз)
  for (let y = pfront; y < pfront + 6; y++) for (let x = px0 - 6 + (y - pfront); x < px1 - 2; x++) c.set(x, y, withA(hex('#000000'), 70));
  for (let x = px0 - 1; x <= px1; x++) { c.set(x, pfront, withA(hex('#0c0812'), 160)); c.set(x, pfront + 1, withA(hex('#0c0812'), 70)); }
  // верх площадки — плиты (светлее), кромка 1 px светлая
  for (let y = ptop; y < pt; y++) for (let x = px0; x < px1; x++) c.set(x, y, tone(WH, 2.4 + ((x - px0) % 16 === 0 || (y - ptop) % 12 === 0 ? -0.9 : 0)));
  for (let x = px0; x < px1; x++) c.set(x, pt - 1, tone(WH, 4));
  // лицо цоколя — блоки, темнее (вертикаль = меньше света), темнеет книзу
  for (let y = pt; y < pfront; y++) for (let x = px0; x < px1; x++) c.set(x, y, tone(WH, 1.4 - (y - pt) / plH * 0.7 - ((y - pt) % 6 === 5 || (x + ((y - pt) >= 6 ? 8 : 0)) % 16 === 0 ? 0.8 : 0)));
  // центральная лестница: 3 ступени, подступёнок 4 px, проступь 4 px, выступает вперёд на 12 px; щёки-парапеты по бокам
  const sx0 = 72, sx1 = 98;
  for (let i = 0; i < 3; i++) {
    const rb = pfront + 12 - i * 8, rt = rb - 4, tt = rt - 4;
    for (let y = tt; y < rt; y++) for (let x = sx0; x < sx1; x++) c.set(x, y, tone(WH, y === rt - 1 ? 4 : 3));
    for (let y = rt; y < rb; y++) for (let x = sx0; x < sx1; x++) c.set(x, y, tone(WH, 1.3));
  }
  for (let x = sx0 - 1; x <= sx1; x++) { c.set(x, pfront + 12, withA(hex('#0c0812'), 150)); c.set(x, pfront + 13, withA(hex('#0c0812'), 60)); }
  for (const [cx0, lit] of [[sx0 - 5, true], [sx1, false]] as const) {
    for (let y = pt - 2; y < pfront + 12; y++) for (let x = cx0; x < cx0 + 5; x++) c.set(x, y, tone(WH, y < pt + 2 ? 4 : lit ? 2.4 : 1.2));
    for (let x = cx0 - 1; x <= cx0 + 5; x++) c.set(x, pfront + 12, withA(hex('#0c0812'), 150));
  }
  // жаровни Сольгарда у входа: стоят на земле (AO), огонь сверху
  for (const bx of [58, 108]) { c.ellipse(bx + 2, pfront + 14, 5, 1.6, withA(hex('#0c0812'), 140)); for (let y = pfront + 4; y < pfront + 14; y++) for (let x = bx - 2; x < bx + 3; x++) c.set(x, y, tone(P.gold ?? WH, x < bx ? 3 : 1)); for (let y = pfront + 1; y < pfront + 4; y++) for (let x = bx - 4; x < bx + 5; x++) c.set(x, y, tone(TOWN.ST, y === pfront + 1 ? 4 : 2)); c.poly([[bx - 3, pfront + 1], [bx, pfront - 7], [bx + 3, pfront + 1]], tone(P.magic.fire, 3)); }
  // святилище на площадке: фасад 40 px, тёмный проём по оси лестницы, двускатный фронтон (видна плоскость ската)
  const fx0 = 52, fx1 = 118, fb = pt - 6, fh = 40;
  for (let x = fx0 - 1; x <= fx1; x++) c.set(x, fb, withA(hex('#0c0812'), 150));
  for (let y = fb - fh; y < fb; y++) for (let x = fx0; x < fx1; x++) c.set(x, y, tone(WH, 2.2 - (y - (fb - fh)) / fh * 0.8 - ((x - fx0) % 11 === 0 ? 0.7 : 0)));
  for (let y = fb - 26; y < fb; y++) for (let x = 77; x < 93; x++) c.set(x, y, tone(FACTION.DARK, y < fb - 22 ? 2 : 0));
  c.poly([[fx0 - 4, fb - fh + 1], [85, fb - fh - 26], [fx1 + 4, fb - fh + 1]], (x, y) => tone(TOWN.ROOF_SLATE, 1.4 + (fb - fh - y) / 26 * 2.2 - (x > 85 ? 0.7 : 0)));
  for (let x = fx0; x < fx1; x++) c.set(x, fb - fh + 2, withA(hex('#0c0812'), 120));
  c.blit(hero, 130, pfront + 10 - 30); // герой на земле
  c.blit(hero, 34, pt - 28); // герой на площадке
  return c;
}

// ---------- подъём внутри помещения: каменный пол и деревянный помост +8 px, бордюр, 1 ступень ----------
function dais(): PC {
  const W = 170, H = 110, c = new PC(W, H), FL = P.floor, edge = 84, rise = 8, kx0 = 92; // помост справа и сверху
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, tone(FL, 2 + ((x % 32 === 0 || y % 32 === 0) ? -1 : h01(x >> 1, y >> 1, 9) > 0.92 ? 1 : 0)));
  // помост: доски (дерево), верх на rise выше; бордюр — каменная кромка 3 px сверху + торец rise px вниз; AO у торца
  for (let y = 0; y < edge - rise; y++) for (let x = kx0; x < W; x++) c.set(x, y, tone(WOOD, 2.4 + (y % 8 === 0 ? -1 : 0) + (h01(x >> 3, y >> 3, 2) - 0.5) * 0.6));
  for (let y = edge - rise - 3; y < edge - rise; y++) for (let x = kx0 - 3; x < W; x++) c.set(x, y, tone(TOWN.ST, y === edge - rise - 3 ? 5 : 3.6));
  for (let y = 0; y < edge - rise; y++) for (let x = kx0 - 3; x < kx0; x++) c.set(x, y, tone(TOWN.ST, x === kx0 - 3 ? 5 : 3.6));
  for (let y = edge - rise; y < edge; y++) for (let x = kx0 - 3; x < W; x++) c.set(x, y, tone(TOWN.ST, 1.6 - (y - edge + rise) * 0.1 - ((x % 12) === 0 ? 0.6 : 0)));
  for (let x = kx0 - 4; x < W; x++) { c.set(x, edge, withA(hex('#0c0812'), 150)); c.set(x, edge + 1, withA(hex('#0c0812'), 60)); }
  // левый торец помоста не виден (вертикаль, смотрим спереди) — только светлая кромка 3 px и тень 2 px на полу слева от неё
  for (let y = 0; y < edge; y++) { c.set(kx0 - 4, y, withA(hex('#0c0812'), 110)); c.set(kx0 - 5, y, withA(hex('#0c0812'), 50)); }
  // ступень в бордюре: проём 32 px, подступёнок 4 + проступь 4 — два раза по 4 = 8
  for (let x = 120; x < 152; x++) { for (let y = edge - 4; y < edge; y++) c.set(x, y, tone(WOOD, 1.2)); for (let y = edge - 8; y < edge - 4; y++) c.set(x, y, tone(WOOD, y === edge - 5 ? 4 : 3)); for (let y = edge - rise - 3; y < edge - 8; y++) c.set(x, y, tone(WOOD, 2.6)); }
  c.blit(hero, 30, edge + 10 - 30); c.blit(hero, 130, edge - rise - 12 - 30 + 10);
  return c;
}

// ---------- высота и полёт ----------
function flight(): PC {
  const W = 150, H = 80, c = ground(W, H), gy = 66;
  // стоит: контактная тень-эллипс 12×4 прямо под ступнями, плотная
  c.ellipse(32, gy, 7, 2.2, withA(hex("#0c0812"), 130)); c.blit(hero, 16, gy - 30);
  // прыжок h = 12: тень на земле на месте, меньше (×0,7) и светлее, спрайт выше на 12
  c.ellipse(75, gy, 5, 1.6, withA(hex("#0c0812"), 90)); c.blit(hero, 59, gy - 30 - 12);
  // полёт h = 28: тень маленькая (×0,5) и бледная, без контакта; спрайт выше на 28
  c.ellipse(118, gy, 3.5, 1.2, withA(hex("#0c0812"), 60)); c.blit(hero, 102, gy - 30 - 28);
  return c;
}

const up = (s: PC, k: number) => { const o = new PC(s.w * k, s.h * k); for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const p = s.get(Math.floor(x / k), Math.floor(y / k)); if (p) o.set(x, y, p); } return o; };
const save = (n: string, p: PC) => { up(p, 3).save(path.join(EX, `${n}.png`)); return n; };

const ts = pairReal("teleport_stone"), rk = pairReal("rock"), lp = pairReal("lamp");
save("ts-wrong", ts.L); save("ts-right", ts.R); save("rock-wrong", rk.L); save("rock-right", rk.R); save("lamp-wrong", lp.L); save("lamp-right", lp.R);
save("col-wrong", column(false)); save("col-right", column(true));
save("ledge-wrong", ledge(false)); save("ledge-right", ledge(true));
save("house", house()); save("temple", temple()); save("dais", dais()); save("chasm", chasm()); save("pond", pond()); save("flight", flight());
fs.writeFileSync(path.join(EX, "pads.json"), JSON.stringify({ teleport_stone: ts.pad, rock: rk.pad, lamp: lp.pad }));

// монтаж: подписи кириллицей рисует браузер
async function montage() {
  const puppeteer = (await import("puppeteer-core")).default;
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p))!;
  const img = (n: string) => `<img src="data:image/png;base64,${fs.readFileSync(path.join(EX, `${n}.png`)).toString("base64")}">`;
  const pair = (t: string, a: string, b: string, na: string, nb: string) => `<section><h4>${t}</h4><div class=p><figure>${img(a)}<figcaption class=bad>✗ ${na}</figcaption></figure><figure>${img(b)}<figcaption class=ok>✓ ${nb}</figcaption></figure></div></section>`;
  const one = (t: string, a: string, n: string) => `<section><h4>${t}</h4><figure>${img(a)}<figcaption class=ok>✓ ${n}</figcaption></figure></section>`;
  const html = `<html><body><h3>Правила перспективы — примеры (docs/art/perspective.md). Красный крест — точка опоры (origin), жёлтый пунктир — клетка коллизии 32×32</h3><div class=g>
  ${pair("1. Камень телепорта (наш кадр 48×80)", "ts-wrong", "ts-right", `как в игре: под основанием ${ts.pad} пустых ряда, длинная тень разворачивается от низа кадра → зазор, объект «парит»; запечённая тень косо вправо`, "кадр обрезан по основанию: опора = нижняя кромка постамента, тень и AO начинаются прямо от неё")}
  ${pair("2. Камень rock (наш кадр 32×28)", "rock-wrong", "rock-right", `пустых рядов под камнем: ${rk.pad} → тень отделена полосой травы`, "опора по основанию, 2 px AO под всей шириной")}
  ${pair("3. Фонарь lamp (наш кадр)", "lamp-wrong", "lamp-right", `пустых рядов: ${lp.pad}`, "опора по основанию")}
  ${pair("4. Колонна: читаемый след", "col-wrong", "col-right", "ствол прямо на полу: нет плинта и контакта — не видно, где кончается проход", "плинт = клетка коллизии (30 px, верх 12, лицо 6), AO, ствол стоит в середине верха")}
  ${pair("5. Уступ 24 px + лестница на 3 ступени", "ledge-wrong", "ledge-right", "лестница — полоски по траве, у уступа нет лица и тени: уровень не читается", "лицо обрыва из камня (темнеет книзу), кромка травы, AO у подножия; ступени 8+8 px, верх 3-й = плато")}
  ${one("6. Здание", "house", "фасад 44 px (1,5 героя), скат крыши 34 px виден сверху, свес 3 px + тень под свесом, дверь и порог у земли, тень от линии фасада")}
  ${one("6б. Храм на цоколе с центральной лестницей (Сольгард)", "temple", "цоколь 12 px: светлая кромка, тёмное лицо блоками, AO и тень у подножия; лестница по оси входа: 3 × (4+4) px, выступает на 12 px, щёки по бокам; жаровни стоят на земле; фасад 40 px, скат крыши виден")}
  ${one("6в. Подъём в помещении: помост +8 px", "dais", "каменный пол ниже, деревянный помост выше на 8 px: бордюр — светлая кромка 3 px сверху + торец 8 px вниз, AO у торца; ступень 4+4 в проёме бордюра")}
  ${one("7. Обрыв / пропасть", "chasm", "кромка 1 px светлая, торец плит 10 px вниз темнеет к чёрному, ниже — темнота")}
  ${one("8. Вода ниже уровня", "pond", "вода на 5 px ниже: под дальним берегом видна внутренняя стенка, ближний берег — только кромка")}
  ${one("9. Высота и полёт", "flight", "стоит: плотная тень под ступнями · прыжок 12 px: тень на месте, меньше и светлее · полёт 28 px: маленькая бледная тень, спрайт выше")}
  </div><style>body{margin:0;background:#14121a;color:#f0e2c0;font:13px "Segoe UI",sans-serif}h3{margin:8px 12px}.g{display:flex;flex-wrap:wrap;gap:10px;padding:8px;align-items:flex-start}section{background:#1e1a26;padding:6px 8px;border:1px solid #3a3448}h4{margin:2px 0 6px;color:#ffd890}.p{display:flex;gap:8px}figure{margin:0;max-width:480px}figcaption{max-width:470px;padding-top:3px}img{image-rendering:pixelated;display:block}.bad{color:#ff9070}.ok{color:#9be08a}</style></body></html>`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"], defaultViewport: { width: 1900, height: 800 } });
  try { const page = await browser.newPage(); await page.setContent(html); await page.screenshot({ path: path.join(OUT, "rules-example.png"), fullPage: true }); } finally { await browser.close(); }
  console.log("rules-example.png", JSON.stringify({ ts: ts.pad, rock: rk.pad, lamp: lp.pad }));
}
montage().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
