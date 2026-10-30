/**
 * Задача 147, шаг 2: основа героя «Б» (~3,5 головы, рост ~30 px) — финальная доводка.
 * Скелет в 3D (X — левая рука героя, Y — вниз, Z — вперёд), позы — ключевые кадры с плавными переходами,
 * торс и таз — «лофт» из эллиптических сечений (объём в любом ракурсе и при падении), конечности — капсулы,
 * голова, лицо и причёска — в своей системе головы (штамп поворачивается вместе с головой).
 * Всё рисуется масками в сетке 2× (paint: объём по расстоянию до края, свет сверху-слева) и сводится в 1× по большинству;
 * внутренний контур — передняя часть режет заднюю тёмным тоном её материала; внешний — 1 px тёмным тоном материала.
 * Палитры, причёски и анимации — data/hero-base-b.json; точки скелета для слоёв снаряжения — exportSkeleton().
 * В игру не подключено. Монтаж — tools/gen/hero147/base_b_montage.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { Cv, Mk, paint, hx, type C } from "../bosses139/mino_lib";

export const Z = 2, FR = 48, W = FR * Z, FY = 45, CX = 24, KZ = 0.35;
export type View = "down" | "up" | "side";
export type V3 = [number, number, number];
export type V2 = [number, number];
export type Fac = "sol" | "umb";
export type Sex = "m" | "f";
export type AnimId = "idle" | "walk" | "run" | "atk1h" | "atk2h" | "bow" | "cast" | "block" | "hurt" | "death" | "ride" | "gather";
export interface Look { fac: Fac; sex: Sex; hair?: string; hairColor?: string; props?: boolean; /** слои снаряжения (tools/gen/gear147) */ gear?: (ctx: GearCtx) => void; /** поправка позы под оружие снаряжения (хват двуручника в покое и т. п.) */ /** зеркало по X до проекции: для вида «влево» (рендер side + mirrorX, затем flipX) — рука с оружием остаётся той же и уходит на дальнюю сторону, порядок слоёв пересчитывается по глубине */ mirrorX?: boolean; /** свет сверху-СПРАВА при рендере — для кадров, которые затем отражаются flipX (итог: свет сверху-слева) */ lightFlip?: boolean; posePatch?: (P: Pose, k: { anim: AnimId; u: number; view: View; arm: number; sx: number; b: Build; hipY: number; hipJ: number }) => void }

export const DATA = JSON.parse(fs.readFileSync(path.resolve("data/hero-base-b.json"), "utf8"));
export const ANIMS: AnimId[] = Object.keys(DATA.anims) as AnimId[];
export const NF = (a: AnimId): number => DATA.anims[a].frames;
const R5 = (a: string[]): C[] => a.map(hx);

export interface Build { headW: number; headH: number; neck: number; chest: number; pelvis: number; thigh: number; shin: number; ankle: number; footL: number; shW: number; waist: number; hipW: number; uArm: number; fArm: number; thighT: number; shinT: number; armT: number; foreT: number; handR: number; neckT: number }
export function bodyOf(l: Look): Build {
  const o: Build = { ...DATA.build };
  if (l.sex === "f") { o.shW *= 0.84; o.waist *= 0.84; o.hipW *= 1.06; o.shinT *= 0.92; o.armT *= 0.86; o.foreT *= 0.85; o.neckT *= 0.84; o.headW *= 0.96; o.chest *= 0.95; o.handR *= 0.9; }
  if (l.fac === "umb") { o.armT *= 0.92; o.foreT *= 0.86; o.thighT *= 0.92; o.shinT *= 0.88; o.waist *= 0.9; o.neckT *= 0.85; }
  return o;
}
export function hairStyles(sex: Sex): { id: string; name: string; sol: string; umb: string }[] { return DATA.hair[sex]; }

export interface Mats { skin: C[]; hair: C[]; shirt: C[]; pants: C[]; vest: C[] | null; boots: C[]; belt: C[]; buckle: C[]; pouch: C[]; wrap?: C[]; eye: C; glow?: C[]; lip: C; blush: C | null; steel: C[]; wood: C[]; trim: C[]; grip: C[]; string: C[]; orb: C[] }
function mats(l: Look): Mats {
  const F = DATA.factions[l.fac], S = F[l.sex];
  const style = hairStyles(l.sex).find((h) => h.id === (l.hair ?? hairStyles(l.sex)[0].id))!;
  const hc = l.hairColor ?? (style as any)[l.fac];
  const sol = l.fac === "sol";
  return {
    skin: R5(F.skin), hair: R5(DATA.hairColors[l.fac][hc]), shirt: R5(S.shirt), pants: R5(S.pants), vest: S.vest ? R5(S.vest) : null,
    boots: R5(F.boots), belt: R5(F.belt), buckle: R5(F.buckle), pouch: R5(F.pouch), wrap: F.wrap ? R5(F.wrap) : undefined,
    eye: hx(F.eye), glow: F.eyeGlow ? R5(F.eyeGlow) : undefined, lip: hx(F.lip), blush: F.blush ? hx(F.blush) : null,
    steel: sol ? R5(["#1c1f26", "#353b47", "#5a6474", "#909cb0", "#d4dcea"]) : R5(["#0c0c12", "#1c1c28", "#33334a", "#55557a", "#8a8aa8"]),
    wood: sol ? R5(["#2a160c", "#4a2a16", "#6e4424", "#966236", "#b8844c"]) : R5(["#1e1814", "#3a3028", "#5a4c3e", "#7e6c58", "#a08c72"]),
    trim: sol ? R5(["#5a3a10", "#a06c1c", "#dca634", "#ffd864", "#fff2b0"]) : R5(["#1e1028", "#3a1e4a", "#5e3474", "#8a52a0", "#b07cc4"]),
    grip: R5(["#1a0f08", "#33200f", "#55361a", "#7a5028", "#94683a"]),
    string: R5(["#6a6250", "#9a927e", "#c8c0a8", "#e8e2cc", "#fffaf0"]),
    orb: sol ? R5(["#6a4210", "#c08020", "#f0c040", "#ffe890", "#fffbe0"]) : R5(["#1e4a18", "#3a8a2a", "#7ad04a", "#c0f080", "#f0ffe0"]),
  };
}

// ---------------- векторы ----------------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const lerp3 = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
function rot(v: V3, ax: V3, ang: number): V3 {
  const k = nrm(ax), c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}
function ik3(s: V3, t: V3, l1: number, l2: number, pole: V3): { j: V3; e: V3 } {
  let dv = sub(t, s), d = len(dv) || 0.01;
  const mx = l1 + l2 - 0.02;
  if (d > mx) { t = add(s, mul(dv, mx / d)); dv = sub(t, s); d = mx; }
  const mn = Math.abs(l1 - l2) + 0.3;
  if (d < mn) { t = add(s, mul(nrm(dv), mn)); dv = sub(t, s); d = mn; }
  const u = mul(dv, 1 / d);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = nrm(sub(pole, mul(u, dot(pole, u))));
  return { j: add(add(s, mul(u, a)), mul(p, h)), e: t };
}
const ease = (t: number) => t * t * (3 - 2 * t);
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// ---------------- поза ----------------
interface Hand { rel?: V3; abs?: V3; fromL?: V3; pole?: V3 }
export interface Pose {
  hip: V3; lean: number; twist: number; roll: number; chestRise: number;
  ankL: V3; ankR: V3; pitchL: number; pitchR: number; kneeL?: V3; kneeR?: V3;
  hL: Hand; hR: Hand; headOff: V3; hairLag: number;
  G?: { axis: V3; ang: number; shift: V3 };
  weapon?: { kind: "sword" | "great" | "bow" | "staff"; dir: V3; up?: V3; draw?: number; glow?: number };
  twoHand?: boolean; shield?: { n: V3 }; eyes: "open" | "closed" | "squint";
}
type KF = Record<string, number | number[]>;
function kf(keys: [number, KF][], u: number, eases?: ((t: number) => number)[]): KF {
  let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  const e = (eases?.[i] ?? ease)(cl((u - t0) / (t1 - t0 || 1)));
  const o: KF = {};
  for (const k of Object.keys(a)) {
    const x = a[k], y = b[k] ?? x;
    o[k] = Array.isArray(x) ? x.map((v, j) => v + ((y as number[])[j] - v) * e) : (x as number) + ((y as number) - (x as number)) * e;
  }
  return o;
}
const V = (x: number | number[]) => x as unknown as V3;
const N = (x: number | number[]) => x as number;

export function pose(l: Look, anim: AnimId, i: number, view: View): Pose {
  const b = bodyOf(l), n = NF(anim), u = i / n;
  const leg = b.thigh + b.shin, arm = b.uArm + b.fArm, sx = b.shW - b.armT * 0.3;
  const hipJ = Math.max(b.hipW * 0.5, b.thighT * 0.5 + 0.45);
  const hipY = FY - b.ankle - leg * 0.97;
  const P: Pose = {
    hip: [0, hipY, 0], lean: l.fac === "umb" ? 0.06 : 0, twist: 0, roll: 0, chestRise: 0,
    ankL: [hipJ + 0.35, FY - b.ankle, 0.7], ankR: [-hipJ - 0.35, FY - b.ankle, -0.5], pitchL: 0, pitchR: 0,
    hL: { rel: [1.0, arm * 0.9, 0.4] }, hR: { rel: [-1.0, arm * 0.9, 0.4] }, headOff: [0, 0, 0], hairLag: 0, eyes: "open",
  };
  const props = l.props !== false;
  const swordReady = () => { P.weapon = { kind: "sword", dir: nrm([0.25, -0.25, 1]) }; P.shield = { n: nrm([-0.45, 0, 1]) }; };
  const breathe = (k = 1) => { const e = (x: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * x); P.chestRise = 0.5 * e(u) * k; P.headOff = [0, -0.45 * e(u - 0.08) * k, 0]; P.hairLag = e(u - 0.12) * k; };
  switch (anim) {
    case "idle": {
      breathe();
      const e = 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
      P.hL.rel = [1.0, arm * 0.9 - 0.3 * e, 0.4 + 0.3 * Math.sin(2 * Math.PI * (u - 0.15))];
      P.hR.rel = [-1.0, arm * 0.9 - 0.3 * e, 0.4 + 0.3 * Math.sin(2 * Math.PI * (u - 0.2))];
      break;
    }
    case "walk": case "run": {
      const run = anim === "run";
      const S = leg * (run ? 0.42 : 0.3), Lh = b.shin * (run ? 0.8 : 0.42), st = run ? 0.42 : 0.55;
      const sw = Math.cos(2 * Math.PI * u);
      P.hip = [0, hipY + (run ? 1.1 : 0.5) - (run ? 1.3 : 0.75) * (0.5 + 0.5 * Math.cos(4 * Math.PI * (u - (run ? 0.2 : 0.275)))), 0];
      P.lean += run ? 0.3 : 0.06;
      for (const s of ["L", "R"] as const) {
        const ph = (u + (s === "L" ? 0 : 0.5)) % 1;
        let z: number, lift = 0, pit = 0;
        if (ph < st) z = S * (1 - (2 * ph) / st);
        else { const t = (ph - st) / (1 - st); z = -S + 2 * S * ease(t); lift = Lh * Math.sin(Math.PI * t); pit = (run ? 0.7 : 0.45) * (1 - t) * Math.sin(Math.PI * Math.min(1, t * 1.6)); }
        const a: V3 = [(s === "L" ? 1 : -1) * (hipJ + 0.1), FY - b.ankle - lift, z];
        if (s === "L") { P.ankL = a; P.pitchL = pit; } else { P.ankR = a; P.pitchR = pit; }
      }
      if (run) {
        P.hL = { rel: [0.6, arm * 0.55, -sw * arm * 0.6 + 0.6], pole: [0.3, 0.4, -1] }; P.hR = { rel: [-0.6, arm * 0.55, sw * arm * 0.6 + 0.6], pole: [-0.3, 0.4, -1] };
        P.headOff = [0, 0.2, 0.6]; P.twist = 0.12 * sw;
      } else {
        P.hL.rel = [0.9, arm * (0.92 - 0.1 * Math.abs(sw)), -sw * arm * 0.38 + 0.3]; P.hR.rel = [-0.9, arm * (0.92 - 0.1 * Math.abs(sw)), sw * arm * 0.38 + 0.3];
        P.twist = 0.06 * sw;
      }
      P.hairLag = 0.5 + 0.5 * Math.cos(4 * Math.PI * (u - 0.36));
      break;
    }
    case "atk1h": case "block": {
      swordReady();
      const ready: KF = { h: [1.0, arm * 0.62, 2.0], d: [0.25, -0.25, 1], tw: 0, ln: 0.05, st: 0.7, dy: 0.3, hr: [-0.8, arm * 0.6, 1.8], sn: [-0.45, 0, 1], dz: 0 };
      let k: KF;
      if (anim === "atk1h") {
        k = kf([
          [0, ready],
          [0.3, { h: [1.5, -arm * 0.2, -1.0], d: [0.3, -1, -0.45], tw: 0.5, ln: -0.06, st: 0.2, dy: 0.2, hr: [-0.6, arm * 0.55, 2.2], sn: [-0.3, 0, 1], dz: -0.3 }],
          [0.5, { h: [-0.4, arm * 0.55, arm * 0.9], d: [-0.35, 0.6, 0.75], tw: -0.42, ln: 0.22, st: 1.9, dy: 0.9, hr: [-1.2, arm * 0.6, 0.6], sn: [-0.7, 0, 0.7], dz: 0.6 }],
          [0.66, { h: [-1.8, arm * 0.85, arm * 0.45], d: [-0.75, 0.55, 0.2], tw: -0.55, ln: 0.24, st: 1.9, dy: 1.0, hr: [-1.3, arm * 0.62, 0.4], sn: [-0.7, 0, 0.7], dz: 0.6 }],
          [1, ready],
        ], u, [ease, easeIn, easeOut, ease]);
      } else {
        k = kf([
          [0, ready],
          [0.3, { h: [1.3, arm * 0.6, 0.6], d: [0.35, -0.3, 0.9], tw: -0.15, ln: 0.14, st: 1.0, dy: 1.1, hr: [sx - 1.2, arm * 0.4, arm * 0.8], sn: [0.05, -0.05, 1], dz: 0 }],
          [0.45, { h: [1.3, arm * 0.62, 0.4], d: [0.35, -0.3, 0.9], tw: -0.12, ln: 0.04, st: 1.0, dy: 1.3, hr: [sx - 1.4, arm * 0.42, arm * 0.62], sn: [0.05, -0.05, 1], dz: -0.8 }],
          [0.75, { h: [1.3, arm * 0.6, 0.6], d: [0.35, -0.3, 0.9], tw: -0.15, ln: 0.12, st: 1.0, dy: 1.1, hr: [sx - 1.2, arm * 0.4, arm * 0.8], sn: [0.05, -0.05, 1], dz: -0.2 }],
          [1, ready],
        ], u, [easeOut, easeIn, ease, ease]);
      }
      P.hL = { rel: V(k.h), pole: [0.6, 0.2, -1] }; P.weapon!.dir = nrm(V(k.d)); P.twist = N(k.tw); P.lean += N(k.ln);
      P.ankL = [hipJ + 0.3, FY - b.ankle, N(k.st)]; P.hip = [0, hipY + N(k.dy), N(k.dz)];
      P.hR = { rel: V(k.hr), pole: [-0.8, 0.3, -0.6] }; P.shield = { n: nrm(V(k.sn)) };
      break;
    }
    case "atk2h": {
      const ready: KF = { h: [-(sx - 0.8), arm * 0.72, 2.2], d: [0.12, -0.6, 0.8], tw: 0.1, ln: 0.06, st: 0.8, dy: 0.5 };
      const k = kf([
        [0, ready],
        [0.35, { h: [-(sx - 1.4), -arm * 0.32, -0.4], d: [0.1, -0.35, -1], tw: 0.25, ln: -0.12, st: 0.4, dy: 0.2 }],
        [0.55, { h: [-(sx - 0.9), arm * 0.72, arm * 0.85], d: [0.05, 0.78, 0.62], tw: -0.12, ln: 0.36, st: 1.8, dy: 1.8 }],
        [0.72, { h: [-(sx - 0.9), arm * 0.76, arm * 0.82], d: [0.05, 0.8, 0.6], tw: -0.12, ln: 0.38, st: 1.8, dy: 2.0 }],
        [1, ready],
      ], u, [ease, easeIn, ease, ease]);
      P.weapon = { kind: "great", dir: nrm(V(k.d)) }; P.twoHand = true;
      P.hL = { rel: V(k.h), pole: [0.7, 0.3, -0.7] }; P.hR = { pole: [-0.7, 0.3, -0.7] };
      P.twist = N(k.tw); P.lean += N(k.ln); P.ankL = [hipJ + 0.3, FY - b.ankle, N(k.st)]; P.hip = [0, hipY + N(k.dy), 0];
      break;
    }
    case "bow": {
      const ready: KF = { h: [0.9, arm * 0.78, 1.2], bu: [0.25, -1, 0.15], fr: [-1.2, 1.0, -0.6], dr: 0, tw: -0.25, ln: 0.02 };
      const k = kf([
        [0, ready],
        [0.25, { h: [0.1, arm * 0.12, arm * 0.95], bu: [0.02, -1, 0], fr: [-0.8, 0.3, -1.8], dr: 0.1, tw: -0.6, ln: 0 }],
        [0.5, { h: [0.1, arm * 0.12, arm * 0.95], bu: [0.02, -1, 0], fr: [-1.2, -0.4, -arm * 0.98], dr: 1, tw: -0.65, ln: -0.04 }],
        [0.6, { h: [0.2, arm * 0.12, arm * 0.98], bu: [0.02, -1, 0], fr: [-1.8, -0.8, -arm * 1.15], dr: 0, tw: -0.65, ln: -0.06 }],
        [1, ready],
      ], u, [ease, ease, easeOut, ease]);
      P.weapon = { kind: "bow", dir: [0, 0, 1], up: nrm(V(k.bu)), draw: N(k.dr) };
      P.hL = { rel: V(k.h), pole: [0.4, 0.6, -0.5] }; P.hR = { fromL: V(k.fr), pole: [-0.6, 0.2, -1] };
      P.twist = N(k.tw); P.lean += N(k.ln); P.ankL = [hipJ + 0.4, FY - b.ankle, 1.4]; P.ankR = [-hipJ - 0.3, FY - b.ankle, -1.0];
      break;
    }
    case "cast": {
      const ready: KF = { h: [0.9, arm * 0.72, 1.0], sd: [0.05, -1, 0.12], hr: [-1.0, arm * 0.85, 0.6], ln: 0, gl: 0.15, dy: 0 };
      const k = kf([
        [0, ready],
        [0.35, { h: [1.0, arm * 0.42, 1.2], sd: [0.08, -1, 0.05], hr: [-0.3, arm * 0.22, 1.6], ln: -0.06, gl: 0.6, dy: 0.2 }],
        [0.55, { h: [1.0, arm * 0.38, 1.9], sd: [0.06, -1, 0.45], hr: [0.2, arm * 0.25, arm * 1.0], ln: 0.18, gl: 1, dy: 0.6 }],
        [0.75, { h: [1.0, arm * 0.4, 1.8], sd: [0.06, -1, 0.4], hr: [0.1, arm * 0.28, arm * 0.95], ln: 0.15, gl: 0.75, dy: 0.5 }],
        [1, ready],
      ], u, [ease, easeIn, ease, ease]);
      P.weapon = { kind: "staff", dir: nrm(V(k.sd)), glow: N(k.gl) };
      P.hL = { rel: V(k.h), pole: [0.6, 0.4, -0.6] }; P.hR = { rel: V(k.hr), pole: [-0.6, 0.4, -0.8] };
      P.lean += N(k.ln); P.hip = [0, hipY + N(k.dy), 0]; P.ankL = [hipJ + 0.3, FY - b.ankle, 1.2];
      breathe(0.4);
      break;
    }
    case "hurt": {
      const k = kf([
        [0, { hz: 0, ln: 0, hd: [0, 0, 0], ax: 1.0, ay: arm * 0.9, az: 0.4, dy: 0 }],
        [0.22, { hz: -1.3, ln: -0.38, hd: [0, -0.2, -1.0], ax: 2.4, ay: arm * 0.55, az: -0.8, dy: 0.6 }],
        [0.45, { hz: -1.1, ln: -0.2, hd: [0, 0.1, -0.4], ax: 1.8, ay: arm * 0.75, az: -0.2, dy: 0.8 }],
        [1, { hz: 0, ln: 0, hd: [0, 0, 0], ax: 1.0, ay: arm * 0.9, az: 0.4, dy: 0 }],
      ], u, [easeOut, ease, ease]);
      P.hip = [0, hipY + N(k.dy), N(k.hz)]; P.lean += N(k.ln); P.headOff = V(k.hd);
      P.hL.rel = [N(k.ax), N(k.ay), N(k.az)]; P.hR.rel = [-N(k.ax), N(k.ay), N(k.az)];
      P.ankR = [-hipJ - 0.35, FY - b.ankle, -0.5 - 1.2 * Math.sin(Math.PI * cl(u / 0.6))];
      P.eyes = u > 0.08 && u < 0.7 ? "squint" : "open"; P.hairLag = Math.sin(Math.PI * cl(u / 0.6));
      break;
    }
    case "death": {
      const k = kf([
        [0, { hz: 0, ln: 0, dy: 0, ax: 1.0, ay: arm * 0.9, az: 0.4, hd: [0, 0, 0], g: 0 }],
        [0.2, { hz: -1.2, ln: -0.35, dy: 0.6, ax: 2.2, ay: arm * 0.55, az: -0.8, hd: [0, -0.2, -1], g: 0 }],
        [0.45, { hz: -0.4, ln: 0.35, dy: 3.2, ax: 1.4, ay: arm * 0.95, az: 0.8, hd: [0, 0.6, 0.8], g: 0.08 }],
        [0.78, { hz: -0.4, ln: 0.15, dy: 2.0, ax: 2.0, ay: arm * 0.8, az: 0.2, hd: [0, 0.2, 0.2], g: 1 }],
        [0.88, { hz: -0.4, ln: 0.15, dy: 2.0, ax: 2.2, ay: arm * 0.8, az: 0.2, hd: [0, 0.2, 0.2], g: 0.94 }],
        [1, { hz: -0.4, ln: 0.15, dy: 2.0, ax: 2.4, ay: arm * 0.75, az: 0.2, hd: [0, 0.2, 0.2], g: 1 }],
      ], u, [easeOut, ease, easeIn, easeOut, ease]);
      P.hip = [0, hipY + N(k.dy), N(k.hz)]; P.lean += N(k.ln); P.headOff = V(k.hd);
      P.hL.rel = [N(k.ax), N(k.ay), N(k.az)]; P.hR.rel = [-N(k.ax), N(k.ay), N(k.az)];
      const g = N(k.g), H = 30;
      if (view === "side") P.G = { axis: [1, 0, 0], ang: g * Math.PI / 2, shift: [0, -b.shW * 0.45 * g, H * 0.5 * g] };
      else P.G = { axis: [0, 0, 1], ang: g * Math.PI / 2, shift: [-H * 0.5 * g, -b.shW * 0.7 * g, 0] };
      P.eyes = u < 0.12 ? "open" : u < 0.45 ? "squint" : "closed";
      break;
    }
    case "ride": {
      const bob = 0.7 * (0.5 - 0.5 * Math.cos(4 * Math.PI * u)), lag = 0.5 - 0.5 * Math.cos(4 * Math.PI * (u - 0.08));
      P.hip = [0, hipY + 1.6 + bob, 0]; P.lean += 0.14;
      for (const s of [1, -1]) {
        const kn: V3 = [s * (hipJ + 1.9), hipY + 1.6 + bob + 1.8, 3.0], an: V3 = [s * (hipJ + 2.1), kn[1] + b.shin * 0.9, 2.0];
        if (s > 0) { P.kneeL = kn; P.ankL = an; P.pitchL = -0.3; } else { P.kneeR = kn; P.ankR = an; P.pitchR = -0.3; }
      }
      P.hL = { abs: [1.3, hipY - 1.2 + bob + lag * 0.4, 4.0], pole: [0.6, 0.6, -0.6] }; P.hR = { abs: [-1.3, hipY - 1.2 + bob + lag * 0.4, 4.0], pole: [-0.6, 0.6, -0.6] };
      P.headOff = [0, -0.4 * lag, 0.2]; P.hairLag = lag;
      break;
    }
    case "gather": {
      const crouch = leg * 0.42;
      P.hip = [0, hipY + crouch, -0.4]; P.lean += 0.6; P.headOff = [0, 0.3, 0.5];
      P.ankL = [hipJ + 0.9, FY - b.ankle, 0.8]; P.ankR = [-hipJ - 0.9, FY - b.ankle, -0.2];
      const rL = 0.5 - 0.5 * Math.cos(2 * Math.PI * u), rR = 0.5 - 0.5 * Math.cos(2 * Math.PI * (u + 0.5));
      const up = (s: number): V3 => [s * 1.2, hipY + crouch - 2.5, 2.6], dn = (s: number): V3 => [s * 1.7, FY - 1.6, 4.6];
      P.hL = { abs: lerp3(up(1), dn(1), rL), pole: [0.6, -0.3, -0.6] }; P.hR = { abs: lerp3(up(-1), dn(-1), rR), pole: [-0.6, -0.3, -0.6] };
      P.hairLag = rL * 0.6;
      break;
    }
  }
  l.posePatch?.(P, { anim, u, view, arm, sx, b, hipY, hipJ });
  if (!props) { delete P.weapon; delete P.shield; P.twoHand = false; }
  return P;
}

// ---------------- скелет ----------------
export interface Sk {
  b: Build; T: (p: V3) => V3; Tv: (v: V3) => V3;
  hip: V3; hipL: V3; hipR: V3; kneeL: V3; kneeR: V3; ankL: V3; ankR: V3; footL: [V3, V3]; footR: [V3, V3];
  waist: V3; chest: V3; shL: V3; shR: V3; elL: V3; elR: V3; hdL: V3; hdR: V3; neck: V3; head: V3;
  A: V3; U: V3; F: V3; Ap: V3; Up: V3; Fp: V3; cRise: number; hipJ: number;
}
export function solve(l: Look, P: Pose): Sk {
  const b = bodyOf(l), und = l.fac === "umb";
  const hipJ = Math.max(b.hipW * 0.5, b.thighT * 0.5 + 0.45);
  const frame = (tw: number, ln: number, rl: number) => {
    let A: V3 = [Math.cos(tw), 0, -Math.sin(tw)], U: V3 = [0, -1, 0], F: V3 = [Math.sin(tw), 0, Math.cos(tw)];
    U = rot(U, A, -ln); F = rot(F, A, -ln);
    A = rot(A, F, rl); U = rot(U, F, rl);
    return { A, U, F };
  };
  const tf = frame(P.twist, P.lean, P.roll), pf = frame(P.twist * 0.3, P.lean * 0.35, P.roll);
  const { A, U, F } = tf;
  const hip = P.hip;
  const waist = add(hip, mul(pf.U, b.pelvis));
  const chest = add(waist, mul(U, b.chest + P.chestRise));
  const sx = b.shW - b.armT * 0.3;
  const shL = add(add(chest, mul(A, sx)), mul(U, -b.armT * 0.4)), shR = add(add(chest, mul(A, -sx)), mul(U, -b.armT * 0.4));
  const hunch = und ? 0.45 : 0;
  const neck = add(add(chest, mul(U, 0.2)), mul(F, hunch));
  const head = add(add(add(chest, mul(U, b.neck + b.headH * 0.44)), mul(F, hunch * 1.4)), P.headOff);
  const hipL = add(hip, mul(pf.A, hipJ)), hipR = add(hip, mul(pf.A, -hipJ));
  const legIK = (hp: V3, an: V3, s: number, kn?: V3) => kn ? { j: kn, e: an } : ik3(hp, an, b.thigh, b.shin, add(mul(pf.F, 1), mul(pf.A, s * 0.12)));
  const lL = legIK(hipL, P.ankL, 1, P.kneeL), lR = legIK(hipR, P.ankR, -1, P.kneeR);
  const foot = (an: V3, pit: number): [V3, V3] => {
    const heel = add(an, [0, b.ankle * 0.55, -0.6]), toe = add(an, [0, b.ankle * 0.7, b.footL]);
    const r = (p: V3) => add(an, rot(sub(p, an), [1, 0, 0], pit));
    return [r(heel), r(toe)];
  };
  const arm = (s: number, h: Hand, base?: V3) => {
    const S = s > 0 ? shL : shR;
    const t = h.abs ?? (h.fromL && base ? add(base, h.fromL) : add(S, h.rel ?? [s, b.uArm + b.fArm, 0.4]));
    return ik3(S, t, b.uArm, b.fArm, h.pole ?? add(mul(A, s * 0.5), mul(F, -1)));
  };
  const aL = arm(1, P.hL);
  let aR = arm(-1, P.hR, aL.e);
  if (P.twoHand && P.weapon) aR = ik3(shR, sub(aL.e, mul(nrm(P.weapon.dir), 1.9)), b.uArm, b.fArm, P.hR.pole ?? [-0.6, 0.3, -0.7]);
  let T = (p: V3) => p, Tv = (v: V3) => v;
  if (P.G) {
    const g = P.G, piv: V3 = [0, FY, 0];
    T = (p: V3) => add(add(piv, rot(sub(p, piv), g.axis, g.ang)), g.shift);
    Tv = (v: V3) => rot(v, g.axis, g.ang);
  }
  if (l.mirrorX) { const T0 = T, Tv0 = Tv; T = (p: V3) => { const q = T0(p); return [-q[0], q[1], q[2]]; }; Tv = (v: V3) => { const q = Tv0(v); return [-q[0], q[1], q[2]]; }; }
  return {
    b, T, Tv, hip, hipL, hipR, kneeL: lL.j, kneeR: lR.j, ankL: lL.e, ankR: lR.e, footL: foot(lL.e, P.pitchL), footR: foot(lR.e, P.pitchR),
    waist, chest, shL, shR, elL: aL.j, elR: aR.j, hdL: aL.e, hdR: aR.e, neck, head, A, U, F, Ap: pf.A, Up: pf.U, Fp: pf.F, cRise: P.chestRise, hipJ,
  };
}

export const proj = (p: V3, v: View): V2 =>
  v === "down" ? [CX + p[0], p[1] + KZ * p[2]] : v === "up" ? [CX - p[0], p[1] - KZ * p[2]] : [CX + p[2], p[1] + KZ * 0.5 * p[0]];
const depthOf = (p: V3, v: View) => (v === "down" ? p[2] : v === "up" ? -p[2] : p[0]);
const CAM: Record<View, V3> = { down: [0, 0, 1], up: [0, 0, -1], side: [1, 0, 0] };

// ---------------- маски ----------------
export class Mz extends Mk {
  constructor(w = W, h = W, public ox = 0, public oy = 0) { super(w, h); }
  seg(a: V2, b: V2, t0: number, t1 = t0) { this.line((a[0] + this.ox) * Z, (a[1] + this.oy) * Z, (b[0] + this.ox) * Z, (b[1] + this.oy) * Z, t0 * Z, t1 * Z); return this; }
  dot(a: V2, r: number) { this.disc((a[0] + this.ox) * Z, (a[1] + this.oy) * Z, r * Z); return this; }
  pg(pts: V2[]) { this.poly(pts.map(([x, y]) => [(x + this.ox) * Z, (y + this.oy) * Z] as [number, number])); return this; }
  el(c: V2, rx: number, ry: number) { this.ell((c[0] + this.ox) * Z, (c[1] + this.oy) * Z, rx * Z, ry * Z); return this; }
  bz(p0: V2, p1: V2, p2: V2, t0: number, t1 = t0) { const f = (p: V2): [number, number] => [(p[0] + this.ox) * Z, (p[1] + this.oy) * Z]; this.bez(f(p0), f(p1), f(p2), t0 * Z, t1 * Z); return this; }
  /** оставить пиксели, где f(x, y) истинно (x, y — координаты 1× относительно (ox, oy)) */
  clip(f: (x: number, y: number) => boolean) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x] && !f((x + 0.5) / Z - this.ox, (y + 0.5) / Z - this.oy)) this.d[y * this.w + x] = 0; return this; }
  hull(pts: V2[]) { return this.pg(convexHull(pts)); }
}
function convexHull(p: V2[]): V2[] {
  const s = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: V2[] = [], up: V2[] = [];
  for (const q of s) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of s.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** kant — светлый кант 1 px по кромкам к свету (сверху и со стороны света) */
export type PO = { amp?: number; dome?: number; bias?: number; dith?: number; kant?: boolean };
/** slot — слой листа: body (основа), hair (причёска, прячется шлемом) или слот снаряжения */
export interface Part { g: string; ramp: C[]; o?: PO; layer: number; m?: (z: Mz) => void; loc?: (z: Mz) => void; emis?: boolean; /** цвет свечения ночью (иначе — цвет пикселя) */ emisColor?: C; slot?: string }
/** Всё, что нужно слою снаряжения, чтобы привязаться к скелету кадра (см. tools/gen/gear147) */
export interface GearCtx {
  l: Look; v: View; anim: AnimId; i: number; u: number; P: Pose; sk: Sk; b: Build; M: Mats;
  PJ: (p: V3) => V2; D: (p: V3) => number; facing: (n: V3) => number;
  parts: Part[]; push: (p: Part) => void;
  loft: (z: Mz, o: V3, AA: V3, UU: V3, FF: V3, ss: { h: number; a: number; d: number; f: number }[]) => void;
  secs: { h: number; a: number; d: number; f: number }[]; surf: (a: number, h: number, side?: number) => V3; c: number; dW: number;
  hv: "front" | "back" | "side"; hw: number; hh: number;
  /** слои частей основы: рука/нога s (L/R) → базовый слой и смещение тона для дальней стороны */
  arm: Record<"L" | "R", { L0: number; far: number }>; leg: Record<"L" | "R", { L0: number; sub0: number; far: number }>; wpL0: number;
}
export interface Frame { img: Cv; emis: [number, number, C][]; sk: Sk; pose: Pose }

// ---------------- голова: локальная система ----------------
const LW = 48, LCX = 24, LCY = 20;
type HView = "front" | "back" | "side";
interface HairCtx { hw: number; hh: number; lag: number; v: HView; fem: boolean }
/** Причёска: части в локальной системе головы (центр (0,0), y вниз). Слои: hairB — за телом (сзади — поверх спины), hair — шапка, hairF — пряди спереди. */
function hairParts(style: string, c: HairCtx, H: C[]): { g: "hairB" | "hair" | "hairF"; loc: (z: Mz) => void; o?: PO }[] {
  const { hw, hh, lag, v } = c, out: { g: "hairB" | "hair" | "hairF"; loc: (z: Mz) => void; o?: PO }[] = [];
  const add = (g: "hairB" | "hair" | "hairF", loc: (z: Mz) => void, o?: PO) => out.push({ g, loc, o });
  /** шапка с линией роста: fringe(x) — линия чёлки, side — до куда опускаются виски */
  const capFront = (fringe: (x: number) => number, side: number, extra?: (z: Mz) => void) => add("hair", (z) => {
    z.el([0, -hh * 0.1], hw + 0.4, hh * 0.93); extra?.(z);
    z.clip((x, y) => { const t = cl((Math.abs(x) / hw - 0.42) / 0.42); return y < fringe(x) + (side - fringe(x)) * t; });
  }, { dome: 3, amp: 1.6, bias: 0.25 });
  const capBack = (nape: number, extra?: (z: Mz) => void) => add("hair", (z) => { z.el([0, -hh * 0.04], hw + 0.3, hh + 0.1); extra?.(z); z.clip((x, y) => y < nape - Math.abs(x) * 0.12); }, { dome: 3, amp: 1.6, bias: 0.2 });
  const capSide = (fore: number, nape: number, extra?: (z: Mz) => void) => add("hair", (z) => {
    z.el([-0.45, -hh * 0.16], hw + 0.35, hh * 0.9); extra?.(z);
    z.clip((x, y) => (y < hh * fore - Math.max(0, x - hw * 0.1) * 0.5) || (x < -hw * 0.05 && y < nape));
  }, { dome: 3, amp: 1.6, bias: 0.25 });
  const sheen = () => { if (v !== "side") add("hair", (z) => z.seg([-hw * 0.7, -hh * 0.42], [-hw * 0.12, -hh * 0.8], 0.9).clip((x, y) => y > -hh * 1.0), { dome: 1, bias: 1.6 }); else add("hair", (z) => z.seg([-hw * 0.4, -hh * 0.85], [hw * 0.3, -hh * 0.82], 0.9), { dome: 1, bias: 1.6 }); };
  const strands = (pts: [V2, V2][]) => add("hair", (z) => { for (const [a, b] of pts) z.seg(a, b, 0.85); }, { dome: 1, bias: -1.4 });
  const jag = (x: number) => (Math.floor((x + 9) * 0.95) % 2) * 0.6;
  const lowLag = (y: number) => [lag * 0.4, y + lag * 0.3] as V2;
  const braidChain = (g: "hairB" | "hairF", a: V2, b2: V2, w: number) => {
    add(g, (z) => z.seg(a, b2, w, w * 0.8), { dome: 2, bias: 0.1 });
    add(g, (z) => { const n = 4; for (let i = 1; i < n; i++) { const t = i / n; z.seg([a[0] + (b2[0] - a[0]) * t - w * 0.45, a[1] + (b2[1] - a[1]) * t], [a[0] + (b2[0] - a[0]) * t + w * 0.45, a[1] + (b2[1] - a[1]) * t + 0.5], 0.8); } }, { dome: 1, bias: -1.3 });
  };
  switch (style) {
    case "tousled":
      if (v === "front") { capFront((x) => -hh * 0.3 + jag(x), hh * 0.08, (z) => z.pg([[-hw * 0.35, -hh * 0.88], [-hw * 0.1, -hh * 1.18], [hw * 0.15, -hh * 0.9]])); strands([[[-hw * 0.2, -hh * 0.75], [-hw * 0.35, -hh * 0.35]], [[hw * 0.35, -hh * 0.7], [hw * 0.25, -hh * 0.3]]]); }
      else if (v === "back") { capBack(hh * 0.92, (z) => z.pg([[-hw * 0.3, -hh * 0.9], [hw * 0.05, -hh * 1.22], [hw * 0.15, -hh * 0.9]])); strands([[[-hw * 0.7, -hh * 0.55], [-hw * 0.1, hh * 0.6]]]); }
      else { capSide(-0.3, hh * 0.45, (z) => z.pg([[-hw * 0.2, -hh * 0.95], [hw * 0.5, -hh * 1.15], [hw * 0.4, -hh * 0.7]])); strands([[[-hw * 0.6, -hh * 0.5], [-hw * 0.5, hh * 0.2]]]); }
      sheen(); break;
    case "crew":
      if (v === "front") capFront(() => -hh * 0.5, -hh * 0.05);
      else if (v === "back") capBack(hh * 0.8);
      else capSide(-0.45, hh * 0.3);
      sheen(); break;
    case "tail":
      if (v === "front") { capFront((x) => -hh * 0.55 + Math.abs(x) * 0.12, hh * 0.12); strands([[[0, -hh * 0.55], [0, -hh * 0.95]], [[-hw * 0.5, -hh * 0.4], [-hw * 0.4, -hh * 0.85]], [[hw * 0.5, -hh * 0.4], [hw * 0.4, -hh * 0.85]]]); }
      else if (v === "back") { capBack(hh * 0.62); add("hairB", (z) => z.seg([0, hh * 0.35], lowLag(hh + 3.2), 2.0, 1.2), { dome: 2 }); add("hair", (z) => z.dot([0, hh * 0.38], 0.9), { dome: 1, bias: -1 }); strands([[[0, -hh * 0.9], [0, hh * 0.3]]]); }
      else { capSide(-0.5, hh * 0.4); add("hairB", (z) => z.bz([-hw * 0.85, hh * 0.1], [-hw * 1.3, hh * 0.6], [-hw * 1.05 + lag * 0.4, hh + 2.6], 1.9, 1.1), { dome: 2 }); strands([[[hw * 0.3, -hh * 0.75], [-hw * 0.6, -hh * 0.3]]]); }
      sheen(); break;
    case "mane":
      if (v === "front") { capFront((x) => -hh * 0.3 + (x < 0 ? 0.3 : -0.2), hh * 0.85); add("hairF", (z) => { z.seg([-hw * 0.88, 0], [-hw * 0.95 + lag * 0.3, hh + 1.6], hw * 0.42, hw * 0.3); z.seg([hw * 0.88, 0], [hw * 0.95 + lag * 0.3, hh + 1.6], hw * 0.42, hw * 0.3); }, { dome: 2 }); add("hairB", (z) => z.pg([[-hw - 0.3, -hh * 0.2], [hw + 0.3, -hh * 0.2], [hw * 0.9, hh + 2], [-hw * 0.9, hh + 2]]), { dome: 3, bias: -0.8 }); strands([[[-hw * 0.1, -hh * 0.75], [-hw * 0.6, -hh * 0.2]]]); }
      else if (v === "back") { capBack(hh); add("hairB", (z) => z.pg([[-hw - 0.2, 0], [hw + 0.2, 0], [hw * 0.9 + lag * 0.3, hh + 2.6], [-hw * 0.9 + lag * 0.3, hh + 2.6]]), { dome: 3 }); strands([[[-hw * 0.4, -hh * 0.5], [-hw * 0.45, hh + 2]], [[hw * 0.35, -hh * 0.5], [hw * 0.4, hh + 2]], [[0, -hh * 0.2], [0, hh + 2.2]]]); }
      else { capSide(-0.3, hh * 0.9); add("hairB", (z) => z.seg([-hw * 0.55, 0], [-hw * 0.7 + lag * 0.3, hh + 2.2], hw * 0.95, hw * 0.75), { dome: 2 }); strands([[[-hw * 0.2, -hh * 0.6], [-hw * 0.6, hh * 0.8]]]); }
      sheen(); break;
    case "beard":
      if (v === "front") capFront(() => -hh * 0.62, -hh * 0.2);
      else if (v === "back") capBack(hh * 0.55);
      else capSide(-0.6, hh * 0.25);
      break;
    case "topknot":
      if (v === "front") { capFront(() => -hh * 0.45, -hh * 0.3); add("hair", (z) => z.el([0, -hh - 0.9], 1.7, 1.5).seg([0, -hh - 0.2], [0, -hh * 0.7], 1.4), { dome: 2, bias: 0.3 }); add("hair", (z) => z.seg([-1.1, -hh - 0.2], [1.1, -hh - 0.2], 0.9), { dome: 1, bias: -1.5 }); }
      else if (v === "back") { capBack(hh * 0.45); add("hair", (z) => z.el([0, -hh - 0.6], 1.7, 1.5), { dome: 2, bias: 0.3 }); }
      else { capSide(-0.55, hh * 0.25); add("hair", (z) => z.el([-hw * 0.3, -hh - 0.6], 1.6, 1.5), { dome: 2, bias: 0.3 }); }
      sheen(); break;
    case "loose":
      if (v === "front") {
        capFront((x) => -hh * 0.28 - (x + hw * 0.3) * 0.18, hh * 0.9);
        add("hairB", (z) => z.pg([[-hw - 0.4, -hh * 0.2], [hw + 0.4, -hh * 0.2], [hw * 1.0 + lag * 0.3, hh + 4.2], [hw * 0.4, hh + 4.8], [-hw * 0.4, hh + 4.8], [-hw * 1.0 + lag * 0.3, hh + 4.2]]), { dome: 3, bias: -0.7 });
        add("hairF", (z) => { z.seg([-hw * 0.9, -hh * 0.1], [-hw * 0.98 + lag * 0.3, hh + 2.4], hw * 0.42, hw * 0.28); z.seg([hw * 0.9, -hh * 0.1], [hw * 0.98 + lag * 0.3, hh + 2.4], hw * 0.42, hw * 0.28); }, { dome: 2 });
        strands([[[-hw * 0.9, hh * 0.2], [-hw * 0.95, hh + 1.6]], [[hw * 0.9, hh * 0.2], [hw * 0.95, hh + 1.6]]]);
      } else if (v === "back") {
        capBack(hh); add("hairB", (z) => z.pg([[-hw - 0.3, 0], [hw + 0.3, 0], [hw * 0.95 + lag * 0.3, hh + 4.4], [0, hh + 5.2], [-hw * 0.95 + lag * 0.3, hh + 4.4]]), { dome: 3 });
        strands([[[-hw * 0.5, -hh * 0.4], [-hw * 0.5, hh + 3.6]], [[hw * 0.45, -hh * 0.4], [hw * 0.5, hh + 3.6]], [[0, 0], [0, hh + 4.2]]]);
      } else { capSide(-0.25, hh * 0.9); add("hairB", (z) => z.seg([-hw * 0.5, 0], [-hw * 0.75 + lag * 0.3, hh + 3.8], hw * 1.05, hw * 0.7), { dome: 2 }); strands([[[-hw * 0.3, -hh * 0.5], [-hw * 0.7, hh + 2.6]]]); }
      sheen(); break;
    case "pony":
      if (v === "front") { capFront((x) => -hh * 0.32 - (x + hw * 0.2) * 0.12, hh * 0.25); add("hairB", (z) => z.bz([0, -hh * 0.6], [hw * 0.2, hh * 0.6], [lag * 0.5, hh + 3.5], 2.3, 1.2), { dome: 2, bias: -0.6 }); }
      else if (v === "back") { capBack(hh * 0.62); add("hairB", (z) => z.bz([0, -hh * 0.55], [lag * 0.4, hh * 0.5], [lag * 0.7, hh + 3.8], 2.6, 1.3), { dome: 2, bias: 0.2 }); add("hair", (z) => z.seg([-1.1, -hh * 0.55], [1.1, -hh * 0.55], 1.0), { dome: 1, bias: -1.5 }); strands([[[0, -hh * 0.3], [lag * 0.5, hh + 2.6]]]); }
      else { capSide(-0.3, hh * 0.35); add("hairB", (z) => z.bz([-hw * 0.6, -hh * 0.55], [-hw * 1.6, -hh * 0.2], [-hw * 1.3 + lag * 0.5, hh + 2.8], 2.4, 1.2), { dome: 2 }); }
      sheen(); break;
    case "braid":
      if (v === "front") { capFront((x) => -hh * 0.25 - (x + hw * 0.4) * 0.14, hh * 0.5); braidChain("hairF", [hw * 0.75, hh * 0.45], [hw * 0.95 + lag * 0.3, hh + 5.0], 2.0); }
      else if (v === "back") { capBack(hh * 0.75); braidChain("hairB", [hw * 0.2, hh * 0.5], [hw * 0.75 + lag * 0.3, hh + 2.6], 2.0); }
      else { capSide(-0.25, hh * 0.6); braidChain("hairF", [hw * 0.0, hh * 0.45], [hw * 0.35 + lag * 0.3, hh + 4.6], 2.0); }
      sheen(); break;
    case "bob":
      if (v === "front") capFront(() => -hh * 0.18, hh * 0.78, (z) => z.el([0, hh * 0.1], hw + 0.8, hh * 0.72));
      else if (v === "back") capBack(hh * 0.85, (z) => z.el([0, hh * 0.15], hw + 0.8, hh * 0.72));
      else capSide(-0.15, hh * 0.8, (z) => z.el([-hw * 0.3, hh * 0.1], hw * 0.8, hh * 0.75));
      if (v !== "side") strands([[[-hw * 0.55, -hh * 0.2], [-hw * 0.7, hh * 0.65]], [[hw * 0.55, -hh * 0.2], [hw * 0.7, hh * 0.65]]]);
      sheen(); break;
    case "bun":
      if (v === "front") { capFront((x) => -hh * 0.38 + Math.abs(x) * 0.1, hh * 0.22); add("hairB", (z) => z.el([0, -hh - 0.3], 2.0, 1.6), { dome: 2, bias: -0.4 }); }
      else if (v === "back") { capBack(hh * 0.6); add("hair", (z) => z.el([0, -hh * 0.35], 2.4, 2.1), { dome: 2, bias: 0.3 }); add("hair", (z) => z.seg([-1.5, -hh * 0.35], [1.5, -hh * 0.3], 0.8), { dome: 1, bias: -1.5 }); }
      else { capSide(-0.35, hh * 0.35); add("hair", (z) => z.el([-hw * 1.0, -hh * 0.35], 2.0, 2.0), { dome: 2, bias: 0.3 }); }
      sheen(); break;
    case "twin":
      if (v === "front") { capFront((x) => -hh * 0.25 + jag(x) * 0.5, hh * 0.35); braidChain("hairF", [-hw * 0.85, hh * 0.35], [-hw * 1.0 + lag * 0.3, hh + 4.4], 1.8); braidChain("hairF", [hw * 0.85, hh * 0.35], [hw * 1.0 + lag * 0.3, hh + 4.4], 1.8); }
      else if (v === "back") { capBack(hh * 0.6, (z) => z.seg([0, -hh], [0, hh * 0.6], 0.1)); add("hair", (z) => z.seg([0, -hh * 0.95], [0, hh * 0.5], 0.8), { dome: 1, bias: -1.5 }); braidChain("hairB", [-hw * 0.6, hh * 0.45], [-hw * 0.85 + lag * 0.3, hh + 3.8], 1.8); braidChain("hairB", [hw * 0.6, hh * 0.45], [hw * 0.85 + lag * 0.3, hh + 3.8], 1.8); }
      else { capSide(-0.25, hh * 0.5); braidChain("hairF", [-hw * 0.1, hh * 0.4], [hw * 0.2 + lag * 0.3, hh + 4.2], 1.8); }
      sheen(); break;
  }
  return out;
}

// ---------------- рендер ----------------
function buildParts(l: Look, v: View, anim: AnimId, i: number) {
  const P = pose(l, anim, i, v), sk = solve(l, P), b = sk.b, M = mats(l);
  const T = sk.T, PJ = (p: V3) => proj(T(p), v), D = (p: V3) => depthOf(T(p), v);
  const und = l.fac === "umb", fem = l.sex === "f";
  const cam = CAM[v], facing = (n: V3) => dot(sk.Tv(n), cam);
  const parts: Part[] = [];
  const push = (p: Part) => parts.push(p);
  const { A, U, F, waist, chest } = sk;

  // ---- торс: лофт из сечений ----
  const c = b.chest + sk.cRise;
  const dW = b.waist * 0.62, dC = b.shW * 0.52, dS = b.shW * 0.46;
  const secs = [
    { h: -1.3 - (und ? 0.3 : 0), a: b.waist + 0.35, d: dW + 0.2, f: 0 },
    { h: 0, a: b.waist, d: dW, f: 0 },
    { h: c * 0.45, a: b.shW - 0.5, d: dC, f: fem ? 0.35 : 0 },
    { h: c * 0.82, a: b.shW, d: dS, f: 0 },
    { h: c, a: b.shW - 1.15, d: dS * 0.85, f: 0 },
    { h: c + 0.5, a: b.neckT * 0.75, d: b.neckT * 0.6, f: 0.1 },
  ];
  const ring = (o: V3, AA: V3, UU: V3, FF: V3, s: { h: number; a: number; d: number; f: number }): V2[] => {
    const pts: V2[] = [];
    for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2; pts.push(PJ(add(add(add(o, mul(AA, s.a * Math.cos(t))), mul(FF, s.f + s.d * Math.sin(t))), mul(UU, s.h)))); }
    return pts;
  };
  const loft = (z: Mz, o: V3, AA: V3, UU: V3, FF: V3, ss: typeof secs) => { for (let k = 0; k + 1 < ss.length; k++) z.hull([...ring(o, AA, UU, FF, ss[k]), ...ring(o, AA, UU, FF, ss[k + 1])]); };
  const secAt = (h: number) => { for (let k = 0; k + 1 < secs.length; k++) if (h <= secs[k + 1].h) { const t = (h - secs[k].h) / (secs[k + 1].h - secs[k].h); return { a: secs[k].a + (secs[k + 1].a - secs[k].a) * t, d: secs[k].d + (secs[k + 1].d - secs[k].d) * t, f: secs[k].f + (secs[k + 1].f - secs[k].f) * t }; } return secs[secs.length - 1]; };
  const surf = (a: number, h: number, side = 1): V3 => { const s = secAt(h); const q = cl(Math.abs(a) / s.a, 0, 1); return add(add(add(waist, mul(A, a)), mul(U, h)), mul(F, s.f + side * s.d * Math.sqrt(1 - q * q) + side * 0.15)); };
  push({ g: "torso", ramp: M.shirt, o: { dome: 3, amp: 1.6 }, layer: 3.5, m: (z) => loft(z, waist, A, U, F, secs) });
  // таз
  const hp = sk.hip, Ap = sk.Ap, Up = sk.Up, Fp = sk.Fp;
  push({ g: "pelvis", ramp: M.pants, o: { dome: 3 }, layer: 3.0, m: (z) => loft(z, hp, Ap, Up, Fp, [{ h: -1.3, a: sk.hipJ * 0.7, d: dW * 0.75, f: 0 }, { h: 0, a: b.hipW, d: dW * 1.05, f: 0 }, { h: b.pelvis, a: b.waist, d: dW, f: 0 }]) });
  // жилет (женщина)
  if (M.vest) {
    const vs = [{ h: -0.4, a: b.waist + 0.3, d: dW + 0.25, f: 0 }, { h: c * 0.3, a: b.waist + 0.5, d: dW + 0.4, f: 0.2 }, { h: c * 0.52, a: b.shW - 0.6, d: dC + 0.15, f: 0.4 }];
    push({ g: "vest", ramp: M.vest, o: { dome: 2, amp: 1.5 }, layer: 3.55, m: (z) => loft(z, waist, A, U, F, vs) });
    if (facing(F) > 0.35) push({ g: "vest", ramp: M.shirt, o: { dome: 1, bias: 0.8 }, layer: 3.56, m: (z) => z.seg(PJ(surf(0, -0.2)), PJ(surf(0, c * 0.5)), 0.8) });
  }
  // детали спереди / сзади
  if (facing(F) > 0.35) {
    push({ g: "torso", ramp: M.skin, o: { dome: 1, bias: -0.3 }, layer: 3.6, m: (z) => z.pg([PJ(surf(-b.neckT * 0.55, c + 0.25)), PJ(surf(b.neckT * 0.55, c + 0.25)), PJ(surf(0, c * (fem ? 0.72 : 0.64)))]) });
    push({ g: "torso", ramp: M.shirt, o: { dome: 1, bias: 1.0 }, layer: 3.61, m: (z) => z.seg(PJ(surf(-b.neckT * 0.8, c + 0.2)), PJ(surf(0, c * 0.62)), 0.9).seg(PJ(surf(b.neckT * 0.8, c + 0.2)), PJ(surf(0, c * 0.62)), 0.9) });
    if (!M.vest) push({ g: "torso", ramp: M.shirt, o: { dome: 1, bias: -1.2 }, layer: 3.62, m: (z) => z.seg(PJ(surf(-b.shW * 0.6, c * 0.72)), PJ(surf(-b.waist * 0.3, c * 0.12)), 0.9).seg(PJ(surf(b.shW * 0.62, c * 0.6)), PJ(surf(b.waist * 0.45, c * 0.1)), 0.9) });
    if (und && !fem) push({ g: "torso", ramp: M.shirt, o: { dome: 1, bias: 1.1 }, layer: 3.63, m: (z) => z.pg([PJ(surf(b.shW * 0.15, c * 0.55)), PJ(surf(b.shW * 0.6, c * 0.6)), PJ(surf(b.shW * 0.55, c * 0.3)), PJ(surf(b.shW * 0.15, c * 0.25))]) });
  } else if (facing(F) < -0.35) {
    push({ g: "torso", ramp: M.shirt, o: { dome: 1, bias: -1.1 }, layer: 3.6, m: (z) => z.seg(PJ(surf(0, c - 0.6, -1)), PJ(surf(0, 0.4, -1)), 0.8) });
    push({ g: "torso", ramp: M.shirt, o: { dome: 1, bias: -1.0 }, layer: 3.61, m: (z) => z.seg(PJ(surf(-b.shW * 0.55, c * 0.72, -1)), PJ(surf(-b.shW * 0.25, c * 0.42, -1)), 0.9).seg(PJ(surf(b.shW * 0.55, c * 0.72, -1)), PJ(surf(b.shW * 0.25, c * 0.42, -1)), 0.9) });
    push({ g: "torso", ramp: M.shirt, o: { dome: 1, bias: 1.0 }, layer: 3.62, m: (z) => z.seg(PJ(surf(-b.neckT * 0.65, c + 0.25, -1)), PJ(surf(b.neckT * 0.65, c + 0.25, -1)), 0.9) });
  }
  // пояс, пряжка, сумка
  push({ g: "belt", ramp: M.belt, o: { dome: 1 }, layer: 3.7, m: (z) => loft(z, waist, A, U, F, [{ h: -0.55, a: b.waist + 0.3, d: dW + 0.28, f: 0 }, { h: 0.3, a: b.waist + 0.25, d: dW + 0.22, f: 0 }]) });
  if (facing(F) > 0.3) push({ g: "belt", ramp: M.buckle, o: { dome: 1, bias: 0.3 }, layer: 3.72, m: (z) => z.dot(PJ(surf(0, -0.15)), 0.95) });
  const pouchC = add(add(add(waist, mul(A, b.waist + 0.5)), mul(U, -1.3)), mul(F, 0.7));
  if (facing(A) > -0.3) push({ g: "belt", ramp: M.pouch, o: { dome: 2 }, layer: 3.74, m: (z) => z.seg(PJ(add(pouchC, mul(U, 0.6))), PJ(add(pouchC, mul(U, -0.7))), 1.9, 2.1) });
  // шея
  push({ g: "neck", ramp: M.skin, o: { dome: 2, bias: -0.5 }, layer: 3.8, m: (z) => z.seg(PJ(sk.neck), PJ(add(sk.head, mul(U, -b.headH * 0.32))), b.neckT, b.neckT * 0.9) });

  const LEG = {} as GearCtx["leg"], ARM = {} as GearCtx["arm"]; let WPL0 = 5.2;
  // ---- ноги ----
  for (const s of ["L", "R"] as const) {
    const H0 = s === "L" ? sk.hipL : sk.hipR, K = s === "L" ? sk.kneeL : sk.kneeR, An = s === "L" ? sk.ankL : sk.ankR, Ft = s === "L" ? sk.footL : sk.footR;
    const dTh = D(lerp3(H0, K, 0.5)), dLeg = D(lerp3(K, An, 0.5));
    const far = v === "side" && D(An) < 0 ? -0.9 : 0;
    const L0 = dTh > 2.0 ? 3.9 : 2, g = "leg" + s, sub0 = (dLeg + 10) * 0.001;
    LEG[s] = { L0, sub0, far };
    const bootTop = lerp3(K, An, 0.38);
    push({ g, ramp: M.pants, o: { dome: 2, bias: far }, layer: L0 + sub0, m: (z) => z.seg(PJ(H0), PJ(K), b.thighT, b.thighT * 0.86).seg(PJ(K), PJ(lerp3(K, An, 0.45)), b.shinT * 1.04) });
    push({ g, ramp: M.pants, o: { dome: 1, bias: far + 0.9 }, layer: L0 + sub0 + 0.0001, m: (z) => z.dot(PJ(add(K, mul(nrm(sub(K, H0)), -0.3))), b.thighT * 0.32) });
    push({ g, ramp: M.boots, o: { dome: 2, bias: far }, layer: L0 + sub0 + 0.0002, m: (z) => z.seg(PJ(bootTop), PJ(An), b.shinT * 1.08, b.shinT * 0.98) });
    push({ g, ramp: M.boots, o: { dome: 1, bias: far + 1.2 }, layer: L0 + sub0 + 0.0003, m: (z) => z.seg(PJ(bootTop), PJ(lerp3(bootTop, An, 0.14)), b.shinT * 1.22) });
    push({ g, ramp: M.boots, o: { dome: 2, bias: far - 0.15 }, layer: L0 + sub0 + 0.0004, m: (z) => z.seg(PJ(Ft[0]), PJ(Ft[1]), b.shinT * 1.1, b.shinT * 0.95) });
  }

  // ---- руки ----
  const wp = P.weapon;
  for (const s of ["L", "R"] as const) {
    const S = s === "L" ? sk.shL : sk.shR, E = s === "L" ? sk.elL : sk.elR, Hd = s === "L" ? sk.hdL : sk.hdR;
    const dA = D(lerp3(S, Hd, 0.5));
    const back = dA < -1.2;
    const far = v === "side" && dA < 0 ? -1 : 0;
    const L0 = back ? 1 : 5, g = "arm" + s;
    ARM[s] = { L0, far };
    push({ g, ramp: M.shirt, o: { dome: 2, bias: far + 0.2 }, layer: L0, m: (z) => z.dot(PJ(S), b.armT * 0.62).seg(PJ(S), PJ(E), b.armT, b.armT * 0.88) });
    push({ g, ramp: und && M.wrap ? M.wrap : M.skin, o: { dome: 2, bias: far }, layer: L0 + 0.01, m: (z) => z.seg(PJ(E), PJ(Hd), b.foreT, b.foreT * 0.82) });
    if (und && M.wrap) push({ g, ramp: M.wrap, o: { dome: 1, bias: far - 1.3 }, layer: L0 + 0.011, m: (z) => { for (const t of [0.35, 0.7]) { const p = lerp3(E, Hd, t), q = add(p, mul(nrm(sub(Hd, E)), 0.6)); z.seg(PJ(add(p, mul(A, -0.9))), PJ(add(q, mul(A, 0.9))), 0.7); } } });
    push({ g, ramp: M.shirt, o: { dome: 1, bias: far + 0.7 }, layer: L0 + 0.02, m: (z) => z.dot(PJ(lerp3(E, Hd, 0.06)), b.armT * 0.52) });
    const dir = nrm(sub(Hd, E));
    push({ g, ramp: M.skin, o: { dome: 2, bias: far + 0.3 }, layer: L0 + 0.3, m: (z) => z.seg(PJ(add(Hd, mul(dir, -0.1))), PJ(add(Hd, mul(dir, b.handR * 0.9))), b.handR * 1.9, b.handR * 1.6) });
  }

  // ---- оружие и щит ----
  if (wp) {
    const Hd = sk.hdL, d = nrm(wp.dir);
    const dW0 = D(add(Hd, mul(d, 4)));
    const L0 = dW0 < -1.2 ? 1.2 : 5.2; WPL0 = L0;
    const gv = mul(nrm(cross(d, sk.U)), 1);
    if (wp.kind === "sword" || wp.kind === "great") {
      const big = wp.kind === "great", bl = big ? 15 : 10.5, gl = big ? 2.6 : 1.9, gr = big ? 3.4 : 1.6;
      const g0 = add(Hd, mul(d, 0.9));
      push({ g: "weapon", ramp: M.grip, o: { dome: 1 }, layer: L0, m: (z) => z.seg(PJ(add(Hd, mul(d, 0.6))), PJ(add(Hd, mul(d, -gr))), big ? 1.2 : 1.0) });
      push({ g: "weapon", ramp: M.trim, o: { dome: 1, bias: 0.3 }, layer: L0 + 0.01, m: (z) => z.dot(PJ(add(Hd, mul(d, -gr - 0.4))), big ? 1.0 : 0.8) });
      push({ g: "weapon", ramp: M.steel, o: { dome: 1, amp: 1.8, bias: 0.5 }, layer: L0 + 0.02, m: (z) => z.seg(PJ(g0), PJ(add(g0, mul(d, bl))), big ? 2.3 : 1.7, big ? 1.2 : 0.9) });
      push({ g: "weapon", ramp: M.steel, o: { dome: 1, bias: 2 }, layer: L0 + 0.03, m: (z) => z.seg(PJ(add(g0, mul(d, 1.2))), PJ(add(g0, mul(d, bl * 0.75))), 0.7) });
      push({ g: "weapon", ramp: M.trim, o: { dome: 1, bias: 0.2 }, layer: L0 + 0.04, m: (z) => z.seg(PJ(add(g0, mul(gv, gl))), PJ(add(g0, mul(gv, -gl))), 1.1) });
    } else if (wp.kind === "staff") {
      const top = add(Hd, mul(d, 7.5)), bot = add(Hd, mul(d, -9));
      push({ g: "weapon", ramp: M.wood, o: { dome: 1, bias: 0.2 }, layer: L0, m: (z) => z.seg(PJ(bot), PJ(top), 1.3, 1.1) });
      push({ g: "weapon", ramp: M.trim, o: { dome: 1 }, layer: L0 + 0.01, m: (z) => z.bz(PJ(add(top, mul(gv, -1.4))), PJ(add(top, mul(d, 2.6))), PJ(add(top, mul(gv, 1.4))), 0.9) });
      push({ g: "weapon", ramp: M.orb, o: { dome: 2, bias: 0.4 + (wp.glow ?? 0) }, layer: L0 + 0.02, emis: (wp.glow ?? 0) > 0.5, m: (z) => z.dot(PJ(add(top, mul(d, 1.2))), 1.2 + 0.4 * (wp.glow ?? 0)) });
    } else if (wp.kind === "bow") {
      const bu = nrm(wp.up ?? [0, -1, 0]), fw: V3 = [0, 0, 1], bend = nrm([0.6, 0, -1]);
      const tipU = add(add(Hd, mul(bu, 7.2)), mul(bend, 2.2)), tipD = add(add(Hd, mul(bu, -7.2)), mul(bend, 2.2));
      push({ g: "weapon", ramp: M.wood, o: { dome: 1, bias: 0.3 }, layer: L0, m: (z) => z.bz(PJ(Hd), PJ(add(add(Hd, mul(bu, 4.2)), mul(bend, -0.9))), PJ(tipU), 1.5, 0.8).bz(PJ(Hd), PJ(add(add(Hd, mul(bu, -4.2)), mul(bend, -0.9))), PJ(tipD), 1.5, 0.8) });
      const sp = (wp.draw ?? 0) > 0.05 ? sk.hdR : lerp3(tipU, tipD, 0.5);
      push({ g: "weapon", ramp: M.string, o: { dome: 1 }, layer: L0 - 0.01, m: (z) => z.seg(PJ(tipU), PJ(sp), 0.75).seg(PJ(sp), PJ(tipD), 0.75) });
      if ((wp.draw ?? 0) > 0.05) {
        const tip = add(Hd, mul(fw, 3.0));
        push({ g: "weapon", ramp: M.wood, o: { dome: 1, bias: 0.8 }, layer: L0 + 0.01, m: (z) => z.seg(PJ(sp), PJ(tip), 0.8) });
        push({ g: "weapon", ramp: M.steel, o: { dome: 1, bias: 0.6 }, layer: L0 + 0.02, m: (z) => z.seg(PJ(tip), PJ(add(tip, mul(fw, 1.3))), 1.2, 0.6) });
      }
    }
  }
  if (P.shield) {
    const n = nrm(P.shield.n), cen = add(lerp3(sk.elR, sk.hdR, 0.55), mul(n, 1.1)), r = 4.3;
    const e1 = nrm(cross(n, Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(n, e1);
    const circ = (rr: number, off = 0): V2[] => { const o: V2[] = []; for (let k = 0; k < 24; k++) { const t = (k / 24) * Math.PI * 2; o.push(PJ(add(add(cen, mul(n, off)), add(mul(e1, rr * Math.cos(t)), mul(e2, rr * Math.sin(t)))))); } return o; };
    const front = facing(n) > 0;
    const L0 = D(cen) < -1.2 ? 0.8 : 5.4;
    push({ g: "shield", ramp: M.steel, o: { dome: 2, bias: front ? 0 : -0.6 }, layer: L0, m: (z) => z.hull([...circ(r), ...circ(r, -0.7)]) });
    push({ g: "shield", ramp: M.wood, o: { dome: 3, bias: front ? 0 : -1 }, layer: L0 + 0.01, m: (z) => z.hull(circ(r - 0.95, front ? 0.05 : -0.75)) });
    if (front) {
      push({ g: "shield", ramp: M.steel, o: { dome: 1, bias: -0.8 }, layer: L0 + 0.02, m: (z) => z.seg(PJ(add(cen, mul(e1, -(r - 1.2)))), PJ(add(cen, mul(e1, r - 1.2))), 0.8) });
      push({ g: "shield", ramp: M.trim, o: { dome: 2, bias: 0.3 }, layer: L0 + 0.03, m: (z) => z.hull(circ(1.15, 0.3)) });
    }
  }

  // ---- голова (локально) ----
  const hc = PJ(sk.head), hu = PJ(add(sk.head, mul(U, 1)));
  const theta = Math.atan2(hu[0] - hc[0], -(hu[1] - hc[1]));
  const hv: HView = v === "down" ? "front" : v === "up" ? "back" : "side";
  const hw = b.headW / 2, hh = b.headH / 2;
  const headLoc = (z: Mz) => {
    if (hv === "side") { z.el([-0.2, -0.1], hw * 0.98, hh); z.el([hw * 0.22, hh * 0.32], hw * 0.72, hh * 0.62); if (und) z.clip((x, y) => !(x > hw * 0.55 && y > hh * 0.18 && y < hh * 0.42)); }
    else if (hv === "back") { z.el([0, -hh * 0.04], hw, hh * 0.96); z.el([0, hh * 0.35], hw * 0.55, hh * 0.6); }
    else { z.el([0, -hh * 0.06], hw, hh * 0.94); z.el([0, hh * 0.3], hw * (und ? 0.76 : 0.8), hh * 0.68); }
  };
  push({ g: "head", ramp: M.skin, o: { dome: 4, amp: 1.1, bias: 0.55 }, layer: 6, loc: headLoc });
  const style = l.hair ?? hairStyles(l.sex)[0].id;
  const longEar = style === "loose" || style === "mane" || style === "bob";
  if (hv === "front" && !longEar) push({ g: "ear", ramp: M.skin, o: { dome: 1, bias: 0 }, layer: 5.95, loc: (z) => z.dot([-hw + 0.05, hh * 0.18], 0.75).dot([hw - 0.05, hh * 0.18], 0.75) });
  if (hv === "back" && !longEar) push({ g: "ear", ramp: M.skin, o: { dome: 1, bias: -0.3 }, layer: 5.95, loc: (z) => z.dot([-hw + 0.05, hh * 0.12], 0.75).dot([hw - 0.05, hh * 0.12], 0.75) });
  if (style === "beard" && hv !== "back") push({ g: "beard", ramp: M.hair, o: { dome: 2, bias: 0.1 }, layer: 6.12, loc: (z) => {
    if (hv === "front") { z.el([0, hh * 0.55], hw * 0.9, hh * 0.7); z.clip((x, y) => y > hh * 0.18 + Math.max(0, 0.6 - Math.abs(x)) * 0.0); z.clip((x, y) => !(Math.abs(x) < 1.6 && y > hh * 0.42 && y < hh * 0.62)); }
    else { z.el([hw * 0.25, hh * 0.55], hw * 0.62, hh * 0.62); z.clip((x, y) => y > hh * 0.15 && x > -hw * 0.25); }
  } });
  const hp2 = hairParts(style, { hw, hh, lag: P.hairLag, v: hv, fem }, M.hair);
  for (const h of hp2) {
    const layer = h.g === "hair" ? 6.1 : h.g === "hairF" ? 6.3 : v === "up" ? 6.05 : 0.5;
    push({ g: h.g === "hairF" ? "hair" : h.g, ramp: M.hair, o: h.o, layer, loc: h.loc, slot: "hair" });
  }
  if (hv === "side" && style !== "loose" && style !== "mane" && style !== "bob") push({ g: "ear", ramp: M.skin, o: { dome: 1, bias: -0.1 }, layer: 6.2, loc: (z) => z.el([-hw * 0.12, hh * 0.16], 0.85, 1.15), slot: "hair" });
  if (style === "beard") for (const p of parts) if (p.g === "beard") p.slot = "hair";
  if (hv !== "side" && !longEar) for (const p of parts) if (p.g === "ear") p.slot = "hair";
  if (l.gear) l.gear({ l, v, anim, i, u: i / NF(anim), P, sk, b, M, PJ, D, facing, parts, push, loft, secs, surf, c, dW, hv, hw, hh, arm: ARM, leg: LEG, wpL0: WPL0 });
  for (const p of parts) p.slot ??= "body";
  return { parts, hc, theta, style, P, sk, M, v, l, hv, hw };
}

/** Кадр целиком (все слои). */
export function renderFrame(l: Look, v: View, anim: AnimId, i: number): Frame { return renderLayers(l, v, anim, i, [() => true])[0]; }
/** Несколько кадров-подмножеств из одной сборки частей: части рисуются один раз, затем сводятся по каждому фильтру (листы слоёв). */
export function renderLayers(l: Look, v: View, anim: AnimId, i: number, filters: ((p: Part) => boolean)[]): Frame[] {
  const B = buildParts(l, v, anim, i);
  const order0 = B.parts.map((p, k) => ({ p, k })).sort((a, b2) => a.p.layer - b2.p.layer || a.k - b2.k).map((q) => q.p);
  const { hc, theta } = B;
  const ox = Math.round(hc[0]) - LCX, oy = Math.round(hc[1]) - LCY, cs = Math.cos(theta), sn = Math.sin(theta);
  const painted = new Map<Part, { q: number[]; c: C[] }>();
  const paintOne = (p: Part) => {
    let r = painted.get(p); if (r) return r;
    r = { q: [], c: [] };
    if (p.m) {
      const m = new Mz(); p.m(m);
      const cv = new Cv(W, W); paint(cv, m, p.ramp, { dith: 0.12, amp: 1.5, ...p.o, ...(l.lightFlip ? { light: [0.6, -0.8] as [number, number] } : {}) });
      if (p.o?.kant) { const sx = l.lightFlip ? 2 : -2, top = p.ramp[p.ramp.length - 1], hi = p.ramp[p.ramp.length - 2]; for (let q = 0; q < m.d.length; q++) { if (!m.d[q]) continue; const x = q % W, y = Math.floor(q / W); const up = y < 2 || !m.d[q - 2 * W], sd = x + sx < 0 || x + sx >= W || !m.d[q + sx]; if (up) cv.set(x, y, top); else if (sd) cv.set(x, y, hi); } }
      for (let q = 0; q < m.d.length; q++) if (m.d[q]) { r.q.push(q); r.c.push(cv.get(q % W, Math.floor(q / W))); }
    } else if (p.loc) {
      const m = new Mz(LW * Z, LW * Z, LCX, LCY); p.loc(m);
      const lc = new Cv(LW * Z, LW * Z); paint(lc, m, p.ramp, { dith: 0.12, amp: 1.5, ...p.o, ...(l.lightFlip ? { light: [0.6, -0.8] as [number, number] } : {}) });
      if (p.o?.kant) { const LWZ = LW * Z, sx = l.lightFlip ? 2 : -2, top = p.ramp[p.ramp.length - 1], hi = p.ramp[p.ramp.length - 2]; for (let q = 0; q < m.d.length; q++) { if (!m.d[q]) continue; const x = q % LWZ, y = Math.floor(q / LWZ); const up = y < 2 || !m.d[q - 2 * LWZ], sd = x + sx < 0 || x + sx >= LWZ || !m.d[q + sx]; if (up) lc.set(x, y, top); else if (sd) lc.set(x, y, hi); } }
      if (Math.abs(theta) < 0.02) {
        for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.d[y * m.w + x]) { const gx = x + ox * Z, gy = y + oy * Z; if (gx >= 0 && gy >= 0 && gx < W && gy < W) { r.q.push(gy * W + gx); r.c.push(lc.get(x, y)); } }
      } else {
        const cx2 = Math.round(hc[0]) * Z, cy2 = Math.round(hc[1]) * Z;
        for (let gy = 0; gy < W; gy++) for (let gx = 0; gx < W; gx++) {
          const dx = gx + 0.5 - cx2, dy = gy + 0.5 - cy2; if (dx * dx + dy * dy > (LW * Z) ** 2 / 2) continue;
          const lx = Math.floor(LCX * Z + dx * cs + dy * sn), ly = Math.floor(LCY * Z - dx * sn + dy * cs);
          if (lx < 0 || ly < 0 || lx >= m.w || ly >= m.h || !m.d[ly * m.w + lx]) continue;
          r.q.push(gy * W + gx); r.c.push(lc.get(lx, ly));
        }
      }
    }
    painted.set(p, r); return r;
  };
  return filters.map((f) => compose(B, order0.filter(f), paintOne));
}

function compose(B: ReturnType<typeof buildParts>, order: Part[], paintOne: (p: Part) => { q: number[]; c: C[] }): Frame {
  const { hc, theta, style, P, sk, M, v, l, hv, hw } = B;
  const und = l.fac === "umb", fem = l.sex === "f";
  const cs = Math.cos(theta), sn = Math.sin(theta);
  const cv = new Cv(W, W), ids = new Uint8Array(W * W);
  const emisParts = new Set<number>(), emisCol = new Map<number, C>();
  order.forEach((p, k) => {
    if (p.emis) { emisParts.add(k + 1); if (p.emisColor) emisCol.set(k + 1, p.emisColor); }
    const r = paintOne(p);
    for (let j = 0; j < r.q.length; j++) { const q = r.q[j]; cv.set(q % W, Math.floor(q / W), r.c[j]); ids[q] = k + 1; }
  });
  // ---- сведение 2× → 1× ----
  const out = new Cv(FR, FR), oid = new Uint8Array(FR * FR);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    const cnt = new Map<number, number>();
    for (let j = 0; j < 2; j++) for (let i2 = 0; i2 < 2; i2++) { const id = ids[(y * 2 + j) * W + x * 2 + i2]; if (id) cnt.set(id, (cnt.get(id) ?? 0) + 1); }
    let tot = 0; for (const q of cnt.values()) tot += q;
    if (tot < 2) continue;
    let best = 0, bn = -1;
    for (const [id, q] of cnt) if (q > bn || (q === bn && id > best)) { best = id; bn = q; }
    const cols = new Map<string, { n: number; c: C }>();
    for (let j = 0; j < 2; j++) for (let i2 = 0; i2 < 2; i2++) {
      const q = (y * 2 + j) * W + x * 2 + i2; if (ids[q] !== best) continue;
      const cc = cv.get(x * 2 + i2, y * 2 + j), key = cc.join(","), e = cols.get(key); if (e) e.n++; else cols.set(key, { n: 1, c: cc });
    }
    let bc: { n: number; c: C } | null = null;
    for (const e of cols.values()) if (!bc || e.n > bc.n || (e.n === bc.n && e.c[0] + e.c[1] + e.c[2] < bc.c[0] + bc.c[1] + bc.c[2])) bc = e;
    out.set(x, y, bc!.c); oid[y * FR + x] = best;
  }
  // ---- лицо (1×, в системе головы) ----
  const emis: [number, number, C][] = [];
  const hcx = Math.round(hc[0]), hcy = Math.round(hc[1]);
  const isHead = (x: number, y: number) => { const id = oid[y * FR + x]; return id && (order[id - 1].g === "head" || order[id - 1].g === "beard"); };
  const px = (lx: number, ly: number, col: C, any = false) => {
    const x = Math.round(hcx + lx * cs - ly * sn), y = Math.round(hcy + lx * sn + ly * cs);
    if (x < 0 || y < 0 || x >= FR || y >= FR) return;
    if (any ? oid[y * FR + x] : isHead(x, y)) out.set(x, y, col);
    return [x, y] as V2;
  };
  const S = M.skin, ey = 1;
  const beard = style === "beard";
  if (hv === "front") {
    for (const sg of [-1, 1]) {
      const ex = sg < 0 ? -2 : 2;
      if (P.eyes === "closed") { px(ex, ey, S[1]); px(ex + sg, ey, S[1]); }
      else if (und) {
        px(ex, ey - 1, S[0]); px(ex - sg, ey - 1, S[1]);
        const q = px(ex, ey, P.eyes === "squint" ? M.glow![1] : M.glow![2]); px(ex, ey + 1, M.glow![1]);
        if (q && P.eyes !== "squint") emis.push([q[0], q[1], M.glow![3]]);
        px(ex + sg * 1, ey + 2, S[1]);
      } else if (P.eyes === "squint") { px(ex, ey, M.eye); px(ex - sg, ey - 1, M.eye); }
      else {
        px(ex, ey, M.eye); px(ex, ey - 1, M.eye);
        if (fem) px(ex + sg, ey - 1, M.eye); else { px(ex, ey - 2, M.hair[1]); px(ex + sg, ey - 2, M.hair[1]); }
        if (fem && M.blush) px(ex + sg, ey + 2, mixC(S[3], M.blush, 0.45));
      }
    }
    px(0, ey + 1, S[2]);
    if (!beard) {
      if (und) { px(-1, ey + 3, S[0]); px(0, ey + 3, S[0]); px(1, ey + 3, S[0]); if (!fem) px(0, ey + 3, mixC(S[3], S[4], 0.5)); }
      else if (fem) { px(-1, ey + 3, M.lip); px(0, ey + 3, M.lip); }
      else { px(-1, ey + 3, S[1]); px(0, ey + 3, S[1]); }
      if (und && !fem) { px(2, ey + 2, S[0]); px(3, ey + 3, S[0]); }
    } else { px(-1, ey + 3, M.hair[0]); px(0, ey + 3, M.hair[0]); }
  } else if (hv === "side") {
    const ex = Math.round(hw * 0.5);
    if (P.eyes === "closed") px(ex, ey, S[1]);
    else if (und) { px(ex, ey - 1, S[0]); const q = px(ex, ey, M.glow![2]); px(ex, ey + 1, M.glow![1]); if (q && P.eyes !== "squint") emis.push([q[0], q[1], M.glow![3]]); }
    else { px(ex, ey, M.eye); if (P.eyes !== "squint") px(ex, ey - 1, M.eye); px(ex, ey - 2, fem ? M.eye : M.hair[1]); }
    // нос и рот
    let fx = 0; for (let k = 0; k < 8; k++) { const x = Math.round(hcx + (hw - 1 + k) * cs - (ey + 1) * sn), y = Math.round(hcy + (hw - 1 + k) * sn + (ey + 1) * cs); if (x >= 0 && x < FR && y >= 0 && y < FR && isHead(x, y)) fx = hw - 1 + k; }
    const nose = Math.round(fx + 1);
    const q = (() => { const x = Math.round(hcx + nose * cs - (ey + 1) * sn), y = Math.round(hcy + nose * sn + (ey + 1) * cs); return [x, y] as V2; })();
    if (q[0] >= 1 && q[0] < FR && oid[q[1] * FR + q[0] - 1] && isHead(q[0] - 1, q[1])) out.set(q[0] - 1, q[1], S[2]);
    px(fx - 0.5, ey + 3, beard ? M.hair[0] : und ? S[0] : fem ? M.lip : S[1]);
  }
  // ---- внутренний контур ----
  const grp = (id: number) => order[id - 1].g;
  const SAME = new Set(["torso|belt", "belt|torso", "torso|vest", "neck|head", "pelvis|belt", "belt|pelvis", "ear|head", "head|ear", "hairB|hair", "hair|hairB", "weapon|armL", "armL|weapon", "head|beard", "beard|hair", "vest|belt", "belt|vest"]);
  const res = new Cv(FR, FR); res.d.set(out.d);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    const a = oid[y * FR + x]; if (!a) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= FR || yy >= FR) continue;
      const cc = oid[yy * FR + xx];
      if (!cc || cc <= a) continue;
      const ga = grp(a), gc = grp(cc);
      if (ga === gc || SAME.has(ga + "|" + gc)) continue;
      res.set(x, y, mixC(order[a - 1].ramp[0], out.get(x, y), 0.25));
      break;
    }
  }
  // ---- внешний контур ----
  const DK = hx("#0a060c");
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) {
    if (oid[y * FR + x]) continue;
    let best: C | null = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= FR || yy >= FR) continue;
      const cc = oid[yy * FR + xx]; if (!cc) continue;
      const col = mixC(order[cc - 1].ramp[0], DK, 0.55);
      if (!best || col[0] + col[1] + col[2] < best[0] + best[1] + best[2]) best = col;
    }
    if (best) res.set(x, y, best);
  }
  for (let y = 0; y < FR; y++) for (let x = 0; x < FR; x++) if (emisParts.has(oid[y * FR + x])) emis.push([x, y, emisCol.get(oid[y * FR + x]) ?? res.get(x, y)]);
  return { img: res, emis, sk, pose: P };
}
export const mixC = (a: C, b: C, t: number): C => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
export const flipCv = (c: Cv): Cv => { const o = new Cv(c.w, c.h); for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.has(x, y)) o.set(c.w - 1 - x, y, c.get(x, y)); return o; };

// ---------------- точки для слоёв снаряжения ----------------
const ANCH = ["head", "neck", "chest", "shoulderL", "shoulderR", "elbowL", "elbowR", "handL", "handR", "belt", "hipL", "hipR", "kneeL", "kneeR", "footL", "footR", "back", "weaponBack"] as const;
/** Точки кадра (1×, кадр 48×48) + угол оружия в руке и за спиной (градусы экрана, 0 — вверх, по часовой), признак «перед телом». */
export function anchors(f: Frame, v: View): { p: number[]; wAng: number | null; wFront: number; hFront: [number, number] } {
  const sk = f.sk, T = sk.T, PJ = (p: V3) => proj(T(p), v), D = (p: V3) => depthOf(T(p), v);
  const back = add(add(sk.chest, mul(sk.U, -sk.b.chest * 0.35)), mul(sk.F, -(sk.b.shW * 0.46 + 0.6)));
  const wb = add(back, mul(sk.F, -0.6));
  const pts: V3[] = [sk.head, sk.neck, sk.chest, sk.shL, sk.shR, sk.elL, sk.elR, sk.hdL, sk.hdR, add(sk.waist, mul(sk.F, sk.b.waist * 0.62)), sk.hipL, sk.hipR, sk.kneeL, sk.kneeR, sk.footL[1], sk.footR[1], back, wb];
  const p: number[] = [];
  for (const q of pts) { const s = PJ(q); p.push(Math.round(s[0] * 2) / 2, Math.round(s[1] * 2) / 2); }
  let wAng: number | null = null, wFront = 1;
  if (f.pose.weapon) { const a = PJ(sk.hdL), b2 = PJ(add(sk.hdL, nrm(f.pose.weapon.dir))); wAng = Math.round((Math.atan2(b2[0] - a[0], -(b2[1] - a[1])) * 180) / Math.PI); wFront = D(add(sk.hdL, mul(nrm(f.pose.weapon.dir), 4))) < -1.2 ? 0 : 1; }
  const hf = (h: V3, s: V3) => (D(lerp3(s, h, 0.5)) < -1.2 ? 0 : 1);
  return { p, wAng, wFront, hFront: [hf(sk.hdL, sk.shL), hf(sk.hdR, sk.shR)] };
}
export function exportSkeleton(file: string) {
  const bodies: Record<string, Look> = { sol_m: { fac: "sol", sex: "m", props: false }, sol_f: { fac: "sol", sex: "f", props: false }, umb_m: { fac: "umb", sex: "m", props: false }, umb_f: { fac: "umb", sex: "f", props: false } };
  const out: any = {
    _doc: "Точки скелета основы героя «Б» для слоёв снаряжения (задача 147). Кадр 48×48, точка опоры (ступни) — (24, 45). Для каждого тела, анимации и вида (down/up/side; влево — зеркало side): кадры → p — пары x,y в порядке keys; wAng — угол оружия в левой руке (градусы экрана, 0 — вверх, по часовой; null — без оружия в позе); wFront — оружие перед телом (1) или за ним (0); hFront — кисти L/R перед телом. weaponBack — точка ножен за спиной (угол по умолчанию 35°). Генератор: tools/gen/hero147/base_b.ts.",
    keys: ANCH, frame: FR, origin: [CX, FY], weaponBackAngle: 35, bodies: {},
  };
  for (const [id, l0] of Object.entries(bodies)) {
    const per: any = {};
    for (const a of ANIMS) {
      const views: any = {};
      for (const v of ["down", "up", "side"] as View[]) {
        views[v] = [];
        for (let i = 0; i < NF(a); i++) {
          const lk = { ...l0, props: !!DATA.anims[a].props };
          const P = pose(lk, a, i, v), q = anchors({ sk: solve(lk, P), pose: P } as Frame, v);
          views[v].push({ p: q.p, wAng: q.wAng, wFront: q.wFront, hFront: q.hFront });
        }
      }
      per[a] = { fps: DATA.anims[a].fps, loop: DATA.anims[a].loop, views };
    }
    out.bodies[id] = per;
  }
  fs.writeFileSync(file, JSON.stringify(out));
}
