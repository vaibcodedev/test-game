/** Силуэты game-icons.net (CC BY 3.0) для генератора иконок умений (задача 127, шаг 1).
 *  Берётся только ФОРМА: SVG растеризуется в маску, из неё считается знаковое расстояние до края (внутри < 0), а рисует иконку
 *  стиль frosty_rabbid (tools/gen/icons-frosty.ts). Сами картинки game-icons в игру не попадают.
 *  Кэш SVG: vendor/game-icons/<автор>/<имя>.svg (vendor/ в .gitignore). Скачать недостающее: npx tsx tools/gen/icons-svg.ts fetch
 *  (скачивает всё, что названо в SHAPES генератора, с raw.githubusercontent.com/game-icons/icons).
 *  Автор каждой использованной формы пишется в data/skill-icons.json (поле author) и в docs/content/credits.md. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const GI_DIR = path.join(ROOT, "vendor/game-icons");
const RAW = "https://raw.githubusercontent.com/game-icons/icons/master/";

/** Имена авторов для docs/content/credits.md (по папке репозитория). */
export const GI_AUTHORS: Record<string, string> = {
  lorc: "Lorc", delapouite: "Delapouite", skoll: "Skoll", "caro-asercion": "Caro Asercion", sbed: "sbed", "viscious-speed": "Viscious Speed",
  "john-colburn": "John Colburn", felbrigg: "Felbrigg", willdabeast: "Willdabeast", "carl-olsen": "Carl Olsen", cathelineau: "Cathelineau",
  darkzaitzev: "DarkZaitzev", quoting: "Quoting", faithtoken: "Faithtoken", "lord-berandas": "Lord Berandas", priorblue: "PriorBlue",
};
export const giAuthor = (id: string) => GI_AUTHORS[id.split("/")[0]] ?? id.split("/")[0];

type Pt = [number, number];
/** Подконтуры пути в координатах SVG. */
function parsePath(d: string): Pt[][] {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const subs: Pt[][] = [];
  let cur: Pt[] = [];
  let i = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = "", lcx = 0, lcy = 0, lastC = "";
  const num = () => parseFloat(toks[i++]);
  const flag = () => { const t = toks[i++]; return t === "1" ? 1 : 0; };
  const push = (px: number, py: number) => { cur.push([px, py]); x = px; y = py; };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const x0 = x, y0 = y, n = 14;
    for (let s = 1; s <= n; s++) {
      const t = s / n, u = 1 - t;
      push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
    }
    lcx = x2; lcy = y2;
  };
  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    const x0 = x, y0 = y, n = 10;
    for (let s = 1; s <= n; s++) {
      const t = s / n, u = 1 - t;
      push(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2);
    }
    lcx = x1; lcy = y1;
  };
  const arc = (rx: number, ry: number, rot: number, fa: number, fs: number, x2: number, y2: number) => {
    // конечные точки → центр (SVG implementation notes F.6.5)
    if (rx === 0 || ry === 0) return push(x2, y2);
    const phi = (rot * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
    const dx = (x - x2) / 2, dy = (y - y2) / 2;
    const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
    const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num2 / (den || 1)));
    if (fa === fs) co = -co;
    const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
    const cx = c * cxp - s * cyp + (x + x2) / 2, cy = s * cxp + c * cyp + (y + y2) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => {
      const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      return a;
    };
    const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dth > 0) dth -= 2 * Math.PI;
    if (fs && dth < 0) dth += 2 * Math.PI;
    const n = Math.max(6, Math.ceil(Math.abs(dth) / 0.2));
    for (let k = 1; k <= n; k++) {
      const t = th1 + (dth * k) / n;
      push(c * rx * Math.cos(t) - s * ry * Math.sin(t) + cx, s * rx * Math.cos(t) + c * ry * Math.sin(t) + cy);
    }
  };
  const close = () => { if (cur.length) { subs.push(cur); cur = []; } x = sx; y = sy; };
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "M") {
      if (cur.length) subs.push(cur);
      cur = [];
      const nx = num() + ox, ny = num() + oy;
      sx = nx; sy = ny; push(nx, ny);
      cmd = rel ? "l" : "L";
    } else if (C === "L") push(num() + ox, num() + oy);
    else if (C === "H") push(num() + (rel ? x : 0), y);
    else if (C === "V") push(x, num() + (rel ? y : 0));
    else if (C === "C") { const a = num() + ox, b = num() + oy, c2 = num() + ox, d2 = num() + oy, e = num() + ox, f = num() + oy; cubic(a, b, c2, d2, e, f); }
    else if (C === "S") {
      const rx1 = /[CS]/.test(lastC) ? 2 * x - lcx : x, ry1 = /[CS]/.test(lastC) ? 2 * y - lcy : y;
      const c2 = num() + ox, d2 = num() + oy, e = num() + ox, f = num() + oy; cubic(rx1, ry1, c2, d2, e, f);
    } else if (C === "Q") { const a = num() + ox, b = num() + oy, e = num() + ox, f = num() + oy; quad(a, b, e, f); }
    else if (C === "T") {
      const rx1 = /[QT]/.test(lastC) ? 2 * x - lcx : x, ry1 = /[QT]/.test(lastC) ? 2 * y - lcy : y;
      const e = num() + ox, f = num() + oy; quad(rx1, ry1, e, f);
    } else if (C === "A") { const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag(); arc(rx, ry, rot, fa, fs, num() + ox, num() + oy); }
    else if (C === "Z") { close(); }
    else { i++; }
    lastC = C;
  }
  if (cur.length) subs.push(cur);
  return subs;
}

/** Все заполненные пути SVG, кроме чёрной подложки на весь холст (первый путь «M0 0h512v512H0z»). */
function svgSubpaths(svg: string): Pt[][] {
  const out: Pt[][] = [];
  for (const m of svg.matchAll(/<path\b([^>]*)>/g)) {
    const d = /\bd="([^"]+)"/.exec(m[1])?.[1];
    if (!d) continue;
    if (/^M\s*0\s*0\s*h\s*512\s*v\s*512\s*H\s*0\s*z$/i.test(d.trim())) continue;
    out.push(...parsePath(d));
  }
  return out;
}

/** Растеризация с нулевым правилом обхода (nonzero) в бинарную маску w×h; точки уже в координатах маски. */
function fillNonZero(subs: Pt[][], w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = y + 0.5;
    const xs: [number, number][] = [];
    for (const sub of subs) {
      for (let k = 0; k < sub.length; k++) {
        const a = sub[k], b = sub[(k + 1) % sub.length];
        if (a[1] === b[1]) continue;
        const up = a[1] < b[1];
        const y0 = up ? a[1] : b[1], y1 = up ? b[1] : a[1];
        if (sy < y0 || sy >= y1) continue;
        xs.push([a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), up ? 1 : -1]);
      }
    }
    xs.sort((p, q) => p[0] - q[0]);
    let wind = 0;
    for (let k = 0; k + 1 < xs.length; k++) {
      wind += xs[k][1];
      if (wind !== 0) for (let x = Math.ceil(xs[k][0] - 0.5); x < Math.ceil(xs[k + 1][0] - 0.5); x++) if (x >= 0 && x < w) mask[y * w + x] = 1;
    }
  }
  return mask;
}

/** Евклидово преобразование расстояний (Felzenszwalb): для каждого пикселя — расстояние до ближайшего пикселя со значением on. */
function edt(mask: Uint8Array, w: number, h: number, on: number): Float32Array {
  const INF = 1e12;
  const f = new Float64Array(Math.max(w, h)), d = new Float64Array(Math.max(w, h)), v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1);
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] === on ? 0 : INF;
  const pass = (n: number, get: (i: number) => number, set: (i: number, val: number) => void) => {
    for (let i = 0; i < n; i++) f[i] = get(i);
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
    for (let i = 0; i < n; i++) set(i, d[i]);
  };
  for (let x = 0; x < w; x++) pass(h, (y) => g[y * w + x], (y, val) => { g[y * w + x] = val; });
  for (let y = 0; y < h; y++) pass(w, (x) => g[y * w + x], (x, val) => { g[y * w + x] = val; });
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(g[i]);
  return out;
}

export interface Shape {
  /** Знаковое расстояние в пикселях иконки (внутри < 0) в точке (x, y) координат иконки. */
  sd(x: number, y: number): number;
  /** Рамка силуэта в координатах иконки. */
  box: [number, number, number, number];
}
export interface ShapeOpt {
  /** Куда вписать силуэт в координатах иконки: центр и размер большей стороны. */
  cx: number; cy: number; size: number;
  flipX?: boolean; flipY?: boolean;
  /** Поворот вокруг центра, градусы. */
  rot?: number;
  /** Растяжение по осям после вписывания (1 = как в исходнике). */
  sx?: number; sy?: number;
}

const SS = 4; // подвыборка маски относительно пикселя иконки
const cache = new Map<string, Pt[][]>();
function subpathsOf(id: string): Pt[][] {
  let s = cache.get(id);
  if (s) return s;
  const file = path.join(GI_DIR, id + ".svg");
  if (!fs.existsSync(file)) throw new Error(`нет силуэта ${id}: npx tsx tools/gen/icons-svg.ts fetch`);
  s = svgSubpaths(fs.readFileSync(file, "utf8"));
  cache.set(id, s);
  return s;
}

/** Силуэт game-icons как поле расстояний, вписанный в иконку 20×20 (рабочая область, координаты 0…20). */
export function shapeOf(id: string, o: ShapeOpt, area = 20): Shape {
  const subs = subpathsOf(id);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const sub of subs) for (const [x, y] of sub) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const sw = x1 - x0, sh = y1 - y0, k = o.size / Math.max(sw, sh);
  const ca = Math.cos(((o.rot ?? 0) * Math.PI) / 180), sa = Math.sin(((o.rot ?? 0) * Math.PI) / 180);
  const tf = ([x, y]: Pt): Pt => {
    let px = (x - (x0 + x1) / 2) * k * (o.sx ?? 1) * (o.flipX ? -1 : 1), py = (y - (y0 + y1) / 2) * k * (o.sy ?? 1) * (o.flipY ? -1 : 1);
    [px, py] = [px * ca - py * sa, px * sa + py * ca];
    return [px + o.cx, py + o.cy];
  };
  const W = area * SS, H = area * SS;
  const tsubs = subs.map((s) => s.map((p) => { const t = tf(p); return [t[0] * SS, t[1] * SS] as Pt; }));
  const mask = fillNonZero(tsubs, W, H);
  const dOut = edt(mask, W, H, 1); // расстояние до ближайшего закрашенного (0 внутри)
  const dIn = edt(mask, W, H, 0); // расстояние до ближайшего пустого (0 снаружи)
  const sdHi = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) sdHi[i] = mask[i] ? -(dIn[i] - 0.5) : dOut[i] - 0.5;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const s of tsubs) for (const [x, y] of s) { bx0 = Math.min(bx0, x / SS); by0 = Math.min(by0, y / SS); bx1 = Math.max(bx1, x / SS); by1 = Math.max(by1, y / SS); }
  return {
    box: [bx0, by0, bx1, by1],
    sd(x, y) {
      // билинейно по сетке подвыборки; вне сетки — расстояние до её края плюс значение на краю
      const fx = x * SS - 0.5, fy = y * SS - 0.5;
      const cx = Math.max(0, Math.min(W - 1, fx)), cy = Math.max(0, Math.min(H - 1, fy));
      const ix = Math.min(W - 2, Math.floor(cx)), iy = Math.min(H - 2, Math.floor(cy));
      const tx = cx - ix, ty = cy - iy;
      const a = sdHi[iy * W + ix], b = sdHi[iy * W + ix + 1], c = sdHi[(iy + 1) * W + ix], d = sdHi[(iy + 1) * W + ix + 1];
      const v = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
      const out = Math.hypot(fx - cx, fy - cy);
      return (v + out) / SS;
    },
  };
}

// ---------- скачивание ----------
export async function fetchShapes(ids: string[]): Promise<void> {
  for (const id of ids) {
    const file = path.join(GI_DIR, id + ".svg");
    if (fs.existsSync(file)) continue;
    const res = await fetch(RAW + id + ".svg");
    if (!res.ok) { console.error("нет", id, res.status); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await res.text());
    console.log("скачано", id);
  }
}

if (process.argv[1] && /icons-svg\.ts$/.test(process.argv[1].replace(/\\/g, "/")) && process.argv[2] === "fetch") {
  import("./icons-motifs").then(({ SHAPE_IDS }) => fetchShapes(SHAPE_IDS));
}
