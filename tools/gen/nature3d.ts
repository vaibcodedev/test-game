/**
 * Объёмный природный декор (замена плоских камней, льдин, кустов, деревьев): камни всех биомов, льдины-кристаллы, сугробы,
 * заснеженные кусты; затем деревья, кактусы, пни, грибы и прочее (раздел ниже). Основа — tools/gen/nature3d-lib.ts.
 * Каждый вид — 3–4 варианта: NATURE3D[id] = [вариант0, вариант1, …]; в игре вариант k > 0 — объект `${id}__${k}`.
 * В игру по умолчанию не включено (ждёт утверждения): см. tools/rocks-compare.ts.
 */
import { hex, mix, ramp, type PC, type RGBA, type Ramp } from "./canvas";
import { BIOME, P } from "./palette";
import { NATURE_VARIANTS } from "../../shared/natureVariants";
import {
  Scene, capsule, clamp, cone, crystal, cylinder, ellipsoid, facetedRock, fbm, logX, noise3, render, sphere, smin, type Mat, type SDF, type V3,
} from "./nature3d-lib";

// ---------- палитры ----------
export const R = {
  stone: ramp("#26242c", "#3c3a44", "#5a5662", "#7e7886", "#aaa4b0"),
  stoneWarm: ramp("#2c2a2e", "#46423f", "#635d55", "#857c70", "#a9a092"),
  moss: ramp("#1a3418", "#284c22", "#3a682c", "#56883a", "#7aa848"),
  snowRock: ramp("#22283a", "#363e54", "#525c76", "#76829e", "#9eaac4"),
  snow: P.snow,
  ice: ramp("#24507c", "#3a78a8", "#5ea6d2", "#96d2ee", "#d4f4ff"),
  sand: BIOME.sandRock,
  sandDark: ramp("#5a3c22", "#7c5630", "#a07440", "#c4985a", "#e2c086"),
  basalt: ramp("#121018", "#1e1a28", "#2e283c", "#423a54", "#5e5476"),
  ash: ramp("#120e1a", "#1e182a", "#2e2540", "#44375c", "#64527e"),
  ember: ramp("#7a1e08", "#b8380c", "#f06a1a", "#ffa040", "#ffe08a"),
  pine: ramp("#0e2219", "#163424", "#204a30", "#2c603a", "#3e7a48"),
  berry: ramp("#5a0c18", "#8c1626", "#c8303c", "#ee6060", "#ffb0a8"),
};
const OUT = {
  stone: hex("#1c1a22"), snow: hex("#5a6c8c"), ice: hex("#173a5e"), sand: hex("#3e2814"), basalt: hex("#08070c"), ash: hex("#141012"), moss: hex("#0e2010"),
};
const SNOW_BOUNCE = hex("#b8cce4"), SAND_BOUNCE = hex("#c49a60"), GRASS_BOUNCE = hex("#4a6a38"), ASH_BOUNCE = hex("#5a4a44");

/** Мелкая фактура камня: пятна и сколы (низкая частота, без однопиксельного шума). */
const stoneTex = (seed: number, amp = 1) => (x: number, y: number, z: number) => (fbm(x * 0.32, y * 0.32, z * 0.32, seed) - 0.5) * 1.6 * amp;
/** Слои песчаника по высоте. */
const strata = (seed: number) => (x: number, y: number, z: number) => Math.sin(z * 0.9 + (fbm(x * 0.1, y * 0.1, 0, seed) - 0.5) * 4) * 0.95 + (fbm(x * 0.3, y * 0.3, z * 0.3, seed) - 0.5) * 0.8;

type Rock = { rx: number; ry: number; rz: number; dx?: number; dy?: number; f?: number; rough?: number };
/** Валун из 1–3 гранёных глыб. */
function rockScene(mats: Mat[], parts: Rock[], seed: number): Scene {
  const sc = new Scene(mats);
  parts.forEach((p, i) => {
    const cx = p.dx ?? 0, cy = p.dy ?? 0, cz = p.rz * 0.62;
    sc.add(facetedRock(cx, cy, cz, p.rx, p.ry, p.rz, p.f ?? 10, seed + i * 31, p.rough ?? 0.3), 0, [cx, cy, cz], Math.max(p.rx, p.ry, p.rz) + 3);
  });
  return sc;
}
const SM: Rock[][] = [
  [{ rx: 10, ry: 8, rz: 8.5 }, { rx: 4, ry: 3.5, rz: 3.5, dx: 10, dy: -4 }],
  [{ rx: 8, ry: 7, rz: 10, f: 8 }],
  [{ rx: 11.5, ry: 8, rz: 6.5, f: 6 }, { rx: 3.5, ry: 3, rz: 3, dx: -11, dy: -3 }, { rx: 2.6, ry: 2.4, rz: 2.4, dx: 8, dy: -7 }],
  [{ rx: 7, ry: 6, rz: 6.5 }, { rx: 5.5, ry: 5, rz: 5, dx: 7.5, dy: 2.5 }],
];
const BIG: Rock[][] = [
  [{ rx: 20, ry: 13, rz: 15, f: 9 }, { rx: 9, ry: 7, rz: 8, dx: 19, dy: -4 }],
  [{ rx: 14, ry: 12, rz: 17, dx: -8, f: 8 }, { rx: 12, ry: 10, rz: 11, dx: 11, dy: -2, f: 7 }, { rx: 4, ry: 3.5, rz: 3.5, dx: -22, dy: -6 }],
  [{ rx: 24, ry: 13, rz: 11, f: 8 }, { rx: 6, ry: 5, rz: 5, dx: -18, dy: -8 }, { rx: 3.5, ry: 3, rz: 3, dx: 20, dy: -9 }],
];

const stoneMat = (r: Ramp, out: RGBA, bounce: RGBA, seed: number, extra: Partial<Mat> = {}): Mat => ({ r, out, bounce, tex: stoneTex(seed), ...extra });

export function greyRock(v: number): PC {
  const sc = rockScene([stoneMat(R.stone, OUT.stone, GRASS_BOUNCE, 3)], SM[v], 101 + v * 17);
  return render(sc, { w: 64, h: 56 });
}
export function bigRock(v: number): PC {
  const sc = rockScene([stoneMat(R.stone, OUT.stone, GRASS_BOUNCE, 5)], BIG[v], 211 + v * 13);
  return render(sc, { w: 96, h: 80 });
}
export function mossRock(v: number): PC {
  const sc = rockScene([stoneMat(R.stoneWarm, OUT.stone, GRASS_BOUNCE, 7, { snow: { nz: 0.5, r: R.moss, noise: 1.1 } })], SM[(v + 1) % 4], 301 + v * 11);
  return render(sc, { w: 64, h: 56 });
}
export function sandRock(v: number): PC {
  const parts: Rock[][] = [
    [{ rx: 11, ry: 8, rz: 9, f: 6, rough: 0.3 }],
    [{ rx: 8, ry: 7, rz: 12, f: 7, rough: 0.3 }, { rx: 4, ry: 3.5, rz: 3, dx: 9, dy: -4 }],
    [{ rx: 13, ry: 8, rz: 6, f: 5, rough: 0.3 }, { rx: 5, ry: 4, rz: 6, dx: -9, dy: 1 }],
    [{ rx: 9, ry: 8, rz: 8, f: 6, rough: 0.35 }, { rx: 3, ry: 3, rz: 2.5, dx: -10, dy: -5 }],
  ];
  const sc = rockScene([{ r: R.sand, out: OUT.sand, bounce: SAND_BOUNCE, tex: strata(9 + v), texK: 0.3 }], parts[v], 401 + v * 7);
  return render(sc, { w: 64, h: 60 });
}
/** Базальт: связка шестигранных столбов с плоскими верхами и тлеющими трещинами. */
export function basaltRock(v: number): PC {
  const mats: Mat[] = [
    { r: R.basalt, out: OUT.basalt, bounce: ASH_BOUNCE, tex: (x, y, z) => ((noise3(x * 0.5, y * 0.5, z * 0.5, 5) > 0.82 && z > 2) ? -1 : 0) + (fbm(x * 0.3, y * 0.3, z * 0.3, 8) - 0.5) },
    { r: R.ember, out: hex("#3a0c04"), emit: true },
  ];
  const sc = new Scene(mats);
  const sets: [number, number, number, number][][] = [
    [[-4, 0, 5, 16], [5, 2, 4.5, 11], [0, -6, 4, 7], [-10, -3, 3.5, 6]],
    [[0, 0, 5.5, 13], [8, -2, 4, 8], [-8, -1, 4, 9]],
    [[-3, 0, 5, 20], [5, -1, 4.5, 14], [1, -7, 4, 6], [-11, -4, 3.5, 5], [10, -6, 3, 4]],
    [[0, 0, 6, 9], [-9, -2, 4, 6], [8, -3, 4.5, 11]],
  ];
  sets[v].forEach(([x, y, r, h], i) => {
    sc.add(crystal([x, y, -1], [0.04 * (i - 1), 0.03, 1], r, h + 1, 0.02, i * 0.4), 0, [x, y, h / 2], h / 2 + r + 2);
  });
  // тлеющая трещина у основания
  sc.add(capsule([-6, -7.5, 0.4], [6, -6.5, 0.6], 0.8), 1, [0, -7, 0.5], 8);
  return render(sc, { w: 64, h: 64, inner: 3 });
}
/** Пепельные камни вулкана (замена v_volcano_rock_* и v_volcano_boulder, rock_pile). */
export function ashRock(v: number, big = false): PC {
  const parts: Rock[][] = big
    ? [[{ rx: 13, ry: 10, rz: 11, f: 8, rough: 0.8 }], [{ rx: 9, ry: 8, rz: 8, dx: -6 }, { rx: 8, ry: 7, rz: 7, dx: 7, dy: -2 }, { rx: 6, ry: 5, rz: 5, dx: 0, dy: -9 }, { rx: 5, ry: 4, rz: 4, dx: 1, dy: 4 }], [{ rx: 14, ry: 9, rz: 8, f: 7, rough: 0.8 }, { rx: 4, ry: 3, rz: 3, dx: 13, dy: -6 }]]
    : [[{ rx: 7, ry: 6, rz: 8, f: 8, rough: 0.7 }, { rx: 3.5, ry: 3, rz: 3, dx: 7, dy: -3 }], [{ rx: 6, ry: 5.5, rz: 10, f: 9, rough: 0.7 }], [{ rx: 6, ry: 5, rz: 6, f: 8 }, { rx: 4.5, ry: 4, rz: 5, dx: -6, dy: -3 }, { rx: 3, ry: 2.6, rz: 2.6, dx: 6, dy: 2 }], [{ rx: 9, ry: 6, rz: 5.5, f: 7, rough: 0.7 }]];
  const mats: Mat[] = [stoneMat(R.ash, OUT.ash, ASH_BOUNCE, 13, { tex: (x, y, z) => stoneTex(13)(x, y, z) + (noise3(x * 0.6, y * 0.6, z * 0.6, 3) > 0.86 ? 1.4 : 0) })];
  const sc = rockScene(mats, parts[v % parts.length], 501 + v * 9 + (big ? 50 : 0));
  return render(sc, { w: big ? 72 : 40, h: big ? 64 : 32 });
}

// ---------- снега ----------
const snowCap = (nz = 0.6, noise = 0.55) => ({ nz, r: R.snow, noise });
/** Мягкий сугроб у основания. */
const drift = (sc: Scene, cx: number, cy: number, rx: number, ry: number, rz: number, m: number) =>
  sc.add(ellipsoid(cx, cy, 0, rx, ry, rz), m, [cx, cy, 0], Math.max(rx, ry, rz) + 1, 1.5);
const snowMat: Mat = { r: R.snow, out: OUT.snow, bounce: SNOW_BOUNCE, tex: (x, y, z) => (fbm(x * 0.2, y * 0.2, z * 0.2, 31) - 0.5) * 0.8 };

export function snowRock(v: number): PC {
  const mats: Mat[] = [stoneMat(R.snowRock, hex("#232a3a"), SNOW_BOUNCE, 17, { snow: snowCap(0.62, 0.6) }), snowMat];
  const sc = rockScene(mats, SM[v], 601 + v * 19);
  const rx = SM[v][0].rx;
  drift(sc, -rx * 0.6, -SM[v][0].ry * 0.4, rx * 0.55, 4, 2.4, 1);
  drift(sc, rx * 0.5, -2, rx * 0.4, 3.5, 1.8, 1);
  return render(sc, { w: 64, h: 56 });
}
/** Льдина: связка шестигранных кристаллов разной длины и наклона, полупрозрачные, с бликом и внутренним светом; снег у основания. */
export function iceSpike(v: number): PC {
  const iceM: Mat = { r: R.ice, out: OUT.ice, ice: { a: 205, glow: hex("#e8fcff") }, spec: 0.93, tex: (x, y, z) => (fbm(x * 0.25, y * 0.25, z * 0.12, 41) - 0.5) * 0.9 };
  const sc = new Scene([iceM, snowMat]);
  const sets: [number, number, number, number, number, number][][] = [ // x, y, наклон x, наклон y, радиус, длина
    [[0, 0, 0.05, 0.05, 4.2, 30], [-6, -2, -0.45, 0.1, 3, 18], [6, -1, 0.5, 0.15, 2.8, 15], [2, -6, 0.15, 0.5, 2.2, 10]],
    [[-2, 0, -0.12, 0.02, 3.8, 24], [4, -2, 0.35, 0.05, 3.2, 20], [-7, -3, -0.55, 0.25, 2.2, 11]],
    [[0, 0, 0.0, 0.08, 5, 36], [-6, -3, -0.35, 0.2, 2.8, 16], [7, -3, 0.45, 0.1, 3, 19], [-2, -7, -0.1, 0.6, 2, 9], [4, 4, 0.3, -0.3, 1.8, 8]],
    [[0, 0, 0.6, 0.1, 3.4, 22], [-3, -1, -0.25, 0.05, 3, 17], [5, -5, 0.1, 0.4, 2.2, 10]],
  ];
  sets[v].forEach(([x, y, tx, ty, r, h], i) => sc.add(crystal([x, y, -2], [tx, ty, 1], r, h, 0.33, i * 0.7 + v), 0, [x + tx * h / 2, y + ty * h / 2, h / 2], h / 2 + r + 3));
  drift(sc, -1, -1, 11, 7, 3, 1);
  return render(sc, { w: 72, h: 80, inner: 3 });
}
/** Ореол льдины ночью — голубой, по силуэту (для монтажа и света в игре). */
export const ICE_GLOW: RGBA = hex("#7cd8ff");

export function snowBush(v: number): PC {
  const leaf: Mat = { r: R.pine, out: hex("#08140e"), bounce: SNOW_BOUNCE, snow: snowCap(0.55, 0.45), tex: (x, y, z) => (noise3(x * 0.55, y * 0.55, z * 0.55, 61) - 0.5) * 1.4 };
  const berry: Mat = { r: R.berry, out: hex("#3a0610"), spec: 0.9 };
  const sc = new Scene([leaf, berry, snowMat]);
  const rr = (s: number) => noise3(s * 3.1, s * 1.7, 0, 71 + v);
  const n = [6, 5, 7, 4][v], W = [11, 8, 13, 7][v], Hh = [8, 9, 7, 6][v];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + v, d = W * 0.45 * (0.6 + rr(i) * 0.4);
    const cx = Math.cos(a) * d, cy = Math.sin(a) * d * 0.6, r = W * 0.42 * (0.75 + rr(i + 9) * 0.4), cz = Hh * 0.55 + rr(i + 3) * 2;
    sc.add((x, y, z) => sphere(cx, cy, cz, r)(x, y, z) + (fbm(x * 0.4, y * 0.4, z * 0.4, 81 + i) - 0.5) * 2.4, 0, [cx, cy, cz], r + 2.5, 2);
  }
  sc.add((x, y, z) => sphere(0, 0, Hh * 0.9, W * 0.45)(x, y, z) + (fbm(x * 0.4, y * 0.4, z * 0.4, 91) - 0.5) * 2.4, 0, [0, 0, Hh * 0.9], W * 0.45 + 2.5, 2);
  const bs: V3[] = [[-W * 0.55, -W * 0.45, Hh * 0.55], [W * 0.35, -W * 0.5, Hh * 0.75], [-W * 0.1, -W * 0.6, Hh * 0.35], [W * 0.65, -W * 0.2, Hh * 0.5]];
  bs.slice(0, 2 + (v % 3)).forEach((b) => sc.add(sphere(b[0], b[1], b[2], 1.8), 1, b, 2.5));
  drift(sc, 0, 0, W * 1.05, W * 0.7, 2.2, 2);
  return render(sc, { w: 56, h: 48 });
}
/** Сугроб: 2–3 сглаженных снежных холма с надувом. */
export function snowdrift(v: number): PC {
  const sc = new Scene([snowMat]);
  const sets: [number, number, number, number, number][][] = [
    [[0, 0, 13, 8, 5], [9, -4, 7, 5, 3.5]],
    [[0, 0, 9, 7, 6]],
    [[-6, 0, 10, 7, 4], [6, -3, 9, 6, 5.5], [0, -8, 6, 4, 3]],
    [[0, 0, 16, 7, 4], [-10, -3, 6, 4, 3]],
  ];
  for (const [x, y, rx, ry, rz] of sets[v]) sc.add((X, Y, Z) => ellipsoid(x, y, 0, rx, ry, rz)(X, Y, Z) + (fbm(X * 0.15, Y * 0.15, Z * 0.15, 101 + v) - 0.5) * 2, 0, [x, y, 0], Math.max(rx, ry) + 2, 3);
  return render(sc, { w: 64, h: 40, shadow: 0.6 });
}

/** Все новые виды (камни, лёд, снега): id → варианты. */
export const ROCKS3D: Record<string, () => PC[]> = {
  rock: () => [0, 1, 2, 3].map(greyRock),
  big_rock: () => [0, 1, 2].map(bigRock),
  rock_moss: () => [0, 1, 2, 3].map(mossRock),
  sandstone: () => [0, 1, 2, 3].map(sandRock),
  basalt: () => [0, 1, 2, 3].map(basaltRock),
  v_volcano_rock_a: () => [0, 1, 2, 3].map((v) => ashRock(v)),
  v_volcano_boulder: () => [0, 1, 2].map((v) => ashRock(v, true)),
  snow_rock: () => [0, 1, 2, 3].map(snowRock),
  ice_spike: () => [0, 1, 2, 3].map(iceSpike),
  snow_bush: () => [0, 1, 2, 3].map(snowBush),
  snowdrift: () => [0, 1, 2, 3].map(snowdrift),
};
void clamp; void cone; void cylinder; void logX; void smin; void mix;
export type { SDF };

/**
 * В игру (решение пользователя): камни, лёд, снега. id игры → кадры [база, __1, __2, …]; число вариантов — shared/natureVariants.ts.
 * Пепельные камни заменяют спрайты пака Volcanoe с теми же id.
 */
export const NATURE_GAME: Record<string, () => PC[]> = {
  rock: ROCKS3D.rock,
  big_rock: ROCKS3D.big_rock,
  rock_moss: ROCKS3D.rock_moss,
  sandstone: ROCKS3D.sandstone,
  basalt: ROCKS3D.basalt,
  snow_rock: ROCKS3D.snow_rock,
  ice_spike: ROCKS3D.ice_spike,
  snow_bush: ROCKS3D.snow_bush,
  snowdrift: ROCKS3D.snowdrift,
  v_volcano_rock_a: () => [0, 3].map((v) => ashRock(v)),
  v_volcano_rock_b: () => [1, 3].map((v) => ashRock(v)),
  v_volcano_rock_c: () => [2, 0].map((v) => ashRock(v)),
  v_volcano_boulder: () => [0, 2].map((v) => ashRock(v, true)),
  v_volcano_rock_pile: () => [1].map((v) => ashRock(v, true)),
};
/** Плоский словарь кадров для OBJECT_ART (tools/gen/objects.ts): kind и kind__k; кадры считаются один раз. */
export function natureGameArt(): Record<string, () => PC> {
  const out: Record<string, () => PC> = {};
  const memo = new Map<string, PC[]>();
  const get = (id: string) => { if (!memo.has(id)) memo.set(id, NATURE_GAME[id]()); return memo.get(id)!; };
  for (const [id, f] of Object.entries(NATURE_GAME)) {
    const n = NATURE_VARIANTS[id] ?? 1;
    void f;
    for (let k = 0; k < n; k++) out[k ? `${id}__${k}` : id] = () => get(id)[k];
  }
  return out;
}
