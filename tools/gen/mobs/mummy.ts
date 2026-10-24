/**
 * Задача 140, партия 1: мумия (tools/out/refs/mobs/mummy/ref.png) — стройная фигура, вся в косых бинтах, в щелях между
 * витками — тёмная высохшая плоть, свисающие концы бинтов, лицо закрыто, без украшений. Рост 0,95 / 1,0.
 * Роли: стражница (хопеш и высокий щит), проклятница (жезл с камнем, чары).
 * Усиленный «Древняя»: тёмные бинты, медная маска и наплечники, свечение из-под бинтов (глазные щели).
 * Запуск: npx tsx tools/gen/mobs/mummy.ts → tools/out/mobs-batch1/mummy.png.
 */
import {
  BATCH_DIR, belt, M, R, W, add, bandageTex, drawArm, drawFoot, drawLeg, face, flaps, hex, hp, isMainFile, mat, rootFromArgv, runCreature,
  type Creature, type Ctx,
} from "./rig";

const WRAP = R("#2e2818", "#5e5438", "#8e8260", "#b8ac88", "#ddd2b0");
const WRAP_E = R("#1e1810", "#3e3424", "#605238", "#80704e", "#9c8c66");
const FLESH = R("#14120a", "#2a2616", "#403a22", "#56502e", "#6c643a");
const CURSE = R("#0a3a2a", "#147a54", "#2ec890", "#90f4c8", "#e8fff4");
const M_WRAP = mat("бинты", WRAP, { base: 1.9, gain: 2.2 });
const M_WRAPE = mat("тёмные бинты", WRAP_E, { base: 1.9, gain: 2.2 });
const M_FLESH = mat("плоть", FLESH, { base: 1.6, gain: 1.8 });

function build(c: Ctx) {
  const { S, E, up } = c;
  const w = E ? M_WRAPE : M_WRAP;
  const tex = bandageTex(M_FLESH);
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, w, up([0, 0, 13.0]), [3.1, 2.2, 3.8], undefined, { part: pt, big: true, tex });
  S.ell(gT, w, up([0, 0, 10.0]), [2.4, 1.8, 2.2], undefined, { part: pt, tex });
  S.ell(gT, w, c.pelvisC, [2.8, 2.1, 1.9], undefined, { part: pt, tex });
  // свисающие концы бинтов
  flaps(c, w, [[1.8, 1.2, 3.2, 0.5], [-1.2, -1.6, 3.8, 0.5], [-2.2, 1.0, 2.2, 0.45]]);
  // пояс-кушак с бронзовым скарабеем, амулет на груди
  belt(c, E ? M.bronze : M_WRAPE, M.bronze, 9.6, 2.9, 2.2, 0.55);
  S.ell(S.group(0), M.bronze, up([0, 2.1, 14.4]), [0.9, 0.5, 1.1], undefined, { part: S.newPart() });
  if (E) {
    for (const s of [1, -1]) S.ell(S.group(0), M.bronze, up([3.8 * s, 0, 16.4]), [2.0, 1.9, 1.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 0.3 } });
    S.box(S.group(0), M.bronze, up([0, 1.4, 15.0]), [2.6, 1.0, 0.7], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.4, { part: S.newPart() });
  }
  S.cone(S.group(0), w, up([0, 0.2, 15.6]), 1.1, hp(c, [0, -0.2, -2.6]), 1.1, { part: S.newPart(), tex });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, w, c.head, [2.8, 3.0, 3.5], undefined, { part: ph, big: true, tex });
  S.cone(S.group(0.2), w, hp(c, [-1.4, -2.2, 1.6]), 0.55, hp(c, [-2.0, -3.2, -3.4]), 0.45, { part: S.newPart() });
  if (E) S.ell(S.group(0), M.bronze, hp(c, [0, 1.2, -0.2]), [2.6, 2.1, 2.9], undefined, { part: S.newPart(), big: true, cut: { n: [0, -1, 0], d: -0.6 } });
  const gl = E ? (c.p.glow > 0.4 ? "G" : c.p.glow > 0.05 ? "g" : "v") : "v";
  const col = { v: hex("#120e08"), g: CURSE[2], G: CURSE[3] };
  face(c, { at: [0, 2.9, 0.4], colors: col, glow: E ? ["g", "G"] : [], halo: CURSE[2], down: [[`${gl}${gl}.${gl}${gl}`], -2, 0], side: [[`${gl}${gl}`], -1, 0], sideAt: [1.6, 2.6, 0.4] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: w, r: [1.15, 1.0, 0.9], tex }, 1.0);
    drawLeg(c, i, { mat: w, r: [1.45, 1.2, 1.0], tex });
    drawFoot(c, i, w, 2.5, 1.1, 1.2);
  }
  void add;
}

export const mummy: Creature = {
  id: "mummy", ru: "Мумия", eliteRu: "Древняя",
  scale: [0.95, 1.0],
  widen: [1.2, 1.15],
  death: "crumble",
  dust: R("#2e2818", "#5e5438", "#8e8260", "#b8ac88"),
  dims: { pelvisZ: 8.0, hipX: 1.9, hipZ: 7.4, shX: 4.1, shZ: 16.6, arm: [4.0, 3.9], leg: [3.5, 3.3], headC: [0, 0.6, 21.4], footX: 2.0 },
  roles: [
    { id: "guard", ru: "стражница", kind: "slash", R: W.khopesh(), L: W.towerShield(), shield: true, reach: 7.4 },
    { id: "curser", ru: "проклятница", kind: "cast", R: W.staff("gem", 10.5, CURSE, 5.0), focus: 11.7, fx: CURSE },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/mummy.ts")) {
  const root = rootFromArgv();
  runCreature(mummy, root, BATCH_DIR(root));
}
