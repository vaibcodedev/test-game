/**
 * Иконка десктоп-приложения (задача 116): пепельный щит с мечом и тлеющим нижним краем.
 * Рисуется процедурно в 1024×1024 (маски + поле расстояний), затем усредняется до нужных размеров.
 * Выход: desktop/build/icon.png (256×256) и desktop/build/icon.ico (16…256).
 * Запуск: npm run desktop:icon
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const S = 1024;
const C = S / 2;
const OUT = path.resolve("desktop/build");
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

type RGB = [number, number, number];

// ---------- шум ----------
function hash(x: number, y: number, seed = 0): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, seed: number, oct = 4): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, y * f, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

// ---------- утилиты ----------
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** Точное евклидово поле расстояний (Felzenszwalb): до ближайшего пикселя, где feature[i] = 1. */
function edt(feature: Uint8Array): Float32Array {
  const INF = 1e20;
  const f = new Float64Array(S * S);
  for (let i = 0; i < S * S; i++) f[i] = feature[i] ? 0 : INF;
  const line = new Float64Array(S);
  const d = new Float64Array(S);
  const v = new Int32Array(S);
  const z = new Float64Array(S + 1);
  const pass = (get: (k: number) => number, set: (k: number, val: number) => void) => {
    for (let q = 0; q < S; q++) line[q] = get(q);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < S; q++) {
      let s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (line[q] + q * q - (line[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < S; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + line[v[k]];
    }
    for (let q = 0; q < S; q++) set(q, d[q]);
  };
  for (let x = 0; x < S; x++) pass((k) => f[k * S + x], (k, val) => (f[k * S + x] = val));
  for (let y = 0; y < S; y++) pass((k) => f[y * S + k], (k, val) => (f[y * S + k] = val));
  const out = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) out[i] = Math.sqrt(f[i]);
  return out;
}

// ---------- формы (координаты u, v в [-1, 1], v вниз) ----------
const SH_A = 0.64; // полуширина щита
const SH_TOP = -0.6; // верх щита по центру
const SH_Y1 = -0.34; // конец прямых боков
const SH_R = 2 * SH_A; // радиус дуг
const SH_TIP = SH_Y1 + Math.sqrt(SH_R * SH_R - SH_A * SH_A);

function inShield(u: number, v: number): boolean {
  const top = SH_TOP + 0.07 * (u / SH_A) ** 2;
  if (v < top) return false;
  if (v <= SH_Y1) return Math.abs(u) <= SH_A;
  const l = (u - SH_A) ** 2 + (v - SH_Y1) ** 2;
  const r = (u + SH_A) ** 2 + (v - SH_Y1) ** 2;
  return l <= SH_R * SH_R && r <= SH_R * SH_R;
}

const BLADE_TOP = -0.6;
const BLADE_TIP = 0.9;
const BLADE_W = 0.068;
const bladeHalf = (v: number) => (v < BLADE_TIP - 0.24 ? BLADE_W : BLADE_W * clamp01((BLADE_TIP - v) / 0.24));
const GUARD_Y = -0.64;
const GUARD_W = 0.31;
const GUARD_H = 0.04;
const GRIP_TOP = -0.8;
const POMMEL_Y = -0.845;
const POMMEL_R = 0.062;

type SwordPart = "blade" | "guard" | "grip" | "pommel" | null;
function swordPart(u: number, v: number): SwordPart {
  const pd = Math.hypot(u, v - POMMEL_Y);
  if (pd <= POMMEL_R) return "pommel";
  // крестовина: брусок, концы чуть шире и загнуты вниз
  const gx = Math.abs(u);
  const bend = 0.025 * (gx / GUARD_W) ** 2;
  if (gx <= GUARD_W && Math.abs(v - GUARD_Y - bend) <= GUARD_H * (1 + 0.35 * (gx / GUARD_W) ** 3)) return "guard";
  if (Math.hypot(gx - GUARD_W, v - GUARD_Y - 0.025) <= GUARD_H * 1.25) return "guard";
  if (gx <= 0.036 && v >= GRIP_TOP && v <= GUARD_Y) return "grip";
  if (v >= BLADE_TOP && v <= BLADE_TIP && gx <= bladeHalf(v)) return "blade";
  return null;
}

// искры: детерминированные
const SPARKS: { u: number; v: number; r: number }[] = [];
for (let i = 0; i < 14; i++) {
  const side = i % 2 ? 1 : -1;
  const t = hash(i, 7, 3);
  const u = side * (0.3 + 0.55 * hash(i, 11, 5));
  const v = 0.05 + 0.75 * t - 0.25 * Math.abs(u);
  SPARKS.push({ u, v: Math.min(v, 0.9), r: 0.006 + 0.012 * hash(i, 13, 9) });
}

// ---------- палитра ----------
const OUTLINE = hex("#120f16");
const ASH_TOP = hex("#a49aa0");
const ASH_BOT = hex("#4a4048");
const RIM_DARK = hex("#231c26");
const RIM_LIGHT = hex("#76666e");
const STEEL_L = hex("#eef1f5");
const STEEL_D = hex("#8f9aa8");
const BRONZE = hex("#c08a34");
const BRONZE_D = hex("#6a4416");
const LEATHER = hex("#4e2c1c");
const heatRamp = (h: number): RGB => {
  const stops: [number, RGB][] = [
    [0, hex("#3a0c06")],
    [0.35, hex("#a8240e")],
    [0.6, hex("#ff5a14")],
    [0.82, hex("#ffa030")],
    [1, hex("#ffe08a")],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (h <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      return mix(ca, cb, (h - a) / (b - a));
    }
  }
  return stops[stops.length - 1][1];
};

// ---------- рендер ----------
function render(): Float32Array {
  const px = (i: number) => ((i % S) + 0.5 - C) / C;
  const py = (i: number) => (Math.floor(i / S) + 0.5 - C) / C;

  // 1) щит с обгоревшим (неровным) нижним краем
  const base = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) base[i] = inShield(px(i), py(i)) ? 1 : 0;
  const outsideBase = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) outsideBase[i] = base[i] ? 0 : 1;
  const depth0 = edt(outsideBase);
  const shield = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    if (!base[i]) continue;
    const u = px(i);
    const v = py(i);
    const burn = smooth(-0.1, 0.6, v) * (0.012 + 0.05 * fbm(u * 9 + 3, v * 9, 21, 3) ** 2) * C;
    shield[i] = depth0[i] > burn ? 1 : 0;
  }
  const notShield = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) notShield[i] = shield[i] ? 0 : 1;
  const dIn = edt(notShield); // глубина внутрь щита
  const dOut = edt(shield); // расстояние снаружи до щита

  // 2) меч и общий силуэт
  const part: SwordPart[] = new Array(S * S);
  const union = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) {
    part[i] = swordPart(px(i), py(i));
    union[i] = shield[i] || part[i] ? 1 : 0;
  }
  const dOutU = edt(union);
  const notSword = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) notSword[i] = part[i] ? 0 : 1;
  const dSword = edt(notSword);

  const rimW = 0.06 * C;
  const outlineW = 0.024 * C;
  const img = new Float32Array(S * S * 4); // премультиплицированный RGBA, 0…1
  const put = (i: number, c: RGB, a: number) => {
    // c — 0…255, композиция «поверх»
    const k = 1 - a;
    img[i * 4] = (c[0] / 255) * a + img[i * 4] * k;
    img[i * 4 + 1] = (c[1] / 255) * a + img[i * 4 + 1] * k;
    img[i * 4 + 2] = (c[2] / 255) * a + img[i * 4 + 2] * k;
    img[i * 4 + 3] = a + img[i * 4 + 3] * k;
  };

  for (let i = 0; i < S * S; i++) {
    const u = px(i);
    const v = py(i);
    const edgeHeat = smooth(-0.15, 0.62, v) * (0.55 + 0.6 * fbm(u * 6, v * 6, 5, 3));

    // внешнее свечение у тлеющего края
    if (!union[i]) {
      const glow = Math.exp(-dOut[i] / (0.06 * C)) * edgeHeat * 0.85;
      if (glow > 0.003) put(i, heatRamp(0.55 + 0.3 * glow), clamp01(glow));
      if (dOutU[i] <= outlineW) put(i, OUTLINE, clamp01(1.6 - dOutU[i] / outlineW));
    }

    if (shield[i] && !part[i]) {
      const t = clamp01((v - SH_TOP) / (SH_TIP - SH_TOP));
      const grain = 0.82 + 0.36 * fbm(u * 14, v * 14, 1, 4);
      let col: RGB;
      const d = dIn[i];
      if (d < rimW) {
        // окованный край: тёмный внешний кант, светлая фаска, тёмная линия внутрь
        const r = d / rimW;
        const bevel = Math.sin(Math.PI * clamp01((r - 0.12) / 0.7));
        col = mix(RIM_DARK, RIM_LIGHT, bevel * (1 - 0.55 * t));
        col = scale(col, 0.92 + 0.16 * fbm(u * 30, v * 30, 2, 2));
        if (r > 0.86) col = scale(col, 0.6);
      } else {
        col = scale(mix(ASH_TOP, ASH_BOT, t ** 1.2), grain);
        // лёгкий светлый блик слева сверху
        col = mix(col, hex("#cfc6c8"), 0.18 * smooth(0.5, 0, Math.hypot(u + 0.32, v + 0.42)));
        // трещины с жаром в нижней половине
        const n = fbm(u * 4.2 + 11, v * 4.2 + 5, 31, 4);
        const crack = 1 - smooth(0.0, 0.03, Math.abs(n - 0.5));
        const crackHeat = crack * smooth(0.0, 0.55, v);
        if (crackHeat > 0.01) col = mix(col, heatRamp(0.55 + 0.4 * crackHeat), clamp01(crackHeat * 1.2));
        // обугленный низ
        col = mix(col, hex("#2a1a18"), 0.45 * smooth(0.25, 0.75, v));
      }
      // тень от меча
      if (swordPart(u - 0.028, v - 0.03)) col = scale(col, 0.55);
      // тление вдоль края
      const ember = edgeHeat * Math.exp(-d / (0.075 * C));
      if (ember > 0.05) col = mix(col, heatRamp(clamp01(ember * 1.05)), smooth(0.05, 0.6, ember));
      put(i, col, 1);
    }

    const p = part[i];
    if (p) {
      let col: RGB;
      if (p === "blade") {
        const hw = Math.max(bladeHalf(v), 1e-4);
        const s = u / hw; // -1…1 поперёк клинка
        col = s < 0 ? mix(STEEL_L, hex("#c9d0d9"), -s) : mix(hex("#b3bcc7"), STEEL_D, s);
        if (Math.abs(s) < 0.12) col = mix(col, hex("#ffffff"), 0.35); // ребро
        // отблеск жара на нижней части клинка
        col = mix(col, hex("#ff8a3a"), 0.5 * smooth(0.35, 0.95, v));
      } else if (p === "guard") {
        const k = clamp01((v - (GUARD_Y - GUARD_H)) / (2 * GUARD_H));
        col = mix(hex("#f0c050"), BRONZE_D, k);
        col = mix(col, BRONZE, 0.35);
      } else if (p === "grip") {
        const band = (((v * 46 + u * 18) % 1) + 1) % 1;
        col = scale(LEATHER, band < 0.5 ? 1.15 : 0.7);
        if (u < -0.012) col = scale(col, 1.2);
      } else {
        const hl = Math.hypot(u + 0.022, v - POMMEL_Y + 0.022) / POMMEL_R;
        col = mix(hex("#ffe08a"), BRONZE_D, clamp01(hl));
      }
      // тёмный кант по краю деталей меча
      if (dSword[i] < 0.011 * C) col = mix(col, OUTLINE, 0.85);
      put(i, col, 1);
    }

    // искры
    for (const sp of SPARKS) {
      const dd = Math.hypot(u - sp.u, v - sp.v);
      if (dd > sp.r * 4) continue;
      if (dd <= sp.r) put(i, heatRamp(0.92), 1);
      else put(i, heatRamp(0.7), clamp01(0.55 * (1 - (dd - sp.r) / (sp.r * 3))));
    }
  }
  return img;
}

/** Усреднение блоками (площадное уменьшение) премультиплицированного RGBA и перевод в 8 бит. */
function downsample(img: Float32Array, size: number): Buffer {
  const k = S / size; // для 24 и 48 — нецелое: блоки по 42–43 и 21–22 пикселя
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * k);
    const y1 = Math.floor((y + 1) * k);
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * k);
      const x1 = Math.floor((x + 1) * k);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * S + xx) * 4;
          r += img[i];
          g += img[i + 1];
          b += img[i + 2];
          a += img[i + 3];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      a /= n;
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(clamp01(r / n / a) * 255);
        out[o + 1] = Math.round(clamp01(g / n / a) * 255);
        out[o + 2] = Math.round(clamp01(b / n / a) * 255);
      }
      out[o + 3] = Math.round(clamp01(a) * 255);
    }
  }
  return out;
}

function pngOf(rgba: Buffer, size: number): Buffer {
  const png = new PNG({ width: size, height: size });
  rgba.copy(png.data);
  return PNG.sync.write(png);
}

/** Запись ICO для размеров < 256 — 32-битный BMP (DIB) с маской, 256 — PNG (так делают стандартные редакторы иконок). */
function dibOf(rgba: Buffer, size: number): Buffer {
  const maskRow = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(size * size * 4 + maskRow * size, 20);
  const pixels = Buffer.alloc(size * size * 4);
  const mask = Buffer.alloc(maskRow * size);
  for (let y = 0; y < size; y++) {
    const row = size - 1 - y; // снизу вверх
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4;
      const d = (row * size + x) * 4;
      pixels[d] = rgba[s + 2];
      pixels[d + 1] = rgba[s + 1];
      pixels[d + 2] = rgba[s];
      pixels[d + 3] = rgba[s + 3];
      if (rgba[s + 3] === 0) mask[row * maskRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return Buffer.concat([header, pixels, mask]);
}

function icoOf(images: { size: number; data: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((im, n) => {
    const e = 6 + n * 16;
    head.writeUInt8(im.size >= 256 ? 0 : im.size, e);
    head.writeUInt8(im.size >= 256 ? 0 : im.size, e + 1);
    head.writeUInt8(0, e + 2);
    head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(im.data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += im.data.length;
  });
  return Buffer.concat([head, ...images.map((im) => im.data)]);
}

const t0 = Date.now();
const img = render();
fs.mkdirSync(OUT, { recursive: true });
const png256 = pngOf(downsample(img, 256), 256);
fs.writeFileSync(path.join(OUT, "icon.png"), png256);
const ico = icoOf(
  ICO_SIZES.map((size) => {
    const rgba = downsample(img, size);
    return { size, data: size >= 256 ? pngOf(rgba, size) : dibOf(rgba, size) };
  }),
);
fs.writeFileSync(path.join(OUT, "icon.ico"), ico);
console.log(`[icon] desktop/build/icon.png (256×256, ${png256.length} Б), icon.ico (${ICO_SIZES.join(", ")}; ${ico.length} Б) за ${Date.now() - t0} мс`);
