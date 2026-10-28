/**
 * Иконки особой добычи Горвака (r65n запад, задача 139): тем же путём, что общий сборщик (tools/gen-assets.ts → buildEquipIcons → uq_<id>),
 * но только для трёх вещей и без перезаписи чужих файлов. Запуск: npx tsx tools/gen/bosses139/frost-icons.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildEquipIcons } from "../equip";

const ROOT = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
const IDS = ["zb_mino_flail", "zb_mino_helm", "zb_mino_ring"];
const all = buildEquipIcons();
const MAN = path.join(ROOT, "client", "public", "assets", "manifest.json");
let text = fs.readFileSync(MAN, "utf8");
for (const id of IDS) {
  const pc = all[`uq_${id}`];
  if (!pc) throw new Error(`нет иконки uq_${id}`);
  const file = path.join(ROOT, "client", "public", "assets", "icons", `uq_${id}.png`);
  pc.save(file);
  console.log(`  uq_${id}: ${fs.statSync(file).size} байт`);
  if (!text.includes(`"uq_${id}"`)) {
    const nl = text.includes("\r\n") ? "\r\n" : "\n";
    const anchor = `  "uq_zb_drowned_bell",${nl}`;
    if (!text.includes(anchor)) throw new Error("нет якоря в manifest.json");
    text = text.replace(anchor, `${anchor}  "uq_${id}",${nl}`);
  }
}
JSON.parse(text);
fs.writeFileSync(MAN, text);
