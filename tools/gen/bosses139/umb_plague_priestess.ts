/**
 * Задача 139, босс кольца: жрица котла Гнашера (восток, слот r55n, Чумные топи, ур. 55, группа 3; карточка — docs/systems/bosses.md,
 * раздел 3.3 п. 11 и «Раскладка референсов»). Образ — по референсу tools/out/refs/bosses-139/04-brett-nuckles-gnashera.jpg (бледная
 * жрица в глубоком капюшоне с высоким задним острием, глаза светятся; тёмная длинная ряса с бирюзовой подкладкой, рваный подол с
 * шипами-рунами и шлейфом; костяные наплечья с рогами, костяная грудная пластина и рёбра по рясе; широкие рукава; две шипастые
 * ржавые цепи с плеч до земли) — только для сравнения: чужой арт в игру и в git не идёт. Свечение синее, как у образца; яд и котёл — кислотно-зелёные.
 *
 * Метод — как у хозяина миражей и военачальника (tools/gen/bosses139/umb_plague_priestess.ts): общий движок tools/gen/mobs/lib.ts,
 * тело в двойном разрешении (160×160) сводится в кадр 64×80, выборочный контур, контровой свет по краю. Светится (ночью не гаснет):
 * глаза, руны подола, знак на груди, склянки. Котёл — отдельный спрайт-объект (бурлит, пар; вторая строка — «кипит перед лечением»).
 *
 * Запуск (низкий приоритет): npx tsx tools/gen/bosses139/umb_plague_priestess.ts [--quick|--sil] →
 *   tools/out/bosses139/plg-sheet.png, plg-glow.png, plg-cauldron.png, plg-cauldron-glow.png, plg-pilot.png, r55n-e-compare.png.
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

export const ID = "umb_plague_priestess";
export const FRAME = 64;
/** Кадр 64×80 (высокий, узкий силуэт): ширина FRAME, высота FRAME_H. */
export const FRAME_H = 80;
const FW = FRAME, FH = FRAME_H;
const N = FW;
const CAM: Cam = { N: FW, CX: 32, GY: 76.4 };
const RS = 2;
const CAMR: Cam = { N: 160, CX: 80, GY: 152.8 };
const RX0 = 16;
/** Модель → пиксели кадра 1×. */
const K = 1.3;
const PXM = PX / K;
const snapM = (view: View, w: V3): V3 => mul(snapPx(view, mul(w, K)), 1 / K);

// ---------------- палитра ----------------
/** Ряса: чёрно-серая с зелёным отливом. */
const CHAR = R("#020304", "#08090c", "#12161b", "#1e252d", "#38444f");
/** Подкладка и кромки: болотная бирюза. */
const TEAL = R("#040810", "#0a1630", "#102a58", "#1c468c", "#3a78d8");
/** Кость: наплечья, грудь, рога, рёбра. */
const BONE = R("#322d20", "#6c6448", "#aaa07c", "#e0d6b0", "#fbf4da");
/** Бледное лицо и кисти: серо-зелёная кожа мертвеца. */
const FACE = R("#222a28", "#4c5a55", "#82938a", "#b4c4b8", "#e2eee0");
/** Ржавые шипастые цепи. */
const RUST = R("#1a0e08", "#3e2312", "#74462a", "#ab7442", "#dca868");
/** Железо котла и пробок. */
const IRON = R("#07090a", "#171b1e", "#2e353a", "#4a535a", "#7c8a94");
const BLACK = R("#030506", "#080b0d", "#10151a", "#1a2128", "#2a343e");
/** Свет: глаза, руны, знак на груди — холодно-синий. */
const GLOWC = R("#061a3a", "#0f3c8c", "#2272e6", "#5ab0ff", "#d8eeff");
/** Яд в склянке и котле: кислотно-лаймовый. */
const FIRE = R("#1c3a06", "#4c8a12", "#8ad22a", "#c4f060", "#f4ffc0");
const DEAD = R("#121112", "#262223", "#3b3434", "#544a47", "#6e625c");
/** Миазмы и болотная жижа (пыль, пар у ног). */
const SAND = R("#14201a", "#2a4034", "#456650", "#6a9470", "#9cc49c");
const VOID = hex("#030605");

const M = {
  robe: mat("ряса", CHAR, { base: 1.8, gain: 2.3 }),
  teal: mat("подкладка", TEAL, { base: 1.9, gain: 2.3 }),
  bone: mat("кость", BONE, { base: 2.0, gain: 2.3, hi: 4 }),
  face: mat("лицо", FACE, { base: 2.0, gain: 2.2 }),
  rust: mat("цепь", RUST, { base: 2.1, gain: 2.2 }),
  iron: mat("железо", IRON, { base: 1.8, gain: 2.2 }),
  black: mat("тьма", BLACK, { base: 1.5, gain: 2.0 }),
  glow: mat("свет", GLOWC, { base: 2.8, gain: 1.0, glow: true, crisp: true }),
  vial: mat("склянка", FIRE, { base: 2.9, gain: 0.9, glow: true, crisp: true }),
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
  for (const c of [...GLOWC, ...FIRE]) s.add(c.slice(0, 3).join(","));
  return (q: RGBA) => s.has(q.slice(0, 3).join(","));
})();


// ---------------- поза ----------------
interface Pose {
  root: V3; bob: number; chest: number; headZ: number;
  pitch: number; yaw: number; roll: number; hp: number; hy: number; hr: number;
  /** кисти: [правая — склянка; левая — свободная]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3]; armLift: [number, number];
  /** склянки в руках (1 — есть) */
  vial: [number, number];
  /** подол: волна, амплитуда; шаг (стопы); раскачка рясы, цепей и шлейфа (px) */
  wave: number; waveAmp: number; kick: [number, number]; sway: number; tail: number;
  /** свечение 0..1,6; прочее (не используется); увядание; на коленях */
  glow: number; fire: number; sigil: number; wither: number; kneel: number;
  /** миазмы у ног 0..1 (swirlPh — фаза), звёзды оглушения */
  swirl: number; swirlPh: number; ghost: number; stars: number;
  ring: number; ringAt?: V3; flash: number; flashAt?: V3; dust: [number, number];
  trail?: V3[];
  t: number; seed: number;
}

const HIP0 = 21;
const NECK: V3 = [0, 0.8, 37.6];
const ARM: [number, number] = [10.0, 10.4];
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.04, yaw: 0, roll: 0, hp: 0.05, hy: 0, hr: 0,
  hand: [[14.2, 3.0, 22.5], [-14.2, 2.5, 22.0]], pole: [[1, -0.6, -0.5], [-1, -0.6, -0.5]], armLift: [0, 0], vial: [0, 0],
  wave: 0, waveAmp: 0, kick: [0, 0], sway: 0, tail: 0,
  glow: 1, fire: 0, sigil: 0, wither: 0, kneel: 0,
  swirl: 0, swirlPh: 0, ghost: 0, stars: 0,
  ring: 0, flash: 0, dust: [0, 0], t: 0, seed: 1,
};
const REST_SIDE: Pose = { ...REST_FRONT, hand: [[12.0, 8.0, 23.5], [-12.0, 7.0, 23.0]] };
const restOf = (view: View): Pose => (view === "side" ? REST_SIDE : REST_FRONT);
const bodyShift = (view: View, p: Pose): V3 => snapM(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.kneel * 7]);

// ---------------- штампы ----------------
type Keys = Record<string, RGBA>;
const up2 = (px: StampPx[]): StampPx[] => px.flatMap(([x, y, c]) => [[x * 2, y * 2, c], [x * 2 + 1, y * 2, c], [x * 2, y * 2 + 1, c], [x * 2 + 1, y * 2 + 1, c]] as StampPx[]);
/** Глаза: тёмная складка капюшона над ними, ниже — две зелёные точки; рот — тёмная щель. */
const ST_EYES: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: up2(stampRows(["kk..kk", "33..33"], -3, -1)),
  side: up2(stampRows(["kk", "d3"], 0, -1)),
};
const ST_MOUTH: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: up2(stampRows(["..mm.."], -3, 0)),
  side: up2(stampRows(["m"], 0, 0)),
};
/** Знак на груди: крест из свечения. */
const ST_SIGN: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: up2(stampRows([".3.", "333", ".3."], -1, -1)),
  side: up2(stampRows(["3"], 0, 0)),
};
function stampKeys(glow: number): Keys {
  const g = clamp(glow, 0, 1.6);
  const lv = (k: number) => {
    const v = k - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.25 ? 1 : 0);
    return v < 0 ? VOID : GLOWC[clamp(v, 0, 4)];
  };
  return { m: BLACK[0], k: BLACK[1], d: FACE[1], "1": lv(1), "2": lv(2), "3": lv(3) };
}
const GLOW_KEYS = ["3"];

// ---------------- сцена ----------------
interface Extra {
  sigil: { c: V3; r: number; ph: number; k: number } | null;
  rings: { c: V3; r: number; k: number }[];
  flash: { at: V3; k: number } | null;
  dust: { at: V3; k: number }[];
  swirl: { c: V3; k: number; ph: number } | null;
  sparks: { at: V3; k: number }[];
  stars: { at: V3; k: number } | null;
  glints: V3[];
}

/** Жрица в координатах модели. */
function build(p0: Pose, view: View): { S: Scene; X: Extra } {
  const S = new Scene();
  const X: Extra = { sigil: null, rings: [], flash: null, dust: [], swirl: null, sparks: [], stars: null, glints: [] };
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.28, hy: p0.hy - 0.15 } : p0;
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
  const kn = p.kneel;
  const sw = p.sway * PXM;
  const I3: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  // ---------- подол: сплошной конус + веер узких лоскутов, заострённых к земле; шипы-руны светятся ----------
  {
    const g = S.group(0.9);
    const base = [pel[0] + sw * 0.15, pel[1], 0.8] as V3;
    S.cone(g, wm(M.robe, W), PV([0, 0, 27]), 4.9, [base[0], base[1], 0.8], 10.4, { tone: -0.25, big: true });
    const n = 18;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU;
      const sn = Math.sin(th), cs = Math.cos(th);
      const front = cs > -0.2;
      const lift = Math.max(0, Math.round(p.waveAmp * (0.5 + 0.5 * Math.sin(TAU * (p.wave + i * 0.19))))) * PXM;
      const R1 = 13.6 + 1.8 * (i % 2) + (cs < -0.4 ? 3 : 0) - kn * 0.8;
      const topP = PV([sn * 5.0, cs * 5.0 + 0.4, 25 - (i % 3) * 1.2]);
      const bot: V3 = [base[0] + sn * R1 + sw * 0.7 * (1 - cs * 0.3), base[1] + cs * R1 * 0.95 + p.kick[sn > 0 ? 0 : 1] * 1.4 * Math.max(0, cs), 0.7 + lift];
      const teal = false;
      S.cone(g, wm(teal ? M.teal : M.robe, W), topP, 3.1, bot, 0.15, { part: S.newPart(), tone: (i % 2 ? -0.15 : 0.2) + (sn < -0.2 ? 0.2 : 0) });
      // шипы-руны по краю подола, спереди
      if (front) S.cone(g, M.glow, [bot[0], bot[1], 0.7], 0.55, [bot[0], bot[1], 2.0], 0.1, { part: S.newPart() });
      if (front && i % 3 === 0) {
        const hp: V3 = [bot[0] - sn * 0.2, bot[1] + cs * 0.2, 0.9];
        S.cone(g, M.glow, hp, 0.8, add(hp, [0, 0, 4.2 - Math.abs(sn) * 1.4]), 0.05, { part: S.newPart() });
      }
    }
    // шлейф: рваные ленты назад, концы расходятся по земле
    for (const [x0, x1, l, c] of [[-4, -13, 22, 0], [0, 1, 25, 1], [4, 13, 22, 0], [-2, -7, 19, 1], [2, 8, 19, 0]] as [number, number, number, number][]) {
      const a = PV([x0 * 0.5, -5.2, 15]);
      const e: V3 = [base[0] + x1 + sw * 0.5 + p.tail * PXM * (x1 < 0 ? -1 : 1), base[1] - l, 0.8];
      const m = add(a, [x1 * 0.45, -l * 0.5, -9]);
      S.cone(g, wm(c ? M.teal : M.robe, W), a, 3.0, m, 1.9, { part: S.newPart(), tone: c ? 0.1 : -0.1 });
      S.cone(g, wm(c ? M.teal : M.robe, W), m, 1.9, e, 0.1, { part: S.newPart(), tone: c ? 0.2 : 0.05 });
    }
    // длинные рваные хвосты подола стелятся по земле в стороны и назад
    for (const sd of [1, -1]) for (const [ax, ay, ex, ey, r0] of [[8, 5, 21, 7, 2.2], [9, -1, 23, -4, 2.4], [8, -6, 20, -15, 2.2], [5, -9, 11, -21, 2.0]] as [number, number, number, number, number][]) {
      const a2: V3 = [base[0] + sd * ax + sw * 0.4, base[1] + ay, 5.5];
      const m2: V3 = [base[0] + sd * (ax + (ex - ax) * 0.55) + sw * 0.6, base[1] + ay + (ey - ay) * 0.55, 1.6];
      const e2: V3 = [base[0] + sd * ex + sw * 0.8 + p.tail * PXM * sd * 0.5, base[1] + ey, 0.7];
      S.cone(g, wm(M.robe, W), a2, r0, m2, r0 * 0.7, { part: S.newPart(), tone: 0.05 });
      S.cone(g, wm(M.robe, W), m2, r0 * 0.7, e2, 0.1, { part: S.newPart(), tone: 0.2 });
      S.cone(g, M.glow, [m2[0], m2[1], 0.8], 0.4, [e2[0], e2[1], 0.8], 0.15, { part: S.newPart() });
    }
    // носки из-под подола
    for (const s of [1, -1]) S.cone(g, wm(M.black, W), [pel[0] + s * 3.4, pel[1] + 8.5, 1.2], 1.4, [pel[0] + s * 3.8 + sw * 0.3, pel[1] + 12.2 + 1.4 * Math.max(0, p.kick[s > 0 ? 0 : 1]), 0.5], 0.5, { part: S.newPart(), tone: -0.2 });
  }
  // ---------- торс: узкая талия, костяная грудная пластина с рёбрами и знаком ----------
  {
    const g = S.group(1.8);
    const ribs = (c: { l: V3; edge: boolean }) => (c.edge ? 0.5 : (((c.l[2] / 2.0) % 1) + 1) % 1 < 0.2 ? -1.3 : 0);
    S.cone(g, wm(M.robe, W), PV([0, 0.2, 22]), 3.5, T([0, 0.4, 29]), 3.7, { tone: -0.1 });
    S.ell(g, wm(M.robe, W), T([0, 0.6, 33.6]), [5.0, 3.5, 5.2], axes(TV), { big: true });
    S.ell(g, wm(M.bone, W), T([0, 2.7, 34.0]), [4.2, 1.6, 5.2], axes(TV), { part: S.newPart(), tone: 0.1, tex: ribs as never });
    S.ell(g, wm(M.bone, W), T([0, 2.9, 38.4]), [4.4, 1.3, 1.3], axes(TV), { part: S.newPart(), tone: 0.3 });
    S.cone(g, wm(M.bone, W), T([0, 2.9, 30.4]), 1.7, T([0, 3.3, 25.6]), 0.4, { part: S.newPart(), tone: 0.1 });
    S.stamps.push({ at: T([0, 4.2, 34.6]), n: TV([0, 1, 0]), px: ST_SIGN, colors: keys, glow: GLOW_KEYS, halo: GLOWC[2], depthTol: 2.4, minFacing: 0.25 });
    for (const s of [1, -1]) {
      S.cone(g, wm(M.bone, W), T([s * 3.4, 3.0, 27.6]), 0.8, T([s * 7.0, 2.2, 26.0]), 0.5, { part: S.newPart(), tone: 0.2 });
      S.cone(g, wm(M.bone, W), T([s * 7.0, 2.2, 26.0]), 0.5, T([s * 9.2, 0.8, 23.0]), 0.1, { part: S.newPart(), tone: 0.3 });
    }
    S.ell(g, wm(M.teal, W), PV([0, 0.8, 24.4]), [4.0, 3.2, 0.9], axes(PR), { part: S.newPart(), tone: 0 });
  }
  // ---------- цепи: терновые, ржавые; от кистей длинными дугами до земли и назад, плюс перевязь через грудь ----------
  {
    const g = S.group(0.7);
    const link = (pt: V3, d: V3, i: number, s: number) => {
      const e0 = norm(perp(d, [s, 0.2, 0]));
      const e1 = norm(cross(d, e0));
      const rr: V3 = i % 2 ? [1.0, 1.0, 1.6] : [1.0, 1.6, 1.0];
      S.ell(g, wm(M.rust, W), pt, rr, [e0, e1, d], { part: S.newPart(), tone: (i % 3) * 0.2 - 0.1 });
      if (i % 2 === 0) S.cone(g, wm(M.rust, W), pt, 0.6, add(pt, mul(e0, 2.4)), 0.05, { part: S.newPart(), tone: 0.35 });
    };
    const arc = (A: V3, mid: V3, E: V3, L: number, s: number, floor = 0.8) => {
      let prev = A;
      for (let i = 1; i <= L; i++) {
        const u = i / L, q1 = 1 - u, q2 = u;
        const pt: V3 = [q1 * q1 * A[0] + 2 * q1 * q2 * mid[0] + q2 * q2 * E[0], q1 * q1 * A[1] + 2 * q1 * q2 * mid[1] + q2 * q2 * E[1], Math.max(floor, q1 * q1 * A[2] + 2 * q1 * q2 * mid[2] + q2 * q2 * E[2])];
        link(pt, norm(sub(pt, prev)), i, s);
        prev = pt;
      }
    };
    for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
      const A = add(add(p.hand[i], shift), [0, 0, -p.armLift[i] * PXM]);
      arc(add(A, [0, 0, -1]), [pel[0] + s * (19 + sw * 0.6), pel[1] + 12.0, 8 + kn * 3], [pel[0] + s * (21 + sw), pel[1] - 8.0 - p.tail * PXM * 0.5, 1.2], 26, s);
    }
    // перевязь: с правого плеча через грудь к левому бедру, провисает
    arc(T([8.6, 2.6, 37.4]), T([-1.0, 5.8, 29.0]), T([-10.0, 3.0, 20.0]), 14, 1);
  }
  // ---------- руки: широкие рукава, выпущенные кисти с длинными когтями; в правой — склянка ----------
  {
    const g = S.group(1.0);
    const hand = (gg: number, i: number, sh: V3, fist: V3, sg: number, vialK: number) => {
      const el = ik(sh, fist, ARM[0], ARM[1], p.pole[i]);
      const fd = norm(sub(fist, el));
      S.cone(gg, wm(M.robe, W), sh, 2.5, el, 3.1, { tone: 0.0, big: true });
      S.cone(gg, wm(M.robe, W), el, 3.1, add(fist, mul(fd, -0.6)), 4.4, { tone: -0.05, big: true });
      // рваный край рукава: лоскуты свисают вниз вокруг запястья
      for (let q = 0; q < 7; q++) {
        const th = (q / 7) * TAU;
        const rim = add(add(fist, mul(fd, -0.6)), add(mul(perp(fd, [0, 0, 1]), Math.cos(th) * 4.0), mul(cross(fd, perp(fd, [0, 0, 1])), Math.sin(th) * 4.0)));
        S.cone(gg, wm(M.robe, W), rim, 1.4, add(rim, [0, 0, -(1.8 + (q % 3) * 1.2)]), 0.1, { part: S.newPart(), tone: (q % 2) * 0.3 - 0.05 });
      }
      for (let q = 0; q < 2; q++) S.cone(gg, wm(M.bone, W), add(sh, mul(sub(el, sh), 0.3 + q * 0.4)), 3.0, add(sh, mul(sub(el, sh), 0.33 + q * 0.4)), 3.05, { part: S.newPart(), tone: 0.2 });
      const e0 = perp(fd, [0, 0, 1]);
      // длинная костлявая кисть: узкая ладонь, четыре длинных пальца с когтями
      S.ell(gg, wm(M.face, W), add(fist, mul(fd, 4.2)), [1.2, 0.9, 3.4], [e0, cross(fd, e0), fd], { part: S.newPart(), tone: 0.6 });
      for (let q = -2; q <= 1; q++) {
        const dir = norm(add(add(mul(fd, 1), mul(e0, (q + 0.5) * 0.28)), [0, 0.2, -0.3]));
        const kn1 = add(fist, mul(dir, 9.4 + (q === -1 || q === 0 ? 2.0 : 0)));
        S.cone(gg, wm(M.face, W), add(fist, mul(fd, 5.2)), 0.6, kn1, 0.45, { part: S.newPart(), tone: 0.6 });
        S.cone(gg, wm(M.bone, W), kn1, 0.45, add(kn1, mul(dir, 3.4)), 0.05, { part: S.newPart(), tone: 0.6 });
      }
      if (vialK > 0.5) {
        const vc = add(fist, add(mul(fd, 1.2), [0, 0.8 * sg, 2.4]));
        S.ell(gg, M.vial, vc, [1.8, 1.8, 2.6], I3, { part: S.newPart() });
        S.cone(gg, wm(M.iron, W), add(vc, [0, 0, 2.2]), 1.0, add(vc, [0, 0, 4.0]), 0.8, { part: S.newPart(), tone: 0.1 });
        X.glints.push(add(vc, [0.4, 0, 2.6]));
      }
    };
    for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
      const gg = i ? S.group(1.0) : g;
      const lift = [0, 0, -p.armLift[i] * PXM] as V3;
      const sh = add(T([s * 8.6, 0.2, 37.4]), lift);
      const fist = add(add(p.hand[i], shift), lift);
      hand(gg, i, sh, fist, s, p.vial[i]);
    }
  }
  // ---------- плечи: изогнутые костяные пластины лежат по плечу и загибаются вниз-назад ----------
  {
    const g = S.group(0.9);
    for (const s of [1, -1]) {
      S.ell(g, wm(M.bone, W), T([s * 9.6, -0.2, 39.6]), [4.4, 3.2, 1.5], axes(TV, s * 0.45), { big: true, part: S.newPart(), tone: 0.15 });
      S.ell(g, wm(M.bone, W), T([s * 12.8, -0.8, 38.2]), [2.8, 2.6, 1.2], axes(TV, s * 0.95), { part: S.newPart(), tone: 0.05 });
      const path: V3[] = [[s * 9.4, 0.4, 41.2], [s * 13.6, -0.4, 41.4], [s * 16.8, -2.2, 38.6], [s * 17.8, -4.6, 34.0]];
      const rad = [1.3, 1.1, 0.8, 0.1];
      const pp = S.newPart();
      for (let q = 0; q < 3; q++) S.cone(g, wm(M.bone, W), T(path[q]), rad[q], T(path[q + 1]), rad[q + 1], { part: pp, tone: q % 2 ? 0.2 : 0.5 });
    }
  }
  // ---------- голова: глубокий капюшон с высоким острием назад, бледное лицо, светящиеся глаза, седые пряди ----------
  {
    const g = S.group(1.2);
    const HC = 44.2;
    S.cone(g, wm(M.face, W), T([0, 1.2, 36.4], true), 1.7, H([0, 1.6, 41.0]), 1.7, { part: S.newPart(), tone: -0.2 });
    S.ell(g, wm(M.robe, W), H([0, -1.8, HC + 0.4]), [5.9, 5.6, 6.2], axes(HV), { big: true, tone: 0.1 });
    S.cone(g, wm(M.robe, W), H([0, -1.8, HC + 3.0]), 4.3, H([0, -8.4, HC + 10.4]), 0.1, { part: S.newPart(), tone: 0.25 });
    S.ell(g, wm(M.black, W), H([0, 2.2, HC - 0.2]), [4.6, 3.4, 5.2], axes(HV), { part: S.newPart(), tone: -0.4 });
    S.ell(g, wm(M.face, W), H([0, 3.6, HC - 1.2]), [3.1, 2.4, 4.0], axes(HV), { part: S.newPart(), tone: 0.15 });
    S.cone(g, wm(M.face, W), H([0, 3.8, HC - 3.8]), 1.9, H([0, 5.0, HC - 6.4]), 0.5, { part: S.newPart(), tone: 0.1 });
    S.ell(g, wm(M.face, W), H([0, 5.2, HC - 1.4]), [0.8, 1.0, 1.6], axes(HV), { part: S.newPart(), tone: 0.25 });
    for (const s of [1, -1]) {
      S.cone(g, M.teal, H([s * 4.3, 2.2, HC - 4.2]), 0.7, H([s * 4.9, 2.6, HC + 4.6]), 0.55, { part: S.newPart(), tone: 0.2 });
      S.cone(g, wm(M.teal, W), H([s * 4.9, 2.6, HC + 4.6]), 0.55, H([s * 3.2, 1.4, HC + 9.4]), 0.1, { part: S.newPart(), tone: 0.3 });
      S.cone(g, wm(M.bone, W), H([s * 2.6, 4.2, HC - 3.6]), 0.55, T([s * 3.2, 4.0, 35.6]), 0.2, { part: S.newPart(), tone: 0.3 });
    }
    S.ell(g, wm(M.robe, W), H([0, 4.4, HC + 3.8]), [4.8, 2.0, 1.8], axes(HV), { part: S.newPart(), tone: 0.1 });
    S.stamps.push({ at: H([0, 6.0, HC + 0.2]), n: HV([0, 1, 0]), px: ST_EYES, colors: keys, glow: GLOW_KEYS, halo: GLOWC[2], depthTol: 2.6, minFacing: 0.2 });
    S.stamps.push({ at: H([0, 6.2, HC - 3.8]), n: HV([0, 1, 0.1]), px: ST_MOUTH, colors: keys, depthTol: 2.6, minFacing: 0.1 });
  }

  // ---------- частицы и эффекты ----------
  if (p.ring > 0.02) X.rings.push({ c: p.ringAt ?? [pel[0], pel[1], 0], r: 3 + 22 * p.ring, k: 1 - p.ring });
  if (p.flash > 0.02) X.flash = { at: p.flashAt ?? add(pel, [0, 6, 30]), k: p.flash };
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) X.dust.push({ at: [pel[0] + (i ? -6 : 6), pel[1] + 6, 0], k: p.dust[i] });
  if (p.swirl > 0.02) X.swirl = { c: [pel[0], pel[1], 0], k: p.swirl, ph: p.swirlPh };
  if (p.stars > 0.02) X.stars = { at: H([0, 0, 55]), k: p.stars };
  // тело — в двойном разрешении (K·RS), слои 2D — в пикселях кадра 1× (K)
  scaleScene(S, K * RS);
  const sk = (v: V3) => mul(v, K);
  if (X.sigil) X.sigil = { ...X.sigil, c: sk(X.sigil.c), r: X.sigil.r * K };
  X.rings.forEach((r) => { r.c = sk(r.c); r.r *= K; });
  if (X.flash) X.flash.at = sk(X.flash.at);
  X.dust.forEach((d) => (d.at = sk(d.at)));
  if (X.swirl) X.swirl.c = sk(X.swirl.c);
  X.sparks.forEach((q) => (q.at = sk(q.at)));
  if (X.stars) X.stars.at = sk(X.stars.at);
  X.glints = X.glints.map(sk);
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
/** Круг-печать за спиной: два кольца рун, засечки по кругу вращаются; рисуется только на пустом фоне. */
function drawSigil(c: Ctx, s: { c: V3; r: number; ph: number; k: number }) {
  const [cx, cy] = scr(CAM, toView(c.view, s.c));
  const draw = (x: number, y: number, col: RGBA) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 1 || y < 1 || x >= FW - 1 || y >= FH - 1 || c.img.alpha(x, y)) return;
    c.img.set(x, y, col);
    c.emis.set(x, y, col);
  };
  const tone = (k: number) => GLOWC[clamp(Math.round(k), 1, 4)];
  const n1 = Math.ceil(s.r * 7);
  for (let i = 0; i < n1; i++) {
    const a = (i / n1) * TAU;
    draw(cx + Math.cos(a) * s.r, cy + Math.sin(a) * s.r, tone(2 + 1.4 * s.k));
    draw(cx + Math.cos(a) * s.r * 0.8, cy + Math.sin(a) * s.r * 0.8, i % 3 === 0 ? tone(2.4 + s.k) : tone(1.4));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + s.ph * TAU;
    for (const rr of [0.88, 0.94]) draw(cx + Math.cos(a) * s.r * rr, cy + Math.sin(a) * s.r * rr, tone(3 + (i % 2)));
  }
}
function drawRing(c: Ctx, r: { c: V3; r: number; k: number }, back: boolean) {
  const steps = Math.ceil(r.r * 10);
  const cv = toView(c.view, r.c);
  for (let s = 0; s < steps; s++) {
    const a = (s / steps) * TAU;
    if (Math.sin(a * 5 + r.r * 0.4) < -1.2 + 1.3 * (1 - r.k)) continue;
    const pv = toView(c.view, [r.c[0] + Math.cos(a) * r.r, r.c[1] + Math.sin(a) * r.r, 0]);
    if (pv[1] < cv[1] !== back) continue;
    const [sx, sy] = scr(CAM, pv);
    const x = Math.floor(sx), y = Math.floor(Math.min(sy, CAM.GY + 2));
    if (x < 1 || y < 2 || x >= FW - 1 || y >= FH - 1) continue;
    const i = y * FW + x;
    if (!back && c.prim[i] >= 0 && c.t[i] < depthOf(pv) - 0.5) continue;
    if (back && c.img.alpha(x, y)) continue;
    c.img.set(x, y - 1, SAND[r.k > 0.55 ? 4 : 3]);
    c.img.set(x, y, SAND[r.k > 0.3 ? 2 : 1]);
  }
}
function drawFlash(c: Ctx, f: { at: V3; k: number }) {
  const v = toView(c.view, f.at);
  const [sx, sy] = scr(CAM, v);
  const L = Math.round(2 + 3 * f.k);
  const x = clamp(Math.floor(sx), L + 2, FW - 3 - L), y = clamp(Math.floor(sy), L + 2, FH - 4);
  const dz = depthOf(v);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 4 : r <= L - 1 ? 3 : 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) put(c, x + dx * r, y + dy * Math.min(r, 2), FIRE[tone], dz, true);
  }
  if (f.k > 0.5) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(c, x + dx * 2, y + dy, FIRE[3], dz, true);
  put(c, x, y, FIRE[4], dz, true);
}
/** Огненный след посоха — полумесяц: изогнутая дуга, яркая белая сердцевина, расширяется к голове и истончается в хвост, искры по краю. */
function drawTrail(c: Ctx, pts: V3[]) {
  const vp = pts.map((q) => toView(c.view, q));
  const sp0 = vp.map((q) => scr(CAM, q));
  const [fx, fy] = sp0[0], [lx, ly] = sp0[sp0.length - 1];
  const cl = Math.hypot(lx - fx, ly - fy) || 1;
  const nx = -(ly - fy) / cl, ny = (lx - fx) / cl;
  const sign = ny > 0 ? -1 : 1;
  const sp = sp0.map(([x, y], i) => { const u = i / (sp0.length - 1); const b = 0.3 * cl * Math.sin(Math.PI * u) * sign; return [x + nx * b, y + ny * b] as [number, number]; });
  const total = sp.length - 1;
  for (let k = 0; k < total; k++) {
    const [x0, y0] = sp[k], [x1, y1] = sp[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s++) {
      const u = (k + s / steps) / total;
      const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
      const w = 0.4 + 2.8 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.1)), 1.4) * (0.3 + 0.7 * u);
      const dz = lerp(depthOf(vp[k]), depthOf(vp[k + 1]), s / steps);
      for (let dy = -w; dy <= w + 0.01; dy += 0.5) for (let dx = -w; dx <= w + 0.01; dx += 0.5) {
        if (dx * dx + dy * dy > w * w) continue;
        const e = Math.hypot(dx, dy) / Math.max(0.5, w);
        const tone = u < 0.3 ? (e < 0.5 ? 2 : 1) : e < 0.35 ? 4 : e < 0.65 ? 3 : 2;
        if (u < 0.3 && ((Math.floor(x) + Math.floor(y)) & 1)) continue;
        put(c, x + dx, y + dy, FIRE[tone], dz, true);
      }
      if (u > 0.35 && hash01(k, s, 41) < 0.12) put(c, x + (hash01(k, s, 7) - 0.5) * 9, y + (hash01(k, s, 9) - 0.5) * 7, FIRE[4], dz, true);
    }
  }
}
function drawDust(c: Ctx, d: { at: V3; k: number }) {
  const [cx, cy0] = scr(CAM, toView(c.view, d.at));
  const cy = Math.min(cy0, CAM.GY + 1);
  const t = 1 - d.k;
  for (let j = 0; j < 2; j++) {
    const dir = j ? 1 : -1;
    const px = cx + dir * (3 + 5 * t), py = cy - t * 1.4;
    const rx = 1.8 + 1.5 * d.k, ry = Math.max(1, rx * 0.55);
    for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
      const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry;
      if (dx * dx + dy * dy > 1 || x < 1 || y < 1 || x >= FW - 1 || y >= FH - 1) continue;
      c.img.set(x, y, SAND[dy > 0.25 ? 2 : dx + dy < -0.5 ? 4 : 3]);
    }
  }
}
/** Песчаный вихрь у ног: две-три ленты частиц по эллипсу, поднимаются спиралью; задняя половина — под телом, передняя — над. */
function drawSwirl(c: Ctx, sw: { c: V3; k: number; ph: number }) {
  const cv = toView(c.view, sw.c);
  const [cx, cy] = scr(CAM, cv);
  for (let band = 0; band < 3; band++) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + sw.ph * TAU * (band % 2 ? -1 : 1) + band * 1.9;
      const rise = ((i / n + band / 3 + sw.ph * 0.5) % 1) * (22 * sw.k);
      const rr = (10 + 5 * (1 - rise / 24)) * (0.75 + 0.25 * sw.k);
      const x = cx + Math.cos(a) * rr, y = cy - rise + Math.sin(a) * rr * 0.34 - 1;
      const front = Math.sin(a) > 0;
      const col = SAND[front ? 4 - (i % 2) : 2 + (i % 2)];
      const X0 = Math.floor(x), Y0 = Math.floor(y);
      if (X0 < 1 || Y0 < 1 || X0 >= FW - 1 || Y0 >= FH - 1) continue;
      if (!front && c.img.alpha(X0, Y0)) continue;
      c.img.set(X0, Y0, col);
      if (rise < 12 * sw.k && front) c.img.set(X0 + 1, Y0, SAND[2]);
    }
  }
}
/** Язычки пламени над жемчужиной посоха + искры. */
function drawSparks(c: Ctx, sp: { at: V3; k: number }) {
  const v = toView(c.view, sp.at);
  const [x0, y0] = scr(CAM, v);
  const dz = depthOf(v) - 2;
  const k = sp.k;
  const n = 5;
  for (let j = 0; j < n; j++) {
    const ph = (j * 0.37 + (c.t[0] ? 0 : 0));
    const hgt = Math.round((2 + 4 * k) * (0.6 + 0.4 * hash01(j, Math.round(x0), 5)));
    const x = Math.round(x0 + (j - 2) * 1.2);
    for (let h = 0; h < hgt; h++) {
      const u = h / Math.max(1, hgt - 1);
      put(c, x + Math.round(Math.sin(u * 3 + j + ph) * 0.8), y0 - 1 - h - Math.abs(j - 2) * 0.5, FIRE[u < 0.3 ? 4 : u < 0.7 ? 3 : 2], dz, true);
    }
  }
  for (const [dx, dy] of [[-3, -4], [3, -5], [0, -8], [-2, -7]]) if (k > 0.5) put(c, x0 + dx, y0 + dy, FIRE[4], dz, true);
  put(c, x0, y0, FIRE[4], dz, true);
  put(c, x0 - 1, y0, FIRE[3], dz, true); put(c, x0 + 1, y0, FIRE[3], dz, true);
}
function drawStars(c: Ctx, s: { at: V3; k: number }, ph: number) {
  const v = toView(c.view, s.at);
  const [cx, cy] = scr(CAM, v);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + ph * TAU;
    const x = Math.round(cx + Math.cos(a) * 9), y = Math.round(cy + Math.sin(a) * 3);
    const front = Math.sin(a) > 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(c, x + dx, y + dy, GLOWC[dx === 0 && dy === 0 ? 4 : front ? 3 : 2], -99, true);
  }
}
function drawGlint(c: Ctx, at: V3) {
  const v = toView(c.view, at);
  const [x, y] = scr(CAM, v);
  const dz = depthOf(v) - 2;
  put(c, x - 1, y - 2, GLOWC[4], dz, true);
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
export function renderMir(view: View, pose: Pose): { img: PC; emis: PC } {
  const { S, X } = build(pose, view);
  const R0 = renderScene(CAMR, S, view, OUT);
  const D = downscale(R0);
  const img = D.img;
  const emis = D.emis;
  const c: Ctx = { img, emis, t: D.t, prim: D.prim, view };
  for (const r of X.rings) drawRing(c, r, true);
  thicken(img, OUT, 3, [...GLOWC, ...FIRE, ...SAND, ...BONE]);
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
    const RIM: RGBA = [150, 195, 245, 255];
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
  // слои без контура — поверх готового тела
  if (X.sigil) void 0;
  if (X.swirl) drawSwirl(c, X.swirl);
  for (const r of X.rings) drawRing(c, r, false);
  if (pose.trail) drawTrail(c, pose.trail.map((q) => mul(q, K)));
  for (const g of X.glints) drawGlint(c, g);
  for (const sp of X.sparks) drawSparks(c, sp);
  if (X.stars) drawStars(c, X.stars, pose.t);
  if (X.flash) drawFlash(c, X.flash);
  for (const d of X.dust) drawDust(c, d);
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
    if (k === "trail" || k === "flashAt" || k === "ringAt") continue;
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
const TREMBLE = [0, 1, 0, -1];
const windPoses = (R0: Pose, wind: Partial<Pose>, seed: number, n = 4) => keyed(R0, [{ f: 0, p: {} }, { f: n - 1, p: wind, ease: easeInOut }], n, seed);
function holdPoses(R0: Pose, wind: Partial<Pose>, seed: number, n: number, mod: (i: number) => Partial<Pose>) {
  const base = { ...R0, ...wind } as Pose;
  return Array.from({ length: n }, (_, i) => ({ ...base, t: i / n, seed: seed + i, ...mod(i) }));
}

const rv = (view: View) => view === "side";
const hnd = (a: V3, b: V3): [V3, V3] => [a, b];
const Wv = (view: View, v: V3): V3 => v;

/** Покой: дыхание по пикселю (грудь, плечи, голова), подол и цепи качаются, шлейф ведёт кончиком, глаза дышат. */
function idlePoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const sway = [0, 0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
  const tail = [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0];
  const arm = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    return { ...R0, t, seed: 100 + i, chest: chest[i], headZ: head[i] - chest[i], sway: sway[i], tail: tail[i], wave: t, waveAmp: 1, glow: 1 + 0.25 * Math.sin(t * TAU), armLift: [arm[i], arm[(i + 6) % 12]] as [number, number] };
  });
}
/** Ходьба: плавное скольжение, подол и цепи колышутся, склянка у бедра. */
function walkPoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const bob = [0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0];
  const swayX = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0];
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    const fw = Math.sin(TAU * u);
    return {
      ...R0, t: u, seed: 150 + i,
      root: [side ? 0 : swayX[i], 0, 0] as V3, bob: bob[i] * PXM,
      kick: [Math.max(0, Math.sin(TAU * u)) - 0.2, Math.max(0, Math.sin(TAU * u + Math.PI)) - 0.2] as [number, number],
      sway: [0, 1, 1, 0, -1, -1][i % 6], tail: [0, 1, 2, 2, 1, 0][i % 6], wave: u * 2, waveAmp: 1.4,
      hand: hnd(add(R0.hand[0], [0, side ? 1.6 * fw : 0, 0]), add(R0.hand[1], [0, side ? -1.6 * fw : 0, 0])),
      dust: [i === 1 ? 0.4 : i === 7 ? 0.4 : 0, 0] as [number, number],
    };
  });
}
/** «Склянки»: правая рука заводится за плечо со склянкой, бросок вперёд-вниз (кадр 5), склянка улетает дугой, рука доводит. */
function vialKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { vial: [1, 0], pitch: -0.1, hp: -0.12, yaw: side ? 0.1 : -0.22, glow: 1.4, armLift: [0, 0], hand: hnd(side ? [11, -5, 44] : [13, -4, 43], R0.hand[1]), pole: [[1, 0.4, 0.2], [-1, -0.5, -0.3]] };
  const hit: Partial<Pose> = { pitch: 0.16, hp: 0.12, yaw: side ? -0.05 : 0.2, glow: 1.5, hand: hnd(side ? [9, 14, 36] : [8, 14, 35], R0.hand[1]), vial: [0, 0], flash: 0.6, pole: [[1, -0.2, -0.1], [-1, -0.5, -0.3]] };
  const keys: Key[] = [
    { f: 0, p: { vial: [1, 0] } }, { f: 1.5, p: { vial: [1, 0], pitch: -0.04, glow: 1.2, hand: hnd(side ? [10.6, 2, 38] : [12, 1, 38], R0.hand[1]) }, ease: easeInOut },
    { f: 3, p: wind, ease: easeInOut }, { f: 3.6, p: { ...wind, glow: 1.6 }, ease: linear },
    { f: 4, p: { ...hit, vial: [1, 0], flash: 0 }, ease: easeIn }, { f: 5, p: hit, ease: easeOut }, { f: 6, p: { ...hit, flash: 0, vial: [0, 0], pitch: 0.1 }, ease: easeOut },
    { f: 7, p: { vial: [0, 0] }, ease: easeInOut }, { f: 8, p: { vial: [0, 0] }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function vialWindPoses(view: View): Pose[] {
  const { R0, keys } = vialKeys(view);
  return keyed(R0, [keys[0], keys[1], keys[2], { ...keys[3], f: 3 }], 4, 500).map((p, i) => ({ ...p, glow: [1, 1.2, 1.4, 1.6][i] }));
}
function vialThrowPoses(view: View): Pose[] {
  const { R0, keys } = vialKeys(view);
  const poses = keyed(R0, [{ f: 0, p: keys[3].p }, keys[4], keys[5], keys[6], keys[7], keys[8]].map((k, i) => ({ ...k, f: [0, 1, 2, 3, 5, 7][i] })), 8, 540);
  const side = rv(view);
  const rel: V3 = side ? [9, 14, 36] : [8, 14, 35];
  poses[1].trail = [[12, -4, 43], rel, [9, 20, 40], [9, 28, 36]];
  poses[2].trail = [rel, [9, 22, 40], [9, 30, 38], [9, 36, 32]];
  poses[1].flashAt = add(rel, [0, 2, 3]);
  poses[1].flash = 0.8;
  poses[2].flash = 0;
  poses[1].dust = [0.4, 0];
  return poses;
}
/** «Котёл»: обе руки раскинуты вверх над котлом, цепи поднимаются, миазмы крутятся; держится по кругу, завершение — удар ладонями вниз. */
function cauldronKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const up: Partial<Pose> = {
    pitch: -0.08, hp: -0.16, bob: 0, glow: 1.5, swirl: 0.7, vial: [0, 0], armLift: [0, 0],
    hand: hnd(side ? [10, 5, 48] : [16.4, 3, 47], side ? [-10, 5, 47] : [-16.4, 3, 47]), pole: [[1, 0.1, 0.5], [-1, 0.1, 0.5]], sway: 1, tail: 1,
  };
  const hit: Partial<Pose> = { ...up, pitch: 0.14, hp: 0.1, bob: -1 * PXM, glow: 1.6, swirl: 1, flash: 1, ring: 0.08, dust: [1, 1], hand: hnd(side ? [9, 12, 30] : [8, 13, 30], side ? [-9, 11, 29] : [-8, 13, 30]), pole: [[1, -0.4, -0.2], [-1, -0.4, -0.2]] };
  const keys: Key[] = [
    { f: 0, p: up }, { f: 1, p: { ...up, bob: 1 * PXM }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, ring: 0.4, dust: [0.6, 0.6] }, ease: linear }, { f: 4, p: { ...hit, flash: 0, ring: 0.8, dust: [0.3, 0.3], swirl: 0.8 }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 0, dust: [0, 0], swirl: 0.4, glow: 1.2 }, ease: linear }, { f: 7, p: { swirl: 0, vial: [0, 0] }, ease: easeInOut },
  ];
  return { R0, up, keys };
}
function cauldronWindPoses(view: View): Pose[] {
  const { R0, up } = cauldronKeys(view);
  const side = rv(view);
  return keyed(R0, [{ f: 0, p: {} }, { f: 3, p: { ...up, vial: [0, 0] }, ease: easeInOut }], 4, 600).map((p, i) => ({ ...p, swirl: [0.1, 0.3, 0.5, 0.7][i], swirlPh: i * 0.1, vial: [0, 0] as [number, number], sway: side ? 0 : p.sway }));
}
function cauldronHoldPoses(view: View): Pose[] {
  const { R0, up } = cauldronKeys(view);
  return Array.from({ length: 4 }, (_, i) => ({
    ...R0, ...up, t: i / 4, seed: 620 + i, swirlPh: 0.4 + i * 0.125, swirl: 0.8 + 0.1 * (i % 2), glow: [1.4, 1.6, 1.45, 1.6][i], armLift: [TREMBLE[i], TREMBLE[(i + 2) % 4]] as [number, number],
    chest: i % 2 ? 1 : 0, sway: [1, 0, -1, 0][i], tail: [1, 2, 1, 0][i], wave: i / 4, waveAmp: 1,
  }));
}
function cauldronCastPoses(view: View): Pose[] {
  const { R0, keys } = cauldronKeys(view);
  const poses = keyed(R0, keys, 6, 640).map((p, i) => ({ ...p, swirlPh: i * 0.11 }));
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  poses[2].flashAt = [0, 14, 28];
  return poses;
}
/** «Мутаген»: склянки из рукавов к груди, вскинуты над головой, раздавлены оземь — слизь кольцом, миазмы. */
function mutagenKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const chestP: Partial<Pose> = { pitch: -0.06, hp: -0.1, glow: 1.4, vial: [1, 1], hand: hnd(side ? [6, 11, 36] : [5, 10, 36], side ? [-6, 10, 35] : [-5, 10, 35]), pole: [[1, -0.2, -0.5], [-1, -0.2, -0.5]] };
  const high: Partial<Pose> = { ...chestP, pitch: -0.12, hp: -0.26, glow: 1.6, swirl: 0.5, hand: hnd(side ? [9, 4, 50] : [12, 3, 50], side ? [-9, 4, 49] : [-12, 3, 49]), pole: [[1, 0.2, 0.4], [-1, 0.2, 0.4]] };
  const smash: Partial<Pose> = { ...high, pitch: 0.16, hp: 0.14, bob: -1 * PXM, vial: [0, 0], flash: 1, ring: 0.08, dust: [1, 1], swirl: 1, hand: hnd(side ? [8, 15, 26] : [7, 14, 27], side ? [-8, 14, 25] : [-7, 14, 27]), pole: [[1, -0.4, -0.2], [-1, -0.4, -0.2]] };
  const keys: Key[] = [
    { f: 0, p: chestP }, { f: 1.5, p: { ...high, glow: 1.5, flash: 0 }, ease: easeOut }, { f: 3, p: { ...high, glow: 1.7 }, ease: easeInOut },
    { f: 4, p: smash, ease: easeIn }, { f: 5, p: { ...smash, flash: 0, ring: 0.45, dust: [0.6, 0.6] }, ease: linear },
    { f: 6, p: { ...smash, flash: 0, ring: 0.85, dust: [0.2, 0.2], swirl: 0.8 }, ease: linear }, { f: 7, p: { vial: [0, 0], swirl: 0 }, ease: easeInOut },
  ];
  return { R0, chestP, keys };
}
function mutagenWindPoses(view: View): Pose[] {
  const { R0, chestP } = mutagenKeys(view);
  return keyed(R0, [{ f: 0, p: {} }, { f: 3, p: chestP, ease: easeInOut }], 4, 800).map((p, i) => ({ ...p, vial: [[0, 0.4, 1, 1][i], [0, 0.4, 1, 1][i]] as [number, number] }));
}
function mutagenCastPoses(view: View): Pose[] {
  const { R0, keys } = mutagenKeys(view);
  const poses = keyed(R0, keys, 8, 840).map((p, i) => ({ ...p, swirlPh: i * 0.12 }));
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  poses[2].flashAt = [0, 4, 53];
  poses[4].flashAt = [0, 15, 26];
  return poses;
}
/** Оглушение: покачивается, капюшон свесился набок, руки опущены, над головой кружат синие искры (8 к/с по кругу). */
function stunPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const rl = [0, 0.05, 0.08, 0.05, 0, -0.05, -0.08, -0.05];
  return Array.from({ length: 8 }, (_, i) => ({
    ...R0, t: i / 8, seed: 1500 + i, roll: rl[i], hp: 0.3, hr: -rl[i] * 1.4 + 0.12, pitch: 0.1, bob: -1 * PXM, glow: 0.35, stars: 1,
    root: [[0, 1, 1, 1, 0, -1, -1, -1][i], 0, 0] as V3, swirlPh: i / 8, sway: [0, 1, 1, 0, 0, -1, -1, 0][i], tail: [0, 1, 2, 2, 1, 0, 0, 0][i], wave: i / 8, waveAmp: 1,
  }));
}
/** Гибель: отшатнулась, склянки падают из рук, оседает на колени, капюшон клонится вперёд, глаза и руны гаснут, цепи ложатся. */
function deathPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const recoil: Partial<Pose> = { pitch: -0.14, hp: -0.3, bob: 1 * PXM, glow: 1.6, sway: 1, flash: 0, vial: [0, 0], hand: hnd([13, 1, 42], [-13, 1, 40]), pole: [[1, 0.2, 0.3], [-1, 0.2, 0.3]] };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1, p: recoil, ease: easeOut }, { f: 2, p: { ...recoil, pitch: 0.06, hp: 0, bob: 0, glow: 1.1, vial: [0, 0] }, ease: easeInOut },
    { f: 3, p: { vial: [0, 0], hand: hnd([10, 8, 22], [-10, 7, 21]), pitch: 0.14, glow: 0.9, kneel: 0.3 }, ease: easeIn },
    { f: 4, p: { vial: [0, 0], hand: hnd([9.6, 8, 16], [-9.6, 7, 15]), pitch: 0.22, glow: 0.7, kneel: 0.75, dust: [1, 1] }, ease: easeIn },
    { f: 5, p: { vial: [0, 0], hand: hnd([9, 8, 13], [-9, 8, 12]), pitch: 0.3, hp: 0.2, glow: 0.5, kneel: 1, dust: [0.5, 0.5] }, ease: easeOut },
    { f: 8, p: { vial: [0, 0], hand: hnd([8.6, 9, 12], [-8.6, 9, 11]), pitch: 0.44, hp: 0.5, glow: 0.2, kneel: 1, wither: 0.3, tail: 0 }, ease: easeInOut },
    { f: 13, p: { vial: [0, 0], hand: hnd([8.4, 9, 11.5], [-8.4, 9, 10.5]), pitch: 0.5, hp: 0.6, hr: 0.1, glow: 0, kneel: 1, wither: 0.6 }, ease: easeOut },
  ];
  return keyed(R0, keys, 14, 1300);
}

export type MirAnim = "idle" | "walk" | "vialWind" | "vialThrow" | "cauldronWind" | "cauldronHold" | "cauldronCast" | "mutagenWind" | "mutagenCast" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: MirAnim; hit?: number };
const ANIM_ORDER: [MirAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["vialWind", { n: 4, fps: 12, loop: false, ru: "замах склянки" }],
  ["vialThrow", { n: 8, fps: 12, loop: false, ru: "бросок склянки", hit: 1 }],
  ["cauldronWind", { n: 4, fps: 12, loop: false, ru: "зов котла", next: "cauldronHold" }],
  ["cauldronHold", { n: 4, fps: 12, loop: true, ru: "каст у котла (4 с)", next: "cauldronCast" }],
  ["cauldronCast", { n: 6, fps: 12, loop: false, ru: "котёл: исцеление", hit: 2 }],
  ["mutagenWind", { n: 4, fps: 12, loop: false, ru: "склянки к груди" }],
  ["mutagenCast", { n: 8, fps: 12, loop: false, ru: "мутаген", hit: 4 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const MIR_ANIMS = {} as Record<MirAnim, AnimDef>;
{
  let col = 0;
  for (const [k, a] of ANIM_ORDER) { MIR_ANIMS[k] = { ...a, col }; col += a.n; }
}
export const MIR_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
const POSES: Record<MirAnim, (v: View) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v), vialWind: vialWindPoses, vialThrow: vialThrowPoses,
  cauldronWind: cauldronWindPoses, cauldronHold: cauldronHoldPoses, cauldronCast: cauldronCastPoses,
  mutagenWind: mutagenWindPoses, mutagenCast: mutagenCastPoses, stun: stunPoses, death: deathPoses,
};
void Wv;

// ---------------- котёл: спрайт-объект ----------------
export const CAULDRON = { w: 48, h: 48, ax: 24, ay: 42, n: 8, fps: 10 };
type Layers = { img: PC; emis: PC };
/** Один кадр котла: boil=false — тихое бульканье и пар; boil=true — кипит (перед лечением): пузыри крупнее, пар столбом, брызги. */
function cauldronFrame(i: number, boil: boolean): Layers {
  const w = CAULDRON.w, h = CAULDRON.h;
  const img = new PC(w, h), emis = new PC(w, h);
  const mask = new Uint8Array(w * h);
  const set = (x: number, y: number, c: RGBA, e = false) => {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
    img.set(x, y, c);
    if (e) emis.set(x, y, c);
  };
  const cx = 24, ry0 = 24;
  // ножки
  for (const [lx, ly] of [[cx - 10, 38], [cx + 10, 38], [cx, 40]] as [number, number][]) {
    for (let y = ly; y < 42; y++) for (let x = lx - 2; x <= lx + 2 - (y - ly > 2 ? 1 : 0); x++) { set(x, y, IRON[x <= lx - 1 ? 3 : 1]); mask[y * w + x] = 1; }
  }
  // брюхо
  for (let y = ry0; y <= 40; y++) {
    const t = (y - ry0) / 16;
    const hw = 14.6 * Math.sqrt(Math.max(0, 1 - t * t * 0.86));
    for (let x = Math.ceil(cx - hw); x <= cx + hw; x++) {
      const nx = (x + 0.5 - cx) / Math.max(1, hw);
      let tone = 2.5 - nx * 1.5 - t * 0.9 + (nx > 0.7 ? -0.4 : 0);
      if (Math.abs(nx + 0.55) < 0.12 && t < 0.7) tone += 1.0;
      set(x, y, IRON[clamp(Math.round(tone), 0, 4)]);
      mask[y * w + x] = 1;
    }
  }
  // пояс: ржавый обод, костяные бусины
  for (let y = 28; y <= 29; y++) {
    const t = (y - ry0) / 16, hw = 14.6 * Math.sqrt(1 - t * t * 0.86);
    for (let x = Math.ceil(cx - hw) + 1; x <= cx + hw - 1; x++) set(x, y, RUST[y === 28 ? 3 : 1]);
  }
  for (const dx of [-10, -5, 0, 5, 10]) { set(cx + dx, 31, BONE[4]); set(cx + dx, 32, BONE[2]); set(cx + dx - 1, 31, BONE[3]); }
  // цепи по бокам и ручки
  for (const s of [-1, 1]) {
    for (let k = 0; k < 14; k++) {
      const x = cx + s * (15 + Math.sin(k * 0.22) * 2 + k * 0.05), y = 25 + k;
      set(x, y, RUST[k % 2 ? 2 : 3]); if (k % 3 === 0) set(x + s, y, RUST[1]);
      mask[Math.floor(y) * w + Math.floor(x)] = 1;
    }
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2]] as [number, number][]) { set(cx + s * 15 + (s > 0 ? dx : -dx), 21 + dy, IRON[3]); mask[(21 + dy) * w + cx + s * 15 + (s > 0 ? dx : -dx)] = 1; }
  }
  // задняя половина обода
  for (let x = cx - 15; x <= cx + 15; x++) {
    const u = (x - cx) / 15;
    const y = ry0 - 4.6 * Math.sqrt(Math.max(0, 1 - u * u));
    for (let yy = Math.round(y); yy <= ry0; yy++) { set(x, yy, IRON[yy === Math.round(y) ? 4 : 2]); mask[yy * w + x] = 1; }
  }
  // контур тела
  const out: [number, number][] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (mask[y * w + x]) continue;
    if (mask[y * w + x - 1] || mask[y * w + x + 1] || mask[(y - 1) * w + x] || mask[(y + 1) * w + x]) out.push([x, y]);
  }
  for (const [x, y] of out) img.set(x, y, OUT);
  // жижа в зеве
  const ph = i / CAULDRON.n;
  const lr = 13, lry = 3.7;
  for (let y = Math.floor(ry0 - lry - 1); y <= ry0 + lry + 1; y++) for (let x = cx - lr - 1; x <= cx + lr + 1; x++) {
    const dx = (x + 0.5 - cx) / lr, dy = (y + 0.5 - (ry0 + 0.3)) / lry;
    const d = dx * dx + dy * dy;
    if (d > 1) continue;
    const sw = Math.sin((dx * 5 + dy * 3) + ph * TAU * (boil ? 2 : 1)) * 0.5 + 0.5;
    const e = d > 0.72;
    const tone = e ? 1 : boil ? (sw > 0.6 ? 4 : sw > 0.3 ? 3 : 2) : sw > 0.7 ? 3 : 2;
    set(x, y, FIRE[tone], true);
  }
  // передняя кромка зева: свес, поверх жижи
  for (let x = cx - 15; x <= cx + 15; x++) {
    const u = (x - cx) / 15;
    const y = ry0 + 4.6 * Math.sqrt(Math.max(0, 1 - u * u));
    set(x, Math.round(y) - 1, IRON[4]); set(x, Math.round(y), IRON[3 - (u > 0.3 ? 1 : 0)]);
  }
  // пузыри
  const nb = boil ? 7 : 3;
  for (let j = 0; j < nb; j++) {
    const u = (ph * (boil ? 2 : 1) + j / nb) % 1;
    const bx = cx + Math.sin(j * 2.7 + 1) * 9 + (j % 2 ? 1 : -1);
    const by = ry0 + Math.cos(j * 1.9) * 1.6 - (boil ? 4 : 2) * Math.sin(Math.PI * Math.min(1, u)) * 0.6;
    const r = (boil ? 0.9 : 0.6) + (boil ? 1.6 : 1.2) * Math.sin(Math.PI * u);
    if (u > 0.86) { for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [-1, -1], [1, -1]] as [number, number][]) set(bx + dx, by + dy, FIRE[4], true); continue; }
    for (let y = Math.floor(by - r); y <= by + r; y++) for (let x = Math.floor(bx - r); x <= bx + r; x++) {
      const dd = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / Math.max(0.6, r);
      if (dd <= 1) set(x, y, FIRE[dd > 0.75 ? 4 : 3], true);
    }
    set(bx - r * 0.4, by - r * 0.4, [255, 255, 235, 255], true);
  }
  // брызги при кипении
  if (boil) for (let j = 0; j < 6; j++) {
    const u = (ph * 2 + j * 0.17) % 1;
    const sx = cx + (j - 2.5) * 4.2, sy = ry0 - 3 - 15 * Math.sin(Math.PI * u) * (0.6 + 0.4 * ((j * 7) % 3) / 2);
    set(sx, sy, FIRE[4], true); set(sx, sy + 1, FIRE[3], true);
  }
  // пар: клубы по спирали вверх, тают дерганием пикселей
  const np = boil ? 6 : 3;
  for (let k = 0; k < np; k++) {
    const v = (ph * (boil ? 2 : 1) + k / np) % 1;
    const px = cx + Math.sin(v * 5 + k * 2.1) * (2 + v * (boil ? 6 : 4)) + (k - np / 2) * (boil ? 1.6 : 1.2);
    const py = ry0 - 3 - v * (boil ? 25 : 15);
    const r = 1.2 + v * (boil ? 3.4 : 2.6);
    for (let y = Math.floor(py - r); y <= py + r; y++) for (let x = Math.floor(px - r); x <= px + r; x++) {
      const dd = Math.hypot(x + 0.5 - px, (y + 0.5 - py) * 1.2) / r;
      if (dd > 1) continue;
      if (v > 0.55 && ((x + y + i) & 1)) continue;
      if (v > 0.8 && ((x * 3 + y * 5 + k) % 3 === 0)) continue;
      set(x, y, SAND[v > 0.7 ? 2 : dd < 0.5 ? 4 : 3]);
    }
  }
  return { img, emis };
}
export function buildCauldron(): Layers & { calm: Layers[]; boil: Layers[] } {
  const img = new PC(CAULDRON.w * CAULDRON.n, CAULDRON.h * 2), emis = new PC(CAULDRON.w * CAULDRON.n, CAULDRON.h * 2);
  const calm: Layers[] = [], boil: Layers[] = [];
  for (let i = 0; i < CAULDRON.n; i++) {
    for (const [row, b, arr] of [[0, false, calm], [1, true, boil]] as [number, boolean, Layers[]][]) {
      const f = cauldronFrame(i, b);
      img.blit(f.img, i * CAULDRON.w, row * CAULDRON.h);
      emis.blit(f.emis, i * CAULDRON.w, row * CAULDRON.h);
      arr.push(f);
    }
  }
  return { img, emis, calm, boil };
}

/** Эффект мира «котёл» (спрайт-объект на касте «Котёл»): всплывает из земли (4 кадра), кипит по кругу (8), уходит в землю (4); слой 1 — над юнитами. */
export const FX = {
  cauldron: { w: 48, h: 48, ax: 24, ay: 42, n: 16, fps: 10, hit: 3, anims: { cauldronIn: { col: 0, n: 4, loop: false, hit: 3, fps: 10 }, cauldronBoil: { col: 4, n: 8, loop: true, fps: 10 }, cauldronOut: { col: 12, n: 4, loop: false, fps: 10 } } },
};
function buildCauldronFx(cz: ReturnType<typeof buildCauldron>): { img: PC; emis: PC } {
  const F = FX.cauldron;
  const img = new PC(F.w * F.n, F.h * 2), emis = new PC(F.w * F.n, F.h * 2);
  const put = (src: Layers, i: number, lim: number) => {
    const a = src.img.clone(), e = src.emis.clone();
    for (let y = 0; y < Math.min(F.h, lim); y++) for (let x = 0; x < F.w; x++) { a.clear(x, y); e.clear(x, y); }
    img.blit(a, i * F.w, F.h);
    emis.blit(e, i * F.w, F.h);
  };
  [0, 1, 2, 3].forEach((j) => put(cz.calm[j * 2], j, 42 - [10, 20, 28, 36][j]));
  for (let i = 0; i < 8; i++) put(cz.boil[i], 4 + i, 0);
  [0, 1, 2, 3].forEach((j) => put(cz.calm[j * 2 + 1], 12 + j, 42 - [36, 28, 18, 8][j]));
  return { img, emis };
}

// ---------------- листы, проверки, монтажи ----------------
interface Assets { hero: PC; terrain: PC; ref: PC | null; ref2: PC | null }
const heroAt = (A: Assets, row: number) => crop(A.hero, 0, row * 32, 32, 32);
type Sheets = { img: Record<MirAnim, PC>; emis: Record<MirAnim, PC> };
function animSheets(only?: MirAnim[], maxFrames = 99): { img: Record<MirAnim, PC>; emis: Record<MirAnim, PC> } {
  const img = {} as Record<MirAnim, PC>, emis = {} as Record<MirAnim, PC>;
  for (const [a, d] of ANIM_ORDER) {
    const I = new PC(N * d.n, FH * 3), E = new PC(N * d.n, FH * 3);
    if (!only || only.includes(a)) VIEWS.forEach((v, row) => POSES[a](v).slice(0, Math.min(d.n, maxFrames)).forEach((p, i) => {
      const r = renderMir(v, p);
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

/** Референс 04 → png: основной вид (по центру листа) и нижний ряд видов (сбоку и спереди), пропорции сохранены. */
function ensureRef(root: string, name: string, rect: [number, number, number, number], w: number, h: number): PC | null {
  const png = path.join(root, "tools", "out", "bosses139", name);
  const jpg = path.join(root, "tools", "out", "refs", "bosses-139", "04-brett-nuckles-gnashera.jpg");
  if (!fs.existsSync(png) && fs.existsSync(jpg) && process.platform === "win32") {
    const [x, y, rw, rh] = rect;
    const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${jpg}'); $b=New-Object System.Drawing.Bitmap ${w},${h}; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,(New-Object System.Drawing.Rectangle 0,0,${w},${h}),${x},${y},${rw},${rh},[System.Drawing.GraphicsUnit]::Pixel); $b.Save('${png}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  return fs.existsSync(png) ? loadPC(png) : null;
}
const nightRectPart = (c: PC, x: number, y: number, w: number, h: number) => nightRect(c, x, y, w, h);

/** Кадры галереи: покой ×4 стороны, бросок склянки, каст у котла, исцеление, мутаген (замах и удар), гибель. */
function gallery(sheets: Sheets): { img: PC; emis: PC; flip?: boolean }[] {
  const idle = (row: number, flip = false) => ({ img: crop(sheets.img.idle, 0, row * FH, N, FH), emis: crop(sheets.emis.idle, 0, row * FH, N, FH), flip });
  const pose = (a: MirAnim, i: number, v: View) => renderMir(v, POSES[a](v)[i]);
  return [
    idle(0), idle(1), idle(2), idle(2, true),
    pose("vialThrow", 1, "down"), pose("vialThrow", 2, "side"), pose("cauldronHold", 1, "down"), pose("cauldronCast", 2, "down"),
    pose("mutagenWind", 3, "down"), pose("mutagenCast", 3, "down"), pose("mutagenCast", 4, "side"), pose("death", 8, "down"),
  ];
}

/**
 * «Наш | референс»: сверху — ×1 и ×3 рядом с героем и котлом на траве (день и ночь), ниже — галерея умений ×3 (день и ночь),
 * затем жрица вниз и вбок ×7 (день, ночь) рядом с образцом 04 (основной вид и нижний ряд видов).
 */
function buildCompare(sheets: Sheets, A: Assets, cz: ReturnType<typeof buildCauldron>): PC {
  const k = 7;
  const H = FH * k;
  const refH = A.ref ? A.ref.h : H;
  const rowH = Math.max(H, refH);
  const items = gallery(sheets);
  const W = Math.max(items.length * (N * 3 + 8) + 60, 2 * N * k + 16 + 40 + (A.ref ? A.ref.w : 0) + 24 + (A.ref2 ? A.ref2.w : 0) + 24, 1700);
  const TOP = 12 + 4 * 0 + (90 + 90 + 90 + 90) + 60;
  const GAL = FH * 3 * 2 + 70;
  const c = new PC(W, TOP + GAL + 2 * (rowH + 70) + 40);
  fill(c, 0, 0, c.w, c.h, [30, 28, 34, 255]);
  const cI = (b: boolean, i = 0) => (b ? cz.boil : cz.calm)[i % CAULDRON.n];
  // ×1 и ×3: герой, жрица вниз, вверх, вбок, влево, котёл тихий и кипящий, день и ночь
  let y0 = 12;
  for (const [kk, night] of [[1, false], [1, true], [3, false], [3, true]] as [number, boolean][]) {
    const hh = (kk === 1 ? 90 : 90) * (kk === 1 ? 1 : 1) + 0;
    const hs = kk === 1 ? 90 : 90;
    void hh;
    text(c, `×${kk} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ · ЖРИЦА ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО · КОТЁЛ (ТИХО, КИПИТ)`, 24, y0, 2);
    const gh = (kk === 1 ? 86 : 86) * kk;
    const wG = (30 + 66 * 4 + 52 * 2 + 40) * kk + 40;
    const gy = y0 + 20;
    groundBg(c, A.terrain, 24, gy, Math.min(W - 48, wG), gh, kk, "grass");
    const yb = gy + (gh - 2 * kk);
    let x = 40;
    const lights: { emis: PC; x: number; y: number; flip?: boolean }[] = [];
    const put1 = (img: PC, emis: PC | null, feet: number, wd: number, flip = false, sh = 6.5) => {
      shadowBlob(c, x + (img.w / 2) * kk, yb - 0.5 * kk, Math.min(16, (img.w / 32) * sh) * kk, 2.4 * kk);
      const top = Math.round(yb - feet * kk);
      c.blit(scaleNN(img, kk, flip), x, top);
      if (emis) lights.push({ emis, x, y: top, flip });
      x += wd * kk;
    };
    const fr = (row: number) => crop(sheets.img.idle, 0, row * FH, N, FH), fe = (row: number) => crop(sheets.emis.idle, 0, row * FH, N, FH);
    put1(heroAt(A, 0), null, 30.4, 34);
    put1(fr(0), fe(0), CAM.GY, 66); put1(fr(1), fe(1), CAM.GY, 66); put1(fr(2), fe(2), CAM.GY, 66); put1(fr(2), fe(2), CAM.GY, 66, true);
    put1(cI(false, 2).img, cI(false, 2).emis, CAULDRON.ay, 52); put1(cI(true, 2).img, cI(true, 2).emis, CAULDRON.ay, 52);
    if (night) {
      nightRect(c, 24, gy, Math.min(W - 48, wG), gh);
      for (const l of lights) relight(c, l.emis, l.x, l.y, kk, l.flip);
    }
    y0 = gy + gh + 14;
    void hs;
  }
  // галерея умений ×3 день/ночь
  {
    const gy = y0 + 4;
    text(c, "ПОКОЙ: ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | БРОСОК СКЛЯНКИ ×2 | КАСТ У КОТЛА | ИСЦЕЛЕНИЕ | МУТАГЕН: СКЛЯНКИ, УДАР ×2 | ГИБЕЛЬ  (×3, ДЕНЬ / НОЧЬ)", 24, gy, 2);
    const gw = items.length * (N * 3 + 8) + 8;
    for (const [ni, night] of [false, true].entries()) {
      const yy = gy + 22 + ni * (FH * 3 + 6);
      fill(c, 24, yy, gw, FH * 3, night ? [38, 46, 74, 255] : [150, 156, 140, 255]);
      items.forEach((it, i) => {
        const ix = 24 + 8 + i * (N * 3 + 8);
        c.blit(scaleNN(it.img, 3, it.flip), ix, yy);
        if (night) { nightRectPart(c, ix, yy, N * 3, FH * 3); relight(c, it.emis, ix, yy, 3, it.flip); }
      });
    }
    y0 = gy + 22 + 2 * (FH * 3 + 6) + 20;
  }
  for (const night of [false, true]) {
    const y = y0 + 48 + (night ? rowH + 70 : 0);
    text(c, night ? "НАШ · НОЧЬ" : "НАШ · ДЕНЬ", 24, y - 36, 3);
    text(c, "РЕФЕРЕНС 04", 24 + 2 * N * k + 56, y - 36, 3);
    const oy = y + rowH - H;
    fill(c, 24, oy, 2 * N * k + 16, H, [150, 156, 140, 255]);
    for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) c.blit(scaleNN(crop(sheets.img.idle, 0, row * FH, N, FH), k), 24 + j * (N * k + 16), oy);
    if (night) {
      nightRect(c, 24, oy, 2 * N * k + 16, H);
      for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) relight(c, crop(sheets.emis.idle, 0, row * FH, N, FH), 24 + j * (N * k + 16), oy, k);
    }
    fill(c, 24 + 2 * N * k + 16 + 16, y, 4, rowH, [240, 232, 214, 255]);
    if (A.ref) c.blit(A.ref, 24 + 2 * N * k + 56, y);
    if (A.ref2) c.blit(A.ref2, 24 + 2 * N * k + 56 + (A.ref ? A.ref.w : 0) + 24, y);
  }
  return c;
}

export function writeMirArt(root: string, outDir: string, quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => { const f = path.join(outDir, name); c.save(f); files.push(f); return c; };
  const sheets = animSheets(quick ? ["idle"] : undefined, quick ? 1 : 99);
  const A: Assets = {
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
    ref: ensureRef(root, "ref-04.png", [787, 218, 2490, 2796], 480, 540),
    ref2: ensureRef(root, "ref-04b.png", [481, 3170, 3255, 2094], 700, 451),
  };
  const cz = buildCauldron();
  if (process.argv.includes("--sil")) {
    const sc = new PC(N * 10 + 30 + 500, 560);
    fill(sc, 0, 0, sc.w, sc.h, [200, 190, 160, 255]);
    for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) {
      const fr = crop(sheets.img.idle, 0, row * FH, N, FH);
      for (let y = 0; y < FH; y++) for (let x = 0; x < N; x++) if (fr.alpha(x, y)) fr.set(x, y, [20, 20, 24, 255]);
      sc.blit(scaleNN(fr, 5), j * (N * 5 + 10), 0);
    }
    if (A.ref) {
      const rf = A.ref.clone();
      for (let y = 0; y < rf.h; y++) for (let x = 0; x < rf.w; x++) { const q = rf.get(x, y)!; const lum = q[0] * 0.3 + q[1] * 0.6 + q[2] * 0.1; rf.set(x, y, lum < 140 ? [20, 20, 24, 255] : [200, 190, 160, 255]); }
      sc.blit(rf, N * 10 + 30, 0);
    }
    save(sc, "r55n-e-sil.png");
    return files;
  }
  save(buildCompare(sheets, A, cz), "r55n-e-compare.png");
  save(cz.img, "plg-cauldron.png");
  save(cz.emis, "plg-cauldron-glow.png");
  if (quick) return files;
  const cfx = buildCauldronFx(cz);
  save(cfx.img, "plg-fx-cauldron.png");
  save(cfx.emis, "plg-fx-cauldron-glow.png");
  const sheet = new PC(N * MIR_COLS, FH * 3), glow = new PC(N * MIR_COLS, FH * 3);
  for (const [a] of ANIM_ORDER) { sheet.blit(sheets.img[a], MIR_ANIMS[a].col * N, 0); glow.blit(sheets.emis[a], MIR_ANIMS[a].col * N, 0); }
  save(sheet, "plg-sheet.png");
  save(glow, "plg-glow.png");
  const rows = ["вниз", "вверх", "вбок"];
  const bad: string[] = [];
  for (let r = 0; r < 3; r++) for (let cI = 0; cI < MIR_COLS; cI++) {
    let hits = 0;
    for (let k2 = 0; k2 < FH; k2++) for (const [x, y] of [[0, k2], [N - 1, k2]]) { const q = sheet.get(cI * N + x, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    for (let k2 = 0; k2 < N; k2++) for (const y of [0, FH - 1]) { const q = sheet.get(cI * N + k2, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    if (hits) bad.push(`лист, ${rows[r]}, кадр ${cI + 1}: ${hits} px не цветом контура на краю`);
  }
  console.log(`  ${ID}: ${MIR_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 30).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; }
  else console.log("  проверки: край кадра чист");
  const Wp = 2000;
  const rowsP: Row[] = [];
  for (const [a] of ANIM_ORDER) rowsP.push(animRow(a, sheets, A, Wp));
  for (const a of ["idle", "cauldronHold"] as MirAnim[]) rowsP.push(animRow(a, sheets, A, Wp, true));
  save(stackRows(rowsP, Wp), "plg-pilot.png");
  return files;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/umb_plague_priestess.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const files = writeMirArt(root, path.join(root, "tools", "out", "bosses139"), process.argv.includes("--quick") || process.argv.includes("--sil"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void linear; void hex; void cross; void frameEdgeCuts; void frameHoles; void hash01; void scaleBox; void outlineStats; void mix; void depthOf; void easeIn;
/** Строка анимации ×2: вид вниз и вбок, герой для масштаба, день или ночь. */
function animRow(a: MirAnim, sheets: Sheets, A: Assets, W: number, night = false): Row {
  const d = MIR_ANIMS[a];
  const k = 2;
  return {
    h: FH * k * 2 + 44,
    draw: (c, y0) => {
      text(c, `×2 · ${d.ru} · ${d.n} КАДРОВ · ${d.fps} К/С${d.loop ? " · ПО КРУГУ" : ""}${d.next ? ` · → ${MIR_ANIMS[d.next].ru}` : ""}${d.hit !== undefined ? ` · УДАР — КАДР ${d.hit + 1}` : ""}${night ? " · НОЧЬ" : ""}`, 16, y0 + 8);
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
