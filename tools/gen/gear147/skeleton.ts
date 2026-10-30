/**
 * Позы оружия в data/hero-skeleton-b.json (раздел weaponPoses): npx tsx tools/gen/gear147/skeleton.ts
 * Дописывает к скелету основы «Б» кадры с поправкой позы под оружие (posePatch) и место оружия в каждом кадре:
 * hand — в руке (как wAng/wFront основы), back — за спиной (крепление слоя «Спина»), drop — выпало при гибели (лежит в мире).
 * Запускать после base_b_montage.ts (тот пересобирает файл без этого раздела).
 */
import fs from "node:fs";
import path from "node:path";
import { NF, anchors, pose, proj, solve, bodyOf, type AnimId, type Frame, type Look, type View } from "../hero147/base_b";
import { dress, setOf, weaponPlace } from "./gear";

const FILE = path.resolve("data/hero-skeleton-b.json");
const J = JSON.parse(fs.readFileSync(FILE, "utf8"));
const bodies: Record<string, Look> = { sol_m: { fac: "sol", sex: "m" }, sol_f: { fac: "sol", sex: "f" }, umb_m: { fac: "umb", sex: "m" }, umb_f: { fac: "umb", sex: "f" } };
const anims: AnimId[] = ["idle", "walk", "run", "atk2h", "hurt", "death", "gather", "ride"];
const kinds: Record<string, string> = { great: "chaos-knight" };
const r2 = (x: number) => Math.round(x * 2) / 2;
const ang = (a: [number, number], b: [number, number]) => Math.round((Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI);
const out: any = {
  _doc: "Позы основы «Б» под вид оружия (поправка позы posePatch из tools/gen/gear147/gear.ts). Формат кадра как у bodies + mode: hand (в руке; wAng/wFront), back (за спиной: grip — точка рукояти, ang — угол клинка, слой как у «Спины»), drop (выпало при гибели: лежит в мире, не вращается с телом). Анимации atk1h/block/bow/cast для двуручника не используются.",
  great: {},
};
for (const [kind, setId] of Object.entries(kinds)) {
  const set = setOf(setId);
  for (const [id, l0] of Object.entries(bodies)) {
    const look = dress({ ...l0, props: true }, set, "sol", ["weapon"]), per: any = {};
    for (const a of anims) {
      const views: any = {};
      for (const v of ["down", "up", "side"] as View[]) {
        views[v] = [];
        for (let i = 0; i < NF(a); i++) {
          const P = pose(look, a, i, v), sk = solve(look, P), q = anchors({ sk, pose: P } as Frame, v);
          const w = weaponPlace({ sk, b: bodyOf(look), v, anim: a, u: i / NF(a), P });
          const PJ = (p: [number, number, number]) => (w.world ? proj(p, v) : proj(sk.T(p), v));
          const e: any = { p: q.p, mode: w.mode, hFront: q.hFront };
          if (w.mode === "hand") { e.wAng = q.wAng; e.wFront = q.wFront; }
          else { const g = PJ(w.Hd), t = PJ([w.Hd[0] + w.d[0] * 6, w.Hd[1] + w.d[1] * 6, w.Hd[2] + w.d[2] * 6]); e.grip = [r2(g[0]), r2(g[1])]; e.ang = ang(g, t); }
          views[v].push(e);
        }
      }
      per[a] = { fps: J.bodies[id][a].fps, loop: J.bodies[id][a].loop, views };
    }
    out[kind][id] = per;
  }
}
J.weaponPoses = out;
fs.writeFileSync(FILE, JSON.stringify(J));
console.log("→ data/hero-skeleton-b.json: weaponPoses.great", (fs.statSync(FILE).size / 1024).toFixed(0) + " KB");
