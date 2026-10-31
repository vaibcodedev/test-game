/**
 * Подбор форм таблицы «уровень × редкость»: npx tsx tools/gen/gear147/tiersearch.ts <ряд> [--write]
 *   ряд: armor (латы, кираса) | helm | pauldrons | leather | cloth
 * Для каждой клетки (ступень × редкость) перебирает формы (покрой, длина, наплечья, ворот, стиль шлема…), рисует иконки (кэш — tools/out/gear147/tiersearch-<ряд>.json)
 * и отжигом выбирает набор, где нет похожих пар (tiermetric.similar: редкости одной ступени, соседние ступени одной редкости) и выполнено правило богатства.
 * Украшения редкости не меняются — только форма. С --write записывает выбор в data/gear147-forms.json → [ряд] (читает tiers.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { PC } from "../canvas";
import { GD, type Slot } from "./gear";
import { icon } from "./icons";
import { clothRobe, leatherCoat, plateArmor, plateHelm, platePauldrons, FORM_OVERRIDE } from "./tiers";
import { colorSimH, featsOf, hist, richScore, simOf } from "./tiermetric";

const ROW = process.argv[2] ?? "armor", WRITE = process.argv.includes("--write");
const RAR = ["common", "rare", "epic", "legendary"];
type Knob = Record<string, any>;
const cart = (o: Record<string, any[]>): Knob[] => Object.entries(o).reduce<Knob[]>((acc, [k, vs]) => acc.flatMap((a) => vs.map((v) => ({ ...a, [k]: v }))), [{}]);
const DEF: Record<string, { slot: Slot; make: (t: number, r: number) => any; knobs: (t: number, r: number) => Knob[]; apply: (it: any, k: Knob, t: number, r: number) => any }> = {
  armor: { slot: "armor", make: plateArmor, knobs: () => cart({ len: [0, 1, 2, 3], shoulders: [0, 1, 2], collar: [0, 1, 2], wide: [0.88, 1, 1.12] }), apply: (it, k) => ({ ...it, ...k }) },
  helm: {
    slot: "helm", make: plateHelm,
    knobs: (t, r) => (t === 3 && r === 3 ? [{}] : cart({ style: ["bascinet", "barbute", "great", "chapel", "nasal", "sallet", "armet", "onion"], neck: ["mail", "gorget", "none"] })),
    apply: (it, k) => (k.style ? { ...it, style: k.style, shape: { ...(it.shape ?? {}), neck: k.neck } } : it),
  },
  // формы по ступени: малая чашка и ламы на ремне — только внизу, крупные — выше; легендарка не бывает мелкой; 81–100 легендарка — стреловидная (mythic)
  pauldrons: {
    slot: "pauldrons", make: platePauldrons,
    knobs: (t, r) => t === 4 && r === 3 ? [{ form: "mythic", lames: 2 }] : cart({ form: [["cop", "lamellar", "spaulder", "angular"], ["cop", "lamellar", "spaulder", "angular", "great"], ["lamellar", "spaulder", "angular", "great", "layered"], ["cop", "lamellar", "spaulder", "angular", "great", "layered"], ["cop", "lamellar", "spaulder", "angular", "great", "layered"]][t].filter((f) => !(r === 3 && (f === "cop" || f === "lamellar")) && !(t >= 3 && r >= 1 && f === "cop") && !(t >= 3 && r >= 2 && f === "lamellar")), lames: [1, 2, 3] }).filter((k) => k.lames === 1 || k.form === "spaulder"),
    apply: (it, k) => ({ ...it, ...k }),
  },
  leather: {
    slot: "armor", make: leatherCoat, knobs: (t, r) => cart({ cut: ["vest", "jacket", "long"], collarHigh: [false, true], pauldronsOnIcon: [false, true], pants: [undefined, "rogue_pants"], ...(r === 3 ? { spikes: [true, "crown"] } : {}) }),
    apply: (it, k) => { const C = { ...it, ...(k.spikes ? { spikes: k.spikes } : {}), cut: k.cut === "long" ? undefined : k.cut, long: k.cut === "long", collarHigh: k.collarHigh, pauldronsOnIcon: k.pauldronsOnIcon && !it.spikes, pants: k.pants }; if (C.breast) C.collarHigh = false; if (C.breast && k.cut === "vest") C.stitch = undefined; else if (C.breast) C.stitch = "tan"; return C; },
  },
  // мантия: короткая туника — только у простых вещей нижних ступеней; эпик и легендарка с 41 ур. — до голени или до пят
  cloth: { slot: "armor", make: clothRobe, knobs: (t, r) => cart({ cut: r >= 2 && t >= 2 ? ["mid", "long"] : r === 3 ? ["mid", "long"] : ["tunic", "mid", "long"], sleeves: [false, true], mantle: [false, true], wide: [0.86, 1, 1.14] }), apply: (it, k, t) => ({ ...it, cut: k.cut === "long" ? undefined : k.cut, sleeves: k.sleeves, mantle: k.mantle ? it.sash : undefined, wide: k.wide }) },
};
const D = DEF[ROW];
if (!D) throw new Error("ряд? " + ROW);
// формы по умолчанию — без прежнего выбора поиска
delete (FORM_OVERRIDE as any)[ROW];

// ---------- кэш вариантов ----------
interface Cand { k: Knob; mask: string; hist: [number, number][]; feats: number; glow: boolean; id?: number }
const cacheF = path.resolve(`tools/out/gear147/tiersearch-${ROW}.json`);
const cache: Record<string, Cand> = fs.existsSync(cacheF) ? JSON.parse(fs.readFileSync(cacheF, "utf8")) : {};
const cands: Cand[][][] = [];
let n = 0, made = 0;
for (let t = 0; t < 5; t++) {
  cands.push([]);
  for (let r = 0; r < 4; r++) {
    const base = D.make(t, r), list: Cand[] = [];
    for (const k of D.knobs(t, r)) {
      const it = D.apply(base, k, t, r), key = `${t}/${r}/${JSON.stringify(k)}`;
      if (!cache[key]) {
        const ic = icon(D.slot, it, "sol", RAR[r]);
        let m = ""; for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) m += (ic.img.get(x, y)?.[3] ?? 0) > 0 ? "1" : "0";
        cache[key] = { k, mask: m, hist: [...hist(ic.img)], feats: featsOf(D.slot, ic).size, glow: ic.emis.length > 0 };
        if (++made % 50 === 0) { fs.writeFileSync(cacheF, JSON.stringify(cache)); console.log("вариантов:", made); }
      }
      list.push({ ...cache[key], id: n++ });
    }
    cands[t].push(list);
  }
}
fs.writeFileSync(cacheF, JSON.stringify(cache));

// ---------- отжиг ----------
const iouS = (a: string, b: string) => { let i = 0, u = 0; for (let q = 0; q < a.length; q++) { const p = a.charCodeAt(q) === 49, w = b.charCodeAt(q) === 49; if (p && w) i++; if (p || w) u++; } return u ? i / u : 0; };
const memo = new Map<string, { bad: boolean; i: number }>();
const pair = (a: Cand, b: Cand) => { const key = a.id + "|" + b.id; let v = memo.get(key); if (!v) { const s = simOf(iouS(a.mask, b.mask), colorSimH(new Map(a.hist), new Map(b.hist))); v = { bad: s.bad, i: s.i }; memo.set(key, v); } return v; };
const sc = (c: Cand, t: number) => richScore(t, c.feats, c.glow, 0);
function cost(sel: number[][]) {
  let bad = 0, soft = 0;
  const C = (t: number, r: number) => cands[t][r][sel[t][r]];
  for (let t = 0; t < 5; t++) for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { const v = pair(C(t, a), C(t, b)); if (v.bad) bad++; soft += Math.max(0, v.i - 0.6); }
  for (let t = 0; t + 1 < 5; t++) for (let r = 0; r < 4; r++) { const v = pair(C(t, r), C(t + 1, r)); if (v.bad) bad++; soft += Math.max(0, v.i - 0.6); }
  for (let t = 0; t + 2 < 5; t++) { const mx = Math.max(...[0, 1, 2, 3].map((r) => sc(C(t, r), t))), mn = Math.min(...[0, 1, 2, 3].map((r) => sc(C(t + 2, r), t + 2))); if (!(mn > mx)) bad++; }
  for (let t = 0; t + 1 < 5; t++) if (sc(C(t, 3), t) > sc(C(t + 1, 2), t + 1) * 1.08) bad++;
  // формы (стиль шлема, форма наплечника): внутри ступени все разные; по ступеням не подряд, у эпиков и легендарок — и через ступень
  const fk = (c: Cand) => c.k.form ?? c.k.style;
  if (fk(C(0, 0)) !== undefined) {
    for (let t = 0; t < 5; t++) for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) if (fk(C(t, a)) && fk(C(t, a)) === fk(C(t, b))) bad++;
    for (let r = 0; r < 4; r++) for (let t = 0; t < 5; t++) for (let u = t + 1; u < 5; u++) if ((u === t + 1 || (r >= 2 && (ROW === "helm" || u === t + 2))) && fk(C(t, r)) && fk(C(t, r)) === fk(C(u, r))) bad++;
  }
  return bad * 100 + soft;
}
// старт — форма по умолчанию (пустые ручки или совпадающие с базовой вещью)
const sel = cands.map((row, t) => row.map((list, r) => { const base = D.make(t, r); const j = list.findIndex((c) => Object.entries(c.k).every(([k, v]) => k === "neck" ? (base.shape?.neck ?? v) === v : k === "cut" ? (base.cut ?? (base.long || base.style === "robe" ? "long" : undefined)) === v : k === "mantle" ? !!base.mantle === v : base[k] === v)); return Math.max(0, j); }));
let best = cost(sel), bestSel = sel.map((r) => r.slice());
// отжиг с нескольких зёрен, берём лучший
for (const sd of [12345, 777, 31337, 4242]) {
  let seed = sd; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cs = sel.map((r) => r.slice()); let cur = cost(cs);
  const N = 60000;
  for (let it = 0; it < N; it++) {
    const T0 = 60 * (1 - it / N) + 0.05, t = Math.floor(rnd() * 5), r = Math.floor(rnd() * 4), old = cs[t][r];
    cs[t][r] = Math.floor(rnd() * cands[t][r].length);
    const c = cost(cs);
    if (c <= cur || rnd() < Math.exp((cur - c) / T0)) { cur = c; if (c < best) { best = c; bestSel = cs.map((q) => q.slice()); } } else cs[t][r] = old;
  }
}
console.log(`ряд ${ROW}: нарушений ${Math.floor(best / 100)}, мягкий штраф ${(best % 100).toFixed(2)}`);
{ // что осталось нарушенным
  const C = (t: number, r: number) => cands[t][r][bestSel[t][r]], L = GD.tiers.levels;
  for (let t = 0; t < 5; t++) for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { const v = pair(C(t, a), C(t, b)); if (v.bad) console.log(`  ✗ ${L[t]} ур.: ${RAR[a]} ~ ${RAR[b]} (IoU ${v.i})`); }
  for (let t = 0; t + 1 < 5; t++) for (let r = 0; r < 4; r++) { const v = pair(C(t, r), C(t + 1, r)); if (v.bad) console.log(`  ✗ ${RAR[r]}: ${L[t]} ~ ${L[t + 1]} ур. (IoU ${v.i})`); }
  for (let t = 0; t + 2 < 5; t++) { const mx = Math.max(...[0, 1, 2, 3].map((r) => sc(C(t, r), t))), mn = Math.min(...[0, 1, 2, 3].map((r) => sc(C(t + 2, r), t + 2))); if (!(mn > mx)) console.log(`  ✗ богатство: ступень ${t + 3} min ${mn} ≤ ступень ${t + 1} max ${mx}`); }
  for (let t = 0; t + 1 < 5; t++) if (sc(C(t, 3), t) > sc(C(t + 1, 2), t + 1) * 1.08) console.log(`  ✗ легендарка ${L[t]} богаче эпика ${L[t + 1]}`);
}
const forms = bestSel.map((row, t) => row.map((j, r) => cands[t][r][j].k));
for (let t = 0; t < 5; t++) console.log(GD.tiers.levels[t], forms[t].map((k) => JSON.stringify(k)).join(" | "));
if (WRITE) {
  const f = path.resolve("data/gear147-forms.json"), J = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { _doc: "Формы вещей таблицы «уровень × редкость» (ряд → [ступень][редкость] → ручки формы), подобраны tools/gen/gear147/tiersearch.ts; читает tools/gen/gear147/tiers.ts." };
  J[ROW] = forms;
  fs.writeFileSync(f, JSON.stringify(J, null, 1) + "\n");
  console.log("→ data/gear147-forms.json → " + ROW);
}
void PC;
