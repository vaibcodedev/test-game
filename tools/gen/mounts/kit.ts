/**
 * Задача 142: общий набор деталей маунтов (поверх tools/gen/mounts/lib.ts и библиотеки мобов) — поза, походки, ноги, тело, шея
 * и голова, хвосты, гривы, седло, попона с гербом, крылья (перьевые и перепончатые), эффекты редких (угли, языки пламени,
 * искры, духовный шлейф). Модели — tools/gen/mounts/{horses,beasts,birds,drakes,raptor}.ts; пилоты war_horse.ts и griffin.ts
 * написаны раньше и живут сами по себе.
 *
 * Координаты модели: X вправо от зверя, Y вперёд, Z вверх; единица ≈ пиксель до масштаба модели (MountSpec.scale).
 * Поза строится по кадру: бег — 12 кадров цикла, покой — 24 (у каждой модели своё поведение через окна win/bump/shake).
 * Эффекты зависят от доли цикла t = i / n — в конце цикла частицы возвращаются в начало, петля без скачка.
 */
import {
  Scene, R, mat, add, sub, mul, norm, lerpV, ik, rot, rotAxis, cross, easeInOut, clamp, lerp, TAU, hash01, hex, vlen,
  type V3, type Mat, type Prim, type TexFn, type RGBA, type Ramp,
} from "../mobs/lib";
import { factionEmblem } from "../heraldry";
import { front, pcStamp, VB, type Banner, type Built, type Fac, type Frame, type MView } from "./lib";

export { add, sub, mul, norm, lerpV, rot, rotAxis, cross, clamp, lerp, TAU, hash01, hex, easeInOut, vlen, R, mat, ik };
export type { V3, Mat, Prim, TexFn, RGBA, Ramp, Fac, Frame, MView, Built };
export const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];

// ---------------- материалы ----------------
export const M = (name: string, ramp: Ramp, base = 2.0, gain = 2.5): Mat => mat(name, ramp, { base, gain, hi: ramp.length - 1 });
/** Светящееся (огонь, руны, камни): без тени, ночью не гаснет. */
export const G = (name: string, ramp: Ramp, base = 2.6, gain = 1.4): Mat => mat(name, ramp, { base, gain, lo: 1, hi: ramp.length - 1, crisp: true, glow: true });
export const FIRE = G("огонь", R("#7a1c10", "#c23a12", "#f06a1a", "#ffb03a", "#ffe88a", "#fffbe0"), 3.0, 1.2);
export const FIRE_DEEP = G("жар", R("#5a0c08", "#9a2010", "#d84a14", "#ff8a2a", "#ffd060"), 2.4, 1.0);
export const SPIRIT = G("дух", R("#0d4256", "#1d84a6", "#47c6ea", "#aaf0ff", "#effdff"), 2.8, 1.2);
export const STORM = G("молния", R("#1a3a8a", "#2e6ad0", "#5aa8ff", "#a8dcff", "#ffffff"), 3.2, 1.0);
export const POISON = G("ядовитый", R("#1e5a1a", "#3fcf45", "#7aff6a", "#c0ff9a", "#efffe0"), 2.8, 1.2);
export const FROST = G("иней", R("#2a5a86", "#4a86b4", "#7ab8dc", "#b0e0f4", "#e6faff", "#ffffff"), 3.0, 1.2);
export const GEM_AZ = G("лазурный камень", R("#1a3a8a", "#2e6ad0", "#5aa8ff", "#a8dcff", "#ffffff"));
export const GEM_RED = G("алый камень", R("#5a0a10", "#a01820", "#e8323a", "#ff8a80", "#fff0e8"));
export const GEM_GRN = G("зелёный камень", R("#1e5a1a", "#3fcf45", "#7aff6a", "#c0ff9a", "#efffe0"));
export const GOLD = M("золото", R("#3a2006", "#5e380c", "#8e5816", "#c48424", "#eab040", "#ffd86a", "#fff4c0"), 2.6, 2.8);
export const STEEL = M("сталь", R("#1a1e26", "#2c313c", "#464e5e", "#68728a", "#929db4", "#c4cee0", "#f4f8ff"), 1.9, 3.0);
export const IRON = M("чёрное железо", R("#08080e", "#14141e", "#24243a", "#3a3a56", "#56547a", "#7c7aa0", "#b0aed0"), 1.9, 3.0);
export const SILVER = M("серебро", R("#14121c", "#26222e", "#423e52", "#6a6680", "#9a97b0", "#cac8dc", "#f4f4fc"), 2.6, 2.8);
export const BRONZE = M("бронза", R("#2a1408", "#4a2810", "#74421c", "#a0642c", "#c88a44", "#e8b470", "#fff0c8"), 2.4, 2.8);
export const LEATHER = M("кожа", R("#24160e", "#3e2618", "#6a4228", "#94613a", "#bb8a58"), 1.9, 2.3);
export const ROPE = M("верёвка", R("#3a2a18", "#5e462a", "#86683e", "#ac8a58", "#d0b07c"), 2.0, 2.2);
export const HOOF = M("копыто", R("#120c0a", "#241a14", "#3a2c22", "#54402e", "#6e5640"), 1.6, 2.2);
export const CLAW = M("когти", R("#0c0a0a", "#1c1816", "#34302c", "#5a544c", "#8a8274", "#c8c0b0"), 1.9, 2.6);
export const IVORY = M("бивень", R("#3a3424", "#6a6048", "#9a8e6c", "#c8bc94", "#e8e0c0", "#fffbe8"), 2.2, 2.6);
export const BONE_ = M("кость", R("#2e281e", "#4e4638", "#7a6e56", "#a89a7c", "#d0c4a4", "#f0e8cc"), 2.2, 2.5);
export const HORN_DK = M("тёмный рог", R("#0a0810", "#1a1622", "#2e2838", "#463e52", "#625874", "#8a80a0"), 1.9, 2.6);

// ---------------- текстуры ----------------
export const hairTex: TexFn = (c) => (c.edge ? 0 : (Math.floor(c.l[0] * 1.6 + c.l[1] * 0.9 + 40) % 3 === 0 ? -0.7 : 0.15));
export const furTex = (amt = 0.14): TexFn => (c) => (c.edge ? 0 : hash01(Math.floor(c.l[0] * 0.8 + 20), Math.floor(c.l[1] * 0.8 + 20) * 3 + Math.floor(c.l[2] * 0.8), 5) < amt ? -0.6 : 0);
/** Шерсть прядями: вертикальные штрихи (мамонт, як). */
export const shagTex: TexFn = (c) => (c.edge ? 0 : (c.x + Math.floor((c.y - c.ay + 60) / 3)) % 3 === 0 ? -0.8 : (c.y - c.ay + 60) % 3 === 0 ? 0.3 : 0);
export const scaleTex = (dk = -0.8): TexFn => (c) => {
  if (c.edge) return 0;
  const dy = c.y - c.ay + 90, row = Math.floor(dy / 2), ph = (c.x - c.ax + 90 + (row & 1)) % 3;
  return dy % 2 === 1 && ph === 0 ? dk : 0;
};
/** Перья слоями: ряды по 3 px со сдвигом, светлая кромка сверху и тёмный полумесяц снизу. */
export const featherTex = (dk = -0.9): TexFn => (c) => {
  if (c.edge) return 0;
  const dy = c.y - c.ay + 90, row = Math.floor(dy / 3), yy = dy % 3;
  const ph = (c.x - c.ax + 90 + (row & 1) * 2) % 4;
  if (yy === 2 && ph !== 1 && ph !== 2) return dk;
  if (yy === 1 && ph === 0) return dk * 0.8;
  if (yy === 0 && (ph === 1 || ph === 2)) return 0.45;
  return 0;
};
/** Блик металла: две ступени к свету. */
export const shine: TexFn = (c) => (c.edge ? 0 : c.lum > 0.86 ? 2 : c.lum > 0.66 ? 1 : 0);
/** Пластина с каймой другого металла по краю (|u| > k у эллипсоида и бруска). */
export const rimTex = (trim: Mat, k = 0.72): TexFn => (c) => {
  if (!c.edge && c.lum > 0.86) return 2;
  if (c.lum > 0.66 && !c.edge) return 1;
  return Math.abs(c.u) > k ? { mat: trim, d: 0 } : 0;
};
/** Трещины с жаром (лавовый конь): по сетке в местных координатах — светящийся материал. */
export const crackTex = (glow: Mat, amt = 0.16): TexFn => (c) => {
  if (c.edge) return 0;
  const a = Math.abs(Math.sin(c.l[0] * 1.3 + c.l[1] * 0.7) + Math.sin(c.l[1] * 1.1 - c.l[2] * 0.9));
  return a < amt ? { mat: glow, d: 0 } : 0;
};
/** Руны-полосы (лось, дракон): светящиеся дуги по местной оси. */
export const runeTex = (glow: Mat, period = 3.2, w = 0.35): TexFn => (c) => (!c.edge && Math.abs(((c.l[2] + 40) % period) - period / 2) < w ? { mat: glow, d: 0 } : 0);

/** Пламя вдоль конуса: у корня ярко, к концу — в красный; u0..u1 — доля длины всего языка; мерцание по кадру. */
export const flameTex = (u0: number, u1: number, fi = 0): TexFn => (q) => 1.3 - 3.6 * (u0 + (u1 - u0) * clamp(q.u, 0, 1)) + (hash01(q.x, q.y, fi + 77) < 0.12 ? -1 : 0);

// ---------------- поза ----------------
export interface Leg { foot: V3; fold: number }
export interface Wing { spread: number; lift: number; ruffle: number }
export interface Pose {
  t: number; run: boolean;
  bob: number; pitch: number; roll: number;
  neckP: number; neckY: number; headP: number; headY: number; headR: number; jaw: number;
  legs: Leg[];
  maneSw: number[]; maneBack: number; maneDrop: number;
  tailY: number; tailLift: number; tailWave: number; tailPh: number;
  ear: number;
  wing: Wing[];
  /** свои параметры модели (хобот, уши слона, клевок…) */
  a: Record<string, number>;
}
export interface Layout { fx: number; hx: number; fy: number; hy: number }
export const standLegs = (L: Layout): Leg[] => [
  { foot: [-L.fx, L.fy, 0], fold: 0 }, { foot: [L.fx, L.fy, 0], fold: 0 }, { foot: [-L.hx, L.hy, 0], fold: 0 }, { foot: [L.hx, L.hy, 0], fold: 0 },
];
export const win = (u: number, a: number, b: number) => clamp((u - a) / (b - a), 0, 1);
export const bump = (s: number) => (s <= 0 || s >= 1 ? 0 : Math.sin(Math.PI * s));
/** Встряхивание: n полуволн, затухает к концу окна. */
export const shake = (s: number, n = 2) => (s <= 0 || s >= 1 ? 0 : Math.sin(TAU * n * s) * Math.pow(1 - s, 0.8) * Math.sin(Math.PI * Math.min(1, s * 4)));
export function keyed(keys: number[][], s: number): number[] {
  for (let k = 0; k + 1 < keys.length; k++) {
    const a = keys[k], b = keys[k + 1];
    if (s <= b[0]) { const e = easeInOut((s - a[0]) / (b[0] - a[0] || 1)); return a.slice(1).map((v, i) => lerp(v, b[i + 1], e)); }
  }
  return keys[keys.length - 1].slice(1);
}
export interface GaitOpt { reach?: [number, number]; lift?: [number, number]; fold?: [number, number]; phase?: number[]; stance?: number }
/** Галоп/скачки: опора stance доли цикла, мах — дугой с подгибом. phase — [перед-лев, перед-прав, зад-лев, зад-прав]. */
export function gallop(t: number, L: Layout, o: GaitOpt = {}): Leg[] {
  const S = o.stance ?? 0.42, ph = o.phase ?? [0.5, 0.6, 0.0, 0.1];
  const reach = o.reach ?? [7.2, 6.6], lift = o.lift ?? [5.2, 3.8], fold = o.fold ?? [1.9, 1.3];
  return standLegs(L).map((l, i) => {
    const fr = i < 2 ? 0 : 1;
    const u = (((t + ph[i]) % 1) + 1) % 1;
    let dy = 0, z = 0, fd = 0;
    if (u < S) dy = reach[fr] * (1 - (2 * u) / S);
    else {
      const s = (u - S) / (1 - S);
      dy = -reach[fr] + 2 * reach[fr] * easeInOut(s);
      z = lift[fr] * Math.sin(Math.PI * s);
      fd = fold[fr] * Math.sin(Math.PI * Math.min(1, s * 1.15));
    }
    return { foot: [l.foot[0], l.foot[1] + dy, z] as V3, fold: fd };
  });
}
export function basePose(L: Layout, t: number, run: boolean): Pose {
  return {
    t, run, bob: 0, pitch: 0, roll: 0, neckP: 0, neckY: 0, headP: 0, headY: 0, headR: 0, jaw: 0,
    legs: standLegs(L), maneSw: [0, 0, 0, 0, 0, 0], maneBack: 0, maneDrop: 1, tailY: 0, tailLift: 0, tailWave: 0.25, tailPh: 0, ear: 0,
    wing: [{ spread: 0, lift: 0, ruffle: 0 }, { spread: 0, lift: 0, ruffle: 0 }], a: {},
  };
}
/** Бег по умолчанию: галоп, качание корпуса, грива и хвост по ветру. */
export function runPose(t: number, L: Layout, o: GaitOpt & { bob?: number; pitch?: number } = {}): Pose {
  const p = basePose(L, t, true), w = TAU * t;
  p.legs = gallop(t, L, o);
  p.bob = (o.bob ?? 1.3) * Math.sin(w + 2.2);
  p.pitch = (o.pitch ?? 0.075) * Math.sin(w + 0.4);
  p.neckP = 0.12 + 0.1 * Math.sin(w - 0.6);
  p.headP = 0.05 * Math.sin(w - 1);
  p.maneSw = [0, 1, 2, 3, 4, 5].map((k) => 0.6 * Math.sin(w * 2 - k * 0.9));
  p.maneBack = 3.2; p.maneDrop = 0.9;
  p.tailLift = 0.75; p.tailWave = 1; p.tailPh = w * 2; p.ear = -0.5;
  return p;
}

// ---------------- контекст кадра ----------------
export interface Ctx {
  sc: Scene; b: { sc: Scene; bits: Map<Prim, number> }; p: Pose; f: Frame; view: MView;
  /** точка корпуса (покой) → мир с наклоном и подъёмом корпуса */
  T: (q: V3) => V3;
  TD: (d: V3) => V3;
  ax: (a: V3, b: V3, c: V3) => [V3, V3, V3];
  /** доля цикла (для эффектов) */
  t: number;
}
export function ctx(f: Frame, view: MView, p: Pose, piv: V3): Ctx {
  const sc = new Scene();
  const c0 = Math.cos(p.pitch), s0 = Math.sin(p.pitch), cr = Math.cos(p.roll), sr = Math.sin(p.roll);
  const TD = (d: V3): V3 => {
    const x = d[0] * cr - d[2] * sr, z1 = d[0] * sr + d[2] * cr;
    return [x, d[1] * c0 - z1 * s0, z1 * c0 + d[1] * s0];
  };
  const T = (q: V3): V3 => { const r = TD([q[0] - piv[0], q[1] - piv[1], q[2] - piv[2]]); return [piv[0] + r[0], piv[1] + r[1], piv[2] + r[2] + p.bob]; };
  return { sc, b: { sc, bits: new Map() }, p, f, view, T, TD, ax: (a, b, c) => [TD(a), TD(b), TD(c)], t: f.i / f.n };
}
/** Детали, добавленные в fn, рисуются поверх всадника в видах mask. */
export const over = (c: Ctx, mask: number, fn: () => void) => (mask ? front(c.b, mask, fn) : fn());
/** Ближний бок по знаку x: правый — вид «вправо», левый — «влево». */
export const near = (sx: number) => (sx > 0 ? VB.side : VB.left);
export { VB };

/** Масштаб всех деталей и штампов, добавленных после (i0, s0), вокруг точки (крупная голова и т. п.). */
export function scaleFrom(c: Ctx, i0: number, s0: number, at: V3, k: number) {
  const S = (v: V3): V3 => add(at, mul(sub(v, at), k));
  for (let i = i0; i < c.sc.prims.length; i++) {
    const q = c.sc.prims[i];
    q.a = S(q.a); q.b = S(q.b); q.anc = S(q.anc); q.ra *= k; q.rb *= k; q.r = mul(q.r, k); q.rr *= k;
  }
  for (let i = s0; i < c.sc.stamps.length; i++) c.sc.stamps[i].at = S(c.sc.stamps[i].at);
}

// ---------------- ноги ----------------
export type Foot = "hoof" | "paw" | "pad" | "talon" | "claw";
export interface LegOpt {
  L: Layout;
  /** высота плеча и бедра (сустав внутри корпуса) */
  hipZ: [number, number];
  /** длины костей: передние [верх, низ], задние [верх, низ] */
  len: [[number, number], [number, number]];
  /** радиусы: [плечо/бедро, колено, щётка] для передних и задних */
  r: [[number, number, number], [number, number, number]];
  foot: Foot | [Foot, Foot];
  coat: Mat; coatDk?: Mat; footMat?: Mat; lower?: Mat;
  /** шерсть над копытом (тяжеловоз, як) */
  feather?: Mat;
  tex?: TexFn;
  /** поножи: сапог на нижней части ноги и наколенник */
  boot?: { metal: Mat; trim: Mat; gem?: Mat; spike?: boolean };
  /** передние ноги поверх всадника при взгляде вниз, задние — со спины */
  layers?: boolean;
  /** размер ступни (слон — широкая) */
  footK?: number;
}
export interface LegOut { hip: V3; knee: V3; fet: V3; foot: V3 }
export function legs4(c: Ctx, o: LegOpt): LegOut[] {
  const out: LegOut[] = [];
  for (let i = 0; i < 4; i++) {
    const fr = i < 2, sx = i % 2 === 0 ? -1 : 1, k = fr ? 0 : 1;
    const L = c.p.legs[i];
    const ft: Foot = Array.isArray(o.foot) ? o.foot[k] : o.foot;
    const draw = () => {
      const g = c.sc.group(0.7);
      const hip = c.T(fr ? [sx * o.L.fx, o.L.fy - 0.8, o.hipZ[0]] : [sx * o.L.hx, o.L.hy + 0.2, o.hipZ[1]]);
      const pd = rotAxis(ft === "pad" ? [0, 0, 2.4] : ft === "paw" || ft === "claw" ? [0, -0.8, 2.6] : [0, -0.9, 3.2], X, -L.fold);
      const fk = o.footK ?? 1;
      const foot = L.foot, fet = add(foot, pd);
      const [l1, l2] = o.len[k];
      const knee = ik(hip, fet, l1, l2, fr ? (ft === "pad" ? [0, 0.3, -0.2] : [0, 1, -0.2]) : [0, -1, -0.2]);
      const m = sx > 0 ? o.coat : o.coatDk ?? o.coat;
      const [r0, r1, r2] = o.r[k];
      c.sc.cone(g, m, hip, r0, knee, r1, { tex: o.tex });
      c.sc.cone(g, o.lower && sx > 0 ? o.lower : o.lower ? { ...o.lower, base: o.lower.base - 0.3 } as Mat : m, knee, r1 * 0.95, fet, r2, { tex: o.lower ? undefined : o.tex });
      if (o.boot) {
        const bt = lerpV(knee, fet, 0.3);
        c.sc.cone(c.sc.group(0.2), o.boot.metal, bt, r2 * 1.42, add(fet, [0, 0, -0.4]), r2 * 1.5, { tex: rimTex(o.boot.trim, 0.78) });
        if (o.boot.gem) c.sc.ball(c.sc.group(0), o.boot.gem, add(lerpV(bt, fet, 0.5), [0, r2 * 1.4, 0]), 0.7);
        const kc = add(knee, fr ? [0, 1.1, 0.2] : [0, -1.0, 0.3]);
        c.sc.ball(c.sc.group(0), o.boot.metal, kc, r1 * 1.25, { tex: rimTex(o.boot.trim, 0.55) });
        if (o.boot.spike) c.sc.cone(c.sc.group(0), o.boot.trim, add(kc, [0, fr ? 1.6 : -1.6, 0.4]), 0.8, add(kc, [0, fr ? 3.6 : -3.6, 1.4]), 0.15, { tex: shine });
      }
      if (o.feather) c.sc.ball(g, o.feather, add(fet, [0, -0.4, -0.6]), r2 * 1.35, { tex: hairTex });
      const fm = o.footMat ?? HOOF;
      if (ft === "hoof") {
        const hd = norm(pd);
        c.sc.cone(g, m, fet, r2, add(foot, mul(hd, 1.3)), r2 * 1.08);
        c.sc.box(c.sc.group(0), fm, add(foot, mul(hd, 0.9)), [r2 * 1.2 * fk, r2 * 1.38 * fk, 1.0], [X, norm(rotAxis(Y, X, -L.fold)), hd], 0.45, { big: false });
      } else if (ft === "pad") {
        c.sc.cone(g, m, fet, r2, add(foot, [0, 0, 0.9]), r2 * 1.12 * fk, { tex: o.tex });
        for (const dx of [-0.55, 0, 0.55]) c.sc.ball(c.sc.group(0), fm, add(foot, [dx * r2, r2 * 0.95, 0.7]), 0.55 * fk, { big: false });
      } else if (ft === "paw" || ft === "claw") {
        const paw = add(foot, rotAxis([0, 0.8, 1.0], X, -L.fold * 0.5));
        c.sc.cone(g, m, fet, r2, paw, r2 * 1.05);
        c.sc.ell(g, m, add(paw, rotAxis([0, 0.7, -0.15], X, -L.fold * 0.5)), [r2 * 1.15, r2 * 1.35, r2 * 0.75], [X, Y, Z], { tex: o.tex });
        const cl = ft === "claw" ? 1.6 : 1;
        for (const dx of [-0.75, 0, 0.75]) {
          const c0 = add(paw, rotAxis([dx * r2, r2 * 1.7, -0.3], X, -L.fold * 0.5));
          c.sc.cone(c.sc.group(0), fm.name === HOOF.name ? CLAW : fm, c0, 0.45 * cl, add(c0, rotAxis([0, 0.8 * cl, -0.7 * cl], X, -L.fold * 0.5)), 0.15, { tex: shine });
        }
      } else {
        // птичья лапа: три пальца вперёд, один назад, крупные когти
        const ank = fet;
        for (const [dx, dy, len] of [[-1.1, 1, 2.8], [0, 1, 3.2], [1.1, 1, 2.8], [0, -1, 1.4]]) {
          const tip = add(foot, rotAxis([dx, dy * len, 0.2], X, -L.fold * 0.6));
          c.sc.cone(c.sc.group(0.3), o.lower ?? m, add(ank, [0, 0, -1.2]), 0.9, tip, 0.7);
          const cm = add(tip, rotAxis([0, dy, 0.1], X, -L.fold * 0.6));
          c.sc.cone(c.sc.group(0.2), fm.name === HOOF.name ? CLAW : fm, tip, 0.65, cm, 0.42, { tex: shine });
          c.sc.cone(c.sc.group(0.2), fm.name === HOOF.name ? CLAW : fm, cm, 0.42, add(cm, rotAxis([0, dy * 0.4, -1.0], X, -L.fold * 0.6)), 0.12, { tex: shine });
        }
      }
      out.push({ hip, knee, fet, foot });
    };
    over(c, o.layers === false ? 0 : fr ? VB.down : VB.up, draw);
  }
  return out;
}

// ---------------- тело ----------------
export interface BodyOpt {
  /** центр корпуса по высоте, длина (полу), ширина (полу), высота (полу) */
  z: number; len: number; w: number; h: number;
  coat: Mat; tex?: TexFn;
  /** грудь и круп: смещение по Y и радиусы [x, y, z] */
  chest?: [number, V3]; rump?: [number, V3];
  /** горб над плечами (як, мамонт, носорог) */
  hump?: [number, number, number];
  /** круп поверх всадника со спины */
  rumpOver?: boolean;
}
export function body(c: Ctx, o: BodyOpt) {
  const g = c.sc.group(2.6), A = c.ax(X, Y, Z);
  c.sc.ell(g, o.coat, c.T([0, -0.5, o.z]), [o.w, o.len, o.h], A, { tex: o.tex });
  const ch = o.chest ?? [o.len * 0.78, [o.w * 0.98, o.h * 0.95, o.h * 0.95]];
  c.sc.ell(g, o.coat, c.T([0, ch[0], o.z + 0.2]), ch[1], A, { tex: o.tex });
  const ru = o.rump ?? [-o.len * 0.78, [o.w * 1.02, o.h, o.h]];
  over(c, o.rumpOver ? VB.up : 0, () => {
    c.sc.ell(g, o.coat, c.T([0, ru[0], o.z + 0.8]), ru[1], A, { tex: o.tex });
    for (const sx of [-1, 1]) c.sc.ell(g, o.coat, c.T([sx * o.w * 0.55, ru[0] - 1, o.z - 0.6]), [ru[1][0] * 0.45, ru[1][1] * 0.8, ru[1][2] * 0.98], A, { tex: o.tex });
  });
  for (const sx of [-1, 1]) c.sc.ell(g, o.coat, c.T([sx * o.w * 0.5, ch[0] - 0.2, o.z - 1.0]), [ch[1][0] * 0.42, ch[1][1] * 0.66, ch[1][2] * 0.95], A, { tex: o.tex });
  if (o.hump) c.sc.ell(g, o.coat, c.T([0, o.hump[0], o.z + o.h * 0.8]), [o.w * 0.7, o.hump[1], o.hump[2]], A, { tex: o.tex });
}

// ---------------- шея и голова ----------------
/** Шея от основания (точка корпуса) вектором v с поворотом позы; возвращает затылок и функцию направления шеи. */
export function neck(c: Ctx, base: V3, v: V3, r: [number, number], m: Mat, tex?: TexFn, crestR = 0.6) {
  const NB = c.T(base);
  const nd = (u: V3): V3 => c.TD(rot(u, c.p.neckP, c.p.neckY));
  const poll = add(NB, nd(v));
  const mid = add(NB, nd(mul(v, 0.5)));
  const gn = c.sc.group(2.2);
  c.sc.cone(gn, m, NB, r[0], mid, lerp(r[0], r[1], 0.55), { tex });
  c.sc.cone(gn, m, mid, lerp(r[0], r[1], 0.55), poll, r[1], { tex });
  if (crestR > 0) c.sc.cone(gn, m, add(NB, nd([0, -r[0] * 0.5, r[0] * 0.8])), r[0] * crestR, add(poll, nd([0, -r[1] * 0.4, r[1] * 0.1])), r[1] * 0.85, { tex });
  return { NB, poll, nd, crest: (t: number): V3 => lerpV(add(NB, nd([0, -r[0] * 0.45, r[0] * 0.95])), add(poll, nd([0, -r[1] * 0.4, r[1] * 0.5])), t) };
}
/** Оси головы: w — вдоль морды (из позы шеи и головы), fv — «лицом» (вверх-вперёд), s — вбок; H(a, c, d) — точка. */
export function headAxes(c: Ctx, poll: V3, nd: (u: V3) => V3, dir: V3 = [0, 0.62, -0.78]) {
  const hr = (v: V3) => nd(rotAxis(rotAxis(rotAxis(v, X, c.p.headP), Z, c.p.headY), dir, c.p.headR));
  const w = norm(hr(dir)), s = norm(hr(X)), fv = norm(cross(s, w));
  const H = (a: number, cc: number, d: number): V3 => add(poll, add(mul(w, a), add(mul(fv, cc), mul(s, d))));
  return { w, fv, s, H };
}
/** Голова коня (морда, щёки, ноздри, уши, глаза). */
export function horseHead(c: Ctx, poll: V3, nd: (u: V3) => V3, m: Mat, o: { muzzle?: Mat; ears?: boolean; eye?: string; eyeGlow?: boolean; len?: number } = {}) {
  const A = headAxes(c, poll, nd);
  const { w, fv, s, H } = A;
  const gh = c.sc.group(1.4), L = o.len ?? 1;
  c.sc.ell(gh, m, H(2.4, 0.3, 0), [2.9, 3.0, 3.8], [s, fv, w]);
  c.sc.ball(gh, m, H(3.8, -1.8, 0), 2.8);
  c.sc.cone(gh, m, H(5.0, 0.1, 0), 2.5, H(10.4 * L, -0.3, 0), 2.05);
  c.sc.ell(gh, o.muzzle ?? m, H(10.6 * L, -0.6, 0), [2.2, 2.2, 1.9], [s, fv, w]);
  if (o.ears !== false) for (const sx of [-1, 1]) {
    const e0 = H(-0.4, -0.4, sx * 1.35);
    const up = norm(add(mul(fv, 0.15 + (sx > 0 ? c.p.ear * 0.5 : 0)), add(mul(w, -1), mul(s, sx * 0.3))));
    c.sc.cone(c.sc.group(0.4), m, e0, 0.9, add(e0, mul(up, 3.2)), 0.3);
  }
  eyes(c, A, H(2.6, 0.7, 0), 2.6, o.eye ?? "#2a1810", !!o.eyeGlow);
  return A;
}
export function eyes(c: Ctx, A: { w: V3; fv: V3; s: V3 }, at: V3, spread: number, col: string, glow = false) {
  for (const sx of [-1, 1]) c.sc.stamps.push({
    at: add(at, mul(A.s, sx * spread)), n: norm(add(mul(A.s, sx), mul(A.fv, 0.3))),
    colors: { K: hex("#0a0608"), E: hex(col) }, glow: glow ? ["E"] : undefined, halo: glow ? hex(col) : undefined,
    px: { side: [[0, 0, "K"], [1, 0, "E"]], down: [[0, 0, "E"]] }, depthTol: 2.5,
  });
}

// ---------------- волосы и хвосты ----------------
/** Грива прядями в два слоя вдоль гребня (crest(t) — точка гребня), свисает на правую сторону. */
export function mane(c: Ctx, crest: (t: number) => V3, m: Mat, o: { n?: number; len?: number; r?: number; side?: number; tex?: TexFn; glow?: boolean; up?: number } = {}) {
  const n = o.n ?? 9, len0 = o.len ?? 1, r = o.r ?? 1.6, side = o.side ?? 1;
  for (let k = 0; k < n; k++) {
    const t = 0.02 + (k * 0.98) / n;
    const sw = c.p.maneSw[Math.min(5, Math.floor((k * 6) / n))] ?? 0;
    for (const layer of [0, 1]) {
      const r0 = add(crest(t + layer * 0.04), [side * (0.6 + layer * 0.9), 0, -0.2 - layer * 0.5 + (o.up ?? 0) * 0.3]);
      const len = len0 * (1 + 0.25 * Math.sin(k * 2.3 + layer));
      const drop = o.up ? -o.up : 3.6 * c.p.maneDrop;
      const tip = add(r0, [side * (1.2 + layer * 0.6) + sw * 0.7, (-1.0 - c.p.maneBack) * len, -drop * len + (o.glow ? Math.sin(c.t * TAU * 2 + k) * 0.8 : 0)]);
      const mid = add(lerpV(r0, tip, 0.5), [sw * 0.45 + side * 0.5, 0, 0.4]);
      const gm = c.sc.group(0.6);
      const mm = layer || o.glow ? m : ({ ...m, base: m.base - 0.5 } as Mat);
      c.sc.cone(gm, mm, r0, r, mid, r * 0.84, { tex: o.tex ?? (o.glow ? flameTex(0, 0.5, c.f.i) : hairTex) });
      c.sc.cone(gm, mm, mid, r * 0.84, tip, 0.45, { tex: o.tex ?? (o.glow ? flameTex(0.5, 1, c.f.i) : hairTex) });
    }
  }
}
/** Конский хвост из трёх прядей; idle — свисает, бег — по ветру. */
export function hairTail(c: Ctx, base: V3, m: Mat, o: { n?: number; seg?: number; r?: number[]; glow?: boolean; over?: boolean } = {}) {
  const p = c.p, n = o.n ?? 8, seg = o.seg ?? 3.0;
  const pts: V3[] = [base];
  let cur = base;
  for (let k = 1; k <= n; k++) {
    const s = k / n;
    const sw = Math.sin(p.tailPh - k * 0.7) * p.tailWave * s;
    const dz = p.tailLift ? 0.35 - 0.6 * s : 0.5 - 3.4 * s;
    cur = add(cur, mul(norm([sw * 0.7 + p.tailY * 1.4 * s, -1.0 + (p.tailLift ? 0 : 0.35 * s), dz]), seg));
    pts.push(cur);
  }
  const RR = o.r ?? [2.2, 2.7, 2.8, 2.6, 2.3, 1.9, 1.5, 1.1, 0.7];
  over(c, o.over === false ? 0 : VB.up, () => {
    for (const [ox, k0, dz] of [[0, 1, 0], [-1.3, 0.75, 0.6], [1.3, 0.75, 0.6]] as [number, number, number][]) {
      const gt = c.sc.group(0.9);
      const off = (k: number): V3 => [ox * (k / n) * 1.4 + Math.sin(p.tailPh - k * 0.9 + ox) * 0.35 * (k / n) + (o.glow ? Math.sin(c.t * TAU * 3 + k + ox) * 0.5 : 0), 0, dz * (k / n)];
      const mm = ox && !o.glow ? ({ ...m, base: m.base - 0.4 } as Mat) : m;
      for (let k = 0; k + 1 < pts.length; k++) c.sc.cone(gt, mm, add(pts[k], off(k)), RR[Math.min(k, RR.length - 1)] * k0 * (o.glow ? 0.8 : 1), add(pts[k + 1], off(k + 1)), RR[Math.min(k + 1, RR.length - 1)] * k0 * (o.glow ? 0.8 : 1), { tex: o.glow ? flameTex(k / n, (k + 1) / n, c.f.i) : hairTex });
    }
  });
  return pts;
}
/** Хвост-цепочка (ящер, лев, дракон): толщина от r0 к r1, изгиб и мах из позы. Возвращает точки. */
export function segTail(c: Ctx, base: V3, m: Mat, o: { n?: number; seg?: number; r0?: number; r1?: number; droop?: number; tex?: TexFn; over?: boolean; swing?: number; lift?: number } = {}) {
  const p = c.p, n = o.n ?? 8, seg = o.seg ?? 3;
  const pts: V3[] = [base];
  let cur = base;
  for (let k = 1; k <= n; k++) {
    const s = k / n;
    const sw = Math.sin(p.tailPh - k * 0.6) * (o.swing ?? 0.5) * s * (p.run ? 1.4 : 1) + p.tailY * s;
    const dz = (o.lift ?? 0) - (o.droop ?? 0.4) * (p.run ? 0.4 : 1) * Math.sin(Math.PI * s * 0.9);
    cur = add(cur, mul(norm([sw, -1, dz]), seg));
    pts.push(cur);
  }
  over(c, o.over === false ? 0 : VB.up, () => {
    const g = c.sc.group(0.8);
    for (let k = 0; k < n; k++) c.sc.cone(g, m, pts[k], lerp(o.r0 ?? 2, o.r1 ?? 0.4, k / n), pts[k + 1], lerp(o.r0 ?? 2, o.r1 ?? 0.4, (k + 1) / n), { tex: o.tex });
  });
  return pts;
}

// ---------------- седло и попона ----------------
export interface SaddleOpt { y: number; z: number; w: number; len?: number; leather?: Mat; trim?: Mat; flapX: number; flapZ?: number; cantle?: number; stirrup?: Mat; pad?: Mat }
export function saddle(c: Ctx, o: SaddleOpt) {
  const A = c.ax(X, Y, Z), gs = c.sc.group(0.6), le = o.leather ?? LEATHER, tr = o.trim ?? GOLD, len = o.len ?? 5.8;
  if (o.pad) c.sc.ell(gs, o.pad, c.T([0, o.y, o.z - 0.9]), [o.w + 1.4, len + 1.6, 1.0], A, { tex: (q) => (Math.hypot(q.l[0] / (o.w + 1.4), q.l[1] / (len + 1.6)) > 0.84 ? { mat: tr, d: 0 } : 0) });
  c.sc.ell(gs, le, c.T([0, o.y, o.z]), [o.w, len, 1.6], A);
  c.sc.box(gs, tr, c.T([0, o.y + len * 0.93, o.z + 1.4]), [2.4, 0.9, 1.4], A, 0.6, { tex: shine });
  c.sc.box(gs, tr, c.T([0, o.y - len * 0.9, o.z + 1.4 + (o.cantle ?? 0.6)]), [3.6, 0.9, 1.9 + (o.cantle ?? 0)], c.ax(X, norm([0, 0.9, 0.4]), norm([0, -0.4, 0.9])), 0.6, { tex: shine });
  for (const sx of [-1, 1]) over(c, near(sx), () => {
    c.sc.box(c.sc.group(0.2), le, c.T([sx * o.flapX, o.y + 0.2, o.flapZ ?? o.z - 4.4]), [0.6, 3.4, 4.0], A, 0.4, { tex: (q) => (Math.abs(q.l[1]) > 2.7 || q.l[2] < -3.3 ? { mat: tr, d: 0 } : 0) });
    c.sc.cone(c.sc.group(0), o.stirrup ?? tr, c.T([sx * (o.flapX + 0.5), o.y + 0.8, (o.flapZ ?? o.z - 4.4) - 4.6]), 0.9, c.T([sx * (o.flapX + 0.5), o.y + 0.8, (o.flapZ ?? o.z - 4.4) - 6]), 0.9);
  });
}
/** Попона: две части (задняя поверх всадника со спины), подол двумя полосами, герб на боках и крупе. */
export function caparison(c: Ctx, o: { y0: number; y1: number; zc: number; hz: number; w: number; cloth: Mat; hem: Mat; trim: Mat; fac?: Fac; rr?: number }) {
  const tex: TexFn = (q) => {
    const zb = q.l[2];
    if (zb < -o.hz + 1.2) return { mat: o.trim, d: ((q.x + 40) % 3 === 0 ? -1.2 : 0) + (q.lum > 0.6 ? 0.6 : 0) };
    if (zb < -o.hz + 2.5) return { mat: o.hem, d: 0 };
    return 0;
  };
  const A = c.ax(X, Y, Z), mid = (o.y0 + o.y1) / 2, h1 = (o.y1 - mid) / 2;
  c.sc.box(c.sc.group(0), o.cloth, c.T([0, mid + h1, o.zc]), [o.w, h1 + 0.1, o.hz], A, o.rr ?? 4.4, { tex });
  over(c, VB.up, () => c.sc.box(c.sc.group(0), o.cloth, c.T([0, mid - h1, o.zc]), [o.w, h1 + 0.1, o.hz], A, o.rr ?? 4.4, { tex }));
  if (o.fac) {
    const em = pcStamp(factionEmblem(o.fac, "s16"));
    for (const sx of [-1, 1]) c.sc.stamps.push({ at: c.T([sx * o.w, mid - h1 * 0.8, o.zc + 1.4]), n: c.TD([sx, 0, 0]), colors: em.colors, px: { side: em.px }, depthTol: 3, minFacing: 0.3 });
    c.sc.stamps.push({ at: c.T([0, o.y0, o.zc + 1.6]), n: c.TD([0, -1, 0]), colors: em.colors, px: { up: em.px }, depthTol: 3, minFacing: 0.3 });
  }
}
/** Герб (s16) на пластине в одном виде. */
export function emblem(c: Ctx, fac: Fac, at: V3, n: V3, view: "down" | "up" | "side") {
  const em = pcStamp(factionEmblem(fac, "s16"));
  c.sc.stamps.push({ at, n, colors: em.colors, px: { [view]: em.px }, depthTol: 3, minFacing: 0.25 });
}
/** Палитра брони по фракции всадника. */
export function facKit(fac: Fac) {
  return fac === "solgard"
    ? { metal: STEEL, trim: GOLD, gem: GEM_AZ, cloth: M("лазурь", R("#0c2444", "#12365e", "#1f5a96", "#3a86c8", "#7ec8ff"), 1.9, 2.2), hem: M("белое сукно", R("#5a5462", "#7a7480", "#aaa4ae", "#d6d0d8", "#f6f2f8"), 2.0, 2.2), eye: "#a8dcff" }
    : { metal: IRON, trim: SILVER, gem: GEM_GRN, cloth: M("чернь", R("#07040c", "#100a1a", "#22163a", "#382858", "#4e3a72"), 1.9, 2.2), hem: M("пурпур", R("#1a0e2c", "#2a1846", "#46265e", "#6a3c8a", "#9a62b8"), 2.0, 2.2), eye: "#7aff6a" };
}

// ---------------- крылья ----------------
export interface FeatherWingOpt { root: V3; cover: Mat; prim: Mat; len?: number; n?: number; over?: number; tex?: TexFn; base?: [number, number] }
/** Перьевое крыло (грифон, сова): кроющие, ряды перьев, маховые веером. sx — сторона. */
export function featherWing(c: Ctx, sx: number, o: FeatherWingOpt) {
  const W = c.p.wing[sx < 0 ? 0 : 1];
  const root = c.T(o.root);
  let a: V3 = c.TD(norm([0, -1, 0.08]));
  a = rotAxis(a, Z, sx * ((o.base?.[0] ?? 0.12) + W.spread));
  const lf = (o.base?.[1] ?? 0.32) + W.lift;
  a = norm(add(mul(a, Math.cos(lf)), mul(Z, Math.sin(lf))));
  const n0 = norm(cross(a, Z));
  const nrm: V3 = mul(n0, Math.sign(n0[0] || sx) * sx) as V3;
  const dn = mul(norm(cross(nrm, a)), sx) as V3;
  const L = o.len ?? 1;
  over(c, near(sx), () => {
    const gw = c.sc.group(1.2);
    c.sc.ell(gw, o.cover, add(root, add(mul(a, 4.6 * L), mul(dn, 1.2))), [1.5, 6.0 * L, 3.0], [nrm, a, dn], { tex: o.tex ?? featherTex() });
    c.sc.ell(gw, o.cover, add(root, add(mul(a, 8.6 * L), mul(dn, 2.0))), [1.3, 4.6 * L, 2.8], [nrm, a, dn], { tex: o.tex ?? featherTex() });
    for (let j = 0; j < 2; j++) for (let k = 0; k < 4; k++) {
      const cc = add(root, add(mul(a, (3.4 + k * 2.4 + j * 1.2) * L), add(mul(dn, 2.6 + j * 1.6), mul(nrm, 0.6 + j * 0.2))));
      const fd = rotAxis(a, nrm, sx * 0.35);
      c.sc.ell(c.sc.group(0), j ? o.prim : o.cover, cc, [0.5, 1.9 * L, 1.15], [nrm, fd, norm(cross(nrm, fd))], { big: false, tex: (q) => (q.edge ? 0 : q.l[1] < -1.1 ? 0.6 : 0) });
    }
  });
  over(c, near(sx) | VB.up, () => {
    const n = o.n ?? 5;
    for (let k = 0; k < n; k++) {
      const fan = (k - (n - 1) / 2) * (0.07 + 0.12 * W.spread) + (W.ruffle ? Math.sin(k * 2.1 + W.ruffle * 5) * 0.06 * W.ruffle : 0);
      const fd = rotAxis(a, nrm, sx * (fan + 0.05));
      const st = add(root, add(mul(a, 6.4 * L), mul(dn, 0.4 + k * 0.75)));
      const len = (9.6 - Math.abs(k - 1) * 0.9) * L;
      c.sc.ell(c.sc.group(0.2), o.prim, add(st, mul(fd, len)), [0.6, len, 1.55], [nrm, fd, norm(cross(nrm, fd))], { tex: (q) => (q.edge ? 0 : Math.abs(q.l[2]) < 0.35 ? -0.7 : 0), big: false });
    }
  });
  return { root, a, nrm, dn };
}
/** Перепончатое крыло (дракон, лис-нетопырь): плечо и предплечье, пальцы, перепонки между ними; glow — светящиеся жилы. */
export function membraneWing(c: Ctx, sx: number, o: { root: V3; bone: Mat; skin: Mat; len?: number; fingers?: number; glowVein?: Mat }) {
  const W = c.p.wing[sx < 0 ? 0 : 1];
  const L = o.len ?? 1;
  const root = c.T(o.root);
  // сложено: плечо назад-вверх, локоть, кисть вперёд-вверх (пальцы назад); раскрыто — в сторону
  const spread = 0.15 + W.spread, lift = 0.35 + W.lift;
  const dirOut = (yaw: number, up: number): V3 => c.TD(norm([sx * Math.sin(yaw), -Math.cos(yaw), up]));
  const elbow = add(root, mul(dirOut(spread * 0.9 + 0.2, lift * 0.8 + 0.3), 5.5 * L));
  const wrist = add(elbow, mul(dirOut(spread * 1.1 - 0.9 + 0.9 * W.spread, lift + 0.4), 6.0 * L));
  const gb = c.sc.group(0.5);
  over(c, near(sx), () => {
    c.sc.cone(gb, o.bone, root, 1.6, elbow, 1.1);
    c.sc.cone(gb, o.bone, elbow, 1.1, wrist, 0.8);
    c.sc.cone(c.sc.group(0), CLAW, wrist, 0.6, add(wrist, mul(dirOut(spread - 0.4, lift + 1.2), 1.8)), 0.12);
  });
  const nf = o.fingers ?? 4;
  const tips: V3[] = [];
  for (let k = 0; k < nf; k++) {
    const f = k / (nf - 1);
    const yaw = lerp(spread * 0.6 + 0.3, -0.25, f) + W.spread * (0.6 + f * 0.8);
    const flen = lerp(11, 6.5, f) * L * (1 + W.spread * 0.25);
    tips.push(add(wrist, mul(dirOut(yaw, lerp(lift * 0.2, -0.4 - lift * 0.2, f)), flen)));
  }
  over(c, near(sx) | VB.up, () => {
    for (const t of tips) c.sc.cone(c.sc.group(0), o.bone, wrist, 0.55, t, 0.2);
    // перепонки: между корнем, локтем, кистью и концами пальцев — плоские эллипсоиды
    const pts = [root, ...tips, add(root, c.TD([0, -9 * L, -1.5]))];
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = k === 0 ? elbow : pts[k], b = pts[k + 1];
      const cen = mul(add(add(wrist, a), b), 1 / 3);
      const e1 = norm(sub(b, a)), e2 = norm(sub(wrist, mul(add(a, b), 0.5)));
      const nn = norm(cross(e1, e2));
      const r1 = vlen(sub(b, a)) * 0.55, r2 = vlen(sub(wrist, mul(add(a, b), 0.5))) * 0.62;
      const vein: TexFn | undefined = o.glowVein ? (q) => (!q.edge && Math.abs(q.l[0]) < 0.35 && (q.x + q.y) % 4 < 2 ? { mat: o.glowVein!, d: 0 } : 0) : undefined;
      c.sc.ell(c.sc.group(0), o.skin, cen, [r1, Math.max(0.35, r2), 0.35], [e1, norm(cross(nn, e1)), nn], { tex: vein, big: false });
    }
  });
  return { root, elbow, wrist, tips };
}

// ---------------- эффекты ----------------
/** Угли/искры: n частиц поднимаются от точек emit на высоту h за цикл; размер убывает. Петля без скачка. */
export function embers(c: Ctx, emit: V3[], n: number, m: Mat, h = 8, r = 0.6, drift: V3 = [0, -0.6, 0], layer = 0) {
  over(c, layer, () => {
    for (let k = 0; k < n; k++) {
      const s0 = hash01(k, 7, 31), ph = (c.t * (c.p.run ? 2 : 1) + s0) % 1;
      const e = emit[k % emit.length];
      const jx = (hash01(k, 3, 11) - 0.5) * 3, jy = (hash01(k, 5, 13) - 0.5) * 3;
      const q = add(e, [jx + drift[0] * ph * h * (c.p.run ? 2 : 0.5) + Math.sin(ph * TAU + k) * 0.6, jy + drift[1] * ph * h * (c.p.run ? 2 : 0.5), ph * h]);
      const rr = r * (1 - ph * 0.7);
      if (rr > 0.25) c.sc.ball(c.sc.group(0), m, q, rr, { big: false });
    }
  });
}
/** Языки пламени вдоль точек (грива, копыта): конусы светящегося материала, длина и наклон мерцают по кадрам. */
export function flames(c: Ctx, pts: V3[], m: Mat, o: { len?: number; r?: number; back?: number; layer?: number; core?: Mat } = {}) {
  over(c, o.layer ?? 0, () => {
    pts.forEach((b0, k) => {
      const fl = 0.75 + 0.35 * Math.sin(c.t * TAU * 3 + k * 1.7) + 0.15 * Math.sin(c.t * TAU * 5 + k);
      const len = (o.len ?? 4) * fl;
      const back = (o.back ?? 0.4) + (c.p.run ? 1.2 : 0);
      const tip = add(b0, [Math.sin(c.t * TAU * 2 + k) * 0.6, -back * len * 0.6, len]);
      const g = c.sc.group(0.6);
      c.sc.cone(g, m, b0, o.r ?? 1.3, tip, 0.2, { big: false, tex: m.glow ? flameTex(0, 1, c.f.i + k) : undefined });
      if (o.core) c.sc.cone(c.sc.group(0), o.core, add(b0, [0, 0, 0.3]), (o.r ?? 1.3) * 0.5, lerpV(b0, tip, 0.55), 0.15, { big: false });
    });
  });
}
/** Молнии: зигзаг светящихся отрезков между точками, на части кадров (вспышки). */
export function sparks(c: Ctx, a: V3, b: V3, m: Mat, seed: number, every = 3, layer = 0) {
  const fi = c.f.i;
  if ((fi + seed) % every !== 0) return;
  over(c, layer, () => {
    let cur = a;
    const n = 4;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const nxt = add(lerpV(a, b, t), k < n ? [(hash01(fi, k, seed) - 0.5) * 2.4, (hash01(fi, k + 9, seed) - 0.5) * 2.4, (hash01(fi, k + 3, seed) - 0.5) * 2.4] : [0, 0, 0]);
      c.sc.cone(c.sc.group(0), m, cur, 0.5, nxt, 0.5, { big: false });
      cur = nxt;
    }
  });
}

// ---------------- сборка ----------------
export function done(c: Ctx, seat: V3, banner?: Omit<Banner, "t" | "run">): Built {
  return { sc: c.sc, bits: c.b.bits, seat: c.T(seat), banner: banner ? { ...banner, t: c.f.i % 12, run: c.f.anim === "run" } : undefined };
}

// ---------------- действия покоя (u — доля цикла покоя; окна в кадрах из 24) ----------------
const W24 = (u: number, a: number, b: number) => win(u, a / 24, b / 24);
/** Роет землю копытом leg (1 — правое переднее): два удара. */
export function actPaw(p: Pose, L: Layout, u: number, a: number, b: number, leg = 1) {
  const s = W24(u, a, b);
  if (s <= 0 || s >= 1) return;
  const [dy, z, f] = keyed([[0, 0, 0, 0], [0.1, 2.0, 3.6, 1.2], [0.22, 3.4, 2.4, 0.7], [0.3, 1.8, 0.2, 0.2], [0.4, -0.6, 0, 0], [0.5, 2.0, 3.6, 1.2], [0.62, 3.4, 2.4, 0.7], [0.7, 1.8, 0.2, 0.2], [0.8, -0.6, 0, 0], [1, 0, 0, 0]], s);
  const st = standLegs(L)[leg];
  p.legs[leg] = { foot: [st.foot[0], st.foot[1] + dy, z], fold: f };
  p.neckP += 0.2 * bump(s);
}
/** Встряхивает головой и гривой (грива запаздывает). */
export function actShake(p: Pose, u: number, a: number, b: number, k = 1) {
  const s = W24(u, a, b);
  p.neckY += 0.32 * k * shake(s);
  p.headR += 0.25 * k * shake(W24(u - 0.6 / 24, a, b));
  p.neckP -= 0.08 * bump(s);
  p.maneSw = p.maneSw.map((v, j) => v - 3.2 * k * shake(W24(u - ((j + 1) * 0.35) / 24, a, b)));
}
/** Щиплет траву: шея вниз до земли, жуёт. */
export function actGraze(p: Pose, u: number, a: number, b: number, depth = 1.85) {
  const s = W24(u, a, b), e = easeInOut(Math.min(1, bump(s) * 1.6));
  p.neckP += depth * e;
  p.headP += 0.5 * e;
  p.jaw += e * Math.max(0, Math.sin(s * TAU * 4)) * 0.6;
}
/** Вскидывает голову (фырканье): шея назад-вверх и обратно. */
export function actToss(p: Pose, u: number, a: number, b: number, k = 1) {
  const s = W24(u, a, b);
  p.neckP -= 0.35 * k * bump(s);
  p.headP -= 0.5 * k * Math.sin(Math.PI * Math.min(1, s * 1.4)) * (s < 1 ? 1 : 0);
  p.jaw += 0.4 * k * bump(win(s, 0.2, 0.7));
}
/** Гарцует: поднимает переднюю ногу высоко (по очереди). */
export function actPrance(p: Pose, L: Layout, u: number, a: number, b: number) {
  const s = W24(u, a, b);
  for (const [leg, w0, w1] of [[1, 0, 0.5], [0, 0.5, 1]] as [number, number, number][]) {
    const q = win(s, w0, w1), e = bump(q);
    if (!e) continue;
    const st = standLegs(L)[leg];
    p.legs[leg] = { foot: [st.foot[0], st.foot[1] + 2.2 * e, 4.6 * e], fold: 1.8 * e };
  }
  p.neckP -= 0.12 * bump(s);
}
/** Встаёт на дыбы: корпус вверх вокруг задних ног, передние поджаты. */
export function actRear(p: Pose, L: Layout, u: number, a: number, b: number, k = 0.42) {
  const s = W24(u, a, b), e = easeInOut(Math.min(1, bump(s) * 1.5));
  if (!e) return;
  p.pitch += k * e;
  p.bob += 1.2 * e;
  for (const leg of [0, 1]) {
    const st = standLegs(L)[leg];
    const lift = (k * e) * (st.foot[1] - L.hy) + 2.5 * e;
    p.legs[leg] = { foot: [st.foot[0], st.foot[1] - 2.5 * e + (leg ? Math.sin(s * TAU * 2) * 1.2 * e : 0), lift], fold: 2.0 * e };
  }
  p.neckP -= 0.3 * e;
  p.jaw += 0.5 * e;
}
/** Взмах хвоста. */
export function actTail(p: Pose, u: number, a: number, b: number, k = 0.5) {
  const s = W24(u, a, b);
  p.tailY += k * Math.sin(TAU * s) * bump(s);
}
/** Поводит ухом. */
export function actEar(p: Pose, u: number, a: number, b: number) {
  p.ear += bump(W24(u, a, b));
}
/** Оглядывается по сторонам. */
export function actLook(p: Pose, u: number, a: number, b: number, k = 0.6) {
  const s = W24(u, a, b);
  p.neckY += k * Math.sin(TAU * s) * bump(s);
  p.headY += k * 0.5 * Math.sin(TAU * s) * bump(s);
}
