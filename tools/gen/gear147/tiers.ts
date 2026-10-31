/**
 * Вещи таблицы «уровень × редкость» (docs/art/gear.md): у каждой ступени СВОЙ набор форм и стиль, каждая вещь — своё описание
 * (форма, материалы, украшения) для иконки и героя — не перекраска одной формы.
 *   1–20  — грубое железо, кольчуга, стёганка;   21–40 — ровная сталь, бригантины;   41–60 — калёная многослойная (ламелляр);
 *   61–80 — рельеф и позолота;                   81–100 — звёздное серебро, холодное сияние.
 * Редкость — украшения внутри ступени (обычная — голый материал, редкая — кант, заклёпки, цветная ткань, эпическая — гравировка, самоцвет, герб,
 * легендарная — особая форма, шипы/крылья/рога, свечение). Соседние ступени одной редкости и редкости одной ступени — разные силуэты и цвет (tier.ts проверяет).
 * Используют tier.ts (лист, богатство, сходство) и match.ts (иконка = герой).
 */
import fs from "node:fs";
import path from "node:path";
import { GD } from "./gear";
const T = GD.tiers;
/** уровень богатства: ступень весит больше редкости (легендарка N ≈ эпик N+1, ступень N+2 богаче любой вещи N) */
export const LV = (t: number, r: number) => 2.2 * t + 0.8 * r;
/** объём силуэта на герое: растёт со ступенью (gear.md §2: мелкий простой силуэт на 1–20 → самый крупный на 81–100), редкость добавляет чуть-чуть */
export const BULK = (t: number, r: number) => t + 0.2 * r;
/** прежний масштаб иконки по ступени — больше не используется: все иконки одного размера (icons.ts → fit) */
export const sc = (t: number, r: number) => (0.66 + 0.055 * t) * [1.03, 0.97, 0.93, 0.87][r];
const pick = <X>(t: number, r: number, m: X[][]): X => m[t][r];
/**
 * Формы, подобранные tiersearch.ts (data/gear147-forms.json → [ряд][ступень][редкость]): разные силуэты внутри ступени и между соседними ступенями,
 * богатство по правилам. Перекрывают форму по умолчанию из таблиц ниже; украшения редкости не трогают.
 */
export const FORM_OVERRIDE: Record<string, any[][]> = fs.existsSync(path.resolve("data/gear147-forms.json")) ? JSON.parse(fs.readFileSync(path.resolve("data/gear147-forms.json"), "utf8")) : {};
const fo = (key: string, t: number, r: number): any => FORM_OVERRIDE[key]?.[t]?.[r] ?? {};

// ---------------- шлемы: 20 разных форм ----------------
export function plateHelm(t: number, r: number) {
  const m = T.plate, P = m.base[t], Tr = m.trim[t], Cl = m.cloth[t], G = m.glow[t] ?? "eye_glow";
  const base = { plate: P, accent: P, trim: P, mail: "mail" };
  const H: any[][] = [
    [ // 1–20: шапель, норманнский с наносником, ранний топфхельм, рогатый конус
      { ...base, style: "chapel", shape: { brim: 2.6, peak: 0 } },
      { ...base, style: "nasal", trim: Tr, rimTrim: true, rivets: true, shape: { peak: 2.8 } },
      { ...base, style: "great", trim: Tr, rivets: true, band: true, gem: "sapphire", shape: { width: 0.96 } },
      { ...base, style: "nasal", accent: Cl, trim: Tr, shape: { cover: "full", face: "visor", neck: "mail", peak: 2.2 }, horns: "chaos_horn", eyes: "eye_glow", rimTrim: true },
    ],
    [ // 21–40: бацинет, барбют с гребнем, саллет с плюмажем, армет с крыльями
      { ...base, style: "bascinet" },
      { ...base, style: "barbute", trim: Tr, crestMat: Cl, rivets: true },
      { ...base, style: "sallet", accent: P, trim: Tr, plume: Cl, rimTrim: true, gem: "sapphire" },
      { ...base, style: "armet", accent: P, trim: Tr, wings: true, gem: "eye_glow", gemGlow: true, rimTrim: true, slitGlow: "eye_glow" },
    ],
    [ // 41–60 (калёная, многослойная): саллет с бувигером, армет с кантом, топфхельм с короной, луковица с рогами
      { ...base, style: "chapel", shape: { brim: 2.0, peak: 1.2, neck: "gorget", dome: "cone" } },
      { ...base, style: "armet", trim: Tr, comb: Cl, rivets: true, shape: { neck: "mail" } },
      { ...base, style: "great", trim: Tr, band: true, crown: true, gem: "sapphire", rivets: true },
      { ...base, style: "onion", accent: "chaos_red", trim: Tr, shape: { cover: "full", face: "visor" }, horns: "chaos_horn", eyes: "eye_glow", rimTrim: true, crown: true },
    ],
    [ // 61–80 (рельеф, позолота): топфхельм, луковица с венцом, армет с крыльями и гравировкой, рогатый шлем Хаоса
      { ...base, style: "great" },
      { ...base, style: "onion", trim: Tr, crown: true, rimTrim: true, engrave: true },
      { ...base, style: "armet", accent: Tr, trim: Tr, wings: true, engrave: true, gem: "sapphire", rimTrim: true },
      { style: "horned", plate: P, accent: "chaos_red", trim: Tr, horn: "chaos_spike", glow: G, spikes: 3, horns: 0.95 },
    ],
    [ // 81–100 (звёздное серебро): конус с забралом, саллет со свечением, барбют с короной, крылатый топфхельм с венцом
      { ...base, style: "nasal", trim: Tr, shape: { cover: "full", face: "visor", neck: "gorget", peak: 3.0 }, rimTrim: true },
      { ...base, style: "sallet", trim: Tr, plume: Cl, slitGlow: G, rimTrim: true },
      { ...base, style: "barbute", trim: Tr, crestMat: Cl, crown: true, gem: "star_glow", gemGlow: true, rivets: true },
      { ...base, style: "great", accent: Cl, trim: Tr, band: true, wings: true, crown: true, eyes: G, gem: "star_glow", gemGlow: true, shape: { face: "visor" } },
    ],
  ];
  const h = pick(t, r, H), o = fo("helm", t, r);
  return o.style ? { ...h, style: o.style, shape: { ...(h.shape ?? {}), ...(o.neck ? { neck: o.neck } : {}) } } : h;
}

// ---------------- кирасы: тело (кольчуга, стёганка, бригантина, ламелляр, пластина), подол, наплечья, ворот ----------------
/** форма кирасы по ступени и редкости (подбор — tiersearch: разные силуэты внутри ступени и между соседними ступенями) */
const AR_A = { len: 0, shoulders: 0, collar: 1, wide: 0.86 }, AR_B = { len: 3, shoulders: 0, collar: 0, wide: 1.12 }, AR_C = { len: 1, shoulders: 2, collar: 1, wide: 1 };
const AR_L = (t: number) => (t % 2 ? { len: 0, shoulders: 2, collar: 2, wide: 0.92 } : { len: 3, shoulders: 0, collar: 2, wide: 1.05 });
/** форма кирасы: три основных силуэта (короткая узкая, длинная широкая, с крупными наплечьями) переставляются по ступеням, у легендарок — свой (шипы, высокий ворот) */
export const ARMOR_FORM: any[][] = [[AR_A, AR_B, AR_C], [AR_B, AR_C, AR_A], [AR_C, AR_A, AR_B], [AR_A, AR_B, AR_C], [AR_B, AR_C, AR_A]].map((row, t) => [...row, AR_L(t)]);
export function plateArmor(t: number, r: number) {
  // мастерство ступени: с 41 ур. даже обычная кираса собрана на заклёпках (не украшение — работа мастера)
  return { ...plateArmor0(t, r), ...(r === 0 && t >= 2 ? { rivets: true } : {}), ...(FORM_OVERRIDE.armor ? fo("armor", t, r) : ARMOR_FORM[t][r] ?? {}) };
}
function plateArmor0(t: number, r: number) {
  const m = T.plate, P = m.base[t], Tr = m.trim[t], Cl = m.cloth[t], G = m.glow[t];
  const base = { style: "plate", plate: P, accent: P, trim: P, cloth: Cl, mail: "mail", tassets: P, thick: 0.3 + 0.12 * BULK(t, r) };
  const leg = { cracks: G ?? "chaos_crack", spikes: true, spike: "chaos_spike" };
  const A: any[][] = [
    [ // 1–20: стёганка, кольчуга с табардом, кольчуга до колен с нагрудником, кольчуга с пластинами и шипами
      { ...base, body: "quilt", cloth: "linen", len: 2, collar: 0, shoulders: 0 },
      { ...base, body: "mail", len: 2, collar: 1, trim: Tr, tabard: true, rivets: true },
      { ...base, body: "mail", len: 3, shoulders: 1, collar: 1, trim: Tr, chestPlate: true, accent: P, crest: true, kant: Tr },
      { ...base, body: "mail", len: 2, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: Cl, tabard: true, inlay: true, crest: true, ...leg },
    ],
    [ // 21–40: бригантины
      { ...base, body: "brig", cloth: "wool_grey", trim: "iron", len: 1, collar: 0 },
      { ...base, body: "brig", len: 2, shoulders: 1, trim: Tr, tabard: true, kant: Tr },
      { ...base, body: "plate", len: 1, shoulders: 2, trim: Tr, chestPlate: true, accent: "cloth_crimson", inlay: true, crest: true, gemColor: "sapphire", rivets: true },
      { ...base, body: "brig", len: 3, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: "cloth_purple", tabard: true, inlay: true, crest: true, ...leg },
    ],
    [ // 41–60: многослойный ламелляр
      { ...base, body: "lamellar", len: 1, shoulders: 1, collar: 1 },
      { ...base, body: "lamellar", len: 2, collar: 2, trim: Tr, tabard: true, kant: Tr, rivets: true },
      { ...base, body: "lamellar", len: 3, shoulders: 2, trim: Tr, chestPlate: true, accent: Cl, inlay: true, crest: true, gemColor: "sapphire" },
      { ...base, body: "lamellar", len: 2, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: "chaos_red", inlay: true, crest: true, ...leg },
    ],
    [ // 61–80: рельеф и позолота
      { ...base, body: "plate", len: 1, collar: 1, trim: Tr, kant: Tr },
      { ...base, body: "plate", len: 2, shoulders: 1, trim: Tr, tabard: true, kant: Tr, rivets: true },
      { ...base, body: "plate", len: 1, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: Tr, inlay: true, crest: true, gemColor: "sapphire" },
      { ...base, body: "plate", len: 3, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: "chaos_red", tabard: true, inlay: true, crest: true, ...leg },
    ],
    [ // 81–100: звёздное серебро, холодное сияние
      { ...base, body: "scale", len: 2, shoulders: 1, collar: 2, trim: Tr, mythic: G, cracks: G },
      { ...base, body: "plate", len: 3, collar: 1, trim: Tr, tabard: true, kant: Tr, mythic: G },
      { ...base, body: "plate", len: 1, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: Tr, inlay: true, crest: true, gemColor: "sapphire", mythic: G },
      { ...base, body: "scale", len: 3, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: "ash_steel", tabard: true, inlay: true, crest: true, mythic: G, ...leg, cracks: G },
    ],
  ];
  return pick(t, r, A);
}

/**
 * Наплечники: у каждой ступени и редкости своя форма (латинский квадрат — соседние ступени одной редкости и редкости одной ступени не совпадают):
 * cop — малая чашка, lamellar — ламы на ремне, spaulder — купол с ламами, angular — гранёный, great — крупный с гардой у шеи,
 * layered — ярусы с загнутыми кончиками, mythic — стреловидный с крылом-лезвием (только 81–100). Описание общее для иконки и героя (icons.ts → pauldronIcon, gear.ts → pauldrons).
 */
const PD_FORM = [["cop", "lamellar", "spaulder", "spaulder"], ["lamellar", "spaulder", "angular", "great"], ["spaulder", "angular", "great", "layered"], ["angular", "great", "layered", "great"], ["great", "layered", "angular", "mythic"]];
export function platePauldrons(t: number, r: number) {
  // купол: эпик — цвета ткани ступени, легендарка — золото/латунь ступени (1–20 — алая, грубая)
  const m = T.plate, L = LV(t, r), o = fo("pauldrons", t, r), form = o.form ?? PD_FORM[t][r];
  return { form, plate: m.base[t], accent: r === 2 ? (t === 4 ? "ash_steel" : m.cloth[t]) : r === 3 ? (t === 0 ? "chaos_red" : m.trim[t]) : m.base[t], trim: r >= 1 || t >= 2 ? m.trim[t] : m.base[t], size: 0.74 + 0.09 * BULK(t, r), lames: o.lames ?? (form === "spaulder" ? (t >= 2 ? 2 : 1) : 1),
    spikes: r === 3 ? (t >= 3 ? 3 : t >= 1 ? 2 : 1) : 0, spike: "chaos_spike", rivets: L >= 0.8 || t >= 2, filigree: r === 2 || (r === 3 && t >= 2), gem: r === 2 ? "sapphire" : undefined, cracks: m.glow[t] ?? (r === 3 && t >= 2 ? "chaos_crack" : undefined) };
}

// ---------------- кожа: покрой (жилет, куртка, длинная), ворот, наплечья, нагрудник; цвет кожи и ткани — свой у каждой вещи ступени ----------------
export function leatherCoat(t: number, r: number) {
  const m = T.leather, L = LV(t, r), Tr = m.trim[t];
  const LT = [["rawhide", "leather", "rawhide", "leather_ember"], ["leather", "leather_teal", "leather", "leather_ash"], ["rogue_leather", "leather_ember", "leather_ash", "rogue_leather"], ["leather_master", "leather_teal", "leather_master", "leather_ash"], ["leather_star", "leather_ember", "leather_myth", "leather_ash"]][t][r];
  const CL = [["cloth_blue", "dye_green", "cloth_crimson", "chaos_red"], ["dye_green", "cloth_crimson", "cloth_blue", "chaos_red"], ["cloth_crimson", "dye_green", "cloth_purple", "chaos_red"], ["cloth_crimson", "cloth_blue", "dye_green", "chaos_red"], ["star_silk", "dawn_silk", "moon_silk", "chaos_red"]][t][r];
  const cut = [["vest", "jacket", "long", "long"], ["jacket", "long", "vest", "jacket"], ["long", "vest", "jacket", "long"], ["vest", "jacket", "long", "vest"], ["jacket", "long", "vest", "long"]][t][r];
  const C: any = { thick: 0.25 + 0.09 * BULK(t, r), style: "coat", cut: cut === "long" ? undefined : cut, long: cut === "long", leather: LT, plate: m.plate[t], accent: r >= 1 ? CL : LT, trim: Tr, sash: r >= 1 ? CL : "leather_dark", sashTails: r >= 1 && L >= 1.6, strap: L >= 1.6 || r === 0, strapMat: "leather_dark",
    breast: (r >= 1 && L >= 3.0) || (t >= 3 && r === 0), crest: r >= 2, gem: r === 2 ? "sapphire" : r === 3 ? "eye_glow" : undefined, lacing: L < 3 ? "tan" : undefined, pouch: L < 5 ? "leather_dark" : undefined,
    collarHigh: [[false, false, true, false], [false, false, false, true], [false, false, true, false], [false, false, true, true], [true, false, true, false]][t][r],
    pauldronsOnIcon: [[false, false, false, false], [false, false, true, false], [false, false, true, false], [false, true, false, false], [false, true, false, false]][t][r],
    spikes: r === 3, spike: "chaos_spike", cracks: m.glow[t] ?? (r === 3 ? "chaos_crack" : undefined), stitch: "tan", wear: L < 4, mythic: t === 4 && r !== 2 ? m.glow[t] : undefined };
  // на герое грудь куртки — 6–8 px: нагрудник не перекрываем перевязью и высоким воротом, строчку у жилета с нагрудником не прячем под сталь
  // (иначе на иконке деталь есть, а на герое её не видно — review.ts match)
  const o = fo("leather", t, r);
  if (o.cut) { C.cut = o.cut === "long" ? undefined : o.cut; C.long = o.cut === "long"; }
  for (const k of ["collarHigh", "pauldronsOnIcon", "pants"]) if (k in o) C[k] = o[k];
  if (o.spikes && C.spikes) C.spikes = o.spikes;
  if (C.spikes) C.pauldronsOnIcon = false;
  if (C.breast) { C.strap = false; C.collarHigh = false; if (C.cut === "vest") C.stitch = undefined; }
  return C;
}

// ---------------- ткань: покрой (туника, до голени, до пят), рукава, пелерина, крылья, ореол; цвет — свой у каждой вещи ступени ----------------
export function clothRobe(t: number, r: number) {
  const m = T.cloth, L = LV(t, r), Tr = m.trim[t];
  const CL = [["linen", "wool_blue", "dye_green", "cloth_crimson"], ["wool_blue", "wool_brown", "cloth_purple", "chaos_red"], ["cloth_purple", "dye_green", "cloth_blue", "void_silk"], ["cloth_crimson", "cloth_blue", "moon_silk", "void_silk"], ["star_silk", "moon_silk", "dawn_silk", "void_silk"]][t][r];
  const AC = [["wool_brown", "linen", "wool_brown", "gold"], ["cloth_blue", "linen", "wool_grey", "cloth_crimson"], ["cloth_blue", "linen", "cloth_purple", "chaos_red"], ["cloth_purple", "moon_silk", "cloth_blue", "cloth_crimson"], ["star_silver", "star_silk", "moon_silk", "star_silver"]][t][r];
  const cut = [["tunic", "mid", "long", "long"], ["mid", "long", "tunic", "mid"], ["long", "tunic", "mid", "long"], ["tunic", "mid", "long", "tunic"], ["mid", "long", "tunic", "long"]][t][r];
  const R: any = { thick: 0.2 + 0.09 * BULK(t, r), style: "robe", cut: cut === "long" ? undefined : cut, sleeves: [[false, true, false, false], [false, false, true, true], [true, false, false, false], [false, true, false, true], [true, false, true, false]][t][r],
    wings: r === 3 && t % 2 === 0 ? Tr : undefined, wingGlow: false, halo: r === 3 && t % 2 === 1 ? (m.glow[t] ?? "eye_glow") : r === 3 && t === 4 ? m.glow[t] : undefined,
    cloth: CL, trim: r >= 1 || t >= 3 ? Tr : CL, sash: r >= 1 ? AC : CL, panel: L >= 1.6 ? AC : undefined, embroid: L >= 0.8, hemTrim: L >= 2.4,
    mantle: [[false, false, true, false], [false, true, false, false], [false, false, true, true], [false, false, true, false], [true, false, true, false]][t][r] ? AC : undefined,
    gem: r === 2 ? "sapphire" : r === 3 ? "eye_glow" : undefined, crest: r >= 2, runes: m.glow[t] ?? (r === 3 ? "eye_glow" : undefined), spikes: r === 3 && t >= 2, spike: Tr, collar: r >= 1 ? Tr : CL, sashTails: r >= 2, mythic: t === 4 ? m.glow[t] : undefined };
  const o = fo("cloth", t, r);
  if (o.cut) R.cut = o.cut === "long" ? undefined : o.cut;
  if ("sleeves" in o) R.sleeves = o.sleeves;
  if ("mantle" in o) R.mantle = o.mantle ? R.sash : undefined; // пелерина — цвета кушака (как в tiersearch)
  if (o.wide) R.wide = o.wide;
  return R;
}
