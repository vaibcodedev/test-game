/**
 * Малый рунный голем (проход 4): кадр 48, ступни y≈44,5, рост ≈30 px (в рост героя, шире в плечах).
 * Части: ноги-столбы со ступнями-плитами, таз, грудь из плит со швами и сколами (верхняя грань каждой плиты светлее — вид 3/4),
 * валуны плеч, руки по IK, кулаки-глыбы с костяшками, голова-камень под надбровьем, руны на груди, плечах и в глазницах
 * (свечение, пульс по позе rg). Удар оземь — трещина-руна и пыль.
 */
import { Frame2, R, add, clamp, hash, ik2, lerp, nrm, rot, sh, PI, SIN, COS, type V2, type C, hx } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 48;
const STONE = R("#101116", "#1d1f26", "#2e313a", "#444852", "#5d626c", "#7c818a", "#a3a7ad");
const STONED = R("#0c0d11", "#16181e", "#23262e", "#343841", "#484d56", "#60656e", "#80858c");
const MOSS = R("#14200f", "#22361a", "#355226", "#4c6e34");
const RUNE = R("#0a2a3a", "#145a7a", "#2aa0c8", "#7ae0f4", "#e0fcff");
const DUST = [hx("#4a4a52"), hx("#6c6e76"), hx("#9a9ca2")];

export interface GP {
  bob: number; sway: number; lean: number; hd: V2; ht: number; sink: number;
  sh: [V2, V2];   // плечи: смещение (левое/правое на экране; вбок — дальнее/ближнее)
  fist: [V2, V2]; // кулаки: смещение от покоя
  legs: [V2, V2]; // ноги: [вперёд, подъём]
  rg: number; crack: number; dust: number; chips: number; ph: number;
}
export const REST: GP = { bob: 0, sway: 0, lean: 0, hd: [0, 0], ht: 0, sink: 0, sh: [[0, 0], [0, 0]], fist: [[0, 0], [0, 0]], legs: [[0, 0], [0, 0]], rg: 0.6, crack: 0, dust: 0, chips: 0, ph: 0 };

const runeC = (rg: number, k = 0): C => RUNE[clamp(Math.round(1.6 + rg * 2.2 + k), 1, 4)];
function rune(f: Frame2, pts: V2[], rg: number) {
  pts.forEach((p, i) => { f.px(p, runeC(rg, i % 3 === 0 ? 0.6 : 0), true); if (rg > 0.5 && i % 2 === 0) f.halo(p, RUNE[1]); });
}
/** шов: тёмная линия + светлая кромка над ней */
function seam(f: Frame2, a: V2, b: V2, lit = true) {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i <= n; i++) { const p = lerp(a, b, i / n); f.px(p, STONE[1]); if (lit && i % 2 === 0) f.px(add(p, [-0.2, -1]), STONE[5]); }
}
function chip(f: Frame2, p: V2) { f.px(p, STONE[6]); f.px(add(p, [1, 0]), STONE[4]); f.px(add(p, [0, 1]), STONE[1]); f.px(add(p, [1, 1]), STONE[2]); }
function puffs(f: Frame2, at: V2, k: number, seed: number, w = 1) {
  if (k <= 0.02) return;
  for (let i = 0; i < 12; i++) { const a = hash(i, seed) * PI, r = 1 + k * (2 + 5 * hash(seed, i)) * w; const p: V2 = [at[0] + COS(a) * r * 1.6, at[1] - SIN(a) * r * 0.7]; f.px(p, DUST[i % 3]); }
}
/** плита: маска + светлая верхняя грань (вид 3/4) */
function slab(f: Frame2, m: ReturnType<typeof sh>, ramp: C[], bias: number, grp: string, topH = 1.6) {
  f.add(m, ramp, { grp, bias, amp: 2.3, dome: 2, occ: 1.4, rim: 0.7, reflex: 0.6 });
  // верхняя грань: полоса под верхним краем светлее
  const top = sh(N);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.d[y * m.w + x] && !m.has(x, y - Math.round(topH * 2))) top.set(x, y);
  f.add(top, ramp, { grp, inherit: true, bias: 1.0 });
}
function fistAt(f: Frame2, p: V2, ramp: C[], bias: number, grp: string, down: boolean) {
  const m = sh(N).E(p, 4.1, 3.5, 0.1).E(add(p, [0, 1.2]), 3.6, 2.6);
  slab(f, m, ramp, bias, grp, 1.4);
  for (let i = -1; i <= 1; i++) f.px(add(p, [i * 1.6 - 0.3, down ? 2.6 : -2.2]), ramp[1]);
  f.px(add(p, [-1.8, -1.4]), ramp[6] ?? ramp[ramp.length - 1]);
}
function arm(f: Frame2, s: V2, fist: V2, pole: V2, ramp: C[], bias: number, grp: string) {
  const el = ik2(s, fist, 6.6, 7.2, pole);
  const m = sh(N).L(s, el, 5, 4.6).L(el, add(fist, nrm([el[0] - fist[0], el[1] - fist[1]]), 2), 5, 5.6);
  slab(f, m, ramp, bias, grp, 1);
  seam(f, add(el, [-1.6, 0]), add(el, [1.6, 0.4]));
  fistAt(f, fist, ramp, bias + 0.1, grp + "f", fist[1] > el[1]);
}

// ================= ВНИЗ / ВВЕРХ =================
function frontBack(p: GP, back: boolean): Frame2 {
  const f = new Frame2(N), cx = 24;
  const B = (x: number, y: number): V2 => [x + p.sway * clamp((44 - y) / 20, 0, 1), y + p.bob + p.sink * clamp((45 - y) / 12, 0, 1)];
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), B(cx, 21), p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  // ноги-столбы
  for (const s of [-1, 1]) {
    const lg = s < 0 ? p.legs[0] : p.legs[1], hip = B(cx + s * 4.6, 35.4), foot: V2 = [cx + s * 5 + lg[0] * 0.3 + p.sway * 0.3, 42.6 - lg[1] + lg[0] * 0.2];
    slab(f, sh(N).L(hip, foot, 6, 5.2), STONED, s < 0 ? 0.1 : -0.2, "leg" + s, 1);
    slab(f, sh(N).E(add(foot, [0, 0.5]), 3.9, 1.7), STONE, s < 0 ? 0 : -0.3, "foot" + s, 1);
    seam(f, add(lerp(hip, foot, 0.5), [-2, 0]), add(lerp(hip, foot, 0.5), [2, 0.5]));
  }
  slab(f, sh(N).P([B(cx - 7, 32.4), B(cx + 7, 32.4), B(cx + 6, 37.2), B(cx - 6, 37.2)]), STONED, 0, "pelvis");
  // грудь
  const chest = sh(N).P([B(cx - 10.6, 21.4), B(cx + 10.6, 21.4), B(cx + 8.4, 29.6), B(cx + 5, 34), B(cx - 5, 34), B(cx - 8.4, 29.6)]);
  slab(f, chest, STONE, back ? -0.15 : 0.1, "chest", 1.8);
  seam(f, B(cx - 0.2, 22.2), B(cx + 0.4, 27.6)); seam(f, B(cx + 0.4, 27.6), B(cx - 0.3, 33.2));
  seam(f, B(cx - 8.2, 28.4), B(cx + 8.2, 28.8));
  chip(f, B(cx - 6.4, 23.4)); chip(f, B(cx + 4.2, 30.4)); f.px(B(cx + 7, 24.4), STONE[1]); f.px(B(cx + 7.6, 25.4), STONE[1]);
  f.add(sh(N).E(B(cx - 5.4, 32.2), 1.8, 1).E(B(cx + 2.6, 23.2), 1.4, 0.8), MOSS, { grp: "chest", inherit: true, bias: 0.4 });
  // руна на груди (вниз) / большая руна на спине (вверх)
  if (!back) rune(f, [B(cx - 2, 24.4), B(cx - 1, 25.4), B(cx, 26.4), B(cx + 1, 25.4), B(cx + 2, 24.4), B(cx, 27.4), B(cx, 28.4), B(cx - 1.6, 30), B(cx + 1.6, 30)], p.rg);
  else rune(f, [B(cx, 23), B(cx, 24), B(cx, 25), B(cx, 26), B(cx, 27), B(cx, 28), B(cx - 2, 24.6), B(cx + 2, 24.6), B(cx - 3, 26), B(cx + 3, 26), B(cx - 2, 29.4), B(cx + 2, 29.4)], p.rg);
  // голова
  const head = sh(N).P([Hd(cx - 3.6, 13.6), Hd(cx + 3.6, 13.6), Hd(cx + 4.6, 17.4), Hd(cx + 3.2, 20.6), Hd(cx - 3.2, 20.6), Hd(cx - 4.6, 17.4)]);
  const drawHead = () => {
    slab(f, head, STONE, 0.3, "head", 1.6);
    if (!back) {
      for (let x = -3; x <= 3; x++) f.px(Hd(cx + x, 16.2), STONE[1]);
      for (const s of [-1, 1]) { const e = Hd(cx + s * 2 - (s > 0 ? 1 : 0), 17.2); f.px(e, runeC(p.rg, 0.8), true); f.px(add(e, [1, 0]), runeC(p.rg), true); f.halo(e, RUNE[1]); }
      f.px(Hd(cx, 19.4), STONE[1]); f.px(Hd(cx - 1, 19.4), STONE[2]); f.px(Hd(cx + 1, 19.4), STONE[2]);
    } else { seam(f, Hd(cx - 3, 17.4), Hd(cx + 3, 17.8)); chip(f, Hd(cx - 1.6, 15)); }
  };
  if (!back) drawHead();
  // плечи-валуны и руки
  for (const s of [-1, 1]) {
    const so = p.sh[s < 0 ? 0 : 1], fo = p.fist[s < 0 ? 0 : 1];
    const S = add(B(cx + s * 11.6, 24.2), so), fist = add(B(cx + s * 12.6, 37.2), fo);
    arm(f, S, fist, [s, 0.2], STONE, s < 0 ? 0.15 : -0.15, "arm" + s);
    const boul = sh(N).E(add(B(cx + s * 10.8, 21.4), so), 5.6, 4.6, s * 0.25);
    slab(f, boul, STONE, s < 0 ? 0.35 : 0.05, "sh" + s, 2);
    chip(f, add(B(cx + s * 10.8 - 1.6, 19.6), so));
    rune(f, [add(B(cx + s * 11.6, 22.2), so), add(B(cx + s * 11.6, 23.2), so), add(B(cx + s * 10.6, 22.7), so)], p.rg * 0.85);
  }
  if (back) drawHead();
  // удар оземь: трещина-руна и пыль
  if (p.crack > 0.02) {
    const c0 = B(cx, 43.6), L = 3 + 9 * p.crack;
    for (const s of [-1, 1]) for (let i = 0; i <= L; i++) { const q: V2 = [c0[0] + s * i, c0[1] + SIN(i * 1.7 + s) * 0.6]; f.px(q, runeC(1 - p.crack * 0.5, i < 3 ? 1 : 0), true); }
  }
  puffs(f, B(cx - 8, 43.8), p.dust, 3 + Math.floor(p.ph * 7)); puffs(f, B(cx + 8, 43.8), p.dust, 7 + Math.floor(p.ph * 7));
  if (p.chips > 0.02) for (let i = 0; i < 5; i++) chip(f, B(cx + (hash(i, 3) - 0.5) * 22, 18 - p.chips * 6 * hash(3, i) + i));
  return f;
}

// ================= ВБОК (лицом вправо) =================
function side(p: GP): Frame2 {
  const f = new Frame2(N);
  const B = (x: number, y: number): V2 => { const q = rot([x, y], [24, 44], p.lean); return [q[0], q[1] + p.bob + p.sink * clamp((45 - y) / 12, 0, 1)]; };
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), B(28, 21), p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const legF: V2 = [21 + p.legs[0][0], 42.6 - p.legs[0][1]], legN: V2 = [26 + p.legs[1][0], 42.6 - p.legs[1][1]];
  // дальние: нога, рука
  slab(f, sh(N).L(B(21.4, 35.4), legF, 5.4, 4.8), STONED, -0.5, "legF", 1);
  slab(f, sh(N).E(add(legF, [1, 0.5]), 3.9, 1.6), STONED, -0.4, "footF", 1);
  arm(f, add(B(21.6, 23.6), p.sh[0]), add(B(19.6, 37.4), p.fist[0]), [-1, 0.2], STONED, -0.5, "armF");
  // таз и торс (сутулый, грудь вперёд)
  slab(f, sh(N).P([B(17.6, 32), B(28.4, 32), B(28, 37.4), B(18.4, 37.4)]), STONED, -0.1, "pelvis");
  const torso = sh(N).P([B(14.6, 21.4), B(20.4, 16.8), B(29.2, 17.6), B(32.8, 22.6), B(31.8, 31), B(28.4, 35), B(18, 35), B(14.4, 29)]);
  slab(f, torso, STONE, 0, "torso", 1.8);
  seam(f, B(15.4, 26.4), B(31.8, 27.4)); seam(f, B(18.6, 27.6), B(19.2, 34.2)); chip(f, B(17, 23.4)); chip(f, B(28, 30.6));
  f.add(sh(N).E(B(18.4, 31.6), 1.6, 1), MOSS, { grp: "torso", inherit: true, bias: 0.4 });
  rune(f, [B(30.6, 23.4), B(31, 24.4), B(30.6, 25.4), B(30, 26.4), B(30.8, 28.6), B(31, 29.6)], p.rg);
  // ближняя нога
  slab(f, sh(N).L(B(25.6, 35.4), legN, 6, 5.2), STONED, 0.1, "legN", 1);
  slab(f, sh(N).E(add(legN, [1.2, 0.5]), 4.2, 1.7), STONE, 0, "footN", 1);
  seam(f, add(lerp(B(25.6, 35.4), legN, 0.5), [-2, 0]), add(lerp(B(25.6, 35.4), legN, 0.5), [2, 0.4]));
  // голова вперёд и ниже плеч
  const head = sh(N).P([Hd(28.6, 14.6), Hd(33.4, 15.4), Hd(34.8, 19.4), Hd(33.6, 21.6), Hd(29.4, 21.4), Hd(27.6, 18)]);
  slab(f, head, STONE, 0.3, "head", 1.6);
  for (let x = 30; x <= 34; x++) f.px(Hd(x, 17.2), STONE[1]);
  { const e = Hd(33, 18.2); f.px(e, runeC(p.rg, 0.8), true); f.px(add(e, [1, 0]), runeC(p.rg), true); f.halo(e, RUNE[1]); }
  f.px(Hd(34, 20.4), STONE[1]);
  // ближнее плечо и рука
  const so = p.sh[1];
  slab(f, sh(N).E(add(B(22.6, 20.8), so), 6.4, 5.2, 0.15), STONE, 0.35, "shN", 2);
  chip(f, add(B(21.4, 18.8), so));
  rune(f, [add(B(24.4, 21.4), so), add(B(24.4, 22.4), so), add(B(23.4, 21.9), so)], p.rg * 0.85);
  arm(f, add(B(24, 24), so), add(B(27.6, 37.6), p.fist[1]), [-1, 0.3], STONE, 0.2, "armN");
  if (p.crack > 0.02) {
    const c0: V2 = [34 + p.fist[1][0] * 0.2, 43.6], L = 3 + 8 * p.crack;
    for (const s of [-1, 1]) for (let i = 0; i <= L; i++) f.px([c0[0] + s * i * (s > 0 ? 0.6 : 1), c0[1] + SIN(i * 1.7 + s) * 0.5], runeC(1 - p.crack * 0.5, i < 3 ? 1 : 0), true);
  }
  puffs(f, [30, 43.8], p.dust, 3 + Math.floor(p.ph * 7)); puffs(f, [38, 43.8], p.dust * 0.8, 9 + Math.floor(p.ph * 7), 0.7);
  if (p.chips > 0.02) for (let i = 0; i < 5; i++) chip(f, B(16 + hash(i, 3) * 16, 18 - p.chips * 6 * hash(3, i) + i));
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: GP) { return (v === "side" ? side(p) : frontBack(p, v === "back")).resolve(); }

// ================= анимации =================
export function idle(): GP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12;
    return { ...REST, bob: 0.4 * SIN(t), rg: 0.55 + 0.35 * SIN(t), fist: [[0.3 * SIN(t + 1), 0.3 * SIN(t)], [-0.3 * SIN(t + 1), 0.3 * SIN(t + 0.5)]] as [V2, V2], hd: [0.3 * SIN(t * 0.5), 0.2 * SIN(t - 1)] as V2, ph: i / 12 };
  });
}
export function walk(v: View): GP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12, s = SIN(t);
    const lg = (q: number): V2 => v === "side" ? [3 * COS(t + q), 2.2 * Math.max(0, SIN(t + q))] : [0.6 * COS(t + q), 2.2 * Math.max(0, SIN(t + q))];
    const sw = v === "side" ? [[-2 * COS(t), 0], [2 * COS(t), 0]] : [[0, 1.2 * COS(t)], [0, -1.2 * COS(t)]];
    return { ...REST, legs: [lg(0), lg(PI)] as [V2, V2], sway: v === "side" ? 0 : 0.9 * s, bob: -0.9 * Math.abs(COS(t)) + 0.3, fist: sw as [V2, V2], hd: [0, 0.4 * Math.abs(COS(t))] as V2, rg: 0.6 + 0.2 * SIN(2 * t), dust: Math.abs(COS(t)) > 0.95 ? 0.3 : 0, ph: i / 12 };
  });
}
export function act(v: View): GP[] {
  // руны вспыхивают волной, голем по очереди разминает плечи и поводит головой
  return Array.from({ length: 16 }, (_, i) => {
    const a = i >= 2 && i <= 6 ? SIN(((i - 2) / 4) * PI) : 0, b = i >= 7 && i <= 11 ? SIN(((i - 7) / 4) * PI) : 0;
    const both = i >= 12 && i <= 14 ? SIN(((i - 12) / 2) * PI) : 0;
    const rg = 0.5 + 0.9 * Math.max(0, SIN((i / 15) * PI * 3)) * (i < 14 ? 1 : 0.4);
    const L: V2 = [v === "side" ? 0 : -0.6 * a, -2.4 * a - 1.4 * both], Rr: V2 = [v === "side" ? 0.6 * b : 0.6 * b, -2.4 * b - 1.4 * both];
    return { ...REST, sh: [L, Rr] as [V2, V2], fist: [[0, -1.6 * a - both], [0, -1.6 * b - both]] as [V2, V2], ht: v === "side" ? 0.08 * (a - b) : 0.12 * (b - a), hd: [0.8 * (b - a) * (v === "back" ? -1 : 1), 0] as V2, rg, bob: -0.6 * both, ph: i / 16 };
  });
}
export function attack(v: View): GP[] {
  const up: [V2, V2] = v === "side" ? [[5, -21], [1.6, -22]] : [[6.4, -25], [-6.4, -25]];
  const hit: [V2, V2] = v === "side" ? [[11, 4.2], [7.4, 4.4]] : [[8, 4.4], [-8, 4.4]];
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { fist: [[up[0][0] * 0.5, up[0][1] * 0.5], [up[1][0] * 0.5, up[1][1] * 0.5]] as [V2, V2], sh: [[0, -1], [0, -1]] as [V2, V2], bob: -0.6, rg: 0.9, ht: v === "side" ? -0.08 : 0 } },
    { f: 4, p: { fist: up, sh: [[0, -2], [0, -2]] as [V2, V2], bob: -1.2, rg: 1.3, hd: [0, -0.6] as V2, ht: v === "side" ? -0.12 : 0 } },
    { f: 5, p: { fist: hit, sh: [[0, 1], [0, 1]] as [V2, V2], sink: 3.4, lean: v === "side" ? 0.12 : 0, bob: 0.6, rg: 1.4, crack: 0.3, dust: 0.6, hd: [v === "side" ? 1.2 : 0, 1.4] as V2, ht: v === "side" ? 0.15 : 0 } },
    { f: 7, p: { fist: hit, sh: [[0, 1], [0, 1]] as [V2, V2], sink: 3, lean: v === "side" ? 0.1 : 0, bob: 0.4, rg: 1, crack: 1, dust: 1, ph: 0.5 } },
    { f: 9, p: { fist: [[0, 0], [0, 0]] as [V2, V2], sh: [[0, 0], [0, 0]] as [V2, V2], sink: 0, lean: 0, bob: 0, rg: 0.6, crack: 0, dust: 0, hd: [0, 0] as V2, ht: 0 } },
  ], 10);
}
export function hurt(v: View): GP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { hd: [v === "side" ? -1.2 : 0.8, -0.6] as V2, ht: v === "side" ? -0.15 : 0.1, sway: v === "side" ? 0 : -1, lean: v === "side" ? -0.05 : 0, rg: 0, chips: 0.5, fist: [[-1, -1], [1, -1]] as [V2, V2] } },
    { f: 3, p: { hd: [-0.4, -0.2] as V2, ht: 0, sway: 0.4, lean: 0, rg: 1.2, chips: 1 } },
    { f: 7, p: { hd: [0, 0] as V2, ht: 0, sway: 0, rg: 0.6, chips: 0, fist: [[0, 0], [0, 0]] as [V2, V2] } },
  ], 8);
}
export function death(v: View): GP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { rg: 1.4, ht: v === "side" ? -0.1 : 0, hd: [0, -0.6] as V2 } },
    { f: 4, p: { rg: 0.2, chips: 0.6 } },
    { f: 7, p: { rg: 0, sink: 6, hd: [v === "side" ? 1.4 : 0, 3.4] as V2, ht: v === "side" ? 0.3 : 0.1, fist: v === "side" ? [[2, 4], [5, 4.2]] as [V2, V2] : [[-2, 4.2], [2, 4.2]] as [V2, V2], sh: [[0, 2.4], [0, 2.4]] as [V2, V2], chips: 1, dust: 0.8 } },
    { f: 11, p: { rg: 0, sink: 7, hd: [v === "side" ? 1.6 : 0, 4] as V2, ht: v === "side" ? 0.34 : 0.12, chips: 0, dust: 0.3 } },
  ], 12);
}

export const pet: PetDef<GP> = {
  id: "rune_golem", ru: "МАЛЫЙ РУННЫЙ ГОЛЕМ", N, shadow: 12, fx: ["#0a2a3a", "#2aa0c8", "#e0fcff"],
  act: "РУНЫ ПУЛЬСИРУЮТ, РАЗМИНАЕТ ПЛЕЧИ", atk: "УДАР КУЛАКАМИ ОЗЕМЬ",
  render, anims: { idle: () => idle(), act, walk, attack, hurt, death },
  icon: { view: "front" },
};
