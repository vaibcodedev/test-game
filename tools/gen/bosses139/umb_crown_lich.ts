/**
 * Задача 139, пилот боссов кольца: Ведрас Неугасимый, Лич Грозового хребта (восток, слот r75n, ур. 75, группа 4–5;
 * карточка — docs/bosses-139.md, раздел «Пилот»). Образ — по референсу tools/out/refs/bosses-139/01.jpg (лич в шипастой
 * короне, зелёное пламя на ладони, посох с кристаллом, череп на груди, рваный тёмный плащ) — только для сравнения: чужой
 * арт в игру и в git не идёт.
 *
 * Метод — общий движок мобов и боссов (tools/gen/mobs/lib.ts, как rig.ts): тело в 3D из примитивов (конус со
 * скруглёнными концами, эллипсоид, брусок, срез плоскостью), луч на пиксель, наклон камеры 14°, свет сверху слева → 5 тонов
 * на материал, тень, затенение складок, швы тоном тени, выборочный контур 1 px (selout из rig.ts — не толще героя).
 * Кадр 80×80 (таблица 3.1: ур. 65 и 75), ступни на y = 75. Модель строится в росте боссов стартовых земель (64) и
 * масштабируется ×1,25; сдвиги тела — целыми пикселями кадра после масштаба (snapM), рисунок не «кипит».
 *
 * Светится (ночью не гаснет, маска emis → лист …-glow.png): кристалл посоха, рёбра, глаза, пламя на ладони, огни короны,
 * души. Пламя, души, звёзды оглушения, след посоха, волна по земле — процедурные 2D-слои поверх тела с проверкой глубины
 * (за телом не видны), фаза по номеру кадра — петли бесшовные, движения с easing, 12–15 к/с.
 *
 * Эффекты мира (кадры отдельными листами, строки: 0 — под юнитами, 1 — над): печать склепа (share), блуждающий огонь
 * (метки на всех), столб душ («Зов Мёртвой Короны», не сорванный каст).
 *
 * Запуск (одна генерация, низкий приоритет): npx tsx tools/gen/bosses139/umb_crown_lich.ts → tools/out/bosses139/
 *   lich-sheet.png, lich-glow.png, lich-fx-seal.png, lich-fx-wisp.png, lich-fx-pillar.png, lich-compare.png («наш |
 *   референс»), pilot.png (все анимации днём и ночью, рядом герой и sol_rune_golem), lich.html (просмотр с анимацией).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  PC, PX, R, Scene, SN, CS, VIEWS, add, clamp, cross, crop, depthOf, easeIn, easeInOut, easeOut, fill, frameEdgeCuts, frameHoles, fromView,
  groundBg, hash01, hex, ik, lerp, lerpV, linear, loadPC, mat, mix, mul, nightRect, norm, perp, pngDataUrl, renderScene, rot, scaleBox, scaleNN,
  scr, sealPinholes, shadowBlob, snapPx, stackRows, stampRows, sub, text, thicken, toView, vlen, TAU,
  type Cam, type Mat, type RGBA, type Ramp, type Row, type Stamp, type V3, type View,
} from "../mobs/lib";
import { OUT, selout, outlineStats } from "../mobs/rig";

export const ID = "umb_crown_lich";
export const FRAME = 80;
const N = FRAME;
const CAM: Cam = { N, CX: 40, GY: 75.4 };
/** Модель — в росте боссов 64; ×1,25 → кадр 80. */
const K = 1.25;
/** Подъём модели на PXM — ровно 1 px кадра по вертикали. */
const PXM = PX / K;
const snapM = (view: View, w: V3): V3 => mul(snapPx(view, mul(w, K)), 1 / K);
const pxM = (view: View, dx: number, dy: number): V3 => fromView(view, [dx / K, 0, -dy * PXM]);

// ---------------- палитра ----------------
/** Чернёное железо короны, наплечников и наручей: холодные тени, блик — пыльно-зелёный. */
const IRON = R("#0f1114", "#1f2328", "#353b41", "#575e60", "#8a918a");
/** Ряса — глубокая синева почти до чёрного (как на образце). */
const ROBE = R("#0b0d15", "#161b2b", "#222b40", "#323f5a", "#485a7a");
/** Плащ и капюшон — тёмная бирюза, светлее рясы: плащ отделяется от тела. */
const CLOAK = R("#0a1013", "#121e25", "#1d2f37", "#2b454d", "#3e6266");
const BONE = R("#2e2a23", "#5a5545", "#8a8571", "#bab59c", "#e3dfc6");
const WOOD = R("#120d0b", "#241a15", "#382a20", "#4f3e2e", "#6d5940");
const BLADE = R("#20272d", "#4b565e", "#86919a", "#c3cbcb", "#f0f5ef");
/** Зелёный свет души: рёбра, глаза, руны (светится). */
const SOUL = R("#0c3517", "#197a2c", "#3dca46", "#9af471", "#e8ffda");
/** Бирюзовое пламя ладони, кристалл, души (светится). */
const FLAME = R("#07302e", "#0f7465", "#26c79f", "#88f2d1", "#e9fff7");
/** Гибель: всё выцветает в пепел. */
const DEAD = R("#121315", "#232427", "#37383a", "#504f4d", "#6c6a64");
const DUST = R("#2c3130", "#4f5752", "#77806f", "#a3a98f");
const VOID = hex("#050807");

const M = {
  iron: mat("железо", IRON, { base: 1.6, gain: 2.6 }),
  robe: mat("ряса", ROBE, { base: 1.55, gain: 2.3 }),
  cloak: mat("плащ", CLOAK, { base: 1.6, gain: 2.3 }),
  bone: mat("кость", BONE, { base: 1.85, gain: 2.3 }),
  wood: mat("дерево", WOOD, { base: 1.7, gain: 2.3 }),
  blade: mat("сталь", BLADE, { base: 2.1, gain: 2.0 }),
  gem: mat("кристалл", FLAME, { base: 2.5, gain: 1.4, glow: true, crisp: true, lo: 1 }),
};
/** Увядание по ступеням (0, ⅓, ⅔, 1) — свой материал на ступень; кристалл гаснет в пепел. */
const WCACHE = new Map<string, Mat>();
function wm(m: Mat, w: number): Mat {
  const s = Math.round(clamp(w, 0, 1) * 3);
  if (!s) return m;
  const key = `${m.name}:${s}`;
  let q = WCACHE.get(key);
  if (!q) {
    const k = (s / 3) * (m === M.gem ? 1 : m === M.robe || m === M.cloak ? 0.4 : 0.8);
    q = { ...m, ramp: m.ramp.map((c, i) => mix(c, DEAD[Math.min(i, 4)], k)), glow: m.glow && s < 2 };
    WCACHE.set(key, q);
  }
  return q;
}
const EMIS_RAMPS = [SOUL, FLAME];
const isEmisCol = (() => {
  const s = new Set<string>();
  for (const r of EMIS_RAMPS) for (const c of r) s.add(c.slice(0, 3).join(","));
  return (q: RGBA) => s.has(q.slice(0, 3).join(","));
})();

// ---------------- поза ----------------
interface Pose {
  /** сдвиг тела (модель; в кадре — целые пиксели), проседание, подъём груди и головы — целые пиксели */
  root: V3; bob: number; chest: number; headZ: number;
  pitch: number; yaw: number; roll: number; hp: number; hy: number; hr: number;
  /** кулаки [правый — хват посоха, левый — пламя]; локти — по IK в сторону pole */
  hand: [V3, V3]; pole: [V3, V3];
  /** посох: [хват (от покоя тела, едет с ним, пока в руке), направление к навершию]; sg — от пятки до хвата; held — в руке */
  stf: [V3, V3]; sg: number; held: number;
  armLift: [number, number];
  /** волна по лохмотьям плаща (фаза 0..1, сила — px), отлёт плаща назад, шаг под рясой [пр, лев] */
  wave: number; waveAmp: number; flare: number; kick: [number, number];
  /** свет души 0..1,6; увядание 0..1; уход тела вниз (модель); ряса оседает грудой 0..1 */
  glow: number; wither: number; sink: number; collapse: number;
  /** пламя на ладони 0..2,2; ладонь раскрыта; кристалл налит светом; огни на зубцах короны */
  flame: number; lopen: number; charge: number; crownFire: number;
  /** души по орбите (сила, фаза), разлёт душ 0..1; брошенные огни 0..1 и откуда (мир, px) */
  souls: number; soulPh: number; soulsOut: number; fling: number; flingFrom?: [number, number];
  /** волна по земле 0..1 и где (модель); вспышка и где; пыль [пр, лев]; оглушение (звёзды) */
  ring: number; ringAt?: V3; flash: number; flashAt?: V3; dust: [number, number]; stun: number;
  /** души уходят вверх (гибель); череп и корона падают 0..1 */
  wisps: number; headOff: number; crownOff: number;
  trail?: V3[];
  t: number; seed: number;
}

const HIP0 = 21;
const NECK: V3 = [0, 0.3, 38.6];
const ARM: [number, number] = [8.2, 8.6];
/** Посох: от пятки до основания навершия; кристалл и острие — выше. */
const STAFF = 44;
const TIP = 7.5;

const staffAt = (butt: V3, dir: V3, sg: number): [V3, V3] => {
  const d = norm(dir);
  return [add(butt, mul(d, sg)), d];
};
const STF_FRONT = staffAt([12.5, 3.2, 0], [0.05, 0.03, 1], 24);
const REST_FRONT: Pose = {
  root: [0, 0, 0], bob: 0, chest: 0, headZ: 0, pitch: 0.04, yaw: 0, roll: 0, hp: -0.05, hy: 0, hr: 0,
  hand: [STF_FRONT[0], [-14.2, 5.0, 33.0]], pole: [[1, -0.4, -0.8], [-1, -0.6, -0.6]],
  stf: STF_FRONT, sg: 24, held: 1, armLift: [0, 0],
  wave: 0, waveAmp: 0, flare: 0, kick: [0, 0],
  glow: 1, wither: 0, sink: 0, collapse: 0,
  flame: 1.45, lopen: 1, charge: 0.3, crownFire: 0,
  souls: 0, soulPh: 0, soulsOut: 0, fling: 0,
  ring: 0, flash: 0, dust: [0, 0], stun: 0, wisps: 0, headOff: 0, crownOff: 0, t: 0, seed: 1,
};
const STF_SIDE = staffAt([8.5, 9.0, 0], [0, 0.04, 1], 24);
const REST_SIDE: Pose = { ...REST_FRONT, hand: [STF_SIDE[0], [-6.5, 10.5, 32.5]], pole: [[1, -0.4, -0.8], [-1, 0.2, -0.7]], stf: STF_SIDE };
const restOf = (view: View): Pose => (view === "side" ? REST_SIDE : REST_FRONT);

/** Сдвиг тела в кадре: шаг корня и проседание — целые пиксели вида (после масштаба). */
const bodyShift = (view: View, p: Pose): V3 => snapM(view, [p.root[0], p.root[1], p.bob + p.root[2] - p.sink]);

// ---------------- штампы ----------------
type Keys = Record<string, RGBA>;
const ST_RIBS: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: stampRows([
    "...kbbcbbk...",
    "..b33bcb33b..",
    ".bbbbbcbbbbb.",
    ".b233bcb332b.",
    "..bbbbcbbbb..",
    "..b23bcb32b..",
    "...bbbcbbb...",
    "...b2kck2b...",
    "....b1c1b....",
  ], -6, -4),
  side: stampRows([
    ".kbcbb.",
    "b3bcb3b",
    "bbbcbbb",
    "b23c32b",
    ".bbcbb.",
    ".b2c2b.",
    "..bcb..",
  ], -3, -3),
};
const ST_FACE: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: stampRows(["dd..dd", "d3..3d", "..kk..", ".bkkb.", ".kbbk."], -3, -1),
  side: stampRows(["ddd.d", "d3d.3", "...kk", "..bkb"], -2, -1),
};
const ST_BELT: Partial<Record<View, ReturnType<typeof stampRows>>> = {
  down: stampRows(["d.d", "3.3", ".k.", "bkb"], -1, -2),
  side: stampRows(["d.d", "3.3", ".k.", "bkb"], -1, -2),
};
const ST_GEM: Partial<Record<View, ReturnType<typeof stampRows>>> = { down: stampRows(["yx", "zy"], 0, 0), side: stampRows(["yx", "zy"], 0, 0), up: stampRows(["yx", "zy"], 0, 0) };
const ST_INLAY: Partial<Record<View, ReturnType<typeof stampRows>>> = { down: stampRows([".2.", "232", ".2.", ".1."], -1, -1), side: stampRows(["2", "3", "2", "1"], 0, -1) };

/** Цвета штампов по силе света души (ступенями) и увяданию. */
function stampKeys(glow: number, wither: number): Keys {
  const g = clamp(glow, 0, 1.6);
  const lv = (k: number) => {
    const v = k - Math.round((1 - Math.min(1, g)) * 3) + (g > 1.25 ? 1 : 0);
    return v < 0 ? VOID : SOUL[clamp(v, 0, 4)];
  };
  const b = (c: RGBA) => mix(c, DEAD[3], wither * 0.8);
  return {
    d: VOID, "1": lv(1), "2": lv(2), "3": lv(3),
    b: b(BONE[3]), c: b(BONE[4]), k: b(BONE[1]),
    x: FLAME[4], y: FLAME[3], z: FLAME[2],
  };
}
const GLOW_KEYS = ["1", "2", "3", "x", "y", "z"];

// ---------------- сцена ----------------
interface Extra {
  flames: { at: V3; k: number; ph: number; seed: number }[];
  souls: { at: V3; tail: V3; k: number }[];
  stars: V3[];
  rings: { c: V3; r: number; k: number }[];
  flash: { at: V3; k: number } | null;
  dust: { at: V3; k: number }[];
  wisps: V3[];
  glints: V3[];
}

/** Лич в координатах модели (затем ×K). */
function build(p0: Pose, view: View): { S: Scene; X: Extra } {
  const S = new Scene();
  const X: Extra = { flames: [], souls: [], stars: [], rings: [], flash: null, dust: [], wisps: [], glints: [] };
  // вбок: корпус и голова чуть к зрителю (три четверти) — видны рёбра, лицо и пламя
  const p: Pose = view === "side" ? { ...p0, yaw: p0.yaw - 0.3, hy: p0.hy - 0.2 } : p0;
  const W = p.wither;
  const shift = bodyShift(view, p);
  const pel: V3 = add([0, 0, HIP0], shift);
  const up = p.chest * PXM, hz = p.headZ * PXM;
  const TV = (v: V3): V3 => rot(v, p.pitch, p.yaw, p.roll);
  const T = (v: V3, lift = v[2] >= 25): V3 => add(add(pel, TV(sub(v, [0, 0, HIP0]))), [0, 0, lift ? up : 0]);
  const PR = (v: V3): V3 => rot(v, p.pitch * 0.3, p.yaw * 0.35, p.roll * 0.5);
  const PV = (v: V3): V3 => add(pel, PR(sub(v, [0, 0, HIP0])));
  const HV = (v: V3): V3 => TV(rot(v, p.hp, p.hy, p.hr));
  const Hraw = (v: V3): V3 => add(T(add(NECK, rot(sub(v, NECK), p.hp, p.hy, p.hr)), true), [0, 0, hz]);
  const axes = (f: (v: V3) => V3, roll = 0, pitch = 0, yaw = 0): [V3, V3, V3] => [
    f(rot([1, 0, 0], pitch, yaw, roll)), f(rot([0, 1, 0], pitch, yaw, roll)), f(rot([0, 0, 1], pitch, yaw, roll)),
  ];
  const keys = stampKeys(p.glow, W);
  const halo = SOUL[2];
  const col = p.collapse;
  const ground = (v: V3): V3 => [v[0], v[1], Math.max(0, v[2])];
  void ground;

  // ---------- ряса: до земли, шаг — колени изнутри толкают подол вперёд ----------
  {
    const g = S.group(1.6);
    const topZ = lerp(pel[2] - 3, 2.2, col);
    const rb = lerp(10, 12.2, col), ra = lerp(5.6, 8.5, col);
    const c0: V3 = [pel[0], pel[1], Math.max(topZ, 0.5)];
    // складки: тёмная впадина по углу вокруг оси (рисунок едет с телом — от опорной точки)
    const folds = (c: { l: V3; edge: boolean }) => {
      if (c.edge) return 0;
      const th = Math.atan2(c.l[1], c.l[0]);
      const f = Math.sin(th * 9 + 0.6);
      return f > 0.82 ? -0.9 : f < -0.9 ? 0.4 : 0;
    };
    S.cone(g, wm(M.robe, W), c0, ra, [pel[0], pel[1], 0], rb, { tex: folds, ref: [1, 0, 0], big: true });
    if (col < 0.6) for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
      const k = p.kick[i];
      S.ball(g, wm(M.robe, W), [pel[0] + s * 3.6, pel[1] + 3.6 + 2.6 * k, 8.5 + 1.2 * k], 3.4 + 0.3 * k, { tex: folds, ref: [1, 0, 0] });
    }
    if (col > 0.02) S.ell(g, wm(M.robe, W), [pel[0], pel[1] - 1, 0], [9.5 * col + 1, 7.5 * col + 1, 4.6 * col + 0.5], undefined, { tex: folds });
    // рваные клинья подола по бокам — ломают силуэт у земли
    const flaps: [number, number, number, number][] = [[1, 0.2, 3.2, 1.0], [-1, 0.2, 3.6, 1.2], [1, 4.5, 2.0, 0.6], [-1, 4.8, 2.4, 0.8]];
    for (const [s, y, l, w] of flaps) {
      const a: V3 = [pel[0] + s * (rb - 1.2), pel[1] + y, 3.4], b: V3 = [pel[0] + s * (rb + l), pel[1] + y - 0.6, 0.2];
      S.cone(g, wm(M.robe, W), a, 1.5 + 0.2 * w, b, 0.35, { ref: [1, 0, 0] });
    }
  }
  const alive = p.sink < 26;
  // ---------- нагрудная пластина-табард: от пояса к коленям, зелёные вставки ----------
  if (col < 0.3) {
    const g = S.group(0);
    const upV = norm(PR([0, -0.25, 1])), fw = norm(PR([0, 1, 0.25]));
    const sd = PR([1, 0, 0]);
    const c = PV([0, 6.85, 13.2]);
    S.box(g, wm(M.iron, W), c, [2.1, 0.45, 7.6], [sd, fw, upV], 0.3);
    S.cone(g, wm(M.iron, W), add(c, mul(upV, -7)), 1.6, add(add(c, mul(upV, -10.4)), mul(fw, 0.9)), 0.2);
    for (const z of [3.2, -1.8]) S.stamps.push({ at: add(add(c, mul(upV, z)), mul(fw, 0.5)), n: fw, px: ST_INLAY, colors: keys, glow: GLOW_KEYS, halo });
  }

  // ---------- корпус: позвоночник, грудная клетка (рёбра светятся), ворот, пояс с черепом ----------
  if (alive) {
    const gBody = S.group(1.0);
    S.cone(gBody, wm(M.bone, W), PV([0, -0.6, 21.5]), 1.3, T([0, -0.8, 34]), 1.2, { tone: -0.4 });
    S.ell(gBody, wm(M.bone, W), T([0, 0.5, 30.2]), [5.2, 3.8, 4.6], axes(TV), { tone: -0.25 });
    S.stamps.push({ at: T([0, 4.1, 30.0]), n: TV([0, 1, 0]), px: ST_RIBS, colors: keys, glow: GLOW_KEYS, halo, depthTol: 2.5 });
    {
      const g = S.group(0.8);
      S.ell(g, wm(M.iron, W), T([0, 0, 35.0]), [6.4, 4.4, 2.2], axes(TV));
      S.cone(g, wm(M.iron, W), T([0, 3.6, 34.6]), 1.3, T([0, 4.3, 32.2]), 0.4, { part: S.newPart() });
    }
    {
      const g = S.group(0.5);
      S.ell(g, wm(M.iron, W), PV([0, 0.2, 22.8]), [6.1, 5.2, 1.5], axes(PR));
    }
    {
      const g = S.group(0.6);
      const c = PV([0, 6.0, 24.6]);
      S.ball(g, wm(M.bone, W), c, 2.8);
      S.ell(g, wm(M.bone, W), add(c, PR([0, 0.8, -2.3])), [1.8, 1.5, 1.0], axes(PR), { tone: -0.3, part: S.newPart() });
      S.stamps.push({ at: add(c, PR([0, 2.7, 0.3])), n: PR([0, 1, 0]), px: ST_BELT, colors: keys, glow: GLOW_KEYS, halo, depthTol: 2.5 });
    }
  }

  // ---------- посох: кривое древко, оковка, клешня из четырёх зубцов, кристалл, острие ----------
  const held = p.held >= 0.5;
  const liftR = pxM(view, 0, -p.armLift[0]);
  const sd = norm(p.stf[1]);
  const gripW: V3 = add(p.stf[0], held ? add(shift, liftR) : [0, 0, 0]);
  const butt = sub(gripW, mul(sd, p.sg));
  const head = add(butt, mul(sd, STAFF));
  const crystal = add(head, mul(sd, 3.4));
  {
    const g = S.group(0.35);
    S.cone(g, wm(M.wood, W), butt, 0.8, head, 0.95);
    for (const [u, r] of [[0.3, 1.2], [0.63, 1.15], [0.86, 1.05]]) S.ball(g, wm(M.wood, W), add(butt, mul(sd, STAFF * u)), r);
    S.cone(g, wm(M.iron, W), add(butt, mul(sd, 0.2)), 0.95, add(butt, mul(sd, 2.4)), 1.05, { part: S.newPart() });
    const e0 = perp(sd, [1, 0.3, 0]), e1 = cross(sd, e0);
    const pi = S.newPart();
    S.cone(g, wm(M.iron, W), sub(head, mul(sd, 1.6)), 1.25, add(head, mul(sd, 0.6)), 1.5, { part: pi });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.5;
      const r = add(mul(e0, Math.cos(a)), mul(e1, Math.sin(a)));
      const m = add(add(head, mul(sd, 2.8)), mul(r, 2.6));
      const t = add(add(head, mul(sd, 6.3)), mul(r, 1.1));
      S.cone(g, wm(M.iron, W), add(head, mul(sd, 0.4)), 0.65, m, 0.45, { part: pi });
      S.cone(g, wm(M.iron, W), m, 0.45, t, 0.15, { part: pi });
    }
    S.ell(g, wm(M.gem, W), crystal, [1.5, 1.5, 2.3], [e0, e1, sd], { part: S.newPart(), tone: Math.round(p.charge * 1.4) - 0.4 });
    S.cone(g, wm(M.blade, W), add(head, mul(sd, 5.8)), 0.85, add(head, mul(sd, 5.8 + TIP)), 0.1, { part: S.newPart() });
    if (p.charge > 0.75) X.glints.push(add(crystal, mul(sd, 0.6)));
  }

  // ---------- руки: железо плеча, наруч с шипом локтя, костяная кисть; рваный рукав под предплечьем ----------
  if (alive) for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
    const g = S.group(0.9);
    const lift = pxM(view, 0, -p.armLift[i]);
    const sh = add(T([s * 8.8, 0.2, 34.0]), lift);
    const fist = i === 0 && held ? gripW : add(add(p.hand[i], shift), lift);
    const el = ik(sh, fist, ARM[0], ARM[1], p.pole[i]);
    S.cone(g, wm(M.iron, W), sh, 2.1, el, 1.7, { tone: -0.2 });
    const fd = norm(sub(fist, el));
    const wr = sub(fist, mul(fd, 1.3));
    const pv = S.newPart();
    S.cone(g, wm(M.iron, W), el, 1.6, wr, 2.0, { part: pv });
    S.cone(g, wm(M.iron, W), el, 0.7, add(el, add(mul(fd, -2.6), mul(perp(fd, p.pole[i]), 1.7))), 0.12, { part: pv });
    const gs = S.group(0.6);
    S.cone(gs, wm(M.cloak, W), add(el, mul(fd, 1.2)), 1.5, add(add(el, mul(fd, 2.2)), [0, -0.6, -4.8]), 0.35, { part: S.newPart() });
    const e0 = perp(fd, [0, 0, 1]), e1 = cross(fd, e0);
    const pf = S.newPart();
    S.ell(g, wm(M.bone, W), fist, [1.45, 1.0, 1.6], [e0, e1, fd], { part: pf, tone: -0.1 });
    if (i === 1) {
      // когтистая ладонь вверх: пальцы веером, раскрыты по lopen
      const upW: V3 = [0, 0, 1];
      [-1.5, -0.5, 0.5, 1.5].forEach((o, k) => {
        const dir = norm(add(add(mul(fd, 0.55), mul(upW, 0.9 * p.lopen + 0.2)), mul(e0, o * 0.42 * (0.4 + p.lopen))));
        const b0 = add(fist, add(mul(fd, 1.0), mul(e0, o * 0.55)));
        const b1 = add(b0, mul(dir, 2.2 + (k === 1 || k === 2 ? 0.5 : 0)));
        S.cone(g, wm(M.bone, W), b0, 0.5, b1, 0.38, { part: pf });
        S.cone(g, wm(M.bone, W), b1, 0.38, add(b1, mul(norm(add(dir, mul(fd, -0.4 * (1 - p.lopen)))), 1.4)), 0.2, { part: pf });
      });
      if (p.flame > 0.03) X.flames.push({ at: add(add(fist, mul(fd, 1.2)), [0, 0, 1.4]), k: p.flame, ph: p.t * 2, seed: 1 });
    } else {
      S.ell(g, wm(M.bone, W), add(fist, mul(e1, 0.9)), [1.4, 0.7, 1.2], [e0, e1, fd], { part: pf, tone: 0.1 });
    }
  }

  // ---------- наплечники: пластина, лама, три шипа; бирюзовый камень спереди ----------
  if (alive) for (const [i, s] of [[0, 1], [1, -1]] as [number, number][]) {
    const g = S.group(0.7);
    S.ell(g, wm(M.iron, W), T([s * 9.4, -0.3, 36.3]), [4.6, 4.5, 3.0], axes(TV, s * 0.45));
    S.ell(g, wm(M.iron, W), T([s * 11.3, -0.2, 33.4]), [3.3, 3.9, 1.6], axes(TV, s * 0.72), { part: S.newPart() });
    const ps = S.newPart();
    [[-0.8, 7.0, 0.6], [1.2, 8.4, 0.8], [3.1, 6.0, 1.0]].forEach(([dx, l, out], k) => {
      const b = T([s * (9.0 + dx), -0.6 + k * 0.3, 38.4 - Math.max(0, dx) * 0.55]);
      const m = add(b, TV([s * out * l * 0.35, -0.3, l * 0.55]));
      const t = add(m, TV([s * out * l * 0.55, -0.4, l * 0.42]));
      S.cone(g, wm(M.iron, W), b, 0.75, m, 0.42, { part: ps });
      S.cone(g, wm(M.iron, W), m, 0.42, t, 0.1, { part: ps });
    });
    S.stamps.push({ at: T([s * 9.6, 4.0, 36.4]), n: TV([0, 1, 0.3]), px: ST_GEM, colors: keys, glow: GLOW_KEYS, halo: FLAME[2], depthTol: 2.2 });
  }

  // ---------- голова: череп в капюшоне, корона поверх капюшона ----------
  const HC: V3 = [0, 0.4, 44];
  const headTf = (v: V3): V3 => {
    if (p.headOff <= 0) return Hraw(v);
    const e = easeIn(clamp(p.headOff, 0, 1));
    const from = Hraw(HC);
    const to = add(fromView(view, [-1.2, 2.2, 0]), [pel[0] - shift[0], pel[1] - shift[1], 7.6]);
    const c = add(lerpV(from, to, e), [0, 0, 3.5 * Math.sin(Math.PI * Math.min(1, e * 1.1))]);
    return add(c, rot(sub(v, HC), 0.3 * e, 0, 0.45 * e));
  };
  const headAx = (): [V3, V3, V3] => {
    const o = headTf([0, 0, 0]);
    return [norm(sub(headTf([1, 0, 0]), o)), norm(sub(headTf([0, 1, 0]), o)), norm(sub(headTf([0, 0, 1]), o))];
  };
  if (alive || p.headOff > 0) {
    const g = S.group(0.6);
    S.ell(g, wm(M.bone, W), headTf([0, 1.0, 43.4]), [3.2, 3.6, 3.7], headAx());
    S.ell(g, wm(M.bone, W), headTf([0, 1.8, 40.4]), [2.3, 2.3, 1.4], headAx(), { tone: -0.25, part: S.newPart() });
    S.stamps.push({ at: headTf([0, 4.45, 43.3]), n: sub(headTf([0, 1, 0.1]), headTf([0, 0, 0])), px: ST_FACE, colors: keys, glow: GLOW_KEYS, halo, depthTol: 2.4, minFacing: 0.2 });
  }
  if (alive) {
    // капюшон — с телом (не с головой): спереди срезан, череп в проёме; ниспадает на плечи
    const g = S.group(1.1);
    const hc = add(T([0, -0.7, 44.2], true), [0, 0, hz]);
    S.ell(g, wm(M.cloak, W), hc, [4.8, 4.9, 5.3], axes(TV), { cut: { n: [0, 1, 0], d: 1.2 }, big: true });
    S.cone(g, wm(M.cloak, W), add(hc, TV([0, -1.6, -3.4])), 4.6, T([0, -2.2, 35.8]), 5.6, { big: true });
  }
  // ---------- корона: обруч на капюшоне и шипы-рога, огни на остриях ----------
  {
    const crownC: V3 = [0, -0.3, 48.1];
    const onHead = (v: V3): V3 => add(add(T(add(NECK, rot(sub(v, NECK), p.hp * 0.5, p.hy * 0.5, p.hr * 0.5)), true), [0, 0, hz]), [0, 0, 0]);
    const tf = (v: V3): V3 => {
      if (p.crownOff <= 0) return onHead(v);
      const e = easeIn(clamp(p.crownOff, 0, 1));
      const from = onHead(crownC);
      const to = add(fromView(view, [10.5, 3.2, 0]), [pel[0] - shift[0], pel[1] - shift[1], 3.6]);
      const c = add(lerpV(from, to, e), [0, 0, 5 * Math.sin(Math.PI * Math.min(1, e * 1.15))]);
      return add(c, rot(sub(v, crownC), 0.2 * e, 0.4 * e, -1.25 * e));
    };
    if (alive || p.crownOff > 0) {
      const g = S.group(0.22);
      const o = tf(crownC);
      const ax: [V3, V3, V3] = [norm(sub(tf(add(crownC, [1, 0, 0])), o)), norm(sub(tf(add(crownC, [0, 1, 0])), o)), norm(sub(tf(add(crownC, [0, 0, 1])), o))];
      S.ell(g, wm(M.iron, W), o, [3.7, 3.9, 0.75], ax);
      // шипы: [угол от лба, длина, отгиб наружу, отросток]
      const spikes: [number, number, number, number][] = [
        [0, 8.6, 0.5, 0], [0.8, 6.0, 2.2, 0], [-0.8, 6.0, 2.2, 0], [1.6, 7.6, 4.6, 1], [-1.6, 7.6, 4.6, 1],
        [2.4, 5.4, 3.2, 0], [-2.4, 5.4, 3.2, 0], [Math.PI, 4.0, 1.4, 0],
      ];
      const ps = S.newPart();
      for (const [a, l, lean, br] of spikes) {
        const out: V3 = [Math.sin(a), Math.cos(a), 0];
        const b = add(crownC, [Math.sin(a) * 3.5, Math.cos(a) * 3.7 - 0.0, 0.5]);
        const m = add(add(b, mul(out, lean * 0.35)), [0, 0, l * 0.55]);
        const t = add(add(m, mul(out, lean * 0.65)), [0, 0, l * 0.45]);
        S.cone(g, wm(M.iron, W), tf(b), 0.6, tf(m), 0.38, { part: ps });
        S.cone(g, wm(M.iron, W), tf(m), 0.38, tf(t), 0.1, { part: ps });
        if (br) {
          const bt = add(add(m, mul(out, 3.0)), [0, 0, 0.6]);
          S.cone(g, wm(M.iron, W), tf(lerpV(b, m, 0.75)), 0.36, tf(bt), 0.1, { part: ps });
        }
        if (p.crownFire > 0.05 && l > 4.5) X.flames.push({ at: tf(add(t, [0, 0, 0.3])), k: 0.18 + 0.3 * p.crownFire, ph: p.t * 2 + a, seed: 5 + a * 3 });
      }
      if (p.stun > 0.05) {
        for (let k = 0; k < 3; k++) {
          const a = p.soulPh * TAU + (k * TAU) / 3;
          X.stars.push(add(tf(add(crownC, [0, 0, 6.5])), [Math.cos(a) * 6, Math.sin(a) * 4.2, 0]));
        }
      }
    }
  }

  // ---------- плащ: девять полос от плеч до земли, концы — рваные языки; левая сторона длиннее и шире ----------
  {
    const g = S.group(1.3);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) / ((n - 1) / 2);
      const ph = u * 1.95;
      const top = T([Math.sin(ph) * 7.0, -Math.cos(ph) * 4.2 - 0.9, 35.4], true);
      const sweep = u < 0 ? 2.8 * -u : 0.6 * u;
      const lift = Math.round(p.waveAmp * (0.5 + 0.5 * Math.sin(TAU * (p.wave + i * 0.17)))) * PXM;
      const tipZ = [0.0, 3.2, -0.6, 1.4, -0.6, 4.0, -0.4, 2.0, -0.8][i] + lift;
      const fl = p.flare * (0.6 + 0.4 * Math.cos(ph));
      const midZ = lerp(top[2], 0, 0.55);
      const R1 = lerp(8.3, 12.5, 0.55);
      const mid: V3 = [pel[0] + Math.sin(ph) * (R1 + sweep * 0.5), pel[1] - Math.cos(ph) * (6.0 + fl * 0.5) - 1.0, midZ];
      const bot: V3 = [pel[0] + Math.sin(ph) * (12.5 + sweep), pel[1] - Math.cos(ph) * (8.2 + fl) - 1.2, tipZ];
      const topC = col > 0 ? lerpV(top, [pel[0] + Math.sin(ph) * 8, pel[1] - Math.cos(ph) * 5, 4.5], col) : top;
      const midC = col > 0 ? lerpV(mid, [pel[0] + Math.sin(ph) * 11.5, pel[1] - Math.cos(ph) * 8, 1.5], col) : mid;
      const botC = col > 0 ? lerpV(bot, [pel[0] + Math.sin(ph) * 13.5, pel[1] - Math.cos(ph) * 9.5 - 1, -0.5], col) : bot;
      const fold = (c: { l: V3; edge: boolean }) => (c.edge ? 0 : Math.abs(c.l[0]) > 1.9 ? -0.6 : 0);
      S.cone(g, wm(M.cloak, W), topC, 2.6, midC, 2.8, { tex: fold, big: true });
      S.cone(g, wm(M.cloak, W), midC, 2.8, botC, 0.7, { tex: fold, big: true });
    }
  }

  // ---------- души, волна, вспышка, пыль, огоньки гибели ----------
  if (p.souls > 0.02) {
    const c = add(pel, [0, 0, 9]);
    for (let k = 0; k < 6; k++) {
      const a = p.soulPh * (TAU / 6) + (k * TAU) / 6;
      const r = 14 + 22 * easeOut(p.soulsOut);
      const pt = (aa: number, rr: number): V3 => add(c, [Math.cos(aa) * rr, Math.sin(aa) * rr * 0.85, 1.6 * Math.sin(2 * aa + k)]);
      X.souls.push({ at: pt(a, r), tail: pt(a - 0.45 + 0.3 * p.soulsOut, r - 6 * p.soulsOut), k: p.souls * (1 - p.soulsOut * 0.9) });
    }
  }
  if (p.ring > 0.02) X.rings.push({ c: p.ringAt ? add(p.ringAt, [0, 0, 0]) : [butt[0], butt[1], 0], r: 3 + 22 * p.ring, k: 1 - p.ring });
  if (p.flash > 0.02) X.flash = { at: p.flashAt ?? crystal, k: p.flash };
  for (let i = 0; i < 2; i++) if (p.dust[i] > 0.05) X.dust.push({ at: i === 0 && p.ringAt === undefined ? [butt[0], butt[1] + 1, 0] : [pel[0] + (i ? -4 : 4), pel[1] + 7, 0], k: p.dust[i] });
  if (p.wisps > 0) for (let k = 0; k < 9; k++) {
    const st = hash01(k, 3, 9) * 0.55;
    const f = clamp((p.wisps - st) / 0.45, 0, 1);
    if (f <= 0 || f >= 1) continue;
    X.wisps.push([pel[0] - 10 + 20 * hash01(k, 1, 9) + 1.5 * Math.sin(f * 6 + k), pel[1] - 2 + 4 * hash01(k, 2, 9), 6 + 34 * f + 5 * hash01(k, 4, 9)]);
  }
  // масштаб в кадр 80
  scaleScene(S, K);
  const sk = (v: V3) => mul(v, K);
  X.flames.forEach((f) => (f.at = sk(f.at)));
  X.souls.forEach((s) => { s.at = sk(s.at); s.tail = sk(s.tail); });
  X.stars = X.stars.map(sk);
  X.rings.forEach((r) => { r.c = sk(r.c); r.r *= K; });
  if (X.flash) X.flash.at = sk(X.flash.at);
  X.dust.forEach((d) => (d.at = sk(d.at)));
  X.wisps = X.wisps.map(sk);
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
const put = (c: Ctx, x: number, y: number, col: RGBA, dz: number, glow = true) => {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) return;
  const i = y * N + x;
  if (c.prim[i] >= 0 && c.t[i] < dz - 1) return;
  c.img.set(x, y, col);
  if (glow) c.emis.set(x, y, col);
};
/**
 * Пламя: капля с языками; тоны — ядро, середина, край, верхушка; качание по высоте и мерцание — по фазе (петля бесшовная
 * при целом числе циклов). gb == null — без проверки глубины (эффекты мира).
 */
function flamePx(at: [number, number], k: number, ph: number, seed: number, ramp: Ramp, plot: (x: number, y: number, c: RGBA) => void) {
  const [sx, sy] = at;
  const H = 3.5 + 7 * k, Wd = 1.2 + 1.6 * k;
  for (let y = Math.floor(sy - H - 1); y <= Math.ceil(sy + 1.5); y++) {
    const v = (sy - (y + 0.5)) / H;
    if (v < -0.18 || v > 1) continue;
    const w = Wd * Math.pow(Math.sin(Math.PI * clamp(v * 0.82 + 0.18, 0, 1)), 0.65) * (v < 0 ? 1 + v * 3.5 : 1);
    const sway = Math.sin(v * 4.2 - ph * TAU + seed) * v * (0.5 + 0.45 * k) + Math.sin(ph * TAU * 2 + seed * 1.7) * v * v * 0.7;
    for (let x = Math.floor(sx - Wd - 3); x <= Math.ceil(sx + Wd + 3); x++) {
      const u = (x + 0.5 - sx - sway) / Math.max(0.5, w);
      if (Math.abs(u) > 1) continue;
      if (v > 0.62 && Math.abs(u - 0.3 * Math.sin(ph * TAU + seed)) < 0.2) continue;
      const tone = Math.abs(u) < 0.36 && v < 0.5 ? 4 : Math.abs(u) < 0.68 && v < 0.78 ? 3 : v > 0.84 ? 1 : 2;
      plot(x, y, ramp[tone]);
    }
  }
  // искра над языком: поднимается и гаснет за цикл
  const f = (ph * 2 + seed * 0.37) % 1;
  if (k > 0.5) plot(Math.round(sx + 1.5 * Math.sin(seed + f * 5)), Math.round(sy - H - 1 - f * 4), ramp[f < 0.5 ? 3 : 2]);
}
function drawFlame(c: Ctx, f: { at: V3; k: number; ph: number; seed: number }) {
  const v = toView(c.view, f.at);
  const dz = depthOf(v);
  flamePx(scr(CAM, v), f.k, f.ph, f.seed, FLAME, (x, y, col) => put(c, x, y, col, dz));
}
function drawSoul(c: Ctx, s: { at: V3; tail: V3; k: number }) {
  if (s.k < 0.05) return;
  const a = toView(c.view, s.at), b = toView(c.view, s.tail);
  const [ax, ay] = scr(CAM, a), [bx, by] = scr(CAM, b);
  const dz = depthOf(a);
  const back = dz > depthOf(toView(c.view, [0, 0, 30]));
  const n = 5;
  for (let k = n; k >= 0; k--) {
    const u = k / n;
    put(c, lerp(ax, bx, u), lerp(ay, by, u), FLAME[u < 0.3 ? 3 : u < 0.7 ? 2 : 1], lerp(dz, depthOf(b), u));
  }
  const core = back ? FLAME[3] : FLAME[4];
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(c, ax + dx - 0.5, ay + dy - 0.5, dx + dy === 0 ? core : FLAME[3], dz);
}
function drawStar(c: Ctx, at: V3) {
  const v = toView(c.view, at);
  const [x, y] = scr(CAM, v);
  const dz = depthOf(v);
  put(c, x, y, SOUL[4], dz);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(c, x + dx, y + dy, SOUL[3], dz);
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
    c.img.set(x, y - 1, SOUL[r.k > 0.55 ? 4 : 3]); c.emis.set(x, y - 1, SOUL[r.k > 0.55 ? 4 : 3]);
    c.img.set(x, y, SOUL[r.k > 0.3 ? 2 : 1]); c.emis.set(x, y, SOUL[r.k > 0.3 ? 2 : 1]);
  }
}
function drawFlash(c: Ctx, f: { at: V3; k: number }) {
  const v = toView(c.view, f.at);
  const [sx, sy] = scr(CAM, v);
  const L = Math.round(2 + 4 * f.k);
  const x = clamp(Math.floor(sx), L + 2, N - 3 - L), y = clamp(Math.floor(sy), L + 2, N - 4);
  const dz = depthOf(v);
  for (let r = 1; r <= L; r++) {
    const tone = r <= 1 ? 4 : r <= L - 1 ? 3 : 2;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) put(c, x + dx * r, y + dy * Math.min(r, 3), SOUL[tone], dz);
  }
  if (f.k > 0.5) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { put(c, x + dx * 2, y + dy * 2, SOUL[3], dz); put(c, x + dx, y + dy, SOUL[4], dz); }
  put(c, x, y, FLAME[4], dz);
}
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
      const w = 0.5 + 1.6 * u;
      const dz = lerp(depthOf(vp[k]), depthOf(vp[k + 1]), s / steps);
      for (let dy = -w; dy <= w + 0.01; dy += 0.5) for (let dx = -w; dx <= w + 0.01; dx += 0.5) {
        if (dx * dx + dy * dy > w * w) continue;
        const e = Math.hypot(dx, dy) / Math.max(0.5, w);
        put(c, x + dx, y + dy, SOUL[u > 0.7 && e < 0.5 ? 4 : e < 0.6 ? 3 : u < 0.35 ? 1 : 2], dz);
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
function drawGlint(c: Ctx, at: V3) {
  const v = toView(c.view, at);
  const [x, y] = scr(CAM, v);
  const dz = depthOf(v);
  for (let r = 1; r <= 2; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(c, x + dx * r, y + dy * r, FLAME[r === 1 ? 4 : 3], dz);
}
/** Брошенные огни: три шара с хвостом от ладони вверх и в стороны, гаснут до края кадра. */
function drawFling(c: Ctx, from: [number, number], k: number) {
  const e = easeOut(clamp(k, 0, 1));
  [-17, 3, 19].forEach((dx, j) => {
    const x = from[0] + dx * e * (0.8 + 0.1 * j), y = lerp(from[1], 5, e) + Math.abs(dx) * 0.25 * e;
    if (y < 4 || x < 4 || x > N - 5) return;
    const r = 2.2 - 0.9 * e;
    for (let s = 0; s < 6; s++) {
      const u = s / 6;
      const tx = lerp(x, from[0] + dx * Math.max(0, e - 0.25) * 0.85, u), ty = lerp(y, lerp(from[1], 5, Math.max(0, e - 0.25)), u);
      put(c, tx, ty, FLAME[u < 0.3 ? 3 : u < 0.6 ? 2 : 1], -99);
    }
    for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) {
      const d = Math.hypot(xx, yy);
      if (d > r + 0.3) continue;
      put(c, x + xx, y + yy, d < r - 1 ? FLAME[4] : FLAME[3], -99);
    }
  });
}

/** Кадр лича: { img, emis } 80×80. */
export function renderLich(view: View, pose: Pose): { img: PC; emis: PC } {
  const { S, X } = build(pose, view);
  const R0 = renderScene(CAM, S, view, OUT);
  const img = new PC(N, N);
  const emis = R0.emis;
  const c: Ctx = { img, emis, t: R0.gb.t, prim: R0.gb.prim, view };
  for (const r of X.rings) drawRing(c, r, true);
  img.blit(R0.body, 0, 0);
  for (const r of X.rings) drawRing(c, r, false);
  if (pose.trail) drawTrail(c, pose.trail.map((q) => mul(q, K)));
  for (const f of X.flames) drawFlame(c, f);
  for (const s of X.souls) drawSoul(c, s);
  for (const s of X.stars) drawStar(c, s);
  for (const g of X.glints) drawGlint(c, g);
  for (const w of X.wisps) {
    const v = toView(view, w);
    const [x, y] = scr(CAM, v);
    put(c, x, y, FLAME[3], depthOf(v)); put(c, x, y + 1, FLAME[1], depthOf(v));
  }
  if (pose.fling > 0.02 && pose.flingFrom) drawFling(c, pose.flingFrom, pose.fling);
  if (X.flash) drawFlash(c, X.flash);
  for (const d of X.dust) drawDust(c, d);
  thicken(img, OUT, 3, [...SOUL, ...FLAME]);
  sealPinholes(img, OUT, true, 8);
  selout(img);
  // осиротевший контур и нижний ряд — как у мобов (rig.renderFrame)
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
  // маска свечения — только то, что светится сейчас (пламя и души поверх тела тоже)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const q = img.get(x, y)!;
    if (q[3] && isEmisCol(q) && !emis.alpha(x, y)) emis.set(x, y, q);
    if (!q[3]) emis.clear(x, y);
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
    if (k === "trail" || k === "flashAt" || k === "ringAt" || k === "flingFrom") continue;
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
/** Кристалл в мире (модель) — для следа и вспышки. */
function crystalW(p: Pose, view: View): V3 {
  const pp = view === "side" ? p : p;
  const sd = norm(pp.stf[1]);
  const sh = pp.held >= 0.5 ? bodyShift(view, pp) : [0, 0, 0] as V3;
  const grip = add(pp.stf[0], sh);
  return add(sub(grip, mul(sd, pp.sg)), mul(sd, STAFF + 3.4));
}
const trailOf = (base: Pose, keys: Key[], view: View, f0: number, f1: number, n = 7): V3[] =>
  Array.from({ length: n }, (_, k) => crystalW(poseAt(base, keys, lerp(f0, f1, k / (n - 1))), view));
/** Левая ладонь в кадре (px) — откуда летят огни. */
function palmPx(p: Pose, view: View): [number, number] {
  const sh = bodyShift(view, p);
  const w = mul(add(add(p.hand[1], sh), [0, 0, 2.5]), K);
  const [x, y] = scr(CAM, toView(view, w));
  return [x, y];
}

/** Покой: дыхание снизу вверх по пикселю (грудь, голова, ладонь), волна по плащу, пламя мерцает, свет рёбер пульсирует. */
function idlePoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const chest = [0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0];
  const head = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const hand = [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0];
  return Array.from({ length: n }, (_, i) => {
    const t = i / n, ph = t * TAU;
    return {
      ...R0, t, seed: 100 + i, chest: chest[i], headZ: head[i] - chest[i],
      hand: [R0.hand[0], add(R0.hand[1], [0, 0, hand[i] * PXM])] as [V3, V3],
      wave: t, waveAmp: 1, glow: 1 + 0.22 * Math.sin(ph), charge: 0.35 + 0.25 * Math.sin(ph + 1.2),
    };
  });
}
/**
 * Ходьба: скользящий тяжёлый шаг под рясой — колени по очереди выталкивают подол вперёд, тело проседает после каждого
 * шага на пиксель; посох — дорожный: упирается пяткой и уходит назад, пока тело идёт над ним, затем дугой вперёд.
 */
function walkPoses(view: View, n = 12): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const bob = [0, -1, -1, 0, 0, 0, 0, -1, -1, 0, 0, 0];
  const sway = [0, 0, 1, 1, 1, 0, 0, 0, -1, -1, -1, 0];
  const b0 = sub(R0.stf[0], mul(R0.stf[1], R0.sg));
  return Array.from({ length: n }, (_, i) => {
    const u = i / n;
    const PL = 0.58;
    let y: number, z: number;
    if (u < PL) { y = 4.5 - (9 * u) / PL; z = 0; }
    else { const s = (u - PL) / (1 - PL); y = -4.5 + 9 * easeInOut(s); z = 2.6 * Math.sin(Math.PI * s); }
    const butt: V3 = side ? [b0[0], b0[1] + y, z] : [b0[0], b0[1] + y * 0.6, z];
    const stf = staffAt(butt, [0.05, 0.03 - y * 0.03, 1], R0.sg);
    const kr = Math.max(0, Math.sin(TAU * u)), kl = Math.max(0, Math.sin(TAU * u + Math.PI));
    return {
      ...R0, t: u, seed: 150 + i,
      root: [side ? 0 : sway[i] / K, 0, 0] as V3, bob: bob[i] * PXM,
      stf, kick: [kr, kl] as [number, number],
      hand: [stf[0], add(R0.hand[1], [0, 1.4 * Math.sin(TAU * u), 0.5 * Math.cos(TAU * u)])] as [V3, V3],
      wave: u * 2, waveAmp: 1.4, flare: side ? 2.2 : 1.1,
      dust: [i === 0 ? 1 : i === 1 ? 0.5 : 0, 0] as [number, number],
      glow: 1 + 0.15 * Math.sin(u * TAU), charge: 0.35,
    };
  });
}
/** Атака: удар посохом наотмашь — замах за правое плечо, удар навершием вперёд-вниз (кадр 6), зелёная вспышка, след. */
function attackPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = side
    ? { yaw: 0.15, pitch: -0.06, hp: -0.12, stf: staffAt([9, 8, 12.5], [0, -0.6, 0.8], 30), sg: 30, charge: 0.8, flame: 1.3, pole: [[1, -0.6, 0.3], R0.pole[1]] }
    : { yaw: -0.25, pitch: -0.05, hp: -0.1, stf: staffAt([2.6, 15.4, 10.6], [0.35, -0.55, 0.75], 30), sg: 30, charge: 0.8, flame: 1.3, pole: [[1, -0.4, 0.4], R0.pole[1]] };
  const peak: Partial<Pose> = side
    ? { ...wind, stf: staffAt([9, 9.5, 12], [0, -0.66, 0.75], 30), charge: 1 }
    : { ...wind, yaw: -0.3, stf: staffAt([3.6, 17.4, 11.5], [0.3, -0.65, 0.7], 30), charge: 1 };
  const hit: Partial<Pose> = side
    ? { yaw: -0.05, pitch: 0.22, hp: 0.05, bob: -2 * PXM, stf: staffAt([9, -25.9, 38.6], [0, 0.8, -0.3], 33), sg: 33, charge: 1, flash: 1, flame: 0.8, pole: [[1, -0.3, 0.2], R0.pole[1]] }
    : { yaw: 0.2, pitch: 0.2, hp: 0.0, bob: -2 * PXM, stf: staffAt([25, -9.6, 30.5], [-0.6, 0.62, -0.15], 30), sg: 30, charge: 1, flash: 1, flame: 0.8, pole: [[1, -0.3, 0.1], R0.pole[1]] };
  const settle: Partial<Pose> = { ...hit, bob: -1 * PXM, flash: 0, charge: 0.7, pitch: (hit.pitch ?? 0) - 0.05 };
  const back: Partial<Pose> = side
    ? { pitch: 0.08, stf: staffAt([8.5, 12, 1.5], [0, -0.1, 1], 26), sg: 26, charge: 0.5 }
    : { pitch: 0.08, stf: staffAt([12, 6, 1.5], [0.02, -0.05, 1], 26), sg: 26, charge: 0.5 };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 3, p: wind, ease: easeInOut }, { f: 4, p: peak, ease: linear },
    { f: 5, p: { ...hit, flash: 0 }, ease: easeIn }, { f: 6, p: hit, ease: easeOut }, { f: 7, p: settle, ease: easeOut },
    { f: 9, p: back, ease: easeInOut }, { f: 10, p: {}, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 11, 400);
  poses[5].trail = trailOf(R0, keys, view, 4, 5);
  poses[6].trail = trailOf(R0, keys, view, 4.2, 6);
  poses[7].trail = trailOf(R0, keys, view, 5.4, 6.4, 4);
  poses[6].flashAt = crystalW(poses[6], view);
  return poses.slice(0, 11);
}
/** «Печать склепа»: посох поднят и отведён, кристалл налит светом; удержание — дрожь, свет ступенями; удар — пяткой оземь (кадр 3). */
function sealKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = {
    pitch: -0.07, hp: -0.18, bob: 1 * PXM,
    stf: side ? staffAt([8.5, 4.5, 2.5], [0, 0.5, 1], 23) : staffAt([7.5, 2.3, 2.2], [0.58, 0.05, 1], 23), sg: 23,
    hand: [R0.hand[0], side ? [-6, 9, 37] : [-11, 6.5, 37.5]], charge: 1, crownFire: 0.4, glow: 1.3, flame: 0.7,
  };
  const hit: Partial<Pose> = {
    ...wind, pitch: 0.16, hp: 0.06, bob: -2 * PXM,
    stf: side ? staffAt([8.5, 9, -3], [0, 0.1, 1], 24) : staffAt([11.2, 2.6, -3], [0.08, 0.1, 1], 24), sg: 24,
    hand: [R0.hand[0], side ? [-6.5, 10.5, 30] : [-13.5, 6, 30]], flash: 1, ring: 0.06, dust: [1, 1], crownFire: 0.6, glow: 1.5, charge: 1,
  };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: { ...wind, bob: 2 * PXM, charge: 1 }, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, flash: 0, ring: 0.35, dust: [0.6, 0.6], charge: 0.7 }, ease: linear },
    { f: 4, p: { ...hit, flash: 0, ring: 0.62, dust: [0.3, 0.3], charge: 0.5, bob: -1 * PXM }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 0.88, dust: [0, 0], charge: 0.4, bob: -1 * PXM }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, ring: 0, dust: [0, 0], charge: 0.35, bob: -1 * PXM, crownFire: 0 }, ease: linear },
    { f: 9, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
const windPoses = (R0: Pose, wind: Partial<Pose>, seed: number, n = 4) => keyed(R0, [{ f: 0, p: {} }, { f: n - 1, p: wind, ease: easeInOut }], n, seed);
function holdPoses(R0: Pose, wind: Partial<Pose>, seed: number, n: number, mod: (i: number) => Partial<Pose>) {
  const base = { ...R0, ...wind } as Pose;
  return Array.from({ length: n }, (_, i) => ({ ...base, t: i / n, seed: seed + i, ...mod(i) }));
}
const TREMBLE = [0, 1, 0, -1];
function sealPoses(view: View): Pose[] {
  const { R0, keys } = sealKeys(view);
  const poses = keyed(R0, keys, 10, 540);
  poses[2].flashAt = add(sub(poses[2].stf[0], mul(norm(poses[2].stf[1]), poses[2].sg)), add(bodyShift(view, poses[2]), [0, 0, 1.2]));
  return poses;
}
/** «Блуждающие огни»: ладонь над головой, пламя растёт; удар — бросок вперёд (кадр 3), три огня уходят вверх к целям. */
function wispKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = { pitch: -0.08, hp: -0.22, hand: [R0.hand[0], side ? [-5.5, 8, 43.5] : [-11, 4.5, 43.5]], pole: [R0.pole[0], [-1, -0.4, -0.3]], flame: 1.9, glow: 1.3, lopen: 1 };
  const gather: Partial<Pose> = { ...wind, hand: [R0.hand[0], side ? [-5.5, 6.5, 45] : [-11, 2.5, 45]], flame: 2.2, glow: 1.45 };
  const hit: Partial<Pose> = { ...wind, pitch: 0.14, hp: 0.05, bob: -1 * PXM, hand: [R0.hand[0], side ? [-6, 14, 30] : [-8.5, 12.5, 30.5]], flame: 0, glow: 1.5, lopen: 1 };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 1, p: gather, ease: easeOut }, { f: 2, p: hit, ease: easeIn },
    { f: 3, p: { ...hit, bob: 0, pitch: 0.1 }, ease: easeOut }, { f: 5, p: { ...hit, bob: 0, pitch: 0.06, flame: 0.3 }, ease: easeInOut },
    { f: 7, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function wispCastPoses(view: View): Pose[] {
  const { R0, keys } = wispKeys(view);
  const poses = keyed(R0, keys, 8, 740);
  const from = palmPx(poses[1], view);
  [0, 0, 0.12, 0.38, 0.62, 0.82, 1, 0].forEach((f, i) => { poses[i].fling = f; poses[i].flingFrom = from; });
  return poses;
}
/** «Зов Мёртвой Короны» (сорвать каст): руки разведены, корона горит, шесть душ кружат по орбите вокруг тела. */
function callKeys(view: View) {
  const R0 = restOf(view);
  const side = view === "side";
  const wind: Partial<Pose> = {
    pitch: -0.09, hp: -0.26, bob: 1 * PXM,
    stf: side ? staffAt([8.5, 3, 3.5], [0, 0.4, 1], 24) : staffAt([7.5, 1.5, 3.5], [0.45, 0, 1], 24),
    hand: [R0.hand[0], side ? [-5, 7.5, 41] : [-15, 2.5, 39.5]], pole: [R0.pole[0], [-1, -0.3, -0.4]],
    flame: 1.5, glow: 1.45, crownFire: 1, charge: 1, souls: 1, flare: 1.4,
  };
  const hit: Partial<Pose> = {
    ...wind, pitch: 0.18, hp: 0.08, bob: -2 * PXM,
    stf: side ? staffAt([8.5, 10, -2.5], [0, 0.12, 1], 24) : staffAt([12.5, 4, -2.5], [0.1, 0.12, 1], 24),
    hand: [R0.hand[0], side ? [-6, 14, 27] : [-14, 9, 27]], flame: 0.6, flash: 1, ringAt: [0, 0, 0], ring: 0.05, soulsOut: 0.05, crownFire: 0.5, glow: 1.6,
  };
  const keys: Key[] = [
    { f: 0, p: wind }, { f: 2, p: { ...wind, bob: 3 * PXM, hp: -0.32, glow: 1.6 }, ease: easeOut }, { f: 3, p: hit, ease: easeIn },
    { f: 4, p: { ...hit, flash: 0, ring: 0.35, soulsOut: 0.45 }, ease: linear },
    { f: 5, p: { ...hit, flash: 0, ring: 0.62, soulsOut: 0.8, souls: 0.6 }, ease: linear },
    { f: 6, p: { ...hit, flash: 0, ring: 0.9, soulsOut: 1, souls: 0, crownFire: 0, bob: -1 * PXM }, ease: linear },
    { f: 7, p: { ...hit, flash: 0, ring: 0, souls: 0, soulsOut: 0, crownFire: 0, bob: -1 * PXM, glow: 1.1 }, ease: linear },
    { f: 9, p: {}, ease: easeInOut },
  ];
  return { R0, wind, keys };
}
function callStrikePoses(view: View): Pose[] {
  const { R0, keys } = callKeys(view);
  const poses = keyed(R0, keys, 10, 940);
  poses.forEach((p, i) => (p.soulPh = (i < 3 ? i : 3) * 0.17));
  poses[3].flashAt = add(bodyShift(view, poses[3]), [0, 2, 30]);
  return poses;
}
/** Оглушение (каст сорван): голова свесилась, посох накренился, пламя едва тлеет, над короной кружат три звезды. */
function stunPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const b0 = sub(R0.stf[0], mul(R0.stf[1], R0.sg));
  const base: Pose = {
    ...R0, pitch: 0.2, hp: 0.38, hr: 0.16, bob: -1 * PXM, glow: 0.45, flame: 0.25, lopen: 0.4, charge: 0.1,
    stf: staffAt(b0, side ? [0, 0.3, 1] : [0.3, 0.12, 1], R0.sg - 1.5), sg: R0.sg - 1.5,
    hand: [R0.hand[0], side ? [-6.5, 7, 23.5] : [-11.5, 4.5, 23.5]], pole: [R0.pole[0], [-1, 0, -0.3]], stun: 1,
  };
  const sway = [0, 0, 1, 1, 0, 0, -1, -1];
  return Array.from({ length: 8 }, (_, i) => ({ ...base, t: i / 8, seed: 1000 + i, soulPh: i / 8, root: [side ? 0 : sway[i] / K, 0, 0] as V3, wave: i / 8, waveAmp: 1 }));
}
/** Переход фазы (< 50 %): собирается, затем вспыхивает — взмывает на 3 px, руки в стороны, корона загорается, волна. */
function phasePoses(view: View): Pose[] {
  const R0 = restOf(view);
  const side = view === "side";
  const crouch: Partial<Pose> = { pitch: 0.16, hp: 0.12, bob: -1 * PXM, hand: [R0.hand[0], side ? [-4, 9, 29] : [-6.5, 7.5, 29.5]], flame: 0.4, glow: 0.7 };
  const burst: Partial<Pose> = {
    pitch: -0.12, hp: -0.32, bob: 3 * PXM, flare: 3, waveAmp: 2,
    stf: side ? staffAt([8.5, 3, 3.5], [0, 0.4, 1], 24) : staffAt([7.5, 1.5, 3.5], [0.45, 0, 1], 24),
    hand: [R0.hand[0], side ? [-5, 7.5, 41] : [-15, 2.5, 39.5]], pole: [R0.pole[0], [-1, -0.3, -0.4]],
    flash: 1, ringAt: [0, 0, 0], ring: 0.06, glow: 1.6, crownFire: 1, flame: 2.1, souls: 1, charge: 1,
  };
  const keys: Key[] = [
    { f: 0, p: {} }, { f: 2, p: crouch, ease: easeInOut }, { f: 4, p: burst, ease: easeOut },
    { f: 5, p: { ...burst, flash: 0, ring: 0.4 }, ease: linear }, { f: 6, p: { ...burst, flash: 0, ring: 0.72 }, ease: linear },
    { f: 7, p: { ...burst, flash: 0, ring: 0.95, souls: 0.7 }, ease: linear },
    { f: 8, p: { ...burst, flash: 0, ring: 0, souls: 0.3, bob: 2 * PXM }, ease: linear },
    { f: 11, p: { crownFire: 0 }, ease: easeInOut },
  ];
  const poses = keyed(R0, keys, 12, 1100);
  poses.forEach((p, i) => { p.soulPh = i * 0.25; p.wave = i / 12; });
  poses[4].flashAt = add(bodyShift(view, poses[4]), [0, 3, 31]);
  return poses;
}
/**
 * Гибель: отшатнулся (кадр 2), пламя вспыхнуло и погасло; посох выпал и лёг за спину наискось; тело уходит в рясу,
 * ряса и плащ оседают грудой; череп падает на груду, корона — рядом на землю; рёбра и глаза гаснут, кость и железо
 * выцветают в пепел, вверх уходят бирюзовые огоньки. Всё лёгшее — внутри кадра.
 */
function deathPoses(view: View): Pose[] {
  const R0 = restOf(view);
  const Wv = (v: V3): V3 => fromView(view, v);
  const fall = staffAt(Wv([-12, -3, 0]), Wv([0.55, -0.45, 0.7]), R0.sg);
  const lying = staffAt(Wv([-20, -2, 1.0]), Wv([0.7, -0.71, 0.02]), R0.sg);
  const recoil: Partial<Pose> = { pitch: -0.16, hp: -0.36, bob: 1 * PXM, flame: 2.2, glow: 1.6, hand: [R0.hand[0], view === "side" ? [-5.5, 6, 40] : [-12.5, 2.5, 40]] };
  const stagger: Partial<Pose> = { ...recoil, pitch: 0.12, hp: 0.12, bob: 0, flame: 0.5, glow: 1.0 };
  const keys: Key[] = [
    { f: 0, p: { glow: 1.2 } }, { f: 1, p: recoil, ease: easeOut }, { f: 2, p: stagger, ease: easeInOut },
    { f: 3, p: { ...stagger, held: 0, stf: fall, flame: 0, glow: 0.8, sink: 3, collapse: 0.08, wither: 0.1, pitch: 0.2 }, ease: easeIn },
    { f: 4, p: { ...stagger, held: 0, stf: lying, flame: 0, glow: 0.6, sink: 8, collapse: 0.25, wither: 0.25, pitch: 0.26, dust: [0.9, 0.9] }, ease: easeIn },
    { f: 5, p: { ...stagger, held: 0, stf: lying, flame: 0, glow: 0.4, sink: 14, collapse: 0.45, wither: 0.4, headOff: 0.2, crownOff: 0.22, wisps: 0.1, dust: [0.5, 0.5] }, ease: linear },
    { f: 6, p: { ...stagger, held: 0, stf: lying, flame: 0, glow: 0.25, sink: 21, collapse: 0.65, wither: 0.55, headOff: 0.5, crownOff: 0.55, wisps: 0.22 }, ease: linear },
    { f: 7, p: { ...stagger, held: 0, stf: lying, flame: 0, glow: 0.15, sink: 28, collapse: 0.82, wither: 0.65, headOff: 0.8, crownOff: 0.85, wisps: 0.36 }, ease: linear },
    { f: 8, p: { ...stagger, held: 0, stf: lying, flame: 0, glow: 0.05, sink: 36, collapse: 0.95, wither: 0.75, headOff: 1, crownOff: 1, wisps: 0.5, dust: [0.8, 0.8] }, ease: linear },
    { f: 10, p: { ...stagger, held: 0, stf: lying, flame: 0, glow: 0, sink: 44, collapse: 1, wither: 0.9, headOff: 1, crownOff: 1, wisps: 0.78, dust: [0, 0] }, ease: easeOut },
    { f: 13, p: { ...stagger, held: 0, stf: lying, flame: 0, glow: 0, sink: 44, collapse: 1, wither: 1, headOff: 1, crownOff: 1, wisps: 1, dust: [0, 0] }, ease: easeOut },
  ];
  const poses = keyed(R0, keys, 14, 1300);
  for (let i = 3; i < 14; i++) { poses[i].held = 0; if (i >= 4) poses[i].stf = lying; }
  return poses;
}

export type LichAnim = "idle" | "walk" | "attack" | "sealWind" | "sealHold" | "seal" | "wispWind" | "wispHold" | "wispCast"
  | "callWind" | "callHold" | "call" | "stun" | "phase" | "death";
type AnimDef = { col: number; n: number; fps: number; loop: boolean; ru: string; next?: LichAnim; hit?: number };
const ANIM_ORDER: [LichAnim, Omit<AnimDef, "col">][] = [
  ["idle", { n: 12, fps: 12, loop: true, ru: "покой" }],
  ["walk", { n: 12, fps: 12, loop: true, ru: "ходьба" }],
  ["attack", { n: 11, fps: 15, loop: false, ru: "атака посохом", hit: 6 }],
  ["sealWind", { n: 4, fps: 12, loop: false, ru: "замах печати", next: "sealHold" }],
  ["sealHold", { n: 4, fps: 12, loop: true, ru: "удержание печати", next: "seal" }],
  ["seal", { n: 10, fps: 12, loop: false, ru: "печать склепа", hit: 2 }],
  ["wispWind", { n: 4, fps: 12, loop: false, ru: "замах огней", next: "wispHold" }],
  ["wispHold", { n: 4, fps: 12, loop: true, ru: "удержание огней", next: "wispCast" }],
  ["wispCast", { n: 8, fps: 12, loop: false, ru: "блуждающие огни", hit: 2 }],
  ["callWind", { n: 4, fps: 12, loop: false, ru: "замах зова", next: "callHold" }],
  ["callHold", { n: 6, fps: 12, loop: true, ru: "каст зова", next: "call" }],
  ["call", { n: 10, fps: 12, loop: false, ru: "зов мёртвой короны", hit: 3 }],
  ["stun", { n: 8, fps: 10, loop: true, ru: "оглушение" }],
  ["phase", { n: 12, fps: 12, loop: false, ru: "переход фазы", hit: 4 }],
  ["death", { n: 14, fps: 12, loop: false, ru: "гибель" }],
];
export const LICH_ANIMS = {} as Record<LichAnim, AnimDef>;
{
  let col = 0;
  for (const [k, a] of ANIM_ORDER) { LICH_ANIMS[k] = { ...a, col }; col += a.n; }
}
export const LICH_COLS = ANIM_ORDER.reduce((s, [, a]) => s + a.n, 0);
/** Умения карточки → связки анимаций и эффекты мира (кадр hit — ровно в конце предупреждения). */
export const LICH_SKILLS: Record<string, { windup: [LichAnim, LichAnim]; strike: LichAnim; fx?: "seal" | "wisp" | "pillar" }> = {
  crypt_seal: { windup: ["sealWind", "sealHold"], strike: "seal", fx: "seal" },
  wandering_fires: { windup: ["wispWind", "wispHold"], strike: "wispCast", fx: "wisp" },
  dead_crown_call: { windup: ["callWind", "callHold"], strike: "call", fx: "pillar" },
};
const POSES: Record<LichAnim, (v: View) => Pose[]> = {
  idle: (v) => idlePoses(v), walk: (v) => walkPoses(v), attack: attackPoses,
  sealWind: (v) => { const { R0, wind } = sealKeys(v); return windPoses(R0, wind, 500); },
  sealHold: (v) => { const { R0, wind } = sealKeys(v); return holdPoses(R0, wind, 520, 4, (i) => ({ armLift: [TREMBLE[i], 0], charge: [1, 1.2, 1, 1.2][i], glow: [1.3, 1.5, 1.35, 1.5][i], crownFire: 0.4, wave: i / 4, waveAmp: 1 })); },
  seal: sealPoses,
  wispWind: (v) => { const { R0, wind } = wispKeys(v); return windPoses(R0, wind, 700).map((p, i) => ({ ...p, flame: [1, 1.3, 1.6, 1.9][i] })); },
  wispHold: (v) => { const { R0, wind } = wispKeys(v); return holdPoses(R0, wind, 720, 4, (i) => ({ armLift: [0, TREMBLE[i]], flame: [1.9, 2.15, 2.0, 2.2][i], glow: [1.3, 1.5, 1.35, 1.5][i] })); },
  wispCast: wispCastPoses,
  callWind: (v) => { const { R0, wind } = callKeys(v); return windPoses(R0, wind, 900).map((p, i) => ({ ...p, souls: [0, 0.35, 0.7, 1][i], soulPh: i * 0.17, crownFire: [0.1, 0.4, 0.7, 1][i] })); },
  callHold: (v) => { const { R0, wind } = callKeys(v); return holdPoses(R0, wind, 920, 6, (i) => ({ soulPh: i / 6, armLift: [[0, 1, 1, 0, -1, -1][i], [0, 0, 1, 1, 0, 0][i]], glow: 1.45 + 0.15 * Math.sin((i / 6) * TAU), wave: i / 6, waveAmp: 1.5 })); },
  call: callStrikePoses,
  stun: stunPoses, phase: phasePoses, death: deathPoses,
};

// ---------------- эффекты мира (2D, кадры отдельными листами: строка 0 — под юнитами, 1 — над) ----------------
interface FxDef { w: number; h: number; ax: number; ay: number; n: number; fps: number; hit: number }
export const FX: Record<"seal" | "wisp" | "pillar", FxDef> = {
  seal: { w: 112, h: 128, ax: 56, ay: 84, n: 16, fps: 12, hit: 3 },
  wisp: { w: 80, h: 112, ax: 40, ay: 92, n: 14, fps: 12, hit: 3 },
  pillar: { w: 64, h: 128, ax: 32, ay: 112, n: 14, fps: 12, hit: 3 },
};
/** Знаки печати: 3×4. */
const RUNES = [["#.#", "###", ".#.", ".#."], ["##.", "#.#", "##.", "#.."], [".#.", "###", "#.#", "#.#"], ["#..", "##.", "#.#", "###"], ["###", "#..", "##.", "#.."], ["#.#", ".#.", "#.#", "..#"]];
type Plot = (x: number, y: number, c: RGBA) => void;
function ringArc(plot: Plot, cx: number, cy: number, r: number, a0: number, a1: number, c: RGBA, w = 1) {
  const steps = Math.ceil(r * (a1 - a0) * 1.6) + 1;
  for (let s = 0; s <= steps; s++) {
    const a = lerp(a0, a1, s / steps);
    for (let k = 0; k < w; k++) plot(Math.round(cx + Math.cos(a) * (r - k)), Math.round(cy + Math.sin(a) * (r - k)), c);
  }
}
function disc(plot: Plot, cx: number, cy: number, r: number, c: (d: number) => RGBA | null) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d > 1) continue;
    const q = c(d);
    if (q) plot(x, y, q);
  }
}
const plotOf = (c: PC): Plot => (x, y, col) => c.set(x, y, col);
/** Эмбер: искра поднимается и гаснет; t 0..1. */
function ember(plot: Plot, x0: number, y0: number, t: number, seed: number, ramp: Ramp, rise = 18) {
  if (t <= 0 || t >= 1) return;
  const x = x0 + Math.sin(seed + t * 5) * 2.5, y = y0 - rise * easeOut(t);
  plot(Math.round(x), Math.round(y), ramp[t < 0.4 ? 4 : t < 0.75 ? 3 : 2]);
  if (t < 0.6) plot(Math.round(x), Math.round(y) + 1, ramp[1]);
}
/**
 * «Печать склепа» (share, лист 112×128, центр метки — (56, 84), радиус печати 40): кадры 0–2 — круг и шесть знаков
 * прочерчиваются по земле, сверху падает звезда душ; кадр hit (3) — столб бирюзового огня бьёт в печать; 4–7 — столб
 * сужается и уходит вверх, по кругу бежит стена огня, разлетаются искры; 8–15 — печать гаснет ступенями, тлеет и уходит.
 */
function buildSealFx(): PC {
  const F = FX.seal;
  const out = new PC(F.w * F.n, F.h * 2);
  const R0 = 40;
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    // печать: круг прочерчивается (easeOut), знаки — по очереди; после удара гаснет ступенями
    const draw = i <= 2 ? easeOut((i + 1) / 3) : 1;
    const lvl = i <= 2 ? 2 : i <= 7 ? 3 : i <= 10 ? 2 : i <= 13 ? 1 : 0;
    if (lvl > 0) {
      const a0 = -Math.PI / 2;
      ringArc(pb, cx, cy, R0, a0, a0 + TAU * draw, SOUL[lvl], 2);
      ringArc(pb, cx, cy, R0 - 6, a0 + Math.PI, a0 + Math.PI - TAU * draw, SOUL[Math.max(1, lvl - 1)], 1);
      ringArc(pb, cx, cy, 13, 0, TAU * draw, SOUL[lvl], 1);
      for (let k = 0; k < 6; k++) {
        if (k / 6 > draw * 1.05) continue;
        const a = a0 + (k / 6) * TAU + (i > 2 ? (i - 3) * 0.03 : 0);
        const rx = Math.round(cx + Math.cos(a) * (R0 - 3) - 1), ry = Math.round(cy + Math.sin(a) * (R0 - 3) - 2);
        RUNES[k].forEach((row, j) => [...row].forEach((ch, x) => { if (ch === "#") pb(rx + x, ry + j, SOUL[Math.min(4, lvl + 1)]); }));
        // лучи-спицы от малого круга к знакам
        if (lvl >= 2) for (let s = 15; s < R0 - 8; s += 2) pb(Math.round(cx + Math.cos(a) * s), Math.round(cy + Math.sin(a) * s), SOUL[lvl - 1]);
      }
    }
    // выжженная земля под печатью после удара
    if (i >= 3 && i <= 14) disc(pb, cx, cy, 11 + 2 * Math.min(1, (i - 3) / 3), (d) => (d > 0.85 ? null : [10, 22, 18, Math.round(150 * (1 - (i - 3) / 12))]));
    // звезда душ падает (до удара)
    if (i <= 2) {
      const y = lerp(6, cy - 10, easeIn((i + 1) / 3.2));
      for (let s = 0; s < 14 + i * 6; s++) pf(cx, Math.round(y - 3 - s), FLAME[s < 4 ? 3 : s < 10 ? 2 : 1]);
      disc(pf, cx, y, 2.5 + i * 0.8, (d) => (d < 0.45 ? FLAME[4] : FLAME[3]));
    }
    // столб огня: кадр удара — во весь рост; затем сужается, низ уходит вверх
    if (i >= 3 && i <= 8) {
      const k = (i - 3) / 5;
      const w = lerp(13, 2, easeIn(k)), bot = lerp(cy + 2, cy - 54, easeIn(k)), top = 3;
      for (let y = top; y <= bot; y++) {
        const v = (bot - y) / Math.max(1, bot - top);
        const ww = w * (0.75 + 0.25 * Math.sin(v * 9 + i * 1.7)) * (y < top + 6 ? (y - top + 1) / 7 : 1);
        for (let x = Math.floor(cx - ww); x <= cx + ww; x++) {
          const u = Math.abs(x + 0.5 - cx) / Math.max(0.5, ww);
          pf(x, y, FLAME[u < 0.35 ? 4 : u < 0.7 ? 3 : 2]);
        }
      }
      if (i === 3) disc(pf, cx, cy, 15, (d) => (d < 0.4 ? FLAME[4] : d < 0.75 ? FLAME[3] : SOUL[3]));
    }
    // стена огня по кругу: языки бегут от центра к краю печати (easeOut), гаснут
    if (i >= 3 && i <= 11) {
      const k = (i - 3) / 8;
      const r = lerp(14, R0, easeOut(Math.min(1, k * 1.6)));
      const hgt = Math.max(0, 1 - k) * 1.2;
      for (let s = 0; s < 18; s++) {
        const a = (s / 18) * TAU + 0.2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (hgt > 0.08) flamePx([x, y], hgt * (0.7 + 0.3 * hash01(s, 1, 5)), i / 4 + s * 0.13, s, FLAME, Math.sin(a) < 0 ? pb : pf);
      }
    }
    // искры: от удара по дугам вверх
    if (i >= 3) for (let s = 0; s < 14; s++) {
      const t = (i - 3 - hash01(s, 2, 7) * 2) / 7;
      const a = (s / 14) * TAU;
      ember(pf, cx + Math.cos(a) * (8 + 26 * easeOut(clamp(t, 0, 1))), cy + Math.sin(a) * (6 + 20 * easeOut(clamp(t, 0, 1))), t, s, FLAME, 14);
    }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/**
 * «Блуждающий огонь» (метка на каждом, лист 80×112, центр — (40, 92)): кадры 0–2 — огненный шар падает сверху наискось
 * с хвостом, на земле растёт отсвет; кадр hit (3) — удар: вспышка, всплеск языков; 4–8 — языки опадают, волна по земле
 * расходится; 9–13 — искры, тлеющее пятно гаснет.
 */
function buildWispFx(): PC {
  const F = FX.wisp;
  const out = new PC(F.w * F.n, F.h * 2);
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    if (i <= 2) {
      const e = easeIn((i + 1) / 3.3);
      const x = lerp(cx + 26, cx + 3, e), y = lerp(8, cy - 6, e);
      // отсвет на земле
      disc(pb, cx, cy, 4 + 5 * e, (d) => (d < 0.5 ? [38, 199, 159, 90] : [38, 199, 159, 45]));
      // хвост: вдоль пути, сужается
      for (let s = 0; s < 22; s++) {
        const u = s / 22;
        const tx = x + (26 * u) * 0.9, ty = y - (cy - 14) * u * 0.32;
        const w = 2.6 * (1 - u);
        disc(pf, tx, ty, Math.max(0.6, w), () => FLAME[u < 0.25 ? 3 : u < 0.6 ? 2 : 1]);
      }
      disc(pf, x, y, 3.6 + e, (d) => (d < 0.4 ? FLAME[4] : d < 0.75 ? FLAME[3] : FLAME[2]));
    }
    if (i === 3) {
      disc(pf, cx, cy - 4, 12, (d) => (d < 0.35 ? FLAME[4] : d < 0.7 ? FLAME[3] : SOUL[3]));
      disc(pb, cx, cy, 16, (d) => (d > 0.8 ? FLAME[2] : null));
    }
    if (i >= 3 && i <= 9) {
      const k = (i - 3) / 6;
      const h = Math.max(0, 1.6 * (1 - easeOut(k)));
      [-9, -4, 0, 5, 9].forEach((dx, s) => {
        const hh = h * (s === 2 ? 1 : 0.6 + 0.2 * hash01(s, 3, 9));
        if (hh > 0.08) flamePx([cx + dx, cy + Math.abs(dx) * 0.2], hh, i / 5 + s * 0.3, s * 2, FLAME, s === 2 ? pf : dx < 0 ? pb : pf);
      });
      const r = lerp(8, 30, easeOut(k));
      ringArc(pb, cx, cy, r, 0, TAU, SOUL[k < 0.4 ? 3 : k < 0.75 ? 2 : 1], k < 0.5 ? 2 : 1);
    }
    if (i >= 3) {
      disc(pb, cx, cy, 9, (d) => (d > 0.9 ? null : [10, 30, 26, Math.round(170 * Math.max(0, 1 - (i - 3) / 10))]));
      for (let s = 0; s < 8; s++) ember(pf, cx - 10 + 20 * hash01(s, 1, 3), cy - 2, (i - 3 - s * 0.5) / 8, s, FLAME, 26);
    }
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}
/**
 * «Столб душ» (Зов Мёртвой Короны не сорван; лист 64×128, основание — (32, 112)): кадры 0–2 — трещина в земле
 * наливается светом; кадр hit (3) — столб бирюзового огня в рост вверх, на вершине — воющий череп; 4–8 — столб колышется,
 * череп поднимается и тает ступенями; 9–13 — столб тоньше, уходит снизу вверх, искры.
 */
function buildPillarFx(): PC {
  const F = FX.pillar;
  const out = new PC(F.w * F.n, F.h * 2);
  const cracks: [number, number][][] = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.3;
    const pts: [number, number][] = [];
    let x = F.ax, y = F.ay, aa = a;
    for (let s = 0; s < 9; s++) { pts.push([Math.round(x), Math.round(y)]); aa += (hash01(k, s, 3) - 0.5) * 0.7; x += Math.cos(aa) * 1.4; y += Math.sin(aa) * 0.7; }
    cracks.push(pts);
  }
  const SKULL = ["..####..", ".######.", "##..#..#", "##..#..#".replace(/#/g, "#"), ".######.", "..#.#.#.", "..######"];
  for (let i = 0; i < F.n; i++) {
    const back = new PC(F.w, F.h), front = new PC(F.w, F.h);
    const pb = plotOf(back), pf = plotOf(front);
    const cx = F.ax, cy = F.ay;
    const crk = i <= 2 ? (i + 1) / 3 : i <= 10 ? 1 : (13 - i) / 3;
    const lv = i <= 2 ? 1 + i : i <= 8 ? 3 : i <= 11 ? 2 : 1;
    if (crk > 0) for (const pts of cracks) pts.slice(0, Math.ceil(pts.length * crk)).forEach(([x, y], s) => { pb(x, y, SOUL[Math.max(1, lv - (s > 5 ? 1 : 0))]); pb(x, y + 1, [12, 20, 16, 255]); });
    if (i >= 3 && i <= 12) {
      const k = (i - 3) / 9;
      const top = Math.round(lerp(8, 30, easeIn(k))), bot = Math.round(lerp(cy, cy - 30, easeIn(Math.max(0, k - 0.45) / 0.55)));
      const w0 = i === 3 ? 9 : lerp(7.5, 2.2, easeIn(k));
      for (let y = top; y <= bot; y++) {
        const v = (y - top) / Math.max(1, bot - top);
        const ww = w0 * (0.8 + 0.2 * Math.sin(v * 11 - i * 1.3)) * (y < top + 5 ? (y - top + 1) / 6 : 1);
        const off = Math.sin(v * 5 + i * 0.9) * 1.2;
        for (let x = Math.floor(cx - ww + off); x <= cx + ww + off; x++) {
          const u = Math.abs(x + 0.5 - cx - off) / Math.max(0.5, ww);
          pf(x, y, FLAME[u < 0.3 ? 4 : u < 0.65 ? 3 : 2]);
        }
      }
      // череп на вершине: поднимается и тает (тоны вниз), рот открыт
      if (i <= 8) {
        const sy = top - 10 - (i - 3) * 2, lvS = i <= 5 ? 4 : i <= 7 ? 3 : 2;
        SKULL.forEach((row, j) => [...row].forEach((ch, x) => { if (ch === "#") pf(cx - 4 + x, sy + j, FLAME[lvS - (j > 4 ? 1 : 0)]); }));
      }
    }
    if (i === 3) disc(pf, cx, cy - 2, 10, (d) => (d < 0.45 ? FLAME[4] : FLAME[3]));
    if (i >= 3) for (let s = 0; s < 10; s++) ember(pf, cx - 6 + 12 * hash01(s, 4, 4), cy - 10 - 40 * hash01(s, 5, 4), (i - 3 - s * 0.4) / 7, s, FLAME, 22);
    out.blit(back, i * F.w, 0);
    out.blit(front, i * F.w, F.h);
  }
  return out;
}

// ---------------- листы, проверки, монтажи ----------------
function animSheets(): { img: Record<LichAnim, PC>; emis: Record<LichAnim, PC> } {
  const img = {} as Record<LichAnim, PC>, emis = {} as Record<LichAnim, PC>;
  for (const [a, d] of ANIM_ORDER) {
    const I = new PC(N * d.n, N * 3), E = new PC(N * d.n, N * 3);
    VIEWS.forEach((v, row) => POSES[a](v).slice(0, d.n).forEach((p, i) => {
      const r = renderLich(v, p);
      I.blit(r.img, i * N, row * N);
      E.blit(r.emis, i * N, row * N);
    }));
    img[a] = I;
    emis[a] = E;
  }
  return { img, emis };
}
/** Ночь: затемнение области, светящееся — как днём, с мягким ореолом. */
function relight(c: PC, emis: PC, x: number, y: number, k: number, flip = false) {
  const big = scaleNN(emis, k, flip);
  c.blit(big, x, y);
  for (let j = 0; j < emis.h; j += 1) for (let i = 0; i < emis.w; i++) {
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
interface Assets { hero: PC; terrain: PC; golem: PC; ref: PC | null }
const GOLEM_N = 64;
function heroAt(A: Assets, row: number) { return crop(A.hero, 0, row * 32, 32, 32); }
/** Ряд сцены: герой, sol_rune_golem, лич вниз/вверх/вбок/влево (+ ночь), справа — референс той же высоты. */
function sceneRow(A: Assets, sheets: { img: Record<LichAnim, PC>; emis: Record<LichAnim, PC> }, night: boolean, W: number, k: number, withRef: boolean): Row {
  const H = 84;
  return {
    h: H * k + 40,
    draw: (c, y0) => {
      text(c, `×${k} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ 32 · РУНОЛИТ 64 · ВЕДРАС 80 · ВНИЗ · ВВЕРХ · ВБОК · ВЛЕВО${withRef ? " | РЕФЕРЕНС 01" : ""}`, 16, y0 + 8);
      const y = y0 + 34;
      const wGround = 30 * k + 66 * k + 82 * 4 * k + 30 * k + 40;
      groundBg(c, A.terrain, 16, y, wGround, H * k, k, "grass");
      const yb = y + (H - 2) * k;
      const items: { img: PC; emis: PC | null; flip?: boolean; w: number; feet: number }[] = [
        { img: heroAt(A, 0), emis: null, w: 30, feet: 30.4 },
        { img: crop(A.golem, 0, 0, GOLEM_N, GOLEM_N), emis: null, w: 66, feet: 60 },
      ];
      const fr = (row: number) => crop(sheets.img.idle, 0, row * N, N, N), fe = (row: number) => crop(sheets.emis.idle, 0, row * N, N, N);
      items.push({ img: fr(0), emis: fe(0), w: 82, feet: CAM.GY }, { img: fr(1), emis: fe(1), w: 82, feet: CAM.GY }, { img: fr(2), emis: fe(2), w: 82, feet: CAM.GY }, { img: fr(2), emis: fe(2), flip: true, w: 82, feet: CAM.GY });
      items.push({ img: heroAt(A, 2), emis: null, w: 30, feet: 30.4 });
      let x = 28;
      const pos: [number, number][] = [];
      for (const it of items) {
        const top = Math.round(yb - it.feet * k);
        shadowBlob(c, x + (it.img.w / 2) * k, yb - 0.5 * k, Math.min(18, (it.img.w / 32) * 6.5) * k, 2.4 * k);
        c.blit(scaleNN(it.img, k, it.flip), x, top);
        pos.push([x, top]);
        x += it.w * k;
      }
      if (night) {
        nightRect(c, 16, y, wGround, H * k);
        items.forEach((it, i) => it.emis && relight(c, it.emis, pos[i][0], pos[i][1], k, it.flip));
      }
      if (withRef && A.ref) {
        const rs = scaleBox(A.ref, H * k, H * k);
        const rx = 16 + wGround + 20;
        fill(c, rx - 10, y, 4, H * k, [240, 232, 214, 255]);
        c.blit(rs, rx, y);
      }
      void W;
    },
  };
}
function animRow(a: LichAnim, sheets: { img: Record<LichAnim, PC>; emis: Record<LichAnim, PC> }, A: Assets, W: number, night = false): Row {
  const d = LICH_ANIMS[a];
  const k = 2;
  return {
    h: N * k * 2 + 44,
    draw: (c, y0) => {
      text(c, `×2 · ${d.ru} · ${d.n} КАДРОВ · ${d.fps} К/С${d.loop ? " · ПО КРУГУ" : ""}${d.next ? ` · → ${LICH_ANIMS[d.next].ru}` : ""}${d.hit !== undefined ? ` · УДАР — КАДР ${d.hit + 1}` : ""}${night ? " · НОЧЬ" : ""}`, 16, y0 + 8);
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
          shadowBlob(c, x + 40 * k, y + 74 * k, 18 * k, 4.6 * k);
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
/** «Наш | референс»: лич вниз и вбок ×5 (покой, кадр 1), рядом образец 01 той же высоты; ниже — то же ночью. */
function buildCompare(sheets: { img: Record<LichAnim, PC>; emis: Record<LichAnim, PC> }, A: Assets): PC {
  const k = 5;
  const H = N * k;
  const W = 24 + 2 * N * k + 16 + 40 + H + 24;
  const c = new PC(W, 2 * (H + 60) + 20);
  fill(c, 0, 0, c.w, c.h, [30, 28, 34, 255]);
  for (const night of [false, true]) {
    const y = 48 + (night ? H + 70 : 0);
    text(c, night ? "НАШ · НОЧЬ" : "НАШ · ДЕНЬ", 24, y - 36, 3);
    text(c, "РЕФЕРЕНС 01", 24 + 2 * N * k + 56, y - 36, 3);
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
/** Референс JPG → PNG 512 (в tools/out, не в git): через System.Drawing, если ещё нет. */
function ensureRef(root: string): PC | null {
  const png = path.join(root, "tools", "out", "bosses139", "ref-01.png");
  const jpg = path.join(root, "tools", "out", "refs", "bosses-139", "01.jpg");
  if (!fs.existsSync(png) && fs.existsSync(jpg) && process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Drawing; $s=[System.Drawing.Image]::FromFile('${jpg}'); $b=New-Object System.Drawing.Bitmap 512,512; $g=[System.Drawing.Graphics]::FromImage($b); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($s,0,0,512,512); $b.Save('${png}',[System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose(); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  return fs.existsSync(png) ? loadPC(png) : null;
}

/** Карточка умений для просмотра (тайминги — docs/bosses-139.md, пилот). */
const SKILLS = [
  { id: "crypt_seal", name: "Печать склепа", windupMs: 2000, r: 56, kind: "share" },
  { id: "wandering_fires", name: "Блуждающие огни", windupMs: 850, r: 36, kind: "all" },
  { id: "dead_crown_call", name: "Зов Мёртвой Короны", windupMs: 5000, r: 0, kind: "break" },
];
function buildHtml(sheet: PC, glow: PC, fx: Record<string, PC>, A: Assets): string {
  const grounds = (["grass", "dirt"] as const).map((g) => pngDataUrl(crop(A.terrain, 14 * 32, (g === "grass" ? 6 : 5) * 32, 128, 32)));
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ведрас Неугасимый</title>
<style>
:root { --bg: #15161b; --fg: #e8ecdf; --dim: #a9b2a4; --line: #3c4a48; --acc: #6fe0b4; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, "Segoe UI", sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 20px 0 6px; }
p { color: var(--dim); margin: 0 0 12px; max-width: 920px; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; align-items: center; }
button { background: #222a2a; color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 12px; font: inherit; cursor: pointer; }
button.on { border-color: var(--acc); color: var(--acc); }
.stage { display: flex; flex-wrap: wrap; gap: 12px; }
canvas { image-rendering: pixelated; border-radius: 6px; max-width: 100%; }
label { color: var(--dim); }
</style>
</head>
<body>
<h1>Ведрас Неугасимый — Лич Грозового хребта</h1>
<p>Кадр 80×80, рядом герой 32×32 и Рунолит 64×64; масштаб игры. Вниз, вверх, вбок, влево (отражение). Ночью светится то, что в листе свечения (кристалл, рёбра, глаза, пламя, души).</p>
<div class="bar" id="anims"></div>
<div class="bar">
<label><input type="radio" name="z" value="2"> ×2</label><label><input type="radio" name="z" value="3" checked> ×3</label>
<label><input type="radio" name="g" value="0" checked> трава</label><label><input type="radio" name="g" value="1"> земля</label>
<label><input type="checkbox" id="night"> ночь</label>
</div>
<div class="stage" id="stage"></div>
<h2>Умения по таймингам карточки</h2>
<p>Метки рисует клиент: «Печать склепа» — общий круг на танке (урон делится на всех в круге, счётчик героев), «Блуждающие огни» — круг под каждым (разойтись), «Зов Мёртвой Короны» — каст 5 с с полосой; «сорвать» — группа сняла 6 % здоровья: лич оглушён 3 с. Не сорван — столбы душ по всей арене.</p>
<div class="bar" id="skills"></div>
<canvas id="arena"></canvas>
<script>
const N = ${N};
const ANIMS = ${JSON.stringify(LICH_ANIMS)};
const FX = ${JSON.stringify(FX)};
const SKILLS = ${JSON.stringify(SKILLS.map((s) => ({ ...s, ...LICH_SKILLS[s.id] })))};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const sheet = img("${pngDataUrl(sheet)}"), glow = img("${pngDataUrl(glow)}"), hero = img("${pngDataUrl(A.hero)}"), golem = img("${pngDataUrl(crop(A.golem, 0, 0, 12 * 64, 192))}");
const fxImg = { seal: img("${pngDataUrl(fx.seal)}"), wisp: img("${pngDataUrl(fx.wisp)}"), pillar: img("${pngDataUrl(fx.pillar)}") };
const grounds = [img("${grounds[0]}"), img("${grounds[1]}")];
let anim = "idle", zoom = 3, ground = 0, frame = 0, last = 0, held = 0, night = false;
const views = [["вниз", 0, false], ["вверх", 1, false], ["вбок", 2, false], ["влево", 2, true]];
const bar = document.getElementById("anims");
for (const k of Object.keys(ANIMS)) {
  const b = document.createElement("button");
  b.textContent = ANIMS[k].ru + " · " + ANIMS[k].n + " · " + ANIMS[k].fps + " к/с";
  b.onclick = () => { anim = k; frame = 0; held = 0; [...bar.children].forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
  if (k === anim) b.classList.add("on");
  bar.appendChild(b);
}
document.querySelectorAll("input[name=z]").forEach((r) => r.onchange = () => { zoom = +r.value; build(); });
document.querySelectorAll("input[name=g]").forEach((r) => r.onchange = () => { ground = +r.value; });
document.getElementById("night").onchange = (e) => { night = e.target.checked; };
let canvases = [];
function build() {
  const st = document.getElementById("stage"); st.innerHTML = ""; canvases = [];
  for (const v of views) { const c = document.createElement("canvas"); c.width = 196 * zoom; c.height = 86 * zoom; st.appendChild(c); canvases.push([c, v]); }
  const a = document.getElementById("arena"); a.width = 420 * zoom; a.height = 250 * zoom;
}
build();
function paintGround(g, w, h) { for (let y = 0; y < h; y += 32 * zoom) for (let x = 0; x < w; x += 32 * zoom) g.drawImage(grounds[ground], ((x / zoom / 32 + y / zoom / 32) % 4) * 32, 0, 32, 32, x, y, 32 * zoom, 32 * zoom); }
function shadow(g, x, y, rx, ry) { g.fillStyle = "rgba(10,20,8,.35)"; g.beginPath(); g.ellipse(x * zoom, y * zoom, rx * zoom, ry * zoom, 0, 0, 7); g.fill(); }
function spr(g, src, sx, sy, sw, sh, dx, dy, flip) {
  g.save();
  if (flip) { g.translate((dx + sw) * zoom, dy * zoom); g.scale(-1, 1); } else g.translate(dx * zoom, dy * zoom);
  g.drawImage(src, sx, sy, sw, sh, 0, 0, sw * zoom, sh * zoom);
  g.restore();
}
const glows = [];
function boss(g, col, row, flip, bx, by) { spr(g, sheet, col * N, row * N, N, N, bx, by, flip); glows.push([col, row, flip, bx, by]); }
function darken(g, w, h) {
  if (!night) { glows.length = 0; return; }
  g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = "rgb(77,92,153)"; g.fillRect(0, 0, w, h); g.restore();
  for (const [col, row, flip, bx, by] of glows) {
    spr(g, glow, col * N, row * N, N, N, bx, by, flip);
    g.save(); g.globalCompositeOperation = "lighter"; g.filter = "blur(" + (3 * zoom) + "px)"; g.globalAlpha = 0.55; spr(g, glow, col * N, row * N, N, N, bx, by, flip); g.restore();
  }
  glows.length = 0;
}
function draw() {
  const A = ANIMS[anim];
  for (const [c, [name, row, flip]] of canvases) {
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    paintGround(g, c.width, c.height);
    shadow(g, 18, 80, 7, 2.4); spr(g, hero, 0, row === 1 ? 32 : row === 2 ? 64 : 0, 32, 32, 2, 50, false);
    shadow(g, 66, 80, 15, 4.5); spr(g, golem, 0, row * 64, 64, 64, 34, 18, false);
    shadow(g, 146, 79, 18, 4.6); boss(g, A.col + frame, row, flip, 106, 4);
    darken(g, c.width, c.height);
    g.fillStyle = "#e8ecdf"; g.font = (6 * zoom) + "px system-ui"; g.fillText(name, 4 * zoom, 10 * zoom);
  }
}
const sbar = document.getElementById("skills");
let skill = null, t0 = 0, broken = false;
for (const s of SKILLS) {
  const b = document.createElement("button"); b.textContent = s.name + " · замах " + (s.windupMs / 1000).toFixed(2).replace(".", ",") + " с";
  b.onclick = () => { skill = s; t0 = performance.now(); broken = false; }; sbar.appendChild(b);
}
{ const b = document.createElement("button"); b.textContent = "сорвать зов"; b.onclick = () => { if (skill && skill.kind === "break") broken = true; }; sbar.appendChild(b); }
for (const [k, ru] of [["phase", "переход фазы"], ["death", "гибель"]]) { const b = document.createElement("button"); b.textContent = ru; b.onclick = () => { skill = { kind: "anim", anim: k }; t0 = performance.now(); }; sbar.appendChild(b); }
function frameAt(s, t) {
  if (s.kind === "anim") { const A = ANIMS[s.anim]; return A.col + Math.min(A.n - 1, Math.floor(t / 1000 * A.fps)); }
  if (s.kind === "break" && broken) { const St = ANIMS.stun; return St.col + Math.floor(t / 1000 * St.fps) % St.n; }
  const W = ANIMS[s.windup[0]], Hd = ANIMS[s.windup[1]], St = ANIMS[s.strike];
  const strikeAt = s.windupMs - (St.hit / St.fps) * 1000;
  if (t < 0) return ANIMS.idle.col;
  if (t < Math.min(strikeAt, (W.n / W.fps) * 1000)) return W.col + Math.min(W.n - 1, Math.floor((t / 1000) * W.fps));
  if (t < strikeAt) return Hd.col + (Math.floor(((t - (W.n / W.fps) * 1000) / 1000) * Hd.fps) % Hd.n);
  const k = Math.floor(((t - strikeAt) / 1000) * St.fps);
  return k < St.n ? St.col + k : ANIMS.idle.col + (Math.floor((t / 1000) * 12) % 12);
}
function fxAt(F, t, s) { const k = Math.floor(((t - s.windupMs) / 1000) * F.fps) + F.hit; return k >= 0 && k < F.n ? k : -1; }
function tele(g, path, col) { g.fillStyle = col || "rgba(60,200,120,.22)"; g.strokeStyle = "#3dca46"; g.lineWidth = zoom; g.beginPath(); path(); g.fill(); g.stroke(); }
function drawArena(ts) {
  const a = document.getElementById("arena"), g = a.getContext("2d"); g.imageSmoothingEnabled = false;
  paintGround(g, a.width, a.height);
  const bx = 170, by = 40, foot = [bx + 40, by + 75];
  const t = skill ? ts - t0 : -1;
  const heroes = [[foot[0] + 4, foot[1] + 42], [foot[0] - 120, foot[1] + 60], [foot[0] + 118, foot[1] + 40], [foot[0] - 30, foot[1] + 92]];
  const live = skill && skill.kind !== "anim" && t >= 0 && t < skill.windupMs && !(skill.kind === "break" && broken);
  if (live && skill.kind === "share") { tele(g, () => g.arc(heroes[0][0] * zoom, heroes[0][1] * zoom, skill.r * zoom, 0, 7)); const n = heroes.filter((h) => Math.hypot(h[0] - heroes[0][0], h[1] - heroes[0][1]) < skill.r).length; g.fillStyle = "#e8ffda"; g.font = (10 * zoom) + "px system-ui"; g.fillText("×" + n, (heroes[0][0] - 6) * zoom, (heroes[0][1] - 40) * zoom); }
  if (live && skill.kind === "all") for (const h of heroes) tele(g, () => g.arc(h[0] * zoom, h[1] * zoom, skill.r * zoom, 0, 7));
  if (live && skill.kind === "break") { g.fillStyle = "rgba(20,30,24,.8)"; g.fillRect((foot[0] - 50) * zoom, (by - 14) * zoom, 100 * zoom, 7 * zoom); g.fillStyle = "#3dca46"; g.fillRect((foot[0] - 50) * zoom, (by - 14) * zoom, 100 * zoom * (t / skill.windupMs), 7 * zoom); tele(g, () => g.rect(0, 0, a.width, a.height), "rgba(60,200,120,.08)"); }
  const fxLayer = (row) => {
    if (!skill || skill.kind === "anim") return;
    if (skill.fx === "seal") { const F = FX.seal, k = fxAt(F, t, skill); if (k >= 0) g.drawImage(fxImg.seal, k * F.w, row * F.h, F.w, F.h, (heroes[0][0] - F.ax) * zoom, (heroes[0][1] - F.ay) * zoom, F.w * zoom, F.h * zoom); }
    if (skill.fx === "wisp") { const F = FX.wisp, k = fxAt(F, t, skill); if (k >= 0) for (const h of heroes) g.drawImage(fxImg.wisp, k * F.w, row * F.h, F.w, F.h, (h[0] - F.ax) * zoom, (h[1] - F.ay) * zoom, F.w * zoom, F.h * zoom); }
    if (skill.fx === "pillar" && !broken) { const F = FX.pillar; const pts = [[60, 120], [130, 200], [250, 90], [330, 190], [380, 110], [200, 230], [40, 220]]; pts.forEach((p, j) => { const k = fxAt(F, t - j * 90, skill); if (k >= 0) g.drawImage(fxImg.pillar, k * F.w, row * F.h, F.w, F.h, (p[0] - F.ax) * zoom, (p[1] - F.ay) * zoom, F.w * zoom, F.h * zoom); }); }
  };
  fxLayer(0);
  shadow(g, foot[0], foot[1], 18, 4.6);
  boss(g, skill ? frameAt(skill, t) : ANIMS.idle.col + (Math.floor(ts / 1000 * 12) % 12), 0, false, bx, by);
  for (const h of heroes) { shadow(g, h[0], h[1], 7, 2.4); g.drawImage(hero, 0, 0, 32, 32, (h[0] - 16) * zoom, (h[1] - 30) * zoom, 32 * zoom, 32 * zoom); }
  fxLayer(1);
  darken(g, a.width, a.height);
  if (skill && t > (skill.windupMs || 1500) + 3200) skill = null;
}
requestAnimationFrame(function loop(ts) {
  const A = ANIMS[anim];
  if (ts - last >= 1000 / A.fps) { last = ts; if (frame < A.n - 1) frame++; else if (A.loop) frame = 0; else if (++held > A.fps) { held = 0; frame = 0; } }
  draw(); drawArena(ts);
  requestAnimationFrame(loop);
});
</script>
</body>
</html>
`;
}

export function writeLichArt(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = (c: PC, name: string) => { const f = path.join(outDir, name); c.save(f); files.push(f); return c; };
  const only = process.env.LICH_ONLY?.split(",") as LichAnim[] | undefined;
  const sheets = animSheets();
  const sheet = new PC(N * LICH_COLS, N * 3), glow = new PC(N * LICH_COLS, N * 3);
  for (const [a] of ANIM_ORDER) { sheet.blit(sheets.img[a], LICH_ANIMS[a].col * N, 0); glow.blit(sheets.emis[a], LICH_ANIMS[a].col * N, 0); }
  save(sheet, "lich-sheet.png");
  save(glow, "lich-glow.png");
  const fx = { seal: save(buildSealFx(), "lich-fx-seal.png"), wisp: save(buildWispFx(), "lich-fx-wisp.png"), pillar: save(buildPillarFx(), "lich-fx-pillar.png") };
  // проверки кадров: край — только контур, нет дыр-проколов, нет линий в 1 px; доля контура
  const rows = ["вниз", "вверх", "вбок"];
  const bad = [
    ...frameEdgeCuts(sheet, N, OUT, "лист", rows),
    ...frameHoles(sheet, N, "лист", rows, 3),
  ];
  const st = outlineStats(sheet, N);
  console.log(`  ${ID}: ${LICH_COLS} кадров × 3 вида; контур — до ${(st.worstRatio * 100).toFixed(1)} % кадра, толще 1 px: ${st.thick}`);
  if (bad.length) { console.warn(`  проверки: ${bad.length}\n${bad.slice(0, 30).map((s) => "    " + s).join("\n")}`); process.exitCode = 1; }
  else console.log("  проверки: край кадра чист, проколов нет");
  const A: Assets = {
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
    golem: loadPC(path.join(root, "client", "public", "assets", "units", "sol_rune_golem.png")),
    ref: ensureRef(root),
  };
  const W = 2560;
  const rowsP: Row[] = [sceneRow(A, sheets, false, W, 3, true), sceneRow(A, sheets, true, W, 3, true)];
  for (const [a] of ANIM_ORDER) if (!only || only.includes(a)) rowsP.push(animRow(a, sheets, A, W));
  for (const a of ["idle", "callHold", "wispHold"] as LichAnim[]) rowsP.push(animRow(a, sheets, A, W, true));
  rowsP.push(fxRow(`×2 · ЭФФЕКТ МИРА · ПЕЧАТЬ СКЛЕПА · ${FX.seal.n} КАДРОВ · ${FX.seal.fps} К/С · УДАР — КАДР ${FX.seal.hit + 1}`, fx.seal, FX.seal, A, W, 92));
  rowsP.push(fxRow(`×2 · ЭФФЕКТ МИРА · БЛУЖДАЮЩИЙ ОГОНЬ · ${FX.wisp.n} КАДРОВ · ${FX.wisp.fps} К/С · УДАР — КАДР ${FX.wisp.hit + 1}`, fx.wisp, FX.wisp, A, W, 80));
  rowsP.push(fxRow(`×2 · ЭФФЕКТ МИРА · СТОЛБ ДУШ · ${FX.pillar.n} КАДРОВ · ${FX.pillar.fps} К/С · УДАР — КАДР ${FX.pillar.hit + 1}`, fx.pillar, FX.pillar, A, W, 64));
  save(stackRows(rowsP, W), "pilot.png");
  save(buildCompare(sheets, A), "lich-compare.png");
  const html = path.join(outDir, "lich.html");
  fs.writeFileSync(html, buildHtml(sheet, glow, fx, A), "utf8");
  files.push(html);
  return files;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("bosses139/umb_crown_lich.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t = Date.now();
  const files = writeLichArt(root, path.join(root, "tools", "out", "bosses139"));
  console.log(`  ${files.length} файлов, ${((Date.now() - t) / 1000).toFixed(0)} с`);
}
void CS; void SN; void vlen; void hex; void ([] as Stamp[]); void ({} as Ramp);
