/**
 * Задача 147, партия 3: скелеты (мечник, лучник, заклинатель; обычные и усиленные) под рост героя Б — листы skeleton_<роль>[_elite]_b147.
 * Пилот tools/gen/mobs/skeleton.ts получил параметр роста (setSkeletonScale): сцена масштабируется до рендера, кадр больше, атака 12 кадров.
 * Параметры — data/scale147.json → mobs.skeleton: scale [обычный, усиленный], cam, attackN. Запись в каталог — правкой текста, как у mobs-b.ts.
 * Запуск: npx tsx tools/gen/scale147/skeleton-b.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSkeletonSheets, setSkeletonScale, VARIANTS, variantId } from "../mobs/skeleton";
import { loadPC, tintOutline } from "../mobs/rig";
import { A, ROOT, unitHeight } from "./measure";
import { refreshAfps } from "./meta";

const DF = path.join(ROOT, "data/scale147.json");
const DATA = JSON.parse(fs.readFileSync(DF, "utf8"));
const SUF = DATA.suffix as string;
const D = DATA.mobs.skeleton as { scale: [number, number]; cam: { N: number; CX: number; GY: number }; attackN: number };
const UNITS = path.join(A, "units"), MAN = path.join(A, "manifest.json");
let utext = fs.readFileSync(MAN, "utf8");
const setUnit = (id: string, frame: number) => {
  const nl = utext.includes("\r\n") ? "\r\n" : "\n";
  const re = new RegExp(`("${id}": \{\s*"frame": )\d+`);
  if (re.test(utext)) utext = utext.replace(re, `$1${frame}`);
  else utext = utext.replace(/"units": \{\r?\n/, (m) => `${m}  "${id}": {${nl}   "frame": ${frame}${nl}  },${nl}`);
};
const remap: Record<string, string> = { ...DATA.remap };
let problems = 0;
for (const elite of [false, true]) {
  // рост задаётся отдельно для обычного и усиленного: по одному проходу
  setSkeletonScale(D.scale[elite ? 1 : 0], D.cam, D.attackN);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s147sk-"));
  const o = buildSkeletonSheets(tmp);
  for (const v of VARIANTS.filter((q) => q.elite === elite)) {
    const id = variantId(v), nid = `${id}${SUF}`, dst = path.join(UNITS, `${nid}.png`);
    const pc = loadPC(path.join(tmp, `${id}.png`));
    tintOutline(pc);
    pc.save(dst);
    setUnit(nid, D.cam.N);
    remap[id] = nid;
    const was = unitHeight(path.join(UNITS, `${id}.png`), 32, 32), now = unitHeight(dst, D.cam.N, D.cam.N);
    console.log(`  ${nid}: рост ${was.h} → ${now.h} px (кадр 32 → ${D.cam.N})${now.edge ? " — КРАЙ КАДРА" : ""}`);
  }
  problems += o.problems.length;
  for (const p of o.problems.slice(0, 12)) console.warn(`  ${p}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
JSON.parse(utext);
fs.writeFileSync(MAN, utext);
const fresh = JSON.parse(fs.readFileSync(DF, "utf8"));
fresh.remap = Object.fromEntries(Object.entries({ ...fresh.remap, ...remap }).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(DF, JSON.stringify(fresh, null, 2) + "\n");
refreshAfps(); // к/с атаки новых листов → data/scale147.json afps
console.log(problems ? `  замечаний по кадрам: ${problems}` : "  кадры чисты");
if (problems) process.exitCode = 1;
