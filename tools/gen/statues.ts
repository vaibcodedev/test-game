/**
 * Статуи королей-основателей (Аурелий Светоносный, Морт Безвенечный), 64×152, след 2×2, опора — нижняя середина кадра, центр тени (32,141).
 * Рисуются мини-рендером «карта высот»: каждый примитив (эллипсоид, тело вращения, капсула, грани бруска) даёт высоту z, нормаль берётся
 * из неё конечными разностями; освещение — Ламберт со светом сверху слева, блик, холодный контровой свет, короткая тень от выступов,
 * затемнение на стыке слоёв. Затем 4–6 тонов материала → пиксели. Площадка, три яруса пьедестала, карниз и жаровни — одно тело на одной линии земли.
 */
import fs from "node:fs";
import path from "node:path";
import { PC, hash01, hex, mix, ramp, withA, type RGBA, type Ramp } from "./canvas";
import { OUT, pnoise } from "./walls141-lib";
import { shadowBox } from "./shadow";

const W = 64, H = 152, CX = 32;
const Ln = (() => { const v = [-0.5, -0.62, 0.6], l = Math.hypot(...v); return v.map((a) => a / l); })();
const Hv = (() => { const v = [Ln[0], Ln[1], Ln[2] + 1], l = Math.hypot(...v); return v.map((a) => a / l); })();

interface Mat { r: Ramp; spec?: number; rim?: number; emis?: number; amb?: number; tint?: RGBA }
interface Prim {
  h: (x: number, y: number) => number | null;
  mat: Mat | ((x: number, y: number) => Mat);
  n?: [number, number, number];
  tex?: (x: number, y: number) => number;
  bias?: number;
  /** пиксель не бросает и не получает тень */
  noShadow?: boolean;
}
type Cell = { z: number; p: Prim } | null;

class Scene {
  cells: Cell[] = new Array(W * H).fill(null);
  add(p: Prim, bb: [number, number, number, number]) {
    for (let y = Math.max(0, Math.floor(bb[1])); y <= Math.min(H - 1, Math.ceil(bb[3])); y++)
      for (let x = Math.max(0, Math.floor(bb[0])); x <= Math.min(W - 1, Math.ceil(bb[2])); x++) {
        const z = p.h(x + 0.5, y + 0.5);
        if (z === null) continue;
        const c = this.cells[y * W + x];
        if (!c || z > c.z) this.cells[y * W + x] = { z, p };
      }
  }
  private zAt(x: number, y: number): number { const c = x >= 0 && y >= 0 && x < W && y < H ? this.cells[y * W + x] : null; return c ? c.z : -999; }
  render(out: PC, rimCol: RGBA) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = this.cells[y * W + x];
      if (!c) continue;
      const { z, p } = c, m = typeof p.mat === "function" ? p.mat(x + 0.5, y + 0.5) : p.mat;
      let n: [number, number, number];
      if (p.n) n = p.n;
      else {
        const f = (dx: number, dy: number) => p.h(x + 0.5 + dx, y + 0.5 + dy) ?? z - 5;
        n = [-(f(1, 0) - f(-1, 0)) / 2, -(f(0, 1) - f(0, -1)) / 2, 1];
        const l = Math.hypot(...n); n = [n[0] / l, n[1] / l, n[2] / l];
      }
      let idx: number;
      const top = m.r.length - 1;
      if (m.emis !== undefined) idx = m.emis + (p.tex ? p.tex(x, y) : 0);
      else {
        const lam = Math.max(0, n[0] * Ln[0] + n[1] * Ln[1] + n[2] * Ln[2]);
        let v = (m.amb ?? 0.2) + lam * 0.9;
        // короткая тень от выступов: идём к свету по экрану
        if (!p.noShadow) for (let s = 1; s <= 7; s++) {
          const zz = this.zAt(Math.round(x + 0.5 + Ln[0] * s * 1.3 - 0.5), Math.round(y + 0.5 + Ln[1] * s * 1.3 - 0.5));
          if (zz > z + 3 + s * 1.8) { v -= 0.3; break; }
        }
        // слой впереди рядом — тёмный стык
        const nb = Math.max(this.zAt(x - 1, y), this.zAt(x + 1, y), this.zAt(x, y - 1), this.zAt(x, y + 1));
        if (nb > z + 6) v -= 0.16;
        v += (p.bias ?? 0) + (p.tex ? p.tex(x, y) : 0);
        idx = v * top;
        const sp = Math.pow(Math.max(0, n[0] * Hv[0] + n[1] * Hv[1] + n[2] * Hv[2]), 22);
        if (m.spec && sp > 0.45) idx += m.spec * (sp - 0.3) * 3;
        if (m.rim) {
          const edge = 1 - n[2];
          if (edge > 0.55 && n[0] > -0.2) idx += m.rim * (edge - 0.45) * 3;
        }
      }
      idx = Math.max(0, Math.min(top, idx));
      let col = m.r[Math.round(idx)];
      if (m.rim && m.emis === undefined) { const edge = 1 - n[2]; if (edge > 0.6 && n[0] > 0.1) col = mix(col, rimCol, Math.min(0.55, (edge - 0.5) * 1.1)); }
      out.set(x, y, col);
    }
  }
}

// ---------- примитивы ----------
const sq = (v: number) => v * v;
function ell(cx: number, cy: number, rx: number, ry: number, rz: number, zc: number, mat: Prim["mat"], o: Partial<Prim> & { clip?: (x: number, y: number) => boolean } = {}): [Prim, [number, number, number, number]] {
  const clip = o.clip;
  return [{ ...o, mat, h: (x, y) => { const d = sq((x - cx) / rx) + sq((y - cy) / ry); if (d >= 1 || (clip && !clip(x, y))) return null; return zc + rz * Math.sqrt(1 - d); } }, [cx - rx, cy - ry, cx + rx, cy + ry]];
}
/** Тело вращения вокруг вертикали: радиус R(y), складки fold(x,y) добавляются к высоте. */
function lathe(cx: number, y0: number, y1: number, R: (y: number) => number, zc: number, mat: Prim["mat"], o: Partial<Prim> & { fold?: (x: number, y: number) => number; bottom?: (x: number) => number; cxf?: (y: number) => number; zk?: number } = {}): [Prim, [number, number, number, number]] {
  const zk = o.zk ?? 0.85;
  let rmax = 0; for (let y = y0; y <= y1; y++) rmax = Math.max(rmax, R(y));
  return [{ ...o, mat, h: (x, y) => {
    const yb = o.bottom ? o.bottom(x) : y1;
    if (y < y0 || y > yb) return null;
    const r = R(y), c = o.cxf ? o.cxf(y) : cx, u = (x - c) / r;
    if (Math.abs(u) >= 1) return null;
    return zc + r * zk * Math.sqrt(1 - u * u) + (o.fold ? o.fold(x, y) : 0);
  } }, [cx - rmax - 2, y0, cx + rmax + 2, y1 + 4]];
}
function cap(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, zc: number, mat: Prim["mat"], o: Partial<Prim> = {}): [Prim, [number, number, number, number]] {
  const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
  return [{ ...o, mat, h: (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
    const r = r0 + (r1 - r0) * t, d = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
    return d >= r ? null : zc + r * Math.sqrt(1 - sq(d / r));
  } }, [Math.min(x0, x1) - Math.max(r0, r1), Math.min(y0, y1) - Math.max(r0, r1), Math.max(x0, x1) + Math.max(r0, r1), Math.max(y0, y1) + Math.max(r0, r1)]];
}
function dome(cx: number, cy: number, rx: number, ry: number, hgt: number, zc: number, mat: Prim["mat"], o: Partial<Prim> = {}): [Prim, [number, number, number, number]] {
  return [{ ...o, mat, h: (x, y) => { const d = sq((x - cx) / rx) + sq((y - cy) / ry); return d >= 1 ? null : zc + hgt * Math.pow(1 - d * d, 0.5); } }, [cx - rx, cy - ry, cx + rx, cy + ry]];
}
/** Брусок в 3/4: лицо x0..x1 × y0..y1, боковая грань d вправо со сдвигом k вверх (в тени), верх. Грани — плоские нормали. */
function box(s: Scene, x0: number, y0: number, x1: number, y1: number, d: number, k: number, zf: number, m: Mat, tex?: (x: number, y: number, f: "f" | "s" | "t") => number) {
  const front: Prim = { mat: m, n: [0, 0.18, 0.98], h: (x, y) => (x >= x0 && x < x1 && y >= y0 && y < y1 ? zf : null),
    tex: (x, y) => (tex ? tex(x, y, "f") : 0) + (x < x0 + 1 ? 0.12 : 0) + (y < y0 + 1 ? 0.14 : 0) - (y >= y1 - 1 ? 0.14 : 0) };
  const side: Prim = { mat: m, n: [1, 0, 0.12], h: (x, y) => { const i = x - x1; if (i < 0 || i >= d) return null; const off = (i + 1) * k / d; return y >= y0 - off && y < y1 - off ? zf - 1.3 * i - 1 : null; },
    tex: (x, y) => (tex ? tex(x, y, "s") : 0) + (x < x1 + 1 ? 0.06 : 0) };
  const top: Prim = { mat: m, n: [0, -0.96, 0.28], h: (x, y) => { const j = y0 - y; if (j <= 0 || j > k) return null; const sh = (j * d) / k; return x >= x0 + sh - 0.5 && x < x1 + sh ? zf - 1.3 * j - 1 : null; },
    tex: (x, y) => (tex ? tex(x, y, "t") : 0) + (y > y0 - 2 ? 0.05 : 0.0) };
  s.add(side, [x1, y0 - k, x1 + d, y1]); s.add(top, [x0, y0 - k, x1 + d, y0]); s.add(front, [x0, y0, x1, y1]);
}
const sceneAdd = (s: Scene, ...ps: [Prim, [number, number, number, number]][]) => { for (const [p, bb] of ps) s.add(p, bb); };

// ---------- 3×5 буквы для надписей ----------
const FONT: Record<string, string[]> = {
  А: ["010", "101", "111", "101", "101"], У: ["101", "101", "111", "001", "110"], Р: ["110", "101", "110", "100", "100"],
  Е: ["111", "100", "110", "100", "111"], Л: ["011", "101", "101", "101", "101"], И: ["101", "101", "111", "111", "101"],
  Й: ["101", "101", "111", "111", "101"], М: ["101", "111", "111", "101", "101"], О: ["111", "101", "101", "101", "111"], Т: ["111", "010", "010", "010", "010"],
};
function textW(t: string) { return t.length * 4 - 1; }
function drawText(c: PC, t: string, x: number, y: number, fg: RGBA, hi: RGBA | null, sh: RGBA) {
  [...t].forEach((ch, i) => {
    const g = FONT[ch]; if (!g) return;
    for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === "1") {
      const px = x + i * 4 + q, py = y + r;
      c.set(px + 1, py + 1, sh); c.set(px, py, fg); if (hi && r === 0) c.set(px, py, hi);
    }
    if (ch === "Й") c.set(x + i * 4 + 1, y - 1, fg);
  });
}

// ---------- площадка и тени ----------
function plaza(c: PC, stone: Ramp, ringCol: RGBA, shade: RGBA) {
  const cy = 141, cx = CX;
  // боковая стенка круглой площадки (толщина 3 px) в тени
  for (let y = cy - 2; y <= cy + 12; y++) for (let x = 1; x < 63; x++) {
    const d = Math.hypot((x + 0.5 - cx) / 30.5, (y + 0.5 - (cy + 3)) / 8);
    if (d <= 1) c.set(x, y, mix(stone[1], shade, 0.35));
  }
  for (let y = cy - 9; y <= cy + 9; y++) for (let x = 1; x < 63; x++) {
    const d = Math.hypot((x + 0.5 - cx) / 30.5, (y + 0.5 - cy) / 8);
    if (d > 1) continue;
    const ring = d > 0.88, a = Math.atan2((y - cy) * 3.8, x - cx), row = Math.floor(d * 5), seg = Math.floor((a + Math.PI) * (3 + row * 2.2));
    let v = ring ? 3.4 : 2.4 + (hash01(seg, row, 9) - 0.5) * 0.9;
    const edgeR = Math.abs(d * 5 - row - 0.5) > 0.44, edgeS = Math.abs((a + Math.PI) * (3 + row * 2.2) - seg - 0.5) > 0.46;
    if (!ring && (edgeR || edgeS)) v -= 0.9;
    v += (x < cx ? 0.15 : -0.15) + (y < cy ? 0.12 : -0.1);
    c.set(x, y, ring ? ringCol : stone[Math.max(0, Math.min(stone.length - 1, Math.round(v)))]);
  }
}
/** Общая тень: контактная под основанием (без зазора) + короткая вправо-вниз той же плотности. */
function baseShadow(c: PC, x0: number, x1: number, yb: number, d: number, k: number) {
  if (process.env.OLD_SHADOW) { c.ellipse((x0 + x1 + d) / 2 + 3, yb - k / 2 + 1.5, (x1 - x0 + d) / 2 + 5, 5, [10, 6, 18, 96]); return; }
  shadowBox(c, x0, x1, yb, [d, -k], 150);
}

function brazier(s: Scene, x: number, yb: number, m: Mat, bowl: Mat) {
  sceneAdd(s, cap(x, yb - 2, x, yb - 9, 1.6, 1.3, 72, m), ell(x, yb - 10, 3.6, 1.8, 2.2, 72, bowl), ell(x, yb, 3.2, 1.3, 1.5, 72, m));
}
function flame(c: PC, x: number, y: number, h: number, cols: RGBA[], seed = 0) {
  const [o, m, i, core] = cols;
  const poly = (k: number, col: RGBA, w: number) => c.poly([[x - w, y], [x - w * 0.6, y - h * 0.5 * k], [x - w * 0.15 + seed * 0.3, y - h * k], [x + w * 0.4, y - h * 0.55 * k], [x + w, y]], col);
  poly(1, o, 3.2); poly(0.8, m, 2.4); poly(0.55, i, 1.5); poly(0.28, core, 0.9);
}
function halo(c: PC, pts: [number, number][], col: RGBA, r: number, a: number) {
  const mask = c.clone();
  for (const [px, py] of pts) for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++) {
    const d = Math.hypot(x - px, y - py) / r;
    if (d >= 1 || (mask.get(x, y)?.[3] ?? 0) > 40) continue;
    const cur = c.get(x, y);
    const al = Math.round(a * (1 - d) * (1 - d));
    if (!cur || cur[3] < al) c.set(x, y, withA(col, Math.max(al, cur ? cur[3] : 0)));
  }
}

// ---------- общий пьедестал ----------
interface Ped { top: number }
function pedestal(s: Scene, c: PC, pm: Mat, trim: Mat, tex: (x: number, y: number, f: "f" | "s" | "t") => number): Ped {
  // T1 y134..143, T2 y119..133, T3 y90..118, карниз
  const stoneTex = (x: number, y: number, f: "f" | "s" | "t") => tex(x, y, f);
  box(s, 8, 134, 50, 143, 6, 3, 40, pm, stoneTex);
  box(s, 14, 120, 46, 133, 4, 3, 44, pm, stoneTex);
  box(s, 15, 117, 45, 120, 4, 2, 47, trim, stoneTex);       // поясок-плинт
  box(s, 17, 93, 45, 117, 4, 3, 48, pm, stoneTex);            // тело пьедестала с табличкой
  box(s, 13, 89, 49, 93, 5, 3, 52, trim, stoneTex);           // карниз (нижний валик)
  box(s, 12, 86, 50, 89, 5, 3, 56, pm, stoneTex);             // карниз (вынос)
  return { top: 86 };
}

// ---------- Сольгард: Аурелий Светоносный ----------
const MARBLE: Ramp = ramp("#3a425c", "#5c6682", "#8a92a8", "#bdbfc8", "#ece4d4", "#fffaec");
const MARBLE_P: Ramp = ramp("#363e58", "#586280", "#838ba2", "#aeb2be", "#d6d0c4", "#f2ecde");
const GILD: Ramp = ramp("#4a2a0a", "#85521a", "#c98a28", "#f2c444", "#fff0a0", "#ffffe6");
const SUNSTEEL: Ramp = ramp("#c89a3a", "#f0cc62", "#fff0a8", "#ffffff");

export function solStatue(): PC {
  const c = new PC(W, H);
  plaza(c, ramp("#6c6a74", "#8e8c92", "#b0aca4", "#cfc8b8", "#e6dfcc"), hex("#e4dcc4"), hex("#3a4058"));
  baseShadow(c, 8, 50, 143, 6, 3);
  const s = new Scene();
  const mp: Mat = { r: MARBLE_P, amb: 0.2 }, mt: Mat = { r: GILD, spec: 1, amb: 0.18 }, mm: Mat = { r: MARBLE, spec: 0.3, amb: 0.08 }, mg: Mat = mt;
  const veins = (x: number, y: number) => (pnoise(x, y, 6, 64, 5) - 0.5) * 0.28 + (pnoise(x * 2, y * 0.5, 3, 64, 9) - 0.5) * 0.1;
  const ptex = (x: number, y: number, f: "f" | "s" | "t") => {
    let v = veins(x, y);
    if (f === "f") { const row = Math.floor((y - 90) / 7); if ((y - 90) % 7 === 0) v -= 0.22; const off = row % 2 ? 6 : 0; if ((x + off) % 14 === 0 && (y - 90) % 7 !== 0) v -= 0.14; }
    return v;
  };
  pedestal(s, c, mp, mt, ptex);

  // жаровни на углах первого яруса
  brazier(s, 12, 136, mt, { r: GILD, spec: 1 }); brazier(s, 51, 135, mt, { r: GILD, spec: 1 });

  const matM = (rr: Mat) => rr;
  const folds = (k: number, a: number, ph = 0) => (x: number, y: number) => a * Math.sin((x - CX) * k + ph + y * 0.07) + a * 0.5 * Math.sin((x - CX) * k * 2.3 - y * 0.05 + ph);
  // плащ за спиной
  sceneAdd(s, lathe(CX, 32, 80, (y) => 12.5 + (y - 32) * 0.1 + Math.max(0, 33 - y) * 0.3, 78, (x) => ({ r: MARBLE, amb: 0.12, spec: 0.2 }), { fold: folds(0.62, 2.6), bottom: (x) => 79 + 1.3 * Math.sin(x * 1.1), bias: -0.1 }));
  // обувь, поножи
  for (const [lx, w] of [[28.2, 0], [36.2, 1]] as const) {
    sceneAdd(s, lathe(lx, 70, 81, (y) => 3.1 + (y - 70) * 0.04, 98, mm, { zk: 0.9 }), ell(lx + (w ? 0.5 : -0.5), 82, 4.0, 2.1, 3.5, 98, mm));
    sceneAdd(s, ell(lx, 74, 3.4, 1.5, 1.8, 99, mg, { clip: (_x, y) => y > 73 && y < 75.5 }));
  }
  // налокодник-ножны: подол тоги
  sceneAdd(s, lathe(CX, 46, 74, (y) => 7.0 + (y - 46) * 0.16, 94, mm, { fold: folds(0.8, 1.7, 1), bottom: (x) => 73 + Math.round(1.3 * Math.sin(x * 1.5)), bias: 0.0 }));
  // золотая кайма подола и пояс
  sceneAdd(s, lathe(CX, 70, 74, (y) => 11.1 + (y - 70) * 0.16, 94.5, mg, { bottom: (x) => 73 + Math.round(1.3 * Math.sin(x * 1.5)), fold: folds(0.8, 1.7, 1) }));
  sceneAdd(s, lathe(CX, 45, 49, () => 7.9, 96, mg));
  // кираса
  sceneAdd(s, lathe(CX, 31, 47, (y) => 9.3 - (y - 31) * 0.16, 94, mm, { zk: 1.15, fold: (x) => 1.4 * Math.exp(-sq((x - CX) / 1.2)) }));
  sceneAdd(s, ell(28.4, 37.5, 4.6, 4, 3.6, 98, mm), ell(35.6, 37.5, 4.6, 4, 3.6, 98, mm), ell(CX, 43, 5.2, 3, 2.6, 98, mm));
  // горжет, голова
  sceneAdd(s, ell(CX, 30, 3.6, 2.4, 3.2, 100, mg));
  sceneAdd(s, ell(CX, 24.5, 4.3, 5.4, 4.6, 99, mm));
  sceneAdd(s, ell(CX, 21.4, 4.8, 3.8, 4.8, 100, { r: MARBLE, amb: 0.14 }, { clip: (_x, y) => y < 22.4, bias: -0.1 }));        // волосы
  sceneAdd(s, ell(CX, 28.4, 3.3, 3, 3.2, 100.5, { r: MARBLE, amb: 0.16 }, { clip: (_x, y) => y > 26.6, bias: -0.1 }));           // борода
  sceneAdd(s, ell(CX, 21.6, 4.9, 4.6, 5, 101, mg, { clip: (_x, y) => y > 19.6 && y < 21.2 }));                                   // диадема
  // наплечники
  sceneAdd(s, ell(23.4, 34, 5.8, 4.2, 5.2, 98, mm), ell(40.6, 34, 5.8, 4.2, 5.2, 98, mm));
  sceneAdd(s, ell(23.4, 34, 6, 4.4, 5.4, 98.2, mg, { clip: (_x, y) => y > 36.3 }), ell(40.6, 34, 6, 4.4, 5.4, 98.2, mg, { clip: (_x, y) => y > 36.3 }));
  // правая рука (слева на экране): плечо — локоть — предплечье вверх, кулак на рукояти
  sceneAdd(s, cap(22.5, 36, 15.5, 33.5, 3.1, 2.8, 102, mm), cap(15.5, 33.5, 16.6, 25, 2.8, 2.5, 103, mm), cap(15.4, 31.4, 16.4, 28, 3, 2.8, 104, mg));
  sceneAdd(s, ell(16.7, 23.4, 3, 2.9, 3, 104, mm));
  // левая рука утрачена: пустой рукав, подвязанный поясом
  sceneAdd(s, cap(41, 36, 41, 45, 3, 2.3, 99, mm, { bias: -0.06 }), ell(41, 46, 2.7, 1.2, 1.5, 100, mg));
  // меч: рукоять, гарда, навершие, светящийся клинок
  sceneAdd(s, ell(16.7, 26.4, 1.8, 1.6, 1.8, 105, mg), cap(10.6, 19.6, 22.8, 19.6, 1.2, 1.2, 105, mg), ell(10.4, 19.6, 1.4, 1.8, 1.4, 105, mg), ell(23, 19.6, 1.4, 1.8, 1.4, 105, mg));
  sceneAdd(s, [{ mat: { r: SUNSTEEL, emis: 1.2 }, noShadow: true, tex: (x) => (x < 16.5 ? 1.5 : x > 17.2 ? -0.7 : 0.4), h: (x, y) => { if (y < 2 || y > 19) return null; const hw = y < 6 ? 0.4 + (y - 2) * 0.28 : 1.55; return Math.abs(x - 16.7) < hw ? 110 : null; } }, [14, 1, 19, 19]]);
  // щит с солнцем: стоит на плинте у левой ноги (руки, чтобы поднять, нет — он прислонён)
  const SHX = 44.5, SHY = 49, SHT = 85;
  const shw = (y: number) => (y < 64 ? 8 - sq((64 - y) / 15) * 3.6 : 8 * Math.max(0, 1 - (y - 64) / (SHT - 64)));
  const shU = (x: number, y: number) => { const w = shw(y); return w <= 0.2 ? 9 : Math.abs(x - SHX) / w; };
  sceneAdd(s, [{ mat: (x, y) => (shU(x, y) > 0.8 ? { r: GILD, spec: 1.4, amb: 0.3 } : { r: GILD, spec: 0.8, amb: 0.05 }),
    h: (x, y) => { if (y < SHY || y > SHT) return null; const u = shU(x, y); if (u >= 1) return null; const hd = Math.hypot(x - SHX, (y - 63) * 0.9); return 103 + (u > 0.8 ? 2.6 : 1.0) + 1.0 * Math.max(0, 1 - hd / 7); } }, [37, SHY, 52, SHT]]);
  sceneAdd(s, ell(SHX, 63, 3.4, 3.4, 2.4, 105.5, { r: MARBLE, spec: 0.4, amb: 0.2 }));
  s.render(c, hex("#cfe0ff"));
  // лучи солнца на щите: мраморные лучи на золотом поле (тень вправо-вниз)
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + 0.39, len = k % 2 ? 4 : 6.6;
    const x0 = SHX + Math.cos(a) * 4.4, y0 = 63 + Math.sin(a) * 4.4, x1 = SHX + Math.cos(a) * (4.4 + len * 0.8), y1 = 63 + Math.sin(a) * (4.4 + len);
    c.line(x0 + 0.8, y0 + 0.8, x1 + 0.8, y1 + 0.8, GILD[0], 1); c.line(x0, y0, x1, y1, k % 2 ? MARBLE[3] : MARBLE[5], 1);
  }
    // лицо: правый глаз, шрам и повязка на левом, нос
  c.set(30, 24, MARBLE[0]); c.set(29, 24, MARBLE[1]); c.set(31, 23, MARBLE[1]);
  c.line(27.5, 20.6, 36.5, 24.6, GILD[0], 1);
  c.rect(33.2, 23, 3, 2.4, GILD[0]); c.set(33, 23, GILD[3]); c.set(34, 23, GILD[2]);
  c.set(32, 26, MARBLE[2]); c.set(32, 27, MARBLE[1]); c.set(31, 27, MARBLE[3]);
  // золотая полоса тоги и узор нагрудника
  for (let y = 50; y < 70; y++) { c.set(31, y, GILD[3]); c.set(32, y, GILD[2]); c.set(33, y, GILD[1]); }
  c.set(31, 40, GILD[4]); c.set(32, 40, GILD[3]); c.set(31, 41, GILD[3]); c.set(32, 41, GILD[2]);
  // табличка: крупное золотое солнце в рельефе в рамке (без букв: на 1× они не читаются)
  const gx = 31, gy = 105;
  for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6, l0 = 5.4, l1 = k % 2 ? 7.2 : 8.6; c.line(gx + 1 + Math.cos(a) * l0, gy + 1 + Math.sin(a) * l0 * 0.95, gx + 1 + Math.cos(a) * l1, gy + 1 + Math.sin(a) * l1 * 0.95, GILD[0], 1); }
  for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6, l0 = 5.4, l1 = k % 2 ? 7.2 : 8.6; c.line(gx + Math.cos(a) * l0, gy + Math.sin(a) * l0 * 0.95, gx + Math.cos(a) * l1, gy + Math.sin(a) * l1 * 0.95, k % 2 ? GILD[3] : GILD[4], 1); }
  c.ellipse(gx + 1, gy + 1, 5.2, 5.2, GILD[0]); c.ellipse(gx, gy, 5, 5, GILD[2]); c.ellipse(gx - 0.4, gy - 0.5, 4, 4, GILD[3]); c.ellipse(gx - 1.2, gy - 1.2, 2.2, 2, GILD[4]); c.ellipse(gx + 1.4, gy + 1.6, 2, 1.6, GILD[2]); c.set(gx - 2, gy - 2, GILD[5]);
  for (let x = 21; x < 43; x++) { c.set(x, 96, GILD[1]); c.set(x, 97, GILD[3]); c.set(x, 115, GILD[1]); c.set(x, 114, GILD[3]); }
  for (const x of [21, 42]) for (let y = 96; y <= 115; y++) { c.set(x, y, GILD[3]); c.set(x + 1, y, GILD[1]); }
  // золотой огонь жаровен
  const FL = [hex("#e8761c"), hex("#ffae30"), hex("#ffe070"), hex("#fffbe0")];
  c.outline(OUT);
  halo(c, [[16.7, 6], [16.7, 11], [16.7, 15], [12, 126 - 4], [51, 125 - 4]], hex("#ffe08a"), 4, 60);
  return c;
}

// ---------- Умбрат: Морт Безвенечный ----------
const BASALT: Ramp = ramp("#08060e", "#150f24", "#231a38", "#33264f", "#47386c", "#62528c");
const BASALT_P: Ramp = ramp("#0c0914", "#1a1228", "#2a2040", "#3c2e5a", "#523f78", "#6a5694");
const IRONU: Ramp = ramp("#12101a", "#241f30", "#3c3650", "#625b7c", "#9890b4", "#c8c0e0");
const RUNE: Ramp = ramp("#3a1468", "#7a38d0", "#b480ff", "#e6d0ff");
const BONE: Ramp = ramp("#2a2230", "#4a4258", "#7a7088", "#aea2b8", "#d6cce0");

export function umbStatue(): PC {
  const c = new PC(W, H);
  plaza(c, ramp("#2c2838", "#3a3448", "#4c4560", "#5e5678", "#7a6e98"), hex("#6a5c8e"), hex("#100c1a"));
  baseShadow(c, 8, 50, 143, 6, 3);
  const s = new Scene();
  const mp: Mat = { r: BASALT_P, amb: 0.22, rim: 0.5 }, mi: Mat = { r: IRONU, spec: 0.6, amb: 0.2, rim: 0.4 }, mb: Mat = { r: BASALT, amb: 0.2, rim: 0.9, spec: 0.15 };
  const ptex = (x: number, y: number, f: "f" | "s" | "t") => {
    let v = (pnoise(x, y, 5, 64, 7) - 0.5) * 0.3 + (pnoise(x * 3, y, 2, 64, 3) - 0.5) * 0.12;
    if (f === "f") { const row = Math.floor((y - 90) / 7); if ((y - 90) % 7 === 0) v -= 0.2; if (((x + (row % 2 ? 6 : 0)) % 14 === 0) && (y - 90) % 7 !== 0) v -= 0.14; }
    return v;
  };
  pedestal(s, c, mp, { r: IRONU, spec: 0.6, amb: 0.2, rim: 0.4 }, ptex);
  brazier(s, 12, 136, mi, mi); brazier(s, 51, 135, mi, mi);
  // черепа на карнизе и углах яруса
  const skull = (x: number, y: number, z: number) => sceneAdd(s, ell(x, y, 2.8, 2.6, 2.4, z, { r: BONE, amb: 0.22 }), ell(x, y + 2.6, 1.9, 1.3, 1.6, z - 0.5, { r: BONE, amb: 0.18 }));
  const skulls: [number, number][] = [[20, 91.5], [32, 91.5], [44, 91.5], [17, 127], [43, 127]];
  skulls.forEach(([x, y]) => skull(x, y, 62));

  const folds = (k: number, a: number, ph = 0) => (x: number, y: number) => a * Math.sin((x - CX) * k + ph + y * 0.09) + a * 0.55 * Math.sin((x - CX) * k * 2.1 - y * 0.06 + ph * 2);
  const hem = (x: number) => 82.5 + 1.6 * Math.sin(x * 0.9) + 0.9 * Math.sin(x * 2.3);
  // ряса
  sceneAdd(s, lathe(CX, 29, 84, (y) => 8.4 + (y - 29) * 0.125 + Math.max(0, 33 - y) * 0.5, 94, mb, { fold: folds(0.62, 2.2), bottom: hem, zk: 0.9 }));
  sceneAdd(s, lathe(CX, 29, 36, (y) => 11 - (y - 29) * 0.1, 98, mb, { fold: folds(0.9, 0.8, 1) }));
  // руки раскрыты ладонями наружу: широкие рукава с манжетами
  for (const side of [-1, 1]) {
    const sx = CX + side * 8.5, ex = CX + side * 16.5;
    sceneAdd(s, cap(sx, 33.5, ex, 48, 4.2, 3.4, 100, mb, { bias: side < 0 ? 0 : -0.05 }), ell(ex, 49.5, 4.4, 2.6, 3.4, 101, mb, { bias: 0 }));
    sceneAdd(s, ell(ex, 53.6, 3.1, 3.7, 1.6, 102, { r: BONE, amb: 0.2, rim: 0.4 }, { bias: -0.12 }));
    // пальцы
    for (const [fx, fl] of [[-2, 3], [-0.7, 4], [0.7, 4], [2, 3]] as const) sceneAdd(s, cap(ex + fx * side, 55.5, ex + fx * side * 1.5, 55.5 + fl, 0.75, 0.55, 102.5, { r: BONE, amb: 0.2 }));
  }
  // капюшон: тело вращения с острой макушкой, внутри — тёмное лицо
  sceneAdd(s, lathe(CX, 11, 31, (y) => (y < 20 ? 7.6 * Math.pow((y - 11) / 9, 0.75) : 7.6 + (y - 20) * 0.1), 100, mb, { fold: folds(1.2, 0.6, 2), zk: 1.0 }));
  sceneAdd(s, [{ mat: { r: ramp("#05030a", "#0a0614", "#150d24", "#22163a"), amb: 0.1 }, h: (x, y) => { const d = sq((x - CX) / 4.1) + sq((y - 25) / 5.4); return d >= 1 ? null : 107 + 2 * Math.sqrt(1 - d); } }, [27, 19, 37, 31]]);
  sceneAdd(s, ell(CX, 26, 2.8, 3.8, 2.4, 108, { r: BASALT_P, amb: 0.18, rim: 0.3 }, { bias: -0.14 }));
  // сломанный венец на лбу: зубцы, часть отломана
  sceneAdd(s, ell(CX, 20.4, 6.6, 2.2, 3, 103, { r: IRONU, spec: 0.7, amb: 0.2, rim: 0.6 }, { clip: (_x, y) => y > 18.8 && y < 22 }));
  for (const [x, hgt] of [[26.5, 4], [29, 2.5], [32, 5.5], [35.4, 1.5], [37.2, 3.5]] as const)
    sceneAdd(s, cap(x, 19.4, x + (x < 32 ? -0.3 : 0.3), 19.4 - hgt, 1.15, 0.5, 104, { r: IRONU, spec: 0.7, amb: 0.2, rim: 0.7 }));
  // Чёрная Корона над головой
  const crown: Mat = { r: ramp("#0a0612", "#1c1030", "#34205a", "#5a3a96", "#8a62d0"), spec: 1.2, amb: 0.22, rim: 1.2 };
  sceneAdd(s, ell(CX, 6.4, 8.2, 2.6, 3.5, 104, crown, { clip: (_x, y) => y > 4.6 && y < 8.6 }));
  for (const [x, h2, w] of [[24.5, 3.2, 1.2], [28, 5.2, 1.4], [32, 6.5, 1.6], [36, 5.2, 1.4], [39.5, 3.2, 1.2]] as const)
    sceneAdd(s, [{ mat: crown, h: (px, py) => { const t = (6 - py) / h2; if (t < 0 || t > 1.05) return null; return Math.abs(px - x) < w * (1 - t * 0.9) ? 105 + (1 - Math.abs(px - x) / w) * 1.5 : null; } }, [x - 2, 6 - h2 - 1, x + 2, 7]]);
  s.render(c, hex("#9ab0ff"));
  // светящиеся детали (после рендера)
  const R2 = RUNE;
  // глаза во тьме капюшона
  for (const ex of [30.4, 33.6]) { c.set(ex, 25, R2[3]); c.set(ex, 26, R2[2]); }
  c.set(31, 29, BASALT[2]); c.set(33, 29, BASALT[2]);
  // гвоздевые шрамы на ладонях
  for (const side of [-1, 1]) { const ex = CX + side * 16.5; c.rect(ex - 1, 52.5, 2, 2, R2[2]); c.set(ex - 1, 52, R2[3]); c.set(ex, 54, R2[1]); c.set(ex - 1, 51, R2[1]); c.set(ex + 1, 54, R2[1]); }
  // рунный пояс на подоле и руны на теле пьедестала
  for (let x = 20; x <= 44; x += 4) { c.set(x, 78 + Math.round(hash01(x, 3, 1) * 2), R2[1]); c.set(x, 79 + Math.round(hash01(x, 3, 1) * 2), R2[2]); }
  const nx = 32 - Math.floor(textW("МОРТ") / 2);
  drawText(c, "МОРТ", nx + 1, 104, R2[3], null, BASALT[0]);
  for (let x = 20; x < 44; x++) { c.set(x, 96, BASALT_P[1]); c.set(x, 114, BASALT_P[1]); }
  for (let i = 0; i < 6; i++) { const rx = 21 + i * 4; if (rx > 29 && rx < 36) continue; c.set(rx, 98 + (i % 3), R2[1]); c.set(rx, 99 + (i % 3), R2[2]); c.set(rx + 1, 99 + (i % 3), R2[1]); c.set(rx, 110 + (i % 2), R2[2]); c.set(rx + 1, 111 + (i % 2), R2[1]); }
  for (let x = 24; x < 40; x += 2) { c.set(x, 112, R2[1]); }
  // глазницы черепов
  for (const [x, y] of skulls) { c.set(x - 1, y - 0.5, BASALT[0]); c.set(x + 1, y - 0.5, BASALT[0]); c.set(x, y + 1, BASALT[1]); c.set(x, y + 2, BASALT[1]); }
  // цепи между черепами (провисающие дуги) и вдоль яруса
  const chain = (xa: number, ya: number, xb: number, yb: number, sag: number) => {
    const n = Math.round(Math.hypot(xb - xa, yb - ya) * 0.75);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = Math.round(xa + (xb - xa) * t), y = Math.round(ya + (yb - ya) * t + Math.sin(t * Math.PI) * sag);
      c.set(x, y, i % 2 ? IRONU[2] : IRONU[4]); c.set(x, y + 1, IRONU[1]);
    }
  };
  chain(21, 93.5, 31, 93.5, 3); chain(33, 93.5, 43, 93.5, 3); chain(18, 128, 42, 128, 4);
  // цепи у запястий свисают к плинту
  for (const side of [-1, 1]) chain(CX + side * 16.5, 57, CX + side * 20, 80, 2);
  // пурпурный огонь жаровен
  const FU = [hex("#5a1ea0"), hex("#8a44e0"), hex("#c49aff"), hex("#f4e8ff")];
  // парящие осколки короны
  for (const [x, y] of [[20, 9], [44, 11], [23, 3], [41, 4]]) { c.set(x, y, R2[2]); c.set(x + 1, y, R2[1]); c.set(x, y + 1, R2[1]); }
  // свечение венца: кромка зубцов
  for (let x = 24; x <= 40; x++) { const p = c.get(x, 8); if (p && p[3] && x % 2) c.set(x, 8, R2[1]); }
  c.outline(OUT);
  halo(c, [[32, 5], [32, 7], [20, 9], [44, 11], [12, 122], [51, 121], [16.5 + 15.5, 53], [CX - 16.5, 53], [CX + 16.5, 53]], hex("#a070ff"), 7, 80);
  return c;
}

// ---------- анимированный огонь жаровен: лист statue-fire-sol/umb (6 кадров 14×16) в assets/vfx, запись в vfx/manifest.json ----------
const FIRE_FRAMES = 6;
export function writeStatueFire(assetsRoot: string) {
  const dir = path.join(assetsRoot, "vfx"), mf = path.join(dir, "manifest.json");
  let m: Record<string, unknown> = {};
  try { m = JSON.parse(fs.readFileSync(mf, "utf8")); } catch { /* манифеста ещё нет */ }
  const sets: [string, RGBA[]][] = [["statue-fire-sol", [hex("#e8761c"), hex("#ffae30"), hex("#ffe070"), hex("#fffbe0")]], ["statue-fire-umb", [hex("#5a1ea0"), hex("#8a44e0"), hex("#c49aff"), hex("#f4e8ff")]]];
  for (const [id, cols] of sets) {
    const row = new PC(14 * FIRE_FRAMES, 16);
    for (let i = 0; i < FIRE_FRAMES; i++) {
      const f = new PC(14, 16), ph = (i / FIRE_FRAMES) * Math.PI * 2;
      flame(f, 7, 15, 10 + Math.round(Math.sin(ph) * 1.5), cols, Math.sin(ph * 2) * 1.6);
      // язычок и искра, плывущие вверх
      const tx = 7 + Math.round(Math.sin(ph + 1) * 2), ty = 4 - (i % 3);
      f.set(tx, ty, cols[2]); f.set(tx, ty + 1, cols[1]);
      row.blit(f, i * 14, 0);
    }
    row.save(path.join(dir, `${id}.png`));
    m[id] = { frameW: 14, frameH: 16, frames: FIRE_FRAMES, fps: 9, anchor: [0.5, 1], blend: "normal" };
  }
  fs.writeFileSync(mf, JSON.stringify(Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1))), null, 1) + "\n");
}
