/** Причёски: npx tsx tools/gen/hero147/hair_b.ts <m|f> <sol|umb> → tools/out/hero/qh.png */
import { PC } from "../canvas";
import { renderFrame, hairStyles, FR, type Look, type View } from "./base_b";
const sex = (process.argv[2] ?? "m") as "m" | "f", fac = (process.argv[3] ?? "sol") as "sol" | "umb";
const K = Number(process.env.K ?? 5), views: View[] = ["down", "up", "side"];
const st = hairStyles(sex).filter((h, i) => !process.env.SL || process.env.SL.split(",").includes(String(i)));
const out = new PC(st.length * views.length * 34 * K, 36 * K);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 70; out.data[i + 1] = 92; out.data[i + 2] = 58; out.data[i + 3] = 255; }
st.forEach((h, si) => views.forEach((v, vi) => {
  const f = renderFrame({ fac, sex, hair: h.id } as Look, v, "idle", 0).img;
  const ox = (si * views.length + vi) * 34 * K;
  for (let y = 10; y < FR; y++) for (let x = 7; x < 41; x++) if (f.has(x, y)) { const q = f.get(x, y); for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) out.set(ox + (x - 7) * K + a, (y - 10) * K + b, [q[0], q[1], q[2], 255]); }
}));
out.save("tools/out/hero/qh.png"); console.log("ok");
