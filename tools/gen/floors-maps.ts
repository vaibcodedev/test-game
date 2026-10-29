/**
 * ВРЕМЕННО (до утверждения, флаг __floorsV2): пол данжа «Пепельные чертоги» и зала рейда одной картинкой на всю карту — без сетки тайлов.
 * Крупные неровные плиты разного размера (ряды 14–28 px, плиты 16–60 px), швы с разрывами, граница материалов — по шуму вершин карты,
 * лавовые трещины и тлеющие пятна с отсветом на соседние плиты, пятна света от жаровен, тень у основания стен.
 * Слой свечения (_emit) клиент кладёт сложением поверх затемнения ночи.
 * Пишет client/public/assets/floors-v2/{dungeon,raid}_floor.png и _emit.png. Запуск: npx tsx tools/gen/floors-maps.ts (под замком).
 */
import path from "node:path";
import { PC, hash01, mix, ramp, type RGBA, type Ramp } from "./canvas";
import { R, vn, dq, crack, bone, skull } from "./floors";
import { P } from "./palette";
import { T, CELL_WALL, type WorldMap } from "../../shared/map";
import { generateDungeonMap } from "../../shared/dungeon";
import { generateRaidMap } from "../../shared/raid";

const S = 32, OUT = path.resolve("client/public/assets/floors-v2");
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** Запись пикселя без смешивания (слой свечения). */
const put = (pc: PC, x: number, y: number, c: RGBA) => { const i = (y * pc.w + x) * 4; pc.data[i] = c[0]; pc.data[i + 1] = c[1]; pc.data[i + 2] = c[2]; pc.data[i + 3] = c[3]; };

interface FMat { r: Ramp; base: number; spread: number; noise: number; checker?: number; diamond?: boolean; cracks: number; lava: number; smolder: number; ash: number; dust: number; moss: number; bones: number; scorch: number; worn?: number; gloss?: number }
const FM: Record<string, FMat> = {
  cathedral: { r: R.cathedral, base: 2.55, spread: 0.25, noise: 0.35, checker: 0.75, diamond: true, cracks: 0.25, lava: 0, smolder: 0, ash: 0, dust: 0.35, moss: 0.25, bones: 0, scorch: 0, worn: 0.25 },
  cracked: { r: R.cathedral, base: 2.35, spread: 0.35, noise: 0.45, checker: 0.35, cracks: 0.7, lava: 0.55, smolder: 0.25, ash: 0.2, dust: 0.3, moss: 0.15, bones: 0.05, scorch: 0.6 },
  ashen: { r: R.basalt, base: 2.45, spread: 0.35, noise: 0.45, cracks: 0.55, lava: 0.45, smolder: 0.35, ash: 0.45, dust: 0, moss: 0, bones: 0.12, scorch: 0.3 },
  worn: { r: ramp("#141118", "#28222e", "#3a3242", "#4e4456", "#665a6e"), base: 2.7, spread: 0.2, noise: 0.3, cracks: 0.2, lava: 0.1, smolder: 0.05, ash: 0.08, dust: 0, moss: 0, bones: 0, scorch: 0, worn: 0.7, gloss: 0.4 },
  raid: { r: R.obsidian, base: 2.45, spread: 0.3, noise: 0.35, cracks: 0.45, lava: 0.6, smolder: 0.2, ash: 0.15, dust: 0, moss: 0, bones: 0.03, scorch: 0.25, gloss: 0.8 },
  ashfloor: { r: P.ash, base: 2.4, spread: 0.35, noise: 0.5, cracks: 0.4, lava: 0.35, smolder: 0.5, ash: 0.7, dust: 0, moss: 0, bones: 0.08, scorch: 0.4 },
  seal: { r: ramp("#1c1820", "#363038", "#524a50", "#6e6468", "#8c8084"), base: 2.5, spread: 0.3, noise: 0.4, cracks: 0.3, lava: 0.3, smolder: 0.1, ash: 0.15, dust: 0, moss: 0, bones: 0, scorch: 0.2 },
  crypt: { r: R.crypt, base: 2.4, spread: 0.4, noise: 0.45, cracks: 0.5, lava: 0, smolder: 0, ash: 0, dust: 0.6, moss: 0.4, bones: 0.2, scorch: 0 },
};
const MAT_OF: Record<number, string> = { [T.Marble]: "cathedral", [T.CrackedMarble]: "cracked", [T.Basalt]: "ashen", [T.Worn]: "worn", [T.Obsidian]: "raid", [T.Ash]: "ashfloor", [T.Cobble]: "seal", [T.Floor]: "crypt" };
export const LIGHTS: Record<string, [number, RGBA, number]> = {
  dg_brazier_a: [96, [255, 160, 70, 255], 0.75], dg_brazier_b: [96, [255, 160, 70, 255], 0.75], brazier: [96, [255, 160, 70, 255], 0.75],
  torch: [70, [255, 170, 80, 255], 0.55], ember_vent: [56, [255, 110, 40, 255], 0.6],
};
const EMBER = R.ember, GLOW: RGBA = [255, 120, 40, 255];

/** Раскладка: ряды разной высоты, в ряду плиты разной ширины со случайным сдвигом. */
function layout(W: number, H: number, seed: number) {
  const rows: { y: number; h: number; xs: number[] }[] = [];
  for (let y = 0, i = 0; y < H; i++) {
    const h = [22, 24, 26, 28, 30, 32, 36][Math.floor(hash01(i, 1, seed) * 7)];
    const xs: number[] = [];
    for (let x = -Math.floor(hash01(i, 2, seed) * 40), k = 0; x < W; k++) { xs.push(x); x += 22 + Math.floor(hash01(i, k, seed + 3) ** 1.2 * 34); }
    xs.push(W + 64);
    rows.push({ y, h, xs }); y += h;
  }
  return (x: number, y: number) => {
    let lo = 0, hi = rows.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rows[m].y <= y) lo = m; else hi = m - 1; }
    const r = rows[lo];
    let a = 0, b = r.xs.length - 2;
    while (a < b) { const m = (a + b + 1) >> 1; if (r.xs[m] <= x) a = m; else b = m - 1; }
    return { id: lo * 4096 + a, row: lo, k: a, sx: r.xs[a], sy: r.y, w: r.xs[a + 1] - r.xs[a], h: r.h };
  };
}

/** Собор: плиты крупные, разного размера со смещением по обеим осям — случайное деление блоков 160×160 (ряды блоков со сдвигом на половину),
 *  резы кратны 4 px, плиты 20–56 px; сплошных горизонтальных полос нет. */
function kdLayout(W: number, H: number, seed: number) {
  const B = 160, ids = new Int32Array(W * H), rects: [number, number, number, number][] = [];
  const leaf = (x: number, y: number, w: number, h: number) => {
    const id = rects.length; rects.push([x, y, w, h]);
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) ids[yy * W + xx] = id;
  };
  const split = (x: number, y: number, w: number, h: number, d: number): void => {
    const big = Math.max(w, h);
    if (big <= 56 && (big <= 28 || hash01(x + d * 7, y, seed) < 0.5)) return leaf(x, y, w, h);
    const vert = w > h * 1.15 ? true : h > w * 1.15 ? false : hash01(x, y + d, seed + 1) < 0.5;
    const L = vert ? w : h;
    if (L < 40) return leaf(x, y, w, h);
    const cut = 20 + Math.floor((hash01(x + 3, y + d * 5, seed + 2) * (L - 40)) / 4) * 4;
    if (vert) { split(x, y, cut, h, d + 1); split(x + cut, y, w - cut, h, d + 1); }
    else { split(x, y, w, cut, d + 1); split(x, y + cut, w, h - cut, d + 1); }
  };
  for (let by = 0, r = 0; by < H; by += B, r++) for (let bx = -(r % 2) * (B / 2); bx < W; bx += B) split(bx, by, B, B, 0);
  return (x: number, y: number) => { const id = ids[y * W + x], [sx, sy, w, h] = rects[id]; return { id, row: id, k: 0, sx, sy, w, h }; };
}

/** Пол карты одной картинкой; save=false — только вернуть слои (tools/gen/citadel.ts кладёт их под архитектуру цитадели). */
export function paintMap(m: WorldMap, name: string, seed: number, save = true, kdAll = false): { floor: PC; emit: PC } {
  const W = m.w * S, H = m.h * S;
  const pc = new PC(W, H), emit = new PC(W, H);
  const slab = layout(W, H, seed), kd = kdLayout(W, H, seed + 5);
  const vt = (vx: number, vy: number) => m.vtx[Math.max(0, Math.min(m.h, vy)) * (m.w + 1) + Math.max(0, Math.min(m.w, vx))];
  const matAt = new Array<string | null>(W * H);
  const lavaNear = new Float32Array(W * H);
  // 1. материал пикселя: вершина с наибольшим весом (билинейный + шум) — граница по шуму, без ступенек тайлов
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = x / S, gy = y / S, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    let best = -1, bt = 0, lava = 0;
    for (const [cx, cy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]] as const) {
      const t = vt(ix + cx, iy + cy);
      if (t === T.Lava) lava += w;
      const sc = w + (vn(x, y, 9, 7, seed + t * 7) - 0.5) * 0.55 + (vn(x, y, 3, 3, seed + t * 7 + 1) - 0.5) * 0.12;
      if (sc > best) { best = sc; bt = t; }
    }
    lavaNear[y * W + x] = lava;
    matAt[y * W + x] = bt === T.Lava ? null : MAT_OF[bt] ?? "ashen";
  }
  // 2. плиты: тон плиты, свет сверху-слева, швы с разрывами
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const key = matAt[y * W + x]; if (!key) continue;
    const f = FM[key], s = key === "cathedral" || kdAll ? kd(x, y) : slab(x, y), lx = x - s.sx, ly = y - s.sy;
    const broken = vn(x, y, 7, 5, seed + 11) > 0.68 || (lx === 0 && hash01(s.row, s.k, seed + 12) < 0.18);
    const tone = f.base + (hash01(s.row, s.k, seed + 13) - 0.5) * 2 * f.spread + (f.checker ? (hash01(s.row, s.k, seed + 14) < 0.5 ? f.checker * 0.7 : -f.checker) : 0);
    let v = tone + (vn(x, y, 11, 8, seed + 15) - 0.5) * 2 * f.noise + (vn(x, y, 4, 4, seed + 16) - 0.5) * f.noise * 0.5;
    v += (1 - (lx + ly) / (s.w + s.h)) * 0.35 - 0.15;
    if (f.worn) v += (1 - Math.min(1, Math.hypot(lx / s.w - 0.5, ly / s.h - 0.5) * 2)) * f.worn * 0.4;
    if (f.gloss) { const d = ((lx - ly * 1.3 + Math.floor(hash01(s.row, s.k, seed + 17) * 30) + 60) % 30); if (d < 2) v += f.gloss * 0.8; }
    if (f.scorch) { const n = vn(x, y, 12, 9, seed + 18); if (n > 1 - f.scorch * 0.45) v -= 1.0; else if (n > 1 - f.scorch * 0.6) v -= 0.45; }
    let c: RGBA;
    if ((lx === 0 || ly === 0) && !broken) c = f.r[0];
    else {
      if (!broken && (lx === 1 || ly === 1)) v = Math.max(v + 0.9, 3.1);
      else if (lx === s.w - 1 || ly === s.h - 1) v = Math.min(v - 0.8, 1.6);
      c = dq(f.r, v, x, y);
    }
    pc.set(x, y, c);
  }
  // 3. ромбы-вставки собора на некоторых стыках
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (matAt[y * W + x] !== "cathedral") continue;
    const s = kd(x, y);
    if (x !== s.sx + (s.sx & 1) || y !== s.sy || hash01(s.row, s.k, seed + 21) > 0.35) continue;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.abs(dx) + Math.abs(dy); if (d > 4) continue;
      pc.set(s.sx + dx, s.sy + dy, d === 4 ? [138, 116, 72, 255] : d === 3 ? R.cathInlay[dy < 0 ? 3 : 1] : R.cathInlay[2]);
    }
  }
  // 4. трещины (у лавы — раскалённые с отсветом), тлеющие пятна, пепел, мох, кости
  const hot: [number, number, number][] = [];
  const inside = (x: number, y: number) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && !!matAt[y * W + x];
  const area = (W * H) / (S * S);
  for (let i = 0; i < area * 1.4; i++) {
    const x = Math.floor(hash01(i, 1, seed + 31) * W), y = Math.floor(hash01(i, 2, seed + 31) * H), key = matAt[y * W + x];
    if (!key) continue;
    const f = FM[key], roll = hash01(i, 3, seed + 31);
    if (roll < f.cracks * 0.5) {
      const isLava = hash01(i, 4, seed + 31) < f.lava * 0.5 || lavaNear[y * W + x] > 0.15;
      const len = 8 + Math.floor(hash01(i, 5, seed + 31) * 14);
      if (isLava) {
        const pts: [number, number][] = [];
        crack(pc, x, y, len, seed * 7 + i, f.r, (px, py) => { const ok = inside(px, py); if (ok) pts.push([px, py]); return ok; }, ramp("#3a0c06", "#8a240c", "#d0501a", "#ffa040"));
        for (const [px, py] of pts) hot.push([px, py, 1]);
      } else crack(pc, x, y, len, seed * 7 + i, f.r, inside);
    } else if (roll < f.cracks * 0.5 + f.smolder * 0.25) {
      // тлеющее пятно: пепел с углями в середине
      const rx = 5 + Math.floor(hash01(i, 6, seed + 31) * 6), ry = Math.ceil(rx * 0.55);
      for (let yy = y - ry; yy <= y + ry; yy++) for (let xx = x - rx; xx <= x + rx; xx++) {
        if (!inside(xx, yy)) continue;
        const d = ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2 + (vn(xx, yy, 2, 2, seed + i) - 0.5) * 0.5;
        if (d > 1) continue;
        pc.set(xx, yy, d < 0.25 ? EMBER[(xx + yy) % 3 ? 2 : 3] : d < 0.45 ? mix(P.ash[1], EMBER[1], 0.5) : d < 0.75 ? P.ash[2] : P.ash[3]);
        if (d < 0.3) hot.push([xx, yy, 0.8]);
      }
    } else if (roll < f.cracks * 0.5 + f.smolder * 0.25 + f.ash * 0.15) {
      const rx = 3 + Math.floor(hash01(i, 7, seed + 31) * 5), ry = Math.ceil(rx * 0.5);
      for (let yy = y - ry; yy <= y + ry; yy++) for (let xx = x - rx; xx <= x + rx; xx++) {
        if (!inside(xx, yy)) continue;
        const d = ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2 + (vn(xx, yy, 3, 3, seed + i) - 0.5) * 0.6;
        if (d < 1) pc.set(xx, yy, d < 0.35 && yy < y ? P.ash[4] : d < 0.7 ? P.ash[3] : P.ash[2]);
      }
    } else if (roll < f.cracks * 0.5 + f.smolder * 0.25 + f.ash * 0.15 + f.moss * 0.2) {
      for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 4; xx <= x + 4; xx++) {
        const d = ((xx - x) / 4) ** 2 + ((yy - y) / 2) ** 2 + (vn(xx, yy, 2, 2, seed + i) - 0.5) * 0.8;
        if (d < 1 && inside(xx, yy)) pc.set(xx, yy, R.moss[d < 0.3 ? 3 : yy < y ? 2 : 1]);
      }
    } else if (roll < f.cracks * 0.5 + f.smolder * 0.25 + f.ash * 0.15 + f.moss * 0.2 + f.bones * 0.15) {
      if (hash01(i, 8, seed) < 0.7) bone(pc, x, y, 5 + Math.floor(hash01(i, 9, seed) * 3), hash01(i, 10, seed) < 0.5 ? -1 : 1, f.r[0]); else skull(pc, x, y, f.r[0]);
    }
  }
  // 5. край лавы: опалённая кромка и отсвет
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = lavaNear[y * W + x]; if (!matAt[y * W + x] || l < 0.02) continue;
    const c = pc.get(x, y)!; pc.set(x, y, mix(c, EMBER[1], clamp(l * 1.3) * 0.55));
    if (l > 0.1) put(emit, x, y, [GLOW[0], GLOW[1], GLOW[2], Math.round(clamp(l * 1.6) * 120)]);
  }
  // 6. отсвет раскалённых трещин и пятен на соседние плиты (мягкий, радиус 6) и в слой свечения
  const halo = new Float32Array(W * H);
  for (const [hx, hy, k] of hot) for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const x = hx + dx, y = hy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const d = Math.hypot(dx, dy * 1.3) / 6; if (d >= 1) continue;
    halo[y * W + x] = Math.max(halo[y * W + x], k * (1 - d) ** 2);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = halo[y * W + x]; if (h < 0.02 || !matAt[y * W + x]) continue;
    const c = pc.get(x, y)!;
    if (c[0] < 200) pc.set(x, y, [Math.min(255, c[0] * (1 + h * 0.9) + 70 * h), Math.min(255, c[1] * (1 + h * 0.4) + 22 * h), c[2], 255].map(Math.round) as RGBA);
    const e = emit.get(x, y)!; put(emit, x, y, [GLOW[0], GLOW[1], GLOW[2], Math.max(e[3], Math.round(h * 150))]);
  }
  // 7. тень у основания стен (стена сверху — полоса 14 px, слева — 10 px), пыль у стен
  const wall = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= m.w || cy >= m.h || !!(m.cell[cy * m.w + cx] & CELL_WALL);
  for (let cy = 0; cy < m.h; cy++) for (let cx = 0; cx < m.w; cx++) {
    if (wall(cx, cy)) continue;
    for (let ly = 0; ly < S; ly++) for (let lx = 0; lx < S; lx++) {
      const x = cx * S + lx, y = cy * S + ly; if (!matAt[y * W + x]) continue;
      let k = 1;
      if (wall(cx, cy - 1) && ly < 14) k *= ly === 0 ? 0.45 : 0.55 + 0.45 * (ly / 14) ** 0.7;
      if (wall(cx - 1, cy) && lx < 10) k *= lx === 0 ? 0.55 : 0.65 + 0.35 * (lx / 10);
      if (wall(cx + 1, cy) && lx > S - 5) k *= 0.8 + 0.2 * ((S - 1 - lx) / 4);
      if (k < 1) { const c = pc.get(x, y)!; pc.set(x, y, [c[0] * k, c[1] * k, c[2] * k, 255].map(Math.round) as RGBA); }
      const f = FM[matAt[y * W + x]!];
      if (f.dust && (wall(cx, cy - 1) || wall(cx - 1, cy) || wall(cx + 1, cy))) {
        const e = Math.min(wall(cx, cy - 1) ? ly : 99, wall(cx - 1, cy) ? lx : 99, wall(cx + 1, cy) ? S - 1 - lx : 99);
        const n = vn(x, y, 8, 6, seed + 41) * f.dust * (1.3 - e / 20);
        if (n > 0.45) pc.set(x, y, mix(pc.get(x, y)!, R.dust, n > 0.65 ? 0.4 : 0.22));
      }
    }
  }
  // 8. пятна света от жаровен и факелов
  for (const o of m.objects) {
    const L = LIGHTS[o.kind]; if (!L) continue;
    const [rx, col, k] = L, ry = rx * 0.55, cy = o.y - 4;
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(o.x - rx); x <= o.x + rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || !matAt[y * W + x]) continue;
      const d = ((x - o.x) / rx) ** 2 + ((y - cy) / ry) ** 2; if (d >= 1) continue;
      const a = k * (1 - d) ** 2, c = pc.get(x, y)!;
      pc.set(x, y, [Math.min(255, c[0] * (1 + a * 0.6) + col[0] * a * 0.3), Math.min(255, c[1] * (1 + a * 0.45) + col[1] * a * 0.22), Math.min(255, c[2] * (1 + a * 0.2) + col[2] * a * 0.1), 255].map(Math.round) as RGBA);
      const e = emit.get(x, y)!; put(emit, x, y, e[3] && e[0] > 200 && e[1] < 140 ? e : [col[0], col[1], col[2], Math.max(e[3], Math.round(a * 70))]);
    }
  }
  if (save) {
    pc.save(path.join(OUT, `${name}_floor.png`));
    emit.save(path.join(OUT, `${name}_emit.png`));
    console.log(`${name}: ${W}×${H}`);
  }
  return { floor: pc, emit };
}

if (/floors-maps\.ts$/.test(process.argv[1] ?? "")) {
  paintMap(generateDungeonMap(), "dungeon", 101);
  paintMap(generateRaidMap(), "raid", 202);
}
