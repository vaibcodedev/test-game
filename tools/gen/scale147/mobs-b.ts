/**
 * Задача 147, масштаб под героя Б (30 px): мобы, перерисованные через генератор (риг tools/gen/mobs) в большем кадре —
 * масштаб только целый, setScale не используется. Листы кладутся рядом с прежними как <вариант>_b147.png и включаются
 * заменой спрайта по флагу data/hero-b.json → enabled; список замен скрипт пишет в data/scale147.json → remap.
 * Параметры — data/scale147.json → mobs.rig: k (множитель к прежнему росту) или scale (явно), cam (кадр).
 * Запуск: npx tsx tools/gen/scale147/mobs-b.ts [ogre,troll,...]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCreature, camOf, type Creature } from "../mobs/rig";
import { BATCH1 } from "../mobs/batch1-list";
import { A, ROOT, unitHeight } from "./measure";

const DF = path.join(ROOT, "data/scale147.json");
const DATA = JSON.parse(fs.readFileSync(DF, "utf8"));
const SUF = DATA.suffix as string;
const BASE: Record<string, Creature> = Object.fromEntries(BATCH1.map((c) => [c.id, c]));
const only = process.argv[2]?.split(",");
const UNITS = path.join(A, "units"), MAN = path.join(A, "manifest.json");

/** Запись юнита в общий каталог — правкой текста (формат файла общий, не переписываем его целиком). */
let utext = fs.readFileSync(MAN, "utf8");
const setUnit = (id: string, frame: number) => {
  const nl = utext.includes("\r\n") ? "\r\n" : "\n";
  const re = new RegExp(`("${id}": \\{\\s*"frame": )\\d+`);
  if (re.test(utext)) utext = utext.replace(re, `$1${frame}`);
  else utext = utext.replace(/"units": \{\r?\n/, (m) => `${m}  "${id}": {${nl}   "frame": ${frame}${nl}  },${nl}`);
};

let problems = 0;
const remap: Record<string, string> = { ...DATA.remap };
// split — роли со своим ростом (длинный выпад не помещается в кадр 40): { roles, scale }
const passes: [string, any, string[] | null][] = [];
for (const [key, def] of Object.entries<any>(DATA.mobs.rig)) {
  if (only && !only.includes(key)) continue;
  const sp = def.split as { roles: string[]; scale: [number, number] } | undefined;
  passes.push([key, def, sp ? sp.roles.map((r) => '!' + r) : null]);
  if (sp) passes.push([key, { ...def, scale: sp.scale }, sp.roles]);
}
for (const [key, def, roleSel] of passes) {
  const base0 = BASE[key]; if (!base0) { console.warn(`  нет образа ${key}`); continue; }
  const base: Creature = roleSel ? { ...base0, roles: base0.roles.filter((r) => roleSel.some((q) => (q.startsWith('!') ? q.slice(1) !== r.id : q === r.id)) && !roleSel.some((q) => q === '!' + r.id)) } : base0;
  const scale = (def.scale ?? base.scale.map((s: number) => +(s * def.k).toFixed(3))) as [number, number];
  const cr: Creature = { ...base, scale, cam: def.cam, attackN: def.attackN ?? DATA.mobs.attackN };
  const N0 = camOf(base).N;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s147-"));
  const o = buildCreature(cr, tmp);
  problems += o.problems.length;
  for (const p of o.problems.slice(0, 12)) console.warn(`  ${p}`);
  for (const id of o.sheets.keys()) {
    const nid = `${id}${SUF}`, dst = path.join(UNITS, `${nid}.png`);
    fs.copyFileSync(path.join(tmp, `${id}.png`), dst);
    setUnit(nid, def.cam.N);
    remap[id] = nid;
    const was = unitHeight(path.join(UNITS, `${id}.png`), N0, N0), now = unitHeight(dst, def.cam.N, def.cam.N);
    console.log(`  ${nid}: рост ${was.h} → ${now.h} px (кадр ${N0} → ${def.cam.N})${now.edge ? " — КРАЙ КАДРА" : ""}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
JSON.parse(utext);
fs.writeFileSync(MAN, utext);
const fresh = JSON.parse(fs.readFileSync(DF, "utf8"));
fresh.remap = Object.fromEntries(Object.entries(remap).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(DF, JSON.stringify(fresh, null, 2) + "\n");
console.log(problems ? `  замечаний по кадрам: ${problems}` : "  кадры чисты");
if (problems) process.exitCode = 1;
