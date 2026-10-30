/** Задача 147, масштаб: замер силуэтов листов юнитов, маунтов и объектов (непрозрачные пиксели, alpha > 40). */
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const A = path.join(ROOT, "client/public/assets");
const cache = new Map<string, PNG>();
export const png = (f: string) => { let p = cache.get(f); if (!p) { p = PNG.sync.read(fs.readFileSync(f)); cache.set(f, p); } return p; };

export interface Box { x0: number; y0: number; x1: number; y1: number; h: number; w: number }
export function bbox(p: PNG, fx: number, fy: number, fw: number, fh: number, thr = 40): Box | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = fy; y < Math.min(p.height, fy + fh); y++) for (let x = fx; x < Math.min(p.width, fx + fw); x++) {
    if (p.data[(y * p.width + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  return { x0: x0 - fx, y0: y0 - fy, x1: x1 - fx, y1: y1 - fy, h: y1 - y0 + 1, w: x1 - x0 + 1 };
}
/** Рост юнита: медиана по кадрам покоя (строка «вниз», столбцы 0..n−1). */
export function unitHeight(file: string, fw: number, fh: number, n = 8) {
  const p = png(file); const hs: number[] = [], ws: number[] = []; let edge = false;
  for (let i = 0; i < n && (i + 1) * fw <= p.width; i++) {
    const b = bbox(p, i * fw, 0, fw, fh); if (!b) continue;
    hs.push(b.h); ws.push(b.w); if (b.y0 === 0 || b.x0 === 0 || b.x1 === fw - 1) edge = true;
  }
  hs.sort((a, b) => a - b); ws.sort((a, b) => a - b);
  return { h: hs[hs.length >> 1] ?? 0, w: ws[ws.length >> 1] ?? 0, edge, sheetW: p.width, sheetH: p.height };
}
