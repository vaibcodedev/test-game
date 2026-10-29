/**
 * Зверинец (задача 150) → игра: листы питомцев и смотрителей, иконки питомцев и «Печати питомца».
 * - питомцы data/pets.json: tools/out/pets/sheets/<id>.png (+ _glow, .json раскладка) → client/public/assets/units/pet_<id>.png,
 *   manifest.units, data/unit-anims.json (масштаб 1 — взрослые звери в росте героя); иконка tools/out/pets/icons/pet_<id>.png → assets/icons;
 * - печать: медальон 7Soul1 (seal.base, подгонка icons-items adapt) → assets/icons/pet_seal.png; печать питомца pseal_<id> —
 *   медальон и уменьшенный питомец в углу (sealIconFor, как у «Печати скакуна», но другая основа);
 * - смотрители зверинца: tools/out/warlock-pets/sheets/keeper_sol|keeper_umb → assets/units (NPC с живым покоем, GameScene.addNpc).
 * Арт питомцев дорабатывает tools/gen/pets: после нового прогона — снова этот скрипт (замена одной заменой файлов).
 * Запуск: npx tsx tools/gen/pet-menagerie.ts [--preview]  (--preview — только tools/out/pets-menagerie/seals.png, в игру не кладёт)
 */
import fs from "node:fs";
import path from "node:path";
import { adapt, sealIconFor } from "./icons-items";
import { readPng, scaleNN, ROOT } from "./vendor-lib";
import { PC } from "./canvas";

const SEAL_BASE = (process.argv.find((a) => a.startsWith("--base=")) ?? "--base=Ac_Medal03").slice(7);
const PETS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pets.json"), "utf8")).pets as Record<string, { sprite: string }>;
const SHEETS = path.join(ROOT, "tools", "out", "pets", "sheets");
const ICONS_SRC = path.join(ROOT, "tools", "out", "pets", "icons");
const KEEPERS = path.join(ROOT, "tools", "out", "warlock-pets", "sheets");
const ASSETS = path.join(ROOT, "client", "public", "assets");
const MAN = path.join(ASSETS, "manifest.json");
const DATA = path.join(ROOT, "data", "unit-anims.json");
const preview = process.argv.includes("--preview");

const seal = adapt(readPng(path.join(ROOT, "vendor", "7soul1", "src", `${SEAL_BASE}.png`)));
const sealOf = (id: string) => sealIconFor(seal, readPng(path.join(ICONS_SRC, `pet_${id}.png`)));

if (preview) {
  const ids = Object.keys(PETS).filter((id) => fs.existsSync(path.join(ICONS_SRC, `pet_${id}.png`)));
  const out = new PC(ids.length * 100 + 100, 100);
  [seal, ...ids.map(sealOf)].forEach((ic, i) => {
    const b = scaleNN(ic, 3);
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const c = b.get(x, y); if (c && c[3]) out.set(i * 100 + 2 + x, 2 + y, c); }
  });
  const dir = path.join(ROOT, "tools", "out", "pets-menagerie");
  fs.mkdirSync(dir, { recursive: true });
  out.save(path.join(dir, "seals.png"));
  console.log("  →", path.join(dir, "seals.png"));
  process.exit(0);
}

const man = JSON.parse(fs.readFileSync(MAN, "utf8")) as { units: Record<string, { frame: number }>; icons: string[] };
const anims = JSON.parse(fs.readFileSync(DATA, "utf8")) as Record<string, unknown>;
const icons = new Set(man.icons);
const put = (srcDir: string, id: string, key: string, scale: number) => {
  const lay = JSON.parse(fs.readFileSync(path.join(srcDir, `${id}.json`), "utf8")) as { frame: number; anims: Record<string, unknown> };
  fs.copyFileSync(path.join(srcDir, `${id}.png`), path.join(ASSETS, "units", `${key}.png`));
  const glow = fs.existsSync(path.join(srcDir, `${id}_glow.png`));
  if (glow) {
    fs.copyFileSync(path.join(srcDir, `${id}_glow.png`), path.join(ASSETS, "units", `${key}_glow.png`));
    man.units[`${key}_glow`] = { frame: lay.frame };
  }
  man.units[key] = { frame: lay.frame };
  anims[key] = { scale, glow, anims: lay.anims };
  console.log(`  ${key}: кадр ${lay.frame}, анимации ${Object.keys(lay.anims).join(", ")}`);
};
for (const [id, d] of Object.entries(PETS)) {
  if (!fs.existsSync(path.join(SHEETS, `${id}.json`))) { console.log(`  ${id}: листа нет — пропуск`); continue; }
  put(SHEETS, id, d.sprite, 1);
  const ic = path.join(ICONS_SRC, `pet_${id}.png`);
  if (fs.existsSync(ic)) {
    fs.copyFileSync(ic, path.join(ASSETS, "icons", `${d.sprite}.png`));
    sealOf(id).save(path.join(ASSETS, "icons", `pseal_${id}.png`));
    icons.add(d.sprite);
    icons.add(`pseal_${id}`);
  }
}
seal.save(path.join(ASSETS, "icons", "pet_seal.png"));
icons.add("pet_seal");
for (const k of ["keeper_sol", "keeper_umb"]) if (fs.existsSync(path.join(KEEPERS, `${k}.json`))) put(KEEPERS, k, k, 1);
man.icons = [...icons];
fs.writeFileSync(MAN, JSON.stringify(man, null, 1));
fs.writeFileSync(DATA, JSON.stringify(anims, null, 1) + "\n");
