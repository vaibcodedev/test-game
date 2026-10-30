/**
 * Задача 139, босс кольца: Кассар Безликий, Палач Пепельной пустоши (восток, слот r49s, ур. 49, группа 3–4; карточка —
 * docs/systems/bosses.md, раздел 3.3 п. 10 и «Раскладка референсов»). Образ — по референсу tools/out/refs/bosses-139/06.jpg
 * (палач в остроконечном кожаном колпаке с прорезями, широкие плечи в шипастых наплечниках, кожаная сбруя с кольцом на
 * груди, пояс из цепей, двусторонняя секира с шипастым шаром на пятке, длинный рваный подол до земли, свисающие цепи) —
 * только для сравнения: чужой арт в игру и в git не идёт.
 *
 * Метод — как у пилота-лича (tools/gen/bosses139/umb_crown_lich.ts): общий движок tools/gen/mobs/lib.ts, луч на пиксель,
 * 5 тонов на материал, тень, затенение складок, выборочный контур 1 px (selout из rig.ts). Кадр 64×64 (таблица 3.1:
 * ур. 45–59), ступни на y = 60; модель — в росте боссов стартовых земель, без масштаба. Жёсткий слой тела двигается на
 * целые пиксели (snapM). Светится (ночью не гаснет): угли в прорезях колпака, раскалённые звенья цепей в фазе ярости.
 * Цепь в руке (крутится над головой, летит к цели и тянет назад), след секиры, пыль, трещины — 2D-слои поверх тела
 * с проверкой глубины; петли бесшовные, движения с easing, 12–15 к/с.
 *
 * Эффекты мира (строка 0 — под юнитами, 1 — над): крюк цепи в метке («Цепь»), клетка из кольев и цепей вокруг героя
 * («Клетки»: подъём → удержание по кругу → разлом).
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/umb_ash_executioner.ts → tools/out/bosses139/
 *   exec-sheet.png, exec-glow.png, exec-fx-hook.png, exec-fx-cage.png, exec-compare.png («наш | референс»),
 *   exec-pilot.png (все анимации днём и ночью, рядом герой и sol_rune_golem).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  PC, PX, R, Scene, VIEWS, add, clamp, cross, crop, depthOf, easeIn, easeInOut, easeOut, fill, frameEdgeCuts, frameHoles, fromView,
  groundBg, hash01, hex, ik, lerp, lerpV, linear, loadPC, mat, mix, mul, nightRect, norm, perp, renderScene, rot, scaleBox, scaleNN,
  scr, sealPinholes, shadowBlob, snapPx, stackRows, stampRows, sub, text, thicken, toView, TAU,
  type Cam, type Mat, type RGBA, type Ramp, type Row, type V3, type View,
} from "../mobs/lib";
import { OUT, selout, outlineStats } from "../mobs/rig";

export const ID = "umb_ash_executioner";
export const FRAME = 64;
const N = FRAME;
const CAM: Cam = { N, CX: 32, GY: 60.4 };
/** Модель — в росте боссов стартовых земель, кадр 64: без масштаба. */
const K = 1;
const PXM = PX / K;
const snapM = (view: View, w: V3): V3 => mul(snapPx(view, mul(w, K)), 1 / K);
const pxM = (view: View, dx: number, dy: number): V3 => fromView(view, [dx / K, 0, -dy * PXM]);

// ---------------- палитра ----------------
/** Тёмная кожа сбруи и нагрудника: тени коричнево-красные, свет пыльный. */
const LEATHER = R("#0f0c0b", "#1d1817", "#2d2624", "#413835", "#594d48");
/** Колпак — рыжеватая выделанная кожа, светлее сбруи: голова читается. */
const HOOD = R("#15110e", "#29221d", "#3d332c", "#54473d", "#6d5e51");
/** Подол — запёкшийся тёмно-красный холст. */
const ROBE = R("#060404", "#0e0807", "#180d0b", "#241411", "#321c17");
/** Железо — чернёное с ржавым отливом. */
const IRON = R("#0d0d0f", "#1c1b1e", "#2e2c30", "#474346", "#6b6561");
const WOOD = R("#22150c", "#432a16", "#6a4321", "#92602f", "#c08a4c");
/** Лезвие — светлая сталь; кромка — самый светлый тон, пятна запёкшейся крови. */
const BLADE = R("#121518", "#262b30", "#3d444a", "#5a6268", "#e8eae2");
const BLOOD = R("#1e0606", "#3e0c0a", "#5e1510", "#7e2016", "#9a2c1e");
/** Угли: глаза в прорезях, раскалённые звенья (светится). */
const EMBER = R("#3a0e05", "#8a2a08", "#e0601a", "#ffb347", "#fff0c8");
const SKIN = R("#2a1712", "#4d2d22", "#714635", "#93604a", "#b27b60");
const DEAD = R("#121112", "#262223", "#3b3434", "#544a47", "#6e625c");
const DUST = R("#3b342c", "#665a4b", "#8f816c", "#b7a88d");
const VOID = hex("#0a0605");

const M = {
  leather: mat("кожа", LEATHER, { base: 1.6, gain: 2.3 }),
  hood: mat("колпак", HOOD, { base: 1.7, gain: 2.3 }),
  robe: mat("подол", ROBE, { base: 1.6, gain: 2.3 }),
  iron: mat("железо", IRON, { base: 1.6, gain: 2.6 }),
  wood: mat("древко", WOOD, { base: 2.0, gain: 2.0 }),
  blade: mat("сталь", BLADE, { base: 1.8, gain: 1.6, hi: 3 }),
  /** кромка лезвия: светлая полоса, тон по правилу (не по свету) */
  edge: mat("кромка", BLADE, { base: 3.6, gain: 0.6, crisp: true }),
  blood: mat("кровь", BLOOD, { base: 1.8, gain: 1.8 }),
  ember: mat("угли", EMBER, { base: 2.6, gain: 1.0, glow: true, crisp: true }),
  skin: mat("кожа рук", SKIN, { base: 1.7, gain: 2.3 }),
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
  for (const c of EMBER) s.add(c.slice(0, 3).join(","));
  return (q: RGBA) => s.has(q.slice(0, 3).join(","));
})();

// ---------------- поза ----------------
interface Pose {
  root: V3; bob: number; chest: number; headZ: number;
  pitch: number; yaw: number; roll: number; hp: number; hy: number; hr: number;
  /** кулаки [правый — хват секиры у головы, левый — у пятки или свободен]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** секира: [пятка (от покоя тела, едет с ним, пока в руках), направление пятка → голова]; rg, lg — где по древку правый и левый
   *  кулак (от пятки; lg < 0 — левая свободна, кулак в hand[1]); flat — плоскость лезвий (нормаль), held — в руках */
  axe: [V3, V3]; rg: number; lg: number; flat: V3; held: number;
  armLift: [number, number];
  /** подол: волна лохмотьев, шаг (колени толкают подол), раскачка цепей (px) */
  wave: number; waveAmp: number; kick: [number, number]; sway: number;
  /** угли в прорезях 0..1,6; ярость (раскалённые цепи) 0..1; увядание; на коленях (просадка, подол лужей) */
  glow: number; rage: number; wither: number; kneel: number;
  /** цепь в левой руке: кружит над головой (spin, фаза spinPh), брошена (out 0..1 — длина, dir — куда, в модели) */
  spin: number; spinPh: number; out: number; outDir: V3;
  ring: number; ringAt?: V3; flash: number; flashAt?: V3; dust: [number, number]; cracks: number;
  trail?: V3[];
  t: number; seed: number;
}

const HIP0 = 21;
const NECK: V3 = [0, 0.4, 38.4];
const ARM: [number, number] = [8.6, 8.8];
/** Древко: от пятки до середины головы секиры; лезвие — полукруг по обе стороны (двусторонняя секира). */
const SHAFT = 40;
/** Хвост древка за нижним хватом (до шара и шипа): древко длиннее и торчит из силуэта внизу. */
const TAIL = 7;
const BLADE_R: V3 = [6.8, 0.5, 7.6];

const axeAt = (butt: V3, head: V3): [V3, V3] => [butt, norm(sub(head, butt))];
/** Секира по точке головы и направлению от пятки к голове (голова — где задано, пятка — на SHAFT ниже по древку). */
const axeH = (head: V3, dir: V3): [V3, V3] => { const d = norm(dir); return [sub(head, mul(d, SHAFT)), d]; };
const AXE_FRONT = axeH([17, 9.5, 45], [28, -1.5, 35.5]);
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.05, yaw: 0, roll: 0, hp: 0.04, hy: 0, hr: 0,
  hand: [[0, 0, 0], [0, 0, 0]], pole: [[1, -0.2, -0.9], [-1, -0.3, -0.8]],
  axe: AXE_FRONT, rg: 25, lg: 12, flat: [0, 1, 0.1], held: 1, armLift: [0, 0],
  wave: 0, waveAmp: 0, kick: [0, 0], sway: 0,
  glow: 1, rage: 0, wither: 0, kneel: 0,
  spin: 0, spinPh: 0, out: 0, outDir: [0, 1, 0],
  ring: 0, flash: 0, dust: [0, 0], cracks: 0, t: 0, seed: 1,
};
const AXE_SIDE = axeH([10.5, 13, 44], [0, 26, 35]);
const REST_SIDE: Pose = { ...REST_FRONT, axe: AXE_SIDE, flat: [1, 0, 0.05], pole: [[1, -0.3, -0.8], [-1, -0.2, -0.8]] };
const restOf = (view: View): Pose => (view === "side" ? REST_SIDE : REST_FRONT);
const bodyShift = (view: View, p: Pose): V3 => snapM(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.kneel * 7]);

// ---------------- штампы ----------------
type Keys = Record<string, RGBA>;
/** Прорези колпака: тёмные щели, в них угли (тон по силе), над ними — шов колпака. */
const ST_EYES: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: stampRows(["..k..", "dd.dd", "32.23", "..k.."], -2, -2),
  side: stampRows([".k..", "ddd.", "232.", ".k.."], -2, -2),
};
/** Шов колпака над маской: стежки поперёк шва. */
const ST_STITCH: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: stampRows([".s.", "tst", ".s.", "tst", ".s."], -1, -4),
  side: stampRows(["s.", "ts", "s.", "ts"], 0, -3),
  up: stampRows([".s.", ".s.", ".s.", ".s."], -1, -3),
};
/** Кольцо на груди (железо): светлый блик сверху слева. */
const ST_RING: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: stampRows([".ii.", "i..o", "o..o", ".oo."], -2, -2),
  side: stampRows([".i.", "i.o", ".o."], -1, -1),
};
function stampKeys(glow: number): Keys {
  const g = clamp(glow, 0, 1.6);
  const lv = (k: number) => {
    const v = k - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.25 ? 1 : 0);
    return v < 0 ? VOID : EMBER[clamp(v, 0, 4)];
  };
  return { d: VOID, "1": lv(1), "2": lv(2), "3": lv(3), k: HOOD[0], i: IRON[4], o: IRON[1], s: HOOD[0], t: HOOD[3] };
}
const GLOW_KEYS = ["1", "2", "3"];

// ---------------- текстуры ----------------
/** Звенья цепи по углу вокруг оси (кольцо пояса) или вдоль оси (свисающая цепь): тёмная щель между звеньями. */
const linkTex = (period: number, around: boolean, rage: number) => (c: { l: V3; edge: boolean; u: number }) => {
  if (c.edge) return 0;
  const s = around ? Math.atan2(c.l[1], c.l[0]) * 7.5 : c.l[2];
  const f = ((s / period) % 1 + 1) % 1;
  if (rage > 0.3 && f > 0.25 && f < 0.6) return { mat: M.ember, d: rage > 0.7 ? 0.6 : -0.3 };
  return f < 0.18 ? -1.3 : f > 0.55 && f < 0.75 ? 0.5 : 0;
};
/** Ремни сбруи крест-накрест (в пикселях от опорной точки — рисунок едет с телом). */
const strapTex = (c: { x: number; y: number; ax: number; ay: number; edge: boolean; l: V3 }) => {
  if (c.edge || c.l[1] < 0.5) return 0;
  const dx = c.x - c.ax, dy = c.y - c.ay;
  const a = Math.abs(dx - dy * 0.9), b = Math.abs(dx + dy * 0.9);
  if (a < 1.1 || b < 1.1) return { mat: M.leather, d: -0.9 };
  if (a < 1.9 || b < 1.9) return { mat: M.leather, d: 0.5 };
  return 0;
};

// ---------------- сцена ----------------
interface Extra {
  chain: { from: V3; to: V3; hook: boolean; slack: number }[];
  loop: { c: V3; r: number; ph: number } | null;
  rings: { c: V3; r: number; k: number }[];
  flash: { at: V3; k: number } | null;
  dust: { at: V3; k: number }[];
  cracks: { at: V3; k: number; ang: number } | null;
  glints: V3[];
}

/** Палач в координатах модели. */
function build(p0: Pose, view: View): { S: Scene; X: Extra } {
  const S = new Scene();
  const X: Extra = { chain: [], loop: null, rings: [], flash: null, dust: [], cracks: null, glints: [] };
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.3, hy: p0.hy - 0.2 } : p0;
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

  // ---------- подол: до земли, на коленях — лужей; рваные клинья; колени толкают подол при шаге ----------
  {
    const g = S.group(1.6);
    const folds = (c: { l: V3; edge: boolean }) => {
      if (c.edge) return 0;
      const f = Math.sin(Math.atan2(c.l[1], c.l[0]) * 8 + 0.4);
      return f > 0.8 ? -0.9 : f < -0.9 ? 0.4 : 0;
    };
    const top: V3 = [pel[0], pel[1], Math.max(1, pel[2] - 1.5)];
    const rb = 10.6 + 1.6 * kn;
    S.cone(g, wm(M.robe, W), top, 7.0, [pel[0], pel[1], 0], rb, { tex: folds, ref: [1, 0, 0], big: true });
    if (kn < 0.5) for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
      const k = p.kick[i];
      S.ball(g, wm(M.robe, W), [pel[0] + s * 4, pel[1] + 4 + 2.6 * k, 8.5 + 1.2 * k], 3.8 + 0.3 * k, { tex: folds, ref: [1, 0, 0] });
    }
    // рваные клинья у земли: по бокам и спереди, качаются по пикселю
    const lift = (i: number) => Math.round(p.waveAmp * (0.5 + 0.5 * Math.sin(TAU * (p.wave + i * 0.21)))) * PXM;
    // рваные полосы поверх подола: от бедра до земли и ниже, с просветами; у низа — запёкшаяся кровь
    for (let i = 0; i < 9; i++) {
      const th = (i / 9) * TAU + 0.5 + 0.2 * hash01(i, 8, 13);
      const cx = Math.cos(th), cy = Math.sin(th);
      const z0 = 14 + 4 * hash01(i, 1, 13), r0 = lerp(rb, 7.0, z0 / Math.max(1, top[2])) + 0.5;
      const a: V3 = [pel[0] + cx * r0, pel[1] + cy * r0, z0];
      const b: V3 = [pel[0] + cx * (rb + 1.2 + 1.8 * hash01(i, 4, 13)), pel[1] + cy * (rb + 1.2) * 0.92, -0.5 + lift(i + 3)];
      const blood = (q: { u: number; l: V3 }) => (q.u > 0.7 && hash01(i, Math.round(q.l[2] * 1.5), 19) < 0.3 ? { mat: M.blood, d: -0.6 } : q.u > 0.55 ? -0.3 : 0.2);
      S.cone(g, wm(M.robe, W), a, 1.1, b, 0.9, { ref: [1, 0, 0], tex: blood as never, part: S.newPart() });
    }
    // лохмотья по всему подолу: разной длины, острые, наружу и вниз
    for (let i = 0; i < 14; i++) {
      const th = (i / 14) * TAU + 0.2;
      const l = 1.6 + 2.6 * hash01(i, 5, 31);
      const cx = Math.cos(th), cy = Math.sin(th);
      const a: V3 = [pel[0] + cx * (rb - 1.6), pel[1] + cy * (rb - 1.6), 4.2 + 1.5 * hash01(i, 2, 31)];
      const b: V3 = [pel[0] + cx * (rb + l), pel[1] + cy * (rb + l) * 0.9, 0.2 + lift(i)];
      S.cone(g, wm(M.robe, W), a, 1.5, b, 0.3, { ref: [1, 0, 0], tone: hash01(i, 3, 31) < 0.4 ? -0.4 : 0 });
    }
  }
  // ---------- кожаный фартук спереди: от пояса до колен, рваный низ ----------
  {
    const g = S.group(0.3);
    const upV = norm(PR([0, -0.3, 1])), fw = norm(PR([0, 1, 0.3])), sd = PR([1, 0, 0]);
    const c = add(PV([0, 7.2, 13.5 + kn * 2]), [0, 0, 0]);
    S.box(g, wm(M.leather, W), c, [2.6, 0.5, 6.8 - kn * 2], [sd, fw, upV], 0.4, { tone: -0.2 });
    S.cone(g, wm(M.leather, W), add(c, mul(upV, -6.2 + kn * 2)), 1.4, add(add(c, mul(upV, -9.5 + kn * 2)), mul(sd, 1.2)), 0.25, { tone: -0.2 });
  }

  // ---------- корпус: живот, грудь в кожаной сбруе, кольцо на груди, пояс из цепей ----------
  {
    const g = S.group(1.8);
    S.cone(g, wm(M.leather, W), PV([0, 0.2, 20.5]), 6.8, T([0, 0.6, 27.5]), 7.2, { tone: -0.1 });
    S.ell(g, wm(M.leather, W), T([0, 0.7, 32.0]), [8.0, 5.6, 5.8], axes(TV), { tex: strapTex as never, anc: T([0, 5.5, 32.5]), big: true });
    S.stamps.push({ at: T([0, 6.1, 32.4]), n: TV([0, 1, 0]), px: ST_RING, colors: keys, depthTol: 2.5 });
  }
  {
    // железные пластины на груди поверх кожи: два щитка с шипами у ворота
    const g = S.group(0.4);
    for (const s of [1, -1]) {
      S.ell(g, wm(M.iron, W), T([s * 4.0, 4.4, 34.0]), [3.4, 1.6, 2.6], axes(TV, s * 0.25, 0.2), { part: S.newPart(), tone: -0.2 });
      const b = T([s * 5.2, 4.6, 36.0]);
      S.cone(g, wm(M.iron, W), b, 0.6, add(b, TV([s * 1.2, 1.4, 2.4])), 0.1, { part: S.newPart() });
    }
  }
  {
    const g = S.group(0.3);
    for (const [k, z] of [[0, 21.4], [1, 23.0], [2, 24.6]] as [number, number][]) {
      S.ell(g, wm(M.iron, W), PV([0, 0.2, z]), [7.6 - k * 0.2, 6.6 - k * 0.2, 0.95], axes(PR, 0, 0, k * 0.4), { tex: linkTex(1, true, p.rage) as never, part: S.newPart() });
    }
  }
  // свисающие цепи: две слева, одна справа; качаются на пиксель
  {
    const g = S.group(0);
    const sw = p.sway * PXM;
    void g;
    const hang: [V3, V3][] = [[[-6.6, 4.0, 21], [-7.8 + sw, 6.2, 7.5]], [[-4.6, 6.0, 21], [-5.2 + sw, 8.4, 10.5]], [[6.8, 3.6, 21], [8.0 + sw, 5.8, 9]]];
    if (kn < 0.6) for (const [a, b] of hang) X.chain.push({ from: PV(a), to: add(PV(a), sub(b, a)), hook: false, slack: 0.3 });
    // цепь с левого наплечника к локтю
    X.chain.push({ from: T([-12.6, 2.4, 34.5]), to: T([-13.5 + sw, 3.6, 25.5]), hook: false, slack: 0.4 });
  }

  // ---------- секира: древко, шар с шипами на пятке, двусторонняя голова, шип сверху ----------
  const held = p.held >= 0.5;
  const ad = norm(p.axe[1]);
  const butt: V3 = add(p.axe[0], held ? shift : [0, 0, 0]);
  const head = add(butt, mul(ad, SHAFT));
  const flat = norm(perp(ad, p.flat));
  const e = norm(cross(ad, flat));
  {
    const g = S.group(0.3);
    // древко толще и светлее брони, ребро к свету — светлой полосой (читается на тёмном торсе)
    const shine = (q: { l: V3; edge: boolean }) => (q.edge ? 0 : q.l[0] < -0.35 ? 0.9 : q.l[0] > 0.5 ? -0.7 : 0);
    // хвост с шипом не выходит за кадр: в замахах укорачивается
    const off = (q: V3) => { const [x, y] = scr(CAM, toView(view, mul(q, K))); return x < 3 || x > N - 4 || y < 3; };
    let tl = TAIL;
    while (tl > 0 && off(sub(butt, mul(ad, tl + 6)))) tl -= 1;
    const tail = sub(butt, mul(ad, tl));
    S.cone(g, wm(M.wood, W), tail, 1.05, head, 1.1, { tex: shine as never, ref: norm(perp(ad, [-1, 0.2, 0.6])), big: true });
    for (const u of [0.25, 0.5]) S.cone(g, wm(M.iron, W), add(butt, mul(ad, SHAFT * u - 0.8)), 1.2, add(butt, mul(ad, SHAFT * u + 0.8)), 1.2, { part: S.newPart() });
    const pb = S.newPart();
    S.ball(g, wm(M.iron, W), tail, 1.35, { part: pb });
    S.cone(g, wm(M.iron, W), tail, 0.95, sub(tail, mul(ad, 5.0)), 0.1, { part: pb });
    S.cone(g, wm(M.iron, W), sub(head, mul(ad, 3.2)), 1.25, add(head, mul(ad, 2.6)), 1.15, { part: S.newPart() });
    // лезвия-полумесяцы по обе стороны: веер узких пластин от втулки, концы длиннее (рога вверх и вниз), кромка — светлая
    // полоса, у кромки — запёкшаяся кровь; сталь тёмная
    const gb = S.group(0.7);
    for (const s of [1, -1]) {
      const pa = S.newPart();
      const c = sub(head, mul(ad, 1.0));
      const NS = 9;
      for (let k = 0; k < NS; k++) {
        const th = lerp(-1.4, 1.4, k / (NS - 1));
        const dir = norm(add(mul(e, s * Math.cos(th)), mul(ad, Math.sin(th))));
        // в замахах над головой лезвие не выходит за кадр: пластина короче
        let L = 4.6 + 4.0 * Math.pow(Math.abs(th) / 1.4, 2.2);
        while (L > 3 && off(add(c, mul(dir, 1.3 + L + 1.6)))) L -= 0.5;
        const side = norm(cross(dir, flat));
        const tex = (q: { l: V3 }) => {
          if (q.l[0] > L / 2 - 0.9) return { mat: M.edge, d: 2.3 };
          if (q.l[0] > L / 2 - 3.2 && q.l[0] < L / 2 - 0.9 && hash01(k * 7 + (s > 0 ? 1 : 0), Math.round(q.l[0] * 0.8), 77) < 0.3) return { mat: M.blood, d: 0.3 };
          return q.l[0] < -L / 2 + 1.6 ? -0.6 : 0;
        };
        S.box(gb, wm(M.blade, W), add(c, mul(dir, 1.3 + L / 2)), [L / 2, 0.5, 1.15 + 0.3 * (1 - Math.abs(th) / 1.4)], [dir, flat, side], 0.2, { part: pa, tex: tex as never, big: true });
        // рога загнуты назад, к древку: крючок на концах полумесяца
        if (k === 0 || k === NS - 1) {
          const tip = add(c, mul(dir, 1.3 + L - 0.4));
          const back = norm(add(mul(e, -s * 0.8), mul(ad, Math.sign(th) * 0.6)));
          S.box(gb, wm(M.blade, W), add(tip, mul(back, 1.2)), [1.3, 0.38, 0.55], [back, flat, norm(cross(back, flat))], 0.15, { part: pa, tex: (() => ({ mat: M.edge, d: 2.3 })) as never });
        }
      }
    }
    S.cone(g, wm(M.iron, W), add(head, mul(ad, 2.4)), 0.9, add(head, mul(ad, 8.0)), 0.1, { part: S.newPart() });
    if (p.flash > 0.5 || p.trail) X.glints.push(add(head, mul(e, 8.0)));
  }

  // ---------- руки: кожа плеча, железный наруч с шипами, перчатки; кулаки — на древке ----------
  for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
    const g = S.group(1.0);
    const lift = pxM(view, 0, -p.armLift[i]);
    const sh = add(T([s * 10.4, 0.2, 34.6]), lift);
    let fist: V3;
    if (held && i === 0) fist = add(butt, mul(ad, p.rg));
    else if (held && i === 1 && p.lg >= 0) fist = add(butt, mul(ad, p.lg));
    else fist = add(add(p.hand[i], shift), lift);
    const el = ik(sh, fist, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, wm(M.leather, W), sh, 3.0, el, 2.5, { tone: 0.2 });
    const fd = norm(sub(fist, el));
    const pv = S.newPart();
    S.cone(g, wm(M.iron, W), add(el, mul(fd, 0.6)), 2.4, sub(fist, mul(fd, 1.6)), 2.8, { part: pv });
    for (const k of [0, 1]) {
      const b = add(el, mul(fd, 2.4 + k * 3));
      S.cone(g, wm(M.iron, W), b, 0.6, add(b, mul(perp(fd, p.pole[i]), 2.6)), 0.1, { part: pv });
    }
    const e0 = perp(fd, [0, 0, 1]);
    S.ell(g, wm(M.leather, W), fist, [2.3, 2.1, 2.5], [e0, cross(fd, e0), fd], { part: S.newPart(), tone: -0.2 });
    if (i === 1 && p.spin > 0.02) X.loop = { c: add(fist, [0, 0, 5]), r: 6 + 3 * p.spin, ph: p.spinPh };
    if (i === 1 && p.out > 0.02) {
      const L = 30 * p.out;
      X.chain.push({ from: fist, to: add(fist, mul(norm(p.outDir), L)), hook: true, slack: 1.5 * (1 - p.out) });
    } else if (i === 1 && !held && p.spin <= 0.02) X.chain.push({ from: fist, to: add(fist, [0, 1.5, -9]), hook: true, slack: 0.4 });
  }

  // ---------- наплечники: пластина, лама, четыре шипа ----------
  for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
    const g = S.group(0.7);
    S.ell(g, wm(M.iron, W), T([s * 11.8, -0.3, 37.0]), [6.4, 5.6, 3.7], axes(TV, s * 0.42));
    S.ell(g, wm(M.iron, W), T([s * 12.7, -0.2, 34.0]), [3.8, 4.4, 1.8], axes(TV, s * 0.7), { part: S.newPart() });
    const ps = S.newPart();
    [[-1.2, 6.4, 0.5], [1.0, 8.2, 0.75], [3.2, 7.2, 0.95], [5.0, 5.4, 1.15]].forEach(([dx, l, out], k) => {
      const b = T([s * (10.2 + dx), -0.8 + k * 0.4, 39.4 - Math.max(0, dx) * 0.6]);
      const m = add(b, TV([s * out * l * 0.4, -0.3, l * 0.5]));
      const t = add(m, TV([s * out * l * 0.55, -0.3, l * 0.38]));
      S.cone(g, wm(M.iron, W), b, 0.85, m, 0.48, { part: ps });
      S.cone(g, wm(M.iron, W), m, 0.48, t, 0.1, { part: ps });
    });
    void i;
  }

  // ---------- голова: остроконечный колпак с прорезями, гвозди, накидка колпака на плечи ----------
  {
    const g = S.group(1.2);
    S.cone(g, wm(M.hood, W), T([0, -0.4, 35.6], true), 7.2, H([0, 0.1, 39.6]), 5.0, { big: true });
    S.ell(g, wm(M.hood, W), H([0, 0.6, 42.6]), [4.7, 4.9, 4.4], axes(HV), { big: true });
    S.cone(g, wm(M.hood, W), H([0, 0.2, 44]), 4.4, H([0, -1.4, 48.6]), 1.5, { big: true });
    S.stamps.push({ at: H([0, 4.7, 46.2]), n: HV([0, 1, 0.3]), px: ST_STITCH, colors: keys, depthTol: 2.4, minFacing: 0.2 });
    // маска: тёмная кожа поверх лица, на ней прорези (штамп)
    S.box(g, wm(M.leather, W), H([0, 4.2, 42.8]), [2.9, 0.7, 3.0], axes(HV), 0.5, { part: S.newPart(), tone: -0.3 });
    const pn = S.newPart();
    for (const [a, z, l] of [[0.5, 46, 2.6], [-0.6, 44.5, 2.2], [2.4, 47, 2.4]] as [number, number, number][]) {
      const b = H([Math.sin(a) * 3.6, Math.cos(a) * 3.8, z]), d = HV([Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0.6]);
      S.cone(g, wm(M.iron, W), b, 0.4, add(b, mul(norm(d), l)), 0.15, { part: pn });
    }
    S.stamps.push({ at: H([0, 5.0, 43.8]), n: HV([0, 1, 0]), px: ST_EYES, colors: keys, glow: GLOW_KEYS, halo: EMBER[2], depthTol: 2.4, minFacing: 0.2 });
  }

  // ---------- частицы и эффекты ----------
  if (p.ring > 0.02) X.rings.push({ c: p.ringAt ?? [head[0], head[1], 0], r: 3 + 20 * p.ring, k: 1 - p.ring });
  if (p.flash > 0.02) X.flash = { at: p.flashAt ?? add(head, mul(e, 6)), k: p.flash };
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) X.dust.push({ at: i === 0 && p.flashAt ? [p.flashAt[0], p.flashAt[1], 0] : [pel[0] + (i ? -5 : 5), pel[1] + 7, 0], k: p.dust[i] });
  if (p.cracks > 0.02 && p.flashAt) X.cracks = { at: [p.flashAt[0], p.flashAt[1], 0], k: p.cracks, ang: 0 };

  scaleScene(S, K);
  const sk = (v: V3) => mul(v, K);
  X.chain.forEach((c) => { c.from = sk(c.from); c.to = sk(c.to); });
  if (X.loop) X.loop = { ...X.loop, c: sk(X.loop.c), r: X.loop.r * K };
  X.rings.forEach((r) => { r.c = sk(r.c); r.r *= K; });
  if (X.flash) X.flash.at = sk(X.flash.at);
  X.dust.forEach((d) => (d.at = sk(d.at)));
  if (X.cracks) X.cracks.at = sk(X.cracks.at);
  X.glints = X.glints.map(sk);
  return { S, X };
}
function scaleScene(S: Scene, s: number) {
  if (s === 1) return;
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
  if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return;
  const i = y * N + x;
  if (c.prim[i] >= 0 && c.t[i] < dz - 1) return;
  c.img.set(x, y, col);
  if (glow) c.emis.set(x, y, col);
};
/** Цепь: звенья через пиксель (светлое — тёмное), провисает посередине; крюк на конце; раскалена в ярости. */
function drawChain(c: Ctx, ch: { from: V3; to: V3; hook: boolean; slack: number }, rage: number) {
  const a = toView(c.view, ch.from), b = toView(c.view, ch.to);
  const [ax, ay] = scr(CAM, a), [bx, by] = scr(CAM, b);
  const L = Math.max(1, Math.hypot(bx - ax, by - ay));
  const n = Math.ceil(L * 1.2);
  const hot = rage > 0.5;
  for (let s = 0; s <= n; s++) {
    const u = s / n;
    const x = lerp(ax, bx, u), y = lerp(ay, by, u) + Math.sin(Math.PI * u) * ch.slack * 3;
    const dz = lerp(depthOf(a), depthOf(b), u);
    // звенья поочерёдно «плашмя» (2 px) и «ребром» (1 px), под цепью — тёмная кайма
    const flatL = Math.floor(s / 2) % 2 === 0;
    put(c, x, y - 1, hot ? EMBER[3] : flatL ? IRON[4] : IRON[3], dz, hot);
    put(c, x, y, hot ? EMBER[2] : flatL ? IRON[2] : IRON[4], dz, hot);
    put(c, x, y + 1, hot ? EMBER[0] : OUT, dz, hot);
  }
  if (ch.hook) {
    const dx = (bx - ax) / L, dy = (by - ay) / L;
    // крюк: остриё загнуто назад
    const pts: [number, number, number][] = [[0, 0, 4], [1, 0, 4], [2, 0, 3], [2, 1, 3], [2, 2, 2], [1, 3, 2], [0, 2, 3]];
    for (const [u, v, tone] of pts) {
      const x = bx + dx * u - dy * v, y = by + dy * u + dx * v;
      put(c, x, y, IRON[tone], depthOf(b));
    }
  }
}
/** Петля цепи над головой: звенья по кругу (крутится по фазе), за головой — скрыта телом. */
function drawLoop(c: Ctx, lp: { c: V3; r: number; ph: number }, rage: number) {
  const hot = rage > 0.5;
  const n = Math.ceil(lp.r * 7);
  for (let s = 0; s < n; s++) {
    const a = (s / n) * TAU + lp.ph * TAU;
    const w: V3 = [lp.c[0] + Math.cos(a) * lp.r, lp.c[1] + Math.sin(a) * lp.r * 0.9, lp.c[2] + Math.sin(a * 2) * 0.6];
    const v = toView(c.view, w);
    const [x, y] = scr(CAM, v);
    const lit = s % 3 !== 0;
    put(c, x, y - 1, hot ? EMBER[lit ? 3 : 1] : IRON[lit ? 4 : 2], depthOf(v), hot);
    put(c, x, y, hot ? EMBER[1] : IRON[lit ? 2 : 3], depthOf(v), hot);
    put(c, x, y + 1, hot ? EMBER[0] : OUT, depthOf(v), hot);
  }
  // размытые «следы» по ходу вращения — дуга светлее
  for (let s = 0; s < 6; s++) {
    const a = lp.ph * TAU + s * 0.12;
    const v = toView(c.view, [lp.c[0] + Math.cos(a) * (lp.r + 0.8), lp.c[1] + Math.sin(a) * (lp.r + 0.8) * 0.9, lp.c[2]]);
    const [x, y] = scr(CAM, v);
    put(c, x, y, BLADE[s < 3 ? 4 : 3], depthOf(v));
  }
  // крюк на конце петли
  const a = lp.ph * TAU;
  const v = toView(c.view, [lp.c[0] + Math.cos(a) * lp.r, lp.c[1] + Math.sin(a) * lp.r * 0.9, lp.c[2]]);
  const [x, y] = scr(CAM, v);
  for (const [dx, dy, t] of [[0, 0, 4], [1, 0, 3], [1, 1, 2], [0, 1, 1]] as [number, number, number][]) put(c, x + dx, y + dy, IRON[t], depthOf(v) - 1);
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
    if (x < 1 || y < 2 || x >= N - 1 || y >= N - 1) continue;
    const i = y * N + x;
    if (!back && c.prim[i] >= 0 && c.t[i] < depthOf(pv) - 0.5) continue;
    c.img.set(x, y - 1, DUST[r.k > 0.55 ? 3 : 2]);
    c.img.set(x, y, DUST[r.k > 0.3 ? 1 : 0]);
  }
}
function drawFlash(c: Ctx, f: { at: V3; k: number }) {
  const v = toView(c.view, f.at);
  const [sx, sy] = scr(CAM, v);
  const L = Math.round(2 + 3 * f.k);
  const x = clamp(Math.floor(sx), L + 2, N - 3 - L), y = clamp(Math.floor(sy), L + 2, N - 4);
  const dz = depthOf(v);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 4 : r <= L - 1 ? 3 : 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) put(c, x + dx * r, y + dy * Math.min(r, 2), EMBER[tone], dz, true);
  }
  if (f.k > 0.5) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(c, x + dx * 2, y + dy, EMBER[3], dz, true);
  put(c, x, y, EMBER[4], dz, true);
}
/** След лезвия: широкий серп в 3 тона стали с тёмной кромкой изнутри. */
function drawTrail(c: Ctx, pts: V3[]) {
  const vp = pts.map((q) => toView(c.view, q));
  const sp = vp.map((q) => scr(CAM, q));
  const total = sp.length - 1;
  for (let k = 0; k < total; k++) {
    const [x0, y0] = sp[k], [x1, y1] = sp[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= steps; s++) {
      const u = (k + s / steps) / total;
      const x = lerp(x0, x1, s / steps), y = lerp(y0, y1, s / steps);
      const w = 0.3 + 1.0 * Math.sin(Math.PI * Math.min(1, u * 0.7 + 0.15));
      const dz = lerp(depthOf(vp[k]), depthOf(vp[k + 1]), s / steps);
      for (let dy = -w; dy <= w + 0.01; dy += 0.5) for (let dx = -w; dx <= w + 0.01; dx += 0.5) {
        if (dx * dx + dy * dy > w * w) continue;
        const e = Math.hypot(dx, dy) / Math.max(0.5, w);
        put(c, x + dx, y + dy, u < 0.3 ? BLADE[3] : e < 0.55 ? BLADE[4] : mix(BLADE[4], EMBER[3], 0.25), dz);
      }
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
      if (dx * dx + dy * dy > 1 || x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      c.img.set(x, y, DUST[dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2]);
    }
  }
}
/** Трещины от удара о землю: лучи из точки, в щелях — угли пустоши. */
function drawCracks(c: Ctx, cr: { at: V3; k: number }) {
  const [cx, cy] = scr(CAM, toView(c.view, cr.at));
  for (let j = 0; j < 5; j++) {
    let a = (j / 5) * TAU + 0.4, x = cx, y = cy;
    const len = (5 + 4 * hash01(j, 3, 5)) * cr.k;
    for (let s = 0; s < len; s++) {
      if (s % 3 === 2) a += (hash01(j, s, 9) - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a) * 0.55;
      if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) break;
      const i = Math.floor(y) * N + Math.floor(x);
      if (c.prim[i] >= 0) continue;
      c.img.set(x, y, cr.k > 0.6 && s < len * 0.5 ? EMBER[2] : DUST[0]);
      if (cr.k > 0.6 && s < len * 0.5) c.emis.set(x, y, EMBER[2]);
      c.img.set(x, y + 1, DUST[3]);
    }
  }
}
function drawGlint(c: Ctx, at: V3) {
  const v = toView(c.view, at);
  const [x, y] = scr(CAM, v);
  const dz = depthOf(v);
  for (let r = 1; r <= 2; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(c, x + dx * r, y + dy * r, BLADE[r === 1 ? 4 : 3], dz);
}

/** Кадр палача: { img, emis } 64×64. */
export function renderExec(view: View, pose: Pose): { img: PC; emis: PC } {
  const { S, X } = build(pose, view);
  const R0 = renderScene(CAM, S, view, OUT);
  const img = new PC(N, N);
  const emis = R0.emis;
  const c: Ctx = { img, emis, t: R0.gb.t, prim: R0.gb.prim, view };
  if (X.cracks) drawCracks(c, X.cracks);
  for (const r of X.rings) drawRing(c, r, true);
  img.blit(R0.body, 0, 0);
  for (const r of X.rings) drawRing(c, r, false);
  if (pose.trail) drawTrail(c, pose.trail.map((q) => mul(q, K)));
  for (const ch of X.chain) drawChain(c, ch, pose.rage);
  if (X.loop) drawLoop(c, X.loop, pose.rage);
  for (const g of X.glints) drawGlint(c, g);
  if (X.flash) drawFlash(c, X.flash);
  for (const d of X.dust) drawDust(c, d);
  thicken(img, OUT, 3, [...EMBER, ...IRON, ...BLADE, ...DUST]);
  sealPinholes(img, OUT, true, 8);
  selout(img);
  const isOut = (q: RGBA | null) => !!q && q[3] > 120 && q[0] === OUT[0] && q[1] === OUT[1] && q[2] === OUT[2];
  const kill: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!isOut(img.get(x, y))) continue;
    let body = false;
    for (let dy = -1; dy <= 1 && !body; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = img.get(x + dx, y + dy);
      if (q && q[3] > 120 && !isOut(q)) { body = true; break; }
    }
    if (!body) kill.push([x, y]);
  }
  for (const [x, y] of kill) { img.clear(x, y); emis.clear(x, y); }
  for (let x = 0; x < N; x++) {
    if (!img.alpha(x, N - 1)) continue;
    const q = img.get(x, N - 2)!;
    if (q[3] > 120 && !isOut(q)) img.set(x, N - 1, OUT); else img.clear(x, N - 1);
    emis.clear(x, N - 1);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const q = img.get(x, y)!;
    if (q[3] && isEmisCol(q) && !emis.alpha(x, y)) emis.set(x, y, q);
    if (!q[3] || !isEmisCol(q)) emis.clear(x, y);
  }
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
/** Кромка лезвия в мире (модель): для следа и вспышки. */
function edgeW(p: Pose, view: View): V3 {
  const ad = norm(p.axe[1]);
  const sh = p.held >= 0.5 ? bodyShift(view, p) : [0, 0, 0] as V3;
  const head = add(add(p.axe[0], sh), mul(ad, SHAFT));
  const e = norm(cross(ad, norm(perp(ad, p.flat))));
  return add(head, mul(e, 6.6));
}
const trailOf = (base: Pose, keys: Key[], view: View, f0: number, f1: number, n = 7): V3[] =>
  Array.from({ length: n }, (_, k) => edgeW(poseAt(base, keys, lerp(f0, f1, k / (n - 1))), view));
/** Секира по точкам пятки и головы (модель). */
const axeBH = (butt: V3, head: V3): [V3, V3] => axeAt(butt, head);
const TREMBLE = [0, 1, 0, -1];

/** Покой: тяжёлое дыхание по пикселю (грудь, плечи, колпак), подол и цепи покачиваются, угли в прорезях тлеют. */
function idlePoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const sway = [0, 0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    return { ...R0, t, seed: 100 + i, chest: chest[i], headZ: head[i] - chest[i], sway: sway[i], wave: t, waveAmp: 1, glow: 1 + 0.25 * Math.sin(t * TAU) };
  });
}
/** Ходьба: грузный шаг под подолом, проседание после шага, секира качается с телом, цепи — вразнобой. */
function walkPoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const bob = [0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0];
  const swayX = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0];
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    return {
      ...R0, t: u, seed: 150 + i,
      root: [side ? 0 : swayX[i], 0, 0] as V3, bob: bob[i] * PXM,
      kick: [Math.max(0, Math.sin(TAU * u)), Math.max(0, Math.sin(TAU * u + Math.PI))] as [number, number],
      sway: [0, 1, 1, 0, -1, -1][i % 6], wave: u * 2, waveAmp: 1.4,
      dust: [i === 1 ? 0.8 : i === 7 ? 0.8 : 0, 0] as [number, number],
    };
  });
}
/** Атака: замах за правое плечо и удар наискось вниз перед собой (кадр 7), след лезвия, вспышка. */
function attackPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = side
    ? { yaw: 0.15, pitch: -0.08, hp: -0.1, axe: axeBH([8, 8, 24], [8, -10, 46]), rg: 28, lg: 15, glow: 1.3 }
    : { yaw: -0.3, pitch: -0.06, hp: -0.08, axe: axeBH([-4, 10, 26], [17, -9, 45]), rg: 28, lg: 15, glow: 1.3 };
  const hit: Partial<Pose> = side
    ? { yaw: -0.05, pitch: 0.24, hp: 0.1, bob: -2 * PXM, axe: axeBH([8, -4, 34], [8, 17, 10]), rg: 24, lg: 12, glow: 1.4, flash: 1 }
    : { yaw: 0.22, pitch: 0.22, hp: 0.08, bob: -2 * PXM, axe: axeBH([12, -2, 33], [-12, 16, 12]), rg: 24, lg: 12, glow: 1.4, flash: 1 };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1.5, p: { axe: side ? axeBH([8, 14, 10], [8, 0, 46]) : axeBH([-8, 12, 12], [10, 0, 44]) }, ease: easeInOut },
    { f: 3, p: wind, ease: easeInOut }, { f: 4, p: { ...wind, armLift: [1, 1] }, ease: linear },
    { f: 5, p: { ...hit, flash: 0 }, ease: easeIn }, { f: 6, p: hit, ease: easeOut }, { f: 7, p: { ...hit, flash: 0, bob: -1 * PXM }, ease: easeOut },
    // возврат: секира поднимается у бока (не проходит горизонтально вперёд — не за кадр)
    { f: 8, p: { axe: side ? axeBH([8, -3, 10], [8, 9, 47]) : axeBH([-8, 8, 10], [8, 6, 46]) }, ease: easeInOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 10, 400);
  poses[5].trail = trailOf(R0, keys, view, 4, 5);
  poses[6].trail = trailOf(R0, keys, view, 4.2, 6);
  poses[7].trail = trailOf(R0, keys, view, 5.4, 6.3, 4);
  poses[6].flashAt = edgeW(poses[6], view);
  poses[6].dust = [1, 0];
  return poses;
}
/** «Казнь»: секира поднята над головой обеими руками; удержание — дрожь и блик; удар прямо вперёд в землю (кадр 4): трещины, пыль. */
function execKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = side
    ? { pitch: -0.14, hp: -0.18, bob: 1 * PXM, axe: axeBH([7, 18, 31], [7.3, -18.8, 46.6]), rg: 13, lg: 6, glow: 1.4, pole: [[1, 0.2, -0.6], [-1, 0.2, -0.6]] }
    : { pitch: -0.12, hp: -0.18, bob: 1 * PXM, axe: axeBH([1, 18, 31], [2.2, -18.8, 46.6]), rg: 13, lg: 6, flat: [1, 0, 0], glow: 1.4, pole: [[1, 0.3, -0.5], [-1, 0.3, -0.5]] };
  const hit: Partial<Pose> = side
    ? { pitch: 0.32, hp: 0.14, bob: -3 * PXM, axe: axeBH([7, -4, 30], [7, 18, 3]), rg: 15, lg: 8, glow: 1.6, flash: 1, dust: [1, 0], cracks: 1 }
    : { pitch: 0.3, hp: 0.12, bob: -3 * PXM, axe: axeBH([1, -4, 31], [2.5, 20, 3.5]), rg: 15, lg: 8, flat: [1, 0, 0], glow: 1.6, flash: 1, dust: [1, 0], cracks: 1 };
  const keys: Key[] = [
    // через верх: секира проходит над головой наклонно вперёд (не отвесно — в кадре)
    { f: 0, p: wind }, { f: 1, p: { ...wind, axe: side ? axeBH([7, -4, 11], [7, 10, 41]) : axeBH([1, -4, 11], [2, 10, 41]), rg: 14, lg: 7 }, ease: easeIn },
    { f: 2, p: { ...hit, flash: 0, dust: [0, 0], cracks: 0 }, ease: linear }, { f: 3, p: hit, ease: easeOut },
    { f: 4, p: { ...hit, flash: 0, dust: [0.6, 0], cracks: 1 }, ease: linear }, { f: 6, p: { ...hit, flash: 0, dust: [0.2, 0], cracks: 0.8, bob: -2 * PXM }, ease: linear },
    { f: 7.5, p: { axe: side ? axeBH([7, -6, 8], [7, 4, 46]) : axeBH([-8, 8, 9], [6, 5, 45]), cracks: 0.5 }, ease: easeInOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function execPoses(view: View): Pose[] {
  const { R0, keys } = execKeys(view);
  const poses = keyed(R0, keys, 10, 540);
  poses[2].trail = trailOf(R0, keys, view, 0.4, 2);
  poses[3].trail = trailOf(R0, keys, view, 1.2, 3);
  const at = edgeW(poses[3], view);
  for (let i = 3; i < 8; i++) poses[i].flashAt = [at[0], at[1], 1];
  return poses;
}
/** «Цепь»: левая рука отпускает древко и раскручивает цепь над головой; бросок (кадр 4) — цепь летит к цели; рывок назад. */
function chainKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const dir: V3 = side ? [0, 1, 0.12] : [-0.35, 1, 0.12];
  const wind: Partial<Pose> = { lg: -1, hand: [[0, 0, 0], side ? [-7, 3, 44] : [-11, 2, 44]], pole: [R0.pole[0], [-1, -0.3, -0.2]], spin: 1, hp: -0.12, glow: 1.3 };
  const thr: Partial<Pose> = { ...wind, spin: 0, out: 1, outDir: dir, hand: [[0, 0, 0], side ? [-6, 12, 32] : [-9, 10, 32]], pitch: 0.16, hp: 0.06, bob: -1 * PXM };
  const yank: Partial<Pose> = { ...thr, out: 0.35, hand: [[0, 0, 0], side ? [-6, -2, 30] : [-11, -1, 30]], pitch: -0.06, yaw: side ? 0.1 : 0.15 };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 2, p: { ...thr, out: 0.25 }, ease: easeIn }, { f: 3, p: thr, ease: easeOut }, { f: 4, p: thr, ease: linear },
    { f: 6, p: yank, ease: easeIn }, { f: 7, p: { ...yank, out: 0.05 }, ease: easeOut },
    { f: 9, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function chainThrowPoses(view: View): Pose[] {
  const { R0, keys } = chainKeys(view);
  return keyed(R0, keys, 10, 740).map((p, i) => ({ ...p, spinPh: i * 0.25, spin: i === 0 ? 1 : i === 1 ? 0.5 : 0 }));
}
/** «Клетки» (фаза 2): секира вскинута, цепи раскаляются; удар пяткой оземь (кадр 3) — волна по земле. */
function cageKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = side
    ? { pitch: -0.1, hp: -0.2, bob: 1 * PXM, axe: axeBH([8, 7, 9], [8, 16, 47]), rg: 26, lg: 17, rage: 1, glow: 1.5 }
    : { pitch: -0.1, hp: -0.2, bob: 1 * PXM, axe: axeBH([4, 7, 9], [13, 7, 47]), rg: 26, lg: 17, flat: [0, 1, 0], rage: 1, glow: 1.5 };
  const hit: Partial<Pose> = { ...wind, pitch: 0.16, hp: 0.1, bob: -2 * PXM, axe: side ? axeBH([8, 9, -2], [8, 13, 37]) : axeBH([4, 8, -2], [9, 7, 37]), ring: 0.08, ringAt: undefined, dust: [1, 1], flash: 1 };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: 2 * PXM }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, ring: 0.4, dust: [0.6, 0.6] }, ease: linear }, { f: 4, p: { ...hit, flash: 0, ring: 0.75, dust: [0.3, 0.3] }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 0, dust: [0, 0], rage: 0.6 }, ease: linear }, { f: 7, p: { rage: 0.3 }, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function cagePoses(view: View): Pose[] {
  const { R0, keys } = cageKeys(view);
  const poses = keyed(R0, keys, 8, 940);
  for (const p of poses) { p.ringAt = sub(p.axe[0], [0, 0, p.axe[0][2]]); }
  poses[2].flashAt = [poses[2].axe[0][0], poses[2].axe[0][1], 1];
  return poses;
}
const windPoses = (R0: Pose, wind: Partial<Pose>, seed: number, n = 4) => keyed(R0, [{ f: 0, p: {} }, { f: n - 1, p: wind, ease: easeInOut }], n, seed);
function holdPoses(R0: Pose, wind: Partial<Pose>, seed: number, n: number, mod: (i: number) => Partial<Pose>) {
  const base = { ...R0, ...wind } as Pose;
  return Array.from({ length: n }, (_, i) => ({ ...base, t: i / n, seed: seed + i, ...mod(i) }));
}
/** Переход фазы (< 50 %): рык — колпак вверх, секира вскинута одной рукой, цепи раскаляются, пыль кольцом. */
function phasePoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const roar: Partial<Pose> = {
    pitch: -0.16, hp: -0.34, bob: 2 * PXM, pole: [[1, -0.2, -0.6], [-1, -0.2, -0.6]],
    axe: side ? axeBH([7, -19, 42], [7, 21, 47]) : axeBH([-19, 3, 42], [21, 3, 47]), rg: 29, lg: 11, flat: side ? [1, 0, 0] : [0, 1, 0], rage: 1, glow: 1.6, ring: 0.06, ringAt: [0, 0, 0], dust: [1, 1],
  };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 2, p: { pitch: 0.12, hp: 0.1, bob: -1 * PXM, glow: 0.7 }, ease: easeInOut }, { f: 4, p: roar, ease: easeOut },
    { f: 5, p: { ...roar, ring: 0.45, dust: [0.6, 0.6] }, ease: linear }, { f: 6, p: { ...roar, ring: 0.85, dust: [0.2, 0.2] }, ease: linear },
    { f: 7, p: { ...roar, ring: 0, dust: [0, 0], bob: 1 * PXM }, ease: linear }, { f: 9, p: { rage: 0.4 }, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 10, 1100);
  poses.forEach((p) => (p.ringAt = [0, 0, 0]));
  return poses;
}
/**
 * Гибель: отшатнулся, секира выпадает из рук и ложится за ним наискось; палач тяжело опускается на колени (подол — лужей),
 * клонится вперёд и замирает, свесив колпак; угли в прорезях гаснут.
 */
function deathPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const Wv = (v: V3): V3 => fromView(view, v);
  const fall = axeAt(Wv([12, -2, 0]), Wv([-6, -16, 26]));
  const lying = axeAt(Wv([15, 1, 1.4]), Wv([-17, -20, 1.4]));
  const recoil: Partial<Pose> = { pitch: -0.16, hp: -0.3, bob: 1 * PXM, glow: 1.6 };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 1, p: recoil, ease: easeOut }, { f: 2, p: { ...recoil, pitch: 0.08, hp: 0, bob: 0, glow: 1.1 }, ease: easeInOut },
    { f: 3, p: { held: 0, axe: fall, lg: -1, hand: [[9, 7, 22], [-9, 7, 22]], pitch: 0.12, glow: 0.9, kneel: 0.3 }, ease: easeIn },
    { f: 4, p: { held: 0, axe: lying, lg: -1, hand: [[9, 8, 16], [-9, 8, 16]], pitch: 0.22, glow: 0.7, kneel: 0.75, dust: [1, 1] }, ease: easeIn },
    { f: 5, p: { held: 0, axe: lying, lg: -1, hand: [[8.5, 8, 13], [-8.5, 8, 13]], pitch: 0.3, hp: 0.2, glow: 0.5, kneel: 1, dust: [0.5, 0.5] }, ease: easeOut },
    { f: 7, p: { held: 0, axe: lying, lg: -1, hand: [[8, 9, 12], [-8, 9, 12]], pitch: 0.42, hp: 0.45, glow: 0.2, kneel: 1, wither: 0.3 }, ease: easeInOut },
    { f: 11, p: { held: 0, axe: lying, lg: -1, hand: [[8, 9, 11.5], [-8, 9, 11.5]], pitch: 0.46, hp: 0.55, hr: 0.1, glow: 0, kneel: 1, wither: 0.6 }, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 12, 1300);
  for (let i = 3; i < 12; i++) { poses[i].held = 0; poses[i].lg = -1; if (i >= 4) poses[i].axe = lying; }
  return poses;
}

export type ExecAnim = "idle" | "walk" | "attack" | "execWind" | "execHold" | "execute" | "chainWind" | "chainHold" | "chainThrow"
  | "cageWind" | "cageHold" | "cageSlam" | "phase" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: ExecAnim; hit?: number };
const ANIM_ORDER: [ExecAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 10, fps: 15, loop: false, ru: "атака секирой", hit: 6 }],
  ["execWind", { n: 4, fps: 12, loop: false, ru: "замах казни", next: "execHold" }],
  ["execHold", { n: 4, fps: 12, loop: true, ru: "удержание казни", next: "execute" }],
  ["execute", { n: 10, fps: 12, loop: false, ru: "казнь", hit: 3 }],
  ["chainWind", { n: 4, fps: 12, loop: false, ru: "раскрутка цепи", next: "chainHold" }],
  ["chainHold", { n: 4, fps: 12, loop: true, ru: "цепь над головой", next: "chainThrow" }],
  ["chainThrow", { n: 10, fps: 12, loop: false, ru: "бросок цепи", hit: 3 }],
  ["cageWind", { n: 4, fps: 12, loop: false, ru: "замах клеток", next: "cageHold" }],
  ["cageHold", { n: 4, fps: 12, loop: true, ru: "удержание клеток", next: "cageSlam" }],
  ["cageSlam", { n: 8, fps: 12, loop: false, ru: "клетки", hit: 2 }],
  ["phase", { n: 10, fps: 12, loop: false, ru: "переход фазы", hit: 4 }],
  ["death", { n: 12, fps: 12, loop: false, ru: "гибель" }],
];
export const EXEC_ANIMS = {} as Record<ExecAnim, AnimDef>;
{
  let col = 0;
  for (const [k, a] of ANIM_ORDER) { EXEC_ANIMS[k] = { ...a, col }; col += a.n; }
}
export const EXEC_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
export const EXEC_SKILLS: Record<string, { windup: [ExecAnim, ExecAnim]; strike: ExecAnim; fx?: "hook" | "cage" }> = {
  execution: { windup: ["execWind", "execHold"], strike: "execute" },
  chain_hook: { windup: ["chainWind", "chainHold"], strike: "chainThrow", fx: "hook" },
  chain_cages: { windup: ["cageWind", "cageHold"], strike: "cageSlam", fx: "cage" },
};
const POSES: Record<ExecAnim, (v: View) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v), attack: attackPoses,
  execWind: (v) => { const { R0, wind } = execKeys(v); return windPoses(R0, wind, 500); },
  execHold: (v) => { const { R0, wind } = execKeys(v); return holdPoses(R0, wind, 520, 4, (i) => ({ armLift: [TREMBLE[i], TREMBLE[i]], glow: [1.4, 1.6, 1.45, 1.6][i], flash: 0 })); },
  execute: execPoses,
  chainWind: (v) => { const { R0, wind } = chainKeys(v); return windPoses(R0, wind, 700).map((p, i) => ({ ...p, spin: [0, 0.4, 0.8, 1][i], spinPh: i * 0.25 })); },
  chainHold: (v) => { const { R0, wind } = chainKeys(v); return holdPoses(R0, wind, 720, 4, (i) => ({ spinPh: i * 0.25, spin: 1, armLift: [0, TREMBLE[i]] })); },
  chainThrow: chainThrowPoses,
  cageWind: (v) => { const { R0, wind } = cageKeys(v); return windPoses(R0, wind, 900).map((p, i) => ({ ...p, rage: [0.2, 0.5, 0.8, 1][i] })); },
  cageHold: (v) => { const { R0, wind } = cageKeys(v); return holdPoses(R0, wind, 920, 4, (i) => ({ armLift: [TREMBLE[i], TREMBLE[i]], rage: [0.8, 1, 0.8, 1][i], glow: [1.4, 1.6, 1.45, 1.6][i] })); },
  cageSlam: cagePoses, phase: phasePoses, death: deathPoses,
};

// ---------------- эффекты мира ----------------
interface FxDef { w: number; h: number; ax: number; ay: number; n: number; fps: number; hit: number }
export const FX: Record<"hook" | "cage", FxDef & { anims?: Record<string, { col: number; n: number; loop: boolean; hit?: number; fps?: number }> }> = {
  hook: { w: 64, h: 64, ax: 32, ay: 44, n: 10, fps: 12, hit: 2 },
  cage: { w: 96, h: 96, ax: 48, ay: 60, n: 16, fps: 12, hit: 5, anims: { cageIn: { col: 0, n: 6, loop: false, hit: 5, fps: 12 }, cageHold: { col: 6, n: 4, loop: true, fps: 12 }, cageOut: { col: 10, n: 6, loop: false, fps: 12 } } },
};
type Plot = (x: number, y: number, c: RGBA) => void;
const plotOf = (c: PC): Plot => (x, y, col) => c.set(x, y, col);
function disc(plot: Plot, cx: number, cy: number, r: number, c: (d: number) => RGBA | null) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d > 1) continue;
    const q = c(d);
    if (q) plot(x, y, q);
  }
}
/** Цепь между точками кадра: звенья через пиксель, провис, тень снизу. */
function chainPx(plot: Plot, x0: number, y0: number, x1: number, y1: number, sag: number, hot: number, ph = 0) {
  const L = Math.max(1, Math.hypot(x1 - x0, y1 - y0)), n = Math.ceil(L * 1.3);
  for (let s = 0; s <= n; s++) {
    const u = s / n;
    const x = lerp(x0, x1, u), y = lerp(y0, y1, u) + Math.sin(Math.PI * u) * sag;
    // толстая тёмная цепь: звенья в 2 px, блик на каждом втором, тёмная кайма снизу
    const lit = Math.floor(s / 1.7 + ph * 2) % 2 === 0;
    const X = Math.round(x), Y = Math.round(y);
    // толстая светлая цепь: звено в 4 px — светлая кромка, тело, тень, тёмная кайма
    plot(X, Y - 1, hot > 0.5 ? EMBER[4] : BLADE[4]);
    plot(X, Y, hot > 0.5 ? EMBER[lit ? 3 : 2] : lit ? BLADE[3] : IRON[4]);
    plot(X, Y + 1, hot > 0.5 ? EMBER[1] : IRON[2]);
    plot(X, Y + 2, hot > 0.5 ? EMBER[0] : OUT);
    if (lit) plot(X + 1, Y, hot > 0.5 ? EMBER[2] : IRON[4]);
  }
}
/** Кол клетки: железный столб с остриём, тень справа, светлая грань слева. */
function stakePx(plot: Plot, x: number, yb: number, h: number) {
  if (h < 1) return;
  // кол в 4 px: светлая кромка слева, светлое тело, тень справа, тёмная кайма — читается на пепле
  for (let k = 0; k < h; k++) {
    const y = yb - k;
    const top = k > h - 3;
    const w = top ? (k === h - 1 ? 2 : 3) : 4;
    const x0 = x - 2 + ((4 - w) >> 1);
    for (let j = 0; j < w; j++) plot(x0 + j, y, j === 0 ? BLADE[4] : j === 1 ? IRON[4] : j === w - 1 && w > 2 ? IRON[2] : IRON[3]);
    plot(x0 - 1, y, OUT); plot(x0 + w, y, OUT);
  }
  plot(x - 1, yb - h, BLADE[4]); plot(x, yb - h, BLADE[4]); plot(x - 1, yb - h - 1, OUT); plot(x, yb - h - 1, OUT);
  for (const dx of [-3, -2, -1, 0, 1, 2]) plot(x + dx, yb + 1, dx < 0 ? DUST[3] : DUST[1]);
}
/**
 * «Цепь» (крюк в метке, 64×64, центр — (32, 44)): кадры 0–1 — крюк падает сверху наискось с цепью; кадр hit (2) — впивается
 * в землю: искры, пыль; 3–6 — цепь натягивается и дёргается к палачу (вбок вверх), крюк выдирает ком земли; 7–9 — ком падает, пыль оседает.
 */
function buildHookFx(): PC {
  const F = FX.hook;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    let hx = cx, hy = cy;
    if (i <= 1) { const e = easeIn((i + 1) / 2.4); hx = lerp(cx + 18, cx, e); hy = lerp(6, cy, e); }
    else if (i >= 4 && i <= 6) { const e = easeIn((i - 3) / 3); hx = lerp(cx, cx + 22, e); hy = lerp(cy, cy - 18, e); }
    const shown = i <= 6;
    if (shown) {
      chainPx(pf, hx, hy - 2, Math.min(F.w - 4, i <= 1 ? hx + 14 : i <= 3 ? cx + 26 : hx + 12), Math.max(4, i <= 1 ? hy - 20 : 5), i >= 2 && i <= 3 ? 3 : 1, 0, i / 4);
      // крюк: остриё вниз, загиб — тёмная тень
      // крюк: светлая сталь с тёмным контуром, остриё загнуто вверх
      const HK = ["..o..", ".oxo.", ".oxo.", ".oxo.", "oxyo.", "oxyoo", "oyxxo", ".ooxo", "...o."];
      HK.forEach((row, j) => [...row].forEach((ch, k) => { if (ch !== ".") pf(hx - 2 + k, hy - 6 + j, ch === "o" ? OUT : ch === "x" ? BLADE[4] : BLADE[3]); }));
    }
    if (i >= 2 && i <= 3) for (const [dx, dy] of [[-3, -2], [3, -3], [-2, 1], [4, 0]]) pf(cx + dx * (i - 1), cy + dy * (i - 1) - 2, EMBER[i === 2 ? 4 : 3]);
    if (i >= 2) {
      const k = clamp(1 - (i - 2) / 7, 0, 1);
      disc(pb, cx, cy + 1, 3.5, (d) => (d > 0.9 ? null : [20, 14, 10, Math.round(150 * k)]));
      for (const s of [-1, 1]) {
        const t = 1 - k;
        const px = cx + s * (3 + 6 * t), py = cy - t * 1.5, rx = 2 + 1.5 * k, ry = rx * 0.55;
        if (k > 0.15) for (let y = Math.floor(py - ry); y <= py + ry; y++) for (let x = Math.floor(px - rx); x <= px + rx; x++) {
          const dx = (x + 0.5 - px) / rx, dy = (y + 0.5 - py) / ry;
          if (dx * dx + dy * dy <= 1) (s < 0 ? pb : pf)(x, y, DUST[dy > 0.25 ? 1 : dx + dy < -0.5 ? 3 : 2]);
        }
      }
    }
    // ком земли, вырванный крюком: летит вслед и падает
    if (i >= 5 && i <= 9) {
      const t = (i - 5) / 4;
      const x = Math.round(cx + 10 * t), y = Math.round(cy - 10 * Math.sin(Math.PI * t) - 2 + 2 * t);
      for (const [dx, dy, tn] of [[0, 0, 3], [1, 0, 2], [0, 1, 1], [1, 1, 0]] as [number, number, number][]) (t < 1 ? pf : pb)(x + dx, y + dy, DUST[tn]);
    }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/**
 * «Клетки» (96×96, центр — (48, 60), радиус 26): cageIn 0–5 — шесть кольев вырываются из земли по кругу (easeOut, пыль, искры
 * от удара), цепи натягиваются между остриями; кадр hit (5) — клетка замкнулась; cageHold 6–9 — по кругу: цепи тлеют углями,
 * звенья бегут по кругу; cageOut 10–15 — разлом: цепи рвутся, колья валятся наружу и уходят в землю.
 */
function buildCageFx(): PC {
  const F = FX.cage;
  const out = new PC(F.w * F.n, F.h * 2);
  const R = 26, NP = 6;
  const posts = Array.from({ length: NP }, (_, k) => { const a = (k / NP) * TAU + 0.26; return { x: F.ax + Math.cos(a) * R, y: F.ay + Math.sin(a) * R * 0.62, a }; });
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const ph = i / 4;
    let hgt = 24, hot = 0, lean = 0, chain = 1, sink = 0;
    if (i < 6) { const e = easeOut(Math.min(1, (i + 1) / 5.5)); hgt = 24 * e; chain = i >= 4 ? (i - 3) / 2 : 0; }
    else if (i < 10) { hot = 1; }
    else { const e = easeIn((i - 9) / 6); lean = e; chain = Math.max(0, 1 - e * 3); sink = Math.max(0, e - 0.4) * 30; hot = 1 - e; }
    // тень и обод на земле
    if (i >= 1 && i < 14) disc(pb, F.ax, F.ay, R + 3, (d) => (d < 0.82 ? null : [24, 16, 10, Math.round(70 * (i < 10 ? 1 : 1 - (i - 10) / 4))]));
    const tops = posts.map((p) => ({ x: p.x + Math.cos(p.a) * lean * 10, y: p.y - (hgt - sink) + lean * 8 + Math.sin(p.a) * lean * 4, b: p }));
    for (let k = 0; k < NP; k++) {
      const p = posts[k], t = tops[k];
      const plot = p.y < F.ay ? pb : pf;
      const h = Math.max(0, Math.round(hgt - sink));
      if (lean < 0.05) stakePx(plot, Math.round(p.x), Math.round(p.y), h);
      else chainPx(plot, p.x, p.y, t.x, t.y, 0, 0); // упавший кол — линией
      // пыль и искры у основания при подъёме
      if (i <= 3) for (const s of [-1, 1]) plot(Math.round(p.x + s * (2 + i)), Math.round(p.y - i * 0.5), DUST[i < 2 ? 3 : 2]);
      if (i === 4) plot(Math.round(p.x), Math.round(p.y - h), EMBER[4]);
    }
    // светящийся кандальный обруч в центре: кольцо углей на земле и яркая сердцевина, пульсирует
    if (i >= 3 && i < 14) {
      const k = i < 6 ? (i - 2) / 4 : i < 10 ? 1 : 1 - (i - 10) / 4;
      const pul = i >= 6 && i < 10 ? (i % 2 ? 1 : 0.8) : 1;
      disc(pb, F.ax, F.ay + 1, 7 * k, (d) => (d > 0.8 ? [255, 150, 50, Math.round(110 * pul)] : [255, 120, 30, Math.round(50 * pul)]));
      for (let q = 0; q < 12; q++) {
        const ang = (q / 12) * TAU + ph;
        const x = Math.round(F.ax + Math.cos(ang) * 5.5 * k), y = Math.round(F.ay + 1 + Math.sin(ang) * 3.2 * k);
        pb(x, y, q % 3 === 0 ? EMBER[4] : EMBER[3]); pb(x, y + 1, EMBER[1]);
      }
      pb(F.ax, F.ay + 1, EMBER[4]); pb(F.ax - 1, F.ay + 1, EMBER[4]);
    }
    // цепи между остриями: верхний и средний пояс, раскалённые в удержании
    if (chain > 0.05 && hgt - sink > 4) for (let k = 0; k < NP; k++) {
      const a = tops[k], b = tops[(k + 1) % NP];
      const plot = (a.y + b.y) / 2 + hgt < F.ay ? pb : pf;
      const n = Math.max(1, Math.round(chain * 1));
      for (let r = 0; r < n + 1; r++) {
        const yo = r * 9;
        const len = chain;
        const bx = lerp(a.x, b.x, len), by = lerp(a.y, b.y, len);
        chainPx(plot, a.x, a.y + 2 + yo, bx, by + 2 + yo, 2.5, hot * (r === 0 ? 1 : 0.6), ph);
      }
    }
    // угли по кругу в удержании: звено разгорается и бежит
    if (i >= 6 && i < 10) {
      const k = (i - 6) % NP;
      const a = tops[k], b = tops[(k + 1) % NP];
      const x = Math.round((a.x + b.x) / 2), y = Math.round((a.y + b.y) / 2 + 4);
      (y < F.ay - 18 ? pb : pf)(x, y, EMBER[4]);
    }
    // разлом: обрывки цепи и искры
    if (i >= 10 && i <= 12) for (let k = 0; k < NP; k++) { const t = tops[k]; pf(Math.round(t.x + (i - 9) * 2), Math.round(t.y - (i - 9)), EMBER[3]); }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}

/**
 * Кандальный кол (моб клетки, 32×32, как мобы: 12 столбцов × 3 вида — «ходьба» 0–3 и «атака» 4–7 — покой с мерцанием
 * углей на замке, 8–11 — гибель: кол трескается, верх с замком падает, цепь осыпается). Ступни на y = 30.
 */
export const CAGE_UNIT = { frame: 32, cols: 12 };
export function buildStakeSheet(): PC {
  const n = 32, out = new PC(n * 12, n * 3);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) {
    const c = new PC(n, n);
    const pl = plotOf(c);
    const dying = i >= 8, k = dying ? (i - 8) / 3 : 0;
    const ph = (i % 4) / 4;
    const x0 = 16, yb = 30, h = 20;
    const lean = dying ? Math.round(5 * easeIn(k)) : 0;
    // столб: светлая грань слева, тень справа; при гибели верхняя часть отламывается и падает вбок
    for (let y = 0; y < h; y++) {
      const broken = dying && y > 9;
      const sx = broken ? lean * ((y - 9) / 10) : 0, sy = broken ? Math.round(lean * 0.8) : 0;
      if (dying && y > 9 && k > 0.9) continue;
      const X = Math.round(x0 + sx), Y = yb - y + sy;
      pl(X - 1, Y, IRON[3]); pl(X, Y, IRON[2]); pl(X + 1, Y, IRON[1]);
    }
    if (!(dying && k > 0.9)) { pl(x0 + (dying ? lean : 0), yb - h - 1 + (dying ? Math.round(lean * 0.8) : 0), IRON[4]); }
    // цепь, обмотанная вокруг кола (2 витка), звенья через пиксель
    for (const [yy, w] of [[yb - 6, 4], [yb - 12, 4]] as [number, number][]) {
      if (dying && yy < yb - 9 && k > 0.4) continue;
      for (let dx = -w; dx <= w; dx++) pl(x0 + dx, yy + (Math.abs(dx) > 2 ? 1 : 0), (dx + Math.round(ph * 4)) % 2 ? IRON[4] : IRON[1]);
    }
    // замок с углями у верха: мерцает (2 ступени)
    const lx = x0 + (dying ? lean : 0), ly = yb - 15 + (dying ? Math.round(lean * 0.8) : 0);
    if (!(dying && k > 0.66)) {
      pl(lx - 1, ly, IRON[1]); pl(lx + 2, ly, IRON[1]); pl(lx - 1, ly + 1, IRON[1]); pl(lx + 2, ly + 1, IRON[1]);
      pl(lx, ly, EMBER[ph < 0.5 ? 3 : 2]); pl(lx + 1, ly, EMBER[ph < 0.5 ? 2 : 3]); pl(lx, ly + 1, EMBER[1]); pl(lx + 1, ly + 1, EMBER[1]);
    }
    // осколки при гибели
    if (dying) for (let q = 0; q < 5; q++) { const t = k; pl(x0 - 6 + q * 3, yb - 2 - Math.round(6 * Math.sin(Math.PI * t) * (0.5 + 0.1 * q)), q % 2 ? IRON[3] : DUST[2]); }
    // земля у основания
    for (const dx of [-3, -2, 2, 3]) pl(x0 + dx, yb, DUST[1]);
    c.outline(OUT);
    out.blit(c, i * n, row * n);
  }
  return out;
}

// ---------------- листы, проверки, монтажи ----------------
function animSheets(): { img: Record<ExecAnim, PC>; emis: Record<ExecAnim, PC> } {
  const img = {} as Record<ExecAnim, PC>, emis = {} as Record<ExecAnim, PC>;
  for (const [a, d] of ANIM_ORDER) {
    const I = new PC(N * d.n, N * 3), E = new PC(N * d.n, N * 3);
    VIEWS.forEach((v, row) => POSES[a](v).slice(0, d.n).forEach((p, i) => {
      const r = renderExec(v, p);
      I.blit(r.img, i * N, row * N);
      E.blit(r.emis, i * N, row * N);
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
type Sheets = { img: Record<ExecAnim, PC>; emis: Record<ExecAnim, PC> };
function sceneRow(A: Assets, sheets: Sheets, night: boolean, k: number): Row {
  const H = 68;
  return {
    h: H * k + 40,
    draw: (c, y0) => {
      text(c, `×${k} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ 32 · РУНОЛИТ 64 · КАССАР 64 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО | РЕФЕРЕНС 06`, 16, y0 + 8);
      const y = y0 + 34;
      const wGround = 30 * k + 66 * 5 * k + 30 * k + 40;
      groundBg(c, A.terrain, 16, y, wGround, H * k, k, "grass");
      const yb = y + (H - 2) * k;
      const fr = (row: number) => crop(sheets.img.idle, 0, row * N, N, N), fe = (row: number) => crop(sheets.emis.idle, 0, row * N, N, N);
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
      if (A.ref) {
        const rx = 16 + wGround + 20;
        fill(c, rx - 10, y, 4, H * k, [240, 232, 214, 255]);
        c.blit(scaleBox(A.ref, H * k, H * k), rx, y);
      }
    },
  };
}
function animRow(a: ExecAnim, sheets: Sheets, A: Assets, W: number, night = false): Row {
  const d = EXEC_ANIMS[a];
  const k = 2;
  return {
    h: N * k * 2 + 44,
    draw: (c, y0) => {
      text(c, `×2 · ${d.ru} · ${d.n} КАДРОВ · ${d.fps} К/С${d.loop ? " · ПО КРУГУ" : ""}${d.next ? ` · → ${EXEC_ANIMS[d.next].ru}` : ""}${d.hit !== undefined ? ` · УДАР — КАДР ${d.hit + 1}` : ""}${night ? " · НОЧЬ" : ""}`, 16, y0 + 8);
      for (const v of [0, 2]) {
        const y = y0 + 34 + (v === 0 ? 0 : N * k);
        const wG = 70 + d.n * N * k;
        groundBg(c, A.terrain, 16, y, Math.min(W - 32, wG), N * k, k, a === "walk" && v === 2 ? "dirt" : "grass");
        let x = 24;
        const yb = y + CAM.GY * k;
        shadowBlob(c, x + 16 * k, yb - 0.5 * k, 6.5 * k, 2.2 * k);
        c.blit(scaleNN(heroAt(A, v === 0 ? 0 : 2), k, v === 2), x, Math.round(yb - 30.4 * k));
        x += 30 * k;
        const pos: number[] = [];
        for (let i = 0; i < d.n; i++) {
          shadowBlob(c, x + 32 * k, y + 59.5 * k, 15 * k, 4.4 * k);
          c.blit(scaleNN(crop(sheets.img[a], i * N, v * N, N, N), k), x, y);
          pos.push(x);
          x += N * k;
        }
        if (night) {
          nightRect(c, 16, y, Math.min(W - 32, wG), N * k);
          pos.forEach((px, i) => relight(c, crop(sheets.emis[a], i * N, v * N, N, N), px, y, k));
        }
      }
    },
  };
}
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
/**
 * «Наш | референс»: сверху — ×1 и ×3 рядом с героем и личем на траве (как в игре), ниже — палач вниз и вбок ×6 (покой,
 * кадр 1) и образец 06 той же высоты, днём и ночью.
 */
function buildCompare(sheets: Sheets, A: Assets): PC {
  const k = 6;
  const H = N * k;
  const W = Math.max(24 + 2 * N * k + 16 + 40 + H + 24, 1500);
  const TOP = 90 + 90 + 3 * 84 + 40;
  const c = new PC(W, TOP + 2 * (H + 60) + 20);
  fill(c, 0, 0, c.w, c.h, [30, 28, 34, 255]);
  // ×1 и ×3: герой 32, лич 80, палач 64 (вниз, вбок) — ступни на одной линии
  const lich = A.lich ? crop(A.lich, 0, 0, 80, 80) : null;
  for (const [kk, y0] of [[1, 12], [3, 120]] as [number, number][]) {
    text(c, `×${kk} · ГЕРОЙ · ЛИЧ ВЕДРАС · ПАЛАЧ КАССАР ВНИЗ И ВБОК`, 24, y0, 2);
    const yb = y0 + 22 + 84 * kk;
    groundBg(c, A.terrain, 24, y0 + 20, Math.min(W - 48, (32 + 84 + 66 * 2 + 40) * kk + 40), 86 * kk, kk, "grass");
    let x = 40;
    const put1 = (img: PC, feet: number, w: number) => { shadowBlob(c, x + (img.w / 2) * kk, yb - 0.5 * kk, Math.min(16, (img.w / 32) * 6.5) * kk, 2.4 * kk); c.blit(scaleNN(img, kk), x, Math.round(yb - feet * kk)); x += w * kk; };
    put1(heroAt(A, 0), 30.4, 34);
    if (lich) put1(lich, 75.4, 84);
    put1(crop(sheets.img.idle, 0, 0, N, N), CAM.GY, 66);
    put1(crop(sheets.img.idle, 0, 2 * N, N, N), CAM.GY, 66);
  }
  for (const night of [false, true]) {
    const y = TOP + 48 + (night ? H + 70 : 0);
    text(c, night ? "НАШ · НОЧЬ" : "НАШ · ДЕНЬ", 24, y - 36, 3);
    text(c, "РЕФЕРЕНС 06", 24 + 2 * N * k + 56, y - 36, 3);
    fill(c, 24, y, 2 * N * k + 16, H, [150, 156, 140, 255]);
    for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) c.blit(scaleNN(crop(sheets.img.idle, 0, row * N, N, N), k), 24 + j * (N * k + 16), y);
    if (night) {
      nightRect(c, 24, y, 2 * N * k + 16, H);
      for (const [j, row] of [[0, 0], [1, 2]] as [number, number][]) relight(c, crop(sheets.emis.idle, 0, row * N, N, N), 24 + j * (N * k + 16), y, k);
    }
    fill(c, 24 + 2 * N * k + 16 + 16, y, 4, H, [240, 232, 214, 255]);
    if (A.ref) c.blit(scaleBox(A.ref, H, H), 24 + 2 * N * k + 56, y);
  }
  return c;
}
function ensureRef(root: string): PC | null {
  const png = path.join(root, "tools", "out", "bosses139", "ref-06.png");
  const jpg = path.join(root, "tools", "out", "refs", "bosses-139", "06.jpg");
  if (!fs.existsSync(png) && fs.existsSync(jpg) && process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${jpg}'); $b=New-Object System.Drawing.Bitmap 512,512; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,512,512); $b.Save('${png}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  return fs.existsSync(png) ? loadPC(png) : null;
}

export function writeExecArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => { const f = path.join(outDir, name); c.save(f); files.push(f); return c; };
  const sheets = animSheets();
  const sheet = new PC(N * EXEC_COLS, N * 3), glow = new PC(N * EXEC_COLS, N * 3);
  for (const [a] of ANIM_ORDER) { sheet.blit(sheets.img[a], EXEC_ANIMS[a].col * N, 0); glow.blit(sheets.emis[a], EXEC_ANIMS[a].col * N, 0); }
  save(sheet, "exec-sheet.png");
  save(glow, "exec-glow.png");
  const fx = { hook: save(buildHookFx(), "exec-fx-hook.png"), cage: save(buildCageFx(), "exec-fx-cage.png") };
  save(buildStakeSheet(), "exec-cage-unit.png");
  const rows = ["вниз", "вверх", "вбок"];
  const bad = [...frameEdgeCuts(sheet, N, OUT, "лист", rows), ...frameHoles(sheet, N, "лист", rows, 3)];
  for (const [name, F] of Object.entries(FX)) {
    const c = fx[name as keyof typeof fx];
    for (let r = 0; r < 2; r++) for (let i = 0; i < F.n; i++) {
      let hits = 0;
      for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if ((x === 0 || y === 0 || x === F.w - 1 || y === F.h - 1) && c.alpha(i * F.w + x, r * F.h + y)) hits++;
      if (hits) bad.push(`эффект ${name}, слой ${r}, кадр ${i + 1}: ${hits} px на краю`);
    }
  }
  const st = outlineStats(sheet, N);
  console.log(`  ${ID}: ${EXEC_COLS} кадров × 3 вида; контур — до ${(st.worstRatio * 100).toFixed(1)} % кадра, толще 1 px: ${st.thick}`);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 30).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; }
  else console.log("  проверки: край кадра чист, проколов нет");
  const A: Assets = {
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
    golem: loadPC(path.join(root, "client", "public", "assets", "units", "sol_rune_golem.png")),
    ref: ensureRef(root),
    lich: fs.existsSync(path.join(root, "client", "public", "assets", "units", "umb_crown_lich.png")) ? loadPC(path.join(root, "client", "public", "assets", "units", "umb_crown_lich.png")) : null,
  };
  const W = 2000;
  const rowsP: Row[] = [sceneRow(A, sheets, false, 3), sceneRow(A, sheets, true, 3)];
  for (const [a] of ANIM_ORDER) rowsP.push(animRow(a, sheets, A, W));
  for (const a of ["idle", "cageHold"] as ExecAnim[]) rowsP.push(animRow(a, sheets, A, W, true));
  rowsP.push(fxRow(`×2 · ЭФФЕКТ МИРА · ЦЕПЬ (КРЮК) · ${FX.hook.n} КАДРОВ · ${FX.hook.fps} К/С · УДАР — КАДР ${FX.hook.hit + 1}`, fx.hook, FX.hook, A, W, 64));
  rowsP.push(fxRow(`×2 · ЭФФЕКТ МИРА · КЛЕТКА · ПОДЪЁМ 6 · ПО КРУГУ 4 · РАЗЛОМ 6 · ${FX.cage.fps} К/С`, fx.cage, FX.cage, A, W, 76));
  save(stackRows(rowsP, W), "exec-pilot.png");
  save(buildCompare(sheets, A), "exec-compare.png");
  return files;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/umb_ash_executioner.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const files = writeExecArt(root, path.join(root, "tools", "out", "bosses139"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void linear; void lerpV; void hex;
