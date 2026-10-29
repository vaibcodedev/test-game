/**
 * Постоянные питомцы — эскизы-силуэты 10 взрослых питомцев на утверждение (покой, 3/4: вниз и вбок, рядом герой).
 * Модели — тем же методом, что мобы задачи 140 (rig: 3D из примитивов, 5 тонов, контур как у героя); полная анимация —
 * после утверждения списка. Запуск (под замком): npx tsx tools/gen/pets/roster.ts → tools/out/pets/roster.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  M, R, add, drawArm, drawLeg, drawFoot, face, furTex, glowMat, hex, hp, mat, spotTex, tail,
  type Creature, type Ctx, type Mat, type RoleDef, type TexFn, type V3,
} from "../mobs/rig";
import { drawLeg4, legsOf } from "../mobs/quad";
import { PX, fill, groundBg, nightRect, text, stackRows, type Row } from "../mobs/lib";
import { camN, frameOfSheet, heroAt, loadAssets, mul, norm, putSprite, relight, renderPet, rest, sub, lerpV, type Pet } from "./petlib";
import { PC } from "../mobs/lib";

const m5 = (name: string, ...cs: string[]) => mat(name, R(...cs), { base: 1.8, gain: 2.3 });
const EMBER = R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0");
const GREEN = R("#16300e", "#2e5e1c", "#5f9c3c", "#8fd46a", "#d8f8b8");
const RUNE = R("#0a2a3a", "#145a7a", "#2aa0c8", "#7ae0f4", "#e0fcff");
const GHOST = R("#1a2a40", "#34507a", "#5c86b4", "#9cc4e4", "#e4f4ff");
const M_EMBER = glowMat("угли", EMBER, 2.3);
const M_GREEN = glowMat("зелёный огонь", GREEN, 2.4);
const M_RUNE = glowMat("руны", RUNE, 2.4);
const M_GHOSTG = glowMat("дух", GHOST, 2.0);
const M_CLAW = m5("коготь", "#141010", "#2a2420", "#4a4038", "#706458", "#9a8c7c");
const M_NOSE = m5("нос", "#0c0a0a", "#1c1818", "#2c2626", "#3e3634", "#524846");
const M_STEEL = M.steel, M_IRON = M.iron;

function eyes(c: Ctx, at: V3, sideAt: V3, col: string, glow = false, gap = 3, halo?: [number, number, number, number]) {
  const k = glow ? "G" : "e";
  face(c, { at, sideAt, colors: { e: hex(col), G: hex(col), k: hex("#0c0806") }, glow: ["G"], halo, down: [[k + ".".repeat(Math.max(0, gap - 1)) + k], -Math.floor(gap / 2), 0], side: [[k], 0, 0] });
}
interface Quad { body: [V3, V3][]; fur: Mat; tex?: TexFn; legs: { x: number; y: number; z: number; len: [number, number]; pole: V3; spread?: number }[]; legR: [number, number, number]; pawR: number; claws?: Mat; paw?: Mat }
function quad(c: Ctx, q: Quad) {
  const S = c.S;
  const g = S.group(0.9);
  const pt = S.newPart();
  for (const [at, r] of q.body) S.ell(g, q.fur, c.up(at), r, undefined, { part: pt, big: true, tex: q.tex });
  const legs = legsOf(c, q.legs);
  for (const pr of legs) for (const L of pr) drawLeg4(c, L, q.fur, q.legR, { tex: q.tex, pawR: q.pawR, claws: q.claws, clawN: 3, paw: q.paw });
}

// 1. Пепельный медведь — танк, ≈0,9 роста героя
const BEAR = m5("бурая шерсть", "#120e0c", "#2a221e", "#433630", "#5e4c42", "#7a6456");
const ASHF = m5("пепельная грива", "#22201e", "#46423e", "#6e6a64", "#9a958c", "#c8c2b6");
function bear(c: Ctx) {
  const { S, up } = c;
  const tx = furTex(31, 0.22);
  quad(c, { body: [[[0, 1.8, 10.2], [4.6, 5.0, 4.4]], [[0, -3.6, 9.8], [4.2, 3.8, 3.8]]], fur: BEAR, tex: tx, legs: [{ x: 2.8, y: -4.2, z: 9.0, len: [4.2, 4.4], pole: [0, -1, 0.2], spread: 0.3 }, { x: 3.0, y: 4.2, z: 9.0, len: [4.2, 4.4], pole: [0, -1, 0], spread: 0.3 }], legR: [2.2, 1.7, 1.5], pawR: 1.5, claws: M_CLAW });
  // пепельная грива-горб и тлеющие шрамы
  S.ell(S.group(0.6), ASHF, up([0, 2.8, 13.4]), [4.0, 3.6, 2.8], undefined, { part: S.newPart(), big: true, tex: furTex(32, 0.3) });
  for (const [x, y] of [[2.6, 0.6], [-2.2, -2.0]] as [number, number][]) S.cone(S.group(0), M_EMBER, up([x * 1.6, y, 12.6]), 0.35, up([x * 1.7, y - 2.2, 11.6]), 0.3, { part: S.newPart() });
  S.cone(S.group(0.6), BEAR, up([0, 5.4, 12.0]), 2.8, hp(c, [0, -0.8, -0.4]), 2.4, { part: S.newPart(), tex: tx });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, BEAR, c.head, [3.0, 2.8, 2.7], undefined, { part: ph, big: true, tex: tx });
  S.ell(gH, ASHF, hp(c, [0, 2.4, -0.8]), [1.6, 1.8, 1.3], undefined, { part: ph });
  S.ball(S.group(0), M_NOSE, hp(c, [0, 4.0, -0.5]), 0.6, { part: S.newPart() });
  for (const s of [1, -1]) S.ell(S.group(0.2), BEAR, hp(c, [2.2 * s, -0.6, 2.2]), [0.9, 0.5, 0.9], undefined, { part: S.newPart() });
  eyes(c, [0, 2.4, 0.8], [1.6, 2.0, 0.8], "#ffb040", true, 3, EMBER[2]);
  tail(c, BEAR, [0, -7.2, 10.4], [[0, -0.8, -0.6]], [0.9, 0.6]);
}
// 2. Боевой ворон — малый летун, урон с воздуха
const RAVEN = m5("вороново перо", "#08080c", "#141420", "#232336", "#363650", "#50506e");
function birdBody(c: Ctx, F: Mat, o: { z: number; span: number; beak: Mat; tailL: number; eye: string; glow?: boolean; extra?: (head: V3, body: V3) => void; pointed?: boolean }) {
  const S = c.S;
  const body: V3 = c.up([0, 0, o.z]);
  const g = S.group(0.6);
  const pb = S.newPart();
  S.ell(g, F, body, [1.9, 2.6, 2.0], undefined, { part: pb, big: true });
  const head = c.up([0, 2.6, o.z + 1.4]);
  S.ell(g, F, head, [1.5, 1.6, 1.5], undefined, { part: pb, big: true });
  S.cone(S.group(0), o.beak, add(head, [0, 1.2, -0.1]), 0.6, add(head, [0, 3.0, -0.6]), 0.12, { part: S.newPart() });
  S.box(S.group(0.3), F, c.up([0, -3.2 - o.tailL / 2, o.z - 0.6]), [1.4, o.tailL / 2, 0.3], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.3, { part: S.newPart() });
  for (const s of [1, -1]) {
    const root = c.up([1.4 * s, -0.2, o.z + 0.6]);
    const el = c.up([(o.span * 0.45) * s, -0.6, o.z + 2.6]);
    const tip = c.up([o.span * s, o.pointed ? -2.8 : -1.6, o.z + (o.pointed ? 1.2 : 3.4)]);
    const gw = S.group(0.35);
    const pw = S.newPart();
    S.cone(gw, F, root, 1.0, el, 0.8, { part: pw });
    S.cone(gw, F, el, 0.8, tip, 0.3, { part: pw });
    // перья маховые — пластины вниз от крыла
    for (let k = 0; k < 4; k++) {
      const a = lerpV(el, tip, k / 3);
      S.box(S.group(0), F, add(a, [0, -0.6, -1.0 + k * 0.1]), [0.5, 0.25, 1.3 - k * 0.15], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.2, { part: pw, tone: -0.2 });
    }
  }
  for (const s of [1, -1]) S.cone(S.group(0), M_CLAW, c.up([0.7 * s, 0.4, o.z - 1.6]), 0.35, c.up([0.8 * s, 0.9, o.z - 3.0]), 0.2, { part: S.newPart() });
  c.S.stamps.push({ at: add(head, [0.9, 1.0, 0.3]), n: norm([0.6, 0.7, 0]), colors: { e: hex(o.eye) }, glow: o.glow ? ["e"] : [], px: { down: [[0, 0, "e"]], side: [[0, 0, "e"]] }, depthTol: 2.5 });
  c.S.stamps.push({ at: add(head, [-0.9, 1.0, 0.3]), n: norm([-0.6, 0.7, 0]), colors: { e: hex(o.eye) }, glow: o.glow ? ["e"] : [], px: { down: [[0, 0, "e"]] }, depthTol: 2.5 });
  o.extra?.(head, body);
}
function raven(c: Ctx) {
  birdBody(c, RAVEN, {
    z: 15, span: 8.5, beak: M_IRON, tailL: 3.2, eye: "#8fd46a", glow: true,
    extra: (head) => {
      // боевая налобная пластина и шипы-перья на загривке
      c.S.ell(c.S.group(0), M_IRON, add(head, [0, 0.4, 0.9]), [1.4, 1.3, 0.6], undefined, { part: c.S.newPart() });
      for (const s of [1, 0, -1]) c.S.cone(c.S.group(0), RAVEN, add(head, [s * 0.6, -1.2, 0.8]), 0.5, add(head, [s * 0.9, -2.8, 2.0]), 0.12, { part: c.S.newPart() });
    },
  });
}
// 3. Рысь утёсов — быстрый урон
const LYNX = m5("рыжевато-серая шерсть", "#1e1812", "#3e3226", "#62503c", "#8a7256", "#b09878");
const LYNX_D = m5("пятна", "#120e0a", "#241c14", "#382c20", "#4c3c2c", "#604c38");
function lynx(c: Ctx) {
  const { S, up } = c;
  const tx = spotTex(0.14, 0, 61, LYNX_D);
  quad(c, { body: [[[0, 2.4, 9.8], [3.0, 3.6, 2.9]], [[0, -2.8, 9.8], [2.7, 3.6, 2.6]]], fur: LYNX, tex: tx, legs: [{ x: 1.9, y: -4.2, z: 9.4, len: [4.6, 5.0], pole: [0, 1, 0.2], spread: 0.4 }, { x: 2.0, y: 4.0, z: 9.2, len: [4.4, 5.0], pole: [0, -1, 0], spread: 0.4 }], legR: [1.5, 1.05, 0.95], pawR: 1.1 });
  S.cone(S.group(0.6), LYNX, up([0, 4.6, 11.0]), 2.0, hp(c, [0, -0.8, -0.6]), 1.7, { part: S.newPart(), tex: tx });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, LYNX, c.head, [2.6, 2.3, 2.3], undefined, { part: ph, big: true, tex: tx });
  S.ell(gH, m5("светлая морда", "#2a241c", "#5a4e3e", "#8e7e66", "#bcac90", "#e2d6bc"), hp(c, [0, 1.7, -0.8]), [1.5, 1.2, 1.0], undefined, { part: ph });
  S.ball(S.group(0), M_NOSE, hp(c, [0, 2.8, -0.4]), 0.4, { part: S.newPart() });
  for (const s of [1, -1]) {
    // бакенбарды и уши с кисточками
    S.cone(S.group(0.3), LYNX, hp(c, [2.0 * s, 0.4, -1.0]), 0.9, hp(c, [3.4 * s, 0.2, -1.8]), 0.2, { part: S.newPart() });
    S.cone(S.group(0.2), LYNX, hp(c, [1.3 * s, -0.4, 1.4]), 0.8, hp(c, [1.7 * s, -0.6, 3.6]), 0.2, { part: S.newPart() });
    S.cone(S.group(0), LYNX_D, hp(c, [1.7 * s, -0.6, 3.5]), 0.2, hp(c, [1.8 * s, -0.6, 4.8]), 0.12, { part: S.newPart() });
  }
  eyes(c, [0, 2.1, 0.5], [1.4, 1.7, 0.5], "#c8e040", false, 3);
  tail(c, LYNX, [0, -6.0, 11.0], [[0, -1.0, 0.4]], [0.9, 0.8]);
}
// 4. Бронированный кабан — таран, танк
const BOAR = m5("щетина", "#1a120c", "#36261a", "#544030", "#745a44", "#94785c");
function aboar(c: Ctx) {
  const { S, up } = c;
  const tx = furTex(71, 0.22);
  quad(c, { body: [[[0, 1.6, 8.4], [3.7, 4.3, 3.6]], [[0, -3.0, 7.8], [3.3, 3.6, 3.0]]], fur: BOAR, tex: tx, legs: [{ x: 2.2, y: -3.6, z: 6.8, len: [3.4, 3.6], pole: [0, -1, 0], spread: 0.2 }, { x: 2.3, y: 3.4, z: 6.8, len: [3.4, 3.6], pole: [0, -1, 0], spread: 0.2 }], legR: [1.8, 1.1, 0.8], pawR: 0.8, paw: m5("копыто", "#0e0a08", "#1e1612", "#30241c", "#443428", "#5a4636") });
  // попона из пластин и шипастый налобник
  for (let k = 0; k < 4; k++) S.ell(S.group(0), M_STEEL, up([0, 3.2 - k * 2.2, 11.0 - k * 0.3]), [3.9, 1.6, 1.6], undefined, { part: S.newPart(), cut: { n: [0, 0, -1], d: 0.2 } });
  S.box(S.group(0), M.leather, up([0, -0.6, 10.4]), [3.9, 4.8, 0.5], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.4, { part: S.newPart() });
  for (const s of [1, -1]) S.cone(S.group(0), M_IRON, up([3.2 * s, 1.0, 10.4]), 0.5, up([4.4 * s, 1.0, 11.4]), 0.12, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, BOAR, c.head, [2.6, 2.8, 2.6], undefined, { part: ph, big: true, tex: tx });
  S.cone(gH, BOAR, hp(c, [0, 1.4, -0.6]), 1.8, hp(c, [0, 4.0, -1.6]), 1.2, { part: ph });
  S.box(S.group(0), M_STEEL, hp(c, [0, 1.6, 0.9]), [1.6, 2.2, 0.4], [[1, 0, 0], norm([0, 1, -0.4]), norm([0, 0.4, 1])], 0.3, { part: S.newPart() });
  S.cone(S.group(0), M_IRON, hp(c, [0, 1.0, 1.6]), 0.5, hp(c, [0, 1.6, 3.4]), 0.12, { part: S.newPart() });
  for (const s of [1, -1]) {
    S.cone(S.group(0), M.bone, hp(c, [1.0 * s, 3.2, -2.2]), 0.6, hp(c, [2.0 * s, 4.4, 0.4]), 0.12, { part: S.newPart() });
    S.cone(S.group(0.2), BOAR, hp(c, [1.6 * s, -0.6, 1.6]), 0.8, hp(c, [2.4 * s, -1.0, 2.6]), 0.2, { part: S.newPart() });
  }
  eyes(c, [0, 2.0, 0.6], [1.6, 1.6, 0.6], "#e04a2a", true, 3);
  tail(c, BOAR, [0, -6.4, 9.0], [[0, -0.8, -0.8], [0.2, -0.4, -1.0]], [0.4, 0.3, 0.25]);
}
// 5. Сокол Сольгарда — поддержка, метки с воздуха
const FALC = m5("перо сокола", "#1e140c", "#3e2a18", "#664628", "#8e683e", "#b48e60");
function falcon(c: Ctx) {
  birdBody(c, FALC, {
    z: 15, span: 9.5, beak: m5("клюв", "#3a2a08", "#6a4e10", "#a07a20", "#d0a83a", "#f0d070"), tailL: 3.6, eye: "#f0c040", pointed: true,
    extra: (head, body) => {
      // золочёный клобучок с плюмажем и грудка в крапинку
      c.S.ell(c.S.group(0), m5("золото", "#4a2e0a", "#8a5a14", "#d6a84b", "#f0cc74", "#fff0b8"), add(head, [0, -0.2, 0.6]), [1.6, 1.6, 1.0], undefined, { part: c.S.newPart(), cut: { n: [0, 0, -1], d: 0.1 } });
      c.S.cone(c.S.group(0), m5("плюмаж", "#2a0e0a", "#5a1c14", "#8e3424", "#c05a3a", "#e48a62"), add(head, [0, -0.6, 1.4]), 0.4, add(head, [0, -2.0, 3.0]), 0.15, { part: c.S.newPart() });
      c.S.ell(c.S.group(0), m5("грудка", "#3a2c1c", "#6a5438", "#9a8058", "#c4ac82", "#e6d4ae"), add(body, [0, 1.6, -0.2]), [1.4, 0.8, 1.6], undefined, { part: c.S.newPart(), tex: spotTex(0.2, -1.2, 11) });
    },
  });
}
// 6. Костяная гончая Умбрата — урон, нежить
const BONE = m5("кость", "#2e2620", "#5a4c3c", "#8c7a60", "#bcaa88", "#e4d8b8");
function hound(c: Ctx) {
  const { S, up } = c;
  // хребет, рёбра, таз
  S.cone(S.group(0), BONE, up([0, -5.0, 10.4]), 0.8, up([0, 5.0, 11.6]), 0.9, { part: S.newPart() });
  for (let k = 0; k < 4; k++) {
    const y = 3.4 - k * 1.5;
    S.ell(S.group(0), BONE, up([0, y, 9.6]), [2.6 - k * 0.2, 0.45, 2.4 - k * 0.2], undefined, { part: S.newPart(), cut: { n: [0, 0, 1], d: 1.6 } });
  }
  S.ell(S.group(0.4), BONE, up([0, -4.6, 10.2]), [2.2, 1.6, 1.4], undefined, { part: S.newPart() });
  S.ell(S.group(0), m5("рваная шкура", "#120a10", "#24142a", "#3a2244", "#55345e", "#704a7a"), up([0, 0.2, 11.8]), [2.8, 5.4, 1.0], undefined, { part: S.newPart(), cut: { n: [1, 0, 0], d: 0.8 } });
  for (let k = 0; k < 4; k++) S.cone(S.group(0), M_IRON, up([0, 3.2 - k * 2.2, 12.2]), 0.45, up([0, 2.6 - k * 2.2, 14.0]), 0.1, { part: S.newPart() });
  S.cone(S.group(0), BONE, up([0, 5.0, 11.6]), 0.9, hp(c, [0, -1.0, -0.4]), 0.8, { part: S.newPart() });
  S.ell(S.group(0), M_IRON, up([0, 5.6, 11.8]), [1.8, 1.0, 1.8], undefined, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, BONE, c.head, [2.3, 2.3, 2.0], undefined, { part: ph, big: true });
  S.cone(gH, BONE, hp(c, [0, 1.2, -0.4]), 1.3, hp(c, [0, 4.4, -1.0]), 0.6, { part: ph });
  S.cone(S.group(0.3), BONE, hp(c, [0, 1.0, -1.3]), 0.8, hp(c, [0, 3.8, -2.0]), 0.45, { part: S.newPart(), tone: -0.4 });
  for (const s of [1, -1]) S.cone(S.group(0), BONE, hp(c, [1.2 * s, -0.6, 1.2]), 0.6, hp(c, [1.8 * s, -1.6, 3.0]), 0.15, { part: S.newPart() });
  eyes(c, [0, 2.0, 0.6], [1.2, 1.6, 0.6], "#a8f080", true, 3, GREEN[2]);
  const legs = legsOf(c, [{ x: 1.8, y: -4.4, z: 9.6, len: [4.6, 5.0], pole: [0, 1, 0.2], spread: 0.6 }, { x: 2.0, y: 3.8, z: 9.4, len: [4.4, 5.0], pole: [0, -1, 0], spread: 0.6 }]);
  for (const pr of legs) for (const L of pr) drawLeg4(c, L, BONE, [0.9, 0.7, 0.6], { pawR: 0.8, claws: M_CLAW, clawN: 3 });
  tail(c, BONE, [0, -6.0, 10.6], [[0, -1.4, -0.6], [0, -1.4, -1.0], [0, -1.0, -1.2]], [0.6, 0.5, 0.4, 0.3]);
  S.ball(S.group(0), M_GREEN, up([0, 1.6, 9.8]), 0.9, { part: S.newPart() });
}
// 7. Пепельная саламандра — огонь с дистанции
const SAL = m5("угольная чешуя", "#0e0a0a", "#1e1616", "#30241f", "#463630", "#5e4a42");
function salamander(c: Ctx) {
  const { S, up } = c;
  const crackT: TexFn = (q) => (q.edge ? 0 : Math.abs(Math.sin(q.l[1] * 1.6 + Math.sin(q.l[0] * 1.3) * 1.2)) < 0.14 ? { mat: M_EMBER, d: 0 } : 0);
  quad(c, { body: [[[0, 0, 4.8], [2.4, 5.6, 2.0]]], fur: SAL, tex: crackT, legs: [{ x: 2.0, y: -3.2, z: 4.0, len: [2.4, 2.6], pole: [0, 0, 1], spread: 2.0 }, { x: 2.0, y: 2.8, z: 4.0, len: [2.4, 2.6], pole: [0, 0, 1], spread: 2.2 }], legR: [0.9, 0.7, 0.55], pawR: 0.6, claws: M_CLAW });
  S.cone(S.group(0.5), SAL, up([0, 4.4, 5.4]), 1.6, hp(c, [0, -1.0, -0.2]), 1.3, { part: S.newPart() });
  const gH = S.group(0.5);
  const ph = S.newPart();
  S.ell(gH, SAL, c.head, [1.8, 2.6, 1.4], undefined, { part: ph, big: true });
  // огненный гребень вдоль спины и воротник
  for (let k = 0; k < 6; k++) S.cone(S.group(0), M_EMBER, up([0, 3.6 - k * 1.5, 6.6]), 0.55, up([0, 3.2 - k * 1.5, 8.0 + (k % 2) * 0.6]), 0.15, { part: S.newPart() });
  for (const s of [1, -1]) S.ell(S.group(0.2), m5("воротник", "#2a0a06", "#561a0e", "#8a3018", "#b85424", "#e08038"), hp(c, [1.8 * s, -0.8, 0.2]), [1.4, 0.3, 1.2], [norm([s, -0.3, 0]), [0, 1, 0], [0, 0, 1]], { part: S.newPart() });
  eyes(c, [0, 1.9, 0.5], [1.3, 1.5, 0.5], "#ffd060", true, 3, EMBER[2]);
  tail(c, SAL, [0, -5.2, 4.6], [[0.6, -2.0, -1.0], [1.4, -2.0, -0.8], [1.8, -1.4, -0.4], [1.4, -1.0, 0.2]], [1.5, 1.1, 0.8, 0.5, 0.25], crackT, (g, at) => S.ball(g, M_EMBER, at, 0.6, { part: S.newPart() }));
}
// 8. Малый рунный голем — конструкт-танк (гуманоид)
const STONE = m5("камень голема", "#141416", "#2a2a30", "#45454e", "#62626c", "#86868f");
function golem(c: Ctx) {
  const { S, up } = c;
  const rn: TexFn = (q) => (q.edge ? 0 : (Math.abs(((q.l[0] + 20) % 2.6) - 1.3) < 0.18 && Math.abs(q.l[2] % 3) < 1.6 ? { mat: M_RUNE, d: 0 } : 0));
  const gT = S.group(0.8);
  const pt = S.newPart();
  S.ell(gT, STONE, up([0, 0, 13.0]), [4.4, 3.0, 3.8], undefined, { part: pt, big: true, tex: rn });
  S.ell(gT, STONE, c.pelvisC, [3.0, 2.2, 1.8], undefined, { part: pt });
  S.ball(S.group(0), M_RUNE, up([0, 2.6, 13.4]), 1.0, { part: S.newPart() });
  S.ell(S.group(0), m5("мох", "#0e1a0c", "#1c3018", "#2e4a26", "#466a38", "#62884c"), up([-2.4, 0, 16.0]), [2.0, 2.4, 0.8], undefined, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.box(gH, STONE, c.head, [1.9, 1.8, 1.6], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], 0.6, { part: ph, big: true });
  face(c, { at: [0, 1.9, 0.2], sideAt: [1.2, 1.7, 0.2], colors: { G: RUNE[3], g: RUNE[2] }, glow: ["G", "g"], halo: RUNE[1], down: [["GgG"], -1, 0], side: [["G"], 0, 0] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: STONE, r: [1.7, 1.5, 1.7], tex: rn }, 2.0);
    S.ell(S.group(0), STONE, add(c.sh[i], [0, 0, 0.6]), [2.0, 1.9, 1.5], undefined, { part: S.newPart() });
    drawLeg(c, i, { mat: STONE, r: [1.7, 1.5, 1.5] });
    drawFoot(c, i, STONE, 2.0, 1.4, 1.2);
  }
}
// 9. Призрачный лис — поддержка (лечит хозяина), дух
const FOX = mat("призрачная шерсть", GHOST, { base: 2.1, gain: 2.0 });
function fox(c: Ctx) {
  const { S, up } = c;
  quad(c, { body: [[[0, 1.8, 9.6], [2.3, 3.2, 2.3]], [[0, -2.4, 9.6], [2.2, 3.2, 2.2]]], fur: FOX, legs: [{ x: 1.4, y: -3.6, z: 9.0, len: [4.0, 4.4], pole: [0, 1, 0.2], spread: 0.3 }, { x: 1.5, y: 3.4, z: 9.0, len: [4.0, 4.4], pole: [0, -1, 0], spread: 0.3 }], legR: [1.1, 0.75, 0.6], pawR: 0.75 });
  S.cone(S.group(0.6), FOX, up([0, 3.8, 10.6]), 1.6, hp(c, [0, -0.8, -0.6]), 1.3, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, FOX, c.head, [2.1, 2.0, 1.9], undefined, { part: ph, big: true });
  S.cone(gH, FOX, hp(c, [0, 1.2, -0.4]), 1.1, hp(c, [0, 4.0, -0.9]), 0.35, { part: ph });
  for (const s of [1, -1]) S.cone(S.group(0.2), FOX, hp(c, [1.2 * s, -0.4, 1.2]), 0.9, hp(c, [1.9 * s, -0.6, 3.8]), 0.15, { part: S.newPart() });
  eyes(c, [0, 1.8, 0.4], [1.2, 1.4, 0.4], "#e4f4ff", true, 3, GHOST[2]);
  // два дымных хвоста
  for (const s of [1, -1]) tail(c, FOX, [0.6 * s, -5.0, 10.4], [[1.2 * s, -1.6, 1.0], [1.6 * s, -1.8, 1.6], [1.0 * s, -1.4, 1.6]], [1.0, 1.6, 1.4, 0.4], undefined, (g, at) => S.ball(g, M_GHOSTG, at, 0.7, { part: S.newPart() }));
  S.ball(S.group(0), M_GHOSTG, up([0, 3.6, 11.6]), 0.6, { part: S.newPart() });
}
// 10. Ящер трясины — танк с ядом, мшистый панцирь
const BOG = m5("болотная чешуя", "#0e1410", "#1c2a1e", "#2e4430", "#466246", "#64805c");
const MOSS = m5("мох", "#121a0a", "#243414", "#3a5020", "#56702e", "#7a9442");
function bog(c: Ctx) {
  const { S, up } = c;
  const tx = spotTex(0.12, -0.6, 85);
  quad(c, { body: [[[0, 0, 5.8], [3.6, 5.6, 2.8]]], fur: BOG, tex: tx, legs: [{ x: 2.8, y: -3.4, z: 5.0, len: [2.8, 3.0], pole: [0, 0, 1], spread: 2.0 }, { x: 2.8, y: 3.2, z: 5.0, len: [2.8, 3.0], pole: [0, 0, 1], spread: 2.2 }], legR: [1.5, 1.1, 0.9], pawR: 0.9, claws: M_CLAW });
  // мшистые костяные пластины по спине, грибы
  for (let k = 0; k < 4; k++) S.ell(S.group(0), m5("пластина", "#1a1812", "#34302a", "#524a3e", "#746a58", "#968a74"), up([0, 3.0 - k * 2.0, 8.2]), [2.6 - Math.abs(k - 1.5) * 0.3, 1.4, 0.8], undefined, { part: S.newPart(), tex: spotTex(0.3, 0, 7, MOSS) });
  for (const [x, y] of [[1.2, 1.6], [-1.4, -2.2]] as [number, number][]) S.ell(S.group(0), m5("гриб", "#2a1408", "#5a2e12", "#8e5020", "#c07a34", "#e8a858"), up([x, y, 9.4]), [0.8, 0.8, 0.45], undefined, { part: S.newPart() });
  S.cone(S.group(0.5), BOG, up([0, 4.6, 6.4]), 2.4, hp(c, [0, -1.0, -0.4]), 1.9, { part: S.newPart(), tex: tx });
  const gH = S.group(0.5);
  const ph = S.newPart();
  S.ell(gH, BOG, c.head, [2.3, 3.0, 1.7], undefined, { part: ph, big: true, tex: tx });
  for (const s of [1, -1]) S.cone(S.group(0), MOSS, hp(c, [1.6 * s, -1.0, 0.6]), 0.5, hp(c, [2.6 * s, -2.4, 1.4]), 0.12, { part: S.newPart() });
  eyes(c, [0, 1.8, 0.6], [1.6, 1.3, 0.6], "#c8e040", true, 3, GREEN[1]);
  tail(c, BOG, [0, -5.4, 5.6], [[0.6, -2.0, -1.4], [1.4, -1.8, -1.0], [1.6, -1.2, -0.4]], [2.0, 1.4, 0.9, 0.3], tx);
}

export interface RosterPet { id: string; name: string; alt: string; role: string; size: string; cr: Creature; N: number; shadow: number }
const roleD = (id: string): RoleDef => ({ id, ru: id, kind: "leap" });
const Q = { pelvisZ: 10, hipX: 1.6, hipZ: 9.6, shX: 1.8, shZ: 10.5, arm: [4, 4] as [number, number], leg: [4.8, 5.0] as [number, number], footX: 2.0, stride: 1.8 };
const mk = (id: string, name: string, alt: string, role: string, size: string, build: (c: Ctx) => void, scale: number, dims: Partial<Creature["dims"]>, N = 32, shadow = 6): RosterPet => ({
  id, name, alt, role, size, N, shadow,
  cr: { id, ru: name, eliteRu: "", scale: [scale, scale], big: N === 48, dims: { ...Q, headC: [0, 7.8, 12.0], ...dims } as Creature["dims"], roles: [roleD(id)], build },
});
export const ROSTER: RosterPet[] = [
  mk("ash_bear", "Пепельный медведь", "Угольный шатун · Горн-медведь", "ТАНК", "0,9", bear, 1.25, { headC: [0, 8.8, 12.6], footX: 2.8, hipX: 2.6, shX: 2.6 }, 48, 9),
  mk("war_raven", "Боевой ворон", "Вестник курганов · Чернокрыл", "УРОН С ВОЗДУХА", "0,4", raven, 0.72, { headC: [0, 2.6, 16.4] }, 32, 3.5),
  mk("cliff_lynx", "Рысь утёсов", "Скальная рысь · Тенекогть", "УРОН", "0,55", lynx, 0.8, { headC: [0, 7.4, 11.8] }, 32, 5),
  mk("iron_boar", "Бронированный кабан", "Окованный секач · Таранный вепрь", "ТАНК", "0,6", aboar, 1.0, { pelvisZ: 8, hipX: 2, hipZ: 7, shX: 2, shZ: 8, arm: [3, 3], leg: [3.4, 3.6], headC: [0, 6.4, 8.0], footX: 2.2, stride: 1.6 }, 32, 6.5),
  mk("sol_falcon", "Сокол Сольгарда", "Рассветный сокол · Золотой клобук", "ПОДДЕРЖКА", "0,4", falcon, 0.72, { headC: [0, 2.6, 16.4] }, 32, 3.5),
  mk("bone_hound", "Костяная гончая Умбрата", "Курганный пёс · Гробовая гончая", "УРОН", "0,6", hound, 0.95, { headC: [0, 7.8, 12.0] }, 32, 5.5),
  mk("ash_salamander", "Пепельная саламандра", "Горновая саламандра · Тлеющий ползун", "ОГОНЬ С ДИСТАНЦИИ", "0,35", salamander, 1.0, { pelvisZ: 4.2, hipX: 2, hipZ: 4, shX: 2, shZ: 4.6, arm: [2, 2], leg: [2.4, 2.6], headC: [0, 7.6, 5.6], footX: 2, stride: 1.4 }, 32, 5.5),
  mk("rune_golem", "Малый рунный голем", "Рунный страж · Каменный подмастерье", "ТАНК", "0,75", golem, 0.78, { pelvisZ: 7.8, hipX: 2.2, hipZ: 7.2, shX: 5.2, shZ: 15.8, arm: [4.2, 4.0], leg: [3.4, 3.2], headC: [0, 0.8, 19.4], footX: 2.4 }, 32, 6.5),
  mk("ghost_fox", "Призрачный лис", "Лунный лис · Двухвостый дух", "ПОДДЕРЖКА — ЛЕЧИТ", "0,45", fox, 0.72, { headC: [0, 6.6, 11.6] }, 32, 4),
  mk("bog_lizard", "Ящер трясины", "Мшистый варан · Трясинный панцирник", "ТАНК — ЯД", "0,45", bog, 1.05, { pelvisZ: 5.4, hipX: 2, hipZ: 5, shX: 2, shZ: 6, arm: [2, 2], leg: [2.8, 3.0], headC: [0, 8.4, 6.6], footX: 2.6, stride: 1.3 }, 32, 7),
];

// ---------------- лист эскизов ----------------
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/gen/pets/roster.ts")) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const OUT = path.join(ROOT, "tools", "out", "pets");
  fs.mkdirSync(OUT, { recursive: true });
  const A = loadAssets(ROOT);
  const K = 4;
  const CELL = 470;
  const W = 16 * 2 + CELL * 5;
  const rows: Row[] = [];
  rows.push({ h: 64, draw: (c, y) => { text(c, "ПОСТОЯННЫЕ ПИТОМЦЫ · ЭСКИЗЫ 10 ВЗРОСЛЫХ ПИТОМЦЕВ · ПОКОЙ, ВИД 3/4 СПЕРЕДИ И СБОКУ · РЯДОМ ГЕРОЙ", 16, y + 8, 3); text(c, "×4 · МАСШТАБ ЕДИНЫЙ · ВЕРХ — ДЕНЬ, НИЖЕ — НОЧЬ · ПОД КАЖДЫМ: ИМЯ, РОЛЬ, РОСТ В ДОЛЯХ ГЕРОЯ, ДРУГИЕ ВАРИАНТЫ ИМЕНИ", 16, y + 40, 2); } });
  const rendered = ROSTER.map((rp) => {
    const pet: Pet = { id: rp.id, ru: rp.name, cr: rp.cr, v: { role: rp.cr.roles[0], elite: false }, cam: camN(rp.N), shadow: rp.shadow, anims: [] };
    const p = rest(rp.cr, pet.v, { glow: 1 });
    return { rp, down: renderPet(pet, "down", { p }, 0), side: renderPet(pet, "side", { p }, 0) };
  });
  for (const night of [false, true]) for (let r = 0; r < 2; r++) {
    const H = 48 * K + 120;
    rows.push({
      h: H,
      draw: (c, y0) => {
        const y = y0;
        groundBg(c, A.terrain, 16, y, W - 32, 48 * K + 8, K, "grass");
        const yb = y + 48 * K;
        for (let i = 0; i < 5; i++) {
          const it = rendered[r * 5 + i];
          let x = 16 + i * CELL + 8;
          putSprite(c, { img: heroAt(A, 0) }, x, yb, K);
          x += 30 * K;
          const xd = x;
          putSprite(c, { img: it.down.img, shadow: it.rp.shadow }, x, yb, K);
          x += (it.rp.N - 4) * K;
          const xs = x;
          putSprite(c, { img: it.side.img, shadow: it.rp.shadow }, x, yb, K);
          (it as unknown as { pos: number[] }).pos = [xd, xs];
        }
        if (night) nightRect(c, 16, y, W - 32, 48 * K + 8);
        if (night) for (let i = 0; i < 5; i++) {
          const it = rendered[r * 5 + i] as unknown as { down: { emis: PC }; side: { emis: PC }; pos: number[] };
          relight(c, it.down.emis, it.pos[0], yb, K);
          relight(c, it.side.emis, it.pos[1], yb, K);
        }
        for (let i = 0; i < 5; i++) {
          const it = rendered[r * 5 + i];
          const x = 16 + i * CELL + 8;
          fill(c, x - 4, yb + 10, CELL - 12, 100, [24, 20, 26, 255]);
          text(c, `${r * 5 + i + 1}. ${it.rp.name}`, x, yb + 14, 2, [240, 220, 160, 255]);
          text(c, `${it.rp.role} · РОСТ ${it.rp.size}`, x, yb + 38, 2);
          text(c, `ИЛИ: ${it.rp.alt}`, x, yb + 62, 1, [190, 184, 170, 255]);
        }
      },
    });
  }
  stackRows(rows, W).save(path.join(OUT, "roster.png"));
  console.log("  → tools/out/pets/roster.png");
}
void [PX, M_GHOSTG, mul, sub, EMBER];
