/**
 * Смотритель зверинца (NPC столиц, на утверждение — только арт): два варианта.
 * - Сольгард: широкополая шляпа с пером, борода, кремовая рубаха с золотой каймой, кожаный фартук, пояс с подсумком
 *   лакомств и мотком поводка, длинная сокольничья перчатка — на ней ястреб; в правой руке — пастуший посох-крюк.
 * - Умбрат: глубокий капюшон, костяная полумаска, долгополый пурпурно-чёрный кафтан с зелёной каймой, пояс со
 *   светящимися склянками, ворон на плече, посох с костяным крюком и зелёным фонарём, цепь-поводок.
 * Анимации: покой 12 (птица крутит головой, поправляет крыло), ходьба 12, жест 10 (подзывает — птица взлетает
 * с руки/плеча и садится обратно). Кадр 32, рост героя.
 */
import {
  M, R, belt, drawArm, drawFoot, drawLeg, face, flaps, glowMat, handAt, hex, hp, mat, pouch, rad, strap,
  type Creature, type Ctx, type Grip, type Mat, type RoleDef, type V3, type WeaponFn,
} from "../mobs/rig";
import { cross, dot, easeOut } from "../mobs/lib";
import { add, camN, keyed, lerpV, mul, norm, rest, sub, type Pet, type PFrame, type XP } from "./petlib";
import { GREEN, walkOf, idleOf } from "./warlock";

const m5 = (name: string, ...cs: string[]) => mat(name, R(...cs), { base: 1.8, gain: 2.3 });
const SKIN = m5("кожа", "#2a1810", "#5a3624", "#8c5c40", "#b8845e", "#dcae84");
const PALE = m5("бледная кожа", "#1e1a22", "#3e3844", "#665e6c", "#948a96", "#c2b8c2");
const CREAM = m5("рубаха", "#2a2014", "#544430", "#86704e", "#b49e74", "#dccaa0");
const APRON = m5("фартук", "#1a100a", "#3a2416", "#5a3a22", "#7c5434", "#9c704a");
const GOLD = m5("золото", "#4a2e0a", "#8a5a14", "#d6a84b", "#f0cc74", "#fff0b8");
const FELT = m5("войлок", "#140e0a", "#2a1e16", "#423024", "#5c4434", "#785a46");
const BEARD = m5("борода", "#1a120c", "#3a2a1c", "#5e4630", "#86684a", "#a88a68");
const PANTS = m5("штаны", "#14100c", "#2a221a", "#423628", "#5a4a38", "#76624a");
const COAT = m5("кафтан Умбрата", "#0c0810", "#1c1224", "#2e1e3a", "#443052", "#5c4470");
const COAT2 = m5("подкладка", "#0a0a0c", "#18181c", "#28282e", "#3a3a42", "#50505a");
const BONE = m5("кость", "#2e2620", "#5a4c3c", "#8c7a60", "#bcaa88", "#e4d8b8");
const FEATH_H = m5("перо ястреба", "#1e140c", "#3e2a18", "#664628", "#8e683e", "#b48e60");
const FEATH_R = m5("перо ворона", "#08080c", "#141420", "#222234", "#34344c", "#4c4c6a");
const M_GREEN = glowMat("зелёный огонь", GREEN, 2.4);
const M_GTRIM = m5("зелёная кайма", "#16300e", "#2e5e1c", "#4e8a32", "#8fd46a", "#c8f0a0");
const box3 = (c: Ctx): [V3, V3, V3] => [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])];

/** Посох-крюк: древко, загнутый верх; у Умбрата — костяной крюк и фонарь с зелёным огнём. */
const crook = (umb: boolean): WeaponFn => (S, g, o) => {
  const w = norm(g.dir);
  const fl = norm(sub(g.flat, mul(w, dot(g.flat, w))));
  const side = cross(w, fl);
  const P = (u: number, sv = 0): V3 => add(add(g.at, mul(w, u)), mul(side, sv));
  const gh = S.group(0);
  const ph = S.newPart();
  S.cone(gh, M.wood, P(-7.6), 0.5, P(9.2), 0.5, { piece: o.piece, part: ph });
  const hk = S.group(0.3);
  const pk = S.newPart();
  const hm = umb ? BONE : M.wood;
  const pts: V3[] = [P(9.2), P(10.6, 0.6), P(11.2, 2.0), P(10.6, 3.2), P(9.4, 3.4)];
  for (let k = 0; k + 1 < pts.length; k++) S.cone(hk, hm, pts[k], 0.62 - k * 0.06, pts[k + 1], 0.56 - k * 0.06, { piece: o.piece, part: pk });
  if (!umb) S.cone(S.group(0), GOLD, P(8.0), 0.75, P(8.7), 0.75, { piece: o.piece, part: S.newPart() });
  else {
    // фонарь на цепочке под крюком
    const lc = add(P(7.6, 3.4), [0, 0, 0]);
    S.cone(S.group(0), M.iron, P(9.2, 3.4), 0.2, add(lc, mul(w, 1.0)), 0.2, { piece: o.piece, part: S.newPart() });
    S.box(S.group(0), M.iron, lc, [0.95, 0.95, 1.2], [side, fl, w], 0.25, { piece: o.piece, part: S.newPart() });
    S.ball(S.group(0), M_GREEN, lc, 0.85, { piece: o.piece, part: S.newPart() });
    S.cone(S.group(0), M.iron, add(lc, mul(w, 1.2)), 0.9, add(lc, mul(w, 1.7)), 0.3, { piece: o.piece, part: S.newPart() });
  }
};

/** Птица: тело, голова, клюв, хвост; крылья сложены или взмахивают (flap 0..1, open 0..1). */
function bird(c: Ctx, at: V3, raven: boolean, open: number, flap: number, look: number) {
  const S = c.S;
  const F = raven ? FEATH_R : FEATH_H;
  const fwd = c.rotU(norm([Math.sin(look) * 0.6, 1, 0]));
  const g = S.group(0.5);
  const pb = S.newPart();
  const body = add(at, [0, 0, 1.5]);
  S.ell(g, F, body, [1.2, 1.5, 1.4], box3(c), { part: pb, big: true });
  const head = add(body, add(mul(c.rotU([0, 1, 0]), 0.9), [0, 0, 1.7]));
  S.ell(g, F, head, [0.95, 1.0, 0.95], undefined, { part: pb });
  S.cone(S.group(0), raven ? m5("клюв", "#0a0a0c", "#1a1a20", "#30303a", "#4a4a56", "#6a6a78") : m5("клюв", "#3a2a08", "#6a4e10", "#a07a20", "#d0a83a", "#f0d070"), add(head, mul(fwd, 0.8)), 0.45, add(head, add(mul(fwd, raven ? 2.0 : 1.5), [0, 0, -0.35])), 0.1, { part: S.newPart() });
  if (!raven) S.ell(S.group(0), m5("грудка", "#3a2c1c", "#6a5438", "#9a8058", "#c4ac82", "#e6d4ae"), add(body, mul(c.rotU([0, 1, 0]), 0.7)), [0.85, 0.6, 1.1], undefined, { part: S.newPart() });
  S.box(S.group(0), F, add(body, add(mul(c.rotU([0, -1, 0]), 1.6), [0, 0, -0.9])), [0.75, 1.3, 0.25], [c.rotU([1, 0, 0]), norm(c.rotU([0, -1, -0.7])), norm(c.rotU([0, 0.7, -1]))], 0.2, { part: S.newPart() });
  const col = { e: raven ? hex("#8fd46a") : hex("#f0c040"), k: hex("#0a0806") };
  c.S.stamps.push({ at: add(head, add(mul(c.rotU([0.55, 0.6, 0]), 0.95), [0, 0, 0.2])), n: c.rotU(norm([0.6, 0.7, 0])), colors: col, glow: raven ? ["e"] : [], px: { down: [[0, 0, "e"]], side: [[0, 0, "e"]] }, depthTol: 2.5 });
  c.S.stamps.push({ at: add(head, add(mul(c.rotU([-0.55, 0.6, 0]), 0.95), [0, 0, 0.2])), n: c.rotU(norm([-0.6, 0.7, 0])), colors: col, glow: raven ? ["e"] : [], px: { down: [[0, 0, "e"]] }, depthTol: 2.5 });
  for (const s of [1, -1]) {
    const root = add(body, c.rotU([0.9 * s, 0, 0.5]));
    const a = (0.2 + 1.1 * flap) * open;
    const span = 1.6 + 3.2 * open;
    const tip = add(root, c.rotU([span * Math.cos(a) * s, -0.6 - 1.2 * (1 - open), span * Math.sin(a) - 0.8 * (1 - open)]));
    const gw = S.group(0.3);
    const pw = S.newPart();
    S.cone(gw, F, root, 0.75, tip, 0.25, { part: pw });
    if (open > 0.2) S.ell(gw, F, lerpV(root, tip, 0.5), [vlen3(sub(tip, root)) * 0.5, 0.25, 0.9 * open], [norm(sub(tip, root)), c.rotU([0, 1, 0]), norm(cross(norm(sub(tip, root)), c.rotU([0, 1, 0])))], { part: pw });
  }
}
const vlen3 = (v: V3) => Math.hypot(v[0], v[1], v[2]);

function keeperBuild(umb: boolean) {
  return (c: Ctx) => {
    const { S, up } = c;
    const p = c.p as XP;
    const skin = umb ? PALE : SKIN;
    // --- корпус и одежда
    const gT = S.group(0.8);
    const pt = S.newPart();
    S.ell(gT, umb ? COAT : CREAM, up([0, 0, 13.4]), [3.6, 2.5, 3.6], undefined, { part: pt, big: true });
    S.ell(gT, umb ? COAT : CREAM, add(c.pelvisC, [0, 0, 1.3]), [3.3, 2.4, 2.0], undefined, { part: pt });
    S.ell(S.group(0.5), umb ? COAT : PANTS, c.pelvisC, [3.2, 2.3, 1.7], undefined, { part: S.newPart(), big: true });
    if (umb) {
      // долгие полы кафтана, кайма
      flaps(c, COAT, [[-1.6, 2.2, 6.4, 1.6], [1.6, 2.2, 6.2, 1.6], [0, -2.2, 6.8, 3.0], [-2.9, 0.2, 6.0, 1.0], [2.9, 0.2, 6.0, 1.0]]);
      flaps(c, M_GTRIM, [[-0.25, 2.45, 6.0, 0.3], [0.25, 2.45, 6.0, 0.3]]);
      S.ell(S.group(0), COAT2, up([0, 0.4, 16.2]), [3.2, 2.4, 1.3], box3(c), { part: S.newPart() });
      belt(c, M.leather, M.iron, 9.2, 3.45, 2.5, 0.6);
      for (const [x, y] of [[2.2, 1.8], [-1.0, 2.4], [-2.6, 1.4]] as [number, number][]) {
        S.cone(S.group(0), m5("склянка", "#0e1a10", "#1c3020", "#2e4a30", "#4a6a44", "#6a8a5e"), up([x, y, 8.4]), 0.55, up([x, y, 9.6]), 0.55, { part: S.newPart() });
        S.ball(S.group(0), M_GREEN, up([x, y + 0.2, 8.6]), 0.45, { part: S.newPart() });
      }
      // цепь-поводок с пояса
      const gc = S.group(0.2);
      const pc = S.newPart();
      for (let k = 0; k < 5; k++) S.ball(gc, M.iron, up([3.2 + Math.sin(k + p.sway) * 0.3, 0.6, 8.6 - k * 0.9]), 0.42, { part: pc });
    } else {
      // фартук, кайма ворота, пояс, подсумок, моток поводка
      S.ell(S.group(0), APRON, up([0, 0.8, 11.0]), [3.0, 2.0, 4.6], box3(c), { part: S.newPart(), big: true, cut: { n: [0, -1, 0], d: -0.6 } });
      flaps(c, APRON, [[0, 2.3, 4.6, 2.6]]);
      S.ell(S.group(0), GOLD, up([0, 0.6, 16.4]), [2.4, 1.9, 0.55], box3(c), { part: S.newPart() });
      belt(c, M.leather, GOLD, 9.4, 3.45, 2.55, 0.65);
      pouch(c, M.leather, [3.3, 0.8, 8.8], [1.0, 0.75, 0.95]);
      S.ell(S.group(0), M.rope, up([-3.4, 0.4, 8.6]), [0.7, 1.4, 1.4], box3(c), { part: S.newPart() });
      strap(c, M.leather, [-3.2, 2.4, 16.0], [3.0, 2.6, 9.6], 0.5, GOLD, 2);
    }
    // --- голова
    S.cone(S.group(0), skin, up([0, 0.3, 15.8]), 1.5, hp(c, [0, 0, -2.4]), 1.4, { part: S.newPart() });
    const gH = S.group(0.8);
    const ph = S.newPart();
    S.ell(gH, skin, c.head, [3.0, 3.0, 3.3], undefined, { part: ph, big: true });
    const col = { e: hex("#1a1210"), w: hex("#e8dcc8"), b: umb ? hex("#0c0a0e") : BEARD.ramp[1], g: GREEN[3], m: hex("#2a1410") };
    if (umb) {
      // капюшон и костяная полумаска
      S.ell(S.group(0), COAT, hp(c, [0, -0.5, 0.6]), [3.6, 3.6, 3.9], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.85, -0.35], d: 1.3 } });
      S.cone(S.group(0), COAT, hp(c, [0, -1.6, 2.6]), 1.8, hp(c, [0, -4.0, 3.4]), 0.3, { part: S.newPart() });
      S.ell(S.group(0), BONE, hp(c, [0, 1.8, 0.5]), [2.5, 1.5, 1.6], undefined, { part: S.newPart(), cut: { n: [0, 0, -1], d: 0.4 } });
      face(c, { at: [0, 3.0, 0.6], sideAt: [1.5, 2.7, 0.6], colors: col, glow: ["g"], halo: GREEN[1], down: [["eg.ge"], -2, 0], side: [["eg"], -1, 0] });
    } else {
      S.ell(S.group(0.4), BEARD, hp(c, [0, 1.6, -2.0]), [2.6, 1.8, 2.4], undefined, { part: S.newPart(), big: true });
      S.ell(S.group(0), BEARD, hp(c, [0, 2.6, -0.4]), [1.8, 0.6, 0.5], undefined, { part: S.newPart() });
      // шляпа: широкие поля, тулья, перо
      S.ell(S.group(0), FELT, hp(c, [0, 0, 2.3]), [5.6, 5.4, 0.55], undefined, { part: S.newPart(), big: true });
      S.ell(S.group(0.4), FELT, hp(c, [0, -0.2, 3.6]), [3.0, 2.9, 1.9], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 0.5 } });
      S.ell(S.group(0), GOLD, hp(c, [0, -0.2, 2.9]), [3.1, 3.0, 0.45], undefined, { part: S.newPart() });
      S.cone(S.group(0), m5("перо", "#2a0e0a", "#5a1c14", "#8e3424", "#c05a3a", "#e48a62"), hp(c, [-2.4, -0.8, 3.4]), 0.55, hp(c, [-3.6, -3.4, 6.2]), 0.15, { part: S.newPart() });
      face(c, { at: [0, 3.0, 0.5], sideAt: [1.6, 2.7, 0.5], colors: col, down: [["bb.bb", "ew.we"], -2, -1], side: [["bb", "we"], -1, -1] });
    }
    // --- руки, ноги
    for (const i of [0, 1]) {
      drawArm(c, i, { mat: umb ? COAT : CREAM, r: [1.4, 1.2, 1.1] }, 1.05, skin);
      if (!umb && i === 1) S.cone(S.group(0), APRON, lerpV(c.el[i], c.hand[i], 0.1), 1.55, lerpV(c.el[i], c.hand[i], 0.9), 1.45, { part: S.newPart() });
      if (umb) S.cone(S.group(0), M_GTRIM, lerpV(c.el[i], c.hand[i], 0.7), 1.25, lerpV(c.el[i], c.hand[i], 0.78), 1.25, { part: S.newPart() });
      drawLeg(c, i, { mat: umb ? COAT2 : PANTS, r: [1.6, 1.4, 1.25] });
      S.cone(S.group(0), M.leather, add(c.ankle[i], [0, 0, 2.4]), 1.45, add(c.ankle[i], [0, 0, 0.3]), 1.4, { part: S.newPart() });
      drawFoot(c, i, M.leather, 2.4, 1.1, 1.15);
    }
    // --- птица
    const lift = (p.birdLift as number) ?? 0;
    const perch = umb ? up([-4.7, -0.2, 17.0]) : add(c.hand[1], [0, 0, 0.7]);
    bird(c, add(perch, [lift * 1.5 * (umb ? -1 : 1), lift * 0.5, lift * 3.2]), umb, (p.birdOpen as number) ?? 0, c.p.flap, (p.birdLook as number) ?? 0);
  };
}

const roleOf = (umb: boolean): RoleDef => ({ id: umb ? "umb" : "sol", ru: "смотритель", kind: "cast", R: crook(umb) });
const dims = { pelvisZ: 7.8, hipX: 2.0, hipZ: 7.2, shX: 4.5, shZ: 16.2, arm: [4.0, 3.8] as [number, number], leg: [3.4, 3.2] as [number, number], headC: [0, 0.6, 21.0] as V3, footX: 2.1 };
function keeper(umb: boolean): Pet {
  const role = roleOf(umb);
  const cr: Creature = { id: umb ? "keeper_umb" : "keeper_sol", ru: "Смотритель зверинца", eliteRu: "", scale: [1.0, 1.0], widen: [1.08, 1.06], dims, roles: [role], build: keeperBuild(umb) };
  const v = { role, elite: false };
  const H = (s: 1 | -1, x: number, y: number, z: number) => handAt(dims, s, [x, y, z]);
  const perchHand = umb ? {} : { hL: H(-1, 1.6, 3.4, -3.0) };
  const R00 = rest(cr, v, {});
  const R0 = rest(cr, v, { birdLift: 0, birdOpen: 0, birdLook: 0, ...perchHand, hR: add(R00.hR, [1.0, 0.4, 0]) });
  const fixHand = (fr: PFrame[]) => fr.map((F) => ({ ...F, p: { ...F.p, ...perchHand, birdLift: 0, birdOpen: 0 } as XP }));
  const idle = () => fixHand(idleOf(cr, v as never, (i, ph, p) => {
    p.birdLook = i >= 3 && i <= 5 ? 0.9 : i >= 8 && i <= 10 ? -0.7 : 0;
    p.flap = 0;
    p.hR = add(p.hR, [1.0, 0.4, 0]);
  })).map((F, i) => ({ ...F, p: { ...F.p, birdOpen: i === 6 || i === 7 ? 0.35 : 0 } as XP }));
  const walk = () => fixHand(walkOf(cr, v as never, (_i, _ph, p) => { p.birdLook = 0; p.hR = add(p.hR, [1.0, 0.4, 0]); }));
  const gesture = (): PFrame[] => {
    const call: Partial<XP> = { hR: H(1, -0.4, 2.6, -3.0), wR: [norm([0.1, 0.3, 1]), [0, 1, 0]], head: [0, 1], jaw: 1 };
    const up1: Partial<XP> = { birdLift: 1, birdOpen: 1, flap: 1, ...(umb ? {} : { hL: H(-1, 0.6, 2.4, 1.2) }) };
    const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: { ...call, birdOpen: 0.6, flap: 0.2, ...(umb ? {} : { hL: H(-1, 1.2, 3.0, -1.0) }) }, ease: easeOut }, { f: 3, p: up1, ease: easeOut }, { f: 4, p: { ...up1, flap: 0.1 } }, { f: 5, p: { ...up1, flap: 1, birdLift: 1.05 } }, { f: 6, p: { ...up1, flap: 0.1 } }, { f: 7, p: { birdLift: 0.4, birdOpen: 0.8, flap: 0.8 } }, { f: 9, p: { birdLift: 0, birdOpen: 0, flap: 0, hR: R0.hR, wR: R0.wR, head: [0, 0], jaw: 0, ...perchHand } }], 10);
    return ps.map((p) => ({ p }));
  };
  return {
    id: cr.id, ru: umb ? "СМОТРИТЕЛЬ ЗВЕРИНЦА · УМБРАТ" : "СМОТРИТЕЛЬ ЗВЕРИНЦА · СОЛЬГАРД", cr, v, cam: camN(32), shadow: 6.5,
    anims: [
      { id: "idle", ru: "ПОКОЙ", fps: 10, loop: true, frames: idle },
      { id: "walk", ru: "ХОДЬБА", fps: 12, loop: true, frames: walk },
      { id: "gesture", ru: "ЖЕСТ — ПОДЗЫВАЕТ, ПТИЦА ВЗЛЕТАЕТ", fps: 12, loop: false, frames: gesture },
    ],
  };
}
export const keeperSol = keeper(false);
export const keeperUmb = keeper(true);
void [rad, R, M, glowMat] as unknown as [Grip, Mat];
