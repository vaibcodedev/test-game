/** Крупный план «до | после» (×3) для теней декора: до — коммит HEAD (tools/out/shadows/old), после — рабочее дерево. */
import { PNG } from "pngjs";
import fs from "node:fs";
import { PC, hex } from "./gen/canvas";
import { LOOKS } from "./gen/walls141-lib";
const OLD = "./out/shadows/old/tools/gen/";
const read = (f: string) => { const p = PNG.sync.read(fs.readFileSync(f)); const pc = new PC(p.width, p.height); pc.data.set(p.data); return pc; };
async function set(root: string) {
  const [pr, vw, vb, bd, lib] = await Promise.all([import(root + "walls141-props"), import(root + "volume-world"), import(root + "volume-bf"), import(root + "walls141-buildings"), import(root + "walls141-lib")]);
  const solH = bd.buildingsFor(lib.LOOKS.sol_capital), umbH = bd.buildingsFor(lib.LOOKS.umb_capital);
  const m: Record<string, () => PC> = {
    waystone: pr.teleportStone, well: pr.well, barrel: pr.barrel, crate: pr.crate, cauldron: pr.cauldron, stall: () => pr.stall(hex("#c03838"), "food"),
    lamp: vw.WORLD_VOLUME.lamp, tent: vw.WORLD_VOLUME.tent, wagon: vb.BF_VOLUME.bf_wagon_broken_a, siege: vb.BF_VOLUME.bf_siege_tower,
    sol_house: () => solH.house("clean", 1), umb_house: () => (umbH.house ?? Object.values(umbH)[0])("clean", 1),
  };
  return m;
}
void LOOKS;
const hero = new PC(32, 32); { const s = read("client/public/assets/units/warrior.png"); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const p = s.get(x, y); if (p) hero.set(x, y, p); } }
const grass = hex("#4c7a3a"), grass2 = hex("#46722f");
const K = 3, GAP = 14;
async function main() {
  const A = await set(OLD), B = await set("./gen/");
  const names = Object.keys(B);
  const items: { name: string; a: PC; b: PC }[] = [];
  for (const n of names) { if (typeof A[n] !== 'function' || typeof B[n] !== 'function') { console.error('нет', n, typeof A[n], typeof B[n]); continue; } items.push({ name: n, a: A[n](), b: B[n]() }); }
  // статуи: «до» — со старой овальной тенью
  process.env.OLD_SHADOW = "1"; const st = await import("./gen/statues"); const sa = [st.solStatue(), st.umbStatue()]; delete process.env.OLD_SHADOW; const sb = [st.solStatue(), st.umbStatue()];
  items.push({ name: "sun_statue", a: sa[0], b: sb[0] }, { name: "umb_statue", a: sa[1], b: sb[1] });
  const ROWW = 1000, rows: typeof items[] = [[]]; let w = 0;
  for (const it of items) { const iw = (it.a.w + it.b.w + 14) + GAP; if (w + iw > ROWW && rows[rows.length - 1].length) { rows.push([]); w = 0; } rows[rows.length - 1].push(it); w += iw; }
  const rh = rows.map((r) => Math.max(...r.map((i) => Math.max(i.a.h, i.b.h))) + 10);
  const out = new PC(ROWW * K, rh.reduce((x, y) => x + y, 0) * K);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.set(x, y, ((x / K | 0) * 7 + (y / K | 0) * 13) % 11 === 0 ? grass2 : grass);
  let y0 = 0;
  rows.forEach((r, ri) => { let x = 4; const by = y0 + rh[ri] - 5; for (const it of r) {
    for (const [p, dx] of [[it.a, 0], [it.b, it.a.w + 14]] as const) { for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) { const c = p.get(xx, yy); if (c && c[3]) { const bg = out.get((x + dx + xx) * K, (by - p.h + yy) * K)!; const a = c[3] / 255; const col: [number, number, number, number] = [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a), 255]; out.rect((x + dx + xx) * K, (by - p.h + yy) * K, K, K, col); } } }
    // разделитель «до | после»
    out.rect((x + it.a.w + 6) * K, (by - Math.max(it.a.h, it.b.h)) * K, 1, Math.max(it.a.h, it.b.h) * K, [255, 255, 255, 90]);
    x += it.a.w + it.b.w + 14 + GAP; } y0 += rh[ri]; });
  void hero;
  out.save("tools/out/shadows/zoom.png"); console.log(out.w, out.h, names.join(","));
}
main();
