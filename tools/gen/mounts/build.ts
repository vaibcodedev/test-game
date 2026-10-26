/**
 * Задача 142: маунты в игру. Запуск: npx tsx tools/gen/mounts/build.ts [модель …] (без аргументов — все модели каталога).
 * Пишет client/public/assets/mounts/<модель>.png (+ <модель>_umbrath.png у гербовых), icons/mount_<id>.png (по id маунта из data
 * и по id модели) и поправляет в client/public/assets/manifest.json только раздел mounts и иконки mount_* (остальное не трогает).
 * Лист: 8 строк (0–3 зверь: вниз, вверх, вправо, влево; 4–7 — слой поверх всадника) × 36 столбцов (0–11 бег, 12–35 покой).
 * Также вызывается из tools/gen-assets.ts (writeMountsGame).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSheet, crop, OUT_COL, type SheetOut } from "./lib";
import { ART, MODELS, type Model } from "./catalog";
import { PC } from "../mobs/lib";
import { downscaleMode } from "../vendor-lib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ASSETS = path.join(ROOT, "client", "public", "assets");
export const MOUNT_ICON = 48;

/** Иконка 48×48: вид вправо в покое (зверь и передний слой), обрезка по содержимому, уменьшение по преобладающему цвету, контур. */
export function mountIcon(s: SheetOut): PC {
  const N = s.meta.frame, col = s.meta.run, row = 2;
  const f = crop(s.sheet, col * N, row * N, N, N);
  f.blit(crop(s.sheet, col * N, (row + 4) * N, N, N), 0, 0);
  const isOut = (c: number[]) => c[0] === OUT_COL[0] && c[1] === OUT_COL[1] && c[2] === OUT_COL[2];
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const c = f.get(x, y)!;
    if (c[3] && !isOut(c)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  let body = new PC(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) { const c = f.get(x0 + x, y0 + y)!; if (c[3] && !isOut(c)) body.set(x, y, c); }
  const k = Math.min(1, (MOUNT_ICON - 2) / Math.max(body.w, body.h));
  if (k < 1) body = downscaleMode(body, Math.max(1, Math.round(body.w * k)), Math.max(1, Math.round(body.h * k)));
  const out = new PC(MOUNT_ICON, MOUNT_ICON);
  out.blit(body, Math.floor((MOUNT_ICON - body.w) / 2), Math.floor((MOUNT_ICON - body.h) / 2));
  return out.outline(OUT_COL, true);
}

export interface GameMeta { frame: number; gy: number; fly: number; cols: number; run: number; idle: number; views: number; seat: [number, number][][]; sheet: string; fac?: boolean }

/** Листы одной модели (обе фракции у гербовых) в assets/mounts. */
function writeModel(m: Model): { meta: GameMeta; icon: PC } {
  const s = buildSheet(m.spec("solgard"), m.ru);
  s.sheet.save(path.join(ASSETS, "mounts", `${m.id}.png`));
  if (m.heraldic) buildSheet(m.spec("umbrath"), m.ru).sheet.save(path.join(ASSETS, "mounts", `${m.id}_umbrath.png`));
  if (s.problems.length) console.warn(`${m.ru}: ${s.problems.length} замечаний по кадрам\n  ${s.problems.slice(0, 8).join("\n  ")}`);
  return { meta: { ...s.meta, views: 4, sheet: m.id, ...(m.heraldic ? { fac: true } : {}) }, icon: mountIcon(s) };
}

/** Все модели (или выбранные) → assets и manifest.mounts. Старые записи manifest.mounts без модели в каталоге удаляются. */
export function writeMountsGame(only: string[] = []) {
  fs.mkdirSync(path.join(ASSETS, "mounts"), { recursive: true });
  const mf = path.join(ASSETS, "manifest.json");
  const man = JSON.parse(fs.readFileSync(mf, "utf8"));
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "mounts.json"), "utf8")).mounts as Record<string, unknown>;
  const prev: Record<string, GameMeta> = man.mounts ?? {};
  const built: Record<string, GameMeta> = {};
  for (const m of MODELS) {
    if (only.length && !only.includes(m.id)) continue;
    const t0 = Date.now();
    const { meta, icon } = writeModel(m);
    built[m.id] = meta;
    icon.save(path.join(ASSETS, "icons", `mount_${m.id}.png`));
    for (const [id, mid] of Object.entries(ART)) if (mid === m.id && id !== m.id) icon.save(path.join(ASSETS, "icons", `mount_${id}.png`));
    console.log(`  ${m.ru}: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  }
  const mounts: Record<string, GameMeta> = {};
  const metaOf = (mid: string) => built[mid] ?? (prev[mid]?.sheet === mid ? prev[mid] : undefined);
  // маунты из data: по сопоставлению; модели каталога — под своим id; прочие старые — пока их модель не готова
  for (const id of Object.keys(data)) {
    const mid = ART[id];
    const meta = mid ? metaOf(mid) : undefined;
    if (meta) mounts[id] = meta;
    else if (prev[id]) mounts[id] = prev[id];
  }
  for (const m of MODELS) { const meta = metaOf(m.id); if (meta && !mounts[m.id]) mounts[m.id] = meta; }
  man.mounts = mounts;
  const icons = new Set<string>(man.icons ?? []);
  for (const id of Object.keys(mounts)) icons.add(`mount_${id}`);
  man.icons = [...icons];
  fs.writeFileSync(mf, JSON.stringify(man, null, 1));
  return mounts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const m = writeMountsGame(process.argv.slice(2));
  console.log(`маунтов в manifest: ${Object.keys(m).length} · ${((Date.now() - t0) / 1000).toFixed(0)} с`);
}
