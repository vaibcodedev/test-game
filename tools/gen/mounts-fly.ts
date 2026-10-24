/** Летающие и необычные маунты: грифон, костяной дракон, виверна, феникс, паук, раптор. */
import { ramp, type RGBA, type Ramp } from "./canvas";
import { MOUNT, P } from "./palette";
import { Rig, V, VIEW_DOWN, VIEW_SIDE, VIEW_UP, lerp, type V3 } from "./mounts-rig";
import { eyes, flow, quad, saddle, type Built, type Ctx } from "./mounts-quad";
import { flame } from "./mounts-horses";

const hx = (c: string): RGBA => ramp(c)[0];
const F = VIEW_DOWN;
const { BONE, GBODY, GWING, GWING2, GHEAD, BEAK, PHX, PHX2, RAPT, RSTR, SPD, SPR } = MOUNT;

/** Крыло: рука (плечо-локоть-кисть) с взмахом и перья или перепонка. s = ±1 сторона. */
export function wing(r: Rig, c: Ctx, s: number, root: V3, span: number, chord: number, kind: "feather" | "membrane", main: Ramp, edge: Ramp, o: { fingers?: number; A?: number; arm?: Ramp } = {}) {
  const A = o.A ?? (c.run ? 0.95 : 0.5);
  const base = c.run ? 0 : 0.3;
  const th = base + A * Math.sin(c.tt + 0.6), th2 = base + A * 1.15 * Math.sin(c.tt - 0.5);
  const el: V3 = V(root[0] + s * span * 0.45 * Math.cos(th), root[1] - chord * 0.1, root[2] + span * 0.45 * Math.sin(th));
  const tip: V3 = V(el[0] + s * span * 0.55 * Math.cos(th2), el[1] - chord * 0.55, el[2] + span * 0.55 * Math.sin(th2));
  const B = (u: number): V3 => (u < 0.45 ? V(lerp(root[0], el[0], u / 0.45), lerp(root[1], el[1], u / 0.45), lerp(root[2], el[2], u / 0.45)) : V(lerp(el[0], tip[0], (u - 0.45) / 0.55), lerp(el[1], tip[1], (u - 0.45) / 0.55), lerp(el[2], tip[2], (u - 0.45) / 0.55)));
  const arm = o.arm ?? edge;
  if (kind === "feather") {
    const N = 11;
    for (let k = N - 1; k >= 0; k--) {
      const u = 0.1 + 0.9 * (k / (N - 1));
      const p = B(u);
      const len = chord * (0.75 + 0.65 * u);
      const droop = -len * (0.18 + 0.25 * (1 - Math.cos(th2) * 0.4));
      const e = V(p[0] + s * 3.2 * u, p[1] - len, p[2] + droop + (u > 0.5 ? Math.sin(th2) * 3 : 0));
      r.cap(p, e, 2.6 - u * 0.7, 0.7, k % 2 ? main : edge, { wa: 2.2, wb: 0.6, bias: -6 - k * 0.01, noise: 0.15 });
    }
    r.cap(root, el, 2.8, 2.2, arm, { wa: 2.4, wb: 1.9, bias: -5, noise: 0.1 });
    r.cap(el, tip, 2.2, 1.1, arm, { wa: 1.9, wb: 0.9, bias: -5, noise: 0.1 });
    return;
  }
  const nf = o.fingers ?? 4;
  const trail: V3[] = [];
  const tips: V3[] = [tip];
  for (let k = 1; k <= nf; k++) {
    const u = 1 - (k / (nf + 0.6)) * 0.95;
    const p = B(Math.max(0.05, u));
    const len = chord * (0.7 + 0.5 * u);
    const t = V(p[0] + s * 1, p[1] - len, p[2] - len * 0.35 + Math.sin(th2) * u * 2);
    tips.push(t);
    trail.push(t);
  }
  const outline: V3[] = [root, el, tip];
  for (let k = 0; k < trail.length; k++) {
    outline.push(trail[k]);
    if (k + 1 < trail.length) { const m = V((trail[k][0] + trail[k + 1][0]) / 2 - s * 1.2, (trail[k][1] + trail[k + 1][1]) / 2 + chord * 0.22, (trail[k][2] + trail[k + 1][2]) / 2 + chord * 0.12); outline.push(m); }
  }
  outline.push(V(root[0], root[1] - chord * 0.75, root[2] - 1));
  r.poly(outline, main, { bias: -7, noise: 0.1 });
  const bone = o.arm ?? edge;
  for (let k = 1; k < tips.length; k++) r.cap(k === 1 ? tip : B(1 - ((k - 1) / (nf + 0.6)) * 0.95), tips[k], 1.0, 0.4, bone, { wa: 0.9, wb: 0.4, bias: -6, noise: 0 });
  r.cap(root, el, 2.3, 1.8, bone, { wa: 2, wb: 1.6, bias: -5.5, noise: 0.1 });
  r.cap(el, tip, 1.8, 0.9, bone, { wa: 1.6, wb: 0.8, bias: -5.5, noise: 0.1 });
}

// ---------------- грифон ----------------
export const GRIFFIN = (ph: number, run: boolean): Built =>
  quad({
    shY: 11, hpY: -11, legTop: 18, bodyR: 7.2, rumpR: 6.2, bodyW: 6.4, rumpW: 5.8, up: 7, low: 6.4, legR: [3, 2], legX: 3.8, stride: 0, lift: 0, foot: "claw", pole: [1, -1],
    neck: [6.5, 8.5], neckR: [5.2, 4.2], neckW: 4.6, body: GBODY, legs: ramp("#6a4a1c", "#a8741e", "#d8a22e", "#f4cc56"), belly: ramp("#80582a", "#b0803c", "#d8aa5c", "#f0cc88"), seatY: -3, seatZ: 0.4, fly: 1.6,
    tuck: { f: [3.5, -9.5], h: [-5, -10] },
    head: (r, c) => {
      const N = c.N;
      // воротник из перьев и орлиная голова
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; r.ball(V(Math.cos(a) * 3.6, N[1] - 0.5 + Math.sin(a) * 0.8, N[2] - 1 + Math.sin(a) * 4.4), 2.6, GHEAD, { wa: 2.8, front: F, noise: 0.2, bias: -1 }); }
      r.ball(V(0, N[1] + 2.5, N[2] + 0.8), 4.1, GHEAD, { wa: 3.7, front: F });
      r.cap(V(0, N[1] + 5, N[2] + 0.2), V(0, N[1] + 9.2, N[2] - 1), 2.8, 1.9, BEAK, { wa: 2.2, wb: 1.4, front: F, noise: 0 });
      r.cap(V(0, N[1] + 9, N[2] - 0.8), V(0, N[1] + 10, N[2] - 4.4), 1.5, 0.35, BEAK, { wa: 1, wb: 0.3, front: F, noise: 0 });
      eyes(r, V(0, N[1] + 4, N[2] + 2.4), 2.7, hx("#c8180c"), 1.0);
      r.pair((s) => r.cap(V(s * 2, N[1] + 0.4, N[2] + 4.5), V(s * 3.2, N[1] - 2.2, N[2] + 8.5), 1.5, 0.4, GHEAD, { wa: 1.1, wb: 0.3, front: F }));
    },
    tail: (r, c) => {
      const pts = flow(r, V(0, c.q.hpY - 5, c.H[2] + 1.5), V(0, -1, c.run ? 0.15 : -0.6), 5, 2.6, 1.6, 1.1, GBODY, c, 1, 1, { front: VIEW_UP });
      const e = pts[pts.length - 1];
      r.ball(V(e[0], e[1] - 1.5, e[2]), 2.6, GWING, { front: VIEW_UP, noise: 0.25 });
    },
    deco: (r, c) => {
      saddle(r, c, ramp("#18386a", "#2a5a98", "#4a84c4", "#7ab4e8"), P.gold, 1.1);
      r.pair((s) => wing(r, c, s, V(s * 4.6, c.S[1] - 2.5, c.S[2] + 5), 34, 13, "feather", GWING, GWING2, { arm: GWING }));
    },
  }, ph, run);

// ---------------- драконы ----------------
interface Dragon { body: Ramp; belly: Ramp; membrane: Ramp; bone: Ramp; eye: RGBA; spike: Ramp; skel?: boolean; glow?: Ramp; saddle: Ramp; trim: Ramp; noFront?: boolean }
function dragon(L: Dragon, ph: number, run: boolean): Built {
  return quad({
    shY: 9, hpY: -11, legTop: 16, bodyR: 7, rumpR: 6.2, bodyW: 6.2, rumpW: 5.6, up: 6.4, low: 6, legR: L.skel ? [1.6, 1.2] : [2.8, 1.8], legX: 3.6, stride: 0, lift: 0, foot: "claw", pole: [1, -1],
    neck: [11, 13], neckR: [4.6, 3], neckW: 4, body: L.body, belly: L.belly, seatY: -2.5, seatZ: 0.3, fly: 1.6, skel: L.skel, noFront: L.noFront,
    tuck: { f: [3.5, -9], h: [-5, -9.5] },
    head: (r, c) => {
      const N = c.N, S = c.S;
      const nb = V(0, S[1] + 3, S[2] + 4);
      const bend = Math.sin(c.tt - 0.6) * 0.8;
      if (L.skel) {
        for (let i = 0; i < 7; i++) { const t = i / 6; r.cap(V(0, lerp(nb[1], N[1], t) + (i % 2) * 0.2, lerp(nb[2], N[2], t)), V(0, lerp(nb[1], N[1], t) + 2, lerp(nb[2], N[2], t) + 1), 2.2 - t * 0.5, 2 - t * 0.5, L.bone, { wa: 2, wb: 1.7, front: F, noise: 0.1 }); }
      } else {
        r.chain([nb, V(0, lerp(nb[1], N[1], 0.5) + 0.8, lerp(nb[2], N[2], 0.5)), N], 4.6, 3, L.body, { wa: 3.8, wb: 2.6, front: F });
      }
      // череп: удлинённая голова с рогами и челюстью
      r.ball(V(0, N[1] + 2.4, N[2] + 0.6 + bend * 0.3), 3.7, L.skel ? L.bone : L.body, { wa: 3.2, front: F });
      r.cap(V(0, N[1] + 4.6, N[2] - 0.2), V(0, N[1] + 10.5, N[2] - 1.4), 2.5, 1.8, L.skel ? L.bone : L.body, { wa: 2.1, wb: 1.5, front: F });
      r.cap(V(0, N[1] + 4.2, N[2] - 2.4), V(0, N[1] + 9.5, N[2] - 2.8 - (c.run ? 0.4 : 0)), 1.2, 0.9, L.skel ? L.bone : L.belly, { wa: 1.5, wb: 1.2, front: F, tone: -1 });
      for (let k = 0; k < 4; k++) r.dot(V(0, N[1] + 6 + k * 1.2, N[2] - 1.4), 0.5, ramp("#f4efde")[0], { front: F, views: VIEW_SIDE, bias: 3 });
      eyes(r, V(0, N[1] + 3.6, N[2] + 2), 2.7, L.eye, 1.1);
      r.pair((s) => r.chain([V(s * 2, N[1] + 0.2, N[2] + 3), V(s * 3.4, N[1] - 3, N[2] + 5.4), V(s * 3.8, N[1] - 6, N[2] + 5)], 1.4, 0.4, L.bone, { front: F, noise: 0.05 }));
      // гребень вдоль шеи и спины
      for (let i = 0; i < 9; i++) { const t = i / 8, y = lerp(N[1], c.H[1] + 1, t), z = lerp(N[2] + 3.4, c.H[2] + c.q.rumpR + 0.4, t) - (t > 0.3 && t < 0.6 ? 1.4 : 0); r.cap(V(0, y, z), V(0, y - 1.4, z + 3.4 - t), 1.1, 0.3, L.spike, { wa: 0.9, wb: 0.3, bias: 1, noise: 0, front: i < 1 ? F : 0 }); }
      if (L.glow) r.dot(V(0, N[1] + 3.2, N[2] + 3.8), 0.001, L.glow[3], { views: 0 });
    },
    tail: (r, c) => {
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(Math.sin(c.tt - i * 0.55) * 1.2 * t * 2, lerp(c.q.hpY - 4, c.q.hpY - 32, t), c.H[2] + 1 - t * 2 + Math.sin(c.tt - i * 0.4) * 1.1 * t - (c.run ? 0 : t * 2))); }
      r.chain(pts, L.skel ? 1.8 : 3.4, 0.8, L.skel ? L.bone : L.body, { front: VIEW_UP, noise: 0.15 });
      const e = pts[pts.length - 1];
      r.poly([V(e[0], e[1] + 1.5, e[2]), V(e[0] - 2.8, e[1] - 3, e[2]), V(e[0], e[1] - 7, e[2]), V(e[0] + 2.8, e[1] - 3, e[2])], L.spike, { front: VIEW_UP, bias: 2, noise: 0 });
    },
    deco: (r, c) => {
      if (L.skel) {
        r.cap(V(0, c.H[1] + 1, c.H[2] - 0.5), V(0, c.S[1] - 1, c.S[2] - 0.5), 5.2, 5.6, ramp("#07040c", "#0e0818", "#170e28"), { wa: 4.4, wb: 4.6, bias: -3, noise: 0 });
        r.cap(c.H, c.S, 1.6, 1.6, L.bone, { wa: 1.6, wb: 1.6, bias: 0.4 });
        for (let k = 0; k < 7; k++) {
          const y = lerp(c.S[1] - 1, c.H[1] + 3, k / 6), zc = lerp(c.S[2], c.H[2], k / 6), rr = 5.6 - Math.abs(k - 2.5) * 0.3;
          r.pair((s) => { r.cap(V(s * 0.8, y, zc + 5), V(s * rr, y + 0.4, zc + 1.4), 1.1, 0.9, L.bone, { wa: 1, wb: 0.9 }); r.cap(V(s * rr, y + 0.4, zc + 1.4), V(s * rr * 0.55, y + 0.8, zc - 5), 0.9, 0.7, L.bone, { wa: 0.9, wb: 0.7 }); });
        }
        r.dot(V(0, c.S[1] - 3, c.S[2] - 1), 2.2, L.glow![3], { bias: 2 });
      }
      saddle(r, c, L.saddle, L.trim, 1.1);
      r.pair((s) => wing(r, c, s, V(s * 4.4, c.S[1] - 2.5, c.S[2] + 5), 36, 15, "membrane", L.membrane, L.bone, { fingers: 4, arm: L.bone }));
    },
  }, ph, run);
}

export const BONE_DRAGON = (ph: number, run: boolean): Built =>
  dragon({ body: BONE, belly: BONE, bone: BONE, membrane: ramp("#0a1c2c", "#143c52", "#226c78", "#3ca89c", "#7ae8d0"), eye: hx("#9af8e0"), spike: BONE, skel: true, glow: ramp("#0e3a40", "#1e7a80", "#46c0b8", "#9af0e0", "#e8fff8"), saddle: ramp("#120a1c", "#241638", "#3a2458", "#58407e"), trim: ramp("#176070", "#2ea0a8", "#6ce0d0", "#c8fff0") }, ph, run);
export const WYVERN = (ph: number, run: boolean): Built =>
  dragon({ body: ramp("#1c0a1c", "#381238", "#5e1e50", "#8c3468", "#b85a88"), belly: ramp("#4a3036", "#74505a", "#a08088", "#c8b0b0"), bone: ramp("#2a1420", "#4a2a38", "#7a5460", "#b08a90", "#e0c8c4"), membrane: ramp("#240a28", "#4a1450", "#7a2478", "#a8409c", "#d870c8"), eye: hx("#ffd848"), spike: ramp("#3a1428", "#6e2a44", "#a8485e", "#e0786e"), saddle: ramp("#0c0a14", "#1c1828", "#322c44", "#4c4464"), trim: P.gold, noFront: true }, ph, run);

// ---------------- феникс ----------------
export const PHOENIX = (ph: number, run: boolean): Built =>
  quad({
    shY: 9, hpY: -9, legTop: 18, bodyR: 6.4, rumpR: 5.6, bodyW: 5.6, rumpW: 5, up: 6, low: 6, legR: [1.8, 1.2], legX: 3, stride: 0, lift: 0, foot: "claw", pole: [1, -1],
    neck: [5.5, 9], neckR: [3.8, 2.6], neckW: 3.2, body: PHX, belly: PHX2, seatY: -2.5, seatZ: 0.3, fly: 1.7, noFront: true,
    legs: ramp("#4a2a10", "#8a5a1c", "#c8902c", "#f0c850"), tuck: { f: [0, 0], h: [-4, -9] },
    head: (r, c) => {
      const N = c.N;
      r.ball(V(0, N[1] + 2, N[2] + 0.4), 3.3, PHX, { wa: 3, front: F });
      r.cap(V(0, N[1] + 4, N[2] - 0.2), V(0, N[1] + 7.6, N[2] - 1.2), 1.7, 0.9, ramp("#6a4a08", "#c08a14", "#f0c030", "#fff080"), { wa: 1.4, wb: 0.8, front: F, noise: 0 });
      eyes(r, V(0, N[1] + 3.1, N[2] + 1.6), 2.2, hx("#fff8c0"), 0.8);
      for (let i = 0; i < 4; i++) flame(r, V(0, N[1] + 0.5 - i * 1.2, N[2] + 3.2 + i * 0.3), 7 + i * 1.5, 1.4, c.tt, i, PHX2, { front: F, lean: V(0, -0.8, 0.7) });
    },
    tail: (r, c) => {
      for (let i = 0; i < 5; i++) {
        const sx = (i - 2) * 1.6, len = 18 + (i % 3) * 4;
        const pts: V3[] = [];
        for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(V(sx * (0.4 + t) + Math.sin(c.tt - k * 0.6 + i) * 1.2 * t, c.q.hpY - 4 - t * len, c.H[2] + 1 - t * 3 + Math.sin(c.tt - k * 0.5) * 1.4 * t)); }
        r.chain(pts, 2.4, 0.5, i % 2 ? PHX : PHX2, { front: VIEW_UP, noise: 0.15 });
      }
    },
    deco: (r, c) => {
      saddle(r, c, ramp("#3a0c10", "#6a1820", "#a02c30", "#d85a48"), P.gold, 1);
      r.pair((s) => wing(r, c, s, V(s * 4, c.S[1] - 2.5, c.S[2] + 4.5), 38, 14, "feather", PHX, PHX2, { arm: PHX }));
    },
  }, ph, run);

// ---------------- раптор ----------------
export const RAPTOR = (ph: number, run: boolean): Built =>
  quad({
    shY: 8, hpY: -5, legTop: 22, bodyR: 6.4, rumpR: 7.4, bodyW: 5.2, rumpW: 5.8, up: 11, low: 11.4, legR: [3.6, 1.7], legX: 3.4, stride: 9, lift: 8, foot: "claw", pole: [1, 1],
    neck: [6, 9.5], neckR: [4.4, 3], neckW: 3.6, body: RAPT, belly: ramp("#7a9a7a", "#a8c8a0", "#d4e6c4", "#f0f8e0"), seatY: -2.5, seatZ: 0.3, noFront: true, bob: 2, gallop: false,
    head: (r, c) => {
      const N = c.N;
      r.ball(V(0, N[1] + 2.6, N[2] + 0.2), 3.5, RAPT, { wa: 3, front: F });
      r.cap(V(0, N[1] + 4.6, N[2] - 0.4), V(0, N[1] + 10.4, N[2] - 1.4), 2.7, 1.9, RAPT, { wa: 2.2, wb: 1.5, front: F });
      r.cap(V(0, N[1] + 4.4, N[2] - 2.4), V(0, N[1] + 10, N[2] - 2.1), 1.2, 0.9, ramp("#5a2a2a", "#8a4440", "#c07068"), { wa: 1.4, wb: 1.1, front: F, tone: -1 });
      for (let k = 0; k < 5; k++) r.dot(V(0, N[1] + 5.5 + k * 1.1, N[2] - 2.6), 0.5, ramp("#f8f4e8")[0], { front: F, views: VIEW_SIDE, bias: 3 });
      eyes(r, V(0, N[1] + 3.4, N[2] + 1.8), 2.6, hx("#ffcc10"), 1.0);
      // гребень из перьев
      for (let i = 0; i < 5; i++) r.cap(V(0, N[1] + 0.6 - i * 1.2, N[2] + 3.2), V(0, N[1] - 1.6 - i * 1.4, N[2] + 7 - i * 0.6), 1.2, 0.3, RSTR, { wa: 1, wb: 0.3, front: F, bias: 1, noise: 0 });
      // крошечные передние лапки
      r.pair((s) => r.chain([V(s * 3.4, c.S[1] + 3.5, c.S[2] - 2.6), V(s * 3.8, c.S[1] + 6.5, c.S[2] - 4.4), V(s * 3.8, c.S[1] + 8, c.S[2] - 2.6)], 1.3, 0.8, RAPT, { front: F }));
    },
    tail: (r, c) => {
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(Math.sin(c.tt - i * 0.5) * 1.6 * t, lerp(c.q.hpY - 3, c.q.hpY - 30, t), c.H[2] + 2.5 - t * 4 + Math.sin(c.tt * 2 - i * 0.4) * 0.6 * t)); }
      r.chain(pts, 4.6, 0.7, RAPT, { front: VIEW_UP, noise: 0.15, fx: (x, y, i, t) => (Math.floor(t * 9 + (x > 0 ? 0 : 0)) % 2 === 0 && i > 0 ? RSTR[Math.min(3, i)] : null) });
    },
    deco: (r, c) => {
      // полосы на боках и спине
      r.pair((s) => { for (let k = 0; k < 4; k++) r.cap(V(s * 4.6, c.H[1] + 2 + k * 3.2, c.bodyZ + 4), V(s * 5.2, c.H[1] + 2.8 + k * 3.2, c.bodyZ - 2), 0.8, 0.8, RSTR, { wa: 0.8, wb: 0.8, views: VIEW_SIDE, bias: 1.2, noise: 0 }); });
      saddle(r, c, P.wood, P.gold, 1.1);
    },
  }, ph, run);

// ---------------- гигантский паук ----------------
export function SPIDER(ph: number, run: boolean): Built {
  const r = new Rig();
  const tt = ph * Math.PI * 2;
  const bz = 13 + (run ? Math.sin(tt * 2) * 0.9 : Math.sin(tt) * 0.4);
  const abd = V(0, -9, bz + 4.5), ceph = V(0, 6.5, bz + 0.5);
  // ноги: 4 пары, походка двух тетрад
  for (let j = 0; j < 4; j++) for (const sg of [-1, 1]) {
    const y0 = 9 - j * 4.2, att = V(sg * 3.4, y0 - 1, bz + 0.5);
    const baseY = [14, 8, -2, -12][j];
    const phase = ((j + (sg > 0 ? 1 : 0)) % 2) * 0.5;
    const u = (ph + phase) % 1;
    let fy = baseY, fz = 0;
    if (run) { if (u < 0.55) fy = baseY + 5 * (1 - 2 * (u / 0.55)); else { const s2 = (u - 0.55) / 0.45; fy = baseY - 5 + 10 * s2; fz = 6 * Math.sin(Math.PI * s2); } }
    const reach = [13, 15, 15, 14][j];
    const foot = V(sg * reach, fy, 0.6 + fz);
    const knee = V(sg * (reach * 0.62 + 2), lerp(att[1], foot[1], 0.35) , bz + 10 - j * 0.5 + fz * 0.3);
    r.cap(att, knee, 1.7, 1.4, SPD, { wa: 1.6, wb: 1.3, noise: 0.2 });
    r.cap(knee, foot, 1.4, 0.6, SPD, { wa: 1.2, wb: 0.5, noise: 0.2 });
    r.ball(knee, 1.6, SPD, { tone: 1 });
  }
  r.ball(abd, 9.2, SPD, { wa: 8.2, noise: 0.25, fx: (x, y, i, t, ny) => (ny < -0.1 && ny > -0.6 && Math.abs(t) < 0.5 ? null : null) });
  // песочные часы на брюшке
  r.poly([V(-2.4, abd[1] - 4, abd[2] + 8.4), V(2.4, abd[1] - 4, abd[2] + 8.4), V(0, abd[1], abd[2] + 9), V(2.4, abd[1] + 4, abd[2] + 8), V(-2.4, abd[1] + 4, abd[2] + 8), V(0, abd[1], abd[2] + 9)], SPR, { views: VIEW_UP | VIEW_SIDE | VIEW_DOWN, bias: 0.5, noise: 0 });
  r.ball(ceph, 5.4, SPD, { wa: 4.8, front: F, noise: 0.2 });
  r.cap(V(0, -3, bz + 1.5), V(0, 2, bz + 1), 4, 4.4, SPD, { wa: 4, wb: 4.2 });
  r.pair((s) => r.cap(V(s * 1.8, ceph[1] + 4.5, ceph[2] - 1), V(s * 1.4, ceph[1] + 8, ceph[2] - 4.4), 1.5, 0.6, ramp("#3a2a1c", "#6a4a2c", "#b09068", "#e8d8b0"), { wa: 1.3, wb: 0.5, front: F, noise: 0 }));
  const ey: [number, number, number][] = [[1.4, 7.8, 2.8], [3, 6.2, 2], [1.2, 6.4, 3.6], [3.2, 4.6, 1.2]];
  for (const [ex, ey2, ez] of ey) r.pair((s) => r.dot(V(s * ex, ceph[1] + ey2 - 3, ceph[2] + ez - 1.5), 1, SPR[3], { front: F, views: s > 0 ? VIEW_SIDE | VIEW_DOWN : VIEW_DOWN, bias: 4 }));
  const seat = V(0, -2.5, abd[2] + 6.2);
  // седло на брюшке (поверх хитина)
  r.cap(V(0, -6.5, abd[2] + 7.2), V(0, 0.5, abd[2] + 7.8), 2.4, 2.4, ramp("#2a0c14", "#541a24", "#8a2c38", "#b84a52"), { wa: 6, wb: 5.6, bias: 1, noise: 0.05 });
  r.cap(V(0, -7.4, abd[2] + 8.2), V(0, -7.4, abd[2] + 9.6), 1.6, 1.5, P.gold, { wa: 3.5, wb: 3.5, bias: 1.2, noise: 0 });
  return { rig: r, seat };
}
