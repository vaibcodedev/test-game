/**
 * Задача 142: грозовые дракены (09 — чёрный с белыми молниями, 10 — серо-синий со светящимися трещинами, рогатый шлем).
 * Четыре лапы с когтями, длинная шея, голова с открывающейся пастью и рогами, перепончатые крылья, хвост с шипами.
 * Легендарные: светящиеся жилы, молнии между рогами и по крыльям, искры. Покой: рычит (пасть, голова вверх), расправляет
 * и складывает крылья, бьёт хвостом.
 */
import {
  add, mul, norm, lerpV, rotAxis, cross, lerp, TAU, R, M, X, Y, Z,
  STORM, SPIRIT, GOLD, IVORY, HORN_DK, CLAW, BRONZE,
  scaleTex, shine, rimTex,
  basePose, runPose, ctx, over, near, VB, body, legs4, neck, headAxes, membraneWing, segTail, embers, sparks, done,
  actTail, actToss, bump, win, easeInOut,
  type V3, type Mat, type TexFn, type Pose, type Layout, type Ctx, type Frame, type MView, type Built,
} from "./kit";
import type { MountSpec } from "./lib";

interface DrakeOpt { bodyTex?: TexFn; scale: Mat; belly: Mat; wing: Mat; bone: Mat; helm: Mat; helmTrim: Mat; glow: Mat; veins: boolean; id: string; ru: string }
const DL: Layout = { fx: 4.8, hx: 5.0, fy: 11.6, hy: -10.8 };
function drakeBuild(o: DrakeOpt, f: Frame, view: MView): Built {
  let p: Pose;
  const t = f.i / f.n;
  if (f.anim === "run") {
    p = runPose(t, DL, { reach: [6.8, 6.4], lift: [4.6, 3.8], fold: [1.4, 1.2], stance: 0.44, phase: [0.5, 0.6, 0.0, 0.1], bob: 1.4 });
    const fl = Math.sin(TAU * t * 2 + 0.6);
    p.wing = [0, 1].map(() => ({ spread: 0.5 + 0.25 * fl, lift: 0.2 + 0.45 * fl, ruffle: 0 }));
    p.neckP = 0.25; p.tailPh = TAU * t * 2;
  } else {
    p = basePose(DL, t, false);
    // рык: голова вверх, пасть; крылья раскрываются и складываются; хвост хлещет
    actToss(p, t, 2, 10, 1.4);
    p.wing.forEach((w) => { w.lift += 0.25; });
    const ws = win(t, 11 / 24, 20 / 24), we = easeInOut(bump(ws));
    p.wing.forEach((w) => { w.spread += 0.9 * we; w.lift += 0.7 * we + 0.15 * Math.sin(TAU * ws * 2) * we; });
    actTail(p, t, 16, 24, 1.0);
    p.tailPh = TAU * t;
  }
  const c = ctx(f, view, p, [0, 0, 20]);
  const lg = legs4(c, { L: DL, hipZ: [18.4, 19], len: [[8.4, 7.2], [9.8, 8.0]], r: [[3.2, 2.0, 1.4], [3.8, 2.2, 1.5]], foot: "claw", coat: o.scale, footMat: CLAW, tex: o.bodyTex ?? scaleTex(-0.7), layers: true });
  body(c, { z: 20.6, len: 12.4, w: 7.4, h: 6.6, coat: o.scale, tex: o.bodyTex ?? scaleTex(-0.7), rumpOver: true });
  over(c, VB.down, () => c.sc.ell(c.sc.group(1.6), o.belly, c.T([0, 8.0, 17.6]), [6.0, 7.0, 4.6], c.ax(X, Y, Z), { tex: (q) => (q.edge ? 0 : (q.y + 40) % 3 === 0 ? -0.8 : 0) }));
  over(c, VB.down, () => {
    const N = neck(c, [0, 11.6, 24.0], [0, 7.6, 10.4], [5.4, 3.4], o.scale, scaleTex(-0.7), 0.4);
    // шипы по гребню шеи
    for (let k = 0; k < 5; k++) { const q = N.crest(0.1 + k * 0.2); c.sc.cone(c.sc.group(0), HORN_DK, add(q, [0, 0, 0.6]), 0.7, add(q, [0, -1.4, 2.6]), 0.12); }
    const A = headAxes(c, N.poll, N.nd, [0, 0.92, -0.38]);
    const H = A.H, g = c.sc.group(1.2);
    c.sc.ell(g, o.scale, H(1.4, 0.8, 0), [3.4, 3.4, 3.2], [A.s, A.w, A.fv], { tex: scaleTex(-0.6) });
    c.sc.cone(g, o.scale, H(3.0, 0.6, 0), 2.4, H(7.6, -0.2, 0), 1.6, { tex: scaleTex(-0.6) });
    // нижняя челюсть: открывается на рыке; зубы
    const jw = p.jaw;
    const jt = add(H(7.2, -1.6, 0), mul(A.fv, -jw * 3.2));
    c.sc.cone(c.sc.group(0.5), o.scale, H(2.4, -1.4, 0), 2.0, jt, 1.1, { tex: scaleTex(-0.6) });
    if (jw > 0.15) {
      c.sc.cone(c.sc.group(0), M("пасть", R("#1a0408", "#3a0a10", "#5e141a", "#862426", "#ac3a36"), 2.0, 2.0), H(3.4, -0.8, 0), 1.4, lerpV(H(7.0, -0.8, 0), jt, 0.4), 0.8);
      for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), IVORY, H(4 + k * 0.9, -0.6, sx * 1.1), 0.25, H(4 + k * 0.9, -1.4 - jw, sx * 1.1), 0.08);
    }
    // рога назад, шлем
    for (const sx of [-1, 1]) {
      let q = H(0.6, 2.6, sx * 1.8), d = norm(add(mul(A.w, -1), add(mul(A.fv, 0.5), mul(A.s, sx * 0.5))));
      for (let k = 0; k < 4; k++) { const nq = add(q, mul(d, 1.8)); c.sc.cone(c.sc.group(0.2), HORN_DK, q, 1.0 - k * 0.2, nq, 0.8 - k * 0.2, { tex: shine }); q = nq; d = norm(rotAxis(d, A.s, sx * 0.0 + 0.25)); }
    }
    c.sc.ell(c.sc.group(0.3), o.helm, H(2.6, 2.2, 0), [3.0, 3.6, 1.4], [A.s, A.w, A.fv], { tex: rimTex(o.helmTrim, 0.78) });
    for (const sx of [-1, 1]) c.sc.stamps.push({ at: H(3.4, 1.2, sx * 2.6), n: norm(add(mul(A.s, sx), mul(A.w, 0.4))), colors: { E: [140, 230, 255, 255], K: [10, 6, 8, 255] }, glow: ["E"], halo: [140, 230, 255, 255], px: { side: [[0, 0, "E"], [1, 0, "E"]], down: [[0, 0, "E"]] }, depthTol: 2.5 });
    sparks(c, H(0.6, 4.4, -2.6), H(0.6, 4.4, 2.6), o.glow, 3, 4);
  });
  for (const sx of [-1, 1]) membraneWing(c, sx, { root: [sx * 6.0, 6.0, 26.2], bone: o.bone, skin: o.wing, len: 1.45, glowVein: o.veins ? o.glow : undefined });
  const tail = segTail(c, c.T([0, -15.4, 22]), o.scale, { n: 9, seg: 2.8, r0: 2.2, r1: 0.5, droop: 0.9, tex: scaleTex(-0.7), swing: 0.7 });
  over(c, VB.up, () => tail.slice(2).forEach((q, k) => k % 2 === 0 && c.sc.cone(c.sc.group(0), HORN_DK, q, 0.7, add(q, [0, -0.8, 2.4 - k * 0.2]), 0.1)));
  // седло: кожа и бронза, ремни
  const A = c.ax(X, Y, Z), gs = c.sc.group(0.6);
  c.sc.ell(gs, M("тёмная кожа", R("#140c0a", "#26170f", "#3e2618", "#5a3a24", "#7a5636"), 1.9, 2.3), c.T([0, -1.2, 27.4]), [5.6, 5.8, 1.6], A);
  c.sc.box(gs, o.helmTrim, c.T([0, 3.8, 28.8]), [2.2, 0.8, 1.4], A, 0.5, { tex: shine });
  c.sc.box(gs, o.helmTrim, c.T([0, -6.4, 29.4]), [3.4, 0.8, 1.8], c.ax(X, norm([0, 0.9, 0.4]), norm([0, -0.4, 0.9])), 0.5, { tex: shine });
  for (const sx of [-1, 1]) over(c, near(sx), () => c.sc.box(c.sc.group(0.2), M("тёмная кожа", R("#140c0a", "#26170f", "#3e2618", "#5a3a24", "#7a5636"), 1.9, 2.3), c.T([sx * 7.6, -1.0, 23.4]), [0.6, 3.0, 3.6], A, 0.4, { tex: (q) => (Math.abs(q.l[1]) > 2.3 ? { mat: o.helmTrim, d: 0 } : 0) }));
  // свечение: молнии по телу, искры
  if (o.veins) lg.forEach((l, k) => sparks(c, l.hip, l.knee, o.glow, k + 5, 3));
  embers(c, [c.T([0, 0, 28]), ...lg.map((l) => l.knee)], 8, o.glow, 9, 0.55);
  return done(c, [0, -1.2, 28.8]);
}
const veinTex = (glow: Mat): TexFn => (q) => (!q.edge && Math.abs(Math.sin(q.l[0] * 1.2 + q.l[1] * 0.8) + Math.sin(q.l[1] * 0.9 - q.l[2] * 1.1)) < 0.12 ? { mat: glow, d: 0 } : (scaleTex(-0.7)(q) as number));

// ---------------- 09. чёрный грозовой дракен ----------------
export function stormDrakeBlack(): MountSpec {
  const black = M("чёрная чешуя", R("#040408", "#0a0a12", "#14141e", "#20202e", "#303044", "#46465e"), 2.0, 2.6);
  const o: DrakeOpt = {
    id: "storm_drake", ru: "Чёрный грозовой дракен", scale: { ...black } as Mat, belly: M("белое брюхо", R("#3a3e4a", "#626878", "#8e94a6", "#bcc2d2", "#e2e6f0"), 2.2, 2.4),
    wing: M("чёрная перепонка", R("#04040a", "#0a0a14", "#141420", "#1e1e30", "#2c2c44"), 2.0, 2.2), bone: black,
    helm: M("бирюзовый шлем", R("#061a1a", "#0e2e2e", "#184848", "#246666", "#368888", "#58aaaa"), 2.0, 2.8), helmTrim: GOLD, glow: STORM, veins: true,
  };
  return { id: o.id, ru: o.ru, N: 144, GY: 116, scale: 1.3, build: (f, v) => drakeBuild({ ...o, scale: { ...black, name: black.name } as Mat }, f, v) };
}
// ---------------- 10. синий грозовой дракен ----------------
export function stormDrakeBlue(): MountSpec {
  const grey = M("серо-синяя чешуя", R("#0a0e18", "#161e2e", "#283448", "#3e4e66", "#5a6c88", "#8496b2"), 2.0, 2.6);
  const o: DrakeOpt = {
    id: "storm_drake_blue", ru: "Синий грозовой дракен", scale: grey, belly: M("сизое брюхо", R("#1a2638", "#2e4058", "#486080", "#6884a6", "#90aac8"), 2.1, 2.4),
    wing: M("тёмная перепонка", R("#04060e", "#0a1020", "#121c36", "#1c2c50", "#2a406e"), 2.0, 2.2), bone: grey,
    bodyTex: veinTex(SPIRIT), helm: M("красный шлем", R("#1a0606", "#30100e", "#4c1c18", "#6e2c24", "#904034", "#b4604a"), 2.0, 2.8), helmTrim: BRONZE, glow: SPIRIT, veins: true,
  };
  return { id: o.id, ru: o.ru, N: 144, GY: 116, scale: 1.3, build: (f, v) => drakeBuild({ ...o, scale: { ...grey, name: grey.name } as Mat }, f, v) };
}
void veinTex; void cross; void lerp; void Z; void Y;
