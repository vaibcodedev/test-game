/** Просмотр: npx tsx tools/gen/gear147/quick.ts <set> <anim> [look 0..3] [views] → tools/out/gear147/q.png (×K, env FR=кадры через запятую, SLOTS=) */
import { PC } from "../canvas";
import { renderFrame, NF, FR, type AnimId, type Look, type View } from "../hero147/base_b";
import { dress, setOf, type Slot } from "./gear";
const all: Look[] = [{ fac: "sol", sex: "m", hair: "tousled" }, { fac: "sol", sex: "f", hair: "braid" }, { fac: "umb", sex: "m", hair: "mane" }, { fac: "umb", sex: "f", hair: "loose" }];
const set = process.argv[2] === "none" ? null : setOf(process.argv[2] ?? "chaos-knight");
const anim = (process.argv[3] ?? "idle") as AnimId;
const looks = [...(process.argv[4] ?? "0")].map((c) => all[+c]);
const views = (process.argv[5] ?? "down,up,side").split(",") as View[];
const K = Number(process.env.K ?? 4), only = process.env.FR ? process.env.FR.split(",").map(Number) : [...Array(NF(anim)).keys()];
const slots = process.env.SLOTS ? (process.env.SLOTS.split(",") as Slot[]) : undefined;
const out = new PC(only.length * FR * K, looks.length * views.length * FR * K);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 70; out.data[i + 1] = 92; out.data[i + 2] = 58; out.data[i + 3] = 255; }
let r = 0;
for (const l of looks) for (const v of views) {
  only.forEach((fi, c) => {
    const f = renderFrame(dress(l, set, l.fac, slots), v, anim, fi).img;
    for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (f.has(x, y)) { const q = f.get(x, y); for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) out.set(c * FR * K + x * K + a, r * FR * K + y * K + b, [q[0], q[1], q[2], 255]); }
  });
  r++;
}
out.save("tools/out/gear147/q.png"); console.log("ok");
