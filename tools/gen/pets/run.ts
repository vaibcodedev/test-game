/**
 * Запуск: npx tsx tools/gen/pets/run.ts [--only=wl_skeleton,wl_demon,keeper_sol,keeper_umb] [--fast]
 * → tools/out/warlock-pets/sheets/<id>.png (+ _glow.png, .json раскладка) и compare.png «сейчас | новое»
 * (герой для масштаба, день и ночь, все анимации крупно, 3 вида + зеркало).
 * В игру не подключается (client/public/assets не трогает).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  animRows, buildPet, crop, frameOfSheet, heroAt, loadAssets, saveSheets, sceneRow, stackRows, text,
  type Item, type Pet, type PetOut, type Row,
} from "./petlib";
import { loadPC } from "../mobs/lib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "tools", "out", "warlock-pets");
const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const ALL: { id: string; load: () => Promise<Pet>; old?: string }[] = [
  { id: "wl_skeleton", load: async () => (await import("./warlock")).skeletonPet, old: "skeleton" },
  { id: "wl_demon", load: async () => (await import("./demon")).demonPet, old: "imp" },
  { id: "keeper_sol", load: async () => (await import("./keeper")).keeperSol },
  { id: "keeper_umb", load: async () => (await import("./keeper")).keeperUmb },
];
const A = loadAssets(ROOT);
const outs: { o: PetOut; old?: string }[] = [];
for (const it of ALL) {
  if (only.length && !only.includes(it.id)) continue;
  const pet = await it.load();
  const t0 = Date.now();
  const o = buildPet(pet);
  saveSheets(o, path.join(OUT, "sheets"));
  console.log(`  ${pet.id}: ${o.pet.anims.length} анимаций за ${((Date.now() - t0) / 1000).toFixed(1)} с; замечаний ${o.problems.length}`);
  for (const p of o.problems.slice(0, 12)) console.log(`    ${p}`);
  outs.push({ o, old: it.old });
}

const K = 3;
const W = Math.max(...outs.map(({ o }) => 24 + 36 * K + Math.max(...[...o.sheets.values()].map((s) => s.n)) * o.pet.cam.N * K + 60), 1600);
const rows: Row[] = [];
rows.push({ h: 40, draw: (c, y) => text(c, "ПРИЗЫВЫ ЧЕРНОКНИЖНИКА И СМОТРИТЕЛИ ЗВЕРИНЦА · СЕЙЧАС | НОВОЕ · НА УТВЕРЖДЕНИЕ, В ИГРУ НЕ ВКЛЮЧЕНО", 16, y + 10, 3) });
for (const { o, old } of outs) {
  const N = o.pet.cam.N;
  const idle = o.sheets.get("idle")!;
  for (const night of [false, true]) {
    const items: Item[] = [];
    if (old) {
      const sh = loadPC(path.join(ROOT, "client", "public", "assets", "units", `${old}.png`));
      items.push({ img: heroAt(A, 0), label: "ГЕРОЙ" });
      for (const row of [0, 2, 1]) items.push({ img: crop(sh, 0, row * 32, 32, 32), label: row === 0 ? "СЕЙЧАС" : "" });
    }
    items.push({ img: heroAt(A, 0), gap: old ? 40 : 0, label: "ГЕРОЙ" });
    [0, 2, 1].forEach((row, i) => {
      const f = frameOfSheet(idle, N, 0, row);
      items.push({ img: f.img, emis: f.emis, shadow: o.pet.shadow, label: i === 0 ? "НОВОЕ" : "" });
    });
    { const f = frameOfSheet(idle, N, 0, 2); items.push({ img: f.img, emis: f.emis, flip: true, shadow: o.pet.shadow }); }
    items.push({ img: heroAt(A, 2) });
    rows.push(sceneRow(`×${K} · ${o.pet.ru} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ${old ? "СЕЙЧАС (СПРАЙТ " + old.toUpperCase() + ") | " : ""}НОВОЕ: ВНИЗ, ВБОК, ВВЕРХ, ВЛЕВО`, items, A, night, W, K, N));
  }
  rows.push(...animRows(o, A, K, W));
  if (o.pet.id.startsWith("wl_")) rows.push(...animRows({ ...o, pet: { ...o.pet, anims: o.pet.anims.filter((a) => a.id === "idle" || a.id === "spawn" || a.id === "death") } }, A, K, W, true));
}
fs.mkdirSync(OUT, { recursive: true });
const name = only.length ? `compare-${only.join("+")}.png` : "compare.png";
stackRows(rows, W).save(path.join(OUT, name));
console.log(`  → ${path.join(OUT, name)}`);
void heroAt;
