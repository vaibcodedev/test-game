/** Генерация эффектов шага 2 (задача 127): ауры и щиты на героях, кольца под ногами, берсерк, руны, знамя, капкан, ворон,
 *  дождь стрел, топор, кандалы, лужа крови. Стиль как у паков: жёсткие пиксели, 4–6 тонов рампы стихии из vfx-lib (RAMPS),
 *  кадры 4–10, циклы замыкаются. Запуск отдельно: tsx tools/gen/vfx-gen2.ts — tools/out/vfx-preview/gen2-raw.png. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, rng, hex, type RGBA } from "./canvas";
import { RAMPS, gradientMap, storyboard, stackV, readPng, paintGround, scaleNN, fill, BG } from "./vfx-lib";
import { erode, type Gen, type Orbit } from "./vfx-gen";

const put = (f: PC, x: number, y: number, c: RGBA) => f.set(Math.round(x), Math.round(y), c);
const TAU = Math.PI * 2;
const mk = (id: string, role: Gen["role"], frames: PC[], w: number, h: number, anchor: [number, number], fps: number, hero?: string, ease?: Gen["ease"]): Gen => ({ id, pack: "gen", role, frames, w, h, anchor, fps, blend: "normal", hero, ...(ease ? { ease } : {}) });

/** Щит-пузырь на герое (сразу в размере игры 39×44, без уменьшения): обод в 2 пикселя (внешний тон темнее), стекло — полупрозрачная заливка,
 *  светлее к верхнему левому краю (объём), постоянный блик слева сверху; по ободу бежит блик с хвостом из 7 точек: 60 кадров при 30 к/с —
 *  оборот за 2 с, 6° (≈1.9 px) за кадр, цикл бесшовный. Крупы стекла нет: она «ползла» по кадрам. */
function auraBubble(id: string, ramp: string): Gen {
  const W = 39, H = 44, cx = 19.5, cy = 22, rx = 17.5, ry = 20.5, N = 60, R = RAMPS[ramp];
  const glass = new PC(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
    if (d > 1) continue;
    if (d > 0.8) glass.set(x, y, d > 0.92 ? R[3] : R[2]);
    else { const lit = Math.max(0, -(dx + dy) * 0.7); glass.set(x, y, [...(lit > 0.35 ? R[2] : R[1]).slice(0, 3), Math.round(26 + 34 * lit + 30 * d)] as RGBA); }
  }
  put(glass, cx - 10, cy - 14, R[5]); put(glass, cx - 11, cy - 13, R[4]); put(glass, cx - 9, cy - 15, R[4]); put(glass, cx - 12, cy - 11, R[3]);
  const frames = Array.from({ length: N }, (_, t) => {
    const f = glass.clone(), a0 = (t / N) * TAU;
    for (let k = 6; k >= 0; k--) { const a = a0 - k * 0.11; put(f, cx - 0.5 + Math.cos(a) * (rx - 0.7), cy - 0.5 + Math.sin(a) * (ry - 0.7), k < 2 ? R[5] : k < 4 ? R[4] : R[3]); }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.5], 30, "warrior");
}

/** Кольцо под ногами героя (бафы-круги, сразу 44×24): две дуги и засечки, сдвигающиеся на 2 позиции за цикл (24 кадра при 15 к/с — 1.6 с,
 *  3° за кадр, цвет засечек на стыке совпадает). */
function auraRing(id: string, ramp: string): Gen {
  const W = 44, H = 24, cx = W / 2, cy = H / 2, rx = 20, ry = 9.3, N = 24, R = RAMPS[ramp];
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    // обод в 2 пикселя (внешний тон и светлая кромка внутри) и тёмное внутреннее кольцо — объём вместо двух нитей
    for (let i = 0; i < 260; i++) {
      const a = (i / 260) * TAU, c = Math.cos(a), sn = Math.sin(a);
      put(f, cx - 0.5 + c * rx, cy - 0.5 + sn * ry, R[2]);
      put(f, cx - 0.5 + c * (rx - 0.9), cy - 0.5 + sn * (ry - 0.9), sn < 0 ? R[4] : R[3]);
      put(f, cx - 0.5 + c * (rx - 2.6), cy - 0.5 + sn * (ry - 1.6), R[1]);
    }
    for (let k = 0; k < 10; k++) {
      const a = ((k + (2 * t) / N) / 10) * TAU;
      for (let rr = rx - 2.5; rr <= rx; rr += 0.5) put(f, cx - 0.5 + Math.cos(a) * rr, cy - 0.5 + Math.sin(a) * rr * (ry / rx), k % 2 ? R[3] : R[5]);
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.5], 15, "healer");
}

/** Берсерк (сразу 34×44): языки красного пламени снизу вверх вокруг героя; язык растёт и опадает (длина len·sin(πp)), верхняя треть пути
 *  темнее. 20 кадров при 30 к/с — цикл 667 мс, подъём 1.7 px за кадр. */
function auraRage(id: string): Gen {
  const W = 34, H = 44, N = 20, R = RAMPS.blood, r = rng(21);
  const tongues = Array.from({ length: 20 }, () => ({ x: 4 + r() * 26, ph: r(), len: 6 + Math.floor(r() * 6) }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (const g of tongues) {
      const p = (g.ph + t / N) % 1, y = H - 4 - p * (H - 10), sway = Math.sin((p + g.ph) * TAU) * 1.5, len = Math.round(g.len * Math.sin(Math.PI * p));
      if (len < 1) continue;
      const top = p > 2 / 3;
      for (let k = 0; k < len; k++) { const kk = k / len; put(f, g.x + sway * (1 - kk), y - k, R[top ? 2 : kk < 0.4 ? 4 : kk < 0.75 ? 3 : 2]); put(f, g.x + 1 + sway, y - k, R[top ? 1 : kk < 0.4 ? 3 : 2]); }
      put(f, g.x + sway, y - len, R[top ? 3 : 5]);
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.86], 30, "reaver");
}

/** Рунный клинок рыцаря смерти: 4 каменно-ледяные плитки с вырезанной руной кружат вокруг героя на уровне пояса, 7×8 пикселей мира.
 *  Два листа одного рисунка: двойной плотности 14×16 (масштаб 0.5 — зум 2 и 4) и тройной 21×24 (масштаб 1/3 — зум 3 и 6). Клиент берёт лист,
 *  при котором пиксель листа — целое число пикселей холста, а размер ближе к задуманному. Плитка: толстый тёмный контур, 5 тонов, светлая верхняя
 *  грань, вырезанный глиф со светлой кромкой; в тройной плотности те же формы и палитра, глиф и фаска дорисованы, а не растянуты.
 *  Орбиту клиент считает каждый кадр (orbit в манифесте), поэтому лист — только сами руны: кадры 0–3 руны, 4–7 ореол и свет глифа
 *  (альфа по синусу, add), 8–11 блик на верхней грани (короткая вспышка). */
interface RuneDensity {
  /** Плитка и поле вокруг неё (под ореол), пиксели листа. */
  w: number; h: number; pad: number;
  /** Форма плитки: [левая, правая] колонка по строкам; глиф — строки «#», левый верхний угол (gx, gy). */
  shapes: [number, number][][]; glyphs: string[][]; gx: number; gy: number;
  /** Светлая верхняя грань — строки до top включительно; пороги диагональных полос тона (x + 0.6·y). */
  top: number; diag: [number, number];
  /** Ореол: ближнее и дальнее кольцо (расстояние от плитки); луч блика; thick — контур снизу и справа в 2 пикселя и полоса тени за ним
   *  (в тройной плотности тёмный край той же толщины в пикселях мира, что и в двойной: контур 1 + тень 1 там — контур 2 + тень 1 здесь). */
  rings: [number, number]; arm: number; thick: boolean;
}
// двойная плотность: 14×16
const RUNE_SHAPES: [number, number][][] = [
  // арка с острой макушкой
  [[5, 8], [4, 9], [3, 10], [2, 11], [2, 11], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [2, 11], [2, 11], [2, 11], [3, 10]],
  // кристалл, острый с двух концов
  [[6, 7], [5, 8], [4, 9], [3, 10], [2, 11], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [2, 11], [3, 10], [3, 10], [4, 9], [5, 8], [6, 7]],
  // плита со срезанными углами
  [[3, 10], [2, 11], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [2, 11], [3, 10]],
  // осколок со сколом сверху справа
  [[3, 7], [2, 9], [2, 10], [1, 11], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [1, 12], [2, 12], [2, 11], [2, 11], [3, 10], [3, 10], [4, 9]],
];
const GLYPHS: string[][] = [
  ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],            // трезубец
  ["#.#.#", "#.#.#", "#####", "..#..", "..#..", "..#..", "..#.."],            // вилы
  [".###.", "#....", "#....", ".###.", "....#", "....#", "###.."],            // змейка
  ["..#..", ".#.#.", "#...#", ".#.#.", "..#..", "..#..", "..#.."],            // ромб на стержне
];
// тройная плотность: 21×24, те же силуэты (ширина и ступени ×1.5, симметрия сохранена), глифы 7×10 дорисованы
const RUNE_SHAPES3: [number, number][][] = [
  // арка с острой макушкой
  [[8, 12], [7, 13], [6, 14], [5, 15], [4, 16], [3, 17], [3, 17], [2, 18], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19],
    [1, 19], [1, 19], [2, 18], [3, 17], [3, 17], [3, 17], [4, 16], [5, 15]],
  // кристалл, острый с двух концов
  [[9, 11], [8, 12], [7, 13], [6, 14], [5, 15], [4, 16], [3, 17], [2, 18], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [2, 18],
    [3, 17], [4, 16], [4, 16], [5, 15], [6, 14], [7, 13], [8, 12], [9, 11]],
  // плита со срезанными углами
  [[4, 16], [3, 17], [2, 18], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [1, 19],
    [1, 19], [1, 19], [1, 19], [1, 19], [1, 19], [2, 18], [3, 17], [4, 16]],
  // осколок со сколом сверху справа
  [[5, 11], [4, 13], [3, 14], [3, 15], [3, 16], [2, 17], [2, 18], [2, 19], [2, 19], [2, 19], [2, 19], [2, 19], [2, 19], [2, 19], [2, 19], [3, 19],
    [3, 19], [3, 17], [3, 17], [3, 17], [4, 16], [5, 16], [5, 15], [6, 14]],
];
const GLYPHS3: string[][] = [
  ["#.....#", "#.....#", "#.....#", ".#...#.", "..#.#..", "...#...", "...#...", "...#...", "...#...", "...#..."],   // трезубец
  ["#..#..#", "#..#..#", "#..#..#", "#######", "...#...", "...#...", "...#...", "...#...", "...#...", "...#..."],   // вилы
  [".#####.", "#......", "#......", "#......", ".#####.", "......#", "......#", "......#", "......#", "######."],   // змейка
  ["...#...", "..#.#..", ".#...#.", "#.....#", ".#...#.", "..#.#..", "...#...", "...#...", "...#...", "...#..."],   // ромб на стержне
];
const RUNE2: RuneDensity = { w: 14, h: 16, pad: 3, shapes: RUNE_SHAPES, glyphs: GLYPHS, gx: 4, gy: 4, top: 3, diag: [9, 13], rings: [1, 2], arm: 2, thick: false };
const RUNE3: RuneDensity = { w: 21, h: 24, pad: 4, shapes: RUNE_SHAPES3, glyphs: GLYPHS3, gx: 7, gy: 6, top: 5, diag: [13.5, 19.5], rings: [1.5, 3], arm: 3, thick: true };
const runeIn = (D: RuneDensity, k: number, x: number, y: number) => y >= 0 && y < D.h && x >= D.shapes[k][y][0] && x <= D.shapes[k][y][1];
const glyphOn = (D: RuneDensity, k: number, x: number, y: number) => D.glyphs[k][y - D.gy]?.[x - D.gx] === "#";

/** Сама плитка k (без свечения): контур, тона по глубине от края, светлая кромка сверху-слева, тень справа-снизу, вырезанный глиф. */
export function runeBody(D: RuneDensity, k: number, pal: { o: RGBA; t: RGBA[]; rim: RGBA; groove: RGBA; lit: RGBA }): PC {
  const P = D.pad, S = new PC(D.w + P * 2, D.h + P * 2), gw = D.glyphs[k][0].length, gh = D.glyphs[k].length;
  const inside = (x: number, y: number) => runeIn(D, k, x, y), on = (x: number, y: number) => glyphOn(D, k, x, y);
  const depth = (x: number, y: number) => { let d = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!inside(x + dx, y + dy)) d = Math.min(d, Math.abs(dx) + Math.abs(dy)); return d; };
  for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) {
    if (!inside(x, y)) continue;
    const d = depth(x, y);
    let c: RGBA;
    if (d === 1) c = pal.o;                                                            // контур
    else {
      c = pal.t[y <= D.top ? 0 : x + y * 0.6 < D.diag[0] ? 1 : x + y * 0.6 < D.diag[1] ? 2 : 3];
      if (d === 2 && (!inside(x, y - 2) || !inside(x - 2, y))) c = pal.rim;            // светлая кромка сверху и слева
      if (d === 2 && (!inside(x + 2, y) || !inside(x, y + 2))) c = D.thick ? pal.o : pal.t[4];  // тень справа и снизу (в тройной — второй ряд контура)
      if (D.thick && d > 2 && (!inside(x + 3, y) || !inside(x, y + 3))) c = pal.t[4];          // за ним полоса тени
    }
    S.set(x + P, y + P, c);
  }
  // вырезанная руна: тёмная канавка и светлая кромка снизу-справа
  for (let y = D.gy; y < D.gy + gh; y++) for (let x = D.gx; x < D.gx + gw; x++) if (on(x, y)) S.set(x + P, y + P, pal.groove);
  for (let y = D.gy; y < D.gy + gh + 1; y++) for (let x = D.gx; x < D.gx + gw + 1; x++) if (!on(x, y) && (on(x - 1, y) || on(x, y - 1)) && inside(x, y)) S.set(x + P, y + P, pal.lit);
  return S;
}

/** Ореол плитки k и свет глифа (кадр рисуется поверх руны в режиме add): два кольца вокруг контура (ближнее ярче), канавка глифа светится. */
export function runeHalo(D: RuneDensity, k: number): PC {
  const P = D.pad, S = new PC(D.w + P * 2, D.h + P * 2), R = Math.ceil(D.rings[1]);
  const ring = (x: number, y: number) => { let d = 9; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (runeIn(D, k, x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)) + (dx && dy ? 0.5 : 0)); return d; };
  for (let y = -P; y < D.h + P; y++) for (let x = -P; x < D.w + P; x++) {
    if (runeIn(D, k, x, y)) { if (glyphOn(D, k, x, y)) S.set(x + P, y + P, hex("#5ad2f4")); continue; }
    const d = ring(x, y);
    if (d <= D.rings[0]) S.set(x + P, y + P, hex("#4aa8d8", 150));
    else if (d <= D.rings[1]) S.set(x + P, y + P, hex("#2a6c9c", 80));
  }
  return S;
}

/** Блик: четырёхлучевая искра на верхней левой грани плитки k (центр белый, лучи по arm пикселей, кончик тусклее). */
export function runeGlint(D: RuneDensity, k: number): PC {
  const P = D.pad, S = new PC(D.w + P * 2, D.h + P * 2);
  const y = D.top, x = D.shapes[k][y][0] + D.arm;
  const hi = hex("#ffffff"), mid = hex("#c8f4ff"), lo = hex("#7fd4f4", 200);
  S.set(x + P, y + P, hi);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = 1; i <= D.arm; i++) S.set(x + dx * i + P, y + dy * i + P, i < D.arm ? mid : lo);
  return S;
}

const RUNE_PAL = { o: hex("#0a1626"), t: ["#dff6ff", "#8fd0ea", "#5a9cc8", "#3a6aa0", "#243e6c"].map((c) => hex(c)), rim: hex("#f2fcff"), groove: hex("#0e2a4a"), lit: hex("#a4e8fa") };

/** Лист рун для клиента: 12 кадров (руны, ореолы, блики). density 2 — aura-runes-frost 20×22, масштаб 0.5, с орбитой (пиксели мира);
 *  density 3 — aura-runes-frost-x3 29×32, масштаб 1/3 (тот же размер в мире), орбиту клиент берёт у основного листа. */
export function runeSet(density: 2 | 3 = 2): Gen {
  const D = density === 3 ? RUNE3 : RUNE2, W = D.w + D.pad * 2, H = D.h + D.pad * 2, ks = [0, 1, 2, 3];
  const frames = [...ks.map((k) => runeBody(D, k, RUNE_PAL)), ...ks.map((k) => runeHalo(D, k)), ...ks.map((k) => runeGlint(D, k))];
  const g: Gen = {
    id: density === 3 ? "aura-runes-frost-x3" : "aura-runes-frost", pack: "gen", role: "aura", frames, w: W, h: H, anchor: [0.5, 0.5], fps: 1, blend: "normal", hero: "deathknight",
    scale: 1 / density, ease: { fadeIn: 350, fadeOut: 350, scaleIn: 0.6 },
  };
  // орбита чуть шире плеч, центр на поясе (8 px над ногами), оборот за 2.8 с; покачивание ±1 px, ореол дышит, блик — раз в 3 с на каждой руне
  if (density === 2) g.orbit = { n: 4, rx: 12, ry: 4, oy: -8, period: 2800, bob: 1, bobPeriod: 1900, glow: [0.3, 0.85], glowPeriod: 1500, back: 0.6, twinkle: 3100 };
  return g;
}


/** Кадр орбиты для превью — та же формула, что в клиенте (vfx.ts, Vfx.orbit): холст плотности листа (1/scale пикселей на пиксель мира),
 *  (cx2, cy2) — ноги героя на этом холсте, позиции до пикселя холста. o — орбита основного листа (у листа x3 своей нет). */
export function orbitPreview(g: Gen, t: number, canvas: PC, cx2: number, cy2: number, front: boolean, o: Orbit = g.orbit!) {
  const n = o.n, D = Math.round(1 / (g.scale ?? 1));
  const items = Array.from({ length: n }, (_, i) => {
    const a = (t / o.period) * TAU + (i * TAU) / n, sn = Math.sin(a);
    const bob = Math.sin((t / o.bobPeriod) * TAU + i * 2.3) * o.bob;
    return { i, sn, x: Math.round(Math.cos(a) * o.rx * D), y: Math.round((sn * o.ry + o.oy + bob) * D) };
  }).filter((r) => (r.sn >= 0) === front).sort((p, q) => p.sn - q.sn);
  for (const r of items) {
    const k = 1 - ((1 - o.back) * (1 - r.sn)) / 2;
    const body = g.frames[r.i].clone().map((c) => [Math.round(c[0] * k * 0.92), Math.round(c[1] * k * 0.97), Math.round(c[2] * k), c[3]]);
    const x0 = cx2 + r.x - Math.floor(g.w / 2), y0 = cy2 + r.y - Math.floor(g.h / 2);
    canvas.blit(body, x0, y0);
    const glow = o.glow[0] + (o.glow[1] - o.glow[0]) * (0.5 + 0.5 * Math.sin((t / o.glowPeriod) * TAU + r.i * 1.7)), ga = glow * (0.45 + (0.55 * (r.sn + 1)) / 2);
    const halo = g.frames[n + r.i];
    for (let y = 0; y < halo.h; y++) for (let x = 0; x < halo.w; x++) {
      const c = halo.get(x, y)!;
      if (!c[3]) continue;
      const d = canvas.get(x0 + x, y0 + y);
      if (!d) continue;
      const a = (c[3] / 255) * ga;
      // add поверх непрозрачного; на пустом холсте (лист для aura-fx) — тот же цвет с альфой
      if (d[3]) canvas.set(x0 + x, y0 + y, [Math.min(255, d[0] + c[0] * a), Math.min(255, d[1] + c[1] * a), Math.min(255, d[2] + c[2] * a), 255]);
      else canvas.set(x0 + x, y0 + y, [c[0], c[1], c[2], Math.round(255 * a)]);
    }
  }
}

/** Орбита, запечённая в два листа (передний и задний слой, 12 кадров на оборот, двойная плотность) — для превью tools/gen/aura-fx.ts.
 *  В игре орбиту считает клиент (runeSet + orbit); якорь листа — центр кадра героя (ряд 16), центр орбиты — на поясе ниже него. */
export function runeOrbit(): Gen[] {
  const g = runeSet(), o = g.orbit!, N = 12, W = Math.ceil(o.rx * 4 + g.w + 4), H = Math.ceil(o.ry * 4 + g.h + 8), cx = Math.round(W / 2), cy = Math.round(H / 2);
  const front = Array.from({ length: N }, () => new PC(W, H)), back = Array.from({ length: N }, () => new PC(W, H));
  for (let t = 0; t < N; t++) { orbitPreview(g, (t * o.period) / N, back[t], cx, cy - o.oy * 2, false); orbitPreview(g, (t * o.period) / N, front[t], cx, cy - o.oy * 2, true); }
  // ноги героя (ряд 30) — на cy - oy·2 в двойной плотности, центр кадра героя (ряд 16) на 28 пикселей выше
  const ay = (cy - o.oy * 2 - 28) / H;
  const mkl = (id: string, frames: PC[]): Gen => ({ id, pack: "gen", role: "aura", frames, w: W, h: H, anchor: [0.5, ay], fps: 10, blend: "normal", hero: "deathknight" });
  return [mkl("aura-runes-frost", front), mkl("aura-runes-frost-back", back)];
}

/** Цикл пламени (стена огня, ожог): широкое основание, языки тянутся вверх и гаснут. 8 кадров цикла. */
function flameLoop(id: string): Gen {
  const W = 34, H = 44, N = 8, R = RAMPS.fire, r = rng(55);
  const tongues = Array.from({ length: 16 }, () => ({ x: 4 + r() * 26, ph: r(), len: 8 + Math.floor(r() * 9) }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let x = 3; x < W - 3; x++) for (let y = H - 6; y < H - 1; y++) { const d = Math.abs(x - W / 2) / (W / 2); if (d < 0.9 - (H - 2 - y) * 0.08) put(f, x, y, d < 0.4 ? R[4] : d < 0.65 ? R[3] : R[2]); }
    for (const g of tongues) {
      const p = (g.ph + t / N) % 1, top = H - 6 - g.len * (0.6 + 0.4 * Math.sin(p * Math.PI)), sway = Math.sin((p + g.ph) * TAU) * 1.2;
      for (let y = H - 6; y > top; y--) { const k = (H - 6 - y) / g.len; put(f, g.x + sway * k, y, k < 0.35 ? R[4] : k < 0.7 ? R[3] : R[2]); put(f, g.x + 1 + sway * k, y, k < 0.35 ? R[5] : R[3]); }
      put(f, g.x + sway, top, R[1]);
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.9], 12, "mage");
}

/** «Благословение» (руны света): орбиту считает клиент (Vfx.orbit, как у рун рыцаря смерти), лист — плитки 11×11 из 12 кадров:
 *  0–3 — ромб (центр R[5], кольца R[4], R[3], R[2] и тёмный контур R[1]), 4–7 — ореол (кольцо радиуса 4 тоном R[3], add), 8–11 — блик (центр и крест R[5]). */
function auraRunes(id: string, ramp: string): Gen {
  const S = 11, c = 5, R = RAMPS[ramp];
  const tile = (fn: (m: number, dx: number, dy: number) => RGBA | null) => { const f = new PC(S, S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = x - c, dy = y - c, q = fn(Math.abs(dx) + Math.abs(dy), dx, dy); if (q) f.set(x, y, q); } return f; };
  // четыре ромба чуть разные: вытянутый, круглее, с бликом сверху, с тёмной гранью снизу справа
  const body = (k: number) => tile((m, dx, dy) => {
    const mm = k === 0 ? Math.abs(dx) * 1.3 + Math.abs(dy) * 0.85 : k === 1 ? Math.hypot(dx, dy) * 1.12 : m;
    if (mm > 4.2) return null;
    if (mm > 3.3) return R[1];
    if (k === 3 && dx + dy > 1) return mm < 1.5 ? R[4] : R[2];
    if (k === 2 && dy < -1 && dx <= 0) return R[5];
    return mm < 0.8 ? R[5] : mm < 1.8 ? R[4] : mm < 2.6 ? R[3] : R[2];
  });
  const halo = () => tile((_m, dx, dy) => { const d = Math.hypot(dx, dy); return d > 3.6 && d <= 4.6 ? [...R[3].slice(0, 3), 150] as RGBA : d > 4.6 && d <= 5.3 ? [...R[2].slice(0, 3), 70] as RGBA : null; });
  const glint = () => tile((_m, dx, dy) => (dx === 0 && dy === 0 ? hex("#ffffff") : (dx === 0 && Math.abs(dy) <= 2) || (dy === 0 && Math.abs(dx) <= 2) ? (Math.abs(dx + dy) === 2 ? [...R[5].slice(0, 3), 170] as RGBA : R[5]) : null));
  const ks = [0, 1, 2, 3];
  const g = mk(id, "aura", [...ks.map(body), ...ks.map(halo), ...ks.map(glint)], S, S, [0.5, 0.5], 1, "healer", { fadeIn: 350, fadeOut: 350 });
  g.orbit = { n: 4, rx: 18, ry: 6.5, oy: -8, period: 3200, bob: 0, bobPeriod: 1900, glow: [0.2, 0.6], glowPeriod: 1500, back: 0.55, twinkle: 2600 };
  return g;
}

/** Капкан: опускается на землю (y −3 → 0, челюсти раскрываются 0.6 → 1), пауза, захлопывается с разгоном (1 → 0.7 → 0.3 → 0), искры в кадре
 *  смыкания и тусклее в следующем, отдача на 1 px. 9 кадров при 15 к/с, один проход. */
function trap(id: string): Gen {
  const W = 36, H = 28, N = 9, D = hex("#23262f"), M = hex("#5d667c"), L = hex("#a9b4c8"), Wh = hex("#f2f6ff"), Wd = hex("#a9b4c8"), rust = hex("#8a5a3a");
  const OPEN = [0.6, 1, 1, 0.7, 0.3, 0, 0, 0, 0], DY = [-3, 0, 0, 0, 0, 0, 1, 0, 0];
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), cx = W / 2, cy = 15 + DY[t], open = OPEN[t];
    f.ellipse(cx, cy + 1, 15, 6, D); f.ellipse(cx, cy, 14, 5, M); f.ellipse(cx, cy - 0.5, 12, 4, rust);        // плита с ржавой серединой
    for (const side of [-1, 1]) {
      const off = side * open * 7;
      for (let i = 0; i <= 56; i++) {                                                                        // дуга челюсти в 2 пикселя
        const a = (i / 56) * Math.PI, x = cx - Math.cos(a) * 13, y = cy + off - side * Math.sin(a) * 6;
        put(f, x, y, side < 0 ? L : M); put(f, x, y + side, side < 0 ? M : D);
      }
      for (let k = -5; k <= 5; k++) {                                                                        // зубья внутрь
        const x = cx + k * 2.2, base = cy + off - side * Math.sqrt(Math.max(0, 1 - (k * 2.2 / 13) ** 2)) * 6;
        put(f, x, base + side * 2, L); put(f, x, base + side * 3, side < 0 ? M : L);
      }
    }
    if (t === 5 || t === 6) for (const [dx, dy] of [[-10, -6], [10, -6], [0, -9], [-6, 6], [6, 6]]) { const s2 = t === 5 ? 1 : 1.6; put(f, cx + dx * s2, cy + dy * s2, t === 5 ? Wh : Wd); if (t === 5) put(f, cx + dx + Math.sign(dx), cy + dy, Wd); }
    return f;
  });
  return mk(id, "cast", frames, W, H, [0.5, 0.6], 15, "ranger", { fadeIn: 120, tail: 250 });
}

/** Ворон в полёте вправо: крупное тело, голова с клювом, взмах двух крыльев туда и обратно (up = −1.5 − 9.5·cos(2πt/N)), стык бесшовный.
 *  8 кадров при 15 к/с. */
function raven(id: string): Gen {
  const W = 34, H = 28, N = 8, R = RAMPS.shadow, beak = hex("#e0b84a"), eye = hex("#ffffff");
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), cx = 15, cy = 15, up = -1.5 - 9.5 * Math.cos((t / N) * TAU);
    for (const dz of [0, 1]) {                                                                               // дальнее крыло темнее и сзади
      const wy = cy + up * (dz ? 0.6 : 1), tip = cx - 7 - (dz ? 2 : 0);
      f.poly([[cx - 2, cy - 1], [cx + 5, cy - 1], [tip, wy], [cx - 8, wy + (up < 0 ? 3 : -3)]], dz ? R[0] : R[2]);
      f.line(cx + 2, cy - 1, tip, wy, dz ? R[1] : R[4], 1);
    }
    f.ellipse(cx, cy, 8, 4, R[1]); f.ellipse(cx - 1, cy - 1, 6.5, 2.6, R[2]);                                 // тело
    f.poly([[cx - 8, cy], [cx - 15, cy + 2], [cx - 14, cy - 2]], R[0]);                                        // хвост
    f.ellipse(cx + 8, cy - 1, 3.2, 3, R[2]);                                                                   // голова
    f.poly([[cx + 10, cy - 2], [cx + 15, cy - 1], [cx + 10, cy + 1]], beak); put(f, cx + 9, cy - 2, eye); put(f, cx + 8, cy - 2, R[5]);
    for (let x = -4; x < 6; x++) put(f, cx + x, cy - 3, R[3]);                                                // блик по спине
    return f;
  });
  return mk(id, "proj", frames, W, H, [0.55, 0.55], 15, "darkranger");
}

/** Дождь стрел: пять стрел падают наискось (4 кадра, шаг (−2.5, −5) и светлый след), втыкаются, дрожат и гаснут альфой за 3 кадра; пыль
 *  клубками 2×2 в 2 тона гаснет альфой. Стрела — по планке паков: наконечник 3 px, древко 2 px (свет и тень), оперение 3 px, тёмный контур
 *  и тень на земле. scale 2 — лист ×2 для площадного @2. 16 кадров при 20 к/с, один проход. */
function arrowVolley(id: string, scale = 1): Gen {
  const W = 56, H = 52, N = 16, O = hex("#24180f"), wood = hex("#c09a64"), woodD = hex("#7e5a36"), steel = hex("#e4ebf4"), steelD = hex("#8e98aa");
  const fl = hex("#f2ece0"), flD = hex("#c8b8a0"), red = hex("#b04a3a"), dust = hex("#d8c8a0"), dustD = hex("#a08c68"), trail = hex("#f4ecd8"), sh = hex("#000000", 90);
  const arrows = [[10, 38, 0], [22, 44, 1], [34, 36, 2], [44, 42, 3], [28, 30, 4]].map(([x, y, i]) => ({ x, y, land: 4 + 2 * i }));
  /** Стрела остриём в (x, y), древко уходит вверх с наклоном 0.4 px на строку; sw — дрожание хвоста. */
  const arrow = (x: number, y: number, sw: number, len: number) => {
    const L = new PC(W, H), at = (s: number) => x - s * 0.4 + sw * (s / 10);
    put(L, at(0), y, steel); put(L, at(1) - 1, y - 1, steelD); put(L, at(1), y - 1, steel); put(L, at(1) + 1, y - 1, steelD);
    for (let s = 2; s < len - 3; s++) { put(L, at(s), y - s, wood); put(L, at(s) + 1, y - s, woodD); }
    for (let s = len - 3; s < len; s++) { put(L, at(s) - 1, y - s, fl); put(L, at(s), y - s, s === len - 2 ? red : fl); put(L, at(s) + 1, y - s, flD); }
    L.outline(O);
    return L;
  };
  const base = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (const a of arrows) {
      const dt = t - a.land;
      if (dt < -4) continue;
      if (dt < 0) {
        const k = -dt, hx = a.x - 2.5 * k, hy = a.y - 5 * k;
        for (let s = 1; s <= 3; s++) put(f, hx - 4 - s * 1.2, hy - 10 - s * 2.5, [...trail.slice(0, 3), Math.round(170 - s * 45)] as RGBA);
        f.blit(arrow(hx, hy, 0, 11), 0, 0);
      } else {
        const sw = dt < 3 ? (dt % 2 ? 1 : -1) * (dt === 0 ? 0 : 1) : 0, fade = t >= N - 3 ? (N - t) / 4 : 1;
        const shade = new PC(W, H); shade.ellipse(a.x - 1, a.y + 1.5, 3, 1.2, sh); f.blit(shade, 0, 0, false, fade);
        f.blit(arrow(a.x, a.y, sw, 9), 0, 0, false, fade);
        if (dt < 4) for (const [dx, dy] of [[-3, 0], [3, 0], [-5, -1], [5, -1], [0, -2]]) {
          const px = a.x + (dx * (dt + 1)) / 2, py = a.y + dy - dt, al = Math.round(255 * (1 - dt / 4));
          put(f, px, py, [...dust.slice(0, 3), al] as RGBA); put(f, px + 1, py, [...dustD.slice(0, 3), al] as RGBA); put(f, px, py + 1, [...dustD.slice(0, 3), al] as RGBA);
        }
      }
    }
    return f;
  });
  const frames = scale > 1 ? base.map((f) => scaleNN(f, scale)) : base;
  return mk(id, "aoe", frames, W * scale, H * scale, [0.5, 0.7], 20, "ranger", { tail: 150 });
}

/** Метательный топор: вращение вокруг центра масс (голова не ходит по кругу), 15 кадров при 30 к/с — 24° за кадр, 2 оборота в секунду. 20×20. */
function axeSpin(id: string, ramp?: string): Gen {
  const S = 20, N = 15, wood = hex("#7a4e2c"), woodL = hex("#a8723e"), M = hex("#6e788e"), L = hex("#c8d0de"), W = hex("#ffffff"), D = hex("#2a2e3a");
  const base = new PC(S, S), ox = -3, oy = 3;
  base.line(10 + ox, 16 + oy, 10 + ox, 5 + oy, wood, 1); base.line(11 + ox, 16 + oy, 11 + ox, 5 + oy, woodL, 1);
  base.poly([[11 + ox, 3 + oy], [17 + ox, 1 + oy], [18 + ox, 8 + oy], [11 + ox, 8 + oy]], M); base.poly([[11 + ox, 3 + oy], [16 + ox, 2 + oy], [17 + ox, 5 + oy], [11 + ox, 6 + oy]], L);
  base.line(17 + ox, 2 + oy, 17 + ox, 8 + oy, W, 1); base.line(11 + ox, 8 + oy, 18 + ox, 8 + oy, D, 1);
  const frames = Array.from({ length: N }, (_, t) => base.rotated((t * TAU) / N, 10, 10));
  return mk(id, "proj", ramp ? gradientMap(frames, RAMPS[ramp], 1.3) : frames, S, S, [0.5, 0.5], 30, "reaver");
}

/** Кандалы: цепное кольцо смыкается вокруг цели (t0 — половина звеньев, t0–3 — защёлкивание), искры (t4), блик бежит по звеньям и кольцо
 *  чуть дышит (t5–9), рассыпается одним зерном (t10–13: 0.2 / 0.4 / 0.6 / 0.8). 14 кадров при 15 к/с, один проход. */
function shackle(id: string, ramp?: string): Gen {
  const W = 52, H = 34, cx = W / 2, cy = H / 2 + 1, N = 14, D = hex("#23262f"), M = hex("#5d667c"), L = hex("#a9b4c8"), Wh = hex("#f2f6ff");
  const raw = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), k = t < 4 ? 1.5 - t * 0.17 : 1, rx = 18 * k + (t >= 5 && t <= 9 ? 0.5 * Math.sin(((t - 5) / 5) * TAU) : 0), ry = 8 * k, links = 14;
    const order = Array.from({ length: links }, (_, i) => i).sort((a, b) => Math.sin(((a / links) * TAU)) - Math.sin(((b / links) * TAU)));   // задние звенья рисуем первыми
    const shine = t >= 5 && t <= 9 ? (t * 3) % 14 : -1;
    for (const i of order) {
      const a = (i / links) * TAU + (t < 4 ? t * 0.35 : 0), x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry, back = Math.sin(a) < 0;
      const lit = i === shine || i === (shine + 1) % 14;
      const c = lit ? Wh : back ? M : L, d = lit ? L : back ? D : M;
      if (i % 2) { for (const [dx, dy] of [[-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]]) put(f, x + dx, y + dy, dy < 0 ? c : d); }
      else { for (let dy = -2; dy <= 2; dy++) put(f, x, y + dy, dy < 0 ? c : d); put(f, x + 1, y, d); }
    }
    if (t === 4) for (const [dx, dy] of [[-15, -4], [15, -4], [0, 10], [-10, 7], [10, 7]]) put(f, cx + dx, cy + dy, Wh);
    if (t === 0) erode(f, 0.5, 7);
    if (t >= 10) erode(f, (t - 9) * 0.2, 7);
    return f;
  });
  return mk(id, "hit", ramp ? gradientMap(raw, RAMPS[ramp], 1) : raw, W, H, [0.5, 0.55], 15, "deathknight", { fadeIn: 80, tail: 140 });
}

/** Лужа крови (сразу 52×33): вязкая поверхность волнуется бесшовно (wob по 2πt/N), блик дрожит на месте, пузыри лопаются. 16 кадров при 12 к/с. */
function bloodPool(id: string): Gen {
  const W = 52, H = 33, cx = W / 2, cy = H / 2, N = 16, B = RAMPS.blood, r = rng(33), ph = (t: number) => (t / N) * TAU;
  const bubbles = Array.from({ length: 6 }, () => ({ a: r() * TAU, d: r() * 0.7, ph: r() }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ang = Math.atan2((y - cy) * 1.7, x - cx), wob = 1 + 0.06 * Math.sin(ang * 4 + ph(t)) + 0.04 * Math.sin(ang * 7 - ph(t));
      const d = Math.hypot((x + 0.5 - cx) / 24.5, (y + 0.5 - cy) / 14.2) / wob;
      if (d > 1) continue;
      f.set(x, y, d > 0.88 ? B[0] : d > 0.55 ? B[1] : B[2]);
    }
    for (let k = 0; k < 6; k++) { const a = -2.6 + 0.12 * k + 0.07 * Math.sin(ph(t)); put(f, cx + Math.cos(a) * 17.4, cy + Math.sin(a) * 8.7, B[4]); }
    for (const b of bubbles) {
      const p = (b.ph + t / N) % 1, x = cx + Math.cos(b.a) * b.d * 20.5, y = cy + Math.sin(b.a) * b.d * 10.3;
      if (p < 0.6) { put(f, x, y, B[3]); put(f, x + 1, y, B[3]); put(f, x, y - 1, B[3]); put(f, x + 1, y - 1, B[4]); }
      else if (p < 0.8) for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) put(f, x + dx, y + dy, B[4]);
    }
    return f;
  });
  return mk(id, "aoe", frames, W, H, [0.5, 0.5], 12, "bloodweaver");
}

export function GENERATED2(): Gen[] {
  return [
    auraBubble("bubble-steel", "steel"), auraBubble("bubble-arcane", "arcane"), auraBubble("bubble-holy", "holy"), auraBubble("bubble-bone", "bone"), auraBubble("bubble-shadow", "shadow"),
    auraRing("ring-blood", "blood"), auraRing("ring-holy", "holy"), auraRing("ring-frost", "frost"), auraRing("ring-shadow", "shadow"), auraRing("ring-arcane", "arcane"),
    auraRage("aura-rage"), flameLoop("flame-loop"), runeSet(), runeSet(3), auraRunes("aura-runes-holy", "holy"),
    trap("trap-snap"), raven("raven-fly"), arrowVolley("arrow-volley"), arrowVolley("arrow-volley@2", 2),
    axeSpin("axe-spin"), axeSpin("axe-spin-blood", "blood"),
    shackle("shackle-steel"), shackle("shackle-shadow", "shadow"), bloodPool("blood-pool"),
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/gen2-raw.png");
  stackV(GENERATED2().map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f`, 3))).save(out);
  console.log(out);
  // рыцарь смерти с рунной орбитой по формуле клиента, 8 моментов через 1/16 оборота: верхний ряд — лист двойной плотности (как зум 2: герой ×2,
  // руны 1:1, всё ×3), нижний — тройной (как зум 3: герой ×3, руны 1:1, всё ×2); герой и руны в обоих рядах одного размера
  const hero = readPng(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/public/assets/units/deathknight.png"));
  const hf = new PC(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) hf.set(x, y, hero.get(x, y)!);
  const cellW = 44, cell = 44, N = 8, o = runeSet().orbit!;
  const rows = ([2, 3] as const).map((D) => {
    const g = runeSet(D), hD = scaleNN(hf, D), pc = new PC(cellW * N * D, cell * D), ground = new PC(cellW * N, cell);
    paintGround(ground, 0, 0, cellW * N, cell, D === 2 ? "grass" : "cobble");
    pc.blit(scaleNN(ground, D), 0, 0);
    for (let i = 0; i < N; i++) {
      const t = (i * o.period) / 16, fx = (i * cellW + 22) * D, fy = 36 * D;                   // ноги героя (ряд 30 спрайта) на холсте плотности D
      orbitPreview(g, t, pc, fx, fy, false, o);
      pc.blit(hD, fx - 16 * D, fy - 30 * D);
      orbitPreview(g, t, pc, fx, fy, true, o);
    }
    return scaleNN(pc, 6 / D);
  });
  const both = new PC(rows[0].w, rows[0].h + rows[1].h + 6);
  fill(both, BG);
  both.blit(rows[0], 0, 0); both.blit(rows[1], 0, rows[0].h + 6);
  both.save(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/dk-runes.png"));
  void fill; void BG;
}
