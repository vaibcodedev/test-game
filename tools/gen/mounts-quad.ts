/** Четвероногие маунты (конь, олень, лев, волк, кабан, медведь, ящер) на общем каркасе mounts-rig.ts. */
import { ramp } from "./canvas";
import { MOUNT, P } from "./palette";
import { Rig, V, VIEW_DOWN, VIEW_SIDE, VIEW_UP, ik2, lerp, type V3 } from "./mounts-rig";
import type { Ramp } from "./canvas";

export interface Ctx {
  ph: number;
  run: boolean;
  tt: number;
  S: V3; // плечо
  H: V3; // таз
  N: V3; // конец шеи
  bodyZ: number;
  q: Q;
  /** высота спины на заданном Y */
  top(y: number): number;
}
export interface Q {
  shY: number; hpY: number; legTop: number; bodyR: number; rumpR: number; bodyW?: number; rumpW?: number;
  up: number; low: number; legR: [number, number]; legX: number; stride: number; lift: number;
  foot: "hoof" | "paw" | "claw";
  neck: [number, number]; neckR: [number, number]; neckW?: number;
  body: Ramp; legs?: Ramp; hoof?: Ramp;
  head: (r: Rig, c: Ctx) => void;
  tail?: (r: Rig, c: Ctx) => void;
  deco?: (r: Rig, c: Ctx) => void;
  seatY: number; seatZ?: number;
  bob?: number;
  /** колено/скакательный сустав: [передние, задние] (+1 вперёд) */
  pole?: [number, number];
  belly?: Ramp;
  /** фаза шага: «рысь» по диагоналям (по умолчанию) или «галоп» */
  gallop?: boolean;
  /** скелет: не рисовать туловище и шею (их строит deco) */
  skel?: boolean;
  /** боковой вынос колен (ящер) */
  splay?: number;
  /** без передних ног (виверна, феникс, раптор) */
  noFront?: boolean;
  /** полёт: амплитуда качания тела; ноги поджаты: смещение стопы от бедра [dy,dz] */
  fly?: number;
  tuck?: { f: [number, number]; h: [number, number] };
}
export interface Built { rig: Rig; seat: V3 }

export function quad(q: Q, ph: number, run: boolean): Built {
  const r = new Rig();
  const tt = ph * Math.PI * 2;
  const bobA = (q.bob ?? 1.3) * (run ? 1 : 0.25);
  const bob = q.fly ? Math.cos(tt) * q.fly * (run ? 1 : 0.5) : run ? Math.sin(tt * 2 + 0.6) * bobA : Math.sin(tt) * 0.5;
  const pitch = run ? Math.sin(tt) * 0.9 : Math.sin(tt) * 0.25;
  const bodyZ = q.legTop + q.bodyR * 0.45 + bob;
  const S: V3 = V(0, q.shY, bodyZ + pitch), H: V3 = V(0, q.hpY, bodyZ - pitch);
  const N: V3 = V(0, q.shY + q.neck[0], bodyZ + q.neck[1] + pitch * 1.5 + (run ? Math.sin(tt * 2 - 0.4) * 0.8 : Math.sin(tt - 0.5) * 0.8));
  const top = (y: number) => {
    const t = (y - q.hpY) / (q.shY - q.hpY);
    return lerp(H[2], S[2], t) + lerp(q.rumpR, q.bodyR, Math.max(0, Math.min(1, t)));
  };
  const c: Ctx = { ph, run, tt, S, H, N, bodyZ, q, top };
  const legs = q.legs ?? q.body;
  // ноги
  const legPole = q.pole ?? [1, -1];
  for (const front of [true, false]) for (const sg of [-1, 1]) {
    if (q.noFront && front) continue;
    const y = front ? q.shY - 1 : q.hpY + 1;
    const hip: V3 = V(sg * q.legX, y, (front ? S[2] : H[2]) - q.bodyR * 0.15);
    const phase = q.gallop ? (front ? (sg < 0 ? 0 : 0.12) : (sg < 0 ? 0.5 : 0.62)) : front ? (sg < 0 ? 0 : 0.5) : sg > 0 ? 0 : 0.5;
    const u = (ph + phase) % 1;
    let fy = y, fz = 0;
    if (run) {
      if (u < 0.58) fy = y + q.stride * (1 - 2 * (u / 0.58));
      else { const s = (u - 0.58) / 0.42; fy = y - q.stride + 2 * q.stride * s; fz = q.lift * Math.sin(Math.PI * s); }
    }
    const hoofH = q.foot === "hoof" ? 1.5 : 0.6;
    let foot: V3 = V(sg * q.legX, fy, hoofH + fz);
    if (q.tuck) { const tk = front ? q.tuck.f : q.tuck.h; foot = V(sg * q.legX, hip[1] + tk[0] + Math.sin(tt - (front ? 0 : 0.8)) * 1.2, hip[2] + tk[1] + Math.cos(tt) * 0.8); }
    const knee = ik2(hip, foot, q.up, q.low, front ? legPole[0] : legPole[1]);
    knee[0] = sg * (q.legX + (q.splay ?? 0));
    r.cap(hip, knee, q.legR[0], q.legR[0] * 0.8, legs, { wa: q.legR[0] * 0.9, wb: q.legR[0] * 0.75 });
    r.cap(knee, foot, q.legR[1] * 1.05, q.legR[1], legs, { wa: q.legR[1], wb: q.legR[1] });
    if (q.foot === "hoof") r.cap(V(foot[0], foot[1], foot[2] + 1.2), V(foot[0], foot[1] + 0.4, 0.4), q.legR[1] + 0.6, q.legR[1] + 0.9, q.hoof ?? ramp("#0c0808", "#1a1210", "#2c201a", "#46362c"), { noise: 0 });
    else if (q.foot === "paw") r.cap(V(foot[0], foot[1] - 0.4, foot[2] + 0.8), V(foot[0], foot[1] + 1.8, 0.8), q.legR[1] + 0.9, q.legR[1] + 0.8, legs, { noise: 0.1 });
    else r.cap(V(foot[0], foot[1], foot[2] + 0.8), V(foot[0], foot[1] + 2.4, 0.6), q.legR[1] + 0.3, q.legR[1] * 0.4, P.bone, { noise: 0 });
  }
  // туловище, грудь и круп
  if (!q.skel) r.cap(H, S, q.rumpR, q.bodyR, q.body, { wa: q.rumpW ?? q.rumpR * 0.85, wb: q.bodyW ?? q.bodyR * 0.85 });
  if (q.belly && !q.skel) r.cap(V(0, q.hpY + 2, H[2] - q.rumpR * 0.5), V(0, q.shY - 1, S[2] - q.bodyR * 0.55), q.rumpR * 0.45, q.bodyR * 0.45, q.belly, { wa: q.rumpR * 0.5, wb: q.bodyR * 0.5, tone: 0, noise: 0.05 });
  // шея
  const nb: V3 = V(0, q.shY + q.bodyR * 0.35, S[2] + q.bodyR * 0.45);
  if (!q.skel) r.cap(nb, N, q.neckR[0], q.neckR[1], q.body, { wa: (q.neckW ?? q.neckR[0]) * 0.85, wb: q.neckR[1] * 0.85, front: VIEW_DOWN });
  q.head(r, c);
  q.tail?.(r, c);
  q.deco?.(r, c);
  const seat: V3 = V(0, q.seatY, top(q.seatY) + (q.seatZ ?? 0.5));
  return { rig: r, seat };
}

// ---------- общие детали ----------
/** Седло с подпругой: тёмная подушка на спине и передний лоскут сбоку (поверх ноги всадника). */
export function saddle(r: Rig, c: Ctx, col: Ramp, trim: Ramp = P.gold, w = 1) {
  const y = c.q.seatY, z = c.top(y);
  r.cap(V(0, y - 4.5 * w, z - 0.5), V(0, y + 4 * w, z - 0.3), 2.2, 2.2, col, { wa: c.q.bodyR * 0.95 * 0.88, wb: c.q.bodyR * 0.95 * 0.88, noise: 0.05, bias: 1 });
  r.cap(V(0, y - 5 * w, z + 1.4), V(0, y - 5 * w, z + 0.2), 1.6, 1.4, trim, { wa: 3.2, wb: 3.2, bias: 1.2, noise: 0 });
  r.cap(V(0, y + 4.4 * w, z + 1.2), V(0, y + 4.4 * w, z + 0.2), 1.2, 1.2, trim, { wa: 2.2, wb: 2.2, bias: 1.2, noise: 0 });
  const xf = c.q.bodyR * 0.85, zz = z - 0.8;
  const flap = (s: number, front: number) => {
    r.poly([V(s * xf, y - 3.2, zz), V(s * xf, y + 3.2, zz), V(s * xf, y + 3.2, zz - 6), V(s * xf, y - 3.2, zz - 6)], col, { views: front ? VIEW_SIDE : VIEW_DOWN | VIEW_UP, front, bias: 3, noise: 0.05, fx: (px, py, i, u) => (u > 0.86 ? trim[Math.max(1, i)] : null) });
  };
  flap(1, VIEW_SIDE);
  flap(-1, 0);
}
export function eyes(r: Rig, p: V3, spread: number, col = ramp("#000000", "#0c0608", "#f6efe0", "#ffffff")[1], size = 0.9) {
  r.pair((s) => r.dot(V(s * spread, p[1], p[2]), size, col, { views: s > 0 ? VIEW_SIDE | VIEW_DOWN : VIEW_DOWN, bias: 3 }));
}
/** Развевающийся хвост/грива: цепочка от точки по направлению с волной. */
export function flow(r: Rig, from: V3, dir: V3, n: number, seg: number, r0: number, r1: number, rp: Ramp, c: Ctx, wave = 1, droop = 0.5, o: { front?: number } = {}) {
  const pts: V3[] = [from];
  let cur = from;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const sw = Math.sin(c.tt * (c.run ? 2 : 1) - i * 0.7) * wave * k * (c.run ? 1.6 : 0.5);
    cur = V(cur[0] + sw * 0.8 + dir[0] * seg, cur[1] + dir[1] * seg, cur[2] + dir[2] * seg - droop * k * seg * (c.run ? 0.4 : 1) + (c.run ? Math.sin(c.tt * 2 - i * 0.5) * 0.5 * k : 0));
    pts.push(cur);
  }
  r.chain(pts, r0, r1, rp, { noise: 0.2, front: o.front ?? 0 });
  return pts;
}

export const { BROWN, DARKMANE } = MOUNT;
