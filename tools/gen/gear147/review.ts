/**
 * Проверка сета по всем кадрам: npx tsx tools/gen/gear147/review.ts [set] [look 0..3] → tools/out/gear147/review-<set>.png
 * Все анимации, нужные оружию сета, × 4 направления (вниз, вверх, вправо, влево); в консоль — кадры, где что-то касается края кадра.
 */
import path from "node:path";
import { PC } from "../canvas";
import { text } from "../mobs/lib";
import { ANIMS, NF, SPECIAL_ANIMS, frameOf, renderLayers, type AnimId, type Look } from "../hero147/base_b";
import { AXE_LOG, VIEWS4, baseView, dress, renderView, setOf, viewLook } from "./gear";
import { lagCheck, slideCheck } from "../hero147/gait";

import { allItems, runMatch } from "./match";
import { ICON_AREA, ICON_FILL, ICON_SIDE_MAX, cell, icon, setIconFill } from "./icons";
// npx tsx tools/gen/gear147/review.ts match [фильтр id] — «иконка = вещь на герое» для всех вещей (ошибка — код выхода 1) + монтажи icon-vs-hero.png, all-items.png
// npx tsx tools/gen/gear147/review.ts size — размер иконок: видимая масса корпуса одна у всех (±12 %), сторона ≤ 80 %, центр (ошибка — код выхода 1)
// npx tsx tools/gen/gear147/review.ts fill — лист сравнения заполнения 60 % | 65 % | 70 % на 10 вещах → tools/out/gear147/icon-fill.png
if (process.argv[2] === "match") { if (runMatch(process.argv[3])) process.exitCode = 1; }
else if (process.argv[2] === "size") { if (sizeCheck(process.argv[3]).length) process.exitCode = 1; }
else if (process.argv[2] === "fill") fillSheet();
else reviewSet();

/**
 * Размер иконок (docs/art/icons.md §2, владелец 2026-10-31): видимая масса корпуса (пиксели без рогов, шипов, крыльев) = ICON_AREA ±12 %
 * (тонкое оружие и шарф могут упереться в предел стороны — тогда масса меньше, это допустимо); большая сторона корпуса ≤ 80 % поля;
 * корпус по центру (±1,5 px; с рогами/крыльями — до 5 px); весь предмет не касается края.
 */
export function sizeCheck(filter?: string) {
  const AREA = ICON_AREA * (ICON_FILL / 0.6) ** 2, SMAX = Math.round(ICON_SIDE_MAX * 48), fails: string[] = [], areas: number[] = [];
  for (const x of allItems().filter((q) => !filter || q.id.includes(filter))) {
    const { body: b, all: a, area } = icon(x.slot, x.it, "sol", x.rarity).box, side = Math.max(b[2] - b[0] + 1, b[3] - b[1] + 1), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    areas.push(area);
    const e: string[] = [], capped = side >= SMAX - 1;
    if (area > AREA * 1.12 || (area < AREA * 0.88 && !capped)) e.push(`масса ${area} px (нужно ${Math.round(AREA)} ±12 %)`);
    if (side > SMAX) e.push(`сторона корпуса ${side} px > ${SMAX}`);
    const extra = a.join() !== b.join(), m = Math.min(b[0], b[1], 47 - b[2], 47 - b[3]), off = Math.max(Math.abs(cx - 23.5), Math.abs(cy - 23.5));
    if (off > (extra ? 5 : 1.5)) e.push(`корпус не по центру (${cx}, ${cy})`);
    if (m < 2) e.push(`отступ корпуса ${m} px`);
    if (Math.min(a[0], a[1]) < 1 || Math.max(a[2], a[3]) > 46) e.push(`предмет касается края поля`);
    if (e.length) fails.push(`${x.id}: ${e.join("; ")}`);
  }
  for (const f of fails) console.log("✗ " + f);
  console.log(`размер иконок: ${areas.length - fails.length} из ${areas.length} в допуске (масса ${Math.round(AREA)} px ±12 %, сторона ≤ ${SMAX} px; факт ${Math.min(...areas)}–${Math.max(...areas)} px)`);
  return fails;
}
function fillSheet() {
  const ids = ["chaos-knight/helm", "chaos-knight/armor", "chaos-knight/pauldrons", "chaos-knight/gloves", "chaos-knight/boots", "chaos-knight/cloak", "chaos-knight/weapon", "rogue-chaos/armor", "tier/латы/helm/30/common", "tier/ткань/armor/50/epic"];
  const items = allItems(), list = ids.map((id) => items.find((x) => x.id === id)).filter(Boolean) as ReturnType<typeof allItems>;
  const fills = [0.6, 0.65, 0.7], K = 2, cw = 48 * K + 8, lw = 40;
  const out = new PC(lw + list.length * cw + 10, 70 + fills.length * (48 * K + 40) + 48 + 30);
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 24; out.data[i + 1] = 20; out.data[i + 2] = 26; out.data[i + 3] = 255; }
  const put = (im: PC, ox: number, oy: number, k: number) => { for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const q = im.get(x, y); if (q && q[3]) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) out.set(ox + x * k + a, oy + y * k + b, q); } };
  text(out, "ВИДИМАЯ МАССА КАК У ШЛЕМА ПРИ 60 · 65 · 70 ПРОЦ. · СТОРОНА ДО 80 ПРОЦ. · ЗУМ 2 И 1", 10, 10, 2, [255, 216, 100, 255]);
  const was = ICON_FILL;
  fills.forEach((f, r) => {
    setIconFill(f);
    const y = 50 + r * (48 * K + 40);
    text(out, `${Math.round(f * 100)}`, 4, y + 40, 2, [255, 216, 100, 255]);
    list.forEach((x, i) => { const ic = icon(x.slot, x.it, "sol", x.rarity); put(cell(ic.img, x.rarity), lw + i * cw, y, K); put(cell(ic.img, x.rarity), lw + i * cw + 48 * K - 48, y + 48 * K + 4, 1); });
  });
  setIconFill(was);
  out.save(path.resolve("tools/out/gear147/icon-fill.png"));
  console.log("→ tools/out/gear147/icon-fill.png");
}
function reviewSet() {
const id = process.argv[2] ?? "chaos-knight", set = setOf(id);
const looks: Look[] = [{ fac: "sol", sex: "m", hair: "tousled" }, { fac: "sol", sex: "f", hair: "braid" }, { fac: "umb", sex: "m", hair: "mane" }, { fac: "umb", sex: "f", hair: "loose" }];
const l = dress(looks[+(process.argv[3] ?? 0)], set, looks[+(process.argv[3] ?? 0)].fac as any);
const two = set.items.weapon?.kind === "great";
const anims: AnimId[] = [...ANIMS.filter((a) => !(two ? ["atk1h", "block", "bow", "cast"] : set.items.weapon?.kind === "dual" ? ["block", "bow", "cast"] : []).includes(a)), ...SPECIAL_ANIMS.filter((a) => (set.items.weapon?.special ?? []).includes(a))];
const { FRx: FR, OX } = frameOf(l);
const K = 2, fw = FR * K, lw = 150, out = new PC(lw + Math.max(...anims.map((a) => NF(a))) * fw + 10, anims.length * VIEWS4.length * fw + anims.length * 24 + 10);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 24; out.data[i + 1] = 20; out.data[i + 2] = 26; out.data[i + 3] = 255; }
const edge: string[] = [], over: string[] = [], grip: string[] = [];
let y = 6;
for (const a of anims) {
  text(out, a.toUpperCase(), 6, y, 2, [255, 216, 100, 255]); y += 24;
  for (const v of VIEWS4) {
    text(out, v.toUpperCase(), 6, y + fw / 2 - 6, 2);
    for (let i = 0; i < NF(a); i++) {
      const x0 = lw + i * fw, f = renderView(l, v, a, i).img;
      for (let yy = 0; yy < fw - 2; yy++) for (let xx = 0; xx < fw - 2; xx++) out.set(x0 + xx, y + yy, (v === "up" || v === "left") ? [40, 48, 54, 255] : [44, 54, 40, 255]);
      let touch = false;
      for (let yy = 0; yy < FR; yy++) for (let xx = 0; xx < FR; xx++) if (f.has(xx, yy)) {
        if (xx === 0 || yy === 0 || xx === FR - 1 || (yy === FR - 1 && !(xx > 14 + OX && xx < 34 + OX))) touch = true;
        const q = f.get(xx, yy); for (let p = 0; p < K; p++) for (let b = 0; b < K; b++) out.set(x0 + xx * K + p, y + yy * K + b, [q[0], q[1], q[2], 255]);
      }
      if (touch) edge.push(`${a}/${v}/${i}`);
      // кулак на рукояти (gear.md §7): видна рукоять оружия в руке — видны и пальцы поверх неё (пиксели кисти пересекаются с рукоятью)
      if (!["gather", "ride", "death"].includes(a)) {
        const isFist = (p: any) => /^w_(fist|fistL|thumb)$/.test(p.g), isGrip = (p: any) => (p.slot === "weapon" || p.g === "weapon") && /^(w_grip|w_shaft|w_wrap|weapon)$/.test(p.g);
        const [full, fs, gp] = renderLayers(viewLook(l, v), baseView(v), a, i, [() => true, isFist, isGrip]);
        // рукоять рядом с кулаком (рамка пальцев +1 px) видна, а пальцев не видно — ошибка; кулак за корпусом вместе с рукоятью — норма
        let fv = 0, gv = 0, any = 0, x0 = FR, y0 = FR, x1 = -1, y1 = -1;
        for (let yy = 0; yy < FR; yy++) for (let xx = 0; xx < FR; xx++) if (fs.img.has(xx, yy)) { any++; x0 = Math.min(x0, xx); y0 = Math.min(y0, yy); x1 = Math.max(x1, xx); y1 = Math.max(y1, yy); if (full.img.has(xx, yy) && full.img.get(xx, yy).join() === fs.img.get(xx, yy).join()) fv++; }
        for (let yy = y0 - 1; yy <= y1 + 1; yy++) for (let xx = x0 - 1; xx <= x1 + 1; xx++) if (gp.img.has(xx, yy) && full.img.has(xx, yy) && full.img.get(xx, yy).join() === gp.img.get(xx, yy).join()) gv++;
        // кулак закрыт корпусом (кисть за телом) — не ошибка: проверяем, что пальцы не скрыты самой рукоятью (рукоять поверх кулака)
        let underGrip = 0; for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (fs.img.has(xx, yy) && gp.img.has(xx, yy) && full.img.has(xx, yy) && full.img.get(xx, yy).join() === gp.img.get(xx, yy).join() && gp.img.get(xx, yy).join() !== fs.img.get(xx, yy).join()) underGrip++; // тот же тон перчатки и обмотки — не ошибка
        if (any && gv >= 4 && fv < 2 && underGrip >= Math.max(4, any * 0.25)) grip.push(`${a}/${v}/${i}`);
      }
      // оружие спереди не должно перекрываться наплечником (вид вниз)
      if (v === "down" && !["gather", "ride"].includes(a) && !(a === "death" && i / NF(a) > 0.22)) {
        const [full, wpn, pd] = renderLayers(viewLook(l, v), baseView(v), a, i, [() => true, (p) => p.slot === "weapon" && p.layer >= 5, (p) => p.slot === "pauldrons"]);
        let hid = 0;
        for (let yy = 0; yy < FR; yy++) for (let xx = 0; xx < FR; xx++) if (wpn.img.has(xx, yy) && wpn.img.has(xx + 1, yy) && wpn.img.has(xx - 1, yy) && wpn.img.has(xx, yy + 1) && wpn.img.has(xx, yy - 1) && pd.img.has(xx, yy)) { const q = full.img.get(xx, yy), w = wpn.img.get(xx, yy), pq = pd.img.get(xx, yy); if (q.join() === pq.join() && q.join() !== w.join()) hid++; }
        if (hid > 2) over.push(`${a}/${v}/${i}:${hid}`);
      }
    }
    y += fw;
  }
}
out.save(path.resolve(`tools/out/gear147/review-${id}.png`));
console.log("край кадра:", edge.length ? edge.join(" ") : "нет");
console.log("клинок под наплечником (вниз):", over.length ? over.join(" ") : "нет");
console.log("рукоять без кулака:", grip.length ? grip.join(" ") : "нет");
// топор и секира: лезвие на экране — на стороне «вперёд» корпуса (по направлению удара), а не к голове и не назад (владелец 2026-10-31)
const axeBad = [...new Set(AXE_LOG.filter((e) => e.fwd < -0.3 || (e.used === "screen" && ["idle", "walk", "run", "stance"].includes(e.anim))).map((e) => `${e.anim}/${e.v}/${e.i}`))];
if (set.items.weapon?.head === "axe") console.log(`лезвие топора вперёд: ${AXE_LOG.length ? (axeBad.length ? axeBad.join(" ") : "да") : "нет кадров"} (вперёд по корпусу ${AXE_LOG.filter((e) => e.used === "F").length}, наружу ${AXE_LOG.filter((e) => e.used === "A").length}, по экрану ${AXE_LOG.filter((e) => e.used === "screen").length})`);
// шаг основы «Б»: опорная ступня не скользит (сдвиг больше 1 px — ошибка), части на корпусе не дёргаются (больше 1 px за кадр — ошибка)
const slide = (["walk", "run", "idle2", "stance"] as AnimId[]).flatMap((a) => slideCheck(l, a));
const jerk = (["idle", "idle2", "stance", "walk", "run"] as AnimId[]).flatMap((a) => lagCheck(l, a));
console.log("скольжение ступни:", slide.length ? slide.join(" ") : "нет");
console.log("рывки наплечников и пластин:", jerk.length ? jerk.join(" ") : "нет");
if (slide.length || jerk.length || grip.length || (set.items.weapon?.head === "axe" && AXE_LOG.some((e) => e.fwd < -0.3 || (e.used === "screen" && ["idle", "walk", "run", "stance"].includes(e.anim))))) process.exitCode = 1;
}
