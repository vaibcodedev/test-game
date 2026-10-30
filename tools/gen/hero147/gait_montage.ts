/**
 * Монтаж ходьбы и бега основы «Б» (эталон для NPC): npx tsx tools/gen/hero147/gait_montage.ts [snap]
 *   snap — запомнить текущие кадры как «было» (tools/out/gear147/anim-b-before.json), без аргумента — монтаж «было | стало»
 *   → tools/out/gear147/anim-b-walkrun.png: латы Рыцаря Хаоса и кожа разбойника Хаоса, walk и run × 4 направления.
 * В каждой клетке — линия земли; метки ступни на земле: зелёная — где ступня есть, жёлтая — где она должна стоять,
 * если не скользит (герой идёт со скоростью из shared, data/hero-base-b.json → gait). Справа от сетки бокового вида —
 * «след»: кадры цикла разнесены по миру на шаг (скорость / к/с), отпечатки опорной ступни должны совпасть.
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "../canvas";
import { text } from "../mobs/lib";
import { NF, DATA, frameOf, type AnimId, type Look } from "./base_b";
import { contacts, frameStep } from "./gait";
import { dress, renderView, setOf, type View4 } from "../gear147/gear";

const SETS = ["chaos-knight", "rogue-chaos"], ANIMS: AnimId[] = ["walk", "run"], VIEWS: View4[] = ["side", "left", "down", "up"];
const base: Look = { fac: "sol", sex: "m", hair: "tousled" };
const BEFORE = path.resolve("tools/out/gear147/anim-b-before.json");
type Shot = { w: number; px: string; feet: ({ s: "L" | "R"; x: number; y: number; piv?: 0 | 1; pts?: [number, number][] } | null)[] };
const shoot = () => {
  const o: Record<string, Shot[]> = {};
  for (const id of SETS) for (const a of ANIMS) for (const v of VIEWS) {
    const l = dress(base, setOf(id));
    o[`${id}/${a}/${v}`] = Array.from({ length: NF(a) }, (_, i) => {
      const f = renderView(l, v, a, i);
      return { w: f.img.w, px: Buffer.from(f.img.d).toString("base64"), feet: contacts(l, v, a, i) as any };
    });
  }
  return o;
};
if (process.argv[2] === "snap") { fs.writeFileSync(BEFORE, JSON.stringify(shoot())); console.log("было → " + BEFORE); process.exit(0); }

const before: Record<string, Shot[]> = fs.existsSync(BEFORE) ? JSON.parse(fs.readFileSync(BEFORE, "utf8")) : {};
const after = shoot();
const K = 3, FRm = Math.max(...SETS.map((id) => frameOf(dress(base, setOf(id))).FRx));
const cellW = 60 * K, lw = 120, gap = 30;
const cols = Math.max(...ANIMS.map(NF));
const W = lw + 2 * (cols * cellW) + gap + 20;
const rowsN = SETS.length * ANIMS.length * VIEWS.length;
const H = rowsN * (cellW + 16) + SETS.length * ANIMS.length * 30 + 60;
const out = new PC(W, H);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 22; out.data[i + 1] = 19; out.data[i + 2] = 25; out.data[i + 3] = 255; }
const fill = (x: number, y: number, w: number, h: number, c: [number, number, number, number]) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) out.set(x + xx, y + yy, c); };
text(out, "BEFORE", lw + 4, 8, 3, [200, 160, 150, 255]);
text(out, "AFTER", lw + cols * cellW + gap + 4, 8, 3, [160, 220, 150, 255]);
text(out, "GREEN - FOOT  YELLOW - NO-SLIDE SPOT  LINE - GROUND", lw + 220, 14, 2, [200, 200, 190, 255]);
let y = 44;
const slides: string[] = [];
for (const id of SETS) for (const a of ANIMS) {
  const st = frameStep(a);
  text(out, `${id.toUpperCase()}  ${a.toUpperCase()}  ${DATA.anims[a].frames} FR  ${DATA.anims[a].fps} FPS  STEP ${st.toFixed(2)} PX/FR`, 6, y, 2, [255, 216, 100, 255]); y += 26;
  for (const v of VIEWS) {
    text(out, v.toUpperCase(), 6, y + cellW / 2 - 6, 2);
    for (const [side, data] of [[0, before], [1, after]] as const) {
      const shots = data[`${id}/${a}/${v}`]; if (!shots) continue;
      const x00 = lw + side * (cols * cellW + gap);
      shots.forEach((s, i) => {
        const x0 = x00 + i * cellW, FRx = s.w, crop = (FRx - 60) / 2, oy0 = FRx - 60; // клетка 60×60 вокруг ступней
        fill(x0, y, cellW - 2, cellW - 2, (v === "up" || v === "left") ? [38, 46, 52, 255] : [42, 52, 38, 255]);
        const d = Buffer.from(s.px, "base64"), gy = (45 + frameOf(dress(base, setOf(id))).OY) - oy0 + 0.5;
        // линия земли
        fill(x0, y + Math.round(gy * K), cellW - 2, 1, [120, 110, 90, 255]);
        for (let yy = 0; yy < 60; yy++) for (let xx = 0; xx < 60; xx++) {
          const sx = xx + crop, sy = yy + oy0; if (sx < 0 || sy < 0 || sx >= FRx || sy >= FRx) continue;
          const q = (sy * FRx + sx) * 4; if (!d[q + 3]) continue;
          for (let p = 0; p < K; p++) for (let b = 0; b < K; b++) out.set(x0 + xx * K + p, y + yy * K + b, [d[q], d[q + 1], d[q + 2], 255]);
        }
        // метки: где ступня (зелёная) и где должна быть без скольжения (жёлтая) — от первого кадра опоры этой ступни
        for (const f of s.feet) {
          if (!f) continue;
          let k = i; while (k > 0 && shots[k - 1].feet.some((g) => g && g.s === f.s)) k--;
          const f0 = shots[k].feet.find((g) => g && g.s === f.s)!, sh = (i - k) * st;
          const [bx, by] = f0.pts && f.piv !== undefined ? f0.pts[f.piv] : [f0.x, f0.y]; // та же точка стопы (пятка или носок) в первом кадре опоры
          const ex = v === "side" ? bx - sh : v === "left" ? bx + sh : bx, eyy = by;
          const mk = (px: number, py: number, c: [number, number, number, number], o: number) => { const X = x0 + Math.round((px - crop) * K), Y = y + Math.round((py - oy0) * K) + o; fill(X - 1, Y, 3, 3, c); };
          mk(ex, eyy, [255, 220, 60, 255], 4);
          mk(f.x, f.y, [90, 240, 110, 255], 8);
          if (side === 1 && (v === "side" || v === "left") && Math.abs(f.x - ex) > 1) slides.push(`${id}/${a}/${v}/${i}/${f.s}`);
        }
      });
    }
    y += cellW + 16;
  }
}
out.save(path.resolve("tools/out/gear147/anim-b-walkrun.png"));
console.log("монтаж → tools/out/gear147/anim-b-walkrun.png; скольжение > 1 px (вбок):", slides.length ? slides.join(" ") : "нет");
