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
import { deadHorse } from "./bf-horses2";

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
  // павшие боевые кони по модели боевого коня (bf-horses2.ts): Сольгард и Умбрат по 5 вариантов
  bf_horse_fallen_sol: () => deadHorse("solgard", 0), bf_horse_sol_b: () => deadHorse("solgard", 1), bf_horse_sol_c: () => deadHorse("solgard", 2),
  bf_horse_sol_d: () => deadHorse("solgard", 3), bf_horse_sol_e: () => deadHorse("solgard", 4),
  bf_horse_fallen_umb: () => deadHorse("umbrath", 0), bf_horse_umb_b: () => deadHorse("umbrath", 1), bf_horse_umb_c: () => deadHorse("umbrath", 2),
  bf_horse_umb_d: () => deadHorse("umbrath", 3), bf_horse_umb_e: () => deadHorse("umbrath", 4),
  bf_horse_skel_a: () => skeleton(0), bf_horse_skel_b: () => skeleton(1), bf_horse_skel_c: () => skeleton(2),
};
export const BF_HORSES_GROUPS: [string, string[]][] = [
  ["кони Сольгарда", ["bf_horse_fallen_sol", "bf_horse_sol_b", "bf_horse_sol_c", "bf_horse_sol_d", "bf_horse_sol_e"]],
  ["кони Умбрата", ["bf_horse_fallen_umb", "bf_horse_umb_b", "bf_horse_umb_c", "bf_horse_umb_d", "bf_horse_umb_e"]],
  ["скелеты коней", ["bf_horse_skel_a", "bf_horse_skel_b", "bf_horse_skel_c"]],
];
void ROPE; void OUT;
