/**
 * Задача 147, шаг 1: ОСНОВА героя (тело в базовой одежде) — 4 варианта пропорций, м/ж, Сольгард (человек) / Умбрат (бледная нежить).
 * Метод: скелет в 3D (X — левая рука героя, Y — вниз, Z — вперёд) → проекция в вид вниз / вверх / вбок (3/4: вперёд = ниже на KZ),
 * части тела — маски-штампы по костям в сетке 2× (paint: объём по расстоянию до края, свет сверху-слева), сведение 2×→1× по большинству,
 * внутренний контур между частями (передняя часть «режет» заднюю тёмным тоном её материала) и внешний контур 1 px тёмным тоном материала.
 * Слои снаряжения потом ложатся по тем же точкам скелета (Skel: плечи, локти, кисти, таз, колени, ступни, голова).
 * В игру не подключено. Монтаж — tools/gen/hero147/variants.ts.
 */
import { Cv, Mk, paint, hx, type C } from "../bosses139/mino_lib";

export const Z = 2, FR = 48, W = FR * Z, FY = 45, CX = 24, KZ = 0.35;
export type View = "down" | "up" | "side";
export type V3 = [number, number, number];
export type V2 = [number, number];

export interface Build {
  id: string; name: string; heads: string;
  headW: number; headH: number; neck: number; chest: number; pelvis: number; thigh: number; shin: number; ankle: number; footL: number;
  shW: number; waist: number; hipW: number; uArm: number; fArm: number;
  thighT: number; shinT: number; armT: number; foreT: number; handR: number; neckT: number;
}
export interface Look { fac: "sol" | "umb"; sex: "m" | "f"; armed?: boolean }

/** Варианты основы (мужчина; женщина и нежить — модификаторы ниже). Числа — пиксели кадра 1×. */
export const BUILDS: Build[] = [
  { id: "A", name: "КОМПАКТНЫЙ", heads: "3", headW: 11, headH: 10, neck: 0.8, chest: 6, pelvis: 2.5, thigh: 4.2, shin: 3.8, ankle: 2, footL: 2.6, shW: 5, waist: 3.6, hipW: 3.8, uArm: 3.6, fArm: 3.4, thighT: 3.4, shinT: 2.8, armT: 2.7, foreT: 2.3, handR: 1.4, neckT: 2.6 },
  { id: "B", name: "СТРОЙНЫЙ", heads: "4", headW: 8.2, headH: 7.8, neck: 1, chest: 7, pelvis: 3, thigh: 5.4, shin: 4.8, ankle: 1.7, footL: 2.8, shW: 5.3, waist: 3.6, hipW: 3.9, uArm: 4.4, fArm: 4.0, thighT: 3.2, shinT: 2.6, armT: 2.5, foreT: 2.1, handR: 1.25, neckT: 2.4 },
  { id: "C", name: "ГЕРОИЧЕСКИЙ", heads: "4,7", headW: 7.8, headH: 7.3, neck: 1.4, chest: 8.6, pelvis: 3, thigh: 6.2, shin: 5.8, ankle: 1.8, footL: 3.2, shW: 7, waist: 4.2, hipW: 4.3, uArm: 5.2, fArm: 4.7, thighT: 3.8, shinT: 3.0, armT: 3.2, foreT: 2.7, handR: 1.5, neckT: 3.0 },
  { id: "D", name: "ВЫСОКИЙ", heads: "5,8", headW: 7.2, headH: 6.9, neck: 1.8, chest: 9.8, pelvis: 3.6, thigh: 7.9, shin: 7.4, ankle: 2, footL: 3.4, shW: 6.4, waist: 4.2, hipW: 4.4, uArm: 6.2, fArm: 5.6, thighT: 3.6, shinT: 2.9, armT: 2.8, foreT: 2.4, handR: 1.4, neckT: 2.6 },
];

const R = (...s: string[]): C[] => s.map(hx);
export interface Mats { skin: C[]; hair: C[]; shirt: C[]; pants: C[]; boots: C[]; belt: C[]; buckle: C[]; eye: C; eyeGlow?: C[]; steel: C[]; wood: C[]; trim: C[]; grip: C[] }
export function mats(l: Look): Mats {
  const steel = R("#1c1f26", "#353b47", "#5a6474", "#909cb0", "#d4dcea");
  const grip = R("#1a0f08", "#33200f", "#55361a", "#7a5028");
  if (l.fac === "sol") return {
    skin: R("#4a2620", "#7e4636", "#b06c52", "#d99a76", "#f2c49e"),
    hair: l.sex === "m" ? R("#1c100a", "#3a2214", "#5e3a20", "#86562c", "#a8743c") : R("#3a1a0c", "#6a3016", "#9c4e22", "#c87432", "#e8a050"),
    shirt: l.sex === "m" ? R("#3e3428", "#6e5e48", "#a08c6e", "#cbb994", "#ece0c2") : R("#3a3026", "#6a5a46", "#9c8a6c", "#c8b896", "#eee4ca"),
    pants: l.sex === "m" ? R("#16182a", "#262a44", "#3a4062", "#545c86", "#737ca8") : R("#2a1418", "#4a2228", "#6e343a", "#944c4e", "#b86a64"),
    boots: R("#1a0e08", "#36200f", "#5a381e", "#835834", "#a67a4e"),
    belt: R("#140c06", "#2c1a0c", "#4c3016", "#704a24", "#8e6232"),
    buckle: R("#5a3a10", "#a06c1c", "#dca634", "#ffd864"),
    eye: hx("#1e1416"), steel, wood: R("#2a160c", "#4a2a16", "#6e4424", "#966236", "#b8844c"), trim: R("#5a3a10", "#a06c1c", "#dca634", "#ffd864", "#fff2b0"), grip,
  };
  return {
    skin: R("#1e2624", "#36433f", "#5a6c64", "#86998e", "#b4c4b6"),
    hair: l.sex === "m" ? R("#24242e", "#454553", "#6e6e7e", "#a2a2b0", "#d2d2dc") : R("#0a0810", "#18121f", "#2a2034", "#40324c", "#5a4868"),
    shirt: l.sex === "m" ? R("#121018", "#221e2a", "#36303f", "#4e4658", "#6c6276") : R("#140e16", "#261a28", "#3c2a3e", "#563e58", "#745674"),
    pants: R("#0b0a0e", "#16141a", "#24212a", "#35313d", "#4b4654"),
    boots: R("#0e0a0a", "#1e1616", "#322626", "#4a3a38", "#665250"),
    belt: R("#2a2018", "#4a3c2e", "#6e5c46", "#9a8466", "#c4b090"),
    buckle: R("#1e3a18", "#3a6a2a", "#6aa848", "#a0d880"),
    eye: hx("#7ad8ff"), eyeGlow: R("#1c4a60", "#3a8ab0", "#7ad8ff", "#d8f6ff"),
    steel: R("#0c0c12", "#1c1c28", "#33334a", "#55557a", "#8a8aa8"), wood: R("#2a2018", "#4a3c2e", "#6e5c46", "#9a8466", "#c4b090"), trim: R("#1e1028", "#3a1e4a", "#5e3474", "#8a52a0", "#b07cc4"), grip,
  };
}

/** Женщина и нежить — модификаторы основы. */
export function body(b: Build, l: Look): Build {
  const o = { ...b };
  if (l.sex === "f") {
    o.shW *= 0.84; o.waist *= 0.84; o.hipW *= 1.06; o.shinT *= 0.92; o.thighT *= 0.98; o.armT *= 0.86; o.foreT *= 0.85; o.neckT *= 0.84; o.headW *= 0.96;
    o.chest *= 0.95; o.handR *= 0.9;
  }
  if (l.fac === "umb") { o.armT *= 0.92; o.foreT *= 0.86; o.thighT *= 0.92; o.shinT *= 0.88; o.waist *= 0.9; o.neckT *= 0.85; }
  return o;
}

// ---------------- скелет ----------------
export interface Skel {
  hip: V3; hipL: V3; hipR: V3; kneeL: V3; kneeR: V3; ankL: V3; ankR: V3; pitchL: number; pitchR: number;
  shL: V3; shR: V3; elL: V3; elR: V3; hdL: V3; hdR: V3; neck: V3; head: V3; waistY: number; shY: number; chestK: number; hairLag: number;
}
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nrm = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const lerp3 = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
function ik3(s: V3, t: V3, l1: number, l2: number, pole: V3): { j: V3; e: V3 } {
  let dv = sub(t, s), d = Math.hypot(dv[0], dv[1], dv[2]) || 0.01;
  const mx = l1 + l2 - 0.02;
  if (d > mx) { t = add(s, mul(dv, mx / d)); dv = sub(t, s); d = mx; }
  const u = mul(dv, 1 / d);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let p = sub(pole, mul(u, dot3(pole, u)));
  p = nrm(p);
  return { j: add(add(s, mul(u, a)), mul(p, h)), e: t };
}
const ease = (t: number) => t * t * (3 - 2 * t);

export type Anim = "idle" | "walk";
export const NFR: Record<Anim, number> = { idle: 10, walk: 10 };

export function skel(b: Build, l: Look, anim: Anim, i: number): Skel {
  const n = NFR[anim], u = i / n;
  const leg = b.thigh + b.shin, arm = b.uArm + b.fArm;
  const hipJ = Math.max(b.hipW * 0.5, b.thighT * 0.5 + 0.45);
  const und = l.fac === "umb";
  let hipY = FY - b.ankle - leg * 0.97, up = 0, breath = 0, headLag = 0;
  const ank: Record<"L" | "R", V3> = { L: [hipJ + 0.35, FY - b.ankle, 0.9], R: [-hipJ - 0.35, FY - b.ankle, -0.7] };
  const pitch = { L: 0, R: 0 };
  let swing = 0;
  if (anim === "walk") {
    const S = leg * 0.3, Lh = b.shin * 0.42;
    hipY += 0.5;
    up = 0.75 * (0.5 + 0.5 * Math.cos(4 * Math.PI * (u - 0.275)));
    for (const s of ["L", "R"] as const) {
      const ph = (u + (s === "L" ? 0 : 0.5)) % 1;
      let z: number, lift = 0;
      if (ph < 0.55) z = S * (1 - (2 * ph) / 0.55);
      else { const t = (ph - 0.55) / 0.45; z = -S + 2 * S * ease(t); lift = Lh * Math.sin(Math.PI * t); pitch[s] = 0.45 * (1 - t) * Math.sin(Math.PI * Math.min(1, t * 1.6)); }
      ank[s] = [(s === "L" ? 1 : -1) * (hipJ + 0.1), FY - b.ankle - lift, z];
    }
    swing = Math.cos(2 * Math.PI * u);
    headLag = 0.5 * (0.5 + 0.5 * Math.cos(4 * Math.PI * (u - 0.36)));
  } else {
    const e = (x: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * x);
    breath = e(u);
    headLag = e(u - 0.08);
  }
  const yb = hipY - up;
  const hip: V3 = [0, yb, 0];
  const lean = anim === "walk" ? 0.5 : 0;
  const waistY = yb - b.pelvis;
  const shY = waistY - b.chest - breath * 0.5 - (anim === "walk" ? 0 : 0);
  const hunch = und ? 0.5 : 0;
  const sx = b.shW - b.armT * 0.3;
  const shL: V3 = [sx, shY + b.armT * 0.4, lean + hunch * 0.6], shR: V3 = [-sx, shY + b.armT * 0.4, lean + hunch * 0.6];
  const neck: V3 = [0, shY - 0.3, lean + hunch];
  const head: V3 = [0, shY - b.neck - b.headH * 0.44 - (anim === "idle" ? headLag * 0.9 : -headLag * 0.5), lean * 1.2 + hunch * 1.6];
  // ноги
  const legIK = (s: "L" | "R") => ik3([(s === "L" ? 1 : -1) * hipJ, yb, 0], ank[s], b.thigh, b.shin, [s === "L" ? 0.12 : -0.12, 0, 1]);
  const lL = legIK("L"), lR = legIK("R");
  // руки
  const armIK = (s: "L" | "R") => {
    const sg = s === "L" ? 1 : -1, S = s === "L" ? shL : shR;
    let t: V3;
    if (l.armed && s === "L") t = [sg * (sx + 0.9), S[1] + arm * 0.78, 1.8 + (anim === "walk" ? -0.6 * swing : 0.25 * Math.sin(2 * Math.PI * u))];
    else if (l.armed && s === "R") t = [sg * (sx - 0.6), S[1] + arm * 0.62, 2.3 + (anim === "walk" ? 0.5 * swing : 0)];
    else if (anim === "walk") { const sw = -sg * swing * arm * 0.38; t = [sg * (sx + 0.9), S[1] + arm * (0.94 - 0.1 * Math.abs(swing)), sw + 0.3]; }
    else t = [sg * (sx + 1.0), S[1] + arm * 0.93 - breath * 0.25, 0.4 + 0.3 * Math.sin(2 * Math.PI * (u - 0.15))];
    return ik3(S, t, b.uArm, b.fArm, [sg * 0.5, 0, -1]);
  };
  const aL = armIK("L"), aR = armIK("R");
  return {
    hip, hipL: [hipJ, yb, 0], hipR: [-hipJ, yb, 0], kneeL: lL.j, kneeR: lR.j, ankL: lL.e, ankR: lR.e, pitchL: pitch.L, pitchR: pitch.R,
    shL, shR, elL: aL.j, elR: aR.j, hdL: aL.e, hdR: aR.e, neck, head, waistY, shY, chestK: breath, hairLag: headLag,
  };
}

export const proj = (p: V3, v: View): V2 =>
  v === "down" ? [CX + p[0], p[1] + KZ * p[2]] : v === "up" ? [CX - p[0], p[1] - KZ * p[2]] : [CX + p[2], p[1] + KZ * 0.5 * p[0]];
const depth = (p: V3, v: View) => (v === "down" ? p[2] : v === "up" ? -p[2] : p[0]);

// ---------------- маски ----------------
class Mz extends Mk {
  constructor() { super(W, W); }
  seg(a: V2, b: V2, t0: number, t1 = t0) { this.line(a[0] * Z, a[1] * Z, b[0] * Z, b[1] * Z, t0 * Z, t1 * Z); return this; }
  dot(a: V2, r: number) { this.disc(a[0] * Z, a[1] * Z, r * Z); return this; }
  pg(pts: V2[]) { this.poly(pts.map(([x, y]) => [x * Z, y * Z] as [number, number])); return this; }
  el(c: V2, rx: number, ry: number) { this.ell(c[0] * Z, c[1] * Z, rx * Z, ry * Z); return this; }
  /** оставить только пиксели, где f(x, y) истинно (координаты 1×) */
  clip(f: (x: number, y: number) => boolean) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x] && !f((x + 0.5) / Z, (y + 0.5) / Z)) this.d[y * this.w + x] = 0; return this; }
}
type PO = { amp?: number; dome?: number; bias?: number; dith?: number };
interface Part { g: string; ramp: C[]; o?: PO; m: (z: Mz) => void }

export interface Frame { img: Cv; emis: [number, number, C][]; head: V2; feet: V2; sk: Skel }

export function renderFrame(b0: Build, l: Look, v: View, anim: Anim, i: number): Frame {
  const b = body(b0, l), M = mats(l), sk = skel(b, l, anim, i);
  const P = (p: V3) => proj(p, v);
  const parts: Part[] = [];
  const und = l.fac === "umb", fem = l.sex === "f", lh = fem || und;
  const sideL = v === "side";

  // ---- ноги ----
  const legParts = (s: "L" | "R"): Part[] => {
    const hp = s === "L" ? sk.hipL : sk.hipR, kn = s === "L" ? sk.kneeL : sk.kneeR, an = s === "L" ? sk.ankL : sk.ankR, pit = s === "L" ? sk.pitchL : sk.pitchR;
    const far = sideL && s === "R";
    const bias = far ? -0.9 : 0;
    const g = "leg" + s;
    const bootTop = lerp3(kn, an, 0.38);
    const ps: Part[] = [
      { g, ramp: M.pants, o: { dome: 2, bias }, m: (z) => z.seg(P(hp), P(kn), b.thighT, b.thighT * 0.86).seg(P(kn), P(lerp3(kn, an, 0.45)), b.shinT * 1.02) },
      { g, ramp: M.boots, o: { dome: 2, bias }, m: (z) => z.seg(P(bootTop), P(an), b.shinT * 1.08, b.shinT * 0.98) },
      { g, ramp: M.boots, o: { dome: 1, bias: bias + 1.2 }, m: (z) => z.seg(P(bootTop), P(lerp3(bootTop, an, 0.12)), b.shinT * 1.18) },
    ];
    // ступня
    ps.push({
      g, ramp: M.boots, o: { dome: 2, bias: bias - 0.2 }, m: (z) => {
        if (v === "side") {
          const ay = P(an)[1], ax = P(an)[0], c = Math.cos(pit), sn = Math.sin(pit);
          const rot = ([x, y]: V2): V2 => { const dx = x - ax, dy = y - ay; return [ax + dx * c + dy * sn, ay - dx * sn + dy * c]; };
          const h = b.ankle;
          z.pg(([[ax - 1.2, ay - 0.6], [ax + 0.9, ay - 0.3], [ax + b.footL - 0.2, ay + h - 1.5], [ax + b.footL + 0.4, ay + h - 0.3], [ax + b.footL, ay + h + 0.5], [ax - 1.3, ay + h + 0.5]] as V2[]).map(rot));
        } else {
          const toe = v === "down" ? 1 : -1;
          const c = P([an[0], an[1] + b.ankle * 0.55, an[2] + b.footL * 0.35]);
          z.el(c, b.shinT * 0.62 + 0.25, b.ankle * 0.55 + KZ * b.footL * 0.35);
          if (toe < 0) z.el(P([an[0], an[1] + b.ankle * 0.5, an[2] - 0.6]), b.shinT * 0.58, b.ankle * 0.5);
        }
      },
    });
    return ps;
  };

  // ---- руки ----
  const armParts = (s: "L" | "R", withHand = true): Part[] => {
    const S = s === "L" ? sk.shL : sk.shR, E = s === "L" ? sk.elL : sk.elR, H = s === "L" ? sk.hdL : sk.hdR;
    const far = sideL && s === "R";
    const bias = far ? -1 : 0, g = "arm" + s;
    const ps: Part[] = [
      { g, ramp: M.shirt, o: { dome: 2, bias: bias + 0.2 }, m: (z) => z.dot(P(S), b.armT * 0.62).seg(P(S), P(E), b.armT, b.armT * 0.88) },
      { g, ramp: M.skin, o: { dome: 2, bias }, m: (z) => z.seg(P(E), P(H), b.foreT, b.foreT * 0.82) },
      { g, ramp: M.shirt, o: { dome: 1, bias: bias + 0.6 }, m: (z) => z.dot(P(lerp3(E, H, 0.08)), b.armT * 0.5) },
    ];
    if (withHand) ps.push(handPart(s));
    return ps;
  };
  const handPart = (s: "L" | "R"): Part => {
    const E = s === "L" ? sk.elL : sk.elR, H = s === "L" ? sk.hdL : sk.hdR;
    const far = sideL && s === "R";
    return { g: "arm" + s, ramp: M.skin, o: { dome: 2, bias: far ? -0.8 : 0.2 }, m: (z) => z.dot(P(add(H, mul(nrm(sub(H, E)), b.handR * 0.45))), b.handR) };
  };

  // ---- таз и торс ----
  const hy = sk.hip[1], wy = sk.waistY, sy = sk.shY;
  const hz = sk.neck[2];
  const pelvis: Part = {
    g: "pelvis", ramp: M.pants, o: { dome: 3 }, m: (z) => {
      if (v === "side") z.el(P([0, hy - b.pelvis * 0.35, 0.2]), b.hipW * 0.78, b.pelvis * 0.8).pg([P([0, wy, -b.hipW * 0.7]), P([0, wy, b.hipW * 0.72]), P([0, hy, b.hipW * 0.7]), P([0, hy, -b.hipW * 0.65])]);
      else z.pg([P([-b.waist, wy, 0]), P([b.waist, wy, 0]), P([b.hipW, hy - b.pelvis * 0.3, 0]), P([b.hipW * 0.75, hy + 0.9, 0]), P([-b.hipW * 0.75, hy + 0.9, 0]), P([-b.hipW, hy - b.pelvis * 0.3, 0])]);
    },
  };
  const hem = 1.3 + (und ? 0.4 : 0);
  const torso: Part = {
    g: "torso", ramp: M.shirt, o: { dome: 3, amp: 1.6 }, m: (z) => {
      const cw = b.shW + sk.chestK * 0.2;
      if (v === "side") {
        const dB = b.shW * 0.55, dF = b.shW * (fem ? 0.7 : 0.62);
        z.pg([
          P([0, sy - 0.6, hz - b.neckT * 0.4]), P([0, sy + 0.4, -dB + hz * 0.5]), P([0, sy + b.chest * 0.45, -dB * 1.02]), P([0, wy, -dB * 0.85]), P([0, wy + hem, -dB * 0.95]),
          P([0, wy + hem, dF * 0.95]), P([0, wy, dF * 0.8]), P([0, sy + b.chest * 0.38, dF + hz * 0.6]), P([0, sy + 0.6, dF * 0.7 + hz]), P([0, sy - 0.6, hz + b.neckT * 0.4]),
        ]);
      } else {
        const hw = b.waist + 0.3;
        z.pg([
          P([-b.neckT * 0.6, sy - 0.7, 0]), P([-cw + 1.1, sy - 0.2, 0]), P([-cw, sy + 1.4, 0]), P([-cw + 0.4, sy + b.chest * 0.45, 0]), P([-b.waist, wy, 0]), P([-hw, wy + hem, 0]),
          P([hw, wy + hem, 0]), P([b.waist, wy, 0]), P([cw - 0.4, sy + b.chest * 0.45, 0]), P([cw, sy + 1.4, 0]), P([cw - 1.1, sy - 0.2, 0]), P([b.neckT * 0.6, sy - 0.7, 0]),
        ]);
        z.dot(P([-cw + 1.2, sy + 1.1, 0]), 1.25).dot(P([cw - 1.2, sy + 1.1, 0]), 1.25);
      }
      if (und) z.clip((x, y) => y < wy + 0.4 || ((Math.floor(x * 1.3) % 3) !== 0));
    },
  };
  const extras: Part[] = [];
  if (v === "down") extras.push({ g: "torso", ramp: M.skin, o: { dome: 1, bias: -0.3 }, m: (z) => z.pg([P([-b.neckT * 0.55, sy - 0.6, hz]), P([b.neckT * 0.55, sy - 0.6, hz]), P([0, sy + b.chest * (fem ? 0.22 : 0.3), hz])]) });
  if (v === "down") extras.push({ g: "torso", ramp: M.shirt, o: { dome: 1, bias: 0.9 }, m: (z) => z.seg(P([-b.neckT * 0.75, sy - 0.5, hz]), P([0, sy + b.chest * (fem ? 0.24 : 0.32), hz]), 0.8).seg(P([b.neckT * 0.75, sy - 0.5, hz]), P([0, sy + b.chest * (fem ? 0.24 : 0.32), hz]), 0.8) });
  if (fem && v === "down") extras.push({ g: "torso", ramp: M.shirt, o: { dome: 1, bias: -1.1 }, m: (z) => z.seg(P([-b.shW * 0.55, sy + b.chest * 0.5, 0]), P([b.shW * 0.55, sy + b.chest * 0.5, 0]), 0.7) });
  if (und && v === "down") extras.push({ g: "torso", ramp: M.skin, o: { dome: 1, bias: -0.6 }, m: (z) => z.seg(P([-b.shW * 0.42, sy + 0.4, 0]), P([-0.4, sy + 1.0, 0]), 0.6).seg(P([b.shW * 0.42, sy + 0.4, 0]), P([0.4, sy + 1.0, 0]), 0.6) });
  const belt: Part = {
    g: "belt", ramp: M.belt, o: { dome: 1 }, m: (z) => {
      if (v === "side") z.seg(P([0, wy + 0.4, -b.shW * 0.4]), P([0, wy + 0.4, b.shW * 0.42]), fem ? 1.1 : 1.4);
      else z.seg(P([-b.waist - 0.35, wy + 0.4, 0]), P([b.waist + 0.35, wy + 0.4, 0]), fem ? 1.1 : 1.4);
    },
  };
  const buckle: Part | null = v === "up" ? null : { g: "buckle", ramp: M.buckle, o: { dome: 1, bias: 0.3 }, m: (z) => z.el(v === "side" ? P([0, wy + 0.4, b.shW * 0.36]) : P([0, wy + 0.4, 0.2]), v === "side" ? 0.5 : 0.95, 0.8) };

  // ---- голова, шея, волосы ----
  const H0 = sk.head, hc = P(H0), hw = b.headW / 2, hh = b.headH / 2;
  const neckP: Part = { g: "neck", ramp: M.skin, o: { dome: 2, bias: -0.4 }, m: (z) => z.seg(P(sk.neck), P([0, H0[1] + hh * 0.6, H0[2] * 0.8]), b.neckT, b.neckT * 0.9) };
  const headP: Part = {
    g: "head", ramp: M.skin, o: { dome: 4, amp: 1.1, bias: 0.55 }, m: (z) => {
      if (v === "side") {
        z.el([hc[0] - 0.2, hc[1] - 0.1], hw * 0.98, hh);
        z.el([hc[0] + hw * 0.22, hc[1] + hh * 0.32], hw * 0.72, hh * 0.62);
        if (und) z.clip((x, y) => !(x > hc[0] + hw * 0.55 && y > hc[1] + hh * 0.2 && y < hc[1] + hh * 0.45));
      } else {
        z.el([hc[0], hc[1] - hh * 0.06], hw, hh * 0.94);
        z.el([hc[0], hc[1] + hh * 0.3], hw * (und ? 0.74 : 0.8), hh * 0.68);
        if (!fem) z.dot([hc[0] - hw + 0.1, hc[1] + hh * 0.16], Math.max(0.6, hw * 0.1)).dot([hc[0] + hw - 0.1, hc[1] + hh * 0.16], Math.max(0.6, hw * 0.1));
      }
    },
  };
  const earSide: Part = { g: "ear", ramp: M.skin, o: { dome: 1, bias: -0.2 }, m: (z) => z.el([hc[0] - hw * 0.12, hc[1] + hh * 0.14], Math.max(0.8, hw * 0.16), Math.max(1, hh * 0.24)) };
  const lag = sk.hairLag * 0.5;
  const hairCap: Part = {
    g: "hair", ramp: M.hair, o: { dome: 3, amp: 1.6, bias: 0.3 }, m: (z) => {
      if (v === "up") {
        z.el([hc[0], hc[1] - hh * 0.04], hw + 0.15, hh + 0.05);
        if (!lh) z.clip((x, y) => y < hc[1] + hh * 0.78 - Math.abs(x - hc[0]) * 0.12);
      } else if (v === "down") {
        z.el([hc[0], hc[1] - hh * 0.1], hw + 0.25, hh * 0.92);
        const fr = hc[1] - hh * (fem ? 0.2 : 0.28);
        z.clip((x, y) => {
          const dx = Math.abs(x - hc[0]) / hw;
          const side = lh ? hc[1] + hh * 0.6 : hc[1] + hh * 0.05;
          const t = Math.max(0, Math.min(1, (dx - 0.5) / 0.35));
          const fringe = fem ? fr - Math.abs(x - hc[0] + hw * 0.2) * 0.3 : fr + (Math.floor((x - hc[0]) * 0.9 + 9) % 2) * 0.55;
          return y < fringe + (side - fringe) * t;
        });
      } else {
        z.el([hc[0] - 0.5, hc[1] - hh * 0.18], hw + 0.3, hh * 0.88);
        z.clip((x, y) => y < hc[1] - hh * 0.32 || x < hc[0] - hw * 0.05 || (fem && y < hc[1] - hh * 0.15));
        z.clip((x, y) => !(x < hc[0] + hw * 0.2 && x > hc[0] - hw * 0.35 && y > hc[1] - hh * 0.05 && y < hc[1] + hh * 0.42));
        if (!lh) z.clip((_, y) => y < hc[1] + hh * 0.38);
      }
    },
  };
  // длинные волосы (женщина): масса за спиной, пряди у лица
  const hairBack: Part | null = !lh ? null : {
    g: "hairB", ramp: M.hair, o: { dome: 3, bias: v === "up" ? 0 : -0.7 }, m: (z) => {
      const low = sy + b.chest * (fem ? 0.55 : 0.28) + lag, wk = fem ? 0.95 : 0.8;
      if (v === "side") z.seg([hc[0] - hw * 0.45, hc[1]], [hc[0] - hw * 0.75 - 0.4, low], hw * 1.0, hw * 0.75);
      else z.pg([[hc[0] - hw - 0.3, hc[1] - hh * 0.2], [hc[0] + hw + 0.3, hc[1] - hh * 0.2], [hc[0] + hw * wk, low - 0.6], [hc[0] + hw * 0.4, low + 0.4], [hc[0] - hw * 0.4, low + 0.4], [hc[0] - hw * wk, low - 0.6]]);
    },
  };
  const locks: Part | null = !lh || v !== "down" ? null : {
    g: "hair", ramp: M.hair, o: { dome: 2, bias: 0.2 }, m: (z) => {
      const low = sy + b.chest * 0.3 + lag;
      z.seg([hc[0] - hw * 0.82, hc[1] - hh * 0.1], [hc[0] - hw * 0.88, low], hw * 0.42, hw * 0.3).seg([hc[0] + hw * 0.82, hc[1] - hh * 0.1], [hc[0] + hw * 0.88, low], hw * 0.42, hw * 0.3);
    },
  };

  const strands: Part | null = !lh || v !== "up" ? null : {
    g: "hairB", ramp: M.hair, o: { dome: 1, bias: -1.3 }, m: (z) => {
      const low = sy + b.chest * (fem ? 0.5 : 0.24) + lag;
      for (const f of [-0.5, 0.05, 0.55]) z.seg([hc[0] + hw * f, hc[1] + hh * 0.1], [hc[0] + hw * f * 0.9, low - 0.8], 0.55);
    },
  };
  // ---- оружие и щит ----
  const sword: Part[] = [], shield: Part[] = [];
  if (l.armed) {
    const Hd = sk.hdL, dir = nrm(sub(Hd, sk.elL)), bd = nrm([0.22 + dir[0] * 0.2, 0.62, 0.75]);
    const bl = (FY - sk.shY) * 0.52;
    const gv: V3 = mul(nrm([-bd[2], 0, bd[0]]), Math.max(1.6, bl * 0.14));
    const g0 = add(Hd, mul(bd, 0.9));
    sword.push(
      { g: "sword", ramp: M.grip, o: { dome: 1 }, m: (z) => z.seg(P(add(Hd, mul(bd, -0.6))), P(add(Hd, mul(bd, -2.0))), 1.0) },
      { g: "sword", ramp: M.trim, o: { dome: 1, bias: 0.3 }, m: (z) => z.dot(P(add(Hd, mul(bd, -2.4))), 0.8) },
      { g: "sword", ramp: M.steel, o: { dome: 1, amp: 1.8, bias: 0.4 }, m: (z) => z.seg(P(g0), P(add(g0, mul(bd, bl))), 1.7, 0.9) },
      { g: "sword", ramp: M.trim, o: { dome: 1, bias: 0.2 }, m: (z) => z.seg(P(add(g0, gv)), P(sub(g0, gv)), 1.1) },
    );
    const Sc = add(sk.hdR, [0.6, -0.5, 1.1]), r = Math.max(3.2, b.headW * 0.5);
    const c2 = P(Sc);
    const sh = v === "side" ? [r * 0.38, r] : [r, r * 0.96];
    shield.push(
      { g: "shield", ramp: M.steel, o: { dome: 2, bias: v === "up" ? -0.8 : 0 }, m: (z) => z.el(c2, sh[0], sh[1]) },
      { g: "shield", ramp: M.wood, o: { dome: 3, bias: v === "up" ? -0.8 : 0 }, m: (z) => z.el(c2, Math.max(0.6, sh[0] - 0.9), sh[1] - 0.9) },
    );
    if (v === "down") shield.push({ g: "shield", ramp: M.trim, o: { dome: 2, bias: 0.2 }, m: (z) => z.el(c2, 1.1, 1.05) });
    if (v === "side") shield.push({ g: "shield", ramp: M.trim, o: { dome: 1 }, m: (z) => z.el([c2[0] + sh[0] * 0.5, c2[1]], 0.6, 1.0) });
  }

  // ---- порядок ----
  const legs = (["L", "R"] as const).slice().sort((a, c) => depth(a === "L" ? sk.ankL : sk.ankR, v) - depth(c === "L" ? sk.ankL : sk.ankR, v));
  const push = (...ps: (Part | null | undefined)[]) => { for (const p of ps) if (p) parts.push(p); };
  if (v === "down") {
    push(hairBack);
    for (const s of legs) push(...legParts(s));
    push(pelvis, torso, ...extras, belt, buckle);
    push(...armParts("R"), ...armParts("L", !l.armed));
    push(neckP, headP, hairCap, locks);
    push(...sword); if (l.armed) push(handPart("L"));
    push(...shield);
  } else if (v === "up") {
    push(...shield, ...sword);
    for (const s of legs) push(...legParts(s));
    push(pelvis, torso, belt);
    push(...armParts("R"), ...armParts("L"));
    push(neckP, headP, hairCap, hairBack, strands);
  } else {
    push(hairBack);
    push(...armParts("R"));
    push(...shield);
    for (const s of legs) push(...legParts(s));
    push(pelvis, torso, ...extras, belt, buckle, neckP, headP, hairCap, earSide);
    push(...armParts("L", !l.armed));
    push(...sword); if (l.armed) push(handPart("L"));
  }

  // ---- отрисовка 2× ----
  const cv = new Cv(W, W), ids = new Uint8Array(W * W);
  parts.forEach((p, k) => {
    const m = new Mz(); p.m(m);
    paint(cv, m, p.ramp, { dith: 0.12, amp: 1.5, ...p.o });
    for (let q = 0; q < m.d.length; q++) if (m.d[q]) ids[q] = k + 1;
  });
  // ---- сведение 2× → 1× ----
  const out = new Cv(FR, FR), oid = new Uint8Array(FR * FR);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    const cnt = new Map<number, number>();
    for (let j = 0; j < 2; j++) for (let i2 = 0; i2 < 2; i2++) { const id = ids[(y * 2 + j) * W + x * 2 + i2]; if (id) cnt.set(id, (cnt.get(id) ?? 0) + 1); }
    let tot = 0; for (const n of cnt.values()) tot += n;
    if (tot < 2) continue;
    let best = 0, bn = -1;
    for (const [id, n] of cnt) if (n > bn || (n === bn && id > best)) { best = id; bn = n; }
    const cols = new Map<string, { n: number; c: C }>();
    for (let j = 0; j < 2; j++) for (let i2 = 0; i2 < 2; i2++) {
      const q = (y * 2 + j) * W + x * 2 + i2; if (ids[q] !== best) continue;
      const c = cv.get(x * 2 + i2, y * 2 + j), key = c.join(","), e = cols.get(key); if (e) e.n++; else cols.set(key, { n: 1, c });
    }
    let bc: { n: number; c: C } | null = null;
    for (const e of cols.values()) if (!bc || e.n > bc.n || (e.n === bc.n && e.c[0] + e.c[1] + e.c[2] < bc.c[0] + bc.c[1] + bc.c[2])) bc = e;
    out.set(x, y, bc!.c); oid[y * FR + x] = best;
  }
  // ---- лицо (1×) ----
  const emis: [number, number, C][] = [];
  const hx1 = hc[0], hy1 = hc[1];
  const setId = (x: number, y: number, c: C) => { x = Math.round(x); y = Math.round(y); if (oid[y * FR + x]) out.set(x, y, c); };
  const S = M.skin, big = b.headH >= 9;
  if (v === "down") {
    const ey = Math.round(hy1 + hh * 0.14), ex = Math.max(1.5, hw * 0.42);
    for (const sg of [-1, 1]) {
      const x = Math.round(hx1 - 0.5 + sg * ex);
      if (und) {
        setId(x, ey - 1, S[0]); setId(x, ey, M.eyeGlow![2]); if (big) setId(x, ey + 1, M.eyeGlow![1]);
        emis.push([x, ey, M.eyeGlow![3]]);
      } else {
        setId(x, ey, M.eye); setId(x, ey - 1, M.eye);
        if (fem) setId(x + sg, ey - 1, M.eye);
        else if (big) { setId(x, ey - 3, M.hair[1]); setId(x + sg, ey - 3, M.hair[1]); }
      }
    }
    const my = ey + (big ? 3 : 2);
    setId(hx1 - 0.5, my, und ? S[0] : S[1]); if (big || und) setId(hx1 + 0.5, my, und ? S[0] : S[1]);
    if (und) { setId(hx1 - ex - 1, ey + 2, S[1]); setId(hx1 + ex, ey + 2, S[1]); }
    else if (big) setId(hx1 - 0.5, ey + 1, S[2]);
  } else if (v === "side") {
    const ey = Math.round(hy1 + hh * 0.14);
    let fx = 0; for (let x = FR - 1; x > 0; x--) if (oid[ey * FR + x] && parts[oid[ey * FR + x] - 1].g === "head") { fx = x; break; }
    const ex = fx - Math.max(1, Math.round(hw * 0.3));
    if (und) { setId(ex, ey, M.eyeGlow![2]); setId(ex, ey - 1, S[0]); emis.push([ex, ey, M.eyeGlow![3]]); }
    else { setId(ex, ey, M.eye); if (big) setId(ex, ey + 1, M.eye); setId(ex, ey - (big ? 2 : 1), fem ? M.eye : M.hair[1]); }
    // нос: 1 px вперёд
    const ny = ey + 1; if (!oid[ny * FR + fx + 1]) { out.set(fx + 1, ny, S[2]); oid[ny * FR + fx + 1] = oid[ny * FR + fx]; }
    setId(fx, ey + (big ? 3 : 2), S[1]);
  }
  // ---- внутренний контур: передняя часть режет заднюю ----
  const grp = (id: number) => parts[id - 1].g;
  const SAME = new Set(["torso|belt", "belt|torso", "torso|buckle", "buckle|belt", "belt|buckle", "neck|head", "pelvis|belt", "belt|pelvis", "torso|pelvis", "ear|head", "head|ear", "hair|head", "hairB|hair", "hair|hairB", "head|hair", "sword|armL", "armL|sword"]);
  const res = new Cv(FR, FR); res.d.set(out.d);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    const a = oid[y * FR + x]; if (!a) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= FR || yy >= FR) continue;
      const c = oid[yy * FR + xx];
      if (!c || c <= a) continue;
      const ga = grp(a), gc = grp(c);
      if (ga === gc || SAME.has(ga + "|" + gc)) continue;
      const r = parts[a - 1].ramp; res.set(x, y, mixC(r[0], out.get(x, y), 0.25));
      break;
    }
  }
  // ---- внешний контур: тёмный тон материала ----
  const DK = hx("#0a060c");
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    if (oid[y * FR + x]) continue;
    let best: C | null = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= FR || yy >= FR) continue;
      const c = oid[yy * FR + xx]; if (!c) continue;
      const col = mixC(parts[c - 1].ramp[0], DK, 0.55);
      if (!best || col[0] + col[1] + col[2] < best[0] + best[1] + best[2]) best = col;
    }
    if (best) res.set(x, y, best);
  }
  return { img: res, emis, head: hc, feet: [CX, FY], sk };
}
export const mixC = (a: C, b: C, t: number): C => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
export const flipCv = (c: Cv): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(c.w - 1 - x, y, c.get(x, y)); return o; };
