/**
 * Задача 140, партия 2: псовые на 4 лапах — один образ, роли через окрас и стихию (у зверя нет оружия):
 * серый волк (лесной волк из списка 2), шакал (Пустыня Миражей), ледяной волк (Грифоньи утёсы, Грозовой хребет),
 * лавовый пёс (Пылающий вулкан). Рост 0,95 / 1,0 (в холке ниже героя, длина — в кадр 32).
 * Усиленный «Матёрый»: крупнее, тёмный загривок дыбом, ошейник с шипами, шрам; у ледяного — ледяные шипы и
 * светлые глаза, у лавового — светящиеся трещины ярче и угли на хребте.
 * Атака — прыжок с укусом; гибель — заваливается на бок.
 */
import { M, R, add, face, furTex, glowMat, hex, hp, mat, spotTex, tail, type Creature, type Ctx } from "./rig";
import { drawLeg4, legsOf } from "./quad";

const FUR = {
  wolf: R("#18181a", "#36363a", "#58565a", "#807c78", "#aaa498"),
  jackal: R("#24170a", "#4e3418", "#7e5a2c", "#aa8246", "#d0aa6c"),
  frost: R("#1e2836", "#3e5068", "#6e86a0", "#a4bccc", "#e2eef4"),
  lava: R("#1e1410", "#3a2a22", "#56402e", "#74583e", "#927454"),
};
const FUR_E = {
  wolf: R("#0e0e10", "#242428", "#403e42", "#625e5c", "#8a8478"),
  jackal: R("#1c1008", "#402810", "#6a4620", "#946a36", "#bc925a"),
  frost: R("#141e2c", "#2e4058", "#587290", "#90aac0", "#d4e6f0"),
  lava: R("#1a120e", "#32241c", "#4c3828", "#684e36", "#86684a"),
};
const EMBER = R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0");
const ICE = R("#1a3a5a", "#3c6e9a", "#7ab0d8", "#bce0f4", "#f4fcff");
const M_EMBER = glowMat("угли", EMBER);
const M_ICE = mat("лёд", ICE, { base: 2.0, gain: 2.0 });
const M_ICEG = glowMat("свет льда", ICE, 2.4);
const M_NOSE = mat("нос", R("#0c0a0a", "#1c1818", "#2c2626", "#3e3634", "#524846"), { base: 1.6, gain: 2.2 });
const mats = Object.fromEntries(Object.entries(FUR).map(([k, r]) => [k, mat(`шерсть ${k}`, r, { base: 1.8, gain: 2.3 })]));
const matsE = Object.fromEntries(Object.entries(FUR_E).map(([k, r]) => [k, mat(`шерсть ${k}+`, r, { base: 1.8, gain: 2.3 })]));

function build(c: Ctx) {
  const { S, E, up } = c;
  const id = c.role.id as keyof typeof FUR;
  const fur = (E ? matsE : mats)[id];
  const lava = id === "lava", frost = id === "frost", jackal = id === "jackal";
  const tex = lava ? spotTex(E ? 0.16 : 0.1, 0, 61, M_EMBER) : furTex(51, 0.2);
  // туловище: грудь глубокая, поджарый зад
  const g = S.group(0.9);
  const pt = S.newPart();
  S.ell(g, fur, up([0, 2.8, 10.2]), [3.6, 3.8, 3.2], undefined, { part: pt, big: true, tex });
  S.ell(g, fur, up([0, -3.0, 10.4]), [2.8, 3.5, 2.5], undefined, { part: pt, big: true, tex });
  S.ell(g, fur, up([0, 0, 9.8]), [2.2, 3.0, 2.3], undefined, { part: pt, tex });
  // загривок (у матёрого — дыбом), шея
  S.ell(S.group(0.5), fur, up([0, 3.4, 12.4]), [3.6, 2.8, 2.2], undefined, { part: S.newPart(), tex: furTex(52, 0.3) });
  if (E || jackal) S.ell(S.group(0), (E ? matsE : mats)[id], up([0, -0.2, 12.0]), [1.0, 4.4, 1.0], undefined, { part: S.newPart(), tone: -1.0 });
  S.cone(S.group(0.6), fur, up([0, 4.6, 11.4]), 2.3, hp(c, [0, -1.0, -0.5]), 1.8, { part: S.newPart(), tex });
  // голова: череп, морда, челюсть, уши
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, fur, c.head, [2.8, 2.4, 2.3], undefined, { part: ph, big: true, tex });
  S.cone(gH, fur, hp(c, [0, 1.4, -0.5]), 1.35, hp(c, [0, jackal ? 4.8 : 4.5, -1.0]), 0.75, { part: ph });
  S.ball(S.group(0), M_NOSE, hp(c, [0, jackal ? 4.9 : 4.6, -0.8]), 0.55, { part: S.newPart() });
  const jaw = c.p.jaw;
  S.cone(S.group(0.3), fur, hp(c, [0, 1.2, -1.4]), 0.9, hp(c, [0, 3.8, -1.8 - jaw * 1.2]), 0.5, { part: S.newPart(), tone: -0.4 });
  if (jaw) S.cone(S.group(0), M.bone, hp(c, [0, 3.2, -1.3]), 0.35, hp(c, [0, 3.5, -1.9]), 0.2, { part: S.newPart() });
  const ear = jackal ? 1.5 : 1.0;
  for (const s of [1, -1]) S.cone(S.group(0.2), fur, hp(c, [1.2 * s, -0.4, 1.4]), 0.8 * ear, hp(c, [1.7 * s * ear, -0.7, 1.4 + 2.2 * ear]), 0.15, { part: S.newPart() });
  const eye = lava ? "G" : E && frost ? "G" : "e";
  const col = { e: hex(jackal ? "#e0a030" : "#e8c050"), G: lava ? EMBER[3] : ICE[3], k: hex("#0c0806") };
  face(c, { at: [0, 2.1, 0.7], colors: col, glow: ["G"], halo: lava ? EMBER[2] : ICE[2], down: [[`${eye}..${eye}`], -2, 0], side: [[eye], 0, 0], sideAt: [1.3, 1.6, 0.7] });
  // хвост
  tail(c, fur, [0, -6.0, 10.8], [[0, -1.6, -0.6], [0, -1.6, -1.2], [0, -1.2, -1.4]], [1.0, 1.3, 1.1, 0.5], furTex(53, 0.25));
  // лапы
  const legs = legsOf(c, [
    { x: 2.0, y: -4.2, z: 9.6, len: [4.8, 5.0], pole: [0, -1, 0.2], spread: 0.6 },
    { x: 2.2, y: 4.0, z: 9.4, len: [4.6, 5.0], pole: [0, -1, 0], spread: 0.6 },
  ]);
  for (const pair of legs) for (const L of pair) drawLeg4(c, L, fur, [1.6, 1.05, 0.8], { tex, pawR: 0.9, claws: lava ? M_EMBER : M.horn, clawN: 2 });
  // приметы роли и усиленного
  if (frost) {
    const n = E ? 5 : 3;
    for (let k = 0; k < n; k++) {
      const y = 4.0 - k * 2.2;
      S.cone(S.group(0), E ? M_ICEG : M_ICE, up([0, y, 12.4]), 0.75, up([0, y - 0.8, 14.4 + (k % 2) * 0.8]), 0.15, { part: S.newPart() });
    }
  }
  if (lava) for (let k = 0; k < (E ? 4 : 2); k++) S.ball(S.group(0), M_EMBER, up([0, 3.0 - k * 2.4, 12.6]), 0.55, { part: S.newPart() });
  if (E && !lava) {
    // ошейник с шипами
    S.ell(S.group(0), M.leather, up([0, 5.6, 12.0]), [2.2, 1.0, 2.1], undefined, { part: S.newPart() });
    for (const s of [1, -1]) S.cone(S.group(0), M.iron, up([2.0 * s, 5.6, 12.2]), 0.4, up([3.0 * s, 5.8, 12.6]), 0.12, { part: S.newPart() });
  }
}

export const canine: Creature = {
  id: "canine", ru: "Псовые", eliteRu: "Матёрый",
  scale: [1.0, 1.08],
  death: "roll",
  dims: { pelvisZ: 10, hipX: 1.6, hipZ: 9.6, shX: 1.8, shZ: 10.5, arm: [4, 4], leg: [4.8, 5.0], headC: [0, 7.8, 12.0], footX: 2.0, stride: 1.8 },
  roles: [
    { id: "wolf", ru: "серый волк", kind: "leap" },
    { id: "jackal", ru: "шакал", kind: "leap" },
    { id: "frost", ru: "ледяной волк", kind: "leap" },
    { id: "lava", ru: "лавовый пёс", kind: "leap", fx: EMBER },
  ],
  ref: "canine",
  build,
};
