/**
 * Задача 140, партия 1: кобольд (tools/out/refs/mobs/kobold/ref.png) — мелкий ящер, рыже-охристая чешуя, светлое брюхо,
 * шипы-гребень на затылке, морда вперёд, хвост, пальцеходящие лапы с когтями, рваная повязка. Рост 0,65 / 0,7.
 * Роли: копатель (кирка), подрывник (горшки с порохом — летят с искрой фитиля, сумка на боку).
 * Усиленный «Чешуйчатый»: медный отлив чешуи, шахтёрская каска с фонарём, кожаный щиток на груди.
 * Запуск: npx tsx tools/gen/mobs/kobold.ts → tools/out/mobs-batch1/kobold.png.
 */
import {
  BATCH_DIR, belt, pouch, necklace, lerpV, M, P, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, glowMat, hex, hp, isMainFile, mat, rootFromArgv, runCreature, spotTex, tail,
  type Creature, type Ctx,
} from "./rig";

const SCALE = R("#2a160a", "#5a3214", "#8c5422", "#b47a34", "#d6a050");
const SCALE_E = R("#2a1208", "#5c2a12", "#924422", "#c06a36", "#e8965a");
const BELLY = R("#3a3020", "#6e6040", "#a08e64", "#c8b88c", "#e6dab4");
const LOIN = R("#1a140c", "#33281a", "#4e3e2a", "#68563a", "#82704e");
const LAMP = R("#6a3a08", "#c87a10", "#ffc030", "#ffe890", "#fffbe0");
const SPARK = R("#6a2004", "#c05008", "#ff9a20", "#ffd870", "#fffbe0");
const M_SC = mat("чешуя", SCALE, { base: 1.8, gain: 2.3 });
const M_SCE = mat("медная чешуя", SCALE_E, { base: 1.9, gain: 2.3 });
const M_BEL = mat("брюхо", BELLY, { base: 1.8, gain: 2.2 });
const M_LOIN = mat("повязка", LOIN, { base: 1.6, gain: 2.2 });
const M_LAMP = glowMat("фонарь", LAMP, 3.0);

function build(c: Ctx) {
  const { S, E, up } = c;
  const sc = E ? M_SCE : M_SC;
  const dots = spotTex(0.12, -0.7, 21);
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, sc, up([0, -0.2, 12.4]), [3.2, 2.5, 3.6], undefined, { part: pt, big: true, tex: dots });
  S.ell(gT, M_BEL, up([0, 1.0, 11.8]), [2.2, 1.7, 3.0], undefined, { part: pt });
  S.ell(gT, sc, c.pelvisC, [2.7, 2.1, 1.8], undefined, { part: pt });
  S.ell(S.group(0), M_LOIN, c.pelvisC, [2.95, 2.35, 0.95], undefined, { part: S.newPart() });
  flaps(c, M_LOIN, [[0, 2.2, 3.0, 1.5]]);
  belt(c, M.leather, M.bronze, 9.4, 3.1, 2.5, 0.55);
  pouch(c, M.leather, [-2.8, 1.2, 8.6], [0.9, 0.7, 0.8]);
  necklace(c, M.bone, 15.8, 2.3, 2.4, 3, true, 0.45);
  if (E) S.box(S.group(0), M.leather, up([0, 2.2, 12.6]), [2.2, 0.5, 2.2], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.4, { part: S.newPart() });
  tail(c, sc, [0, -1.8, 7.8], [[0.3, -2.0, -2.2], [1.0, -1.8, -1.6], [1.6, -1.0, -0.4], [1.4, -0.2, 0.6]], [1.3, 1.1, 0.85, 0.6, 0.35], dots);
  // голова ящера: длинная морда, гребень шипов
  S.cone(S.group(0), sc, up([0, 0, 15.0]), 1.4, hp(c, [0, -0.4, -2.4]), 1.4, { part: S.newPart() });
  const gH = S.group(0.9);
  const ph = S.newPart();
  S.ell(gH, sc, c.head, [3.4, 3.4, 3.2], undefined, { part: ph, big: true, tex: dots });
  S.cone(gH, sc, hp(c, [0, 1.4, -0.8]), 2.3, hp(c, [0, 5.4, -1.4]), 1.2, { part: ph });
  S.ell(gH, M_BEL, hp(c, [0, 2.8, -2.2]), [1.8, 2.4, 0.8], undefined, { part: ph });
  for (const [x, y, z, l] of [[0, -0.6, 3.0, 3.0], [1.8, -1.2, 2.2, 2.8], [-1.8, -1.2, 2.2, 2.8], [1.2, -2.6, 0.8, 2.2], [-1.2, -2.6, 0.8, 2.2]] as [number, number, number, number][]) {
    S.cone(S.group(0.2), M.horn, hp(c, [x, y, z]), 0.75, hp(c, [x * 1.4, y - l * 0.75, z + l * 0.55]), 0.2, { part: S.newPart() });
  }
  if (E) {
    S.ell(S.group(0), M.bronze, hp(c, [0, 0, 1.6]), [3.6, 3.6, 2.8], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: -0.2 } });
    S.ball(S.group(0), M_LAMP, hp(c, [0, 3.3, 2.0]), 1.0, { part: S.newPart() });
  }
  const col = { e: hex("#f0c020"), k: hex("#140a04"), b: SCALE[1] };
  face(c, { at: [0, 2.4, 0.7], colors: col, down: [["ek...ke"], -3, 0], side: [["ke"], -1, 0], sideAt: [2.0, 2.2, 0.7] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: sc, r: [1.25, 1.05, 0.95] }, 1.05);
    drawLeg(c, i, { mat: sc, r: [1.55, 1.25, 1.0] }, { mat: sc, r: [1.0, 0.85] });
    drawFoot(c, i, M.horn, 2.5, 1.0, 1.3);
    S.cone(S.group(0), M.cloth, lerpV(c.el[i], c.hand[i], 0.5), 1.2, lerpV(c.el[i], c.hand[i], 0.85), 1.15, { part: S.newPart() });
  }
}

export const kobold: Creature = {
  id: "kobold", ru: "Кобольд", eliteRu: "Чешуйчатый",
  scale: [0.65, 0.7],
  widen: [1.25, 1.2],
  death: "side",
  dims: { pelvisZ: 8.4, hipX: 1.9, hipZ: 7.8, shX: 3.9, shZ: 15.0, arm: [3.8, 3.8], leg: [3.5, 3.1], headC: [0, 1.4, 19.8], footX: 2.2, hunch: 0.14, digi: [1.4, 2.4] },
  roles: [
    { id: "digger", ru: "копатель", kind: "slash", R: W.pick(6.2), reach: 7.2 },
    { id: "bomber", ru: "подрывник", kind: "throw", R: W.pot(), back: { fn: W.satchel(), at: [3.0, -0.6, 8.6], dir: [0, 0, 1] }, proj: { ramp: P.clay, r: 1.3, spark: SPARK }, reach: 1.5 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/kobold.ts")) {
  const root = rootFromArgv();
  runCreature(kobold, root, BATCH_DIR(root));
}
