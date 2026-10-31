/**
 * Шлемы-конструктор: ОДНО описание (форма + материалы + украшения) → и слой на герое (gear.ts → helm), и иконка 48×48 (icons.ts).
 * Геометрия задаётся в системе головы (центр (0,0), y вниз; hw, hh — полуширина и полувысота головы): на герое hw≈4,7 px,
 * на иконке тот же шлем в ×2,7 (детали, которые на герое 1–2 px, на иконке те же, только крупнее; толщина линий — u).
 * Новая вещь = новое описание в data/gear147.json (style — заготовка формы, shape — правки формы, поля украшений), а не перекраска.
 *
 * Форма: dome (round | cone | flat | onion), peak — высота острия, cover (cap — до бровей, cheek — нащёчники, лицо открыто, full — до подбородка),
 * face (open | tslit | slit | visor | nasal | bevor), neck (mail | gorget | none), brim — поля, tail — назатыльник (саллет).
 * Украшения (feat id → материал): comb, plume, wings, horns, crown, spike, rimTrim, band, slitTrim, rivets, gem, engrave, slitGlow, eyes, visor.
 */
import { hx, type C } from "../bosses139/mino_lib";
import type { Mz, PO, V2 } from "../hero147/base_b";

export type HView = "front" | "back" | "side";
export interface HelmShape { dome: "round" | "cone" | "flat" | "onion"; peak: number; cover: "cap" | "cheek" | "full"; face: "open" | "tslit" | "slit" | "visor" | "nasal" | "bevor"; neck: "mail" | "gorget" | "none"; brim: number; tail: number; width: number }
const PRESET: Record<string, HelmShape> = {
  bascinet: { dome: "cone", peak: 2.3, cover: "cheek", face: "open", neck: "mail", brim: 0, tail: 0, width: 1 },
  barbute: { dome: "round", peak: 0.4, cover: "full", face: "tslit", neck: "none", brim: 0, tail: 0, width: 1 },
  great: { dome: "flat", peak: 0, cover: "full", face: "slit", neck: "gorget", brim: 0, tail: 0, width: 1.04 },
  chapel: { dome: "round", peak: 0, cover: "cap", face: "open", neck: "mail", brim: 1.8, tail: 0, width: 1 },
  nasal: { dome: "cone", peak: 1.5, cover: "cap", face: "nasal", neck: "mail", brim: 0, tail: 0, width: 0.98 },
  sallet: { dome: "round", peak: 0.2, cover: "cheek", face: "bevor", neck: "none", brim: 0, tail: 2.2, width: 1.02 },
  armet: { dome: "round", peak: 0.6, cover: "full", face: "visor", neck: "gorget", brim: 0, tail: 0, width: 1 },
  onion: { dome: "onion", peak: 2.6, cover: "cheek", face: "open", neck: "mail", brim: 0, tail: 0, width: 1 },
};
export const PARAM_STYLES = Object.keys(PRESET);

/** Описание шлема: форма + материалы ролей + украшения (feat id → ключ материала). Старые поля вещей (trim ≠ plate, crestMat…) приводятся сюда. */
export interface HelmModel { shape: HelmShape; plate: string; accent: string; trim: string; mail: string; feats: Record<string, string>; gemGlow: boolean }
export function helmModel(it: any): HelmModel {
  const shape: HelmShape = { ...(PRESET[it.style] ?? PRESET.bascinet), ...(it.shape ?? {}) };
  const plate = it.plate, trim = it.trim ?? plate, accent = it.accent ?? plate, fancy = trim !== plate, f: Record<string, string> = {};
  if (it.style === "barbute" && (it.crestMat || it.comb)) f.comb = it.comb ?? it.crestMat;
  else if (it.comb) f.comb = it.comb;
  if (it.style === "barbute" && fancy && it.slitTrim !== false) f.slitTrim = trim;
  else if (it.slitTrim) f.slitTrim = it.slitTrim === true ? trim : it.slitTrim;
  if (it.style === "great" && fancy && it.band !== false) f.band = trim;
  else if (it.band) f.band = it.band === true ? trim : it.band;
  if (it.plume && it.style !== "barbute") f.plume = it.plume;
  if (it.wings) f.wings = it.wings === true ? trim : it.wings;
  if (it.horns) f.horns = typeof it.horns === "string" ? it.horns : it.horn ?? "chaos_horn";
  if (it.crown) f.crown = it.crown === true ? trim : it.crown;
  if (it.spike) f.spike = it.spike === true ? plate : it.spike;
  // венец сидит на кромке купола — отдельный кант под ним не читается на герое (1 px), его роль играет обод венца
  if (it.rimTrim && !it.crown) f.rimTrim = it.rimTrim === true ? trim : it.rimTrim;
  if (it.rivets) f.rivets = fancy ? trim : plate;
  if (it.gem) f.gem = it.gem;
  if (it.engrave) f.engrave = trim;
  if (it.slitGlow) f.slitGlow = it.slitGlow;
  if (it.eyes) f.eyes = it.eyes;
  if (shape.face === "visor" || shape.face === "bevor") f.visor = accent;
  return { shape, plate, accent, trim, mail: it.mail ?? "mail", feats: f, gemGlow: !!it.gemGlow };
}

/** Одна часть описания: g — группа (контур между группами), mat — материал, z — порядок (на герое слой 6.1 + z), ft — деталь (для автопроверки «иконка = герой»). */
export interface HPart { g: string; mat: string | C[]; z: number; draw: (z: Mz) => void; o: PO; emis?: boolean; emisColor?: C; ft?: string; iconOnly?: boolean }
export const SKIN: C[] = ["#4a2620", "#7e4636", "#b06c52", "#d99a76", "#f2c49e"].map(hx);

/**
 * Геометрия шлема в виде v. K — масштаб формы (1 на герое), u — толщина мелких деталей (1 на герое, ~1,7 на иконке).
 * icon: true — добавляет лицо основы под прорезями (на герое лицо рисует сама основа) и блики-рефлексы, которые на герое дают кант и контур.
 */
export function helmGeo(M: HelmModel, v: HView, hw: number, hh: number, u: number, icon = false): HPart[] {
  const S = M.shape, K = hw / 4.7, F = M.feats, out: HPart[] = [];
  const add = (g: string, mat: string | C[], z: number, draw: (z: Mz) => void, o: PO = { dome: 3, amp: 1.8, bias: 0.3 }, ft?: string, emis = false, emisColor?: C) => out.push({ g, mat, z, draw, o, ft, emis, emisColor });
  const rx = (hw + 0.75 * K) * S.width, top = -hh - 0.45 * K - S.peak * K, brow = -0.12 * hh;
  const eyeY = 0.24 * hh, chin = hh + 1.0 * K;
  const side = v === "side", front = v === "front";
  // ---- открытия (сквозь них видно лицо основы) ----
  const sh = 0.75 * u; // полувысота щели
  const hole = (x: number, y: number): boolean => {
    if (v === "back") return false;
    if (!side) {
      const ax = Math.abs(x);
      switch (S.face) {
        case "open": return S.cover === "cheek" ? ax < hw * 0.64 && y > brow + 0.2 * K : false;
        case "tslit": return (y > brow && y < eyeY + 0.3 * hh && ax < hw * 0.7) || (y >= brow && y < chin - 0.5 * K && ax < hw * 0.22);
        case "slit": case "visor": return Math.abs(y - eyeY) < sh && ax > hw * 0.1 && ax < hw * 0.8;
        case "bevor": return y > brow + 0.1 * K && y < eyeY + sh && ax < hw * 0.72;
        default: return false;
      }
    }
    switch (S.face) {
      case "open": return S.cover === "cheek" ? x > hw * 0.3 && y > brow + 0.2 * K : false;
      case "tslit": return x > hw * 0.42 && y > brow && (y < eyeY + 0.3 * hh || (x > hw * 0.68 && y < chin - 0.5 * K));
      case "slit": case "visor": return x > hw * 0.3 && Math.abs(y - eyeY) < sh;
      case "bevor": return x > hw * 0.25 && y > brow + 0.1 * K && y < eyeY + sh;
      default: return false;
    }
  };
  // ---- внутренность на иконке (лица на иконке нет — docs/art/icons.md §3) ----
  // в прорезях и открытой части — тёмная подкладка: стёганая (вертикальные швы), сверху тень от купола, снизу слабый рефлекс; у светящейся щели тьма видна по краям, как лицо на герое
  if (icon) {
    const IN: C[] = ["#060408", "#0c080c", "#140e12", "#1e1519", "#2a1e22"].map(hx), PAD: C[] = ["#0a070a", "#140e10", "#20171a", "#2c2023", "#3a2b2c"].map(hx);
    add("inner", IN, -0.2, (z) => z.el([0, hh * 0.24], hw * 0.84, hh * 1.0), { dome: 3, amp: 1.2, bias: -0.9, dith: 0 }, "face");
    add("innerP", PAD, -0.195, (z) => { for (const x of [-0.5, 0, 0.5]) z.seg([x * hw, brow + 0.6 * K], [x * hw * 0.92, chin - 0.6 * K], 0.42 * u); z.bz([-hw * 0.7, chin - 0.9 * K], [0, chin - 0.2 * K], [hw * 0.7, chin - 0.9 * K], 0.5 * u, 0.5 * u); }, { dome: 1, bias: -0.6 }, "face");
  }
  // ---- шея: кольчуга или горжет ----
  if (S.neck === "mail") {
    if (front) add("h_mail", M.mail, 0.02, (z) => { if (S.cover === "cap") { z.el([0, hh * 0.35], hw + 1.0 * K, hh + 1.7 * K); z.clip((x, y) => !(Math.abs(x) < hw * 0.66 && y > brow - 0.2 * K && y < chin - 0.2 * K) && y > -hh * 0.5); } else { z.pg([[-rx * 1.0, hh * 0.3], [-rx * 1.22, chin + 2.2 * K], [0, chin + 2.8 * K], [rx * 1.22, chin + 2.2 * K], [rx * 1.0, hh * 0.3]]); z.clip((x, y) => !(Math.abs(x) < hw * 0.6 && y < chin - 0.3 * K)); } }, { dome: 2, amp: 1.6, bias: 0.15, dith: 0.6, kant: true }, "mail");
    else if (v === "back") add("h_mail", M.mail, 0.02, (z) => z.pg([[-rx * 1.0, 0], [-rx * 1.22, chin + 2.2 * K], [0, chin + 2.6 * K], [rx * 1.22, chin + 2.2 * K], [rx * 1.0, 0]]), { dome: 2, bias: 0.1, dith: 0.6, kant: true }, "mail");
    else add("h_mail", M.mail, 0.02, (z) => { z.el([-hw * 0.25, hh * 0.35], hw * 0.92, hh * 0.92); z.clip((x) => x < hw * 0.3); }, { dome: 2, bias: 0.1, dith: 0.6 }, "mail");
    if (icon && v !== "side") add("h_mailR", M.mail, 0.021, (z) => { for (let k = 0; k < 4; k++) { const y = chin - 0.6 * K + k * 1.0 * K; z.bz([-rx * 1.15, y], [0, y + 0.9 * K], [rx * 1.15, y], 0.45 * u, 0.45 * u); } }, { dome: 1, bias: -1.6 }, "mail");
  } else if (S.neck === "gorget") {
    const gy = chin + 0.1 * K;
    if (!side) add("h_gor", M.plate, 0.03, (z) => z.bz([-hw * 0.9, gy - 0.5 * K], [0, gy + 1.2 * K], [hw * 0.9, gy - 0.5 * K], 1.6 * K, 1.6 * K), { dome: 2, amp: 1.7, bias: -0.1, kant: true });
    else add("h_gor", M.plate, 0.03, (z) => z.seg([-hw * 0.6, gy - 0.6 * K], [hw * 0.55, gy], 1.6 * K), { dome: 2, amp: 1.7, bias: -0.1, kant: true });
  }
  // ---- гребень, плюмаж, крылья (за куполом) ----
  if (F.comb) {
    const ch = 2.6 * K + S.peak * K * 0.4;
    if (!side) add("h_comb", F.comb, 0.04, (z) => z.pg([[-1.0 * K, -hh * 0.6], [-0.8 * K, top - ch + 0.4 * K], [0.8 * K, top - ch + 0.4 * K], [1.0 * K, -hh * 0.6]]), { dome: 2, amp: 1.8, bias: 0.3 }, "comb");
    else add("h_comb", F.comb, 0.04, (z) => z.pg([[hw * 0.45, -hh * 0.75], [hw * 0.25, top - ch * 0.85], [-hw * 1.1, top - ch * 0.4], [-hw * 0.95, -hh * 0.55]]), { dome: 2, amp: 1.8, bias: 0.3 }, "comb");
    if (icon) add("h_combL", F.comb, 0.041, (z) => { for (const t of [-0.5, 0, 0.5]) z.seg([t * K, top - ch + 1.2 * K], [t * K * 1.1, -hh * 0.75], 0.45 * u); }, { dome: 1, bias: -1.5 }, "comb");
  }
  if (F.plume) {
    if (!side) add("h_plume", F.plume, 0.04, (z) => { z.bz([0, top + 0.5 * K], [hw * 0.3, top - 4.4 * K], [hw * 1.5, top - 3.2 * K], 3.0 * K, 1.4 * K); z.bz([hw * 0.2, top - 1.6 * K], [hw * 1.0, top - 4.6 * K], [hw * 1.85, top - 1.2 * K], 2.0 * K, 0.8 * K); }, { dome: 2, amp: 1.8, bias: 0.3, kant: true }, "plume");
    else add("h_plume", F.plume, 0.04, (z) => { z.bz([-hw * 0.1, top + 0.5 * K], [-hw * 0.6, top - 4.0 * K], [-hw * 2.0, top - 1.2 * K], 3.0 * K, 1.2 * K); }, { dome: 2, amp: 1.8, bias: 0.3, kant: true }, "plume");
    if (icon) add("h_plumeF", F.plume, 0.041, (z) => { z.bz([hw * 0.15, top - 1.0 * K], [hw * 0.6, top - 2.4 * K], [hw * 1.2, top - 1.6 * K], 0.5 * u, 0.4 * u); }, { dome: 1, bias: -1.5 }, "plume");
  }
  if (F.wings) {
    const wing = (sg: number): V2[] => [[sg * hw * 0.8, -hh * 0.35], [sg * (hw + 2.0 * K), top - 3.4 * K], [sg * (hw + 4.2 * K), top - 3.0 * K], [sg * (hw + 3.0 * K), top - 0.6 * K], [sg * (hw + 4.0 * K), -hh * 0.55], [sg * (hw + 2.6 * K), -hh * 0.1], [sg * (hw + 3.2 * K), hh * 0.25], [sg * hw, hh * 0.35]];
    if (!side) add("h_wing", F.wings, 0.045, (z) => { z.pg(wing(-1)); z.pg(wing(1)); }, { dome: 2, amp: 1.8, bias: 0.3, kant: true }, "wings");
    else add("h_wing", F.wings, 0.07, (z) => z.pg([[-hw * 0.2, -hh * 0.3], [-hw * 1.4, top - 2.4 * K], [-hw * 0.9, -hh * 0.7], [-hw * 1.5, -hh * 0.4], [-hw * 0.1, hh * 0.3]]), { dome: 2, amp: 1.8, bias: 0.3, kant: true }, "wings");
    if (icon && !side) add("h_wingL", F.wings, 0.046, (z) => { for (const sg of [-1, 1]) { z.seg([sg * (hw + 0.4 * K), -hh * 0.3], [sg * (hw + 2.6 * K), top - 1.4 * K], 0.45 * u); z.seg([sg * (hw + 0.4 * K), hh * 0.05], [sg * (hw + 2.4 * K), -hh * 0.45], 0.45 * u); } }, { dome: 1, bias: -1.4 }, "wings");
  }
  // ---- купол и стенки ----
  const domeD = (z: Mz, cx = 0) => {
    if (S.dome === "flat") { z.el([cx, -hh * 0.2], rx, hh * 0.85); z.pg([[cx - rx, -hh * 0.2], [cx + rx, -hh * 0.2], [cx + rx * 0.97, top + 1.4 * K], [cx - rx * 0.97, top + 1.4 * K]]); z.el([cx, top + 1.4 * K], rx * 0.97, 1.4 * K); return; }
    z.el([cx, -hh * 0.12], rx, hh * 0.92 + 0.45 * K);
    if (S.dome === "cone") z.pg([[cx - rx, -hh * 0.12], [cx - rx * 0.72, -hh * 0.82], [cx + (side ? -0.25 * hw : 0), top], [cx + rx * 0.72, -hh * 0.82], [cx + rx, -hh * 0.12]]);
    if (S.dome === "onion") { z.el([cx, -hh * 0.4], rx * 1.08, hh * 0.8); z.pg([[cx - rx * 0.5, -hh * 0.9], [cx, top], [cx + rx * 0.5, -hh * 0.9]]); }
  };
  const bottom = S.cover === "cap" ? hh * 0.02 : S.cover === "cheek" ? chin - 0.1 * K : chin;
  if (!side) {
    add("h_shell", M.plate, 0.05, (z) => {
      domeD(z);
      if (S.cover === "cap") z.clip((x, y) => y < (v === "back" ? hh * 0.3 : bottom));
      else { z.pg([[-rx, -hh * 0.12], [rx, -hh * 0.12], [rx * 0.88, bottom], [0, bottom + (S.cover === "full" ? 0.5 * K : 0)], [-rx * 0.88, bottom]]); }
      if (S.cover !== "cap") z.clip((x, y) => !hole(x, y));
    }, { dome: 3, amp: 1.9, bias: 0.3, kant: true });
    if (icon) add("h_spec", M.plate, 0.051, (z) => z.bz([-rx * 0.82, -hh * 0.05], [-rx * 0.7, top * 0.75], [-rx * 0.15, top + 0.9 * K], 0.9 * u, 0.5 * u), { dome: 1, bias: 2.5 });
    if (S.face === "nasal" && front) add("h_nasal", M.plate, 0.055, (z) => z.seg([0, brow - 0.3 * K], [0, eyeY + hh * 0.4], 1.0 * K, 0.8 * K), { dome: 1, amp: 1.6, bias: 0.6, kant: true }, "nasal");
    if (S.cover === "cap" && front) add("h_browP", M.plate, 0.056, (z) => z.bz([-rx, bottom - 0.3 * K], [0, bottom + 0.4 * K], [rx, bottom - 0.3 * K], 1.0 * K, 1.0 * K), { dome: 1, bias: -0.3 });
  } else {
    add("h_shell", M.plate, 0.05, (z) => {
      domeD(z, -0.3 * K);
      if (S.cover === "cap") z.clip((x, y) => y < bottom + (x < 0 ? hh * 0.3 : 0));
      else z.pg([[-rx - 0.1 * K, -hh * 0.12], [rx - 0.1 * K, -hh * 0.12], [rx + (S.cover === "full" ? 0.3 : -0.3) * K, bottom], [-rx * 0.6, bottom + 0.3 * K]]);
      if (S.tail) z.pg([[-rx * 0.6, hh * 0.1], [-rx - S.tail * K, hh * 0.85 + 0.5 * K], [-rx * 0.3, hh + 0.4 * K]]);
      if (S.cover !== "cap") z.clip((x, y) => !hole(x, y));
    }, { dome: 3, amp: 1.9, bias: 0.3, kant: true });
    if (S.face === "nasal") add("h_nasal", M.plate, 0.055, (z) => z.seg([hw * 0.75, brow - 0.3 * K], [hw * 0.95, eyeY + hh * 0.35], 0.9 * K), { dome: 1, bias: 0.4, kant: true }, "nasal");
  }
  if (S.tail && v === "back") add("h_tail", M.plate, 0.052, (z) => z.bz([-rx * 0.9, hh * 0.5], [0, hh + 1.2 * K], [rx * 0.9, hh * 0.5], 1.6 * K, 1.6 * K), { dome: 2, bias: 0.1, kant: true });
  // ---- забрало (visor — клювом с щелями; bevor — подбородник саллета) ----
  if (F.visor && v !== "back") {
    if (S.face === "visor") {
      const vis: V2[] = side ? [[hw * 0.15, -hh * 0.3], [hw + 0.9 * K, -hh * 0.15], [hw + 2.4 * K, hh * 0.35], [hw + 1.2 * K, hh * 0.85], [hw * 0.6, chin], [-hw * 0.05, chin - 0.3 * K]] : [[-hw * 0.82, -hh * 0.18], [hw * 0.82, -hh * 0.18], [hw * 0.62, hh * 0.6], [0, chin + 0.2 * K], [-hw * 0.62, hh * 0.6]];
      add("h_visor", F.visor, 0.06, (z) => { z.pg(vis); z.clip((x, y) => !hole(x, y)); }, { dome: 2, amp: 1.9, bias: 0.3, kant: true }, "visor");
      add("h_visorR", F.visor, 0.061, (z) => side ? z.seg([hw * 0.4, -hh * 0.2], [hw + 1.6 * K, hh * 0.4], 0.6 * u) : z.seg([0, -hh * 0.15], [0, chin - 0.2 * K], 0.6 * u), { dome: 1, bias: 1.4 }, "visor");
    } else {
      const bev: V2[] = side ? [[hw * 0.2, eyeY + sh], [hw + 1.0 * K, eyeY + sh], [hw + 0.6 * K, chin], [-hw * 0.2, chin + 0.6 * K]] : [[-rx * 0.95, eyeY + sh], [rx * 0.95, eyeY + sh], [rx * 0.8, chin + 0.3 * K], [0, chin + 1.0 * K], [-rx * 0.8, chin + 0.3 * K]];
      add("h_visor", F.visor, 0.06, (z) => z.pg(bev), { dome: 3, amp: 1.9, bias: 0.25, kant: true }, "visor");
    }
  }
  // ---- кромки, кант, заклёпки, гравировка ----
  if (F.rimTrim) add("h_rim", F.rimTrim, 0.065, (z) => side ? z.seg([-rx * 0.9, brow + 0.2 * K], [rx * 0.95, brow - 0.2 * K], 0.8 * u) : z.bz([-rx, brow + 0.1 * K], [0, brow - 0.9 * K], [rx, brow + 0.1 * K], 0.8 * u, 0.8 * u), { dome: 1, bias: 0.5 }, "rimTrim");
  if (F.band) add("h_band", F.band, 0.066, (z) => { if (!side) { z.seg([0, top + 0.2 * K], [0, S.face === "slit" ? eyeY - sh - 0.2 * K : brow], 0.95 * u); if (S.face === "slit") z.seg([0, eyeY + sh + 0.2 * K], [0, chin], 0.95 * u); if (front) z.seg([-rx + 0.2 * K, brow], [rx - 0.2 * K, brow], 0.8 * u); } else z.seg([-rx * 0.7, brow], [rx + 0.2 * K, brow], 0.8 * u); }, { dome: 1, bias: 0.5 }, "band");
  if (F.slitTrim && v !== "back") add("h_sTrim", F.slitTrim, 0.067, (z) => {
    if (!side) { if (S.face === "tslit") { z.seg([-hw * 0.78, brow - 0.15 * K], [hw * 0.78, brow - 0.15 * K], 0.7 * u); z.seg([-hw * 0.3, eyeY + 0.35 * hh], [-hw * 0.3, chin - 0.3 * K], 0.6 * u); z.seg([hw * 0.3, eyeY + 0.35 * hh], [hw * 0.3, chin - 0.3 * K], 0.6 * u); } else { z.seg([-hw * 0.85, eyeY - sh - 0.25 * K], [hw * 0.85, eyeY - sh - 0.25 * K], 0.6 * u); } }
    else z.seg([hw * 0.35, brow - 0.15 * K], [hw + 0.6 * K, brow - 0.15 * K], 0.7 * u);
  }, { dome: 1, bias: 0.6 }, "slitTrim");
  if (F.rivets) add("h_riv", F.rivets, 0.068, (z) => { const r = 0.5 * u; if (!side) { for (const x of [-0.82, -0.45, 0.45, 0.82]) z.dot([x * rx, brow + 1.0 * K + 0.4 * u], r); if (S.cover !== "cap") for (const x of [-0.75, 0.75]) z.dot([x * rx, bottom - 1.0 * K], r); } else for (const x of [-0.6, 0.1]) z.dot([x * rx, brow + 0.55 * K], r); }, { dome: 1, bias: 1.3 }, "rivets");
  if (F.engrave && v !== "back") add("h_eng", F.engrave, 0.069, (z) => { if (!side) for (const sg of [-1, 1]) z.bz([sg * rx * 0.8, -hh * 0.55], [sg * rx * 0.35, top * 0.85], [sg * rx * 0.2, -hh * 0.35], 0.5 * u, 0.5 * u); else z.bz([-rx * 0.6, -hh * 0.5], [0, top * 0.8], [rx * 0.4, -hh * 0.45], 0.5 * u, 0.5 * u); }, { dome: 1, bias: 0.6 }, "engrave");
  if (F.slitGlow && v !== "back" && (S.face === "slit" || S.face === "visor" || S.face === "tslit")) add("h_sGlow", F.slitGlow, 0.07, (z) => { if (side) z.seg([hw * 0.45, eyeY], [hw + 0.8 * K, eyeY], 0.5 * u); else { z.seg([-hw * 0.72, eyeY], [-hw * 0.18, eyeY], 0.5 * u); z.seg([hw * 0.18, eyeY], [hw * 0.72, eyeY], 0.5 * u); } }, { dome: 1, bias: 1.2 }, "slitGlow", true);
  if (F.eyes && v !== "back") add("h_eye", F.eyes, 0.071, (z) => { if (!side) { z.dot([-hw * 0.42, eyeY], 0.6 * u); z.dot([hw * 0.42, eyeY], 0.6 * u); } else z.dot([hw * 0.8, eyeY], 0.6 * u); }, { dome: 1, bias: 0.6 }, "eyes", true, hx("#ff6a3a"));
  // самоцвет на лбу; при венце — в его центральном зубце, поверх венца
  const gy = F.crown ? brow - 1.5 * K : -hh * 0.55 + (S.dome === "cone" ? -0.4 * K : 0), gz = F.crown ? 0.082 : 0.075;
  if (F.gem && front) { add("h_gemS", M.trim, gz, (z) => z.dot([0, gy], 1.25 * u), { dome: 2, bias: 0.3 }, "gem"); add("h_gem", F.gem, gz + 0.001, (z) => z.dot([0, gy], 0.8 * u), { dome: 2, bias: 0.7 }, "gem", M.gemGlow); }
  if (F.gem && side) add("h_gem", F.gem, 0.076, (z) => z.dot([hw * 0.55, -hh * 0.5], 0.75 * u), { dome: 1, bias: 0.7 }, "gem", M.gemGlow);
  if (F.crown) {
    const pts = (cx: number, w: number): V2[] => { const o: V2[] = [[cx - w, brow - 0.2 * K]]; for (let k = 0; k <= 4; k++) { const x = cx - w + (2 * w * k) / 4; o.push([x, brow - (k % 2 ? 1.2 : 2.6) * K]); } o.push([cx + w, brow - 0.2 * K]); return o; };
    add("h_crown", F.crown, 0.08, (z) => z.pg(side ? pts(0, rx * 0.85) : pts(0, rx * 0.95)), { dome: 2, amp: 1.8, bias: 0.4, kant: true }, "crown");
  }
  if (F.spike) add("h_spike", F.spike, 0.085, (z) => { const t: V2 = [side ? -0.25 * hw : 0, top]; z.pg([[t[0] - 0.8 * K, t[1] + 1.2 * K], [t[0], t[1] - 2.6 * K], [t[0] + 0.8 * K, t[1] + 1.2 * K]]); }, { dome: 1, amp: 1.8, bias: 0.4 }, "spike");
  if (F.horns) {
    if (!side) add("h_horn", F.horns, 0.09, (z) => { for (const sg of [-1, 1]) z.bz([sg * hw * 0.7, -hh * 0.45], [sg * hw * 1.75, -hh * 0.8], [sg * hw * 1.2, top - 1.6 * K], 2.4 * K, 0.4 * K); }, { dome: 2, amp: 1.8, bias: 0.3 }, "horns");
    else add("h_horn", F.horns, 0.09, (z) => z.bz([hw * 0.3, -hh * 0.5], [hw * 0.65, top - 1.0 * K], [-hw * 0.5, top - 1.6 * K], 2.4 * K, 0.4 * K), { dome: 2, amp: 1.8, bias: 0.3 }, "horns");
  }
  // поля шапеля — поверх купола, ниже бровей (и на иконке, и на герое)
  if (S.brim) {
    const by = bottom - 0.2 * K;
    add("h_brim", M.plate, 0.058, (z) => side ? z.el([-0.2 * K, by], hw + S.brim * K + 0.3 * K, 1.0 * K) : z.el([0, by], hw + S.brim * K, 1.15 * K), { dome: 1, amp: 1.6, bias: 0.1, kant: true });
    if (icon) add("h_brimS", M.plate, 0.059, (z) => z.bz([-hw - S.brim * K * 0.8, by + 0.6 * K], [0, by + 1.4 * K], [hw + S.brim * K * 0.8, by + 0.6 * K], 0.5 * u), { dome: 1, bias: -1.6 });
  }
  return out;
}
