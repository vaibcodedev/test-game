/**
 * Задача 140, партия 1: общий «скелет» гуманоидного моба — тот же метод, что у утверждённого пилота
 * (tools/gen/mobs/skeleton.ts): тело в 3D из примитивов lib.ts, луч на пиксель, 5 тонов на материал, контур, свет сверху
 * слева, роли — слоями оружия, обычный и усиленный вариант, покой 12 / ходьба 12 / атака 9–10 / гибель 12 кадров,
 * 3 вида (вниз, вверх, вбок; влево — отражение), проверки кадров lib.ts.
 *
 * Отличие от пилота: суставы, позы и анимации общие для всех образов (рост и пропорции — в Dims), а тело, голову, лицо,
 * одежду и приметы усиленного рисует сам образ (Creature.build). Модель строится в «росте героя», затем вся сцена
 * масштабируется до роста образа (scale: обычный / усиленный); сдвиги ядра — целыми пикселями кадра и после масштаба.
 * Крупные (огр, тролль) — в кадре 48×48 (ступни на той же линии кадра, что и у героя: последний ряд тела — N−2).
 *
 * Гибель: тело оседает и падает навзничь (от зрителя, чуть вбок) целиком, оружие отлетает и ложится плашмя,
 * пыль при падении.
 */
import fs from "node:fs";
import path from "node:path";
import {
  MOB_CAM, PC, PX, R, Scene, VIEWS, VIEW_RU, add, clamp, crop, cross, depthOf, dot, easeIn, easeInOut, easeOut, fill, frameEdgeCuts, frameHoles,
  frameOf, fromView, groundBg, hash01, hex, ik, lerp, lerpV, linear, loadPC, mat, mix, mul, nightRect, norm, rad, renderScene, rotAxis,
  scaleNN, scr, sealPinholes, shadowBlob, snapPx, stackRows, stampRows, sub, text, thicken, thinLines, toView, vlen,
  type Cam, type Grip, type Mat, type Prim, type RGBA, type Ramp, type Row, type Stamp, type StampPx, type TexFn, type V3, type View, type WeaponFn,
} from "./lib";

export { R, mat, hex, mix, add, sub, mul, norm, cross, dot, lerpV, rad, frameOf, rotAxis, stampRows, hash01, vlen };
export type { V3, Mat, Ramp, RGBA, TexFn, Grip, WeaponFn, View, Stamp, StampPx };

// ---------------- палитра: общие материалы (5 тонов) ----------------
export const OUT = hex("#170f0a");
export const VOID = hex("#140d0a");
export const STRING = hex("#c9bb98");
export const P = {
  bone: R("#3a2b1c", "#6d5636", "#a08656", "#cbb27c", "#eddcab"),
  cloth: R("#1c1612", "#352a22", "#504034", "#6a5746", "#85725b"),
  rust: R("#26150e", "#512d19", "#7b4524", "#a06535", "#c08752"),
  iron: R("#17191e", "#30343c", "#4f5560", "#79808c", "#adb3bc"),
  steel: R("#1d2229", "#424b56", "#76808b", "#b1b9c0", "#eef2f2"),
  wood: R("#1e140c", "#3a2716", "#583d22", "#795731", "#9c7645"),
  bowwood: R("#2a190d", "#543518", "#7d5428", "#a6783c", "#cba05a"),
  leather: R("#1a110b", "#33231a", "#4c3625", "#664a33", "#836246"),
  bronze: R("#24150a", "#553515", "#8a5a22", "#c08a3a", "#e9c46a"),
  rope: R("#2a2010", "#4e3e22", "#7a6538", "#a48c55", "#c9b27a"),
  stone: R("#1f1f22", "#3c3c42", "#5e5e66", "#85868c", "#b0b1b5"),
  clay: R("#24140c", "#4a2a18", "#6e4026", "#935a36", "#b8784a"),
  red: R("#2a0c0c", "#561616", "#8a2420", "#b83a2c", "#dc6a4a"),
  horn: R("#1c1612", "#3a3026", "#5c4c3a", "#857059", "#ab977a"),
  reed: R("#2a2410", "#55491f", "#857232", "#b39c4c", "#d8c47a"),
};
export const SOUL = R("#0d4256", "#1d84a6", "#47c6ea", "#aaf0ff", "#effdff");
export const M = {
  bone: mat("кость", P.bone, { base: 1.85, gain: 2.3 }),
  cloth: mat("ткань", P.cloth, { base: 1.6, gain: 2.2 }),
  rust: mat("ржавчина", P.rust, { base: 1.6, gain: 2.3 }),
  iron: mat("железо", P.iron, { base: 1.6, gain: 2.6 }),
  steel: mat("сталь", P.steel, { base: 1.9, gain: 2.2 }),
  blade: mat("клинок", P.iron, { base: 2.3, gain: 2.0 }),
  wood: mat("дерево", P.wood, { base: 1.7, gain: 2.3 }),
  bowwood: mat("светлое дерево", P.bowwood, { base: 1.9, gain: 2.2 }),
  leather: mat("кожа", P.leather, { base: 1.6, gain: 2.3 }),
  bronze: mat("бронза", P.bronze, { base: 1.8, gain: 2.3 }),
  rope: mat("верёвка", P.rope, { base: 1.8, gain: 2.0 }),
  stone: mat("камень", P.stone, { base: 1.7, gain: 2.3 }),
  clay: mat("глина", P.clay, { base: 1.8, gain: 2.2 }),
  red: mat("красная ткань", P.red, { base: 1.7, gain: 2.2 }),
  horn: mat("рог", P.horn, { base: 1.8, gain: 2.3 }),
  reed: mat("тростник", P.reed, { base: 1.9, gain: 2.1 }),
  soul: mat("душа", SOUL, { base: 2.6, gain: 1.2, lo: 1, hi: 4, crisp: true, glow: true }),
};
/** Светящийся материал из рампы (угли, камень души): тон почти не зависит от света. */
export const glowMat = (name: string, ramp: Ramp, base = 2.6) => mat(name, ramp, { base, gain: 1.2, lo: 1, hi: 4, crisp: true, glow: true });

// ---------------- текстуры ----------------
export const rustTex = (amount: number): TexFn => (c) => {
  const h = hash01(Math.floor(c.l[2] * 0.9 + 20), Math.floor(c.l[0] * 1.2 + 9), 7);
  return h < amount ? { mat: M.rust, d: -0.1 } : 0;
};
export const plankTex: TexFn = (c) => (c.edge ? 0 : Math.abs(((c.l[0] + 20) % 2.2) - 1.1) < 0.3 ? -1.1 : 0);
export const mailTex: TexFn = (c) => {
  if (c.edge) return 0;
  const ry = c.y - c.ay + 64, rx = c.x - c.ax + 64;
  return !(ry & 1) && !((rx + (ry >> 1)) & 1) && c.tone > 1.2 && c.tone < 3.4 ? 0.85 : -0.2;
};
/** Пластины (ламеллярный доспех): ряды через 2 px, стык темнее, у каждой пластины светлый верх. */
export const lamellarTex: TexFn = (c) => {
  if (c.edge) return 0;
  const ry = (c.y - c.ay + 64) % 3, rx = (c.x - c.ax + 64 + (((c.y - c.ay + 64) / 3) | 0)) % 3;
  return ry === 2 ? -1.0 : rx === 2 ? -0.6 : ry === 0 ? 0.4 : 0;
};
/** Пятна по пикселю (бородавки, крапины, заплаты): доля amount, сдвиг тона d. */
export const spotTex = (amount: number, d: number, seed = 3, m?: Mat): TexFn => (c) => {
  if (c.edge) return 0;
  const h = hash01(c.x - c.ax + 50, c.y - c.ay + 50, seed);
  return h < amount ? (m ? { mat: m, d } : d) : 0;
};
/** Шерсть: редкие тёмные «пряди» по пикселю — фактура меха без шума. */
export const furTex = (seed = 5, amount = 0.16): TexFn => (c) => {
  if (c.edge || c.tone < 1.4) return 0;
  const h = hash01(c.x - c.ax + 40, ((c.y - c.ay + 40) >> 1) * 2, seed);
  return h < amount ? -0.8 : 0;
};
/** Бинты: косые полосы через 2 px, щели между витками темнее (мумия). */
export const bandageTex = (m?: Mat): TexFn => (c) => {
  if (c.edge) return 0;
  // косые витки: полоса бинта 2 px (верхний край светлее), щель 1 px; на правой стороне детали наклон зеркальный
  const dx = c.x - c.ax, dy = c.y - c.ay;
  const k = ((Math.floor((dx >= 0 ? dx : -dx) / 2) + dy) % 3 + 3) % 3;
  if (k === 2) return m ? { mat: m, d: 0.3 } : -1.2;
  return k === 0 ? 0.45 : -0.1;
};

// ---------------- образ ----------------
export interface Dims {
  pelvisZ: number; hipX: number; hipZ: number;
  shX: number; shZ: number;
  arm: [number, number]; leg: [number, number];
  /** центр головы в покое (до сдвигов позы) */
  headC: V3;
  footX: number;
  /** наклон корпуса вперёд, рад (сутулые) */
  hunch?: number;
  /** пальцеходящие ноги: скакательный сустав — [назад, вверх] от щиколотки */
  digi?: [number, number];
  stride?: number;
}
export type Kind = "slash" | "thrust" | "bow" | "cast" | "handcast" | "flute" | "throw" | "claw" | "chop2h" | "leap";
export interface RoleDef {
  id: string; ru: string; kind: Kind;
  R?: WeaponFn; L?: WeaponFn;
  /** предмет за спиной (колчан, сумка): точка и направление в осях корпуса */
  back?: { fn: WeaponFn; at: V3; dir: V3; flat?: V3 };
  /** от хвата до острия (след удара) */
  reach?: number;
  /** чары: от хвата до точки чар (навершие) */
  focus?: number;
  shield?: boolean;
  /** двуручный хват: левая кисть на древке на столько ниже правой */
  grip2?: number;
  fx?: Ramp;
  proj?: { ramp: Ramp; r: number; spark?: Ramp };
  /** только усиленный (элитная роль) */
  eliteOnly?: boolean;
  /** только обычный */
  normalOnly?: boolean;
}
export interface Creature {
  id: string; ru: string;
  scale: [number, number];
  big?: boolean;
  dims: Dims;
  roles: RoleDef[];
  build: (c: Ctx) => void;
  /** приставка усиленного */
  eliteRu: string;
  /** плотность силуэта: [ширина, глубина] тела, рост прежний */
  widen?: [number, number];
  /** гибель: back — навзничь, side — набок, crumble — оседает и рассыпается прахом, roll — зверь заваливается на бок вокруг хребта (партия 2) */
  death?: "back" | "side" | "crumble" | "roll";
  dust?: Ramp;
  ref?: string;
  /** файл референса в папке ref (партия 2: banshee/ref1.png и т. п.); без него — ref.png */
  refFile?: string;
}
export interface Variant { role: RoleDef; elite: boolean }
export const variantsOf = (cr: Creature): Variant[] => {
  const out: Variant[] = [];
  for (const elite of [false, true]) for (const role of cr.roles) {
    if (elite && role.normalOnly) continue;
    if (!elite && role.eliteOnly) continue;
    out.push({ role, elite });
  }
  return out;
};
export const variantId = (cr: Creature, v: Variant) => `${cr.id}_${v.role.id}${v.elite ? "_elite" : ""}`;
export const variantRu = (v: Variant) => `${v.role.ru}${v.elite ? "+" : ""}`;
export const camOf = (cr: Creature): Cam => (cr.big ? { N: 48, CX: 24, GY: 46.4 } : MOB_CAM);

// ---------------- поза ----------------
export interface Pose {
  core: V3; chest: number; head: [number, number]; jaw: number;
  yaw: number; lean: number;
  hR: V3; hL: V3; fR: V3; fL: V3;
  wR: [V3, V3]; wL: [V3, V3];
  draw: number; arrow: number;
  glow: number; charge: number;
  sway: number; tail: number; flap: number; grip2: number; blink: number;
}

/** Контекст построения тела: суставы уже решены (мир, рост героя — до масштаба). Индекс 0 — правая сторона, 1 — левая. */
export interface Ctx {
  S: Scene; E: boolean; view: View; p: Pose; d: Dims; role: RoleDef; anim: Anim;
  core: V3; pelvisC: V3;
  /** точка в осях корпуса (покой) → мир с позой */
  up: (q: V3) => V3;
  /** направление в осях корпуса → мир */
  rotU: (v: V3) => V3;
  head: V3;
  sh: V3[]; el: V3[]; hand: V3[]; hip: V3[]; knee: V3[]; ankle: V3[]; hock: (V3 | null)[];
}

const SH0: V3 = [4.5, 0.1, 15.7];
/** Кисть по смещению от плеча в единицах пилота-скелета (длина руки 7,6): сторона s = 1 правая, −1 левая. */
export function handAt(d: Dims, s: 1 | -1, rel: V3): V3 {
  const k = (d.arm[0] + d.arm[1]) / 7.6;
  return [(d.shX + rel[0] * k) * s, 0.1 + rel[1] * k, d.shZ - 0.3 + rel[2] * k];
}
void SH0;

/** Покой роли: кисти и оружие. */
export function restPose(cr: Creature, role: RoleDef): Pose {
  const d = cr.dims;
  const p: Pose = {
    core: [0, 0, 0], chest: 0, head: [0, 0], jaw: 0, yaw: 0, lean: 0,
    hR: handAt(d, 1, [1.6, 0.7, -6.9]), hL: handAt(d, -1, [1.6, 0.7, -6.9]),
    fR: [d.footX, 0.2, 1.0], fL: [-d.footX, -0.2, 1.0],
    wR: [norm([0.3, 0.22, 0.93]), norm([0.7, 0.7, 0])], wL: [[0, 0, 1], [-1, 0, 0]],
    draw: 0, arrow: 0, glow: 1, charge: 0, sway: 0, tail: 0, flap: 0, grip2: 0, blink: 0,
  };
  switch (role.kind) {
    case "slash":
      // оружие наискось наружу и вперёд — спереди не прячется за тело
      p.hR = handAt(d, 1, [2.0, 2.2, -6.0]);
      p.wR = [norm([0.5, 0.35, 0.8]), norm([0.7, 0.7, 0])];
      break;
    case "chop2h":
      p.hR = handAt(d, 1, [1.8, 2.0, -5.8]);
      p.wR = [norm([0.42, 0.35, 0.84]), norm([0.7, 0.7, 0])];
      break;
    case "thrust":
      p.hR = handAt(d, 1, [2.0, 1.4, -5.8]);
      p.wR = [norm([0.16, 0.15, 1]), [1, 0, 0]];
      break;
    case "bow":
      p.hL = handAt(d, -1, [1.8, 1.1, -6.5]);
      p.wL = [norm([-0.05, 0.25, 0.97]), [1, 0, 0]];
      p.hR = handAt(d, 1, [1.6, 0.5, -6.9]);
      break;
    case "cast":
      p.hR = handAt(d, 1, [2.1, 1.5, -5.5]);
      p.wR = [norm([0.03, 0.08, 1]), [0, 1, 0]];
      break;
    case "flute":
      p.hR = handAt(d, 1, [1.0, 1.8, -6.0]);
      p.wR = [norm([0.1, 0.5, -0.86]), [0, 1, 0]];
      break;
    case "throw":
      p.hR = handAt(d, 1, [1.4, 1.2, -6.4]);
      p.wR = [[0, 0, -1], [1, 0, 0]];
      break;
    case "claw":
    case "leap":
      p.hR = handAt(d, 1, [1.2, 1.6, -6.6]);
      p.hL = handAt(d, -1, [1.2, 1.6, -6.6]);
      p.wR = [norm([0.1, 0.6, -0.8]), [1, 0, 0]];
      p.wL = [norm([-0.1, 0.6, -0.8]), [-1, 0, 0]];
      break;
    case "handcast":
      p.hR = handAt(d, 1, [1.4, 1.2, -6.6]);
      p.hL = handAt(d, -1, [1.4, 1.2, -6.6]);
      break;
  }
  if (role.shield) {
    p.hL = handAt(d, -1, [0.9, 2.5, -5.9]);
    p.wL = [[0, 0, 1], norm([-0.3, 1, 0])];
  }
  return p;
}

// ---------------- построение ----------------
export const PC_BODY = 1, PC_WR = 2, PC_WL = 3;
export interface Built {
  sc: Scene;
  tipR: V3 | null; tipL: V3 | null; focus: V3 | null; mouth: V3;
  bowString: { a: V3; b: V3; nock: V3 } | null;
  hand: V3[];
}

function rotAbout(q: V3, c: V3, axis: V3, ang: number): V3 {
  return ang ? add(c, rotAxis(sub(q, c), axis, ang)) : q;
}

export function buildBody(cr: Creature, v: Variant, p: Pose, view: View, anim: Anim): Built {
  const d = cr.dims;
  const E = v.elite;
  const role = v.role;
  const s = cr.scale[E ? 1 : 0];
  const S = new Scene();
  const core = mul(snapPx(view, p.core), 1 / s);
  const chestUp: V3 = [0, 0, (Math.round(p.chest) * PX) / s];
  const pelvisC = add(core, [0, 0, d.pelvisZ]);
  const lean = p.lean - (d.hunch ?? 0);
  const rotU = (w: V3): V3 => {
    let r = w;
    if (lean) r = rotAxis(r, [1, 0, 0], lean);
    if (p.yaw) r = rotAxis(r, [0, 0, 1], p.yaw);
    return r;
  };
  const up = (q: V3): V3 => add(pelvisC, rotU(sub(add(add(q, core), chestUp), pelvisC)));
  const head = up(add(d.headC, [p.head[0] / s, 0, (p.head[1] * PX) / s]));
  // кисти: поза в осях «прямого» тела; сутулость наклоняет их вместе с корпусом
  const P0: V3 = [0, 0, d.pelvisZ];
  const handW = (h: V3): V3 => add(add(rotAbout(h, P0, [1, 0, 0], -(d.hunch ?? 0)), core), chestUp);
  const L = d.arm[0] + d.arm[1];
  const sh = [up([d.shX, 0.1, d.shZ - 0.3]), up([-d.shX, 0.1, d.shZ - 0.3])];
  let hand = [handW(p.hR), handW(p.hL)];
  if (p.grip2 > 0 && role.grip2) {
    const t = sub(hand[0], mul(norm(p.wR[0]), role.grip2));
    hand[1] = lerpV(hand[1], t, p.grip2);
  }
  hand = hand.map((h, i) => {
    const dv = sub(h, sh[i]);
    const dl = vlen(dv);
    return dl > 0.97 * L ? add(sh[i], mul(dv, (0.97 * L) / dl)) : h;
  });
  const el = [0, 1].map((i) => ik(sh[i], hand[i], d.arm[0], d.arm[1], [0.6 * (i ? -1 : 1), -1, -0.4]));
  const hip = [add(core, [d.hipX, 0, d.hipZ]), add(core, [-d.hipX, 0, d.hipZ])];
  const ankle = [p.fR, p.fL];
  const hock = ankle.map((a) => (d.digi ? add(a, [0, -d.digi[0], d.digi[1]]) : null));
  const knee = [0, 1].map((i) => ik(hip[i], hock[i] ?? ankle[i], d.leg[0], d.leg[1], [0.15 * (i ? -1 : 1), 1, 0]));
  const ctx: Ctx = { S, E, view, p, d, role, anim, core, pelvisC, up, rotU, head, sh, el, hand, hip, knee, ankle, hock };
  cr.build(ctx);
  // плотность силуэта: тело шире (x) и толще (y) вокруг оси, рост тот же; кисти и оружие — вслед
  const [kx, ky] = cr.widen ?? [1, 1];
  const Wd = (q: V3): V3 => [q[0] * kx, q[1] * ky, q[2]];
  if (kx !== 1 || ky !== 1) {
    widenScene(S, kx, ky);
    hand = hand.map(Wd);
  }
  const head2 = Wd(head);
  // оружие — слои от хвата
  const gR: Grip = { at: hand[0], dir: norm(p.wR[0]), flat: p.wR[1] };
  const gL: Grip = { at: hand[1], dir: norm(p.wL[0]), flat: p.wL[1] };
  // бросок: после отпуска снаряд летит отдельно — в руке его нет (k = −1)
  const kR = role.kind === "throw" && p.draw > 0.5 ? -1 : p.charge;
  const o = (piece: number, k = p.charge) => ({ elite: E, k, piece });
  role.R?.(S, gR, o(PC_WR, kR));
  role.L?.(S, gL, o(PC_WL));
  if (role.back) role.back.fn(S, { at: Wd(up(role.back.at)), dir: norm(rotU(role.back.dir)), flat: rotU(role.back.flat ?? [1, 0, 0]) }, o(PC_BODY));
  // лук: стрела на тетиве
  let bowString: Built["bowString"] = null;
  if (role.kind === "bow") {
    const { tips } = bowGeom(gL, E);
    const nock = lerpV(lerpV(tips[0], tips[1], 0.5), hand[0], p.draw);
    bowString = { a: tips[0], b: tips[1], nock };
    if (p.arrow > 0) {
      const fwd = norm(sub(hand[1], nock));
      const tail = nock, hd = add(hand[1], mul(fwd, 2.4));
      S.cone(S.group(0), M.wood, tail, 0.42, hd, 0.42, { piece: PC_WR, part: S.newPart() });
      S.box(S.group(0), E ? M.steel : M.iron, add(hd, mul(fwd, 0.5)), [0.7, 0.3, 0.7], frameOf(fwd, [0, 0, 1]), 0.2, { piece: PC_WR, part: S.newPart() });
      S.cone(S.group(0), E ? M.bone : M.cloth, add(tail, mul(fwd, 0.3)), 0.6, add(tail, mul(fwd, 1.4)), 0.5, { piece: PC_WR, part: S.newPart() });
    }
  }
  for (const q of S.prims) if (q.piece < 0) q.piece = PC_BODY;
  for (const st of S.stamps) if (st.piece === undefined) st.piece = PC_BODY;
  // масштаб образа
  scaleScene(S, s);
  const sc = (q: V3 | null) => (q ? mul(q, s) : null);
  const tipR = role.reach ? sc(add(hand[0], mul(norm(p.wR[0]), role.reach))) : null;
  const tipL = role.reach ? sc(add(hand[1], mul(norm(p.wL[0]), role.reach))) : null;
  const focus = role.focus !== undefined ? sc(add(hand[0], mul(norm(p.wR[0]), role.focus))) : null;
  const mouth = mul(Wd(add(head, rotU([0, 2.6, -1.4]))), s);
  void head2;
  return {
    sc: S, tipR, tipL, focus, mouth,
    bowString: bowString ? { a: mul(bowString.a, s), b: mul(bowString.b, s), nock: mul(bowString.nock, s) } : null,
    hand: hand.map((h) => mul(h, s)),
  };
}

/** Растяжение тела по ширине (kx) и глубине (ky): точки — вдоль осей, радиусы — по растяжению своей оси. */
function widenScene(S: Scene, kx: number, ky: number) {
  const P = (q: V3): V3 => [q[0] * kx, q[1] * ky, q[2]];
  const avg = (kx + ky) / 2;
  for (const q of S.prims) {
    q.a = P(q.a);
    q.b = P(q.b);
    q.anc = P(q.anc);
    if (q.k === 0) {
      q.ra *= avg;
      q.rb *= avg;
    } else {
      q.r = [0, 1, 2].map((i) => q.r[i] * Math.hypot(q.ax[i][0] * kx, q.ax[i][1] * ky, q.ax[i][2])) as V3;
      q.rr *= avg;
      if (q.cut) q.cut = { n: q.cut.n, d: q.cut.d * avg };
    }
  }
  for (const st of S.stamps) st.at = P(st.at);
}
function scaleScene(S: Scene, s: number) {
  for (const q of S.prims) {
    q.a = mul(q.a, s);
    q.b = mul(q.b, s);
    q.anc = mul(q.anc, s);
    q.ra *= s;
    q.rb *= s;
    q.r = mul(q.r, s);
    q.rr *= s;
    if (q.cut) q.cut = { n: q.cut.n, d: q.cut.d * s };
  }
  S.gk = S.gk.map((k) => k * s);
  for (const st of S.stamps) st.at = mul(st.at, s);
}

// ---------------- помощники тела ----------------
export interface LimbSpec { mat: Mat; r: [number, number, number]; tex?: TexFn; g?: number }
/** Рука: плечо → локоть → кисть (одна группа — гладкий сустав). */
export function drawArm(c: Ctx, i: number, a: LimbSpec, handR: number, handMat?: Mat) {
  const S = c.S;
  const g = S.group(a.g ?? 0.4);
  const pu = S.newPart();
  S.cone(g, a.mat, c.sh[i], a.r[0], c.el[i], a.r[1], { part: pu, tex: a.tex });
  const g2 = S.group(a.g ?? 0.4);
  const pf = S.newPart();
  S.cone(g2, a.mat, c.el[i], a.r[1], c.hand[i], a.r[2], { part: pf, tex: a.tex });
  S.ball(g2, handMat ?? a.mat, c.hand[i], handR, { part: pf });
}
/** Нога: бедро → колено → (скакательный сустав) → щиколотка; стопа — отдельно (drawFoot). */
export function drawLeg(c: Ctx, i: number, a: LimbSpec, low?: { mat: Mat; r: [number, number] }) {
  const S = c.S;
  const g = S.group(a.g ?? 0.45);
  const pt = S.newPart();
  S.cone(g, a.mat, c.hip[i], a.r[0], c.knee[i], a.r[1], { part: pt, tex: a.tex });
  const g2 = S.group(a.g ?? 0.45);
  const ps = S.newPart();
  const hk = c.hock[i];
  if (hk) {
    S.cone(g2, a.mat, c.knee[i], a.r[1], hk, a.r[2], { part: ps, tex: a.tex });
    S.cone(g2, low?.mat ?? a.mat, hk, low?.r[0] ?? a.r[2], c.ankle[i], low?.r[1] ?? a.r[2] * 0.85, { part: ps, tex: a.tex });
  } else S.cone(g2, a.mat, c.knee[i], a.r[1], c.ankle[i], a.r[2], { part: ps, tex: a.tex });
}
/** Стопа: от щиколотки вперёд (вдоль модели +Y), длина len, толщина r. */
export function drawFoot(c: Ctx, i: number, m: Mat, len: number, r: number, wide = 1, tex?: TexFn) {
  const s = i ? -1 : 1;
  const a = c.ankle[i];
  const g = c.S.group(0.4);
  const pt = c.S.newPart();
  c.S.cone(g, m, add(a, [0, -0.5, -0.25]), r, add(a, [0.1 * s, len, -0.45]), r * 0.85 * wide, { part: pt, tex });
  return add(a, [0.1 * s, len, -0.45]);
}
/** Ось кадра головы: вбок, вперёд, вверх (с поворотом корпуса). */
export const headAxes = (c: Ctx): [V3, V3, V3] => [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])];
/** Точка в осях головы. */
export const hp = (c: Ctx, q: V3): V3 => add(c.head, c.rotU(q));

/**
 * Лицо — штампами: спереди (вниз) и сбоку. at — точка поверхности в осях головы, rows — ряды символов (точка — пусто),
 * x0, y0 — сдвиг ряда относительно точки.
 */
export function face(c: Ctx, o: {
  at: V3; sideAt?: V3; down?: [string[], number, number]; side?: [string[], number, number]; up?: [string[], number, number];
  colors: Record<string, RGBA>; glow?: string[]; halo?: RGBA; depthTol?: number; minFacing?: number;
}) {
  if (o.down) c.S.stamps.push({ at: hp(c, o.at), n: c.rotU([0, 1, 0]), colors: o.colors, glow: o.glow, halo: o.halo, depthTol: o.depthTol ?? 3, minFacing: o.minFacing, px: { down: stampRows(o.down[0], o.down[1], o.down[2]) } });
  if (o.side) c.S.stamps.push({ at: hp(c, o.sideAt ?? o.at), n: c.rotU(norm([0.5, 0.85, 0])), colors: o.colors, glow: o.glow, halo: o.halo, depthTol: o.depthTol ?? 3.5, minFacing: o.minFacing, px: { side: stampRows(o.side[0], o.side[1], o.side[2]) } });
  if (o.up) c.S.stamps.push({ at: hp(c, o.at), n: c.rotU([0, -1, 0]), colors: o.colors, glow: o.glow, halo: o.halo, depthTol: o.depthTol ?? 3, minFacing: o.minFacing, px: { up: stampRows(o.up[0], o.up[1], o.up[2]) } });
}
/** Набедренная повязка/лоскуты: прямоугольники, свисающие от пояса (рваный край — разной длины). */
export function flaps(c: Ctx, m: Mat, list: [number, number, number, number][], tex?: TexFn, g?: number) {
  const S = c.S;
  const cg = g ?? S.group(0.4);
  const cp = S.newPart();
  for (const [x, y, len, w] of list) {
    const top = add(c.pelvisC, [x, y, -0.4]);
    const dir = norm([0, -Math.sign(y) * 0.1 - c.p.sway * 0.35 * Math.sign(y || 1), -1]);
    const ax = frameOf(dir, [1, 0, 0]);
    S.box(cg, m, add(top, mul(dir, len / 2)), [w, 0.3, len / 2], ax, 0.25, { part: cp, tex });
  }
  return cg;
}
/** Хвост: цепочка конусов от точки крепления (оси корпуса), кривая — назад и вниз, раскачивание p.tail. */
export function tail(c: Ctx, m: Mat, from: V3, segs: V3[], r: number[], tex?: TexFn, pieceTip?: (g: number, at: V3, dir: V3) => void) {
  const S = c.S;
  const g = S.group(0.35);
  const pt = S.newPart();
  let a = add(c.core, from);
  const sw = c.p.tail;
  segs.forEach((sg, k) => {
    const w = (k + 1) / segs.length;
    const b = add(a, [sg[0] + sw * 0.9 * w, sg[1], sg[2]]);
    S.cone(g, m, a, r[k], b, r[k + 1], { part: pt, tex });
    if (k === segs.length - 1 && pieceTip) pieceTip(g, b, norm(sub(b, a)));
    a = b;
  });
}

// ---------------- детали снаряжения ----------------
/** Пояс по торсу на высоте z (оси корпуса) с пряжкой спереди. */
export function belt(c: Ctx, m: Mat, buckle: Mat | null, z: number, rx: number, ry: number, h = 0.65, y0 = 0) {
  const S = c.S;
  S.ell(S.group(0), m, c.up([0, y0, z]), [rx, ry, h], undefined, { part: S.newPart(), big: true });
  if (buckle) S.box(S.group(0), buckle, c.up([0, y0 + ry + 0.05, z]), [0.85, 0.45, 0.75], [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])], 0.25, { part: S.newPart() });
}
/** Ремень (перевязь) между точками в осях корпуса; studs — заклёпки по длине. */
export function strap(c: Ctx, m: Mat, a: V3, b: V3, r = 0.6, studs?: Mat, n = 3) {
  const S = c.S;
  S.cone(S.group(0), m, c.up(a), r, c.up(b), r, { part: S.newPart() });
  if (studs) for (let k = 1; k <= n; k++) S.ball(S.group(0), studs, c.up(lerpV(a, b, k / (n + 1))), r * 0.75, { part: S.newPart() });
}
/** Ожерелье: бусины/клыки по дуге на груди (оси корпуса), fang — клыки вниз. */
export function necklace(c: Ctx, m: Mat, z: number, rx: number, ry: number, n = 5, fang = false, r = 0.5) {
  const S = c.S;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n - 0.5) * 2.0;
    const p: V3 = [Math.sin(a) * rx, Math.cos(a) * ry, z - Math.cos(a) * 0.8];
    if (fang) S.cone(S.group(0), m, c.up(p), r, c.up(add(p, [0, 0.3, -1.4])), 0.15, { part: S.newPart() });
    else S.ball(S.group(0), m, c.up(p), r, { part: S.newPart() });
  }
}
/** Подсумок на поясе. */
export function pouch(c: Ctx, m: Mat, at: V3, r: V3 = [1.0, 0.7, 0.9]) {
  const S = c.S;
  S.ell(S.group(0.2), m, c.up(at), r, undefined, { part: S.newPart() });
  S.ell(S.group(0), m, c.up(add(at, [0, 0.1, r[2] * 0.7])), [r[0] * 1.05, r[1] * 1.05, 0.35], undefined, { part: S.newPart(), tone: 0.5 });
}

// ---------------- оружие ----------------
type WO = { elite: boolean; k: number; piece: number };
const axOf = (g: Grip): { w: V3; fl: V3; side: V3; ax: [V3, V3, V3] } => {
  const [fl, , w] = frameOf(g.dir, g.flat);
  const side = cross(w, fl);
  return { w, fl, side, ax: [side, cross(w, side), w] };
};
const at = (g: Grip, w: V3, u: number, side?: V3, sv = 0): V3 => add(add(g.at, mul(w, u)), side ? mul(side, sv) : [0, 0, 0]);
/** Древко/рукоять: от u0 до u1 вдоль оружия. */
function haft(S: Scene, g: Grip, o: WO, u0: number, u1: number, r: number, m: Mat, r1 = r) {
  const { w } = axOf(g);
  S.cone(S.group(0), m, at(g, w, u0), r, at(g, w, u1), r1, { piece: o.piece, part: S.newPart() });
}
/** Клинок: две половины со срезом наискось — остриё клином (как у стального меча пилота). */
function blade(S: Scene, g: Grip, o: WO, u0: number, len: number, W: number, m: Mat, tex?: TexFn, tipK = 1.2) {
  const { w, side, ax } = axOf(g);
  const bc = at(g, w, u0 + len / 2);
  const Gb = S.group(0);
  const bp = S.newPart();
  for (const sg of [-1, 1]) {
    S.box(Gb, m, add(bc, mul(side, (sg * W) / 2)), [W / 2, 0.32, len / 2], ax, 0.15, {
      piece: o.piece, part: bp, big: false, tex, cut: { n: norm([sg * tipK, 0, 1]), d: len / 2 - 0.9 + ((sg * W) / 2) * tipK / Math.hypot(tipK, 1) },
    });
  }
}
export const W = {
  /** Меч: ржавый (обычный) или стальной (усиленный), гарда. */
  sword: (len = 8, len2 = 9.2): WeaponFn => (S, g, o) => {
    const { w, side, ax } = axOf(g);
    haft(S, g, o, -1.3, 0.6, 0.75, M.leather);
    S.ball(S.group(0), o.elite ? M.iron : M.rust, at(g, w, -1.6), 0.75, { piece: o.piece, part: S.newPart() });
    const gc = at(g, w, 0.9);
    S.box(S.group(0), o.elite ? M.iron : M.rust, gc, [o.elite ? 2.0 : 1.6, 0.45, 0.42], ax, 0.2, { piece: o.piece, part: S.newPart() });
    const L = o.elite ? len2 : len;
    if (o.elite) blade(S, g, o, 1.3, L, 1.1, M.steel);
    else S.box(S.group(0), M.blade, at(g, w, 1.3 + L / 2), [1.0, 0.32, L / 2], ax, 0.25, { piece: o.piece, part: S.newPart(), tex: rustTex(0.36), big: false, cut: { n: norm([0.75, 0, 1]), d: L / 2 - 0.4 } });
    void side;
  },
  /** Топор: древко, лезвие вбок; усиленный — сталь, бородатое лезвие и обух-шип. */
  axe: (len = 7, head = 1.0): WeaponFn => (S, g, o) => {
    const { w, side, ax } = axOf(g);
    haft(S, g, o, -2.0, len, 0.7, o.elite ? M.wood : M.bowwood);
    const hc = at(g, w, len - 1.3, side, 1.4 * head);
    const m = o.elite ? M.steel : M.blade;
    S.box(S.group(0), m, hc, [1.6 * head, 0.34, (o.elite ? 1.7 : 1.3) * head], ax, 0.2, { piece: o.piece, part: S.newPart(), big: false, tex: o.elite ? undefined : rustTex(0.3), cut: { n: norm([-0.5, 0, 1]), d: 1.3 * head } });
    S.box(S.group(0), M.iron, at(g, w, len - 1.3), [0.8, 0.8, 0.9], ax, 0.3, { piece: o.piece, part: S.newPart() });
    if (o.elite) S.cone(S.group(0), M.iron, at(g, w, len - 1.3, side, -0.6), 0.6, at(g, w, len - 1.1, side, -2.2), 0.3, { piece: o.piece, part: S.newPart() });
  },
  /** Двуручный топор лесоруба (огр): длинное топорище, широкое лезвие. */
  greataxe: (len = 11): WeaponFn => (S, g, o) => {
    const { w, side, ax } = axOf(g);
    haft(S, g, o, -4.0, len, 0.85, o.elite ? M.wood : M.bowwood);
    const m = o.elite ? M.steel : M.blade;
    S.box(S.group(0), m, at(g, w, len - 1.8, side, 2.0), [2.3, 0.4, 2.0], ax, 0.25, { piece: o.piece, part: S.newPart(), big: true, tex: o.elite ? undefined : rustTex(0.25), cut: { n: norm([-0.45, 0, 1]), d: 1.9 } });
    S.box(S.group(0), M.iron, at(g, w, len - 1.8), [1.0, 1.0, 1.2], ax, 0.3, { piece: o.piece, part: S.newPart() });
    if (o.elite) {
      S.box(S.group(0), m, at(g, w, len - 1.8, side, -1.6), [1.2, 0.4, 1.4], ax, 0.25, { piece: o.piece, part: S.newPart() });
      for (const u of [1.0, 4.0]) S.cone(S.group(0), M.iron, at(g, w, u), 1.0, at(g, w, u + 0.6), 1.0, { piece: o.piece, part: S.newPart() });
    }
  },
  /** Тесак: широкий прямоугольный клинок. */
  cleaver: (len = 4.6): WeaponFn => (S, g, o) => {
    const { w, side, ax } = axOf(g);
    haft(S, g, o, -1.3, 0.8, 0.7, o.elite ? M.leather : M.wood);
    const m = o.elite ? M.steel : M.blade;
    S.box(S.group(0), m, at(g, w, 1.0 + len / 2, side, 0.5), [1.45, 0.3, len / 2], ax, 0.2, { piece: o.piece, part: S.newPart(), big: false, tex: o.elite ? undefined : rustTex(0.45), cut: { n: norm([0.6, 0, 1]), d: len / 2 + 0.2 } });
  },
  /** Нож: короткий клинок; серп (усиленный левой) — изогнутый зазубренный. */
  knife: (len = 3.4): WeaponFn => (S, g, o) => {
    const { w } = axOf(g);
    haft(S, g, o, -1.1, 0.6, 0.7, M.leather);
    blade(S, g, o, 0.6, o.elite ? len + 0.8 : len, 0.95, o.elite ? M.steel : M.blade, o.elite ? undefined : rustTex(0.3));
    void w;
  },
  sickle: (): WeaponFn => (S, g, o) => {
    const { w, side, ax } = axOf(g);
    haft(S, g, o, -1.1, 0.8, 0.7, M.wood);
    const m = M.steel;
    S.box(S.group(0), m, at(g, w, 2.2, side, 0.2), [0.5, 0.3, 1.6], ax, 0.15, { piece: o.piece, part: S.newPart(), big: false });
    S.box(S.group(0), m, at(g, w, 3.7, side, -0.9), [1.5, 0.3, 0.5], ax, 0.15, { piece: o.piece, part: S.newPart(), big: false, cut: { n: norm([-1, 0, -0.6]), d: 0.9 } });
  },
  /** Копьё: древко, листовидный наконечник; усиленный — сталь и костяное кольцо. */
  spear: (len = 10, back = 7, r = 0.65): WeaponFn => (S, g, o) => {
    const { w } = axOf(g);
    haft(S, g, o, -back, len, r, o.elite ? M.wood : M.bowwood);
    blade(S, g, o, len - 0.3, 3.0, 1.15, o.elite ? M.steel : M.iron, undefined, 0.9);
    if (o.elite) S.cone(S.group(0), M.bone, at(g, w, len - 1.0), r + 0.35, at(g, w, len - 0.4), r + 0.35, { piece: o.piece, part: S.newPart() });
  },
  /** Вилы (бесёнок): древко, перекладина, два зубца. */
  pitchfork: (len = 9, r = 0.8): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    haft(S, g, o, -5, len, r, o.elite ? M.wood : M.bowwood);
    const m = o.elite ? M.steel : M.rust;
    const G = S.group(0.3);
    const pp = S.newPart();
    S.cone(G, m, at(g, w, len, side, -1.4), r * 0.9, at(g, w, len, side, 1.4), r * 0.9, { piece: o.piece, part: pp });
    for (const sv of o.elite ? [-1.4, 0, 1.4] : [-1.4, 1.4]) S.cone(G, m, at(g, w, len, side, sv), r * 0.85, at(g, w, len + 3.2, side, sv * 1.05), r * 0.5, { piece: o.piece, part: pp });
  },
  /** Гарпун: древко, костяной (обычный) или стальной зазубренный наконечник, верёвка у хвата. */
  harpoon: (len = 9, back = 6): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    haft(S, g, o, -back, len, 0.65, M.bowwood);
    const m = o.elite ? M.steel : M.bone;
    const G = S.group(0.2);
    const pp = S.newPart();
    S.cone(G, m, at(g, w, len - 0.4), 0.85, at(g, w, len + 2.8), 0.25, { piece: o.piece, part: pp });
    for (const sv of [-1, 1]) S.cone(G, m, at(g, w, len + 1.0, side, 0.3 * sv), 0.5, at(g, w, len + 0.1, side, 1.3 * sv), 0.3, { piece: o.piece, part: pp });
    S.cone(S.group(0), M.rope, at(g, w, -1.2), 0.9, at(g, w, -0.2), 0.9, { piece: o.piece, part: S.newPart() });
  },
  /** Лопата могильщика: черенок и штык; усиленный — железная оковка. */
  shovel: (len = 8): WeaponFn => (S, g, o) => {
    const { w, ax } = axOf(g);
    haft(S, g, o, -2.0, len, 0.7, M.bowwood);
    S.box(S.group(0), o.elite ? M.iron : M.blade, at(g, w, len + 1.6), [1.5, 0.3, 1.8], ax, 0.35, { piece: o.piece, part: S.newPart(), big: true, tex: rustTex(o.elite ? 0.2 : 0.5), cut: { n: [0, 0, 1], d: 1.4 } });
    S.box(S.group(0), M.leather, at(g, w, -2.4), [1.2, 0.5, 0.45], ax, 0.3, { piece: o.piece, part: S.newPart() });
  },
  /** Кирка: рукоять и клюв в обе стороны. */
  pick: (len = 6.5): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    haft(S, g, o, -1.6, len, 0.7, M.bowwood);
    const m = o.elite ? M.steel : M.iron;
    const G = S.group(0.4);
    const pp = S.newPart();
    const c0 = at(g, w, len);
    S.cone(G, m, c0, 0.95, add(add(c0, mul(side, 3.0)), mul(w, -1.0)), 0.35, { piece: o.piece, part: pp });
    S.cone(G, m, c0, 0.95, add(add(c0, mul(side, -2.2)), mul(w, -0.6)), 0.55, { piece: o.piece, part: pp });
  },
  /** Дубина: суковатая, к концу толще; усиленный — окована, с шипами. */
  club: (len = 8, r0 = 0.8, r1 = 1.8): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    const G = S.group(0.3);
    const pp = S.newPart();
    S.cone(G, M.wood, at(g, w, -1.4), r0, at(g, w, len), r1, { piece: o.piece, part: pp, tex: furTex(9, 0.12) });
    S.ball(G, M.wood, at(g, w, len, side, 0.2), r1 * 1.05, { piece: o.piece, part: pp });
    if (o.elite) {
      for (const u of [len * 0.45, len * 0.8]) S.cone(S.group(0), M.iron, at(g, w, u), lerp(r0, r1, (u + 1.4) / (len + 1.4)) + 0.25, at(g, w, u + 0.7), lerp(r0, r1, (u + 2.1) / (len + 1.4)) + 0.25, { piece: o.piece, part: S.newPart() });
      const fl = cross(w, side);
      for (const dv of [side, mul(side, -1), fl, mul(fl, -1)]) S.cone(S.group(0), M.steel, at(g, w, len + 0.2), 0.5, add(at(g, w, len + 0.2), mul(dv, r1 + 1.1)), 0.15, { piece: o.piece, part: S.newPart() });
    } else S.cone(S.group(0), M.wood, at(g, w, len * 0.6, side, 0.3), 0.5, at(g, w, len * 0.7, side, r1 + 0.9), 0.3, { piece: o.piece, part: S.newPart() });
  },
  /** Кистень: рукоять, цепь, шипастая гиря. */
  flail: (): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    haft(S, g, o, -1.2, 2.6, 0.75, M.wood);
    const m = o.elite ? M.steel : M.iron;
    const c0 = at(g, w, 3.0);
    const dn: V3 = norm(add(mul(w, 0.4), [0, 0, -0.6]));
    const ch = S.newPart();
    const Gc = S.group(0.3);
    for (let k = 0; k < 3; k++) S.ball(Gc, M.iron, add(c0, mul(dn, k * 0.9)), 0.45, { piece: o.piece, part: ch });
    const bc = add(c0, add(mul(dn, 3.6), mul(side, 0.3)));
    const G = S.group(0.2);
    const bp = S.newPart();
    S.ball(G, m, bc, o.elite ? 1.5 : 1.3, { piece: o.piece, part: bp });
    for (const dv of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]] as V3[]) S.cone(G, m, bc, 0.5, add(bc, mul(dv, o.elite ? 2.3 : 2.0)), 0.2, { piece: o.piece, part: bp });
  },
  /** Алебарда: древко, лезвие, пика и крюк; усиленный — сталь и красная кисть. */
  halberd: (len = 12, back = 6): WeaponFn => (S, g, o) => {
    const { w, side, ax } = axOf(g);
    haft(S, g, o, -back, len, 0.65, o.elite ? M.wood : M.bowwood);
    const m = o.elite ? M.steel : M.blade;
    S.box(S.group(0), m, at(g, w, len - 1.3, side, 1.5), [1.5, 0.32, 1.6], ax, 0.2, { piece: o.piece, part: S.newPart(), big: false, cut: { n: norm([-0.6, 0, 1]), d: 1.5 } });
    blade(S, g, o, len - 0.4, 2.8, 0.95, m);
    S.cone(S.group(0), m, at(g, w, len - 1.0, side, -0.4), 0.55, at(g, w, len - 0.4, side, -2.2), 0.3, { piece: o.piece, part: S.newPart() });
    if (o.elite) S.cone(S.group(0.3), M.red, at(g, w, len - 2.6), 0.9, at(g, w, len - 4.2, side, 0.4), 0.55, { piece: o.piece, part: S.newPart() });
  },
  /** Якорь утопленника: веретено, кольцо у хвата, рога-лапы на конце. */
  anchor: (len = 9): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    const m = o.elite ? M.iron : M.rust;
    const tx = rustTex(o.elite ? 0.25 : 0.55);
    S.cone(S.group(0), m, at(g, w, -1.6), 0.8, at(g, w, len), 0.95, { piece: o.piece, part: S.newPart(), tex: tx });
    S.ell(S.group(0), m, at(g, w, -2.4), [1.3, 0.55, 1.0], axOf(g).ax, { piece: o.piece, part: S.newPart() });
    const G = S.group(0.4);
    const pp = S.newPart();
    for (const sv of [-1, 1]) {
      const a1 = at(g, w, len + 0.3, side, 0);
      const b1 = at(g, w, len - 1.3, side, 2.6 * sv);
      const c1 = at(g, w, len - 3.2, side, 3.0 * sv);
      S.cone(G, m, a1, 0.95, b1, 0.8, { piece: o.piece, part: pp, tex: tx });
      S.cone(G, m, b1, 0.8, c1, 0.45, { piece: o.piece, part: pp, tex: tx });
    }
    S.cone(S.group(0), m, at(g, w, 1.0, side, -1.8), 0.6, at(g, w, 1.0, side, 1.8), 0.6, { piece: o.piece, part: S.newPart(), tex: tx });
  },
  /** Хопеш: прямая шейка и серповидный клинок; бронза, у усиленного — тёмная бронза с золотой кромкой. */
  khopesh: (): WeaponFn => (S, g, o) => {
    const { w, side, ax } = axOf(g);
    haft(S, g, o, -1.2, 0.7, 0.7, M.wood);
    const m = M.bronze;
    S.box(S.group(0), m, at(g, w, 2.4), [0.55, 0.3, 1.9], ax, 0.15, { piece: o.piece, part: S.newPart(), big: false });
    const G = S.group(0.4);
    const pp = S.newPart();
    S.cone(G, m, at(g, w, 4.2, side, 0.2), 0.75, at(g, w, 6.0, side, 1.3), 0.7, { piece: o.piece, part: pp });
    S.cone(G, m, at(g, w, 6.0, side, 1.3), 0.7, at(g, w, 6.6, side, 3.0), 0.35, { piece: o.piece, part: pp });
  },
  /** Круглый щит: доски, полоса; усиленный — железный обод и умбон (как у пилота). */
  roundShield: (r = 3.5, face: Mat = M.bowwood): WeaponFn => (S, g, o) => {
    const n = norm(g.flat);
    const upv = norm(sub(g.dir, mul(n, dot(g.dir, n))));
    const side = cross(upv, n);
    const ax: [V3, V3, V3] = [side, upv, n];
    const c = add(g.at, mul(n, 0.9));
    if (o.elite) {
      S.ell(S.group(0), M.iron, add(c, mul(n, -0.15)), [r + 0.3, r + 0.3, 0.7], ax, { piece: o.piece, part: S.newPart(), big: true });
      S.ell(S.group(0), face, add(c, mul(n, 0.15)), [r - 0.4, r - 0.4, 0.8], ax, { piece: o.piece, part: S.newPart(), tex: plankTex, big: true });
      S.ball(S.group(0), M.iron, add(c, mul(n, 0.75)), 1.15, { piece: o.piece, part: S.newPart() });
    } else {
      S.ell(S.group(0), face, c, [r - 0.1, r + 0.1, 0.85], ax, { piece: o.piece, part: S.newPart(), tex: plankTex, big: true });
      S.box(S.group(0), M.rust, add(c, mul(upv, 0.9)), [r - 0.3, 0.6, 0.68], ax, 0.2, { piece: o.piece, part: S.newPart() });
    }
  },
  /** Высокий щит (мумия): дерево, бронзовый обод; усиленный — медная бляха. */
  towerShield: (): WeaponFn => (S, g, o) => {
    const n = norm(g.flat);
    const upv = norm(sub(g.dir, mul(n, dot(g.dir, n))));
    const side = cross(upv, n);
    const ax: [V3, V3, V3] = [side, upv, n];
    const c = add(add(g.at, mul(n, 0.9)), mul(upv, 0.8));
    S.ell(S.group(0), M.bronze, add(c, mul(n, -0.15)), [3.0, 4.4, 0.7], ax, { piece: o.piece, part: S.newPart(), big: true, cut: { n: [0, -1, 0], d: 3.4 } });
    S.ell(S.group(0), o.elite ? M.wood : M.bowwood, add(c, mul(n, 0.15)), [2.4, 3.8, 0.8], ax, { piece: o.piece, part: S.newPart(), big: true, tex: plankTex, cut: { n: [0, -1, 0], d: 2.9 } });
    if (o.elite) S.ball(S.group(0), M.bronze, add(c, mul(n, 0.8)), 1.2, { piece: o.piece, part: S.newPart() });
  },
  bow: (): WeaponFn => (S, g, o) => {
    const { pts } = bowGeom(g, o.elite);
    const G = S.group(0.4);
    const part = S.newPart();
    for (let k = 0; k + 1 < pts.length; k++) {
      const mid = Math.abs(k + 0.5 - (pts.length - 1) / 2) / ((pts.length - 1) / 2);
      const r0 = 0.95 - 0.12 * mid;
      const m = o.elite && (k === 0 || k === pts.length - 2) ? M.bone : o.elite ? M.wood : M.bowwood;
      S.cone(G, m, pts[k], r0, pts[k + 1], r0 - 0.05, { piece: o.piece, part });
    }
    S.ball(G, o.elite ? M.iron : M.leather, pts[4], 0.85, { piece: o.piece, part });
  },
  quiver: (): WeaponFn => (S, g, o) => {
    const part = S.newPart();
    const G = S.group(0.3);
    const top = add(g.at, mul(g.dir, 3.2));
    S.cone(G, M.leather, add(g.at, mul(g.dir, -2.6)), 0.95, top, 1.15, { piece: o.piece, part, big: true });
    const fp = S.newPart();
    for (const [dx, dz] of [[-0.5, 1.0], [0.5, 1.5], [0.0, 0.7]] as [number, number][]) {
      const b = add(top, add(mul(norm(g.flat), dx), mul(g.dir, 0.1)));
      S.cone(S.group(0), o.elite ? M.bone : M.cloth, b, 0.5, add(b, mul(g.dir, dz + 0.6)), 0.45, { piece: o.piece, part: fp });
    }
  },
  /** Сумка (подрывник, метатель): кожаный мешок с клапаном. */
  satchel: (m: Mat = M.leather): WeaponFn => (S, g, o) => {
    S.ell(S.group(0.3), m, g.at, [1.6, 1.0, 1.4], frameOf(g.dir, g.flat), { piece: o.piece, part: S.newPart(), big: true });
    S.ell(S.group(0), M.leather, add(g.at, mul(g.dir, 0.9)), [1.7, 1.1, 0.5], frameOf(g.dir, g.flat), { piece: o.piece, part: S.newPart() });
  },
  /**
   * Посох с навершием: skull — череп зверя, totem — коряга с ракушками, gem — камень (светится в чарах).
   * len — от хвата до навершия.
   */
  staff: (top: "skull" | "totem" | "gem" | "fang", len = 11, glow: Ramp = SOUL, low = 6.5): WeaponFn => (S, g, o) => {
    const w = norm(g.dir);
    const fwd = norm(sub(g.flat, mul(w, dot(g.flat, w))));
    const side = cross(w, fwd);
    haft(S, g, o, -low, len, 0.9, top === "totem" ? M.wood : M.bowwood, top === "totem" ? 1.1 : 0.9);
    const tc = add(g.at, mul(w, len + 1.2));
    if (top === "skull" || top === "fang") {
      S.ell(S.group(0.5), M.bone, tc, [1.4, 2.1, 1.3], [side, fwd, w], { piece: o.piece, part: S.newPart(), big: true });
      S.ell(S.group(0), M.bone, add(tc, add(mul(fwd, 1.8), mul(w, -0.6))), [0.9, 1.2, 0.7], [side, fwd, w], { piece: o.piece, part: S.newPart(), tone: -0.3 });
      if (top === "fang") for (const sv of [-1, 1]) S.cone(S.group(0), M.bone, add(tc, mul(side, 0.8 * sv)), 0.55, add(tc, add(mul(side, 1.6 * sv), mul(w, 2.0))), 0.2, { piece: o.piece, part: S.newPart() });
      // перья у навершия
      const fp = S.newPart();
      for (const sv of [-1, 1]) S.cone(S.group(0), M.red, add(add(g.at, mul(w, len - 0.6)), mul(side, 0.6 * sv)), 0.55, add(add(g.at, mul(w, len - 3.2)), mul(side, 1.3 * sv)), 0.45, { piece: o.piece, part: fp });
    } else if (top === "totem") {
      const G = S.group(0.4);
      const pp = S.newPart();
      S.cone(G, M.wood, add(g.at, mul(w, len)), 1.1, add(tc, mul(side, 1.6)), 0.7, { piece: o.piece, part: pp });
      S.cone(G, M.wood, add(g.at, mul(w, len)), 1.1, add(tc, add(mul(side, -1.4), mul(w, 0.6))), 0.6, { piece: o.piece, part: pp });
      for (const sv of [-1.4, 1.2]) S.ell(S.group(0), M.bone, add(add(g.at, mul(w, len - 1.6)), mul(side, sv)), [0.7, 0.5, 0.9], [side, fwd, w], { piece: o.piece, part: S.newPart() });
    }
    if (top === "gem" || o.elite || o.k > 0.2) {
      const gm = glowMat("камень чар", glow, o.k > 0.5 ? 3.2 : 2.4);
      S.ball(S.group(0), gm, add(tc, mul(fwd, top === "gem" ? 0 : 0.4)), top === "gem" ? 1.3 : 0.75, { piece: o.piece, part: S.newPart() });
    }
  },
  /** Свирель (флейта Пана): связка трубок разной длины, вниз от хвата. */
  panflute: (): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    const G = S.group(0.2);
    const pp = S.newPart();
    const ls = [3.6, 3.0, 2.4, 1.9];
    ls.forEach((l, k) => S.cone(G, o.elite ? M.horn : M.reed, at(g, w, -0.6, side, (k - 1.5) * 0.85), 0.55, at(g, w, l - 0.6, side, (k - 1.5) * 0.85), 0.5, { piece: o.piece, part: pp }));
    S.box(S.group(0), M.rope, at(g, w, 0.4), [1.9, 0.75, 0.35], axOf(g).ax, 0.2, { piece: o.piece, part: S.newPart() });
  },
  /** Праща: два шнура и ремень с камнем, висят от кисти по направлению оружия. */
  sling: (): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    const G = S.group(0.2);
    const pp = S.newPart();
    S.cone(G, M.rope, at(g, w, 0.2, side, 0), 0.45, at(g, w, 3.0, side, 0.6), 0.45, { piece: o.piece, part: pp });
    S.ell(S.group(0.3), M.leather, at(g, w, 3.4, side, 0.5), [1.0, 0.7, 0.8], axOf(g).ax, { piece: o.piece, part: S.newPart() });
    if (o.k >= 0) S.ball(S.group(0), M.stone, at(g, w, 3.7, side, 0.4), 0.7, { piece: o.piece, part: S.newPart() });
  },
  /** Горшок с порохом: глиняный, с фитилём. */
  pot: (): WeaponFn => (S, g, o) => {
    if (o.k < 0) return;
    const c = add(g.at, [0, 0.2, 0.6]);
    S.ball(S.group(0.3), M.clay, c, 1.35, { piece: o.piece, part: S.newPart(), big: true });
    S.cone(S.group(0), M.rope, add(c, [0, 0, 1.0]), 0.5, add(c, [0.4, 0.2, 2.2]), 0.4, { piece: o.piece, part: S.newPart() });
  },
  /** Камень в кулаке (метатель). */
  rock: (r = 1.0): WeaponFn => (S, g, o) => {
    if (o.k < 0) return;
    S.ball(S.group(0), M.stone, add(g.at, [0, 0.3, 0.3]), r, { piece: o.piece, part: S.newPart() });
  },
  /** Бревно-дубина тролля: толстое, с сучьями; усиленный — с вросшими камнями и железным обручем. */
  log: (len = 11): WeaponFn => (S, g, o) => {
    const { w, side } = axOf(g);
    const G = S.group(0.4);
    const pp = S.newPart();
    S.cone(G, M.wood, at(g, w, -2.0), 1.0, at(g, w, len), 2.3, { piece: o.piece, part: pp, tex: furTex(11, 0.14) });
    S.ball(G, M.wood, at(g, w, len), 2.3, { piece: o.piece, part: pp });
    S.cone(S.group(0), M.wood, at(g, w, len * 0.55, side, 0.6), 0.6, at(g, w, len * 0.7, side, 3.0), 0.35, { piece: o.piece, part: S.newPart() });
    if (o.elite) {
      S.cone(S.group(0), M.iron, at(g, w, len * 0.7), 2.25, at(g, w, len * 0.7 + 0.8), 2.3, { piece: o.piece, part: S.newPart() });
      for (const [u, sv] of [[len + 0.4, 1.6], [len - 1.2, -1.8]] as [number, number][]) S.ball(S.group(0), M.stone, at(g, w, u, side, sv), 1.0, { piece: o.piece, part: S.newPart() });
    }
  },
};

/** Лук: плечи дугой (выпуклость — от тетивы). Усиленный — рекурсивный. */
export function bowGeom(g: Grip, elite: boolean): { pts: V3[]; tips: [V3, V3] } {
  const n = norm(g.flat);
  const upv = norm(sub(g.dir, mul(n, dot(g.dir, n))));
  const H = elite ? 6.6 : 6.2;
  const pts: V3[] = [];
  for (let k = -4; k <= 4; k++) {
    const sv = k / 4;
    let back = 1.7 * (1 - sv * sv);
    if (elite) back -= Math.abs(sv) > 0.6 ? (0.9 * (Math.abs(sv) - 0.6)) / 0.4 : 0;
    pts.push(add(g.at, add(mul(upv, H * sv), mul(n, -back))));
  }
  return { pts, tips: [pts[0], pts[pts.length - 1]] };
}

// ---------------- анимации ----------------
export type Anim = "idle" | "walk" | "attack" | "death";
export const ANIM_LIST: Anim[] = ["idle", "walk", "attack", "death"];
export interface AnimDef { col: number; n: number; fps: number; loop: boolean; ru: string; hit?: number }
const ATK: Record<Kind, { n: number; fps: number; ru: string; hit: number }> = {
  slash: { n: 9, fps: 14, ru: "удар", hit: 3 },
  chop2h: { n: 10, fps: 12, ru: "удар", hit: 4 },
  thrust: { n: 9, fps: 14, ru: "выпад", hit: 3 },
  bow: { n: 10, fps: 12, ru: "выстрел", hit: 6 },
  cast: { n: 10, fps: 12, ru: "каст", hit: 6 },
  handcast: { n: 10, fps: 12, ru: "каст", hit: 6 },
  flute: { n: 10, fps: 10, ru: "мелодия", hit: 6 },
  throw: { n: 10, fps: 14, ru: "бросок", hit: 4 },
  claw: { n: 9, fps: 14, ru: "удар", hit: 3 },
  leap: { n: 10, fps: 14, ru: "прыжок", hit: 5 },
};
export function animsOf(role: RoleDef): Record<Anim, AnimDef> {
  const a = ATK[role.kind];
  return {
    idle: { col: 0, n: 12, fps: 10, loop: true, ru: "покой" },
    walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
    attack: { col: 24, n: a.n, fps: a.fps, loop: false, ru: a.ru, hit: a.hit },
    death: { col: 24 + a.n, n: 12, fps: 12, loop: false, ru: "гибель" },
  };
}

interface FrameExtra {
  trail?: V3[][]; flash?: { at: V3; k: number; ramp?: Ramp }; motes?: V3[]; orb?: number; proj?: V3; death?: number; dust?: { at: V3; k: number }[]; notes?: V3[];
}
type Frame = { p: Pose; ex?: FrameExtra };
const ipx = (v: number) => Math.round(v);

function idleFrames(cr: Creature, v: Variant): Frame[] {
  const R0 = restPose(cr, v.role);
  const chest = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (i / 12) * Math.PI * 2;
    const p: Pose = { ...R0, chest: chest[i], jaw: i === 6 || i === 7 ? 1 : 0, head: [i === 6 ? 1 : 0, 0] };
    const sw = ipx(Math.sin(ph) * 0.6);
    if (!v.role.shield && v.role.kind !== "bow") p.hL = add(R0.hL, [0, sw * 0.5, 0]);
    p.glow = 0.8 + 0.2 * Math.sin(ph);
    p.tail = Math.sin(ph) * 1.2;
    p.flap = Math.sin(ph) * 0.5 + 0.5;
    p.blink = i === 9 ? 1 : 0;
    p.sway = 0.15 * Math.sin(ph);
    return { p };
  });
}
function walkFrames(cr: Creature, v: Variant): Frame[] {
  const R0 = restPose(cr, v.role);
  const st = cr.dims.stride ?? 1.7;
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (i / 12) * Math.PI * 2;
    const p: Pose = { ...R0 };
    const lift = (a: number) => Math.max(0, Math.sin(a)) * 1.4;
    p.fR = [cr.dims.footX, st * Math.cos(ph), 1.0 + lift(ph)];
    p.fL = [-cr.dims.footX, st * Math.cos(ph + Math.PI), 1.0 + lift(ph + Math.PI)];
    p.core = [0, 0, -ipx(Math.abs(Math.cos(ph)) * 1.0) * 1.03];
    const sw = Math.cos(ph) * 1.5;
    const k = v.role.kind;
    p.hR = add(R0.hR, [0, -sw * (k === "slash" || k === "chop2h" || k === "thrust" || k === "cast" ? 0.5 : 0.9), 0.15 * Math.abs(sw)]);
    p.hL = v.role.shield || k === "bow" ? add(R0.hL, [0, sw * 0.4, 0]) : add(R0.hL, [0, sw * 0.9, 0.15 * Math.abs(sw)]);
    p.jaw = i === 3 || i === 9 ? 1 : 0;
    p.sway = 0.5 + 0.3 * Math.sin(ph * 2);
    p.tail = Math.sin(ph) * 1.6;
    p.flap = 0.5 + 0.5 * Math.sin(ph * 2);
    return { p };
  });
}

interface Key { f: number; p: Partial<Pose>; ease?: (t: number) => number }
function slerpDir(a: V3, b: V3, t: number): V3 {
  const A = norm(a), B = norm(b);
  const c = clamp(dot(A, B), -1, 1);
  const ang = Math.acos(c);
  if (ang < 1e-3) return B;
  let ax = cross(A, B);
  if (vlen(ax) < 1e-4) ax = [1, 0, 0];
  return norm(rotAxis(A, ax, ang * t));
}
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    const x = a[k] as unknown, y = b[k] as unknown;
    if (typeof x === "number") o[k] = lerp(x, y as number, t);
    else if (Array.isArray(x) && typeof x[0] === "number") o[k] = (x as number[]).map((q, i) => lerp(q, (y as number[])[i], t));
    else if (Array.isArray(x)) o[k] = (x as V3[]).map((q, i) => (i === 0 ? slerpDir(q, (y as V3[])[i], t) : norm(lerpV(q, (y as V3[])[i], t))));
  }
  return o as unknown as Pose;
}
function keyed(base: Pose, keys: Key[], n: number): Pose[] {
  const full: { f: number; p: Pose; ease?: (t: number) => number }[] = [];
  let cur = base;
  for (const k of keys) {
    cur = { ...cur, ...k.p };
    full.push({ f: k.f, p: cur, ease: k.ease });
  }
  return Array.from({ length: n }, (_, f) => {
    let i = 0;
    while (i + 1 < full.length && full[i + 1].f <= f) i++;
    const a = full[i], b = full[Math.min(i + 1, full.length - 1)];
    const t = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f);
    return lerpPose(a.p, b.p, (b.ease ?? easeInOut)(clamp(t, 0, 1)));
  });
}

/** Точки острия по позам (мир, после масштаба) — для следа. */
type TipFn = (p: Pose) => V3;

function attackFrames(cr: Creature, v: Variant, view: View): Frame[] {
  const d = cr.dims;
  const role = v.role;
  const R0 = restPose(cr, role);
  const H = (s: 1 | -1, x: number, y: number, z: number) => handAt(d, s, [x, y, z]);
  const tipOf = (side: 0 | 1): TipFn => (p) => {
    const B = buildBody(cr, v, p, view, "attack");
    return (side ? B.tipL : B.tipR) ?? B.hand[side];
  };
  const arc = (tip: TipFn, a: Pose, b: Pose, steps = 6) => Array.from({ length: steps + 1 }, (_, k) => tip(lerpPose(a, b, k / steps)));
  const restKey: Partial<Pose> = { hR: R0.hR, wR: R0.wR, hL: R0.hL, wL: R0.wL, yaw: 0, core: [0, 0, 0], lean: 0, grip2: 0, charge: 0 };
  switch (role.kind) {
    case "slash": {
      const upK: Partial<Pose> = { hR: H(1, -0.5, -1.3, 0.9), wR: [norm([0.25, -0.55, 0.8]), [1, 0, 0]], yaw: rad(16), hL: role.shield ? H(-1, -0.9, 3.5, -4.7) : H(-1, 0.6, 2.0, -5.8) };
      const hit: Partial<Pose> = { hR: H(1, -5.1, 5.5, -5.5), wR: [norm([-0.55, 0.7, -0.4]), [0, 0, 1]], yaw: rad(-18), core: [0, 1.0, 0], hL: role.shield ? H(-1, 0.3, 1.1, -5.7) : H(-1, 1.8, -1.0, -6.2) };
      const fol: Partial<Pose> = { hR: H(1, -6.7, 4.3, -7.3), wR: [norm([-0.8, 0.3, -0.5]), [0, 0, 1]], yaw: rad(-22), core: [0, 1.0, 0] };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: upK, ease: easeOut }, { f: 3, p: hit, ease: linear }, { f: 4, p: fol, ease: easeOut }, { f: 5, p: { ...fol, hR: H(1, -6.3, 4.1, -7.1) } }, { f: 8, p: restKey }], 9);
      const t = tipOf(0);
      return ps.map((p, f) => ({ p: { ...p, jaw: f >= 2 && f <= 4 ? 1 : 0 }, ex: f === 3 ? { trail: [arc(t, ps[2], ps[3])] } : f === 4 ? { trail: [arc(t, lerpPose(ps[2], ps[3], 0.55), ps[4], 5)] } : undefined }));
    }
    case "chop2h": {
      const raise: Partial<Pose> = { hR: H(1, -3.4, -0.6, 3.6), wR: [norm([0.1, -0.75, 0.65]), [1, 0, 0]], grip2: 1, lean: rad(6), yaw: rad(8) };
      const top: Partial<Pose> = { hR: H(1, -3.6, -1.2, 4.2), wR: [norm([0.05, -0.9, 0.42]), [1, 0, 0]], grip2: 1, lean: rad(8), jaw: 1 };
      const slam: Partial<Pose> = { hR: H(1, -4.0, 4.4, -5.4), wR: [norm([0, 0.6, -0.8]), [1, 0, 0]], core: [0, 1.0, -1.03], lean: rad(-12), yaw: rad(-4), grip2: 1 };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: raise, ease: easeOut }, { f: 3, p: top }, { f: 4, p: slam, ease: easeIn }, { f: 6, p: { ...slam, core: [0, 1.0, 0] } }, { f: 9, p: restKey }], 10);
      const t = tipOf(0);
      return ps.map((p, f) => {
        const ex: FrameExtra = {};
        if (f === 4) ex.trail = [arc(t, ps[3], ps[4])];
        if (f === 4 || f === 5) ex.dust = [{ at: [t(ps[4])[0], t(ps[4])[1], 0], k: f === 4 ? 0.5 : 1 }];
        return { p: { ...p, jaw: f >= 2 && f <= 5 ? 1 : 0 }, ex };
      });
    }
    case "thrust": {
      const ready: Partial<Pose> = { hR: H(1, -1.5, -1.6, -3.4), wR: [norm([-0.15, 0.8, 0.55]), [1, 0, 0]], hL: H(-1, -1.5, 3.0, -3.0), yaw: rad(14) };
      const hit: Partial<Pose> = { hR: H(1, -3.0, 3.6, -2.6), wR: [norm([-0.1, 0.86, 0.48]), [1, 0, 0]], core: [0, 1.0, 0], lean: rad(-8), yaw: rad(-10), hL: H(-1, 0.8, 1.0, -5.5) };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: ready, ease: easeOut }, { f: 3, p: hit, ease: linear }, { f: 4, p: { ...hit } }, { f: 5, p: { ...hit, hR: H(1, -2.8, 3.0, -2.8) } }, { f: 8, p: restKey }], 9);
      const t = tipOf(0);
      return ps.map((p, f) => ({ p: { ...p, jaw: f >= 2 && f <= 4 ? 1 : 0 }, ex: f === 3 ? { trail: [arc(t, ps[2], ps[3])] } : f === 4 ? { flash: { at: t(ps[4]), k: 0.25, ramp: FLASH } } : undefined }));
    }
    case "bow": {
      const raise: Partial<Pose> = { yaw: rad(-22), hL: H(-1, -0.7, 5.9, -1.3), wL: [norm([-0.1, 0.05, 1]), norm([0.62, -0.78, 0])], hR: H(1, -6.7, 4.1, -1.1), arrow: 1, draw: 0.1 };
      const drawn: Partial<Pose> = { hR: H(1, -3.6, 0.5, -0.7), draw: 1, arrow: 1 };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: raise, ease: easeOut }, { f: 5, p: drawn }, { f: 6, p: { draw: 0, arrow: 0, hR: H(1, -1.9, -0.7, -0.3) }, ease: linear }, { f: 7, p: { draw: -0.12 } }, { f: 9, p: { ...restKey, draw: 0, arrow: 0 } }], 10);
      return ps.map((p, f) => {
        const q = { ...p, arrow: f >= 1 && f <= 5 ? 1 : 0, draw: f === 6 ? 0 : p.draw };
        const hl = buildBody(cr, v, q, view, "attack").hand[1];
        const s = cr.scale[v.elite ? 1 : 0];
        return { p: q, ex: f === 6 ? { flash: { at: add(hl, [0, 3.2 * s, 0.2]), k: 0.35, ramp: FLASH } } : f === 7 ? { flash: { at: add(hl, [0, 6.0 * s, 0.2]), k: 0.1, ramp: FLASH } } : undefined };
      });
    }
    case "cast": {
      const raise: Partial<Pose> = { hR: H(1, 0.9, 2.9, -5.1), wR: [norm([0.22, 0.36, 0.9]), [0, 1, 0]], hL: H(-1, -1.5, 4.5, -3.5), charge: 0.15 };
      const gather: Partial<Pose> = { charge: 1, hL: H(-1, -1.9, 4.9, -2.7) };
      const thrust: Partial<Pose> = { hR: H(1, 0.5, 3.9, -5.3), wR: [norm([0.18, 0.48, 0.86]), [0, 1, 0]], core: [0, 1.0, 0], charge: 0 };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: raise, ease: easeOut }, { f: 5, p: gather }, { f: 6, p: thrust, ease: linear }, { f: 7, p: { ...thrust } }, { f: 9, p: restKey }], 10);
      return castFx(cr, v, view, ps, (B) => B.focus!);
    }
    case "handcast": {
      const raise: Partial<Pose> = { hR: H(1, -2.6, 4.0, -3.2), hL: H(-1, -2.6, 4.0, -3.2), charge: 0.15, lean: rad(4) };
      const gather: Partial<Pose> = { hR: H(1, -2.2, 3.6, -2.4), hL: H(-1, -2.2, 3.6, -2.4), charge: 1 };
      const thrust: Partial<Pose> = { hR: H(1, -3.0, 5.6, -2.6), hL: H(-1, -3.0, 5.6, -2.6), core: [0, 1.0, 0], charge: 0, lean: rad(-8) };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: raise, ease: easeOut }, { f: 5, p: gather }, { f: 6, p: thrust, ease: linear }, { f: 7, p: { ...thrust } }, { f: 9, p: restKey }], 10);
      return castFx(cr, v, view, ps, (B) => add(lerpV(B.hand[0], B.hand[1], 0.5), [0, 1.6, 0.6]));
    }
    case "flute": {
      const play: Partial<Pose> = { hR: H(1, -3.6, 3.6, 3.4), wR: [norm([0.05, 0.25, -0.97]), [0, 1, 0]], hL: H(-1, -2.4, 3.4, 2.6), charge: 0.5 };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: play, ease: easeOut }, { f: 4, p: { ...play, head: [0, 1], charge: 1 } }, { f: 6, p: { ...play, head: [0, 0], charge: 1 } }, { f: 7, p: { ...play, charge: 0.3 } }, { f: 9, p: restKey }], 10);
      return ps.map((p, f) => {
        const B = buildBody(cr, v, p, view, "attack");
        const m = B.mouth;
        const s = cr.scale[v.elite ? 1 : 0];
        const ex: FrameExtra = {};
        if (f >= 3 && f <= 7) ex.notes = [0, 1].map((k) => {
          const age = (f - 3 + k * 2) % 5;
          return add(m, [(k ? -1 : 1) * (1.5 + age * 0.9) * s, (2.5 + age * 1.3) * s, (1.0 + age * 1.4 + Math.sin(age * 1.7) * 0.6) * s]);
        });
        if (f === 6) ex.flash = { at: add(m, [0, 3.0 * s, 1.5 * s]), k: 0.45, ramp: role.fx ?? SOUL };
        return { p: { ...p, jaw: 0 }, ex };
      });
    }
    case "throw": {
      const wind: Partial<Pose> = { hR: H(1, 0.4, -3.6, 1.6), wR: [norm([0, -0.3, 1]), [1, 0, 0]], yaw: rad(16), hL: H(-1, -1.0, 3.4, -3.2), lean: rad(5) };
      const rel: Partial<Pose> = { hR: H(1, -3.0, 5.0, -1.6), wR: [norm([0, 0.9, 0.3]), [1, 0, 0]], yaw: rad(-16), core: [0, 1.0, 0], lean: rad(-8), hL: H(-1, 1.4, -0.6, -6.0) };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: wind, ease: easeOut }, { f: 3, p: { ...wind, hR: H(1, 0.0, -3.0, 2.2) } }, { f: 4, p: rel, ease: easeIn }, { f: 5, p: { ...rel } }, { f: 9, p: restKey }], 10);
      const s = cr.scale[v.elite ? 1 : 0];
      return ps.map((p, f) => {
        const ex: FrameExtra = {};
        const hold = f < 4;
        const B = buildBody(cr, v, { ...p, draw: hold ? 0 : 1 }, view, "attack");
        if (f >= 4 && f <= 6) {
          const h = B.hand[0];
          ex.proj = add(h, [0, (2.6 + (f - 4) * 3.4) * s, (0.8 + (f - 4) * 0.9 - (f - 4) * (f - 4) * 0.25) * s]);
        }
        if (f === 4) ex.trail = [arc(tipOf(0), ps[3], ps[4], 4)];
        return { p: { ...p, jaw: f >= 3 && f <= 5 ? 1 : 0, draw: hold ? 0 : f <= 7 ? 1 : 0 }, ex };
      });
    }
    case "claw": {
      const upK: Partial<Pose> = { hR: H(1, 0.6, -0.4, 0.6), hL: H(-1, 0.6, -0.4, 0.6), wR: [norm([0.2, 0.2, 1]), [1, 0, 0]], wL: [norm([-0.2, 0.2, 1]), [-1, 0, 0]], yaw: rad(12), lean: rad(4) };
      const hitR: Partial<Pose> = { hR: H(1, -4.6, 5.0, -4.6), wR: [norm([-0.5, 0.7, -0.5]), [0, 0, 1]], yaw: rad(-16), core: [0, 1.0, 0], lean: rad(-8) };
      const hitL: Partial<Pose> = { hL: H(-1, -4.6, 5.0, -4.6), wL: [norm([0.5, 0.7, -0.5]), [0, 0, 1]], hR: H(1, 0.8, 2.0, -4.0), wR: [norm([0.2, 0.4, 0.9]), [1, 0, 0]], yaw: rad(16) };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: upK, ease: easeOut }, { f: 3, p: hitR, ease: linear }, { f: 4, p: { hL: H(-1, 0.2, -0.8, 0.4) } }, { f: 5, p: hitL, ease: linear }, { f: 6, p: { ...hitL } }, { f: 8, p: restKey }], 9);
      return ps.map((p, f) => ({ p: { ...p, jaw: f >= 2 && f <= 6 ? 1 : 0 }, ex: f === 3 ? { trail: [arc(tipOf(0), ps[2], ps[3])] } : f === 5 ? { trail: [arc(tipOf(1), ps[4], ps[5])] } : undefined }));
    }
    case "leap": {
      const crouch: Partial<Pose> = { core: [0, -0.5, -2.06], lean: rad(-14), hR: H(1, 1.6, -2.0, -4.0), hL: H(-1, 1.6, -2.0, -4.0), fR: [d.footX, 0.6, 1.0], fL: [-d.footX, -0.6, 1.0] };
      const air: Partial<Pose> = { core: [0, 1.4, 2.06], lean: rad(-18), hR: H(1, -3.0, 4.4, -2.2), hL: H(-1, -3.0, 4.4, -2.2), fR: [d.footX, 1.0, 3.2], fL: [-d.footX, 0.2, 2.6], wR: [norm([-0.1, 0.8, 0.1]), [1, 0, 0]], wL: [norm([0.1, 0.8, 0.1]), [-1, 0, 0]] };
      const land: Partial<Pose> = { core: [0, 1.4, -1.03], lean: rad(-14), hR: H(1, -3.2, 3.6, -5.6), hL: H(-1, -3.2, 3.6, -5.6), fR: [d.footX, 2.2, 1.0], fL: [-d.footX, 1.4, 1.0] };
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: crouch, ease: easeOut }, { f: 4, p: air, ease: easeOut }, { f: 5, p: land, ease: easeIn }, { f: 6, p: { ...land } }, { f: 9, p: { ...restKey, fR: R0.fR, fL: R0.fL } }], 10);
      return ps.map((p, f) => {
        const ex: FrameExtra = {};
        if (f === 5) ex.trail = [arc(tipOf(0), ps[4], ps[5], 4), arc(tipOf(1), ps[4], ps[5], 4)];
        if (f === 5 || f === 6) ex.dust = [{ at: [0, 3.0 * cr.scale[v.elite ? 1 : 0], 0], k: f === 5 ? 0.5 : 1 }];
        return { p: { ...p, jaw: f >= 3 && f <= 6 ? 1 : 0 }, ex };
      });
    }
  }
}
const FLASH: Ramp = [hex("#8a7a5a"), hex("#d8c8a0"), hex("#fff4d8"), hex("#fffbf0"), hex("#ffffff")];

function castFx(cr: Creature, v: Variant, view: View, ps: Pose[], focusOf: (B: Built) => V3): Frame[] {
  const s = cr.scale[v.elite ? 1 : 0];
  return ps.map((p, f) => {
    const B = buildBody(cr, v, p, view, "attack");
    const top = focusOf(B);
    const ex: FrameExtra = { orb: f >= 6 ? 0 : p.charge };
    if (f >= 3 && f <= 5) {
      const k = (f - 2) / 3;
      ex.motes = [0, 1, 2].map((m) => {
        const a = m * 2.1 + f * 0.9;
        const r = (5.5 * (1 - k) + 1.6) * s;
        return add(top, [Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.4, Math.sin(a * 1.3) * r * 0.5 - 0.5]);
      });
    }
    if (f === 6) ex.flash = { at: top, k: 1 };
    if (f === 7) ex.flash = { at: add(top, [0, 2.2 * s, 0]), k: 0.3 };
    return { p: { ...p, glow: 1, charge: f >= 6 ? 0 : p.charge, jaw: f >= 4 && f <= 6 ? 1 : 0 }, ex };
  });
}

function deathFrames(cr: Creature, v: Variant): Frame[] {
  const R0 = restPose(cr, v.role);
  const d = cr.dims;
  const buck: Partial<Pose> = { core: [0, -0.4, -1.03], head: [0, -1], jaw: 1, hR: add(R0.hR, [0.6, -0.6, -1.5]), hL: add(R0.hL, [-0.6, -0.4, -1.5]), lean: rad(10) + (d.hunch ?? 0) * 0.5, fR: [d.footX, 0.6, 1.0], fL: [-d.footX, -0.2, 1.0] };
  const ps = keyed(R0, [{ f: 0, p: { core: [0, -1.0, 0], jaw: 1, lean: rad(6) } }, { f: 1, p: { core: [0, -1.0, -1.03], jaw: 1, lean: rad(8) } }, { f: 2, p: buck }], 12);
  return ps.map((p, f) => ({ p: f >= 2 ? { ...ps[2] } : p, ex: f >= 2 ? { death: f } : undefined })).map((F, f) => ({ ...F, p: { ...F.p, glow: Math.max(0, 1 - f / 6), blink: f >= 7 ? 1 : 0 } }));
}

// ---------------- гибель: падение и разлёт оружия ----------------
function qFromAxis(axis: V3, ang: number): [number, number, number, number] {
  const k = norm(axis), s = Math.sin(ang / 2);
  return [Math.cos(ang / 2), k[0] * s, k[1] * s, k[2] * s];
}
function qMul(a: number[], b: number[]): [number, number, number, number] {
  return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
}
function qRot(q: number[], v: V3): V3 {
  const u: V3 = [q[1], q[2], q[3]], s = q[0];
  return add(add(mul(u, 2 * dot(u, v)), mul(v, s * s - dot(u, u))), mul(cross(u, v), 2 * s));
}
function qPow(q: number[], t: number): number[] {
  const ang = 2 * Math.acos(clamp(q[0], -1, 1));
  if (ang < 1e-5) return [1, 0, 0, 0];
  const ax: V3 = norm([q[1], q[2], q[3]]);
  return qFromAxis(ax, ang * t);
}

/** Жёсткий перенос частей piece в координатах вида: p' = c1 + q·(p − c0). */
function rigidView(sc: Scene, view: View, piece: number, q: number[], c0: V3, c1: V3) {
  const P = (p: V3) => fromView(view, add(c1, qRot(q, sub(toView(view, p), c0))));
  const D = (v: V3) => fromView(view, qRot(q, toView(view, v)));
  for (const pr of sc.prims) {
    if (pr.piece !== piece) continue;
    pr.a = P(pr.a);
    pr.b = P(pr.b);
    pr.anc = P(pr.anc);
    pr.ref = D(pr.ref);
    pr.ax = [D(pr.ax[0]), D(pr.ax[1]), D(pr.ax[2])];
  }
  for (const st of sc.stamps) {
    if (st.piece !== piece) continue;
    st.at = P(st.at);
    st.n = D(st.n);
  }
}
/** Низ и габарит части в виде после поворота q вокруг c0 (по концам примитивов с радиусом). */
function extentView(sc: Scene, view: View, piece: number, q: number[], c0: V3) {
  let zmin = 1e9, zmax = -1e9, xmin = 1e9, xmax = -1e9, ymax = -1e9, n = 0;
  for (const pr of sc.prims) {
    if (pr.piece !== piece) continue;
    const r = pr.k === 0 ? Math.max(pr.ra, pr.rb) : Math.max(...pr.r);
    for (const p of [pr.a, pr.b]) {
      const v = qRot(q, sub(toView(view, p), c0));
      zmin = Math.min(zmin, v[2] - r);
      zmax = Math.max(zmax, v[2] + r);
      xmin = Math.min(xmin, v[0] - r);
      xmax = Math.max(xmax, v[0] + r);
      ymax = Math.max(ymax, v[1] + r);
    }
    n++;
  }
  return { zmin, zmax, xmin, xmax, ymax, n };
}
function pieceCenterView(sc: Scene, view: View, piece: number): V3 | null {
  let c: V3 = [0, 0, 0], n = 0;
  for (const pr of sc.prims) {
    if (pr.piece !== piece) continue;
    c = add(c, toView(view, lerpV(pr.a, pr.b, 0.5)));
    n++;
  }
  return n ? mul(c, 1 / n) : null;
}

const LAY_CACHE = new Map<string, { q: number[]; score: number; x: number }>();
function applyDeath(cr: Creature, v: Variant, sc: Scene, view: View, f: number, cam: Cam): { at: V3; k: number }[] {
  const puffs: { at: V3; k: number }[] = [];
  const s = cr.scale[v.elite ? 1 : 0];
  const kind = cr.death ?? "back";
  const t = clamp((f - 2) / 5, 0, 1);
  const tb = f === 8 ? 0.93 : easeIn(t);
  if (kind === "back") {
    // тело: падает навзничь от зрителя и чуть вбок
    const axis: V3 = norm([1, 0.28, 0]);
    const qF = qFromAxis(axis, rad(84));
    const q = qPow(qF, tb);
    const c0: V3 = [0, -1.2 * s, 0];
    const ext = extentView(sc, view, PC_BODY, qF, c0);
    const lift = Math.max(0, -ext.zmin) * clamp(tb * 1.15, 0, 1);
    rigidView(sc, view, PC_BODY, q, c0, add(c0, [0, 0, lift]));
    if (f === 7 || f === 8) puffs.push({ at: [0, -6 * s, 0], k: f === 7 ? 0.5 : 1 }, { at: [3 * s, -2 * s, 0], k: f === 7 ? 0.4 : 0.8 });
  } else if (kind === "side") {
    // набок: валится в плоскости кадра (спереди, сзади и сбоку — во всю ширину), ложится по центру кадра
    const sg = view === "side" ? -1 : view === "down" ? 1 : -1;
    const qF = qMul(qFromAxis([0, 1, 0], rad(-82 * sg)), qFromAxis([1, 0, 0], rad(12)));
    const q = qPow(qF, tb);
    const c0: V3 = [0, 0, 0];
    const ext = extentView(sc, view, PC_BODY, qF, c0);
    const half = cam.N / 2 - 2;
    const cx = clamp(-(ext.xmin + ext.xmax) / 2, -half - ext.xmin, half - ext.xmax);
    const k = clamp(tb * 1.1, 0, 1);
    rigidView(sc, view, PC_BODY, q, c0, [cx * k, -1.0 * s * k, Math.max(0, -ext.zmin) * k]);
    if (f === 7 || f === 8) puffs.push({ at: [cx + (ext.xmin + ext.xmax) / 2 + sg * 6 * s, -1 * s, 0], k: f === 7 ? 0.5 : 1 }, { at: [cx, -1 * s, 0], k: f === 7 ? 0.4 : 0.9 });
  } else if (kind === "roll") {
    // партия 2, звери: заваливается на бок вокруг своей оси «хвост — голова», ложится по центру кадра
    const axis = toView(view, [0, 1, 0]);
    const qF = qFromAxis(axis, rad(84));
    const q = qPow(qF, tb);
    const c0: V3 = [0, 0, 0];
    const ext = extentView(sc, view, PC_BODY, qF, c0);
    const half = cam.N / 2 - 2;
    const cx = clamp(-(ext.xmin + ext.xmax) / 2, -half - ext.xmin, half - ext.xmax);
    const k = clamp(tb * 1.1, 0, 1);
    rigidView(sc, view, PC_BODY, q, c0, [cx * k, 0, Math.max(0, -ext.zmin) * k]);
    if (f === 7 || f === 8) puffs.push({ at: [cx + (ext.xmin + ext.xmax) / 2 + 5 * s, -1 * s, 0], k: f === 7 ? 0.5 : 1 }, { at: [cx - 3 * s, 0, 0], k: f === 7 ? 0.4 : 0.8 });
  } else {
    // оседает: клонится вперёд-вниз и уходит в землю, сверху рассыпается прахом (renderFrame)
    const qF = qFromAxis([1, 0, 0], rad(-24));
    const q = qPow(qF, easeInOut(t));
    rigidView(sc, view, PC_BODY, q, [0, 0, 0], [0, 0, -easeIn(clamp((f - 4) / 7, 0, 1)) * 7 * s]);
    if (f >= 5) puffs.push({ at: [0, 0, 0], k: clamp((f - 4) / 5, 0.3, 1) });
  }
  // оружие: отлетает в сторону и ложится плашмя, по ширине кадра — не за край
  const half = cam.N / 2 - 2;
  for (const [pc, sg] of [[PC_WR, -1], [PC_WL, 1]] as [number, number][]) {
    const c = pieceCenterView(sc, view, pc);
    if (!c) continue;
    const side = sg * (view === "down" ? 1 : view === "up" ? -1 : sg);
    const key = `${cr.id}|${variantId(cr, v)}|${view}|${pc}`;
    let best: { q: number[]; score: number; x: number } | null = LAY_CACHE.get(key) ?? null;
    if (!best) for (let roll = -90; roll <= 90; roll += 15) for (const yawD of [0, 25, -25, 50, -50, 75, -75, 90]) for (const pitch of [0, 90]) {
      const qq = qMul(qFromAxis([0, 0, 1], rad(yawD)), qMul(qFromAxis([0, 1, 0], rad(roll)), qFromAxis([1, 0, 0], rad(pitch))));
      const e = extentView(sc, view, pc, qq, c);
      const x = clamp(side * 7 * s, -half - e.xmin, half - e.xmax);
      const over = Math.max(0, (e.xmax - e.xmin) / 2 - half);
      const score = (e.zmax - e.zmin) * 3 + over * 20 + Math.abs(yawD) * 0.004 + Math.abs(roll) * 0.002;
      if (!best || score < best.score) best = { q: qq, score, x };
    }
    LAY_CACHE.set(key, best!);
    const tw = clamp((f - 1) / 4, 0, 1);
    const qq = qPow(best!.q, easeOut(tw));
    const e = extentView(sc, view, pc, best!.q, c);
    const end: V3 = [best!.x, Math.min(-1.5 * s * (pc === PC_WR ? 1 : -0.3) + 1.0, -e.ymax - 0.2), -e.zmin + 0.1];
    const pos: V3 = [lerp(c[0], end[0], easeOut(tw)), lerp(c[1], end[1], easeOut(tw)), lerp(c[2], end[2], easeIn(tw))];
    {
      // в полёте — тоже в пределах кадра по ширине
      const ee = extentView(sc, view, pc, qq, c);
      pos[0] = clamp(pos[0], -half - ee.xmin, half - ee.xmax);
    }
    rigidView(sc, view, pc, qq, c, pos);
    if (f === 5 || f === 6) puffs.push({ at: [end[0], end[1], 0], k: f === 5 ? 0.4 : 0.8 });
  }
  return puffs;
}

// ---------------- кадр ----------------
export function renderFrame(cr: Creature, v: Variant, view: View, p: Pose, ex: FrameExtra = {}, anim: Anim = "idle"): { img: PC; emis: PC } {
  const cam = camOf(cr);
  const N = cam.N;
  const B = buildBody(cr, v, p, view, anim);
  let dust: { at: V3; k: number }[] = (ex.dust ?? []).map((q) => ({ at: toView(view, q.at), k: q.k }));
  if (ex.death !== undefined) dust = dust.concat(applyDeath(cr, v, B.sc, view, ex.death, cam));
  const R0 = renderScene(cam, B.sc, view, OUT);
  const img = new PC(N, N);
  const emis = R0.emis;
  const fx = v.role.fx ?? SOUL;
  if (ex.trail) for (const tr of ex.trail) drawTrail(cam, img, tr, view, v.elite);
  img.blit(R0.body, 0, 0);
  if (B.bowString && ex.death === undefined) {
    const { a, b, nock } = B.bowString;
    drawLine3(cam, img, R0.gb.t, a, nock, view, STRING);
    drawLine3(cam, img, R0.gb.t, nock, b, view, STRING);
  }
  if ((v.role.kind === "cast" || v.role.kind === "handcast") && ex.orb && ex.orb > 0.05 && ex.death === undefined) {
    const at0 = v.role.kind === "cast" ? B.focus! : add(lerpV(B.hand[0], B.hand[1], 0.5), mul([0, 1.6, 0.6], cr.scale[v.elite ? 1 : 0]));
    drawOrb(cam, img, emis, at0, ex.orb, view, fx);
  }
  if (ex.motes) for (const m of ex.motes) drawMote(cam, img, emis, m, view, fx);
  if (ex.notes) for (const m of ex.notes) drawNote(cam, img, emis, m, view, fx);
  if (ex.proj && v.role.proj) drawProj(cam, img, emis, ex.proj, view, v.role.proj);
  if (ex.flash) drawFlash(cam, img, emis, ex.flash.at, ex.flash.k, view, ex.flash.ramp ?? fx);
  for (const dd of dust) drawDust(cam, img, dd.at, dd.k, cr.dust ?? DUST);
  if (ex.death !== undefined && (cr.death ?? "back") === "crumble" && ex.death >= 5) crumble(cam, img, emis, ex.death, cr.dust ?? DUST);
  thicken(img, OUT, 3, [STRING]);
  sealPinholes(img, OUT, true, 8);
  selout(img);
  // осиротевший контур (кольцо без тела рядом — после распада, второе кольцо) убрать
  {
    const kill: [number, number][] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!isOutPx(img.get(x, y))) continue;
      let body = false;
      for (let dy = -1; dy <= 1 && !body; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = img.get(x + dx, y + dy);
        if (q && q[3] > 120 && !isOutPx(q)) { body = true; break; }
      }
      if (!body) kill.push([x, y]);
    }
    for (const [x, y] of kill) { img.clear(x, y); emis.clear(x, y); }
  }
  // нижний ряд кадра — под линией ступней: то, что выступило вперёд у земли (носок, лезвие в земле), кончается контуром
  // (контур — только там, где над ним цвет тела; если выше уже контур — пиксель убирается, без чёрной плашки)
  for (let x = 0; x < N; x++) {
    if (!img.alpha(x, N - 1)) continue;
    const q = img.get(x, N - 2)!;
    const aboveBody = q[3] > 120 && !(q[0] === OUT[0] && q[1] === OUT[1] && q[2] === OUT[2]);
    if (aboveBody) img.set(x, N - 1, OUT);
    else img.clear(x, N - 1);
    emis.clear(x, N - 1);
  }
  return { img, emis };
}

/** Предел доли контура в кадре (пилот-скелет + 10%); задаётся запуском партии. */
export const OUTLINE_LIMIT = { v: 1, seen: 0 };
const isOutPx = (q: RGBA | null) => !!q && q[3] > 120 && q[0] === OUT[0] && q[1] === OUT[1] && q[2] === OUT[2];
const lumOf = (q: RGBA) => q[0] * 0.3 + q[1] * 0.59 + q[2] * 0.11;
/**
 * Выборочный контур: чёрный — только по краю силуэта (рядом пусто). Внутренние линии цвета контура (между рукой
 * и телом, заделанные щели, второе кольцо) — тёмным тоном соседнего материала.
 */
export function selout(img: PC) {
  const N = img.w, M = img.h;
  for (let pass = 0; pass < 3; pass++) {
    const put: [number, number, RGBA][] = [];
    for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
      if (!isOutPx(img.get(x, y))) continue;
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = img.get(x + dx, y + dy);
        if (!q || q[3] < 120) edge = true;
      }
      if (edge) continue;
      let best: RGBA | null = null;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const q = img.get(x + dx, y + dy);
        if (!q || q[3] < 120 || isOutPx(q)) continue;
        if (!best || lumOf(q) < lumOf(best)) best = q;
      }
      if (best) put.push([x, y, mix(best, [OUT[0], OUT[1], OUT[2], 255], 0.35)]);
    }
    if (!put.length) break;
    for (const [x, y, q] of put) img.set(x, y, [q[0], q[1], q[2], 255]);
  }
}
/** Проверка: пиксели контура без соседа-тела (кольцо толще 1 px) и доля контура в кадре. */
export function outlineStats(sheet: PC, N: number) {
  let worstRatio = 0, thick = 0, at = "";
  for (let r = 0; r < sheet.h / N; r++) for (let c = 0; c < sheet.w / N; c++) {
    let out = 0, all = 0, th = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const q = sheet.get(c * N + x, r * N + y)!;
      if (q[3] < 120) continue;
      all++;
      if (!isOutPx(q)) continue;
      out++;
      let body = false;
      for (let dy = -1; dy <= 1 && !body; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        const p = sheet.get(c * N + xx, r * N + yy)!;
        if (p[3] > 120 && !isOutPx(p)) { body = true; break; }
      }
      if (!body) th++;
    }
    if (all && out / all > worstRatio) { worstRatio = out / all; at = `${r},${c}`; }
    thick += th;
  }
  return { worstRatio, thick, at };
}

/** Распад прахом: пиксели сверху вниз сменяются пылью и исчезают, внизу растёт горка праха. */
function crumble(cam: Cam, img: PC, emis: PC, f: number, ramp: Ramp) {
  const N = cam.N;
  const t = (f - 4) / 7;
  let top = N, l = N, r = -1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (img.alpha(x, y)) { top = Math.min(top, y); l = Math.min(l, x); r = Math.max(r, x); }
  if (r < 0) return;
  const front = top + (N - 2 - top) * t * 1.1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!img.alpha(x, y)) continue;
    const h = hash01(x, y, 77 + f);
    if (f >= 10 || y < front - 2 || (y < front + 1 && h < 0.6)) { img.clear(x, y); emis.clear(x, y); }
    else if (y < front + 3 && h < 0.5) { img.set(x, y, ramp[1 + ((x + y) % 3)]); emis.clear(x, y); }
  }
  // горка праха у ступней
  const cx = (l + r) / 2, w = 4 + 6 * t, hgt = 2 + 3.5 * t;
  for (let y = Math.floor(N - 2 - hgt); y <= N - 2; y++) for (let x = Math.floor(cx - w - 1); x <= cx + w + 1; x++) {
    if (x < 1 || x >= N - 1 || y < 1) continue;
    const dx = (x + 0.5 - cx) / w, dy = (N - 1.5 - y) / hgt;
    const dd = dx * dx + dy;
    if (dd > 1) continue;
    img.set(x, y, ramp[dd < 0.3 ? 3 : dd < 0.65 ? 2 : 1]);
  }
  // контур горки и остатков: только там, где край не обведён
  const isCol = (x: number, y: number) => {
    const q = img.get(x, y);
    return !!q && q[3] > 0 && !(q[0] === OUT[0] && q[1] === OUT[1] && q[2] === OUT[2]);
  };
  const put: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (img.alpha(x, y)) continue;
    if (isCol(x - 1, y) || isCol(x + 1, y) || isCol(x, y - 1) || isCol(x, y + 1)) put.push([x, y]);
  }
  for (const [x, y] of put) img.set(x, y, OUT);
}
function drawLine3(cam: Cam, o: PC, depth: Float32Array, a: V3, b: V3, view: View, col: RGBA) {
  const N = cam.N;
  const A = toView(view, a), Bv = toView(view, b);
  const [x0, y0] = scr(cam, A), [x1, y1] = scr(cam, Bv);
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  let px = -99, py = -99;
  for (let s = 0; s <= n; s++) {
    const t = s / n;
    const x = Math.floor(lerp(x0, x1, t)), y = Math.floor(lerp(y0, y1, t));
    if (x === px && y === py) continue;
    px = x; py = y;
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const dp = depthOf(lerpV(A, Bv, t));
    const i = y * N + x;
    if (o.alpha(x, y) && depth[i] && depth[i] < dp - 0.3) continue;
    o.set(x, y, col);
  }
}
function drawTrail(cam: Cam, o: PC, pts: V3[], view: View, elite: boolean) {
  const N = cam.N;
  const tones = elite ? [hex("#6c7c8a"), hex("#b6c4cc"), hex("#eef6f8")] : [hex("#6a5e4c"), hex("#b0a284"), hex("#e8dcc0")];
  const sp = pts.map((q) => scr(cam, toView(view, q)));
  for (let k = Math.floor((sp.length - 1) * 0.3); k + 1 < sp.length; k++) {
    const f = (k + 1) / (sp.length - 1);
    const tone = f > 0.7 ? 2 : f > 0.45 ? 1 : 0;
    const [x0, y0] = sp[k], [x1, y1] = sp[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= n; s++) {
      const x = lerp(x0, x1, s / n), y = lerp(y0, y1, s / n);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = Math.floor(x + dx), Y = Math.floor(y + dy);
        if (X < 1 || Y < 1 || X >= N - 1 || Y >= N - 1) continue;
        const cur = o.get(X, Y)!;
        const ct = tones.findIndex((t) => t[0] === cur[0] && t[1] === cur[1] && t[2] === cur[2]);
        if (cur[3] && ct >= tone) continue;
        o.set(X, Y, tones[tone]);
      }
    }
  }
}
function drawOrb(cam: Cam, o: PC, emis: PC, at0: V3, k: number, view: View, ramp: Ramp) {
  const N = cam.N;
  const [cx, cy] = scr(cam, toView(view, at0));
  const r = 0.9 + 1.5 * k;
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (dd > 1) continue;
    const c = ramp[dd < 0.35 ? 4 : dd < 0.65 ? 3 : dd < 0.88 ? 2 : 1];
    o.set(x, y, c);
    emis.set(x, y, c);
  }
}
function drawMote(cam: Cam, o: PC, emis: PC, at0: V3, view: View, ramp: Ramp) {
  const N = cam.N;
  const [cx, cy] = scr(cam, toView(view, at0));
  const x = Math.floor(cx), y = Math.floor(cy);
  for (const [dx, dy, t] of [[0, 0, 3], [1, 0, 2], [0, 1, 2], [1, 1, 1]] as [number, number, number][]) {
    if (x + dx < 1 || y + dy < 1 || x + dx >= N - 1 || y + dy >= N - 1) continue;
    o.set(x + dx, y + dy, ramp[t]);
    emis.set(x + dx, y + dy, ramp[t]);
  }
}
/** Нота мелодии: головка 2×2 и штиль вверх, тон чар. */
function drawNote(cam: Cam, o: PC, emis: PC, at0: V3, view: View, ramp: Ramp) {
  const N = cam.N;
  const [cx, cy] = scr(cam, toView(view, at0));
  const x = Math.floor(cx), y = Math.floor(cy);
  for (const [dx, dy, t] of [[0, 0, 3], [1, 0, 2], [0, 1, 2], [1, 1, 1], [1, -1, 3], [1, -2, 3], [2, -2, 2]] as [number, number, number][]) {
    if (x + dx < 1 || y + dy < 1 || x + dx >= N - 1 || y + dy >= N - 1) continue;
    o.set(x + dx, y + dy, ramp[t]);
    emis.set(x + dx, y + dy, ramp[t]);
  }
}
/** Снаряд (камень, горшок): шарик с тенью и контуром; искра фитиля. */
function drawProj(cam: Cam, o: PC, emis: PC, at0: V3, view: View, pr: { ramp: Ramp; r: number; spark?: Ramp }) {
  const N = cam.N;
  const [cx, cy] = scr(cam, toView(view, at0));
  const r = pr.r;
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const dd = Math.hypot(dx, dy);
    if (dd <= r) {
      const l = (-dx - dy) / (r * 1.4);
      o.set(x, y, pr.ramp[clamp(Math.round(2 + l * 1.6), 1, 4)]);
    } else if (dd <= r + 1 && !o.alpha(x, y)) o.set(x, y, OUT);
  }
  if (pr.spark) {
    const x = Math.floor(cx + r * 0.6), y = Math.floor(cy - r - 1);
    for (const [dx, dy, t] of [[0, 0, 4], [1, 0, 3], [0, -1, 3]] as [number, number, number][]) {
      if (x + dx < 1 || y + dy < 1 || x + dx >= N - 1 || y + dy >= N - 1) continue;
      o.set(x + dx, y + dy, pr.spark[t]);
      emis.set(x + dx, y + dy, pr.spark[t]);
    }
  }
}
function drawFlash(cam: Cam, o: PC, emis: PC, at0: V3, k: number, view: View, ramp: Ramp) {
  const N = cam.N;
  const [cx, cy] = scr(cam, toView(view, at0));
  const r = 1.5 + 3.0 * k;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
    const dd = Math.min(dx + dy * 2.2, dx * 2.2 + dy) / r;
    if (dd > 1) continue;
    const c = ramp[dd < 0.3 ? 4 : dd < 0.6 ? 3 : 2];
    o.set(x, y, c);
    emis.set(x, y, c);
  }
}
const DUST = R("#4a3d2e", "#7a6a52", "#a69478", "#cbbc9c");
/** Пыль: плоский клуб у земли; at — уже в координатах вида. */
function drawDust(cam: Cam, o: PC, atv: V3, k: number, ramp: Ramp) {
  const N = cam.N;
  const [cx, cy0] = scr(cam, atv);
  const cy = Math.min(cy0, N - 2.5);
  const rx = 1.6 + 2.6 * k, ry = 0.8 + 0.6 * k;
  for (let y = Math.floor(cy - ry - 1); y <= cy + 1; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const dd = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (dd > 1 - 0.5 * k || o.alpha(x, y)) continue;
    o.set(x, y, ramp[y + 0.5 > cy ? 1 : dd < 0.5 ? 3 : 2]);
  }
}

// ---------------- листы ----------------
const FRAMES: Record<Anim, (cr: Creature, v: Variant, view: View) => Frame[]> = {
  idle: (cr, v) => idleFrames(cr, v),
  walk: (cr, v) => walkFrames(cr, v),
  attack: attackFrames,
  death: (cr, v) => deathFrames(cr, v),
};
export type Sheets = Record<Anim, { sheet: PC; emis: PC }>;
export function buildAnim(cr: Creature, v: Variant, a: Anim): { sheet: PC; emis: PC } {
  const N = camOf(cr).N;
  let sheet: PC | null = null, emis: PC | null = null;
  VIEWS.forEach((view, row) => {
    const fr = FRAMES[a](cr, v, view);
    if (!sheet) { sheet = new PC(N * fr.length, N * 3); emis = new PC(N * fr.length, N * 3); }
    fr.forEach((F, i) => {
      const r = renderFrame(cr, v, view, F.p, F.ex, a);
      sheet!.blit(r.img, i * N, row * N);
      emis!.blit(r.emis, i * N, row * N);
    });
  });
  return { sheet: sheet!, emis: emis! };
}
export const frameAt = (N: number, s: { sheet: PC; emis: PC }, i: number, row: number) => ({ img: crop(s.sheet, i * N, row * N, N, N), emis: crop(s.emis, i * N, row * N, N, N) });

export interface CreatureOut { cr: Creature; vars: Variant[]; sheets: Map<string, Sheets>; problems: string[] }
/** Все варианты образа: листы (сохраняются в sheetDir) и замечания проверок кадров. */
/** Цвет контура героя (warrior.png): контур мобов не темнее него. */
export const HERO_OUT: RGBA = [27, 20, 34, 255];
/**
 * Контур как у героя: пиксель цвета OUT по краю силуэта получает тёмный тон соседнего материала, смешанный с цветом
 * контура героя (тёплый, не чистый чёрный); яркость — не ниже контура героя.
 */
export function tintOutline(img: PC) {
  const W0 = img.w, H0 = img.h;
  const put: [number, number, RGBA][] = [];
  const heroL = lumOf(HERO_OUT);
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) {
    if (!isOutPx(img.get(x, y))) continue;
    let best: RGBA | null = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const q = img.get(x + dx, y + dy);
      if (!q || q[3] < 120 || isOutPx(q)) continue;
      if (!best || lumOf(q) < lumOf(best)) best = q;
    }
    let c = best ? mix(HERO_OUT, [best[0], best[1], best[2], 255], 0.28) : HERO_OUT;
    if (lumOf(c) < heroL) c = HERO_OUT;
    put.push([x, y, [c[0], c[1], c[2], 255]]);
  }
  for (const [x, y, c] of put) img.set(x, y, c);
}
/**
 * Вид контура кадра: lum — средняя яркость пикселей края силуэта; thick — доля пикселей края, у которых сосед внутрь
 * так же тёмный (второй ряд контура). Среднее по всем кадрам листа.
 */
export function outlineLook(sheet: PC, N: number) {
  let ln = 0, lsum = 0, th = 0;
  for (let r = 0; r < sheet.h / N; r++) for (let c = 0; c < sheet.w / N; c++) {
    const g = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? null : sheet.get(c * N + x, r * N + y));
    const op = (x: number, y: number) => { const q = g(x, y); return !!q && q[3] > 120; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!op(x, y)) continue;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !op(x + dx, y + dy));
      if (!dirs.length) continue;
      const q = g(x, y)!;
      const L = lumOf(q);
      ln++;
      lsum += L;
      const [dx, dy] = dirs[0];
      const inn = g(x - dx, y - dy);
      if (inn && inn[3] > 120 && lumOf(inn) <= L + 6 && op(x - 2 * dx, y - 2 * dy)) th++;
    }
  }
  return { lum: ln ? lsum / ln : 0, thick: ln ? th / ln : 0 };
}
export const HERO_LOOK: { v: { lum: number; thick: number } | null; seen: { lum: number; thick: number } } = { v: null, seen: { lum: 999, thick: 0 } };

export function buildCreature(cr: Creature, sheetDir?: string): CreatureOut {
  const N = camOf(cr).N;
  const vars = variantsOf(cr);
  const sheets = new Map<string, Sheets>();
  const problems: string[] = [];
  const rowsRu = VIEWS.map((q) => VIEW_RU[q]);
  for (const v of vars) {
    const id = variantId(cr, v);
    const A = animsOf(v.role);
    const sh = {} as Sheets;
    for (const a of ANIM_LIST) sh[a] = buildAnim(cr, v, a);
    sheets.set(id, sh);
    for (const a of ANIM_LIST) {
      problems.push(...frameEdgeCuts(sh[a].sheet, N, OUT, `${id} ${a}`, rowsRu));
      problems.push(...frameHoles(sh[a].sheet, N, `${id} ${a}`, rowsRu));
      problems.push(...thinLines(sh[a].sheet, N, OUT, `${id} ${a}`, rowsRu, 3, [STRING]));
      const st = outlineStats(sh[a].sheet, N);
      if (st.thick) problems.push(`${id} ${a}: контур толще 1 px — ${st.thick} px`);
      if (st.worstRatio > OUTLINE_LIMIT.v) problems.push(`${id} ${a}: доля контура ${(st.worstRatio * 100).toFixed(1)}% > ${(OUTLINE_LIMIT.v * 100).toFixed(1)}% (кадр ${st.at})`);
      OUTLINE_LIMIT.seen = Math.max(OUTLINE_LIMIT.seen, st.worstRatio);
      // контур как у героя: тон соседнего материала, смешанный с цветом контура героя
      tintOutline(sh[a].sheet);
      if (HERO_LOOK.v) {
        const m = outlineLook(sh[a].sheet, N);
        if (m.lum < HERO_LOOK.v.lum - 0.5) problems.push(`${id} ${a}: контур темнее героя (${m.lum.toFixed(1)} < ${HERO_LOOK.v.lum.toFixed(1)})`);
        if (m.thick > HERO_LOOK.v.thick + 0.02) problems.push(`${id} ${a}: контур толще героя (${m.thick.toFixed(3)} > ${HERO_LOOK.v.thick.toFixed(3)})`);
        HERO_LOOK.seen.lum = Math.min(HERO_LOOK.seen.lum, m.lum);
        HERO_LOOK.seen.thick = Math.max(HERO_LOOK.seen.thick, m.thick);
      }
    }
    if (sheetDir) {
      const cols = A.death.col + A.death.n;
      const sheet = new PC(N * cols, N * 3);
      for (const a of ANIM_LIST) sheet.blit(sh[a].sheet, A[a].col * N, 0);
      fs.mkdirSync(sheetDir, { recursive: true });
      sheet.save(path.join(sheetDir, `${id}.png`));
    }
  }
  return { cr, vars, sheets, problems };
}

// ---------------- монтаж ----------------
export interface Assets { hero: PC; terrain: PC; root: string }
export function loadAssets(root: string): Assets {
  return {
    root,
    hero: loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png")),
    terrain: loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png")),
  };
}
/** Спрайт ×k, ступни на линии yb (низ кадра героя 32 → yb = y + 32k). */
function putSprite(c: PC, img: PC, x: number, yb: number, k: number, flip = false) {
  const y = yb - img.h * k;
  shadowBlob(c, x + (img.w / 2) * k, y + (img.h - 1.5) * k, (img.w / 32) * 6.5 * k, 2.2 * k);
  c.blit(scaleNN(img, k, flip), x, y);
}
function relight(c: PC, emis: PC, x: number, yb: number, k: number, flip = false) {
  const y = yb - emis.h * k;
  c.blit(scaleNN(emis, k, flip), x, y);
  for (let j = 0; j < emis.h; j++) for (let i = 0; i < emis.w; i++) {
    const q = emis.get(flip ? emis.w - 1 - i : i, j)!;
    if (!q[3]) continue;
    for (let dy = -2 * k; dy <= 3 * k; dy++) for (let dx = -2 * k; dx <= 3 * k; dx++) {
      const X = x + i * k + dx, Y = y + j * k + dy;
      const dd = Math.hypot(dx - k / 2, dy - k / 2) / (2.5 * k);
      if (dd > 1 || !c.inside(X, Y)) continue;
      const cur = c.get(X, Y)!;
      c.data.set(mix(cur, [q[0], q[1], q[2], 255], 0.05 * (1 - dd)), (Y * c.w + X) * 4);
    }
  }
}
export interface Item { img: PC; emis: PC | null; flip?: boolean; gap?: number; w?: number }
export function sceneRow(title: string, items: Item[], A: Assets, g: "grass" | "dirt", night: boolean, W: number, k: number, H = 48): Row {
  return {
    h: H * k + 40,
    draw: (c, y0) => {
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, A.terrain, 16, y, W - 32, H * k, k, g);
      const yb = y + (H - 0.5) * k;
      let x = 28;
      const pos: number[] = [];
      for (const it of items) {
        x += it.gap ?? 0;
        putSprite(c, it.img, x, yb, k, it.flip);
        pos.push(x);
        x += (it.w ?? Math.max(30, it.img.w - 2)) * k;
      }
      if (night) {
        nightRect(c, 16, y, W - 32, H * k);
        items.forEach((it, i) => it.emis && relight(c, it.emis, pos[i], yb, k, it.flip));
      }
    },
  };
}
const heroAt = (A: Assets, row: number) => crop(A.hero, 0, row * 32, 32, 32);
const VIEW_ROWS: [number, string][] = [[0, "СПЕРЕДИ"], [2, "СБОКУ"], [1, "СЗАДИ"]];

function animRow(o: CreatureOut, v: Variant, a: Anim, A: Assets, W: number): Row {
  const N = camOf(o.cr).N;
  const D = animsOf(v.role)[a];
  const S0 = o.sheets.get(variantId(o.cr, v))![a];
  const k = 2;
  return {
    h: N * k * 3 + 40,
    draw: (c, y0) => {
      text(c, `×2 · ${o.cr.ru} ${variantRu(v)} · ${D.ru} · ${D.n} КАДРОВ · ${D.fps} К/С${D.loop ? " · ПО КРУГУ" : ""}${D.hit !== undefined ? ` · УДАР — КАДР ${D.hit + 1}` : ""}`, 16, y0 + 8);
      for (const row of [0, 2, 1]) {
        const y = y0 + 34 + [0, 2, 1][row] * N * k;
        groundBg(c, A.terrain, 16, y, W - 32, N * k, k, a === "walk" ? "dirt" : "grass");
        const yb = y + N * k;
        let x = 24;
        putSprite(c, heroAt(A, row), x, yb, k);
        x += 36 * k;
        for (let i = 0; i < D.n; i++) {
          putSprite(c, frameAt(N, S0, i, row).img, x, yb, k);
          x += N * k;
        }
      }
    },
  };
}
/** Превью образа: все роли и варианты, 3 вида, рядом с героем; трава/земля, день/ночь; затем все анимации. */
export function creaturePreview(o: CreatureOut, A: Assets, ref: PC | null): PC {
  const N = camOf(o.cr).N;
  const k = 4;
  const per = (N - 2) * k;
  const W = Math.max(1500, 28 + 32 * k + 40 + o.vars.length * per + 60 + 40 * k + 40);
  const rows: Row[] = [];
  const names = o.vars.map((v) => variantRu(v).toUpperCase()).join(" · ");
  for (const [g, night] of [["grass", false], ["dirt", false], ["grass", true]] as ["grass" | "dirt", boolean][]) {
    for (const [row, vn] of VIEW_ROWS) {
      const items: Item[] = [
        { img: heroAt(A, row), emis: null },
        ...o.vars.map((v, i) => ({ ...frameAt(N, o.sheets.get(variantId(o.cr, v))!.idle, 0, row), gap: i === 0 ? 24 : v.elite && !o.vars[i - 1].elite ? 24 : 0 })),
        { img: heroAt(A, row), emis: null, gap: 24 },
        ...(row === 2 ? [o.vars[0], o.vars[o.vars.length - 1]].map((v) => ({ ...frameAt(N, o.sheets.get(variantId(o.cr, v))!.idle, 0, 2), flip: true })) : []),
      ];
      rows.push(sceneRow(`×4 · ${o.cr.ru.toUpperCase()} · ${vn} · ${g === "grass" ? "ТРАВА" : "ЗЕМЛЯ"} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ | ${names} | ГЕРОЙ${row === 2 ? " · ВЛЕВО" : ""}`, items, A, g, night, W, k, N));
    }
  }
  if (ref) {
    const H = 300;
    rows.push({
      h: H + 40,
      draw: (c, y0) => {
        text(c, "×8 · СВЕТЛЫЙ ФОН · ОБЫЧНЫЙ И УСИЛЕННЫЙ СПЕРЕДИ И СБОКУ | РЕФЕРЕНС", 16, y0 + 8);
        const y = y0 + 34;
        let x = 16;
        const kk = Math.floor(H / N) || 1;
        const pick = [o.vars[0], o.vars.find((v) => v.elite) ?? o.vars[0]];
        fill(c, x, y, 4 * (N * kk - 8 * kk) + 40, H, [206, 200, 188, 255]);
        for (const v of pick) for (const row of [0, 2]) {
          c.blit(scaleNN(frameAt(N, o.sheets.get(variantId(o.cr, v))!.idle, 0, row).img, kk), x, y + H - N * kk);
          x += N * kk - 8 * kk;
        }
        x += 56;
        const rs = scaleBoxFit(ref, H);
        c.blit(rs, x, y);
      },
    });
  }
  for (const v of o.vars) for (const a of ANIM_LIST) rows.push(animRow(o, v, a, A, Math.max(W, 24 + 36 * 2 + 14 * N * 2 + 40)));
  const Wf = Math.max(W, ...rows.map(() => 0), 24 + 36 * 2 + 12 * N * 2 + 40);
  return stackRows(rows, Wf);
}
function scaleBoxFit(src: PC, H: number): PC {
  const w = Math.round((src.w * H) / src.h);
  const o = new PC(w, H);
  const kx = src.w / w, ky = src.h / H;
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let j = Math.floor(y * ky); j < Math.floor((y + 1) * ky); j++) for (let i = Math.floor(x * kx); i < Math.floor((x + 1) * kx); i++) {
      const q = src.get(i, j)!;
      r += q[0]; g += q[1]; b += q[2]; a += q[3]; n++;
    }
    if (n) o.data.set([r / n, g / n, b / n, a / n], (y * w + x) * 4);
  }
  return o;
}

/** Запуск одного образа: листы, превью, проверки. */
export function runCreature(cr: Creature, root: string, outDir: string, quiet = false): CreatureOut {
  const t0 = Date.now();
  if (!HERO_LOOK.v) HERO_LOOK.v = outlineLook(loadAssets(root).hero, 32);
  const o = buildCreature(cr, quiet ? undefined : path.join(outDir, "sheets"));
  if (quiet) return o;
  const A = loadAssets(root);
  const refPath = path.join(root, "tools", "out", "refs", "mobs", cr.ref ?? cr.id, cr.refFile ?? "ref.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  fs.mkdirSync(outDir, { recursive: true });
  creaturePreview(o, A, ref).save(path.join(outDir, `${cr.id}.png`));
  if (o.problems.length) {
    console.warn(`  ${cr.ru}: замечаний по кадрам — ${o.problems.length}:\n${o.problems.slice(0, 40).map((s) => `    ${s}`).join("\n")}`);
    process.exitCode = 1;
  } else console.log(`  ${cr.ru}: кадры чисты (${o.vars.length} вариантов × ${ANIM_LIST.length} анимаций × 3 вида) за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  return o;
}
export const isMainFile = (file: string) => !!process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith(file);
export const rootFromArgv = () => path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
export const BATCH_DIR = (root: string) => path.join(root, "tools", "out", "mobs-batch1");
/** Партия 2 (зоны 40–100, данж, приспешники рейда). */
export const BATCH2_DIR = (root: string) => path.join(root, "tools", "out", "mobs-batch2");
export { ik }; // restPose уже экспортирована объявлением выше
export { easeIn, easeOut, easeInOut, clamp, lerp, crop, stackRows, loadPC, scaleNN, fill, groundBg, text };
export type { Prim, Cam };
