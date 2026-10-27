/**
 * Выход из «Пепельных чертогов» (dg_exit): та же руина, что вход C, но изнутри — МАССИВНАЯ постройка у северной стены, а не рисунок на полу. 3/4 сверху, свет сверху-слева:
 * каменный марш из 9 ступеней (светлый подступенок, тёмная проступь) между парапетами-блоками (крышка светлая, лицевая грань тёмная, торцы видны у подножия, высота растёт кверху);
 * наверху портал: массивные пилоны-откосы и колонны, тяжёлая перемычка с толщиной (верх, лицо, тень под ней), внутренние откосы проёма в тени; за проёмом день (небо, трава и земля на пороге, корни),
 * свет ложится на верхние ступени и откосы; по бокам жаровни (статуй нет: в зале им нет места перед стеной); тень от всей массы вправо-вниз, подошва и торцы темнее у пола. Кладка, сколы и мох — как у входа C.
 * Пылинки в луче — частицы клиента (game/terrain.ts). Кадр 200×156, опора — нижняя середина.
 */
import { PC, hash01, hex, mix, withA, ramp, type RGBA, type Ramp } from "./canvas";
import { box, cylV, frame32, grain } from "./volume-lib";
import { MAR, GLD, ASH, braziA, type Scene } from "./dungeon-mock";

const tone = (r: Ramp, v: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];
const GRASS = ramp("#16301a", "#234a22", "#34692b", "#4c8a36", "#72aa48", "#9cc866");
const DIRT = ramp("#1e1612", "#33261c", "#4a3826", "#654d34", "#84684a");
const rnd = (a: number, b: number, s = 1) => hash01(a, b, s);
const WARM = hex("#ffe6a8");

/** Кладка поверх готовой грани: швы рядами по 7 px со сдвигом, редкие сколы и пятна мха (как у входа C). */
function masonry(pc: PC, x0: number, y0: number, w: number, h: number, seed: number, moss = 0.05) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const c = pc.get(x, y); if (!c || !c[3]) continue;
    const row = Math.floor((y - y0) / 7), off = row % 2 ? 7 : 0, by = (y - y0) % 7, bx = (x - x0 + off) % 14;
    let k = 1;
    if (by === 6 || bx === 0) k = 0.74; else if (by === 0) k = 1.1;
    let out: RGBA = [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), c[3]];
    if (rnd(Math.floor(x / 4), Math.floor(y / 4), seed) < 0.05) out = [out[0] * 0.78, out[1] * 0.78, out[2] * 0.78, out[3]]; // скол
    if (rnd(Math.floor(x / 3), Math.floor(y / 3), seed + 1) < moss && by < 3) out = mix(out, tone(GRASS, 2.5), 0.55) as RGBA; // мох
    pc.set(x, y, out);
  }
}

export function exitStairs(): PC {
  const W = 200, H = 156, pc = new PC(W, H), pp = new PC(W, H), cx = W / 2, yb = H - 8;
  const S: Scene = { pc: pp, lights: [], shadows: [], emit: new PC(W, H) };
  const N = 9, RISER = 4, TREAD = 5, UNIT = RISER + TREAD, ytop = yb - N * UNIT; // ytop — верхняя площадка
  const HW = 34; // полуширина марша
  const D: [number, number] = [5, -3];
  // падающая тень от всей массы на пол: вправо-вниз (слой земли, без контура)
  for (let y = yb - 30; y < H; y++) for (let x = 0; x < W; x++) { const u = (x - (cx + 22)) / 96, v = (y - (yb + 3)) / 16, d = u * u + v * v; if (d < 1) pc.set(x, y, withA(hex("#04070b"), Math.round(165 * (1 - d)))); }
  // ---- портал наверху ----
  const oy0 = 24, openL = cx - HW, openR = cx + HW;
  // проём: небо (голубой верх → тёплый низ), порог с травой и землёй, корни сверху
  for (let y = oy0; y < ytop; y++) for (let x = openL; x < openR; x++) { const t = (y - oy0) / (ytop - oy0); pp.set(x, y, mix(hex("#86bcf2"), hex("#fff0c4"), Math.pow(t, 1.1))); }
  for (let x = openL; x < openR; x++) for (let y = ytop - 9; y < ytop; y++) { const g = rnd(x, y, 11); pp.set(x, y, y - (ytop - 9) < 5 ? tone(GRASS, 2.4 + g * 3) : tone(DIRT, 2 + g * 2)); }
  for (let k = 0; k < 16; k++) { const x = openL + 2 + Math.round(rnd(k, 3, 12) * (openR - openL - 4)); pp.rect(x, ytop - 12 - Math.round(rnd(k, 4, 12) * 3), 1, 4, tone(GRASS, 3 + rnd(k, 5, 12) * 2)); }
  for (let k = 0; k < 10; k++) { const x = openL + 4 + Math.round(rnd(k, 6, 13) * (openR - openL - 8)), len = 6 + Math.round(rnd(k, 7, 13) * 18); for (let j = 0; j < len; j++) pp.set(x + Math.round(Math.sin(j * 0.5 + k) * 1.5), oy0 + j, k % 3 === 0 ? tone(DIRT, 1.5 + rnd(j, k, 14) * 1.5) : tone(GRASS, 2 + rnd(j, k, 14) * 3)); } // корни и трава свисают
  // внутренние откосы проёма (в тени) и тень под перемычкой
  for (let y = oy0; y < ytop; y++) for (let j = 0; j < 7; j++) { pp.set(openL + j, y, tone(MAR, 0.7 + j * 0.12)); pp.set(openR - 1 - j, y, tone(MAR, 0.5 + j * 0.1)); }
  for (let j = 0; j < 6; j++) for (let x = openL; x < openR; x++) { const c = pp.get(x, oy0 + j); if (c) pp.set(x, oy0 + j, mix(c, hex("#0a0c14"), 0.75 - j * 0.1)); }
  // массивные пилоны-откосы по краям портала (кирпичная кладка с глубиной) и колонны перед ними
  for (const sx of [-1, 1]) {
    const px = sx < 0 ? cx - HW - 22 : cx + HW;
    box(pp, px, 14, 22, ytop - 12, 6, { r: MAR, tex: grain(3 + sx, 0.25) }, { r: MAR }, { r: MAR });
    pp.rect(px, 14, 22, 3, tone(MAR, 4.8)); // светлая кромка верха
  }
  masonry(pp, cx - HW - 22, 17, 22, ytop - 15, 71); masonry(pp, cx + HW, 17, 22, ytop - 15, 72);
  for (const sx of [-1, 1]) {
    const px = cx + sx * (HW + 2);
    cylV(pp, px, 20, ytop - 2, 7, MAR, { k: 0.45, cap: null, tex: (phi) => (Math.floor((phi + 2) * 4) % 2 ? -0.25 : 0.2) });
    box(pp, px - 10, ytop - 6, 20, 9, 5, { r: MAR, tex: grain(2, 0.2) }, { r: MAR }, { r: MAR });
  }
  // тяжёлая перемычка: фасад с толщиной (верх и торец), золотая насечка
  box(pp, cx - HW - 26, 6, HW * 2 + 52, 15, 9, { r: MAR, tex: grain(5, 0.2) }, { r: MAR }, { r: MAR });
  masonry(pp, cx - HW - 26, 6, HW * 2 + 52, 15, 73, 0.02);
  for (let x = cx - HW - 20; x < cx + HW + 20; x += 6) pp.set(x, 9, tone(GLD, x % 12 ? 2.4 : 3.6));
  // ---- марш: ступени между парапетами ----
  for (let i = N - 1; i >= 0; i--) {
    const t = i / (N - 1), base = yb - i * UNIT;
    for (let x = cx - HW; x < cx + HW; x++) for (let y = base - UNIT; y < base; y++) {
      const riser = y >= base - RISER, k = riser ? 3.6 + 0.5 * t - (y === base - 1 ? 0.9 : 0) : 1.6 + 1.5 * t + (y === base - UNIT ? 0.7 : 0);
      pp.set(x, y, mix(tone(MAR, k + (rnd(x, y, 21) - 0.5) * 0.35), WARM, Math.pow(t, 1.1) * (riser ? 0.55 : 0.4)));
    }
  }
  // ---- парапеты: крупные блоки разной высоты (слева и справа свои разбивки), у каждого светлая крышка, лицевая грань, сколы; дальние блоки выше ----
  const blocks: Record<number, [number, number, number][]> = { [-1]: [[0, 2, 15], [3, 5, 26], [6, 8, 35]], [1]: [[0, 3, 18], [4, 6, 27], [7, 8, 33]] };
  for (const sx of [-1, 1]) {
    const x = sx < 0 ? cx - HW - 16 : cx + HW, list = blocks[sx];
    for (let bi = list.length - 1; bi >= 0; bi--) {
      const [i0, i1, h] = list[bi], hPrev = bi > 0 ? list[bi - 1][2] : 0, yS = yb - i0 * UNIT, yN = yb - (i1 + 1) * UNIT;
      // крышка: светлая плита вдоль марша на высоте h; слева ярче (свет сверху-слева), у внешней кромки блик
      for (let y = yN - h; y < yS - h; y++) for (let xx = x; xx < x + 16; xx++) {
        const t = (xx - x) / 16, seam = (y - (yN - h)) % 12 === 0;
        pp.set(xx, y, tone(MAR, 4.5 - t * 0.5 + (sx < 0 ? 0.2 : -0.1) + (rnd(xx, y, 81 + bi) - 0.5) * 0.4 - (seam ? 0.8 : 0)));
      }
      // лицевая грань южного торца: видна выше соседнего (ближнего) блока; торец у подножия — целиком
      for (let y = yS - h; y < yS - hPrev; y++) for (let xx = x; xx < x + 16; xx++) pp.set(xx, y, tone(MAR, 2.4 + (rnd(xx, y, 91 + bi) - 0.5) * 0.35 - (sx > 0 ? 0.3 : 0) - ((y - (yS - h)) / h) * 0.3));
      masonry(pp, x, yS - h, 16, h - hPrev, 41 + bi * 3 + (sx > 0 ? 9 : 0), 0.07);
      // кромка крышки у лицевой грани и тёмная вертикаль у ступеней (внутренний откос блока)
      for (let xx = x; xx < x + 16; xx++) pp.set(xx, yS - h, tone(MAR, 5));
      for (let y = yN - h; y < yS - hPrev; y++) for (let j = 0; j < 3; j++) { const xx = sx < 0 ? x + 15 - j : x + j, c = pp.get(xx, y); if (c) pp.set(xx, y, mix(c, hex("#06080e"), 0.35 - j * 0.1)); }
      // сколы: выкушенный угол у дальнего конца самого высокого блока и вмятины
      if (bi === list.length - 1) for (let j = 0; j < 6; j++) for (let k2 = 0; k2 < 6 - j; k2++) pp.clear(sx < 0 ? x + k2 : x + 15 - k2, yN - h + j);
      for (let k = 0; k < 3; k++) pp.rect(x + 2 + Math.floor(rnd(k, bi, 95) * 10), yS - h + 3 + Math.floor(rnd(k, bi, 96) * Math.max(1, h - hPrev - 6)), 2, 2, tone(MAR, 0.8));
      // подошва: темнее у пола, только у нижнего блока
      if (bi === 0) for (let yy = yS - 4; yy < yS; yy++) for (let xx = x; xx < x + 16; xx++) { const c = pp.get(xx, yy); if (c) pp.set(xx, yy, mix(c, hex("#05070c"), 0.4 + (yy - (yS - 4)) * 0.1)); }
    }
  }
  // упавшие обломки на ступенях
  for (let k = 0; k < 4; k++) pp.ellipse(cx - HW + 8 + rnd(k, 3, 97) * (HW * 2 - 16), yb - 6 - Math.floor(rnd(k, 4, 97) * 30), 2 + rnd(k, 5, 97) * 2, 1.5, tone(MAR, 2 + rnd(k, 6, 97) * 2));
  // торцы у подножия: тёмная вертикаль у нижнего блока и тень на ступени
  for (let y = yb - 4; y < yb; y++) for (let x = cx - HW; x < cx + HW; x++) { const c = pp.get(x, y); if (c) pp.set(x, y, mix(c, hex("#05070c"), 0.25)); }
  // ---- свет из проёма: яркий тёплый конус вниз по ступеням, откосам и парапетам; контровой свет по краям проёма ----
  for (let y = ytop - 10; y < yb; y++) for (let x = cx - 74; x <= cx + 74; x++) {
    const t = (y - ytop) / (yb - ytop), hw = 36 + 36 * t, d = Math.abs(x - cx) / hw;
    if (d >= 1) continue;
    const c = pp.get(x, y);
    if (c && c[3]) pp.set(x, y, mix(c, hex("#ffd98a"), (1 - d * d) * (0.55 - 0.45 * t)));
  }
  for (let y = oy0 + 4; y < ytop; y++) for (let j = 0; j < 2; j++) { pp.set(openL + 7 + j, y, mix(pp.get(openL + 7 + j, y) ?? tone(MAR, 2), hex("#fff0c4"), 0.6 - j * 0.3)); pp.set(openR - 8 - j, y, mix(pp.get(openR - 8 - j, y) ?? tone(MAR, 2), hex("#fff0c4"), 0.5 - j * 0.25)); } // контровой свет по краям
  // ---- постаменты со статуями и жаровни, как у входа C (зеркально) ----
  // статуи убраны: в зале нет места между стеной и маршем (проход 4 клетки), они вставали в стены; остаются жаровни у торцов парапетов, внутри ширины прохода
  braziA(S, cx - 58, yb - 2, 1.0); braziA(S, cx + 58, yb - 2, 1.0);
  for (let k = 0; k < 8; k++) pp.ellipse(cx - 60 + rnd(k, 8, 31) * 120, yb + 1, 3 + rnd(k, 9, 31) * 4, 1.2, withA(tone(ASH, 1.2 + rnd(k, 10, 31)), 190));
  pc.blit(pp.outline(hex("#0c0a12")), 0, 0);
  return frame32(pc);
}
