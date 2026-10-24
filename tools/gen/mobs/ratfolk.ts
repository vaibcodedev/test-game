/**
 * Задача 140, партия 1: крысолюд (tools/out/refs/mobs/ratfolk/ref.png) — поджарый, сутулый, серо-бурая шерсть, светлая
 * грудь, острая морда с розовым носом, большие круглые уши, голый розовый хвост, рваные шорты на верёвке, длинные
 * пальцеходящие лапы. Рост 0,85 / 0,9.
 * Роли: резака (два ножа), браконьер (лук, колчан).
 * Усиленный «Матёрый»: тёмный капюшон, кольчужный рукав, зазубренный серп в левой (у резаки), лучший лук.
 * Запуск: npx tsx tools/gen/mobs/ratfolk.ts → tools/out/mobs-batch1/ratfolk.png.
 */
import {
  BATCH_DIR, belt, strap, necklace, pouch, M, R, W, add, drawArm, drawFoot, drawLeg, face, furTex, hex, hp, isMainFile, lerpV, mailTex, mat, rootFromArgv, runCreature, tail,
  type Creature, type Ctx, type WeaponFn,
} from "./rig";

const FUR = R("#1e1812", "#3c3024", "#5e4c3a", "#806a52", "#a08a6e");
const CHEST = R("#3a2e22", "#6a5a46", "#94806a", "#b4a088", "#d0bea4");
const PINK = R("#3a1e1c", "#6e3a36", "#a05a52", "#c47c70", "#e2a294");
const SHORTS = R("#1a1a10", "#34321e", "#504c2e", "#6c663e", "#888052");
const HOOD = R("#100e10", "#221e22", "#363034", "#4a4248", "#5e565c");
const M_FUR = mat("шерсть", FUR, { base: 1.8, gain: 2.3 });
const M_CH = mat("грудь", CHEST, { base: 1.8, gain: 2.2 });
const M_PINK = mat("розовая кожа", PINK, { base: 1.8, gain: 2.2 });
const M_SH = mat("шорты", SHORTS, { base: 1.6, gain: 2.2 });
const M_HOOD = mat("капюшон", HOOD, { base: 1.7, gain: 2.3 });

function build(c: Ctx) {
  const { S, E, up } = c;
  const fur = furTex(7, 0.15);
  const gT = S.group(0.8);
  const pt = S.newPart();
  S.ell(gT, M_FUR, up([0, -0.2, 12.4]), [3.2, 2.5, 3.6], undefined, { part: pt, big: true, tex: fur });
  S.ell(gT, M_CH, up([0, 0.9, 12.2]), [2.3, 1.8, 2.8], undefined, { part: pt });
  const gS = S.group(0.5);
  const ps = S.newPart();
  S.ell(gS, M_SH, c.pelvisC, [3.0, 2.3, 1.9], undefined, { part: ps, big: true });
  for (const i of [0, 1]) S.cone(gS, M_SH, c.hip[i], 1.65, lerpV(c.hip[i], c.knee[i], 0.6), 1.55, { part: ps });
  S.ell(S.group(0), M.rope, add(c.pelvisC, [0, 0.2, 1.3]), [3.05, 2.35, 0.45], undefined, { part: S.newPart() });
  // перевязь с подсумками, связка зубов на шее, обмотки на запястьях
  strap(c, M.leather, [-3.0, 2.2, 15.4], [2.6, 2.4, 9.6], 0.55, M.bronze, 2);
  strap(c, M.leather, [-3.0, -2.4, 15.4], [2.6, -2.2, 9.6], 0.55);
  pouch(c, M.leather, [2.7, 1.2, 8.6], [0.9, 0.7, 0.8]);
  necklace(c, M.bone, 16.0, 2.2, 2.0, 4, true, 0.4);
  tail(c, M_PINK, [0, -2.0, 7.6], [[0.6, -2.0, -2.4], [1.4, -1.6, -1.8], [2.0, -1.0, -0.6], [1.6, -0.2, 0.8]], [0.8, 0.7, 0.6, 0.5, 0.45]);
  // голова: острая морда вперёд-вниз, большие уши
  S.cone(S.group(0), M_FUR, up([0, 0.2, 15.0]), 1.4, hp(c, [0, -0.6, -2.0]), 1.4, { part: S.newPart(), tex: fur });
  const gH = S.group(0.9);
  const ph = S.newPart();
  S.ell(gH, M_FUR, c.head, [3.0, 3.3, 3.0], undefined, { part: ph, big: true, tex: fur });
  S.cone(gH, M_FUR, hp(c, [0, 1.6, -0.6]), 2.2, hp(c, [0, 5.4, -1.6]), 0.9, { part: ph, tex: fur });
  S.ball(S.group(0), M_PINK, hp(c, [0, 6.0, -1.6]), 0.75, { part: S.newPart() });
  for (const s of [1, -1]) {
    const ge = S.group(0.2);
    const pe = S.newPart();
    S.ell(ge, M_PINK, hp(c, [2.6 * s, -0.6, 2.6]), [1.9, 0.6, 1.9], [c.rotU(norm2([1, 0.3 * s, 0])), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])], { part: pe, big: true });
  }
  if (E) {
    S.ell(S.group(0), M_HOOD, hp(c, [0, -0.7, 0.4]), [3.4, 3.5, 3.4], undefined, { part: S.newPart(), big: true, cut: { n: [0, 1, 0], d: 1.0 } });
    S.ell(S.group(0.4), M_HOOD, up([0, -0.6, 15.6]), [3.6, 2.6, 1.4], undefined, { part: S.newPart(), big: true });
  }
  const col = { e: hex("#0e0a08"), g: hex("#c0b0a0"), w: hex("#dcd4c4") };
  face(c, { at: [0, 2.6, 0.6], colors: col, down: [["e...e"], -2, 0], side: [["e"], 0, 0], sideAt: [1.8, 2.4, 0.6] });
  face(c, { at: [0, 5.2, -2.4], colors: col, down: [["w.w"], -1, 0], side: [["w"], 0, 0], sideAt: [0.6, 5.0, -2.4] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_FUR, r: [1.25, 1.05, 0.9], tex: fur }, 1.0, M_PINK);
    drawLeg(c, i, { mat: M_FUR, r: [1.5, 1.2, 1.0], tex: fur }, { mat: M_FUR, r: [0.95, 0.8] });
    drawFoot(c, i, M_PINK, 2.8, 0.95, 1.3);
    S.cone(S.group(0), M.cloth, lerpV(c.el[i], c.hand[i], 0.55), 1.15, lerpV(c.el[i], c.hand[i], 0.85), 1.1, { part: S.newPart() });
  }
  if (E) {
    // кольчужный рукав на правой руке
    S.cone(S.group(0), M.iron, c.sh[0], 1.55, lerpV(c.sh[0], c.el[0], 1.0), 1.35, { part: S.newPart(), tex: mailTex });
  }
}
const norm2 = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** Левая у резаки: обычный — нож, усиленный — зазубренный серп. */
const leftBlade: WeaponFn = (S, g, o) => (o.elite ? W.sickle() : W.knife(3.2))(S, g, o);

export const ratfolk: Creature = {
  id: "ratfolk", ru: "Крысолюд", eliteRu: "Матёрый",
  scale: [0.85, 0.9],
  widen: [1.22, 1.15],
  death: "side",
  dims: { pelvisZ: 8.4, hipX: 2.0, hipZ: 7.8, shX: 3.9, shZ: 15.2, arm: [3.8, 3.8], leg: [3.4, 3.0], headC: [0, 1.6, 19.4], footX: 2.2, hunch: 0.22, digi: [1.4, 2.2] },
  roles: [
    { id: "cutter", ru: "резака", kind: "claw", R: W.knife(3.4), L: leftBlade, reach: 4.4 },
    { id: "poacher", ru: "браконьер", kind: "bow", L: W.bow(), back: { fn: W.quiver(), at: [1.4, -2.8, 12.6], dir: [0.35, -0.15, 1] } },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/ratfolk.ts")) {
  const root = rootFromArgv();
  runCreature(ratfolk, root, BATCH_DIR(root));
}
