/** Все анимации одним листом: npx tsx tools/gen/hero147/sheet_b.ts [look 0..3] [views] → tools/out/hero/qs.png */
import { PC } from "../canvas";
import { renderFrame, NF, FR, ANIMS, type Look, type View } from "./base_b";
const all: Look[] = [{ fac: "sol", sex: "m" }, { fac: "sol", sex: "f" }, { fac: "umb", sex: "m" }, { fac: "umb", sex: "f" }];
const l = { ...all[+(process.argv[2] ?? 0)], hair: process.env.HAIR };
const views = (process.argv[3] ?? "down,side").split(",") as View[];
const K = Number(process.env.K ?? 2), anims = process.env.AN ? process.env.AN.split(",") : ANIMS;
const out = new PC(12 * FR * K, anims.length * views.length * FR * K);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 70; out.data[i + 1] = 92; out.data[i + 2] = 58; out.data[i + 3] = 255; }
let r = 0;
for (const a of anims as any[]) for (const v of views) {
  for (let fi = 0; fi < NF(a); fi++) {
    const f = renderFrame(l, v, a, fi).img;
    for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (f.has(x, y)) { const q = f.get(x, y); for (let p = 0; p < K; p++) for (let b = 0; b < K; b++) out.set(fi * FR * K + x * K + p, r * FR * K + y * K + b, [q[0], q[1], q[2], 255]); }
  }
  r++;
}
out.save("tools/out/hero/qs.png"); console.log("ok");
