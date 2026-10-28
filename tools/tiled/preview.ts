/**
 * Превью экспорта без Tiled: читает tools/out/tiled (через import.ts, наборы — из .tsx) и рисует tools/out/tiled/preview.png:
 *  сверху — весь мир, 2 px на тайл (поверхность по углам, тень непроходимого, границы зон, сетка регионов, мобы — красные,
 *  боссы — круги арен, телепорты — голубые, NPC — жёлтые, патрули — оранжевые линии);
 *  снизу — два участка 1:1 плитками земли и картинками объектов (как в Tiled): Аурелион и главный мост запада.
 * Запуск: npx tsx tools/tiled/preview.ts [папка]
 */
import fs from "node:fs";
import path from "node:path";
import { CELL_BLOCK, GROUND_OBJECTS } from "../../shared/map";
import { CITIES } from "../../shared/cities";
import { Img, OUT_DIR, REG_COLS, REG_ROWS, TS, readTsx, regionRect } from "./common";
import { importWorld } from "./import";

const dir = process.argv[2] ?? OUT_DIR;
const t0 = Date.now();
const { map: m, placements: pl } = importWorld(dir);
const ground = Img.read(path.join(dir, "ground.png"));
const gts = readTsx(path.join(dir, "ground.tsx"));
const GC = ground.w / TS;
// углы → первая плитка; средний цвет сплошной плитки каждой поверхности
const byKey = new Map<string, number>();
for (const [id, wid] of gts.wang) { const k = [wid[7], wid[1], wid[3], wid[5]].map((q) => q - 1).join(","); if (!byKey.has(k)) byKey.set(k, id); }
const avg: number[][] = [];
for (let t = 0; t < 19; t++) {
  const id = byKey.get([t, t, t, t].join(",")) ?? 0;
  let r = 0, g = 0, b = 0;
  for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) { const p = ground.get((id % GC) * TS + i, Math.floor(id / GC) * TS + j); r += p[0]; g += p[1]; b += p[2]; }
  avg.push([r, g, b].map((q) => Math.round(q / (TS * TS))));
}

function line(img: Img, x0: number, y0: number, x1: number, y1: number, c: number[], a = 255) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (;;) {
    img.put(x0, y0, c[0], c[1], c[2], a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}
const circle = (img: Img, cx: number, cy: number, r: number, c: number[]) => {
  for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2, b = ((k + 1) / 64) * Math.PI * 2; line(img, cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r, c); }
};

// --- весь мир, 2 px на тайл ---
const S = 2, OW = m.w * S, OH = m.h * S;
const crops = [
  { name: "Аурелион", x: CITIES.find((c) => c.id === "aurelion")!.x - 17, y: 167, w: 34, h: 26 },
  { name: "главный мост запада", x: 193, y: 167, w: 34, h: 26 },
];
const CW = crops[0].w * TS, CH = crops[0].h * TS, GAP = 8;
const out = new Img(Math.max(OW, crops.length * CW + (crops.length - 1) * GAP), OH + GAP + CH);
out.rect(0, 0, out.w, out.h, [20, 20, 26]);
for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
  const c = avg[m.vtx[(y + j) * (m.w + 1) + x + i]];
  const dark = m.cell[y * m.w + x] & CELL_BLOCK ? 0.7 : 1;
  out.put(x * S + i, y * S + j, c[0] * dark, c[1] * dark, c[2] * dark);
}
for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
  const z = m.zone[y * m.w + x];
  if (x + 1 < m.w && m.zone[y * m.w + x + 1] !== z) for (let j = 0; j < S; j++) out.put(x * S + S - 1, y * S + j, 255, 240, 200, 150);
  if (y + 1 < m.h && m.zone[(y + 1) * m.w + x] !== z) for (let i = 0; i < S; i++) out.put(x * S + i, y * S + S - 1, 255, 240, 200, 150);
}
for (const o of m.objects) out.put(Math.floor((o.x / TS) * S), Math.floor((o.y / TS) * S) - 1, 20, 40, 20, 90);
for (let ry = 0; ry < REG_ROWS; ry++) for (let rx = 0; rx < REG_COLS; rx++) {
  const r = regionRect(m.w, m.h, rx, ry);
  for (let i = 0; i < r.w * S; i += 6) { out.rect(r.x0 * S + i, r.y0 * S, 3, 1, [80, 220, 255], 200); }
  for (let j = 0; j < r.h * S; j += 6) { out.rect(r.x0 * S, r.y0 * S + j, 1, 3, [80, 220, 255], 200); }
}
for (const p of pl.patrols) for (let i = 0; i + 1 < p.points.length; i++) line(out, (p.points[i].x / TS) * S, (p.points[i].y / TS) * S, (p.points[i + 1].x / TS) * S, (p.points[i + 1].y / TS) * S, [255, 150, 30], 220);
for (const s of m.spawns) out.rect(Math.floor((s.x / TS) * S) - 1, Math.floor((s.y / TS) * S) - 1, 2, 2, [230, 40, 40]);
for (const n of pl.npcs) out.rect(Math.floor((n.x / TS) * S), Math.floor((n.y / TS) * S), 1, 1, [255, 220, 60]);
for (const t of pl.teleports) out.rect(Math.floor((t.x / TS) * S) - 2, Math.floor((t.y / TS) * S) - 2, 4, 4, [80, 200, 255]);
for (const b of m.bosses) circle(out, (b.x / TS) * S, (b.y / TS) * S, Math.max(3, (b.arena / TS) * S), [255, 60, 255]);
crops.forEach((c, k) => { const x = c.x * S, y = c.y * S; line(out, x, y, x + c.w * S, y, [255, 255, 255]); line(out, x, y + c.h * S, x + c.w * S, y + c.h * S, [255, 255, 255]); line(out, x, y, x, y + c.h * S, [255, 255, 255]); line(out, x + c.w * S, y, x + c.w * S, y + c.h * S, [255, 255, 255]); void k; });

// --- участки 1:1 ---
const ots = readTsx(path.join(dir, "objects.tsx"));
const otile = new Map<string, { file: string }>();
for (const t of ots.tiles.values()) if (t.image) otile.set(t.props.v ? `${t.props.kind}__${t.props.v}` : t.props.kind, { file: path.resolve(dir, t.image) });
const imgCache = new Map<string, Img | null>();
const pic = (key: string) => {
  if (!imgCache.has(key)) { const t = otile.get(key); imgCache.set(key, t && fs.existsSync(t.file) ? Img.read(t.file) : null); }
  return imgCache.get(key)!;
};
crops.forEach((c, k) => {
  const ox = k * (CW + GAP), oy = OH + GAP;
  const sub = new Img(CW, CH);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const wx = c.x + x, wy = c.y + y, V = (vx: number, vy: number) => m.vtx[vy * (m.w + 1) + vx];
    const id = byKey.get([V(wx, wy), V(wx + 1, wy), V(wx + 1, wy + 1), V(wx, wy + 1)].join(",")) ?? 0;
    sub.blit(ground, (id % GC) * TS, Math.floor(id / GC) * TS, TS, TS, x * TS, y * TS);
  }
  const X0 = c.x * TS, Y0 = c.y * TS;
  const objs = m.objects.filter((o) => o.x > X0 - 200 && o.x < X0 + CW + 200 && o.y > Y0 && o.y < Y0 + CH + 260)
    .sort((a, b) => (GROUND_OBJECTS.has(b.kind) ? 1 : 0) - (GROUND_OBJECTS.has(a.kind) ? 1 : 0) || a.y + (a.dz ?? 0) - b.y - (b.dz ?? 0));
  for (const o of objs) {
    const im = pic(o.v ? `${o.kind}__${o.v}` : o.kind) ?? pic(o.kind);
    if (!im) continue;
    sub.blit(im, 0, 0, im.w, im.h, Math.round(o.x - X0 - im.w / 2), Math.round(o.y - Y0 - im.h), !!o.flip);
  }
  for (const p of pl.patrols) for (let i = 0; i + 1 < p.points.length; i++) line(sub, p.points[i].x - X0, p.points[i].y - Y0, p.points[i + 1].x - X0, p.points[i + 1].y - Y0, [255, 150, 30], 200);
  for (const s of m.spawns) sub.rect(s.x - X0 - 4, s.y - Y0 - 4, 8, 8, [230, 40, 40], 220);
  for (const n of pl.npcs) sub.rect(n.x - X0 - 3, n.y - Y0 - 3, 6, 6, [255, 220, 60], 230);
  for (const t of pl.teleports) sub.rect(t.x - X0 - 5, t.y - Y0 - 5, 10, 10, [80, 200, 255], 200);
  // границы зон
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const z = m.zone[(c.y + y) * m.w + c.x + x];
    if (x + 1 < c.w && m.zone[(c.y + y) * m.w + c.x + x + 1] !== z) sub.rect(x * TS + TS - 1, y * TS, 2, TS, [255, 240, 200], 160);
    if (y + 1 < c.h && m.zone[(c.y + y + 1) * m.w + c.x + x] !== z) sub.rect(x * TS, y * TS + TS - 1, TS, 2, [255, 240, 200], 160);
  }
  out.blit(sub, 0, 0, CW, CH, ox, oy);
});
const file = path.join(dir, "preview.png");
out.write(file);
console.log(`превью: ${file} ${out.w}×${out.h}, ${Date.now() - t0} мс`);
