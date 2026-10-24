/**
 * Задача 140, партия 1: малый имп (tools/out/refs/mobs/imp/ref.png) — красная кожа, загнутые рога, большие острые уши,
 * перепончатые крылья, хвост со стрелкой, когтистые пальцеходящие лапы, рваная повязка; у обычного огня нет.
 * Рост 0,6 / 0,65. Роли: бесёнок (вилы), заклинатель (сгусток тьмы с ладоней), метатель (камни).
 * Усиленный «Огненный» (у рейда — «Искра»): угли в рогах и на кончике хвоста, тлеющая кромка крыльев.
 * Запуск: npx tsx tools/gen/mobs/imp.ts → tools/out/mobs-batch1/imp.png.
 */
import {
  BATCH_DIR, M, P, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, glowMat, hex, hp, isMainFile, mat, mul, norm, rootFromArgv, runCreature, tail,
  sub, type Creature, type Ctx, type Mat, type V3,
} from "./rig";

const SKIN = R("#2a0c0a", "#561a14", "#86302a", "#ae4a3c", "#d0705a");
const WING = R("#100610", "#22101e", "#38182c", "#50243c", "#6a344e");
const WING_E = R("#1a0606", "#3a0e08", "#62200e", "#8c3a14", "#b4561c");
const LOIN = R("#1a1610", "#342e22", "#504632", "#6a5e44", "#847858");
const EMBER = R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0");
const DARK = R("#1a0a2a", "#3c1a5e", "#6a34a0", "#a46ad8", "#e0c4ff");
const M_SKIN = mat("кожа беса", SKIN, { base: 1.8, gain: 2.3 });
const M_WING = mat("перепонка", WING, { base: 1.8, gain: 2.2 });
const M_WINGE = mat("тлеющая перепонка", WING_E, { base: 1.8, gain: 2.2 });
const M_LOIN = mat("повязка", LOIN, { base: 1.6, gain: 2.2 });
const M_EMBER = glowMat("угли", EMBER);
const M_HORN = mat("рога", R("#2a2218", "#544632", "#867050", "#b49c74", "#dccaa0"), { base: 1.9, gain: 2.2 });

/** Перепонка между тремя точками: плоский эллипсоид по треугольнику. */
function membrane(S: Ctx["S"], g: number, m: Mat, a: V3, b: V3, d: V3, part: number) {
  const mid = mul(add(a, b), 0.5);
  const X = norm(sub(b, a));
  const h = sub(d, mid);
  const Zr = sub(h, mul(X, h[0] * X[0] + h[1] * X[1] + h[2] * X[2]));
  const hl = Math.hypot(...Zr) || 1;
  const Z = mul(Zr, 1 / hl);
  const Y: V3 = [X[1] * Z[2] - X[2] * Z[1], X[2] * Z[0] - X[0] * Z[2], X[0] * Z[1] - X[1] * Z[0]];
  const L = Math.hypot(...sub(b, a));
  S.ell(g, m, add(mid, mul(Z, hl * 0.42)), [L * 0.5, 0.45, hl * 0.55], [X, Y, Z], { part, big: true });
}

function build(c: Ctx) {
  const { S, E, up } = c;
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, M_SKIN, up([0, 0, 12.4]), [3.2, 2.5, 3.5], undefined, { part: pt, big: true });
  S.ell(gT, M_SKIN, c.pelvisC, [2.6, 2.0, 1.8], undefined, { part: pt });
  S.ell(S.group(0), M_LOIN, c.pelvisC, [2.85, 2.25, 1.0], undefined, { part: S.newPart() });
  flaps(c, M_LOIN, [[0, 2.1, 3.4, 1.6], [0, -2.0, 2.6, 1.6]]);
  // крылья: костяной «палец»-плечо вверх-наружу, пальцы вниз, между ними тёмная перепонка (контраст с красной кожей)
  for (const s of [1, -1]) {
    const fl = c.p.flap;
    const P = (q: V3): V3 => up([q[0] * s, q[1], q[2]]);
    const r0 = P([1.6, -2.0, 15.0]);
    const el = P([4.4 + 0.4 * fl, -3.0, 19.6 + 0.8 * fl]);
    const tp = P([7.8 + 0.6 * fl, -3.4, 23.0 + 0.6 * fl]);
    const f1 = P([8.8 + 0.4 * fl, -3.4, 15.8 + 0.6 * fl]);
    const f2 = P([6.0 + 0.3 * fl, -3.2, 13.6 + 0.4 * fl]);
    const gw = S.group(0.25);
    const pw = S.newPart();
    S.cone(gw, M.bone, r0, 0.75, el, 0.6, { part: pw });
    S.cone(gw, M.bone, el, 0.6, tp, 0.35, { part: pw });
    S.cone(gw, M.bone, el, 0.5, f1, 0.3, { part: pw });
    S.cone(gw, M.bone, el, 0.45, f2, 0.3, { part: pw });
    S.cone(S.group(0), E ? M_EMBER : M.horn, tp, 0.45, add(tp, mul(norm(sub(tp, el)), 1.2)), 0.15, { part: S.newPart() });
    const pm = S.newPart();
    const gm = S.group(0.3);
    for (const [a, b, d] of [[el, tp, f1], [el, f1, f2], [r0, el, f2]] as [V3, V3, V3][]) membrane(S, gm, E ? M_WINGE : M_WING, a, b, d, pm);
  }
  tail(c, M_SKIN, [0, -1.8, 7.4], [[0.4, -1.8, -1.6], [1.2, -1.6, -0.8], [1.6, -1.0, 0.8], [1.2, -0.4, 1.6]], [0.75, 0.6, 0.5, 0.45, 0.4], undefined, (g, at, dir) => {
    S.cone(g, E ? M_EMBER : M_SKIN, at, 1.1, add(at, mul(dir, 1.6)), 0.25, { part: S.newPart() });
  });
  // голова: большая, острые уши в стороны, загнутые рога
  S.cone(S.group(0), M_SKIN, up([0, 0.2, 15.0]), 1.1, hp(c, [0, -0.2, -2.6]), 1.1, { part: S.newPart() });
  const gH = S.group(0.8);
  const ph = S.newPart();
  S.ell(gH, M_SKIN, c.head, [4.6, 4.2, 4.2], undefined, { part: ph, big: true });
  S.ell(gH, M_SKIN, hp(c, [0, 1.8, -2.3]), [2.6, 2.1, 1.5], undefined, { part: ph });
  S.cone(S.group(0), M_SKIN, hp(c, [0, 3.7, -0.4]), 0.85, hp(c, [0, 4.6, -1.3]), 0.6, { part: S.newPart() });
  for (const s of [1, -1]) {
    const ge = S.group(0.3);
    const pe = S.newPart();
    S.cone(ge, M_SKIN, hp(c, [3.8 * s, -0.4, 0.2]), 1.4, hp(c, [6.6 * s, -0.8, 1.0]), 0.4, { part: pe });
    const gh = S.group(0.3);
    const phn = S.newPart();
    const h0 = hp(c, [1.8 * s, 0.4, 3.0]), h1 = hp(c, [2.8 * s, -0.2, 6.0]), h2 = hp(c, [2.2 * s, -1.8, 7.8]);
    S.cone(gh, M_HORN, h0, 1.15, h1, 0.8, { part: phn });
    S.cone(gh, E ? M_EMBER : M_HORN, h1, 0.8, h2, 0.35, { part: phn });
  }
  const col = { e: hex("#f0c040"), k: hex("#1a0806"), b: SKIN[0], m: hex("#2a0806"), t: hex("#e8e0c8") };
  face(c, { at: [0, 3.6, 0.6], colors: col, down: [["bb.bb", "ek.ke"], -2, -1], side: [["bb", "ke"], -1, -1], sideAt: [2.0, 3.2, 0.6] });
  face(c, { at: [0, 3.4, -2.2], colors: col, down: [[c.p.jaw ? "tmt" : "m.m"], -1, 0] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_SKIN, r: [1.1, 0.95, 0.85] }, 1.05);
    drawLeg(c, i, { mat: M_SKIN, r: [1.35, 1.1, 0.9] }, { mat: M_SKIN, r: [0.9, 0.75] });
    drawFoot(c, i, M.horn, 2.2, 0.75, 1.1);
  }
}

export const imp: Creature = {
  id: "imp", ru: "Имп", eliteRu: "Огненный",
  scale: [0.6, 0.65],
  widen: [1.15, 1.1],
  death: "crumble",
  dust: R("#2a1410", "#4e2a20", "#7a4434", "#a26450"),
  dims: { pelvisZ: 8.4, hipX: 1.8, hipZ: 7.8, shX: 3.8, shZ: 15.0, arm: [4.0, 4.0], leg: [3.5, 3.1], headC: [0, 1.0, 20.4], footX: 2.1, hunch: 0.12, digi: [1.4, 2.4] },
  roles: [
    { id: "fork", ru: "бесёнок", kind: "thrust", R: W.pitchfork(8.5, 0.9), reach: 11.5 },
    { id: "caster", ru: "заклинатель", kind: "handcast", fx: DARK },
    { id: "thrower", ru: "метатель", kind: "throw", R: W.rock(1.3), proj: { ramp: P.stone, r: 1.1 }, reach: 1.5 },
  ],
  build,
};

if (isMainFile("tools/gen/mobs/imp.ts")) {
  const root = rootFromArgv();
  runCreature(imp, root, BATCH_DIR(root));
}
