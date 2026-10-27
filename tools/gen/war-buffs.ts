/** Значки бафов земли «Знамён Предела» (задача 132, шаг 14): 24×24, как значки эффектов (client/public/assets/icons).
 *  Общая рамка по фракции — Сольгард: золотая кайма на синем с солнцем в углу; Умбрат: пурпурно-чёрная кайма с черепом в короне в углу.
 *  Внутри — свой знак бонуса: монета и книга (опыт и золото), сапог (скорость), флажок (возрождение у заставы), скрещённые мечи (отряды),
 *  наковальня с рудой (материалы), сундук (добыча данжа), таран (неделя после осады). Ключи аур — war_<бонус>_<sol|umb> (shared/auras.ts).
 *  Запуск: npx tsx tools/gen/war-buffs.ts [--sheet] (лист сравнения — tools/out/banners-event/buff-icons.png). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PC, hex, type RGBA } from "./canvas";
import { OUT } from "./walls141-lib";
import { scaleNN, label } from "./standards";

export const WAR_BUFFS = ["xpGold", "speed", "respawn", "squads", "mats", "dungeon", "siege"] as const;
type Buff = (typeof WAR_BUFFS)[number];
type F = "sol" | "umb";

const GOLD = ["#3a2408", "#6a4210", "#a8681c", "#e0a630", "#ffd864", "#fff2b0"].map((c) => hex(c));
const PURP = ["#0e0814", "#24163a", "#4a2a66", "#7a52a8", "#b890ff", "#e4d4ff"].map((c) => hex(c));
const IRON = ["#141218", "#3c3a48", "#5e5c6c", "#8a8898", "#c8c6d2"].map((c) => hex(c));
const WOOD = ["#24140c", "#5e3a20", "#82552e", "#a87442"].map((c) => hex(c));
const BONE: RGBA = hex("#ece6f4");

/** Знак по строкам: символ → цвет, «.» — пусто. */
function stamp(pc: PC, x0: number, y0: number, rows: string[], pal: Record<string, RGBA>) {
  rows.forEach((r, j) => [...r].forEach((ch, i) => { const c = pal[ch]; if (c) pc.set(x0 + i, y0 + j, c); }));
}
const SYM: Record<Buff, { rows: string[]; pal: (f: F) => Record<string, RGBA> }> = {
  xpGold: {
    rows: [
      "......aaaa....",
      ".....abbbba...",
      "....abccccba..",
      "....abcddcba..",
      "....abcddcba..",
      "....abccccba..",
      "eeeeeabbbba...",
      "effffeaaaa....",
      "efgggfe.......",
      "efgggfe.......",
      "efgggfe.......",
      "effffee.......",
      "eeeeeee.......",
    ],
    pal: () => ({ a: GOLD[1], b: GOLD[3], c: GOLD[4], d: GOLD[5], e: WOOD[0], f: WOOD[2], g: hex("#efe6d2") }),
  },
  speed: {
    rows: [
      "......aaaa....",
      "......abba....",
      "......abba....",
      "......abba....",
      "......abba....",
      "c.c...abba....",
      ".c.c..abbaaa..",
      "c.c..abbbbbba.",
      ".....abbbbbbba",
      ".....aaaaaaaaa",
      ".....ddddddddd",
    ],
    pal: (f) => ({ a: WOOD[0], b: WOOD[2], c: f === "sol" ? GOLD[4] : PURP[4], d: IRON[2] }),
  },
  respawn: {
    rows: [
      "a.............",
      "abbbbbbbb.....",
      "abcccccccb....",
      "abcccccccb....",
      "abcccdcccb....",
      "abcccccccb....",
      "abbbbbbbbb....",
      "a.............",
      "a.............",
      "a.............",
      "a.............",
      "ee............",
    ],
    pal: (f) => ({ a: GOLD[3], b: f === "sol" ? GOLD[4] : IRON[4], c: f === "sol" ? hex("#2a5aa8") : PURP[2], d: f === "sol" ? GOLD[5] : BONE, e: IRON[2] }),
  },
  squads: {
    rows: [
      "a...........a.",
      ".ab.......ba..",
      "..ab.....ba...",
      "...ab...ba....",
      "....ab.ba.....",
      ".....aba......",
      ".....bab......",
      "....ba.ab.....",
      "..cba...abc...",
      "...c.....c....",
      "..d.......d...",
      ".d.........d..",
    ],
    pal: () => ({ a: IRON[4], b: IRON[2], c: GOLD[3], d: WOOD[2] }),
  },
  mats: {
    rows: [
      "........ef....",
      ".......efff...",
      "........ff....",
      "aaaaaaaaaa....",
      "abbbbbbbbbaa..",
      ".abbbbbbbbbba.",
      "..aaaaaaaaaa..",
      "....abbbba....",
      "....abbbba....",
      "...aabbbbaa...",
      "..abbbbbbbba..",
      "..aaaaaaaaaa..",
    ],
    pal: () => ({ a: IRON[0], b: IRON[2], e: hex("#ff9a2e"), f: hex("#c85a10") }),
  },
  dungeon: {
    rows: [
      "..aaaaaaaaaa..",
      ".abbbbbbbbbba.",
      "abbbbbbbbbbbba",
      "accccccccccca.",
      "addddddddddda.",
      "abbbbbeebbbba.",
      "abbbbbeebbbba.",
      "abbbbbbbbbbba.",
      "addddddddddda.",
      "aaaaaaaaaaaaa.",
    ],
    pal: () => ({ a: WOOD[0], b: WOOD[2], c: WOOD[3], d: GOLD[3], e: GOLD[5] }),
  },
  siege: {
    rows: [
      "..............",
      "aa............",
      "abbbbbbbbbbb..",
      "accccccccccbb.",
      "abbbbbbbbbbbbd",
      "accccccccccbb.",
      "abbbbbbbbbbb..",
      "aa............",
      "...ee....ee...",
      "..effe..effe..",
      "...ee....ee...",
    ],
    pal: () => ({ a: IRON[3], b: WOOD[2], c: WOOD[1], d: IRON[4], e: WOOD[0], f: IRON[2] }),
  },
};

export function buffIcon(b: Buff, f: F): PC {
  const pc = new PC(24, 24);
  const R = f === "sol" ? GOLD : PURP, bg: RGBA = f === "sol" ? hex("#16264a") : hex("#160e22"), bg2: RGBA = f === "sol" ? hex("#20366a") : hex("#24163a");
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const e = Math.min(x, y, 23 - x, 23 - y);
    pc.set(x, y, e === 0 ? OUT : e === 1 ? R[x + y < 23 ? 4 : 2] : e === 2 ? R[1] : y < 12 ? bg2 : bg);
  }
  const s = SYM[b];
  const w = Math.max(...s.rows.map((r) => r.length)), h = s.rows.length;
  stamp(pc, Math.round((24 - w) / 2) + 1, Math.round((24 - h) / 2) + 1, s.rows, s.pal(f));
  // угол: солнце Сольгарда / череп в короне Умбрата
  if (f === "sol") stamp(pc, 0, 0, ["..a..", ".bbb.", "abcba", ".bbb.", "..a.."], { a: GOLD[3], b: GOLD[4], c: GOLD[5] });
  else stamp(pc, 0, 0, ["a.a.a", "aaaaa", ".bbb.", ".kbk.", ".bbb."], { a: IRON[3], b: BONE, k: PURP[0] });
  return pc;
}

export function writeWarBuffIcons(iconsDir: string): string[] {
  const ids: string[] = [];
  for (const b of WAR_BUFFS) for (const f of ["sol", "umb"] as F[]) { const id = `war_${b}_${f}`; buffIcon(b, f).save(path.join(iconsDir, `${id}.png`)); ids.push(id); }
  return ids;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  console.log("значки бафов:", writeWarBuffIcons(path.join(root, "client/public/assets/icons")).length);
  if (process.argv.includes("--sheet")) {
    const out = new PC(WAR_BUFFS.length * 80 + 20, 200);
    out.rect(0, 0, out.w, out.h, [22, 19, 26, 255]);
    label(out, "БАФЫ ЗЕМЛИ: СОЛЬГАРД / УМБРАТ, X3", 10, 8, [236, 230, 244, 255], 2);
    WAR_BUFFS.forEach((b, i) => { out.blit(scaleNN(buffIcon(b, "sol"), 3), 10 + i * 80, 30); out.blit(scaleNN(buffIcon(b, "umb"), 3), 10 + i * 80, 110); });
    fs.mkdirSync(path.join(root, "tools/out/banners-event"), { recursive: true });
    out.save(path.join(root, "tools/out/banners-event/buff-icons.png"));
  }
}
