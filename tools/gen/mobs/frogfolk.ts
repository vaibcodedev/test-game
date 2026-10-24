/**
 * Задача 140, партия 1: жаболюд (tools/out/refs/mobs/frogfolk/ref.png) — приземистый жабий торс с бледным брюхом,
 * пятнистая оливково-жёлтая кожа, широкая плоская голова с выпуклыми золотыми глазами на макушке, широкий рот, ноги
 * в полуприсяде, перепончатые стопы, набедренная повязка. Рост 0,9 / 0,95.
 * Роли: гарпунщик (гарпун), шаман (тотем-коряга, болотные чары).
 * Усиленный «Раздувшийся»: яркие оранжевые бородавки, броня из раковин на плечах, тотем на спине.
 * Запуск: npx tsx tools/gen/mobs/frogfolk.ts → tools/out/mobs-batch1/frogfolk.png.
 */
import {
  BATCH_DIR, belt, pouch, necklace, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, hex, hp, isMainFile, mat, rootFromArgv, runCreature, spotTex,
  type Creature, type Ctx, type WeaponFn,
} from "./rig";

const SKIN = R("#1a1e0a", "#363e16", "#5a6624", "#86903a", "#b0b45a");
const BELLY = R("#3a3628", "#6c664c", "#a09a78", "#c8c2a0", "#e6e0c4");
const EYEB = R("#3a2a08", "#7a5a10", "#c09020", "#e8c040", "#fff0a0");
const WART = R("#3a1a04", "#7a3608", "#c0600e", "#f09030", "#ffc070");
const LOIN = R("#1e180e", "#3a301e", "#5a4a30", "#766444", "#927e58");
const SHELL = R("#2a2420", "#544a40", "#867a6a", "#b4a894", "#dcd2c0");
const SWAMP = R("#0e2a14", "#1e5428", "#3c8a3e", "#86c860", "#d8f4a8");
const M_SKIN = mat("кожа жабы", SKIN, { base: 1.8, gain: 2.3 });
const M_BEL = mat("брюхо", BELLY, { base: 1.8, gain: 2.2 });
const M_EYEB = mat("глаза", EYEB, { base: 2.2, gain: 2.0 });
const M_WART = mat("бородавки", WART, { base: 2.0, gain: 2.0 });
const M_LOIN = mat("повязка", LOIN, { base: 1.6, gain: 2.2 });
const M_SHELL = mat("раковина", SHELL, { base: 1.9, gain: 2.2 });

function build(c: Ctx) {
  const { S, E, up } = c;
  const spots = spotTex(E ? 0.16 : 0.14, E ? 0.8 : -0.9, 51, E ? M_WART : undefined);
  const gT = S.group(1.0);
  const pt = S.newPart();
  S.ell(gT, M_SKIN, up([0, -0.4, 12.4]), [3.8, 2.8, 3.8], undefined, { part: pt, big: true, tex: spots });
  S.ell(gT, M_BEL, up([0, 1.0, 11.4]), [3.0, 2.4, 3.2], undefined, { part: pt });
  S.ell(gT, M_SKIN, c.pelvisC, [3.0, 2.3, 1.9], undefined, { part: pt, tex: spots });
  S.ell(S.group(0), M_LOIN, c.pelvisC, [3.25, 2.55, 1.0], undefined, { part: S.newPart() });
  flaps(c, M_LOIN, [[0, 2.4, 3.0, 1.8]]);
  belt(c, M.rope, null, 9.0, 3.4, 2.75, 0.5);
  necklace(c, M_SHELL, 15.6, 2.8, 2.6, 5, false, 0.6);
  pouch(c, M.leather, [3.0, 0.8, 8.2], [0.9, 0.7, 0.8]);
  if (E) {
    for (const s of [1, -1]) S.ell(S.group(0), M_SHELL, up([4.0 * s, -0.2, 15.6]), [2.2, 2.0, 1.3], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 0.3 } });
  }
  // голова: широкая, плоская, без шеи; глаза-бугры сверху, рот до ушей
  const gH = S.group(1.1);
  const ph = S.newPart();
  S.ell(gH, M_SKIN, c.head, [4.0, 3.8, 2.8], undefined, { part: ph, big: true, tex: spots });
  S.ell(gH, M_BEL, hp(c, [0, 1.6, -1.4]), [3.4, 2.4, 1.4], undefined, { part: ph });
  for (const s of [1, -1]) S.ball(S.group(0.2), M_SKIN, hp(c, [2.2 * s, 1.4, 2.0]), 1.4, { part: S.newPart() });
  for (const s of [1, -1]) S.ball(S.group(0), M_EYEB, hp(c, [2.3 * s, 2.0, 2.2]), 1.0, { part: S.newPart() });
  const col = { k: hex("#0e0a04"), m: hex("#1e1a0a"), w: hex("#fff0a0") };
  face(c, { at: [0, 2.6, 2.3], colors: col, down: [["k.....k"], -3, 0], side: [["k"], 0, 0], sideAt: [2.4, 2.4, 2.3], depthTol: 5 });
  face(c, { at: [0, 3.6, -0.6], colors: col, down: [["mmmmmmm"], -3, 0], side: [["mm"], -1, 0], sideAt: [1.8, 3.2, -0.6] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_SKIN, r: [1.5, 1.25, 1.05], tex: spots }, 1.2);
    drawLeg(c, i, { mat: M_SKIN, r: [1.9, 1.45, 1.1], tex: spots });
    drawFoot(c, i, M_SKIN, 2.9, 1.15, 1.6);
  }
  void add;
}
/** Тотем на спине у усиленного шамана — тот же посох без чар. */
const totemBack: WeaponFn = (S, g, o) => (o.elite ? W.staff("totem", 6, SWAMP, 2.0)(S, g, { ...o, k: 0 }) : undefined);

export const frogfolk: Creature = {
  id: "frogfolk", ru: "Жаболюд", eliteRu: "Раздувшийся",
  scale: [0.9, 0.95],
  widen: [1.2, 1.15],
  death: "side",
  dims: { pelvisZ: 7.6, hipX: 2.4, hipZ: 7.0, shX: 4.5, shZ: 15.4, arm: [3.6, 3.6], leg: [3.8, 3.6], headC: [0, 1.6, 18.8], footX: 2.8, stride: 1.5 },
  roles: [
    { id: "harpoon", ru: "гарпунщик", kind: "thrust", R: W.harpoon(8.4, 5.6), reach: 11 },
    { id: "shaman", ru: "шаман", kind: "cast", R: W.staff("totem", 10, SWAMP, 5.0), focus: 11.2, fx: SWAMP, back: { fn: totemBack, at: [1.0, -3.0, 12.0], dir: [-0.3, -0.2, 1] } },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/frogfolk.ts")) {
  const root = rootFromArgv();
  runCreature(frogfolk, root, BATCH_DIR(root));
}
