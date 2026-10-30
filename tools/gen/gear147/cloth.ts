/**
 * Ткань под физику в игре (Phaser Rope + Verlet, docs/gear-sets-spec.md «Ткань и подвижные части»):
 * npx tsx tools/gen/gear147/cloth.ts → tools/out/gear147/cloth/<set>-<вид>.png (1 спокойный кадр на направление, без анимации)
 * и data/hero-skeleton-b.json → cloth: текстуры, точки пришпиливания (в координатах текстуры и как смещение от точек скелета кадра), порядок слоя по направлению.
 * Точки скелета по кадрам (плечи, спина, пояс, шея) уже есть в bodies / weaponPoses (ключи keys) — ими ткань крепится к телу в каждом кадре.
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "../canvas";
import { FY, anchors, frameOf, pose, proj, renderLayers, solve, flipCv, type Frame, type Look } from "../hero147/base_b";
import { GD, VIEWS4, backMount, baseView, dress, setOf, viewLook, type View4 } from "./gear";

const OUT = path.resolve("tools/out/gear147/cloth"); fs.mkdirSync(OUT, { recursive: true });
const FILE = path.resolve("data/hero-skeleton-b.json"), J = JSON.parse(fs.readFileSync(FILE, "utf8"));
const KEYS: string[] = J.keys;
const L0: Look = { fac: "sol", sex: "m", hair: "tousled" };
const out: any = {
  _doc: "Ткань слота «Спина» отдельной текстурой: 1 спокойный кадр на направление (left — со своим светом сверху-слева, не зеркало). В игре ткань — Rope с Verlet-цепью: верх пришпилен к точкам pins (смещение pinFrom.offset от точки скелета pinFrom.key в текущем кадре), низ свободен. layer: behind — рисовать до тела, front — после тела и до головы/наплечников. Кадр текстуры — frame, ступни героя в origin.",
  textures: {},
};
for (const setId of ["chaos-knight", "rogue-chaos"]) {
  const set = setOf(setId), it = set.items.cloak, base = dress(L0, set, "sol", ["cloak", "armor", "weapon"]), fo = frameOf(base);
  const t: any = { kind: it.kind, frame: fo.FRx, origin: [24 + fo.OX, 45 + fo.OY], views: {} };
  for (const v4 of VIEWS4) {
    const lk = { ...viewLook(base, v4), calmCloth: true } as Look, v = baseView(v4), fl = v4 === "left";
    const [f] = renderLayers(lk, v, "idle", 0, [(p) => p.slot === "cloak"]);
    const img = fl ? flipCv(f.img) : f.img, pc = new PC(img.w, img.h);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.has(x, y)) { const q = img.get(x, y); pc.set(x, y, [q[0], q[1], q[2], 255]); }
    const file = `${setId}-${v4}.png`; pc.save(path.join(OUT, file));
    // точки пришпиливания: плащ — края верха у плеч; шарф — узел у шеи
    const P = pose(lk, "idle", 0, v), sk = solve(lk, P), M = backMount({ sk, b: sk.b, v });
    const sx = sk.b.shW - sk.b.armT * 0.3;
    const pins3 = it.kind === "cape" ? [[M.o, sx * 0.82], [M.o, -sx * 0.82]].map(([o, a]) => [(o as number[])[0] + (M.A[0] * (a as number)), (o as number[])[1] + M.A[1] * (a as number), (o as number[])[2] + M.A[2] * (a as number)]) : [[M.o[0] + M.U[0] * 1.5 + M.F[0] * 0.3, M.o[1] + M.U[1] * 1.5 + M.F[1] * 0.3, M.o[2] + M.U[2] * 1.5 + M.F[2] * 0.3]];
    const fx = (x: number) => (fl ? fo.FRx - x : x);
    const pins = pins3.map((p) => { const q = proj(sk.T(p as any), v); return [Math.round(fx(q[0] + fo.OX) * 2) / 2, Math.round((q[1] + fo.OY) * 2) / 2]; });
    const an = anchors({ sk, pose: P } as Frame, v).p, keyPt = (k: string) => { const j = KEYS.indexOf(k); return [fx(an[j * 2] + fo.OX), an[j * 2 + 1] + fo.OY]; };
    const pinKeys = it.kind === "cape" ? ["shoulderL", "shoulderR"] : ["back"];
    // ключи — в терминах героя (как в weaponPoses): при mirrorX точка «L» основы — правая сторона героя
    const keyFor = (k: string) => (lk.mirrorX ? k.replace(/L$/, "#").replace(/R$/, "L").replace(/#$/, "R") : k);
    const pinFrom = pins.map((p, j) => { const k = pinKeys[Math.min(j, pinKeys.length - 1)], a = keyPt(k); return { key: keyFor(k), offset: [+(p[0] - a[0]).toFixed(1), +(p[1] - a[1]).toFixed(1)] }; });
    const L = GD.back.layer[v === "side" ? "side" : v] as number;
    t.views[v4] = { file: `tools/out/gear147/cloth/${file}`, pins, pinFrom, layer: L > 3 ? "front" : "behind", z: L };
  }
  out.textures[setId] = t;
}
J.cloth = out;
fs.writeFileSync(FILE, JSON.stringify(J));
console.log("→ tools/out/gear147/cloth/*.png, data/hero-skeleton-b.json → cloth");
void FY;
