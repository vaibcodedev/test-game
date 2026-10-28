/** Арт арен PvP (запекается кодом): «Пепельный колизей» и «Солнечный амфитеатр» (2×2), «Бойцовская яма» и «Ледяной круг» (1×1). */
import { PC, hex, mix, shade, hash01, pnoise, type RGBA } from "./canvas";
import { drawSpectator, CROWD_TYPES, lookOfType, type ArenaId } from "../../shared/arenaCrowd";
import { ARENA_VARIANTS } from "../../shared/arena";
export { drawSpectator, lookOfType, CROWD_TYPES };

const H = (s: string) => hex(s);
const R = (...s: string[]) => s.map(H);
const pick = (r: RGBA[], t: number) => r[Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)))];
const frac = (v: number) => v - Math.floor(v);
const rad = (d: number) => (d * Math.PI) / 180;

export interface Theme {
  id: ArenaId; name: string;
  top: RGBA[]; riser: RGBA[]; cap: RGBA[]; face: RGBA[]; trim: RGBA; accent: RGBA; accent2: RGBA;
  sand: RGBA[]; stain: RGBA; blood: RGBA; outer: RGBA;
}
export const THEMES: Record<ArenaId, Theme> = {
  ash: {
    id: "ash", name: "Пепельный колизей",
    top: R("#2e2933", "#3a3440", "#463f4d", "#524a5a"), riser: R("#14101a", "#1d1823", "#272030", "#312a3a"),
    cap: R("#4b4352", "#5e5566", "#74697b", "#8a7e90"), face: R("#1a1620", "#241e2b", "#2f2837"),
    trim: H("#b02a2e"), accent: H("#a8262c"), accent2: H("#e8a23a"),
    sand: R("#5e4832", "#6d543a", "#7d6244", "#8c7050"), stain: H("#41201c"), blood: H("#5a1414"), outer: H("#100c15"),
  },
  sun: {
    id: "sun", name: "Солнечный амфитеатр",
    top: R("#b9b3a5", "#c9c3b4", "#d8d3c5", "#e8e4d8"), riser: R("#7f7f8c", "#8f8f9b", "#a0a0ab", "#b2b2bb"),
    cap: R("#d4cfc0", "#e2ddd0", "#f0ece0", "#fbf8ee"), face: R("#8d8d99", "#a2a2ad", "#b8b8c0"),
    trim: H("#e0b64a"), accent: H("#2f5fb0"), accent2: H("#f0cc5a"),
    sand: R("#cfb67e", "#d9c28c", "#e3cf9c", "#ecdcae"), stain: H("#b79a62"), blood: H("#9a3a2a"), outer: H("#8d96a6"),
  },
  pit: {
    id: "pit", name: "Бойцовская яма",
    top: R("#4a3e32", "#58493a", "#695744", "#7a664f"), riser: R("#231b14", "#2e241a", "#3a2e21", "#463829"),
    cap: R("#5e5040", "#706050", "#837058", "#988468"), face: R("#2a2018", "#35291e", "#42342a"),
    trim: H("#6b4a2c"), accent: H("#a8402a"), accent2: H("#e8a23a"),
    sand: R("#54402c", "#634c34", "#745a3e", "#846848"), stain: H("#3a1a14"), blood: H("#4a1010"), outer: H("#14100c"),
  },
  frost: {
    id: "frost", name: "Ледяной круг",
    top: R("#aebccb", "#c0cddb", "#d6e0ea", "#eef4fa"), riser: R("#2c3d52", "#3a4e66", "#4a607a", "#5e7690"),
    cap: R("#7c8fa6", "#93a6bc", "#aebfd2", "#d0deec"), face: R("#26364a", "#324660", "#3e5672"),
    trim: H("#7ec8f0"), accent: H("#5aa0d8"), accent2: H("#bfe6ff"),
    sand: R("#9fb4c8", "#b0c3d6", "#c4d4e4", "#d8e4f0"), stain: H("#7f95ab"), blood: H("#8a1c1c"), outer: H("#141c28"),
  },
};

export interface Spec {
  id: ArenaId; rings: number; ringW: number; wallH: number; spacing: number; fill: number; aisles: number; seed: number; standing: number;
}
export const SPECS: Spec[] = [
  { id: "ash", rings: 10, ringW: 21, wallH: 30, spacing: 11, fill: 0.8, aisles: 16, seed: 1, standing: 0.1 },
  { id: "sun", rings: 10, ringW: 21, wallH: 30, spacing: 11, fill: 0.8, aisles: 12, seed: 2, standing: 0.1 },
  { id: "pit", rings: 5, ringW: 22, wallH: 22, spacing: 12, fill: 0.85, aisles: 0, seed: 3, standing: 0.7 },
  { id: "frost", rings: 4, ringW: 24, wallH: 26, spacing: 12, fill: 0.85, aisles: 0, seed: 4, standing: 0.5 },
];

/** Зритель: type — вид из CROWD_TYPES; ang — угол по кругу (для волны оваций), ring — ряд. */
export interface Spectator { x: number; y: number; type: number; ring: number; ang: number }
export interface Placed { kind: string; x: number; y: number; img: PC }
export interface ArenaArt { bg: PC; img: PC; spectators: Spectator[]; props: Placed[]; cover: Placed[]; coverImg: PC; cx: number; cy: number; spec: Spec; theme: Theme; w: number; h: number; rx: number; ry: number }

function stoneOf(th: Theme) {
  return th.id === "ash" ? R("#241f2a", "#352f3c", "#4a4352", "#6a6072") : th.id === "sun" ? R("#a9a9b4", "#c6c2b6", "#e0dccd", "#f6f2e6") : th.id === "frost" ? R("#5a7ea0", "#86b0d0", "#b4d8ee", "#e4f6ff") : R("#3a3026", "#524434", "#6c5a44", "#8a7458");
}
/** Колонна, обломок или ледяная глыба; низ кадра = основание + 2 px (якорь объекта 0,5 / 1). */
export function column(w: number, h: number, th: Theme, broken: boolean, seed: number): PC {
  const pc = new PC(w + 12, h + 6), st = stoneOf(th), x0 = 6, base = h + 3;
  pc.ellipse(x0 + w / 2 + 3, base, w / 2 + 6, 3, [0, 0, 0, 80]);
  if (th.id === "frost") {
    // глыба льда: неровная призма со сколами и бликами
    const top = 4;
    for (let y = top; y < base; y++) for (let x = 0; x < w; x++) {
      const t = x / (w - 1), edge = Math.floor(hash01(x, 3, seed) * 4);
      if (y < top + edge + (x % 5 === 0 ? 3 : 0)) continue;
      let c = t < 0.25 ? st[3] : t < 0.55 ? st[2] : t < 0.85 ? st[1] : st[0];
      if ((x + y) % 9 === 0) c = st[3];
      if (y > base - 3) c = shade(c, 0.8);
      pc.set(x0 + x, y, c);
    }
    pc.rect(x0 + 2, top + 5, 1, 8, [255, 255, 255, 200]);
    return pc;
  }
  pc.rect(x0 - 2, base - 5, w + 4, 5, st[1]); pc.rect(x0 - 2, base - 5, w + 4, 1, st[3]); pc.rect(x0 - 2, base - 1, w + 4, 1, st[0]);
  const top = broken ? 8 + Math.floor(hash01(seed, 1, 1) * 10) : 5;
  for (let y = top; y < base - 5; y++) for (let x = 0; x < w; x++) {
    const t = x / (w - 1), c = t < 0.2 ? st[3] : t < 0.5 ? st[2] : t < 0.8 ? st[1] : st[0];
    if (broken && y < top + 5 && hash01(x, y, seed) < (top + 5 - y) * 0.1 && x % 3 === 0) continue;
    pc.set(x0 + x, y, c);
  }
  if (!broken) {
    pc.rect(x0 - 2, 2, w + 4, 4, st[2]); pc.rect(x0 - 2, 2, w + 4, 1, st[3]); pc.rect(x0 - 2, 5, w + 4, 1, st[0]);
    if (th.id === "sun") pc.rect(x0 - 2, 6, w + 4, 1, th.trim);
    if (th.id === "ash") pc.rect(x0, 7, w, 1, th.accent);
  } else {
    for (let i = 0; i < 4; i++) pc.rect(x0 + w + 1 + i * 3, base - 3 - (i & 1), 3, 3, st[1 + (i & 1)]);
    pc.rect(x0 - 5, base - 3, 3, 3, st[2]);
  }
  return pc;
}
function banner(th: Theme, len: number): PC {
  const pc = new PC(14, len + 6), a = th.accent, d = shade(a, 0.7);
  pc.rect(0, 0, 14, 2, H("#2a2218")); pc.rect(0, 0, 14, 1, th.trim);
  for (let y = 2; y < len; y++) for (let x = 1; x < 13; x++) pc.set(x, y, x < 3 || x > 9 ? d : a);
  for (let x = 1; x < 13; x += 2) pc.rect(x, len, 1, 3, th.accent2);
  const my = Math.floor(len / 2);
  if (th.id === "ash") { pc.rect(5, my - 4, 4, 4, H("#e8d8c0")); pc.rect(6, my, 2, 2, H("#e8d8c0")); pc.set(6, my - 3, H("#1a1018")); pc.set(8, my - 3, H("#1a1018")); }
  else { pc.rect(6, my - 5, 2, 8, th.accent2); pc.rect(3, my - 2, 8, 2, th.accent2); pc.set(6, my - 6, H("#fff0b0")); }
  return pc;
}
function brazier(blue = false): PC {
  const pc = new PC(16, 26);
  pc.ellipse(10, 24, 7, 2, [0, 0, 0, 80]);
  pc.rect(7, 12, 3, 11, H("#2a2630")); pc.rect(4, 22, 9, 2, H("#2a2630"));
  pc.rect(3, 9, 11, 4, H("#3a3440")); pc.rect(3, 9, 11, 1, H("#74697b")); pc.rect(4, 13, 9, 1, H("#1a1620"));
  const fl = blue ? [H("#2a5ab0"), H("#4aa0e8"), H("#a0e0ff"), H("#f0ffff")] : [H("#a8200e"), H("#e8501a"), H("#f8a030"), H("#fff0a0")];
  for (let y = 0; y < 9; y++) {
    const w = Math.max(1, Math.round(6 - y * 0.55));
    for (let x = 0; x < w; x++) pc.set(8 - Math.floor(w / 2) + x, 8 - y, fl[Math.min(3, Math.floor((1 - y / 9) * 3 + (x === Math.floor(w / 2) ? 1 : 0)))]);
  }
  return pc;
}
function statue(th: Theme): PC {
  const pc = new PC(22, 44), m = R("#9a9aa6", "#b8b6b0", "#d8d4c6", "#f4f0e2");
  pc.ellipse(13, 41, 10, 3, [0, 0, 0, 70]);
  pc.rect(3, 32, 16, 9, m[1]); pc.rect(3, 32, 16, 2, m[3]); pc.rect(3, 40, 16, 1, m[0]); pc.rect(3, 36, 16, 1, th.trim);
  pc.rect(8, 14, 7, 18, m[2]); pc.rect(8, 14, 2, 18, m[3]); pc.rect(13, 14, 2, 18, m[1]);
  pc.rect(9, 6, 5, 7, m[3]); pc.rect(9, 5, 5, 2, th.trim);
  pc.rect(4, 17, 2, 10, m[1]); pc.rect(4, 14, 4, 3, m[2]); pc.rect(15, 8, 3, 8, m[2]); pc.rect(16, 3, 1, 6, th.trim);
  return pc;
}
function archSpan(th: Theme, w: number, h: number): PC {
  const pc = new PC(w, h), m = th.cap;
  for (let x = 0; x < w; x++) {
    const t = ((x + 0.5) / w) * 2 - 1, y0 = Math.round(h * 0.45 * (1 - Math.sqrt(Math.max(0, 1 - t * t))));
    for (let y = y0; y < h; y++) {
      if (y > y0 + 4 && Math.abs(t) < 0.85) continue;
      pc.set(x, y, y < y0 + 2 ? m[3] : m[1]);
    }
  }
  pc.rect(0, 0, w, 3, m[2]); pc.rect(0, 0, w, 1, m[3]); pc.rect(0, 2, w, 1, th.trim);
  return pc;
}
/** Ворота в стене арены: рама с капителями, арка, решётка (ash) или створки, свет из проёма и тень на песок. */
function gate(th: Theme, w: number, h: number, kind: "bars" | "doors" | "plain"): PC {
  const pc = new PC(w, h + 6), m = th.cap, iw = w - 14, ix = 7;
  pc.ellipse(w / 2, h + 2, w / 2 - 2, 3, [0, 0, 0, 90]);
  pc.rect(0, 2, w, h - 2, m[1]); pc.rect(0, 2, w, 2, m[3]);
  pc.rect(0, 0, w, 3, m[2]); pc.rect(0, 0, w, 1, m[3]); pc.rect(0, 3, w, 1, th.trim);
  pc.rect(0, 4, 6, h - 4, m[2]); pc.rect(0, 4, 1, h - 4, m[3]); pc.rect(w - 6, 4, 6, h - 4, m[0]);
  pc.rect(0, 5, 6, 2, m[3]); pc.rect(w - 6, 5, 6, 2, m[2]);
  for (let y = 7; y < h + 1; y++) for (let x = 0; x < iw; x++) {
    const dx = (x + 0.5 - iw / 2) / (iw / 2), top = 7 + (iw / 2) * (1 - Math.sqrt(Math.max(0, 1 - dx * dx))) * 0.9;
    if (y < top) continue;
    const dep = (y - top) / (h - top);
    let c: RGBA = th.id === "ash" ? mix(H("#12060a"), H("#8a2418"), dep * 0.9) : th.id === "frost" ? mix(H("#0e1824"), H("#4a7aa0"), dep * 0.7) : mix(H("#201e28"), H("#8a8a9a"), dep * 0.6);
    if (kind === "bars" && (x % 4 === 1 || (y - 8) % 8 === 0)) c = y > h - 4 ? H("#8a8494") : H("#4a4454");
    if (kind === "doors" && Math.abs(x - iw / 2) < 1) c = th.trim;
    if (kind === "doors" && Math.abs(x - iw / 2) >= 1) c = mix(th.id === "sun" ? H("#7a5a2a") : H("#4a3220"), th.trim, (y % 6 === 0 ? 0.5 : 0.12));
    pc.set(ix + x, y, c);
  }
  if (kind === "bars") for (let x = 1; x < iw; x += 4) pc.set(ix + x, h, H("#b8b0c0"));
  pc.rect(w / 2 - 3, 4, 6, 4, th.id === "ash" ? H("#e8d8c0") : th.accent2);
  return pc;
}
function pitGate(): PC {
  const pc = new PC(38, 40);
  pc.ellipse(19, 37, 17, 3, [0, 0, 0, 90]);
  pc.rect(0, 0, 38, 36, H("#3a2a1a")); pc.rect(0, 0, 38, 3, H("#8a6440")); pc.rect(0, 33, 38, 3, H("#2a1e12"));
  for (let x = 4; x < 36; x += 6) { pc.rect(x, 4, 4, 29, x % 12 < 6 ? H("#5a4028") : H("#4a3320")); pc.rect(x, 4, 1, 29, H("#7a5434")); }
  pc.rect(2, 14, 34, 3, H("#2a2014")); pc.rect(2, 24, 34, 3, H("#2a2014"));
  for (const x of [5, 18, 31]) { pc.rect(x, 15, 2, 1, H("#b8b0a0")); pc.rect(x, 25, 2, 1, H("#b8b0a0")); }
  pc.rect(0, 0, 3, 36, H("#2a1e12")); pc.rect(35, 0, 3, 36, H("#2a1e12"));
  return pc;
}
function icegate(): PC {
  const pc = new PC(38, 40), c = R("#26364a", "#3e5672", "#7c9ab8", "#d0e8f8");
  pc.ellipse(19, 37, 17, 3, [0, 0, 0, 90]);
  for (let y = 2; y < 36; y++) for (let x = 0; x < 38; x++) {
    const dx = (x - 19) / 19, top = 4 + 14 * (1 - Math.sqrt(Math.max(0, 1 - dx * dx))) + (x % 4 === 0 ? 2 : 0);
    if (y < top) continue;
    const inner = Math.abs(dx) < 0.55 && y > top + 6;
    pc.set(x, y, inner ? mix(H("#0e1824"), H("#5a8ab0"), (y - top) / 30) : x < 19 ? c[2] : c[1]);
  }
  for (let x = 6; x < 32; x += 6) pc.rect(x, 3 + Math.floor(hash01(x, 1, 1) * 3), 2, 4, c[3]);
  for (let x = 12; x < 28; x += 4) pc.rect(x, 20, 1, 15, [200, 230, 255, 150]);
  return pc;
}
function royalBox(th: Theme): PC {
  const pc = new PC(150, 60), st = R("#1a1620", "#2c2632", "#463f4d", "#6a6072");
  pc.rect(6, 36, 138, 22, st[1]); pc.rect(6, 36, 138, 2, st[3]); pc.rect(6, 56, 138, 2, st[0]);
  for (let x = 14; x < 140; x += 22) pc.rect(x, 38, 2, 18, st[0]);
  pc.rect(0, 8, 150, 12, th.accent); pc.rect(0, 8, 150, 2, th.accent2); pc.rect(0, 19, 150, 1, shade(th.accent, 0.5));
  for (let x = 0; x < 150; x += 6) pc.rect(x, 20, 3, 4, th.accent);
  for (const x of [8, 66, 138]) { pc.rect(x, 10, 4, 28, st[2]); pc.rect(x, 10, 1, 28, st[3]); pc.rect(x + 3, 10, 1, 28, st[0]); }
  for (const x of [34, 102]) { pc.rect(x, 24, 14, 14, shade(th.accent, 0.8)); pc.rect(x, 24, 14, 2, th.accent2); pc.rect(x + 3, 26, 8, 11, H("#2a0e12")); }
  pc.rect(70, 26, 10, 12, H("#2a0e12")); pc.rect(72, 27, 6, 4, H("#e8d8c0")); pc.rect(72, 31, 6, 7, th.accent2);
  return pc;
}
function crystal(h: number, seed: number): PC {
  const pc = new PC(14, h), c = R("#3e6a96", "#6aa8d8", "#a8dcf8", "#f0ffff");
  for (let y = 0; y < h; y++) {
    const w = Math.max(1, Math.round((y / h) * 8 * (0.7 + hash01(seed, y, 1) * 0.1)));
    for (let x = 0; x < w; x++) pc.set(7 - Math.floor(w / 2) + x, y, x < w / 3 ? c[3] : x < w * 0.7 ? c[2] : c[1]);
  }
  pc.rect(3, h - 2, 8, 2, c[0]);
  return pc;
}
function weapon(kind: number, th: Theme): PC {
  const pc = new PC(12, 12), steel = H("#b8bcc8"), wood = H("#6a4a2a");
  if (kind === 0) { for (let i = 0; i < 9; i++) pc.set(2 + i, 10 - i, steel); pc.set(1, 10, th.accent2); pc.set(2, 9, th.accent2); pc.set(3, 8, wood); }
  else if (kind === 1) { for (let i = 0; i < 10; i++) pc.set(1 + i, 11 - i, wood); pc.set(10, 1, steel); pc.set(11, 0, steel); pc.set(9, 2, steel); }
  else if (kind === 2) { pc.ellipse(6, 6, 4, 4, shade(th.accent, 0.9)); pc.ellipse(6, 6, 1, 1, th.accent2); pc.rect(2, 6, 8, 1, [0, 0, 0, 60]); }
  else { pc.rect(1, 9, 9, 1, steel); pc.rect(0, 8, 3, 1, wood); pc.set(9, 8, steel); }
  return pc;
}

export function renderArena(sp: Spec): ArenaArt {
  const V = ARENA_VARIANTS[sp.id], th = THEMES[sp.id], W = V.w * 32, Hh = V.h * 32, rx = V.rx, ry = V.ry;
  const cx = W / 2, cy = Math.round(Hh * 0.54), k = rx / ry;
  const bg = new PC(W, Hh), WT = 10, seed = sp.seed * 977;
  const e0of = (far: number) => rx + WT + sp.wallH * far;
  const aisle = (ang: number, e: number) => {
    if (sp.aisles <= 0) return 99;
    const f = frac((ang / (Math.PI * 2)) * sp.aisles);
    return Math.min(f, 1 - f) * ((Math.PI * 2) / sp.aisles) * e;
  };
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - cx, sy = (y + 0.5 - cy) * k, e = Math.hypot(dx, sy), s = sy / (e || 1), far = Math.max(0, -s), ang = Math.atan2(sy, dx);
    const cs = dx / (e || 1), e0 = e0of(far), nz = hash01(x, y, seed), arc = ang * e;
    const side = 1 + 0.16 * cs; // свет слева-сверху: правые трибуны светлее, левые темнее
    let c: RGBA;
    if (e < rx) {
      const t = 0.3 + 0.45 * pnoise(x, y, 16, 2048, seed) + 0.2 * pnoise(x, y, 8, 2048, seed + 1) + (nz - 0.5) * 0.18;
      c = pick(th.sand, Math.min(0.999, Math.max(0, t)));
      if (pnoise(x, y, 8, 2048, seed + 2) > (th.id === "ash" ? 0.74 : th.id === "pit" ? 0.7 : 0.84)) c = mix(c, th.stain, 0.5);
      if (th.id === "sun" && frac(e / 7) < 0.12 && e < rx - 20) c = shade(c, 0.93);
      if (th.id === "frost" && pnoise(x, y, 24, 2048, seed + 3) > 0.62 && nz < 0.5) c = mix(c, H("#e8f4ff"), 0.4); // наст
      const sd = rx - e;
      if (sd < 16) c = shade(c, 1 - (1 - sd / 16) * (0.18 + 0.4 * far));
    } else if (e < e0 - 5) {
      const tf = (e - rx) / (e0 - 5 - rx);
      c = shade(pick(th.face, 0.85 - tf * 0.6 + (nz - 0.5) * 0.15), side);
      if (frac(arc / 14) < 0.06) c = shade(c, 0.8);
      if (th.id === "sun" && tf > 0.8) c = th.trim;
      if (th.id === "ash" && tf > 0.85) c = th.accent;
      if (th.id === "frost" && tf > 0.85) c = th.trim;
    } else if (e < e0) {
      c = shade(pick(th.cap, 0.4 + 0.5 * ((e - (e0 - 5)) / 5) + (nz - 0.5) * 0.2), side);
    } else {
      const u = e - e0, t = u / sp.ringW, idx = Math.floor(t), ph = t - idx;
      if (idx >= sp.rings) {
        const u2 = u - sp.rings * sp.ringW;
        if (u2 < 5 + 14 * far) c = shade(pick(th.face, 0.8 - u2 / 26 + (nz - 0.5) * 0.12), side);
        else if (u2 < 9 + 14 * far) c = shade(pick(th.cap, 0.55 + (nz - 0.5) * 0.3), side);
        else {
          const o = u2 - 9 - 14 * far;
          c = shade(mix(th.outer, shade(th.outer, 0.6), Math.min(1, o / 120)), 0.92 + nz * 0.12);
          if (th.id === "frost" && nz > 0.93) c = [230, 240, 250, 255];
        }
      } else {
        const fr = 0.2 + 0.32 * far, ad = aisle(ang, e);
        if (ph < fr) {
          c = shade(pick(th.riser, 0.15 + 0.6 * (ph / fr) + (nz - 0.5) * 0.12), side * (0.85 + 0.15 * Math.abs(cs)));
          if (frac(arc / 13) < 0.07) c = shade(c, 0.78);
          if (ad < 3.5) c = shade(pick(th.top, 0.6), 0.75);
        } else {
          const pp = (ph - fr) / (1 - fr);
          c = shade(pick(th.top, 0.25 + 0.45 * (1 - pp * 0.5) + (nz - 0.5) * 0.14), 1 + 0.06 * cs);
          if (pp < 0.12) c = pick(th.top, 0.95); // освещённая кромка ступени
          if (pp > 0.7) c = shade(c, 1 - ((pp - 0.7) / 0.3) * 0.32); // тень от ряда выше
          if (frac(arc / 17) < 0.05) c = shade(c, 0.82);
          if (th.id === "frost" && nz > 0.9) c = [250, 252, 255, 255]; // снег на ступенях
          if (ad < 3.5) c = pick(th.top, 0.85 - pp * 0.2);
          if (idx === 0 && pp > 0.3 && pp < 0.4) c = th.id === "ash" ? H("#7a7080") : th.trim; // верх перил
          if (idx === 0 && pp >= 0.4 && pp < 0.55 && frac(arc / 11) < 0.22) c = shade(th.top[1], 0.6); // балясины
          if (idx === 0 && pp >= 0.55 && pp < 0.66) c = shade(c, 0.7); // тень перил на ступень
        }
      }
    }
    bg.set(x, y, c);
  }
  // ---------- песок: знаки, следы, кровь, мусор ----------
  const R7 = (n: number, a = 0) => hash01(n, seed + a, 7);
  const line = (a: number, b: number, c: RGBA) => { for (let i = 0; i < 3600; i++) { const t = (i / 3600) * Math.PI * 2; bg.set(cx + Math.cos(t) * a, cy + Math.sin(t) * b, c); } };
  const spokes = (n: number, r0: number, r1: number, c: RGBA, off = 0) => { for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2 + off; for (let r = r0; r < r1; r++) bg.set(cx + Math.cos(t) * r, cy + (Math.sin(t) * r) / k, c); } };
  const inside = (x: number, y: number, m = 0.9) => ((x - cx) / (rx * m)) ** 2 + ((y - cy) / (ry * m)) ** 2 < 1;
  const sc = rx / 430;
  if (th.id === "ash") { line(110 * sc, 64 * sc, [30, 12, 14, 150]); line(70 * sc, 41 * sc, [30, 12, 14, 130]); spokes(6, 70 * sc, 110 * sc, [30, 12, 14, 130]); }
  if (th.id === "sun") { line(120 * sc, 70 * sc, [150, 110, 40, 200]); line(116 * sc, 68 * sc, [240, 210, 120, 160]); line(60 * sc, 35 * sc, [150, 110, 40, 200]); spokes(8, 60 * sc, 120 * sc, [200, 160, 70, 150], 0.2); }
  if (th.id === "pit") { line(rx * 0.55, ry * 0.55, [30, 20, 14, 140]); line(rx * 0.12, ry * 0.12, [30, 20, 14, 160]); }
  if (th.id === "frost") { line(rx * 0.5, ry * 0.5, [90, 130, 170, 150]); line(rx * 0.3, ry * 0.3, [240, 250, 255, 140]); spokes(9, rx * 0.12, rx * 0.5, [90, 130, 170, 130], 0.3); }
  // меловые круги точек появления команд
  for (const sg of [-1, 1]) { const px = cx + sg * (rx - 70), py = cy - 48; for (let i = 0; i < 360; i++) { const t = rad(i); bg.set(px + Math.cos(t) * 20, py + Math.sin(t) * 12, [235, 228, 210, 70]); bg.set(px + Math.cos(t) * 20, py + 96 + Math.sin(t) * 12, [235, 228, 210, 40]); } }
  // следы: цепочки пар отпечатков
  const nTracks = Math.round(rx / 7);
  for (let i = 0; i < nTracks; i++) {
    let x = cx + (R7(i, 1) - 0.5) * rx * 1.6, y = cy + (R7(i, 2) - 0.5) * ry * 1.5, a = R7(i, 3) * 6.28;
    const dark: RGBA = th.id === "sun" ? [120, 90, 50, 80] : th.id === "frost" ? [90, 120, 150, 90] : [20, 12, 8, 90];
    for (let s = 0; s < 5 + Math.floor(R7(i, 4) * 6); s++) {
      if (inside(x, y, 0.88)) { bg.rect(x + Math.cos(a + 1.57) * 2, y + Math.sin(a + 1.57) * 1, 2, 1, dark); bg.rect(x - Math.cos(a + 1.57) * 2 + 3, y - Math.sin(a + 1.57) * 1 + 2, 2, 1, dark); }
      x += Math.cos(a) * 7; y += Math.sin(a) * 4; a += (R7(i, 10 + s) - 0.5) * 0.6;
    }
  }
  // пятна крови: центр, брызги, мазок
  for (let i = 0; i < Math.round(rx / 28); i++) {
    const bx = cx + (R7(i, 20) - 0.5) * rx * 1.5, by = cy + (R7(i, 21) - 0.5) * ry * 1.4;
    if (!inside(bx, by, 0.85)) continue;
    const r0 = 2 + R7(i, 22) * 4;
    for (let j = 0; j < 40; j++) { const a = R7(i * 50 + j, 23) * 6.28, d = Math.pow(R7(i * 50 + j, 24), 1.6) * r0 * 2.2; bg.set(bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.6, mix(th.blood, shade(th.blood, 0.7), R7(j, 25))); }
    bg.ellipse(bx, by, r0, r0 * 0.6, [...th.blood.slice(0, 3), 200] as RGBA);
    if (R7(i, 26) > 0.5) { const a = R7(i, 27) * 6.28; for (let d = r0; d < r0 + 10; d++) bg.set(bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.5, [...th.blood.slice(0, 3), 150] as RGBA); }
  }
  // мусор: камешки, осколки, кости, обломки стрел
  for (let i = 0; i < Math.round(rx * 0.9); i++) {
    const x = cx + (R7(i, 30) - 0.5) * rx * 2, y = cy + (R7(i, 31) - 0.5) * ry * 2;
    if (!inside(x, y, 0.95)) continue;
    const t = R7(i, 32);
    if (t < 0.55) bg.set(x, y, mix(pick(th.sand, 0.1), [0, 0, 0, 255], 0.3));
    else if (t < 0.8) { bg.set(x, y, shade(pick(th.sand, 0.95), 1.2)); bg.set(x + 1, y, shade(pick(th.sand, 0.9), 1.1)); }
    else if (t < 0.92) { bg.rect(x, y, 3, 1, [225, 218, 200, 255]); bg.set(x - 1, y - 1, [225, 218, 200, 255]); bg.set(x + 3, y + 1, [225, 218, 200, 255]); }
    else { bg.rect(x, y, 4, 1, [110, 80, 50, 255]); bg.set(x + 4, y, [200, 200, 210, 255]); }
  }
  // оружие и щиты у стены
  const props: Placed[] = [], coverArr: Placed[] = [];
  const at = (a: number, e: number) => ({ x: cx + e * Math.cos(a), y: cy + (e * Math.sin(a)) / k });
  const rimE = (a: number) => e0of(Math.max(0, -Math.sin(a))) + sp.rings * sp.ringW;
  const prop = (kind: string, im: PC, x: number, y: number, ax = 0.5, ay = 1) => props.push({ kind, img: im, x: Math.round(x - im.w * ax), y: Math.round(y - im.h * ay) });
  for (let i = 0; i < 26; i++) {
    const a = rad(R7(i, 40) * 360), p = at(a, rx - 6 - R7(i, 41) * 10);
    if (Math.abs(Math.cos(a)) > 0.93) continue; // у ворот чисто
    prop("weapon", weapon(Math.floor(R7(i, 42) * 4), th), p.x, p.y + 2, 0.5, 1);
  }
  // ---------- декор верхнего края ----------
  const addDeco = (kind: string, im: PC, a: number, e: number, dy = 0, ay = 1) => { const p = at(a, e); prop(kind, im, p.x, p.y + dy, 0.5, ay); };
  if (th.id === "ash") {
    prop("box", royalBox(th), cx, cy - (e0of(1) + 6.2 * sp.ringW) / k + 14);
    for (let d = 200; d <= 340; d += 10) { const a = rad(d); if (Math.abs(d - 270) < 14) continue; addDeco("brazier", brazier(), a, rimE(a) + 8); }
    for (let d = 165; d <= 375; d += 15) { const a = rad(d); if (Math.abs(d - 270) < 28) continue; addDeco("banner", banner(th, 40 + 6 * (Math.floor(d / 15) % 2)), a, rimE(a) + 2, -2, 0); }
  } else if (th.id === "sun") {
    for (let d = 190; d <= 350; d += 10) { const a = rad(d); addDeco("column", column(10, 44, th, false, d), a, rimE(a) + 6, 2); }
    for (let d = 190; d < 350; d += 10) {
      const a = rad(d), a2 = rad(d + 10), p = at(a, rimE(a) + 6), q = at(a2, rimE(a2) + 6), wd = Math.abs(q.x - p.x);
      if (wd > 8) prop("arch", archSpan(th, Math.round(wd + 2), 13), Math.min(p.x, q.x) - 1, Math.min(p.y, q.y) - 38, 0, 0);
    }
    for (let d = 200; d <= 340; d += 20) { const a = rad(d + 5); addDeco("banner", banner(th, 34), a, rimE(a) + 3, -30, 0); }
    for (let d = 0; d < 360; d += 36) { const a = rad(d + 18); if (Math.sin(a) > 0.5) continue; addDeco("statue", statue(th), a, rx + WT / 2 + 3, 1); }
    for (const d of [248, 270, 292]) addDeco("passage", gate(th, 30, 30, "plain"), rad(d), rx + 3, 12);
  } else if (th.id === "pit") {
    for (let d = 190; d <= 350; d += 14) { const a = rad(d); addDeco("brazier", brazier(), a, rimE(a) + 4, 4); }
    for (let d = 0; d < 360; d += 12) {
      const a = rad(d); if (Math.sin(a) > 0.2) continue;
      const post = new PC(5, 14); post.rect(1, 0, 3, 14, H("#4a3220")); post.rect(1, 0, 1, 14, H("#7a5434")); post.rect(0, 0, 5, 2, H("#8a6440"));
      addDeco("post", post, a, rx + 2, 3);
    }
    for (let d = 200; d <= 340; d += 35) {
      const a = rad(d), sk = new PC(8, 8); sk.rect(1, 1, 6, 5, H("#e0d4b8")); sk.rect(2, 3, 1, 2, H("#1a1410")); sk.rect(5, 3, 1, 2, H("#1a1410")); sk.rect(2, 6, 4, 1, H("#cbbf9f"));
      addDeco("skull", sk, a, rimE(a) + 4, -14, 0.5);
    }
  } else {
    for (let d = 185; d <= 355; d += 9) { const a = rad(d); addDeco("crystal", crystal(16 + Math.floor(R7(d, 50) * 14), d), a, rimE(a) + 6, 4); }
    for (let d = 200; d <= 340; d += 28) { const a = rad(d); addDeco("brazier", brazier(true), a, rimE(a) + 2, 4); }
    for (let d = 0; d < 360; d += 18) { const a = rad(d); if (Math.sin(a) > 0.1) continue; addDeco("crystal", crystal(9, d + 1), a, rx + 2, 3); }
    for (let d = 190; d <= 350; d += 40) { const a = rad(d + 6), p = at(a, rimE(a) + 3), fl = banner({ ...th, accent: H("#3a6a98") }, 30); prop("banner", fl, p.x, p.y - 2, 0.5, 0); }
  }
  for (const sg of [-1, 1]) {
    const p = at(sg < 0 ? Math.PI : 0, rx + 2), g = th.id === "pit" ? pitGate() : th.id === "frost" ? icegate() : gate(th, 46, 46, th.id === "ash" ? "bars" : "doors");
    prop("gate", g, p.x + sg * 5, p.y - 2);
  }
  // ---------- зрители (отдельным слоем: Blitter в клиенте), не заходят под декор ----------
  const blockers = props.filter((p) => ["box", "banner", "brazier", "statue", "passage", "column", "crystal", "gate", "post"].includes(p.kind));
  const spectators: Spectator[] = [];
  for (let r = 0; r < sp.rings; r++) {
    const em = rx + 30 + r * sp.ringW + 12, n = Math.floor((Math.PI * 2 * em) / sp.spacing);
    for (let i = 0; i < n; i++) {
      const a = ((i + hash01(i, r, seed) * 0.6) / n) * Math.PI * 2 - Math.PI;
      if (hash01(i, r, seed + 5) > sp.fill) continue;
      const far = Math.max(0, -Math.sin(a)), fr = 0.2 + 0.32 * far, e = e0of(far) + (r + fr + (1 - fr) * 0.58) * sp.ringW;
      if (aisle(a, e) < 6) continue;
      const p = at(a, e), x = Math.round(p.x), y = Math.round(p.y);
      if (blockers.some((b) => x > b.x - 3 && x < b.x + b.img.w + 3 && y > b.y + 6 && y < b.y + b.img.h + 8 && b.kind !== "brazier" && b.kind !== "crystal" && b.kind !== "post")) continue;
      spectators.push({ x, y, type: Math.floor(hash01(i, r, seed + 1) * CROWD_TYPES), ring: r, ang: a });
    }
  }
  spectators.sort((p, q) => p.y - q.y);
  // ---------- укрытия ----------
  const pit = th.id === "pit", ice = th.id === "frost";
  const cv = column(pit ? 16 : ice ? 18 : 14, pit ? 22 : ice ? 24 : 36, th, th.id !== "sun", 5);
  for (const [dx, dy] of V.cover) coverArr.push({ kind: "cover", img: cv, x: Math.round(cx + dx - cv.w / 2), y: Math.round(cy + dy + 4 - cv.h) });
  const back = (p: Placed) => (p.kind === "box" || p.kind === "banner" ? 0 : p.kind === "weapon" ? 1 : 2);
  props.sort((p, q) => back(p) - back(q) || p.y + p.img.h - (q.y + q.img.h));
  for (const p of props) bg.blit(p.img, p.x, p.y);
  bg.map((c, x, y) => { const v = Math.min(1, Math.hypot((x - cx) / (W / 2), (y - cy) / (Hh / 2))); return shade(c, 1 - Math.max(0, v - 0.82) * 1.2); });
  // полная картинка для превью: фон + зрители (сидя/стоя) + укрытия
  const img = bg.clone();
  for (const s of spectators) drawSpectator(img, s.x, s.y, lookOfType(s.type), sp.id, hash01(s.x, s.y, seed) < sp.standing ? 1 : 0);
  for (const c of coverArr) img.blit(c.img, c.x, c.y);
  return { bg, img, spectators, props, cover: coverArr, coverImg: cv, cx, cy, spec: sp, theme: th, w: W, h: Hh, rx, ry };
}
