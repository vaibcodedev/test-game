/**
 * Задача 140, партия 1: тролль (tools/out/refs/mobs/troll/ref.png) — долговязый, сутулый, серо-синяя кожа, длинный
 * мясистый нос, косматые седые космы, длинные руки до колен, огромные ступни, рваная набедренная повязка.
 * Чуть выше человека: рост 1,15 / 1,2, кадр 48×48. Роль: громила (бревно-дубина), для 70–80 — та же основа.
 * Усиленный «Древний»: каменные наросты на спине, мох на плечах и темени, костяные браслеты, бледные глаза.
 * Запуск: npx tsx tools/gen/mobs/troll.ts → tools/out/mobs-batch1/troll.png.
 */
import {
  BATCH_DIR, belt, necklace, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, furTex, glowMat, hex, hp, isMainFile, lerpV, mat, rootFromArgv, runCreature, spotTex,
  type Creature, type Ctx,
} from "./rig";

const SKIN = R("#1a2024", "#36424a", "#56666e", "#7a8a90", "#a0aeb0");
const NOSE = R("#2e1e1c", "#5a3c36", "#866058", "#a8807a", "#c8a29a");
const HAIR = R("#1e1e1c", "#3a3a36", "#5a5a54", "#7c7c74", "#9e9e94");
const LOIN = R("#1e140c", "#3c2818", "#5c4026", "#785636", "#926e48");
const MOSS = R("#0e1a08", "#1e3610", "#34561c", "#4e7428", "#6c9438");
const EYE = R("#6a5a2a", "#a8984a", "#e0d690", "#f8f2c8", "#ffffff");
const M_SKIN = mat("кожа тролля", SKIN, { base: 1.8, gain: 2.3 });
const M_NOSE = mat("нос", NOSE, { base: 1.8, gain: 2.2 });
const M_HAIR = mat("космы", HAIR, { base: 1.7, gain: 2.2 });
const M_LOIN = mat("повязка", LOIN, { base: 1.6, gain: 2.2 });
const M_MOSS = mat("мох", MOSS, { base: 1.8, gain: 2.0 });
void glowMat;

function build(c: Ctx) {
  const { S, E, up } = c;
  const blot = spotTex(0.07, -0.6, 41);
  const gT = S.group(0.9);
  const pt = S.newPart();
  S.ell(gT, M_SKIN, up([0, -0.2, 13.4]), [3.9, 2.6, 3.6], undefined, { part: pt, big: true, tex: blot });
  S.ell(gT, M_SKIN, up([0, 0.8, 10.6]), [3.1, 2.4, 2.4], undefined, { part: pt, tex: blot });
  S.ell(gT, M_SKIN, c.pelvisC, [2.8, 2.1, 1.8], undefined, { part: pt });
  S.ell(S.group(0), M_LOIN, c.pelvisC, [3.05, 2.35, 1.1], undefined, { part: S.newPart() });
  flaps(c, M_LOIN, [[0, 2.2, 3.4, 2.0], [0, -2.1, 3.0, 2.2]]);
  belt(c, M.rope, null, 9.6, 3.1, 2.45, 0.5);
  necklace(c, M.bone, 16.4, 2.8, 2.6, 5, true, 0.5);
  if (E) {
    for (const [x, y, z, r] of [[-1.4, -2.4, 15.0, 1.5], [1.2, -2.6, 13.2, 1.3], [-0.6, -2.4, 11.6, 1.1], [1.8, -2.0, 16.0, 1.0]] as [number, number, number, number][]) S.ball(S.group(0), M.stone, up([x, y, z]), r, { part: S.newPart() });
    for (const s of [1, -1]) S.ell(S.group(0.3), M_MOSS, up([3.6 * s, -0.4, 16.6]), [2.0, 1.9, 0.9], undefined, { part: S.newPart(), tex: furTex(42, 0.3) });
  }
  // голова: выдвинута вперёд, длинный нос, космы
  S.cone(S.group(0), M_SKIN, up([0, 0.6, 15.8]), 1.6, hp(c, [0, -0.8, -1.8]), 1.5, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, M_SKIN, c.head, [2.8, 3.0, 3.2], undefined, { part: ph, big: true });
  S.cone(S.group(0.3), M_NOSE, hp(c, [0, 2.4, 0]), 1.1, hp(c, [0, 4.8, -1.8]), 1.0, { part: S.newPart() });
  for (const s of [1, -1]) S.cone(S.group(0.2), M_SKIN, hp(c, [2.5 * s, -0.2, 0.4]), 0.8, hp(c, [3.8 * s, -0.8, 1.4]), 0.3, { part: S.newPart() });
  const gHr = S.group(0.6);
  const phr = S.newPart();
  S.ell(gHr, E ? M_MOSS : M_HAIR, hp(c, [0, -0.8, 1.4]), [3.0, 2.8, 2.4], undefined, { part: phr, big: true, tex: furTex(43, 0.3), cut: { n: [0, 1, 0], d: 1.0 } });
  for (const s of [1, -1]) S.cone(gHr, M_HAIR, hp(c, [1.8 * s, -1.4, 0.8]), 1.0, up([3.4 * s, -2.0, 13.4]), 0.5, { part: phr, tex: furTex(44, 0.3) });
  const ec = E ? "G" : "e";
  const col = { e: hex("#c87a30"), G: EYE[3], k: hex("#100c0a"), b: SKIN[0] };
  face(c, { at: [0, 2.5, 0.7], colors: col, glow: E ? ["G"] : [], halo: EYE[2], down: [["bb.bb", `k${ec}.${ec}k`], -2, -1], side: [["bb", `k${ec}`], -1, -1], sideAt: [1.5, 2.2, 0.7] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_SKIN, r: [1.6, 1.4, 1.35], tex: blot }, 1.8);
    drawLeg(c, i, { mat: M_SKIN, r: [1.7, 1.4, 1.2], tex: blot });
    drawFoot(c, i, M_SKIN, 3.2, 1.3, 1.25);
    if (E) S.cone(S.group(0), M.bone, lerpV(c.el[i], c.hand[i], 0.72), 1.55, lerpV(c.el[i], c.hand[i], 0.86), 1.55, { part: S.newPart() });
  }
  void add;
}

export const troll: Creature = {
  id: "troll", ru: "Тролль", eliteRu: "Древний",
  scale: [1.15, 1.2],
  widen: [1.12, 1.08],
  death: "back",
  big: true,
  dims: { pelvisZ: 8.4, hipX: 2.1, hipZ: 7.8, shX: 4.6, shZ: 16.2, arm: [4.8, 4.6], leg: [3.8, 3.6], headC: [0, 2.6, 19.6], footX: 2.6, hunch: 0.18 },
  roles: [
    { id: "brute", ru: "громила", kind: "chop2h", R: W.log(9.5), grip2: 3.2, reach: 11 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/troll.ts")) {
  const root = rootFromArgv();
  runCreature(troll, root, BATCH_DIR(root));
}
