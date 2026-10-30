export type C = [number, number, number];
export const hx = (s: string): C => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
export const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

export class Cv {
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
export class Mk {
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
    // только в рамке многоугольника (результат тот же, быстрее на больших кадрах)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py] of pts) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    const ya = Math.max(0, Math.floor(y0) - 1), yb = Math.min(this.h, Math.ceil(y1) + 1), xa = Math.max(0, Math.floor(x0) - 1), xb = Math.min(this.w, Math.ceil(x1) + 1);
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) this.set(x, y, v);
    }
  }
  ell(cx: number, cy: number, rx: number, ry: number, v = 1) {
    const ya = Math.max(0, Math.floor(cy - Math.abs(ry)) - 1), yb = Math.min(this.h, Math.ceil(cy + Math.abs(ry)) + 1), xa = Math.max(0, Math.floor(cx - Math.abs(rx)) - 1), xb = Math.min(this.w, Math.ceil(cx + Math.abs(rx)) + 1);
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.set(x, y, v); }
  }
  /** расстояние до края внутри маски (1 = крайний пиксель) */
  dist(): Int16Array {
    const d = new Int16Array(this.w * this.h);
    for (let i = 0; i < d.length; i++) d[i] = this.d[i] ? 999 : 0;
    const g = (x: number, y: number) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : d[y * this.w + x]);
    let xa = this.w, xb = -1, ya = this.h, yb = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) { if (x < xa) xa = x; if (x > xb) xb = x; if (y < ya) ya = y; if (y > yb) yb = y; }
    for (let it = 0; it < 60; it++) {
      let ch = false;
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const i = y * this.w + x; if (!d[i]) continue;
        const m = Math.min(g(x - 1, y), g(x + 1, y), g(x, y - 1), g(x, y + 1)) + 1;
        if (m < d[i]) { d[i] = m; ch = true; }
      }
      if (!ch) break;
    }
    return d;
  }
}

export const BAY = [0.0, 0.5, 0.75, 0.25];
/** Закраска маски рампой (индекс 0 тёмный … n-1 светлый) с объёмом по расстоянию до края; свет сверху-слева. */
export function paint(cv: Cv, m: Mk, ramp: C[], o: { amp?: number; dome?: number; dome2?: number; rim?: boolean; dith?: number; light?: [number, number]; bias?: number } = {}): Int16Array {
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
export const STEEL: C[] = ["#07080b", "#12151b", "#1f242d", "#333b48", "#566174", "#93a2b8"].map(hx);
export const BRONZE: C[] = ["#1c0f06", "#3e2410", "#6c4520", "#a06c32", "#cf9a4e", "#f0cc88"].map(hx);
export const SILV: C[] = ["#2a2e36", "#4a525e", "#7a8696", "#aab6c6", "#d8e2ee"].map(hx);
export const FUR: C[] = ["#150d08", "#2c1a0e", "#4a2c18", "#6c4524", "#92622f"].map(hx);
export const HORN: C[] = ["#1e1008", "#4a2812", "#8a4e22", "#c4803c", "#ecb468"].map(hx);
export const BONE: C[] = ["#2a2018", "#5c4a38", "#9a8466", "#cdb890", "#ece0c0"].map(hx);
export const BLUE: C[] = ["#0c1424", "#1c3050", "#3a5c8a"].map(hx);
export const EYE = hx("#e0501c"), EYE2 = hx("#ffb060");
export const OUTL = hx("#040306");
export const SIL = hx("#d8d8e0");
// ---- мелкий шрифт 3×5 (кириллица) ----
export const F: Record<string, string> = {
  "К": "101,101,110,101,101", "О": "111,101,101,101,111", "Л": "011,101,101,101,101", "М": "101,111,111,101,101",
  "А": "010,101,111,101,101", "И": "101,101,111,111,101", "С": "011,100,100,100,011", "Т": "111,010,010,010,010",
  "Е": "111,100,110,100,111", "Н": "101,101,111,101,101", "Ь": "100,100,110,101,110", "Ч": "101,101,111,001,001",
  "Р": "110,101,110,100,100", "П": "111,101,101,101,101", "Ш": "101,101,101,101,111", "У": "101,101,111,001,110",
  "Э": "110,001,011,001,110", "Ф": "010,111,101,111,010", "Б": "111,100,110,101,110", "Г": "111,100,100,100,100",
  "В": "110,101,110,101,110", "Я": "011,101,011,101,101", "Д": "011,101,101,111,101", "×": "000,101,010,101,000",
  "1": "010,110,010,010,111", "2": "110,001,010,100,111", "3": "110,001,010,001,110", "4": "101,101,111,001,001", " ": "000,000,000,000,000",
  "З": "110,001,010,001,110", "Х": "101,101,010,101,101", "5": "111,100,110,001,110", "Ю": "101,111,111,101,101", "Ж": "101,010,111,010,101", "Ц": "101,101,101,111,001", "Ы": "101,101,111,101,111", "Й": "101,111,101,101,111", "Ъ": "110,010,011,011,011", "+": "000,010,111,010,000", "|": "010,010,010,010,010",
};
export const LABEL = hx("#f0e6c8");
export function label(cv: Cv, x: number, y: number, s: string, k = 2) {
  for (const ch of s) {
    const g = F[ch];
    if (g) g.split(",").forEach((row, j) => [...row].forEach((v, i) => { if (v === "1") for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) cv.set(x + i * k + a, y + j * k + b, LABEL); }));
    x += 4 * k;
  }
}

