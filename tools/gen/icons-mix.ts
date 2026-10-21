/** Проверка стиля вслепую (задача 127): листы, где вперемешку 10 оригиналов frosty и 10 сгенерированных одной стихии, без пометок.
 *  Запуск: npx tsx tools/gen/icons-mix.ts → tools/out/icons-preview/mix-<n>.png и mix-key.json (кто есть кто). */
import fs from "node:fs";
import path from "node:path";
import { PC, hex, hash01 } from "./canvas";
import { ROOT, writePng, scaleNN, drawText, BEIGE } from "./vendor-lib";
import { buildSkillIcon, SKILL_ICON_TABLE } from "./icons-build";
import type { Element } from "./icons-frosty";

const OUT = path.join(ROOT, "tools/out/icons-preview");
const WELL = hex("#0e0b10"), BG = hex("#120f16"), LINE = hex("#4d3f4a");
const els: Element[] = ["blood", "shadow", "holy", "phys", "arcane", "death", "frost", "fire", "poison", "nature", "lightning"];
const key: Record<string, { id: string; kind: string }[]> = {};
let n = 0;
for (const el of els) {
  const all = Object.entries(SKILL_ICON_TABLE).filter(([k, v]) => k[0] !== "_" && (v as { theme: string }).theme === el);
  const fro = all.filter(([, v]) => v.src === "frosty").map(([k]) => k), gen = all.filter(([, v]) => v.src === "gen").map(([k]) => k);
  const pick = [...fro.slice(0, 10).map((id) => ({ id, kind: "frosty" })), ...gen.slice(0, 10).map((id) => ({ id, kind: "gen" }))];
  if (pick.length < 10 || !fro.length || !gen.length) continue;
  pick.sort((a, b) => hash01(a.id.length * 7 + a.id.charCodeAt(0), a.id.charCodeAt(a.id.length - 1), n) - hash01(b.id.length * 7 + b.id.charCodeAt(0), b.id.charCodeAt(b.id.length - 1), n));
  n++;
  const sheet = new PC(5 * 112 + 8, Math.ceil(pick.length / 5) * 116 + 8);
  sheet.rect(0, 0, sheet.w, sheet.h, BG);
  pick.forEach((p, i) => {
    const x = 8 + (i % 5) * 112, y = 6 + Math.floor(i / 5) * 116;
    sheet.rect(x, y + 12, 100, 100, LINE); sheet.rect(x + 1, y + 13, 98, 98, WELL);
    sheet.blit(scaleNN(buildSkillIcon(p.id), 4), x + 2, y + 14);
    drawText(sheet, String(i + 1), x, y + 2, BEIGE, 2);
  });
  writePng(sheet, path.join(OUT, `mix-${n}.png`));
  key[`mix-${n}`] = pick.map((p, i) => ({ id: `${i + 1} ${el} ${p.id}`, kind: p.kind }));
}
fs.writeFileSync(path.join(OUT, "mix-key.json"), JSON.stringify(key, null, 1));
console.log(n, "листов");
