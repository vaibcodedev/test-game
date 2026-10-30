/**
 * «Иконка = вещь на герое» (docs/art/gear.md): для каждой вещи сравниваются набор деталей и палитра иконки и слоя на герое.
 * Деталь части — поле ft (шлем-конструктор helm.ts ставит его сам) или по имени группы (таблица DETAIL ниже — общий словарь деталей для обеих отрисовок).
 * Проверки: детали иконки = детали героя; палитра (материалы) иконки = палитра героя; каждая деталь читается на герое (≥ 1–2 px хотя бы в одном направлении)
 * и на иконке (≥ 2 px). Расхождение — ошибка.
 */
import { renderLayers, type Look, type Part } from "../hero147/base_b";
import { GD, SLOTS, baseView, dress, viewLook, type SetDef, type Slot, type View4 } from "./gear";
import { icon, type IP } from "./icons";
import { clothRobe, leatherCoat, plateArmor, plateHelm, platePauldrons } from "./tiers";

export interface Item { id: string; name: string; slot: Slot; it: any; rarity: string; level: number; group: string }
const RAR = ["common", "rare", "epic", "legendary"];
/** все вещи: сеты из data/gear147.json и таблица уровней (латы: шлем, кираса, наплечники; кожа; ткань — 5 ступеней × 4 редкости) */
export function allItems(): Item[] {
  const out: Item[] = [];
  for (const [sid, s] of Object.entries(GD.sets) as [string, SetDef][]) for (const sl of SLOTS) if (s.items[sl]) out.push({ id: `${sid}/${sl}`, name: s.items[sl].name, slot: sl, it: s.items[sl], rarity: s.rarity, level: s.level, group: sid });
  const T = GD.tiers;
  const rows: [string, Slot, (t: number, r: number) => any][] = [["латы", "helm", plateHelm], ["латы", "armor", plateArmor], ["латы", "pauldrons", platePauldrons], ["кожа", "armor", leatherCoat], ["ткань", "armor", clothRobe]];
  for (const [mat, sl, mk] of rows) for (let t = 0; t < 5; t++) for (let r = 0; r < 4; r++) out.push({ id: `tier/${mat}/${sl}/${T.levels[t]}/${RAR[r]}`, name: `${mat} ${sl} ${T.levels[t]} ур. ${RAR[r]}`, slot: sl, it: mk(t, r), rarity: RAR[r], level: T.levels[t], group: `tier-${mat}` });
  return out;
}

/** общий словарь деталей: деталь → [имена групп частей иконки, имена групп частей героя] (для частей без ft) */
const DETAIL: Record<Slot, [string, RegExp, RegExp][]> = {
  helm: [
    ["horns", /^horn/, /^h_horn/], ["spikes", /^spk$/, /^h_spk$/], ["visor", /^faceR?$/, /^h_face$/], ["eyes", /^eye$/, /^(h|hd)_eye$/],
    ["browTrim", /^trim$/, /^h_trim$/], ["gem", /^gem$/, /^h_gem$/], ["mask", /^mask/, /^hd_mask$/], ["seam", /^seam$/, /^hd_seam$/],
    ["face", /^(slit|skin|skinN|eyesF)$/, /^$/], ["crest", /^crest/, /^crest/],
  ],
  pauldrons: [
    ["trim", /^trim$/, /^p_trim/], ["rivets", /^(rivet|riv|lameR\d)$/, /^p_riv/], ["filigree", /^fil$/, /^p_fil/], ["gem", /^gemS?$/, /^p_gem/],
    ["cracks", /^crack$/, /^p_crack/], ["spikes", /^spH?$/, /^p_spike/], ["strap", /^(strap|buck)$/, /^p_(strap|buck)/],
  ],
  armor: [
    ["breastplate", /^plate[HL]?$/, /^(a|c)_plate/], ["inlay", /^inlay$/, /^a_inlay$/], ["filigree", /^fil$/, /^a_fil$/], ["rivets", /^riv$/, /^(a_riv|c_riv|c_sriv)$/],
    ["gem", /^(gGem|gem)$/, /^(a|c|r)_gem$/], ["cracks", /^crack$/, /^(a|c)_crack$/], ["crest", /^crest/, /^crest/], ["spikes", /^(fins|finsH|rSp)$/, /^(a_elbS|c_spk|r_spk)/],
    ["tabard", /^tab$/, /^a_tabard$/], ["tabardTrim", /^tabH$/, /^a_tabH$/], ["kant", /^kant$/, /^a_kant$/], ["mythic", /^(m(Fin|Halo|Seam|Cry)|star)$/, /^(a|c|r)_myth/],
    ["engrave", /^eng$/, /^a_engr$/], ["strap", /^strap$/, /^c_strap$/], ["sashTails", /^(tail|knot)$/, /^(c|r)_(tail|knot)/], ["lacing", /^lace$/, /^c_lace$/],
    ["pouch", /^pouch$/, /^c_pouch$/], ["stitch", /^stitch$/, /^c_(stitch|skst)$/], ["collarHigh", /^hcol$/, /^c_hcol$/],
    ["panel", /^panel$/, /^r_panel$/], ["embroid", /^emb$/, /^r_emb$/], ["hemTrim", /^(hem|mTrim)$/, /^r_hem/], ["mantle", /^mantle$/, /^r_mantle$/],
    ["halo", /^halo$/, /^r_halo$/], ["wings", /^wingsB$/, /^r_wing/], ["runes", /^rune$/, /^r_rune$/], ["sleeves", /^sleeve$/, /^r_sleeve/], ["studs", /^studs$/, /^a_studs$/],
  ],
  gloves: [
    ["cuff", /^cuffH?$/, /^gl_c[LR]$/], ["cuffSpike", /^cspk$/, /^gl_s/], ["claws", /^(armSp|claws)$/, /^gl_claw/], ["gem", /^cGem$/, /^gl_g/],
    ["cuffTrim", /^cTrim$/, /^gl_t/], ["rivets", /^(criv)$/, /^gl_riv/], ["bracer", /^(bracer|bStrap|bBuck)$/, /^gl_br/],
  ],
  boots: [
    ["stripe", /^stripe$/, /^b_st[LR]/], ["strap", /^(strap|buck)$/, /^b_(strap|buck)/], ["kneeSpike", /^kspk$/, /^b_ks/], ["topCuff", /^tcuff$/, /^b_tc/],
    ["bigWing", /^bwing$/, /^b_bw/], ["spurs", /^spur$/, /^b_spur/], ["kneeRivet", /^riv$/, /^b_kriv/], ["stitch", /^bstitch$/, /^b_stitch/],
  ],
  cloak: [["hem", /^(hem|hemB)$/, /^cape_hem$/], ["mantle", /^mantT?$/, /^cape_mant/], ["clasps", /^clasp$/, /^cape_trim$/], ["claspGem", /^claspG$/, /^cape_gem$/], ["crest", /^crest/, /^crest/], ["fringe", /^fringe$/, /^sc_fr/]],
  weapon: [
    ["gem", /^gem$/, /^w_gem$/], ["pommelGem", /^pGem$/, /^w_pgem$/], ["fuller", /^fuller$/, /^w_fuller$/], ["fire", /^fire$/, /^w_fire$/], ["rune", /^(rn\d|pg\d)$/, /^w_rune$/],
    ["cracks", /^crack$/, /^w_crack$/], ["lugs", /^lugs$/, /^w_lugs$/], ["beak", /^beak$/, /^w_beak$/], ["spike", /^spikeT$/, /^w_spike$/],
  ],
};
const featOf = (slot: Slot, g: string, ft: string | undefined, side: 0 | 1): string | undefined => { if (ft) return ft; for (const d of DETAIL[slot]) if ((d[1 + side] as RegExp).test(g)) return d[0]; return undefined; };

const MATKEY = new Map<string, string>();
for (const [k, v] of Object.entries(GD.materials) as [string, string[]][]) if (!MATKEY.has(v.join().toLowerCase())) MATKEY.set(v.join().toLowerCase(), k);
const hex = (c: number[]) => "#" + c.slice(0, 3).map((x) => x.toString(16).padStart(2, "0")).join("");
export const matOf = (ramp: number[][]): string | undefined => MATKEY.get(ramp.map(hex).join());

export const LOOK: Look = { fac: "sol", sex: "m", hair: "tousled" };
const VIEWS: View4[] = ["down", "side", "up"];
export function heroLook(x: Item) { const set: SetDef = { name: x.name, rarity: x.rarity, level: x.level, items: { [x.slot]: x.it } }; return dress(LOOK, set, "sol", [x.slot]); }

export interface Match { item: Item; iconF: Set<string>; heroF: Set<string>; iconM: Set<string>; heroM: Set<string>; heroVis: Record<string, number>; iconVis: Record<string, number>; fails: string[] }
/** детали, которые на герое физически точка (1 px): им хватает 1 px */
const TINY = new Set(["rivets", "gem", "eyes", "pommelGem", "claspGem", "kneeRivet", "seam"]);
export function match(x: Item): Match {
  const ic = icon(x.slot, x.it, "sol", x.rarity);
  const iconF = new Set<string>(), iconM = new Set<string>(), iconVis: Record<string, number> = {};
  ic.ip.forEach((p: IP, k: number) => { const f = featOf(x.slot, p.g, p.ft, 0); const m = matOf(p.ramp as any); if (m) iconM.add(m); if (f) { iconF.add(f); iconVis[f] = (iconVis[f] ?? 0) + ic.vis[k]; } });
  const lk = heroLook(x), heroF = new Set<string>(), heroM = new Set<string>(), heroVis: Record<string, number> = {};
  const mine = (p: Part) => p.slot === x.slot || p.slot === "crest";
  for (const v of VIEWS) {
    const cap: Part[] = [];
    renderLayers(viewLook(lk, v), baseView(v), "idle", 0, [(p) => { cap.push(p); return false; }]);
    const fs = new Set<string>();
    for (const p of cap) { if (!mine(p)) continue; const m = matOf(p.ramp as any); if (m) heroM.add(m); const f = featOf(x.slot, p.g, (p as any).ft, 1); if (f) { heroF.add(f); fs.add(f); } }
    const fl = [...fs], imgs = renderLayers(viewLook(lk, v), baseView(v), "idle", 0, [() => true, ...fl.map((f) => (p: Part) => mine(p) && featOf(x.slot, p.g, (p as any).ft, 1) === f)]);
    const full = imgs[0].img;
    fl.forEach((f, j) => { const fi = imgs[j + 1].img; let n = 0; for (let y = 0; y < fi.h; y++) for (let xx = 0; xx < fi.w; xx++) if (fi.has(xx, y) && full.get(xx, y).join() === fi.get(xx, y).join()) n++; heroVis[f] = Math.max(heroVis[f] ?? 0, n); });
    // лицо в открытом шлеме: видимые пиксели головы основы
    if (x.slot === "helm" && v === "down") { const [all, noHead] = renderLayers(viewLook(lk, v), baseView(v), "idle", 0, [() => true, (p) => p.g !== "head"]); let n = 0; for (let y = 0; y < all.img.h; y++) for (let xx = 0; xx < all.img.w; xx++) if (all.img.has(xx, y) && (!noHead.img.has(xx, y) || all.img.get(xx, y).join() !== noHead.img.get(xx, y).join())) n++; if (n >= 3) { heroF.add("face"); heroVis.face = n; } }
  }
  const fails: string[] = [];
  for (const f of iconF) if (!heroF.has(f)) fails.push(`деталь «${f}» на иконке есть, на герое нет`);
  for (const f of heroF) if (!iconF.has(f)) fails.push(`деталь «${f}» на герое есть, на иконке нет`);
  for (const f of heroF) if (iconF.has(f) && (heroVis[f] ?? 0) < (TINY.has(f) ? 1 : 2)) fails.push(`деталь «${f}» на герое не читается (${heroVis[f] ?? 0} px)`);
  for (const f of iconF) if ((iconVis[f] ?? 0) < 2) fails.push(`деталь «${f}» на иконке не видна (${iconVis[f] ?? 0} px)`);
  for (const m of iconM) if (!heroM.has(m)) fails.push(`материал «${m}» на иконке есть, на герое нет`);
  for (const m of heroM) if (!iconM.has(m)) fails.push(`материал «${m}» на герое есть, на иконке нет`);
  return { item: x, iconF, heroF, iconM, heroM, heroVis, iconVis, fails };
}

// ---------------- монтажи: icon-vs-hero.png (пара «иконка | герой ×3 | крупно вещь») и all-items.png (все вещи рядом, эталоны первыми) ----------------
import path from "node:path";
import fs from "node:fs";
import { PC, type RGBA } from "../canvas";
import { text } from "../mobs/lib";
import { cell } from "./icons";
const BG: RGBA = [24, 20, 26, 255], GRASS: RGBA = [62, 84, 52, 255], GOLD: RGBA = [255, 216, 100, 255], DIM: RGBA = [200, 190, 170, 255], RED: RGBA = [255, 110, 90, 255], OK: RGBA = [140, 220, 140, 255];
function heroCrop(x: Item) {
  const lk = heroLook(x), mine = (p: Part) => p.slot === x.slot || p.slot === "crest";
  const [all, it] = renderLayers(viewLook(lk, "down"), "down", "idle", 0, [() => true, mine]);
  const bb = (im: typeof all.img) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (let y = 0; y < im.h; y++) for (let xx = 0; xx < im.w; xx++) if (im.has(xx, y)) { x0 = Math.min(x0, xx); y0 = Math.min(y0, y); x1 = Math.max(x1, xx); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
  return { img: all.img, body: bb(all.img), item: bb(it.img) };
}
function blitCv(c: PC, im: any, bx: number[], ox: number, oy: number, K: number, bg: RGBA) {
  const w = bx[2] - bx[0] + 1, h = bx[3] - bx[1] + 1;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) c.set(ox + (x + 1) * K + a, oy + (y + 1) * K + b, bg);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const X = bx[0] + x, Y = bx[1] + y; if (X < 0 || Y < 0 || X >= im.w || Y >= im.h || !im.has(X, Y)) continue; const q = im.get(X, Y); for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) c.set(ox + (x + 1) * K + a, oy + (y + 1) * K + b, [q[0], q[1], q[2], 255]); }
  return [(w + 2) * K, (h + 2) * K];
}
const blitPC = (c: PC, s: PC, ox: number, oy: number, k: number) => { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const q = s.get(x, y); if (!q || !q[3]) continue; for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) c.set(ox + x * k + a, oy + y * k + b, q); } };
export function runMatch(filter?: string) {
  const items = allItems().filter((x) => !filter || x.id.includes(filter));
  const res = items.map(match);
  let bad = 0;
  for (const r of res) if (r.fails.length) { bad++; console.log(`✗ ${r.item.id} (${r.item.name}):\n   ` + r.fails.join("\n   ")); }
  console.log(`иконка = герой: ${items.length - bad} из ${items.length} вещей без расхождений`);
  fs.writeFileSync(path.resolve("tools/out/gear147/icon-vs-hero.json"), JSON.stringify(res.map((r) => ({ id: r.item.id, fails: r.fails, icon: [...r.iconF], hero: [...r.heroF], heroPx: r.heroVis, mats: [...r.iconM] })), null, 1));
  // icon-vs-hero.png
  const COLS = 3, bw = 470, bh = 196, rows = Math.ceil(res.length / COLS);
  const c = new PC(COLS * bw + 20, 70 + rows * bh);
  for (let i = 0; i < c.data.length; i += 4) { c.data[i] = BG[0]; c.data[i + 1] = BG[1]; c.data[i + 2] = BG[2]; c.data[i + 3] = 255; }
  text(c, `ИКОНКА | ГЕРОЙ ВНИЗ ×3 | КРУПНО ВЕЩЬ · ${items.length - bad}/${items.length} СОВПАДАЮТ (ДЕТАЛИ И ПАЛИТРА)`, 20, 16, 3, GOLD);
  res.forEach((r, n) => {
    const x0 = 10 + (n % COLS) * bw, y0 = 60 + Math.floor(n / COLS) * bh;
    text(c, r.item.name.toUpperCase().slice(0, 44), x0, y0, 1, r.fails.length ? RED : OK);
    blitPC(c, cell(icon(r.item.slot, r.item.it, "sol", r.item.rarity).img, r.item.rarity), x0, y0 + 14, 3);
    const h = heroCrop(r.item), bx = [h.body[0] - 1, h.body[1] - 1, h.body[2] + 1, h.body[3] + 1];
    const K = Math.max(1, Math.min(3, Math.floor(176 / (bx[3] - bx[1] + 3))));
    const [w1] = blitCv(c, h.img, bx, x0 + 152, y0 + 14, K, GRASS);
    const ib = [h.item[0] - 2, h.item[1] - 2, h.item[2] + 2, h.item[3] + 2], K2 = Math.max(2, Math.min(8, Math.floor(Math.min(176 / (ib[3] - ib[1] + 3), (bw - 172 - w1) / (ib[2] - ib[0] + 3)))));
    blitCv(c, h.img, ib, x0 + 160 + w1, y0 + 14, K2, GRASS);
  });
  c.save(path.resolve("tools/out/gear147/icon-vs-hero.png"));
  // all-items.png — эталоны детализации первыми
  const refs = ["chaos-knight/helm", "rogue-chaos/armor"], ord = [...res.filter((r) => refs.includes(r.item.id)), ...res.filter((r) => !refs.includes(r.item.id))];
  const AC = 10, aw = 214, ah = 170, A = new PC(AC * aw + 20, 70 + Math.ceil(ord.length / AC) * ah);
  for (let i = 0; i < A.data.length; i += 4) { A.data[i] = BG[0]; A.data[i + 1] = BG[1]; A.data[i + 2] = BG[2]; A.data[i + 3] = 255; }
  text(A, "ВСЕ ВЕЩИ · ИКОНКА ×2 И ГЕРОЙ ×2 · ПЕРВЫЕ ДВЕ — ЭТАЛОН ДЕТАЛИЗАЦИИ (РОГАТЫЙ ШЛЕМ ХАОСА, КОЖАНАЯ КИРАСА ХАОСА)", 20, 16, 2, GOLD);
  ord.forEach((r, n) => {
    const x0 = 10 + (n % AC) * aw, y0 = 50 + Math.floor(n / AC) * ah;
    text(A, (n < 2 ? "ЭТАЛОН · " : "") + r.item.name.toUpperCase().slice(0, 30), x0, y0, 1, n < 2 ? GOLD : DIM);
    blitPC(A, cell(icon(r.item.slot, r.item.it, "sol", r.item.rarity).img, r.item.rarity), x0, y0 + 14, 2);
    const h = heroCrop(r.item), bx = [h.body[0] - 1, h.body[1] - 1, h.body[2] + 1, h.body[3] + 1];
    blitCv(A, h.img, bx, x0 + 100, y0 + 14, (bx[3] - bx[1]) > 70 ? 1 : 2, GRASS);
  });
  A.save(path.resolve("tools/out/gear147/all-items.png"));
  console.log("→ tools/out/gear147/icon-vs-hero.png, all-items.png, icon-vs-hero.json");
  return bad;
}
