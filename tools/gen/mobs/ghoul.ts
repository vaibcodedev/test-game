/**
 * Задача 140, партия 1: вурдалак (tools/out/refs/mobs/ghoul/ref.png) — тощий, сильно сутулый, серо-лиловая кожа,
 * рёбра, длинные руки с когтями, острые уши, редкие волосы, рваные оливковые шорты; крови нет. Рост 0,95 / 1,0.
 * Роли: ловец (когти), трупоед (тесак), прыгун (бросок с места).
 * Усиленный «Матёрый»: длинные когти, наплечники из костей-трофеев, бледные светящиеся глаза.
 * Запуск: npx tsx tools/gen/mobs/ghoul.ts → tools/out/mobs-batch1/ghoul.png.
 */
import {
  BATCH_DIR, belt, pouch, necklace, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, hex, hp, isMainFile, lerpV, mat, mul, norm, rootFromArgv, runCreature, sub,
  type Creature, type Ctx, type TexFn,
} from "./rig";

const SKIN = R("#2a2630", "#504858", "#7a7282", "#a49caa", "#cac4cc");
const SHORTS = R("#16160e", "#2c2c1a", "#46442a", "#5e5c3a", "#78744c");
const HAIR = R("#2a2a2a", "#4a4a4a", "#6a6a68", "#8c8c88", "#acaca8");
const EYE = R("#4a4a5a", "#8a8aa8", "#c8c8e8", "#eeeeff", "#ffffff");
const M_SKIN = mat("кожа вурдалака", SKIN, { base: 1.8, gain: 2.3 });
const M_SH = mat("шорты", SHORTS, { base: 1.6, gain: 2.2 });
const M_HAIR = mat("редкие волосы", HAIR, { base: 1.7, gain: 2.0 });
/** Рёбра под кожей: через ряд темнее на боках груди. */
const ribs: TexFn = (c) => (c.edge ? 0 : Math.abs(c.x - c.ax) >= 1 && (c.y - c.ay + 40) % 2 === 0 && c.y - c.ay > -2 ? -0.7 : 0);

function build(c: Ctx) {
  const { S, E, up } = c;
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, M_SKIN, up([0, 0, 12.8]), [3.2, 2.2, 3.6], undefined, { part: pt, big: true, tex: ribs, anc: up([0, 2.2, 13.4]) });
  S.ell(gT, M_SKIN, c.pelvisC, [2.4, 1.8, 1.8], undefined, { part: pt });
  const gS = S.group(0.5);
  const ps = S.newPart();
  S.ell(gS, M_SH, c.pelvisC, [2.8, 2.1, 1.7], undefined, { part: ps, big: true });
  for (const i of [0, 1]) S.cone(gS, M_SH, c.hip[i], 1.55, lerpV(c.hip[i], c.knee[i], 0.55), 1.5, { part: ps });
  flaps(c, M_SH, [[1.6, 1.4, 2.2, 0.7], [-1.8, -1.2, 2.0, 0.7]]);
  belt(c, M.rope, null, 9.4, 2.95, 2.25, 0.45);
  necklace(c, M.bone, 15.6, 2.2, 2.0, 3, false, 0.55);
  pouch(c, M.leather, [2.6, 1.0, 8.4], [0.8, 0.6, 0.8]);
  if (E) {
    for (const s of [1, -1]) {
      const sh = up([3.8 * s, 0, 16.4]);
      const gb = S.group(0.3);
      const pb = S.newPart();
      S.ell(gb, M.bone, sh, [1.8, 1.7, 1.0], undefined, { part: pb, big: true });
      S.cone(gb, M.bone, add(sh, [0.8 * s, 0.6, 0.4]), 0.6, add(sh, [2.4 * s, 0.4, 2.0]), 0.25, { part: pb });
      S.cone(gb, M.bone, add(sh, [0.6 * s, -0.8, 0.5]), 0.55, add(sh, [1.8 * s, -1.6, 2.2]), 0.25, { part: pb });
    }
  }
  // голова: лысая, вытянутый череп, острые уши
  S.cone(S.group(0), M_SKIN, up([0, 0.4, 15.6]), 1.0, hp(c, [0, -0.6, -2.4]), 1.0, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, M_SKIN, c.head, [3.0, 3.4, 3.4], undefined, { part: ph, big: true });
  S.ell(gH, M_SKIN, hp(c, [0, 1.5, -2.2]), [2.0, 1.9, 1.5], undefined, { part: ph, tone: -0.2 });
  S.ell(S.group(0), M_HAIR, hp(c, [0, -1.6, 1.2]), [2.6, 2.0, 2.4], undefined, { part: S.newPart(), cut: { n: [0, 1, 0], d: 0.2 } });
  for (const s of [1, -1]) S.cone(S.group(0.2), M_SKIN, hp(c, [2.6 * s, -0.4, 0.4]), 0.9, hp(c, [5.0 * s, -1.0, 1.8]), 0.25, { part: S.newPart() });
  const gl = E ? (c.p.glow > 0.4 ? "G" : c.p.glow > 0.05 ? "g" : "v") : "r";
  const col = { v: hex("#0e0a0c"), r: hex("#5a2a2a"), g: EYE[2], G: EYE[4], b: SKIN[0], t: hex("#d8d0b0"), m: hex("#140c0e") };
  face(c, { at: [0, 3.2, 0.5], colors: col, glow: E ? ["g", "G"] : [], halo: EYE[2], down: [["bb.bb", `v${gl}.${gl}v`], -2, -1], side: [["bb", `v${gl}`], -1, -1], sideAt: [1.6, 2.9, 0.5] });
  face(c, { at: [0, 3.0, -2.4], colors: col, down: [[c.p.jaw ? "tmt" : "ttt"], -1, 0], side: [["t"], 0, 0], sideAt: [1.2, 2.8, -2.4] });
  const clawLen = E ? 2.2 : 1.8;
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_SKIN, r: [1.15, 0.95, 0.85] }, 1.15);
    drawLeg(c, i, { mat: M_SKIN, r: [1.2, 1.0, 0.85] });
    drawFoot(c, i, M_SKIN, 2.6, 0.85, 1.15);
    // когти: три от кисти по направлению предплечья, загибом вниз
    const d = norm(sub(c.hand[i], c.el[i]));
    const gc = S.group(0.15);
    const pc = S.newPart();
    for (const k of [-1, 0, 1]) {
      const sd: [number, number, number] = [k * 0.55, 0, 0];
      const a0 = add(add(c.hand[i], mul(d, 0.6)), sd);
      S.cone(gc, M.bone, a0, 0.42, add(add(a0, mul(d, clawLen)), [0, 0.4, -0.6]), 0.18, { part: pc });
    }
  }
}

export const ghoul: Creature = {
  id: "ghoul", ru: "Вурдалак", eliteRu: "Матёрый",
  scale: [0.95, 1.0],
  widen: [1.18, 1.15],
  death: "side",
  dims: { pelvisZ: 8.0, hipX: 2.0, hipZ: 7.4, shX: 4.0, shZ: 15.4, arm: [4.6, 4.4], leg: [3.9, 3.6], headC: [0, 1.6, 19.8], footX: 2.5, hunch: 0.34 },
  roles: [
    { id: "catcher", ru: "ловец", kind: "claw", reach: 2.6 },
    { id: "eater", ru: "трупоед", kind: "slash", R: W.cleaver(4.8), reach: 6.2 },
    { id: "leaper", ru: "прыгун", kind: "leap", reach: 2.6 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/ghoul.ts")) {
  const root = rootFromArgv();
  runCreature(ghoul, root, BATCH_DIR(root));
}
