/**
 * Задача 140, партия 1: гоблин (tools/out/refs/mobs/goblin/ref.png) — тощий, жёлто-зелёный, огромные острые уши
 * в стороны, длинный нос, лысый, рваная майка и бурые шорты, босой. Рост 0,7 героя (усиленный 0,75).
 * Роли: рубака (ржавый тесак), пращник (праща, камень летит), шаман (посох с черепком зверя, зелёные чары).
 * Усиленный «Бывалый»: кольчужный капюшон, железный тесак/лучшее оружие, боевая раскраска.
 * Запуск: npx tsx tools/gen/mobs/goblin.ts → tools/out/mobs-batch1/goblin.png и листы в sheets/.
 */
import {
  BATCH_DIR, belt, strap, necklace, pouch, M, OUT, P, R, W, add, lerpV, drawArm, drawFoot, drawLeg, face, flaps, furTex, hex, hp, isMainFile, mailTex, mat, rootFromArgv, runCreature,
  type Creature, type Ctx,
} from "./rig";

const SKIN = R("#26300e", "#4a5a1c", "#76882e", "#a3b04a", "#cdd47a");
const PINK = R("#3a1e1a", "#6e3a30", "#a35e4c", "#c98068", "#e8a88c");
const VEST = R("#2e2618", "#5a4c34", "#8a7856", "#b3a27c", "#d6c8a2");
const SHORTS = R("#1e1610", "#3a2c20", "#584430", "#735a40", "#8c7252");
const GREEN = R("#1e4a12", "#3c8a22", "#6cc83a", "#b4f07a", "#effde0");
const M_SKIN = mat("кожа гоблина", SKIN, { base: 1.8, gain: 2.3 });
const M_PINK = mat("уши", PINK, { base: 1.8, gain: 2.2 });
const M_VEST = mat("майка", VEST, { base: 1.7, gain: 2.2 });
const M_SHORTS = mat("шорты", SHORTS, { base: 1.6, gain: 2.2 });

function build(c: Ctx) {
  const { S, E, up } = c;
  // туловище: майка поверх тощего тела, шорты
  const gT = S.group(0.6);
  S.ell(gT, M_VEST, up([0, 0.2, 12.2]), [3.3, 2.7, 3.4], undefined, { part: S.newPart(), big: true, tex: furTex(4, 0.1) });
  flaps(c, M_VEST, [[-1.2, 1.7, 1.6, 1.0], [1.0, 1.6, 1.0, 0.9], [0.2, -1.6, 1.3, 1.2]]);
  // ремень с пряжкой, перевязь с подсумком, обмотки
  belt(c, M.leather, M.iron, 9.9, 3.25, 2.65, 0.6);
  strap(c, M.leather, [-3.0, 2.4, 14.6], [2.6, 2.6, 10.0], 0.55);
  pouch(c, M.leather, [-3.0, 1.6, 8.8], [1.0, 0.8, 0.9]);
  const gS = S.group(0.5);
  const ps = S.newPart();
  S.ell(gS, M_SHORTS, c.pelvisC, [3.1, 2.5, 1.9], undefined, { part: ps, big: true });
  for (const i of [0, 1]) S.cone(gS, M_SHORTS, c.hip[i], 1.55, lerpV(c.hip[i], c.knee[i], 0.5), 1.45, { part: ps });
  // шея и голова
  S.cone(S.group(0), M_SKIN, up([0, 0.3, 14.6]), 1.0, hp(c, [0, -0.2, -3.2]), 1.0, { part: S.newPart() });
  const gH = S.group(0.9);
  const ph = S.newPart();
  S.ell(gH, M_SKIN, c.head, [4.9, 4.4, 4.5], undefined, { part: ph, big: true });
  S.ell(gH, M_SKIN, hp(c, [0, 2.0, -2.8]), [3.0, 2.3, 1.7], undefined, { part: ph });
  // нос: длинный, вниз-вперёд
  S.cone(S.group(0.3), M_PINK, hp(c, [0, 3.8, -0.4]), 1.2, hp(c, [0, 6.6, -2.2]), 0.75, { part: S.newPart() });
  // уши: длинные, в стороны и чуть вверх
  for (const s of [1, -1]) {
    const ge = S.group(0.3);
    const pe = S.newPart();
    S.cone(ge, M_SKIN, hp(c, [4.0 * s, -0.3, 0.6]), 1.5, hp(c, [6.8 * s, -0.6, 1.5]), 1.1, { part: pe });
    S.cone(ge, M_PINK, hp(c, [6.8 * s, -0.6, 1.5]), 1.1, hp(c, [9.6 * s, -1.0, 2.9]), 0.4, { part: pe });
  }
  if (E) {
    // кольчужный капюшон: свод головы и шея, лицо открыто
    S.ell(S.group(0), M.iron, hp(c, [0, -0.5, 0.5]), [5.15, 4.5, 4.65], undefined, { part: S.newPart(), big: true, tex: mailTex, cut: { n: [0, 1, 0], d: 1.2 } });
    S.ell(S.group(0), M.iron, up([0, -0.2, 15.2]), [2.8, 2.2, 1.3], undefined, { part: S.newPart(), tex: mailTex });
    S.cone(S.group(0), M.leather, up([0, 2.0, 13.8]), 0.6, up([2.8, 1.6, 9.6]), 0.6, { part: S.newPart() });
  }
  // лицо
  const col = { d: SKIN[1], y: hex("#f0d040"), k: hex("#1a1208"), m: hex("#2a1a10"), t: hex("#eeeacc"), r: hex("#b0281c") };
  face(c, { at: [0, 4.2, 0.9], colors: col, down: [["dd.dd", "yk.ky"], -2, -1], side: [["dd", "ky"], -1, -1], sideAt: [2.0, 3.8, 0.9] });
  face(c, { at: [0, 4.0, -2.5], colors: col, down: [[c.p.jaw ? "mtm" : "mmm"], -1, 0], side: [["mm"], 0, 0], sideAt: [1.8, 3.5, -2.5] });
  if (E) face(c, { at: [0, 4.2, -0.6], colors: col, down: [["r...r", "r...r"], -2, 0], side: [["r"], 0, 0], sideAt: [2.3, 3.6, -0.6] });
  // конечности
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_SKIN, r: [1.3, 1.15, 1.05] }, 1.35);
    drawLeg(c, i, { mat: M_SKIN, r: [1.45, 1.25, 1.1] });
    drawFoot(c, i, M_SKIN, 3.3, 1.25, 1.25);
    S.cone(S.group(0), M.cloth, lerpV(c.el[i], c.hand[i], 0.5), 1.2, lerpV(c.el[i], c.hand[i], 0.85), 1.15, { part: S.newPart() });
  }
}

export const goblin: Creature = {
  id: "goblin", ru: "Гоблин", eliteRu: "Бывалый",
  scale: [0.7, 0.75],
  widen: [1.25, 1.2],
  death: "side",
  dims: { pelvisZ: 8.6, hipX: 1.8, hipZ: 8.0, shX: 3.9, shZ: 14.6, arm: [4.3, 4.3], leg: [4.0, 3.9], headC: [0, 0.9, 20.2], footX: 2.2, hunch: 0.14 },
  roles: [
    { id: "slasher", ru: "рубака", kind: "slash", R: W.cleaver(5.4), reach: 7.0 },
    { id: "slinger", ru: "пращник", kind: "throw", R: W.sling(), reach: 3.6, proj: { ramp: P.stone, r: 1.1 } },
    { id: "shaman", ru: "шаман", kind: "cast", R: W.staff("skull", 10.5, GREEN, 4.8), focus: 11.7, fx: GREEN },
  ],
  build,
};
void OUT;

if (isMainFile("tools/gen/mobs/goblin.ts")) {
  const root = rootFromArgv();
  runCreature(goblin, root, BATCH_DIR(root));
}
