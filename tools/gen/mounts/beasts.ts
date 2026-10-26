/**
 * Задача 142: звери по референсам tools/out/refs/mounts — рогатый як (08), духовный лось (15), огненная гиена в броне (23),
 * боевой носорог со знаменем (24, герб), боевой слон (18, герб), вьючный мамонт (19), крылатый лис-нетопырь (01).
 * Пропорции между собой (scale и каркас): слон и мамонт крупные, носорог приземистый и широкий, як и лось — с коня,
 * гиена и лис ниже коня. Поведение в покое — своё у каждого.
 */
import {
  add, sub, mul, norm, lerpV, rot, rotAxis, cross, lerp, TAU, hash01, hex, R, M, G, X, Y, Z, vlen,
  FIRE, FIRE_DEEP, SPIRIT, GOLD, STEEL, IRON, BRONZE, LEATHER, ROPE, HOOF, CLAW, IVORY, HORN_DK, GEM_AZ, GEM_RED,
  hairTex, furTex, shagTex, scaleTex, shine, rimTex, runeTex, flameTex,
  basePose, runPose, ctx, over, near, VB, body, legs4, neck, headAxes, eyes, mane, hairTail, segTail, saddle, caparison,
  emblem, facKit, membraneWing, embers, flames, done, scaleFrom,
  actPaw, actShake, actGraze, actToss, actTail, actEar, actLook, bump, win, shake, easeInOut,
  type V3, type Mat, type TexFn, type Pose, type Layout, type Ctx, type Fac, type Frame, type MView, type Built, type LegOpt, type BodyOpt, type GaitOpt,
} from "./kit";
import type { MountSpec } from "./lib";

interface BeastCfg {
  L: Layout;
  legs: Omit<LegOpt, "L" | "coat"> & { coat?: Mat };
  body: Omit<BodyOpt, "coat"> & { coat?: Mat };
  coat: Mat;
  gait?: GaitOpt & { bob?: number; pitch?: number };
  piv?: V3;
  idle: (p: Pose, u: number) => void;
  /** шея и голова (поверх всадника при взгляде вниз) */
  head: (c: Ctx) => void;
  tail: (c: Ctx) => V3[];
  deco: (c: Ctx, lg: ReturnType<typeof legs4>, tail: V3[]) => void;
  seat: V3;
  banner?: (c: Ctx) => Omit<NonNullable<Built["banner"]>, "t" | "run">;
}
function beastBuild(cfg: BeastCfg, f: Frame, view: MView): Built {
  let p: Pose;
  if (f.anim === "run") p = runPose(f.i / f.n, cfg.L, cfg.gait ?? {});
  else { p = basePose(cfg.L, f.i / f.n, false); cfg.idle(p, f.i / f.n); }
  const c = ctx(f, view, p, cfg.piv ?? [0, 0, cfg.body.z]);
  const lg = legs4(c, { ...cfg.legs, L: cfg.L, coat: cfg.legs.coat ?? cfg.coat } as LegOpt);
  body(c, { ...cfg.body, coat: cfg.body.coat ?? cfg.coat, rumpOver: true } as BodyOpt);
  over(c, VB.down, () => cfg.head(c));
  const tail = cfg.tail(c);
  cfg.deco(c, lg, tail);
  return done(c, cfg.seat, cfg.banner?.(c));
}
const spec = (id: string, ru: string, cfg: BeastCfg, scale: number, N: number, GY: number, fly = 0): MountSpec => ({ id, ru, N, GY, scale, fly, build: (f, v) => beastBuild(cfg, f, v) });
void hex; void hash01; void TAU; void rot; void cross; void G; void HOOF; void STEEL; void sub; void vlen; void LEATHER;

/** Изогнутый рог цепочкой: от точки, направление d, изгиб bend (поворот вокруг оси ax за шаг). */
function horn(c: Ctx, m: Mat, at: V3, d: V3, ax: V3, n: number, seg: number, r0: number, bend: number, tex?: TexFn) {
  let q = at, dir = norm(d);
  const pts = [q];
  for (let k = 0; k < n; k++) {
    const nq = add(q, mul(dir, seg));
    c.sc.cone(c.sc.group(0.2), m, q, lerp(r0, 0.2, k / n), nq, lerp(r0, 0.2, (k + 1) / n), { tex: tex ?? shine });
    q = nq; dir = norm(rotAxis(dir, ax, bend)); pts.push(q);
  }
  return pts;
}

// ---------------- 08. рогатый як (обычный) ----------------
export function yak(): MountSpec {
  const L: Layout = { fx: 4.6, hx: 4.8, fy: 11.4, hy: -10.6 };
  const wool = M("белая шерсть", R("#4a4650", "#76727e", "#a29eaa", "#c8c4d0", "#e6e4ec", "#fafaff"), 2.2, 2.4);
  const dark = M("тёмная шкура", R("#0a0a10", "#16161e", "#262632", "#3a3a4a", "#525266"), 1.9, 2.3);
  const face = M("алая морда", R("#3a0608", "#600c10", "#8e1a1c", "#b8302c", "#d8584a"), 2.0, 2.4);
  const scl = M("зелёная чешуя доспеха", R("#0a1412", "#14241e", "#22382e", "#344e40", "#4c6a56", "#6a8a72"), 2.0, 2.7);
  const antler = M("рог", R("#3a2a10", "#6a5020", "#9a7a3a", "#c4a45a", "#e4cc84"), 2.1, 2.5);
  return spec("yak", "Рогатый як", {
    L, coat: wool, piv: [0, 0, 21],
    legs: { hipZ: [18, 19], len: [[8.6, 6.8], [10.4, 7.6]], r: [[3.8, 2.4, 1.9], [4.0, 2.3, 1.8]], foot: "hoof", coatDk: { ...wool, base: 1.9 } as Mat, lower: dark, feather: wool, tex: shagTex, layers: true },
    body: { z: 21, len: 12.2, w: 8.8, h: 7.6, tex: shagTex, hump: [6.5, 6.4, 5.4] },
    idle: (p, u) => { actShake(p, u, 2, 9, 1.0); actPaw(p, L, u, 10, 18, 0); actLook(p, u, 18, 24, 0.5); actTail(p, u, 6, 12, 0.6); },
    head: (c) => {
      const N = neck(c, [0, 11.6, 23.4], [0, 6.4, 5.0], [6.4, 4.6], wool, shagTex, 0.5);
      const i0 = c.sc.prims.length, s0 = c.sc.stamps.length;
      const A = headAxes(c, N.poll, N.nd, [0, 0.8, -0.6]);
      const H = A.H, g = c.sc.group(1.2);
      c.sc.ell(g, wool, H(1.6, 0.6, 0), [4.2, 3.8, 4.0], [A.s, A.fv, A.w], { tex: shagTex });
      c.sc.ell(g, face, H(5.0, -0.6, 0), [2.6, 2.4, 2.6], [A.s, A.fv, A.w]);
      c.sc.ell(c.sc.group(0.6), wool, H(3.4, -3.0, 0), [2.6, 2.2, 3.2], [A.s, A.fv, A.w], { tex: hairTex }); // борода
      eyes(c, A, H(3.0, 1.4, 0), 2.4, "#8acce8");
      // кольцо в носу, рога-ветви
      c.sc.cone(c.sc.group(0), STEEL, H(6.6, -1.6, -1.0), 0.35, H(6.6, -1.6, 1.0), 0.35, { tex: shine });
      for (const sx of [-1, 1]) {
        const pts = horn(c, antler, H(0.4, 3.0, sx * 2.0), add(mul(A.fv, 1), add(mul(A.s, sx * 0.4), mul(A.w, -0.3))), A.w, 4, 1.8, 1.1, -0.18);
        horn(c, antler, pts[2], add(mul(A.w, 0.6), mul(A.fv, 0.6)), A.s, 2, 1.4, 0.6, 0.1);
      }
      scaleFrom(c, i0, s0, N.poll, 1.3);
    },
    tail: (c) => hairTail(c, c.T([0, -15.6, 25.0]), wool, { n: 6, seg: 2.6 }),
    deco: (c) => {
      const A = c.ax(X, Y, Z);
      // чешуйчатый доспех на крупе, седло с бляхами, щит с шипом на плече
      over(c, VB.up, () => c.sc.ell(c.sc.group(0.4), scl, c.T([0, -9.6, 25.4]), [9.6, 6.6, 4.4], A, { tex: scaleTex(-0.9) }));
      saddle(c, { y: -0.4, z: 30.0, w: 6.4, leather: M("тёмная кожа", R("#140c0a", "#26170f", "#3e2618", "#5a3a24", "#7a5636"), 1.9, 2.3), trim: BRONZE, flapX: 9.4, pad: scl });
      for (const sx of [-1, 1]) {
        const sh = c.T([sx * 9.8, 9.4, 22.6]);
        c.sc.ell(c.sc.group(0), scl, sh, [0.9, 3.6, 3.6], A, { tex: rimTex(BRONZE, 0.8) });
        c.sc.cone(c.sc.group(0), BRONZE, add(sh, [sx * 0.8, 0, 0]), 0.9, add(sh, [sx * 4.2, 1.6, 0]), 0.12, { tex: shine });
      }
    },
    seat: [0, -0.4, 31.4],
  }, 1.12, 120, 98);
}

// ---------------- 15. духовный лось (эпический) ----------------
export function spiritElk(): MountSpec {
  const L: Layout = { fx: 4.2, hx: 4.6, fy: 12.0, hy: -11.4 };
  const fur = M("бурая шерсть", R("#140a06", "#2a160c", "#4a2a16", "#6c4222", "#905c32", "#b47a48"), 2.0, 2.5);
  const dark = M("тёмная грива", R("#06060a", "#100e16", "#1e1a28", "#30283e", "#463a58"), 2.0, 2.4);
  const antlerM = M("старая кость рогов", R("#1a140a", "#2e2412", "#4a3a1e", "#6a542c", "#8e7440", "#b49458"), 2.0, 2.6);
  const strap = M("зелёные ремни", R("#06100e", "#0e2420", "#163a34", "#22584e", "#38786a"), 1.9, 2.3);
  return spec("spirit_elk", "Духовный лось", {
    L, coat: fur, piv: [0, 0, 23],
    legs: { hipZ: [20.6, 21.6], len: [[10.0, 7.8], [12.0, 8.6]], r: [[3.2, 1.9, 1.5], [3.6, 1.9, 1.5]], foot: "hoof", tex: furTex(0.1), layers: true },
    body: { z: 23.4, len: 12.6, w: 7.6, h: 7.2, tex: furTex(0.1), hump: [7.6, 5.6, 4.4] },
    idle: (p, u) => { actGraze(p, u, 2, 10, 1.6); actToss(p, u, 12, 18, 0.9); actLook(p, u, 18, 24, 0.4); actEar(p, u, 10, 12); },
    head: (c) => {
      const N = neck(c, [0, 12.4, 27.0], [0, 7.0, 8.6], [5.4, 3.4], fur, furTex(0.1));
      // длинная тёмная «борода» под шеей
      for (let k = 0; k < 5; k++) {
        const q = lerpV(add(N.NB, c.TD([0, 3, -3])), add(N.poll, c.TD([0, 0, -2.4])), k / 4);
        c.sc.cone(c.sc.group(0.6), dark, q, 1.6, add(q, [Math.sin(c.t * TAU + k) * 0.3, -0.6, -3.6]), 0.4, { tex: hairTex });
      }
      const A = headAxes(c, N.poll, N.nd, [0, 0.72, -0.7]);
      const H = A.H, g = c.sc.group(1.3);
      c.sc.ell(g, fur, H(2.0, 0.4, 0), [2.8, 2.8, 3.4], [A.s, A.fv, A.w]);
      c.sc.cone(g, fur, H(4.2, 0, 0), 2.4, H(9.6, -0.6, 0), 2.2);
      c.sc.ell(g, dark, H(10.0, -0.8, 0), [2.4, 2.4, 2.0], [A.s, A.fv, A.w]);
      eyes(c, A, H(2.6, 0.8, 0), 2.5, "#7ff0ff", true);
      c.sc.cone(c.sc.group(0), STEEL, H(10.2, -2.0, -1.2), 0.4, H(10.2, -2.0, 1.2), 0.4, { tex: shine });
      for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0.3), fur, H(0, 0.4, sx * 2.6), 0.8, H(-0.6, -0.4, sx * 5.0), 0.3);
      // рога-лопаты со светящимися рунами и отростками; от правого — духовный шлейф
      for (const sx of [-1, 1]) {
        const b0 = H(0.2, 2.6, sx * 1.8);
        const beam = horn(c, antlerM, b0, add(mul(A.s, sx * 1.2), add(mul(A.fv, 0.9), mul(A.w, -0.6))), A.w, 3, 2.0, 1.1, sx * 0.0);
        const e1 = norm(add(mul(A.s, sx * 0.75), mul(A.w, -0.75))), e2 = norm(add(mul(A.fv, 1), mul(A.w, -0.2)));
        const pc = add(beam[3], add(mul(e1, 4.8), mul(e2, 2.6)));
        c.sc.ell(c.sc.group(0.4), antlerM, pc, [7.4, 5.0, 0.9], [e1, e2, norm(cross(e1, e2))], { tex: runeTex(SPIRIT, 2.8, 0.3) });
        for (let k = 0; k < 5; k++) {
          const a = -0.9 + k * 0.45;
          const d = norm(add(mul(e1, Math.sin(a) + 0.4), mul(e2, Math.cos(a))));
          const t0 = add(pc, mul(d, 4.6));
          c.sc.cone(c.sc.group(0), antlerM, t0, 0.6, add(t0, mul(d, 2.6)), 0.15);
        }
        if (sx > 0) {
          const tip = add(pc, mul(e2, 3.6));
          for (let k = 0; k < 4; k++) {
            const q0 = add(tip, [Math.sin(c.t * TAU + k) * 0.6, -k * 2.4 - (c.p.run ? k * 1.2 : 0), k * 0.7]);
            const q1 = add(tip, [Math.sin(c.t * TAU + k + 1) * 0.6, -(k + 1) * 2.4 - (c.p.run ? (k + 1) * 1.2 : 0), (k + 1) * 0.7]);
            c.sc.cone(c.sc.group(0.5), SPIRIT, q0, 1.1 - k * 0.22, q1, 0.9 - k * 0.22, { big: false, tex: flameTex(k / 4, (k + 1) / 4, c.f.i) });
          }
        }
      }
    },
    tail: (c) => hairTail(c, c.T([0, -16, 27]), dark, { n: 4, seg: 2.2, r: [1.8, 2.0, 1.6, 1.0, 0.6] }),
    deco: (c, lg) => {
      const A = c.ax(X, Y, Z);
      // плащ-накидка, ремни с бронзовыми гайками, седло; духовные искры
      c.sc.box(c.sc.group(0.4), dark, c.T([0, 4.0, 28.2]), [8.4, 6.4, 1.8], A, 1.6, { tex: hairTex });
      saddle(c, { y: -2.6, z: 31.0, w: 5.8, leather: M("оливковая подушка", R("#14140a", "#262612", "#3e3e1e", "#5a5a2e", "#7a7a44"), 1.9, 2.3), trim: BRONZE, flapX: 8.8 });
      for (const sx of [-1, 1]) for (const y of [-8, 2, 9]) c.sc.ball(c.sc.group(0), BRONZE, c.T([sx * 8.4, y, 21.4]), 0.9, { tex: shine });
      for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), strap, c.T([sx * 8.2, 10, 24]), 0.6, c.T([sx * 8.2, -10, 24]), 0.6);
      embers(c, [c.T([4, 14, 44]), c.T([-4, 14, 44]), ...lg.map((l) => l.fet)], 9, SPIRIT, 10, 0.6);
    },
    seat: [0, -2.6, 32.4],
  }, 1.15, 136, 104);
}

// ---------------- 23. огненная гиена в броне (необычный: тлеющий гребень) ----------------
export function flameHyena(): MountSpec {
  const L: Layout = { fx: 4.0, hx: 4.0, fy: 10.2, hy: -9.8 };
  const fur = M("бурая пятнистая", R("#14060a", "#2a0c12", "#4a1a1a", "#6c2a22", "#8e3e2c", "#b05a3a"), 2.0, 2.5);
  const spots: TexFn = (q) => (q.edge ? 0 : hash01(Math.floor(q.l[0] * 0.7 + 30), Math.floor(q.l[1] * 0.7 + 30) * 5 + Math.floor(q.l[2] * 0.7), 9) < 0.18 ? -0.9 : 0);
  return spec("flame_hyena", "Огненная гиена", {
    L, coat: fur, piv: [0, 0, 19], gait: { reach: [6.4, 6.0], lift: [4.6, 3.8] },
    legs: { hipZ: [17.6, 15.4], len: [[8.8, 6.6], [8.4, 6.4]], r: [[3.2, 1.9, 1.5], [3.4, 1.9, 1.5]], foot: "paw", tex: spots, layers: true, boot: { metal: IRON, trim: FIRE_DEEP } },
    body: { z: 19, len: 11, w: 7.2, h: 6.6, tex: spots, chest: [8.6, [7.0, 6.6, 7.4]], rump: [-8.4, [6.4, 5.8, 5.6]] },
    idle: (p, u) => { actGraze(p, u, 2, 9, 1.0); actToss(p, u, 11, 17, 1.2); actShake(p, u, 18, 24, 0.7); },
    head: (c) => {
      const N = neck(c, [0, 10.6, 22.4], [0, 6.0, 5.0], [5.6, 3.8], fur, spots);
      mane(c, N.crest, FIRE, { glow: true, up: 4.2, r: 1.1, n: 8, len: 1.1 });
      const A = headAxes(c, N.poll, N.nd, [0, 0.9, -0.42]);
      const H = A.H, g = c.sc.group(1.2);
      c.sc.ell(g, fur, H(1.6, 0.6, 0), [3.4, 3.0, 3.2], [A.s, A.fv, A.w]);
      c.sc.cone(g, fur, H(3.4, 0.2, 0), 2.4, H(7.4, -0.6, 0), 1.6);
      c.sc.ell(c.sc.group(0), M("тёмный нос", R("#060406", "#100a0c", "#1e1416", "#2e2024", "#40303a"), 1.9, 2.3), H(7.8, -0.4, 0), [1.0, 0.9, 0.8], [A.s, A.fv, A.w]);
      // челюсть: открывается на рыке
      const jw = c.p.jaw;
      c.sc.cone(c.sc.group(0.6), fur, H(3.2, -1.6, 0), 1.8, add(H(6.8, -2.0, 0), mul(A.fv, -jw * 2.4)), 1.0);
      if (jw > 0.1) for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), IVORY, H(6.6, -0.8, sx * 0.8), 0.3, add(H(6.6, -1.6, sx * 0.8), mul(A.fv, -jw)), 0.1);
      for (const sx of [-1, 1]) c.sc.ell(c.sc.group(0.3), fur, H(-0.4, 2.4, sx * 2.4), [1.4, 0.6, 1.8], [A.s, A.fv, A.w]);
      eyes(c, A, H(2.6, 1.2, 0), 2.2, "#ffb03a", true);
      // железный намордник-шлем
      c.sc.box(c.sc.group(0.3), IRON, H(3.4, 1.6, 0), [2.6, 0.7, 2.6], [A.s, A.fv, A.w], 0.5, { tex: rimTex(FIRE_DEEP, 0.85) });
    },
    tail: (c) => {
      const pts = segTail(c, c.T([0, -13.4, 21]), fur, { n: 5, seg: 2.2, r0: 1.0, r1: 0.6, droop: 1.6, tex: spots });
      flames(c, pts.slice(-2), FIRE, { len: 2.4, r: 1.0, back: 1.2, layer: VB.up });
      return pts;
    },
    deco: (c) => {
      const A = c.ax(X, Y, Z);
      // щит с ликом на боку, поножи, цепной ошейник, седло
      for (const sx of [-1, 1]) {
        const sh = c.T([sx * 8.6, 1.0, 20.4]);
        c.sc.box(c.sc.group(0.3), IRON, sh, [0.8, 4.6, 5.2], A, 1.2, { tex: rimTex(FIRE_DEEP, 0.86) });
        c.sc.ell(c.sc.group(0), M("лик", R("#0a0a10", "#1a1a24", "#2c2c3c", "#444458", "#626278"), 2.0, 2.6), add(sh, [sx * 0.8, 0, 0.2]), [0.5, 2.6, 3.2], A, { tex: (q) => (q.edge ? 0 : Math.abs(q.l[1]) < 0.5 || (Math.abs(q.l[2] - 0.8) < 0.4 && Math.abs(q.l[1]) > 0.8) ? { mat: FIRE, d: 0 } : 0) });
      }
      for (let k = 0; k < 7; k++) c.sc.ball(c.sc.group(0), IRON, c.T([Math.sin((k / 6) * Math.PI - Math.PI / 2) * 6.4, 13.6 - Math.abs(k - 3) * 0.8, 21.4 + Math.cos((k / 6) * Math.PI - Math.PI / 2) * 1]), 0.8, { tex: shine });
      saddle(c, { y: -1.0, z: 26.4, w: 5.6, leather: M("бурая кожа", R("#1a0c08", "#2e160e", "#4a2618", "#6a3a24", "#8c5236"), 1.9, 2.3), trim: IRON, flapX: 8.0 });
      embers(c, [c.T([0, 12, 28]), c.T([0, 6, 27])], 8, FIRE, 10, 0.6);
    },
    seat: [0, -1.0, 27.8],
  }, 1.1, 120, 98);
}

// ---------------- 24. боевой носорог со знаменем (редкий, герб) ----------------
export function warRhino(fac: Fac): MountSpec {
  const K = facKit(fac);
  const L: Layout = { fx: 5.6, hx: 5.8, fy: 11.4, hy: -10.4 };
  const hide = M("шкура носорога", R("#0a0e0a", "#141c16", "#222e24", "#344436", "#4a5c4a", "#667a62"), 2.0, 2.6);
  const plateM = fac === "solgard" ? STEEL : IRON;
  return spec("war_rhino", "Боевой носорог со знаменем", {
    L, coat: hide, piv: [0, 0, 19], gait: { reach: [5.6, 5.2], lift: [3.8, 3.0], bob: 1.0 },
    legs: { hipZ: [16, 16.6], len: [[7.4, 6.2], [8.0, 6.6]], r: [[4.4, 3.0, 2.6], [4.6, 3.0, 2.6]], foot: "pad", footMat: CLAW, tex: scaleTex(-0.6), layers: true, footK: 1.2 },
    body: { z: 19.6, len: 12.6, w: 10.6, h: 8.6, tex: scaleTex(-0.6), hump: [6.0, 6.8, 5.6] },
    idle: (p, u) => { actPaw(p, L, u, 2, 11, 1); actToss(p, u, 13, 19, 1.0); actTail(p, u, 18, 24, 0.6); },
    head: (c) => {
      const N = neck(c, [0, 12.6, 21.4], [0, 5.4, 1.6], [7.0, 5.6], hide, scaleTex(-0.6), 0.3);
      const A = headAxes(c, N.poll, N.nd, [0, 0.9, -0.4]);
      const H = A.H, g = c.sc.group(1.4);
      c.sc.ell(g, hide, H(2.0, 0.4, 0), [4.6, 4.2, 4.4], [A.s, A.fv, A.w], { tex: scaleTex(-0.6) });
      c.sc.cone(g, hide, H(4.0, -0.2, 0), 3.6, H(8.6, -1.2, 0), 2.8);
      eyes(c, A, H(3.2, 1.6, 0), 3.2, "#ffd040", true);
      for (const sx of [-1, 1]) c.sc.ell(c.sc.group(0.3), hide, H(0, 3.4, sx * 3.2), [1.2, 0.8, 2.0], [A.s, A.fv, A.w]);
      // рога: большой на носу и малый, бивни, налобник с гербом
      horn(c, IVORY, H(8.2, 1.4, 0), add(mul(A.fv, 1.4), mul(A.w, 0.4)), A.s, 4, 2.0, 1.8, -0.22);
      horn(c, IVORY, H(5.6, 2.6, 0), add(mul(A.fv, 1.4), mul(A.w, -0.2)), A.s, 3, 1.4, 1.1, -0.2);
      for (const sx of [-1, 1]) horn(c, IVORY, H(7.0, -2.6, sx * 2.6), add(mul(A.s, sx * 0.6), add(mul(A.w, 0.8), mul(A.fv, 0.4))), A.w, 3, 1.6, 1.0, 0.2);
      c.sc.box(c.sc.group(0.3), plateM, H(3.0, 3.2, 0), [3.4, 0.8, 3.2], [A.s, A.fv, A.w], 0.8, { tex: rimTex(K.trim, 0.82) });
      emblem(c, fac, H(3.0, 4.0, 0), add(mul(A.fv, 0.4), mul(A.w, 1)), "down");
    },
    tail: (c) => segTail(c, c.T([0, -16.0, 22.0]), hide, { n: 4, seg: 2.0, r0: 1.0, r1: 0.5, droop: 1.6 }),
    deco: (c) => {
      const A = c.ax(X, Y, Z);
      // латы со шипами, гербы на боках, седло, гнездо знамени
      c.sc.box(c.sc.group(0.4), plateM, c.T([0, 0.6, 27.2]), [10.0, 10.6, 2.4], A, 2.2, { tex: rimTex(K.trim, 0.86) });
      for (const sx of [-1, 1]) {
        c.sc.ell(c.sc.group(0.4), plateM, c.T([sx * 10.6, 9.0, 21.6]), [1.8, 4.6, 5.0], A, { tex: rimTex(K.trim, 0.8) });
        emblem(c, fac, c.T([sx * 12.2, 9.0, 21.8]), c.TD([sx, 0, 0]), "side");
        for (let k = 0; k < 3; k++) c.sc.cone(c.sc.group(0), K.trim, c.T([sx * 9.8, -6 + k * 5, 28.6]), 0.9, c.T([sx * 11.6, -6.6 + k * 5, 32.0]), 0.12, { tex: shine });
      }
      over(c, VB.up, () => {
        c.sc.ell(c.sc.group(0.4), plateM, c.T([0, -12.6, 24.0]), [9.6, 2.4, 5.6], c.ax(X, norm([0, 1, 0.3]), norm([0, -0.3, 1])), { tex: rimTex(K.trim, 0.8) });
        emblem(c, fac, c.T([0, -15.0, 24.0]), c.TD([0, -1, 0]), "up");
      });
      saddle(c, { y: -0.6, z: 30.4, w: 6.2, leather: K.cloth, trim: K.trim, flapX: 11.0 });
    },
    seat: [0, -0.6, 31.8],
    banner: (c) => ({ fac, base: c.T([3.8, -8.2, 31.0]), top: c.T([3.8, -8.2, 56]), hang: { down: -1, up: 1, side: -1, left: 1 } }),
  }, 1.18, 128, 104);
}

// ---------------- слон и мамонт: общий каркас ----------------
interface ElephantOpt { skin: Mat; tex?: TexFn; tuskLen: number; tuskCurl: number; ears: number; shag?: Mat; deco: (c: Ctx, lg: ReturnType<typeof legs4>) => void; headDeco?: (c: Ctx, A: ReturnType<typeof headAxes>) => void; seat: V3 }
function elephantCfg(o: ElephantOpt, L: Layout): BeastCfg {
  return {
    L, coat: o.skin, piv: [0, 0, 26], gait: { reach: [5.4, 5.2], lift: [3.6, 3.2], fold: [1.0, 0.8], phase: [0.5, 0.0, 0.75, 0.25], stance: 0.55, bob: 0.8, pitch: 0.03 },
    legs: { hipZ: [21, 22], len: [[11.0, 9.6], [11.6, 9.4]], r: [[4.8, 3.8, 3.4], [5.0, 3.8, 3.4]], foot: "pad", footMat: IVORY, tex: o.tex, layers: true, footK: 1.3 },
    body: { z: 27.4, len: 14.4, w: 10.6, h: 10.2, tex: o.tex, hump: [4.0, 9.0, 6.4] },
    idle: (p, u) => {
      // хобот: вверх и трубит, качание; уши хлопают; вес с ноги на ногу
      const tr = win(u, 3 / 24, 12 / 24);
      p.a.trunkUp = easeInOut(bump(tr));
      p.a.trunkSw = Math.sin(TAU * u) * 0.35;
      p.a.ear = Math.sin(TAU * u * 2) * 0.25 + 0.45 * shake(win(u, 14 / 24, 22 / 24), 3);
      p.neckP -= 0.12 * bump(tr);
      p.jaw += 0.5 * bump(win(u, 6 / 24, 11 / 24));
      actTail(p, u, 15, 21, 0.7);
    },
    head: (c) => {
      const N = neck(c, [0, 13.6, 30], [0, 4.6, 2.4], [8.6, 7.4], o.skin, o.tex, 0.4);
      const A = headAxes(c, N.poll, N.nd, [0, 0.55, -0.83]);
      const H = A.H, g = c.sc.group(1.6);
      c.sc.ell(g, o.skin, H(1.0, 1.8, 0), [5.6, 5.2, 5.6], [A.s, A.fv, A.w], { tex: o.tex });
      if (o.shag) c.sc.ell(c.sc.group(0.8), o.shag, H(-1.6, 4.6, 0), [4.6, 3.2, 3.2], [A.s, A.fv, A.w], { tex: hairTex });
      // уши: большие плоские
      const ea = c.p.a.ear ?? 0;
      for (const sx of [-1, 1]) {
        const e0 = H(1.0, 0.6, sx * 4.6);
        const en = norm(add(mul(A.s, sx * Math.cos(ea * 0.9)), mul(A.fv, -Math.sin(ea * 0.9) * 0.6)));
        const ew = norm(cross(en, A.w));
        c.sc.ell(c.sc.group(0.3), o.skin, add(e0, add(mul(ew, sx * -1.6), mul(A.w, 1.4))), [o.ears, o.ears * 1.2, 0.6], [ew, A.w, en], { tex: o.tex });
      }
      eyes(c, A, H(2.4, 2.4, 0), 4.0, "#1a1010");
      // хобот цепочкой: вниз, на покое качается, может подняться
      const up = c.p.a.trunkUp ?? 0, sw = c.p.a.trunkSw ?? 0;
      let q = H(4.4, 0.6, 0), d = norm(add(mul(A.w, 1), mul(A.fv, 0.4 + up * 1.6)));
      const gt = c.sc.group(0.9);
      for (let k = 0; k < 8; k++) {
        const nq = add(q, mul(d, 2.4));
        c.sc.cone(gt, o.skin, q, lerp(2.6, 1.0, k / 8), nq, lerp(2.6, 1.0, (k + 1) / 8), { tex: (qq) => (qq.edge ? 0 : (qq.y + 40) % 2 === 0 ? -0.6 : 0) });
        q = nq;
        d = norm(rotAxis(rotAxis(d, A.s, up > 0.1 ? -0.38 * up : 0.12 + (c.p.run ? -0.08 : 0)), A.w, sw * 0.4));
      }
      // бивни
      for (const sx of [-1, 1]) horn(c, IVORY, H(4.0, -2.2, sx * 2.6), add(mul(A.w, 1), add(mul(A.fv, 0.3), mul(A.s, sx * 0.3))), A.s, 5, o.tuskLen / 5, 1.2, -o.tuskCurl);
      o.headDeco?.(c, A);
    },
    tail: (c) => segTail(c, c.T([0, -19.6, 30]), o.skin, { n: 4, seg: 2.0, r0: 0.9, r1: 0.6, droop: 2.4 }),
    deco: (c, lg) => o.deco(c, lg),
    seat: o.seat,
  };
}

// ---------------- 18. боевой слон (эпический, герб) ----------------
export function warElephant(fac: Fac): MountSpec {
  const K = facKit(fac);
  const skin = M("серо-синяя кожа", R("#0a0c14", "#161a26", "#262c3c", "#3a4256", "#525c74", "#6e7a94"), 2.0, 2.6);
  const wrinkle: TexFn = (q) => (q.edge ? 0 : (q.y + Math.floor(q.x / 3)) % 4 === 0 ? -0.6 : 0);
  const L: Layout = { fx: 6.4, hx: 6.6, fy: 12.0, hy: -11.2 };
  return spec("war_elephant", "Боевой слон", elephantCfg({
    skin, tex: wrinkle, tuskLen: 9, tuskCurl: 0.16, ears: 4.6, seat: [0, -1.6, 39.6],
    headDeco: (c, A) => {
      const H = A.H;
      c.sc.box(c.sc.group(0.3), K.metal, H(1.6, 5.0, 0), [4.0, 0.9, 4.6], [A.s, A.fv, A.w], 1.0, { tex: rimTex(K.trim, 0.84) });
      emblem(c, fac, H(2.6, 5.9, 0), add(mul(A.fv, 0.5), mul(A.w, 1)), "down");
      for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), K.trim, H(4.0, -2.2, sx * 2.6), 1.5, H(6.0, -2.6, sx * 2.8), 1.4, { tex: shine });
    },
    deco: (c) => {
      const A = c.ax(X, Y, Z);
      // попона с гербом, башня-паланкин с крышей, подвески
      caparison(c, { y0: -15, y1: 11, zc: 30.6, hz: 6.6, w: 11.6, cloth: K.cloth, hem: K.hem, trim: K.trim, fac, rr: 5 });
      const z0 = 37.6;
      c.sc.box(c.sc.group(0.4), K.metal, c.T([0, -1.6, z0]), [6.6, 7.4, 1.4], A, 0.8, { tex: rimTex(K.trim, 0.86) });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) c.sc.cone(c.sc.group(0), K.trim, c.T([sx * 6.0, -1.6 + sy * 6.6, z0]), 0.5, c.T([sx * 6.0, -1.6 + sy * 6.6, z0 + 3.6]), 0.5, { tex: shine });
      over(c, VB.up, () => c.sc.box(c.sc.group(0), K.metal, c.T([0, -8.6, z0 + 2.2]), [6.4, 0.7, 2.2], A, 0.4, { tex: rimTex(K.trim, 0.7) }));
      c.sc.ball(c.sc.group(0), K.gem, c.T([0, 6.4, z0 + 1.4]), 0.9);
    },
  }, L), 1.55, 176, 136);
}

// ---------------- 19. вьючный мамонт (эпический) ----------------
export function packMammoth(): MountSpec {
  const shag = M("сизая шерсть", R("#0c1018", "#18202c", "#2a3444", "#3e4c60", "#566a80", "#7088a0"), 2.1, 2.5);
  const L: Layout = { fx: 6.6, hx: 6.8, fy: 12.0, hy: -11.2 };
  const bag = M("кожаный тюк", R("#1e0e06", "#36190c", "#562a16", "#7a4022", "#9e5a34"), 2.0, 2.4);
  const cloth = M("зелёный тюк", R("#0c160c", "#182a16", "#284424", "#3a6236", "#54844c"), 2.0, 2.4);
  const stone = M("камень", R("#141216", "#24222a", "#383440", "#4e4a58", "#6a6474"), 2.0, 2.4);
  return spec("pack_mammoth", "Вьючный мамонт", elephantCfg({
    skin: shag, tex: shagTex, tuskLen: 14, tuskCurl: 0.3, ears: 3.0, shag, seat: [0, -1.6, 40.4],
    deco: (c, lg) => {
      const A = c.ax(X, Y, Z);
      // седло на тюках, верёвки, мешки по бокам, связка костей-копий сзади, каменные наросты на ногах
      saddle(c, { y: -1.6, z: 38.4, w: 6.8, leather: bag, trim: ROPE, flapX: 11.4, pad: cloth });
      for (const sx of [-1, 1]) {
        c.sc.box(c.sc.group(0.6), sx > 0 ? cloth : bag, c.T([sx * 11.0, -6.0, 30.4]), [2.4, 3.4, 3.2], A, 1.4, { tex: (q) => (q.edge ? 0 : (Math.abs(q.l[1]) % 2 < 0.4 || Math.abs(q.l[2]) % 2 < 0.4) ? { mat: ROPE, d: 0 } : 0) });
        c.sc.cone(c.sc.group(0), ROPE, c.T([sx * 10.6, 4, 35]), 0.5, c.T([sx * 10.2, 4, 22]), 0.5);
      }
      over(c, VB.up, () => {
        for (let k = 0; k < 3; k++) c.sc.cone(c.sc.group(0), IVORY, c.T([-2 + k * 2, -8.6, 38.0]), 0.9, c.T([-3 + k * 3, -12.6, 48.6 - k]), 0.2, { tex: shine });
        c.sc.cone(c.sc.group(0), ROPE, c.T([-3, -9.6, 41]), 0.6, c.T([3, -9.6, 41]), 0.6);
      });
      lg.forEach((l, i) => c.sc.ell(c.sc.group(0), stone, lerpV(l.knee, l.fet, 0.4 + (i % 2) * 0.2), [2.0, 1.6, 1.4], A));
    },
  }, L), 1.62, 176, 136);
}

// ---------------- 01. крылатый лис-нетопырь (эпический, крылья) ----------------
export function batFox(): MountSpec {
  const L: Layout = { fx: 4.0, hx: 4.2, fy: 10.4, hy: -9.8 };
  const fur = M("рыжий мех", R("#2a0a04", "#4e1608", "#7e2a0e", "#ac4416", "#d26a2a", "#ee9a5a"), 2.1, 2.5);
  const cream = M("светлая грудка", R("#4a4038", "#7a6e62", "#a89c8c", "#d0c6b4", "#ece6d6"), 2.2, 2.4);
  const dark = M("тёмные лапы", R("#08060a", "#141016", "#221c26", "#342a3a", "#4a3e52"), 1.9, 2.4);
  const skin = M("перепонка", R("#2a1a0e", "#4a301a", "#6e4a28", "#94683c", "#b88a56"), 2.1, 2.2);
  return spec("bat_fox", "Лис-нетопырь", {
    L, coat: fur, piv: [0, 0, 18], gait: { reach: [6.6, 6.2], lift: [4.6, 4.0] },
    legs: { hipZ: [16.4, 16.4], len: [[7.6, 6.0], [8.6, 6.6]], r: [[2.8, 1.6, 1.3], [3.2, 1.6, 1.3]], foot: "claw", footMat: CLAW, lower: dark, layers: true },
    body: { z: 18.4, len: 10.6, w: 6.8, h: 6.2, tex: furTex(0.12) },
    idle: (p, u) => {
      // расправляет крылья и встряхивается, чешет ухо, оглядывается
      const sp = win(u, 2 / 24, 11 / 24);
      p.wing.forEach((w) => { w.spread += 0.9 * bump(sp); w.lift += 0.6 * bump(sp); });
      actShake(p, u, 11, 17, 1.2); actLook(p, u, 17, 24, 0.6); actTail(p, u, 4, 10, 0.6);
    },
    head: (c) => {
      const N = neck(c, [0, 9.8, 21.4], [0, 4.8, 5.6], [5.0, 3.6], fur, furTex(0.12));
      c.sc.ell(c.sc.group(1), cream, add(N.NB, c.TD([0, 3.6, -1.4])), [4.4, 3.2, 4.4], c.ax(X, Y, Z), { tex: hairTex });
      const A = headAxes(c, N.poll, N.nd, [0, 0.9, -0.4]);
      const H = A.H, g = c.sc.group(1.2);
      c.sc.ell(g, fur, H(1.4, 0.6, 0), [3.2, 2.8, 3.0], [A.s, A.fv, A.w]);
      c.sc.cone(g, fur, H(3.0, 0.2, 0), 2.0, H(6.8, -0.6, 0), 0.9);
      for (const sx of [-1, 1]) c.sc.ell(g, cream, H(2.6, -1.0, sx * 1.6), [1.4, 1.2, 1.8], [A.s, A.fv, A.w]);
      c.sc.ball(c.sc.group(0), dark, H(7.0, -0.6, 0), 0.7);
      // большие уши
      for (const sx of [-1, 1]) {
        const e0 = H(0.2, 2.2, sx * 1.8);
        const d = norm(add(mul(A.fv, 1), add(mul(A.s, sx * 0.4), mul(A.w, -0.3 + (sx > 0 ? c.p.ear * 0.4 : 0)))));
        c.sc.cone(c.sc.group(0.4), fur, e0, 1.6, add(e0, mul(d, 4.6)), 0.3);
        c.sc.cone(c.sc.group(0), dark, add(e0, mul(d, 3.4)), 0.7, add(e0, mul(d, 4.8)), 0.2);
      }
      eyes(c, A, H(2.2, 1.0, 0), 2.0, "#ffd040");
    },
    tail: (c) => {
      const pts = segTail(c, c.T([0, -13, 20]), fur, { n: 6, seg: 2.6, r0: 2.0, r1: 1.4, droop: 0.6, lift: 0.3, tex: hairTex });
      c.sc.ball(c.sc.group(0.6), cream, pts[pts.length - 1], 1.4, { tex: hairTex });
      return pts;
    },
    deco: (c) => {
      for (const sx of [-1, 1]) membraneWing(c, sx, { root: [sx * 5.4, 6.0, 23.4], bone: fur, skin, len: 0.95 });
      saddle(c, { y: -1.4, z: 25.4, w: 5.2, leather: M("фиолетовая кожа", R("#14081a", "#24102e", "#3a1c48", "#562a66", "#743e84"), 1.9, 2.3), trim: GOLD, flapX: 7.6 });
      embers(c, [c.T([0, 0, 26])], 3, M("пыльца", R("#5a3a08", "#a8781c", "#f0c040", "#ffe890", "#fffbe0"), 3.2, 0.8), 6, 0.45);
    },
    seat: [0, -1.4, 26.8],
  }, 1.1, 128, 100);
}
void GEM_RED; void GEM_AZ; void HORN_DK; void FIRE_DEEP; void flames; void caparison; void near; void scaleFrom; void actEar;
