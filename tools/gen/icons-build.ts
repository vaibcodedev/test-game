/** Иконки умений из data/skill-icons.json для tools/gen-assets.ts (задача 127, шаг 2).
 *  frosty (CC0) берётся из vendor/frosty-rabbid/src/single, сгенерированные рисует icons-motifs.ts по силуэтам из vendor/game-icons.
 *  Без vendor/ сборка не падает: готовые sk_*.png в client/public/assets/icons остаются как есть (старая генерация их не трогает),
 *  а если файла ещё нет — работает старая генерация (newSkillIcon вернёт null). */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { PC } from "./canvas";
import { renderEntry, type IconEntry } from "./icons-motifs";
import { recolorFrosty, ELEMENT_RAMPS, type Element, type Theme } from "./icons-frosty";
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
export function darkenIcon(src: PC, theme?: string): PC {
  const warm = theme === "paladin";
  // плашка: середина тёмная (не почти чёрная) с лёгким оттенком стихии, без синевы frosty
  const tint = theme && theme in ELEMENT_RAMPS ? ELEMENT_RAMPS[theme as Element][3] : [0, 0, 0];
  const plate: [number, number, number] = warm ? [34, 26, 22] : [Math.round(30 + tint[0] * 0.05), Math.round(24 + tint[1] * 0.05), Math.round(34 + tint[2] * 0.05)];
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
    } else if (c[0] === OLD_PLATE[0] && c[1] === OLD_PLATE[1] && c[2] === OLD_PLATE[2]) n = [...plate];
    else {
      const L = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      const s = 0.92 + 0.12 * Math.pow(L / 255, 1.2);
      // насыщенность держим у ярких тонов, у тёмных (ступени ореола) тянем к нейтрально-сливовому
      const keep = Math.min(1, L / 150);
      const sat = 0.95 + 0.05 * keep;
      n = [0, 1, 2].map((i) => {
        const v = (L + (c[i] - L) * sat) * s;
        const plum = [34, 26, 40][i];
        return keep < 1 ? v * (0.9 + 0.1 * keep) + plum * (0.1 * (1 - keep)) : v;
      });
      const nl = 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2], pl = 0.299 * plate[0] + 0.587 * plate[1] + 0.114 * plate[2];
      if (nl < pl + 14) n = n.map((v, i) => v + (pl + 14 - nl) * (i === 0 ? 1.1 : i === 2 ? 1.0 : 0.95));
    }
    out.set(x, y, [Math.round(Math.min(255, n[0])), Math.round(Math.min(255, n[1])), Math.round(Math.min(255, n[2])), 255]);
  }
  return out;
}
/** Автоэкспозиция: у тусклых оригиналов (мазки тени, дуги) поднимаем яркость знака, чтобы он читался на тёмной плашке. */
function exposure(src: PC, target = 200): PC {
  const ls: number[] = [];
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) { const c = src.get(x, y)!; if (c[0] === 0x1f && c[1] === 0x24 && c[2] === 0x4b) continue; ls.push(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]); }
  ls.sort((a, c) => a - c);
  const p = ls[Math.floor(ls.length * 0.9)] ?? 255;
  const k = p >= target ? 1 : Math.min(3.6, target / Math.max(50, p));
  if (k <= 1.02) return src;
  const out = src.clone();
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) { const c = src.get(x, y)!; if (c[0] === 0x1f && c[1] === 0x24 && c[2] === 0x4b) continue; out.set(x, y, [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k)), 255]); }
  return out;
}
/** Утолщение тонких линий знака: яркие пиксели расходятся на соседние пустые клетки плашки (у оригиналов frosty с лентами в 1 px). */
function thicken(src: PC): PC {
  const out = src.clone(), plate = (c: number[]) => c[0] === 0x1f && c[1] === 0x24 && c[2] === 0x4b;
  for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) {
    const c = src.get(x, y)!;
    if (!c[3] || plate(c) || 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 60) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) { const n = src.get(x + dx, y + dy); if (n && x + dx < 22 && y + dy < 22 && (plate(n) || 0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2] < 70)) out.set(x + dx, y + dy, [Math.round(c[0] * 0.85), Math.round(c[1] * 0.85), Math.round(c[2] * 0.85), 255]); }
  }
  return out;
}
const p90 = (pc: PC) => { const l: number[] = []; for (let y = 2; y < 22; y++) for (let x = 2; x < 22; x++) { const c = pc.get(x, y)!; if (c[3]) l.push(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]); } l.sort((a, c) => a - c); return l[Math.floor(l.length * 0.9)]; };
export function buildSkillIcon(id: string): PC {
  const theme = (SKILL_ICON_TABLE[id] as { theme?: string }).theme, raw = buildSkillIconRaw(id);
  let out = darkenIcon(exposure(raw), theme);
  // тонкие линии и тусклые знаки: утолщить и осветлить до уровня соседей
  if (p90(out) < 135) out = darkenIcon(exposure(thicken(raw), 270), theme);
  return out;
}
