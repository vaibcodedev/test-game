/**
 * Иконки особой добычи Гурдана Громобоя (r75n запад, задача 139): drawModel 48×48 по base/look/fac/rarity из data/ring-boss-loot.json
 * (как tools/gen/zb-icons-fix.ts), только три свои вещи, чужие файлы не трогаются; запись uq_<id> в manifest.json — правкой текста.
 * Монтаж ×3 — tools/out/bosses139/colossus-icons.png. Запуск: npx tsx tools/gen/bosses139/colossus-icons.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "../canvas";
import { drawModel, MODEL_CATS, ICON } from "../equip-models";

const ROOT = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
const IDS = ["zb_thunder_maul", "zb_gurdan_crown", "zb_rod_chain"];
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ring-boss-loot.json"), "utf8")).items as Record<string, { base: string; look: never; fac?: string; rarity?: number }>;
const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
const MAN = path.join(ROOT, "client", "public", "assets", "manifest.json");
let text = fs.readFileSync(MAN, "utf8");
const done: PC[] = [];
for (const id of IDS) {
  const it = items[id];
  if (!it) throw new Error(`нет вещи ${id}`);
  if (!MODEL_CATS.includes(it.base)) throw new Error(`нет модели для базы ${it.base}`);
  const pc = drawModel(it.base, it.look, it.fac ?? "", hashStr(id), it.rarity ?? 1);
  let n = 0; for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) if ((pc.get(x, y)?.[3] ?? 0) > 0) n++;
  if (n < 150) throw new Error(`пустая иконка ${id}: ${n} px`);
  const file = path.join(ROOT, "client", "public", "assets", "icons", `uq_${id}.png`);
  pc.save(file);
  done.push(pc);
  console.log(`  uq_${id}: ${fs.statSync(file).size} байт, ${n} px`);
  if (!text.includes(`"uq_${id}"`)) {
    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    const anchor = `  "uq_zb_drowned_bell",${nl}`;
    if (!text.includes(anchor)) throw new Error("нет якоря в manifest.json");
    text = text.replace(anchor, `${anchor}  "uq_${id}",${nl}`);
  }
}
JSON.parse(text);
fs.writeFileSync(MAN, text);
const S = ICON * 3, m = new PC(done.length * (S + 6) + 6, S + 12);
m.rect(0, 0, m.w, m.h, [34, 28, 44, 255]);
done.forEach((pc, i) => { for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) { const c = pc.get(x, y); if (c && c[3] > 0) m.rect(6 + i * (S + 6) + x * 3, 6 + y * 3, 3, 3, c); } });
m.save(path.join(ROOT, "tools", "out", "bosses139", "colossus-icons.png"));
