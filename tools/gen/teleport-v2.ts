/**
 * Камень телепорта v2 (предложение, в игру не включён; правила — docs/art-perspective.md): кадр 48×76, опора — середина нижней кромки цоколя.
 *  цоколь-ступень 32 px (= клетка коллизии 1×1) с видимым верхом и лицом → постамент 24 px с верхом 8 и лицом в рунах → гнездо-оправа →
 *  огранённый кристалл (светлая левая грань, средняя, тёмная правая, блик по ребру). AO симметричный, 2 ряда под цоколем; пустых рядов снизу нет.
 *  Варианты: sol — белый камень Аурелиона и золото (Аурелион, Рассветный форт), umb — тёмный камень Мортхейма и фиолет (Мортхейм, Форт Чёрной Вахты),
 *  neutral — городской камень Эмберхолла и железо. Кристалл у всех синий (узнаваемость телепорта), руны и оправа — цвета фракции.
 */
import { PC, hex, mix, ramp, shade, withA, type RGBA, type Ramp } from "./canvas";
import { P, FACTION, TOWN } from "./palette";

export type TpVariant = "sol" | "umb" | "neutral";
const OUTL = hex("#141018");
const AO = hex("#0c0812");
const tone = (r: Ramp, i: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
const h01 = (x: number, y: number, s = 1) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const STYLE: Record<TpVariant, { st: Ramp; trim: Ramp; rune: Ramp }> = {
  sol: { st: FACTION.WHITE, trim: P.gold, rune: P.gold },
  // Мортхейм: камень светлее тёмной плитки площади (читается за подписями стражи), руны — верхние тона фиолета
  umb: { st: ramp("#2c2638", "#40384f", "#574d6b", "#71668a", "#8f84aa"), trim: P.magic.purple, rune: [P.magic.purple[2], P.magic.purple[3], P.magic.purple[4], P.magic.purple[4], P.magic.purple[4]] },
  neutral: { st: TOWN.ST, trim: P.darkSteel, rune: P.magic.blue },
};

/** Брусок 3/4: верх (y0..y0+top) светлый с кромкой, лицо (ниже, face px) темнее и темнеет книзу; без боковой грани. */
function slab(c: PC, x0: number, x1: number, yTop: number, top: number, face: number, R: Ramp, hi: number, seed: number, blocks = 0) {
  const n = R.length - 1;
  for (let y = yTop; y < yTop + top; y++) for (let x = x0; x < x1; x++) {
    const t = (x - x0) / (x1 - x0);
    c.set(x, y, tone(R, hi - 0.6 + (y === yTop ? 1 : 0) - t * 0.5 + (h01(x >> 2, y >> 1, seed) > 0.85 ? -0.6 : 0)));
  }
  for (let y = yTop + top; y < yTop + top + face; y++) for (let x = x0; x < x1; x++) {
    const t = (x - x0) / (x1 - x0), d = (y - yTop - top) / Math.max(1, face);
    const joint = blocks && ((x - x0 + (Math.floor((y - yTop - top) / 5) % 2) * 6) % 12 === 0 || (y - yTop - top) % 5 === 4);
    c.set(x, y, tone(R, Math.min(n, hi - 2.3) + (x === x0 ? 0.7 : 0) - t * 0.9 - d * 0.5 - (joint ? 0.8 : 0) + (y === yTop + top ? 0.4 : 0)));
  }
}

export function teleportStoneV2(v: TpVariant): PC {
  const c = new PC(48, 76), S = STYLE[v], B = P.magic.blue, cx = 24;
  const base = 73; // нижняя кромка цоколя (ряды 74–75 — AO)
  // AO под цоколем: симметричный, на 1 px шире
  for (let x = 7; x <= 40; x++) { c.set(x, base + 1, withA(AO, x < 8 || x > 39 ? 90 : 150)); if (x >= 8 && x <= 39) c.set(x, base + 2, withA(AO, 65)); }
  // цоколь-ступень: 32 px (клетка), верх 10, лицо 4
  slab(c, 8, 40, base - 13, 10, 4, S.st, 3.6, 3);
  // постамент: 24 px, верх 7, лицо 12 блоками; стоит на середине верха цоколя → AO на верхе цоколя
  const pb = base - 10; // низ лица постамента (передняя кромка) — 3 px верха цоколя видно впереди
  for (let x = 10; x <= 37; x++) { c.set(x, pb + 1, withA(AO, 130)); c.set(x, pb + 2, withA(AO, 50)); }
  slab(c, 11, 37, pb - 17, 7, 10, S.st, 4, 5, 1);
  // руны на лице постамента и окантовка верха цветом фракции
  for (const rx of [16, 23, 30]) { c.set(rx, pb - 7, S.rune[3]); c.set(rx + 1, pb - 6, S.rune[2]); c.set(rx, pb - 5, S.rune[3]); c.set(rx + 1, pb - 4, S.rune[1]); }
  for (let x = 11; x < 37; x++) c.set(x, pb - 10, tone(S.trim, x < 22 ? 3 : 2));
  // гнездо-оправа на верхе постамента: тёмная лунка, кольцо, 4 лапы обхватывают низ кристалла
  const sy = pb - 13; // центр верха постамента
  c.ellipse(cx, sy, 8, 2.4, withA(AO, 170));
  c.ellipse(cx, sy - 0.5, 7, 2, tone(S.trim, 1));
  c.ellipse(cx, sy - 1, 5.5, 1.4, tone(S.trim, 3));
  // кристалл: шестигранник, низ уходит в оправу
  const yb = sy - 1, yt = 10, hw = 6;
  for (let y = yt; y <= yb; y++) {
    const k = Math.min(1, (y - yt) / 14), w = Math.round(hw * k + (y > yb - 3 ? -1 : 0));
    for (let x = cx - w; x <= cx + w; x++) {
      const u = (x - cx) / Math.max(1, w), face = u < -0.33 ? 0 : u < 0.4 ? 1 : 2;
      let col = tone(B, [3.3, 2.2, 1.1][face] - ((y - yt) / (yb - yt)) * 0.7);
      const core = Math.hypot((x - cx) / 3.5, (y - 30) / 12);
      if (core < 1) col = mix(col, B[4], 0.45 * (1 - core));
      c.set(x, y, col);
    }
  }
  // блик по левому ребру и на вершине
  for (let y = yt + 4; y < yb - 6; y++) c.set(cx - Math.round(hw * Math.min(1, (y - yt) / 14) * 0.33) - 1, y, mix(B[3], B[4], 0.6));
  c.set(cx, yt, hex("#ffffff")); c.set(cx - 1, yt + 2, B[4]);
  // лапы оправы поверх низа кристалла
  for (const [px, d] of [[cx - 5, -1], [cx - 2, 0], [cx + 2, 0], [cx + 5, 1]] as const) for (let k = 0; k < 5; k++) c.set(Math.round(px + d * k * 0.2), yb - k, k === 4 ? tone(S.trim, 4) : tone(S.trim, px < cx ? 3 : 2));
  // тень кристалла на верх постамента (короткая, вправо от оправы — внутри верхней плоскости)
  for (let x = cx + 6; x < cx + 11; x++) c.set(x, sy, withA(AO, 80));
  // отсвет кристалла на верхе постамента и цоколя
  for (let x = 12; x < 36; x++) { const p = c.get(x, sy + 2); if (p && p[3]) c.set(x, sy + 2, mix(p, B[3], 0.25 * (1 - Math.abs(x - cx) / 12))); }
  // контур 1 px тёмным тоном соседнего материала (не чистый чёрный); под цоколем контура нет — там AO
  const src = c.clone(), solid = (x: number, y: number) => { const p = src.get(x, y); return p && p[3] > 160 ? p : null; };
  for (let y = 0; y < base + 1; y++) for (let x = 0; x < c.w; x++) {
    const p = src.get(x, y); if (p && p[3] > 40) continue;
    const n = solid(x - 1, y) ?? solid(x + 1, y) ?? solid(x, y - 1) ?? solid(x, y + 1);
    if (n) c.set(x, y, mix(shade(n, 0.32), OUTL, 0.35));
  }
  void shade;
  return c;
}
