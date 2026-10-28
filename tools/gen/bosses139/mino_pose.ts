/**
 * Задача 139, минотавр-латник (r65n запад): ОДИН кадр покоя 2D-пиксель-артом, слоями-штампами, три ракурса (вбок, вниз, вверх; влево — зеркало).
 * Тело рисуется в 160×160 (2×) и сводится в кадр 80×80, ступни y=76, контур 1 px. Силуэт — из mino_sketch.ts (совпал с маской референса 25).
 * Запуск: npx tsx tools/gen/bosses139/mino_pose.ts → tools/out/bosses139/mino-pose.png («наш ×1/×3 | референс 25»). Без движка.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { BONE, C, Cv, EYE, EYE2, FUR, HORN, Mk, OUTL, SIL, SILV, hash, hx, label, paint } from "./mino_lib";

const Z = 2, W = 160, FR = 80;
const BLACKP: C[] = ["#050304", "#0a0608", "#1c1012", "#3a2224"].map(hx);
const MAIL: C[] = ["#040405", "#0a0b0c", "#131416", "#1e2024", "#33363c"].map(hx);
/** Тёмная воронёная сталь без синевы, холодные блики на рёбрах. */
const STEEL: C[] = ["#050506", "#0d0e10", "#191b1e", "#2b2e33", "#585d66", "#9ba1ab"].map(hx);
/** Тусклая бронза: только кайма и гравировка в 1 px, мелкие детали. */
const BRONZE: C[] = ["#100a06", "#2a1c0f", "#4a3419", "#6e4e26", "#8c6a34", "#a98848"].map(hx);
const HOOFD: C[] = ["#080504", "#140c08", "#241610", "#3a261a"].map(hx);
const NOSE: C[] = ["#2a1c18", "#6a4c42", "#a8887a", "#d8bca6"].map(hx);

/** Маска в координатах кадра 1× (ox — сдвиг по x), рисует в сетке 2×. */
class Mz extends Mk {
  constructor(public ox = 0) { super(W, W); }
  zl(x0: number, y0: number, x1: number, y1: number, t0: number, t1 = t0) { this.line((x0 + this.ox) * Z, y0 * Z, (x1 + this.ox) * Z, y1 * Z, t0 * Z, t1 * Z); return this; }
  zd(x: number, y: number, r: number) { this.disc((x + this.ox) * Z, y * Z, r * Z); return this; }
  zp(pts: [number, number][]) { this.poly(pts.map(([x, y]) => [(x + this.ox) * Z, y * Z] as [number, number])); return this; }
  ze(cx: number, cy: number, rx: number, ry: number) { this.ell((cx + this.ox) * Z, cy * Z, rx * Z, ry * Z); return this; }
}
const zx = (x: number, ox: number) => (x + ox) * Z;

/** Бронзовая кайма (внутренние w px по краю): светлее на верхне-левой кромке. */
function rim(c: Cv, m: Mk, d: Int16Array, w: number) {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const v = d[y * m.w + x]; if (!v || v > w) continue;
    const lit = !m.has(x - v, y) || !m.has(x, y - v);
    c.set(x, y, v === 1 ? BRONZE[lit ? 3 : 1] : BRONZE[lit ? 4 : 2]);
  }
}
/** Гребни: светлое ребро над тёмной бороздой на заданных расстояниях от края. */
function ridge(c: Cv, m: Mk, d: Int16Array, at: number[]) {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const v = d[y * m.w + x]; if (!v) continue;
    for (const a of at) { if (v === a) c.set(x, y, STEEL[4]); else if (v === a + 1) c.set(x, y, STEEL[0]); }
  }
}
function spiral(c: Cv, m: Mk, cx: number, cy: number, r0: number, r1: number, turns: number, a0: number, col: C, col2: C) {
  const n = Math.ceil(turns * 50);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + u * turns * Math.PI * 2, r = r0 + (r1 - r0) * u;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.9);
    if (m.has(x, y)) c.set(x, y, u > 0.6 ? col2 : col);
  }
}
const stamp = (dst: Cv, src: Cv, ox: number, oy: number) => { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (src.has(x, y)) dst.set(ox + x, oy + y, src.get(x, y)); };

// ---------------- части ----------------
/** Рог: кольчатый, светлеет к кончику. */
function horn(c: Cv, p0: [number, number], p1: [number, number], p2: [number, number], t0: number, t1: number) {
  const m = new Mk(c.w, c.h); m.bez(p0, p1, p2, t0, t1);
  paint(c, m, BONE, { amp: 1.4, dome: 2, dith: 0.1 });
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), cc = u * u;
    const x = a * p0[0] + b * p1[0] + cc * p2[0], y = a * p0[1] + b * p1[1] + cc * p2[1];
    const dx = 2 * (1 - u) * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]), dy = 2 * (1 - u) * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]);
    const l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, tw = (t0 + (t1 - t0) * u) / 2;
    const tip = u > 0.72;
    for (let s = -tw; s <= tw; s += 0.5) {
      const px = Math.round(x + nx * s), py = Math.round(y + ny * s);
      if (!m.has(px, py)) continue;
      if (i % 5 === 0 && !tip) c.set(px, py, BONE[1]);
      else if (tip && s < 0) c.set(px, py, BONE[4]);
    }
  }
}
/** Кольцо в носу: окружность 1 px. */
function ring(c: Cv, x: number, y: number, rad: number) { for (let a = 0; a < 36; a++) { const t = (a / 36) * Math.PI * 2; c.set(x + Math.cos(t) * rad, y + Math.sin(t) * rad, a < 18 ? SILV[3] : SILV[1]); } }
/** Голова, 2× (40×46, шлем-центр (20, 15+O)); view: side — три четверти влево-вниз, front — анфас, back — затылок. */
function head(view: "side" | "front" | "back", open = 0): Cv {
  const c = new Cv(40, 54), O = 14;
  const P = (pts: [number, number][]) => pts.map(([x, y]) => [x, y + O] as [number, number]);
  const mk = () => new Mk(40, 54);
  const hd = (p0: [number, number], p1: [number, number], p2: [number, number], t0: number, t1: number) => horn(c, [p0[0], p0[1] + O], [p1[0], p1[1] + O], [p2[0], p2[1] + O], t0, t1);
  if (view === "side") {
    hd([13, 13], [9, -16], [-3, -8], 7.2, 1.5);
    hd([27, 12], [32, -15], [21, -11], 7.2, 1.5);
    const tuft = mk(); tuft.poly(P([[16, 6], [19, 2], [23, 3], [24, 7], [20, 8]])); paint(c, tuft, FUR, { amp: 1, dome: 2, dith: 0.5 });
    const mz = mk(); mz.poly(P([[15, 13], [22, 13], [23, 21], [19, 29], [13, 33], [8, 33], [6, 29], [9, 22]])); paint(c, mz, FUR, { amp: 1.5, dome: 3, dith: 0.5 });
    const nz = mk(); nz.poly(P([[5, 28], [9, 27], [13, 30], [13, 34], [8, 35], [4, 33]])); paint(c, nz, NOSE, { amp: 1, dome: 2, dith: 0.2 });
    c.set(7, 31 + O, hx("#1a0c0c")); c.set(8, 31 + O, hx("#1a0c0c")); ring(c, 7, 36 + O, 2.6);
    for (let i = 0; i < 4; i++) { const x = 13 + i * 2.4, m2 = mk(); m2.line(x, 30 + O, x - 0.6, 30 + O + 5 + (i % 2) * 2, 2, 0.7); paint(c, m2, BONE, { amp: 1.1, dome: 1, dith: 0.1 }); }
    const hm = mk(); hm.poly(P([[10, 14], [13, 7], [19, 3.5], [26, 5], [29, 11], [27, 16], [21, 17], [15, 18]]));
    const dh = paint(c, hm, STEEL, { amp: 1.6, dome: 3, dith: 0.3 });
    rim(c, hm, dh, 1);
    for (let i = 0; i <= 18; i++) { const u = i / 18, x = 11.5 + u * 16, y = 14 - Math.sin(u * Math.PI) * 8.5 + u * 1.5 + O; if (hm.has(Math.round(x), Math.round(y))) c.set(x, y, BRONZE[i % 3 === 2 ? 5 : 4]); }
    c.set(17, 17 + O, hx("#05030a")); c.set(18, 17 + O, hx("#05030a")); c.set(18, 18 + O, EYE); c.set(18, 19 + O, EYE2);
    c.set(19, 20 + O, FUR[4]); c.set(18, 22 + O, FUR[4]);
  } else if (view === "front") {
    hd([11, 14], [-9, 5], [4, -13], 7.4, 1.5);
    hd([29, 14], [49, 5], [36, -13], 7.4, 1.5);
    const mz = mk(); mz.poly(P([[15, 18], [25, 18], [25.5, 28], [23, 34], [17, 34], [14.5, 28]])); paint(c, mz, FUR, { amp: 1.4, dome: 3, dith: 0.5 });
    const nz = mk(); nz.ell(20, 33 + O, 4.4, 2.8); paint(c, nz, NOSE, { amp: 1, dome: 2, dith: 0.2 }); ring(c, 20, 37 + O, 2.8);
    c.set(18, 33 + O, hx("#1a0c0c")); c.set(22, 33 + O, hx("#1a0c0c"));
    for (let i = 0; i < 5; i++) { const x = 15.5 + i * 2.3, m2 = mk(); m2.line(x, 33 + O, x, 33 + O + 4 + (i % 2) * 2, 1.8, 0.7); paint(c, m2, BONE, { amp: 1.1, dome: 1, dith: 0.1 }); }
    const hm = mk(); hm.poly(P([[10, 15], [12, 8], [20, 4], [28, 8], [30, 15], [27, 19], [20, 20], [13, 19]]));
    const dh = paint(c, hm, STEEL, { amp: 1.6, dome: 3, dith: 0.3 });
    rim(c, hm, dh, 1);
    for (let y = 5; y <= 12; y++) { c.set(20, y + O, BRONZE[4]); c.set(19, y + O, BRONZE[2]); }
    c.set(20, 13 + O, BRONZE[5]); c.set(20, 14 + O, BRONZE[3]);
    for (const x of [15, 25]) { c.set(x, 21 + O, hx("#05030a")); c.set(x + 1, 21 + O, hx("#05030a")); c.set(x, 22 + O, EYE); c.set(x, 23 + O, EYE2); }
  } else {
    hd([11, 14], [-9, 5], [4, -13], 7.4, 1.5);
    hd([29, 14], [49, 5], [36, -13], 7.4, 1.5);
    for (const s of [-1, 1]) { const e = mk(); e.poly(P([[20 + s * 8, 16], [20 + s * 14, 17], [20 + s * 12, 21], [20 + s * 8, 20]])); paint(c, e, FUR, { amp: 1, dome: 1, dith: 0.4 }); }
    const hm = mk(); hm.poly(P([[10, 15], [12, 8], [20, 4], [28, 8], [30, 15], [28, 22], [20, 24], [12, 22]]));
    const dh = paint(c, hm, STEEL, { amp: 1.6, dome: 4, dith: 0.3 });
    rim(c, hm, dh, 1);
    for (let y = 5; y <= 20; y++) { c.set(20, y + O, BRONZE[4]); c.set(19, y + O, BRONZE[2]); }
    const mane = mk(); mane.poly(P([[12, 22], [28, 22], [29, 30], [20, 34], [11, 30]])); paint(c, mane, FUR, { amp: 1.5, dome: 3, dith: 0.5 });
  }
  if (open > 0.4) {
    if (view === "side") { const mo = mk(); mo.poly(P([[8, 29], [17, 27], [20, 33], [11, 38]])); paint(c, mo, BLACKP, { amp: 0.5, dome: 1, dith: 0 }); for (let x = 9; x <= 17; x += 2) { c.set(x, 28 + O + (x > 13 ? 0 : 1), BONE[4]); c.set(x + 1, 36 + O - (x > 13 ? 0 : 1), BONE[3]); } }
    else if (view === "front") { const mo = mk(); mo.ell(20, 30 + O, 4.5, 3.4); paint(c, mo, BLACKP, { amp: 0.5, dome: 1, dith: 0 }); for (let x = 16; x <= 24; x += 2) { c.set(x, 27.5 + O, BONE[4]); c.set(x, 33 + O, BONE[3]); } }
  }
  return c;
}

/** Ракушка-ядро кистеня: веер вверх от вершины (ax, ay) радиуса r, шип вниз. */
function shell(c: Cv, ax: number, ay: number, r: number) {
  const sh = new Mk(c.w, c.h);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const dx = x + 0.5 - ax, dy = y + 0.5 - ay, rr = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (dy > 0.5 || a > -0.8 || a < -Math.PI + 0.8) continue;
    if (rr <= r + Math.cos((a + Math.PI / 2) * 7) * 1.0) sh.set(x, y);
  }
  const d = paint(c, sh, STEEL, { amp: 1.4, dome: 4, dith: 0.3, bias: 0.3 });
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI + 0.95 + k * ((Math.PI - 1.9) / 6);
    for (let q = 3; q < r; q += 0.5) { const x = Math.round(ax + Math.cos(a) * q), y = Math.round(ay + Math.sin(a) * q); if (sh.has(x, y) && d[y * c.w + x] > 1) c.set(x, y, k % 2 ? STEEL[0] : STEEL[5]); }
  }
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (sh.has(x, y) && d[y * c.w + x] <= 2 && y < ay - 3) c.set(x, y, BRONZE[(x + y) % 2 ? 4 : 3]);
  const sp = new Mk(c.w, c.h); sp.poly([[ax - 3, ay - 1], [ax + 3, ay - 1], [ax + 0.8, ay + 5], [ax, ay + 7.5], [ax - 0.8, ay + 5]]);
  paint(c, sp, BRONZE, { amp: 1.5, dome: 2, dith: 0.1 });
}
/** Цепь: звенья-точки от (x0,y0) до (x1,y1) в сетке 2×. */
function chain(c: Cv, x0: number, y0: number, x1: number, y1: number, n: number) {
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = x0 + (x1 - x0) * u + (i % 2 ? 1 : -1) * 0.6, y = y0 + (y1 - y0) * u;
    const col = i % 2 ? SILV[3] : SILV[1];
    c.set(x, y, col); c.set(x, y + 1, col); if (i % 2) { c.set(x + 1, y, SILV[2]); c.set(x - 1, y + 1, SILV[0]); }
  }
}
/** Нога (спереди/сзади): бурый мех от бедра, узкая пластина-набедренник, колено-чашка, наголенник, мохнатая манжета и тёмное копыто. */
function leg(c: Cv, o: { ox: number; hip: [number, number]; knee: [number, number]; foot: [number, number]; t: [number, number, number]; hoof: [number, number][]; bias?: number }) {
  const { ox, hip, knee, foot, t } = o, b = o.bias ?? 0;
  let m = new Mz(ox).zl(hip[0], hip[1], knee[0], knee[1], t[0], t[1]);
  let d = paint(c, m, FUR, { amp: 1.4, dome: 4, dith: 0.55, bias: b });
  m = new Mz(ox).zl(hip[0], hip[1] + 2, knee[0], knee[1] - 2, t[0] * 0.5, t[1] * 0.5); d = paint(c, m, STEEL, { amp: 1.5, dome: 3, bias: b }); ridge(c, m, d, [2]); rim(c, m, d, 1);
  m = new Mz(ox).zl(knee[0], knee[1], foot[0], foot[1] - 4, t[1] - 0.8, t[2]); paint(c, m, FUR, { amp: 1.3, dome: 3, dith: 0.55, bias: b - 0.2 });
  m = new Mz(ox).zl(knee[0], knee[1] + 1, foot[0], foot[1] - 6, t[1] * 0.5, t[2] * 0.5); d = paint(c, m, STEEL, { amp: 1.4, dome: 3, bias: b }); rim(c, m, d, 1);
  m = new Mz(ox).zd(knee[0], knee[1], 2.4); d = paint(c, m, STEEL, { amp: 1.6, dome: 3, bias: b + 0.3 }); rim(c, m, d, 1);
  m = new Mz(ox).ze(foot[0], foot[1] - 4.5, t[2] / 2 + 1.4, 2.4); paint(c, m, FUR, { amp: 1.2, dome: 2, dith: 0.6, bias: b + 0.2 });
  m = new Mz(ox).zp(o.hoof); paint(c, m, HOOFD, { amp: 1.0, dome: 2, dith: 0.3, bias: b });
}
/** Нога вбок: обратное колено — бедро вперёд-вниз, голень назад к скакательному суставу, пясть вперёд, мохнатая манжета, малое тёмное копыто. */
function legS(c: Cv, o: { hip: [number, number]; knee: [number, number]; hock: [number, number]; fet: [number, number]; hoof: [number, number][]; t: [number, number]; bias?: number }) {
  const ox = 8, b = o.bias ?? 0, { hip, knee, hock, fet } = o;
  let m = new Mz(ox).zl(hip[0], hip[1], knee[0], knee[1], o.t[0], o.t[1]);
  let d = paint(c, m, FUR, { amp: 1.4, dome: 4, dith: 0.55, bias: b });
  m = new Mz(ox).zl(hip[0] - 1.4, hip[1] + 2, knee[0] - 0.8, knee[1] - 1.5, 4.6, 3.8); d = paint(c, m, STEEL, { amp: 1.5, dome: 3, bias: b }); ridge(c, m, d, [2]); rim(c, m, d, 1);
  m = new Mz(ox).zl(knee[0], knee[1], hock[0], hock[1], o.t[1] - 0.6, 4.4); paint(c, m, FUR, { amp: 1.3, dome: 3, dith: 0.55, bias: b - 0.2 });
  m = new Mz(ox).zl(knee[0] - 0.8, knee[1] + 1.5, hock[0] - 0.8, hock[1] - 1, 3.6, 3); d = paint(c, m, STEEL, { amp: 1.4, dome: 3, bias: b }); rim(c, m, d, 1);
  m = new Mz(ox).zd(knee[0] - 1, knee[1], 2.6); d = paint(c, m, STEEL, { amp: 1.6, dome: 3, bias: b + 0.3 }); rim(c, m, d, 1);
  m = new Mz(ox).zl(hock[0], hock[1], fet[0], fet[1], 4.2, 3.4); paint(c, m, FUR, { amp: 1.2, dome: 2, dith: 0.55, bias: b - 0.3 });
  m = new Mz(ox).ze(fet[0], fet[1] - 0.5, 3.6, 2.4); paint(c, m, FUR, { amp: 1.2, dome: 2, dith: 0.6, bias: b + 0.2 });
  m = new Mz(ox).zp(o.hoof); paint(c, m, HOOFD, { amp: 1.0, dome: 2, dith: 0.3, bias: b });
}
const pauldron = (c: Cv, m: Mz, strong = 1) => {
  const d = paint(c, m, STEEL, { amp: 1.6, dome: 7, dith: 0.3, bias: -0.2 });
  ridge(c, m, d, [5 * strong, 9 * strong]);
  rim(c, m, d, 1);
  return d;
};

// ---------------- поза ----------------
type V2 = [number, number];
export interface Pose {
  /** подъём/опускание верха тела и головы, px кадра (минус — вверх); присед: таз и верх вниз, колени вперёд */
  bob: number; squat: number;
  /** наклон корпуса вперёд (сдвиг рядов, K), сдвиг тела по x, наклон/сжатие всей фигуры вокруг ступней */
  lean: number; dx: number; tilt: number; sy: number;
  /** голова: сдвиг, наклон (рад), раскрытая пасть 0..1 */
  head: V2; htilt: number; open: number;
  /** кулаки: ближний (свободный), дальний (кистень) — сдвиг от покоя; угол рукояти; угол цепи от вертикали (+ назад/вправо) */
  nh: V2; fh: V2; ha: number; sw: number;
  /** стопы: задняя, передняя — сдвиг (dx вперёд = минус, dy вверх = минус) */
  legA: V2; legB: V2;
  /** свет глаз 0..1,6 */
  glow: number;
  /** эффекты: пыль (задняя, передняя), кольцо у ступней, вспышка / осколки / волна рёва / полосы бега */
  dust: V2; ring: number; flash: number; flashAt: "shell" | "head"; shards: number; waves: number; streak: number;
}
export const HA0 = Math.atan2(4, -14);
export const REST: Pose = {
  bob: 0, squat: 0, lean: 0.15, dx: 0, tilt: 0, sy: 1, head: [0, 0], htilt: 0, open: 0, nh: [0, 0], fh: [0, 0], ha: HA0, sw: -0.1,
  legA: [0, 0], legB: [0, 0], glow: 1, dust: [0, 0], ring: 0, flash: 0, flashAt: "shell", shards: 0, waves: 0, streak: 0,
};
const sxs = (y: number, K: number) => (y < 46 ? -K * (46 - y) : 0);

function ik2(s: V2, f: V2, l1: number, l2: number, pole: V2): { el: V2; hand: V2 } {
  let dx = f[0] - s[0], dy = f[1] - s[1], d = Math.hypot(dx, dy) || 0.01;
  const mx = l1 + l2 - 0.05;
  if (d > mx) { f = [s[0] + (dx * mx) / d, s[1] + (dy * mx) / d]; dx = f[0] - s[0]; dy = f[1] - s[1]; d = mx; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  let px = -uy, py = ux; if (px * pole[0] + py * pole[1] < 0) { px = -px; py = -py; }
  return { el: [s[0] + ux * a + px * h, s[1] + uy * a + py * h], hand: f };
}
/** Рука по IK: плечо → локоть → кулак; абсолютные координаты кадра 1×. */
function arm(c: Cv, s: V2, f: V2, pole: V2, o: { far?: boolean; t?: number }) {
  const { el, hand } = ik2(s, f, 11, 11.5, pole), M = () => new Mz(0), k = o.t ?? 1, b = o.far ? -0.9 : 0;
  let m = M().zl(s[0], s[1], el[0], el[1], 8.6 * k, 7.6 * k); paint(c, m, STEEL, { amp: 1.4, dome: 5, bias: b });
  m = M().zl(el[0], el[1], hand[0], hand[1], 7.6 * k, 6.2 * k); const d = paint(c, m, STEEL, { amp: 1.5, dome: 4, bias: b }); ridge(c, m, d, [3]);
  const bx = el[0] + (hand[0] - el[0]) * 0.45, by = el[1] + (hand[1] - el[1]) * 0.45, bx2 = el[0] + (hand[0] - el[0]) * 0.78, by2 = el[1] + (hand[1] - el[1]) * 0.78;
  m = M().zl(bx, by, bx2, by2, 7.6 * k, 6.6 * k); paint(c, m, STEEL, { amp: 1.5, dome: 3, bias: b + 0.4 }); rim(c, m, m.dist(), 1);
  m = M().zd(el[0], el[1], 3.5 * k); const de = paint(c, m, STEEL, { amp: 1.6, dome: 3, bias: b + 0.3 }); rim(c, m, de, 1);
  m = M().zd(hand[0], hand[1], 3.1 * k); paint(c, m, STEEL, { amp: 1.5, dome: 3, bias: b + 0.4 });
}
/** Поворот стампа вокруг точки (2× сетка), обратное отображение, ближайший сосед. */
function rotCv(src: Cv, ang: number, px: number, py: number, sy = 1): Cv {
  if (Math.abs(ang) < 1e-3 && sy === 1) return src;
  const o = new Cv(src.w, src.h), cs = Math.cos(ang), sn = Math.sin(ang);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const vx = x - px, vy = (y - py) / sy;
    const sx = Math.round(px + vx * cs - vy * sn), sy2 = Math.round(py + vx * sn + vy * cs);
    if (src.has(sx, sy2)) o.set(x, y, src.get(sx, sy2));
  }
  return o;
}
/** Кистень: рукоять от кулака F под углом ha, навершие, цепь под углом sw, ядро-ракушка; front — сжатый вид спереди/сзади. Возвращает вершину ядра (1×). */
function mace(c: Cv, F: V2, ha: number, sw: number, front: number): V2 {
  const M = () => new Mz(0), dr = ha - HA0;
  let hv: V2 = [Math.cos(ha), Math.sin(ha)];
  let len = 14.5;
  if (front) { hv = [hv[0] * 0.18, hv[1]]; len = 14.5 * Math.min(1, Math.hypot(hv[0], hv[1]) + 0.35); }
  const C: V2 = front ? [F[0] + hv[0] * len, F[1] + Math.max(5, hv[1] * len + 3)] : [F[0] + hv[0] * len, F[1] + hv[1] * len];
  const m = M().zl(F[0], F[1], C[0], C[1], 3, 3); paint(c, m, BRONZE, { amp: 1.4, dome: 2, dith: 0.1, bias: -0.3 });
  for (let t = 0.1; t < 0.9; t += 0.2) { const x = (F[0] + (C[0] - F[0]) * t) * Z, y = (F[1] + (C[1] - F[1]) * t) * Z; for (let q = -2; q <= 2; q++) c.set(x + q * 0.3, y + q, BRONZE[t < 0.5 ? 1 : 4]); }
  const rp = (x: number, y: number): [number, number] => { const cs = Math.cos(dr), sn = Math.sin(dr); return [C[0] + x * cs - y * sn, C[1] + x * sn + y * cs]; };
  const cupPts = (front ? [[-3, -2], [3, -2], [2.5, 3.5], [-2.5, 3.5]] : [[-3, -2.5], [3, -3.5], [3, 2.5], [-0.5, 3.5], [-3.5, 0.5]]).map(([x, y]) => rp(x, y));
  const cup = M().zp(cupPts); const dc = paint(c, cup, BRONZE, { amp: 1.5, dome: 3 }); rim(c, cup, dc, 1);
  const E: V2 = front ? [C[0], C[1] + 3.5] : rp(-4, 4.5);
  let d: V2 = [Math.sin(sw), Math.cos(sw)];
  if (front) { const fw = -Math.sin(sw); d = [Math.sin(sw) * 0.1, Math.cos(sw)]; const l = Math.hypot(d[0], d[1]); d = [d[0] / l, d[1] / l]; void fw; }
  const cl = front ? 6 : 8, sl = front ? 9 : 7;
  const T: V2 = [E[0] + d[0] * cl, E[1] + d[1] * cl];
  const A: V2 = [T[0] + d[0] * sl, T[1] + d[1] * sl + (front ? Math.max(0, -Math.sin(sw)) * 2 : 0)];
  if (A[1] > 73) { const dy = A[1] - 73; A[1] -= dy; T[1] -= dy * (cl / (cl + sl)); }
  chain(c, E[0] * Z, E[1] * Z, T[0] * Z, T[1] * Z, 8);
  const tmp = new Cv(W, W); shell(tmp, 80, 120, front ? 15 : 17);
  const alpha = Math.atan2(d[0], d[1]), rs = rotCv(tmp, -alpha, 80, 120);
  stamp(c, rs, Math.round(A[0] * Z - 80), Math.round(A[1] * Z - 120));
  return A;
}
const keyed = (keys: { f: number; p: Partial<Pose> }[], n: number, ease = easeIO): Pose[] => {
  const out: Pose[] = [];
  for (let i = 0; i < n; i++) {
    let a = keys[0], b = keys[keys.length - 1];
    for (let k = 0; k < keys.length - 1; k++) if (i >= keys[k].f && i <= keys[k + 1].f) { a = keys[k]; b = keys[k + 1]; break; }
    const t = a.f === b.f ? 0 : ease((i - a.f) / (b.f - a.f));
    out.push(blend({ ...REST, ...a.p }, { ...REST, ...b.p }, t));
  }
  return out;
};
const easeIO = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
function blend(a: Pose, b: Pose, t: number): Pose {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    const x = a[k] as unknown, y = b[k] as unknown;
    if (typeof x === "number") o[k] = x + ((y as number) - x) * t;
    else if (Array.isArray(x)) o[k] = (x as number[]).map((v, i) => v + ((y as number[])[i] - v) * t);
    else o[k] = t < 0.5 ? x : y;
  }
  return o as unknown as Pose;
}

// ---------------- рендер кадра ----------------
export type ViewId = "side" | "front" | "back";
export interface Frame { img: Cv; eyes: V2[]; anchors: { shell: V2; head: V2; feet: V2 } }

/** Вид вбок: фигура влево-вниз, обратное колено, наклон корпуса вперёд. */
function renderSide(p: Pose): Frame {
  const ox = 8, M = () => new Mz(ox), K = p.lean, bs = p.bob + p.squat;
  const lo = new Cv(W, W), body = new Cv(W, W), top = new Cv(W, W), far = new Cv(W, W), nearA = new Cv(W, W);
  // ноги: обратное колено, присед сгибает колени вперёд
  const sq = p.squat, lg = (hip: V2, knee: V2, hock: V2, fet: V2, hoof: V2[], t: V2, off: V2, bias: number) => {
    const sh = (v: V2, k: number): V2 => [v[0] + off[0] * k, v[1] + off[1] * k];
    legS(lo, { hip: [hip[0], hip[1] + sq], knee: [knee[0] - sq * 0.5 + off[0] * 0.5, knee[1] + sq * 0.3 + off[1] * 0.5], hock: sh(hock, 0.8), fet: sh(fet, 1), hoof: hoof.map((q) => sh(q, 1)), t, bias });
  };
  lg([38, 46], [34.5, 57], [38.5, 65], [36, 71], [[32.5, 70.5], [39.5, 70.5], [40, 76.5], [32, 76.5]], [10, 7], p.legA, -0.5);
  lg([47, 46], [43.5, 57.5], [47.5, 65.5], [45, 71], [[41.5, 70.5], [48.5, 70.5], [49, 76.5], [41, 76.5]], [12, 8], p.legB, 0);
  { const m = M().zp([[34, 40 + sq], [44, 40 + sq], [49, 47 + sq], [35, 49 + sq], [32, 46 + sq]]); paint(lo, m, MAIL, { amp: 1.2, dome: 4 });
    const t = M().zp([[37, 45 + sq], [45, 45 + sq], [47, 52 + sq], [40, 54 + sq]]); const dt = paint(lo, t, STEEL, { amp: 1.4, dome: 4, bias: -0.2 }); rim(lo, t, dt, 1);
    const b = M().zl(33, 41 + sq, 45, 41.5 + sq, 2.2); paint(lo, b, STEEL, { amp: 1.4, dome: 2 }); rim(lo, b, b.dist(), 1); }
  // верх тела
  { const m = M().zp([[28, 17], [33, 15], [40, 15], [45, 11], [55, 10.5], [62, 14], [63.5, 21], [61, 29], [58.5, 37], [55, 42], [50, 46], [44, 43], [36, 43], [33.5, 37], [31, 31], [27, 26]]); paint(body, m, MAIL, { amp: 1.1, dome: 6 }); }
  { const m = M().zp([[33, 22], [48, 21], [50, 30], [45, 38], [37, 40.5], [34, 34]]); const d = paint(body, m, STEEL, { amp: 1.5, dome: 6 });
    ridge(body, m, d, [5, 9]); rim(body, m, d, 1);
    for (const yy of [33.5, 36.5]) for (let x = zx(35, ox); x <= zx(46, ox); x++) { const u = (x - zx(40.5, ox)) / 12, y = Math.round(yy * Z + u * u * 3); if (m.has(x, y) && d[y * W + x] > 3) { body.set(x, y, STEEL[1]); body.set(x, y - 1, STEEL[4]); } }
    const me = M().zd(41, 28, 2.2); const dme = paint(body, me, STEEL, { amp: 1.6, dome: 3, bias: 0.4 }); rim(body, me, dme, 1);
    for (const [x, y] of [[41, 26.5], [41, 27.5], [41, 28.5], [41, 29.5], [40, 28], [42, 28]]) body.set(zx(x, ox), y * Z, BRONZE[3]);
    const g = M().zp([[37, 16], [46, 16], [47, 22], [36, 22]]); const dg = paint(body, g, STEEL, { amp: 1.4, dome: 4, bias: -0.2 }); rim(body, g, dg, 1); }
  { const m = M().zp([[27, 17.5], [32, 14.5], [36, 17], [35.5, 27], [31, 30], [27, 26]]); const d = paint(body, m, STEEL, { amp: 1.6, dome: 5, bias: -0.4 }); ridge(body, m, d, [4]); rim(body, m, d, 1);
    spiral(body, m, zx(31, ox), 23 * Z, 0.5, 5, 1.4, 0.5, BRONZE[3], BRONZE[2]); }
  { const m = M().zp([[43, 14.5], [53, 9.5], [62, 11], [65, 18], [62.5, 25], [53, 28], [46, 25], [42, 20]]); pauldron(top, m);
    spiral(top, m, zx(55, ox), 17 * Z, 0.5, 9, 1.8, 0.2, BRONZE[4], BRONZE[3]);
    spiral(top, m, zx(48, ox), 21 * Z, 0.5, 6, 1.4, 3.0, BRONZE[4], BRONZE[3]);
    spiral(top, m, zx(60, ox), 22 * Z, 0.5, 4.5, 1.3, 1.0, BRONZE[3], BRONZE[2]);
    for (const [x, y] of [[48, 15], [59, 13], [58, 23]]) { top.set(zx(x, ox), y * Z, SILV[3]); top.set(zx(x, ox) + 1, y * Z, SILV[1]); } }
  // голова: сдвиг, наклон вокруг шеи
  const hx0 = zx(44, ox) - 23 + Math.round(p.head[0] * Z), hy0 = 23 - 25 + 8 + Math.round(p.head[1] * Z);
  { const hc = new Cv(W, W); stamp(hc, head("side", p.open), hx0, hy0); stamp(top, rotCv(hc, p.htilt, hx0 + 20, hy0 + 44), 0, 0); }
  // руки по IK в координатах после наклона корпуса
  const sh1 = (x: number, y: number): V2 => [x + ox + sxs(y, K) + p.dx, y + bs];
  const sNear = sh1(56, 28), sFar = sh1(31.5, 28);
  const fN: V2 = [48.5 + ox + p.nh[0] + p.dx, 46.5 + p.nh[1]], fF: V2 = [28.5 + ox + p.fh[0] + p.dx, 49.5 + p.fh[1]];
  arm(far, sFar, fF, [-1, 0.2], { far: true, t: 0.8 });
  const A = mace(far, fF, p.ha, p.sw, 0);
  arm(nearA, sNear, fN, [1, 0.3], {});
  // сборка с наклоном (сдвиг рядов) и подъёмом
  const out = new Cv(W, W), by = Math.round(bs * Z);
  const stackSheared = (src: Cv) => { for (let y = 0; y < W; y++) { const ty = y + by; if (ty < 0 || ty >= W) continue; const dx = Math.round(sxs((ty / Z), K) * Z) + Math.round(p.dx * Z); for (let x = 0; x < W; x++) if (src.has(x, y)) out.set(x + dx, ty, src.get(x, y)); } };
  stamp(out, lo, Math.round(p.dx * Z), 0);
  stamp(out, far, 0, 0);
  stackSheared(body);
  stamp(out, nearA, 0, 0);
  stackSheared(top);
  const hp = { x: (hx0 + 20) / Z, y: (hy0 + 44) / Z };
  // глаза: холст головы (18, 18+O) с учётом наклона и сдвига рядов
  const ex = hx0 + 18, ey = hy0 + 18 + 14, cs = Math.cos(p.htilt), sn = Math.sin(p.htilt), pxv = hx0 + 20, pyv = hy0 + 44;
  const rx = pxv + (ex - pxv) * cs + (ey - pyv) * sn, ry = pyv - (ex - pxv) * sn + (ey - pyv) * cs;
  const eyeY = ry + by, eyeX = rx + Math.round(sxs(eyeY / Z, K) * Z) + Math.round(p.dx * Z);
  return { img: out, eyes: [[eyeX / Z, eyeY / Z]], anchors: { shell: A, head: [hp.x - 6 + sxs(hp.y, K), hp.y + bs], feet: [38 + ox, 76] } };
}

/** Вид спереди / сзади: симметричный; кистень в левой руке на экране спереди (справа — со спины). */
function renderFront(p: Pose, back: boolean): Frame {
  const M = () => new Mz(0), ms = back ? 1 : -1, sg = back ? -1 : 1, bs = Math.max(-1.2, p.bob + p.squat + Math.max(0, p.lean - 0.15) * 6);
  const lo = new Cv(W, W), body = new Cv(W, W), top = new Cv(W, W), far = new Cv(W, W), armsL = new Cv(W, W);
  const sq = p.squat, lgf = (s: number, off: V2) => {
    const k = (s < 0 ? 0 : 1);
    void k;
    leg(lo, { ox: 0, hip: [40 + s * 5, 46 + sq], knee: [40 + s * 5.5, 58 + sq * 0.4 + off[1] * 0.5], foot: [40 + s * 6, 72 + off[1]], t: [9, 7.5, 5.5], hoof: [[40 + s * 6 - 3.8, 71 + off[1]], [40 + s * 6 + 3.8, 71 + off[1]], [40 + s * 6 + 4.2, 76.5 + off[1]], [40 + s * 6 - 4.2, 76.5 + off[1]]], bias: s < 0 ? 0 : 0.1 });
  };
  const fr = (v: V2): V2 => [0, v[1] - v[0] * 0.2];
  lgf(-1, fr(p.legA)); lgf(1, fr(p.legB));
  { const m = M().zp([[33, 40 + sq], [47, 40 + sq], [50, 47 + sq], [40, 50 + sq], [30, 47 + sq]]); paint(lo, m, MAIL, { amp: 1.2, dome: 4 });
    const b = M().zl(33, 41 + sq, 47, 41 + sq, 2.4); paint(lo, b, BRONZE, { amp: 1.4, dome: 2 });
    if (!back) { const t = M().zp([[36.5, 44 + sq], [43.5, 44 + sq], [44, 54 + sq], [40, 57 + sq], [36, 54 + sq]]); const dt = paint(lo, t, STEEL, { amp: 1.4, dome: 4, bias: -0.2 }); rim(lo, t, dt, 1); } }
  { const m = M().zp([[27, 18], [53, 18], [51, 30], [47, 38], [44, 43], [36, 43], [33, 38], [29, 30]]); paint(body, m, MAIL, { amp: 1.1, dome: 6 }); }
  { const m = M().zp([[31, 21], [49, 21], [48, 31], [44, 38], [40, 41], [36, 38], [32, 31]]); const d = paint(body, m, STEEL, { amp: 1.5, dome: 6, bias: back ? -0.3 : 0 });
    ridge(body, m, d, [5, 9]); rim(body, m, d, 1);
    if (!back) {
      const me = M().zd(40, 27, 2.6); const dme = paint(body, me, STEEL, { amp: 1.6, dome: 3, bias: 0.4 }); rim(body, me, dme, 1);
      for (const [x, y] of [[40, 25.3], [40, 26.3], [40, 27.3], [40, 28.3], [39, 27], [41, 27]]) body.set(x * Z, y * Z, BRONZE[3]);
      for (const yy of [33, 36]) for (let x = 33 * Z; x <= 47 * Z; x++) { const u = (x - 40 * Z) / 14, y = Math.round(yy * Z + u * u * 4); if (m.has(x, y) && d[y * W + x] > 3) { body.set(x, y, STEEL[1]); body.set(x, y - 1, STEEL[4]); } }
    } else {
      for (let y = 22 * Z; y < 40 * Z; y++) if (m.has(80, y)) { body.set(80, y, BRONZE[4]); body.set(79, y, BRONZE[1]); }
      for (let q = 0; q < 5; q++) { body.set(80, (24 + q * 3.4) * Z, BRONZE[5]); body.set(81, (24 + q * 3.4) * Z, BRONZE[2]); }
    }
    const g = M().zp([[34, 16], [46, 16], [47, 22], [33, 22]]); const dg = paint(body, g, STEEL, { amp: 1.4, dome: 4, bias: -0.2 }); rim(body, g, dg, 1); }
  if (back) { const mane = M().ze(40, 17, 9, 5.5); paint(body, mane, FUR, { amp: 1.5, dome: 4, dith: 0.55 }); }
  for (const s of [-1, 1]) {
    const cx = 40 + s * 17, m = M().zp([[cx - s * 7, 14], [cx + s * 1, 12], [cx + s * 8, 15], [cx + s * 9, 22], [cx + s * 5.5, 28], [cx - s * 2, 28.5], [cx - s * 7, 22]]);
    pauldron(top, m, 1);
    spiral(top, m, cx * Z, 20 * Z, 0.5, 8, 1.7, s > 0 ? 0.2 : 2.8, BRONZE[4], BRONZE[3]);
    spiral(top, m, (cx + s * 5) * Z, 24 * Z, 0.5, 4.5, 1.3, 1.0, BRONZE[3], BRONZE[2]);
    top.set((cx - s * 3) * Z, 15 * Z, SILV[4]); top.set((cx + s * 4) * Z, 14.5 * Z, SILV[4]);
  }
  const hx0 = 80 - 20 + Math.round(p.head[0] * 0.35 * sg * Z), hy0 = 24 - 29 + (back ? 7 : 8) + Math.round((Math.max(-1, p.head[1]) + Math.max(0, -p.head[0]) * 0.15) * Z);
  { const hc = new Cv(W, W); stamp(hc, head(back ? "back" : "front", p.open), hx0, hy0); stamp(top, rotCv(hc, p.htilt * 0.5, hx0 + 20, hy0 + 44), 0, 0); }
  // руки по IK: кистень — со стороны ms
  const shS = (s: number): V2 => [40 + s * 14, 27 + bs];
  const mapH = (v: V2): V2 => [v[0] * 0.35 * sg, v[1]];
  const fRest = (s: number): V2 => [40 + s * 15.4, 49.4];
  const sM = ms, sF = -ms;
  const hM = mapH(p.fh), hF = mapH(p.nh);
  const fM: V2 = [fRest(sM)[0] + hM[0] * (sM < 0 ? 1 : -1) * 0 + hM[0], fRest(sM)[1] + hM[1]], fF2: V2 = [fRest(sF)[0] + hF[0], fRest(sF)[1] + hF[1]];
  arm(armsL, shS(sF), fF2, [sF, 0.1], { t: 0.9 });
  const mc = new Cv(W, W);
  arm(far, shS(sM), fM, [sM, 0.1], { t: 0.9 });
  const A = mace(mc, fM, p.ha, p.sw, 1);
  const out = new Cv(W, W), by = Math.round(bs * Z);
  stamp(out, lo, 0, 0);
  stamp(out, mc, 0, 0);
  stamp(out, body, 0, by);
  stamp(out, far, 0, 0);
  stamp(out, armsL, 0, 0);
  stamp(out, top, 0, by);
  const eyes: V2[] = back ? [] : [15, 25].map((x) => [(hx0 + x + 0) / Z, (hy0 + 22 + 14 + by) / Z] as V2);
  void ms;
  return { img: out, eyes, anchors: { shell: A, head: [40, 8 + bs], feet: [40, 76] } };
}

// ---------------- сведение 2× → 1×, эффекты ----------------
function down(c: Cv): Cv {
  const o = new Cv(FR, FR);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    const cnt = new Map<string, { n: number; col: C }>();
    let op = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      if (!c.has(x * 2 + i, y * 2 + j)) continue; op++;
      const col = c.get(x * 2 + i, y * 2 + j), k = col.join(","); const e = cnt.get(k); if (e) e.n++; else cnt.set(k, { n: 1, col });
    }
    if (op < 2) continue;
    let best: { n: number; col: C } | null = null;
    for (const e of cnt.values()) if (!best || e.n > best.n || (e.n === best.n && e.col[0] + e.col[1] + e.col[2] > best.col[0] + best.col[1] + best.col[2])) best = e;
    o.set(x, y, best!.col);
  }
  o.outline(OUTL);
  return o;
}
export const flip = (c: Cv): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(c.w - 1 - x, y, c.get(x, y)); return o; };
const DUST: C[] = ["#4a4038", "#6e6050", "#9a8a74", "#c4b49a"].map(hx);
const ROCK: C[] = ["#2a2622", "#4c4640", "#7a7268", "#a8a090"].map(hx);
const SPARK: C[] = ["#7a4a1c", "#e0a050", "#ffd890", "#ffffff"].map(hx);

/** Один кадр 80×80: рисунок + свечение глаз (emis) в двух слоях. */
export function renderFrame(view: ViewId, pose: Pose): { img: Cv; emis: Cv } {
  const f = view === "side" ? renderSide(pose) : renderFront(pose, view === "back");
  const big = (Math.abs(pose.tilt) > 1e-3 || pose.sy !== 1) ? rotCv(f.img, pose.tilt, 80, 76 * Z, pose.sy) : f.img;
  const o = down(big);
  const emis = new Cv(FR, FR);
  const g = pose.glow;
  if (g > 0.15 && Math.abs(pose.tilt) < 0.4) for (const [ex, ey] of f.eyes) {
    const x = Math.round(ex), y = Math.round(ey);
    o.set(x, y, g > 0.9 ? EYE2 : EYE); emis.set(x, y, g > 0.9 ? EYE2 : EYE);
    if (g > 1.2) { o.set(x, y + 1, EYE); emis.set(x, y + 1, EYE); }
  }
  const fp = f.anchors.feet, hs = (n: number, k: number) => hash(n, k);
  if (pose.streak > 0.05) for (let i = 0; i < 7; i++) { const y = 40 + ((i * 11) % 30), len = 5 + (i % 3) * 3, x0 = view === "side" ? 66 + (i % 2) * 4 : 20 + i * 6; for (let q = 0; q < len * pose.streak; q++) o.set(view === "side" ? x0 + q : x0, view === "side" ? y : y + q, DUST[2 + (q % 2)]); }
  const puff = (x: number, y: number, k: number) => { for (let i = 0; i < 14 * k; i++) { const a = hs(i, x) * 6.28, r = hs(y, i) * 5 * k + 1; o.set(x + Math.cos(a) * r * 1.3, y - Math.abs(Math.sin(a)) * r * 0.9, DUST[(i % 3) + 1]); } };
  if (pose.dust[0] > 0.05) puff(Math.round(fp[0] + 8), 75, pose.dust[0]);
  if (pose.dust[1] > 0.05) puff(Math.round(fp[0] - 6), 75, pose.dust[1]);
  if (pose.ring > 0.03) { const r = 6 + 30 * pose.ring; for (let a = 0; a < 72; a++) { const t = (a / 72) * Math.PI * 2; const x = fp[0] + Math.cos(t) * r, y = 74 + Math.sin(t) * r * 0.2; if (hs(a, 3) < 0.85 - pose.ring * 0.5 && y < 78 && x > 1 && x < 78) o.set(x, y, DUST[3 - Math.floor(pose.ring * 2.5)]); } }
  const anc = pose.flashAt === "head" ? f.anchors.head : f.anchors.shell;
  if (pose.flash > 0.05) { const k = pose.flash; for (let q = -Math.round(5 * k); q <= Math.round(5 * k); q++) { o.set(anc[0] + q, anc[1], SPARK[q % 2 ? 2 : 3]); o.set(anc[0], anc[1] + q, SPARK[q % 2 ? 1 : 2]); } o.set(anc[0], anc[1], SPARK[3]); }
  if (pose.shards > 0.03) { const k = pose.shards; for (let i = 0; i < 9; i++) { const a = -0.3 - hs(i, 7) * 2.6, v = 5 + hs(7, i) * 12; o.set(anc[0] + Math.cos(a) * v * k * 1.1, anc[1] + Math.sin(a) * v * k + 9 * k * k - 4, ROCK[1 + (i % 3)]); o.set(anc[0] + Math.cos(a) * v * k * 1.1 + 1, anc[1] + Math.sin(a) * v * k + 9 * k * k - 4, ROCK[2]); } }
  if (pose.waves > 0.03) { const hp = f.anchors.head; for (let w = 0; w < 2; w++) { const r = 6 + 9 * ((pose.waves + w * 0.45) % 1); for (let a = -1.1; a <= 1.1; a += 0.1) { const t = a + (view === "side" ? Math.PI : -Math.PI / 2 + 0); o.set(hp[0] + Math.cos(t) * r, hp[1] + 3 + Math.sin(t) * r, DUST[3]); } } }
  // край кадра: чужие пиксели на кромке (обрезанные кончики рогов, эффекты) — в цвет контура
  for (let k = 0; k < FR; k++) for (const [x, y] of [[0, k], [FR - 1, k], [k, 0], [k, FR - 1]] as [number, number][]) if (o.has(x, y) && o.get(x, y).join() !== OUTL.join()) o.set(x, y, OUTL);
  return { img: o, emis };
}

// ---------------- лист предпросмотра (только при прямом запуске) ----------------
const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/mino_pose.ts");
const loadPng = (p: string) => PNG.sync.read(fs.readFileSync(p));
function refCrop(h: number): Cv {
  const p = loadPng(path.resolve("tools/out/bosses139/ref-25.png"));
  const x0 = Math.round(p.width * 0.078), x1 = Math.round(p.width * 0.86), y0 = Math.round(p.height * 0.034), y1 = Math.round(p.height * 0.962);
  const sc = (y1 - y0) / h, w = Math.round((x1 - x0) / sc), o = new Cv(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = Math.floor(y * sc); j < Math.max(Math.floor(y * sc) + 1, Math.floor((y + 1) * sc)); j++) for (let i = Math.floor(x * sc); i < Math.max(Math.floor(x * sc) + 1, Math.floor((x + 1) * sc)); i++) {
      const q = ((y0 + j) * p.width + x0 + i) * 4; r += p.data[q]; g += p.data[q + 1]; b += p.data[q + 2]; n++;
    }
    o.set(x, y, [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  }
  return o;
}
const silc = (c: Cv, col: C): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(x, y, col); return o; };
if (isMain) {
  const side = renderFrame("side", REST).img;
  const frames: [string, Cv][] = [["ВБОК", side], ["ВНИЗ", renderFrame("front", REST).img], ["ВВЕРХ", renderFrame("back", REST).img], ["ВЛЕВО", flip(side)]];
  const SW = 1280, SH = 760, sheet = new Cv(SW, SH);
  sheet.rect(0, 0, SW, SH, hx("#26242b"));
  const GROUND = hx("#7d6a52"), PANEL = hx("#322f38");
  sheet.rect(8, 8, 8 + 4 * 88 + 120, 110, PANEL); label(sheet, 14, 12, "НАШ ×1 ВБОК ВНИЗ ВВЕРХ ВЛЕВО | РЕФЕРЕНС 25 ×1");
  frames.forEach(([, f], i) => { sheet.rect(16 + i * 88, 30, 80, 80, GROUND); sheet.blit(f, 16 + i * 88, 30, 1); });
  sheet.blit(refCrop(76), 16 + 4 * 88 + 20, 32, 1);
  sheet.rect(8, 126, 4 * 248 + 8, 270, PANEL); label(sheet, 14, 130, "НАШ ×3");
  frames.forEach(([, f], i) => { sheet.rect(16 + i * 248, 150, 240, 240, GROUND); sheet.blit(f, 16 + i * 248, 150, 3); });
  sheet.rect(1008, 126, 264, 270, PANEL); label(sheet, 1014, 130, "РЕФЕРЕНС 25 ×3"); sheet.blit(refCrop(228), 1020, 158, 1);
  sheet.rect(8, 404, 1264, 348, PANEL); label(sheet, 14, 410, "СИЛУЭТ ВБОК ×4 | МАСКА РЕФЕРЕНСА ×4");
  sheet.blit(silc(side, SIL), 24, 430, 4);
  const rp = path.resolve("tools/out/bosses139/mino-refsil.png");
  if (fs.existsSync(rp)) { const p = loadPng(rp); for (let y = 0; y < 80; y++) for (let x = 0; x < 64; x++) if (p.data[(y * 64 + x) * 4] > 128) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) sheet.set(24 + 340 + (x + 8) * 4 + a, 430 + y * 4 + b, SIL); }
  const png = new PNG({ width: SW, height: SH });
  png.data = Buffer.from(sheet.d);
  const out = path.resolve("tools/out/bosses139/mino-pose.png");
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log("ok", out);
}
export { keyed, easeIO };
void BONE; void hash; void HORN; void EYE; void EYE2;
