/**
 * Задача 147, партия 3 (остаток): призыв чернокнижника «Скелет-прислужник» под рост героя Б — лист wl_skeleton_b147 (+ _glow) в кадре 40.
 * Тот же генератор tools/gen/pets/warlock.ts, тело масштабируется в сцене до рендера (Creature.scale), кадр больше — масштаб целый, без setScale.
 * Демон (wl_demon, 37 px, 1,1 героя) — в цели, не перерисовывается. Параметры — data/scale147.json → pets.wl_skeleton { scale, N }.
 * Пишет: client/public/assets/units/wl_skeleton_b147(.png, _glow.png), manifest.json units, data/unit-anims.json (раскладка), remap.
 * Запуск: npx tsx tools/gen/scale147/warlock-b.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPet, camN, saveSheets, type Pet } from "../pets/petlib";
import { skeletonPet } from "../pets/warlock";
import { A, ROOT, unitHeight } from "./measure";

const DF = path.join(ROOT, "data/scale147.json");
const DATA = JSON.parse(fs.readFileSync(DF, "utf8"));
const SUF = DATA.suffix as string;
const P = DATA.pets.wl_skeleton as { scale: number; N: number };
const UNITS = path.join(A, "units"), MAN = path.join(A, "manifest.json"), UA = path.join(ROOT, "data/unit-anims.json");

const id = skeletonPet.id, nid = `${id}${SUF}`;
const pet: Pet = { ...skeletonPet, id: nid, cr: { ...skeletonPet.cr, scale: [P.scale, P.scale] }, cam: camN(P.N), shadow: skeletonPet.shadow * P.scale };
const o = buildPet(pet);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s147wl-"));
saveSheets(o, tmp);
const lay = JSON.parse(fs.readFileSync(path.join(tmp, `${nid}.json`), "utf8"));
for (const f of [`${nid}.png`, `${nid}_glow.png`]) fs.copyFileSync(path.join(tmp, f), path.join(UNITS, f));
fs.rmSync(tmp, { recursive: true, force: true });

// каталог — правкой текста (формат файла общий): кадр листа и маски
let utext = fs.readFileSync(MAN, "utf8");
const nl = utext.includes("\r\n") ? "\r\n" : "\n";
for (const k of [nid, `${nid}_glow`]) {
  const re = new RegExp(`("${k}": \\{\\s*"frame": )\\d+`);
  if (re.test(utext)) utext = utext.replace(re, `$1${P.N}`);
  else utext = utext.replace(/"units": \{\r?\n/, (m) => `${m}  "${k}": {${nl}   "frame": ${P.N}${nl}  },${nl}`);
}
JSON.parse(utext);
fs.writeFileSync(MAN, utext);

const ua = JSON.parse(fs.readFileSync(UA, "utf8"));
ua[nid] = { ...ua[id], anims: lay.anims };
fs.writeFileSync(UA, JSON.stringify(ua, null, 1) + "\n");

const fresh = JSON.parse(fs.readFileSync(DF, "utf8"));
fresh.remap = Object.fromEntries(Object.entries({ ...fresh.remap, [id]: nid }).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(DF, JSON.stringify(fresh, null, 2) + "\n");

const was = unitHeight(path.join(UNITS, `${id}.png`), 32, 32), now = unitHeight(path.join(UNITS, `${nid}.png`), P.N, P.N);
console.log(`  ${nid}: рост ${was.h} → ${now.h} px (кадр 32 → ${P.N})${now.edge ? " — КРАЙ КАДРА" : ""}`);
for (const p of o.problems.slice(0, 12)) console.warn(`  ${p}`);
console.log(o.problems.length ? `  замечаний по кадрам: ${o.problems.length}` : "  кадры чисты");
if (o.problems.length) process.exitCode = 1;
