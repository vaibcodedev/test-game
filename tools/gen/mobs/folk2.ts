/**
 * Задача 140, партия 2: гуманоиды кольца 40–100 по референсам списка 1 и 3 (tools/out/refs/mobs/<id>/):
 * орк (зелёная кожа, лысый, клыки, рубаха без рукавов, широкие штаны, босой), гнолл (пятнистый гиенолюд, грива,
 * пальцеходящие ноги, тёмные кисти, повязка), ящеролюд (зелёная чешуя, гребень, хвост, повязка), варвар-человек
 * (рубаха, мех через плечо, верёвочный кушак, обмотки; ref2 — дикарка с глефой, ref3 — громила; культист, легионер).
 * Рост гуманоидов 0,95 / 1,0 (элитный не выше героя). Роли — оружием; усиленный — по таблице docs/systems/bosses.md.
 */
import {
  belt, strap, pouch, necklace, M, R, W, add, drawArm, drawFoot, drawLeg, face, flaps, furTex, glowMat, hex, hp, lerpV, lamellarTex, mailTex, mat, mul, norm, spotTex, tail,
  type Creature, type Ctx, type Mat, type TexFn, type WeaponFn,
} from "./rig";

const m5 = (name: string, ...cs: string[]) => mat(name, R(...cs), { base: 1.8, gain: 2.3 });
const FIRE = R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0");
const STORM = R("#1a2a5a", "#2e56a8", "#5a9ae8", "#b0dcff", "#f4fcff");
const BONEG = R("#2a3a0a", "#4a6a14", "#86b02a", "#c4e46a", "#f0ffc0");
const box3 = (c: Ctx): [[number, number, number], [number, number, number], [number, number, number]] => [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])];

/** Рогатый шлем: купол, обод, два рога в стороны и вверх. */
function hornHelm(c: Ctx, m: Mat, horn: Mat, r = 3.5, h = 1.2) {
  const S = c.S;
  S.ell(S.group(0), m, hp(c, [0, -0.2, h]), [r, r + 0.1, 3.0], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.55, -0.85], d: 0.6 } });
  S.ell(S.group(0), M.iron, hp(c, [0, -0.1, h - 0.6]), [r + 0.25, r + 0.3, 0.55], undefined, { part: S.newPart() });
  for (const s of [1, -1]) {
    const g = S.group(0.3);
    const p = S.newPart();
    const a = hp(c, [(r - 0.4) * s, -0.2, h + 0.6]), b = hp(c, [(r + 1.6) * s, -0.4, h + 2.0]), d = hp(c, [(r + 1.8) * s, -0.6, h + 4.2]);
    S.cone(g, horn, a, 0.9, b, 0.65, { part: p });
    S.cone(g, horn, b, 0.65, d, 0.15, { part: p });
  }
}
/** Наплечник: купол над плечом, шипы. */
function pauldron(c: Ctx, s: 1 | -1, m: Mat, spikes = 0, sp: Mat = M.iron, r = 2.2, tex?: TexFn) {
  const S = c.S;
  const at = c.up([(c.d.shX + 0.1) * s, 0.1, c.d.shZ + 0.2]);
  S.ell(S.group(0), m, at, [r, r * 0.95, r * 0.7], undefined, { part: S.newPart(), big: true, tex, cut: { n: [0, 0, -1], d: r * 0.25 } });
  for (let k = 0; k < spikes; k++) {
    const a = add(at, c.rotU([(0.4 + k * 0.6) * s, (k - (spikes - 1) / 2) * 0.9, r * 0.5]));
    S.cone(S.group(0), sp, a, 0.45, add(a, c.rotU([0.8 * s, 0, 1.6])), 0.1, { part: S.newPart() });
  }
}

// =============================== ОРК ===============================
const ORC = m5("кожа орка", "#1a2410", "#36481e", "#58702e", "#7c9444", "#a2b664");
const ORC_E = m5("кожа свирепого орка", "#141c0c", "#2a3a16", "#465c24", "#647c36", "#86a050");
const TUNIC = m5("рубаха орка", "#2a1e18", "#4e3a30", "#76584a", "#9a7a66", "#bc9c86");
const OPANTS = m5("штаны орка", "#1a120c", "#36261a", "#523c2a", "#6e523a", "#8a6a4c");
const BLACK = m5("чернёное железо", "#0c0c0e", "#1c1c20", "#303036", "#4c4c54", "#787882");
const PAINT = hex("#a82a1c");
function orcBuild(c: Ctx) {
  const { S, E, up } = c;
  const skin = E ? ORC_E : ORC;
  const blot = spotTex(0.05, -0.6, 91);
  const gT = S.group(0.9);
  const pt = S.newPart();
  S.ell(gT, TUNIC, up([0, 0, 13.0]), [4.0, 2.7, 4.0], undefined, { part: pt, big: true, tex: spotTex(0.06, -0.7, 92) });
  S.ell(gT, TUNIC, add(c.pelvisC, [0, 0, 1.4]), [3.5, 2.5, 2.0], undefined, { part: pt });
  // ворот-вырез
  S.ell(S.group(0), skin, up([0, 1.9, 15.4]), [1.2, 0.7, 1.4], undefined, { part: S.newPart() });
  S.ell(S.group(0.5), OPANTS, c.pelvisC, [3.4, 2.5, 1.8], undefined, { part: S.newPart(), big: true });
  belt(c, M.leather, E ? M.iron : M.bronze, 9.4, 3.6, 2.65, 0.7);
  flaps(c, TUNIC, [[-1.8, 2.3, 1.4, 1.4], [1.8, 2.3, 1.2, 1.4]]);
  pouch(c, M.leather, [3.2, 1.0, 8.8], [0.9, 0.7, 0.9]);
  if (c.role.id === "bow") strap(c, M.leather, [-3.6, 2.4, 16.0], [3.0, 2.6, 9.8], 0.55, M.bronze, 2);
  if (E) {
    S.ell(S.group(0), M.leather, up([0, 0.5, 13.0]), [4.2, 2.95, 3.4], undefined, { part: S.newPart(), big: true, cut: { n: [0, -1, 0], d: 0.4 } });
    for (const s of [1, -1] as (1 | -1)[]) pauldron(c, s, BLACK, 2, M.steel, 2.6);
    strap(c, M.leather, [-3.4, 2.7, 16.0], [3.2, 2.9, 9.8], 0.6, M.iron, 3);
  }
  // голова: массивная челюсть, клыки, острые уши
  S.cone(S.group(0), skin, up([0, 0.3, 15.6]), 2.0, hp(c, [0, 0, -2.4]), 1.9, { part: S.newPart() });
  const gH = S.group(0.8);
  const ph = S.newPart();
  S.ell(gH, skin, c.head, [3.2, 3.2, 3.6], undefined, { part: ph, big: true, tex: blot });
  S.ell(gH, skin, hp(c, [0, 1.2, -2.0]), [2.9, 2.3, 1.8], undefined, { part: ph });
  S.ell(S.group(0), skin, hp(c, [0, 2.4, 0.9]), [2.4, 0.9, 0.6], undefined, { part: S.newPart(), tone: -0.4 });
  for (const s of [1, -1]) {
    S.cone(S.group(0.2), skin, hp(c, [2.8 * s, -0.4, 0.4]), 0.9, hp(c, [4.6 * s, -1.2, 1.6]), 0.2, { part: S.newPart() });
    S.cone(S.group(0), M.bone, hp(c, [1.2 * s, 2.9, -2.4]), 0.45, hp(c, [1.4 * s, 3.2, -0.9]), 0.15, { part: S.newPart() });
  }
  if (E) hornHelm(c, BLACK, M.bone, 3.45, 1.4);
  const col = { e: hex("#e8b030"), k: hex("#0e0a06"), b: E ? PAINT : skin.ramp[0], m: hex("#1a1008"), p: PAINT };
  face(c, { at: [0, 3.2, 0.4], colors: col, down: [[E ? "pb.bp" : "bb.bb", "ke.ek"], -2, -1], side: [["bb", "ke"], -1, -1], sideAt: [1.7, 2.9, 0.4] });
  face(c, { at: [0, 3.1, -2.4], colors: col, down: [["mmm"], -1, 0] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: skin, r: [1.9, 1.6, 1.4], tex: blot }, 1.5);
    S.cone(S.group(0), M.leather, lerpV(c.el[i], c.hand[i], 0.45), 1.55, lerpV(c.el[i], c.hand[i], 0.85), 1.5, { part: S.newPart() });
    drawLeg(c, i, { mat: OPANTS, r: [1.9, 1.7, 1.6] });
    S.cone(S.group(0), OPANTS, add(c.ankle[i], [0, 0, 1.2]), 1.75, add(c.ankle[i], [0, 0, 0.3]), 1.7, { part: S.newPart(), tone: -0.5 });
    drawFoot(c, i, skin, 2.8, 1.3, 1.2);
  }
}
const orcAxe = (): WeaponFn => (S, g, o) => (o.elite ? W.greataxe(8.5) : W.axe(7.2, 1.15))(S, g, o);
export const orc: Creature = {
  id: "orc", ru: "Орк", eliteRu: "Свирепый",
  scale: [0.95, 1.0], widen: [1.22, 1.15], death: "back",
  dims: { pelvisZ: 7.8, hipX: 2.1, hipZ: 7.2, shX: 4.7, shZ: 16.2, arm: [4.0, 3.8], leg: [3.4, 3.2], headC: [0, 0.8, 20.8], footX: 2.3, hunch: 0.06 },
  roles: [
    { id: "axe", ru: "рубака", kind: "slash", R: orcAxe(), reach: 9 },
    { id: "shield", ru: "щитоносец", kind: "slash", R: W.axe(6.6), L: W.roundShield(3.8), shield: true, reach: 8 },
    { id: "bow", ru: "лучник", kind: "bow", L: W.bow(), back: { fn: W.quiver(), at: [1.6, -2.6, 13.0], dir: [-0.35, -0.1, 1] } },
    { id: "thunder", ru: "громовержец", kind: "cast", R: W.staff("totem", 10, STORM), focus: 11.6, fx: STORM },
  ],
  build: orcBuild,
};

// =============================== ГНОЛЛ ===============================
const GNOLL = m5("шерсть гнолла", "#2a1c0e", "#56391c", "#86612e", "#ae8648", "#d2ae74");
const GNOLL_E = m5("шерсть матёрого гнолла", "#22160a", "#462e16", "#6c4c24", "#946c3a", "#b8925a");
const GDARK = m5("тёмные лапы", "#100c0a", "#221a16", "#382c24", "#4e4034", "#665446");
const MANE = m5("грива", "#140a06", "#2c160c", "#482614", "#663820", "#844c2c");
const GLOIN = m5("повязка гнолла", "#1e140e", "#3a2a1e", "#58422e", "#745a40", "#907454");
function gnollBuild(c: Ctx) {
  const { S, E, up } = c;
  const fur = E ? GNOLL_E : GNOLL;
  const spots = spotTex(0.13, 0, 95, GDARK);
  const gT = S.group(0.8);
  const pt = S.newPart();
  S.ell(gT, fur, up([0, 0, 13.2]), [3.5, 2.4, 3.8], undefined, { part: pt, big: true, tex: spots });
  S.ell(gT, fur, c.pelvisC, [2.8, 2.1, 1.8], undefined, { part: pt, tex: spots });
  S.ell(S.group(0), GLOIN, c.pelvisC, [3.05, 2.35, 1.1], undefined, { part: S.newPart() });
  flaps(c, GLOIN, [[0.4, 2.2, 3.6, 2.0], [0, -2.1, 2.8, 2.2]]);
  belt(c, M.rope, null, 9.2, 3.0, 2.3, 0.5);
  if (E) {
    // кожано-костяная броня, ожерелье из костей
    S.ell(S.group(0), M.leather, up([0, 0.4, 13.0]), [3.75, 2.6, 3.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, -1, 0], d: 0.4 } });
    for (const s of [1, -1] as (1 | -1)[]) pauldron(c, s, M.bone, 2, M.bone, 2.0);
    necklace(c, M.bone, 16.2, 2.6, 2.5, 5, true, 0.5);
  } else strap(c, M.leather, [-3.0, 2.3, 15.8], [2.6, 2.4, 9.6], 0.5, M.bone, 2);
  // грива по загривку
  const gm = S.group(0.4);
  const pm = S.newPart();
  for (let k = 0; k < 5; k++) S.cone(gm, MANE, up([0, -1.6 + k * 0.1, 16.8 - k * 1.2]), 1.1, up([0, -3.0 - (E ? 1.0 : 0), 18.6 - k * 1.3 + (E ? 0.6 : 0)]), 0.3, { part: pm });
  // голова гиены: широкий череп, тёмная морда, круглые уши
  S.cone(S.group(0), fur, up([0, 0.8, 15.8]), 1.6, hp(c, [0, -0.4, -2.0]), 1.5, { part: S.newPart(), tex: spots });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, fur, c.head, [2.8, 2.8, 2.8], undefined, { part: ph, big: true });
  S.cone(gH, fur, hp(c, [0, 1.8, -0.8]), 1.6, hp(c, [0, 4.0, -1.4]), 1.1, { part: ph });
  S.cone(S.group(0), GDARK, hp(c, [0, 3.6, -1.3]), 1.1, hp(c, [0, 4.6, -1.5]), 0.9, { part: S.newPart() });
  S.ball(S.group(0), M.horn, hp(c, [0, 4.9, -1.2]), 0.55, { part: S.newPart() });
  if (c.p.jaw) S.cone(S.group(0), GDARK, hp(c, [0, 1.6, -1.6]), 0.9, hp(c, [0, 3.8, -2.6]), 0.6, { part: S.newPart() });
  for (const s of [1, -1]) S.ell(S.group(0.2), fur, hp(c, [2.2 * s, -0.6, 2.6]), [1.2, 0.45, 1.5], undefined, { part: S.newPart() });
  for (const s of [1, -1]) S.ell(S.group(0), GDARK, hp(c, [2.25 * s, -0.4, 2.6]), [0.7, 0.3, 0.9], undefined, { part: S.newPart() });
  face(c, { at: [0, 2.6, 0.9], colors: { e: hex("#f0a030"), k: hex("#0c0806") }, down: [["ke.ek"], -2, 0], side: [["e"], 0, 0], sideAt: [1.6, 2.2, 0.7] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: fur, r: [1.3, 1.1, 0.95], tex: spots }, 1.15, GDARK);
    S.cone(S.group(0), GDARK, lerpV(c.el[i], c.hand[i], 0.5), 1.05, c.hand[i], 1.0, { part: S.newPart() });
    drawLeg(c, i, { mat: fur, r: [1.6, 1.25, 0.95], tex: spots }, { mat: GDARK, r: [0.95, 0.8] });
    drawFoot(c, i, GDARK, 2.6, 0.9, 1.15);
    if (E) S.cone(S.group(0), M.leather, lerpV(c.el[i], c.hand[i], 0.2), 1.3, lerpV(c.el[i], c.hand[i], 0.55), 1.25, { part: S.newPart() });
  }
  tail(c, fur, [0, -2.0, 7.8], [[0.2, -1.2, -1.6], [0.6, -1.0, -1.4]], [0.9, 0.9, 0.5], furTex(96, 0.3));
}
export const gnoll: Creature = {
  id: "gnoll", ru: "Гнолл", eliteRu: "Матёрый",
  scale: [0.95, 1.0], widen: [1.15, 1.1], death: "back",
  dims: { pelvisZ: 8.2, hipX: 2.0, hipZ: 7.6, shX: 4.4, shZ: 16.4, arm: [4.2, 4.0], leg: [3.6, 3.2], headC: [0, 1.6, 20.8], footX: 2.2, hunch: 0.1, digi: [1.4, 2.4] },
  roles: [
    { id: "chaser", ru: "загонщик", kind: "slash", R: W.flail(), reach: 6.5 },
    { id: "archer", ru: "лучник", kind: "bow", L: W.bow(), back: { fn: W.quiver(), at: [1.6, -2.4, 13.0], dir: [-0.35, -0.1, 1] } },
  ],
  build: gnollBuild,
};

// =============================== ЯЩЕРОЛЮД ===============================
const LIZ = m5("чешуя ящеролюда", "#141a0c", "#2c3818", "#4a5a26", "#6a7c38", "#909e52");
const LIZ_E = m5("чешуя древнего ящеролюда", "#0e140c", "#1e2c18", "#324626", "#4a6238", "#668250");
const LIZ_SAL = m5("чешуя саламандры", "#2a0c06", "#561a0c", "#862e14", "#b44a20", "#d87038");
const BELLY = m5("брюхо", "#2a2416", "#524830", "#7e724c", "#a89a6c", "#cec092");
const LLOIN = m5("повязка ящеролюда", "#1e1a12", "#3a3424", "#585036", "#746a4a", "#908660");
const OBS = mat("обсидиан", R("#08060c", "#16121e", "#2a2236", "#463a58", "#7a6a96"), { base: 2.2, gain: 2.0 });
const SHELL = m5("панцирь", "#1a1a0c", "#363818", "#565a26", "#7a7c3a", "#a0a056");
const javelin = (): WeaponFn => (S, g, o) => {
  if (o.k < 0) return;
  W.spear(4.5, 3.2, 0.5)(S, g, o);
};
const obsSpear = (): WeaponFn => (S, g, o) => {
  W.spear(7.4, 6.0)(S, g, o);
  const w = norm(g.dir);
  S.cone(S.group(0), OBS, add(g.at, mul(w, 7.4)), 1.0, add(g.at, mul(w, 10.4)), 0.15, { piece: o.piece, part: S.newPart() });
};
function lizBuild(c: Ctx) {
  const { S, E, up } = c;
  const sal = c.role.id === "salamander";
  const sk = sal ? LIZ_SAL : E ? LIZ_E : LIZ;
  const sc = spotTex(0.12, -0.5, 97);
  const gT = S.group(0.8);
  const pt = S.newPart();
  S.ell(gT, sk, up([0, 0, 13.2]), [3.3, 2.3, 3.9], undefined, { part: pt, big: true, tex: sc });
  S.ell(S.group(0), BELLY, up([0, 1.2, 12.6]), [2.4, 1.3, 3.4], undefined, { part: S.newPart(), tex: lamellarTex });
  S.ell(gT, sk, c.pelvisC, [2.7, 2.0, 1.8], undefined, { part: pt });
  S.ell(S.group(0), LLOIN, c.pelvisC, [2.95, 2.25, 1.1], undefined, { part: S.newPart() });
  flaps(c, LLOIN, [[0.8, 2.1, 3.8, 1.6], [-1.4, 1.9, 2.6, 0.9]]);
  belt(c, M.rope, null, 9.2, 2.9, 2.2, 0.5);
  if (c.role.id === "javelin") strap(c, M.leather, [-3.0, 2.2, 15.6], [2.6, 2.4, 9.4], 0.5, M.bone, 2);
  if (E) {
    // щит из панциря на спине, обсидиановые накладки
    S.ell(S.group(0.3), SHELL, up([0, -2.8, 12.8]), [3.0, 1.2, 3.6], undefined, { part: S.newPart(), big: true, tex: lamellarTex });
    for (const s of [1, -1] as (1 | -1)[]) pauldron(c, s, SHELL, 0, M.bone, 1.8);
  }
  // спинной гребень, хвост
  for (let k = 0; k < 5; k++) S.cone(S.group(0), M.horn, up([0, -2.2, 16.6 - k * 1.6]), 0.45, up([0, -3.2, 17.2 - k * 1.6]), 0.12, { part: S.newPart() });
  tail(c, sk, [0, -1.8, 7.8], [[0.2, -2.0, -2.0], [0.8, -2.0, -1.6], [1.4, -1.6, -0.6], [1.6, -1.0, 0.4]], [1.5, 1.25, 1.0, 0.75, 0.5], sc);
  // голова: вытянутая морда, гребень-корона
  S.cone(S.group(0), sk, up([0, 0.6, 15.8]), 1.4, hp(c, [0, -0.6, -1.8]), 1.3, { part: S.newPart(), tex: sc });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, sk, c.head, [2.3, 2.6, 2.3], undefined, { part: ph, big: true, tex: sc });
  S.cone(gH, sk, hp(c, [0, 1.6, -0.5]), 1.6, hp(c, [0, 4.6, -1.1]), 0.9, { part: ph, tex: sc });
  if (c.p.jaw) S.cone(S.group(0), BELLY, hp(c, [0, 1.4, -1.5]), 0.9, hp(c, [0, 3.8, -2.4]), 0.55, { part: S.newPart() });
  const crest = E ? 1.6 : 1.0;
  for (let k = 0; k < 4; k++) S.cone(S.group(0), sal ? M.horn : E ? OBS : M.horn, hp(c, [0, 0.8 - k * 1.0, 1.8 - k * 0.2]), 0.45, hp(c, [0, 0.2 - k * 1.2, 1.8 + 1.4 * crest - k * 0.3]), 0.1, { part: S.newPart() });
  face(c, { at: [0, 1.8, 0.8], colors: { e: hex("#e8b020"), k: hex("#0c0806") }, down: [["e...e"], -2, 0], side: [["e"], 0, 0], sideAt: [1.7, 1.4, 0.8] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: sk, r: [1.2, 1.0, 0.85], tex: sc }, 0.95);
    drawLeg(c, i, { mat: sk, r: [1.5, 1.15, 0.9], tex: sc }, { mat: sk, r: [0.9, 0.75] });
    drawFoot(c, i, sk, 2.6, 0.8, 1.2);
    S.cone(S.group(0), M.horn, add(c.ankle[i], [0, 2.4, -0.6]), 0.3, add(c.ankle[i], [0, 3.2, -0.9]), 0.12, { part: S.newPart() });
  }
}
export const lizardfolk: Creature = {
  id: "lizardfolk", ru: "Ящеролюд", eliteRu: "Древний",
  scale: [0.95, 1.0], widen: [1.15, 1.1], death: "back",
  dims: { pelvisZ: 8.4, hipX: 1.9, hipZ: 7.8, shX: 4.2, shZ: 16.4, arm: [4.2, 4.0], leg: [3.7, 3.3], headC: [0, 1.4, 21.0], footX: 2.1, hunch: 0.1, digi: [1.4, 2.4] },
  roles: [
    { id: "spear", ru: "копейщик", kind: "thrust", R: W.spear(8.2, 6.0), reach: 10.6 },
    { id: "javelin", ru: "метатель дротиков", kind: "throw", R: javelin(), proj: { ramp: M.bowwood.ramp, r: 0.9 }, reach: 4 },
    { id: "shaman", ru: "шаман", kind: "cast", R: W.staff("skull", 10, BONEG), focus: 11.6, fx: BONEG },
    { id: "salamander", ru: "саламандра", kind: "thrust", R: obsSpear(), reach: 10.6, fx: FIRE },
  ],
  build: lizBuild,
};

// =============================== ВАРВАР (человек) ===============================
const HSKIN = m5("кожа человека", "#3a1e12", "#6e4028", "#a06a48", "#c48c66", "#e2b08a");
const HAIR = m5("тёмные волосы", "#0e0a08", "#1e1612", "#30241c", "#443428", "#5a4636");
const LINEN = m5("рубаха варвара", "#24201a", "#46403a", "#6a6256", "#8c8474", "#ada596");
const FUR = m5("мех", "#1e160e", "#3e2e1e", "#62503a", "#8a7658", "#b4a080");
const WRAP = m5("обмотки", "#1a120c", "#36261a", "#523c2a", "#6c5038", "#86684c");
const ROBE = m5("ряса культиста", "#2a0e0c", "#4a1612", "#6e221a", "#942e22", "#b8442e");
const ROBE_E = m5("чёрная ряса", "#1c1414", "#30221e", "#48322c", "#62443a", "#7e5a4c");
const GOLD = mat("позолота", R("#2a1c06", "#5e4010", "#9a7020", "#d4a838", "#f8e08a"), { base: 2.0, gain: 2.2 });
const TABARD = m5("сюрко Сольгарда", "#2a2620", "#565044", "#8a8270", "#bab2a0", "#e6e0d0");
const MASK = hex("#b02a1c");
const crossbowNone = null;
void crossbowNone;
function barbBuild(c: Ctx) {
  const { S, E, up } = c;
  const role = c.role.id;
  const pyro = role === "pyro", legion = role === "legion", huntress = role === "glaive";
  const gT = S.group(0.8);
  const pt = S.newPart();
  const body = pyro ? (E ? ROBE_E : ROBE) : legion ? TABARD : LINEN;
  S.ell(gT, body, up([0, 0, 13.0]), [huntress ? 3.3 : 3.7, 2.4, 3.9], undefined, { part: pt, big: true, tex: spotTex(0.05, -0.6, 98) });
  S.ell(gT, body, add(c.pelvisC, [0, 0, 1.2]), [3.3, 2.4, 2.0], undefined, { part: pt });
  if (pyro) {
    // ряса до земли, капюшон, верёвочный пояс, светящиеся руны
    const gR = S.group(0.5);
    const pr = S.newPart();
    S.cone(gR, body, add(c.pelvisC, [0, 0, 1.0]), 3.4, add(c.core, [0, -0.2, 1.4]), 4.2 + c.p.sway * 0.3, { part: pr, big: true });
    belt(c, M.rope, null, 9.6, 3.4, 2.5, 0.5);
    flaps(c, M.rope, [[1.4, 2.4, 3.0, 0.5]]);
    if (E) for (const z of [11.0, 13.6]) S.ell(S.group(0), glowMat("руны", FIRE, 2.2), up([0, 2.45, z]), [0.5, 0.2, 0.7], undefined, { part: S.newPart() });
  } else {
    flaps(c, body, [[-1.8, 2.3, 3.4, 1.6], [1.8, 2.3, 3.0, 1.6], [0, -2.3, 3.4, 3.0]]);
    belt(c, legion ? M.leather : M.rope, legion ? GOLD : null, 9.4, 3.5, 2.6, 0.75);
    if (!legion) flaps(c, M.rope, [[-2.4, 2.0, 2.4, 0.5]]);
    pouch(c, M.leather, [3.2, 1.0, 8.8], [0.9, 0.7, 0.9]);
  }
  if (legion) {
    // латы Сольгарда: кираса, наплечники, у усиленного — позолота и гребень
    S.ell(S.group(0), M.steel, up([0, 0.2, 13.4]), [3.9, 2.65, 3.4], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 2.4 } });
    S.box(S.group(0), M.red, up([0, 2.5, 10.4]), [1.0, 0.3, 2.6], box3(c), 0.3, { part: S.newPart() });
    for (const s of [1, -1] as (1 | -1)[]) pauldron(c, s, E ? GOLD : M.steel, 0, M.iron, 2.2, lamellarTex);
  } else if (!pyro) {
    // мех через левое плечо (по ref), у усиленного — меховой плащ и кольчуга
    S.ell(S.group(0.5), FUR, up([-2.0, 0.2, 15.2]), [2.6, 2.8, 2.0], undefined, { part: S.newPart(), big: true, tex: furTex(99, 0.3) });
    S.cone(S.group(0.4), FUR, up([-2.4, 1.6, 14.0]), 1.4, up([1.2, 2.2, 9.8]), 1.0, { part: S.newPart(), tex: furTex(100, 0.3) });
    if (E) {
      S.ell(S.group(0), M.iron, up([0, 0.15, 12.6]), [3.85, 2.55, 3.6], undefined, { part: S.newPart(), big: true, tex: mailTex, cut: { n: [0, 0, -1], d: 1.8 } });
      const gc = S.group(0.4);
      S.box(gc, FUR, up([0, -2.6, 11.6 - c.p.sway * 0.3]), [3.8, 0.7, 5.0], [[1, 0, 0], c.rotU([0, 0.995, -0.1]), c.rotU([0, 0.1, 0.995])], 0.6, { part: S.newPart(), big: true, tex: furTex(101, 0.3) });
    }
  }
  if (c.role.id === "bow" || huntress) strap(c, M.leather, [-3.4, 2.4, 16.0], [2.8, 2.6, 9.6], 0.55, M.bronze, 2);
  // голова: длинные волосы, борода (у мужчин), у дикарки — рогатый убор и маска
  S.cone(S.group(0), HSKIN, up([0, 0.2, 15.8]), 1.3, hp(c, [0, -0.2, -2.8]), 1.3, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, HSKIN, c.head, [3.0, 3.1, 3.7], undefined, { part: ph, big: true });
  S.ell(gH, HSKIN, hp(c, [0, 1.2, -2.2]), [2.2, 2.0, 1.5], undefined, { part: ph });
  if (pyro) {
    S.ell(S.group(0), body, hp(c, [0, -0.6, 0.8]), [3.6, 3.8, 4.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.9, -0.3], d: 1.3 } });
    S.cone(S.group(0.3), body, hp(c, [0, -2.6, 2.6]), 1.6, hp(c, [0, -4.2, 0.2]), 0.6, { part: S.newPart() });
  } else if (E && !legion && !huntress) hornHelm(c, M.iron, M.bone, 3.3, 1.4);
  else if (legion) {
    S.ell(S.group(0), M.steel, hp(c, [0, -0.2, 1.0]), [3.4, 3.5, 3.3], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.6, -0.8], d: 0.6 } });
    if (E) S.box(S.group(0), M.red, hp(c, [0, -0.4, 4.2]), [0.6, 3.0, 1.0], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.4, { part: S.newPart() });
  } else {
    S.ell(S.group(0), HAIR, hp(c, [0, -0.6, 1.0]), [3.3, 3.4, 3.4], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.8, -0.6], d: 0.9 } });
    S.cone(S.group(0.3), HAIR, hp(c, [0, -2.6, 0.2]), 2.0, up([0, -2.0, 15.0]), 1.4, { part: S.newPart() });
    if (huntress) for (const s of [1, -1]) {
      const g = S.group(0.3);
      const p = S.newPart();
      S.cone(g, M.bone, hp(c, [1.6 * s, 0, 2.8]), 0.7, hp(c, [2.8 * s, -0.8, 5.2]), 0.4, { part: p });
      S.cone(g, M.bone, hp(c, [2.8 * s, -0.8, 5.2]), 0.4, hp(c, [2.4 * s, -1.8, 7.0]), 0.12, { part: p });
    }
  }
  if (!huntress && !pyro) S.ell(S.group(0), HAIR, hp(c, [0, 2.0, -2.8]), [2.2, 1.3, 1.6], undefined, { part: S.newPart(), tex: furTex(102, 0.3) });
  const col = { e: hex("#3a5a8a"), k: hex("#140c08"), b: HAIR.ramp[1], m: MASK, f: hex("#f0a030") };
  if (pyro) face(c, { at: [0, 3.0, 0.4], colors: col, glow: ["f"], halo: FIRE[2], down: [["f.f"], -1, 0], side: [["f"], 0, 0], sideAt: [1.6, 2.6, 0.4] });
  else face(c, { at: [0, 3.1, 0.5], colors: col, down: [[huntress ? "mmmmm" : "bb.bb", huntress ? "mk.km" : "ke.ek"], -2, -1], side: [["bb", "ke"], -1, -1], sideAt: [1.6, 2.8, 0.5] });
  for (const i of [0, 1]) {
    if (pyro) drawArm(c, i, { mat: body, r: [1.4, 1.35, 1.4] }, 1.0, HSKIN);
    else {
      drawArm(c, i, { mat: HSKIN, r: [1.45, 1.25, 1.05] }, 1.05);
      S.cone(S.group(0), body, c.sh[i], 1.7, lerpV(c.sh[i], c.el[i], 0.5), 1.55, { part: S.newPart() });
      S.cone(S.group(0), legion ? M.steel : M.leather, lerpV(c.el[i], c.hand[i], 0.4), 1.25, lerpV(c.el[i], c.hand[i], 0.85), 1.2, { part: S.newPart() });
    }
    drawLeg(c, i, { mat: pyro ? body : HSKIN, r: [1.6, 1.35, 1.15] });
    if (!pyro) S.cone(S.group(0), legion ? M.steel : WRAP, add(c.ankle[i], [0, 0, 2.6]), 1.4, add(c.ankle[i], [0, 0, -0.2]), 1.3, { part: S.newPart(), tex: legion ? lamellarTex : spotTex(0.2, -0.7, 103) });
    drawFoot(c, i, legion ? M.iron : WRAP, 2.5, 1.15, 1.1);
  }
}
/** Глефа: древко и длинный изогнутый клинок, у усиленной — стальной с костяным кольцом. */
const glaive = (): WeaponFn => (S, g, o) => {
  W.spear(6.8, 6.0)(S, g, o);
  const w = norm(g.dir);
  const side = norm([w[1], -w[0], 0.0001]);
  const G = S.group(0.4);
  const p = S.newPart();
  const m = o.elite ? M.steel : M.blade;
  S.cone(G, m, add(g.at, add(mul(w, 7.2), mul(side, 0.4))), 0.75, add(g.at, add(mul(w, 9.6), mul(side, 1.2))), 0.6, { piece: o.piece, part: p });
  S.cone(G, m, add(g.at, add(mul(w, 9.6), mul(side, 1.2))), 0.6, add(g.at, add(mul(w, 10.8), mul(side, 0.6))), 0.15, { piece: o.piece, part: p });
};
export const barbarian: Creature = {
  id: "barbarian", ru: "Варвар", eliteRu: "Матёрый",
  scale: [0.95, 1.0], widen: [1.15, 1.1], death: "back",
  dims: { pelvisZ: 7.8, hipX: 2.0, hipZ: 7.2, shX: 4.5, shZ: 16.4, arm: [4.0, 3.9], leg: [3.4, 3.2], headC: [0, 0.6, 21.2], footX: 2.2 },
  roles: [
    { id: "axe", ru: "рубака", kind: "slash", R: W.axe(7.4, 1.15), reach: 9 },
    { id: "shield", ru: "щитоносец", kind: "slash", R: W.sword(7.6, 8.6), L: W.roundShield(3.8), shield: true, reach: 9.6 },
    { id: "bow", ru: "лучник", kind: "bow", L: W.bow(), back: { fn: W.quiver(), at: [1.6, -2.6, 13.0], dir: [-0.35, -0.1, 1] } },
    { id: "pyro", ru: "культист-пиромант", kind: "handcast", fx: FIRE },
    { id: "legion", ru: "павший легионер", kind: "slash", R: W.sword(7.6, 8.6), L: W.roundShield(3.8, M.red), shield: true, reach: 9.6 },
    { id: "glaive", ru: "дикарка с глефой", kind: "thrust", R: glaive(), reach: 10.6 },
  ],
  build: barbBuild,
};
