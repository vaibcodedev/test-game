/**
 * Задача 139, звонарь утопленников (plg_drowned_bellringer, r59s): эскиз-лист БЕЗ анимации.
 * Колокол ×1/×4 (маленький и колокол-кистень), череп ×1/×4, силуэт фигуры ×1/×3 рядом с силуэтом референса 15.
 * Запуск: npx tsx tools/gen/bosses139/bel_sketch.ts  [refsil.png — 64×80 силуэт референса, путь 1-м аргументом]
 * → tools/out/bosses139/bel-sketch.png. Чисто 2D, без движка tools/gen/mobs.
 */

export type C = [number, number, number];
export const hx = (s: string): C => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
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
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---- палитры ----
const BR = ["#150b06", "#33200f", "#5a3a1a", "#876029", "#b58a45", "#e6c883"].map(hx); // тёмная бронза, 5 = блик
const LIP = [hx("#8a6a40"), hx("#b8966a"), hx("#d8c294")];                              // отогнутая светлая губа
const PAT = [hx("#1c382e"), hx("#2e5c48"), hx("#52906c")];                                // зелёная патина
const MOUTH = hx("#07040a"), MOUTH2 = hx("#1a0f12");
const OUT = hx("#0a0606");

/** Колокол W×H: ушко, макушка, плечо с бликом, расширение, светлая губа, тёмный зев, язык. spikes — шипы по губе. */
function bellRaw(W: number, H: number, spikes: boolean): Cv {
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
  for (let k = 0; k < lipH; k++) for (let x = ox; x <= ox + W - 1; x++) {
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
    c.set(ox - 1, yl, LIP[2]); c.set(ox - 2, yl - 1, LIP[2]); c.set(ox + W, yl, LIP[0]); c.set(ox + W + 1, yl - 1, LIP[1]);
    for (let i = 0; i < 6; i++) {
      const x = Math.round(cx + (i - 2.5) * W * 0.17); const y = yl - 1;
      c.set(x, y, BR[1]); c.set(x, y - 1, LIP[1]); c.set(x, y - 2, LIP[2]); c.set(x, y - 3, LIP[2]);
    }
  }
  c.outline(OUT);
  return c;
}


/** Колокол-штамп с наклоном «через выбор штампа»: нижние ряды сдвинуты на round(shear·ряд). Якорь — ушко (ax, ay). */
export interface BellSprite { cv: Cv; ax: number; ay: number }
const BCACHE = new Map<string, BellSprite>();
export function bellSprite(W: number, H: number, spikes: boolean, shear = 0): BellSprite {
  const key = `${W}x${H}${spikes ? "s" : ""}:${shear}`;
  const hit = BCACHE.get(key);
  if (hit) return hit;
  const raw = bellRaw(W, H, spikes); // уже с контуром 1 px
  const pad = 6;
  const cv = new Cv(raw.w + pad * 2, raw.h);
  for (let y = 0; y < raw.h; y++) { const off = Math.round(shear * y); for (let x = 0; x < raw.w; x++) if (raw.has(x, y)) cv.set(pad + x + off, y, raw.get(x, y)); }
  const r: BellSprite = { cv, ax: pad + 2 + Math.floor((W - 1) / 2), ay: 1 };
  BCACHE.set(key, r);
  return r;
}
