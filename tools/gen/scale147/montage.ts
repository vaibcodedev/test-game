/**
 * Задача 147: монтаж «было | стало» рядом с героем Б (30 px, tools/gen/hero147 — только чтение) → tools/out/scale147/.
 * Все фигуры стоят ступнями на одной линии, масштаб монтажа целый (×2, ×3).
 * Запуск: npx tsx tools/gen/scale147/montage.ts [путь к прежнему листу Колосса 80×80]
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { Cv, F, hx, label, type C } from "../bosses139/mino_lib";
F["0"] ??= "111,101,101,101,111"; F["6"] ??= "011,100,111,101,111"; F["9"] ??= "111,101,111,001,110"; F["7"] ??= "111,001,010,010,010"; F["8"] ??= "111,101,111,101,111";
F["1"] ??= "010,110,010,010,111"; F["2"] ??= "110,001,010,100,111"; F["3"] ??= "110,001,010,001,110"; F["4"] ??= "101,101,111,001,001"; F["5"] ??= "111,100,110,001,110";
import { renderFrame } from "../hero147/base_b";
import { A, ROOT, png } from "./measure";

const OUT = path.join(ROOT, "tools/out/scale147");
fs.mkdirSync(OUT, { recursive: true });
const sc = JSON.parse(fs.readFileSync(path.join(ROOT, "data/scale147.json"), "utf8"));
const man = JSON.parse(fs.readFileSync(path.join(A, "manifest.json"), "utf8"));
const BG = hx("#26242b"), GROUND = hx("#5f5a50"), LINE = hx("#3e3a34"), TXT = hx("#e8e0c8");

/** Кадр 0 (покой, вид вниз) листа → обрезка по силуэту. */
function frame0(file: string, fw: number, fh = fw): Cv {
  const p = png(file); const c = new Cv(fw, fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) { const i = (y * p.width + x) * 4; if (p.data[i + 3] > 40) c.set(x, y, [p.data[i], p.data[i + 1], p.data[i + 2]] as C); }
  return trim(c);
}
function trim(c: Cv): Cv {
  let x0 = c.w, y0 = c.h, x1 = -1, y1 = -1;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const o = new Cv(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (c.has(x, y)) o.set(x - x0, y - y0, c.get(x, y));
  return o;
}
const heroB = (): Cv => trim(renderFrame({ fac: "sol", sex: "m", hair: "tousled" } as any, "down", "idle", 0).img as Cv);
const unit = (id: string) => { const u = man.units[id]; return frame0(path.join(A, "units", `${id}.png`), u.frame, u.frameH ?? u.frame); };

/** ft — рядов силуэта ниже ступней (герой Б — 2: подошва и контур; прочие — 1, контур). */
interface Fig { img: Cv; cap: string; ft?: number }
/** Ряд фигур на общей земле: ступни на одной линии (линия земли), пунктир — макушка героя Б; подпись — рост до ступней, px. */
function row(title: string, figs: Fig[], k: number, file: string | null): Cv {
  const gap = 10, H = Math.max(...figs.map((f) => f.img.h)) * k;
  const W = figs.reduce((s, f) => s + Math.max(f.img.w * k, 60) + gap, gap);
  const c = new Cv(Math.max(W, 360), H + 70);
  c.d.fill(0); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) c.set(x, y, BG);
  label(c, 8, 6, title, 2);
  const base = 28 + H - 2 * k;
  for (let y = base; y < base + 14; y++) for (let x = 0; x < c.w; x++) c.set(x, y, y === base ? LINE : GROUND);
  // рост героя Б: пунктир по его макушке
  for (let x = 0; x < c.w; x += 4) for (let q = 0; q < k; q++) c.set(x + q, base - (hb.h - 2) * k, hx("#c8a040"));
  let x = gap;
  for (const f of figs) {
    const cw = Math.max(f.img.w * k, 60), ox = x + Math.floor((cw - f.img.w * k) / 2), oy = base - (f.img.h - (f.ft ?? 1)) * k;
    c.blit(f.img, ox, oy, k);
    label(c, x, base + 18, f.cap, 1);
    label(c, x, base + 30, `${f.img.h - (f.ft ?? 1)}`, 2);
    x += cw + gap;
  }
  if (file) save(c, path.join(OUT, file));
  return c;
}
function save(c: Cv, f: string) { const p = new PNG({ width: c.w, height: c.h }); p.data = Buffer.from(c.d); fs.writeFileSync(f, PNG.sync.write(p)); console.log("  " + path.relative(ROOT, f)); }

const hb = heroB();
const MOBS40 = process.env.MOBS40 === "1";
const H = (): Fig => ({ img: hb, cap: "ГЕРОЙ Б", ft: 2 });
// 1. Колосс: было (кадр 80) | стало (кадр 140)
const oldCol = process.argv[2];
if (!MOBS40 && oldCol && fs.existsSync(oldCol)) {
  row("КОЛОСС БЫЛО СТАЛО ГУРДАН РЕЙД ×2", [H(), { img: frame0(oldCol, 80), cap: "БЫЛО" }, H(), { img: unit("wb_colossus"), cap: "СТАЛО" }, { img: unit("sol_storm_colossus"), cap: "ГУРДАН" }, { img: unit("chaos_knight"), cap: "РЕЙД" }], 2, "colossus-before-after.png");
}
// 2. великаны партии 1: было | стало (под флагом)
if (!MOBS40) {
const pairs = Object.entries<string>(sc.remap).filter(([a]) => /^(ogre|troll)_/.test(a));
row("ОГРЫ И ТРОЛЛИ БЫЛО СТАЛО ×3", pairs.flatMap(([a, b]) => [{ img: unit(a), cap: "БЫЛО" }, { img: unit(b), cap: "СТАЛО" }]).concat([H()]), 3, "giants-before-after.png");
// 3. NPC и мобы зон 1–40 рядом с героем Б (стало = с заменами под флагом)
const line = ["merchant", "guard", "citizen1", "citizen2", "skeleton_sword", "boarfolk_axe", "zombie_digger", "wolffolk_chaser", "satyr_spear", "ghoul_eater", "hobgoblin_sword", "mummy_guard", "frogfolk_harpoon", "ratfolk_cutter", "goblin_slasher", "kobold_digger", "imp_fork", "ogre_woodcutter", "troll_brute"];
row("NPC И МОБЫ 1 40 БЫЛО ×3", [H(), ...line.map((id) => ({ img: unit(id), cap: id.slice(0, 9).toUpperCase() }))], 3, "npc-mobs-before.png");
row("NPC И МОБЫ 1 40 СТАЛО ×3", [H(), ...line.map((id) => { const n = sc.remap[id] ?? id; return { img: unit(n), cap: id.slice(0, 9).toUpperCase() }; })], 3, "npc-mobs-after.png");
}
// 4. партия 3, мобы 40–100: было | стало рядом с героем Б по линии ступней (один файл, три ряда: гуманоиды, великаны, звери)
if (MOBS40) {
  const stack = (title: string, cs: Cv[], file: string) => {
    const W = Math.max(...cs.map((c) => c.w)), Ht = cs.reduce((s, c) => s + c.h, 0);
    const o = new Cv(W, Ht); for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) o.set(x, y, BG);
    let y = 0; for (const c of cs) { o.blit(c, 0, y, 1); y += c.h; }
    save(o, path.join(OUT, file)); void title;
  };
  const pair = (ids: string[]): Fig[] => ids.flatMap((id) => { const n = sc.remap[id]; return n ? [{ img: unit(id), cap: "БЫЛО" }, { img: unit(n), cap: id.slice(0, 9).toUpperCase() }] : []; });
  const hum = ["orc_axe", "orc_bow_elite", "gnoll_chaser", "lizardfolk_javelin", "barbarian_axe", "barbarian_legion_elite", "harpy_scavenger", "fallen_spirit_warrior", "banshee_wail", "void_spirit_caster", "bone_witch_staff", "wrapped_construct_guard", "chaos_squire_halberd_elite", "chaos_spark_caster_elite", "skeleton_sword", "skeleton_bow_elite", "skeleton_mage"];
  const big = ["golem_sandstone", "golem_lava_elite", "golem_obsidian", "golem_magma", "golem_siege_elite", "ice_golem_ice", "ice_golem_ice_elite", "butcher_cleaver", "butcher_hook_elite"];
  const beasts = ["canine_wolf", "canine_frost_elite", "boar_boar", "rat_rat", "bat_bat", "spider_biter", "beetle_armored", "lizard_horned", "basilisk_cave", "arthro_scorpion", "crawler_crawler", "grove_ent", "grove_mushroom", "slime_jelly"];
  stack("", [
    row("МОБЫ 40 100: ГУМАНОИДЫ БЫЛО СТАЛО ×2", [H(), ...pair(hum)], 2, null),
    row("ВЕЛИКАНЫ БЫЛО СТАЛО ×2", [H(), ...pair(big)], 2, null),
    row("ЗВЕРИ БЫЛО СТАЛО ×2", [H(), ...pair(beasts)], 2, null),
  ], "mobs40-100.png");
}
// 5. партия 3, остаток: старые листы данжа 85–95 и призывы чернокнижника — было | стало (REST=1)
if (process.env.REST === "1") {
  const pair = (ids: string[]): Fig[] => ids.flatMap((id) => { const n = sc.remap[id]; return n ? [{ img: unit(id), cap: "БЫЛО" }, { img: unit(n), cap: id.slice(0, 9).toUpperCase() }] : []; });
  row("ДАНЖ 85 95 И ПРИЗЫВЫ БЫЛО СТАЛО ×3", [H(), ...pair(["skeleton", "skeleton_knight", "drowned", "imp", "wl_skeleton"]), { img: unit("wl_demon"), cap: "WL_DEMON" }], 3, "dungeon-summons.png");
}
