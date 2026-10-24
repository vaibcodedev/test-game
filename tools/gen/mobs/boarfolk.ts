/**
 * Задача 140, партия 1: кабанолюд (tools/out/refs/mobs/boarfolk/ref.png) — грузный, бурая шерсть, тёмная щетина-грива
 * по хребту, кабанья голова с пятаком и клыками, торчащие уши, набедренная повязка, ноги с копытами. Рост 0,95 / 1,0.
 * Роли: рубака (топор), щитоносец (топорик и круглый щит), копейщик (копьё).
 * Усиленный «Матёрый … секач»: клыки в железных кольцах, железный шлем, нагрудник, тёмная щетина.
 * Запуск: npx tsx tools/gen/mobs/boarfolk.ts → tools/out/mobs-batch1/boarfolk.png.
 */
import {
  BATCH_DIR, belt, strap, necklace, pouch, lerpV, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, furTex, hex, hp, isMainFile, mat, rootFromArgv, runCreature, rustTex,
  type Creature, type Ctx,
} from "./rig";

const FUR = R("#22140c", "#46281a", "#6e4228", "#94603a", "#b88456");
const BRISTLE = R("#120c0a", "#261a14", "#3c2a20", "#54402e", "#6c5440");
const BRISTLE_E = R("#0c0a0a", "#1a1414", "#2a2220", "#3a302c", "#4c403a");
const SNOUT = R("#2e1614", "#5a2c28", "#86463e", "#a8645a", "#c88878");
const LOIN = R("#1e1a10", "#3e3624", "#62563a", "#857654", "#a39572");
const M_FUR = mat("шерсть", FUR, { base: 1.8, gain: 2.3 });
const M_BR = mat("щетина", BRISTLE, { base: 1.7, gain: 2.2 });
const M_BRE = mat("тёмная щетина", BRISTLE_E, { base: 1.7, gain: 2.2 });
const M_SN = mat("пятак", SNOUT, { base: 1.8, gain: 2.2 });
const M_LOIN = mat("повязка", LOIN, { base: 1.7, gain: 2.2 });

function build(c: Ctx) {
  const { S, E, up } = c;
  const fur = furTex(6, 0.14);
  // бочкообразный торс, брюхо
  const gT = S.group(0.9);
  const pt = S.newPart();
  S.ell(gT, M_FUR, up([0, 0.1, 12.6]), [4.4, 3.2, 4.2], undefined, { part: pt, big: true, tex: fur });
  S.ell(gT, M_FUR, up([0, 1.0, 10.2]), [3.6, 2.9, 2.8], undefined, { part: pt, tex: fur, tone: 0.3 });
  S.ell(gT, M_FUR, c.pelvisC, [3.3, 2.5, 1.8], undefined, { part: pt, tex: fur });
  // щетина по хребту: гребень от затылка до поясницы
  const gB = S.group(0.5);
  const pb = S.newPart();
  for (const [z, r] of [[18.2, 1.5], [16.0, 1.6], [13.6, 1.4], [11.2, 1.0]] as [number, number][]) S.ell(gB, E ? M_BRE : M_BR, up([0, -2.6 + (z - 18) * 0.05, z]), [r * 0.9, 1.0, r * 1.2], undefined, { part: pb, tex: furTex(8, 0.3) });
  if (E) {
    // нагрудник
    S.ell(S.group(0), M.iron, up([0, 0.9, 13.0]), [3.9, 2.7, 3.2], undefined, { part: S.newPart(), big: true, tex: rustTex(0.18), cut: { n: [0, -1, 0], d: 0.2 } });
    S.box(S.group(0), M.leather, up([0, 0.4, 9.6]), [3.6, 2.9, 0.6], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.4, { part: S.newPart() });
  }
  flaps(c, M_LOIN, [[0, 2.3, 4.0, 1.6], [-1.4, 2.0, 3.0, 0.9], [0, -2.2, 3.2, 1.8]]);
  // ремень с бронзовой пряжкой, перевязь через грудь с заклёпками, ожерелье из клыков
  belt(c, M.leather, M.bronze, 8.9, 3.6, 2.75, 0.7);
  strap(c, M.leather, [-3.4, 2.4, 15.8], [2.8, 2.9, 9.4], 0.6, M.iron, 3);
  strap(c, M.leather, [-3.4, -2.6, 15.8], [2.8, -2.6, 9.4], 0.6);
  necklace(c, M.bone, 16.2, 2.6, 2.9, 5, true, 0.45);
  pouch(c, M.leather, [-3.0, 1.4, 8.0]);
  S.ell(S.group(0), M_LOIN, c.pelvisC, [3.45, 2.65, 0.9], undefined, { part: S.newPart() });
  // голова: шея толстая, морда вперёд, пятак, клыки, уши
  const gH = S.group(1.0);
  const ph = S.newPart();
  S.ell(gH, M_FUR, c.head, [3.6, 3.4, 3.4], undefined, { part: ph, big: true, tex: fur });
  S.cone(gH, M_FUR, hp(c, [0, 1.2, -0.8]), 2.6, hp(c, [0, 4.4, -1.6]), 1.9, { part: ph, tex: fur });
  S.cone(gH, M_FUR, up([0, 0.4, 15.6]), 3.0, hp(c, [0, -0.4, -1.4]), 2.8, { part: ph, tex: fur });
  S.ell(S.group(0), M_SN, hp(c, [0, 5.2, -1.7]), [1.6, 0.8, 1.3], undefined, { part: S.newPart() });
  for (const s of [1, -1]) {
    S.cone(S.group(0), M.bone, hp(c, [1.4 * s, 4.4, -2.6]), 0.7, hp(c, [2.4 * s, 5.0, -0.2]), 0.3, { part: S.newPart() });
    if (E) S.cone(S.group(0), M.iron, hp(c, [1.45 * s, 4.55, -2.0]), 0.65, hp(c, [1.55 * s, 4.6, -1.6]), 0.65, { part: S.newPart() });
    const ge = S.group(0.3);
    const pe = S.newPart();
    S.cone(ge, M_FUR, hp(c, [2.4 * s, -0.4, 2.2]), 1.0, hp(c, [3.6 * s, -0.2, 4.2]), 0.35, { part: pe });
  }
  if (E) {
    // железный шлем: колпак на темени, уши поверх
    S.ell(S.group(0), M.iron, hp(c, [0, -0.3, 1.0]), [3.75, 3.5, 3.0], undefined, { part: S.newPart(), big: true, tex: rustTex(0.2), cut: { n: [0, 0, -1], d: -0.6 } });
    S.box(S.group(0), M.iron, hp(c, [0, 1.2, 3.5]), [0.5, 2.8, 0.5], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.3, { part: S.newPart() });
  }
  const col = { e: hex("#2a1408"), a: hex("#c89040"), n: SNOUT[0] };
  face(c, { at: [0, 3.2, 0.4], colors: col, down: [["ea...ae"], -3, 0], side: [["ae"], -1, 0], sideAt: [2.0, 3.0, 0.4] });
  face(c, { at: [0, 5.9, -1.5], colors: col, down: [["n.n"], -1, 0] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_FUR, r: [1.8, 1.5, 1.35], tex: fur }, 1.45, M_FUR);
    drawLeg(c, i, { mat: M_FUR, r: [1.9, 1.5, 1.25], tex: fur });
    drawFoot(c, i, M.horn, 2.1, 1.35, 1.2);
    S.cone(S.group(0), M.leather, lerpV(c.el[i], c.hand[i], 0.45), 1.45, lerpV(c.el[i], c.hand[i], 0.85), 1.4, { part: S.newPart() });
  }
  if (E) for (const i of [0, 1]) S.ell(S.group(0), M.iron, add(c.sh[i], [0, 0, 0.6]), [1.9, 1.9, 1.4], undefined, { part: S.newPart(), cut: { n: [0, 0, -1], d: 0.3 } });
}

export const boarfolk: Creature = {
  id: "boarfolk", ru: "Кабанолюд", eliteRu: "Матёрый",
  scale: [0.95, 1.0],
  widen: [1.25, 1.15],
  death: "back",
  dims: { pelvisZ: 7.6, hipX: 2.2, hipZ: 7.0, shX: 4.9, shZ: 15.6, arm: [3.7, 3.6], leg: [3.3, 3.2], headC: [0, 1.4, 20.0], footX: 2.4, hunch: 0.08 },
  roles: [
    { id: "axe", ru: "рубака", kind: "slash", R: W.axe(7.5, 1.1), reach: 7.5 },
    { id: "shield", ru: "щитоносец", kind: "slash", R: W.axe(5.5, 0.9), L: W.roundShield(3.8), shield: true, reach: 5.8 },
    { id: "spear", ru: "копейщик", kind: "thrust", R: W.spear(8.2, 6.0), reach: 10.6 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/boarfolk.ts")) {
  const root = rootFromArgv();
  runCreature(boarfolk, root, BATCH_DIR(root));
}
