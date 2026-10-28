/**
 * Задача 139, минотавр-латник (cliff_minotaur_knight, r65n запад): ЭСКИЗ-лист БЕЗ анимации.
 * Силуэт ×1/×3 рядом с силуэтом референса 25, голова ×4, наплечник+нагрудник ×4, кистень ×4.
 * Запуск: npx tsx tools/gen/bosses139/mino_sketch.ts → tools/out/bosses139/mino-sketch.png. Чисто 2D, без движка.
 * Силуэт референса — tools/out/bosses139/mino-refsil.png (64×80, белое = фигура; получен порогом от фона 45,45,45).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

type C = [number, number, number];
const hx = (s: string): C => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

class Cv {
  d: Uint8Array;
  constructor(public w: number, public h: number) { this.d = new Uint8Array(w * h * 4); }
  set(x: number, y: number, c: C) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
  }
  has(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 0; }
  get(x: number, y: number): C { const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  outline(col: C) {
    const add: [number, number][] = [];
    for (let y = -1; y <= this.h; y++) for (let x = -1; x <= this.w; x++) {
      if (this.has(x, y)) continue;
      if (this.has(x + 1, y) || this.has(x - 1, y) || this.has(x, y + 1) || this.has(x, y - 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, col);
  }
  blit(o: Cv, ox: number, oy: number, k = 1) {
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) if (o.has(x, y))
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) this.set(ox + x * k + a, oy + y * k + b, o.get(x, y));
  }
  rect(x: number, y: number, w: number, h: number, c: C) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
}

// ---- маски ----
class Mk {
  d: Uint8Array;
  constructor(public w: number, public h: number) { this.d = new Uint8Array(w * h); }
  has(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[y * this.w + x] > 0; }
  set(x: number, y: number, v = 1) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = v; }
  disc(x: number, y: number, r: number, v = 1) {
    const q = Math.max(0.5, r);
    for (let j = -Math.ceil(q); j <= Math.ceil(q); j++) for (let i = -Math.ceil(q); i <= Math.ceil(q); i++) if (i * i + j * j <= q * q + 0.25) this.set(Math.round(x) + i, Math.round(y) + j, v);
  }
  line(x0: number, y0: number, x1: number, y1: number, t0: number, t1 = t0, v = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= n; i++) { const u = i / n; this.disc(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, (t0 + (t1 - t0) * u) / 2, v); }
  }
  bez(p0: [number, number], p1: [number, number], p2: [number, number], t0: number, t1: number, v = 1) {
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      this.disc(a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1], (t0 + (t1 - t0) * u) / 2, v);
    }
  }
  poly(pts: [number, number][], v = 1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) this.set(x, y, v);
    }
  }
  ell(cx: number, cy: number, rx: number, ry: number, v = 1) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.set(x, y, v); }
  }
  /** расстояние до края внутри маски (1 = крайний пиксель) */
  dist(): Int16Array {
    const d = new Int16Array(this.w * this.h);
    for (let i = 0; i < d.length; i++) d[i] = this.d[i] ? 999 : 0;
    const g = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : d[y * this.w + x]);
    for (let it = 0; it < 60; it++) {
      let ch = false;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x; if (!d[i]) continue;
        const m = Math.min(g(x - 1, y), g(x + 1, y), g(x, y - 1), g(x, y + 1)) + 1;
        if (m < d[i]) { d[i] = m; ch = true; }
      }
      if (!ch) break;
    }
    return d;
  }
}

const BAY = [0.0, 0.5, 0.75, 0.25];
/** Закраска маски рампой (индекс 0 тёмный … n-1 светлый) с объёмом по расстоянию до края; свет сверху-слева. */
function paint(cv: Cv, m: Mk, ramp: C[], o: { amp?: number; dome?: number; dome2?: number; rim?: boolean; dith?: number; light?: [number, number]; bias?: number } = {}): Int16Array {
  const d = m.dist(), n = ramp.length - 1;
  const amp = o.amp ?? 1.5, dome = o.dome ?? 3, dith = o.dith ?? 0.35, bias = o.bias ?? 0;
  const L = o.light ?? [-0.6, -0.8];
  const g = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : d[y * m.w + x]);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const v = d[y * m.w + x]; if (!v) continue;
    const gx = g(x + 1, y) - g(x - 1, y), gy = g(x, y + 1) - g(x, y - 1);
    const len = Math.hypot(gx, gy) || 1;
    const lit = (-gx / len) * L[0] + (-gy / len) * L[1];
    const h = Math.min(v, dome) / dome;
    let t = n / 2 + bias + lit * amp * (1 - 0.55 * h) + (h - 0.5) * 0.9;
    if (v === 1 && lit < 0.2) t -= 0.8;
    t += (BAY[(x & 1) + (y & 1) * 2] - 0.5) * dith * 2;
    cv.set(x, y, ramp[Math.max(0, Math.min(n, Math.round(t)))]);
  }
  return d;
}

// ---- палитры ----
const STEEL: C[] = ["#07080b", "#12151b", "#1f242d", "#333b48", "#566174", "#93a2b8"].map(hx);
const BRONZE: C[] = ["#1c0f06", "#3e2410", "#6c4520", "#a06c32", "#cf9a4e", "#f0cc88"].map(hx);
const SILV: C[] = ["#2a2e36", "#4a525e", "#7a8696", "#aab6c6", "#d8e2ee"].map(hx);
const FUR: C[] = ["#150d08", "#2c1a0e", "#4a2c18", "#6c4524", "#92622f"].map(hx);
const HORN: C[] = ["#1e1008", "#4a2812", "#8a4e22", "#c4803c", "#ecb468"].map(hx);
const BONE: C[] = ["#2a2018", "#5c4a38", "#9a8466", "#cdb890", "#ece0c0"].map(hx);
const BLUE: C[] = ["#0c1424", "#1c3050", "#3a5c8a"].map(hx);
const EYE = hx("#e0501c"), EYE2 = hx("#ffb060");
const OUTL = hx("#040306");
const SIL = hx("#d8d8e0");

// ================= СИЛУЭТ ФИГУРЫ (64×80, ступни y=76) =================
function silhouette(): Cv {
  const m = new Mk(64, 80);
  // ноги: высокие, звериные (голень тоньше бедра), крупные меховые копыта
  m.line(47, 45, 45.5, 58, 12, 10);   // бедро переднее
  m.line(38, 45, 37, 58, 10, 8);      // бедро заднее
  m.line(45.5, 58, 46.5, 67, 9, 7);   // голень
  m.line(37, 58, 36.5, 67, 8, 6);
  m.poly([[41, 66], [52, 67], [52.5, 73], [51, 76.5], [42, 76.5]]);   // копыто переднее
  m.poly([[31, 68], [41, 67], [41.5, 76.5], [33, 76.5], [30.5, 72]]); // копыто заднее
  // таз и узкая талия
  m.poly([[34, 40], [44, 40], [50, 47], [35, 49], [32, 46]]);
  // верх тела — клин: широкие плечи и грудь, сутулая шея слита с плечами, к талии сужается
  m.poly([[28, 17], [33, 15], [40, 15], [45, 11], [55, 10.5], [62, 14], [63.5, 21], [61, 29], [58.5, 37], [55, 42], [50, 46], [44, 43], [36, 43], [33.5, 37], [31, 31], [27, 26]]);
  // бык-голова в шлеме, наклонена вперёд-вниз; морда вынесена влево-вниз
  m.ell(44, 11.5, 5.5, 5, 1);
  m.poly([[39, 13], [43, 14], [44, 19], [41, 22], [38.5, 21]]);
  m.poly([[38, 17], [41, 17], [41.5, 23], [38.5, 22.5]]);
  // рога: ближний (влево-вверх), дальний (вправо-вверх), загнуты вперёд
  m.bez([40, 12], [30, 10], [34, 3], 3.6, 1);
  m.bez([47.5, 10.5], [57, 10], [49, 1.5], 3.8, 1);
  // правая рука: кулак у бедра, локоть отставлен
  m.line(57, 36, 51, 44, 8, 6.5);
  m.disc(48.5, 46.5, 3.2);
  // левая рука (дальняя) опущена, держит рукоять
  m.line(31.5, 28, 29.5, 40, 5, 4.5);
  m.line(29.5, 40, 28.5, 49, 4.5, 4);
  m.disc(28.5, 49.5, 2.6);
  // рукоять с навершием и кистень на цепи
  m.line(27, 50, 17, 53, 3, 3);
  m.poly([[11.5, 51], [17.5, 50], [17.5, 56], [14, 57], [11, 54]]);
  for (let i = 0; i < 6; i++) { m.disc(10 - (i % 2), 58 + i * 1.8, 0.9); }
  m.poly([[1.5, 69], [3.5, 66.5], [7, 67.5], [10.5, 66.5], [13, 69], [12.5, 72.5], [9.5, 77], [7.5, 79.5], [5.5, 77], [2, 72.5]]);
  const c = new Cv(64, 80);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 64; x++) if (m.has(x, y)) c.set(x, y, SIL);
  return c;
}

// ================= ГОЛОВА (36×36) =================
function head(): Cv {
  const W = 36, H = 36;
  const c = new Cv(W, H);
  // рога: кольчатые, загнуты вперёд-вверх. ближний — влево, дальний — вправо
  const horn = (p0: [number, number], p1: [number, number], p2: [number, number], t0: number, t1: number, far: boolean) => {
    const m = new Mk(W, H); m.bez(p0, p1, p2, t0, t1);
    const d = paint(c, m, HORN, { amp: 1.7, dome: 2, dith: 0.15, bias: far ? -0.5 : 0 });
    // кольца: поперечные полосы вдоль дуги
    for (let i = 0; i <= 60; i++) {
      if (i % 4 !== 0) continue;
      const u = i / 60, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), cc = u * u;
      const x = a * p0[0] + b * p1[0] + cc * p2[0], y = a * p0[1] + b * p1[1] + cc * p2[1];
      const dx = 2 * (1 - u) * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0]), dy = 2 * (1 - u) * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1]);
      const l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, tw = (t0 + (t1 - t0) * u) / 2;
      for (let s = -tw; s <= tw; s += 0.6) { const px = Math.round(x + nx * s), py = Math.round(y + ny * s); if (m.has(px, py)) c.set(px, py, HORN[1]); }
    }
    void d;
  };
  horn([13, 15], [-3, 11], [8, 0.5], 4.6, 0.8, false);
  horn([24, 14], [39, 11], [28, 0.5], 4.6, 0.8, true);
  // пучок меха на макушке под шлемом
  const tuft = new Mk(W, H); tuft.poly([[17, 6], [20, 3], [23, 4], [24, 7], [20, 8]]);
  paint(c, tuft, FUR, { amp: 1, dome: 2, dith: 0.5 });
  // морда: длинная, вынесена вниз-влево, мех
  const mz = new Mk(W, H);
  mz.poly([[15, 14], [24, 14], [25, 22], [21, 27], [13, 29], [8, 28], [7, 24], [10, 19]]);
  paint(c, mz, FUR, { amp: 1.6, dome: 3, dith: 0.5 });
  // нос: тёмный широкий пятак + ноздря
  const nz = new Mk(W, H); nz.poly([[7, 24], [11, 23], [14, 26], [14, 29], [9, 30], [6, 28]]);
  paint(c, nz, ["#0a0608", "#1c1012", "#3a2224", "#5c3a38"].map(hx), { amp: 1, dome: 2, dith: 0.2 });
  c.set(9, 27, OUTL); c.set(10, 27, OUTL); c.set(11, 28, hx("#050304"));
  // борода-клыки: костяные пластины, свисают под челюстью
  for (let i = 0; i < 4; i++) {
    const x = 14 + i * 2.6, len = 6 + (i % 2) * 2 + (i === 1 ? 1 : 0), m2 = new Mk(W, H);
    m2.line(x, 27, x - 0.6, 27 + len, 2.2, 0.7);
    paint(c, m2, BONE, { amp: 1.2, dome: 1, dith: 0.1 });
  }
  // шлем: купол, козырёк нависает над глазом, бронзовая обводка и гребень
  const hm = new Mk(W, H);
  hm.poly([[11, 14], [14, 7], [20, 3.5], [27, 5], [30, 11], [28, 16], [22, 17], [16, 18]]);
  const dh = paint(c, hm, STEEL, { amp: 1.6, dome: 3, dith: 0.3 });
  // козырёк: нижний край
  for (let x = 12; x <= 28; x++) {
    for (let y = 12; y <= 19; y++) if (hm.has(x, y) && dh[y * W + x] === 1 && y > 14) c.set(x, y, BRONZE[3]);
  }
  // гравировка: бронзовая дуга по гребню шлема и ромб
  for (let i = 0; i <= 18; i++) { const u = i / 18, x = 12.5 + u * 16, y = 14 - Math.sin(u * Math.PI) * 8.5 + u * 1.5; if (hm.has(Math.round(x), Math.round(y))) c.set(x, y, BRONZE[i % 3 === 2 ? 4 : 3]); }
  for (const [x, y] of [[19, 7], [20, 8], [21, 9], [22, 8], [23, 7], [21, 6], [20, 10], [21, 11], [22, 10]]) c.set(x, y, BRONZE[2]);
  c.set(21, 8, BRONZE[5]); c.set(26, 10, SILV[3]); c.set(15, 13, SILV[3]);
  // глаз в тени козырька: тусклый тлеющий
  c.set(17, 18, hx("#05030a")); c.set(18, 18, hx("#05030a")); c.set(18, 19, EYE); c.set(17, 19, hx("#6a2410")); c.set(19, 19, hx("#05030a"));
  c.set(18, 19, EYE2);
  // скула/щека: светлый мех под глазом
  c.set(20, 21, FUR[4]); c.set(21, 22, FUR[4]); c.set(19, 22, FUR[3]); c.set(18, 24, FUR[4]);
  c.outline(OUTL);
  return c;
}

// ================= НАПЛЕЧНИК + НАГРУДНИК (50×40) =================
function spiral(c: Cv, m: Mk, cx: number, cy: number, r0: number, r1: number, turns: number, a0: number, col: C, col2: C) {
  const n = Math.ceil(turns * 40);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + u * turns * Math.PI * 2, r = r0 + (r1 - r0) * u;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 0.9);
    if (m.has(x, y)) c.set(x, y, u > 0.6 ? col2 : col);
  }
}
function armor(): Cv {
  const W = 52, H = 42;
  const c = new Cv(W, H);
  // нагрудник: тёмная сталь, трапеция с зауженным низом
  const ch = new Mk(W, H);
  ch.poly([[2, 14], [18, 11], [34, 14], [36, 20], [33, 30], [26, 37], [12, 37], [5, 30], [1, 21]]);
  const dc = paint(c, ch, STEEL, { amp: 1.4, dome: 5, dith: 0.3 });
  // нижние ламели: три скруглённых пояса
  for (const [yb, tone] of [[27, 1], [31, 2], [35, 3]] as [number, number][]) {
    for (let x = 4; x <= 34; x++) {
      const u = (x - 19) / 15, y = Math.round(yb + 3 * (u * u) - 2);
      if (ch.has(x, y) && dc[y * W + x] > 1) { c.set(x, y, STEEL[1]); if (ch.has(x, y - 1) && dc[(y - 1) * W + x] > 1) c.set(x, y - 1, STEEL[tone + 2]); }
    }
  }
  // чешуя между поясами: точки светлой стали
  for (let y = 24; y <= 36; y += 2) for (let x = 7 + (y % 4 ? 1 : 0); x <= 30; x += 3) if (ch.has(x, y) && dc[y * W + x] > 2) c.set(x, y, STEEL[4]);
  // верхняя кромка — бронзовый чеканный борт
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, x = 2 + u * 33, y = 14 - Math.sin(u * Math.PI) * 3 + u * 0.8;
    c.set(x, y, BRONZE[4]); c.set(x, y + 1, BRONZE[3]); c.set(x, y + 2, BRONZE[2]);
  }
  // центральная бляха: бронзовый диск с крестом
  const md = new Mk(W, H); md.disc(19, 21, 4.6);
  paint(c, md, BRONZE, { amp: 1.6, dome: 3, dith: 0.25 });
  for (const [x, y] of [[19, 18], [19, 19], [19, 21], [19, 22], [19, 23], [17, 21], [18, 21], [20, 21], [21, 21]]) c.set(x, y, BRONZE[0]);
  c.set(19, 20, BRONZE[5]); c.set(19, 17, BRONZE[5]);
  // чеканка на груди: волюты и усики
  spiral(c, ch, 9, 22, 0.5, 4.2, 1.5, 0.5, BRONZE[3], BRONZE[2]);
  spiral(c, ch, 29, 22, 0.5, 4.2, 1.5, 2.8, BRONZE[3], BRONZE[2]);
  for (let i = 0; i <= 14; i++) { const x = 7 + i, y = 29 + Math.round(Math.sin(i * 0.9) * 1.2); if (ch.has(x, y)) c.set(x, y, BRONZE[2]); }
  // наплечник: большой купол правее, перекрывает угол груди
  const pd = new Mk(W, H);
  pd.poly([[18, 6], [28, 1], [41, 1.5], [50, 7], [50.5, 15], [46, 22], [36, 25], [26, 22], [19, 14]]);
  const dp = paint(c, pd, STEEL, { amp: 1.7, dome: 6, dith: 0.3, bias: 0.2 });
  // контурные гребни наплечника: рёбра по расстоянию до края (светлое ребро над тёмной бороздой)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = dp[y * W + x]; if (!v) continue;
    if (v === 4 || v === 8) { const up = dp[Math.max(0, y - 1) * W + x]; c.set(x, y, up < v ? STEEL[5] : STEEL[1]); }
    if (v === 5 || v === 9) c.set(x, y, STEEL[0]);
  }
  // бронзовый ободок: внешние 2 px, светлее сверху-слева
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = dp[y * W + x]; if (!v || v > 2) continue;
    const lit = (x + y) < 36;
    c.set(x, y, v === 1 ? (lit ? BRONZE[2] : BRONZE[1]) : (lit ? BRONZE[5] : BRONZE[3]));
  }
  // чеканка: волюты и вьюнок внутри купола
  spiral(c, pd, 38, 10, 0.5, 5.2, 1.8, 0.2, BRONZE[4], BRONZE[3]);
  spiral(c, pd, 28, 15, 0.5, 3.6, 1.4, 3.0, BRONZE[4], BRONZE[3]);
  spiral(c, pd, 43, 17, 0.5, 2.8, 1.3, 1.0, BRONZE[3], BRONZE[2]);
  for (let i = 0; i <= 16; i++) { const x = 22 + i, y = 7 + Math.round(Math.sin(i * 0.7) * 1.4) + Math.floor(i / 4); if (pd.has(x, y) && dp[y * W + x] > 2) c.set(x, y, BRONZE[3]); }
  // заклёпки
  for (const [x, y] of [[22, 9], [47, 11], [40, 21], [30, 21]]) { c.set(x, y, SILV[3]); c.set(x + 1, y, SILV[1]); }
  c.outline(OUTL);
  return c;
}

// ================= КИСТЕНЬ (40×70) =================
function flail(): Cv {
  const W = 40, H = 72;
  const c = new Cv(W, H);
  // рукоять: горизонталь слева, рёбра-кольца, синяя обмотка
  const hd = new Mk(W, H); hd.line(2, 5, 24, 5, 4.4, 4.4);
  paint(c, hd, BRONZE, { amp: 1.5, dome: 2, dith: 0.1, bias: -0.4 });
  for (let x = 4; x <= 22; x += 3) { for (let y = 3; y <= 7; y++) if (hd.has(x, y)) c.set(x, y, (x / 3) % 2 ? BRONZE[1] : BRONZE[5]); }
  for (let x = 9; x <= 12; x++) for (let y = 3; y <= 7; y++) if (hd.has(x, y)) c.set(x, y, BLUE[(x + y) % 2 ? 2 : 1]);
  // навершие-рифлёный конус (чаша), раструбом к цепи
  const cup = new Mk(W, H); cup.poly([[22, 3.5], [27, 1], [33, 1], [32, 12], [27, 13], [22, 6.5]]);
  const dcup = paint(c, cup, BRONZE, { amp: 1.5, dome: 3, dith: 0.2 });
  for (let i = 0; i < 5; i++) for (let y = 2; y <= 12; y++) { const x = 24 + i * 2 + (y > 7 ? 0 : -1); if (cup.has(x, y) && dcup[y * W + x] > 1) c.set(x, y, i % 2 ? BRONZE[1] : BRONZE[4]); }
  // кольцо и цепь
  const ring = (x: number, y: number, rx: number, ry: number) => {
    for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; c.set(x + Math.cos(t) * rx, y + Math.sin(t) * ry, a < 20 ? BRONZE[4] : BRONZE[2]); }
  };
  ring(28, 15, 2.4, 2.6);
  for (let i = 0; i < 8; i++) {
    const y = 19 + i * 3.4, x = 28 - i * 0.5 + Math.sin(i * 1.3) * 0.8;
    if (i % 2 === 0) { ring(x, y, 1.4, 2.4); } else { ring(x, y, 2.2, 1.3); }
    c.set(x, y, SILV[2]);
  }
  // ракушка-ядро: веер с рёбрами, зубчатый верхний край, шип вниз
  const cx = 24, ay = 62;
  const sh = new Mk(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - ay, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx); // верхний веер: a от -π.. 0
    if (dy > 0.5 || a > -0.32 || a < -Math.PI + 0.32) continue;
    const rim = 21 + Math.cos((a + Math.PI / 2) * 9) * 1.2;
    if (r <= rim) sh.set(x, y);
  }
  const dsh = paint(c, sh, STEEL, { amp: 1.4, dome: 4, dith: 0.3, bias: 0.2 });
  // радиальные рёбра: светлое / тёмное чередование
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI + 0.45 + k * ((Math.PI - 0.9) / 8);
    for (let r = 4; r < 22; r += 0.5) {
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(ay + Math.sin(a) * r);
      if (sh.has(x, y) && dsh[y * W + x] > 1) c.set(x, y, k % 2 ? STEEL[0] : STEEL[5]);
    }
  }
  // бронзовый зубчатый ободок
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sh.has(x, y) && dsh[y * W + x] === 2 && y < ay - 4) c.set(x, y, BRONZE[x + y < 60 ? 4 : 3]);
  for (let a = 0; a < 7; a++) { const t = -Math.PI + 0.7 + a * 0.36; c.set(cx + Math.cos(t) * 14, ay + Math.sin(t) * 14, SILV[4]); }
  // шип
  const sp = new Mk(W, H); sp.poly([[cx - 3.5, ay - 2], [cx + 3.5, ay - 2], [cx + 1, ay + 6], [cx, ay + 9.5], [cx - 1, ay + 6]]);
  paint(c, sp, BRONZE, { amp: 1.5, dome: 2, dith: 0.1 });
  c.outline(OUTL);
  return c;
}

// ---- мелкий шрифт 3×5 (кириллица) ----
const F: Record<string, string> = {
  "К": "101,101,110,101,101", "О": "111,101,101,101,111", "Л": "011,101,101,101,101", "М": "101,111,111,101,101",
  "А": "010,101,111,101,101", "И": "101,101,111,111,101", "С": "011,100,100,100,011", "Т": "111,010,010,010,010",
  "Е": "111,100,110,100,111", "Н": "101,101,111,101,101", "Ь": "100,100,110,101,110", "Ч": "101,101,111,001,001",
  "Р": "110,101,110,100,100", "П": "111,101,101,101,101", "Ш": "101,101,101,101,111", "У": "101,101,111,001,110",
  "Э": "110,001,011,001,110", "Ф": "010,111,101,111,010", "Б": "111,100,110,101,110", "Г": "111,100,100,100,100",
  "В": "110,101,110,101,110", "Я": "011,101,011,101,101", "Д": "011,101,101,111,101", "×": "000,101,010,101,000",
  "1": "010,110,010,010,111", "2": "110,001,010,100,111", "3": "110,001,010,001,110", "4": "101,101,111,001,001", " ": "000,000,000,000,000",
  "+": "000,010,111,010,000", "|": "010,010,010,010,010",
};
const LABEL = hx("#f0e6c8");
function label(cv: Cv, x: number, y: number, s: string, k = 2) {
  for (const ch of s) {
    const g = F[ch];
    if (g) g.split(",").forEach((row, j) => [...row].forEach((v, i) => { if (v === "1") for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) cv.set(x + i * k + a, y + j * k + b, LABEL); }));
    x += 4 * k;
  }
}

// ---- сборка листа ----
const BG = hx("#26242b"), PANEL = hx("#322f38");
const SW = 900, SH = 600;
const sh = new Cv(SW, SH);
sh.rect(0, 0, SW, SH, BG);
const panel = (x: number, y: number, w: number, h: number) => sh.rect(x, y, w, h, PANEL);

let ref: Cv | null = null;
const refPath = path.resolve("tools/out/bosses139/mino-refsil.png");
if (fs.existsSync(refPath)) {
  const p = PNG.sync.read(fs.readFileSync(refPath)); ref = new Cv(64, 80);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4; if (p.data[i] > 128) ref.set(x, y, SIL); }
}
const mine = silhouette();
panel(8, 8, 540, 276); label(sh, 14, 14, "СИЛУЭТ  НАШ ×1 ×3 | РЕФЕРЕНС ×3 ×1");
sh.blit(mine, 16, 40, 1); sh.blit(mine, 90, 40, 3);
if (ref) { sh.blit(ref, 290, 40, 3); sh.blit(ref, 480, 40, 1); }
panel(556, 8, 336, 276); label(sh, 562, 14, "ГОЛОВА ×4"); const hd = head(); sh.blit(hd, 600, 60, 4);
panel(8, 292, 420, 300); label(sh, 14, 298, "БРОНЯ ×4  НАПЛЕЧНИК И НАГРУДНИК"); const ar = armor(); sh.blit(ar, 100, 360, 4);
panel(436, 292, 456, 300); label(sh, 442, 298, "КИСТЕНЬ ×4"); const fl = flail(); sh.blit(fl, 460, 316, 4); sh.blit(fl, 680, 316, 1); label(sh, 676, 308, "×1");

const png = new PNG({ width: SW, height: SH });
png.data = Buffer.from(sh.d);
const out = path.resolve("tools/out/bosses139/mino-sketch.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log("ok", out);
