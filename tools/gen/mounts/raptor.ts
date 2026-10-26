/**
 * Задача 142: рапторы (22) — двуногие ящеры ниже коня: рыжий в племенной броне (костяной шлем с перьями, пластины на спине)
 * и пурпурный песчаный (полосы, рог на носу, простое седло). Корпус горизонтален, хвост — противовес, ноги пальцеходящие
 * с серповидным когтем, маленькие передние лапы. Бег — длинные шаги по очереди; покой — оглядывается, принюхивается к земле,
 * кричит (пасть), бьёт хвостом.
 */
import {
  add, mul, norm, lerpV, rotAxis, lerp, TAU, R, M, X, Y, Z, ik,
  CLAW, IVORY, BONE_, ROPE, LEATHER, GOLD, BRONZE,
  scaleTex, shine, hairTex,
  basePose, ctx, over, near, VB, headAxes, segTail, saddle, done, embers,
  actLook, actTail, actToss, bump, win, easeInOut,
  type V3, type Mat, type TexFn, type Pose, type Layout, type Frame, type MView, type Built,
} from "./kit";
import type { MountSpec } from "./lib";

const RL: Layout = { fx: 3.6, hx: 3.6, fy: -1.0, hy: -1.0 };
interface RaptorOpt { skin: Mat; belly: Mat; stripe: Mat; tribal: boolean }
function raptorBuild(o: RaptorOpt, f: Frame, view: MView): Built {
  const t = f.i / f.n;
  const p: Pose = basePose(RL, t, f.anim === "run");
  p.legs = [{ foot: [-3.6, -1.0, 0], fold: 0 }, { foot: [3.6, -1.0, 0], fold: 0 }];
  if (f.anim === "run") {
    const w = TAU * t;
    p.legs = [0, 1].map((k) => {
      const u = (t + k * 0.5) % 1;
      const S = 0.5;
      let dy = 0, z = 0, fold = 0;
      if (u < S) dy = 7.4 * (1 - (2 * u) / S);
      else { const s = (u - S) / (1 - S); dy = -7.4 + 14.8 * easeInOut(s); z = 4.6 * Math.sin(Math.PI * s); fold = 1.4 * Math.sin(Math.PI * s); }
      return { foot: [k ? 3.6 : -3.6, -1.0 + dy, z] as V3, fold };
    });
    p.bob = 1.4 * Math.abs(Math.cos(w)) - 0.7; p.pitch = 0.06 * Math.sin(w * 2); p.roll = 0.04 * Math.sin(w);
    p.neckP = 0.25; p.tailPh = w * 2; p.tailWave = 1;
  } else {
    actLook(p, t, 1, 7, 0.7);
    // принюхивается: шея к земле
    const sn = easeInOut(bump(win(t, 8 / 24, 14 / 24)));
    p.neckP += 1.1 * sn; p.headP += 0.4 * sn + 0.08 * Math.sin(t * TAU * 8) * sn;
    actToss(p, t, 15, 21, 1.3);
    actTail(p, t, 0, 24, 0.5);
    p.tailPh = TAU * t;
  }
  const c = ctx(f, view, p, [0, 0, 19]);
  const A0 = c.ax(X, Y, Z);
  // ноги: бедро, голень, плюсна, пальцы с серпом
  for (let i = 0; i < 2; i++) {
    const sx = i ? 1 : -1, L = p.legs[i];
    over(c, VB.down, () => {
      const g = c.sc.group(0.8);
      const hip = c.T([sx * 3.6, -1.6, 17.6]);
      const ank = add(L.foot, rotAxis([0, -2.6, 4.6], X, -L.fold));
      const knee = ik(hip, ank, 8.2, 7.6, [0, 1, 0.2]);
      c.sc.ell(g, o.skin, lerpV(hip, knee, 0.45), [3.0, 4.6, 3.6], [X, norm(add(knee, mul(hip, -1))), Z], { tex: scaleTex(-0.7) });
      c.sc.cone(g, o.skin, knee, 2.0, ank, 1.3, { tex: scaleTex(-0.7) });
      c.sc.cone(g, o.skin, ank, 1.3, add(L.foot, [0, 0, 0.7]), 1.0);
      for (const [dx, len] of [[-0.9, 2.6], [0.9, 2.6]]) {
        const tip = add(L.foot, rotAxis([dx, len, 0.3], X, -L.fold * 0.5));
        c.sc.cone(c.sc.group(0.3), o.skin, add(L.foot, [0, 0, 0.7]), 0.8, tip, 0.6);
        c.sc.cone(c.sc.group(0), CLAW, tip, 0.5, add(tip, rotAxis([0, 0.9, -0.6], X, -L.fold * 0.5)), 0.12, { tex: shine });
      }
      // серповидный коготь
      const sk = add(L.foot, [sx * 0.2, 0.4, 1.4]);
      c.sc.cone(c.sc.group(0), CLAW, sk, 0.6, add(sk, rotAxis([0, 1.6, 1.4], X, -L.fold * 0.5)), 0.12, { tex: shine });
    });
  }
  // корпус
  const gb = c.sc.group(2.4);
  c.sc.ell(gb, o.skin, c.T([0, 0, 20.6]), [5.6, 9.6, 5.6], A0, { tex: stripes(o) });
  over(c, VB.down, () => c.sc.ell(gb, o.belly, c.T([0, 5.6, 18.6]), [4.8, 5.2, 4.6], A0, { tex: scaleTex(-0.6) }));
  // шея и голова
  over(c, VB.down, () => {
    const NB = c.T([0, 7.6, 22.6]);
    const nd = (u: V3): V3 => c.TD(rotAxis(rotAxis(u, X, p.neckP), Z, p.neckY));
    const poll = add(NB, nd([0, 4.4, 7.4]));
    c.sc.cone(c.sc.group(1.6), o.skin, NB, 4.2, poll, 2.6, { tex: stripes(o) });
    const A = headAxes(c, poll, nd, [0, 0.96, -0.28]);
    const H = A.H, g = c.sc.group(1.0);
    c.sc.ell(g, o.skin, H(1.4, 0.6, 0), [2.8, 3.0, 2.6], [A.s, A.w, A.fv], { tex: scaleTex(-0.6) });
    c.sc.cone(g, o.skin, H(2.8, 0.4, 0), 2.1, H(7.2, -0.2, 0), 1.3, { tex: scaleTex(-0.6) });
    const jt = add(H(6.8, -1.3, 0), mul(A.fv, -p.jaw * 2.6));
    c.sc.cone(c.sc.group(0.5), o.belly, H(2.2, -1.0, 0), 1.6, jt, 0.8);
    if (p.jaw > 0.15) for (let k = 0; k < 3; k++) for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), IVORY, H(3.8 + k * 1.0, -0.6, sx * 0.9), 0.22, H(3.8 + k * 1.0, -1.2 - p.jaw, sx * 0.9), 0.08);
    for (const sx of [-1, 1]) c.sc.stamps.push({ at: H(2.6, 1.3, sx * 2.0), n: norm(add(mul(A.s, sx), mul(A.w, 0.3))), colors: { E: o.tribal ? [120, 220, 255, 255] : [255, 210, 60, 255], K: [10, 6, 8, 255] }, glow: o.tribal ? ["E"] : undefined, halo: o.tribal ? [120, 220, 255, 255] : undefined, px: { side: [[0, 0, "E"], [1, 0, "K"]], down: [[0, 0, "E"]] }, depthTol: 2.5 });
    if (o.tribal) {
      // костяной шлем с бивнем и перьями
      c.sc.ell(c.sc.group(0.3), BONE_, H(2.4, 2.0, 0), [3.0, 3.4, 1.4], [A.s, A.w, A.fv], { tex: (q) => (q.edge ? 0 : (q.x + q.y) % 4 === 0 ? -1 : 0) });
      c.sc.cone(c.sc.group(0), IVORY, H(4.4, 2.6, 0), 0.7, add(H(4.4, 2.6, 0), add(mul(A.fv, 2.6), mul(A.w, 0.6))), 0.15, { tex: shine });
      for (let k = 0; k < 4; k++) c.sc.ell(c.sc.group(0), k % 2 ? M("зелёное перо", R("#0a1a10", "#14301c", "#22482c", "#346a40", "#4e8c58"), 2.0, 2.3) : M("тёмное перо", R("#06080a", "#101418", "#1c2228", "#2c343c", "#404a54"), 2.0, 2.3), add(H(-0.4, 2.4, (k - 1.5) * 0.9), add(mul(A.w, -2.6), mul(A.fv, 1.6))), [0.4, 2.8, 0.9], [A.s, norm(add(mul(A.w, -1), mul(A.fv, 0.6))), A.fv], { big: false, tex: hairTex });
    } else {
      c.sc.cone(c.sc.group(0), M("тёмный рог", R("#0a0810", "#1a1622", "#2e2838", "#463e52", "#625874"), 1.9, 2.6), H(5.4, 1.6, 0), 0.7, add(H(5.4, 1.6, 0), add(mul(A.fv, 2.2), mul(A.w, -0.8))), 0.12, { tex: shine });
      for (let k = 0; k < 5; k++) c.sc.cone(c.sc.group(0), o.stripe, H(0.4 - k * 0.6, 2.6, 0), 0.5, H(-0.2 - k * 0.6, 3.6, 0), 0.12);
    }
    // ручки
    for (const sx of [-1, 1]) {
      const sh = add(NB, c.TD([sx * 3.0, -0.4, -2.4]));
      const el = add(sh, c.TD([sx * 0.6, 1.8, -2.2]));
      c.sc.cone(c.sc.group(0.4), o.skin, sh, 1.0, el, 0.7);
      c.sc.cone(c.sc.group(0.2), o.skin, el, 0.7, add(el, c.TD([0, 1.8, 0.4])), 0.4);
    }
  });
  // хвост: длинный противовес; гребень полосой
  const tail = segTail(c, c.T([0, -8.4, 21.4]), o.skin, { n: 9, seg: 2.7, r0: 3.0, r1: 0.35, droop: 0.15, lift: 0.08, tex: stripes(o), swing: 0.6 });
  // седло, броня
  saddle(c, { y: -0.4, z: 26.0, w: 4.8, len: 4.8, leather: o.tribal ? M("тёмная кожа", R("#140c0a", "#26170f", "#3e2618", "#5a3a24", "#7a5636"), 1.9, 2.3) : LEATHER, trim: o.tribal ? BONE_ : BRONZE, flapX: 6.2, flapZ: 22.6 });
  if (o.tribal) {
    for (let k = 0; k < 4; k++) over(c, k < 2 ? VB.up : 0, () => c.sc.ell(c.sc.group(0.2), BONE_, c.T([0, -5.6 + k * 0 - k * 1.8 + 3.4, 25.4 - k * 0.2]), [4.6, 1.2, 0.8], A0, { tex: (q) => (q.edge ? 0 : (q.x % 3 === 0 ? -0.8 : 0)) }));
    for (const sx of [-1, 1]) over(c, near(sx), () => c.sc.ell(c.sc.group(0.2), M("кованая бляха", R("#0e0a08", "#1e1612", "#32261e", "#4a3a2e", "#665240"), 1.9, 2.8), c.T([sx * 5.6, 3.6, 19.4]), [0.7, 3.0, 3.2], A0, { tex: (q) => (q.edge ? 0 : q.lum > 0.7 ? 1 : 0) }));
    over(c, VB.up, () => tail.slice(1, 5).forEach((q) => c.sc.ell(c.sc.group(0), BONE_, add(q, [0, 0, 1.6]), [1.8, 1.0, 0.6], A0)));
  } else {
    for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), ROPE, c.T([sx * 5.4, 1.4, 25]), 0.5, c.T([sx * 4.6, 1.8, 16]), 0.5);
    embers(c, [], 0, GOLD, 1);
  }
  return done(c, [0, -0.4, 27.4]);
}
const stripes = (o: RaptorOpt): TexFn => (q) => (q.edge ? 0 : Math.abs(Math.sin(q.l[1] * 1.1 + q.l[2] * 0.4)) < 0.22 && q.l[2] > -1 ? { mat: o.stripe, d: 0 } : (scaleTex(-0.6)(q) as number));
export function raptor(): MountSpec {
  const o: RaptorOpt = {
    skin: M("рыжая чешуя", R("#1e0804", "#3c1208", "#66200c", "#923414", "#bc4e20", "#e07a3a"), 2.1, 2.5),
    belly: M("светлое брюхо", R("#3a2410", "#5e3e1e", "#86602e", "#ae8648", "#d2ac68"), 2.1, 2.4),
    stripe: M("тёмные полосы", R("#080404", "#140808", "#220e0c", "#341612", "#4a201a"), 1.9, 2.3), tribal: true,
  };
  return { id: "raptor", ru: "Рыжий раптор", N: 120, GY: 98, scale: 1.1, build: (f, v) => raptorBuild(o, f, v) };
}
export function raptorSand(): MountSpec {
  const o: RaptorOpt = {
    skin: M("пурпурная чешуя", R("#1a0414", "#320a26", "#561440", "#7e225e", "#a6347c", "#cc5a9c"), 2.1, 2.5),
    belly: M("розовое брюхо", R("#3a1a26", "#5e2e40", "#86465c", "#ae627c", "#d28aa0"), 2.1, 2.4),
    stripe: M("синие полосы", R("#060818", "#0c1430", "#14224e", "#20367a", "#3452a8"), 2.0, 2.3), tribal: false,
  };
  return { id: "raptor_sand", ru: "Пурпурный раптор", N: 120, GY: 98, scale: 1.1, build: (f, v) => raptorBuild(o, f, v) };
}
void Y; void lerp; void GOLD;
