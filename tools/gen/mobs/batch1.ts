/**
 * Задача 140, партия 1: все образы зон 1–40 обеих фракций — листы, превью каждого образа
 * (tools/out/mobs-batch1/<id>.png) и общий монтаж overview.png: по зонам (зеркальные пары Сольгарда и Умбрата),
 * рядом с героем, обычные и элита зоны; спереди днём, затем сбоку и ночью.
 * Скелет — утверждённый пилот (tools/gen/mobs/skeleton.ts), берётся как есть.
 * Запуск: npx tsx tools/gen/mobs/batch1.ts [id ...] — без аргументов все образы.
 * OLD_SHEETS=<папка прежних листов> — дополнительно монтаж «было | стало» по каждому образу (<id>-was-now.png).
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "./lib";
import { skeletonIdleFrame, VARIANTS as SK_VARS, type Role as SkRole } from "./skeleton";
import { BATCH_DIR, HERO_LOOK, OUTLINE_LIMIT, outlineLook, scaleNN, fill, groundBg, text, outlineStats, camOf, crop, loadPC, variantRu, frameAt, loadAssets, rootFromArgv, runCreature, sceneRow, stackRows, variantId, type Creature, type CreatureOut, type Item } from "./rig";

import { BATCH1 } from "./batch1-list";
export { BATCH1 };

type Pick = [string, string, boolean];
/** Зоны 1–40: [образ, роль, усиленный]; последняя запись — элита зоны. */
export const ZONES: { ru: string; mobs: Pick[] }[] = [
  { ru: "ЗОЛОТЫЕ НИВЫ 1-10 С", mobs: [["boarfolk", "axe", false], ["ratfolk", "cutter", false], ["goblin", "slinger", false], ["boarfolk", "axe", true]] },
  { ru: "КУРГАНЫ МЁРТВЫХ 1-10 У", mobs: [["zombie", "digger", false], ["imp", "fork", false], ["skeleton", "bow", false], ["zombie", "digger", true]] },
  { ru: "КОРОЛЕВСКАЯ ПУЩА 10-20 С", mobs: [["wolffolk", "chaser", false], ["satyr", "piper", false], ["ratfolk", "poacher", false], ["wolffolk", "chaser", true]] },
  { ru: "МГЛИСТЫЙ БОР 10-20 У", mobs: [["ghoul", "catcher", false], ["imp", "caster", false], ["skeleton", "bow", false], ["ghoul", "catcher", true]] },
  { ru: "ЗЕЛЁНЫЕ ХОЛМЫ 20-30 С", mobs: [["goblin", "slasher", false], ["goblin", "shaman", false], ["hobgoblin", "sword", false], ["kobold", "digger", false], ["kobold", "bomber", false], ["hobgoblin", "halberd", true]] },
  { ru: "ПЕПЕЛЬНЫЕ ПРЕДГОРЬЯ 20-30 У", mobs: [["skeleton", "sword", false], ["skeleton", "mage", false], ["mummy", "guard", false], ["imp", "fork", false], ["imp", "thrower", false], ["mummy", "guard", true]] },
  { ru: "ШЕПЧУЩИЙ ЛЕС 30-40 С", mobs: [["wolffolk", "chaser", false], ["wolffolk", "hunter", false], ["boarfolk", "shield", false], ["satyr", "spear", false], ["satyr", "piper", false], ["ogre", "woodcutter", false], ["ogre", "woodcutter", true]] },
  { ru: "ГНИЛЫЕ ТОПИ 30-40 У", mobs: [["ghoul", "eater", false], ["ghoul", "leaper", false], ["zombie", "anchor", false], ["frogfolk", "harpoon", false], ["frogfolk", "shaman", false], ["troll", "brute", false], ["troll", "brute", true]] },
];

function idle(outs: Map<string, CreatureOut>, [id, role, elite]: Pick, row: number): Item {
  if (id === "skeleton") {
    const v = SK_VARS.find((q) => q.role === (role as SkRole) && q.elite === elite)!;
    return skeletonIdleFrame(v, row);
  }
  const o = outs.get(id)!;
  const v = o.vars.find((q) => q.role.id === role && q.elite === elite)!;
  const N = camOf(o.cr).N;
  return frameAt(N, o.sheets.get(variantId(o.cr, v))!.idle, 0, row);
}

const root = rootFromArgv();
const out = BATCH_DIR(root);
const only = process.argv.slice(2);
// предел доли контура: худший кадр пилота-скелета (tools/out/mobs-pilot) + 10%
{
  const dir = path.join(root, "tools", "out", "mobs-pilot");
  let worst = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((q) => /^skeleton_.*\.png$/.test(q)) : []) worst = Math.max(worst, outlineStats(loadPC(path.join(dir, f)), 32).worstRatio);
  if (worst > 0) OUTLINE_LIMIT.v = worst * 1.1;
  console.log(`  предел доли контура: ${(OUTLINE_LIMIT.v * 100).toFixed(1)}% (скелет ${(worst * 100).toFixed(1)}%)`);
}
const outs = new Map<string, CreatureOut>();
for (const cr of BATCH1) outs.set(cr.id, runCreature(cr, root, out, only.length > 0 && !only.includes(cr.id)));
const A = loadAssets(root);
const k = 3;
const W = 2000;
const rows = [];
for (const [row, vn, night] of [[0, "СПЕРЕДИ", false], [2, "СБОКУ", false], [0, "СПЕРЕДИ", true]] as [number, string, boolean][]) {
  for (const z of ZONES) {
    const items: Item[] = [{ img: crop(A.hero, 0, row * 32, 32, 32), emis: null }];
    z.mobs.forEach((m, i) => items.push({ ...idle(outs, m, row), gap: i === 0 ? 20 : i === z.mobs.length - 1 ? 30 : 0 }));
    rows.push(sceneRow(`×${k} · ${z.ru} · ${vn} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ | ${z.mobs.slice(0, -1).map((m) => m[0] === "skeleton" ? "СКЕЛЕТ" : outs.get(m[0])!.cr.ru.toUpperCase()).join(" · ")} | ЭЛИТА`, items, A, row === 0 && !night && z.ru.endsWith("У") ? "dirt" : "grass", night, W, k));
  }
}
stackRows(rows, W).save(path.join(out, "overview.png"));
console.log(`  худшая доля контура в партии: ${(OUTLINE_LIMIT.seen * 100).toFixed(1)}%`);
console.log(`  контур героя: яркость ${HERO_LOOK.v?.lum.toFixed(1)}, второй ряд ${HERO_LOOK.v?.thick.toFixed(3)}; мобы: яркость ≥ ${HERO_LOOK.seen.lum.toFixed(1)}, второй ряд ≤ ${HERO_LOOK.seen.thick.toFixed(3)}`);
{
  // «герой | гоблин | хобгоблин» ×6: без тени и подложек, целый масштаб; светлый фон и трава
  const K = 6;
  const gob = outs.get("goblin")!, hob = outs.get("hobgoblin")!;
  const pick = (o: CreatureOut, role: string, row: number) => frameAt(32, o.sheets.get(variantId(o.cr, o.vars.find((v) => v.role.id === role && !v.elite)!))!.idle, 0, row).img;
  const list = [crop(A.hero, 0, 0, 32, 32), pick(gob, "slasher", 0), pick(hob, "sword", 0), crop(A.hero, 0, 32, 32, 32), pick(gob, "slasher", 1), pick(hob, "sword", 1)];
  const Wc = 16 + list.length * (32 * K + 8) + 16, Hc = 2 * (32 * K + 40) + 20;
  const cv = new PC(Wc, Hc);
  fill(cv, 0, 0, Wc, Hc, [24, 20, 26, 255]);
  for (const [bi, bg] of [[0, "light"], [1, "grass"]] as [number, string][]) {
    const y = 10 + bi * (32 * K + 40);
    text(cv, bi ? "×6 · ТРАВА · ГЕРОЙ | ГОБЛИН | ХОБГОБЛИН — СПЕРЕДИ И СЗАДИ" : "×6 · СВЕТЛЫЙ ФОН · ГЕРОЙ | ГОБЛИН | ХОБГОБЛИН — СПЕРЕДИ И СЗАДИ", 16, y);
    const yy = y + 26;
    if (bg === "light") fill(cv, 16, yy, Wc - 32, 32 * K, [206, 200, 188, 255]);
    else groundBg(cv, A.terrain, 16, yy, Wc - 32, 32 * K, K, "grass");
    list.forEach((im, i) => cv.blit(scaleNN(im, K), 16 + i * (32 * K + 8), yy));
  }
  cv.save(path.join(out, "outline-vs-hero.png"));
}
console.log(`  обзор: ${path.join(out, "overview.png")}`);

// «было | стало»: прежние листы (кадр покоя) против новых, 3 вида, рядом с героем; ниже — новая гибель спереди
const oldDir = process.env.OLD_SHEETS;
if (oldDir && fs.existsSync(oldDir)) {
  for (const o of outs.values()) {
    if (only.length && !only.includes(o.cr.id)) continue;
    const N = camOf(o.cr).N;
    const rws = [];
    for (const [row, vn] of [[0, "СПЕРЕДИ"], [2, "СБОКУ"], [1, "СЗАДИ"]] as [number, string][]) {
      const items: Item[] = [{ img: crop(A.hero, 0, row * 32, 32, 32), emis: null }];
      o.vars.forEach((v, i) => {
        const f = path.join(oldDir, `${variantId(o.cr, v)}.png`);
        if (fs.existsSync(f)) items.push({ img: crop(loadPC(f), 0, row * N, N, N), emis: null, gap: i === 0 ? 20 : 0 });
      });
      items.push({ img: crop(A.hero, 0, row * 32, 32, 32), emis: null, gap: 60 });
      o.vars.forEach((v, i) => items.push({ ...frameAt(N, o.sheets.get(variantId(o.cr, v))!.idle, 0, row), gap: i === 0 ? 20 : 0 }));
      rws.push(sceneRow(`×4 · ${o.cr.ru.toUpperCase()} · ${vn} · БЫЛО: ГЕРОЙ | ${o.vars.map((v) => variantRu(v).toUpperCase()).join(" · ")} — СТАЛО: ГЕРОЙ | ТО ЖЕ`, items, A, "grass", false, Math.max(1600, 28 + (o.vars.length * 2 + 2) * (N - 2) * 4 + 140), 4, N));
    }
    const D = o.sheets.get(variantId(o.cr, o.vars[0]))!.death;
    const dItems: Item[] = Array.from({ length: 12 }, (_, i) => ({ ...frameAt(N, D, i, 0), w: N - 4 }));
    rws.push(sceneRow(`×3 · СТАЛО · ГИБЕЛЬ ${variantRu(o.vars[0]).toUpperCase()} СПЕРЕДИ · 12 КАДРОВ`, dItems, A, "grass", false, Math.max(1600, 12 * (N - 4) * 3 + 80), 3, N));
    const Wm = Math.max(...rws.map(() => 0), 1600, 28 + (o.vars.length * 2 + 2) * (N - 2) * 4 + 140, 12 * (N - 4) * 3 + 80);
    stackRows(rws, Wm).save(path.join(out, `${o.cr.id}-was-now.png`));
  }
  console.log("  было | стало: tools/out/mobs-batch1/<id>-was-now.png");
}
