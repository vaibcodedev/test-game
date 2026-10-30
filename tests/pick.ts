/** Попадание мышью и порядок при наложении (задача 134, шаг 2; client/src/game/hit.ts): силуэт кадра (босс 128, всадник с конём), плашка ника и полоски,
 *  след 120 мс за бегущими, точно → передний → текущая цель → ближе центр. Запуск: npx tsx tests/pick.ts */
import assert from "node:assert/strict";
import fs from "node:fs";
import { PNG } from "pngjs";
import { tabOrder, type TabUnit } from "../client/src/game/castResolve";
import { boxDist, emptyBox, hitUnit, imageDist, PickBest, silhouette, sweptDist, Trail, TRAIL_MS, unionBox, type Box, type Hit, type Mask } from "../client/src/game/hit";

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
// Колосс (мировой босс, кадр 140, задача 147): рост ≈ 127 px над ногами, ширина ≈ 128 — макушка и плечо кликаются, выше макушки — мимо
const colossus = unit("col", 600, 600, 140);
ok(pick([colossus], 600, 600 - 122) === "col", "макушка Колосса");
ok(pick([colossus], 600 + 56, 600 - 80) === "col", "плечо Колосса");
ok(pick([colossus], 600, 600 - 134) === null, "над Колоссом — мимо");
// Гурдан Громобой (босс кольца r75n, тот же образ в прежнем кадре 80): рост ≈ 73 px
const gurdan = unit("gur", 900, 600, 80);
ok(pick([gurdan], 900, 600 - 70) === "gur", "макушка Гурдана");
ok(pick([gurdan], 900, 600 - 78) === null, "над Гурданом — мимо");

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

// Tab (шаг 3): только враги на экране с прямой видимостью, сначала бьющие меня, затем ближние; за краем экрана — нет
{
  const t = (id: string, x: number, o: Partial<TabUnit> = {}): TabUnit => ({ id, x, y: 0, dead: false, enemy: true, inView: true, los: true, onMe: false, ...o });
  const me = { x: 0, y: 0 };
  ok(tabOrder([t("far", 300), t("near", 50), t("mid", 120)], me).join() === "near,mid,far", "Tab: ближние первыми");
  ok(tabOrder([t("near", 50), t("hit", 200, { onMe: true })], me).join() === "hit,near", "Tab: бьющий меня первым");
  ok(tabOrder([t("off", 30, { inView: false }), t("on", 400)], me).join() === "on", "Tab: за краем экрана — нет, хоть и ближе");
  ok(tabOrder([t("wall", 30, { los: false }), t("d", 40, { dead: true }), t("ally", 20, { enemy: false })], me).length === 0, "Tab: за стеной, павший и союзник — нет");
}

// объекты — по непрозрачным пикселям кадра (imageDist): камень телепорта 40x110 с опорой внизу по центру (0,5; 1) в (1000, 1000)
{
  const mk = (w: number, h: number, on: (x: number, y: number) => boolean): Mask => { const a = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = on(x, y) ? 1 : 0; return { w, h, a }; };
  // кристалл: узкий ромб от макушки до y = 80, постамент в нижних 30 строках
  const stone = mk(40, 110, (x, y) => y >= 80 ? x >= 4 && x < 36 : Math.abs(x - 20) <= 3 + (y < 40 ? y * 0.4 : (80 - y) * 0.3));
  const at = (wx: number, wy: number, tol = 5) => imageDist(stone, 1000, 1000, 0.5, 1, 1, 1, false, wx, wy, tol);
  ok(at(1000, 893) === 0, "камень: верх кристалла");
  ok(at(1000, 950) === 0, "камень: середина");
  ok(at(1000, 990) === 0, "камень: основание");
  ok(at(1030, 950) === Infinity, "камень: рядом мимо (30 px сбоку от кристалла)");
  ok(at(1000, 880) === Infinity, "камень: над макушкой мимо");
  ok(at(1000 + 12, 950, 5) < Infinity && at(1000 + 12, 950, 5) > 0, "камень: край с допуском");
  ok(at(1000 + 20, 950, 5) === Infinity, "камень: дальше допуска мимо");
  ok(imageDist(stone, 1000, 1000, 0.5, 1, 2, 2, false, 1000, 1000 - 2 * 110 + 4, 3) === 0, "камень: масштаб 2, верх");
  const flipped = mk(10, 10, (x) => x < 2);
  ok(imageDist(flipped, 100, 100, 0.5, 1, 1, 1, true, 100 + 4, 95, 0) === 0 && imageDist(flipped, 100, 100, 0.5, 1, 1, 1, false, 100 + 4, 95, 0) === Infinity, "отражение кадра");
  // мешок (12x10) и узел (30x30): силуэт, а не круг
  const bag = mk(12, 10, (x, y) => x >= 1 && x < 11 && y >= 3);
  ok(imageDist(bag, 50, 50, 0.5, 1, 1, 1, false, 50, 45, 0) === 0 && imageDist(bag, 50, 50, 0.5, 1, 1, 1, false, 50, 38, 2) === Infinity, "мешок: по силуэту");
}

// герой «Б» (задача 147, client/src/game/heroB.ts): кадр сводится из листов client/public/assets/hero147 по z, клик — по маске сведённого кадра
// (imageDist, как объекты), опора — ступни (origin листа). Проверка на покое вниз, кадр 0: основа + причёска и латы новобранца + шлем.
{
  const root = "client/public/assets/hero147", manFile = `${root}/manifest.json`;
  if (!fs.existsSync(manFile)) console.log("pick: листов героя Б нет (npx tsx tools/gen/gear147-export.ts) — пропуск");
  else {
    const man = JSON.parse(fs.readFileSync(manFile, "utf8"));
    const frameOf = (groups: string[], filter: (k: string) => boolean, row: number, col: number) => {
      const ents = groups.flatMap((g) => Object.entries(man.groups[g] ?? {}).filter(([k]) => filter(k)).map(([, e]) => e as { file: string; frame: number; origin: number[]; z: (number | null)[][] }))
        .filter((e) => e.z[row]?.[col] != null).sort((p, q) => p.z[row][col]! - q.z[row][col]!);
      const F = Math.max(...ents.map((e) => e.frame)), O = ents.find((e) => e.frame === F)!.origin;
      const a = new Uint8Array(F * F);
      for (const e of ents) {
        const png = PNG.sync.read(fs.readFileSync(`${root}/${e.file}`)), dx = O[0] - e.origin[0], dy = O[1] - e.origin[1];
        for (let y = 0; y < e.frame; y++) for (let x = 0; x < e.frame; x++) if (png.data[((row * e.frame + y) * png.width + col * e.frame + x) * 4 + 3] >= 24) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < F && Y < F) a[Y * F + X] = 1; }
      }
      return { m: { w: F, h: F, a } as Mask, O };
    };
    const rows = man.rows.great as [string, string][], r0 = rows.findIndex((q) => q[0] === "idle" && q[1] === "down");
    const { m, O } = frameOf(["body/sol_m/great", "hair/m_tousled_sol/great"], () => true, r0, 0);
    // ступни на опоре: опора — середина следа ступни в 3/4 (skeleton foot y 45,5), нижний край подошвы с контуром — на 1..2 px ниже
    let foot = -1; for (let y = m.h - 1; y >= 0 && foot < 0; y--) for (let x = O[0] - 6; x <= O[0] + 6; x++) if (m.a[y * m.w + x]) { foot = y; break; }
    ok(foot >= O[1] && foot <= O[1] + 2, `герой Б: ступни на опоре (${foot} vs ${O[1]})`);
    let top = -1; for (let y = 0; y < m.h && top < 0; y++) for (let x = O[0] - 7; x <= O[0] + 7; x++) if (m.a[y * m.w + x]) { top = y; break; }
    const rise = O[1] - top;
    ok(rise >= 28 && rise <= 34, `герой Б: рост ${rise} px (≈30)`);
    const ox = O[0] / m.w, oy = O[1] / m.h, at = (wx: number, wy: number, tol = 0) => imageDist(m, 500, 500, ox, oy, 1, 1, false, wx, wy, tol);
    ok(at(500, 500 - rise + 1.5) === 0, "герой Б: макушка");
    ok(at(500, 500 - 2) === 0 || at(497, 500 - 2) === 0 || at(503, 500 - 2) === 0, "герой Б: ноги");
    ok(at(500, 500 - rise - 3) === Infinity, "герой Б: над макушкой — мимо");
    ok(at(500, 500 - rise - 3, 4) < Infinity, "герой Б: над макушкой в допуске");
    ok(at(500 + 16, 500 - 15) === Infinity, "герой Б: сбоку от тела — мимо (не прямоугольник кадра)");
    // в латах новобранца со шлемом: силуэт шире и выше, ступни там же
    const dressed = frameOf(["body/sol_m/great", "gear/recruit-plate/m/great"], (k) => !k.startsWith("crest@") || k.endsWith("-sol"), r0, 0);
    ok(dressed.O[0] === O[0] && dressed.O[1] === O[1], "герой Б: опора в латах та же");
    let cnt0 = 0, cnt1 = 0; for (let k = 0; k < m.a.length; k++) { cnt0 += m.a[k]; cnt1 += dressed.m.a[k]; }
    ok(cnt1 > cnt0, "герой Б: латы добавляют силуэт");
    // Рыцарь Хаоса: кадр 96 под крупный клинок, опора сдвинута (frameOf), тело совпадает с телом кадра 48 после сдвига
    if (man.groups["gear/chaos-knight/m/great"]) {
      const ck = frameOf(["body/sol_m/great", "gear/chaos-knight/m/great"], (k) => !k.startsWith("crest@") || k.endsWith("-sol"), r0, 0);
      ok(ck.m.w === 96 && ck.O[0] === 48 && ck.O[1] === 81, "герой Б: кадр Рыцаря 96, ступни (48, 81)");
      ok(imageDist(ck.m, 500, 500, ck.O[0] / 96, ck.O[1] / 96, 1, 1, false, 500, 500 - 2, 2) < Infinity, "герой Б: Рыцарь — ноги на опоре");
    }
  }
}

// сундуки добычи 3/4 (tools/gen/loot34.ts, objects/loot_r*): кадр покоя — наведение по силуэту, на всю высоту, мимо — нет
for (const id of ["loot_r0", "loot_r1", "loot_r2", "loot_r3", "loot_r0_boss", "loot_r3_boss"]) {
  const png = PNG.sync.read(fs.readFileSync(`client/public/assets/objects/${id}.png`)), fw = Math.floor(png.width / 20), fh = png.height;
  const a = new Uint8Array(fw * fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) a[y * fw + x] = png.data[(y * png.width + 12 * fw + x) * 4 + 3] > 40 ? 1 : 0;
  const m: Mask = { w: fw, h: fh, a };
  let top = -1, bot = -1;
  for (let y = 0; y < fh && (top < 0 || bot < 0); y++) { if (top < 0 && a.slice(y * fw, (y + 1) * fw).some((v) => v)) top = y; const yy = fh - 1 - y; if (bot < 0 && a.slice(yy * fw, (yy + 1) * fw).some((v) => v)) bot = yy; }
  const at = (lx: number, ly: number) => imageDist(m, 0, 0, 0, 0, 1, 1, false, lx, ly, 0);
  const col = (y: number) => { for (let x = 0; x < fw; x++) if (a[y * fw + x]) return x; return -1; };
  ok(at(col(top), top) === 0 && at(col(bot), bot) === 0, `${id}: верх и низ силуэта кликабельны`);
  ok(at(0, 0) === Infinity && at(fw - 1, 0) === Infinity, `${id}: пустой угол кадра мимо`);
  ok(bot - top >= fh * 0.5, `${id}: силуэт занимает кадр по высоте`);
}

console.log(`pick: ${n} ok`);
