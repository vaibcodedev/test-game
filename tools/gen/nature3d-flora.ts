/**
 * Объёмная растительность и мелочь природы (продолжение tools/gen/nature3d.ts): ели (снежные и лесные), лиственные деревья, мёртвые пепельные
 * и болотные деревья, пальмы, кактусы, сухие и лесные кусты, пни, брёвна, грибы, камыш, кости и черепа, рудные кристаллы.
 * По 3–4 варианта: FLORA3D[id] = () => [вариант0, …]. Непроходимость прежняя (по стволу/основанию, shared/map.ts и shared/decor.ts).
 * В игру по умолчанию не включено (ждёт утверждения): tools/nature-compare.ts.
 */
import { hex, ramp, type PC, type RGBA, type Ramp } from "./canvas";
import { BIOME, P } from "./palette";
import {
  Scene, capsule, clamp, cone, crystal, cylinder, ellipsoid, facetedRock, fbm, logX, noise3, render, smin, sphere, type Mat, type SDF, type V3,
} from "./nature3d-lib";
import { R as RK } from "./nature3d";

const R = {
  ...RK,
  pine: ramp("#0c2018", "#143022", "#1e4630", "#2a5c3a", "#3c7848"),
  leaf: ramp("#16301a", "#22481f", "#346628", "#4e8834", "#76ae48"),
  leafLight: ramp("#2a4a1a", "#3e6a24", "#5a8c2e", "#7aac3c", "#a6cc5a"),
  bark: ramp("#22160f", "#36241a", "#4e3424", "#6a4a32", "#8a6644"),
  deadAsh: ramp("#1e1a1c", "#2e2828", "#463e3a", "#625850", "#80746a"),
  bog: ramp("#1a1a12", "#2a2a1a", "#3e3c24", "#565232", "#706a42"),
  bogMoss: ramp("#1c2a18", "#2a3c22", "#3e522c", "#566c38", "#728848"),
  palmBark: ramp("#3a2818", "#563c22", "#76542e", "#987040", "#b88e58"),
  palmLeaf: ramp("#163c1c", "#245a26", "#38782e", "#56963a", "#82b852"),
  cactus: BIOME.cactusG,
  dry: ramp("#3a2a1a", "#56402a", "#76583a", "#987650", "#b8966a"),
  wood: ramp("#2a1a10", "#422a1a", "#5e3e26", "#7c5634", "#a07448"),
  woodCut: ramp("#6a4a2a", "#8c6638", "#ae844a", "#cca462", "#e6c486"),
  bone: ramp("#5a5246", "#847a6a", "#aea48e", "#d2c8b0", "#f0e8d4"),
  capRed: ramp("#4a0c10", "#7a161a", "#ae2a26", "#d84a3a", "#f08060"),
  capGlow: ramp("#0c3a4a", "#146070", "#22909a", "#4cc8c0", "#aaf4e4"),
  stem: ramp("#8a7a62", "#aa9a7e", "#c8b89a", "#e2d4b6", "#f6ecd4"),
  reed: ramp("#2e3a18", "#44521e", "#5e6c28", "#7c8a36", "#a0aa4a"),
  cattail: ramp("#2a160c", "#3e2214", "#56321c", "#704426", "#8c5a34"),
  amethyst: ramp("#2a0e4a", "#46207a", "#6a3aaa", "#9a6ad4", "#d0b0ff"),
  obsid: ramp("#08060e", "#141020", "#221c34", "#342a4e", "#5a4c82"),
};
const O = (c: string): RGBA => hex(c);
const GRASS_B = hex("#4a6a38"), SAND_B = hex("#c49a60"), SNOW_B = hex("#b8cce4"), ASH_B = hex("#5a4a44"), BOG_B = hex("#3e4a2a");

// ---------- общие части ----------
const leafTex = (seed: number, f = 0.42, a = 1.6) => (x: number, y: number, z: number) => (noise3(x * f, y * f, z * f, seed) - 0.5) * a;
const barkTex = (seed: number) => (x: number, y: number, z: number) => Math.sin(Math.atan2(y, x) * 9 + fbm(x * 0.1, y * 0.1, z * 0.15, seed) * 6) * 0.45 + (fbm(x * 0.3, y * 0.3, z * 0.12, seed) - 0.5) * 0.8;
/** Неровная шапка листвы: шар с крупными комками. */
const leafBlob = (c: V3, r: number, seed: number, amp = 0.32): SDF => {
  const s = sphere(c[0], c[1], c[2], r);
  return (x, y, z) => s(x, y, z) - (noise3(x * 0.32, y * 0.32, z * 0.32, seed) - 0.45) * r * amp;
};
/** Ствол с корнями: сужающаяся капсула и 3–4 корня в стороны. */
function trunk(sc: Scene, m: number, h: number, r0: number, r1: number, seed: number, lean: [number, number] = [0, 0], roots = 4) {
  const top: V3 = [lean[0], lean[1], h];
  sc.add(capsule([0, 0, -1], top, r0, r1), m, [lean[0] / 2, lean[1] / 2, h / 2], h / 2 + r0 + 2);
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + seed;
    sc.add(capsule([0, 0, r0 * 0.9], [Math.cos(a) * r0 * 2.1, Math.sin(a) * r0 * 1.6, -0.5], r0 * 0.55, r0 * 0.25), m, [Math.cos(a) * r0, Math.sin(a) * r0, r0 * 0.4], r0 * 2.4, 1.2);
  }
  return top;
}
/** Ветвление (мёртвые деревья): рекурсивные капсулы с изгибом. */
function branches(sc: Scene, m: number, from: V3, dir: V3, len: number, r: number, depth: number, seed: number) {
  let s = seed;
  const rnd = () => { s = (s * 16807 + 7) % 2147483647; return s / 2147483647; };
  const go = (p: V3, d: V3, L: number, rr: number, lvl: number) => {
    const bend: V3 = [d[0] + (rnd() - 0.5) * 0.5, d[1] + (rnd() - 0.5) * 0.3, d[2] + (rnd() - 0.3) * 0.25];
    const n = Math.hypot(...bend); const e: V3 = [p[0] + (bend[0] / n) * L, p[1] + (bend[1] / n) * L, p[2] + (bend[2] / n) * L];
    sc.add(capsule(p, e, rr, rr * 0.62), m, [(p[0] + e[0]) / 2, (p[1] + e[1]) / 2, (p[2] + e[2]) / 2], L / 2 + rr + 1, 0.6);
    if (lvl <= 0 || rr < 0.7) return;
    const k = 2;
    for (let i = 0; i < k + 1; i++) {
      const a = rnd() * Math.PI * 2, sp = 0.55 + rnd() * 0.5;
      go(e, [bend[0] / n + Math.cos(a) * sp, bend[1] / n + Math.sin(a) * sp * 0.6, bend[2] / n + 0.1], L * (0.62 + rnd() * 0.15), rr * 0.62, lvl - 1);
    }
  };
  go(from, dir, len, r, depth);
}

// ---------- ели ----------
/** Ель: ярусы-конусы с лапами; снежная — снег на верхних гранях лап и шапка на макушке. */
export function pine(v: number, snowy: boolean): PC {
  const leaf: Mat = { r: R.pine, out: O("#06120c"), bounce: snowy ? SNOW_B : GRASS_B, tex: leafTex(11 + v, 0.5), ...(snowy ? { snow: { nz: 0.62, r: R.snow, noise: 0.45 } } : {}) };
  const bark: Mat = { r: R.bark, out: O("#120a06"), tex: barkTex(3) };
  const sc = new Scene([leaf, bark]);
  const H = [58, 46, 70, 38][v], W = [17, 14, 19, 13][v], tiers = [5, 4, 6, 4][v];
  trunk(sc, 1, H * 0.5, 2.6, 1.6, v, [0, 0], 3);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, z0 = H * 0.16 + t * H * 0.72, r = W * (1 - t * 0.78), hh = H * 0.32 * (1 - t * 0.35);
    sc.add(cone(0, 0, z0, z0 + hh, r, 8 + (i % 2), 0.22, i * 1.7 + v), 0, [0, 0, z0 + hh / 2], r + hh / 2 + 2);
  }
  
  return render(sc, { w: 64, h: 110, inner: 4 });
}

// ---------- лиственные ----------
export function oak(v: number): PC {
  const leaf: Mat = { r: v === 3 ? R.leafLight : R.leaf, out: O("#0a1a0c"), bounce: GRASS_B, tex: leafTex(21 + v, 0.28, 0.9) };
  const bark: Mat = { r: R.bark, out: O("#120a06"), tex: barkTex(5) };
  const sc = new Scene([leaf, bark]);
  // размер — как у старых дубов паков (малый 64, средний 96, большой 96×128), крона пышная и круглая
  const H = [24, 17, 30, 15][v], C = [27, 20, 35, 18][v];
  const top = trunk(sc, 1, H, 3.8 + v * 0.3, 2.4, v, [v % 2 ? 1.5 : -1, 0], 5);
  for (const a of [0.6, 2.4, 4.2, 5.5]) sc.add(capsule([top[0] * 0.8, 0, H * 0.7], [Math.cos(a + v) * C * 0.55, Math.sin(a + v) * C * 0.35, H + C * 0.4], 1.9, 1.0), 1, [0, 0, H], C, 0.8);
  let s = 31 + v * 7;
  const rnd = () => { s = (s * 16807 + 3) % 2147483647; return s / 2147483647; };
  const cc: V3 = [top[0], 0, H + C * 0.72];
  sc.add(leafBlob(cc, C * 0.72, 39, 0.22), 0, cc, C * 0.72 * 1.3 + 2, 2.5); // ядро кроны без дыр
  const n = [16, 12, 20, 10][v];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * 2.618 + rnd() * 0.6, el = -0.35 + rnd() * 1.25;
    const c: V3 = [cc[0] + Math.cos(a) * Math.cos(el) * C * 0.62, Math.sin(a) * Math.cos(el) * C * 0.48, cc[2] + Math.sin(el) * C * 0.5];
    const r = C * (0.34 + rnd() * 0.14);
    sc.add(leafBlob(c, r, 41 + i, 0.26), 0, c, r * 1.3 + 2, 2.5);
  }
  return render(sc, { w: 140, h: 150, inner: 5 });
}

// ---------- мёртвые деревья ----------
export function deadTree(v: number, kind: "ash" | "bog"): PC {
  const bark: Mat = { r: kind === "ash" ? R.deadAsh : R.bog, out: O(kind === "ash" ? "#0a0808" : "#0c0c06"), bounce: kind === "ash" ? ASH_B : BOG_B, tex: barkTex(9 + v) };
  const moss: Mat = { r: R.bogMoss, out: O("#0c160a"), tex: leafTex(5, 0.8) };
  const ember: Mat = { r: RK.ember, out: O("#3a0c04"), emit: true };
  const sc = new Scene([bark, moss, ember]);
  const H = [30, 40, 24, 34][v];
  const lean: [number, number] = [[2, 0], [-3, 1], [4, -1], [-1, 0]][v] as [number, number];
  const top = trunk(sc, 0, H, 3.4, 1.8, v * 3, lean, 4);
  branches(sc, 0, top, [0.2 * (v - 1.5), 0, 1], H * 0.45, 2.3, 3, 101 + v * 13);
  branches(sc, 0, [lean[0] * 0.5, lean[1] * 0.5, H * 0.55], [v % 2 ? 1 : -1, 0, 0.6], H * 0.4, 1.9, 3, 201 + v);
  branches(sc, 0, [lean[0] * 0.4, lean[1] * 0.4, H * 0.38], [v % 2 ? -1 : 1, 0.2, 0.5], H * 0.3, 1.5, 2, 251 + v);
  // гуще: ещё ветви по стволу во все стороны
  for (let i = 0; i < 4; i++) {
    const t = 0.5 + i * 0.12, a = i * 2.2 + v;
    branches(sc, 0, [lean[0] * t, lean[1] * t, H * t], [Math.cos(a), Math.sin(a) * 0.5, 0.75], H * (0.32 - i * 0.03), 1.4, 3, 301 + v * 17 + i * 5);
  }
  if (kind === "bog") {
    // свисающий мох с веток
    for (let i = 0; i < 14; i++) {
      const x = top[0] + (noise3(i, v, 0, 3) - 0.5) * H * 1.2, y = (noise3(i, v, 1, 3) - 0.5) * 6, z = H * (0.7 + noise3(i, v, 2, 3) * 0.45);
      sc.add(capsule([x, y, z], [x + 0.5, y, z - 6 - noise3(i, v, 3, 3) * 8], 1.3, 0.5), 1, [x, y, z - 6], 9);
    }
  } else {
    // тлеющая трещина в стволе
    sc.add(capsule([0.4, -3.1, 4], [lean[0] * 0.25, -2.6, 11], 0.7), 2, [0, -3, 7], 6);
  }
  return render(sc, { w: 96, h: 110, inner: 4 });
}

// ---------- пальма ----------
export function palm(v: number): PC {
  const bark: Mat = { r: R.palmBark, out: O("#1e1208"), bounce: SAND_B, tex: (x, y, z) => (Math.sin(z * 1.6) > 0.55 ? -1 : 0.2) };
  const leaf: Mat = { r: R.palmLeaf, out: O("#0a1e0c"), tex: leafTex(7, 0.7) };
  const nut: Mat = { r: R.wood, out: O("#120a04") };
  const sc = new Scene([bark, leaf, nut]);
  const H = [46, 38, 54][v], bend = [8, -6, 12][v];
  const seg = 6; let p: V3 = [0, 0, -1];
  for (let i = 1; i <= seg; i++) {
    const t = i / seg; const q: V3 = [bend * t * t, 0, H * t];
    sc.add(capsule(p, q, 2.8 - t * 1.0, 2.6 - t * 1.0), 0, [(p[0] + q[0]) / 2, 0, (p[2] + q[2]) / 2], H / seg + 4, 0.5); p = q;
  }
  const top = p;
  const n = [7, 6, 8][v];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + v * 0.4, L = 20 + (i % 3) * 3;
    let q = top;
    for (let k = 1; k <= 5; k++) {
      const t = k / 5; const e: V3 = [top[0] + Math.cos(a) * L * t, Math.sin(a) * L * t * 0.75, top[2] + 3 + Math.sin(t * Math.PI * 0.8) * 5 - t * t * 13];
      sc.add(capsule(q, e, 2.4 * (1 - t * 0.6), 2.4 * (1 - t * 0.75)), 1, [(q[0] + e[0]) / 2, (q[1] + e[1]) / 2, (q[2] + e[2]) / 2], L / 5 + 4, 0.4);
      q = e;
    }
  }
  for (const a of [0.5, 2.6, 4.4]) sc.add(sphere(top[0] + Math.cos(a) * 2.2, Math.sin(a) * 2.2, top[2] - 2, 1.8), 2, [top[0], 0, top[2] - 2], 4.5);
  return render(sc, { w: 96, h: 100, inner: 4 });
}

// ---------- кактусы ----------
const ribbed = (sd: SDF, cx: number, cy: number, ribs: number, amp: number): SDF => (x, y, z) => sd(x, y, z) - Math.cos(Math.atan2(y - cy, x - cx) * ribs) * amp;
export function cactus(v: number): PC {
  const g: Mat = { r: R.cactus, out: O("#0a2214"), bounce: SAND_B, tex: (x, y, z) => (noise3(x * 0.9, y * 0.9, z * 0.9, 13) > 0.84 ? 1.4 : 0) };
  const fl: Mat = { r: ramp("#6a1030", "#a01e48", "#d83a6a", "#f07898", "#ffd0dc"), out: O("#3a0818") };
  const sc = new Scene([g, fl]);
  const H = [36, 28, 42, 22][v];
  sc.add(ribbed(capsule([0, 0, -2], [0, 0, H], 4.2, 3.6), 0, 0, 10, 0.35), 0, [0, 0, H / 2], H / 2 + 5);
  const arms: [number, number, number][] = [[[-1, 0.45, 9], [1, 0.6, 7]], [[1, 0.4, 7]], [[-1, 0.35, 10], [1, 0.55, 8], [-1, 0.75, 5]], []][v] as [number, number, number][];
  arms.forEach(([side, at, up], i) => {
    const z = H * at, x1 = side * 8;
    sc.add(capsule([0, 0, z], [x1, i % 2 ? -1 : 1, z], 2.6), 0, [x1 / 2, 0, z], 6, 1.2);
    sc.add(ribbed(capsule([x1, i % 2 ? -1 : 1, z], [x1, i % 2 ? -1 : 1, z + up], 2.6, 2.3), x1, i % 2 ? -1 : 1, 8, 0.3), 0, [x1, 0, z + up / 2], up / 2 + 4, 1.2);
  });
  if (v !== 1) sc.add(sphere(0.5, -0.5, H + 3.4, 1.8), 1, [0, 0, H + 3], 3);
  return render(sc, { w: 48, h: 64, inner: 3 });
}
/** Малый кактус: бочонок (0, 2) или опунция с лепёшками (1, 3). */
export function cactusSmall(v: number): PC {
  const g: Mat = { r: R.cactus, out: O("#0a2214"), bounce: SAND_B, tex: (x, y, z) => (noise3(x * 0.9, y * 0.9, z * 0.9, 17) > 0.84 ? 1.4 : 0) };
  const fl: Mat = { r: ramp("#7a5a08", "#b08410", "#e0b020", "#f8d860", "#fff4b0"), out: O("#3a2a04") };
  const sc = new Scene([g, fl]);
  if (v % 2 === 0) {
    const pts: [number, number, number][] = v === 0 ? [[0, 0, 6], [7, -2, 4.2]] : [[0, 0, 7.5], [-8, -1, 4.6], [7, -4, 3.6]];
    for (const [x, y, r] of pts) {
      sc.add(ribbed(ellipsoid(x, y, r * 0.9, r, r, r * 1.15), x, y, 12, 0.45), 0, [x, y, r], r * 1.3 + 2);
      sc.add(sphere(x, y - 0.5, r * 2, 1.3), 1, [x, y, r * 2], 2.5);
    }
  } else {
    const pads: [V3, number, number, number][] = v === 1
      ? [[[0, 0, 6], 5, 6.5, 0], [[-5, -1, 13], 3.6, 4.8, -0.5], [[5, 0, 12], 3.4, 4.5, 0.6]]
      : [[[0, 0, 5], 5.5, 5.5, 0.2], [[6, -1, 10], 3.6, 4.6, 0.7], [[-6, 1, 9], 3.2, 4.2, -0.6], [[-2, -2, 14], 2.8, 3.4, -0.2]];
    for (const [c, rx, rz, tilt] of pads) {
      const e = ellipsoid(0, 0, 0, rx, 1.6, rz);
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      sc.add((x, y, z) => { const X = x - c[0], Z = z - c[2]; return e(X * ct - Z * st, y - c[1], X * st + Z * ct); }, 0, c, Math.max(rx, rz) + 2, 0.6);
      sc.add(sphere(c[0] - Math.sin(tilt) * rz, c[1] - 0.5, c[2] + Math.cos(tilt) * rz + 0.6, 1.2), 1, c, Math.max(rx, rz) + 3);
    }
  }
  return render(sc, { w: 48, h: 40, inner: 3 });
}
/** Сухой куст пустыни/пепла: ветвистый, без листьев. */
export function dryBush(v: number, ash = false): PC {
  const m: Mat = { r: ash ? R.deadAsh : R.dry, out: O(ash ? "#0a0808" : "#1e140a"), bounce: ash ? ASH_B : SAND_B };
  const sc = new Scene([m]);
  const n = [6, 5, 7, 4][v];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + v;
    branches(sc, 0, [0, 0, 0], [Math.cos(a) * 0.7, Math.sin(a) * 0.5, 1], 6 + (i % 3) * 1.5, 1.0, 2, 300 + i * 7 + v * 31);
  }
  return render(sc, { w: 48, h: 44, inner: 3, shadow: 0.8 });
}

// ---------- кусты ----------
export function bush(v: number, flower?: RGBA): PC {
  const leaf: Mat = { r: v % 2 ? R.leafLight : R.leaf, out: O("#0a1a0c"), bounce: GRASS_B, tex: leafTex(51 + v, 0.55) };
  const fl: Mat = { r: flower ? ([0.45, 0.7, 0.88, 1, 1.25].map((k) => [Math.min(255, flower[0] * k), Math.min(255, flower[1] * k), Math.min(255, flower[2] * k), 255]) as Ramp) : R.capRed, out: flower ? ([flower[0] * 0.3, flower[1] * 0.3, flower[2] * 0.3, 255] as RGBA) : O("#2a0a10"), spec: 0.92 };
  const sc = new Scene([leaf, fl]);
  const W = [10, 8, 13, 7][v], Hh = [8, 7, 10, 6][v], n = [6, 5, 8, 4][v];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + v * 0.7, d = W * 0.5;
    const c: V3 = [Math.cos(a) * d, Math.sin(a) * d * 0.6, Hh * 0.55 + (i % 2) * 1.5];
    sc.add(leafBlob(c, W * 0.48, 61 + i, 0.4), 0, c, W * 0.48 * 1.4 + 2, 1.5);
  }
  const top: V3 = [0, 0, Hh * 1.05];
  sc.add(leafBlob(top, W * 0.55, 67, 0.4), 0, top, W * 0.55 * 1.4 + 2, 1.5);
  // цветы — по поверхности куста спереди и сверху (видны с камеры), ягоды — немного
  const k = flower ? 10 + v * 2 : 3;
  for (let i = 0; i < k; i++) {
    const a = i * 2.39996 + v, el = flower ? 0.15 + ((i * 0.618) % 1) * 1.1 : 0.3;
    const dir: V3 = [Math.cos(a) * Math.cos(el), -Math.abs(Math.sin(a)) * Math.cos(el) - 0.25, Math.sin(el)];
    const c: V3 = [dir[0] * W * 0.95, dir[1] * W * 0.75, Hh * 0.75 + dir[2] * W * 0.62];
    sc.add(sphere(c[0], c[1], c[2], flower ? 1.7 : 1.3), 1, c, 2.8);
  }
  return render(sc, { w: 56, h: 48, inner: 4 });
}

// ---------- пни, брёвна ----------
const ringsTop = (cx: number, cy: number) => (x: number, y: number, z: number, n: V3) => (n[2] > 0.7 ? Math.sin(Math.hypot(x - cx, y - cy) * 1.7) * 0.6 : 0);
export function stump(v: number): PC {
  const bark: Mat = { r: R.wood, out: O("#120a04"), bounce: GRASS_B, tex: barkTex(13) };
  const cut: Mat = { r: R.woodCut, out: O("#2a1a0c"), tex: ringsTop(0, 0) };
  const moss: Mat = { r: R.bogMoss, out: O("#0c160a") };
  const sc = new Scene([bark, cut, moss]);
  const r = [6.5, 4.5, 8, 5][v], h = [7, 5, 6, 9][v];
  const body = cylinder(0, 0, -1, h, r, 0.8);
  sc.add((x, y, z) => body(x, y, z) - Math.cos(Math.atan2(y, x) * 11) * 0.25, 0, [0, 0, h / 2], r + h / 2 + 2);
  // срез: тонкий слой сверху (свой материал)
  sc.add(cylinder(0, 0, h - 0.6, h + 0.25 - (v === 3 ? 2 : 0), r - 0.7, 0.4), 1, [0, 0, h], r + 1);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + v;
    sc.add(capsule([Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, h * 0.4], [Math.cos(a) * (r + 3.5), Math.sin(a) * (r + 2.5), -0.5], 2, 0.8), 0, [Math.cos(a) * r, Math.sin(a) * r, 1], r * 0.6 + 5, 1);
  }
  if (v === 2) sc.add(ellipsoid(-r * 0.6, -r * 0.5, h * 0.6, 2.5, 2, 2), 2, [-r * 0.6, -r * 0.5, h * 0.6], 3, 0.8);
  if (v === 3) sc.add(capsule([0, 0, h], [3, -1, h + 6], 1.6, 0.6), 0, [1, 0, h + 3], 5); // обломок
  return render(sc, { w: 56, h: 44, inner: 3 });
}
export function log(v: number): PC {
  const bark: Mat = { r: R.wood, out: O("#120a04"), bounce: GRASS_B, tex: (x, y, z) => Math.sin(Math.atan2(z - 4, y) * 8 + x * 0.15) * 0.4 + (fbm(x * 0.2, y * 0.3, z * 0.3, 5) - 0.5) * 0.7 };
  const cut: Mat = { r: R.woodCut, out: O("#2a1a0c"), tex: (x, y, z, n) => (Math.abs(n[0]) > 0.7 ? Math.sin(Math.hypot(y, z - (v === 2 ? 3 : 4)) * 1.8) * 0.6 : 0) };
  const sc = new Scene([bark, cut]);
  const half = [14, 10, 12, 16][v], r = [4, 3.5, 3, 4.5][v];
  const rot = [0.2, -0.3, 0.45, -0.1][v], cr = Math.cos(rot), sr = Math.sin(rot);
  const L = logX(0, 0, r, half, r, 0.5), C = logX(0, 0, r, half + 0.3, r - 0.6, 0.3);
  const rotP = (f: SDF): SDF => (x, y, z) => f(x * cr + y * sr, -x * sr + y * cr, z);
  sc.add(rotP((x, y, z) => Math.max(L(x, y, z), Math.abs(x) - half + 0.6)), 0, [0, 0, r], half + r + 1);
  sc.add(rotP((x, y, z) => Math.max(C(x, y, z), -(Math.abs(x) - half + 0.6))), 1, [0, 0, r], half + r + 1);
  if (v === 3) sc.add(rotP(capsule([4, 0, r * 1.6], [8, -3, r * 2.6], 1.1, 0.6)), 0, [5, 0, r * 2], 5);
  return render(sc, { w: 64, h: 40, inner: 3 });
}

// ---------- грибы, камыш ----------
export function mushrooms(v: number, glow: boolean): PC {
  const cap: Mat = { r: glow ? R.capGlow : R.capRed, out: O(glow ? "#06202a" : "#2a0608"), spec: 0.94, emit: glow,
    tex: glow ? undefined : (x, y, z, n) => (n[2] > 0.2 && noise3(x * 0.9, y * 0.9, z * 0.9, 7) > 0.74 ? 2.5 : 0) };
  const stem: Mat = { r: R.stem, out: O("#3a3020") };
  const sc = new Scene([cap, stem]);
  const set: [number, number, number, number][] = ([[[0, 0, 7, 4], [6, -3, 4.5, 2.8], [-5, -2, 3, 2]], [[0, 0, 9, 5]], [[-3, 0, 6, 3.6], [3, -1, 8, 4], [7, -4, 3, 2.2], [-7, -4, 2.5, 1.8]], [[0, 0, 5, 3.5], [4, -2, 3.6, 2.4]]] as [number, number, number, number][][])[v];
  for (const [x, y, h, r] of set) {
    sc.add(capsule([x, y, -0.5], [x, y, h], r * 0.36, r * 0.3), 1, [x, y, h / 2], h / 2 + 2);
    sc.add((X, Y, Z) => Math.max(ellipsoid(x, y, h, r, r, r * 0.7)(X, Y, Z), h - 0.6 - Z), 0, [x, y, h], r + 1.5);
  }
  return render(sc, { w: 40, h: 36, inner: 2, shadow: 0.8 });
}
export function reeds(v: number): PC {
  const st: Mat = { r: R.reed, out: O("#141a08"), bounce: BOG_B };
  const ct: Mat = { r: R.cattail, out: O("#140a04") };
  const sc = new Scene([st, ct]);
  const n = [7, 5, 9, 6][v];
  for (let i = 0; i < n; i++) {
    const x = (noise3(i, v, 0, 9) - 0.5) * 14, y = (noise3(i, v, 1, 9) - 0.5) * 6, h = 14 + noise3(i, v, 2, 9) * 12, lx = (noise3(i, v, 3, 9) - 0.5) * 6;
    sc.add(capsule([x, y, -0.5], [x + lx, y, h], 0.75, 0.55), 0, [x + lx / 2, y, h / 2], h / 2 + 2);
    if (i % 2 === 0) sc.add(capsule([x + lx * 0.92, y, h - 5], [x + lx, y, h - 0.6], 1.3), 1, [x + lx, y, h - 3], 4);
    // лист
    sc.add(capsule([x, y, 1], [x + (i % 2 ? 5 : -5), y - 1, 8 + (i % 3) * 2], 0.7, 0.35), 0, [x, y, 5], 8);
  }
  return render(sc, { w: 48, h: 48, inner: 2, shadow: 0.6 });
}

// ---------- кости ----------
const sub = (a: SDF, b: SDF): SDF => (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
export function skull(v: number): PC {
  const b: Mat = { r: R.bone, out: O("#2a241c"), bounce: ASH_B, tex: (x, y, z) => (fbm(x * 0.4, y * 0.4, z * 0.4, 3) - 0.5) * 0.8 };
  const horn: Mat = { r: ramp("#2a2018", "#463626", "#665036", "#8a7050", "#ae9470"), out: O("#140e08"), tex: (x, y, z) => Math.sin((x + z) * 1.8) * 0.5 };
  const sc = new Scene([b, horn]);
  const rot = [0, 0.5, -0.4, 0.2][v], cr = Math.cos(rot), sr = Math.sin(rot);
  const S = 1.35, R2 = (f: SDF): SDF => (x, y, z) => f((x * cr + y * sr) / S, (-x * sr + y * cr) / S, z / S) * S;
  let head: SDF = (x, y, z) => smin(ellipsoid(0, 0, 4.5, 5, 5.5, 4.5)(x, y, z), ellipsoid(0, -5, 2.6, 3, 4.5, 2.6)(x, y, z), 1.5);
  for (const sx of [-2.2, 2.2]) head = sub(head, sphere(sx, -4.4, 4.6, 1.6));
  head = sub(head, sphere(0, -9.2, 2.2, 1.1));
  sc.add(R2(head), 0, [0, -2, 4], 14);
  if (v === 1 || v === 3) { // рога барана: спираль
    for (const s of [-1, 1]) {
      let p: V3 = [s * 3.5, 1, 7];
      for (let k = 1; k <= 7; k++) {
        const a = k * 0.8, q: V3 = [s * (4 + Math.sin(a) * 4 + k * 0.4), 1 + Math.cos(a) * 3.5, 6 + Math.cos(a) * 3 - k * 0.4];
        sc.add(R2(capsule(p, q, 1.8 - k * 0.15, 1.6 - k * 0.15)), 1, [s * 7, 1, 7], 14, 0.3); p = q;
      }
    }
  }
  if (v === 2) for (let i = 0; i < 4; i++) sc.add(R2(capsule([6 + i * 2.2, 4, 0.8], [6 + i * 2.6, 4 - 6, 4 - i * 0.6], 0.9, 0.7)), 0, [12, 3, 3], 13); // рёбра рядом
  return render(sc, { w: 64, h: 48, inner: 2, shadow: 0.8 });
}
export function ribs(v: number): PC {
  const b: Mat = { r: R.bone, out: O("#2a241c"), bounce: ASH_B };
  const sc = new Scene([b]);
  const n = [5, 4, 6][v], L = n * 4.2, K = 1.4;
  sc.add(capsule([-L / 2, 0, 1.6], [L / 2, 0, 1.8], 1.6), 0, [0, 0, 1], L / 2 + 2);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 2 + i * 4.2, hgt = (7 - Math.abs(i - n / 2) * 1.1) * K;
    let p: V3 = [x, 0, 1.4];
    for (let k = 1; k <= 4; k++) { const t = k / 4, q: V3 = [x + t * 2, -Math.sin(t * Math.PI * 0.9) * 7, 1.8 + Math.sin(t * Math.PI) * hgt]; sc.add(capsule(p, q, 1.1, 0.9), 0, [x, -4, 4], 12, 0.3); p = q; }
  }
  return render(sc, { w: 64, h: 44, inner: 2, shadow: 0.8 });
}

// ---------- рудные кристаллы ----------
export function oreCrystal(v: number, kind: "amethyst" | "ice" | "obsidian"): PC {
  const base: Mat = { r: kind === "ice" ? RK.snowRock : kind === "obsidian" ? RK.ash : RK.stone, out: O("#16141c"), tex: (x, y, z) => (fbm(x * 0.3, y * 0.3, z * 0.3, 5) - 0.5) * 1.2 };
  const cr: Mat = kind === "ice"
    ? { r: RK.ice, out: O("#173a5e"), ice: { a: 205, glow: hex("#e8fcff") }, spec: 0.93 }
    : kind === "obsidian"
      ? { r: R.obsid, out: O("#040308"), spec: 0.9, tex: (x, y, z) => (noise3(x * 0.5, y * 0.5, z * 0.5, 2) > 0.8 ? 1.5 : 0) }
      : { r: R.amethyst, out: O("#16062a"), ice: { a: 225, glow: hex("#f0d8ff") }, spec: 0.92 };
  const glow: Mat = { r: RK.ember, out: O("#3a0c04"), emit: true };
  const sc = new Scene([base, cr, glow]);
  sc.add(facetedRock(0, 0, 3, 9 + v, 7, 5, 9, 900 + v, 0.3), 0, [0, 0, 3], 12);
  const sets: [number, number, number, number, number, number][] = ([
    [[0, -1, 0.05, 0, 3.4, 20], [-5, -2, -0.5, 0.1, 2.4, 12], [5, -2, 0.45, 0.1, 2.2, 11]],
    [[-2, -1, -0.2, 0, 3, 16], [3, -2, 0.3, 0.2, 2.8, 14], [0, -6, 0, 0.6, 1.8, 8]],
    [[0, -1, 0.1, 0.1, 3.8, 24], [-6, -3, -0.55, 0.2, 2.2, 11], [6, -1, 0.5, 0, 2.6, 15], [2, -6, 0.2, 0.6, 1.6, 8]],
  ] as [number, number, number, number, number, number][][])[v];
  sets.forEach(([x, y, tx, ty, r, h], i) => sc.add(crystal([x, y, 2], [tx, ty, 1], r, h, 0.3, i + v), 1, [x + (tx * h) / 2, y, h / 2 + 2], h / 2 + r + 3));
  if (kind === "obsidian") sc.add(capsule([-6, -6, 0.6], [4, -7, 0.8], 0.8), 2, [0, -6, 1], 7);
  return render(sc, { w: 56, h: 56, inner: 3 });
}

// ---------- скалы-уступы ----------
/** Уступ высотой 24 px (docs/art-perspective.md): плоский верх с травой/снегом/песком/пеплом, вертикальные стены со слоями, обломки у подножия. */
export function ledge(v: number, top: "grass" | "snow" | "sand" | "ash"): PC {
  const wallR = top === "sand" ? RK.sand : top === "ash" ? RK.ash : top === "snow" ? RK.snowRock : RK.stone;
  const capR = top === "grass" ? R.leaf : top === "snow" ? RK.snow : top === "sand" ? RK.sandDark : ramp("#2a2428", "#3e3636", "#5a504c", "#766a62", "#948676");
  const wall: Mat = { r: wallR, out: O("#121018"), bounce: top === "snow" ? SNOW_B : top === "sand" ? SAND_B : top === "ash" ? ASH_B : GRASS_B, texK: 0.3,
    tex: (x, y, z) => Math.sin(z * 0.75 + (fbm(x * 0.08, y * 0.08, 0, 5 + v) - 0.5) * 3) * 0.8 + (fbm(x * 0.25, y * 0.25, z * 0.25, 9) - 0.5) * 1.2,
    snow: { nz: 0.72, r: capR, noise: 0.2 } };
  const sc = new Scene([wall]);
  const rx = [40, 30][v % 2], ry = [13, 11][v % 2], Ht = 24, seed = 700 + v * 11;
  sc.add((x, y, z) => {
    const a = Math.atan2(y / ry, x / rx), q = Math.hypot(x / rx, y / ry);
    const rad = 1 + (noise3(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2, z * 0.06, seed) - 0.5) * 0.32;
    const side = (q - rad) * Math.min(rx, ry);
    const lid = z - Ht - (noise3(x * 0.08, y * 0.08, 0, seed + 1) - 0.5) * 3;
    return Math.max(side, lid) + (fbm(x * 0.2, y * 0.2, z * 0.2, seed) - 0.5) * 1.2;
  }, 0, [0, 0, Ht / 2], rx + Ht);
  for (const [x, y, r] of [[-rx * 0.8, -ry * 1.05, 3.5], [rx * 0.55, -ry * 1.15, 2.6], [rx * 0.95, -ry * 0.4, 3]])
    sc.add(facetedRock(x, y, r * 0.6, r, r * 0.8, r * 0.8, 8, seed + Math.round(x), 0.3), 0, [x, y, r * 0.6], r + 2);
  return render(sc, { w: 120, h: 80, inner: 4 });
}

/** Ореолы ночью: что светится. */
export const FLORA_GLOW: Record<string, RGBA> = { mushrooms_glow: hex("#5cf0d8"), node_ice: hex("#7cd8ff"), crystal: hex("#b080ff") };

/** id в игре → варианты. Виды v_* — замена спрайтов паков с теми же id. */
export const FLORA3D: Record<string, () => PC[]> = {
  snow_pine: () => [0, 1, 2, 3].map((v) => pine(v, true)),
  v_basic_pine: () => [0, 1, 2, 3].map((v) => pine(v, false)),
  v_basic_oak: () => [0, 1, 2, 3].map(oak),
  v_volcano_dead_tree: () => [0, 1, 2, 3].map((v) => deadTree(v, "ash")),
  v_graveyard_dead_tree_vines: () => [0, 1, 2, 3].map((v) => deadTree(v, "bog")),
  palm: () => [0, 1, 2].map(palm),
  cactus: () => [0, 1, 2, 3].map(cactus),
  cactus_small: () => [0, 1, 2, 3].map(cactusSmall),
  dry_bush: () => [0, 1, 2, 3].map((v) => dryBush(v)),
  v_volcano_dead_bush_a: () => [0, 1, 2, 3].map((v) => dryBush(v, true)),
  bush: () => [0, 1, 2, 3].map((v) => bush(v)),
  v_basic_bush_red: () => [0, 2, 1].map((v) => bush(v, hex("#e04a5a"))),
  v_basic_bush_pink: () => [1, 0, 2].map((v) => bush(v, hex("#f088c0"))),
  v_basic_bush_yellow: () => [2, 1, 0].map((v) => bush(v, hex("#f2c040"))),
  v_basic_bush_blue: () => [0, 1, 2].map((v) => bush(v, hex("#6aa0f0"))),
  ledge_grass: () => [0, 1].map((v) => ledge(v, "grass")),
  ledge_snow: () => [0, 1].map((v) => ledge(v, "snow")),
  ledge_sand: () => [0, 1].map((v) => ledge(v, "sand")),
  ledge_ash: () => [0, 1].map((v) => ledge(v, "ash")),
  v_basic_stump: () => [0, 1, 2, 3].map(stump),
  v_basic_log: () => [0, 1, 2, 3].map(log),
  mushrooms: () => [0, 1, 2, 3].map((v) => mushrooms(v, false)),
  mushrooms_glow: () => [0, 1, 2, 3].map((v) => mushrooms(v, true)),
  reeds: () => [0, 1, 2, 3].map(reeds),
  v_volcano_skull: () => [0, 1, 2, 3].map(skull),
  v_volcano_ribs: () => [0, 1, 2].map(ribs),
  crystal: () => [0, 1, 2].map((v) => oreCrystal(v, "amethyst")),
  node_ice: () => [0, 1, 2].map((v) => oreCrystal(v, "ice")),
  node_obsidian: () => [0, 1, 2].map((v) => oreCrystal(v, "obsidian")),
};
void clamp; void P;
