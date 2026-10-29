/**
 * Сокол Сольгарда (проход 4): кадр 32, летает (тело в верхней части кадра, тень отдельно), размах ~29 px.
 * Отличие от ворона — силуэт: длинные острые крылья (маховые сомкнуты в острый конец, тёмные кончики), узкий длинный хвост
 * с поперечными полосами, белое оперение с серо-голубыми тенями и пестринами, золочёный клобук с навершием, жёлтый крючковатый
 * клюв с тёмным концом, жёлтые лапы. Атака (поддержка) — «клич-метка»: взмах, крик, золотая искра у клюва (свечение).
 */
import { Frame2, shiftCv, R, add, lerp, nrm, perp, rot, sh, PI, SIN, COS, type V2, type C, hx } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 32;
const WH = R("#2e3648", "#5a6680", "#8d9ab2", "#bcc6d6", "#e2e8f0", "#fbfcff");
const WHD = R("#262c3c", "#4a5470", "#76829c", "#a2aec4", "#c8d0de", "#e6ebf2");
const DK = R("#11141c", "#20252f", "#353c4a", "#4f5868", "#6c7688");
const GOLD = R("#4a2c08", "#8a5a14", "#d09a2c", "#f4cc5c", "#fff0a8");
const BEAKY = R("#5a4a1e", "#9a8a40", "#d4c46a", "#f2e49a", "#fffbd8");
const PEST = hx("#7a88a4"), PEST2 = hx("#5a6680"), TIP = hx("#1a1c22"), PLUME = R("#5a3a0a", "#a8781c", "#e8be4c", "#fff0b0");
const SPK = R("#8a5a14", "#f0b030", "#ffe27a", "#fff8d8", "#ffffff");

export interface FP { flap: number; lag: number; bob: number; dx: number; dy: number; ht: number; hx: number; jaw: number; tail: number; legs: number; dive: number; sweep: number; spread: number; spark: number }
export const REST: FP = { flap: 20, lag: 0, bob: 0, dx: 0, dy: 0, ht: 0, hx: 0, jaw: 0, tail: 0, legs: 0, dive: 0, sweep: 0, spread: 0, spark: 0 };
const D2R = PI / 180;

/** Крыло сокола: маховые сомкнуты в острый конец (внешнее — самое длинное), тёмные кончики; кроющие с пестринами. */
function fwing(f: Frame2, S: V2, a: V2, h: V2, la: number, lh: number, c: V2, ramp: C[], bias: number, grp: string, cl: number, nSec = 4, spread = 0.11) {
  const W = add(S, a, la), T = add(W, h, lh);
  for (let i = 0; i < 5; i++) {
    const base = lerp(W, T, Math.max(0.05, 1 - i * 0.22)), fd = nrm(lerp(h, c, 0.06 + i * spread)), len = cl * (1.2 - i * 0.12);
    const tip = add(base, fd, len);
    f.add(sh(N).F(base, tip, 1.8, 0.7), ramp, { grp: grp + "p" + i, bias: bias - 0.05 - i * 0.06, amp: 1.2, dome: 1, occ: 1.1 });
    f.add(sh(N).F(add(base, fd, len * 0.62), tip, 1.4, 0.6), DK, { grp: grp + "p" + i, bias: 0.2 - i * 0.1, amp: 1, dome: 1 });
  }
  for (let i = 0; i < nSec; i++) {
    const base = lerp(S, W, 1 - i * (0.92 / nSec)), fd = nrm(lerp(c, a, -0.06 + i * 0.02)), len = cl * (0.74 - i * 0.03);
    f.add(sh(N).F(base, add(base, fd, len), 2.2, 1.5), ramp, { grp: grp + "s" + i, bias: bias - 0.1, amp: 1.2, dome: 1, occ: 0.9 });
    f.px(add(base, fd, len * 0.65), PEST);
  }
  const cov = sh(N).L(S, W, 3, 2.4).L(W, lerp(W, T, 0.5), 2.4, 1.4);
  f.add(cov, ramp, { grp: grp + "c", bias: bias + 0.45, amp: 1.6, dome: 2, occ: 0.8 });
  for (const u of [0.3, 0.7]) f.px(add(lerp(S, W, u), c, 0.7), PEST2);
  for (let i = 1; i < 4; i++) f.px(add(lerp(S, W, i / 4), c, -0.9), ramp[ramp.length - 1]);
  return { W, T };
}
function feet(f: Frame2, hip: V2, foot: V2, fwd: V2) {
  f.add(sh(N).L(hip, foot, 1.3, 1), BEAKY, { grp: "leg", bias: 0, amp: 0.8 });
  for (const d of [fwd, nrm(add(fwd, perp(fwd), 0.9)), nrm(add(fwd, perp(fwd), -0.9))]) f.px(add(foot, d, 1.2), TIP);
}
/** Золотая искра-метка: лучи креста и косого креста, белое ядро; только свечение и рисунок поверх всего. */
function spark(f: Frame2, at: V2, k: number) {
  if (k <= 0.05) return;
  const L = Math.round(1 + 2.4 * k);
  for (let q = -L; q <= L; q++) {
    const c = Math.abs(q) <= 1 ? SPK[4] : Math.abs(q) < L * 0.6 ? SPK[2] : SPK[1];
    f.px([at[0] + q, at[1]], c, true); f.px([at[0], at[1] + q], c, true);
  }
  const d = Math.round(L * 0.55);
  for (let q = 1; q <= d; q++) for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) f.px([at[0] + sx * q, at[1] + sy * q], q === 1 ? SPK[3] : SPK[1], true);
  f.halo(at, SPK[0]);
}

// ================= ВБОК (клюв вправо) =================
function side(p: FP): Frame2 {
  const f = new Frame2(N);
  const o: V2 = [p.dx + 1, p.dy + p.bob], P = (x: number, y: number): V2 => add(rot([x, y], [15, 13], p.dive * 0.35), o);
  const fi = p.flap * D2R, hi = (p.flap + p.lag) * D2R;
  const span = (ph: number, near: boolean): V2 => nrm([-0.24 - p.sweep * 0.9, -SIN(ph) + (near ? 0.55 : -0.55) * COS(ph)]);
  const fs = (ph: number) => 0.8 + 0.2 * Math.abs(SIN(ph));
  const chord = (sp: V2): V2 => { let q = perp(sp); if (q[0] > 0) q = [-q[0], -q[1]]; return nrm(lerp([-1, 0.12], q, 0.5)); };
  { const sp = span(fi, false); fwing(f, P(16.4, 11), sp, span(hi, false), 4.4 * fs(fi), 4.6 * fs(hi), chord(sp), WHD, -0.3, "fw", 5, 3, 0.12 + p.spread * 0.08); }
  // хвост: длинный, узкий, полосатый
  const tb = P(10.2, 14);
  for (let i = 0; i < 3; i++) {
    const tip = add(P(4 + i * 0.4, 14.6 + i * 0.9 + p.tail * (i - 1) * 0.3), [0, p.tail * 0.8]);
    f.add(sh(N).F(tb, tip, 2.2, 1.7), i === 1 ? WH : WHD, { grp: "t" + i, bias: 0.1 - i * 0.15, amp: 1.2, dome: 1, occ: 0.8 });
    if (i === 1) for (const u of [0.35, 0.6, 0.85]) { const q = lerp(tb, tip, u); f.px(q, PEST2); f.px(add(q, [0, 1]), PEST2); }
  }
  const hip = P(14, 15.6), foot = lerp(P(12.4, 17.8), P(17.6, 19.4), p.legs);
  feet(f, hip, foot, nrm(lerp([-1, 0.2], [1, 0.4], p.legs)));
  // тело: стройное, грудь в пестринах
  f.add(sh(N).E(P(14.6, 13.4), 5.8, 3, -0.1).E(P(18.2, 12.2), 2.6, 2.3).tufts([0, 1], 0.8, 3, 2.6, 0.5), WH, { grp: "B", amp: 1.8, dome: 3, bias: 0.1, scales: { k: 0.5, s: 3 } });
  for (const [x, y] of [[17.4, 14.2], [15.6, 15.2], [18.6, 13.4], [13.8, 15.4], [16.6, 13.2]] as V2[]) f.px(P(x, y), PEST);
  // голова, клобук, клюв
  const hc = P(20.4, 10.6), Hd = (x: number, y: number): V2 => rot(P(x, y), hc, p.ht);
  f.add(sh(N).D(Hd(20.4, 10.8), 2.8).E(Hd(19, 12.4), 2.2, 1.8), WH, { grp: "H", amp: 1.8, dome: 2, bias: 0.35 });
  // «усы» сокола — тёмная полоска под глазом
  f.px(Hd(21.4, 12), PEST2); f.px(Hd(21.2, 13), PEST2);
  const hood = sh(N).D(Hd(20.2, 10), 3).and(sh(N).P([Hd(15, 4), Hd(26, 4), Hd(24, 10.4), Hd(22.4, 11), Hd(17, 11.8)]));
  f.add(hood, GOLD, { grp: "hood", amp: 1.8, dome: 2, bias: 0.2, occ: 1 });
  f.add(sh(N).D(Hd(19.8, 7.2), 0.9).L(Hd(19.6, 7.4), Hd(18.4, 6.4), 0.8, 0.5), PLUME, { grp: "plume", bias: 0.4, amp: 1.2 });
  for (const x of [18, 19.2, 20.4, 21.6]) f.px(Hd(x, 11.6 - (x - 18) * 0.15), GOLD[0]);
  f.px(Hd(21.6, 8.4), GOLD[4]); f.px(Hd(22.6, 9.6), GOLD[1]);
  const hinge = Hd(22.6, 11.6);
  const low = [Hd(22.4, 11.4), Hd(24.6, 12.2), Hd(22.6, 12.8)].map((q) => rot(q, hinge, p.jaw * 0.6)) as V2[];
  if (p.jaw > 0.05) f.add(sh(N).P([Hd(22.4, 11.4), Hd(24.6, 11.6), low[1]]), R("#2a0808", "#5a1414", "#8a2a24"), { grp: "mo", flat: true, bias: -0.5 });
  f.add(sh(N).P(low), BEAKY, { grp: "bl", bias: -0.4, amp: 1 });
  f.add(sh(N).P([Hd(22.2, 10.2), Hd(24.2, 10.6), Hd(25.4, 11.8), Hd(24.9, 13.1), Hd(24.2, 12), Hd(22.4, 11.8)]), BEAKY, { grp: "bu", amp: 1.6, dome: 1, bias: 0.4 });
  f.px(Hd(24.8, 12.6), TIP); f.px(Hd(23, 10.6), BEAKY[4]);
  { const sp = span(fi, true); fwing(f, P(14.6, 11.4), sp, span(hi, true), 4.6 * fs(fi), 4.8 * fs(hi), chord(sp), WH, 0.05, "nw", 5.4, 4, 0.12 + p.spread * 0.08); }
  spark(f, add(Hd(25.6, 10.6), [0, -2.4 * p.spark]), p.spark);
  return f;
}

// ================= ВНИЗ / ВВЕРХ =================
function frontBack(p: FP, back: boolean): Frame2 {
  const f = new Frame2(N), cx = 16;
  const o: V2 = [p.dx, p.dy + p.bob], P = (x: number, y: number): V2 => add([x, y], o);
  const fi = p.flap * D2R, hi = (p.flap + p.lag) * D2R;
  const wings = () => {
    for (const s of [-1, 1]) {
      const a: V2 = [s * COS(fi) * (1 - p.sweep * 0.3), -SIN(fi) + p.sweep * 0.4], h: V2 = [s * COS(hi) * (1 - p.sweep * 0.4), -SIN(hi) + p.sweep * 0.6 + 0.12];
      const an = nrm(a), hn = nrm(h);
      let c = perp(an); if (c[1] < 0) c = [-c[0], -c[1]];
      c = nrm(lerp(c, [0, 1], 0.35));
      fwing(f, P(cx + s * 2.2, 12.2), an, hn, 3.7, 4.0, c, WH, back ? 0.05 : -0.15, "w" + s, 3.4, 4, 0.11 + p.spread * 0.08);
    }
  };
  const hc = P(cx + p.hx, 9.2), Hd = (x: number, y: number): V2 => rot(P(x + p.hx, y), hc, p.ht);
  if (!back) {
    for (let i = 0; i < 3; i++) { const tip = P(cx + (i - 1) * 1.8 + p.tail * 0.5, 22.4 - Math.abs(i - 1) * 0.6); f.add(sh(N).F(P(cx, 16.5), tip, 2, 1.5), WHD, { grp: "t" + i, amp: 1, occ: 0.6 }); f.px(add(tip, [0, -1.2]), PEST2); }
    wings();
    for (const s of [-1, 1]) feet(f, P(cx + s * 1.4, 17), P(cx + s * 1.6, 19.2 + p.legs * 1.6), [s * 0.3, 1]);
    f.add(sh(N).E(P(cx, 14.2), 3.4, 4.6).tufts([0, 1], 0.9, 5, 2.4, 0.5), WH, { grp: "B", amp: 1.7, dome: 3, bias: 0.2 });
    for (const [x, y] of [[-1.6, 14.4], [1.4, 14.2], [0, 15.8], [-1.2, 17], [1.6, 16.6], [-2.2, 16], [0.2, 13.4]] as V2[]) f.px(P(cx + x, y), PEST);
    f.add(sh(N).D(Hd(cx, 9.2), 3).E(Hd(cx, 11.2), 2.4, 1.6), WH, { grp: "H", amp: 1.8, dome: 2, bias: 0.35 });
    // клобук: закрывает темя и глаза, навершие-перо
    const hood = sh(N).D(Hd(cx, 8.6), 3.3).and(sh(N).P([Hd(cx - 6, 3), Hd(cx + 6, 3), Hd(cx + 3.6, 10), Hd(cx, 9.4), Hd(cx - 3.6, 10)]));
    f.add(hood, GOLD, { grp: "hood", amp: 1.8, dome: 2, bias: 0.2, occ: 1 });
    f.add(sh(N).D(Hd(cx, 5.6), 0.9).L(Hd(cx, 5.4), Hd(cx + 0.6, 4.2), 0.7, 0.5), PLUME, { grp: "plume", bias: 0.4 });
    for (let x = -3; x <= 3; x++) f.px(Hd(cx + x, 9.8 + Math.abs(x) * 0.15), GOLD[0]);
    f.px(Hd(cx - 1.6, 7.2), GOLD[4]); f.px(Hd(cx - 0.6, 6.6), GOLD[4]); f.px(Hd(cx - 2.4, 9.4), GOLD[1]); f.px(Hd(cx + 1.8, 9.4), GOLD[1]);
    for (const s of [-1, 1]) f.px(Hd(cx + s * 2.2 - (s > 0 ? 0 : 1), 11.2), PEST2);
    const jo = p.jaw * 1.2;
    if (p.jaw > 0.05) f.add(sh(N).P([Hd(cx - 1, 11.4), Hd(cx + 1, 11.4), Hd(cx, 13 + jo)]), R("#2a0808", "#5a1414", "#8a2a24"), { grp: "mo", flat: true, bias: -0.5 });
    f.add(sh(N).P([Hd(cx - 1.4, 10.2), Hd(cx + 1.4, 10.2), Hd(cx + 0.8, 12.2), Hd(cx, 13.4), Hd(cx - 0.8, 12.2)]), BEAKY, { grp: "bu", amp: 1.6, dome: 1, bias: 0.3 });
    f.px(Hd(cx - 1, 10.6), BEAKY[4]); f.px(Hd(cx, 13), TIP);
    spark(f, add(Hd(cx, 14.8), [0, 0.6 * p.spark]), p.spark);
  } else {
    for (const s of [-1, 1]) feet(f, P(cx + s * 1.4, 16.4), P(cx + s * 1.6, 18.4 + p.legs * 1.6), [s * 0.3, 1]);
    f.add(sh(N).D(Hd(cx, 9.4), 2.8), WH, { grp: "H", amp: 1.6, dome: 2, bias: 0.3 });
    const hood = sh(N).D(Hd(cx, 9), 3.1).and(sh(N).P([Hd(cx - 6, 3), Hd(cx + 6, 3), Hd(cx + 6, 10.4), Hd(cx - 6, 10.4)]));
    f.add(hood, GOLD, { grp: "hood", amp: 1.8, dome: 2, bias: 0.1 });
    f.add(sh(N).D(Hd(cx, 6), 0.9), PLUME, { grp: "plume", bias: 0.3 });
    // завязки клобука
    f.add(sh(N).L(Hd(cx - 0.6, 10.6), Hd(cx - 1.4, 13), 0.9).L(Hd(cx + 0.6, 10.6), Hd(cx + 1.4, 13), 0.9), GOLD, { grp: "tie", bias: -0.6, amp: 0.8 });
    f.add(sh(N).E(P(cx, 14), 3.6, 4.6), WH, { grp: "B", amp: 1.7, dome: 3, bias: 0, scales: { k: 0.8, s: 3 } });
    wings();
    for (let i = 0; i < 5; i++) {
      const tip = P(cx + (i - 2) * 1.2 + p.tail * 0.6, 24 - Math.abs(i - 2) * 0.7);
      f.add(sh(N).F(P(cx, 17), tip, 2, 1.5), WH, { grp: "t" + i, amp: 1.2, occ: 0.7, bias: 0.1 - Math.abs(i - 2) * 0.12 });
      if (i === 2) for (const u of [0.45, 0.7, 0.92]) f.px(lerp(P(cx, 17), tip, u), PEST2);
    }
  }
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: FP) { const r = (v === "side" ? side(p) : frontBack(p, v === "back")).resolve(); return { img: shiftCv(r.img, 0, 2), emis: shiftCv(r.emis, 0, 2) }; }

export function walk(v: View): FP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12;
    return { ...REST, flap: (v === "side" ? 16 : 14) + (v === "side" ? 46 : 38) * COS(t), lag: -24 * SIN(t), bob: -1.1 * SIN(t), tail: 0.4 * SIN(t + 1) };
  });
}
export function idle(v: View): FP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12;
    return { ...REST, flap: (v === "side" ? 16 : 12) + (v === "side" ? 38 : 28) * COS(t), lag: -16 * SIN(t), bob: -0.8 * SIN(t) + 0.3, ht: i >= 6 && i <= 8 ? -0.1 : 0.03 * SIN(t), tail: 0.5 * SIN(t * 2) };
  });
}
export function act(v: View): FP[] {
  // расправляет крылья (парит, маховые веером), оглядывается влево-вправо, складывает и снова машет
  const look = v === "side" ? [0, -0.25, -0.25, 0.2, 0.2, 0] : [0, -1.4, -1.4, 1.4, 1.4, 0];
  const fr = keyed(REST, [
    { f: 0, p: {} },
    { f: 3, p: { flap: 4, lag: 4, spread: 1, bob: -0.6, tail: 0.6 } },
    { f: 12, p: { flap: 2, lag: 2, spread: 1, bob: 0.4, tail: -0.4 } },
    { f: 15, p: { flap: 20, lag: 0, spread: 0, bob: 0, tail: 0 } },
  ], 16);
  return fr.map((q, i) => {
    const k = Math.min(5, Math.floor(i / 2.6)), hv = look[k];
    return v === "side" ? { ...q, ht: hv } : { ...q, hx: hv * 0.6, ht: hv * 0.08 * (v === "back" ? -1 : 1) };
  });
}
export function attack(v: View): FP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { flap: 66, lag: 12, dy: -1.5, ht: v === "side" ? -0.15 : 0, jaw: 0.2 } },
    { f: 3, p: { flap: 72, lag: 16, dy: -2, ht: v === "side" ? -0.25 : 0, jaw: 0.6, spark: 0.3 } },
    { f: 5, p: { flap: -8, lag: -22, dy: 0.5, ht: v === "side" ? -0.3 : 0, jaw: 1, spark: 1, tail: 0.8 } },
    { f: 6, p: { flap: -4, lag: -14, dy: 0.5, jaw: 1, spark: 0.85 } },
    { f: 8, p: { flap: 34, lag: 0, dy: 0, ht: 0, jaw: 0.3, spark: 0.3, tail: 0 } },
    { f: 9, p: { flap: 20, lag: 0, jaw: 0, spark: 0 } },
  ], 10);
}
export function hurt(v: View): FP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { flap: 62, lag: 20, dy: -1, dx: v === "side" ? -1 : 0, ht: v === "side" ? -0.3 : 0, hx: v === "side" ? 0 : -0.8, jaw: 0.6, tail: 1 } },
    { f: 3, p: { flap: 40, lag: -10, dy: -0.5, dx: 0, ht: -0.1, hx: 0, jaw: 0.2, tail: -0.5 } },
    { f: 7, p: { flap: 20, lag: 0, dy: 0, dx: 0, ht: 0, jaw: 0, tail: 0 } },
  ], 8);
}
export function death(v: View): FP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { flap: 80, lag: 30, dy: -1.5, ht: v === "side" ? -0.3 : 0, jaw: 0.8 } },
    { f: 5, p: { flap: 55, lag: 20, sweep: 0.7, dy: v === "side" ? 4 : 2.5, dive: v === "side" ? 0.8 : 0, ht: v === "side" ? 0.3 : 0, jaw: 0.4, legs: 0.6 } },
    { f: 8, p: { flap: 35, lag: 10, sweep: 1, dy: v === "side" ? 8 : 3.6, dive: v === "side" ? 1.2 : 0, ht: v === "side" ? 0.5 : 0, jaw: 0.2, legs: 1 } },
    { f: 11, p: { flap: 30, lag: 10, sweep: 1, dy: v === "side" ? 8.5 : 4, dive: v === "side" ? 1.3 : 0, ht: v === "side" ? 0.5 : 0, jaw: 0, legs: 1 } },
  ], 12);
}

export const pet: PetDef<FP> = {
  id: "sol_falcon", ru: "СОКОЛ СОЛЬГАРДА", N, fly: true, shadow: 5, fx: ["#6a4210", "#e0a630", "#fff2b0"],
  act: "РАСПРАВЛЯЕТ КРЫЛЬЯ, ОГЛЯДЫВАЕТСЯ", atk: "КЛИЧ-МЕТКА",
  render, anims: { idle, act, walk, attack, hurt, death },
  icon: { view: "front", zoom: 2, focus: [16, 15] },
};
