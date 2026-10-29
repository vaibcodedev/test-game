/** Быстрый просмотр основы: npx tsx tools/gen/hero147/quick.ts [A] → tools/out/hero/quick.png (покой 0, все виды, 4 облика + с оружием, ×4). */
import { PC } from "../canvas";
import { BUILDS, renderFrame, FR, type Look, type View } from "./hero_base";

const ids = process.argv[2] ? [process.argv[2]] : BUILDS.map((b) => b.id);
const allLooks: Look[] = [{ fac: "sol", sex: "m" }, { fac: "sol", sex: "f" }, { fac: "umb", sex: "m" }, { fac: "umb", sex: "f" }, { fac: "sol", sex: "m", armed: true }];
const looks = process.env.LOOKS ? [...process.env.LOOKS].map((c) => allLooks[+c]) : allLooks;
const views: View[] = process.env.VIEWS ? (process.env.VIEWS.split(",") as View[]) : ["down", "up", "side"];
const K = Number(process.env.K ?? 4), anim = (process.argv[3] as "idle" | "walk") ?? "idle", fi = Number(process.argv[4] ?? 0);
const cw = FR * K;
const out = new PC(cw * looks.length * views.length, cw * ids.length);
out.data.fill(0);
for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) { const i = (y * out.w + x) * 4; out.data[i] = 70; out.data[i + 1] = 92; out.data[i + 2] = 58; }
ids.forEach((id, r) => {
  const b = BUILDS.find((q) => q.id === id)!;
  looks.forEach((l, li) => views.forEach((v, vi) => {
    const f = renderFrame(b, l, v, anim, fi).img;
    const ox = (li * views.length + vi) * cw, oy = r * cw;
    for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (f.has(x, y)) { const c = f.get(x, y); for (let a = 0; a < K; a++) for (let q = 0; q < K; q++) out.set(ox + x * K + a, oy + y * K + q, [c[0], c[1], c[2], 255]); }
  }));
});
out.save("tools/out/hero/quick.png");
console.log("ok");
