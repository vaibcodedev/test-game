/**
 * Основания кадров объектов для manifest.json (docs/art-perspective.md §4, «парение»): длинная тень клиента (client/src/game/shadows.ts)
 * разворачивается от точки опоры кадра, а у многих кадров под основанием пустые ряды (или только запечённая тень) — тень отрывается.
 *  foot[id] — сколько рядов кадра ниже основания (последний ряд с непрозрачным пикселем не-тени); клиент ставит опору на основание
 *    и сдвигает позицию вверх на столько же (картинка на карте не сдвигается), длинная тень и глубина — от основания;
 *  ao[id] — [x0, x1] основания у кадров без запечённой контактной тени: клиент подкладывает мягкую тёмную полосу (terrain.ts).
 * Пиксели кадров не меняются. Большие отступы (> FOOT_MAX: двери и арки данжа, нарисованные «на стене») не трогаем.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const FOOT_MAX = 12;
/** Пиксель запечённой тени: тёмный и полупрозрачный (tools/gen/shadow.ts, тени паков). */
const isShadow = (r: number, g: number, b: number, a: number) => a <= 130 && r < 50 && g < 50 && b < 60;

export interface Feet { foot: Record<string, number>; ao: Record<string, [number, number]> }

export function objectFeet(assets: string, ids: string[], skip: (id: string) => boolean): Feet {
  const out: Feet = { foot: {}, ao: {} };
  for (const id of ids) {
    const f = path.join(assets, "objects", id + ".png");
    if (skip(id) || !fs.existsSync(f)) continue;
    const p = PNG.sync.read(fs.readFileSync(f)), { width: w, height: h, data: d } = p;
    if (h < 20) continue;
    const px = (x: number, y: number) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    let base = -1;
    for (let y = h - 1; y >= 0 && base < 0; y--) for (let x = 0; x < w; x++) { const [r, g, b, a] = px(x, y); if (a >= 160 && !isShadow(r, g, b, a)) { base = y; break; } }
    if (base < 0) continue;
    const foot = h - 1 - base;
    if (foot > 0 && foot <= FOOT_MAX) out.foot[id] = foot;
    // запечённый контакт: тёмные полупрозрачные пиксели у основания (2 ряда выше и всё ниже)
    let contact = 0;
    for (let y = Math.max(0, base - 2); y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, a] = px(x, y); if (a >= 8 && isShadow(r, g, b, a)) contact++; }
    if (contact >= 4) continue;
    // ширина основания: непрозрачные пиксели трёх нижних рядов
    let x0 = w, x1 = -1;
    for (let y = Math.max(0, base - 2); y <= base; y++) for (let x = 0; x < w; x++) if (px(x, y)[3] >= 160) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    if (x1 >= x0) out.ao[id] = [x0, x1];
  }
  return out;
}
