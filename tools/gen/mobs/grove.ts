/**
 * Задача 140, партия 2: малые лесные (описания списка 2, ref sapling_ent), слизни и приспешники рейда.
 * - Малые лесные — один образ, роли через породу: малый энт (кора, крона, когти-ветки), корневик (сплетение корней),
 *   моховик (валун во мху), грибочеловек (шляпка с пятнами), споровик (дождевик — чары спорами), шишечник (чешуйчатая
 *   шишка — бросает шишки). Рост 0,75 / 0,8. Усиленный «Древний»: светятся глаза, мох и грибы, крона гуще.
 * - Слизни: желе (зелёно-бирюзовый, блик), панцирный (с раковиной), чумной (плюётся), магмовый (светящийся). Рост 0,7 / 0,78.
 * - Рейд «Цитадель Хаоса»: Оруженосец Хаоса — хобгоблин в чёрно-красных латах с шипами, алебарда (Щ); Искра Хаоса —
 *   усиленный бес: угли в рогах и хвосте, знак Хаоса на груди, чары цветом Хаоса (М).
 */
import {
  M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, furTex, glowMat, hex, hp, lamellarTex, lerpV, mat, mul, norm, spotTex, sub, tail,
  type Creature, type Ctx, type Ramp, type V3, type WeaponFn,
} from "./rig";
import { hobgoblin } from "./hobgoblin";
import { imp } from "./imp";

const m5 = (name: string, ...cs: string[]) => mat(name, R(...cs), { base: 1.8, gain: 2.3 });
const BARK = m5("кора", "#1a120c", "#36261a", "#54402c", "#725a40", "#927656");
const LEAF = m5("листва", "#122008", "#243e10", "#3c641c", "#5a8a2c", "#80b044");
const LEAF_Y = m5("молодая листва", "#2a3a08", "#4a6a10", "#76a020", "#a8cc3c", "#d4ec70");
const ROOT = m5("корни", "#1e140c", "#3c2a1a", "#5c4228", "#7c5c3a", "#9c7a50");
const MOSS = m5("мох", "#0e1a08", "#1e3610", "#34561c", "#4e7428", "#6c9438");
const STONE = m5("валун", "#1e1e20", "#3c3c40", "#5e5e64", "#86868a", "#b0b0b2");
const CAP = m5("красная шляпка", "#2a0a08", "#561410", "#8a221a", "#b8382a", "#dc5a46");
const STALK = m5("ножка гриба", "#3a3428", "#6a604c", "#9a8e74", "#c4b89c", "#e8dec4");
const PUFF = m5("дождевик", "#2a2418", "#544a34", "#847654", "#b0a27a", "#d8cca4");
const CONE = m5("шишка", "#1e1008", "#3e2410", "#62401c", "#86602e", "#a87e42");
const EYE_G = R("#3a4a0a", "#6a8a14", "#c8e030", "#f0ff8a", "#fcffe0");
const SPORE = R("#2a3a0a", "#5a7a14", "#a0c030", "#d8f070", "#f8ffd0");
const box3 = (c: Ctx): [V3, V3, V3] => [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])];

function groveBuild(c: Ctx) {
  const { S, E, up } = c;
  const id = c.role.id;
  const body = { ent: BARK, root: ROOT, moss: STONE, mushroom: STALK, spore: PUFF, cone: CONE }[id]!;
  const tex = id === "moss" ? spotTex(0.3, 0, 181, MOSS) : id === "cone" ? lamellarTex : id === "ent" || id === "root" ? furTex(182, 0.3) : spotTex(0.06, -0.6, 183);
  const gT = S.group(0.8);
  const pt = S.newPart();
  const fat = id === "moss" || id === "spore" || id === "cone";
  S.ell(gT, body, up([0, 0, 12.4]), [fat ? 4.0 : 3.0, fat ? 3.2 : 2.2, fat ? 4.4 : 4.0], undefined, { part: pt, big: true, tex });
  S.ell(gT, body, c.pelvisC, [2.6, 2.0, 1.8], undefined, { part: pt, tex });
  if (E) S.ell(S.group(0.3), MOSS, up([-1.6, -0.4, 15.4]), [2.2, 2.0, 1.2], undefined, { part: S.newPart(), tex: furTex(184, 0.3) });
  // голова и «шапка» по породе
  if (id === "ent" || id === "root") {
    S.ell(S.group(0.6), body, c.head, [2.6, 2.6, 3.4], undefined, { part: S.newPart(), big: true, tex });
    if (id === "ent") {
      const gl = S.group(0.5);
      const pl = S.newPart();
      const crown: [number, number, number, number][] = [[0, -0.6, 5.0, 3.0], [2.6, -0.4, 3.8, 2.2], [-2.6, -0.4, 3.8, 2.2], [1.4, -1.6, 6.0, 1.8], [-1.4, -1.2, 6.4, 1.8]];
      if (E) crown.push([3.4, -1.4, 6.0, 1.8], [-3.4, -1.4, 6.0, 1.8], [0, -1.8, 7.6, 2.0]);
      for (const [x, y, z, r] of crown) S.ball(gl, (x + z) % 2 > 1 ? LEAF_Y : LEAF, hp(c, [x, y, z]), r, { part: pl, tex: furTex(185, 0.3) });
      for (const s of [1, -1]) S.cone(S.group(0), BARK, hp(c, [0.8 * s, -0.4, 2.0]), 0.6, hp(c, [2.4 * s, -0.6, 4.2]), 0.3, { part: S.newPart() });
    } else {
      for (const [x, z] of [[1.6, 2.4], [-1.4, 2.8], [0.2, 3.4]] as [number, number][]) S.cone(S.group(0), ROOT, hp(c, [x * 0.6, -0.2, z]), 0.6, hp(c, [x * 1.6, -1.2, z + 2.2]), 0.15, { part: S.newPart() });
    }
  } else if (id === "moss") {
    S.ell(S.group(0.6), STONE, c.head, [2.8, 2.6, 2.6], undefined, { part: S.newPart(), big: true, tex });
    S.ell(S.group(0.3), MOSS, hp(c, [0, -0.4, 1.6]), [3.0, 2.8, 1.6], undefined, { part: S.newPart(), tex: furTex(186, 0.35) });
  } else if (id === "mushroom" || id === "spore") {
    S.ell(S.group(0.6), body, c.head, [2.4, 2.4, 2.8], undefined, { part: S.newPart(), big: true });
    const capM = id === "mushroom" ? CAP : PUFF;
    const cr = id === "mushroom" ? 5.2 : 3.6;
    S.ell(S.group(0.4), capM, hp(c, [0, -0.2, 2.6]), [cr, cr, id === "mushroom" ? 2.2 : 3.0], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 0.3 }, tex: id === "mushroom" ? spotTex(0.12, 0, 187, STALK) : spotTex(0.1, -0.5, 188) });
    if (E && id === "spore") S.ball(S.group(0), glowMat("споры", SPORE, 2.2), hp(c, [0, 0, 5.4]), 0.9, { part: S.newPart() });
  } else {
    // шишечник: голова-шишка с чешуями и хохолком
    S.ell(S.group(0.6), CONE, c.head, [2.6, 2.6, 3.4], undefined, { part: S.newPart(), big: true, tex: lamellarTex });
    S.cone(S.group(0), LEAF, hp(c, [0, 0, 3.0]), 0.8, hp(c, [0, -0.6, 5.4]), 0.2, { part: S.newPart() });
  }
  const ec = E ? "G" : "e";
  face(c, { at: [0, id === "moss" ? 2.6 : 2.4, 0.4], colors: { e: hex("#e8d040"), G: EYE_G[4], k: hex("#0c0806"), m: hex("#140a06") }, glow: ["G", "e"], halo: EYE_G[2], down: [[`k${ec}.${ec}k`, c.p.jaw ? ".m.m." : "....."], -2, 0], side: [[`k${ec}`], -1, 0], sideAt: [1.5, 2.0, 0.4] });
  for (const i of [0, 1]) {
    const limb = id === "moss" ? STONE : id === "mushroom" || id === "spore" ? STALK : body;
    drawArm(c, i, { mat: limb, r: [1.1, 0.95, 0.8], tex: id === "ent" || id === "root" ? furTex(189, 0.3) : undefined }, 1.0);
    if (id === "ent" || id === "root") for (const k of [-1, 0, 1]) S.cone(S.group(0), id === "ent" ? LEAF_Y : ROOT, c.hand[i], 0.4, add(c.hand[i], add(mul(norm(sub(c.hand[i], c.el[i])), 1.8), [k * 0.6, 0, 0])), 0.12, { part: S.newPart() });
    drawLeg(c, i, { mat: limb, r: [1.4, 1.1, 0.95] });
    drawFoot(c, i, id === "root" || id === "ent" ? ROOT : limb, 2.4, 1.0, 1.2);
  }
  if (id === "root") flaps(c, ROOT, [[-1.6, 1.6, 3.2, 0.5], [1.4, 1.8, 3.6, 0.5], [0, -1.8, 3.0, 0.5]]);
}
const coneThrow = (): WeaponFn => (S, g, o) => {
  if (o.k < 0) return;
  S.ell(S.group(0), CONE, add(g.at, [0, 0.3, 0.4]), [0.8, 0.8, 1.1], undefined, { piece: o.piece, part: S.newPart(), tex: lamellarTex });
};
export const grove: Creature = {
  id: "grove", ru: "Малые лесные", eliteRu: "Древний",
  scale: [0.75, 0.8], widen: [1.15, 1.1], death: "crumble",
  dust: R("#2a1e12", "#4e3a24", "#76603e", "#9e8a60"),
  dims: { pelvisZ: 7.8, hipX: 2.0, hipZ: 7.2, shX: 4.2, shZ: 16.0, arm: [4.4, 4.2], leg: [3.4, 3.2], headC: [0, 0.8, 20.8], footX: 2.2, hunch: 0.08 },
  roles: [
    { id: "ent", ru: "малый энт", kind: "claw" },
    { id: "root", ru: "корневик", kind: "claw" },
    { id: "moss", ru: "моховик", kind: "claw" },
    { id: "mushroom", ru: "грибочеловек", kind: "claw" },
    { id: "spore", ru: "споровик", kind: "handcast", fx: SPORE },
    { id: "cone", ru: "шишечник", kind: "throw", R: coneThrow(), proj: { ramp: CONE.ramp, r: 1.1 }, reach: 1.5 },
  ],
  ref: "sapling_ent",
  build: groveBuild,
};

// =============================== СЛИЗНИ ===============================
const SL: Record<string, { r: Ramp; e: Ramp; glow?: boolean }> = {
  jelly: { r: R("#0a2a24", "#146050", "#2aa088", "#6cd8bc", "#d0fff0"), e: R("#082a30", "#10586a", "#2092aa", "#62cce0", "#ccf8ff") },
  shell: { r: R("#1e2a0c", "#3c5418", "#5e8026", "#86aa3e", "#b4d470"), e: R("#1a220a", "#344614", "#526c22", "#789438", "#a4c062") },
  plague: { r: R("#2a2a08", "#545410", "#86841e", "#b4b036", "#dcd870"), e: R("#22200a", "#464212", "#706a1e", "#9a9230", "#c4bc58") },
  magma: { r: R("#3a0c04", "#701a08", "#b0360c", "#f0701c", "#ffc860"), e: R("#4a0e04", "#8a2008", "#d04410", "#ff8a28", "#ffe080"), glow: true },
};
function slimeBuild(c: Ctx) {
  const { S, E } = c;
  const id = c.role.id;
  const d = SL[id];
  const m = mat(`слизь ${id}`, E ? d.e : d.r, { base: 2.0, gain: 2.2 });
  const cz = c.core[2];
  const sq = Math.max(-1, Math.min(1, cz / 2));
  const base: V3 = [c.core[0], c.core[1], Math.max(0, cz)];
  const Rr = E ? 4.6 : 4.2;
  const rz = Rr * 0.85 * (1 + 0.18 * sq) + c.p.chest * 0.2;
  const rx = Rr * (1 - 0.1 * sq);
  const ctr = add(base, [0, 0, rz]);
  const bub = d.glow ? spotTex(0.1, 0, 191, glowMat("жар", R("#6a1a04", "#c0400a", "#ff8a20", "#ffd060", "#fff8d0"), 2.4)) : spotTex(0.08, 0.9, 192);
  const g = S.group(0.4);
  const p = S.newPart();
  S.ell(g, m, ctr, [rx, rx * 0.95, rz], undefined, { part: p, big: true, tex: bub, cut: { n: [0, 0, -1], d: rz * 0.92 } });
  // блик и пузыри внутри
  S.ell(S.group(0), mat("блик", R("#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"), { base: 4, gain: 0, crisp: true }), add(ctr, [-rx * 0.45, rx * 0.5, rz * 0.5]), [0.8, 0.4, 0.5], undefined, { part: S.newPart() });
  if (id === "shell") {
    const sh = m5("раковина", "#2a1a0c", "#54361a", "#80562c", "#a87a44", "#d0a464");
    S.ell(S.group(0.4), sh, add(ctr, [0, -1.0, rz * 0.6]), [3.0, 3.2, 2.8], undefined, { part: S.newPart(), big: true, tex: (q) => (q.edge ? 0 : Math.abs(((q.l[0] * q.l[0] + q.l[2] * q.l[2]) ** 0.5 % 1.4) - 0.7) < 0.2 ? -1 : 0) });
    if (E) for (const s of [1, -1]) S.cone(S.group(0), M.horn, add(ctr, [1.6 * s, -1.2, rz + 1.2]), 0.5, add(ctr, [2.6 * s, -1.6, rz + 3.0]), 0.12, { part: S.newPart() });
  }
  if (id === "plague") for (const [x, y] of [[1.4, 0.8], [-1.8, -0.4], [0.4, -1.6]] as [number, number][]) S.ball(S.group(0), m5("нарывы", "#3a3a0a", "#6a6a14", "#a4a028", "#d4d050", "#f4f0a0"), add(ctr, [x, y + 1, rz * 0.6]), 0.8, { part: S.newPart() });
  const ec = d.glow || E ? "G" : "k";
  const jaw = c.p.jaw;
  face(c, { at: sub(add(ctr, [0, rx * 0.9, rz * 0.2]), c.head) as V3, colors: { k: hex("#0a0c0a"), G: id === "magma" ? hex("#fff0a0") : hex("#f0ffa0"), m: hex("#0a0c0a") }, glow: ["G"], halo: hex("#a0a040"), down: [[`${ec}..${ec}`, jaw ? ".mm." : "...."], -2, -1], side: [[ec], 0, -1], sideAt: sub(add(ctr, [rx * 0.4, rx * 0.8, rz * 0.2]), c.head) as V3 });
  void lerpV;
}
export const slime: Creature = {
  id: "slime", ru: "Слизни", eliteRu: "Раздувшийся",
  scale: [0.9, 1.0], death: "crumble",
  dust: R("#14402c", "#2a7a5a", "#5ab48c", "#a0e0c4"),
  dims: { pelvisZ: 4, hipX: 1, hipZ: 3, shX: 2.6, shZ: 6, arm: [2.4, 2.4], leg: [2, 2], headC: [0, 0, 6], footX: 1.5, stride: 0.6 },
  roles: [
    { id: "jelly", ru: "слизень-желе", kind: "leap" },
    { id: "shell", ru: "панцирный слизень", kind: "leap" },
    { id: "plague", ru: "чумной слизень", kind: "throw", R: () => {}, proj: { ramp: SL.plague.r, r: 1.1 }, reach: 1, fx: SL.plague.r },
    { id: "magma", ru: "магмовый слизень", kind: "leap", fx: SL.magma.r },
  ],
  build: slimeBuild,
};

// =============================== РЕЙД: ОРУЖЕНОСЕЦ И ИСКРА ХАОСА ===============================
const CHAOS = R("#3a0410", "#7a0a24", "#d01a40", "#ff6a86", "#ffd0dc");
const CHAOS_P = R("#2a0430", "#5a0a64", "#a01ab0", "#e070f0", "#fcd8ff");
const BLACKP = mat("чёрные латы", R("#0a0808", "#1a1414", "#2e2424", "#4a3a3a", "#7a6464"), { base: 1.9, gain: 2.4 });
function squireBuild(c: Ctx) {
  hobgoblin.build({ ...c, E: true });
  const { S, up } = c;
  const glow = glowMat("знак Хаоса", CHAOS, 2.4);
  // чёрные латы поверх ламеллярных: нагрудник, наплечники с шипами, шлем с рогами
  S.ell(S.group(0), BLACKP, up([0, 0.6, 13.2]), [4.0, 2.6, 3.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, -1, 0], d: 0.2 } });
  S.ell(S.group(0), glow, up([0, 3.2, 13.4]), [0.6, 0.2, 0.9], undefined, { part: S.newPart() });
  for (const s of [1, -1]) {
    const at = up([4.6 * s, 0, 16.6]);
    S.ell(S.group(0), BLACKP, at, [2.3, 2.1, 1.5], undefined, { part: S.newPart(), cut: { n: [0, 0, -1], d: 0.3 } });
    for (const k of [0, 1, 2]) S.cone(S.group(0), M.steel, add(at, c.rotU([(0.4 + k * 0.5) * s, (k - 1) * 0.9, 1.0])), 0.4, add(at, c.rotU([(1.2 + k * 0.5) * s, (k - 1) * 1.1, 2.8])), 0.1, { part: S.newPart() });
    S.cone(S.group(0.3), BLACKP, hp(c, [2.4 * s, -0.4, 2.6]), 0.75, hp(c, [3.6 * s, -1.2, 5.4]), 0.15, { part: S.newPart() });
  }
  face(c, { at: [0, 3.1, 0.6], colors: { G: CHAOS[4] }, glow: ["G"], halo: CHAOS[2], down: [["G...G"], -2, 0], side: [["G"], 0, 0], sideAt: [1.6, 2.8, 0.6] });
}
export const chaosSquire: Creature = {
  ...hobgoblin,
  id: "chaos_squire", ru: "Оруженосец Хаоса", eliteRu: "",
  roles: [{ id: "halberd", ru: "оруженосец Хаоса", kind: "chop2h", R: W.halberd(8.4, 5.0), grip2: 3.2, reach: 11, eliteOnly: true, fx: CHAOS }],
  ref: "hobgoblin",
  build: squireBuild,
};
function sparkBuild(c: Ctx) {
  imp.build({ ...c, E: true });
  const { S, up } = c;
  const glow = glowMat("знак Хаоса", CHAOS_P, 2.6);
  S.ell(S.group(0), glow, up([0, 2.5, 12.8]), [0.9, 0.25, 1.1], undefined, { part: S.newPart() });
  for (const k of [0, 1, 2]) S.ball(S.group(0), glowMat("искры", CHAOS, 2.6), up([Math.cos(k * 2.1 + c.p.tail) * 4.6, Math.sin(k * 2.1 + c.p.tail) * 3.0, 14 + k * 2.4]), 0.55, { part: S.newPart() });
}
export const chaosSpark: Creature = {
  ...imp,
  id: "chaos_spark", ru: "Искра Хаоса", eliteRu: "",
  scale: [0.65, 0.68],
  roles: [{ id: "caster", ru: "искра Хаоса", kind: "handcast", fx: CHAOS_P, eliteOnly: true }],
  ref: "imp",
  build: sparkBuild,
};
