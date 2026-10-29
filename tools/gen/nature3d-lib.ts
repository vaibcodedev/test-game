/**
 * Объёмный природный декор: маленький трассировщик SDF (signed distance field) в пиксель-арт.
 * Сцена — набор 3D-примитивов (валун с гранями, кристалл, конус яруса ели, капсула ветки, цилиндр пня…), вид 3/4 сверху-спереди,
 * свет сверху-слева (тени между частями считаются лучом к свету), рефлекс от земли снизу, ступенчатая заливка рампой 4–5 тонов,
 * контур 1 px тёмным тоном материала, контактная тень по пятну основания. 1 мировая единица = 1 px.
 * Оси: x вправо, y вглубь (от зрителя), z вверх. Опорная точка мира (0,0,0) — центр основания.
 */
import { PC, hash01, mix, shade, withA, type RGBA, type Ramp } from "./canvas";

export type V3 = [number, number, number];
export type SDF = (x: number, y: number, z: number) => number;

/** Материал: рампа от тени к свету; сдвиг тона по фактуре; лёд — полупрозрачный с бликом и внутренним светом. */
export interface Mat {
  r: Ramp;
  /** контур (по умолчанию — затемнённый самый тёмный тон) */
  out?: RGBA;
  /** фактура: сдвиг индекса тона (−1…+1), x, y, z — мировые, n — нормаль */
  tex?: (x: number, y: number, z: number, n: V3) => number;
  /** лёд/кристалл: прозрачность тела 0…255 и цвет внутреннего света */
  ice?: { a: number; glow: RGBA };
  /** зеркальный блик (мокрое, лёд, глянец) — порог 0…1 */
  spec?: number;
  /** снег на верхних гранях: порог нормали z и рампа снега */
  snow?: { nz: number; r: Ramp; noise?: number };
  /** цвет рефлекса снизу (снег, песок) */
  bounce?: RGBA;
  /** вес фактуры (по умолчанию 0.18) */
  texK?: number;
  /** светится сам (руда, лава): не темнеет в тени */
  emit?: boolean;
}

export interface Prim { d: SDF; m: number; c: V3; r: number; k?: number }

// ---------- вектора и примитивы ----------
export const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
export const norm = (v: V3): V3 => { const l = len3(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Гладкий минимум (слияние капель, веток). */
export const smin = (a: number, b: number, k: number) => { const h = clamp(0.5 + (0.5 * (b - a)) / k); return b + (a - b) * h - k * h * (1 - h); };

/** 3D value-noise (для неровностей поверхности). */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(fx), v = s(fy), w = s(fz);
  const h = (a: number, b: number, c: number) => hash01(a * 7 + c * 131, b * 13 - c * 57, seed);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}
export const fbm = (x: number, y: number, z: number, seed: number) =>
  noise3(x, y, z, seed) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1, seed + 9) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3, seed + 17) * 0.1;

/** Эллипсоид (приближённое расстояние). */
export const ellipsoid = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): SDF => (x, y, z) => {
  const X = (x - cx) / rx, Y = (y - cy) / ry, Z = (z - cz) / rz;
  const k0 = len3(X, Y, Z), k1 = len3(X / rx, Y / ry, Z / rz);
  return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
};
export const sphere = (cx: number, cy: number, cz: number, r: number): SDF => (x, y, z) => len3(x - cx, y - cy, z - cz) - r;
/** Капсула от a до b с радиусами ra → rb (ветки, стебли, кости). */
export const capsule = (a: V3, b: V3, ra: number, rb = ra): SDF => {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], bb = bx * bx + by * by + bz * bz;
  return (x, y, z) => {
    const px = x - a[0], py = y - a[1], pz = z - a[2];
    const h = clamp((px * bx + py * by + pz * bz) / bb);
    return len3(px - bx * h, py - by * h, pz - bz * h) - (ra + (rb - ra) * h);
  };
};
/** Вертикальный цилиндр (пень, ствол) с закруглением кромки rr. */
export const cylinder = (cx: number, cy: number, z0: number, z1: number, r: number, rr = 0.6): SDF => (x, y, z) => {
  const dx = len3(x - cx, y - cy, 0) - r + rr, dz = Math.abs(z - (z0 + z1) / 2) - (z1 - z0) / 2 + rr;
  return Math.min(Math.max(dx, dz), 0) + len3(Math.max(dx, 0), Math.max(dz, 0), 0) - rr;
};
/** Лежачий цилиндр вдоль x (бревно). */
export const logX = (cx: number, cy: number, cz: number, half: number, r: number, rr = 0.6): SDF => (x, y, z) => {
  const dx = len3(0, y - cy, z - cz) - r + rr, dz = Math.abs(x - cx) - half + rr;
  return Math.min(Math.max(dx, dz), 0) + len3(Math.max(dx, 0), Math.max(dz, 0), 0) - rr;
};
/** Конус яруса ели: основание z0 радиус r, вершина z1; край обвисает лапами (n лап, глубина зубцов dent). */
export const cone = (cx: number, cy: number, z0: number, z1: number, r: number, n = 0, dent = 0, seed = 1): SDF => (x, y, z) => {
  const dx = x - cx, dy = y - cy, q = len3(dx, dy, 0), hgt = z1 - z0;
  const a = Math.atan2(dy, dx);
  const t = clamp((z - z0) / hgt);
  let rr = r * (1 - t);
  if (n) rr *= 1 - dent * (0.5 + 0.5 * Math.cos(a * n + seed)) * (0.4 + 0.6 * (1 - t)) - dent * 0.6 * (noise3(Math.cos(a) * 2 + seed, Math.sin(a) * 2, t * 2, seed) - 0.5);
  const side = (q - rr) * (hgt / Math.hypot(hgt, r));
  const bot = z0 - z + (1 - clamp(q / r)) * 0; // плоское дно
  return Math.max(side, bot, z - z1);
};
/** Гранёный камень: эллипсоид, срезанный плоскостями (грани), с мягкой неровностью. */
export function facetedRock(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, facets: number, seed: number, rough = 0.6): SDF {
  const planes: [V3, number][] = [];
  let s = seed;
  const R = () => { s = (s * 16807 + 11) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < facets; i++) {
    const az = R() * Math.PI * 2, el = (R() * 0.9 - 0.15) * Math.PI / 2; // в основном боковые и верхние грани
    const n: V3 = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
    const along = Math.abs(n[0]) * rx + Math.abs(n[1]) * ry + Math.abs(n[2]) * rz;
    const rr = Math.hypot(n[0] * rx, n[1] * ry, n[2] * rz);
    planes.push([n, (rr * 0.82 + along * 0.0) * (0.86 + R() * 0.12)]);
  }
  const e = ellipsoid(cx, cy, cz, rx, ry, rz);
  return (x, y, z) => {
    let d = e(x, y, z);
    for (const [n, off] of planes) d = Math.max(d, (x - cx) * n[0] + (y - cy) * n[1] + (z - cz) * n[2] - off);
    return d + (fbm(x * 0.18, y * 0.18, z * 0.18, seed) - 0.5) * rough * 2;
  };
}
/** Шестигранный кристалл: призма вдоль оси dir с пирамидальной верхушкой. */
export function crystal(base: V3, dir: V3, r: number, h: number, tip = 0.35, rot = 0): SDF {
  const w = norm(dir);
  const u0: V3 = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = norm([u0[1] * w[2] - u0[2] * w[1], u0[2] * w[0] - u0[0] * w[2], u0[0] * w[1] - u0[1] * w[0]]);
  let v = norm([w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]]);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  [u, v] = [[u[0] * cr + v[0] * sr, u[1] * cr + v[1] * sr, u[2] * cr + v[2] * sr], [v[0] * cr - u[0] * sr, v[1] * cr - u[1] * sr, v[2] * cr - u[2] * sr]];
  const hb = h * (1 - tip);
  return (x, y, z) => {
    const px = x - base[0], py = y - base[1], pz = z - base[2];
    const a = px * w[0] + py * w[1] + pz * w[2], pu = px * u[0] + py * u[1] + pz * u[2], pv = px * v[0] + py * v[1] + pz * v[2];
    // шестигранник: максимум из трёх пар граней
    let hex = 0;
    for (let k = 0; k < 3; k++) { const an = (k * Math.PI) / 3; hex = Math.max(hex, Math.abs(pu * Math.cos(an) + pv * Math.sin(an))); }
    const taper = a > hb ? r * (1 - (a - hb) / (h - hb)) : r * (1 - 0.12 * (a / hb));
    return Math.max((hex - taper) * 0.8, -a - 2, a - h);
  };
}

// ---------- сцена ----------
export class Scene {
  prims: Prim[] = [];
  constructor(public mats: Mat[]) {}
  add(d: SDF, m: number, c: V3, r: number, k = 0) { this.prims.push({ d, m, c, r, k }); return this; }
  /** Расстояние и материал; пол срезан на z = 0. */
  map(x: number, y: number, z: number, need = Infinity): [number, number] {
    let best = 1e9, m = -1;
    for (const p of this.prims) {
      const lb = len3(x - p.c[0], y - p.c[1], z - p.c[2]) - p.r;
      if (lb > best + (p.k ?? 0) + 1 && lb > 0.5) continue;
      const d = p.d(x, y, z);
      if (p.k && m >= 0) { const nb = smin(best, d, p.k); if (d < best) m = p.m; best = nb; }
      else if (d < best) { best = d; m = p.m; }
    }
    void need;
    return [Math.max(best, -z - 0.01), m];
  }
}

/** Проекция проекта (docs/art-perspective.md): фронтальная косоугольная — высота 1:1, глубина ×0,4 (эллипс основания ry = 0,4·rx). */
export const DEPTH_K = 0.4;
const VD: V3 = norm([0, 1, -DEPTH_K]);
export const LIGHT: V3 = norm([-0.6, -0.35, 0.72]);

export interface RenderOpts {
  /** размер холста трассировки (с запасом) и опорная точка на нём */
  w: number; h: number; ax?: number; ay?: number;
  /** сила контактной тени 0…1 */
  shadow?: number;
  /** доп. отступ кадра вокруг силуэта */
  pad?: number;
  /** внутренние контуры на перепадах глубины (между лапами, каплями) */
  inner?: number;
}
export interface Rendered { pc: PC; mat: Int16Array; depth: Float32Array; ax: number; ay: number }

/** Трассировка сцены в пиксели; результат обрезан по силуэту (опорная точка — нижняя середина кадра). */
export function render(sc: Scene, o: RenderOpts): PC {
  return renderFull(sc, o).pc;
}
export function renderFull(sc: Scene, o: RenderOpts): Rendered {
  const W = o.w, H = o.h, ax = o.ax ?? W / 2, ay = o.ay ?? H - 12;
  const col = new PC(W, H), mat = new Int16Array(W * H).fill(-1), dep = new Float32Array(W * H).fill(1e9);
  const nrm: V3[] = new Array(W * H);
  const T0 = 260;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const sx = px + 0.5 - ax, sy = ay - (py + 0.5);
    const ox = sx - VD[0] * T0, oy = -VD[1] * T0, oz = sy - VD[2] * T0;
    let t = 0, hit = -1, x = 0, y = 0, z = 0;
    for (let i = 0; i < 260 && t < T0 * 2; i++) {
      x = ox + VD[0] * t; y = oy + VD[1] * t; z = oz + VD[2] * t;
      if (z < -1) break;
      const [d, m] = sc.map(x, y, z);
      if (d < 0.04) { hit = m; break; }
      t += Math.max(d * 0.7, 0.04);
    }
    if (hit < 0) continue;
    const e = 0.35;
    const n = norm([
      sc.map(x + e, y, z)[0] - sc.map(x - e, y, z)[0],
      sc.map(x, y + e, z)[0] - sc.map(x, y - e, z)[0],
      sc.map(x, y, z + e)[0] - sc.map(x, y, z - e)[0],
    ]);
    const M = sc.mats[hit], i = py * W + px;
    mat[i] = hit; dep[i] = t; nrm[i] = n;
    col.set(px, py, shadePoint(sc, M, x, y, z, n));
  }
  // внутренние контуры: пиксель за краем более близкой части темнеет
  const inner = o.inner ?? 5;
  if (inner > 0) {
    const src = col.clone();
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (mat[i] < 0) continue;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const X = px + dx, Y = py + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const j = Y * W + X;
        if (mat[j] < 0 || dep[j] > dep[i] - inner) continue;
        const M = sc.mats[mat[j]];
        const c = src.get(px, py)!;
        col.set(px, py, mix(c, M.out ?? shade(M.r[0], 0.7), M.ice ? 0.5 : 0.8));
        break;
      }
    }
  }
  // внешний контур тёмным тоном соседнего материала
  const out = col.clone();
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    if (mat[py * W + px] >= 0) continue;
    let mm = -1, best = 1e9;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const X = px + dx, Y = py + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const j = Y * W + X;
      if (mat[j] >= 0 && dep[j] < best) { best = dep[j]; mm = mat[j]; }
    }
    if (mm >= 0) { const M = sc.mats[mm]; out.set(px, py, withA(M.out ?? shade(M.r[0], 0.62), M.ice ? 230 : 255)); }
  }
  // контактная тень (docs/art-perspective.md, п. 4): след основания на земле — тёмное пятно, и 2 ряда AO сразу под нижней кромкой
  // (альфа ≈150 и ≈65), шире на 1 px с каждой стороны, симметрично (без сдвига от света): длинная тень клиента начнётся от основания
  const sh = o.shadow ?? 1;
  const final = new PC(W, H);
  if (sh > 0) {
    const foot = new Uint8Array(W * H);
    for (let gy = -60; gy <= 60; gy += 0.5) for (let gx = -70; gx <= 70; gx += 0.5) {
      if (sc.map(gx, gy, 0.5)[0] > 0.7) continue;
      const X = Math.floor(ax + gx), Y = Math.floor(ay - gy * DEPTH_K);
      if (X >= 0 && Y >= 0 && X < W && Y < H) foot[Y * W + X] = 1;
    }
    const low = new Int32Array(W).fill(-1);
    for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (foot[y * W + x] || (x > 0 && foot[y * W + x - 1]) || (x < W - 1 && foot[y * W + x + 1])) { low[x] = y; break; }
    for (let i = 0; i < W * H; i++) if (foot[i]) final.set(i % W, Math.floor(i / W), [14, 12, 24, Math.round(150 * sh)]);
    for (let x = 0; x < W; x++) if (low[x] >= 0) {
      final.set(x, low[x] + 1, [14, 12, 24, Math.round(150 * sh)]);
      final.set(x, low[x] + 2, [14, 12, 24, Math.round(65 * sh)]);
    }
  }
  final.blit(out, 0, 0);
  // обрезка: по горизонтали симметрично вокруг опорной точки, низ — по нижнему непрозрачному пикселю
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) if (final.alpha(px, py)) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
  const pad = o.pad ?? 1;
  const half = Math.ceil(Math.max(ax - x0, x1 + 1 - ax)) + pad;
  const cw = half * 2, ch = y1 + 1 - y0 + pad; // низ кадра = нижний ряд AO (без пустых рядов)
  const res = new PC(cw, ch);
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
    const c = final.get(Math.round(ax) - half + px, y0 - pad + py);
    if (c && c[3]) { const i = (py * cw + px) * 4; res.data.set(c, i); }
  }
  const cm = new Int16Array(cw * ch).fill(-1), cd = new Float32Array(cw * ch).fill(1e9);
  for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) {
    const X = Math.round(ax) - half + px, Y = y0 - pad + py;
    if (X >= 0 && Y >= 0 && X < W && Y < H) { cm[py * cw + px] = mat[Y * W + X]; cd[py * cw + px] = dep[Y * W + X]; }
  }
  return { pc: res, mat: cm, depth: cd, ax: half, ay: ay - (y0 - pad) };
}

/** Освещение точки: Ламберт + небо + рефлекс снизу + тень от своих частей + AO, затем ступени рампы. */
function shadePoint(sc: Scene, M: Mat, x: number, y: number, z: number, n: V3): RGBA {
  const dl = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  let lit = 1;
  if (dl > 0 && !M.emit) {
    // луч к свету
    let t = 0.8;
    for (let i = 0; i < 48 && t < 90; i++) {
      const [d] = sc.map(x + LIGHT[0] * t, y + LIGHT[1] * t, z + LIGHT[2] * t);
      if (d < 0.05) { lit = 0; break; }
      lit = Math.min(lit, clamp((d * 6) / t + 0.0));
      t += Math.max(d, 0.3);
    }
    lit = clamp(lit * 1.6);
  }
  // AO по нормали
  let ao = 0;
  for (let k = 1; k <= 3; k++) { const h = k * 1.4; ao += (h - Math.max(0, sc.map(x + n[0] * h, y + n[1] * h, z + n[2] * h)[0])) / (k * 1.6); }
  ao = clamp(1 - ao * 0.22);
  let v = 0.13 + 0.13 * n[2] + Math.max(0, dl) * 0.88 * lit;
  v *= 0.55 + 0.45 * ao;
  if (n[2] < 0) v += -n[2] * 0.12; // рефлекс от земли
  if (!M.emit) v *= 0.5 + 0.5 * clamp(z / 2.2); // тёмная контактная полоса у основания
  let tx = M.tex ? M.tex(x, y, z, n) : 0;
  let r = M.r;
  let snowy = false;
  if (M.snow) {
    const nn = M.snow.noise ? (fbm(x * 0.25, y * 0.25, z * 0.25, 77) - 0.5) * M.snow.noise : 0;
    if (n[2] + nn > M.snow.nz) { r = M.snow.r; snowy = true; tx = (fbm(x * 0.2, y * 0.2, z * 0.2, 31) - 0.5) * 0.6; }
  }
  const N = r.length;
  let fi = clamp(v * 1.05 + (snowy ? 0.12 : 0) + tx * (M.texK ?? 0.18)) * (N - 1);
  if (M.emit) fi = Math.max(fi, (N - 1) * 0.55 + tx * 0.5);
  let idx = Math.round(fi - 0.08);
  idx = Math.max(0, Math.min(N - 1, idx));
  let c = r[idx];
  if (M.bounce && n[2] < -0.05) c = mix(c, M.bounce, clamp(-n[2] * 0.45));
  // блик
  const H = norm([LIGHT[0] - VD[0], LIGHT[1] - VD[1], LIGHT[2] - VD[2]]);
  const sp = Math.max(0, n[0] * H[0] + n[1] * H[1] + n[2] * H[2]);
  if (M.spec !== undefined && lit > 0.5 && sp > M.spec) c = mix(c, [255, 255, 255, 255], 0.85);
  if (M.ice) {
    const fres = 1 - Math.abs(n[0] * VD[0] + n[1] * VD[1] + n[2] * VD[2]);
    const core = clamp(1 - fres * 1.6);
    c = mix(c, M.ice.glow, core * 0.35);
    return withA(c, Math.round(M.ice.a + (255 - M.ice.a) * clamp(fres * 1.5)));
  }
  return c;
}

/** Ореол для ночи (мягкое пятно по силуэту) — отдельный кадр того же размера. */
export function haloOf(pc: PC, color: RGBA, radius = 5, strength = 0.5): PC {
  const out = new PC(pc.w, pc.h);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    let best = 1e9;
    for (let j = -radius; j <= radius; j++) for (let i = -radius; i <= radius; i++) if (pc.alpha(x + i, y + j) > 200) best = Math.min(best, Math.hypot(i, j));
    if (best > radius) continue;
    const a = (1 - best / (radius + 1)) ** 2 * strength;
    out.set(x, y, withA(color, Math.round(a * 255)));
  }
  return out;
}
