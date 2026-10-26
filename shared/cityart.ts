/**
 * Задача 141: варианты вида стен, башен, ворот и зданий столиц, фортов, поселений и Эмберхолла.
 * Вид объекта (kind) прежний — от него след, подсветка, тесты; вариант — поле v объекта карты: кадр o_<kind>__<v>
 * (все кадры делает tools/gen/walls141-game.ts по этим же таблицам). Вариант = "<уровень>-<токен>", выбор детерминирован по клетке.
 *   уровень: cap — столица фракции, fort — форт (и стены вдоль рек), set — поселение, ember — Эмберхолл.
 *   Стены: чистая кладка, бойница, знак (у фортов — гнёзда балок), трещины, мох, плющ, заплатка, сколы — у столиц чище, у фортов больше износа.
 *   Башни: угловые (конус, шпиль, галерея, шатёр) и у ворот (купол, зубцы); ворота: кадр open (закрытые и разбитые есть в ассетах — следующий шаг).
 *   Здания: тип по месту (дом, лавка, дом с вальмой, храм; казарма, арсенал, штаб; хижина, лавка-сарай) и износ.
 * Файл не зависит от map.ts: генератор карты вызывает assignArtVariants в конце, клиент берёт v из объекта.
 */
import { CITIES } from "./cities";
import { SETTLEMENTS, SETTLE_R } from "./settlements";
import { TILE } from "./constants";

export type ArtTier = "cap" | "fort" | "set" | "ember";
export type ArtRole = "wall_h" | "wall_v" | "tower" | "gate" | "house" | "pal_h" | "pal_v" | "pal_post" | "pal_gate" | "pal_corner";

export const WALL_TOKENS = ["clean", "slit", "emblem", "crack", "moss", "ivy", "patch", "chip"];
const WALL_WEIGHTS: Record<ArtTier, number[]> = {
  cap: [0.48, 0.1, 0.1, 0.06, 0.09, 0.09, 0.04, 0.04],
  fort: [0.32, 0.2, 0.06, 0.12, 0.08, 0.04, 0.11, 0.07],
  set: [0.4, 0.1, 0.05, 0.1, 0.15, 0.1, 0.05, 0.05],
  ember: [0.5, 0.08, 0.08, 0.07, 0.1, 0.09, 0.05, 0.03],
};
export const WALLV_TOKENS = ["clean", "moss", "crack", "patch"];
const WALLV_WEIGHTS = [0.6, 0.15, 0.13, 0.12];
export const TOWER_TOKENS = ["corner", "corner-ivy", "corner-moss", "gate", "gate-crack"];
export const GATE_STATES = ["open", "closed", "broken"];
export const HOUSE_WEARS = ["clean", "moss", "ivy", "patch"];
const HOUSE_WEIGHTS = [0.55, 0.17, 0.16, 0.12];
export const PAL_TOKENS = ["clean", "moss", "ivy", "patch", "chip", "crack"];
const PAL_WEIGHTS = [0.5, 0.14, 0.1, 0.1, 0.08, 0.08];

const FORT_TYPES = ["barracks", "armory", "command"];
/** Виды карты, которые получают варианты: роль, уровни и типы зданий по уровню. */
export const ART_KINDS: Record<string, { role: ArtRole; tiers: ArtTier[]; types?: Partial<Record<ArtTier, string[]>> }> = {
  sol_wall_h: { role: "wall_h", tiers: ["cap", "fort"] }, umb_wall_h: { role: "wall_h", tiers: ["cap", "fort"] }, wall_h: { role: "wall_h", tiers: ["ember"] },
  sol_wall_v: { role: "wall_v", tiers: ["cap", "fort"] }, umb_wall_v: { role: "wall_v", tiers: ["cap", "fort"] }, wall_v: { role: "wall_v", tiers: ["ember"] },
  sol_tower: { role: "tower", tiers: ["cap", "fort"] }, umb_tower: { role: "tower", tiers: ["cap", "fort"] }, tower: { role: "tower", tiers: ["ember"] },
  sol_gate: { role: "gate", tiers: ["cap", "fort"] }, umb_gate: { role: "gate", tiers: ["cap", "fort"] }, gate_arch: { role: "gate", tiers: ["ember"] },
  sol_house: { role: "house", tiers: ["cap", "fort"], types: { cap: ["house", "shop", "house_hip"], fort: FORT_TYPES } },
  sol_temple: { role: "house", tiers: ["cap", "fort"], types: { cap: ["house_hip", "shop"], fort: FORT_TYPES } },
  sol_church: { role: "house", tiers: ["cap"], types: { cap: ["church"] } },
  umb_ziggurat: { role: "house", tiers: ["cap"], types: { cap: ["ziggurat"] } },
  umb_house: { role: "house", tiers: ["cap", "fort"], types: { cap: ["house", "shop", "house_hip"], fort: FORT_TYPES } },
  umb_crypt: { role: "house", tiers: ["cap", "fort", "set"], types: { cap: ["temple", "house_hip"], fort: FORT_TYPES, set: ["hut_wide"] } },
  house: { role: "house", tiers: ["ember"], types: { ember: ["house", "house_b"] } },
  house_blue: { role: "house", tiers: ["ember"], types: { ember: ["house_b", "house"] } },
  tavern: { role: "house", tiers: ["ember"], types: { ember: ["tavern"] } },
  bank: { role: "house", tiers: ["ember"], types: { ember: ["bank"] } },
  forge: { role: "house", tiers: ["ember"], types: { ember: ["forge"] } },
  hut_sol: { role: "house", tiers: ["set"], types: { set: ["hut", "shed_shop"] } },
  pal_h: { role: "pal_h", tiers: ["ember"] }, pal_v: { role: "pal_v", tiers: ["ember"] },
  pal_h_sol: { role: "pal_h", tiers: ["set"] }, pal_v_sol: { role: "pal_v", tiers: ["set"] }, pal_post_sol: { role: "pal_post", tiers: ["set"] }, pal_corner_sol: { role: "pal_corner", tiers: ["set"] }, pal_gate_sol: { role: "pal_gate", tiers: ["set"] },
  pal_h_umb: { role: "pal_h", tiers: ["set"] }, pal_v_umb: { role: "pal_v", tiers: ["set"] }, pal_post_umb: { role: "pal_post", tiers: ["set"] }, pal_corner_umb: { role: "pal_corner", tiers: ["set"] }, pal_gate_umb: { role: "pal_gate", tiers: ["set"] },
};
/** Одиночные большие здания (Эмберхолл, храм Солнца, зиккурат) — без вариантов износа. */
const SINGLE = new Set(["tavern", "bank", "forge", "church", "ziggurat"]);

/** Все токены вариантов вида на уровне (для генератора кадров). */
export function artTokens(kind: string, tier: ArtTier): string[] {
  const a = ART_KINDS[kind];
  if (!a) return [];
  switch (a.role) {
    case "wall_h": return WALL_TOKENS;
    case "wall_v": return WALLV_TOKENS;
    case "tower": return TOWER_TOKENS;
    case "gate": case "pal_gate": return GATE_STATES;
    case "house": return (a.types?.[tier] ?? []).flatMap((t) => (SINGLE.has(t) ? [`${t}-clean`] : HOUSE_WEARS.map((w) => `${t}-${w}`)));
    case "pal_corner": return ["e-clean", "e-moss", "w-clean", "w-moss"];
    case "pal_v": return ["w", "e"].flatMap((sd) => PAL_TOKENS.map((t) => `${sd}-${t}`)); // наружная сторона бокового ряда
    default: return PAL_TOKENS;
  }
}

function h01(x: number, y: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function pickW<T>(list: readonly T[], weights: number[], r: number): T {
  let acc = 0;
  for (let i = 0; i < list.length; i++) { acc += weights[i]; if (r < acc) return list[i]; }
  return list[0];
}

/** Уровень места: город (столица, форт, Эмберхолл), поселение или стены вдоль рек (как форт). */
function tierAt(cx: number, cy: number): { tier: ArtTier; ox: number } {
  for (const c of CITIES) if (Math.abs(cx - c.x) <= c.half.x + 1 && Math.abs(cy - c.y) <= c.half.y + 1) return { tier: !c.style ? "ember" : c.fort ? "fort" : "cap", ox: c.x };
  for (const s of SETTLEMENTS) if (Math.hypot(cx - s.x, cy - s.y) <= SETTLE_R + 1) return { tier: "set", ox: s.x };
  return { tier: "fort", ox: cx };
}

/** Проставить варианты вида объектам карты (в конце генерации карты). */
export function assignArtVariants(objects: { kind: string; x: number; y: number; v?: string; dz?: number }[]) {
  // башни (городские и вышки лучников у рек) рисуются поверх торцов стен в своём ряду (dz 1) и поверх стены под собой (dz 33):
  // кадр стены V выше её клетки и иначе лёг бы на низ башни
  const wallV = new Set<number>();
  for (const o of objects) if (ART_KINDS[o.kind]?.role === "wall_v" || ART_KINDS[o.kind]?.role === "pal_v") wallV.add((Math.floor((o.y + 2) / TILE) - 1) * 4096 + Math.floor(o.x / TILE));
  for (const o of objects) {
    if (ART_KINDS[o.kind]?.role !== "tower" && ART_KINDS[o.kind]?.role !== "pal_corner" && !o.kind.startsWith("bf_wall_tower_")) continue;
    const cy = Math.floor((o.y + 2) / TILE) - 1, cx = Math.floor(o.x / TILE);
    const one = ART_KINDS[o.kind]?.role === "pal_corner"; // угол частокола — след 1×1
    o.dz = wallV.has((cy + 1) * 4096 + cx) || (!one && wallV.has((cy + 1) * 4096 + cx - 1)) ? 33 : 1;
  }
  // угол частокола (правки 3): сторона ряда H по соседу справа
  const palAt = new Set<number>();
  for (const o of objects) if (ART_KINDS[o.kind]?.role === "pal_h") palAt.add((Math.floor((o.y + 2) / TILE) - 1) * 4096 + Math.floor(o.x / TILE));
  for (const o of objects) {
    const a = ART_KINDS[o.kind];
    if (!a) continue;
    const cx = Math.floor(o.x / TILE), cy = Math.floor((o.y + 2) / TILE) - 1;
    let { tier, ox } = tierAt(cx, cy);
    if (!a.tiers.includes(tier)) tier = a.tiers[0];
    const r = h01(cx, cy, 141), r2 = h01(cx, cy, 142);
    let tok: string;
    switch (a.role) {
      case "wall_h": tok = pickW(WALL_TOKENS, WALL_WEIGHTS[tier], r); break;
      case "wall_v": tok = pickW(WALLV_TOKENS, WALLV_WEIGHTS, r); break;
      case "tower": {
        const gate = Math.abs(cx + 1 - ox) <= 5;
        tok = gate ? (r < 0.75 ? "gate" : "gate-crack") : r < 0.7 ? "corner" : r < 0.85 ? "corner-ivy" : "corner-moss";
        break;
      }
      case "gate": case "pal_gate": tok = "open"; break;
      case "house": {
        const types = a.types?.[tier] ?? [];
        const t = types[Math.floor(r2 * types.length) % types.length];
        tok = SINGLE.has(t) ? `${t}-clean` : `${t}-${pickW(HOUSE_WEARS, HOUSE_WEIGHTS, r)}`;
        break;
      }
      case "pal_v": tok = `${cx < ox ? "w" : "e"}-${pickW(PAL_TOKENS, PAL_WEIGHTS, r)}`; break;
      case "pal_corner": tok = `${palAt.has(cy * 4096 + cx + 1) ? "e" : "w"}-${r < 0.8 ? "clean" : "moss"}`; break;
      default: tok = pickW(PAL_TOKENS, PAL_WEIGHTS, r);
    }
    o.v = `${tier}-${tok}`;
  }
}

/** Ключ кадра объекта: o_<kind>__<v> или o_<kind>. */
export const artKey = (o: { kind: string; v?: string }) => (o.v ? `${o.kind}__${o.v}` : o.kind);
