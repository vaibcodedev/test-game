/**
 * Щиты героя Б — слот «offhand» (вторая рука, правило левой руки): ОДНО описание (форма + материалы + украшения) → слой на герое (gear.ts → shieldLayer)
 * и иконка 48×48 (icons.ts). Три размера (docs/art/gear.md §3): баклер (круглый, малый, умбон), рыцарский «утюг» (heater, герб), скутум (высокий
 * выгнутый прямоугольник, умбон и окованные края). Идеи — Lineage 2 / WoW (размер щита = класс щита: малый, средний, башенный), Warspear (читаемый
 * силуэт в 2D), Black Desert (окантовка и герб на рыцарском щите); формы и цвета свои.
 *
 * Геометрия — в плоскости щита: u — вправо, v — вниз, единица = 1 px героя; bulge(u, v) — выпуклость к зрителю (скутум выгнут по u).
 * Части: s_face — поле (дерево или металл), s_paint — окраска поля, s_plank — доски, s_rim — окантовка, s_boss — умбон,
 * украшения (ft — деталь для проверки «иконка = герой»): rivets, band (оковка), gem, spike (шип умбона), crest (герб фракции — подменяемый).
 */
import type { Mz, PO, V2 } from "../hero147/base_b";

export type ShieldKind = "buckler" | "heater" | "scutum";
export interface ShieldModel { kind: ShieldKind; face: string; rim: string; boss: string; paint?: string; back: string; strap: string; rivets?: string; band?: string; gem?: string; spike?: string; crest: boolean; planks: boolean; size: number }
export function shieldModel(it: any): ShieldModel {
  return { kind: it.style, face: it.face, rim: it.rim ?? it.face, boss: it.boss ?? it.rim ?? it.face, paint: it.paint, back: it.back ?? "leather_dark", strap: it.strap ?? "leather_dark",
    rivets: it.rivets === true ? it.rim ?? it.face : it.rivets, band: it.band === true ? it.rim : it.band, gem: it.gem, spike: it.spike === true ? it.boss ?? it.rim : it.spike, crest: !!it.crest, planks: it.planks ?? /wood/.test(it.face), size: it.size ?? 1 };
}
/** контур щита (замкнутый), u вправо, v вниз; центр — точка хвата (предплечье) */
export function outline(M: ShieldModel): V2[] {
  const s = M.size, o: V2[] = [];
  if (M.kind === "buckler") { const r = 3.3 * s; for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; o.push([Math.cos(a) * r, Math.sin(a) * r]); } return o; }
  if (M.kind === "heater") {
    const w = 3.5 * s, top = -4.4 * s, sh = 0.4 * s, tip = 5.6 * s;
    o.push([-w, top + 0.3 * s], [-w * 0.5, top - 0.25 * s], [0, top - 0.35 * s], [w * 0.5, top - 0.25 * s], [w, top + 0.3 * s], [w, sh]);
    for (let k = 1; k < 10; k++) { const t = k / 10; o.push([w * (1 - t) ** 1.25, sh + (tip - sh) * Math.sin((t * Math.PI) / 2)]); }
    o.push([0, tip]);
    for (let k = 9; k >= 1; k--) { const t = k / 10; o.push([-w * (1 - t) ** 1.25, sh + (tip - sh) * Math.sin((t * Math.PI) / 2)]); }
    o.push([-w, sh]); return o;
  }
  const w = 3.6 * s, h = 7.6 * s, r = 1.0 * s;
  const corner = (cx: number, cy: number, a0: number) => { for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(w - r, h - r, 0); corner(-w + r, h - r, Math.PI / 2); corner(-w + r, -h + r, Math.PI); corner(w - r, -h + r, Math.PI * 1.5);
  return o;
}
export const bulgeOf = (M: ShieldModel) => (u: number, v: number) => (M.kind === "scutum" ? -0.09 * u * u : M.kind === "buckler" ? 0.12 * (3.3 * M.size - Math.hypot(u, v)) : 0);
/** центр умбона / герба в плоскости щита */
export const bossAt = (M: ShieldModel): V2 => [0, M.kind === "heater" ? -0.4 * M.size : 0];

export interface SPart { g: string; mat: string; z: number; o: PO; draw: (z: Mz, P: (u: number, v: number) => V2, k: number) => void; ft?: string; iconOnly?: boolean }
/**
 * Части щита. front — лицевая сторона к зрителю; иначе видна изнанка (дерево, ремни). k — толщина линий (1 на герое, крупнее на иконке).
 * crest — рисует вызывающий (герб фракции подменяемый: crestParts на герое, crest() на иконке) в bossAt / по месту умбона у heater.
 */
export function shieldGeo(M: ShieldModel, front: boolean, icon = false): SPart[] {
  const out: SPart[] = [], O = outline(M), s = M.size, B = bossAt(M);
  const add = (g: string, mat: string, z: number, draw: SPart["draw"], o: PO = { dome: 3, amp: 1.8, bias: 0.2 }, ft?: string, iconOnly = false) => out.push({ g, mat, z, draw, o, ft, iconOnly });
  const inset = (d: number): V2[] => O.map(([u, v]) => { const l = Math.hypot(u, v - B[1] * 0) || 1, f = Math.max(0, 1 - d / l); return [u * f, v * f] as V2; });
  const ring = (z: Mz, P: (u: number, v: number) => V2, pts: V2[], w: number) => { for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length]; z.seg(P(a[0], a[1]), P(b[0], b[1]), w); } };
  if (!front) {
    // изнанка: доски, две петли-ремня (enarmes), окантовка
    add("s_back", M.back === "leather_dark" ? M.face : M.back, 0, (z, P) => z.pg(O.map(([u, v]) => P(u, v))), { dome: 2, amp: 1.5, bias: -0.5, kant: true });
    add("s_strap", M.strap, 0.01, (z, P, k) => { z.seg(P(-1.6 * s, -0.9 * s), P(1.6 * s, -0.6 * s), 0.9 * k); z.seg(P(-1.6 * s, 0.9 * s), P(1.6 * s, 1.2 * s), 0.9 * k); }, { dome: 1, bias: 0.2 });
    add("s_rim", M.rim, 0.02, (z, P, k) => ring(z, P, O, 0.75 * k), { dome: 1, bias: -0.3 });
    return out;
  }
  // ремень-гиж (носить на плече): на иконке выглядывает из-за верхнего края — тот же ремень, что на изнанке щита на герое
  if (icon) add("s_guige", M.strap, -0.01, (z, P, k) => { const top = Math.min(...O.map((q) => q[1])), a = P(-2.2 * s, top + 0.6 * s), b = P(-0.4 * s, top - 4.2 * s), c = P(1.8 * s, top + 0.6 * s); z.bz(a, b, c, 0.9 * k, 0.9 * k); }, { dome: 1, bias: 0.2 });
  add("s_face", M.face, 0, (z, P) => z.pg(O.map(([u, v]) => P(u, v))), { dome: M.kind === "buckler" ? 4 : 3, amp: 1.8, bias: 0.25, kant: true });
  if (M.paint) {
    // окраска: рыцарский — поле, скутум — широкая полоса по вертикали и «крылья» по углам, баклер — кольцо
    if (M.kind === "heater") add("s_paint", M.paint, 0.01, (z, P) => z.pg(inset(0.9 * s).map(([u, v]) => P(u, v))), { dome: 2, amp: 1.6, bias: 0.15 });
    else if (M.kind === "scutum") add("s_paint", M.paint, 0.01, (z, P, k) => { z.pg([P(-1.1 * s, -6.2 * s), P(1.1 * s, -6.2 * s), P(1.1 * s, 6.2 * s), P(-1.1 * s, 6.2 * s)]); for (const sg of [-1, 1]) for (const sv of [-1, 1]) z.bz(P(sg * 1.4 * s, sv * 2.2 * s), P(sg * 2.6 * s, sv * 3.6 * s), P(sg * 2.2 * s, sv * 5.6 * s), 0.9 * k, 0.5 * k); }, { dome: 2, amp: 1.6, bias: 0.15 });
    else add("s_paint", M.paint, 0.01, (z, P) => { const r1 = 2.6 * s; z.pg(Array.from({ length: 24 }, (_, j) => P(Math.cos((j / 24) * Math.PI * 2) * r1, Math.sin((j / 24) * Math.PI * 2) * r1))); z.clip((x, y) => { const c = P(0, 0); return Math.hypot(x - c[0], y - c[1]) > 1.5 * s; }); }, { dome: 2, amp: 1.6, bias: 0.15 });
  }
  if (M.planks && !icon) add("s_plank", M.face, 0.012, (z, P, k) => { for (const u of M.kind === "scutum" ? [-2.3, 2.3] : [-1.6, 1.6]) z.seg(P(u * s, -6.5 * s), P(u * s, 6.5 * s), 0.5 * k); z.clip((x, y) => { const pts = O.map(([u, v]) => P(u, v)); let inn = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i][1] > y) !== (pts[j][1] > y) && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) inn = !inn; return inn; }); }, { dome: 1, bias: -1.5 });
  if (M.planks && icon) add("s_plank", M.face, 0.012, (z, P, k) => { for (const u of M.kind === "scutum" ? [-2.3, 0, 2.3] : [-1.7, 0, 1.7]) z.seg(P(u * s, (M.kind === "heater" ? -4.2 : -6.4) * s), P(u * s * 0.9, (M.kind === "heater" ? (u ? 3.0 : 5.0) : 6.4) * s), 0.4 * k); }, { dome: 1, bias: -1.6 });
  // потёртости поля (иконка: на герое они были бы шумом в 1 px)
  if (icon) add("s_wear", M.face, 0.013, (z, P, k) => { for (const [u, v, du, dv] of [[-2.2, -2.6, 0.9, 0.5], [1.6, 1.8, 0.8, -0.4], [-1.0, 3.2, 0.7, 0.3]]) z.seg(P(u * s, v * s), P((u + du) * s, (v + dv) * s), 0.35 * k); }, { dome: 1, bias: 2.0 });
  add("s_rim", M.rim, 0.02, (z, P, k) => ring(z, P, O, (M.kind === "buckler" ? 0.85 : 0.75) * k), { dome: 2, amp: 1.7, bias: 0.4, kant: true });
  if (M.band) add("s_band", M.band, 0.022, (z, P, k) => {
    if (M.kind === "heater") { z.seg(P(0, -4.6 * s), P(0, 5.4 * s), 0.8 * k); z.seg(P(-3.4 * s, -1.4 * s), P(3.4 * s, -1.4 * s), 0.8 * k); }
    else if (M.kind === "scutum") { z.seg(P(-3.4 * s, 0), P(3.4 * s, 0), 0.9 * k); z.seg(P(0, -6.8 * s), P(0, 6.8 * s), 0.7 * k); }
    else for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2 + Math.PI / 4; z.seg(P(Math.cos(a) * 1.4 * s, Math.sin(a) * 1.4 * s), P(Math.cos(a) * 3.1 * s, Math.sin(a) * 3.1 * s), 0.7 * k); }
  }, { dome: 1, amp: 1.6, bias: 0.4 }, "band");
  if (M.kind !== "heater") {
    add("s_boss", M.boss, 0.03, (z, P) => { const c = P(B[0], B[1]), e = P(B[0] + 1.35 * s, B[1]); z.dot(c, Math.max(0.9, Math.hypot(e[0] - c[0], e[1] - c[1]))); }, { dome: 4, amp: 2.0, bias: 0.4, kant: true });
    if (icon) add("s_bossH", M.boss, 0.031, (z, P, k) => { const c = P(B[0] - 0.5 * s, B[1] - 0.5 * s); z.dot(c, 0.35 * k); }, { dome: 1, bias: 2.6 });
  }
  if (M.rivets) add("s_riv", M.rivets, 0.04, (z, P, k) => { const pts = inset(0.85 * s), n = M.kind === "scutum" ? 10 : 8; for (let j = 0; j < n; j++) { const q = pts[Math.floor((j / n) * pts.length)]; z.dot(P(q[0], q[1]), 0.5 * k); } }, { dome: 1, bias: 1.3 }, "rivets");
  if (M.spike && M.kind !== "heater") add("s_spike", M.spike, 0.05, (z, P, k) => { const c = P(B[0], B[1]), t = P(B[0] + 0.9 * s, B[1] - 2.0 * s); const dx = t[0] - c[0], dy = t[1] - c[1], l = Math.hypot(dx, dy) || 1, w = 0.75 * k; z.pg([[c[0] - (dy / l) * w, c[1] + (dx / l) * w], t, [c[0] + (dy / l) * w, c[1] - (dx / l) * w]]); }, { dome: 1, amp: 1.9, bias: 0.6 }, "spike");
  if (M.gem) add("s_gem", M.gem, 0.06, (z, P, k) => { const g: V2 = M.kind === "heater" ? [0, -3.2 * s] : B; z.dot(P(g[0], g[1]), 0.65 * k); }, { dome: 2, bias: 0.7 }, "gem");
  return out;
}
