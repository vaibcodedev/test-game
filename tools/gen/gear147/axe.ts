/**
 * Топоры и секиры героя Б: ОДНО описание (форма головы + материалы + украшения) → слой оружия на герое (gear.ts → drawWeapon) и иконка 48×48 (icons.ts).
 * Эталон детализации — легендарки Хаоса; правила оружия — docs/art/gear.md §3 и §7 (тёмная обводка 1 px, сталь светлее брони с бликом по кромке,
 * рукоять другого цвета, крупно, не мультяшно). Идеи форм — исторические: бородовидный топор, секира-полумесяц, двулезвийный лабрис;
 * у легендарки — рогатое лезвие с крюком и руной. Стиль и цвета свои.
 *
 * Геометрия — вдоль древка: a — от хвата (0) к голове (a > 0), n — поперёк (n > 0 — сторона лезвия). Единица — 1 px героя.
 * Части: w_rim — тёмная обводка, w_shaft — древко, w_wrap — обмотка хвата, w_butt — пятка, w_head — тело головы, w_bevel — фаска (светлая полоса
 * заточки по кромке), w_blik — блик по кромке, w_socket — проух (втулка), w_poll — обух; украшения (ft): langets — оковка древка, engrave — гравировка,
 * gem — самоцвет, rune — светящаяся руна, spike — шип на вершине, beak — клюв обуха.
 * Формы по редкости (разные силуэты): bearded (обычная) — узкое лезвие с «бородой» вниз; crescent (редкая) — полумесяц; double (эпическая) — лабрис,
 * два лезвия; horned (легендарная) — широкое лезвие с загнутыми рогами-крюками, клюв обуха, наконечник.
 */
import type { PO, V2 } from "../hero147/base_b";

export type AxeForm = "bearded" | "crescent" | "double" | "horned";
export interface AxeModel { form: AxeForm; hand: 1 | 2; len: number; blade: string; edge: string; haft: string; wrap: string; trim: string; accent?: string; rune?: string; langets: boolean; engrave: boolean; gem?: string; spike: boolean; beak: boolean; size: number }
export function axeModel(it: any): AxeModel {
  const hand: 1 | 2 = it.kind === "great" ? 2 : 1;
  return { form: it.axe ?? "bearded", hand, len: it.length ?? (hand === 2 ? 19 : 11), blade: it.blade, edge: it.edge ?? it.blade, haft: it.grip ?? "leather", wrap: it.wrap ?? "leather_dark", trim: it.hilt ?? "iron",
    accent: it.accent, rune: it.rune, langets: !!it.langets, engrave: !!it.engrave, gem: it.gem, spike: !!it.spike, beak: !!it.beak, size: it.headSize ?? (hand === 2 ? 1.35 : 1.2) };
}
/** контур головы (лезвие и обух) в системе (a, n); h — центр головы на древке */
function headPoly(M: AxeModel, h: number): { blade: V2[]; edge: V2[]; back?: V2[] } {
  const s = M.size, A = (a: number, n: number): V2 => [h + a * s, n * s];
  switch (M.form) {
    case "bearded": {
      // узкое у проуха, лезвие расширяется вниз «бородой» (нижний рог тянется вдоль древка)
      const blade = [A(1.4, 0.8), A(2.2, 3.4), A(1.6, 4.7), A(-0.6, 5.0), A(-3.4, 4.6), A(-5.2, 3.6), A(-4.6, 2.9), A(-2.2, 2.0), A(-1.2, 0.8)];
      return { blade, edge: [A(2.2, 3.4), A(1.6, 4.7), A(-0.6, 5.0), A(-3.4, 4.6), A(-5.2, 3.6)] };
    }
    case "crescent": {
      // полумесяц: широкая дуга кромки, вогнутые плечи к проуху
      const blade = [A(1.3, 0.8), A(2.6, 2.2), A(4.4, 4.2), A(3.6, 5.6), A(1.4, 6.4), A(-1.4, 6.4), A(-3.6, 5.6), A(-4.4, 4.2), A(-2.6, 2.2), A(-1.3, 0.8)];
      return { blade, edge: [A(4.4, 4.2), A(3.6, 5.6), A(1.4, 6.4), A(-1.4, 6.4), A(-3.6, 5.6), A(-4.4, 4.2)] };
    }
    case "double": {
      const side = (sg: number) => [A(1.3, 0.8 * sg), A(3.2, 2.6 * sg), A(4.0, 5.0 * sg), A(1.8, 5.8 * sg), A(-1.8, 5.8 * sg), A(-4.0, 5.0 * sg), A(-3.2, 2.6 * sg), A(-1.3, 0.8 * sg)];
      return { blade: side(1), edge: [A(4.0, 5.0), A(1.8, 5.8), A(-1.8, 5.8), A(-4.0, 5.0)], back: side(-1) };
    }
    default: {
      // рогатое: верхний и нижний рога загнуты к древку, широкая кромка с вырезом посередине
      const blade = [A(1.3, 0.8), A(3.0, 1.8), A(5.6, 2.4), A(4.6, 4.0), A(3.4, 6.6), A(1.0, 6.0), A(0, 6.8), A(-1.0, 6.0), A(-3.4, 6.6), A(-5.8, 4.4), A(-6.6, 2.4), A(-3.0, 1.8), A(-1.3, 0.8)];
      return { blade, edge: [A(5.6, 2.4), A(4.6, 4.0), A(3.4, 6.6), A(1.0, 6.0), A(0, 6.8), A(-1.0, 6.0), A(-3.4, 6.6), A(-5.8, 4.4), A(-6.6, 2.4)] };
    }
  }
}
export interface APart { g: string; mat: string; z: "g" | "b"; dz: number; o: PO; draw: (z: { seg: (a: V2, b: V2, t0: number, t1?: number) => unknown; dot: (a: V2, r: number) => unknown; pg: (p: V2[]) => unknown; bz: (a: V2, b: V2, c: V2, t0: number, t1?: number) => unknown }, P: (a: number, n: number) => V2, k: number) => void; ft?: string; emis?: boolean; rim?: boolean }
/**
 * Части топора. z: "g" — у хвата (слой рукояти), "b" — голова (слой клинка); dz — порядок внутри. k — толщина линий (1 на герое).
 * Обводка (rim) рисуется тёмным тоном снизу — по всему силуэту.
 */
export function axeGeo(M: AxeModel, icon = false): APart[] {
  const out: APart[] = [], L = M.len, h = L - 1.6 * M.size, butt = -(M.hand === 2 ? 2.4 : 1.4);
  const add = (g: string, mat: string, z: "g" | "b", dz: number, draw: APart["draw"], o: PO, ft?: string, emis = false, rim = false) => out.push({ g, mat, z, dz, draw, o, ft, emis, rim });
  const H = headPoly(M, h), shaftW = M.hand === 2 ? 1.25 : 1.1;
  const offset = (pts: V2[], d: number): V2[] => { const cx = pts.reduce((q, p) => q + p[0], 0) / pts.length, cy = pts.reduce((q, p) => q + p[1], 0) / pts.length; return pts.map(([a, n]) => { const l = Math.hypot(a - cx, n - cy) || 1; return [a + ((a - cx) / l) * d, n + ((n - cy) / l) * d] as V2; }); };
  const poly = (z: any, P: (a: number, n: number) => V2, pts: V2[]) => z.pg(pts.map(([a, n]) => P(a, n)));
  const line = (z: any, P: (a: number, n: number) => V2, pts: V2[], w: number) => { for (let i = 0; i + 1 < pts.length; i++) z.seg(P(...pts[i]), P(...pts[i + 1]), w); };
  // тёмная обводка всего силуэта (docs/art/gear.md §3)
  add("w_hrim", "rim", "g", -0.0005, (z, P, k) => { z.seg(P(butt - 0.4, 0), P(L + (M.spike ? 2.6 : 0.6), 0), (shaftW + 1.2) * k); }, { dome: 1, bias: 0.4 }, undefined, false, true);
  add("w_rim", "rim", "b", -0.0005, (z, P) => { poly(z, P, offset(H.blade, 0.7)); if (H.back) poly(z, P, offset(H.back, 0.7)); }, { dome: 1, bias: 0.4 }, undefined, false, true);
  // древко, обмотка хвата, пятка
  add("w_shaft", M.haft, "g", 0, (z, P, k) => z.seg(P(butt, 0), P(L + 0.4, 0), shaftW * k), { dome: 1, amp: 1.6, bias: 0.15 });
  if (icon) add("w_grain", M.haft, "g", 0.0005, (z, P, k) => z.seg(P(2.5, -0.25), P(h - 2.5, -0.2), 0.3 * k), { dome: 1, bias: 2.0 });
  add("w_wrap", M.wrap, "g", 0.001, (z, P, k) => { const n = M.hand === 2 ? 6 : 4; for (let j = 0; j < n; j++) { const a = -0.4 + j * 0.95; z.seg(P(a - 0.3, -shaftW * 0.6), P(a + 0.3, shaftW * 0.6), 0.65 * k); } }, { dome: 1, bias: 0.1 });
  add("w_butt", M.trim, "g", 0.002, (z, P, k) => z.dot(P(butt, 0), (shaftW * 0.85) * Math.max(1, k * 0.9)), { dome: 2, bias: 0.4 });
  if (M.langets) add("w_lang", M.trim, "b", -0.0002, (z, P, k) => { z.seg(P(h - 1.2, 0.45), P(h - 5.8, 0.45), 0.45 * k); z.seg(P(h - 1.2, -0.45), P(h - 5.8, -0.45), 0.45 * k); for (const a of [h - 3, h - 5.4]) z.dot(P(a, 0), 0.4 * k); }, { dome: 1, bias: 0.9 }, "langets");
  // голова: тело, фаска по кромке, блик, проух, обух
  add("w_head", M.blade, "b", 0.001, (z, P) => { poly(z, P, H.blade); if (H.back) poly(z, P, H.back); }, { dome: 2, amp: 1.8, bias: 0.5, kant: true });
  add("w_bevel", M.edge, "b", 0.0015, (z, P, k) => { line(z, P, H.edge, 1.0 * k); if (H.back) line(z, P, H.edge.map(([a, n]) => [a, -n] as V2), 1.0 * k); }, { dome: 1, bias: 1.6 });
  add("w_blik", M.edge, "b", 0.002, (z, P, k) => { const e = H.edge, m = Math.floor(e.length / 2); line(z, P, e.slice(0, m + 1), 0.45 * k); }, { dome: 1, bias: 2.8 });
  add("w_socket", M.trim, "b", 0.0025, (z, P, k) => z.seg(P(h - 1.4 * M.size, 0), P(h + 1.6 * M.size, 0), (shaftW + 1.3) * k), { dome: 2, amp: 1.7, bias: 0.4, kant: true });
  if (!H.back) add("w_poll", M.blade, "b", 0.002, (z, P, k) => z.pg([P(h - 1.2 * M.size, -0.6), P(h + 1.2 * M.size, -0.6), P(h + 0.9 * M.size, -2.0 * M.size), P(h - 0.9 * M.size, -2.0 * M.size)].map((q) => q)), { dome: 2, bias: 0.2 });
  if (M.beak && !H.back) add("w_beak", M.trim, "b", 0.0026, (z, P) => z.pg([P(h + 0.8 * M.size, -1.8 * M.size), P(h - 1.6 * M.size, -4.6 * M.size), P(h - 0.8 * M.size, -1.8 * M.size)]), { dome: 1, amp: 1.8, bias: 0.5 }, "beak");
  if (M.spike) add("w_spike", M.trim, "b", 0.0027, (z, P) => z.pg([P(L + 0.2, 0.75), P(L + 3.0, 0), P(L + 0.2, -0.75)]), { dome: 1, amp: 1.8, bias: 0.6 }, "spike");
  if (M.engrave) add("w_engr", M.trim, "b", 0.003, (z, P, k) => { const s = M.size; z.bz(P(h + 1.6 * s, 2.0 * s), P(h, 3.6 * s), P(h - 1.6 * s, 2.0 * s), 0.4 * k, 0.4 * k); if (H.back) z.bz(P(h + 1.6 * s, -2.0 * s), P(h, -3.6 * s), P(h - 1.6 * s, -2.0 * s), 0.4 * k, 0.4 * k); }, { dome: 1, bias: 1.0 }, "engrave");
  if (M.gem) add("w_gem", M.gem, "b", 0.004, (z, P, k) => z.dot(P(h, 0), 0.75 * Math.max(1, k * 0.8)), { dome: 2, bias: 0.6 }, "gem", M.gem === "eye_glow");
  if (M.rune) add("w_rune", M.rune, "b", 0.0035, (z, P, k) => { const s = M.size; z.seg(P(h + 2.6 * s, 2.6 * s), P(h + 0.8 * s, 4.4 * s), 0.5 * k); z.seg(P(h + 0.8 * s, 4.4 * s), P(h - 1.0 * s, 3.0 * s), 0.5 * k); z.seg(P(h - 1.0 * s, 3.0 * s), P(h - 2.8 * s, 4.6 * s), 0.5 * k); }, { dome: 1, bias: 0.6 }, "rune", true);
  return out;
}
