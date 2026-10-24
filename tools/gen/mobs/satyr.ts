/**
 * Задача 140, партия 1: сатир (tools/out/refs/mobs/satyr/ref.png) — человеческий верх, загорелая кожа, повязка на груди,
 * кудрявые каштановые волосы, бараньи рога, острые уши; козлиные ноги в бурой шерсти с тёмными копытами, красноватая
 * повязка на бёдрах. Рост 0,95 / 1,0. Роли: флейтист (свирель — чары сна, ноты), копейщик (копьё).
 * Усиленный «Дикий»: большие рога, терновый венок, кожаные наручи, роговая свирель.
 * Запуск: npx tsx tools/gen/mobs/satyr.ts → tools/out/mobs-batch1/satyr.png.
 */
import {
  BATCH_DIR, belt, necklace, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, furTex, hex, hp, isMainFile, lerpV, mat, rootFromArgv, runCreature,
  type Creature, type Ctx,
} from "./rig";

const SKIN = R("#4a2a1a", "#844e32", "#b87e58", "#dca47c", "#f4c8a0");
const FUR = R("#140c08", "#2c1c12", "#46301e", "#62462c", "#7e5c3a");
const HAIR = R("#0e0806", "#22140c", "#3a2214", "#52321e", "#6a4428");
const WRAP = R("#3a3226", "#6c6048", "#a49470", "#cec0a0", "#ece2c8");
const LOIN = R("#220e0c", "#46201a", "#6a362c", "#8a4e40", "#a86a58");
const HORN = R("#2e2618", "#5e5038", "#8e7c58", "#bca880", "#e0d0a8");
const LEAF = R("#0e1a0a", "#1e3414", "#30521e", "#4a722c", "#6a9440");
const SONG = R("#2a1a4a", "#4a3a8a", "#8a7ad0", "#c8baf4", "#f4eeff");
const M_SKIN = mat("кожа", SKIN, { base: 1.8, gain: 2.2 });
const M_FUR = mat("козья шерсть", FUR, { base: 1.8, gain: 2.3 });
const M_HAIR = mat("кудри", HAIR, { base: 1.7, gain: 2.3 });
const M_WRAP = mat("повязка", WRAP, { base: 1.7, gain: 2.2 });
const M_LOIN = mat("набедренник", LOIN, { base: 1.7, gain: 2.2 });
const M_HORN = mat("рог", HORN, { base: 1.9, gain: 2.2 });
const M_LEAF = mat("терн", LEAF, { base: 1.7, gain: 2.2 });

function build(c: Ctx) {
  const { S, E, up } = c;
  const gT = S.group(0.8);
  const pt = S.newPart();
  S.ell(gT, M_SKIN, up([0, 0, 12.8]), [3.0, 2.1, 3.7], undefined, { part: pt, big: true });
  S.ell(S.group(0), M_WRAP, up([0, 0.2, 14.0]), [3.2, 2.35, 1.4], undefined, { part: S.newPart(), big: true });
  // козлиный низ: шерсть от пояса
  const gF = S.group(0.6);
  const pf = S.newPart();
  S.ell(gF, M_FUR, c.pelvisC, [3.0, 2.2, 2.0], undefined, { part: pf, big: true, tex: furTex(15, 0.18) });
  S.ell(S.group(0), M_LOIN, add(c.pelvisC, [0, 0, 0.8]), [3.15, 2.35, 0.8], undefined, { part: S.newPart() });
  flaps(c, M_LOIN, [[0.6, 2.2, 4.2, 1.6], [-1.6, 1.9, 2.4, 0.8]]);
  // плетёный пояс из лозы, бусы из жёлудей, браслеты-обручи
  belt(c, M_LEAF, M.bronze, 10.0, 3.0, 2.3, 0.5);
  necklace(c, M.bronze, 16.4, 2.4, 2.1, 5, false, 0.45);
  // голова, кудри, уши, рога
  S.cone(S.group(0), M_SKIN, up([0, 0.2, 15.6]), 1.0, hp(c, [0, -0.2, -2.6]), 1.0, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, M_SKIN, c.head, [3.0, 3.1, 3.5], undefined, { part: ph, big: true });
  const gHair = S.group(0.9);
  const phr = S.newPart();
  S.ell(gHair, M_HAIR, hp(c, [0, -0.7, 0.9]), [3.4, 3.3, 3.2], undefined, { part: phr, big: true, tex: furTex(16, 0.3), cut: { n: [0, 0.75, -0.66], d: 0.9 } });
  S.ell(gHair, M_HAIR, hp(c, [0, -1.8, -2.6]), [3.0, 1.6, 2.8], undefined, { part: phr, tex: furTex(17, 0.3) });
  // длинные кудри по плечам и спине
  for (const s of [1, -1]) S.cone(gHair, M_HAIR, hp(c, [2.4 * s, -0.6, -1.0]), 1.3, up([2.4 * s, -0.8, 14.6]), 1.0, { part: phr, tex: furTex(19, 0.3) });
  S.cone(gHair, M_HAIR, hp(c, [0, -2.4, -1.6]), 1.8, up([0, -2.6, 12.8]), 1.2, { part: phr, tex: furTex(20, 0.3) });
  for (const s of [1, -1]) {
    S.cone(S.group(0.2), M_SKIN, hp(c, [2.8 * s, 0, 0]), 0.8, hp(c, [4.6 * s, -0.6, 0.8]), 0.25, { part: S.newPart() });
    const k = E ? 1.3 : 1;
    const gh = S.group(0.3);
    const phn = S.newPart();
    const h0 = hp(c, [1.6 * s, 0.4, 2.6]);
    const h1 = hp(c, [3.0 * s * k, -1.6 * k, 3.4 + 0.6 * k]);
    const h2 = hp(c, [3.8 * s * k, -1.8 * k, 0.6]);
    const h3 = hp(c, [3.6 * s * k, 0.2, 0.0]);
    S.cone(gh, M_HORN, h0, 0.95, h1, 0.8, { part: phn });
    S.cone(gh, M_HORN, h1, 0.8, h2, 0.6, { part: phn });
    S.cone(gh, M_HORN, h2, 0.6, h3, 0.35, { part: phn });
  }
  if (E) {
    const gw = S.group(0.3);
    const pw = S.newPart();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      S.ball(gw, M_LEAF, hp(c, [Math.cos(a) * 3.1, Math.sin(a) * 3.1 - 0.2, 2.2]), 0.75, { part: pw });
    }
  }
  const col = { e: hex("#3a2010"), w: hex("#e8dcc8"), b: HAIR[1], m: hex("#7a3a2a") };
  face(c, { at: [0, 2.9, 0.6], colors: col, down: [["ew.we"], -2, 0], side: [["e"], 0, 0], sideAt: [1.6, 2.6, 0.6] });
  face(c, { at: [0, 2.9, -1.6], colors: col, down: [["m"], 0, 0] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_SKIN, r: [1.15, 1.0, 0.9] }, 1.0);
    drawLeg(c, i, { mat: M_FUR, r: [1.75, 1.3, 1.0], tex: furTex(18, 0.18) }, { mat: M_FUR, r: [1.0, 0.85] });
    drawFoot(c, i, M.horn, 1.7, 1.2, 1.15);
    S.cone(S.group(0), M.bronze, lerpV(c.sh[i], c.el[i], 0.55), 1.2, lerpV(c.sh[i], c.el[i], 0.7), 1.2, { part: S.newPart() });
    if (E) S.cone(S.group(0), M.leather, lerpV(c.el[i], c.hand[i], 0.35), 1.15, lerpV(c.el[i], c.hand[i], 0.85), 1.1, { part: S.newPart() });
  }
}

export const satyr: Creature = {
  id: "satyr", ru: "Сатир", eliteRu: "Дикий",
  scale: [0.95, 1.0],
  widen: [1.2, 1.15],
  death: "side",
  dims: { pelvisZ: 8.4, hipX: 1.9, hipZ: 7.8, shX: 3.9, shZ: 16.2, arm: [3.9, 3.8], leg: [3.6, 3.3], headC: [0, 0.8, 20.8], footX: 2.0, digi: [1.6, 2.8] },
  roles: [
    { id: "piper", ru: "флейтист", kind: "flute", R: W.panflute(), fx: SONG },
    { id: "spear", ru: "копейщик", kind: "thrust", R: W.spear(8.2, 6.0), reach: 10.6 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/satyr.ts")) {
  const root = rootFromArgv();
  runCreature(satyr, root, BATCH_DIR(root));
}
