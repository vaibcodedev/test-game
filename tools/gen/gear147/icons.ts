/**
 * Иконки вещей 48×48 (вид 3/4, свет сверху-слева, маски ×2 со сведением, внутренний и внешний контур тёмным тоном материала).
 * Формы — по стилю вещи (параметры из data/gear147.json), герб на доспехе и плаще — подменяемый (sol / umb).
 * Запуск отдельно: npx tsx tools/gen/gear147/icons.ts [set] → tools/out/gear147/icons-<set>.png
 */
import path from "node:path";
import { PC } from "../canvas";
import { Cv, paint, hx, type C } from "../bosses139/mino_lib";
import { Mz, mixC, type PO, type V2 } from "../hero147/base_b";
import { GD, SLOTS, ramp, setOf, type CrestId, type Slot } from "./gear";
import { PARAM_STYLES, helmGeo, helmModel } from "./helm";
import { armorShape, bodyMat } from "./armorgeo";

/** маска с масштабом вокруг центра поля: формы рисуются в координатах 48×48, предмет вписывается в ~80 % (docs/icon-style.md, п. 8) */
let KS = 0.82; const CC = 24;
class SMz extends Mz {
  private f(p: V2): V2 { return [CC + (p[0] - CC) * KS, CC + (p[1] - CC) * KS]; }
  override seg(a: V2, b: V2, t0: number, t1 = t0) { return super.seg(this.f(a), this.f(b), Math.max(t0 * KS, Math.min(t0, 0.75)), Math.max(t1 * KS, Math.min(t1, 0.75))); }
  override dot(a: V2, r: number) { return super.dot(this.f(a), Math.max(r * KS, Math.min(r, 0.85))); }
  override pg(pts: V2[]) { return super.pg(pts.map((q) => this.f(q))); }
  override el(c: V2, rx: number, ry: number) { return super.el(this.f(c), rx * KS, ry * KS); }
  override bz(p0: V2, p1: V2, p2: V2, t0: number, t1 = t0) { return super.bz(this.f(p0), this.f(p1), this.f(p2), t0 * KS, t1 * KS); }
  override clip(fn: (x: number, y: number) => boolean) { return super.clip((x, y) => fn(CC + (x - CC) / KS, CC + (y - CC) / KS)); }
}
export interface IP { g: string; ramp: C[]; o?: PO; m: (z: Mz) => void; emis?: boolean; ft?: string }
/** сдвиг системы координат (шлем-конструктор рисует в системе головы, иконка — в поле 48×48) */
const shift = (z: Mz, dx: number, dy: number): Mz => ({ seg: (a: V2, b: V2, t0: number, t1?: number) => z.seg([a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy], t0, t1), dot: (a: V2, r: number) => z.dot([a[0] + dx, a[1] + dy], r), pg: (p: V2[]) => z.pg(p.map((q) => [q[0] + dx, q[1] + dy] as V2)), el: (c: V2, rx: number, ry: number) => z.el([c[0] + dx, c[1] + dy], rx, ry), bz: (a: V2, b: V2, c: V2, t0: number, t1?: number) => z.bz([a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy], [c[0] + dx, c[1] + dy], t0, t1), clip: (f: (x: number, y: number) => boolean) => z.clip((x, y) => f(x - dx, y - dy)), hull: (p: V2[]) => z.hull(p.map((q) => [q[0] + dx, q[1] + dy] as V2)) } as unknown as Mz);
const S = 48, W2 = 96;
/** rim — кант редкости снаружи контура (легендарное — оранжевый, как в паке) */
function render(parts: IP[], rim?: C): { img: PC; emis: [number, number][]; parts: number; ip: IP[]; vis: number[] } {
  const cv = new Cv(W2, W2), ids = new Uint8Array(W2 * W2);
  parts.forEach((p, k) => {
    const m = new SMz(); p.m(m); const c = new Cv(W2, W2); paint(c, m, p.ramp, { dith: 0.12, amp: 1.5, ...p.o });
    // отражённый свет снизу: нижняя кромка объёмных частей на тон светлее самых тёмных
    if ((p.o?.dome ?? 3) >= 2) {
      const dk = new Set([p.ramp[0].join(), p.ramp[1].join()]);
      for (let y = 2; y < W2 - 3; y++) for (let x = 0; x < W2; x++) { const q = y * W2 + x; if (!m.d[q] || m.d[q + 2 * W2] || !m.d[q - 2 * W2] || !m.d[q - 4 * W2 >= 0 ? q - 4 * W2 : q]) continue; if (dk.has(c.get(x, y).join())) c.set(x, y, p.ramp[2]); }
    }
    // кант 1 px (×2) к свету — как у слоёв на герое (base_b, o.kant)
    if (p.o?.kant) { const top = p.ramp[p.ramp.length - 1], hi = p.ramp[p.ramp.length - 2]; for (let q = 0; q < m.d.length; q++) { if (!m.d[q]) continue; const x = q % W2, y = Math.floor(q / W2); if (y < 2 || !m.d[q - 2 * W2]) c.set(x, y, top); else if (x < 2 || !m.d[q - 2]) c.set(x, y, hi); } }
    for (let q = 0; q < m.d.length; q++) if (m.d[q]) { cv.set(q % W2, Math.floor(q / W2), c.get(q % W2, Math.floor(q / W2))); ids[q] = k + 1; }
  });
  const out = new Cv(S, S), oid = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cnt = new Map<number, number>();
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const id = ids[(y * 2 + j) * W2 + x * 2 + i]; if (id) cnt.set(id, (cnt.get(id) ?? 0) + 1); }
    let tot = 0; for (const q of cnt.values()) tot += q; if (tot < 2) continue;
    let best = 0, bn = -1; for (const [id, q] of cnt) if (q > bn || (q === bn && id > best)) { best = id; bn = q; }
    let bc: C | null = null, bcn = 0; const cols = new Map<string, { n: number; c: C }>();
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const q = (y * 2 + j) * W2 + x * 2 + i; if (ids[q] !== best) continue; const cc = cv.get(x * 2 + i, y * 2 + j), key = cc.join(","), e = cols.get(key); if (e) e.n++; else cols.set(key, { n: 1, c: cc }); }
    for (const e of cols.values()) if (!bc || e.n > bcn || (e.n === bcn && e.c[0] + e.c[1] + e.c[2] < bc[0] + bc[1] + bc[2])) { bc = e.c; bcn = e.n; }
    out.set(x, y, bc!); oid[y * S + x] = best;
  }
  // контровой свет: кромка силуэта, обращённая вниз-вправо, — светлая линия (тёмная вещь читается на тёмном фоне)
  const RIMC = hx("#b8a8cc");
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = oid[y * S + x]; if (!a || parts[a - 1].emis) continue;
    const r = x + 1 >= S || !oid[y * S + x + 1], d = y + 1 >= S || !oid[(y + 1) * S + x];
    if (!r && !d) continue;
    const q = out.get(x, y), lum = q[0] * 0.3 + q[1] * 0.55 + q[2] * 0.15;
    if (lum < 150) out.set(x, y, mixC(q, RIMC, r && d ? 0.55 : 0.4));
  }
  const res = new Cv(S, S); res.d.set(out.d);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const a = oid[y * S + x]; if (!a) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const c2 = oid[yy * S + xx]; if (!c2 || c2 <= a || parts[a - 1].g === parts[c2 - 1].g) continue; res.set(x, y, mixC(parts[a - 1].ramp[0], out.get(x, y), 0.25)); break; }
  }
  const DK = hx("#0a060c");
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (oid[y * S + x]) continue; let best: C | null = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue; const c2 = oid[yy * S + xx]; if (!c2) continue; const col = mixC(parts[c2 - 1].ramp[0], DK, 0.55); if (!best || col[0] + col[1] + col[2] < best[0] + best[1] + best[2]) best = col; }
    if (best) res.set(x, y, best);
  }
  if (rim) {
    const add: [number, number][] = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (res.has(x, y)) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (res.has(x + dx, y + dy)) { add.push([x, y]); break; } }
    for (const [x, y] of add) res.set(x, y, rim);
  }
  const img = new PC(S, S), emis: [number, number][] = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (res.has(x, y)) { const q = res.get(x, y); img.set(x, y, [q[0], q[1], q[2], 255]); if (oid[y * S + x] && parts[oid[y * S + x] - 1].emis) emis.push([x, y]); }
  const vis = parts.map(() => 0); for (let q = 0; q < oid.length; q++) if (oid[q]) vis[oid[q] - 1]++;
  return { img, emis, parts: parts.length, ip: parts, vis };
}
const tri = (z: Mz, a: V2, b: V2, t: V2) => z.pg([a, t, b]);
const spk = (z: Mz, b: V2, t: V2, w: number) => { const dx = t[0] - b[0], dy = t[1] - b[1], l = Math.hypot(dx, dy); const n: V2 = [(-dy / l) * w, (dx / l) * w]; tri(z, [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], t); };
function crest(parts: IP[], cx: number, cy: number, s: number, id: CrestId) {
  const cr = GD.crests[id], P = (x: number, y: number): V2 => [cx + x * s, cy + y * s];
  parts.push({ g: "crest", ramp: ramp(cr.field), o: { dome: 2, amp: 1.2, bias: 0.2 }, m: (z) => z.pg([P(-1.55, -1.7), P(1.55, -1.7), P(1.55, 0.1), P(0, 2.1), P(-1.55, 0.1)]) });
  if (cr.shape === "sun") parts.push({ g: "crestC", ramp: ramp(cr.charge), o: { dome: 1, bias: 0.5 }, m: (z) => { z.dot(P(0, -0.35), 0.6 * s); for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; z.seg(P(Math.cos(a) * 0.75, -0.35 + Math.sin(a) * 0.75), P(Math.cos(a) * 1.2, -0.35 + Math.sin(a) * 1.2), 0.42 * s); } } });
  else parts.push({ g: "crestC", ramp: ramp(cr.charge), o: { dome: 1, bias: 0.8 }, m: (z) => { const q = P(0, -0.3), q2 = P(0.5, -0.6), r = 0.95 * s; z.dot(q, r); z.clip((x, y) => Math.hypot(x - q2[0], y - q2[1]) > r * 0.78); } });
}

export const RARITY_RIM: Record<string, C | undefined> = { legendary: hx("#f0901c"), epic: hx("#b05ae0"), rare: hx("#4a8ae0") };
export function icon(slot: Slot, it: any, cr: CrestId = "sol", rarity = "common") {
  KS = it.iconScale ?? 0.82; // ступень: мелкий простой силуэт внизу, крупный на 81–100
  const p: IP[] = [], add = (g: string, rp: C[], m: (z: Mz) => void, o: PO = { dome: 3, amp: 1.7, bias: 0.2 }, emis = false, ft?: string) => p.push({ g, ramp: rp, m, o, emis, ft });
  const P = ramp(it.plate ?? it.hilt ?? "iron"), Ac = ramp(it.accent ?? it.outer ?? "iron"), Tr = ramp(it.trim ?? "gold");
  switch (slot) {
    case "helm": {
      if (PARAM_STYLES.includes(it.style)) {
        // тот же шлем, что на герое (helm.ts): система головы ×2,6, мелкие детали — u 1,7
        const hw = 13.2, hh = hw * (8.8 / 9.4), cx = 24, cy = 25;
        for (const q of helmGeo(helmModel(it), "front", hw, hh, 1.7, true).sort((a, b) => a.z - b.z)) add(q.g, typeof q.mat === "string" ? ramp(q.mat) : q.mat, (z) => q.draw(shift(z, cx, cy)), q.o, !!q.emis, q.ft);
      } else if (it.style === "horned") {
        const Hn = ramp(it.horn), G = ramp(it.glow);
        add("horn", Hn, (z) => { z.bz([14, 22], [3, 16], [8, 3], 5.0, 1.0); z.bz([34, 22], [45, 16], [40, 3], 5.0, 1.0); }, { dome: 3, amp: 1.8, bias: 0.3 });
        add("hornR", Hn, (z) => { for (const t of [[11.5, 18.5], [9.5, 13.5]] as V2[]) z.seg([t[0] - 2.2, t[1] + 0.6], [t[0] + 2.0, t[1] + 1.4], 0.9); for (const t of [[36.5, 18.5], [38.5, 13.5]] as V2[]) z.seg([t[0] - 2.0, t[1] + 1.4], [t[0] + 2.2, t[1] + 0.6], 0.9); }, { dome: 1, bias: -1.4 });
        add("spk", P, (z) => { tri(z, [19, 12], [22, 12], [20, 4.5]); tri(z, [22.5, 11], [25.5, 11], [24, 1.5]); tri(z, [26, 12], [29, 12], [28, 4.5]); }, { dome: 1, amp: 1.9, bias: 0.5 });
        add("shell", P, (z) => { z.el([24, 24], 12, 12.5); z.pg([[12.2, 25], [35.8, 25], [33, 40], [24, 45], [15, 40]]); });
        add("face", Ac, (z) => z.pg([[15, 22], [33, 22], [31, 33], [24, 43.5], [17, 33]]), { dome: 3, amp: 1.9, bias: 0.15 });
        add("faceR", Ac, (z) => z.seg([24, 22.5], [24, 42], 1.1), { dome: 1, bias: 1.5 });
        // в прорезях видно лицо (на тон темнее в тени забрала)
        add("slitD", ["#0c0608", "#140a0c", "#1e1416", "#2a1c1e", "#3a2628"].map(hx), (z) => { z.seg([16.5, 26.5], [22.3, 28.5], 2.2); z.seg([31.5, 26.5], [25.7, 28.5], 2.2); }, { dome: 1, bias: -1.2 });
        add("eye", G, (z) => { z.dot([19.6, 27.6], 1.15); z.dot([28.4, 27.6], 1.15); }, { dome: 1, bias: 1.3 }, true);
        add("spec", P, (z) => z.bz([14.5, 19], [16, 13.5], [21, 12], 1.4, 0.8), { dome: 1, bias: 2.4 });
        add("cheek", P, (z) => { z.seg([15.5, 33], [20, 41], 0.9); z.seg([32.5, 33], [28, 41], 0.9); }, { dome: 1, bias: -1.6 });
        add("breath", P, (z) => { for (const [x, y] of [[20.5, 33], [22, 36], [27.5, 33], [26, 36], [21.5, 39], [26.5, 39]] as V2[]) z.dot([x, y], 0.62); }, { dome: 1, bias: -2 });
        add("trim", Tr, (z) => z.bz([13, 22], [24, 15], [35, 22], 1.6, 1.6), { dome: 1, bias: 0.4 });
        add("gem", ramp(it.glow), (z) => z.dot([24, 18.2], 2.0), { dome: 2, bias: 0.6 }, true);
        add("hornT", Hn, (z) => { z.seg([7.5, 6], [8, 3.5], 1.0); z.seg([40.5, 6], [40, 3.5], 1.0); z.bz([5, 17], [4, 12], [6.5, 8], 0.9, 0.7); }, { dome: 1, bias: 2.2 });
        add("gor", P, (z) => z.bz([15, 43], [24, 47.5], [33, 43], 2.4, 2.4), { dome: 2, bias: -0.2 });
      } else if (it.style === "hood") {
        // капюшон 3/4: остриё сверху, вырез в тени, светящиеся глаза, алая маска; пелерина снизу
        const Cl = ramp(it.cloth), Ln = ramp(it.lining), Shd = ramp(it.shadow ?? "hood_shadow");
        add("cape", it.capelet ? ramp(it.capelet) : Cl, (z) => z.pg([[5, 46], [9, 33], [17, 30], [31, 30], [39, 33], [43, 46], [36, 43.5], [30, 46.5], [24, 44], [18, 46.5], [12, 43.5]]), { dome: 3, amp: 1.7, bias: 0.1 });
        add("capeE", Ln, (z) => z.bz([6, 45], [24, 49], [42, 45], 1.2, 1.2), { dome: 1, bias: 0.5 });
        add("hood", Cl, (z) => z.pg([[10, 34], [9, 22], [13, 12], [20, 5], [27, 1.5], [31, 6], [37, 13], [40, 23], [39, 35], [33, 39], [15, 39]]), { dome: 4, amp: 1.9, bias: 0.25 });
        add("fold", Cl, (z) => { z.bz([13, 16], [11, 26], [13, 36], 0.9, 0.9); z.bz([35, 16], [38, 26], [36, 36], 0.9, 0.9); z.bz([22, 6], [25, 9], [28, 12], 0.8, 0.8); }, { dome: 1, bias: -1.5 });
        add("spec", Cl, (z) => z.bz([12, 24], [13, 14], [21, 7], 1.2, 0.7), { dome: 1, bias: 2.3 });
        add("lin", Ln, (z) => z.el([24.5, 26], 10, 12), { dome: 3, amp: 1.6, bias: 0.4 });
        if (it.mask || it.glow) add("shadow", Shd, (z) => z.el([24.5, 27], 7.6, 9.8), { dome: 3, amp: 0.8, bias: -0.1 });
        else {
          // без маски лицо открыто (как на герое): кожа, глаза, тень капюшона на лбу
          const SKN = ["#4a2620", "#7e4636", "#b06c52", "#d99a76", "#f2c49e"].map(hx);
          add("skin", SKN, (z) => z.el([24.5, 28], 7.4, 9.4), { dome: 4, amp: 1.3, bias: 0.3 }, false, "face");
          add("eyesF", ["#140a0c", "#1e1416", "#2a1c1e", "#3a2628", "#4a3234"].map(hx), (z) => { z.seg([20, 27], [22.6, 27], 1.2); z.seg([26.4, 27], [29, 27], 1.2); z.seg([22.5, 34.5], [26.5, 34.5], 0.7); }, { dome: 1, bias: 0 }, false, "face");
          add("skinN", SKN, (z) => z.seg([24.5, 28], [25, 31.5], 1.0), { dome: 1, bias: -1.5 }, false, "face");
          add("shadow", Shd, (z) => { z.el([24.5, 22], 8, 5.2); z.clip((x, y) => y < 24.5); }, { dome: 1, amp: 0.6, bias: 0.2 });
        }
        if (it.glow) add("eye", ramp(it.glow), (z) => { z.el([21, 25.5], 1.4, 1.0); z.el([28, 25.5], 1.4, 1.0); }, { dome: 1, bias: 0.8 }, true);
        if (it.mask) { add("mask", ramp(it.mask), (z) => z.pg([[15.5, 29], [33.5, 29], [31, 36], [24.5, 40.5], [18, 36]]), { dome: 3, amp: 1.9, bias: 0.3 }); add("maskF", ramp(it.mask), (z) => { z.bz([18, 31.5], [22, 34], [24.5, 38], 0.8, 0.8); z.bz([31, 31.5], [28, 34], [25.5, 37], 0.8, 0.8); }, { dome: 1, bias: -1.5 }); }
        if (it.mask && it.seam) add("seam", ramp(it.seam), (z) => z.seg([16.5, 30], [32.5, 30], 0.9), { dome: 1, bias: 0.4 }, true);
        if (it.crest) crest(p, 35, 40, 1.35, cr);
      }
      break;
    }
    case "pauldrons": {
      if (it.form === "small") {
        // обычный: одна округлая пластина без лам
        add("dome", Ac, (z) => { z.el([24, 26], 14, 11); z.clip((x, y) => y < 31); }, { dome: 4, amp: 2.0, bias: 0.25 });
        add("rim", Ac, (z) => z.bz([10.5, 30.5], [24, 34], [37.5, 30.5], 1.6, 1.6), { dome: 1, bias: -0.6 });
        add("spec", Ac, (z) => z.bz([13, 24], [15, 18], [21, 16], 1.4, 0.8), { dome: 1, bias: 2.4 });
        break;
      }
      if (it.form === "lames") {
        // редкий: широкие ламы-полосы без купола, ремень с пряжкой
        for (let k = 0; k < 4; k++) add("lm" + k, P, (z) => { const y = 12 + k * 7; z.pg([[6 + k * 1.5, y], [42 - k * 1.5, y], [40 - k * 1.5, y + 7], [8 + k * 1.5, y + 7]]); }, { dome: 3, amp: 1.9, bias: 0.25 - 0.12 * k });
        for (let k = 0; k < 4; k++) add("lmH" + k, P, (z) => z.seg([7 + k * 1.5, 12.8 + k * 7], [41 - k * 1.5, 12.8 + k * 7], 0.8), { dome: 1, bias: 2.2 });
        add("strap", ramp("leather_dark"), (z) => z.seg([24, 9], [24, 42], 3.0), { dome: 1, bias: 0.3 });
        add("buck", Tr, (z) => z.pg([[21.5, 18], [26.5, 18], [26.5, 23], [21.5, 23]]), { dome: 1, bias: 0.6 });
        if (it.rivets) add("riv", Tr, (z) => { for (let k = 0; k < 4; k++) { z.dot([10 + k * 1.5, 15.5 + k * 7], 0.85); z.dot([38 - k * 1.5, 15.5 + k * 7], 0.85); } }, { dome: 1, bias: 1.3 });
        break;
      }
      const sp = it.spikes ?? 0, big = (it.size ?? 1) > 1, n = it.lames ?? 1;
      // ламы снизу вверх: у каждой — тень у нижней кромки и блик по верхней
      for (let k = n; k >= 1; k--) {
        const cy = 27 + 6.2 * k, rx = 17.5 - 2.2 * k, ry = 7 - 0.7 * k;
        add("lame" + k, P, (z) => { z.el([24, cy], rx, ry); z.clip((x, y) => y > cy - ry * 0.25); }, { dome: 3, amp: 1.9, bias: 0.1 - 0.15 * k });
        add("lameH" + k, P, (z) => z.bz([24 - rx * 0.85, cy + 0.5], [24, cy + ry * 0.62], [24 + rx * 0.85, cy + 0.5], 0.9, 0.9), { dome: 1, bias: 2.0 });
        if (it.rivets || sp >= 1) add("lameR" + k, Tr, (z) => { for (const x of [-0.55, 0, 0.55]) z.dot([24 + x * rx, cy + ry * 0.55 * (1 - Math.abs(x)) + 1.8], 0.8); }, { dome: 1, bias: 1.0 });
      }
      const dw = sp >= 1 ? 14.5 : big ? 18.5 : 16, dh = sp >= 1 ? 12 : big ? 15 : 13;
      add("dome", Ac, (z) => { z.el([24, 25], dw, dh); z.clip((x, y) => y < 31 - Math.abs(x - 24) * 0.05); }, { dome: 5, amp: 2.1, bias: 0.25 });
      add("ridge", Ac, (z) => z.bz([24, 11.5], [25.5, 20], [24, 30], 1.4, 1.0), { dome: 1, bias: 1.4 });
      add("spec", Ac, (z) => z.bz([11, 22], [13, 15], [19, 12.5], 1.8, 0.9), { dome: 1, bias: 2.6 });
      if (it.trim !== it.plate) add("trim", Tr, (z) => z.bz([6.5, 30], [24, 37.5], [41.5, 30], 1.9, 1.9), { dome: 1, bias: 0.3 });
      if (it.filigree || it.gem || sp >= 1) {
        if (it.filigree || sp >= 1) add("fil", Tr, (z) => { z.bz([12, 27], [15, 19], [21.5, 21], 1.0, 0.8); z.bz([36, 27], [33, 19], [26.5, 21], 1.0, 0.8); }, { dome: 1, bias: 0.6 });
        add("gemS", Tr, (z) => z.el([24, 24.5], 3.2, 3.0), { dome: 2, bias: 0.3 });
        add("gem", ramp(it.gem ?? "eye_glow"), (z) => z.el([24, 24.5], 2.0, 1.9), { dome: 2, bias: it.gem ? 0.7 : 0.5 }, !it.gem);
      }
      if (it.cracks) add("crack", ramp(it.cracks), (z) => { z.seg([15, 20], [18, 25], 1.0); z.seg([18, 25], [16.5, 29], 1.0); z.seg([31, 19], [29, 24], 1.0); }, { dome: 1, bias: 0.4 }, true);
      if (it.rivets || sp >= 1) add("rivet", Tr, (z) => { for (const x of [12, 24, 36]) z.dot([x, 32 + (x === 24 ? 2.6 : 0)], 1.0); }, { dome: 1, bias: 1.3 });
      const ssc = it.spikeScale ? 0.62 : 1.35, sk = (b: V2, t: V2): V2 => [b[0] + (t[0] - b[0]) * ssc, b[1] + (t[1] - b[1]) * ssc];
      if (sp >= 1) add("sp", it.spike ? ramp(it.spike) : P, (z) => { spk(z, [21.5, 17], sk([21.5, 17], [15, 0.5]), 3.0 * ssc); if (sp >= 2) spk(z, [32, 19], sk([32, 19], [46, 8]), 2.8 * ssc); if (sp >= 3) spk(z, [13, 22], sk([13, 22], [1.5, 13]), 2.6 * ssc); }, { dome: 1, amp: 2, bias: 0.6 });
      if (sp >= 1 && !it.spikeScale) add("spH", P, (z) => { z.seg([19, 14], [15.5, 3], 0.8); z.seg([33, 15.5], [43.5, 9], 0.8); }, { dome: 1, bias: 2.2 });
      break;
    }
    case "armor": {
      if (it.style === "robe") {
        // мантия: расклёшенный подол, высокий ворот, кушак, центральная полоса с вышивкой; выше — наплечная пелерина, самоцвет, герб, светящиеся руны
        const Cl = ramp(it.cloth), Tr = ramp(it.trim ?? it.cloth), Sa = ramp(it.sash ?? it.cloth);
        if (it.wings) add("wingsB", ramp(it.wings), (z) => { z.pg([[13, 12], [-1, -1], [1, 12], [-2, 22], [3, 30], [1, 42], [11, 32]]); z.pg([[35, 12], [49, -1], [47, 12], [50, 22], [45, 30], [47, 42], [37, 32]]); }, { dome: 3, amp: 1.8, bias: 0.3 }, !!it.wingGlow);
        if (it.cut === "tunic") add("robe", Cl, (z) => z.pg([[15, 8], [33, 8], [35, 20], [36, 36], [12, 36], [13, 20]]), { dome: 4, amp: 1.8, bias: 0.2 });
        else if (it.cut === "mid") add("robe", Cl, (z) => z.pg([[14, 8], [34, 8], [36, 20], [36.5, 38], [11.5, 38], [12, 20]]), { dome: 4, amp: 1.8, bias: 0.2 });
        else if (it.wings) add("robe", Cl, (z) => z.pg([[15, 8], [33, 8], [35, 20], [37, 46], [11, 46], [13, 20]]), { dome: 4, amp: 1.8, bias: 0.2 });
        else add("robe", Cl, (z) => z.pg([[14, 8], [34, 8], [37, 20], [41, 46], [7, 46], [11, 20]]), { dome: 4, amp: 1.8, bias: 0.2 });
        if (it.sleeves) add("sleeve", Cl, (z) => { z.pg([[11, 12], [3, 30], [9, 33], [14, 18]]); z.pg([[37, 12], [45, 30], [39, 33], [34, 18]]); }, { dome: 3, amp: 1.8, bias: 0.1 });
        if (it.halo) add("halo", ramp(it.halo), (z) => { z.el([24, 4], 13, 3.6); z.clip((x, y) => !(Math.hypot((x - 24) / 10.5, (y - 4) / 2.2) < 1)); }, { dome: 1, bias: 1.0 }, true);
        add("fold", Cl, (z) => { z.bz([15, 24], [13, 35], [11, 45], 0.8, 0.8); z.bz([33, 24], [35, 35], [37, 45], 0.8, 0.8); }, { dome: 1, bias: -1.5 });
        add("spec", Cl, (z) => z.bz([12.5, 21], [11, 32], [9, 43], 1.0, 0.7), { dome: 1, bias: 2.3 });
        if (it.panel) add("panel", ramp(it.panel), (z) => z.pg([[20, 22], [28, 22], [30, 46], [18, 46]]), { dome: 3, amp: 1.7, bias: 0.25 });
        if (it.embroid) add("emb", Tr, (z) => { for (let y = 25; y < 45; y += 4) { z.seg([20, y], [24, y + 2], 0.8); z.seg([24, y + 2], [28, y], 0.8); } }, { dome: 1, bias: 0.6 });
        if (it.hemTrim) add("hem", Tr, (z) => z.bz([7.5, 45], [24, 47.5], [40.5, 45], 1.5, 1.5), { dome: 1, bias: 0.5 });
        add("sash", Sa, (z) => z.pg([[11, 20], [37, 20], [37.5, 24], [10.5, 24]]), { dome: 3, amp: 1.8, bias: 0.3 });
        if (it.sashTails) add("tail", Sa, (z) => { z.bz([28, 23], [30, 30], [28.5, 37], 2.4, 1.6); z.bz([30, 23], [33, 29], [33, 35], 2.0, 1.4); }, { dome: 2, bias: 0.2 });
        add("collar", ramp(it.collar ?? it.cloth), (z) => z.pg([[15, 8], [24, 15], [33, 8], [31, 3], [24, 9], [17, 3]]), { dome: 3, amp: 1.8, bias: 0.35 });
        if (it.mantle) add("mantle", ramp(it.mantle), (z) => z.pg([[0, 22], [9, 4], [16, -2], [24, 9], [32, -2], [39, 4], [48, 22], [38, 25], [24, 18], [10, 25]]), { dome: 3, amp: 1.8, bias: 0.25 });
        if (it.mantle && it.hemTrim) add("mTrim", Tr, (z) => z.bz([6.5, 15], [24, 19.5], [41.5, 15], 1.1, 1.1), { dome: 1, bias: 0.5 });
        if (it.gem) add("gem", ramp(it.gem), (z) => z.el([24, 12.5], 2.2, 2.0), { dome: 2, bias: 0.7 }, it.gem === "eye_glow" || it.gemGlow);
        if (it.crest) crest(p, 24, 31, 1.9, cr);
        if (it.mythic) { const Gl = ramp(it.mythic); add("star", Gl, (z) => { for (const [x, y] of [[13, 30], [33, 27], [18, 40], [30, 41], [36, 36], [11, 38]] as V2[]) { z.seg([x - 1.6, y], [x + 1.6, y], 0.8); z.seg([x, y - 1.6], [x, y + 1.6], 0.8); } }, { dome: 1, bias: 1.6 }, true); add("mFin", ramp(it.trim), (z) => { z.pg([[6, 15], [1, 6], [11, 9]]); z.pg([[42, 15], [47, 6], [37, 9]]); }, { dome: 2, amp: 1.9, bias: 0.4 }); }
        if (it.runes) add("rune", ramp(it.runes), (z) => { for (const x of [12, 17, 31, 36]) { z.seg([x, 39], [x + 1.5, 42], 0.8); z.seg([x + 1.5, 42], [x, 44.5], 0.8); } z.seg([14, 26], [16, 30], 0.8); z.seg([34, 26], [32, 30], 0.8); }, { dome: 1, bias: 0.6 }, true);
        if (it.spikes) add("rSp", ramp(it.spike ?? it.trim), (z) => { spk(z, [10, 10], [2, 2], 1.6); spk(z, [38, 10], [46, 2], 1.6); }, { dome: 1, amp: 2, bias: 0.6 });
        break;
      }
      if (it.style === "coat") {
        const Lt = ramp(it.leather), St = ramp(it.plate), Sa = ramp(it.sash ?? it.leather);
        // штаны (часть куртки на герое): ноги под полами, ремешки с пряжками
        if (it.pants) { add("pants", ramp(it.pants), (z) => { z.pg([[14, 36], [23, 36], [22, 48], [15, 48]]); z.pg([[25, 36], [34, 36], [33, 48], [26, 48]]); }, { dome: 3, amp: 1.7, bias: 0 }); add("pstrap", ramp("grip"), (z) => { z.seg([14.5, 42], [22.5, 42], 1.2); z.seg([25.5, 42], [33.5, 42], 1.2); }, { dome: 1, bias: 0.3 }); add("pbuck", ramp("gold"), (z) => { z.dot([18.5, 42], 0.9); z.dot([29.5, 42], 0.9); }, { dome: 1, bias: 0.8 }); }
        if (it.cut === "jacket") add("skirtB", Lt, (z) => z.pg([[11, 30], [37, 30], [39, 39], [24, 40.5], [9, 39]]), { dome: 3, amp: 1.6, bias: -0.15 });
        else if (it.cut !== "vest") add("skirtB", Lt, (z) => z.pg([[11, 30], [37, 30], [43, 46], [36, 44], [30, 47], [24, 45], [18, 47], [12, 44], [5, 46]]), { dome: 3, amp: 1.6, bias: -0.15 });
        if (it.cut !== "vest" && it.cut !== "jacket") add("skirtF", Lt, (z) => { z.bz([12, 31], [9, 39], [7, 46], 0.9, 0.9); z.bz([36, 31], [39, 39], [41, 46], 0.9, 0.9); z.seg([24, 32], [24, 45], 1.4); }, { dome: 1, bias: -1.6 });
        add("body", Lt, (z) => { z.pg([[8, 9], [40, 9], [37, 22], [35, 33], [13, 33], [11, 22]]); z.el([24, 10], 16, 4); }, { dome: 4, amp: 1.8, bias: 0.2 });
        add("bodyH", Lt, (z) => z.bz([10, 13], [11.5, 22], [15, 30], 1.1, 0.8), { dome: 1, bias: 2.3 });
        if (it.stitch) add("stitch", ramp(it.stitch), (z) => { for (const x of [19, 29]) for (let y = 11; y < 30; y += 3.2) z.seg([x, y], [x - 0.2, y + 1.6], 0.75); for (const [x0, x1] of [[11.5, 13], [36.5, 35]]) for (let y = 14; y < 28; y += 3.4) z.seg([x0 + (x1 - x0) * (y - 14) / 14, y], [x0 + (x1 - x0) * (y - 12.4) / 14, y + 1.6], 0.75); }, { dome: 1, bias: 0.5 });
        if (it.breast) {
          add("plate", St, (z) => z.pg([[12, 11], [36, 11], [34, 20], [24, 26], [14, 20]]), { dome: 4, amp: 2, bias: 0.3 });
          add("plateH", St, (z) => z.bz([13, 12], [18, 13], [22, 15], 1.0, 0.7), { dome: 1, bias: 2.4 });
          add("plateL", St, (z) => z.seg([24, 12], [24, 25], 0.8), { dome: 1, bias: -1.5 });
          if (it.cracks) add("crack", ramp(it.cracks), (z) => { z.seg([16, 13.5], [19, 17], 0.8); z.seg([19, 17], [17.5, 20], 0.8); z.seg([32, 13.5], [29, 17], 0.8); z.seg([29, 17], [30.5, 20], 0.8); }, { dome: 1, bias: 0.6 }, true);
        }
        if (it.mythic) {
          const Gl = ramp(it.mythic);
          add("mFin", ramp(it.trim ?? it.plate ?? it.cloth), (z) => { z.pg([[6, 12], [1.5, 2.5], [10, 7.5]]); z.pg([[42, 12], [46.5, 2.5], [38, 7.5]]); z.pg([[18, 4], [24, -1], [30, 4], [24, 6.5]]); }, { dome: 2, amp: 1.9, bias: 0.4 });
          add("mHalo", Gl, (z) => { z.seg([13, 15], [17.5, 21], 2.6); z.seg([17.5, 21], [15, 27], 2.6); z.seg([35, 15], [30.5, 21], 2.6); z.seg([30.5, 21], [33, 27], 2.6); z.seg([24, 28], [23, 36], 2.4); }, { dome: 1, bias: -0.9 }, true);
          add("mSeam", Gl, (z) => { z.seg([13, 15], [17.5, 21], 0.9); z.seg([17.5, 21], [15, 27], 0.9); z.seg([35, 15], [30.5, 21], 0.9); z.seg([30.5, 21], [33, 27], 0.9); z.seg([24, 28], [23, 36], 0.9); }, { dome: 1, bias: 1.6 }, true);
          add("mCry", Gl, (z) => z.pg([[24, 9], [26.5, 13], [24, 18], [21.5, 13]]), { dome: 2, amp: 1.6, bias: 0.8 }, true);
        }
        if (it.cracks && !it.breast && !it.mythic) add("crack", ramp(it.cracks), (z) => { z.seg([15, 14], [18, 19], 0.8); z.seg([33, 14], [30, 19], 0.8); z.seg([24, 38], [23, 43], 0.8); }, { dome: 1, bias: 0.6 }, true);
        if (it.spikes) { add("fins", ramp(it.spike ?? it.plate), (z) => { z.pg([[5, 20], [-1, 0], [8, 7], [11, -3], [16, 8], [15, 17]]); z.pg([[43, 20], [49, 0], [40, 7], [37, -3], [32, 8], [33, 17]]); }, { dome: 2, amp: 2, bias: 0.4 });
        add("finsH", ramp(it.spike ?? it.plate), (z) => { z.seg([2.5, 5], [6, 14], 0.7); z.seg([11, 2], [12.5, 12], 0.7); }, { dome: 1, bias: 2.3 }); }
        else if (it.pauldronsOnIcon) add("pd", ramp(it.plate), (z) => { z.el([7.5, 12], 7.5, 5.8); z.el([40.5, 12], 7.5, 5.8); }, { dome: 4, amp: 1.9, bias: 0.25 });

        if (it.collarHigh) add("hcol", Lt, (z) => z.pg([[13, 10], [17, -1], [24, 5], [31, -1], [35, 10], [24, 12]]), { dome: 3, amp: 1.8, bias: 0.3 });
        if (it.lacing) add("lace", ramp(it.lacing), (z) => { for (let y = 14; y < 28; y += 3.5) { z.seg([21.5, y], [26.5, y + 3], 0.7); z.seg([26.5, y], [21.5, y + 3], 0.7); } }, { dome: 1, bias: 0.6 });
        if (it.pouch) add("pouch", ramp(it.pouch), (z) => z.pg([[29, 34], [35, 34], [35.5, 41], [28.5, 41]]), { dome: 3, amp: 1.8, bias: 0.2 });
        if (it.breast || it.strap) add("riv", ramp("gold"), (z) => { if (it.breast) for (const [x, y] of [[15, 13], [33, 13], [16.5, 18.5], [31.5, 18.5]] as V2[]) z.dot([x, y], 0.85); if (it.strap) for (const t of [0.2, 0.75]) z.dot([11 + 24 * t, 11 + 20 * t - 1.2], 0.85); }, { dome: 1, bias: 1.3 });
        if (it.strap) { add("strap", ramp(it.strapMat ?? it.accent), (z) => z.seg([11, 11], [35, 31], 2.4), { dome: 2, bias: 0.4 }); add("buck", ramp("gold"), (z) => z.el([22, 20.5], 1.9, 1.7), { dome: 1, bias: 0.6 }); }
        add("sash", Sa, (z) => z.pg([[11.5, 29], [36.5, 29], [37, 35], [11, 35]]), { dome: 3, amp: 1.9, bias: 0.3 });
        add("sashF", Sa, (z) => { z.seg([13, 31], [35, 32], 0.8); z.seg([13, 33.5], [35, 33.5], 0.7); }, { dome: 1, bias: -1.4 });
        if (it.sashTails) { add("tail", Sa, (z) => { z.bz([15, 33], [13, 39], [16, 46], 2.6, 1.6); z.bz([17, 33], [18, 40], [21, 45], 2.2, 1.4); }, { dome: 2, amp: 1.7, bias: 0.2 }); add("knot", Sa, (z) => z.el([15.5, 32.5], 2.6, 2.4), { dome: 2, bias: 0.4 }); }
        if (!it.sashTails) add("sbuck", ramp("brass"), (z) => z.pg([[22, 30], [26, 30], [26, 34], [22, 34]]), { dome: 1, bias: 0.6 });
        if (it.gem) add("gem", ramp(it.gem), (z) => z.dot([15.5, 32.5], 1.6), { dome: 1, bias: 0.6 }, it.gem === "eye_glow");
        add("collar", Lt, (z) => { z.el([24, 8], 8.5, 3.6); z.clip((x, y) => !(Math.hypot((x - 24) / 5, (y - 6.6) / 2.2) < 1)); }, { dome: 2, bias: 0.1 });
        if (it.crest && it.breast) crest(p, 18.5, 16.5, 1.7, cr);
        break;
      }
      // латный доспех из описания формы (armorgeo.ts — то же, что у героя): тело, подол, наплечья, ворот; украшения — по флагам вещи
      const cl = ramp(it.cloth), SH = armorShape(it), B = ramp(bodyMat(it, SH)), soft = SH.body === "mail" || SH.body === "quilt" || SH.body === "brig", Ml = ramp(it.mail ?? "mail");
      const wf = SH.waist, TOR: Record<string, V2[]> = {
        plate: [[6, 9], [42, 9], [39, 22], [24 + 11 * wf, 35], [24 - 11 * wf, 35], [9, 22]],
        quilt: [[8, 9], [40, 9], [39.5, 22], [38, 35], [10, 35], [8.5, 22]],
        brig: [[8, 9], [40, 9], [39, 28], [38, 35], [10, 35], [9, 28]],
        mail: [[9, 10], [39, 10], [38.5, 22], [37, 35], [11, 35], [9.5, 22]],
        lamellar: [[7, 9], [41, 9], [37, 22], [24 + 9 * wf, 35], [24 - 9 * wf, 35], [11, 22]],
        scale: [[7, 9], [41, 9], [38, 22], [24 + 10 * wf, 35], [24 - 10 * wf, 35], [10, 22]],
      };
      // кольчуга под доспехом: на бёдрах (если подол короткий) и в проймах (как a_mail / a_mailA у героя)
      if (SH.len < 2) add("mail", Ml, (z) => z.pg([[15, 40], [33, 40], [32, 46], [16, 46]]), { dome: 2, bias: 0, dith: 0.75 });
      add("mailA", Ml, (z) => { z.el([8.5, 21], 3.4, 4.5); z.el([39.5, 21], 3.4, 4.5); }, { dome: 2, bias: -0.2, dith: 0.75 });
      if (it.tabard && it.cracks) add("tab", cl, (z) => z.pg([[19, 36], [29, 36], [30, 46], [27.5, 43.5], [25, 47], [22.5, 44], [20, 47], [18, 44]]), { dome: 2, bias: -0.2 });
      // подол
      if (SH.len === 1) {
        add("fauld", P, (z) => z.pg([[13, 34], [35, 34], [38, 41], [30, 43], [24, 42], [18, 43], [10, 41]]), { dome: 3, bias: 0 });
        add("faultL", P, (z) => z.bz([12, 38], [24, 41], [36, 38], 0.9, 0.9), { dome: 1, bias: -1.5 });
        add("tas", ramp(it.tassets ?? it.plate), (z) => { z.pg([[11, 40], [19, 41], [18.5, 46.5], [10, 45]]); z.pg([[29, 41], [37, 40], [38, 45], [29.5, 46.5]]); }, { dome: 3, amp: 1.9, bias: 0.2 });
        add("tasH", ramp(it.tassets ?? it.plate), (z) => { z.seg([11, 40.8], [18.8, 41.8], 0.8); z.seg([29.2, 41.8], [37, 40.8], 0.8); }, { dome: 1, bias: 2.0 });
      } else if (SH.len >= 2) {
        const yb = SH.len === 2 ? 44 : 47.5, fl = SH.len === 2 ? 2.5 : 5;
        add("skirt", B, (z) => z.pg([[12, 32], [36, 32], [36 + fl, yb], [12 - fl, yb]]), { dome: 3, amp: 1.6, bias: 0, dith: SH.body === "mail" ? 0.75 : undefined });
        add("skirtL", B, (z) => { if (SH.body === "quilt") for (const x of [-9, -3, 3, 9]) z.seg([24 + x, 33], [24 + x * 1.2, yb - 0.5], 0.8); else if (soft) z.seg([24, 33], [24, yb], 0.9); else for (const y of [36, 40, 44].filter((q) => q < yb)) z.bz([12 - fl * (y - 32) / (yb - 32), y], [24, y + 1.5], [36 + fl * (y - 32) / (yb - 32), y], 0.8, 0.8); }, { dome: 1, bias: -1.5 });
      }
      if (it.tabard && !it.cracks) { add("tab", cl, (z) => z.pg([[18.5, 34], [29.5, 34], [30.5, 47], [17.5, 47]]), { dome: 3, amp: 1.7, bias: 0.15 }); if (it.trim !== it.plate) add("tabH", Tr, (z) => { z.seg([17.8, 46], [30.2, 46], 1.4); z.seg([18.6, 34.8], [18.6, 45], 0.9); z.seg([29.4, 34.8], [29.4, 45], 0.9); }, { dome: 1, bias: 0.5 }); }
      // тело и фактура
      add("cuir", B, (z) => { z.pg(TOR[SH.body].map(([x, y]) => [24 + (x - 24) * SH.wide, y] as V2)); z.el([24, 10], 17 * SH.wide, 4); }, { dome: 4, amp: 1.8, bias: 0.2, kant: !soft, dith: SH.body === "mail" ? 0.75 : undefined });
      add("cuirH", B, (z) => { z.bz([9.5, 13], [11, 22], [14.5, 31], 1.2, 0.9); }, { dome: 1, bias: 2.3 });
      if (SH.body === "plate") { add("abs", P, (z) => { z.bz([14, 27], [24, 29.5], [34, 27], 1.0, 1.0); z.bz([14.5, 31], [24, 33.5], [33.5, 31], 1.0, 1.0); }, { dome: 1, bias: -1.5 }); add("ridge", P, (z) => z.seg([24, 11], [24, 26], 1.0), { dome: 1, bias: 1.2 }); }
      if (SH.body === "mail") add("tex", B, (z) => { for (let y = 13; y < 34; y += 3) z.bz([11, y], [24, y + 1.2], [37, y], 0.6, 0.6); }, { dome: 1, bias: -1.6 });
      if (SH.body === "quilt") add("tex", B, (z) => { for (const x of [-9, -3, 3, 9]) z.seg([24 + x, 10], [24 + x, 34], 0.7); for (const y of [17, 26]) z.seg([9, y], [39, y], 0.7); }, { dome: 1, bias: -1.4 });
      if (SH.body === "lamellar" || SH.body === "scale") { add("tex", B, (z) => { for (let y = 12; y < 34; y += 3.6) z.bz([10 + (y - 9) * 0.1, y], [24, y + 1.4], [38 - (y - 9) * 0.1, y], 0.8, 0.8); }, { dome: 1, bias: -1.5 }); add("texH", B, (z) => { for (let y = 13.2; y < 34; y += 7.2) z.bz([12, y], [18, y + 0.8], [23, y + 1.2], 0.6, 0.6); }, { dome: 1, bias: 2.0 }); }
      if (SH.body === "brig") add("studs", Tr, (z) => { for (let y = 13; y < 34; y += 5) for (let x = 12; x < 38; x += 5) if (Math.abs(x - 24) > 2) z.dot([x, y], 0.8); }, { dome: 1, bias: 1.2 });
      if (it.chestPlate) add("plate", Ac, (z) => z.pg([[9, 9.5], [39, 9.5], [36, 18], [28, 22], [24, 26], [20, 22], [12, 18]]), { dome: 3, amp: 2, bias: 0.15, kant: true });
      if (it.inlay && it.chestPlate) add("inlay", Tr, (z) => { z.seg([12, 18], [20, 22], 1.3); z.seg([20, 22], [24, 26], 1.3); z.seg([24, 26], [28, 22], 1.3); z.seg([28, 22], [36, 18], 1.3); }, { dome: 1, bias: 0.4 });
      if (it.inlay) {
        add("fil", Tr, (z) => { z.bz([12.5, 22], [14, 15], [18.5, 16.5], 1.0, 0.9); z.bz([35.5, 22], [34, 15], [29.5, 16.5], 1.0, 0.9); }, { dome: 1, bias: 0.6 });
        add("riv", Tr, (z) => { for (const [x, y] of [[18.5, 26.5], [29.5, 26.5]] as V2[]) z.dot([x, y], 1.1); }, { dome: 1, bias: 1.2 });
      } else if (it.rivets && SH.body !== "brig") add("riv", Tr, (z) => { for (const [x, y] of [[15, 12], [33, 12], [16, 22], [32, 22]] as V2[]) z.dot([x, y], 1.0); }, { dome: 1, bias: 1.3 });
      if (it.kant) add("kant", ramp(it.kant), (z) => { z.bz([8, 10.5], [24, 14.5], [40, 10.5], 1.2, 1.2); z.bz([7, 11], [8.5, 17], [10, 22], 1.0, 1.0); z.bz([41, 11], [39.5, 17], [38, 22], 1.0, 1.0); }, { dome: 1, bias: 0.5 });
      if (SH.collar === 2) add("collarH", it.chestPlate ? Ac : P, (z) => z.pg([[14, 9], [17, 0.5], [24, 4], [31, 0.5], [34, 9], [24, 11.5]]), { dome: 3, amp: 1.8, bias: 0.3, kant: true });
      if (SH.collar >= 1) add("gorget", it.chestPlate ? Ac : P, (z) => { z.el([24, 7.5], 9, 4); z.clip((x, y) => !(Math.hypot((x - 24) / 5.5, (y - 6) / 2.4) < 1)); }, { dome: 2, bias: 0.1 });
      add("belt", SH.body === "brig" ? ramp("leather_dark") : it.chestPlate ? P : it.rivets ? ramp("leather") : Tr, (z) => z.pg([[12.5, 32.5], [35.5, 32.5], [36, 36], [12, 36]]), { dome: 1, bias: -0.3 });
      add("buckle", it.chestPlate || it.rivets ? Tr : ramp("iron"), (z) => z.el([24, 34.2], 2.4, 2.0), { dome: 1, bias: 0.4 });
      // боковые ремни кирасы с пряжками (как на герое)
      add("sstrap", ramp("leather_dark"), (z) => { for (const y of [17, 26]) { z.seg([8.5, y], [12.5, y + 0.5], 1.8); z.seg([39.5, y], [35.5, y + 0.5], 1.8); } }, { dome: 1, bias: 0.4 });
      add("sbuck", ramp(it.chestPlate || it.rivets ? (it.trim === "leather" ? "brass" : it.trim) : "iron"), (z) => { for (const y of [17, 26]) { z.dot([12.2, y + 0.4], 1.1); z.dot([35.8, y + 0.4], 1.1); } }, { dome: 1, bias: 1.0 });
      if (it.mythic) {
        const Gl = ramp(it.mythic);
        add("mFin", ramp(it.trim ?? it.plate), (z) => { z.pg([[6, 12], [1.5, 2.5], [10, 7.5]]); z.pg([[42, 12], [46.5, 2.5], [38, 7.5]]); }, { dome: 2, amp: 1.9, bias: 0.4, kant: true });
        add("mSeam", Gl, (z) => { z.seg([13, 15], [17.5, 21], 1.0); z.seg([17.5, 21], [15, 27], 1.0); z.seg([35, 15], [30.5, 21], 1.0); z.seg([30.5, 21], [33, 27], 1.0); }, { dome: 1, bias: 1.6 }, true);
        add("mCry", Gl, (z) => z.pg([[24, 8], [26, 11], [24, 14], [22, 11]]), { dome: 2, amp: 1.6, bias: 0.8 }, true);
      }
      if (it.cracks) add("crack", ramp(it.cracks), (z) => { z.seg([14, 14], [17.5, 19], 0.8); z.seg([17.5, 19], [15.5, 24], 0.8); z.seg([34, 14], [30.5, 19], 0.8); z.seg([30.5, 19], [32.5, 24], 0.8); z.seg([24, 27], [23, 31], 0.8); }, { dome: 1, bias: 0.6 }, true);
      if (it.spikes) { add("fins", ramp(it.spike ?? it.plate), (z) => { z.pg([[5, 20], [-1, 0], [8, 7], [11, -3], [16, 8], [15, 17]]); z.pg([[43, 20], [49, 0], [40, 7], [37, -3], [32, 8], [33, 17]]); }, { dome: 2, amp: 2, bias: 0.4 });
        add("finsH", ramp(it.spike ?? it.plate), (z) => { z.seg([2.5, 5], [6, 14], 0.7); z.seg([11, 2], [12.5, 12], 0.7); }, { dome: 1, bias: 2.3 }); }
      else if (SH.shoulders) { const r = SH.shoulders === 2 ? [8.5, 7.5] : [5.6, 5]; add("spl", it.chestPlate ? Ac : P, (z) => { z.el([6.5 + (2 - SH.shoulders) * 2, 15], r[0], r[1]); z.el([41.5 - (2 - SH.shoulders) * 2, 15], r[0], r[1]); }, { dome: 4, amp: 1.9, bias: 0.25, kant: true }); }
      if (it.inlay) add("gGem", ramp(it.gemColor ?? "eye_glow"), (z) => z.dot([24, 5.6], 1.4), { dome: 2, bias: it.gemColor ? 0.8 : 0.5 }, !it.gemColor);
      if (it.crest) crest(p, 24, 15.5, 2.5, cr);
      break;
    }
    case "gloves": {
      // латная рукавица 3/4: манжета-раструб, наруч, тыльная пластина, костяшки, пальцы-ламы, большой палец
      if (it.bracer) { add("bracer", P, (z) => z.pg([[27, 0], [46, 2], [43, 16], [24, 16]]), { dome: 3, amp: 1.8, bias: 0.15 }); add("bStrap", ramp("leather_dark"), (z) => { z.seg([28, 4], [45, 6], 1.6); z.seg([26, 10], [44, 12], 1.6); }, { dome: 1, bias: 0.3 }); add("bBuck", Tr, (z) => { z.dot([37, 5], 0.9); z.dot([35, 11], 0.9); }, { dome: 1, bias: 0.8 }); }
      if (!it.bracer) add(it.cuff ? "cuff" : "gcuff", it.cuff ? Ac : P, (z) => it.claws ? z.pg([[26, 6], [40, 9], [37.5, 21], [23, 18]]) : it.cuff && it.gem ? z.pg([[21, -1], [48, 5], [42, 24], [19, 20]]) : it.cuff ? z.pg([[25, 3], [44, 8.5], [40.5, 21], [23, 18]]) : z.pg([[25, 9], [38, 12], [36, 20], [23, 18]]), { dome: 4, amp: 2.0, bias: 0.2 });
      if (it.claws) add("armSp", ramp(it.spike ?? it.plate), (z) => { spk(z, [33, 9], [36, -3], 2.0); spk(z, [38, 13], [47, 6], 2.0); spk(z, [28, 7], [27, -2], 1.7); }, { dome: 1, amp: 2, bias: 0.6 });
      if (!it.bracer) add(it.cuff ? "cuffH" : "gcuffH", it.cuff ? Ac : P, (z) => it.cuff ? z.seg([27, 5], [42, 9.5], 1.0) : z.seg([26, 10.5], [36, 13], 0.9), { dome: 1, bias: 2.2 });
      if (it.cuffSpike) add("cspk", P, (z) => { spk(z, [39, 12], [47.5, 0], 2.8); spk(z, [31, 7], [34, -2.5], 2.1); }, { dome: 1, amp: 2, bias: 0.7 });
      if (it.cuff && (it.rivets || it.cuffSpike)) add("criv", ramp(it.trim ?? "gold"), (z) => { for (const [x, y] of [[29, 9], [35, 11], [38.5, 16]] as V2[]) z.dot([x, y], 0.85); }, { dome: 1, bias: 1.2 });
      add("wrist", P, (z) => z.pg([[22, 15.5], [38, 20.5], [34, 28], [19, 24]]), { dome: 3, amp: 1.9, bias: 0.15 });
      add("wrim", P, (z) => z.seg([21, 21], [36, 25], 1.2), { dome: 1, bias: -1.5 });
      if (it.cuff) add("cTrim", ramp(it.trim ?? "gold"), (z) => z.seg([23.5, 18.2], [40.5, 21.2], 1.1), { dome: 1, bias: 0.6 });
      if (it.gem) add("cGem", ramp(it.gem), (z) => z.el([33, 12], 2.0, 1.8), { dome: 2, bias: 0.7 });
      add("back", P, (z) => z.pg([[13, 22.5], [32, 25.5], [30.5, 35], [12, 34]]), { dome: 4, amp: 1.9, bias: 0.25 });
      add("backH", P, (z) => z.seg([15, 24.5], [28, 26.6], 1.0), { dome: 1, bias: 2.3 });
      add("knk", it.cuff ? Ac : P, (z) => z.seg([11.5, 34.5], [30, 37], 3.0, 2.6), { dome: 2, amp: 1.9, bias: 0.3 });
      if (it.bracer) for (const [j, y0, y1] of [[0, 34, 31], [1, 37, 36], [2, 40, 41], [3, 43, 46]] as [number, number, number][])
        add("ofing" + j, P, (z) => z.seg([16, y0], [2.5, y1], 2.6, 2.0), { dome: 2, amp: 1.8, bias: 0.15 - 0.1 * j });
      if (!it.bracer) for (const [j, y, x0, x1, w] of [[0, 39.5, 11, 28.5, 3.2], [1, 42.8, 11.5, 27, 3.0], [2, 45.6, 13, 25, 2.5]] as [number, number, number, number, number][])
        add("fing" + j, P, (z) => z.seg([x0, y - 0.6], [x1, y + 0.8], w, w - 0.4), { dome: 2, amp: 1.8, bias: 0.15 - 0.2 * j });
      add("kriv", P, (z) => { for (const x of [15, 20, 25]) z.dot([x, 35.6 + (x - 15) * 0.12], 0.85); }, { dome: 1, bias: 2.0 });
      if (it.claws) add("claws", ramp(it.spike ?? it.plate), (z) => { for (const [x, y] of [[11, 38], [11.5, 41.5], [12.5, 45]] as V2[]) spk(z, [x + 2, y], [x - 7, y + 2.5], 1.4); spk(z, [8, 37], [1, 44], 1.6); }, { dome: 1, amp: 2, bias: 0.6 });
      add("thumb0", P, (z) => z.seg([14, 26], [7.5, 33], 4.4, 3.8), { dome: 3, amp: 1.8, bias: 0.15 });
      add("thumb1", P, (z) => z.seg([7.5, 33], [9.5, 39], 3.6, 3.0), { dome: 2, amp: 1.8, bias: 0 });
      break;
    }
    case "boots": {
      // сабатон 3/4: поножь, наколенник с крылом, ламы голеностопа, пластины стопы, подошва
      const low = !!it.low;
      add("greave", P, (z) => z.seg([20, low ? 22 : 9], [21, 31], 12.5, 10.5), { dome: 4, amp: 1.9, bias: 0.15 });
      add("grH", P, (z) => z.seg([15.6, low ? 24 : 13], [16.4, 29], 1.3), { dome: 1, bias: 2.3 });
      if (it.stitch) add("bstitch", ramp(it.stitch), (z) => { for (let y = low ? 24 : 15; y < 30; y += 3.2) z.seg([19, y], [19.2, y + 1.6], 0.8); }, { dome: 1, bias: 0.5 });
      if (it.stripe) add("stripe", Ac, (z) => z.seg([24.5, 16], [25, 30], 2.0), { dome: 1, bias: 0.4 });
      if (it.stripe) add("strap", ramp("grip"), (z) => z.seg([14.8, 22], [27, 23], 1.6), { dome: 1, bias: 0.3 });
      if (it.stripe) add("buck", ramp(it.strapAccent ?? "gold"), (z) => z.pg([[22.5, 20.6], [26, 20.9], [25.8, 24.6], [22.3, 24.3]]), { dome: 1, bias: 0.5 });
      add("ank0", P, (z) => z.seg([14.5, 31.5], [28.5, 32.5], 3.4), { dome: 2, amp: 1.8, bias: 0.1 });
      add("ank1", P, (z) => z.seg([14.5, 35], [30, 36], 3.2), { dome: 2, amp: 1.8, bias: -0.05 });
      add("sole", P, (z) => z.seg([14, 45.3], [it.topCuff ? 33 : 44, 45.3], 2.0), { dome: 1, bias: -0.3 });
      const toeX = it.topCuff ? 34 : it.spurs ? 48 : 46;
      for (const [j, x0, x1] of (it.topCuff ? [[0, 14, 27], [1, 24, 31], [2, 29, toeX]] : [[0, 14, 31], [1, 28, 38], [2, 35, toeX]]) as [number, number, number][])
        add("sab" + j, P, (z) => z.pg([[x0, 36 + j * 1.6], [x1 - 3, 36.5 + j * 1.8], [x1, 44.5], [x0, 44.5]]), { dome: 3, amp: 1.9, bias: 0.2 - 0.15 * j });
      add("sabH", P, (z) => { z.seg([16, 37.2], [27, 37.6], 0.9); z.seg([29.5, 39], [35.5, 39.5], 0.9); z.seg([36.5, 41], [41.5, 42], 0.9); }, { dome: 1, bias: 2.2 });
      const KA = it.kneeAccent ? ramp(it.kneeAccent) : it.kneeSpike ? Ac : P;
      if (it.topCuff) add("tcuff", ramp(it.topCuff), (z) => z.pg([[8, 3], [33, 3], [35, 14], [6, 14]]), { dome: 3, amp: 1.8, bias: 0.3 });
      if (it.bigWing) add("bwing", KA, (z) => { z.pg([[26, 4], [42, -1], [38, 7], [45, 6], [37, 14], [27, 15]]); }, { dome: 3, amp: 1.9, bias: 0.2 });
      if (!low && !it.topCuff && !it.spurs) add("wing", KA, (z) => z.pg([[25, 6.5], [35, 3], [32, 15.5], [26, 14]]), { dome: 3, amp: 1.8, bias: -0.15 });
      if (!low) add("knee", KA, (z) => z.el([21, 11], 8.5, 7), { dome: 4, amp: 2.0, bias: 0.25 });
      if (!low) add("kneeH", KA, (z) => z.bz([14.5, 10], [16, 6], [21, 5.2], 1.2, 0.8), { dome: 1, bias: 2.5 });
      if (it.kneeSpike) add("kspk", ramp(it.spike ?? it.plate), (z) => spk(z, [26, 9], [42, -1], 2.8), { dome: 1, amp: 2, bias: 0.7 });
      if (it.spurs) add("spur", ramp(it.spike ?? it.plate), (z) => { spk(z, [42, 41], [49, 36], 2.4); spk(z, [15, 41], [3, 45], 2.2); spk(z, [14, 28], [3, 22], 2.0); spk(z, [15, 17], [5, 10], 1.8); }, { dome: 1, amp: 2, bias: 0.6 });
      if (!low) add(it.kneeSpike || it.kneeAccent ? "riv" : "kbolt", it.kneeSpike || it.kneeAccent ? ramp("gold") : P, (z) => z.dot([21, 11.5], 1.1), { dome: 1, bias: 1.2 });
      break;
    }
    case "cloak": {
      if (it.kind === "scarf") {
        // шарф: длинная полоса ткани, сложенная волной по диагонали, бахрома на обоих концах
        const R = ramp(it.cloth);
        const band = (z: Mz, pts: V2[], w0: number, w1: number) => { for (let k = 0; k + 1 < pts.length; k++) z.seg(pts[k], pts[k + 1], w0 + (w1 - w0) * (k / (pts.length - 1)), w0 + (w1 - w0) * ((k + 1) / (pts.length - 1))); };
        const back: V2[] = [[30, 6], [36, 12], [34, 20], [26, 25]], front: V2[] = [[26, 25], [16, 29], [12, 36], [17, 42]], top: V2[] = [[12, 10], [20, 7], [30, 6]];
        add("sBack", R, (z) => band(z, back, 8, 8), { dome: 3, amp: 1.8, bias: -0.25 });
        add("sTop", R, (z) => band(z, top, 7, 8), { dome: 3, amp: 1.8, bias: 0.15 });
        add("sFront", R, (z) => band(z, front, 8, 7), { dome: 3, amp: 1.9, bias: 0.3 });
        add("sFold", R, (z) => { z.bz([14, 9], [22, 6.5], [31, 8.5], 0.7, 0.7); z.bz([33, 13], [32, 19], [26, 22.5], 0.7, 0.7); z.bz([25, 27.5], [17, 31], [15, 37], 0.7, 0.7); }, { dome: 1, bias: -1.5 });
        add("sSpec", R, (z) => { z.bz([10, 8], [17, 4.5], [26, 3.5], 1.0, 0.7); z.bz([22, 26], [14, 28], [10.5, 34], 1.0, 0.7); }, { dome: 1, bias: 2.4 });
        add("fringe", R, (z) => { for (const [x, y] of [[8, 7], [8.5, 10], [9, 13]] as V2[]) z.seg([x + 1.5, y], [x - 2.5, y + 0.6], 1.0); for (const [x, y] of [[14, 43], [17, 44.5], [20, 45]] as V2[]) z.seg([x, y - 1.5], [x - 0.5, y + 2.5], 1.0); }, { dome: 1, bias: -0.2 });
                break;
      }
      const O = ramp(it.outer), Ln = ramp(it.lining);
      const tat: V2[] = [[5, 40], [8, 46], [11, 41], [13.5, 47], [17, 42.5], [20, 46], [23, 40.5], [26.5, 47], [30, 42], [33, 46.5], [36, 41], [39.5, 45.5], [43, 39]];
      add("lin", Ln, (z) => z.pg([[15, 6], [33, 6], [44, 6 + 32 * (it.short ? 0.55 : 1)], [4, 6 + 32 * (it.short ? 0.55 : 1)]]), { dome: 2, bias: -0.3 });
      const tt = it.tatter ?? 1, cut = it.short ? 0.55 : it.mantle ? 0.72 : 1, hemP: V2[] = tat.map(([x, y]) => [x, (43 + (y - 43) * tt - 6) * cut + 6] as V2);
      const yb = 6 + 32 * cut;
      if (it.flowing) for (const q of hemP) { const t = (q[1] - 6) / 40; q[0] += 16 * t; }
      const fl = it.flowing ? 16 : 0;
      add("cape", O, (z) => z.pg([[15, 5], [33, 5], [40 + fl * 0.4, 6 + 14 * cut], [44 + fl, yb], ...hemP.slice().reverse(), [4 + fl * 0.6, yb], [8, 6 + 14 * cut]]), { dome: 4, amp: 1.6, bias: 0.2 });
      if (it.mantle) { add("mant", ramp(it.mantle), (z) => z.pg([[0, 24], [8, 2], [24, 7], [40, 2], [48, 24], [38, 27], [24, 21], [10, 27]]), { dome: 3, amp: 1.8, bias: 0.3 }); add("mantT", Tr, (z) => z.bz([3.5, 18], [24, 22], [44.5, 18], 1.2, 1.2), { dome: 1, bias: 0.5 }); }
      if (tt < 0.5 && it.hem) add("hemB", ramp(it.hem), (z) => z.bz([4.5, 41.5], [24, 45.5], [43.5, 41.5], 1.4, 1.4), { dome: 1, bias: 0.6 });
      if (it.short) add("sfold", O, (z) => { for (const x of [13, 19, 29, 35]) z.bz([x + (x < 24 ? 1 : -1), 9], [x, 16], [x + (x < 24 ? -1.5 : 1.5), 23.5], 0.8, 1.1); z.bz([5, 23.5], [24, 27.5], [43, 23.5], 1.1, 1.1); }, { dome: 1, bias: -1.5 });
      if (!it.short) add("fold", O, (z) => { z.bz([20, 9], [18, 25], [15, 42], 1.0, 1.4); z.bz([28, 9], [30, 25], [33, 42], 1.0, 1.4); z.bz([24, 14], [24, 28], [24, 40], 0.9, 1.2); }, { dome: 1, bias: -1.5 });
      if (it.hem) add("hem", ramp(it.hem), (z) => { z.pg([[15, 5], [8, 20], [4, 38], [5.6, 38.5], [9.6, 20.5], [16.4, 5.5]]); z.pg([[33, 5], [40, 20], [44, 38], [42.4, 38.5], [38.4, 20.5], [31.6, 5.5]]); }, { dome: 1, bias: 0.6 });
      add("collar", O, (z) => z.bz([14, 6], [24, 9.5], [34, 6], 3.4, 3.4), { dome: 2, bias: 0.4 });
      add("clasp", it.trim ? Tr : ramp("iron"), (z) => { z.dot([14.5, 6.5], 2.4); z.dot([33.5, 6.5], 2.4); }, { dome: 2, bias: 0.4 });
      if (it.claspGem) add("claspG", ramp("eye_glow"), (z) => { z.dot([14.5, 6.5], 1.2); z.dot([33.5, 6.5], 1.2); }, { dome: 1, bias: 0.6 }, true);
      if (it.crest) crest(p, 24, 22, 3.0, cr);
      break;
    }
    case "weapon": {
      if (it.head === "axe") {
        // секира на древке: длинное древко по диагонали, широкое лезвие у верха, обух-клюв, навершие-пика
        const H = ramp(it.hilt), gr = ramp(it.grip), bl = ramp(it.blade);
        add("shaft", gr, (z) => z.seg([9, 44], [38, 7], 2.6), { dome: 2, amp: 1.6, bias: 0.2 });
        add("wrap", gr, (z) => { for (const t of [0.15, 0.3, 0.45]) z.seg([9 + 29 * t - 1.5, 44 - 37 * t - 1], [9 + 29 * t + 1.5, 44 - 37 * t + 1], 0.8); }, { dome: 1, bias: -1.4 });
        add("head", bl, (z) => z.pg([[33, 13], [24, 6], [21, 15], [27, 24], [36, 21]]), { dome: 3, amp: 1.9, bias: 0.35 });
        add("edge", bl, (z) => z.bz([24, 6.5], [20, 15], [27.5, 23.5], 1.2, 1.2), { dome: 1, bias: 2.5 });
        add("beak", H, (z) => z.pg([[37, 12], [44, 16], [38, 15.5]]), { dome: 2, bias: 0.4 });
        add("spikeT", H, (z) => z.pg([[37, 8], [42, 1], [39.5, 9.5]]), { dome: 2, bias: 0.5 });
        add("socket", H, (z) => z.seg([33, 12.5], [37.5, 9.5], 3.4), { dome: 2, bias: 0.4 });
        add("butt", H, (z) => z.dot([8.5, 45], 1.8), { dome: 2, bias: 0.4 });
        break;
      }
      if (it.kind === "dual") {
        // два кинжала крест-накрест: правый (впереди) и левый
        const bl = ramp(it.blade), H = ramp(it.hilt), gr = ramp(it.grip), rn = it.rune ? ramp(it.rune) : null;
        for (const [j, A, B] of [[0, [33, 40], [9, 8]], [1, [15, 40], [39, 8]]] as [number, V2, V2][]) {
          const ux = B[0] - A[0], uy = B[1] - A[1], L = Math.hypot(ux, uy), dx = ux / L, dy = uy / L, nx = -dy, ny = dx;
          const at = (t: number, w: number): V2 => [A[0] + ux * t + nx * w, A[1] + uy * t + ny * w];
          const Lp: V2[] = [], Rp: V2[] = [];
          for (let k = 0; k <= 10; k++) { const t = k / 10, w = 3.3 * (1 - 0.5 * t) * (t > 0.85 ? (1 - t) / 0.15 : 1), bend = (it.bend ?? 0) * 6 * t * t; Lp.push(at(0.18 + 0.82 * t, w + bend)); Rp.push(at(0.18 + 0.82 * t, -w * 0.7 + bend)); }
          const poly = [...Lp, ...Rp.reverse()];
          add("bl" + j, bl, (z) => z.pg(poly), { dome: 3, amp: 1.8, bias: 0.25 - 0.2 * j });
          add("blE" + j, bl, (z) => { for (let k = 0; k + 1 < Lp.length; k++) z.seg(Lp[k], Lp[k + 1], 0.7); }, { dome: 1, bias: 2.4 });
          if (rn) add("rn" + j, rn, (z) => z.seg(at(0.22, 0.4), at(0.72, 0.4 + (it.bend ?? 0) * 2.2), 0.9), { dome: 1, bias: 0.7 }, true);
          add("gu" + j, H, (z) => { z.bz(at(0.17, 4.2), at(0.14, 0), at(0.17, -4.2), 2.2, 2.2); }, { dome: 2, amp: 1.8, bias: 0.4 });
          add("gr" + j, gr, (z) => z.seg(at(0.15, 0), at(0.0, 0), 2.6), { dome: 1, bias: 0.1 });
          add("pm" + j, H, (z) => z.dot(at(-0.02, 0), 2.0), { dome: 2, bias: 0.5 });
          if (rn) add("pg" + j, rn, (z) => z.dot(at(-0.02, 0), 0.9), { dome: 1, bias: 0.6 }, true);
        }
        break;
      }
      const bl = ramp(it.blade), ed = ramp(it.edge), H = ramp(it.hilt), gr = ramp(it.grip), glow = !!it.glow;
      const A: V2 = it.style === "arming" ? [16, 34] : [12, 37], B: V2 = it.style === "arming" ? [40, 9] : [44, 4]; // гарда → остриё
      const ux = (B[0] - A[0]), uy = (B[1] - A[1]), L = Math.hypot(ux, uy), dx = ux / L, dy = uy / L, nx = -dy, ny = dx;
      const at = (t: number, w: number): V2 => [A[0] + ux * t + nx * w, A[1] + uy * t + ny * w];
      const Wd = glow ? 4.6 : it.style === "arming" ? 2.4 : it.wavy ? 3.2 : 3.0, Lp: V2[] = [], Rp: V2[] = [];
      const NN = it.wavy ? 24 : 12;
      for (let k = 0; k <= NN; k++) { const t = k / NN, w = t < 0.82 ? Wd * (1 - 0.25 * t) : Wd * 0.8 * Math.max(0, 1 - (t - 0.82) / 0.18) ** 0.8, wv = it.wavy && t > 0.08 && t < 0.85 ? 0.9 * Math.sin(t * Math.PI * 9) : 0; Lp.push(at(t, w + wv + (it.serrate && k % 2 && t < 0.85 ? 1.3 : 0))); Rp.push(at(t, -w + wv)); }
      const poly = [...Lp, ...Rp.reverse()];
      add("edge", ed, (z) => z.pg(poly), { dome: 1, bias: 0.3 }, glow);
      add("blade", bl, (z) => { z.pg(poly); z.clip((x, y) => { const px = x - A[0], py = y - A[1], al = px * dx + py * dy, ac = px * nx + py * ny; return Math.abs(ac) < Wd * (1 - 0.25 * Math.min(1, al / L)) - 1.3 || al > L * 0.86; }); }, { dome: 3, amp: 1.3, bias: 0.2 }, glow);
      if (it.style === "zwei") add("lugs", H, (z) => { spk(z, at(0.16, Wd), at(0.12, Wd + 3.4), 1.3); spk(z, at(0.16, -Wd), at(0.12, -Wd - 3.4), 1.3); }, { dome: 1, amp: 1.8, bias: 0.5 });
      add("core", bl, (z) => z.seg(at(0.03, it.fuller ? 0.9 : 0), at(0.78, it.fuller ? 0.6 : 0), glow ? 1.6 : 1.1), { dome: 1, bias: 2.2 }, glow);
      if (it.fuller) add("fuller", bl, (z) => z.seg(at(0.04, -0.2), at(0.68, -0.15), 1.2), { dome: 1, bias: -1.3 });
      if (glow) {
        add("crack", ed, (z) => { for (const [t, s] of [[0.2, 1], [0.38, -1], [0.56, 1], [0.7, -1]] as [number, number][]) z.seg(at(t, s * Wd * 0.8), at(t + 0.06, -s * Wd * 0.1), 1.0); }, { dome: 1, bias: -0.6 }, true);
        add("fire", bl, (z) => { for (const [t, s, l] of [[0.25, 1, 4], [0.47, -1, 3.2], [0.66, 1, 3.6]] as [number, number, number][]) { const b0 = at(t, s * Wd), b1 = at(t + 0.08, s * Wd * 0.9); tri(z, b0, b1, [b0[0] + nx * s * l + dx * 3, b0[1] + ny * s * l + dy * 3]); } }, { dome: 1, bias: 1.3 }, true);
      }
      add("grip", gr, (z) => z.seg(at(-0.02, 0), at(-0.24, 0), 2.8), { dome: 1, bias: 0.1 });
      add("wrap", gr, (z) => { for (const t of [-0.06, -0.11, -0.16, -0.21]) z.seg(at(t, 1.3), at(t - 0.02, -1.3), 0.8); }, { dome: 1, bias: -1.4 });
      const gl = glow ? 8.5 : 7;
      add("guard", H, (z) => { z.bz(at(0, 1), at(-0.02, gl * 0.7), [A[0] + nx * gl + dx * (glow ? 4 : 0.5), A[1] + ny * gl + dy * (glow ? 4 : 0.5)], 3.2, 1.2); z.bz(at(0, -1), at(-0.02, -gl * 0.7), [A[0] - nx * gl + dx * (glow ? 4 : 0.5), A[1] - ny * gl + dy * (glow ? 4 : 0.5)], 3.2, 1.2); }, { dome: 2, amp: 1.8, bias: 0.5 });
      add("guardH", H, (z) => { z.seg(at(-0.005, 1.2), at(-0.02, gl * 0.62), 0.8); }, { dome: 1, bias: 2.4 });
      if (glow || it.gem || it.fuller) add("gem", ramp(it.accent), (z) => z.dot(A, glow ? 2.3 : 1.6), { dome: 2, bias: 0.5 }, glow);
      add("pommel", H, (z) => { const pm = at(-0.27, 0); z.dot(pm, 2.2); if (glow) spk(z, pm, [pm[0] - dx * 4.5, pm[1] - dy * 4.5], 1.4); }, { dome: 2, bias: 0.5 });
      if (glow) add("pGem", ramp("eye_glow"), (z) => z.dot(at(-0.27, 0), 1.1), { dome: 1, bias: 0.6 }, true);
      else if (it.gem) add("pGem", ramp(it.accent), (z) => z.dot(at(-0.27, 0), 1.2), { dome: 1, bias: 0.8 });
      break;
    }
  }
  void rarity;
  return render(p);
}
/** Ячейка: фон-градиент и рамка по редкости (docs/icon-style.md, п. 10), предмет поверх. */
const CELL: Record<string, { bg: C; frame: C; corner?: C }> = {
  common: { bg: hx("#3a4250"), frame: hx("#7a8494") },
  rare: { bg: hx("#1e3a66"), frame: hx("#4a8ae0") },
  epic: { bg: hx("#3e1e5a"), frame: hx("#b05ae0") },
  legendary: { bg: hx("#5a3010"), frame: hx("#f0901c"), corner: hx("#ffe0a0") },
};
export function cell(img: PC, rarity = "common"): PC {
  const st = CELL[rarity] ?? CELL.common, o = new PC(S, S), dk = hx("#0c0a10");
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - 24, y + 0.5 - 22) / 30, t = Math.min(1, d) ** 1.3;
    const c = mixC(st.bg, dk, 0.15 + 0.8 * t), band = ((x * 3 + y * 7) & 7) === 0 && t > 0.7 ? 0.06 : 0;
    o.set(x, y, [...mixC(c, dk, band), 255] as any);
  }
  for (let i = 0; i < S; i++) for (const [x, y] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) o.set(x, y, [...st.frame, 255] as any);
  for (let i = 1; i < S - 1; i++) for (const [x, y] of [[i, 1], [i, S - 2], [1, i], [S - 2, i]]) o.set(x, y, [...dk, 255] as any);
  if (st.corner) for (const [x, y] of [[0, 0], [1, 0], [0, 1], [S - 1, 0], [S - 2, 0], [S - 1, 1], [0, S - 1], [1, S - 1], [0, S - 2], [S - 1, S - 1], [S - 2, S - 1], [S - 1, S - 2]]) o.set(x, y, [...st.corner, 255] as any);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const q = img.get(x, y); if (q && q[3]) o.set(x, y, q); }
  return o;
}

if (process.argv[1]?.endsWith("icons.ts")) {
  const id = process.argv[2] ?? "chaos-knight", set = setOf(id);
  const list = SLOTS.filter((s) => set.items[s]);
  const W = 8 + list.length * (48 * 4 + 8), out = new PC(W, 8 + (48 + 8) + (96 + 8) + 2 * (192 + 8));
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 30; out.data[i + 1] = 26; out.data[i + 2] = 32; out.data[i + 3] = 255; }
  const put = (im: PC, ox: number, oy: number, K: number) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const q = im.get(x, y); if (q && q[3]) for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) out.set(ox + x * K + a, oy + y * K + b, q); } };
  list.forEach((sl, c) => {
    const x = 8 + c * (48 * 4 + 8);
    put(cell(icon(sl, set.items[sl], "sol").img, set.rarity), x, 8, 1);
    put(cell(icon(sl, set.items[sl], "sol").img, set.rarity), x, 8 + 56, 2);
    put(cell(icon(sl, set.items[sl], "sol").img, set.rarity), x, 8 + 56 + 104, 4);
    put(cell(icon(sl, set.items[sl], "umb").img, set.rarity), x, 8 + 56 + 104 + 200, 4);
  });
  out.save(path.resolve(`tools/out/gear147/icons-${id}.png`)); console.log("ok");
}
