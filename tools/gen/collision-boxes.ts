/**
 * Коллизия объектов по основанию кадра (docs/art/perspective.md, «Коллизии объектов»): для каждого непроходимого вида (OBJECT_FOOTPRINT,
 * кроме лежащих на земле и правила cell) ищет основание — нижний ряд непрозрачных пикселей не-тени — и ширину нижней полосы кадра,
 * глубину берёт по эллипсу 3/4 (0,4·ширины). Пишет data/collision.json → boxes (rules не трогает). Пиксели кадров не меняются.
 * Источник кадра — как у клиента (client/src/game/terrain.ts makeImage): лист огня FIRE_SHEET, иначе objects/<id>.png, иначе лист vfx/<id>.png.
 * Запуск: npx tsx tools/gen/collision-boxes.ts [--table] (отдельно от npm run assets; после перерисовки объектов).
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { GROUND_OBJECTS, OBJECT_FOOTPRINT } from "../../shared/map";
import { TILE } from "../../shared/constants";

const ROOT = path.resolve(import.meta.dirname, "../..");
const ASSETS = path.join(ROOT, "client/public/assets");
const DATA = path.join(ROOT, "data/collision.json");
/** Как FIRE_SHEET в client/src/game/terrain.ts: эти виды клиент рисует листом огня. */
const FIRE_SHEET: Record<string, string> = { campfire: "fire-camp", brazier: "fire-brazier" };
const isShadow = (r: number, g: number, b: number, a: number) => a <= 130 && r < 50 && g < 50 && b < 60;

type Rules = { facade: string[]; facadeK: number; band: number; minPx: number; depthK: number; minDepth: number; maxDepth: number; cell: string[]; spanX: string[]; spanY: string[] };
export const matchKind = (list: string[], kind: string) => list.some((p) => (p.endsWith("*") ? kind.startsWith(p.slice(0, -1)) : kind === p));

interface Frame { d: Buffer; W: number; H: number; fw: number; fh: number; ax: number; ay: number; src: string }
const vfx = JSON.parse(fs.readFileSync(path.join(ASSETS, "vfx/manifest.json"), "utf8")) as Record<string, { frameW: number; frameH: number; anchor: [number, number]; r?: number }>;
function sheet(id: string): Frame | null {
  const e = vfx[id], f = path.join(ASSETS, "vfx", e?.r ? "r" : "", id + ".png"); // r: 1 — лист лежит в vfx/r/
  if (!e || !fs.existsSync(f)) return null;
  const p = PNG.sync.read(fs.readFileSync(f));
  return { d: p.data, W: p.width, H: p.height, fw: e.frameW, fh: e.frameH, ax: e.anchor[0], ay: e.anchor[1], src: `vfx/${id}` };
}
function frameOf(id: string, kind: string): Frame | null {
  if (FIRE_SHEET[kind] && id === kind) { const s = sheet(FIRE_SHEET[kind]); if (s) return s; }
  const f = path.join(ASSETS, "objects", id + ".png");
  if (fs.existsSync(f)) { const p = PNG.sync.read(fs.readFileSync(f)); return { d: p.data, W: p.width, H: p.height, fw: p.width, fh: p.height, ax: 0.5, ay: 1, src: `objects/${id}` }; }
  return id === kind ? sheet(kind) : null;
}

export interface Measure { base: number; x0: number; x1: number; fw: number; fh: number; ax: number; ay: number; src: string }
/** Основание кадра (первый кадр листа): нижний ряд непрозрачного не-тени и столбцы нижней полосы. */
function measure(fr: Frame, R: Rules, kind: string): Measure | null {
  const a = (x: number, y: number) => { const i = (y * fr.W + x) * 4; return [fr.d[i], fr.d[i + 1], fr.d[i + 2], fr.d[i + 3]]; };
  const solid = (x: number, y: number) => { const [r, g, b, al] = a(x, y); return al >= 160 && !isShadow(r, g, b, al); };
  let base = -1;
  for (let y = fr.fh - 1; y >= 0 && base < 0; y--) for (let x = 0; x < fr.fw; x++) if (solid(x, y)) { base = y; break; }
  if (base < 0) return null;
  // здания: крыльцо и ступени выступают перед фасадом — на них можно встать; основание = нижний ряд шириной ≥ facadeK самого широкого
  if (matchKind(R.facade, kind)) {
    const wOf = (y: number) => { let a = -1, b = -1; for (let x = 0; x < fr.fw; x++) if (solid(x, y)) { if (a < 0) a = x; b = x; } return a < 0 ? 0 : b - a + 1; };
    let max = 0;
    for (let y = base; y > base - 24 && y >= 0; y--) max = Math.max(max, wOf(y));
    while (base > 0 && wOf(base) < max * R.facadeK) base--;
  }
  let x0 = fr.fw, x1 = -1;
  for (let x = 0; x < fr.fw; x++) {
    let n = 0;
    for (let y = Math.max(0, base - R.band + 1); y <= base; y++) if (solid(x, y)) n++;
    if (n >= R.minPx) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  }
  if (x1 < x0) return null;
  return { base, x0, x1, fw: fr.fw, fh: fr.fh, ax: fr.ax, ay: fr.ay, src: fr.src };
}

/** Прямоугольник [x0, x1, y0, y1] от (o.x, o.y). */
export function boxOf(kind: string, m: Measure, R: Rules): [number, number, number, number] {
  const fp = OBJECT_FOOTPRINT[kind]!;
  const ox = Math.round(m.ax * m.fw), oy = Math.round(m.ay * m.fh); // как Phaser: origin в целых px кадра
  let x0 = m.x0 - ox, x1 = m.x1 + 1 - ox;
  const y1 = Math.min(2, m.base + 1 - oy); // низ основания (o.y = низ клетки − 2: не ниже клетки)
  const wd = x1 - x0;
  let y0 = y1 - Math.max(R.minDepth, Math.min(R.maxDepth, Math.round(wd * R.depthK)));
  if (matchKind(R.spanX, kind)) { x0 = -fp.w * TILE / 2; x1 = fp.w * TILE / 2; }
  if (matchKind(R.spanY, kind)) y0 = 2 - fp.h * TILE;
  // не шире следа (поиск пути идёт по клеткам следа)
  x0 = Math.max(x0, -fp.w * TILE / 2); x1 = Math.min(x1, fp.w * TILE / 2); y0 = Math.max(y0, 2 - fp.h * TILE);
  return [x0, x1, y0, y1];
}

function main() {
  const cfg = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const R = cfg.rules as Rules;
  const files = fs.readdirSync(path.join(ASSETS, "objects")).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
  const boxes: Record<string, [number, number, number, number]> = {};
  const rows: string[] = [];
  for (const kind of Object.keys(OBJECT_FOOTPRINT).sort()) {
    if (GROUND_OBJECTS.has(kind) || matchKind(R.cell, kind)) continue;
    const ids = [kind, ...files.filter((f) => f.startsWith(kind + "__") && !f.endsWith("_trunk"))];
    for (const id of ids) {
      const fr = frameOf(id, kind);
      if (!fr) continue;
      const m = measure(fr, R, kind);
      if (!m) continue;
      const b = boxOf(kind, m, R);
      if (id !== kind && boxes[kind] && boxes[kind].every((v, i) => v === b[i])) continue; // вариант с тем же основанием
      boxes[id] = b;
      if (id === kind) {
        const fp = OBJECT_FOOTPRINT[kind]!;
        rows.push(`| ${kind} | ${fp.w * TILE}×${fp.h * TILE} | ${m.x1 - m.x0 + 1} (${m.src}) | ${b[1] - b[0]}×${b[3] - b[2]} |`);
      }
    }
  }
  cfg.boxes = boxes;
  const body = JSON.stringify(cfg, null, 2).replace(/\[\s+(-?\d+),\s+(-?\d+),\s+(-?\d+),\s+(-?\d+)\s+\]/g, "[$1, $2, $3, $4]");
  fs.writeFileSync(DATA, body + "\n");
  console.log(`collision: ${Object.keys(boxes).length} кадров`);
  if (process.argv.includes("--table")) console.log(rows.join("\n"));
}
main();
