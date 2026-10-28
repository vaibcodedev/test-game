/**
 * Задача 139, звонарь утопленников (plg_drowned_bellringer, r59s): эскиз-лист БЕЗ анимации.
 * Колокол ×1/×4 (маленький и колокол-кистень), череп ×1/×4, силуэт фигуры ×1/×3 рядом с силуэтом референса 15.
 * Запуск: npx tsx tools/gen/bosses139/bel_sketch.ts  [refsil.png — 64×80 силуэт референса, путь 1-м аргументом]
 * → tools/out/bosses139/bel-sketch.png. Чисто 2D, без движка tools/gen/mobs.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

type C = [number, number, number];
const hx = (s: string): C => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
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
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---- палитры ----
const BR = ["#150b06", "#33200f", "#5a3a1a", "#876029", "#b58a45", "#e6c883"].map(hx); // тёмная бронза, 5 = блик
const LIP = [hx("#a77f42"), hx("#d3ac66"), hx("#f0d9a0")];                              // отогнутая светлая губа
const PAT = [hx("#1c382e"), hx("#2e5c48"), hx("#52906c")];                                // зелёная патина
const MOUTH = hx("#07040a"), MOUTH2 = hx("#1a0f12");
const OUT = hx("#0a0606");

/** Колокол W×H: ушко, макушка, плечо с бликом, расширение, светлая губа, тёмный зев, язык. spikes — шипы по губе. */
function bell(W: number, H: number, spikes: boolean): Cv {
  const c = new Cv(W + 4, H + 2), ox = 2, oy = 1;
  const big = H >= 14, cx = ox + (W - 1) / 2;
  const ear = big ? 3 : 1, lipH = big ? 2 : 1, mh = big ? 2 : 1, cl = big ? 2 : 1;
  const bodyH = H - ear - lipH - mh - cl;
  // ушко
  if (big) { for (const [x, y] of [[0, 0], [1, 0], [-1, 1], [2, 1], [0, 2], [1, 2]]) c.set(Math.floor(cx) + x, oy + y, BR[4 - (x < 1 ? 0 : 1)]); }
  else { c.set(Math.floor(cx), oy, BR[4]); }
  const hwMax = W / 2;
  for (let r = 0; r < bodyH; r++) {
    const t = (r + 0.5) / bodyH;
    const hw = big
      ? hwMax * (0.26 + 0.24 * Math.sin(Math.min(t / 0.25, 1) * Math.PI / 2) - 0.06 * Math.sin(Math.min(1, Math.max(0, (t - 0.25) / 0.4)) * Math.PI) + 0.5 * Math.pow(Math.max(0, (t - 0.5) / 0.5), 1.8))
      : hwMax * (0.30 + 0.30 * Math.sin(Math.min(t / 0.3, 1) * Math.PI / 2) + 0.05 * t + 0.35 * Math.pow(Math.max(0, (t - 0.62) / 0.38), 1.6));
    const y = oy + ear + r;
    for (let x = Math.floor(cx - hw + 0.5); x <= Math.ceil(cx + hw - 0.5); x++) {
      const n = (x + 0.0 - cx + 0.5) / Math.max(hw, 0.5);
      let tone = Math.round(3 - n * 1.7 - (Math.abs(n) > 0.85 ? 0.8 : 0));
      tone = Math.max(0, Math.min(4, tone));
      let col = BR[tone];
      if (t > 0.08 && t < 0.42 && n > -0.75 && n < -0.3) col = BR[5];                 // блик по плечу
      if (big && Math.abs(t - 0.52) < 0.5 / bodyH) col = BR[Math.max(0, tone - 2)];  // канавка-пояс
      if (big && Math.abs(t - 0.30) < 0.5 / bodyH) col = BR[Math.min(4, tone + 1)];  // ободок
      const hs = hash(x, y);
      if ((t > 0.55 && hs > 0.72) || (n > 0.25 && hs > 0.8) || (big && t > 0.2 && Math.abs(n - 0.5) < 0.12 && hs > 0.45)) col = PAT[hs > 0.9 ? 2 : hs > 0.8 ? 1 : 0];
      c.set(x, y, col);
    }
  }
  // губа (чуть шире тела, светлая)
  const yl = oy + ear + bodyH;
  for (let k = 0; k < lipH; k++) for (let x = ox - 1; x <= ox + W; x++) {
    if (x < ox - 0 && k === 0 && !big) continue;
    const n = (x - cx + 0.5) / (hwMax + 0.5);
    c.set(x, yl + k, LIP[n < -0.3 ? 2 : n < 0.45 ? 1 : 0]);
  }
  // зев
  const ym = yl + lipH;
  for (let k = 0; k < mh; k++) {
    const hw = hwMax * (1 - 0.28 * (k / Math.max(1, mh)) * (k / Math.max(1, mh)) * 2) ;
    for (let x = Math.ceil(cx - hw + 0.5); x <= Math.floor(cx + hw - 0.5); x++) c.set(x, ym + k, k === 0 ? MOUTH : (hash(x, k) > 0.7 ? MOUTH2 : MOUTH));
  }
  // язык
  const yc = ym + mh - (big ? 1 : 0);
  if (big) { c.rect(Math.floor(cx) - 1, yc, 3, 2, BR[3]); c.set(Math.floor(cx) - 1, yc, BR[5]); c.set(Math.floor(cx), yc + 1, BR[2]); }
  else c.set(Math.floor(cx), ym + mh, BR[4]);
  // шипы по губе
  if (spikes) {
    c.set(ox - 2, yl, LIP[2]); c.set(ox - 3, yl - 1, LIP[2]); c.set(ox + W + 1, yl, LIP[0]); c.set(ox + W + 2, yl - 1, LIP[1]);
    for (let i = 0; i < 6; i++) {
      const x = Math.round(cx + (i - 2.5) * W * 0.17); const y = yl - 1;
      c.set(x, y, BR[1]); c.set(x, y - 1, LIP[1]); c.set(x, y - 2, LIP[2]); c.set(x, y - 3, LIP[2]);
    }
  }
  c.outline(OUT);
  return c;
}

// ---- череп под капюшоном ----
const BONE = ["#2a2230", "#6b6068", "#a89d94", "#d8cfc0", "#f4eee0"].map(hx);
const HOODC = ["#06040a", "#120d18", "#1f1826", "#31283a"].map(hx);
const COLD = [hx("#2a7a9a"), hx("#6ad6ee"), hx("#d8fbff")];
function skull(): Cv {
  const W = 26, Hh = 28, c = new Cv(W, Hh), cx = 12.5;
  // капюшон: откинут назад, тёмные рваные складки вокруг черепа
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / 12.2, dy = (y - 11) / 11.2;
    let inside = y < 11 ? dx * dx + dy * dy <= 1 : Math.abs(dx) <= 1 - (y - 11) * 0.012 && y < 26;
    if (y >= 20) { const hem = 24 + 2 * Math.sin(x * 1.9) + (hash(x, 3) > 0.6 ? 1 : 0); inside = inside && y < hem; if (Math.abs(dx) < 0.35 && y > 21) inside = false; }
    if (!inside) continue;
    const edge = Math.abs(dx) > 0.82 || dy < -0.82;
    let ti = edge ? 2 : (hash(x, y) > 0.8 ? 1 : 0);
    if (x < 5 && y > 4 && ((x + y) % 5 === 0)) ti = 3;       // складка-блик слева
    c.set(x, y, HOODC[ti]);
  }
  // череп: свод
  const bone = (x: number, y: number, n: number, edge = 0) => {
    let t = Math.round(3.2 - n * 1.5) - edge; t = Math.max(0, Math.min(4, t)); c.set(x, y, BONE[t]);
  };
  for (let y = 3; y <= 15; y++) {
    const dy = (y - 9.5) / 6.8;
    const hw = y <= 12 ? 7.4 * Math.sqrt(Math.max(0, 1 - dy * dy)) : 7.4 * Math.sqrt(Math.max(0, 1 - dy * dy)) - (y - 12) * 0.35;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw - 1); x++) bone(x, y, (x - cx) / 7.4, Math.abs(x - cx) > hw - 1.2 ? 1 : 0);
  }
  // скулы и верхняя челюсть
  for (let y = 15; y <= 18; y++) for (let x = Math.round(cx - 5.6 + (y - 15) * 0.4); x <= Math.round(cx + 5.6 - (y - 15) * 0.4 - 1); x++) bone(x, y, (x - cx) / 6, y === 18 ? 0 : 0);
  // глазницы
  for (const ex of [8.5, 16.5]) {
    for (let y = 8; y <= 13; y++) for (let x = Math.floor(ex - 3); x <= Math.ceil(ex + 3); x++) {
      const dx = (x + 0.5 - ex - 0.5) / 2.6, dy = (y - 10.6) / 2.9;
      if (dx * dx + dy * dy <= 1) c.set(x, y, hx("#05030a"));
    }
    c.set(ex, 10, COLD[2]); c.set(ex, 11, COLD[1]); c.set(ex - 1, 11, COLD[0]); c.set(ex + 1, 11, COLD[0]); c.set(ex, 12, COLD[0]);
  }
  // нос
  c.set(12, 13, hx("#05030a")); c.set(13, 13, hx("#05030a")); c.set(12, 14, hx("#05030a")); c.set(13, 14, hx("#05030a")); c.set(12, 12, BONE[1]);
  // трещина на своде
  c.set(15, 4, BONE[1]); c.set(15, 5, BONE[1]); c.set(16, 6, BONE[0]);
  // открытая пасть: верхние зубы, зев, нижняя челюсть с зубами
  for (let x = 8; x <= 17; x++) { c.set(x, 17, x % 2 ? BONE[4] : BONE[3]); c.set(x, 18, x % 2 ? BONE[3] : BONE[1]); }
  c.set(7, 18, BONE[3]); c.set(18, 18, BONE[1]); // клыки по краям, длиннее
  c.set(7, 19, BONE[4]); c.set(18, 19, BONE[2]);
  for (let y = 19; y <= 23; y++) {
    const hw = 5.2 - Math.abs(y - 20.5) * 0.55;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw - 1); x++) c.set(x, y, y > 21 && hash(x, y) > 0.7 ? hx("#2a0a12") : hx("#07030a"));
  }
  c.set(12, 22, hx("#7a1a28")); c.set(13, 22, hx("#7a1a28")); // язык-краснота
  for (let x = 8; x <= 17; x++) c.set(x, 24, x % 2 ? BONE[3] : BONE[4]);
  for (let x = 7; x <= 18; x++) c.set(x, 25, x < 10 ? BONE[3] : x > 15 ? BONE[1] : BONE[2]);
  for (let x = 9; x <= 16; x++) c.set(x, 26, x < 11 ? BONE[2] : BONE[1]);
  c.outline(OUT);
  return c;
}

// ---- силуэт всей фигуры (64×80, один цвет) ----
const SIL = hx("#d8d8e0");
function silhouette(): Cv {
  const c = new Cv(64, 80), S = SIL;
  const disc = (x: number, y: number, r: number) => { const q = Math.max(0.5, r); for (let j = -Math.ceil(q); j <= Math.ceil(q); j++) for (let i = -Math.ceil(q); i <= Math.ceil(q); i++) if (i * i + j * j <= q * q + 0.2) c.set(x + i, y + j, S); };
  const line = (x0: number, y0: number, x1: number, y1: number, t0: number, t1 = t0) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= n; i++) { const u = i / n; disc(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, (t0 + (t1 - t0) * u) / 2); }
  };
  const chain = (x0: number, y0: number, x1: number, y1: number, sag: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) if (i % 2 === 0) { const u = i / n; c.set(x0 + (x1 - x0) * u + sag * Math.sin(u * Math.PI), y0 + (y1 - y0) * u, S); }
  };
  const flat = (b: Cv, ox: number, oy: number) => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.has(x, y)) c.set(ox + x, oy + y, S); };
  const HX = 36;
  // тонкий нимб: круг 1 px и редкие длинные шипы
  for (let a = 0; a < 360; a += 4) { const r = (a * Math.PI) / 180; c.set(HX + Math.cos(r) * 10, 15 + Math.sin(r) * 10, S); }
  for (let a = 200; a <= 340; a += 35) { const r = (a * Math.PI) / 180; line(HX + Math.cos(r) * 10, 15 + Math.sin(r) * 10, HX + Math.cos(r) * 15, 15 + Math.sin(r) * 15, 1.5, 0.5); }
  // капюшон-голова, узкие плечи, торс
  disc(HX, 15, 4.5); line(HX, 11, HX, 8, 3, 1); line(HX, 18, HX, 24, 7, 9); line(HX, 24, HX, 46, 12, 11);
  // лохмотья: длинные пряди, расходятся книзу веером, внизу — просветы
  const ends = [-23, -17, -12, -8, -4, 0, 4, 8, 12, 17, 23, 28];
  ends.forEach((dx, i) => {
    const y1 = 79 - ((i * 7) % 4) * 4 - (dx > 12 ? 4 : 0);
    line(HX + dx * 0.22, 42, HX + dx, y1, 5, 0.6);
  });
  line(HX + 4, 52, HX + 31, 74, 3, 0.5); line(HX + 6, 48, HX + 27, 68, 3, 0.5);
  // правая рука (справа): костлявая, вытянута вперёд, рваный рукав
  line(HX + 4, 27, HX + 14, 31, 3, 3); line(HX + 14, 31, HX + 22, 35, 2, 1.5);
  for (const [dx, dy] of [[1, -3], [3, -2], [4, 0], [3, 2]]) line(HX + 22, 35, HX + 22 + dx, 35 + dy, 1, 1);
  line(HX + 10, 33, HX + 15, 47, 3, 0.5); line(HX + 14, 33, HX + 21, 46, 3, 0.5); line(HX + 8, 33, HX + 9, 44, 2, 0.5);
  // левая рука держит цепь кистеня
  line(HX - 4, 27, HX - 9, 38, 3, 2);
  // малые колокола на цепочках с нимба
  const sb = bell(6, 8, false);
  chain(HX - 9, 18, HX - 14, 21, 0); flat(sb, HX - 18, 21);
  chain(HX + 9, 12, HX + 12, 16, 0); flat(sb, HX + 9, 16);
  chain(HX - 15, 30, HX - 17, 33, 0); flat(sb, HX - 22, 33);
  // кистень: длинная видимая цепь от кисти, колокол отдельно сбоку
  const bb = bell(16, 21, true);
  chain(HX - 9, 40, 10, 52, 3); chain(HX - 9, 41, 10, 53, -2);
  flat(bb, 1, 53);
  c.outline(S);
  return c;
}

// ---- мелкий шрифт 3×5 (кириллица) и подписи ----
const F: Record<string, string> = {
  "К": "101,101,110,101,101", "О": "111,101,101,101,111", "Л": "011,101,101,101,101", "М": "101,111,111,101,101",
  "А": "010,101,111,101,101", "И": "101,101,111,111,101", "С": "011,100,100,100,011", "Т": "111,010,010,010,010",
  "Е": "111,100,110,100,111", "Н": "101,101,111,101,101", "Ь": "100,100,110,101,110", "Ч": "101,101,111,001,001",
  "Р": "110,101,110,100,100", "П": "111,101,101,101,101", "Ш": "101,101,101,101,111", "У": "101,101,111,001,110",
  "Э": "110,001,011,001,110", "Ф": "010,111,101,111,010", "Ы": "101,101,111,101,101", "Й": "101,111,101,101,111",
  "Б": "111,100,110,101,110", "×": "000,101,010,101,000", "1": "010,110,010,010,111", "2": "110,001,010,100,111", "3": "110,001,010,001,110", "4": "101,101,111,001,001",
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
const sheetW = 720, sheetH = 560;
const sh = new Cv(sheetW, sheetH);
sh.rect(0, 0, sheetW, sheetH, BG);
const panel = (x: number, y: number, w: number, h: number) => sh.rect(x, y, w, h, PANEL);
const small = bell(6, 8, false), big = bell(16, 21, true), sk = skull();

panel(8, 8, 300, 60); label(sh, 14, 14, "КОЛОКОЛ МАЛ ×1  ×4"); sh.blit(small, 20, 34, 1); sh.blit(small, 60, 30, 4);
panel(8, 76, 300, 118); sh.blit(big, 20, 94, 1); sh.blit(big, 60, 84 + 12, 4);
// подпись большого колокола (над ним, в верхней полосе панели)
label(sh, 14, 80, "КИСТЕНЬ ×1  ×4");
panel(316, 8, 396, 186); label(sh, 322, 14, "ЧЕРЕП ×1  ×4"); sh.blit(sk, 326, 40, 1); sh.blit(sk, 380, 40, 4);

const refPath = process.argv[2] ?? "";
let ref: Cv | null = null;
if (refPath && fs.existsSync(refPath)) {
  const p = PNG.sync.read(fs.readFileSync(refPath)); ref = new Cv(64, 80);
  for (let y = 0; y < 80; y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4; if (p.data[i] < 160) ref.set(x, y, SIL); }
}
const mine = silhouette();
panel(8, 202, 300, 350); label(sh, 14, 208, "НАШ СИЛУЭТ ×3"); sh.blit(mine, 20, 230, 3);
panel(316, 202, 396, 350); label(sh, 322, 208, "НАШ ×1"); label(sh, 460, 208, "РЕФЕРЕНС ×1");
sh.blit(mine, 330, 232, 1); if (ref) sh.blit(ref, 470, 232, 1);
label(sh, 330, 330, "НАШ ×2"); sh.blit(mine, 330, 352, 2); if (ref) { label(sh, 470, 330, "РЕФЕРЕНС ×2"); sh.blit(ref, 470, 352, 2); }

const png = new PNG({ width: sheetW, height: sheetH });
png.data = Buffer.from(sh.d);
const out = path.resolve("tools/out/bosses139/bel-sketch.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, PNG.sync.write(png));
console.log("ok", out);
