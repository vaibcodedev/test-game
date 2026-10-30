/**
 * Проходы в стенах данжа в манере 3/4 сверху (docs/art/perspective.md): проход — просвет в стене, сквозь который продолжается настоящий пол (зал за ним рисуют тайлы);
 * по краям просвета — столбы-концы стены (dg_pier_*), над просветом — тонкая перемычка-арка (dg_lintel_*), которую движок рисует выше героя в рядах прохода;
 * створки — отдельные кадры, зависящие от состояния ворот (сервер: DungeonRoom, клиент: terrain.ts):
 *   dg_door_w_0..7 — двойные деревянные двери собора: закрыты (толщина: верхняя грань и лицо, доски, полосы, заклёпки, кольца) → распахиваются НА ОТ ЗРИТЕЛЯ
 *     на петлях у боков проёма (лицо сужается, видна верхняя грань) и ложатся плитами к столбам;
 *   dg_port_0..7 — железная решётка склепа: опущена → поднимается вверх за перемычку (прутья уходят под её нижний край), облачко пыли.
 * Масштаб тайла 32 px; кадры створок gap×60, опора — нижняя середина (низ ряда клеток +3 px).
 */
import { PC, hash01, hex, mix, withA, type RGBA, type Ramp } from "./canvas";
import { GLD, IRN, BAS, BASW, MAR, MARW } from "./dungeon-mock";

const tone = (r: Ramp, v: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(v)))];
const OUT = hex("#0c0a12");
const WOOD: Ramp = [hex("#1c120c"), hex("#34200f"), hex("#4e3118"), hex("#6a4524"), hex("#8a5e32"), hex("#aa7a44")];
const GAP = 128, FH = 80, BASE = FH - 3, HGT = 54;
const ease = (t: number) => t * t * (3 - 2 * t);

/** Столб — конец стены: лицо кладки в тон стены, выступающий карниз с верхней гранью, тёмная полоса основания. 40×52. */
export function pier(R: Ramp, CAP: Ramp, bead: boolean, seed = 1, kb = 0): PC {
  const W = 40, H = 76, pc = new PC(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y >= 3 && y < 11 && x >= 1 && x < W - 1) { pc.set(x, y, tone(CAP, 3.8 + (1 - (y - 3) / 8) * 1.1 + (hash01(x, y, seed) - 0.5) * 0.3)); continue; }
    if (y >= 11 && y < 15 && x >= 1 && x < W - 1) { pc.set(x, y, tone(CAP, y === 11 ? 5 : y === 12 ? 4.4 : 2.8)); continue; }
    if (y === 15 && x >= 2 && x < W - 2) { pc.set(x, y, tone(R, 0.4)); continue; }
    if (y > 15 && x >= 3 && x < W - 3) {
      const ty = y - 16, row = Math.floor(ty / 7), off = row % 2 ? 8 : 0, bx = (x + off) % 16, by = ty % 7;
      let k = 1.75 + (hash01(Math.floor((x + off) / 16), row, 31 + seed) > 0.5 ? 0.18 : -0.1) + (hash01(x, y, 33) - 0.5) * 0.3;
      if (by === 6 || bx === 0) k -= 0.7; else if (by === 0) k += 0.3;
      if (x < 6) k += 0.5; else if (x > W - 7) k -= 0.45;
      k += kb;
      if (bead && ty === 10) k += 1.2;
      if (y >= H - 4) k = 0.4;
      pc.set(x, y, tone(R, k));
    }
  }
  if (bead) for (let x = 4; x < W - 4; x += 2) pc.set(x, 12, tone(GLD, x % 4 ? 2.2 : 3.2));
  return pc.outline(OUT);
}

/** Перемычка-арка над просветом (gap + 32 в ширину): верхняя грань, лицо с клиньями, замковый камень; подгиб книзу к столбам. */
export function lintel(R: Ramp, CAP: Ramp, gap: number, skull: boolean, arched = true, kb = 0): PC {
  const W = gap + 32, H = 62, pc = new PC(W, H), cx = W / 2;
  const under = (x: number) => (arched ? 31 + 7 * Math.pow(Math.abs(x - cx) / (W / 2), 2) : 33);
  for (let y = 4; y < H; y++) for (let x = 0; x < W; x++) {
    if (y < 11) { pc.set(x, y, tone(CAP, 4.2 + (1 - (y - 4) / 7) * 1.0 + (hash01(x, y, 5) - 0.5) * 0.3)); continue; }
    if (y > under(x)) continue;
    const seg = Math.floor(x / 16), f = x % 16;
    let k = 2.1 + kb + (seg % 2 ? 0.35 : -0.05) + (hash01(x, y, 6) - 0.5) * 0.3;
    if (f === 0) k -= 0.8;
    if (y === 11) k = 5; else if (y === 12) k += 0.8;
    if (y >= under(x) - 3) k -= 0.9;
    pc.set(x, y, tone(R, k));
  }
  for (let y = 11; y < 35; y++) for (let x = cx - 10; x <= cx + 10; x++) {
    const edge = x === cx - 10 || x === cx + 10 || y === 34;
    pc.set(x, y, edge ? tone(GLD, 2.2) : tone(CAP, 3.6 + (hash01(x, y, 8) - 0.5) * 0.3));
  }
  if (skull) {
    const B = [hex("#3a3238"), hex("#5c525a"), hex("#8a7e86"), hex("#b8aeb2"), hex("#dcd4d6")], cy = 24;
    pc.ellipse(cx, cy, 6, 5.5, B[3]); pc.ellipse(cx - 1, cy - 1, 4, 3.5, B[4]); pc.rect(cx - 4, cy - 1, 3, 3, hex("#0a0808")); pc.rect(cx + 1, cy - 1, 3, 3, hex("#0a0808"));
    for (let i = 0; i < 4; i++) pc.set(cx - 3 + i * 2, cy + 4, B[1]);
  } else { pc.rect(cx - 1, 22, 3, 3, tone(GLD, 4)); pc.rect(cx - 1, 27, 3, 5, tone(GLD, 2.6)); }
  for (let x = 6; x < W - 6; x += 6) pc.set(x, 13, tone(GLD, x % 12 ? 2.2 : 3.4));
  return pc.outline(OUT);
}

/** Двойные деревянные двери: θ — угол распахивания от зрителя (0 закрыты, ~95 прижаты к столбам внутри прохода). */
export function woodDoors(theta: number): PC {
  const pc = new PC(GAP, FH), half = GAP / 2, th = (theta * Math.PI) / 180, sn = Math.sin(th), cs = Math.cos(th);
  for (const side of [-1, 1]) {
    const hx = side < 0 ? 1 : GAP - 1, dir = -side;
    const fx = hx + dir * (half - 1) * Math.max(0, cs), fyb = -(half * sn) * 0.5, s = 1 - 0.3 * sn;
    const dx = fx - hx;
    const face: [number, number][] = [[hx, BASE - HGT], [fx, BASE + fyb - HGT * s], [fx, BASE + fyb], [hx, BASE]];
    if (Math.abs(dx) > 1.5) {
      pc.poly(face, (x, y) => {
        const t = Math.max(0, Math.min(1, (x - hx) / dx)), yb = BASE + fyb * t, yt = yb - HGT * (1 - 0.3 * sn * t), v = ((y - yt) / Math.max(1, yb - yt)) * HGT, u = t * (half - 1);
        let k = 2.7 + (hash01(Math.floor(u / 9), 3, 71) - 0.5) * 0.5 + (hash01(x, y, 72) - 0.5) * 0.18;
        if (Math.floor(u) % 9 === 0) k = 1.0; // стык досок
        if (v < 2) k = 4.6; // верхний обод
        const band = (v - 6) % 22;
        if (band >= 0 && band < 4) { let c = tone(IRN, band === 0 ? 3.2 : band === 3 ? 0.8 : 2.0); if (band === 1 && Math.floor(u) % 9 === 4) c = tone(IRN, 5); return c; }
        if (u < 7 && ((v - 3) % 24 < 8)) return tone(IRN, v < 5 ? 3.5 : 1.6); // петля
        if (v > HGT - 3) k = 0.8;
        return tone(WOOD, k);
      });
      if (theta < 8) {
        // кольцевые ручки у свободных краёв
        const rx = Math.round(fx - dir * 7), ry = BASE - HGT / 2;
        for (let a = 0; a < 6.3; a += 0.5) pc.set(Math.round(rx + Math.cos(a) * 3), Math.round(ry + Math.sin(a) * 3), tone(IRN, 5));
        pc.rect(rx - 1, ry - 4, 3, 2, tone(IRN, 3));
      }
    }
    // верхняя грань створки: тонкая полоса сверху; у распахнутой — узкая плита вдоль прохода
    const ox = -5 * sn * dir, oy = -(4 * cs + 0.5 * sn);
    const top: [number, number][] = [[hx, BASE - HGT], [fx, BASE + fyb - HGT * s], [fx + ox, BASE + fyb - HGT * s + oy], [hx + ox, BASE - HGT + oy]];
    pc.poly(top, (x, y) => tone(WOOD, 4.0 + (hash01(x, y, 73) - 0.5) * 0.5));
  }
  if (theta < 8) for (let y = BASE - HGT + 2; y < BASE; y++) { pc.set(Math.round(half), y, tone(IRN, 0.4)); pc.set(Math.round(half) - 1, y, tone(WOOD, 0.8)); }
  // тень под створками на полу
  for (let x = 2; x < GAP - 2; x++) if (theta < 60) pc.set(x, BASE, tone(WOOD, 0.3));
  return pc.outline(OUT);
}

/** Решётка склепа: lift 0..1 — высота подъёма вверх за перемычку; пыль у перемычки в начале хода. */
export function portcullis(lift: number): PC {
  const pc = new PC(GAP, FH), off = Math.round(lift * (HGT + 4));
  for (let y = BASE - HGT; y < BASE; y++) for (let x = 3; x < GAP - 3; x++) {
    const gy = y - (BASE - HGT) + off; // координата решётки (0 — её верх)
    if (gy < 0 || gy >= HGT + 2) continue;
    const bar = (x - 3) % 8, vert = bar >= 1 && bar <= 4, hor = (gy >= 3 && gy < 6) || (gy >= 17 && gy < 20) || (gy >= 31 && gy < 34) || (gy >= 45 && gy < 48);
    const tipTaper = gy > HGT - 6 && vert && Math.abs(bar - 3) > (HGT + 1 - gy) * 0.25;
    if (tipTaper) continue;
    if (vert) { pc.set(x, y, tone(IRN, bar === 1 ? 4.6 : bar === 2 ? 3.8 : bar === 3 ? 2.8 : 1.6)); if (hor) pc.set(x, y, tone(IRN, bar === 2 ? 5 : 3.2)); }
    else if (hor) pc.set(x, y, tone(IRN, gy % 3 === 0 ? 4.0 : gy % 3 === 1 ? 3.0 : 1.4));
  }
  // раскалённый просвет за прутьями: отсвет на полу
  for (let x = 6; x < GAP - 6; x += 2) if (lift < 0.2) pc.set(x, BASE, mix(tone(IRN, 0.4), hex("#ff6a1a"), 0.5));
  // пыль у перемычки, пока идёт подъём
  if (lift > 0.05 && lift < 0.95) for (let i = 0; i < 26; i++) {
    const x = Math.floor(hash01(i, 1, 81) * (GAP - 8)) + 4, y = BASE - HGT + Math.floor(hash01(i, 2, 81) * (6 + lift * 10)), a = Math.round(140 * (1 - lift));
    if (!pc.alpha(x, y)) pc.set(x, y, withA(hex("#b8aeb2"), a));
  }
  return pc;
}

const fr = (k: number) => ease(k / 7);
export const DOOR_ART2: Record<string, () => PC> = {
  dg_pier_c: () => pier(MARW, MAR, true), dg_pier_c2: () => pier(MARW, MAR, true, 2),
  dg_pier_t: () => pier(MARW, MAR, false, 3), dg_pier_t2: () => pier(MARW, MAR, false, 4),
  dg_pier_a: () => pier(BASW, BAS, false, 5, 0.9), dg_pier_a2: () => pier(BASW, BAS, false, 6, 0.9),
  dg_lintel_c: () => lintel(MARW, MAR, GAP, false), dg_lintel_t: () => lintel(MARW, MAR, GAP, false, true),
  dg_lintel_a: () => lintel(BASW, BAS, GAP, true, false, 0.9),
};
for (let k = 0; k < 8; k++) {
  DOOR_ART2[`dg_door_w_${k}`] = () => woodDoors(fr(k) * 96);
  DOOR_ART2[`dg_port_${k}`] = () => portcullis(fr(k));
}
