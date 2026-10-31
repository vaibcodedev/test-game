/**
 * Задача 147: иконки 48×48 новых слотов «Наплечники» и «Перчатки» тем же рисовальщиком, что вещи героя Б (gear147/icons.ts, только чтение).
 * — базы без модели (plate/leather/cloth_shoulders, …_gloves; голая добыча, силуэт пустой ячейки): заглушки data/hero-b-live.json stubs,
 *   у тканевого оплечья — наплечник заглушки кожи в шерсти (у заглушки ткани наплечников нет);
 * — вещи сетов data/items-147.json с суффиксом _pauldrons / _gloves (как tools/gen/hero147-itemicons.ts).
 * Рамку редкости рисует ячейка интерфейса: у трёх редкостей одна картинка. → client/public/assets/icons + assets/manifest.json icons.
 *   npx tsx tools/gen/slot-arms.ts
 */
import fs from "node:fs";
import path from "node:path";
import { icon } from "./gear147/icons";
import { setOf, type Slot } from "./gear147/gear";

const live = JSON.parse(fs.readFileSync(path.resolve("data/hero-b-live.json"), "utf8")) as { stubs: Record<string, Partial<Record<Slot, Record<string, unknown>>>> };
const items = JSON.parse(fs.readFileSync(path.resolve("data/items-147.json"), "utf8")).models as { id: string; set: string }[];
const OUT = path.resolve("client/public/assets/icons"), names: string[] = [];
const save = (n: string, slot: Slot, it: unknown) => {
  const im = icon(slot, it, "sol").img;
  for (let r = 0; r < 3; r++) { im.save(path.join(OUT, `${n}_${r}.png`)); names.push(`${n}_${r}`); }
};
const S = live.stubs;
const wool = { ...S.leather.pauldrons, name: "Оплечье", plate: "wool_grey", accent: "wool_grey", trim: "wool_grey", size: 0.62 };
const bases: [string, Slot, unknown][] = [
  ["plate_shoulders", "pauldrons", S.plate.pauldrons], ["leather_shoulders", "pauldrons", S.leather.pauldrons], ["cloth_shoulders", "pauldrons", S.cloth.pauldrons ?? wool],
  ["plate_gloves", "gloves", S.plate.gloves], ["leather_gloves", "gloves", S.leather.gloves], ["cloth_gloves", "gloves", S.cloth.gloves],
];
for (const [id, slot, it] of bases) if (it) save(id, slot, it); else console.log("нет заглушки", id);
for (const m of items) {
  const slot = m.id.split("_").pop() as Slot;
  if (slot !== "pauldrons" && slot !== "gloves") continue;
  const it = setOf(m.set).items[slot];
  if (!it) { console.log("нет вещи", m.id); continue; }
  save(`im_${m.id}`, slot, it);
}
const mf = path.resolve("client/public/assets/manifest.json"), man = JSON.parse(fs.readFileSync(mf, "utf8"));
const add = names.filter((n) => !man.icons.includes(n));
if (add.length) { man.icons.push(...add); fs.writeFileSync(mf, JSON.stringify(man, null, 1)); }
console.log(`иконок: ${names.length}, в манифест добавлено ${add.length}`);
