/** Иконки умений: сборка по data/skill-icons.json и превью (задача 127, шаг 1; в client/public/assets ничего не кладётся).
 *  Запуск: npx tsx tools/gen/icons-skills.ts
 *  Выход: tools/out/icons-preview/skills-<класс>.png (наша иконка | новая, gen — помечена), skills-compare.png (оригиналы frosty рядом со
 *  сгенерированными), skills/sk_<иконка>.png — готовые 24×24 для шага 2. */
import fs from "node:fs";
import path from "node:path";
import { PC } from "./canvas";
void 0;
import { ROOT, readPng, writePng, scaleNN, drawText, BG, BEIGE, GOLD, textWidth } from "./vendor-lib";
import { SKILLS } from "../../shared/skills";
import { SHAPE_IDS, type IconEntry } from "./icons-motifs";

const OUT = path.join(ROOT, "tools/out/icons-preview");
import { SKILL_ICON_TABLE as table, buildSkillIcon } from "./icons-build";
import type { SkillIconEntry as Entry } from "./icons-build";

const CLASS_NAMES: Record<string, string> = { deathknight: "deathknight", bloodweaver: "bloodweaver", darkranger: "darkranger", warlock: "warlock", reaver: "reaver", warrior: "warrior", healer: "healer", ranger: "ranger", mage: "mage", rogue: "rogue" };
const ours = (icon: string) => readPng(path.join(ROOT, "client/public/assets/icons", icon + ".png"));

function main() {
  fs.mkdirSync(path.join(OUT, "skills"), { recursive: true });
  const byCls = new Map<string, string[]>();
  for (const s of Object.values(SKILLS)) (byCls.get(s.cls) ?? byCls.set(s.cls, []).get(s.cls)!).push(s.id);
  const gens: { id: string; pc: PC }[] = [], fros: { id: string; pc: PC }[] = [];
  const cellW = 64 + 8 + 72 + 20, cellH = 76 + 22, cols = 4;
  for (const [cls, ids] of byCls) {
    ids.sort((a, b) => (SKILLS[a].kind === SKILLS[b].kind ? (SKILLS[a].slot ?? 99) - (SKILLS[b].slot ?? 99) : SKILLS[a].kind === "active" ? -1 : 1));
    const rows = Math.ceil(ids.length / cols);
    const sheet = new PC(cols * cellW + 8, rows * cellH + 20);
    sheet.rect(0, 0, sheet.w, sheet.h, BG);
    drawText(sheet, CLASS_NAMES[cls] ?? cls, 6, 5, GOLD, 2);
    ids.forEach((id, i) => {
      const x = 8 + (i % cols) * cellW, y = 20 + Math.floor(i / cols) * cellH;
      const icon = buildSkillIcon(id), e = table[id];
      sheet.blit(scaleNN(ours(SKILLS[id].icon), 2), x, y);
      sheet.blit(scaleNN(icon, 3), x + 72, y);
      const tag = e.src === "gen" ? " GEN" : " F";
      drawText(sheet, id.slice(0, 26) + tag, x, y + 70, e.src === "gen" ? [255, 190, 110, 255] : BEIGE);
      if (e.src === "gen") gens.push({ id, pc: icon }); else fros.push({ id, pc: icon });
      writePng(icon, path.join(OUT, "skills", SKILLS[id].icon + ".png"));
    });
    writePng(sheet, path.join(OUT, `skills-${cls}.png`));
  }
  // общий лист: сверху оригиналы frosty, снизу сгенерированные (×3)
  const cols2 = 20, cw = 24 * 3 + 4;
  const rowsF = Math.ceil(fros.length / cols2), rowsG = Math.ceil(gens.length / cols2);
  const cmp = new PC(cols2 * cw + 8, (rowsF + rowsG) * cw + 40);
  cmp.rect(0, 0, cmp.w, cmp.h, BG);
  drawText(cmp, `frosty originals ${fros.length}`, 4, 4, GOLD, 2);
  fros.forEach((f, i) => cmp.blit(scaleNN(f.pc, 3), 4 + (i % cols2) * cw, 18 + Math.floor(i / cols2) * cw));
  const gy = 18 + rowsF * cw + 10;
  drawText(cmp, `generated ${gens.length}`, 4, gy - 8, GOLD, 2);
  gens.forEach((f, i) => cmp.blit(scaleNN(f.pc, 3), 4 + (i % cols2) * cw, gy + 4 + Math.floor(i / cols2) * cw));
  cmp.h; writePng(cmp, path.join(OUT, "skills-compare.png"));
  // лист читаемости: сгенерированные ×3 с id под иконкой
  const rc = 10, rw = 24 * 3 + 40, rh = 24 * 3 + 16, rr = Math.ceil(gens.length / rc);
  const rd = new PC(rc * rw + 8, rr * rh + 8);
  rd.rect(0, 0, rd.w, rd.h, BG);
  gens.forEach((f, i) => { const x = 8 + (i % rc) * rw, y = 6 + Math.floor(i / rc) * rh; rd.blit(scaleNN(f.pc, 3), x, y); drawText(rd, f.id.slice(0, 17), x - 2, y + 24 * 3 + 3, BEIGE); });
  writePng(rd, path.join(OUT, "readability.png"));
  console.log("frosty", fros.length, "gen", gens.length, "->", OUT);
}
if (process.argv[1] && /icons-skills\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) main();
void textWidth;
