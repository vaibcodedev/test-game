/** Попадание мышью и порядок при наложении (задача 134, шаг 2; client/src/game/hit.ts): силуэт кадра (босс 128, всадник с конём), плашка ника и полоски,
 *  след 120 мс за бегущими, точно → передний → текущая цель → ближе центр. Запуск: npx tsx tests/pick.ts */
import assert from "node:assert/strict";
import { boxDist, emptyBox, hitUnit, PickBest, silhouette, sweptDist, Trail, TRAIL_MS, unionBox, type Box, type Hit } from "../client/src/game/hit";

const box = (): Box => emptyBox({ x0: 0, y0: 0, x1: 0, y1: 0 });
const H = (): Hit => ({ d: Infinity, exact: false, depth: 0, center: Infinity });
interface U { id: string; body: Box; plate: Box; y: number; tdx?: number; tdy?: number; sel?: boolean }
const unit = (id: string, x: number, y: number, frame = 32, o: Partial<U> = {}): U => ({ id, body: silhouette(box(), x, y, frame), plate: box(), y, ...o });
const pick = (list: U[], wx: number, wy: number, reach = 0): string | null => {
  const b = new PickBest(), h = H();
  b.reset();
  for (const u of list) if (hitUnit(h, u.body, u.plate, u.y, u.tdx ?? 0, u.tdy ?? 0, wx, wy, reach) < Infinity) b.offer(u.id, h, !!u.sel);
  return b.id;
};
let n = 0;
const ok = (c: boolean, m: string) => { assert.ok(c, m); n++; };

// силуэт: герой 32 — ±13,4 по ширине, 28,8 над ногами; голова рейд-босса (кадр 128) на 110 px выше ног кликается, круг r 30 у ног её не брал
const hero = unit("h", 100, 100);
ok(pick([hero], 100, 74) === "h", "голова героя");
ok(pick([hero], 113, 90) === "h", "край силуэта");
ok(pick([hero], 116, 90) === null, "мимо силуэта без допуска");
ok(pick([hero], 116, 90, 4) === "h", "допуск");
const boss = unit("boss", 300, 300, 128);
ok(pick([boss], 300, 190) === "boss", "голова рейд-босса");
ok(pick([boss], 350, 250) === "boss", "плечо рейд-босса");
ok(pick([boss], 300, 170) === null, "над рейд-боссом — мимо");

// всадник: кадр героя ∪ кадр коня (конь 64, ноги коня на 6 px выше нижнего края кадра — gy 58)
const rider = unit("r", 200, 200 - 14);
const horse = box(); horse.x0 = 200 - 0.42 * 64; horse.x1 = 200 + 0.42 * 64; horse.y0 = 200 - 58 + 6.4; horse.y1 = 200 + 4;
unionBox(rider.body, horse);
rider.y = 200;
ok(pick([rider], 225, 195) === "r", "круп коня");
ok(pick([rider], 200, 160) === "r", "голова всадника");

// плашка: ник и полоска — вторая зона с запасом 2 px; плашка поверх тела соседа
const named = unit("n", 400, 400, 32, { plate: { x0: 380, y0: 355, x1: 420, y1: 368 } });
ok(pick([named], 418, 357) === "n", "клик по нику");
ok(pick([named], 421.5, 357) === "n", "запас 2 px у плашки");
ok(pick([named], 425, 357) === null, "мимо плашки");
const behind = unit("b", 405, 384);
ok(pick([named, behind], 410, 360) === "n" && pick([behind, named], 410, 360) === "n", "ник поверх тела соседа");

// наложение: передний по глубине (ноги ниже) раньше заднего, хотя центр заднего ближе к курсору
const back = unit("back", 500, 500), front = unit("front", 506, 512);
ok(pick([back, front], 501, 488) === "front", "передний закрывает задний");
ok(pick([front, back], 501, 488) === "front", "порядок перебора не важен");
// одинаковая глубина: текущая цель, потом ближе центр
const a = unit("a", 600, 600), b2 = unit("b2", 608, 600);
ok(pick([a, b2], 603, 590) === "a", "ближе центр");
ok(pick([a, { ...b2, sel: true }], 603, 590) === "b2", "текущая цель раньше ближнего");
// точное попадание важнее допуска переднего
const near = unit("near", 700, 700), frontTol = unit("ft", 730, 720);
ok(pick([near, frontTol], 712, 690, 6) === "near", "точно важнее допуска переднего");
// среди допусков — ближе край зоны
ok(pick([unit("l", 800, 800), unit("rr", 834, 800)], 815, 790, 6) === "l", "ближе край зоны");

// след: волк бежит вправо 110 px/с, за 120 мс — 13 px; клик туда, где он был, засчитан, но точное попадание по стоящему важнее
const wolf = unit("w", 913, 900, 32, { tdx: -13, tdy: 0 });
ok(pick([wolf], 897, 890) === "w", "клик в след бегущего");
ok(pick([{ ...wolf, tdx: 0 }], 897, 890) === null, "без следа — мимо");
ok(pick([wolf, unit("st", 885, 900)], 896, 890) === "st", "стоящий по телу важнее следа");
ok(pick([{ ...wolf, tdx: -1 }], 899.5, 890) === null, "сдвиг меньше 2 px — не бег");
ok(Math.abs(sweptDist(wolf.body, -13, 0, 880, 890) - boxDist(wolf.body, 880, 890, -13, 0)) < 1e-6, "протяжка = дальний конец следа");
ok(sweptDist(wolf.body, 0, -40, 913, 860) === 0, "протяжка вверх");

// кольцо следа: положение 120 мс назад при 60 и 144 кадрах в секунду, скачок забывает прошлое
for (const fps of [60, 144]) {
  const t = new Trail(), out = { x: 0, y: 0 };
  let now = 1000;
  for (let k = 0; k < 60; k++) { t.push(now, k * 110 * (1000 / fps) / 1000, 0); now += 1000 / fps; }
  now -= 1000 / fps;
  ok(t.past(now, TRAIL_MS, out) && now - (out.x / 0.11 + 1000) <= TRAIL_MS + 1e-6 && now - (out.x / 0.11 + 1000) >= TRAIL_MS - 20, `след 120 мс при ${fps} fps`);
}
{
  const t = new Trail(), out = { x: 0, y: 0 };
  t.push(0, 0, 0); t.push(50, 5, 0); t.push(100, 500, 0, true);
  ok(t.past(100, TRAIL_MS, out) && out.x === 500, "скачок — без следа");
}

console.log(`pick: ${n} ok`);
