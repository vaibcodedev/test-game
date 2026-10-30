/**
 * Атлас объектов карты (docs/plan/next.md, 3.1): PNG из client/public/assets/objects/*.png упаковываются в листы до 2048×2048
 * (maxrects-packer 2.7.4, без поворота) → client/public/assets/atlas/objsN.png + objsN.json (Phaser «JSON Hash», кадр = id объекта).
 * Отступ 2 px между кадрами и экструзия краёв на 1 px: при дробном зуме (1,75; 2,25) выборка у края кадра не захватывает соседа.
 * Кэш по хешу содержимого всех PNG (atlas/cache.json): без изменений повторный запуск только читает файлы и выходит.
 * Не входят в атлас (грузятся по одному как o_<id>): листы мешков добычи loot_* (lootView режет картинку на кадры сам) и слишком большие.
 * Запуск отдельно: npx tsx tools/gen/atlas.ts; обычно — из tools/gen-assets.ts после записи объектов.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import type { MaxRectsPacker as MRP } from "maxrects-packer";
// пакет 2.7.4 объявлен "type": "module", но main — UMD: именованный импорт работает только из .mjs
// @ts-ignore — у .mjs нет своего .d.ts, типы берутся из основного входа выше
import { MaxRectsPacker as MRPImpl } from "maxrects-packer/dist/maxrects-packer.mjs";
const MaxRectsPacker = MRPImpl as typeof MRP;

export const ATLAS_MAX = 2048, ATLAS_PAD = 2, ATLAS_EXTRUDE = 1;
/** Версия формата: смена сбрасывает кэш. */
const VER = "objs-v1";

export interface AtlasRef { key: string; png: string; json: string }
export interface AtlasResult { atlases: AtlasRef[]; atlasOf: Record<string, string> }

const skip = (id: string) => id.startsWith("loot_");

/** Упаковать объекты ids (имена файлов в assets/objects без .png). assets — client/public/assets. */
export function buildObjectAtlases(assets: string, ids: string[]): AtlasResult & { cached: boolean } {
  const src = path.join(assets, "objects"), dir = path.join(assets, "atlas"), cacheFile = path.join(dir, "cache.json");
  const list = [...new Set(ids)].filter((id) => !skip(id) && fs.existsSync(path.join(src, id + ".png"))).sort();
  const bufs = new Map<string, Buffer>();
  const h = crypto.createHash("sha1").update(VER);
  for (const id of list) { const b = fs.readFileSync(path.join(src, id + ".png")); bufs.set(id, b); h.update(id).update("\0").update(b); }
  const hash = h.digest("hex");
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as AtlasResult & { hash: string; files: string[] };
    if (c.hash === hash && c.files.every((f) => fs.existsSync(path.join(dir, f)))) return { atlases: c.atlases, atlasOf: c.atlasOf, cached: true };
  } catch { /* кэша нет — пакуем */ }

  const imgs = new Map<string, PNG>();
  for (const id of list) {
    const p = PNG.sync.read(bufs.get(id)!);
    if (p.width + 2 * ATLAS_EXTRUDE + ATLAS_PAD > ATLAS_MAX || p.height + 2 * ATLAS_EXTRUDE + ATLAS_PAD > ATLAS_MAX) continue; // не влезет — по одному
    imgs.set(id, p);
  }
  // порядок постоянный (высота, площадь, id): одинаковый вход даёт одинаковые листы
  const order = [...imgs.keys()].sort((a, b) => {
    const A = imgs.get(a)!, B = imgs.get(b)!;
    return B.height - A.height || B.width * B.height - A.width * A.height || (a < b ? -1 : 1);
  });
  const packer = new MaxRectsPacker(ATLAS_MAX, ATLAS_MAX, ATLAS_PAD, { smart: true, pot: false, square: false, allowRotation: false });
  for (const id of order) { const p = imgs.get(id)!; packer.add(p.width + 2 * ATLAS_EXTRUDE, p.height + 2 * ATLAS_EXTRUDE, { id }); }

  fs.mkdirSync(dir, { recursive: true });
  const atlases: AtlasRef[] = [], atlasOf: Record<string, string> = {}, files: string[] = [];
  const v = hash.slice(0, 10);
  packer.bins.forEach((bin, n) => {
    const key = `objs${n}`, W = bin.width, H = bin.height, out = new PNG({ width: W, height: H });
    out.data.fill(0);
    const frames: Record<string, unknown> = {};
    for (const r of bin.rects) {
      const id = (r.data as { id: string }).id, p = imgs.get(id)!, w = p.width, hh = p.height;
      const x0 = r.x + ATLAS_EXTRUDE, y0 = r.y + ATLAS_EXTRUDE;
      PNG.bitblt(p, out, 0, 0, w, hh, x0, y0);
      // экструзия: крайние строки и столбцы (с углами) повторяются наружу на ATLAS_EXTRUDE px
      const px = (sx: number, sy: number, dx: number, dy: number) => { const s = (sy * w + sx) * 4, d = (dy * W + dx) * 4; out.data[d] = p.data[s]; out.data[d + 1] = p.data[s + 1]; out.data[d + 2] = p.data[s + 2]; out.data[d + 3] = p.data[s + 3]; };
      for (let e = 1; e <= ATLAS_EXTRUDE; e++) {
        for (let x = -e; x < w + e; x++) { const sx = Math.min(w - 1, Math.max(0, x)); px(sx, 0, x0 + x, y0 - e); px(sx, hh - 1, x0 + x, y0 + hh - 1 + e); }
        for (let y = 0; y < hh; y++) { px(0, y, x0 - e, y0 + y); px(w - 1, y, x0 + w - 1 + e, y0 + y); }
      }
      frames[id] = { frame: { x: x0, y: y0, w, h: hh }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h: hh }, sourceSize: { w, h: hh } };
      atlasOf[id] = key;
    }
    fs.writeFileSync(path.join(dir, key + ".png"), PNG.sync.write(out, { deflateLevel: 6 }));
    fs.writeFileSync(path.join(dir, key + ".json"), JSON.stringify({ frames, meta: { app: "tools/gen/atlas.ts", version: VER, image: key + ".png", format: "RGBA8888", size: { w: W, h: H }, scale: "1" } }));
    atlases.push({ key, png: `/assets/atlas/${key}.png?v=${v}`, json: `/assets/atlas/${key}.json?v=${v}` });
    files.push(key + ".png", key + ".json");
  });
  // листы прошлой упаковки, которых больше нет
  for (const f of fs.readdirSync(dir)) if (/^objs\d+\.(png|json)$/.test(f) && !files.includes(f)) fs.rmSync(path.join(dir, f));
  fs.writeFileSync(cacheFile, JSON.stringify({ hash, files, atlases, atlasOf }));
  return { atlases, atlasOf, cached: false };
}

/** Записать атласы в manifest.json (правкой полей atlases и atlasOf, остальное не трогается). */
export function writeAtlasManifest(assets: string, r: AtlasResult) {
  const mf = path.join(assets, "manifest.json"), m = JSON.parse(fs.readFileSync(mf, "utf8"));
  m.atlases = r.atlases; m.atlasOf = r.atlasOf;
  fs.writeFileSync(mf, JSON.stringify(m, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now(), assets = path.resolve("client/public/assets");
  const ids = fs.readdirSync(path.join(assets, "objects")).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4));
  const r = buildObjectAtlases(assets, ids);
  writeAtlasManifest(assets, r);
  console.log(`[atlas] ${r.atlases.length} листов, ${Object.keys(r.atlasOf).length} кадров${r.cached ? " (кэш)" : ""} за ${Date.now() - t0} мс`);
}
