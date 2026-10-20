/** Кони: бурый конь, боевой конь Сольгарда, дестриэ, скелет коня, кошмарный скакун. */
import { ramp, type RGBA } from "./canvas";
import { P } from "./palette";
import { Rig, V, VIEW_DOWN, VIEW_SIDE, VIEW_UP, lerp, type V3 } from "./mounts-rig";
import { BROWN, DARKMANE, eyes, flow, quad, saddle, type Built, type Ctx, type Q } from "./mounts-quad";
import type { Ramp } from "./canvas";

const hx = (c: string): RGBA => ramp(c)[0];

interface HorseLook {
  body: Ramp; mane: Ramp; belly?: Ramp; eye?: RGBA; blaze?: boolean; sock?: Ramp;
  chanfron?: Ramp; plume?: Ramp; ears?: boolean; heavy?: boolean; skullHead?: boolean;
}

function horseHead(r: Rig, c: Ctx, L: HorseLook, sc = 1) {
  const N = c.N, run = c.run;
  const dn = run ? Math.sin(c.tt * 2 - 0.4) * 0.6 : 0;
  const a = V(0, N[1] + 1 * sc, N[2] + 1.5 * sc), b = V(0, N[1] + 8.5 * sc, N[2] - 3 * sc + dn), m = V(0, N[1] + 15 * sc, N[2] - 6.5 * sc + dn);
  const front = VIEW_DOWN;
  const blaze: ((x: number, y: number, i: number, t: number, ny: number) => RGBA | null) | undefined = L.blaze ? (x, y, i, t, ny) => (Math.abs(ny) < 0.28 && i > 0 ? P.cloth.white[Math.min(3, i)] : null) : undefined;
  r.cap(a, b, 4.1 * sc, 3.2 * sc, L.body, { wa: 3.4 * sc, wb: 2.7 * sc, front, fx: blaze });
  r.cap(b, m, 3.1 * sc, 2.6 * sc, L.body, { wa: 2.5 * sc, wb: 2.1 * sc, front, fx: blaze });
  r.cap(V(0, m[1] + 0.3, m[2] - 0.6), V(0, m[1] + 0.3, m[2] - 0.6), 2.1 * sc, 2.1 * sc, L.body, { wa: 2.2 * sc, wb: 2.2 * sc, front, tone: -1 });
  if (L.chanfron) {
    r.cap(V(0, a[1] + 1, a[2] + 0.8), V(0, m[1] - 1, m[2] + 1), 3.3 * sc, 2.5 * sc, L.chanfron, { wa: 1.7 * sc, wb: 1.4 * sc, front, bias: 1, noise: 0 });
    r.dot(V(0, m[1] - 4, m[2] + 3.6), 1.3, P.gold[3], { front, views: VIEW_DOWN | VIEW_SIDE, bias: 3 });
  }
  if (L.ears !== false) r.pair((s) => r.cap(V(s * 2.3 * sc, N[1] + 0.2, N[2] + 3 * sc), V(s * 2.5 * sc, N[1] + 1.6, N[2] + 7 * sc), 1.4 * sc, 0.6 * sc, L.body, { wa: 1.1 * sc, wb: 0.5, front, tone: s < 0 ? -1 : 0 }));
  eyes(r, V(0, b[1] - 1.5 * sc, b[2] + 1.6 * sc), 3.0 * sc, L.eye ?? hx("#0a0608"), 0.9);
  r.pair((s) => r.dot(V(s * 1.1, m[1] + 2.3 * sc, m[2] + 0.3), 0.6, hx("#0a0608"), { views: VIEW_DOWN, front, bias: 3 }));
  if (L.plume) flow(r, V(0, N[1] + 0.5, N[2] + 5 * sc), V(0, -0.35, 0.8), 5, 2.4, 1.8, 0.7, L.plume, c, 1.2, 0.3, { front: VIEW_DOWN });
  // грива вдоль гребня шеи и чёлка
  const nb = V(0, c.S[1] + c.q.bodyR * 0.35, c.S[2] + c.q.bodyR * 0.45);
  const pts: V3[] = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(V(Math.sin(c.tt * (run ? 2 : 1) - i) * (run ? 0.7 : 0.25), lerp(N[1] - 1.2, nb[1] - 0.5, t) - (run ? 0.6 * Math.sin(t * 3) : 0), lerp(N[2] + 2.5, nb[2] + c.q.neckR[0] * 0.85, t))); }
  r.chain(pts, 2.2 * sc, 2.4 * sc, L.mane, { wa: 1.5, wb: 1.5, noise: 0.25, bias: 1, views: VIEW_SIDE | VIEW_UP | VIEW_DOWN });
  r.cap(V(0, a[1] + 1.8, a[2] + 2.5), V(0, a[1] + 4.5, a[2] + 0.6), 1.3 * sc, 1, L.mane, { wa: 1.2, wb: 1, front, noise: 0.2 });
}

function horseTail(r: Rig, c: Ctx, mane: Ramp, len = 6, thick = 2.6) {
  const q = c.q;
  const base = V(0, q.hpY - q.rumpR * 0.85, c.H[2] + q.rumpR * 0.55);
  flow(r, base, V(0, -1, c.run ? 0.15 : -0.5), len, 2.8, thick, 0.9, mane, c, 1.3, 1.4, { front: VIEW_UP });
}

function horseQ(look: HorseLook, o: Partial<Q> = {}): Q {
  const heavy = !!look.heavy;
  return {
    shY: 12, hpY: -12, legTop: 19, bodyR: heavy ? 9 : 7.5, rumpR: heavy ? 8.8 : 7.6, bodyW: heavy ? 8 : 6.2, rumpW: heavy ? 8 : 6.4,
    up: 10, low: 9.6, legR: heavy ? [3.1, 2.3] : [2.6, 1.8], legX: heavy ? 4.6 : 3.7, stride: heavy ? 6 : 7.5, lift: heavy ? 4 : 5.2,
    foot: "hoof", neck: [heavy ? 7 : 8, heavy ? 13 : 14], neckR: heavy ? [6, 4.4] : [5, 3.5], neckW: heavy ? 5 : 3.8,
    body: look.body, legs: look.sock ? look.body : look.body, belly: look.belly, seatY: -1.5, seatZ: 0.8,
    head: (r, c) => horseHead(r, c, look, heavy ? 1.15 : 1),
    tail: (r, c) => horseTail(r, c, look.mane),
    ...o,
  };
}

export const HORSE_BROWN = (ph: number, run: boolean): Built =>
  quad(horseQ({ body: BROWN, mane: DARKMANE, belly: ramp("#38241a", "#54382a", "#74503a", "#946a4c"), blaze: true }, { deco: (r, c) => saddle(r, c, P.leather, P.gold) }), ph, run);

const NAVY = ramp("#0e1a36", "#1a2e5e", "#2c4a8e", "#4468b8", "#6a8ad4");
const WHITEC = ramp("#6c6e7c", "#a4a8b8", "#d0d4e0", "#eceef6", "#ffffff");
const CHEST = ramp("#2e1a10", "#4c2c1a", "#6e4228", "#94603a", "#b8845a");

/** Попона: накидка с золотой каймой и гербом (золотое солнце на синем поле) поверх туловища. */
function caparison(r: Rig, c: Ctx, cloth: Ramp, trim: Ramp, emblem: Ramp, grow = 1.6) {
  const q = c.q;
  const lo = (v: V3, dz: number): V3 => V(v[0], v[1], v[2] + dz);
  const fx = (x: number, y: number, i: number, t: number, ny: number): RGBA | null => {
    if (ny > 0.78) return trim[Math.max(1, Math.min(trim.length - 1, i + 1))];
    if (ny > 0.62) return trim[1];
    const ex = Math.abs(t - 0.48), ey = Math.abs(ny + 0.05);
    if (ex + ey * 0.5 < 0.16 && ey < 0.33) return emblem[Math.max(1, Math.min(emblem.length - 1, i + 1))];
    if ((ex < 0.05 && ey < 0.5) || (ey < 0.07 && ex < 0.3)) return emblem[Math.max(0, i)];
    return null;
  };
  r.cap(lo(c.H, -0.6), lo(c.S, -0.6), q.rumpR + grow, q.bodyR + grow, cloth, { wa: (q.rumpW ?? q.rumpR) + grow * 0.9, wb: (q.bodyW ?? q.bodyR) + grow * 0.9, noise: 0.04, bias: 0.5, fx });
  // подол: длинные полосы вниз на боках
  r.pair((s) => r.poly([V(s * (q.bodyW ?? q.bodyR + 0.5) * 1.02, c.H[1] + 2, c.bodyZ - 2), V(s * (q.bodyW ?? q.bodyR + 0.5) * 1.02, c.S[1] - 2, c.bodyZ - 2), V(s * (q.bodyW ?? q.bodyR + 0.5) * 1.02, c.S[1] - 3, c.bodyZ - q.bodyR - 3.5), V(s * (q.bodyW ?? q.bodyR + 0.5) * 1.02, c.H[1] + 3, c.bodyZ - q.rumpR - 3.5)], cloth, { views: VIEW_SIDE, front: 0, bias: 0.8, tone: 0, fx: (x, y, i, u) => (u > 0.82 ? trim[Math.max(1, i)] : null) }));
}

export const WAR_HORSE = (ph: number, run: boolean): Built =>
  quad(horseQ({ body: ramp("#3c3844", "#5c5a68", "#85838f", "#aeacb8", "#d2d0da"), mane: ramp("#1c1a20", "#34303a", "#524c5a", "#7a7284"), chanfron: P.steel, plume: ramp("#4a1018", "#8a1c24", "#c43a38", "#ee7a62"), eye: hx("#150c08") }, {
    deco: (r, c) => {
      caparison(r, c, NAVY, P.gold, P.gold);
      saddle(r, c, ramp("#3a2216", "#5e3a22", "#8a5a34", "#b07e4c"), P.gold);
      // нагрудник и налобник
      r.cap(V(-3, c.S[1] + 4.5, c.S[2] - 1), V(3, c.S[1] + 4.5, c.S[2] - 1), 2.6, 2.6, P.gold, { wa: 1.4, wb: 1.4, front: VIEW_DOWN, bias: 4, noise: 0 });
    },
  }), ph, run);

export const DESTRIER = (ph: number, run: boolean): Built =>
  quad(horseQ({ body: CHEST, mane: ramp("#1a120c", "#2e2016", "#4a3626", "#6c5238"), chanfron: P.steel, plume: ramp("#6a1018", "#b01c24", "#e04a3c", "#ff9a70"), heavy: true, eye: hx("#150c08") }, {
    deco: (r, c) => {
      const q = c.q;
      // латная попона: стальные пластины + белая накидка с красным крестом
      const white = ramp("#3a0c14", "#6a1420", "#9c2230", "#c8404a", "#e86a68");
      const fx = (x: number, y: number, i: number, t: number, ny: number): RGBA | null => {
        if (ny > 0.8) return P.gold[Math.max(1, Math.min(4, i + 1))];
        const ex = Math.abs(t - 0.48), ey = Math.abs(ny + 0.02);
        if ((ex < 0.06 && ey < 0.55) || (ey < 0.1 && ex < 0.26)) return WHITEC[Math.max(1, Math.min(4, i + 1))];
        return null;
      };
      r.cap(V(0, c.H[1] - 1, c.bodyZ - 0.8), V(0, c.S[1] + 1, c.bodyZ - 0.8), q.rumpR + 0.5, q.bodyR + 0.5, white, { wa: (q.rumpW ?? 8) + 0.4, wb: (q.bodyW ?? 8) + 0.4, noise: 0.03, bias: 0.5, fx });
      r.pair((s) => r.poly([V(s * 8.6, c.H[1] + 2, c.bodyZ - 2), V(s * 8.6, c.S[1] - 2, c.bodyZ - 2), V(s * 8.6, c.S[1] - 3, c.bodyZ - q.bodyR - 5), V(s * 8.6, c.H[1] + 3, c.bodyZ - q.rumpR - 5)], white, { views: VIEW_SIDE, bias: 0.8, fx: (x, y, i, u) => (u > 0.8 ? P.gold[Math.max(1, i)] : null) }));
      // латы шеи (кольца) и грудь
      for (let k = 0; k < 5; k++) {
        const t = (k + 0.5) / 5;
        const p = V(0, lerp(c.S[1] + q.bodyR * 0.4, c.N[1], t), lerp(c.S[2] + q.bodyR * 0.45, c.N[2], t));
        r.cap(V(-1.5, p[1], p[2]), V(1.5, p[1], p[2]), lerp(5.6, 4.2, t), lerp(5.6, 4.2, t), P.steel, { wa: lerp(4.9, 3.8, t), wb: lerp(4.9, 3.8, t), front: VIEW_DOWN, bias: 1, noise: 0, views: VIEW_DOWN | VIEW_SIDE });
      }
      r.cap(V(-4, c.S[1] + 5.5, c.S[2] - 1), V(4, c.S[1] + 5.5, c.S[2] - 1), 3.4, 3.4, P.steel, { wa: 2.2, wb: 2.2, front: VIEW_DOWN, bias: 4, noise: 0 });
      r.dot(V(0, c.S[1] + 8, c.S[2] - 0.5), 1.6, P.gold[3], { front: VIEW_DOWN, views: VIEW_DOWN, bias: 5 });
      saddle(r, c, ramp("#3a1418", "#5e2028", "#8a2e36", "#b04650"), P.gold, 1.1);
    },
  }), ph, run);

// ---------- Умбрат ----------
const GHOST = ramp("#0c2c38", "#176070", "#2ea0a8", "#6ce0d0", "#c8fff0");
const GHOST_P = ramp("#1c0c38", "#3a1c70", "#6a38b0", "#a470e8", "#e0c8ff");
const BONE = ramp("#3a342c", "#6a6254", "#a39a86", "#d4cdb8", "#f4efde");

/** Язык пламени: многоугольник, мерцающий по фазе. */
export function flame(r: Rig, base: V3, h: number, w: number, tt: number, seed: number, rp: Ramp, o: { front?: number; lean?: V3 } = {}) {
  const lean = o.lean ?? V(0, -0.5, 0.2);
  const hh = h * (0.75 + 0.25 * Math.sin(tt * 2 + seed * 2.1));
  const sway = Math.sin(tt * 2 - seed) * w * 0.7;
  const tip = V(base[0] + sway + lean[0] * h * 0.3, base[1] + lean[1] * hh * 0.8, base[2] + hh * (1 - Math.abs(lean[1]) * 0.2));
  r.poly([V(base[0] - w, base[1], base[2]), V(base[0] - w * 0.35, base[1] + lean[1] * hh * 0.35, base[2] + hh * 0.55), tip, V(base[0] + w * 0.4, base[1] + lean[1] * hh * 0.3, base[2] + hh * 0.5), V(base[0] + w, base[1], base[2])], rp, { front: o.front ?? 0, bias: 1.2, noise: 0.1 });
}

export const SKEL_HORSE = (ph: number, run: boolean): Built =>
  quad({
    shY: 12, hpY: -12, legTop: 19, bodyR: 7, rumpR: 7, bodyW: 5.6, rumpW: 5.6, up: 10, low: 9.6, legR: [1.7, 1.2], legX: 3.4, stride: 7.5, lift: 5.4, foot: "hoof",
    neck: [9, 11.5], neckR: [3, 2], body: BONE, skel: true, seatY: -1.5, seatZ: -0.5, hoof: ramp("#1a1814", "#35302a", "#5a5448", "#8a8270"),
    head: (r, c) => {
      const N = c.N;
      // череп коня
      const a = V(0, N[1] + 1, N[2] + 1.5), b = V(0, N[1] + 8, N[2] - 3), m = V(0, N[1] + 14.5, N[2] - 6.3);
      r.cap(a, b, 3.5, 2.7, BONE, { wa: 2.6, wb: 2, front: VIEW_DOWN, noise: 0.15 });
      r.cap(b, m, 2.4, 2, BONE, { wa: 1.7, wb: 1.4, front: VIEW_DOWN, noise: 0.15 });
      r.cap(V(0, b[1] + 1, b[2] - 2.6), V(0, m[1] - 0.5, m[2] - 2.6), 0.9, 0.9, BONE, { wa: 1.4, wb: 1.4, front: VIEW_DOWN, tone: -1 });
      r.pair((s) => r.cap(V(s * 2, N[1], N[2] + 3), V(s * 2.2, N[1] + 1.4, N[2] + 6.5), 1.2, 0.5, BONE, { wa: 0.9, wb: 0.4, front: VIEW_DOWN }));
      r.pair((s) => r.dot(V(s * 2.5, b[1] - 1.2, b[2] + 0.7), 1.25, GHOST[4], { views: s > 0 ? VIEW_SIDE | VIEW_DOWN : VIEW_DOWN, front: VIEW_DOWN, bias: 4 }));
      // позвонки шеи
      const nb = V(0, c.S[1] + 2.5, c.S[2] + 3);
      for (let i = 0; i < 6; i++) { const t = i / 5; const p = V(0, lerp(nb[1], N[1], t), lerp(nb[2], N[2], t)); r.cap(p, V(0, p[1] + 1.4, p[2] + 0.6), 1.7, 1.5, BONE, { wa: 1.7, wb: 1.5, front: VIEW_DOWN, noise: 0.1 }); }
      // призрачная грива
      for (let i = 0; i < 7; i++) { const t = i / 6; flame(r, V(0, lerp(N[1] - 1.5, nb[1] - 1, t), lerp(N[2] + 2.5, nb[2] + 2.5, t)), 11 + (i % 3) * 2.5, 2.6, c.tt, i, GHOST, { front: 0, lean: V(0, -0.7, 0.6) }); }
    },
    tail: (r, c) => { for (let i = 0; i < 5; i++) flame(r, V(0, c.q.hpY - 6 - i * 1.2, c.H[2] + 3 - i * 0.6), 13 + (i % 2) * 4, 2.2, c.tt, i + 3, GHOST, { front: VIEW_UP, lean: V(0, -0.9, c.run ? 0.35 : -0.35) }); },
    deco: (r, c) => {
      const q = c.q, top = c.bodyZ + q.bodyR - 1;
      r.cap(c.H, c.S, 1.7, 1.7, BONE, { wa: 1.7, wb: 1.7, noise: 0.1, bias: 0.4 }); // не используется как туловище, а как хребет ниже
      r.cap(V(0, c.H[1] + 1, c.H[2] - 0.5), V(0, c.S[1] - 1, c.S[2] - 0.5), 5.4, 5.8, ramp("#07040c", "#0e0818", "#170e28"), { wa: 4.6, wb: 4.8, bias: -3, noise: 0 });
      for (let k = 0; k < 8; k++) {
        const y = lerp(c.S[1] - 1.5, c.H[1] + 3.5, k / 7), zc = lerp(c.S[2], c.H[2], k / 7);
        const rr = k < 2 || k > 5 ? 5.2 : 6.2;
        r.pair((s) => {
          r.cap(V(s * 0.8, y, zc + 5), V(s * rr * 0.9, y + 0.4, zc + 1.5), 1.2, 1.0, BONE, { wa: 1, wb: 1 });
          r.cap(V(s * rr * 0.9, y + 0.4, zc + 1.5), V(s * rr * 0.55, y + 0.8, zc - 5.2), 1.0, 0.8, BONE, { wa: 1, wb: 0.8 });
        });
      }
      r.cap(V(0, c.H[1] - 1, c.H[2] - 1), V(0, c.H[1] + 2, c.H[2] - 1), 4.2, 4, BONE, { wa: 4, wb: 3.5, tone: -1, noise: 0.1 });
      r.cap(V(0, c.S[1] - 0.5, c.S[2] - 2), V(0, c.S[1] + 2, c.S[2] - 2), 3.6, 3.4, BONE, { wa: 3.4, wb: 3, tone: -1, noise: 0.1 });
      // призрачное сердце-пламя внутри грудной клетки
      r.dot(V(0, c.S[1] - 4, c.S[2] - 1), 2.2, GHOST[3], { bias: 2 });
      void top;
      saddle(r, c, ramp("#120a1c", "#241638", "#3a2458", "#58407e"), GHOST);
      for (let i = 0; i < 3; i++) flame(r, V(0, c.S[1] + 3 + i * 2, c.S[2] + 6.5), 4, 1.2, c.tt, i + 9, GHOST, { lean: V(0, -0.3, 0.9) });
    },
  }, ph, run);

const NIGHT = ramp("#06040a", "#120c18", "#221828", "#382a42", "#554268");
const HELLFIRE = ramp("#5a0c08", "#a81c0c", "#e8541a", "#ffa030", "#ffee90");
export const NIGHTMARE = (ph: number, run: boolean): Built =>
  quad(horseQ({ body: NIGHT, mane: HELLFIRE, eye: hx("#ffd040"), heavy: true, ears: true, chanfron: undefined }, {
    legR: [2.9, 2.0], stride: 8, lift: 6,
    hoof: ramp("#5a0c08", "#c23a12", "#f08a2c", "#ffe07a"),
    head: (r, c) => {
      horseHead(r, c, { body: NIGHT, mane: ramp("#1a0a10", "#2a1018", "#44202a", "#5c2c38"), eye: hx("#ffe060") }, 1.15);
      // рога и горящая грива
      r.pair((s) => r.chain([V(s * 2.2, c.N[1] + 0.6, c.N[2] + 3.4), V(s * 3.6, c.N[1] - 1.2, c.N[2] + 7), V(s * 3.2, c.N[1] - 3.4, c.N[2] + 10.5)], 1.3, 0.4, ramp("#120c12", "#2a2028", "#4c4048", "#7a6e76"), { front: VIEW_DOWN }));
      r.pair((s) => r.dot(V(s * 3.4, c.N[1] + 6.5, c.N[2] - 1.4), 1.5, HELLFIRE[4], { views: s > 0 ? VIEW_SIDE | VIEW_DOWN : VIEW_DOWN, front: VIEW_DOWN, bias: 5 }));
      const nb = V(0, c.S[1] + 3, c.S[2] + 4);
      for (let i = 0; i < 8; i++) { const t = i / 7; flame(r, V(0, lerp(c.N[1] - 1, nb[1], t), lerp(c.N[2] + 2.5, nb[2] + 3, t)), 8 + (i % 3) * 1.6, 2, c.tt, i, HELLFIRE, { lean: V(0, -0.7, 0.7) }); }
    },
    tail: (r, c) => { for (let i = 0; i < 6; i++) flame(r, V(0, c.q.hpY - 6 - i, c.H[2] + 3 - i * 0.8), 10 + (i % 2) * 3, 1.8, c.tt, i + 2, HELLFIRE, { front: VIEW_UP, lean: V(0, -0.9, c.run ? 0.4 : -0.3) }); },
    deco: (r, c) => {
      saddle(r, c, ramp("#0e060c", "#1c0e18", "#321a28", "#4a2a3c"), HELLFIRE);
      // трещины огня на боках
      r.pair((s) => { for (let k = 0; k < 3; k++) r.cap(V(s * 7.6, c.H[1] + 5 + k * 7, c.bodyZ + 2 - k), V(s * 7.7, c.H[1] + 8 + k * 7, c.bodyZ - 2 - k), 0.5, 0.4, HELLFIRE, { wa: 0.4, wb: 0.4, views: VIEW_SIDE, front: 0, bias: 1.2, noise: 0 }); });
      // огненные венчики над копытами
      for (const [fy, sg] of [[c.S[1], -1], [c.S[1], 1], [c.H[1], -1], [c.H[1], 1]] as [number, number][]) void fy, sg;
    },
  }), ph, run);
