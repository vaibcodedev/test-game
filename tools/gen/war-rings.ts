/** Кольца захвата «Знамён Предела» (задача 132, шаг 14, отзыв пользователя: «реально красивые»): три варианта границы круга
 *  в пиксельном стиле 3/4 (свет сверху слева, контур OUT, контактная тень), каждый — два слоя: основа (камень, металл, выжженные линии)
 *  и маска свечения (белая; клиент красит её в цвет владельца, режим ADD, «дыхание» и блик по кругу).
 *    A «Рунный бордюр» — тёсаный камень блоками с высеченными рунами, видна передняя грань бордюра;
 *    B «Кованая вставка» — бронзовая полоса заподлицо с землёй, заклёпки и накладки, светится канавка;
 *    C «Магический круг» — двойная выжженная линия, пояс рун и вписанная гексаграмма.
 *  Запуск: npx tsx tools/gen/war-rings.ts → tools/out/banners-event/v2-ring-options.png (×1 и ×3 рядом, на земле Полей, нейтральное
 *  и в цветах фракций). В игру — выбранный (RING_PICK) через writeWarRingsGame: vfx war-ring, war-ring-glow, war-ring-sheen. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, hash01, hex, mix, type RGBA, type Ramp } from "./canvas";
import { OUT } from "./walls141-lib";
import { STONE, IRON } from "./volume-lib";
import { paintGround, label, scaleNN, crop } from "./standards";
import WAR from "../../data/faction-war.json";

export const RING_PICK: Variant = "D";
type Variant = "A" | "B" | "C" | "D";
const R = WAR.capture.radius * 32;
const PAD = 28;
const S = 2 * (R + PAD);
const C0 = S / 2;
const TAU = Math.PI * 2;
const BRONZE: Ramp = ["#2a160c", "#4e2c14", "#7a4a1e", "#a8702c", "#d6a050", "#f4d48c"].map((c) => hex(c));
const tone = (r: Ramp, i: number): RGBA => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
const W = (a: number) => [255, 255, 255, Math.max(0, Math.min(255, Math.round(a)))] as RGBA;

/** Руны 5×7: 1 — штрих. Восемь знаков, выбираются по номеру блока. */
const RUNES = [
  ["..#..", ".###.", "#.#.#", "..#..", "..#..", ".#.#.", "#...#"],
  ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
  ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  ["..#..", "..#..", "#####", "..#..", ".###.", "#.#.#", "..#.."],
  ["#...#", "##.##", "#.#.#", "#...#", "#.#.#", "##.##", "#...#"],
  [".###.", "#...#", "..#..", ".#.#.", "#...#", "#...#", "#####"],
  ["#.#.#", "#.#.#", ".###.", "..#..", ".###.", "#.#.#", "#.#.#"],
  ["..#..", ".#.#.", "#...#", "#####", "#...#", ".#.#.", "..#.."],
];
const rune = (k: number, gx: number, gy: number) => gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && RUNES[k % RUNES.length][gy][gx] === "#";

interface Layers { base: PC; glow: PC }

/** Полярный обход: f(x, y, r, a) для каждой точки квадрата холста. */
function each(f: (x: number, y: number, r: number, a: number) => void) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - C0, dy = y + 0.5 - C0, r = Math.hypot(dx, dy);
    if (r < R - 140 && r > 40) continue;
    f(x, y, r, (Math.atan2(dy, dx) + TAU) % TAU);
  }
}
/** Свет сверху слева по экранной нормали (nx, ny) → смещение тона. */
const lit = (nx: number, ny: number) => -(nx * 0.55 + ny * 0.65);

/** Передняя грань (3/4): под верхом бордюра вниз на h px — тёмные тона, затем контактная тень и контур. */
function extrude(pc: PC, top: Uint8Array, h: number, side: Ramp) {
  const out = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (top[y * S + x]) continue;
    for (let t = 1; t <= h; t++) {
      if (y - t < 0 || !top[(y - t) * S + x]) continue;
      out[y * S + x] = 1;
      pc.set(x, y, tone(side, t === h ? 0 : 1 + (hash01(x, y, 7) < 0.15 ? 1 : 0)));
      break;
    }
  }
  // контактная тень под гранью: 2 px вниз-вправо
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (top[y * S + x] || out[y * S + x]) continue;
    const above = (dx: number, dy: number) => { const X = x - dx, Y = y - dy; return X >= 0 && Y >= 0 && (top[Y * S + X] || out[Y * S + X]); };
    if (above(0, 1) || above(1, 1)) pc.set(x, y, [10, 6, 16, 110]);
    else if (above(1, 2) || above(2, 2)) pc.set(x, y, [10, 6, 16, 55]);
  }
}

function variantA(): Layers {
  const base = new PC(S, S), glow = new PC(S, S), top = new Uint8Array(S * S);
  const rIn = R - 10, rOut = R + 10, n = Math.round((TAU * R) / 34), blockA = TAU / n;
  each((x, y, r, a) => {
    if (r < rIn || r > rOut) return;
    const k = Math.floor(a / blockA), u = a / blockA - k, along = Math.min(u, 1 - u) * blockA * r;
    const v = (r - rIn) / (rOut - rIn);
    top[y * S + x] = 1;
    if (along < 1) { base.set(x, y, tone(STONE, 0)); return; } // шов
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const nr = (v - 0.5) * 1.1; // скруглённый верх бордюра: нормаль наклонена наружу/внутрь
    let L = 2.6 + lit(nr * cosA, nr * sinA) * 2.2 + (hash01(k, 3, 11) - 0.5) * 0.9 + (hash01(x >> 1, y >> 1, k) - 0.5) * 0.7;
    // фаска блока: светлая сторона — к свету, тёмная — от
    if (along < 3) L += (u < 0.5 ? 1 : -1) * lit(-sinA, cosA) * 0.9;
    if (v < 0.09 || v > 0.91) L -= 0.5;
    // выбоины и трещины
    if (hash01(x, y, k * 7 + 1) < 0.012) L -= 1.3;
    // руна (знак 5×7, пиксель знака — 2×2) — на каждом втором блоке, вдоль окружности
    if (k % 2 === 0) {
      const t = (a - (k + 0.5) * blockA) * R, gx = Math.floor(t / 2 + 2.5), gy = Math.floor(-(r - R) / 2 + 3.5), q = k / 2;
      if (rune(q, gx, gy)) { base.set(x, y, tone(STONE, 0)); glow.set(x, y, W(255)); return; }
      if (rune(q, Math.floor((t - 1) / 2 + 2.5), gy) || rune(q, gx, Math.floor((-(r - R) - 1) / 2 + 3.5))) L += 0.9; // светлый край канавки
    }
    base.set(x, y, tone(STONE, L));
  });
  extrude(base, top, 5, STONE);
  base.outline(OUT);
  // ореол рун и тонкая светящаяся кромка изнутри
  halo(glow, 2, 70);
  // светящаяся канавка внутри бордюра: прорезь в земле 2 px с перемычками у швов
  each((x, y, r, a) => {
    if (r < rIn - 5 || r >= rIn - 2) return;
    const u = (a / blockA) % 1, along = Math.min(u, 1 - u) * blockA * r;
    if (along < 3) return;
    base.set(x, y, r < rIn - 4 ? tone(STONE, 1) : [16, 10, 14, 230]);
    if (r >= rIn - 4) glow.set(x, y, W(200));
  });
  halo(glow, 1, 60);
  return { base, glow };
}

function variantB(): Layers {
  const base = new PC(S, S), glow = new PC(S, S), top = new Uint8Array(S * S);
  const rIn = R - 5, rOut = R + 5, plates = 36, plateA = TAU / plates;
  each((x, y, r, a) => {
    const k = Math.floor(a / plateA), u = a / plateA - k, along = Math.abs(u - 0.5) * plateA * R;
    const plate = along < 9;
    const ri = plate ? R - 9 : rIn, ro = plate ? R + 9 : rOut;
    if (r < ri - 2 || r > ro + 2) return;
    if (r < ri || r > ro) { base.set(x, y, [16, 10, 14, 200]); return; } // прорезь в земле
    top[y * S + x] = 1;
    const cosA = Math.cos(a), sinA = Math.sin(a), v = (r - ri) / (ro - ri), nr = (v - 0.5) * 1.6;
    let L = 2.6 + lit(nr * cosA, nr * sinA) * 2.4 + (hash01(x >> 1, y >> 1, 5) - 0.5) * 0.5;
    const ramp = plate ? IRON : BRONZE;
    // заклёпки: по оси полосы каждые 20 px, на накладке — две
    const t = a * R, rv = Math.round(t / 20) * 20, dt = t - rv, dn = r - R;
    const riv = plate ? [[-5, -4], [5, 4], [-5, 4], [5, -4]].some(([p, q]) => Math.hypot(along * Math.sign(u - 0.5) - p, dn - q) < 1.8)
      : Math.hypot(dt, dn) < 1.6;
    if (riv) L = 4.6 - (dt + dn > 0.5 ? 1.6 : 0);
    // светящаяся канавка вдоль оси полосы (не на накладках)
    if (!plate && Math.abs(dn) < 0.8 && Math.abs(dt) > 3) { base.set(x, y, tone(BRONZE, 0)); glow.set(x, y, W(255)); return; }
    // самоцвет в центре накладки
    if (plate && Math.hypot(along, dn) < 2.6) { base.set(x, y, tone(IRON, 1)); glow.set(x, y, W(230)); return; }
    base.set(x, y, tone(ramp, L));
  });
  extrude(base, top, 1, BRONZE);
  base.outline(OUT);
  halo(glow, 2, 60);
  return { base, glow };
}

function variantC(): Layers {
  const base = new PC(S, S), glow = new PC(S, S);
  const BURN: RGBA = [24, 14, 18, 190];
  const r1 = R, r2 = R - 16, r3 = Math.round(R * 0.52);
  // вписанная гексаграмма (две треугольника на r2) и внутренний круг
  const tri = (rot: number) => [0, 1, 2].map((i) => [C0 + Math.cos(rot + (i * TAU) / 3) * r2, C0 + Math.sin(rot + (i * TAU) / 3) * r2] as [number, number]);
  const segs: [number, number, number, number][] = [];
  for (const T of [tri(-Math.PI / 2), tri(Math.PI / 2)]) for (let i = 0; i < 3; i++) segs.push([T[i][0], T[i][1], T[(i + 1) % 3][0], T[(i + 1) % 3][1]]);
  const segD = (x: number, y: number) => Math.min(...segs.map(([ax, ay, bx, by]) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - C0, dy = y + 0.5 - C0, r = Math.hypot(dx, dy), a = (Math.atan2(dy, dx) + TAU) % TAU;
    let g = 0, b = false;
    if (Math.abs(r - r1) < 1.2 || Math.abs(r - r2) < 1.2) { g = 255; b = true; }
    else if (Math.abs(r - r1 - 4) < 0.6 || Math.abs(r - r3) < 0.8) { g = 150; b = true; }
    else if (r > r2 + 2 && r < r1 - 2) {
      const t = a * (R - 8), k = Math.floor(t / 11), gx = Math.floor(t - k * 11 - 3), gy = Math.floor(-(r - (R - 8)) + 3.5);
      if (rune(k, gx, gy)) { g = 220; b = true; }
    } else if (r < r2 - 1 && segD(x + 0.5, y + 0.5) < 1.0) { g = 120; b = true; }
    if (b) { base.set(x, y, BURN); glow.set(x, y, W(g)); }
  }
  halo(glow, 2, 55);
  return { base, glow };
}

/** D: рунный бордюр (A) и внутри — светящийся пояс рун между двумя тонкими линиями (как C): камень даёт объём, пояс — магию. */
function variantD(): Layers {
  const { base, glow } = variantA();
  const r1 = R - 14, r2 = R - 30, mid = (r1 + r2) / 2;
  each((x, y, r, a) => {
    if (r > r1 + 1.5 || r < r2 - 1.5) return;
    let g = 0;
    if (Math.abs(r - r1) < 1 || Math.abs(r - r2) < 1) g = 190;
    else {
      const t = a * mid, k = Math.floor(t / 14), gx = Math.floor((t - k * 14 - 2) / 2), gy = Math.floor(-(r - mid) / 2 + 3.5);
      if (rune(k + 3, gx, gy)) g = 255;
      else if (Math.abs(t - k * 14 - 12.5) < 0.6 && Math.abs(r - mid) < 3) g = 120; // точка-разделитель
    }
    if (!g) { if (r < r1 - 1 && r > r2 + 1) base.set(x, y, [20, 12, 16, 70]); return; } // выжженная полоса пояса
    base.set(x, y, [26, 16, 20, 200]);
    glow.set(x, y, W(Math.max(g, glow.get(x, y)?.[3] ?? 0)));
  });
  halo(glow, 2, 55);
  return { base, glow };
}

/** Мягкий ореол маски на d px (альфа a у штриха, к краю — меньше). */
function halo(m: PC, d: number, a: number) {
  const src = m.clone();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if ((src.get(x, y)?.[3] ?? 0) > 0) continue;
    let best = 0;
    for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) {
      const q = src.get(x + i, y + j);
      if (q && q[3] > 0) best = Math.max(best, a * (1 - Math.hypot(i, j) / (d + 1)));
    }
    if (best > 1) m.set(x, y, W(best));
  }
}

const BUILD: Record<Variant, () => Layers> = { A: variantA, B: variantB, C: variantC, D: variantD };
const TITLE: Record<Variant, string> = { A: "1 РУННЫЙ БОРДЮР", B: "2 КОВАНАЯ ВСТАВКА", C: "3 МАГИЧЕСКИЙ КРУГ", D: "4 БОРДЮР И ПОЯС РУН (1+3)" };

/** Блик: короткая дуга кольца (около 40°) с мягкими концами — клиент вращает её по кругу (режим ADD). */
function sheen(): PC {
  const pc = new PC(S, S);
  each((x, y, r, a) => {
    const d = Math.abs(r - R);
    if (d > 14) return;
    const da = Math.min(Math.abs(a - Math.PI * 1.5), TAU - Math.abs(a - Math.PI * 1.5));
    if (da > 0.36) return;
    const k = Math.pow(Math.cos((da / 0.36) * Math.PI * 0.5), 2) * Math.pow(1 - d / 14, 1.6);
    pc.set(x, y, W(255 * k));
  });
  return pc;
}

/** Наложение маски цветом (как ADD в игре). */
function tinted(dst: PC, glow: PC, col: RGBA, k: number) {
  for (let y = 0; y < glow.h; y++) for (let x = 0; x < glow.w; x++) {
    const g = glow.get(x, y);
    if (!g || !g[3]) continue;
    const d = dst.get(x, y) ?? [0, 0, 0, 255], f = (g[3] / 255) * k;
    dst.set(x, y, [Math.min(255, d[0] + col[0] * f), Math.min(255, d[1] + col[1] * f), Math.min(255, d[2] + col[2] * f), 255]);
  }
}

export function writeWarRingsGame(assetsRoot: string): string[] {
  const dir = path.join(assetsRoot, "vfx"), mf = path.join(dir, "manifest.json");
  let m: Record<string, unknown> = {};
  try { m = JSON.parse(fs.readFileSync(mf, "utf8")); } catch { /* нет манифеста */ }
  const L = BUILD[RING_PICK]();
  const put = (id: string, pc: PC) => { pc.save(path.join(dir, `${id}.png`)); m[id] = { frameW: S, frameH: S, frames: 1, fps: 1, anchor: [0.5, 0.5], blend: "normal" }; };
  put("war-ring", L.base);
  put("war-ring-glow", L.glow);
  put("war-ring-sheen", sheen());
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(mf, JSON.stringify(sorted, null, 1) + "\n");
  return ["war-ring", "war-ring-glow", "war-ring-sheen"];
}

function compare(file: string) {
  const SOL = hex("#ffc850"), UMB = hex("#b890ff");
  const VW = 360, VH = 230, Z = 3, ZW = 120, ZH = 78;
  const rows: PC[] = [];
  const head = new PC(4 * (VW + 12) + 12, 40);
  head.rect(0, 0, head.w, head.h, [22, 19, 26, 255]);
  label(head, "КОЛЬЦА ЗАХВАТА: 4 ВАРИАНТА. X1 НЕЙТРАЛЬНОЕ / СОЛЬГАРД / УМБРАТ, СПРАВА X3 (СОЛЬГАРД)", 12, 12, [236, 230, 244, 255], 2);
  rows.push(head);
  for (const v of ["A", "B", "C", "D"] as Variant[]) {
    const L = BUILD[v]();
    // окно: нижне-левая часть кольца (видна передняя грань), центр окна — точка кольца на 120°
    const ax = Math.round(C0 + Math.cos((2 * Math.PI) / 3) * R), ay = Math.round(C0 + Math.sin((2 * Math.PI) / 3) * R);
    const view = (col: RGBA | null, k: number) => {
      const g = new PC(S, S);
      paintGround(g, Math.max(0, ax - VW), Math.max(0, ay - VH), VW * 2, VH * 2, "dirt");
      g.blit(L.base, 0, 0);
      if (col) tinted(g, L.glow, col, k); else tinted(g, L.glow, [150, 140, 160, 255], 0.35);
      return crop(g, ax - VW / 2, ay - VH / 2, VW, VH);
    };
    const row = new PC(4 * (VW + 12) + 12, VH + 34);
    row.rect(0, 0, row.w, row.h, [22, 19, 26, 255]);
    label(row, TITLE[v] + (v === RING_PICK ? " - ВЫБРАН" : ""), 12, 6, v === RING_PICK ? [255, 216, 74, 255] : [236, 230, 244, 255], 2);
    row.blit(view(null, 0), 12, 28);
    row.blit(view(SOL, 0.85), 12 + (VW + 12), 28);
    row.blit(view(UMB, 0.85), 12 + 2 * (VW + 12), 28);
    const z = scaleNN(crop(view(SOL, 0.85), (VW - ZW) / 2, (VH - ZH) / 2, ZW, ZH), Z);
    row.blit(z, 12 + 3 * (VW + 12), 28);
    rows.push(row);
  }
  const out = new PC(rows[0].w, rows.reduce((s, r) => s + r.h, 0));
  let y = 0; for (const r of rows) { out.blit(r, 0, y); y += r.h; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  out.save(file);
  void mix;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  compare(path.join(root, "tools/out/banners-event/v2-ring-options.png"));
  if (process.argv.includes("--game")) console.log("кольцо:", writeWarRingsGame(path.join(root, "client/public/assets")).join(", "));
  console.log("tools/out/banners-event/v2-ring-options.png");
}
