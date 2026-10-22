/** Обозначения, часть B (задача 129): купола (плотность 1, как bubble-* в игре: чистый обод 2–3 px в 3–4 тона с бликом, внутри прозрачно,
 *  свечение 15–30% альфы), щит у руки, значки над подписью и у руки (двойная плотность, до 16 px), частицы по краям силуэта (не на лице и груди). */
import {
  PC, TAU, RP, INK, Mask, Cv, L1, L2, EASE, shade, outline, flat, ellScan, adist, ang, glow, sparkle, flame, flameMask, flameFill, cloud, hex, withA, mix, rng,
  easeOut, easeIn, easeInOut, bell, smooth, stepTone, rimLight, puff, bayer, dissolve, type Art, type Layer, type RGBA, type Ramp,
} from "./aura-lib";

const one = (id: string, layers: Layer[], extra: Partial<Art> = {}): Art => ({ id, layers, ease: EASE, ...extra });
const tint = (c: RGBA, k: number): RGBA => [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k)), c[3]];

// ====================================================================== купола (плотность 1)
interface RimOpt { w: number; tones: RGBA[]; hi: RGBA; glowCol: RGBA; glowA: number; glowW?: number; glints?: number; u: number; lit?: number }
/** Обод купола: полоса w px внутри эллипса; тона по k (0 — внешний край) со сдвигом по свету (сверху слева светлее, справа снизу темнее),
 *  блик на верхней левой дуге, бегущие блики, внутри — ступенчатое свечение. */
function rim(f: PC, cx: number, cy: number, rx: number, ry: number, o: RimOpt, pick: (th: number) => boolean = () => true) {
  const gw = o.glowW ?? 6, n = o.tones.length;
  ellScan(f.w, f.h, cx, cy, rx, ry, o.w + gw + 1, (x, y, th, d) => {
    if (!pick(th)) return;
    if (d <= 0 && d > -o.w) {
      const k = Math.min(o.w - 1, Math.floor(-d)), light = -Math.cos(th - (5 * Math.PI) / 4);   // 1 — сверху слева, −1 — справа снизу
      let idx = Math.round((k / Math.max(1, o.w - 1)) * (n - 2)) + (light > 0.55 ? 1 : light < -0.6 ? -1 : 0);
      idx = Math.max(0, Math.min(n - 1, idx));
      let c = o.tones[idx];
      if (light > 0.86 && k >= 1) c = o.hi;
      if (o.glints) for (let g = 0; g < o.glints; g++) if (adist(th, o.u * TAU / o.glints * 1 + (g * TAU) / o.glints + 0.3) < 0.16 && k >= 1) c = o.hi;
      f.set(x, y, c);
    } else if (d <= -o.w && d > -o.w - gw) {
      const q = (-d - o.w) / gw, st = q < 0.34 ? 1 : q < 0.67 ? 0.62 : 0.3;
      f.set(x, y, withA(o.glowCol, 255 * o.glowA * st));
    }
  });
}
/** Купол — как bubble-* в игре: центр — точка body (13 px над ногами), эллипс 38×40: верх обода на y − 33 (под ником, над полоской здоровья
 *  не выше неё), низ — на 6 px ниже ног. */
const DW = 44, DH = 44, DX = 22, DY = 22, DRX = 19, DRY = 20;

/** Божественный щит: золотой обод 3 px в 4 тона с бликом, мягкое свечение внутри (30% → 0), снаружи — лучи-клинья (непрозрачные, кончик гаснет
 *  дизером), дышат волной и поворачиваются на шаг за цикл; у вершины (±80° от верха) лучей нет — они не заходят под ник и полоску здоровья. */
export function domeInvuln(): Art {
  const G = RP.gold, W = 56, H = 52, cx = 28, cy = 26;
  const lay = L1("dome", W, H, 12, 12, "body", "over", [0.5, 0.5], (f, t, u) => {
    for (let i = 0; i < 12; i++) {
      const a = ((i + u) * TAU) / 12, win = smooth(0.95, 1.45, adist(a, -Math.PI / 2));
      const br = 0.5 + 0.5 * Math.sin(u * TAU * 2 - (i * TAU) / 4), L = (3.0 + 2.4 * easeInOut(br) + (i % 2 ? 0 : 1.0)) * win;
      if (L < 1.5) continue;
      const ca = Math.cos(a), sa = Math.sin(a), P = (s: number, w: number): [number, number] => [cx + ca * (DRX + 1 + s) - sa * w, cy + sa * (DRY + 1 + s) + ca * w];
      const m = new Mask(W, H, 1).poly([P(-0.5, -1.6), P(L, -0.3), P(L, 0.3), P(-0.5, 1.6)]);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.has(x, y)) {
        const q = Math.max(0, Math.min(1, (Math.hypot((x + 0.5 - cx) / (DRX + 1), (y + 0.5 - cy) / (DRY + 1)) - 1) * 21 / L));
        if (q > 0.55 && bayer(x, y) < ((q - 0.55) / 0.45) * 0.85) continue;
        f.set(x, y, q < 0.4 ? G[4] : G[3]);
      }
    }
    rim(f, cx, cy, DRX, DRY, { w: 3, tones: [G[1], G[2], G[3], G[4]], hi: G[5], glowCol: hex("#ffe890"), glowA: 0.3, glowW: 6, glints: 2, u });
  });
  return one("invuln", [lay], { ease: { fadeIn: 180, fadeOut: 320, scaleIn: 0.8 } });
}

/** Щит (лекарь): прозрачный купол — бело-золотой обод 2 px в 4 тона, блик бежит по ободу, свечение 15%; крест 7×7 — на нижнем ободе спереди
 *  (как застёжка, далеко от подписи), дышит в 4 ступени и мягко светится; четыре искры 2×2 вспыхивают и гаснут по очереди. */
export function domeHealShield(): Art {
  const G = RP.gold, Lt = RP.light, W = 44, H = 48, cx = 22, cy = 22, rx = DRX, ry = DRY;
  const lay = L1("dome", W, H, 12, 12, "body", "over", [0.5, cy / H], (f, t, u) => {
    rim(f, cx, cy, rx, ry, { w: 2, tones: [G[2], G[3], Lt[3], Lt[4]], hi: hex("#ffffff"), glowCol: hex("#fff4c8"), glowA: 0.17, glowW: 5, glints: 1, u });
    const e = 0.5 + 0.5 * Math.sin(u * TAU), lv = Math.round(e * 3), x0 = cx, y0 = cy + ry - 0.5;
    const c = new Cv(W, H, 1); glow(c, x0, y0, 5.5, 4.5, G[4], 0.12 + lv * 0.06, 2); f.blit(c.f, 0, 0);
    const m = new Mask(W, H, 1).rect(x0 - 1, y0 - 3.5, 2, 7).rect(x0 - 3.5, y0 - 1.5, 7, 2);
    shade(f, m, [G[1 + Math.min(1, lv)], G[2 + Math.min(1, lv)], G[3], G[4], G[5]].map((x, i) => (i >= 3 && lv >= 2 ? hex("#ffffff") : x)), { out: hex("#5a3408"), bevel: 0.8 });
    [[-15, -10], [16, -3], [-13, 11], [14, 8]].forEach(([dx, dy], i) => {
      const p = (u + i * 0.25) % 1, al = p < 0.45 ? bell(p / 0.45, 0.3, 0.5) : 0; if (al < 0.15) return;
      const x = Math.round(cx + dx), y = Math.round(cy + dy - p * 4);
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) f.set(x + a, y + b, al > 0.6 ? hex("#ffffff") : Lt[3]);
      if (al > 0.6) for (const [a, b] of [[-1, 0], [2, 0], [0, -1], [1, -1], [0, 2], [1, 2]]) f.set(x + a, y + b, G[4]);
    });
  });
  return one("shield", [lay]);
}

/** Чародейский барьер: обод 2 px (арканум → лазурь, блики); у края — соты: только светлые рёбра шестиугольников в 2 тона (лазурь и пурпур),
 *  без заливки, по ним бежит волна яркости; трижды за цикл в новом месте обода бьёт молния — ломаная 2 px с белым ядром, голубым ореолом
 *  и двумя ветками, гаснет за 3 кадра (белая → голубая → дизером). */
export function domeBarrierMage(): Art {
  const A = RP.arcane, Z = RP.azure, s = 5.2;
  const cells: { x: number; y: number }[] = [];
  for (let row = -7; row <= 7; row++) for (let col = -6; col <= 6; col++) cells.push({ x: DX + (col + (Math.abs(row) % 2) * 0.5) * s * 1.732, y: DY + row * s * 1.5 });
  const dE = (x: number, y: number) => { const r = Math.hypot((x - DX) / DRX, (y - DY) / DRY), th = Math.atan2((y - DY) / DRY, (x - DX) / DRX); return (r - 1) * Math.hypot(DRX * Math.cos(th), DRY * Math.sin(th)); };
  // рёбра сот считаются один раз: пиксель ребра — где две ближайшие ячейки почти равноудалены; запоминаем ячейку для волны
  const edge: { x: number; y: number; c: { x: number; y: number }; d: number }[] = [];
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
    const d = dE(x + 0.5, y + 0.5); if (d > -1.6 || d < -8.5) continue;
    let b1 = 1e9, b2 = 1e9, bc = cells[0];
    for (const c of cells) { const q = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y); if (q < b1) { b2 = b1; b1 = q; bc = c; } else if (q < b2) b2 = q; }
    if (b2 - b1 < 0.95) edge.push({ x, y, c: bc, d });
  }
  const bolts = [{ a: 3.45, t0: 0, seed: 11 }, { a: 0.3, t0: 4, seed: 23 }, { a: 1.95, t0: 8, seed: 37 }];
  const lay = L1("dome", DW, DH, 12, 12, "body", "over", [0.5, 0.5], (f, t, u) => {
    for (const p of edge) {
      const w = 0.5 + 0.5 * Math.sin((u - (p.c.x - DX + (p.c.y - DY) * 0.7) / 48) * TAU), deep = p.d < -5;
      const col = w > 0.72 ? (deep ? Z[3] : Z[4]) : w > 0.4 ? (deep ? A[3] : Z[3]) : deep ? A[2] : A[3];
      f.set(p.x, p.y, deep ? withA(col, 200) : col);
    }
    rim(f, DX, DY, DRX, DRY, { w: 2, tones: [A[2], A[3], Z[3], Z[4]], hi: hex("#ffffff"), glowCol: Z[3], glowA: 0.0, glowW: 1, glints: 2, u });
    for (const b of bolts) {
      const age = (t - b.t0 + 12) % 12; if (age > 2) continue;
      const r2 = rng(b.seed), pts: [number, number][] = [];
      // ломаная поперёк обода: 5 изломов с размахом ±3 px, две ветки по 3–4 px от средних изломов
      for (let i = 0; i <= 4; i++) { const a = b.a - 0.46 + i * 0.23, jit = (i % 2 ? 1 : -1) * (2.2 + r2() * 1.4) * (i === 0 || i === 4 ? 0.5 : 1); pts.push([DX + Math.cos(a) * (DRX - 1 + jit), DY + Math.sin(a) * (DRY - 1 + jit)]); }
      const forks: [number, number][][] = [1, 3].map((k) => { const [x, y] = pts[k], o = k === 1 ? 1 : -1, nx = Math.cos(b.a) * o, ny = Math.sin(b.a) * o; return [[x, y], [x + nx * 2.0 - ny * 1.6, y + ny * 2.0 + nx * 1.6], [x + nx * 3.4 - ny * 0.8, y + ny * 3.4 + nx * 0.8]]; });
      const core = new Mask(DW, DH, 1).path(pts, 0.55), halo = new Mask(DW, DH, 1).path(pts, 1.25);
      for (const fk of forks) { core.path(fk, 0.45); halo.path(fk, 1.05); }
      const tmp = new PC(DW, DH);
      for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
        if (core.has(x, y) && age < 2) tmp.set(x, y, age === 0 ? hex("#ffffff") : Z[4]);
        else if (halo.has(x, y)) tmp.set(x, y, age === 0 ? Z[4] : age === 1 ? Z[3] : Z[2]);
      }
      if (age === 2) dissolve(tmp, 0.5);
      f.blit(tmp, 0, 0);
    }
  });
  return one("block_mage", [lay]);
}

/** Руны-плитки антимагического панциря (3×4 внутри плитки 5×6 с контуром): ᚱ, ᛉ, ᛏ, ᚦ, ᛃ — из того же ряда, что руны рунного клинка. */
const GLYPHS = [["##.", "#.#", "##.", "#.#"], ["#.#", "###", ".#.", ".#."], [".#.", "###", ".#.", ".#."], ["#..", "##.", "#.#", "##."], ["#..", "##.", ".##", "..#"]];
/** Антимагический панцирь: ледяная сфера — сплошной обод 2 px в 4 тона с бликом, свечение 15%; прямо на ободе — пять рун-плиток
 *  (тёмный камень, руна в 3 тона, контур): справа, внизу и слева, у вершины рун нет; свет обходит руны по очереди — руна разгорается
 *  в 4 ступени, вокруг вспыхивает ореол. Героя пояс не режет: всё — на ободе. */
export function domeAntiMagic(): Art {
  const I = RP.ice, OUT = hex("#0a1626"), at = [-0.3, 0.62, Math.PI / 2, Math.PI - 0.62, Math.PI + 0.3];
  const lay = L1("dome", DW, DH, 12, 12, "body", "over", [0.5, 0.5], (f, t, u) => {
    rim(f, DX, DY, DRX, DRY, { w: 2, tones: [I[2], I[3], I[4], I[4]], hi: hex("#ffffff"), glowCol: I[4], glowA: 0.15, glowW: 5, glints: 1, u });
    at.forEach((a, i) => {
      const lit = Math.max(0, Math.cos((u - i / at.length) * TAU)), lv = Math.round(easeInOut(lit) * 3);
      const x0 = Math.round(DX + Math.cos(a) * (DRX - 1) - 2.5), y0 = Math.round(DY + Math.sin(a) * (DRY - 1) - 3);
      if (lv >= 2) { const c = new Cv(DW, DH, 1); glow(c, x0 + 2.5, y0 + 3, 5, 5.5, I[4], 0.18 + (lv - 2) * 0.14, 2); f.blit(c.f, 0, 0); }
      const tile = new Mask(DW, DH, 1).rect(x0, y0, 5, 6);
      const tmp = new PC(DW, DH);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) tmp.set(x0 + x, y0 + y, y === 0 || x === 0 ? hex("#2a5a82") : x === 4 || y === 5 ? hex("#0e2a4a") : hex("#1a4064"));
      const g = GLYPHS[i % GLYPHS.length];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) if (g[y][x] === "#") tmp.set(x0 + 1 + x, y0 + 1 + y, [I[3], I[4], I[5], hex("#ffffff")][lv]);
      outline(tmp, tile, OUT);
      f.blit(tmp, 0, 0);
    });
  });
  return one("antimagic", [lay]);
}

/** Барьер реликвии: гранёный кристалл-шестигранник (верх — на y − 33): шесть граней-трапеций с объёмом — верхние светлее, нижние темнее
 *  (4 тона), рёбра между гранями — светлые сверху и тёмные снизу, внутренняя кромка светлее; середина прозрачна. По внешнему ребру бежит
 *  блик 3×3 с затухающим хвостом, раз в цикл на верхнем левом углу вспыхивает искра. */
export function domeRelic(): Art {
  const T = [hex("#103650"), hex("#24668e"), hex("#4ea2d0"), hex("#94d8f6"), hex("#e4f8ff")], OUTC = hex("#0a2032");
  const V: [number, number][] = [[22, 3], [41, 12], [41, 32.5], [22, 41.5], [3, 32.5], [3, 12]];   // контур снаружи: верх — y − 33
  const inner = V.map(([x, y]): [number, number] => [DX + (x - DX) * 0.78, DY + (y - DY) * 0.8]);
  const outer = new Mask(DW, DH, 1).poly(V), hole = new Mask(DW, DH, 1).poly(inner);
  // грань: по углу от центра, сектор между соседними вершинами; тон по стороне света (сверху слева светлее)
  const vAng = V.map(([x, y]) => ang(Math.atan2(y - DY, x - DX)));
  const facetOf = (x: number, y: number) => { const a = ang(Math.atan2(y - DY, x - DX)); for (let i = 0; i < 6; i++) { const a0 = vAng[i], a1 = vAng[(i + 1) % 6], span = ang(a1 - a0); if (ang(a - a0) < span) return i; } return 0; };
  const faceTone = [2, 1, 0, 1, 2, 3];   // 0 — верх-право, 1 — право, 2 — низ-право, 3 — низ-лево, 4 — лево, 5 — верх-лево
  const ridge = (x: number, y: number) => { const a = ang(Math.atan2(y - DY, x - DX)); return vAng.some((v) => adist(a, v) < 0.07); };
  const per: [number, number][] = [];
  for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) if (outer.has(x, y) && (!outer.has(x - 1, y) || !outer.has(x + 1, y) || !outer.has(x, y - 1) || !outer.has(x, y + 1))) per.push([x, y]);
  per.sort((p, q) => ang(Math.atan2(p[1] + 0.5 - DY, p[0] + 0.5 - DX) + Math.PI / 2) - ang(Math.atan2(q[1] + 0.5 - DY, q[0] + 0.5 - DX) + Math.PI / 2));
  const lay = L1("dome", DW, DH, 12, 12, "body", "over", [0.5, 0.5], (f, t, u) => {
    for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
      if (!outer.has(x, y) || hole.has(x, y)) continue;
      const fi = facetOf(x + 0.5, y + 0.5), up = y + 0.5 < DY;
      let k = faceTone[fi];
      if (ridge(x + 0.5, y + 0.5)) k = up ? 4 : 0;
      else if (!hole.has(x - 1, y) && !hole.has(x + 1, y) && !hole.has(x, y - 1) && !hole.has(x, y + 1)) { /* тело грани */ }
      else k = Math.min(4, k + 1);   // внутренняя кромка — на тон светлее
      const sh = Math.abs((x + y * 0.75) / (DW * 1.75) - (-0.25 + u * 1.5));
      if (sh < 0.05) k = Math.min(4, k + 2); else if (sh < 0.1) k = Math.min(4, k + 1);
      f.set(x, y, T[k]);
    }
    outline(f, outer, OUTC);
    // блик 3×3 бежит по внешнему ребру (с затухающим хвостом из двух точек)
    const n = per.length, pos = easeInOut(u) * n;
    for (const [lag, col] of [[6, T[3]], [3, T[4]]] as const) { const p = per[((Math.floor(pos) - lag) % n + n) % n]; f.set(p[0], p[1], col); }
    const p0 = per[Math.floor(pos) % n];
    for (const [a, b] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) f.set(p0[0] + a, p0[1] + b, a || b ? T[4] : hex("#ffffff"));
    // искра на верхнем левом углу: кадры 7–9 (растёт и гаснет)
    if (t >= 7 && t <= 9) { const c = new Cv(DW, DH, 1); sparkle(c, V[5][0] + 0.5, V[5][1] + 0.5, [2.2, 3.4, 2.0][t - 7], [hex("#ffffff"), T[4], T[3]], { thick: 0.42 }); f.blit(c.f, 0, 0); }
  });
  return one("leg_barrier", [lay]);
}

/** Метаморфоза: на земле — ядро скверны пульсирует в 5 ступеней (быстрый подъём, медленный спад; три кольца разгораются), из него
 *  поднимаются две искры 2×2; за героем — три фиолетовых языка-дымки от плеч и боков (4 тона), перед ним — два языка у бёдер по краю
 *  силуэта. Рогов нет: ничего не выходит за голову и не заходит под полоску здоровья. */
export function domeMeta(): Art {
  const V = RP.violet, Fe = RP.fel;
  const ground = L1("core", 30, 14, 12, 12, "feet", "ground", [0.5, 8 / 14], (f, t, u) => {
    const v = u < 0.25 ? easeOut(u / 0.25) : 1 - easeInOut((u - 0.25) / 0.75), lv = Math.round(v * 4);
    const bands: [number, number, RGBA, number][] = [[11 + lv * 0.6, 4.0 + lv * 0.2, Fe[2], 0.42 + lv * 0.04], [7 + lv * 0.5, 2.6 + lv * 0.15, Fe[3], 0.62 + lv * 0.05], [3.2 + lv * 0.5, 1.3 + lv * 0.12, lv >= 3 ? Fe[5] : Fe[4], 0.9]];
    for (const [rx, ry, col, a] of bands) for (let y = 0; y < 14; y++) for (let x = 0; x < 30; x++) if (((x + 0.5 - 15) / rx) ** 2 + ((y + 0.5 - 8) / ry) ** 2 <= 1) f.set(x, y, withA(col, 255 * Math.min(1, a)));
    for (const [dx, ph] of [[-5, 0], [4, 0.5]] as const) {
      const p = (u + ph) % 1, x = 15 + dx + Math.round(Math.sin(p * TAU)), y = Math.round(8 - easeOut(p) * 6);
      if (p > 0.8) continue;
      f.set(x, y, Fe[5]); f.set(x + 1, y, Fe[4]); f.set(x, y + 1, Fe[4]); f.set(x + 1, y + 1, Fe[3]);
    }
  });
  const W = 44, H = 46, cx = 22, base = 40;
  // язык-дымка: изгиб S (два синуса по высоте), край прозрачнее, на вершине отрывается клочок
  const tongue = (c: Cv, x: number, h: number, w: number, ph: number, lean: number, u: number, alpha: number) => {
    const fl = Math.sin((u + ph) * TAU), hh = h * (0.9 + 0.1 * Math.sin((u + ph * 2) * TAU));
    const m = flameMask(c, x, base, hh, w, fl * 2.6, lean);
    const curl = c.mask(); for (let y = 0; y < m.h; y++) for (let xx = 0; xx < m.w; xx++) if (m.has(xx, y)) { const wy = (y + 0.5) / c.D, q = (base - wy) / hh, sx = Math.round(Math.sin(q * 5.2 + (u + ph) * TAU) * 1.2 * q * c.D); curl.put(xx + sx, y, true); }
    const tmp = new Cv(W, H, c.D);
    flameFill(tmp, curl, [V[1], V[2], V[3], V[4], V[5]], base, hh, 1, -0.05);
    const d = curl.dist(2); for (let y = 0; y < curl.h; y++) for (let xx = 0; xx < curl.w; xx++) if (curl.has(xx, y)) { const col = tmp.f.get(xx, y)!; c.f.set(xx, y, withA(col, 255 * alpha * (d[y * curl.w + xx] <= 1 ? 0.7 : 1))); }
    const p = (u + ph) % 1, wx = x + lean + fl * 2.6 + Math.sin(p * 3) * 1.2, wy = base - hh - 1 - easeOut(p) * 6;
    cloud(c, [[wx, wy, 1.6 * (1 - p * 0.6)]], [V[2], V[3], V[4], V[5], V[5]], alpha * bell(p, 0.15, 0.6) * 0.85);
  };
  const back = L1("back", W, H, 12, 12, "feet", "under", [0.5, base / H], (f, t, u) => {
    const c = new Cv(W, H, 1);
    tongue(c, cx - 12, 23, 4.0, 0, -3.5, u, 0.86); tongue(c, cx + 12, 24, 4.2, 0.4, 3.5, u, 0.86); tongue(c, cx + 1, 21, 5.0, 0.7, 1.0, u, 0.78);   // средний — за спиной, ниже: клочок не поднимается к нику
    f.blit(c.f, 0, 0);
  });
  const front = L1("front", W, H, 12, 12, "feet", "over", [0.5, base / H], (f, t, u) => {
    const c = new Cv(W, H, 1);
    tongue(c, cx - 11.5, 12, 2.6, 0.2, -1.5, u, 0.88); tongue(c, cx + 11.5, 13, 2.6, 0.6, 1.5, u, 0.88);
    f.blit(c.f, 0, 0);
  });
  return one("meta", [back, front, ground]);
}

/** Щитовой блок: геральдический щит 14×18 у левой руки (поверх своего щита героя): лазурное поле в 4 тона с фаской, золотой обод в 3 тона
 *  с бликом, рельефный крест; свет ползёт по ободу, раз в цикл — мягкий блик (2–3 кадра с затуханием). Покачивание — в коде. */
export function shieldBlock(): Art {
  const G = RP.gold, S = RP.steelb, W = 16, H = 20;
  const shape = (m: Mask, k = 0) => m.poly([[1.5 + k, 1.5 + k], [14.5 - k, 1.5 + k], [14.5 - k, 9.5], [13.4 - k * 0.8, 13.6 - k * 0.4], [8 , 18.8 - k * 1.3], [2.6 + k * 0.8, 13.6 - k * 0.4], [1.5 + k, 9.5]]);
  const lay = L2("shield", W, H, 12, 12, "body", "over", [0.5, 0.5], (c, t, u) => {
    glow(c, 8, 10, 8.5, 10.5, hex("#9ad0ff"), 0.2, 2);
    const outer = shape(c.mask()), field = shape(c.mask(), 1.6);
    const rimM = outer.clone().minus(field);
    shade(c.f, rimM, [G[1], G[2], G[3], G[4], G[5]], { out: null, bevel: 0.7 });
    shade(c.f, field, [S[1], S[2], S[3], S[4], S[5]], { out: null, bevel: 1.6, grad: 0.35 });
    // крест: рельеф (фаска) золотом
    const cross = c.mask().rect(7, 3.6, 2, 12).rect(3.8, 7, 8.4, 2);
    shade(c.f, cross, [G[0], G[2], G[3], G[4], G[5]], { out: hex("#1a2440"), bevel: 0.6 });
    outline(c.f, outer, INK);
    // свет ползёт по ободу (по верхнему краю и боку)
    const s = (u * 1.0) % 1, gx = 2 + s * 12;
    for (let y = 0; y < c.f.h; y++) for (let x = 0; x < c.f.w; x++) if (rimM.has(x, y) && Math.abs((x + 0.5) / c.D - gx) < 0.9 && (y + 0.5) / c.D < 3.2) c.f.set(x, y, hex("#fffbe8"));
    // мягкий блик по полю: кадры 9–11 (наискось, альфа)
    if (t >= 9) {
      const p = (t - 9) / 2, a = [0.5, 0.35, 0.18][t - 9];
      for (let y = 0; y < c.f.h; y++) for (let x = 0; x < c.f.w; x++) {
        if (!field.has(x, y)) continue;
        const wx = (x + 0.5) / c.D, wy = (y + 0.5) / c.D, dd = Math.abs(wx + wy * 0.8 - (6 + p * 9));
        if (dd < 1.4) c.f.set(x, y, withA(hex("#ffffff"), 255 * a * (1 - dd / 1.4)));
      }
    }
  }, { dx: -14, dy: 1, bob: { amp: 1, period: 1700 } });
  return one("block", [lay]);
}

// ====================================================================== значки над подписью (двойная плотность, до 16 px)
const icon = (id: string, W: number, H: number, n: number, fps: number, draw: (c: Cv, t: number, u: number) => void, extra: Partial<Layer> = {}) =>
  L2(id, W, H, n, fps, "head", "top", [0.5, 1], draw, extra);
/** Залить маску тоном по ступени v (0..1) рампы. */
const fillM = (c: Cv, m: Mask, col: RGBA) => { for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) c.f.set(x, y, col); };

/** Засада (разбойник): два скрещённых кинжала (сталь с фаской, гарда, рукоять), в перекрестье алая искра набирает яркость в 6 ступеней и гаснет. */
export function ovAmbush(): Art {
  const S = RP.steel, B = RP.crimson, wood = [hex("#2a160c"), hex("#4a2a16"), hex("#70442a"), hex("#986038"), hex("#b8844e")];
  const lay = icon("daggers", 16, 14, 12, 12, (c, t, u) => {
    for (const sg of [-1, 1]) {
      const hx = 8 - sg * 5.6, hy = 12.2, tx = 8 + sg * 6.2, ty = 1.4, dx = tx - hx, dy = ty - hy, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      const P = (s: number, w: number): [number, number] => [hx + ux * s + nx * w, hy + uy * s + ny * w];
      const blade = c.mask().poly([P(3.4, -1.1), P(L - 2.2, -0.7), P(L, 0), P(L - 2.2, 0.7), P(3.4, 1.1)]);
      shade(c.f, blade, [S[1], S[2], S[3], S[4], S[5]], { out: INK, bevel: 0.6 });
      const grip = c.mask().cap(...P(0.4, 0), ...P(2.6, 0), 0.75);
      shade(c.f, grip, wood, { out: INK, bevel: 0.5 });
      const guard = c.mask().cap(...P(2.9, -2.1), ...P(2.9, 2.1), 0.6);
      shade(c.f, guard, [hex("#2a2e3a"), hex("#4f586a"), hex("#8f99ad"), hex("#c8d0de"), hex("#ffffff")], { out: INK, bevel: 0.5 });
    }
    const v = u < 0.3 ? easeOut(u / 0.3) : 1 - easeInOut((u - 0.3) / 0.7), lv = Math.round(v * 5);
    glow(c, 8, 6.6, 2 + lv * 0.5, 2 + lv * 0.5, B[4], 0.1 + lv * 0.05, 2); sparkle(c, 8, 6.6, 1.3 + lv * 0.55, [lv >= 4 ? hex("#ffffff") : B[5], B[4], B[3]], { thick: 0.45, rot: (u * Math.PI) / 2 });
  });
  return one("as_ambush", [lay]);
}

/** Засада (тёмный следопыт): стрела по диагонали (древко, стальной наконечник, сиреневое оперение в 3 тона); фиолетовый свет пробегает от оперения к наконечнику. */
export function ovAmbushDark(): Art {
  const S = RP.steel, Fz = RP.lilac, Bk = RP.bark;
  const lay = icon("arrow", 16, 14, 12, 12, (c, t, u) => {
    const hx = 2.2, hy = 12.2, tx = 14.2, ty = 1.8, dx = tx - hx, dy = ty - hy, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const P = (s: number, w: number): [number, number] => [hx + ux * s + nx * w, hy + uy * s + ny * w];
    const glowAt = easeInOut(u) * (L + 4) - 2;
    glow(c, ...P(glowAt, 0), 2.8, 2.8, Fz[4], 0.35, 2);
    const shaft = c.mask().cap(...P(2.2, 0), ...P(L - 3.4, 0), 0.55);
    shade(c.f, shaft, [Bk[2], Bk[3], Bk[4], Bk[5], Bk[5]], { out: INK, bevel: 0.5 });
    const head = c.mask().poly([P(L, 0), P(L - 3.6, -1.9), P(L - 2.8, 0), P(L - 3.6, 1.9)]);
    shade(c.f, head, [S[1], S[2], S[3], S[4], S[5]], { out: INK, bevel: 0.6 });
    for (const sg of [-1, 1]) {
      const fm = c.mask().poly([P(0, sg * 0.3), P(1.2, sg * 2.6), P(4.6, sg * 2.2), P(5.2, sg * 0.4)]);
      shade(c.f, fm, [Fz[1], Fz[2], Fz[3], Fz[4], Fz[5]], { out: INK, bevel: 0.6 });
    }
    const gm = c.mask().disc(...P(glowAt, 0), 1.0);
    for (let y = 0; y < gm.h; y++) for (let x = 0; x < gm.w; x++) if (gm.has(x, y) && c.f.alpha(x, y) > 200) c.f.set(x, y, withA(Fz[5], 200));
  });
  return one("dr_ambush", [lay]);
}

/** Последний рубеж: значок над подписью (не круг) — геральдический щит: золотой обод в 4 тона с фаской, тёмно-багровое поле, рубиновое сердце;
 *  удар сердца «тук-тук» (easing): сердце набухает и вспыхивает, за щитом раскрывается золотое сияние в 4 ступени; по ободу обходит блик. */
export function ovLastStand(): Art {
  const G = RP.gold, B = RP.crimson, OUT = hex("#2a1006");
  const cyc = (u: number, c: number) => { const d = Math.abs(u - c); return Math.min(d, 1 - d); };
  const lay = icon("heartshield", 14, 15, 12, 12, (c, t, u) => {
    const beat = Math.max(Math.exp(-((cyc(u, 0.08) / 0.07) ** 2)), 0.6 * Math.exp(-((cyc(u, 0.3) / 0.07) ** 2))), lv = Math.round(beat * 4);
    if (lv >= 1) glow(c, 7, 7.5, 6.6 + lv * 0.25, 7.2 + lv * 0.25, G[4], 0.08 + lv * 0.06, 2);
    const shape = (k: number) => c.mask().poly([[1.4 + k, 1.4 + k], [12.6 - k, 1.4 + k], [12.6 - k, 7.2], [11.2 - k * 0.8, 10.8 - k * 0.3], [7, 14.2 - k * 1.3], [2.8 + k * 0.8, 10.8 - k * 0.3], [1.4 + k, 7.2]]);
    const outer = shape(0), field = shape(1.5), rimM = outer.clone().minus(field);
    shade(c.f, rimM, [G[1], G[2], G[3], G[4], G[5]], { out: null, bevel: 0.7 });
    shade(c.f, field, [hex("#1e0408"), hex("#3a0812"), hex("#560c1a"), hex("#701222"), hex("#8a1a2c")], { out: null, bevel: 1.4, grad: 0.3 });
    const k = 1 + 0.1 * beat, hx = 7, hy = 7.2;
    const heart = c.mask().disc(hx - 1.55 * k, hy - 1.1 * k, 1.85 * k).disc(hx + 1.55 * k, hy - 1.1 * k, 1.85 * k).poly([[hx - 3.3 * k, hy - 0.5 * k], [hx + 3.3 * k, hy - 0.5 * k], [hx, hy + 3.6 * k]]);
    shade(c.f, heart, lv >= 2 ? [B[2], B[3], B[4], B[5], hex("#ffffff"), hex("#ffffff")] : [B[1], B[2], B[3], B[4], B[5], hex("#ffffff")], { mode: "round", out: hex("#1a0206"), spec: 0.94 });
    outline(c.f, outer, OUT);
    rimLight(c.f, rimM, u * TAU - Math.PI / 2, 0.38, hex("#fffbe8"), c.D - 1);
  });
  return one("laststand", [lay]);
}

/** Прилив сил: значок над подписью (не круг) — три багровых шеврона-стрелы вверх (3–4 тона с фаской, контур); сила поднимается снизу вверх:
 *  шевроны по очереди разгораются в 4 ступени и остывают, у верхнего на пике вспыхивает искра. */
export function ovMight(): Art {
  const B = RP.crimson;
  const lay = icon("chevrons", 12, 15, 12, 12, (c, t, u) => {
    for (let i = 0; i < 3; i++) {
      const y = 12.2 - i * 3.9, ph = (u - i * 0.22 + 1) % 1, v = ph < 0.18 ? easeOut(ph / 0.18) : ph < 0.72 ? 1 - easeInOut((ph - 0.18) / 0.54) : 0, lv = Math.round(v * 3);
      const m = c.mask().path([[1.6, y + 2.2], [6, y - 1.9], [10.4, y + 2.2]], 1.05);
      const R: Ramp = [[B[1], B[2], B[3], B[3], B[4]], [B[1], B[2], B[3], B[4], B[4]], [B[2], B[3], B[4], B[5], B[5]], [B[3], B[4], B[5], hex("#ffd8dc"), hex("#ffffff")]][lv];
      shade(c.f, m, R, { out: hex("#1a0206"), bevel: 0.6 });
      if (i === 2 && lv === 3) c.dot(6, y - 2.5, 1.0, hex("#ffffff"));
    }
    // искра силы поднимается по середине шевронов снизу вверх (1 px мира за кадр) — каждый кадр свой
    const sy = 14.2 - u * 13; c.dot(6, sy, 1.0, sy < 3 ? hex("#ffffff") : hex("#ffd8dc"));
  });
  return one("dmgboost", [lay]);
}

/** Кровавые узы: сердце (шар в 5 тонов с бликом, контур) бьётся — удар и затухание; по диагонали его обвивает цепь из пяти звеньев, блик бежит по звеньям. */
export function ovBond(): Art {
  const B = RP.crimson, S = RP.steel;
  const lay = icon("heart", 16, 15, 12, 12, (c, t, u) => {
    const beat = Math.max(Math.exp(-(((u - 0.05) / 0.07) ** 2)), 0.6 * Math.exp(-(((u - 0.24) / 0.07) ** 2))), k = 1 + 0.12 * beat, cx = 8, cy = 8;
    const m = c.mask().disc(cx - 2.3 * k, cy - 1.6 * k, 2.9 * k).disc(cx + 2.3 * k, cy - 1.6 * k, 2.9 * k).poly([[cx - 5.1 * k, cy - 0.6 * k], [cx + 5.1 * k, cy - 0.6 * k], [cx, cy + 5.9 * k]]);
    shade(c.f, m, beat > 0.5 ? [B[2], B[3], B[4], B[5], hex("#ffffff"), hex("#ffffff")] : [B[1], B[2], B[3], B[4], B[5], hex("#ffffff")], { mode: "round", out: hex("#1a0206"), spec: 0.95 });
    // цепь: звенья по диагонали, чередуются плашмя и ребром
    for (let i = 0; i < 5; i++) {
      const q = i / 4, x = 2.0 + q * 12, y = 12.6 - q * 10.6, flatL = i % 2 === 0, lit = Math.abs(u * 5 - i) < 0.8 || Math.abs(u * 5 - i - 5) < 0.8;
      const lm = flatL ? c.mask().ell(x, y, 1.9, 1.25, -0.72).ell(x, y, 0.85, 0.35, -0.72, "sub") : c.mask().ell(x, y, 1.6, 0.62, -0.72);
      shade(c.f, lm, lit ? [S[2], S[3], S[4], S[5], hex("#ffffff")] : [S[1], S[2], S[3], S[4], S[5]], { out: INK, bevel: 0.45 });
    }
  });
  return one("bond", [lay]);
}

/** Разъярённый: три огненных когтя (изогнутые клиновидные штрихи: ядро → жёлтый → оранжевый → багровый край, тёмный контур) наливаются жаром
 *  и остывают (6 ступеней); стаки — точками под значком. */
export function ovFury(): Art {
  const ramps: Ramp[] = [
    [hex("#5c0c1c"), hex("#9a1628"), hex("#d4283c"), hex("#f06a3a"), hex("#ffb060")],
    [hex("#7a0e14"), hex("#c01e22"), hex("#ee4a26"), hex("#ff9a3a"), hex("#ffd27a")],
    [hex("#9a1610"), hex("#e0361a"), hex("#ff7a2a"), hex("#ffc04a"), hex("#fff0a8")],
  ];
  // три когтя-разреза наискось (сверху справа вниз влево), каждый — серп: тонкие концы, толстая середина; жар — быстро разгорается, медленно остывает;
  // по среднему когтю пробегает искра — каждый кадр свой
  const lay = icon("claws", 15, 14, 12, 12, (c, t, u) => {
    const v = u < 0.25 ? easeOut(u / 0.25) : 1 - easeInOut((u - 0.25) / 0.75), lv = Math.min(5, Math.round(v * 5)), R = ramps[Math.min(2, Math.floor(lv / 2))];
    if (lv >= 2) glow(c, 7.5, 7, 7.2, 6.8, hex("#ff5a2a"), 0.08 + (lv - 2) * 0.05, 2);
    const mids: [number, number][][] = [];
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 3.7, pts: [number, number][] = [], ws: number[] = [];
      for (let s = 0; s <= 10; s++) { const q = s / 10; pts.push([12.4 + off - q * 9.4 - Math.sin(q * Math.PI) * 1.5, 1.4 + q * 11.2 + Math.abs(i - 1) * 0.5 - Math.sin(q * Math.PI) * 0.4]); ws.push(0.3 + 1.25 * Math.sin(q * Math.PI)); }
      const m = c.mask(); for (let s = 0; s < 10; s++) m.cap(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], ws[s], ws[s + 1]);
      const d = m.dist(4); let dm = 0; for (const x of d) dm = Math.max(dm, x);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) { const q = d[y * m.w + x] / Math.max(1, dm); c.f.set(x, y, R[q < 0.3 ? 1 : q < 0.55 ? 2 : q < 0.8 ? 3 : 4]); }
      outline(c.f, m, hex("#1a0206"));
      mids.push(pts);
    }
    const sp = mids[1][Math.min(10, Math.round(u * 10))]; c.dot(sp[0], sp[1], 1, hex("#fff6c0"));
  });
  return one("fury", [lay], { pips: { max: 5, color: hex("#ff5a3a") } });
}

/** Ослабление: сломанный меч остриём вниз — гарда и рукоять сверху, клинок (сталь в 4 тона), трещина тлеет фиолетовым, обломок чуть опускается (easing). */
export function ovWeak(): Art {
  const S = RP.steel, V = RP.lilac, G = RP.gold, wood = [hex("#2a160c"), hex("#4a2a16"), hex("#70442a"), hex("#986038"), hex("#b8844e")];
  const lay = icon("sword", 12, 16, 12, 12, (c, t, u) => {
    const cx = 6, drop = 0.4 + 0.6 * easeInOut(0.5 - 0.5 * Math.cos(u * TAU));
    const grip = c.mask().rect(cx - 0.8, 0.6, 1.6, 3.4); shade(c.f, grip, wood, { out: INK, bevel: 0.5 });
    const pom = c.mask().disc(cx, 0.9, 0.9); shade(c.f, pom, [G[1], G[2], G[3], G[4], G[5]], { out: INK, mode: "round" });
    const guard = c.mask().cap(cx - 3.4, 4.6, cx + 3.4, 4.6, 0.75); shade(c.f, guard, [G[1], G[2], G[3], G[4], G[5]], { out: INK, bevel: 0.5 });
    const up = c.mask().poly([[cx - 1.5, 5.4], [cx + 1.5, 5.4], [cx + 1.5, 9.0], [cx + 0.2, 9.8], [cx - 1.5, 9.2]]);
    shade(c.f, up, [S[1], S[2], S[3], S[4], S[5]], { out: INK, bevel: 0.6 });
    const y0 = 10.7 + drop * 1.0, tl = 0.18 + drop * 0.1, R2 = (x: number, y: number): [number, number] => [cx + (x - cx) * Math.cos(tl) - (y - y0) * Math.sin(tl) + 0.5, y0 + (x - cx) * Math.sin(tl) + (y - y0) * Math.cos(tl)];
    const low = c.mask().poly([R2(cx - 1.5, y0 + 0.2), R2(cx - 0.1, y0 - 0.6), R2(cx + 1.5, y0 + 0.3), R2(cx + 1.3, y0 + 2.4), R2(cx, y0 + 4.2), R2(cx - 1.3, y0 + 2.4)]);
    shade(c.f, low, [S[1], S[2], S[3], S[4], S[5]], { out: INK, bevel: 0.6 });
    const v = 0.5 + 0.5 * Math.sin(u * TAU), lv = Math.round(v * 4);
    glow(c, cx, 10.4 + drop * 0.5, 3.0, 2.2, V[4], 0.2 + lv * 0.08, 2);
    const crack = c.mask().cap(cx - 1.2, 9.9 + drop * 0.4, cx + 1.2, 10.3 + drop * 0.5, 0.42); fillM(c, crack, stepTone(V, v, 3, 5));
  });
  return one("weak", [lay]);
}

/** Ядовитый клинок: два изогнутых змеиных клыка (кость в 3 тона — свет снаружи сверху, середина, тень у внутренней кромки; контур), загнуты
 *  внутрь, с острым кончиком; капля яда (4 тона, блик) по очереди набухает на кончике то одного, то другого клыка, срывается между ними
 *  и гаснет сжатием. Стаки — точками. */
export function ovVenom(): Art {
  const P = RP.poison, F: Ramp = [hex("#6e6252"), hex("#a89c84"), hex("#d8cfba"), hex("#f4eedf"), hex("#ffffff")], OUT = hex("#1a120a");
  const lay = icon("fangs", 14, 15, 12, 12, (c, t, u) => {
    for (const sg of [-1, 1]) {
      // левый клык (sg = −1) — зеркало правого по x = 7: широкое основание сверху, внешний край выгнут, кончик загнут к середине
      const X = (x: number) => (sg < 0 ? x : 14 - x);
      // наружный край — дуга от основания вниз и внутрь к острию, внутренний — круче: полумесяц, как у змеиного клыка
      const fang = c.mask().poly([[X(1.0), 1.0], [X(0.9), 3.0], [X(1.4), 5.2], [X(2.4), 7.3], [X(3.8), 9.2], [X(5.9), 11.2], [X(5.5), 9.0], [X(4.6), 7.3], [X(4.1), 5.5], [X(4.0), 3.5], [X(4.4), 1.0]]);
      shade(c.f, fang, F, { out: OUT, bevel: 0.9, grad: 0.25 });
    }
    // капля: набухает на кончике (0–0.4), срывается и падает между клыками (0.4–0.8), гаснет сжатием (0.8–0.92)
    const p = u % 0.5 / 0.5, side = u < 0.5 ? -1 : 1, tx = 7 + side * 1.3;
    const dm = c.mask();
    if (p < 0.4) { const g = easeOut(p / 0.4); dm.disc(tx, 11.6 + g * 0.5, 0.55 + g * 0.75); }
    else if (p < 0.92) { const q = (p - 0.4) / 0.52, y = 12.4 + easeIn(Math.min(1, q / 0.75)) * 1.6, r = 1.25 * (q > 0.75 ? 1 - (q - 0.75) / 0.25 * 0.7 : 1), x = tx - side * q * 1.3; dm.disc(x, y, r).poly([[x - r * 0.8, y - 0.2], [x + r * 0.8, y - 0.2], [x, y - r * 1.9]]); }
    const tmp = new PC(c.f.w, c.f.h); shade(tmp, dm, [P[1], P[2], P[3], P[4], P[5]], { out: hex("#0a1e08"), mode: "round" }); c.f.blit(tmp, 0, 0);
  });
  return one("venom", [lay], { pips: { max: 5, color: hex("#7ad04a") } });
}

/** Проклятие: фиолетовая печать — кольцо 1.5 px (фаска, контур) с пентаграммой; печать поворачивается на 6° за кадр (симметрия 5), сердцевина дышит. */
export function ovCurse(): Art {
  const Lc = RP.lilac, Fe = RP.fel;
  const lay = icon("seal", 15, 15, 12, 12, (c, t, u) => {
    const cx = 7.5, cy = 7.5, rot = (u * TAU) / 5 - Math.PI / 2, e = 0.5 + 0.5 * Math.sin(u * TAU);
    glow(c, cx, cy, 7.2, 7.2, Lc[3], 0.16, 2);
    const ringM = c.mask().disc(cx, cy, 6.9).disc(cx, cy, 5.3, "sub");
    shade(c.f, ringM, [Lc[1], Lc[2], Lc[3], Lc[4], Lc[5]], { out: INK, bevel: 0.6 });
    const star = c.mask(); const P = (k: number): [number, number] => [cx + Math.cos(rot + (k * TAU) / 5) * 5.0, cy + Math.sin(rot + (k * TAU) / 5) * 5.0];
    for (let k = 0; k < 5; k++) star.cap(...P(k), ...P(k + 2), 0.42);
    fillM(c, star, Lc[4]); outline(c.f, star.clone().minus(ringM), withA(INK, 200));
    for (let y = 0; y < star.h; y++) for (let x = 0; x < star.w; x++) if (star.has(x, y) && !star.has(x, y - 1)) c.f.set(x, y, Lc[5]);
    const core = c.mask().disc(cx, cy, 1.1 + e * 0.5); shade(c.f, core, [Fe[2], Fe[3], Fe[4], Fe[5], hex("#ffffff")], { mode: "round", out: INK });
  });
  return one("curse", [lay]);
}

/** Проклятие рока: перевёрнутый треугольник рока (фиолетовая полоса с фаской, контур), внутри колышется зелёное пламя скверны. */
export function ovHex(): Art {
  const V = RP.violet, Fe = RP.fel;
  const lay = icon("doom", 14, 14, 12, 12, (c, t, u) => {
    const tri = (k: number) => c.mask().poly([[1 + k * 1.7, 1.5 + k], [13 - k * 1.7, 1.5 + k], [7, 13.2 - k * 1.9]]);
    glow(c, 7, 6.5, 6.4, 6.2, V[4], 0.14 + 0.08 * Math.sin(u * TAU), 2);
    const outer = tri(0), band = outer.clone().minus(tri(1.7));
    const fl = flameMask(c, 7, 9.0, 6.2 + 0.7 * Math.sin(u * TAU * 2), 1.9, Math.sin(u * TAU) * 1.2);
    flameFill(c, fl, [Fe[1], Fe[2], Fe[3], Fe[4], Fe[5]], 9.0, 6.6);
    shade(c.f, band, [V[1], V[2], V[3], V[4], V[5]], { out: null, bevel: 0.6 });
    outline(c.f, outer, INK);
  });
  return one("hex", [lay]);
}

/** Метка охотника: янтарный прицел — кольцо с фаской и контуром, четыре засечки внутрь и точка в центре; сжимается к цели и разжимается (easing),
 *  яркость в 5 ступеней. */
export function ovHunterMark(): Art {
  const Am = RP.amber;
  const lay = icon("reticle", 14, 14, 12, 12, (c, t, u) => {
    // прицел сжимается к цели (быстро) и разжимается (медленно), засечки поворачиваются на четверть оборота за цикл
    const e = u < 0.35 ? 1 - easeInOut(u / 0.35) : easeInOut((u - 0.35) / 0.65), r = 4.7 + e * 1.4, cx = 7, cy = 7, lv = Math.round((1 - e) * 4), rot = (u * TAU) / 4;
    const R: Ramp = [Am[1], Am[2], Am[3], Am[4], lv >= 3 ? hex("#ffffff") : Am[5]];
    const ringM = c.mask().disc(cx, cy, r).disc(cx, cy, r - 1.25, "sub");
    const ticks = c.mask();
    for (let k = 0; k < 4; k++) { const a = rot + (k * TAU) / 4, ca = Math.cos(a), sa = Math.sin(a); ticks.cap(cx + ca * (r - 0.6), cy + sa * (r - 0.6), cx + ca * (r - 2.8), cy + sa * (r - 2.8), 0.5); ticks.cap(cx + ca * (r + 0.4), cy + sa * (r + 0.4), cx + ca * (r + 1.6), cy + sa * (r + 1.6), 0.5); }
    const dot = c.mask().disc(cx, cy, 0.95);
    const all = ringM.clone().union(ticks).union(dot);
    shade(c.f, all, R, { out: INK, bevel: 0.5 });
    if (lv >= 3) glow(c, cx, cy, 1.8, 1.8, Am[5], 0.4, 2);
  });
  return one("hunter_mark", [lay]);
}

/** Шок: молния (бело-голубое ядро, голубые края, тёмно-синий контур) вспыхивает ступенями, вокруг перескакивают искры 2×2. */
export function ovShock(): Art {
  const Bt = RP.bolt;
  const lay = icon("bolt", 12, 15, 12, 12, (c, t, u) => {
    const v = [1, 0.55, 0.8, 0.4, 0.65, 0.3, 0.9, 0.5, 0.35, 0.7, 0.45, 0.6][t], lv = Math.round(v * 4);
    glow(c, 6, 7.5, 5.6, 7.2, Bt[3], 0.12 + v * 0.16, 2);
    const m = c.mask().poly([[7.6, 0.6], [2.6, 8.0], [5.6, 8.0], [3.6, 14.4], [9.6, 5.8], [6.4, 5.8], [8.8, 0.6]]);
    shade(c.f, m, [Bt[1], Bt[2], Bt[3], lv >= 2 ? Bt[4] : Bt[3], lv >= 3 ? hex("#ffffff") : Bt[4]], { out: hex("#081040"), bevel: 0.7 });
    const r = rng(t * 7 + 3);
    for (let k = 0; k < 2; k++) { const a = r() * TAU, d = 5 + r() * 1.5; c.dot(6 + Math.cos(a) * d * 0.8, 7.5 + Math.sin(a) * d, 1, k ? Bt[4] : hex("#ffffff")); }
  });
  return one("shock", [lay]);
}

/** Знак смерти: рунная плитка рыцаря смерти (контур, 5 тонов, светлая верхняя грань) с вырезанным черепом; глазницы и кромка светятся, свет дышит;
 *  метки — точками. */
export function ovMortality(): Art {
  const T = ["#dff6ff", "#8fd0ea", "#5a9cc8", "#3a6aa0", "#243e6c"].map((x) => hex(x)), O = hex("#0a1626"), groove = hex("#0e2a4a"), lit = hex("#a4e8fa");
  // плитка — тёмный камень рун (светлая верхняя грань, контур); череп выложен светом: свод и челюсть светлые, глазницы тёмные;
  // свет дышит (5 ступеней, быстрый подъём), блик-искра раз в цикл бежит по верхней грани
  const lay = icon("tile", 12, 14, 12, 12, (c, t, u) => {
    const e = u < 0.3 ? easeOut(u / 0.3) : 1 - easeInOut((u - 0.3) / 0.7), lv = Math.round(e * 4);
    glow(c, 6, 7, 6.4, 7.4, hex("#4aa8d8"), 0.1 + 0.12 * e, 2);
    const tile = c.mask().poly([[3, 0.8], [9, 0.8], [11, 3], [11, 11], [9, 13.2], [3, 13.2], [1, 11], [1, 3]]);
    shade(c.f, tile, [hex("#0e1c34"), hex("#1a2e52"), T[4], T[3], T[2]], { out: O, bevel: 1.0, grad: 0.35 });
    const sk = c.mask().disc(6, 5.9, 2.9).rect(4.3, 7.8, 3.4, 2.6);
    const SK = [[hex("#2a6c9c"), hex("#4aa8d8"), hex("#7fd4f4")], [hex("#3a86b8"), hex("#6ac8e8"), hex("#b8f0ff")], [hex("#4aa8d8"), hex("#8fd0ea"), hex("#dff6ff")], [hex("#6ac8e8"), hex("#b8f0ff"), hex("#ffffff")], [hex("#8fd0ea"), hex("#dff6ff"), hex("#ffffff")]][lv];
    shade(c.f, sk, [SK[0], SK[0], SK[1], SK[2], SK[2]], { out: groove, mode: "round" });
    for (const ex of [4.85, 7.15]) { const em = c.mask().disc(ex, 6.3, 0.95); fillM(c, em, groove); }
    const nose = c.mask().poly([[5.6, 8.0], [6.4, 8.0], [6, 7.2]]); fillM(c, nose, groove);
    for (const tx of [5.2, 6.8]) { const tm = c.mask().rect(tx - 0.25, 9.1, 0.5, 1.3); fillM(c, tm, groove); }
    const gx = 2.6 + u * 6.8; c.dot(gx, 1.9, 0.8, withA(lit, 255 * bell(u, 0.2, 0.3)));
  });
  return one("mortality", [lay], { pips: { max: 5, color: hex("#6ac8e8") } });
}

/** Вне закона: алая печать — кольцо с фаской и контуром, внутри маленький щит, перечёркнутый крестом; печать наливается красным в 6 ступеней и остывает. */
export function ovOutlaw(): Art {
  const B = RP.crimson, S = RP.steel;
  const lay = icon("seal", 15, 15, 12, 12, (c, t, u) => {
    const v = 0.5 - 0.5 * Math.cos(u * TAU), lv = Math.round(v * 5), cx = 7.5, cy = 7.5;
    const R: Ramp = [B[Math.min(2, lv >> 1)], B[1 + Math.min(2, lv >> 1)], B[2 + Math.min(2, lv >> 1)], B[3 + Math.min(1, lv >> 2)], lv >= 4 ? hex("#ffffff") : B[5]];
    if (lv >= 2) glow(c, cx, cy, 7.4, 7.4, B[4], 0.08 + lv * 0.04, 2);
    const ringM = c.mask().disc(cx, cy, 7.0).disc(cx, cy, 5.5, "sub");
    shade(c.f, ringM, R, { out: INK, bevel: 0.6 });
    rimLight(c.f, ringM, u * TAU - Math.PI / 2, 0.42, lv >= 3 ? hex("#ffffff") : B[5], c.D - 1);
    const sh = c.mask().poly([[cx - 3.2, cy - 3.4], [cx + 3.2, cy - 3.4], [cx + 3.2, cy + 0.2], [cx, cy + 3.8], [cx - 3.2, cy + 0.2]]);
    shade(c.f, sh, [S[1], S[2], S[3], S[4], S[5]], { out: INK, bevel: 0.7 });
    const x = c.mask().cap(cx - 3.9, cy - 3.9, cx + 3.9, cy + 3.9, 0.85).cap(cx - 3.9, cy + 3.9, cx + 3.9, cy - 3.9, 0.85);
    shade(c.f, x, R, { out: INK, bevel: 0.5 });
  });
  return one("outlaw", [lay]);
}

/** Чужак в столице: янтарное око — белок в 3 тона, радужка шаром в 4 тона, зрачок, веки с контуром; смотрит влево-вправо (easing) и моргает. */
export function ovIntruder(): Art {
  const Am = RP.amber, Wt = [hex("#8a7a6a"), hex("#c8bcae"), hex("#ece4d8"), hex("#ffffff")];
  const lay = icon("eye", 16, 10, 12, 12, (c, t, u) => {
    const look = Math.sin(u * TAU) * 2.4, blink = t === 6 ? 0.35 : t === 7 ? 0.65 : 1, cx = 8, cy = 5.2, hh = 3.9 * blink;
    const eye = c.mask().fill((x, y) => { const q = (x - cx) / 7.2; if (Math.abs(q) > 1) return false; const h = hh * Math.pow(1 - q * q, 0.75); return Math.abs(y - cy) <= h; });
    flat(c.f, eye, Wt[2]);
    for (let y = 0; y < eye.h; y++) for (let x = 0; x < eye.w; x++) if (eye.has(x, y) && (!eye.has(x, y - 2) || !eye.has(x + 2, y))) c.f.set(x, y, Wt[1]);
    if (blink > 0.5) {
      const ir = c.mask().disc(cx + look, cy, 2.7);
      for (let y = 0; y < ir.h; y++) for (let x = 0; x < ir.w; x++) if (!eye.has(x, y)) ir.put(x, y, false);
      shade(c.f, ir, [Am[1], Am[2], Am[3], Am[4], Am[5]], { mode: "round", out: null });
      const pu = c.mask().ell(cx + look * 1.05, cy, 0.85, 1.6); fillM(c, pu, hex("#140804"));
      c.dot(cx + look - 1.0, cy - 1.0, 0.8, hex("#ffffff"));
      // блик по радужке обходит круг — каждый кадр свой
      const ga = u * TAU; c.dot(cx + look + Math.cos(ga) * 1.9, cy + Math.sin(ga) * 1.9, 0.5, Am[5]);
    }
    outline(c.f, eye, hex("#2a1004"), 1);
    // веки: верхнее — толще
    for (let y = 0; y < eye.h; y++) for (let x = 0; x < eye.w; x++) if (eye.has(x, y) && !eye.has(x, y - 1)) c.f.set(x, y, Am[1]);
  });
  return one("intruder", [lay]);
}

/** Зелье: склянка 10×14 — стекло с контуром и светлой кромкой, голубое зелье шаром в 4 тона, пузырьки поднимаются, блик скользит по стеклу.
 *  Покачивание — в коде. */
export function ovPotion(): Art {
  const Az = RP.azure, glass = hex("#e8f6ff"), cork = [hex("#3a2216"), hex("#5e3a22"), hex("#8a5a34"), hex("#b07e4c"), hex("#d0a070")];
  const lay = icon("flask", 10, 14, 12, 12, (c, t, u) => {
    const body = c.mask().disc(5, 9.2, 4.2).rect(3.6, 2.6, 2.8, 4);
    const liq = c.mask().disc(5, 9.2, 3.3).rect(1, 2, 8, 4.6, "sub");
    flat(c.f, body, withA(glass, 70));
    shade(c.f, liq, [Az[1], Az[2], Az[3], Az[4], Az[5]], { mode: "round", out: null });
    for (let k = 0; k < 2; k++) { const p = (u + k * 0.5) % 1, y = 11.8 - easeOut(p) * 5, x = 4.2 + k * 1.8 + Math.sin(p * 6) * 0.3; if (p < 0.9) { c.dot(x, y, 0.8, Az[5]); } }
    outline(c.f, body, INK);
    for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) if (body.has(x, y) && (!body.has(x - 1, y) || !body.has(x, y - 1)) && !liq.has(x, y)) c.f.set(x, y, glass);
    const ck = c.mask().rect(3.4, 0.6, 3.2, 2.4); shade(c.f, ck, cork, { out: INK, bevel: 0.5 });
    if (t < 3) { const gx = 2.6 + t * 1.2; const g = c.mask().cap(gx, 7, gx + 0.6, 10.5, 0.4); for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.has(x, y) && body.has(x, y)) c.f.set(x, y, withA(hex("#ffffff"), [230, 160, 90][t])); }
  }, { bob: { amp: 1, period: 1800 } });
  return one("potion", [lay]);
}

/** Вой питомца: лапа зверя (подушечки с фаской, контур) и по две дуги звука с каждой стороны — расходятся и гаснут. */
export function ovWarcry(): Art {
  const E = RP.ember;
  const lay = icon("howl", 22, 12, 12, 12, (c, t, u) => {
    for (let k = 0; k < 2; k++) {
      const p = (u + k * 0.5) % 1, r = 3.6 + easeOut(p) * 5.5, al = bell(p, 0.15, 0.5);
      for (const sg of [-1, 1]) {
        const m = c.mask();
        for (let i = 0; i <= 8; i++) { const a = -0.75 + (i / 8) * 1.5; m.disc(11 + sg * (2.5 + Math.cos(a) * r), 6.4 + Math.sin(a) * r * 0.9, 0.55); }
        const tmp = new PC(c.f.w, c.f.h); flat(tmp, m, p < 0.5 ? E[4] : E[3]); outline(tmp, m, withA(INK, 180)); c.f.blit(tmp, 0, 0, false, al);
      }
    }
    // лапа вспыхивает раз в цикл (вой), затем остывает
    const v = u < 0.15 ? easeOut(u / 0.15) : 1 - easeInOut((u - 0.15) / 0.85), lv = Math.round(v * 3);
    const paw = c.mask().ell(11, 8.2, 2.5, 2.1).disc(8.4, 5.0, 1.05).disc(10.1, 3.9, 1.05).disc(11.9, 3.9, 1.05).disc(13.6, 5.0, 1.05);
    shade(c.f, paw, [E[1 + Math.min(1, lv)], E[2], E[3], E[4], lv >= 2 ? hex("#ffffff") : E[5]], { mode: "round", out: INK });
  });
  return one("warcry", [lay]);
}

// ====================================================================== у руки (двойная плотность)
const hand = (id: string, W: number, H: number, n: number, fps: number, draw: (c: Cv, t: number, u: number) => void, extra: Partial<Layer> = {}) =>
  L2(id, W, H, n, fps, "hand", "over", [0.5, 0.5], draw, extra);

/** Гарантированный крит: алая восьмилучевая звезда 10 px (белое ядро, 3 тона) с ореолом; 12 кадров на 45° поворота, ореол дышит. */
export function ovCrit(): Art {
  const B = RP.crimson;
  const lay = hand("star", 14, 14, 12, 12, (c, t, u) => {
    const cx = 7, cy = 7, rot = (u * Math.PI) / 4, e = 0.5 + 0.5 * Math.sin(u * TAU);
    glow(c, cx, cy, 6.2 + e * 0.6, 6.2 + e * 0.6, B[3], 0.16 + 0.12 * e, 3);
    const m = c.mask(), pts: [number, number][] = [];
    for (let i = 0; i < 16; i++) { const a = rot + (i * TAU) / 16, r = i % 4 === 0 ? 5.2 : i % 2 === 0 ? 3.4 : 1.6; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    m.poly(pts);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) { const q = Math.hypot((x + 0.5) / c.D - cx, (y + 0.5) / c.D - cy); c.f.set(x, y, q < 1.2 ? hex("#ffffff") : q < 2.3 ? B[5] : q < 3.6 ? B[4] : B[3]); }
    outline(c.f, m, hex("#1a0206"));
  });
  return one("critnext", [lay]);
}

/** Исступление: огненное колесо 15 px — три языка пламени (5 тонов) бегут по кругу, хвосты гаснут; 12 кадров на треть оборота (10° за кадр). */
export function ovLegFrenzy(): Art {
  const Fl = RP.flame;
  const lay = hand("wheel", 16, 16, 12, 12, (c, t, u) => {
    const cx = 8, cy = 8, R = 5.0;
    glow(c, cx, cy, 7.6, 7.6, Fl[2], 0.14, 2);
    for (let i = 0; i < 3; i++) {
      const a0 = (u * TAU) / 3 + (i * TAU) / 3, m = c.mask(), N = 10;
      for (let s = 0; s < N; s++) { const q = s / (N - 1), a = a0 - q * 1.7, r = R + Math.sin(q * Math.PI) * 0.9, w = 1.9 * (1 - q) + 0.35; m.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, w); }
      const d = m.dist(6); let dm = 0; for (const x of d) dm = Math.max(dm, x);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.has(x, y)) {
        const ax = Math.atan2((y + 0.5) / c.D - cy, (x + 0.5) / c.D - cx), lag = ang(a0 - ax) / 1.7, heat = (d[y * m.w + x] / Math.max(1, dm)) * (1.2 - Math.min(1, lag) * 0.8);
        c.f.set(x, y, Fl[heat < 0.22 ? 0 : heat < 0.45 ? 1 : heat < 0.66 ? 2 : heat < 0.86 ? 3 : 4]);
      }
    }
  });
  return one("leg_frenzy", [lay], { pips: { max: 5, color: hex("#ffa030") } });
}

/** Еда: миска у руки (дерево с фаской, похлёбка), над ней два-три мягких клуба пара поднимаются и тают. */
export function ovFood(): Art {
  const wood = [hex("#2a160c"), hex("#4a2a16"), hex("#70442a"), hex("#986038"), hex("#b8844e")], E = RP.ember;
  const lay = hand("bowl", 12, 16, 12, 12, (c, t, u) => {
    for (let k = 0; k < 3; k++) {
      const p = (u + k / 3) % 1, y = 10.5 - easeOut(p) * 8.5, x = 4.6 + k * 1.6 + Math.sin((p + k * 0.3) * TAU) * 0.8, r = 1.2 + p * 1.6, al = bell(p, 0.2, 0.55) * 0.8;
      cloud(c, [[x, y, r], [x + r * 0.6, y + 0.4, r * 0.7]], [hex("#8a8496"), hex("#b8b2c4"), hex("#dcd8e4"), hex("#f4f2f8"), hex("#ffffff")], al);
    }
    const bowl = c.mask().fill((x, y) => y >= 11.4 && y <= 14.6 && Math.abs(x - 6) <= 4.8 * Math.sqrt(Math.max(0, 1 - ((y - 11.4) / 3.4) ** 2)));
    shade(c.f, bowl, wood, { out: INK, mode: "round" });
    const stew = c.mask().ell(6, 11.6, 4.0, 0.9); shade(c.f, stew, [E[1], E[2], E[3], E[4], E[5]], { out: null, mode: "round" });
  }, { dy: 3 });
  return one("food", [lay]);
}

// ====================================================================== частицы на теле (по краям силуэта)
/** Обновление: три креста 7×7 (белое ядро, зелёный в 3 тона, тёмно-зелёный контур) поднимаются по краям силуэта и гаснут (easing). */
export function ovRenew(): Art {
  const Lf = RP.leaf;
  const spots = [[-12, 6, 0], [12.5, 2, 0.34], [9, -10, 0.67]] as const;
  const lay = L2("crosses", 34, 36, 12, 12, "body", "over", [0.5, 0.5], (c, t, u) => {
    for (const [dx, dy, ph] of spots) {
      const p = (u + ph) % 1, al = bell(p, 0.2, 0.4), x = 17 + dx, y = 18 + dy + 6 - easeOut(p) * 10;
      const m = c.mask().rect(x - 1.1, y - 3.5, 2.2, 7).rect(x - 3.5, y - 1.1, 7, 2.2);
      const tmp = new PC(c.f.w, c.f.h);
      for (let yy = 0; yy < m.h; yy++) for (let xx = 0; xx < m.w; xx++) if (m.has(xx, yy)) { const q = Math.max(Math.abs((xx + 0.5) / c.D - x), Math.abs((yy + 0.5) / c.D - y)); tmp.set(xx, yy, q < 1.1 ? hex("#ffffff") : q < 2.4 ? Lf[4] : Lf[3]); }
      outline(tmp, m, hex("#0a2a10"));
      c.f.blit(tmp, 0, 0, false, al);
    }
  });
  return one("renew", [lay]);
}

/** Скрытность: три клуба тёмно-сизого дыма 6–8 px — непрозрачное ядро в 3 тона (тёмно-сизый, сизый, блик) и тёмная кромка 1 px, как
 *  в паках, — рождаются у краёв силуэта (бедро слева, бок справа, плечо слева), растут, поднимаются и растворяются сжатием и дизером
 *  за 3 кадра (без альфы). Читаются и на полупрозрачном герое (в скрытности альфа героя 0,4), на траве и на брусчатке. */
export function ovStealth(): Art {
  const T: [RGBA, RGBA, RGBA] = [hex("#3a4259"), hex("#66728f"), hex("#a9b5d2")], OUT = hex("#141824");
  const spots = [[-11, 7, 0], [11.5, 0, 1 / 3], [-11.5, -5, 2 / 3]] as const;
  const lay = L1("smoke", 40, 44, 12, 12, "body", "over", [0.5, 0.5], (f, t, u) => {
    const c = new Cv(40, 44, 1);
    for (const [dx, dy, ph] of spots) {
      const p = (u + ph) % 1, sg = Math.sign(dx), grow = p < 0.34 ? easeOut(p / 0.34) : 1, fade = p > 0.7 ? (p - 0.7) / 0.3 : 0;
      const s = (0.42 + 0.58 * grow) * (1 - 0.35 * fade), r = 3.4 * s, b = p * Math.PI;
      const x = 20 + dx + sg * easeOut(p) * 2.2, y = 22 + dy - easeOut(p) * 6.5;
      puff(c, [[x - sg * r * 0.62, y + r * 0.3 + Math.sin(b) * 0.3, r * 0.64], [x + sg * r * 0.55, y + r * 0.36, r * 0.7], [x, y - r * 0.34, r * 0.76]], T, OUT, fade > 0 ? 0.25 + fade * 0.75 : 0);
    }
    f.blit(c.f, 0, 0);
  });
  return one("stealth", [lay]);
}

/** Ускорение: у пяток — крылышки, как у крылатых сандалий: по 4 сужающихся пера внахлёст (белый, светло-голубой, голубая тень; голубой обод),
 *  у основания — золотая застёжка; веер раскрывается и складывается (взмах, easing). За ногами — штрихи скорости 2 px (белый и голубой),
 *  уносятся назад и укорачиваются. */
export function ovHaste(): Art {
  const Wt: Ramp = [hex("#6a96cc"), hex("#6a96cc"), hex("#c6def8"), hex("#ffffff"), hex("#ffffff")], RIM = hex("#20488a"), G = RP.gold, Az = RP.sky;
  const lay = L2("wings", 36, 14, 12, 12, "feet", "over", [0.5, 1], (c, t, u) => {
    const flap = easeInOut(0.5 + 0.5 * Math.sin(u * TAU));
    for (let k = 0; k < 2; k++) {
      const p = (u + k * 0.37) % 1, len = 5 * (1 - easeIn(p)), y = 9.2 + k * 2.6;
      if (len < 1.2) continue;
      for (const sg of [-1, 1]) {
        const x0 = 18 + sg * (10 + easeOut(p) * 5), m = c.mask().cap(x0, y, x0 + sg * len, y, 1.0, 0.7);
        for (let yy = 0; yy < m.h; yy++) for (let xx = 0; xx < m.w; xx++) if (m.has(xx, yy)) c.f.set(xx, yy, (yy + 0.5) / c.D < y ? hex("#ffffff") : Az[3]);
      }
    }
    for (const sg of [-1, 1]) {
      const bx = 18 + sg * 5.2, by = 11.6;
      for (let i = 0; i < 4; i++) {
        // перо i: 0 — верхнее (длинное, сзади) … 3 — нижнее (короткое, спереди); угол от горизонтали наружу
        const a = 0.1 + (3 - i) * (0.17 + 0.13 * flap), L = 7.4 - i * 1.35, dx = sg * Math.cos(a), dy = -Math.sin(a);
        const m = c.mask().path([[bx, by], [bx + dx * L * 0.55, by + dy * L * 0.55 - 0.35], [bx + dx * L, by + dy * L - 0.2]], 1.45 - i * 0.12, 0.35);
        const tmp = new PC(c.f.w, c.f.h); shade(tmp, m, Wt, { out: RIM, bevel: 0.6 }); c.f.blit(tmp, 0, 0);
      }
      const clasp = c.mask().disc(bx, by + 0.2, 1.25); shade(c.f, clasp, [G[1], G[2], G[3], G[4], G[5]], { out: INK, mode: "round" });
    }
  });
  return one("haste", [lay]);
}

/** Маунт: клубы пыли (коричневые, 3 тона, без контура) вылетают из-под копыт назад, растут и гаснут. Рисуется только в движении
 *  (стоит — нет); при движении влево клиент зеркалит слой. */
export function ovMount(): Art {
  const Dz = RP.dust, ramp: Ramp = [Dz[1], Dz[2], Dz[3], Dz[4], Dz[4]];
  const lay = L1("dust", 48, 18, 12, 12, "feet", "under", [0.62, 0.8], (f, t, u) => {
    const c = new Cv(48, 18, 1);
    for (const [hx, ph] of [[30, 0], [24, 0.41]] as const) for (const k of [0, 0.34, 0.71]) {
      const p = (u + ph + k) % 1, e = easeOut(p), x = hx - e * 16, y = 13.5 - e * 4 - Math.sin(p * Math.PI) * 1.5, r = 1.6 + p * 2.6;
      cloud(c, [[x, y, r], [x - r * 0.7, y + 0.6, r * 0.75]], ramp, 0.85 * bell(p, 0.12, 0.55), { edgeA: 0.65 });
    }
    f.blit(c.f, 0, 0);
  });
  return one("mount", [lay], { only: "moving" });
}

/** Яд: полупрозрачные пузыри (шар в 4 тона, светлая кромка, блик) поднимаются у ног и по бокам силуэта и лопаются. */
export function ovPoison(): Art {
  const P = RP.poison;
  const spots = [[-12, 8, 0, 1.5], [-10, -2, 0.3, 1.1], [12, 6, 0.55, 1.4], [11, -4, 0.8, 1.0], [-4, 14, 0.15, 1.2], [5, 14, 0.65, 1.0]] as const;
  const lay = L2("bubbles", 32, 34, 12, 12, "body", "over", [0.5, 0.5], (c, t, u) => {
    for (const [dx, dy, ph, r] of spots) {
      const p = (u + ph) % 1, x = 16 + dx + Math.sin((p + ph) * TAU) * 0.6, y = 17 + dy - easeOut(p) * 7;
      if (p > 0.86) { const q = (p - 0.86) / 0.14, m = c.mask().disc(x, y, r + 0.6 + q).disc(x, y, r + q, "sub"); const tmp = new PC(c.f.w, c.f.h); flat(tmp, m, P[4]); c.f.blit(tmp, 0, 0, false, 0.6 * (1 - q)); continue; }
      const m = c.mask().disc(x, y, r * (0.6 + 0.4 * Math.min(1, p * 4)));
      const tmp = new PC(c.f.w, c.f.h); shade(tmp, m, [P[1], P[2], P[3], P[4], P[5]], { mode: "round", out: null });
      c.f.blit(tmp, 0, 0, false, 0.45);
      const rimM = c.mask().disc(x, y, r * (0.6 + 0.4 * Math.min(1, p * 4)) + 0.55).minus(m); flat(c.f, rimM, withA(P[0], 210));
      c.dot(x - r * 0.35, y - r * 0.4, 0.75, P[5]);
    }
  });
  return one("poison", [lay]);
}

/** Кровотечение: капли (шар в 4 тона, блик, тёмный край) срываются с краёв силуэта, падают и разбиваются брызгами у ног. */
export function ovBleed(): Art {
  const B = RP.crimson;
  const spots = [[-11, -4, 0], [11.5, 0, 0.33], [-9, 6, 0.67]] as const;
  const lay = L2("drops", 30, 34, 12, 12, "body", "over", [0.5, 0.5], (c, t, u) => {
    for (const [dx, dy, ph] of spots) {
      const p = (u + ph) % 1, x = 15 + dx, y0 = 17 + dy, floor = 17 + 15;
      if (p < 0.72) {
        const q = p / 0.72, y = y0 + easeIn(q) * (floor - y0 - 1.5), m = c.mask().disc(x, y, 1.4).poly([[x - 1.3, y - 0.2], [x + 1.3, y - 0.2], [x, y - 2.9]]);
        const tmp = new PC(c.f.w, c.f.h); shade(tmp, m, [B[1], B[2], B[3], B[4], B[5]], { mode: "round", out: hex("#1a0206") }); c.f.blit(tmp, 0, 0, false, Math.min(1, q * 5));
      } else {
        const q = (p - 0.72) / 0.28, al = 1 - q;
        for (const [sx, sy] of [[-1, -0.6], [1, -0.6], [-0.5, -1.2], [0.5, -1.2]]) c.dot(x + sx * (1 + q * 2.4), floor - 1 + sy * (1 + q * 1.4) + q * q * 2, 1, withA(B[3], 255 * al));
        c.dot(x, floor - 0.5, 1.4, withA(B[2], 200 * al));
      }
    }
  });
  return one("bleed", [lay]);
}

/** Горение: четыре языка-капли по краям силуэта (светлое ядро → жёлтый → оранжевый → красный край, без чёрного контура) колышутся и поднимаются,
 *  угольки 1–2 px гаснут. */
export function ovBurn(): Art {
  const Fl = RP.flame;
  const tongues = [[-10.5, 10, 9, 2.5, 0], [10.5, 6, 10, 2.6, 0.35], [-9.5, -2, 7, 2.0, 0.6], [11, 14, 7.5, 2.1, 0.8]] as const;
  const lay = L1("flames", 36, 36, 12, 12, "body", "over", [0.5, 0.5], (f, t, u) => {
    const c = new Cv(36, 36, 1);
    for (const [dx, dy, h, w, ph] of tongues) {
      const fl = Math.sin((u * 2 + ph) * TAU), hh = h * (0.85 + 0.15 * Math.sin((u * 3 + ph) * TAU));
      flame(c, 18 + dx, 18 + dy, hh, w, fl * 1.6, [Fl[0], Fl[1], Fl[2], Fl[3], Fl[4]], 1, dx < 0 ? -0.6 : 0.6);
    }
    for (let k = 0; k < 4; k++) {
      const p = (u * 1.5 + k / 4) % 1, x = 18 + [-9, 10, -7, 9][k] + Math.sin(p * 5 + k) * 1.2, y = 18 + [4, 0, -6, 8][k] - easeOut(p) * 12;
      const al = bell(p, 0.1, 0.6); if (al > 0.2) c.set(x, y, withA(p < 0.4 ? Fl[4] : Fl[2], 255 * al));
    }
    f.blit(c.f, 0, 0);
  });
  return one("burn", [lay]);
}

/** Пожирание боли: три крупные капли крови 4×5 (шар в 4 тона, блик, контур) по спирали втягиваются к груди, за каждой — хвост 2 px;
 *  у груди капля сжимается и исчезает, на её месте вспыхивает мертвенно-голубая искра 5×5 (белое ядро, 3 тона). От кровотечения
 *  отличает движение к телу и голубой отблеск. */
export function ovBloodTap(): Art {
  const B = RP.crimson, Dt = RP.death, OUT = hex("#1a0206"), W = 40, H = 36, tx = 20, ty = 15.5;
  const pos = (i: number, q: number): [number, number] => { const a = (i * TAU) / 3 + 0.5 + q * 2.3, r = 16.5 * (1 - easeIn(q)); return [tx + Math.cos(a) * r, ty + Math.sin(a) * r * 0.72]; };
  const lay = L2("drops", W, H, 12, 12, "body", "over", [0.5, 0.5], (c, t, u) => {
    for (let i = 0; i < 3; i++) {
      const p = (u + i / 3) % 1;
      if (p < 0.78) {
        const q = p / 0.78, [x, y] = pos(i, q), s = (q < 0.12 ? 0.55 + 0.45 * easeOut(q / 0.12) : 1) * (1 - 0.6 * smooth(0.62, 1, q));
        const [bx, by] = pos(i, Math.max(0, q - 0.05)), dx = x - bx, dy = y - by, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
        // хвост 2 px назад по траектории, укорачивается к груди
        const tl = 3.6 * s, tail = c.mask().cap(x - ux * 1.2, y - uy * 1.2, x - ux * (1.2 + tl), y - uy * (1.2 + tl), 1.0 * s, 0.35);
        const tt = new PC(c.f.w, c.f.h); shade(tt, tail, [B[1], B[1], B[2], B[3], B[3]], { out: null, bevel: 0.5 }); c.f.blit(tt, 0, 0);
        // капля 4×5: шар и острый хвостик назад
        const r = 2.0 * s, m = c.mask().disc(x, y, r).poly([[x - uy * r * 0.85, y + ux * r * 0.85], [x + uy * r * 0.85, y - ux * r * 0.85], [x - ux * r * 2.1, y - uy * r * 2.1]]);
        const tmp = new PC(c.f.w, c.f.h); shade(tmp, m, [B[1], B[2], B[3], B[4], B[5], hex("#ffffff")], { mode: "round", out: OUT, spec: 0.95 }); c.f.blit(tmp, 0, 0);
      } else {
        const q = (p - 0.78) / 0.22, r = [2.2, 2.9, 2.4, 1.6][Math.min(3, Math.floor(q * 4))];
        glow(c, tx, ty, r + 1.4, r + 1.4, Dt[3], 0.28, 2);
        sparkle(c, tx, ty, r, [hex("#ffffff"), Dt[4], Dt[3]], { thick: 0.5 });
      }
    }
  });
  return one("blood_tap", [lay]);
}
void smooth; void tint; void flame; void adist;
