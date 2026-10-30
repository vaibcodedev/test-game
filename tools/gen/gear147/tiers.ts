/**
 * Вещи таблицы «уровень × редкость» (docs/gear-sets-spec.md): у каждой ступени СВОЙ набор форм и стиль, каждая вещь — своё описание
 * (форма, материалы, украшения) для иконки и героя — не перекраска одной формы.
 *   1–20  — грубое железо, кольчуга, стёганка;   21–40 — ровная сталь, бригантины;   41–60 — калёная многослойная (ламелляр);
 *   61–80 — рельеф и позолота;                   81–100 — звёздное серебро, холодное сияние.
 * Редкость — украшения внутри ступени (обычная — голый материал, редкая — кант, заклёпки, цветная ткань, эпическая — гравировка, самоцвет, герб,
 * легендарная — особая форма, шипы/крылья/рога, свечение). Соседние ступени одной редкости и редкости одной ступени — разные силуэты и цвет (tier.ts проверяет).
 * Используют tier.ts (лист, богатство, сходство) и match.ts (иконка = герой).
 */
import { GD } from "./gear";
const T = GD.tiers;
/** уровень богатства: ступень весит больше редкости (легендарка N ≈ эпик N+1, ступень N+2 богаче любой вещи N) */
export const LV = (t: number, r: number) => 2.2 * t + 0.8 * r;
export const sc = (t: number, r: number) => (0.66 + 0.055 * t) * [1.03, 0.97, 0.93, 0.87][r];
const pick = <X>(t: number, r: number, m: X[][]): X => m[t][r];

// ---------------- шлемы: 20 разных форм ----------------
export function plateHelm(t: number, r: number) {
  const m = T.plate, P = m.base[t], Tr = m.trim[t], Cl = m.cloth[t], G = m.glow[t] ?? "eye_glow", s = sc(t, r);
  const base = { plate: P, accent: P, trim: P, mail: "mail", iconScale: s };
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
      { style: "horned", plate: P, accent: "chaos_red", trim: Tr, horn: "chaos_spike", glow: G, spikes: 3, horns: 0.95, iconScale: s },
    ],
    [ // 81–100 (звёздное серебро): конус с забралом, саллет со свечением, барбют с короной, крылатый топфхельм с венцом
      { ...base, style: "nasal", trim: Tr, shape: { cover: "full", face: "visor", neck: "gorget", peak: 3.0 }, rimTrim: true },
      { ...base, style: "sallet", trim: Tr, plume: Cl, slitGlow: G, rimTrim: true },
      { ...base, style: "barbute", trim: Tr, crestMat: Cl, crown: true, gem: "star_glow", gemGlow: true, rivets: true },
      { ...base, style: "great", accent: Cl, trim: Tr, band: true, wings: true, crown: true, eyes: G, gem: "star_glow", gemGlow: true, shape: { face: "visor" } },
    ],
  ];
  return pick(t, r, H);
}

// ---------------- кирасы: тело (кольчуга, стёганка, бригантина, ламелляр, пластина), подол, наплечья, ворот ----------------
/** форма кирасы по ступени и редкости (подбор — tiersearch: разные силуэты внутри ступени и между соседними ступенями) */
const AR_A = { len: 0, shoulders: 0, collar: 1, wide: 0.86 }, AR_B = { len: 3, shoulders: 0, collar: 0, wide: 1.12 }, AR_C = { len: 1, shoulders: 2, collar: 1, wide: 1 };
const AR_L = (t: number) => (t % 2 ? { len: 0, shoulders: 2, collar: 2, wide: 0.92 } : { len: 3, shoulders: 0, collar: 2, wide: 1.05 });
/** форма кирасы: три основных силуэта (короткая узкая, длинная широкая, с крупными наплечьями) переставляются по ступеням, у легендарок — свой (шипы, высокий ворот) */
export const ARMOR_FORM: any[][] = [[AR_A, AR_B, AR_C], [AR_B, AR_C, AR_A], [AR_C, AR_A, AR_B], [AR_A, AR_B, AR_C], [AR_B, AR_C, AR_A]].map((row, t) => [...row, AR_L(t)]);
export function plateArmor(t: number, r: number) {
  return { ...plateArmor0(t, r), ...(ARMOR_FORM[t][r] ?? {}) };
}
function plateArmor0(t: number, r: number) {
  const m = T.plate, P = m.base[t], Tr = m.trim[t], Cl = m.cloth[t], G = m.glow[t];
  const base = { style: "plate", plate: P, accent: P, trim: P, cloth: Cl, mail: "mail", tassets: P, thick: 0.4 + 0.035 * LV(t, r), iconScale: sc(t, r) };
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
      { ...base, body: "plate", len: 1, shoulders: 2, trim: Tr, chestPlate: true, accent: Cl, inlay: true, crest: true, gemColor: "sapphire", rivets: true },
      { ...base, body: "brig", len: 3, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: Cl, tabard: true, inlay: true, crest: true, ...leg },
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
      { ...base, body: "scale", len: 3, shoulders: 2, collar: 2, trim: Tr, chestPlate: true, accent: Cl, tabard: true, inlay: true, crest: true, mythic: G, ...leg, cracks: G },
    ],
  ];
  return pick(t, r, A);
}

export function platePauldrons(t: number, r: number) {
  const m = T.plate, L = LV(t, r);
  const form = r === 0 ? (t % 2 ? "lames" : "small") : undefined;
  return { plate: m.base[t], accent: r >= 2 ? (t >= 3 ? m.trim[t] : m.cloth[t]) : m.base[t], trim: r >= 1 || t >= 3 ? m.trim[t] : m.base[t], size: 0.76 + 0.035 * L, lames: L >= 3 ? 2 : 1, form, spikes: r === 3 ? (L >= 5 ? 3 : 2) : 0, spike: "chaos_spike", rivets: L >= 0.8, filigree: r >= 2, gem: r === 2 ? "sapphire" : undefined, cracks: m.glow[t] ?? undefined };
}

// ---------------- кожа: покрой (жилет, куртка, длинная), ворот, наплечья, нагрудник; цвет кожи и ткани — свой у каждой вещи ступени ----------------
export function leatherCoat(t: number, r: number) {
  const m = T.leather, L = LV(t, r), Tr = m.trim[t];
  const LT = [["rawhide", "leather", "rawhide", "leather_ember"], ["leather", "leather_teal", "leather", "leather_ash"], ["rogue_leather", "leather_ember", "leather_ash", "rogue_leather"], ["leather_master", "leather_teal", "leather_master", "leather_ash"], ["leather_star", "leather_ember", "leather_myth", "leather_ash"]][t][r];
  const CL = [["cloth_blue", "dye_green", "cloth_crimson", "chaos_red"], ["dye_green", "cloth_crimson", "cloth_blue", "chaos_red"], ["cloth_crimson", "dye_green", "cloth_purple", "chaos_red"], ["cloth_crimson", "cloth_blue", "dye_green", "chaos_red"], ["star_silk", "dawn_silk", "moon_silk", "chaos_red"]][t][r];
  const cut = [["vest", "jacket", "long", "long"], ["jacket", "long", "vest", "jacket"], ["long", "vest", "jacket", "long"], ["vest", "jacket", "long", "vest"], ["jacket", "long", "vest", "long"]][t][r];
  const C: any = { style: "coat", cut: cut === "long" ? undefined : cut, long: cut === "long", leather: LT, plate: m.plate[t], accent: r >= 1 ? CL : LT, trim: Tr, sash: r >= 1 ? CL : "leather_dark", sashTails: r >= 1 && L >= 1.6, strap: L >= 1.6 || r === 0, strapMat: "leather_dark",
    breast: (r >= 1 && L >= 3.0) || (t >= 3 && r === 0), crest: r >= 2, gem: r === 2 ? "sapphire" : r === 3 ? "eye_glow" : undefined, lacing: L < 3 ? "tan" : undefined, pouch: L < 5 ? "leather_dark" : undefined,
    collarHigh: [[false, false, true, false], [false, false, false, true], [false, false, true, false], [false, false, true, true], [true, false, true, false]][t][r],
    pauldronsOnIcon: [[false, false, false, false], [false, false, true, false], [false, false, true, false], [false, true, false, false], [false, true, false, false]][t][r],
    spikes: r === 3, spike: "chaos_spike", cracks: m.glow[t] ?? (r === 3 ? "chaos_crack" : undefined), stitch: "tan", wear: L < 4, mythic: t === 4 && r !== 2 ? m.glow[t] : undefined, iconScale: sc(t, r) };
  return C;
}

// ---------------- ткань: покрой (туника, до голени, до пят), рукава, пелерина, крылья, ореол; цвет — свой у каждой вещи ступени ----------------
export function clothRobe(t: number, r: number) {
  const m = T.cloth, L = LV(t, r), Tr = m.trim[t];
  const CL = [["linen", "wool_blue", "dye_green", "cloth_crimson"], ["wool_blue", "wool_brown", "cloth_purple", "chaos_red"], ["cloth_purple", "dye_green", "cloth_blue", "void_silk"], ["cloth_crimson", "cloth_blue", "moon_silk", "void_silk"], ["star_silk", "moon_silk", "dawn_silk", "void_silk"]][t][r];
  const AC = [["wool_brown", "linen", "wool_brown", "gold"], ["cloth_blue", "linen", "wool_grey", "cloth_crimson"], ["cloth_blue", "linen", "cloth_purple", "chaos_red"], ["cloth_purple", "moon_silk", "cloth_blue", "cloth_crimson"], ["star_silver", "star_silk", "moon_silk", "star_silver"]][t][r];
  const cut = [["tunic", "mid", "long", "long"], ["mid", "long", "tunic", "mid"], ["long", "tunic", "mid", "long"], ["tunic", "mid", "long", "tunic"], ["mid", "long", "tunic", "long"]][t][r];
  return { style: "robe", cut: cut === "long" ? undefined : cut, sleeves: [[false, true, false, false], [false, false, true, true], [true, false, false, false], [false, true, false, true], [true, false, true, false]][t][r],
    wings: r === 3 && t % 2 === 0 ? Tr : undefined, wingGlow: false, halo: r === 3 && t % 2 === 1 ? (m.glow[t] ?? "eye_glow") : r === 3 && t === 4 ? m.glow[t] : undefined,
    cloth: CL, trim: r >= 1 || t >= 3 ? Tr : CL, sash: r >= 1 ? AC : CL, panel: L >= 1.6 ? AC : undefined, embroid: L >= 0.8, hemTrim: L >= 2.4,
    mantle: [[false, false, true, false], [false, true, false, false], [false, false, true, true], [false, false, true, false], [true, false, true, false]][t][r] ? AC : undefined,
    gem: r === 2 ? "sapphire" : r === 3 ? "eye_glow" : undefined, crest: r >= 2, runes: m.glow[t] ?? (r === 3 ? "eye_glow" : undefined), spikes: r === 3 && t >= 2, spike: Tr, collar: r >= 1 ? Tr : CL, sashTails: r >= 2, mythic: t === 4 ? m.glow[t] : undefined, iconScale: sc(t, r) };
}
