/**
 * Призрачный лис (проход 4): кадр 40, лапы на y≈37 (земля 37,5). Виды: вниз, вверх, вбок (морда вправо; влево — зеркало).
 * Дух-лис: холодный бледно-голубой мех прядями (тёмно-синий контур), светлая грудь-жабо и щёки (светятся ночью), острая морда,
 * большие уши с тёмной раковиной, светящиеся глаза-щёлки; три хвоста-огонька — пушистые дуги с языком призрачного пламени на конце
 * (пламя и хвосты — в листе свечения). Лапы 2 сегмента по IK; сидя — тело поворачивается вокруг плеча, задние лапы складываются.
 */
import { Frame2, R, add, clamp, dir, ik2, lerp, nrm, rot, sh, PI, SIN, COS, type V2, type C, hx, type Sh } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 40;
const FOX = R("#141e40", "#253866", "#3c5c8e", "#6088ba", "#92b6de", "#c8e2f6");
const FOXD = R("#0e1430", "#1a254a", "#2a3e68", "#44608e", "#6a8ab6", "#98b8de");
const CHEST = R("#2c4472", "#4e74a6", "#86acd6", "#c0dcf2", "#eef8ff");
const TAIL = R("#1c2c5c", "#3a5c96", "#6490c8", "#98c0e8", "#d4ecfc", "#f4fcff");
const FLAME = R("#1e3c96", "#3a74d8", "#76b8fa", "#c4e8ff", "#ffffff");
const NOSE = R("#080a18", "#141a30", "#26304e", "#46547a");
const EAR_IN = hx("#0e1430"), EAR_IN2 = hx("#2a3e68");
const EYE = hx("#c8f6ff"), EYE2 = hx("#5ec8f0"), MOUTH = R("#1a0c24", "#3a1840", "#6a3060", "#9a5080");

export interface FP {
  bob: number; br: number; hd: V2; ht: number; ear: number; blink: number; jaw: number;
  legs: [V2, V2, V2, V2]; // FN, FF, HN, HF
  sit: number; tw: number; tsp: number; fl: number; heal: number; dim: number; sink: number; lean: number; sway: number;
}
export const REST: FP = { bob: 0, br: 0, hd: [0, 0], ht: 0, ear: 0, blink: 0, jaw: 0, legs: [[0, 0], [0, 0], [0, 0], [0, 0]], sit: 0, tw: 0, tsp: 0, fl: 0, heal: 0, dim: 0, sink: 0, lean: 0, sway: 0 };
const fur = (flow: V2, seed: number, len = 2.4, k = 0.6) => ({ flow: nrm(flow), len, k, seed, gx: 3, gy: 3 });

/** квадратичная кривая толстой линией */
function bz(m: Sh, p0: V2, p1: V2, p2: V2, t0: number, t1: number, n = 14, tm = (t0 + t1) / 2) {
  let prev = p0;
  const th = (u: number) => (u < 0.5 ? t0 + (tm - t0) * Math.sin(u * PI) : tm + (t1 - tm) * (u - 0.5) * 2);
  for (let i = 1; i <= n; i++) {
    const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    const q: V2 = [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
    m.L(prev, q, th((i - 1) / n), th(i / n));
    prev = q;
  }
  return m;
}
/** язык призрачного пламени: капля остриём вверх, мерцает */
function flame(f: Frame2, base: V2, size: number, ph: number, dim: number, seed: number, ax: V2 = [0, -1]) {
  const k = size * (1 - 0.5 * dim), fl = SIN(ph * 2 * PI + seed) * 0.8, fl2 = SIN(ph * 4 * PI + seed * 1.7) * 0.5;
  const u = nrm(ax), n: V2 = [-u[1], u[0]];
  const L = (x: number, y: number): V2 => [base[0] + n[0] * x + u[0] * y, base[1] + n[1] * x + u[1] * y];
  const tip = L(fl, k * 2.1);
  const outer = sh(N).D(L(0, k * 0.3), k * 0.7).P([L(-k * 0.75, k * 0.2), L(-k * 0.4 + fl2 * 0.4, k * 1.2), tip, L(k * 0.45 + fl2 * 0.4, k * 1.1), L(k * 0.75, k * 0.2)]);
  f.add(outer, FLAME, { glow: true, bias: -0.3 - dim, amp: 1, dome: 1 });
  const core = sh(N).D(L(0, k * 0.35), k * 0.38).P([L(-k * 0.3, k * 0.3), L(fl * 0.6, k * 1.35), L(k * 0.3, k * 0.3)]);
  f.add(core, FLAME, { glow: true, bias: 1.2 - dim, flat: true });
  if (dim < 0.7) { const s: V2 = [tip[0] + SIN(ph * 6 + seed) * 1.2, tip[1] - 1.5 - ((ph * 3 + seed) % 1) * 2]; f.px(s, FLAME[3], true); f.halo(s, FLAME[1]); }
}
/** хвост: пушистая дуга base → tip, светлый кончик, пламя */
function tail(f: Frame2, base: V2, ctrl: V2, tip: V2, p: FP, k: number) {
  const m = bz(sh(N), base, ctrl, tip, 2.4, 2.4, 16, 4.8).tufts(nrm([tip[0] - ctrl[0], tip[1] - ctrl[1]]), 1.2, 11 + k * 5, 2.2, 0.3);
  f.add(m, TAIL, { glow: true, grp: "tail" + k, bias: 0.1 - k * 0.1 - p.dim * 1.2, amp: 1.5, dome: 2, occ: 0.9, fur: fur([tip[0] - base[0], tip[1] - base[1]], 3 + k, 2.4, 0.7) });
  const tm = bz(sh(N), lerp(base, tip, 0.66), lerp(ctrl, tip, 0.72), tip, 3.4, 2.2);
  f.add(tm, CHEST, { glow: true, grp: "tail" + k, bias: 0.6 - p.dim * 1.5, amp: 1.2, dome: 1 });
  const td = nrm([tip[0] - ctrl[0], tip[1] - ctrl[1] - 0.6 * Math.hypot(tip[0] - ctrl[0], tip[1] - ctrl[1])]);
  flame(f, add(tip, td, 0.6), 2.0, p.fl + k * 0.31, p.dim, k * 2.3, td);
}
/** хвосты по опорным точкам (смещения от основания): кончик и изгиб, качание — поворот вокруг основания */
function tails(f: Frame2, tb: V2, T: [V2, V2][], order: number[], p: FP, sgn: number[] = [1, 1, 1]) {
  for (const k of order) {
    const a = tailAng(p, k) * sgn[k];
    const tip = rot(add(tb, T[k][0]), tb, a), ctrl = rot(add(tb, T[k][1]), tb, a * 0.6);
    tail(f, tb, ctrl, tip, p, k);
  }
}
const tailAng = (p: FP, k: number) => SIN((p.fl + k * 0.27) * 2 * PI) * 0.12 + p.tsp * (k - 1) * 0.14 + (p.tw ? SIN(p.tw * 2 * PI + k * 2.1) * 0.3 : 0);
function sparkles(f: Frame2, c: V2, p: FP, rx: number) {
  if (p.heal <= 0.02) return;
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + p.heal * 5, r = rx * (0.5 + 0.5 * ((i * 0.37 + p.heal) % 1)), y = c[1] - p.heal * 10 * ((i * 0.53) % 1) - 2;
    const q: V2 = [c[0] + COS(a) * r, y + SIN(a) * r * 0.35];
    if (((i * 0.71 + p.heal * 2) % 1) > p.heal + 0.2) continue;
    const col = i % 3 ? FLAME[3] : FLAME[4];
    f.px(q, col, true); f.halo(q, FLAME[1]);
    if (i % 2 === 0) for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as V2[]) f.px(add(q, d), FLAME[2], true);
  }
}
function eye(f: Frame2, p: V2, blink: number, w = 2) {
  if (blink > 0.5) { for (let i = 0; i < w; i++) f.px(add(p, [i, 0]), FOX[0]); return; }
  f.px(add(p, [0, -1]), FOX[0]);
  for (let i = 0; i < w; i++) { f.px(add(p, [i, 0]), i === w - 1 ? EYE2 : EYE, true); f.halo(add(p, [i, 0]), FLAME[0]); }
}

// ================= ВБОК (морда вправо) =================
function side(p: FP): Frame2 {
  const f = new Frame2(N);
  const sp: V2 = [24, 28];
  const B = (x: number, y: number): V2 => { const q = rot([x, y], sp, -p.sit * 0.36); return [q[0] + p.lean, q[1] + p.bob + p.sink * clamp((38 - y) / 11, 0, 1)]; };
  const neck = B(27, 23.5);
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), neck, p.ht); return [q[0] + p.hd[0], q[1] + p.hd[1]]; };
  const L = p.legs;
  const leg = (top: V2, paw: V2, l1: number, l2: number, pole: V2, w: [number, number, number], ramp: C[], bias: number, grp: string) => {
    const el = ik2(top, paw, l1, l2, pole);
    const m = sh(N).L(top, el, w[0], w[1]).L(el, paw, w[1], w[2]).E(add(paw, [0.7, 0.1]), 1.9, 1.05);
    f.add(m, ramp, { bias, grp, amp: 1.7, dome: 2, occ: 1.2, fur: fur([-0.2, 1], 7, 2, 0.5) });
    f.px(add(paw, [1.8, 0.4]), ramp[1]);
  };
  const pFN: V2 = [25 + L[0][0], 36.2 - L[0][1]], pFF: V2 = [22.4 + L[1][0], 36 - L[1][1]];
  const pHN: V2 = [12.2 + L[2][0], 36.2 - L[2][1]], pHF: V2 = [15 + L[3][0], 36 - L[3][1]];
  // дальние лапы
  leg(B(15.4, 27.6), pHF, 4.6, 4.9, [1, 0], [3, 2, 1.6], FOXD, -0.5, "far");
  leg(B(22.2, 27.8), pFF, 4.3, 4.6, [-1, 0], [2.8, 2, 1.6], FOXD, -0.5, "far");
  // хвосты (за телом, вверх-назад)
  // хвосты дугами: назад и вверх, крайний перекидывается над спиной
  tails(f, add(B(11.6, 24.2), [p.sit * 3.2, 0]), [[[-6.2, -10.4], [-8.2, -2.6]], [[-1.2, -13.4], [-7.4, -6.6]], [[4.8, -12.6], [-4.4, -9.8]]], [2, 1, 0], p);
  // тело: круп, бочка, грудь
  const body = sh(N).E(B(13, 25.4), 4.1, 3.9).E(B(18.5, 25.8), 6.4, 3.4 + p.br * 0.3).E(B(23.8, 25.2), 3.4, 4);
  body.tufts([-0.2, 1], 1.4, 5, 2.2, 0.5).tufts([-1, 0.1], 1.1, 9, 2.4, 0.6);
  f.add(body, FOX, { grp: "B", amp: 2.1, dome: 4, occ: 1.3, bias: -0.1, fur: fur([-0.6, 0.8], 13, 2.8) });
  // брюхо светлее
  const belly = sh(N).E(B(18.6, 28.1), 5, 1.4).tufts([0, 1], 1.2, 17, 2, 0.4);
  f.add(belly, CHEST, { grp: "B", inherit: true, bias: 0.2, fur: fur([0, 1], 19, 2, 0.5) });
  // ближние лапы
  leg(B(13, 27.6), pHN, 4.8, 5.1, [1, 0], [3.4, 2.3, 1.8], FOX, 0, "HN");
  f.add(sh(N).E(B(12.8, 26.8), 3.3, 3.5, -0.3), FOX, { grp: "HN", bias: 0, amp: 1.8, dome: 3, fur: fur([-0.4, 1], 23, 2.2) });
  leg(B(24.2, 28), pFN, 4.5, 4.7, [-1, 0], [3, 2.2, 1.8], FOX, 0.1, "FN");
  // голова: дальнее ухо, череп, жабо-щёки, морда, ближнее ухо
  const ea = -p.ear * 0.25;
  f.add(sh(N).P([Hd(26.0, 19.0), Hd(28.2, 18.2), rot(Hd(26.2, 12.2), Hd(27.0, 18.6), ea)]), FOXD, { grp: "earF", bias: 0.2, amp: 1.3, dome: 1 });
  f.add(sh(N).E(Hd(28.0, 23.2), 3.4, 3.6).tufts([-0.3, 1], 1.4, 29, 1.8, 0.3), CHEST, { glow: true, grp: "ruff", bias: 0 - p.dim, amp: 1.6, dome: 2, fur: fur([0, 1], 31, 2, 0.6) });
  const skull = sh(N).E(Hd(29.4, 19.6), 3.6, 3.1).tufts([-1, 0.6], 1.1, 37, 2, 0.4);
  f.add(skull, FOX, { grp: "H", amp: 1.8, dome: 2, bias: 0.45, fur: fur([-1, 0.3], 41, 2, 0.5) });
  const jawA = p.jaw * 0.45, hinge = Hd(31.0, 21.0);
  if (p.jaw > 0.05) f.add(sh(N).P([Hd(31.0, 20.2), Hd(35.6, 20.4), rot(Hd(34.8, 21.6), hinge, jawA)]), MOUTH, { grp: "mo", flat: true, bias: 0.5 });
  f.add(sh(N).P([Hd(30.8, 20.8), rot(Hd(34.8, 21.2), hinge, jawA), rot(Hd(30.8, 22.2), hinge, jawA)]), CHEST, { grp: "jaw", bias: 0.2, amp: 1, dome: 1 });
  const snout = sh(N).P([Hd(30.4, 18.0), Hd(33.0, 18.8), Hd(36.0, 19.9), Hd(35.8, 20.8), Hd(30.8, 21.4)]);
  f.add(snout, FOX, { grp: "M", bias: 0.55, amp: 1.6, dome: 1 });
  f.add(sh(N).E(Hd(31.4, 20.8), 1.6, 0.9), CHEST, { grp: "M", inherit: true, bias: 0.6 });
  f.px(Hd(35.8, 19.9), NOSE[0]); f.px(Hd(35.8, 19.2), NOSE[3]); f.px(Hd(35.0, 19.8), NOSE[1]);
  f.add(sh(N).P([Hd(27.4, 18.6), Hd(29.8, 17.8), rot(Hd(28.0, 11.4), Hd(28.4, 18.2), ea)]), FOX, { grp: "earN", bias: 0.5, amp: 1.5, dome: 1 });
  f.px(rot(Hd(28.5, 15.6), Hd(28.4, 18.2), ea), EAR_IN); f.px(rot(Hd(28.7, 16.8), Hd(28.4, 18.2), ea), EAR_IN2); f.px(rot(Hd(28.3, 14.2), Hd(28.4, 18.2), ea), EAR_IN);
  eye(f, Hd(31.0, 19.0), p.blink, 2);
  sparkles(f, B(20, 24), p, 12);
  return f;
}

// ================= ВНИЗ / ВВЕРХ =================
function front(p: FP): Frame2 {
  const f = new Frame2(N), cx = 20;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + p.sit * 2.2 * clamp((32 - y) / 10, -0.2, 1) * 0 + p.sink * clamp((38 - y) / 11, 0, 1)];
  const S = (x: number, y: number): V2 => { const q = B(x, y); return [q[0], q[1] + p.sit * clamp((y - 24) / 8, 0, 1) * 1.5]; };
  const Hd = (x: number, y: number): V2 => { const q = rot(B(x, y), B(cx, 26), p.ht * 0.6); return [q[0] + p.hd[0], q[1] + p.hd[1] + p.ht * 3]; };
  const L = p.legs;
  // хвосты за спиной веером
  const tb = B(cx, 26);
  // хвосты выходят из-за спины в стороны: левый, правый высокий, правый низкий
  const ts = 1 + p.tsp * 0.06;
  tails(f, tb, [[[-12 * ts, -7.4], [-10.6, 1.6]], [[8.6 * ts, -14], [11.4, -3.6]], [[12.4 * ts, -6.6], [10.4, 2]]], [1, 0, 2], p, [-1, 1, 1]);
  // задние лапы по бокам (сидя — бёдра шире и ниже)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * (5.4 + p.sit * 1.2);
    const top = S(x, 29), paw: V2 = [x + s * 0.4, 35.6 - lg[1] - lg[0] * 0.2];
    f.add(sh(N).E(add(top, [0, -0.8]), 2.8 + p.sit, 3).L(top, paw, 2.8, 2).E(paw, 1.7, 1), FOXD, { grp: "far" + s, bias: -0.3, amp: 1.5, dome: 2, fur: fur([s * 0.3, 1], 3 + s) });
  }
  // спина и бока (сверху уходят вдаль)
  const body = sh(N).E(S(cx, 26.2), 5, 3.8 + p.br * 0.3).E(S(cx, 23.8), 4, 2.8).tufts([1, 0.3], 1.1, 5, 2.4, 0.6).tufts([-1, 0.3], 1.1, 6, 2.4, 0.6);
  f.add(body, FOX, { grp: "B", amp: 1.9, dome: 4, occ: 1.3, bias: -0.5, fur: fur([0, 1], 9, 2.6) });
  // передние лапы
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[0] : L[1], x = cx + s * 2.6;
    const top = B(x, 28.6), paw: V2 = [x + s * 0.2 + p.sway * 0.5, 36.1 - lg[1] + lg[0] * 0.25];
    f.add(sh(N).L(top, paw, 2.8, 2.2).E(add(paw, [0, 0.1]), 1.8, 1.1), FOX, { grp: "F" + s, bias: s < 0 ? 0.35 : 0, amp: 1.6, dome: 2, fur: fur([0, 1], 13 + s, 2, 0.5) });
    f.px(add(paw, [-0.5, 0.6]), FOX[1]); f.px(add(paw, [0.6, 0.6]), FOX[1]);
  }
  // жабо на груди
  f.add(sh(N).E(B(cx, 28.6), 3, 3.4).tufts([0, 1], 1.6, 17, 1.8, 0.3), CHEST, { glow: true, grp: "ruff", bias: 0.1 - p.dim, amp: 1.5, dome: 2, fur: fur([0, 1], 19, 2, 0.6) });
  // голова
  const ea = p.ear * 0.25;
  for (const s of [-1, 1]) {
    const piv = Hd(cx + s * 3, 19.6);
    const pts: V2[] = [Hd(cx + s * 1.6, 19.2), Hd(cx + s * 4.4, 20.4), Hd(cx + s * 5.2, 13.2)].map((q) => rot(q, piv, s * ea)) as V2[];
    f.add(sh(N).P(pts), FOX, { grp: "ear" + s, bias: 0.45, amp: 1.5, dome: 1 });
    const inner: V2[] = [Hd(cx + s * 2.6, 19.2), Hd(cx + s * 3.9, 19.8), Hd(cx + s * 4.6, 15.0)].map((q) => rot(q, piv, s * ea)) as V2[];
    f.add(sh(N).P(inner), R("#0c1028", "#1a2348", "#2e3c68"), { grp: "earI" + s, bias: 0.2, flat: true });
  }
  const head = sh(N).E(Hd(cx, 21.0), 3.9, 3.2).E(Hd(cx, 23.0), 4.6, 2).tufts([1, 0.5], 1.2, 23, 2, 0.5).tufts([-1, 0.5], 1.2, 25, 2, 0.5);
  f.add(head, FOX, { grp: "H", amp: 1.8, dome: 3, bias: 0.4, fur: fur([0, 1], 27, 2, 0.5) });
  f.add(sh(N).E(Hd(cx - 2.6, 23.2), 1.9, 1.3).E(Hd(cx + 2.6, 23.2), 1.9, 1.3), CHEST, { grp: "H", inherit: true, bias: 0.8 });
  if (p.jaw > 0.05) f.add(sh(N).E(Hd(cx, 26.4 + p.jaw * 0.5), 1.4, 0.6 + p.jaw * 0.7), MOUTH, { grp: "mo", flat: true, bias: 0.4 });
  f.add(sh(N).E(Hd(cx, 23.8), 1.9, 1.6).E(Hd(cx, 22.2), 1.3, 1.4), FOX, { grp: "M", bias: 0.7, amp: 1.3, dome: 1 });
  f.px(Hd(cx - 0.5, 24.4), NOSE[0]); f.px(Hd(cx + 0.5, 24.4), NOSE[1]); f.px(Hd(cx - 0.5, 23.8), NOSE[3]);
  eye(f, Hd(cx - 3.2, 21.0), p.blink, 2); eye(f, Hd(cx + 1.4, 21.0), p.blink, 2);
  sparkles(f, B(cx, 24), p, 13);
  return f;
}
function back(p: FP): Frame2 {
  const f = new Frame2(N), cx = 20;
  const B = (x: number, y: number): V2 => [x + p.sway, y + p.bob + p.sink * clamp((38 - y) / 11, 0, 1)];
  const S = (x: number, y: number): V2 => { const q = B(x, y); return [q[0], q[1] + p.sit * clamp((y - 24) / 8, 0, 1) * 1.6]; };
  const Hd = (x: number, y: number): V2 => { const q = B(x, y); return [q[0] + p.hd[0], q[1] + p.hd[1] + p.ht * 2.5 - p.sit * 1.2]; };
  const L = p.legs;
  // передние лапы (дальше)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[1] : L[0], x = cx + s * 3;
    const paw: V2 = [x + p.sway * 0.4, 32.6 - lg[1] - lg[0] * 0.2];
    f.add(sh(N).L(B(x, 27), paw, 2.6, 2).E(paw, 1.6, 0.9), FOXD, { grp: "far" + s, bias: -0.3, amp: 1.4, dome: 2 });
  }
  // голова сзади: уши с тёмным краем
  const ea = p.ear * 0.25;
  for (const s of [-1, 1]) {
    const piv = Hd(cx + s * 3, 20.4);
    const pts: V2[] = [Hd(cx + s * 1.4, 20.6), Hd(cx + s * 4.4, 21.4), Hd(cx + s * 4.8, 13.8)].map((q) => rot(q, piv, s * ea)) as V2[];
    f.add(sh(N).P(pts), FOX, { grp: "ear" + s, bias: 0.4, amp: 1.5, dome: 1 });
  }
  f.add(sh(N).E(Hd(cx, 21.6), 4.1, 3.2).tufts([0, 1], 1, 5, 2.2, 0.4).tufts([1, 0.4], 1, 7, 2.2, 0.6).tufts([-1, 0.4], 1, 8, 2.2, 0.6), FOX, { grp: "H", amp: 1.7, dome: 3, bias: 0.3, fur: fur([0, 1], 9, 2) });
  // спина, круп
  const body = sh(N).E(S(cx, 26.2), 4.8, 3.4).E(S(cx, 29), 5.6, 3.8 + p.br * 0.3).tufts([1, 0.2], 1.1, 11, 2.4, 0.6).tufts([-1, 0.2], 1.1, 12, 2.4, 0.6);
  f.add(body, FOX, { grp: "B", amp: 1.9, dome: 4, occ: 1.3, bias: -0.3, fur: fur([0, 1], 15, 2.6) });
  // задние лапы (ближе)
  for (const s of [-1, 1]) {
    const lg = s < 0 ? L[2] : L[3], x = cx + s * (3.6 + p.sit * 1.2);
    const top = S(x, 30.6), paw: V2 = [x + s * 0.3 + p.sway * 0.4, 36.1 - lg[1] + lg[0] * 0.2];
    f.add(sh(N).E(add(top, [s * 0.4, -0.6]), 2.8 + p.sit * 0.8, 3.2).L(top, paw, 3, 2.2).E(paw, 1.8, 1.05).tufts([s, 0.5], 1, 17 + s, 2.4, 0.4), FOX, { grp: "H" + s, bias: 0.15, amp: 1.7, dome: 2, fur: fur([s * 0.2, 1], 19 + s) });
    if (lg[1] > 0.8) f.pxs(paw, [[-1, 0, NOSE[2]], [0, 0, NOSE[2]], [1, 0, NOSE[1]]]);
  }
  // хвосты от крупа вверх по спине, веером
  const ts = 1 + p.tsp * 0.06;
  tails(f, B(cx, 31.6), [[[-11.6 * ts, -9.6], [-11, -1]], [[2.6, -13.4], [-3.4, -7]], [[11.6 * ts, -9.6], [11, -1]]], [1, 0, 2], p, [-1, 1, 1]);
  sparkles(f, B(cx, 24), p, 13);
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: FP) { return (v === "side" ? side(p) : v === "front" ? front(p) : back(p)).resolve(); }

// ================= анимации =================
export function idle(): FP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (2 * PI * i) / 12;
    return { ...REST, bob: 0.35 * SIN(ph), br: 0.5 + 0.5 * SIN(ph), hd: [0.3 * SIN(ph * 0.5), 0.3 * SIN(ph - 0.8)] as V2, ht: 0.03 * SIN(ph - 1), ear: i === 6 || i === 7 ? 1 : 0, blink: i === 9 ? 1 : 0, fl: i / 12 };
  });
}
export function act(v: View): FP[] {
  // садится, хвосты кружат вокруг, поводит ушами, встаёт
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 3, p: { sit: 1, ht: -0.12, hd: [0, -0.4] as V2, tsp: 0.6 } },
    { f: 12, p: { sit: 1, ht: -0.12, hd: [0, -0.4] as V2, tsp: 0.6 } },
    { f: 15, p: { sit: 0, ht: 0, hd: [0, 0] as V2, tsp: 0 } },
  ], 16).map((q, i) => ({ ...q, tw: i >= 2 && i <= 13 ? (i - 2) / 6 : 0, fl: i / 8, ear: i === 8 || i === 9 ? 1 : 0, blink: i === 11 ? 1 : 0, br: 0.5 + 0.4 * SIN(i), bob: v === "side" ? 0 : 0 }));
}
export function walk(v: View): FP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12, a = (q: number): V2 => v === "side" ? [2.6 * COS(t + q), 1.8 * Math.max(0, SIN(t + q))] : [1.2 * COS(t + q), 1.7 * Math.max(0, SIN(t + q))];
    return { ...REST, legs: [a(0), a(PI), a(PI), a(0)], bob: 0.5 * COS(2 * t) - 0.2, hd: [0, 0.35 * COS(2 * t + 0.6)] as V2, sway: v === "side" ? 0 : 0.4 * SIN(t), fl: i / 12, tsp: -0.2 + 0.1 * SIN(2 * t), br: 0.4 };
  });
}
export function attack(v: View): FP[] {
  // лечит хозяина: вскидывает морду, хвосты раскрываются веером, вокруг взлетают огоньки
  void v;
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 3, p: { ht: -0.32, hd: [0, -1] as V2, tsp: 1, jaw: 0.5, heal: 0.25, bob: -0.6 } },
    { f: 6, p: { ht: -0.36, hd: [0, -1.2] as V2, tsp: 1.2, jaw: 0.8, heal: 0.8, bob: -0.8 } },
    { f: 9, p: { ht: 0, hd: [0, 0] as V2, tsp: 0, jaw: 0, heal: 1, bob: 0 } },
  ], 10).map((q, i) => ({ ...q, fl: i / 10, heal: i === 9 ? 0 : q.heal, blink: i >= 4 && i <= 6 ? 1 : 0 }));
}
export function hurt(v: View): FP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { hd: [v === "side" ? -1 : 0, -0.6] as V2, ht: -0.15, ear: 1, blink: 1, jaw: 0.4, bob: -0.5, sway: v === "side" ? 0 : 0.7, dim: 0.5 } },
    { f: 3, p: { hd: [-0.5, -0.2] as V2, ht: -0.06, ear: 1, blink: 1, jaw: 0.2, sway: -0.3, dim: 0.3 } },
    { f: 7, p: { hd: [0, 0] as V2, ht: 0, ear: 0, blink: 0, jaw: 0, bob: 0, sway: 0, dim: 0 } },
  ], 8).map((q, i) => ({ ...q, fl: i / 8 }));
}
export function death(v: View): FP[] {
  // ложится, огоньки гаснут — дух рассеивается
  void v;
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { ht: -0.15, ear: 1, jaw: 0.5, blink: 1, dim: 0.2 } },
    { f: 6, p: { sink: 5, hd: [0, 1.6] as V2, ht: 0.2, ear: 1, jaw: 0, blink: 1, dim: 0.7, tsp: -0.4 } },
    { f: 11, p: { sink: 5.5, hd: [0, 2] as V2, ht: 0.25, ear: 1, blink: 1, dim: 1, tsp: -0.5 } },
  ], 12).map((q, i) => ({ ...q, fl: i / 12 }));
}

export const pet: PetDef<FP> = {
  id: "ghost_fox", ru: "ПРИЗРАЧНЫЙ ЛИС", N, shadow: 9, fx: ["#1e3c96", "#76b8fa", "#e4f6ff"],
  act: "САДИТСЯ, ХВОСТЫ КРУЖАТ", atk: "ЛЕЧЕНИЕ ХОЗЯИНА",
  render, anims: { idle: () => idle(), act, walk, attack, hurt, death },
  icon: { view: "side" },
};
void hx;
