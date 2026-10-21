/** Листы для проверки вслепую (задача 127): по 20 иконок ×4 без подписей, номер у каждой. Запуск: npx tsx tools/gen/icons-blind.ts
 *  Порядок id — tools/out/icons-preview/blind-order.json; результат проверки — audit.md. */
import fs from "node:fs";
import path from "node:path";
import { PC, hex } from "./canvas";
import { ROOT, writePng, scaleNN, drawText, BEIGE } from "./vendor-lib";
import { buildSkillIcon, SKILL_ICON_TABLE } from "./icons-build";

const OUT = path.join(ROOT, "tools/out/icons-preview");
const ids = Object.keys(SKILL_ICON_TABLE).filter((k) => k[0] !== "_");
const only = process.argv.slice(2).map(Number); // номера листов (с 1); пусто — все
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "blind-order.json"), JSON.stringify(ids));
const WELL = hex("#0e0b10"), BG = hex("#120f16"), LINE = hex("#4d3f4a");
for (let s = 0; s * 20 < ids.length; s++) {
  if (only.length && !only.includes(s + 1)) continue;
  const sheet = new PC(5 * 112 + 8, 4 * 116 + 8);
  sheet.rect(0, 0, sheet.w, sheet.h, BG);
  for (let i = 0; i < 20 && s * 20 + i < ids.length; i++) {
    const x = 8 + (i % 5) * 112, y = 6 + Math.floor(i / 5) * 116, n = s * 20 + i + 1;
    sheet.rect(x, y + 12, 100, 100, LINE); sheet.rect(x + 1, y + 13, 98, 98, WELL);
    sheet.blit(scaleNN(buildSkillIcon(ids[s * 20 + i]), 4), x + 2, y + 14);
    drawText(sheet, String(n), x, y + 2, BEIGE, 2);
  }
  writePng(sheet, path.join(OUT, `blind-${s + 1}.png`));
}
console.log(ids.length);
