/**
 * Полы помещений (черновик к утверждению, в игру не подключён): доски разных пород, каменные плиты храма и собора с узором,
 * мозаика святилищ, плитка Умбрата с фиолетовыми прожилками, склеп (трещины, пыль, кости, мох), пепельный склеп, обсидиан рейда.
 * Каждый материал — 4 варианта тайла 32×32 (шов только по верхней и левой кромке — тайлы стыкуются в любом порядке),
 * плюс образцы залов: тень и плинтус у стен, помост с бордюром-торцом, ступени (проступь и подступёнок), ниша, ковры и дорожки.
 * Свет сверху-слева, 3–5 тонов на материал, палитра — tools/gen/palette.ts.
 * Запуск (под tools/out/scenario.lock): npx tsx tools/gen/floors.ts → tools/out/floors/new/*.png, tools/out/floors/tiles.png
 */
import path from "node:path";
import { PC, hash01, hex, mix, ramp, shade, type RGBA, type Ramp } from "./canvas";
import { P, FACTION } from "./palette";
import { PR, table, bench, barrel, crate, brazier, candles, column, sarcophagus, bed, counter, altar, bones as bonePile, applyLights, windowLight, type Light } from "./floors-props";

export const S = 32;
const OUT = path.resolve("tools/out/floors");
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- шум и квантование ----------
/** Value-noise с раздельными ячейками по x и y; px — период по x в ячейках (0 — без периода). */
export function vn(x: number, y: number, cx: number, cy: number, seed: number, px = 0) {
  const gx = x / cx, gy = y / cy, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const w = (a: number) => (px ? ((a % px) + px) % px : a);
  const h = (a: number, b: number) => hash01(w(a), b, seed);
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return lerp(lerp(a, b, s(fx)), lerp(c, d, s(fx)), s(fy));
}
const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
/** Тон рампы по значению v (0…len-1): дизер только в узкой полосе между тонами — без однопиксельного шума. */
export function dq(r: Ramp, v: number, x: number, y: number): RGBA {
  v = clamp(v, 0, r.length - 1);
  const i = Math.floor(v), f = v - i;
  const t = clamp((f - 0.5) * 10 + 0.5);
  return r[Math.min(r.length - 1, i + (t > (B4[y & 3][x & 3] + 0.5) / 16 ? 1 : 0))];
}
const tn = (r: Ramp, v: number) => r[Math.round(clamp(v, 0, r.length - 1))];
function mul(pc: PC, x: number, y: number, k: number) { const c = pc.get(x, y); if (c && c[3]) pc.set(x, y, [c[0] * k, c[1] * k, c[2] * k, 255].map(Math.round) as RGBA); }
function blend(pc: PC, x: number, y: number, c: RGBA, t: number) { const d = pc.get(x, y); if (d && d[3]) pc.set(x, y, mix(d, [c[0], c[1], c[2], 255], clamp(t))); }

// ---------- рампы материалов (индекс 0 — шов/контур тёмным тоном материала) ----------
export const R = {
  solMarble: ramp("#5e574e", "#9a9286", "#c4bcae", "#dcd5c6", "#f2ecdf"),
  solInlay: ramp("#3a1418", "#6e2228", "#9a3a32", "#c25a44"),
  cathedral: ramp("#1c2230", "#303a4c", "#44506a", "#5a6884", "#7886a2"),
  cathInlay: ramp("#100e16", "#1e1a26", "#2c2636", "#3c3448"),
  crypt: ramp("#221e1e", "#3a3432", "#524a44", "#6a6058", "#867a6e"),
  basalt: ramp("#0e0c12", "#1e1a24", "#2c2632", "#3a3240", "#4c4252"),
  umbTile: ramp("#0c0910", "#17121c", "#211a28", "#2c2336", "#3a2f46"),
  violet: ramp("#2e1450", "#5a2a96", "#9a5ae0", "#d6b0ff"),
  obsidian: ramp("#08070c", "#14111e", "#201b30", "#2e2744", "#4a4068"),
  flag: ramp("#2a2626", "#443e3c", "#5e5652", "#787068", "#948a7e"),
  dust: hex("#8a8070"),
  moss: ramp("#16261a", "#26402a", "#3c5e34", "#5a7c42"),
  bone: ramp("#5a5246", "#8e8676", "#bdb5a2", "#e2dccb"),
  ember: ramp("#5a140c", "#b0300e", "#f06a18", "#ffc048"),
  // доски: дуб таверны, свежая сосна лавки, старые серые доски дома, морёное дерево Умбрата
  oak: ramp("#24140c", "#4a2c18", "#6a4224", "#8a5a32", "#a87444"),
  pine: ramp("#3c2814", "#6e4c26", "#9a7038", "#bc9250", "#d8b070"),
  oldwood: ramp("#221c18", "#3c3228", "#56483a", "#72604c", "#8c7a62"),
  stained: ramp("#0e0a0e", "#1e141a", "#2e2026", "#402e34", "#56424a"),
  gold: P.gold,
};

// ---------- раскладки плит в тайле (шов — верхняя строка и левый столбец каждой плиты) ----------
type Rect = [number, number, number, number];
const LAYOUTS: Rect[][] = [
  [[0, 0, 32, 32]],
  [[0, 0, 32, 16], [0, 16, 32, 16]],
  [[0, 0, 16, 16], [16, 0, 16, 16], [0, 16, 16, 16], [16, 16, 16, 16]],
  [[0, 0, 16, 32], [16, 0, 16, 16], [16, 16, 16, 16]],
  [[0, 0, 32, 16], [0, 16, 16, 16], [16, 16, 16, 16]],
  [[0, 0, 20, 14], [20, 0, 12, 14], [0, 14, 12, 18], [12, 14, 20, 18]],
  [[0, 0, 12, 20], [12, 0, 20, 20], [0, 20, 32, 12]],
];

export interface StoneMat {
  kind: "stone"; r: Ramp; layouts: number[]; base: number; spread: number; noise: number;
  veins?: number; diamond?: { r: Ramp; rim: RGBA; size: number }; cracks: number; chips: number;
  dust?: number; moss?: number; bones?: number; ash?: number; embers?: number; violet?: number; gloss?: number; worn?: number;
  /** шахматка светлых и тёмных плит внутри тайла */ checker?: number; /** пятна копоти */ scorch?: number; /** выбитая плита с обломками (доля вариантов) */ hole?: number;
}
export interface WoodMat { kind: "wood"; r: Ramp; rows: number[]; spread: number; knots: number; scratches: number; nails: RGBA; worn?: number }
export interface MosaicMat { kind: "mosaic"; pal: RGBA[]; grout: RGBA }
export type Mat = StoneMat | WoodMat | MosaicMat;

export const MATS: Record<string, { title: string; m: Mat }> = {
  sol: { title: "мрамор храма Сольгарда (вставки-ромбы)", m: { kind: "stone", r: R.solMarble, layouts: [0, 0, 0, 1], base: 2.6, spread: 0.25, noise: 0.22, veins: 0.7, diamond: { r: R.solInlay, rim: hex("#c89a3a"), size: 5 }, cracks: 0.12, chips: 0.2, worn: 0.3 } },
  cathedral: { title: "собор павших королей: шахматка плит, вставки, износ", m: { kind: "stone", r: R.cathedral, layouts: [2, 2, 2, 2], base: 2.5, spread: 0.2, noise: 0.45, veins: 0.6, checker: 0.55, diamond: { r: R.cathInlay, rim: hex("#8a7448"), size: 4 }, cracks: 0.35, chips: 0.35, dust: 0.3, moss: 0.15, worn: 0.35 } },
  cracked: { title: "треснувший мрамор перехода: копоть, выбитые плиты", m: { kind: "stone", r: R.cathedral, layouts: [2, 4, 2, 5], base: 2.4, spread: 0.35, noise: 0.5, veins: 0.4, checker: 0.4, cracks: 1.8, chips: 0.8, dust: 0.3, ash: 0.1, moss: 0.15, embers: 0.85, scorch: 0.7, hole: 1 } },
  worn: { title: "вытертая базальтовая дорожка", m: { kind: "stone", r: R.basalt, layouts: [1, 1, 4, 1], base: 2.7, spread: 0.25, noise: 0.4, cracks: 0.3, chips: 0.3, worn: 0.8, gloss: 0.3, ash: 0.08 } },
  crypt: { title: "склеп: старые плиты, пыль, кости, мох", m: { kind: "stone", r: R.crypt, layouts: [5, 6, 2, 3], base: 2.3, spread: 0.45, noise: 0.7, cracks: 1.1, chips: 0.7, dust: 0.7, moss: 0.6, bones: 0.5 } },
  ashen: { title: "пепельный склеп: базальт, пепел, угли", m: { kind: "stone", r: R.basalt, layouts: [5, 6, 4, 2], base: 2.4, spread: 0.4, noise: 0.6, cracks: 0.9, chips: 0.6, ash: 0.55, embers: 0.5, bones: 0.35 } },
  umb: { title: "плитка Умбрата с фиолетовыми прожилками", m: { kind: "stone", r: R.umbTile, layouts: [2, 2, 1, 0], base: 2.5, spread: 0.3, noise: 0.4, violet: 1, cracks: 0.15, chips: 0.2, gloss: 0.5 } },
  raid: { title: "обсидиан Цитадели Хаоса", m: { kind: "stone", r: R.obsidian, layouts: [0, 0, 1, 0], base: 2.4, spread: 0.3, noise: 0.45, cracks: 0.5, chips: 0.3, gloss: 1, embers: 0.35 } },
  flag: { title: "плитняк Эмберхолла (нижний уровень)", m: { kind: "stone", r: R.flag, layouts: [5, 6, 4, 3], base: 2.4, spread: 0.45, noise: 0.6, cracks: 0.5, chips: 0.5, dust: 0.25 } },
  oak: { title: "дуб таверны", m: { kind: "wood", r: R.oak, rows: [2.5, 2.1, 2.75, 2.3], spread: 0.45, knots: 0.6, scratches: 0.4, nails: hex("#1a1210") } },
  pine: { title: "свежая сосна лавки", m: { kind: "wood", r: R.pine, rows: [2.6, 2.3, 2.85, 2.45], spread: 0.4, knots: 0.9, scratches: 0.1, nails: hex("#2a1c10") } },
  oldwood: { title: "старые доски дома", m: { kind: "wood", r: R.oldwood, rows: [2.4, 2.0, 2.6, 2.2], spread: 0.55, knots: 0.5, scratches: 1.4, nails: hex("#1a1614"), worn: 1 } },
  stained: { title: "морёное дерево Умбрата", m: { kind: "wood", r: R.stained, rows: [2.5, 2.2, 2.7, 2.35], spread: 0.35, knots: 0.4, scratches: 0.5, nails: hex("#08060a") } },
  mosaic: { title: "мозаика святилища (3 цвета: кремовый, золото, гранат)", m: { kind: "mosaic", pal: [hex("#d6cbb2"), hex("#cdbf9f"), hex("#d0a040"), hex("#8a2a26"), hex("#b8862e"), hex("#ece2c8")], grout: hex("#8a7e68") } },
};

// ---------- мелкие штампы ----------
/** Кость в щели: шейка и головки, верх светлее, контур тёмным тоном материала. */
export function bone(pc: PC, x: number, y: number, len: number, dir: number, ink: RGBA) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= len; i++) pts.push([x + i, y + Math.round(i * dir * 0.3), i === 0 || i === len ? 2 : 1]);
  const mask = new Set<string>();
  for (const [px, py, k] of pts) { mask.add(`${px},${py}`); if (k === 2) { mask.add(`${px},${py - 1}`); mask.add(`${px},${py + 1}`); } }
  for (const key of mask) {
    const [px, py] = key.split(",").map(Number);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!mask.has(`${px + ox},${py + oy}`)) pc.set(px + ox, py + oy, ink);
  }
  for (const key of mask) { const [px, py] = key.split(",").map(Number); pc.set(px, py, mask.has(`${px},${py - 1}`) ? R.bone[2] : R.bone[3]); }
  for (const key of mask) { const [px, py] = key.split(",").map(Number); if (!mask.has(`${px},${py + 1}`) && mask.has(`${px},${py - 1}`)) pc.set(px, py, R.bone[1]); }
}
/** Обломок черепа: купол, глазница, тень снизу. */
export function skull(pc: PC, x: number, y: number, ink: RGBA) {
  const rows = [".kkkk.", "k3332k", "k3k32k", "k221kk", ".kkk.."];
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "k") pc.set(x + i, y + j, ink); else if (ch !== ".") pc.set(x + i, y + j, R.bone[Number(ch)]); }));
}
/** Трещина: случайный путь, тёмная бороздка и светлая кромка снизу (свет сверху-слева). */
export function crack(pc: PC, x: number, y: number, len: number, seed: number, r: Ramp, inside: (x: number, y: number) => boolean, glow?: Ramp) {
  let fx = x, fy = y, a = hash01(seed, 1, 7) * Math.PI * 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < len; i++) {
    const px = Math.round(fx), py = Math.round(fy);
    if (!inside(px, py)) break;
    pts.push([px, py]);
    a += (hash01(seed, i, 9) - 0.5) * 0.9;
    fx += Math.cos(a); fy += Math.sin(a) * 0.75;
    if (i === Math.floor(len / 2) && hash01(seed, 3, 5) < 0.6) crack(pc, px, py, Math.floor(len / 2.5), seed + 101, r, inside, glow);
  }
  const set = new Set(pts.map(([a, b]) => `${a},${b}`));
  pts.forEach(([px, py], i) => { if (i % 3 !== 1 && !set.has(`${px},${py + 1}`) && inside(px, py + 1)) pc.set(px, py + 1, mix(pc.get(px, py + 1)!, r[Math.min(r.length - 1, 3)], 0.6)); });
  pts.forEach(([px, py], i) => pc.set(px, py, glow && i % 4 !== 0 ? glow[i % 3 === 0 ? 3 : 2] : r[0]));
}

// ---------- тайлы ----------
/** Каменный тайл варианта v (0…3). */
export function stoneTile(m: StoneMat, v: number, seed = 0, detail = 1): PC {
  const pc = new PC(S, S);
  const lay = LAYOUTS[m.layouts[v % m.layouts.length]];
  const sd = seed * 131 + v * 17 + 3;
  const slabOf = new Int8Array(S * S).fill(-1);
  lay.forEach(([sx, sy, w, h], k) => {
    const par = ((sx >> 4) + (sy >> 4)) % 2;
    const tone = m.base + (hash01(k, v, sd) - 0.5) * 2 * m.spread + (m.checker ? (par ? -m.checker : m.checker * 0.6) : 0);
    const hole = !!m.hole && v === 3 && k === lay.length - 1;
    for (let ly = 0; ly < h; ly++) for (let lx = 0; lx < w; lx++) {
      const x = sx + lx, y = sy + ly;
      slabOf[y * S + x] = k;
      let c: RGBA;
      if (lx === 0 || ly === 0) c = m.r[0];
      else {
        let val = tone + (vn(x, y, 9, 7, sd + k) - 0.5) * 2 * m.noise + (vn(x, y, 4, 4, sd + 50 + k) - 0.5) * m.noise * 0.6;
        val += (1 - (lx + ly) / (w + h)) * 0.35 - 0.15; // свет сверху-слева по плите
        if (m.worn) val += (1 - Math.hypot(lx / w - 0.5, ly / h - 0.5) * 2) * m.worn * 0.4;
        if (m.veins) { const n = vn(x + k * 13, y, 11, 8, sd + 7); if (Math.abs(n - 0.5) < 0.022) val -= m.veins * 0.9; else if (Math.abs(n - 0.5) < 0.045) val -= m.veins * 0.3; }
        if (m.gloss) { const d = (lx - ly * 1.3 + 40 + Math.floor(hash01(k, v, sd + 9) * 12)) % 26; if (d < 2) val += m.gloss * 0.9; else if (d < 4) val += m.gloss * 0.35; }
        if (m.scorch) { const n = vn(x, y, 8, 6, sd + 13); if (n > 1 - m.scorch * 0.5) val -= 1.1; else if (n > 1 - m.scorch * 0.62) val -= 0.5; }
        if (hole) {
          // выбитая плита: тёмная яма с обломками, верхняя кромка ямы — тень, нижняя — светлый край обломка
          const rub = vn(x, y, 3, 3, sd + 17);
          val = ly < 4 ? 0.4 : rub > 0.62 ? 2.6 : rub > 0.45 ? 1.6 : 0.8;
        }
        if (lx === 1 || ly === 1) val = Math.max(val + 0.9, 3.2);
        if (lx === w - 1 || ly === h - 1) val = Math.min(val - 1, 1.3);
        else if (ly === h - 2) val -= 0.35;
        c = dq(m.r, val, x, y);
        if (m.violet && lx > 1 && ly > 1 && lx < w - 1 && ly < h - 1 && hash01(k, v, sd + 5) < 0.3 * m.violet) {
          // прожилка: изолиния двухоктавного шума — ломаная линия, а не петля; ядро светится только местами
          const n = vn(x + k * 17, y + k * 5, 22, 14, sd + 23) * 0.8 + vn(x, y, 6, 5, sd + 24) * 0.2;
          const d = Math.abs(n - 0.5 + (hash01(k, v, sd + 4) - 0.5) * 0.12);
          const hot = vn(x, y, 6, 6, sd + 25) > 0.6;
          if (d < 0.012) c = hot ? R.violet[2] : R.violet[1];
          else if (d < 0.026) c = mix(c, R.violet[hot ? 1 : 0], 0.8);
          else if (d < 0.06) c = mix(c, R.violet[0], 0.4 * (1 - (d - 0.026) / 0.034));
        }
      }
      pc.set(x, y, c);
    }
  });
  const inSlab = (k: number) => (x: number, y: number) => {
    const [sx, sy, w, h] = lay[k];
    return x >= sx + 2 && y >= sy + 2 && x <= sx + w - 2 && y <= sy + h - 3;
  };
  // трещины и сколы
  lay.forEach(([sx, sy, w, h], k) => {
    if (w >= 16 && h >= 14 && hash01(k, v, sd + 31) < m.cracks * 0.55 * detail) {
      const n = m.cracks > 1 && hash01(k, v, sd + 32) < 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) crack(pc, sx + 2 + Math.floor(hash01(k, i, sd + 33) * (w - 4)), sy + 2 + Math.floor(hash01(k, i, sd + 34) * (h - 5)), 8 + Math.floor(hash01(k, i, sd + 35) * Math.min(12, w)), sd * 7 + k * 3 + i, m.r, inSlab(k), m.embers && hash01(k, i, sd + 36) < m.embers ? R.ember : undefined);
    }
    if (hash01(k, v, sd + 41) < m.chips * detail) {
      // скол угла: выбоина цвета шва, светлая нижняя кромка
      const corner = Math.floor(hash01(k, v, sd + 42) * 2), sz = 2 + Math.floor(hash01(k, v, sd + 43) * 2);
      for (let j = 0; j <= sz; j++) for (let i = 0; i <= sz - j; i++) {
        const x = corner ? sx + w - 1 - i : sx + 1 + i, y = corner ? sy + h - 1 - j : sy + 1 + j;
        pc.set(x, y, i + j === sz ? m.r[corner ? 3 : 1] : m.r[0]);
      }
    }
  });
  // ромбы-вставки на пересечениях плит (четверть ромба в каждом углу тайла — стыкуется с соседями)
  if (m.diamond) {
    const D = m.diamond;
    for (const [cx, cy] of [[0, 0], [S, 0], [0, S], [S, S]]) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - cx, dy = y - cy, d = Math.abs(dx) + Math.abs(dy);
      if (d > D.size) continue;
      if (d === D.size) pc.set(x, y, D.rim);
      else if (d === D.size - 1) pc.set(x, y, dy < 0 || (dy === 0 && dx < 0) ? D.r[3] : D.r[1]);
      else pc.set(x, y, dq(D.r, 2 - (dx + dy) * 0.15 + (d < 2 ? 0.6 : 0), x, y));
    }
  }
  // пыль в щелях и углах, мох, пепел, угли
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = slabOf[y * S + x], grout = pc.get(x, y)![0] === m.r[0][0] && pc.get(x, y)![1] === m.r[0][1];
    const [sx, sy, w, h] = lay[Math.max(0, k)];
    const edge = Math.min(x - sx, y - sy, sx + w - 1 - x, sy + h - 1 - y);
    if (m.dust) {
      const n = vn(x, y, 6, 5, sd + 61);
      const amt = n * m.dust * (edge <= 1 ? 1.2 : edge <= 3 ? 0.7 : 0.35);
      if (amt > 0.42) blend(pc, x, y, R.dust, amt > 0.62 ? 0.42 : 0.24);
    }
    if (m.ash) {
      const n = vn(x, y, 7, 5, sd + 71) + (edge <= 2 ? 0.12 : 0);
      if (n > 1 - m.ash * 0.75 * (0.4 + 0.6 * detail)) pc.set(x, y, n > 1.06 - m.ash * 0.5 ? P.ash[4] : n > 1.02 - m.ash * 0.6 ? P.ash[3] : P.ash[2]);
    }
    if (m.moss && (grout || edge <= 1)) {
      const n = vn(x, y, 4, 3, sd + 81);
      if (n > 1 - m.moss * 0.42) pc.set(x, y, grout ? R.moss[n > 1 - m.moss * 0.25 ? 2 : 1] : R.moss[n > 1 - m.moss * 0.2 ? 3 : 2]);
    }
    if (m.embers && grout && hash01(x >> 2, y >> 2, sd + 91) < m.embers * 0.18 * detail) {
      pc.set(x, y, R.ember[(x + y) % 3 === 0 ? 3 : 2]);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = pc.get(x + ox, y + oy); if (c && c[0] < 140) blend(pc, x + ox, y + oy, R.ember[1], 0.45); }
    }
  }
  // кости в щелях
  if (m.bones && hash01(v, 5, sd + 101) < m.bones * detail) {
    const k = Math.floor(hash01(v, 6, sd + 102) * lay.length), [sx, sy, w, h] = lay[k];
    if (hash01(v, 7, sd + 103) < 0.65) bone(pc, sx + 3 + Math.floor(hash01(v, 8, sd) * Math.max(1, w - 12)), sy + h - 4, 5 + Math.floor(hash01(v, 9, sd) * 3), hash01(v, 10, sd) < 0.5 ? -1 : 1, m.r[0]);
    else skull(pc, sx + 3 + Math.floor(hash01(v, 8, sd) * Math.max(1, w - 10)), sy + 3 + Math.floor(hash01(v, 11, sd) * Math.max(1, h - 9)), m.r[0]);
  }
  return pc;
}

/** Дощатый тайл варианта v: доски по 8 px вдоль x, торцы со шляпками гвоздей; крайние отрезки ряда общего тона — стык тайлов не виден. */
export function woodTile(m: WoodMat, v: number, seed = 0): PC {
  const pc = new PC(S, S);
  const sd = seed * 97 + 11;
  for (let row = 0; row < 4; row++) {
    const y0 = row * 8, rowTone = m.rows[row];
    const nj = hash01(row, v, sd) < 0.35 ? 0 : hash01(row, v, sd + 1) < 0.75 ? 1 : 2;
    const joints: number[] = [];
    for (let i = 0; i < nj; i++) joints.push(5 + Math.floor(hash01(row, v * 3 + i, sd + 2) * 22));
    joints.sort((a, b) => a - b);
    if (joints.length === 2 && joints[1] - joints[0] < 6) joints.pop();
    const segTone = (x: number) => {
      const i = joints.filter((j) => x >= j).length;
      return i === 0 || i === joints.length ? rowTone : rowTone + (hash01(row * 5 + i, v, sd + 3) - 0.5) * 2 * m.spread;
    };
    for (let ly = 0; ly < 8; ly++) for (let x = 0; x < S; x++) {
      const y = y0 + ly;
      if (ly === 0) { pc.set(x, y, m.r[0]); continue; }
      const t = segTone(x), si = joints.filter((j) => x >= j).length, inner = si > 0 && si < joints.length;
      const gs = inner ? sd + row * 31 + v * 7 : sd + row * 31;
      let val = t + (vn(x, ly, 8, 2.2, gs, 4) - 0.5) * 0.9;
      const streak = vn(x, ly * 3, 12, 1, gs + 5, 8 / 3);
      if (streak > 0.74) val -= 0.75; else if (streak < 0.2) val += 0.35;
      if (m.worn) val += (vn(x, y, 10, 10, sd + 9) - 0.5) * m.worn * 0.6;
      if (ly === 1) val += 0.8; else if (ly === 7) val -= 0.7; else if (ly === 6) val -= 0.2;
      pc.set(x, y, dq(m.r, val, x, y));
    }
    for (const j of joints) {
      for (let ly = 1; ly < 8; ly++) { pc.set(j, y0 + ly, m.r[0]); const c = pc.get(j + 1, y0 + ly)!; pc.set(j + 1, y0 + ly, ly === 7 ? c : mix(c, m.r[4], 0.35)); }
      if (hash01(j, row, sd + 6 + v) < 0.5) for (const nx of [j - 2, j + 3]) if (nx > 0 && nx < S - 1) { pc.set(nx, y0 + 4, m.nails); pc.set(nx - 1, y0 + 3, mix(pc.get(nx - 1, y0 + 3)!, m.r[4], 0.5)); }
    }
    // сучок
    if (hash01(row, v, sd + 7) < m.knots * 0.35) {
      const kx = 6 + Math.floor(hash01(row, v, sd + 8) * 20), ky = y0 + 3 + Math.floor(hash01(row, v, sd + 9) * 2);
      for (let dx = -3; dx <= 3; dx++) for (let dy = -1; dy <= 1; dy++) {
        const d = (dx / 3) ** 2 + dy * dy;
        if (d > 1.05) continue;
        pc.set(kx + dx, ky + dy, d < 0.2 ? m.r[0] : d < 0.6 ? m.r[1] : mix(pc.get(kx + dx, ky + dy)!, m.r[1], 0.5));
      }
      pc.set(kx - 1, ky - 1, m.r[3]);
    }
    // царапины
    const ns = Math.floor(hash01(row, v, sd + 12) * m.scratches * 2.2);
    for (let i = 0; i < ns; i++) {
      const sx = 2 + Math.floor(hash01(row, i, sd + 13 + v) * 24), sy = y0 + 2 + Math.floor(hash01(row, i, sd + 14 + v) * 4), len = 3 + Math.floor(hash01(row, i, sd + 15) * 4);
      for (let k = 0; k < len; k++) { const x = sx + k, y = sy + Math.floor(k * 0.3); if (y < y0 + 7 && pc.get(x, y)) pc.set(x, y, mix(pc.get(x, y)!, m.r[4], 0.6)); }
    }
  }
  return pc;
}

/** Мозаика: смальта 3×3 + шов 1 px, у каждой смальты светлый верхний край; цвет — функция узора (мировые координаты смальты). */
export function mosaicTile(m: MosaicMat, v: number, pattern?: (tx: number, ty: number) => number, ox = 0, oy = 0): PC {
  const pc = new PC(S, S);
  for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
    const wx = ox + tx, wy = oy + ty;
    const idx = pattern ? pattern(wx, wy) : (wx + wy) % 4 === 0 ? 1 : 0;
    const base = m.pal[Math.max(0, Math.min(m.pal.length - 1, idx))];
    const j = (hash01(wx, wy, 41 + v) - 0.5) * 0.06;
    const c = shade(base, 1 + j);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const px = tx * 4 + x, py = ty * 4 + y;
      if (x === 0 || y === 0) pc.set(px, py, mix(shade(c, 0.8), m.grout, 0.3));
      else pc.set(px, py, y === 1 && x < 3 ? shade(c, 1.08) : x === 3 && y === 3 ? shade(c, 0.88) : c);
    }
  }
  return pc;
}

export function tileOf(key: string, v: number, seed = 0, detail = 1): PC {
  const m = MATS[key].m;
  return m.kind === "stone" ? stoneTile(m, v, seed, detail) : m.kind === "wood" ? woodTile(m, v, seed) : mosaicTile(m, v);
}

// ---------- образцы залов ----------
interface Wall { r: Ramp; course: number; block: number; plinth: Ramp; plinthH: number; cap: Ramp; trim?: RGBA; timber?: Ramp }
const WALLS: Record<string, Wall> = {
  sol: { r: FACTION.WHITE, course: 10, block: 22, plinth: R.solMarble, plinthH: 8, cap: ramp("#4a4038", "#7a6e60", "#a69a88", "#c8bca8"), trim: hex("#c89a3a") },
  umb: { r: FACTION.DARK, course: 9, block: 18, plinth: R.basalt, plinthH: 7, cap: ramp("#0a080e", "#16121c", "#221c2a", "#30283a"), trim: R.violet[1] },
  dungeon: { r: P.wallFace, course: 8, block: 16, plinth: R.cathedral, plinthH: 6, cap: P.wallTop },
  crypt: { r: ramp("#1e1a1c", "#2e2828", "#403836", "#544a46", "#665a54"), course: 8, block: 14, plinth: R.crypt, plinthH: 5, cap: ramp("#0e0c0e", "#181416", "#221c1e", "#2c2628") },
  raid: { r: ramp("#120e18", "#1e1828", "#2a2238", "#3a3050", "#4e4268"), course: 10, block: 20, plinth: R.obsidian, plinthH: 7, cap: ramp("#06050a", "#0e0c14", "#18141e", "#221c2a"), trim: R.ember[1] },
  ember: { r: P.plaster, course: 64, block: 999, plinth: R.oak, plinthH: 6, cap: ramp("#1e1410", "#2e2018", "#3e2c20", "#4e3a2a"), timber: P.timber },
  umbwood: { r: FACTION.DARK, course: 9, block: 18, plinth: R.stained, plinthH: 6, cap: ramp("#0a080e", "#16121c", "#221c2a", "#30283a") },
};

export interface RoomSpec {
  id: string; title: string; wall: keyof typeof WALLS; lower: string; upper?: string;
  /** помост: x0..x1 в тайлах пола, до ряда y1 (в тайлах от задней стены); face — материал бордюра */
  dais?: { x0: number; x1: number; y1: number; face: "stone" | "wood"; faceR: Ramp; h: number; trim?: RGBA };
  steps?: { w: number; n: number; r: Ramp };
  niche?: { x: number; w: number; glow?: RGBA };
  carpet?: { x: number; y: number; w: number; h: number; r: Ramp; band: RGBA; fringe?: boolean }[];
  medallion?: { cx: number; cy: number; rad: number };
  band?: boolean; dust?: number; ash?: number; seal?: boolean; tiled?: boolean;
  /** окна в задней стене: x от левого края пола; пятна света на полу */ windows?: number[];
  /** убранство и огни (координаты зала) */ props?: (pc: PC, L: Light[]) => void;
}

const RW = 14 * S, RH = 10 * S, WALL_H = 2 * S, SIDE = 16, FRONT = 12;
const FX0 = SIDE, FY0 = WALL_H, FX1 = RW - SIDE, FY1 = RH - FRONT;

/** Узор мозаики святилища: солнце-медальон в центре, лучи, кайма, поле в ромбах. */
function sanctuaryPattern(cx: number, cy: number, rad: number) {
  // 0/1 — поле (кремовый, чуть темнее для решётки), 2 — золото, 3 — гранат, 4 — тёмное золото, 5 — светлый центр
  return (tx: number, ty: number) => {
    const dx = tx - cx, dy = (ty - cy) * 1.25, d = Math.hypot(dx, dy);
    if (d < rad + 1.5) {
      if (d > rad) return 3;
      if (d > rad - 1.2) return 2;
      if (d < rad * 0.24) return d < rad * 0.14 ? 5 : 2;
      if (d < rad * 0.32) return 4;
      const a = Math.atan2(dy, dx), ray = Math.abs(((a / (Math.PI / 6)) % 2 + 2) % 2 - 1);
      return ray < 0.22 + (1 - d / rad) * 0.5 ? 2 : 0;
    }
    const u = (((tx + ty) % 12) + 12) % 12, w = (((tx - ty) % 12) + 12) % 12;
    if (u === 0 && w === 0) return 3;
    if (u === 0 || w === 0) return 1;
    return 0;
  };
}

export function paintFloor(pc: PC, key: string, x0: number, y0: number, x1: number, y1: number, salt: number, spec: RoomSpec) {
  const m = MATS[key].m;
  const cache = new Map<string, PC>();
  for (let ty = 0; y0 + ty * S < y1; ty++) for (let tx = 0; x0 + tx * S < x1; tx++) {
    let t: PC;
    if (m.kind === "mosaic") {
      const pat = spec.medallion ? sanctuaryPattern(spec.medallion.cx * 8 - 0.5, spec.medallion.cy * 8 - 0.5, spec.medallion.rad * 8) : undefined;
      t = mosaicTile(m, 0, pat, tx * 8, ty * 8);
    } else {
      const v = Math.floor(hash01(tx, ty, 900 + salt) * 4);
      // свой набор сидов на зал: тайлы те же 4 варианта, но комнаты не одинаковы
      const k = `${v}`;
      if (!cache.has(k)) cache.set(k, tileOf(key, v, spec.tiled ? 0 : salt, 0.25));
      t = cache.get(k)!;
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const px = x0 + tx * S + x, py = y0 + ty * S + y;
      if (px < x1 && py < y1) pc.set(px, py, t.get(x, y)!);
    }
  }
}

/** Детали поверх тайлов в координатах зала (в игре — декали): трещины через плиты, кости, черепа, мох, угли, пепел; на досках — царапины и пятна. */
export function decals(pc: PC, key: string, x0: number, y0: number, x1: number, y1: number, salt: number) {
  const m = MATS[key].m, area = ((x1 - x0) * (y1 - y0)) / (S * S);
  const at = (i: number, k: number) => [x0 + 3 + Math.floor(hash01(i, k, salt + 1) * (x1 - x0 - 10)), y0 + 3 + Math.floor(hash01(i, k, salt + 2) * (y1 - y0 - 10))];
  const inside = (x: number, y: number) => x > x0 + 1 && y > y0 + 1 && x < x1 - 2 && y < y1 - 2;
  if (m.kind === "stone") {
    const nc = Math.round(area * m.cracks * 0.22);
    for (let i = 0; i < nc; i++) { const [x, y] = at(i, 1); crack(pc, x, y, 8 + Math.floor(hash01(i, 3, salt) * 14), salt * 13 + i, m.r, inside, m.embers && hash01(i, 4, salt) < m.embers ? R.ember : undefined); }
    const nb = Math.round(area * (m.bones ?? 0) * 0.1);
    for (let i = 0; i < nb; i++) { const [x, y] = at(i, 5); if (hash01(i, 6, salt) < 0.7) bone(pc, x, y, 5 + Math.floor(hash01(i, 7, salt) * 3), hash01(i, 8, salt) < 0.5 ? -1 : 1, m.r[0]); else skull(pc, x, y, m.r[0]); }
    const nm = Math.round(area * (m.moss ?? 0) * 0.35);
    for (let i = 0; i < nm; i++) {
      const [cx, cy] = at(i, 9), rx = 2 + Math.floor(hash01(i, 10, salt) * 3);
      for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - rx; x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / 2) ** 2 + (vn(x, y, 2, 2, salt + i) - 0.5) * 0.8;
        if (d < 1) pc.set(x, y, R.moss[d < 0.3 ? 3 : y < cy ? 2 : 1]);
      }
    }
    const na = Math.round(area * (m.ash ?? 0) * 0.3);
    for (let i = 0; i < na; i++) {
      const [cx, cy] = at(i, 11), rx = 3 + Math.floor(hash01(i, 12, salt) * 5), ry = 2 + Math.floor(rx / 3);
      for (let y = cy - ry - 1; y <= cy + ry + 1; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d < 1) pc.set(x, y, d < 0.35 && y < cy ? P.ash[4] : d < 0.7 ? P.ash[3] : P.ash[2]);
        else if (d < 1.5 && y > cy) mul(pc, x, y, 0.75);
      }
    }
  } else if (m.kind === "wood") {
    const ns = Math.round(area * 0.5);
    for (let i = 0; i < ns; i++) {
      const [cx, cy] = at(i, 13), rx = 5 + Math.floor(hash01(i, 14, salt) * 7), ry = 2 + Math.floor(hash01(i, 15, salt) * 3);
      if (hash01(i, 16, salt) > 0.35) continue;
      for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (vn(x, y, 3, 2, salt + i) - 0.5) * 0.6;
        if (d < 1) mul(pc, x, y, d < 0.5 ? 0.78 : 0.88);
      }
    }
  }
}

/** Ковёр/дорожка: кайма, поле с ромбами, бахрома на коротких краях, толщина — тёмная нижняя кромка и тень. */
export function carpet(pc: PC, c: { x: number; y: number; w: number; h: number; r: Ramp; band: RGBA; fringe?: boolean }) {
  for (let y = c.y + c.h; y < c.y + c.h + 3; y++) for (let x = c.x + 1; x < c.x + c.w + 2; x++) mul(pc, x, y, 0.62 + (y - c.y - c.h) * 0.12);
  for (let y = c.y; y < c.y + c.h; y++) mul(pc, c.x + c.w, y, 0.7);
  for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) {
    const lx = x - c.x, ly = y - c.y, ex = Math.min(lx, c.w - 1 - lx), ey = Math.min(ly, c.h - 1 - ly), e = Math.min(ex, ey);
    let col: RGBA;
    if (e === 0) col = ly === c.h - 1 || lx === c.w - 1 ? c.r[0] : c.r[1];
    else if (e === 2 || e === 3) col = e === 2 ? c.band : shade(c.band, 0.8);
    else if (e === 1 || e === 4) col = c.r[1];
    else {
      const cx = (c.w - 1) / 2, ux = Math.abs(lx - cx), uy = ((ly - 5) % 14 + 14) % 14 - 7;
      const d = ux / Math.max(4, (c.w - 10) / 2) * 7 + Math.abs(uy);
      col = Math.abs(d - 5) < 0.7 ? c.band : d < 2.5 ? c.r[3] : (lx + ly) % 2 === 0 && Math.abs(d - 5) < 1.6 ? c.r[1] : c.r[2];
      col = mix(col, c.r[1], clamp((vn(x, y, 9, 7, 5) - 0.6) * 0.8));
    }
    if (ly === 1 && e >= 1) col = mix(col, c.r[3], 0.35);
    pc.set(x, y, col);
  }
  if (c.fringe) for (const yy of [c.y - 2, c.y + c.h]) for (let x = c.x + 1; x < c.x + c.w - 1; x += 2) { pc.set(x, yy, shade(c.band, 1.1)); pc.set(x, yy + 1, shade(c.band, 0.8)); }
}

/** Бордюр-торец помоста: кромка, грань из блоков или брус, тёмный низ; тень на нижний пол. */
export function daisFace(pc: PC, x0: number, x1: number, yb: number, h0: number, kind: "stone" | "wood", r: Ramp, trim?: RGBA) {
  // docs/art/perspective.md §1, §7: светлая кромка 3 px сверху и торец h px вниз
  const h = h0 + 3;
  for (let y = yb; y < yb + h; y++) for (let x = x0; x < x1; x++) {
    const ly = y - yb;
    let c: RGBA;
    if (ly === 0) c = r[4] ?? r[3];
    else if (ly === 1) c = trim ?? (r[4] ?? r[3]);
    else if (ly === 2) c = r[3];
    else if (ly === 3) c = r[1];
    else if (ly === h - 1) c = r[0];
    else if (kind === "stone") {
      const off = Math.floor((x - x0) / 24) % 2 ? 0 : 12, j = (x - x0 + off) % 24 === 0;
      c = j ? r[0] : (x - x0 + off) % 24 === 1 ? r[3] : dq(r, 2.2 - (ly / h) * 1.2 + (vn(x, y, 6, 3, 77) - 0.5) * 0.6, x, y);
    } else {
      const post = (x - x0) % 48 < 3;
      c = post ? dq(r, (x - x0) % 48 === 0 ? 3 : 1.6, x, y) : dq(r, 2.1 - (ly / h) * 1.1 + (vn(x, y * 3, 10, 1, 79) - 0.5) * 0.8, x, y);
    }
    pc.set(x, y, c);
  }
  // тень помоста на нижний пол: сверху вниз и чуть вправо (свет сверху-слева)
  const L = Math.max(8, h0 + 2);
  for (let y = yb + h; y < yb + h + L; y++) for (let x = x0 + 3; x < x1 + 6; x++) {
    const k = (y - yb - h) / L;
    if (x >= x1 && x - x1 > (1 - k) * 6) continue;
    mul(pc, x, y, y === yb + h ? 0.38 : lerp(0.5, 1, k ** 0.7));
  }
}
/** Боковая кромка помоста (видна только светлая губа и тень вправо). */
export function daisSide(pc: PC, x: number, y0: number, y1: number, r: Ramp, left: boolean) {
  for (let y = y0; y < y1; y++) {
    pc.set(x, y, left ? r[4] ?? r[3] : r[0]);
    if (!left) for (let i = 1; i <= 5; i++) mul(pc, x + i, y, lerp(0.55, 1, i / 5));
  }
}
/** Ступени: подступёнок (светлый нос сверху, тень снизу) и проступь. */
export function steps(pc: PC, cx: number, w: number, yb: number, h: number, n: number, r: Ramp, tread: (x: number, y: number) => RGBA) {
  const rise = 4, run = 4; n = Math.max(2, Math.round((h + 3) / 4));
  const x0 = cx - w / 2, x1 = cx + w / 2;
  let y = yb;
  for (let i = 0; i < n; i++) {
    for (let ly = 0; ly < rise; ly++) for (let x = x0; x < x1; x++) pc.set(x, y + ly, ly === 0 ? r[4] ?? r[3] : ly === rise - 1 ? r[0] : dq(r, 2 - ly * 0.3, x, y + ly));
    y += rise;
    if (i < n - 1) {
      for (let ly = 0; ly < run; ly++) for (let x = x0; x < x1; x++) { const c = tread(x, y + ly); pc.set(x, y + ly, ly === 0 ? mix(c, r[4] ?? r[3], 0.3) : c); }
      y += run;
    }
  }
  // торцы ступеней: левый светлый, правый тёмный, тень вправо
  for (let yy = yb; yy < y; yy++) { pc.set(x0, yy, r[3]); pc.set(x1 - 1, yy, r[0]); for (let i = 0; i < 4; i++) mul(pc, x1 + i, yy, lerp(0.6, 1, i / 4)); }
  for (let yy = y; yy < y + 5; yy++) for (let x = x0 + 1; x < x1 + 3; x++) mul(pc, x, yy, lerp(0.55, 1, (yy - y) / 5));
  return y;
}

function backWall(pc: PC, w: Wall, niche?: { x: number; w: number; glow?: RGBA }) {
  for (let y = 0; y < WALL_H; y++) for (let x = FX0; x < FX1; x++) {
    const fromTop = y / WALL_H;
    let c: RGBA;
    if (w.timber) {
      // штукатурка с фахверком: стойки и пояс из бруса
      const post = (x - FX0) % 96 < 6, beam = y >= 18 && y < 24;
      if (post || beam) c = dq(w.timber, (post ? ((x - FX0) % 96 === 0 ? 0 : (x - FX0) % 96 === 1 ? 2 : 1.4) : y === 18 ? 2 : y === 23 ? 0 : 1.3), x, y);
      else c = dq(w.r, 2.2 + (vn(x, y, 7, 6, 3) - 0.5) * 0.8 - (1 - fromTop) * 0.8, x, y);
    } else {
      const row = Math.floor(y / w.course), off = row % 2 ? Math.floor(w.block / 2) : 0, by = y % w.course, bx = (x - FX0 + off) % w.block;
      const tone = 2.3 + (hash01(Math.floor((x - FX0 + off) / w.block), row, 13) - 0.5) * 0.7;
      c = by === 0 || bx === 0 ? w.r[0] : by === 1 || bx === 1 ? w.r[3] : by === w.course - 1 ? w.r[1] : dq(w.r, tone + (vn(x, y, 5, 4, 11) - 0.5) * 0.6, x, y);
      c = shade(c, lerp(0.62, 1, fromTop ** 0.7));
    }
    pc.set(x, y, c);
  }
  if (w.trim) for (let x = FX0; x < FX1; x++) { pc.set(x, 14, w.trim); pc.set(x, 15, shade(w.trim, 0.7)); }
  // плинтус/цоколь стены
  const ph = w.plinthH;
  for (let y = WALL_H - ph; y < WALL_H; y++) for (let x = FX0; x < FX1; x++) {
    const ly = y - (WALL_H - ph);
    pc.set(x, y, ly === 0 ? w.plinth[0] : ly === 1 ? w.plinth[4] ?? w.plinth[3] : ly === ph - 1 ? w.plinth[0] : dq(w.plinth, 2.4 - ly * 0.25, x, y));
  }
  if (niche) {
    const { x, w: nw, glow } = niche, top = 10, bot = WALL_H + 14;
    for (let y = top; y < bot; y++) for (let xx = x; xx < x + nw; xx++) {
      const lx = xx - x, rr = nw / 2, arch = y - top < rr ? Math.hypot(lx - rr + 0.5, rr - (y - top)) > rr : false;
      if (arch) continue;
      const inside = y < WALL_H - 2 || lx > 2 && lx < nw - 3;
      if (!inside) continue;
      // глубина ниши: левая грань (в тени), правая (на свету), задняя — темнее, пол ниши уходит вглубь
      let c: RGBA;
      if (y >= WALL_H - 2) { const c0 = pc.get(xx, y)!; c = shade(c0, lerp(0.5, 0.85, (y - WALL_H + 2) / 16)); }
      else if (lx < 4) c = shade(w.r[1], 0.6);
      else if (lx > nw - 5) c = shade(w.r[2], 0.9);
      else c = shade(w.r[1], lerp(0.45, 0.7, (y - top) / (WALL_H - top)));
      if (glow && y < WALL_H - 2 && lx >= 4 && lx <= nw - 5) c = mix(c, glow, 0.25 * (1 - Math.abs(lx - rr) / rr));
      pc.set(xx, y, c);
    }
    for (let y = top; y < WALL_H; y++) { const lx0 = x, lx1 = x + nw - 1; if (y - top >= nw / 2) { pc.set(lx0 - 1, y, w.r[0]); pc.set(lx1 + 1, y, w.r[3]); } }
  }
  // тень задней стены на пол (свет сверху-слева) и контактная полоса
  for (let y = WALL_H; y < WALL_H + 18; y++) for (let x = FX0; x < FX1; x++) {
    if (niche && x >= niche.x && x < niche.x + niche.w && y < WALL_H + 14) continue;
    mul(pc, x, y, y === WALL_H ? 0.36 : lerp(0.5, 1, ((y - WALL_H) / 18) ** 0.65));
  }
}

function sideWalls(pc: PC, w: Wall) {
  // боковые стены: тень на пол (слева — шире, свет слева сверху даёт тень от левой стены), правая — узкая
  for (let y = FY0; y < FY1; y++) {
    for (let i = 0; i < 16; i++) mul(pc, FX0 + i, y, i === 0 ? 0.4 : lerp(0.52, 1, (i / 16) ** 0.65));
    for (let i = 0; i < 6; i++) mul(pc, FX1 - 1 - i, y, i === 0 ? 0.5 : lerp(0.72, 1, i / 6));
  }
  // торцы стен сверху (верх кладки) с внутренней гранью
  const cap = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pc.set(x, y, dq(w.cap, 1.6 + (vn(x, y, 12, 12, 21) - 0.5) * 0.6, x, y)); };
  cap(0, 0, SIDE, RH); cap(FX1, 0, RW, RH); cap(0, FY1, RW, RH);
  for (let y = 0; y < FY1; y++) { pc.set(SIDE - 1, y, w.cap[3]); pc.set(SIDE - 2, y, w.cap[2]); pc.set(FX1, y, w.cap[0]); }
  for (let x = SIDE - 1; x <= FX1; x++) { pc.set(x, FY1, w.cap[3]); pc.set(x, FY1 + 1, w.cap[2]); }
  // проём двери в передней стене
  const d0 = RW / 2 - 24, d1 = RW / 2 + 24;
  for (let y = FY1; y < RH; y++) for (let x = d0; x < d1; x++) pc.set(x, y, shade(pc.get(x, FY1 - 1)!, lerp(0.9, 0.55, (y - FY1) / FRONT)));
  for (let y = FY1; y < RH; y++) { pc.set(d0 - 1, y, w.cap[3]); pc.set(d1, y, w.cap[0]); }
}

/** Пыль и пепел у стен (мировые координаты зала, поверх тайлов). */
function wallDrift(pc: PC, amt: number, c: RGBA, seed: number) {
  for (let y = FY0; y < FY1; y++) for (let x = FX0; x < FX1; x++) {
    const e = Math.min(x - FX0, FX1 - 1 - x, y - FY0, (FY1 - 1 - y) * 2);
    const n = vn(x, y, 10, 8, seed) + vn(x, y, 4, 4, seed + 1) * 0.35;
    const k = n * amt * clamp(1.4 - e / 28);
    if (k > 0.55) blend(pc, x, y, c, k > 0.85 ? 0.5 : 0.28);
  }
}

/** Печать рейда: кольцо золотой мозаики с рунами и раскалённым швом. */
export function seal(pc: PC, cx: number, cy: number, rad: number) {
  for (let y = cy - rad - 4; y < cy + rad + 4; y++) for (let x = cx - rad * 1.4 - 4; x < cx + rad * 1.4 + 4; x++) {
    const dx = (x - cx) / 1.4, dy = y - cy, d = Math.hypot(dx, dy);
    if (d > rad + 1 || d < rad - 9) continue;
    const xi = Math.round(x);
    if (d > rad) { mul(pc, xi, y, 0.6); continue; }
    if (d > rad - 1.2 || d < rad - 7.8) { pc.set(xi, y, d > rad - 1.2 ? R.gold[1] : R.gold[0]); continue; }
    if (d > rad - 2.2 || d < rad - 6.8) { pc.set(xi, y, d > rad - 2.2 ? R.gold[3] : R.gold[1]); continue; }
    const a = Math.atan2(dy, dx), seg = Math.floor((a + Math.PI) / (Math.PI / 12));
    const rune = hash01(seg, Math.floor((d - rad + 7) * 1.4), 5) < 0.45;
    pc.set(xi, y, rune ? R.ember[(seg % 3) + 1] : (seg % 2 ? R.solInlay[1] : R.solInlay[0]));
  }
}

export function buildRoom(spec: RoomSpec, salt: number, night = false): PC {
  const pc = new PC(RW, RH);
  paintFloor(pc, spec.lower, FX0, FY0, FX1, FY1, salt, spec);
  decals(pc, spec.lower, FX0, FY0, FX1, FY1, salt);
  if (spec.band) {
    // кайма вдоль стен: мелкие тёмные плитки с золотой нитью
    for (let y = FY0; y < FY1; y++) for (let x = FX0; x < FX1; x++) {
      const e = Math.min(x - FX0, FX1 - 1 - x, y - FY0, FY1 - 1 - y);
      if (e > 9) continue;
      if (e === 9) pc.set(x, y, R.gold[2]);
      else if (e === 8) pc.set(x, y, R.gold[0]);
      else { const g = (x + y) % 8 === 0 || (x - y + 800) % 8 === 0; pc.set(x, y, g ? R.solInlay[0] : dq(R.solInlay, 1.6 + ((x >> 3) + (y >> 3)) % 2 * 0.6, x, y)); }
    }
  }
  if (spec.seal) seal(pc, RW / 2, FY0 + (FY1 - FY0) / 2 + 6, 64);
  let daisYb = 0;
  if (spec.dais) {
    const d = spec.dais, x0 = FX0 + d.x0 * S, x1 = FX0 + d.x1 * S, yb = FY0 + d.y1 * S;
    daisYb = yb;
    paintFloor(pc, spec.upper ?? spec.lower, x0, FY0, x1, yb, salt + 7, spec);
    decals(pc, spec.upper ?? spec.lower, x0, FY0, x1, yb, salt + 7);
    if (d.x0 > 0) daisSide(pc, x0, FY0, yb, d.faceR, true);
    if (FX0 + d.x1 * S < FX1) daisSide(pc, x1 - 1, FY0, yb, d.faceR, false);
    daisFace(pc, x0, x1, yb, d.h, d.face, d.faceR, d.trim);
  }
  for (const c of spec.carpet ?? []) carpet(pc, { ...c, x: FX0 + c.x, y: FY0 + c.y });
  if (spec.dais && spec.steps) {
    const st = spec.steps, cx = RW / 2;
    const m = MATS[spec.lower].m;
    const tr: Ramp = m.kind === "wood" || m.kind === "stone" ? m.r : R.solMarble;
    steps(pc, cx, st.w, daisYb, spec.dais.h, st.n, st.r, (x, y) => dq(tr, 3 - (y - daisYb) * 0.05 + (vn(x, y, 6, 3, 31) - 0.5) * 0.5, x, y));
  }
  if (spec.dust) wallDrift(pc, spec.dust, R.dust, 51 + salt);
  if (spec.ash) wallDrift(pc, spec.ash, P.ash[3], 61 + salt);
  const w = WALLS[spec.wall];
  backWall(pc, w, spec.niche ? { x: FX0 + spec.niche.x, w: spec.niche.w, glow: spec.niche.glow } : undefined);
  const umbStyle = spec.wall === "umb" || spec.wall === "umbwood";
  for (const wx of spec.windows ?? []) windowLight(pc, FX0 + wx, WALL_H - w.plinthH, 18, 34, w.cap.length > 4 ? w.cap : [...w.cap, w.cap[3]], umbStyle ? [120, 80, 200, 255] : [255, 226, 160, 255], FY1, umbStyle ? 0.3 : 0.5);
  sideWalls(pc, w);
  const L: Light[] = [];
  spec.props?.(pc, L);
  applyLights(pc, L, night);
  if (night) pc.map((c) => (c[3] ? [Math.round(c[0] * 0.55), Math.round(c[1] * 0.58), Math.round(c[2] * 0.75), c[3]] : c));
  return pc;
}

const Y = (tiles: number) => FY0 + tiles * S; // ряд пола в px зала
export const ROOMS: RoomSpec[] = [
  { id: "sol_church", title: "Храм Аурелиона", wall: "sol", lower: "sol", upper: "mosaic", band: true, windows: [24, 104, 296, 376],
    dais: { x0: 3, x1: 10, y1: 2, face: "stone", faceR: R.solMarble, h: 12, trim: R.gold[2] }, steps: { w: 72, n: 3, r: R.solMarble },
    medallion: { cx: 3.5, cy: 1, rad: 1.3 },
    carpet: [{ x: 208 - 18, y: 2 * S + 20, w: 36, h: 4 * S + 22, r: P.cloth.red, band: R.gold[2] }],
    props: (pc, L) => {
      altar(pc, 196, Y(1) + 14, 56, PR.marble, PR.red, R.gold[2]); candles(pc, 166, Y(1) + 18, L); candles(pc, 282, Y(1) + 18, L);
      for (const yb of [Y(4) + 4, Y(5) + 12]) { bench(pc, 54, yb, 108); bench(pc, 286, yb, 108); }
      column(pc, 40, Y(7) - 2, PR.marble, 56); column(pc, 408, Y(7) - 2, PR.marble, 56);
    } },
  { id: "umb_ziggurat", title: "Зиккурат Мортхейма", wall: "umb", lower: "umb", upper: "raid",
    dais: { x0: 2, x1: 11, y1: 2, face: "stone", faceR: R.basalt, h: 12, trim: R.violet[1] }, steps: { w: 80, n: 3, r: R.basalt },
    niche: { x: 208 - 16, w: 32, glow: R.violet[2] },
    carpet: [{ x: 208 - 14, y: 2 * S + 20, w: 28, h: 4 * S + 22, r: P.cloth.purple, band: R.violet[1] }],
    props: (pc, L) => {
      altar(pc, 196, Y(1) + 14, 56, PR.basalt, PR.purple, R.violet[1]); brazier(pc, 112, Y(1) + 20, L, true); brazier(pc, 336, Y(1) + 20, L, true);
      column(pc, 44, Y(6) + 10, PR.basalt, 60); column(pc, 404, Y(6) + 10, PR.basalt, 60); bonePile(pc, 300, Y(5)); bonePile(pc, 130, Y(6) + 6);
      brazier(pc, 110, Y(5) + 20, L); brazier(pc, 338, Y(5) + 20, L);
    } },
  { id: "dg_cathedral", title: "Пепельные чертоги: собор", wall: "dungeon", lower: "cathedral", upper: "sol", dust: 0.5, windows: [40, 120, 280, 360],
    dais: { x0: 0, x1: 13, y1: 1, face: "stone", faceR: R.cathedral, h: 8 }, steps: { w: 96, n: 2, r: R.cathedral },
    props: (pc, L) => {
      candles(pc, 208, Y(1) - 4, L, false); sarcophagus(pc, 40, Y(4), PR.stone); sarcophagus(pc, 356, Y(4), PR.stone);
      column(pc, 136, Y(7) - 4, PR.stone, 56); column(pc, 312, Y(7) - 4, PR.stone, 56); brazier(pc, 80, Y(6), L); brazier(pc, 368, Y(6), L);
    } },
  { id: "dg_transition", title: "Пепельные чертоги: переход", wall: "dungeon", lower: "cracked", dust: 0.6, ash: 0.4, windows: [180],
    props: (pc, L) => {
      column(pc, 60, Y(6), PR.stone, 30); crate(pc, 330, Y(3)); crate(pc, 350, Y(3) + 10, 14); bonePile(pc, 250, Y(5)); bonePile(pc, 90, Y(3));
      brazier(pc, 208, Y(4), L);
    } },
  { id: "dg_ashen", title: "Пепельные чертоги: пепельный склеп", wall: "crypt", lower: "ashen", upper: "cathedral", ash: 0.8,
    dais: { x0: 4, x1: 9, y1: 2, face: "stone", faceR: R.basalt, h: 8 }, steps: { w: 48, n: 2, r: R.basalt }, niche: { x: 2 * S, w: 28, glow: R.ember[2] },
    props: (pc, L) => {
      sarcophagus(pc, 186, Y(2) - 8, PR.basalt); brazier(pc, 96, Y(5), L); brazier(pc, 336, Y(5), L);
      bonePile(pc, 300, Y(3)); bonePile(pc, 60, Y(6)); bonePile(pc, 180, Y(6) + 10);
    } },
  { id: "crypt", title: "Склеп", wall: "crypt", lower: "crypt", dust: 1.0, niche: { x: 9 * S, w: 28 },
    dais: { x0: 0, x1: 4, y1: 2, face: "stone", faceR: R.crypt, h: 8 },
    props: (pc, L) => {
      sarcophagus(pc, 36, Y(2) - 8, PR.stone); sarcophagus(pc, 250, Y(4), PR.stone, 60); candles(pc, 200, Y(3), L, false); candles(pc, 340, Y(3), L, false);
      bonePile(pc, 120, Y(6)); bonePile(pc, 360, Y(6) + 4); crate(pc, 60, Y(7) - 4, 16);
    } },
  { id: "raid", title: "Рейд: Цитадель Хаоса", wall: "raid", lower: "raid", seal: true, ash: 0.3,
    props: (pc, L) => {
      brazier(pc, 72, Y(2), L); brazier(pc, 376, Y(2), L); brazier(pc, 72, Y(7), L); brazier(pc, 376, Y(7), L);
      column(pc, 140, Y(2) + 10, PR.basalt, 50); column(pc, 308, Y(2) + 10, PR.basalt, 50);
    } },
  { id: "tavern", title: "Таверна Эмберхолла", wall: "ember", lower: "flag", upper: "oak", windows: [40, 330],
    dais: { x0: 0, x1: 13, y1: 4, face: "stone", faceR: R.flag, h: 8 }, steps: { w: 56, n: 2, r: R.flag },
    carpet: [{ x: 4 * S + 16, y: 1 * S + 4, w: 4 * S, h: 2 * S - 8, r: P.cloth.red, band: hex("#c89a3a"), fringe: true }],
    props: (pc, L) => {
      for (const tx of [50, 320]) { bench(pc, tx - 2, Y(1) + 10, 48); table(pc, tx, Y(2) + 10); bench(pc, tx - 2, Y(3) + 4, 48); candles(pc, tx + 22, Y(2) - 6, L); }
      barrel(pc, 395, Y(6)); barrel(pc, 380, Y(6) + 14); crate(pc, 40, Y(7) - 6); brazier(pc, 120, Y(6), L);
    } },
  { id: "house", title: "Дом (старые доски)", wall: "ember", lower: "oldwood", upper: "oak", dust: 0.3, niche: { x: 1 * S, w: 40 }, windows: [230],
    dais: { x0: 0, x1: 4, y1: 3, face: "stone", faceR: R.flag, h: 8 },
    carpet: [{ x: 6 * S, y: 3 * S, w: 3 * S, h: 2 * S + 8, r: P.cloth.green, band: hex("#b08848"), fringe: true }],
    props: (pc, L) => { bed(pc, 70, Y(2) + 20); table(pc, 300, Y(5)); bench(pc, 298, Y(6), 48); candles(pc, 322, Y(4) - 2, L, false); crate(pc, 380, Y(2)); barrel(pc, 400, Y(3)); } },
  { id: "shop", title: "Лавка (свежая сосна)", wall: "ember", lower: "pine", upper: "oak", windows: [60, 150],
    dais: { x0: 8, x1: 13, y1: 2, face: "stone", faceR: R.flag, h: 8 },
    carpet: [{ x: 1 * S, y: 3 * S + 8, w: 5 * S, h: 3 * S, r: P.cloth.blue, band: hex("#c8a050"), fringe: true }],
    props: (pc, L) => { counter(pc, 284, Y(2) - 6, 136); candles(pc, 300, Y(1) + 6, L); barrel(pc, 270, Y(5)); barrel(pc, 290, Y(5) + 12); crate(pc, 360, Y(5)); crate(pc, 380, Y(5) + 12, 14); crate(pc, 40, Y(1)); } },
  { id: "umb_house", title: "Дом Умбрата (морёное дерево)", wall: "umbwood", lower: "stained", upper: "umb",
    dais: { x0: 4, x1: 9, y1: 2, face: "stone", faceR: R.basalt, h: 8, trim: R.violet[1] }, steps: { w: 48, n: 2, r: R.basalt },
    carpet: [{ x: 208 - 16, y: 3 * S, w: 32, h: 4 * S, r: P.cloth.purple, band: R.violet[1] }],
    props: (pc, L) => { altar(pc, 196, Y(1) + 14, 56, PR.basalt, PR.purple, R.violet[1]); table(pc, 60, Y(4)); bench(pc, 58, Y(5), 48); brazier(pc, 380, Y(4), L, true); brazier(pc, 150, Y(1) + 20, L, true); crate(pc, 370, Y(7) - 4); } },
  { id: "sanctuary", title: "Святилище (мозаика)", wall: "sol", lower: "mosaic", medallion: { cx: 6.5, cy: 3.6, rad: 2.6 }, windows: [60, 340],
    props: (pc, L) => {
      for (const [x, y] of [[120, Y(2)], [296, Y(2)], [120, Y(6)], [296, Y(6)]]) candles(pc, x, y, L);
      column(pc, 40, Y(3), PR.marble, 50); column(pc, 408, Y(3), PR.marble, 50);
    } },
];

/** Лист вариантов: по 4 тайла каждого материала ×3 и заплатка 4×3 тайла из случайных вариантов ×2. */
function tilesSheet(): PC {
  const keys = Object.keys(MATS), K = 3, rowH = S * K + 8;
  const out = new PC(4 * (S * K + 4) + 4 * S * 2 + 24, keys.length * rowH + 4);
  out.rect(0, 0, out.w, out.h, hex("#14121a"));
  keys.forEach((key, j) => {
    for (let v = 0; v < 4; v++) {
      const t = tileOf(key, v);
      for (let y = 0; y < S * K; y++) for (let x = 0; x < S * K; x++) out.set(4 + v * (S * K + 4) + x, 4 + j * rowH + y, t.get(Math.floor(x / K), Math.floor(y / K))!);
    }
    const px = 4 * (S * K + 4) + 16;
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 4; tx++) {
      const t = tileOf(key, Math.floor(hash01(tx, ty, j + 5) * 4));
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) {
        const yy = 4 + j * rowH + (ty * S + y) * 2 + k;
        if (yy < 4 + j * rowH + S * K) out.set(px + (tx * S + x) * 2 + l, yy, t.get(x, y)!);
      }
    }
  });
  return out;
}

function main() {
  const names: Record<string, string> = {};
  ROOMS.forEach((r, i) => { buildRoom(r, i + 1).save(path.join(OUT, "new", `${r.id}.png`)); names[r.id] = r.title; });
  tilesSheet().save(path.join(OUT, "tiles.png"));
  for (const k of Object.keys(MATS)) for (let v = 0; v < 4; v++) tileOf(k, v).save(path.join(OUT, "tiles", `${k}_${v}.png`));
  console.log(`полы: ${ROOMS.length} залов, ${Object.keys(MATS).length} материалов × 4 варианта → ${OUT}`);
}
if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("tools", "gen", "floors.ts"))) main();
