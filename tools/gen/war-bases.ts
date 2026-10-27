/** Основания «Знамён Предела» в игру (задача 132, шаг 14): из моделей задачи 130 (tools/gen/standards.ts) — мачта с цепью (сзади),
 *  тумба с воротом (спереди) и два королевских знамени захвата (ветер 12 кадров). Клиент (client/src/game/bannerBases.ts) ставит мачту
 *  и тумбу на основание, а знамя — на ось мачты: высота от mast[2] (вывешено, низ полотнища у земли) до mast[1] (поднято).
 *  Листы — client/public/assets/vfx/war-*.png, записи — в vfx/manifest.json (остальные записи не трогаются).
 *  Запуск отдельно: npx tsx tools/gen/war-bases.ts; в общей сборке — writeWarBasesGame (tools/gen-assets.ts). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureBase, royalSolgard, royalUmbrath, strip, MAST_TOP, type Anim } from "./standards";

/** Нижняя точка мачты (вывешено): как MAST_LOW в standards.ts — низ полотнища у земли за тумбой. */
const MAST_LOW_Y = 78;

export function writeWarBasesGame(assetsRoot: string): string[] {
  const dir = path.join(assetsRoot, "vfx"), mf = path.join(dir, "manifest.json");
  let m: Record<string, unknown> = {};
  try { m = JSON.parse(fs.readFileSync(mf, "utf8")); } catch { /* манифеста ещё нет */ }
  const base = captureBase();
  const gy = +(base.anchor[1]).toFixed(4);
  const put = (id: string, a: Anim, frames = a.frames, extra: Record<string, unknown> = {}) => {
    strip(frames).save(path.join(dir, `${id}.png`));
    m[id] = { frameW: a.w, frameH: a.h, frames: frames.length, fps: a.fps || 1, anchor: [+a.anchor[0].toFixed(4), +a.anchor[1].toFixed(4)], blend: "normal", ...extra };
  };
  // слои основания: [1] — тумба с воротом, [2] — мачта; якорь — линия земли; mast — [ось x, верх, низ] в пикселях листа
  put("war-plinth", { ...base, anchor: [0.5, gy] }, [base.frames[1]]);
  put("war-mast", { ...base, anchor: [0.5, gy] }, [base.frames[2]], { mast: [MAST_TOP[0], MAST_TOP[1], MAST_LOW_Y] });
  put("war-royal-sol", royalSolgard());
  put("war-royal-umb", royalUmbrath());
  const sorted = Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(mf, JSON.stringify(sorted, null, 1) + "\n");
  return ["war-plinth", "war-mast", "war-royal-sol", "war-royal-umb"];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/public/assets");
  console.log("основания:", writeWarBasesGame(root).join(", "));
}
