/**
 * Задача 140, партия 2: листы и превью образов (tools/out/mobs-batch2/<id>.png) и общий монтаж overview.png —
 * по зонам 40–100, данж и рейд, рядом с героем; спереди днём, сбоку, спереди ночью. В игру НЕ ставит.
 * Запуск: npx tsx tools/gen/mobs/batch2.ts [id ...] [--no-overview] — без id все образы; обзор собирается из листов
 * этого запуска и сохранённых tools/out/mobs-batch2/sheets/; --overview — только обзор по сохранённым листам.
 */
import fs from "node:fs";
import path from "node:path";
import { BATCH2 } from "./batch2-list";
import { loadPC } from "./lib";
import { BATCH2_DIR, HERO_LOOK, OUTLINE_LIMIT, camOf, crop, frameAt, loadAssets, outlineStats, rootFromArgv, runCreature, sceneRow, stackRows, type CreatureOut, type Item } from "./rig";
import { ZONES2 } from "./batch2-zones";

const root = rootFromArgv();
const out = BATCH2_DIR(root);
const args = process.argv.slice(2);
const onlyOverview = args.includes("--overview");
const noOverview = args.includes("--no-overview");
const only = args.filter((a) => !a.startsWith("--"));
{
  const dir = path.join(root, "tools", "out", "mobs-pilot");
  let worst = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((q) => /^skeleton_.*\.png$/.test(q)) : []) worst = Math.max(worst, outlineStats(loadPC(path.join(dir, f)), 32).worstRatio);
  if (worst > 0) OUTLINE_LIMIT.v = worst * 1.1;
}
const outs = new Map<string, CreatureOut>();
for (const cr of BATCH2) {
  if (only.length && !only.includes(cr.id)) continue;
  if (onlyOverview) continue;
  outs.set(cr.id, runCreature(cr, root, out));
}
console.log(`  худшая доля контура: ${(OUTLINE_LIMIT.seen * 100).toFixed(1)}% (предел ${(OUTLINE_LIMIT.v * 100).toFixed(1)}%)`);
console.log(`  контур героя: яркость ${HERO_LOOK.v?.lum.toFixed(1)}, второй ряд ${HERO_LOOK.v?.thick.toFixed(3)}; мобы: яркость ≥ ${HERO_LOOK.seen.lum.toFixed(1)}, второй ряд ≤ ${HERO_LOOK.seen.thick.toFixed(3)}`);
if (!noOverview) {
  const A = loadAssets(root);
  const k = 3, W = 2300;
  // кадр покоя: из листов этого запуска, иначе — из сохранённого листа tools/out/mobs-batch2/sheets/<вариант>.png
  const idle = (id: string, role: string, elite: boolean, row: number): Item | null => {
    const cr = BATCH2.find((q) => q.id === id);
    if (!cr) return null;
    const N = camOf(cr).N;
    const vid = `${id}_${role}${elite ? "_elite" : ""}`;
    const o = outs.get(id);
    const sh = o?.sheets.get(vid);
    if (sh) return frameAt(N, sh.idle, 0, row);
    const f = path.join(out, "sheets", `${vid}.png`);
    if (!fs.existsSync(f)) return null;
    const pc = loadPC(f);
    return { img: crop(pc, 0, row * N, N, N), emis: null };
  };
  const rows = [];
  for (const [row, vn, night] of [[0, "СПЕРЕДИ", false], [2, "СБОКУ", false], [0, "СПЕРЕДИ", true]] as [number, string, boolean][]) {
    for (const z of ZONES2) {
      const mobs = z.mobs.filter((m) => idle(m[0], m[1], m[2], 0));
      if (!mobs.length) continue;
      const items: Item[] = [{ img: crop(A.hero, 0, row * 32, 32, 32), emis: null }];
      mobs.forEach((m, i) => {
        const it = idle(m[0], m[1], m[2], row)!;
        items.push({ ...it, gap: i === 0 ? 20 : m[2] && !mobs[i - 1][2] ? 30 : 0, w: Math.max(26, it.img.w - (it.img.w > 32 ? 8 : 4)) });
      });
      rows.push(sceneRow(`×${k} · ${z.ru} · ${vn} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ | ${z.names}`, items, A, z.dirt && row === 0 && !night ? "dirt" : "grass", night, W, k));
    }
  }
  if (rows.length) {
    stackRows(rows, W).save(path.join(out, "overview.png"));
    console.log(`  обзор: ${path.join(out, "overview.png")}`);
  }
}
