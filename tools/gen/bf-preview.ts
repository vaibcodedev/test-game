/** Лист «до | после» объёмного декора Полей: tools/out/bf-volume/[horses-|v2-]sheet-x1.png и sheet-x3.png (до — кадры из client/public/assets/objects, после — генераторы).
 *  HORSES=1 — только кони и скелеты; V2=1 — воронки, гарь, катапульты, стойки, столы. Запуск: npx tsx tools/gen/bf-preview.ts */
import { PNG } from "pngjs";
import fs from "node:fs";
import { PC, hex } from "./canvas";
import { BF_PROPS } from "./bf-props";
import { BF_MORE, BF_MORE_GROUPS } from "./bf-more";
import { BF_HORSES_ART, BF_HORSES_GROUPS } from "./bf-horses";
const read = (f: string) => { const p = PNG.sync.read(fs.readFileSync(f)); const pc = new PC(p.width, p.height); pc.data.set(p.data); return pc; };
const old = (id: string) => { const f = `client/public/assets/objects/${id}.png`; return fs.existsSync(f) ? read(f) : null; };
const hero = (() => { const s = read("client/public/assets/units/warrior.png"); const h = new PC(32, 32); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const p = s.get(x, y); if (p) h.set(x, y, p); } return h; })();
/** Живой боевой конь фракции (лист маунтов, вид вправо, покой + передний слой), обрезан по содержимому — для сравнения. */
const liveHorse = (umb: boolean): PC | null => {
  const f = `client/public/assets/mounts/war_horse${umb ? "_umbrath" : ""}.png`;
  if (!fs.existsSync(f)) return null;
  const sh = read(f), N = 120, col = 20, a = new PC(N, N);
  for (const row of [2, 6]) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = sh.get(col * N + x, row * N + y); if (c && c[3]) a.set(x, y, c); }
  let x0 = N, y0 = N, x1 = -1, y1 = -1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (a.alpha(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const o = new PC(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.set(x, y, a.get(x0 + x, y0 + y)!);
  return o;
};
const GROUPS: [string, string[]][] = [
  ["воронки", ["bf_crater_a", "bf_crater_b", "bf_crater_c", "bf_crater_d"]],
  ["гарь", ["bf_scorch", "bf_scorch_b", "bf_scorch_c"]],
  ...BF_MORE_GROUPS,
  ...BF_HORSES_GROUPS,
];
const V2 = !!process.env.V2, HORSES = !!process.env.HORSES;
const keep = HORSES ? BF_HORSES_GROUPS.map(([t]) => t) : ["воронки", "гарь", "катапульты", "стойка щитов", "стол с картой"];
const all: Record<string, () => PC> = { ...BF_PROPS, ...BF_MORE, ...BF_HORSES_ART };
const LEAD: Record<string, PC | null> = HORSES ? { "кони Сольгарда": liveHorse(false), "кони Умбрата": liveHorse(true) } : {};
const rows = GROUPS.filter(([t]) => !(V2 || HORSES) || keep.includes(t)).map(([title, ids]) => ({ title, lead: LEAD[title] ?? null, items: ids.filter((i) => all[i]).map((id) => ({ id, before: old(id), after: all[id]() })) }));
const grass = hex("#4c7a3a"), grass2 = hex("#46722f"), GAP = 10;
const build = (k: number, name: string) => {
  const rowH = rows.map((r) => Math.max(40, r.lead?.h ?? 0, ...r.items.map((i) => Math.max(i.after.h, i.before?.h ?? 0))) + 8);
  const rowW = rows.map((r) => r.items.reduce((w, i) => w + (i.before ? i.before.w + 6 : 0) + i.after.w + GAP + 10, 0) + 40 + (r.lead ? r.lead.w + 12 : 0));
  const W = Math.max(...rowW), H = rowH.reduce((a, b) => a + b, 0);
  const out = new PC(W * k, H * k);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.set(x, y, ((x / k | 0) * 7 + (y / k | 0) * 13) % 11 === 0 ? grass2 : grass);
  const put = (p: PC, dx: number, dy: number) => { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const c = p.get(x, y)!; if (!c[3]) continue; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const bg = out.get((dx + x) * k + i, (dy + y) * k + j)!, a = c[3] / 255; out.set((dx + x) * k + i, (dy + y) * k + j, [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a), 255]); } } };
  let y0 = 0;
  rows.forEach((r, ri) => {
    const by = y0 + rowH[ri] - 4; put(hero, 0, by - 32); let x = 36;
    if (r.lead) { put(r.lead, x, by - r.lead.h); x += r.lead.w + 12; }
    for (const it of r.items) {
      if (it.before) { put(it.before, x, by - it.before.h); x += it.before.w + 6; }
      put(it.after, x, by - it.after.h); x += it.after.w + GAP;
      if (it.before) for (let yy = 0; yy < 30; yy++) out.set((x - GAP - it.after.w - 3) * k, (by - 30 + yy) * k, [255, 255, 255, 120]);
      x += 10;
    }
    y0 += rowH[ri];
  });
  fs.mkdirSync("tools/out/bf-volume", { recursive: true });
  out.save(`tools/out/bf-volume/${name}`);
};
const pre = HORSES ? "horses4-" : V2 ? "v2-" : "";
build(1, pre + "sheet-x1.png"); build(3, pre + "sheet-x3.png");
console.log(rows.map((r) => r.title + ":" + r.items.length).join(" | "));
