/** Спрайты арен PvP с объёмом (вид 3/4, свет сверху слева): укрытия, ёлки, скалы, горы, палатки, шпили, вышка, костёр; масштаб и воздушная перспектива. */
import { PC, hex, mix, shade, hash01, type RGBA } from "./canvas";

export const H = (s: string) => hex(s);
export const R = (...s: string[]) => s.map(H);
const OUTL = (id: string): RGBA => (id === "ash" ? H("#0c0812") : id === "sun" ? H("#3a2e22") : id === "pit" ? H("#1c1008") : H("#0c2040"));
const tone = (r: RGBA[], t: number) => r[Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)))];

/** Уменьшение кадра усреднением (f < 1) — дальние здания меньше и мягче. */
export function scalePC(src: PC, f: number): PC {
  if (f >= 0.999) return src;
  const w = Math.max(1, Math.round(src.w * f)), h = Math.max(1, Math.round(src.h * f)), o = new PC(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let j = Math.floor(y / f); j < Math.min(src.h, Math.ceil((y + 1) / f)); j++) for (let i = Math.floor(x / f); i < Math.min(src.w, Math.ceil((x + 1) / f)); i++) { const c = src.get(i, j)!; r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]; n++; }
    if (a > 0 && a / n > 90) o.set(x, y, [r / a, g / a, b / a, Math.min(255, (a / n) * 1.3)]);
  }
  return o;
}
/** Воздушная перспектива: бледнее и холоднее к горизонту (k 0..1 — доля тумана цвета fog). */
export function haze(src: PC, fog: RGBA, k: number): PC {
  const o = src.clone();
  o.map((c) => mix(c, fog, k) as RGBA);
  return o;
}
export function flipX(src: PC): PC { const o = new PC(src.w, src.h); o.blit(src, 0, 0, true); return o; }
/** Снег на верхней части кадра (кровли): белеет верх, остальное нетронуто. */
export function snowTop(src: PC, frac: number): PC {
  const o = src.clone();
  o.map((c, x, y) => (y < src.h * frac && c[3] > 200 ? mix(c, [244, 250, 255, 255], 0.5 + 0.3 * Math.max(0, 1 - y / (src.h * frac))) as RGBA : c));
  return o;
}

/** Куб: лицевая грань, верхняя (светлая) и правая боковая (в тени). d — глубина (px вправо-вверх). */
export function box3d(pc: PC, x: number, y: number, w: number, h: number, d: number, top: RGBA, front: RGBA, side: RGBA, seed = 1) {
  const dy = Math.round(d * 0.6);
  pc.poly([[x, y], [x + w, y], [x + w + d, y - dy], [x + d, y - dy]], top);
  pc.poly([[x + w, y], [x + w + d, y - dy], [x + w + d, y + h - dy], [x + w, y + h]], side);
  pc.rect(x, y, w, h, front);
  pc.rect(x, y, w, 1, shade(top, 0.95)); // лицевая кромка
  pc.rect(x, y + h - 2, w, 2, shade(front, 0.72)); // тень у основания
  for (let i = 0; i < 3; i++) { const cx = x + 2 + Math.floor(hash01(i, seed, 4) * (w - 6)), cyy = y + 3 + Math.floor(hash01(i, seed, 5) * (h - 7)); pc.rect(cx, cyy, 3, 1, shade(front, 0.78)); pc.set(cx + 3, cyy + 1, shade(front, 1.18)); }
}
/** Цилиндр: четыре тона по нормали (свет слева), рефлекс справа, каннелюры и швы барабанов, сколы. */
export function cylinder(pc: PC, x0: number, w: number, y0: number, y1: number, ramp: RGBA[], flute: number, seed: number, seams = 0) {
  for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) {
    const u = ((x + 0.5) / w) * 2 - 1, nz = Math.sqrt(Math.max(0, 1 - u * u)), lum = -0.55 * u + 0.8 * nz;
    let t = lum > 0.78 ? 3 : lum > 0.42 ? 2 : lum > 0.08 ? 1 : 0;
    if (u > 0.72) t = Math.max(t, 1); // рефлекс
    let c = ramp[t];
    if (flute && Math.floor(((u + 1) * w) / flute) % 2 === 0 && Math.abs(u) < 0.92) c = shade(c, 0.9);
    if (seams && (y - y0) % seams === 0) c = shade(c, 0.72);
    pc.set(x0 + x, y, c);
  }
  for (let i = 0; i < 4; i++) { const cx = x0 + 1 + Math.floor(hash01(i, seed, 8) * (w - 4)), cy = y0 + 4 + Math.floor(hash01(i, seed, 9) * (y1 - y0 - 8)); pc.rect(cx, cy, 2, 1, shade(ramp[0], 0.8)); pc.set(cx + 2, cy + 1, ramp[3]); }
}
const topFace = (pc: PC, cx: number, cy: number, rx: number, ry: number, hi: RGBA, lo: RGBA) => { pc.ellipse(cx, cy, rx, ry, lo); pc.ellipse(cx - 1, cy - 0.5, rx - 1.5, ry - 0.9, hi); };

/** Укрытие: объёмный спрайт, тень на песок по направлению света (вправо-вниз), контур. Низ кадра = основание + 4 px. */
export function coverSprite(id: string, variant: "a" | "b"): PC {
  const W = 72, Hh = 92, bx = 24, base = Hh - 5, cxm = bx + 11, d = new PC(W, Hh);
  if (id === "ash") {
    const st = R("#15101e", "#2c2440", "#54467a", "#9a88c8");
    if (variant === "a") {
      box3d(d, bx - 3, base - 7, 28, 7, 5, st[3], st[2], st[1], 1); // плинт
      d.ellipse(cxm, base - 8, 12, 3, st[1]); // база: валик
      cylinder(d, bx, 22, 22, base - 8, st, 5, 3, 13);
      box3d(d, bx - 4, 14, 30, 8, 5, st[3], st[2], st[1], 2); // капитель шире ствола
      d.rect(bx - 4, 21, 30, 1, st[0]);
      d.rect(bx, 28, 22, 2, H("#a8262c")); d.rect(bx, 54, 22, 2, H("#a8262c"));
      for (const [rx, ry] of [[bx + 6, 36], [bx + 12, 44], [bx + 8, 62]]) { d.rect(rx, ry, 1, 4, H("#ff6a30")); d.set(rx, ry - 1, H("#ffd08a")); d.set(rx + 1, ry + 2, H("#ff6a30")); }
    } else {
      box3d(d, bx - 3, base - 7, 28, 7, 5, st[3], st[2], st[1], 3);
      cylinder(d, bx, 22, 42, base - 7, st, 5, 5, 13);
      for (let x = 0; x < 22; x++) { const j = 36 + Math.floor(hash01(x, 2, 9) * 9) - (x > 14 ? 4 : 0); for (let y = j; y < 42; y++) { const u = ((x + 0.5) / 22) * 2 - 1, lum = -0.55 * u + 0.8 * Math.sqrt(Math.max(0, 1 - u * u)); d.set(bx + x, y, st[lum > 0.78 ? 3 : lum > 0.42 ? 2 : lum > 0.08 ? 1 : 0]); } }
      d.poly([[bx, 38], [bx + 22, 36], [bx + 19, 32], [bx + 10, 35], [bx + 3, 33]], st[3]); // скол — светлая грань
      d.rect(bx, 56, 22, 2, H("#a8262c")); d.rect(bx + 8, 66, 1, 4, H("#ff6a30"));
      box3d(d, bx + 25, base - 5, 7, 5, 2, st[3], st[2], st[1], 7); box3d(d, bx - 10, base - 4, 6, 4, 2, st[3], st[2], st[1], 8);
    }
  } else if (id === "sun") {
    const st = R("#8d8d9c", "#bcb8ae", "#e4ded0", "#fffaf0"), gold = H("#e0b64a");
    if (variant === "a") {
      box3d(d, bx - 3, base - 7, 28, 7, 5, st[3], st[2], st[1], 4);
      d.rect(bx - 2, base - 9, 26, 2, gold);
      d.ellipse(cxm, base - 11, 12, 3, st[2]);
      cylinder(d, bx, 22, 24, base - 11, st, 5, 6, 0);
      d.rect(bx, 26, 22, 1, st[0]);
      box3d(d, bx - 4, 15, 30, 8, 5, st[3], st[2], st[1], 5); d.rect(bx - 4, 19, 30, 1, gold);
      d.ellipse(bx - 5, 18, 3, 3, st[2]); d.ellipse(bx + 27, 18, 3, 3, st[1]); d.ellipse(bx - 5, 18, 1, 1, gold); d.ellipse(bx + 27, 18, 1, 1, gold); // завитки капители
    } else { // обломок статуи на постаменте
      box3d(d, bx - 5, base - 20, 34, 20, 6, st[3], st[2], st[1], 9); d.rect(bx - 5, base - 9, 34, 2, gold); d.rect(bx - 5, base - 20, 34, 1, gold);
      cylinder(d, bx + 2, 18, 34, base - 20, st, 0, 7, 0); // торс
      d.poly([[bx + 2, 34], [bx + 20, 34], [bx + 18, 24], [bx + 12, 20], [bx + 5, 26]], st[3]); // скол плеча
      d.rect(bx + 20, 36, 8, 4, st[2]); d.rect(bx + 24, 40, 4, 8, st[1]); // рука
      box3d(d, bx - 12, base - 5, 8, 5, 2, st[3], st[2], st[1], 10);
    }
  } else if (id === "pit") {
    const top = H("#d4b88a"), fr = H("#a8895e"), sd = H("#6e5238");
    if (variant === "a") {
      box3d(d, bx - 2, base - 20, 30, 20, 7, top, fr, sd, 11);
      box3d(d, bx + 3, base - 40, 21, 20, 6, top, fr, sd, 12);
      d.rect(bx + 12, base - 50, 3, 12, H("#6b4a2c")); d.rect(bx + 12, base - 50, 1, 12, H("#a07a48")); // кол
      d.rect(bx + 2, base - 28, 24, 1, H("#d8d0b8")); d.rect(bx + 2, base - 27, 24, 1, H("#6a5a3a")); // верёвка
    } else {
      box3d(d, bx - 2, base - 18, 30, 18, 7, top, fr, sd, 13);
      box3d(d, bx + 7, base - 34, 17, 16, 6, top, fr, sd, 14);
      d.rect(bx + 6, base - 46, 9, 9, H("#e0d4b8")); d.rect(bx + 6, base - 46, 9, 1, H("#fff6dc")); d.rect(bx + 7, base - 43, 2, 2, H("#1a1410")); d.rect(bx + 12, base - 43, 2, 2, H("#1a1410")); d.rect(bx + 8, base - 38, 5, 1, H("#bfb394")); // череп на глыбе
    }
  } else {
    // ледяной столб: шестигранник — три грани (блик слева, середина, тень справа), прозрачный, с гранёной верхушкой и свечением
    const ic = R("#14407a", "#2a72b8", "#62b4ec", "#b4ecff", "#ffffff"), A = 214;
    const prism = (cx: number, w: number, top: number, b: number, jag: number) => {
      for (let y = top; y < b; y++) for (let x = 0; x < w; x++) {
        const t = x / (w - 1);
        if (y < top + 8 && hash01(x, y, jag) < 0.25 * (1 - (y - top) / 8)) continue;
        let c = t < 0.34 ? ic[3] : t < 0.68 ? ic[2] : ic[1];
        if (y > b - 4) c = shade(c, 0.78);
        if ((y - top) % 9 === 0 && y > top + 6) c = mix(c, ic[4], 0.35);
        d.set(cx - w / 2 + x, y, [c[0], c[1], c[2], A]);
      }
      d.rect(cx - w / 2 + 1, top + 4, 1, b - top - 9, ic[4]); // блик
      d.poly([[cx - w / 2, top + 5], [cx - 1, top - 1], [cx + w / 2 - 1, top + 4], [cx + 2, top + 9]], [ic[4][0], ic[4][1], ic[4][2], 235]); // верхняя грань
    };
    if (variant === "a") { prism(cxm, 18, 20, base, 3); prism(cxm - 12, 9, 40, base - 1, 5); prism(cxm + 13, 8, 48, base - 1, 7); }
    else { prism(cxm, 16, 36, base, 4); prism(cxm - 11, 9, 50, base - 1, 6); prism(cxm + 12, 11, 30, base - 1, 8); }
    d.ellipse(cxm, base - 1, 15, 3, [140, 220, 255, 70]); // отсвет на льду
  }
  const o = new PC(W, Hh);
  o.blit(d, 0, 0);
  o.outline(OUTL(id), true);
  const out = new PC(W, Hh), L = 30;
  out.poly([[bx - 4, base - 1], [bx + 26, base - 1], [bx + 26 + L, base + 5], [bx - 4 + L, base + 5]], [0, 0, 0, 78]);
  out.ellipse(cxm + 2, base + 1, 16, 3.5, [0, 0, 0, 95]);
  out.blit(o, 0, 0);
  return out;
}

// ---------- панорама: природа с объёмом ----------
const groundShadow = (pc: PC, cx: number, y: number, rx: number, ry: number) => pc.ellipse(cx, y, rx, ry, [0, 0, 0, 70]);
/** Ель: ярусы-конусы, левая сторона свет, правая тень, рваный нижний край, тень на землю вправо. */
export function pine(h: number, snow: boolean, dark: RGBA[], seed: number): PC {
  const w = Math.round(h * 0.6) + 10, pc = new PC(w, h + 6), n = Math.max(3, Math.floor(h / 8)), cx = w / 2 - 3;
  groundShadow(pc, cx + 6, h + 2, w * 0.35, 2.4);
  pc.rect(cx - 1, h - 6, 3, 7, H("#4a2c16")); pc.rect(cx - 1, h - 6, 1, 7, H("#7a5030"));
  for (let l = n - 1; l >= 0; l--) {
    const y0 = Math.round((l / n) * (h - 8)), lh = Math.round((h - 8) / n) + 7, lw = Math.round(4 + (l + 1) * ((w - 14) / n));
    for (let y = 0; y < lh; y++) {
      const ww = Math.max(1, Math.round((y / lh) * lw)) + (y > lh - 3 && hash01(y, l, seed) > 0.5 ? 1 : 0);
      for (let x = 0; x < ww; x++) {
        const t = x / Math.max(1, ww - 1);
        let c = t < 0.28 ? dark[3] : t < 0.62 ? dark[2] : t < 0.88 ? dark[1] : dark[0];
        if (y > lh - 3) c = shade(c, 0.7);
        if (hash01(x + l * 3, y, seed) < 0.12) c = shade(c, 1.15);
        const px = cx - ww / 2 + x;
        pc.set(px, y0 + y, c);
        if (snow && y < 3 + (t < 0.5 ? 1 : 0) && hash01(x, y + l, seed + 1) > 0.15) pc.set(px, y0 + y, t < 0.6 ? [250, 253, 255, 255] : [206, 222, 240, 255]);
      }
    }
  }
  pc.outline(shade(dark[0], 0.4), false);
  return pc;
}
export function cypress(h: number, dark: RGBA[]): PC {
  const w = 12, pc = new PC(w + 8, h + 3);
  groundShadow(pc, w / 2 + 6, h + 1, 6, 2);
  for (let y = 0; y < h - 3; y++) {
    const t = y / (h - 3), ww = Math.max(2, Math.round(Math.sin(Math.min(1, t * 1.1 + 0.08) * Math.PI * 0.9) * w));
    for (let x = 0; x < ww; x++) { const u = x / Math.max(1, ww - 1); pc.set(1 + (w - ww) / 2 + x, y, u < 0.3 ? dark[3] : u < 0.62 ? dark[2] : u < 0.85 ? dark[1] : dark[0]); }
  }
  pc.rect(w / 2 + 0, h - 3, 3, 4, H("#4a2c16"));
  pc.outline(shade(dark[0], 0.4), false);
  return pc;
}
/** Гора: две стороны (освещённая и теневая) по гребню, снежная шапка с рваным краем и тенями складок. */
export function mountain(w: number, h: number, body: RGBA[], snow: boolean, seed: number): PC {
  const pc = new PC(w, h), ap = Math.round(w * (0.4 + hash01(seed, 1, 1) * 0.2));
  for (let y = 0; y < h; y++) {
    const t = y / h, lx = Math.round(ap - t * ap * (1 + 0.15 * Math.sin(y * 0.6 + seed))), rx = Math.round(ap + t * (w - ap) * (1 + 0.12 * Math.sin(y * 0.5 + seed * 2)));
    for (let x = lx; x <= rx; x++) {
      const ridge = ap + (hash01(Math.floor(y / 3), seed, 2) - 0.5) * 8 * t, lit = x < ridge;
      let c = lit ? body[Math.min(3, 2 + (hash01(x >> 1, y >> 1, seed) > 0.7 ? 1 : 0))] : body[Math.min(1, hash01(x >> 1, y >> 1, seed + 3) > 0.7 ? 1 : 0)];
      if (!lit && ((x - ridge) / (rx - ridge + 1)) > 0.55) c = shade(c, 0.82);
      if (lit && (x + y * 2 + seed) % 11 === 0) c = shade(c, 0.86); // складки склона
      if (snow && t < 0.3 + 0.12 * Math.sin(x * 0.35 + seed) + (hash01(x, y, seed) - 0.5) * 0.08) c = lit ? [250, 253, 255, 255] : [188, 206, 232, 255];
      pc.set(x, y, c);
    }
  }
  return pc;
}
/** Скала: гранёная, верхняя грань светлая, левая средняя, правая тёмная; трещины; снег; тень. */
export function rock(w: number, h: number, body: RGBA[], snow: boolean, seed: number): PC {
  const pc = new PC(w + 10, h + 6);
  groundShadow(pc, w / 2 + 6, h + 2, w * 0.55, 2.6);
  const pts: [number, number][] = [[1, h], [2, h * 0.5], [w * 0.28, 3], [w * 0.62, 1], [w - 1, h * 0.45], [w, h]];
  pc.poly(pts, (x, y) => (y < h * 0.34 ? body[3] : x < w * 0.46 ? body[2] : x < w * 0.8 ? body[1] : body[0]));
  pc.poly([[w * 0.28, 3], [w * 0.62, 1], [w * 0.74, h * 0.36], [w * 0.4, h * 0.42], [w * 0.16, h * 0.34]], body[3]);
  for (let i = 0; i < 2; i++) pc.line(w * (0.3 + i * 0.25), h * 0.45, w * (0.36 + i * 0.22), h * 0.9, shade(body[0], 0.7));
  if (snow) pc.poly([[w * 0.16, h * 0.34], [w * 0.28, 3], [w * 0.62, 1], [w * 0.76, h * 0.36], [w * 0.55, h * 0.3], [w * 0.42, h * 0.44], [w * 0.3, h * 0.36]], [250, 253, 255, 255]);
  pc.rect(1, h - 1, w, 2, shade(body[0], 0.7));
  pc.outline(shade(body[0], 0.45), false);
  void seed;
  return pc;
}
/** Палатка: две плоскости (свет/тень), полосы, провисшие складки, вход, колышки и тень. */
export function tent(w: number, h: number, c1: RGBA, c2: RGBA): PC {
  const pc = new PC(w + 14, h + 6), cx = (w + 2) / 2;
  groundShadow(pc, cx + 8, h + 2, w * 0.6, 2.8);
  for (let y = 0; y < h; y++) {
    const t = y / h, half = 1 + t * (w / 2 - 1) + (y > h - 4 ? 0 : Math.sin(y * 0.9) * 0.4);
    for (let x = -Math.ceil(half); x <= Math.ceil(half); x++) {
      if (Math.abs(x) > half) continue;
      const left = x < 0, stripe = Math.floor((x + w) / 3) % 2 === 0;
      let c = stripe ? c1 : c2;
      c = left ? shade(c, 1.1) : shade(c, 0.66);
      if (left && Math.abs(x) > half - 1.2) c = shade(c, 0.85);
      if (y > 3 && (x + 3 * y) % 9 === 0) c = shade(c, 0.88); // складка
      pc.set(cx + x, y + 1, c);
    }
  }
  pc.poly([[cx - 1, h - 9], [cx + 3, h - 9], [cx + 5, h + 1], [cx - 3, h + 1]], H("#1a1008")); // вход
  pc.rect(cx, 0, 1, 3, H("#3a2a18")); pc.rect(cx + 1, 0, 4, 2, c1); // флажок
  for (const dx of [-w / 2 - 3, w / 2 + 3]) pc.rect(cx + dx, h, 1, 3, H("#3a2a18"));
  pc.outline(H("#14100a"), false);
  return pc;
}
export function logPost(h: number, seed: number): PC {
  const pc = new PC(7, h + 3);
  pc.ellipse(4, h + 2, 3, 1, [0, 0, 0, 70]);
  for (let y = 3; y < h; y++) for (let x = 0; x < 5; x++) pc.set(x, y + 1, x < 1 ? H("#c8965a") : x < 3 ? H("#9a6a3a") : x < 4 ? H("#6a4226") : H("#3e2414"));
  for (let y = 0; y < 4; y++) { const ww = 1 + y; for (let x = 0; x < ww; x++) pc.set(2 - Math.floor(ww / 2) + x, y, x < ww / 2 ? H("#c8965a") : H("#6a4226")); }
  pc.rect(0, 3 + Math.floor(hash01(seed, 1, 1) * 4), 5, 1, H("#2e1a0c"));
  pc.outline(H("#1c1008"), false);
  return pc;
}
export function watchtower(): PC {
  const pc = new PC(40, 62), w1 = H("#a8743e"), w2 = H("#6a4226"), w3 = H("#3e2414");
  pc.ellipse(22, 58, 16, 3, [0, 0, 0, 80]);
  for (const x of [4, 24]) { pc.rect(x, 26, 4, 32, w2); pc.rect(x, 26, 1, 32, w1); pc.rect(x + 3, 26, 1, 32, w3); }
  pc.line(8, 52, 24, 30, w3); pc.line(24, 52, 8, 30, w3);
  box3d(pc, 0, 20, 32, 6, 6, w1, w2, w3, 3);
  box3d(pc, 3, 9, 26, 11, 5, shade(w1, 1.1), shade(w2, 1.15), w3, 4);
  pc.rect(6, 12, 7, 6, H("#14100a")); pc.rect(20, 12, 7, 6, H("#14100a")); pc.rect(6, 12, 7, 1, H("#e8a23a"));
  pc.poly([[0, 10], [16, 0], [34, 10], [36, 8], [18, -2]].map(([x, y]) => [x, Math.max(0, y)] as [number, number]), H("#8a4a2a"));
  pc.poly([[0, 10], [16, 1], [16, 10]], H("#a8602e")); pc.poly([[16, 1], [34, 10], [16, 10]], H("#6a3a22"));
  pc.rect(16, 0, 1, 3, H("#c8402a"));
  pc.outline(H("#1c1008"), false);
  return pc;
}
/** Ледяной шпиль: три грани, блик, прозрачность, тень. */
export function spire(h: number, c: RGBA[]): PC {
  const pc = new PC(18, h + 4);
  pc.ellipse(10, h + 1, 7, 2, [0, 0, 0, 60]);
  pc.poly([[1, h], [3, h * 0.55], [8, 0], [12, h * 0.6], [15, h]], (x) => ([c[3][0], c[3][1], c[3][2], 225] as RGBA).map((v, i) => (x < 7 ? v : x < 11 ? (i < 3 ? c[2][i] : 225) : (i < 3 ? c[1][i] : 225))) as RGBA);
  pc.rect(8, 3, 1, h - 7, [255, 255, 255, 170]);
  pc.poly([[8, 0], [12, h * 0.6], [8, h * 0.3]], [c[0][0], c[0][1], c[0][2], 200]);
  pc.outline(shade(c[0], 0.5), false);
  return pc;
}
export function campfire(): PC {
  const pc = new PC(16, 18);
  pc.ellipse(8, 15, 7, 2, [0, 0, 0, 70]);
  pc.rect(2, 12, 12, 3, H("#5a3820")); pc.rect(2, 12, 12, 1, H("#8a5a30")); pc.rect(4, 14, 9, 1, H("#2a1608"));
  for (let i = 0; i < 6; i++) pc.rect(2 + i * 2, 15, 2, 1, i % 2 ? H("#8a8478") : H("#5a5650")); // камни
  const fl = [H("#a8200e"), H("#e8501a"), H("#f8a030"), H("#fff0a0")];
  for (let y = 0; y < 10; y++) { const w = Math.max(1, Math.round(6 - y * 0.55)); for (let x = 0; x < w; x++) pc.set(8 - Math.floor(w / 2) + x, 12 - y, fl[Math.min(3, Math.floor((1 - y / 10) * 3 + (x === Math.floor(w / 2) ? 1 : 0)))]); }
  return pc;
}
export { mix };

/** Ворота арены 92×80: стена переходит в портал — глубокая арка с откосами, замковым камнем, поднятой наполовину решёткой, факелами и гербом.
 * Опора — низ середины; проём по центру. ash — тёмный камень и красные стяги, sun — мрамор и золото, pit — брёвна и частокол, frost — ледяная арка. */
export function gateSprite(id: string, wings = true): PC {
  const W = 92, Hh = 80, cx = W / 2, base = Hh - 8, ay = 46, rr = 16, T = 10;
  const pc = new PC(W, Hh);
  const pal: Record<string, { st: RGBA[]; bar: RGBA[]; deep: RGBA; accent: RGBA; trim: RGBA }> = {
    ash: { st: R("#12101a", "#24202e", "#3c364a", "#5e546e", "#8a7c9c"), bar: R("#14121a", "#34323e", "#5e5c6c", "#9a98aa"), deep: H("#08040a"), accent: H("#a8262c"), trim: H("#e8a23a") },
    sun: { st: R("#8a8a9a", "#b4b0a6", "#d8d2c4", "#f2ecdc", "#ffffff"), bar: R("#5a3c10", "#9a6c20", "#dcb044", "#fff0a0"), deep: H("#14121c"), accent: H("#2f5fb0"), trim: H("#e0b64a") },
    pit: { st: R("#2a160a", "#4a2a14", "#6e4224", "#946034", "#b8844c"), bar: R("#2a1608", "#4a2c14", "#7a4e28", "#b8844c"), deep: H("#0a0604"), accent: H("#c8402a"), trim: H("#e8a23a") },
    frost: { st: R("#16427c", "#2a72b8", "#62b4ec", "#b4ecff", "#ffffff"), bar: R("#2a6aa8", "#62b4ec", "#b4ecff", "#ffffff"), deep: H("#06122a"), accent: H("#3a8ad8"), trim: H("#9ae0ff") },
  };
  const P = pal[id], st = P.st, wood = id === "pit";
  const blockTone = (x: number, y: number, edgeL: boolean, edgeR: boolean) => {
    const course = wood ? 5 : 6, row = Math.floor(y / course), off = (row % 2) * (wood ? 14 : 7), col = Math.floor((x + off) / (wood ? 30 : 14));
    let t = 2 + (hash01(col, row, id.length * 7) - 0.5) * 1.4;
    if (y % course === 0) t -= 1.1; else if (y % course === 1) t += 0.5;
    if (!wood && (x + off) % 14 === 0) t -= 1.1;
    if (wood && (x + off) % 30 < 2) t -= 0.9;
    if (edgeL) t += 0.9;
    if (edgeR) t -= 0.8;
    return st[Math.max(0, Math.min(4, Math.round(t)))];
  };
  const inOpening = (x: number, y: number, grow = 0) => {
    const dx = Math.abs(x + 0.5 - cx), r = rr + grow;
    if (wood) return dx <= r && y >= 28 - grow && y < base - 1;
    if (y >= ay) return dx <= r && y < base - 1;
    return dx * dx + (ay - y) * (ay - y) <= r * r;
  };
  // стена по бокам (продолжение кольца): кромка, лицевая грань, тень под ней
  if (wings) for (const [x0, x1] of [[0, cx - 28], [cx + 28, W]] as const) {
    for (let y = 36; y < base; y++) for (let x = x0; x < x1; x++) pc.set(x, y, blockTone(x, y, false, false));
    box3d(pc, x0, 30, x1 - x0, 5, 4, st[4], st[3], st[2], 3);
    for (let x = x0; x < x1; x++) pc.set(x, 36, st[1]);
  }
  // массив портала
  const m0 = cx - 28, m1 = cx + 28;
  for (let y = T; y < base; y++) for (let x = m0; x < m1; x++) pc.set(x, y, blockTone(x, y, x < m0 + 3, x > m1 - 4));
  // карниз и зубцы над порталом
  for (let x = m0 - 2; x < m1 + 2; x++) { pc.set(x, T - 3, st[4]); pc.set(x, T - 2, st[4]); pc.set(x, T - 1, st[3]); pc.set(x, T, st[2]); pc.set(x, T + 1, st[1]); pc.set(x, T + 2, shade(st[0], 0.9)); }
  if (!wood) for (let x = m0; x < m1; x += 8) { pc.rect(x, T - 7, 5, 4, st[3]); pc.rect(x, T - 7, 5, 1, st[4]); pc.rect(x + 4, T - 6, 1, 3, st[1]); }
  if (wood) {
    // бревенчатые столбы по бокам с заострёнными вершинами, перемычка с раскосами
    for (const px of [m0 - 2, m1 - 4]) {
      pc.rect(px, 3, 7, base - 3, H("#5a3820")); pc.rect(px, 3, 2, base - 3, H("#b8844c")); pc.rect(px + 5, 3, 2, base - 3, H("#2e1a0c"));
      for (let k = 0; k < 3; k++) pc.rect(px + k, 2 - k, 7 - k * 2, 1, H("#c8965a"));
      for (let y = 9; y < base; y += 9) pc.rect(px, y, 7, 1, H("#2e1a0c"));
    }
    pc.rect(cx - 21, 20, 42, 8, H("#6e4224")); pc.rect(cx - 21, 20, 42, 2, H("#b8844c")); pc.rect(cx - 21, 27, 42, 1, H("#2e1a0c"));
    pc.line(cx - 21, 28, cx - 14, 21, H("#4a2a14")); pc.line(cx + 21, 28, cx + 14, 21, H("#4a2a14"));
  }
  // проём: откосы и глубина
  for (let y = 0; y < base; y++) for (let x = m0; x < m1; x++) {
    if (!inOpening(x, y)) continue;
    const dx = x + 0.5 - cx, dep = Math.max(0, Math.min(1, (y - (ay - rr)) / (base - ay + rr)));
    let c: RGBA = mix(P.deep, st[0], dep * 0.45) as RGBA;
    if (id === "frost") c = mix(c, H("#2a6aa8"), 0.25 * dep) as RGBA;
    let edgeD = 99;
    for (let g = 1; g <= 6; g++) if (!inOpening(x, y, -g)) { edgeD = g; break; }
    if (edgeD <= 6) c = dx < 0 ? mix(c, st[2], 0.55 * (1 - edgeD / 7)) as RGBA : mix(c, st[0], 0.8) as RGBA; // левый откос светлее, правый в тени
    if (y < ay && edgeD <= 4 && !wood) c = mix(c, st[1], 0.7) as RGBA; // интрадос свода
    pc.set(x, y, c);
  }
  // уходящая вглубь арка (второй план) и отсвет факелов на полу
  for (let y = ay - 10; y < base - 1; y++) for (let x = cx - 9; x <= cx + 9; x++) {
    const dx = Math.abs(x + 0.5 - cx);
    if (y === ay - 10 + Math.round((dx * dx) / 18) || (dx > 8.2 && y > ay - 6)) pc.set(x, y, mix(P.deep, st[1], 0.35) as RGBA);
  }
  for (let y = base - 14; y < base - 1; y++) for (let x = cx - rr + 2; x < cx + rr - 2; x++) { const c = pc.get(x, y)!; pc.set(x, y, mix(c, id === "frost" ? H("#6ab8f0") : H("#ff9a40"), 0.14 * ((y - (base - 14)) / 13)) as RGBA); }
  for (let x = cx - rr - 2; x < cx + rr + 2; x++) { pc.set(x, base - 1, st[3]); pc.set(x, base, st[4]); pc.set(x, base + 1, st[1]); }
  // обрамление: клинья арки с замковым камнем и косяки с чередованием камней
  if (!wood) {
    for (let y = 0; y < base; y++) for (let x = m0; x < m1; x++) {
      if (inOpening(x, y) || !inOpening(x, y, 7)) continue;
      const dx = x + 0.5 - cx;
      if (y < ay) {
        const ang = Math.atan2(ay - y, dx), seg = Math.floor(ang / (Math.PI / 9)), key = Math.abs(ang - Math.PI / 2) < 0.2;
        let t = seg % 2 ? 3 : 2;
        if (key) t = 4;
        t += dx < 0 ? 0.4 : -0.5;
        if (Math.hypot(dx, ay - y) < rr + 1.2 || Math.abs((ang / (Math.PI / 9)) % 1) < 0.06) t -= 1.4;
        pc.set(x, y, st[Math.max(0, Math.min(4, Math.round(t)))]);
      } else {
        const long = Math.floor((y - ay) / 7) % 2 === 0;
        pc.set(x, y, st[Math.max(0, (dx < 0 ? 3 : 1) - ((y - ay) % 7 === 0 ? 1 : 0))]);
        void long;
      }
    }
    pc.rect(cx - 4, ay - rr - 9, 9, 8, st[4]); pc.rect(cx + 2, ay - rr - 9, 3, 8, st[2]); pc.rect(cx - 4, ay - rr - 2, 9, 1, st[1]); // замковый камень
  }
  // решётка-порткуллис, поднята наполовину: прутья с гранями, связи, острия, тень на проходе
  const yb = wood ? 48 : ay + 3;
  for (let y = ay - rr - 1; y < yb; y++) for (let x = cx - rr; x <= cx + rr; x++) {
    if (!inOpening(x, y, -1)) continue;
    const rel = x - (cx - rr + 3);
    if (wood) { if (rel >= 0 && rel % 6 < 4) pc.set(x, y, rel % 6 === 0 ? H("#b8844c") : rel % 6 === 3 ? H("#2e1a0c") : H("#7a4e28")); continue; }
    if (rel >= 0 && rel % 5 < 2) pc.set(x, y, P.bar[rel % 5 === 0 ? 3 : 1]);
    if ((y === ay - 5 || y === yb - 8) && x > cx - rr + 1 && x < cx + rr - 1) pc.set(x, y, P.bar[2]);
  }
  for (let x = cx - rr + 3; x < cx + rr - 1; x += wood ? 6 : 5) for (let k = 0; k < 5; k++) { const wdt = wood ? 4 - Math.floor(k * 0.8) : 2 - (k > 2 ? 1 : 0); if (inOpening(x, yb + k, -1)) pc.rect(x, yb + k, Math.max(1, wdt), 1, P.bar[k < 2 ? 3 : 2]); }
  for (let y = yb + 5; y < yb + 12; y++) for (let x = cx - rr + 2; x < cx + rr - 2; x++) if (inOpening(x, y, -1)) pc.set(x, y, shade(pc.get(x, y)!, 0.6));
  if (id === "frost") for (let x = cx - rr + 3; x < cx + rr - 3; x += 4) { const len = 3 + Math.floor(hash01(x, 3, 3) * 5); for (let k = 0; k < len; k++) pc.set(x, ay - rr + 3 + k, k < 2 ? [226, 246, 255, 235] : [150, 214, 250, 220]); }
  // факелы по бокам
  for (const tx of [cx - 25, cx + 24]) {
    pc.rect(tx, ay - 8, 2, 11, H("#2a1c10")); pc.rect(tx - 1, ay - 9, 4, 2, H("#3a3440")); pc.set(tx - 1, ay - 8, H("#6a6478"));
    const fl = id === "frost" ? [H("#2a5ab0"), H("#4aa0e8"), H("#a0e0ff"), H("#f0ffff")] : [H("#a8200e"), H("#e8501a"), H("#f8a030"), H("#fff0a0")];
    for (let y = 0; y < 7; y++) { const w = Math.max(1, 4 - Math.floor(y * 0.6)); for (let x = 0; x < w; x++) pc.set(tx + 1 - Math.floor(w / 2) + x, ay - 10 - y, fl[Math.min(3, Math.floor((1 - y / 7) * 3 + (x === Math.floor(w / 2) ? 1 : 0)))]); }
  }
  // герб / стяги над аркой
  const ey = wood ? 8 : T + 6;
  const hang = (bx: number, len: number, col: RGBA) => { pc.rect(bx, T + 4, 7, len, col); pc.rect(bx, T + 4, 2, len, shade(col, 1.25)); pc.rect(bx + 5, T + 4, 2, len, shade(col, 0.6)); for (let k = 0; k < 4; k++) pc.rect(bx + k * 2, T + 4 + len, 1, 3, P.trim); };
  if (id === "ash") {
    for (const bx of [cx - 21, cx + 16]) { hang(bx, 22, P.accent); pc.rect(bx + 2, T + 12, 3, 3, H("#e8d8c0")); }
    pc.rect(cx - 5, ey, 10, 8, H("#e8d8c0")); pc.rect(cx - 3, ey + 3, 2, 2, H("#14101a")); pc.rect(cx + 1, ey + 3, 2, 2, H("#14101a")); pc.rect(cx - 2, ey + 8, 4, 2, H("#cbbf9f"));
  } else if (id === "sun") {
    pc.ellipse(cx, ey + 3, 7, 7, P.trim); pc.ellipse(cx - 1, ey + 2, 5, 5, H("#fff0a0")); pc.ellipse(cx, ey + 3, 3, 3, H("#e0b64a"));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pc.set(cx + Math.cos(a) * 9, ey + 3 + Math.sin(a) * 9, P.trim); }
    for (const bx of [cx - 21, cx + 16]) { hang(bx, 20, P.accent); pc.rect(bx + 2, T + 11, 3, 3, P.trim); }
  } else if (id === "pit") {
    pc.rect(cx - 7, 8, 14, 9, H("#e0d4b8")); pc.rect(cx - 7, 8, 14, 1, H("#fff6dc")); pc.rect(cx - 4, 11, 3, 3, H("#1a1410")); pc.rect(cx + 2, 11, 3, 3, H("#1a1410")); pc.rect(cx - 3, 16, 6, 1, H("#bfb394"));
    for (const s of [-1, 1]) { pc.line(cx + s * 8, 10, cx + s * 14, 3, H("#d8d0bc")); pc.line(cx + s * 12, 6, cx + s * 17, 7, H("#d8d0bc")); }
  } else {
    pc.poly([[cx, ey - 3], [cx + 6, ey + 4], [cx, ey + 12], [cx - 6, ey + 4]], H("#b4ecff")); pc.poly([[cx, ey - 3], [cx + 6, ey + 4], [cx, ey + 4]], H("#62b4ec")); pc.rect(cx - 1, ey + 1, 2, 7, [255, 255, 255, 255]);
    for (const bx of [cx - 21, cx + 16]) { hang(bx, 18, P.accent); pc.rect(bx + 2, T + 10, 3, 3, P.trim); }
  }
  pc.outline(OUTL(id), false);
  const out = new PC(W + 14, Hh + 6);
  out.poly([[m0 - 2, base], [m1 + 2, base], [m1 + 14, base + 5], [m0 + 10, base + 5]], [0, 0, 0, 80]);
  out.blit(pc, 0, 0);
  return out;
}

/** Надвратная башня северных ворот (вид 3/4 лицом к зрителю): портал без крыльев стены + верхняя площадка за зубцами,
 * уходящая вглубь трибун. Кадр (W+14)×(80+6+ROOF); опора — низ проёма на строке base = 72 + ROOF. */
export const GATEHOUSE_ROOF = 9;
export function gatehouse(id: string): PC {
  const g = gateSprite(id, false), R0 = GATEHOUSE_ROOF, pc = new PC(g.w, g.h + R0), cx = 46, m0 = cx - 30, m1 = cx + 30;
  const pal: Record<string, RGBA[]> = {
    ash: R("#12101a", "#2a2534", "#3c364a", "#5e546e"), sun: R("#8a8a9a", "#c6c0b2", "#e2dccc", "#f8f2e4"),
    pit: R("#2e1a0c", "#5a3820", "#7a4e28", "#a8743e"), frost: R("#2a72b8", "#7cc0ee", "#b4e4ff", "#e8f8ff"),
  };
  const p = pal[id] ?? pal.ash, top = 2, bot = R0 + 8;
  for (let y = top; y < bot; y++) for (let x = m0; x < m1; x++) {
    let c = p[2];
    if (id === "pit") { c = (x - m0) % 6 === 0 ? p[0] : (x - m0) % 6 === 1 ? p[3] : p[2]; if (y === top + 4) c = p[1]; }
    else {
      const row = Math.floor((y - top) / 4), off = (row % 2) * 6;
      if ((y - top) % 4 === 0 || (x - m0 + off) % 12 === 0) c = p[1];
      else if (hash01(Math.floor((x - m0 + off) / 12), row, 3) > 0.6) c = mix(p[2], p[3], 0.5);
    }
    if (x === m0 || x === m1 - 1) c = x === m0 ? p[3] : p[0];
    if (y === top) c = p[3];
    if (y > bot - 3) c = shade(c, 0.8); // тень от парапета на площадку
    pc.set(x, y, c);
  }
  for (let x = m0; x < m1; x++) pc.set(x, top - 1, OUTL(id));
  pc.set(m0 - 1, top, OUTL(id)); pc.set(m1, top, OUTL(id));
  for (let y = top; y < bot; y++) { pc.set(m0 - 1, y, OUTL(id)); pc.set(m1, y, OUTL(id)); }
  pc.blit(g, 0, R0);
  return pc;
}
