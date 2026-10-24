/** Звери: белый олень, лев, волки (пепельный, призрачный), кабан, медведь, песчаный ящер. */
import { ramp, type RGBA, type Ramp } from "./canvas";
import { MOUNT, P } from "./palette";
import { Rig, V, VIEW_DOWN, VIEW_SIDE, VIEW_UP, lerp, type V3 } from "./mounts-rig";
import { eyes, flow, quad, saddle, type Built, type Ctx, type Q } from "./mounts-quad";
import { flame } from "./mounts-horses";

const hx = (c: string): RGBA => ramp(c)[0];
const { IVORY, NOSE, WHITE, TAWNY, LMANE, ASH, ASHB, EMBER, SPIRIT, BOARC, BEARC, SAND, SPIKE } = MOUNT;
const F = VIEW_DOWN;

// ---------------- олень ----------------
export const STAG = (ph: number, run: boolean): Built =>
  quad({
    shY: 10, hpY: -10, legTop: 21, bodyR: 6, rumpR: 6.2, bodyW: 5, rumpW: 5.2, up: 11, low: 10.5, legR: [2, 1.3], legX: 3, stride: 8, lift: 6, foot: "hoof", pole: [1, -1],
    neck: [7, 14], neckR: [3.8, 2.6], body: WHITE, belly: ramp("#b4b8cc", "#d0d4e4", "#eceef8", "#ffffff"), seatY: -1, seatZ: 0.8, bob: 1.6,
    hoof: ramp("#3a3430", "#5e5650", "#847a70", "#aaa094"),
    head: (r, c) => {
      const N = c.N;
      const a = V(0, N[1] + 0.8, N[2] + 1.2), b = V(0, N[1] + 6.5, N[2] - 2.6), m = V(0, N[1] + 11, N[2] - 4.4);
      r.cap(a, b, 3, 2.2, WHITE, { wa: 2.5, wb: 1.9, front: F });
      r.cap(b, m, 2.1, 1.7, WHITE, { wa: 1.8, wb: 1.5, front: F });
      r.dot(V(0, m[1] + 1.4, m[2] + 0.4), 1.1, hx("#150c10"), { front: F, views: VIEW_DOWN | VIEW_SIDE, bias: 3 });
      r.pair((s) => r.cap(V(s * 2.4, N[1], N[2] + 1.5), V(s * 5.4, N[1] + 0.5, N[2] + 3.8), 1.9, 0.6, WHITE, { wa: 1.6, wb: 0.5, front: F }));
      eyes(r, V(0, b[1] - 1, b[2] + 1.4), 2.6, hx("#2a1a10"), 0.9);
      // золотистые рога с отростками
      r.pair((s) => {
        const pts: V3[] = [V(s * 1.6, N[1] - 0.2, N[2] + 2.8), V(s * 3.2, N[1] - 1.5, N[2] + 8), V(s * 5.2, N[1] - 1.2, N[2] + 12.5), V(s * 4.4, N[1] + 1.5, N[2] + 17)];
        r.chain(pts, 1.1, 0.5, IVORY, { front: F, noise: 0.05 });
        r.chain([pts[1], V(s * 2.4, N[1] + 2.2, N[2] + 11.5)], 0.8, 0.3, IVORY, { front: F });
        r.chain([pts[2], V(s * 7.8, N[1] - 0.4, N[2] + 15)], 0.8, 0.3, IVORY, { front: F });
        r.chain([pts[2], V(s * 3.4, N[1] + 3, N[2] + 15.5)], 0.7, 0.3, IVORY, { front: F });
      });
      r.dot(V(0, N[1] + 3.5, N[2] + 3.8), 0.001, WHITE[4], { views: 0 });
    },
    tail: (r, c) => { r.cap(V(0, c.q.hpY - 5.5, c.H[2] + 4), V(0, c.q.hpY - 8.5, c.H[2] + 5 + (c.run ? 1.5 : 0)), 1.7, 1.2, WHITE, { front: VIEW_UP, wa: 1.8, wb: 1.4 }); },
    deco: (r, c) => {
      saddle(r, c, ramp("#18386a", "#2a5a98", "#4a84c4", "#7ab4e8"), P.gold);
      // золотой воротник и мерцающие искры
      r.cap(V(-3, c.S[1] + 4, c.S[2] + 3), V(3, c.S[1] + 4, c.S[2] + 3), 2, 2, P.gold, { wa: 1.4, wb: 1.4, front: F, noise: 0 });
      for (let k = 0; k < 3; k++) { const a = c.tt * 2 + k * 2.1; r.dot(V(Math.sin(a) * 6, c.S[1] + k * 6 - 6, c.bodyZ + 8 + Math.cos(a) * 3), 0.8, P.gold[4], { bias: 6 }); }
    },
  }, ph, run);

// ---------------- лев ----------------
export const LION = (ph: number, run: boolean): Built =>
  quad({
    shY: 12, hpY: -11, legTop: 13, bodyR: 7, rumpR: 6, bodyW: 6, rumpW: 5.6, up: 7, low: 6.6, legR: [3.2, 2.3], legX: 3.8, stride: 7.5, lift: 4.2, foot: "paw", pole: [-1, -1],
    neck: [6, 6], neckR: [6.2, 5.4], neckW: 5, body: TAWNY, belly: ramp("#80582a", "#b0803c", "#d8aa5c", "#f0cc88"), seatY: -1.5, seatZ: 0.2, bob: 1.5,
    head: (r, c) => {
      const N = c.N;
      // грива кольцом
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, rr = 5.6;
        r.ball(V(Math.cos(a) * 4.2, N[1] + 0.5 + Math.sin(a) * 1.0 - (Math.sin(a) > 0 ? 0 : 1), N[2] + Math.sin(a) * rr * 0.9 + 0.5), 3.4, LMANE, { wa: 3.6, wb: 3.6, front: F, noise: 0.25, bias: -1 });
      }
      r.cap(V(0, N[1] - 3, N[2] - 3), V(0, N[1] + 0.5, N[2] + 1), 7, 6.5, LMANE, { wa: 6.4, wb: 6, noise: 0.25, front: F, bias: -2 });
      r.ball(V(0, N[1] + 4, N[2] - 0.5), 4.4, TAWNY, { wa: 4.2, front: F });
      r.cap(V(0, N[1] + 5.5, N[2] - 1.2), V(0, N[1] + 8.4, N[2] - 2.4), 2.6, 2.3, ramp("#8a6030", "#b88a4a", "#dcb072", "#f4d49c"), { wa: 2.5, wb: 2.2, front: F });
      r.ball(V(0, N[1] + 9.6, N[2] - 1.8), 1.2, [hx("#22100e")], { front: F, views: VIEW_DOWN | VIEW_SIDE, bias: 3 });
      r.pair((s) => r.ball(V(s * 3.4, N[1] + 2, N[2] + 4.2), 1.5, TAWNY, { front: F }));
      eyes(r, V(0, N[1] + 6, N[2] + 1.5), 2.6, hx("#2a1608"), 0.9);
    },
    tail: (r, c) => {
      const pts = flow(r, V(0, c.q.hpY - 5, c.H[2] + 2), V(0, -1, c.run ? 0.4 : -0.5), 5, 2.6, 1.5, 1, TAWNY, c, 1.3, 1, { front: VIEW_UP });
      const e = pts[pts.length - 1];
      r.ball(V(e[0], e[1] - 1.2, e[2] + 0.5), 2.4, LMANE, { front: VIEW_UP, noise: 0.25 });
    },
    deco: (r, c) => saddle(r, c, ramp("#5a0e16", "#8e1a22", "#c42c32", "#e8584a"), P.gold),
  }, ph, run);

// ---------------- волки ----------------
interface WolfLook { body: Ramp; belly: Ramp; mane: Ramp; eye: RGBA; spirit?: boolean }
function wolfQ(L: WolfLook): Q {
  return {
    shY: 10, hpY: -10, legTop: 13, bodyR: 6, rumpR: 5.4, bodyW: 5, rumpW: 4.6, up: 7.2, low: 6.8, legR: [2.4, 1.6], legX: 3.2, stride: 8, lift: 4.4, foot: "paw", pole: [-1, -1],
    neck: [6.5, 5], neckR: [5, 4], neckW: 4, body: L.body, belly: L.belly, seatY: -1.2, seatZ: 0, bob: 1.8, gallop: true,
    head: (r, c) => {
      const N = c.N;
      r.ball(V(0, N[1] + 2.5, N[2] + 0.2), 3.8, L.body, { wa: 3.4, front: F });
      r.cap(V(0, N[1] + 4.5, N[2] - 0.6), V(0, N[1] + 9.5, N[2] - 1.8), 2.3, 1.5, L.body, { wa: 2, wb: 1.3, front: F });
      r.cap(V(0, N[1] + 5, N[2] - 2.4), V(0, N[1] + 9, N[2] - 2.6), 0.8, 0.6, ramp("#d8d0c4", "#f4f0e8"), { wa: 1.2, wb: 1, front: F, noise: 0 });
      r.ball(V(0, N[1] + 10, N[2] - 1.8), 1.1, [hx("#0a0608")], { front: F, views: VIEW_DOWN | VIEW_SIDE, bias: 3 });
      r.pair((s) => r.cap(V(s * 2.2, N[1] + 1.2, N[2] + 2.6), V(s * 2.6, N[1] - 0.2, N[2] + 7), 1.7, 0.4, L.body, { wa: 1.4, wb: 0.4, front: F }));
      eyes(r, V(0, N[1] + 4.2, N[2] + 1.3), 2.4, L.eye, 0.9);
      // гребень на загривке
      if (!L.spirit) {
        const pts: V3[] = [];
        for (let i = 0; i < 7; i++) { const t = i / 6; pts.push(V(Math.sin(c.tt * (c.run ? 2 : 1) - i) * 0.5, lerp(N[1] + 0.5, c.H[1] + 2, t), lerp(N[2] + 3, c.H[2] + c.q.rumpR + 1.2, t) + Math.sin(i * 2.1) * 0.6)); }
        r.chain(pts, 1.6, 1.4, L.mane, { wa: 1.3, wb: 1.3, noise: 0.3, bias: 1 });
      } else {
        for (let i = 0; i < 6; i++) { const t = i / 5; flame(r, V(0, lerp(N[1], c.H[1] + 2, t), lerp(N[2] + 3, c.H[2] + c.q.rumpR + 1, t)), 8 + (i % 2) * 2.5, 2.2, c.tt, i, L.mane, { lean: V(0, -0.8, 0.5) }); }
      }
    },
    tail: (r, c) => {
      if (L.spirit) { for (let i = 0; i < 4; i++) flame(r, V(0, c.q.hpY - 4.5 - i * 1.2, c.H[2] + 2 - i * 0.4), 11 + i * 1.5, 2, c.tt, i + 4, L.mane, { front: VIEW_UP, lean: V(0, -0.9, c.run ? 0.35 : -0.3) }); return; }
      flow(r, V(0, c.q.hpY - 4.5, c.H[2] + 2), V(0, -1, c.run ? 0.2 : -0.7), 5, 2.4, 2.8, 1.3, L.body, c, 1, 1, { front: VIEW_UP });
    },
  };
}
export const ASH_WOLF = (ph: number, run: boolean): Built => {
  const q = wolfQ({ body: ASH, belly: ASHB, mane: EMBER, eye: EMBER[4] });
  q.deco = (r, c) => saddle(r, c, P.wood, EMBER);
  return quad(q, ph, run);
};
export const SPIRIT_WOLF = (ph: number, run: boolean): Built => {
  const q = wolfQ({ body: SPIRIT, belly: ramp("#4468b8", "#7aa4e8", "#b8d8ff", "#eefaff"), mane: ramp("#102a60", "#2858b8", "#58a0f0", "#a8e0ff", "#f0ffff"), eye: hx("#ffffff"), spirit: true });
  q.deco = (r, c) => { saddle(r, c, ramp("#1c1040", "#322068", "#54389a", "#8264cc"), ramp("#2858b8", "#58a0f0", "#a8e0ff", "#f0ffff")); };
  return quad(q, ph, run);
};

// ---------------- кабан ----------------
export const BOAR = (ph: number, run: boolean): Built =>
  quad({
    shY: 8, hpY: -9, legTop: 11, bodyR: 8.2, rumpR: 7.2, bodyW: 7.4, rumpW: 6.6, up: 5.6, low: 5.4, legR: [3, 2], legX: 4.2, stride: 6, lift: 3.6, foot: "hoof", pole: [1, -1],
    neck: [5, 3.5], neckR: [7.5, 6], neckW: 6.5, body: BOARC, belly: ramp("#3e3024", "#5e4a38", "#7e6650"), seatY: -1, seatZ: 0, bob: 1.3,
    head: (r, c) => {
      const N = c.N;
      r.cap(V(0, N[1] + 1, N[2] + 0.5), V(0, N[1] + 6, N[2] - 1.5), 5.6, 4.4, BOARC, { wa: 5, wb: 3.8, front: F });
      r.cap(V(0, N[1] + 6, N[2] - 1.6), V(0, N[1] + 10.5, N[2] - 2.6), 3.6, 3, ramp("#4a362c", "#6e5444", "#917262", "#b09484"), { wa: 3.2, wb: 2.8, front: F });
      r.ball(V(0, N[1] + 11.6, N[2] - 2.7), 2.7, ramp("#4a2a2c", "#7a4a4c", "#a8706e", "#d09a94"), { wa: 2.6, front: F });
      r.pair((s) => r.dot(V(s * 0.9, N[1] + 13, N[2] - 2.6), 0.6, hx("#140808"), { front: F, views: VIEW_DOWN, bias: 4 }));
      r.pair((s) => r.chain([V(s * 2.8, N[1] + 8, N[2] - 4), V(s * 3.6, N[1] + 11, N[2] - 3.6), V(s * 3.4, N[1] + 12.5, N[2] - 0.2)], 1.2, 0.4, IVORY, { front: F, noise: 0.05, bias: 2 }));
      r.pair((s) => r.cap(V(s * 3.2, N[1] + 1, N[2] + 4), V(s * 4.6, N[1] - 0.4, N[2] + 6.4), 1.8, 0.7, BOARC, { wa: 1.4, wb: 0.5, front: F }));
      eyes(r, V(0, N[1] + 5, N[2] + 1.2), 3.2, hx("#f0a030"), 0.8);
      // щетина вдоль хребта
      const nb = V(0, c.S[1] + 3, c.S[2] + 6);
      for (let i = 0; i < 9; i++) { const t = i / 8, y = lerp(N[1] - 1, c.H[1] + 1, t), z = lerp(N[2] + 4.5, c.H[2] + c.q.rumpR + 0.6, t); r.cap(V(0, y, z), V(0, y - 1.6, z + 3.4 + Math.sin(i * 1.7)), 1.1, 0.3, ramp("#0e0a08", "#1c1410", "#32261c"), { wa: 1, wb: 0.3, bias: 1, noise: 0, front: i < 2 ? F : 0 }); void nb; }
    },
    tail: (r, c) => r.chain([V(0, c.q.hpY - 6.5, c.H[2] + 2.5), V(Math.sin(c.tt * 2) * 1.6, c.q.hpY - 8.5, c.H[2] + 4.5), V(Math.sin(c.tt * 2) * 2, c.q.hpY - 9.5, c.H[2] + 3.2)], 1, 0.6, BOARC, { front: VIEW_UP }),
    deco: (r, c) => saddle(r, c, P.wood, ramp("#6a4210", "#a8681c", "#e0a630")),
  }, ph, run);

// ---------------- медведь ----------------
export const BEAR = (ph: number, run: boolean): Built =>
  quad({
    shY: 9, hpY: -10, legTop: 13, bodyR: 9.5, rumpR: 8.6, bodyW: 8.6, rumpW: 7.8, up: 6.4, low: 6.2, legR: [4, 3], legX: 4.8, stride: 5.5, lift: 3.4, foot: "paw", pole: [-1, -1],
    neck: [5.5, 4], neckR: [8.4, 6.4], neckW: 7, body: BEARC, belly: ramp("#2c1a14", "#4a2e22", "#684232"), seatY: -2.5, seatZ: 0, bob: 1.6,
    head: (r, c) => {
      const N = c.N;
      r.ball(V(0, N[1] + 3.8, N[2] + 0.2), 5.2, BEARC, { wa: 4.8, front: F });
      r.cap(V(0, N[1] + 6, N[2] - 1.2), V(0, N[1] + 10, N[2] - 2), 3, 2.4, ramp("#5e4430", "#8a6a4c", "#b8946c", "#dcb890"), { wa: 2.7, wb: 2.2, front: F });
      r.ball(V(0, N[1] + 11.2, N[2] - 1.8), 1.5, [hx("#0e0808")], { front: F, views: VIEW_DOWN | VIEW_SIDE, bias: 3 });
      r.pair((s) => r.ball(V(s * 3.9, N[1] + 2, N[2] + 4.8), 2, BEARC, { front: F }));
      eyes(r, V(0, N[1] + 5.4, N[2] + 1.7), 3, hx("#150a06"), 0.8);
      // горб на холке
      r.ball(V(0, c.S[1] - 1, c.S[2] + 6.5), 6, BEARC, { wa: 5.5, noise: 0.25 });
    },
    tail: (r, c) => r.ball(V(0, c.q.hpY - 8.4, c.H[2] + 4), 2, BEARC, { front: VIEW_UP }),
    deco: (r, c) => saddle(r, c, P.wood, P.steel, 1.3),
  }, ph, run);

// ---------------- песчаный ящер ----------------
export const SAND_LIZARD = (ph: number, run: boolean): Built =>
  quad({
    shY: 13, hpY: -11, legTop: 9, bodyR: 6, rumpR: 6.4, bodyW: 7, rumpW: 7.2, up: 5.5, low: 5.4, legR: [2.4, 1.7], legX: 5, splay: 3, stride: 6, lift: 3.4, foot: "claw", pole: [1, -1],
    neck: [6, 2.5], neckR: [4.6, 3.6], neckW: 4.6, body: SAND, legs: SAND, belly: ramp("#a88a52", "#cfae74", "#ecd29a"), seatY: -1, seatZ: 0.3, bob: 1,
    head: (r, c) => {
      const N = c.N;
      r.cap(V(0, N[1] + 0.5, N[2] + 0.3), V(0, N[1] + 6, N[2] - 1.2), 3.4, 2.6, SAND, { wa: 3.4, wb: 2.4, front: F });
      r.cap(V(0, N[1] + 6, N[2] - 1.2), V(0, N[1] + 10.5, N[2] - 2), 2.2, 1.7, SAND, { wa: 2, wb: 1.6, front: F });
      eyes(r, V(0, N[1] + 3.4, N[2] + 2), 2.9, hx("#f0c020"), 1.1);
      r.pair((s) => r.dot(V(s * 1, N[1] + 10.5, N[2] - 1.2), 0.5, hx("#140c08"), { front: F, views: VIEW_DOWN, bias: 4 }));
      // воротник-веер
      r.pair((s) => r.chain([V(s * 2.4, N[1] - 0.2, N[2] + 2), V(s * 5.8, N[1] - 1.6, N[2] + 5), V(s * 7, N[1] - 2.2, N[2] + 1.5)], 1.4, 0.8, SPIKE, { front: F, noise: 0.05 }));
      for (let i = 0; i < 9; i++) { const t = i / 8, y = lerp(N[1] + 1, c.H[1] - 6, t), z = lerp(N[2] + 2.8, c.H[2] + c.q.rumpR + 1, t); r.cap(V(0, y, z), V(0, y - 1.2, z + 3.2), 1.2, 0.3, SPIKE, { wa: 1, wb: 0.3, noise: 0, bias: 1, front: i < 1 ? F : 0 }); }
    },
    tail: (r, c) => {
      const pts = flow(r, V(0, c.q.hpY - 3, c.H[2] + 1), V(0, -1, 0), 8, 3.4, 5, 0.8, SAND, c, 2, 0.1, { front: VIEW_UP });
      void pts;
    },
    deco: (r, c) => saddle(r, c, ramp("#3a1c10", "#6a3220", "#9a4c30", "#c46c46"), P.gold, 1.2),
  }, ph, run);
