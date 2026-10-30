/**
 * Крупное оружие и особый удар: npx tsx tools/gen/gear147/special.ts [set=chaos-knight] → tools/out/gear147/knight-chaos-special.png
 * Обычный удар двуручным | особый (data/gear147.json → weapon.special), 4 направления, зум 2, кадр оружия (weapon.frame), день и ночь (особый).
 */
import path from "node:path";
import { PC, type RGBA } from "../canvas";
import { text } from "../mobs/lib";
import { DATA, NF, frameOf, type AnimId, type Look } from "../hero147/base_b";
import { VIEWS4, dress, renderView, setOf } from "./gear";

const id = process.argv[2] ?? "chaos-knight", set = setOf(id), wp = set.items.weapon;
const L: Look = { fac: "sol", sex: "m", hair: "tousled" }, lk = dress(L, set, "sol");
const { FRx: S, OX, OY } = frameOf(lk), K = 2, fw = S * K, lw = 120;
const BG: RGBA = [24, 20, 26, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255];
const VN: Record<string, string> = { down: "ВНИЗ", up: "ВВЕРХ", side: "ВПРАВО", left: "ВЛЕВО" };
const rows: { a: AnimId; night: boolean; title: string }[] = [
  { a: "atk2h", night: false, title: "ОБЫЧНЫЙ УДАР ДВУРУЧНЫМ" },
  ...(wp.special as AnimId[]).map((a) => ({ a, night: false, title: "ОСОБЫЙ: " + DATA.anims[a].name.toUpperCase() })),
  ...(wp.special as AnimId[]).map((a) => ({ a, night: true, title: "ОСОБЫЙ · НОЧЬ — ОГНЕННЫЙ СЛЕД СВЕТИТСЯ" })),
];
const maxN = Math.max(...rows.map((r) => NF(r.a)));
const W = lw + maxN * fw + 20, H = 110 + rows.length * (30 + VIEWS4.length * fw);
const c = new PC(W, H);
for (let i = 0; i < c.data.length; i += 4) { c.data[i] = BG[0]; c.data[i + 1] = BG[1]; c.data[i + 2] = BG[2]; c.data[i + 3] = 255; }
text(c, `КРУПНОЕ ЛЕГЕНДАРНОЕ ОРУЖИЕ · ${wp.name.toUpperCase()} · ДЛИНА ≈ ${((wp.length + 5.4) / 30).toFixed(2).replace(".", ",")} РОСТА ГЕРОЯ · КАДР ${S}×${S}`, 20, 16, 3, GOLD);
text(c, `В ПОДСКАЗКЕ: «${(wp.tooltip ?? []).join(" · ")}» · КАДР РАСШИРЯЕТСЯ ПОД ОРУЖИЕ, СТУПНИ В (${24 + OX}, ${45 + OY}) · ЗУМ 2`, 20, 54, 2, DIM);
let y = 90;
for (const r of rows) {
  text(c, `${r.title} · ${NF(r.a)} КАДРОВ · ${DATA.anims[r.a].fps} В СЕКУНДУ`, 20, y, 2, GOLD); y += 26;
  for (const v of VIEWS4) {
    text(c, VN[v], 10, y + fw / 2 - 6, 2);
    for (let i = 0; i < NF(r.a); i++) {
      const x0 = lw + i * fw, f = renderView(lk, v, r.a, i);
      const bg: RGBA = r.night ? [16, 22, 18, 255] : v === "up" || v === "left" ? [40, 48, 54, 255] : [44, 54, 40, 255];
      for (let yy = 0; yy < fw - 2; yy++) for (let xx = 0; xx < fw - 2; xx++) c.set(x0 + xx, y + yy, bg);
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if (f.img.has(xx, yy)) {
        let q = f.img.get(xx, yy); if (r.night) q = [q[0] * 0.34, q[1] * 0.36, q[2] * 0.56].map(Math.round) as any;
        for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) c.set(x0 + xx * K + a, y + yy * K + b, [q[0], q[1], q[2], 255]);
      }
      if (r.night) for (const [ex, ey, col] of f.emis) for (const [dx, dy, al] of [[0, 0, 255], [1, 0, 110], [-1, 0, 110], [0, 1, 110], [0, -1, 110]] as [number, number, number][]) for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) c.set(x0 + (ex + dx) * K + a, y + (ey + dy) * K + b, [col[0], al === 255 ? col[1] : Math.round(col[1] * 0.6), al === 255 ? col[2] : Math.round(col[2] * 0.5), al]);
    }
    y += fw;
  }
  y += 4;
}
c.save(path.resolve("tools/out/gear147/knight-chaos-special.png"));
console.log("→ tools/out/gear147/knight-chaos-special.png");
