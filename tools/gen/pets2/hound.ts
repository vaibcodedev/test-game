/**
 * Костяная гончая Умбрата (проход 4): кадр 48, ступни y≈44. Виды: вниз, вверх, вбок (морда вправо; влево — зеркало).
 * Части: чёрные кости с холодным бликом — длинный череп с глазницами и носовой дырой, нижняя челюсть на шарнире, зубы; позвоночник
 * позвонками с остистыми отростками, рёбра дугами, грудина, лопатка, таз, лапы костями с шаровыми суставами и когтями, хвост цепью позвонков;
 * зелёный огонь Умбрата: ядро в грудной клетке (видно между рёбрами), в глазницах, языки над хребтом (лист свечения); железный ошейник с шипами.
 */
import { Frame2, R, add, clamp, ik2, lerp, nrm, perp, rot, sh, PI, SIN, COS, type V2, type C, hx, hash } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 48;
const BONE = R("#0d0c11", "#1d1b23", "#312d39", "#4d4858", "#746d80", "#a49cb0");
const BONED = R("#09080c", "#14121a", "#221f28", "#332f3b", "#4a4552", "#655f6e");
const FIRE = R("#0a2a0e", "#165c18", "#2e9422", "#6cd040", "#c8f890");
const IRON = R("#0c0b0e", "#1e1c22", "#34313a", "#56525e", "#7c7886");
const TOOTH = hx("#9a94a4"), TOOTH2 = hx("#5a5462"), HOLE = hx("#030205");

export interface HP {
  bob: number; br: number; hd: V2; ht: number; jaw: number;
  legs: [V2, V2, V2, V2]; lean: number; sink: number; tail: number; sway: number;
  crouch: number; air: number; dx: number; dy: number; pitch: number; reach: number; fl: number; flare: number;
}
export const REST: HP = { bob: 0, br: 0, hd: [0, 0], ht: 0, jaw: 0, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], lean: 0, sink: 0, tail: 0, sway: 0, crouch: 0, air: 0, dx: 0, dy: 0, pitch: 0, reach: 0, fl: 0, flare: 0 };

/** кость: стержень с утолщёнными концами */
function bone(f: Frame2, a: V2, b: V2, w: number, ramp: C[], bias: number, grp: string) {
  f.add(sh(N).L(a, b, w, w * 0.8).D(a, w * 0.62).D(b, w * 0.58), ramp, { grp, bias, amp: 1.7, dome: 1, occ: 1.2 });
}
function knob(f: Frame2, p: V2, r: number, ramp: C[], bias: number, grp: string) {
  f.add(sh(N).D(p, r), ramp, { grp, bias: bias + 0.4, amp: 1.8, dome: 1, occ: 1 });
}
/** ребро: дуга-безье */
function rib(f: Frame2, a: V2, c: V2, b: V2, w: number, ramp: C[], bias: number, grp: string) {
  const m = sh(N);
  for (let i = 0; i < 12; i++) {
    const u0 = i / 12, u1 = (i + 1) / 12, q = (u: number): V2 => [(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]];
    m.L(q(u0), q(u1), w * (1 - u0 * 0.3), w * (1 - u1 * 0.3));
  }
  f.add(m, ramp, { grp, bias, amp: 1.6, dome: 1, occ: 1.1 });
}
/** огонь: пятно свечения с мерцанием */
function fire(f: Frame2, m: ReturnType<typeof sh>, p: HP, bias = 0) {
  f.add(m, FIRE, { grp: "fire", glow: true, bias: bias + 0.4 * SIN(p.fl * 2 * PI) + p.flare * 0.8, amp: 1.2, dome: 3, rim: 0, reflex: 0 });
}
function socket(f: Frame2, p: V2, hp: HP, w = 2) {
  f.px(p, HOLE); f.px(add(p, [1, 0]), HOLE);
  if (hp.flare > -0.6) { f.px(add(p, [w > 1 ? 1 : 0, 0]), FIRE[3], true); f.px(p, FIRE[2], true); f.halo(p, FIRE[0]); f.halo(add(p, [1, -1]), FIRE[1]); }
}
function wisps(f: Frame2, base: V2[], p: HP) {
  if (p.flare < -0.5) return;
  base.forEach((b, i) => {
    const ph = (p.fl + i * 0.37) % 1, h = 1 + ph * (3 + p.flare * 2);
    const q = add(b, [SIN((ph + i) * 6) * 0.6, -h]);
    f.px(q, FIRE[ph < 0.5 ? 3 : 2], true);
    if (ph < 0.6) f.px(add(q, [0, 1]), FIRE[2], true);
  });
}
function paw(f: Frame2, p: V2, dir: V2, ramp: C[], bias: number, grp: string) {
  const m = sh(N).E(p, 2, 1.1);
  for (const k of [-0.9, 0, 0.9]) m.L(p, add(add(p, dir, 2.2), perp(dir), k * 0.6), 1);
  f.add(m, ramp, { grp, bias, amp: 1.5, dome: 1, occ: 1 });
  for (const k of [-0.9, 0, 0.9]) f.px(add(add(p, dir, 3), perp(dir), k * 0.7), TOOTH);
}

// ================= ВБОК (морда вправо) =================
function side(p: HP): Frame2 {
  const f = new Frame2(N);
  const B = (x: number, y: number): V2 => {
    let q: V2 = [x, y];
    if (p.pitch) q = rot(q, [24, 29], -p.pitch);
    return [q[0] + p.dx + p.lean, q[1] + p.dy + p.bob + p.sink * clamp((46 - y) / 16, 0, 1) + p.crouch * clamp((44 - y) / 14, 0, 1)];
  };
  const neckP = B(31, 23.4);
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), neckP, p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs, air = p.air;
  const gnd = (x: number, i: number): V2 => [x + L[i][0] + p.lean, 43.6 - L[i][1]];
  const legF = (sh0: V2, pw: V2, ramp: C[], bias: number, grp: string) => {
    const wr = add(pw, [-1, -3.4]);
    const el = ik2(sh0, wr, 6.8, 5.8, [-1, 0.1]);
    bone(f, sh0, el, 2.2, ramp, bias, grp); bone(f, el, wr, 1.8, ramp, bias, grp); bone(f, wr, pw, 1.5, ramp, bias, grp);
    knob(f, el, 1.3, ramp, bias, grp + "k"); knob(f, wr, 1.1, ramp, bias, grp + "k");
    paw(f, pw, [1, 0.2], ramp, bias, grp + "p");
  };
  const legH = (hip: V2, pw: V2, ramp: C[], bias: number, grp: string) => {
    const hk = air > 0.3 ? add(pw, [1.6, -4]) : add(pw, [-1.8, -4.4]);
    const kn = ik2(hip, hk, 7, 6.6, [1, 0]);
    bone(f, hip, kn, 2.4, ramp, bias, grp); bone(f, kn, hk, 1.8, ramp, bias, grp); bone(f, hk, pw, 1.5, ramp, bias, grp);
    knob(f, kn, 1.4, ramp, bias, grp + "k"); knob(f, hk, 1.1, ramp, bias, grp + "k");
    paw(f, pw, [1, 0.2], ramp, bias, grp + "p");
  };
  const reachP = (b: V2, k: number): V2 => add(b, [p.reach * 5 * k, -p.reach * 5 * k]);
  const pFN: V2 = air > 0 ? lerp(gnd(30.4, 0), reachP(B(31, 39), 1), air) : gnd(30.4, 0);
  const pFF: V2 = air > 0 ? lerp(gnd(26.4, 1), reachP(B(27, 39), 0.8), air) : gnd(26.4, 1);
  let pHN: V2 = gnd(14.4, 2), pHF: V2 = gnd(18.8, 3);
  if (air > 0) { pHN = lerp(pHN, add(B(9.6, 40), [-1, 0]), air); pHF = lerp(pHF, add(B(14.4, 40), [-1, 0]), air); }
  // дальние лапы
  legH(B(17.4, 27.4), pHF, BONED, -0.3, "hf");
  legF(B(26.6, 28.4), pFF, BONED, -0.3, "ff");
  // хвост цепью
  for (let i = 6; i >= 1; i--) { const q = B(11 - i * 1.2, 25 - i * 0.2 + i * i * 0.12 + SIN(i * 0.8 + p.tail * 2) * 0.8 * (i / 6)); knob(f, q, 1.1 - i * 0.08, BONE, -0.1, "t" + i); }
  // огонь в груди, затем рёбра поверх
  fire(f, sh(N).E(B(23.2, 28.6), 5.4 + p.br * 0.3, 3.3 + p.br * 0.3), p, 0);
  const spine = (u: number): V2 => { const x = 11.6 + u * 19, y = 25 - SIN(u * PI) * 1.8 - u * 0.6; return B(x, y); };
  for (let i = 0; i < 5; i++) {
    const s = spine(0.45 + i * 0.095), e = B(s[0] - p.dx - p.lean - 1.4 + i * 0.1, 32.6 - Math.abs(i - 2.5) * 0.5 + p.br * 0.3);
    rib(f, s, add(s, [2.6, 3.6 + p.br * 0.3]), e, 1.05, BONE, 0.35 - i * 0.04, "r" + i);
  }
  bone(f, B(20.6, 32.6), B(28, 31.8), 1.2, BONE, -0.1, "st");
  // таз и лопатка
  f.add(sh(N).P([B(10.4, 24.2), B(17.2, 24.6), B(16.4, 28.6), B(12, 29.2)]), BONE, { grp: "pel", bias: 0.2, amp: 1.8, dome: 2, occ: 1.1 });
  f.px(B(13.4, 26.4), HOLE); f.px(B(14.4, 26.6), BONE[1]);
  // позвонки с отростками
  for (let k = 0; k <= 14; k++) {
    const q = spine(k / 14);
    f.add(sh(N).D(q, 1.25).L(q, add(q, [-0.4, -1.6]), 0.9, 0.6), BONE, { grp: "v" + (k % 2), bias: 0.35, amp: 1.8, dome: 1, occ: 0.9 });
  }
  f.add(sh(N).P([B(26.8, 22.8), B(30.8, 23.4), B(29.6, 29.2), B(27.4, 28.6)]), BONE, { grp: "sc", bias: 0.15, amp: 1.8, dome: 2, occ: 1.1 });
  // шейные позвонки
  for (let k = 0; k < 4; k++) knob(f, lerp(B(30.6, 23.6), Hd(34.4, 20.8), k / 3), 1.3, BONE, 0, "n" + k);
  // ошейник
  const col = lerp(B(30.6, 23.6), Hd(34.4, 20.8), 0.4);
  f.add(sh(N).E(col, 1.5, 3.2, 0.5), IRON, { grp: "col", bias: 0.2, amp: 1.6, dome: 1 });
  f.px(add(col, [0.4, -3.6]), IRON[4]); f.px(add(col, [0.6, -4.4]), IRON[3]); f.px(add(col, [1.8, 2.4]), IRON[3]);
  f.px(add(col, [0.2, 0]), FIRE[3], true); f.halo(add(col, [0.2, 0]), FIRE[0]);
  // ближние лапы
  legH(B(14.6, 27.6), pHN, BONE, 0.15, "hn");
  legF(B(29, 28.8), pFN, BONE, 0.2, "fn");
  // череп: нижняя челюсть на шарнире, свод, морда, зубы
  const hinge = Hd(36.6, 22.6), ja = p.jaw * 0.6;
  const jawP = [Hd(36.4, 22.4), Hd(43.6, 22.6), Hd(43.4, 23.6), Hd(37, 24.6)].map((q) => rot(q, hinge, ja)) as V2[];
  f.add(sh(N).P(jawP), BONE, { grp: "jaw", bias: -0.1, amp: 1.5, dome: 1 });
  for (let i = 0; i < 4; i++) f.px(rot(Hd(38.6 + i * 1.4, 22.2), hinge, ja), i % 2 ? TOOTH2 : TOOTH);
  if (p.jaw > 0.1) fire(f, sh(N).P([Hd(37.4, 22.6), Hd(42.6, 22.6), rot(Hd(42.2, 22.8), hinge, ja * 0.8), rot(Hd(37.4, 23.2), hinge, ja * 0.8)]), p, -0.3);
  const skull = sh(N).E(Hd(35.8, 19.8), 3.3, 2.8).P([Hd(36.8, 17.8), Hd(41, 19.2), Hd(44.6, 20.6), Hd(44.4, 21.8), Hd(37.4, 22.4)]);
  f.add(skull, BONE, { grp: "sk", bias: 0.45, amp: 1.9, dome: 2 });
  for (let i = 0; i < 5; i++) f.px(Hd(38.4 + i * 1.3, 22.2), i % 2 ? TOOTH2 : TOOTH);
  f.px(Hd(44.2, 22.6), TOOTH); f.px(Hd(44.2, 23.4), TOOTH2); // клык
  f.px(Hd(43.2, 20.4), HOLE); f.px(Hd(42.2, 20.2), BONE[1]); // носовая дыра
  for (let i = 0; i < 4; i++) f.px(Hd(37.6 + i * 1.6, 18.2 + i * 0.5), BONE[5]); // блик по своду и переносице
  f.px(Hd(35.4, 21.6), BONE[1]); f.px(Hd(36.4, 21.8), BONE[1]); // скула
  socket(f, Hd(37.2, 19.2), p);
  wisps(f, [spine(0.5), spine(0.62), spine(0.74), spine(0.86)], p);
  return f;
}

// ================= ВНИЗ (к зрителю) =================
function front(p: HP): Frame2 {
  const f = new Frame2(N), cx = 24;
  const lift = -p.air * 5;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + p.dy + lift * clamp((44 - y) / 18, 0, 1) + p.sink * clamp((46 - y) / 14, 0, 1) + p.crouch * clamp((44 - y) / 14, 0, 1)];
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y + 3.4), B(cx, 30.4), p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs;
  // таз и хребет (уходят вдаль)
  f.add(sh(N).E(B(cx, 16.8), 3.8, 1.6), BONE, { grp: "pel", bias: 0.1, amp: 1.7, dome: 1 });
  for (let k = 0; k <= 5; k++) knob(f, B(cx, 16.8 + k * 1.3), 1.15, BONE, 0.2, "v" + (k % 2));
  // огонь в груди и рёбра дугами
  fire(f, sh(N).E(B(cx, 23.4), 6.4 + p.br * 0.3, 4.2 + p.br * 0.2), p, 0);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const y0 = B(cx, 18.4 + i * 2.2)[1], o = B(cx + s * 0.8, 18.4 + i * 2.2);
    rib(f, o, [cx + p.sway + s * (10 + p.br * 0.3 - i * 0.6), y0 + 1.6], [cx + p.sway + s * 2.6, y0 + 5.6 - i * 0.3], 1.1, BONE, 0.25 - i * 0.05 + (s < 0 ? 0.1 : -0.1), "r" + i + s);
  }
  bone(f, B(cx, 24.6), B(cx, 28.6), 1.1, BONE, 0, "st");
  // передние лапы
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[0] : L[1], x = cx + s * 5.2;
    let pw: V2 = [x + p.sway * 0.6, 43.6 - lg[1] + lg[0] * 0.25];
    if (p.air > 0) pw = lerp(pw, add(B(x + s, 36), [s * p.reach * 2, -p.reach * 5]), p.air);
    const top = B(x, 28.6), el = add(lerp(top, pw, 0.42), [s * 1.1, 0]), wr = lerp(top, pw, 0.82);
    f.add(sh(N).P([B(x + s * 0.4, 25.8), B(x + s * 2, 26.4), add(top, [s * 0.6, 0.4]), add(top, [-s * 0.4, 0])]), BONE, { grp: "sc" + s, bias: 0.2, amp: 1.7, dome: 1 });
    bone(f, top, el, 2.2, BONE, 0.2, "f" + s); bone(f, el, wr, 1.8, BONE, 0.2, "f" + s); bone(f, wr, pw, 1.5, BONE, 0.2, "f" + s);
    knob(f, top, 1.5, BONE, 0.2, "fk" + s); knob(f, el, 1.3, BONE, 0.2, "fk" + s);
    paw(f, pw, [0, 0.45], BONE, 0.3, "fp" + s);
  }
  // ошейник под черепом
  f.add(sh(N).E(Hd(cx, 21.6), 3.8, 1.3), IRON, { grp: "col", bias: 0.1, amp: 1.6, dome: 1 });
  for (const s of [-1, 1]) { f.px(Hd(cx + s * 4.2, 21.2), IRON[3]); f.px(Hd(cx + s * 5, 20.8), IRON[2]); }
  // череп: свод, морда к зрителю, глазницы, челюсть
  const jo = p.jaw * 2.4;
  f.add(sh(N).P([Hd(cx - 2.6, 30.4), Hd(cx + 2.6, 30.4), Hd(cx + 2, 31.6 + jo), Hd(cx - 2, 31.6 + jo)]), BONE, { grp: "jaw", bias: -0.1, amp: 1.4, dome: 1 });
  if (p.jaw > 0.1) fire(f, sh(N).E(Hd(cx, 30.8 + jo * 0.5), 2, 0.4 + jo * 0.4), p, -0.3);
  for (let i = 0; i < 3; i++) f.px(Hd(cx - 1.6 + i * 1.6, 31.2 + jo), i % 2 ? TOOTH2 : TOOTH);
  f.add(sh(N).E(Hd(cx, 23.8), 4.4, 3.4).E(Hd(cx - 3.4, 25.4), 1.4, 1.6).E(Hd(cx + 3.4, 25.4), 1.4, 1.6).P([Hd(cx - 2.6, 25.4), Hd(cx + 2.6, 25.4), Hd(cx + 2, 30.4), Hd(cx - 2, 30.4)]), BONE, { grp: "sk", bias: 0.8, amp: 1.9, dome: 2 });
  f.add(sh(N).P([Hd(cx - 1.6, 26.4), Hd(cx + 1.6, 26.4), Hd(cx + 1.4, 30.2), Hd(cx - 1.4, 30.2)]), BONE, { grp: "sn", bias: 0.9, amp: 1.6, dome: 1, occ: 0.6 });
  f.px(Hd(cx - 0.5, 28.4), HOLE); f.px(Hd(cx + 0.5, 28.4), HOLE); f.px(Hd(cx - 0.5, 29.2), BONE[1]);
  for (let i = 0; i < 4; i++) f.px(Hd(cx - 1.8 + i * 1.2, 30.4), i % 2 ? TOOTH2 : TOOTH);
  f.px(Hd(cx - 2.4, 31), TOOTH); f.px(Hd(cx + 2.2, 31), TOOTH);
  f.px(Hd(cx - 1.2, 21.6), BONE[5]); f.px(Hd(cx, 21.2), BONE[5]); f.px(Hd(cx - 2.4, 22.4), BONE[4]);
  for (const s of [-1, 1]) { const e = Hd(cx + (s < 0 ? -2.8 : 1.8), 24.2); f.px(add(e, [0, 1]), HOLE); f.px(add(e, [1, 1]), HOLE); f.px(add(e, [0, -1]), BONE[5]); f.px(add(e, [1, -1]), BONE[4]); socket(f, e, p); }
  wisps(f, [B(cx - 2, 21), B(cx + 2, 22), B(cx, 19.5)], p);
  return f;
}

// ================= ВВЕРХ (спиной) =================
function back(p: HP): Frame2 {
  const f = new Frame2(N), cx = 24;
  const lift = -p.air * 5;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + p.dy + lift * clamp((44 - y) / 18, 0, 1) + p.sink * clamp((46 - y) / 14, 0, 1) + p.crouch * clamp((44 - y) / 14, 0, 1)];
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), B(cx, 23), -p.ht * 0.7); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs;
  // передние лапы по бокам (дальше)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[1] : L[0], x = cx + s * 6.4;
    let pw: V2 = [x + p.sway * 0.5, 42.6 - lg[1] - lg[0] * 0.3];
    if (p.air > 0) pw = lerp(pw, add(B(x + s, 30), [s, -3 * p.reach]), p.air);
    const el = lerp(B(x, 27), pw, 0.45);
    bone(f, B(x - s * 1.2, 27), el, 1.8, BONED, -0.3, "ff"); bone(f, el, pw, 1.5, BONED, -0.3, "ff");
    knob(f, el, 1.2, BONED, -0.3, "ffk"); paw(f, pw, [0, 0.45], BONED, -0.3, "ffp");
  }
  // затылок черепа и ошейник
  f.add(sh(N).E(Hd(cx, 20.6), 3.6, 2.9), BONE, { grp: "sk", bias: 0.35, amp: 1.8, dome: 2 });
  f.px(Hd(cx, 18.4), BONE[5]); f.px(Hd(cx - 1, 18.8), BONE[4]); f.px(Hd(cx, 21.8), BONE[1]);
  f.add(sh(N).E(Hd(cx, 23.4), 3.4, 1.2), IRON, { grp: "col", bias: 0.2, amp: 1.5, dome: 1 });
  for (const s of [-1, 1]) f.px(Hd(cx + s * 3.2, 22.2), IRON[4]);
  // огонь и рёбра со спины
  fire(f, sh(N).E(B(cx, 29.4), 6.2 + p.br * 0.3, 4.2), p, 0.2);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const o = B(cx, 25 + i * 2.2);
    rib(f, o, add(o, [s * (9.4 + p.br * 0.3 - i * 0.6), 1.6]), add(o, [s * (4.6 - i * 0.3), 4.6]), 1.1, BONE, 0.2 - i * 0.05 + (s < 0 ? 0.1 : -0.1), "r" + i + s);
  }
  for (let k = 0; k <= 9; k++) { const q = B(cx, 24.4 + k * 1.2); f.add(sh(N).D(q, 1.2).L(add(q, [-1.3, 0.2]), add(q, [1.3, 0.2]), 0.8), BONE, { grp: "v" + (k % 2), bias: 0.4, amp: 1.8, dome: 1, occ: 0.9 }); }
  // таз
  f.add(sh(N).E(B(cx, 35.2), 4.8, 2).E(B(cx - 3, 34.6), 2, 1.6).E(B(cx + 3, 34.6), 2, 1.6), BONE, { grp: "pel", bias: 0.25, amp: 1.8, dome: 2, occ: 1 });
  f.px(B(cx - 2.4, 35.2), HOLE); f.px(B(cx + 2, 35.2), HOLE);
  // задние лапы
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * 3.4;
    let pw: V2 = [x + s * 0.5 + p.sway * 0.4, 43.6 - lg[1] + lg[0] * 0.2];
    if (p.air > 0) pw = lerp(pw, add(B(x, 41), [s * 0.5, 1]), p.air);
    const hip = B(x, 35.6), kn = add(lerp(hip, pw, 0.4), [s * 0.8, 0]), hk = add(lerp(hip, pw, 0.72), [s * 0.2, 0]);
    bone(f, hip, kn, 2.4, BONE, 0.15, "h" + s); bone(f, kn, hk, 1.8, BONE, 0.15, "h" + s); bone(f, hk, pw, 1.5, BONE, 0.15, "h" + s);
    knob(f, kn, 1.4, BONE, 0.15, "hk" + s); knob(f, hk, 1.1, BONE, 0.15, "hk" + s);
    paw(f, pw, [0, 0.45], BONE, 0.2, "hp" + s);
  }
  // хвост цепью вверх над тазом
  for (let i = 1; i <= 6; i++) knob(f, B(cx + SIN(i * 0.7 + p.tail * 2) * 0.8 * (i / 6) + i * 0.3, 36.4 - i * 1.5), 1.15 - i * 0.08, BONE, 0.3, "t" + i);
  wisps(f, [B(cx - 3, 26), B(cx + 3, 27.4), B(cx - 1, 29)], p);
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: HP) { const f = v === "side" ? side(p) : v === "front" ? front(p) : back(p); return f.resolve(); }

// ================= анимации =================
export function idle(): HP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (2 * PI * i) / 12;
    return { ...REST, bob: 0.35 * SIN(ph), br: 0.5 + 0.5 * SIN(ph), hd: [0.3 * SIN(ph * 0.5), 0.3 * SIN(ph - 0.7)] as V2, ht: 0.03 * SIN(ph - 1), jaw: i === 6 ? 0.25 : 0, tail: 0.5 * SIN(ph), fl: i / 12 };
  });
}
export function walk(v: View): HP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12, a = (q: number): V2 => v === "side" ? [3.4 * COS(t + q), 2.4 * Math.max(0, SIN(t + q))] : [1.4 * COS(t + q), 2.2 * Math.max(0, SIN(t + q))];
    return { ...REST, legs: [a(0), a(PI), a(PI * 0.9), a(-PI * 0.1)], bob: 0.5 * COS(2 * t) - 0.2, hd: [v === "side" ? 0.3 * COS(t) : 0.4 * SIN(t), 0.4 * COS(2 * t + 0.7)] as V2, sway: v === "side" ? 0 : 0.5 * SIN(t), br: 0.4, tail: SIN(2 * t), fl: i / 12 };
  });
}
export function act(v: View): HP[] {
  // клацает челюстью, наклоняет голову набок, огонь вспыхивает
  return Array.from({ length: 16 }, (_, i) => {
    const clack = i >= 1 && i <= 7, tilt = i >= 8 && i <= 14;
    const tk = tilt ? SIN(((i - 8) / 6) * PI) : 0;
    return { ...REST, jaw: clack ? (i % 2 ? 0.9 : 0.05) : 0, ht: (v === "side" ? -0.18 : 0.32) * tk, hd: [0, v === "side" ? -0.6 * tk : 0.4 * tk] as V2, flare: clack ? (i % 2 ? 0.6 : 0.2) : 0.3 * tk, fl: i / 8, bob: 0.3 * SIN(i), tail: 0.6 * SIN(i * 0.8), br: 0.4 };
  });
}
export function attack(v: View): HP[] {
  const side = v === "side";
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { crouch: 2.4, lean: side ? -1 : 0, ht: 0.08, jaw: 0.3, flare: 0.4, fl: 0.2 } },
    { f: 4, p: { crouch: 0, air: 1, dy: side ? -4.6 : -1, dx: side ? 1.2 : 0, pitch: side ? 0.2 : 0, reach: 1, jaw: 1, lean: 0, ht: -0.12, flare: 0.9, fl: 0.4 } },
    { f: 5, p: { air: 1, dy: side ? -2.6 : 0, dx: side ? 1.6 : 0, pitch: side ? 0.04 : 0, reach: 0.7, jaw: 0, ht: 0.12, flare: 1, fl: 0.5 } },
    { f: 7, p: { air: 0, dy: 0, dx: side ? 1.4 : 0, pitch: 0, reach: 0, jaw: 0.4, crouch: 1, ht: 0.06, flare: 0.5, fl: 0.7 } },
    { f: 9, p: { dx: 0, crouch: 0, jaw: 0, ht: 0, flare: 0, fl: 0.9 } },
  ], 10);
}
export function hurt(v: View): HP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { hd: [v === "side" ? -1.2 : 0, -0.6] as V2, ht: -0.16, jaw: 0.7, crouch: 1, flare: -0.4, sway: v === "side" ? 0 : 0.8, fl: 0.3 } },
    { f: 3, p: { hd: [-0.5, -0.3] as V2, ht: -0.06, jaw: 0.3, crouch: 0.6, flare: -0.2, sway: -0.4, fl: 0.6 } },
    { f: 7, p: { hd: [0, 0] as V2, ht: 0, jaw: 0, crouch: 0, flare: 0, sway: 0, fl: 1 } },
  ], 8);
}
export function death(v: View): HP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { hd: [0, -0.5] as V2, ht: -0.14, jaw: 0.9, flare: 0.8, fl: 0.3 } },
    { f: 6, p: { sink: 8, hd: [v === "side" ? 0.6 : 0, 2.6] as V2, ht: 0.3, jaw: 0.5, flare: -0.4, fl: 0.6, tail: 1 } },
    { f: 11, p: { sink: 8.5, hd: [v === "side" ? 0.8 : 0, 3] as V2, ht: 0.34, jaw: 0.3, flare: -1, fl: 0.9, tail: 1 } },
  ], 12);
}

export const pet: PetDef<HP> = {
  id: "bone_hound", ru: "КОСТЯНАЯ ГОНЧАЯ УМБРАТА", N, shadow: 11, fx: ["#0e3a12", "#4ec22e", "#d8ffb0"],
  act: "КЛАЦАЕТ ЧЕЛЮСТЬЮ, НАКЛОНЯЕТ ГОЛОВУ", atk: "УКУС В ПРЫЖКЕ",
  render, anims: { idle: () => idle(), act, walk, attack, hurt, death },
  icon: { view: "side" },
};
void nrm; void hash;
