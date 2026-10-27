/**
 * Павшие боевые кони Полей вечных битв в объёме 3/4 (замена плоских bf_horse_fallen_*): лежит на боку — туловище, круп, грудь, шея с гривой, голова с мёртвым глазом,
 * хвост, ноги вытянуты или сложены, седло, стремя и попона цвета фракции (Сольгард — лазурь и золото, Умбрат — пурпур и чернь), контактная тень (shadow.ts).
 * Тела всадников не рисуются — они отдельными объектами (bf_fallen_*), ждут переработки героя. Окраска и стать — по новым коням (tools/gen/mounts, assets/mounts).
 * Варианты: a — на боку, ноги сложены; b — зеркально, ноги вытянуты; c — шея запрокинута; d — со стрелами и кровью; e — со сломанным дышлом повозки;
 * нейтральные (без фракции) и 3 скелета коня (череп, позвоночник, рёбра, ноги).
 */
import {
  PC, hash01, hex, mix, pnoise, ramp, type RGBA, type Ramp, type N3,
  CLOTH, WOOD, IRON, LEATHER, ROPE, OUT,
  fillPoly, ellipseFace, log, shadowDisc, litC, finish, frame32,
} from "./volume-lib";

const BAY = ramp("#1c120c", "#3a2616", "#5c3c22", "#7e5430", "#a0723e", "#c49058");
const GREY = ramp("#26262c", "#44444e", "#686874", "#8e8e9a", "#b4b4c0", "#d8d8e2");
const MANE = ramp("#0a0808", "#161210", "#241c18", "#362a24", "#4a3a32");
const BONE = ramp("#3a3238", "#5c525a", "#8a7e86", "#b8aeb2", "#dcd4d6", "#f4eef0");
const GOLD = ramp("#4a2c0c", "#85521a", "#c98a28", "#f0c040", "#fff0a0", "#ffffe6");
const BLOOD: RGBA = [86, 18, 24, 215];
type Pt = [number, number];

interface Look { coat: Ramp; cap: Ramp; capB: Ramp; trim: Ramp; none?: boolean }
const SOL: Look = { coat: BAY, cap: CLOTH.blue, capB: CLOTH.white, trim: GOLD };
const UMB: Look = { coat: ramp("#0e0a0c", "#201618", "#342426", "#4a3434", "#644848", "#80605a"), cap: CLOTH.purple, capB: CLOTH.black, trim: BONE };
const NEU_A: Look = { coat: BAY, cap: CLOTH.rag, capB: CLOTH.brown, trim: LEATHER, none: true };
const NEU_B: Look = { coat: GREY, cap: CLOTH.red, capB: CLOTH.brown, trim: LEATHER, none: true };

/** Тело-эллипсоид с нормалью по форме (свет сверху слева), поворот ang вокруг центра. */
function ell3(pc: PC, cx: number, cy: number, rx: number, ry: number, r: Ramp, ang = 0, tex?: (x: number, y: number) => number, bias = 0) {
  const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.max(rx, ry) + 2;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, u = (dx * ca + dy * sa) / rx, w = (-dx * sa + dy * ca) / ry, d = u * u + w * w;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    // нормаль в экранных осях: поворачиваем (u, w) обратно
    const nx = (u * ca - w * sa) * 0.9, ny = -(u * sa + w * ca) * 0.9;
    pc.set(x, y, litC(r, [nx, ny, nz] as N3, bias + (tex ? tex(x, y) : 0) + (d > 0.8 ? -0.2 : 0)));
  }
}
const coatTex = (seed: number) => (x: number, y: number) => (pnoise(x, y, 3, 256, seed) - 0.5) * 0.7 + (hash01(x, y, seed) < 0.03 ? -0.5 : 0);

/** Нога: два сегмента бревном + копыто; fold — сложена (колено вверх), иначе вытянута. */
function leg(pc: PC, coat: Ramp, x0: number, y0: number, x1: number, y1: number, kx: number, ky: number, hoof = true) {
  log(pc, x0, y0, kx, ky, 2.7, coat, { end: null, tex: coatTex(7) });
  log(pc, kx, ky, x1, y1, 2.1, coat, { end: null, tex: coatTex(8) });
  ellipseFace(pc, kx, ky, 2.5, 2.3, coat, [-0.3, 0.6, 0.7]);
  if (hoof) { ellipseFace(pc, x1 + (x1 - kx) * 0.12, y1 + (y1 - ky) * 0.12, 2.6, 2.1, ramp("#0c0a0c", "#1c1618", "#2e2628", "#403638"), [-0.2, 0.7, 0.6]); }
}

interface Opt { dir: 1 | -1; v: number; look: Look; seed: number }
/** Конь лежит на боку; x-координаты задаются для «голова слева», dir=-1 зеркалит по холсту (форма и нормали считаются заново → свет остаётся сверху слева). */
function horse(o: Opt): PC {
  const W = 128, H = 76, pc = new PC(W, H), mir = o.dir === 1;
  const X = (x: number) => (mir ? W - x : x);
  const coat = o.look.coat, v = o.v;
  // всё рисуется на временном холсте «голова слева», затем при mir отражается и дорисовывается освещение? — нет: рисуем сразу в нужных координатах.
  const P = (x: number, y: number): Pt => [X(x), y];
  const lx = (a: number) => a; void lx;
  shadowDisc(pc, X(58), 48, 44, 9, 40);
  // кровь под конём
  if (v === 3 || v === 1) { pc.ellipse(X(52), 49, 30, 6, BLOOD); pc.ellipse(X(50), 48, 20, 4, [64, 12, 18, 215]); }
  const stretched = v === 1 || v === 2;
  // ноги дальнего бока (рисуются первыми): вытянутые или сложенные
  const legs = (far: boolean) => {
    const dy = far ? -3 : 0, dx = far ? 4 : 0;
    const f = (x0: number, y0: number, x1: number, y1: number, kx: number, ky: number) => { const a = P(x0 + dx, y0 + dy), b = P(x1 + dx, y1 + dy), k = P(kx + dx, ky + dy); leg(pc, coat, a[0], a[1], b[0], b[1], k[0], k[1]); };
    if (stretched) { f(34, 44, 26, 64, 30, 55); f(40, 46, 38, 68, 39, 57); f(76, 46, 90, 66, 84, 56); f(84, 44, 104, 60, 94, 52); }
    else { f(34, 44, 24, 58, 30, 52); f(40, 46, 36, 62, 33, 54); f(76, 46, 92, 60, 84, 55); f(84, 44, 104, 56, 94, 52); }
  };
  // хвост
  const tail: Pt[] = [P(96, 36), P(104, 44), P(108, 54), P(104, 64)];
  for (let i = 0; i + 1 < tail.length; i++) for (const off of [-2, 0, 2]) log(pc, tail[i][0] + off, tail[i][1], tail[i + 1][0] + off, tail[i + 1][1], 1.5, MANE, { end: null, tex: coatTex(3 + i) });
  // туловище, круп, грудь
  ell3(pc, X(58), 36, 26, 13, coat, 0.04 * o.dir, coatTex(o.seed), 0);
  ell3(pc, X(84), 36, 14, 13, coat, 0, coatTex(o.seed + 1), 0.05);
  ell3(pc, X(36), 36, 14, 12.5, coat, 0, coatTex(o.seed + 2), 0.1);
  // шея, голова
  const neckTo: Pt = v === 2 ? P(20, 18) : P(14, 44), neckFrom: Pt = P(32, 30);
  log(pc, neckFrom[0], neckFrom[1], neckTo[0], neckTo[1], 7, coat, { end: null, tex: coatTex(o.seed + 3) });
  const head = v === 2 ? P(13, 14) : P(11, 47);
  ell3(pc, head[0], head[1], 9, 5.7, coat, v === 2 ? (mir ? 2.2 : 0.9) : (mir ? -0.5 : 0.5), coatTex(o.seed + 4), 0.1);
  const muz: Pt = v === 2 ? P(5, 8) : P(4, 51);
  ell3(pc, muz[0], muz[1], 4.8, 3.6, mix(coat[3], BONE[3], 0.0) ? coat : coat, 0, coatTex(o.seed + 5), -0.1);
  pc.set(muz[0] + (mir ? 2 : -2), muz[1], coat[0]); pc.set(muz[0] + (mir ? 1 : -1), muz[1] + 1, coat[0]); // ноздря
  // мёртвый глаз «х» и открытая пасть: зубы
  const ey = P(head[0] - (mir ? -2 : 2), head[1] - 2);
  pc.set(ey[0], ey[1], coat[0]); pc.set(ey[0] + 1, ey[1] + 1, coat[0]); pc.set(ey[0] + 1, ey[1], hex("#d8d0c8")); pc.set(ey[0], ey[1] + 1, hex("#d8d0c8"));
  if (v === 2) { pc.set(muz[0] + (mir ? -2 : 2), muz[1] + 2, hex("#e8e0d4")); pc.set(muz[0] + (mir ? -3 : 3), muz[1] + 2, hex("#e8e0d4")); }
  // уши
  const ear = P(head[0] + (mir ? -4 : 4), head[1] - 5);
  fillPoly(pc, [[ear[0] - 1.5, ear[1] + 2], [ear[0] + (mir ? 2 : -2), ear[1] - 4], [ear[0] + 2, ear[1] + 2]], () => litC(coat, [0, 0.6, 0.8], -0.2));
  // грива по верху шеи
  for (let k = 0; k < 9; k++) { const t = k / 8, a = [neckFrom[0] + (neckTo[0] - neckFrom[0]) * t, neckFrom[1] + (neckTo[1] - neckFrom[1]) * t - 6.5 + t * 1.5]; log(pc, a[0], a[1], a[0] + (mir ? 3 : -3) , a[1] + 3 + (k % 2), 1.0, MANE, { end: null }); }
  // ноги ближнего бока
  legs(false);
  // попона, седло, стремя
  const L = o.look, cx0 = 44, cx1 = 76;
  if (!L.none || v !== 99) {
    const pts: Pt[] = [[cx0 + 2, 27], [cx1 - 6, 25], [cx1 + 2, 29], [cx1 + 3, 46], [cx1 - 8, 50], [cx0 - 1, 49], [cx0 - 4, 38]].map(([x, y]) => P(x, y));
    fillPoly(pc, pts, (x, y) => { const t = (x - X(cx0)) * (mir ? -1 : 1); const fold = Math.sin(t * 0.55 + o.seed) * 0.5; const bands = Math.floor((t + 40) / 7) % 2; return litC(bands && !L.none ? L.capB : L.cap, [fold, 0.5, 0.8], (pnoise(x, y, 3, 256, o.seed) - 0.5) * 0.5 + (y > 44 ? -0.5 : 0)); });
    // кайма по краю: низ и бока
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (i === 0) continue; const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let k = 0; k <= n; k++) pc.set(Math.round(a[0] + ((b[0] - a[0]) * k) / n), Math.round(a[1] + ((b[1] - a[1]) * k) / n), litC(L.trim, [0, 0.4, 1], k % 2 ? 0.1 : -0.3)); }
    // седло и лука
    ell3(pc, X(58), 27, 9, 4.5, LEATHER, 0, undefined, 0.1);
    ell3(pc, X(51), 25, 2.4, 3.4, LEATHER, 0, undefined, 0.2);
    // ремень и стремя
    log(pc, X(60), 29, X(62), 46, 0.9, LEATHER, { end: null });
    ellipseFace(pc, X(62), 48, 2.6, 1.6, IRON, [0, 0.5, 0.8]);
    // повод на земле
    for (let k = 0; k < 4; k++) log(pc, X(18 + k * 3), 56 + (k % 2), X(21 + k * 3), 56 + ((k + 1) % 2), 0.7, LEATHER, { end: null });
  }
  // варианты: стрелы, дышло
  if (v === 3) {
    for (const [x, y, ax, ay] of [[50, 30, 6, -22], [62, 38, -4, -22], [76, 33, 7, -20]] as const) {
      log(pc, X(x), y, X(x + ax), y + ay, 0.8, WOOD, { end: null });
      fillPoly(pc, [[X(x + ax), y + ay], [X(x + ax) - 2, y + ay - 3], [X(x + ax) + 1, y + ay - 3.5], [X(x + ax) + 2, y + ay - 2]], () => hex("#d8d0c0"));
      pc.set(X(x), y, BLOOD as unknown as RGBA);
    }
    for (const [x, y] of [[48, 33], [64, 41], [74, 36], [56, 44]] as const) pc.ellipse(X(x), y, 2.4, 1.6, BLOOD);
  }
  if (v === 4) {
    // обломок оглобли: брус через грудь, ремни упряжи, щепа
    log(pc, X(18), 60, X(60), 30, 3.2, WOOD, { end: WOOD });
    for (const [dx, dy] of [[-2, 0], [0, -2], [2, 1]] as const) log(pc, X(18) + dx, 60 + dy, X(14) + dx, 56 + dy, 1.2, WOOD, { end: null });
    for (const x of [30, 40, 50]) log(pc, X(x), 40 + (60 - 30) * (1 - (x - 18) / 42) * 0.0 + 4, X(x - 4), 56, 0.9, LEATHER, { end: null });
    ellipseFace(pc, X(34), 50, 2.6, 2.0, IRON, [0, 0.6, 0.7]);
    for (let i = 0; i < 6; i++) log(pc, X(10 + hash01(i, 1, 4) * 12), 58 + hash01(i, 2, 4) * 6, X(13 + hash01(i, 1, 4) * 12), 59 + hash01(i, 3, 4) * 6, 0.7, WOOD, { end: null });
  }
  return frame32(finishNoCorner(pc));
}
/** Контур без «угловых точек»: outline рисует по прозрачным соседям 4-связно — одиночные оторвавшиеся пиксели (концы ног, конец хвоста) заменяются на ближайшие. */
function finishNoCorner(pc: PC): PC {
  // удалить одиночные пиксели без непрозрачных соседей (искры от ресемплинга), затем контур
  const a = (x: number, y: number) => (x >= 0 && y >= 0 && x < pc.w && y < pc.h ? pc.alpha(x, y) : 0);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (a(x, y) && !(a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) pc.clear(x, y);
  return finish(pc);
}

// ---------------- скелет коня ----------------
/** v: a — на боку с рёбрами; b — рассыпан (череп отдельно); c — в остатках попоны. */
function skeleton(v: number): PC {
  const W = 128, H = 72, pc = new PC(W, H), look = v === 2 ? SOL : null;
  shadowDisc(pc, 62, 50, 44, 8, 30);
  const bone = (x0: number, y0: number, x1: number, y1: number, r = 1.4) => { log(pc, x0, y0, x1, y1, r, BONE, { end: null }); ellipseFace(pc, x0, y0, r + 0.9, r + 0.7, BONE, [-0.3, 0.5, 0.8]); ellipseFace(pc, x1, y1, r + 0.9, r + 0.7, BONE, [-0.3, 0.5, 0.8]); };
  const sc = v === 1 ? 1 : 0;
  // остатки травы и земли под костями
  for (let i = 0; i < 30; i++) { const x = 20 + hash01(i, 1, 6) * 88, y = 46 + hash01(i, 2, 6) * 8; if (i % 3) pc.set(Math.round(x), Math.round(y), hex("#3a5a26")); }
  // ноги
  const legB = (x0: number, y0: number, kx: number, ky: number, x1: number, y1: number) => { bone(x0, y0, kx, ky, 1.5); bone(kx, ky, x1, y1, 1.2); ellipseFace(pc, x1, y1 + 1, 2.2, 1.6, BONE, [-0.2, 0.7, 0.6]); };
  legB(36, 44, 28, 54, 20, 62); legB(44, 46, 40, 58, 38, 66); legB(78, 46, 88, 56, 100, 60); legB(86, 44, 98, 52, 110, 56);
  // позвоночник: цепочка позвонков по верху
  for (let i = 0; i < 18; i++) { const t = i / 17, x = 30 + t * 62, y = 26 + Math.sin(t * Math.PI) * -2 + 0; ellipseFace(pc, x, y, 2.2, 1.9, BONE, [-0.2, 0.8, 0.5]); if (i % 2 === 0) { log(pc, x, y, x - 1, y - 3, 0.7, BONE, { end: null }); } }
  // рёбра: дуги вниз от позвоночника
  for (let k = 0; k < 11; k++) {
    const x = 36 + k * 4.4, bulge = Math.sin((k + 0.5) / 11 * Math.PI) * 5 + 4, y0 = 27, y1 = 27 + bulge * 3.2;
    const mid: Pt = [x - 2 - bulge * 0.15, (y0 + y1) / 2], end: Pt = [x + 2.5, y1];
    log(pc, x, y0, mid[0], mid[1], 1.15, BONE, { end: null }); log(pc, mid[0], mid[1], end[0], end[1], 1.0, BONE, { end: null });
  }
  // грудина и таз
  log(pc, 36, 46, 70, 47, 1.0, BONE, { end: null });
  ell3(pc, 95, 33, 6.5, 7.5, BONE, 0.25); log(pc, 90, 30, 100, 40, 1.2, BONE, { end: null }); log(pc, 92, 40, 100, 28, 1.0, BONE, { end: null }); // таз
  // шея: позвонки дугой к голове
  for (let i = 0; i < 7; i++) { const t = i / 6, x = 30 - t * 18, y = 28 + t * 14 + Math.sin(t * 3) * 2; ellipseFace(pc, x, y, 2.4 - t * 0.5, 2.0, BONE, [-0.2, 0.8, 0.5]); }
  // череп: вытянутая морда, глазница, ряд зубов, челюсть
  const hx = sc ? 20 : 12, hy = sc ? 66 : 47;
  ell3(pc, hx, hy, 8, 5.4, BONE, 0.5); ell3(pc, hx - 8, hy + 5, 8, 2.8, BONE, 0.5); ell3(pc, hx - 15, hy + 9, 3.6, 2.4, BONE, 0.5);
  ell3(pc, hx + 1, hy - 1, 2.2, 2.0, ramp("#0a0808", "#161012", "#241a1c"), 0); // глазница
  for (let i = 0; i < 8; i++) pc.set(Math.round(hx - 14 + i * 1.7), Math.round(hy + 7 + i * 0.7), BONE[5]);
  log(pc, hx + 3, hy + 3, hx - 13, hy + 12, 1.0, BONE, { end: null }); // нижняя челюсть
  fillPoly(pc, [[hx + 5, hy - 4], [hx + 4, hy - 9], [hx + 7, hy - 4]], () => litC(BONE, [0, 0.6, 0.8], -0.2)); // ухо-основание
  // хвост — пряди из костей-нитей
  for (let i = 0; i < 4; i++) log(pc, 100 + i, 36, 108 + i * 2, 50, 0.8, ramp("#1a1612", "#2a241e", "#3e362c", "#58503e"), { end: null });
  // череп с повозкой / остатки попоны
  if (v === 2 && look) {
    const pts: Pt[] = [[48, 27], [66, 27], [70, 38], [60, 46], [50, 40]];
    fillPoly(pc, pts, (x, y) => litC(look.cap, [Math.sin(x * 0.6) * 0.5, 0.4, 0.8], (pnoise(x, y, 3, 256, 4) - 0.5) * 0.6 - 0.4));
    for (let k = 0; k < 6; k++) pc.set(50 + k * 3, 27 + (k % 2), look.trim[3]);
    ell3(pc, 58, 25, 7, 3.6, LEATHER, 0, undefined, 0.1);
  }
  if (v === 1) { // рассыпан: часть рёбер и ноги отброшены
    bone(24, 62, 40, 58, 1.3); bone(60, 62, 76, 66, 1.2); ell3(pc, 90, 62, 4, 2.5, BONE, 0.3);
  }
  return frame32(finishNoCorner(pc));
}

export const BF_HORSES_ART: Record<string, () => PC> = {
  bf_horse_fallen_sol: () => horse({ dir: 1, v: 0, look: SOL, seed: 3 }), bf_horse_sol_b: () => horse({ dir: -1, v: 1, look: SOL, seed: 5 }), bf_horse_sol_c: () => horse({ dir: 1, v: 2, look: SOL, seed: 7 }),
  bf_horse_sol_d: () => horse({ dir: -1, v: 3, look: SOL, seed: 9 }), bf_horse_sol_e: () => horse({ dir: 1, v: 4, look: SOL, seed: 11 }),
  bf_horse_fallen_umb: () => horse({ dir: 1, v: 0, look: UMB, seed: 13 }), bf_horse_umb_b: () => horse({ dir: -1, v: 1, look: UMB, seed: 15 }), bf_horse_umb_c: () => horse({ dir: 1, v: 2, look: UMB, seed: 17 }),
  bf_horse_umb_d: () => horse({ dir: -1, v: 3, look: UMB, seed: 19 }), bf_horse_umb_e: () => horse({ dir: 1, v: 4, look: UMB, seed: 21 }),
  bf_horse_n_a: () => horse({ dir: 1, v: 0, look: NEU_A, seed: 23 }), bf_horse_n_b: () => horse({ dir: -1, v: 2, look: NEU_B, seed: 25 }),
  bf_horse_skel_a: () => skeleton(0), bf_horse_skel_b: () => skeleton(1), bf_horse_skel_c: () => skeleton(2),
};
export const BF_HORSES_GROUPS: [string, string[]][] = [
  ["кони Сольгарда", ["bf_horse_fallen_sol", "bf_horse_sol_b", "bf_horse_sol_c", "bf_horse_sol_d", "bf_horse_sol_e"]],
  ["кони Умбрата", ["bf_horse_fallen_umb", "bf_horse_umb_b", "bf_horse_umb_c", "bf_horse_umb_d", "bf_horse_umb_e"]],
  ["кони без знамён, скелеты", ["bf_horse_n_a", "bf_horse_n_b", "bf_horse_skel_a", "bf_horse_skel_b", "bf_horse_skel_c"]],
];
void ROPE; void OUT;
