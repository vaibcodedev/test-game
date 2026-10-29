/** Мини-декодер GIF (только чтение кадров для эталонов в монтажах): LZW, локальные/общая палитры, прозрачность, disposal 0–2. */
import fs from "node:fs";
import { PC } from "./canvas";

export function readGif(file: string): PC[] {
  const b = fs.readFileSync(file);
  let p = 6;
  const W = b.readUInt16LE(p), H = b.readUInt16LE(p + 2), flags = b[p + 4];
  p += 7;
  let gct: number[][] = [];
  const pal = (n: number) => { const t: number[][] = []; for (let i = 0; i < n; i++) t.push([b[p + i * 3], b[p + i * 3 + 1], b[p + i * 3 + 2]]); p += n * 3; return t; };
  if (flags & 0x80) gct = pal(1 << ((flags & 7) + 1));
  const frames: PC[] = [];
  let canvas = new PC(W, H), trans = -1, disposal = 0;
  while (p < b.length) {
    const id = b[p++];
    if (id === 0x3b) break;
    if (id === 0x21) {
      const label = b[p++];
      if (label === 0xf9) { const f = b[p + 1]; disposal = (f >> 2) & 7; trans = f & 1 ? b[p + 4] : -1; }
      while (b[p]) p += b[p] + 1;
      p++;
      continue;
    }
    if (id !== 0x2c) break;
    const x0 = b.readUInt16LE(p), y0 = b.readUInt16LE(p + 2), w = b.readUInt16LE(p + 4), h = b.readUInt16LE(p + 6), lf = b[p + 8];
    p += 9;
    const ct = lf & 0x80 ? pal(1 << ((lf & 7) + 1)) : gct;
    const interlaced = !!(lf & 0x40);
    const minCode = b[p++];
    const chunks: number[] = [];
    while (b[p]) { for (let i = 1; i <= b[p]; i++) chunks.push(b[p + i]); p += b[p] + 1; }
    p++;
    // LZW
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, dict: number[][] = [], prev: number[] | null = null;
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict.push([i]); dict.push([], []); size = minCode + 1; prev = null; };
    reset();
    const out: number[] = [];
    let bit = 0;
    const read = () => { let v = 0; for (let i = 0; i < size; i++) { const byte = chunks[(bit >> 3)] ?? 0; v |= ((byte >> (bit & 7)) & 1) << i; bit++; } return v; };
    while (bit < chunks.length * 8) {
      const c = read();
      if (c === clear) { reset(); continue; }
      if (c === eoi) break;
      let e: number[];
      if (c < dict.length) { e = dict[c]; if (prev) dict.push([...prev, e[0]]); }
      else { e = [...prev!, prev![0]]; dict.push(e); }
      out.push(...e);
      prev = e;
      if (dict.length === 1 << size && size < 12) size++;
    }
    const before = canvas.clone();
    const rows: number[] = [];
    if (interlaced) { for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < h; y += st) rows.push(y); } else for (let y = 0; y < h; y++) rows.push(y);
    rows.forEach((y, ri) => { for (let x = 0; x < w; x++) { const k = out[ri * w + x]; if (k === undefined || k === trans) continue; const c = ct[k]; if (c) canvas.set(x0 + x, y0 + y, [c[0], c[1], c[2], 255]); } });
    frames.push(canvas.clone());
    if (disposal === 2) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) canvas.clear(x0 + x, y0 + y); }
    else if (disposal === 3) canvas = before;
  }
  return frames;
}
