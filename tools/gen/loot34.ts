/**
 * Сундучок добычи, вид 3/4 (фасад + видна крышка сверху + правая грань), свет сверху-слева.
 * Макет «было | стало»: не заменяет объекты игры. Регистрирует вариант "chest34" в LOOT_DRAW и собирает листы тем же
 * buildLootSheet (падение, покой, ореол, искры — как у игры). Запуск: npx tsx tools/loot34-preview.ts
 */
import { PC, hex, withA, type Ramp } from "./canvas";
import { P } from "./palette";
import { LOOT_DRAW, buildLootSheet, type LootVariant } from "./loot";

const RARITY = ["#e8e2d0", "#5fa8ff", "#c47bff", "#ff9a2e"];
const WHITE = hex("#fffaf0");
const WOOD: Ramp = [hex("#24140b"), hex("#43271a"), hex("#6a4328"), hex("#8e5e36"), hex("#b8844c")];
const IRON: Ramp = [hex("#16141e"), hex("#2a2836"), hex("#4c4a62"), hex("#7a7896"), hex("#c4c2e0")];
const GOLD = P.gold;
const rr = (r: number): Ramp => { const t = hex(RARITY[r]); const m = (a: number[], b: number[], k: number) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k)); return [[...m(t, [0, 0, 0], 0.7), 255], [...m(t, [0, 0, 0], 0.42), 255], t, [...m(t, WHITE, 0.5), 255], [...m(t, WHITE, 0.85), 255]] as Ramp; };

function coin(c: PC, x: number, y: number) {
  c.ellipse(x, y, 1.6, 1, GOLD[1]); c.ellipse(x - 0.3, y - 0.3, 1.1, 0.6, GOLD[3]); c.set(x - 1, y - 1, GOLD[4]);
}

function drawChest34(r: number, k: number): PC {
  const W = Math.round(26 * k), H = Math.round(23 * k), g = H - 1;
  const c = new PC(W, H), R = rr(r), band = r === 3 ? GOLD : IRON;
  const fw = Math.round(15 * k), d = Math.round(4 * k), dd = Math.round(3 * k);
  const x0 = Math.round((W - fw - d) / 2), x1 = x0 + fw;
  const yb = Math.round(g - 8 * k), yl = yb - Math.round(5 * k), top = yl - dd;
  // правая грань (тень): корпус и крышка, 3 тона по высоте
  c.poly([[x1, yl], [x1 + d, top], [x1 + d, g - dd], [x1, g]], (_x, y) => (y < yb - dd ? WOOD[1] : y > g - 3 ? WOOD[0] : WOOD[1]));
  for (let y = yb - dd; y < g - dd; y += Math.round(3.5 * k)) c.rect(x1 + 1, y, d - 1, 1, WOOD[0]);
  // фасад корпуса: доски с бликом на каждой, 4 тона
  c.shadedRect(x0, yb, fw, g - yb + 1, WOOD, 0);
  for (let y = yb + Math.round(3.5 * k); y < g - 1; y += Math.round(3.5 * k)) { c.rect(x0 + 1, y, fw - 2, 1, WOOD[1]); c.rect(x0 + 1, y + 1, fw - 2, 1, WOOD[4]); }
  c.rect(x0, g, fw, 1, WOOD[0]); // контактная полоса у основания
  // фасад крышки: чуть светлее, скругление сверху
  c.shadedRect(x0, yl, fw, yb - yl, WOOD, 0);
  c.rect(x0, yl, fw, 1, WOOD[4]); c.rect(x0 + 1, yl + 1, fw - 2, 1, WOOD[3]);
  c.rect(x0, yb - 2, fw, 1, WOOD[1]);
  // верх крышки: освещённая плоскость 3/4, доски вдоль глубины
  c.poly([[x0, yl], [x1, yl], [x1 + d, top], [x0 + d, top]], (x, y) => { const t = (x - x0) / (fw + d); return t < 0.35 ? WOOD[4] : t < 0.8 ? WOOD[3] : WOOD[2]; });
  for (const t of [0.34, 0.67]) { const sx = x0 + Math.round(fw * t); c.line(sx, yl - 1, sx + d, top, WOOD[2]); }
  c.line(x0 + d, top, x1 + d, top, WOOD[1]); // дальняя кромка в тени
  c.line(x0, yl, x1, yl, WOOD[4]);
  // щель между крышкой и корпусом: металлический обод 2 px + блик
  c.rect(x0, yb - 1, fw, 2, band[2]); c.rect(x0, yb - 1, fw, 1, band[3]); c.rect(x0 + 1, yb - 1, Math.round(fw * 0.35), 1, band[4]);
  if (r) for (let x = x0 + 1; x < x1 - 1; x++) { c.set(x, yb + 1, withA(R[1], 170)); if (x % 3 === 0) c.set(x, yb, R[3]); }
  // вертикальные металлические полосы: по фасаду, через крышку и по верху
  const bw = Math.max(2, Math.round(2 * k));
  for (const bx of [x0 + Math.round(2.5 * k), x1 - Math.round(2.5 * k) - bw]) {
    c.poly([[bx, yl], [bx + bw, yl], [bx + bw + d, top], [bx + d, top]], band[3]);
    c.line(bx + 1, yl - 1, bx + d + 1, top, band[4]);
    for (let y = yl; y <= g; y++) for (let i = 0; i < bw; i++) c.set(bx + i, y, band[i === 0 ? 3 : 1]);
    c.set(bx, yl, band[4]); c.set(bx, yb + 2, band[4]); c.set(bx + 1, yb + 2, band[2]);
    for (const ry of [yl + 2, g - 2]) { c.set(bx, ry, band[4]); c.set(bx + 1, ry, band[2]); }
  }
  // уголки основания
  for (const [ux, s] of [[x0, 1], [x1 - 1, -1]] as const) { c.rect(Math.min(ux, ux + s * 2), g - 3, 3, 4, band[s > 0 ? 2 : 1]); c.set(ux + s, g - 2, band[4]); }
  // замок-пластина с камнем цвета редкости (у обычного замочная скважина)
  const lx = Math.round(x0 + fw / 2), ly = yb + 1;
  c.rect(lx - 2, ly - 1, 5, 5, band[1]); c.rect(lx - 2, ly - 1, 5, 1, band[4]); c.rect(lx - 2, ly - 1, 1, 5, band[3]);
  if (r) { c.rect(lx - 1, ly, 3, 3, R[1]); c.rect(lx - 1, ly, 2, 2, R[3]); c.set(lx - 1, ly, R[4]); }
  else { c.set(lx, ly + 1, WOOD[0]); c.set(lx, ly + 2, WOOD[0]); }
  // боссовый: монеты на крышке
  if (k > 1) { coin(c, x0 + Math.round(fw * 0.5) + 2, yl - 1); coin(c, x0 + 4 + d, top + 2); coin(c, x1 + 1, top + 2); }
  return c.outline(WOOD[0]);
}
LOOT_DRAW["chest34" as LootVariant] = drawChest34;
export const buildChest34 = (r: number, boss: boolean) => buildLootSheet("chest34" as LootVariant, r, boss);
