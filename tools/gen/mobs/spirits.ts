/**
 * Задача 140, партия 2: духи и колдовские образы.
 * - Дух павшего (refs fallen_spirit/*) — Поля вечных битв: полупрозрачные голубоватые воины, ноги растворяются в дыму;
 *   8 ролей: воин (кольчуга, сюрко, меч), копейщик (капюшон, стёганка), лучник, пустой латник (шлем без лица),
 *   саванный дух (капюшон, саван, наплечник — маг), пепельный ратник (серый, рассыпается пеплом), дух утопленника
 *   (водоросли, бирюзовый — маг), дух павшего нежитя (скелет со щитом). Усиленный — «Неупокоенный знаменосец»:
 *   ярче свечение, длиннее шлейф, призрачное знамя за спиной, лучший клинок.
 * - Банши (banshee/ref1–4): тощая, рваное платье с тлеющими трещинами, развевающиеся волосы, цепи на руках, жёлтые
 *   глаза; парит без ног. Усиленная «Скорбная» — красная вуаль с цветами, ярче трещины.
 * - Лиловое существо (void_spirit): сутулое, без ног, тёмный хвост-шлейф, светящиеся глаза, звёздные искры.
 * - Ведьма-костница (bone_witch): седые космы, платье из костей, ворон на голове, костяной посох с треснувшим шаром.
 * - Обмотанный конструкт (wrapped_construct/ref1–2): лиловые ленты, золотая маска, свет изнутри (жёлтый / у
 *   усиленного — бирюзовый).
 * Все — рост героя 0,95 / 1,0; гибель — распад (crumble) цветом образа.
 */
import {
  belt, strap, M, R, W, add, bandageTex, drawArm, drawFoot, drawLeg, face, flaps, furTex, glowMat, hex, hp, lerpV, mailTex, mat, mul, norm, spotTex, sub,
  type Creature, type Ctx, type Mat, type Ramp, type TexFn, type V3, type WeaponFn,
} from "./rig";

const m5 = (name: string, ...cs: string[]) => mat(name, R(...cs), { base: 1.8, gain: 2.3 });
const box3 = (c: Ctx): [V3, V3, V3] => [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])];

/** Дымный шлейф вместо ног: от таза к земле, раскачивается; wisps — завитки по бокам. */
export function smokeTail(c: Ctx, m: Mat, r0: number, long = 1, wisps?: Mat) {
  const S = c.S;
  const sw = c.p.sway + c.p.tail * 0.3;
  const g = S.group(0.6);
  const p = S.newPart();
  const a = add(c.pelvisC, [0, 0, -0.4]);
  const b = add(c.core, [sw * 0.8, -0.8 * long, 3.8]);
  const d = add(c.core, [sw * 1.6 - 0.4, -1.8 * long, 1.0]);
  S.cone(g, m, a, r0, b, r0 * 0.62, { part: p, big: true });
  S.cone(g, m, b, r0 * 0.62, d, 0.35, { part: p });
  if (wisps) for (const s of [1, -1]) S.cone(S.group(0.3), wisps, add(c.core, [s * r0 * 0.7, 0.2, 5.0]), 0.6, add(c.core, [s * (r0 + 0.8) + sw, -0.6 * long, 2.2]), 0.2, { part: S.newPart() });
}

// =============================== ДУХ ПАВШЕГО ===============================
const GH = R("#14202e", "#2c4660", "#4e7490", "#84aec4", "#c6e4ee");
const GH_E = R("#16283a", "#2e5674", "#5290b2", "#90cce2", "#e0f8ff");
const M_GH = mat("дух", GH, { base: 2.0, gain: 2.0 });
const M_GHE = mat("яркий дух", GH_E, { base: 2.1, gain: 2.0 });
const M_GMET = mat("призрачное железо", R("#1a2028", "#36404c", "#566676", "#8496a6", "#c4d2dc"), { base: 1.9, gain: 2.4 });
const M_GCLOTH = mat("призрачное сюрко", R("#141c2a", "#283850", "#3e5478", "#5c76a0", "#8aa2c4"), { base: 1.8, gain: 2.2 });
const M_GLIGHT = mat("светлая ткань", R("#2a3038", "#4c5662", "#74808c", "#a4b0ba", "#d8e0e6"), { base: 1.8, gain: 2.2 });
const M_GQUILT = mat("стёганка", R("#1c2226", "#38424a", "#58666e", "#7e8e94", "#a8b6ba"), { base: 1.7, gain: 2.2 });
const ASH = R("#1e1c1a", "#3c3a36", "#5e5a54", "#86827a", "#b0aca2");
const M_ASH = mat("пепел", ASH, { base: 1.9, gain: 2.2 });
const TEAL = R("#0a2a2a", "#145252", "#2a8484", "#5cbcb4", "#a8ecdc");
const M_TEAL = mat("бирюзовый дух", TEAL, { base: 2.0, gain: 2.0 });
const M_WEED = m5("водоросли", "#0e1a10", "#1c3420", "#2e5232", "#467040", "#648e52");
const SOULB = R("#0d3a56", "#1d74a6", "#47b6ea", "#aaeaff", "#effdff");
const M_SOUL = glowMat("свет духа", SOULB);
const M_SOULT = glowMat("свет утопленника", TEAL);
const ghostBlade = (len = 8, len2 = 9.6): WeaponFn => (S, g, o) => {
  W.sword(len, len2)(S, g, o);
  if (o.elite) S.cone(S.group(0), M_SOUL, add(g.at, mul(norm(g.dir), 2.0)), 0.3, add(g.at, mul(norm(g.dir), 2.0 + len2 - 1.5)), 0.25, { piece: o.piece, part: S.newPart() });
};
const ghostShield = (): WeaponFn => (S, g, o) => W.roundShield(3.6, M_GMET)(S, g, o);
function fallenBuild(c: Ctx) {
  const { S, E, up } = c;
  const id = c.role.id;
  const ash = id === "ash", drowned = id === "drowned", undead = id === "undead", hollow = id === "hollow", shroud = id === "shroud";
  const skin = ash ? M_ASH : drowned ? M_TEAL : E ? M_GHE : M_GH;
  const soul = drowned ? M_SOULT : M_SOUL;
  const torn: TexFn = spotTex(0.08, -0.9, 111);
  const gT = S.group(0.8);
  const pt = S.newPart();
  if (undead) {
    // скелет в рваной коже: рёбра, позвоночник, лоскуты
    S.ell(gT, M.bone, up([0, 0, 13.6]), [3.0, 2.0, 3.0], undefined, { part: pt, big: true, tex: (q) => (q.edge ? 0 : (q.y - q.ay + 64) % 2 ? -1.2 : 0.3) });
    S.cone(gT, M.bone, up([0, -0.6, 10.6]), 0.9, up([0, -0.6, 8.0]), 0.9, { part: pt });
    S.ell(gT, M.bone, c.pelvisC, [2.6, 1.7, 1.2], undefined, { part: pt });
    flaps(c, M.leather, [[-1.4, 1.8, 3.0, 1.2], [1.2, 1.8, 2.4, 1.0], [0, -1.8, 3.0, 2.0]], torn);
    S.ell(S.group(0), M.leather, up([-1.6, 0.3, 14.6]), [2.0, 2.2, 1.8], undefined, { part: S.newPart(), tex: torn });
  } else {
    S.ell(gT, skin, up([0, 0, 12.8]), [3.6, 2.4, 3.9], undefined, { part: pt, big: true });
    S.ell(gT, skin, add(c.pelvisC, [0, 0, 1.2]), [3.1, 2.2, 1.8], undefined, { part: pt });
    if (id === "warrior" || hollow || E) S.ell(S.group(0), M_GMET, up([0, 0.1, 12.8]), [3.8, 2.6, 3.7], undefined, { part: S.newPart(), big: true, tex: mailTex, cut: { n: [0, 0, -1], d: 2.2 } });
    if (id === "spear" || id === "archer" || drowned) S.ell(S.group(0), M_GQUILT, up([0, 0.1, 12.8]), [3.8, 2.6, 3.7], undefined, { part: S.newPart(), big: true, tex: (q) => (q.edge ? 0 : (q.y - q.ay + 64) % 3 === 0 ? -0.9 : 0), cut: { n: [0, 0, -1], d: 2.0 } });
    // сюрко: рваное, полосой спереди и сзади
    if (id === "warrior" || hollow) {
      S.box(S.group(0.4), M_GCLOTH, up([0, 2.3, 11.6]), [2.4, 0.35, 3.8], box3(c), 0.3, { part: S.newPart(), tex: torn });
      S.box(S.group(0), M_GLIGHT, up([0, 2.6, 12.0]), [0.6, 0.2, 3.0], box3(c), 0.2, { part: S.newPart() });
      flaps(c, M_GCLOTH, [[-1.2, 2.4, 3.6, 1.4], [1.2, 2.4, 3.0, 1.2], [0, -2.4, 3.6, 2.6]], torn);
    } else if (shroud) {
      S.ell(S.group(0.6), M_GLIGHT, up([0, 0, 12.4]), [3.9, 2.7, 4.6], undefined, { part: S.newPart(), big: true, tex: torn });
      flaps(c, M_GLIGHT, [[-1.6, 2.3, 4.4, 1.6], [1.4, 2.3, 3.8, 1.6], [0, -2.4, 4.8, 3.2]], torn);
      S.ell(S.group(0), M_GMET, up([c.d.shX + 0.2, 0.1, c.d.shZ + 0.2]), [2.2, 2.1, 1.5], undefined, { part: S.newPart(), cut: { n: [0, 0, -1], d: 0.4 } });
    } else if (ash) {
      flaps(c, M_ASH, [[-1.4, 2.2, 3.2, 1.4], [1.4, 2.2, 2.6, 1.3], [0, -2.2, 3.4, 2.8]], spotTex(0.15, -1.0, 112));
    } else {
      flaps(c, drowned ? M_GQUILT : M_GQUILT, [[-1.6, 2.3, 2.8, 1.6], [1.6, 2.3, 2.8, 1.6], [0, -2.3, 3.0, 3.0]], torn);
    }
    belt(c, drowned ? M.rope : M.leather, drowned ? null : M_GMET, 9.4, 3.4, 2.5, 0.6);
    if (drowned) {
      S.cone(S.group(0.3), M_WEED, up([-3.0, 1.6, 15.2]), 0.7, up([1.6, 2.2, 9.4]), 0.6, { part: S.newPart() });
      flaps(c, M_WEED, [[2.2, 1.2, 3.6, 0.5], [-2.2, -0.8, 3.0, 0.5]]);
    }
    if (id === "archer") strap(c, M.leather, [-3.4, 2.4, 16.0], [2.8, 2.6, 9.6], 0.5, M_GMET, 2);
  }
  // знамя знаменосца: древко за спиной и призрачное полотнище
  if (E) {
    const base = up([1.6, -2.8, 9.0]), top = up([1.8, -3.2, 25.0]);
    S.cone(S.group(0), M.wood, base, 0.45, top, 0.4, { part: S.newPart() });
    S.cone(S.group(0), M_SOUL, top, 0.55, top, 0.55, { part: S.newPart() });
    const fl = c.p.sway;
    S.box(S.group(0.4), M_GCLOTH, add(lerpV(base, top, 0.8), c.rotU([-1.4 - fl * 0.4, -0.3, 0])), [1.6, 0.25, 2.6], box3(c), 0.3, { part: S.newPart(), tex: torn });
    S.box(S.group(0), M_GLIGHT, add(lerpV(base, top, 0.8), c.rotU([-1.4 - fl * 0.4, -0.55, 0.4])), [0.4, 0.1, 1.4], box3(c), 0.1, { part: S.newPart() });
  }
  // голова
  if (!hollow) S.cone(S.group(0), undead ? M.bone : skin, up([0, 0.2, 15.6]), 1.2, hp(c, [0, -0.2, -2.6]), 1.2, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  if (undead) {
    S.ell(gH, M.bone, c.head, [3.0, 3.2, 3.4], undefined, { part: ph, big: true });
    S.ell(gH, M.bone, hp(c, [0, 1.0, -2.4]), [2.0, 1.8, 1.4], undefined, { part: ph });
  } else if (!hollow) {
    S.ell(gH, skin, c.head, [3.0, 3.1, 3.6], undefined, { part: ph, big: true });
    S.ell(gH, skin, hp(c, [0, 1.2, -2.2]), [2.1, 1.9, 1.5], undefined, { part: ph });
  }
  if (id === "warrior" || hollow || (undead && E)) {
    // шлем с наносником и бармица (у пустого — под шлемом пустота)
    S.ell(S.group(0), M_GMET, hp(c, [0, -0.2, 1.2]), [3.4, 3.5, 3.0], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 0.2 } });
    S.cone(S.group(0), M_GMET, hp(c, [0, -0.2, 3.8]), 0.6, hp(c, [0, -0.2, 4.6]), 0.2, { part: S.newPart() });
    if (!undead) S.ell(S.group(0.4), M_GMET, hp(c, [0, -0.4, -1.4]), [3.4, 3.4, 2.8], undefined, { part: S.newPart(), big: true, tex: mailTex, cut: { n: [0, 0.9, 0.2], d: 1.6 } });
    if (hollow) {
      S.ell(S.group(0), glowMat("пустота шлема", R("#020406", "#06101a", "#0c2030", "#1a3c54", "#2a5a78"), 1.4), hp(c, [0, 1.4, -0.4]), [2.4, 1.6, 2.4], undefined, { part: S.newPart() });
      S.cone(S.group(0), M_GMET, hp(c, [0, 3.2, 1.2]), 0.5, hp(c, [0, 3.4, -0.8]), 0.4, { part: S.newPart() });
    }
  } else if (id === "spear" || id === "archer" || shroud) {
    S.ell(S.group(0), shroud ? M_GLIGHT : M_GQUILT, hp(c, [0, -0.6, 0.8]), [3.5, 3.7, 4.1], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.9, -0.3], d: 1.3 }, tex: torn });
    S.cone(S.group(0.3), shroud ? M_GLIGHT : M_GQUILT, hp(c, [0, -2.6, 2.4]), 1.5, hp(c, [0, -4.0, 0.0]), 0.5, { part: S.newPart() });
  } else if (ash) {
    S.ell(S.group(0), M_ASH, hp(c, [0, -0.2, 1.4]), [3.3, 3.4, 2.8], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 0.3 }, tex: spotTex(0.15, -1.0, 113) });
  } else if (drowned) {
    // длинные волосы с водорослями
    S.ell(S.group(0), M_WEED, hp(c, [0, -0.6, 1.2]), [3.3, 3.4, 3.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.8, -0.6], d: 0.9 } });
    for (const s of [1, -1]) S.cone(S.group(0.3), M_WEED, hp(c, [2.2 * s, -1.4, -0.4]), 1.0, up([2.6 * s, -1.6, 12.4]), 0.5, { part: S.newPart() });
  }
  const eye = c.p.glow > 0.4 ? "G" : "g";
  const col = { G: (drowned ? TEAL : SOULB)[4], g: (drowned ? TEAL : SOULB)[3], k: hex("#0a1420"), v: hex("#04080e") };
  if (hollow) face(c, { at: [0, 2.4, 0.2], colors: col, glow: ["G", "g"], halo: SOULB[2], down: [[`${eye}.${eye}`], -1, 0], side: [[eye], 0, 0], sideAt: [1.0, 2.0, 0.2] });
  else face(c, { at: [0, 3.1, 0.5], colors: col, glow: ["G", "g"], halo: (drowned ? TEAL : SOULB)[2], down: [[undead ? `v${eye}.${eye}v` : `k${eye}.${eye}k`], -2, 0], side: [[`k${eye}`], -1, 0], sideAt: [1.6, 2.8, 0.5] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: undead ? M.bone : skin, r: undead ? [0.8, 0.7, 0.6] : [1.35, 1.2, 1.0] }, undead ? 0.8 : 1.0);
    if (!undead) S.cone(S.group(0), id === "warrior" || hollow ? M_GMET : skin, lerpV(c.el[i], c.hand[i], 0.3), 1.3, lerpV(c.el[i], c.hand[i], 0.8), 1.2, { part: S.newPart() });
    if (id === "warrior" || hollow || E) S.cone(S.group(0), M_GMET, c.sh[i], 1.65, lerpV(c.sh[i], c.el[i], 0.6), 1.45, { part: S.newPart(), tex: mailTex });
  }
  smokeTail(c, skin, 3.0, E ? 1.5 : 1, E ? soul : undefined);
  void soul;
}
export const fallenSpirit: Creature = {
  id: "fallen_spirit", ru: "Дух павшего", eliteRu: "Неупокоенный знаменосец",
  scale: [0.95, 1.0], widen: [1.12, 1.08], death: "crumble",
  dust: R("#1a2a3a", "#3a5a74", "#6a94b0", "#a4cce0"),
  dims: { pelvisZ: 7.8, hipX: 2.0, hipZ: 7.2, shX: 4.4, shZ: 16.4, arm: [4.0, 3.9], leg: [3.4, 3.2], headC: [0, 0.6, 21.2], footX: 2.2 },
  roles: [
    { id: "warrior", ru: "воин", kind: "slash", R: ghostBlade(), reach: 9.6, fx: SOULB },
    { id: "spear", ru: "копейщик", kind: "thrust", R: W.spear(8.2, 6.0), reach: 10.6, fx: SOULB },
    { id: "archer", ru: "лучник", kind: "bow", L: W.bow(), back: { fn: W.quiver(), at: [1.6, -2.6, 13.0], dir: [-0.35, -0.1, 1] }, fx: SOULB },
    { id: "hollow", ru: "пустой латник", kind: "slash", R: ghostBlade(8.6, 10), reach: 10.2, fx: SOULB },
    { id: "shroud", ru: "саванный дух", kind: "handcast", fx: SOULB },
    { id: "ash", ru: "пепельный ратник", kind: "slash", R: W.sword(7.6, 8.6), reach: 9.6, fx: ASH },
    { id: "drowned", ru: "дух утопленника", kind: "handcast", fx: TEAL },
    { id: "undead", ru: "дух павшего нежитя", kind: "slash", R: ghostBlade(7.2, 8.6), L: ghostShield(), shield: true, reach: 9.2, fx: SOULB },
  ],
  build: fallenBuild,
};

// =============================== БАНШИ ===============================
const BSKIN = m5("кожа банши", "#2a2a30", "#4e5058", "#7a7e88", "#a8acb4", "#d6d8de");
const BDRESS = m5("платье банши", "#0e0c10", "#1e1a22", "#302a36", "#463e4c", "#5e5464");
const BHAIR = m5("волосы банши", "#2a2c32", "#4c5058", "#767c84", "#a4aab0", "#d4d8dc");
const VEIL = m5("красная вуаль", "#2a0808", "#561010", "#8a1c18", "#b8302a", "#dc5a48");
const CRACK = R("#5a2004", "#a8460a", "#f08a20", "#ffc860", "#fff4c0");
const WAIL = R("#2a3a4a", "#5a7a94", "#9ec0d4", "#dceef6", "#ffffff");
function bansheeBuild(c: Ctx) {
  const { S, E, up } = c;
  const cr = glowMat("тлеющие трещины", CRACK, E ? 2.6 : 2.0);
  const crack = spotTex(E ? 0.1 : 0.06, 0, 121, cr);
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, BDRESS, up([0, 0, 12.8]), [3.0, 2.0, 3.8], undefined, { part: pt, big: true, tex: crack });
  S.ell(gT, BDRESS, add(c.pelvisC, [0, 0, 1.0]), [2.8, 2.0, 1.8], undefined, { part: pt, tex: crack });
  flaps(c, BDRESS, [[-1.6, 2.0, 4.2, 1.4], [1.4, 2.0, 3.6, 1.4], [0, -2.0, 4.6, 2.8], [-2.4, 0, 3.2, 1.0], [2.4, 0, 3.8, 1.0]], crack);
  S.ell(S.group(0), BSKIN, up([0, 1.4, 15.0]), [2.0, 0.8, 1.2], undefined, { part: S.newPart() });
  // голова, развевающиеся волосы назад и в стороны
  S.cone(S.group(0), BSKIN, up([0, 0.2, 15.6]), 1.0, hp(c, [0, -0.2, -2.6]), 1.0, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, BSKIN, c.head, [2.7, 2.9, 3.5], undefined, { part: ph, big: true });
  const sw = c.p.sway + c.p.tail * 0.4;
  S.ell(S.group(0), BHAIR, hp(c, [0, -0.6, 1.0]), [3.1, 3.2, 3.2], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.8, -0.5], d: 1.0 } });
  const gh = S.group(0.4);
  const phr = S.newPart();
  for (const [x, z, L] of [[2.4, 0.4, 7.0], [-2.4, 0.4, 7.0], [1.2, 1.6, 8.0], [-1.2, 1.6, 8.0], [0, 0.8, 9.0]] as [number, number, number][]) {
    const a = hp(c, [x, -2.0, z]);
    S.cone(gh, BHAIR, a, 1.1, add(a, c.rotU([x * 0.6 + sw, -L * 0.45, -L * 0.75])), 0.3, { part: phr, tex: furTex(122, 0.25) });
  }
  if (E) {
    // красная вуаль с цветами
    S.ell(S.group(0), VEIL, hp(c, [0, 0.2, 1.4]), [3.25, 3.35, 3.0], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0.6, -0.8], d: 0.4 } });
    S.box(S.group(0.4), VEIL, up([0, -2.6, 15.0 - sw * 0.3]), [2.4, 0.3, 4.0], box3(c), 0.3, { part: S.newPart() });
    for (const s of [1, 0, -1]) S.ball(S.group(0), m5("цветы", "#3a2a08", "#7a5a10", "#c09a20", "#e8c84a", "#fff0a0"), hp(c, [1.6 * s, 1.6 - Math.abs(s) * 0.6, 2.4]), 0.6, { part: S.newPart() });
  }
  const col = { G: hex("#fff07a"), g: hex("#e8c82a"), k: hex("#141018"), m: hex("#140a0e") };
  face(c, { at: [0, 2.9, 0.5], colors: col, glow: ["G", "g"], halo: hex("#c8a020"), down: [["kG.Gk"], -2, 0], side: [["kG"], -1, 0], sideAt: [1.5, 2.6, 0.5] });
  face(c, { at: [0, 2.9, -2.2], colors: col, down: [[c.p.jaw ? ".m." : "..."], -1, -1] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: BSKIN, r: [0.95, 0.8, 0.7] }, 0.9);
    // когти и цепи на запястьях
    S.cone(S.group(0), M.horn, c.hand[i], 0.45, add(c.hand[i], mul(norm(sub(c.hand[i], c.el[i])), 1.6)), 0.12, { part: S.newPart() });
    const gc = S.group(0.2);
    const pc = S.newPart();
    for (let k = 0; k < 4; k++) S.ball(gc, M.iron, add(lerpV(c.el[i], c.hand[i], 0.82), [0, 0, -k * 0.85]), 0.5, { part: pc });
  }
  smokeTail(c, BDRESS, 2.8, 1.3, E ? cr : undefined);
}
export const banshee: Creature = {
  id: "banshee", ru: "Банши", eliteRu: "Скорбная",
  scale: [0.95, 1.0], widen: [1.15, 1.1], death: "crumble",
  dust: R("#1e1a22", "#3a3240", "#5e5468", "#8a8094"),
  dims: { pelvisZ: 8.2, hipX: 1.8, hipZ: 7.6, shX: 4.0, shZ: 16.6, arm: [4.4, 4.2], leg: [3.4, 3.2], headC: [0, 0.8, 21.4], footX: 2.0, hunch: 0.08 },
  roles: [
    { id: "wail", ru: "плакальщица", kind: "handcast", fx: WAIL },
    { id: "claw", ru: "когтистая", kind: "claw" },
  ],
  refFile: "ref1.png",
  build: bansheeBuild,
};

// =============================== ЛИЛОВОЕ СУЩЕСТВО ===============================
const VOID = R("#24123a", "#3c1c5e", "#5c2c86", "#8646b0", "#b474d8");
const VOID_E = R("#1e0e32", "#341852", "#52267a", "#7a3ca6", "#a85ed0");
const STAR = R("#3a1a5a", "#7a4ab0", "#c8a0f0", "#f0e0ff", "#ffffff");
const MAG = R("#5a0a3a", "#a01a6a", "#f04aa0", "#ff9ad0", "#ffe8f4");
function voidBuild(c: Ctx) {
  const { S, E, up } = c;
  const m = mat("лиловая плоть", E ? VOID_E : VOID, { base: 1.9, gain: 2.3 });
  const stars = spotTex(E ? 0.1 : 0.06, 0, 131, glowMat("искры", STAR, 2.6));
  const gT = S.group(0.9);
  const pt = S.newPart();
  S.ell(gT, m, up([0, 0.4, 13.4]), [3.8, 2.8, 4.0], undefined, { part: pt, big: true, tex: stars });
  S.ell(gT, m, add(c.pelvisC, [0, 0, 1.4]), [2.8, 2.2, 2.2], undefined, { part: pt, tex: stars });
  // горб и голова, ушедшая в плечи
  S.ell(S.group(0.6), m, up([0, -1.0, 17.0]), [3.2, 2.4, 2.0], undefined, { part: S.newPart(), tex: stars });
  const gH = S.group(0.8);
  const ph = S.newPart();
  S.ell(gH, m, c.head, [2.8, 2.8, 2.8], undefined, { part: ph, big: true, tex: stars });
  if (E) for (const s of [1, -1]) S.cone(S.group(0), glowMat("рога", MAG, 2.2), hp(c, [1.6 * s, -0.4, 1.8]), 0.6, hp(c, [2.8 * s, -1.6, 4.0]), 0.12, { part: S.newPart() });
  face(c, { at: [0, 2.6, 0.4], colors: { G: MAG[4], g: MAG[3] }, glow: ["G", "g"], halo: MAG[2], down: [["gG.Gg"], -2, 0], side: [["Gg"], -1, 0], sideAt: [1.6, 2.2, 0.4] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: m, r: [1.6, 1.35, 1.2], tex: stars }, 1.3);
    for (const k of [-1, 0, 1]) S.cone(S.group(0), m, c.hand[i], 0.45, add(c.hand[i], add(mul(norm(sub(c.hand[i], c.el[i])), 1.6), [k * 0.6, 0, 0])), 0.15, { part: S.newPart() });
  }
  smokeTail(c, mat("тёмный шлейф", R("#140c1e", "#22162e", "#322042", "#462c5a", "#5e3c76"), { base: 1.8, gain: 2.0 }), 2.8, 1.6);
}
export const voidSpirit: Creature = {
  id: "void_spirit", ru: "Лиловое существо", eliteRu: "Бездонное",
  scale: [0.95, 1.0], widen: [1.12, 1.08], death: "crumble",
  dust: R("#1a0a2a", "#3a1a5a", "#6a3a94", "#a070cc"),
  dims: { pelvisZ: 8.0, hipX: 1.8, hipZ: 7.4, shX: 4.6, shZ: 16.0, arm: [4.6, 4.4], leg: [3.4, 3.2], headC: [0, 2.4, 19.6], footX: 2.0, hunch: 0.2 },
  roles: [
    { id: "claw", ru: "когтистое", kind: "claw" },
    { id: "caster", ru: "зовущее", kind: "handcast", fx: MAG },
  ],
  build: voidBuild,
};

// =============================== ВЕДЬМА-КОСТНИЦА ===============================
const WSKIN = m5("кожа ведьмы", "#2a1a14", "#54362a", "#80584a", "#a47a6a", "#c8a090");
const WHAIR = m5("седые космы", "#1c1c1e", "#38383c", "#58585e", "#7c7c84", "#a4a4aa");
const WDRESS = m5("болотное платье", "#0e140e", "#1e2a1e", "#30422e", "#465c42", "#62785a");
const RAVEN = m5("ворон", "#08080c", "#14141a", "#24242c", "#383844", "#50505e");
const ORB = R("#2a1a04", "#7a5010", "#d8a020", "#ffe070", "#fffadc");
const ORB_M = m5("чёрный шар", "#060606", "#0e0e10", "#18181c", "#26262c", "#3a3a42");
const boneStaff = (): WeaponFn => (S, g, o) => {
  const w = norm(g.dir);
  S.cone(S.group(0.3), M.bone, add(g.at, mul(w, -7)), 0.8, add(g.at, mul(w, 11)), 0.85, { piece: o.piece, part: S.newPart(), tex: spotTex(0.15, -0.8, 141) });
  const top = add(g.at, mul(w, 11));
  const side = norm([w[1], -w[0], 0.0001]);
  S.cone(S.group(0), M.bone, top, 0.7, add(top, add(mul(side, -2.0), mul(w, 1.0))), 0.5, { piece: o.piece, part: S.newPart() });
  const orb = add(top, add(mul(side, -2.0), mul(w, -1.6)));
  S.cone(S.group(0), M.rope, add(top, add(mul(side, -2.0), mul(w, 1.0))), 0.2, orb, 0.2, { piece: o.piece, part: S.newPart() });
  S.ball(S.group(0), ORB_M, orb, 1.6, { piece: o.piece, part: S.newPart(), tex: spotTex(o.elite || o.k > 0.2 ? 0.3 : 0.18, 0, 142, glowMat("трещины шара", ORB, 2.4)) });
};
function witchBuild(c: Ctx) {
  const { S, E, up } = c;
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, WDRESS, up([0, 0, 13.0]), [3.2, 2.2, 3.8], undefined, { part: pt, big: true });
  // юбка до земли, рваный шлейф
  const gR = S.group(0.5);
  const pr = S.newPart();
  S.cone(gR, WDRESS, add(c.pelvisC, [0, 0, 1.6]), 3.2, add(c.core, [0, -0.4, 1.2]), 4.6 + c.p.sway * 0.3, { part: pr, big: true, tex: spotTex(0.08, -1.0, 143) });
  flaps(c, WDRESS, [[0, -3.6, 1.0, 2.4]]);
  // рёбра-корсет из костей и кости по юбке
  for (let k = 0; k < 4; k++) for (const s of [1, -1]) S.cone(S.group(0), M.bone, up([0.3 * s, 2.2, 15.0 - k * 1.3]), 0.4, up([2.6 * s, 1.6, 14.0 - k * 1.3]), 0.3, { part: S.newPart() });
  S.cone(S.group(0), M.bone, up([0, 2.3, 15.6]), 0.45, up([0, 2.3, 10.2]), 0.4, { part: S.newPart() });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6 - 0.42) * 2.6;
    S.cone(S.group(0), M.bone, up([Math.sin(a) * 3.0, Math.cos(a) * 2.6, 9.2]), 0.35, add(c.core, [Math.sin(a) * 4.0, Math.cos(a) * 3.4, 3.6]), 0.3, { part: S.newPart() });
  }
  // костяные шипы на плечах (по ref)
  for (const s of [1, -1]) for (let k = 0; k < (E ? 4 : 3); k++) S.cone(S.group(0), M.bone, up([3.6 * s, -0.4 + k * 0.4, 16.2]), 0.5, up([(5.6 + k * 0.6) * s, -1.0 + k * 0.6, 18.6 + k * 1.0]), 0.3, { part: S.newPart() });
  // голова, космы шапкой, ворон
  S.cone(S.group(0), WSKIN, up([0, 0.2, 15.6]), 1.0, hp(c, [0, -0.2, -2.6]), 1.0, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, WSKIN, c.head, [2.7, 2.9, 3.4], undefined, { part: ph, big: true });
  S.cone(S.group(0), WSKIN, hp(c, [0, 2.6, 0]), 0.6, hp(c, [0, 3.6, -1.0]), 0.4, { part: S.newPart() });
  S.ell(S.group(0.5), WHAIR, hp(c, [0, -0.8, 1.4]), [4.4, 4.0, 3.8], undefined, { part: S.newPart(), big: true, tex: furTex(144, 0.35), cut: { n: [0.3, 0.9, -0.3], d: 1.6 } });
  S.cone(S.group(0.4), WHAIR, hp(c, [0, -2.6, -0.6]), 2.6, up([0, -2.2, 13.0]), 1.6, { part: S.newPart(), tex: furTex(145, 0.35) });
  {
    const rv = hp(c, [1.2, -0.6, 5.0]);
    const gr = S.group(0.4);
    const prv = S.newPart();
    S.ell(gr, RAVEN, rv, [0.9, 1.6, 1.0], undefined, { part: prv });
    S.ball(gr, RAVEN, add(rv, c.rotU([0, 1.2, 1.0])), 0.75, { part: prv });
    S.cone(S.group(0), M.horn, add(rv, c.rotU([0, 1.8, 1.0])), 0.3, add(rv, c.rotU([0, 2.6, 0.8])), 0.1, { part: S.newPart() });
    S.cone(S.group(0), RAVEN, add(rv, c.rotU([0, -1.2, -0.2])), 0.6, add(rv, c.rotU([0, -2.6, -0.8])), 0.25, { part: S.newPart() });
    if (E) face(c, { at: add(sub(rv, c.head), [0, 0, 0]) as V3, colors: { G: hex("#ff6030") }, glow: ["G"], halo: hex("#a02010"), down: [["G"], 0, -2], side: [["G"], 1, -2], sideAt: sub(rv, c.head) as V3 });
  }
  const col = { e: hex("#d8d0b0"), k: hex("#140c0a"), h: WHAIR.ramp[2], m: hex("#2a1410") };
  face(c, { at: [0, 2.8, 0.5], colors: col, down: [["hhk.k"], -2, 0], side: [["k"], 0, 0], sideAt: [1.5, 2.6, 0.5] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: WSKIN, r: [1.0, 0.85, 0.75] }, 0.85);
    S.cone(S.group(0), M.leather, lerpV(c.el[i], c.hand[i], 0.6), 0.95, lerpV(c.el[i], c.hand[i], 0.75), 0.9, { part: S.newPart() });
  }
}
export const boneWitch: Creature = {
  id: "bone_witch", ru: "Ведьма-костница", eliteRu: "Древняя",
  scale: [0.95, 1.0], widen: [1.1, 1.08], death: "crumble",
  dust: R("#1a1e16", "#3a4232", "#626a52", "#9a9a7a"),
  dims: { pelvisZ: 7.8, hipX: 1.8, hipZ: 7.2, shX: 4.0, shZ: 16.0, arm: [4.0, 3.8], leg: [3.4, 3.2], headC: [0, 1.0, 20.6], footX: 2.0, hunch: 0.1 },
  roles: [
    { id: "staff", ru: "ведьма с посохом", kind: "cast", R: boneStaff(), focus: 9.4, fx: ORB },
    { id: "hex", ru: "проклинательница", kind: "handcast", fx: R("#1a2a0a", "#3a5a14", "#76a42a", "#b8e05a", "#eeffb0") },
  ],
  build: witchBuild,
};

// =============================== ОБМОТАННЫЙ КОНСТРУКТ ===============================
const BAND = R("#1a0e2a", "#341c52", "#523080", "#7048a8", "#9468cc");
const LIGHT_Y = R("#5a3a04", "#a8700a", "#f0b020", "#ffe070", "#fffadc");
const LIGHT_T = R("#044a44", "#0a8a7a", "#20d0b8", "#80f4e0", "#dcfff8");
const MASKG = mat("золотая маска", R("#2a1c06", "#5e4010", "#9a7020", "#d4a838", "#f8e08a"), { base: 2.0, gain: 2.3 });
function wrappedBuild(c: Ctx) {
  const { S, E, up } = c;
  const fem = c.role.id === "weaver";
  const lit = glowMat("свет изнутри", E ? LIGHT_T : LIGHT_Y, 2.4);
  const band = mat("ленты", BAND, { base: 1.8, gain: 2.3 });
  const tx = bandageTex(lit);
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, band, up([0, 0, 13.0]), [fem ? 3.2 : 3.7, 2.4, 3.9], undefined, { part: pt, big: true, tex: tx });
  S.ell(gT, band, add(c.pelvisC, [0, 0, 1.0]), [3.2, 2.3, 2.0], undefined, { part: pt, tex: tx });
  // крест лент на груди и пояс
  for (const s of [1, -1]) S.cone(S.group(0), band, up([3.2 * s, 2.3, 15.6]), 0.7, up([-2.8 * s, 2.4, 10.2]), 0.7, { part: S.newPart() });
  belt(c, band, null, 9.0, 3.4, 2.5, 1.0);
  if (fem) flaps(c, band, [[-1.2, 2.2, 3.4, 1.4], [1.2, 2.2, 3.4, 1.4], [0, -2.2, 3.6, 2.6]], tx);
  S.cone(S.group(0), band, up([0, 0.2, 15.6]), 1.2, hp(c, [0, -0.2, -2.8]), 1.2, { part: S.newPart(), tex: tx });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, band, c.head, [2.9, 3.0, 3.6], undefined, { part: ph, big: true, tex: tx });
  // маска: лицо золотом, клин бороды, диск на лбу
  S.ell(S.group(0), MASKG, hp(c, [0, 1.0, -0.2]), [2.7, 2.4, 3.6], undefined, { part: S.newPart(), big: true, cut: { n: [0, -1, 0], d: -0.4 } });
  S.cone(S.group(0), MASKG, hp(c, [0, 2.4, -3.0]), 0.8, hp(c, [0, 2.4, -4.8]), 0.4, { part: S.newPart() });
  S.ell(S.group(0), MASKG, hp(c, [0, 1.6, 4.0]), [1.2 + (E ? 0.5 : 0), 0.5, 1.2 + (E ? 0.5 : 0)], undefined, { part: S.newPart() });
  S.ball(S.group(0), lit, hp(c, [0, 2.0, 4.0]), 0.6, { part: S.newPart() });
  const L = E ? LIGHT_T : LIGHT_Y;
  face(c, { at: [0, 3.3, 0.6], colors: { G: L[4], g: L[3], k: hex("#2a1c06") }, glow: ["G", "g"], halo: L[2], down: [["kG.Gk"], -2, 0], side: [["kG"], -1, 0], sideAt: [1.6, 3.0, 0.6] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: band, r: fem ? [1.15, 1.0, 0.9] : [1.45, 1.3, 1.25], tex: tx }, fem ? 1.0 : 1.5);
    drawLeg(c, i, { mat: band, r: fem ? [1.45, 1.2, 1.1] : [1.7, 1.45, 1.3], tex: tx });
    S.cone(S.group(0), band, add(c.ankle[i], [0, 0, 2.8]), 1.5, add(c.ankle[i], [0, 0, -0.2]), 1.4, { part: S.newPart() });
    drawFoot(c, i, band, 2.6, 1.2, 1.15);
  }
}
export const wrapped: Creature = {
  id: "wrapped_construct", ru: "Обмотанный конструкт", eliteRu: "Пробуждённый",
  scale: [0.95, 1.0], widen: [1.12, 1.08], death: "crumble",
  dust: R("#1a0e2a", "#3a2258", "#6a4a94", "#a08ac8"),
  dims: { pelvisZ: 7.8, hipX: 2.0, hipZ: 7.2, shX: 4.4, shZ: 16.4, arm: [4.0, 3.9], leg: [3.4, 3.2], headC: [0, 0.6, 21.2], footX: 2.2 },
  roles: [
    { id: "guard", ru: "страж", kind: "claw" },
    { id: "weaver", ru: "ткачиха", kind: "handcast", fx: LIGHT_Y },
  ],
  refFile: "ref1-male.png",
  build: wrappedBuild,
};
export type { Ramp };
