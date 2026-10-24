/**
 * Задача 140, партия 1: волколюд (tools/out/refs/mobs/wolffolk/ref.png) — поджарый, без лишней мускулатуры, серая шерсть,
 * светлая грудь и воротник, волчья голова с острыми ушами, пушистый хвост, пальцеходящие лапы, набедренная повязка.
 * Рост 0,95 / 1,0. Роли: загонщик (кистень), охотник (лук, колчан); вожак — усиленный загонщик.
 * Усиленный «Лютый»: тёмная грива, костяные амулеты, наручи с шипами.
 * Запуск: npx tsx tools/gen/mobs/wolffolk.ts → tools/out/mobs-batch1/wolffolk.png.
 */
import {
  BATCH_DIR, belt, pouch, necklace, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, furTex, hex, hp, isMainFile, lerpV, mat, mul, norm, rootFromArgv, runCreature, sub, tail,
  type Creature, type Ctx,
} from "./rig";

const FUR = R("#1c1c1e", "#3a3a3e", "#5e5e62", "#86868a", "#adaba8");
const PALE = R("#3a3630", "#6a645a", "#9a9286", "#c4bcae", "#e4dccc");
const MANE = R("#0e0e10", "#1c1c20", "#2c2c32", "#3e3e44", "#52525a");
const LOIN = R("#1c1812", "#383024", "#564a38", "#72644c", "#8e8062");
const M_FUR = mat("серая шерсть", FUR, { base: 1.8, gain: 2.3 });
const M_PALE = mat("светлая шерсть", PALE, { base: 1.8, gain: 2.2 });
const M_MANE = mat("тёмная грива", MANE, { base: 1.8, gain: 2.2 });
const M_LOIN = mat("повязка", LOIN, { base: 1.6, gain: 2.2 });

function build(c: Ctx) {
  const { S, E, up } = c;
  const fur = furTex(12, 0.15);
  const gT = S.group(0.8);
  const pt = S.newPart();
  S.ell(gT, M_FUR, up([0, -0.2, 12.8]), [3.5, 2.4, 3.8], undefined, { part: pt, big: true, tex: fur });
  S.ell(gT, M_PALE, up([0, 1.0, 12.6]), [2.4, 1.6, 3.2], undefined, { part: pt, tex: fur });
  S.ell(gT, M_FUR, c.pelvisC, [2.7, 2.0, 1.7], undefined, { part: pt, tex: fur });
  // воротник-грива: у усиленного тёмная и пышнее
  S.ell(S.group(0.5), E ? M_MANE : M_PALE, up([0, 0.0, 16.0]), E ? [3.9, 3.0, 2.0] : [3.3, 2.6, 1.6], undefined, { part: S.newPart(), big: true, tex: furTex(13, 0.25) });
  S.ell(S.group(0), M_LOIN, c.pelvisC, [2.95, 2.25, 1.0], undefined, { part: S.newPart() });
  flaps(c, M_LOIN, [[0.3, 2.1, 3.8, 1.5], [0, -2.0, 2.4, 1.4]]);
  belt(c, M.leather, M.bronze, 9.4, 3.0, 2.3, 0.55);
  pouch(c, M.leather, [-2.7, 1.2, 8.6], [0.9, 0.7, 0.8]);
  necklace(c, M.bone, 16.0, 2.6, 2.4, 3, true, 0.45);
  tail(c, M_FUR, [0, -1.8, 7.8], [[0.3, -1.6, -1.6], [0.8, -1.6, -1.4], [1.0, -1.2, -0.8]], [1.0, 1.4, 1.5, 0.9], furTex(14, 0.2));
  if (E) {
    // костяные амулеты на груди
    for (const [x, z] of [[-1.2, 14.2], [0, 13.6], [1.2, 14.2]] as [number, number][]) S.cone(S.group(0), M.bone, up([x, 2.4, z + 0.6]), 0.5, up([x * 1.1, 2.6, z - 0.6]), 0.35, { part: S.newPart() });
  }
  // голова: морда вперёд, уши торчком
  const gH = S.group(0.9);
  const ph = S.newPart();
  S.ell(gH, M_FUR, c.head, [3.2, 3.2, 3.2], undefined, { part: ph, big: true, tex: fur });
  S.cone(gH, M_FUR, hp(c, [0, 1.6, -0.9]), 2.0, hp(c, [0, 5.4, -1.6]), 1.0, { part: ph, tex: fur });
  S.ell(gH, M_PALE, hp(c, [0, 2.4, -2.2]), [1.8, 2.2, 1.0], undefined, { part: ph });
  S.ball(S.group(0), M_MANE, hp(c, [0, 5.8, -1.3]), 0.7, { part: S.newPart() });
  for (const s of [1, -1]) {
    const ge = S.group(0.3);
    S.cone(ge, E ? M_MANE : M_FUR, hp(c, [1.8 * s, -0.4, 2.2]), 1.2, hp(c, [2.4 * s, -0.8, 5.4]), 0.25, { part: S.newPart() });
  }
  const col = { e: hex("#e8a830"), k: hex("#0e0c0a"), b: FUR[1], m: hex("#140c0a") };
  face(c, { at: [0, 2.7, 0.7], colors: col, down: [["b...b", "ek.ke"], -2, -1], side: [["b", "e"], 0, -1], sideAt: [1.8, 2.5, 0.7] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_FUR, r: [1.3, 1.1, 1.0], tex: fur }, 1.1, M_PALE);
    drawLeg(c, i, { mat: M_FUR, r: [1.6, 1.25, 1.0], tex: fur }, { mat: M_FUR, r: [1.0, 0.85] });
    drawFoot(c, i, M_PALE, 2.5, 1.05, 1.3);
    if (!E) S.cone(S.group(0), M.cloth, lerpV(c.el[i], c.hand[i], 0.5), 1.25, lerpV(c.el[i], c.hand[i], 0.85), 1.2, { part: S.newPart() });
    if (E) {
      // наруч с шипами
      const d = norm(sub(c.hand[i], c.el[i]));
      const a = lerpV(c.el[i], c.hand[i], 0.25), b = lerpV(c.el[i], c.hand[i], 0.8);
      S.cone(S.group(0), M.leather, a, 1.3, b, 1.2, { part: S.newPart() });
      const sd = norm([d[1], -d[0], 0.3]);
      S.cone(S.group(0), M.iron, lerpV(a, b, 0.5), 0.55, add(lerpV(a, b, 0.5), mul(sd, (i ? -1 : 1) * 2.0)), 0.2, { part: S.newPart() });
    }
  }
}

export const wolffolk: Creature = {
  id: "wolffolk", ru: "Волколюд", eliteRu: "Лютый",
  scale: [0.95, 1.0],
  widen: [1.22, 1.15],
  death: "side",
  dims: { pelvisZ: 8.2, hipX: 2.0, hipZ: 7.6, shX: 4.3, shZ: 16.2, arm: [4.0, 3.9], leg: [3.6, 3.2], headC: [0, 1.6, 20.6], footX: 2.2, hunch: 0.1, digi: [1.4, 2.4] },
  roles: [
    { id: "chaser", ru: "загонщик", kind: "slash", R: W.flail(), reach: 6.0 },
    { id: "hunter", ru: "охотник", kind: "bow", L: W.bow(), back: { fn: W.quiver(), at: [1.4, -2.8, 13.0], dir: [0.35, -0.15, 1] } },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/wolffolk.ts")) {
  const root = rootFromArgv();
  runCreature(wolffolk, root, BATCH_DIR(root));
}
