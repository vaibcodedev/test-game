/**
 * Объёмные камни, льдины и снега (tools/gen/nature3d.ts) в игре: кадры всех вариантов есть в manifest.json; низ кадра = основание
 * (в нижнем ряду контактная тень, пустых рядов нет — длинная тень не отрывается, docs/art/perspective.md п. 4); контактная тень
 * лежит точно под основанием (не сдвинута); у непроходимых видов основание укладывается в след OBJECT_FOOTPRINT и не меньше его трети;
 * варианты по клеткам встречаются все. Запуск: npx tsx tests/nature-hitbox.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { OBJECT_FOOTPRINT } from "../shared/map";
import { NATURE_VARIANTS, natureVariant } from "../shared/natureVariants";

const OBJ = path.resolve("client/public/assets/objects");
const man = JSON.parse(fs.readFileSync(path.resolve("client/public/assets/manifest.json"), "utf8")) as { objects: Record<string, { w: number; h: number }> };
let bad = 0, n = 0;
// камни и уступы: основание = след; у деревьев и кактусов след — клетка ствола, основание уже
const ROCKY = new Set(["rock", "big_rock", "sandstone", "basalt", "snow_rock", "ice_spike", "v_volcano_boulder", "v_volcano_rock_pile", "ledge_grass", "ledge_snow", "ledge_sand", "ledge_ash"]);
const fail = (s: string) => { bad++; console.log("FAIL", s); };

for (const [kind, cnt] of Object.entries(NATURE_VARIANTS)) {
  const seen = new Set<number>();
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) seen.add(natureVariant(kind, x, y));
  if (seen.size !== cnt) fail(`${kind}: по клеткам встречается ${seen.size} вариантов из ${cnt}`);
  for (let k = 0; k < cnt; k++) {
    const id = k ? `${kind}__${k}` : kind, f = path.join(OBJ, `${id}.png`);
    if (!fs.existsSync(f)) { fail(`${id}: нет кадра`); continue; }
    if (!man.objects[id]) fail(`${id}: нет в manifest.json`);
    const p = PNG.sync.read(fs.readFileSync(f));
    const a = (x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];
    const span = (y0: number, y1: number, min: number): [number, number] | null => {
      let x0 = Infinity, x1 = -Infinity;
      for (let y = y0; y <= y1; y++) for (let x = 0; x < p.width; x++) if (a(x, y) >= min) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      return x1 >= x0 ? [x0, x1] : null;
    };
    const ao = span(p.height - 1, p.height - 1, 1);
    if (!ao) { fail(`${id}: пустой нижний ряд — тень оторвётся`); continue; }
    const base = span(p.height - 8, p.height - 1, 250);
    if (!base) { fail(`${id}: нет основания у низа кадра`); continue; }
    // каждая точка нижнего ряда тени — под основанием (±1 px по горизонтали): тень не сдвинута вбок
    let off = 0;
    for (let x = 0; x < p.width; x++) {
      if (!a(x, p.height - 1)) continue;
      let ok = false;
      for (let y = p.height - 8; y <= p.height - 2 && !ok; y++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < p.width && y >= 0 && a(x + dx, y) >= 250) ok = true;
      if (!ok) off++;
    }
    if (off) fail(`${id}: ${off} px контактной тени не под основанием`);
    const cBase = (base[0] + base[1]) / 2;
    if (Math.abs(cBase - p.width / 2) > 6) fail(`${id}: основание не под опорой (центр ${cBase} при ширине ${p.width})`);
    const fp = OBJECT_FOOTPRINT[kind];
    if (fp) {
      const bw = base[1] - base[0] + 1, cw = fp.w * 32;
      if (bw > cw + 6) fail(`${id}: основание ${bw} px шире следа ${cw}`);
      if (ROCKY.has(kind) && bw < cw * 0.33) fail(`${id}: основание ${bw} px меньше трети следа ${cw}`);
    }
    n++;
  }
}
console.log(bad ? `nature-hitbox: ${bad} ошибок` : `nature-hitbox: OK, кадров ${n}`);
process.exit(bad ? 1 : 0);
