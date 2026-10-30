/**
 * Проверка сета по всем кадрам: npx tsx tools/gen/gear147/review.ts [set] [look 0..3] → tools/out/gear147/review-<set>.png
 * Все анимации, нужные оружию сета, × 4 направления (вниз, вверх, вправо, влево); в консоль — кадры, где что-то касается края кадра.
 */
import path from "node:path";
import { PC } from "../canvas";
import { text } from "../mobs/lib";
import { ANIMS, NF, SPECIAL_ANIMS, frameOf, type AnimId, type Look } from "../hero147/base_b";
import { VIEWS4, dress, renderView, setOf } from "./gear";

const id = process.argv[2] ?? "chaos-knight", set = setOf(id);
const looks: Look[] = [{ fac: "sol", sex: "m", hair: "tousled" }, { fac: "sol", sex: "f", hair: "braid" }, { fac: "umb", sex: "m", hair: "mane" }, { fac: "umb", sex: "f", hair: "loose" }];
const l = dress(looks[+(process.argv[3] ?? 0)], set, looks[+(process.argv[3] ?? 0)].fac as any);
const two = set.items.weapon?.kind === "great";
const anims: AnimId[] = [...ANIMS.filter((a) => !(two ? ["atk1h", "block", "bow", "cast"] : set.items.weapon?.kind === "dual" ? ["block", "bow", "cast"] : []).includes(a)), ...SPECIAL_ANIMS.filter((a) => (set.items.weapon?.special ?? []).includes(a))];
const { FRx: FR, OX } = frameOf(l);
const K = 2, fw = FR * K, lw = 150, out = new PC(lw + 12 * fw + 10, anims.length * VIEWS4.length * fw + anims.length * 24 + 10);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 24; out.data[i + 1] = 20; out.data[i + 2] = 26; out.data[i + 3] = 255; }
const edge: string[] = [];
let y = 6;
for (const a of anims) {
  text(out, a.toUpperCase(), 6, y, 2, [255, 216, 100, 255]); y += 24;
  for (const v of VIEWS4) {
    text(out, v.toUpperCase(), 6, y + fw / 2 - 6, 2);
    for (let i = 0; i < NF(a); i++) {
      const x0 = lw + i * fw, f = renderView(l, v, a, i).img;
      for (let yy = 0; yy < fw - 2; yy++) for (let xx = 0; xx < fw - 2; xx++) out.set(x0 + xx, y + yy, (v === "up" || v === "left") ? [40, 48, 54, 255] : [44, 54, 40, 255]);
      let touch = false;
      for (let yy = 0; yy < FR; yy++) for (let xx = 0; xx < FR; xx++) if (f.has(xx, yy)) {
        if (xx === 0 || yy === 0 || xx === FR - 1 || (yy === FR - 1 && !(xx > 14 + OX && xx < 34 + OX))) touch = true;
        const q = f.get(xx, yy); for (let p = 0; p < K; p++) for (let b = 0; b < K; b++) out.set(x0 + xx * K + p, y + yy * K + b, [q[0], q[1], q[2], 255]);
      }
      if (touch) edge.push(`${a}/${v}/${i}`);
    }
    y += fw;
  }
}
out.save(path.resolve(`tools/out/gear147/review-${id}.png`));
console.log("край кадра:", edge.length ? edge.join(" ") : "нет");
