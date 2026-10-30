/**
 * Мантия (ткань: маг, лекарь) на основе «Б» — то же описание, что у иконки (icons.ts → armor/robe): покрой (cut: tunic — до колен, mid — до середины голени,
 * иначе — до щиколоток, расклёшенная), рукава-колокола, кушак с хвостами, центральная полоса (panel) с вышивкой, кайма подола, высокий ворот,
 * пелерина (mantle), самоцвет, герб, светящиеся руны, ореол за головой, крылья, шипы, мифическое сияние. Детали — те же id, что в match.ts.
 */
import { hx, type C } from "../bosses139/mino_lib";
import { FY, type GearCtx, type V3 } from "../hero147/base_b";
import { H, crestParts, ramp, type CrestId } from "./gear";

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul([b[0] - a[0], b[1] - a[1], b[2] - a[2]], t));
const sum = (...v: V3[]): V3 => v.reduce((s, x) => add(s, x), [0, 0, 0] as V3);
type Sec = { h: number; a: number; d: number; f: number };

export function robe(ctx: GearCtx, it: any, crest: CrestId) {
  const { sk, b, PJ, facing, loft, c, dW, push, D, anim, u, v } = ctx, { A, U, F, waist } = sk;
  const Cl = ramp(it.cloth), Tr = ramp(it.trim ?? it.cloth), Sa = ramp(it.sash ?? it.cloth), th = 0.3;
  const S: Sec[] = ctx.secs.slice(0, 5).map((s) => ({ ...s, a: s.a + th, d: s.d + th * 0.9 }));
  S[0] = { ...S[0], h: -1.2 };
  const surf = H.mkSurf(waist, A, U, F, S), sw = b.shW, fF = facing(F), sd = fF >= 0 ? 1 : -1;
  push({ g: "r_body", ramp: Cl, o: { dome: 3, amp: 1.7, bias: 0.2, kant: true }, layer: 3.76, m: (z) => loft(z, waist, A, U, F, S) });
  push({ g: "r_fold", ramp: Cl, o: { dome: 1, bias: -1.5 }, layer: 3.761, m: (z) => { for (const a of [-0.5, 0.5]) z.seg(PJ(surf(a * sw, c * 0.9, sd, 0.2)), PJ(surf(a * sw * 0.8, 0, sd, 0.2)), 0.6); } });
  // подол: кольцо от таза до колен / голени / щиколоток, расклёшено
  const hp = sk.hip, Ap = sk.Ap, Fp = sk.Fp, kneeY = (sk.kneeL[1] + sk.kneeR[1]) / 2;
  const hemY = it.cut === "tunic" ? kneeY - 0.2 : it.cut === "mid" ? kneeY + (FY - kneeY) * 0.5 : FY - 1.4;
  const flare = it.cut === "tunic" ? 1.08 : it.cut === "mid" ? 1.2 : 1.42, swing = anim === "run" ? 2.2 : anim === "walk" ? 0.9 : 0.3, N = 12;
  const ring = (phi: number, h: "t" | "b"): V3 => {
    const ra = b.hipW + th + 0.7, rd = dW * 1.05 + th + 0.6, sp = h === "b" ? flare : 1;
    const x = Math.sin(phi) * ra * sp, zz = Math.cos(phi) * rd * sp;
    if (h === "t") return sum(hp, mul(Ap, x), mul(Fp, zz), [0, -0.4, 0]);
    const back = Math.max(0, -Math.cos(phi)) * swing, fl = 0.3 * Math.sin(2 * Math.PI * (u * 2) + phi * 2) * (swing > 0.5 ? 1 : 0.3);
    return [hp[0] + x, hemY, hp[2] + zz - back + fl];
  };
  const quads: { q: V3[]; L: number; k: number; p0: number; p1: number }[] = [];
  for (let k = 0; k < N; k++) {
    const p0 = (2 * Math.PI * k) / N, p1 = (2 * Math.PI * (k + 1)) / N, q = [ring(p0, "t"), ring(p1, "t"), ring(p1, "b"), ring(p0, "b")];
    const L = D(lerp(q[0], q[2], 0.5)) < -0.5 ? 1.95 : 3.975;
    quads.push({ q, L, k, p0, p1 });
    push({ g: "r_skirt", ramp: Cl, o: { dome: 2, amp: 1.6, bias: k % 2 ? -0.35 : 0.25 }, layer: L + 0.00001 * k, m: (z) => z.pg(q.map(PJ)) });
    if (k % 2 === 0) push({ g: "r_skirtF", ramp: Cl, o: { dome: 1, bias: -1.4 }, layer: L + 0.0001 + 0.00001 * k, m: (z) => z.seg(PJ(lerp(q[0], q[1], 0.5)), PJ(lerp(q[3], q[2], 0.5)), 0.55) });
    if (it.hemTrim) push({ g: "r_hem", ramp: Tr, o: { dome: 1, bias: 0.5 }, layer: L + 0.0002 + 0.00001 * k, m: (z) => z.seg(PJ(add(q[3], [0, -0.5, 0])), PJ(add(q[2], [0, -0.5, 0])), 0.85) });
    if (it.runes && k % 3 === 1) push({ g: "r_rune", ramp: ramp(it.runes), o: { dome: 1, bias: 0.6 }, layer: L + 0.0003, emis: true, m: (z) => { const m0 = lerp(lerp(q[3], q[2], 0.5), lerp(q[0], q[1], 0.5), 0.2); const p = PJ(m0); z.seg([p[0] - 0.5, p[1] - 1.2], [p[0] + 0.5, p[1]], 0.55); z.seg([p[0] + 0.5, p[1]], [p[0] - 0.5, p[1] + 1.0], 0.55); } });
    if (it.mythic && k % 4 === 2) push({ g: "r_myth", ramp: ramp(it.mythic), o: { dome: 1, bias: 1.2 }, layer: L + 0.00031, emis: true, m: (z) => { const p = PJ(lerp(lerp(q[3], q[2], 0.5), lerp(q[0], q[1], 0.5), 0.45)); z.seg([p[0] - 0.9, p[1]], [p[0] + 0.9, p[1]], 0.5); z.seg([p[0], p[1] - 0.9], [p[0], p[1] + 0.9], 0.5); } });
  }
  // центральная полоса и вышивка (спереди)
  if (it.panel && fF > -0.2) {
    const t0 = sum(hp, mul(Fp, dW * 1.05 + th + 0.75), [0, -0.4, 0]), b0: V3 = [hp[0], hemY - 0.2, hp[2] + (dW * 1.05 + th + 0.75) * flare];
    const w0 = mul(Ap, 1.0), w1 = mul(Ap, 1.4);
    push({ g: "r_panel", ramp: ramp(it.panel), o: { dome: 2, amp: 1.7, bias: 0.25, kant: true }, layer: 3.98, m: (z) => z.pg([add(t0, mul(w0, -1)), add(t0, w0), add(b0, w1), add(b0, mul(w1, -1))].map(PJ)) });
    if (it.embroid) push({ g: "r_emb", ramp: Tr, o: { dome: 1, bias: 0.6 }, layer: 3.981, m: (z) => { for (let j = 0; j < 4; j++) { const p = PJ(lerp(t0, b0, 0.15 + j * 0.22)); z.seg([p[0] - 0.9, p[1]], [p[0], p[1] + 0.8], 0.5); z.seg([p[0], p[1] + 0.8], [p[0] + 0.9, p[1]], 0.5); } } });
  } else if (it.embroid && fF > -0.2) push({ g: "r_emb", ramp: Tr, o: { dome: 1, bias: 0.6 }, layer: 3.981, m: (z) => { const p = PJ(surf(0, c * 0.4, 1, 0.3)); z.seg([p[0] - 1.2, p[1]], [p[0], p[1] + 1.0], 0.5); z.seg([p[0], p[1] + 1.0], [p[0] + 1.2, p[1]], 0.5); } });
  // кушак
  const sashC: Sec[] = [{ h: -1.45, a: b.waist + th + 0.45, d: dW + th + 0.45, f: 0 }, { h: 0.35, a: b.waist + th + 0.4, d: dW + th + 0.4, f: 0 }];
  push({ g: "r_sash", ramp: Sa, o: { dome: 2, amp: 1.8, bias: 0.3, kant: true }, layer: 3.985, m: (z) => loft(z, waist, A, U, F, sashC) });
  if (it.sashTails) {
    const knot = add(add(waist, mul(A, b.waist * 0.5)), mul(F, dW + th + 0.5));
    for (const j of [0, 1]) {
      const pts: V3[] = []; for (let k = 0; k <= 4; k++) { const wv = (anim === "walk" || anim === "run" ? 0.6 : 0.25) * Math.sin(2 * Math.PI * (u * 2 - k * 0.2) + j * 1.7); pts.push(sum(knot, mul(U, -k * 1.6), mul(A, 0.25 * k + 0.5 * j + wv * 0.4), mul(F, 0.2 * k))); }
      push({ g: "r_tail" + j, ramp: Sa, o: { dome: 2, amp: 1.7, bias: 0.25 - 0.2 * j, kant: true }, layer: (D(pts[2]) < -1.2 ? 1.96 : 3.99) + 0.001 * j, m: (z) => { for (let k = 0; k < 4; k++) z.seg(PJ(pts[k]), PJ(pts[k + 1]), 1.5 - 0.2 * k, 1.3 - 0.2 * k); } });
    }
    push({ g: "r_knot", ramp: Sa, o: { dome: 2, bias: 0.4, kant: true }, layer: 3.995, m: (z) => z.dot(PJ(knot), 1.1) });
  }
  // рукава: ткань до запястья; у колокола — широкий раструб
  for (const s of ["L", "R"] as const) {
    const Sh = s === "L" ? sk.shL : sk.shR, E = s === "L" ? sk.elL : sk.elR, Hd = s === "L" ? sk.hdL : sk.hdR, ar = ctx.arm[s];
    push({ g: "r_arm" + s, ramp: Cl, o: { dome: 2, amp: 1.7, bias: ar.far + 0.15, kant: true }, layer: ar.L0 + 0.005, m: (z) => z.seg(PJ(Sh), PJ(lerp(Sh, E, 0.95)), b.armT + 0.55, b.armT + 0.45) });
    push({ g: "r_fore" + s, ramp: Cl, o: { dome: 2, amp: 1.7, bias: ar.far + 0.15 }, layer: ar.L0 + 0.024, m: (z) => z.seg(PJ(E), PJ(lerp(E, Hd, 0.7)), b.foreT + 0.45, b.foreT + 0.4) });
    if (it.sleeves) push({ g: "r_sleeve" + s, ramp: Cl, o: { dome: 2, amp: 1.8, bias: ar.far + 0.25, kant: true }, layer: ar.L0 + 0.0245, m: (z) => z.seg(PJ(lerp(E, Hd, 0.2)), PJ(add(lerp(E, Hd, 0.85), [0, 0.8, 0])), b.foreT + 0.8, b.foreT + 2.2) });
    if (it.sleeves && it.hemTrim) push({ g: "r_hemS" + s, ramp: Tr, o: { dome: 1, bias: 0.5 }, layer: ar.L0 + 0.0246, m: (z) => z.dot(PJ(add(lerp(E, Hd, 0.85), [0, 0.9, 0])), b.foreT * 0.5 + 0.9) });
  }
  // ворот, пелерина
  const nt = b.neckT;
  push({ g: "r_collar", ramp: ramp(it.collar ?? it.cloth), o: { dome: 2, amp: 1.7, bias: 0.3, kant: true }, layer: 5.12, m: (z) => loft(z, waist, A, U, F, [{ h: c - 0.6, a: nt * 0.9 + 1.1, d: nt * 0.7 + 1.0, f: 0.1 }, { h: c + 1.3, a: nt * 0.8 + 0.9, d: nt * 0.6 + 0.8, f: 0.1 }]) });
  if (it.mantle) {
    const S2: Sec[] = [{ h: c - 2.0, a: b.shW * 0.95 + 0.6, d: b.shW * 0.5 + 0.8, f: 0 }, { h: c - 0.5, a: b.shW * 0.72 + 0.4, d: b.shW * 0.42 + 0.6, f: 0 }, { h: c + 0.6, a: nt * 0.9 + 0.5, d: nt * 0.65 + 0.5, f: 0.1 }];
    push({ g: "r_mantle", ramp: ramp(it.mantle), o: { dome: 3, amp: 1.8, bias: 0.2, kant: true }, layer: 5.1, m: (z) => loft(z, waist, A, U, F, S2) });
    if (it.hemTrim) push({ g: "r_hemM", ramp: Tr, o: { dome: 1, bias: 0.5 }, layer: 5.101, m: (z) => { const pts: V3[] = []; for (let k = 0; k <= 10; k++) { const t = -1 + (2 * k) / 10, q = Math.sqrt(Math.max(0, 1 - t * t)); pts.push(sum(waist, mul(A, t * (b.shW * 0.95 + 0.6)), mul(U, c - 2.0), mul(F, sd * q * (b.shW * 0.5 + 0.9)))); } H.chain(ctx, z, pts, 0.75); } });
  }
  if (it.gem && fF > 0.2) push({ g: "r_gem", ramp: ramp(it.gem), o: { dome: 1, bias: 0.6 }, layer: 5.125, emis: it.gem === "eye_glow" || !!it.gemGlow, emisColor: hx("#ff6a3a"), m: (z) => z.dot(PJ(add(surf(0, c * 0.86), mul(F, 0.8))), 0.85) });
  if (it.crest && fF > 0.3) crestParts(ctx, add(surf(0, c * 0.45), mul(F, 0.35)), A, U, 1.4, 3.7655, crest);
  if (it.spikes) for (const s of [1, -1]) { const Sh = s > 0 ? sk.shL : sk.shR; H.hook(ctx, { g: "r_spk" + s, layer: 5.13, far: 0 }, add(Sh, mul(U, 0.8)), sum(Sh, mul(U, 3.2), mul(A, s * 1.2)), 0.7, 0.2 * s, ramp(it.spike ?? it.trim ?? it.cloth)); }
  // ореол за головой и крылья
  if (it.halo) {
    const hc = add(sk.head, mul(U, 1.2)), L = v === "up" ? 6.5 : 0.45;
    push({ g: "r_halo", ramp: ramp(it.halo), o: { dome: 1, bias: 1.0 }, layer: L, emis: true, m: (z) => { const p = PJ(add(hc, mul(sk.F, v === "up" ? 1.5 : -1.5))); z.el([p[0], p[1] - 3.6], 6.2, 2.0); z.clip((x, y) => Math.hypot((x - p[0]) / 5.0, (y - p[1] + 3.6) / 1.2) > 1); } });
  }
  if (it.wings) {
    const o = sum(sk.chest, mul(F, -(b.shW * 0.46 + 0.9))), L = v === "up" ? 5.16 : v === "side" ? 0.9 : 0.42;
    for (const s of [1, -1]) push({ g: "r_wing" + (s > 0 ? "L" : "R"), ramp: ramp(it.wings), o: { dome: 2, amp: 1.8, bias: 0.3, kant: true }, layer: L, emis: !!it.wingGlow, m: (z) => z.pg([o, sum(o, mul(A, s * 6.5), mul(U, 5)), sum(o, mul(A, s * 5.2), mul(U, 1.6)), sum(o, mul(A, s * 7.2), mul(U, -1.2)), sum(o, mul(A, s * 4.2), mul(U, -3.6)), sum(o, mul(A, s * 6.2), mul(U, -7.2)), sum(o, mul(A, s * 1.6), mul(U, -4.6))].map(PJ)) });
  }
  if (it.mythic) for (const s of [1, -1]) { const Sh = s > 0 ? sk.shL : sk.shR; push({ g: "r_mythF" + s, ramp: ramp(it.trim ?? it.cloth), o: { dome: 2, amp: 1.8, bias: 0.4, kant: true }, layer: 5.13, m: (z) => z.pg([PJ(add(Sh, mul(U, 0.6))), PJ(sum(Sh, mul(U, 3.0), mul(A, s * 1.6))), PJ(sum(Sh, mul(U, 0.8), mul(A, s * 1.8)))]) }); }
  void (null as unknown as C);
}
