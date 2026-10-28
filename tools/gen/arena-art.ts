/** Арт арен PvP (запекается кодом): «Пепельный колизей» и «Солнечный амфитеатр» (2×2), «Бойцовская яма» и «Ледяной круг» (1×1). */
import { PC, hex, mix, shade, hash01, pnoise, type RGBA } from "./canvas";
import { drawSpectator, CROWD_TYPES, lookOfType, type ArenaId } from "../../shared/arenaCrowd";
import { ARENA_VARIANTS, arenaSpawn, TEAM_SIZE } from "../../shared/arena";
import { box3d, cylinder, coverSprite, gatehouse, GATEHOUSE_ROOF, pine, cypress, mountain, rock, tent, logPost, watchtower, spire, campfire, scalePC, haze, flipX, snowTop } from "./arena-sprites";
import { LOOKS } from "./walls141-lib";
import { buildingsFor } from "./walls141-buildings";
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
    sand: R("#4c3622", "#6c4c30", "#8c6a42", "#aa8850", "#c8a462"), stain: H("#3a1a16"), blood: H("#6a1414"), outer: H("#241820"),
  },
  sun: {
    id: "sun", name: "Солнечный амфитеатр",
    top: R("#b9b3a5", "#c9c3b4", "#d8d3c5", "#e8e4d8"), riser: R("#7f7f8c", "#8f8f9b", "#a0a0ab", "#b2b2bb"),
    cap: R("#d4cfc0", "#e2ddd0", "#f0ece0", "#fbf8ee"), face: R("#8d8d99", "#a2a2ad", "#b8b8c0"),
    trim: H("#e0b64a"), accent: H("#2f5fb0"), accent2: H("#f0cc5a"),
    sand: R("#bf9f60", "#d2b57a", "#e2c78e", "#f0dca6", "#fff0c4"), stain: H("#a88a50"), blood: H("#9a3a2a"), outer: H("#c9b48c"),
  },
  pit: {
    id: "pit", name: "Бойцовская яма",
    top: R("#8a5a30", "#9c6c3a", "#b07c46", "#c8925a"), riser: R("#2e1a0c", "#3e2412", "#52301a", "#683e22"),
    cap: R("#7a5030", "#946440", "#b07c4e", "#d09c64"), face: R("#2a160a", "#3a2010", "#4c2c18"),
    trim: H("#e8a23a"), accent: H("#c8402a"), accent2: H("#ffc060"),
    sand: R("#4a2818", "#6c3a20", "#8e4c2a", "#ac6234", "#c88040"), stain: H("#2e140c"), blood: H("#5a0e0e"), outer: H("#2a3622"),
  },
  frost: {
    id: "frost", name: "Ледяной круг",
    top: R("#c4dcf2", "#d8eafa", "#ecf6ff", "#ffffff"), riser: R("#2a5a92", "#3a74b0", "#4e8ecc", "#6aaae2"),
    cap: R("#5a94c8", "#78b0e0", "#9ccaf0", "#d0eaff"), face: R("#1e467a", "#2a5c96", "#3874b0"),
    trim: H("#9ae0ff"), accent: H("#3a8ad8"), accent2: H("#d8f4ff"),
    sand: R("#6a90b8", "#88aed0", "#a8c8e4", "#c8dff2", "#eef8ff"), stain: H("#4a6e98"), blood: H("#9a1818"), outer: H("#e6eef8"),
  },
};

export interface Spec {
  id: ArenaId; rings: number; ringW: number; wallH: number; spacing: number; fill: number; aisles: number; seed: number; standing: number;
}
export const SPECS: Spec[] = [
  { id: "ash", rings: 10, ringW: 21, wallH: 30, spacing: 11, fill: 0.8, aisles: 16, seed: 1, standing: 0.1 },
  { id: "sun", rings: 10, ringW: 21, wallH: 30, spacing: 11, fill: 0.8, aisles: 12, seed: 2, standing: 0.1 },
  { id: "pit", rings: 7, ringW: 20, wallH: 24, spacing: 11, fill: 0.88, aisles: 0, seed: 3, standing: 0.7 },
  { id: "frost", rings: 6, ringW: 22, wallH: 26, spacing: 11, fill: 0.88, aisles: 0, seed: 4, standing: 0.5 },
];

/** Зритель: type — вид из CROWD_TYPES; ang — угол по кругу (для волны оваций), ring — ряд. */
export interface Spectator { x: number; y: number; type: number; ring: number; ang: number }
export interface Placed { kind: string; x: number; y: number; img: PC }
export interface ArenaArt { bg: PC; img: PC; spectators: Spectator[]; props: Placed[]; cover: Placed[]; coverA: PC; coverB: PC; lights: { x: number; y: number; r: number; col: [number, number, number]; a: number; glow: number }[]; banners: { x: number; y: number; len: number }[]; cx: number; cy: number; spec: Spec; theme: Theme; w: number; h: number; rx: number; ry: number }

function stoneOf(th: Theme) {
  return th.id === "ash" ? R("#241f2a", "#352f3c", "#4a4352", "#6a6072") : th.id === "sun" ? R("#a9a9b4", "#c6c2b6", "#e0dccd", "#f6f2e6") : th.id === "frost" ? R("#5a7ea0", "#86b0d0", "#b4d8ee", "#e4f6ff") : R("#3a3026", "#524434", "#6c5a44", "#8a7458");
}
/** Колонна колоннады: цилиндр со светом слева и тенью справа, база и капитель шире ствола, тень вправо-вниз. */
export function column(w: number, h: number, th: Theme, broken: boolean, seed: number): PC {
  const pc = new PC(w + 22, h + 10), st = stoneOf(th), x0 = 7, base = h + 4;
  pc.poly([[x0 - 3, base], [x0 + w + 3, base], [x0 + w + 20, base + 4], [x0 + 14, base + 4]], [0, 0, 0, 80]);
  box3d(pc, x0 - 3, base - 5, w + 6, 5, 3, st[3], st[2], st[1], seed);
  cylinder(pc, x0, w, broken ? 14 : 8, base - 5, st, 3, seed, 0);
  if (!broken) { box3d(pc, x0 - 3, 2, w + 6, 6, 3, st[3], st[2], st[1], seed + 1); if (th.id === "sun") pc.rect(x0 - 3, 6, w + 6, 1, th.trim); if (th.id === "ash") pc.rect(x0, 9, w, 1, th.accent); }
  pc.outline(shade(st[0], 0.5), true);
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

/** Южные ворота — вомиторий в ближних рядах (вид сверху-спереди): парапеты по бокам, пол прохода (песок заметает вход),
 * тень левого парапета, тёмный провал под трибуны и кромка свода с замковым камнем. Ряды обрываются ровно. */
function vomitorium(bg: PC, th: Theme, cx: number, hw: number, y0: number, y1: number) {
  const wood = th.id === "pit", st = stoneOf(th), cap = th.cap, out = shade(th.face[0], 0.55), x0 = Math.round(cx - hw);
  const deep: RGBA = th.id === "ash" ? H("#08040a") : th.id === "frost" ? H("#081a36") : wood ? H("#0a0604") : H("#1a1822");
  const logs = R("#3e2414", "#6a4226", "#9a6a3a", "#c8965a");
  const PW = 6, bandH = 7, W2 = hw * 2, trim = th.id === "ash" ? th.accent : th.trim;
  for (let y = y0; y < y1; y++) for (let i = 0; i < W2; i++) {
    const x = x0 + i, u = i + 0.5 - hw, au = Math.abs(u), left = u < 0;
    let c: RGBA;
    if (au > hw - PW) { // парапет: верхняя грань, швы, наружный контур и кромка над проёмом
      const j = Math.floor(hw - au); // 0 — наружный край, PW-1 — внутренний
      if (wood) { c = logs[left ? [1, 3, 2, 2, 1, 0][j] : [1, 2, 2, 1, 1, 0][j]]; if ((y - y0) % 11 === 10) c = logs[0]; }
      else { c = cap[left ? 2 : 1]; if (j === 1) c = cap[3]; if ((y - y0) % 7 === 6) c = shade(c, 0.82); if (j === PW - 2) c = trim; }
      if (y === y0) c = wood ? logs[3] : cap[3];
      if (j === 0 || j === PW - 1) c = out;
    } else {
      const bandTop = y1 - bandH - Math.round(4 * (1 - (u / (hw - PW)) ** 2)); // свод: замок выше пят
      if (y >= bandTop) { // кромка свода сверху: клинья, замковый камень, нижний край в тени ряда
        const seg = Math.floor((i - PW) / 4), key = au < 2.6;
        c = wood ? logs[seg % 2 ? 2 : 1] : key ? cap[3] : cap[seg % 2 ? 2 : 1];
        if (!wood && (i - PW) % 4 === 0 && !key) c = shade(c, 0.7);
        if (!key) c = shade(c, left ? 1.04 : 0.92);
        if (y === bandTop) c = wood ? logs[3] : shade(cap[3], 1.08);
        if (y === bandTop + 1 && !wood) c = trim;
        if (y >= y1 - 1) c = out;
      } else { // пол прохода и провал под трибуны
        const t = (y - y0) / Math.max(1, bandTop - y0), fy = Math.floor((y - y0) / 9);
        let fl = mix(st[2], st[1], hash01(Math.floor((i + fy * 6) / 13), fy, 7) * 0.5);
        if (wood) fl = mix(th.sand[1], logs[1], 0.4);
        if ((y - y0) % 9 === 8 || (i + fy * 6) % 13 === 0) fl = shade(fl, 0.88);
        const drift = pnoise(x, y, 6, 2048, 33) * 0.6 + (1 - t) * 0.9;
        if (drift > 0.75) fl = mix(fl, pick(th.sand, 0.4 + hash01(x, y, 9) * 0.3), Math.min(1, (drift - 0.75) * 3)); // песок заметает вход
        c = mix(fl, deep, Math.min(1, Math.pow(Math.max(0, (t - 0.12) / 0.75), 1.1)));
        if (y >= bandTop - 3) c = deep; // провал под свод
        if (u < -(hw - PW) + 4) c = mix(c, deep, 0.45 * (1 - (u + hw - PW) / 4)); // тень левого парапета
        if (u > hw - PW - 1.5) c = shade(c, 1.12); // отсвет у правой стенки
      }
    }
    bg.set(x, y, c);
  }
  for (let y = y0; y < y1; y++) { bg.set(x0 - 1, y, out); bg.set(x0 + W2, y, out); }
  for (let y = y0 + 1; y < y1; y++) for (let k = 1; k <= 3; k++) { const c = bg.get(x0 + W2 + k, y); if (c) bg.set(x0 + W2 + k, y, shade(c, 0.7 + k * 0.08)); } // тень парапета на ряды справа
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
      const t = 0.5 + (pnoise(x, y, 64, 2048, seed) - 0.5) * 0.8 + (pnoise(x, y, 16, 2048, seed + 1) - 0.5) * 0.18 + (nz - 0.5) * 0.2;
      c = pick(th.sand, Math.min(0.999, Math.max(0, t)));
      { const sn = pnoise(x, y, 64, 2048, seed + 2), k2 = Math.max(0, (sn - (th.id === "ash" ? 0.6 : th.id === "pit" ? 0.58 : 0.66)) / 0.22); if (k2 > 0) c = mix(c, th.stain, Math.min(0.38, k2 * 0.4)); }
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
          const gn = pnoise(x, y, 16, 2048, seed + 9);
          c = mix(shade(th.outer, 0.78), shade(th.outer, 1.14), gn);
          if ((th.id === "ash" || th.id === "sun") && (x % 9 === 0 || y % 7 === 0)) c = shade(c, 0.86);
          if (th.id === "frost" && nz > 0.96) c = [255, 255, 255, 255];
          if (th.id === "pit" && gn > 0.55 && nz > 0.5) c = mix(c, [60, 90, 40, 255], 0.35);
        }
      } else {
        const fr = 0.2 + 0.32 * far, ad = aisle(ang, e), aLeft = sp.aisles > 0 && frac((ang / (Math.PI * 2)) * sp.aisles) < 0.5;
        if (ph < fr) {
          c = shade(pick(th.riser, 0.15 + 0.6 * (ph / fr) + (nz - 0.5) * 0.12), side * (0.85 + 0.15 * Math.abs(cs)));
          if (frac(arc / 13) < 0.07) c = shade(c, 0.78);
          if (ad < 4.5) c = ad > 3 ? (aLeft ? pick(th.top, 0.9) : shade(pick(th.riser, 0.2), 0.7)) : shade(pick(th.top, 0.55), 0.7);
        } else {
          const pp = (ph - fr) / (1 - fr);
          c = shade(pick(th.top, 0.25 + 0.45 * (1 - pp * 0.5) + (nz - 0.5) * 0.14), 1 + 0.06 * cs);
          if (pp < 0.12) c = pick(th.top, 0.95); // освещённая кромка ступени
          else if (pp < 0.24) c = shade(c, 0.9); // тень от подступенка
          if (pp > 0.7) c = shade(c, 1 - ((pp - 0.7) / 0.3) * 0.32); // тень от ряда выше
          if (frac(arc / 17) < 0.05) c = shade(c, 0.82);
          if (th.id === "frost" && nz > 0.9) c = [250, 252, 255, 255]; // снег на ступенях
          if (ad < 4.5) c = ad > 3 ? (aLeft ? pick(th.top, 0.98) : shade(pick(th.riser, 0.3), 0.8)) : pp < 0.14 ? pick(th.top, 0.98) : pick(th.top, 0.8 - pp * 0.25); // проход: ступени между стенками
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
  for (const team of [1, 2]) for (let sl = 0; sl < TEAM_SIZE[V.mode]; sl++) { const q = arenaSpawn(team, sl, sp.id); for (let i = 0; i < 360; i++) { const t = rad(i); bg.set(q.x + Math.cos(t) * 20, q.y + 4 + Math.sin(t) * 12, [235, 228, 210, 70]); } }
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
  // ---------- панорама за трибунами: небо, горизонт, город / горы / лес ----------
  const rimOut = (far: number) => e0of(far) + sp.rings * sp.ringW + 9 + 14 * far;
  const isOuter = (x: number, y: number, pad = 0) => { const sy = (y - cy) * k, e = Math.hypot(x - cx, sy); return e > rimOut(Math.max(0, -sy / (e || 1))) + pad; };
  const H0 = Math.round(Hh * 0.09);
  const skyStops: Record<string, RGBA[]> = {
    ash: R("#1a0a16", "#5a1c24", "#c8502e", "#f09a52"), sun: R("#5a90e0", "#8cbcf0", "#c8e4ff", "#f4f8ff"),
    pit: R("#0c1620", "#1e3a3a", "#8a5a38", "#e0a050"), frost: R("#6a88c8", "#a8b8e0", "#e8d4e8", "#fff0e8"),
  };
  const stops = skyStops[th.id];
  for (let y = 0; y < H0 + 14; y++) {
    const t = Math.min(1, y / (H0 + 8)) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)), c = mix(stops[i], stops[i + 1], t - i);
    for (let x = 0; x < W; x++) if (isOuter(x, y, 2)) bg.set(x, y, shade(c, 0.97 + hash01(x, y, 5) * 0.06));
  }
  const rr = (n: number, a = 0) => hash01(n, seed + 11, a);
  if (th.id !== "pit") for (let i = 0; i < 14; i++) {
    const x = rr(i, 90) * W, y = 6 + rr(i, 91) * (H0 - 14), cl: RGBA = th.id === "ash" ? [60, 20, 30, 150] : [255, 255, 255, th.id === "sun" ? 170 : 120];
    for (let j = 0; j < 5; j++) { const ex = x + (j - 2) * 12 + rr(i * 9 + j, 92) * 6, ey = y + rr(i * 9 + j, 93) * 4; if (isOuter(ex, ey, 2)) bg.ellipse(ex, ey, 11 + rr(j, 94) * 8, 3 + rr(j, 95) * 3, cl); }
  }
  const occ = new Set<number>();
  const farL: Placed[] = [], nearL: Placed[] = [];
  const tryPlace = (list: Placed[], im: PC, x: number, y: number, pad = 6): boolean => {
    if (x < 0 || x > W || y < H0 - 20 || y > Hh + 4) return false;
    const w = im.w, h = im.h;
    for (const [px, py] of [[x - w / 2, y], [x + w / 2, y], [x, y], [x - w / 2, y - h], [x + w / 2, y - h], [x, y - h], [x - w / 2, y - h / 2], [x + w / 2, y - h / 2]]) if (!isOuter(px, py, pad)) return false;
    const x0 = Math.floor((x - w / 2) / 10), x1 = Math.floor((x + w / 2) / 10), yy = Math.floor(y / 8);
    for (let i = x0; i <= x1; i++) if (occ.has(i * 4000 + yy) || occ.has(i * 4000 + yy - 1)) return false;
    for (let i = x0; i <= x1; i++) { occ.add(i * 4000 + yy); occ.add(i * 4000 + yy - 1); }
    list.push({ kind: "pano", img: im, x: Math.round(x - w / 2), y: Math.round(y - h) });
    return true;
  };
  const lights: { x: number; y: number; r: number; col: [number, number, number]; a: number; glow: number }[] = [];
  const banners: { x: number; y: number; len: number }[] = [];
  const outerY = (n: number, a: number, min = 40) => H0 + min + rr(n, a) * (Hh - H0 - min);
  const orange: RGBA = H("#ffb050");
  // здания — из каталога городов (walls141-buildings: фасад, боковая стена в тени, двухплоскостная кровля с черепицей, окна, тень);
  // дальние меньше, бледнее и холоднее (воздушная перспектива), ближние крупнее и контрастнее
  const fog: Record<string, RGBA> = { ash: H("#8a3a34"), sun: H("#bcd4f0"), pit: H("#7a6a48"), frost: H("#c4d4ec") };
  const depthK = (y: number) => Math.max(0, Math.min(1, (y - H0) / (Hh * 0.5)));
  const scaleAt = (y: number) => { const t = depthK(y); return t < 0.22 ? 0.36 : t < 0.45 ? 0.46 : t < 0.7 ? 0.58 : 0.7; };
  const cache = new Map<string, PC>();
  const bTypes: { img: PC; big: boolean }[] = [];
  const addTypes = (look: string, keys: string[], big: string[], seeds: number[], post?: (p: PC) => PC) => {
    for (const key of keys) for (const sd of seeds) { let im = buildingsFor(LOOKS[look])[key]("clean", sd); if (post) im = post(im); bTypes.push({ img: im, big: big.includes(key) }); }
  };
  const bSprite = (idx: number, y: number, flip: boolean) => {
    const sc = scaleAt(y), hz = Math.round((1 - depthK(y)) * 5), key = `${idx}|${sc}|${hz}|${flip ? 1 : 0}`;
    let im = cache.get(key);
    if (!im) {
      im = scalePC(bTypes[idx].img, sc * (bTypes[idx].big ? 1.0 : 1));
      if (flip) im = flipX(im);
      im = haze(im, fog[th.id], 0.05 + (hz / 5) * 0.34);
      if (th.id === "ash") im = haze(im, H("#1a0c18"), 0.28); // закат: здания в тени
      cache.set(key, im);
    }
    return im;
  };
  const fillBuildings = (n: number, bigMax = 0.45) => {
    for (let i = 0; i < n; i++) {
      const y = outerY(i, 10), idx = Math.floor(rr(i, 6) * bTypes.length);
      if (bTypes[idx].big && depthK(y) > bigMax) continue;
      tryPlace(nearL, bSprite(idx, y, rr(i, 8) > 0.5), rr(i, 9) * W, y);
    }
  };
  if (th.id === "ash") {
    addTypes("umb_capital", ["house", "house_hip", "shop", "temple", "ziggurat"], ["temple", "ziggurat"], [1, 2]);
    fillBuildings(2600);
  } else if (th.id === "sun") {
    const cy2 = R("#14301a", "#24502a", "#3c7a3a", "#5aa04c");
    addTypes("sol_capital", ["house", "house_hip", "shop", "temple", "church"], ["temple", "church"], [1, 2]);
    fillBuildings(2600);
    for (let i = 0; i < 300; i++) tryPlace(nearL, haze(cypress(20 + Math.floor(rr(i, 15) * 16), cy2), fog.sun, 0.1 + (1 - depthK(outerY(i, 17, 20))) * 0.25), rr(i, 16) * W, outerY(i, 17, 20));
  } else if (th.id === "frost") {
    const mt = [R("#3a4e76", "#526a94", "#7690bc", "#98b0d4"), R("#4a6088", "#6680aa", "#88a4cc", "#b0c8e4")];
    for (let i = 0; i < 40; i++) tryPlace(farL, haze(mountain(140 + Math.floor(rr(i, 1) * 140), 60 + Math.floor(rr(i, 2) * 60), mt[i % 2], true, i), fog.frost, 0.25), rr(i, 4) * W, H0 + 14 + rr(i, 5) * 24, 2);
    const fir = R("#0e2418", "#1a4430", "#2a6a46", "#3c8a5c"), rk = R("#1c2838", "#364862", "#566c8c", "#8aa2c2");
    addTypes("sol_settle", ["hut", "hut_wide", "shed_shop"], [], [1, 2], (p) => snowTop(p, 0.52));
    fillBuildings(260);
    for (let i = 0; i < 280; i++) tryPlace(nearL, rock(20 + Math.floor(rr(i, 6) * 34), 16 + Math.floor(rr(i, 7) * 24), rk, true, i), rr(i, 9) * W, outerY(i, 10, 30));
    for (let i = 0; i < 760; i++) { const y = outerY(i, 13, 20), sc = 0.8 + depthK(y) * 0.5; tryPlace(nearL, haze(pine(Math.round((24 + rr(i, 11) * 26) * sc), true, fir, i), fog.frost, (1 - depthK(y)) * 0.28), rr(i, 12) * W, y); }
    for (let i = 0; i < 50; i++) tryPlace(nearL, spire(24 + Math.floor(rr(i, 14) * 30), R("#2a5a92", "#4e8ecc", "#8ac8f0", "#e8fcff")), rr(i, 15) * W, outerY(i, 16, 30));
  } else {
    const pn = R("#0c1e12", "#16341a", "#245226", "#366e34"), pn2 = R("#12281a", "#1e481c", "#34702e", "#4a8e40");
    for (let i = 0; i < 90; i++) tryPlace(farL, haze(pine(30 + Math.floor(rr(i, 1) * 16), false, pn, i), fog.pit, 0.3), rr(i, 4) * W, H0 + 12 + rr(i, 5) * 22, 2);
    tryPlace(nearL, watchtower(), cx - 330, 124); tryPlace(nearL, watchtower(), cx + 330, 124);
    addTypes("umb_settle", ["hut", "hut_wide", "shed_shop"], [], [1, 2]);
    fillBuildings(120);
    const tc = [[H("#c8402a"), H("#e8d8b0")], [H("#2f6a8a"), H("#e8d8b0")], [H("#8a6a2a"), H("#c8a050")]];
    for (let i = 0; i < 70; i++) tryPlace(nearL, tent(28 + Math.floor(rr(i, 6) * 12), 24 + Math.floor(rr(i, 7) * 10), tc[i % 3][0], tc[i % 3][1]), rr(i, 9) * W, outerY(i, 10, 40));
    for (let i = 0; i < 900; i++) { const y = outerY(i, 13, 20), sc = 0.8 + depthK(y) * 0.5; tryPlace(nearL, haze(pine(Math.round((24 + rr(i, 11) * 30) * sc), false, i % 2 ? pn : pn2, i), fog.pit, (1 - depthK(y)) * 0.25), rr(i, 12) * W, y); }
    for (let i = 0; i < 40; i++) { const f = campfire(); if (tryPlace(nearL, f, rr(i, 20) * W, outerY(i, 21, 50))) { const q = nearL[nearL.length - 1]; lights.push({ x: q.x + 8, y: q.y + 8, r: 55, col: [255, 140, 50], a: 0.6, glow: 1 }); } }
    // частокол лагеря по кругу
    for (let d = 0; d < 360; d += 1.6) { const a = rad(d); if (Math.sin(a) > 0.8) continue; const p = at(a, rimOut(Math.max(0, -Math.sin(a))) + 9); nearL.push({ kind: "log", img: logPost(14 + Math.floor(rr(d * 10, 30) * 5), d), x: Math.round(p.x - 3), y: Math.round(p.y - 14) }); }
  }
  farL.sort((p, q) => p.y + p.img.h - (q.y + q.img.h));
  nearL.sort((p, q) => p.y + p.img.h - (q.y + q.img.h));
  for (const p of farL) bg.blit(p.img, p.x, p.y);
  if (th.id === "ash" || th.id === "sun") for (let y = H0 - 4; y < H0 + 34; y++) for (let x = 0; x < W; x++) { const c = bg.get(x, y); if (c && isOuter(x, y, 2)) bg.set(x, y, mix(c, th.id === "ash" ? [200, 90, 50, 255] : [220, 235, 255, 255], 0.14 * (1 - Math.abs(y - H0) / 34))); } // дымка у горизонта
  for (const p of nearL) bg.blit(p.img, p.x, p.y);
  for (let i = 0; i < 26; i++) {
    const a = rad(R7(i, 40) * 360), p = at(a, rx - 6 - R7(i, 41) * 10);
    if (Math.abs(Math.sin(a)) > 0.93) continue; // у ворот чисто
    prop("weapon", weapon(Math.floor(R7(i, 42) * 4), th), p.x, p.y + 2, 0.5, 1);
  }
  // ---------- декор верхнего края ----------
  const addDeco = (kind: string, im: PC, a: number, e: number, dy = 0, ay = 1) => { const p = at(a, e); prop(kind, im, p.x, p.y + dy, 0.5, ay); };
  const addBrazier = (a: number, e: number, dy = 0, blue = false) => { const p = at(a, e); addDeco("brazier", brazier(blue), a, e, dy); lights.push({ x: p.x, y: p.y + dy - 20, r: 80, col: blue ? [110, 190, 255] : [255, 150, 60], a: 0.6, glow: 1 }); };
  const addBanner = (a: number, e: number, len: number, dy = -2) => { const p = at(a, e); banners.push({ x: Math.round(p.x), y: Math.round(p.y + dy), len }); };
  /** Фонарик на ярусе: маленький столбик, мягкий круг света на ступенях. */
  const lamp = (): PC => { const pc = new PC(5, 11); pc.rect(2, 3, 1, 8, H("#2a2218")); pc.rect(1, 0, 3, 4, H("#ffd27a")); pc.set(2, 1, H("#ffffff")); pc.outline(H("#2a2218")); return pc; };
  const barrel = (): PC => { const pc = new PC(11, 13); pc.rect(1, 1, 9, 11, H("#8a5a30")); pc.rect(1, 1, 3, 11, H("#b07c46")); pc.rect(7, 1, 3, 11, H("#5a3820")); pc.rect(1, 3, 9, 1, H("#2a2218")); pc.rect(1, 9, 9, 1, H("#2a2218")); pc.rect(1, 0, 9, 2, H("#c8965a")); pc.outline(H("#1c1008")); return pc; };
  const totem = (): PC => { const pc = new PC(15, 34); pc.rect(6, 6, 3, 28, H("#5a3820")); pc.rect(6, 6, 1, 28, H("#8a5a30")); pc.rect(4, 2, 7, 7, H("#e0d8c4")); pc.rect(5, 4, 2, 2, H("#14100a")); pc.rect(8, 4, 2, 2, H("#14100a")); pc.rect(0, 0, 4, 1, H("#d8d0bc")); pc.rect(1, 1, 1, 3, H("#d8d0bc")); pc.rect(11, 0, 4, 1, H("#d8d0bc")); pc.rect(13, 1, 1, 3, H("#d8d0bc")); pc.rect(3, 14, 9, 2, H("#3a8ad8")); pc.rect(3, 22, 9, 2, H("#c8402a")); pc.outline(H("#10100c")); return pc; };
  const midRing = (a: number, r: number) => { const far = Math.max(0, -Math.sin(a)); return e0of(far) + (r + 0.45) * sp.ringW; };
  if (th.id === "ash") {
    prop("box", royalBox(th), cx, cy - (e0of(1) + 6.2 * sp.ringW) / k + 14);
    for (let d = 200; d <= 340; d += 10) { const a = rad(d); if (Math.abs(d - 270) < 14) continue; addBrazier(a, rimE(a) + 8); }
    for (let d = 165; d <= 375; d += 15) { const a = rad(d); if (Math.abs(d - 270) < 28) continue; addBanner(a, rimE(a) + 2, 40 + 6 * (Math.floor(d / 15) % 2)); }
    for (let d = 196; d <= 344; d += 12) { const a = rad(d); const p = at(a, midRing(a, 5)); prop("lamp", lamp(), p.x, p.y + 2); lights.push({ x: p.x, y: p.y - 6, r: 36, col: [255, 170, 80], a: 0.3, glow: 0 }); }
  } else if (th.id === "sun") {
    for (let d = 190; d <= 350; d += 10) { const a = rad(d); addDeco("column", column(10, 44, th, false, d), a, rimE(a) + 6, 2); const p = at(a, rimE(a) + 6); if (d % 20 === 0) lights.push({ x: p.x, y: p.y - 40, r: 60, col: [255, 225, 130], a: 0.35, glow: 1 }); }
    for (let d = 190; d < 350; d += 10) {
      const a = rad(d), a2 = rad(d + 10), p = at(a, rimE(a) + 6), q = at(a2, rimE(a2) + 6), wd = Math.abs(q.x - p.x);
      if (wd > 8) prop("arch", archSpan(th, Math.round(wd + 2), 13), Math.min(p.x, q.x) - 1, Math.min(p.y, q.y) - 38, 0, 0);
    }
    for (let d = 200; d <= 340; d += 20) { const a = rad(d + 5); addBanner(a, rimE(a) + 3, 34, -30); }
    for (let d = 0; d < 360; d += 36) { const a = rad(d + 18); if (Math.sin(a) > 0.5) continue; addDeco("statue", statue(th), a, rx + WT / 2 + 3, 1); }
    for (const d of [236, 304]) addDeco("passage", gate(th, 30, 30, "plain"), rad(d), rx + 3, 12);
    for (let d = 200; d <= 340; d += 20) { const a = rad(d); const p = at(a, midRing(a, 5)); prop("lamp", lamp(), p.x, p.y + 2); }
  } else if (th.id === "pit") {
    for (let d = 170; d <= 370; d += 10) { const a = rad(d); addBrazier(a, rimE(a) + 4, 4); }
    for (const d of [212, 244, 296, 328]) { const a = rad(d); addBrazier(a, midRing(a, 4), 0); }
    for (let d = 0; d < 360; d += 10) {
      const a = rad(d); if (Math.sin(a) > 0.2 || Math.abs(d - 270) < 15) continue;
      const post = new PC(5, 14); post.rect(1, 0, 3, 14, H("#4a3220")); post.rect(1, 0, 1, 14, H("#7a5434")); post.rect(0, 0, 5, 2, H("#8a6440"));
      addDeco("post", post, a, rx + 2, 3);
    }
    for (let d = 190; d <= 350; d += 22) {
      const a = rad(d), sk = new PC(8, 8); sk.rect(1, 1, 6, 5, H("#e0d4b8")); sk.rect(2, 3, 1, 2, H("#1a1410")); sk.rect(5, 3, 1, 2, H("#1a1410")); sk.rect(2, 6, 4, 1, H("#cbbf9f"));
      addDeco("skull", sk, a, rimE(a) + 4, -14, 0.5);
    }
    for (let d = 180; d <= 360; d += 26) { const a = rad(d + 6); if (Math.abs(d + 6 - 270) < 14) continue; addBanner(a, rimE(a) + 3, 36); }
    for (let i = 0; i < 9; i++) { const a = rad(10 + i * 38 + rr(i, 70) * 14); if (Math.abs(Math.sin(a)) > 0.85 || Math.sin(a) > 0.2) continue; addDeco("barrel", barrel(), a, rx - 8, 0); }
    for (let d = 196; d <= 344; d += 12) { const a = rad(d); const p = at(a, midRing(a, 3)); prop("lamp", lamp(), p.x, p.y + 2); lights.push({ x: p.x, y: p.y - 6, r: 34, col: [255, 170, 80], a: 0.3, glow: 0 }); }
  } else {
    for (let d = 175; d <= 365; d += 8) { const a = rad(d); addDeco("crystal", crystal(16 + Math.floor(R7(d, 50) * 16), d), a, rimE(a) + 6, 4); }
    for (let d = 190; d <= 350; d += 20) { const a = rad(d); addBrazier(a, rimE(a) + 2, 4, d % 40 === 10); }
    for (let d = 0; d < 360; d += 14) { const a = rad(d); if (Math.sin(a) > 0.1 || Math.abs(d - 270) < 16) continue; addDeco("crystal", crystal(9, d + 1), a, rx + 2, 3); }
    for (let d = 186; d <= 354; d += 28) { const a = rad(d + 6); if (Math.abs(d + 6 - 270) < 14) continue; addBanner(a, rimE(a) + 3, 34); }
    for (const sg of [-1, 1]) for (const dd of [-1, 1]) { const p = at(sg < 0 ? Math.PI : 0, rx - 4); addDeco("totem", totem(), sg < 0 ? Math.PI : 0, rx - 4, dd * 34 + 8); void p; }
    for (let d = 198; d <= 342; d += 12) { const a = rad(d); const p = at(a, midRing(a, 3)); prop("lamp", lamp(), p.x, p.y + 2); lights.push({ x: p.x, y: p.y - 6, r: 34, col: [140, 200, 255], a: 0.3, glow: 0 }); }
  }
  // ворота (вид 3/4): северные — надвратная башня в дальней стене лицом к зрителю, проход вглубь; южные — проём-вомиторий
  // в ближних рядах: сверху видна кромка свода и тёмный провал под трибуны. Команды появляются у этих ворот (shared/arena.ts).
  const torchCol: [number, number, number] = th.id === "frost" ? [120, 190, 255] : [255, 150, 60];
  const nBase = Math.floor(cy - ry) + 3, gh = gatehouse(th.id), gx = Math.round(cx - 46), gy = nBase - (72 + GATEHOUSE_ROOF);
  props.push({ kind: "gate", img: gh, x: gx, y: gy });
  for (const tx of [-25, 24]) lights.push({ x: cx + tx, y: nBase - 36, r: 54, col: torchCol, a: 0.26, glow: 1 });
  for (let y = gy + 4; y < nBase; y++) for (let x = gx + 77; x < gx + 84; x++) { const c = bg.get(x, y); if (c) bg.set(x, y, shade(c, 0.62 + 0.38 * ((x - gx - 77) / 7))); } // тень башни на ряды справа
  const sHW = 24, sTop = Math.ceil(cy + ry - 0.5), sNr = sp.rings >= 10 ? 3 : 2, sEnd = Math.round(cy + (e0of(0) + sNr * sp.ringW) / k);
  vomitorium(bg, th, cx, sHW, sTop, sEnd);
  for (const s of [-1, 1]) { const bx = cx + s * (sHW - 2.5); prop("brazier", brazier(th.id === "frost"), bx, sTop + 5); lights.push({ x: bx, y: sTop - 15, r: 50, col: torchCol, a: 0.26, glow: 1 }); }
  const gateZones = [{ x0: gx + 12, x1: gx + 82, y0: gy - 2, y1: nBase + 4 }, { x0: cx - sHW - 6, x1: cx + sHW + 6, y0: sTop - 4, y1: sEnd + 14 }];
  // ---------- зрители (отдельным слоем: Blitter в клиенте), не заходят под декор ----------
  const blockers = [...props.filter((p) => ["box", "brazier", "statue", "passage", "column", "crystal", "gate", "post"].includes(p.kind)), ...banners.map((b) => ({ kind: "banner", x: b.x - 7, y: b.y, img: { w: 14, h: b.len } as PC }))];
  const spectators: Spectator[] = [];
  for (let r = 0; r < sp.rings; r++) {
    const em = rx + 30 + r * sp.ringW + 12, n = Math.floor((Math.PI * 2 * em) / sp.spacing);
    for (let i = 0; i < n; i++) {
      const a = ((i + hash01(i, r, seed) * 0.6) / n) * Math.PI * 2 - Math.PI;
      if (hash01(i, r, seed + 5) > sp.fill) continue;
      const far = Math.max(0, -Math.sin(a)), fr = 0.2 + 0.32 * far, e = e0of(far) + (r + fr + (1 - fr) * 0.58) * sp.ringW;
      if (aisle(a, e) < 7) continue;
      const p = at(a, e), x = Math.round(p.x), y = Math.round(p.y);
      if (gateZones.some((g) => x > g.x0 && x < g.x1 && y > g.y0 && y < g.y1)) continue;
      if (blockers.some((b) => x > b.x - 3 && x < b.x + b.img.w + 3 && y > b.y + 6 && y < b.y + b.img.h + 8 && b.kind !== "brazier" && b.kind !== "crystal" && b.kind !== "post")) continue;
      spectators.push({ x, y, type: Math.floor(hash01(i, r, seed + 1) * CROWD_TYPES), ring: r, ang: a });
    }
  }
  spectators.sort((p, q) => p.y - q.y);
  // ---------- укрытия: колонна / обломок статуи / глыба / ледяной столб (a — верхний ряд, b — нижний) ----------
  const coverA = coverSprite(th.id, "a"), coverB = coverSprite(th.id, "b");
  for (const [dx, dy] of V.cover) { const im = dy > 0 ? coverB : coverA; coverArr.push({ kind: "cover", img: im, x: Math.round(cx + dx - im.w / 2), y: Math.round(cy + dy + 4 - im.h) }); }
  const back = (p: Placed) => (p.kind === "box" ? 0 : p.kind === "weapon" ? 1 : 2);
  props.sort((p, q) => back(p) - back(q) || p.y + p.img.h - (q.y + q.img.h));
  for (const p of props) bg.blit(p.img, p.x, p.y);
  // тёплый свет жаровен, факелов и ворот на песке, ступенях и стенах (запечён; живые ореолы — в клиенте)
  for (const L of lights) {
    for (let y = Math.max(0, Math.floor(L.y - L.r)); y < Math.min(Hh, L.y + L.r); y++) for (let x = Math.max(0, Math.floor(L.x - L.r)); x < Math.min(W, L.x + L.r); x++) {
      const d = Math.hypot(x - L.x, (y - L.y) * 1.4) / L.r;
      if (d >= 1) continue;
      const f = Math.pow(1 - d, 2) * L.a, i = (y * W + x) * 4;
      if (bg.data[i + 3] === 0) continue;
      for (let c = 0; c < 3; c++) bg.data[i + c] = Math.min(255, bg.data[i + c] + L.col[c] * f * 0.5 + bg.data[i + c] * f * 0.3);
    }
  }
  if (th.id === "sun") for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { // лучи солнца наискосок по арене
    const e = Math.hypot(x - cx, (y - cy) * k);
    if (e > rx * 1.25) continue;
    const band = frac((x * 0.55 + y) / 240);
    if (band < 0.16) { const f = Math.sin((band / 0.16) * Math.PI) * 0.1, i = (y * W + x) * 4; for (let c = 0; c < 3; c++) bg.data[i + c] = Math.min(255, bg.data[i + c] + 255 * f * (c === 2 ? 0.55 : 1)); }
  }
  bg.map((c, x, y) => { const v = Math.min(1, Math.hypot((x - cx) / (W / 2), (y - cy) / (Hh / 2))); return shade(c, 1 - Math.max(0, v - 0.86) * 0.9); });
  // полная картинка для превью: фон + зрители (сидя/стоя) + укрытия
  const img = bg.clone();
  for (const s of spectators) drawSpectator(img, s.x, s.y, lookOfType(s.type), sp.id, hash01(s.x, s.y, seed) < sp.standing ? 1 : 0);
  for (const c of coverArr) img.blit(c.img, c.x, c.y);
  return { bg, img, spectators, props, cover: coverArr, coverA, coverB, lights, banners, cx, cy, spec: sp, theme: th, w: W, h: Hh, rx, ry };
}
