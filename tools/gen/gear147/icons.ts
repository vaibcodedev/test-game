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

interface IP { g: string; ramp: C[]; o?: PO; m: (z: Mz) => void; emis?: boolean }
const S = 48, W2 = 96;
/** rim — кант редкости снаружи контура (легендарное — оранжевый, как в паке) */
function render(parts: IP[], rim?: C): { img: PC; emis: [number, number][] } {
  const cv = new Cv(W2, W2), ids = new Uint8Array(W2 * W2);
  parts.forEach((p, k) => {
    const m = new Mz(); p.m(m); const c = new Cv(W2, W2); paint(c, m, p.ramp, { dith: 0.12, amp: 1.5, ...p.o });
    // отражённый свет снизу: нижняя кромка объёмных частей на тон светлее самых тёмных
    if ((p.o?.dome ?? 3) >= 2) {
      const dk = new Set([p.ramp[0].join(), p.ramp[1].join()]);
      for (let y = 2; y < W2 - 3; y++) for (let x = 0; x < W2; x++) { const q = y * W2 + x; if (!m.d[q] || m.d[q + 2 * W2] || !m.d[q - 2 * W2] || !m.d[q - 4 * W2 >= 0 ? q - 4 * W2 : q]) continue; if (dk.has(c.get(x, y).join())) c.set(x, y, p.ramp[2]); }
    }
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
  return { img, emis };
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
  const p: IP[] = [], add = (g: string, rp: C[], m: (z: Mz) => void, o: PO = { dome: 3, amp: 1.7, bias: 0.2 }, emis = false) => p.push({ g, ramp: rp, m, o, emis });
  const P = ramp(it.plate ?? it.hilt ?? "iron"), Ac = ramp(it.accent ?? it.outer ?? "iron"), Tr = ramp(it.trim ?? "gold");
  switch (slot) {
    case "helm": {
      if (it.style === "horned") {
        const Hn = ramp(it.horn), G = ramp(it.glow);
        add("horn", Hn, (z) => { z.bz([14, 22], [3, 16], [8, 3], 5.0, 1.0); z.bz([34, 22], [45, 16], [40, 3], 5.0, 1.0); }, { dome: 3, amp: 1.8, bias: 0.3 });
        add("hornR", Hn, (z) => { for (const t of [[11.5, 18.5], [9.5, 13.5]] as V2[]) z.seg([t[0] - 2.2, t[1] + 0.6], [t[0] + 2.0, t[1] + 1.4], 0.9); for (const t of [[36.5, 18.5], [38.5, 13.5]] as V2[]) z.seg([t[0] - 2.0, t[1] + 1.4], [t[0] + 2.2, t[1] + 0.6], 0.9); }, { dome: 1, bias: -1.4 });
        add("spk", P, (z) => { tri(z, [19, 12], [22, 12], [20, 4.5]); tri(z, [22.5, 11], [25.5, 11], [24, 1.5]); tri(z, [26, 12], [29, 12], [28, 4.5]); }, { dome: 1, amp: 1.9, bias: 0.5 });
        add("shell", P, (z) => { z.el([24, 24], 12, 12.5); z.pg([[12.2, 25], [35.8, 25], [33, 40], [24, 45], [15, 40]]); });
        add("face", Ac, (z) => z.pg([[15, 22], [33, 22], [31, 33], [24, 43.5], [17, 33]]), { dome: 3, amp: 1.9, bias: 0.15 });
        add("faceR", Ac, (z) => z.seg([24, 22.5], [24, 42], 1.1), { dome: 1, bias: 1.5 });
        add("slit", P, (z) => { z.seg([16.5, 26.5], [22.3, 28.5], 1.8); z.seg([31.5, 26.5], [25.7, 28.5], 1.8); }, { dome: 1, bias: -2 });
        add("eye", G, (z) => { z.dot([19.6, 27.6], 1.15); z.dot([28.4, 27.6], 1.15); }, { dome: 1, bias: 1.3 }, true);
        add("spec", P, (z) => z.bz([14.5, 19], [16, 13.5], [21, 12], 1.4, 0.8), { dome: 1, bias: 2.4 });
        add("cheek", P, (z) => { z.seg([15.5, 33], [20, 41], 0.9); z.seg([32.5, 33], [28, 41], 0.9); }, { dome: 1, bias: -1.6 });
        add("breath", P, (z) => { for (const [x, y] of [[20.5, 33], [22, 36], [27.5, 33], [26, 36], [21.5, 39], [26.5, 39]] as V2[]) z.dot([x, y], 0.62); }, { dome: 1, bias: -2 });
        add("trim", Tr, (z) => z.bz([13, 22], [24, 15], [35, 22], 1.6, 1.6), { dome: 1, bias: 0.4 });
        add("gem", ramp(it.glow), (z) => z.dot([24, 18.2], 1.5), { dome: 2, bias: 0.6 }, true);
        add("rivet", Tr, (z) => { for (const x of [15, 33]) z.dot([x, 24], 0.9); }, { dome: 1, bias: 1.2 });
        add("hornT", Hn, (z) => { z.seg([7.5, 6], [8, 3.5], 1.0); z.seg([40.5, 6], [40, 3.5], 1.0); z.bz([5, 17], [4, 12], [6.5, 8], 0.9, 0.7); }, { dome: 1, bias: 2.2 });
        add("gor", P, (z) => z.bz([15, 43], [24, 47.5], [33, 43], 2.4, 2.4), { dome: 2, bias: -0.2 });
      } else {
        const Ml = ramp(it.mail), Sk = ["#4a2620", "#7e4636", "#b06c52", "#d99a76", "#f2c49e"].map(hx);
        add("mail", Ml, (z) => { z.el([24, 31], 12.5, 12); z.clip((x, y) => y > 20); }, { dome: 2, bias: 0, dith: 0.7 });
        add("face", Sk, (z) => z.el([24, 30], 7.5, 8.5), { dome: 3, amp: 1.2, bias: 0.3 });
        add("eyes", ["#1a1014", "#2a1a1c", "#2a1a1c", "#2a1a1c", "#2a1a1c"].map(hx), (z) => { z.dot([21, 29.5], 0.8); z.dot([27, 29.5], 0.8); }, { dome: 1, bias: 0 });
        add("shell", P, (z) => { z.el([24, 21], 12, 11); z.clip((x, y) => y < 23); });
        add("nasal", P, (z) => z.seg([24, 21], [24, 31], 2.0), { dome: 1, bias: 0.4 });
        add("brim", P, (z) => z.el([24, 23], 19, 3.6), { dome: 2, amp: 1.7, bias: 0.1 });
        add("rivet", P, (z) => { for (const x of [14, 20, 28, 34]) z.dot([x, 22.6], 0.75); }, { dome: 1, bias: 1.6 });
      }
      break;
    }
    case "pauldrons": {
      const sp = it.spikes ?? 0, big = (it.size ?? 1) > 1, n = it.lames ?? 1;
      // ламы снизу вверх: у каждой — тень у нижней кромки и блик по верхней
      for (let k = n; k >= 1; k--) {
        const cy = 27 + 6.2 * k, rx = 17.5 - 2.2 * k, ry = 7 - 0.7 * k;
        add("lame" + k, P, (z) => { z.el([24, cy], rx, ry); z.clip((x, y) => y > cy - ry * 0.25); }, { dome: 3, amp: 1.9, bias: 0.1 - 0.15 * k });
        add("lameH" + k, P, (z) => z.bz([24 - rx * 0.85, cy + 0.5], [24, cy + ry * 0.62], [24 + rx * 0.85, cy + 0.5], 0.9, 0.9), { dome: 1, bias: 2.0 });
        add("lameR" + k, Tr, (z) => { for (const x of [-0.55, 0, 0.55]) z.dot([24 + x * rx, cy + ry * 0.55 * (1 - Math.abs(x)) + 1.8], 0.8); }, { dome: 1, bias: 1.0 });
      }
      add("dome", Ac, (z) => { z.el([24, 25], big ? 18.5 : 16, big ? 15 : 13); z.clip((x, y) => y < 31 - Math.abs(x - 24) * 0.05); }, { dome: 5, amp: 2.1, bias: 0.25 });
      add("ridge", Ac, (z) => z.bz([24, 11.5], [25.5, 20], [24, 30], 1.4, 1.0), { dome: 1, bias: 1.4 });
      add("spec", Ac, (z) => z.bz([11, 22], [13, 15], [19, 12.5], 1.8, 0.9), { dome: 1, bias: 2.6 });
      add("trim", Tr, (z) => z.bz([6.5, 30], [24, 37.5], [41.5, 30], 1.9, 1.9), { dome: 1, bias: 0.3 });
      add("rivet", Tr, (z) => { for (const x of [12, 24, 36]) z.dot([x, 32 + (x === 24 ? 2.6 : 0)], 1.0); }, { dome: 1, bias: 1.3 });
      if (sp >= 1) add("sp", P, (z) => { spk(z, [21.5, 17], [15, 0.5], 3.0); if (sp >= 2) spk(z, [32, 19], [46, 8], 2.8); if (sp >= 3) spk(z, [13, 22], [1.5, 13], 2.6); }, { dome: 1, amp: 2, bias: 0.6 });
      if (sp >= 1) add("spH", P, (z) => { z.seg([19, 14], [15.5, 3], 0.8); z.seg([33, 15.5], [43.5, 9], 0.8); }, { dome: 1, bias: 2.2 });
      break;
    }
    case "armor": {
      const cl = ramp(it.cloth);
      if (it.tabard) add("tab", cl, (z) => z.pg([[19, 36], [29, 36], [30, 46], [27.5, 43.5], [25, 47], [22.5, 44], [20, 47], [18, 44]]), { dome: 2, bias: -0.2 });
      add("fauld", P, (z) => z.pg([[13, 34], [35, 34], [38, 41], [30, 43], [24, 42], [18, 43], [10, 41]]), { dome: 3, bias: 0 });
      add("faultL", P, (z) => z.bz([12, 38], [24, 41], [36, 38], 0.9, 0.9), { dome: 1, bias: -1.5 });
      add("cuir", P, (z) => { z.pg([[6, 9], [42, 9], [39, 22], [35, 35], [13, 35], [9, 22]]); z.el([24, 10], 18, 4); }, { dome: 4, amp: 1.8, bias: 0.2 });
      add("cuirH", P, (z) => { z.bz([9, 13], [10.5, 22], [14.5, 31], 1.2, 0.9); }, { dome: 1, bias: 2.3 });
      add("abs", P, (z) => { z.bz([14, 27], [24, 29.5], [34, 27], 1.0, 1.0); z.bz([14.5, 31], [24, 33.5], [33.5, 31], 1.0, 1.0); }, { dome: 1, bias: -1.5 });
      if (it.chestPlate) add("plate", Ac, (z) => z.pg([[9, 9.5], [39, 9.5], [36, 18], [28, 22], [24, 26], [20, 22], [12, 18]]), { dome: 3, amp: 2, bias: 0.15 });
      if (it.inlay) add("inlay", Tr, (z) => { z.seg([12, 18], [20, 22], 1.3); z.seg([20, 22], [24, 26], 1.3); z.seg([24, 26], [28, 22], 1.3); z.seg([28, 22], [36, 18], 1.3); }, { dome: 1, bias: 0.4 });
      add("gorget", it.chestPlate ? Ac : P, (z) => { z.el([24, 7.5], 9, 4); z.clip((x, y) => !(Math.hypot((x - 24) / 5.5, (y - 6) / 2.4) < 1)); }, { dome: 2, bias: 0.1 });
      add("belt", it.chestPlate ? P : Tr, (z) => z.pg([[12.5, 32.5], [35.5, 32.5], [36, 36], [12, 36]]), { dome: 1, bias: -0.3 });
      add("buckle", it.chestPlate ? Tr : ramp("iron"), (z) => z.el([24, 34.2], 2.4, 2.0), { dome: 1, bias: 0.4 });
      if (it.crest) crest(p, 24, 15.5, 2.3, cr);
      break;
    }
    case "gloves": {
      // латная рукавица 3/4: манжета-раструб, наруч, тыльная пластина, костяшки, пальцы-ламы, большой палец
      add("cuff", it.cuff ? Ac : P, (z) => z.pg([[25, 3], [44, 8.5], [40.5, 21], [23, 18]]), { dome: 4, amp: 2.0, bias: 0.2 });
      add("cuffH", it.cuff ? Ac : P, (z) => z.seg([27, 5], [42, 9.5], 1.0), { dome: 1, bias: 2.2 });
      if (it.cuffSpike) add("cspk", P, (z) => spk(z, [39, 12], [47, 2], 2.6), { dome: 1, amp: 2, bias: 0.7 });
      if (it.cuff) add("criv", ramp("gold"), (z) => { for (const [x, y] of [[29, 9], [35, 11], [38.5, 16]] as V2[]) z.dot([x, y], 0.85); }, { dome: 1, bias: 1.2 });
      add("wrist", P, (z) => z.pg([[22, 15.5], [38, 20.5], [34, 28], [19, 24]]), { dome: 3, amp: 1.9, bias: 0.15 });
      add("back", P, (z) => z.pg([[13, 22.5], [32, 25.5], [30.5, 35], [12, 34]]), { dome: 4, amp: 1.9, bias: 0.25 });
      add("backH", P, (z) => z.seg([15, 24.5], [28, 26.6], 1.0), { dome: 1, bias: 2.3 });
      add("knk", it.cuff ? Ac : P, (z) => z.seg([11.5, 34.5], [30, 37], 3.0, 2.6), { dome: 2, amp: 1.9, bias: 0.3 });
      for (const [j, y, x0, x1, w] of [[0, 39.5, 11, 28.5, 3.2], [1, 42.8, 11.5, 27, 3.0], [2, 45.6, 13, 25, 2.5]] as [number, number, number, number, number][])
        add("fing" + j, P, (z) => z.seg([x0, y - 0.6], [x1, y + 0.8], w, w - 0.4), { dome: 2, amp: 1.8, bias: 0.15 - 0.2 * j });
      add("thumb0", P, (z) => z.seg([14, 26], [7.5, 33], 4.4, 3.8), { dome: 3, amp: 1.8, bias: 0.15 });
      add("thumb1", P, (z) => z.seg([7.5, 33], [9.5, 39], 3.6, 3.0), { dome: 2, amp: 1.8, bias: 0 });
      break;
    }
    case "boots": {
      // сабатон 3/4: поножь, наколенник с крылом, ламы голеностопа, пластины стопы, подошва
      add("greave", P, (z) => z.seg([20, 9], [21, 31], 12.5, 10.5), { dome: 4, amp: 1.9, bias: 0.15 });
      add("grH", P, (z) => z.seg([15.6, 13], [16.4, 29], 1.3), { dome: 1, bias: 2.3 });
      if (it.stripe) add("stripe", Ac, (z) => z.seg([24.5, 16], [25, 30], 2.0), { dome: 1, bias: 0.4 });
      add("ank0", P, (z) => z.seg([14.5, 31.5], [28.5, 32.5], 3.4), { dome: 2, amp: 1.8, bias: 0.1 });
      add("ank1", P, (z) => z.seg([14.5, 35], [30, 36], 3.2), { dome: 2, amp: 1.8, bias: -0.05 });
      add("sole", ramp("grip"), (z) => z.seg([14, 45.3], [44, 45.3], 2.0), { dome: 1, bias: -0.3 });
      for (const [j, x0, x1] of [[0, 14, 31], [1, 28, 38], [2, 35, 46]] as [number, number, number][])
        add("sab" + j, P, (z) => z.pg([[x0, 36 + j * 1.6], [x1 - 3, 36.5 + j * 1.8], [x1, 44.5], [x0, 44.5]]), { dome: 3, amp: 1.9, bias: 0.2 - 0.15 * j });
      add("sabH", P, (z) => { z.seg([16, 37.2], [27, 37.6], 0.9); z.seg([29.5, 39], [35.5, 39.5], 0.9); z.seg([36.5, 41], [41.5, 42], 0.9); }, { dome: 1, bias: 2.2 });
      add("wing", it.kneeSpike ? Ac : P, (z) => z.pg([[25, 6.5], [35, 3], [32, 15.5], [26, 14]]), { dome: 3, amp: 1.8, bias: -0.15 });
      add("knee", it.kneeSpike ? Ac : P, (z) => z.el([21, 11], 8.5, 7), { dome: 4, amp: 2.0, bias: 0.25 });
      add("kneeH", it.kneeSpike ? Ac : P, (z) => z.bz([14.5, 10], [16, 6], [21, 5.2], 1.2, 0.8), { dome: 1, bias: 2.5 });
      if (it.kneeSpike) add("kspk", P, (z) => spk(z, [26, 9], [39, 0.5], 2.5), { dome: 1, amp: 2, bias: 0.7 });
      add("riv", it.kneeSpike ? ramp("gold") : P, (z) => z.dot([21, 11.5], 1.1), { dome: 1, bias: 1.2 });
      break;
    }
    case "cloak": {
      const O = ramp(it.outer), Ln = ramp(it.lining);
      const tat: V2[] = [[5, 40], [8, 46], [11, 41], [13.5, 47], [17, 42.5], [20, 46], [23, 40.5], [26.5, 47], [30, 42], [33, 46.5], [36, 41], [39.5, 45.5], [43, 39]];
      add("lin", Ln, (z) => z.pg([[15, 6], [33, 6], [44, 38], [4, 38]]), { dome: 2, bias: -0.3 });
      add("cape", O, (z) => z.pg([[15, 5], [33, 5], [40, 20], [44, 38], ...tat.slice().reverse(), [4, 38], [8, 20]]), { dome: 4, amp: 1.6, bias: 0.2 });
      add("fold", O, (z) => { z.bz([20, 9], [18, 25], [15, 42], 1.0, 1.4); z.bz([28, 9], [30, 25], [33, 42], 1.0, 1.4); z.bz([24, 14], [24, 28], [24, 40], 0.9, 1.2); }, { dome: 1, bias: -1.5 });
      add("collar", O, (z) => z.bz([14, 6], [24, 9.5], [34, 6], 3.4, 3.4), { dome: 2, bias: 0.4 });
      add("clasp", Tr, (z) => { z.dot([14.5, 6.5], 2.0); z.dot([33.5, 6.5], 2.0); }, { dome: 2, bias: 0.4 });
      if (it.crest) crest(p, 24, 22, 3.0, cr);
      break;
    }
    case "weapon": {
      const bl = ramp(it.blade), ed = ramp(it.edge), H = ramp(it.hilt), gr = ramp(it.grip), glow = !!it.glow;
      const A: V2 = [12, 37], B: V2 = [44, 4]; // гарда → остриё
      const ux = (B[0] - A[0]), uy = (B[1] - A[1]), L = Math.hypot(ux, uy), dx = ux / L, dy = uy / L, nx = -dy, ny = dx;
      const at = (t: number, w: number): V2 => [A[0] + ux * t + nx * w, A[1] + uy * t + ny * w];
      const Wd = glow ? 4.4 : 3.2, Lp: V2[] = [], Rp: V2[] = [];
      for (let k = 0; k <= 12; k++) { const t = k / 12, w = t < 0.82 ? Wd * (1 - 0.25 * t) : Wd * 0.8 * Math.max(0, 1 - (t - 0.82) / 0.18) ** 0.8; Lp.push(at(t, w + (it.serrate && k % 2 && t < 0.85 ? 1.3 : 0))); Rp.push(at(t, -w)); }
      const poly = [...Lp, ...Rp.reverse()];
      add("edge", ed, (z) => z.pg(poly), { dome: 1, bias: 0.3 }, glow);
      add("blade", bl, (z) => { z.pg(poly); z.clip((x, y) => { const px = x - A[0], py = y - A[1], al = px * dx + py * dy, ac = px * nx + py * ny; return Math.abs(ac) < Wd * (1 - 0.25 * Math.min(1, al / L)) - 1.3 || al > L * 0.86; }); }, { dome: 3, amp: 1.3, bias: 0.2 }, glow);
      add("core", bl, (z) => z.seg(at(0.03, 0), at(0.78, 0), glow ? 1.6 : 1.1), { dome: 1, bias: 2.2 }, glow);
      if (glow) {
        add("crack", ed, (z) => { for (const [t, s] of [[0.2, 1], [0.38, -1], [0.56, 1], [0.7, -1]] as [number, number][]) z.seg(at(t, s * Wd * 0.8), at(t + 0.06, -s * Wd * 0.1), 1.0); }, { dome: 1, bias: -0.6 }, true);
        add("fire", bl, (z) => { for (const [t, s, l] of [[0.25, 1, 4], [0.47, -1, 3.2], [0.66, 1, 3.6]] as [number, number, number][]) { const b0 = at(t, s * Wd), b1 = at(t + 0.08, s * Wd * 0.9); tri(z, b0, b1, [b0[0] + nx * s * l + dx * 3, b0[1] + ny * s * l + dy * 3]); } }, { dome: 1, bias: 1.3 }, true);
      }
      add("grip", gr, (z) => z.seg(at(-0.02, 0), at(-0.24, 0), 2.8), { dome: 1, bias: 0.1 });
      add("wrap", gr, (z) => { for (const t of [-0.06, -0.11, -0.16, -0.21]) z.seg(at(t, 1.3), at(t - 0.02, -1.3), 0.8); }, { dome: 1, bias: -1.4 });
      const gl = glow ? 8.5 : 7;
      add("guard", H, (z) => { z.bz(at(0, 1), at(-0.02, gl * 0.7), [A[0] + nx * gl + dx * (glow ? 4 : 0.5), A[1] + ny * gl + dy * (glow ? 4 : 0.5)], 3.2, 1.2); z.bz(at(0, -1), at(-0.02, -gl * 0.7), [A[0] - nx * gl + dx * (glow ? 4 : 0.5), A[1] - ny * gl + dy * (glow ? 4 : 0.5)], 3.2, 1.2); }, { dome: 2, amp: 1.8, bias: 0.5 });
      add("guardH", H, (z) => { z.seg(at(-0.005, 1.2), at(-0.02, gl * 0.62), 0.8); }, { dome: 1, bias: 2.4 });
      add("gem", ramp(it.accent), (z) => z.dot(A, glow ? 2.3 : 1.6), { dome: 2, bias: 0.5 }, glow);
      add("pommel", H, (z) => { const pm = at(-0.27, 0); z.dot(pm, 2.2); if (glow) spk(z, pm, [pm[0] - dx * 4.5, pm[1] - dy * 4.5], 1.4); }, { dome: 2, bias: 0.5 });
      break;
    }
  }
  return render(p, RARITY_RIM[rarity]);
}

if (process.argv[1]?.endsWith("icons.ts")) {
  const id = process.argv[2] ?? "chaos-knight", set = setOf(id), K = 4;
  const list = SLOTS.filter((s) => set.items[s]);
  const out = new PC(list.length * (S * K + 8) + 8, S * K * 2 + 24);
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 30; out.data[i + 1] = 26; out.data[i + 2] = 32; out.data[i + 3] = 255; }
  for (const [r, cr] of (["sol", "umb"] as CrestId[]).entries()) list.forEach((s, c) => { const im = icon(s, set.items[s], cr, set.rarity).img; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const q = im.get(x, y); if (q && q[3]) for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) out.set(8 + c * (S * K + 8) + x * K + a, 8 + r * (S * K + 8) + y * K + b, q); } });
  out.save(path.resolve(`tools/out/gear147/icons-${id}.png`)); console.log("ok");
}
