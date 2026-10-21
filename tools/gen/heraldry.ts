/** Гербы фракций — концепты (план «Война фракций», шаг «герб»): по три варианта для Сольгарда и Умбрата.
 *  Каждый герб 64×72 рисуется кодом по концепту: маски фигур, контур 1 px, тона материала (3–5 на материал), свет сверху слева —
 *  как у утверждённого «Знамени защиты» (tools/gen/vfx-banner.ts). Малые эмблемы рисуются отдельно, а не уменьшаются из большого герба:
 *  24 px (20×24 — на полотнище знамени 32×46), 20 px (стяги) и 16 px (мелкие и повреждённые штандарты).
 *  Запуск: npx tsx tools/gen/heraldry.ts → tools/out/heraldry/concepts.png (увеличение ×3 без сглаживания). */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, hex, type RGBA } from "./canvas";
import { P } from "./palette";

type Col = RGBA;
type Pt = [number, number];
const c = (s: string) => hex(s);
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- палитры
const G = P.gold; // [0] #6a4210 [1] #a8681c [2] #e0a630 [3] #ffd864 [4] #fff2b0
const S = {
  out: c("#3a2208"), glow: c("#fff4c8"),
  azHi: c("#7ec8ff"), az: c("#3a86c8"), azSh: c("#1f5a96"), azDk: c("#12365e"),
  iv: c("#d6c8a4"), ivSh: c("#bfae88"), ivDk: c("#7a6a4c"),
};
const U = {
  out: c("#05030a"), k0: c("#0a0612"), k1: c("#100a1a"), k2: c("#22163a"), k3: c("#382858"),
  p0: c("#2a1846"), p1: c("#46265e"), p2: c("#6a3c8a"), p3: c("#9a62b8"), lil: c("#d0b4f0"), pearl: c("#f4f0ff"),
  g1: c("#3fcf45"), g2: c("#7aff6a"), g3: c("#dcffd0"),
  bone: [c("#4e4638"), c("#8f8468"), c("#c8bc9c"), c("#ece4cc")],
  sil: [c("#2c2838"), c("#545066"), c("#8a87a0"), c("#c4c2d4")],
};

// ---------------------------------------------------------------- маски и геометрия
class Mask {
  readonly a: Uint8Array;
  constructor(readonly w: number, readonly h: number) { this.a = new Uint8Array(w * h); }
  static of(w: number, h: number, fn: (x: number, y: number) => boolean) {
    const m = new Mask(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fn(x, y)) m.a[y * w + x] = 1;
    return m;
  }
  has(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.a[y * this.w + x] === 1; }
  /** Расстояние до края по четырём соседям: 1 — крайний пиксель маски, 0 — вне маски. */
  dist(): Int16Array {
    const { w, h } = this, d = new Int16Array(w * h), q: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!this.has(x, y)) continue;
      if (!this.has(x - 1, y) || !this.has(x + 1, y) || !this.has(x, y - 1) || !this.has(x, y + 1)) { d[y * w + x] = 1; q.push(y * w + x); }
    }
    for (let i = 0; i < q.length; i++) {
      const p = q[i], x = p % w, y = (p - x) / w;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (!this.has(nx, ny)) continue;
        const n = ny * w + nx;
        if (d[n] === 0) { d[n] = d[p] + 1; q.push(n); }
      }
    }
    return d;
  }
}
/** Заливка маски: fn получает расстояние до края d (1 — край). */
function paint(pc: PC, m: Mask, fn: (x: number, y: number, d: number) => Col | null) {
  const d = m.dist();
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const k = d[y * m.w + x];
    if (!k) continue;
    const col = fn(x, y, k);
    if (col) pc.set(x, y, col);
  }
  return d;
}
/** Зеркала: у Сольгарда ось между столбцами 31|32 (x ↔ 63−x), у Умбрата — столбец 32 (x ↔ 64−x). */
const mirS = (x: number) => (x < 32 ? 63 - x : x);
const mirU = (x: number) => (x < 32 ? 64 - x : x);
/** Зеркальная копия слоя Умбрата относительно столбца 32. */
function mirrorU(src: PC): PC {
  const out = new PC(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const col = src.get(64 - x, y); if (col && col[3]) out.set(x, y, col); }
  return out;
}

/** Луч-клин от центра под углом deg (0° — вправо, 90° — вверх), от r0 до r1, полуширина hw0 → hw1. */
function inRay(px: number, py: number, cx: number, cy: number, deg: number, r0: number, r1: number, hw0: number, hw1: number) {
  const a = deg * D2R, ux = Math.cos(a), uy = -Math.sin(a), dx = px - cx, dy = py - cy;
  const along = dx * ux + dy * uy, perp = Math.abs(-dx * uy + dy * ux);
  if (along < r0 || along > r1) return false;
  return perp <= hw0 + ((hw1 - hw0) * (along - r0)) / (r1 - r0);
}
/** Рисунок по сетке символов; «.» и неизвестные символы — прозрачно. */
function grid(rows: string[], legend: Record<string, Col>): PC {
  const pc = new PC(Math.max(...rows.map((r) => r.length)), rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { const col = legend[ch]; if (col) pc.set(x, y, col); }));
  return pc;
}
/** Наружный контур слоя: по 4 соседям (чистая лесенка на диагоналях) или по 8. */
function outlined(pc: PC, col: Col, diag = false) { return pc.outline(col, diag); }
/** Заделать «дырки» в 1 px: прозрачный пиксель, у которого ≥3 из 4 соседей заняты, заливается цветом (обычно контуром). */
/** Убрать одиночные пиксели-«мусор»: пиксель без соседей своего цвета, у которого ≥ 3 из 4 соседей одного цвета, перекрашивается в этот цвет. */
function despeckle(pc: PC, keep: Col[] = []) {
  const same = (a: Col | null, b: Col | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  const fix: [number, number, Col][] = [];
  for (let y = 1; y < pc.h - 1; y++) for (let x = 1; x < pc.w - 1; x++) {
    const c0 = pc.get(x, y)!;
    if (!c0[3] || keep.some((k) => same(k, c0))) continue;
    const n = [pc.get(x - 1, y), pc.get(x + 1, y), pc.get(x, y - 1), pc.get(x, y + 1)];
    if (n.some((c) => same(c, c0))) continue;                                // у пикселя есть сосед того же цвета — не одиночка
    for (const cand of n) if (cand && cand[3] && n.filter((c) => same(c, cand)).length >= 3) { fix.push([x, y, cand]); break; }
  }
  for (const [x, y, col] of fix) pc.set(x, y, col);
  return pc;
}
function fillPinholes(pc: PC, col: Col) {
  const holes: Pt[] = [];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    if (pc.alpha(x, y)) continue;
    const n = +!!pc.alpha(x - 1, y) + +!!pc.alpha(x + 1, y) + +!!pc.alpha(x, y - 1) + +!!pc.alpha(x, y + 1);
    if (n >= 3) holes.push([x, y]);
  }
  for (const [x, y] of holes) pc.set(x, y, col);
  return pc;
}
interface Ray { deg: number; r0: number; r1: number; hw0: number; hw1: number; col: Col }
/** Солнце с лучами (симметрично относительно оси 31|32): диск радиуса R с кольцами rings ([радиус, цвет] от центра наружу),
 *  лучи — клинья только правой половины (0°…90°), левая зеркальна. Контур снаружи, зазор между диском и лучами заливается контуром. */
function sunburst(cx: number, cy: number, R: number, rings: [number, Col][], rays: Ray[], out: Col, maxY = 99): PC {
  const pc = new PC(64, 72);
  for (let y = 0; y <= Math.min(71, maxY); y++) for (let x = 0; x < 64; x++) {
    const px = mirS(x) + 0.5, py = y + 0.5, r = Math.hypot(px - cx, py - cy);
    let col: Col | null = null;
    if (r <= R) col = rings.find(([rr]) => r < rr)?.[1] ?? rings[rings.length - 1][1];
    else for (const ray of rays) if (inRay(px, py, cx, cy, ray.deg, ray.r0, ray.r1, ray.hw0, ray.hw1)) { col = ray.col; break; }
    if (col) pc.set(x, y, col);
  }
  return fillPinholes(outlined(pc, out), out);
}
/** Семь лучей через 22,5° (правая половина): длинные на 45° и 90°, короткие на 22,5° и 67,5° — длинный и короткий чередуются.
 *  Наклоны 1:2, 1:1, 2:1 и вертикаль дают одинаковые чистые клинья: основание 2–3 px, остриё 1 px (вертикальный на чётной оси — 4 → 2). */
function rays7(r0: number, rLong: number, rShort: number): Ray[] {
  return [
    { deg: 22.5, r0, r1: rShort, hw0: 1.15, hw1: 0.45, col: G[2] },
    { deg: 45, r0, r1: rLong, hw0: 1.3, hw1: 0.45, col: G[3] },
    { deg: 67.5, r0, r1: rShort, hw0: 1.15, hw1: 0.45, col: G[2] },
    { deg: 90, r0, r1: rLong + 0.3, hw0: 1.6, hw1: 0.6, col: G[3] },
  ];
}

// ---------------------------------------------------------------- пиксельный шрифт 3×5 (кириллица, цифры)
const GLYPHS: Record<string, string> = {
  А: ".#./#.#/###/#.#/#.#", Б: "###/#../##./#.#/##.", В: "##./#.#/##./#.#/##.", Г: "###/#../#../#../#..",
  Д: ".###./.#.#./.#.#./#####/#...#", Е: "###/#../##./#../###", Ж: "#.#.#/#.#.#/.###./#.#.#/#.#.#", З: "##./..#/.#./..#/##.",
  И: "#..#/#..#/#.##/##.#/#..#", Й: ".##./#..#/#.##/##.#/#..#", К: "#.#/#.#/##./#.#/#.#", Л: ".##/#.#/#.#/#.#/#.#",
  М: "#...#/##.##/#.#.#/#...#/#...#", Н: "#.#/#.#/###/#.#/#.#", О: ".#./#.#/#.#/#.#/.#.", П: "###/#.#/#.#/#.#/#.#",
  Р: "##./#.#/##./#../#..", С: ".##/#../#../#../.##", Т: "###/.#./.#./.#./.#.", У: "#.#/#.#/.##/..#/##.", Ф: ".#./###/#.#/###/.#.",
  Х: "#.#/#.#/.#./#.#/#.#", Ц: "#.#./#.#./#.#./####/...#", Ч: "#.#/#.#/.##/..#/..#", Ш: "#.#.#/#.#.#/#.#.#/#.#.#/#####",
  Щ: "#.#.#/#.#.#/#.#.#/#####/....#", Ъ: "##../.#../.##./.#.#/.##.", Ы: "#...#/#...#/##..#/#.#.#/##..#", Ь: "#../#../##./#.#/##.",
  Э: "##./..#/.##/..#/##.", Ю: "#..#./#.#.#/###.#/#.#.#/#..#.", Я: ".###/#..#/.###/.#.#/#..#",
  "0": "###/#.#/#.#/#.#/###", "1": ".#./##./.#./.#./###", "2": "##./..#/.#./#../###", "3": "###/..#/.##/..#/###",
  "4": "#.#/#.#/###/..#/..#", "5": "###/#../##./..#/##.", "6": ".##/#../###/#.#/###", "7": "###/..#/.#./.#./.#.",
  "8": "###/#.#/###/#.#/###", "9": "###/#.#/###/..#/##.",
  ".": "././././#", ",": "./././#/#", "-": "../../##/../..", ":": "./#/./#/.", "×": ".../#.#/.#./#.#/...",
  "«": "..../.#.#/#.#./.#.#/....", "»": "..../#.#./.#.#/#.#./....", "(": ".#/#./#./#./.#", ")": "#./.#/.#/.#/#.", "/": "..#/..#/.#./#../#..",
  "+": ".../.#./###/.#./...", "!": "#/#/#/./#", "?": "##./..#/.#./.../.#.", "·": "./././#/.", "—": "..../..../####/..../....",
};
const LATIN: Record<string, string> = { A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У", Ё: "Е" };
Object.assign(GLYPHS, {
  D: "##./#.#/#.#/#.#/##.", F: "###/#../##./#../#..", G: ".##/#../#.#/#.#/.##", I: "#/#/#/#/#", L: "#../#../#../#../###",
  N: "#..#/##.#/#.##/#..#/#..#", R: "##./#.#/##./#.#/#.#", S: ".##/#../.#./..#/##.", U: "#.#/#.#/#.#/#.#/.#.", V: "#.#/#.#/#.#/.#./.#.",
  W: "#...#/#...#/#.#.#/##.##/#...#", Z: "###/..#/.#./#../###",
});
function glyph(ch: string): string[] {
  const k = ch.toUpperCase();
  return (GLYPHS[k] ?? GLYPHS[LATIN[k] ?? ""] ?? GLYPHS["?"]).split("/");
}
interface GlyphPos { x: number; w: number; rows: string[] }
/** Раскладка строки: позиции глифов; space — ширина пробела целиком, gap — между буквами. */
function layoutText(s: string, space = 3, gap = 1) {
  const gl: GlyphPos[] = [];
  let x = 0;
  [...s].forEach((ch, i) => {
    if (ch === " ") { x += space; return; }
    const rows = glyph(ch);
    gl.push({ x, w: rows[0].length, rows });
    x += rows[0].length + (i < s.length - 1 && s[i + 1] !== " " ? gap : 0);
  });
  return { gl, width: x };
}
function stampGlyph(pc: PC, g: GlyphPos, x: number, y: number, col: Col, scale = 1) {
  g.rows.forEach((row, j) => [...row].forEach((p, k) => { if (p === "#") pc.rect(x + k * scale, y + j * scale, scale, scale, col); }));
}
function drawText(pc: PC, s: string, x: number, y: number, col: Col, scale = 1, space = 3, gap = 1) {
  const lay = layoutText(s, space, gap);
  lay.gl.forEach((g) => stampGlyph(pc, g, x + g.x * scale, y, col, scale));
  return x + lay.width * scale;
}

// ---------------------------------------------------------------- лента-свиток (общая)
/** Геометрия ленты. Середина — лицевая, дугой опущена к оси на arc px; концы позади, ниже (drop > 0) или выше (drop < 0) краёв середины;
 *  между серединой и концом — косая складка изнанки (треугольник с катетами fold и |drop|); на внешнем конце — ласточкин хвост notch[строка]. */
interface RibbonSpec { axis: "S" | "U"; top: number; mx0: number; ex0: number; h: number; arc: number; drop: number; notch: number[]; fold: number }
interface RibbonPal { out: Col; mid: [Col, Col, Col]; end: [Col, Col, Col]; fold: Col; text: Col }
function ribbon(pc: PC, r: RibbonSpec, p: RibbonPal, motto: string, space = 3, endText?: [string, string]) {
  const ax = r.axis === "S" ? 32 : 32.5;
  const lx = (x: number) => (r.axis === "S" ? (x < 32 ? x : 63 - x) : x <= 32 ? x : 64 - x);
  const half = ax - r.mx0;
  const offAt = (xc: number) => Math.max(0, Math.round(r.arc * (1 - ((xc + 0.5 - ax) / half) ** 2)));
  const off = Array.from({ length: 64 }, (_, x) => offAt(x));
  // ступени дуги совпадают с промежутками между буквами: буква целиком на одной высоте
  const lay = layoutText(motto, space);
  const tx0 = Math.round(ax - lay.width / 2);
  const gOff = lay.gl.map((g) => offAt(tx0 + g.x + (g.w - 1) / 2));
  lay.gl.forEach((g, i) => {
    for (let k = 0; k < g.w; k++) off[tx0 + g.x + k] = gOff[i];
    const nx = lay.gl[i + 1];
    if (nx) for (let x = tx0 + g.x + g.w; x < tx0 + nx.x; x++) off[x] = Math.max(gOff[i], gOff[i + 1]);
  });
  for (let x = 0; x < tx0; x++) off[x] = Math.min(off[x], gOff[0]);
  for (let x = tx0 + lay.width; x < 64; x++) off[x] = Math.min(off[x], gOff[gOff.length - 1]);
  const H = r.h, ad = Math.abs(r.drop), ty = Math.floor((H - 5) / 2), shadeW = endText ? 1 : 2;
  // концы (позади)
  const endM = Mask.of(64, 72, (x, y) => { const ry = y - (r.top + r.drop), l = lx(x); return ry >= 0 && ry < H && l >= r.ex0 + (r.notch[ry] ?? 0) && l <= r.mx0; });
  paint(pc, endM, (x, y, d) => { const ry = y - (r.top + r.drop); return d === 1 ? p.out : lx(x) >= r.mx0 - shadeW ? p.fold : ry === 1 ? p.end[0] : ry === H - 2 ? p.end[2] : p.end[1]; });
  // складка изнанки
  if (ad > 0) {
    const foldM = Mask.of(64, 72, (x, y) => {
      const l = lx(x), k = r.drop > 0 ? y - (r.top + H - 1) : r.top - y;
      if (k < 0 || k > ad || l < r.mx0) return false;
      return l <= r.mx0 + (k === 0 ? r.fold + 1 : Math.round(r.fold * (1 - (k - 1) / ad)));
    });
    paint(pc, foldM, (x, y, d) => (d === 1 ? p.out : p.fold));
  }
  // середина
  const midM = Mask.of(64, 72, (x, y) => { const ry = y - (r.top + off[x]); return lx(x) >= r.mx0 && ry >= 0 && ry < H; });
  paint(pc, midM, (x, y, d) => { const ry = y - (r.top + off[x]); return d === 1 ? p.out : ry === 1 ? p.mid[0] : ry === H - 2 ? p.mid[2] : p.mid[1]; });
  lay.gl.forEach((g, i) => stampGlyph(pc, g, tx0 + g.x, r.top + gOff[i] + ty, p.text));
  if (endText) {
    const a = r.ex0 + Math.max(...r.notch) + 1, b = r.mx0 - 1, R = (x: number) => (r.axis === "S" ? 63 - x : 64 - x);
    ([[endText[0], a, b], [endText[1], R(b), R(a)]] as [string, number, number][]).forEach(([s, x0, x1]) => {
      const L2 = layoutText(s, space), sx = Math.round((x0 + x1 + 1) / 2 - L2.width / 2);
      L2.gl.forEach((g) => stampGlyph(pc, g, sx + g.x, r.top + r.drop + ty, p.text));
    });
  }
}
const SOL_RIBBON: RibbonPal = { out: S.out, mid: [S.azHi, S.az, S.azSh], end: [S.az, S.azSh, S.azDk], fold: S.azDk, text: G[4] };
const NOTCH9 = [0, 0, 1, 2, 3, 2, 1, 0, 0];

// ---------------------------------------------------------------- Сольгард 1 «Восход над Оплотом»
function solgard1(): PC {
  const pc = new PC(64, 72);
  // --- солнце встаёт из-за щита: купол 20 px с крупной сердцевиной, 7 тонких лучей через 22,5° (длинный и короткий чередуются)
  pc.blit(sunburst(32, 18, 9.4, [[5.4, S.glow], [7.8, G[3]], [99, G[2]]], rays7(10.8, 16.7, 14.9), S.out, 16), 0, 0);

  // --- щит-«утюг»: x 14–49, верхний контур ряд 17, бока прямые до 38, ниже парабола к острию 2 px (ряды 57–58), контур — ряд 59
  const hwRow = (y: number) => {
    if (y < 17 || y > 59) return -1;
    if (y <= 38) return 18;
    if (y >= 57) return y === 59 ? 1 : 2;
    const t = (y - 38) / 20;
    return 18 * (1 - t * t);
  };
  const shield = Mask.of(64, 72, (x, y) => Math.abs(x + 0.5 - 32) <= hwRow(y));
  const sd = paint(pc, shield, (x, y, d) => {
    if (d === 1) return S.out;
    if (d <= 3) return x < 32 ? G[3] : G[2];                           // кайма 2 px: свет слева
    return x >= 43 ? S.azSh : S.az;                                   // небо, справа тень
  });
  const field = (x: number, y: number) => sd[y * 64 + x] >= 4;
  for (let y = 20; y <= 25; y++) for (const x of [18, 19]) pc.set(x, y, S.azHi);    // блик лазури
  for (const [x, y] of [[15, 18], [16, 18], [17, 18], [15, 19], [15, 20]] as Pt[]) pc.set(x, y, G[4]);   // блик каймы
  // --- стена Оплота: три зубца (просветы по 6 px), тело до каймы; верх зубцов — светлая кромка, швы кладки на тон темнее
  const WT = 38;                                                       // верх зубцов
  const merlon = (x: number) => (x >= 17 && x <= 21) || (x >= 28 && x <= 35) || (x >= 42 && x <= 46);
  for (let y = WT; y < 72; y++) for (let x = 0; x < 64; x++) {
    if (!field(x, y)) continue;
    const inM = y < WT + 4 && merlon(x), body = y >= WT + 4;
    if (!inM && !body) continue;
    const top = (inM && y === WT) || (body && y === WT + 4 && !merlon(x));
    const seam = body && y > WT + 4 && ((y - WT - 4) % 4 === 3 || ((y - WT - 4) % 4 < 3 && (x + (Math.floor((y - WT - 4) / 4) % 2) * 3) % 6 === 0));
    pc.set(x, y, top ? S.glow : x >= 43 || (inM && (x === 21 || x === 35)) || seam ? S.ivSh : S.iv);
  }
  // --- ворота под средним зубцом: арка с рамой #7a6a4c, проём светится золотом (ярче к оси), порог — рама
  const GT = WT + 7;
  for (let y = GT; y <= GT + 8; y++) for (let x = 27; x <= 36; x++) {
    if (!field(x, y)) continue;
    const u = x < 32 ? 31 - x : x - 32, k = y - GT;
    const half = k === 0 ? -1 : k === 1 ? 2 : 3;
    if (k === 0) { if (u <= 1) pc.set(x, y, S.ivDk); continue; }
    if (k === 8) { if (u <= 3) pc.set(x, y, S.ivDk); continue; }
    if (u < half) pc.set(x, y, u === 0 && k >= 2 ? S.glow : G[3]);
    else if (u === half) pc.set(x, y, S.ivDk);
  }
  // --- восьмилучевая звезда: прямые лучи 2 px в контуре #12365e, косые лучи 1 px золотом в тени — прямо по лазури
  const star = grid([
    ".....AA.....",
    ".....AA.....",
    ".....AA.....",
    ".....AA.....",
    ".....AA.....",
    "AAAAAYYAAAAA",
    "AAAAAYYaaaaa",
    ".....Aa.....",
    ".....Aa.....",
    ".....Aa.....",
    ".....Aa.....",
    ".....Aa.....",
  ], { A: G[3], a: G[2], Y: S.glow });
  const starL = new PC(64, 72);
  starL.blit(star, 26, 24);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as Pt[]) for (let k = 1; k <= 3; k++) starL.set((sx < 0 ? 31 : 32) + sx * k, (sy < 0 ? 29 : 30) + sy * k, G[2]);
  outlined(starL, S.azDk);
  pc.blit(starL, 0, 0);
  // --- лента с девизом
  ribbon(pc, { axis: "S", top: 60, mx0: 10, ex0: 4, h: 9, arc: 1, drop: 3, notch: NOTCH9, fold: 3 }, SOL_RIBBON, "ВЫСТОИМ");
  return pc;
}

/** Перо: от корня a до кончика b; полуширина w0 у корня → w1 к последней четверти, кончик скруглён-заострён.
 *  colAt(q, s): q ∈ [−1; 1] — поперёк пера (−1 — левая/верхняя кромка по ходу пера), s ∈ [0; 1] — вдоль. */
function quill(l: PC, a: Pt, b: Pt, w0: number, w1: number, colAt: (q: number, s: number) => Col, tip = 0.25) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const x0 = Math.floor(Math.min(a[0], b[0]) - w0 - 1), x1 = Math.ceil(Math.max(a[0], b[0]) + w0 + 1);
  const y0 = Math.floor(Math.min(a[1], b[1]) - w0 - 1), y1 = Math.ceil(Math.max(a[1], b[1]) + w0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5 - a[0], py = y + 0.5 - a[1];
    const s = (px * ux + py * uy) / len, q = px * uy - py * ux;
    if (s < 0 || s > 1) continue;
    let w = w0 + (w1 - w0) * Math.min(1, s / (1 - tip));
    if (s > 1 - tip) w *= Math.sqrt(Math.max(0, 1 - ((s - 1 + tip) / tip) ** 2));
    if (Math.abs(q) > w) continue;
    l.set(x, y, colAt(q / w, s));
  }
}

// ---------------------------------------------------------------- Сольгард 2 «Корона Рассвета»
/** Геральдический «полёт» (левое крыло; правое — зеркало): золотая кромка-рука дугой от плеча щита вверх и наружу (кончик выше короны),
 *  под ней ярус кроющих перьев с зубчатым краем и пять маховых, к кончику длиннее: концы идут ступенькой вниз и наружу.
 *  Перо — свет #fff4c8, тень лазурью #7ec8ff → #3a86c8, контур #3a2208; перья перекрываются сверху вниз. */
function solWing(): PC {
  const W = new PC(64, 72);
  const B: Pt[] = [[19, 24], [11, 4], [2, 2]];
  const arm = (t: number): Pt => { const u = 1 - t; return [u * u * B[0][0] + 2 * u * t * B[1][0] + t * t * B[2][0], u * u * B[0][1] + 2 * u * t * B[1][1] + t * t * B[2][1]]; };
  // маховые: корни под кроющими, кончики ступенькой вниз и наружу; перо светлое, тень лазурью — у корня и тонкой полосой с внутренней стороны
  const primCol = (q: number, s: number): Col => (s > 0.84 && q > -0.1 ? S.az : s < 0.2 || q > 0.4 ? S.azHi : S.glow);
  const prim: [number, Pt][] = [[0.3, [15, 30]], [0.46, [11.3, 33]], [0.62, [7.8, 35.5]], [0.78, [4.5, 37.5]], [0.93, [1.8, 39]]];
  for (const [t, tip] of prim) {
    const f = new PC(64, 72), [rx, ry] = arm(t);
    quill(f, [rx, ry + 4], tip, 2.3, 2.0, primCol, 0.22);
    W.blit(outlined(f, S.out), 0, 0);
  }
  // кроющие: два яруса округлых перьев-чешуй вдоль руки (верхний ложится на нижний) — зубчатый край поверх корней маховых
  const scale = (t: number, dy: number, len: number, hw: number) => {
    const f = new PC(64, 72), [rx, ry] = arm(t);
    quill(f, [rx + 0.3, ry + dy], [rx - 0.5, ry + dy + len], hw, hw * 0.92, (q, s) => (s > 0.68 || q > 0.55 ? S.azHi : S.glow), 0.45);
    W.blit(outlined(f, S.out), 0, 0);
  };
  for (const t of [0.12, 0.3, 0.48, 0.66, 0.84]) scale(t, 0.6, 6.2, 2.5);
  // рука: золотая кромка 2 px поверх кроющих
  const armL = new PC(64, 72);
  for (let i = 0; i <= 60; i++) {
    const [x, y] = arm(i / 60);
    armL.set(Math.round(x - 0.5), Math.round(y - 1), G[3]);
    armL.set(Math.round(x - 0.5), Math.round(y), G[2]);
  }
  for (let y = 0; y < 72; y++) for (let x = 0; x < 64; x++) if (armL.alpha(x, y) && armL.get(x, y)![0] === G[2][0] && armL.alpha(x, y - 1) === 0) armL.set(x, y, G[3]);
  W.blit(outlined(armL, S.out), 0, 0);
  return despeckle(W);
}
function solgard2(): PC {
  const pc = new PC(64, 72);
  const wing = solWing();
  pc.blit(wing, 0, 0);
  pc.blit(wing, 0, 0, true);

  // --- французский щит: x 16–47, верхний контур ряд 14, бока до 48, низ — две дуги к острию (контур — ряд 57)
  const hwRow = (y: number) => {
    if (y < 14 || y > 57) return -1;
    if (y <= 48) return 16;
    const t = (y - 48) / 9.6;
    return Math.max(16 * (1 - t * t), 1);
  };
  const shield = Mask.of(64, 72, (x, y) => Math.abs(x + 0.5 - 32) <= hwRow(y));
  const sd = paint(pc, shield, (x, y, d) => {
    if (d === 1) return S.out;
    if (d <= 3) return x < 32 ? G[3] : G[2];
    if (y <= 32) return x >= 43 ? S.azSh : S.az;                     // верхнее поле — лазурь
    if (y === 33) return G[3];                                        // нить-горизонт
    if (y === 34) return G[2];
    return x >= 43 ? S.ivSh : S.iv;                                   // нижнее поле — серебро (кость)
  });
  const field = (x: number, y: number) => sd[y * 64 + x] >= 4;
  for (const [x, y] of [[17, 15], [18, 15], [19, 15], [17, 16], [17, 17]] as Pt[]) pc.set(x, y, G[4]);
  for (let y = 17; y <= 21; y++) for (const x of [20, 21]) pc.set(x, y, S.azHi);
  // --- солнце из нити-горизонта: купол в кольце #12365e; через одинаковый зазор 1 px лазури — семь одинаковых клиньев (как в С1),
  //     золото прямо по лазури
  const sunRays: Ray[] = [
    { deg: 22.5, r0: 7.7, r1: 11.6, hw0: 1.2, hw1: 0.45, col: G[2] },
    { deg: 45, r0: 7.7, r1: 13.8, hw0: 1.3, hw1: 0.45, col: G[3] },
    { deg: 67.5, r0: 7.7, r1: 11.6, hw0: 1.2, hw1: 0.45, col: G[2] },
    { deg: 90, r0: 7.7, r1: 13.8, hw0: 1.7, hw1: 0.7, col: G[3] },
  ];
  for (let y = 17; y <= 32; y++) for (let x = 0; x < 64; x++) {
    if (!field(x, y)) continue;
    const px = mirS(x) + 0.5, py = y + 0.5, r = Math.hypot(px - 32, py - 33);
    let col: Col | null = null;
    if (r <= 5.6) col = r < 2.8 ? S.glow : r < 4.4 ? G[3] : G[2];
    else if (r <= 6.7) col = S.azDk;
    else for (const ray of sunRays) if (inRay(px, py, 32, 33, ray.deg, ray.r0, ray.r1, ray.hw0, ray.hw1)) { col = ray.col; break; }
    if (col) pc.set(x, y, col);
  }
  // --- щиток с четырёхлучевой звездой: золотая кайма 1 px, рама #7a6a4c отделяет золото от кости
  const escHw = (y: number) => (y < 37 || y > 53 ? -1 : y <= 43 ? 7 : Math.max(7 * (1 - Math.pow((y - 43) / 10.4, 1.7)), 1));
  const esc = new PC(64, 72);
  const em = Mask.of(64, 72, (x, y) => Math.abs(x + 0.5 - 32) <= escHw(y));
  paint(esc, em, (x, y, d) => (d === 1 ? (x < 32 ? G[3] : G[2]) : x >= 35 ? S.azSh : S.az));
  esc.blit(grid([
    "...AA...",
    "...AA...",
    "..AAAA..",
    "AAAYYAAA",
    "AAAYYaaa",
    "..AAaa..",
    "...Aa...",
    "...Aa...",
  ], { A: G[3], a: G[2], Y: S.glow }), 28, 40);
  pc.blit(outlined(esc, S.ivDk), 0, 0);
  // --- лучистая корона: обруч 24 px, пять зубцов-шипов (средний выше), три сапфира
  const crown = new PC(64, 72);
  const teeth: [number, number][] = [[20, 6], [25, 3], [30, 1], [35, 3], [40, 6]];
  for (const [x0, tip] of teeth) for (let y = tip; y <= 8; y++) {
    const narrow = y < tip + Math.max(1, Math.round((8 - tip) * 0.45));
    for (let i = narrow ? 1 : 0; i <= (narrow ? 2 : 3); i++) crown.set(x0 + i, y, y === tip ? S.glow : i >= 2 ? G[2] : G[3]);
  }
  for (let y = 9; y <= 12; y++) for (let x = 20; x <= 43; x++) crown.set(x, y, y === 12 ? G[2] : y === 9 && x < 32 ? G[4] : x >= 32 ? G[2] : G[3]);
  for (const sx of [26, 31, 36]) { crown.set(sx, 10, S.azHi); crown.set(sx + 1, 10, S.az); crown.set(sx, 11, S.az); crown.set(sx + 1, 11, S.azSh); }
  pc.blit(outlined(crown, S.out), 0, 0);
  // --- лента
  ribbon(pc, { axis: "S", top: 59, mx0: 7, ex0: 1, h: 9, arc: 2, drop: 3, notch: NOTCH9, fold: 3 }, SOL_RIBBON, "ЗАРЯ ГРЯДЁТ");
  return pc;
}

// ---------------------------------------------------------------- Сольгард 3 «Меч Зари»
function solgard3(): PC {
  const pc = new PC(64, 72);
  // --- сияние за щитом: диск r 12 и веер из 9 лучей через 20° (длинные/короткие через один); нижние ложатся на плечи щита
  const rays: Ray[] = [
    { deg: 10, r0: 13.2, r1: 21.5, hw0: 1.9, hw1: 0.6, col: G[3] },
    { deg: 30, r0: 13.4, r1: 17.2, hw0: 1.3, hw1: 0.5, col: G[2] },
    { deg: 50, r0: 13.2, r1: 20.5, hw0: 1.9, hw1: 0.6, col: G[3] },
    { deg: 70, r0: 13.4, r1: 17.2, hw0: 1.3, hw1: 0.5, col: G[2] },
    { deg: 90, r0: 13.2, r1: 18.6, hw0: 2, hw1: 1, col: G[3] },
  ];
  pc.blit(sunburst(32, 20, 12, [[8.2, S.glow], [10.6, G[3]], [99, G[2]]], rays, S.out, 19), 0, 0);
  // --- меч остриём к солнцу (слой готовим заранее: вдоль него на костяной половине ложится тень)
  const sw = new PC(64, 72);
  for (let y = 8; y <= 37; y++) for (let x = 30; x <= 33; x++) {
    if (y <= 10 && (x === 30 || x === 33)) continue;                   // остриё 2 px
    sw.set(x, y, x === 31 && y >= 13 && y <= 35 ? S.glow : x <= 31 ? G[3] : G[2]);
  }
  for (let y = 38; y <= 40; y++) for (let x = 24; x <= 39; x++) {
    if ((y === 38 || y === 40) && (x === 24 || x === 39)) continue;   // скруглённые концы крестовины
    sw.set(x, y, y === 40 ? G[2] : y === 38 ? (x < 32 ? G[4] : G[3]) : x < 32 ? G[3] : G[2]);
  }
  for (let y = 41; y <= 44; y++) for (const x of [31, 32]) sw.set(x, y, (y - 41) % 2 === 0 ? (x === 31 ? S.az : S.azSh) : S.azDk);
  for (let y = 45; y <= 49; y++) for (let x = 29; x <= 34; x++) {
    if (Math.hypot(x + 0.5 - 32, y + 0.5 - 47.5) > 2.45) continue;
    sw.set(x, y, x < 32 ? G[3] : G[2]);
  }
  sw.set(31, 46, S.azHi); sw.set(32, 46, S.az); sw.set(31, 47, S.az); sw.set(32, 47, S.azSh);
  outlined(sw, S.out);
  // --- миндалевидный (норманнский) щит: x 17–46, верх дугой (ряд 18 в центре, 20 у краёв), бока до 31, ниже сужение;
  //     остриё одним куском: 6 → 4 → 4 px золота в кайме, контур — ряд 58
  const HW = 15, top = (u: number) => 18 + 2 * (u / HW) * (u / HW);
  const TIP: Record<number, number> = { 53: 3.4, 54: 3, 55: 2.6, 56: 2, 57: 2, 58: 1 };
  const hwRow = (y: number) => {
    if (y < 18 || y > 58) return -1;
    if (y <= 31) return HW;
    return TIP[y] ?? HW * (1 - Math.pow((y - 31) / 26.5, 1.3));
  };
  const shield = Mask.of(64, 72, (x, y) => { const u = Math.abs(x + 0.5 - 32); return u <= hwRow(y) && y + 0.5 >= top(u); });
  paint(pc, shield, (x, y, d) => {
    if (d === 1) return S.out;
    if (d <= 3) return x < 32 ? G[3] : G[2];
    if (x < 32) return sw.alpha(x + 1, y) || sw.alpha(x + 2, y) ? S.ivSh : S.iv;   // кость; у клинка тень 2 px
    return x >= 41 ? S.azSh : S.az;
  });
  for (const [x, y] of [[19, 20], [20, 20], [18, 21], [18, 22], [18, 23]] as Pt[]) pc.set(x, y, G[4]);
  // --- звёзды наоборот: лазоревая на кости, костяная на лазури (нижняя правая половина в тени)
  const star7 = ["...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#..."];
  const putStar = (cx: number, cy: number, lit: Col, dark: Col) => star7.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === "#") pc.set(cx - 3 + i, cy - 3 + j, (i >= 3 && j >= 3 && !(i === 3 && j === 3)) || (i > 3 && j === 3) || (j > 3 && i === 3) ? dark : lit);
  }));
  putStar(24, 26, S.az, S.azSh);
  putStar(39, 26, S.iv, S.ivSh);
  pc.blit(sw, 0, 0);
  // --- лента: пробелы между словами 4 px
  ribbon(pc, { axis: "S", top: 60, mx0: 7, ex0: 1, h: 9, arc: 2, drop: 3, notch: NOTCH9, fold: 3 }, SOL_RIBBON, "СВЕТ И СТАЛЬ", 4);
  return pc;
}

// ---------------------------------------------------------------- общие детали Умбрата
/** Симметричная маска Умбрата (ось — столбец 32): fn задаёт правую половину (x ≥ 32), левая зеркальна, столбец 0 пуст. */
function symU(fn: (x: number, y: number) => boolean) { return Mask.of(64, 72, (x, y) => { const sx = mirU(x); return sx < 64 && fn(sx, y); }); }
/** Слой фигуры Умбрата: рисуем, обводим контуром #05030a снаружи, кладём на холст. */
function layerU(pc: PC, draw: (l: PC) => void, diag = false) { const l = new PC(64, 72); draw(l); pc.blit(outlined(l, U.out, diag), 0, 0); return l; }
/** Свод черепа: эллипс кости с бликом сверху слева и тенью-серпом справа снизу. Координаты — пиксели Умбрата (ось — столбец). */
function skullVault(l: PC, cx: number, cy: number, rx: number, ry: number, hl: [number, number, number, number]) {
  const B = U.bone;
  for (let y = 0; y < 72; y++) for (let x = 0; x < 64; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy > 1) continue;
    const sx = (x - cx + 1.6) / rx, sy = (y - cy + 1.6) / ry;
    const hx = (x - hl[0]) / hl[2], hy = (y - hl[1]) / hl[3];
    l.set(x, y, hx * hx + hy * hy <= 1 ? B[3] : sx * sx + sy * sy > 1 ? B[1] : B[2]);
  }
}
/** Глазница: тёмный круг r²≤rr с зелёным свечением 3×3 (центр ярче, блик слева сверху). */
function eyeU(l: PC, ex: number, ey: number, rr: number, glow = true) {
  for (let y = ey - 3; y <= ey + 3; y++) for (let x = ex - 3; x <= ex + 3; x++) {
    const dx = x - ex, dy = y - ey;
    if (dx * dx + dy * dy > rr) continue;
    const g = glow && Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
    l.set(x, y, !g ? U.k0 : dx === 0 && dy === 0 ? U.g2 : dx === -1 && dy === -1 ? U.g3 : U.g1);
  }
}

// ---------------------------------------------------------------- Умбрат 1 «Корона над гробом»
function umbrath1(): PC {
  const pc = new PC(64, 72), Y = 2;                                    // всё ниже короны сдвинуто на 2 px: корона выросла
  // --- гроб-щит: шестиугольник (20,14)–(44,14)–(53,23)–(41,59)–(23,59)–(11,23); верхние скосы 45°, длинные борта 1:3
  const left = (y: number) => (y < 12 + Y || y > 57 + Y ? 99 : y <= 21 + Y ? 20 - (y - 12 - Y) : 11 + Math.floor((y - 21 - Y) / 3));
  const cofM = Mask.of(64, 72, (x, y) => { const l = left(y); return l < 99 && x >= l && x <= 64 - l; });
  layerU(pc, (l) => {
    paint(l, cofM, (x, y, k) => {
      const lit = y === 12 + Y || (x < 32 && y < 57 + Y);
      if (k === 1) return lit ? U.sil[2] : U.sil[1];
      if (k === 2) return U.sil[0];
      if (k === 3) return lit && x < 32 ? U.k2 : U.k1;
      if (k === 5) return U.p2;
      const v = (x - 14) * 0.9 + (y - 15 - Y);
      return v < 10 && (x + y) % 2 === 0 ? U.k3 : U.k2;
    });
    for (const [x, y] of [[20, 12], [43, 12], [11, 21], [52, 21], [23, 56], [40, 56]] as Pt[]) {
      l.set(x, y + Y, U.sil[3]); l.set(x + 1, y + Y, U.sil[3]); l.set(x, y + 1 + Y, U.sil[3]); l.set(x + 1, y + 1 + Y, U.sil[1]);
    }
  });
  // --- цепи: короткий провис вдоль плеч гроба — кольцо 3×4 с прозрачной дыркой 1×2, ребро 1×3, кольцо, ребро до заклёпки плеча
  {
    const l = new PC(64, 72), holes: Pt[] = [];
    const both = (x: number, y: number, col: Col) => { l.set(x, y, col); l.set(64 - x, y, col); };
    const ring = (x: number, y: number) => {
      both(x + 1, y, U.sil[3]);
      for (const j of [1, 2]) { both(x, y + j, U.sil[2]); both(x + 2, y + j, U.sil[1]); holes.push([x + 1, y + j], [63 - x, y + j]); }
      both(x + 1, y + 3, U.sil[1]);
    };
    ring(16, 10 + Y);                                                  // у конца обруча
    for (let j = 0; j < 3; j++) both(14, 13 + Y + j, j ? U.sil[1] : U.sil[2]);
    ring(10, 15 + Y);
    for (let j = 0; j < 3; j++) both(10, 19 + Y + j, j ? U.sil[1] : U.sil[2]);
    outlined(l, U.out);
    for (const [x, y] of holes) l.clear(x, y);                        // дырки звеньев остаются прозрачными
    pc.blit(l, 0, 0);
  }
  // --- «Мёртвая Корона»: высокие сиреневые зубцы (центральный 9 px, средние 7, крайние 5), кромка слева #d0b4f0, тень справа #46265e;
  //     чёрный обруч с тремя зелёными камнями, жемчуг на остриях
  layerU(pc, (l) => {
    const teeth: [number, number[]][] = [[21, [1, 3, 3, 5, 5]], [26, [1, 1, 3, 3, 5, 5, 5]], [32, [1, 1, 3, 3, 3, 5, 5, 7, 7]]];
    for (const [cx, widths] of teeth) widths.forEach((w, i) => {
      const y = 10 - widths.length + i, h = (w - 1) / 2;
      for (let dx = -h; dx <= h; dx++) {
        const col = i === 0 || w === 1 ? U.lil : dx === -h ? U.lil : dx === h ? U.p1 : U.p3;
        l.set(cx + dx, y, col);
        if (cx !== 32) l.set(64 - cx + dx, y, col);
      }
    });
    l.set(32, 2, U.lil);
    for (let x = 19; x <= 45; x++) { l.set(x, 10, x <= 26 ? U.lil : U.p3); l.set(x, 11, U.k0); l.set(x, 12, U.k0); }
    for (const sx of [23, 31, 39]) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) l.set(sx + i, 11 + j, i === 0 && j === 0 ? U.g2 : U.g1);
  });
  // --- череп на позвоночном скипетре (рисунок утверждён, сдвинут на 2 px)
  layerU(pc, (l) => {
    skullVault(l, 32, 28 + Y, 9.5, 8, [29, 24.6 + Y, 3.6, 2.4]);
    for (let y = 35 + Y; y <= 36 + Y; y++) for (let x = 25; x <= 39; x++) l.set(x, y, x === 25 || x === 39 ? U.bone[0] : x >= 37 ? U.bone[1] : U.bone[2]);
    for (let y = 37 + Y; y <= 39 + Y; y++) for (let x = 27; x <= 37; x++) l.set(x, y, y === 39 + Y ? U.bone[0] : x % 2 === 1 && x >= 29 && x <= 35 ? U.k0 : x >= 36 ? U.bone[1] : U.bone[2]);
    for (let y = 40 + Y; y <= 42 + Y; y++) for (let x = 26; x <= 38; x++) {
      const u = Math.abs(x - 32);
      if ((y === 41 + Y && u > 5) || (y === 42 + Y && u > 3)) continue;
      l.set(x, y, y === 42 + Y || x >= 36 ? U.bone[1] : U.bone[2]);
    }
    for (let i = 0; i <= 4; i++) l.set(25 + Math.round(i / 2), 23 + Y + i, U.bone[0]);
    eyeU(l, 28, 30 + Y, 6.5); eyeU(l, 36, 30 + Y, 6.5);
    l.set(32, 33 + Y, U.k0); for (let x = 31; x <= 33; x++) l.set(x, 34 + Y, U.k0);
    for (const vy of [44, 47, 50, 53]) {
      const yy = vy + Y;
      for (let x = 30; x <= 34; x++) for (let j = 0; j < 2; j++) l.set(x, yy + j, x === 30 ? U.bone[3] : x === 34 ? U.bone[1] : U.bone[2]);
      l.set(29, yy, U.bone[2]); l.set(35, yy, U.bone[1]);
      l.set(32, yy, U.g2);
      if (vy < 53) for (let x = 31; x <= 33; x++) l.set(x, yy + 2, U.bone[0]);
    }
    l.set(32, 55 + Y, U.bone[1]);
  });
  // --- лента «КОРОНА ВЕЧНА»: середина пурпур, концы загнуты назад и вниз, складка изнанки
  ribbon(pc, { axis: "U", top: 60, mx0: 5, ex0: 1, h: 9, arc: 0, drop: 2, notch: [0, 0, 1, 2, 2, 1, 0, 0, 0], fold: 2 },
    { out: U.out, mid: [U.p3, U.p2, U.p1], end: [U.p1, U.p0, U.p0], fold: U.k1, text: U.bone[3] }, "КОРОНА ВЕЧНА");
  return pc;
}

// ---------------------------------------------------------------- Умбрат 2 «Крылатый череп»
/** Крыло черепа (левое; правое — зеркало): маховые перья веером от запястья наружу — от поднятого кончика (выше венца) к нижним;
 *  нижний край — пять зубцов-перьев. Кость-рука по передней кромке. Каждое перо в контуре, верхние лежат на нижних;
 *  у пера верхняя кромка — edge, тело — body, нижняя кромка — dark. */
function skullWing(f: { body: Col; edge: Col; dark: Col; lead: Col }): PC {
  const W = new PC(64, 72), piv: Pt = [19, 19];
  // маховые веером от запястья наружу: снизу вверх, верхнее (кончик выше венца) ложится последним
  const fan: [number, number][] = [[246, 11.5], [224, 14], [202, 15.5], [181, 16.5], [161, 17], [143, 18]];
  fan.forEach(([deg, len], i) => {
    const a = deg * D2R, tip: Pt = [piv[0] + Math.cos(a) * len, piv[1] - Math.sin(a) * len];
    const l = new PC(64, 72), top = i === fan.length - 1;
    quill(l, piv, tip, 2.5, 1.8, (q) => (q < -0.5 ? (top ? f.lead : f.edge) : q > 0.55 ? f.dark : f.body), 0.32);
    W.blit(outlined(l, U.out), 0, 0);
  });
  // кроющие у плеча: три округлых пера от виска к запястью, нижний край зубчатый
  for (const [a, b] of [[[17.5, 15.5], [14.5, 21.5]], [[20.5, 16], [18.5, 23]], [[23.5, 17], [22.5, 24.5]]] as [Pt, Pt][]) {
    const l = new PC(64, 72);
    quill(l, a, b, 2.4, 2.2, (q, s) => (s < 0.3 ? f.edge : q > 0.5 || s > 0.8 ? f.dark : f.body), 0.45);
    W.blit(outlined(l, U.out), 0, 0);
  }
  return despeckle(W);
}
/** Лента-свиток «МЫ | БЫЛИ | ВАМИ» одним куском: боковые части выше и позади, их внутренний край срезан косо — там лента
 *  уходит назад косой складкой изнанки #4e4638 шириной 3 px и выходит лицевой серединой; на внешних концах — ласточкины хвосты
 *  вниз и наружу. */
function scrollU2(pc: PC) {
  const B = U.bone, H = 9, sTop = 57, mTop = 61;
  const lxU = (x: number) => (x <= 32 ? x : 64 - x);
  const e = (y: number) => 19 + Math.floor((y - sTop) / 2);              // косой срез боковой части (левая половина)
  // хвосты: свисают из-под внешних концов, косо наружу, ласточкин хвост
  const tail = ["#####", "#ddd#", "#ddd#", "#ddd#", "#dd#.", "#d#d#", "##.##"];
  tail.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === ".") return;
    const x = i - (j >= 4 ? 1 : 0) + 1, y = 63 + j, col = ch === "#" ? U.out : B[1];
    pc.set(x, y, col); pc.set(64 - x, y, col);
  }));
  // боковые части со складкой: одна маска, по косому срезу — линия сгиба, за ней изнанка
  const side = Mask.of(64, 72, (x, y) => { const l = lxU(x), r = y - sTop; return r >= 0 && r < H && l >= 1 && l <= e(y) + 3; });
  paint(pc, side, (x, y, d) => {
    const l = lxU(x), r = y - sTop;
    if (d === 1 || l === e(y)) return U.out;
    if (l > e(y)) return B[0];
    if (l === e(y) - 1) return B[1];                                      // лента поворачивает — тень у сгиба
    return r === 1 ? B[3] : r === H - 2 ? B[1] : B[2];
  });
  // середина (лицевая)
  const mid = Mask.of(64, 72, (x, y) => lxU(x) >= 21 && y >= mTop && y < mTop + H);
  paint(pc, mid, (x, y, d) => (d === 1 ? U.out : y === mTop + 1 ? B[3] : y === mTop + H - 2 ? B[1] : B[2]));
  const put = (s: string, cx: number, y: number) => { const L = layoutText(s); L.gl.forEach((g) => stampGlyph(pc, g, Math.round(cx - L.width / 2) + g.x, y, U.k2)); };
  put("БЫЛИ", 32.5, mTop + 2);
  put("МЫ", 10.5, sTop + 2);
  put("ВАМИ", 54, sTop + 2);
}
function umbrath2(): PC {
  const pc = new PC(64, 72);
  // --- надгробие: полукруглый (чуть приплюснутый) верх, прямые борта x11/x53, обод камня 2 px; поле рассечено чернью и пурпуром
  const tomb = symU((x, y) => (y < 8 || y > 54 ? false : y < 27 ? ((x - 32) / 21.3) ** 2 + ((y - 27) / 19.3) ** 2 <= 1 : x <= 53));
  layerU(pc, (l) => {
    paint(l, tomb, (x, y, d) => {
      const lft = x < 32;
      if (d === 1) return lft ? U.sil[2] : U.sil[1];
      if (d === 2) return U.sil[0];
      if (x === 32) return U.out;
      if (lft) return y >= 51 ? U.k1 : d === 3 ? U.k3 : U.k2;
      if (y >= 51) return U.p1;
      if (d === 3) return y < 22 ? U.p3 : U.p1;
      return U.p2;
    });
  });
  // --- цоколь
  layerU(pc, (l) => {
    for (let y = 55; y <= 57; y++) for (let x = 9; x <= 55; x++) l.set(x, y, y === 55 ? U.sil[2] : U.sil[1]);
    for (const [x, y] of [[15, 56], [16, 57], [38, 56], [47, 56], [48, 57]] as Pt[]) l.set(x, y, U.sil[0]);
  });
  // --- крылья переменных тинктур: на черни — пурпурное, на пурпуре — чёрное (кромка каждого пера #9a62b8)
  pc.blit(skullWing({ body: U.p2, edge: U.p3, dark: U.p1, lead: U.lil }), 0, 0);
  pc.blit(mirrorU(skullWing({ body: U.k2, edge: U.p3, dark: U.k0, lead: U.p3 })), 0, 0);
  // --- череп в низком железном венце (сдвинут на 1 px вниз: над венцом встала лампада)
  const Y = 1;
  layerU(pc, (l) => {
    skullVault(l, 32, 24 + Y, 7.5, 7, [30, 21 + Y, 2.4, 1.6]);
    for (let x = 26; x <= 38; x++) l.set(x, 30 + Y, x >= 36 ? U.bone[1] : U.bone[2]);
    for (let y = 31 + Y; y <= 32 + Y; y++) for (let x = 27; x <= 37; x++) l.set(x, y, x % 2 === 1 && x >= 29 && x <= 35 ? U.k0 : x >= 36 ? U.bone[1] : U.bone[2]);
    for (let y = 33 + Y; y <= 35 + Y; y++) for (let x = 27; x <= 37; x++) {
      if (y === 35 + Y && (x < 29 || x > 35)) continue;
      l.set(x, y, y === 35 + Y || x >= 36 ? U.bone[1] : y === 33 + Y ? U.bone[0] : U.bone[2]);
    }
    for (const ex of [27, 34]) for (let y = 24 + Y; y <= 27 + Y; y++) for (let x = ex; x <= ex + 3; x++) {
      const p = x >= ex + 1 && x <= ex + 2 && y >= 25 + Y && y <= 26 + Y;
      l.set(x, y, !p ? U.k0 : x === ex + 1 && y === 25 + Y ? U.g2 : U.g1);
    }
    l.set(32, 28 + Y, U.k0); for (let x = 31; x <= 33; x++) l.set(x, 29 + Y, U.k0);
    for (let x = 24; x <= 40; x++) { l.set(x, 15 + Y, x <= 28 ? U.lil : U.p3); l.set(x, 16 + Y, U.k0); l.set(x, 17 + Y, U.p1); }
    for (const [x, col] of [[27, U.g1], [28, U.g1], [31, U.g2], [32, U.g2], [33, U.g2], [36, U.g1], [37, U.g1]] as [number, Col][]) l.set(x, 16 + Y, col);
    for (const cx of [25, 28, 32, 36, 39]) {
      const apex = (cx === 32 ? 10 : 12) + Y;
      l.set(cx, apex, U.lil);
      for (let y = apex + 1; y <= 14 + Y; y++) {
        const wide = y >= (cx === 32 ? 12 : 13) + Y;
        if (wide) { l.set(cx - 1, y, U.p3); l.set(cx, y, U.p1); l.set(cx + 1, y, U.k2); }
        else l.set(cx, y, U.p3);
      }
    }
  });
  // --- песочные часы: почти истёкший зелёный песок (рисунок утверждён)
  layerU(pc, (l) => {
    for (const py of [39, 52]) for (let x = 26; x <= 38; x++) { l.set(x, py, U.bone[3]); l.set(x, py + 1, x >= 37 ? U.bone[1] : U.bone[2]); }
    for (let y = 41; y <= 51; y++) { l.set(27, y, U.bone[1]); l.set(37, y, U.bone[1]); }
    const half = [4, 3, 2, 1, 1, 0, 1, 1, 2, 3, 4];
    half.forEach((h, i) => {
      const y = 41 + i;
      for (let x = 32 - h; x <= 32 + h; x++) {
        const edge = x === 32 - h || x === 32 + h;
        let col: Col = edge ? U.lil : U.k1;
        if (!edge && (y === 44 || y === 45)) col = U.g1;
        if (y >= 49 && !edge) col = y === 49 ? U.g2 : U.g1;
        if (x === 32 && y >= 46 && y <= 48) col = U.g2;
        l.set(x, y, col);
      }
    });
  });
  // --- лампада-навершие: чаша на вершине арки, пламя 3×5 — острый кончик #dcffd0, тело #3fcf45, ядро #7aff6a
  layerU(pc, (l) => {
    for (let x = 29; x <= 35; x++) l.set(x, 6, x <= 30 ? U.sil[3] : U.sil[2]);
    for (let x = 30; x <= 34; x++) l.set(x, 7, x >= 33 ? U.sil[0] : U.sil[1]);
    for (let x = 31; x <= 33; x++) l.set(x, 8, U.sil[0]);
    const flame = [".W.", ".G.", "gGg", "gGg", "ggg"];
    flame.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") l.set(31 + i, 1 + j, ch === "W" ? U.g3 : ch === "G" ? U.g2 : U.g1); }));
  });
  // --- лента-свиток «МЫ | БЫЛИ | ВАМИ»: середина лицевая, боковые части выше и уходят назад через косые складки #4e4638,
  //     концы — ласточкин хвост вниз и наружу
  scrollU2(pc);
  return pc;
}

// ---------------------------------------------------------------- Умбрат 3 «Корона затмения»
function umbrath3(): PC {
  const pc = new PC(64, 72), CY = 30;
  // --- французский щит: верх y6, борта x10/x54 до y38, ниже четверти эллипса к острию (32,62); обод чернёного серебра 2 px;
  //     сумеречное небо: тёмный верх → пурпур → зарево; переходы — упорядоченный дизер в три строки (25 → 50 → 75 %)
  const shM = symU((x, y) => (y < 6 || y > 62 ? false : y <= 38 ? x <= 54 : (x - 32) / 22.5 <= Math.sqrt(Math.max(0, 1 - ((y - 38) / 24.5) ** 2))));
  const ramp = (x: number, y: number, y0: number, a: Col, b: Col) => {   // строки y0, y0+1, y0+2 — доля b 25/50/75 %
    const k = y - y0;
    if (k < 0) return a;
    if (k > 2) return b;
    return (k === 0 ? x % 4 === 1 : k === 1 ? (x + y) % 2 === 0 : x % 4 !== 3) ? b : a;
  };
  let sd: Int16Array = new Int16Array(0);
  layerU(pc, (l) => {
    sd = paint(l, shM, (x, y, d) => {
      if (d === 1) return (x < 32 && y < 50) || y === 6 ? U.sil[2] : U.sil[1];
      if (d === 2) return U.sil[0];
      return y < 40 ? ramp(x, y, 14, U.p1, U.p2) : ramp(x, y, 42, U.p2, U.p3);
    });
  });
  const inField = (x: number, y: number) => sd[y * 64 + x] >= 3;
  for (const [sx, sy] of [[16, 11], [48, 11]] as Pt[]) { pc.set(sx, sy, U.pearl); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pc.set(sx + dx, sy + dy, U.lil); }
  pc.set(23, 8, U.lil); pc.set(41, 8, U.lil);
  // --- город-чернь по линии деления: стена с мерлонами, четыре шпиля (отодвинуты от челюсти), окна внутри шпилей ниже
  const spires: [number, number][] = [[15, 47], [21, 45], [43, 45], [49, 47]];
  for (let y = 44; y <= 62; y++) for (let x = 0; x < 64; x++) {
    if (!inField(x, y)) continue;
    const spire = spires.some(([cx, t]) => (x === cx && y >= t) || (Math.abs(x - cx) <= 1 && y >= t + 2));
    const city = y >= 53 || (y === 52 && x % 3 === 1) || spire;
    if (!city) continue;
    let col: Col = y >= 58 ? U.k1 : y >= 54 ? U.k2 : U.k1;
    if (y < 53 && spires.some(([cx]) => x === cx - 1)) col = U.k3;
    pc.set(x, y, col);
  }
  for (const [wx] of spires.slice(1, 3)) { pc.set(wx, 50, U.g2); pc.set(wx, 51, U.g1); }
  // --- затмение: сплошное гало 1 px, жемчужное кольцо 2 px (видно почти целиком: корона внутри кольца, только шипы проходят поверх),
  //     четыре тонких коротких луча по бокам (неравные), протуберанцы на 3 и 9 часах вплотную к кольцу
  for (let y = 12; y <= 48; y++) for (let x = 12; x <= 52; x++) {
    const r = Math.hypot(x - 32, y - CY);
    if (r >= 10.5 && r < 11.5) pc.set(x, y, U.pearl);
    else if (r >= 11.5 && r < 12.5) pc.set(x, y, U.lil);
    else if (r >= 12.5 && r < 13.5) pc.set(x, y, U.p3);
  }
  const rays: [Pt, Pt][] = [[[18, 25], [13, 22]], [[18, 36], [14, 38]], [[46, 25], [50, 23]], [[46, 36], [51, 38]]];
  for (const [[ax, ay], [bx, by]] of rays) {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let i = 0; i <= n; i++) pc.set(Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n), i >= n - 1 ? U.p3 : U.lil);
  }
  for (const [tx, dir] of [[18, -1], [46, 1]] as [number, number][]) {
    for (let j = 0; j < 3; j++) { pc.set(tx, CY - 1 + j, U.g1); pc.set(tx + dir, CY - 1 + j, j === 1 ? U.g2 : U.g1); }
    pc.set(tx + dir * 2, CY, U.g2);
  }
  // --- череп-луна: тёмный свод с ободом-светом слева (#46265e → #6a3c8a) и по скулам, глазницы в ободке #382858, нос сердечком,
  //     одна строка зубов #9a62b8, короткая челюсть (между нею и городом — просвет неба)
  layerU(pc, (l) => {
    const R = 9.3;
    for (let y = CY - 10; y <= CY + 10; y++) for (let x = 22; x <= 42; x++) {
      const dx = x - 32, dy = y - CY, r = Math.hypot(dx, dy);
      if (r > R) continue;
      const lit = dx * -0.7 + dy * -0.7 > 2.5;                          // сторона к свету (слева сверху)
      const shade = dx * 0.7 + dy * 0.7 > 3.5;
      l.set(x, y, r > R - 1 ? (lit ? U.p2 : shade ? U.k1 : U.k2) : r > R - 2 && lit ? U.p1 : U.k2);
    }
    for (const ex of [28, 36]) for (let y = CY - 3; y <= CY + 3; y++) for (let x = ex - 3; x <= ex + 3; x++) {
      const dx = x - ex, dy = y - CY, d2 = dx * dx + dy * dy;
      if (d2 > 9) continue;
      l.set(x, y, d2 > 5 ? U.k3 : Math.abs(dx) <= 1 && Math.abs(dy) <= 1 ? (dx === 0 && dy === 0 ? U.g2 : dx === -1 && dy === -1 ? U.g3 : U.g1) : U.k0);
    }
    for (const [x, col] of [[25, U.p1], [26, U.k3], [38, U.k3]] as [number, Col][]) l.set(x, CY + 4, col);   // скулы
    l.set(31, CY + 4, U.k0); l.set(33, CY + 4, U.k0);                                         // нос сердечком
    for (let x = 31; x <= 33; x++) l.set(x, CY + 5, U.k0);
    l.set(32, CY + 6, U.k0);
    for (let x = 27; x <= 37; x++) l.set(x, CY + 8, x % 2 === 1 ? U.p3 : U.k0);               // зубы: одна строка
    for (let x = 27; x <= 37; x++) l.set(x, CY + 7, U.k2);
    for (let y = CY + 9; y <= CY + 11; y++) for (let x = 28; x <= 36; x++) {                 // челюсть
      const u = Math.abs(x - 32);
      if ((y === CY + 10 && u > 3) || (y === CY + 11 && u > 2)) continue;
      l.set(x, y, x <= 29 || (y === CY + 10 && x === 29) ? U.p1 : y === CY + 11 ? U.k1 : U.k2);
    }
  });
  // --- корона: обруч на темени внутри кольца, пять шипов проходят поверх кольца (между ними кольцо видно)
  layerU(pc, (l) => {
    for (let x = 27; x <= 37; x++) { l.set(x, CY - 9, x <= 29 ? U.lil : U.p3); l.set(x, CY - 8, U.k0); l.set(x, CY - 7, U.k0); }
    for (let x = 31; x <= 33; x++) for (let y = CY - 8; y <= CY - 7; y++) l.set(x, y, x === 31 && y === CY - 8 ? U.g2 : U.g1);
  });
  const spikes: [number, number][] = [[27, CY - 13], [30, CY - 16], [32, CY - 19], [34, CY - 16], [37, CY - 13]];
  for (const [sx, apex] of spikes) {
    for (let y = apex; y <= CY - 10; y++) pc.set(sx, y, y === apex ? (Math.abs(sx - 32) <= 2 ? U.g2 : U.lil) : U.k0);
    pc.set(sx - 1, CY - 10, U.p3); pc.set(sx + 1, CY - 10, U.k0);
  }
  // --- лента «улыбкой»: середина чернь, концы подняты и уходят назад через косые складки #100a1a, буквы ядовито-зелёные
  ribbon(pc, { axis: "U", top: 61, mx0: 8, ex0: 1, h: 9, arc: 2, drop: -4, notch: NOTCH9, fold: 3 },
    { out: U.out, mid: [U.k3, U.k2, U.k0], end: [U.k3, U.k2, U.k1], fold: U.k1, text: U.g2 }, "СВЕТ УГАСНЕТ");
  return pc;
}

// ---------------------------------------------------------------- малые эмблемы (рисуются отдельно, не уменьшением)
/** Легенды сеток. Сетка — без внешнего контура: генератор даёт поле 1 px и обводит (Сольгард #3a2208, Умбрат #05030a);
 *  внутренние тёмные линии («#» у Сольгарда) рисуются в сетке. Кость Сольгарда — W #d6c8a4 со светлой кромкой Y: на полотнище
 *  слоновой кости (#bfae88) она светлее ткани, а не «дыра». */
const LS: Record<string, Col> = { "#": S.out, G: G[3], g: G[2], h: G[1], Y: S.glow, B: S.az, b: S.azSh, C: S.azHi, D: S.azDk, W: S.iv, w: S.ivSh, o: S.ivDk, r: G[3], s: G[2] };
/** Тонкие лучи малого солнца (r, s) кладутся после обводки — без контура: в контуре луч 1 px превращается в шип «короны». */
const RAW = new Set(["r", "s"]);
const LU: Record<string, Col> = { l: U.lil, L: U.p3, p: U.p2, q: U.p1, k: U.k2, K: U.k0, m: U.k3, n: U.k1, G: U.g2, g: U.g1, B: U.bone[3], b: U.bone[2], d: U.bone[1], W: U.pearl };
function gridOut(rows: string[], legend: Record<string, Col>, out: Col) {
  const body = rows.map((r) => [...r].map((ch) => (RAW.has(ch) ? "." : ch)).join(""));
  const g = grid(body, legend), p = new PC(g.w + 2, g.h + 2);
  p.blit(g, 1, 1);
  outlined(p, out);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (RAW.has(ch)) p.set(x + 1, y + 1, legend[ch]); }));
  return p;
}

const SMALL: Record<string, { s24: string[]; s20: string[]; s16: string[] }> = {
  // Восход над Оплотом: купол ≥ 8 px с яркой сердцевиной, 5 тонких лучей разной длины (вертикальный, два косых, два почти горизонтальных)
  "solgard-1": {
    s24: [
      "........rr........",
      "...s....rr....s...",
      "....s........s....",
      "......gGGGGg......",
      ".....gGGYYGGg.....",
      "rrr.gGGYYYYGGg.rrr",
      "...gGYYYYYYYYGg...",
      "..................",
      ".GGGGGGGGgggggggg.",
      ".GBCBBBBGGBBBBbbg.",
      ".GBCBBGGYYGGBBbbg.",
      ".GBCBBGGYYggBBbbg.",
      ".GBBBBBBGgBBBBbbg.",
      ".GYYYBBYYYYBBYYYg.",
      ".GWWwBBWWWwBBWWwg.",
      ".GWWWWWWooWWWWWwg.",
      ".GWWWWWoYYoWWWWwg.",
      "..GWWWWoYYoWWWwg..",
      "...GWWWoYYoWWwg...",
      "....GWWoGGoWwg....",
      "......GGGggg......",
      "........Gg........",
    ],
    s20: [
      "......rr......",
      "..s...rr...s..",
      "...s......s...",
      ".....gGGg.....",
      "....gGYYGg....",
      "rr.gGYYYYGg.rr",
      "..............",
      ".GGGGGGgggggg.",
      ".GBCBBGgBBbbg.",
      ".GBCGGYYGgbbg.",
      ".GBBBBGgBBbbg.",
      ".GYYBYYYYBYYg.",
      ".GWwBWWWwBWwg.",
      ".GWWWWooWWWwg.",
      "..GWWoYYoWwg..",
      "...GWoYYoWg...",
      "....GGGggg....",
      "......Gg......",
    ],
    s16: [
      "......rr......",
      "..s...rr...s..",
      "...s......s...",
      ".....gGGg.....",
      "....gGYYGg....",
      "rr.gGYYYYGg.rr",
      "..............",
      ".GGGGGGgggggg.",
      ".GBCBBBBBBbbg.",
      ".GYYBYYYYBYYg.",
      ".GWwBWWWwBWwg.",
      "..GWWWooWWwg..",
      "...GWoYYoWg...",
      ".....GGgg.....",
    ],
  },
  // Корона Рассвета: верхнее лазоревое поле выше нижнего, в нём купол 8×3 с ярким центром и три луча по 2 px; щиток заменён золотой звездой
  "solgard-2": {
    s24: [
      "........YY........",
      ".....Y..Gg..Y.....",
      "...Y.G.GGgg.g.Y...",
      "...GGGGGGgggggg...",
      "...ggBggBBggBgg...",
      ".################.",
      ".GGGGGGGGgggggggg.",
      ".GCBBBBBBBBBBBBbg.",
      ".GCBBBBBGgBBBBbbg.",
      ".GBBgBBBGgBBBgbbg.",
      ".GBBBgBBBBBBgBbbg.",
      ".GBBBBBggggBBBbbg.",
      ".GBBBBgGYYGgBBbbg.",
      ".GBBBgGYYYYGgBbbg.",
      ".GGGGGGGGgggggggg.",
      ".GWWWWWWGgWWWWwwg.",
      ".GWWWWWGYYgWWWwwg.",
      ".GWWWWWWGgWWWWwwg.",
      "..GWWWWWWWWWWwwg..",
      "...GWWWWWWWWwwg...",
      ".....GGGGgggg.....",
      "........Gg........",
    ],
    s20: [
      "......YY......",
      "...Y..Gg..Y...",
      "...G.GGgg.g...",
      "..GGGGGggggg..",
      "..gBggBBggBg..",
      ".############.",
      ".GGGGGGgggggg.",
      ".GCBBBGgBBBbg.",
      ".GBgBBGgBBgbg.",
      ".GBBgBBBBgBbg.",
      ".GBBBggggBBbg.",
      ".GBBgGYYGgBbg.",
      ".GBgGYYYYGgbg.",
      ".GGGGGGgggggg.",
      ".GWWWWGgWWwwg.",
      ".GWWWGYYgWwwg.",
      "..GWWWGgWwwg..",
      "....GGGggg....",
    ],
    s16: [
      ".GGGGGGgggggg.",
      ".GCBBBGgBBBbg.",
      ".GBgBBGgBBgbg.",
      ".GBBgBBBBgBbg.",
      ".GBBBggggBBbg.",
      ".GBBgGYYGgBbg.",
      ".GBgGYYYYGgbg.",
      ".GGGGGGgggggg.",
      ".GWWWWGgWWwwg.",
      ".GWWWGYYgWwwg.",
      "..GWWWGgWwwg..",
      "....GGGggg....",
    ],
  },
  // Меч Зари: сияние с горизонтальными лучами на плечах щита, половины кость/лазурь, меч — золотой крест в тёмном контуре
  "solgard-3": {
    s24: [
      "........GG........",
      "...g....GG....g...",
      "....g..####..g....",
      "......#gggg#......",
      ".....#gGGGGg#.....",
      "....#gGGYYGGg#....",
      "GG.#gGYYYYYYGg#.gg",
      "##################",
      "GGGGGGG#YY#ggggggg",
      "GYWWWWw#Yg#BBBBbbg",
      "GWWWWWw#Yg#BBBBbbg",
      "GWWWWWw#Yg#BBBBbbg",
      "GWWWWWw#Gg#BBBBbbg",
      "GWW#####Gg#####bbg",
      "GW#GGGGGGgggggg#bg",
      ".GW#####Bb#####bg.",
      "..GWWWw#Bb#BBbbg..",
      "...GWWw#Gg#bbbg...",
      "....GWw####bbg....",
      ".....GWWWbbbg.....",
      "......GWWbbg......",
      ".......GGgg.......",
    ],
    s20: [
      "........##........",
      "...#...#GG#...#...",
      "..#G#..#GG#..#G#..",
      "...#G########G#...",
      "....##gggggg##....",
      "....#ggGGGGgg#....",
      ".###ggGGYYGGgg###.",
      "#GG#gGGYYYYGGg#GG#",
      ".################.",
      "..#WWWW#YY#BBBB#..",
      "..#WWWW#Yg#BBbb#..",
      "..#WWWW#Gg#BBbb#..",
      "..#WW###Gg###Bb#..",
      "..#W#GGGGgggg#b#..",
      "...#W###Bb###b#...",
      "....#WW#Gg#bb#....",
      ".....#W####b#.....",
      "......#WWbb#......",
      ".......#Wb#.......",
      "........##........",
    ],
    s16: [
      "......##......",
      ".....#GG#.....",
      ".....#GG#.....",
      "....#gggg#....",
      ".#.#gGYYGg#.#.",
      "#G#gGYYYYGg#G#",
      "##############",
      ".#WWW#YY#BBB#.",
      ".#WWW#Yg#BBb#.",
      ".#W#GGGggg#b#.",
      ".#WWW#Bb#bbb#.",
      "..#WW#Gg#bb#..",
      "...#WW##bb#...",
      "....#WWbb#....",
      ".....#Wb#.....",
      "......##......",
    ],
  },
  // Корона над гробом: высокая сиреневая корона над черепом (как на утверждённом знамени)
  "umbrath-1": {
    s24: [
      "........l........",
      "........l........",
      ".......lLq.......",
      "...l...lLq...l...",
      "..lLq.lLLLq.lLq..",
      "..lLq.lLLLq.lLq..",
      ".lLLLLLLLLLLLLLq.",
      "llLLLLLLLLLLLLLLq",
      "KKKGKKKKGKKKKGKKK",
      ".................",
      ".....BBBbbbd.....",
      "...BBBBbbbbbbd...",
      "..BBBbbbbbbbbbd..",
      ".BBbbbbbbbbbbbbd.",
      ".bKKKKbbbbbKKKKd.",
      ".bKGgKbbbbbKgGKd.",
      ".dKggKbbKbbKggKd.",
      "..bbbbbKKKbbbbd..",
      "...bbbbbbbbbbd...",
      "...dKBKBKBKBKd...",
      "....dbbbbbbbd....",
      ".....ddddddd.....",
    ],
    s20: [
      ".......l.......",
      ".......l.......",
      "..l...lLq...l..",
      ".lLq.lLLLq.lLq.",
      "llLLLLLLLLLLLLq",
      "KKGKKKKGKKKKGKK",
      "...............",
      "....BBbbbbd....",
      "..BBBbbbbbbbd..",
      ".BBbbbbbbbbbbd.",
      ".bKKKbbbbbKKKd.",
      ".bKGKbbbbbKGKd.",
      ".dKgKbbKbbKgKd.",
      "..bbbbKKKbbbd..",
      "...bbbbbbbbd...",
      "...dKBKBKBKd...",
      "....dbbbbbd....",
      ".....ddddd.....",
    ],
    s16: [
      "......l......",
      "..l...L...l..",
      ".lLq.lLq.lLq.",
      "lLLLLLLLLLLLq",
      "KKGKKKGKKKGKK",
      ".............",
      "...BBbbbbd...",
      "..BBbbbbbbd..",
      ".bKKKbbbKKKd.",
      ".bKGKbKbKGKd.",
      "..bbbKKKbbd..",
      "...dBKBKBd...",
      "....dbbbd....",
      ".....ddd.....",
    ],
  },
  // Крылатый череп: крылья раскинуты вверх и в стороны (кончики выше черепа), нижний край — зубцы-перья; низкий венец
  "umbrath-2": {
    s24: [
      "LLl......l.l.l......lLL",
      "pppLLl..lLLLLLq..lLLppp",
      "qppppLLlKKKGKKKlLLppppq",
      "q.qppppLBBbbbbdLppppq.q",
      "..q.qppBBbbbbbbdppq.q..",
      "....q.qbKKKbKKKdq.q....",
      "......qbKGKbKGKdq......",
      ".......dKgKbKgKd.......",
      ".......bbbbKbbbd.......",
      "........dbbbbbd........",
      "........dKBKBKd........",
      ".........dbbbd.........",
      "..........ddd..........",
    ],
    s20: [
      "LLl.....l.l.l.....lLL",
      "pppLLl.lLLLLLq.lLLppp",
      "qpppppLKKKGKKKLpppppq",
      "q.qppppBBbbbbdppppq.q",
      "..q.qpBBbbbbbbdpq.q..",
      "....q.bKKbbbKKd.q....",
      "......bgGbbbGgd......",
      "......dbbbKbbbd......",
      ".......dbbbbbd.......",
      ".......dKBKBKd.......",
      "........dbbbd........",
      ".........ddd.........",
    ],
    s16: [
      "Ll......l......lL",
      "pLLl..l.L.l..lLLp",
      "qppLLKKKGKKKLLppq",
      "q.qppBBbbbbdppq.q",
      "..q.qbKKbKKdq.q..",
      "....qbgGbGgdq....",
      ".....dbbKbbd.....",
      "......dKBKd......",
      ".......ddd.......",
    ],
  },
  // Корона затмения: жемчужное кольцо видно почти целиком (шипы короны проходят поверх), череп с ободом-светом, челюсть ниже кольца
  "umbrath-3": {
    s24: [
      "........l........",
      "........L........",
      ".....l..L..l.....",
      ".....LWWLWWL.....",
      "....WLLLLLLLW....",
      "...W.KKKGKKK.W...",
      "..W..ppmmmmk..W..",
      "..W.ppmmmmmmk.W..",
      ".W.pqKKmmmKKmk.W.",
      ".W.qmgGmmmGgmk.W.",
      ".W.qmmmKmKmmmk.W.",
      ".W.mmmmmKmmmmk.W.",
      ".W.mmmmmmmmmmk.W.",
      "..W.mLKLKLKLm.W..",
      "..W..kmmmmmk..W..",
      "...W..kmmmk..W...",
      "....WW.kmk.WW....",
      "......WkmkW......",
      ".......kkk.......",
    ],
    s20: [
      ".......l.......",
      ".......L.......",
      ".....lWLWl.....",
      "...WWL.L.LWW...",
      "..WW.LLLLL.WW..",
      "..W.KKKGKKK.W..",
      ".W.ppmmmmmmk.W.",
      ".W.pKKmmmKKk.W.",
      ".W.qgGmmmGgk.W.",
      ".W.qmmKmKmmk.W.",
      ".W.mmmmKmmmk.W.",
      "..W.mLKLKLm.W..",
      "..WW.kmmmk.WW..",
      "...WW.kmk.WW...",
      ".....WkmkW.....",
      "......kkk......",
    ],
    s16: [
      "......l......",
      "......L......",
      "....lWLWl....",
      "...WL.L.LW...",
      "..W..LLL..W..",
      ".W.KKKGKKK.W.",
      ".W.pKKmKKk.W.",
      ".W.qGgmgGk.W.",
      ".W.mmKmKmk.W.",
      ".W.mLKLKLm.W.",
      "..W..kmk..W..",
      "...W.kmk.W...",
      "....WkmkW....",
      ".....kkk.....",
    ],
  },
};
/** Готовые сетки со своим контуром (рисунок принят, не переделывался): «Меч Зари» 20 и 16 px. */
const PRE_OUTLINED = new Set(["solgard-3:s20", "solgard-3:s16"]);
/** Малая эмблема (на прозрачном фоне). */
function small(id: string, size: "s24" | "s20" | "s16"): PC {
  const rows = SMALL[id][size];
  if (PRE_OUTLINED.has(`${id}:${size}`)) return grid(rows, LS);
  return id.startsWith("solgard") ? gridOut(rows, LS, S.out) : gridOut(rows, LU, U.out);
}

// ---------------------------------------------------------------- полотнища знамени 32×46 (плоская текстура, как у «Знамени защиты»)
interface Cloth { tex: PC; mask: (x: number, y: number) => boolean }
const CW = 32, CH = 46;
function clothOf(mask: (x: number, y: number) => boolean, fn: (x: number, y: number, d: number) => Col): Cloth {
  const tex = new PC(CW, CH);
  const m = Mask.of(CW, CH, mask);
  paint(tex, m, (x, y, d) => fn(x, y, Math.min(d, 9)));
  return { tex, mask };
}
/** Сольгард (как утверждено): слоновая кость, золотая кайма 3 px, внутренняя линия, ласточкин хвост. */
function clothSolgard(): Cloth {
  const bottom = (x: number) => CH - 1 - Math.round(11 * (1 - Math.abs((2 * x) / (CW - 1) - 1)));
  const field: Col[] = [S.ivDk, S.ivSh, S.iv], trim: Col[] = [G[1], G[3], G[4]];
  return clothOf((x, y) => y <= bottom(x), (x, y, d) => {
    if (d <= 3 || y < 4) return d === 1 || y === 0 ? trim[1] : d === 3 ? trim[0] : (x + y) % 4 === 0 ? trim[2] : trim[1];
    if (d === 5) return trim[0];
    return (x + y) % 9 === 0 && d > 5 ? field[2] : field[1];
  });
}
/** Умбрат 1: чёрно-фиолетовое поле, пурпурная кайма, внутренняя линия — цепочка (2 px через 1), низ — гробовая стопа 12 px. */
function clothUmbrath1(): Cloth {
  const inset = (y: number) => (y < 30 ? 0 : Math.min(10, 2 * Math.ceil((y - 29) / 3)));
  return clothOf((x, y) => x >= inset(y) && x <= CW - 1 - inset(y), (x, y, d) => {
    if (d === 1 || y === 0) return U.p3;
    if (d === 2) return U.p2;
    if (d === 4) return (x + y) % 3 === 0 ? U.k2 : U.sil[2];
    return (x + y) % 9 === 0 && d > 5 ? U.k3 : U.k2;
  });
}
/** Умбрат 2: рассечено чернью и пурпуром (шов #05030a), кайма переменная, низ — пять острых фестонов с костяными грузиками. */
function clothUmbrath2(): Cloth {
  const bottom = (x: number) => { const k = ((x - 1) % 6 + 6) % 6; return CH - 1 - 5 + Math.abs(k - 2.5) * 2 - 0.5; };
  const mask = (x: number, y: number) => x >= 1 && x <= 30 && y <= bottom(x) + 0.5;
  const c2 = clothOf(mask, (x, y, d) => {
    const lft = x < 16;
    if (x === 16) return U.out;
    if (d <= 2 || y < 2) return lft ? (d === 1 ? U.p3 : U.p2) : d === 1 ? U.k3 : U.k0;
    return lft ? U.k2 : U.p2;
  });
  for (let i = 0; i < 5; i++) { const tx = 1 + i * 6 + 2; c2.tex.set(tx, CH - 1, U.bone[2]); c2.tex.set(tx + 1, CH - 1, U.bone[1]); }
  return c2;
}
/** Умбрат 3: пурпурное поле, внизу чёрная «земля» с тремя шпилями, низ — три языка-луча (средний длиннее), кайма чернёного серебра. */
function clothUmbrath3(): Cloth {
  const bottom = (x: number) => {
    const cx = x + 0.5, mid = Math.abs(cx - 16), side = Math.min(Math.abs(cx - 5.5), Math.abs(cx - 26.5));
    if (mid < 4.5) return 36 + 9.5 * (1 - mid / 4.5);
    if (side < 4.5) return 36 + 5.5 * (1 - side / 4.5);
    return 36;
  };
  const mask = (x: number, y: number) => y + 0.5 <= bottom(x) + 0.5;
  const spires: [number, number][] = [[8, 28], [16, 26], [23, 29]];
  return clothOf(mask, (x, y, d) => {
    if (d === 1 || y === 0) return U.sil[2];
    if (d === 2) return U.sil[1];
    const spire = spires.some(([sx, top]) => (x === sx && y >= top) || (Math.abs(x - sx) <= 1 && y >= top + 2));
    if (y >= 33 || spire) return spires.some(([sx]) => x === sx - 1) && y < 33 ? U.k3 : U.k1;
    const k = y - (y < 16 ? 8 : 21), b = k === 0 ? x % 4 === 1 : k === 1 ? (x + y) % 2 === 0 : x % 4 !== 3;   // переходы — упорядоченный дизер
    if (y < 16) return k < 0 ? U.p1 : k > 2 || b ? U.p2 : U.p1;
    return k < 0 ? U.p2 : k > 2 || b ? U.p3 : U.p2;
  });
}
const CLOTH: Record<string, () => Cloth> = {
  "solgard-1": clothSolgard, "solgard-2": clothSolgard, "solgard-3": clothSolgard,
  "umbrath-1": clothUmbrath1, "umbrath-2": clothUmbrath2, "umbrath-3": clothUmbrath3,
};
/** Полотнище с эмблемой 24 px на перекладине: так эмблема будет выглядеть на штандарте (без ветра). */
function bannerCard(id: string): PC {
  const cl = CLOTH[id](), sol = id.startsWith("solgard");
  const out = new PC(CW + 8, CH + 8);
  const tex = cl.tex.clone(), em = small(id, "s24");
  tex.blit(em, Math.floor((CW - em.w) / 2), sol ? 5 : 4);
  const L = new PC(CW + 8, CH + 8);
  L.blit(tex, 4, 6);
  out.blit(outlined(L, hex("#1b1422")), 0, 0);
  const rod = sol ? [P.wood[1], P.wood[2], P.wood[3]] : [U.k1, U.p1, U.p2];
  const knob = sol ? [G[1], G[3]] : [U.sil[1], U.sil[3]];
  for (let x = 1; x <= CW + 6; x++) { out.set(x, 2, rod[2]); out.set(x, 3, rod[1]); out.set(x, 4, rod[0]); }
  for (const kx of [0, CW + 6]) for (let y = 1; y <= 5; y++) { out.set(kx, y, knob[0]); out.set(kx + 1, y, y <= 2 ? knob[1] : knob[0]); }
  for (const rx of [7, 15, CW - 8, CW]) { out.set(rx, 5, knob[1]); out.set(rx + 1, 5, knob[0]); }
  return outlined(out, hex("#1b1422"));
}

// ---------------------------------------------------------------- сборка листа
export interface Arms { id: string; title: string; full: () => PC; s24: () => PC; s20: () => PC; s16: () => PC; card: () => PC }
const arms = (id: string, title: string, full: () => PC): Arms =>
  ({ id, title, full, s24: () => small(id, "s24"), s20: () => small(id, "s20"), s16: () => small(id, "s16"), card: () => bannerCard(id) });
export const ARMS: Arms[] = [
  arms("solgard-1", "1. ВОСХОД НАД ОПЛОТОМ", solgard1),
  arms("solgard-2", "2. КОРОНА РАССВЕТА", solgard2),
  arms("solgard-3", "3. МЕЧ ЗАРИ", solgard3),
  arms("umbrath-1", "1. КОРОНА НАД ГРОБОМ", umbrath1),
  arms("umbrath-2", "2. КРЫЛАТЫЙ ЧЕРЕП", umbrath2),
  arms("umbrath-3", "3. КОРОНА ЗАТМЕНИЯ", umbrath3),
];

/** Увеличение без сглаживания. */
export function scaleUp(src: PC, k: number): PC {
  const out = new PC(src.w * k, src.h * k);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const col = src.get(x, y)!;
    if (col[3]) out.rect(x * k, y * k, k, k, col);
  }
  return out;
}

/** Лист концептов: две строки (Сольгард, Умбрат) по три герба; под гербом — полотнище знамени с эмблемой 24 px,
 *  справа эмблемы 24, 20 и 16 px отдельно. */
function conceptSheet(): PC {
  const K = 3, CELL_W = 96, M = 6, HEAD = 9, CAP = 8, ROW_H = HEAD + CAP + 72 + 4 + 64 + 6;
  const W = M * 2 + CELL_W * 3, H = M + ROW_H * 2;
  const base = new PC(W, H);
  base.rect(0, 0, W, H, hex("#26242c"));
  const labels: [string, number, number, Col][] = [];
  const factions = [
    { name: "СОЛЬГАРД — ПОСЛЕДНИЙ ОПЛОТ", col: hex("#e8b84a"), panel: hex("#4a4856") },
    { name: "УМБРАТ — МЁРТВАЯ КОРОНА", col: hex("#b890ff"), panel: hex("#4a4856") },
  ];
  const dim = hex("#a8a2b4");
  factions.forEach((f, row) => {
    const y0 = M + row * ROW_H;
    labels.push([f.name, M + 1, y0 + 2, f.col]);
    for (let i = 0; i < 3; i++) {
      const a = ARMS[row * 3 + i], x0 = M + i * CELL_W, cy = y0 + HEAD;
      base.rect(x0 + 1, cy, CELL_W - 2, ROW_H - HEAD - 2, f.panel);
      labels.push([a.title, x0 + 3, cy + 2, hex("#ece6f4")]);
      base.blit(a.full(), x0 + Math.floor((CELL_W - 64) / 2), cy + CAP);
      const by = cy + CAP + 72 + 4, card = a.card();
      base.blit(card, x0 + 3, by);
      labels.push(["НА ЗНАМЕНИ", x0 + 4, by + card.h + 1, dim]);
      const rx = x0 + 3 + card.w + 5, s24 = a.s24(), s20 = a.s20(), s16 = a.s16();
      labels.push(["24 PX", rx, by + 1, dim]);
      base.blit(s24, rx, by + 8);
      const y2 = by + 8 + s24.h + 4;
      labels.push(["20 PX", rx, y2, dim]);
      base.blit(s20, rx, y2 + 7);
      const rx2 = rx + Math.max(s20.w, 15) + 3;
      labels.push(["16 PX", rx2, y2, dim]);
      base.blit(s16, rx2, y2 + 7);
    }
  });
  const big = scaleUp(base, K);
  for (const [s, x, y, col] of labels) drawText(big, s, x * K, y * K, col, 2, 3, 1);
  return big;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/heraldry/concepts.png");
  conceptSheet().save(out);
  console.log(out);
}
