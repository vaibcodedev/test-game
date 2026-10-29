/**
 * Демон-прислужник чернокнижника (wl_demon): демон бездны ≈1,3 роста героя, кадр 48. Рогатый (витые рога назад),
 * крылья-перепонки на костяных пальцах, когти, тёмно-фиолетовая кожа с тлеющими трещинами, оковы с обрывком цепи
 * (призван и связан), шар теневого пламени в правой лапе (снаряд shadow). Парит над землёй (тень отдельно).
 * Появление — поднимается из печати-портала; гибель — вращаясь, втягивается в портал.
 */
import {
  M, R, drawArm, drawLeg, face, flaps, glowMat, handAt, hex, hp, mat, rad, tail,
  type Creature, type Ctx, type Mat, type RoleDef, type TexFn, type V3,
} from "../mobs/rig";
import { PX, easeIn, easeInOut, easeOut, linear, type RGBA, type View } from "../mobs/lib";
import {
  add, camN, clamp, groundEllipse, hash01, keyed, lerp, lerpV, mul, norm, orb, px, rest, rotAxis, sub,
  type FxCtx, type Pet, type PFrame, type XP,
} from "./petlib";
import { GREEN, VIOLET, chips, mark, tag } from "./warlock";

const SKIN = R("#120a1a", "#24142e", "#3a2148", "#553364", "#734a84");
const WING = R("#0e050c", "#20091a", "#36122c", "#521e40", "#6e3054");
const HORN = R("#14100c", "#30261e", "#504234", "#7a6650", "#a8907a");
const EMBER = R("#5a1404", "#a8300a", "#f06a14", "#ffb040", "#fff0b0");
const M_SKIN = mat("кожа демона", SKIN, { base: 1.9, gain: 2.3 });
const M_WING = mat("перепонка", WING, { base: 1.9, gain: 2.1 });
const M_HORN = mat("рог", HORN, { base: 1.8, gain: 2.4 });
const M_EMBER = glowMat("тлеющие трещины", EMBER, 2.3);
const M_LOIN = mat("кожаная повязка", R("#0e0a0a", "#1e1616", "#302424", "#463434", "#5e4846"), { base: 1.7, gain: 2.2 });
const M_IRON = mat("оковы", R("#0e0e12", "#22232a", "#3a3c46", "#5c5e6a", "#8a8c98"), { base: 1.7, gain: 2.6 });

/** Тлеющие трещины: ломаные линии по местным координатам детали (едут вместе с телом), не шум. */
const crackTex = (seed: number, amt = 0.13): TexFn => (c) => {
  if (c.edge || c.tone < 1.2) return 0;
  const [x, y, z] = c.l;
  const u = x * 1.25 + Math.sin(z * 1.15 + seed) * 1.5 + y * 0.4;
  const w = Math.abs(Math.sin(u + Math.floor(z * 0.9) * 0.9));
  return w < amt ? { mat: M_EMBER, d: 0 } : 0;
};

const HOVER = 4 * PX;
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
  S.ell(g, m, add(mid, mul(Z, hl * 0.42)), [L * 0.5, 0.42, hl * 0.56], [X, Y, Z], { part, big: true });
}

const OPEN: Record<string, V3> = { el: [6.0, -5.0, 19.2], tip: [10.2, -8.0, 22.0], f1: [11.2, -8.6, 15.2], f2: [8.6, -7.4, 11.4], f3: [5.0, -5.4, 9.6] };
const FOLD: Record<string, V3> = { el: [3.4, -4.2, 20.2], tip: [4.2, -4.8, 23.4], f1: [4.6, -4.6, 12.4], f2: [3.6, -4.2, 10.6], f3: [2.8, -3.6, 10.6] };

function build(c: Ctx) {
  const { S, up } = c;
  const p = c.p as XP;
  const fold = (p.fold as number) ?? 0;
  const flap = c.p.flap;
  // --- туловище
  const gT = S.group(0.8);
  const pt = S.newPart();
  S.ell(gT, M_SKIN, up([0, 0.4, 13.8]), [4.0, 2.8, 3.4], undefined, { part: pt, big: true });
  S.ell(gT, M_SKIN, up([0, 0.7, 10.7]), [3.0, 2.2, 2.3], undefined, { part: pt, big: true });
  S.ell(gT, M_SKIN, c.pelvisC, [2.8, 2.1, 1.7], undefined, { part: pt });
  // грудные пластины и пресс: тёмные валики
  for (const s of [1, -1]) S.ell(S.group(0), M_SKIN, up([1.6 * s, 2.3, 14.4]), [1.7, 0.9, 1.4], undefined, { part: S.newPart(), tone: 0.2 });
  // тлеющие трещины: ломаные по поверхности груди, живота и спины
  {
    const surf = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, x: number, z: number, back: boolean): V3 => {
      const q = 1 - (x / rx) ** 2 - ((z - cz) / rz) ** 2;
      return [x, cy + (back ? -1 : 1) * (ry * Math.sqrt(Math.max(0.02, q)) - 0.05), z];
    };
    const line = (pts: [number, number][], body: 0 | 1, back: boolean) => {
      const B = body ? [0, 0.7, 10.7, 3.0, 2.2, 2.3] : [0, 0.4, 13.8, 4.0, 2.8, 3.4];
      const g = S.group(0);
      const pp = S.newPart();
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = surf(B[0], B[1], B[2], B[3], B[4], B[5], pts[k][0], pts[k][1], back);
        const b = surf(B[0], B[1], B[2], B[3], B[4], B[5], pts[k + 1][0], pts[k + 1][1], back);
        S.cone(g, M_EMBER, up(a), 0.42, up(b), 0.42, { part: pp });
      }
    };
    line([[-1.2, 16.4], [-0.5, 15.2], [-1.4, 14.0], [-0.7, 12.6]], 0, false);
    line([[1.9, 15.6], [2.7, 14.4], [2.0, 13.0]], 0, false);
    line([[0.5, 11.8], [-0.2, 10.8], [0.6, 9.8]], 1, false);
    line([[1.0, 16.2], [0.3, 14.8], [1.2, 13.4], [0.5, 12.0]], 0, true);
    line([[-1.9, 15.2], [-2.8, 13.8], [-2.1, 12.6]], 0, true);
  }
  // повязка, пояс с кольцом
  S.ell(S.group(0), M_LOIN, c.pelvisC, [3.0, 2.3, 1.0], undefined, { part: S.newPart() });
  flaps(c, M_LOIN, [[0.6, 2.1, 4.0, 1.5], [-0.8, -2.0, 3.4, 1.7], [-2.0, 1.4, 2.6, 0.7]]);
  S.ball(S.group(0), M_IRON, up([0, 2.4, 8.9]), 0.75, { part: S.newPart() });
  // шипы по хребту
  for (let k = 0; k < 4; k++) S.cone(S.group(0), M_HORN, up([0, -2.3, 10.4 + k * 1.7]), 0.55, up([0, -3.7, 11.4 + k * 1.7]), 0.12, { part: S.newPart() });
  // --- шея, голова
  S.cone(S.group(0.4), M_SKIN, up([0, 0.6, 16.4]), 1.5, hp(c, [0, -0.6, -2.0]), 1.3, { part: S.newPart() });
  const gH = S.group(0.7);
  const ph = S.newPart();
  S.ell(gH, M_SKIN, c.head, [2.7, 2.8, 2.7], undefined, { part: ph, big: true });
  S.ell(gH, M_SKIN, hp(c, [0, 2.0, -1.2]), [1.9, 1.8, 1.3], undefined, { part: ph });
  S.ell(S.group(0), M_SKIN, hp(c, [0, 2.0, 0.9]), [2.6, 1.2, 0.75], undefined, { part: S.newPart(), tone: -0.3 });
  S.ell(S.group(0.3), M_SKIN, hp(c, [0, 1.8, -2.4 - c.p.jaw * 0.9]), [1.6, 1.5, 0.75], undefined, { part: S.newPart(), tone: -0.4 });
  // рога: витые назад, вторая малая пара; уши
  for (const s of [1, -1]) {
    const g = S.group(0.3);
    const pr = S.newPart();
    const pts: V3[] = [[1.6, 0.8, 1.9], [2.9, 0.0, 4.0], [3.9, -1.9, 5.0], [4.2, -3.8, 4.0], [3.8, -4.6, 2.6]];
    const rr = [1.0, 0.85, 0.65, 0.45, 0.25];
    for (let k = 0; k + 1 < pts.length; k++) S.cone(g, M_HORN, hp(c, [pts[k][0] * s, pts[k][1], pts[k][2]]), rr[k], hp(c, [pts[k + 1][0] * s, pts[k + 1][1], pts[k + 1][2]]), rr[k + 1], { part: pr });
    S.cone(S.group(0), M_HORN, hp(c, [1.1 * s, 1.8, 1.6]), 0.45, hp(c, [1.5 * s, 2.0, 3.0]), 0.12, { part: S.newPart() });
    S.cone(S.group(0.2), M_SKIN, hp(c, [2.4 * s, -0.2, 0.2]), 0.7, hp(c, [4.0 * s, -0.8, 1.0]), 0.15, { part: S.newPart() });
  }
  const col: Record<string, RGBA> = { E: hex("#fff0b0"), e: EMBER[3], k: hex("#0a0408"), t: hex("#e8dcc8"), m: hex("#3a0808") };
  face(c, { at: [0, 2.6, 0.3], sideAt: [1.4, 2.3, 0.3], colors: col, glow: ["E", "e"], halo: EMBER[2], down: [["kE.Ek", ".e.e."], -2, 0], side: [["kE", ".e"], -1, 0] });
  face(c, { at: [0, 3.0, -1.9], sideAt: [1.0, 2.8, -1.9], colors: col, glow: c.p.jaw ? ["m"] : [], down: [[c.p.jaw ? "t.t" : "ttt", c.p.jaw ? "mmm" : "...", c.p.jaw ? "t.t" : "..."], -1, 0], side: [["tt", c.p.jaw ? "m." : ".."], 0, 0] });
  // --- руки, когти, оковы
  for (const i of [0, 1]) {
    drawArm(c, i, { mat: M_SKIN, r: [1.35, 1.1, 0.95] }, 1.15);
    S.ell(S.group(0), M_SKIN, add(c.sh[i], [0, 0, 0.5]), [1.7, 1.6, 1.4], undefined, { part: S.newPart() });
    S.cone(S.group(0), M_HORN, add(c.sh[i], [0, -0.4, 1.4]), 0.5, add(c.sh[i], [(i ? -1 : 1) * 0.8, -1.0, 3.0]), 0.12, { part: S.newPart() });
    const dir = norm(sub(c.hand[i], c.el[i]));
    for (let k = 0; k < 3; k++) {
      const a = add(c.hand[i], add(mul(dir, 0.9), [(k - 1) * 0.5, 0.3, 0]));
      S.cone(S.group(0), M_HORN, a, 0.3, add(a, add(mul(dir, 1.0), [(k - 1) * 0.25, 0.3, -0.4])), 0.1, { part: S.newPart() });
    }
    // оковы: железный браслет, у левой — обрывок цепи
    S.cone(S.group(0), M_IRON, lerpV(c.el[i], c.hand[i], 0.72), 1.15, lerpV(c.el[i], c.hand[i], 0.88), 1.1, { part: S.newPart() });
    if (i === 1) {
      const gc = S.group(0.2);
      const pc = S.newPart();
      const sw = c.p.sway;
      for (let k = 1; k <= 4; k++) S.ball(gc, M_IRON, add(lerpV(c.el[i], c.hand[i], 0.8), [sw * 0.3 * k, -0.2 * k, -k * 0.95]), 0.5, { part: pc });
    }
    drawLeg(c, i, { mat: M_SKIN, r: [1.5, 1.15, 0.85] }, { mat: M_SKIN, r: [0.85, 0.7] });
    // ступня-лапа когтями вниз-вперёд
    const an = c.ankle[i];
    const f2 = add(an, [0, 1.5, -0.7]);
    S.cone(S.group(0.3), M_SKIN, an, 0.75, f2, 0.6, { part: S.newPart() });
    for (let k = 0; k < 3; k++) S.cone(S.group(0), M_HORN, add(f2, [(k - 1) * 0.45, 0, 0]), 0.25, add(f2, [(k - 1) * 0.55, 0.9, -0.5]), 0.1, { part: S.newPart() });
  }
  // --- хвост с наконечником
  tail(c, M_SKIN, [0, -1.8, 8.2], [[0.4, -2.0, -1.4], [1.0, -2.0, -0.8], [1.4, -1.6, 0.4], [1.0, -1.0, 1.2]], [0.95, 0.8, 0.6, 0.45, 0.35], undefined, (g, at, dir) => {
    S.ell(g, M_HORN, add(at, mul(dir, 0.8)), [1.1, 0.35, 1.0], undefined, { part: S.newPart() });
  });
  // --- крылья
  for (const s of [1, -1]) {
    const r0: V3 = [1.6, -2.6, 15.2];
    const ang = rad(lerp(-22, 38, flap)) * (1 - fold * 0.8);
    const W = (k: string): V3 => {
      const q = lerpV(OPEN[k], FOLD[k], fold);
      const r = add(r0, rotAxis(sub(q, r0), [0, 1, 0], -ang));
      return up([r[0] * s, r[1], r[2]]);
    };
    const R0 = up([r0[0] * s, r0[1], r0[2]]);
    const el = W("el"), tp = W("tip"), f1 = W("f1"), f2 = W("f2"), f3 = W("f3");
    const gw = S.group(0.25);
    const pw = S.newPart();
    S.cone(gw, M_HORN, R0, 0.8, el, 0.65, { part: pw });
    S.cone(gw, M_HORN, el, 0.6, tp, 0.3, { part: pw });
    S.cone(gw, M_HORN, el, 0.5, f1, 0.25, { part: pw });
    S.cone(gw, M_HORN, el, 0.45, f2, 0.25, { part: pw });
    S.cone(gw, M_HORN, el, 0.4, f3, 0.25, { part: pw });
    S.cone(S.group(0), M_HORN, tp, 0.35, add(tp, mul(norm(sub(tp, el)), 1.2)), 0.1, { part: S.newPart() });
    const pm = S.newPart();
    const gm = S.group(0.3);
    for (const [a, b, d] of [[el, tp, f1], [el, f1, f2], [el, f2, f3], [R0, el, f3]] as [V3, V3, V3][]) membrane(S, gm, M_WING, a, b, d, pm);
  }
}

const role: RoleDef = { id: "abyss", ru: "демон бездны", kind: "handcast" };
const cr: Creature = {
  id: "wl_demon", ru: "Демон-прислужник", eliteRu: "",
  scale: [1.3, 1.3], big: true,
  dims: { pelvisZ: 8.6, hipX: 2.1, hipZ: 8.0, shX: 4.9, shZ: 15.8, arm: [4.4, 4.4], leg: [3.8, 3.4], headC: [0, 1.4, 20.4], footX: 2.3, hunch: 0.16, digi: [1.5, 2.8] },
  roles: [role], build,
};
const v = { role, elite: false };
const d = cr.dims;
const H = (s: 1 | -1, x: number, y: number, z: number) => handAt(d, s, [x, y, z]);
const S13 = 1.3;
const FEET = (lift = 0): Partial<XP> => ({ fR: [d.footX, -0.4, 1.0 + HOVER / S13 - 0.2 + lift], fL: [-d.footX - 0.2, -0.9, 1.0 + HOVER / S13 + 0.4 + lift] });

function base(extra: Partial<XP> = {}): XP {
  return rest(cr, v, {
    core: [0, 0, HOVER], ...FEET(), fold: 0, orbK: 1,
    hR: H(1, -0.8, 3.0, -3.6), hL: H(-1, 1.4, 1.0, -6.0), flap: 0.4, ...extra,
  });
}
/** Шар теневого пламени над правой ладонью. */
function handOrb(o: FxCtx, k: number, seed: number) {
  if (k <= 0.05) return;
  const s = S13;
  const at = add(o.B.hand[0], [0, 0.6 * s, 1.9 * s]);
  const [x, y] = o.pt(at);
  orb(o, x, y, 1.0 + 1.5 * k + (seed % 2 ? 0.25 : 0), VIOLET, seed, k > 0.5 ? 3 : 2, at);
}
/** Печать-портал на земле: кольцо, руны Умбрата, вихрь внутри. k — раскрытие 0..1. */
function sigil(o: FxCtx, k: number, f: number, ry = 4.4) {
  if (k <= 0) return;
  const cx = 24, cy = 42.6, rx = 15 * k;
  groundEllipse(o, cx, cy, rx, ry * k, (dd, a, x, y) => {
    if (dd > 0.86) return VIOLET[dd > 0.95 ? 1 : 2];
    if (dd > 0.66) {
      const t = ((a + f * 0.35) / (Math.PI * 2) + 1) * 10;
      const fr = t - Math.floor(t);
      return fr < 0.28 ? GREEN[fr < 0.14 ? 3 : 2] : hex("#140820");
    }
    const sw = Math.sin(a * 3 + dd * 7 - f * 0.9);
    if (sw > 0.55) return VIOLET[dd < 0.3 ? 3 : 1];
    return hash01(x, y, 4) < 0.08 ? VIOLET[1] : hex("#0c0414");
  }, true);
}
function column(o: FxCtx, k: number) {
  const cx = 24, cy = 42.6;
  for (let y = Math.floor(cy - 34 * k); y < cy; y++) for (let x = cx - 9; x <= cx + 9; x++) {
    const t = Math.abs(x - cx) / 9;
    const a = Math.round((1 - t * t) * 120 * k * (0.6 + 0.4 * ((y + x) % 3 === 0 ? 1 : 0.6)));
    if (a < 12 || o.img.alpha(x, y) > 200) continue;
    const c = t < 0.3 ? VIOLET[4] : t < 0.65 ? VIOLET[3] : VIOLET[2];
    o.img.set(x, y, [c[0], c[1], c[2], a]);
    o.emis.set(x, y, [c[0], c[1], c[2], a]);
  }
}

function idle(): PFrame[] {
  const R0 = base();
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (i / 12) * Math.PI * 2;
    const bob = Math.round(Math.sin(ph) * 1.0);
    const p: XP = { ...R0, core: [0, 0, HOVER + bob * PX], chest: [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0][i], ...FEET(bob * PX / S13 * 0.6) };
    p.flap = 0.35 + 0.3 * Math.sin(ph + 0.6);
    p.tail = Math.sin(ph) * 1.4;
    p.sway = 0.4 * Math.sin(ph);
    p.jaw = i === 7 ? 1 : 0;
    return { p, over: (o) => handOrb(o, 1, i) };
  });
}
function fly(): PFrame[] {
  const R0 = base({ lean: rad(-14) });
  return Array.from({ length: 12 }, (_, i) => {
    const ph = (i / 12) * Math.PI * 2;
    const fl = 0.5 + 0.5 * Math.cos(ph);
    const bob = Math.round(-Math.sin(ph) * 1.4);
    const p: XP = { ...R0, core: [0, 0.6, HOVER + (1 + bob) * PX], flap: fl * fl * (3 - 2 * fl), fR: [d.footX, -1.6, 1.0 + HOVER / S13 + 0.8], fL: [-d.footX, -2.1, 1.0 + HOVER / S13 + 1.4] };
    p.tail = Math.sin(ph) * 2.0;
    p.sway = 1.0;
    p.hL = H(-1, 0.6, -0.6, -6.0);
    return { p, over: (o) => handOrb(o, 1, i) };
  });
}
function attack(view: View): PFrame[] {
  const R0 = base();
  const wind: Partial<XP> = { hR: H(1, 0.6, -2.8, 2.0), yaw: rad(18), lean: rad(6), orbK: 1.4, flap: 0.8, jaw: 1 };
  const thr: Partial<XP> = { hR: H(1, -2.4, 5.6, -1.2), yaw: rad(-16), lean: rad(-10), core: [0, 1.0, HOVER], orbK: 0, flap: 0.1, jaw: 1 };
  const ps = keyed(R0, [{ f: 0, p: {} }, { f: 2, p: wind, ease: easeOut }, { f: 3, p: { ...wind, hR: H(1, 0.8, -3.2, 2.6) } }, { f: 4, p: thr, ease: easeIn }, { f: 5, p: { ...thr } }, { f: 9, p: { hR: R0.hR, yaw: 0, lean: 0, core: R0.core, flap: 0.4, jaw: 0 } }], 10);
  const regrow = [1, 1, 1.35, 1.5, 0, 0, 0.25, 0.5, 0.75, 1];
  return ps.map((p, f) => ({
    p,
    over: (o) => {
      handOrb(o, regrow[f], f);
      if (f >= 4 && f <= 6) {
        // бросок: шар летит вперёд по взгляду, за ним хвост искр
        const t = f - 4;
        const fwd: V3 = [0, 1, 0];
        const start = add(o.B.hand[0], [0, 0.6 * S13, 1.6 * S13]);
        const at = add(start, add(mul(fwd, (3 + t * 4.2) * S13), [0, 0, (t * 0.6) * S13]));
        let [x, y] = o.pt(at);
        if (view === "side") x = Math.min(x, 43);
        y = Math.min(y, 40);
        for (let q = 1; q <= 4; q++) {
          const [tx, ty] = o.pt(add(at, mul(fwd, -q * 1.4 * S13)));
          px(o, Math.min(tx, 44) + (q % 2), Math.min(ty, 41), VIOLET[Math.max(1, 4 - q)], true);
        }
        orb(o, x, y, 2.6 - t * 0.2, VIOLET, f + 3, 2);
      }
    },
  }));
}
function hurt(): PFrame[] {
  const R0 = base();
  const hit: Partial<XP> = { core: [0, -1.0, HOVER + PX], lean: rad(12), head: [0, 1], jaw: 1, hR: add(R0.hR, [0.6, -1.4, 1.2]), hL: add(R0.hL, [-0.6, -1.0, 1.6]), flap: 0.95, sway: 1.2 };
  const ps = keyed(R0, [{ f: 0, p: {} }, { f: 1, p: hit, ease: easeOut }, { f: 2, p: { ...hit, lean: rad(14) } }, { f: 4, p: { core: [0, -0.5, HOVER], lean: rad(5), head: [0, 0], jaw: 0, flap: 0.6 } }, { f: 7, p: { core: R0.core, lean: 0, hR: R0.hR, hL: R0.hL, flap: 0.4, sway: 0 } }], 8);
  return ps.map((p, f) => ({ p, over: (o) => { handOrb(o, f === 1 || f === 2 ? 0.6 : 1, f); if (f >= 1 && f <= 3) chips(o, add(o.B.hand[0], [-3, 0, 6]), f - 1, EMBER, true); } }));
}
function spawn(): PFrame[] {
  const R0 = base({ fold: 1, flap: 0.5 });
  const cores = [-64, -64, -64, -54, -44, -34, -26, -18, -10, -3, HOVER, HOVER, HOVER, HOVER];
  const open = [0.35, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.55, 0.2];
  const fold = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.7, 0.35, 0, 0];
  return cores.map((cz, f) => {
    const p: XP = { ...R0, core: [0, 0, cz], fold: fold[f], flap: f >= 11 ? [0.9, 0.2, 0.4][f - 11] ?? 0.4 : 0.5, jaw: f === 10 || f === 11 ? 1 : 0, lean: rad(f >= 6 && f <= 9 ? 6 : 0), hR: f < 10 ? H(1, -1.2, 1.0, -5.6) : R0.hR };
    return {
      p, clipY: f <= 9 ? 42.6 : undefined,
      under: (o) => sigil(o, open[f], f),
      over: (o) => {
        if (f >= 3 && f <= 9) column(o, f <= 4 ? (f - 2) / 2 : f >= 8 ? (10 - f) / 3 : 1);
        if (f >= 10) handOrb(o, (f - 9) / 3, f);
        // нижняя половина кольца печати — перед телом
        if (f <= 9) groundEllipse(o, 24, 42.6, 15 * open[f], 4.4 * open[f], (dd, a) => (Math.sin(a) > 0.15 && dd > 0.86 ? VIOLET[dd > 0.95 ? 1 : 2] : null), true);
      },
    };
  });
}
function death(): PFrame[] {
  const R0 = base();
  const frames: PFrame[] = [];
  const open = [0.2, 0.6, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.5, 0.15];
  for (let f = 0; f < 12; f++) {
    const t = clamp((f - 2) / 7, 0, 1);
    const p: XP = {
      ...R0, fold: clamp(f / 3, 0, 1), flap: 0.5, jaw: 1, lean: rad(f === 0 ? 14 : 6), head: [0, f === 0 ? 1 : 0],
      core: [0, f === 0 ? -1 : 0, f <= 2 ? HOVER : HOVER - easeIn(t) * 50], hR: H(1, 0.8, -0.6, 1.0), hL: H(-1, 0.8, -0.6, 1.0),
    };
    const ang = rad(easeIn(t) * 540);
    frames.push({
      p, clipY: f >= 3 ? 42.6 : undefined,
      rigid: f >= 2 ? () => () => ({ c0: [0, 0, 0], c1: [0, 0, 0], axis: [0, 0, 1], ang }) : undefined,
      under: (o) => sigil(o, open[f], f),
      over: (o) => {
        if (f >= 1 && f <= 9) for (let q = 0; q < 6; q++) {
          // искры стягиваются в воронку
          const a = q * 1.05 + f * 0.8, r = 16 * (1 - ((f - 1 + q * 0.3) % 4) / 4);
          px(o, 24 + Math.cos(a) * r, 42.6 + Math.sin(a) * r * 0.32 - 2, q % 2 ? VIOLET[3] : GREEN[3], true);
        }
        if (f === 10) groundEllipse(o, 24, 41.8, 6, 3, (dd) => VIOLET[dd < 0.4 ? 4 : dd < 0.75 ? 3 : 2], true);
        if (f <= 9 && f >= 3) groundEllipse(o, 24, 42.6, 15 * open[f], 4.4 * open[f], (dd, a) => (Math.sin(a) > 0.15 && dd > 0.86 ? VIOLET[dd > 0.95 ? 1 : 2] : null), true);
      },
    });
  }
  return frames;
}

export const demonPet: Pet = {
  id: "wl_demon", ru: "ДЕМОН-ПРИСЛУЖНИК", cr, v, cam: camN(48), shadow: 7, hover: HOVER,
  anims: [
    { id: "idle", ru: "ПОКОЙ — ПАРИТ", fps: 10, loop: true, frames: () => idle() },
    { id: "walk", ru: "ПОЛЁТ", fps: 12, loop: true, frames: () => fly() },
    { id: "attack", ru: "БРОСОК ТЕНЕВОГО ШАРА", fps: 14, loop: false, frames: (vw) => attack(vw) },
    { id: "hurt", ru: "УРОН", fps: 14, loop: false, frames: () => hurt() },
    { id: "spawn", ru: "ПОЯВЛЕНИЕ ИЗ ПЕЧАТИ", fps: 12, loop: false, frames: () => spawn() },
    { id: "death", ru: "ГИБЕЛЬ — ВТЯГИВАЕТСЯ В ПОРТАЛ", fps: 12, loop: false, frames: () => death() },
  ],
};
void [M, easeInOut, linear, mark, tag, crackTex];
