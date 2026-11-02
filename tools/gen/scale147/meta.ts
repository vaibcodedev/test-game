/**
 * Задача 147: данные листов _b147 для клиента — частота кадров атаки (data/scale147.json → afps, лист → к/с).
 * Атака перерисованных мобов — 12 кадров (attackN), длительность прежняя: fps = прежний fps × 12 / прежнее число кадров
 * (rig.ts / skeleton.ts animsOf). BootScene берёт fps отсюда, а не общие 14 к/с. Листы-замены, взятые у рига целиком
 * (remap на чужой лист, например дандж skeleton → skeleton_sword_b147), получают fps своего листа.
 * Запуск: npx tsx tools/gen/scale147/meta.ts (вызывают и mobs-b.ts, skeleton-b.ts в конце).
 */
import fs from "node:fs";
import path from "node:path";
import { animsOf as rigAnims } from "../mobs/rig";
import { BATCH1 } from "../mobs/batch1-list";
import { BATCH2 } from "../mobs/batch2-list";
import { animsOf as skelAnims, VARIANTS, variantId } from "../mobs/skeleton";
import { ROOT } from "./measure";

const DF = path.join(ROOT, "data/scale147.json");

export function refreshAfps(): Record<string, number> {
  const DATA = JSON.parse(fs.readFileSync(DF, "utf8"));
  const SUF = DATA.suffix as string, N = DATA.mobs.attackN as number;
  const out: Record<string, number> = {};
  const base = Object.fromEntries([...BATCH1, ...BATCH2].map((c) => [c.id, c]));
  for (const [key, def] of Object.entries<any>(DATA.mobs.rig)) {
    const cr = base[key]; if (!cr) continue;
    for (const r of cr.roles) for (const e of ["", "_elite"]) out[`${key}_${r.id}${e}${SUF}`] = rigAnims(r, def.attackN ?? N).attack.fps;
  }
  const sk = DATA.mobs.skeleton;
  for (const v of VARIANTS) out[`${variantId(v)}${SUF}`] = skelAnims(v.role, sk.attackN).attack.fps;
  const used = new Set(Object.values<string>(DATA.remap));
  const afps = Object.fromEntries(Object.entries(out).filter(([id]) => used.has(id)).sort(([a], [b]) => a.localeCompare(b)));
  const fresh = JSON.parse(fs.readFileSync(DF, "utf8"));
  fresh.afps = { _c: "к/с атаки листа _b147 (tools/gen/scale147/meta.ts): 12 кадров за прежнее время удара", ...afps };
  fs.writeFileSync(DF, JSON.stringify(fresh, null, 2) + "\n");
  return afps;
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("scale147", "meta.ts"))) {
  const a = refreshAfps();
  const v = Object.values(a);
  console.log(`  afps: ${v.length} листов, ${Math.min(...v)}–${Math.max(...v)} к/с`);
}
