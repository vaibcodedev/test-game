/** Проверка читаемости на хотбаре (задача 127): все 10 классов, по 20 умений, «было | стало» на фоне ячейки хотбара (--well, рамка --line).
 *  «Было» — текущие client/public/assets/icons/sk_*.png (читаются до перезаписи), «стало» — buildSkillIcon. Печатает самые тёмные иконки.
 *  Запуск: npx tsx tools/gen/icons-hotbar.ts [--write] (с --write ещё и пишет новые sk_*.png). */
import fs from "node:fs";
import path from "node:path";
import { PC, hex } from "./canvas";
import { ROOT, readPng, writePng, scaleNN, drawText, BEIGE, GOLD } from "./vendor-lib";
import { buildSkillIcon } from "./icons-build";
import { SKILLS } from "../../shared/skills";

const ICONS = path.join(ROOT, "client/public/assets/icons");
const WELL = hex("#0e0b10"), LINE = hex("#4d3f4a"), BG = hex("#120f16");
const classes = ["warrior", "deathknight", "mage", "warlock", "ranger", "healer", "bloodweaver", "darkranger", "reaver", "rogue"];
const cell = 52, pair = 2 * cell + 8;
const sheet = new PC(10 * pair + 12, classes.length * (2 * (cell + 6) + 18) + 8);
sheet.rect(0, 0, sheet.w, sheet.h, BG);
const dark: [string, number][] = [];
const p90 = (pc: PC) => { const l: number[] = []; for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) { const c = pc.get(x, y)!; if (c[3]) l.push(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]); } l.sort((a, b) => a - b); return l[Math.floor(l.length * 0.9)]; };
classes.forEach((cls, ci) => {
  const ids = Object.values(SKILLS).filter((s) => s.cls === cls).sort((a, b) => (a.kind === b.kind ? (a.slot ?? 99) - (b.slot ?? 99) : a.kind === "active" ? -1 : 1)).map((s) => s.id);
  const y0 = 6 + ci * (2 * (cell + 6) + 18);
  drawText(sheet, cls, 6, y0, GOLD);
  ids.forEach((id, i) => {
    const x = 6 + (i % 10) * pair, y = y0 + 10 + Math.floor(i / 10) * (cell + 6);
    const file = path.join(ICONS, SKILLS[id].icon + ".png");
    const after = buildSkillIcon(id);
    for (const [k, pc] of [[0, fs.existsSync(file) ? readPng(file) : after], [1, after]] as const) {
      const xx = x + k * (cell + 2);
      sheet.rect(xx, y, cell, cell, LINE); sheet.rect(xx + 1, y + 1, cell - 2, cell - 2, WELL);
      sheet.blit(scaleNN(pc, 2), xx + 2, y + 2);
    }
    dark.push([id, p90(after)]);
    if (process.argv.includes("--write")) after.save(file);
  });
});
writePng(sheet, path.join(ROOT, "tools/out/icons-preview/hotbar-check.png"));
dark.sort((a, b) => a[1] - b[1]);
console.log("самые тёмные (p90 яркости):", dark.slice(0, 14).map(([i, v]) => `${i}:${Math.round(v)}`).join(" "));
