/**
 * Задача 139, босс кольца: ворон пустоши (запад, слот r59s, Пустошь Павших, ур. 59, группа 3–4; карточка — docs/bosses-139.md, раздел 3.3 п. 4 и
 * «Раскладка референсов»). Образ — по референсу tools/out/refs/bosses-139/09.jpg (чумной доктор: широкополая сине-стальная шляпа, длинный
 * коричневый клюв-маска с жёлтыми очками, бирюзово-синий сюртук с шипованной грудью и жёлтыми лоскутами на плечах, перевязь, сумка, склянка с
 * синим зельем в левой руке, высокий посох-фонарь в правой, длинный подол) — только для сравнения: чужой арт в игру и в git не идёт.
 * Плащ — «крылья» ворона: сложен складками за спиной и по подолу, при ударе раскрывается веером перьев; клюв и крылья — главные акценты силуэта.
 *
 * Метод — как у палача, лича, хозяина миражей и военачальника (общий движок tools/gen/mobs/lib.ts): луч на пиксель, тело в 2× и сведение в 1×,
 * 5 тонов на материал, выборочный контур. Кадр 64×80, ступни на y = 76.
 * Светится (ночью не гаснет): очки-линзы, фонарь на посохе, зелье в склянке, глаза ворон в стае.
 * Умения слота: «Удар крыла» (конус, отталкивание — взмах плаща), «Пикирование» (3 метки под героем — прыжок-пике), Ф2 «Взлёт»
 * (6 с неуязвим — тело рассыпается стаей ворон, метки-тени, приземление кольцом).
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/sol_plague_raven.ts [--quick] [--sil] →
 *   tools/out/bosses139/rav-sheet.png, rav-glow.png, rav-fx-*.png, rav-pilot.png, r59s-w-compare.png («наш | референс»);
 *   --quick — только compare (покой), --sil — силуэт одним цветом ×1 рядом с силуэтом референса (r59s-w-sil.png).
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

export const ID = "sol_plague_raven";
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
const pxM = (view: View, dx: number, dy: number): V3 => fromView(view, [dx / K, 0, -dy * PXM]);

// ---------------- палитра ----------------
/** Сюртук: тёмно-зелёный, как на референсе. */
const COAT = R("#040a07", "#0c1a13", "#15301f", "#22483a", "#8ec4a8");
/** Шляпа и шарф: угольно-зелёные. */
const HATC = R("#050806", "#0e1612", "#1a2a22", "#2a4034", "#6a9482");
/** Клюв: коричневая кожа. */
const BEAK = R("#0c0805", "#241810", "#46301c", "#6e4e30", "#b08a5c");
/** Плащ-крылья: чёрно-синие перья, светлая кромка. */
const CAPE = R("#040807", "#0a1410", "#122219", "#1e382c", "#86b8a0");
/** Жёлтые лоскуты на плечах. */
const AMBER = R("#2c1804", "#6e4208", "#b87c12", "#e8b02c", "#ffe488");
const STEEL = R("#0c0e12", "#1c2028", "#343c48", "#586476", "#b0c0d4");
const BRONZE = R("#2a160a", "#52301a", "#82502a", "#b07a42", "#dba868");
const BONE = R("#2a2620", "#5c5446", "#948a74", "#c8bea4", "#f0e8d0");
const WOODS = R("#1c1108", "#38220f", "#5a3a1c", "#7c5429", "#a47845");
const LEATH = R("#0e0a08", "#241a12", "#3e2c1c", "#5a4028", "#785838");
const BOOT = R("#040506", "#0a0c0f", "#12151a", "#1c2027", "#2e343e");
/** Свет: линзы очков и фонарь — тёплый жёлтый. */
const GLOWC = R("#3a2004", "#8a5408", "#e8a418", "#ffd24a", "#fff4c0");
/** Свет фонаря: вспышки и след посоха. */
const FIRE = R("#3a2a10", "#8a6a20", "#d8b040", "#f4e08a", "#fffbe0");
/** Зелье в склянке: синее свечение. */
const VIAL = R("#04182c", "#0a3a6a", "#1c78c8", "#58b8f0", "#c8f0ff");
/** Вороны стаи. */
const CORV = R("#06080c", "#0e141c", "#1a2430", "#2c3c4c", "#7a98aa");
const DEAD = R("#121112", "#262223", "#3b3434", "#544a47", "#6e625c");
/** Пыль пустоши. */
const SAND = R("#3c3a34", "#6a665a", "#98927e", "#c4bca2", "#e8e0c4");
const DUST = SAND;
const VOID = hex("#0a0605");

const M = {
  coat: mat("сюртук", COAT, { base: 1.8, gain: 2.3 }),
  hat: mat("шляпа", HATC, { base: 1.8, gain: 2.3 }),
  beak: mat("клюв", BEAK, { base: 2.0, gain: 2.4, hi: 4 }),
  cape: mat("плащ", CAPE, { base: 1.7, gain: 2.5 }),
  amber: mat("лоскут", AMBER, { base: 2.0, gain: 2.2 }),
  steel: mat("сталь", STEEL, { base: 2.0, gain: 2.5, hi: 4 }),
  bronze: mat("латунь", BRONZE, { base: 2.1, gain: 2.3 }),
  bone: mat("кость", BONE, { base: 1.9, gain: 2.3, hi: 4 }),
  wood: mat("древко", WOODS, { base: 2.0, gain: 2.0 }),
  leath: mat("кожа", LEATH, { base: 1.7, gain: 2.2 }),
  boot: mat("сапоги", BOOT, { base: 1.6, gain: 2.3 }),
  glow: mat("свет", GLOWC, { base: 2.8, gain: 1.0, glow: true, crisp: true }),
  vial: mat("зелье", VIAL, { base: 2.8, gain: 1.0, glow: true, crisp: true }),
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
  for (const c of [...GLOWC, ...FIRE, ...VIAL]) s.add(c.slice(0, 3).join(","));
  return (q: RGBA) => s.has(q.slice(0, 3).join(","));
})();

// ---------------- поза ----------------
interface Pose {
  root: V3; bob: number; chest: number; headZ: number;
  pitch: number; yaw: number; roll: number; hp: number; hy: number; hr: number;
  /** кулаки: [правый — хват посоха, если не held; левый — склянка]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** посох: [пятка, направление пятка → фонарь]; flat — плоскость (нормаль), held — в руке */
  staff: [V3, V3]; flat: V3; held: number;
  armLift: [number, number];
  /** подол и плащ: волна, шаг (стопы), раскачка кистей и хвоста (px) */
  wave: number; waveAmp: number; kick: [number, number]; sway: number; tail: number;
  /** свечение очков 0..1,6; (fire, sigil — не используются); увядание; на коленях */
  glow: number; fire: number; sigil: number; wither: number; kneel: number;
  swirl: number; swirlPh: number;
  /** рассыпание в стаю ворон 0..1 (1 — тела нет, одна стая) */
  ghost: number;
  book: number; stars: number;
  ring: number; ringAt?: V3; flash: number; flashAt?: V3; dust: [number, number];
  trail?: V3[];
  /** плащ-крылья: 0 — сложены, 1 — раскрыты веером; взмах вперёд (0..1) */
  wing: number; sweep: number;
  t: number; seed: number;
}

const HIP0 = 21;
const NECK: V3 = [0, 0.8, 39.5];
const ARM: [number, number] = [10.0, 10.2];
/** Посох: от пятки до основания фонаря; хват правой руки — SG от пятки. */
const STAFF_L = 44;
const SG = 22;

const dirN = (d: V3): V3 => norm(d);
const stf = (grip: V3, dir: V3): [V3, V3] => { const d = dirN(dir); return [sub(grip, mul(d, SG)), d]; };
const STAFF_FRONT = stf([15.5, 5.0, 22], [0.02, 0.06, 1]);
const STAFF_SIDE = stf([9.0, -9.0, 22], [0, 0.06, 1]);
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.1, yaw: 0, roll: 0, hp: 0.1, hy: 0, hr: 0,
  hand: [[0, 0, 0], [-12.0, 7.0, 29.0]], pole: [[1, -0.4, -0.2], [-1, -0.5, -0.1]],
  staff: STAFF_FRONT, flat: [0, 1, 0.08], held: 1, armLift: [0, 0],
  wave: 0, waveAmp: 0, kick: [0, 0], sway: 0, tail: 0,
  glow: 1, fire: 0, sigil: 0, wither: 0, kneel: 0,
  swirl: 0, swirlPh: 0, ghost: 0, book: 0, stars: 0,
  ring: 0, flash: 0, dust: [0, 0], wing: 0, sweep: 0, t: 0, seed: 1,
};
const REST_SIDE: Pose = { ...REST_FRONT, staff: STAFF_SIDE, flat: [-1, 0, 0.05], hand: [[0, 0, 0], [-9.0, 9.0, 29.0]], pole: [[1, -0.3, -0.7], [-1, -0.2, -0.7]] };
const restOf = (view: View): Pose => (view === "side" ? REST_SIDE : REST_FRONT);
const bodyShift = (view: View, p: Pose): V3 => snapM(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.kneel * 7]);

// ---------------- штампы ----------------
type Keys = Record<string, RGBA>;
const up2 = (px: StampPx[]): StampPx[] => px.flatMap(([x, y, c]) => [[x * 2, y * 2, c], [x * 2 + 1, y * 2, c], [x * 2, y * 2 + 1, c], [x * 2 + 1, y * 2 + 1, c]] as StampPx[]);
/** Линзы очков: два круглых жёлтых глаза. */
const ST_EYES: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: up2(stampRows(["k33k..k33k", "3333..3333"], -5, -1)),
  side: up2(stampRows(["k3", "33"], 0, -1)),
};
function stampKeys(glow: number): Keys {
  const g = clamp(glow, 0, 1.6);
  const lv = (k: number) => {
    const v = k - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.25 ? 1 : 0);
    return v < 0 ? VOID : GLOWC[clamp(v, 0, 4)];
  };
  return { k: BRONZE[1], "1": lv(1), "2": lv(2), "3": lv(3) };
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

/** Ворон-доктор в координатах модели. */
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
  const I3: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const keys = stampKeys(p.glow);
  const kn = p.kneel;
  const sw = p.sway * PXM;
  const sp = clamp(p.wing, 0, 1);

  // ---------- плащ-крылья: в покое — опущенные полы с рваным перьевым краем по бокам; раскрыты — широкий веер из перьев ----------
  {
    const g = S.group(0.6);
    const NF = 10;
    for (const s of [1, -1]) {
      for (let j = 0; j < NF; j++) {
        const u = j / (NF - 1), odd = j % 2;
        const b = T([s * (3.4 + 3.2 * u), -2.6 - 0.1 * j, 38.6 - 1.0 * j], true);
        const fold: V3 = [s * (6.6 + 8.0 * u), -2.4 - 1.2 * odd, 3.0 + odd * 3.4 + (1 - u) * 1.5];
        const spread: V3 = [s * (7.0 + 15.5 * u), -4.6 + p.sweep * 9 * (0.4 + u * 0.6), 28.5 + 17 * u - odd * 2.2 + p.sweep * (u - 0.5) * 3];
        const flap = sp * Math.sin(TAU * (p.wave + j * 0.06)) * 0.8 * p.waveAmp;
        const hem = sp < 0.5 ? Math.round(p.waveAmp * 0.8 * Math.sin(TAU * (p.wave + j * 0.2))) * PXM : 0;
        const tp: V3 = [lerp(fold[0], spread[0], sp) + s * sw * 0.3, lerp(fold[1], spread[1], sp), lerp(fold[2], spread[2], sp) + flap + hem - (sp < 0.5 ? 0 : kn * 3)];
        S.cone(g, wm(M.cape, W), b, 2.8 + 1.6 * u, tp, 1.1, { part: S.newPart(), tone: odd * 0.45 - 0.15, big: j < 4 });
        // светлый рваный кончик пера — читается на ×1
        const dd = norm(sub(tp, b));
        S.cone(g, wm(M.bone, W), sub(tp, mul(dd, 3.8)), 0.9, add(tp, mul(dd, 0.6)), 0.1, { part: S.newPart(), tone: 0.1 + odd * 0.3 });
      }
      // плечевая «кость» крыла: от плеча к самому дальнему перу
      if (sp > 0.25) {
        const wr: V3 = [s * 22 * sp + s * 8 * (1 - sp), -4.8 + p.sweep * 5, 45.5 * sp + 34 * (1 - sp)];
        S.cone(g, wm(M.cape, W), T([s * 6.4, -1.4, 38.2], true), 1.7, wr, 1.0, { part: S.newPart(), tone: 0.25 });
      }
    }
    const g2 = S.group(1.0);
    S.ell(g2, wm(M.cape, W), T([0, -2.2, 37.0], true), [7.6, 2.6, 3.4], axes(TV), { part: S.newPart(), tone: -0.05 });
  }
  // ---------- подол: широкий расклёшенный, рваный перьями; из-под него видны носки сапог ----------
  {
    const g = S.group(1.0);
    const bx = pel[0] + sw * 0.6, by = pel[1] + 0.5;
    S.cone(g, wm(M.coat, W), PV([0, 0, 27 - kn * 1]), 5.4, [bx, by, 2.6], 12.4, { big: true, tone: -0.05 });
    S.cone(g, wm(M.coat, W), PV([0, 0, 22 - kn * 1]), 5.2, [bx, by, 1.6], 12.8, { part: S.newPart(), tone: -0.15 });
    // рваная кайма-перья по кругу
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const lift = Math.round(p.waveAmp * (0.5 + 0.5 * Math.sin(TAU * (p.wave + i * 0.17)))) * PXM;
      const r0 = 12.0, r1 = 13.2 + (i % 2) * 0.7;
      S.cone(g, wm(M.coat, W), [bx + Math.cos(a) * r0, by + Math.sin(a) * r0 * 0.92, 4.2], 1.5, [bx + Math.cos(a) * r1, by + Math.sin(a) * r1 * 0.92, 0.5 + lift + (i % 3) * 0.3], 0.15, { part: S.newPart(), tone: (i % 2) * 0.4 - 0.1 });
    }
    // передний лоскут-фартук со стальной каймой
    const fw = norm(PR([0, 1, 0.05])), sd = PR([1, 0, 0]), upV = norm(PR([0, -0.1, 1]));
    S.box(g, wm(M.coat, W), PV([0, 9.5, 14.5 - kn * 0.5]), [3.6, 0.6, 9.2], [sd, fw, upV], 0.2, { part: S.newPart(), tone: 0.3 });
    for (const sx of [-3.4, 3.4]) S.cone(g, wm(M.steel, W), PV([sx, 9.0, 23]), 0.4, PV([sx * 1.05, 10.4, 6.0]), 0.35, { part: S.newPart() });
    S.ell(g, wm(M.steel, W), PV([0, 10.0, 13]), [1.6, 0.4, 1.6], axes(PR), { part: S.newPart(), tone: 0.1 });
    for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
      const k = p.kick[i];
      const ft: V3 = [pel[0] + s * 5.4, pel[1] + 12.6 + 3.0 * k, 1.4 + 2.2 * Math.max(0, k) - kn * 0.8];
      S.ell(g, wm(M.boot, W), ft, [2.3, 3.6, 1.6], I3, { part: S.newPart(), tone: 0.05 });
    }
  }
  // ---------- торс: узкий сюртук, ремни, сумка, шипы на груди, жёлтые лоскуты на плечах ----------
  {
    const g = S.group(1.6);
    S.cone(g, wm(M.coat, W), PV([0, 0.4, 23]), 4.2, T([0, 0.6, 31]), 4.4, { tone: -0.1 });
    S.ell(g, wm(M.coat, W), T([0, 0.8, 34.0]), [5.0, 3.8, 5.0], axes(TV), { big: true, tone: 0.1 });
    S.ell(g, wm(M.leath, W), PV([0, 0.6, 24.4]), [4.6, 3.6, 0.9], axes(PR), { part: S.newPart() });
    S.ell(g, wm(M.steel, W), PV([0, 4.2, 24.4]), [1.0, 0.4, 0.9], axes(PR), { part: S.newPart(), tone: 0.3 });
    for (const s of [1, -1]) {
      S.ell(g, wm(M.coat, W), T([s * 6.8, -0.2, 37.2], true), [3.4, 3.2, 2.6], axes(TV, s * 0.5), { part: S.newPart(), tone: 0.15 });
      // жёлтые лоскуты: два заострённых «пера» на плече
      S.cone(g, wm(M.amber, W), T([s * 6.6, 0.6, 38.6], true), 2.0, T([s * 12.6, 0.4, 41.6], true), 0.15, { part: S.newPart(), tone: 0.3 });
      S.cone(g, wm(M.amber, W), T([s * 5.6, 1.2, 38.4], true), 1.4, T([s * 9.4, 1.6, 44.6], true), 0.15, { part: S.newPart(), tone: 0.1 });
      // шипы-заклёпки на груди
      for (const [dx, dz] of [[2.4, 34.6], [3.2, 31.6], [1.6, 28.4]] as [number, number][]) {
        S.cone(g, wm(M.steel, W), T([s * dx, 4.0, dz]), 0.7, T([s * dx, 5.4, dz + 0.3]), 0.1, { part: S.newPart(), tone: 0.4 });
      }
    }
    // шарф-воротник
    S.cone(g, wm(M.hat, W), T([0, 0.8, 36.4], true), 4.4, H([0, 1.0, 40.6]), 2.6, { part: S.newPart(), tone: -0.15 });
    // перевязь и сумка у пояса
    S.cone(g, wm(M.leath, W), T([-4.8, 2.6, 38.0], true), 0.55, T([5.2, 3.6, 26.0]), 0.55, { part: S.newPart() });
    S.box(g, wm(M.leath, W), T([6.4, 3.6, 24.6]), [3.0, 1.7, 3.0], axes(TV), 0.3, { part: S.newPart(), tone: 0.1 });
    S.ell(g, wm(M.steel, W), T([6.4, 5.4, 25.2]), [1.0, 0.4, 1.0], axes(TV), { part: S.newPart(), tone: 0.3 });
  }

  // ---------- посох-фонарь: тёмное древко, латунные кольца, сверху фонарь с жёлтым светом ----------
  const held = p.held >= 0.5;
  const ad = norm(p.staff[1]);
  const butt: V3 = add(p.staff[0], held ? shift : [0, 0, 0]);
  const top = add(butt, mul(ad, STAFF_L));
  const grip0 = add(butt, mul(ad, SG));
{
    const g = S.group(0.5);
    S.cone(g, wm(M.wood, W), butt, 0.8, top, 0.9, { big: true });
    for (let i = 0; i < 5; i++) {
      const c = add(butt, mul(ad, STAFF_L * (0.3 + i * 0.13)));
      S.cone(g, wm(M.bronze, W), sub(c, mul(ad, 0.2)), 1.15, add(c, mul(ad, 0.5)), 1.1, { part: S.newPart(), tone: 0.2 });
    }
    S.cone(g, wm(M.steel, W), butt, 1.0, sub(butt, mul(ad, 2.0)), 0.2, { part: S.newPart() });
    // крюк на конце посоха и клетка-фонарь, подвешенный на цепочке
    const out: V3 = [1, 0, 0];
    const h1 = add(add(top, mul(ad, 2.6)), mul(out, 1.6)), h2 = add(add(top, mul(ad, 3.6)), mul(out, 4.0));
    const hk = add(add(top, mul(ad, 1.4)), mul(out, 5.4));
    S.cone(g, wm(M.bronze, W), top, 1.0, h1, 0.8, { part: S.newPart(), tone: 0.2 });
    S.cone(g, wm(M.bronze, W), h1, 0.8, h2, 0.7, { part: S.newPart(), tone: 0.2 });
    S.cone(g, wm(M.bronze, W), h2, 0.7, hk, 0.6, { part: S.newPart(), tone: 0.3 });
    const lc = add(hk, [0, 0, -5.4]);
    S.cone(g, wm(M.steel, W), hk, 0.35, add(lc, [0, 0, 3.4]), 0.35, { part: S.newPart(), tone: 0.3 });
    S.cone(g, wm(M.bronze, W), add(lc, [0, 0, 3.0]), 0.5, add(lc, [0, 0, 4.0]), 2.4, { part: S.newPart(), tone: 0.35 });
    S.ell(g, M.glow, lc, [2.0, 2.0, 2.9], I3, { part: S.newPart() });
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      S.cone(g, wm(M.bronze, W), add(lc, [ax * 2.7, ay * 2.7, 3.4]), 0.4, add(lc, [ax * 2.7, ay * 2.7, -3.4]), 0.4, { part: S.newPart(), tone: 0.15 });
    }
    S.cone(g, wm(M.bronze, W), add(lc, [0, 0, -3.0]), 2.4, add(lc, [0, 0, -4.4]), 0.3, { part: S.newPart(), tone: 0.1 });
    X.glints.push(add(lc, [0, 0, 1]));
  }

  // ---------- руки: рукава сюртука, кожаные перчатки; правая — посох, левая — склянка с синим зельем ----------
  {
    const g = S.group(1.0);
    const limb = (gg: number, sh: V3, el: V3, fist: V3) => {
      S.cone(gg, wm(M.coat, W), sh, 3.0, el, 2.5, { tone: 0.05, big: true });
      S.cone(gg, wm(M.coat, W), el, 2.5, fist, 1.9, { tone: 0.0, big: true });
      S.ell(gg, wm(M.leath, W), fist, [1.9, 1.9, 2.0], I3, { part: S.newPart(), tone: 0.2 });
      const f = norm(sub(fist, el));
      S.cone(gg, wm(M.leath, W), add(el, mul(f, 3.8)), 2.1, add(el, mul(f, 4.8)), 2.0, { part: S.newPart(), tone: 0.0 });
    };
    const lift = pxM(view, 0, -p.armLift[0]);
    const sh = add(T([7.6, 0.2, 36.6]), lift);
    const fist: V3 = held ? grip0 : add(add(p.hand[0], shift), lift);
    limb(g, sh, ik(sh, fist, ARM[0], ARM[1], p.pole[0]), fist);
    const g2 = S.group(1.0);
    const lift2 = pxM(view, 0, -p.armLift[1]);
    const sh2 = add(T([-7.6, 0.2, 36.6]), lift2);
    const fist2 = add(add(p.hand[1], shift), lift2);
    limb(g2, sh2, ik(sh2, fist2, ARM[0], ARM[1], p.pole[1]), fist2);
    // склянка: стеклянный шарик с зельем, пробка
    S.ell(g2, M.vial, add(fist2, [0, 0.4, 3.0]), [1.9, 1.9, 2.1], I3, { part: S.newPart() });
    S.cone(g2, wm(M.wood, W), add(fist2, [0, 0.4, 4.6]), 0.8, add(fist2, [0, 0.4, 6.4]), 0.8, { part: S.newPart(), tone: 0.2 });
    X.glints.push(add(fist2, [0, 0.4, 5.0]));
  }

  // ---------- голова: шарф, тёмная шляпа с высокой изломанной тульей, длинный тёмный кожаный клюв, круглые светящиеся очки ----------
  {
    const g = S.group(1.0);
    const HC = 44.0;
    S.ell(g, wm(M.hat, W), H([0, 1.0, HC]), [3.7, 3.8, 3.8], axes(HV), { big: true, tone: -0.1 });
    // маска и клюв: тёмная кожа, длинный, плавно загнут вниз, кончик ниже подбородка, блик по верху, ремешок
    const bp = S.newPart();
    S.ell(g, wm(M.beak, W), H([0, 2.8, HC - 0.4]), [3.2, 2.8, 3.2], axes(HV), { part: bp, tone: 0.1 });
    S.cone(g, wm(M.beak, W), H([0, 3.6, HC - 0.8]), 3.1, H([0, 10.0, HC - 1.4]), 2.2, { part: bp, tone: 0.05, big: true });
    S.cone(g, wm(M.beak, W), H([0, 9.6, HC - 1.4]), 2.2, H([0, 16.0, HC - 3.2]), 1.4, { part: bp, tone: 0.1 });
    S.cone(g, wm(M.beak, W), H([0, 15.6, HC - 3.2]), 1.4, H([0, 21.5, HC - 9.0]), 0.12, { part: bp, tone: 0.15 });
    S.cone(g, wm(M.beak, W), H([0, 4.0, HC + 1.4]), 0.7, H([0, 15.0, HC - 1.0]), 0.5, { part: S.newPart(), tone: 0.85 });
    S.cone(g, wm(M.leath, W), H([-3.6, 1.0, HC + 0.6]), 0.5, H([0, 6.4, HC - 1.0]), 0.5, { part: S.newPart(), tone: 0.1 });
    S.cone(g, wm(M.leath, W), H([3.6, 1.0, HC + 0.6]), 0.5, H([0, 6.4, HC - 1.0]), 0.5, { part: S.newPart(), tone: 0.1 });
    // круглые очки: оправа и светящиеся стёкла по бокам над клювом
    for (const s of [1, -1]) {
      S.ell(g, wm(M.bronze, W), H([s * 2.6, 3.8, HC + 1.6]), [1.9, 1.2, 1.9], axes(HV), { part: S.newPart(), tone: 0.25 });
      S.ell(g, M.glow, H([s * 2.6, 4.6, HC + 1.6]), [1.3, 0.7, 1.3], axes(HV), { part: S.newPart() });
    }
    // шляпа: широкие поля, высокая острая тулья с изломом вбок; лента — тонкая тёмная кожа с медной пряжкой (отдельные группы, цвета не размываются)
    const gh = S.group(0.4);
    S.ell(gh, wm(M.hat, W), H([0, 0.6, HC + 3.8]), [12.2, 11.8, 0.9], axes(HV, 0.07), { part: S.newPart(), tone: 0.15 });
    S.cone(gh, wm(M.hat, W), H([0, 0.5, HC + 3.9]), 5.8, H([0, 0.1, HC + 10.0]), 4.0, { part: S.newPart(), tone: 0.0, big: true });
    S.cone(gh, wm(M.hat, W), H([0, 0.1, HC + 9.6]), 4.0, H([1.4, -1.6, HC + 15.4]), 0.15, { part: S.newPart(), tone: 0.2 });
    const gb = S.group(0.15);
    S.ell(gb, wm(M.boot, W), H([0, 0.5, HC + 4.7]), [5.8, 5.8, 0.5], axes(HV), { part: S.newPart(), tone: -0.2 });
    S.ell(gb, wm(M.bronze, W), H([0, 5.6, HC + 4.9]), [1.2, 0.4, 0.9], axes(HV), { part: S.newPart(), tone: 0.5 });
  }

  // ---------- частицы и эффекты ----------
  if (p.ring > 0.02) X.rings.push({ c: p.ringAt ?? [pel[0], pel[1], 0], r: 3 + 22 * p.ring, k: 1 - p.ring });
  if (p.flash > 0.02) X.flash = { at: p.flashAt ?? add(top, mul(ad, 4)), k: p.flash };
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) X.dust.push({ at: i === 0 && p.flashAt ? [p.flashAt[0], p.flashAt[1], 0] : [pel[0] + (i ? -6 : 6), pel[1] + 6, 0], k: p.dust[i] });
  if (p.stars > 0.02) X.stars = { at: H([0, 0, 58]), k: p.stars };
  // тело — в двойном разрешении (K·RS), слои 2D — в пикселях кадра 1× (K)
  scaleScene(S, K * RS);
  const sk = (v: V3) => mul(v, K);
  X.rings.forEach((r) => { r.c = sk(r.c); r.r *= K; });
  if (X.flash) X.flash.at = sk(X.flash.at);
  X.dust.forEach((d) => (d.at = sk(d.at)));
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
/** Подкоп: тело уходит в песок — всё ниже линии (глубина k) срезается, на линии — вал песка. */
function drawBurrow(img: PC, k: number) {
  if (k < 0.02) return;
  const y0 = Math.round(74 - k * 36);
  for (let y = y0; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) img.clear(x, y);
  const w = 11 + 6 * k;
  for (let x = Math.round(32 - w); x <= Math.round(32 + w); x++) {
    const u = Math.abs(x - 32) / w;
    const h = Math.round(3.2 * (1 - u * u));
    for (let y = y0 - h; y < y0 + 4; y++) img.set(x, y, SAND[y === y0 - h ? 4 : y < y0 ? 3 : y < y0 + 2 ? 2 : 1]);
  }
  for (let j = 0; j < 8; j++) img.set(Math.round(32 + Math.sin(j * 2.3) * w * 0.9), y0 - 4 - ((j * 3) % 6), SAND[3]);
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
  thicken(img, OUT, 3, [...GLOWC, ...FIRE, ...SAND, ...BRONZE]);
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
  // слои без контура — поверх готового тела
  if (X.sigil) drawSigil(c, X.sigil);
  if (pose.ghost > 0.02) drawFlock(img, emis, pose.ghost, pose.t);
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
/** Атака: посох отведён за правое плечо, удар наотмашь вперёд-вниз (кадр 7), огненный след, вспышка на завитке. */
function attackPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { yaw: side ? 0.12 : -0.28, pitch: -0.07, hp: -0.08, staff: side ? stf([9, -3, 34], [0, -0.55, 0.83]) : stf([8, -3, 34], [0.35, -0.5, 0.8]), glow: 1.3, armLift: [1, 0] };
  const hit: Partial<Pose> = { yaw: side ? -0.05 : 0.2, pitch: 0.2, hp: 0.1, bob: -2 * PXM, staff: side ? stf([9, 1, 29], [0, 0.5, 0.3]) : stf([6, 11, 29], [-0.5, 0.82, 0.14]), glow: 1.4, flash: 1, fire: 0.4 };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1.5, p: { staff: side ? stf([10, 2, 32], [0, -0.1, 1]) : stf([11, 2, 32], [0.1, -0.1, 1]) }, ease: easeInOut },
    { f: 3, p: wind, ease: easeInOut }, { f: 4, p: { ...wind, armLift: [1, 1] }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, fire: 0.6 }, ease: easeIn }, { f: 6, p: hit, ease: easeOut }, { f: 7, p: { ...hit, flash: 0, bob: -1 * PXM, fire: 0.2 }, ease: easeOut },
    { f: 8, p: { staff: side ? stf([10, 6, 31], [0, 0.2, 1]) : stf([11, 5, 31], [0.1, 0.1, 1]) }, ease: easeInOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 10, 400);
  poses[5].trail = trailOf(R0, keys, view, 4, 5);
  poses[6].trail = trailOf(R0, keys, view, 4.2, 6);
  poses[7].trail = trailOf(R0, keys, view, 5.4, 6.3, 4);
  poses[6].flashAt = tipW(poses[6], view);
  poses[6].dust = [1, 0];
  return poses;
}
/** Оглушение: покачивается, голова свесилась набок, посох опущен, над головой кружат звёзды (8 к/с по кругу). */
function stunPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const rl = [0, 0.05, 0.08, 0.05, 0, -0.05, -0.08, -0.05];
  return Array.from({ length: 8 }, (_, i) => ({
    ...R0, t: i / 8, seed: 1500 + i, roll: rl[i], hp: 0.28, hr: -rl[i] * 1.4 + 0.12, pitch: 0.1, bob: -1 * PXM, glow: 0.35, stars: 1,
    staff: side ? stf([10.5, 8, 28], [0, 0.34, 0.94]) : stf([12.5, 6, 29], [0.28, 0.2, 0.94]), root: [[0, 1, 1, 1, 0, -1, -1, -1][i], 0, 0] as V3,
    swirlPh: i / 8, sway: [0, 1, 1, 0, 0, -1, -1, 0][i], tail: [0, 1, 2, 2, 1, 0, 0, 0][i], wave: i / 8, waveAmp: 1,
  }));
}
/**
 * Гибель: отшатнулся, посох выпадает из руки и ложится наискось; чародей оседает на колени (сюртук — лужей), клонится вперёд,
 * рога опущены; глаза и жемчужина гаснут, книга падает.
 */
function deathPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const Wv = (v: V3): V3 => fromView(view, v);
  const fall: [V3, V3] = [Wv([14, 3, 1]), norm(Wv([-0.3, -0.35, 0.9]))];
  const lying: [V3, V3] = [Wv([11, 3, 1.2]), norm(Wv([-0.6, -0.8, 0.04]))];
  const recoil: Partial<Pose> = { pitch: -0.14, hp: -0.3, bob: 1 * PXM, glow: 1.6, sway: 1, flash: 0 };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1, p: recoil, ease: easeOut }, { f: 2, p: { ...recoil, pitch: 0.08, hp: 0, bob: 0, glow: 1.1 }, ease: easeInOut },
    { f: 3, p: { held: 0, staff: fall, hand: [[10, 8, 22], [-9.6, 6, 18]], pitch: 0.14, glow: 0.9, kneel: 0.3 }, ease: easeIn },
    { f: 4, p: { held: 0, staff: lying, hand: [[9.6, 8, 16], [-9.6, 7, 13]], pitch: 0.22, glow: 0.7, kneel: 0.75, dust: [1, 1] }, ease: easeIn },
    { f: 5, p: { held: 0, staff: lying, hand: [[9, 8, 13], [-9, 8, 11]], pitch: 0.3, hp: 0.2, glow: 0.5, kneel: 1, dust: [0.5, 0.5] }, ease: easeOut },
    { f: 8, p: { held: 0, staff: lying, hand: [[8.6, 9, 12], [-8.6, 9, 10]], pitch: 0.44, hp: 0.5, glow: 0.2, kneel: 1, wither: 0.3, tail: 0 }, ease: easeInOut },
    { f: 13, p: { held: 0, staff: lying, hand: [[8.4, 9, 11.5], [-8.4, 9, 9.6]], pitch: 0.5, hp: 0.6, hr: 0.1, glow: 0, kneel: 1, wither: 0.6 }, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 14, 1300);
  for (let i = 3; i < 14; i++) { poses[i].held = 0; if (i >= 4) poses[i].staff = lying; }
  return poses;
}

// ---------------- анимации ворона ----------------
/** Покой: дыхание по пикселю, плащ чуть колышется, подол шевелится, фонарь дышит. */
function idlePoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const sway = [0, 0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    return { ...R0, t, seed: 100 + i, chest: chest[i], headZ: head[i] - chest[i], sway: sway[i], wave: t, waveAmp: 1, glow: 1 + 0.25 * Math.sin(t * TAU), armLift: [0, [0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0][i]] as [number, number] };
  });
}
/** Ходьба: размеренный шаг, посох как трость, подол и плащ качаются. */
function walkPoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const bob = [0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0];
  const swayX = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0];
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    const fw = Math.sin(TAU * u), lift = Math.max(0, Math.cos(TAU * u));
    const grip: V3 = [side ? 9.0 : 15.5, (side ? -8.5 : 5.0) + 3.6 * fw, 22 + 2.4 * lift];
    return {
      ...R0, t: u, seed: 150 + i,
      root: [side ? 0 : swayX[i], 0, 0] as V3, bob: bob[i] * PXM,
      kick: [Math.max(0, Math.sin(TAU * u)) - 0.2, Math.max(0, Math.sin(TAU * u + Math.PI)) - 0.2] as [number, number],
      sway: [0, 1, 1, 0, -1, -1][i % 6], wave: u * 2, waveAmp: 1.4,
      staff: stf(grip, [0.02, 0.05 + 0.1 * fw, 1]), dust: [i === 1 ? 0.5 : i === 7 ? 0.5 : 0, 0] as [number, number],
    };
  });
}
/** «Удар крыла» (конус с отталкиванием): плащ-крылья раскрываются назад-вверх, взмах вперёд — веер перьев; пыль по бокам. */
function wingKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { pitch: -0.12, hp: -0.14, bob: 0.5 * PXM, wing: 0.75, waveAmp: 1, glow: 1.4, staff: side ? stf([9, -8, 22], [0, 0.2, 1]) : stf([14.5, 4, 22], [0.1, 0.1, 1]) };
  const hit: Partial<Pose> = { ...wind, pitch: 0.18, hp: 0.1, bob: -1 * PXM, wing: 1, sweep: 1, glow: 1.5, dust: [1, 1] };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, wing: 0.95, pitch: -0.18 }, ease: easeOut },
    { f: 2, p: { ...hit, sweep: 0.5, dust: [0, 0] }, ease: easeIn }, { f: 3, p: hit, ease: easeOut },
    { f: 4, p: { ...hit, sweep: 0.8, dust: [0.5, 0.5] }, ease: linear }, { f: 6, p: { ...hit, sweep: 0.3, wing: 0.7, dust: [0, 0], bob: 0 }, ease: easeOut },
    { f: 8, p: { wing: 0.25, sweep: 0 }, ease: easeInOut }, { f: 9, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function wingStrikePoses(view: View): Pose[] {
  const { R0, keys } = wingKeys(view);
  const poses = keyed(R0, keys, 10, 540).map((p, i) => ({ ...p, wave: i * 0.14, waveAmp: 1 }));
  return poses;
}
/** «Пикирование» (3 метки под героем): присел, подпрыгнул с раскрытыми крыльями, рухнул вниз-вперёд — пыль, кольцо. */
function diveKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { pitch: -0.05, hp: -0.1, kneel: 0.5, bob: 0, wing: 0.5, waveAmp: 1, glow: 1.4, staff: side ? stf([9, -8, 20], [0, 0.2, 1]) : stf([14.5, 4, 20], [0.1, 0.1, 1]) };
  const air: Partial<Pose> = { ...wind, kneel: 0, root: [0, 0, 6] as V3, wing: 1, pitch: 0.12, hp: 0.05, glow: 1.5 };
  const hit: Partial<Pose> = { ...air, root: [0, 0, 0] as V3, bob: -1 * PXM, pitch: 0.3, hp: 0.15, wing: 0.55, ring: 0.08, dust: [1, 1], flash: 1 };
  const keys: Key[] = [
    { f: 0, p: air }, { f: 1, p: { ...air, root: [0, 0, 4] as V3, pitch: 0.2, wing: 0.85 }, ease: easeIn }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, ring: 0.4, dust: [0.6, 0.6] }, ease: linear }, { f: 4, p: { ...hit, flash: 0, ring: 0.8, dust: [0.3, 0.3], pitch: 0.2, wing: 0.4 }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 0, dust: [0, 0], pitch: 0.1, wing: 0.25, bob: 0 }, ease: easeInOut }, { f: 7, p: { wing: 0 }, ease: easeInOut },
  ];
  return { R0, wind, keys, air };
}
function diveCastPoses(view: View): Pose[] {
  const { R0, keys } = diveKeys(view);
  const poses = keyed(R0, keys, 8, 640).map((p, i) => ({ ...p, wave: i * 0.12, waveAmp: 1 }));
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  return poses;
}
/** Ф2 «Взлёт»: приседает, плащ раскрывается, тело рассыпается стаей ворон (неуязвим), стая кружит; приземление — стая собирается в тело, кольцо. */
function leapKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { pitch: -0.05, hp: -0.12, kneel: 0.6, wing: 0.6, waveAmp: 1, glow: 1.5, staff: side ? stf([9, -8, 19], [0, 0.2, 1]) : stf([14.5, 4, 19], [0.1, 0.1, 1]) };
  const fly: Partial<Pose> = { ...wind, kneel: 0, wing: 1, root: [0, 0, 3] as V3, ghost: 1 };
  return { R0, wind, fly };
}
function leapWindPoses(view: View): Pose[] {
  const { R0, wind, fly } = leapKeys(view);
  const keys: Key[] = [{ f: 0, p: {} }, { f: 1, p: wind, ease: easeInOut }, { f: 2, p: { ...wind, kneel: 0.75, wing: 0.85, ghost: 0.12 }, ease: easeOut }, { f: 3, p: { ...fly, ghost: 0.55, root: [0, 0, 2] as V3 }, ease: easeIn }];
  return keyed(R0, keys, 4, 700).map((p, i) => ({ ...p, wave: i * 0.13, waveAmp: 1 }));
}
function leapHoldPoses(view: View): Pose[] {
  const { R0, fly } = leapKeys(view);
  return Array.from({ length: 4 }, (_, i) => ({ ...R0, ...fly, ghost: 1, t: i / 4, seed: 720 + i, wave: i * 0.25, waveAmp: 1 }));
}
function leapLandPoses(view: View): Pose[] {
  const { R0, fly } = leapKeys(view);
  const land: Partial<Pose> = { ...fly, ghost: 0, root: [0, 0, 0] as V3, kneel: 0.5, wing: 0.7, pitch: 0.2, hp: 0.1, bob: -1 * PXM, ring: 0.08, dust: [1, 1], flash: 1 };
  const keys: Key[] = [
    { f: 0, p: { ...fly, ghost: 0.85 } }, { f: 1, p: { ...fly, ghost: 0.45, root: [0, 0, 1.5] as V3, kneel: 0.2 }, ease: easeIn }, { f: 2, p: { ...land, ghost: 0.12, flash: 0, ring: 0, dust: [0, 0] }, ease: easeIn },
    { f: 3, p: land, ease: easeOut }, { f: 4, p: { ...land, flash: 0, ring: 0.45, dust: [0.6, 0.6], kneel: 0.3, wing: 0.5 }, ease: linear },
    { f: 5, p: { ...land, flash: 0, ring: 0.85, dust: [0.3, 0.3], kneel: 0.15, wing: 0.35 }, ease: linear }, { f: 6, p: { wing: 0.15, kneel: 0, ring: 0, dust: [0, 0], ghost: 0 }, ease: easeInOut }, { f: 7, p: {}, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 8, 740).map((p, i) => ({ ...p, wave: i * 0.13, waveAmp: 1 }));
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  return poses;
}

/** Ворон стаи: 9 px в размахе, три фазы взмаха, тёмное тело 3×2, светлые кончики крыльев, клюв, жёлтый глаз. */
function birdGlyph(put: (x: number, y: number, c: RGBA) => void, x: number, y: number, f: number, eye: boolean) {
  const ph = [0, 1, 2, 1][f & 3];
  const dy = [[0, -1, -2, -3], [0, 0, -1, -1], [0, 1, 1, 2]][ph];
  for (const s of [-1, 1]) for (let i = 1; i <= 4; i++) {
    const yy = y + dy[i - 1];
    put(x + s * i, yy, i === 4 ? CORV[4] : i === 3 ? CORV[3] : CORV[2]);
    if (i < 4) put(x + s * i, yy + 1, CORV[1]);
    if (i < 3) put(x + s * i, yy + 2, CORV[0]);
  }
  for (const [bx, by] of [[0, 0], [-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1], [0, 2]]) put(x + bx, y + by, CORV[bx ? 1 : 2]);
  put(x + 2, y - 1, eye ? GLOWC[3] : CORV[1]); put(x + 3, y - 1, BEAK[3]); put(x + 2, y, CORV[1]);
  put(x - 2, y + 2, CORV[0]); put(x - 3, y + 3, CORV[0]); put(x - 1, y + 3, CORV[0]);
}
/** Рассыпание в стаю: тело срезается снизу вверх россыпью, вокруг кружат 6–10 крупных ворон (k 0..1), у стаи горят жёлтые глаза. */
function drawFlock(img: PC, emis: PC, k: number, t: number) {
  if (k < 0.02) return;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (!img.alpha(x, y)) continue;
    const pr = clamp(k * 1.7 - (y / FH) * 0.7, 0, 1);
    if (hash01(x, y, 31) < pr) { img.clear(x, y); emis.clear(x, y); }
  }
  const nb = Math.max(2, Math.round(12 * k));
  for (let j = 0; j < nb; j++) {
    const a = j * 2.399 + t * TAU * (j % 2 ? 1 : -1) * 0.5;
    const rr = (0.5 + 0.5 * k) * (5 + (j % 4) * 3.4 + 2 * Math.sin(t * TAU + j));
    const cx = 32 + Math.cos(a) * rr * 1.7, cy = 40 - k * 4 + Math.sin(a) * rr * 1.1 - (j % 3) * 4;
    const x = Math.round(clamp(cx, 6, FW - 7)), y = Math.round(clamp(cy, 6, FH - 9));
    birdGlyph((px, py, c) => { if (px < 1 || py < 1 || px >= FW - 1 || py >= FH - 1) return; img.set(px, py, c); if (c === GLOWC[3]) emis.set(px, py, c); }, x, y, Math.floor(t * 12) + j, j % 2 === 0);
  }
}

export type MirAnim = "idle" | "walk" | "attack" | "wingWind" | "wingHold" | "wingStrike" | "diveWind" | "diveHold" | "diveCast"
  | "leapWind" | "leapHold" | "leapLand" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: MirAnim; hit?: number };
const ANIM_ORDER: [MirAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар посохом", hit: 6 }],
  ["wingWind", { n: 4, fps: 12, loop: false, ru: "плащ раскрывается", next: "wingHold" }],
  ["wingHold", { n: 4, fps: 12, loop: true, ru: "крылья наготове", next: "wingStrike" }],
  ["wingStrike", { n: 10, fps: 12, loop: false, ru: "удар крыла (взмах плаща)", hit: 3 }],
  ["diveWind", { n: 4, fps: 12, loop: false, ru: "присел для пике", next: "diveHold" }],
  ["diveHold", { n: 4, fps: 12, loop: true, ru: "в прыжке", next: "diveCast" }],
  ["diveCast", { n: 8, fps: 12, loop: false, ru: "пикирование", hit: 2 }],
  ["leapWind", { n: 4, fps: 12, loop: false, ru: "взлёт: рассыпается стаей", next: "leapHold" }],
  ["leapHold", { n: 4, fps: 12, loop: true, ru: "стая кружит (неуязвим)", next: "leapLand" }],
  ["leapLand", { n: 8, fps: 12, loop: false, ru: "приземление кольцом", hit: 3 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const MIR_ANIMS = {} as Record<MirAnim, AnimDef>;
{
  let col = 0;
  for (const [k, a] of ANIM_ORDER) { MIR_ANIMS[k] = { ...a, col }; col += a.n; }
}
export const MIR_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
export type MirFx = "wing" | "dive" | "land";
export const MIR_SKILLS: Record<string, { windup: [MirAnim, MirAnim]; strike: MirAnim; fx?: MirFx }> = {
  wing_beat: { windup: ["wingWind", "wingHold"], strike: "wingStrike", fx: "wing" },
  dive: { windup: ["diveWind", "diveHold"], strike: "diveCast", fx: "dive" },
  carrion_flight: { windup: ["leapWind", "leapHold"], strike: "leapLand", fx: "land" },
};
const POSES: Record<MirAnim, (v: View) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v), attack: attackPoses,
  wingWind: (v) => { const { R0, wind } = wingKeys(v); return windPoses(R0, wind, 500).map((p, i) => ({ ...p, wing: [0.2, 0.4, 0.6, 0.75][i], wave: i * 0.12 })); },
  wingHold: (v) => { const { R0, wind } = wingKeys(v); return holdPoses(R0, wind, 520, 4, (i) => ({ armLift: [TREMBLE[i], 0], glow: [1.4, 1.6, 1.45, 1.6][i], wave: i * 0.25, wing: 0.75 + 0.06 * (i % 2) })); },
  wingStrike: wingStrikePoses,
  diveWind: (v) => { const { R0, wind } = diveKeys(v); return windPoses(R0, wind, 600).map((p, i) => ({ ...p, kneel: [0.1, 0.25, 0.4, 0.5][i], wing: [0.1, 0.25, 0.4, 0.5][i], wave: i * 0.12 })); },
  diveHold: (v) => { const { R0, air } = diveKeys(v); return holdPoses(R0, air, 620, 4, (i) => ({ root: [0, 0, [6, 6.6, 6, 5.4][i]] as V3, wing: [1, 0.9, 1, 0.9][i], glow: [1.4, 1.6, 1.45, 1.6][i], wave: i * 0.25 })); },
  diveCast: diveCastPoses,
  leapWind: leapWindPoses, leapHold: leapHoldPoses, leapLand: leapLandPoses,
  stun: stunPoses, death: deathPoses,
};

// ---------------- эффекты мира ----------------
interface FxDef { w: number; h: number; ax: number; ay: number; n: number; fps: number; hit: number }
export const FX: Record<MirFx, FxDef & { anims?: Record<string, { col: number; n: number; loop: boolean; hit?: number; fps?: number }> }> = {
  wing: { w: 64, h: 64, ax: 32, ay: 50, n: 10, fps: 12, hit: 2 },
  dive: { w: 64, h: 64, ax: 32, ay: 50, n: 8, fps: 12, hit: 4 },
  land: { w: 64, h: 64, ax: 32, ay: 50, n: 10, fps: 12, hit: 2 },
};
type Plot = (x: number, y: number, c: RGBA) => void;
const plotOf = (c: PC): Plot => (x, y, col) => { if (x >= 1 && y >= 1 && x < c.w - 1 && y < c.h - 1) c.set(x, y, col); };
function disc(plot: Plot, cx: number, cy: number, r: number, ry: number, c: (d: number) => RGBA | null) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy) / ry);
    if (d > 1) continue;
    const q = c(d);
    if (q) plot(x, y, q);
  }
}
/** Перо: диагональная чёрточка с костяным кончиком. */
function featherDash(pl: Plot, x: number, y: number, dx: number, dy: number, a = 255) {
  for (let s = 0; s < 4; s++) pl(Math.round(x + dx * s), Math.round(y + dy * s), s === 3 ? [BONE[3][0], BONE[3][1], BONE[3][2], a] : [CAPE[s < 2 ? 2 : 3][0], CAPE[s < 2 ? 2 : 3][1], CAPE[s < 2 ? 2 : 3][2], a]);
}
/** «Удар крыла»: расходящийся веер перьев — дуги тёмного плаща по земле, перья летят наружу, пыль по краям. */
function buildWingFx(): PC {
  const F = FX.wing;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const fade = i < 5 ? 1 : Math.max(0, 1 - (i - 5) / 5);
    const Rr = Math.min(27, 6 + 3.2 * i);
    disc(pb, cx, cy, Rr * 0.9, Rr * 0.38, (d) => [14, 22, 30, Math.round(120 * fade * (1 - d * 0.5))]);
    for (let a = -1.35; a <= 1.35; a += 0.045) {
      const ox = cx + Math.sin(a) * Rr, oy = cy - 2 - Math.cos(a) * Rr * 0.5;
      const tone = Math.abs(a) < 0.4 ? 3 : 2;
      for (let w = 0; w < 3; w++) {
        if (hash01(Math.round(a * 50), w, i) > fade) continue;
        pf(Math.round(ox), Math.round(oy) - w, [CAPE[w === 0 ? tone + 1 : tone][0], CAPE[w === 0 ? tone + 1 : tone][1], CAPE[w === 0 ? tone + 1 : tone][2], 255]);
      }
      if (Math.round(a * 22) % 4 === 0 && fade > 0.3) pf(Math.round(ox), Math.round(oy) - 3, BONE[3]);
    }
    for (let j = 0; j < 9; j++) {
      const a = -1.2 + j * 0.3, t = ((i * 0.13 + j * 0.31) % 1);
      const rr = Rr * (0.5 + 0.55 * t);
      if (hash01(j, i, 3) > fade + 0.3) continue;
      featherDash(pf, cx + Math.sin(a) * rr, cy - 3 - Math.cos(a) * rr * 0.5 - 6 * t, Math.sin(a) * 0.8, -0.5);
    }
    for (const s of [-1, 1]) if (i >= 2 && i <= 6) for (let d = 0; d < 3; d++) pf(cx + s * (Rr * 0.9 + d * 2), cy - 1 - (i % 2) - d, SAND[3 - (d % 2)]);
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/** «Пикирование»: метка под героем — тень птицы с раскинутыми крыльями растёт, кадр hit — удар и вспышка, потом оседают перья. */
function buildDiveFx(): PC {
  const F = FX.dive;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const grow = i < 4 ? (i + 1) / 4 : 1;
    const fade = i < 5 ? 1 : Math.max(0, 1 - (i - 4) / 4);
    disc(pb, cx, cy, 15 * grow, 6 * grow, (d) => [16, 20, 28, Math.round((d < 0.5 ? 150 : 100) * fade)]);
    // тень птицы с раскинутыми крыльями: клюв-голова по центру, два крыла дугой
    if (i < 5) {
      for (let s = -1; s <= 1; s += 2) for (let u = 0; u <= 1; u += 0.06) {
        const x = cx + s * u * 13 * grow, y = cy - 1 - Math.sin(u * 2.4) * 3.2 * grow + u * 1.6;
        pb(Math.round(x), Math.round(y), [8, 10, 16, 220]);
        pb(Math.round(x), Math.round(y) + 1, [8, 10, 16, 220]);
      }
      pb(cx, cy - 1, [8, 10, 16, 240]); pb(cx, cy, [8, 10, 16, 240]); pb(cx + 1, cy + 1, [8, 10, 16, 240]);
      if (i < 4) for (const s of [-1, 1]) pf(cx + s * Math.round(8 * grow), cy - 3, GLOWC[i % 2 ? 4 : 3]);
    }
    if (i === 4) {
      for (let r = 1; r <= 9; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1]]) pf(cx + dx * r, cy - 1 + dy * Math.min(r, 6) * (dy ? 1 : 0), FIRE[r < 4 ? 4 : 3]);
      for (let a = 0; a < TAU; a += 0.4) pf(Math.round(cx + Math.cos(a) * 14), Math.round(cy + Math.sin(a) * 6), SAND[3]);
    }
    if (i >= 4) for (let j = 0; j < 7; j++) {
      const t = ((i - 4) * 0.22 + j * 0.17) % 1;
      if (hash01(j, i, 9) > fade + 0.2) continue;
      featherDash(pf, cx + Math.cos(j * 2.4) * (4 + 9 * t), cy - 2 - 14 * (1 - t) * (j % 3 + 1) * 0.5, Math.cos(j) * 0.7, 0.6);
    }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/** Приземление «Взлёта»: стая разлетается кольцом — тёмное кольцо-ударная волна по земле и вороны, уходящие вверх наружу. */
function buildLandFx(): PC {
  const F = FX.land;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const fade = i < 4 ? 1 : Math.max(0, 1 - (i - 4) / 6);
    const Rr = Math.min(28, 3 + 3.0 * i);
    for (let a = 0; a < TAU; a += 0.035) {
      const x = cx + Math.cos(a) * Rr, y = cy + Math.sin(a) * Rr * 0.4;
      const fr = Math.sin(a) > 0;
      for (let w = 0; w < 2; w++) {
        if (hash01(Math.round(a * 30), w, i) > fade) continue;
        (fr ? pf : pb)(Math.round(x), Math.round(y) - w, [CORV[w ? 3 : 2][0], CORV[w ? 3 : 2][1], CORV[w ? 3 : 2][2], 230]);
      }
    }
    disc(pb, cx, cy, Rr, Rr * 0.4, (d) => (d < 0.82 ? [18, 24, 32, Math.round(70 * fade)] : null));
    if (i === 2) for (let r = 1; r <= 8; r++) for (const dx of [-1, 1]) pf(cx + dx * r, cy - 1, FIRE[r < 4 ? 4 : 3]);
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU + 0.3;
      const t = clamp((i - 1) / 8, 0, 1);
      const bx = Math.round(cx + Math.cos(a) * (4 + 22 * t)), by = Math.round(cy - 2 + Math.sin(a) * (2 + 9 * t) - 16 * t * (1 + (j % 3) * 0.3));
      if (i >= 1 && fade > 0.15) birdGlyph((x, y, c) => pf(x, y, c), bx, by, i + j, j % 2 === 0);
    }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
// ---------------- листы, проверки, монтажи ----------------
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
    for (let dy = -6 * k; dy <= 6 * k; dy++) for (let dx = -6 * k; dx <= 6 * k; dx++) {
      const X = x + i * k + dx, Y = y + j * k + dy;
      const dd = Math.hypot(dx - k / 2, dy - k / 2) / (6.4 * k);
      if (dd > 1 || !c.inside(X, Y) || big.alpha(X - x, Y - y)) continue;
      const cur = c.get(X, Y)!;
      c.data.set(mix(cur, [q[0], q[1], q[2], 255], 0.05 * (1 - dd)), (Y * c.w + X) * 4);
    }
  }
}
interface Assets { hero: PC; terrain: PC; golem: PC; ref: PC | null; lich?: PC | null }
const GOLEM_N = 64;
const heroAt = (A: Assets, row: number) => crop(A.hero, 0, row * 32, 32, 32);
type Sheets = { img: Record<MirAnim, PC>; emis: Record<MirAnim, PC> };
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
      text(c, `×${k} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ 32 · РУНОЛИТ 64 · ВОРОН-ДОКТОР 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | РЕФЕРЕНС 09`, 16, y0 + 8);
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
  const W = Math.max(24 + 2 * N * k + 16 + 40 + (A.ref ? A.ref.w : H) + 24, 1950);
  const TOP = 90 + 90 + 3 * 88 + 50 + 600;
  const c = new PC(W, TOP + 2 * (rowH + 70) + 20);
  fill(c, 0, 0, c.w, c.h, [30, 28, 34, 255]);
  const lich = A.lich ? crop(A.lich, 0, 0, 80, 80) : null;
  for (const [kk, y0] of [[1, 12], [3, 120]] as [number, number][]) {
    text(c, `×${kk} · ГЕРОЙ · ЛИЧ ВЕДРАС · ВОРОН-ДОКТОР ВНИЗ И ВБОК`, 24, y0, 2);
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
    text(c, "ПОКОЙ: ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | УДАР ПОСОХОМ | УДАР КРЫЛА | ПИКИРОВАНИЕ | ВЗЛЁТ (СТАЯ) | ПРИЗЕМЛЕНИЕ  (×3, ДЕНЬ / НОЧЬ)", 24, gy, 2);
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
    text(c, "РЕФЕРЕНС 09", 24 + 2 * N * k + 56, y - 36, 3);
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
/** Референс 09 → png высотой 560 с сохранением пропорций (через System.Drawing; чужой арт остаётся в tools/out, не в игре). */
function ensureRef(root: string): PC | null {
  const png = path.join(root, "tools", "out", "bosses139", "ref-09.png");
  const jpg = path.join(root, "tools", "out", "refs", "bosses-139", "09.jpg");
  if (!fs.existsSync(png) && fs.existsSync(jpg) && process.platform === "win32") {
    fs.mkdirSync(path.dirname(png), { recursive: true });
    const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${jpg}'); $h=560; $w=[int]($s.Width*$h/$s.Height); $b=New-Object System.Drawing.Bitmap $w,$h; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,$w,$h); $b.Save('${png}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  return fs.existsSync(png) ? loadPC(png) : null;
}

export function writeMirArt(root: string, outDir: string, quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => { const f = path.join(outDir, name); c.save(f); files.push(f); return c; };
  const sheets = animSheets(quick ? ["idle"] : undefined, quick ? 1 : 99);
  const lichF = path.join(root, "client", "public", "assets", "units", "umb_crown_lich.png");
  const A: Assets = {
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
    golem: loadPC(path.join(root, "client", "public", "assets", "units", "sol_rune_golem.png")),
    ref: ensureRef(root),
    lich: fs.existsSync(lichF) ? crop(loadPC(lichF), 0, 0, 80, 80) : null,
  };
  // силуэт: заливка одним цветом ×1 (и ×5) рядом с референсом
  if (process.argv.includes("--sil")) {
    const sc = new PC(N * 10 + 30 + 540, 560);
    fill(sc, 0, 0, sc.w, sc.h, [200, 190, 160, 255]);
    for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) {
      const fr = crop(sheets.img.idle, 0, row * FH, N, FH);
      for (let y = 0; y < FH; y++) for (let x = 0; x < N; x++) if (fr.alpha(x, y)) fr.set(x, y, [20, 20, 24, 255]);
      sc.blit(scaleNN(fr, 7), j * (N * 5 + 10), 0);
    }
    if (A.ref) sc.blit(A.ref, N * 10 + 30, 0);
    save(sc, "r59s-w-sil.png");
    return files;
  }
  save(buildCompare(sheets, A), "r59s-w-compare.png");
  if (quick) return files;
  const sheet = new PC(N * MIR_COLS, FH * 3), glow = new PC(N * MIR_COLS, FH * 3);
  for (const [a] of ANIM_ORDER) { sheet.blit(sheets.img[a], MIR_ANIMS[a].col * N, 0); glow.blit(sheets.emis[a], MIR_ANIMS[a].col * N, 0); }
  save(sheet, "rav-sheet.png");
  save(glow, "rav-glow.png");
  const fx = { wing: save(buildWingFx(), "rav-fx-wing.png"), dive: save(buildDiveFx(), "rav-fx-dive.png"), land: save(buildLandFx(), "rav-fx-land.png") };
  const rows = ["вниз", "вверх", "вбок"];
  const bad: string[] = [];
  for (let r = 0; r < 3; r++) for (let cI = 0; cI < MIR_COLS; cI++) {
    let hits = 0;
    for (let k2 = 0; k2 < FH; k2++) for (const [x, y] of [[0, k2], [N - 1, k2]]) { const q = sheet.get(cI * N + x, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    for (let k2 = 0; k2 < N; k2++) for (const y of [0, FH - 1]) { const q = sheet.get(cI * N + k2, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    if (hits) bad.push(`лист, ${rows[r]}, кадр ${cI + 1}: ${hits} px не цветом контура на краю`);
  }
  for (const [name, F] of Object.entries(FX)) {
    const c = fx[name as keyof typeof fx];
    for (let r = 0; r < 2; r++) for (let i = 0; i < F.n; i++) {
      let hits = 0;
      for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if ((x === 0 || y === 0 || x === F.w - 1 || y === F.h - 1) && c.alpha(i * F.w + x, r * F.h + y)) hits++;
      if (hits) bad.push(`эффект ${name}, слой ${r}, кадр ${i + 1}: ${hits} px на краю`);
    }
  }
  console.log(`  ${ID}: ${MIR_COLS} кадров × 3 вида, кадр ${N}×${FH}`);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 30).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; }
  else console.log("  проверки: край кадра чист, проколов нет");
  const W = 2000;
  const rowsP: Row[] = [sceneRow(A, sheets, false, 3), sceneRow(A, sheets, true, 3)];
  for (const [a] of ANIM_ORDER) rowsP.push(animRow(a, sheets, A, W));
  for (const a of ["idle", "leapHold", "wingHold"] as MirAnim[]) rowsP.push(animRow(a, sheets, A, W, true));
  const names: Record<MirFx, string> = { wing: "УДАР КРЫЛА", dive: "МЕТКА ПИКИРОВАНИЯ", land: "ПРИЗЕМЛЕНИЕ СТАИ" };
  for (const kx of Object.keys(FX) as MirFx[]) rowsP.push(fxRow(`×2 · ЭФФЕКТ МИРА · ${names[kx]} · ${FX[kx].n} КАДРОВ · ${FX[kx].fps} К/С · УДАР — КАДР ${FX[kx].hit + 1}`, fx[kx], FX[kx], A, W, FX[kx].w));
  save(stackRows(rowsP, W), "rav-pilot.png");
  return files;
}

/** Кадры галереи: [img, emis, flip]. */
function gallery(sheets: Sheets): { img: PC; emis: PC; flip?: boolean }[] {
  const idle = (row: number, flip = false) => ({ img: crop(sheets.img.idle, 0, row * FH, N, FH), emis: crop(sheets.emis.idle, 0, row * FH, N, FH), flip });
  const pose = (p: Pose, v: View) => renderMir(v, p);
  return [idle(0), idle(1), idle(2), idle(2, true), pose(POSES.attack("down")[6], "down"), pose(POSES.wingStrike("down")[3], "down"), pose(POSES.diveCast("down")[1], "down"), pose(POSES.leapHold("down")[1], "down"), pose(POSES.leapLand("down")[3], "down")];
}
/** Ночь только по части холста. */
function nightRectPart(c: PC, x: number, y: number, w: number, h: number) { nightRect(c, x, y, w, h); }
const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/sol_plague_raven.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const files = writeMirArt(root, path.join(root, "tools", "out", "bosses139"), process.argv.includes("--quick"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void linear; void hex; void cross;
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
