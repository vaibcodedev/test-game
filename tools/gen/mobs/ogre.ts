/**
 * Задача 140, партия 1: огр (tools/out/refs/mobs/ogre/ref.png — лысый, грузный, бледно-бежевая кожа, брюхо, клычки, рваные
 * штаны и кушак; ref2/ref3 — огры обоих полов; ref4-armored — усиленный: кожаный доспех, костяные наплечники, меховой
 * ворот, наручи, хохол). Крупный: рост 1,45 / 1,5 героя, кадр 48×48.
 * Роли: лесоруб (огр, двуручный топор), громила (огрица, дубина — зелёная кожа, повязки на груди и бёдрах).
 * Усиленный «Матёрый»: по ref4 — красноватая кожа, хохол, меховой ворот, костяные наплечники с шипами, кожаный
 * нагрудник и наручи, окованное оружие.
 * Запуск: npx tsx tools/gen/mobs/ogre.ts → tools/out/mobs-batch1/ogre.png.
 */
import {
  BATCH_DIR, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, furTex, hex, hp, isMainFile, lerpV, mat, rootFromArgv, runCreature, spotTex,
  type Creature, type Ctx,
} from "./rig";

const SKIN = R("#3a2a1e", "#6e5442", "#a08064", "#c4a486", "#e2c8aa");
const SKIN_F = R("#1e2618", "#3e4a30", "#64724c", "#8a986c", "#b0bc90");
const SKIN_E = R("#3a1410", "#6e2a22", "#a24a3a", "#c86a56", "#e48e78");
const PANTS = R("#1e160e", "#3a2c1c", "#58442c", "#74593c", "#8e7250");
const SASH = R("#2a2418", "#504632", "#7a6c50", "#a09272", "#c2b694");
const BAND = R("#1e140c", "#3c2818", "#5c3e24", "#7a5634", "#966e46");
const FURC = R("#141210", "#2a2622", "#423c34", "#5a5246", "#72685a");
const M_SKIN = mat("кожа огра", SKIN, { base: 1.8, gain: 2.3 });
const M_SKINF = mat("кожа огрицы", SKIN_F, { base: 1.8, gain: 2.3 });
const M_SKINE = mat("кожа матёрого", SKIN_E, { base: 1.8, gain: 2.3 });
const M_PANTS = mat("штаны", PANTS, { base: 1.6, gain: 2.2 });
const M_SASH = mat("кушак", SASH, { base: 1.7, gain: 2.2 });
const M_BAND = mat("повязки", BAND, { base: 1.6, gain: 2.2 });
const M_FURC = mat("меховой ворот", FURC, { base: 1.7, gain: 2.2 });

function build(c: Ctx) {
  const { S, E, up } = c;
  const female = c.role.id === "brute";
  const skin = E ? M_SKINE : female ? M_SKINF : M_SKIN;
  const blot = spotTex(0.05, -0.5, 31);
  // грудь, брюхо, таз
  const gT = S.group(1.0);
  const pt = S.newPart();
  S.ell(gT, skin, up([0, 0, 13.6]), [4.6, 3.0, 3.6], undefined, { part: pt, big: true, tex: blot });
  S.ell(gT, skin, up([0, 1.0, 10.6]), [4.0, 3.2, 3.0], undefined, { part: pt, big: true, tex: blot });
  S.ell(gT, skin, c.pelvisC, [3.6, 2.6, 2.0], undefined, { part: pt });
  if (female && !E) {
    S.ell(S.group(0), M_BAND, up([0, 0.4, 14.0]), [4.75, 3.2, 1.4], undefined, { part: S.newPart(), big: true });
    S.ell(S.group(0.4), M_BAND, c.pelvisC, [3.8, 2.8, 1.5], undefined, { part: S.newPart(), big: true });
  } else {
    const gS = S.group(0.6);
    const ps = S.newPart();
    S.ell(gS, M_PANTS, c.pelvisC, [3.85, 2.85, 2.0], undefined, { part: ps, big: true });
    for (const i of [0, 1]) S.cone(gS, M_PANTS, c.hip[i], 2.2, lerpV(c.hip[i], c.knee[i], 1.15), 1.9, { part: ps });
    S.ell(S.group(0), M_SASH, add(c.pelvisC, [0, 0, 1.6]), [4.0, 3.1, 0.8], undefined, { part: S.newPart() });
    flaps(c, M_SASH, [[1.6, 2.4, 3.0, 0.7]]);
  }
  if (E) {
    // кожаный нагрудник, меховой ворот, костяные наплечники с шипами
    S.ell(S.group(0), M.leather, up([0, 0.5, 13.4]), [4.75, 3.15, 3.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 2.0 } });
    S.ell(S.group(0.5), M_FURC, up([0, -0.2, 16.8]), [4.2, 3.4, 1.6], undefined, { part: S.newPart(), big: true, tex: furTex(33, 0.3) });
    for (const s of [1, -1]) {
      const sh = up([5.2 * s, 0, 16.4]);
      const gb = S.group(0.3);
      const pb = S.newPart();
      S.ell(gb, M.bone, sh, [2.4, 2.2, 1.5], undefined, { part: pb, big: true });
      S.cone(gb, M.bone, add(sh, [0.8 * s, 0, 0.8]), 0.8, add(sh, [2.4 * s, -0.2, 3.2]), 0.25, { part: pb });
      S.cone(gb, M.bone, add(sh, [1.6 * s, 0, 0]), 0.7, add(sh, [3.6 * s, -0.2, 1.0]), 0.25, { part: pb });
    }
  }
  // голова: мелкая на толстой шее, клычки, уши
  S.cone(S.group(0), skin, up([0, 0.4, 16.0]), 2.4, hp(c, [0, 0, -2.2]), 2.2, { part: S.newPart() });
  const gH = S.group(0.8);
  const ph = S.newPart();
  S.ell(gH, skin, c.head, [2.9, 3.0, 3.2], undefined, { part: ph, big: true });
  S.ell(gH, skin, hp(c, [0, 1.0, -2.0]), [2.6, 2.2, 1.7], undefined, { part: ph });
  for (const s of [1, -1]) {
    S.cone(S.group(0.2), skin, hp(c, [2.6 * s, -0.2, 0.2]), 0.8, hp(c, [3.6 * s, -0.6, 1.2]), 0.3, { part: S.newPart() });
    S.cone(S.group(0), M.bone, hp(c, [1.1 * s, 2.7, -2.6]), 0.4, hp(c, [1.3 * s, 3.0, -1.4]), 0.2, { part: S.newPart() });
  }
  if (E) S.cone(S.group(0.3), M_FURC, hp(c, [0, -0.6, 2.8]), 0.9, hp(c, [0, -3.0, 5.2]), 0.6, { part: S.newPart() });
  const col = { e: hex("#d8c8a0"), k: hex("#140c08"), b: SKIN[0], m: hex("#2a140c") };
  face(c, { at: [0, 2.8, 0.4], colors: col, down: [["bb.bb", "ke.ek"], -2, -1], side: [["bb", "ke"], -1, -1], sideAt: [1.6, 2.5, 0.4] });
  face(c, { at: [0, 3.0, -2.2], colors: col, down: [["mmm"], -1, 0] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: skin, r: [2.2, 1.9, 1.7], tex: blot }, 1.9);
    drawLeg(c, i, { mat: skin, r: [2.2, 1.9, 1.7], tex: blot });
    drawFoot(c, i, skin, 2.6, 1.5, 1.15);
    if (E) S.cone(S.group(0), M.leather, lerpV(c.el[i], c.hand[i], 0.2), 2.0, lerpV(c.el[i], c.hand[i], 0.8), 1.9, { part: S.newPart() });
  }
}

export const ogre: Creature = {
  id: "ogre", ru: "Огр", eliteRu: "Матёрый",
  scale: [1.45, 1.5],
  widen: [1.08, 1.05],
  death: "back",
  big: true,
  dims: { pelvisZ: 7.6, hipX: 2.4, hipZ: 6.8, shX: 5.2, shZ: 16.2, arm: [4.0, 3.8], leg: [3.2, 3.0], headC: [0, 1.2, 20.0], footX: 2.8, hunch: 0.05, stride: 1.4 },
  roles: [
    { id: "woodcutter", ru: "лесоруб", kind: "chop2h", R: W.greataxe(9.5), grip2: 3.2, reach: 10.5 },
    { id: "brute", ru: "громила-огрица", kind: "chop2h", R: W.club(8, 0.9, 2.0), grip2: 2.8, reach: 9.5 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/ogre.ts")) {
  const root = rootFromArgv();
  runCreature(ogre, root, BATCH_DIR(root));
}
