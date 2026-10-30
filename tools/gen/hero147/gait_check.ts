/** Шаг основы «Б» с сетами: npx tsx tools/gen/hero147/gait_check.ts [set,…] — скольжение ступни и плавность подвижных частей (как в review.ts). */
import { secOffsets, type AnimId } from "./base_b";
import { lagCheck, slideCheck } from "./gait";
import { baseView, dress, setOf, viewLook } from "../gear147/gear";

const sets = (process.argv[2] ?? "chaos-knight,rogue-chaos").split(",");
let bad = 0;
for (const id of sets) {
  const l = dress({ fac: "sol", sex: "m", hair: "tousled" }, setOf(id));
  for (const a of ["walk", "run", "idle"] as AnimId[]) {
    for (const v of ["down", "side"] as const) console.log(id, a, v, "смещение пластин:", secOffsets(viewLook(l, v), a, baseView(v)).join(" "));
    const s = a === "idle" ? [] : slideCheck(l, a), g = process.env.LAG ? lagCheck(l, a) : [];
    bad += s.length + g.length;
    console.log(id, a, "скольжение:", s.length ? s.join("; ") : "нет", process.env.LAG ? "| рывки частей: " + (g.length ? g.join("; ") : "нет") : "");
  }
}
process.exitCode = bad ? 1 : 0;
