/** Иконки умений из data/skill-icons.json для tools/gen-assets.ts (задача 127, шаг 2).
 *  frosty (CC0) берётся из vendor/frosty-rabbid/src/single, сгенерированные рисует icons-motifs.ts по силуэтам из vendor/game-icons.
 *  Без vendor/ сборка не падает: готовые sk_*.png в client/public/assets/icons остаются как есть (старая генерация их не трогает),
 *  а если файла ещё нет — работает старая генерация (newSkillIcon вернёт null). */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC } from "./canvas";
import { renderEntry, type IconEntry } from "./icons-motifs";
import { recolorFrosty, type Element, type Theme } from "./icons-frosty";
import { SKILLS } from "../../shared/skills";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
export type SkillIconEntry = { src: "frosty"; file: string; theme: Element } | IconEntry;
export const SKILL_ICON_TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, "data/skill-icons.json"), "utf8")) as Record<string, SkillIconEntry>;

/** Имя файла иконки → id записи таблицы (у arcane_shield файл sk_shield; sk_cleave — иконка роли в рейде). */
const byIcon = new Map<string, string>([["sk_cleave", "cleave"]]);
for (const s of Object.values(SKILLS)) byIcon.set(s.icon, s.id);

export function readPngPc(file: string): PC {
  const png = PNG.sync.read(fs.readFileSync(file));
  const pc = new PC(png.width, png.height);
  pc.data.set(png.data);
  return pc;
}
/** Темы оригинала по номеру иконки (смешанные: 76–80 листва и дерево, 81–84 огонь и малина). */
function sourceThemes(n: number): Theme[] {
  const r = (a: number, z: number) => n >= a && n <= z;
  if (r(76, 80)) return ["green", "sand"];
  if (r(81, 84)) return ["fire", "purple"];
  if (r(1, 5) || r(21, 25)) return ["green"];
  if (r(6, 10) || r(36, 40) || r(66, 70)) return ["blue"];
  if (r(11, 15) || r(41, 45) || r(61, 65)) return ["fire"];
  if (r(26, 30) || r(51, 55)) return ["sand"];
  if (r(46, 50) || r(96, 100)) return ["steel"];
  if (r(56, 60) || r(86, 90)) return ["olive"];
  return ["purple"];
}
/** Исходный вид (как у frosty): светлая синяя плашка и рамка. */
export function buildSkillIconRaw(id: string): PC {
  const e = SKILL_ICON_TABLE[id];
  if (!e) throw new Error(`нет иконки умения ${id}`);
  if (e.src !== "frosty") return renderEntry(e);
  const n = +e.file.replace(/D+/g, "");
  return recolorFrosty(readPngPc(path.join(ROOT, "vendor/frosty-rabbid/src/single", e.file + ".png")), sourceThemes(n), e.theme, (n >= 46 && n <= 50) || n >= 96);
}
/** PC новой иконки; "keep" — исходников нет, файл оставить; null — в таблице нет (рисует старая генерация). */
export function newSkillIcon(iconName: string, target: string): PC | "keep" | null {
  const id = byIcon.get(iconName);
  if (!id || !SKILL_ICON_TABLE[id]) return null;
  try { return buildSkillIcon(id); } catch { return fs.existsSync(target) ? "keep" : null; }
}

// ---------- затемнение под игру (палитровая перемапка, одинаково для всех 200 иконок) ----------
/** Плашка — между --well #0e0b10 и --card #1a141e, нейтрально-сливовая (без синевы frosty #1f244b). */
const NEW_PLATE: [number, number, number] = [19, 15, 23];
/** Рамка-фаска: приглушённая бронза сверху-слева, серо-сливовая снизу-справа (не ярче --line-hi #8a6a4a). */
const NEW_FRAME = { light: [134, 112, 92], mid: [104, 88, 74], dark: [66, 56, 66] } as const;
const OLD_PLATE = [0x1f, 0x24, 0x4b];
export function darkenIcon(src: PC): PC {
  const out = new PC(src.w, src.h);
  const isFrame = (x: number, y: number) => src.w === 24 && (x === 1 || x === 22 || y === 1 || y === 22) && x >= 1 && x <= 22 && y >= 1 && y <= 22;
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const c = src.get(x, y)!;
    if (!c[3]) continue;
    let n: number[];
    if (isFrame(x, y)) {
      const l = c[0] + c[1] + c[2];
      n = l > 600 ? [...NEW_FRAME.light] : l > 450 ? [...NEW_FRAME.mid] : [...NEW_FRAME.dark];
      if (x === 22 && y === 1 || x === 1 && y === 22) n = [...NEW_FRAME.mid];
    } else if (c[0] === OLD_PLATE[0] && c[1] === OLD_PLATE[1] && c[2] === OLD_PLATE[2]) n = [...NEW_PLATE];
    else {
      const L = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      const s = 0.66 + 0.3 * Math.pow(L / 255, 1.4);
      // насыщенность держим у ярких тонов, у тёмных (ступени ореола) тянем к нейтрально-сливовому
      const keep = Math.min(1, L / 150);
      const sat = 0.9 + 0.1 * keep;
      n = [0, 1, 2].map((i) => {
        const v = (L + (c[i] - L) * sat) * s;
        const plum = [34, 26, 40][i];
        return keep < 1 ? v * (0.78 + 0.22 * keep) + plum * (0.22 * (1 - keep)) : v;
      });
      const nl = 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2], pl = 0.299 * NEW_PLATE[0] + 0.587 * NEW_PLATE[1] + 0.114 * NEW_PLATE[2];
      if (nl < pl + 7) n = n.map((v, i) => v + (pl + 7 - nl) * (i === 0 ? 1.1 : i === 2 ? 1.0 : 0.95));
    }
    out.set(x, y, [Math.round(Math.min(255, n[0])), Math.round(Math.min(255, n[1])), Math.round(Math.min(255, n[2])), 255]);
  }
  return out;
}
/** Автоэкспозиция: у тусклых оригиналов (мазки тени, дуги) поднимаем яркость знака, чтобы он читался на тёмной плашке. */
function exposure(src: PC): PC {
  const ls: number[] = [];
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) { const c = src.get(x, y)!; if (c[0] === 0x1f && c[1] === 0x24 && c[2] === 0x4b) continue; ls.push(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]); }
  ls.sort((a, c) => a - c);
  const p = ls[Math.floor(ls.length * 0.92)] ?? 255;
  const k = p >= 175 ? 1 : Math.min(2.3, 175 / Math.max(60, p));
  if (k <= 1.02) return src;
  const out = src.clone();
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) { const c = src.get(x, y)!; if (c[0] === 0x1f && c[1] === 0x24 && c[2] === 0x4b) continue; out.set(x, y, [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k)), 255]); }
  return out;
}
export function buildSkillIcon(id: string): PC { return darkenIcon(exposure(buildSkillIconRaw(id))); }
