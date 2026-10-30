/**
 * Позы оружия в data/hero-skeleton-b.json (раздел weaponPoses): npx tsx tools/gen/gear147/skeleton.ts
 * Дописывает к скелету основы «Б» кадры с поправкой позы под оружие (posePatch) и место оружия в каждом кадре:
 * hand — в руке (как wAng/wFront основы), back — за спиной (крепление слоя «Спина»), drop — выпало при гибели (лежит в мире).
 * Запускать после base_b_montage.ts (тот пересобирает файл без этого раздела).
 */
import fs from "node:fs";
import path from "node:path";
import { NF, anchors, pose, proj, solve, bodyOf, type AnimId, type Frame, type Look } from "../hero147/base_b";
import { baseView, dress, setOf, viewLook, weaponPlace, VIEWS4 } from "./gear";

const FILE = path.resolve("data/hero-skeleton-b.json");
const J = JSON.parse(fs.readFileSync(FILE, "utf8"));
const bodies: Record<string, Look> = { sol_m: { fac: "sol", sex: "m" }, sol_f: { fac: "sol", sex: "f" }, umb_m: { fac: "umb", sex: "m" }, umb_f: { fac: "umb", sex: "f" } };
const anims: AnimId[] = ["idle", "walk", "run", "atk2h", "hurt", "death", "gather", "ride"];
const kinds: Record<string, string> = { great: "chaos-knight" };
const r2 = (x: number) => Math.round(x * 2) / 2;
const ang = (a: [number, number], b: [number, number]) => Math.round((Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI);
const out: any = {
  _doc: "Позы основы «Б» под вид оружия (поправка позы posePatch из tools/gen/gear147/gear.ts). Герой — правша: меч в правой руке, щит в левой. Камера сверху-спереди. Виды: down, up, side (лицом вправо: правая рука ближняя, меч перед телом), left (лицом влево: правая рука дальняя, меч за телом; не зеркало — порядок слоёв и свет свои, свет сверху-слева). Для двуручника хват обеими руками, правая выше. Формат кадра как у bodies + mode: hand (в руке; wAng/wFront), back (за спиной: grip — точка рукояти, ang — угол клинка, слой как у «Спины»), drop (выпало при гибели: лежит в мире, не вращается с телом). Анимации atk1h/block/bow/cast для двуручника не используются.",
  great: {},
};
for (const [kind, setId] of Object.entries(kinds)) {
  const set = setOf(setId);
  for (const [id, l0] of Object.entries(bodies)) {
    const look0 = dress({ ...l0, props: true }, set, "sol", ["weapon"]), per: any = {};
    for (const a of anims) {
      const views: any = {};
      for (const v4 of VIEWS4) {
        views[v4] = [];
        const v = baseView(v4), look = viewLook(look0, v4), fl = v4 === "left";
        const fx = (x: number) => (fl ? 48 - x : x);
        for (let i = 0; i < NF(a); i++) {
          const P = pose(look, a, i, v), sk = solve(look, P), q = anchors({ sk, pose: P } as Frame, v);
          const w = weaponPlace({ sk, b: bodyOf(look), v, anim: a, u: i / NF(a), P });
          const mx = (p: [number, number, number]): [number, number, number] => (look.mirrorX ? [-p[0], p[1], p[2]] : p);
          const PJ = (p: [number, number, number]) => (w.world ? proj(mx(p), v) : proj(sk.T(p), v));
          const pp = q.p.map((x, j) => (j % 2 === 0 ? fx(x) : x));
          // рука с оружием у основы — «L» (+X); у правши это правая рука: меняем пары, чтобы ключи L/R означали левую/правую руку и ногу героя
          for (const [l, r] of [[3, 4], [5, 6], [7, 8], [10, 11], [12, 13], [14, 15]]) for (const o of [0, 1]) { const t = pp[l * 2 + o]; pp[l * 2 + o] = pp[r * 2 + o]; pp[r * 2 + o] = t; }
          const e: any = { p: pp, mode: w.mode, hFront: [q.hFront[1], q.hFront[0]], weaponHand: "R" };
          if (w.mode === "hand") { e.wAng = q.wAng === null ? null : fl ? -q.wAng : q.wAng; e.wFront = q.wFront; }
          else { const g = PJ(w.Hd), t = PJ([w.Hd[0] + w.d[0] * 6, w.Hd[1] + w.d[1] * 6, w.Hd[2] + w.d[2] * 6]); e.grip = [r2(fx(g[0])), r2(g[1])]; e.ang = fl ? -ang(g, t) : ang(g, t); }
          views[v4].push(e);
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
