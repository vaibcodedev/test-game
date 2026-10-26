/**
 * Задача 140, партия 2: гарпия (tools/out/refs/mobs/harpy/ref.png) — крылья вместо рук, хищная птичья голова с
 * хохлом и клювом, светлая грудь, пальцеходящие птичьи ноги с когтями. Рост 0,95 / 1,0.
 * Роли через когти и голос: падальщица (когти), крикунья (визг), грозовая (молнии).
 * Усиленная «Буревая»: тёмное оперение с отливом, костяные кольца на лапах, искры в крыльях.
 */
import { M, R, add, drawArm, drawLeg, face, flaps, furTex, glowMat, hex, hp, lamellarTex, lerpV, mat, mul, norm, spotTex, sub, type Creature, type Ctx } from "./rig";

const m5 = (name: string, ...cs: string[]) => mat(name, R(...cs), { base: 1.8, gain: 2.3 });
const STORM = R("#1a2a5a", "#2e56a8", "#5a9ae8", "#b0dcff", "#f4fcff");
const PLUME = m5("оперение", "#1e140c", "#3e2a1a", "#64462c", "#8a6844", "#b08e66");
const PLUME_E = m5("тёмное оперение", "#0c0c14", "#1e1e30", "#32324c", "#4a4a6e", "#6c6c96");
const PLUME_S = m5("грозовое оперение", "#141a22", "#2a3644", "#465668", "#687c90", "#90a6ba");
const PLUME_W = m5("пёстрое оперение", "#22160e", "#4a301c", "#76502e", "#a07446", "#c89c6a");
const CREST = m5("красный хохол", "#2a0a08", "#561410", "#8a221a", "#b8382a", "#dc5a46");
const CREAM = m5("светлое перо", "#2e2820", "#5a5040", "#8a7e66", "#b8ac90", "#e4dac0");
const TALON = m5("лапы", "#141010", "#2a221e", "#443830", "#5e4e42", "#7a6858");
const SONIC = R("#3a3020", "#7a6a48", "#c8b488", "#f0e6c8", "#ffffff");

function harpyBuild(c: Ctx) {
  const { S, E, up } = c;
  const pl = E ? PLUME_E : c.role.id === "storm" ? PLUME_S : c.role.id === "screamer" ? PLUME_W : PLUME;
  const feath = furTex(105, 0.25);
  const spark = E ? spotTex(0.08, 0, 106, glowMat("искры", STORM, 2.4)) : feath;
  const gT = S.group(0.7);
  const pt = S.newPart();
  S.ell(gT, pl, up([0, 0, 13.0]), [3.2, 2.2, 3.8], undefined, { part: pt, big: true, tex: feath });
  S.ell(S.group(0), CREAM, up([0, 1.0, 12.6]), [2.4, 1.5, 3.4], undefined, { part: S.newPart(), tex: lamellarTex });
  S.ell(gT, pl, c.pelvisC, [2.8, 2.1, 2.0], undefined, { part: pt, tex: feath });
  flaps(c, pl, [[0, -2.0, 3.4, 2.4], [-1.0, -1.8, 2.8, 1.2], [1.0, -1.8, 2.8, 1.2]], feath);
  // голова: хохол, клюв, глаза хищной птицы
  S.cone(S.group(0), pl, up([0, 0.2, 15.6]), 1.2, hp(c, [0, -0.2, -2.4]), 1.1, { part: S.newPart(), tex: feath });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, CREAM, c.head, [2.6, 2.8, 3.0], undefined, { part: ph, big: true });
  S.ell(S.group(0), pl, hp(c, [0, -0.6, 1.0]), [2.8, 2.9, 2.6], undefined, { part: S.newPart(), big: true, tex: feath, cut: { n: [0, 0.8, -0.6], d: 0.8 } });
  for (const [x, L] of [[0, 4.0], [1.0, 3.0], [-1.0, 3.0], [0.5, 3.6], [-0.5, 3.6]] as [number, number][]) S.cone(S.group(0), c.role.id === "screamer" ? CREST : pl, hp(c, [x, -0.8, 2.0]), 0.7, hp(c, [x * 1.6, -1.8 - L * 0.4, 2.0 + L]), 0.15, { part: S.newPart() });
  const jaw = c.p.jaw * 0.6;
  S.cone(S.group(0), M.horn, hp(c, [0, 2.4, -0.2]), 0.75, hp(c, [0, 4.0, -1.4 - jaw]), 0.2, { part: S.newPart() });
  face(c, { at: [0, 2.4, 0.7], colors: { e: hex("#e8a020"), k: hex("#0c0806") }, down: [["ke.ek"], -2, 0], side: [["ke"], -1, 0], sideAt: [1.6, 2.0, 0.7] });
  // крылья вместо рук: перья веером от плеча, локтя и кисти
  for (const i of [0, 1]) {
    const s = i ? -1 : 1;
    drawArm(c, i, { mat: pl, r: [1.3, 1.1, 0.9], tex: feath }, 0.9);
    const gw = S.group(0.3);
    const pw = S.newPart();
    const fl = c.p.flap;
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const a = t < 0.5 ? lerpV(c.sh[i], c.el[i], t * 2) : lerpV(c.el[i], c.hand[i], (t - 0.5) * 2);
      const L = 1.6 + t * 6.4;
      const dir = norm(add(c.rotU([1.1 * s * (0.6 + fl * 0.6), -0.6, -0.8]), mul(norm(sub(c.hand[i], c.sh[i])), 0.6)));
      S.cone(gw, t > 0.6 ? pl : CREAM, a, 1.0, add(a, mul(dir, L)), 0.25, { part: pw, tex: spark });
    }
    drawLeg(c, i, { mat: pl, r: [1.6, 1.2, 0.7], tex: feath }, { mat: TALON, r: [0.6, 0.55] });
    for (const k of [-1, 0, 1]) S.cone(S.group(0), M.horn, add(c.ankle[i], [k * 0.7, 0.4, -0.4]), 0.35, add(c.ankle[i], [k * 0.9, 1.8, -0.9]), 0.12, { part: S.newPart() });
    S.cone(S.group(0), TALON, c.ankle[i], 0.5, add(c.ankle[i], [0, 0.6, -0.6]), 0.4, { part: S.newPart() });
    if (E) S.cone(S.group(0), M.bone, lerpV(c.knee[i], c.ankle[i], 0.5), 0.75, lerpV(c.knee[i], c.ankle[i], 0.65), 0.75, { part: S.newPart() });
  }
}
export const harpy: Creature = {
  id: "harpy", ru: "Гарпия", eliteRu: "Буревая",
  scale: [0.95, 1.0], widen: [1.12, 1.08], death: "back",
  dims: { pelvisZ: 8.4, hipX: 1.8, hipZ: 7.8, shX: 4.0, shZ: 16.2, arm: [4.4, 4.4], leg: [3.6, 3.2], headC: [0, 1.0, 20.8], footX: 2.2, hunch: 0.08, digi: [1.2, 2.6] },
  roles: [
    { id: "scavenger", ru: "падальщица", kind: "claw" },
    { id: "screamer", ru: "крикунья", kind: "handcast", fx: SONIC },
    { id: "storm", ru: "грозовая", kind: "handcast", fx: STORM },
  ],
  build: harpyBuild,
};
