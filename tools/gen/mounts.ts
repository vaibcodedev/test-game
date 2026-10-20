/**
 * Маунты (задача 118): листы кадров из 3D-каркаса (mounts-rig.ts) — мир, не пиксельная фигура сбоку.
 *
 * Лист units/mount_<id>.png: кадр F×F (F = 96 или 128), 12 столбцов × 6 строк.
 *   Строки 0–2: основной слой (вид вниз, вверх, вбок вправо; влево — отражение на клиенте), 3–5: передний слой
 *   (рисуется ПОВЕРХ всадника: голова и шея при взгляде вниз, подпруга сбоку, хвост при взгляде вверх).
 *   Столбцы 0–7: бег (у летающих — полёт, взмахи), 8–11: покой (у летающих — парение).
 * Земля — на строке gy, ось X — по центру кадра. В manifest.mounts лежат кадр, gy, высота парения и посадка всадника
 * (точка таза всадника в пикселях относительно (центр, gy)) для каждого вида и кадра: ног и корпус качаются в такт.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC } from "./canvas";
import { renderLayer, proj, type V3 } from "./mounts-rig";
import type { Built } from "./mounts-quad";
import { MODELS } from "./mounts-all";
import type { MountMeta } from "../../shared/mounts";

export const MOUNT_COLS = 12;
export const MOUNT_RUN = 8;
export const MOUNT_IDLE = 4;

export type { MountMeta };
export interface MountModel {
  F: number;
  gy: number;
  fly?: number;
  build: (ph: number, run: boolean) => Built;
}

function frames(m: MountModel, id: string) {
  const back: PC[][] = [[], [], []], front: PC[][] = [[], [], []];
  const seat: [number, number][][] = [[], [], []];
  for (let col = 0; col < MOUNT_COLS; col++) {
    const run = col < MOUNT_RUN;
    const ph = run ? col / MOUNT_RUN : (col - MOUNT_RUN) / MOUNT_IDLE;
    const b = m.build(ph, run);
    for (let v = 0; v < 3; v++) {
      back[v].push(renderLayer(b.rig.prims, v, m.F, m.gy, false).outline(undefined, true));
      front[v].push(renderLayer(b.rig.prims, v, m.F, m.gy, true).outline(undefined, true));
      const p = proj(v, b.seat as V3);
      seat[v].push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    }
  }
  void id;
  return { back, front, seat };
}

/** Весь лист модели + метаданные. */
export function buildMountSheet(id: string): { sheet: PC; meta: MountMeta } {
  const m = MODELS[id];
  const { back, front, seat } = frames(m, id);
  const F = m.F;
  const sheet = new PC(MOUNT_COLS * F, 6 * F);
  [...back, ...front].forEach((row, j) => row.forEach((f, i) => sheet.blit(f, i * F, j * F)));
  return { sheet, meta: { frame: F, gy: m.gy, fly: m.fly ?? 0, cols: MOUNT_COLS, seat } };
}

/** Иконка: боковой кадр покоя, обрезанный по содержимому до квадрата. */
export function buildMountIcon(sheet: PC, F: number, fullSide = true): PC {
  const col = 8, row = 2;
  const crop = new PC(F, F);
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    const c = sheet.get(col * F + x, row * F + y)!;
    if (c[3]) crop.set(x, y, c);
  }
  let x0 = F, y0 = F, x1 = 0, y1 = 0;
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) if (crop.alpha(x, y) > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, s = Math.max(w, h) + 2;
  const out = new PC(s, s);
  out.blit(crop, Math.floor((s - w) / 2) - x0, Math.floor((s - h) / 2) - y0);
  void fullSide;
  return out;
}

export function saveMountPng(pc: PC, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const png = new PNG({ width: pc.w, height: pc.h });
  Buffer.from(pc.data.buffer).copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png));
}
