/**
 * Призывы чернокнижника (на утверждение, в игру не подключены):
 * - Скелет-прислужник (wl_skeleton): поднятый воин нежити Умбрата — кости, остатки воронёной брони (горжет, шипастый
 *   наплечник, наруч, поножь), рваный плащ и табард фракции, корона-обруч, ржавый клинок, щит-«баклер» с гербом
 *   «Корона над гробом», зелёно-фиолетовые огни в глазницах. Появление — из ямы: из земли тянутся костяные руки
 *   («Восстание скелетов»), затем выбирается он сам; гибель — рассыпается на кости, огонёк души улетает.
 * - Демон-прислужник (wl_demon): демон бездны ≈1,3 роста героя (кадр 48), рогатый, крылья-перепонки, когти,
 *   тёмно-фиолетовая кожа с тлеющими трещинами, оковы с обрывком цепи, шар теневого пламени в лапе (снаряд shadow);
 *   парит. Появление — из печати-портала; гибель — втягивается в портал, вращаясь.
 * Анимации: покой 12, ходьба/полёт 12, атака 9–10, урон 8, появление 14, гибель 12; 3 вида (влево — зеркало вбок).
 * Запуск (под замком tools/out/scenario.lock): npx tsx tools/gen/pets/warlock.ts → tools/out/warlock-pets/
 */
import path from "node:path";
import {
  M, R, W, belt, drawFoot, face, flaps, glowMat, handAt, hex, hp, mat, rad, restPose, tail,
  type Creature, type Ctx, type Grip, type Mat, type RoleDef, type TexFn, type V3, type WeaponFn,
} from "../mobs/rig";
import { cross, dot, easeIn, easeInOut, easeOut, frameOf, linear, mul, PX, stampRows, type RGBA } from "../mobs/lib";
import {
  add, buildPet, camN, clamp, hash01, keyed, lerp, lerpV, liePiece, mix, norm, orb, pieceCenter, px, rest, rotAxis, sub, groundEllipse,
  type FxCtx, type Pet, type PFrame, type XP,
} from "./petlib";

// ---------------- палитра ----------------
const BONE = R("#2e2620", "#5a4c3c", "#8c7a60", "#bcaa88", "#e4d8b8");
const UIRON = R("#0e0c12", "#211d29", "#363044", "#514a63", "#7a7290");
const UCLOTH = R("#120a16", "#24142c", "#3a2244", "#55345e", "#704a7a");
const GREEN = R("#16300e", "#2e5e1c", "#5f9c3c", "#8fd46a", "#d8f8b8");
const VIOLET = R("#2a0a4a", "#5a1e9a", "#a05aff", "#d8b0ff", "#fff0ff");
const DIRT = R("#120c0a", "#2a1e16", "#463424", "#6a5038", "#8c6e4c");
const M_BONE = mat("кость", BONE, { base: 1.85, gain: 2.3 });
const M_UIRON = mat("воронёное железо", UIRON, { base: 1.7, gain: 2.6 });
const M_UCLOTH = mat("ткань Умбрата", UCLOTH, { base: 1.7, gain: 2.2 });
const M_GREEN = glowMat("зелёный огонь", GREEN, 2.4);
const M_GAP = mat("щель", R("#1a1210", "#2a1e18", "#382820", "#463428", "#544030"), { base: 1.0, gain: 0.6, lo: 0, hi: 2, crisp: true });
const VOID = hex("#120c0e");

const ribTex: TexFn = (c) => {
  if (c.edge) return 0.2;
  const dy = c.y - c.ay, dx = c.x - c.ax;
  if (dy <= -3) return 0.2;
  if (c.view === "down" && dx === 0 && dy < 1) return 0.4;
  if (c.view === "up" && (dx === 0 || dx === -1)) return dy & 1 ? -0.6 : 0.5;
  return dy & 1 ? { mat: M_GAP, d: c.lum > 0.2 ? 0.6 : 0 } : 0.35;
};
const vertTex: TexFn = (c) => (c.edge ? 0 : (c.y - c.ay) & 1 ? -0.9 : 0.2);
/** Рваная ткань: тёмные полосы-складки по вертикали. */
const foldTex: TexFn = (c) => (c.edge ? 0 : ((c.x - c.ax + 40) % 3 === 0 ? -0.7 : 0));

const tag = (c: Ctx, fromP: number, fromS: number, piece: number) => {
  for (let i = fromP; i < c.S.prims.length; i++) c.S.prims[i].piece = piece;
  for (let i = fromS; i < c.S.stamps.length; i++) c.S.stamps[i].piece = piece;
};
const mark = (c: Ctx) => [c.S.prims.length, c.S.stamps.length] as const;
const ax3 = (c: Ctx): [V3, V3, V3] => [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])];

// =============================== СКЕЛЕТ ===============================
const SK = { SKULL: 10, RIB: 11, PELV: 12, HUR: 13, FOR: 14, HUL: 15, FOL: 16, FER: 17, TIR: 18, FEL: 19, TIL: 20, HANDS: 21 };

/** Щит-баклер Умбрата: воронёный обод, поле чернь-пурпур, герб «Корона над гробом» штампом. */
const umbShield: WeaponFn = (S, g, o) => {
  const n = norm(g.flat);
  const upv = norm(sub(g.dir, mul(n, dot(g.dir, n))));
  const side = cross(upv, n);
  const ax: [V3, V3, V3] = [side, upv, n];
  const c = add(g.at, mul(n, 0.9));
  // форма «гроб-щит»: верх — брусок, низ — эллипс клином
  S.box(S.group(0), M_UIRON, add(add(c, mul(n, -0.12)), mul(upv, 1.6)), [4.0, 1.8, 0.5], ax, 0.4, { piece: o.piece, part: S.newPart(), big: true });
  S.ell(S.group(0), M_UIRON, add(add(c, mul(n, -0.12)), mul(upv, 0.2)), [4.0, 5.3, 0.5], ax, { piece: o.piece, part: S.newPart(), big: true, cut: { n: [0, 1, 0], d: 0.4 } });
  const face = mat("поле щита", R("#0c0610", "#1c0e26", "#2e1840", "#44265a", "#5a3672"), { base: 1.9, gain: 1.6 });
  S.box(S.group(0), face, add(add(c, mul(n, 0.12)), mul(upv, 1.55)), [3.4, 1.5, 0.5], ax, 0.3, { piece: o.piece, part: S.newPart(), big: true });
  S.ell(S.group(0), face, add(add(c, mul(n, 0.12)), mul(upv, 0.2)), [3.4, 4.6, 0.5], ax, { piece: o.piece, part: S.newPart(), big: true, cut: { n: [0, 1, 0], d: 0.4 } });
  const colors: Record<string, RGBA> = { c: hex("#c9a0ff"), C: hex("#e8d4ff"), w: hex("#d8cba8"), W: hex("#f2ead2"), k: hex("#140a1a") };
  const rows = ["C.c.c", "ccccc", ".....", ".WWw.", "WWwww", ".www.", "..w.."];
  S.stamps.push({ at: add(add(c, mul(n, 0.65)), mul(upv, 0.6)), n, piece: o.piece, depthTol: 3, minFacing: 0.2, colors, px: { down: stampRows(rows, -2, -3), side: stampRows(rows, -2, -3), up: stampRows(rows, -2, -3) } });
};

function skelBuild(c: Ctx) {
  const { S, up } = c;
  const p = c.p as XP;
  const sway = c.p.sway;
  // --- таз, табард, пояс
  let m = mark(c);
  S.ell(S.group(0.6), M_BONE, c.pelvisC, [2.6, 1.6, 1.25], undefined, { part: S.newPart(), big: true });
  flaps(c, M_UCLOTH, [[0, 1.75, 4.6, 1.4], [0, -1.7, 4.2, 1.6], [1.8, 1.3, 2.6, 0.7]], foldTex);
  belt(c, M.leather, M_GREEN, 7.9, 2.75, 1.85, 0.6);
  tag(c, m[0], m[1], SK.PELV);
  // --- позвоночник, рёбра, ключицы, горжет, наплечники, плащ
  m = mark(c);
  S.cone(S.group(0), M_BONE, up([0, -0.5, 8.1]), 0.85, up([0, -0.4, 16.0]), 0.9, { part: S.newPart(), tex: vertTex });
  const rc = up([0, 0.3, 13.4]);
  S.ell(S.group(0.7), M_BONE, rc, [3.6, 2.4, 3.2], ax3(c), { part: S.newPart(), tex: ribTex, anc: rc, big: true });
  for (const s of [-1, 1]) S.cone(S.group(0.7), M_BONE, up([0.6 * s, 0.7, 16.2]), 0.6, up([4.5 * s, 0.1, 16.0]), 0.75, { part: S.newPart() });
  S.ell(S.group(0), M_UIRON, up([0, 0.2, 16.6]), [2.7, 2.1, 1.0], ax3(c), { part: S.newPart() });
  {
    // шипастый наплечник слева (сторона щита), малый справа
    const pa = up([-4.8, 0, 16.4]);
    S.ell(S.group(0), M_UIRON, pa, [2.4, 2.3, 1.7], frameOf(c.rotU(norm([-0.4, 0, 1])), c.rotU([0, 1, 0])), { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 0.5 } });
    S.cone(S.group(0), M_UIRON, add(pa, c.rotU([-0.4, 0, 1.0])), 0.6, add(pa, c.rotU([-1.0, -0.2, 3.0])), 0.12, { part: S.newPart() });
    S.cone(S.group(0), M_UIRON, add(pa, c.rotU([-1.4, 0, 0.5])), 0.5, add(pa, c.rotU([-2.8, -0.1, 1.6])), 0.12, { part: S.newPart() });
    const pb = up([4.7, 0, 16.3]);
    S.ell(S.group(0), M_UIRON, pb, [1.8, 1.8, 1.2], frameOf(c.rotU(norm([0.4, 0, 1])), c.rotU([0, 1, 0])), { part: S.newPart(), cut: { n: [0, 0, -1], d: 0.4 } });
    // рваный плащ за спиной: полосы разной длины
    const g = S.group(0.4);
    const pc = S.newPart();
    for (const [x, len, w] of [[-2.2, 9.4, 1.3], [0, 10.6, 1.4], [2.2, 8.6, 1.3]] as [number, number, number][]) {
      const top = up([x, -2.5, 16.2]);
      const dir = norm(c.rotU([x * 0.04 + sway * 0.2, -0.22 - sway * 0.45, -1]));
      S.box(g, M_UCLOTH, add(top, mul(dir, len / 2)), [w, 0.3, len / 2], frameOf(dir, c.rotU([1, 0, 0])), 0.3, { part: pc, tex: foldTex });
    }
  }
  // --- череп, челюсть, обруч-корона, глаза
  S.cone(S.group(0), M_BONE, up([0, 0.1, 16.4]), 0.75, hp(c, [0, 0.1, -3.9]), 0.75, { part: S.newPart(), tex: vertTex });
  tag(c, m[0], m[1], SK.RIB);
  m = mark(c);
  const gk = S.group(1.2);
  const ps = S.newPart();
  S.ell(gk, M_BONE, c.head, [4.4, 4.1, 4.1], undefined, { part: ps, big: true });
  S.ell(gk, M_BONE, hp(c, [0, 2.2, -2.9]), [2.9, 2.1, 1.7], undefined, { part: ps });
  S.ell(S.group(0.4), M_BONE, hp(c, [0, 1.9, -4.5 - c.p.jaw * 1.03]), [2.7, 2.0, 1.05], undefined, { part: S.newPart(), tone: -0.3 });
  S.ell(S.group(0), M_UIRON, hp(c, [0, -0.1, 1.5]), [4.6, 4.3, 0.75], undefined, { part: S.newPart() });
  for (const [x, y, h] of [[0, 4.1, 3.6], [2.9, 3.0, 2.8], [-2.9, 3.0, 2.8], [4.0, -1.0, 2.0], [-4.0, -1.0, 2.0]] as [number, number, number][]) {
    S.cone(S.group(0), M_UIRON, hp(c, [x, y, 1.6]), 0.75, hp(c, [x * 1.08, y * 1.08, 1.6 + h]), 0.15, { part: S.newPart() });
  }
  const gl = c.p.glow;
  const E = gl > 0.75 ? "G" : gl > 0.4 ? "g" : gl > 0.08 ? "d" : "k";
  const E2 = gl > 0.4 ? "g" : "k";
  const colors: Record<string, RGBA> = { k: VOID, b: BONE[1], n: BONE[0], t: BONE[4], G: hex("#eaffd8"), g: GREEN[3], d: GREEN[2], v: VIOLET[2] };
  face(c, {
    at: [0, 3.7, -1.0], sideAt: [1.6, 3.4, -1.0], colors, glow: ["G", "g", "d", "v"], halo: VIOLET[1],
    down: [["bb..bb", `k${E}..${E}k`, `k${E2}..${E2}k`, "..nn.."], -3, -1],
    side: [["bb.", `k${E}.`, `k${E2}.`, "...n"], -1, -1],
  });
  face(c, { at: [0, 3.3, -4.4 - c.p.jaw * 1.03], sideAt: [1.0, 3.1, -4.4 - c.p.jaw * 1.03], colors, down: [["tbtt"], -2, 0], side: [["tb"], 0, 0] });
  tag(c, m[0], m[1], SK.SKULL);
  // --- руки
  const arm = (i: number, pu: number, pf: number) => {
    let q = mark(c);
    const g = S.group(0.4);
    S.cone(g, M_BONE, c.sh[i], 0.95, c.el[i], 0.7, { part: S.newPart() });
    S.ball(g, M_BONE, c.el[i], 0.85, { part: S.newPart() });
    tag(c, q[0], q[1], pu);
    q = mark(c);
    const g2 = S.group(0.4);
    const fp = S.newPart();
    S.cone(g2, M_BONE, c.el[i], 0.8, c.hand[i], 0.76, { part: fp });
    S.ball(g2, M_BONE, c.hand[i], 0.95, { part: fp });
    if (i === 0) {
      const d = norm(sub(c.hand[i], c.el[i]));
      S.cone(S.group(0), M_UIRON, add(c.el[i], mul(d, 1.0)), 1.1, add(c.el[i], mul(d, 2.7)), 1.0, { part: S.newPart() });
    }
    tag(c, q[0], q[1], pf);
  };
  arm(0, SK.HUR, SK.FOR);
  arm(1, SK.HUL, SK.FOL);
  // --- ноги
  const leg = (i: number, pu: number, pl: number) => {
    let q = mark(c);
    const g = S.group(0.4);
    S.cone(g, M_BONE, c.hip[i], 1.0, c.knee[i], 0.8, { part: S.newPart() });
    S.ball(g, M_BONE, c.knee[i], 0.95, { part: S.newPart() });
    tag(c, q[0], q[1], pu);
    q = mark(c);
    S.cone(S.group(0.45), M_BONE, c.knee[i], 0.82, c.ankle[i], 0.76, { part: S.newPart() });
    drawFoot(c, i, M_BONE, 1.6, 0.72);
    if (i === 1) S.cone(S.group(0), M_UIRON, lerpV(c.knee[i], c.ankle[i], 0.15), 1.15, lerpV(c.knee[i], c.ankle[i], 0.75), 1.0, { part: S.newPart() });
    tag(c, q[0], q[1], pl);
  };
  leg(0, SK.FER, SK.TIR);
  leg(1, SK.FEL, SK.TIL);
  // --- костяные руки из земли (появление): мир, без ядра
  const hk = (p.hands as number) ?? 0;
  if (hk > 0.01) {
    const q = mark(c);
    for (const [x, y, tw] of [[5.8, -0.6, 0.3], [-6.0, 0.4, -0.25], [2.4, -2.6, 0.1]] as [number, number, number][]) {
      const z = -3 + 6.0 * hk;
      const base: V3 = [x, y, z - 5];
      const wr: V3 = [x + tw * 2, y + 0.3, z];
      const g = S.group(0.4);
      const pp = S.newPart();
      S.cone(g, M_BONE, base, 0.75, wr, 0.65, { part: pp });
      S.ball(g, M_BONE, wr, 0.85, { part: pp });
      for (let k = 0; k < 4; k++) {
        const a = (k - 1.5) * 0.45 + tw;
        const f0: V3 = add(wr, [Math.sin(a) * 0.7, 0.2, 0.5]);
        const f1: V3 = add(f0, [Math.sin(a) * 1.0, 0.6 * hk, 1.3 - 0.6 * Math.abs(k - 1.5) * 0.5]);
        const f2: V3 = add(f1, [Math.sin(a) * 0.3, 0.9, 0.2]);
        S.cone(S.group(0), M_BONE, f0, 0.32, f1, 0.28, { part: pp });
        S.cone(S.group(0), M_BONE, f1, 0.28, f2, 0.2, { part: pp });
      }
    }
    tag(c, q[0], q[1], SK.HANDS);
  }
}

const skelRole: RoleDef = { id: "warrior", ru: "воин", kind: "slash", R: W.sword(7.6, 9), L: umbShield, shield: true, reach: 9.4 };
const skelCr: Creature = {
  id: "wl_skeleton", ru: "Скелет-прислужник", eliteRu: "",
  scale: [1.0, 1.0],
  dims: { pelvisZ: 7.2, hipX: 1.9, hipZ: 6.7, shX: 4.5, shZ: 16.0, arm: [3.9, 3.7], leg: [3.1, 3.0], headC: [0, 0.2, 22.6], footX: 2.0 },
  roles: [skelRole], build: skelBuild,
};
const skelV = { role: skelRole, elite: false };
const d0 = skelCr.dims;
const H = (s: 1 | -1, x: number, y: number, z: number) => handAt(d0, s, [x, y, z]);
const ipx = (v: number) => Math.round(v);

// ---------- общее: покой, ходьба, урон ----------
function idleOf(cr: Creature, v: typeof skelV, extra: (i: number, ph: number, p: XP) => void = () => {}): PFrame[] {
  const R0 = rest(cr, v, { hands: 0 });
  const chest = [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0];
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (i / 12) * Math.PI * 2;
    const p: XP = { ...R0, chest: chest[i], jaw: i === 6 || i === 7 ? 1 : 0, head: [i === 6 ? 1 : 0, 0] };
    p.glow = 0.75 + 0.25 * Math.sin(ph * 2);
    p.sway = 0.2 * Math.sin(ph);
    p.tail = Math.sin(ph) * 1.2;
    p.flap = 0.5 + 0.5 * Math.sin(ph);
    extra(i, ph, p);
    return { p };
  });
}
function walkOf(cr: Creature, v: typeof skelV, extra: (i: number, ph: number, p: XP) => void = () => {}): PFrame[] {
  const R0 = rest(cr, v, { hands: 0 });
  const st = cr.dims.stride ?? 1.7;
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (i / 12) * Math.PI * 2;
    const p: XP = { ...R0 };
    const lift = (a: number) => Math.max(0, Math.sin(a)) * 1.4;
    p.fR = [cr.dims.footX, st * Math.cos(ph), 1.0 + lift(ph)];
    p.fL = [-cr.dims.footX, st * Math.cos(ph + Math.PI), 1.0 + lift(ph + Math.PI)];
    p.core = [0, 0, -ipx(Math.abs(Math.cos(ph)) * 1.0) * 1.03];
    const sw = Math.cos(ph) * 1.5;
    p.hR = add(R0.hR, [0, -sw * 0.5, 0.15 * Math.abs(sw)]);
    p.hL = add(R0.hL, [0, sw * 0.4, 0]);
    p.jaw = i === 3 || i === 9 ? 1 : 0;
    p.sway = 0.6 + 0.3 * Math.sin(ph * 2);
    p.glow = 1;
    p.tail = Math.sin(ph) * 1.6;
    p.flap = 0.5 + 0.5 * Math.sin(ph * 2);
    extra(i, ph, p);
    return { p };
  });
}
/** Осколки при ударе: несколько пикселей отлетают от точки. */
function chips(o: FxCtx, at: V3, f: number, col: RGBA[], glow = false) {
  const [cx, cy] = o.pt(at);
  for (let k = 0; k < 4; k++) {
    const a = -2.4 + k * 0.9 + hash01(k, 3, 7) * 0.4;
    const r = 2 + f * 2.2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8 + f * f * 0.6;
    px(o, x, y, col[Math.min(col.length - 1, 1 + ((k + f) % 3))], glow);
  }
}
function hurtOf(cr: Creature, v: typeof skelV, extra: Partial<XP> = {}, fx?: (o: FxCtx, f: number) => void): PFrame[] {
  const R0 = rest(cr, v, { hands: 0, ...extra });
  const hit: Partial<XP> = { core: [0, -1.0, 0], lean: rad(11), head: [0, 1], jaw: 1, hR: add(R0.hR, [0.4, -1.2, 1.0]), hL: add(R0.hL, [-0.4, -0.8, 1.2]), glow: 1, sway: 1.0 };
  const ps = keyed(R0, [{ f: 0, p: {} }, { f: 1, p: hit, ease: easeOut }, { f: 2, p: { ...hit, lean: rad(13) } }, { f: 4, p: { core: [0, -0.5, 0], lean: rad(5), head: [0, 0], jaw: 0, sway: 0.4 } }, { f: 7, p: { core: [0, 0, 0], lean: 0, hR: R0.hR, hL: R0.hL, sway: 0 } }], 8);
  return ps.map((p, f) => ({ p, over: fx ? (o) => fx(o, f) : undefined }));
}

// ---------- скелет: атака ----------
function trail(o: FxCtx, pts: V3[], tones: RGBA[]) {
  const sp = pts.map((q) => o.pt(q));
  for (let k = Math.floor((sp.length - 1) * 0.3); k + 1 < sp.length; k++) {
    const f = (k + 1) / (sp.length - 1);
    const tone = f > 0.7 ? 2 : f > 0.45 ? 1 : 0;
    const [x0, y0] = sp[k], [x1, y1] = sp[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let s = 0; s <= n; s++) {
      const x = lerp(x0, x1, s / n), y = lerp(y0, y1, s / n);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) if (!o.img.alpha(Math.floor(x + dx), Math.floor(y + dy))) px(o, x + dx, y + dy, tones[tone]);
    }
  }
}
import { buildBody } from "../mobs/rig";
function skelAttack(view: import("../mobs/lib").View): PFrame[] {
  const R0 = rest(skelCr, skelV, { hands: 0 });
  const upK: Partial<XP> = { hR: H(1, -0.5, -1.3, 0.9), wR: [norm([0.25, -0.55, 0.8]), [1, 0, 0]], yaw: rad(16), hL: H(-1, -0.9, 3.5, -4.7), jaw: 1 };
  const hit: Partial<XP> = { hR: H(1, -5.1, 5.5, -5.5), wR: [norm([-0.55, 0.7, -0.4]), [0, 0, 1]], yaw: rad(-18), core: [0, 1.0, 0], hL: H(-1, 0.3, 1.1, -5.7) };
  const fol: Partial<XP> = { hR: H(1, -6.7, 4.3, -7.3), wR: [norm([-0.8, 0.3, -0.5]), [0, 0, 1]], yaw: rad(-22), core: [0, 1.0, 0], jaw: 0 };
  const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: upK, ease: easeOut }, { f: 3, p: hit, ease: linear }, { f: 4, p: fol, ease: easeOut }, { f: 5, p: { ...fol, hR: H(1, -6.3, 4.1, -7.1) } }, { f: 8, p: { hR: R0.hR, wR: R0.wR, hL: R0.hL, yaw: 0, core: [0, 0, 0], jaw: 0 } }], 9);
  const tip = (p: XP) => buildBody(skelCr, skelV, p, view, "attack").tipR!;
  const arc = (a: XP, b: XP, n = 6) => Array.from({ length: n + 1 }, (_, k) => tip(lerpX2(a, b, k / n)));
  const tones = [hex("#4a5a46"), hex("#9cc08a"), hex("#e4f6d4")];
  return ps.map((p, f) => ({
    p: { ...p, glow: f >= 2 && f <= 4 ? 1 : 0.8 },
    under: f === 3 ? (o) => trail(o, arc(ps[2], ps[3]), tones) : f === 4 ? (o) => trail(o, arc(lerpX2(ps[2], ps[3], 0.55), ps[4], 5), tones) : undefined,
  }));
}
import { lerpX } from "./petlib";
const lerpX2 = lerpX;

// ---------- скелет: появление из ямы ----------
const holeCol = (o: FxCtx, cx: number, cy: number, rx: number, ry: number, glowK: number) => {
  groundEllipse(o, cx, cy, rx, ry, (d, a, x, y) => {
    const upper = Math.sin(a) < 0;
    if (d > 0.78) {
      // насыпь по краю: свет сверху слева
      const l = -Math.cos(a) * 0.5 - Math.sin(a) * 0.8;
      return DIRT[l > 0.3 ? 4 : l > -0.2 ? 3 : 2];
    }
    if (upper && d > 0.45) return DIRT[1];
    const g = glowK * (1 - d);
    if (g > 0.35 && hash01(x, y, 3) < 0.7) return GREEN[g > 0.55 ? 2 : 1];
    return DIRT[0];
  }, false);
  if (glowK > 0.05) {
    // мерцающий свет из ямы — в маску свечения
    groundEllipse(o, cx, cy, rx * 0.55, ry * 0.5, (d, _a, x, y) => (hash01(x, y, 9) < 0.5 * glowK ? GREEN[2] : null), true);
  }
};
const holeLip = (o: FxCtx, cx: number, cy: number, rx: number, ry: number) => {
  groundEllipse(o, cx, cy, rx, ry, (d, a) => {
    if (Math.sin(a) <= 0.1 || d < 0.72) return null;
    const l = -Math.cos(a) * 0.4 + 0.2;
    return DIRT[d > 0.92 ? 2 : l > 0.2 ? 4 : 3];
  });
};
const clods = (o: FxCtx, cx: number, cy: number, f: number, n = 5, spread = 7) => {
  for (let k = 0; k < n; k++) {
    const a = -Math.PI * (0.15 + 0.7 * hash01(k, 1, 5));
    const v = 1.5 + 2.5 * hash01(k, 2, 5);
    const t = f;
    const x = cx + Math.cos(a) * spread * 0.4 + Math.cos(a) * v * t;
    const y = cy - 1 + Math.sin(a) * v * t + 0.9 * t * t;
    if (y > cy + 2) continue;
    px(o, x, y, DIRT[3]); px(o, x + 1, y, DIRT[2]); px(o, x, y + 1, DIRT[1]);
  }
};
function skelSpawn(): PFrame[] {
  const R0 = rest(skelCr, skelV, { hands: 0 });
  const N = 32, cx = 16, cy = 28.2;
  const cores = [-31, -29, -25, -21, -17, -13.5, -10, -7, -4.5, -2.4, -0.8, 0, 0, 0];
  const hands = [0, 0.45, 0.85, 1, 1, 0.9, 0.6, 0.3, 0.05, 0, 0, 0, 0, 0];
  const holeR = [0.3, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.75, 0.45, 0];
  const glowK = [0.6, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, 0];
  return cores.map((cz, f) => {
    let p: XP = { ...R0, core: [0, 0, cz], hands: hands[f], glow: f < 2 ? 0 : 1, jaw: f >= 4 && f <= 7 ? 1 : 0 };
    const reach = f <= 4;
    const grasp = f >= 5 && f <= 9;
    if (reach) {
      p.hR = H(1, -1.6, 1.2, 8.2); p.wR = [norm([0.15, 0.2, 1]), [1, 0, 0]];
      p.hL = H(-1, -1.4, 1.6, 8.0); p.wL = [[0, 0, 1], norm([-0.3, 1, 0])];
    } else if (grasp) {
      const k = (f - 5) / 4;
      p.hR = [6.2, 1.4, 0.9 - cz + k * 2.0]; p.wR = [norm([0.6, 0.5, 0.2]), [0, 0, 1]];
      p.hL = [-6.0, 1.6, 0.9 - cz + k * 2.0]; p.wL = [[0, 0, 1], norm([-0.3, 1, 0])];
      p.lean = rad(-10 * (1 - k));
      if (f >= 8) p.fR = [d0.footX, 0.8, 1.0 + (f === 8 ? 2.4 : 0.8)];
    } else if (f === 10) {
      p = { ...p, ...{ hR: add(R0.hR, [0.3, 0.6, 1.4]), hL: add(R0.hL, [-0.3, 0.4, 1.0]), lean: rad(-4) } } as XP;
    } else if (f === 11) p.chest = 1;
    const clip = f <= 10 ? cy : undefined;
    const r = holeR[f];
    return {
      p, clipY: clip,
      under: r > 0 ? (o) => holeCol(o, cx, cy, 7.6 * r, 2.6 * r, glowK[f]) : undefined,
      over: (o) => {
        if (r > 0 && f <= 10) holeLip(o, cx, cy, 7.6 * r, 2.6 * r);
        if (f >= 1 && f <= 3) clods(o, cx, cy, f - 0.5);
        if (f >= 8 && f <= 11) clods(o, cx, cy, (f - 7) * 0.7, 3, 10);
        if (f >= 11 && f <= 13) for (let k = 0; k < 6; k++) px(o, cx - 8 + k * 3 + (f - 11), cy + 1 - ((k + f) % 2), DIRT[2 + (k % 2)]);
        void N;
      },
    };
  });
}

// ---------- скелет: гибель — рассыпается ----------
function skelDeath(): PFrame[] {
  const R0 = rest(skelCr, skelV, { hands: 0 });
  const jolt: XP = { ...R0, core: [0, -1.0, 0], lean: rad(8), jaw: 1, head: [0, 1], glow: 1 };
  const sag: XP = { ...R0, core: [0, -0.5, -1.03], lean: rad(4), jaw: 1, head: [0, -1], glow: 0.35, hR: add(R0.hR, [0.6, -0.5, -1.4]), hL: add(R0.hL, [-0.5, -0.4, -1.2]), fR: [d0.footX + 0.4, 0.4, 1.0], fL: [-d0.footX - 0.3, -0.2, 1.0] };
  // куда ляжет каждая кость: ось, угол, сдвиг (мир), задержка
  const plan: Record<number, { ax: V3; ang: number; d: [number, number]; delay: number }> = {
    [SK.SKULL]: { ax: [0.3, 1, 0], ang: rad(-75), d: [3.6, 1.4], delay: 0 },
    [SK.RIB]: { ax: [1, 0.15, 0], ang: rad(78), d: [0.4, -1.4], delay: 0.8 },
    [SK.PELV]: { ax: [1, 0, 0], ang: rad(14), d: [-0.6, -0.4], delay: 1.4 },
    [SK.HUR]: { ax: [0.2, 1, 0], ang: rad(-80), d: [3.8, 0.8], delay: 0.6 },
    [SK.FOR]: { ax: [0.3, 1, 0], ang: rad(-84), d: [4.2, 1.4], delay: 0.4 },
    [SK.HUL]: { ax: [0.2, 1, 0], ang: rad(80), d: [-3.4, 0.6], delay: 0.6 },
    [SK.FOL]: { ax: [0.3, 1, 0], ang: rad(84), d: [-4.6, 1.2], delay: 0.4 },
    [SK.FER]: { ax: [0, 1, 0.2], ang: rad(-82), d: [2.4, 1.4], delay: 1.6 },
    [SK.TIR]: { ax: [0, 1, 0], ang: rad(-86), d: [3.4, 1.8], delay: 1.8 },
    [SK.FEL]: { ax: [0, 1, -0.2], ang: rad(82), d: [-2.2, 1.2], delay: 1.6 },
    [SK.TIL]: { ax: [0, 1, 0], ang: rad(86), d: [-3.6, 1.8], delay: 1.8 },
    2: { ax: [0.2, 1, 0.1], ang: rad(-70), d: [5.0, -0.8], delay: 0.2 },
    3: { ax: [1, 0, 0], ang: rad(-80), d: [-4.5, -1.0], delay: 0.3 },
    1: { ax: [1, 0, 0], ang: rad(70), d: [0, -1], delay: 1 },
  };
  const frames: PFrame[] = [];
  for (let f = 0; f < 12; f++) {
    const p: XP = f === 0 ? jolt : f === 1 ? lerpX(jolt, sag, 0.6) : { ...sag, glow: 0, jaw: 1 };
    const fr: PFrame = { p };
    if (f >= 2) {
      fr.rigid = (sc) => (piece) => {
        const pl = plan[piece];
        if (!pl) return null;
        const t = clamp((f - 2 - pl.delay) / 3.6, 0, 1);
        const L = liePiece(sc, piece, norm(pl.ax), pl.ang, pl.d);
        // кадр: тело не выходит за край
        L.c1[0] = clamp(L.c1[0], -11, 11);
        L.c1[1] = clamp(L.c1[1], -3.5, 3.5);
        const z = lerp(L.c0[2], L.c1[2], easeIn(t)) + (piece === SK.SKULL && f - 2 - pl.delay > 3.6 && f - 2 - pl.delay < 5 ? 1.6 : 0);
        return { c0: L.c0, c1: [lerp(L.c0[0], L.c1[0], easeOut(t)), lerp(L.c0[1], L.c1[1], easeOut(t)), z], axis: norm(pl.ax), ang: pl.ang * easeInOut(t) };
      };
    }
    if (f >= 3) {
      fr.over = (o) => {
        // огонёк души поднимается из груды и гаснет
        const k = (f - 3) / 8;
        const [cx, cy] = o.pt([0, 0, 4 + k * 16]);
        const x = cx + Math.sin(f * 1.3) * 1.5;
        if (k < 0.95) {
          px(o, x, cy, k < 0.6 ? hex("#eaffd8") : GREEN[3], true);
          px(o, x + 1, cy, GREEN[k < 0.5 ? 3 : 2], true);
          px(o, x, cy + 1, VIOLET[k < 0.5 ? 3 : 2], true);
          if (k < 0.7) px(o, x + 1, cy + 1, VIOLET[1], true);
          if (k < 0.5) px(o, x, cy + 2, VIOLET[1], true);
        }
        if (f >= 4 && f <= 6) for (let q = 0; q < 6; q++) px(o, 16 - 7 + q * 2.6 + (f - 4), 29 - (q % 2) - (f === 4 ? 1 : 0), DIRT[2 + (q % 2)]);
      };
    }
    frames.push(fr);
  }
  return frames;
}

export const skeletonPet: Pet = {
  id: "wl_skeleton", ru: "СКЕЛЕТ-ПРИСЛУЖНИК", cr: skelCr, v: skelV, cam: camN(32), shadow: 6.5,
  anims: [
    { id: "idle", ru: "ПОКОЙ", fps: 10, loop: true, frames: () => idleOf(skelCr, skelV) },
    { id: "walk", ru: "ХОДЬБА", fps: 12, loop: true, frames: () => walkOf(skelCr, skelV) },
    { id: "attack", ru: "УДАР", fps: 14, loop: false, frames: (v) => skelAttack(v) },
    { id: "hurt", ru: "УРОН", fps: 14, loop: false, frames: () => hurtOf(skelCr, skelV, {}, (o, f) => f >= 1 && f <= 3 && chips(o, [0, 2, 14], f - 1, BONE)) },
    { id: "spawn", ru: "ПОЯВЛЕНИЕ ИЗ ЗЕМЛИ", fps: 12, loop: false, frames: () => skelSpawn() },
    { id: "death", ru: "ГИБЕЛЬ — РАССЫПАЕТСЯ", fps: 12, loop: false, frames: () => skelDeath() },
  ],
};

export { idleOf, walkOf, hurtOf, chips, trail, holeCol, VIOLET, GREEN, UIRON, UCLOTH, M_UIRON, M_UCLOTH, M_GREEN, tag, mark, ax3, H, ipx };
export const _unused = { restPose, tail, glowMat, PX, M_UCLOTH, mix, pieceCenter, rotAxis, orb, Grip: null as unknown as Grip, Mat: null as unknown as Mat, path, easeInOut };
