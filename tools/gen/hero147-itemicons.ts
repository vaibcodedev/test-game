/**
 * Задача 147: иконки 48×48 девяти выдаваемых вещей героя Б (data/items-147.json) генератором gear147 (icons.ts, только чтение)
 * → client/public/assets/icons/im_<модель>_<0..2>.png (рамку редкости рисует ячейка интерфейса) + запись в assets/manifest.json icons.
 *   npx tsx tools/gen/hero147-itemicons.ts (имя не на «icons.ts»: иначе срабатывает запуск icons.ts)
 */
import fs from "node:fs";
import path from "node:path";
import { icon } from "./gear147/icons";
import { setOf, type Slot } from "./gear147/gear";

const items = JSON.parse(fs.readFileSync(path.resolve("data/items-147.json"), "utf8")).models as { id: string; set: string }[];
const OUT = path.resolve("client/public/assets/icons"), names: string[] = [];
for (const m of items) {
  const slot = m.id.split("_").pop() as Slot, it = setOf(m.set).items[slot];
  if (!it) { console.log("нет вещи", m.id); continue; }
  const im = icon(slot, it, "sol").img;
  for (let r = 0; r < 3; r++) { const n = `im_${m.id}_${r}`; im.save(path.join(OUT, `${n}.png`)); names.push(n); }
}
const mf = path.resolve("client/public/assets/manifest.json"), man = JSON.parse(fs.readFileSync(mf, "utf8"));
const add = names.filter((n) => !man.icons.includes(n));
if (add.length) { man.icons.push(...add); fs.writeFileSync(mf, JSON.stringify(man, null, 1)); }
console.log(`иконок: ${names.length}, в манифест добавлено ${add.length}`);
