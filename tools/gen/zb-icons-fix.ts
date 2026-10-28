/**
 * Дорисовка пустых (≈135 байт) иконок особых вещей боссов zb_*: buildUniqueIcon рисует их старым 32-px рисовальщиком по базе,
 * а базы-модели (меч, шлем, плащ…) он не знает. Рисуем тем же drawModel 48×48, что у иконок Горвака/капеллана, по base/look/fac/rarity
 * из data/ring-boss-loot.json и data/zone-boss-loot.json. Трогает только файлы < 300 байт. Запуск: npx tsx tools/gen/zb-icons-fix.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "./canvas";
import { drawModel, MODEL_CATS, ICON } from "./equip-models";

const ROOT = path.resolve(path.dirname(process.argv[1]), "..", "..");
const DIR = path.join(ROOT, "client", "public", "assets", "icons");
const items: Record<string, any> = {};
for (const f of ["ring-boss-loot.json", "zone-boss-loot.json"]) Object.assign(items, JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")).items);
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };

const done: { id: string; pc: PC }[] = [];
for (const file of fs.readdirSync(DIR).filter((f) => /^uq_zb_.*\.png$/.test(f)).sort()) {
  const full = path.join(DIR, file);
  if (fs.statSync(full).size >= 300) continue;
  const id = file.slice(3, -4), it = items[id];
  if (!it || !it.look) { console.log(`  ПРОПУСК ${id}: нет описания/look`); continue; }
  if (!MODEL_CATS.includes(it.base)) { console.log(`  ПРОПУСК ${id}: нет модели для базы ${it.base}`); continue; }
  const pc = drawModel(it.base, it.look, it.fac ?? "", hashStr(id), it.rarity ?? 1);
  pc.save(full);
  console.log(`  ${id} (${it.base}, r${it.rarity}): ${fs.statSync(full).size} байт`);
  done.push({ id, pc });
}
// монтаж ×3, 8 в ряд
const S = ICON * 3, cols = 8, rows = Math.ceil(done.length / cols), pad = 6;
const m = new PC(cols * (S + pad) + pad, Math.max(1, rows) * (S + pad) + pad);
m.rect(0, 0, m.w, m.h, [34, 28, 44, 255]);
done.forEach(({ pc }, i) => {
  const ox = pad + (i % cols) * (S + pad), oy = pad + Math.floor(i / cols) * (S + pad);
  for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) { const c = pc.get(x, y); if (c && c[3] > 0) m.rect(ox + x * 3, oy + y * 3, 3, 3, c); }
});
m.save(path.join(ROOT, "tools", "out", "zb-icons-fix.png"));
console.log(`исправлено ${done.length}`);
