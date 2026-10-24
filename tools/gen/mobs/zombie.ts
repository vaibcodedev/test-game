/**
 * Задача 140, партия 1: зомби (tools/out/refs/mobs/zombie/ref.png — могильщик в жилете, рубахе и штанах;
 * ref2-sheet.png — тощий серый мертвец в набедренной повязке, светящиеся жёлто-зелёные глаза, — по нему утопленник
 * и свечение глаз усиленного). Ран нет. Рост 0,95 / 1,0, сутулый, голова набок.
 * Роли: могильщик (лопата, двуручный удар), утопленник с якорем (повязка, водоросли, якорь).
 * Усиленный «Неупокоенный»: ржавая шапка-котелок и нагрудник павшего ополченца, вросшие цепи, глаза светятся.
 * Запуск: npx tsx tools/gen/mobs/zombie.ts → tools/out/mobs-batch1/zombie.png.
 */
import {
  BATCH_DIR, belt, strap, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, glowMat, hex, hp, isMainFile, lerpV, mat, rootFromArgv, runCreature, rustTex, spotTex,
  type Creature, type Ctx,
} from "./rig";

const SKIN = R("#262624", "#4a4a46", "#72726a", "#9a9a90", "#c4c2b6");
const SKIN_D = R("#1e2624", "#3a4846", "#5a6e6a", "#7e9690", "#a8bcb4");
const HAIR = R("#140e0a", "#2a1e16", "#423024", "#5a4432", "#705842");
const SHIRT = R("#2a2216", "#504230", "#7a684c", "#a08c6a", "#c0ae8a");
const VEST = R("#1a120c", "#36241a", "#523828", "#6c4c36", "#866248");
const PANTS = R("#1a140e", "#32281c", "#4c3e2c", "#64543c", "#7c6a4e");
const LOIN = R("#121212", "#242422", "#383634", "#4c4a46", "#62605a");
const WEED = R("#0e1a10", "#1c3420", "#2e5232", "#467040", "#648e52");
const EYE = R("#3a4a0a", "#6a8a14", "#a8d030", "#e0f878", "#fbffd8");
const M_SKIN = mat("кожа мертвеца", SKIN, { base: 1.8, gain: 2.3 });
const M_SKIND = mat("кожа утопленника", SKIN_D, { base: 1.8, gain: 2.3 });
const M_HAIR = mat("волосы", HAIR, { base: 1.6, gain: 2.2 });
const M_SHIRT = mat("рубаха", SHIRT, { base: 1.7, gain: 2.2 });
const M_VEST = mat("жилет", VEST, { base: 1.6, gain: 2.3 });
const M_PANTS = mat("штаны", PANTS, { base: 1.6, gain: 2.2 });
const M_LOIN = mat("повязка", LOIN, { base: 1.6, gain: 2.2 });
const M_WEED = mat("водоросли", WEED, { base: 1.7, gain: 2.0 });
const M_EYE = glowMat("глаза", EYE);

function build(c: Ctx) {
  const { S, E, up } = c;
  const drowned = c.role.id === "anchor";
  const skin = drowned ? M_SKIND : M_SKIN;
  const blot = spotTex(0.06, -0.8, 9);
  // торс
  const gT = S.group(0.7);
  const pt = S.newPart();
  if (drowned) {
    S.ell(gT, skin, up([0, 0, 12.6]), [3.4, 2.2, 3.7], undefined, { part: pt, big: true, tex: blot });
    S.ell(gT, skin, c.pelvisC, [2.7, 1.9, 1.7], undefined, { part: pt });
    S.ell(S.group(0), M_LOIN, c.pelvisC, [2.95, 2.15, 1.3], undefined, { part: S.newPart(), big: true });
    flaps(c, M_LOIN, [[-0.6, 2.0, 3.6, 1.5], [1.4, 1.8, 2.6, 0.9], [0, -1.9, 3.4, 2.2]]);
    // водоросли через плечо и на поясе
    S.cone(S.group(0.3), M_WEED, up([-3.0, 1.4, 15.2]), 0.75, up([1.6, 2.0, 9.2]), 0.65, { part: S.newPart() });
    flaps(c, M_WEED, [[2.2, 1.0, 3.8, 0.55], [-2.4, -0.6, 3.0, 0.55]]);
  } else {
    S.ell(gT, M_SHIRT, up([0, 0, 12.4]), [3.5, 2.4, 3.8], undefined, { part: pt, big: true, tex: blot });
    S.ell(gT, M_SHIRT, add(c.pelvisC, [0, 0, 1.2]), [3.2, 2.2, 1.8], undefined, { part: pt });
    // жилет: две полы спереди, спинка
    const gV = S.group(0.4);
    const pv = S.newPart();
    for (const s of [1, -1]) S.box(gV, M_VEST, up([1.9 * s, 1.0, 12.4]), [1.4, 1.5, 3.4], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.9, { part: pv });
    S.box(gV, M_VEST, up([0, -1.0, 12.6]), [3.4, 1.5, 3.4], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.9, { part: pv });
    S.ell(S.group(0.5), M_PANTS, c.pelvisC, [3.0, 2.2, 1.6], undefined, { part: S.newPart(), big: true });
    flaps(c, M_SHIRT, [[-1.4, 2.0, 1.6, 1.0], [1.2, 1.9, 1.0, 0.9]]);
  }
  // верёвка-пояс и швы на одежде/коже
  belt(c, drowned ? M_WEED : M.rope, null, 9.4, 3.2, 2.35, 0.45);
  if (!drowned) strap(c, M.leather, [3.0, 2.2, 15.2], [-2.4, 2.4, 10.0], 0.5, M.iron, 2);
  if (E) {
    // нагрудник павшего ополченца и вросшая цепь
    S.ell(S.group(0), M.rust, up([0, 0.9, 13.0]), [3.4, 2.1, 3.1], undefined, { part: S.newPart(), big: true, tex: rustTex(0.3), cut: { n: [0, -1, 0], d: 0.1 } });
    const ch = S.newPart();
    const gC = S.group(0.2);
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      S.ball(gC, M.iron, up([lerpV([-3.4, 0, 15.6], [3.4, 0, 9.6], t)[0], 2.4 - Math.sin(t * Math.PI) * 0.3, lerpV([-3.4, 0, 15.6], [3.4, 0, 9.6], t)[2]]), 0.55, { part: ch });
    }
  }
  // голова: впалые щёки, волосы (у могильщика), голова набок
  S.cone(S.group(0), skin, up([0, 0.3, 15.6]), 1.2, hp(c, [0, -0.3, -2.6]), 1.2, { part: S.newPart() });
  const gH = S.group(0.8);
  const ph = S.newPart();
  S.ell(gH, skin, c.head, [3.3, 3.5, 4.0], undefined, { part: ph, big: true });
  S.ell(gH, skin, hp(c, [0, 1.4, -2.4]), [2.2, 2.0, 1.6], undefined, { part: ph, tone: -0.3 });
  if (!drowned && !E) S.ell(S.group(0), M_HAIR, hp(c, [0, -0.5, 1.2]), [3.6, 3.7, 3.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.7, -0.7], d: 0.8 } });
  if (drowned && !E) S.ell(S.group(0), M_WEED, hp(c, [0, -0.6, 1.6]), [3.5, 3.6, 2.8], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.8, -0.6], d: 0.9 } });
  if (E) {
    // шапка-котелок: купол и поля
    S.ell(S.group(0), M.rust, hp(c, [0, 0, 1.6]), [3.6, 3.7, 3.0], undefined, { part: S.newPart(), big: true, tex: rustTex(0.4), cut: { n: [0, 0, -1], d: -0.4 } });
    S.ell(S.group(0), M.iron, hp(c, [0, 0, 1.6]), [5.0, 5.0, 0.5], undefined, { part: S.newPart(), big: true, tex: rustTex(0.4) });
  }
  const gl = E ? (c.p.glow > 0.5 ? "G" : c.p.glow > 0.05 ? "g" : "v") : "w";
  const col = { v: hex("#14100c"), w: hex("#c8c6a8"), g: EYE[2], G: EYE[4], d: SKIN[1], m: hex("#1e1410"), t: hex("#d0c8a0") };
  face(c, { at: [0, 3.3, 0.4], colors: col, glow: E ? ["g", "G"] : [], halo: EYE[2], down: [["dd.dd", `v${gl}.${gl}v`], -2, -1], side: [["dd", `v${gl}`], -1, -1], sideAt: [1.8, 3.0, 0.4] });
  face(c, { at: [0, 3.3, -2.6], colors: col, down: [[c.p.jaw ? "mtm" : ".m."], -1, 0], side: [["m"], 0, 0], sideAt: [1.4, 3.0, -2.6] });
  for (const i of [0, 1]) {
    if (drowned) drawArm(c, i, { mat: skin, r: [1.15, 1.0, 0.9] }, 1.05);
    else {
      drawArm(c, i, { mat: M_SHIRT, r: [1.4, 1.25, 1.1] }, 1.0, skin);
    }
    drawLeg(c, i, { mat: drowned ? skin : M_PANTS, r: drowned ? [1.3, 1.05, 0.9] : [1.55, 1.35, 1.25] });
    if (drowned) drawFoot(c, i, skin, 2.4, 0.9);
    else {
      S.cone(S.group(0), M.leather, add(c.ankle[i], [0, 0, 1.6]), 1.3, add(c.ankle[i], [0, 0, -0.2]), 1.2, { part: S.newPart() });
      drawFoot(c, i, M.leather, 2.4, 1.1);
    }
  }
}

export const zombie: Creature = {
  id: "zombie", ru: "Зомби", eliteRu: "Неупокоенный",
  scale: [0.95, 1.0],
  widen: [1.12, 1.1],
  death: "crumble",
  dust: R("#2a2620", "#4e483e", "#7a7262", "#a29a86"),
  dims: { pelvisZ: 7.8, hipX: 2.0, hipZ: 7.2, shX: 4.3, shZ: 16.0, arm: [3.9, 3.8], leg: [3.3, 3.2], headC: [0.7, 1.2, 21.0], footX: 2.2, hunch: 0.14 },
  roles: [
    { id: "digger", ru: "могильщик", kind: "chop2h", R: W.shovel(7.5), grip2: 3.2, reach: 10.6 },
    { id: "anchor", ru: "утопленник", kind: "chop2h", R: W.anchor(8), grip2: 3.0, reach: 8.6 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/zombie.ts")) {
  const root = rootFromArgv();
  runCreature(zombie, root, BATCH_DIR(root));
}
