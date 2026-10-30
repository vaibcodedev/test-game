/**
 * Кожаные вещи и парное оружие (разбойник) для системы слоёв основы «Б»: капюшон, куртка-плащ с кушаком, шарф (слот «Спина»), парные кинжалы.
 * Те же правила, что у лат: части в 3D-скелете, слой по части тела, правая рука ведущая, свет сверху-слева, кант, ночное свечение.
 * Параметры — data/gear147.json (style: hood | coat; kind: scarf | dual).
 */
import { hx, hash, type C } from "../bosses139/mino_lib";
import { FY, pose, proj, solve, type AnimId, type Build, type GearCtx, type Mz, type Pose, type V2, type V3 } from "../hero147/base_b";
import { DROP_U, GD, H, backMount, crestParts, ramp, type CrestId } from "./gear";

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
const sum = (...v: V3[]): V3 => v.reduce((s, x) => add(s, x), [0, 0, 0] as V3);
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (t: number) => t * t * (3 - 2 * t);
type Sec = { h: number; a: number; d: number; f: number };

// =============== КАПЮШОН (шлем) ===============
export function hood(ctx: GearCtx, it: any, crest: CrestId) {
  const { push, hv, hw, hh, sk, b, loft, c } = ctx;
  const Cl = ramp(it.cloth), Ln = ramp(it.lining), Sh = ramp(it.shadow ?? "hood_shadow"), Mk = it.mask ? ramp(it.mask) : null, G = it.glow ? ramp(it.glow) : null;
  const loc = (g: string, rp: C[], layer: number, f: (z: Mz) => void, o: any = { dome: 3, amp: 1.7, bias: 0.2 }, emis = false, emisColor?: C) => push({ g, ramp: rp, layer, loc: f, o, emis, emisColor });
  if (hv === "front") {
    loc("hd_out", Cl, 6.15, (z) => z.pg([[-hw - 0.7, hh * 0.3], [-hw - 0.5, -hh * 0.6], [-hw * 0.45, -hh - 1.1], [0, -hh - 1.9], [hw * 0.45, -hh - 1.1], [hw + 0.5, -hh * 0.6], [hw + 0.7, hh * 0.3], [hw + 0.6, hh + 1.0], [-hw - 0.6, hh + 1.0]]), { dome: 3, amp: 1.8, bias: 0.25, kant: true });
    loc("hd_fold", Cl, 6.151, (z) => { z.bz([-hw * 0.8, -hh * 0.9], [-hw * 1.0, 0], [-hw * 0.95, hh + 0.6], 0.6, 0.6); z.bz([hw * 0.8, -hh * 0.9], [hw * 1.0, 0], [hw * 0.95, hh + 0.6], 0.6, 0.6); }, { dome: 1, bias: -1.5 });
    loc("hd_lit", Cl, 6.152, (z) => z.bz([-hw - 0.2, hh * 0.1], [-hw * 0.7, -hh - 0.6], [0, -hh - 1.6], 0.7, 0.6), { dome: 1, bias: 2.6 });
    loc("hd_lin", Ln, 6.16, (z) => { z.el([0, hh * 0.22], hw * 0.86, hh * 1.0); if (!Mk && !G) z.clip((x, y) => !(Math.hypot(x / (hw * 0.74), (y - hh * 0.28) / (hh * 0.9)) < 1)); }, { dome: 2, amp: 1.6, bias: 0.2 });
    // без маски лицо видно: кромка-кольцо и тень только сверху (от капюшона на лоб)
    if (Mk || G) loc("hd_sh", Sh, 6.17, (z) => z.el([0, hh * 0.28], hw * 0.74, hh * 0.9), { dome: 2, amp: 0.8, bias: -0.2 });
    else loc("hd_sh", Sh, 6.17, (z) => { z.el([0, -hh * 0.42], hw * 0.72, hh * 0.38); z.clip((x, y) => y < -hh * 0.2 + Math.abs(x) * 0.2); }, { dome: 1, amp: 0.6, bias: 0.2 });
    if (G) loc("hd_eye", G, 6.18, (z) => { z.dot([-hw * 0.32, hh * 0.08], 0.55); z.dot([hw * 0.32, hh * 0.08], 0.55); }, { dome: 1, bias: 0.4 }, true, hx("#ff6a3a"));
    if (Mk) loc("hd_mask", Mk, 6.19, (z) => z.pg([[-hw * 0.74, hh * 0.52], [hw * 0.74, hh * 0.52], [hw * 0.5, hh + 0.7], [0, hh + 1.3], [-hw * 0.5, hh + 0.7]]), { dome: 2, amp: 1.8, bias: 0.15, kant: true });
    if (Mk && it.seam) loc("hd_seam", ramp(it.seam), 6.192, (z) => z.seg([-hw * 0.7, hh * 0.56], [hw * 0.7, hh * 0.56], 0.6), { dome: 1, bias: 0.4 }, true, hx("#ff6a3a"));
  } else if (hv === "back") {
    loc("hd_out", Cl, 6.15, (z) => z.pg([[-hw - 0.7, hh * 0.3], [-hw - 0.5, -hh * 0.6], [-hw * 0.45, -hh - 1.1], [0, -hh - 1.9], [hw * 0.45, -hh - 1.1], [hw + 0.5, -hh * 0.6], [hw + 0.7, hh * 0.3], [hw + 0.6, hh + 1.0], [-hw - 0.6, hh + 1.0]]), { dome: 3, amp: 1.8, bias: 0.2, kant: true });
    loc("hd_bfold", Cl, 6.151, (z) => z.seg([0, -hh - 1.8], [0, hh + 1.4], 0.65), { dome: 1, bias: -1.6 });
    if (it.crest) {
      const cr = GD.crests[crest], s = 1.35, P = (x: number, y: number): V2 => [x * s, hh * 0.15 + y * s];
      loc("crestR", ramp(cr.charge), 6.155, (z) => z.pg([P(-1.85, -1.95), P(1.85, -1.95), P(1.85, 0.15), P(0, 2.5), P(-1.85, 0.15)]), { dome: 1, bias: -0.6 });
      loc("crest", ramp(cr.field), 6.156, (z) => z.pg([P(-1.4, -1.6), P(1.4, -1.6), P(1.4, 0.1), P(0, 1.95), P(-1.4, 0.1)]), { dome: 2, bias: 0.2 });
      loc("crestC", ramp(cr.charge), 6.157, (z) => { const q = P(0, -0.3); z.dot(q, 0.55 * s); }, { dome: 1, bias: 0.7 });
    }
  } else {
    // профиль: лицом вправо, остриё капюшона назад-вверх, вырез спереди в тени, маска клювом
    // профиль: козырёк вперёд над лицом, остриё назад, без длинного «столба» вниз
    loc("hd_out", Cl, 6.15, (z) => { z.el([-0.4, -hh * 0.12], hw + 0.55, hh + 0.65); z.pg([[-hw * 0.3, -hh - 0.4], [-hw - 1.7, -hh * 0.35], [-hw * 0.4, hh * 0.1]]); z.pg([[-hw * 0.5, hh * 0.3], [hw * 0.5, hh * 0.55], [hw * 0.3, hh + 0.8], [-hw * 0.8, hh + 0.8]]); z.bz([hw * 0.1, -hh * 0.9], [hw + 1.1, -hh * 0.85], [hw + 1.6, -hh * 0.3], 1.5, 0.8); }, { dome: 3, amp: 1.8, bias: 0.3, kant: true });
    loc("hd_lit", Cl, 6.152, (z) => z.bz([hw + 1.3, -hh * 0.6], [hw * 0.2, -hh - 0.9], [-hw - 1.0, -hh * 0.5], 0.7, 0.6), { dome: 1, bias: 2.6 });
    loc("hd_fold", Cl, 6.151, (z) => z.bz([-hw * 0.2, -hh * 0.9], [-hw * 0.6, 0], [-hw * 0.3, hh + 0.7], 0.6, 0.6), { dome: 1, bias: -1.5 });
    loc("hd_lin", Ln, 6.16, (z) => { z.el([hw * 0.74, hh * 0.25], hw * 0.36, hh * 0.92); if (!Mk && !G) z.clip((x, y) => !(Math.hypot((x - hw * 0.8) / (hw * 0.3), (y - hh * 0.3) / (hh * 0.8)) < 1)); }, { dome: 2, amp: 1.6, bias: 0.2 });
    if (Mk || G) loc("hd_sh", Sh, 6.17, (z) => z.el([hw * 0.8, hh * 0.3], hw * 0.28, hh * 0.8), { dome: 2, amp: 0.8, bias: -0.2 });
    if (G) loc("hd_eye", G, 6.18, (z) => z.dot([hw * 0.78, hh * 0.1], 0.55), { dome: 1, bias: 0.4 }, true, hx("#ff6a3a"));
    if (Mk) loc("hd_mask", Mk, 6.19, (z) => z.pg([[hw * 0.55, hh * 0.5], [hw + 1.0, hh * 0.55], [hw + 0.5, hh + 0.7], [hw * 0.45, hh + 1.0]]), { dome: 2, amp: 1.8, bias: 0.15, kant: true });
    if (Mk && it.seam) loc("hd_seam", ramp(it.seam), 6.192, (z) => z.seg([hw * 0.55, hh * 0.56], [hw + 0.95, hh * 0.6], 0.6), { dome: 1, bias: 0.4 }, true, hx("#ff6a3a"));
  }
  // накидка-пелерина на плечах (часть капюшона)
  const { A, U, F, waist } = sk, nt = b.neckT, S2: Sec[] = [{ h: c - 1.4, a: b.shW * 0.78 + 0.4, d: b.shW * 0.44 + 0.7, f: 0 }, { h: c - 0.3, a: b.shW * 0.62 + 0.4, d: b.shW * 0.4 + 0.6, f: 0 }, { h: c + 0.8, a: nt * 0.8 + 0.5, d: nt * 0.6 + 0.5, f: 0.1 }];
  push({ g: "hd_cape", ramp: it.capelet ? ramp(it.capelet) : Cl, o: { dome: 3, amp: 1.7, bias: 0.15, kant: true }, layer: 5.1, m: (z) => loft(z, waist, A, U, F, S2) });
  push({ g: "hd_capeE", ramp: Ln, o: { dome: 1, bias: 0.5 }, layer: 5.101, m: (z) => { const pts: V3[] = []; const fz = ctx.facing(F) >= 0 ? 1 : -1; for (let k = 0; k <= 10; k++) { const t = -1 + (2 * k) / 10, q = Math.sqrt(Math.max(0, 1 - t * t)); pts.push(sum(waist, mul(A, t * (b.shW * 0.78 + 0.4)), mul(U, c - 1.4), mul(F, fz * q * (b.shW * 0.44 + 0.8)))); } H.chain(ctx, z, pts, 0.75); } });
}

// =============== КУРТКА-ПЛАЩ (доспех) ===============
export function coat(ctx: GearCtx, it: any, crest: CrestId) {
  const { sk, b, PJ, facing, loft, c, dW, push, D, anim, u } = ctx, { A, U, F, waist } = sk;
  const Lt = ramp(it.leather), St = ramp(it.plate), Ac = ramp(it.accent), Tr = ramp(it.trim ?? it.accent), th = it.thick ?? 0.35;
  const S: Sec[] = ctx.secs.slice(0, 5).map((s) => ({ ...s, a: s.a + th, d: s.d + th * 0.9 }));
  S[0] = { ...S[0], h: -1.2 };
  const surf = H.mkSurf(waist, A, U, F, S), sw = b.shW, fF = facing(F);
  push({ g: "c_body", ramp: Lt, o: { dome: 3, amp: 1.7, bias: 0.2, kant: true }, layer: 3.76, m: (z) => loft(z, waist, A, U, F, S) });
  push({ g: "c_seam", ramp: Lt, o: { dome: 1, bias: -1.5 }, layer: 3.761, m: (z) => { const sd = fF >= 0 ? 1 : -1; z.seg(PJ(surf(sd * sw * 0.15, c * 0.95, sd, 0.2)), PJ(surf(sd * sw * 0.05, -0.9, sd, 0.2)), 0.65); } });
  // стальной нагрудник поверх кожи (только у редких и выше)
  if (it.breast && fF > -0.2) {
    const pl = [surf(-sw * 0.7, c * 0.9), surf(sw * 0.7, c * 0.9), surf(sw * 0.55, c * 0.45), surf(0, c * 0.22), surf(-sw * 0.55, c * 0.45)];
    push({ g: "c_plate", ramp: St, o: { dome: 2, amp: 1.9, bias: 0.3, kant: true }, layer: 3.762, m: (z) => z.pg(pl.map((p) => PJ(add(p, mul(F, 0.15))))) });
    push({ g: "c_plateL", ramp: St, o: { dome: 1, bias: -1.5 }, layer: 3.7621, m: (z) => z.seg(PJ(add(surf(0, c * 0.88), mul(F, 0.2))), PJ(add(surf(0, c * 0.26), mul(F, 0.2))), 0.6) });
    if (it.cracks) push({ g: "c_crack", ramp: ramp(it.cracks), o: { dome: 1, bias: 0.4 }, layer: 3.7622, emis: true, emisColor: hx("#ff9a5a"), m: (z) => { for (const sg of [-1, 1]) H.chain(ctx, z, [[0.5, 0.82], [0.36, 0.66], [0.46, 0.5], [0.3, 0.36]].map(([a, h]) => add(surf(sg * a * sw, h * c), mul(F, 0.3))), 0.6); } });
    if (it.crest && fF > 0.3) crestParts(ctx, add(surf(-sw * 0.32, c * 0.62), mul(F, 0.35)), A, U, 1.25, 3.7655, crest);
  }
  if (it.breast && fF < 0.2) push({ g: "c_plate", ramp: St, o: { dome: 2, bias: 0.1, kant: true }, layer: 3.762, m: (z) => z.pg([surf(-sw * 0.6, c * 0.9, -1), surf(sw * 0.6, c * 0.9, -1), surf(sw * 0.4, c * 0.5, -1), surf(-sw * 0.4, c * 0.5, -1)].map(PJ)) });
  // строчка (пунктир 2 px), заклёпки, потёртости — читаются на зуме 2
  if (it.stitch) {
    const St2 = ramp(it.stitch), sd = fF >= 0 ? 1 : -1;
    const dash = (z: Mz, a: V3, b2: V3, n: number) => { for (let k = 0; k < n; k++) { const t0 = k / n, t1 = t0 + 0.55 / n; z.seg(PJ(lerp(a, b2, t0)), PJ(lerp(a, b2, t1)), 0.6); } };
    push({ g: "c_stitch", ramp: St2, o: { dome: 1, bias: 0.5 }, layer: 3.7619, m: (z) => { for (const o of [-0.55, 0.55]) dash(z, surf(o + sd * sw * 0.15, c * 0.92, sd, 0.3), surf(o + sd * sw * 0.05, -0.8, sd, 0.3), 5); dash(z, surf(-sw * 0.85, c * 0.75, sd, 0.3), surf(-sw * 0.8, c * 0.15, sd, 0.3), 3); dash(z, surf(sw * 0.85, c * 0.75, sd, 0.3), surf(sw * 0.8, c * 0.15, sd, 0.3), 3); } });
  }
  if (it.wear) push({ g: "c_wear", ramp: Lt, o: { dome: 1, bias: 1.6 }, layer: 3.7613, m: (z) => { const sd = fF >= 0 ? 1 : -1; for (const [a, h] of [[-0.55, 0.3], [0.62, 0.55], [0.3, 0.1]]) z.dot(PJ(surf(a * sw, h * c, sd, 0.3)), 0.75); } });
  if (it.breast && fF > 0.3) push({ g: "c_riv", ramp: ramp("gold"), o: { dome: 1, bias: 1.2 }, layer: 3.7657, m: (z) => { for (const [a, h] of [[-0.6, 0.86], [0.6, 0.86], [-0.48, 0.48], [0.48, 0.48]]) z.dot(PJ(add(surf(a * sw, h * c), mul(F, 0.3))), 0.55); } });
  // ремень через грудь (справа-налево) с пряжкой
  if (it.strap) {
    const sd = fF >= 0 ? 1 : -1;
    push({ g: "c_strap", ramp: ramp(it.strapMat ?? it.accent), o: { dome: 1, bias: 0.4 }, layer: 3.764, m: (z) => z.seg(PJ(surf(-sw * 0.85 * sd, c * 0.95, sd, 0.35)), PJ(surf(sw * 0.7 * sd, c * 0.05, sd, 0.35)), 1.0) });
    if (sd > 0) push({ g: "c_buck", ramp: ramp("gold"), o: { dome: 1, bias: 1.0 }, layer: 3.7641, m: (z) => { const q = PJ(surf(sw * 0.1, c * 0.5, 1, 0.45)); z.pg([[q[0] - 1.0, q[1] - 0.9], [q[0] + 1.0, q[1] - 0.9], [q[0] + 1.0, q[1] + 0.9], [q[0] - 1.0, q[1] + 0.9]]); } });
    if (sd > 0) push({ g: "c_sriv", ramp: ramp("gold"), o: { dome: 1, bias: 1.4 }, layer: 3.7656, m: (z) => { for (const t of [0.2, 0.75]) z.dot(PJ(lerp(surf(-sw * 0.85, c * 0.95, 1, 0.45), surf(sw * 0.7, c * 0.05, 1, 0.45), t)), 0.5); } });
  }
  // кушак: широкий алый пояс с узлом и хвостами
  const sashC: Sec[] = [{ h: -1.45, a: b.waist + th + 0.45, d: dW + th + 0.45, f: 0 }, { h: 0.35, a: b.waist + th + 0.4, d: dW + th + 0.4, f: 0 }];
  push({ g: "c_sash", ramp: ramp(it.sash ?? it.leather), o: { dome: 2, amp: 1.8, bias: 0.3, kant: true }, layer: 3.765, m: (z) => loft(z, waist, A, U, F, sashC) });
  push({ g: "c_sashH", ramp: ramp(it.sash ?? it.leather), o: { dome: 1, bias: 2.4 }, layer: 3.7652, m: (z) => { const sd = fF >= 0 ? 1 : -1; H.chain(ctx, z, [-0.85, -0.4, 0.1].map((a) => H.mkSurf(waist, A, U, F, sashC)(a * b.waist, 0.15, sd, 0.2)), 0.6); } });
  push({ g: "c_sashF", ramp: ramp(it.sash ?? it.leather), o: { dome: 1, bias: -1.4 }, layer: 3.7651, m: (z) => { const sd = fF >= 0 ? 1 : -1; H.chain(ctx, z, [-0.8, -0.3, 0.2, 0.7].map((a) => H.mkSurf(waist, A, U, F, sashC)(a * b.waist, -0.5, sd, 0.15)), 0.6); } });
  if (it.sashTails) {
    const knot = add(add(waist, mul(A, -(b.waist + th + 0.3))), mul(F, dW * 0.6));
    const sw2 = anim === "walk" || anim === "run" ? 1 : 0.4;
    for (const j of [0, 1]) {
      const pts: V3[] = [];
      for (let k = 0; k <= 5; k++) { const wv = sw2 * 0.6 * Math.sin(2 * Math.PI * (u * 2 - k * 0.2) + j * 1.7); pts.push(sum(knot, mul(U, -k * 1.75), mul(A, -0.3 * k - 0.4 * j + wv * 0.4), mul(F, -0.35 * k * (anim === "run" ? 1.8 : 1) + wv * 0.3))); }
      const L = D(pts[2]) < -1.2 ? 1.95 : 3.97;
      push({ g: "c_tail" + j, ramp: ramp(it.sash), o: { dome: 2, amp: 1.7, bias: 0.25 - 0.2 * j, kant: true }, layer: L + 0.001 * j, m: (z) => { for (let k = 0; k < 5; k++) z.seg(PJ(pts[k]), PJ(pts[k + 1]), 1.7 - 0.2 * k, 1.5 - 0.2 * k); } });
    }
    push({ g: "c_knot", ramp: ramp(it.sash), o: { dome: 2, bias: 0.4, kant: true }, layer: 3.9705, m: (z) => z.dot(PJ(knot), 1.2) });
    if (it.gem) push({ g: "c_gem", ramp: ramp(it.gem), o: { dome: 1, bias: 0.5 }, layer: 3.971, emis: it.gem === "eye_glow", emisColor: hx("#ff6a3a"), m: (z) => z.dot(PJ(add(knot, mul(F, 0.6))), 0.8) });
  }
  if (it.lacing && fF > 0.2) push({ g: "c_lace", ramp: ramp(it.lacing), o: { dome: 1, bias: 0.6 }, layer: 3.7643, m: (z) => { for (let k = 0; k < 4; k++) { const h0 = c * (0.85 - k * 0.17), h1 = h0 - c * 0.17; z.seg(PJ(surf(-sw * 0.18, h0, 1, 0.3)), PJ(surf(sw * 0.18, h1, 1, 0.3)), 0.75); z.seg(PJ(surf(sw * 0.18, h0, 1, 0.3)), PJ(surf(-sw * 0.18, h1, 1, 0.3)), 0.75); } } });
  if (!it.sashTails && fF > 0.25) push({ g: "c_buck", ramp: ramp("brass"), o: { dome: 1, bias: 0.6 }, layer: 3.7655, m: (z) => z.dot(PJ(H.mkSurf(waist, A, U, F, sashC)(0, -0.5, 1, 0.3)), 0.9) });
  if (it.pouch) { const pc = sum(waist, mul(A, b.waist + th + 0.6), mul(U, -1.6), mul(F, 0.6)); push({ g: "c_pouch", ramp: ramp(it.pouch), o: { dome: 2, amp: 1.7, bias: 0.2, kant: true }, layer: ctx.facing(A) > -0.3 ? 3.976 : 1.9, m: (z) => z.seg(PJ(add(pc, mul(U, 0.7))), PJ(add(pc, mul(U, -0.9))), 2.2, 2.5) }); }
  if (it.pants) for (const s of ["L", "R"] as const) {
    const H0 = s === "L" ? sk.hipL : sk.hipR, K = s === "L" ? sk.kneeL : sk.kneeR, lg = ctx.leg[s], L = lg.L0 + lg.sub0;
    push({ g: "c_pants" + s, ramp: ramp(it.pants), o: { dome: 2, amp: 1.7, bias: lg.far + 0.2, kant: true }, layer: L + 0.00005, m: (z) => z.seg(PJ(lerp(H0, K, 0.05)), PJ(lerp(H0, K, 0.98)), b.thighT + 0.3, b.thighT * 0.86 + 0.25) });
    push({ g: "c_pstrap" + s, ramp: ramp("grip"), o: { dome: 1, bias: 0.4 }, layer: L + 0.00006, m: (z) => { for (const t of [0.35, 0.7]) { const m = lerp(H0, K, t), q = mul(sk.Ap, b.thighT * 0.62 + 0.25); z.seg(PJ(sub(m, q)), PJ(add(m, q)), 0.85); } } });
    if (ctx.facing(sk.Fp) > -0.2) push({ g: "c_pbuck" + s, ramp: ramp("gold"), o: { dome: 1, bias: 1.0 }, layer: L + 0.00007, m: (z) => z.dot(PJ(add(lerp(H0, K, 0.35), mul(sk.Fp, b.thighT * 0.45 + 0.2))), 0.55) });
  }
  // трещины по коже без нагрудника, высокий ворот, шипы и наплечья, мифическое сияние — те же, что на иконке
  if (it.cracks && !it.breast && fF > -0.2) push({ g: "c_crack", ramp: ramp(it.cracks), o: { dome: 1, bias: 0.4 }, layer: 3.7648, emis: true, emisColor: hx("#ff9a5a"), m: (z) => { for (const sg of [-1, 1]) H.chain(ctx, z, [[0.55, 0.85], [0.42, 0.62], [0.52, 0.4]].map(([a, h]) => add(surf(sg * a * sw, h * c), mul(F, 0.3))), 0.6); } });
  if (it.collarHigh) push({ g: "c_hcol", ramp: Lt, o: { dome: 2, amp: 1.8, bias: 0.3, kant: true }, layer: 5.12, m: (z) => loft(z, waist, A, U, F, [{ h: c - 0.6, a: b.neckT * 0.95 + 1.2, d: b.neckT * 0.75 + 1.1, f: 0.1 }, { h: c + 1.7, a: b.neckT * 0.9 + 1.2, d: b.neckT * 0.7 + 1.0, f: 0.1 }]) });
  for (const s of ["L", "R"] as const) {
    const Sh = s === "L" ? sk.shL : sk.shR, sg = s === "L" ? 1 : -1, Lsh = ctx.v === "side" ? (ctx.arm[s].far === 0 ? 6.39 : 1.21) : 5.21;
    if (it.spikes) for (const [k, d] of [[0, [0.4, 1, 0]], [1, [1, 0.5, 0]]] as [number, number[]][]) H.hook(ctx, { g: "c_spk" + s + k, layer: Lsh + 0.001 * k, far: ctx.arm[s].far }, add(Sh, mul(U, 0.6)), sum(Sh, mul(U, 0.6 + 3.2 * d[1]), mul(A, sg * (0.4 + 2.8 * d[0]))), 0.75, 0.2 * sg, ramp(it.spike ?? it.plate));
    else if (it.pauldronsOnIcon) push({ g: "c_spl" + s, ramp: St, o: { dome: 3, amp: 1.9, bias: ctx.arm[s].far + 0.25, kant: true }, layer: Lsh, m: (z) => z.dot(PJ(sum(Sh, mul(A, sg * 0.6), mul(U, 0.5))), 1.9) });
    if (it.mythic) push({ g: "c_mythF" + s, ramp: Tr, o: { dome: 2, amp: 1.8, bias: 0.4, kant: true }, layer: Lsh + 0.005, m: (z) => z.pg([PJ(add(Sh, mul(U, 0.8))), PJ(sum(Sh, mul(U, 3.2), mul(A, sg * 1.6))), PJ(sum(Sh, mul(U, 0.9), mul(A, sg * 1.9)))]) });
  }
  if (it.mythic && fF > -0.2) push({ g: "c_myth", ramp: ramp(it.mythic), o: { dome: 1, bias: 1.2 }, layer: 3.7645, emis: true, m: (z) => { for (const sg of [-1, 1]) H.chain(ctx, z, [[0.62, 0.86], [0.42, 0.62], [0.55, 0.38]].map(([a, h]) => add(surf(sg * a * sw, h * c), mul(F, 0.35))), 0.6); z.dot(PJ(add(surf(0, c * 0.95), mul(F, 0.5))), 0.75); } });
  // полы куртки: разрез спереди, полосы по кругу от пояса до колен (жилет — без пол, куртка — короткие), сзади парусят при движении
  const hp = sk.hip, Ap = sk.Ap, Fp = sk.Fp, ky = it.cut === "jacket" ? hp[1] + ((sk.kneeL[1] + sk.kneeR[1]) / 2 - hp[1]) * 0.45 : (sk.kneeL[1] + sk.kneeR[1]) / 2 + (it.long ? 0.8 : -0.5);
  const swing = anim === "run" ? 2.6 : anim === "walk" ? 1.1 : 0.4, N = 10, open = it.open ?? 0.95;
  const ring = (phi: number, h: "t" | "b"): V3 => {
    const ra = b.hipW + th + 0.6, rd = dW * 1.05 + th + 0.5, spread = h === "b" ? 1.12 : 1;
    const x = Math.sin(phi) * ra * spread, z = Math.cos(phi) * rd * spread;
    if (h === "t") return sum(hp, mul(Ap, x), mul(Fp, z), [0, -0.4, 0]);
    const back = Math.max(0, -Math.cos(phi)) * swing, fl = 0.3 * Math.sin(2 * Math.PI * (u * 2) + phi * 2) * (swing > 0.5 ? 1 : 0.3);
    return [hp[0] + x, ky - (it.tatter ? 0.9 * hash(Math.round(phi * 10), 3) : 0), hp[2] + z - back + fl];
  };
  for (let k = 0; k < (it.cut === "vest" ? 0 : N); k++) {
    const p0 = open + ((2 * Math.PI - 2 * open) * k) / N, p1 = open + ((2 * Math.PI - 2 * open) * (k + 1)) / N;
    const quad = [ring(p0, "t"), ring(p1, "t"), ring(p1, "b"), ring(p0, "b")];
    const L = D(lerp(quad[0], quad[2], 0.5)) < -0.5 ? 1.95 : 3.975;
    push({ g: "c_skirt", ramp: Lt, o: { dome: 2, amp: 1.6, bias: (k % 2 ? -0.35 : 0.25) }, layer: L + 0.00001 * k, m: (z) => z.pg(quad.map(PJ)) });
    if (it.stitch && k % 3 === 1) push({ g: "c_skst", ramp: ramp(it.stitch), o: { dome: 1, bias: 0.5 }, layer: L + 0.00015, m: (z) => { const a = lerp(quad[0], quad[1], 0.5), b2 = lerp(quad[3], quad[2], 0.5); for (let q = 0; q < 3; q++) z.seg(PJ(lerp(a, b2, 0.15 + q * 0.28)), PJ(lerp(a, b2, 0.27 + q * 0.28)), 0.6); } });
    if (it.wear && k % 4 === 2) push({ g: "c_skw", ramp: Lt, o: { dome: 1, bias: 1.6 }, layer: L + 0.00016, m: (z) => z.dot(PJ(lerp(lerp(quad[0], quad[1], 0.5), lerp(quad[3], quad[2], 0.5), 0.7)), 0.7) });
    if (it.hem && (k === 0 || k === N - 1)) push({ g: "c_hem", ramp: Tr, o: { dome: 1, bias: 0.5 }, layer: L + 0.0002, m: (z) => { const ph = k === 0 ? p0 : p1; z.seg(PJ(ring(ph, "t")), PJ(ring(ph, "b")), 0.7); } });
  }
  // рукава: кожа, на локте стальная пластинка
  for (const s of ["L", "R"] as const) {
    const Sh = s === "L" ? sk.shL : sk.shR, E = s === "L" ? sk.elL : sk.elR, ar = ctx.arm[s];
    push({ g: "c_arm" + s, ramp: Lt, o: { dome: 2, amp: 1.7, bias: ar.far + 0.15, kant: true }, layer: ar.L0 + 0.005, m: (z) => z.seg(PJ(Sh), PJ(lerp(Sh, E, 0.95)), b.armT + 0.55, b.armT + 0.4) });
    if (it.breast) push({ g: "c_elb" + s, ramp: St, o: { dome: 2, bias: ar.far + 0.35, kant: true }, layer: ar.L0 + 0.027, m: (z) => z.dot(PJ(E), b.foreT * 0.45 + 0.55) });
  }
}

// =============== ШАРФ (слот «Спина») ===============
export function scarf(ctx: GearCtx, it: any) {
  const { sk, PJ, push, anim, u } = ctx, M = backMount(ctx), R = ramp(it.cloth);
  const start = sum(M.o, mul(M.U, 1.5), mul(M.F, 0.3));
  const calm = (ctx.l as any).calmCloth, sw = calm ? 0.3 : anim === "run" ? 3.0 : anim === "walk" ? 1.4 : anim === "ride" ? 2.4 : anim === "atk1h" || anim === "atk2h" ? 1.0 : 0.5;
  const len = it.length ?? 7;
  for (const j of [0, 1]) {
    const pts: V3[] = [];
    for (let k = 0; k <= len; k++) {
      const t = k / len, wv = calm ? 0.25 * t * (j ? -1 : 1) : Math.sin(2 * Math.PI * (u * (sw > 1 ? 2 : 1) - t * 0.8) + j * 1.9) * (0.5 + sw * 0.35) * t;
      // висит вниз и чуть назад, при движении — парусит назад волной
      const back = 0.5 + t * t * (0.4 + sw * 0.9) * len * 0.35;
      pts.push(sum(start, mul(M.A, (j ? -1 : 1) * (0.6 + t * 0.9) + wv * 0.6), [0, k * (2.05 - sw * 0.2 * t), 0], mul(M.F, -back - Math.abs(wv) * 0.4)));
    }
    push({ g: "sc_" + j, ramp: R, o: { dome: 2, amp: 1.8, bias: 0.3 - 0.25 * j, kant: true }, layer: M.layer + 0.001 * j, m: (z) => { for (let k = 0; k < len; k++) z.seg(PJ(pts[k]), PJ(pts[k + 1]), 2.4 - 1.1 * (k / len), 2.4 - 1.1 * ((k + 1) / len)); } });
    // бахрома на конце
    push({ g: "sc_fr" + j, ramp: R, o: { dome: 1, bias: -0.2 }, layer: M.layer + 0.001 * j + 0.0001, m: (z) => { const e = PJ(pts[len]), p = PJ(pts[len - 1]), dx = e[0] - p[0], dy = e[1] - p[1]; for (const s of [-0.7, 0, 0.7]) z.seg(e, [e[0] + dx * 0.9 - dy * s * 0.6, e[1] + dy * 0.9 + dx * s * 0.6], 0.55, 0.4); } });
  }
  // узел у шеи
  push({ g: "sc_knot", ramp: R, o: { dome: 2, bias: 0.4, kant: true }, layer: M.layer + 0.003, m: (z) => z.dot(PJ(start), 1.4) });
  void sk; void FY;
}

// =============== ПАРНЫЕ КИНЖАЛЫ ===============
/** Поза под парное оружие: кинжал в каждой руке (+X — правая ведущая). atk1h — удары поочерёдно (правой, затем левой), atk2h — перекрёстный. */
export function dualPose(P: Pose, k: { anim: AnimId; u: number; arm: number; sx: number; view: string; hipY: number; hipJ: number; b: Build }) {
  const a = k.arm, u = k.u, X = P as any;
  delete P.shield; P.twoHand = false;
  if (k.anim === "death" && P.G) P.G = { ...P.G, shift: [P.G.shift[0], P.G.shift[1] - 5.8 * (P.G.ang / (Math.PI / 2)), P.G.shift[2]] };
  const rest = (s: 1 | -1, bob = 0): { h: V3; d: V3 } => ({ h: [s * 0.5, a * 0.78 + bob, 1.3], d: [s * 0.68, 0.42, 0.6] });
  const set = (main: { h: V3; d: V3 }, off: { h: V3; d: V3 }) => {
    P.weapon = { kind: "sword", dir: nrm(main.d) }; P.hL = { rel: main.h, pole: [0.7, 0.3, -0.7] };
    X.weapon2 = { dir: nrm(off.d) }; P.hR = { rel: off.h, pole: [-0.7, 0.3, -0.7] };
  };
  const mix = (p: { h: V3; d: V3 }, q: { h: V3; d: V3 }, t: number) => ({ h: lerp(p.h, q.h, t), d: lerp(p.d, q.d, t) });
  if (k.anim === "idle" || k.anim === "walk" || k.anim === "run" || k.anim === "hurt" || (k.anim === "death" && u < DROP_U)) {
    const bob = k.anim === "idle" ? 0.25 * Math.sin(2 * Math.PI * u) : 0;
    const f = k.anim === "hurt" ? Math.sin(Math.PI * cl(u / 0.6)) : 0;
    const R = rest(1, bob), L = rest(-1, bob);
    // ходьба и бег: руки в противофазе ногам, кисти запаздывают за шагом
    if (k.anim === "walk" || k.anim === "run") { const sw = Math.cos(2 * Math.PI * (u - 0.06)) * (k.anim === "run" ? 1.6 : 0.8); const up = k.anim === "run" ? 1.4 : 0.4; R.h = [R.h[0], R.h[1] - up, R.h[2] - sw]; L.h = [L.h[0], L.h[1] - up, L.h[2] + sw]; } // в беге локти согнуты — кинжалы выше (таз ниже, не за кадр)
    if (f) { R.h = [R.h[0] + 0.6 * f, R.h[1] - 0.6 * f, R.h[2] - 1.2 * f]; L.h = [L.h[0] + 0.6 * f, L.h[1] - 0.6 * f, L.h[2] - 1.2 * f]; }
    return set(R, L);
  }
  if (k.anim === "atk1h") {
    // поочерёдно: правой рубящий наискось через корпус (0.05–0.45), затем левой (0.45–0.9)
    // вбок рубящий читается сверху-вниз-вперёд (через корпус ушёл бы в глубину кадра)
    const sv = k.view === "side";
    const wind = (s: 1 | -1): { h: V3; d: V3 } => sv ? { h: [s * -0.6, a * 0.15, 0.4], d: [s * 0.1, -0.9, -0.45] } : { h: [s * 2.0, a * 0.25, 1.2], d: [s * 0.65, -0.65, 0.4] };
    const cut = (s: 1 | -1): { h: V3; d: V3 } => sv ? { h: [s * -1.2, a * 0.72, a * 0.88], d: [s * -0.1, 0.55, 0.83] } : { h: [s * -(k.sx + 0.6), a * 0.7, 2.8], d: [s * -0.7, 0.36, 0.6] };
    const one = (s: 1 | -1, u0: number) => { const t = (u - u0) / 0.42; if (t <= 0 || t >= 1) return { st: rest(s), p: 0 }; if (t < 0.35) return { st: mix(rest(s), wind(s), ease(t / 0.35)), p: 0.3 }; if (t < 0.6) return { st: mix(wind(s), cut(s), (t - 0.35) / 0.25 * ((t - 0.35) / 0.25)), p: 1 }; return { st: mix(cut(s), rest(s), ease((t - 0.6) / 0.4)), p: 0.5 }; };
    const r1 = one(1, 0.04), l1 = one(-1, 0.47), pr = r1.p, pl = l1.p;
    const R = r1.st, L = l1.st;
    P.twist = 0.35 * pr - 0.35 * pl; P.lean = 0.12 * Math.max(pr, pl);
    P.ankL = [k.hipJ + 0.3, FY - k.b.ankle, 0.6 + 1.2 * pr]; P.ankR = [-k.hipJ - 0.3, FY - k.b.ankle, -0.3 + 1.2 * pl];
    return set(R, L);
  }
  if (k.anim === "atk2h") {
    // перекрёстный: руки скрещены у груди клинками вверх, затем рывок в стороны-вниз
    const sv = k.view === "side";
    const cross = (s: 1 | -1): { h: V3; d: V3 } => ({ h: [s * -(k.sx + 0.4), a * 0.28, 2.0], d: sv ? [s * -0.3, -0.85, 0.45] : [s * -0.55, -0.82, 0.2] });
    // вбок клинки расходятся вперёд и назад, вниз и вверх — иначе ушли бы в глубину
    const open = (s: 1 | -1): { h: V3; d: V3 } => sv ? (s > 0 ? { h: [0.4, a * 0.72, a * 0.62], d: [0.1, 0.62, 0.77] } : { h: [-0.4, a * 0.75, -1.2], d: [-0.1, 0.62, -0.77] }) : { h: [s * 2.4, a * 0.8, 2.4], d: [s * 0.82, 0.38, 0.45] };
    const keys: [number, number][] = [[0, 0], [0.38, 1], [0.58, 2], [0.78, 2], [1, 0]];
    let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
    const e = (i === 1 ? (t: number) => t * t * t : ease)(cl((u - keys[i][0]) / (keys[i + 1][0] - keys[i][0])));
    const st = (s: 1 | -1, n: number) => (n === 0 ? rest(s) : n === 1 ? cross(s) : open(s));
    const R = mix(st(1, keys[i][1]), st(1, keys[i + 1][1]), e), L = mix(st(-1, keys[i][1]), st(-1, keys[i + 1][1]), e);
    P.lean = 0.15 * (keys[i][1] === 2 || keys[i + 1][1] === 2 ? 1 : 0); P.hip = [0, k.hipY + 0.8 * (keys[i + 1][1] === 2 ? e : keys[i][1] === 2 ? 1 - e : 0), 0];
    return set(R, L);
  }
}

/** Тонкий алый след концов кинжалов за последний кадр (светится ночью). */
function daggerTrail(ctx: GearCtx, it: any) {
  const { i, v, anim, l, D, PJ } = ctx;
  if (i < 1) return;
  const P0 = pose(l, anim, i - 1, v), sk0 = solve(l, P0), X0 = P0 as any, X = ctx.P as any, len = (it.length ?? 8) + 1.8;
  const pairs: [V3, V3][] = [];
  if (P0.weapon && ctx.P.weapon) pairs.push([add(sk0.hdL, mul(nrm(P0.weapon.dir), len)), add(ctx.sk.hdL, mul(nrm(ctx.P.weapon.dir), len))]);
  if (X0.weapon2 && X.weapon2) pairs.push([add(sk0.hdR, mul(nrm(X0.weapon2.dir), len)), add(ctx.sk.hdR, mul(nrm(X.weapon2.dir), len))]);
  for (const [a0, a1] of pairs) {
    const pa = PJ(a0), pb = PJ(a1); if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 3) continue;
    const mid = lerp(a0, a1, 0.5), L = D(mid) < -1.2 ? 1.19 : 5.19;
    ctx.push({ g: "w_trail", ramp: ramp(it.trail), o: { dome: 1, bias: 0.6 }, layer: L, emis: true, emisColor: hx("#ff4a2a"), m: (z) => z.bz(pa, PJ(add(mid, mul(nrm(sub(mid, ctx.sk.chest)), 1.2))), pb, 0.4, 1.0) });
  }
}
/** Рисование парных кинжалов: каждый — в своей руке, слой по глубине руки; без оружия в позе — в ножнах на пояснице, при гибели — выпали. */
export function dual(ctx: GearCtx, it: any, draw: (ctx: GearCtx, it: any, Hd: V3, d: V3, Lg: number, Lb: number, PJ: (p: V3) => V2) => void) {
  const { sk, D, P, v, anim, u } = ctx, X = P as any;
  const th = v === "side" ? 0.6 : -1.2, layerAt = (p: V3) => (D(p) < th ? 1.2 : 5.25), bladeAt = (p: V3) => (D(p) < th ? 1.2 : v === "side" ? 6.45 : 5.25);
  if (P.weapon && X.weapon2) {
    const d1 = nrm(P.weapon.dir), d2 = nrm(X.weapon2.dir);
    if ((anim === "atk1h" || anim === "atk2h") && it.trail) daggerTrail(ctx, it);
    draw(ctx, it, sk.hdL, d1, layerAt(add(sk.hdL, mul(d1, 0.3))), bladeAt(add(sk.hdL, mul(d1, 3))), ctx.PJ);
    draw(ctx, it, sk.hdR, d2, layerAt(add(sk.hdR, mul(d2, 0.3))), bladeAt(add(sk.hdR, mul(d2, 3))), ctx.PJ);
    return;
  }
  if (anim === "death") {
    const t = cl((u - DROP_U) / 0.3), e = ease(t), mx = (p: V3): V3 => (ctx.l.mirrorX ? [-p[0], p[1], p[2]] : p);
    for (const s of [1, -1]) {
      const h0: V3 = [s * 3, FY - 12, 3], h1: V3 = [s * 4, FY - 2.4, 1.5], Hd: V3 = [h0[0] + (h1[0] - h0[0]) * e, h0[1] + (h1[1] - h0[1]) * e - 2.5 * Math.sin(Math.PI * t), h0[2] + (h1[2] - h0[2]) * e];
      const d = nrm(lerp([s * 0.28, 0.35, 1], [s * 0.45, 0, v === "up" ? 0.9 : -0.9], e));
      const Dr = (p: V3) => (v === "down" ? p[2] : v === "up" ? -p[2] : ctx.l.mirrorX ? -p[0] : p[0]), L = Dr(Hd) < -1.2 ? 1.2 : 5.2;
      draw(ctx, it, Hd, d, L, L, (p: V3) => proj(mx(p), v));
    }
    return;
  }
  // ножны на пояснице крест-накрест (крепление «Спина»)
  const M = backMount(ctx);
  for (const s of [1, -1]) {
    const Hd = sum(M.o, mul(M.U, -5.2), mul(M.A, s * 2.6), mul(M.F, -0.3)), d = nrm(add(mul(M.A, -s * 0.8), mul(M.U, -0.75)));
    draw(ctx, it, Hd, d, M.layer + 0.02, M.layer + 0.02, ctx.PJ);
  }
}
void hash;
