/** Планка качества сгенерированных эффектов (задача 127): монтаж «наш | эталон из пака» по собранным листам игры и замер по планке —
 *  кадров, к/с, тонов (различных цветов на кадр), доля однопиксельных линий (пиксель без соседа с обеих сторон по x или по y), контур
 *  (доля пикселей края фигуры темнее середины). Только чтение client/public/assets/vfx; пишет tools/out/vfx-smooth/quality-*.png.
 *  Запуск: npx tsx tools/gen/vfx-compare.ts [id ...] */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, readPng, sliceSheet, storyboard, stackV, luma, pickIdx, fill, drawText, BG, GOLD } from "./vfx-lib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "client/public/assets/vfx");
const OUT = path.join(ROOT, "tools/out/vfx-smooth");
interface E { frameW: number; frameH: number; frames: number; fps: number; anchor: [number, number]; r?: 1 }
const man = JSON.parse(fs.readFileSync(path.join(DIR, "manifest.json"), "utf8")) as Record<string, E>;

/** Наш сгенерированный лист → эталон из бесплатного пака той же роли. */
export const PAIRS: [string, string][] = [
  ["bubble-holy", "holy-shield"], ["ring-holy", "holy-nova"], ["aura-rage", "tornado-blood"], ["flame-loop", "fire-ball-hit"],
  ["trap-snap", "expl-dust"], ["raven-fly", "dark-bolt"], ["axe-spin", "knife-spin"], ["arrow-volley", "rocks-hit"],
  ["shackle-steel", "ice-bolt-hit"], ["blood-pool", "fog-poison"], ["summon-circle-shadow", "portal-hold-shadow"], ["chain-steel", "bolt-proj"],
  ["blood-splash", "hit-blood"], ["quake-slam", "expl-large"], ["aura-runes-holy", "aura-runes-frost"],
];

const frames = (id: string) => { const e = man[id]; return sliceSheet(readPng(path.join(DIR, e.r ? "r" : "", `${id}.png`)), e.frameW, e.frameH, e.frames); };

/** Замер по планке на одном листе (по кадрам с заметной фигурой). */
export function bar(id: string) {
  const e = man[id], fr = frames(id);
  let tones = 0, thin = 0, solid = 0, edge = 0, edgeDark = 0, n = 0;
  for (const f of fr) {
    const cols = new Set<number>();
    let px = 0;
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const c = f.get(x, y)!;
      if (c[3] < 128) continue;
      px++; cols.add((c[0] << 16) | (c[1] << 8) | c[2]);
      const a = (dx: number, dy: number) => (f.get(x + dx, y + dy)?.[3] ?? 0) >= 128;
      if ((!a(-1, 0) && !a(1, 0)) || (!a(0, -1) && !a(0, 1))) thin++;
      const border = !a(-1, 0) || !a(1, 0) || !a(0, -1) || !a(0, 1);
      if (border) {
        edge++;
        // контур: край темнее соседа внутри фигуры
        const inn = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => f.get(x + dx, y + dy)).find((q) => q && q[3] >= 128);
        if (inn && luma(c[0], c[1], c[2]) + 8 < luma(inn[0], inn[1], inn[2])) edgeDark++;
      }
    }
    solid += px;
    if (px > 20) { tones += cols.size; n++; }
  }
  return { id, frames: e.frames, fps: e.fps, ms: Math.round((e.frames * 1000) / e.fps), tones: n ? Math.round(tones / n) : 0, thin: solid ? Math.round((100 * thin) / solid) : 0, outline: edge ? Math.round((100 * edgeDark) / edge) : 0 };
}
const label = (b: ReturnType<typeof bar>) => `${b.id} ${b.frames}f ${b.fps}fps ${b.ms}ms tones ${b.tones} thin ${b.thin}% outline ${b.outline}%`;

function row(id: string, k: number): PC {
  const e = man[id], fr = frames(id), show = fr.length > 12 ? pickIdx(fr.length, 12).map((i) => fr[i]) : fr;
  return storyboard(show, e.frameW, e.frameH, e.anchor, label(bar(id)), k);
}

export function montage(ours: string, ref: string): PC {
  const big = Math.max(man[ours].frameW, man[ours].frameH, man[ref].frameW, man[ref].frameH), k = big > 120 ? 1 : big > 60 ? 2 : 3;
  const a = row(ours, k), b = row(ref, k), head = new PC(Math.max(a.w, b.w), 10);
  fill(head, BG); drawText(head, "наш | эталон из пака", 2, 2, GOLD);
  return stackV([head, a, b]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const pairs = PAIRS.filter(([o]) => man[o] && (!only.length || only.includes(o)));
  for (const [o, r] of pairs) {
    if (!man[r]) { console.log(`нет эталона ${r}`); continue; }
    montage(o, r).save(path.join(OUT, `quality-${o}.png`));
    console.log(`${label(bar(o))}\n    эталон: ${label(bar(r))}`);
  }
}
