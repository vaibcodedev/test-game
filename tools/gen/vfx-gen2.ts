/** Генерация эффектов шага 2 (задача 127): ауры и щиты на героях, кольца под ногами, берсерк, руны, знамя, капкан, ворон,
 *  дождь стрел, топор, кандалы, лужа крови. Стиль как у паков: жёсткие пиксели, 4–6 тонов рампы стихии из vfx-lib (RAMPS),
 *  кадры 4–10, циклы замыкаются. Запуск отдельно: tsx tools/gen/vfx-gen2.ts — tools/out/vfx-preview/gen2-raw.png. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, rng, hex, type RGBA } from "./canvas";
import { RAMPS, gradientMap, storyboard, stackV, readPng, paintGround, scaleNN, fill, BG } from "./vfx-lib";
import { erode, type Gen } from "./vfx-gen";

const put = (f: PC, x: number, y: number, c: RGBA) => f.set(Math.round(x), Math.round(y), c);
const TAU = Math.PI * 2;
const mk = (id: string, role: Gen["role"], frames: PC[], w: number, h: number, anchor: [number, number], fps: number, hero?: string): Gen => ({ id, pack: "gen", role, frames, w, h, anchor, fps, blend: "normal", hero });

/** Щит-пузырь на герое: обод в 2 пикселя, крупа стекла внутри, блик бежит по кругу. 8 кадров цикла. */
function auraBubble(id: string, ramp: string): Gen {
  const W = 44, H = 50, cx = W / 2, cy = H / 2, rx = 20, ry = 23, N = 8, R = RAMPS[ramp];
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d > 1) continue;
      if (d > 0.82) f.set(x, y, d > 0.93 ? R[3] : R[2]);
      else if ((x + y * 2 + t) % 7 === 0 && d > 0.35) f.set(x, y, R[1]);
    }
    const a0 = (t / N) * TAU;
    for (let k = 0; k < 7; k++) { const a = a0 + k * 0.11; put(f, cx + Math.cos(a) * (rx - 0.5), cy + Math.sin(a) * (ry - 0.5), k < 2 ? R[5] : R[4]); }
    put(f, cx - 11, cy - 15, R[5]); put(f, cx - 12, cy - 14, R[4]); put(f, cx - 10, cy - 16, R[4]);
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.5], 10, "warrior");
}

/** Кольцо под ногами героя (бафы-круги): две дуги и ползущие засечки. 8 кадров цикла. */
function auraRing(id: string, ramp: string): Gen {
  const W = 52, H = 28, cx = W / 2, cy = H / 2, rx = 24, ry = 11, N = 8, R = RAMPS[ramp];
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let i = 0; i < 220; i++) { const a = (i / 220) * TAU; put(f, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, R[2]); put(f, cx + Math.cos(a) * (rx - 3), cy + Math.sin(a) * (ry - 1.5), R[1]); }
    for (let k = 0; k < 10; k++) {
      const a = ((k + t / N) / 10) * TAU;
      for (let rr = rx - 3; rr <= rx; rr++) put(f, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (ry / rx), k % 2 ? R[3] : R[5]);
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.5], 10, "healer");
}

/** Берсерк: языки красного пламени снизу вверх вокруг героя. 8 кадров цикла. */
function auraRage(id: string): Gen {
  const W = 36, H = 46, N = 8, R = RAMPS.blood, r = rng(21);
  const tongues = Array.from({ length: 20 }, () => ({ x: 4 + r() * 28, ph: r(), len: 6 + Math.floor(r() * 6) }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (const g of tongues) {
      const p = (g.ph + t / N) % 1, y = H - 4 - p * (H - 10), sway = Math.sin((p + g.ph) * TAU) * 1.5;
      for (let k = 0; k < g.len; k++) { const kk = k / g.len; put(f, g.x + sway * (1 - kk), y - k, R[kk < 0.4 ? 4 : kk < 0.75 ? 3 : 2]); put(f, g.x + 1 + sway, y - k, R[kk < 0.4 ? 3 : 2]); }
      put(f, g.x + sway, y - g.len, R[5]);
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.85], 12, "reaver");
}

/** Рунный клинок рыцаря смерти: 4 каменно-ледяные плитки с вырезанной руной кружат вокруг героя на уровне пояса.
 *  Плитка двойной плотности 14×16 (в игре масштаб 0.5 — 7×8 пикселей мира): толстый тёмный контур, 5 тонов, светлая верхняя грань,
 *  вырезанный глиф со светлой кромкой. Орбиту клиент считает каждый кадр (orbit в манифесте: угол = время × скорость, у краёв руна меняет слой),
 *  поэтому лист — только сами руны: кадры 0–3 руны, 4–7 ореол и свет глифа (альфа по синусу, add), 8–11 блик на верхней грани (короткая вспышка). */
const RUNE_W = 14, RUNE_H = 16, RUNE_PAD = 3;
// форма плитки: [левая, правая] колонка по строкам (0..15)
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
const GX = Math.floor((RUNE_W - 5) / 2), GY = 4;
const runeIn = (shape: [number, number][], x: number, y: number) => y >= 0 && y < RUNE_H && x >= shape[y][0] && x <= shape[y][1];
const glyphOn = (glyph: string[], x: number, y: number) => glyph[y - GY]?.[x - GX] === "#";

/** Сама плитка (без свечения): контур, тона по глубине от края, светлая кромка сверху-слева, тень справа-снизу, вырезанный глиф. */
export function runeBody(shape: [number, number][], glyph: string[], pal: { o: RGBA; t: RGBA[]; rim: RGBA; groove: RGBA; lit: RGBA }): PC {
  const P = RUNE_PAD, S = new PC(RUNE_W + P * 2, RUNE_H + P * 2);
  const inside = (x: number, y: number) => runeIn(shape, x, y);
  const depth = (x: number, y: number) => { let d = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!inside(x + dx, y + dy)) d = Math.min(d, Math.abs(dx) + Math.abs(dy)); return d; };
  for (let y = 0; y < RUNE_H; y++) for (let x = 0; x < RUNE_W; x++) {
    if (!inside(x, y)) continue;
    const d = depth(x, y);
    let c: RGBA;
    if (d === 1) c = pal.o;                                                            // контур
    else {
      c = pal.t[y <= 3 ? 0 : x + y * 0.6 < 9 ? 1 : x + y * 0.6 < 13 ? 2 : 3];
      if (d === 2 && (!inside(x, y - 2) || !inside(x - 2, y))) c = pal.rim;            // светлая кромка сверху и слева
      if (d === 2 && (!inside(x + 2, y) || !inside(x, y + 2))) c = pal.t[4];           // тень справа и снизу
    }
    S.set(x + P, y + P, c);
  }
  // вырезанная руна: тёмная канавка и светлая кромка снизу-справа
  for (let y = GY; y < GY + 7; y++) for (let x = GX; x < GX + 5; x++) if (glyphOn(glyph, x, y)) S.set(x + P, y + P, pal.groove);
  for (let y = GY; y < GY + 8; y++) for (let x = GX; x < GX + 6; x++) if (!glyphOn(glyph, x, y) && (glyphOn(glyph, x - 1, y) || glyphOn(glyph, x, y - 1)) && inside(x, y)) S.set(x + P, y + P, pal.lit);
  return S;
}

/** Ореол плитки и свет глифа (кадр рисуется поверх руны в режиме add): два кольца вокруг контура (ближнее ярче), канавка глифа светится. */
export function runeHalo(shape: [number, number][], glyph: string[]): PC {
  const P = RUNE_PAD, S = new PC(RUNE_W + P * 2, RUNE_H + P * 2);
  const ring = (x: number, y: number) => { let d = 9; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (runeIn(shape, x + dx, y + dy)) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)) + (dx && dy ? 0.5 : 0)); return d; };
  for (let y = -P; y < RUNE_H + P; y++) for (let x = -P; x < RUNE_W + P; x++) {
    if (runeIn(shape, x, y)) { if (glyphOn(glyph, x, y)) S.set(x + P, y + P, hex("#5ad2f4")); continue; }
    const d = ring(x, y);
    if (d <= 1) S.set(x + P, y + P, hex("#4aa8d8", 150));
    else if (d <= 2) S.set(x + P, y + P, hex("#2a6c9c", 80));
  }
  return S;
}

/** Блик: четырёхлучевая искра на верхней левой грани плитки (центр белый, лучи по 2 пикселя). */
export function runeGlint(shape: [number, number][]): PC {
  const P = RUNE_PAD, S = new PC(RUNE_W + P * 2, RUNE_H + P * 2);
  const y = 3, x = shape[y][0] + 2;
  const hi = hex("#ffffff"), mid = hex("#c8f4ff"), lo = hex("#7fd4f4", 200);
  S.set(x + P, y + P, hi);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { S.set(x + dx + P, y + dy + P, mid); S.set(x + dx * 2 + P, y + dy * 2 + P, lo); }
  return S;
}

const RUNE_PAL = { o: hex("#0a1626"), t: ["#dff6ff", "#8fd0ea", "#5a9cc8", "#3a6aa0", "#243e6c"].map((c) => hex(c)), rim: hex("#f2fcff"), groove: hex("#0e2a4a"), lit: hex("#a4e8fa") };

/** Лист рун рыцаря смерти для клиента: 12 кадров 20×22 (руны, ореолы, блики), масштаб 0.5, орбита в пикселях мира. */
export function runeSet(): Gen {
  const W = RUNE_W + RUNE_PAD * 2, H = RUNE_H + RUNE_PAD * 2;
  const frames = [...RUNE_SHAPES.map((s, k) => runeBody(s, GLYPHS[k], RUNE_PAL)), ...RUNE_SHAPES.map((s, k) => runeHalo(s, GLYPHS[k])), ...RUNE_SHAPES.map((s) => runeGlint(s))];
  return {
    id: "aura-runes-frost", pack: "gen", role: "aura", frames, w: W, h: H, anchor: [0.5, 0.5], fps: 1, blend: "normal", hero: "deathknight", scale: 0.5,
    // орбита чуть шире плеч, центр на поясе (8 px над ногами), оборот за 2.8 с; покачивание ±1 px, ореол дышит, блик — раз в 3 с на каждой руне
    orbit: { n: 4, rx: 12, ry: 4, oy: -8, period: 2800, bob: 1, bobPeriod: 1900, glow: [0.3, 0.85], glowPeriod: 1500, back: 0.6, twinkle: 3100 },
    ease: { fadeIn: 350, fadeOut: 350, scaleIn: 0.6 },
  };
}

/** Кадр орбиты для превью — та же формула, что в клиенте (vfx.ts, Vfx.orbit): холст двойной плотности, позиции до пикселя холста. */
export function orbitPreview(g: Gen, t: number, canvas: PC, cx2: number, cy2: number, front: boolean) {
  const o = g.orbit!, n = o.n;
  const items = Array.from({ length: n }, (_, i) => {
    const a = (t / o.period) * TAU + (i * TAU) / n, sn = Math.sin(a);
    const bob = Math.sin((t / o.bobPeriod) * TAU + i * 2.3) * o.bob;
    return { i, sn, x: Math.round(Math.cos(a) * o.rx * 2), y: Math.round((sn * o.ry + o.oy + bob) * 2) };
  }).filter((r) => (r.sn >= 0) === front).sort((p, q) => p.sn - q.sn);
  for (const r of items) {
    const k = 1 - ((1 - o.back) * (1 - r.sn)) / 2;
    const body = g.frames[r.i].clone().map((c) => [Math.round(c[0] * k * 0.92), Math.round(c[1] * k * 0.97), Math.round(c[2] * k), c[3]]);
    const x0 = cx2 + r.x - g.w / 2, y0 = cy2 + r.y - g.h / 2;
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

/** Руны на клинке: четыре ромба по эллипсу вокруг героя, задние тусклее. 8 кадров цикла. */
function auraRunes(id: string, ramp: string): Gen {
  const W = 46, H = 40, cx = W / 2, cy = H / 2, N = 8, R = RAMPS[ramp];
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    const items = Array.from({ length: 4 }, (_, k) => { const a = ((k + t / N) / 4) * TAU; return { x: cx + Math.cos(a) * 19, y: cy + 6 + Math.sin(a) * 7, back: Math.sin(a) < 0 }; }).sort((p, q) => p.y - q.y);
    for (const it of items) {
      const c = it.back ? R[2] : R[4], d = it.back ? R[1] : R[3];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const m = Math.abs(dx) + Math.abs(dy); if (m <= 3 && !(m === 3 && it.back)) put(f, it.x + dx, it.y + dy, m === 0 ? R[5] : m === 1 ? c : m === 2 ? d : R[2]); }
    }
    return f;
  });
  return mk(id, "aura", frames, W, H, [0.5, 0.5], 10, "deathknight");
}

/** Капкан: раскрытые челюсти с зубьями захлопываются, искры. 7 кадров, один проход. */
function trap(id: string): Gen {
  const W = 36, H = 28, N = 7, D = hex("#23262f"), M = hex("#5d667c"), L = hex("#a9b4c8"), Wh = hex("#f2f6ff"), rust = hex("#8a5a3a");
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), cx = W / 2, cy = 15, open = t < 3 ? 1 : t === 3 ? 0.4 : 0;
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
    if (t === 3 || t === 4) for (const [dx, dy] of [[-10, -6], [10, -6], [0, -9], [-6, 6], [6, 6]]) put(f, cx + dx, cy + dy, Wh);
    return f;
  });
  return mk(id, "cast", frames, W, H, [0.5, 0.6], 12, "ranger");
}

/** Ворон в полёте вправо: крупное тело, голова с клювом, взмах двух крыльев. 4 кадра цикла. */
function raven(id: string): Gen {
  const W = 34, H = 28, N = 4, R = RAMPS.shadow, beak = hex("#e0b84a"), eye = hex("#ffffff");
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), cx = 15, cy = 15, up = [-11, -5, 3, 8][t];
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
  return mk(id, "proj", frames, W, H, [0.55, 0.55], 14, "darkranger");
}

/** Дождь стрел: пять стрел падают наискось, втыкаются и дрожат, пыль. 10 кадров, один проход. */
function arrowVolley(id: string): Gen {
  const W = 56, H = 52, N = 10, wood = hex("#b08a5a"), steel = hex("#c8d0de"), fl = hex("#e8e0d0"), dust = hex("#d8c8a0"), dk = hex("#6a4c34");
  const arrows = [[10, 38, 0], [22, 44, 1], [34, 36, 2], [44, 42, 3], [28, 30, 4]].map(([x, y, i]) => ({ x, y, land: 2 + i }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (const a of arrows) {
      const dt = t - a.land;
      if (dt < -2) continue;
      if (dt < 0) {
        const k = -dt, hx = a.x - 5 * k, hy = a.y - 10 * k;
        for (let s = 0; s < 8; s++) put(f, hx - s * 0.5, hy - s, s < 2 ? steel : s > 5 ? fl : wood);
      } else {
        const sw = dt < 3 ? (dt % 2 ? 1 : -1) * (dt === 0 ? 0 : 1) : 0;
        if (t >= N - 2 && (a.x + t) % 2) continue;
        for (let s = 0; s < 9; s++) put(f, a.x - s * 0.4 + sw * (s / 9), a.y - s, s < 1 ? steel : s > 6 ? fl : wood);
        put(f, a.x, a.y + 1, dk); put(f, a.x + 1, a.y + 1, dk);
        if (dt < 3) for (const [dx, dy] of [[-3, 0], [3, 0], [-5, -1], [5, -1], [0, -2]]) put(f, a.x + (dx * (dt + 1)) / 2, a.y + dy - dt, dust);
      }
    }
    return f;
  });
  return mk(id, "aoe", frames, W, H, [0.5, 0.7], 14, "ranger");
}

/** Метательный топор: вращение, 4 кадра цикла 20×20. */
function axeSpin(id: string, ramp?: string): Gen {
  const S = 20, N = 4, wood = hex("#7a4e2c"), woodL = hex("#a8723e"), M = hex("#6e788e"), L = hex("#c8d0de"), W = hex("#ffffff"), D = hex("#2a2e3a");
  const base = new PC(S, S);
  base.line(10, 16, 10, 5, wood, 1); base.line(11, 16, 11, 5, woodL, 1);
  base.poly([[11, 3], [17, 1], [18, 8], [11, 8]], M); base.poly([[11, 3], [16, 2], [17, 5], [11, 6]], L);
  base.line(17, 2, 17, 8, W, 1); base.line(11, 8, 18, 8, D, 1);
  const frames = Array.from({ length: N }, (_, t) => base.rotated((t * Math.PI) / 2, 10.5, 10.5));
  return mk(id, "proj", ramp ? gradientMap(frames, RAMPS[ramp], 1.3) : frames, S, S, [0.5, 0.5], 16, "reaver");
}

/** Кандалы: цепное кольцо смыкается вокруг цели, держится и рассыпается. 10 кадров, один проход. */
function shackle(id: string, ramp?: string): Gen {
  const W = 52, H = 34, cx = W / 2, cy = H / 2 + 1, N = 10, D = hex("#23262f"), M = hex("#5d667c"), L = hex("#a9b4c8"), Wh = hex("#f2f6ff");
  const raw = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H), k = t < 4 ? 1.5 - t * 0.17 : 1, rx = 18 * k, ry = 8 * k, links = 14;
    const order = Array.from({ length: links }, (_, i) => i).sort((a, b) => Math.sin(((a / links) * TAU)) - Math.sin(((b / links) * TAU)));   // задние звенья рисуем первыми
    for (const i of order) {
      const a = (i / links) * TAU + (t < 4 ? t * 0.35 : 0), x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry, back = Math.sin(a) < 0;
      const c = back ? M : L, d = back ? D : M;
      if (i % 2) { for (const [dx, dy] of [[-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]]) put(f, x + dx, y + dy, dy < 0 ? c : d); }
      else { for (let dy = -2; dy <= 2; dy++) put(f, x, y + dy, dy < 0 ? c : d); put(f, x + 1, y, d); }
    }
    if (t === 4) for (const [dx, dy] of [[-15, -4], [15, -4], [0, 10], [-10, 7], [10, 7]]) put(f, cx + dx, cy + dy, Wh);
    if (t >= N - 2) erode(f, (t - (N - 3)) * 0.3, 5 + t);
    return f;
  });
  return mk(id, "hit", ramp ? gradientMap(raw, RAMPS[ramp], 1) : raw, W, H, [0.5, 0.55], 14, "deathknight");
}

/** Лужа крови: вязкая поверхность с лопающимися пузырями. 8 кадров цикла. */
function bloodPool(id: string): Gen {
  const W = 66, H = 42, cx = W / 2, cy = H / 2, N = 8, B = RAMPS.blood, r = rng(33);
  const bubbles = Array.from({ length: 6 }, () => ({ a: r() * TAU, d: r() * 0.7, ph: r() }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ang = Math.atan2((y - cy) * 1.7, x - cx), wob = 1 + 0.06 * Math.sin(ang * 4 + t * 0.8) + 0.04 * Math.sin(ang * 7 - t);
      const d = Math.hypot((x + 0.5 - cx) / 31, (y + 0.5 - cy) / 18) / wob;
      if (d > 1) continue;
      f.set(x, y, d > 0.88 ? B[0] : d > 0.55 ? B[1] : B[2]);
    }
    for (let k = 0; k < 6; k++) { const a = -2.6 + k * 0.12 + t * 0.02; put(f, cx + Math.cos(a) * 22, cy + Math.sin(a) * 11, B[4]); }
    for (const b of bubbles) {
      const p = (b.ph + t / N) % 1, x = cx + Math.cos(b.a) * b.d * 26, y = cy + Math.sin(b.a) * b.d * 13;
      if (p < 0.6) { put(f, x, y, B[3]); put(f, x + 1, y, B[3]); put(f, x, y - 1, B[3]); put(f, x + 1, y - 1, B[4]); }
      else if (p < 0.8) for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) put(f, x + dx, y + dy, B[4]);
    }
    return f;
  });
  return mk(id, "aoe", frames, W, H, [0.5, 0.5], 8, "bloodweaver");
}

export function GENERATED2(): Gen[] {
  return [
    auraBubble("bubble-steel", "steel"), auraBubble("bubble-arcane", "arcane"), auraBubble("bubble-holy", "holy"), auraBubble("bubble-bone", "bone"), auraBubble("bubble-shadow", "shadow"),
    auraRing("ring-blood", "blood"), auraRing("ring-holy", "holy"), auraRing("ring-frost", "frost"), auraRing("ring-shadow", "shadow"), auraRing("ring-arcane", "arcane"),
    auraRage("aura-rage"), flameLoop("flame-loop"), runeSet(), auraRunes("aura-runes-holy", "holy"),
    trap("trap-snap"), raven("raven-fly"), arrowVolley("arrow-volley"),
    axeSpin("axe-spin"), axeSpin("axe-spin-blood", "blood"),
    shackle("shackle-steel"), shackle("shackle-shadow", "shadow"), bloodPool("blood-pool"),
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/gen2-raw.png");
  stackV(GENERATED2().map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f`, 3))).save(out);
  console.log(out);
  // рыцарь смерти с рунной орбитой по формуле клиента: холст двойной плотности (герой ×2, руны 1:1), 8 моментов через 1/16 оборота, трава и брусчатка, ×2
  const g = runeSet(), hero = readPng(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/public/assets/units/deathknight.png"));
  const hf = new PC(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) hf.set(x, y, hero.get(x, y)!);
  const h2 = scaleNN(hf, 2), cellW = 44, cell = 44, N = 8, pc = new PC(cellW * N * 2, cell * 2 * 2);
  const ground = new PC(cellW * N, cell * 2);
  paintGround(ground, 0, 0, cellW * N, cell, "grass"); paintGround(ground, 0, cell, cellW * N, cell, "cobble");
  pc.blit(scaleNN(ground, 2), 0, 0);
  for (let row = 0; row < 2; row++) for (let i = 0; i < N; i++) {
    const t = (i * g.orbit!.period) / 16, fx = (i * cellW + 22) * 2, fy = (row * cell + 36) * 2;   // ноги героя (ряд 30 спрайта) в двойной плотности
    orbitPreview(g, t, pc, fx, fy, false);
    pc.blit(h2, fx - 32, fy - 60);
    orbitPreview(g, t, pc, fx, fy, true);
  }
  scaleNN(pc, 2).save(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview/dk-runes.png"));
  void fill; void BG;
}
