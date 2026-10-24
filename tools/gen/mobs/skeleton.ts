/**
 * Задача 140, пилот метода мобов: оживший скелет (образ — tools/out/refs/mobs/skeleton/ref.png: пожелтевшие кости,
 * остатки ткани на поясе, без свечения глаз). В игру не подключён; client/public/assets и данные не трогает.
 *
 * Кадр 32×32 как у героя, ступни на той же линии (последний ряд тела — 30, контур — 31), макушка — ряд 5, как у героя.
 * Одно тело — три роли через оружие (слои tools/gen/mobs/lib.ts → WeaponFn): мечник (ржавый меч и обломок щита),
 * лучник (старый лук, колчан), костяной заклинатель (посох с черепом). У каждой роли усиленный вариант того же роста:
 * светящиеся глаза, кости толще, лучше оружие (стальной клинок и круглый щит с умбоном, рекурсивный лук с костяными
 * накладками, посох с рогатым черепом и камнем) и обрывки доспеха (ржавый наплечник, наруч, кольчужный подол, железная
 * шапка на черепе).
 *
 * Лист каждого варианта: строки 0 — вниз, 1 — вверх, 2 — вбок вправо (влево — отражение); столбцы — SKEL_ANIMS
 * (покой 12, ходьба 12, атака 9–10, гибель 12 — скелет рассыпается на кости: каждая кость — жёсткая часть, падает
 * с ускорением и ложится на землю, череп подпрыгивает). Таз, грудь и череп в покое и ходьбе сдвигаются только на целые пиксели.
 *
 * Запуск: npx tsx tools/gen/mobs/skeleton.ts → tools/out/mobs-pilot/ (листы skeleton_<роль>[_elite].png,
 * skeleton-preview.png, skeleton-compare.png, skeleton.html). Проверки кадров — край, дыры, линии в 1 px.
 */
import fs from "node:fs";
import path from "node:path";
import {
  MOB_CAM, PC, R, Scene, VIEWS, VIEW_RU, add, clamp, crop, cross, depthOf, dot, easeIn, easeInOut, easeOut, fill, frameEdgeCuts, frameHoles,
  frameOf, fromView, groundBg, hash01, hex, ik, lerp, linear, lerpV, loadPC, mat, mix, mul, nightRect, norm, pngDataUrl, rad, renderScene, rigidPieces, rotAxis,
  saveTo, scaleBox, sealPinholes, thicken, scaleNN, scr, shadowBlob, snapPx, stackRows, stampRows, sub, text, thinLines, toView, vlen,
  type Grip, type Mat, type RGBA, type Row, type Stamp, type TexFn, type V3, type View, type WeaponFn,
} from "./lib";

const cam = MOB_CAM;
const N = cam.N;

// ---------------- палитра (5 тонов на материал) ----------------
/** Пожелтевшая кость: тени бурые, свет — слоновая кость. */
const BONE = R("#3a2b1c", "#6d5636", "#a08656", "#cbb27c", "#eddcab");
/** Ветошь на поясе: серо-бурая, выцветшая. */
const CLOTH = R("#1c1612", "#352a22", "#504034", "#6a5746", "#85725b");
const RUST = R("#26150e", "#512d19", "#7b4524", "#a06535", "#c08752");
const IRON = R("#17191e", "#30343c", "#4f5560", "#79808c", "#adb3bc");
const STEEL = R("#1d2229", "#424b56", "#76808b", "#b1b9c0", "#eef2f2");
const WOOD = R("#1e140c", "#3a2716", "#583d22", "#795731", "#9c7645");
/** Светлое дерево лука и посоха: читается на траве. */
const BOWWOOD = R("#2a190d", "#543518", "#7d5428", "#a6783c", "#cba05a");
const LEATHER = R("#1a110b", "#33231a", "#4c3625", "#664a33", "#836246");
/** Свет души: глаза усиленных и чары заклинателя. */
const SOUL = R("#0d4256", "#1d84a6", "#47c6ea", "#aaf0ff", "#effdff");
const OUT = hex("#170f0a");
const VOID = hex("#140d0a");
const STRING = hex("#c9bb98");

const M_BONE = mat("кость", BONE, { base: 1.85, gain: 2.3 });
const M_CLOTH = mat("ткань", CLOTH, { base: 1.6, gain: 2.2 });
const M_RUST = mat("ржавчина", RUST, { base: 1.6, gain: 2.3 });
const M_IRON = mat("железо", IRON, { base: 1.6, gain: 2.6 });
const M_STEEL = mat("сталь", STEEL, { base: 1.9, gain: 2.2 });
const M_WOOD = mat("дерево", WOOD, { base: 1.7, gain: 2.3 });
const M_BOWWOOD = mat("светлое дерево", BOWWOOD, { base: 1.9, gain: 2.2 });
/** Клинок ржавого меча: светлее простого железа, чтобы читался рядом с костями. */
const M_BLADE = mat("клинок", IRON, { base: 2.3, gain: 2.0 });
const M_LEATHER = mat("кожа", LEATHER, { base: 1.6, gain: 2.3 });
/** Щель между рёбрами: пустота грудной клетки — тёмная, без света (тон задаёт правило). */
const M_GAP = mat("щель", R("#1e140d", "#2e2016", "#3d2b1d", "#4a3524", "#5a4230"), { base: 1.0, gain: 0.6, lo: 0, hi: 2, crisp: true });
const M_SOUL = mat("душа", SOUL, { base: 2.6, gain: 1.2, lo: 1, hi: 4, crisp: true, glow: true });

// ---------------- текстуры ----------------
/** Рёбра: через ряд — щель (пустота в грудной клетке), посередине — грудина спереди, позвоночник сзади. */
const ribTex: TexFn = (c) => {
  if (c.edge) return 0.2;
  const dy = c.y - c.ay, dx = c.x - c.ax;
  if (dy <= -3) return 0.2;
  // грудина спереди и позвоночник сзади — светлый столбик посередине
  if (c.view === "down" && dx === 0 && dy < 1) return 0.4;
  if (c.view === "up" && (dx === 0 || dx === -1)) return dy & 1 ? -0.6 : 0.5;
  return dy & 1 ? { mat: M_GAP, d: c.lum > 0.2 ? 0.6 : 0 } : 0.35;
};
/** Позвонки: через ряд темнее. */
const vertTex: TexFn = (c) => (c.edge ? 0 : (c.y - c.ay) & 1 ? -0.9 : 0.2);
/** Ржавчина пятнами вдоль клинка (в местных координатах — едет вместе с клинком). */
const rustTex = (amount: number): TexFn => (c) => {
  const h = hash01(Math.floor(c.l[2] * 0.9 + 20), Math.floor(c.l[0] * 1.2 + 9), 7);
  return h < amount ? { mat: M_RUST, d: -0.1 } : 0;
};
/** Доски щита: полосы поперёк. */
const plankTex: TexFn = (c) => (c.edge ? 0 : Math.abs(((c.l[0] + 20) % 2.2) - 1.1) < 0.3 ? -1.1 : 0);
/** Кольчуга: светлая точка через пиксель в каждом втором ряду, ряды со сдвигом. */
const mailTex: TexFn = (c) => {
  if (c.edge) return 0;
  const ry = c.y - c.ay + 64, rx = c.x - c.ax + 64;
  return !(ry & 1) && !((rx + (ry >> 1)) & 1) && c.tone > 1.2 && c.tone < 3.4 ? 0.85 : -0.2;
};

// ---------------- роли и варианты ----------------
export type Role = "sword" | "bow" | "mage";
export const ROLES: Role[] = ["sword", "bow", "mage"];
export const ROLE_RU: Record<Role, string> = { sword: "мечник", bow: "лучник", mage: "заклинатель" };
export interface Variant { role: Role; elite: boolean }
export const VARIANTS: Variant[] = [
  { role: "sword", elite: false }, { role: "bow", elite: false }, { role: "mage", elite: false },
  { role: "sword", elite: true }, { role: "bow", elite: true }, { role: "mage", elite: true },
];
export const variantId = (v: Variant) => `skeleton_${v.role}${v.elite ? "_elite" : ""}`;
export const variantRu = (v: Variant) => `${ROLE_RU[v.role]}${v.elite ? "+" : ""}`;

// ---------------- оружие: слои от хвата ----------------
/** Ржавый меч: рукоять в коже, гарда, клинок с ржавыми пятнами и сколотым остриём. Усиленный — длиннее, сталь, гарда с усами. */
const sword: WeaponFn = (S, g, o) => {
  // fl — нормаль к плоскости клинка (смотрит на зрителя плашмя), side — ширина клинка и гарда
  const [fl, , w] = frameOf(g.dir, g.flat);
  const side = cross(w, fl);
  const G = S.group(0.3);
  const part = S.newPart();
  const P = { piece: o.piece, part };
  S.cone(G, M_LEATHER, add(g.at, mul(w, -1.3)), 0.75, add(g.at, mul(w, 0.6)), 0.75, P);
  S.ball(G, o.elite ? M_IRON : M_RUST, add(g.at, mul(w, -1.6)), 0.75, P);
  const G2 = S.group(0);
  const gp = S.newPart();
  const guardC = add(g.at, mul(w, 0.9));
  if (o.elite) {
    S.cone(G2, M_IRON, add(guardC, add(mul(side, -2.0), mul(w, 0.5))), 0.5, guardC, 0.6, { piece: o.piece, part: gp });
    S.cone(G2, M_IRON, guardC, 0.6, add(guardC, add(mul(side, 2.0), mul(w, 0.5))), 0.5, { piece: o.piece, part: gp });
  } else S.box(G2, M_RUST, guardC, [1.6, 0.45, 0.42], [side, cross(w, side), w], 0.2, { piece: o.piece, part: gp });
  const len = o.elite ? 9.2 : 8.0;
  const bc = add(guardC, mul(w, 0.4 + len / 2));
  const bp = S.newPart();
  const ax: [V3, V3, V3] = [side, cross(w, side), w];
  const W = o.elite ? 1.1 : 1.0;
  if (o.elite) {
    // стальной клинок: две половины со срезом наискось — остриё клином
    const Gb = S.group(0);
    for (const sg of [-1, 1]) {
      S.box(Gb, M_STEEL, add(bc, mul(side, (sg * W) / 2)), [W / 2, 0.32, len / 2], ax, 0.15, {
        piece: o.piece, part: bp, big: false, cut: { n: norm([sg * 1.2, 0, 1]), d: len / 2 - 0.9 + (sg * W) / 2 * 1.2 / Math.hypot(1.2, 1) },
      });
    }
  } else {
    // ржавый клинок: пятна ржавчины, остриё сколото наискось
    S.box(S.group(0), M_BLADE, bc, [W, 0.32, len / 2], ax, 0.25, {
      piece: o.piece, part: bp, tex: rustTex(0.36), big: false, cut: { n: norm([0.75, 0, 1]), d: len / 2 - 0.4 },
    });
  }
};
/** Обломок щита: круг досок с отколотым краем и ржавой полосой. Усиленный — целый круглый, железный обод и умбон. */
const shield: WeaponFn = (S, g, o) => {
  const n = norm(g.flat);
  const up = norm(sub(g.dir, mul(n, dot(g.dir, n))));
  const side = cross(up, n);
  const ax: [V3, V3, V3] = [side, up, n];
  const c = add(g.at, mul(n, 0.9));
  const part = S.newPart();
  if (o.elite) {
    S.ell(S.group(0), M_IRON, add(c, mul(n, -0.15)), [3.8, 3.8, 0.7], ax, { piece: o.piece, part: S.newPart(), big: true });
    S.ell(S.group(0), M_BOWWOOD, add(c, mul(n, 0.15)), [3.1, 3.1, 0.8], ax, { piece: o.piece, part, tex: plankTex, big: true });
    S.ball(S.group(0), M_IRON, add(c, mul(n, 0.75)), 1.15, { piece: o.piece, part: S.newPart() });
  } else {
    S.ell(S.group(0), M_BOWWOOD, c, [3.4, 3.6, 0.85], ax, { piece: o.piece, part, tex: plankTex, big: true, cut: { n: norm([0.8, 0.6, 0]), d: 1.9 } });
    S.box(S.group(0), M_RUST, add(c, mul(up, 0.9)), [3.2, 0.6, 0.68], ax, 0.2, { piece: o.piece, part: S.newPart(), cut: { n: norm([0.8, 0.6, 0]), d: 1.6 } });
  }
};
/** Лук: плечи дугой (выпуклость — от тетивы). Усиленный — рекурсивный, тёмное дерево, костяные накладки на концах. */
function bowGeom(g: Grip, elite: boolean): { pts: V3[]; tips: [V3, V3] } {
  const n = norm(g.flat);
  const up = norm(sub(g.dir, mul(n, dot(g.dir, n))));
  const H = elite ? 6.6 : 6.2;
  const pts: V3[] = [];
  for (let k = -4; k <= 4; k++) {
    const s = k / 4;
    let back = 1.7 * (1 - s * s);
    if (elite) back -= 0.9 * Math.max(0, Math.abs(s) - 0.6) / 0.4 * (Math.abs(s) > 0.6 ? 1 : 0);
    pts.push(add(g.at, add(mul(up, H * s), mul(n, -back))));
  }
  return { pts, tips: [pts[0], pts[pts.length - 1]] };
}
const bow: WeaponFn = (S, g, o) => {
  const { pts } = bowGeom(g, o.elite);
  const G = S.group(0.4);
  const part = S.newPart();
  for (let k = 0; k + 1 < pts.length; k++) {
    const mid = Math.abs(k + 0.5 - (pts.length - 1) / 2) / ((pts.length - 1) / 2);
    const r0 = 0.95 - 0.12 * mid;
    const m = o.elite && (k === 0 || k === pts.length - 2) ? M_BONE : o.elite ? M_WOOD : M_BOWWOOD;
    S.cone(G, m, pts[k], r0, pts[k + 1], r0 - 0.05, { piece: o.piece, part });
  }
  // обмотка рукояти
  S.ball(G, o.elite ? M_IRON : M_LEATHER, pts[4], 0.85, { piece: o.piece, part });
};
/** Колчан за спиной (слой роли лучника): кожаный тул, торчат оперения. */
const quiver: WeaponFn = (S, g, o) => {
  const part = S.newPart();
  const G = S.group(0.3);
  const top = add(g.at, mul(g.dir, 3.2));
  S.cone(G, M_LEATHER, add(g.at, mul(g.dir, -2.6)), 0.95, top, 1.15, { piece: o.piece, part, big: true });
  const fp = S.newPart();
  for (const [dx, dz] of [[-0.5, 1.0], [0.5, 1.5], [0.0, 0.7]] as [number, number][]) {
    const b = add(top, add(mul(norm(g.flat), dx), mul(g.dir, 0.1)));
    S.cone(S.group(0), o.elite ? M_BONE : M_CLOTH, b, 0.5, add(b, mul(g.dir, dz + 0.6)), 0.45, { piece: o.piece, part: fp });
  }
};
/** Длина древка над хватом: череп-навершие — вровень с головой скелета, сбоку от неё. */
const STAFF_TOP = 12.4;
/** Посох с черепом: древко, череп-навершие (глазницы — штампом). Усиленный — рога, железные кольца и камень души. */
const staff: WeaponFn = (S, g, o) => {
  const w = norm(g.dir);
  const part = S.newPart();
  const G = S.group(0);
  const bot = add(g.at, mul(w, -7.2)), top = add(g.at, mul(w, STAFF_TOP));
  S.cone(G, M_BOWWOOD, bot, 1.0, top, 1.0, { piece: o.piece, part });
  if (o.elite) {
    for (const u of [-1.2, 5.0, 9.6]) S.cone(S.group(0), M_IRON, add(g.at, mul(w, u)), 0.85, add(g.at, mul(w, u + 0.7)), 0.85, { piece: o.piece, part: S.newPart() });
  }
  const sc = add(top, mul(w, 1.9));
  const sp = S.newPart();
  const fwd = norm(sub(g.flat, mul(w, dot(g.flat, w))));
  const side = cross(w, fwd);
  S.ell(S.group(0.5), M_BONE, sc, [2.3, 2.05, 2.05], [side, fwd, w], { piece: o.piece, part: sp, big: true });
  S.ell(S.group(0), M_BONE, add(sc, add(mul(fwd, 1.1), mul(w, -1.9))), [1.45, 1.0, 0.75], [side, fwd, w], { piece: o.piece, part: S.newPart(), tone: -0.3 });
  if (o.elite) {
    const hp = S.newPart();
    for (const sg of [-1, 1]) {
      const h0 = add(sc, add(mul(side, 1.4 * sg), mul(w, 0.6)));
      const h1 = add(h0, add(mul(side, 1.3 * sg), mul(w, 1.0)));
      const h2 = add(h1, add(mul(side, -0.2 * sg), mul(w, 1.3)));
      const Gh = S.group(0.3);
      S.cone(Gh, M_BONE, h0, 0.65, h1, 0.5, { piece: o.piece, part: hp, tone: -0.4 });
      S.cone(Gh, M_BONE, h1, 0.5, h2, 0.35, { piece: o.piece, part: hp, tone: -0.4 });
    }
  }
  // глазницы черепа-навершия: тёмные; во время чар и у усиленного — светятся
  const glowing = o.elite || o.k > 0.2;
  const eye = o.k > 0.66 || (o.elite && o.k > 0.3) ? "G" : "g";
  const st = (px: Partial<Record<View, ReturnType<typeof stampRows>>>, n: V3): Stamp => ({
    at: add(sc, mul(fwd, 1.7)), n, px, piece: o.piece, depthTol: 3,
    colors: { v: VOID, g: SOUL[2], G: SOUL[4], h: SOUL[3] },
    glow: ["g", "G", "h"], halo: SOUL[2],
  });
  const key = glowing ? (eye === "G" ? "G" : "g") : "v";
  S.stamps.push(st({ down: stampRows([`${key}.${key}`, "..."], -1, 0) }, fwd));
  S.stamps.push(st({ side: stampRows([key], 0, 0) }, norm(add(fwd, mul(side, -0.6)))));
};

// ---------------- поза ----------------
interface Pose {
  /** сдвиг тела в целых пикселях кадра (мир; приводится snapPx в каждом виде): таз, грудь и череп */
  core: V3;
  /** грудь и череп выше таза — целые пиксели; череп сверх груди — [вправо, вверх] целые пиксели модели */
  chest: number;
  head: [number, number];
  jaw: number;
  /** разворот и наклон корпуса (только в атаке и гибели), рад */
  yaw: number; lean: number;
  hR: V3; hL: V3;
  fR: V3; fL: V3;
  /** оружие: направление к острию и «плашмя» для правой и левой руки */
  wR: [V3, V3]; wL: [V3, V3];
  /** натяжение тетивы 0..1, стрела на тетиве */
  draw: number; arrow: number;
  /** свечение глаз (усиленный), сила чар 0..1, вспышка чар 0..1 */
  glow: number; charge: number; burst: number;
  /** ткань на поясе: отлёт назад (ходьба) */
  sway: number;
}
const Z_PELVIS = 7.2;
const HIP_X = 1.9, HIP_Z = 6.7;
const SH_X = 4.5, SH_Z = 16.0;
const ARM: [number, number] = [3.9, 3.7];
const LEG: [number, number] = [3.1, 3.0];
const RIB_C: V3 = [0, 0.3, 13.4];
const SKULL_C: V3 = [0, 0.2, 22.6];

function restPose(role: Role): Pose {
  const p: Pose = {
    core: [0, 0, 0], chest: 0, head: [0, 0], jaw: 0, yaw: 0, lean: 0,
    hR: [6.1, 0.8, 8.8], hL: [-6.1, 0.8, 8.8],
    fR: [2.0, 0.2, 1.0], fL: [-2.0, -0.2, 1.0],
    wR: [[0, 0, 1], [1, 0, 0]], wL: [[0, 0, 1], [-1, 0, 0]],
    draw: 0, arrow: 0, glow: 1, charge: 0, burst: 0, sway: 0,
  };
  if (role === "sword") {
    p.hR = [5.8, 1.8, 9.4];
    p.wR = [norm([0.3, 0.22, 0.93]), norm([0.7, 0.7, 0])];
    p.hL = [-5.4, 2.6, 9.8];
    p.wL = [[0, 0, 1], norm([-0.3, 1, 0])];
  } else if (role === "bow") {
    p.hL = [-6.3, 1.2, 9.2];
    p.wL = [norm([-0.05, 0.25, 0.97]), [1, 0, 0]];
    p.hR = [6.1, 0.6, 8.8];
  } else {
    p.hR = [6.6, 1.6, 10.2];
    p.wR = [norm([0.03, 0.08, 1]), [0, 1, 0]];
    p.hL = [-6.1, 1.0, 8.8];
  }
  return p;
}

// ---------------- построение тела ----------------
interface Built { sc: Scene; centers: Map<number, V3>; tipR: V3 | null; bowString: { a: V3; b: V3; nock: V3 } | null; staffTop: V3 | null; arrow: { tail: V3; head: V3 } | null }
/** Номера жёстких частей для гибели. */
const PC_SKULL = 1, PC_JAW = 2, PC_RIB = 3, PC_PELVIS = 4, PC_HUM_R = 5, PC_HUM_L = 6, PC_FORE_R = 7, PC_FORE_L = 8, PC_FEM_R = 9, PC_FEM_L = 10, PC_TIB_R = 11, PC_TIB_L = 12, PC_WR = 13, PC_WL = 14, PC_BACK = 15, PC_ARMOR = 16;

function buildSkeleton(v: Variant, p: Pose, view: View): Built {
  const S = new Scene();
  const E = v.elite;
  const T = E ? 1.16 : 1; // толщина костей
  const centers = new Map<number, V3>();
  // жёсткое ядро — целые пиксели кадра
  const core = snapPx(view, p.core);
  const chestUp: V3 = [0, 0, p.chest * 1.0 / 0.97];
  const pelvisC = add(core, [0, 0, Z_PELVIS]);
  const yawRot = (q: V3, c: V3) => {
    let r = sub(q, c);
    if (p.yaw) r = rotAxis(r, [0, 0, 1], p.yaw);
    if (p.lean) r = rotAxis(r, [1, 0, 0], p.lean);
    return add(c, r);
  };
  const upper = (q: V3) => yawRot(add(add(q, core), chestUp), pelvisC);
  const headOff: V3 = [p.head[0], 0, p.head[1] / 0.97];
  // --- таз и ветошь
  {
    const g = S.group(0.6);
    const part = S.newPart();
    S.ell(g, M_BONE, pelvisC, [2.6 * (E ? 1.08 : 1), 1.6, 1.25], undefined, { piece: PC_PELVIS, part, big: true });
    centers.set(PC_PELVIS, pelvisC);
    const cg = S.group(0.4);
    const cp = S.newPart();
    S.ell(cg, M_CLOTH, add(pelvisC, [0, 0.1, -0.3]), [2.95, 1.95, 0.85], undefined, { piece: PC_PELVIS, part: cp, big: true });
    // передний и задний лоскуты: разной длины — рваный край
    const sway = p.sway;
    const flap = (x: number, y: number, len: number, w: number) => {
      const top = add(pelvisC, [x, y, -0.6]);
      const dir = norm([0, -Math.sign(y) * 0.1 - sway * 0.35, -1]);
      const ax = frameOf(dir, [1, 0, 0]);
      S.box(cg, M_CLOTH, add(top, mul(dir, len / 2)), [w, 0.28, len / 2], ax, 0.25, { piece: PC_PELVIS, part: cp });
    };
    flap(-0.7, 1.7, 3.0, 0.95);
    flap(0.9, 1.6, 2.3, 0.8);
    flap(-0.4, -1.6, 2.4, 1.1);
    flap(1.0, -1.5, 1.7, 0.8);
    if (E) {
      // кольчужный подол поверх ветоши
      const mp = S.newPart();
      S.ell(S.group(0.3), M_IRON, add(pelvisC, [0, 0.15, -1.2]), [3.1, 2.05, 1.3], undefined, { piece: PC_PELVIS, part: mp, tex: mailTex, big: true, cut: { n: [0, 0, 1], d: 0.6 } });
    }
  }
  // --- позвоночник, грудная клетка, ключицы
  {
    const sp = S.newPart();
    S.cone(S.group(0), M_BONE, add(pelvisC, [0, -0.5, 0.9]), 0.85 * T, upper([0, -0.4, 10.6]), 0.9 * T, { piece: PC_RIB, part: sp, tex: vertTex });
    const g = S.group(0.7);
    const rp = S.newPart();
    const rc = upper(RIB_C);
    const ax = frameOf(rotAxis(rotAxis([0, 0, 1], [1, 0, 0], p.lean), [0, 0, 1], p.yaw), rotAxis([1, 0, 0], [0, 0, 1], p.yaw));
    S.ell(g, M_BONE, rc, [3.6 * (E ? 1.06 : 1), 2.4 * (E ? 1.08 : 1), 3.2], ax, { piece: PC_RIB, part: rp, tex: ribTex, anc: rc, big: true });
    for (const s of [-1, 1]) S.cone(g, M_BONE, upper([0.6 * s, 0.7, 16.2]), 0.6 * T, upper([SH_X * s, 0.1, SH_Z]), 0.75 * T, { piece: PC_RIB, part: rp });
    centers.set(PC_RIB, rc);
    // шейные позвонки
    S.cone(S.group(0), M_BONE, upper([0, 0.1, 16.4]), 0.75 * T, upper(add([0, 0.3, 18.3], headOff)), 0.75 * T, { piece: PC_RIB, part: S.newPart(), tex: vertTex });
    if (E) {
      // ржавый наплечник на левом плече
      const ap = S.newPart();
      const sh = upper([-SH_X - 0.2, 0, SH_Z + 0.2]);
      S.ell(S.group(0), M_RUST, sh, [2.1, 2.0, 1.5], frameOf(rotAxis([-0.35, 0, 1], [0, 0, 1], p.yaw), [0, 1, 0]), { piece: PC_RIB, part: ap, big: true, cut: { n: [0, 0, -1], d: 0.5 } });
      S.ell(S.group(0), M_IRON, add(sh, [-0.3, 0, -0.9]), [1.6, 1.6, 0.6], frameOf(rotAxis([-0.35, 0, 1], [0, 0, 1], p.yaw), [0, 1, 0]), { piece: PC_RIB, part: S.newPart() });
    }
  }
  // --- череп и челюсть
  {
    const kc = upper(add(SKULL_C, headOff));
    const g = S.group(1.2);
    const part = S.newPart();
    S.ell(g, M_BONE, kc, [4.55, 4.2, 4.25], undefined, { piece: PC_SKULL, part, big: true });
    S.ell(g, M_BONE, add(kc, [0, 2.2, -2.9]), [3.0, 2.1, 1.7], undefined, { piece: PC_SKULL, part });
    centers.set(PC_SKULL, kc);
    const jp = S.newPart();
    const jc = add(kc, [0, 1.9, -4.5 - p.jaw * 1.03]);
    S.ell(S.group(0.4), M_BONE, jc, [2.8, 2.1, 1.05], undefined, { piece: PC_JAW, part: jp, tone: -0.3 });
    centers.set(PC_JAW, jc);
    if (E) {
      // железная шапка: колпак по своду черепа, ниже — кромка
      const hp = S.newPart();
      S.ell(S.group(0), M_IRON, add(kc, [0, -0.3, 0.5]), [4.75, 4.45, 4.0], undefined, { piece: PC_SKULL, part: hp, big: true, tex: rustTex(0.3), cut: { n: norm([0, 0.3, -1]), d: -1.7 } });
      S.box(S.group(0), M_RUST, add(kc, [0, -0.2, 4.2]), [0.55, 3.0, 0.5], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.3, { piece: PC_SKULL, part: S.newPart() });
    }
    // лицо: глазницы, нос, зубы — штампы; у усиленного глаза светятся
    const g0 = p.glow;
    const eyeK = E ? (g0 > 0.75 ? "G" : g0 > 0.35 ? "g" : g0 > 0.05 ? "d" : "v") : "v";
    const colors: Record<string, RGBA> = { v: VOID, b: BONE[1], n: BONE[0], t: BONE[4], k: BONE[1], g: SOUL[2], G: SOUL[4], h: SOUL[3], d: SOUL[1] };
    const glow = E && g0 > 0.05 ? ["g", "G", "h", "d"] : [];
    const ek = eyeK, ec = eyeK === "v" ? "v" : "d";
    S.stamps.push({
      at: add(kc, [0, 3.7, -1.0]), n: [0, 1, 0], piece: PC_SKULL, depthTol: 3, colors, glow, halo: SOUL[2],
      px: {
        down: stampRows([
          "bb..bb",
          `v${ek}..${ek}v`,
          `v${ec}..${ec}v`,
          "..nn..",
        ], -3, -1),
      },
    });
    S.stamps.push({
      at: add(kc, [1.6, 3.4, -1.0]), n: norm([0.5, 0.85, 0]), piece: PC_SKULL, depthTol: 3.5, colors, glow, halo: SOUL[2],
      px: {
        side: stampRows([
          "bb.",
          `v${ek}.`,
          `v${ec}.`,
          "...n",
        ], -1, -1),
      },
    });
    // зубы на челюсти
    S.stamps.push({
      at: add(jc, [0, 2.0, 0.2]), n: [0, 1, 0], piece: PC_JAW, depthTol: 3, colors,
      px: { down: stampRows(["tktt"], -2, 0) },
    });
    S.stamps.push({
      at: add(jc, [1.0, 1.8, 0.2]), n: norm([0.5, 0.85, 0]), piece: PC_JAW, depthTol: 3, colors,
      px: { side: stampRows(["tk"], 0, 0) },
    });
  }
  // --- руки
  const arm = (s: 1 | -1, hand: V3, pcH: number, pcF: number) => {
    const sh = upper([SH_X * s, 0.1, SH_Z - 0.3]);
    const elbow = ik(sh, hand, ARM[0], ARM[1], [0.6 * s, -1, -0.4]);
    const gH = S.group(0.4);
    S.cone(gH, M_BONE, sh, 0.95 * T, elbow, 0.7 * T, { piece: pcH, part: S.newPart() });
    S.ball(gH, M_BONE, elbow, 0.85 * T, { piece: pcH, part: S.newPart() });
    const gF = S.group(0.4);
    const fp = S.newPart();
    S.cone(gF, M_BONE, elbow, 0.8 * T, hand, 0.76 * T, { piece: pcF, part: fp });
    S.ball(gF, M_BONE, hand, 0.95 * T, { piece: pcF, part: fp });
    centers.set(pcH, lerpV(sh, elbow, 0.5));
    centers.set(pcF, lerpV(elbow, hand, 0.5));
    if (E && s === 1) {
      const d = norm(sub(hand, elbow));
      S.cone(S.group(0), M_IRON, add(elbow, mul(d, 1.0)), 1.05, add(elbow, mul(d, 2.6)), 0.95, { piece: pcF, part: S.newPart() });
    }
  };
  const hR = add(add(p.hR, core), chestUp), hL = add(add(p.hL, core), chestUp);
  arm(1, hR, PC_HUM_R, PC_FORE_R);
  arm(-1, hL, PC_HUM_L, PC_FORE_L);
  // --- ноги
  const leg = (s: 1 | -1, foot: V3, pcF: number, pcT: number) => {
    const hip = add(core, [HIP_X * s, 0, HIP_Z]);
    const knee = ik(hip, foot, LEG[0], LEG[1], [0.15 * s, 1, 0]);
    const gF = S.group(0.4);
    S.cone(gF, M_BONE, hip, 1.0 * T, knee, 0.8 * T, { piece: pcF, part: S.newPart() });
    S.ball(gF, M_BONE, knee, 0.95 * T, { piece: pcF, part: S.newPart() });
    const gT = S.group(0.45);
    const tp = S.newPart();
    S.cone(gT, M_BONE, knee, 0.82 * T, foot, 0.76 * T, { piece: pcT, part: tp });
    S.cone(gT, M_BONE, add(foot, [0, -0.5, -0.25]), 0.75 * T, add(foot, [0.1 * s, 1.6, -0.45]), 0.6 * T, { piece: pcT, part: tp });
    centers.set(pcF, lerpV(hip, knee, 0.5));
    centers.set(pcT, lerpV(knee, foot, 0.5));
  };
  leg(1, p.fR, PC_FEM_R, PC_TIB_R);
  leg(-1, p.fL, PC_FEM_L, PC_TIB_L);
  // --- оружие (слои)
  let tipR: V3 | null = null, bowString: Built["bowString"] = null, staffTop: V3 | null = null, arrow: Built["arrow"] = null;
  const gripR: Grip = { at: hR, dir: p.wR[0], flat: p.wR[1] };
  const gripL: Grip = { at: hL, dir: p.wL[0], flat: p.wL[1] };
  const o = (piece: number, k = 0) => ({ elite: E, k, piece });
  if (v.role === "sword") {
    sword(S, gripR, o(PC_WR));
    shield(S, gripL, o(PC_WL));
    tipR = add(hR, mul(norm(p.wR[0]), E ? 10.6 : 9.4));
    centers.set(PC_WR, add(hR, mul(norm(p.wR[0]), E ? 4.4 : 3.8)));
    centers.set(PC_WL, hL);
  } else if (v.role === "bow") {
    bow(S, gripL, o(PC_WL));
    const { tips } = bowGeom(gripL, E);
    const nock = lerpV(lerpV(tips[0], tips[1], 0.5), hR, p.draw);
    bowString = { a: tips[0], b: tips[1], nock };
    centers.set(PC_WL, hL);
    // колчан на спине
    const back = upper([1.4, -2.9, 13.0]);
    quiver(S, { at: back, dir: norm(rotAxis([0.35, -0.15, 1], [0, 0, 1], p.yaw)), flat: [1, 0, 0] }, o(PC_BACK));
    centers.set(PC_BACK, back);
    if (p.arrow > 0) {
      const fwd = norm(sub(hL, nock));
      const tail = nock, head = add(hL, mul(fwd, 2.4));
      arrow = { tail, head };
      const ap = S.newPart();
      S.cone(S.group(0), M_WOOD, tail, 0.42, head, 0.42, { piece: PC_WR, part: ap });
      const hd = frameOf(fwd, [0, 0, 1]);
      S.box(S.group(0), E ? M_STEEL : M_IRON, add(head, mul(fwd, 0.5)), [0.7, 0.3, 0.7], hd, 0.2, { piece: PC_WR, part: S.newPart() });
      S.cone(S.group(0), E ? M_BONE : M_CLOTH, add(tail, mul(fwd, 0.3)), 0.6, add(tail, mul(fwd, 1.4)), 0.5, { piece: PC_WR, part: S.newPart() });
      centers.set(PC_WR, lerpV(tail, head, 0.5));
    }
  } else {
    staff(S, gripR, o(PC_WR, p.charge));
    staffTop = add(hR, mul(norm(p.wR[0]), STAFF_TOP + 1.9));
    // середина посоха с навершием: вокруг неё он поворачивается, падая
    centers.set(PC_WR, add(hR, mul(norm(p.wR[0]), (STAFF_TOP + 4.2 - 7.2) / 2)));
  }
  return { sc: S, centers, tipR, bowString, staffTop, arrow };
}

// ---------------- кадр ----------------
interface DeathState { t: number; lay: Map<number, { c1: V3; axis: V3; ang: number; delay: number; dur: number; bounce?: boolean }>; dust: { x: number; y: number; k: number }[] }
interface FrameExtra { trail?: V3[][]; death?: { pose: Pose; f: number }; flashAt?: V3; flash?: number; motes?: V3[] }

function renderFrame(v: Variant, view: View, p: Pose, ex: FrameExtra = {}): { img: PC; emis: PC } {
  const B = buildSkeleton(v, p, view);
  const sc = B.sc;
  let dust: { at: V3; k: number }[] = [];
  if (ex.death) {
    const { tf, puffs } = deathTransform(v, B, ex.death.f, view);
    rigidPieces(sc, tf);
    dust = puffs;
  }
  const R0 = renderScene(cam, sc, view, OUT);
  const img = new PC(N, N);
  const emis = R0.emis;
  // след клинка — позади меча, поверх земли
  if (ex.trail) for (const tr of ex.trail) drawTrail(img, tr, view, v.elite);
  img.blit(R0.body, 0, 0);
  // тетива: два отрезка от концов лука к точке натяжения, по глубине
  if (B.bowString && !ex.death) {
    const { a, b, nock } = B.bowString;
    drawLine3(img, R0.gb.t, a, nock, view, STRING);
    drawLine3(img, R0.gb.t, nock, b, view, STRING);
  }
  // чары заклинателя: шар души у навершия, огоньки стягиваются к нему; вспышка
  if (v.role === "mage" && B.staffTop && p.charge > 0.05 && !ex.death) drawOrb(img, emis, B.staffTop, p.charge, view);
  if (ex.motes) for (const m of ex.motes) drawMote(img, emis, m, view);
  if (ex.flashAt && ex.flash) drawFlash(img, emis, ex.flashAt, ex.flash, view, v.role === "mage" ? SOUL : [hex("#8a7a5a"), hex("#d8c8a0"), hex("#fff4d8"), hex("#fffbf0"), hex("#ffffff")]);
  for (const d of dust) drawDust(img, d.at, d.k, view);
  thicken(img, OUT, 3, [STRING]);
  sealPinholes(img, OUT, true, 8);
  return { img, emis };
}

function drawLine3(o: PC, depth: Float32Array, a: V3, b: V3, view: View, col: RGBA) {
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

/** След клинка: полоса шириной 2 px по пути острия, светлая к острию, тает к хвосту; рисуется под телом. */
function drawTrail(o: PC, pts: V3[], view: View, elite: boolean) {
  const tones = elite ? [hex("#6c7c8a"), hex("#b6c4cc"), hex("#eef6f8")] : [hex("#6a5e4c"), hex("#b0a284"), hex("#e8dcc0")];
  const sp = pts.map((q) => scr(cam, toView(view, q)));
  for (let k = Math.floor((sp.length - 1) * 0.3); k + 1 < sp.length; k++) {
    const f = (k + 1) / (sp.length - 1);
    const tone = f > 0.7 ? 2 : f > 0.45 ? 1 : 0;
    const [x0, y0] = sp[k], [x1, y1] = sp[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= n; s++) {
      const x = lerp(x0, x1, s / n), y = lerp(y0, y1, s / n);
      const w = 1.0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = Math.floor(x + dx * w), Y = Math.floor(y + dy * w);
        if (X < 1 || Y < 1 || X >= N - 1 || Y >= N - 1) continue;
        const cur = o.get(X, Y)!;
        const ct = tones.findIndex((t) => t[0] === cur[0] && t[1] === cur[1] && t[2] === cur[2]);
        if (cur[3] && ct >= tone) continue;
        o.set(X, Y, tones[tone]);
      }
    }
  }
}
function drawOrb(o: PC, emis: PC, at: V3, k: number, view: View) {
  const [cx, cy] = scr(cam, toView(view, at));
  const r = 0.9 + 1.5 * k;
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
    if (d > 1) continue;
    const t = d < 0.35 ? 4 : d < 0.65 ? 3 : d < 0.88 ? 2 : 1;
    const c = SOUL[t];
    o.set(x, y, c);
    emis.set(x, y, c);
  }
}
function drawMote(o: PC, emis: PC, at: V3, view: View) {
  const [cx, cy] = scr(cam, toView(view, at));
  const x = Math.floor(cx), y = Math.floor(cy);
  for (const [dx, dy, t] of [[0, 0, 3], [1, 0, 2], [0, 1, 2], [1, 1, 1]] as [number, number, number][]) {
    if (x + dx < 1 || y + dy < 1 || x + dx >= N - 1 || y + dy >= N - 1) continue;
    o.set(x + dx, y + dy, SOUL[t]);
    emis.set(x + dx, y + dy, SOUL[t]);
  }
}
/** Вспышка: ромб-звезда из 3 тонов, k — размер 0..1. */
function drawFlash(o: PC, emis: PC, at: V3, k: number, view: View, ramp: RGBA[]) {
  const [cx, cy] = scr(cam, toView(view, at));
  const r = 1.5 + 3.0 * k;
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
    const d = Math.min(dx + dy * 2.2, dx * 2.2 + dy) / r;
    if (d > 1) continue;
    const t = d < 0.3 ? 4 : d < 0.6 ? 3 : 2;
    o.set(x, y, ramp[t]);
    emis.set(x, y, ramp[t]);
  }
}
/** Пыль от упавшей кости: плоский клуб 2–3 тонов у земли. */
const DUST = R("#4a3d2e", "#7a6a52", "#a69478", "#cbbc9c");
function drawDust(o: PC, at: V3, k: number, view: View) {
  const [cx, cy0] = scr(cam, toView(view, at));
  const cy = Math.min(cy0, N - 2.5);
  const rx = 1.6 + 2.6 * k, ry = 0.8 + 0.6 * k;
  for (let y = Math.floor(cy - ry - 1); y <= cy + 1; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d > 1 - 0.5 * k || o.alpha(x, y)) continue;
    o.set(x, y, DUST[y + 0.5 > cy ? 1 : d < 0.5 ? 3 : 2]);
  }
}

// ---------------- гибель: кости падают и ложатся ----------------
/**
 * Куда ложится каждая часть — в координатах вида (x — вправо по экрану, y — к зрителю, z — вверх), чтобы куча костей в
 * любом виде расходилась по ширине кадра, а к зрителю — не дальше 1–2 px (ниже ступней в кадре места нет). Сторона по x —
 * та, где часть была (side: true), поворот — вокруг оси вида; задержка и длительность падения — в кадрах.
 */
interface Lay { x: number; y: number; z: number; axis: V3; ang: number; delay: number; dur: number; side?: boolean; bounce?: boolean }
function deathLay(v: Variant): Map<number, Lay> {
  const L = new Map<number, Lay>();
  const T = v.elite ? 1.16 : 1;
  const Y: V3 = [0, 1, 0], X: V3 = [1, 0, 0];
  // череп садится на землю лицом к зрителю, грудная клетка ложится на спину рядом; длинные кости — поперёк, спереди и сзади
  L.set(PC_SKULL, { x: 2.8, y: -1.4, z: 5.2, axis: Y, ang: rad(14), delay: 2, dur: 4, bounce: true });
  L.set(PC_JAW, { x: -0.8, y: 1.8, z: 1.0, axis: X, ang: rad(-25), delay: 1, dur: 3 });
  L.set(PC_RIB, { x: -3.2, y: -0.6, z: 2.4 * (v.elite ? 1.08 : 1), axis: X, ang: rad(-82), delay: 1, dur: 4 });
  L.set(PC_PELVIS, { x: -0.6, y: -2.4, z: 1.3, axis: X, ang: rad(-70), delay: 0, dur: 3 });
  L.set(PC_HUM_R, { x: 2.0, y: 1.8, z: 0.95 * T, axis: Y, ang: rad(84), delay: 1, dur: 3, side: true });
  L.set(PC_HUM_L, { x: 8.4, y: -1.8, z: 0.95 * T, axis: Y, ang: rad(80), delay: 2, dur: 3, side: true });
  L.set(PC_FORE_R, { x: 6.4, y: -0.8, z: 0.95 * T, axis: Y, ang: rad(88), delay: 0, dur: 3, side: true });
  L.set(PC_FORE_L, { x: 4.6, y: 1.6, z: 0.95 * T, axis: Y, ang: rad(86), delay: 1, dur: 3, side: true });
  L.set(PC_FEM_R, { x: 4.4, y: 1.3, z: 1.0 * T, axis: Y, ang: rad(86), delay: 0, dur: 3, side: true });
  L.set(PC_FEM_L, { x: 4.0, y: -2.6, z: 1.0 * T, axis: Y, ang: rad(84), delay: 0, dur: 3, side: true });
  L.set(PC_TIB_R, { x: 7.6, y: -0.4, z: 0.85 * T, axis: Y, ang: rad(84), delay: 0, dur: 2, side: true });
  L.set(PC_TIB_L, { x: 8.0, y: 0.9, z: 0.85 * T, axis: Y, ang: rad(86), delay: 0, dur: 2, side: true });
  L.set(PC_BACK, { x: -5.0, y: -2.8, z: 1.2, axis: Y, ang: rad(-84), delay: 1, dur: 3 });
  if (v.role === "sword") {
    L.set(PC_WR, { x: v.elite ? 0.6 : 1.2, y: 2.0, z: 0.6, axis: Y, ang: rad(86), delay: -1, dur: 3, side: true });
    L.set(PC_WL, { x: 6.0, y: -2.8, z: 0.7, axis: X, ang: rad(-82), delay: 0, dur: 3, side: true });
  } else if (v.role === "bow") {
    L.set(PC_WL, { x: 3.0, y: 2.0, z: 0.9, axis: Y, ang: rad(86), delay: -1, dur: 3, side: true });
  } else {
    L.set(PC_WR, { x: 0.0, y: -3.0, z: 1.0, axis: Y, ang: rad(86), delay: -1, dur: 4, side: true });
  }
  return L;
}
/** Кадр гибели f (≥ 3): часть падает с задержкой, по вертикали — с ускорением, по горизонтали — с торможением. */
function deathTransform(v: Variant, B: Built, f: number, view: View) {
  const L = deathLay(v);
  const puffs: { at: V3; k: number }[] = [];
  const tf = (piece: number) => {
    const c0 = B.centers.get(piece);
    const l = L.get(piece);
    if (!c0 || !l) return null;
    const c0v = toView(view, c0);
    const sg = l.side ? (c0v[0] >= 0 ? 1 : -1) : 1;
    const start = 3 + l.delay;
    const t = clamp((f - start) / l.dur, 0, 1);
    const land = start + l.dur;
    const endV: V3 = [l.x * sg, l.y, l.z];
    if (l.bounce) {
      if (f === land + 1) endV[2] += 1.1;
      if (f >= land + 1) endV[0] += 0.6;
      if (f >= land + 2) endV[0] += 0.5;
    }
    const end = fromView(view, endV);
    const h = lerpV(c0, end, easeOut(t));
    h[2] = lerp(c0[2], end[2], l.bounce && f > land ? 1 : easeIn(t));
    if ((piece === PC_SKULL || piece === PC_RIB || piece === PC_PELVIS || piece === PC_WR) && (f === land || f === land + 1)) puffs.push({ at: fromView(view, [l.x * sg, l.y, 0]), k: f === land ? 0.4 : 1 });
    // отражение вида меняет направление поворота: угол в модели — с обратным знаком
    return { c0, c1: h, axis: fromView(view, l.axis), ang: -l.ang * sg * easeIn(t) };
  };
  return { tf, puffs };
}

// ---------------- анимации ----------------
export type Anim = "idle" | "walk" | "attack" | "death";
export interface AnimDef { col: number; n: number; fps: number; loop: boolean; ru: string; hit?: number }
export function animsOf(role: Role): Record<Anim, AnimDef> {
  const atk = role === "sword" ? { n: 9, fps: 14, ru: "удар", hit: 3 } : role === "bow" ? { n: 10, fps: 12, ru: "выстрел", hit: 6 } : { n: 10, fps: 12, ru: "каст", hit: 6 };
  return {
    idle: { col: 0, n: 12, fps: 10, loop: true, ru: "покой" },
    walk: { col: 12, n: 12, fps: 12, loop: true, ru: "ходьба" },
    attack: { col: 24, n: atk.n, fps: atk.fps, loop: false, ru: atk.ru, hit: atk.hit },
    death: { col: 24 + atk.n, n: 12, fps: 12, loop: false, ru: "гибель" },
  };
}
const ANIM_LIST: Anim[] = ["idle", "walk", "attack", "death"];

const ipx = (v: number) => Math.round(v);
type Frame = { p: Pose; ex?: FrameExtra };

function idleFrames(v: Variant): Frame[] {
  const R0 = restPose(v.role);
  const out: Frame[] = [];
  const chest = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  const head = [0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0];
  for (let i = 0; i < 12; i++) {
    const p: Pose = { ...R0, chest: chest[i], head: [0, 0], jaw: i === 6 || i === 7 ? 1 : 0 };
    // кисти свисают: вслед за грудью — целыми пикселями; свободная кисть чуть качается
    const sw = ipx(Math.sin((i / 12) * Math.PI * 2) * 0.6);
    p.hL = add(R0.hL, [0, v.role === "sword" ? 0 : sw * 0.5, 0]);
    p.head = [head[i] ? (i === 6 ? 1 : 0) : 0, 0];
    p.glow = 0.8 + 0.2 * Math.sin((i / 12) * Math.PI * 2);
    p.charge = 0;
    out.push({ p });
  }
  return out;
}

function walkFrames(v: Variant): Frame[] {
  const R0 = restPose(v.role);
  const out: Frame[] = [];
  for (let i = 0; i < 12; i++) {
    const ph = (i / 12) * Math.PI * 2;
    const p: Pose = { ...R0 };
    const st = 1.7;
    const lift = (a: number) => Math.max(0, Math.sin(a)) * 1.4;
    p.fR = [2.0, st * Math.cos(ph), 1.0 + lift(ph)];
    p.fL = [-2.0, st * Math.cos(ph + Math.PI), 1.0 + lift(ph + Math.PI)];
    // шаг: тело ниже на 1 px в момент переноса веса
    p.core = [0, 0, -ipx(Math.abs(Math.cos(ph)) * 1.0) * 1.03];
    const sw = Math.cos(ph) * 1.5;
    if (v.role === "sword") {
      p.hR = add(R0.hR, [0, -sw * 0.6, 0]);
      p.hL = add(R0.hL, [0, sw * 0.4, 0]);
    } else if (v.role === "bow") {
      p.hR = add(R0.hR, [0, -sw, 0.2 * Math.abs(sw)]);
      p.hL = add(R0.hL, [0, sw * 0.6, 0]);
    } else {
      p.hR = add(R0.hR, [0, -sw * 0.5, 0]);
      p.hL = add(R0.hL, [0, sw, 0.2 * Math.abs(sw)]);
    }
    p.jaw = i === 3 || i === 9 ? 1 : 0;
    p.sway = 0.5 + 0.3 * Math.sin(ph * 2);
    out.push({ p });
  }
  return out;
}

interface Key { f: number; p: Partial<Pose>; ease?: (t: number) => number }
function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const o = { ...a } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    const x = a[k] as unknown, y = b[k] as unknown;
    if (typeof x === "number") o[k] = lerp(x, y as number, t);
    else if (Array.isArray(x) && typeof x[0] === "number") o[k] = (x as number[]).map((q, i) => lerp(q, (y as number[])[i], t));
    else if (Array.isArray(x)) o[k] = (x as V3[]).map((q, i) => (k === "wR" || k === "wL" ? (i === 0 ? slerpDir(q, (y as V3[])[i], t) : norm(lerpV(q, (y as V3[])[i], t))) : lerpV(q, (y as V3[])[i], t)));
  }
  return o as unknown as Pose;
}
function slerpDir(a: V3, b: V3, t: number): V3 {
  const A = norm(a), B = norm(b);
  const c = clamp(dot(A, B), -1, 1);
  const ang = Math.acos(c);
  if (ang < 1e-3) return B;
  let ax = cross(A, B);
  if (vlen(ax) < 1e-4) ax = [1, 0, 0];
  return norm(rotAxis(A, ax, ang * t));
}
function keyed(base: Pose, keys: Key[], n: number): Pose[] {
  const full: { f: number; p: Pose; ease?: (t: number) => number }[] = [];
  let cur = base;
  for (const k of keys) {
    cur = { ...cur, ...k.p };
    full.push({ f: k.f, p: cur, ease: k.ease });
  }
  const out: Pose[] = [];
  for (let f = 0; f < n; f++) {
    let i = 0;
    while (i + 1 < full.length && full[i + 1].f <= f) i++;
    const a = full[i], b = full[Math.min(i + 1, full.length - 1)];
    const t = b.f === a.f ? 0 : (f - a.f) / (b.f - a.f);
    out.push(lerpPose(a.p, b.p, (b.ease ?? easeInOut)(clamp(t, 0, 1))));
  }
  return out;
}

function attackFrames(v: Variant): Frame[] {
  const R0 = restPose(v.role);
  if (v.role === "sword") {
    const up: Partial<Pose> = { hR: [4.0, -1.2, 16.6], wR: [norm([0.25, -0.55, 0.8]), [1, 0, 0]], yaw: rad(16), hL: [-3.6, 3.6, 11.0], wL: [[0, 0, 1], norm([-0.1, 1, 0])] };
    const hit: Partial<Pose> = { hR: [-0.6, 5.6, 10.2], wR: [norm([-0.55, 0.7, -0.4]), [0, 0, 1]], yaw: rad(-18), core: [0, 1.0, 0], hL: [-4.8, 1.2, 10.0] };
    const fol: Partial<Pose> = { hR: [-2.2, 4.4, 8.4], wR: [norm([-0.8, 0.3, -0.5]), [0, 0, 1]], yaw: rad(-22), core: [0, 1.0, 0] };
    const keys: Key[] = [
      { f: 0, p: {} },
      { f: 2, p: up, ease: easeOut },
      { f: 3, p: hit, ease: linear },
      { f: 4, p: fol, ease: easeOut },
      { f: 5, p: { ...fol, hR: [-1.8, 4.2, 8.6] } },
      { f: 8, p: { hR: R0.hR, wR: R0.wR, yaw: 0, core: [0, 0, 0], hL: R0.hL, wL: R0.wL } },
    ];
    const ps = keyed(R0, keys, 9);
    const tip = (p: Pose) => add(p.hR, mul(norm(p.wR[0]), v.elite ? 10.4 : 9.2));
    // след острия на кадрах удара: дуга от замаха к удару (по промежуточным позам)
    const arc = (a: Pose, b: Pose, steps = 6) => Array.from({ length: steps + 1 }, (_, k) => tip(lerpPose(a, b, k / steps)));
    return ps.map((p, f) => ({
      p: { ...p, jaw: f >= 2 && f <= 4 ? 1 : 0 },
      ex: f === 3 ? { trail: [arc(ps[2], ps[3])] } : f === 4 ? { trail: [arc(lerpPose(ps[2], ps[3], 0.55), ps[4], 5)] } : undefined,
    }));
  }
  if (v.role === "bow") {
    // стойка лучника: левое плечо к цели (корпус развёрнут), лук перед собой, тетива к подбородку
    const raise: Partial<Pose> = { yaw: rad(-22), hL: [-3.8, 6.0, 14.4], wL: [norm([-0.1, 0.05, 1]), norm([0.62, -0.78, 0])], hR: [-2.2, 4.2, 14.6], arrow: 1, draw: 0.1 };
    const drawn: Partial<Pose> = { hR: [0.9, 0.6, 15.0], draw: 1, arrow: 1 };
    const keys: Key[] = [
      { f: 0, p: {} },
      { f: 2, p: raise, ease: easeOut },
      { f: 5, p: drawn, ease: easeInOut },
      { f: 6, p: { draw: 0, arrow: 0, hR: [2.6, -0.6, 15.4] }, ease: linear },
      { f: 7, p: { draw: -0.12 } },
      { f: 9, p: { hL: R0.hL, wL: R0.wL, hR: R0.hR, draw: 0, arrow: 0, yaw: 0 } },
    ];
    const ps = keyed(R0, keys, 10);
    return ps.map((p, f) => {
      const q = { ...p, arrow: f >= 1 && f <= 5 ? 1 : 0, draw: f === 6 ? 0 : p.draw };
      const B0 = f === 6 ? add(p.hL, [0, 3.2, 0.2]) : undefined;
      return { p: q, ex: f === 6 ? { flashAt: B0, flash: 0.35 } : f === 7 ? { flashAt: add(p.hL, [0, 6.0, 0.2]), flash: 0.1 } : undefined };
    });
  }
  // заклинатель
  // посох наклоняется к цели, свободная рука — ладонью вперёд; на ударе посох толкает шар вперёд (на 1 px)
  const raise: Partial<Pose> = { hR: [5.4, 3.0, 10.6], wR: [norm([0.22, 0.36, 0.9]), [0, 1, 0]], hL: [-3.0, 4.6, 12.2], charge: 0.15 };
  const gather: Partial<Pose> = { charge: 1, hL: [-2.6, 5.0, 13.0] };
  const thrust: Partial<Pose> = { hR: [5.0, 4.0, 10.4], wR: [norm([0.18, 0.48, 0.86]), [0, 1, 0]], core: [0, 1.0, 0], charge: 0 };
  const keys: Key[] = [
    { f: 0, p: {} },
    { f: 2, p: raise, ease: easeOut },
    { f: 5, p: gather },
    { f: 6, p: thrust, ease: linear },
    { f: 7, p: { ...thrust } },
    { f: 9, p: { hR: R0.hR, wR: R0.wR, hL: R0.hL, core: [0, 0, 0], charge: 0 } },
  ];
  const ps = keyed(R0, keys, 10);
  return ps.map((p, f) => {
    const top = add(p.hR, mul(norm(p.wR[0]), STAFF_TOP + 1.9));
    const ex: FrameExtra = {};
    if (f >= 3 && f <= 5) {
      // огоньки стягиваются к навершию по спирали
      const k = (f - 2) / 3;
      ex.motes = [0, 1, 2].map((m) => {
        const a = m * 2.1 + f * 0.9;
        const r = 5.5 * (1 - k) + 1.6;
        return add(top, [Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.4, Math.sin(a * 1.3) * r * 0.5 - 0.5]);
      });
    }
    if (f === 6) { ex.flashAt = top; ex.flash = 1; }
    if (f === 7) { ex.flashAt = add(top, [0, 2.2, 0]); ex.flash = 0.3; }
    return { p: { ...p, glow: 1, charge: f >= 6 ? 0 : p.charge, jaw: f >= 4 && f <= 6 ? 1 : 0 }, ex };
  });
}

function deathFrames(v: Variant): Frame[] {
  const R0 = restPose(v.role);
  // посох заклинателя опирается о землю — его кисть опускается меньше
  const buck: Partial<Pose> = { core: [0, -0.6, -3.1], head: [0, -1], jaw: 1, hR: add(R0.hR, [0.6, -0.6, v.role === "mage" ? 2.2 : -2.2]), hL: add(R0.hL, [-0.6, -0.4, -2.2]), lean: rad(-8) };
  const ps = keyed(R0, [{ f: 0, p: { core: [0, -1.0, 0], jaw: 1, lean: rad(-5) } }, { f: 1, p: { core: [0, -1.0, -1.03], jaw: 1, lean: rad(-6) } }, { f: 3, p: buck }], 12);
  return ps.map((p, f) => ({ p: { ...p, glow: Math.max(0, 1 - f / 5) }, ex: f >= 3 ? { death: { pose: ps[3], f } } : undefined }));
}

const FRAMES: Record<Anim, (v: Variant) => Frame[]> = { idle: idleFrames, walk: walkFrames, attack: attackFrames, death: deathFrames };

/** Анимация → лист (3 строки вида) и маска свечения. */
function buildAnim(v: Variant, a: Anim): { sheet: PC; emis: PC } {
  const fr = FRAMES[a](v);
  const sheet = new PC(N * fr.length, N * 3);
  const emis = new PC(N * fr.length, N * 3);
  VIEWS.forEach((view, row) => fr.forEach((F, i) => {
    // в гибели после 3-го кадра тело строится в позе «на коленях» и рассыпается частями
    const pose = F.ex?.death ? F.ex.death.pose : F.p;
    const r = renderFrame(v, view, { ...pose, glow: F.p.glow }, F.ex);
    sheet.blit(r.img, i * N, row * N);
    emis.blit(r.emis, i * N, row * N);
  }));
  return { sheet, emis };
}

// ---------------- монтаж ----------------
type Sheets = Record<Anim, { sheet: PC; emis: PC }>;
const frameAt = (s: { sheet: PC; emis: PC }, i: number, row: number) => ({ img: crop(s.sheet, i * N, row * N, N, N), emis: crop(s.emis, i * N, row * N, N, N) });

/** Спрайт ×k в точку (x, y) кадра; ночью — затемнение области с последующим возвратом светящихся пикселей. */
function putSprite(c: PC, img: PC, emis: PC | null, x: number, y: number, k: number, flip = false) {
  shadowBlob(c, x + 16 * k, y + 30.5 * k, 6.5 * k, 2.2 * k);
  c.blit(scaleNN(img, k, flip), x, y);
  void emis;
}
function relight(c: PC, emis: PC, x: number, y: number, k: number, flip = false) {
  c.blit(scaleNN(emis, k, flip), x, y);
  // ореол ночью: мягкое пятно света вокруг светящихся пикселей
  for (let j = 0; j < emis.h; j++) for (let i = 0; i < emis.w; i++) {
    const q = emis.get(flip ? emis.w - 1 - i : i, j)!;
    if (!q[3]) continue;
    for (let dy = -2 * k; dy <= 3 * k; dy++) for (let dx = -2 * k; dx <= 3 * k; dx++) {
      const X = x + i * k + dx, Y = y + j * k + dy;
      const d = Math.hypot(dx - k / 2, dy - k / 2) / (2.5 * k);
      if (d > 1 || !c.inside(X, Y)) continue;
      const cur = c.get(X, Y)!;
      c.data.set(mix(cur, [q[0], q[1], q[2], 255], 0.05 * (1 - d)), (Y * c.w + X) * 4);
    }
  }
}

function sceneRow(title: string, items: { img: PC; emis: PC | null; flip?: boolean; gap?: number }[], terrain: PC, g: "grass" | "dirt", night: boolean, W: number, k: number): Row {
  return {
    h: N * k + 40,
    draw: (c, y0) => {
      text(c, title, 16, y0 + 8);
      const y = y0 + 34;
      groundBg(c, terrain, 16, y, W - 32, N * k, k, g);
      let x = 28;
      const pos: [number, number][] = [];
      for (const it of items) {
        x += it.gap ?? 0;
        putSprite(c, it.img, it.emis, x, y, k, it.flip);
        pos.push([x, y]);
        x += 30 * k;
      }
      if (night) {
        nightRect(c, 16, y, W - 32, N * k);
        items.forEach((it, i) => it.emis && relight(c, it.emis, pos[i][0], pos[i][1], k, it.flip));
      }
    },
  };
}

function animRow(v: Variant, a: Anim, S: { sheet: PC; emis: PC }, hero: PC, terrain: PC, W: number): Row {
  const A = animsOf(v.role)[a];
  const k = 2;
  return {
    h: N * k * 3 + 40,
    draw: (c, y0) => {
      text(c, `×2 · ${variantRu(v)} · ${A.ru} · ${A.n} КАДРОВ · ${A.fps} К/С${A.loop ? " · ПО КРУГУ" : ""}${A.hit !== undefined ? ` · УДАР — КАДР ${A.hit + 1}` : ""}`, 16, y0 + 8);
      for (const row of [0, 2, 1]) {
        const y = y0 + 34 + [0, 2, 1][row] * N * k;
        groundBg(c, terrain, 16, y, W - 32, N * k, k, a === "walk" ? "dirt" : "grass");
        let x = 24;
        putSprite(c, crop(hero, 0, row * 32, 32, 32), null, x, y, k);
        x += 36 * k;
        for (let i = 0; i < A.n; i++) {
          putSprite(c, frameAt(S, i, row).img, null, x, y, k);
          x += 32 * k;
        }
      }
    },
  };
}

function buildPreview(all: Map<string, Sheets>, hero: PC, oldSk: PC, terrain: PC, ref: PC | null): PC {
  const W = 2300;
  const rows: Row[] = [];
  const k = 4;
  const idleOf = (v: Variant, row: number) => frameAt(all.get(variantId(v))!.idle, 0, row);
  for (const [g, night] of [["grass", false], ["dirt", false], ["grass", true], ["dirt", true]] as ["grass" | "dirt", boolean][]) {
    for (const [row, vn] of [[0, "СПЕРЕДИ"], [2, "СБОКУ"], [1, "СЗАДИ"]] as [number, string][]) {
      const items = [
        { img: crop(hero, 0, row * 32, 32, 32), emis: null },
        { img: crop(oldSk, 0, row * 32, 32, 32), emis: null, gap: 8 },
        ...VARIANTS.map((v, i) => ({ ...idleOf(v, row), gap: i === 0 ? 40 : i === 3 ? 28 : 0 })),
        { img: crop(hero, 0, row * 32, 32, 32), emis: null, gap: 40 },
        ...(row === 2 ? [VARIANTS[0], VARIANTS[4]].map((v) => ({ ...idleOf(v, 2), flip: true })) : []),
      ];
      rows.push(sceneRow(`×4 · ${vn} · ${g === "grass" ? "ТРАВА" : "ЗЕМЛЯ"} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ГЕРОЙ · БЫЛО | МЕЧНИК · ЛУЧНИК · ЗАКЛИНАТЕЛЬ · МЕЧНИК+ · ЛУЧНИК+ · ЗАКЛИНАТЕЛЬ+ · ГЕРОЙ${row === 2 ? " · ВЛЕВО" : ""}`, items, terrain, g, night, W, k));
    }
  }
  rows.push(compareRow(all, ref, W));
  rows.push(compareRow(all, ref, W, [30, 46, 26, 255], "ТЁМНАЯ ТРАВА НОЧЬЮ"));
  for (const v of VARIANTS) for (const a of ANIM_LIST) rows.push(animRow(v, a, all.get(variantId(v))![a], hero, terrain, W));
  return stackRows(rows, W);
}

/** «Наш | референс»: обычный и усиленный мечник крупно (вниз и вбок) на светлом фоне и образец той же высоты. */
/** Эталон уровня паков: скелет Ninja Adventure (vendor/vfx-ninja, CC0), кадр 16 px — увеличен ×2 до кадра 32. */
let ETALON: PC[] = [];
/** «Наш | эталон | референс»: обычный и усиленный крупно; bg — светлый фон или тёмная трава ночью. */
function compareRow(all: Map<string, Sheets>, ref: PC | null, W: number, bg: RGBA = [206, 200, 188, 255], title = "СВЕТЛЫЙ ФОН"): Row {
  const k = 7;
  const H = N * k;
  return {
    h: H + 50,
    draw: (c, y0) => {
      text(c, `×${k} · ${title} · НАШ: МЕЧНИК, ЛУЧНИК, ЗАКЛИНАТЕЛЬ СПЕРЕДИ, МЕЧНИК СБОКУ, МЕЧНИК+, ЛУЧНИК+ | ЭТАЛОН ПАКА NINJA ADVENTURE (16 PX ×2) | РЕФЕРЕНС`, 16, y0 + 8);
      const y = y0 + 40;
      let x = 16;
      const list: [Variant, number][] = [[VARIANTS[0], 0], [VARIANTS[1], 0], [VARIANTS[2], 0], [VARIANTS[0], 2], [VARIANTS[3], 0], [VARIANTS[4], 0]];
      const step = N * k - 40;
      fill(c, x, y, list.length * step + 40, H, bg);
      for (const [v, row] of list) {
        const f = frameAt(all.get(variantId(v))!.idle, 0, row);
        c.blit(scaleNN(f.img, k), x, y);
        if (bg[1] < 80) c.blit(scaleNN(f.emis, k), x, y);
        x += step;
      }
      x += 56;
      fill(c, x - 16, y, 4, H, [240, 232, 214, 255]);
      fill(c, x, y, ETALON.length * step + 40, H, bg);
      for (const e of ETALON) {
        c.blit(scaleNN(e, k), x, y);
        x += step;
      }
      x += 56;
      if (ref) {
        const rs = scaleBox(ref, Math.round((ref.w * H) / ref.h), H);
        fill(c, x - 16, y, 4, H, [240, 232, 214, 255]);
        c.blit(rs, x, y);
      }
    },
  };
}

/** Контрольная картинка выбранного варианта: 6 вариантов спереди, сбоку, сзади рядом с героем (×4, трава, день). */
function buildV1(all: Map<string, Sheets>, hero: PC, oldSk: PC, terrain: PC): PC {
  const W = 1500;
  const rows: Row[] = [];
  for (const [row, vn] of [[0, "СПЕРЕДИ"], [2, "СБОКУ"], [1, "СЗАДИ"]] as [number, string][]) {
    const items = [
      { img: crop(hero, 0, row * 32, 32, 32), emis: null },
      { img: crop(oldSk, 0, row * 32, 32, 32), emis: null, gap: 8 },
      ...VARIANTS.map((v, i) => ({ ...frameAt(all.get(variantId(v))!.idle, 0, row), gap: i === 0 ? 40 : i === 3 ? 28 : 0 })),
    ];
    rows.push(sceneRow(`×4 · ${vn} · ГЕРОЙ · БЫЛО | МЕЧНИК · ЛУЧНИК · ЗАКЛИНАТЕЛЬ · МЕЧНИК+ · ЛУЧНИК+ · ЗАКЛИНАТЕЛЬ+`, items, terrain, "grass", false, W, 4));
  }
  return stackRows(rows, W);
}

function buildCompare(all: Map<string, Sheets>, ref: PC | null): PC {
  const W = 2300;
  return stackRows([compareRow(all, ref, W), compareRow(all, ref, W, [30, 46, 26, 255], "ТЁМНАЯ ТРАВА НОЧЬЮ")], W);
}

function buildHtml(all: Map<string, PC>, hero: PC, terrain: PC): string {
  const sheets = Object.fromEntries([...all].map(([id, c]) => [id, pngDataUrl(c)]));
  const anims = Object.fromEntries(VARIANTS.map((v) => [variantId(v), animsOf(v.role)]));
  const names = Object.fromEntries(VARIANTS.map((v) => [variantId(v), variantRu(v)]));
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Скелет — пилот мобов</title>
<style>
:root { --bg: #18141a; --fg: #efe6d2; --dim: #bdb09c; --line: #4d3f4a; --gold: #d6a84b; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, "Segoe UI", sans-serif; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px; }
button { background: #2a2230; color: var(--fg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 12px; font: inherit; cursor: pointer; }
button.on { border-color: var(--gold); color: var(--gold); }
canvas { image-rendering: pixelated; border-radius: 6px; max-width: 100%; }
label { color: var(--dim); margin-right: 8px; }
</style></head><body>
<h1 style="font-size:20px;margin:0 0 6px">Оживший скелет — 3 роли × обычный/усиленный</h1>
<p style="color:var(--dim)">Кадр 32×32, рядом герой. Вниз, вверх, вбок, влево (отражение). Масштаб ×4.</p>
<div class="bar" id="vars"></div><div class="bar" id="anims"></div>
<div class="bar"><label><input type="checkbox" id="night"> ночь</label><label><input type="checkbox" id="dirt"> земля</label></div>
<canvas id="c" width="${4 * 32 * 6}" height="${4 * 40}"></canvas>
<script>
const SHEETS = ${JSON.stringify(sheets)}, ANIMS = ${JSON.stringify(anims)}, NAMES = ${JSON.stringify(names)};
const img = (s) => { const i = new Image(); i.src = s; return i; };
const imgs = Object.fromEntries(Object.entries(SHEETS).map(([k, v]) => [k, img(v)]));
const hero = img("${pngDataUrl(hero)}");
const ground = [img("${pngDataUrl(crop(terrain, 14 * 32, 6 * 32, 32, 32))}"), img("${pngDataUrl(crop(terrain, 14 * 32, 5 * 32, 32, 32))}")];
let vid = Object.keys(SHEETS)[0], anim = "idle", frame = 0, last = 0, held = 0;
function bar(id, items, get, set) {
  const b = document.getElementById(id); b.innerHTML = "";
  for (const [k, label] of items) { const e = document.createElement("button"); e.textContent = label; if (get() === k) e.classList.add("on");
    e.onclick = () => { set(k); frame = 0; held = 0; [...b.children].forEach((x) => x.classList.remove("on")); e.classList.add("on"); }; b.appendChild(e); }
}
bar("vars", Object.keys(SHEETS).map((k) => [k, NAMES[k]]), () => vid, (k) => (vid = k));
bar("anims", Object.entries(ANIMS[vid]).map(([k, a]) => [k, a.ru + " · " + a.n + " · " + a.fps + " к/с"]), () => anim, (k) => (anim = k));
const c = document.getElementById("c"), g = c.getContext("2d"); g.imageSmoothingEnabled = false;
function draw() {
  const Z = 4, dirt = document.getElementById("dirt").checked;
  for (let x = 0; x < c.width; x += 32 * Z) for (let y = 0; y < c.height; y += 32 * Z) g.drawImage(ground[dirt ? 1 : 0], x, y, 32 * Z, 32 * Z);
  const A = ANIMS[vid][anim];
  const views = [[0, false], [1, false], [2, false], [2, true]];
  g.drawImage(hero, 0, 0, 32, 32, 0, 4 * Z, 32 * Z, 32 * Z);
  views.forEach(([row, flip], i) => {
    g.save(); const x = (32 + i * 32) * Z;
    if (flip) { g.translate(x + 32 * Z, 4 * Z); g.scale(-1, 1); } else g.translate(x, 4 * Z);
    g.drawImage(imgs[vid], (A.col + frame) * 32, row * 32, 32, 32, 0, 0, 32 * Z, 32 * Z); g.restore();
  });
  if (document.getElementById("night").checked) { g.fillStyle = "rgba(10,14,40,.62)"; g.fillRect(0, 0, c.width, c.height); }
}
requestAnimationFrame(function loop(ts) {
  const A = ANIMS[vid][anim];
  if (ts - last >= 1000 / A.fps) { last = ts; if (frame < A.n - 1) frame++; else if (A.loop) frame = 0; else if (++held > A.fps) { held = 0; frame = 0; } }
  draw(); requestAnimationFrame(loop);
});
document.getElementById("vars").addEventListener("click", () => bar("anims", Object.entries(ANIMS[vid]).map(([k, a]) => [k, a.ru + " · " + a.n + " · " + a.fps + " к/с"]), () => anim, (k) => (anim = k)));
</script></body></html>
`;
}

// ---------------- запуск ----------------
export function writeSkeletonPilot(root: string, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  const save = saveTo(outDir, files);
  const all = new Map<string, Sheets>();
  const full = new Map<string, PC>();
  const problems: string[] = [];
  const rowsRu = VIEWS.map((v) => VIEW_RU[v]);
  for (const v of VARIANTS) {
    const id = variantId(v);
    const A = animsOf(v.role);
    const sh = {} as Sheets;
    for (const a of ANIM_LIST) sh[a] = buildAnim(v, a);
    all.set(id, sh);
    const cols = A.death.col + A.death.n;
    const sheet = new PC(N * cols, N * 3);
    for (const a of ANIM_LIST) sheet.blit(sh[a].sheet, A[a].col * N, 0);
    full.set(id, sheet);
    save(sheet, `${id}.png`);
    for (const a of ANIM_LIST) {
      problems.push(...frameEdgeCuts(sh[a].sheet, N, OUT, `${id} ${a}`, rowsRu));
      problems.push(...frameHoles(sh[a].sheet, N, `${id} ${a}`, rowsRu));
      problems.push(...thinLines(sh[a].sheet, N, OUT, `${id} ${a}`, rowsRu, 3, [STRING]));
    }
  }
  const hero = loadPC(path.join(root, "client", "public", "assets", "units", "warrior.png"));
  const oldSk = loadPC(path.join(root, "client", "public", "assets", "units", "skeleton.png"));
  const terrain = loadPC(path.join(root, "client", "public", "assets", "tiles", "terrain.png"));
  const refPath = path.join(root, "tools", "out", "refs", "mobs", "skeleton", "ref.png");
  const ref = fs.existsSync(refPath) ? loadPC(refPath) : null;
  const etPath = path.join(root, "vendor", "vfx-ninja", "src", "Ninja Adventure - Asset Pack", "Actor", "Character", "Skeleton", "SpriteSheet.png");
  if (fs.existsSync(etPath)) {
    const et = loadPC(etPath);
    // столбцы листа — вниз, вверх, влево, вправо; берём вниз и вправо, 16 px → ×2
    ETALON = [0, 3].map((col) => scaleNN(crop(et, col * 16, 0, 16, 16), 2));
  }
  save(buildV1(all, hero, oldSk, terrain), "skeleton-v1.png");
  void buildPreview; void buildCompare; void buildHtml; void ref; void full;
  if (problems.length) {
    console.warn(`  скелет: замечаний по кадрам — ${problems.length}:\n${problems.slice(0, 60).map((s) => `    ${s}`).join("\n")}`);
    process.exitCode = 1;
  } else console.log(`  скелет: кадры чисты — край, дыры, линии в 1 px (${VARIANTS.length} вариантов × ${ANIM_LIST.length} анимаций × 3 вида)`);
  return files;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("tools/gen/mobs/skeleton.ts");
if (isMain) {
  const root = path.resolve(path.dirname(process.argv[1]), "..", "..", "..");
  const t0 = Date.now();
  const files = writeSkeletonPilot(root, path.join(root, "tools", "out", "mobs-pilot"));
  console.log(`  готово за ${((Date.now() - t0) / 1000).toFixed(1)} с: ${files.length} файлов`);
}
export { easeIn, ik };
