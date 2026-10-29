/**
 * Боевой ворон (пилот прохода 4): кадр 32, летит (тело ~на 14–17 px над землёй, тень — отдельно, у клиента), размах крыльев до 30 px.
 * Крыло — скелет плечо → запястье → кончик по углу взмаха; маховые (5 «пальцев» с прорезями), второстепенные маховые с волнистой
 * кромкой, кроющие перья рядами со светлой кромкой; каждое перо — своя часть (задние темнеют у края передних). Тело в перьях
 * рядами, взъерошенное горло, тяжёлый клюв с бликом по коньку, глаз с бликом, кожаный нагрудник с заклёпками и ремнём, когти.
 */
import { Frame2, shiftCv, R, add, clamp, dir, lerp, nrm, perp, rot, sh, streak, PI, SIN, COS, type V2, type C, hx, flipCv } from "./lib";
import { keyed } from "./anim";
import type { PetDef } from "./build";

export const N = 32;
const FEA = R("#07070c", "#10111b", "#1c1e2e", "#2d3248", "#474f6e", "#6f7ca2");
const FEAD = R("#050509", "#0b0c14", "#141625", "#212539", "#343b56", "#515c7e");
const BEAK = R("#0a0a0d", "#1b1b21", "#32333b", "#555862", "#8c909c");
const LEATH = R("#1c0e07", "#38200f", "#5a3517", "#7f5128", "#a5763c");
const STRAP = R("#140a06", "#28160b", "#3e2412", "#56341c");
const TAL = R("#0e0e12", "#24242c", "#45454f", "#727280");
const BRASS = hx("#e8bc64"), BRASS2 = hx("#8a5a20"), EYE = hx("#e09a38"), EYED = hx("#120806"), STITCH = hx("#b08850");

export interface RP { flap: number; lag: number; bob: number; dx: number; dy: number; ht: number; jaw: number; tail: number; legs: number; blink: number; dive: number; sweep: number }
export const REST: RP = { flap: 20, lag: 0, bob: 0, dx: 0, dy: 0, ht: 0, jaw: 0, tail: 0, legs: 0, blink: 0, dive: 0, sweep: 0 };
const D2R = PI / 180;

/** Крыло: S — плечо, a/h — направления плеча и кисти, c — хорда (куда смотрят перья), ramp, grp. */
export function wing(f: Frame2, S: V2, a: V2, h: V2, la: number, lh: number, c: V2, ramp: C[], bias: number, grp: string, cl: number, nSec = 5, spread = 0.2) {
  const W = add(S, a, la), T = add(W, h, lh);
  // маховые: 5 пальцев, внешние первыми
  for (let i = 0; i < 5; i++) {
    const u = 1 - i * 0.2, base = lerp(W, T, Math.max(0.05, u));
    const fd = nrm(lerp(h, c, 0.1 + i * spread)), len = cl * (1.1 - i * 0.07);
    f.add(sh(N).F(base, add(base, fd, len), 1.7, 0.6), ramp, { grp: grp + "p" + i, bias: bias - i * 0.08, amp: 1.2, dome: 1, occ: 1.2 });
    if (i < 4) f.px(add(base, fd, len * 0.45), ramp[ramp.length - 2]);
  }
  // второстепенные: волнистая кромка
  for (let i = 0; i < nSec; i++) {
    const base = lerp(S, W, 1 - i * (0.9 / nSec)), fd = nrm(lerp(c, a, -0.08 + i * 0.03)), len = cl * (0.86 - i * 0.03);
    f.add(sh(N).F(base, add(base, fd, len), nSec < 5 ? 2.1 : 2.5, nSec < 5 ? 1.3 : 1.7), ramp, { grp: grp + "s" + i, bias: bias - 0.15, amp: 1.2, dome: 1, occ: 0.9 });
  }
  // кроющие: полоса вдоль передней кромки, светлее, ряд мелких перьев
  const cov = sh(N).L(S, W, 3.4, 2.8).L(W, lerp(W, T, 0.55), 2.8, 1.6);
  for (let i = 0; i < 4; i++) cov.D(add(lerp(S, W, 0.15 + i * 0.25), c, 1.6), 1.2);
  f.add(cov, ramp, { grp: grp + "c", bias: bias + 0.45, amp: 1.6, dome: 2, occ: 0.8 });
  // блик по передней кромке
  for (let i = 1; i < 4; i++) f.px(add(lerp(S, W, i / 4), c, -1.0), ramp[ramp.length - 1]);
  return { W, T };
}
function talons(f: Frame2, hip: V2, foot: V2, fwd: V2) {
  f.add(sh(N).L(hip, foot, 1.3, 1), TAL, { grp: "leg", bias: 0.2, amp: 0.8 });
  for (const d of [fwd, nrm(add(fwd, perp(fwd), 0.9)), nrm(add(fwd, perp(fwd), -0.9))]) f.px(add(foot, d, 1.2), TAL[3]);
}

// ================= ВБОК (клюв вправо) =================
function side(p: RP): Frame2 {
  const f = new Frame2(N);
  const o: V2 = [p.dx, p.dy + p.bob], P = (x: number, y: number): V2 => add(rot([x, y], [15, 13], p.dive * 0.35), o);
  const fi = p.flap * D2R, hi = (p.flap + p.lag) * D2R;
  const raw = (ph: number, near: boolean): V2 => [-0.28 - p.sweep * 0.9, -SIN(ph) + (near ? 0.55 : -0.55) * COS(ph)];
  const span = (ph: number, near: boolean): V2 => nrm(raw(ph, near));
  /** ракурс: крыло ребром к зрителю короче — не вытягивается назад горизонтальной лопастью */
  const fsN = (ph: number, near: boolean) => Math.max(0.6, Math.min(1, Math.hypot(...raw(ph, near))));
  const fs = (ph: number) => 0.8 + 0.2 * Math.abs(SIN(ph));
  /** хорда вбок: назад, но поворачивается вместе с крылом — на взмахе вверх перья веером назад-вверх, не слипаются */
  const chord = (sp: V2): V2 => { let q = perp(sp); if (q[0] > 0) q = [-q[0], -q[1]]; return nrm(lerp([-1, 0.15], q, 0.55)); };
  // дальнее крыло (корень чуть впереди: на взмахе вверх его маховые видны перед ближним)
  { const sp = span(fi, false); wing(f, P(16.6, 11), sp, span(hi, false), 4.6 * fs(fi) * fsN(fi, false), 4.2 * fs(hi) * fsN(hi, false), chord(sp), FEAD, -0.2, "fw", 5.2, 3, 0.24); }
  // хвост клином
  const tb = P(10.4, 14.2);
  for (let i = 0; i < 3; i++) f.add(sh(N).F(tb, add(P(3.8 + i * 0.3, 15.2 + i * 1.1 + p.tail * (i - 1) * 0.3), [0, p.tail]), 2.6, 1.6), i === 1 ? FEA : FEAD, { grp: "t" + i, bias: 0.1 - i * 0.1, amp: 1.2, dome: 1, occ: 0.8 });
  // лапы: поджаты или вперёд когтями (атака)
  const hip = P(14, 16), foot = lerp(P(12.6, 18.2), P(17.6, 19.6), p.legs);
  talons(f, hip, foot, nrm(lerp([-1, 0.2], [1, 0.4], p.legs)));
  // тело в перьях рядами
  f.add(sh(N).E(P(14.6, 13.6), 5.6, 3.5, -0.1).E(P(18.4, 12.2), 2.8, 2.4).tufts([0, 1], 1.0, 3, 2.4, 0.5), FEA, { grp: "B", amp: 1.8, dome: 3, scales: { k: 0.7, s: 3 } });
  // нагрудник и ремень
  f.add(sh(N).P([P(16.2, 11.8), P(19.4, 12), P(20, 15), P(17.6, 16.9), P(14.8, 16.6), P(15.2, 13.6)]), LEATH, { grp: "pl", amp: 1.6, dome: 2, bias: 0.2, occ: 1 });
  f.add(sh(N).L(P(13.4, 10.8), P(16.4, 12.6), 1.3), STRAP, { grp: "st", bias: 0.3 });
  f.px(P(18.6, 13), BRASS); f.px(P(18.6, 14), BRASS2); f.px(P(16.6, 15.3), BRASS);
  for (let i = 0; i < 3; i++) f.px(P(17.4 + i * 0.8, 12.7 + i * 1.2), STITCH);
  // голова: шея, затылок, взъерошенное горло
  const hc = P(20.6, 10.6), Hd = (x: number, y: number): V2 => rot(P(x, y), hc, p.ht);
  f.add(sh(N).D(Hd(20.6, 10.6), 3.1).E(Hd(19.2, 12.6), 2.4, 2).tufts([-0.2, 1], 1.4, 7, 1.6, 0.3).tufts([-1, -0.3], 1.0, 9, 2, 0.5), FEA, { grp: "H", amp: 1.8, dome: 2, bias: 0.35 });
  // клюв: верхняя челюсть, нижняя открывается
  const hinge = Hd(22.6, 12);
  const low = [Hd(22.6, 11.6), Hd(26.4, 11.9), Hd(22.6, 13)].map((q) => rot(q, hinge, p.jaw * 0.5)) as V2[];
  if (p.jaw > 0.05) f.add(sh(N).P([Hd(22.6, 11.6), Hd(26, 11.6), low[1]]), R("#2a0808", "#5a1414", "#8a2a24"), { grp: "mo", flat: true, bias: -0.5 });
  f.add(sh(N).P(low), BEAK, { grp: "bl", bias: -0.3, amp: 1 });
  f.add(sh(N).P([Hd(22.4, 9.4), Hd(25, 10.1), Hd(27.2, 11.4), Hd(26.4, 12), Hd(22.6, 11.9)]), BEAK, { grp: "bu", amp: 1.6, dome: 1, bias: 0.3 });
  for (let i = 0; i < 3; i++) f.px(Hd(23 + i * 1.1, 9.9 + i * 0.45), BEAK[4]);
  f.px(Hd(22.2, 10.6), FEA[4]);
  // глаз
  const e = Hd(21.2, 9.8);
  if (p.blink > 0.5) f.px(e, FEA[3]); else { f.px(e, EYE); f.px(add(e, [-1, 0]), EYED); f.px(add(e, [0, -1]), FEA[0]); }
  // ближнее крыло
  { const sp = span(fi, true); wing(f, P(14.6, 11.6), sp, span(hi, true), 4.8 * fs(fi) * fsN(fi, true), 4.4 * fs(hi) * fsN(hi, true), chord(sp), FEA, 0.1, "nw", 5.6, 4, 0.24); }
  return f;
}

// ================= ВНИЗ / ВВЕРХ (крылья в стороны) =================
function frontBack(p: RP, back: boolean): Frame2 {
  const f = new Frame2(N), cx = 16;
  const o: V2 = [p.dx, p.dy + p.bob], P = (x: number, y: number): V2 => add([x, y], o);
  const fi = p.flap * D2R, hi = (p.flap + p.lag) * D2R;
  const wings = () => {
    for (const s of [-1, 1]) {
      const a: V2 = [s * COS(fi) * (1 - p.sweep * 0.3), -SIN(fi) + p.sweep * 0.4], h: V2 = [s * COS(hi) * (1 - p.sweep * 0.4), -SIN(hi) + p.sweep * 0.6];
      const an = nrm(a), hn = nrm(h);
      let c = perp(an); if (c[1] < 0) c = [-c[0], -c[1]];
      c = nrm(lerp(c, [0, 1], 0.4));
      const S = P(cx + s * 2.3, 12.2);
      wing(f, S, an, hn, 4.1, 3.6, c, FEA, back ? 0.15 : -0.05, "w" + s, 3.9);
    }
  };
  if (!back) {
    // хвост позади, видны кончики
    for (let i = 0; i < 3; i++) f.add(sh(N).F(P(cx, 16), P(cx + (i - 1) * 2.2 + p.tail * 0.5, 21.4 - Math.abs(i - 1) * 0.5), 2.2, 1.6), FEAD, { grp: "t" + i, amp: 1, occ: 0.6 });
    wings();
    // лапы
    for (const s of [-1, 1]) talons(f, P(cx + s * 1.5, 17.2), P(cx + s * 1.7, 19.4 + p.legs * 1.6), [s * 0.3, 1]);
    f.add(sh(N).E(P(cx, 14.2), 3.9, 4.6).tufts([0, 1], 1, 5, 2.4, 0.5), FEA, { grp: "B", amp: 1.7, dome: 3, scales: { k: 0.6, s: 3 } });
    // нагрудник: щиток с заклёпками и ремни к плечам
    for (const s of [-1, 1]) f.add(sh(N).L(P(cx + s * 3.2, 11), P(cx + s * 1.8, 13.2), 1.2), STRAP, { grp: "st" + s, bias: 0.3 });
    f.add(sh(N).P([P(cx - 2.8, 12.8), P(cx + 2.8, 12.8), P(cx + 3, 15.8), P(cx, 18.2), P(cx - 3, 15.8)]), LEATH, { grp: "pl", amp: 1.6, dome: 2, bias: -0.1, occ: 1 });
    f.px(P(cx - 2, 13.6), BRASS2); f.px(P(cx + 1.6, 13.6), BRASS2);
    for (let y = 14; y < 17; y++) f.px(P(cx, y), y % 2 ? STITCH : LEATH[1]);
    // голова: горло взъерошено
    const hc = P(cx, 9.4), Hd = (x: number, y: number): V2 => rot(P(x, y), hc, p.ht);
    f.add(sh(N).D(Hd(cx, 9.2), 3.4).E(Hd(cx, 11.4), 2.8, 1.9).tufts([0, 1], 1.4, 11, 1.6, 0.3).tufts([-1, 0], 0.8, 3, 2, 0.6).tufts([1, 0], 0.8, 4, 2, 0.6), FEA, { grp: "H", amp: 1.8, dome: 2, bias: 0.35 });
    const jo = p.jaw * 1.4;
    if (p.jaw > 0.05) f.add(sh(N).P([Hd(cx - 1.2, 11.6), Hd(cx + 1.2, 11.6), Hd(cx, 13.6 + jo)]), R("#2a0808", "#5a1414", "#8a2a24"), { grp: "mo", flat: true, bias: -0.5 });
    f.add(sh(N).P([Hd(cx - 1.9, 10.2), Hd(cx + 1.9, 10.2), Hd(cx + 1, 13.4), Hd(cx, 15.2), Hd(cx - 1, 13.4)]), BEAK, { grp: "bu", amp: 1.6, dome: 1, bias: 0.3 });
    f.px(Hd(cx - 1, 11), BEAK[4]); f.px(Hd(cx - 1, 12), BEAK[3]); f.px(Hd(cx, 13), BEAK[3]); f.px(Hd(cx - 1, 10.6), FEA[4]); f.px(Hd(cx + 1, 10.6), FEA[4]);
    for (const s of [-1, 1]) { const e = Hd(cx + s * 2 - (s > 0 ? 0 : 1), 8.8); if (p.blink > 0.5) f.px(e, FEA[3]); else { f.px(e, EYE); f.px(add(e, [s, 0]), EYED); } }
  } else {
    for (const s of [-1, 1]) talons(f, P(cx + s * 1.5, 16.6), P(cx + s * 1.7, 18.6 + p.legs * 1.6), [s * 0.3, 1]);
    f.add(sh(N).D(P(cx, 9.6), 3).tufts([0, -1], 0.8, 7, 2, 0.5), FEA, { grp: "H", amp: 1.6, dome: 2, bias: 0.3 });
    f.px(P(cx + 2.6, 10.2), BEAK[2]); f.px(P(cx + 3.2, 10.6), BEAK[1]);
    f.add(sh(N).E(P(cx, 14), 4, 4.6), FEA, { grp: "B", amp: 1.7, dome: 3, scales: { k: 0.7, s: 3 } });
    // ремни крест-накрест на спине
    f.add(sh(N).L(P(cx - 3, 11.6), P(cx + 2.6, 16.4), 1.2).L(P(cx + 3, 11.6), P(cx - 2.6, 16.4), 1.2), STRAP, { grp: "st", bias: 0.4 });
    f.px(P(cx, 14), BRASS); f.px(P(cx, 15), BRASS2);
    wings();
    // хвост к зрителю (ниже тела), веер
    for (let i = 0; i < 5; i++) f.add(sh(N).F(P(cx, 17), P(cx + (i - 2) * 1.6 + p.tail * 0.6, 23.4 - Math.abs(i - 2) * 0.6), 2.2, 1.6), FEA, { grp: "t" + i, amp: 1.2, occ: 0.7, bias: 0.1 - Math.abs(i - 2) * 0.1 });
  }
  return f;
}

export type View = "front" | "back" | "side";
export function render(v: View, p: RP) { const r = (v === "side" ? side(p) : frontBack(p, v === "back")).resolve(); return { img: shiftCv(r.img, 0, 2), emis: shiftCv(r.emis, 0, 2) }; }
void flipCv; void dir; void clamp;

export function walk(v: View): RP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12;
    return { ...REST, flap: (v === "side" ? 18 : 16) + (v === "side" ? 48 : 40) * COS(t), lag: -22 * SIN(t), bob: -1.1 * SIN(t), tail: 0.5 * SIN(t + 1) };
  });
}
export function idle(v: View): RP[] {
  return Array.from({ length: 12 }, (_, i) => {
    const t = (2 * PI * i) / 12;
    return { ...REST, flap: (v === "side" ? 18 : 14) + (v === "side" ? 40 : 30) * COS(t), lag: -16 * SIN(t), bob: -0.8 * SIN(t) + 0.3, ht: i >= 6 && i <= 8 ? -0.12 : 0.03 * SIN(t), tail: 0.6 * SIN(t * 2), blink: i === 9 ? 1 : 0, jaw: i === 7 ? 0.6 : 0 };
  });
}
export function act(v: View): RP[] {
  // парит, клювом чистит перья под крылом, затем каркает
  return Array.from({ length: 16 }, (_, i) => {
    const t = (2 * PI * i) / 8, preen = i >= 3 && i <= 8, caw = i >= 10 && i <= 13;
    return { ...REST, flap: (v === "side" ? 18 : 14) + 34 * COS(t), lag: -16 * SIN(t), bob: -0.8 * SIN(t) + 0.3,
      ht: preen ? (v === "side" ? 0.6 : 0.45) * SIN(((i - 3) / 5) * PI) * (v === "back" ? -1 : 1) : caw ? -0.22 : 0,
      jaw: preen ? (i % 2 ? 0.3 : 0) : caw ? (i === 11 || i === 13 ? 1 : 0.4) : 0, blink: i === 6 ? 1 : 0, tail: caw ? 0.8 * SIN(i * 2) : 0.4 * SIN(t) };
  });
}
export function hurt(v: View): RP[] {
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 1, p: { flap: 62, lag: 20, dy: -1, dx: v === "side" ? -1 : 0, ht: -0.3, blink: 1, jaw: 0.6, tail: 1 } },
    { f: 3, p: { flap: 40, lag: -10, dy: -0.5, dx: 0, ht: -0.1, blink: 1, jaw: 0.2, tail: -0.5 } },
    { f: 7, p: { flap: 20, lag: 0, dy: 0, dx: 0, ht: 0, blink: 0, jaw: 0, tail: 0 } },
  ], 8);
}
export function death(v: View): RP[] {
  // крылья подламываются, ворон падает к земле клювом вниз
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { flap: 80, lag: 30, dy: -1.5, ht: -0.3, jaw: 0.8, blink: 1 } },
    { f: 5, p: { flap: 66, lag: 4, sweep: 0.7, dy: 3, dive: v === "side" ? 0.8 : 0, ht: 0.3, jaw: 0.4, blink: 1, legs: 0.6 } },
    { f: 8, p: { flap: 66, lag: 4, sweep: 1, dy: 4.5, dive: v === "side" ? 1.2 : 0, ht: 0.5, jaw: 0.2, blink: 1, legs: 1 } },
    { f: 11, p: { flap: 64, lag: 4, sweep: 1, dy: 5, dive: v === "side" ? 1.3 : 0, ht: 0.5, jaw: 0, blink: 1, legs: 1 } },
  ], 12);
}
export function attack(v: View): RP[] {
  const dv: V2 = v === "side" ? [3.4, 4] : v === "front" ? [0, 5] : [0, 3];
  return keyed(REST, [
    { f: 0, p: {} },
    { f: 2, p: { flap: 62, lag: 10, dy: -1.5, ht: -0.2, jaw: 0.3 } },
    { f: 3, p: { flap: 68, lag: 14, dy: -2, ht: -0.25, jaw: 0.5 } },
    { f: 4, p: { flap: 30, lag: -10, sweep: 0.8, dx: dv[0], dy: dv[1], dive: 1, legs: 1, ht: 0.15, jaw: 1 } },
    { f: 5, p: { flap: 10, lag: -20, sweep: 0.9, dx: dv[0] + 0.5, dy: dv[1] + 0.5, dive: 1, legs: 1, ht: 0.2, jaw: 1 } },
    { f: 7, p: { flap: 50, lag: 0, sweep: 0.2, dx: dv[0] * 0.4, dy: dv[1] * 0.4, dive: 0, legs: 0.5, ht: 0, jaw: 0.3 } },
    { f: 9, p: { flap: 20, lag: 0, sweep: 0, dx: 0, dy: 0, legs: 0, jaw: 0 } },
  ], 10);
}

export const pet: PetDef<RP> = {
  id: "war_raven", ru: "БОЕВОЙ ВОРОН", N, fly: true, shadow: 5, fx: ["#1c2a14", "#7ad04a", "#d8f8b8"],
  act: "ЧИСТИТ ПЕРЬЯ, КАРКАЕТ", atk: "ПИКЕ И КЛЕВОК",
  render, anims: { idle, act, walk, attack, hurt, death },
  icon: { view: "front", zoom: 2, focus: [16, 15] },
};
