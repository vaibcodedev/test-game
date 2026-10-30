/**
 * Задача 139, босс кольца: хозяин миражей (запад, слот r45n, ур. 45, группа 3; карточка — docs/systems/bosses.md, раздел 3.3 п. 1 и
 * «Раскладка референсов»). Образ — по референсу tools/out/refs/bosses-139/11.jpg (рогатый чародей: красно-коричневая кожа,
 * два больших завитых рога, седые волосы, остроухий; длинный сине-серый сюртук с высоким воротом поверх белой вышитой
 * туники, алая подкладка плаща, резное бронзовое наплечье, бронзовые наручи, перевязь, сумка, книга в левой руке; очень
 * высокий бронзовый посох в правой руке с завитком-бараньим рогом; красный хвост с кисточкой по земле) —
 * только для сравнения: чужой арт в игру и в git не идёт.
 *
 * Метод — как у палача и лича (tools/gen/bosses139/umb_ash_executioner.ts): общий движок tools/gen/mobs/lib.ts, луч на пиксель,
 * 5 тонов на материал, тень, затенение складок, выборочный контур 1 px (selout из rig.ts). Кадр 64×64 (таблица 3.1:
 * ур. 45–59), ступни на y = 60; модель — в росте боссов стартовых земель, без масштаба. Жёсткий слой тела двигается на целые
 * пиксели (snapM). Светится (ночью не гаснет): глаза, жемчужина в завитке посоха, пряжка, серьга, руны круга-печати.
 * Огонь посоха, песок, двойники-«миражи» и круг-печать — 2D-слои поверх тела с проверкой глубины; петли бесшовные, движения
 * с easing, 12–15 к/с.
 *
 * Эффекты мира (строка 0 — под юнитами, 1 — над): конус «Жар-клинка», воронка («Зыбучие воронки»), мираж-двойник («Ложные
 * двойники»), кольцо «Песчаного смерча».
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/umb_crimson_vampire.ts [--quick] →
 *   tools/out/bosses139/mir-sheet.png, mir-glow.png, mir-fx-*.png, mir-pilot.png, r45n-e-compare.png («наш | референс»);
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

export const ID = "umb_crimson_vampire";
export const FRAME = 64;
/** Кадр 64×80 (высокий, узкий силуэт): ширина FRAME, высота FRAME_H. */
export const FRAME_H = 80;
const FW = FRAME, FH = FRAME_H;
const N = FW;
/** Кадр 1× (2D-слои, проверки) и холст отрисовки тела в двойном разрешении (160×160, кадр — x 16..144). */
const CAM: Cam = { N: FW, CX: 32, GY: 76.4 };
const RS = 2;
const CAMR: Cam = { N: 160, CX: 80, GY: 152.8 };
const RX0 = 16;
/** Модель → пиксели кадра 1×: 1,25 (росту ~62 px при кадре 80). */
const K = 1.35;
/** Верх тела поднят над бёдрами (длинные ноги). */
const LIFT = 3;
const PXM = PX / K;
const snapM = (view: View, w: V3): V3 => mul(snapPx(view, mul(w, K)), 1 / K);
const pxM = (view: View, dx: number, dy: number): V3 => fromView(view, [dx / K, 0, -dy * PXM]);

// ---------------- палитра ----------------
/** Кожа: красно-коричневая, тени багровые. */
const SKIN = R("#4a3a5a", "#7c6890", "#b4a2c4", "#dccfe8", "#f8f2fc");
/** Рога: медно-красные, светлые кольца роста. */
const HORN = R("#2a1109", "#582414", "#8a3f22", "#b9683a", "#e29f6c");
/** Сюртук: сине-серый сланец. */
const SLATE = R("#0d0816", "#1e1230", "#33204e", "#503673", "#8462ac");
/** Подкладка плаща: алая. */
const CRIM = R("#3a0c26", "#762049", "#b03577", "#e060a0", "#ff9cc8");
/** Туника: холст. */
const CREAM = R("#2c2830", "#58525e", "#8e8896", "#c2bccb", "#ece8f0");
/** Бронза: наплечье, наручи, посох, оковка. */
/** Медь наплечий и наручей: краснее бронзы посоха. */
const COPPER = R("#120a20", "#2a1844", "#46286a", "#6e48a0", "#a684d2");
const BRONZE = R("#3a2808", "#7a5810", "#bc8c20", "#e8c04a", "#fff0a0");
/** Древко посоха: тёмное дерево. */
const WOODS = R("#100a1a", "#241636", "#3c2656", "#583a7a", "#7a5aa0");
/** Кожа ремней и сумки. */
const LEATH = R("#0a0610", "#180e24", "#2a1a3e", "#40285c", "#5c3c80");
/** Штаны: чёрные. */
const BLACK = R("#07040c", "#130b20", "#221436", "#35214f", "#4c3270");
/** Волосы: седые. */
const HAIR = R("#6a6678", "#948fa4", "#bcb8c8", "#e0dde8", "#ffffff");
/** Золотое свечение: глаза, жемчужина, руны. */
const GLOWC = R("#4a1208", "#b02a18", "#f04c28", "#ffb040", "#fff0b8");
/** Огонь «Жар-клинка». */
const FIRE = R("#5a1404", "#b63a0c", "#f07a1c", "#ffc04a", "#fff1b8");
const DEAD = R("#121112", "#262223", "#3b3434", "#544a47", "#6e625c");
/** Песок пустыни. */
const SAND = R("#180a22", "#341450", "#5c2488", "#9a44c4", "#e08cf0");
const DUST = SAND;
const VOID = hex("#0a0605");

const M = {
  skin: mat("кожа", SKIN, { base: 1.7, gain: 2.3 }),
  horn: mat("рог", HORN, { base: 1.8, gain: 2.3, hi: 4 }),
  slate: mat("сюртук", SLATE, { base: 1.6, gain: 2.4 }),
  crim: mat("плащ", CRIM, { base: 1.7, gain: 2.3 }),
  cream: mat("туника", CREAM, { base: 1.9, gain: 2.0 }),
  bronze: mat("бронза", BRONZE, { base: 2.1, gain: 2.3 }),
  copper: mat("медь", COPPER, { base: 2.0, gain: 2.5, hi: 4 }),
  wood: mat("древко", WOODS, { base: 2.0, gain: 2.0 }),
  leath: mat("кожа ремней", LEATH, { base: 1.7, gain: 2.2 }),
  black: mat("штаны", BLACK, { base: 1.6, gain: 2.3 }),
  hair: mat("волосы", HAIR, { base: 1.9, gain: 2.2 }),
  glow: mat("свет", GLOWC, { base: 2.8, gain: 1.0, glow: true, crisp: true }),
  edge: mat("кромка", BRONZE, { base: 3.6, gain: 0.6, crisp: true }),
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
  /** кулаки: [правый — хват посоха, если не held; левый — книга]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** посох: [пятка (едет с телом, пока в руке), направление пятка → завиток]; flat — плоскость завитка (нормаль), held — в руке */
  staff: [V3, V3]; flat: V3; held: number;
  armLift: [number, number];
  /** подол и плащ: волна, шаг (стопы), раскачка кистей и хвоста (px) */
  wave: number; waveAmp: number; kick: [number, number]; sway: number; tail: number;
  /** свечение глаз и жемчужины 0..1,6; огонь на завитке 0..1; круг-печать 0..1; увядание; на коленях */
  glow: number; fire: number; sigil: number; wither: number; kneel: number;
  /** песчаный вихрь у ног 0..1 (swirlPh — фаза), двойники-миражи (расхождение 0..1), книга поднята (0 — у бедра, 1 — перед грудью) */
  swirl: number; swirlPh: number; ghost: number; book: number; stars: number;
  ring: number; ringAt?: V3; flash: number; flashAt?: V3; dust: [number, number];
  trail?: V3[];
  t: number; seed: number;
}

const HIP0 = 21;
const NECK: V3 = [0, 0.4, 41.4];
const ARM: [number, number] = [8.2, 8.4];
/** Посох: от пятки до основания завитка; хват правой руки — SG от пятки. */
const STAFF_L = 46;
const SG = 7;
const SPIRAL_R = 3.2;

const dirN = (d: V3): V3 => norm(d);
const stf = (grip: V3, dir: V3): [V3, V3] => { const d = dirN(dir); return [sub(grip, mul(d, SG)), d]; };
const STAFF_FRONT = stf([9.0, 5.0, 39.5], [0.22, 0.18, -0.96]);
const STAFF_SIDE = stf([8.0, 7.0, 39.5], [0, 0.3, -0.95]);
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.02, yaw: 0, roll: 0, hp: 0.02, hy: 0, hr: 0,
  hand: [[0, 0, 0], [-12.5, 4.0, 49.5]], pole: [[1, -0.3, -0.7], [-1, 0.2, 0.4]],
  staff: STAFF_FRONT, flat: [0, 1, 0], held: 1, armLift: [0, 0],
  wave: 0, waveAmp: 0, kick: [0, 0], sway: 0, tail: 0,
  glow: 1, fire: 0, sigil: 0, wither: 0, kneel: 0,
  swirl: 0, swirlPh: 0, ghost: 0, book: 0, stars: 0,
  ring: 0, flash: 0, dust: [0, 0], t: 0, seed: 1,
};
const REST_SIDE: Pose = { ...REST_FRONT, staff: STAFF_SIDE, flat: [-1, 0, 0.05], hand: [[0, 0, 0], [-8.5, 8.0, 49.5]], pole: [[1, -0.3, -0.7], [-1, 0.2, 0.4]] };
const restOf = (view: View): Pose => (view === "side" ? REST_SIDE : REST_FRONT);
const bodyShift = (view: View, p: Pose): V3 => snapM(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.kneel * 7]);

// ---------------- штампы ----------------
type Keys = Record<string, RGBA>;
/** Брови и глаза: густые тёмные брови, под ними золотые точки (лицо строгое, взгляд исподлобья). */
/** Штамп в пикселях двойного разрешения: каждый пиксель 1× — блок 2×2. */
const up2 = (px: StampPx[]): StampPx[] => px.flatMap(([x, y, c]) => [[x * 2, y * 2, c], [x * 2 + 1, y * 2, c], [x * 2, y * 2 + 1, c], [x * 2 + 1, y * 2 + 1, c]] as StampPx[]);
/** Красные узоры на скулах: две полосы вниз от глаз. */
const ST_TATTOO: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: up2(stampRows(["r....r", ".r..r.", ".r..r."], -3, 0)),
  side: up2(stampRows(["r", "r"], 0, 0)),
};
const ST_EYES: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: up2(stampRows(["kk..kk", "3d..d3"], -3, -1)),
  side: up2(stampRows(["kk", "d3"], 0, -1)),
};
/** Жемчужина-пряжка и тиснение на белой тунике: ромбы. */
const ST_DIAMOND: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: stampRows([".d.", "dsd", ".d."], -1, -1),
  side: stampRows(["d", "s"], 0, 0),
};
function stampKeys(glow: number): Keys {
  const g = clamp(glow, 0, 1.6);
  const lv = (k: number) => {
    const v = k - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.25 ? 1 : 0);
    return v < 0 ? VOID : GLOWC[clamp(v, 0, 4)];
  };
  return { r: CRIM[3], k: HAIR[1], d: CREAM[1], s: CREAM[3], "1": lv(1), "2": lv(2), "3": lv(3) };
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

/** Чародей в координатах модели. */
function build(p0: Pose, view: View): { S: Scene; X: Extra } {
  const S = new Scene();
  const X: Extra = { sigil: null, rings: [], flash: null, dust: [], swirl: null, sparks: [], stars: null, glints: [] };
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.28, hy: p0.hy - 0.15 } : p0;
  const W = p.wither;
  const shift = bodyShift(view, p);
  const pel: V3 = add([0, 0, HIP0], shift);
  const up = p.chest * PXM, hz = p.headZ * PXM;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  const T = (v: V3, lift = v[2] >= 26): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, (lift ? up : 0) + LIFT]);
  const PR = (v: V3): V3 => rot(v, p.pitch * 0.25, p.yaw * 0.35, p.roll * 0.5);
  const PV = (v: V3): V3 => add(add(pel, PR(sub(v, [0, 0, HIP0]))), [0, 0, LIFT]);
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0, yaw = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, yaw, roll)), f(rot([0, 1, 0], pitch, yaw, roll)), f(rot([0, 0, 1], pitch, yaw, roll)),
  ];
  const keys = stampKeys(p.glow);
  const kn = p.kneel;
  const sw = p.sway * PXM;

  // ---------- плащ-крылья: огромный розовый плащ с рваными зубцами, подкладка алая; шире плеч, ложится крыльями по бокам ----------
  {
    const g = S.group(1.2);
    const folds = (c: { l: V3; edge: boolean }) => {
      if (c.edge) return 0;
      const f = Math.sin(c.l[0] * 1.1 + 0.6);
      return f > 0.8 ? -0.8 : f < -0.9 ? 0.45 : 0;
    };
    const cx = pel[0] + sw * 0.3, cy = pel[1] - 5.2;
    const sway = p.wave * 0 + 0;
    void sway;
    // спинка
    S.ell(g, wm(M.crim, W), [cx, cy, 25.4 - kn * 4], [4.4, 1.3, 18.0 - kn * 2], axes(PR), { tex: folds as never, part: S.newPart() });
    // крылья: вынесены по бокам, веером вниз и наружу; на кромке — зубцы
    for (const s of [1, -1]) {
      const wing = S.newPart();
      S.ell(g, wm(M.crim, W), [cx + s * 6.6, cy + 0.2, 23.4 - kn * 4], [2.8, 1.0, 16.4 - kn * 2], axes(PR, s * 0.2), { tex: folds as never, part: wing, tone: 0.1 });
      S.ell(g, wm(M.crim, W), [cx + s * 9.8, cy + 0.6, 19.0 - kn * 4], [2.0, 0.9, 13.0 - kn * 2], axes(PR, s * 0.42), { tex: folds as never, part: wing, tone: 0.2 });
      for (let i = 0; i < 5; i++) {
        const tx = cx + s * (5.0 + i * 1.9), tz0 = 14 - i * 1.4, lift = Math.round(p.waveAmp * (0.5 + 0.5 * Math.sin(TAU * (p.wave + i * 0.21 + (s > 0 ? 0 : 0.5))))) * PXM;
        S.cone(g, wm(M.crim, W), [tx, cy + 0.4, tz0 + 3], 1.9, [tx + s * 1.6, cy + 0.2, Math.max(0.5, 0.8 + i * 1.6 + lift - kn * 3)], 0.25, { part: S.newPart(), tone: i % 2 ? -0.15 : 0.25 });
      }
      // золотой наплечный диск на крыле
      S.ball(g, wm(M.bronze, W), [cx + s * 8.4, cy + 1.0, 33.0], 0.9, { part: S.newPart() });
    }
  }
  // ---------- ноги: длинные латные поножи с шипами и золотой оковкой, сапоги на каблуке ----------
  {
    const g = S.group(0.9);
    for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
      const k = p.kick[i];
      const ft: V3 = [pel[0] + s * 2.5, pel[1] + 0.6 + 3.4 * k, Math.max(0, 3.4 + 2.6 * Math.max(0, k)) - kn * 2.4];
      const hip: V3 = [pel[0] + s * 2.4, pel[1], HIP0 + 1 + shift[2]];
      const knee = ik(hip, add(ft, [0, 0, 2]), 10.8, 10.8, [0, 1, 0.1]);
      S.cone(g, wm(M.slate, W), hip, 2.5, knee, 2.1, { tone: -0.05, big: true });
      S.cone(g, wm(M.slate, W), knee, 2.1, add(ft, [0, 0, 2.6]), 1.7, { tone: 0.05, big: true });
      // наколенник с золотой вставкой и шипом вперёд; золотая полоса по бедру
      S.ell(g, wm(M.copper, W), add(knee, [0, 1.8, 0]), [2.6, 1.2, 2.2], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], { part: S.newPart(), tone: 0.35 });
      S.cone(g, wm(M.copper, W), add(knee, [0, 2.4, 0.2]), 0.9, add(knee, [0, 5.0, 0.8]), 0.1, { part: S.newPart() });
      S.ball(g, wm(M.bronze, W), add(knee, [0, 2.9, 0]), 0.75, { part: S.newPart() });
      S.cone(g, wm(M.bronze, W), add(hip, [s * 0.5, 2.0, -2]), 0.45, add(knee, [s * 0.4, 2.4, 2]), 0.45, { part: S.newPart() });
      // плавник-шип на голени наружу и назад
      S.cone(g, wm(M.copper, W), add(knee, [s * 1.8, -0.6, -3]), 0.9, add(ft, [s * 4.6, -2.4, 4.6]), 0.1, { part: S.newPart(), tone: 0.2 });
      // сапог: высокий, носок острый, каблук
      S.cone(g, wm(M.copper, W), add(ft, [0, 0, 6.2]), 2.1, add(ft, [0, 0, 1.6]), 1.9, { part: S.newPart(), tone: 0.15 });
      S.ell(g, wm(M.slate, W), add(ft, [0, 2.6, 0.8]), [1.6, 3.6, 1.3], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], { part: S.newPart() });
      S.cone(g, wm(M.copper, W), add(ft, [0, 5.0, 0.8]), 0.8, add(ft, [0, 7.4, 1.4]), 0.1, { part: S.newPart() });
      S.cone(g, wm(M.copper, W), add(ft, [0, -2.2, 1.2]), 0.9, add(ft, [0, -3.8, 3.2]), 0.1, { part: S.newPart() });
    }
  }
  // ---------- набедренники, торс в доспехе, пояс с черепом, золотая перевязь ----------
  {
    const g = S.group(1.8);
    const bot: V3 = [pel[0] + sw * 0.1, pel[1] + 0.2, 20.2 - kn * 6];
    const trim = (c: { u: number }) => (c.u > 0.94 ? { mat: M.bronze, d: -0.3 } : 0);
    // юбка из пластин: узкий конус до середины бедра и две передние пластины
    S.cone(g, wm(M.slate, W), PV([0, 0.2, 25.4]), 3.7, bot, 4.6 + 1.2 * kn, { tex: trim as never, tone: -0.1 });
    const fw = norm(PR([0, 1, 0.1])), sd = PR([1, 0, 0]), upV = norm(PR([0, -0.2, 1]));
    for (const s of [1, -1]) {
      const c = PV([s * 1.8, 3.9, 22.2 + kn * 2]);
      S.box(g, wm(M.copper, W), c, [1.6, 0.5, 5.2 - kn * 2], [sd, fw, upV], 0.35, { tex: trim as never, part: S.newPart(), tone: 0.1 });
      S.cone(g, wm(M.copper, W), add(c, mul(upV, -5.2 + kn * 2)), 1.7, add(c, add(mul(upV, -8.4 + kn * 2), mul(sd, s * 0.6))), 0.15, { part: S.newPart(), tone: 0.1 });
    }
    // торс: узкий, грудь выпуклая, гребень по центру светлее; золотые линии
    S.ell(g, wm(M.slate, W), T([0, 0.4, 32.6]), [3.8, 3.1, 6.6], axes(TV), { big: true });
    S.ell(g, wm(M.copper, W), T([0, 2.2, 33.6]), [1.3, 1.1, 5.0], axes(TV), { part: S.newPart(), tone: 0.4 });
    S.cone(g, wm(M.slate, W), PV([0, 0, 21]), 3.3, T([0, 0.3, 29.5]), 3.7, { tone: -0.1 });
    S.cone(g, wm(M.bronze, W), T([4.2, 2.4, 36.0]), 0.45, T([-3.0, 4.4, 24.8]), 0.45, { part: S.newPart() });
    // пояс и череп-пряжка
    S.ell(g, wm(M.leath, W), PV([0, 0.4, 25.2]), [3.6, 3.2, 1.0], axes(PR), { part: S.newPart() });
    const sk = PV([-1.6, 3.8, 24.0]);
    S.ball(g, wm(M.cream, W), sk, 1.7, { part: S.newPart() });
    S.ell(g, wm(M.cream, W), add(sk, mul(fw, 0.4)), [1.1, 0.9, 0.7], axes(PR), { part: S.newPart(), tone: -0.2 });
    for (const s of [1, -1]) S.ball(g, wm(M.black, W), add(sk, add(mul(fw, 1.4), mul(sd, s * 0.7))), 0.4, { part: S.newPart() });
    S.ball(g, M.glow, PV([0.8, 4.4, 26.2]), 0.5, { part: S.newPart() });
  }


  // ---------- меч: огромный тёмно-фиолетовый клинок остриём вниз, ажурная гарда-когти, навершие; пятно света по лезвию ----------
  const held = p.held >= 0.5;
  const ad = norm(p.staff[1]);
  const butt: V3 = add(p.staff[0], held ? shift : [0, 0, 0]);
  const flat = norm(perp(ad, p.flat));
  const e = norm(cross(ad, flat));
  const top = add(butt, mul(ad, STAFF_L));
  const grip0 = add(butt, mul(ad, SG));
  const pearl: V3 = top;
  {
    const g = S.group(0.5);
    // навершие и рукоять
    S.ball(g, wm(M.bronze, W), butt, 1.3, { part: S.newPart() });
    S.cone(g, wm(M.leath, W), butt, 0.9, add(butt, mul(ad, 9.0)), 0.9, { part: S.newPart() });
    // гарда: поперечина с загнутыми кверху когтями и ажурным кольцом
    const gd = add(butt, mul(ad, 9.6));
    const gp = S.newPart();
    S.box(g, wm(M.copper, W), gd, [5.4, 0.8, 0.9], [e, flat, ad], 0.3, { part: gp, tone: 0.2 });
    for (const s of [1, -1]) {
      const a = add(gd, mul(e, s * 5.2));
      S.cone(g, wm(M.copper, W), a, 0.9, add(add(a, mul(e, s * 1.6)), mul(ad, -3.4)), 0.12, { part: gp, tone: 0.3 });
      S.cone(g, wm(M.copper, W), a, 0.8, add(add(a, mul(e, s * 0.4)), mul(ad, 3.0)), 0.12, { part: gp, tone: 0.1 });
    }
    S.ball(g, wm(M.bronze, W), gd, 1.0, { part: S.newPart() });
    // клинок: плоский, с долом по центру и светлой кромкой; сужается к острию
    const bl0 = 10.6, bl1 = STAFF_L - 4.2;
    const bc = add(butt, mul(ad, (bl0 + bl1) / 2));
    const fuller = (q: { l: V3; edge: boolean }) => {
      if (q.edge) return { mat: M.copper, d: 1.2 };
      return Math.abs(q.l[0]) < 0.5 ? -0.9 : Math.abs(q.l[0]) > 1.35 ? 0.7 : 0;
    };
    S.box(g, wm(M.slate, W), bc, [1.9, 0.5, (bl1 - bl0) / 2], [e, flat, ad], 0.25, { tex: fuller as never, part: S.newPart(), big: true, tone: 0.2 });
    S.cone(g, wm(M.slate, W), add(butt, mul(ad, bl1 - 0.3)), 1.9, top, 0.1, { part: S.newPart(), tone: 0.25 });
    X.glints.push(top);
  }

  // ---------- руки: правая держит меч (латная перчатка), левая поднята — когти; наручи с плавниками ----------
  {
    const g = S.group(1.0);
    const lift = pxM(view, 0, -p.armLift[0]);
    const sh = add(T([6.0, 0.2, 36.6]), lift);
    const fist: V3 = held ? grip0 : add(add(p.hand[0], shift), lift);
    const el = ik(sh, fist, ARM[0], ARM[1], p.pole[0]);
    S.cone(g, wm(M.slate, W), sh, 2.5, el, 2.1, { tone: 0.1 });
    const fd = norm(sub(fist, el));
    S.cone(g, wm(M.copper, W), add(el, mul(fd, 0.8)), 2.1, sub(fist, mul(fd, 1.2)), 2.3, { part: S.newPart() });
    S.cone(g, wm(M.bronze, W), add(el, mul(fd, 3.2)), 2.25, add(el, mul(fd, 3.9)), 2.25, { part: S.newPart() });
    const e0 = perp(fd, [0, 0, 1]);
    S.ell(g, wm(M.copper, W), fist, [2.0, 1.9, 2.3], [e0, cross(fd, e0), fd], { part: S.newPart(), tone: 0.1 });
    // левая: рука поднята, пальцы-когти растопырены
    const g2 = S.group(1.0);
    const lift2 = pxM(view, 0, -p.armLift[1]);
    const sh2 = add(T([-6.0, 0.2, 36.6]), lift2);
    const fist2 = add(add(p.hand[1], shift), lift2);
    const el2 = ik(sh2, fist2, ARM[0], ARM[1], p.pole[1]);
    S.cone(g2, wm(M.slate, W), sh2, 2.5, el2, 2.1, { tone: 0.1 });
    const fd2 = norm(sub(fist2, el2));
    S.cone(g2, wm(M.copper, W), add(el2, mul(fd2, 0.8)), 2.1, sub(fist2, mul(fd2, 1.2)), 2.0, { part: S.newPart() });
    // плавники наручи: два шипа назад от предплечья
    for (const q of [0.35, 0.65]) {
      const b = add(el2, mul(sub(fist2, el2), q));
      S.cone(g2, wm(M.copper, W), b, 0.9, add(b, [-2.6, -1.4, -3.6 + q * 2]), 0.1, { part: S.newPart(), tone: 0.15 });
    }
    S.ell(g2, wm(M.skin, W), fist2, [1.8, 1.5, 2.0], [perp(fd2, [0, 0, 1]), cross(fd2, perp(fd2, [0, 0, 1])), fd2], { part: S.newPart() });
    const sp = 0.8 + 0.4 * clamp(p.book, 0, 1);
    for (let i = -1; i <= 1; i++) {
      const dir = norm(add(add(mul(fd2, 1.0), mul(perp(fd2, [0, 0, 1]), i * sp)), [0, 0.3, 0.6]));
      S.cone(g2, wm(M.skin, W), add(fist2, mul(dir, 1.4)), 0.85, add(fist2, mul(dir, 6.2)), 0.15, { part: S.newPart(), tone: 0.1 });
    }
    S.cone(g2, wm(M.skin, W), fist2, 0.7, add(fist2, norm([1.2, 0.6, 0.6])), 0.2, { part: S.newPart() });
  }
  // ---------- плечи: широкие чешуйчатые наплечья с длинными шипами вверх и назад, золотой диск ----------
  {
    const g = S.group(0.9);
    for (const s of [1, -1]) {
      const big = s > 0 ? 1.0 : 0.9;
      S.ell(g, wm(M.slate, W), T([s * 6.4, -0.2, 38.2]), [3.4 * big, 2.9 * big, 2.4 * big], axes(TV, s * 0.4), { big: true, part: S.newPart(), tone: 0.15 });
      S.ell(g, wm(M.copper, W), T([s * 6.9, -0.1, 36.2]), [2.8 * big, 2.5 * big, 1.4], axes(TV, s * 0.55), { part: S.newPart(), tone: 0.1 });
      S.ball(g, wm(M.bronze, W), T([s * 6.9, 2.2, 38.4]), 0.8, { part: S.newPart() });
      const b = T([s * 6.0, -1.0, 39.8]);
      S.cone(g, wm(M.copper, W), b, 1.5, add(b, TV([s * 2.6, -3.0, 8.0 * big])), 0.12, { part: S.newPart(), tone: 0.3 });
      S.cone(g, wm(M.copper, W), add(b, TV([s * 1.0, 0.2, 0])), 1.0, add(b, TV([s * 5.0, 0.2, 3.4])), 0.1, { part: S.newPart(), tone: 0.2 });
    }
  }

  // ---------- голова: бледное лицо с красными узорами, острые скулы, белые зачёсанные волосы, высокий воротник с алой подкладкой ----------
  {
    const g = S.group(1.2);
    const HC = 45.8;
    S.cone(g, wm(M.skin, W), T([0, 0.2, 37.0], true), 1.8, H([0, 0.4, 42.6]), 1.7, { part: S.newPart(), tone: -0.25 });
    // воротник: два высоких крыла, внутри алое
    for (const s of [1, -1]) {
      S.ell(g, wm(M.slate, W), H([s * 3.6, -0.9, 43.8]), [1.1, 2.8, 4.6], axes(HV, s * 0.35, 0, 0), { part: S.newPart(), tone: 0.1 });
      S.ell(g, wm(M.crim, W), H([s * 2.9, 0.2, 43.0]), [0.7, 2.2, 3.8], axes(HV, s * 0.3, 0, 0), { part: S.newPart(), tone: -0.1 });
      S.cone(g, wm(M.copper, W), H([s * 4.0, -1.2, 46.4]), 0.8, H([s * 5.6, -2.8, 50.4]), 0.1, { part: S.newPart(), tone: 0.2 });
    }
    S.ell(g, wm(M.slate, W), H([0, -3.2, 43.4]), [3.6, 1.4, 3.8], axes(HV), { part: S.newPart(), tone: 0.05 });
    // голова: череп, острые скулы, длинный подбородок
    S.ell(g, wm(M.skin, W), H([0, 0.5, HC]), [3.4, 3.7, 4.3], axes(HV), { big: true });
    S.ell(g, wm(M.skin, W), H([0, 1.8, HC - 2.5]), [2.6, 2.7, 2.5], axes(HV), { part: S.newPart(), tone: -0.2 });
    S.cone(g, wm(M.skin, W), H([0, 2.4, HC - 2.6]), 1.4, H([0, 3.4, HC - 4.6]), 0.6, { part: S.newPart(), tone: -0.3 });
    S.ell(g, wm(M.skin, W), H([0, 3.0, HC + 1.0]), [2.6, 1.0, 0.7], axes(HV), { part: S.newPart(), tone: -0.45 });
    S.cone(g, wm(M.skin, W), H([0, 3.3, HC + 0.2]), 0.8, H([0, 5.0, HC - 1.6]), 0.4, { part: S.newPart(), tone: 0.25 });
    for (const s of [1, -1]) S.cone(g, wm(M.skin, W), H([s * 2.8, 0.2, HC - 0.2]), 0.9, H([s * 5.6, -1.0, HC + 2.4]), 0.12, { part: S.newPart() });
    // белые волосы: гладко назад, прядь на затылок
    S.ell(g, wm(M.hair, W), H([0, -0.5, HC + 2.3]), [3.7, 3.7, 3.0], axes(HV), { part: S.newPart(), big: true });
    S.cone(g, wm(M.hair, W), H([0, -2.6, HC + 1.6]), 2.0, H([0, -5.0, HC - 3.2]), 0.5, { part: S.newPart(), tone: 0.2 });
    S.stamps.push({ at: H([0, 4.0, HC + 0.3]), n: HV([0, 1, 0]), px: ST_EYES, colors: keys, glow: GLOW_KEYS, halo: GLOWC[2], depthTol: 2.4, minFacing: 0.2 });
    S.stamps.push({ at: H([0, 3.9, HC - 1.6]), n: HV([0, 1, 0]), px: ST_TATTOO, colors: keys, depthTol: 2.4, minFacing: 0.2 });
  }

  // ---------- частицы и эффекты ----------
  if (p.sigil > 0.02) X.sigil = { c: [pel[0], pel[1] - 8, 42], r: 15.5 * (0.85 + 0.15 * p.sigil), ph: p.swirlPh, k: p.sigil };
  if (p.ring > 0.02) X.rings.push({ c: p.ringAt ?? [pel[0], pel[1], 0], r: 3 + 22 * p.ring, k: 1 - p.ring });
  if (p.flash > 0.02) X.flash = { at: p.flashAt ?? add(pearl, [0, 0, 0]), k: p.flash };
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) X.dust.push({ at: i === 0 && p.flashAt ? [p.flashAt[0], p.flashAt[1], 0] : [pel[0] + (i ? -6 : 6), pel[1] + 6, 0], k: p.dust[i] });
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
/** Стая летучих мышей: тело частично рассыпается (по ключу k), вокруг фигуры кружат мыши. */
function drawBats(img: PC, k: number, t: number) {
  if (k < 0.02) return;
  for (let y = 2; y < FH - 2; y++) for (let x = 2; x < FW - 2; x++) if (img.alpha(x, y) > 200 && hash01(x, y, 17) < 0.5 * k) img.clear(x, y);
  const UP = ["x...x", "xx.xx", ".xxx."], DOWN = [".xxx.", "xx.xx", "x...x"];
  const n = Math.round(5 + 10 * k);
  for (let i = 0; i < n; i++) {
    const ang = i * 2.39 + t * TAU * (i % 2 ? 1 : -1) * 0.5;
    const rr = (9 + 15 * ((i * 0.37) % 1)) * (0.5 + 0.5 * k);
    const cx = Math.round(32 + Math.cos(ang) * rr), cy = Math.round(36 + Math.sin(ang) * rr * 0.9 - 4);
    const pat = Math.floor(t * 6 + i) % 2 ? UP : DOWN;
    pat.forEach((row, j) => [...row].forEach((ch, q) => {
      if (ch !== "x") return;
      const X = cx - 2 + q, Y = cy - 1 + j;
      if (X < 1 || Y < 1 || X >= FW - 1 || Y >= FH - 1) return;
      img.set(X, Y, j === 1 && q === 2 ? BLACK[1] : q === 0 || q === 4 ? BLACK[2] : SLATE[1]);
    }));
    if (cx >= 1 && cx < FW - 1 && cy >= 1 && cy < FH - 1) img.set(cx, cy, GLOWC[3]);
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
  // контровой свет: светлая розово-сиреневая кромка 1 px по внешнему силуэту — сильнее со стороны света (сверху и слева), слабее с других
  {
    const RIM: RGBA = [244, 196, 250, 255];
    const empty = (x: number, y: number) => { const q = img.get(x, y); return !q || q[3] < 120 || isOut(q); };
    const snap = img.clone();
    const same = (x: number, y: number) => { const q = snap.get(x, y); return !q || q[3] < 120 || isOut(q); };
    void empty;
    for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) {
      const q = snap.get(x, y)!;
      if (q[3] < 200 || isOut(q) || isEmisCol(q)) continue;
      const tl = same(x, y - 1) || same(x - 1, y), other = same(x + 1, y) || same(x, y + 1);
      if (!tl && !other) continue;
      const m = mix(q, RIM, tl ? 0.62 : 0.3);
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
  if (pose.ghost > 0.02) drawBats(img, pose.ghost, pose.t);
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

/** Покой: дыхание по пикселю (грудь, плечи, голова), плащ и кисти качаются, хвост ведёт кончиком, жемчужина дышит. */
function idlePoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const sway = [0, 0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
  const tail = [0, 0, 1, 1, 2, 2, 2, 1, 1, 0, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    return { ...R0, t, seed: 100 + i, chest: chest[i], headZ: head[i] - chest[i], sway: sway[i], tail: tail[i], wave: t, waveAmp: 1, glow: 1 + 0.25 * Math.sin(t * TAU) };
  });
}
/** Меч в позе: боковая (lat) и передняя (fwd) координаты хвата в виде «вниз»; в виде «вбок» боковая теряется, вперёд — по y. */
const SW = (view: View, lat: number, fwd: number, z: number, dlat: number, dfwd: number, dz: number): [V3, V3] =>
  view === "side" ? stf([8, fwd + 2, z], [0, dfwd, dz]) : stf([lat, fwd, z], [dlat, dfwd, dz]);
/** Ходьба: размеренный шаг, меч в руке покачивается остриём вниз, плащ-крылья колышутся. */
function walkPoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const bob = [0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0];
  const swayX = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0];
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    const fw = Math.sin(TAU * u), lift = Math.max(0, Math.cos(TAU * u));
    return {
      ...R0, t: u, seed: 150 + i,
      root: [side ? 0 : swayX[i], 0, 0] as V3, bob: bob[i] * PXM,
      kick: [Math.max(0, Math.sin(TAU * u)) - 0.2, Math.max(0, Math.sin(TAU * u + Math.PI)) - 0.2] as [number, number],
      sway: [0, 1, 1, 0, -1, -1][i % 6], tail: 0, wave: u * 2, waveAmp: 1.6,
      staff: SW(view, 9, 5 + 2.4 * fw, 39.5 + 1.2 * lift, 0.22, 0.18 + 0.12 * fw, -0.96), dust: [i === 1 ? 0.5 : i === 7 ? 0.5 : 0, 0] as [number, number],
    };
  });
}
/** Удар: меч заносится за правое плечо остриём вверх-назад и рубит наотмашь вперёд-вниз (кадр 7), след, вспышка на острие. */
function attackPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { yaw: side ? 0.12 : -0.28, pitch: -0.07, hp: -0.08, staff: SW(view, 8, -2, 41, 0.3, -0.55, 0.78), glow: 1.3, armLift: [1, 0] };
  const hit: Partial<Pose> = { yaw: side ? -0.05 : 0.2, pitch: 0.2, hp: 0.1, bob: -2 * PXM, staff: SW(view, 6, 8, 36, -0.25, 0.82, -0.5), glow: 1.4, flash: 1, fire: 0.4 };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1.5, p: { staff: SW(view, 9, 3, 40, 0.2, -0.1, 0.5) }, ease: easeInOut },
    { f: 3, p: wind, ease: easeInOut }, { f: 4, p: { ...wind, armLift: [1, 1] }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, fire: 0.6 }, ease: easeIn }, { f: 6, p: hit, ease: easeOut }, { f: 7, p: { ...hit, flash: 0, bob: -1 * PXM, fire: 0.2 }, ease: easeOut },
    { f: 8, p: { staff: SW(view, 8, 6, 38, 0.15, 0.4, -0.9) }, ease: easeInOut },
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

/** «Кровавый росчерк» (конус на танка): меч отведён назад вверх, клинок наливается багрянцем; рубит поперёк широкой дугой; удар — кадр 4. */
function bladeKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = { pitch: -0.08, hp: -0.12, yaw: side ? 0.08 : -0.2, staff: SW(view, 10, -2, 42, 0.45, -0.5, 0.74), glow: 1.4, fire: 0.7, book: 0.7 };
  const hit: Partial<Pose> = { ...wind, pitch: 0.16, hp: 0.08, yaw: side ? -0.05 : 0.3, bob: -1 * PXM, staff: SW(view, 5, 9, 37, -0.3, 0.86, -0.35), glow: 1.6, flash: 1, fire: 1 };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, fire: 0.9, staff: SW(view, 11, -4, 43, 0.5, -0.6, 0.62) }, ease: easeOut },
    { f: 2, p: { ...hit, flash: 0, staff: SW(view, 8, 5, 40, 0, 0.7, 0.2) }, ease: easeIn }, { f: 3, p: hit, ease: easeOut },
    { f: 4, p: { ...hit, flash: 0, fire: 0.8 }, ease: linear }, { f: 6, p: { ...hit, flash: 0, fire: 0.5, bob: 0 }, ease: easeOut },
    { f: 8, p: { fire: 0.2 }, ease: easeInOut }, { f: 9, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function bladeStrikePoses(view: View): Pose[] {
  const { R0, keys } = bladeKeys(view);
  const poses = keyed(R0, keys, 10, 540);
  poses[2].trail = trailOf(R0, keys, view, 0.6, 2, 6);
  poses[3].trail = trailOf(R0, keys, view, 1.4, 3, 7);
  poses[4].trail = trailOf(R0, keys, view, 2.4, 3.8, 6);
  poses[3].flashAt = tipW(poses[3], view);
  poses[3].dust = [0.8, 0];
  return poses;
}
/** «Вихрь мышей»: меч вскинут остриём вперёд-вверх, вокруг ног кружит стая; удар — клинок вонзается в землю, три кольца мглы. */
function vortexKeys(view: View) {
  const R0 = restOf(view);
  const wind: Partial<Pose> = { pitch: -0.1, hp: -0.2, bob: 1 * PXM, staff: SW(view, 9, 4, 43, -0.05, 0.92, 0.38), glow: 1.5, swirl: 0.7, armLift: [1, 0], book: 0.8 };
  const hit: Partial<Pose> = { ...wind, pitch: 0.12, hp: 0.1, bob: -2 * PXM, staff: SW(view, 9, 7, 38, 0.1, 0.22, -0.97), swirl: 1, ring: 0.08, dust: [1, 1], flash: 1, armLift: [0, 0] };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: 2 * PXM }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, ring: 0.4, dust: [0.6, 0.6], swirl: 1 }, ease: linear }, { f: 4, p: { ...hit, flash: 0, ring: 0.8, dust: [0.3, 0.3], swirl: 0.9 }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 0, dust: [0, 0], swirl: 0.6 }, ease: linear }, { f: 7, p: { swirl: 0 }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function vortexCastPoses(view: View): Pose[] {
  const { R0, keys } = vortexKeys(view);
  const poses = keyed(R0, keys, 8, 640).map((p, i) => ({ ...p, swirlPh: i * 0.11 }));
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  poses[2].flashAt = [poses[2].staff[0][0] + poses[2].staff[1][0] * STAFF_L, poses[2].staff[0][1] + poses[2].staff[1][1] * STAFF_L, 1];
  return poses;
}
/** «Распад в стаю»: руки разведены, плащ-крылья раскрыты, тело рассыпается стаей мышей, над головой вспыхивает круг. */
function mirageKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = {
    pitch: -0.1, hp: -0.18, bob: 1 * PXM, glow: 1.5, sigil: 0.8, book: 1, waveAmp: 2.4,
    staff: SW(view, 11, 2, 41, 0.25, 0.2, -0.95),
    hand: [[0, 0, 0], side ? [-9, 9, 45] : [-13, 4, 47]], pole: [[1, 0.1, -0.6], [-1, 0.2, 0.4]], armLift: [1, 1],
  };
  const hit: Partial<Pose> = { ...wind, pitch: 0.04, hp: 0.02, bob: 0, glow: 1.6, sigil: 1, ghost: 1, flash: 1, ring: 0.1 };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, ghost: 0.35 }, ease: easeOut }, { f: 2, p: { ...hit, flash: 0, ghost: 0.7 }, ease: easeIn }, { f: 3, p: hit, ease: easeOut },
    { f: 4, p: { ...hit, flash: 0, ghost: 0.85, ring: 0.5 }, ease: linear }, { f: 5, p: { ...hit, flash: 0, ghost: 0.5, ring: 0.9, sigil: 0.7 }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, ghost: 0.15, ring: 0, sigil: 0.3, bob: 0 }, ease: easeInOut }, { f: 7, p: { ghost: 0, sigil: 0, book: 0.2 }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function mirageCastPoses(view: View): Pose[] {
  const { R0, keys } = mirageKeys(view);
  const poses = keyed(R0, keys, 8, 840).map((p, i) => ({ ...p, swirlPh: i / 12 }));
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  poses[3].flashAt = [0, 4, 48];
  return poses;
}
/** «Буря крыльев» (кольцо): меч вскинут вперёд, клинок описывает круг; удар — остриём оземь, расходится кольцо мглы. */
function twisterKeys(view: View) {
  const R0 = restOf(view);
  const wind: Partial<Pose> = { pitch: -0.08, hp: -0.16, bob: 1 * PXM, glow: 1.5, swirl: 0.8, staff: SW(view, 9, 3, 43, 0.1, 0.9, 0.4), armLift: [1, 0], book: 0.6 };
  const hit: Partial<Pose> = { ...wind, pitch: 0.14, hp: 0.1, bob: -2 * PXM, staff: SW(view, 9, 7, 38, 0.1, 0.2, -0.97), swirl: 1, ring: 0.08, dust: [1, 1], flash: 1 };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: 2 * PXM, swirl: 1 }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, ring: 0.4, dust: [0.6, 0.6] }, ease: linear }, { f: 4, p: { ...hit, flash: 0, ring: 0.78, dust: [0.3, 0.3] }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 1, dust: [0, 0], swirl: 0.7 }, ease: linear }, { f: 7, p: { swirl: 0 }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function twisterCastPoses(view: View): Pose[] {
  const { R0, keys } = twisterKeys(view);
  const poses = keyed(R0, keys, 8, 940).map((p, i) => ({ ...p, swirlPh: i * 0.13 }));
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  poses[2].flashAt = [poses[2].staff[0][0] + poses[2].staff[1][0] * STAFF_L, poses[2].staff[0][1] + poses[2].staff[1][1] * STAFF_L, 1];
  return poses;
}
/** Оглушение: покачивается, голова свесилась набок, меч опущен остриём в землю, над головой кружат звёзды. */
function stunPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const rl = [0, 0.05, 0.08, 0.05, 0, -0.05, -0.08, -0.05];
  return Array.from({ length: 8 }, (_, i) => ({
    ...R0, t: i / 8, seed: 1500 + i, roll: rl[i], hp: 0.28, hr: -rl[i] * 1.4 + 0.12, pitch: 0.1, bob: -1 * PXM, glow: 0.35, stars: 1,
    staff: SW(view, 9, 6, 37, 0.2, 0.15, -0.97), root: [[0, 1, 1, 1, 0, -1, -1, -1][i], 0, 0] as V3,
    swirlPh: i / 8, sway: [0, 1, 1, 0, 0, -1, -1, 0][i], tail: 0, wave: i / 8, waveAmp: 1,
  }));
}
/** Переход фазы (< 55 %): рывок назад, меч вскинут вверх-вперёд, плащ-крылья раскрыты, круг разгорается, стая вспыхивает по бокам. */
function phasePoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const roar: Partial<Pose> = {
    pitch: -0.14, hp: -0.3, bob: 2 * PXM, glow: 1.6, sigil: 1, fire: 1, swirl: 1, book: 1, waveAmp: 2.6,
    staff: SW(view, 10, 3, 42, 0.2, 0.7, 0.62),
    hand: [[0, 0, 0], side ? [-9, 9, 47] : [-13, 4, 48]], pole: [[1, 0.1, -0.6], [-1, 0.2, 0.4]], armLift: [1, 1],
    ring: 0.06, ringAt: [0, 0, 0], dust: [1, 1],
  };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 2, p: { pitch: 0.1, hp: 0.1, bob: -1 * PXM, glow: 0.7 }, ease: easeInOut }, { f: 4, p: roar, ease: easeOut },
    { f: 5, p: { ...roar, ghost: 0.5, ring: 0.45, dust: [0.6, 0.6], flash: 1 }, ease: linear }, { f: 6, p: { ...roar, ghost: 1, ring: 0.85, dust: [0.2, 0.2] }, ease: linear },
    { f: 8, p: { ...roar, ghost: 0.4, ring: 0, dust: [0, 0], bob: 1 * PXM }, ease: linear }, { f: 11, p: { glow: 1.1, sigil: 0, swirl: 0, ghost: 0, fire: 0.3 }, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 12, 1100).map((p, i) => ({ ...p, swirlPh: i / 12 }));
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  poses[5].flashAt = [0, 4, 48];
  return poses;
}
/**
 * Гибель: отшатнулся, меч выпадает и ложится наискось; вампир оседает на колени (плащ-крылья лужей), клонится вперёд;
 * глаза гаснут.
 */
function deathPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const Wv = (v: V3): V3 => fromView(view, v);
  const fall: [V3, V3] = [Wv([14, 3, 6]), norm(Wv([0.2, 0.3, -0.9]))];
  const lying: [V3, V3] = [Wv([9, 2, 1.4]), norm(Wv([-0.35, -0.9, 0.02]))];
  const recoil: Partial<Pose> = { pitch: -0.14, hp: -0.3, bob: 1 * PXM, glow: 1.6, sway: 1, flash: 0 };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1, p: recoil, ease: easeOut }, { f: 2, p: { ...recoil, pitch: 0.08, hp: 0, bob: 0, glow: 1.1 }, ease: easeInOut },
    { f: 3, p: { held: 0, staff: fall, hand: [[10, 8, 24], [-9.6, 6, 22]], pitch: 0.14, glow: 0.9, kneel: 0.3 }, ease: easeIn },
    { f: 4, p: { held: 0, staff: lying, hand: [[9.6, 8, 18], [-9.6, 7, 16]], pitch: 0.22, glow: 0.7, kneel: 0.75, dust: [1, 1] }, ease: easeIn },
    { f: 5, p: { held: 0, staff: lying, hand: [[9, 8, 15], [-9, 8, 13]], pitch: 0.3, hp: 0.2, glow: 0.5, kneel: 1, dust: [0.5, 0.5] }, ease: easeOut },
    { f: 8, p: { held: 0, staff: lying, hand: [[8.6, 9, 14], [-8.6, 9, 12]], pitch: 0.44, hp: 0.5, glow: 0.2, kneel: 1, wither: 0.3 }, ease: easeInOut },
    { f: 13, p: { held: 0, staff: lying, hand: [[8.4, 9, 13.5], [-8.4, 9, 11.6]], pitch: 0.5, hp: 0.6, hr: 0.1, glow: 0, kneel: 1, wither: 0.6 }, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 14, 1300);
  for (let i = 3; i < 14; i++) { poses[i].held = 0; if (i >= 4) poses[i].staff = lying; }
  return poses;
}


export type MirAnim = "idle" | "walk" | "attack" | "bladeWind" | "bladeHold" | "bladeStrike" | "vortexWind" | "vortexHold" | "vortexCast"
  | "mirageWind" | "mirageHold" | "mirageCast" | "twisterWind" | "twisterHold" | "twisterCast" | "stun" | "phase" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: MirAnim; hit?: number };
const ANIM_ORDER: [MirAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "удар мечом", hit: 6 }],
  ["bladeWind", { n: 4, fps: 12, loop: false, ru: "замах росчерка", next: "bladeHold" }],
  ["bladeHold", { n: 4, fps: 12, loop: true, ru: "багрянец на клинке", next: "bladeStrike" }],
  ["bladeStrike", { n: 10, fps: 12, loop: false, ru: "кровавый росчерк", hit: 3 }],
  ["vortexWind", { n: 4, fps: 12, loop: false, ru: "зов воронок", next: "vortexHold" }],
  ["vortexHold", { n: 4, fps: 12, loop: true, ru: "песок кружит", next: "vortexCast" }],
  ["vortexCast", { n: 8, fps: 12, loop: false, ru: "вихрь мышей", hit: 2 }],
  ["mirageWind", { n: 4, fps: 12, loop: false, ru: "зов двойников", next: "mirageHold" }],
  ["mirageHold", { n: 4, fps: 12, loop: true, ru: "мираж дрожит", next: "mirageCast" }],
  ["mirageCast", { n: 8, fps: 12, loop: false, ru: "распад в стаю", hit: 3 }],
  ["twisterWind", { n: 4, fps: 12, loop: false, ru: "замах смерча", next: "twisterHold" }],
  ["twisterHold", { n: 4, fps: 12, loop: true, ru: "смерч набирает силу", next: "twisterCast" }],
  ["twisterCast", { n: 8, fps: 12, loop: false, ru: "буря крыльев", hit: 2 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["phase", { n: 12, fps: 12, loop: false, ru: "переход фазы", hit: 5 }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const MIR_ANIMS = {} as Record<MirAnim, AnimDef>;
{
  let col = 0;
  for (const [k, a] of ANIM_ORDER) { MIR_ANIMS[k] = { ...a, col }; col += a.n; }
}
export const MIR_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
export type MirFx = "blade" | "vortex" | "mirage" | "twister";
export const MIR_SKILLS: Record<string, { windup: [MirAnim, MirAnim]; strike: MirAnim; fx?: MirFx }> = {
  blood_slash: { windup: ["bladeWind", "bladeHold"], strike: "bladeStrike", fx: "blade" },
  bat_whirl: { windup: ["vortexWind", "vortexHold"], strike: "vortexCast", fx: "vortex" },
  bat_split: { windup: ["mirageWind", "mirageHold"], strike: "mirageCast", fx: "mirage" },
  wing_storm: { windup: ["twisterWind", "twisterHold"], strike: "twisterCast", fx: "twister" },
};
const POSES: Record<MirAnim, (v: View) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v), attack: attackPoses,
  bladeWind: (v) => { const { R0, wind } = bladeKeys(v); return windPoses(R0, wind, 500).map((p, i) => ({ ...p, fire: [0.2, 0.4, 0.6, 0.7][i] })); },
  bladeHold: (v) => { const { R0, wind } = bladeKeys(v); return holdPoses(R0, wind, 520, 4, (i) => ({ armLift: [TREMBLE[i], 0], glow: [1.4, 1.6, 1.45, 1.6][i], fire: [0.7, 0.9, 0.75, 1][i], flash: 0 })); },
  bladeStrike: bladeStrikePoses,
  vortexWind: (v) => { const { R0, wind } = vortexKeys(v); return windPoses(R0, wind, 600).map((p, i) => ({ ...p, swirl: [0.1, 0.3, 0.5, 0.7][i], swirlPh: i * 0.1 })); },
  vortexHold: (v) => { const { R0, wind } = vortexKeys(v); return holdPoses(R0, wind, 620, 4, (i) => ({ armLift: [TREMBLE[i], 0], glow: [1.4, 1.6, 1.45, 1.6][i], swirl: 0.8, swirlPh: 0.4 + i * 0.125 })); },
  vortexCast: vortexCastPoses,
  mirageWind: (v) => { const { R0, wind } = mirageKeys(v); return windPoses(R0, wind, 800).map((p, i) => ({ ...p, sigil: [0.2, 0.45, 0.65, 0.8][i], swirlPh: i * 0.08 })); },
  mirageHold: (v) => { const { R0, wind } = mirageKeys(v); return holdPoses(R0, wind, 820, 4, (i) => ({ armLift: [TREMBLE[i], TREMBLE[(i + 2) % 4]], glow: [1.4, 1.6, 1.45, 1.6][i], ghost: [0.12, 0.3, 0.18, 0.34][i], swirlPh: 0.3 + i * 0.083, sigil: 0.8 + 0.1 * (i % 2) })); },
  mirageCast: mirageCastPoses,
  twisterWind: (v) => { const { R0, wind } = twisterKeys(v); return windPoses(R0, wind, 900).map((p, i) => ({ ...p, swirl: [0.2, 0.45, 0.65, 0.8][i], swirlPh: i * 0.12 })); },
  twisterHold: (v) => {
    const { R0, wind } = twisterKeys(v);
    return holdPoses(R0, wind, 920, 4, (i) => {
      const a = (i / 4) * TAU;
      const side = rv(v);
      return { armLift: [TREMBLE[i], 0], glow: [1.4, 1.6, 1.45, 1.6][i], swirl: 1, swirlPh: 0.5 + i * 0.16, staff: side ? stf([10.5, 5 + 2 * Math.cos(a), 36], [0, 0.3 + 0.22 * Math.sin(a), 0.93]) : stf([12.5, 3, 36], [0.3 + 0.2 * Math.cos(a), 0.1 + 0.2 * Math.sin(a), 0.93]) };
    });
  },
  twisterCast: twisterCastPoses, stun: stunPoses, phase: phasePoses, death: deathPoses,
};

// ---------------- эффекты мира ----------------
interface FxDef { w: number; h: number; ax: number; ay: number; n: number; fps: number; hit: number }
export const FX: Record<MirFx, FxDef & { anims?: Record<string, { col: number; n: number; loop: boolean; hit?: number; fps?: number }> }> = {
  blade: { w: 64, h: 64, ax: 32, ay: 50, n: 10, fps: 12, hit: 1 },
  vortex: { w: 64, h: 64, ax: 32, ay: 46, n: 12, fps: 12, hit: 3, anims: { vortexIn: { col: 0, n: 4, loop: false, hit: 3, fps: 12 }, vortexHold: { col: 4, n: 4, loop: true, fps: 12 }, vortexOut: { col: 8, n: 4, loop: false, fps: 12 } } },
  mirage: { w: 64, h: 64, ax: 32, ay: 54, n: 10, fps: 12, hit: 3 },
  twister: { w: 48, h: 64, ax: 24, ay: 56, n: 12, fps: 12, hit: 2 },
};
type Plot = (x: number, y: number, c: RGBA) => void;
const plotOf = (c: PC): Plot => (x, y, col) => c.set(x, y, col);
function disc(plot: Plot, cx: number, cy: number, r: number, ry: number, c: (d: number) => RGBA | null) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy) / ry);
    if (d > 1) continue;
    const q = c(d);
    if (q) plot(x, y, q);
  }
}
/** «Жар-клинок»: столб огня на метке — вспышка, пламя рвётся вверх языками, оседает искрами; на земле — пятно гари. */
function buildBladeFx(): PC {
  const F = FX.blade;
  const out = new PC(F.w * F.n, F.h * 2);
  const Hs = [8, 20, 28, 30, 26, 22, 17, 12, 7, 3];
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const k = i < 2 ? 1 : Math.max(0, 1 - (i - 2) / 8);
    disc(pb, cx, cy, 16, 7, (d) => (d > 0.9 ? null : [24, 10, 6, Math.round(130 * (d < 0.5 ? 1 : 0.6) * (i === 0 ? 0.4 : k))]));
    disc(pb, cx, cy, 12 * Math.min(1, 0.4 + i * 0.3), 5, (d) => (d > 0.8 ? [FIRE[2][0], FIRE[2][1], FIRE[2][2], Math.round(120 * k)] : [FIRE[3][0], FIRE[3][1], FIRE[3][2], Math.round(90 * k)]));
    const H = Hs[i];
    const wob = i * 1.7;
    for (let y = 0; y < H; y++) {
      const u = y / Math.max(1, H);
      const hw = Math.round(9 * Math.pow(1 - u, 0.65) * (0.55 + 0.45 * Math.min(1, i / 2)));
      const sx = Math.round(Math.sin(u * 5 + wob) * 2.2 * u);
      for (let dx = -hw; dx <= hw; dx++) {
        const e = Math.abs(dx) / Math.max(1, hw);
        const tongue = Math.sin((dx + sx) * 1.3 + wob + u * 4) > 0.55 && u > 0.35;
        if (tongue && e > 0.5) continue;
        const col = e < 0.25 && u < 0.7 ? FIRE[4] : e < 0.6 ? FIRE[3] : FIRE[u > 0.6 ? 1 : 2];
        pf(cx + dx + sx, cy - y, col);
      }
    }
    // искры вверх
    for (let j = 0; j < 7; j++) {
      const t = (i * 0.12 + j * 0.37) % 1;
      pf(cx + Math.round(Math.sin(j * 2.3 + i) * 11 * (0.4 + t)), cy - Math.round(8 + 30 * t), FIRE[t < 0.5 ? 4 : 3]);
    }
    if (i <= 2) for (let dx = -12; dx <= 12; dx += 3) pf(cx + dx, cy - 1 - (i === 1 ? 0 : 1), FIRE[3]);
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/** «Зыбучие воронки»: воронка из песка — спираль на земле и вращающаяся воронка над ней (растёт, держится по кругу, оседает). */
function buildVortexFx(): PC {
  const F = FX.vortex;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const stage = i < 4 ? "in" : i < 8 ? "hold" : "out";
    const k = stage === "in" ? (i + 1) / 4 : stage === "hold" ? 1 : 1 - (i - 7) / 4.5;
    const ph = (i % 4) / 4 + (stage === "in" ? i * 0.07 : 0);
    // тёмная воронка-яма и спираль на земле
    disc(pb, cx, cy, 22 * k, 9 * k, (d) => [34, 24, 14, Math.round(d < 0.35 ? 190 : d < 0.7 ? 150 : 90)]);
    for (let arm = 0; arm < 3; arm++) for (let s = 0; s < 34; s++) {
      const u = s / 34;
      const a = arm * (TAU / 3) + u * 5.2 - ph * TAU;
      const rr = (1 - u * 0.85) * 21 * k;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.42;
      pb(Math.round(x), Math.round(y), SAND[u < 0.4 ? 4 : u < 0.75 ? 3 : 2]);
      if (u < 0.6) pb(Math.round(x), Math.round(y) - 1, SAND[3]);
    }
    // воронка над землёй: кольца частиц, шире кверху
    const H = Math.round(30 * k);
    for (let h = 0; h < H; h++) {
      const u = h / 30;
      const rr = (3.5 + 11 * u) * (0.9 + 0.1 * Math.sin(h * 0.7 + i));
      for (let q = 0; q < 3; q++) {
        const a = ph * TAU * 1.5 + h * 0.55 + q * (TAU / 3);
        const x = cx + Math.cos(a) * rr, y = cy - 2 - h + Math.sin(a) * rr * 0.3;
        const fr = Math.sin(a) > 0;
        (fr ? pf : pb)(Math.round(x), Math.round(y), SAND[fr ? 3 + ((h + q) % 2) : 1 + ((h + q) % 2)]);
        if (fr && (h + q) % 3 === 0) pf(Math.round(x) + 1, Math.round(y), SAND[2]);
      }
    }
    // вылетающие песчинки
    for (let j = 0; j < 6; j++) { const t = (i * 0.2 + j * 0.31) % 1; pf(Math.round(cx + Math.cos(j * 2.1 + i) * (8 + 12 * t)), Math.round(cy - 4 - 24 * t), SAND[3]); }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/** «Ложные двойники»: на месте миража — золотой круг на земле и столб дрожащего песка; на кадре hit (3) вспышка, потом оседает. */
function buildMirageFx(): PC {
  const F = FX.mirage;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const k = i < 4 ? (i + 1) / 4 : Math.max(0, 1 - (i - 4) / 6);
    // руны-круг на земле
    const rr = 16;
    const n = 44;
    for (let s = 0; s < n; s++) {
      const a = (s / n) * TAU + i * 0.2;
      const x = Math.round(cx + Math.cos(a) * rr * k), y = Math.round(cy + Math.sin(a) * rr * 0.4 * k);
      pb(x, y, GLOWC[s % 4 === 0 ? 4 : 3]);
      if (s % 4 === 0) pb(Math.round(cx + Math.cos(a) * rr * 0.7 * k), Math.round(cy + Math.sin(a) * rr * 0.28 * k), GLOWC[2]);
    }
    disc(pb, cx, cy, rr * k, rr * 0.4 * k, (d) => [GLOWC[2][0], GLOWC[2][1], GLOWC[2][2], Math.round(46 * (1 - d))]);
    // столб дрожащего воздуха: песок и пыль, горизонтальные «волны»
    const H = Math.round(40 * Math.min(1, k * 1.3));
    for (let y = 0; y < H; y++) {
      const u = y / 40;
      const hw = Math.round(8 * (1 - u * 0.5) * (i >= 4 ? k : 1));
      const sh = Math.round(Math.sin(y * 0.5 + i * 1.1) * 1.6);
      for (const side of [-1, 1]) {
        if ((y + i) % 4 < 2) pf(cx + sh + side * hw, cy - 2 - y, SAND[(y + i) % 8 < 4 ? 4 : 3]);
        if ((y + i) % 6 === 0) pf(cx + sh + side * (hw - 2), cy - 2 - y, SAND[2]);
      }
      if (y % 5 === 0 && k > 0.4) for (let dx = -hw + 2; dx <= hw - 2; dx += 2) pf(cx + sh + dx, cy - 2 - y, [214, 196, 150, Math.round(90 * k)]);
    }
    if (i >= 2 && i <= 5) for (const [dx, dy] of [[-7, 20], [6, 26], [-3, 33], [8, 12], [0, 38]]) pf(cx + dx, cy - dy + (i - 3), GLOWC[4]);
    if (i === 3) for (let dx = -12; dx <= 12; dx++) pf(cx + dx, cy - 2, GLOWC[dx % 3 === 0 ? 4 : 3]);
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/** «Песчаный смерч» (кольцо): маленький песчаный вихрь — ставится по кольцу несколько раз; колонна из частиц, шире кверху, крутится; растёт и оседает. */
function buildTwisterFx(): PC {
  const F = FX.twister;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const k = i < 3 ? (i + 1) / 3 : i < 9 ? 1 : 1 - (i - 8) / 4;
    disc(pb, cx, cy, 11 * k, 4 * k, (d) => [60, 44, 26, Math.round(120 * (1 - d * 0.5))]);
    const H = Math.round(40 * k);
    for (let h = 0; h < H; h++) {
      const u = h / 40;
      const rr = (2.5 + 9 * u) * (0.9 + 0.1 * Math.sin(h * 0.6 + i));
      for (let q = 0; q < 3; q++) {
        const a = i * 0.9 + h * 0.5 + q * (TAU / 3);
        const x = cx + Math.cos(a) * rr, y = cy - 2 - h + Math.sin(a) * rr * 0.3;
        const fr = Math.sin(a) > 0;
        (fr ? pf : pb)(Math.round(x), Math.round(y), SAND[fr ? 3 + ((h + q) % 2) : 1 + ((h + q) % 2)]);
        if (fr && (h + q) % 3 === 0) pf(Math.round(x) + 1, Math.round(y), SAND[2]);
      }
    }
    for (let j = 0; j < 4; j++) { const t = (i * 0.25 + j * 0.31) % 1; pf(Math.round(cx + Math.cos(j * 2.1 + i) * (6 + 8 * t)), Math.round(cy - 6 - 26 * t), SAND[3]); }
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
      text(c, `×${k} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ 32 · РУНОЛИТ 64 · ВАМПИР 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | РЕФЕРЕНС 11`, 16, y0 + 8);
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
  const W = Math.max(24 + 2 * N * k + 16 + 40 + (A.ref ? A.ref.w : H) + 24, 1500);
  const TOP = 90 + 90 + 3 * 88 + 50 + 600;
  const c = new PC(W, TOP + 2 * (rowH + 70) + 20);
  fill(c, 0, 0, c.w, c.h, [30, 28, 34, 255]);
  const lich = A.lich ? crop(A.lich, 0, 0, 80, 80) : null;
  for (const [kk, y0] of [[1, 12], [3, 120]] as [number, number][]) {
    text(c, `×${kk} · ГЕРОЙ · ЛИЧ ВЕДРАС · ВАМПИР ВНИЗ И ВБОК`, 24, y0, 2);
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
    text(c, "ПОКОЙ: ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | УДАР МЕЧОМ | РАЗМАХ | СТАЯ МЫШЕЙ  (×3, ДЕНЬ / НОЧЬ)", 24, gy, 2);
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
    text(c, "РЕФЕРЕНС 11", 24 + 2 * N * k + 56, y - 36, 3);
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
  const png = path.join(root, "tools", "out", "bosses139", "ref-11.png");
  const jpg = path.join(root, "tools", "out", "refs", "bosses-139", "11.jpg");
  if (!fs.existsSync(png) && fs.existsSync(jpg) && process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${jpg}'); $b=New-Object System.Drawing.Bitmap 450,500; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,450,500); $b.Save('${png}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  return fs.existsSync(png) ? loadPC(png) : null;
}

export function writeMirArt(root: string, outDir: string, quick = false): string[] {
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
  // лист лича в игре — широкий (перенос по строкам): первый кадр уже в левом верхнем углу, crop выше берёт его
  save(buildCompare(sheets, A), "r45n-e-compare.png");
  if (quick) return files;
  const sheet = new PC(N * MIR_COLS, FH * 3), glow = new PC(N * MIR_COLS, FH * 3);
  for (const [a] of ANIM_ORDER) { sheet.blit(sheets.img[a], MIR_ANIMS[a].col * N, 0); glow.blit(sheets.emis[a], MIR_ANIMS[a].col * N, 0); }
  save(sheet, "vam-sheet.png");
  save(glow, "vam-glow.png");
  const fx = { blade: save(buildBladeFx(), "vam-fx-blade.png"), vortex: save(buildVortexFx(), "vam-fx-vortex.png"), mirage: save(buildMirageFx(), "vam-fx-mirage.png"), twister: save(buildTwisterFx(), "vam-fx-twister.png") };
  save(buildMirageUnit(sheets), "vam-unit-mirage.png");
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
  for (const a of ["idle", "mirageHold", "bladeHold"] as MirAnim[]) rowsP.push(animRow(a, sheets, A, W, true));
  const names: Record<MirFx, string> = { blade: "ЖАР-КЛИНОК", vortex: "ВОРОНКА", mirage: "ДВОЙНИК", twister: "СМЕРЧ (КОЛЬЦО)" };
  for (const kx of Object.keys(FX) as MirFx[]) rowsP.push(fxRow(`×2 · ЭФФЕКТ МИРА · ${names[kx]} · ${FX[kx].n} КАДРОВ · ${FX[kx].fps} К/С · УДАР — КАДР ${FX[kx].hit + 1}`, fx[kx], FX[kx], A, W, FX[kx].w));
  save(stackRows(rowsP, W), "vam-pilot.png");
  return files;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/umb_crimson_vampire.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const files = writeMirArt(root, path.join(root, "tools", "out", "bosses139"), process.argv.includes("--quick"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void linear; void hex; void cross;

/**
 * Мираж-двойник (моб <босс>_mirage, лист как у мобов: 12 столбцов × 3 вида; «ходьба» 0–3 и «атака» 4–7 — покой с дрожью, 8–11 — гибель:
 * растворяется песком): призрачная копия чародея — песочно-голубая, полупрозрачная.
 */
export function buildMirageUnit(_sheets: Sheets): PC {
  const out = new PC(N * 12, FH * 3);
  const UP = ["x.....x", "xx...xx", ".xxxxx.", "..xxx.."], DOWN = ["..xxx..", ".xxxxx.", "xx...xx", "x.....x"];
  const spots: [number, number][] = [[-14, -8], [8, -14], [16, 0], [-6, 6], [0, -4], [-18, 4], [12, 10], [-2, -16], [20, -9]];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
    const c = new PC(N, FH);
    const dying = i >= 8, k = dying ? (i - 8) / 3.2 : 0;
    spots.forEach(([dx, dy], j) => {
      const flap = (Math.floor(i / 1) + j) % 2 ? UP : DOWN;
      const bob = Math.round(Math.sin(i * 1.3 + j) * 2);
      const X0 = Math.round(32 + dx * (1 + k * 1.6) + (dying ? Math.sin(j * 2.1) * 6 * k : 0)), Y0 = Math.round(58 + dy + bob - (dying ? 10 * k * (0.5 + (j % 3) * 0.3) : 0));
      if (dying && hash01(j, i, 5) < k * 0.9) return;
      flap.forEach((rowS, jj) => [...rowS].forEach((ch, q) => {
        if (ch !== "x") return;
        c.set(X0 - 3 + q, Y0 - 2 + jj, jj === 1 && q === 3 ? GLOWC[3] : q === 0 || q === 6 ? BLACK[2] : q === 3 ? BLACK[1] : SLATE[2]);
      }));
    });
    c.outline(OUT);
    out.blit(c, i * N, row * FH);
  }
  return out;
}
/** Кадры галереи: [img, emis, flip]. */
function gallery(sheets: Sheets): { img: PC; emis: PC; flip?: boolean }[] {
  const idle = (row: number, flip = false) => ({ img: crop(sheets.img.idle, 0, row * FH, N, FH), emis: crop(sheets.emis.idle, 0, row * FH, N, FH), flip });
  const pose = (p: Pose, v: View) => renderMir(v, p);
  return [idle(0), idle(1), idle(2), idle(2, true), pose(POSES.attack("down")[6], "down"), pose(POSES.bladeStrike("down")[3], "down"), pose(POSES.mirageCast("down")[4], "down")];
}
/** Ночь только по части холста. */
function nightRectPart(c: PC, x: number, y: number, w: number, h: number) { nightRect(c, x, y, w, h); }

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
