/** Просмотр основы Б: npx tsx tools/gen/hero147/quick_b.ts <anim> [looks 0..3] [views] → tools/out/hero/qb.png (×K) */
import { PC } from "../canvas";
import { renderFrame, NF, FR, type AnimId, type Look, type View } from "./base_b";
const anim = (process.argv[2] ?? "idle") as AnimId;
const all: Look[] = [{ fac: "sol", sex: "m" }, { fac: "sol", sex: "f" }, { fac: "umb", sex: "m" }, { fac: "umb", sex: "f" }];
const looks = [...(process.argv[3] ?? "0")].map((c) => ({ ...all[+c], hair: process.env.HAIR }));
const views = (process.argv[4] ?? "down,up,side").split(",") as View[];
const K = Number(process.env.K ?? 4), only = process.env.FR ? process.env.FR.split(",").map(Number) : null;
const frames = only ?? [...Array(NF(anim)).keys()];
const out = new PC(frames.length * FR * K, looks.length * views.length * FR * K);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 70; out.data[i + 1] = 92; out.data[i + 2] = 58; out.data[i + 3] = 255; }
let r = 0;
for (const l of looks) for (const v of views) {
  frames.forEach((fi, c) => {
    const f = renderFrame(l, v, anim, fi).img;
    for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (f.has(x, y)) { const q = f.get(x, y); for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) out.set(c * FR * K + x * K + a, r * FR * K + y * K + b, [q[0], q[1], q[2], 255]); }
  });
  r++;
}
out.save("tools/out/hero/qb.png"); console.log("ok");
