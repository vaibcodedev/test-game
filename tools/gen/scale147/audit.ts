/**
 * Задача 147: аудит роста юнитов, маунтов и объектов относительно героя Б (30 px) → docs/art/scale.md (таблицы между
 * маркерами AUDIT:BEGIN/END; остальной текст документа не трогается).
 * Рост — высота непрозрачного силуэта (alpha > 40): юниты — медиана кадров покоя вида «вниз», маунты — кадр покоя,
 * объекты — вся картинка. Цели по классам — CLASSES ниже (план задачи 147).
 * Запуск: npx tsx tools/gen/scale147/audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { A, ROOT, bbox, png, unitHeight } from "./measure";

const HERO = 34; // силуэт героя Б (32 до ступней)
const man = JSON.parse(fs.readFileSync(path.join(A, "manifest.json"), "utf8"));
const sc = JSON.parse(fs.readFileSync(path.join(ROOT, "data/scale147.json"), "utf8"));
const mobs = JSON.parse(fs.readFileSync(path.join(ROOT, "data/mobs.json"), "utf8")).mobs;

// зона моба по разделу data/mobs.json
const zoneOf = new Map<string, string>();
{
  let cur = "1–40";
  for (const [k, v] of Object.entries<any>(mobs)) {
    if (k.startsWith("_")) { const m = String(v).match(/^(.*?)\s(\d+–\d+)/); cur = m ? m[2] : String(v).startsWith("Звери") ? "звери" : cur; if (String(v).includes("партия 1")) cur = "1–40"; continue; }
    for (const s of [v.sprite, v.eliteSprite, `${v.sprite}_elite`]) if (s && !zoneOf.has(s)) zoneOf.set(s, cur);
  }
}

interface Cls { name: string; lo: number; hi: number; re: RegExp; note?: string }
const CLASSES: Cls[] = [
  // цели — силуэт с подошвой и контуром (герой Б: 34 = 32 до ступней + 2); решения владельца 30.10: гуманоиды 32 ±2 до ступней, малые расы ¾,
  // огры, тролли, големы 1,4–1,7 роста, боссы зон 1,5–2, кольца 2–2,5, рейд ≈ 3,5, Колосс ≈ 4; боссы-люди 1,2–1,4 (вручную)
  { name: "мировой босс", lo: 120, hi: 136, re: /^wb_colossus$/, note: "≈ 4 роста героя" },
  { name: "рейд-босс", lo: 106, hi: 118, re: /^chaos_knight$/, note: "≈ 3,5, ниже Колосса" },
  { name: "спутник босса", lo: 0, hi: 999, re: /_(cage|mirage|banner|bearer)$/, note: "по боссу" },
  { name: "свечение", lo: 0, hi: 999, re: /_glow$/, note: "маска" },
  { name: "герой (заменяет основа Б)", lo: 34, hi: 34, re: /^(nude_.*|warrior|mage|ranger|healer|rogue|deathknight|bloodweaver|darkranger|warlock|reaver)$/ },
  { name: "NPC", lo: 32, hi: 36, re: /^(merchant|arenamaster|guard|citizen\d|keeper_.*)$/, note: "как герой" },
  { name: "босс зоны", lo: 50, hi: 66, re: /^(sol_(chained_beast|forest_warden|raider_chief|rune_golem)|umb_(ash_minotaur|fog_treant|marsh_abomination|revenant_reaper))$/, note: "1,5–2 роста" },
  { name: "босс кольца", lo: 66, hi: 82, re: /^(sol_|umb_|plg_)|^(witch|ashlord)$/, note: "2–2,5 роста; боссы-люди 1,2–1,4" },
  { name: "питомец", lo: 0, hi: 999, re: /^pet_/, note: "в игре ×0,8; звери на ~20 % крупнее жизни" },
  { name: "призыв", lo: 32, hi: 56, re: /^wl_/ },
  { name: "крупный (огр, тролль, голем)", lo: 47, hi: 56, re: /^(ogre|troll|golem|ice_golem|ent$|butcher)/, note: "1,4–1,7 роста" },
  { name: "малый народ", lo: 24, hi: 28, re: /^(goblin|kobold|imp)/, note: "¾ роста героя" },
  { name: "зверь, мелочь", lo: 0, hi: 999, re: /^(rat_|boar_|bat_|canine_|spider_|beetle|slime|crawler|lizard_|basilisk|arthro_|grove_|sapling)/, note: "на ~20 % крупнее жизненных пропорций" },
  { name: "гуманоид", lo: 32, hi: 36, re: /./, note: "32 ±2 до ступней" },
];
const clsOf = (id: string) => CLASSES.find((c) => c.re.test(id))!;
const verdict = (h: number, c: Cls) => (c.hi >= 999 || c.lo === 0 ? "ок" : h < c.lo - 1 ? `мал (−${c.lo - h})` : h > c.hi + 1 ? `велик (+${h - c.hi})` : "ок");

// ---------------- юниты ----------------
const rows: string[] = [];
const units = Object.entries<any>(man.units).filter(([id]) => !id.endsWith(sc.suffix));
const byCls = new Map<string, string[]>();
for (const [id, u] of units) {
  const f = path.join(A, "units", id + ".png");
  if (!fs.existsSync(f)) continue;
  const fw = u.frame, fh = u.frameH ?? u.frame;
  const r = unitHeight(f, fw, fh);
  const c = clsOf(id);
  const b147 = sc.remap[id] && man.units[sc.remap[id]] ? unitHeight(path.join(A, "units", sc.remap[id] + ".png"), man.units[sc.remap[id]].frame, man.units[sc.remap[id]].frame).h : 0;
  const tgt = c.hi >= 999 ? (c.note ?? "—") : c.lo === c.hi ? `${c.lo}` : `${c.lo}–${c.hi}`;
  const v = b147 ? `стало ${b147} — ${verdict(b147, c)} (под флагом)` : verdict(r.h, c);
  const line = `| ${id} | ${zoneOf.get(id) ?? ""} | ${fw}${fh !== fw ? "×" + fh : ""} | ${r.h} | ${(r.h / HERO).toFixed(2)} | ${tgt} | ${v}${r.edge ? ", край кадра" : ""} |`;
  (byCls.get(c.name) ?? byCls.set(c.name, []).get(c.name)!).push(line);
}
for (const c of CLASSES) {
  const ls = byCls.get(c.name); if (!ls) continue;
  rows.push(`\n#### ${c.name}${c.note ? ` (${c.note})` : ""}\n`, "| лист | зона | кадр | рост, px | × героя | цель, px | вывод |", "|---|---|---|---|---|---|---|", ...ls);
}

// ---------------- маунты ----------------
const mrows: string[] = ["| маунт | лист | кадр | рост без всадника, px | × героя | класс и цель, px | вывод |", "|---|---|---|---|---|---|---|"];
for (const [id, u] of Object.entries<any>(man.mounts ?? {})) {
  const f = path.join(A, "mounts", `${u.sheet ?? id}.png`);
  if (!fs.existsSync(f)) { mrows.push(`| ${id} | ${u.sheet ?? id} | ${u.frame} | нет листа | | | |`); continue; }
  const b = bbox(png(f), (u.idle ?? 0) * u.frame, 0, u.frame, u.frame);
  const h = b ? u.gy - b.y0 : 0;
  // полный рост без всадника: конь и волк — до ушей ≈ 1,3–1,7 героя; тяжёлые звери 1,9–2,7; летуны 1,6–2,4
  const sh = String(u.sheet ?? id), cl = /mammoth|elephant|rhino/.test(sh) ? ["тяжёлый", 56, 80] : u.fly || /drake|gryphon|griffin|owl|phoenix|dragon/.test(sh) ? ["летун", 48, 72] : ["конь, зверь", 40, 52];
  const [, lo, hi] = cl as [string, number, number];
  mrows.push(`| ${id} | ${sh} | ${u.frame} | ${h} | ${(h / HERO).toFixed(2)} | ${cl[0]} ${lo}–${hi} | ${h < lo ? "мал" : h > hi ? "велик" : "ок"} |`);
}

// ---------------- объекты ----------------
interface OCls { name: string; lo: number; hi: number; re: RegExp; note: string }
const OCLS: OCls[] = [
  { name: "двери, ворота, арки, проходы", lo: 36, hi: 200, re: /door|gate|arch|portal|entrance|exit/, note: "проём ≥ 34 px (герой 30 + запас)" },
  { name: "деревья", lo: 70, hi: 160, re: /tree|pine|oak|birch|willow|spruce|palm|dead_tree|^v_trees/, note: "2,5–5 роста героя" },
  { name: "здания", lo: 70, hi: 400, re: /house|hall|tower|temple|bank|shop|smith|tavern|inn|barracks|keep|castle|chapel|church|crypt|mill|shrine|citadel|fort|hut|tent|pal_/, note: "этаж ≈ 1,3 героя (40 px), дверь 36" },
  { name: "колонны, столбы, статуи", lo: 45, hi: 140, re: /column|pillar|statue|obelisk|totem|banner|standard|lamp|post/, note: "1,5–4 роста героя" },
  { name: "стены, частоколы, заборы", lo: 18, hi: 120, re: /wall|palisade|fence|rampart/, note: "забор 18–24, стена ≥ 40" },
  { name: "мелкие предметы", lo: 8, hi: 30, re: /barrel|crate|box|chest|sack|bag|pot|urn|anvil|bucket|basket|stool|chair|bench|table|bed|rack|dummy|cart|wagon|bush|rock|stone|mushroom|flower|grass|skull|bone|well|fountain/, note: "по реальной пропорции к человеку" },
];
const objRows = new Map<string, { id: string; h: number; w: number; n: number }[]>();
const seen = new Map<string, { id: string; h: number; w: number; n: number }>();
for (const id of Object.keys(man.objects)) {
  const base = id.split("__")[0];
  const s = seen.get(base); if (s) { s.n++; continue; }
  const f = path.join(A, "objects", id + ".png");
  if (!fs.existsSync(f)) continue;
  const p = png(f); const b = bbox(p, 0, 0, p.width, p.height);
  seen.set(base, { id: base, h: b?.h ?? 0, w: b?.w ?? 0, n: 1 });
}
const other: string[] = [];
for (const o of seen.values()) {
  const c = OCLS.find((q) => q.re.test(o.id));
  if (!c) { other.push(`${o.id} ${o.h}`); continue; }
  (objRows.get(c.name) ?? objRows.set(c.name, []).get(c.name)!).push(o);
}
const orows: string[] = [];
for (const c of OCLS) {
  const ls = (objRows.get(c.name) ?? []).sort((a, b) => b.h - a.h);
  const bad = ls.filter((o) => o.h < c.lo || o.h > c.hi);
  orows.push(`\n#### ${c.name} — цель ${c.lo}–${c.hi} px (${c.note}); всего ${ls.length}, вне цели ${bad.length}\n`,
    `| объект | вар. | рост, px | ширина | × героя | вывод |`, "|---|---|---|---|---|---|",
    ...ls.map((o) => `| ${o.id} | ${o.n} | ${o.h} | ${o.w} | ${(o.h / HERO).toFixed(2)} | ${o.h < c.lo ? "мал" : o.h > c.hi ? "велик" : "ок"} |`));
}
orows.push(`\n#### прочее (без класса, ${other.length}): рост px\n`, other.sort().join(", "));

const body = [
  `<!-- AUDIT:BEGIN — генерирует tools/gen/scale147/audit.ts, руками не править -->`,
  `\n### Юниты (${units.length} листов)`, ...rows,
  `\n### Маунты (${Object.keys(man.mounts ?? {}).length})\n`, ...mrows,
  `\n### Объекты (${seen.size} видов, ${Object.keys(man.objects).length} с вариантами)`, ...orows,
  `<!-- AUDIT:END -->`,
].join("\n");
const doc = path.join(ROOT, "docs/art/scale.md");
let text = fs.existsSync(doc) ? fs.readFileSync(doc, "utf8") : "";
text = text.includes("<!-- AUDIT:BEGIN") ? text.replace(/<!-- AUDIT:BEGIN[\s\S]*<!-- AUDIT:END -->/, () => body) : text + "\n" + body + "\n";
fs.writeFileSync(doc, text);
console.log(`  аудит: юнитов ${units.length}, маунтов ${Object.keys(man.mounts ?? {}).length}, объектов ${seen.size} → docs/art/scale.md`);
