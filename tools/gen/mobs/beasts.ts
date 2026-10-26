/**
 * Задача 140, партия 2: звери второго списка (описания пользователя 2026-10-24) — каждый своим образом, роли через
 * окрас/стихию: дикий кабан, пещерная крыса, пещерная летучая мышь, гигантский паук (лесной, плюющийся), панцирный
 * жук, ящерицы (рогатая — ref clay_crawler, глиняный ползун, болотная саламандра), малый/песчаный василиск,
 * членистые (пещерный краб, скорпион, костяной скорпион), ноздреватый ползун (ref porous_crawler).
 * Усиленные — крупнее, темнее/ярче, с приметами (клыки, светящиеся глаза, наросты). Гибель — на бок (roll),
 * летучая мышь и паук — тоже. Кадр 32, рост в долях героя — в scale.
 */
import { M, R, add, face, furTex, glowMat, hex, hp, lerpV, mat, mul, norm, spotTex, sub, tail, type Creature, type Ctx, type Mat, type V3 } from "./rig";
import { attackReach, drawJointed, drawLeg4, legsOf } from "./quad";

const m5 = (name: string, ...cs: string[]) => mat(name, R(...cs), { base: 1.8, gain: 2.3 });
const EMBER = R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0");
const VENOM = R("#1a3a08", "#3a6a10", "#6aa420", "#a8d84a", "#e4ffa0");
const EYE_R = R("#4a0808", "#8a1010", "#d82a1a", "#ff7a4a", "#ffd8b0");
const EYE_Y = R("#5a4a08", "#a08a10", "#e8c82a", "#fff07a", "#fffce0");
const M_EMBER = glowMat("угли", EMBER);
const M_HOOF = m5("копыто", "#0e0a08", "#1e1612", "#30241c", "#443428", "#5a4636");
const M_PINK = m5("розовая кожа", "#3a1a1a", "#6a3632", "#9a5a50", "#c08074", "#deaa9a");

/** Глаза: пара пикселей спереди и один сбоку; glow — светятся. */
function eyes(c: Ctx, at: V3, sideAt: V3, col: string, glow = false, gap = 2, halo?: [number, number, number, number]) {
  const k = glow ? "G" : "e";
  face(c, { at, sideAt, colors: { e: hex(col), G: hex(col), k: hex("#0c0806") }, glow: ["G"], halo, down: [[k + ".".repeat(Math.max(0, gap - 1)) + k], -Math.floor(gap / 2), 0], side: [[k], 0, 0] });
}

// ---------------- кабан ----------------
const BOAR = m5("щетина", "#1a120c", "#36261a", "#544030", "#745a44", "#94785c");
const BOAR_E = m5("тёмная щетина", "#1e140e", "#34261c", "#4c3a2a", "#68503c", "#866a52");
function boarBuild(c: Ctx) {
  const { S, E, up } = c;
  const fur = E ? BOAR_E : BOAR;
  const tx = furTex(71, 0.22);
  const g = S.group(0.9);
  const pt = S.newPart();
  S.ell(g, fur, up([0, 1.6, 8.4]), [3.6, 4.2, 3.6], undefined, { part: pt, big: true, tex: tx });
  S.ell(g, fur, up([0, -3.0, 7.8]), [3.2, 3.6, 3.0], undefined, { part: pt, big: true, tex: tx });
  // гребень щетины по хребту
  for (let k = 0; k < (E ? 6 : 4); k++) S.cone(S.group(0), BOAR_E, up([0, 3.4 - k * 1.5, 11.4 - k * 0.35]), 0.7, up([0, 2.6 - k * 1.5, 13.0 - k * 0.4]), 0.2, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, fur, c.head, [2.6, 2.8, 2.6], undefined, { part: ph, big: true, tex: tx });
  S.cone(gH, fur, hp(c, [0, 1.4, -0.6]), 1.8, hp(c, [0, 4.0, -1.6]), 1.2, { part: ph });
  S.ell(S.group(0), M_PINK, hp(c, [0, 4.4, -1.6]), [1.1, 0.4, 0.9], undefined, { part: S.newPart(), tone: -0.3 });
  for (const s of [1, -1]) {
    const tk = E ? 1.5 : 1.0;
    S.cone(S.group(0), M.bone, hp(c, [1.0 * s, 3.2, -2.2]), 0.42 * tk, hp(c, [1.7 * s, 3.8 * tk, -0.4 + 0.6 * tk]), 0.12, { part: S.newPart() });
    if (E) S.cone(S.group(0), M.iron, hp(c, [1.15 * s, 3.3, -1.9]), 0.62, hp(c, [1.25 * s, 3.4, -1.6]), 0.62, { part: S.newPart() });
    S.cone(S.group(0.2), fur, hp(c, [1.6 * s, -0.6, 1.6]), 0.8, hp(c, [2.4 * s, -1.0, 2.6]), 0.2, { part: S.newPart() });
  }
  eyes(c, [0, 2.0, 0.6], [1.6, 1.6, 0.6], E ? "#e04a2a" : "#1a0e08", !!E, 3, EYE_R[2]);
  tail(c, fur, [0, -6.4, 9.0], [[0, -0.8, -0.8], [0.2, -0.4, -1.0]], [0.4, 0.3, 0.25]);
  const legs = legsOf(c, [
    { x: 2.2, y: -3.6, z: 6.8, len: [3.4, 3.6], pole: [0, -1, 0], spread: 0.2 },
    { x: 2.3, y: 3.4, z: 6.8, len: [3.4, 3.6], pole: [0, -1, 0], spread: 0.2 },
  ]);
  for (const pr of legs) for (const L of pr) drawLeg4(c, L, fur, [1.8, 1.1, 0.8], { tex: tx, pawR: 0.8, paw: M_HOOF });
  if (E) for (const s of [1, -1]) S.box(S.group(0), M.leather, up([1.4 * s, 2.0, 11.0]), [1.6, 2.4, 0.4], [norm([s, 0, 0.6]), [0, 1, 0], norm([-0.6 * s, 0, 1])], 0.2, { part: S.newPart() });
}
export const boar: Creature = {
  id: "boar", ru: "Дикий кабан", eliteRu: "Матёрый секач",
  scale: [1.0, 1.08], death: "roll",
  dims: { pelvisZ: 8, hipX: 2, hipZ: 7, shX: 2, shZ: 8, arm: [3, 3], leg: [3.4, 3.6], headC: [0, 6.4, 8.0], footX: 2.2, stride: 1.6 },
  roles: [{ id: "boar", ru: "дикий кабан", kind: "leap" }],
  build: boarBuild,
};

// ---------------- пещерная крыса ----------------
const RAT = m5("шерсть крысы", "#141210", "#2c2622", "#463c34", "#62564a", "#7e7262");
const RAT_E = m5("шерсть матёрой крысы", "#1c1612", "#30261e", "#46382c", "#5e4c3c", "#7a6450");
function ratBuild(c: Ctx) {
  const { S, E, up } = c;
  const fur = E ? RAT_E : RAT;
  const tx = furTex(73, 0.25);
  const g = S.group(0.9);
  const pt = S.newPart();
  S.ell(g, fur, up([0, -1.6, 6.4]), [3.0, 4.8, 3.2], undefined, { part: pt, big: true, tex: tx });
  S.ell(g, fur, up([0, 2.6, 6.6]), [2.4, 2.8, 2.4], undefined, { part: pt, big: true, tex: tx });
  if (E) for (let k = 0; k < 4; k++) S.cone(S.group(0), M.bone, up([0, 1.6 - k * 2.0, 9.0 - Math.abs(k - 1.5) * 0.3]), 0.55, up([0, 1.0 - k * 2.0, 10.8]), 0.15, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, fur, c.head, [2.0, 2.4, 1.9], undefined, { part: ph, big: true, tex: tx });
  S.cone(gH, fur, hp(c, [0, 1.2, -0.4]), 1.3, hp(c, [0, 4.0, -1.0]), 0.45, { part: ph });
  S.ball(S.group(0), M_PINK, hp(c, [0, 4.1, -0.9]), 0.5, { part: S.newPart() });
  if (c.p.jaw) S.cone(S.group(0), M.bone, hp(c, [0, 3.4, -1.2]), 0.45, hp(c, [0, 3.6, -2.2]), 0.3, { part: S.newPart() });
  for (const s of [1, -1]) {
    S.ell(S.group(0.2), M_PINK, hp(c, [1.6 * s, -0.4, 1.6]), [1.2, 0.4, 1.3], undefined, { part: S.newPart() });
    S.ell(S.group(0), fur, hp(c, [1.62 * s, -0.55, 1.6]), [1.35, 0.4, 1.45], undefined, { part: S.newPart() });
  }
  eyes(c, [0, 1.9, 0.6], [1.3, 1.5, 0.6], E ? "#e03a1a" : "#e05030", true, 3, EYE_R[2]);
  tail(c, M_PINK, [0, -6.2, 6.4], [[0.4, -2.0, -1.6], [1.0, -2.4, -1.2], [1.4, -2.2, -0.4], [1.2, -1.6, 0.2]], [0.7, 0.55, 0.45, 0.35, 0.25]);
  const legs = legsOf(c, [
    { x: 2.0, y: -3.6, z: 5.6, len: [2.8, 3.0], pole: [0, 1, 0], spread: 0.6 },
    { x: 1.8, y: 3.0, z: 5.6, len: [2.8, 3.0], pole: [0, -1, 0], spread: 0.5 },
  ]);
  for (const pr of legs) for (const L of pr) drawLeg4(c, L, fur, [1.3, 0.75, 0.55], { tex: tx, pawR: 0.6, paw: M_PINK, claws: M.horn, clawN: 2 });
}
export const rat: Creature = {
  id: "rat", ru: "Пещерная крыса", eliteRu: "Матёрая",
  scale: [0.88, 0.95], death: "roll",
  dims: { pelvisZ: 6.4, hipX: 2, hipZ: 6, shX: 1.8, shZ: 6.6, arm: [2.5, 2.5], leg: [2.8, 3.0], headC: [0, 5.8, 7.2], footX: 2.0, stride: 1.6 },
  roles: [{ id: "rat", ru: "пещерная крыса", kind: "leap" }],
  build: ratBuild,
};

// ---------------- летучая мышь ----------------
const BAT = m5("шерсть мыши", "#141012", "#2a2226", "#40343a", "#584850", "#726068");
const WING = m5("перепонка", "#100a0c", "#22161a", "#38262a", "#50363a", "#6a4a4c");
const WING_E = m5("красная перепонка", "#1a0606", "#3a0e0e", "#5e1a18", "#842a24", "#a8423a");
function membrane(c: Ctx, g: number, m: Mat, a: V3, b: V3, d: V3, part: number) {
  const mid = mul(add(a, b), 0.5);
  const X = norm(sub(b, a));
  const h = sub(d, mid);
  const hx = h[0] * X[0] + h[1] * X[1] + h[2] * X[2];
  const Zr = sub(h, mul(X, hx));
  const hl = Math.hypot(...Zr) || 1;
  const Z = mul(Zr, 1 / hl);
  const Y: V3 = [X[1] * Z[2] - X[2] * Z[1], X[2] * Z[0] - X[0] * Z[2], X[0] * Z[1] - X[1] * Z[0]];
  const L = Math.hypot(...sub(b, a));
  c.S.ell(g, m, add(mid, mul(Z, hl * 0.42)), [L * 0.5, 0.4, hl * 0.55], [X, Y, Z], { part, big: true });
}
function batBuild(c: Ctx) {
  const { S, E, up } = c;
  const fl = c.p.flap;
  const hover = 1.2 * Math.sin(fl * Math.PI);
  const U = (q: V3) => up(add(q, [0, 0, hover]));
  const g = S.group(0.9);
  const pt = S.newPart();
  S.ell(g, BAT, U([0, 0, 12.6]), [2.6, 2.4, 3.2], undefined, { part: pt, big: true, tex: furTex(75, 0.3) });
  S.ell(g, BAT, U([0, 0, 10.0]), [1.7, 1.5, 1.6], undefined, { part: pt });
  const h = U([0, 0.8, 16.4]);
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, BAT, h, [2.1, 1.9, 1.8], undefined, { part: ph, big: true, tex: furTex(76, 0.3) });
  S.cone(gH, BAT, add(h, [0, 1.4, -0.4]), 0.9, add(h, [0, 2.6, -0.6]), 0.5, { part: ph });
  S.ball(S.group(0), M_PINK, add(h, [0, 2.7, -0.5]), 0.45, { part: S.newPart() });
  for (const s of [1, -1]) {
    S.cone(S.group(0.2), WING, add(h, [1.2 * s, 0, 1.0]), 1.0, add(h, [2.6 * s, -0.4, 3.8 + (E ? 0.6 : 0)]), 0.2, { part: S.newPart() });
    // крыло: плечо, локоть, кончик и два пальца
    const P = (q: V3): V3 => U([q[0] * s, q[1], q[2]]);
    const a0 = P([1.8, -0.4, 13.6]);
    const el = P([5.0, -0.8, 15.0 + 2.6 * (fl - 0.5)]);
    const tp = P([9.2, -1.0, 15.6 + 4.6 * (fl - 0.5)]);
    const f1 = P([8.6, -1.0, 11.0 + 2.6 * (fl - 0.5)]);
    const f2 = P([5.6, -0.8, 9.6 + 1.2 * (fl - 0.5)]);
    const gw = S.group(0.25);
    const pw = S.newPart();
    S.cone(gw, BAT, a0, 0.7, el, 0.55, { part: pw });
    S.cone(gw, BAT, el, 0.5, tp, 0.3, { part: pw });
    S.cone(gw, BAT, el, 0.4, f1, 0.25, { part: pw });
    S.cone(gw, BAT, el, 0.4, f2, 0.25, { part: pw });
    S.cone(S.group(0), M.horn, el, 0.4, add(el, [0, 0, 1.0]), 0.12, { part: S.newPart() });
    const gm = S.group(0.3);
    const pm = S.newPart();
    for (const [a, b, d] of [[el, tp, f1], [el, f1, f2], [a0, el, f2]] as [V3, V3, V3][]) membrane(c, gm, E ? WING_E : WING, a, b, d, pm);
    // лапки
    S.cone(S.group(0), BAT, U([0.8 * s, -0.4, 9.4]), 0.5, U([0.9 * s, -0.6, 7.6]), 0.35, { part: S.newPart() });
  }
  eyes(c, [0, 2.0, 0.3], [1.2, 1.6, 0.3], E ? "#ff5030" : "#e0a020", true, 3, EYE_R[2]);
  if (c.p.jaw) S.cone(S.group(0), M.bone, add(h, [0.5, 2.4, -1.1]), 0.3, add(h, [0.5, 2.4, -1.8]), 0.15, { part: S.newPart() });
}
export const bat: Creature = {
  id: "bat", ru: "Пещерная летучая мышь", eliteRu: "Кровавая",
  scale: [0.9, 1.0], death: "roll",
  dims: { pelvisZ: 11, hipX: 1, hipZ: 10, shX: 1.8, shZ: 13, arm: [3, 3], leg: [2, 2], headC: [0, 0.8, 16.4], footX: 1, stride: 0.6 },
  roles: [{ id: "bat", ru: "летучая мышь", kind: "leap" }],
  build: batBuild,
};

// ---------------- гигантский паук ----------------
const SPID = m5("хитин паука", "#1a1412", "#30241e", "#4a382c", "#64503c", "#826a50");
const SPID_E = m5("хитин матёрого паука", "#22161c", "#38242e", "#523442", "#6e4658", "#8e5c72");
const SPOT = m5("метки", "#3a1a08", "#6a3010", "#9a5018", "#c8782a", "#e8a048");
function spiderBuild(c: Ctx) {
  const { S, E, up } = c;
  const ch = E ? SPID_E : SPID;
  const venom = c.role.id === "spitter";
  const g = S.group(0.7);
  const pt = S.newPart();
  const abd = up([0, -4.4, 6.6]);
  S.ell(g, ch, abd, [3.6, 4.2, 3.4], undefined, { part: pt, big: true, tex: furTex(77, 0.18) });
  S.ell(g, ch, up([0, 1.2, 5.0]), [2.6, 2.8, 1.9], undefined, { part: pt, big: true });
  // метки на брюшке
  const mk = venom ? mat("ядовитые метки", VENOM, { base: 1.8, gain: 2.0 }) : SPOT;
  S.ell(S.group(0), E ? glowMat("светящиеся метки", venom ? VENOM : EMBER, 2.2) : mk, add(abd, [0, -0.6, 3.2]), [1.0, 2.2, 0.5], undefined, { part: S.newPart() });
  for (const s of [1, -1]) S.ell(S.group(0), mk, add(abd, [1.6 * s, -1.4, 2.6]), [0.6, 0.9, 0.5], undefined, { part: S.newPart() });
  // голова, хелицеры
  const gH = S.group(0.5);
  const ph = S.newPart();
  S.ell(gH, ch, c.head, [1.8, 1.7, 1.5], undefined, { part: ph, big: true });
  const j = c.p.jaw * 0.6;
  for (const s of [1, -1]) S.cone(S.group(0), M.horn, hp(c, [(0.7 + j) * s, 1.4, -0.6]), 0.55, hp(c, [(0.4 + j * 0.5) * s, 2.4, -2.0]), 0.15, { part: S.newPart() });
  face(c, { at: [0, 1.5, 0.5], sideAt: [0.8, 1.3, 0.6], colors: { G: venom ? VENOM[3] : EYE_R[3], g: venom ? VENOM[2] : EYE_R[2] }, glow: ["G", "g"], halo: venom ? VENOM[1] : EYE_R[1], down: [["g.G.G.g", ".g...g."], -3, -1], side: [["Gg"], 0, 0] });
  // восемь лап
  const legs = legsOf(c, [
    { x: 1.8, y: 2.4, z: 5.4, len: [4, 4], pole: [0, 0, 1], spread: 5.2, py: 6.0 },
    { x: 2.2, y: 1.4, z: 5.4, len: [4, 4], pole: [0, 0, 1], spread: 6.4, py: 2.4 },
    { x: 2.2, y: 0.4, z: 5.4, len: [4, 4], pole: [0, 0, 1], spread: 6.4, py: -1.4 },
    { x: 1.8, y: -0.6, z: 5.4, len: [4, 4], pole: [0, 0, 1], spread: 5.4, py: -5.0 },
  ], 0.3);
  legs.forEach((pr) => pr.forEach((L) => drawJointed(c, L.top, L.paw, ch, 0.85, 5.0, furTex(78, 0.2))));
}
export const spider: Creature = {
  id: "spider", ru: "Гигантский паук", eliteRu: "Матёрый",
  scale: [1.05, 1.15], death: "roll",
  dims: { pelvisZ: 5.6, hipX: 1.5, hipZ: 5, shX: 1.5, shZ: 6.4, arm: [2, 2], leg: [3, 3], headC: [0, 4.4, 5.6], footX: 1.8, stride: 1.4 },
  roles: [
    { id: "biter", ru: "паук-охотник", kind: "leap" },
    { id: "spitter", ru: "паук-плевун", kind: "throw", R: () => {}, proj: { ramp: VENOM, r: 1.0 }, reach: 1, fx: VENOM },
  ],
  build: spiderBuild,
};

// ---------------- панцирный жук ----------------
const SHELL = m5("надкрылья", "#0c1008", "#1a2412", "#2c3a1e", "#44562e", "#647a42");
const SHELL_E = m5("бронзовые надкрылья", "#1a0e06", "#3a2210", "#5e3a1a", "#8a5a28", "#c08a40");
const BEET = m5("хитин жука", "#161210", "#2a2420", "#40362e", "#584a40", "#726254");
function beetleBuild(c: Ctx) {
  const { S, E, up } = c;
  const sh = E ? SHELL_E : SHELL;
  const g = S.group(0.4);
  const pt = S.newPart();
  S.ell(g, BEET, up([0, -0.6, 4.6]), [3.2, 4.6, 1.8], undefined, { part: pt, big: true });
  for (const s of [1, -1]) S.ell(S.group(0), sh, up([1.65 * s, -1.4, 6.0]), [1.9, 4.4, 2.8], undefined, { part: S.newPart(), big: true, cut: { n: [0, 0, -1], d: 0.6 } });
  S.ell(S.group(0.4), BEET, up([0, 3.4, 5.4]), [2.6, 1.8, 1.9], undefined, { part: S.newPart(), big: true });
  const gH = S.group(0.4);
  const ph = S.newPart();
  S.ell(gH, BEET, c.head, [1.7, 1.6, 1.4], undefined, { part: ph, big: true });
  const hornL = E ? 4.6 : 3.2;
  S.cone(gH, sh, hp(c, [0, 1.2, 0.2]), 0.8, hp(c, [0, 1.4 + hornL * 0.5, hornL]), 0.2, { part: ph });
  const j = c.p.jaw * 0.6;
  for (const s of [1, -1]) S.cone(S.group(0), M.horn, hp(c, [(0.9 + j) * s, 1.2, -0.6]), 0.4, hp(c, [(0.3) * s, 2.4, -0.8]), 0.15, { part: S.newPart() });
  eyes(c, [0, 1.4, 0.2], [1.2, 1.0, 0.2], E ? "#ffc040" : "#d8c890", !!E, 3, EYE_Y[2]);
  const legs = legsOf(c, [
    { x: 2.2, y: 3.0, z: 4.2, len: [3, 3], pole: [0, 0, 1], spread: 2.6, py: 4.6 },
    { x: 2.6, y: 0.6, z: 4.0, len: [3, 3], pole: [0, 0, 1], spread: 2.8, py: 0.4 },
    { x: 2.4, y: -1.8, z: 4.0, len: [3, 3], pole: [0, 0, 1], spread: 2.6, py: -3.6 },
  ], 0.3);
  legs.forEach((pr) => pr.forEach((L) => drawJointed(c, L.top, L.paw, BEET, 0.8, 2.4)));
}
export const beetle: Creature = {
  id: "beetle", ru: "Панцирный жук", eliteRu: "Бронзовый",
  scale: [1.0, 1.1], death: "roll",
  dims: { pelvisZ: 4.6, hipX: 1.5, hipZ: 4, shX: 1.5, shZ: 5, arm: [2, 2], leg: [3, 3], headC: [0, 5.4, 5.2], footX: 2, stride: 1.2 },
  roles: [{ id: "armored", ru: "панцирный жук", kind: "leap" }],
  build: beetleBuild,
};

// ---------------- ящерицы ----------------
const LIZ = {
  horned: m5("песчаная чешуя", "#24180c", "#4c3418", "#7a5626", "#a67a3a", "#cca25a"),
  clay: m5("глина", "#24140c", "#4a2a18", "#6e4026", "#935a36", "#b8784a"),
  salamander: m5("кожа саламандры", "#16120e", "#2a241c", "#40362a", "#584a3a", "#74624c"),
};
const LIZ_E = {
  horned: m5("тёмная песчаная чешуя", "#1c1008", "#3e2610", "#62401c", "#8a5e2c", "#b08444"),
  clay: m5("обожжённая глина", "#1a0c08", "#3a1c10", "#5a2e1a", "#7e4226", "#a05a34"),
  salamander: m5("тёмная кожа саламандры", "#1a1410", "#2e241c", "#42362a", "#5a4a38", "#76624c"),
};
const SAL_SPOT = m5("пятна саламандры", "#3a1404", "#6a2808", "#a44a10", "#d8761e", "#f4a440");
function lizardBuild(c: Ctx) {
  const { S, E, up } = c;
  const id = c.role.id as keyof typeof LIZ;
  const sk = (E ? LIZ_E : LIZ)[id];
  const tx = id === "salamander" ? spotTex(0.16, 0, 81, E ? glowMat("светящиеся пятна", EMBER, 2.2) : SAL_SPOT) : id === "clay" ? spotTex(0.12, -0.7, 82) : spotTex(0.1, -0.5, 83);
  const g = S.group(0.8);
  const pt = S.newPart();
  S.ell(g, sk, up([0, 0.4, 4.0]), [2.6, 5.0, 1.9], undefined, { part: pt, big: true, tex: tx });
  S.cone(g, sk, up([0, 3.6, 4.4]), 1.7, hp(c, [0, -0.8, -0.2]), 1.3, { part: pt, tex: tx });
  const gH = S.group(0.5);
  const ph = S.newPart();
  S.ell(gH, sk, c.head, [1.8, 2.6, 1.3], undefined, { part: ph, big: true, tex: tx });
  if (c.p.jaw) S.cone(S.group(0), sk, hp(c, [0, 0.4, -0.9]), 0.9, hp(c, [0, 2.4, -1.8]), 0.5, { part: S.newPart(), tone: -0.4 });
  if (id !== "salamander") {
    // рога-шипы назад веером, гребень шипов по спине
    for (const [x, z, L] of [[1.2, 0.6, 2.2], [-1.2, 0.6, 2.2], [0.6, 0.9, 1.6], [-0.6, 0.9, 1.6]] as [number, number, number][]) S.cone(S.group(0), id === "clay" ? sk : M.horn, hp(c, [x, -1.0, z]), 0.45, hp(c, [x * 1.6, -1.0 - L, z + L * 0.5 + (E ? 0.6 : 0)]), 0.12, { part: S.newPart() });
    for (let k = 0; k < (E ? 5 : 4); k++) S.cone(S.group(0), id === "clay" ? sk : M.horn, up([0, 2.6 - k * 1.8, 5.6]), 0.45, up([0, 2.0 - k * 1.8, 6.8]), 0.12, { part: S.newPart() });
  } else {
    for (const s of [1, -1]) S.cone(S.group(0.2), sk, hp(c, [1.3 * s, -1.4, 0.2]), 0.5, hp(c, [2.4 * s, -1.6, 0.4]), 0.2, { part: S.newPart() });
  }
  eyes(c, [0, 1.6, 0.6], [1.3, 1.2, 0.6], E ? "#ffb030" : "#e8c040", !!E, 3, EYE_Y[2]);
  tail(c, sk, [0, -4.4, 4.0], [[0.4, -2.6, -1.2], [1.0, -2.6, -0.6], [1.2, -2.2, -0.2]], [1.5, 1.1, 0.7, 0.3], tx);
  const legs = legsOf(c, [
    { x: 2.0, y: -2.6, z: 4.0, len: [2.6, 2.8], pole: [0, 0, 1], spread: 2.2 },
    { x: 2.0, y: 2.6, z: 4.0, len: [2.6, 2.8], pole: [0, 0, 1], spread: 2.2 },
  ], 0.5);
  for (const pr of legs) for (const L of pr) drawLeg4(c, L, sk, [1.0, 0.75, 0.6], { tex: tx, pawR: 0.6, claws: M.horn, clawN: 3 });
}
export const lizard: Creature = {
  id: "lizard", ru: "Ящерицы", eliteRu: "Древняя",
  scale: [1.05, 1.12], death: "roll",
  dims: { pelvisZ: 4.2, hipX: 2, hipZ: 4, shX: 2, shZ: 4.6, arm: [2, 2], leg: [2.6, 2.8], headC: [0, 7.4, 5.4], footX: 2, stride: 1.4 },
  roles: [
    { id: "horned", ru: "рогатая ящерица", kind: "leap" },
    { id: "clay", ru: "глиняный ползун", kind: "leap" },
    { id: "salamander", ru: "болотная саламандра", kind: "leap", fx: EMBER },
  ],
  ref: "clay_crawler",
  build: lizardBuild,
};

// ---------------- василиск ----------------
const BAS = { cave: m5("чешуя василиска", "#0e1410", "#1e2a20", "#304432", "#466048", "#628062"), sand: m5("песчаная чешуя василиска", "#24180c", "#4a3218", "#745228", "#9e763c", "#c49c58") };
const BAS_E = { cave: m5("тёмная чешуя василиска", "#141c16", "#223024", "#324634", "#46604a", "#5e7e62"), sand: m5("тёмная песчаная чешуя", "#1c1208", "#3a2610", "#5c3e1c", "#82582c", "#a87a40") };
const CREST = m5("гребень", "#2a0a0a", "#561616", "#86281e", "#b4402c", "#d8644a");
function basiliskBuild(c: Ctx) {
  const { S, E, up } = c;
  const id = c.role.id as keyof typeof BAS;
  const sk = (E ? BAS_E : BAS)[id];
  const tx = spotTex(0.12, -0.6, 85);
  const g = S.group(0.8);
  const pt = S.newPart();
  S.ell(g, sk, up([0, 0, 5.4]), [3.2, 5.8, 2.6], undefined, { part: pt, big: true, tex: tx });
  S.cone(g, sk, up([0, 4.4, 6.0]), 2.2, hp(c, [0, -1.0, -0.4]), 1.6, { part: pt, tex: tx });
  const gH = S.group(0.5);
  const ph = S.newPart();
  S.ell(gH, sk, c.head, [2.1, 2.8, 1.6], undefined, { part: ph, big: true, tex: tx });
  if (c.p.jaw) S.cone(S.group(0), sk, hp(c, [0, 0.6, -1.1]), 1.0, hp(c, [0, 2.6, -2.1]), 0.6, { part: S.newPart(), tone: -0.4 });
  // гребень-корона и спинной гребень
  for (const [x, L] of [[0, 3.0], [0.9, 2.2], [-0.9, 2.2]] as [number, number][]) S.cone(S.group(0), CREST, hp(c, [x, -0.6, 1.2]), 0.55, hp(c, [x * 1.4, -1.6, 1.2 + L + (E ? 0.8 : 0)]), 0.15, { part: S.newPart() });
  for (let k = 0; k < 6; k++) S.cone(S.group(0), CREST, up([0, 3.6 - k * 1.7, 7.6]), 0.5, up([0, 3.0 - k * 1.7, 9.0 + (k % 2) * 0.6]), 0.15, { part: S.newPart() });
  eyes(c, [0, 1.8, 0.6], [1.5, 1.3, 0.6], E ? "#a0ff60" : "#e8d040", true, 3, E ? VENOM[2] : EYE_Y[2]);
  tail(c, sk, [0, -5.4, 5.2], [[0.6, -2.0, -1.6], [1.6, -1.8, -1.2], [2.0, -1.2, -0.6]], [1.8, 1.3, 0.8, 0.3], tx);
  const legs = legsOf(c, [
    { x: 2.4, y: -3.6, z: 5.0, len: [3.0, 3.2], pole: [0, 0, 1], spread: 2.0 },
    { x: 2.6, y: 0.2, z: 5.0, len: [3.0, 3.2], pole: [0, 0, 1], spread: 2.2 },
    { x: 2.4, y: 3.6, z: 5.0, len: [3.0, 3.2], pole: [0, 0, 1], spread: 2.0 },
  ], 0.5);
  for (const pr of legs) for (const L of pr) drawLeg4(c, L, sk, [1.2, 0.85, 0.7], { tex: tx, pawR: 0.7, claws: M.horn, clawN: 3 });
}
export const basilisk: Creature = {
  id: "basilisk", ru: "Василиск", eliteRu: "Древний",
  scale: [1.1, 1.2], death: "roll",
  dims: { pelvisZ: 5.4, hipX: 2, hipZ: 5, shX: 2, shZ: 6, arm: [2, 2], leg: [3, 3.2], headC: [0, 8.6, 7.0], footX: 2.4, stride: 1.3 },
  roles: [
    { id: "cave", ru: "малый василиск", kind: "leap" },
    { id: "sand", ru: "песчаный василиск", kind: "leap" },
  ],
  build: basiliskBuild,
};

// ---------------- членистые: краб, скорпион, костяной скорпион ----------------
const ARTH = {
  crab: m5("панцирь краба", "#2a0e08", "#561e12", "#86321c", "#b0502c", "#d27648"),
  scorpion: m5("хитин скорпиона", "#1e140a", "#3e2a14", "#62441e", "#88622e", "#ae8644"),
  bone: mat("кость", M.bone.ramp, { base: 1.85, gain: 2.3 }),
};
const ARTH_E = {
  crab: m5("тёмный панцирь краба", "#1e0806", "#40140c", "#682616", "#8e3c22", "#b45a36"),
  scorpion: m5("чёрный хитин", "#1a1410", "#2e241c", "#42342a", "#5a4838", "#76604a"),
  bone: m5("тёмная кость", "#2a1e12", "#54402a", "#7e6642", "#a88c5e", "#ccb07c"),
};
function arthroBuild(c: Ctx, cr: Creature) {
  const { S, E, up } = c;
  const id = c.role.id as keyof typeof ARTH;
  const sh = (E ? ARTH_E : ARTH)[id];
  const crab = id === "crab";
  const g = S.group(0.5);
  const pt = S.newPart();
  if (crab) S.ell(g, sh, up([0, 0, 5.0]), [4.4, 3.2, 2.0], undefined, { part: pt, big: true, tex: spotTex(0.1, -0.6, 87) });
  else {
    S.ell(g, sh, up([0, 1.0, 4.4]), [2.6, 3.2, 1.6], undefined, { part: pt, big: true });
    S.ell(g, sh, up([0, -2.6, 4.2]), [2.2, 2.4, 1.4], undefined, { part: pt });
  }
  if (E && crab) for (const [x, y] of [[-1.6, 0.4], [1.4, -0.8], [0.2, 1.2]] as [number, number][]) S.ball(S.group(0), M.bone, up([x, y, 6.8]), 0.8, { part: S.newPart() });
  // клешни: от «плеч» вперёд, ход — от поз кистей атаки
  const rch = attackReach(c, cr);
  for (const s of [1, -1]) {
    const sw = mul(s > 0 ? rch : [-rch[0], rch[1], rch[2]], 0.45);
    const base = up([(crab ? 3.6 : 2.0) * s, crab ? 2.2 : 3.6, 4.6]);
    const elb = add(up([(crab ? 5.2 : 3.4) * s, crab ? 4.0 : 5.4, 5.6]), mul(sw, 0.5));
    const pin = add(up([(crab ? 3.6 : 2.4) * s, crab ? 6.4 : 7.6, 5.4]), sw);
    const gc = S.group(0.4);
    const pc = S.newPart();
    S.cone(gc, sh, base, 1.0, elb, 0.95, { part: pc });
    S.cone(gc, sh, elb, 1.0, pin, 1.2, { part: pc });
    const big = (E ? 1.3 : 1.1) * (crab ? 1.3 : 1.0);
    S.ell(gc, sh, pin, [1.2 * big, 1.6 * big, 1.0 * big], undefined, { part: pc });
    const op = c.p.jaw * 0.5;
    S.cone(S.group(0), sh, add(pin, [0.4 * s, 1.0 * big, 0.3]), 0.6 * big, add(pin, [(0.1 + op) * s, 2.8 * big, 0.6 + op]), 0.15, { part: S.newPart() });
    S.cone(S.group(0), sh, add(pin, [-0.4 * s, 1.0 * big, -0.2]), 0.5 * big, add(pin, [(-0.6 - op) * s, 2.4 * big, -0.2 - op]), 0.15, { part: S.newPart() });
  }
  if (!crab) {
    // хвост дугой над спиной, жало
    const segs: V3[] = [[0, -5.0, 5.0], [0, -6.6, 7.4], [0, -6.4, 10.0], [0, -4.8, 12.0], [0, -2.6, 12.6]];
    const lift = c.p.jaw * 1.2;
    const pts = segs.map((q, k) => up(add(q, [0, k * 0.3 * lift, k * 0.2 * lift])));
    const gt = S.group(0.5);
    const ptt = S.newPart();
    for (let k = 0; k + 1 < pts.length; k++) S.cone(gt, sh, pts[k], 1.2 - k * 0.12, pts[k + 1], 1.1 - k * 0.12, { part: ptt });
    const tipM = id === "bone" && E ? glowMat("жало", VENOM, 2.4) : id === "bone" ? M.horn : E ? glowMat("жало", VENOM, 2.4) : M.horn;
    S.cone(S.group(0), tipM, pts[pts.length - 1], 0.8, add(pts[pts.length - 1], c.rotU([0, 1.6, -1.8])), 0.15, { part: S.newPart() });
  }
  eyes(c, [0, crab ? 3.2 : 1.6, crab ? 0.6 : 0.4], [1.0, 1.2, 0.4], id === "bone" ? "#a0ff70" : E ? "#ff6030" : "#101010", id === "bone" || E, 3, id === "bone" ? VENOM[2] : EYE_R[2]);
  if (crab) for (const s of [1, -1]) S.cone(S.group(0), sh, hp(c, [0.8 * s, 2.4, 0.2]), 0.3, hp(c, [1.0 * s, 2.6, 1.6]), 0.3, { part: S.newPart() });
  const legs = legsOf(c, [
    { x: crab ? 3.2 : 2.0, y: 1.0, z: 4.4, len: [3, 3], pole: [0, 0, 1], spread: 3.2, py: 1.8 },
    { x: crab ? 3.4 : 2.2, y: -0.4, z: 4.4, len: [3, 3], pole: [0, 0, 1], spread: 3.4, py: -0.8 },
    { x: crab ? 3.2 : 2.0, y: -1.6, z: 4.4, len: [3, 3], pole: [0, 0, 1], spread: 3.0, py: -3.2 },
  ], 0.3);
  legs.forEach((pr) => pr.forEach((L) => drawJointed(c, L.top, L.paw, sh, 0.72, 2.8)));
}
export const arthro: Creature = {
  id: "arthro", ru: "Членистые", eliteRu: "Матёрый",
  scale: [1.05, 1.15], death: "roll",
  dims: { pelvisZ: 4.6, hipX: 1.5, hipZ: 4, shX: 2.6, shZ: 7, arm: [2.6, 2.6], leg: [3, 3], headC: [0, 3.6, 5.2], footX: 2, stride: 1.2 },
  roles: [
    { id: "crab", ru: "пещерный краб", kind: "claw" },
    { id: "scorpion", ru: "скорпион", kind: "claw" },
    { id: "bone", ru: "костяной скорпион", kind: "claw" },
  ],
  build: (c) => arthroBuild(c, arthro),
};

// ---------------- ноздреватый ползун ----------------
const POR = m5("ноздреватая шкура", "#2a2216", "#54462e", "#827050", "#ae9a76", "#d4c4a0");
const POR_E = m5("замшелая шкура", "#1e2212", "#3e4626", "#646e3e", "#8a965a", "#b0ba7e");
const PIT = m5("поры", "#120a06", "#2a160c", "#4a2812", "#6a3c1a", "#8a5226");
function crawlerBuild(c: Ctx) {
  const { S, E, up } = c;
  const sk = E ? POR_E : POR;
  const tx = spotTex(0.2, 0, 89, E ? glowMat("тлеющие поры", EMBER, 2.0) : PIT);
  const g = S.group(0.9);
  const pt = S.newPart();
  S.ell(g, sk, up([0, -0.6, 7.0]), [4.4, 5.2, 3.8], undefined, { part: pt, big: true, tex: tx });
  S.ell(g, sk, c.head, [3.2, 2.4, 2.4], undefined, { part: pt, big: true, tex: tx });
  // пасть с клыками
  const j = c.p.jaw;
  S.ell(S.group(0), PIT, hp(c, [0, 2.0, -0.9 - j * 0.3]), [2.2, 0.5, 0.4 + j * 0.5], undefined, { part: S.newPart() });
  for (let k = -2; k <= 2; k++) S.cone(S.group(0), M.bone, hp(c, [k * 0.8, 2.2, -0.4]), 0.3, hp(c, [k * 0.8, 2.4, -1.3 - j * 0.4]), 0.08, { part: S.newPart() });
  eyes(c, [0, 2.0, 0.6], [2.2, 1.4, 0.6], "#e06020", true, 4, EYE_R[2]);
  const legs = legsOf(c, [
    { x: 3.2, y: -3.6, z: 5.6, len: [3.0, 3.2], pole: [0, -0.5, 1], spread: 1.4 },
    { x: 3.2, y: 2.6, z: 5.6, len: [3.0, 3.2], pole: [0, -0.5, 1], spread: 1.4 },
  ], 0.6);
  for (const pr of legs) for (const L of pr) drawLeg4(c, L, sk, [1.9, 1.4, 1.1], { tex: tx, pawR: 1.1, claws: M.horn, clawN: 3 });
  void lerpV;
}
export const crawler: Creature = {
  id: "crawler", ru: "Ноздреватый ползун", eliteRu: "Замшелый",
  scale: [1.05, 1.12], death: "roll",
  dims: { pelvisZ: 7, hipX: 3, hipZ: 6, shX: 3, shZ: 7, arm: [3, 3], leg: [3, 3.2], headC: [0, 4.8, 7.0], footX: 3.2, stride: 1.3 },
  roles: [{ id: "crawler", ru: "ноздреватый ползун", kind: "leap" }],
  ref: "porous_crawler",
  build: crawlerBuild,
};
