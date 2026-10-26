/**
 * Задача 140, партия 2: крупные — кадр 48.
 * - Голем (ref stone_golem_small — из валунов): роли = порода по зоне — каменный, песчаниковый (Пустыня Миражей),
 *   лавовый (Пепельная пустошь, данж), обсидиановый (Костяной хребет), магмовый (вулкан), осадный (Поля: камень,
 *   железные обручи, дубовые накладки). Рост 1,5 / 1,6. Удар — двумя кулаками сверху. Подтянут до общего вида:
 *   5 тонов, контур как у героя, сколы и трещины, покой/ходьба 12. Усиленный «Пробуждённый»: светятся руны и трещины,
 *   кристаллы в плечах, глаза. Гибель — распад на куски (crumble) пылью породы.
 * - Ледяной голем: глыбы льда, сосульки; усиленный — ледяные шипы и синий свет изнутри.
 * - «Мясник» (описание пользователя, в духе Пуджа, не копия): грузная сшитая нежить, брюхо в швах и заплатах, правая
 *   рука тяжелее, ржавый крюк на цепи и тесак, фартук, мелкая голова на толстой шее, зеленоватая кожа; рост 1,5.
 *   Роли: тесак; крюк (бросок — крюк на цепи летит в цель). Усиленный «Гнилостный»: светящиеся швы, крюк с шипами,
 *   гнилостные пятна.
 */
import {
  M, R, W, add, belt, drawArm, drawFoot, drawLeg, face, flaps, glowMat, hex, hp, lerpV, mat, mul, norm, spotTex, strap,
  type Creature, type Ctx, type Mat, type Ramp, type V3, type WeaponFn,
} from "./rig";

const m5 = (name: string, r: Ramp) => mat(name, r, { base: 1.8, gain: 2.3 });
const ROCK: Record<string, { r: Ramp; crack: Ramp; dust: Ramp }> = {
  stone: { r: R("#1e1c1a", "#3e3a34", "#625c52", "#8a8274", "#b4ac9a"), crack: R("#0a3040", "#14648a", "#38a8d8", "#90e0ff", "#e8fbff"), dust: R("#3a362e", "#625c50", "#8a8272", "#b4ac98") },
  sandstone: { r: R("#2e1e10", "#5a3c20", "#8a6034", "#b4884e", "#dab070"), crack: R("#4a3a04", "#8a700a", "#e0b820", "#ffe678", "#fffadc"), dust: R("#5a3c20", "#8a6034", "#b4884e", "#dab070") },
  lava: { r: R("#141010", "#2a201c", "#423228", "#5c4636", "#7a5e48"), crack: R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0"), dust: R("#2a201c", "#4a3a30", "#6e5848", "#94806a") },
  obsidian: { r: R("#16121e", "#28222f", "#3c344a", "#58506c", "#8c82a6"), crack: R("#2a0a4a", "#5a1a94", "#9a4ae0", "#d0a0ff", "#f8ecff"), dust: R("#1a1622", "#2e2838", "#4a4258", "#6e6680") },
  magma: { r: R("#2a120c", "#481e14", "#683220", "#8a462e", "#aa6044"), crack: R("#6a1a04", "#c0400a", "#ff8a20", "#ffd060", "#fff8d0"), dust: R("#341610", "#52241a", "#703628", "#905040") },
  siege: { r: R("#1c1c1e", "#3a3a3e", "#5c5c62", "#84848a", "#aeaeb2"), crack: R("#4a2a04", "#8a520a", "#e09020", "#ffd070", "#fff6d8"), dust: R("#3a3a3e", "#5c5c62", "#84848a", "#aeaeb2") },
};
const always = new Set(["lava", "magma"]);
function golemBuild(c: Ctx) {
  const { S, E, up } = c;
  const id = c.role.id;
  const R0 = ROCK[id];
  const rock = m5(`порода ${id}`, R0.r);
  const glow = glowMat(`свет ${id}`, R0.crack, 2.4);
  const lit = E || always.has(id);
  const chip = spotTex(id === "obsidian" ? 0.06 : 0.1, id === "obsidian" ? 0.9 : -0.7, 151);
  const tex = lit ? spotTex(E ? 0.09 : 0.05, 0, 152, glow) : chip;
  const blk = (at: V3, r: V3, g = 0.2, t = tex) => S.ell(S.group(g), rock, at, r, undefined, { part: S.newPart(), big: true, tex: t });
  // корпус из глыб
  blk(up([0, 0, 14.0]), [5.0, 3.4, 4.2], 0.5);
  blk(up([-2.4, 1.4, 15.6]), [2.6, 2.0, 2.4]);
  blk(up([2.2, 1.2, 12.0]), [2.4, 2.2, 2.2]);
  blk(up([0, -0.6, 10.2]), [3.6, 2.6, 2.4]);
  blk(c.pelvisC, [3.4, 2.4, 2.0]);
  // голова-валун, утопленная в плечи
  blk(c.head, [2.4, 2.4, 2.2], 0.3, chip);
  S.ell(S.group(0), rock, hp(c, [0, 1.6, 0.7]), [2.2, 0.8, 0.6], undefined, { part: S.newPart(), tone: -0.4 });
  const ec = lit ? "G" : "k";
  face(c, { at: [0, 2.2, 0.0], colors: { G: R0.crack[4], g: R0.crack[3], k: hex("#0c0a08") }, glow: ["G", "g"], halo: R0.crack[2], down: [[`${ec}..${ec}`], -2, 0], side: [[ec], 0, 0], sideAt: [1.6, 1.8, 0.0] });
  // руки: валуны на суставах, огромные кулаки
  for (const i of [0, 1]) {
    const s = i ? -1 : 1;
    blk(add(c.sh[i], c.rotU([0.6 * s, 0, 0.6])), [2.8, 2.6, 2.4], 0.3);
    drawArm(c, i, { mat: rock, r: [2.0, 1.9, 1.8], tex }, 2.2);
    blk(c.el[i], [1.9, 1.9, 1.9], 0.3);
    blk(c.hand[i], [2.4, 2.4, 2.2], 0.3);
    drawLeg(c, i, { mat: rock, r: [2.4, 2.2, 2.0], tex });
    blk(c.knee[i], [2.1, 2.1, 2.0], 0.3);
    blk(add(c.ankle[i], [0, 0.8, 0.4]), [2.4, 2.8, 1.5], 0.3);
  }
  if (id === "siege") {
    // осадный: железные обручи по корпусу, дубовые накладки, заклёпки
    for (const z of [11.6, 15.4]) S.ell(S.group(0), M.iron, up([0, 0, z]), [5.2, 3.6, 0.6], undefined, { part: S.newPart(), big: true });
    S.box(S.group(0), M.wood, up([0, 3.2, 13.6]), [2.8, 0.5, 2.4], [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])], 0.3, { part: S.newPart() });
    for (const s of [1, -1]) S.ball(S.group(0), M.iron, up([2.2 * s, 3.7, 13.6]), 0.5, { part: S.newPart() });
  }
  if (E) {
    // кристаллы в плечах и руны на груди
    const cry = glowMat("кристалл", R0.crack, 2.0);
    for (const s of [1, -1]) for (const [dx, dz, L] of [[0.4, 1.6, 3.4], [1.4, 1.0, 2.4], [-0.6, 1.2, 2.2]] as [number, number, number][]) {
      const a = up([(c.d.shX + dx) * s, -0.4, c.d.shZ + dz]);
      S.cone(S.group(0), cry, a, 0.75, add(a, c.rotU([0.5 * s, -0.3, L])), 0.15, { part: S.newPart() });
    }
    for (const [x, z] of [[-1.2, 15.0], [1.2, 15.0], [0, 13.2]] as [number, number][]) S.ell(S.group(0), glow, up([x, 3.35, z]), [0.5, 0.2, 0.8], undefined, { part: S.newPart() });
  }
}
const fists = (): WeaponFn => () => {};
export const golem: Creature = {
  id: "golem", ru: "Голем", eliteRu: "Пробуждённый",
  scale: [1.5, 1.6], big: true, widen: [1.1, 1.06], death: "crumble",
  dust: ROCK.stone.dust,
  dims: { pelvisZ: 7.4, hipX: 2.8, hipZ: 6.6, shX: 6.0, shZ: 15.6, arm: [4.2, 4.0], leg: [3.0, 3.0], headC: [0, 2.6, 18.2], footX: 3.0, hunch: 0.14, stride: 1.3 },
  roles: (["stone", "sandstone", "lava", "obsidian", "magma", "siege"] as const).map((id) => ({
    id, ru: { stone: "каменный", sandstone: "песчаниковый", lava: "лавовый", obsidian: "обсидиановый", magma: "магмовый", siege: "осадный" }[id], kind: "chop2h" as const, R: fists(), grip2: 2.2, reach: 2.4, fx: ROCK[id].crack,
  })),
  ref: "stone_golem_small",
  build: golemBuild,
};

// =============================== ЛЕДЯНОЙ ГОЛЕМ ===============================
const ICE = R("#1a3450", "#34628a", "#5e98c0", "#9cccea", "#e4f6ff");
const ICE_D = R("#10223a", "#22466a", "#3e70a0", "#6ea2cc", "#b4daf2");
const BLUE = R("#0a2a6a", "#1a54c0", "#3a8cff", "#9cd0ff", "#f0faff");
function iceBuild(c: Ctx) {
  const { S, E, up } = c;
  const ice = mat("лёд", E ? ICE_D : ICE, { base: 2.0, gain: 2.1 });
  const glow = glowMat("синий свет", BLUE, 2.4);
  const tex = E ? spotTex(0.08, 0, 161, glow) : spotTex(0.1, 0.8, 162);
  const blk = (at: V3, r: V3, g = 0.15) => S.box(S.group(g), ice, at, r, [c.rotU(norm([1, 0.2, 0])), c.rotU(norm([-0.2, 1, 0])), c.rotU([0, 0, 1])], 0.8, { part: S.newPart(), big: true, tex });
  blk(up([0, 0, 13.8]), [4.6, 3.2, 3.8], 0.4);
  blk(up([0, -0.4, 10.0]), [3.4, 2.4, 2.2]);
  blk(c.pelvisC, [3.2, 2.2, 1.8]);
  blk(c.head, [2.2, 2.2, 2.0], 0.3);
  face(c, { at: [0, 2.2, 0], colors: { G: BLUE[4], k: hex("#0a1a2a") }, glow: ["G"], halo: BLUE[2], down: [[E ? "G..G" : "k..k"], -2, 0], side: [[E ? "G" : "k"], 0, 0], sideAt: [1.6, 1.8, 0] });
  for (const i of [0, 1]) {
    const s = i ? -1 : 1;
    blk(add(c.sh[i], c.rotU([0.6 * s, 0, 0.6])), [2.6, 2.4, 2.2]);
    drawArm(c, i, { mat: ice, r: [1.9, 1.8, 1.7], tex }, 2.0);
    blk(c.hand[i], [2.2, 2.2, 2.0]);
    drawLeg(c, i, { mat: ice, r: [2.3, 2.1, 1.9], tex });
    blk(add(c.ankle[i], [0, 0.8, 0.4]), [2.2, 2.6, 1.4]);
  }
  // сосульки и шипы на спине и плечах
  const n = E ? 9 : 5;
  for (let k = 0; k < n; k++) {
    const x = ((k * 37) % 9) / 9 * 8 - 4, z = 12 + ((k * 53) % 7);
    const a = up([x, -2.6, z]);
    S.cone(S.group(0), E && k % 2 ? glow : ice, a, 0.8, add(a, c.rotU([x * 0.2, -1.6, 2.4 + (k % 3)])), 0.12, { part: S.newPart() });
  }
}
export const iceGolem: Creature = {
  id: "ice_golem", ru: "Ледяной голем", eliteRu: "Пробуждённый",
  scale: [1.5, 1.6], big: true, widen: [1.1, 1.06], death: "crumble",
  dust: R("#34628a", "#5e98c0", "#9cccea", "#e4f6ff"),
  dims: { pelvisZ: 7.4, hipX: 2.8, hipZ: 6.6, shX: 5.8, shZ: 15.6, arm: [4.2, 4.0], leg: [3.0, 3.0], headC: [0, 2.6, 18.2], footX: 3.0, hunch: 0.14, stride: 1.3 },
  roles: [{ id: "ice", ru: "ледяной голем", kind: "chop2h", R: fists(), grip2: 2.2, reach: 2.4, fx: BLUE }],
  ref: "stone_golem_small",
  build: iceBuild,
};

// =============================== «МЯСНИК» ===============================
const FLESH = R("#1a2216", "#34442c", "#566a46", "#7c9064", "#a4b48a");
const FLESH_E = R("#14200e", "#2a4020", "#466432", "#668a48", "#8cae66");
const ROT = R("#2a3a04", "#527008", "#90c020", "#ccf060", "#f4ffc0");
const APRON = R("#1e1812", "#3a3024", "#584a38", "#76644c", "#948062");
const STAIN = R("#1a0e0a", "#341c14", "#4e2a1e", "#683a2a", "#824c38");
function butcherBuild(c: Ctx) {
  const { S, E, up } = c;
  const skin = m5("сшитая плоть", E ? FLESH_E : FLESH);
  const rotGlow = glowMat("гниль", ROT, 2.2);
  const seam = E ? spotTex(0.05, 0, 171, rotGlow) : spotTex(0.05, -1.2, 171);
  const patch = spotTex(0.08, 0, 172, m5("заплаты", STAIN));
  const gT = S.group(1.0);
  const pt = S.newPart();
  S.ell(gT, skin, up([0, 0.2, 13.4]), [4.8, 3.2, 3.8], undefined, { part: pt, big: true, tex: seam });
  S.ell(gT, skin, up([0, 1.8, 10.4]), [4.6, 3.6, 3.4], undefined, { part: pt, big: true, tex: patch });
  S.ell(gT, skin, c.pelvisC, [3.8, 2.8, 2.0], undefined, { part: pt });
  // швы поперёк брюха
  for (const [z, w] of [[11.6, 3.6], [9.4, 3.0]] as [number, number][]) {
    S.cone(S.group(0), E ? rotGlow : m5("шов", STAIN), up([-w, 4.6, z]), 0.25, up([w, 4.6, z + 0.3]), 0.25, { part: S.newPart() });
    for (let k = -2; k <= 2; k++) S.cone(S.group(0), M.rope, up([k * w * 0.4, 4.8, z - 0.5]), 0.2, up([k * w * 0.4, 4.8, z + 0.6]), 0.2, { part: S.newPart() });
  }
  // фартук мясника, ремни, крюки на поясе
  S.box(S.group(0.4), m5("фартук", APRON), up([0, 4.2, 8.6]), [3.4, 0.4, 3.6], [c.rotU([1, 0, 0]), c.rotU(norm([0, 1, -0.25])), c.rotU(norm([0, 0.25, 1]))], 0.4, { part: S.newPart(), big: true, tex: spotTex(0.12, 0, 173, m5("пятна", STAIN)) });
  belt(c, M.leather, M.rust, 9.8, 4.2, 3.4, 0.7);
  strap(c, M.leather, [-4.0, 1.4, 16.0], [3.6, 3.2, 10.4], 0.6, M.rust, 3);
  S.ell(S.group(0.6), skin, up([0, -0.6, 17.0]), [3.6, 2.6, 1.8], undefined, { part: S.newPart(), tex: seam });
  // мелкая голова на толстой шее
  S.cone(S.group(0.5), skin, up([0, 0.6, 16.6]), 2.6, hp(c, [0, 0, -1.6]), 2.0, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, skin, c.head, [2.2, 2.4, 2.4], undefined, { part: ph, big: true, tex: seam });
  S.ell(gH, skin, hp(c, [0, 1.0, -1.4]), [2.1, 1.8, 1.2], undefined, { part: ph });
  for (const s of [1, -1]) S.cone(S.group(0), M.bone, hp(c, [0.9 * s, 2.2, -1.6]), 0.35, hp(c, [1.1 * s, 2.4, -0.6]), 0.12, { part: S.newPart() });
  const ec = E ? "G" : "e";
  face(c, { at: [0, 2.3, 0.4], colors: { e: hex("#d8d070"), G: ROT[4], k: hex("#0c0a06"), m: hex("#1a0e08") }, glow: ["G"], halo: ROT[2], down: [[`k${ec}.${ec}k`], -2, 0], side: [[`k${ec}`], -1, 0], sideAt: [1.3, 2.0, 0.4] });
  // руки разные: правая — толстая, с наплечником-заплатой; левая — тоньше
  for (const i of [0, 1]) {
    const heavy = i === 0;
    drawArm(c, i, { mat: skin, r: heavy ? [2.6, 2.3, 2.0] : [1.7, 1.5, 1.3], tex: heavy ? patch : seam }, heavy ? 2.0 : 1.4);
    drawLeg(c, i, { mat: m5("штаны мясника", APRON), r: [2.3, 2.0, 1.8] });
    drawFoot(c, i, M.leather, 3.0, 1.5, 1.2);
    if (heavy) S.ell(S.group(0), M.rust, add(c.sh[i], c.rotU([0.4, 0, 0.8])), [2.8, 2.6, 1.8], undefined, { part: S.newPart(), cut: { n: [0, 0, -1], d: 0.4 } });
  }
  // цепь крюка вокруг левого плеча
  const gc = S.group(0.2);
  const pc = S.newPart();
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    S.ball(gc, M.iron, up(lerpV([-4.2, 2.6, 16.8], [2.8, 3.6, 9.8], t)), 0.55, { part: pc });
  }
}
const hook = (): WeaponFn => (S, g, o) => {
  if (o.k < 0) return;
  const w = norm(g.dir);
  const side = norm([w[1], -w[0], 0.0001]);
  const m = o.elite ? M.iron : M.rust;
  const G = S.group(0.4);
  const p = S.newPart();
  const a = add(g.at, mul(w, 1.0)), b = add(g.at, mul(w, 5.6));
  S.cone(G, m, a, 0.9, b, 0.8, { piece: o.piece, part: p });
  S.cone(G, m, b, 0.8, add(b, add(mul(side, 2.8), mul(w, 0.8))), 0.75, { piece: o.piece, part: p });
  S.cone(G, m, add(b, add(mul(side, 2.8), mul(w, 0.8))), 0.75, add(b, add(mul(side, 3.6), mul(w, -2.2))), 0.2, { piece: o.piece, part: p });
  if (o.elite) for (const u of [2.0, 3.4]) S.cone(S.group(0), M.steel, add(g.at, mul(w, u)), 0.4, add(add(g.at, mul(w, u)), mul(side, -1.4)), 0.1, { piece: o.piece, part: S.newPart() });
  for (let k = 0; k < 3; k++) S.ball(S.group(0), M.iron, add(g.at, mul(w, -0.6 - k * 0.9)), 0.45, { piece: o.piece, part: S.newPart() });
};
export const butcher: Creature = {
  id: "butcher", ru: "Мясник", eliteRu: "Гнилостный",
  scale: [1.45, 1.5], big: true, widen: [1.12, 1.08], death: "back",
  dims: { pelvisZ: 7.6, hipX: 2.6, hipZ: 6.8, shX: 5.4, shZ: 16.2, arm: [4.0, 3.8], leg: [3.2, 3.0], headC: [0, 1.8, 19.6], footX: 2.8, hunch: 0.1, stride: 1.4 },
  roles: [
    { id: "cleaver", ru: "мясник с тесаком", kind: "slash", R: W.cleaver(6.0), reach: 7.5, fx: ROT },
    { id: "hook", ru: "мясник с крюком", kind: "throw", R: hook(), proj: { ramp: M.rust.ramp, r: 1.3 }, reach: 5, fx: ROT },
  ],
  ref: "barbarian",
  refFile: "ref3-chain-hook.png",
  build: butcherBuild,
};
export type { Mat };
