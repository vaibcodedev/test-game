/**
 * Задача 139, босс кольца: звонарь утопленников (восток, слот r59s, ур. 59, группа 3–4; карточка — docs/systems/bosses.md, раздел 3.3 п. 12 и
 * «Раскладка референсов»). Образ — по референсу tools/out/refs/bosses-139/15.jpg (призрак-звонарь: скелет в рваных лохмотьях с капюшоном,
 * вокруг головы зубчатый нимб-колокольня на перекладине, колокола на цепях, длинный посох с огромным колоколом-билом, цепи на груди) —
 * только для сравнения: чужой арт в игру и в git не идёт.
 *
 * Метод — как у военачальника и вампира: общий движок tools/gen/mobs/lib.ts, тело в 2× (160×160) и сведение в кадр 64×80 (1×), луч на пиксель,
 * 5 тонов на материал, выборочный контур 1 px, контровой свет по краю. Призрак парит: подола нет — рваные лоскуты по кругу, ног нет.
 * Колокола на цепях — главный акцент (маятники, раскачка от ударов); светятся (ночью не гаснут): глаза, язычки колоколов, огоньки-болотники.
 * Слои 2D поверх тела: звуковая волна (кольцо по земле, рябь), вода «Прилива» под телом, болотные огоньки.
 *
 * Эффекты мира (строка 0 — под юнитами, 1 — над): конус «Волны» с отталкиванием, метка «Объятия трясины» с корнями, вода «Прилива»,
 * кочка (безопасное место).
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/plg_drowned_bellringer.ts [--quick] →
 *   tools/out/bosses139/bel-sheet.png, bel-glow.png, bel-fx-*.png, bel-pilot.png, r59s-e-compare.png («наш | референс»);
 *   --quick — только compare (покой).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  PC, PX, R, Scene, VIEWS, add, clamp, cross, crop, depthOf, easeIn, easeInOut, easeOut, fill, frameEdgeCuts, frameHoles, fromView,
  groundBg, hash01, hex, ik, lerp, linear, loadPC, mat, mix, mul, nightRect, norm, perp, renderScene, rot, scaleBox, scaleNN,
  scr, sealPinholes, shadowBlob, snapPx, stackRows, stampRows, sub, text, thicken, toView, TAU,
  type Cam, type Mat, type StampPx, type RGBA, type Ramp, type Row, type V3, type View,
} from "../mobs/lib";
import { OUT, selout, outlineStats } from "../mobs/rig";
import { bellSprite } from "./bel_sprites";

export const ID = "plg_drowned_bellringer";
export const FRAME = 64;
export const FRAME_H = 80;
const FW = FRAME, FH = FRAME_H;
const N = FW;
const CAM: Cam = { N: FW, CX: 32, GY: 76.4 };
const RS = 2;
const CAMR: Cam = { N: 160, CX: 80, GY: 152.8 };
const RX0 = 16;
const K = 1.1;
const PXM = PX / K;
const snapM = (view: View, w: V3): V3 => mul(snapPx(view, mul(w, K)), 1 / K);
const pxM = (view: View, dx: number, dy: number): V3 => fromView(view, [dx / K, 0, -dy * PXM]);

// ---------------- палитра ----------------
/** Лохмотья: сине-серые, мокрые; холодный верхний тон. */
const ROBE = R("#0b0705", "#1c120b", "#33231a", "#4f3a2a", "#8f7e6c");
/** Кость: череп и рёбра, желтоватая. */
const BONE = R("#1a1812", "#46402f", "#7e765c", "#b9b090", "#e8e0c4");
/** Колокола: старая бронза. */
const BRASS = R("#0a0605", "#26180e", "#4c3420", "#7e5c36", "#c8a86c");
/** Зелень-патина на колоколах. */
const VERD = R("#0a1612", "#16322a", "#2a5c4a", "#3f7f68", "#7cc0a4");
/** Цепи: тёмное железо. */
const IRON = R("#08090b", "#1a1d22", "#343a43", "#59616d", "#a9b4c2");
/** Холодное свечение призрака. */
const GLOWC = R("#06243a", "#0f5f86", "#28a8d6", "#7adcf0", "#e4fbff");
/** Вода. */
const WATER = R("#0a2428", "#14424c", "#25707a", "#52a6ae", "#b8e6e6");
const DEAD = R("#101214", "#222628", "#383e40", "#505858", "#6a7272");
const VOID = hex("#05080a");
const FIRE = GLOWC;
const SAND = WATER;

const M = {
  robe: mat("лохмотья", ROBE, { base: 1.7, gain: 2.3 }),
  bone: mat("кость", BONE, { base: 1.9, gain: 2.2 }),
  brass: mat("бронза", BRASS, { base: 1.6, gain: 2.2, hi: 4 }),
  hood: mat("капюшон", R("#0a0606", "#1c1210", "#2e2018", "#443228", "#6a5444"), { base: 0.9, gain: 1.3 }),
  verd: mat("патина", VERD, { base: 1.9, gain: 2.2 }),
  iron: mat("железо", IRON, { base: 1.9, gain: 2.3, hi: 4 }),
  dark: mat("тьма", ROBE, { base: 0.6, gain: 1.0 }),
  glow: mat("свет", GLOWC, { base: 2.8, gain: 1.0, glow: true, crisp: true }),
};
const WCACHE = new Map<string, Mat>();
function wm(m: Mat, w: number): Mat {
  const s = Math.round(clamp(w, 0, 1) * 3);
  if (!s) return m;
  const key = `${m.name}:${s}`;
  let q = WCACHE.get(key);
  if (!q) {
    q = { ...m, ramp: m.ramp.map((c, i) => mix(c, DEAD[Math.min(i, 4)], (s / 3) * 0.45)), glow: m.glow && s < 2 };
    WCACHE.set(key, q);
  }
  return q;
}
const isEmisCol = (() => {
  const s = new Set<string>();
  for (const c of GLOWC) s.add(c.slice(0, 3).join(","));
  return (q: RGBA) => s.has(q.slice(0, 3).join(","));
})();

// ---------------- поза ----------------
interface Pose {
  root: V3; bob: number; chest: number; headZ: number;
  pitch: number; yaw: number; roll: number; hp: number; hy: number; hr: number;
  /** кулаки: [правый — хват билы, если held; левый — свободная кисть]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** била: [пятка, направление пятка → колокол]; held — в руке */
  staff: [V3, V3]; held: number;
  armLift: [number, number];
  /** лохмотья: волна, амплитуда, раскачка рукавов (px), хвост */
  wave: number; waveAmp: number; sway: number; tail: number;
  /** колокола на цепях: углы маятников [л. дальний, л. ближний, пр. ближний, пр. дальний], свечение глаз, звон 0..1 (язычки вспыхивают) */
  swing: [number, number, number, number]; glow: number; toll: number;
  /** колокольня падает (гибель) 0..1; увядание; вода под телом 0..1 (waterPh — фаза ряби); пальцы раскрыты */
  fall: number; wither: number; water: number; waterPh: number; spread: number;
  ring: number; ringAt?: V3; flash: number; flashAt?: V3;
  t: number; seed: number;
}

const HIP0 = 21;
const NECK: V3 = [0, 0.4, 41.4];
const ARM: [number, number] = [10.0, 10.2];
/** Била: от пятки до основания колокола; хват правой руки — SG от пятки. */
const STAFF_L = 17;
const SG = 2;
const FLOAT = 4;

const dirN = (d: V3): V3 => norm(d);
const stf = (grip: V3, dir: V3): [V3, V3] => { const d = dirN(dir); return [sub(grip, mul(d, SG)), d]; };
const STAFF_FRONT = stf([16, 3.5, 32], [0.12, 0.06, -1]);
const STAFF_SIDE = stf([11, 8, 32], [0, 0.3, -1]);
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: FLOAT, chest: 0, headZ: 0, pitch: 0.05, yaw: 0, roll: 0, hp: 0.12, hy: 0, hr: 0,
  hand: [[0, 0, 0], [-14, 12, 31]], pole: [[1, -0.4, -0.3], [-1, -0.2, -0.5]],
  staff: STAFF_FRONT, held: 1, armLift: [0, 0],
  wave: 0, waveAmp: 0, sway: 0, tail: 0,
  swing: [0, 0, 0, 0], glow: 1, toll: 0,
  fall: 0, wither: 0, water: 0, waterPh: 0, spread: 0.85,
  ring: 0, flash: 0, t: 0, seed: 1,
};
const REST_SIDE: Pose = { ...REST_FRONT, staff: STAFF_SIDE, hand: [[0, 0, 0], [-6, 15, 31]], pole: [[1, -0.3, -0.7], [-1, 0.2, -0.7]] };
const restOf = (view: View): Pose => (view === "side" ? REST_SIDE : REST_FRONT);
const bodyShift = (view: View, p: Pose): V3 => snapM(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.fall * FLOAT]);

// ---------------- штампы ----------------
type Keys = Record<string, RGBA>;
const up2 = (px: StampPx[]): StampPx[] => px.flatMap(([x, y, c]) => [[x * 2, y * 2, c], [x * 2 + 1, y * 2, c], [x * 2, y * 2 + 1, c], [x * 2 + 1, y * 2 + 1, c]] as StampPx[]);
/** Зубы в раскрытом рту. */
const ST_TEETH: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: up2(stampRows(["tmtmtmt", ".t.t.t."], -3, 0)),
  side: up2(stampRows(["t", "m"], 0, 0)),
};
/** Глаза: две холодные точки в глубине капюшона. */
const ST_EYES: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: up2(stampRows(["3....3"], -3, -1)),
  side: up2(stampRows(["3"], 0, -1)),
};
function stampKeys(glow: number): Keys {
  const g = clamp(glow, 0, 1.6);
  const lv = (k: number) => {
    const v = k - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.25 ? 1 : 0);
    return v < 0 ? VOID : GLOWC[clamp(v, 0, 4)];
  };
  return { m: ROBE[0], t: BONE[4], k: ROBE[1], d: BONE[1], s: BONE[3], "1": lv(1), "2": lv(2), "3": lv(3) };
}
const GLOW_KEYS = ["3"];

interface Extra {
  rings: { c: V3; r: number; k: number }[];
  water: { c: V3; k: number; ph: number } | null;
  flash: { at: V3; k: number } | null;
  motes: V3[];
  glints: V3[];
  /** колокола-штампы 2D: ушко в точке at, d — ось (вниз к губе), kind: 0 малый, 1 средний, 2 кистень */
  bells: { at: V3; d: V3; kind: 0 | 1 | 2 }[];
}

// ---------------- сцена ----------------
/** Звонарь в координатах модели. */
function build(p0: Pose, view: View): { S: Scene; X: Extra } {
  const S = new Scene();
  const X: Extra = { rings: [], water: null, flash: null, motes: [], glints: [], bells: [] };
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.2, hy: p0.hy - 0.1 } : p0;
  const W = p.wither;
  const shift = bodyShift(view, p);
  const pel: V3 = add([0, 0, HIP0], shift);
  const up = p.chest * PXM, hz = p.headZ * PXM;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  const T = (v: V3, lift = v[2] >= 26): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PR = (v: V3): V3 => rot(v, p.pitch * 0.25, p.yaw * 0.35, p.roll * 0.5);
  const PV = (v: V3): V3 => add(pel, PR(sub(v, [0, 0, HIP0])));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0, yaw = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, yaw, roll)), f(rot([0, 1, 0], pitch, yaw, roll)), f(rot([0, 0, 1], pitch, yaw, roll)),
  ];
  const keys = stampKeys(p.glow);
  const sw = p.sway * PXM;
  const E3: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const vx = fromView(view, [1, 0, 0]), vy = fromView(view, [0, 1, 0]), vz = fromView(view, [0, 0, 1]);
  const tex = (f: (c: { l: V3; edge: boolean }) => unknown) => f as never;

  // ---------- цепь: тонкая жила и звенья вразнобой ----------
  const chain = (g: number, a: V3, b: V3, links: number, w = 0.7) => {
    S.cone(g, wm(M.iron, W), a, 0.28, b, 0.28, { part: S.newPart(), tone: -0.2 });
    for (let i = 0; i <= links; i++) {
      const c = add(a, mul(sub(b, a), i / links));
      S.ell(g, wm(M.iron, W), c, i % 2 ? [w, 0.32, w * 1.1] : [0.32, w, w * 1.1], E3, { part: S.newPart(), tone: 0.1 + 0.3 * (i % 2) });
    }
  };
  /** Колокол: короной к a, осью вдоль d; патина пятнами, светящийся язычок. */
  const bell = (_g: number, a: V3, d: V3, _len: number, rl: number, _toll: number, waist = false) => {
    X.bells.push({ at: a, d, kind: waist ? 2 : rl > 2.3 ? 1 : 0 });
  };

  // ---------- терновый нимб за головой, на нём маленькие колокола на коротких цепях ----------
  {
    const g = S.group(0.9);
    const by = view === "side" ? 0.85 : 0;
    const rotB = (v: V3): V3 => [v[0] * Math.cos(by) - v[1] * Math.sin(by), v[0] * Math.sin(by) + v[1] * Math.cos(by), v[2]];
    const fl = p.fall;
    const BO = add([shift[0] * 0.8, shift[1] * 0.8, shift[2] * 0.85 - fl * 31], [0, 0, 0]);
    const B = (v: V3): V3 => add(BO, rotB([v[0] * (1 + fl * 0.25), v[1], v[2]]));
    const YB = -5.5;
    const hc: V3 = [0, YB - 0.5, 45];
    const RR = 8.2;
    const nR = 20;
    for (let i = 0; i < nR; i++) {
      const a0 = (i / nR) * TAU, a1 = ((i + 1.05) / nR) * TAU;
      S.cone(g, wm(M.brass, W), B([hc[0] + Math.cos(a0) * RR, hc[1], hc[2] + Math.sin(a0) * RR]), 0.7, B([hc[0] + Math.cos(a1) * RR, hc[1], hc[2] + Math.sin(a1) * RR]), 0.7, { part: S.newPart(), tone: i % 2 ? -0.1 : 0.2 });
    }
    // шипы терна: длинные кверху, короткие по бокам
    for (let i = 0; i < 9; i++) {
      const a = (-0.12 + (i / 8) * 1.24) * Math.PI;
      const dx = Math.cos(a), dz = Math.sin(a), L = 4.2 + (i % 2) * 2.6 + 1.6 * Math.max(0, dz);
      S.cone(g, wm(M.brass, W), B([hc[0] + dx * (RR - 0.3), hc[1], hc[2] + dz * (RR - 0.3)]), 1.0, B([hc[0] + dx * (RR + L), hc[1], hc[2] + dz * (RR + L)]), 0.1, { part: S.newPart(), tone: 0.35 });
    }
    // маленькие колокола: [угол на нимбе °, цепь, длина, губа, индекс маятника]
    const bells: [number, number, number, number, number][] = [[200, 3.6, 4.2, 2.0, 0], [340, 3.6, 4.2, 2.0, 3], [158, 3.0, 3.6, 1.7, 1]];
    for (const [ang, cl, bl, rl, si] of bells) {
      const a = B([hc[0] + Math.cos(ang * Math.PI / 180) * RR, hc[1] + 0.3, hc[2] + Math.sin(ang * Math.PI / 180) * RR]);
      const th = p.swing[si];
      const d = norm(add(mul(vx, Math.sin(th)), mul(vz, -Math.cos(th))));
      const topb = add(a, mul(d, cl));
      chain(g, a, topb, 2, 0.6);
      bell(g, topb, d, bl, rl, p.toll);
    }
  }

  // ---------- рваный плащ-накидка: лохмотья сзади и по кругу ----------
  {
    const g = S.group(1.3);
    const cx = pel[0] + sw * 0.3, cy = pel[1];
    const folds = tex((c) => (c.edge ? 0 : Math.sin(c.l[0] * 2.1 + 0.6) > 0.78 ? -0.9 : 0.1));
    // цельная юбка-конус от талии вниз, уже к земле — призрак, ног нет
    S.cone(g, wm(M.robe, W), PV([0, 0, 15]), 3.6, PV([0, 0.2, 21]), 3.2, { tex: folds, big: true, tone: 0 });
    S.cone(g, wm(M.robe, W), PV([0, 0.2, 20]), 5.8, T([0, 0.5, 33]), 3.2, { tex: folds, big: true, tone: 0.05 });
    // рваные лоскуты по кругу — подол
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.3;
      const rr = 1.8 + (i % 3) * 2.1;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.8;
      const lift = Math.round(p.waveAmp * (0.5 + 0.5 * Math.sin(TAU * (p.wave + i * 0.17)))) * PXM;
      const len = 9 + ((i * 5) % 7) * 2.8 - lift;
      const tw = Math.sin(TAU * (p.wave + i * 0.11)) * 0.8 * p.waveAmp + sw * 0.4 * Math.cos(a);
      S.cone(g, wm(M.robe, W), [x, y, 20 + shift[2] * 0.2 - (i % 2) * 3], 1.9 - (i % 3) * 0.3, [x * 2.6 + tw, y * 1.6, Math.max(0.8, shift[2] + 12 - len)], 0.1, { part: S.newPart(), tone: i % 2 ? -0.25 : 0.15 });
    }
    // шлейф сзади: три длинных рваных ленты
    for (let i = 0; i < 6; i++) {
      const x = cx + (i - 2.5) * 2.4 + sw * 0.5;
      const wob = Math.sin(TAU * (p.wave + i * 0.3)) * (0.6 + p.tail * 0.6);
      S.cone(g, wm(M.robe, W), [x, cy - 5.5, 22], 1.9, [x * 1.25 + wob * 1.4, cy - 11 - p.tail * 0.6 - (i % 3) * 2, Math.max(1.5, shift[2] + 2.8 - 5 * (i % 2) - p.tail * 0.8)], 0.1, { part: S.newPart(), tone: i % 2 ? -0.2 : 0.2 });
    }
  }
  // ---------- торс: грудь в раскрытом балахоне — рёбра, цепи наискось ----------
  {
    const g = S.group(1.6);
    S.ell(g, wm(M.robe, W), T([0, 0.4, 33.6]), [4.2, 3.4, 3.0], axes(TV), { big: true, tone: 0.15 });
    S.ell(g, wm(M.dark, W), T([0, 5.1, 31.4]), [4.6, 1.2, 7.0], axes(TV), { part: S.newPart(), tone: -0.3 });
    const ribs = tex((c) => (c.edge ? 0.3 : ((c.l[2] * 0.85) % 1 + 1) % 1 < 0.36 ? -1.3 : 0.2));
    S.ell(g, wm(M.bone, W), T([0, 5.5, 31.6]), [3.7, 1.3, 6.2], axes(TV), { part: S.newPart(), tone: 0, tex: ribs });
    S.cone(g, wm(M.bone, W), T([0, 5.9, 36.4]), 0.8, T([0, 5.9, 25.6]), 0.8, { part: S.newPart(), tone: 0.1 });
    S.ell(g, wm(M.glow, 0), T([0, 4.6, 29.5]), [1.7, 0.8, 2.6], axes(TV), { part: S.newPart() });
    // цепи перекрёстом по груди
    for (const s of [1, -1]) chain(g, T([s * 5.6, 4.4, 36.4]), T([-s * 4.4, 5.2, 25.6]), 7, 0.8);
    // фонарь-колокольчик на поясе
    S.ell(g, wm(M.brass, W), T([-3.4, 5.4, 25]), [1.4, 1.2, 1.7], axes(TV), { part: S.newPart(), tone: 0.1 });
    S.ell(g, wm(M.glow, 0), T([-3.4, 5.6, 24]), [0.6, 0.6, 0.7], axes(TV), { part: S.newPart() });
  }

  // ---------- кистень: длинная цепь из руки, на ней огромный шипастый колокол ----------
  const held = p.held >= 0.5;
  const ad = norm(p.staff[1]);
  const butt: V3 = add(p.staff[0], held ? shift : [0, 0, 0]);
  const top = add(butt, mul(ad, STAFF_L));
  const grip0 = add(butt, mul(ad, SG));
  {
    const g = S.group(0.8);
    chain(g, grip0, top, 8, 0.95);
    bell(g, add(top, mul(ad, 0.6)), ad, 13.0, 4.9, p.toll, true);
    // шипы по плечу и губе колокола
    const e1 = norm(perp(ad, [0, 0, 1])), e2 = norm(cross(ad, e1));
    for (const [u, rf, ln] of [[0.5, 0.55, 3.4], [0.98, 1.15, 4.8]] as [number, number, number][]) {
      const nS = u < 0.6 ? 5 : 7;
      for (let i = 0; i < nS; i++) {
        const a = (i / nS) * TAU + u * 3;
        const o = add(mul(e1, Math.cos(a)), mul(e2, Math.sin(a)));
        const c0 = add(add(top, mul(ad, 0.6 + 13.0 * u)), mul(o, 4.9 * rf));
        S.cone(g, wm(M.brass, W), c0, 0.95, add(add(c0, mul(o, ln)), mul(ad, 0.4)), 0.1, { part: S.newPart(), tone: 0.45 });
      }
    }
    X.glints.push(add(top, mul(ad, 8)));
    X.flash = p.flash > 0.02 ? { at: p.flashAt ?? add(top, mul(ad, 13.0)), k: p.flash } : null;
  }

  // ---------- руки: рукава-лохмотья, костяные кисти ----------
  {
    const g = S.group(1.0);
    const limb = (gg: number, sh: V3, el: V3, fist: V3) => {
      S.cone(gg, wm(M.robe, W), sh, 1.7, el, 1.3, { tone: 0.05, big: true });
      S.cone(gg, wm(M.robe, W), el, 1.3, fist, 1.8, { tone: -0.05, big: true });
      // рваная кромка рукава
      const f = norm(sub(fist, el));
      for (let q = 0; q < 3; q++) {
        const o = add(add(fist, mul(f, -1.4)), [(q - 1) * 1.7, 0.4, 0]);
        S.cone(gg, wm(M.robe, W), o, 1.3, add(o, [(q - 1) * 0.5 + sw * 0.2, 0.3, -4.4 - (q % 2) * 2.2 - p.tail * 0.4]), 0.1, { part: S.newPart(), tone: q % 2 ? -0.2 : 0.2 });
      }
    };
    const lift = pxM(view, 0, -p.armLift[0]);
    const sh = add(T([5.0, 0.2, 35.4]), lift);
    const fist: V3 = held ? grip0 : add(add(p.hand[0], shift), lift);
    const el = ik(sh, fist, ARM[0], ARM[1], p.pole[0]);
    limb(g, sh, el, fist);
    const fd = norm(sub(fist, el));
    const e0 = perp(fd, [0, 0, 1]);
    S.ell(g, wm(M.bone, W), add(fist, mul(fd, 0.6)), [1.5, 1.5, 1.9], [e0, cross(fd, e0), fd], { part: S.newPart(), tone: 0.2 });
    for (let i = -1; i <= 1; i++) S.cone(g, wm(M.bone, W), add(add(fist, mul(fd, 0.6)), mul(e0, i * 0.9)), 0.45, add(add(fist, mul(fd, 2.6)), mul(e0, i * 0.8)), 0.4, { part: S.newPart(), tone: 0.1 });
    // левая: открытая ладонь, длинные пальцы
    const g2 = S.group(1.0);
    const lift2 = pxM(view, 0, -p.armLift[1]);
    const sh2 = add(T([-5.0, 0.2, 35.4]), lift2);
    const fist2 = add(add(p.hand[1], shift), lift2);
    const el2 = ik(sh2, fist2, ARM[0], ARM[1], p.pole[1]);
    limb(g2, sh2, el2, fist2);
    {
      const th = p.swing[1] * 1.3, d = norm(add(mul(vx, Math.sin(th)), mul(vz, -Math.cos(th))));
      const a = add(fist2, [0, 1, -1.5]), t2 = add(a, mul(d, 7));
      chain(g2, a, t2, 5);
      bell(g2, t2, d, 5, 2.6, p.toll);
    }
    const fd2 = norm(sub(fist2, el2));
    const e1 = perp(fd2, [0, 0, 1]);
    S.ell(g2, wm(M.bone, W), add(fist2, mul(fd2, 0.8)), [1.5, 1.2, 2.0], [e1, cross(fd2, e1), fd2], { part: S.newPart(), tone: 0.25 });
    const spd = 0.45 + 0.4 * clamp(p.spread, 0, 1);
    for (let i = -1; i <= 2; i++) {
      const dir = norm(add(add(mul(fd2, 0.8), mul(e1, (i - 0.5) * spd)), [0, 0.2, -0.3]));
      const m = add(fist2, mul(dir, 4.4));
      S.cone(g2, wm(M.bone, W), add(fist2, mul(dir, 1.2)), 0.5, m, 0.45, { part: S.newPart(), tone: 0.25 });
      S.cone(g2, wm(M.bone, W), m, 0.45, add(add(m, mul(dir, 3.6)), [0, 0.5, -1.8]), 0.1, { part: S.newPart(), tone: 0.5 });
    }
  }

  // ---------- голова: череп в капюшоне, холодные глаза, раскрытый рот ----------
  {
    const g = S.group(1.2);
    const HC = 44.0;
    S.cone(g, wm(M.dark, W), T([0, 1.0, 36.4], true), 2.0, H([0, 1.4, 41.0]), 2.0, { part: S.newPart(), tone: -0.3 });
    // череп
    S.ell(g, wm(M.bone, W), H([0, 3.4, HC - 0.2]), [4.9, 4.4, 5.6], axes(HV), { big: true, tone: 0.2 });
    for (const s of [1, -1]) S.ell(g, wm(M.dark, W), H([s * 2.1, 6.9, HC + 0.7]), [1.7, 1.0, 2.0], axes(HV), { part: S.newPart(), tone: -0.6 });
    S.ell(g, wm(M.dark, W), H([0, 7.6, HC - 1.6]), [0.7, 0.7, 1.1], axes(HV), { part: S.newPart(), tone: -0.6 });
    S.ell(g, wm(M.bone, W), H([0, 3.4, HC - 6.8]), [2.6, 2.2, 1.5], axes(HV, 0, 0.5), { part: S.newPart(), tone: 0.05 });
    S.ell(g, wm(M.dark, W), H([0, 6.0, HC - 4.0]), [2.7, 1.3, 2.7], axes(HV), { part: S.newPart(), tone: -0.6 });
    // капюшон: свод, боковые полы и длинный хвост-конус сзади
    S.ell(g, wm(M.robe, W), H([0, -4.6, HC + 3.6]), [4.2, 2.6, 2.8], axes(HV), { part: S.newPart(), tone: 0.0, big: true });
    for (const s of [1, -1]) S.ell(g, wm(M.robe, W), H([s * 5.6, -1.4, HC - 1.4]), [0.9, 2.6, 4.4], axes(HV, s * 0.15), { part: S.newPart(), tone: -0.1 });
    S.ell(g, wm(M.robe, W), H([0, -5.6, HC - 0.4]), [3.6, 1.8, 5.2], axes(HV), { part: S.newPart(), tone: -0.2 });
    S.cone(g, wm(M.robe, W), H([0, -3.6, HC + 5]), 3.0, H([0, -10.5 - p.tail * 0.5, HC + 5.8 - p.tail * 0.7]), 0.1, { part: S.newPart(), tone: 0.2 });
    S.stamps.push({ at: H([0, 6.8, HC + 0.6]), n: HV([0, 1, 0]), px: ST_EYES, colors: keys, glow: GLOW_KEYS, halo: GLOWC[2], depthTol: 2.6, minFacing: 0.2 });
    S.stamps.push({ at: H([0, 7.2, HC - 3.4]), n: HV([0, 1, 0.1]), px: ST_TEETH, colors: keys, depthTol: 2.6, minFacing: 0.1 });
  }

  // ---------- частицы и эффекты ----------
  if (p.ring > 0.02) X.rings.push({ c: p.ringAt ?? [pel[0], pel[1], 0], r: 3 + 24 * p.ring, k: 1 - p.ring });
  if (p.water > 0.02) X.water = { c: [pel[0], pel[1], 0], k: p.water, ph: p.waterPh };
  for (let i = 0; i < 4; i++) {
    const a = TAU * (p.t + i / 4), rr = 11 + 3 * Math.sin(a * 2 + i);
    X.motes.push([pel[0] + Math.cos(a) * rr, pel[1] + Math.sin(a) * rr * 0.6, 12 + shift[2] + 10 * (0.5 + 0.5 * Math.sin(a * 1.5 + i * 2))]);
  }
  scaleScene(S, K * RS);
  const sk = (v: V3) => mul(v, K);
  X.rings.forEach((r) => { r.c = sk(r.c); r.r *= K; });
  if (X.water) X.water.c = sk(X.water.c);
  if (X.flash) X.flash.at = sk(X.flash.at);
  X.motes = X.motes.map(sk);
  X.glints = X.glints.map(sk);
  X.bells = X.bells.map((b) => ({ ...b, at: sk(b.at) }));
  return { S, X };
}
function scaleScene(S: Scene, s: number) {
  for (const q of S.prims) {
    q.a = mul(q.a, s); q.b = mul(q.b, s); q.anc = mul(q.anc, s);
    q.ra *= s; q.rb *= s; q.r = mul(q.r, s); q.rr *= s;
    if (q.cut) q.cut = { n: q.cut.n, d: q.cut.d * s };
  }
  S.gk = S.gk.map((k) => k * s);
  for (const st of S.stamps) st.at = mul(st.at, s);
}

// ---------------- 2D-слои поверх тела ----------------
type Ctx = { img: PC; emis: PC; t: Float32Array; prim: Int32Array; view: View };
const put = (c: Ctx, x: number, y: number, col: RGBA, dz: number, glow = false) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 1 || y < 1 || x >= FW - 1 || y >= FH - 1) return;
  const i = y * FW + x;
  if (c.prim[i] >= 0 && c.t[i] < dz - 1) return;
  c.img.set(x, y, col);
  if (glow) c.emis.set(x, y, col);
};

/** Звуковая волна от колокола: кольцо-рябь по земле (штрихи, светлее у переднего края); задняя половина — под телом. */
function drawRing(c: Ctx, r: { c: V3; r: number; k: number }, back: boolean) {
  const steps = Math.ceil(r.r * 10);
  const cv = toView(c.view, r.c);
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * TAU;
    if (Math.sin(a * 6 + r.r * 0.5) < -1.1 + 1.2 * (1 - r.k)) continue;
    const pv = toView(c.view, [r.c[0] + Math.cos(a) * r.r, r.c[1] + Math.sin(a) * r.r, 0]);
    if (pv[1] < cv[1] !== back) continue;
    const [sx, sy] = scr(CAM, pv);
    const x = Math.floor(sx), y = Math.floor(Math.min(sy, CAM.GY + 2));
    if (x < 1 || y < 2 || x >= FW - 1 || y >= FH - 1) continue;
    const i = y * FW + x;
    if (!back && c.prim[i] >= 0 && c.t[i] < depthOf(pv) - 0.5) continue;
    if (back && c.img.alpha(x, y)) continue;
    const hi = r.k > 0.5;
    c.img.set(x, y - 1, GLOWC[hi ? 4 : 3]); c.emis.set(x, y - 1, GLOWC[hi ? 4 : 3]);
    c.img.set(x, y, WATER[r.k > 0.3 ? 3 : 2]);
    if (r.k > 0.6 && (s & 3) === 0 && y + 1 < FH - 1) { c.img.set(x, y + 1, WATER[1]); }
  }
}
/** Вода «Прилива» под телом: эллипс с рябью, расходится и поднимается; рисуется только на пустом месте. */
function drawWater(c: Ctx, w: { c: V3; k: number; ph: number }) {
  const [cx, cy0] = scr(CAM, toView(c.view, w.c));
  const cy = Math.min(cy0, CAM.GY + 1) - 1;
  const rx = 8 + 22 * w.k, ry = Math.max(2, rx * 0.34);
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.hypot(dx, dy);
    if (d > 1 || x < 1 || y < 2 || x >= FW - 1 || y >= FH - 1 || c.img.alpha(x, y)) continue;
    const ripple = Math.sin(d * 11 - w.ph * TAU * 2) > 0.78;
    const edge = d > 0.88;
    c.img.set(x, y, WATER[edge ? 3 : ripple ? 3 : d < 0.45 ? 1 : 2]);
  }
}
/** Холодная вспышка на губе колокола: крест лучей. */
function drawFlash(c: Ctx, f: { at: V3; k: number }) {
  const v = toView(c.view, f.at);
  const [sx, sy] = scr(CAM, v);
  const L = Math.round(2 + 3 * f.k);
  const x = clamp(Math.floor(sx), L + 2, FW - 3 - L), y = clamp(Math.floor(sy), L + 2, FH - 4);
  const dz = depthOf(v);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 4 : r <= L - 1 ? 3 : 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) put(c, x + dx * r, y + dy * Math.min(r, 2), GLOWC[tone], dz, true);
  }
  if (f.k > 0.5) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(c, x + dx * 2, y + dy, GLOWC[3], dz, true);
  put(c, x, y, GLOWC[4], dz, true);
}
/** Болотные огоньки вокруг тела: 1 px холодные точки с хвостиком. */
function drawMotes(c: Ctx, pts: V3[]) {
  for (const q of pts) {
    const v = toView(c.view, q);
    const [x, y] = scr(CAM, v);
    const X0 = Math.floor(x), Y0 = Math.floor(y);
    if (X0 < 2 || Y0 < 2 || X0 >= FW - 2 || Y0 >= FH - 2 || c.img.alpha(X0, Y0)) continue;
    c.img.set(X0, Y0, GLOWC[3]); c.emis.set(X0, Y0, GLOWC[3]);
    if (!c.img.alpha(X0, Y0 + 1)) { c.img.set(X0, Y0 + 1, GLOWC[1]); c.emis.set(X0, Y0 + 1, GLOWC[1]); }
  }
}
function drawGlint(c: Ctx, at: V3) {
  const v = toView(c.view, at);
  const [x, y] = scr(CAM, v);
  put(c, x - 1, y - 2, GLOWC[4], depthOf(v) - 2, true);
}

/** Колокол-штамп: ушко в проекции точки подвеса; наклон — выбором штампа из 5 вариантов (shear). */
function drawBellStamp(c: Ctx, b: { at: V3; d: V3; kind: 0 | 1 | 2 }) {
  const v = toView(c.view, b.at);
  const [sx, sy] = scr(CAM, v);
  const dv = toView(c.view, b.d);
  const sh = Math.round(clamp(dv[0] / Math.max(0.5, -dv[2]), -0.25, 0.25) * 4) / 4;
  const spr = b.kind === 2 ? bellSprite(12, 17, true, sh) : b.kind === 1 ? bellSprite(6, 8, false, sh) : bellSprite(5, 7, false, sh);
  const ox = Math.round(sx) - spr.ax, oy = Math.round(sy) - spr.ay;
  const dz = depthOf(v) - (b.kind === 2 ? 100 : 0);
  for (let y = 0; y < spr.cv.h; y++) for (let x = 0; x < spr.cv.w; x++) {
    if (!spr.cv.has(x, y)) continue;
    const q = spr.cv.get(x, y);
    put(c, ox + x, oy + y, [q[0], q[1], q[2], 255], dz);
  }
}

/** Дымка у подола: редкие точки-дымок вразброс (шахматка), поднимается; только на пустом месте. */
function drawMist(c: Ctx, t: number, k: number) {
  for (let i = 0; i < 26; i++) {
    const a = hash01(i, 3, 11) * TAU, rr = 4 + hash01(i, 5, 12) * 11;
    const rise = (hash01(i, 7, 13) + t) % 1;
    const x = Math.round(32 + Math.cos(a) * rr * (1 + rise * 0.3)), y = Math.round(CAM.GY - 5 - rise * 12 + Math.sin(a) * rr * 0.25);
    if (x < 2 || y < 2 || x >= FW - 2 || y >= FH - 2 || c.img.alpha(x, y)) continue;
    const col = rise < 0.5 ? WATER[2] : WATER[1];
    c.img.set(x, y, col);
    if (hash01(i, 9, 14) > 0.6 && !c.img.alpha(x + 1, y)) c.img.set(x + 1, y, WATER[1]);
    if (rise < 0.3 && k > 0) { c.img.set(x, y, GLOWC[2]); c.emis.set(x, y, GLOWC[2]); }
  }
}
const colEq = (q: RGBA | null, o: RGBA) => !!q && q[3] > 120 && q[0] === o[0] && q[1] === o[1] && q[2] === o[2];

/**
 * Тело (160×160, двойное разрешение) → кадр 64×80: блок 2×2 даёт пиксель, если в нём ≥ 2 цветных (не контурных) точек; цвет — самый частый,
 * светящийся — вне конкуренции. Контур 1 px строится заново на кадре 1× (selout), глубина и призма — из первой точки блока.
 */
function downscale(R0: ReturnType<typeof renderScene>): { img: PC; emis: PC; t: Float32Array; prim: Int32Array } {
  const img = new PC(FW, FH), emis = new PC(FW, FH);
  const t = new Float32Array(FW * FH), prim = new Int32Array(FW * FH).fill(-1);
  const RN = CAMR.N;
  for (let Y = 0; Y < FH; Y++) for (let X = 0; X < FW; X++) {
    const votes = new Map<string, { n: number; c: RGBA; first: number }>();
    let opaque = 0, em: RGBA | null = null, first = -1;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const rx = RX0 + X * 2 + dx, ry = Y * 2 + dy;
      const q = R0.body.get(rx, ry);
      if (!q || q[3] < 128) continue;
      const e = R0.emis.get(rx, ry);
      if (e && e[3] > 0) { em = e; if (first < 0) first = ry * RN + rx; continue; }
      if (colEq(q, OUT)) continue;
      opaque++;
      if (first < 0) first = ry * RN + rx;
      const key = q.join(",");
      const v = votes.get(key);
      if (v) v.n++; else votes.set(key, { n: 1, c: q, first: opaque });
    }
    if (em) { img.set(X, Y, em); emis.set(X, Y, em); }
    else if (opaque >= 2) {
      let best: { n: number; c: RGBA; first: number } | null = null;
      for (const v of votes.values()) if (!best || v.n > best.n || (v.n === best.n && v.c[0] + v.c[1] + v.c[2] < best.c[0] + best.c[1] + best.c[2])) best = v;
      img.set(X, Y, best!.c);
    } else continue;
    prim[Y * FW + X] = R0.gb.prim[first];
    t[Y * FW + X] = R0.gb.t[first];
  }
  return { img, emis, t, prim };
}

/** Кадр чародея: { img, emis } 64×80. */
export function renderBel(view: View, pose: Pose): { img: PC; emis: PC } {
  const { S, X } = build(pose, view);
  const R0 = renderScene(CAMR, S, view, OUT);
  const D = downscale(R0);
  const img = D.img;
  const emis = D.emis;
  const c: Ctx = { img, emis, t: D.t, prim: D.prim, view };
  for (const r of X.rings) drawRing(c, r, true);
  thicken(img, OUT, 3, [...GLOWC, ...BRASS, ...WATER]);
  sealPinholes(img, OUT, true, 8);
  selout(img);
  const isOut = (q: RGBA | null) => colEq(q, OUT);
  const kill: [number, number][] = [];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (!isOut(img.get(x, y))) continue;
    let body = false;
    for (let dy = -1; dy <= 1 && !body; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = img.get(x + dx, y + dy);
      if (q && q[3] > 120 && !isOut(q)) { body = true; break; }
    }
    if (!body) kill.push([x, y]);
  }
  for (const [x, y] of kill) { img.clear(x, y); emis.clear(x, y); }
  for (let x = 0; x < FW; x++) {
    if (!img.alpha(x, FH - 1)) continue;
    const q = img.get(x, FH - 2)!;
    if (q[3] > 120 && !isOut(q)) img.set(x, FH - 1, OUT); else img.clear(x, FH - 1);
    emis.clear(x, FH - 1);
  }
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const q = img.get(x, y)!;
    if (q[3] && isEmisCol(q) && !emis.alpha(x, y)) emis.set(x, y, q);
    if (!q[3] || !isEmisCol(q)) emis.clear(x, y);
  }
  // контровой свет: тёплая светлая кромка 1 px по внешнему силуэту — сильнее сверху и слева; фигура читается и на светлом песке, и на тёмной земле
  {
    const RIM: RGBA = [170, 205, 245, 255];
    const snap = img.clone();
    const gone = (x: number, y: number) => { const q = snap.get(x, y); return !q || q[3] < 120 || isOut(q); };
    for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) {
      const q = snap.get(x, y)!;
      if (q[3] < 200 || isOut(q) || isEmisCol(q)) continue;
      const tl = gone(x, y - 1) || gone(x - 1, y), other = gone(x + 1, y) || gone(x, y + 1);
      if (!tl && !other) continue;
      const m = mix(q, RIM, tl ? 0.6 : 0.28);
      img.set(x, y, [m[0], m[1], m[2], 255]);
    }
  }
  // тело не касается края кадра: крайний ряд, кроме контура, срезается
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (x !== 0 && y !== 0 && x !== FW - 1 && y !== FH - 1) continue;
    const q = img.get(x, y)!;
    if (q[3] && !isOut(q)) { img.clear(x, y); emis.clear(x, y); }
  }
  // колокола — 2D-штампы из эскиза (bel_sprites.ts), выбор штампа по наклону оси; глубина — по точке подвеса
  for (const b of X.bells) drawBellStamp(c, b);
  // слои без контура — поверх готового тела
  if (X.water) drawWater(c, X.water);
  for (const r of X.rings) drawRing(c, r, false);
  for (const g of X.glints) drawGlint(c, g);
  drawMotes(c, X.motes);
  drawMist(c, pose.t, 1);
  if (X.flash) drawFlash(c, X.flash);
  return { img, emis };
}
// ---------------- анимации ----------------
type Num = number | V3 | [V3, V3] | [number, number] | V3[] | undefined;
function lerpAny(a: Num, b: Num, t: number): Num {
  if (typeof a === "number" && typeof b === "number") return lerp(a, b, t);
  if (Array.isArray(a) && Array.isArray(b)) return (a as unknown[]).map((v, k) => lerpAny(v as Num, (b as unknown[])[k] as Num, t)) as Num;
  return t < 0.5 ? a : b;
}
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    if (k === "flashAt" || k === "ringAt") continue;
    o[k] = lerpAny(a[k] as Num, b[k] as Num, t);
  }
  return o as unknown as Pose;
}
interface Key { f: number; p: Partial<Pose>; ease?: (t: number) => number }
function poseAt(base: Pose, keys: Key[], f: number): Pose {
  const full = keys.map((k) => ({ ...base, ...k.p }) as Pose);
  let j = 0;
  while (j < keys.length - 2 && f >= keys[j + 1].f) j++;
  const a = keys[j], b = keys[j + 1];
  const u = clamp((f - a.f) / (b.f - a.f), 0, 1);
  return lerpPose(full[j], full[j + 1], (b.ease ?? easeInOut)(u));
}
const keyed = (base: Pose, keys: Key[], n: number, seed: number): Pose[] =>
  Array.from({ length: n }, (_, i) => ({ ...poseAt(base, keys, i), t: i / n, seed: seed + i }));
/** Завиток посоха в мире (модель): для следа и вспышки. */
function tipW(p: Pose, view: View): V3 {
  const ad = norm(p.staff[1]);
  const sh = p.held >= 0.5 ? bodyShift(view, p) : [0, 0, 0] as V3;
  return add(add(p.staff[0], sh), mul(ad, STAFF_L + 3));
}
const trailOf = (base: Pose, keys: Key[], view: View, f0: number, f1: number, n = 7): V3[] =>
  Array.from({ length: n }, (_, k) => tipW(poseAt(base, keys, lerp(f0, f1, k / (n - 1))), view));
const TREMBLE = [0, 1, 0, -1];
const windPoses = (R0: Pose, wind: Partial<Pose>, seed: number, n = 4) => keyed(R0, [{ f: 0, p: {} }, { f: n - 1, p: wind, ease: easeInOut }], n, seed);
function holdPoses(R0: Pose, wind: Partial<Pose>, seed: number, n: number, mod: (i: number) => Partial<Pose>) {
  const base = { ...R0, ...wind } as Pose;
  return Array.from({ length: n }, (_, i) => ({ ...base, t: i / n, seed: seed + i, ...mod(i) }));
}

const rv = (view: View) => view === "side";
const SW_PH = [0, 0.25, 0.55, 0.8];
/** Маятники колоколов: амплитуда amp, фаза t (0..1), число качаний cyc. */
const swings = (t: number, amp: number, cyc = 1, bias = 0): [number, number, number, number] =>
  SW_PH.map((ph, i) => bias + amp * (i === 1 || i === 2 ? 1.35 : 1) * Math.sin(TAU * (t * cyc + ph))) as [number, number, number, number];
/** Точка на земле под губой колокола-билы (для звукового кольца). */
function lipGround(p: Pose, view: View): V3 {
  const ad = norm(p.staff[1]);
  const sh = p.held >= 0.5 ? bodyShift(view, p) : ([0, 0, 0] as V3);
  const lip = add(add(p.staff[0], sh), mul(ad, STAFF_L + 11));
  return [lip[0], lip[1], 0];
}
/** Покой: парит (подъём на пиксель), колокола качаются, лохмотья и хвост колышутся, глаза дышат. */
function idlePoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const bob = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const sway = [0, 0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
  const tail = [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    return { ...R0, t, seed: 100 + i, bob: FLOAT + bob[i] * 0.77, headZ: 0, sway: sway[i], tail: tail[i], wave: t, waveAmp: 1, swing: swings(t, 0.13), glow: 1 + 0.25 * Math.sin(t * TAU), armLift: [0, bob[i] && i > 3 && i < 8 ? 1 : 0] as [number, number] };
  });
}
/** Скольжение: подаётся вперёд, плывёт без шагов, колокола раскачиваются сильнее, лоскуты тянутся назад. */
function walkPoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const bob = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0];
  const swayX = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0];
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    const grip: V3 = side ? [8, 8 + 1.6 * Math.sin(TAU * u), 27] : [13, 4 + 1.5 * Math.sin(TAU * u), 27];
    return {
      ...R0, t: u, seed: 150 + i, pitch: 0.14, hp: 0.06,
      root: [side ? 0 : swayX[i], 0, 0] as V3, bob: FLOAT + bob[i] * 0.77,
      sway: [0, 1, 1, 0, -1, -1][i % 6], tail: [1, 2, 2, 3, 2, 2][i % 6], wave: u * 2, waveAmp: 1.8,
      swing: swings(u, 0.26, 2, side ? 0.12 : 0), staff: stf(grip, side ? [0, 0.38, -1] : [0.28, 0.12, -1]),
      armLift: [0, i % 6 < 3 ? 1 : 0] as [number, number],
    };
  });
}
/** Лента мягких качаний после удара: затухающая амплитуда. */
const decaySwing = (i: number, i0: number, amp: number, cyc = 1.6): [number, number, number, number] => {
  const k = Math.max(0, i - i0);
  return swings(k / 8, amp * Math.exp(-k * 0.28), cyc);
};
/** Удар билой: поднимает за плечо (колокол над головой), обрушивает вперёд-вниз (кадр 5), волна звона по земле, вспышка на губе. */
function attackPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { pitch: -0.1, hp: -0.1, bob: FLOAT + 0.8, staff: side ? stf([8, -2, 30], [0, -0.55, 0.84]) : stf([11, -1, 30], [0.32, -0.35, 0.88]), glow: 1.3, armLift: [1, 1], hand: [[0, 0, 0], side ? [-6, 4, 38] : [-14, 3, 38]] as [V3, V3], swing: [-0.35, -0.4, -0.4, -0.35] };
  const hit: Partial<Pose> = { pitch: 0.22, hp: 0.1, bob: FLOAT - 1.2, staff: side ? stf([8, 8, 28], [0, 0.82, -0.55]) : stf([7, 9, 28], [-0.45, 0.6, -0.66]), glow: 1.5, toll: 1, flash: 1, hand: [[0, 0, 0], side ? [-6, 10, 26] : [-12, 8, 26]] as [V3, V3], swing: [0.5, 0.55, 0.55, 0.5] };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1.5, p: { bob: FLOAT + 0.8, staff: side ? stf([8, 4, 28], [0, 0, -1]) : stf([12, 2, 30], [0.12, -0.12, 1]) }, ease: easeInOut },
    { f: 3, p: wind, ease: easeInOut }, { f: 4, p: { ...wind, armLift: [1, 0] }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, toll: 0.4 }, ease: easeIn }, { f: 6, p: hit, ease: easeOut }, { f: 7, p: { ...hit, flash: 0, toll: 0.7, bob: FLOAT - 0.6 }, ease: easeOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 10, 400);
  poses.forEach((p, i) => { if (i >= 7) p.swing = decaySwing(i, 6, 0.5); });
  [6, 7, 8, 9].forEach((i, j) => { poses[i].ring = [0.06, 0.4, 0.75, 1][j]; poses[i].ringAt = lipGround(poses[6], view); });
  poses[6].flashAt = undefined;
  return poses;
}

/** «Волна»: колокол отведён назад и вскинут, левая ладонь выставлена вперёд; взмах — звон и расходящаяся рябь конусом. */
function waveKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { pitch: -0.14, hp: -0.16, bob: FLOAT + 1.6, glow: 1.5, spread: 1, staff: side ? stf([8, -3, 30], [0, -0.6, 0.8]) : stf([12, -2, 30], [0.4, -0.45, 0.8]), armLift: [1, 0], hand: [[0, 0, 0], side ? [-6, 11, 33] : [-11, 11, 34]] as [V3, V3], swing: [-0.4, -0.45, -0.45, -0.4] };
  const hit: Partial<Pose> = { ...wind, pitch: 0.2, hp: 0.1, bob: FLOAT - 1, staff: side ? stf([8, 9, 29], [0, 0.85, -0.5]) : stf([6, 10, 29], [-0.5, 0.75, -0.42]), toll: 1, flash: 1, hand: [[0, 0, 0], side ? [-6, 16, 33] : [-9, 16, 34]] as [V3, V3], swing: [0.55, 0.6, 0.6, 0.55] };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: FLOAT + 2.4, pitch: -0.18 }, ease: easeOut },
    { f: 2, p: { ...hit, flash: 0, toll: 0.5, ring: 0.1 }, ease: easeIn }, { f: 3, p: { ...hit, ring: 0.3 }, ease: easeOut },
    { f: 4, p: { ...hit, flash: 0, ring: 0.6 }, ease: linear }, { f: 5, p: { ...hit, flash: 0, toll: 0.6, ring: 0.85, bob: FLOAT - 0.4 }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, toll: 0.3, ring: 1, bob: FLOAT }, ease: easeInOut }, { f: 7, p: { ring: 0, spread: 0.5 }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function waveCastPoses(view: View): Pose[] {
  const { R0, keys } = waveKeys(view);
  const poses = keyed(R0, keys, 8, 640);
  poses.forEach((p, i) => { p.ringAt = [0, view === "side" ? 12 : 12, 0]; if (i >= 4) p.swing = decaySwing(i, 3, 0.55); });
  return poses;
}
/** «Объятие трясины»: руки разведены, колокол вскинут — звон; кисти смыкаются вниз, била бьёт оземь — корни. */
function embraceKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { pitch: -0.1, hp: -0.18, bob: FLOAT + 2, glow: 1.5, spread: 1, staff: side ? stf([8, 3, 30], [0, 0.2, 0.98]) : stf([14, 2, 30], [0.4, 0.05, 0.9]), armLift: [1, 1], hand: [[0, 0, 0], side ? [-6, 8, 38] : [-17, 5, 38]] as [V3, V3], pole: [[1, 0.1, -0.6], [-1, 0.1, -0.6]] as [V3, V3], swing: [0.3, 0.3, -0.3, -0.3] };
  const hit: Partial<Pose> = { ...wind, pitch: 0.18, hp: 0.12, bob: FLOAT - 1.2, staff: side ? stf([8, 9, 27], [0, 0.35, -1]) : stf([10, 8, 27], [0.12, 0.3, -1]), toll: 1, flash: 1, hand: [[0, 0, 0], side ? [-6, 12, 22] : [-11, 10, 22]] as [V3, V3], spread: 0.2, swing: [0.5, 0.5, 0.5, 0.5], armLift: [0, 0] };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: FLOAT + 3 }, ease: easeOut },
    { f: 2, p: { ...hit, flash: 0, toll: 0.4, ring: 0.1 }, ease: easeIn }, { f: 3, p: { ...hit, ring: 0.3 }, ease: easeOut },
    { f: 4, p: { ...hit, flash: 0, ring: 0.6 }, ease: linear }, { f: 5, p: { ...hit, flash: 0, toll: 0.6, ring: 0.9, bob: FLOAT - 0.4 }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, toll: 0.3, ring: 1, bob: FLOAT, spread: 0.5 }, ease: easeInOut }, { f: 7, p: { ring: 0, spread: 0.5 }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function embraceCastPoses(view: View): Pose[] {
  const { R0, keys } = embraceKeys(view);
  const poses = keyed(R0, keys, 8, 840);
  poses.forEach((p, i) => { p.ringAt = [0, 0, 0]; if (i >= 4) p.swing = decaySwing(i, 3, 0.5); });
  return poses;
}
/** «Прилив»: обе руки и била воздеты, колокола звонят вразнобой, вода растёт вокруг; удар — вода растекается кольцом. */
function tideKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { pitch: -0.18, hp: -0.3, bob: FLOAT + 3, glow: 1.6, spread: 1, staff: side ? stf([8, 2, 31], [0, 0.1, 1]) : stf([13, 2, 31], [0.3, 0, 0.95]), armLift: [1, 1], hand: [[0, 0, 0], side ? [-6, 6, 42] : [-13, 3, 42]] as [V3, V3], pole: [[1, 0.1, -0.6], [-1, 0.1, -0.6]] as [V3, V3], water: 0.35, toll: 0.6, swing: [0.4, -0.4, 0.4, -0.4] };
  const hit: Partial<Pose> = { ...wind, pitch: 0.1, hp: 0.05, bob: FLOAT - 0.8, staff: side ? stf([8, 8, 28], [0, 0.4, -1]) : stf([11, 7, 28], [0.1, 0.25, -1]), toll: 1, flash: 1, water: 1, hand: [[0, 0, 0], side ? [-6, 11, 24] : [-11, 9, 24]] as [V3, V3], swing: [0.55, 0.55, 0.55, 0.55], armLift: [0, 0] };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: FLOAT + 4, water: 0.5 }, ease: easeOut },
    { f: 2, p: { ...hit, flash: 0, toll: 0.5, water: 0.75, ring: 0.1 }, ease: easeIn }, { f: 3, p: { ...hit, ring: 0.3 }, ease: easeOut },
    { f: 4, p: { ...hit, flash: 0, ring: 0.6 }, ease: linear }, { f: 5, p: { ...hit, flash: 0, toll: 0.6, ring: 0.9 }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, toll: 0.3, ring: 1, bob: FLOAT, spread: 0.5, water: 0.9 }, ease: easeInOut }, { f: 7, p: { ring: 0, spread: 0.5, water: 0.5 }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function tideCastPoses(view: View): Pose[] {
  const { R0, keys } = tideKeys(view);
  const poses = keyed(R0, keys, 8, 940).map((p, i) => ({ ...p, waterPh: i * 0.12 }));
  poses.forEach((p, i) => { p.ringAt = [0, 0, 0]; if (i >= 4) p.swing = decaySwing(i, 3, 0.55); });
  return poses;
}
/** Гибель: колокол выпадает, звон затихает, колокольня оседает, призрак сгорбливается и растворяется в лохмотья. */
function deathPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const Wv = (v: V3): V3 => fromView(view, v);
  const fallS: [V3, V3] = [Wv([5, 2, 12]), norm(Wv([0.6, 0.6, -0.5]))];
  const lying: [V3, V3] = [Wv([-2, 3, 1.5]), norm(Wv([0.7, 0.7, -0.02]))];
  const recoil: Partial<Pose> = { pitch: -0.16, hp: -0.3, bob: FLOAT + 1.6, glow: 1.6, sway: 1, toll: 1, swing: [0.5, 0.55, 0.55, 0.5] };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1, p: recoil, ease: easeOut }, { f: 2, p: { ...recoil, pitch: 0.06, hp: 0, bob: FLOAT, glow: 1.1, swing: [-0.45, -0.5, -0.5, -0.45] }, ease: easeInOut },
    { f: 3, p: { held: 0, staff: fallS, hand: [[10, 8, 20], [-9.6, 6, 22]] as [V3, V3], pitch: 0.14, glow: 0.9, bob: FLOAT - 0.6, swing: [0.4, 0.4, 0.4, 0.4], fall: 0.2 }, ease: easeIn },
    { f: 4, p: { held: 0, staff: lying, hand: [[9.6, 8, 16], [-9.6, 7, 17]] as [V3, V3], pitch: 0.22, glow: 0.7, bob: FLOAT - 1.2, fall: 0.5, swing: [-0.3, -0.3, -0.3, -0.3] }, ease: easeIn },
    { f: 6, p: { held: 0, staff: lying, hand: [[9, 8, 13], [-9, 8, 14]] as [V3, V3], pitch: 0.34, hp: 0.2, glow: 0.5, bob: FLOAT - 2.4, fall: 0.85, swing: [0.12, 0.12, -0.12, -0.12] }, ease: easeOut },
    { f: 9, p: { held: 0, staff: lying, hand: [[8.6, 9, 12], [-8.6, 9, 12]] as [V3, V3], pitch: 0.46, hp: 0.5, glow: 0.2, bob: FLOAT - 3, fall: 1, wither: 0.3, tail: 0, swing: [0, 0, 0, 0] }, ease: easeInOut },
    { f: 13, p: { held: 0, staff: lying, hand: [[8.4, 9, 11.5], [-8.4, 9, 11.5]] as [V3, V3], pitch: 0.5, hp: 0.6, glow: 0, bob: FLOAT - 3.2, fall: 1, wither: 0.6, swing: [0, 0, 0, 0] }, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 14, 1300);
  for (let i = 3; i < 14; i++) { poses[i].held = 0; if (i >= 4) poses[i].staff = lying; }
  poses[1].flashAt = undefined;
  return poses;
}

export type BelAnim = "idle" | "walk" | "attack" | "waveWind" | "waveHold" | "waveCast" | "embraceWind" | "embraceHold" | "embraceCast"
  | "tideWind" | "tideHold" | "tideCast" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: BelAnim; hit?: number };
const ANIM_ORDER: [BelAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой, парит" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "скольжение" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар колоколом", hit: 5 }],
  ["waveWind", { n: 4, fps: 12, loop: false, ru: "замах волны", next: "waveHold" }],
  ["waveHold", { n: 4, fps: 12, loop: true, ru: "колокол гудит", next: "waveCast" }],
  ["waveCast", { n: 8, fps: 12, loop: false, ru: "волна", hit: 2 }],
  ["embraceWind", { n: 4, fps: 12, loop: false, ru: "зов трясины", next: "embraceHold" }],
  ["embraceHold", { n: 4, fps: 12, loop: true, ru: "трясина тянется", next: "embraceCast" }],
  ["embraceCast", { n: 8, fps: 12, loop: false, ru: "объятие трясины", hit: 2 }],
  ["tideWind", { n: 4, fps: 12, loop: false, ru: "зов прилива", next: "tideHold" }],
  ["tideHold", { n: 4, fps: 12, loop: true, ru: "вода поднимается", next: "tideCast" }],
  ["tideCast", { n: 8, fps: 12, loop: false, ru: "прилив", hit: 2 }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const BEL_ANIMS = {} as Record<BelAnim, AnimDef>;
{
  let col = 0;
  for (const [k, a] of ANIM_ORDER) { BEL_ANIMS[k] = { ...a, col }; col += a.n; }
}
export const BEL_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
export type BelFx = "wave" | "roots" | "tide" | "mound";
export const BEL_SKILLS: Record<string, { windup: [BelAnim, BelAnim]; strike: BelAnim; fx?: BelFx }> = {
  bell_wave: { windup: ["waveWind", "waveHold"], strike: "waveCast", fx: "wave" },
  swamp_embrace: { windup: ["embraceWind", "embraceHold"], strike: "embraceCast", fx: "roots" },
  high_tide: { windup: ["tideWind", "tideHold"], strike: "tideCast", fx: "tide" },
};
const holdOf = (keysOf: (v: View) => { R0: Pose; wind: Partial<Pose> }, seed: number, extra: (i: number, v: View) => Partial<Pose> = () => ({})) =>
  (v: View) => { const { R0, wind } = keysOf(v); return holdPoses(R0, wind, seed, 4, (i) => ({ armLift: [TREMBLE[i], TREMBLE[(i + 2) % 4]] as [number, number], glow: [1.4, 1.6, 1.45, 1.6][i], toll: [0.5, 0.8, 0.55, 0.9][i], flash: 0, swing: swings(i / 4, 0.4, 1), ...extra(i, v) })); };
const windOf = (keysOf: (v: View) => { R0: Pose; wind: Partial<Pose> }, seed: number, extra: (i: number) => Partial<Pose> = () => ({})) =>
  (v: View) => { const { R0, wind } = keysOf(v); return windPoses(R0, wind, seed).map((p, i) => ({ ...p, swing: swings(i / 4, 0.18 + 0.1 * i, 1), toll: i * 0.2, ...extra(i) })); };
const POSES: Record<BelAnim, (v: View) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v), attack: attackPoses,
  waveWind: windOf(waveKeys, 600), waveHold: holdOf(waveKeys, 620), waveCast: waveCastPoses,
  embraceWind: windOf(embraceKeys, 800), embraceHold: holdOf(embraceKeys, 820), embraceCast: embraceCastPoses,
  tideWind: windOf(tideKeys, 900, (i) => ({ water: 0.05 + i * 0.1 })),
  tideHold: holdOf(tideKeys, 920, (i) => ({ water: 0.45 + i * 0.05, waterPh: i * 0.1 })),
  tideCast: tideCastPoses, death: deathPoses,
};

// ---------------- эффекты мира ----------------
interface FxDef { w: number; h: number; ax: number; ay: number; n: number; fps: number; hit: number }
export const FX: Record<BelFx, FxDef & { anims?: Record<string, { col: number; n: number; loop: boolean; hit?: number; fps?: number }> }> = {
  wave: { w: 64, h: 64, ax: 6, ay: 32, n: 10, fps: 12, hit: 2 },
  roots: { w: 64, h: 64, ax: 32, ay: 50, n: 12, fps: 12, hit: 8, anims: { markIn: { col: 0, n: 4, loop: false, fps: 12 }, markHold: { col: 4, n: 4, loop: true, fps: 12 }, rootsOut: { col: 8, n: 4, loop: false, hit: 0, fps: 12 } } },
  tide: { w: 64, h: 48, ax: 32, ay: 28, n: 8, fps: 8, hit: 0 },
  mound: { w: 48, h: 40, ax: 24, ay: 30, n: 6, fps: 8, hit: 0 },
};
type Plot = (x: number, y: number, c: RGBA) => void;
const plotOf = (c: PC): Plot => (x, y, col) => c.set(x, y, col);
const MUD = R("#100c07", "#261c0e", "#43331a", "#665029", "#8e723a");
const rgba = (c: RGBA, a: number): RGBA => [c[0], c[1], c[2], Math.round(a)];
function disc(plot: Plot, cx: number, cy: number, r: number, ry: number, c: (d: number) => RGBA | null) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy) / ry);
    if (d > 1) continue;
    const q = c(d);
    if (q) plot(x, y, q);
  }
}
/** «Волна»: конус звона вправо от колокола — три расходящиеся дуги-рябь, внутри шевроны отталкивания; к концу тускнеет. */
function buildWaveFx(): PC {
  const F = FX.wave;
  const out = new PC(F.w * F.n, F.h * 2);
  const half = 0.62;
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const e = easeOut(Math.min(1, (i + 1) / 7));
    const k = i < 5 ? 1 : Math.max(0, 1 - (i - 4) / 5.5);
    const R1 = 8 + 50 * e;
    // тёмная вода-подложка конуса
    for (let y = 0; y < F.h; y++) for (let x = F.ax; x < F.w; x++) {
      const dx = x - F.ax, dy = y - F.ay;
      const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (r > R1 || Math.abs(a) > half || r < 3) continue;
      const edge = Math.abs(Math.abs(a) - half) < 0.05;
      pb(x, y, edge ? rgba(WATER[3], 200 * k) : rgba(WATER[1], 70 * k * (0.5 + 0.5 * (r / R1))));
    }
    // дуги: три волны подряд, у головной — светлая кромка
    for (let w = 0; w < 3; w++) {
      const r = R1 - w * 10;
      if (r < 6) continue;
      const steps = Math.ceil(r * half * 2 * 2.2);
      for (let s = 0; s <= steps; s++) {
        const a = -half + (s / steps) * half * 2;
        if (w > 0 && Math.sin(a * 17 + i) < -0.4) continue;
        const x = Math.round(F.ax + Math.cos(a) * r), y = Math.round(F.ay + Math.sin(a) * r);
        if (x < 1 || y < 1 || x >= F.w - 1 || y >= F.h - 1) continue;
        const tone = w === 0 ? 4 : w === 1 ? 3 : 2;
        pf(x, y, rgba(GLOWC[tone], 255 * Math.max(0.35, k)));
        if (w === 0) pf(x, y + 1, rgba(WATER[3], 220 * k));
      }
    }
    // шевроны отталкивания
    for (let c = 0; c < 3; c++) {
      const r = ((i * 4 + c * 14) % Math.max(10, R1 - 4)) + 8;
      if (r > R1 - 3) continue;
      for (const sgn of [-1, 1]) for (let j = 0; j < 3; j++) pf(Math.round(F.ax + r - j), Math.round(F.ay + sgn * j * 1.4), rgba(WATER[4], 230 * k));
    }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/** «Объятие трясины»: на земле метка — кольцо с рунами топи; потом из неё вырываются корни, обвивают и держат. */
function buildRootsFx(): PC {
  const F = FX.roots;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const stage = i < 4 ? "in" : i < 8 ? "hold" : "out";
    const k = stage === "in" ? (i + 1) / 4 : 1;
    const pulse = stage === "hold" ? 0.5 + 0.5 * Math.sin(((i - 4) / 4) * TAU) : 0.5;
    // метка: топкое пятно и кольцо
    disc(pb, cx, cy, 18 * k, 7 * k, (d) => rgba(MUD[d < 0.5 ? 0 : 1], d < 0.6 ? 190 : 140));
    const n = 40;
    for (let s = 0; s < n; s++) {
      const a = (s / n) * TAU;
      const x = Math.round(cx + Math.cos(a) * 18 * k), y = Math.round(cy + Math.sin(a) * 7 * k);
      pb(x, y, GLOWC[(s % 4 === 0 ? 3 : 2) + (pulse > 0.6 && s % 8 === 0 ? 1 : 0)]);
      if (s % 5 === 0) pb(Math.round(cx + Math.cos(a) * 12 * k), Math.round(cy + Math.sin(a) * 4.8 * k), VERD[3]);
    }
    for (let s = 0; s < 6; s++) { const a = s * (TAU / 6) + 0.4; pb(Math.round(cx + Math.cos(a) * 6 * k), Math.round(cy + Math.sin(a) * 2.4 * k), GLOWC[2 + (s & 1)]); }
    // корни: растут по кругу, закручиваются вокруг центра
    const g = stage === "out" ? (i - 7) / 4 : stage === "hold" ? 0.12 + 0.1 * pulse : 0.05 * k;
    const roots = 7;
    for (let r = 0; r < roots; r++) {
      const a0 = (r / roots) * TAU + 0.3;
      const H = Math.round(34 * g * (0.8 + 0.2 * ((r * 3) % 4) / 3));
      for (let h = 0; h < H; h++) {
        const u = h / Math.max(1, H);
        const a = a0 + u * 1.6 + Math.sin(u * 5 + r) * 0.2;
        const rr = (15 - 10 * u) * (0.9 + 0.1 * Math.sin(h * 0.9 + r));
        const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy + Math.sin(a) * rr * 0.4 - h * 0.95);
        const fr = Math.sin(a) > -0.2;
        const w = u < 0.55 ? 2 : 1;
        for (let q = 0; q < w; q++) (fr ? pf : pb)(x + q, y, MUD[Math.min(4, 2 + ((h + r) % 3 === 0 ? 1 : 0) + (q ? -1 : 0))]);
        if (h % 6 === 3) (fr ? pf : pb)(x - 1, y - 1, VERD[3]);
        if (u > 0.9) pf(x, y - 1, MUD[4]);
      }
    }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/** «Прилив»: пятно воды (тайл по арене) — волны-кольца, блики; из воды тянутся руки утопленников. */
function buildTideFx(): PC {
  const F = FX.tide;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const ph = i / F.n;
    disc(pb, cx, cy - 4, 30, 15, (d) => rgba(WATER[d < 0.55 ? 1 : 2], d > 0.85 ? 140 : 190));
    for (let r = 0; r < 3; r++) {
      const u = (ph + r / 3) % 1;
      const rr = 6 + 24 * u;
      const n = Math.ceil(rr * 6);
      for (let s = 0; s < n; s++) {
        const a = (s / n) * TAU;
        if (Math.sin(a * 5 + r * 2) < -0.2) continue;
        const x = Math.round(cx + Math.cos(a) * rr), y = Math.round(cy - 4 + Math.sin(a) * rr * 0.48);
        pb(x, y, rgba(WATER[u < 0.5 ? 4 : 3], 255 * (1 - u * 0.7)));
      }
    }
    for (let j = 0; j < 6; j++) pb(Math.round(cx + Math.sin(j * 2.3 + i * 0.7) * 22), Math.round(cy - 4 + Math.cos(j * 1.7) * 9), rgba(GLOWC[4], 200));
    // рука утопленника: поднимается и тонет, три пальца
    for (const [hx, hy, off] of [[-14, 0, 0], [12, 4, 0.5]] as [number, number, number][]) {
      const u = (ph + off) % 1;
      const H = Math.round(10 * Math.sin(Math.PI * u));
      if (H < 2) continue;
      const x0 = cx + hx, y0 = cy + hy;
      for (let h = 0; h < H; h++) { pf(x0, y0 - h, BONE[h % 3 === 0 ? 2 : 3]); pf(x0 + 1, y0 - h, BONE[2]); }
      for (const dx of [-2, 0, 2]) { pf(x0 + dx, y0 - H - 1, BONE[3]); pf(x0 + dx + (dx > 0 ? 0 : 0), y0 - H, BONE[2]); }
      for (let q = -3; q <= 4; q++) pf(x0 + q, y0 + 1, rgba(WATER[4], 230));
    }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/** Кочка — безопасное место на «Приливе»: холм из ила с камышом, ровное холодное кольцо света по земле, огоньки. */
function buildMoundFx(): PC {
  const F = FX.mound;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const pulse = 0.5 + 0.5 * Math.sin((i / F.n) * TAU);
    disc(pb, cx, cy, 21, 8, (d) => rgba(WATER[d > 0.8 ? 3 : 2], d > 0.8 ? 230 : 120));
    const n = 44;
    for (let s = 0; s < n; s++) { const a = (s / n) * TAU; if (s % 2) continue; pb(Math.round(cx + Math.cos(a) * 19), Math.round(cy + Math.sin(a) * 7.2), GLOWC[pulse > 0.5 && s % 4 === 0 ? 4 : 3]); }
    // холм
    disc(pf, cx, cy - 2, 12, 6.5, (d) => MUD[d < 0.45 ? (d < 0.25 ? 4 : 3) : d < 0.8 ? 2 : 1]);
    disc(pf, cx - 3, cy - 4, 4, 2.2, () => MUD[4]);
    for (let q = 0; q < 6; q++) {
      const x = cx - 9 + q * 3.6, h = 7 + (q * 5) % 5, sw = Math.round(Math.sin(i * 0.8 + q) * 1);
      for (let y = 0; y < h; y++) pf(Math.round(x + (y > h - 3 ? sw : 0)), cy - 4 - y, VERD[y > h - 3 ? 4 : y % 2 ? 2 : 3]);
    }
    for (let j = 0; j < 3; j++) { const t = (i / F.n + j / 3) % 1; pf(Math.round(cx + Math.sin(j * 2.1) * 9), Math.round(cy - 8 - 18 * t), rgba(GLOWC[t < 0.5 ? 4 : 3], 255 * (1 - t))); }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
// ---------------- листы, проверки, монтажи ----------------
function animSheets(only?: BelAnim[], maxFrames = 99): { img: Record<BelAnim, PC>; emis: Record<BelAnim, PC> } {
  const img = {} as Record<BelAnim, PC>, emis = {} as Record<BelAnim, PC>;
  for (const [a, d] of ANIM_ORDER) {
    const I = new PC(N * d.n, FH * 3), E = new PC(N * d.n, FH * 3);
    if (!only || only.includes(a)) VIEWS.forEach((v, row) => POSES[a](v).slice(0, Math.min(d.n, maxFrames)).forEach((p, i) => {
      const r = renderBel(v, p);
      I.blit(r.img, i * N, row * FH);
      E.blit(r.emis, i * N, row * FH);
    }));
    img[a] = I;
    emis[a] = E;
  }
  return { img, emis };
}
function relight(c: PC, emis: PC, x: number, y: number, k: number, flip = false) {
  const big = scaleNN(emis, k, flip);
  c.blit(big, x, y);
  for (let j = 0; j < emis.h; j++) for (let i = 0; i < emis.w; i++) {
    const q = emis.get(flip ? emis.w - 1 - i : i, j)!;
    if (!q[3]) continue;
    for (let dy = -3 * k; dy <= 3 * k; dy++) for (let dx = -3 * k; dx <= 3 * k; dx++) {
      const X = x + i * k + dx, Y = y + j * k + dy;
      const dd = Math.hypot(dx - k / 2, dy - k / 2) / (3.2 * k);
      if (dd > 1 || !c.inside(X, Y) || big.alpha(X - x, Y - y)) continue;
      const cur = c.get(X, Y)!;
      c.data.set(mix(cur, [q[0], q[1], q[2], 255], 0.035 * (1 - dd)), (Y * c.w + X) * 4);
    }
  }
}
interface Assets { hero: PC; terrain: PC; golem: PC; ref: PC | null; lich?: PC | null }
const GOLEM_N = 64;
const heroAt = (A: Assets, row: number) => crop(A.hero, 0, row * 32, 32, 32);
type Sheets = { img: Record<BelAnim, PC>; emis: Record<BelAnim, PC> };
function fxRow(title: string, fx: PC, F: FxDef, A: Assets, W: number, step: number): Row {
  const k = 2;
  return {
    h: F.h * k + 40,
    draw: (c, y0) => {
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, A.terrain, 16, y, Math.min(W - 32, 24 + step * k * F.n + 40), F.h * k, k, "grass");
      let x = 24;
      for (let i = 0; i < F.n; i++) {
        c.blit(scaleNN(crop(fx, i * F.w, 0, F.w, F.h), k), x, y);
        shadowBlob(c, x + F.ax * k, y + (F.ay - 1) * k, 6.5 * k, 2.2 * k);
        c.blit(scaleNN(heroAt(A, 0), k), x + (F.ax - 16) * k, y + (F.ay - 31) * k);
        c.blit(scaleNN(crop(fx, i * F.w, F.h, F.w, F.h), k), x, y);
        x += step * k;
      }
    },
  };
}

/** Сцена пилота: герой, голем и чародей (вниз, вверх, вбок, влево) на траве — днём и ночью, ×k. */
function sceneRow(A: Assets, sheets: Sheets, night: boolean, k: number): Row {
  const H = 86;
  return {
    h: H * k + 40,
    draw: (c, y0) => {
      text(c, `×${k} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ 32 · РУНОЛИТ 64 · ЗВОНАРЬ 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | РЕФЕРЕНС 15`, 16, y0 + 8);
      const y = y0 + 34;
      const wGround = 30 * k + 66 * 5 * k + 30 * k + 40;
      groundBg(c, A.terrain, 16, y, wGround, H * k, k, "grass");
      const yb = y + (H - 2) * k;
      const fr = (row: number) => crop(sheets.img.idle, 0, row * FH, N, FH), fe = (row: number) => crop(sheets.emis.idle, 0, row * FH, N, FH);
      const items: { img: PC; emis: PC | null; flip?: boolean; w: number; feet: number }[] = [
        { img: heroAt(A, 0), emis: null, w: 30, feet: 30.4 },
        { img: crop(A.golem, 0, 0, GOLEM_N, GOLEM_N), emis: null, w: 66, feet: 60 },
        { img: fr(0), emis: fe(0), w: 66, feet: CAM.GY }, { img: fr(1), emis: fe(1), w: 66, feet: CAM.GY }, { img: fr(2), emis: fe(2), w: 66, feet: CAM.GY }, { img: fr(2), emis: fe(2), flip: true, w: 66, feet: CAM.GY },
        { img: heroAt(A, 2), emis: null, w: 30, feet: 30.4 },
      ];
      let x = 28;
      const pos: [number, number][] = [];
      for (const it of items) {
        const top = Math.round(yb - it.feet * k);
        shadowBlob(c, x + (it.img.w / 2) * k, yb - 0.5 * k, Math.min(16, (it.img.w / 32) * 6.5) * k, 2.4 * k);
        c.blit(scaleNN(it.img, k, it.flip), x, top);
        pos.push([x, top]);
        x += it.w * k;
      }
      if (night) {
        nightRect(c, 16, y, wGround, H * k);
        items.forEach((it, i) => it.emis && relight(c, it.emis, pos[i][0], pos[i][1], k, it.flip));
      }
    },
  };
}
/**
 * «Наш | референс»: сверху — ×1 и ×3 рядом с героем и личем на траве (как в игре), ниже — чародей вниз и вбок ×8 (покой, кадр 1)
 * и образец 33 в тот же рост, днём и ночью.
 */
function buildCompare(sheets: Sheets, A: Assets): PC {
  const k = 7;
  const H = FH * k;
  const RH = A.ref ? A.ref.h : H;
  const rowH = Math.max(H, RH);
  const W = Math.max(24 + 2 * N * k + 16 + 40 + (A.ref ? A.ref.w : H) + 24, 2100);
  const TOP = 90 + 90 + 3 * 88 + 50 + 600;
  const c = new PC(W, TOP + 2 * (rowH + 70) + 20);
  fill(c, 0, 0, c.w, c.h, [30, 28, 34, 255]);
  const lich = A.lich ? crop(A.lich, 0, 0, 80, 80) : null;
  for (const [kk, y0] of [[1, 12], [3, 120]] as [number, number][]) {
    text(c, `×${kk} · ГЕРОЙ · ЛИЧ · ЗВОНАРЬ ВНИЗ И ВБОК`, 24, y0, 2);
    const yb = y0 + 22 + 88 * kk;
    groundBg(c, A.terrain, 24, y0 + 20, Math.min(W - 48, (32 + 84 + 66 * 2 + 40) * kk + 40), 90 * kk, kk, "grass");
    let x = 40;
    const put1 = (img: PC, feet: number, w: number) => { shadowBlob(c, x + (img.w / 2) * kk, yb - 0.5 * kk, Math.min(16, (img.w / 32) * 6.5) * kk, 2.4 * kk); c.blit(scaleNN(img, kk), x, Math.round(yb - feet * kk)); x += w * kk; };
    put1(heroAt(A, 0), 30.4, 34);
    if (lich) put1(lich, 75.4, 84);
    put1(crop(sheets.img.idle, 0, 0, N, FH), CAM.GY, 66);
    put1(crop(sheets.img.idle, 0, 2 * FH, N, FH), CAM.GY, 66);
  }
  // галерея: покой во все стороны (вниз, вверх, вбок, влево) + кадр удара посохом + кадр умения + зов двойников, ×4, день и ночь
  {
    const items = gallery(sheets);
    const gy = 90 + 90 + 3 * 88 + 50;
    for (const night of [false, true]) {
      const x0 = night ? 24 + 6 * (N * 4 + 8) + 20 : 24;
      void x0;
    }
    text(c, "ПОКОЙ: ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | УДАР · ВОЛНА · ОБЪЯТИЕ · ПРИЛИВ · ПРИЛИВ СБОКУ · ГИБЕЛЬ  (×3, ДЕНЬ / НОЧЬ)", 24, gy, 2);
    const gw = items.length * (N * 3 + 8) + 8;
    for (const [ni, night] of [false, true].entries()) {
      const gx = 24 + ni * 0;
      const yy = gy + 22 + ni * (FH * 3 + 6);
      void gx;
      fill(c, 24, yy, gw, FH * 3, night ? [38, 46, 74, 255] : [150, 156, 140, 255]);
      items.forEach((it, i) => {
        const ix = 24 + 8 + i * (N * 3 + 8);
        c.blit(scaleNN(it.img, 3, it.flip), ix, yy);
        if (night) { nightRectPart(c, ix, yy, N * 3, FH * 3); relight(c, it.emis, ix, yy, 3, it.flip); }
      });
    }
  }
  for (const night of [false, true]) {
    const y = TOP + 48 + (night ? rowH + 70 : 0);
    text(c, night ? "НАШ · НОЧЬ" : "НАШ · ДЕНЬ", 24, y - 36, 3);
    text(c, "РЕФЕРЕНС 15", 24 + 2 * N * k + 56, y - 36, 3);
    const oy = y + rowH - H;
    fill(c, 24, oy, 2 * N * k + 16, H, [150, 156, 140, 255]);
    for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) c.blit(scaleNN(crop(sheets.img.idle, 0, row * FH, N, FH), k), 24 + j * (N * k + 16), oy);
    if (night) {
      nightRect(c, 24, oy, 2 * N * k + 16, H);
      for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) relight(c, crop(sheets.emis.idle, 0, row * FH, N, FH), 24 + j * (N * k + 16), oy, k);
    }
    fill(c, 24 + 2 * N * k + 16 + 16, y, 4, rowH, [240, 232, 214, 255]);
    if (A.ref) c.blit(A.ref, 24 + 2 * N * k + 56, y);
  }
  return c;
}
/** Референс 33 → png 360×540 с сохранением пропорций (через System.Drawing; чужой арт остаётся в tools/out, не в игре). */
function ensureRef(root: string): PC | null {
  const png = path.join(root, "tools", "out", "bosses139", "ref-15.png");
  const jpg = path.join(root, "tools", "out", "refs", "bosses-139", "15.jpg");
  if (!fs.existsSync(png) && fs.existsSync(jpg) && process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${jpg}'); $b=New-Object System.Drawing.Bitmap 450,500; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,450,500); $b.Save('${png}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  return fs.existsSync(png) ? loadPC(png) : null;
}
/** Строка анимации ×2: вид вниз и вбок, герой для масштаба, день или ночь. */
function animRow(a: BelAnim, sheets: Sheets, A: Assets, W: number, night = false): Row {
  const d = BEL_ANIMS[a];
  const k = 2;
  return {
    h: FH * k * 2 + 44,
    draw: (c, y0) => {
      text(c, `×2 · ${d.ru} · ${d.n} КАДРОВ · ${d.fps} К/С${d.loop ? " · ПО КРУГУ" : ""}${d.next ? ` · → ${BEL_ANIMS[d.next].ru}` : ""}${d.hit !== undefined ? ` · УДАР — КАДР ${d.hit + 1}` : ""}${night ? " · НОЧЬ" : ""}`, 16, y0 + 8);
      for (const v of [0, 2]) {
        const y = y0 + 34 + (v === 0 ? 0 : FH * k);
        const wG = 70 + d.n * N * k;
        groundBg(c, A.terrain, 16, y, Math.min(W - 32, wG), FH * k, k, "grass");
        let x = 24;
        const yb = y + CAM.GY * k;
        shadowBlob(c, x + 16 * k, yb - 0.5 * k, 6.5 * k, 2.2 * k);
        c.blit(scaleNN(heroAt(A, v === 0 ? 0 : 2), k, v === 2), x, Math.round(yb - 30.4 * k));
        x += 30 * k;
        const pos: number[] = [];
        for (let i = 0; i < d.n; i++) {
          shadowBlob(c, x + 32 * k, yb - 0.5 * k, 12 * k, 3.6 * k);
          c.blit(scaleNN(crop(sheets.img[a], i * N, v * FH, N, FH), k), x, y);
          pos.push(x);
          x += N * k;
        }
        if (night) {
          nightRect(c, 16, y, Math.min(W - 32, wG), FH * k);
          pos.forEach((px, i) => relight(c, crop(sheets.emis[a], i * N, v * FH, N, FH), px, y, k));
        }
      }
    },
  };
}

/** Кадры галереи: [img, emis, flip]. */
function gallery(sheets: Sheets): { img: PC; emis: PC; flip?: boolean }[] {
  const idle = (row: number, flip = false) => ({ img: crop(sheets.img.idle, 0, row * FH, N, FH), emis: crop(sheets.emis.idle, 0, row * FH, N, FH), flip });
  const pose = (p: Pose, v: View) => renderBel(v, p);
  return [
    idle(0), idle(1), idle(2), idle(2, true),
    pose(POSES.attack("down")[6], "down"), pose(POSES.waveCast("down")[3], "down"), pose(POSES.embraceCast("down")[3], "down"),
    pose(POSES.tideCast("down")[4], "down"), pose(POSES.tideHold("side")[2], "side"), pose(POSES.death("down")[6], "down"),
  ];
}
/** Ночь только по части холста. */
function nightRectPart(c: PC, x: number, y: number, w: number, h: number) { nightRect(c, x, y, w, h); }

export function writeBelArt(root: string, outDir: string, quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => { const f = path.join(outDir, name); c.save(f); files.push(f); return c; };
  const sheets = animSheets(quick ? ["idle"] : undefined, quick ? 1 : 99);
  const A: Assets = {
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
    golem: loadPC(path.join(root, "client", "public", "assets", "units", "sol_rune_golem.png")),
    ref: ensureRef(root),
    lich: fs.existsSync(path.join(root, "client", "public", "assets", "units", "umb_crown_lich.png")) ? crop(loadPC(path.join(root, "client", "public", "assets", "units", "umb_crown_lich.png")), 0, 0, 80, 80) : null,
  };
  if (process.argv.includes("--sil")) {
    const sc = new PC(N * 10 + 30 + 460, 520);
    fill(sc, 0, 0, sc.w, sc.h, [200, 190, 160, 255]);
    for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) {
      const fr = crop(sheets.img.idle, 0, row * FH, N, FH);
      for (let y = 0; y < FH; y++) for (let x = 0; x < N; x++) if (fr.alpha(x, y)) fr.set(x, y, [20, 20, 24, 255]);
      sc.blit(scaleNN(fr, 5), j * (N * 5 + 10), 0);
    }
    if (A.ref) sc.blit(A.ref, N * 10 + 30, 0);
    save(sc, "r59s-e-sil.png");
    return files;
  }
  save(buildCompare(sheets, A), "r59s-e-compare.png");
  if (quick) return files;
  const sheet = new PC(N * BEL_COLS, FH * 3), glow = new PC(N * BEL_COLS, FH * 3);
  for (const [a] of ANIM_ORDER) { sheet.blit(sheets.img[a], BEL_ANIMS[a].col * N, 0); glow.blit(sheets.emis[a], BEL_ANIMS[a].col * N, 0); }
  save(sheet, "bel-sheet.png");
  save(glow, "bel-glow.png");
  const fx = { wave: save(buildWaveFx(), "bel-fx-wave.png"), roots: save(buildRootsFx(), "bel-fx-roots.png"), tide: save(buildTideFx(), "bel-fx-tide.png"), mound: save(buildMoundFx(), "bel-fx-mound.png") };
  const rows = ["вниз", "вверх", "вбок"];
  const bad: string[] = [];
  for (let r = 0; r < 3; r++) for (let cI = 0; cI < BEL_COLS; cI++) {
    let hits = 0;
    for (let k2 = 0; k2 < FH; k2++) for (const [x, y] of [[0, k2], [N - 1, k2]]) { const q = sheet.get(cI * N + x, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    for (let k2 = 0; k2 < N; k2++) for (const y of [0, FH - 1]) { const q = sheet.get(cI * N + k2, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    if (hits) bad.push(`лист, ${rows[r]}, кадр ${cI + 1}: ${hits} px не цветом контура на краю`);
  }
  console.log(`  ${ID}: ${BEL_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 30).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; }
  else console.log("  проверки: край кадра чист");
  const W = 2000;
  const rowsP: Row[] = [sceneRow(A, sheets, false, 3), sceneRow(A, sheets, true, 3)];
  for (const [a] of ANIM_ORDER) rowsP.push(animRow(a, sheets, A, W));
  for (const a of ["idle", "tideHold"] as BelAnim[]) rowsP.push(animRow(a, sheets, A, W, true));
  const names: Record<BelFx, string> = { wave: "ВОЛНА (КОНУС)", roots: "ОБЪЯТИЕ ТРЯСИНЫ", tide: "ПРИЛИВ (ВОДА)", mound: "КОЧКА" };
  for (const kx of Object.keys(FX) as BelFx[]) rowsP.push(fxRow(`×2 · ЭФФЕКТ МИРА · ${names[kx]} · ${FX[kx].n} КАДРОВ · ${FX[kx].fps} К/С`, fx[kx], FX[kx], A, W, FX[kx].w));
  save(stackRows(rowsP, W), "bel-pilot.png");
  return files;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/plg_drowned_bellringer.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const files = writeBelArt(root, path.join(root, "tools", "out", "bosses139"), process.argv.includes("--quick"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void linear; void hex; void cross; void easeIn; void ik; void hash01;
