/**
 * Постоянные питомцы — финальный арт 10 утверждённых взрослых питомцев (задача зверинца; в игру не подключены).
 * Модели — из эскизов tools/gen/pets/roster.ts, доработаны: челюсть, моргание, взмах крыльев, жёсткие части для гибели.
 * Анимации (3 вида, влево — зеркало): покой 12 (дыхание, хвост, взгляд, моргание), живое действие 16 (своё у каждого),
 * ходьба/полёт 12, атака по роли 9–10, урон 8, гибель 12, появление при призыве 12.
 * Иконки 48×48 — портрет той же моделью (контур, свет сверху слева), прозрачный фон.
 * Запуск (под замком): npx tsx tools/gen/pets/companions.ts [--only=ash_bear,...] → tools/out/pets/sheets, icons, final.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  M, R, add, buildBody, lamellarTex, drawArm, drawFoot, drawLeg, face, furTex, glowMat, handAt, hex, hp, mat, rad, selout, spotTex, tail, tintOutline, OUT,
  type Creature, type Ctx, type Mat, type RoleDef, type TexFn, type V3,
} from "../mobs/rig";
import { drawLeg4, legsOf } from "../mobs/quad";
import { PC, easeIn, easeInOut, easeOut, renderScene, sealPinholes, thicken, type Cam, type RGBA, type View, type Ramp } from "../mobs/lib";
import {
  animRows, buildPet, camN, clamp, frameOfSheet, hash01, heroAt, keyed, lerp, lerpV, loadAssets, mix, mul, norm, orb, pieceLow, px, putSprite, relight, renderPet, rest, saveSheets, sceneRow,
  stackRows, sub, text, groundEllipse, type FxCtx, type Item, type Pet, type PFrame, type Row, type XP,
} from "./petlib";
import { ROSTER } from "./roster";

const m5 = (name: string, ...cs: string[]) => mat(name, R(...cs), { base: 1.8, gain: 2.3 });
const EMBER = R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0");
const GREEN = R("#16300e", "#2e5e1c", "#5f9c3c", "#8fd46a", "#d8f8b8");
const RUNE = R("#0a2a3a", "#145a7a", "#2aa0c8", "#7ae0f4", "#e0fcff");
const GHOST = R("#1a2a40", "#34507a", "#5c86b4", "#9cc4e4", "#e4f4ff");
const GOLD = R("#4a2e0a", "#8a5a14", "#d6a84b", "#f0cc74", "#fff0b8");
const POISON = R("#1a3a08", "#3a6a10", "#6aa420", "#a8d84a", "#e4ffa0");
const M_EMBER = glowMat("угли", EMBER, 2.3);
const M_GREEN = glowMat("зелёный огонь", GREEN, 2.4);
const M_RUNE = glowMat("руны", RUNE, 2.4);
const M_GHOSTG = glowMat("дух", GHOST, 2.0);
const M_CLAW = m5("коготь", "#141010", "#2a2420", "#4a4038", "#706458", "#9a8c7c");
const M_NOSE = m5("нос", "#0c0a0a", "#1c1818", "#2c2626", "#3e3634", "#524846");
const M_MOUTH = m5("пасть", "#1a0606", "#3a0c0c", "#5a1818", "#7a2a26", "#9a4038");
const M_TOOTH = m5("клык", "#3a3428", "#6e6450", "#a89a7c", "#d4c8a8", "#f2ead2");
const X = (c: Ctx) => c.p as XP;
/** Несколько текстур подряд: первая ненулевая. */
const combo = (...ts: TexFn[]): TexFn => (c) => { for (const t of ts) { const r = t(c); if (r !== 0) return r; } return 0; };
/** Пятна-подпалины крупными пятнами 3×3 px (не шум): материал m. */
const patches = (m: Mat, amount: number, seed: number, d = 0): TexFn => (c) => (c.edge ? 0 : hash01(Math.floor((c.x - c.ax + 60) / 3), Math.floor((c.y - c.ay + 60) / 3), seed) < amount ? { mat: m, d } : 0);
/** Перо/чешуя: ряды пластин со светлой кромкой (rig lamellarTex). */
const feather: TexFn = lamellarTex;
const num = (c: Ctx, k: string, d = 0) => ((X(c)[k] as number | undefined) ?? d);

/** Глаза: моргание (blink) — веко цветом шерсти. */
function eyes(c: Ctx, at: V3, sideAt: V3, col: string, lid: RGBA, glow = false, gap = 3, halo?: RGBA) {
  const shut = c.p.blink > 0.5;
  const k = shut ? "l" : glow ? "G" : "e";
  face(c, { at, sideAt, colors: { e: hex(col), G: hex(col), l: lid, k: hex("#0c0806") }, glow: shut ? [] : ["G"], halo, down: [[k + ".".repeat(Math.max(0, gap - 1)) + k], -Math.floor(gap / 2), 0], side: [[k], 0, 0] });
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
/** Челюсть: нижняя часть морды открывается на jaw; внутри — пасть и клыки. */
function jaw(c: Ctx, m: Mat, a: V3, b: V3, r0: number, r1: number, open = 1.4) {
  const S = c.S;
  const j = c.p.jaw;
  if (j > 0.05) S.cone(S.group(0), M_MOUTH, hp(c, add(a, [0, 0.3, -0.2])), r0 * 0.8, hp(c, add(b, [0, -0.3, -0.2])), r1 * 0.7, { part: S.newPart() });
  const bb: V3 = add(b, [0, -0.2, -open * j]);
  S.cone(S.group(0.3), m, hp(c, a), r0, hp(c, bb), r1, { part: S.newPart(), tone: -0.4 });
  if (j > 0.05) for (const s of [1, -1]) S.cone(S.group(0), M_TOOTH, hp(c, add(b, [0.35 * s, -0.4, -0.2])), 0.25, hp(c, add(b, [0.35 * s, -0.4, -0.9])), 0.08, { part: S.newPart() });
}

// ============ 1. Пепельный медведь ============
const BEAR = m5("бурая шерсть", "#120e0c", "#2a221e", "#433630", "#5e4c42", "#7a6456");
const ASHF = m5("пепельная грива", "#22201e", "#46423e", "#6e6a64", "#9a958c", "#c8c2b6");
const SCORCH = m5("подпалина", "#0e0a08", "#1e1612", "#2e221c", "#3e3028", "#524036");
function bear(c: Ctx) {
  const { S, up } = c;
  const tx = combo(patches(SCORCH, 0.2, 33), patches(ASHF, 0.12, 34, 0.2), furTex(31, 0.22));
  quad(c, { body: [[[0, 1.8, 10.2], [4.6, 5.0, 4.4]], [[0, -3.6, 9.8], [4.2, 3.8, 3.8]]], fur: BEAR, tex: tx, legs: [{ x: 2.8, y: -4.2, z: 9.0, len: [4.2, 4.4], pole: [0, -1, 0.2], spread: 0.3 }, { x: 3.0, y: 4.2, z: 9.0, len: [4.2, 4.4], pole: [0, -1, 0], spread: 0.3 }], legR: [2.2, 1.7, 1.5], pawR: 1.5, claws: M_CLAW });
  S.ell(S.group(0.6), ASHF, up([0, 2.8, 13.4]), [4.0, 3.6, 2.8], undefined, { part: S.newPart(), big: true, tex: furTex(32, 0.3) });
  for (const [x, y, z] of [[2.6, 0.6, 12.6], [-2.2, -2.0, 12.6], [2.9, -3.4, 10.6], [-2.8, 2.6, 10.2]] as [number, number, number][]) S.cone(S.group(0), M_EMBER, up([x * 1.5, y, z]), 0.42, up([x * 1.6, y - 1.8, z - 1.0]), 0.36, { part: S.newPart() });
  S.cone(S.group(0.6), BEAR, up([0, 5.4, 12.0]), 2.8, hp(c, [0, -0.8, -0.4]), 2.4, { part: S.newPart(), tex: tx });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, BEAR, c.head, [3.0, 2.8, 2.7], undefined, { part: ph, big: true, tex: tx });
  S.ell(gH, ASHF, hp(c, [0, 2.4, -0.5]), [1.6, 1.8, 1.0], undefined, { part: ph });
  jaw(c, ASHF, [0, 1.4, -1.4], [0, 3.4, -1.6], 1.1, 0.8, 1.2);
  S.ball(S.group(0), M_NOSE, hp(c, [0, 4.0, -0.3]), 0.6, { part: S.newPart() });
  for (const s of [1, -1]) S.ell(S.group(0.2), BEAR, hp(c, [2.2 * s, -0.6, 2.2]), [0.9, 0.5, 0.9], undefined, { part: S.newPart() });
  eyes(c, [0, 2.4, 0.8], [1.6, 2.0, 0.8], "#ffb040", BEAR.ramp[1], true, 3, EMBER[2]);
  tail(c, BEAR, [0, -7.2, 10.4], [[0, -0.8, -0.6]], [0.9, 0.6]);
}
// ============ 2,5. Птицы ============
const RAVEN = m5("вороново перо", "#08080c", "#141420", "#232336", "#363650", "#50506e");
const FALC = m5("перо сокола", "#1e140c", "#3e2a18", "#664628", "#8e683e", "#b48e60");
function birdBody(c: Ctx, F: Mat, o: { z: number; span: number; beak: Mat; tailL: number; eye: string; glow?: boolean; extra?: (head: V3, body: V3) => void; pointed?: boolean }) {
  const S = c.S;
  const zc = o.z + c.core[2];
  const U = (q: V3) => c.up([q[0], q[1], q[2] - c.core[2] + zc - o.z]);
  void U;
  const body: V3 = c.up([0, 0, o.z]);
  const g = S.group(0.6);
  const pb = S.newPart();
  S.ell(g, F, body, [1.9, 2.6, 2.0], undefined, { part: pb, big: true, tex: feather });
  const head = add(c.up([0, 2.6, o.z + 1.4]), [num(c, "look") * 0.6, 0, 0]);
  S.ell(g, F, head, [1.5, 1.6, 1.5], undefined, { part: pb, big: true });
  const bo = c.p.jaw * 0.6;
  S.cone(S.group(0), o.beak, add(head, [0, 1.2, 0]), 0.6, add(head, [0, 3.0, -0.5 + bo * 0.4]), 0.12, { part: S.newPart() });
  if (bo > 0.05) S.cone(S.group(0), o.beak, add(head, [0, 1.2, -0.4]), 0.45, add(head, [0, 2.6, -1.0 - bo]), 0.1, { part: S.newPart(), tone: -0.4 });
  const tl = c.rotU(norm([c.p.tail * 0.15, -1, -0.25]));
  S.box(S.group(0.3), F, add(body, add(mul(tl, 3.2 + o.tailL / 2), [0, 0, -0.4])), [1.4, o.tailL / 2, 0.3], [c.rotU([1, 0, 0]), tl, norm(c.rotU([0, 0.25, 1]))], 0.3, { part: S.newPart() });
  // крылья: подъём flap (0 — вниз, 1 — вверх), fold — сложены к телу
  const fold = num(c, "fold");
  const a = rad(lerp(-35, 55, c.p.flap)) * (1 - fold);
  for (const s of [1, -1]) {
    const root = c.up([1.4 * s, -0.2, o.z + 0.6]);
    const W = (q: V3, f: V3): V3 => {
      const open: V3 = [q[0], q[1], q[2]];
      const rx = open[0] * Math.cos(a) - 0 * Math.sin(a), rz = open[0] * Math.sin(a) + open[2];
      const pt: V3 = lerpV([rx, open[1], rz], f, fold);
      return add(root, c.rotU([pt[0] * s, pt[1], pt[2]]));
    };
    const el = W([o.span * 0.45, -0.4, 1.4], [1.2, -0.8, 0.6]);
    const tip = W([o.span, o.pointed ? -2.8 : -1.6, o.pointed ? 0.4 : 1.6], [1.0, -4.2, -0.8]);
    const gw = S.group(0.35);
    const pw = S.newPart();
    S.cone(gw, F, root, 1.0, el, 0.8, { part: pw, tex: feather });
    S.cone(gw, F, el, 0.8, tip, 0.3, { part: pw });
    for (let k = 0; k < 4; k++) {
      const q = lerpV(el, tip, k / 3);
      S.box(S.group(0), F, add(q, c.rotU([0, -0.6, -1.0 + k * 0.1])), [0.5, 0.25, 1.3 - k * 0.15], [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])], 0.2, { part: pw, tone: -0.2 });
    }
  }
  for (const s of [1, -1]) S.cone(S.group(0), M_CLAW, c.up([0.7 * s, 0.4, o.z - 1.6]), 0.35, c.up([0.8 * s, 0.9 + num(c, "grab") * 1.5, o.z - 3.0 + num(c, "grab") * 0.8]), 0.2, { part: S.newPart() });
  const shut = c.p.blink > 0.5;
  const ec = shut ? F.ramp[1] : hex(o.eye);
  c.S.stamps.push({ at: add(head, c.rotU([0.9, 1.0, 0.3])), n: c.rotU(norm([0.6, 0.7, 0])), colors: { e: ec }, glow: o.glow && !shut ? ["e"] : [], px: { down: [[0, 0, "e"]], side: [[0, 0, "e"]] }, depthTol: 2.5 });
  c.S.stamps.push({ at: add(head, c.rotU([-0.9, 1.0, 0.3])), n: c.rotU(norm([-0.6, 0.7, 0])), colors: { e: ec }, glow: o.glow && !shut ? ["e"] : [], px: { down: [[0, 0, "e"]] }, depthTol: 2.5 });
  o.extra?.(head, body);
}
function raven(c: Ctx) {
  birdBody(c, RAVEN, {
    z: 15, span: 8.5, beak: M.iron, tailL: 3.2, eye: "#8fd46a", glow: true,
    extra: (head) => {
      c.S.ell(c.S.group(0), M.iron, add(head, [0, 0.4, 0.9]), [1.4, 1.3, 0.6], undefined, { part: c.S.newPart() });
      for (const s of [1, 0, -1]) c.S.cone(c.S.group(0), RAVEN, add(head, [s * 0.6, -1.2, 0.8]), 0.5, add(head, [s * 0.9, -2.8, 2.0]), 0.12, { part: c.S.newPart() });
    },
  });
}
function falcon(c: Ctx) {
  birdBody(c, FALC, {
    z: 15, span: 9.5, beak: m5("клюв", "#3a2a08", "#6a4e10", "#a07a20", "#d0a83a", "#f0d070"), tailL: 3.6, eye: "#f0c040", pointed: true,
    extra: (head, body) => {
      c.S.ell(c.S.group(0), m5("золото", "#4a2e0a", "#8a5a14", "#d6a84b", "#f0cc74", "#fff0b8"), add(head, [0, -0.2, 0.6]), [1.6, 1.6, 1.0], undefined, { part: c.S.newPart(), cut: { n: [0, 0, -1], d: 0.1 } });
      c.S.cone(c.S.group(0), m5("плюмаж", "#2a0e0a", "#5a1c14", "#8e3424", "#c05a3a", "#e48a62"), add(head, [0, -0.6, 1.4]), 0.4, add(head, [0, -2.0, 3.0]), 0.15, { part: c.S.newPart() });
      c.S.ell(c.S.group(0), m5("грудка", "#3a2c1c", "#6a5438", "#9a8058", "#c4ac82", "#e6d4ae"), add(body, c.rotU([0, 1.6, -0.2])), [1.4, 0.8, 1.6], undefined, { part: c.S.newPart(), tex: spotTex(0.2, -1.2, 11) });
      for (const s of [1, -1]) c.S.cone(c.S.group(0), m5("путы", "#2a1a0c", "#4e3418", "#7a5428", "#a07a40", "#c8a060"), c.up([0.7 * s, 0.6, 12.6]), 0.25, c.up([0.9 * s, 0.2, 10.8]), 0.2, { part: c.S.newPart() });
    },
  });
}
// ============ 3. Рысь утёсов ============
const LYNX = m5("рыжевато-серая шерсть", "#1e1812", "#3e3226", "#62503c", "#8a7256", "#b09878");
const LYNX_D = m5("пятна", "#120e0a", "#241c14", "#382c20", "#4c3c2c", "#604c38");
const MUZZ = m5("светлая морда", "#2a241c", "#5a4e3e", "#8e7e66", "#bcac90", "#e2d6bc");
function lynx(c: Ctx) {
  const { S, up } = c;
  const tx = spotTex(0.14, 0, 61, LYNX_D);
  quad(c, { body: [[[0, 2.4, 9.8], [3.0, 3.6, 2.9]], [[0, -2.8, 9.8], [2.7, 3.6, 2.6]]], fur: LYNX, tex: tx, legs: [{ x: 1.9, y: -4.2, z: 9.4, len: [4.6, 5.0], pole: [0, 1, 0.2], spread: 0.4 }, { x: 2.0, y: 4.0, z: 9.2, len: [4.4, 5.0], pole: [0, -1, 0], spread: 0.4 }], legR: [1.5, 1.05, 0.95], pawR: 1.1 });
  S.cone(S.group(0.6), LYNX, up([0, 4.6, 11.0]), 2.0, hp(c, [0, -0.8, -0.6]), 1.7, { part: S.newPart(), tex: tx });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, LYNX, c.head, [2.6, 2.3, 2.3], undefined, { part: ph, big: true, tex: tx });
  S.ell(gH, MUZZ, hp(c, [0, 1.7, -0.6]), [1.5, 1.2, 0.8], undefined, { part: ph });
  jaw(c, MUZZ, [0, 1.2, -1.2], [0, 2.4, -1.3], 0.9, 0.6, 1.1);
  S.ball(S.group(0), M_NOSE, hp(c, [0, 2.8, -0.3]), 0.4, { part: S.newPart() });
  for (const s of [1, -1]) {
    S.cone(S.group(0.3), LYNX, hp(c, [2.0 * s, 0.4, -1.0]), 0.9, hp(c, [3.4 * s, 0.2, -1.8]), 0.2, { part: S.newPart() });
    const ear = num(c, "ear") * s * 0.4;
    S.cone(S.group(0.2), LYNX, hp(c, [1.3 * s, -0.4, 1.4]), 0.8, hp(c, [(1.7 + ear) * s, -0.6, 3.6]), 0.2, { part: S.newPart() });
    S.cone(S.group(0), LYNX_D, hp(c, [(1.7 + ear) * s, -0.6, 3.5]), 0.2, hp(c, [(1.8 + ear) * s, -0.6, 4.8]), 0.12, { part: S.newPart() });
  }
  S.ell(S.group(0), MUZZ, up([0, 5.2, 9.4]), [1.8, 1.0, 1.8], undefined, { part: S.newPart(), tex: furTex(62, 0.2) });
  eyes(c, [0, 2.1, 0.5], [1.4, 1.7, 0.5], "#c8e040", LYNX.ramp[1], false, 3);
  tail(c, LYNX, [0, -6.0, 11.0], [[0, -1.0, 0.4]], [0.9, 0.8], undefined, (g, at, dir) => S.cone(g, LYNX_D, at, 0.8, add(at, mul(dir, 0.8)), 0.5, { part: S.newPart() }));
}
// ============ 4. Бронированный кабан ============
const BOAR = m5("щетина", "#1a120c", "#36261a", "#544030", "#745a44", "#94785c");
function aboar(c: Ctx) {
  const { S, up } = c;
  const tx = furTex(71, 0.22);
  quad(c, { body: [[[0, 1.6, 8.4], [3.7, 4.3, 3.6]], [[0, -3.0, 7.8], [3.3, 3.6, 3.0]]], fur: BOAR, tex: tx, legs: [{ x: 2.2, y: -3.6, z: 6.8, len: [3.4, 3.6], pole: [0, -1, 0], spread: 0.2 }, { x: 2.3, y: 3.4, z: 6.8, len: [3.4, 3.6], pole: [0, -1, 0], spread: 0.2 }], legR: [1.8, 1.1, 0.8], pawR: 0.8, paw: m5("копыто", "#0e0a08", "#1e1612", "#30241c", "#443428", "#5a4636") });
  for (let k = 0; k < 4; k++) {
    S.ell(S.group(0), M.steel, up([0, 3.2 - k * 2.2, 11.0 - k * 0.3]), [3.9, 1.6, 1.6], undefined, { part: S.newPart(), cut: { n: [0, 0, -1], d: 0.2 } });
    for (const x of [-2.4, 0, 2.4]) S.ball(S.group(0), m5("заклёпка", "#2a1e0e", "#5a4020", "#8a6a34", "#c49a52", "#f0d08a"), up([x, 3.9 - k * 2.2, 12.3 - k * 0.3 - Math.abs(x) * 0.25]), 0.42, { part: S.newPart() });
  }
  S.box(S.group(0), M.leather, up([0, -0.6, 10.4]), [3.9, 4.8, 0.5], [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])], 0.4, { part: S.newPart() });
  for (const s of [1, -1]) S.cone(S.group(0), M.iron, up([3.2 * s, 1.0, 10.4]), 0.5, up([4.4 * s, 1.0, 11.4]), 0.12, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, BOAR, c.head, [2.6, 2.8, 2.6], undefined, { part: ph, big: true, tex: tx });
  S.cone(gH, BOAR, hp(c, [0, 1.4, -0.6]), 1.8, hp(c, [0, 4.0, -1.4]), 1.2, { part: ph });
  jaw(c, BOAR, [0, 1.4, -1.6], [0, 3.6, -2.0], 1.1, 0.8, 1.0);
  S.ell(S.group(0), m5("пятак", "#3a1a1a", "#6a3632", "#9a5a50", "#c08074", "#deaa9a"), hp(c, [0, 4.4, -1.4]), [1.1, 0.4, 0.9], undefined, { part: S.newPart(), tone: -0.3 });
  S.box(S.group(0), M.steel, hp(c, [0, 1.6, 0.9]), [1.6, 2.2, 0.4], [c.rotU([1, 0, 0]), norm(c.rotU([0, 1, -0.4])), norm(c.rotU([0, 0.4, 1]))], 0.3, { part: S.newPart() });
  S.cone(S.group(0), M.iron, hp(c, [0, 1.0, 1.6]), 0.5, hp(c, [0, 1.6, 3.4]), 0.12, { part: S.newPart() });
  for (const s of [1, -1]) {
    S.cone(S.group(0), M.bone, hp(c, [1.0 * s, 3.2, -2.0]), 0.6, hp(c, [2.0 * s, 4.4, 0.4]), 0.12, { part: S.newPart() });
    S.cone(S.group(0.2), BOAR, hp(c, [1.6 * s, -0.6, 1.6]), 0.8, hp(c, [2.4 * s, -1.0, 2.6 + num(c, "ear") * 0.5]), 0.2, { part: S.newPart() });
  }
  eyes(c, [0, 2.0, 0.6], [1.6, 1.6, 0.6], "#e04a2a", BOAR.ramp[1], true, 3);
  tail(c, BOAR, [0, -6.4, 9.0], [[0, -0.8, -0.8], [0.2, -0.4, -1.0]], [0.4, 0.3, 0.25]);
}
// ============ 6. Костяная гончая ============
const BONE = m5("кость", "#2e2620", "#5a4c3c", "#8c7a60", "#bcaa88", "#e4d8b8");
function hound(c: Ctx) {
  const { S, up } = c;
  S.cone(S.group(0), BONE, up([0, -5.0, 10.4]), 0.8, up([0, 5.0, 11.6]), 0.9, { part: S.newPart() });
  for (let k = 0; k < 4; k++) S.ell(S.group(0), BONE, up([0, 3.4 - k * 1.5, 9.6]), [2.6 - k * 0.2, 0.45, 2.4 - k * 0.2], undefined, { part: S.newPart(), cut: { n: [0, 0, 1], d: 1.6 } });
  S.ell(S.group(0.4), BONE, up([0, -4.6, 10.2]), [2.2, 1.6, 1.4], undefined, { part: S.newPart() });
  S.ell(S.group(0), m5("рваная шкура", "#120a10", "#24142a", "#3a2244", "#55345e", "#704a7a"), up([0, 0.2, 11.8]), [2.8, 5.4, 1.0], undefined, { part: S.newPart(), cut: { n: [1, 0, 0], d: 0.8 } });
  for (let k = 0; k < 4; k++) S.cone(S.group(0), M.iron, up([0, 3.2 - k * 2.2, 12.2]), 0.45, up([0, 2.6 - k * 2.2, 14.0]), 0.1, { part: S.newPart() });
  S.cone(S.group(0), BONE, up([0, 5.0, 11.6]), 0.9, hp(c, [0, -1.0, -0.4]), 0.8, { part: S.newPart() });
  S.ell(S.group(0), M.iron, up([0, 5.6, 11.8]), [1.8, 1.0, 1.8], undefined, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, BONE, c.head, [2.3, 2.3, 2.0], undefined, { part: ph, big: true });
  S.cone(gH, BONE, hp(c, [0, 1.2, -0.4]), 1.3, hp(c, [0, 4.4, -1.0]), 0.6, { part: ph });
  jaw(c, BONE, [0, 1.0, -1.3], [0, 3.8, -2.0], 0.8, 0.45, 1.4);
  for (const s of [1, -1]) S.cone(S.group(0), BONE, hp(c, [1.2 * s, -0.6, 1.2]), 0.6, hp(c, [1.8 * s, -1.6, 3.0]), 0.15, { part: S.newPart() });
  eyes(c, [0, 2.0, 0.6], [1.2, 1.6, 0.6], "#a8f080", hex("#120c0e"), true, 3, GREEN[2]);
  const legs = legsOf(c, [{ x: 1.8, y: -4.4, z: 9.6, len: [4.6, 5.0], pole: [0, 1, 0.2], spread: 0.6 }, { x: 2.0, y: 3.8, z: 9.4, len: [4.4, 5.0], pole: [0, -1, 0], spread: 0.6 }]);
  for (const pr of legs) for (const L of pr) drawLeg4(c, L, BONE, [0.9, 0.7, 0.6], { pawR: 0.8, claws: M_CLAW, clawN: 3 });
  tail(c, BONE, [0, -6.0, 10.6], [[0, -1.4, -0.6], [0, -1.4, -1.0], [0, -1.0, -1.2]], [0.6, 0.5, 0.4, 0.3]);
  S.ball(S.group(0), M_GREEN, up([0, 1.6, 9.8]), 1.2, { part: S.newPart() });
  for (const sd of [1, -1]) S.cone(S.group(0), M.iron, up([1.7 * sd, 5.6, 12.0]), 0.4, up([2.8 * sd, 5.8, 12.6]), 0.1, { part: S.newPart() });
}
// ============ 7. Пепельная саламандра ============
const SAL = m5("угольная чешуя", "#0e0a0a", "#1e1616", "#30241f", "#463630", "#5e4a42");
function salamander(c: Ctx) {
  const { S, up } = c;
  const crackT: TexFn = combo((q) => (q.edge ? 0 : Math.abs(Math.sin(q.l[1] * 1.6 + Math.sin(q.l[0] * 1.3) * 1.2)) < 0.16 ? { mat: M_EMBER, d: 0 } : 0), feather);
  quad(c, { body: [[[0, 0, 4.8], [2.4, 5.6, 2.0]]], fur: SAL, tex: crackT, legs: [{ x: 2.0, y: -3.2, z: 4.0, len: [2.4, 2.6], pole: [0, 0, 1], spread: 2.0 }, { x: 2.0, y: 2.8, z: 4.0, len: [2.4, 2.6], pole: [0, 0, 1], spread: 2.2 }], legR: [0.9, 0.7, 0.55], pawR: 0.6, claws: M_CLAW });
  S.cone(S.group(0.5), SAL, up([0, 4.4, 5.4]), 1.6, hp(c, [0, -1.0, -0.2]), 1.3, { part: S.newPart() });
  const gH = S.group(0.5);
  const ph = S.newPart();
  S.ell(gH, SAL, c.head, [1.8, 2.6, 1.3], undefined, { part: ph, big: true });
  jaw(c, SAL, [0, 0.0, -0.9], [0, 2.4, -1.0], 1.2, 0.6, 1.2);
  const fl = 1 + num(c, "flare") * 0.6;
  for (let k = 0; k < 6; k++) S.cone(S.group(0), M_EMBER, up([0, 3.6 - k * 1.5, 6.6]), 0.55, up([0, 3.2 - k * 1.5, 6.6 + (1.4 + (k % 2) * 0.6) * fl]), 0.15, { part: S.newPart() });
  for (const s of [1, -1]) S.ell(S.group(0.2), m5("воротник", "#2a0a06", "#561a0e", "#8a3018", "#b85424", "#e08038"), hp(c, [1.8 * s, -0.8, 0.2]), [1.4 * fl, 0.3, 1.2 * fl], [norm(c.rotU([s, -0.3, 0])), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])], { part: S.newPart() });
  if (num(c, "tongue") > 0.5) S.cone(S.group(0), m5("язык", "#3a0a10", "#6a1420", "#a02a38", "#d04a5a", "#f07a88"), hp(c, [0, 2.4, -0.6]), 0.25, hp(c, [0, 4.2, -0.8]), 0.15, { part: S.newPart() });
  eyes(c, [0, 1.9, 0.5], [1.3, 1.5, 0.5], "#ffd060", SAL.ramp[1], true, 3, EMBER[2]);
  tail(c, SAL, [0, -5.2, 4.6], [[0.6, -2.0, -1.0], [1.4, -2.0, -0.8], [1.8, -1.4, -0.4], [1.4, -1.0, 0.2]], [1.5, 1.1, 0.8, 0.5, 0.25], crackT, (g, at) => S.ball(g, M_EMBER, at, 0.6, { part: S.newPart() }));
}
// ============ 8. Малый рунный голем ============
const STONE = m5("камень голема", "#141416", "#2a2a30", "#45454e", "#62626c", "#86868f");
function golem(c: Ctx) {
  const { S, up } = c;
  const pulse = num(c, "rune", 1);
  const MR = glowMat("руны", pulse > 0.7 ? RUNE : R("#0a1e2a", "#10405a", "#1e7090", "#4ab0d0", "#a0e8f8"), 2.4);
  const rn: TexFn = (q) => (q.edge ? 0 : (Math.abs(((q.l[0] + 20) % 2.6) - 1.3) < 0.18 && Math.abs(q.l[2] % 3) < 1.6 ? { mat: MR, d: 0 } : 0));
  const gT = S.group(0.8);
  const pt = S.newPart();
  S.ell(gT, STONE, up([0, 0, 13.0]), [4.4, 3.0, 3.8], undefined, { part: pt, big: true, tex: rn });
  S.ell(gT, STONE, c.pelvisC, [3.0, 2.2, 1.8], undefined, { part: pt });
  S.ball(S.group(0), MR, up([0, 2.6, 13.4]), 1.0, { part: S.newPart() });
  for (const [a, b] of [[[-1.6, 2.7, 15.2], [1.6, 2.7, 15.2]], [[-1.4, 2.6, 11.6], [0, 2.9, 12.2]], [[1.4, 2.6, 11.6], [0, 2.9, 12.2]], [[3.6, 1.2, 13.8], [3.0, 2.0, 11.8]], [[-3.6, 1.2, 13.8], [-3.0, 2.0, 11.8]]] as [V3, V3][]) S.cone(S.group(0), MR, up(a), 0.32, up(b), 0.32, { part: S.newPart() });
  S.ell(S.group(0), m5("мох", "#0e1a0c", "#1c3018", "#2e4a26", "#466a38", "#62884c"), up([-2.4, 0, 16.0]), [2.0, 2.4, 0.8], undefined, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.box(gH, STONE, c.head, [1.9, 1.8, 1.6], [c.rotU([1, 0, 0]), c.rotU([0, 1, 0]), c.rotU([0, 0, 1])], 0.6, { part: ph, big: true });
  const eyeK = c.p.blink > 0.5 ? "g" : "G";
  face(c, { at: [0, 1.9, 0.2], sideAt: [1.2, 1.7, 0.2], colors: { G: RUNE[3], g: RUNE[1] }, glow: ["G", "g"], halo: RUNE[1], down: [[`${eyeK}g${eyeK}`], -1, 0], side: [[eyeK], 0, 0] });
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: STONE, r: [1.7, 1.5, 1.7], tex: rn }, 2.0);
    S.ell(S.group(0), STONE, add(c.sh[i], [0, 0, 0.6]), [2.0, 1.9, 1.5], undefined, { part: S.newPart() });
    drawLeg(c, i, { mat: STONE, r: [1.7, 1.5, 1.5] });
    drawFoot(c, i, STONE, 2.0, 1.4, 1.2);
  }
}
// ============ 9. Призрачный лис ============
const FOX = mat("призрачная шерсть", GHOST, { base: 2.1, gain: 2.0 });
function fox(c: Ctx) {
  const { S, up } = c;
  quad(c, { body: [[[0, 1.8, 9.6], [2.3, 3.2, 2.3]], [[0, -2.4, 9.6], [2.2, 3.2, 2.2]]], fur: FOX, legs: [{ x: 1.4, y: -3.6, z: 9.0, len: [4.0, 4.4], pole: [0, 1, 0.2], spread: 0.3 }, { x: 1.5, y: 3.4, z: 9.0, len: [4.0, 4.4], pole: [0, -1, 0], spread: 0.3 }], legR: [1.1, 0.75, 0.6], pawR: 0.75 });
  S.cone(S.group(0.6), FOX, up([0, 3.8, 10.6]), 1.6, hp(c, [0, -0.8, -0.6]), 1.3, { part: S.newPart() });
  const gH = S.group(0.6);
  const ph = S.newPart();
  S.ell(gH, FOX, c.head, [2.1, 2.0, 1.9], undefined, { part: ph, big: true });
  S.cone(gH, FOX, hp(c, [0, 1.2, -0.3]), 1.1, hp(c, [0, 4.0, -0.7]), 0.35, { part: ph });
  jaw(c, FOX, [0, 1.2, -0.9], [0, 3.4, -1.1], 0.7, 0.3, 1.0);
  for (const s of [1, -1]) S.cone(S.group(0.2), FOX, hp(c, [1.2 * s, -0.4, 1.2]), 0.9, hp(c, [(1.9 + num(c, "ear") * 0.4) * s, -0.6, 3.8]), 0.15, { part: S.newPart() });
  eyes(c, [0, 1.8, 0.4], [1.2, 1.4, 0.4], "#e4f4ff", GHOST[1], true, 3, GHOST[2]);
  const sw = c.p.tail;
  for (const s of [1, -1]) tail(c, FOX, [0.6 * s, -5.0, 10.4], [[(1.2 + sw * 0.3) * s, -1.6, 1.0], [(1.6 + sw * 0.5) * s, -1.8, 1.6], [(1.0 + sw * 0.6) * s, -1.4, 1.6]], [1.0, 1.6, 1.4, 0.4], undefined, (g, at) => S.ball(g, M_GHOSTG, at, 0.7, { part: S.newPart() }));
  S.ball(S.group(0), M_GHOSTG, up([0, 3.6, 11.6]), 0.6 + num(c, "glowUp") * 0.4, { part: S.newPart() });
  // призрачный шлейф: дымка под брюхом и позади, тает к концу
  const gw = S.group(0.5);
  const pw = S.newPart();
  S.cone(gw, FOX, up([0, 0.6, 8.2]), 1.6, up([0, -5.4 - sw * 0.2, 6.4]), 0.9, { part: pw });
  S.cone(gw, FOX, up([0, -5.4 - sw * 0.2, 6.4]), 0.9, up([sw * 0.8, -8.4, 4.6]), 0.3, { part: pw });
  S.cone(S.group(0), M_GHOSTG, up([sw * 0.8, -8.4, 4.6]), 0.35, up([sw * 1.2, -9.4, 4.0]), 0.2, { part: S.newPart() });
}
// ============ 10. Ящер трясины ============
const BOG = m5("болотная чешуя", "#0e1410", "#1c2a1e", "#2e4430", "#466246", "#64805c");
const MOSS = m5("мох", "#121a0a", "#243414", "#3a5020", "#56702e", "#7a9442");
function bog(c: Ctx) {
  const { S, up } = c;
  const tx = combo(spotTex(0.12, -0.6, 85), feather);
  quad(c, { body: [[[0, 0, 5.8], [3.6, 5.6, 2.8]]], fur: BOG, tex: tx, legs: [{ x: 2.8, y: -3.4, z: 5.0, len: [2.8, 3.0], pole: [0, 0, 1], spread: 2.0 }, { x: 2.8, y: 3.2, z: 5.0, len: [2.8, 3.0], pole: [0, 0, 1], spread: 2.2 }], legR: [1.5, 1.1, 0.9], pawR: 0.9, claws: M_CLAW });
  for (let k = 0; k < 4; k++) S.ell(S.group(0), m5("пластина", "#1a1812", "#34302a", "#524a3e", "#746a58", "#968a74"), up([0, 3.0 - k * 2.0, 8.2]), [2.6 - Math.abs(k - 1.5) * 0.3, 1.4, 0.8], undefined, { part: S.newPart(), tex: spotTex(0.3, 0, 7, MOSS) });
  for (const [x, y] of [[1.2, 1.6], [-1.4, -2.2]] as [number, number][]) S.ell(S.group(0), m5("гриб", "#2a1408", "#5a2e12", "#8e5020", "#c07a34", "#e8a858"), up([x, y, 9.4]), [0.8, 0.8, 0.45], undefined, { part: S.newPart() });
  S.cone(S.group(0.5), BOG, up([0, 4.6, 6.4]), 2.4, hp(c, [0, -1.0, -0.4]), 1.9, { part: S.newPart(), tex: tx });
  const gH = S.group(0.5);
  const ph = S.newPart();
  S.ell(gH, BOG, c.head, [2.3, 3.0, 1.6], undefined, { part: ph, big: true, tex: tx });
  jaw(c, BOG, [0, 0.0, -1.0], [0, 2.8, -1.1], 1.5, 0.8, 1.3);
  for (const s of [1, -1]) S.cone(S.group(0), MOSS, hp(c, [1.6 * s, -1.0, 0.6]), 0.5, hp(c, [2.6 * s, -2.4, 1.4]), 0.12, { part: S.newPart() });
  eyes(c, [0, 1.8, 0.6], [1.6, 1.3, 0.6], "#c8e040", BOG.ramp[1], true, 3, GREEN[1]);
  tail(c, BOG, [0, -5.4, 5.6], [[0.6, -2.0, -1.4], [1.4, -1.8, -1.0], [1.6, -1.2, -0.4]], [2.0, 1.4, 0.9, 0.3], tx);
}
void [GOLD, POISON, mix];

// =============================== анимации ===============================
type Kind = "quad" | "bird" | "golem";
type Atk = "bite" | "swipe" | "charge" | "spit" | "cast" | "screech" | "dive" | "slam" | "poison";
interface Spec { scale?: number; id: string; ru: string; build: (c: Ctx) => void; kind: Kind; atk: Atk; act: string; fx: Ramp; iconView: View; spawnCol: Ramp; deathFx: "roll" | "bones" | "fall" | "dust" | "fade" }
const SPECS: Spec[] = [
  { id: "ash_bear", ru: "ПЕПЕЛЬНЫЙ МЕДВЕДЬ", build: bear, kind: "quad", atk: "swipe", act: "ВСТАЁТ НА ДЫБЫ, НЮХАЕТ ВОЗДУХ", fx: EMBER, iconView: "side", spawnCol: EMBER, deathFx: "roll" },
  { scale: 0.84, id: "war_raven", ru: "БОЕВОЙ ВОРОН", build: raven, kind: "bird", atk: "dive", act: "ЧИСТИТ ПЕРЬЯ, КАРКАЕТ", fx: GREEN, iconView: "down", spawnCol: GREEN, deathFx: "fall" },
  { scale: 0.84, id: "cliff_lynx", ru: "РЫСЬ УТЁСОВ", build: lynx, kind: "quad", atk: "bite", act: "САДИТСЯ, ПОВОДИТ УШАМИ, ЗЕВАЕТ", fx: EMBER, iconView: "side", spawnCol: GOLD, deathFx: "roll" },
  { id: "iron_boar", ru: "БРОНИРОВАННЫЙ КАБАН", build: aboar, kind: "quad", atk: "charge", act: "РОЕТ ЗЕМЛЮ, ФЫРКАЕТ", fx: EMBER, iconView: "side", spawnCol: GOLD, deathFx: "roll" },
  { scale: 0.84, id: "sol_falcon", ru: "СОКОЛ СОЛЬГАРДА", build: falcon, kind: "bird", atk: "screech", act: "РАСПРАВЛЯЕТ КРЫЛЬЯ, ОГЛЯДЫВАЕТСЯ", fx: GOLD, iconView: "down", spawnCol: GOLD, deathFx: "fall" },
  { id: "bone_hound", ru: "КОСТЯНАЯ ГОНЧАЯ УМБРАТА", build: hound, kind: "quad", atk: "bite", act: "КЛАЦАЕТ ЧЕЛЮСТЬЮ, НАКЛОНЯЕТ ГОЛОВУ", fx: GREEN, iconView: "side", spawnCol: GREEN, deathFx: "bones" },
  { id: "ash_salamander", ru: "ПЕПЕЛЬНАЯ САЛАМАНДРА", build: salamander, kind: "quad", atk: "spit", act: "ПРОБУЕТ ВОЗДУХ ЯЗЫКОМ, РАЗДУВАЕТ ГРЕБЕНЬ", fx: EMBER, iconView: "side", spawnCol: EMBER, deathFx: "dust" },
  { id: "rune_golem", ru: "МАЛЫЙ РУННЫЙ ГОЛЕМ", build: golem, kind: "golem", atk: "slam", act: "РУНЫ ПУЛЬСИРУЮТ, РАЗМИНАЕТ ПЛЕЧИ", fx: RUNE, iconView: "down", spawnCol: RUNE, deathFx: "dust" },
  { scale: 0.82, id: "ghost_fox", ru: "ПРИЗРАЧНЫЙ ЛИС", build: fox, kind: "quad", atk: "cast", act: "САДИТСЯ, ХВОСТЫ КРУЖАТ", fx: GHOST, iconView: "side", spawnCol: GHOST, deathFx: "fade" },
  { id: "bog_lizard", ru: "ЯЩЕР ТРЯСИНЫ", build: bog, kind: "quad", atk: "poison", act: "ШИПИТ, РАЗЕВАЕТ ПАСТЬ", fx: POISON, iconView: "side", spawnCol: POISON, deathFx: "roll" },
];

const ipx = (v: number) => Math.round(v);
function idleQuad(R0: XP, extra: (i: number, ph: number, p: XP) => void = () => {}): PFrame[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (i / 12) * Math.PI * 2;
    const p: XP = { ...R0, chest: [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0][i] };
    p.tail = Math.sin(ph * 2) * 1.6;
    p.head = [i >= 4 && i <= 6 ? 1 : 0, 0];
    p.blink = i === 9 ? 1 : 0;
    p.flap = 0.5 + 0.5 * Math.sin(ph);
    p.ear = i === 2 ? 1 : 0;
    extra(i, ph, p);
    return { p };
  });
}
function walkQuad(R0: XP, d: Creature["dims"], extra: (i: number, ph: number, p: XP) => void = () => {}): PFrame[] {
  const st = d.stride ?? 1.7;
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (i / 12) * Math.PI * 2;
    const p: XP = { ...R0 };
    const lift = (a: number) => Math.max(0, Math.sin(a)) * 1.3;
    p.fR = [d.footX, st * Math.cos(ph), 1.0 + lift(ph)];
    p.fL = [-d.footX, st * Math.cos(ph + Math.PI), 1.0 + lift(ph + Math.PI)];
    p.core = [0, 0, -ipx(Math.abs(Math.cos(ph)) * 1.0) * 1.03];
    p.tail = Math.sin(ph) * 1.4;
    p.head = [0, ipx(Math.sin(ph * 2) * 0.6)];
    extra(i, ph, p);
    return { p };
  });
}
/** Появление при призыве: круг света на земле, тело проявляется снизу вверх светлой кромкой, искры вверх. */
function spawnFx(o: FxCtx, f: number, n: number, col: Ramp) {
  const N = o.cam.N, t = f / (n - 1);
  const cx = N / 2, cy = N - 2.6;
  const ring = f < 2 ? (f + 1) / 3 : f > n - 3 ? (n - f) / 3 : 1;
  // проявление: строки выше фронта ещё пусты, у фронта — кромка цвета призыва
  const front = Math.round(N - 1 - (N - 2) * clamp((t - 0.12) / 0.62, 0, 1));
  if (t < 0.8) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!o.img.alpha(x, y)) continue;
    if (y < front - 1 || (y < front + 1 && hash01(x, y, f) < 0.5)) { o.img.clear(x, y); o.emis.clear(x, y); }
    else if (y < front + 2) { o.img.set(x, y, col[y === front + 1 ? 3 : 4]); o.emis.set(x, y, col[3]); }
  }
  groundEllipse(o, cx, cy, (N * 0.36) * ring, 2.2 * ring + 0.6, (d, a) => (d > 0.72 ? col[d > 0.9 ? 2 : 3] : Math.sin(a * 6 + f) > 0.7 ? col[2] : null), true, true);
  for (let k = 0; k < 6; k++) {
    const sx = cx + (hash01(k, 1, 3) - 0.5) * N * 0.6, sy = cy - ((f * 2.2 + k * 4) % (N * 0.7));
    if (t < 0.9) px(o, sx, sy, col[k % 2 ? 3 : 4], true);
  }
}
/** Распад: пиксели уходят снизу-сверху крупкой, горстка праха/пепла у земли. */
function dustFx(o: FxCtx, k: number, col: Ramp, up = false) {
  const N = o.cam.N;
  let top = N, bot = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (o.img.alpha(x, y)) { top = Math.min(top, y); bot = Math.max(bot, y); }
  if (bot <= top) return;
  const front = up ? bot - (bot - top + 2) * k : top + (bot - top + 2) * k;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!o.img.alpha(x, y)) continue;
    const gone = up ? y > front : y < front;
    if (gone || (Math.abs(y - front) < 2 && hash01(x, y, 9) < 0.5)) { o.img.clear(x, y); o.emis.clear(x, y); if (up && hash01(x, y, 4) < 0.08) px(o, x + (hash01(x, y, 5) - 0.5) * 4, y - 3 - k * 6, col[3], true); }
  }
  if (!up) groundEllipse(o, N / 2, N - 2.4, 3 + 7 * k, 1 + 1.2 * k, (d) => col[d < 0.4 ? 3 : d < 0.75 ? 2 : 1]);
}
function deathRoll(sc: import("../mobs/lib").Scene, axis: V3, ang: number, dz = 0) {
  const all = [...new Set(sc.prims.map((q) => q.piece))];
  const c0: V3 = [0, 0, 0];
  const low = pieceLow(sc, all, c0, axis, ang);
  return () => ({ c0, c1: [0, 0, -low + dz] as V3, axis, ang });
}

function petOf(sp: Spec): Pet {
  const rp = ROSTER.find((q) => q.id === sp.id)!;
  const cr: Creature = { ...rp.cr, build: sp.build, scale: sp.scale ? [sp.scale, sp.scale] : rp.cr.scale };
  const v = { role: cr.roles[0], elite: false };
  const d = cr.dims;
  const s = cr.scale[0];
  const bird = sp.kind === "bird";
  const golemK = sp.kind === "golem";
  const R0 = golemK ? rest(cr, v, { rune: 1 }) : rest(cr, v, { look: 0, fold: 0, grab: 0, flare: 0, tongue: 0, ear: 0, glowUp: 0, rune: 1 });
  if (golemK) { R0.hR = handAt(d, 1, [1.4, 1.2, -6.6]); R0.hL = handAt(d, -1, [1.4, 1.2, -6.6]); }
  const H = (sd: 1 | -1, x: number, y: number, z: number) => handAt(d, sd, [x, y, z]);
  const fx = sp.fx;

  // ---- покой
  const idle = (): PFrame[] => {
    if (bird) return Array.from({ length: 12 }, (_, i) => {
      const ph = (i / 12) * Math.PI * 2;
      const fl = 0.5 + 0.5 * Math.cos(ph * 2);
      return { p: { ...R0, core: [0, 0, ipx(Math.sin(ph * 2) * 1.0) * 1.03], flap: fl, blink: i === 7 ? 1 : 0, look: i >= 3 && i <= 5 ? 1 : 0, tail: Math.sin(ph) } as XP };
    });
    if (golemK) return Array.from({ length: 12 }, (_, i) => ({ p: { ...R0, chest: [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0][i], rune: 0.5 + 0.5 * Math.cos((i / 12) * Math.PI * 2), blink: i === 9 ? 1 : 0, hR: add(R0.hR, [0, 0, i >= 3 && i <= 8 ? 0.3 : 0]), hL: add(R0.hL, [0, 0, i >= 3 && i <= 8 ? 0.3 : 0]) } as XP }));
    return idleQuad(R0, (i, ph, p) => {
      if (sp.id === "ash_salamander") p.tongue = i === 5 || i === 6 ? 1 : 0;
      if (sp.id === "ghost_fox") p.glowUp = 0.5 + 0.5 * Math.sin(ph);
    });
  };
  // ---- живое действие (16)
  const act = (): PFrame[] => {
    const n = 16;
    if (bird) {
      // чистит перья / расправляет крылья: крылья раскрыты, голова под крыло, встряхивается
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 3, p: { look: -1, head: [0, -1], flap: 0.2 } }, { f: 6, p: { look: 1, flap: 0.3 } }, { f: 8, p: { flap: 1, jaw: 1, look: 0 }, ease: easeOut }, { f: 10, p: { flap: 0, jaw: 0 } }, { f: 12, p: { flap: 1, jaw: sp.id === "war_raven" ? 1 : 0 } }, { f: 15, p: { flap: 0.5, jaw: 0, head: [0, 0] } }], n);
      return ps.map((p, f) => ({ p: { ...p, core: [0, 0, ipx(Math.sin((f / n) * Math.PI * 4)) * 1.03] } as XP }));
    }
    if (golemK) {
      const ps = keyed(R0, [{ f: 0, p: {} }, { f: 4, p: { hR: H(1, 2.6, 0.4, -3.0), hL: H(-1, 2.6, 0.4, -3.0), rune: 1, chest: 1, yaw: rad(10) }, ease: easeOut }, { f: 8, p: { yaw: rad(-10), rune: 0.3 } }, { f: 11, p: { yaw: 0, rune: 1, hR: R0.hR, hL: R0.hL, chest: 0 } }, { f: 15, p: { rune: 0.6 } }], n);
      return ps.map((p) => ({ p }));
    }
    const hindFwd = (k: number): Partial<XP> => ({ fR: [d.footX, 0.2 + 2.4 * k, 1.0], fL: [-d.footX, -0.2 + 2.4 * k, 1.0] });
    let keys: { f: number; p: Partial<XP>; ease?: (t: number) => number }[];
    switch (sp.id) {
      case "ash_bear": keys = [{ f: 0, p: {} }, { f: 4, p: { lean: rad(30), core: [0, -1.5, 2.06], jaw: 0.4, head: [0, 1] }, ease: easeOut }, { f: 7, p: { head: [1, 1] } }, { f: 9, p: { head: [-1, 1], jaw: 1 } }, { f: 12, p: { lean: 0, core: [0, 0, 0], jaw: 0, head: [0, 0] }, ease: easeIn }, { f: 15, p: {} }]; break;
      case "cliff_lynx": case "ghost_fox": keys = [{ f: 0, p: {} }, { f: 4, p: { lean: rad(22), core: [0, -1.0, -2.06], ...hindFwd(1) } }, { f: 6, p: { ear: 1, tail: 2 } }, { f: 8, p: { jaw: 1, head: [0, 1], ear: 0, tail: -2, glowUp: 1 } }, { f: 10, p: { jaw: 0, head: [0, 0], tail: 2 } }, { f: 13, p: { lean: 0, core: [0, 0, 0], ...hindFwd(0), tail: 0, glowUp: 0 } }, { f: 15, p: {} }]; break;
      case "iron_boar": keys = [{ f: 0, p: {} }, { f: 2, p: { fR: [d.footX, 1.6, 2.2], lean: rad(-6), head: [0, -1] } }, { f: 4, p: { fR: [d.footX, -0.6, 1.0] } }, { f: 6, p: { fR: [d.footX, 1.6, 2.2] } }, { f: 8, p: { fR: [d.footX, -0.6, 1.0] } }, { f: 10, p: { jaw: 1, head: [0, 1], ear: 1, lean: rad(4) } }, { f: 12, p: { jaw: 0, ear: 0 } }, { f: 15, p: { fR: R0.fR, lean: 0, head: [0, 0] } }]; break;
      case "bone_hound": keys = [{ f: 0, p: {} }, { f: 2, p: { jaw: 1 } }, { f: 3, p: { jaw: 0 } }, { f: 4, p: { jaw: 1 } }, { f: 5, p: { jaw: 0 } }, { f: 8, p: { head: [1, 1], lean: rad(6) } }, { f: 11, p: { head: [-1, 1] } }, { f: 15, p: { head: [0, 0], lean: 0 } }]; break;
      case "ash_salamander": keys = [{ f: 0, p: {} }, { f: 2, p: { tongue: 1, head: [0, 1] } }, { f: 3, p: { tongue: 0 } }, { f: 4, p: { tongue: 1 } }, { f: 5, p: { tongue: 0 } }, { f: 8, p: { flare: 1, jaw: 0.6, head: [0, 1] }, ease: easeOut }, { f: 12, p: { flare: 0, jaw: 0, head: [0, 0] } }, { f: 15, p: {} }]; break;
      default: keys = [{ f: 0, p: {} }, { f: 4, p: { jaw: 1, head: [0, 1], lean: rad(8) }, ease: easeOut }, { f: 8, p: { jaw: 1, head: [1, 1] } }, { f: 11, p: { jaw: 0, head: [0, 0], lean: 0 } }, { f: 15, p: {} }];
    }
    const ps = keyed(R0, keys, n);
    return ps.map((p, f) => ({ p: { ...p, blink: f === 13 ? 1 : 0 } as XP, over: sp.id === "ash_salamander" && f >= 8 && f <= 11 ? (o) => { const [x, y] = o.pt(o.B.mouth); for (let k = 0; k < 3; k++) px(o, x + k - 1, y - 2 - ((f + k) % 3), EMBER[3 + (k % 2)], true); } : undefined }));
  };
  // ---- ходьба / полёт
  const walk = (): PFrame[] => {
    if (bird) return Array.from({ length: 12 }, (_, i) => {
      const ph = (i / 12) * Math.PI * 2;
      const fl = 0.5 + 0.5 * Math.cos(ph * 2);
      return { p: { ...R0, lean: rad(-14), core: [0, 0, ipx(-Math.sin(ph * 2) * 1.2) * 1.03], flap: fl * fl * (3 - 2 * fl), tail: Math.sin(ph) * 1.5 } as XP };
    });
    if (golemK) {
      const st = 1.5;
      return Array.from({ length: 12 }, (_, i) => {
        const ph = (i / 12) * Math.PI * 2;
        const lift = (a: number) => Math.max(0, Math.sin(a)) * 1.2;
        const sw = Math.cos(ph) * 1.4;
        return { p: { ...R0, fR: [d.footX, st * Math.cos(ph), 1.0 + lift(ph)], fL: [-d.footX, st * Math.cos(ph + Math.PI), 1.0 + lift(ph + Math.PI)], core: [0, 0, -ipx(Math.abs(Math.cos(ph))) * 1.03], hR: add(R0.hR, [0, -sw, 0]), hL: add(R0.hL, [0, sw, 0]), yaw: rad(Math.sin(ph) * 5) } as XP };
      });
    }
    return walkQuad(R0, d);
  };
  // ---- атака
  const attack = (): PFrame[] => {
    const n = 10;
    const proj = (o: FxCtx, f: number, from: number, ramp: Ramp, sz = 2) => {
      if (f < from || f > from + 2) return;
      const t = f - from;
      const at = add(o.B.mouth, [0, (3 + t * 4) * s, 0.4 * s]);
      let [x, y] = o.pt(at);
      x = clamp(x, 3, o.cam.N - 4); y = clamp(y, 3, o.cam.N - 5);
      orb(o, x, y, sz - t * 0.3, ramp, f, 2);
    };
    switch (sp.atk) {
      case "bite": {
        const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: { core: [0, -1.0, -1.03], lean: rad(-8), jaw: 0.3, ear: 1 }, ease: easeOut }, { f: 4, p: { core: [0, 1.6, 1.03], lean: rad(-12), jaw: 1, fR: [d.footX, 2.0, 1.4], fL: [-d.footX, 1.0, 1.0] }, ease: easeIn }, { f: 5, p: { jaw: 0, core: [0, 1.6, 0] } }, { f: 6, p: { jaw: 0.6 } }, { f: 9, p: { core: [0, 0, 0], lean: 0, jaw: 0, fR: R0.fR, fL: R0.fL, ear: 0 } }], n);
        return ps.map((p, f) => ({ p, over: f === 5 ? (o) => { const [x, y] = o.pt(o.B.mouth); for (let k = 0; k < 4; k++) px(o, x + (k - 1.5) * 2, y + (k % 2) - 1, fx[3], true); } : undefined }));
      }
      case "swipe": {
        const ps = keyed(R0, [{ f: 0, p: {} }, { f: 3, p: { lean: rad(34), core: [0, -1.5, 3.09], jaw: 1, head: [0, 1] }, ease: easeOut }, { f: 5, p: { lean: rad(-8), core: [0, 2.0, 0], jaw: 1, fR: [d.footX, 2.4, 1.0] }, ease: easeIn }, { f: 6, p: { jaw: 0.4 } }, { f: 9, p: { lean: 0, core: [0, 0, 0], jaw: 0, head: [0, 0], fR: R0.fR } }], n);
        return ps.map((p, f) => ({ p, over: f === 5 || f === 6 ? (o) => { const N = o.cam.N; groundEllipse(o, N / 2, N - 2.8, 4 + (f - 4) * 3, 1.6, (dd) => (dd > 0.6 ? EMBER[f === 5 ? 3 : 2] : null), true, true); } : undefined }));
      }
      case "charge": {
        const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: { core: [0, -1.5, 0], lean: rad(-10), head: [0, -1], fR: [d.footX, -1.2, 1.0] } }, { f: 4, p: { core: [0, 1.8, 0], lean: rad(-14), fR: [d.footX, 1.8, 1.6], fL: [-d.footX, 0.6, 1.0] }, ease: easeIn }, { f: 5, p: { head: [0, 2], jaw: 0.6, lean: rad(6) } }, { f: 6, p: { head: [0, 1] } }, { f: 9, p: { core: [0, 0, 0], lean: 0, head: [0, 0], jaw: 0, fR: R0.fR, fL: R0.fL } }], n);
        return ps.map((p, f) => ({ p, over: f >= 3 && f <= 5 ? (o) => { const N = o.cam.N; for (let k = 0; k < 5; k++) px(o, N / 2 - 6 + k * 3 - (f - 3) * 2, N - 3 - (k % 2), R("#4a3d2e", "#7a6a52", "#a69478", "#cbbc9c", "#e6dcc4")[1 + (k % 3)]); } : undefined }));
      }
      case "spit": case "poison": {
        const ps = keyed(R0, [{ f: 0, p: {} }, { f: 3, p: { head: [0, 2], jaw: 0.5, flare: 1, lean: rad(8) }, ease: easeOut }, { f: 4, p: { head: [0, 0], jaw: 1, lean: rad(-6), core: [0, 1.0, 0] }, ease: easeIn }, { f: 6, p: { jaw: 0.6 } }, { f: 9, p: { head: [0, 0], jaw: 0, flare: 0, lean: 0, core: [0, 0, 0] } }], n);
        return ps.map((p, f) => ({ p, over: (o) => proj(o, f, 4, sp.atk === "spit" ? EMBER : POISON, sp.atk === "spit" ? 2.2 : 1.8) }));
      }
      case "cast": {
        const ps = keyed(R0, [{ f: 0, p: {} }, { f: 3, p: { lean: rad(20), core: [0, -1.0, -2.06], fR: [d.footX, 2.6, 1.0], fL: [-d.footX, 2.2, 1.0], head: [0, 1], glowUp: 1, tail: 2 } }, { f: 6, p: { jaw: 1, tail: -2 } }, { f: 9, p: { lean: 0, core: [0, 0, 0], fR: R0.fR, fL: R0.fL, head: [0, 0], glowUp: 0, jaw: 0, tail: 0 } }], n);
        return ps.map((p, f) => ({ p, over: f >= 3 && f <= 8 ? (o) => { const N = o.cam.N; for (let k = 0; k < 5; k++) { const a = k * 1.25 + f * 0.7; px(o, N / 2 + Math.cos(a) * (6 + k), N - 6 - ((f - 3) * 2.4 + k * 3) % 18, GHOST[3 + (k % 2)], true); } } : undefined }));
      }
      case "dive": case "screech": {
        const dive = sp.atk === "dive";
        const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: { core: [0, -1.0, 2.06], flap: 1, lean: rad(10), jaw: dive ? 0 : 1 }, ease: easeOut }, { f: 4, p: dive ? { core: [0, 2.6, -4.12], flap: 0, lean: rad(-30), grab: 1, jaw: 1 } : { flap: 1, jaw: 1, core: [0, 0, 2.06] }, ease: easeIn }, { f: 5, p: dive ? { jaw: 0 } : { flap: 0.2 } }, { f: 6, p: { flap: 1 } }, { f: 9, p: { core: [0, 0, 0], flap: 0.5, lean: 0, grab: 0, jaw: 0 } }], n);
        return ps.map((p, f) => ({ p, over: !dive && f >= 3 && f <= 7 ? (o) => { const [x, y] = o.pt(o.B.mouth); for (let k = 0; k < 3; k++) { const r = 2 + (f - 3 + k) * 2.2; for (let a = -0.7; a <= 0.7; a += 0.35) px(o, x + Math.sin(a) * r, y - Math.cos(a) * r * 0.6 - 2, GOLD[3], true); } } : undefined }));
      }
      case "slam": {
        const ps = keyed(R0, [{ f: 0, p: {} }, { f: 3, p: { hR: H(1, -2.2, 1.0, 3.4), hL: H(-1, -2.2, 1.0, 3.4), lean: rad(8), rune: 1 }, ease: easeOut }, { f: 5, p: { hR: H(1, -2.6, 4.2, -6.8), hL: H(-1, -2.6, 4.2, -6.8), lean: rad(-16), core: [0, 1.0, -1.03] }, ease: easeIn }, { f: 6, p: { rune: 0.4 } }, { f: 9, p: { hR: R0.hR, hL: R0.hL, lean: 0, core: [0, 0, 0], rune: 1 } }], n);
        return ps.map((p, f) => ({ p, over: f === 5 || f === 6 ? (o) => { const N = o.cam.N; groundEllipse(o, N / 2, N - 3.0, 5 + (f - 5) * 4, 1.8, (dd) => (dd > 0.55 ? RUNE[f === 5 ? 3 : 2] : null), true, true); } : undefined }));
      }
    }
  };
  // ---- урон
  const hurt = (): PFrame[] => {
    const hit: Partial<XP> = bird ? { core: [0, -1.0, 2.06], lean: rad(14), flap: 1, jaw: 1, head: [0, 1] } : golemK ? { core: [0, -1.0, 0], lean: rad(10), rune: 0.2, hR: add(R0.hR, [0.5, -1, 1]), hL: add(R0.hL, [-0.5, -1, 1]) } : { core: [0, -1.0, 0], lean: rad(10), jaw: 1, head: [0, 1], ear: 1, tail: 2 };
    const ps = keyed(R0, [{ f: 0, p: {} }, { f: 1, p: hit, ease: easeOut }, { f: 2, p: { ...hit } }, { f: 4, p: { core: [0, -0.5, 0], lean: rad(4), jaw: 0, head: [0, 0] } }, { f: 7, p: { core: R0.core, lean: 0, flap: R0.flap, hR: R0.hR, hL: R0.hL, rune: 1, ear: 0, tail: 0 } }], 8);
    return ps.map((p, f) => ({ p, over: f >= 1 && f <= 3 ? (o) => { const N = o.cam.N; for (let k = 0; k < 4; k++) { const a = -2.4 + k * 0.9; const r = 2 + (f - 1) * 2.4; px(o, N / 2 + Math.cos(a) * r, N * 0.45 + Math.sin(a) * r, k % 2 ? hex("#f2ead2") : fx[3], k % 2 === 0); } } : undefined }));
  };
  // ---- гибель
  const death = (): PFrame[] => {
    const n = 12;
    return Array.from({ length: n }, (_, f) => {
      const t = clamp((f - 1) / 6, 0, 1);
      const p: XP = { ...R0, jaw: f < 4 ? 1 : 0.6, blink: f >= 7 ? 1 : 0, flap: bird ? 0.5 : R0.flap, fold: bird ? clamp(f / 5, 0, 1) : 0, rune: golemK ? Math.max(0, 1 - f / 5) : 1, lean: f === 0 ? rad(10) : 0, core: f === 0 ? [0, -1, 0] : [0, 0, 0] };
      if (bird) p.core = [0, 0, -easeIn(t) * 10 * 1.03];
      const fr: PFrame = { p };
      if (f >= 1 && (sp.deathFx === "roll" || sp.deathFx === "bones" || sp.deathFx === "fade" || (bird && f >= 6))) {
        const ang = rad(84) * easeInOut(bird ? clamp((f - 6) / 3, 0, 1) : t);
        fr.rigid = (sc, view) => deathRoll(sc, view === "side" ? [0, 1, 0] : [0, 1, 0], ang);
      }
      if (golemK && f >= 1) fr.rigid = (sc) => deathRoll(sc, [1, 0, 0], rad(-20) * t, -easeIn(clamp((f - 4) / 7, 0, 1)) * 6);
      fr.over = (o) => {
        if (sp.deathFx === "dust" && f >= 4) dustFx(o, clamp((f - 4) / 7, 0, 1), golemK ? R("#141416", "#2a2a30", "#45454e", "#62626c", "#86868f") : R("#1e1c1a", "#3c3a36", "#5e5a54", "#86827a", "#b0aca2"));
        if (sp.deathFx === "fade" && f >= 5) dustFx(o, clamp((f - 5) / 6, 0, 1), GHOST, true);
        if (sp.deathFx === "bones" && f >= 7) for (let k = 0; k < 3; k++) px(o, o.cam.N / 2 + (k - 1) * 2, o.cam.N - 8 - (f - 7) * 2 - k, GREEN[3], true);
        if ((sp.deathFx === "roll" || bird) && (f === 7 || f === 8)) groundEllipse(o, o.cam.N / 2, o.cam.N - 2.4, 6 + (f - 7) * 3, 1.4, (dd) => (dd > 0.5 ? R("#4a3d2e", "#7a6a52", "#a69478", "#cbbc9c", "#e6dcc4")[2] : null), false, true);
      };
      return fr;
    });
  };
  // ---- появление
  const spawn = (): PFrame[] => {
    const n = 12;
    return Array.from({ length: n }, (_, f) => ({ p: { ...R0, flap: bird ? 0.5 + 0.5 * Math.cos(f * 1.0) : R0.flap, fold: 0, blink: f < 8 ? 1 : 0 } as XP, over: (o) => spawnFx(o, f, n, sp.spawnCol) }));
  };
  return {
    id: sp.id, ru: sp.ru, cr, v, cam: camN(rp.N), shadow: rp.shadow, hover: bird ? 1 : 0,
    anims: [
      { id: "idle", ru: "ПОКОЙ", fps: 10, loop: true, frames: idle },
      { id: "act", ru: `ЖИВОЕ ДЕЙСТВИЕ — ${sp.act}`, fps: 10, loop: false, frames: act },
      { id: "walk", ru: bird ? "ПОЛЁТ" : "ХОДЬБА", fps: 12, loop: true, frames: walk },
      { id: "attack", ru: `АТАКА — ${{ bite: "УКУС В ПРЫЖКЕ", swipe: "НА ДЫБЫ И УДАР ЛАПАМИ", charge: "ТАРАН", spit: "ПЛЕВОК ОГНЁМ", cast: "ЛЕЧЕНИЕ ХОЗЯИНА", screech: "КЛИЧ-МЕТКА", dive: "ПИКЕ И КЛЕВОК", slam: "УДАР КУЛАКАМИ ОЗЕМЬ", poison: "ЯДОВИТЫЙ ПЛЕВОК" }[sp.atk]}`, fps: 14, loop: false, frames: attack },
      { id: "hurt", ru: "УРОН", fps: 14, loop: false, frames: hurt },
      { id: "spawn", ru: "ПОЯВЛЕНИЕ ПРИ ПРИЗЫВЕ", fps: 12, loop: false, frames: spawn },
      { id: "death", ru: "ГИБЕЛЬ", fps: 12, loop: false, frames: death },
    ],
  };
}

// =============================== иконка 48×48 ===============================
function icon(pet: Pet, view: View): PC {
  const p = rest(pet.cr, pet.v, { look: 0, fold: 0, grab: 0, flare: 0, tongue: 0, ear: 0, glowUp: 0, rune: 1, flap: 0.8, jaw: 0 });
  const sc0 = pet.cr.scale[0];
  // примерка: габарит на крупном холсте, затем масштаб, чтобы занять ~44 px
  const probe = (k: number, cam: Cam) => {
    const cr = { ...pet.cr, scale: [sc0 * k, sc0 * k] as [number, number] };
    const B = buildBody(cr, pet.v, p, view, "idle");
    return renderScene(cam, B.sc, view, OUT);
  };
  const big: Cam = { N: 160, CX: 80, GY: 150 };
  const r0 = probe(1, big).body;
  let x0 = 999, x1 = -1, y0 = 999, y1 = -1;
  for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) if (r0.alpha(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = Math.min(43 / (x1 - x0 + 1), 43 / (y1 - y0 + 1));
  const cam: Cam = { N: 48, CX: 24 - k * ((x0 + x1 + 1) / 2 - 80), GY: 24 - k * ((y0 + y1 + 1) / 2 - 150) };
  const R1 = probe(k, cam);
  const img = new PC(48, 48);
  img.blit(R1.body, 0, 0);
  thicken(img, OUT, 3);
  sealPinholes(img, OUT, true, 8);
  selout(img);
  tintOutline(img);
  return img;
}

// =============================== запуск ===============================
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("tools/gen/pets/companions.ts")) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const OUT_DIR = path.join(ROOT, "tools", "out", "pets");
  const only = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
  const A = loadAssets(ROOT);
  const K = 4;
  const W = 1800;
  const over: Row[] = [{ h: 46, draw: (c, y) => text(c, "ПОСТОЯННЫЕ ПИТОМЦЫ · ОБЗОР ×4 · ГЕРОЙ · ПОКОЙ СПЕРЕДИ, СБОКУ, СЗАДИ · ДЕЙСТВИЕ, АТАКА, ГИБЕЛЬ · ИКОНКА 48 · В ИГРУ НЕ ВКЛЮЧЕНО", 16, y + 8, 3) }];
  fs.mkdirSync(path.join(OUT_DIR, "anims"), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, "icons"), { recursive: true });
  for (const sp of SPECS) {
    if (only.length && !only.includes(sp.id)) continue;
    const t0 = Date.now();
    const pet = petOf(sp);
    const o = buildPet(pet);
    saveSheets(o, path.join(OUT_DIR, "sheets"));
    const ic = icon(pet, sp.iconView);
    ic.save(path.join(OUT_DIR, "icons", `pet_${sp.id}.png`));
    console.log(`  ${sp.id}: ${o.pet.anims.length} анимаций за ${((Date.now() - t0) / 1000).toFixed(1)} с; замечаний ${o.problems.length}`);
    for (const q of o.problems.slice(0, 8)) console.log(`    ${q}`);
    const N = pet.cam.N;
    const fr = (a: string, i: number, row: number) => frameOfSheet(o.sheets.get(a)!, N, i, row);
    const atkHit = sp.atk === "spit" || sp.atk === "poison" ? 5 : sp.atk === "cast" || sp.atk === "screech" ? 6 : 4;
    for (const night of [false, true]) {
      const items: Item[] = [{ img: heroAt(A, 0), label: "ГЕРОЙ" }];
      [0, 2, 1].forEach((row, i) => { const f = fr("idle", 0, row); items.push({ img: f.img, emis: f.emis, shadow: pet.shadow, gap: i === 0 ? 8 : 0, label: ["ПОКОЙ ВНИЗ", "ВБОК", "ВВЕРХ"][i] }); });
      for (const [a, i, row, lab] of [["act", 8, 2, "ДЕЙСТВИЕ"], ["attack", atkHit, 2, "АТАКА"], ["death", 11, 2, "ГИБЕЛЬ"]] as [string, number, number, string][]) {
        const f = fr(a, i, row);
        items.push({ img: f.img, emis: f.emis, shadow: pet.shadow, gap: lab === "ДЕЙСТВИЕ" ? 24 : 0, label: lab });
      }
      items.push({ img: ic, gap: 24, shadow: 0, label: "ИКОНКА" });
      over.push(sceneRow(`${sp.ru} · ${night ? "НОЧЬ" : "ДЕНЬ"} · ${sp.act}`, items, A, night, W, K, Math.max(N, 48)));
    }
    // полные листы анимаций — отдельным файлом на питомца
    const Wa = 24 + 36 * 3 + 16 * N * 3 + 60;
    stackRows([{ h: 40, draw: (c, y) => text(c, `${sp.ru} · ВСЕ АНИМАЦИИ ×3 · ГЕРОЙ ДЛЯ МАСШТАБА`, 16, y + 8, 3) }, ...animRows(o, A, 3, Wa), ...animRows({ ...o, pet: { ...o.pet, anims: o.pet.anims.filter((q) => q.id === "idle" || q.id === "spawn") } }, A, 3, Wa, true)], Wa).save(path.join(OUT_DIR, "anims", `${sp.id}.png`));
  }
  const name = only.length ? `final2-${only.join("+")}.png` : "final2.png";
  stackRows(over, W).save(path.join(OUT_DIR, name));
  console.log(`  → tools/out/pets/${name}, tools/out/pets/anims/*.png`);
}
void [lerpV, sub, easeInOut, mix, M_RUNE, relight, putSprite];
