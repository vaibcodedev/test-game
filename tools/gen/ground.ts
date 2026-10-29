/**
 * Земля (выбран вид «B», объёмный): строки тайлсета terrain.png для травы, леса, земли, песка, болота, пепла, брусчатки, снега, льда и дюн.
 * Формат прежний (tools/gen/tiles.ts, dual grid): строка = поверхность, столбцы 0–13 — края по маске углов, 14 — основная заливка, 15–17 — варианты.
 * Против «обоев»: основа ровная (крупную пятнистость даёт макрошум игры), рисунок — штампы. Штампы у краёв тайла общие для всех вариантов
 * и рисуются с переносом через край (заливки стыкуются в любом порядке), внутри — свои у каждого варианта. Свет сверху слева, тени вправо-вниз.
 * Дёрн и снег приподняты над нижним слоем (бровка и тень), край тропы рваный с отдельными пучками, брусчатка с фаской, пепел — неровная корка.
 */
import { PC, hash01, mix, rng, shade, withA, pnoise, type RGBA, type Ramp } from "./canvas";
import { P } from "./palette";
import { T } from "../../shared/map";

const S = 32;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Stamp { x: number; y: number; k: number; kind: string }
export interface Surface {
  base(x: number, y: number, v: number): RGBA;
  /** Штампов на тайл и минимальное расстояние между ними. */
  n: number;
  minD: number;
  /** Сколько общих штампов у краёв (по умолчанию 0,6·n); у редких поверхностей мало — иначе их повтор через 32 px заметен. */
  shared?: number;
  /** Вид штампа: shared — у края (общий для всех вариантов, только «фоновые» виды), иначе — внутри варианта v. */
  kind(k: number, v: number, shared: boolean): string | null;
  draw(pc: PC, s: Stamp): void;
  /** Крупная деталь варианта сплошной заливки (лужа), целиком внутри тайла. */
  extra?(pc: PC, v: number): void;
  /** Крупное пятно варианта сплошной заливки под штампами (вытоптанное, сырое, наст). */
  under?(pc: PC, v: number): void;
  edge: "lip" | "soft" | "fray" | "stones" | "rim";
  /** Цвета бровки сверху вниз (видимая боковина поднятого слоя). */
  lip?: RGBA[];
  hi?: RGBA;
  rimIn?: RGBA;
  rimOut?: RGBA;
  /** Тень под нижней кромкой (полупрозрачная, ложится на нижний слой). */
  shadow?: RGBA;
  /** Пучки за кромкой (рваный край тропы). */
  strays?: string;
  /** Множитель неровности кромки (бордюр — ровнее). */
  calm?: number;
  /** Бордюр площади: полоса ширины band по кромке (верх камня, швы через joint px), торец — lip. */
  band?: { w: number; top: RGBA; lit: RGBA; seam: RGBA; joint: number };
  /** Брусчатка: «камень пикселя» для кромки по целым камням. */
  stoneOf?: (x: number, y: number, v: number) => { cx: number; cy: number };
}

/** Расстояние на торе 32×32 (для общих штампов у краёв). */
const tdist = (ax: number, ay: number, bx: number, by: number) => Math.min(Math.abs(ax - bx), S - Math.abs(ax - bx)) + Math.min(Math.abs(ay - by), S - Math.abs(ay - by));
const nearEdge = (x: number, y: number) => Math.min(x, y, S - 1 - x, S - 1 - y) < 5;
/** Штампы тайла: общий пояс у краёв (seed поверхности, рисуется с переносом через край) + свои по всему тайлу с отступом 3 (seed варианта/маски, обрезаются краем тайла). */
function stampSet(sf: Surface, t: number, own: number, v: number): (Stamp & { shared: boolean })[] {
  const out: (Stamp & { shared: boolean })[] = [];
  const place = (seed: number, shared: boolean, n: number) => {
    const r = rng(seed);
    let got = 0;
    for (let tries = 0; got < n && tries < n * 60 + 40; tries++) {
      const x = Math.floor(r() * S), y = Math.floor(r() * S), k = r();
      if (shared ? !nearEdge(x, y) : x < 3 || y < 4 || x > S - 4 || y > S - 3) continue;
      if (out.some((s) => tdist(s.x, s.y, x, y) < sf.minD)) continue;
      const kind = sf.kind(k, v, shared);
      if (kind) { out.push({ x, y, k, kind, shared }); got++; }
    }
  };
  place(7000 + t * 97, true, sf.shared ?? Math.round(sf.n * 0.6));
  place(9000 + t * 97 + own * 131, false, sf.n);
  return out;
}

// ---------- штампы ----------
export const DARK: RGBA = [16, 12, 20, 255];
export function tuft(pc: PC, x: number, y: number, r: Ramp, blades: number, hgt: number, k: number, shadow = true) {
  if (shadow) { pc.set(x, y + 1, withA(DARK, 70)); pc.set(x + 1, y + 1, withA(DARK, 70)); pc.set(x + 2, y + 1, withA(DARK, 45)); }
  [0, -1, 1, -2, 2, 0].slice(0, blades).forEach((dx, i) => {
    const h = Math.max(2, hgt - Math.abs(dx) - ((i + Math.floor(k * 7)) % 2));
    for (let j = 0; j < h; j++) {
      const lean = dx === 0 ? 0 : Math.sign(dx) * (j >= h - 2 ? 1 : 0) + (Math.abs(dx) > 1 && j >= 1 ? Math.sign(dx) : 0);
      const lit = dx <= 0 ? 0.25 : -0.1; // левые травинки светлее
      pc.set(x + dx + lean, y - j, r[clamp(Math.round(1 + (j / Math.max(1, h - 1) + lit) * (r.length - 2)), 1, r.length - 1)]);
    }
  });
}
export function pebble(pc: PC, x: number, y: number, r: Ramp, w: number, h: number) {
  pc.set(x - 1, y + h, withA(DARK, 50));
  for (let i = 0; i < w; i++) pc.set(x + i, y + h, withA(DARK, 80));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if ((j === 0 || j === h - 1) && (i === 0 || i === w - 1) && w > 2 && h > 2) continue;
    pc.set(x + i, y + j, j === 0 || i === 0 ? r[r.length - 1] : j === h - 1 || i === w - 1 ? r[1] : r[r.length - 2]);
  }
}
const FLOWER: RGBA[][] = [
  [[238, 234, 222, 255], [244, 210, 90, 255]], // ромашка
  [[244, 214, 92, 255], [196, 130, 40, 255]], // лютик
  [[226, 120, 150, 255], [250, 220, 140, 255]], // розовый клевер
  [[130, 156, 226, 255], [236, 236, 250, 255]], // василёк
];
export function flower(pc: PC, x: number, y: number, kind: number, stem: RGBA) {
  const [pet, mid] = FLOWER[kind % FLOWER.length];
  pc.set(x, y + 1, stem); pc.set(x, y + 2, stem); pc.set(x + 1, y + 2, withA(DARK, 60));
  pc.set(x - 1, y, pet); pc.set(x + 1, y, shade(pet, 0.85)); pc.set(x, y - 1, pet); pc.set(x, y + 1, shade(pet, 0.7)); pc.set(x, y, mid);
}
/** Подушка травы: зубчатый верх (свет), тело, тёмный низ и тень — объём 3/4. */
export function clump(pc: PC, x: number, y: number, R: Ramp, w: number, k: number) {
  for (let i = 0; i < w; i++) {
    const h = Math.min(Math.min(i, w - 1 - i) + 1, 3) + ((i * 5 + Math.floor(k * 11)) % 3 === 0 ? 1 : 0);
    for (let j = 0; j <= h; j++) pc.set(x + i, y - j, j === 0 ? R[1] : j === h ? (i < w / 2 ? R[4] : R[3]) : i < w / 2 ? R[3] : R[2]);
    pc.set(x + i + 1, y + 1, withA(DARK, 55));
  }
}
/** Штрих травы «ʌ»: тёмный уголок и светлый кончик. */
export function mark(pc: PC, x: number, y: number, dark: RGBA, light: RGBA | null, wide: boolean) {
  pc.set(x, y, dark); pc.set(x + 1, y - 1, dark);
  if (wide) pc.set(x + 2, y, dark);
  if (light) pc.set(x, y - 1, light);
}
/** Волнистая рябь (песок, снег, дюны): светлый гребень, тень под ним. */
export function ripple(pc: PC, x: number, y: number, len: number, hi: RGBA, lo: RGBA | null, k = 0) {
  for (let i = 0; i < len; i++) {
    const dy = Math.round(Math.sin((i / len) * Math.PI * (1 + k)) * -1) + (i === 0 || i === len - 1 ? 1 : 0);
    pc.set(x + i, y + dy, hi);
    if (lo) pc.set(x + i, y + dy + 1, lo);
  }
}
/** Трещина случайным шагом: длина len, ответвление с вероятностью br; glow — тлеющая середина. */
export function crack(pc: PC, x: number, y: number, len: number, seed: number, dark: RGBA, lip: RGBA | null, glow?: RGBA[]) {
  const r = rng(seed);
  const walk = (cx: number, cy: number, n: number, dir: number, depth: number) => {
    for (let i = 0; i < n; i++) {
      const mid = glow && i > 0 && i < n - 1;
      pc.set(cx, cy, mid ? glow![r() < 0.3 ? 1 : 0] : dark);
      if (lip) pc.set(cx, cy + 1, lip);
      const q = r();
      if (q < 0.3) cy += dir; else if (q < 0.45) cy -= dir;
      else if (q < 0.55) { cy += dir; continue; } // крутой участок
      if (r() < 0.15) dir = -dir;
      cx += 1;
      if (depth < 1 && r() < 0.12) walk(cx, cy, Math.floor(n / 2), -dir, depth + 1);
    }
  };
  walk(x, y, len, r() < 0.5 ? 1 : -1, 0);
}
/** Пятно неправильной формы: объединение 2–3 эллипсов (лужи, наносы золы). */
export function blob(seed: number, cx: number, cy: number, rx: number, ry: number): (x: number, y: number) => boolean {
  const r = rng(seed), parts: [number, number, number, number][] = [[cx, cy, rx, ry]];
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) parts.push([cx + (r() * 2 - 1) * rx * 0.7, cy + (r() * 2 - 1) * ry * 0.6, rx * (0.45 + r() * 0.35), ry * (0.6 + r() * 0.4)]);
  return (x, y) => parts.some(([a, b, c, d]) => ((x + 0.5 - a) / c) ** 2 + ((y + 0.5 - b) / d) ** 2 <= 1);
}

// ---------- поверхности ----------
export function grassSurf(R: Ramp, seed: number, forest = false): Surface {
  const B = R[2];
  return {
    base: () => B,
    n: 20,
    minD: 4,
    kind(k, v, shared) {
      if (shared || k < 0.55) return k < 0.4 ? "mark" : k < 0.62 ? "clump" : "tuft";
      if (forest) return k < 0.72 ? "leaf" : k < 0.8 ? "twig" : k < 0.88 ? "moss" : "tuft";
      if (v === 1 && k < 0.8) return "clover";
      if (v === 2 && k < 0.75) return "flower";
      if (v === 3 && k < 0.65) return "pebble";
      return "tuft";
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "clump") clump(pc, x - 3, y, R, 5 + Math.floor(k * 4), k);
      else if (s.kind === "mark") mark(pc, x, y, R[1], k > 0.5 ? R[3] : null, k > 0.4);
      else if (s.kind === "tuft") tuft(pc, x, y, R, 4 + Math.floor(k * 2), 5 + Math.floor(k * 2), k);
      else if (s.kind === "clover") {
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [-1, 1], [0, 2], [1, 2], [3, 0], [3, 1]]) pc.set(x + dx, y + dy, dy === 0 || dx < 0 ? R[3] : R[1]);
        pc.set(x + 1, y + 3, withA(DARK, 50)); pc.set(x + 2, y + 2, withA(DARK, 50)); pc.set(x + 4, y + 2, withA(DARK, 40));
      } else if (s.kind === "flower") {
        for (let i = 0, n = 2 + Math.floor(k * 2); i < n; i++) flower(pc, x + i * 3 - (i % 2), y + (i % 2) * 2, seed + Math.floor(k * 13) + i, R[1]);
      } else if (s.kind === "pebble") pebble(pc, x, y, P.stone, 3, 2);
      else if (s.kind === "leaf") {
        const c = P.leafAutumn[1 + Math.floor(k * 3)];
        pc.set(x, y, c); pc.set(x + 1, y, shade(c, 0.8)); pc.set(x, y + 1, shade(c, 0.7));
        pc.set(x + 3, y + 2, P.leafAutumn[2]); pc.set(x + 4, y + 2, P.leafAutumn[1]); pc.set(x + 4, y + 3, withA(DARK, 50));
      } else if (s.kind === "twig") {
        for (let i = 0; i < 4; i++) pc.set(x + i, y + (i > 1 ? 1 : 0), P.bark[i === 0 ? 3 : 2]);
        pc.set(x + 1, y + 1, withA(DARK, 60)); pc.set(x + 3, y + 2, withA(DARK, 60));
      } else if (s.kind === "moss") pc.shadedEllipse(x + 1, y + 1, 2.2, 1.6, P.moss, undefined, false);
    },
    edge: forest ? "soft" : "lip",
    lip: forest ? undefined : [R[1], P.dirt[1], P.dirt[0]],
    hi: forest ? undefined : R[3],
    shadow: forest ? [10, 20, 14, 50] : [10, 8, 16, 95],
    strays: forest ? undefined : "tuft",
  };
}

function dirtSurf(): Surface {
  const R = P.dirt;
  return {
    base: () => R[2],
    n: 9,
    minD: 5,
    shared: 4,
    kind(k, v, shared) {
      if (shared) return k < 0.45 ? "pebble" : "dent";
      if (v === 3 && k < 0.35) return "tuft";
      if (v === 1 && k < 0.6) return "stones";
      return k < 0.5 ? "pebble" : "dent";
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "pebble") pebble(pc, x, y, P.stone, k < 0.3 ? 3 : 2, 2);
      else if (s.kind === "stones") { pebble(pc, x, y, P.stone, 3, 2); pebble(pc, x + 4, y + 1, P.stone, 2, 2); pebble(pc, x + 2, y + 3, [R[1], R[2], R[3], R[4]], 2, 2); }
      else if (s.kind === "tuft") tuft(pc, x, y, P.grass, 3, 4, k);
      else for (let i = 0, len = 2 + Math.floor(k * 3); i < len; i++) { pc.set(x + i, y, R[1]); pc.set(x + i, y + 1, R[4]); } // вмятина-след
    },
    edge: "fray",
    rimIn: R[1],
    shadow: [20, 10, 6, 50],
  };
}

function sandSurf(): Surface {
  const R = P.sand;
  return {
    base: () => R[2],
    n: 8,
    minD: 6,
    shared: 3,
    kind(k, v, shared) { return shared || v === 0 ? (k < 0.7 ? "ripple" : k < 0.85 ? "fleck" : "pebble") : k < 0.5 ? "ripple" : k < 0.65 ? "shell" : k < 0.85 ? "fleck" : "pebble"; },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "ripple") ripple(pc, x, y, 4 + Math.floor(k * 5), R[4], R[1], k);
      else if (s.kind === "pebble") pebble(pc, x, y, [R[0], R[1], R[3], R[4]], 2, 2);
      else if (s.kind === "fleck") { pc.set(x, y, R[1]); pc.set(x + 1, y, R[1]); pc.set(x + 1, y - 1, R[3]); } // крупинки потемнее
      else { pc.set(x, y, [244, 232, 216, 255]); pc.set(x + 1, y, [226, 196, 180, 255]); pc.set(x - 1, y, [200, 160, 150, 255]); pc.set(x, y + 1, withA(DARK, 50)); } // ракушка
    },
    edge: "rim",
    rimIn: R[1],
    rimOut: [214, 236, 250, 150],
  };
}

export function duneSurf(): Surface {
  const R = P.dune;
  return {
    base: () => R[2],
    n: 7,
    minD: 7,
    shared: 3,
    kind(k, v, shared) { return shared ? "ripple" : v === 3 && k < 0.4 ? "grass" : k < 0.75 ? "ripple" : "pebble"; },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "ripple") ripple(pc, x - 3, y, 7 + Math.floor(k * 6), R[4], R[1], k * 0.6);
      else if (s.kind === "grass") tuft(pc, x, y, [P.deadwood[1], P.leafAutumn[1], P.leafAutumn[2], P.leafAutumn[3]], 4, 5, k);
      else pebble(pc, x, y, [R[0], R[0], R[1], R[3]], 3, 2);
    },
    edge: "rim",
    rimIn: R[1],
    rimOut: [90, 60, 30, 120],
  };
}

/** Вороной на торе 32×32: пояс точек у краёв общий для всех вариантов (швы совпадают) + свои точки внутри; depth — разброс пояса по обе стороны края. */
export function voro(seed: number, perEdge: number, inner: number, innerD: number, sx = 0.85, depth = 0) {
  const ring: [number, number][] = [];
  const rr = rng(seed), step = S / perEdge;
  const dep = () => (depth ? (rr() * 2 - 1) * depth : 1 + rr() * 3);
  for (let i = 0; i < perEdge; i++) { ring.push([i * step + 2 + rr() * (step - 4), dep()]); ring.push([dep(), i * step + step * 0.6 + rr() * (step * 0.3)]); }
  const ptsOf = new Map<number, [number, number, number][]>();
  const pts = (v: number) => {
    if (!ptsOf.has(v)) {
      const r = rng(seed + 19 + v * 17), inn: [number, number][] = [];
      for (let tries = 0; inn.length < inner && tries < 300; tries++) {
        const p: [number, number] = [8 + r() * 17, 8 + r() * 17];
        if (inn.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > innerD)) inn.push(p);
      }
      ptsOf.set(v, [...ring, ...inn].map(([a, b], i) => [a, b, hash01(Math.round(a), Math.round(b), seed + 39 + i + (i >= ring.length ? v * 7 : 0))]));
    }
    return ptsOf.get(v)!;
  };
  return (x: number, y: number, v: number) => {
    let d1 = 1e9, d2 = 1e9, best = [0, 0, 0], second = [0, 0];
    for (const [px, py, t] of pts(v)) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const cx = px + ox * S, cy = py + oy * S;
      const d = Math.hypot((x + 0.5 - cx) * sx, y + 0.5 - cy);
      if (d < d1) { d2 = d1; second = [best[0], best[1]]; d1 = d; best = [cx, cy, t]; } else if (d < d2) { d2 = d; second = [cx, cy]; }
    }
    // id пары ячеек на торе: одинаков в соседних тайлах (для трещин «есть/нет»)
    const w = (a: number) => Math.round(((a % S) + S) % S);
    const ia = w(best[0]) * 40 + w(best[1]), ib = w(second[0]) * 40 + w(second[1]);
    return { e: d2 - d1, cx: best[0], cy: best[1], t: best[2], pair: Math.min(ia, ib) * 2000 + Math.max(ia, ib) };
  };
}

/** Пепел: ровная зола, местами корка с неполной сетью трещин (часть швов не прорисована), трещины разной длины, рыхлые наносы, тление. */
export function ashSurf(): Surface {
  const R = P.ash, B = R[2];
  const plates = voro(611, 2, 2, 12, 0.9, 6);
  const GL: RGBA[] = [[196, 70, 28, 255], [255, 150, 60, 255]];
  return {
    base(x, y, v) {
      const a = plates(x, y, v);
      const on = hash01(a.pair % 1999, Math.floor(a.pair / 1999), 650) < 0.45; // шов есть не везде — не мощение
      if (!on) return B;
      if (a.e < 0.95) return R[0];
      if (a.e < 1.9) return (x + 0.5 - a.cx) + (y + 0.5 - a.cy) < 0 ? R[3] : R[1]; // приподнятый край корки
      return B;
    },
    n: 8,
    minD: 6,
    shared: 2,
    kind(k, v, shared) {
      if (shared) return "char";
      if ((v === 1 || v === 2) && k < 0.2) return "ember"; // тлеющая трещина — редкая, своя форма у каждого варианта
      return k < 0.3 ? "crack" : k < 0.55 ? "loose" : k < 0.72 ? "char" : k < 0.88 ? "stub" : "pebble";
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "crack") crack(pc, x - 2, y, 3 + Math.floor(k * 9), Math.floor(k * 1e6), R[0], R[3]);
      else if (s.kind === "ember") { // тлеющая трещина: тёмно-красные концы, оранжевая середина, тёплый отсвет по краю
        crack(pc, x - 3, y + 1, 7 + Math.floor(k * 30) % 5, Math.floor(k * 1e6), withA([150, 60, 30, 255], 90), null);
        crack(pc, x - 3, y, 7 + Math.floor(k * 30) % 5, Math.floor(k * 1e6), [120, 38, 22, 255], null, GL);
      }
      else if (s.kind === "loose") { // рыхлый нанос золы: светлое пятно с зернистым краем
        const inside = blob(Math.floor(k * 1e6), x, y, 3 + k * 3, 1.6 + k);
        for (let j = -4; j <= 4; j++) for (let i = -7; i <= 7; i++) if (inside(x + i, y + j)) pc.set(x + i, y + j, inside(x + i, y + j - 1) ? (hash01(x + i, y + j, 670) < 0.12 ? R[4] : R[3]) : R[4]);
      } else if (s.kind === "char") {
        for (let i = 0; i < 3; i++) pc.set(x + i, y, i === 0 ? R[3] : [26, 20, 22, 255]);
        pc.set(x + 1, y + 1, withA(DARK, 70));
      } else if (s.kind === "stub") tuft(pc, x, y, [P.deadwood[0], P.deadwood[0], P.deadwood[1], P.deadwood[2]], 3, 3 + Math.floor(k * 2), k);
      else pebble(pc, x, y, [P.obsidian[0], P.obsidian[1], P.obsidian[2], P.obsidian[3]], 3, 2);
    },
    edge: "rim",
    rimIn: R[0],
    rimOut: [24, 16, 14, 150],
  };
}

/** Болото: ровная топь, кочки, камыш; лужи — у каждого варианта своя форма и размер, целиком внутри тайла (без сетки и пар-близнецов). */
export function bogSurf(): Surface {
  const R = P.bog;
  const W1: RGBA = [34, 52, 54, 255], W2: RGBA = [48, 74, 74, 255], WH: RGBA = [112, 142, 132, 255];
  // вариант → лужи [cx, cy, rx, ry]: 1 — большая, 3 — малая вытянутая; у 0 и 2 луж нет (кочки), иначе одна форма повторяется слишком часто
  const POOLS: Record<number, [number, number, number, number][]> = { 1: [[15, 15, 8.5, 5]], 2: [[10, 11, 4.5, 2.4], [23, 22, 3, 1.7]], 3: [[17, 18, 6.5, 3]] };
  return {
    base: () => R[2],
    n: 8,
    minD: 6,
    shared: 3,
    kind(k, v, shared) {
      if (shared) return "mark";
      return k < 0.4 ? "reed" : k < 0.7 ? "hummock" : k < 0.82 ? "moss" : "mark";
    },
    extra(pc, v) {
      for (const [i, [cx, cy, rx, ry]] of (POOLS[v] ?? []).entries()) {
        const inside = blob(5100 + v * 31 + i, cx, cy, rx, ry);
        const near = (x: number, y: number) => inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1) || inside(x + 1, y + 1);
        for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
          if (!inside(x, y)) { if (near(x, y)) pc.set(x, y, R[1]); continue; } // мокрая грязь по краю
          const up = inside(x, y - 1), dn = inside(x, y + 1), up2 = inside(x, y - 2);
          pc.set(x, y, !up ? R[0] : !up2 ? W1 : !dn ? WH : W2); // тёмный берег сверху, отражение неба снизу
        }
        // ряска и камыш у края лужи
        pc.set(Math.round(cx + rx * 0.3), Math.round(cy), P.moss[2]); pc.set(Math.round(cx + rx * 0.3) + 1, Math.round(cy), P.moss[1]);
      }
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "hummock") clump(pc, x - 3, y, [R[1], R[2], R[3], R[4], mix(R[4], P.moss[2], 0.5)], 6 + Math.floor(k * 3), k);
      else if (s.kind === "reed") {
        tuft(pc, x, y, [R[0], R[2], R[4], mix(R[4], P.grass[4], 0.4)], 4, 6, k);
        if (k < 0.25) { pc.set(x, y - 6, [92, 58, 34, 255]); pc.set(x, y - 7, [120, 78, 44, 255]); }
      } else if (s.kind === "moss") pc.shadedEllipse(x + 1, y + 1, 2.6, 1.8, P.moss, undefined, false);
      else if (s.kind === "mark") mark(pc, x, y, R[1], R[3], true);
      else tuft(pc, x, y, [R[1], R[2], R[3], R[4]], 3, 3, k);
    },
    edge: "rim",
    rimIn: R[0],
    shadow: [8, 12, 8, 60],
  };
}

function snowSurf(): Surface {
  const R = P.snow, B = R[2];
  return {
    base: () => B,
    n: 9,
    minD: 7,
    shared: 3,
    kind(k, v, shared) {
      if (shared) return k < 0.6 ? "drift" : "spark";
      if (v === 3 && k < 0.4) return "dry";
      return k < 0.4 ? "drift" : k < 0.65 ? "spark" : k < 0.85 && v > 0 ? "mound" : "lump";
    },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "drift") ripple(pc, x, y, 4 + Math.floor(k * 5), R[4], R[1], k);
      else if (s.kind === "mound") { // мягкий сугроб: светлый верх, голубая тень снизу-справа
        const w = 5 + Math.floor(k * 4);
        pc.ellipse(x + 1, y + 1.2, w, 2, withA([60, 80, 140, 255], 45));
        pc.ellipse(x, y, w, 2.4, mix(B, R[3], 0.7));
        pc.ellipse(x - 2, y - 1, w - 3, 1.1, mix(R[3], R[4], 0.6));
      } else if (s.kind === "spark") { pc.set(x, y, R[4]); pc.set(x + 1, y, R[4]); pc.set(x, y - 1, [255, 255, 255, 255]); pc.set(x, y + 1, R[3]); }
      else if (s.kind === "lump") { pc.set(x + 1, y + 2, withA([40, 60, 110, 255], 60)); pc.shadedEllipse(x + 1, y + 1, 3, 1.8, R, undefined, false); }
      else tuft(pc, x, y, [P.deadwood[1], P.deadwood[2], P.deadwood[3], mix(P.deadwood[3], R[3], 0.5)], 3, 3 + Math.floor(k * 2), k, false);
    },
    edge: "lip",
    lip: [R[1], R[0]],
    hi: R[4],
    shadow: [40, 60, 110, 80],
  };
}

/** Лёд: ровная гладь, светлые трещины с тёмной кромкой, косые блики, пузырьки, глубокие тёмные пятна. */
function iceSurf(): Surface {
  const R = P.ice;
  return {
    base: () => R[2],
    n: 7,
    minD: 6,
    shared: 2,
    kind(k, v, shared) { return shared ? (k < 0.5 ? "crack" : "glint") : k < 0.3 ? "crack" : k < 0.55 ? "glint" : k < 0.75 ? "bubble" : v > 0 ? "deep" : "glint"; },
    draw(pc, s) {
      const { x, y, k } = s;
      if (s.kind === "crack") crack(pc, x - 2, y, 4 + Math.floor(k * 7), Math.floor(k * 1e6), R[4], R[1]);
      else if (s.kind === "glint") for (let i = 0; i < 3; i++) { pc.set(x + i, y - i, R[4]); if (k > 0.5) pc.set(x + i + 2, y - i, R[3]); }
      else if (s.kind === "bubble") { pc.set(x, y, R[4]); pc.set(x + 1, y, R[3]); pc.set(x, y + 1, R[3]); pc.set(x + 3, y + 2, R[4]); }
      else { const inside = blob(Math.floor(k * 1e6), x, y, 3 + k * 2, 1.6); for (let j = -3; j <= 3; j++) for (let i = -6; i <= 6; i++) if (inside(x + i, y + j)) pc.set(x + i, y + j, mix(R[1], R[2], 0.5)); }
    },
    edge: "rim",
    rimIn: R[1],
    rimOut: [220, 245, 255, 150],
  };
}

/** Брусчатка: камни-ячейки Вороного, чуть вытянуты рядами, фаска к свету, тёмные швы, мох в швах у варианта 2. */
export function cobbleSurf(): Surface {
  const R = P.cobble;
  const near = voro(811, 4, 5, 7);
  return {
    base(x, y, v) {
      const a = near(x, y, v);
      if (a.e < 1.4) return R[0];
      let k = 2 + (a.t > 0.7 ? 0.6 : a.t < 0.3 ? -0.6 : 0);
      if (a.e < 2.8) k += (x + 0.5 - a.cx) + (y + 0.5 - a.cy) < 0 ? 1.1 : -0.9;
      let c = R[clamp(Math.round(k), 0, 4)];
      if (v === 2 && a.e < 2.2 && hash01(Math.floor(x / 2), Math.floor(y / 2), 880) < 0.3) c = P.moss[1];
      return c;
    },
    n: 2,
    minD: 9,
    kind: (k, v, shared) => (!shared && v === 3 ? "weed" : null),
    draw(pc, s) { tuft(pc, s.x, s.y, P.grass, 3, 3, s.k, false); },
    edge: "stones",
    shadow: [10, 8, 14, 90],
    stoneOf: (x, y, v) => near(x, y, v),
  };
}

// ---------- сборка тайлов ----------
function coverage(mask: number, x: number, y: number, seed: number, rough: number, calm = 1) {
  const u = clamp((x + 0.5) / S, 0, 1), v = clamp((y + 0.5) / S, 0, 1);
  const f = (mask & 1 ? (1 - u) * (1 - v) : 0) + (mask & 2 ? u * (1 - v) : 0) + (mask & 4 ? u * v : 0) + (mask & 8 ? (1 - u) * v : 0);
  const xx = ((x % S) + S) % S, yy = ((y % S) + S) % S;
  return f + ((pnoise(xx, yy, 16, S, seed) - 0.5) * 0.5 + (pnoise(xx, yy, 8, S, seed + 1) - 0.5) * 0.3 + (pnoise(xx, yy, 4, S, seed + 2) - 0.5) * rough) * calm;
}

export function makeTile(sf: Surface, t: number, mask: number, variant: number): PC {
  const out = new PC(S, S);
  const seed = 900 + t * 17;
  const rough = sf.edge === "fray" ? 0.32 : sf.edge === "soft" ? 0.22 : 0.1;
  const E = S + 8, at = (x: number, y: number) => (clamp(y, -4, S + 3) + 4) * E + clamp(x, -4, S + 3) + 4;
  const covA = new Float32Array(E * E);
  for (let y = -4; y < S + 4; y++) for (let x = -4; x < S + 4; x++) covA[at(x, y)] = mask === 15 ? 9 : coverage(mask, x, y, seed, rough, sf.calm ?? 1);
  const cov = (x: number, y: number) => covA[at(x, y)];
  let inside = (x: number, y: number) => cov(x, y) > 0.5;
  if (sf.edge === "stones" && mask !== 15) {
    const so = sf.stoneOf!; // кромка по целым камням
    inside = (x, y) => { const st = so(x, y, variant); return cov(clamp(Math.round(st.cx), 0, S - 1), clamp(Math.round(st.cy), 0, S - 1)) > 0.5 && cov(x, y) > 0.15; };
  }
  // однопиксельные зубцы кромки убираем: пиксель внутри, только если внутри хотя бы 2 соседа по кресту
  const raw = new Uint8Array(E * E);
  for (let y = -4; y < S + 4; y++) for (let x = -4; x < S + 4; x++) raw[at(x, y)] = inside(x, y) ? 1 : 0;
  const R0 = (x: number, y: number) => raw[at(x, y)];
  const IN = (x: number, y: number) => R0(x, y) === 1 && (mask === 15 || R0(x - 1, y) + R0(x + 1, y) + R0(x, y - 1) + R0(x, y + 1) >= 2);
  const lip = sf.lip ?? [];
  const lipAt = (x: number, y: number) => { let d = 0; while (d < lip.length && IN(x, y + d + 1)) d++; return d; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (IN(x, y)) out.set(x, y, sf.base(x, y, variant));
  if (mask === 15) sf.under?.(out, variant);
  // штампы: на поле 3×3 тайла со сворачиванием на тор (общие у краёв продолжаются в соседнем тайле)
  const tmp = new PC(S * 3, S * 3), mine = new PC(S, S);
  for (const s of stampSet(sf, t, mask === 15 ? variant : 20 + mask, variant)) {
    if (mask !== 15 && (!IN(s.x, s.y) || (sf.edge === "lip" && lipAt(s.x, s.y) < lip.length))) continue;
    if (s.shared) sf.draw(tmp, { ...s, x: s.x + S, y: s.y + S });
    else sf.draw(mine, s);
  }
  tmp.blit(mine, S, S);
  if (sf.strays && mask !== 15) {
    const r = rng(mask * 13 + t);
    for (let i = 0; i < 12; i++) {
      const x = 2 + Math.floor(r() * (S - 4)), y = 3 + Math.floor(r() * (S - 5)), k = r(), c = cov(x, y);
      if (!IN(x, y) && c > 0.28 && c < 0.5) sf.draw(tmp, { x: x + S, y: y + S, k, kind: sf.strays });
    }
  }
  for (let y = 0; y < S * 3; y++) for (let x = 0; x < S * 3; x++) {
    const c = tmp.get(x, y)!;
    if (!c[3]) continue;
    const X = x % S, Y = y % S;
    if (mask !== 15) {
      const own = x >= S && x < 2 * S && y >= S && y < 2 * S;
      if (!own && !IN(X, Y)) continue;
      if (!IN(X, Y) && !IN(X, Y - 1) && !IN(X, Y - 2) && !sf.strays) continue;
    }
    out.set(X, Y, c);
  }
  if (mask === 15) sf.extra?.(out, variant); // лужи поверх штампов — чистая вода
  // кромка: бровка, блик сверху, тень снаружи
  if (mask !== 15) {
    const top = new PC(S, S);
    top.data.set(out.data);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (IN(x, y)) {
        const d = lipAt(x, y);
        let c: RGBA | null = null;
        const bd = sf.band ? (() => { for (let r = 1; r <= sf.band!.w; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (!IN(x + i, y + j)) return r; return 0; })() : 0;
        if ((sf.edge === "lip" || sf.band) && d < lip.length) c = lip[lip.length - 1 - d];
        else if (bd) { const b = sf.band!; c = (x + y * 3) % b.joint === 0 ? b.seam : bd === b.w ? b.seam : !IN(x - bd, y) || !IN(x, y - bd) ? b.lit : b.top; } // бордюр: светлая сторона к свету, шов внутрь и стыки
        else if (sf.edge === "stones") { if (!IN(x, y + 1) || !IN(x + 1, y)) c = shade(top.get(x, y)!, 0.8); }
        else if (!IN(x, y + 1) || !IN(x - 1, y) || !IN(x + 1, y) || !IN(x, y - 1)) c = sf.rimIn ? mix(top.get(x, y)!, sf.rimIn, 0.7) : shade(top.get(x, y)!, 0.88);
        if (sf.hi && !IN(x, y - 1) && IN(x, y + 1)) c = sf.hi;
        if (c) out.set(x, y, c);
      } else if (!out.alpha(x, y)) {
        if (sf.shadow && (IN(x, y - 1) || (IN(x - 1, y - 1) && IN(x - 1, y)))) out.set(x, y, sf.shadow);
        else if (sf.shadow && IN(x, y - 2) && (sf.edge === "lip" || sf.band)) out.set(x, y, withA(sf.shadow, sf.shadow[3] * 0.45));
        else if (sf.rimOut && (IN(x - 1, y) || IN(x + 1, y) || IN(x, y - 1) || IN(x, y + 1))) out.set(x, y, sf.rimOut);
      }
    }
  }
  return out;
}

const SURFACES: Partial<Record<T, () => Surface>> = {
  [T.Sand]: sandSurf,
  [T.Bog]: bogSurf,
  [T.Ash]: ashSurf,
  [T.Dirt]: dirtSurf,
  [T.Grass]: () => grassSurf(P.grass, 210),
  [T.Forest]: () => grassSurf(P.forest, 230, true),
  [T.Cobble]: cobbleSurf,
  [T.Snow]: snowSurf,
  [T.Ice]: iceSurf,
  [T.Dune]: duneSurf,
};

/** Перерисовывает строки поверхностей земли в готовом тайлсете (вызывается из buildTileset). */
export function groundRows(out: PC) {
  for (const [k, make] of Object.entries(SURFACES)) {
    const t = Number(k), sf = make!();
    out.data.fill(0, t * S * out.w * 4, (t + 1) * S * out.w * 4);
    for (let mask = 1; mask <= 15; mask++) out.blit(makeTile(sf, t, mask, 0), (mask - 1) * S, t * S);
    for (let v = 1; v <= 3; v++) out.blit(makeTile(sf, t, 15, v), (14 + v) * S, t * S);
  }
}
