/** Молот правосудия (задача 127; из трёх вариантов пользователь выбрал «Небесный молот», остальные убраны). Планка — пиксельные паки:
 *  предметы объёмные (маска по областям + фаска от света сверху-слева, 4–6 тонов, тёмный контур, блик), свет и вспышки — полосами тонов
 *  от янтарной кромки к белому ядру, без однопиксельных линий и россыпи точек; 12 кадров; конец без обрыва (tail — растворение в клиенте).
 *  hammer-a — снаряд-сгусток света; hammer-a-hit — молот света встаёт над целью, замахивается и обрушивается (смаз, вспышка-звезда,
 *  осколки, звёзды оглушения), луч уходит вверх; hammer-a-hit-ground — печать и волна под ногами (нижний слой, под юнитами).
 *  Запуск отдельно: tsx tools/gen/vfx-hammer3.ts → tools/out/vfx-preview/hammer3.png (раскадровки) и hammer3-hero.png (рядом с целью, ×3). */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, hex, rng, type RGBA } from "./canvas";
import { storyboard, stackV, scaleNN, readPng, paintGround } from "./vfx-lib";
import type { Gen } from "./vfx-gen";

const TAU = Math.PI * 2;
const H = (...c: string[]) => c.map((s) => hex(s));
/** Золото: тёмное → светлое. Свет (вспышки, кольца): янтарная кромка → белое ядро. */
const G = H("#6e3410", "#a85a14", "#d88a22", "#f2b83a", "#ffe07a", "#fff6c8");
const WH = hex("#ffffff");
const LIGHT = [G[1], G[2], G[3], G[4], G[5], WH];
const OUT = hex("#3a1c0a"), OUT_A = hex("#5c2606");
const PEARL = H("#c8781a", "#f0c860", "#fff0b8", "#fffbe8", "#ffffff");
const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- предметы: маска по областям и объёмная заливка ----------
interface Mat { ramp: RGBA[]; base: number }
/** Объёмная заливка маски (как пиксельщик: свет сверху-слева). У области своя рампа и базовый тон; верхний край +2, второй ряд +1,
 *  левый край +1, нижний −2, правый −1 (края считаются по своей области — пластины и обмотка читаются раздельно). Снаружи — контур. */
function shadeMask(mask: string[], mats: Record<string, Mat>, outline: RGBA | null, pad = 1): PC {
  const h = mask.length, w = Math.max(...mask.map((r) => r.length));
  const at = (x: number, y: number) => (y >= 0 && y < h && x >= 0 && x < w ? mask[y][x] ?? "." : ".");
  const f = new PC(w + pad * 2, h + pad * 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = at(x, y), m = mats[r];
    if (r === "." || !m) continue;
    const same = (dx: number, dy: number) => at(x + dx, y + dy) === r;
    let t = m.base;
    if (!same(0, -1)) t += 2; else if (!same(0, -2)) t += 1;
    if (!same(-1, 0)) t += 1;
    if (!same(0, 1)) t -= 2;
    if (!same(1, 0)) t -= 1;
    f.set(x + pad, y + pad, m.ramp[Math.max(0, Math.min(m.ramp.length - 1, t))]);
  }
  if (outline) f.outline(outline);
  return f;
}
/** Свечение вокруг непрозрачного: кольца в 1 пиксель снаружи (ближнее плотнее). */
function glow(f: PC, rings: RGBA[]): PC {
  for (const c of rings) {
    const src = f.clone();
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (!src.alpha(x, y) && N4.some(([dx, dy]) => src.alpha(x + dx, y + dy) > 0)) f.set(x, y, c);
  }
  return f;
}
/** Осветление нарисованного предмета на n ступеней золотой рампы (молот растворяется в свет): контур → тёмное золото, золото → светлее. */
function lift(src: PC, n: number, a = 1): PC {
  const all = [OUT, OUT_A, ...G, WH], d = (p: RGBA, q: RGBA) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const out = new PC(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.get(x, y)!;
    if (!c[3]) continue;
    let bi = 0;
    all.forEach((q, i) => { if (d(c, q) < d(c, all[bi])) bi = i; });
    const k = Math.min(all.length - 1, Math.max(bi, 2) + n), q = all[k];
    out.set(x, y, [q[0], q[1], q[2], Math.round(c[3] * a)]);
  }
  return out;
}

/** Большой молот головой вниз (A): навершие, рукоять с обмоткой, муфта, боёк с поясами и жемчужным ромбом. 20×30 + контур. */
const BIG = [
  "........pppp........",
  ".......pppppp.......",
  ".......pppppp.......",
  "........pppp........",
  ".........hh.........",
  ".........hh.........",
  ".........gg.........",
  ".........hh.........",
  ".........gg.........",
  ".........hh.........",
  ".........gg.........",
  ".........hh.........",
  ".........gg.........",
  ".........hh.........",
  ".........hh.........",
  ".........hh.........",
  ".........hh.........",
  ".........hh.........",
  "........cccc........",
  ".......cccccc.......",
  "..HHbbHHHHHHHHbbHH..",
  ".HHHbbHHHHHHHHbbHHH.",
  "HHHHbbHHHeeHHHbbHHHH",
  "HHHHbbHHeeeeHHbbHHHH",
  "HHHHbbHeeeeeeHbbHHHH",
  "HHHHbbHeeeeeeHbbHHHH",
  "HHHHbbHHeeeeHHbbHHHH",
  "HHHHbbHHHeeHHHbbHHHH",
  ".HHHbbHHHHHHHHbbHHH.",
  "..HHbbHHHHHHHHbbHH..",
];
const MAT_A: Record<string, Mat> = { H: { ramp: G, base: 4 }, b: { ramp: G, base: 2 }, e: { ramp: PEARL, base: 2 }, p: { ramp: G, base: 3 }, h: { ramp: G, base: 3 }, g: { ramp: G, base: 2 }, c: { ramp: G, base: 3 } };

/** Молот света (A): объём, тёмно-янтарный контур, блики на бойке, двойное свечение. Пиксель (11, 33) — середина ударной грани. */
function hammerA(): PC {
  const f = shadeMask(BIG, MAT_A, OUT_A, 3);
  for (const [x, y] of [[6, 23], [7, 23], [8, 23], [5, 24], [17, 23], [18, 23]]) f.set(x, y, WH);           // блик по верхней грани бойка
  for (const [x, y] of [[10, 4], [11, 4]]) f.set(x, y, WH);                                                    // блик на навершии
  return glow(f, [hex("#ffd86a", 150), hex("#ffc040", 60)]);
}

// ---------- свет: вспышки, кольца, осколки, звёзды ----------
/** Тон света по яркости 0..1: ниже порога — пусто. */
const lightAt = (t: number): RGBA | null => (t > 0.8 ? WH : t > 0.6 ? G[5] : t > 0.42 ? G[4] : t > 0.26 ? G[3] : t > 0.13 ? G[2] : t > 0.04 ? G[1] : null);
/** Звезда-вспышка: круглое ядро и n лучей-клиньев (ширина у основания rw, чётные лучи длиной L, нечётные — короче), яркость k.
 *  Клин держит ширину почти до конца и сужается только у острия (без длинных линий в пиксель); тон падает от центра и к краю клина.
 *  sq < 1 — вспышка лежит на земле (сплющена по y). */
function burst(f: PC, cx: number, cy: number, core: number, L: number, rw: number, n: number, rot: number, k = 1, short = 0.55, sq = 1) {
  const R = Math.ceil(Math.max(L, core)) + 2;
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const dx = x + 0.5, dy = (y + 0.5) / sq, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    let v = core > 0 && r < core ? 1 - (r / core) * 0.5 : 0;
    for (let i = 0; i < n; i++) {
      const a = rot + (i * TAU) / n, len = L * (i % 2 ? short : 1);
      let d = th - a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const along = r * Math.cos(d), across = Math.abs(r * Math.sin(d));
      if (along <= 0 || along > len) continue;
      const q = along / len, half = Math.max(0.5, (rw / 2) * (1 - q ** 1.6));
      if (across > half) continue;
      v = Math.max(v, (1 - q) * (0.6 + 0.4 * (1 - across / half)) + (r < core * 1.5 ? 0.22 : 0));
    }
    const c = lightAt(v * k);
    if (c) f.set(cx + x, cy + y, c);
  }
}
/** Искра: маленькая четырёхлучевая звезда (ядро и 4 коротких луча). */
const sparkle = (f: PC, x: number, y: number, r: number, k = 1, rot = 0) => burst(f, Math.round(x), Math.round(y), Math.max(1.2, r * 0.3), r, Math.max(2.5, r * 0.45), 4, rot, k, 1);
/** Кольцо-волна (эллипс rx×ry) постоянной толщины th пикселей экрана: внутренняя кромка светлее; gap 0..1 — доля вырезанных дуг (распад на segs дуг). */
function ring(f: PC, cx: number, cy: number, rx: number, ry: number, th: number, k: number, gap = 0, seed = 0, segs = 6) {
  for (let y = Math.floor(cy - ry - th - 1); y <= cy + ry + th + 1; y++) for (let x = Math.floor(cx - rx - th - 1); x <= cx + rx + th + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, ex = dx / rx, ey = dy / ry, e = Math.hypot(ex, ey);
    const gx = dx / (rx * rx), gy = dy / (ry * ry), gr = Math.hypot(gx, gy) / Math.max(e, 1e-6), d = (e - 1) / Math.max(gr, 1e-6);
    if (Math.abs(d) > th / 2) continue;
    if (gap > 0) { const a = (Math.atan2(dy / ry, dx / rx) / TAU + 1 + seed) % 1; if ((a * segs) % 1 < gap) continue; }
    const u = (d + th / 2) / th, c = lightAt(k * (1 - u * 0.7));
    if (c) f.set(x, y, c);
  }
}
/** Заполненный эллипс света (пятно удара): тона от центра к краю. */
function disc(f: PC, cx: number, cy: number, rx: number, ry: number, k: number) {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
    const e = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (e > 1) continue;
    const c = lightAt(k * (1 - e * 0.75));
    if (c) f.set(x, y, c);
  }
}
/** Столб света от y0 (низ) до y1 (верх, заострён): полосы тонов поперёк (белая середина, золотые края), ширина w. */
function beam(f: PC, cx: number, y0: number, y1: number, w: number, k: number) {
  for (let y = Math.round(y1); y <= y0; y++) {
    const q = (y - y1) / Math.max(1, y0 - y1), hw = (w / 2) * Math.min(1, q * 4 + 0.15);
    for (let x = Math.floor(cx - hw - 1); x <= cx + hw; x++) { const u = Math.abs(x + 0.5 - cx) / Math.max(hw, 0.5); if (u > 1) continue; const c = lightAt(k * (1 - u * 0.7) * (0.55 + 0.45 * q)); if (c) f.set(x, y, c); }
  }
}
/** Хвост скорости: клин от низа (ширина w) к острию вверху, светлый у основания. */
function streakUp(f: PC, cx: number, yTop: number, yBot: number, w: number, k: number) {
  for (let y = Math.round(yTop); y <= yBot; y++) {
    const q = (y - yTop) / Math.max(1, yBot - yTop), hw = (w / 2) * q ** 0.7;
    for (let x = Math.floor(cx - hw); x < cx + hw; x++) { const u = Math.abs(x + 0.5 - cx) / Math.max(hw, 0.5); const c = lightAt(k * (0.3 + 0.6 * q) * (1 - u * 0.5)); if (c) f.set(x, y, c); }
  }
}
/** Осколок света: ромб 5×5 (s = 3) или плюс 3×3 (s = 2); тона гаснут с k. Мельче не бывает — без пыли. */
function shard(f: PC, x: number, y: number, s: number, k = 1) {
  x = Math.round(x); y = Math.round(y);
  const t = (v: number) => lightAt(v * k);
  if (s >= 3) { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const m = Math.abs(dx) + Math.abs(dy); if (m <= 2) { const c = t(m === 0 ? 1 : m === 1 ? 0.66 : 0.36); if (c) f.set(x + dx, y + dy, c); } } }
  else if (s === 2) { const c0 = t(0.9), c1 = t(0.45); if (c0) f.set(x, y, c0); if (c1) for (const [dx, dy] of N4) f.set(x + dx, y + dy, c1); }
}
/** Сжатие по x к центру (молот уходит в луч света). */
function squeezeX(src: PC, k: number): PC {
  const out = new PC(src.w, src.h), c = src.w / 2;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const sx = Math.floor(c + (x + 0.5 - c) / k); const p = src.get(sx, y); if (p && p[3]) out.set(x, y, p); }
  return out;
}
/** Звезда оглушения 7×7 (пять лучей) с контуром и бликом; малая — ромб 5×5. */
const STAR = ["...s...", "..sss..", "sssssss", ".sssss.", "..sss..", ".ss.ss.", "ss...ss"];
const STAR_S = ["..s..", ".sss.", "sssss", ".sss.", "..s.."];
const starBig = (() => { const f = shadeMask(STAR, { s: { ramp: G, base: 3 } }, OUT, 1); f.set(4, 3, WH); return f; })();
const starSmall = shadeMask(STAR_S, { s: { ramp: G, base: 3 } }, OUT, 1);
function stunStars(f: PC, cx: number, cy: number, t: number, grow: number) {
  const items = [0, 1, 2].map((k) => { const a = t * 0.95 + (k * TAU) / 3; return { x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 3, front: Math.sin(a) > -0.2 }; }).sort((p, q) => p.y - q.y);
  for (const it of items) {
    const s = grow >= 0.75 && it.front ? starBig : grow > 0.25 ? starSmall : null;
    if (s) f.blit(s, Math.round(it.x - s.w / 2), Math.round(it.y - s.h / 2));
  }
}
/** Осколки удара: вылет дугой (вверх и в стороны, потом вниз), ромб → плюс → нет. */
function shards(f: PC, list: { a: number; v: number }[], cx: number, cy: number, q: number, k = 1) {
  for (const s of list) {
    const x = cx + Math.cos(s.a) * s.v * q * 3.6, y = cy + Math.sin(s.a) * s.v * q * 2.8 + 1.2 * q * q;
    shard(f, x, y, q < 1.5 ? 3 : q < 3 ? 2 : 0, k * (q < 2.5 ? 1 : 0.62));
  }
}

// ---------- A: небесный молот ----------
/** Снаряд A: сгусток света с хвостом (ядро-диск, кромка янтарная), две искры кружат вокруг. 6 кадров цикла, смотрит вправо. */
function aProj(): Gen {
  const W = 28, Hh = 16, cx = 20, cy = 8, N = 6;
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, Hh), L = 15 + (t % 3);
    for (let i = 0; i < L; i++) {
      const q = i / L, w = 3.4 * (1 - q) ** 0.8;
      for (let dy = -Math.round(w); dy <= Math.round(w); dy++) { const c = lightAt((1 - q) * (1 - (Math.abs(dy) / (w + 0.6)) * 0.55) * 0.95); if (c) f.set(cx - 3 - i, cy + dy, c); }
    }
    disc(f, cx, cy, 4.5, 4.5, 1.08);
    for (let k = 0; k < 2; k++) { const a = (t / N) * TAU + k * Math.PI; shard(f, cx + Math.cos(a) * 6.5, cy + Math.sin(a) * 4.5, 2, 1); }
    return f;
  });
  return { id: "hammer-a", pack: "gen", role: "proj", frames, w: W, h: Hh, anchor: [cx / W, cy / Hh], fps: 14, blend: "normal", hero: "warrior", ease: { fadeIn: 90, scaleIn: 0.5 } };
}
/** Удар A, верхний слой (над целью): щель света в небе, молот проявляется, замахивается вверх, падает (хвост скорости), удар — белый
 *  силуэт и вспышка-звезда, отскок, молот сжимается в луч света, луч уходит вверх; осколки дугами; звёзды оглушения над головой.
 *  12 кадров, якорь — центр тела цели. */
function aHit(): Gen {
  const W = 72, Hh = 104, cx = 36, feet = 92, body = feet - 12, head = feet - 26, N = 12, ham = hammerA();
  const hx = cx - Math.floor(ham.w / 2), FACE = 33;                     // ряд контура под ударной гранью в спрайте молота
  const r = rng(17), list = Array.from({ length: 6 }, (_, i) => ({ a: -Math.PI / 2 + ((i - 2.5) / 2.5) * 1.15 + (r() - 0.5) * 0.25, v: 2.3 + r() * 1.4 }));
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, Hh), at = (face: number, img: PC) => f.blit(img, hx, face - FACE);
    if (t === 0) { beam(f, cx, 44, 22, 3, 0.75); sparkle(f, cx, 33, 6, 1); }
    if (t === 1) { beam(f, cx, 30, 6, 4, 0.6); at(50, lift(ham, 2)); sparkle(f, cx - 9, 24, 4, 0.9); }
    if (t === 2) { at(46, ham); sparkle(f, cx + 10, 18, 4, 1); sparkle(f, cx - 11, 40, 3, 0.85); }
    if (t === 3) {
      streakUp(f, cx, 14, 52, 18, 0.95);
      for (const sx of [-15, 14]) streakUp(f, cx + sx + 1, 20, 50, 3, 0.75);
      at(62, ham);
    }
    if (t === 4) { at(69, lift(ham, 3)); burst(f, cx, head, 10, 27, 10, 8, Math.PI / 2, 1.08); }
    if (t === 5) { at(68, ham); burst(f, cx, head, 6, 31, 8, 8, Math.PI / 2 + 0.2, 0.95, 0.5); shards(f, list, cx, head, 1); }
    if (t === 6) { at(68, squeezeX(lift(ham, 2), 0.6)); sparkle(f, cx, head - 1, 11, 0.9, Math.PI / 4); shards(f, list, cx, head, 2.2); }
    if (t === 7) { beam(f, cx, head + 2, 18, 7, 1); shards(f, list, cx, head, 3.3, 0.8); }
    if (t === 8) beam(f, cx, head - 14, 8, 5, 0.8);
    if (t === 9) beam(f, cx, 30, 2, 3, 0.55);
    if (t >= 6) stunStars(f, cx, head - 7, t, t < 7 ? 0.5 : t < 10 ? 1 : t === 10 ? 0.5 : 0);
    return f;
  });
  return { id: "hammer-a-hit", pack: "gen", role: "hit", frames, w: W, h: Hh, anchor: [cx / W, body / Hh], fps: 16, blend: "normal", hero: "warrior", ease: { tail: 120 } };
}
/** Удар A, нижний слой (под юнитами): печать чертится по кругу, вспыхивает в момент удара, волна по земле, печать гаснет дугами.
 *  12 кадров в такт hammer-a-hit (тот же fps); якорь в той же точке (центр тела цели, на 12 выше центра печати). */
function aGround(): Gen {
  const W = 80, Hh = 44, cx = 40, cy = 26, N = 12, RX = 21, RY = 9.5;
  const frames = Array.from({ length: N }, (_, t) => {
    const f = new PC(W, Hh);
    const draw = [0.35, 0.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0][t], k = [0.7, 0.8, 0.9, 1, 1.1, 1, 0.9, 0.8, 0.65, 0.5, 0.36, 0][t], gap = [0, 0, 0, 0, 0, 0, 0, 0.1, 0.25, 0.45, 0.65, 1][t];
    if (draw > 0 && k > 0) {
      const sweep = new PC(W, Hh);
      ring(sweep, cx, cy, RX, RY, 2.2, k, gap, 0.05, 6);
      if (draw >= 1) {
        ring(sweep, cx, cy, RX - 6, RY - 2.8, 1.8, k * 0.85, gap, 0.3, 6);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2, x = cx + Math.cos(a) * (RX - 3), y = cy + Math.sin(a) * (RY - 1.4); if (((i / 8 + 0.31) * 6) % 1 >= gap) { const c = lightAt(k * 0.95); if (c) for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1]]) sweep.set(Math.round(x) + dx, Math.round(y) + dy, c); } }
      }
      // черчение: дуга от передней точки по часовой, на конце дуги — искра
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        const c = sweep.get(x, y)!;
        if (!c[3]) continue;
        const a = ((Math.atan2((y + 0.5 - cy) / RY, (x + 0.5 - cx) / RX) - Math.PI / 2) / TAU + 2) % 1;
        if (a <= draw) f.set(x, y, c);
      }
      if (draw < 1) { const a = Math.PI / 2 + draw * TAU; sparkle(f, cx + Math.cos(a) * RX, cy + Math.sin(a) * RY, 5, 1); }
    }
    if (t === 4) disc(f, cx, cy, 13, 5.5, 1.05);
    if (t === 5) disc(f, cx, cy, 8, 3.5, 0.8);
    if (t >= 5 && t <= 8) { const q = t - 5, rr = 15 + q * 6.5; ring(f, cx, cy, rr, rr * 0.45, [3.4, 3, 2.6, 2.2][q], [1.05, 0.88, 0.68, 0.5][q], [0, 0.1, 0.3, 0.5][q], 0.13, 6); }
    return f;
  });
  return { id: "hammer-a-hit-ground", pack: "gen", role: "aoe", frames, w: W, h: Hh, anchor: [cx / W, (cy - 12) / Hh], fps: 16, blend: "normal", hero: "warrior", ease: { tail: 120 } };
}

export function GENERATED_HAMMER3(): Gen[] { return [aProj(), aHit(), aGround()]; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/vfx-preview");
  const all = GENERATED_HAMMER3();
  stackV(all.map((g) => storyboard(g.frames, g.w, g.h, g.anchor, `${g.id} ${g.frames.length}f ${g.fps}fps ${g.w}x${g.h}`, 2))).save(path.join(dir, "hammer3.png"));
  // рядом с целью на траве: все кадры удара (нижний слой под героем, верхний над ним), ×3
  const hero = readPng(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/public/assets/units/warrior.png"));
  const hf = new PC(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) hf.set(x, y, hero.get(x, y)!);
  const rows = [["hammer-a-hit", "hammer-a-hit-ground"]].map(([id, gid]) => [all.find((g) => g.id === id)!, all.find((g) => g.id === gid)] as const);
  const cw = 80, ch = 110, n = 12, pc = new PC(cw * n, ch * rows.length);
  rows.forEach(([g, gr], j) => {
    paintGround(pc, 0, j * ch, cw * n, ch, j % 2 ? "cobble" : "grass");
    for (let i = 0; i < n; i++) {
      const bx = i * cw + 40, by = j * ch + 92 - 12;                                  // центр тела цели
      if (gr) pc.blit(gr.frames[i], bx - Math.round(gr.anchor[0] * gr.w), by - Math.round(gr.anchor[1] * gr.h));
      pc.blit(hf, bx - 16, by + 12 - 30);
      if (i < g.frames.length) pc.blit(g.frames[i], bx - Math.round(g.anchor[0] * g.w), by - Math.round(g.anchor[1] * g.h));
    }
  });
  scaleNN(pc, 3).save(path.join(dir, "hammer3-hero.png"));
  console.log(path.join(dir, "hammer3.png"));
}
