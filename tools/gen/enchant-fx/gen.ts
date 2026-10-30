/**
 * Пробы визуала заточки (варианты A/B/C/D x ступени +5/+8/+11), в игру не включены.
 * Герой — nude_warrior (вид сбоку), меч и щит рисуются здесь же; свечение — отдельные fx-листы (кадр 48x48).
 * Запуск: npx tsx tools/gen/enchant-fx/gen.ts  ->  tools/out/enchant/
 */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { P } from "../palette";
import { hex, mix, hash01, pnoise, type RGBA } from "../canvas";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "tools/out/enchant");
fs.mkdirSync(OUT, { recursive: true });
const F = 48, OX = 4, OY = 10;
const IDLE_N = 36, STRIKE_N = 12;
const VARS = ["A", "B", "C", "D"] as const, TIERS = [1, 2, 3] as const, MODES = ["idle", "strike"] as const;
type V = (typeof VARS)[number]; type Mode = (typeof MODES)[number];
const DARK = P.steel[0];

class Img {
  d = new Uint8ClampedArray(F * F * 4);
  set(x: number, y: number, c: RGBA, over = false) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= F || y >= F) return;
    const i = (y * F + x) * 4;
    if (over && c[3] < 255) {
      const a = c[3] / 255, b = this.d[i + 3] / 255, o = a + b * (1 - a);
      for (let k = 0; k < 3; k++) this.d[i + k] = (c[k] * a + this.d[i + k] * b * (1 - a)) / (o || 1);
      this.d[i + 3] = o * 255;
    } else { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3]; }
  }
  a(x: number, y: number) { return x < 0 || y < 0 || x >= F || y >= F ? 0 : this.d[(y * F + x) * 4 + 3]; }
  get(x: number, y: number): RGBA { const i = (y * F + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
}
const ease = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const pulse = (f: number, lo: number, hi: number) => lo + (hi - lo) * (0.5 - 0.5 * Math.cos(2 * Math.PI * f));

// ---------- герой ----------
const src = PNG.sync.read(fs.readFileSync(path.join(ROOT, "client/public/assets/units/nude_warrior.png")));
function body(dx: number, dy: number, col = 0): Img {
  const im = new Img();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const s = ((64 + y) * src.width + col * 32 + x) * 4;
    if (src.data[s + 3] < 128) continue;
    let c: RGBA = [src.data[s], src.data[s + 1], src.data[s + 2], 255];
    const lum = (c[0] + c[1] + c[2]) / 765;
    const isOutline = lum < 0.2;
    if (!isOutline && y >= 15 && y <= 24) { const r = P.cloth.red; c = r[Math.min(3, Math.max(0, Math.round(lum * 4.4 - 0.8)))]; }
    else if (!isOutline && y >= 25 && y <= 28) { const r = P.leather; c = r[Math.min(3, Math.max(0, Math.round(lum * 4 - 0.5)))]; }
    im.set(x + OX + dx, y + OY + dy, c);
  }
  return im;
}

// ---------- оружие и щит ----------
type Layer = { px: Map<number, RGBA>; out: Set<number> };
const K = (x: number, y: number) => y * F + x;
function finish(px: Map<number, RGBA>): Layer {
  const out = new Set<number>();
  for (const k of px.keys()) {
    const x = k % F, y = (k / F) | 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= F || ny >= F) continue;
      const kk = K(nx, ny); if (!px.has(kk)) out.add(kk);
    }
  }
  return { px, out };
}
const SL = 16;
function sword(hx: number, hy: number, ang: number, L = SL): Layer {
  const a = (ang * Math.PI) / 180, ux = Math.sin(a), uy = -Math.cos(a), vx = Math.cos(a), vy = Math.sin(a);
  const px = new Map<number, RGBA>();
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    const dx = x + 0.5 - hx, dy = y + 0.5 - hy, s = dx * ux + dy * uy, d = dx * vx + dy * vy;
    let c: RGBA | null = null;
    if (s >= 5 && s <= L) {
      const w = s < L - 3 ? 1.5 : 0.35 + ((L - s) / 3) * 1.15;
      if (Math.abs(d) <= w) c = Math.abs(d) <= 0.5 ? P.steel[4] : d < 0 ? P.steel[3] : P.steel[2];
      if (c && s > L - 1.5) c = P.steel[4];
    } else if (s >= 3.6 && s < 5 && Math.abs(d) <= 3.2) c = d < 0 ? P.gold[3] : P.gold[1];
    else if (s >= 0.6 && s < 3.6 && Math.abs(d) <= 0.8) c = d < 0 ? P.leather[2] : P.leather[0];
    else if (s >= -0.6 && s < 0.6 && Math.abs(d) <= 1.3) c = P.gold[2];
    if (c) px.set(K(x, y), c);
  }
  return finish(px);
}
function shield(cx: number, cy: number): Layer {
  const px = new Map<number, RGBA>(), rx = 4.2, ry = 6.6;
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, r = dx * dx + dy * dy;
    if (r > 1) continue;
    const lit = -(dx + dy) * 0.5; let c: RGBA;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 1.5) c = P.gold[3];
    else if (r > 0.52) c = lit > 0.25 ? P.steel[4] : lit > -0.2 ? P.steel[3] : P.steel[1];
    else c = lit > 0.2 ? P.cloth.red[3] : lit > -0.25 ? P.cloth.red[2] : P.cloth.red[1];
    px.set(K(x, y), c);
  }
  return finish(px);
}
function angleAt(i: number, mode: Mode) {
  if (mode === "idle") return 30 + 3 * Math.sin((2 * Math.PI * i) / IDLE_N);
  i = ((i % STRIKE_N) + STRIKE_N) % STRIKE_N;
  if (i <= 3) return 30 - 100 * easeOut(i / 3);
  if (i <= 7) return -70 + 170 * ease((i - 3) / 4);
  return 100 - 70 * ease((i - 7) / 5);
}
const LUNGE = [0, 0, -1, -1, 0, 1, 2, 2, 1, 1, 0, 0];
interface Base { img: Img; sw: Layer; sh: Layer; dx: number; dy: number; ang: number; hand: [number, number] }
function base(mode: Mode, i: number): Base {
  const dx = mode === "strike" ? LUNGE[i] : 0;
  const dy = mode === "idle" ? (Math.sin((2 * Math.PI * i) / IDLE_N) > 0.55 ? -1 : 0) : 0;
  const img = body(dx, dy, 0);
  const sh = shield(OX + 19 + dx, OY + 20 + dy);
  const hand: [number, number] = [OX + 22 + dx, OY + 20 + dy];
  const ang = angleAt(i, mode);
  const sw = sword(hand[0], hand[1], ang);
  const put = (l: Layer) => {
    for (const [k, c] of l.px) img.set(k % F, (k / F) | 0, c);
    for (const k of l.out) if (!img.a(k % F, (k / F) | 0)) img.set(k % F, (k / F) | 0, DARK);
  };
  put(sh); put(sw);
  return { img, sw, sh, dx, dy, ang, hand };
}

// ---------- свечение ----------
const TC = {
  A: [P.steel[3], P.gold[2], P.imp[2]],
  B: [P.steel[3], P.gold[2], P.imp[2]],
  C: [P.steel[3], P.gold[2], P.imp[2]],
  D: [P.gold[1], P.gold[3], P.imp[2]],
} as Record<V, RGBA[]>;
function tierColor(v: V, t: number, i: number, n: number): RGBA {
  if (v === "D" && t === 3) return mix(P.imp[2], P.gold[3], 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n === STRIKE_N ? STRIKE_N : 18)));
  return TC[v][t - 1];
}
function fx(v: V, t: number, mode: Mode, i: number, b: Base): Img {
  const n = mode === "idle" ? IDLE_N : STRIKE_N, im = new Img();
  const col = tierColor(v, t, i, n), ph = i / n;
  let al: number;
  if (v === "A") al = pulse((i / 18) % 1, 0.35, 0.8);
  else if (v === "D" && t === 1) al = pulse(ph, 0.3, 0.6);
  else al = pulse((i / 18) % 1, 0.55, 0.9);
  const rings = [b.sw, b.sh];
  for (const l of rings) for (const k of l.out) {
    const x = k % F, y = (k / F) | 0;
    if (b.img.a(x, y) === 255 && b.img.get(x, y).join() !== DARK.join()) continue;
    im.set(x, y, [col[0], col[1], col[2], Math.round(255 * al)]);
  }
  if (t === 3) for (const l of rings) for (const k of l.out) {
    const x = k % F, y = (k / F) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= F || ny >= F) continue;
      const kk = K(nx, ny);
      if (l.px.has(kk) || l.out.has(kk) || im.a(nx, ny) || b.img.a(nx, ny)) continue;
      im.set(nx, ny, [col[0], col[1], col[2], Math.round(255 * al * 0.38)]);
    }
  }
  const shine = v === "B" || v === "C" || (v === "D" && t >= 2);
  if (shine) {
    const cyc = mode === "idle" ? IDLE_N : STRIKE_N, q = (i % cyc) / cyc;
    const sweep = v === "D" ? 0.4 : 0.45;
    if (q < sweep) {
      const e = ease(q / sweep);
      for (const l of rings) {
        let y0 = 1e9, y1 = -1e9;
        for (const k of l.px.keys()) { const y = (k / F) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const cy = y1 + 2 - (y1 - y0 + 4) * e;
        for (const k of [...l.px.keys(), ...l.out]) {
          const x = k % F, y = (k / F) | 0, dd = Math.abs(y + 0.5 - cy);
          if (dd > 2) continue;
          const a = dd < 1 ? 0.85 : 0.4, isOut = !l.px.has(k);
          im.set(x, y, [255, 246, 214, Math.round(255 * a * (isOut ? 0.9 : 0.75))]);
        }
      }
    }
  }
  const sparks = (v === "B" || v === "D") && t === 3;
  if (sparks) for (let j = 0; j < 3; j++) {
    const age = (((i - j * 4) % 12) + 12) % 12, cyc = Math.floor((i - j * 4 + 36) / 12);
    const s = 7 + hash01(j, cyc, 11) * 8, jit = (hash01(j, cyc, 5) - 0.5) * 4;
    const a = (b.ang * Math.PI) / 180, bx = b.hand[0] + Math.sin(a) * s, by = b.hand[1] - Math.cos(a) * s;
    const x = bx + jit * (age / 12), y = by - 9 * easeOut(age / 12);
    const c = age < 4 ? P.gold[4] : age < 8 ? P.gold[3] : P.imp[2];
    im.set(x, y, [c[0], c[1], c[2], Math.round(255 * (1 - age / 12) ** 0.8)], true);
  }
  if (v === "D" && t >= 2 && mode === "strike" && i >= 5 && i <= 9) {
    for (let k = 1; k <= 3; k++) {
      const sw = sword(b.hand[0], b.hand[1], angleAt(i - k, mode));
      const a = [0.55, 0.32, 0.15][k - 1];
      for (const key of sw.px.keys()) {
        const x = key % F, y = (key / F) | 0;
        if (Math.hypot(x + 0.5 - b.hand[0], y + 0.5 - b.hand[1]) < 9) continue;
        if (b.sw.px.has(key) || b.sw.out.has(key) || im.a(x, y) || b.img.a(x, y)) continue;
        im.set(x, y, [col[0], col[1], col[2], Math.round(255 * a)]);
      }
    }
  }
  if (v === "C" && t === 3) {
    for (let k = 0; k < 28; k++) {
      const th = (k / 28) * Math.PI * 2, x = Math.round(OX + 16 + 9.5 * Math.cos(th)), y = Math.round(40 + 3.2 * Math.sin(th));
      const br = 0.5 + 0.5 * Math.cos(th * 2 - (2 * Math.PI * i) / n);
      if (br < 0.3) continue;
      if (b.img.a(x, y) && Math.sin(th) < 0) continue;
      const c = mix(P.imp[2], P.gold[3], br);
      im.set(x, y, [c[0], c[1], c[2], Math.round(255 * (0.35 + 0.55 * br))]);
    }
  }
  return im;
}
function halo(b: Base): Img {
  const im = new Img(), a = (b.ang * Math.PI) / 180, cx = b.hand[0] + Math.sin(a) * 10, cy = b.hand[1] - Math.cos(a) * 10;
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    const d = Math.hypot(x - cx, (y - cy) * 0.9), al = d < 5 ? 0.22 : d < 8 ? 0.13 : d < 11 ? 0.06 : 0;
    if (al) im.set(x, y, [240, 130, 60, Math.round(255 * al)]);
  }
  return im;
}

// ---------- запись ----------
function sheet(frames: Img[]) {
  const p = new PNG({ width: F * frames.length, height: F });
  frames.forEach((im, n) => {
    for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
      const s = (y * F + x) * 4, d = (y * p.width + n * F + x) * 4;
      for (let k = 0; k < 4; k++) p.data[d + k] = im.d[s + k];
    }
  });
  return p;
}
const save = (name: string, p: PNG) => fs.writeFileSync(path.join(OUT, name), PNG.sync.write(p));
function night(im: Img): Img {
  const o = new Img();
  for (let i = 0; i < im.d.length; i += 4) { o.d[i] = im.d[i] * 0.42; o.d[i + 1] = im.d[i + 1] * 0.5; o.d[i + 2] = im.d[i + 2] * 0.72; o.d[i + 3] = im.d[i + 3]; }
  return o;
}

const bases: Record<Mode, Base[]> = { idle: [], strike: [] };
for (const m of MODES) { const n = m === "idle" ? IDLE_N : STRIKE_N; for (let i = 0; i < n; i++) bases[m].push(base(m, i)); }
for (const m of MODES) {
  save(`base-${m}.png`, sheet(bases[m].map((b) => b.img)));
  save(`base-${m}-night.png`, sheet(bases[m].map((b) => night(b.img))));
  save(`halo-D-3-${m}.png`, sheet(bases[m].map(halo)));
  for (const v of VARS) for (const t of TIERS) save(`fx-${v}-${t}-${m}.png`, sheet(bases[m].map((b, i) => fx(v, t, m, i, b))));
}

// ---------- мелкий шрифт ----------
const FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"], "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"], "+": ["000", "010", "111", "010", "000"],
  A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"], C: ["011", "100", "100", "100", "011"], D: ["110", "101", "101", "101", "110"],
};
function put(p: PNG, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  const i = (y * p.width + x) * 4; p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = c[3];
}
function text(p: PNG, s: string, x: number, y: number, k: number, c: RGBA) {
  for (const ch of s) {
    const g = FONT[ch];
    if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === "1") for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) put(p, x + q * k + a, y + r * k + b, c);
    x += 4 * k;
  }
}
function newPng(w: number, h: number, c: RGBA = [0, 0, 0, 0]) {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) { p.data[i * 4] = c[0]; p.data[i * 4 + 1] = c[1]; p.data[i * 4 + 2] = c[2]; p.data[i * 4 + 3] = c[3]; }
  return p;
}
// иконка 48x48: плитка, большой меч по диагонали, «+N» в правом верхнем углу цветом ступени
function icon(v: V, t: number, label: string, rarity: RGBA): PNG {
  const p = newPng(48, 48, [34, 28, 40, 255]);
  for (let y = 1; y < 47; y++) for (let x = 1; x < 47; x++) { const g = 0.9 + 0.1 * (1 - (x + y) / 94); put(p, x, y, [Math.round(48 * g), Math.round(40 * g), Math.round(58 * g), 255]); }
  for (let i = 0; i < 48; i++) for (const [x, y] of [[i, 0], [i, 47], [0, i], [47, i]]) put(p, x, y, rarity);
  const sl = sword(8, 41, 45, 40), col = t ? tierColor(v, t, 0, 18) : null;
  for (const k of sl.out) put(p, k % F, (k / F) | 0, DARK);
  for (const [k, c] of sl.px) put(p, k % F, (k / F) | 0, c);
  if (col) for (const k of sl.out) put(p, k % F, (k / F) | 0, [col[0], col[1], col[2], 255]);
  if (label) {
    const w = label.length * 8 + 2;
    for (let y = 3; y < 15; y++) for (let x = 45 - w; x < 45; x++) put(p, x, y, [16, 12, 22, 225]);
    text(p, label, 45 - w + 2, 5, 2, col ?? P.gold[3]);
  }
  return p;
}
for (const v of VARS) {
  const w = newPng(48 * 4, 48);
  [["", 0], ["+5", 1], ["+8", 2], ["+11", 3]].forEach(([lb, t], n) => PNG.bitblt(icon(v, t as number, lb as string, P.steel[2]), w, 0, 0, 48, 48, n * 48, 0));
  save(`icons-${v}.png`, w);
}
function ground(nightMode: boolean) {
  const p = newPng(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const n = pnoise(x, y, 8, 64, 3) * 0.6 + pnoise(x, y, 4, 64, 9) * 0.4;
    let c = mix(hex("#4a5a30"), hex("#7a8a48"), n);
    if (hash01(x, y, 4) > 0.93) c = mix(c, hex("#5a4a30"), 0.6);
    if (nightMode) c = [c[0] * 0.38, c[1] * 0.46, c[2] * 0.72, 255].map(Math.round) as RGBA;
    put(p, x, y, c);
  }
  return p;
}
const dayBg = ground(false), nightBg = ground(true);
save("bg-day.png", dayBg); save("bg-night.png", nightBg);

// ---------- монтаж ----------
function cell(p: PNG, gx: number, gy: number, S: number, nightMode: boolean, v: V | null, t: number, mode: Mode, i: number) {
  const bg = nightMode ? nightBg : dayBg;
  for (let y = 0; y < F * S; y++) for (let x = 0; x < F * S; x++) {
    const s = ((((y / S) | 0) % 64) * 64 + (((x / S) | 0) % 64)) * 4;
    put(p, gx + x, gy + y, [bg.data[s], bg.data[s + 1], bg.data[s + 2], 255]);
  }
  for (let x = -7; x <= 7; x++) for (let y = -1; y <= 1; y++) if ((x / 7) ** 2 + (y / 1.6) ** 2 <= 1)
    for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
      const i2 = ((gy + (40 + y) * S + b) * p.width + gx + (OX + 16 + x) * S + a) * 4;
      p.data[i2] *= 0.6; p.data[i2 + 1] *= 0.6; p.data[i2 + 2] *= 0.6;
    }
  const bs = bases[mode][i], layers: Img[] = [];
  if (v && t && nightMode && v === "D" && t === 3) layers.push(halo(bs));
  layers.push(nightMode ? night(bs.img) : bs.img);
  if (v && t) layers.push(fx(v, t, mode, i, bs));
  for (const L of layers) for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    const o = (y * F + x) * 4, a = L.d[o + 3];
    if (!a) continue;
    for (let q = 0; q < S; q++) for (let r = 0; r < S; r++) {
      const i2 = ((gy + y * S + r) * p.width + gx + x * S + q) * 4;
      for (let k = 0; k < 3; k++) p.data[i2 + k] = L.d[o + k] * (a / 255) + p.data[i2 + k] * (1 - a / 255);
    }
  }
}
{
  const S = 3, cs = F * S, lab = 44, rowsPer = 4;
  const p = newPng(lab + 8 * cs, 2 * rowsPer * cs + 30, [20, 16, 26, 255]);
  ["0", "+5", "+8", "+11"].forEach((s, n) => text(p, s, lab + n * 2 * cs + cs - 8, 6, 3, P.gold[3]));
  [false, true].forEach((nm, ni) => VARS.forEach((v, vi) => {
    const y0 = 30 + (ni * rowsPer + vi) * cs;
    text(p, v, 10, y0 + cs / 2 - 8, 4, P.gold[3]);
    [0, 1, 2, 3].forEach((t, n) => {
      cell(p, lab + n * 2 * cs, y0, S, nm, t ? v : null, t, "idle", t === 3 ? 18 : 14);
      cell(p, lab + n * 2 * cs + cs, y0, S, nm, t ? v : null, t, "strike", 6);
    });
  }));
  save("variants.png", p);
}
console.log("ok", OUT);
