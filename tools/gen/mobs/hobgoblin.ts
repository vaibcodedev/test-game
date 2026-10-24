/**
 * Задача 140, партия 1: хобгоблин (tools/out/refs/mobs/hobgoblin/ref.png) — рослый, красно-бурая кожа, чёрные волосы
 * в хвосте, острые уши, суровое лицо; бурая рубаха и штаны, босой. «В простой одежде можно добавить немного брони» —
 * у обычного кожаный нагрудник. Рост 0,95 / 1,0.
 * Роли: мечник (меч и щит), сотник (алебарда); элита зоны — Закалённый сотник.
 * Усиленный «Закалённый»: ламеллярный доспех, шлем с гребнем, красный плащ.
 * Запуск: npx tsx tools/gen/mobs/hobgoblin.ts → tools/out/mobs-batch1/hobgoblin.png.
 */
import {
  BATCH_DIR, belt, strap, pouch, lerpV, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, hex, hp, isMainFile, lamellarTex, mat, rootFromArgv, runCreature,
  type Creature, type Ctx,
} from "./rig";

const SKIN = R("#2a120c", "#541f14", "#843a26", "#a8563a", "#c87656");
const HAIR = R("#08080a", "#141418", "#222228", "#32323a", "#44444c");
const CLOTH = R("#1a160e", "#342c1e", "#50442e", "#6a5c40", "#847654");
const M_SKIN = mat("кожа хобгоблина", SKIN, { base: 1.8, gain: 2.3 });
const M_HAIR = mat("волосы", HAIR, { base: 1.7, gain: 2.2 });
const M_CL = mat("рубаха", CLOTH, { base: 1.6, gain: 2.2 });

function build(c: Ctx) {
  const { S, E, up } = c;
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, M_CL, up([0, 0, 12.6]), [3.6, 2.4, 4.0], undefined, { part: pt, big: true });
  S.ell(gT, M_CL, c.pelvisC, [3.1, 2.2, 1.9], undefined, { part: pt });
  flaps(c, M_CL, [[-1.5, 2.0, 2.2, 1.4], [1.5, 2.0, 2.2, 1.4], [0, -2.0, 2.2, 2.6]]);
  if (E) {
    S.ell(S.group(0), M.steel, up([0, 0.1, 12.8]), [3.85, 2.65, 3.8], undefined, { part: S.newPart(), big: true, tex: lamellarTex, cut: { n: [0, 0, -1], d: 2.6 } });
    for (const s of [1, -1]) S.ell(S.group(0), M.steel, up([4.2 * s, 0, 16.2]), [2.0, 1.9, 1.3], undefined, { part: S.newPart(), tex: lamellarTex, cut: { n: [0, 0, -1], d: 0.2 } });
    // красный плащ за спиной
    const gc = S.group(0.4);
    const pc = S.newPart();
    S.box(gc, M.red, up([0, -2.6, 11.4 - c.p.sway * 0.3]), [3.6, 0.5, 5.0], [[1, 0, 0], c.rotU([0, 0.995, -0.1]), c.rotU([0, 0.1, 0.995])], 0.4, { part: pc, big: true });
  } else {
    S.ell(S.group(0), M.leather, up([0, 0.4, 13.2]), [3.75, 2.4, 3.0], undefined, { part: S.newPart(), big: true, cut: { n: [0, -1, 0], d: 0.6 } });
  }
  belt(c, M.leather, M.bronze, 9.2, 3.3, 2.45, 0.65);
  strap(c, M.leather, [-3.4, 2.3, 16.0], [2.8, 2.6, 9.6], 0.55, M.bronze, 3);
  pouch(c, M.leather, [-3.0, 1.2, 8.4], [0.9, 0.7, 0.9]);
  // голова, волосы в хвост, уши
  S.cone(S.group(0), M_SKIN, up([0, 0.2, 15.8]), 1.3, hp(c, [0, -0.2, -2.8]), 1.3, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, M_SKIN, c.head, [3.0, 3.2, 3.7], undefined, { part: ph, big: true });
  S.ell(gH, M_SKIN, hp(c, [0, 1.3, -2.2]), [2.2, 2.0, 1.6], undefined, { part: ph });
  if (!E) {
    S.ell(S.group(0), M_HAIR, hp(c, [0, -0.6, 1.0]), [3.25, 3.3, 3.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.8, -0.6], d: 0.9 } });
    S.cone(S.group(0.3), M_HAIR, hp(c, [0, -3.0, 0.4]), 1.1, hp(c, [0.3, -3.6, -4.6]), 0.7, { part: S.newPart() });
  } else {
    S.ell(S.group(0), M.steel, hp(c, [0, -0.2, 1.0]), [3.4, 3.5, 3.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.6, -0.8], d: 0.7 } });
    S.box(S.group(0), M.red, hp(c, [0, -0.4, 4.2]), [0.6, 3.0, 1.0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.4, { part: S.newPart() });
  }
  for (const s of [1, -1]) S.cone(S.group(0.2), M_SKIN, hp(c, [2.6 * s, -0.2, 0.2]), 0.9, hp(c, [4.8 * s, -0.8, 1.6]), 0.25, { part: S.newPart() });
  const col = { e: hex("#e8b040"), k: hex("#140806"), b: HAIR[1], m: hex("#3a120a"), t: hex("#ece4c8") };
  face(c, { at: [0, 3.0, 0.5], colors: col, down: [["bb.bb", "ke.ek"], -2, -1], side: [["bb", "ke"], -1, -1], sideAt: [1.6, 2.7, 0.5] });
  face(c, { at: [0, 3.0, -2.2], colors: col, down: [["tmt"], -1, 0] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_CL, r: [1.4, 1.2, 1.0] }, 1.1, M_SKIN);
    drawLeg(c, i, { mat: M_CL, r: [1.6, 1.4, 1.2] });
    drawFoot(c, i, E ? M.leather : M_SKIN, 2.7, 1.2, 1.2);
    S.cone(S.group(0), M.leather, lerpV(c.el[i], c.hand[i], 0.4), 1.25, lerpV(c.el[i], c.hand[i], 0.85), 1.2, { part: S.newPart() });
    if (E) S.cone(S.group(0), M.steel, c.knee[i], 1.5, c.ankle[i], 1.3, { part: S.newPart(), tex: lamellarTex });
  }
}

export const hobgoblin: Creature = {
  id: "hobgoblin", ru: "Хобгоблин", eliteRu: "Закалённый",
  scale: [0.95, 1.0],
  widen: [1.2, 1.15],
  death: "back",
  dims: { pelvisZ: 7.8, hipX: 2.0, hipZ: 7.2, shX: 4.5, shZ: 16.4, arm: [4.0, 3.9], leg: [3.4, 3.2], headC: [0, 0.6, 21.2], footX: 2.2 },
  roles: [
    { id: "sword", ru: "мечник", kind: "slash", R: W.sword(7.6, 8.6), L: W.roundShield(3.6), shield: true, reach: 9.6 },
    { id: "halberd", ru: "сотник", kind: "chop2h", R: W.halberd(8.4, 5.0), grip2: 3.2, reach: 11 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/hobgoblin.ts")) {
  const root = rootFromArgv();
  runCreature(hobgoblin, root, BATCH_DIR(root));
}
