/**
 * Задача 139, босс кольца: капеллан-отступник, знаменосец павшей армии (запад, слот r55n, ур. 55, группа 3; карточка — docs/systems/bosses.md,
 * раздел 3.3 п. 3 и «Раскладка референсов»). Образ — референс tools/out/refs/bosses-139/21-рыцарь-капелан-отсупник.jpg (рыцарь в серой
 * рваной котте с красным крестом, глубокий капюшон, чёрная решётчатая маска вместо лица, тёмные массивные наплечники с поднятым
 * крылом, перевязи, сумка, меч за спиной с Т-образным навершием, рваный плащ с левого плеча, холодный фонарь у бедра) — только для
 * сравнения: чужой арт в игру и в git не идёт. Знамя — рваное полотнище на длинном древке: в правой руке (удар древком) и вбитое в центр
 * арены (фаза 2); отдельный спрайт знамени-объекта — buildBanner.
 *
 * Метод — как у военачальника гоблинов (sol_goblin_warlord.ts): общий движок tools/gen/mobs/lib.ts, тело в двойном разрешении (160×160) сводится
 * в кадр 64×80, ступни на y = 76; 5 тонов на материал, выборочный контур 1 px, контровой свет. Светится ночью: щель маски, фонарь, всполохи.
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/sol_fallen_chaplain.ts [--quick|--sil] →
 *   tools/out/bosses139/r55n-w-compare.png («наш | референс»), chap-sheet.png, chap-glow.png, chap-banner.png, chap-pilot.png.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  PC, PX, R, Scene, VIEWS, add, clamp, cross, crop, depthOf, easeIn, easeInOut, easeOut, fill, fromView,
  groundBg, hash01, hex, ik, lerp, linear, loadPC, mat, mix, mul, nightRect, norm, perp, renderScene, rot, scaleNN,
  scr, sealPinholes, shadowBlob, snapPx, stackRows, sub, text, thicken, toView, TAU,
  type Cam, type Mat, type RGBA, type Row, type V3, type View,
} from "../mobs/lib";
import { OUT, selout } from "../mobs/rig";

export const ID = "sol_fallen_chaplain";
export const FRAME = 64;
/** Кадр 64×80 (высокий узкий силуэт). */
export const FRAME_H = 80;
const FW = FRAME, FH = FRAME_H;
const N = FW;
const CAM: Cam = { N: FW, CX: 32, GY: 76.4 };
const RS = 2;
const CAMR: Cam = { N: 160, CX: 80, GY: 152.8 };
const RX0 = 16;
/** Модель → пиксели кадра 1×. */
const K = 1.35;
const PXM = PX / K;
const snapM = (view: View, w: V3): V3 => mul(snapPx(view, mul(w, K)), 1 / K);
const pxM = (view: View, dx: number, dy: number): V3 => fromView(view, [dx / K, 0, -dy * PXM]);

// ---------------- палитра ----------------
/** Тёмная воронёная сталь: наплечники, наручи, сапоги (холодные блики). */
const STEEL = R("#050608", "#0e1014", "#1c2027", "#323945", "#7f8da0");
/** Серо-белая рваная котта и капюшон. */
const CLOTH = R("#2e2c2e", "#5c595b", "#908c86", "#c0bbb0", "#eae5d8");
/** Капюшон: холодный серый, темнее котты. */
const HOOD = R("#1c1c20", "#38383f", "#5c5b64", "#8a8892", "#bcbac4");
/** Красный крест и поле знамени. */
const RED = R("#1a0508", "#3e0c14", "#701622", "#a02a38", "#cc4a56");
/** Плащ: холодный серый, темнее котты. */
const CLOAK = R("#100d0b", "#221d1a", "#3a332e", "#5a5048", "#7d7268");
/** Кожа ремней и сумки. */
const LEATH = R("#1c1008", "#42260f", "#70441f", "#9c632e", "#c68a48");
/** Тёмное дерево древка. */
const WOODS = R("#150f0a", "#2e1f12", "#4c3319", "#6c4a26", "#92683a");
/** Чёрное: маска, подкольчужье. */
const BLACK = R("#030304", "#08090c", "#101216", "#1a1d23", "#2c313a");
/** Холодное свечение: щель маски, фонарь. */
const GLOWC = R("#06142a", "#123a6e", "#2e78c8", "#6ab8f0", "#d4f0ff");
/** Бледный росчерк (след древка, вспышка удара). */
const FIRE = R("#16243a", "#4a6890", "#8fb2d8", "#cfe4f6", "#ffffff");
/** Тени залпа: тёмно-фиолетовые сгустки. */
const SHADOW = R("#070a18", "#121c46", "#26408c", "#5a7ed0", "#bcd4ff");
/** Клинок: светлая сталь. */
const BLADE = R("#14171c", "#323842", "#5e6876", "#9aa6b6", "#e6eef8");
/** Тёплый огонь светоча. */
const FLAME = R("#3a1206", "#8a3a0e", "#e0781a", "#ffb040", "#fff0b8");
const DEAD = R("#121112", "#262223", "#3b3434", "#544a47", "#6e625c");
/** Пепельная пыль пустоши. */
const SAND = R("#2c2a2c", "#4e4a4a", "#78726e", "#a49c94", "#d0c8bc");
const VOID = hex("#06040a");

const M = {
  steel: mat("сталь", STEEL, { base: 1.55, gain: 2.3, hi: 4 }),
  cloth: mat("котта", CLOTH, { base: 2.4, gain: 2.1 }),
  hood: mat("капюшон", HOOD, { base: 1.9, gain: 2.2 }),
  red: mat("крест", RED, { base: 1.8, gain: 2.1 }),
  cloak: mat("плащ", CLOAK, { base: 1.9, gain: 2.4 }),
  wood: mat("древко", WOODS, { base: 2.0, gain: 2.0 }),
  leath: mat("ремни", LEATH, { base: 2.1, gain: 2.2 }),
  black: mat("чёрное", BLACK, { base: 1.6, gain: 2.3 }),
  blade: mat("клинок", BLADE, { base: 2.0, gain: 2.5, hi: 4 }),
  flame: mat("огонь", FLAME, { base: 3.0, gain: 0.6, glow: true, crisp: true }),
  flameCore: mat("ядро огня", FLAME, { base: 4.0, gain: 0.0, glow: true, crisp: true }),
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
  for (const c of [...GLOWC, ...FIRE, ...SHADOW, ...FLAME]) s.add(c.slice(0, 3).join(","));
  return (q: RGBA) => s.has(q.slice(0, 3).join(","));
})();

// ---------------- поза ----------------
interface Pose {
  root: V3; bob: number; chest: number; headZ: number;
  pitch: number; yaw: number; roll: number; hp: number; hy: number; hr: number;
  /** кулаки: [правый — хват, если не held; левый]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** древко знамени: [пятка, направление пятка → верх]; flat — плоскость полотнища (нормаль); held — в правой руке */
  staff: [V3, V3]; flat: V3;
  /** 0 — руки свободны, 1 — правая на мече, 2 — обе на мече; stow — меч за спиной (едет с телом); ban/banner — знамя в правой руке */
  held: number; stow: number; ban: [V3, V3]; banner: number;
  armLift: [number, number];
  /** подол и полотнище: фаза волны, размах; шаг (стопы); раскачка плаща и его концов */
  wave: number; waveAmp: number; kick: [number, number]; sway: number; tail: number;
  /** свет щели 0..1,6; увядание; на коленях */
  glow: number; wither: number; kneel: number;
  ring: number; ringAt?: V3; flash: number; flashAt?: V3; dust: [number, number];
  /** сгустки теней у левой кисти 0..1 (расход вперёд — orbGo) и полосы натиска */
  orb: number; orbGo: number; streak: number;
  trail?: V3[];
  t: number; seed: number;
}

const HIP0 = 24;
const NECK: V3 = [0, 0.4, 44.0];
const ARM: [number, number] = [10.5, 10.5];
/** Древко: от пятки до верха, хват правой руки — SG от пятки. */
const STAFF_L = 44;
/** Двуручный меч: полная длина от навершия до острия, длина рукояти, хват правой (ближе к крестовине) и левой (у навершия). */
const SWL = 38, SW_GRIP = 9.0, SW_GRIPR = 6.4, SW_GRIPL = 2.8;
const SG = 21;

const stf = (grip: V3, dir: V3): [V3, V3] => { const d = norm(dir); return [sub(grip, mul(d, SG)), d]; };
const sw = (pom: V3, dir: V3): [V3, V3] => [pom, norm(dir)];
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: -1, chest: 0, headZ: 0, pitch: 0.06, yaw: 0, roll: 0, hp: 0.06, hy: 0, hr: 0,
  hand: [[10.4, 2.0, 22.5], [-10.4, 2.0, 22.5]], pole: [[0.5, -1, 0], [-0.5, -1, 0]],
  staff: sw([6.5, -5.4, 53], [-0.3, -0.1, -0.95]), flat: [0, 1, 0], held: 0, stow: 1, ban: stf([10.8, 4.4, 30], [0, 0.2, 1]), banner: 0, armLift: [0, 0],
  wave: 0, waveAmp: 1, kick: [0, 0], sway: 0, tail: 0,
  glow: 1, wither: 0, kneel: 0,
  ring: 0, flash: 0, dust: [0, 0], orb: 0, orbGo: 0, streak: 0, t: 0, seed: 1,
};
const REST_SIDE: Pose = { ...REST_FRONT, flat: [-1, 0, 0], hand: [[9.4, 3.5, 22.5], [-9.4, 4.0, 22.5]], pole: [[0.3, -1, -0.2], [-0.3, -1, -0.2]] };
const restOf = (view: View): Pose => (view === "side" ? REST_SIDE : REST_FRONT);
const bodyShift = (view: View, p: Pose): V3 => snapM(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.kneel * 7]);
/** Сторона вылета полотнища: вперёд и назад — наружу (вправо), вбок — назад. */
const clothSide = (view: View) => (view === "side" ? 1 : -1);

// ---------------- штампы ----------------
type Keys = Record<string, RGBA>;
type StampPx = [number, number, string];
const up2 = (px: StampPx[]): StampPx[] => px.flatMap(([x, y, c]) => [[x * 2, y * 2, c], [x * 2 + 1, y * 2, c], [x * 2, y * 2 + 1, c], [x * 2 + 1, y * 2 + 1, c]] as StampPx[]);
const rowsOf = (rs: string[], x0: number, y0: number): StampPx[] => {
  const out: StampPx[] = [];
  rs.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") out.push([x0 + i, y0 + j, ch]); }));
  return out;
};
/** Щель маски: две холодные точки. */
const ST_EYES: Partial<Record<View, StampPx[]>> = {
  down: up2(rowsOf(["3..3"], -2, 0)),
  side: up2(rowsOf(["3"], 0, 0)),
};
function stampKeys(glow: number): Keys {
  const g = clamp(glow, 0, 1.6);
  const lv = (k: number) => {
    const v = k - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.25 ? 1 : 0);
    return v < 0 ? VOID : GLOWC[clamp(v, 0, 4)];
  };
  return { "1": lv(1), "2": lv(2), "3": lv(3) };
}
const GLOW_KEYS = ["3"];

// ---------------- сцена ----------------
interface Extra {
  rings: { c: V3; r: number; k: number }[];
  flash: { at: V3; k: number } | null;
  dust: { at: V3; k: number }[];
  orbs: { at: V3; k: number; go: number } | null;
  fglow: { at: V3; k: number } | null;
  glints: V3[];
  streak: number;
}
type Tex = (c: { l: V3; edge: boolean }) => number | { mat: Mat; d: number };

/** Древко с ровным полотнищем: пятка butt, направление ad, flat — нормаль полотнища, cs — на какую сторону (±e) оно вылетает. */
function poleCloth(S: Scene, g: number, o: { butt: V3; ad: V3; flat: V3; cs: number; wave: number; amp: number; W: number; L: number; tail?: number }, X?: Extra): { top: V3; tip: V3 } {
  const ad = norm(o.ad), flat = norm(perp(ad, o.flat)), e = norm(cross(ad, flat));
  const out = mul(e, o.cs);
  const W = o.W;
  const top = add(o.butt, mul(ad, o.L));
  const shine: Tex = (q) => (q.edge ? 0 : q.l[0] < -0.35 ? 0.9 : q.l[0] > 0.5 ? -0.7 : 0);
  S.cone(g, wm(M.wood, W), o.butt, 0.95, top, 1.0, { tex: shine as never, ref: norm(perp(ad, [-1, 0.2, 0.6])), big: true });
  S.cone(g, wm(M.steel, W), add(o.butt, mul(ad, 2.0)), 1.1, sub(o.butt, mul(ad, 2.6)), 0.1, { part: S.newPart(), tone: 0.1 });
  for (const u of [0.3, 0.62]) S.cone(g, wm(M.steel, W), add(o.butt, mul(ad, o.L * u)), 1.2, add(o.butt, mul(ad, o.L * u + 0.9)), 1.2, { part: S.newPart(), tone: 0.25 });
  // наконечник-копьё
  const hd = top;
  S.cone(g, wm(M.steel, W), hd, 1.3, add(hd, mul(ad, 4.6)), 0.1, { part: S.newPart(), tone: 0.45 });
  for (const s of [1, -1]) S.cone(g, wm(M.steel, W), add(hd, mul(ad, 0.4)), 0.6, add(add(hd, mul(ad, 2.0)), mul(e, s * 2.2)), 0.1, { part: S.newPart(), tone: 0.5 });
  // перекладина и ровное полотнище: три поперечные секции, на них крупный крест; рваный низ из четырёх зубцов
  const hw = 3.8, segL = 4.2;
  const barC = add(sub(top, mul(ad, 3.6)), mul(out, 0.4 + hw));
  S.box(g, wm(M.steel, W), barC, [hw + 0.7, 0.5, 0.55], [e, flat, ad], 0.2, { part: S.newPart(), tone: 0.15 });
  for (let k = 0; k < 3; k++) {
    const zc = 4.2 + segL * (k + 0.5);
    const wvv = Math.sin(TAU * (o.wave + k * 0.3)) * 0.85 * o.amp * (k + 0.4) / 2.4;
    const c = add(add(sub(top, mul(ad, zc)), mul(out, 0.4 + hw)), mul(flat, wvv));
    const tex: Tex = (q) => (Math.abs(q.l[0]) < 0.95 || (k === 1 && Math.abs(q.l[2]) < 1.15) ? { mat: M.cloth, d: 0.25 } : 0);
    S.box(g, wm(M.red, W), c, [hw, 0.35, segL / 2], [e, flat, ad], 0.1, { part: S.newPart(), tone: 0.05 + 0.1 * (k % 2), tex: tex as never });
  }
  const zb = 4.2 + segL * 3;
  for (let i = 0; i < 4; i++) {
    const dx = (i - 1.5) * 1.9;
    const wvv = Math.sin(TAU * (o.wave + 0.9)) * 0.85 * o.amp * 1.3;
    const cb = add(add(sub(top, mul(ad, zb - 0.3)), mul(out, 0.4 + hw + dx)), mul(flat, wvv));
    S.cone(g, wm(M.red, W), cb, 1.0, sub(cb, mul(ad, 2.0 + ((i * 7) % 3) * 0.8 + (o.tail ?? 0))), 0.1, { part: S.newPart(), tone: 0.0 });
  }
  X?.glints.push(add(hd, mul(ad, 4.6)));
  return { top, tip: add(hd, mul(ad, 4.6)) };
}

/** Двуручный меч: pom — навершие, ad — от навершия к острию, flat — нормаль плоскости клинка. */
function greatsword(S: Scene, g: number, o: { pom: V3; ad: V3; flat: V3; W: number }, X?: Extra): { tip: V3 } {
  const ad = norm(o.ad), flat = norm(perp(ad, o.flat)), e = norm(cross(ad, flat));
  const W = o.W;
  const at = (u: number) => add(o.pom, mul(ad, u));
  // рукоять: кожаная оплётка с кольцами, Т-образное навершие с шаром
  S.cone(g, wm(M.leath, W), at(0.6), 1.0, at(SW_GRIP), 1.0, { part: S.newPart(), tone: 0.0 });
  for (const u of [2.0, 4.0, 6.0, 8.0]) S.cone(g, wm(M.steel, W), at(u), 1.25, at(u + 0.55), 1.25, { part: S.newPart(), tone: 0.2 });
  S.ball(g, wm(M.steel, W), at(-0.4), 1.7, { part: S.newPart(), tone: 0.35 });
  S.box(g, wm(M.steel, W), at(-1.8), [3.0, 0.9, 0.9], [e, flat, ad], 0.3, { part: S.newPart(), tone: 0.3 });
  // крестовина с загнутыми вверх концами
  S.box(g, wm(M.steel, W), at(SW_GRIP + 0.4), [5.6, 1.0, 0.85], [e, flat, ad], 0.3, { part: S.newPart(), tone: 0.25 });
  for (const s of [1, -1]) S.cone(g, wm(M.steel, W), add(at(SW_GRIP + 0.4), mul(e, s * 5.0)), 0.8, add(add(at(SW_GRIP + 2.6), mul(e, s * 6.0)), mul(ad, 0)), 0.15, { part: S.newPart(), tone: 0.4 });
  // клинок: длинный, плоский, с долом по центру и скошенным острием
  const bl = SWL - SW_GRIP - 3.2;
  const fuller: Tex = (c) => (Math.abs(c.l[0]) < 0.55 ? -0.9 : c.edge ? 0.5 : 0);
  S.box(g, wm(M.blade, W), at(SW_GRIP + 1.4 + bl / 2), [2.7, 0.55, bl / 2], [e, flat, ad], 0.15, { part: S.newPart(), tone: 0.1, tex: fuller as never, big: true });
  S.cone(g, wm(M.blade, W), at(SWL - 3.9), 2.7, at(SWL), 0.12, { part: S.newPart(), tone: 0.25 });
  X?.glints.push(at(SWL));
  return { tip: at(SWL) };
}

/** Капеллан в координатах модели. */
function build(p0: Pose, view: View): { S: Scene; X: Extra } {
  const S = new Scene();
  const X: Extra = { rings: [], flash: null, dust: [], orbs: null, fglow: null, glints: [], streak: 0 };
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.22, hy: p0.hy - 0.1 } : p0;
  const W = p.wither;
  const shift = bodyShift(view, p);
  const pel: V3 = add([0, 0, HIP0], shift);
  const up = p.chest * PXM, hz = p.headZ * PXM;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  const T = (v: V3, lift = v[2] >= 32): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PR = (v: V3): V3 => rot(v, p.pitch * 0.25, p.yaw * 0.35, p.roll * 0.5);
  const PV = (v: V3): V3 => add(pel, PR(sub(v, [0, 0, HIP0])));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const H = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0, yaw = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, yaw, roll)), f(rot([0, 1, 0], pitch, yaw, roll)), f(rot([0, 0, 1], pitch, yaw, roll)),
  ];
  const kn = p.kneel;
  const wv = (i: number, amp = 1) => Math.round(p.waveAmp * amp * (0.5 + 0.5 * Math.sin(TAU * (p.wave + i * 0.23)))) * PXM;
  const ID3: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  /** Пятна крови: тёмно-красные размывы по котте. */
  const stain = (c: { l: V3 }): number | { mat: Mat; d: number } => (Math.sin(c.l[0] * 2.3 + c.l[2] * 1.4) * Math.sin(c.l[2] * 2.9 - c.l[0] * 1.7) > 0.72 ? { mat: M.red, d: -1.1 } : 0);
  /** Складки ткани: вертикальные полосы света и тени. */
  const folds = (c: { l: V3 }): number => { const f = Math.sin(c.l[0] * 2.1 + Math.sin(c.l[2] * 0.5) * 0.8); return f > 0.55 ? 0.55 : f < -0.6 ? -0.7 : 0; };

  // ---------- тяжёлый тёмный плащ: спадает с плеч за спину крупными складками, разлетается назад и влево, низ рваный с лоскутами; колышется по низу ----------
  {
    const g = S.group(1.2);
    const sw = p.sway * PXM;
    const ragged = [3.0, 6.2, 2.4, 8.0, 3.6, 7.0, 2.4, 7.4, 4.0];
    const wear: Tex = (c) => (Math.sin(c.l[2] * 1.7 + c.l[0] * 2.0) > 0.86 ? 0.55 : Math.sin(c.l[2] * 2.9 - c.l[0] * 1.3) < -0.9 ? -0.6 : 0);
    // тёмная подложка между складками
    S.ell(g, wm(M.cloak, W), T([-3.2 + sw * 0.3, -5.0, 27.0 - kn * 4]), [10.0, 1.2, 15.5], axes(PR), { part: S.newPart(), tone: -0.6 });
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const ph = TAU * (p.wave + u * 0.9);
      const lat = p.waveAmp * 1.3 * Math.sin(ph) * (0.3 + 0.7 * u) + sw * (0.4 + u);
      const back = p.waveAmp * 0.9 * Math.cos(ph) * u;
      const ridge = i % 2 === 1;
      const a = T([6.4 - 15.5 * u, -4.5 - (ridge ? 0.7 : 0), 43.4 - 1.6 * Math.abs(u - 0.3)]);
      const bz = Math.max(1.6, ragged[i] + wv(i, 1.6) - kn * 2);
      const b: V3 = [pel[0] + 5.0 - 21.0 * u + lat + p.tail * PXM * 0.3 * u, pel[1] - 6.5 - 5.5 * u - back - (ridge ? 0.8 : 0), bz];
      S.cone(g, wm(M.cloak, W), a, ridge ? 2.9 : 2.5, b, ridge ? 1.7 : 1.4, { part: S.newPart(), tone: ridge ? 0.55 : -0.55, tex: wear as never });
      // рваные лоскуты разной длины на конце складки
      for (let q = 0; q < 2; q++) {
        const lenq = 2.6 + (((i * 5 + q * 3) % 5) * 1.25);
        const side = (i + q) % 2 ? 1 : -1;
        const tb: V3 = [b[0] + side * (1.0 + q * 0.9) - 0.5 * u, b[1] - 0.6 - q * 0.5, Math.max(0.6, b[2] - lenq)];
        S.cone(g, wm(M.cloak, W), add(b, [side * 0.3, 0, 0.6]), 1.0 - q * 0.25, tb, 0.1, { part: S.newPart(), tone: (i + q) % 2 ? 0.35 : -0.4 });
      }
    }
  }
  // ---------- ноги: длинные, в латах; тяжёлые сапоги с острым носком ----------
  {
    const g = S.group(0.9);
    for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
      const k = p.kick[i];
      const ft: V3 = [pel[0] + s * 6.0, pel[1] + 0.8 + 3.6 * k, Math.max(0, 0.6 + 2.8 * Math.max(0, k)) - kn * 2.2 + shift[2] * 0];
      const hip: V3 = [pel[0] + s * 3.0, pel[1], HIP0 - 2.2];
      const knee = ik(hip, add(ft, [0, 0, 3.0]), 9.9, 9.9, [s * 0.15, 0.12, 0.1]);
      const ank = add(ft, [0, 0, 3.0]);
      S.cone(g, wm(M.black, W), hip, 2.5, knee, 2.1, { tone: 0.0, big: true });
      S.cone(g, wm(M.black, W), knee, 2.1, ank, 1.7, { tone: 0.0, big: true });
      S.cone(g, wm(M.steel, W), add(knee, mul(sub(ank, knee), 0.12)), 2.5, ank, 2.1, { part: S.newPart(), tone: 0.1 });
      S.ell(g, wm(M.steel, W), add(knee, [0, 0.9, 0]), [2.5, 2.1, 2.4], ID3, { part: S.newPart(), tone: 0.25 });
      S.ell(g, wm(M.steel, W), add(ft, [0, 1.6, 1.9]), [3.0, 3.6, 2.5], ID3, { part: S.newPart(), tone: 0.05 });
      S.cone(g, wm(M.steel, W), add(ft, [0, 3.4, 1.8]), 2.4, add(ft, [0, 7.6, 0.8]), 0.5, { part: S.newPart(), tone: 0.3 });
      S.cone(g, wm(M.steel, W), add(ft, [0, 0.4, 3.9]), 0.7, add(ft, [0, 6.0, 2.6]), 0.5, { part: S.newPart(), tone: 1.0 });
      S.cone(g, wm(M.steel, W), add(ft, [0, -1.2, 3.0]), 2.2, add(ft, [0, -2.4, 0.8]), 0.6, { part: S.newPart(), tone: -0.2 });
    }
  }
  // ---------- котта до сапог: складки, рваный подол с лоскутами, красный крест через грудь и подол, кровь; торс клином ----------
  {
    const g = S.group(1.8);
    S.cone(g, wm(M.black, W), PV([0, 0.4, 24]), 3.4, T([0, 0.6, 31]), 4.4, { tone: -0.2 });
    S.ell(g, wm(M.cloth, W), PV([0, 0.2, 17.0]), [8.2, 4.5, 10.5], axes(PR), { part: S.newPart(), tone: -0.15, tex: ((c: { l: V3; edge: boolean }) => folds(c) || stain(c)) as never });
    const lensF = [13, 21, 18, 23, 18, 21, 13], lensB = [19, 22, 20, 21, 24, 20, 18];
    for (let i = -3; i <= 3; i++) {
      const dx = i * 1.95;
      for (const back of [false, true]) {
        const L = (back ? lensB : lensF)[i + 3];
        const lift = wv(i + (back ? 3 : 0), 1) + kn * 3;
        const y = back ? -4.3 : 4.5;
        const top = PV([dx, y, 26.0]);
        const bot = PV([dx * 1.6, y + (back ? -1.2 : 1.4), 26.0 - L]);
        bot[2] = Math.max(2.2, bot[2] + lift * 0.5);
        const red = !back && i === 0;
        S.cone(g, wm(red ? M.red : M.cloth, W), top, 1.6, bot, 1.1, { part: S.newPart(), tone: (i % 2 ? -0.5 : 0.25) + (back ? -0.25 : 0), tex: (i < 0 && !back ? stain : undefined) as never });
        // лоскуты: тонкие рваные ленты на подоле, разной длины, в стороны
        const tl = PV([dx * 1.6 + (i % 2 ? 1.2 : -1.2), y + (back ? -1.2 : 1.4), 26.0 - L + 2.2]);
        tl[2] = Math.max(1.6, tl[2] + lift * 0.4);
        const tb: V3 = [tl[0] + (i % 2 ? 2.4 : -2.2), tl[1] + (back ? -0.2 : 0.4), Math.max(0.8, tl[2] - 3.2 - ((i * 3 + (back ? 1 : 0)) % 3) * 1.1)];
        S.cone(g, wm(red ? M.red : M.cloth, W), tl, 0.7, tb, 0.1, { part: S.newPart(), tone: i % 2 ? -0.2 : 0.35 });
      }
    }
    // второй слой складок поверх подола: узкие передние лоскуты, разошедшиеся по бокам
    for (const [dx, L, t] of [[-3.6, 15, -0.4], [-1.8, 17, 0.4], [1.8, 16, -0.3], [3.6, 14, 0.45]] as [number, number, number][]) {
      const lift = wv(dx + 5, 1) + kn * 3;
      const top = PV([dx, 4.3, 25.0]);
      const bot = PV([dx * 2.0, 5.2, 25.0 - L]);
      bot[2] = Math.max(2.8, bot[2] + lift * 0.4);
      S.cone(g, wm(M.cloth, W), top, 1.0, bot, 0.35, { part: S.newPart(), tone: t });
    }
    // торс клином: широкая грудь и крест, узкая талия
    const cr: Tex = (c) => {
      if (c.l[1] < 0.2) return folds(c);
      if (Math.abs(c.l[0]) < 1.5 || (Math.abs(c.l[2] - 2.6) < 1.4 && Math.abs(c.l[0]) < 6.2)) return { mat: M.red, d: 0.1 };
      const s = stain(c);
      return s !== 0 ? s : folds(c);
    };
    S.ell(g, wm(M.cloth, W), T([0, 0.8, 35.6]), [9.2, 5.8, 7.2], axes(TV), { tex: cr as never, big: true });
    S.ell(g, wm(M.cloth, W), T([0, 0.6, 29.0]), [7.4, 4.6, 3.8], axes(TV), { part: S.newPart(), tone: -0.05, tex: folds as never });
    S.ell(g, wm(M.cloth, W), T([0, -0.4, 43.0]), [7.8, 5.2, 2.4], axes(TV), { part: S.newPart(), tone: 0.0 });
    for (const s of [1, -1]) {
      S.ell(g, wm(M.steel, W), T([s * 4.1, 3.4, 36.6]), [2.7, 2.2, 4.2], axes(TV, s * 0.25), { part: S.newPart(), tone: 0.15 });
      S.ell(g, wm(M.steel, W), T([s * 4.5, 2.8, 32.0]), [2.2, 2.0, 2.8], axes(TV, s * 0.3), { part: S.newPart(), tone: -0.2 });
    }
    S.ell(g, wm(M.steel, W), T([0, 1.0, 43.4]), [4.6, 3.4, 1.8], axes(TV), { part: S.newPart(), tone: 0.3 });
    // широкий кожаный пояс, второй ремень наискосок, пряжка, свисающие ремни с кольцами
    S.ell(g, wm(M.leath, W), PV([0, 0.6, 27.6]), [7.2, 4.7, 1.7], axes(PR), { part: S.newPart(), tone: 0.0 });
    S.cone(g, wm(M.leath, W), PV([-5.4, 3.4, 29.4]), 1.0, PV([5.6, 3.8, 25.4]), 1.0, { part: S.newPart(), tone: 0.0 });
    S.box(g, wm(M.steel, W), PV([0.6, 4.6, 27.4]), [1.3, 0.45, 1.2], axes(PR), 0.15, { part: S.newPart(), tone: 0.45 });
    for (const [dx, L] of [[2.6, 7], [4.0, 5.2], [-2.4, 6]] as [number, number][]) {
      S.cone(g, wm(M.leath, W), PV([dx, 4.4, 26.8]), 0.6, PV([dx + 0.3, 4.6, 26.8 - L]), 0.6, { part: S.newPart(), tone: 0.1 });
      S.cone(g, wm(M.steel, W), PV([dx + 0.3, 4.6, 26.8 - L]), 0.8, PV([dx + 0.3, 4.6, 26.8 - L - 0.5]), 0.8, { part: S.newPart(), tone: 0.35 });
    }
    // единственный предмет на поясе: светоч-фонарь на цепочке у левого бедра — тёмный каркас из прутьев, тёплый огонь внутри
    const lp = PV([-9.8, 4.6, 16.0]);
    const top0 = PV([-6.2, 3.8, 27.0]);
    for (let q = 0; q < 4; q++) {
      const a = lerp(0, 1, q / 4);
      S.ell(g, wm(M.steel, W), add(add(top0, mul(sub(add(lp, [0, 0, 5.6]), top0), a)), [0, 0, 0]), [0.55, 0.55, 0.85], ID3, { part: S.newPart(), tone: 0.35 });
    }
    S.ell(g, wm(M.steel, W), add(lp, [0, 0, 5.2]), [1.0, 1.0, 0.7], ID3, { part: S.newPart(), tone: 0.4 });
    S.cone(g, wm(M.steel, W), add(lp, [0, 0, 4.6]), 0.6, add(lp, [0, 0, 3.8]), 2.3, { part: S.newPart(), tone: 0.2 });
    S.ball(g, M.flame, add(lp, [0, 0.4, 0]), 1.9, { part: S.newPart() });
    S.ball(g, M.flameCore, add(lp, [0, 1.0, 0.3]), 0.95, { part: S.newPart() });
    S.cone(g, M.flame, add(lp, [0, 0.4, 1.0]), 0.9, add(lp, [0, 0.4, 3.2]), 0.1, { part: S.newPart() });
    for (const [bx, by] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) S.cone(g, wm(M.black, W), add(lp, [bx * 2.2, by * 2.2, 3.5]), 0.5, add(lp, [bx * 2.2, by * 2.2, -3.5]), 0.5, { part: S.newPart(), tone: -0.4 });
    S.ell(g, wm(M.black, W), add(lp, [0, 0, -3.8]), [2.6, 2.6, 0.7], ID3, { part: S.newPart(), tone: -0.3 });
    S.ell(g, wm(M.black, W), add(lp, [0, 0, 3.8]), [2.6, 2.6, 0.7], ID3, { part: S.newPart(), tone: -0.3 });
    S.cone(g, wm(M.steel, W), add(lp, [0, 0, -4.4]), 0.9, add(lp, [0, 0, -5.6]), 0.3, { part: S.newPart(), tone: 0.1 });
  }

  // ---------- оружие ----------
  const stowed = p.stow >= 0.5;
  const adS = norm(p.staff[1]);
  const pom: V3 = add(p.staff[0], stowed || p.held >= 0.5 ? shift : [0, 0, 0]);
  const gripR = add(pom, mul(adS, SW_GRIPR)), gripL = add(pom, mul(adS, SW_GRIPL));
  {
    const g = S.group(0.5);
    greatsword(S, g, { pom, ad: adS, flat: p.flat, W }, X);
  }
  // знамя: достаётся только в кадрах вбивания
  const hasBan = p.banner >= 0.5;
  const adB = norm(p.ban[1]);
  const buttB: V3 = add(p.ban[0], shift);
  const gripB = add(buttB, mul(adB, SG));
  if (hasBan) {
    const g = S.group(0.5);
    poleCloth(S, g, { butt: buttB, ad: adB, flat: view === "side" ? [-1, 0, 0.05] : [0, 1, 0.05], cs: clothSide(view), wave: p.wave, amp: p.waveAmp, W, L: STAFF_L, tail: Math.abs(p.sway) * 0.5 }, X);
  }

  // ---------- руки: массивные, в латах; хват меча / знамени, иначе свободны (левый кулак с холодным светом) ----------
  {
    const limb = (gg: number, sh: V3, el: V3, fist: V3) => {
      S.cone(gg, wm(M.black, W), sh, 2.9, el, 2.4, { tone: 0.0, big: true });
      S.cone(gg, wm(M.black, W), el, 2.4, fist, 2.0, { tone: 0.0, big: true });
      for (let q = 0; q < 3; q++) S.cone(gg, wm(M.steel, W), add(sh, mul(sub(el, sh), q / 3 + 0.05)), 3.7, add(sh, mul(sub(el, sh), q / 3 + 0.3)), 3.2, { part: S.newPart(), tone: 0.0 + 0.4 * (q % 2) });
      S.ell(gg, wm(M.steel, W), el, [3.0, 3.0, 3.0], ID3, { part: S.newPart(), tone: 0.35 });
      const f = norm(sub(fist, el));
      for (let q = 0; q < 2; q++) S.cone(gg, wm(M.steel, W), add(el, mul(f, 3.2 + q * 3.0)), 2.7, add(el, mul(f, 3.9 + q * 3.0)), 2.6, { part: S.newPart(), tone: 0.2 });
    };
    const g = S.group(1.0);
    const lift = pxM(view, 0, -p.armLift[0]);
    const sh = add(T([7.8, 0.2, 41.0]), lift);
    const fist: V3 = hasBan ? gripB : p.held >= 0.5 ? gripR : add(add(p.hand[0], shift), lift);
    const el = ik(sh, fist, ARM[0], ARM[1], p.pole[0]);
    limb(g, sh, el, fist);
    const fd = norm(sub(fist, el));
    const e0 = perp(fd, [0, 0, 1]);
    S.ell(g, wm(M.steel, W), fist, [2.8, 2.6, 3.0], [e0, cross(fd, e0), fd], { part: S.newPart(), tone: 0.3 });
    const g2 = S.group(1.0);
    const lift2 = pxM(view, 0, -p.armLift[1]);
    const sh2 = add(T([-7.8, 0.2, 41.0]), lift2);
    const twoH = !hasBan && p.held >= 1.5;
    const fist2: V3 = twoH ? gripL : add(add(p.hand[1], shift), lift2);
    const el2 = ik(sh2, fist2, ARM[0], ARM[1], p.pole[1]);
    limb(g2, sh2, el2, fist2);
    const fd2 = norm(sub(fist2, el2));
    const e1 = perp(fd2, [0, 0, 1]);
    S.ell(g2, wm(M.steel, W), fist2, [3.0, 2.8, 3.2], [e1, cross(fd2, e1), fd2], { part: S.newPart(), tone: 0.3 });
    if (p.orb > 0.02) X.orbs = { at: fist2, k: p.orb, go: p.orbGo };
    if (W < 0.5 && !twoH) X.fglow = { at: fist2, k: clamp(p.glow, 0, 1.6) * 0.5 + 0.35 * p.orb };
  }
  // ---------- плечи: массивные тёмные наплечники ступенями, внешнее крыло вверх ----------
  {
    const g = S.group(0.9);
    const rim: Tex = (c) => (c.edge ? { mat: M.steel, d: 1.2 } : 0);
    for (const s of [1, -1]) {
      S.ell(g, wm(M.steel, W), T([s * 9.2, -0.4, 42.4]), [5.6, 4.9, 3.0], axes(TV, s * 0.5), { tex: rim as never, big: true, part: S.newPart(), tone: 0.1 });
      S.ell(g, wm(M.steel, W), T([s * 9.6, -0.3, 39.9]), [5.0, 4.4, 1.8], axes(TV, s * 0.8), { part: S.newPart(), tone: -0.1 });
      S.ell(g, wm(M.steel, W), T([s * 9.9, -0.2, 38.0]), [4.4, 4.0, 1.4], axes(TV, s * 1.0), { part: S.newPart(), tone: -0.3 });
      S.cone(g, wm(M.steel, W), T([s * 7.6, -0.6, 43.8]), 2.8, T([s * 12.8, -1.2, 50.2]), 0.2, { part: S.newPart(), tone: 0.5 });
      S.cone(g, wm(M.cloth, W), T([s * 4.2, 0.6, 43.0]), 1.8, T([s * 6.4, 0.6, 39.6]), 1.8, { part: S.newPart(), tone: 0.0 });
    }
  }
  // ---------- голова: маленькая, облегающий остроконечный капюшон со светлой кромкой, стальная маска с бликом ----------
  {
    const g = S.group(1.2);
    const HC = 49.2;
    S.cone(g, wm(M.black, W), T([0, 1.0, 41.0], true), 2.2, H([0, 1.2, 46.0]), 2.2, { part: S.newPart(), tone: -0.2 });
    S.ell(g, wm(M.hood, W), H([0, -0.2, HC + 0.4]), [4.2, 4.7, 5.5], axes(HV), { big: true, tone: 0.1 });
    S.cone(g, wm(M.hood, W), H([0, -0.6, HC + 3.2]), 3.2, H([0, -3.6, HC + 8.6]), 0.2, { part: S.newPart(), tone: 0.25, big: true });
    S.ell(g, wm(M.hood, W), H([0, -3.2, HC - 0.8]), [3.8, 2.6, 4.8], axes(HV), { part: S.newPart(), tone: -0.3 });
    // светлая кромка капюшона вокруг лица
    S.ell(g, wm(M.cloth, W), H([0, 2.8, HC - 0.3]), [3.9, 2.2, 5.0], axes(HV), { part: S.newPart(), tone: 1.2 });
    S.ell(g, wm(M.black, W), H([0, 3.9, HC - 0.4]), [3.3, 1.9, 4.5], axes(HV), { part: S.newPart(), tone: -0.3 });
    const mask: Tex = (c) => {
      if (Math.abs(c.l[2] - 0.9) < 0.4 && Math.abs(c.l[0]) < 2.2) return { mat: M.black, d: -0.9 };
      if (c.l[0] < -0.5 && c.l[2] > -0.5) return { mat: M.blade, d: 1.2 };
      return 0;
    };
    S.ell(g, wm(M.steel, W), H([0, 4.9, HC - 0.5]), [2.9, 1.3, 4.2], axes(HV), { part: S.newPart(), tone: 0.9, tex: mask as never, big: true });
  }

  // ---------- частицы и эффекты ----------
  if (p.ring > 0.02) X.rings.push({ c: p.ringAt ?? [pel[0], pel[1], 0], r: 3 + 22 * p.ring, k: 1 - p.ring });
  if (p.flash > 0.02) X.flash = { at: p.flashAt ?? add(pom, [0, 0, 0]), k: p.flash };
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) X.dust.push({ at: i === 0 && p.flashAt ? [p.flashAt[0], p.flashAt[1], 0] : [pel[0] + (i ? -6 : 6), pel[1] + 6, 0], k: p.dust[i] });
  X.streak = p.streak;
  return finalize(S, X);
}
/** Тело — в двойном разрешении (K·RS), слои 2D — в пикселях кадра 1× (K). */
function finalize(S: Scene, X: Extra): { S: Scene; X: Extra } {
  scaleScene(S, K * RS);
  const sk = (v: V3) => mul(v, K);
  X.rings.forEach((r) => { r.c = sk(r.c); r.r *= K; });
  if (X.flash) X.flash.at = sk(X.flash.at);
  X.dust.forEach((d) => (d.at = sk(d.at)));
  if (X.orbs) X.orbs.at = sk(X.orbs.at);
  if (X.fglow) X.fglow.at = sk(X.fglow.at);
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
type Ctx = { img: PC; emis: PC; t: Float32Array; prim: Int32Array; view: View };
const put = (c: Ctx, x: number, y: number, col: RGBA, dz: number, glow = false) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 1 || y < 1 || x >= FW - 1 || y >= FH - 1) return;
  const i = y * FW + x;
  if (c.prim[i] >= 0 && c.t[i] < dz - 1) return;
  c.img.set(x, y, col);
  if (glow) c.emis.set(x, y, col);
};
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


/** Сгустки теней у левой кисти: три тёмных шара по эллипсу; go — расход вперёд (вниз по экрану / вправо в профиль). */
function drawOrbs(c: Ctx, o: { at: V3; k: number; go: number }, ph: number) {
  const [x0, y0] = scr(CAM, toView(c.view, o.at));
  for (let j = 0; j < 3; j++) {
    const a = (j / 3) * TAU + ph * TAU * 1.5;
    const orbit = 4.2 * (1 - o.go * 0.5);
    let cx = x0 + Math.cos(a) * orbit, cy = y0 - 2 + Math.sin(a) * orbit * 0.6;
    if (o.go > 0) {
      if (c.view === "side") { cx += o.go * (9 + j * 6); cy += (j - 1) * o.go * 2; }
      else { cx += (j - 1) * o.go * 7; cy += o.go * (7 + j * 3); }
    }
    const r = (1.2 + 1.6 * o.k) * (1 - 0.25 * o.go);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1) continue;
      put(c, x, y, SHADOW[d < 0.35 ? 4 : d < 0.7 ? 3 : 2], -99, true);
    }
    if (o.k > 0.5) put(c, cx - r - 1, cy + 1 + (j % 2), SHADOW[1], -99, true);
  }
}
/** Холодный свет у левого кулака: кольцо искр, язычки вверх, яркое ядро. */
function drawFistGlow(c: Ctx, g: { at: V3; k: number }, ph: number) {
  const [x0, y0] = scr(CAM, toView(c.view, g.at));
  const k = g.k;
  if (k < 0.05) return;
  const n = Math.round(5 + 5 * k);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + ph * TAU;
    const r = 3.4 + 0.9 * Math.sin(a * 3 + ph * TAU * 2);
    put(c, x0 + Math.cos(a) * r, y0 - 1 + Math.sin(a) * r * 0.8, GLOWC[i % 2 ? 3 : 2], -99, true);
  }
  for (const [dx, dy, t] of [[0, -4, 4], [2, -6, 3], [-2, -7, 3], [1, -9, 2]] as [number, number, number][]) if (k > 0.3 + (-dy) * 0.05) put(c, x0 + dx + Math.round(Math.sin(ph * TAU + dy)), y0 + dy, GLOWC[t], -99, true);
  put(c, x0, y0 - 1, GLOWC[4], -99, true); put(c, x0 + 1, y0 - 1, GLOWC[3], -99, true); put(c, x0, y0, GLOWC[3], -99, true);
}
/** Полосы натиска: пыль и росчерки позади (в профиль — слева, спереди/сзади — по бокам у ног). */
function drawStreak(c: Ctx, k: number) {
  const side = c.view === "side";
  for (let j = 0; j < 9; j++) {
    const y = 36 + Math.floor(hash01(j, 3, 71) * 38);
    const len = Math.round((4 + hash01(j, 5, 73) * 7) * k);
    const x0 = side ? 2 + Math.floor(hash01(j, 9, 79) * 8) : (j % 2 ? 50 : 6) + Math.floor(hash01(j, 9, 79) * 6);
    for (let i = 0; i < len; i++) {
      const x = side ? x0 + i : x0, yy = side ? y : y - i;
      if (x < 1 || yy < 1 || x >= FW - 1 || yy >= FH - 1 || c.img.alpha(x, yy)) continue;
      c.img.set(x, yy, SAND[i < 2 ? 3 : 2 - (i > len - 2 ? 1 : 0)]);
    }
  }
}

/** Кадр капеллана: { img, emis } 64×80. */
function finishFrame(S: Scene, X: Extra, view: View, pose: { trail?: V3[]; t: number }): { img: PC; emis: PC } {
  const R0 = renderScene(CAMR, S, view, OUT);
  const D = downscale(R0);
  const img = D.img;
  const emis = D.emis;
  const c: Ctx = { img, emis, t: D.t, prim: D.prim, view };
  for (const r of X.rings) drawRing(c, r, true);
  thicken(img, OUT, 3, [...GLOWC, ...FIRE, ...SHADOW, ...FLAME, ...SAND]);
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
  // контровой свет: холодная светлая кромка 1 px по внешнему силуэту — сильнее сверху и слева
  {
    const RIM: RGBA = [176, 208, 246, 255];
    const snap = img.clone();
    const gone = (x: number, y: number) => { const q = snap.get(x, y); return !q || q[3] < 120 || isOut(q); };
    for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) {
      const q = snap.get(x, y)!;
      if (q[3] < 200 || isOut(q) || isEmisCol(q)) continue;
      const tl = gone(x, y - 1) || gone(x - 1, y), other = gone(x + 1, y) || gone(x, y + 1);
      if (!tl && !other) continue;
      const m = mix(q, RIM, tl ? 0.62 : 0.3);
      img.set(x, y, [m[0], m[1], m[2], 255]);
    }
  }
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (x !== 0 && y !== 0 && x !== FW - 1 && y !== FH - 1) continue;
    const q = img.get(x, y)!;
    if (q[3] && !isOut(q)) { img.clear(x, y); emis.clear(x, y); }
  }
  if (X.streak > 0.02) drawStreak(c, X.streak);
  for (const r of X.rings) drawRing(c, r, false);
  if (pose.trail) drawTrail(c, pose.trail.map((q) => mul(q, K)));
  for (const g of X.glints) drawGlint(c, g);
  if (X.fglow) drawFistGlow(c, X.fglow, pose.t);
  if (X.orbs) drawOrbs(c, X.orbs, pose.t);
  if (X.flash) drawFlash(c, X.flash);
  for (const d of X.dust) drawDust(c, d);
  return { img, emis };
}
export function renderChap(view: View, pose: Pose): { img: PC; emis: PC } {
  const { S, X } = build(pose, view);
  return finishFrame(S, X, view, pose);
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
/** Остриё меча в мире (модель): для следа и вспышки. */
function tipW(p: Pose, view: View): V3 {
  return add(buttW(p, view), mul(norm(p.staff[1]), SWL));
}
function buttW(p: Pose, view: View): V3 {
  const sh = p.stow >= 0.5 || p.held >= 0.5 ? bodyShift(view, p) : [0, 0, 0] as V3;
  return add(p.staff[0], sh);
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
const sv = <T,>(view: View, front: T, side: T): T => (view === "side" ? side : front);

const FL = (view: View): V3 => (view === "side" ? [-1, 0, 0] : [0, 1, 0]);
/** Руки опущены, правый кулак у бедра; без меча и знамени в руках. */
const handsFree = (view: View): [V3, V3] => (view === "side" ? [[9.4, 3.5, 22.5], [-9.4, 4.0, 22.5]] : [[10.4, 2.0, 22.5], [-10.4, 2.0, 22.5]]);

/** Покой: меч за спиной, дыхание по пикселю (грудь, плечи, голова), плащ и подол качаются. */
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
/** Ходьба: размеренный тяжёлый шаг, руки покачиваются, меч за спиной, подол и плащ развеваются. */
function walkPoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const bob = [0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0];
  const swayX = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0];
  const hf = handsFree(view);
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    const fw = Math.sin(TAU * u);
    return {
      ...R0, t: u, seed: 150 + i,
      root: [side ? 0 : swayX[i], 0, 0] as V3, bob: -1 + bob[i] * PXM,
      kick: [Math.max(0, Math.sin(TAU * u)) - 0.2, Math.max(0, Math.sin(TAU * u + Math.PI)) - 0.2] as [number, number],
      sway: [0, 1, 1, 0, -1, -1][i % 6], tail: [0, 1, 2, 2, 1, 0][i % 6], wave: u * 2, waveAmp: 1.4,
      hand: [[hf[0][0], hf[0][1] + 2.6 * fw, hf[0][2]], [hf[1][0], hf[1][1] - 2.6 * fw, hf[1][2]]] as [V3, V3],
      dust: [i === 1 ? 0.5 : i === 7 ? 0.5 : 0, 0] as [number, number],
    };
  });
}
/** Меч верх-назад, двумя руками: общий замах для удара мечом и обычной атаки. */
const swordWind = (view: View, extra: Partial<Pose> = {}): Partial<Pose> => ({
  pitch: -0.08, hp: -0.1, yaw: rv(view) ? 0.1 : -0.28, glow: 1.4, held: 2, stow: 0, flat: FL(view),
  staff: rv(view) ? sw([4, -1, 22], [0, -0.47, 0.88]) : sw([6, -2, 22], [0.2, -0.4, 0.89]), ...extra,
});
/** «Удар мечом» (конус на танка): меч уходит за правое плечо, рубящий удар вперёд-вниз; удар — кадр 3. */
function slashKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind = swordWind(view);
  const hit: Partial<Pose> = {
    ...wind, pitch: 0.16, hp: 0.08, yaw: side ? -0.05 : 0.3, bob: -2 * PXM, glow: 1.6, flash: 1,
    staff: side ? sw([2, 3, 34], [0, 0.42, -0.9]) : sw([0, 9, 34], [-0.35, 0.45, -0.82]),
  };
  const keys: Key[] = [
    { f: 0, p: wind },
    { f: 1, p: { ...wind, staff: side ? sw([3, -2, 23], [0, -0.55, 0.83]) : sw([7, -3, 23], [0.3, -0.5, 0.81]) }, ease: easeOut },
    { f: 2, p: { ...hit, flash: 0, staff: side ? sw([3, 1, 30], [0, 0.1, 0.99]) : sw([4, 4, 31], [0, 0.1, 0.99]) }, ease: easeIn },
    { f: 3, p: hit, ease: easeOut },
    { f: 4, p: { ...hit, flash: 0 }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, bob: 0 }, ease: easeOut },
    { f: 8, p: {}, ease: easeInOut }, { f: 9, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function slashStrikePoses(view: View): Pose[] {
  const { R0, keys } = slashKeys(view);
  const poses = keyed(R0, keys, 10, 540);
  poses[2].trail = trailOf(R0, keys, view, 0.6, 2, 6);
  poses[3].trail = trailOf(R0, keys, view, 1.4, 3, 7);
  poses[4].trail = trailOf(R0, keys, view, 2.4, 3.8, 6);
  poses[3].flashAt = tipW(poses[3], view);
  poses[3].dust = [0.8, 0];
  return poses;
}
/** Обычная атака: короткий рубящий удар двуручным мечом. */
function attackPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = rv(view);
  const wind = swordWind(view, { glow: 1.3, staff: side ? sw([4, -1, 24], [0, -0.4, 0.92]) : sw([5, -1, 24], [0.15, -0.3, 0.94]) });
  const hit: Partial<Pose> = { ...wind, yaw: side ? -0.04 : 0.18, pitch: 0.18, hp: 0.1, bob: -2 * PXM, glow: 1.4, flash: 1, staff: side ? sw([2, 2, 33], [0, 0.4, -0.92]) : sw([0, 7, 32], [-0.2, 0.5, -0.84]) };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 3, p: wind, ease: easeInOut }, { f: 4, p: { ...wind, armLift: [1, 1] }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, staff: side ? sw([3, 0, 30], [0, 0.1, 0.99]) : sw([3, 3, 30], [0, 0.1, 0.99]) }, ease: easeIn }, { f: 6, p: hit, ease: easeOut }, { f: 7, p: { ...hit, flash: 0, bob: -1 * PXM }, ease: easeOut },
    { f: 8, p: {}, ease: easeInOut }, { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 10, 400);
  poses[5].trail = trailOf(R0, keys, view, 4, 5);
  poses[6].trail = trailOf(R0, keys, view, 4.2, 6);
  poses[6].flashAt = tipW(poses[6], view);
  poses[6].dust = [1, 0];
  return poses;
}
/** «Залп теней»: меч за спиной, левая рука вскинута, в ладони копятся сгустки; бросок — сгустки уходят вперёд. */
function volleyKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const hf = handsFree(view);
  const wind: Partial<Pose> = { pitch: -0.07, hp: -0.12, bob: 0, glow: 1.5, orb: 0.8, armLift: [0, 1], hand: [hf[0], side ? [-8.6, 9, 52] : [-12, 6, 52]], pole: [[1, -0.4, -0.2], [-1, 0.1, -0.6]] };
  const hit: Partial<Pose> = { ...wind, pitch: 0.12, hp: 0.06, bob: -1 * PXM, glow: 1.6, orb: 1, orbGo: 0.15, hand: [hf[0], side ? [-8.6, 15, 45] : [-10, 15, 46]], armLift: [0, 0] };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, orb: 0.95 }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, orbGo: 0.5 }, ease: linear }, { f: 4, p: { ...hit, orbGo: 0.9, orb: 0.8 }, ease: linear },
    { f: 5, p: { ...hit, orbGo: 1, orb: 0.5, bob: 0 }, ease: linear }, { f: 7, p: { orb: 0, orbGo: 1, hand: R0.hand, pole: R0.pole }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function volleyCastPoses(view: View): Pose[] {
  const { R0, keys } = volleyKeys(view);
  return keyed(R0, keys, 8, 640).map((p, i) => ({ ...p, t: i / 8 }));
}
/** Вбивание знамени (переход в фазу 2): знамя достаётся из-за спины, вскинуто двумя руками, удар в землю перед собой; дальше знамя — объект. */
function plantKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const hf = handsFree(view);
  const wind: Partial<Pose> = {
    pitch: -0.12, hp: -0.18, bob: 1 * PXM, glow: 1.5, armLift: [1, 1], banner: 1,
    ban: side ? stf([11.6, 6, 30], [0, 0.4, 0.9]) : stf([10.8, 5, 30], [0, 0.45, 0.89]),
    hand: [hf[0], side ? [-8.6, 7, 32] : [4.5, 6, 32]], pole: [[1, -0.4, -0.2], [-1, 0.1, -0.5]],
  };
  const hit: Partial<Pose> = {
    ...wind, pitch: 0.26, hp: 0.12, bob: -2.2 * PXM, armLift: [0, 0], ring: 0.08, dust: [1, 1], flash: 1,
    ban: side ? stf([11.6, 13, 22], [0, 0.2, 1]) : stf([8, 12.5, 22], [0, 0.2, 1]),
    hand: [hf[0], side ? [-8.6, 12, 22] : [4.5, 12.5, 22]],
  };
  const released: Partial<Pose> = { pitch: 0.26, hp: 0.12, bob: -2.2 * PXM, banner: 0, hand: hf };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: 2 * PXM }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...released, flash: 0, ring: 0.4, dust: [0.6, 0.6] }, ease: linear }, { f: 4, p: { ...released, flash: 0, ring: 0.8, dust: [0.3, 0.3] }, ease: linear },
    { f: 5, p: { ...released, flash: 0, ring: 0, dust: [0, 0], bob: -1 * PXM }, ease: linear }, { f: 7, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function plantStrikePoses(view: View): Pose[] {
  const { R0, keys } = plantKeys(view);
  const poses = keyed(R0, keys, 8, 740);
  const b = poses[2].ban[0];
  poses.forEach((p, i) => { if (i >= 2 && i <= 5) { p.ringAt = [b[0], b[1], 0]; p.flashAt = [b[0], b[1], 1]; } });
  return poses;
}
/** «Последний натиск»: присел, меч двумя руками наискось вперёд; бег по кругу с полосами; удар с толчком. */
function rushKeys(view: View) {
  const R0 = restOf(view);
  const side = rv(view);
  const wind: Partial<Pose> = {
    pitch: 0.3, hp: -0.1, bob: -2 * PXM, glow: 1.6, held: 2, stow: 0, flat: FL(view),
    staff: side ? sw([5, -3, 21], [0, 0.55, 0.83]) : sw([6, -3, 21], [0.1, 0.5, 0.86]),
  };
  return { R0, wind };
}
function rushDashPoses(view: View): Pose[] {
  const { R0, wind } = rushKeys(view);
  return Array.from({ length: 4 }, (_, i) => ({
    ...R0, ...wind, t: i / 4, seed: 1000 + i, pitch: 0.34, bob: [-2, -3, -2, -3][i] * PXM, streak: 1,
    kick: [[0.9, -0.1, 0.1, 0.9][i], [0.1, 0.9, 0.9, 0.1][i]] as [number, number],
    wave: i / 4, waveAmp: 1.6, sway: [1, 1, 0, 1][i], tail: [3, 2, 3, 2][i], dust: [[0.7, 0][i % 2], 0.4] as [number, number],
    root: [0, 0, 0] as V3,
  }));
}
function rushStrikePoses(view: View): Pose[] {
  const { R0, wind } = rushKeys(view);
  const side = rv(view);
  const hit: Partial<Pose> = { ...wind, pitch: 0.22, bob: -1 * PXM, flash: 1, ring: 0.08, dust: [1, 1], glow: 1.7,
    staff: side ? sw([2, 0, 21], [0, 0.5, 0.86]) : sw([2, 3, 21], [0, 0.55, 0.83]) };
  const keys: Key[] = [
    { f: 0, p: { ...wind, streak: 1 } }, { f: 1, p: { ...hit, streak: 0.6 }, ease: easeIn },
    { f: 2, p: { ...hit, flash: 0, ring: 0.4, dust: [0.6, 0.6], streak: 0.2 }, ease: linear },
    { f: 3, p: { ...hit, flash: 0, ring: 0.8, dust: [0.3, 0.3], streak: 0 }, ease: linear },
    { f: 4, p: { glow: 1.2, ring: 0, dust: [0, 0] }, ease: easeInOut }, { f: 5, p: {}, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 6, 1060);
  poses.forEach((p, i) => { if (i >= 1 && i <= 3) { p.ringAt = [0, 0, 0]; p.flashAt = tipW(p, view); } });
  poses[1].trail = trailOf(R0, keys, view, 0, 1, 5);
  return poses;
}
/** Оглушение: покачивается, голова свесилась, руки опущены. */
function stunPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const rl = [0, 0.05, 0.08, 0.05, 0, -0.05, -0.08, -0.05];
  return Array.from({ length: 8 }, (_, i) => ({
    ...R0, t: i / 8, seed: 1500 + i, roll: rl[i], hp: 0.3, hr: -rl[i] * 1.4 + 0.12, pitch: 0.12, bob: -2 * PXM, glow: 0.35,
    root: [[0, 1, 1, 1, 0, -1, -1, -1][i], 0, 0] as V3,
    sway: [0, 1, 1, 0, 0, -1, -1, 0][i], tail: [0, 1, 2, 2, 1, 0, 0, 0][i], wave: i / 8, waveAmp: 1,
  }));
}
/** Гибель: отшатнулся, меч выпадает из-за спины и ложится наискось, падает на колени, клонится вперёд; свет гаснет. */
function deathPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const Wv = (v: V3): V3 => fromView(view, v);
  const fall: [V3, V3] = sw(Wv([12, 4, 14]), Wv([-0.3, -0.2, -0.93]));
  const lying: [V3, V3] = sw(Wv([10, 4, 1.4]), Wv([-0.5, -0.86, 0.04]));
  const recoil: Partial<Pose> = { pitch: -0.14, hp: -0.3, bob: 1 * PXM, glow: 1.6, sway: 1, flash: 0 };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1, p: recoil, ease: easeOut }, { f: 2, p: { ...recoil, pitch: 0.08, hp: 0, bob: 0, glow: 1.1 }, ease: easeInOut },
    { f: 3, p: { stow: 0, staff: fall, hand: [[10, 8, 28], [-9.6, 6, 24]], pitch: 0.14, glow: 0.9, kneel: 0.3 }, ease: easeIn },
    { f: 4, p: { stow: 0, staff: lying, hand: [[9.6, 8, 20], [-9.6, 7, 17]], pitch: 0.22, glow: 0.7, kneel: 0.75, dust: [1, 1] }, ease: easeIn },
    { f: 5, p: { stow: 0, staff: lying, hand: [[9, 8, 16], [-9, 8, 14]], pitch: 0.3, hp: 0.2, glow: 0.5, kneel: 1, dust: [0.5, 0.5] }, ease: easeOut },
    { f: 8, p: { stow: 0, staff: lying, hand: [[8.6, 9, 15], [-8.6, 9, 13]], pitch: 0.44, hp: 0.5, glow: 0.2, kneel: 1, wither: 0.3, tail: 0 }, ease: easeInOut },
    { f: 13, p: { stow: 0, staff: lying, hand: [[8.4, 9, 14.5], [-8.4, 9, 12.6]], pitch: 0.5, hp: 0.6, hr: 0.1, glow: 0, kneel: 1, wither: 0.6 }, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 14, 1300);
  for (let i = 3; i < 14; i++) { poses[i].stow = 0; poses[i].held = 0; if (i >= 4) poses[i].staff = lying; }
  return poses;
}

export type ChapAnim = "idle" | "walk" | "attack" | "slashWind" | "slashHold" | "slashStrike" | "volleyWind" | "volleyHold" | "volleyCast"
  | "plantWind" | "plantHold" | "plantStrike" | "rushWind" | "rushHold" | "rushDash" | "rushStrike" | "stun" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: ChapAnim; hit?: number };
const ANIM_ORDER: [ChapAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой (меч за спиной)" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "рубящий удар мечом (обычный)", hit: 6 }],
  ["slashWind", { n: 4, fps: 12, loop: false, ru: "меч из-за спины, замах", next: "slashHold" }],
  ["slashHold", { n: 4, fps: 12, loop: true, ru: "меч отведён", next: "slashStrike" }],
  ["slashStrike", { n: 10, fps: 12, loop: false, ru: "удар мечом", hit: 3 }],
  ["volleyWind", { n: 4, fps: 12, loop: false, ru: "зов теней", next: "volleyHold" }],
  ["volleyHold", { n: 4, fps: 12, loop: true, ru: "тени копятся", next: "volleyCast" }],
  ["volleyCast", { n: 8, fps: 12, loop: false, ru: "залп теней", hit: 2 }],
  ["plantWind", { n: 4, fps: 12, loop: false, ru: "знамя из-за спины", next: "plantHold" }],
  ["plantHold", { n: 4, fps: 12, loop: true, ru: "знамя над головой", next: "plantStrike" }],
  ["plantStrike", { n: 8, fps: 12, loop: false, ru: "вбивание знамени", hit: 2 }],
  ["rushWind", { n: 4, fps: 12, loop: false, ru: "присел к натиску", next: "rushHold" }],
  ["rushHold", { n: 4, fps: 12, loop: true, ru: "меч наискось", next: "rushDash" }],
  ["rushDash", { n: 4, fps: 12, loop: true, ru: "натиск (бег)", next: "rushStrike" }],
  ["rushStrike", { n: 6, fps: 12, loop: false, ru: "конец натиска, толчок", hit: 1 }],
  ["stun", { n: 8, fps: 12, loop: true, ru: "оглушение" }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const CHAP_ANIMS = {} as Record<ChapAnim, AnimDef>;
{
  let col = 0;
  for (const [k, a] of ANIM_ORDER) { CHAP_ANIMS[k] = { ...a, col }; col += a.n; }
}
export const CHAP_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
export const CHAP_SKILLS: Record<string, { windup: [ChapAnim, ChapAnim]; strike: ChapAnim }> = {
  sword_cleave: { windup: ["slashWind", "slashHold"], strike: "slashStrike" },
  shadow_volley: { windup: ["volleyWind", "volleyHold"], strike: "volleyCast" },
  plant_banner: { windup: ["plantWind", "plantHold"], strike: "plantStrike" },
  last_charge: { windup: ["rushWind", "rushHold"], strike: "rushStrike" },
};
const POSES: Record<ChapAnim, (v: View) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v), attack: attackPoses,
  slashWind: (v) => { const { R0, wind } = slashKeys(v); return windPoses(R0, wind, 500); },
  slashHold: (v) => { const { R0, wind } = slashKeys(v); return holdPoses(R0, wind, 520, 4, (i) => ({ armLift: [TREMBLE[i], 0], glow: [1.4, 1.6, 1.45, 1.6][i], waveAmp: 1.4, wave: i / 4 })); },
  slashStrike: slashStrikePoses,
  volleyWind: (v) => { const { R0, wind } = volleyKeys(v); return windPoses(R0, wind, 600).map((p, i) => ({ ...p, orb: [0.2, 0.45, 0.65, 0.8][i] })); },
  volleyHold: (v) => { const { R0, wind } = volleyKeys(v); return holdPoses(R0, wind, 620, 4, (i) => ({ glow: [1.4, 1.6, 1.45, 1.6][i], orb: [0.8, 0.9, 0.85, 1][i] })); },
  volleyCast: volleyCastPoses,
  plantWind: (v) => { const { R0, wind } = plantKeys(v); return windPoses(R0, wind, 700); },
  plantHold: (v) => { const { R0, wind } = plantKeys(v); return holdPoses(R0, wind, 720, 4, (i) => ({ armLift: [TREMBLE[i] * 0.5 + 1, 1], glow: [1.4, 1.6, 1.45, 1.6][i], wave: i / 4, waveAmp: 1.6 })); },
  plantStrike: plantStrikePoses,
  rushWind: (v) => { const { R0, wind } = rushKeys(v); return windPoses(R0, wind, 1000); },
  rushHold: (v) => { const { R0, wind } = rushKeys(v); return holdPoses(R0, wind, 1020, 4, (i) => ({ glow: [1.5, 1.7, 1.55, 1.7][i], armLift: [TREMBLE[i] * 0.5, 0], wave: i / 4, waveAmp: 1.4 })); },
  rushDash: rushDashPoses, rushStrike: rushStrikePoses, stun: stunPoses, death: deathPoses,
};

// ---------------- знамя-объект (вбито в центр арены) ----------------
/** Земля у основания знамени. */
const DIRT = R("#17120e", "#2c231b", "#483a2c", "#6a5740", "#8f7a58");
const MD = mat("земля", DIRT, { base: 1.8, gain: 2.2 });
/** Состояние знамени: rise — вбивается (0 → 1), fall — срублено (0 → 1), ring — волна удара, wave — фаза полотнища, flash — вспышка на навершии. */
interface BanPose { rise: number; fall: number; wave: number; ring: number; flash: number; dust: number }
export const BANNER_ANIMS: Record<string, { col: number; n: number; loop: boolean; fps: number; hit?: number; ru: string }> = {
  plant: { col: 0, n: 4, loop: false, fps: 12, hit: 2, ru: "вбито" },
  idle: { col: 4, n: 8, loop: true, fps: 12, ru: "стоит" },
  pulse: { col: 12, n: 6, loop: false, fps: 12, hit: 1, ru: "удар кольцом" },
  fall: { col: 18, n: 6, loop: false, fps: 12, ru: "срублено" },
};
export const BANNER_COLS = 24;
function banPoses(): BanPose[] {
  const out: BanPose[] = [];
  const base: BanPose = { rise: 1, fall: 0, wave: 0, ring: 0, flash: 0, dust: 0 };
  [[0.0, 0], [0.4, 0], [0.8, 0], [1, 1]].forEach(([r, d], i) => out.push({ ...base, rise: r, dust: d, wave: i / 8, flash: i === 3 ? 1 : 0 }));
  for (let i = 0; i < 8; i++) out.push({ ...base, wave: i / 8 });
  [[0.0, 1], [0.45, 0.6], [0.8, 0.2], [1, 0], [0, 0], [0, 0]].forEach(([r, f], i) => out.push({ ...base, wave: i / 6, ring: i < 4 ? r : 0, flash: i < 4 ? f : 0 }));
  [0, 0.18, 0.4, 0.65, 0.88, 1].forEach((f, i) => out.push({ ...base, fall: f, wave: i / 6 }));
  return out;
}
function renderBanner(b: BanPose): { img: PC; emis: PC } {
  const S = new Scene();
  const X: Extra = { rings: [], flash: null, dust: [], orbs: null, fglow: null, glints: [], streak: 0 };
  const g = S.group(0.5);
  const W = clamp(b.fall * 0.6, 0, 1);
  const a = b.fall * 1.28;
  const ad: V3 = norm([Math.sin(a) * 0.9, 0, Math.cos(a)]);
  const bx = -4;
  const butt: V3 = [bx + (1 - b.rise) * 3, 0, (1 - b.rise) * 24 + (b.fall > 0 ? Math.sin(a) * 0.5 : 0)];
  const tilt = norm([ad[0] + (1 - b.rise) * 0.2, ad[1], ad[2]]);
  const r = poleCloth(S, g, { butt, ad: tilt, flat: [0, 1, 0.02], cs: -1, wave: b.wave, amp: 1.25 * (1 - b.fall * 0.7), W, L: 46 }, X);
  // основание: насыпь и обломки камня
  const g2 = S.group(0.9);
  S.ell(g2, wm(MD, W), [bx, 0.5, 0.4], [6.2, 4.4, 1.3], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], { part: S.newPart(), tone: 0.0 });
  for (const [dx, dy, rx, rz, t] of [[-4.6, 2.2, 2.2, 1.7, 0.3], [4.0, 2.8, 2.6, 2.0, 0.1], [1.8, 4.2, 1.7, 1.2, 0.5], [-2.6, -2.4, 2.0, 1.5, -0.1], [5.4, -1.0, 1.5, 1.2, 0.2]] as [number, number, number, number, number][])
    S.ell(g2, wm(M.steel, W), [bx + dx, dy, rz * 0.7], [rx, rx * 0.8, rz], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], { part: S.newPart(), tone: t });
  if (b.dust > 0.05) X.dust.push({ at: [bx, 5, 0], k: b.dust });
  if (b.ring > 0.02) X.rings.push({ c: [bx, 0, 0], r: 3 + 21 * b.ring, k: 1 - b.ring });
  if (b.flash > 0.02) X.flash = { at: r.tip, k: b.flash };
  const { S: S2, X: X2 } = finalize(S, X);
  return finishFrame(S2, X2, "down", { t: b.wave });
}
function buildBanner(): { img: PC; emis: PC } {
  const img = new PC(N * BANNER_COLS, FH), emis = new PC(N * BANNER_COLS, FH);
  banPoses().forEach((b, i) => { const f = renderBanner(b); img.blit(f.img, i * N, 0); emis.blit(f.emis, i * N, 0); });
  return { img, emis };
}

/**
 * Знамя-моб (кольцо, banner): лист как у мобов — 12 столбцов × 3 вида, кадр 64×80: «ходьба» 0–3 и «атака» 4–7 — знамя стоит и колышется,
 * 8–11 — гибель: древко падает, полотнище оседает.
 */
export const BANNER_UNIT = { frame: FRAME, frameH: FRAME_H, cols: 12 };
export function buildBannerUnit(): PC {
  const ph = banPoses();
  const pick = [4, 6, 8, 10, 13, 14, 15, 16, 19, 21, 22, 23];
  const out = new PC(N * 12, FH * 3);
  pick.forEach((k, i) => { const f = renderBanner(ph[k]); for (let row = 0; row < 3; row++) out.blit(f.img, i * N, row * FH); });
  return out;
}

// ---------------- листы, проверки, монтажи ----------------
function animSheets(only?: ChapAnim[], maxFrames = 99): { img: Record<ChapAnim, PC>; emis: Record<ChapAnim, PC> } {
  const img = {} as Record<ChapAnim, PC>, emis = {} as Record<ChapAnim, PC>;
  for (const [a, d] of ANIM_ORDER) {
    const I = new PC(N * d.n, FH * 3), E = new PC(N * d.n, FH * 3);
    if (!only || only.includes(a)) VIEWS.forEach((v, row) => POSES[a](v).slice(0, Math.min(d.n, maxFrames)).forEach((p, i) => {
      const r = renderChap(v, p);
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
interface Assets { hero: PC; terrain: PC; ref: PC | null }
const heroAt = (A: Assets, row: number) => crop(A.hero, 0, row * 32, 32, 32);
type Sheets = { img: Record<ChapAnim, PC>; emis: Record<ChapAnim, PC> };
type Item = { img: PC; emis: PC | null; flip?: boolean };

/** Кадры галереи: покой во все стороны, удар древком, залп, вбивание знамени, натиск, знамя-объект. */
function gallery(sheets: Sheets): { label: string; items: Item[] } {
  const idle = (row: number, flip = false): Item => ({ img: crop(sheets.img.idle, 0, row * FH, N, FH), emis: crop(sheets.emis.idle, 0, row * FH, N, FH), flip });
  const pose = (p: Pose, v: View, flip = false): Item => ({ ...renderChap(v, p), flip });
  const ban = renderBanner({ rise: 1, fall: 0, wave: 0.2, ring: 0, flash: 0, dust: 0 });
  return {
    label: "ПОКОЙ: ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | УДАР МЕЧОМ | ЗАЛП ТЕНЕЙ | ВБИВАНИЕ ЗНАМЕНИ (ВНИЗ, ВБОК) | НАТИСК (ВНИЗ, ВБОК) | ЗНАМЯ",
    items: [idle(0), idle(1), idle(2), idle(2, true), pose(POSES.slashStrike("down")[3], "down"), pose(POSES.volleyCast("down")[3], "down"),
      pose(POSES.plantStrike("down")[2], "down"), pose(POSES.plantStrike("side")[2], "side"), pose(POSES.rushDash("down")[1], "down"), pose(POSES.rushDash("side")[1], "side"),
      { img: ban.img, emis: ban.emis }],
  };
}
/**
 * «Наш | референс»: ×1 и ×3 с героем на земле, галерея умений ×3 день/ночь, большие кадры ×6 (вниз, вверх, вбок) рядом с образцом 21.
 */
function buildCompare(sheets: Sheets, A: Assets): PC {
  const k6 = 6;
  const H6 = FH * k6;
  const RH = A.ref ? A.ref.h : H6;
  const rowH = Math.max(H6, RH);
  const gal = gallery(sheets);
  const W = Math.max(gal.items.length * (N * 3 + 8) + 48, 24 + 3 * (N * k6 + 12) + 40 + (A.ref ? A.ref.w : 500) + 24, 1500);
  const y1 = 12, y3 = y1 + 22 + 92 + 12, yg = y3 + 22 + 90 * 3 + 12, yb = yg + 22 + 2 * (FH * 3 + 6) + 30;
  const c = new PC(W, yb + 2 * (rowH + 70) + 20);
  fill(c, 0, 0, c.w, c.h, [30, 28, 34, 255]);
  const bn = gal.items[gal.items.length - 1];
  for (const [kk, y0] of [[1, y1], [3, y3]] as [number, number][]) {
    text(c, `×${kk} · ГЕРОЙ · КАПЕЛЛАН ВНИЗ, ВВЕРХ, ВБОК, ВЛЕВО · ЗНАМЯ-ОБЪЕКТ`, 24, y0, 2);
    const yb0 = y0 + 22 + 88 * kk;
    groundBg(c, A.terrain, 24, y0 + 20, Math.min(W - 48, (34 + 66 * 5 + 40) * kk + 40), 90 * kk, kk, "dirt");
    let x = 40;
    const put1 = (img: PC, feet: number, w: number, flip = false) => {
      shadowBlob(c, x + (img.w / 2) * kk, yb0 - 0.5 * kk, Math.min(16, (img.w / 32) * 6.5) * kk, 2.4 * kk);
      c.blit(scaleNN(img, kk, flip), x, Math.round(yb0 - feet * kk));
      x += w * kk;
    };
    put1(heroAt(A, 0), 30.4, 34);
    put1(crop(sheets.img.idle, 0, 0, N, FH), CAM.GY, 66);
    put1(crop(sheets.img.idle, 0, FH, N, FH), CAM.GY, 66);
    put1(crop(sheets.img.idle, 0, 2 * FH, N, FH), CAM.GY, 66);
    put1(crop(sheets.img.idle, 0, 2 * FH, N, FH), CAM.GY, 66, true);
    put1(bn.img, CAM.GY, 66);
  }
  text(c, gal.label + "  (×3, ДЕНЬ / НОЧЬ)", 24, yg, 2);
  const gw = gal.items.length * (N * 3 + 8) + 8;
  for (const [ni, night] of [false, true].entries()) {
    const yy = yg + 22 + ni * (FH * 3 + 6);
    fill(c, 24, yy, gw, FH * 3, night ? [38, 46, 74, 255] : [120, 104, 84, 255]);
    gal.items.forEach((it, i) => {
      const ix = 24 + 8 + i * (N * 3 + 8);
      c.blit(scaleNN(it.img, 3, it.flip), ix, yy);
      if (night && it.emis) { nightRect(c, ix, yy, N * 3, FH * 3); relight(c, it.emis, ix, yy, 3, it.flip); }
    });
  }
  const bw = 3 * (N * k6 + 12);
  for (const night of [false, true]) {
    const y = yb + 48 + (night ? rowH + 70 : 0);
    text(c, night ? "НАШ · НОЧЬ" : "НАШ · ДЕНЬ", 24, y - 36, 3);
    text(c, "РЕФЕРЕНС 21", 24 + bw + 40, y - 36, 3);
    const oy = y + rowH - H6;
    fill(c, 24, oy, bw, H6, night ? [38, 46, 74, 255] : [120, 104, 84, 255]);
    for (let j = 0; j < 3; j++) c.blit(scaleNN(crop(sheets.img.idle, 0, j * FH, N, FH), k6), 24 + j * (N * k6 + 12), oy);
    if (night) {
      nightRect(c, 24, oy, bw, H6);
      for (let j = 0; j < 3; j++) relight(c, crop(sheets.emis.idle, 0, j * FH, N, FH), 24 + j * (N * k6 + 12), oy, k6);
    }
    fill(c, 24 + bw + 16, y, 4, rowH, [240, 232, 214, 255]);
    if (A.ref) c.blit(A.ref, 24 + bw + 40, y);
  }
  return c;
}
/** Референс 21 → png 500×588 с сохранением пропорций (через System.Drawing; чужой арт остаётся в tools/out, не в игре). */
function ensureRef(root: string): PC | null {
  const png = path.join(root, "tools", "out", "bosses139", "ref-21.png");
  const jpg = path.join(root, "tools", "out", "refs", "bosses-139", "21-рыцарь-капелан-отсупник.jpg");
  if (!fs.existsSync(png) && fs.existsSync(jpg) && process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${jpg}'); $b=New-Object System.Drawing.Bitmap 500,588; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,500,588); $b.Save('${png}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  return fs.existsSync(png) ? loadPC(png) : null;
}

export function writeChapArt(root: string, outDir: string, quick = false): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => { const f = path.join(outDir, name); c.save(f); files.push(f); return c; };
  if (process.argv.includes("--unit")) { save(buildBannerUnit(), "chap-unit-banner.png"); return files; }
  const sheets = animSheets(quick ? ["idle"] : undefined, quick ? 1 : 99);
  const A: Assets = {
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
    ref: ensureRef(root),
  };
  if (process.argv.includes("--sil")) {
    const sc = new PC(N * 5 * 3 + 40 + 500, 600);
    fill(sc, 0, 0, sc.w, sc.h, [200, 190, 160, 255]);
    for (let j = 0; j < 3; j++) {
      const fr = crop(sheets.img.idle, 0, j * FH, N, FH);
      for (let y = 0; y < FH; y++) for (let x = 0; x < N; x++) if (fr.alpha(x, y)) fr.set(x, y, [20, 20, 24, 255]);
      sc.blit(scaleNN(fr, 5), j * (N * 5 + 6), 0);
    }
    if (A.ref) sc.blit(A.ref, N * 15 + 40, 0);
    save(sc, "r55n-w-sil.png");
    return files;
  }
  save(buildCompare(sheets, A), "r55n-w-compare.png");
  if (quick) return files;
  const sheet = new PC(N * CHAP_COLS, FH * 3), glow = new PC(N * CHAP_COLS, FH * 3);
  for (const [a] of ANIM_ORDER) { sheet.blit(sheets.img[a], CHAP_ANIMS[a].col * N, 0); glow.blit(sheets.emis[a], CHAP_ANIMS[a].col * N, 0); }
  save(sheet, "chap-sheet.png");
  save(glow, "chap-glow.png");
  const ban = buildBanner();
  save(ban.img, "chap-banner.png");
  save(ban.emis, "chap-banner-glow.png");
  save(buildBannerUnit(), "chap-unit-banner.png");
  const rowsN = ["вниз", "вверх", "вбок"];
  const bad: string[] = [];
  for (let r = 0; r < 3; r++) for (let cI = 0; cI < CHAP_COLS; cI++) {
    let hits = 0;
    for (let k2 = 0; k2 < FH; k2++) for (const [x, y] of [[0, k2], [N - 1, k2]]) { const q = sheet.get(cI * N + x, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    for (let k2 = 0; k2 < N; k2++) for (const y of [0, FH - 1]) { const q = sheet.get(cI * N + k2, r * FH + y)!; if (q[3] && !colEq(q, OUT)) hits++; }
    if (hits) bad.push(`лист, ${rowsN[r]}, кадр ${cI + 1}: ${hits} px не цветом контура на краю`);
  }
  console.log(`  ${ID}: ${CHAP_COLS} кадров × 3 вида, кадр ${N}×${FH}; знамя ${BANNER_COLS} кадров`);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 40).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; }
  else console.log("  проверки: край кадра чист");
  return files;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/sol_fallen_chaplain.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const files = writeChapArt(root, path.join(root, "tools", "out", "bosses139"), process.argv.includes("--quick") || process.argv.includes("--sil") || process.argv.includes("--unit"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void linear; void hex; void cross; void easeIn; void stackRows; void depthOf; void sealPinholes;
