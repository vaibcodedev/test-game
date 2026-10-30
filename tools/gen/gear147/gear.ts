/**
 * Снаряжение на основе героя «Б»: шаблоны вещей по слотам (шлем, наплечники, доспех, перчатки, сапоги, спина, оружие).
 * Вещь = части в 3D-скелете кадра (те же маски ×2, свет сверху-слева, контуры основы), привязанные к точкам скелета;
 * слой каждой части — по правилу той части тела, к которой она крепится (дальняя рука, ноги, торс, ближняя рука, голова),
 * поэтому порядок слоёв по направлению получается сам: плащ сзади при виде вниз и поверх спины при виде вверх и т. д.
 * Параметры вещей и материалы — data/gear147.json. Новые сеты — только данными (или новым стилем шаблона).
 */
import fs from "node:fs";
import path from "node:path";
import { hx, hash, type C } from "../bosses139/mino_lib";
import { coat, dual, dualPose, hood, scarf } from "./rogue";
import { FY, FR, flipCv, proj, renderFrame, type Frame, type AnimId, type Build, type GearCtx, type Look, type Mz, type Part, type Pose, type Sk, type V2, type V3, type View } from "../hero147/base_b";

export const GD = JSON.parse(fs.readFileSync(path.resolve("data/gear147.json"), "utf8"));
export type Slot = "helm" | "pauldrons" | "armor" | "gloves" | "boots" | "cloak" | "weapon";
export const SLOTS: Slot[] = ["helm", "pauldrons", "armor", "gloves", "boots", "cloak", "weapon"];
export type CrestId = "sol" | "umb";
export interface SetDef { name: string; rarity: string; level: number; items: Partial<Record<Slot, any>> }
export const setOf = (id: string): SetDef => GD.sets[id];
export const ramp = (k: string): C[] => { const m = GD.materials[k]; if (!m) throw new Error("материал? " + k); return m.map(hx); };

// ---- векторы ----
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const lerp = (a: V3, b: V3, t: number): V3 => add(a, mul(sub(b, a), t));
const sum = (...v: V3[]): V3 => v.reduce((s, x) => add(s, x), [0, 0, 0] as V3);
const cl = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const v2 = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

type Sec = { h: number; a: number; d: number; f: number };
/** точка на поверхности лофта (side 1 — перед, -1 — спина) */
function mkSurf(o: V3, A: V3, U: V3, F: V3, S: Sec[]) {
  const at = (h: number): Sec => {
    if (h <= S[0].h) return S[0];
    for (let k = 0; k + 1 < S.length; k++) if (h <= S[k + 1].h) { const t = (h - S[k].h) / (S[k + 1].h - S[k].h); return { h, a: S[k].a + (S[k + 1].a - S[k].a) * t, d: S[k].d + (S[k + 1].d - S[k].d) * t, f: S[k].f + (S[k + 1].f - S[k].f) * t }; }
    return S[S.length - 1];
  };
  return (a: number, h: number, side = 1, out = 0.15): V3 => { const s = at(h); const q = cl(Math.abs(a) / s.a); return sum(o, mul(A, a), mul(U, h), mul(F, s.f + side * s.d * Math.sqrt(1 - q * q) + side * out)); };
}

/** Направления героя-правши: меч в ПРАВОЙ руке, щит в левой. Камера — сверху-спереди (с юга).
 * Рука с оружием у основы — +X. Вниз/вверх: mirrorX (правая — слева на экране при виде вниз). Вправо (лицом на восток, правый бок к зрителю):
 * без зеркала — правая рука ближняя, меч перед телом. Влево (правый бок на север): mirrorX + свет сверху-справа, затем flipX —
 * правая рука дальняя, меч за телом, а свет в итоге сверху-слева, как во всех направлениях. Порядок слоёв считается по глубине. */
export type View4 = View | "left";
export const VIEWS4: View4[] = ["down", "up", "side", "left"];
export const viewLook = (l: Look, v: View4): Look => ({ ...l, mirrorX: v !== "side", lightFlip: v === "left" });
export const baseView = (v: View4): View => (v === "left" ? "side" : v);
export function renderView(l: Look, v: View4, a: AnimId, i: number): Frame {
  const f = renderFrame(viewLook(l, v), baseView(v), a, i);
  if (v !== "left") return f;
  return { ...f, img: flipCv(f.img), emis: f.emis.map(([x, y, c]) => [f.img.w - 1 - x, y, c] as [number, number, C]) };
}

/** Сборка: look + сет (+ герб) → хуки основы (части снаряжения и поправка позы под оружие). */
export function dress(base: Look, set: SetDef | null, crest: CrestId = "sol", only?: Slot[]): Look {
  if (!set) return base;
  const it = (s: Slot) => (!only || only.includes(s) ? set.items[s] : undefined);
  const wp = it("weapon");
  return {
    ...base,
    frame: wp?.frame ?? base.frame,
    posePatch: wp?.kind === "great" ? (P, k) => carryGreat(P, k) : wp?.kind === "dual" ? (P, k) => dualPose(P, k) : undefined,
    gear: (ctx) => {
      const tag = (slot: string) => (p: Part) => ctx.parts.push({ ...p, slot: p.slot ?? slot });
      const mk = (slot: string): GearCtx => ({ ...ctx, push: tag(slot) });
      // кисть далеко за корпусом от зрителя (хват перед грудью при виде со спины, замах за голову при виде спереди) — вся рука за телом
      if (ctx.v !== "side") for (const sd of ["L", "R"] as const) {
        const Hd = sd === "L" ? ctx.sk.hdL : ctx.sk.hdR;
        if (ctx.arm[sd].L0 >= 5 && ctx.D(Hd) < -1.5) { for (const p of ctx.parts) if (p.g === "arm" + sd) p.layer -= 4; ctx.arm[sd] = { ...ctx.arm[sd], L0: ctx.arm[sd].L0 - 4 }; }
      }
      if (it("helm")) { if (it("helm").style === "hood") hood(mk("helm"), it("helm"), crest); else helm(mk("helm"), it("helm")); for (let k = ctx.parts.length - 1; k >= 0; k--) if (ctx.parts[k].slot === "hair") ctx.parts.splice(k, 1); }
      if (it("armor")) { if (it("armor").style === "coat") coat(mk("armor"), it("armor"), crest); else armor(mk("armor"), it("armor"), crest); }
      if (it("pauldrons")) pauldrons(mk("pauldrons"), it("pauldrons"));
      if (it("gloves")) gloves(mk("gloves"), it("gloves"));
      if (it("boots")) boots(mk("boots"), it("boots"));
      if (it("cloak")) back(mk("cloak"), it("cloak"), crest);
      if (wp) {
        for (let k = ctx.parts.length - 1; k >= 0; k--) if ((ctx.parts[k].g === "weapon" || ctx.parts[k].g === "shield") && !ctx.parts[k].slot) ctx.parts.splice(k, 1);
        if (wp.kind === "dual") dual(mk("weapon"), wp, drawWeapon); else weapon(mk("weapon"), wp);
      }
    },
  };
}

export const DROP_U = 0.22;
/** Двуручник: в покое, ходьбе и беге держится перед собой клинком вверх (левая рука на рукояти у пояса). */
function carryGreat(P: Pose, k: { anim: AnimId; u: number; arm: number; view: string; sx: number }) {
  if (k.anim === "special2h") return spinGreat(P, k as any);
  if (k.anim === "atk2h" && k.view !== "side") return slashGreat(P, k);
  if (k.anim === "atk2h") return sideGreat(P, k);
  // гибель: лежащее тело с латами, рогами и плащом выше нижней кромки кадра
  if (k.anim === "death" && P.G) P.G = { ...P.G, shift: [P.G.shift[0], P.G.shift[1] - 5.8 * (P.G.ang / (Math.PI / 2)), P.G.shift[2]] };
  if (k.anim === "hurt" || (k.anim === "death" && k.u < DROP_U)) {
    // урон: меч остаётся в руке, кисть и клинок отдёргиваются вместе с телом; гибель: держит до DROP_U, затем роняет
    const f = Math.sin(Math.PI * cl(k.u / (k.anim === "hurt" ? 0.6 : DROP_U * 1.6)));
    P.weapon = { kind: "great", dir: nrm(k.view === "side" ? [0.2, -0.72, 0.66 - 0.6 * f] : [0.44 + 0.2 * f, -0.86, 0.28 - 0.55 * f]) };
    P.hL = { rel: [2.0 + 0.6 * f, k.arm * (0.8 - 0.2 * f), 2.6 - 1.6 * f], pole: [0.7, 0.3, -0.6] };
    P.hR = { pole: [-0.7, 0.3, -0.7] }; P.twoHand = true; return;
  }
  if (k.anim !== "idle" && k.anim !== "walk" && k.anim !== "run") return;
  const bob = k.anim === "idle" ? 0.25 * Math.sin(2 * Math.PI * (k.u - 0.1)) : 0.35 * Math.sin(4 * Math.PI * (k.u - 0.3));
  const run = k.anim === "run";
  const side = k.view === "side";
  P.weapon = { kind: "great", dir: nrm(side ? [0.2, -0.72, 0.66 + 0.03 * bob] : run ? [0.45, -0.78, 0.45] : [0.44, -0.86, 0.28 + 0.03 * bob]) };
  P.hL = { rel: [2.0, k.arm * (run ? 0.62 : 0.8) + bob * 0.3, run ? 2.4 : 2.6], pole: [0.7, 0.3, -0.6] };
  P.hR = { pole: [-0.7, 0.3, -0.7] }; P.twoHand = true; // двуручник — обеими руками, правая (ведущая) выше
}

/** Удар двуручным для видов вниз/вверх: диагональ из-за левого плеча вниз-вправо (на экране клинок не уходит «в камеру»). */
function slashGreat(P: Pose, k: { u: number; arm: number; sx: number }) {
  type K = { h: V3; d: V3; tw: number; ln: number };
  const ready: K = { h: [-1.6, k.arm * 0.74, 2.6], d: [0.42, -0.78, 0.45], tw: 0.1, ln: 0.06 };
  const keys: [number, K][] = [
    [0, ready],
    [0.35, { h: [1.2, -k.arm * 0.32, 0.7], d: [0.5, -0.78, -0.38], tw: 0.38, ln: -0.1 }],
    [0.55, { h: [-4.6, k.arm * 0.55, 3.2], d: [-0.62, 0.12, 0.6], tw: -0.38, ln: 0.3 }],
    [0.72, { h: [-4.9, k.arm * 0.6, 2.9], d: [-0.66, 0.08, 0.56], tw: -0.42, ln: 0.32 }],
    [1, ready],
  ];
  const eases = [(t: number) => t * t * (3 - 2 * t), (t: number) => t * t * t, (t: number) => t * t * (3 - 2 * t), (t: number) => t * t * (3 - 2 * t)];
  let i = 0; while (i < keys.length - 2 && k.u > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1], e = eases[i](cl((k.u - t0) / (t1 - t0)));
  const L3 = (x: V3, y: V3): V3 => [x[0] + (y[0] - x[0]) * e, x[1] + (y[1] - x[1]) * e, x[2] + (y[2] - x[2]) * e];
  P.weapon = { kind: "great", dir: nrm(L3(a.d, b.d)) }; P.twoHand = true;
  P.hL = { rel: L3(a.h, b.h), pole: [0.7, 0.3, -0.7] }; P.hR = { pole: [-0.7, 0.3, -0.7] };
  P.twist = a.tw + (b.tw - a.tw) * e; P.lean = a.ln + (b.ln - a.ln) * e;
}

/** Удар двуручным вбок: та же поза основы, но клинок в кадре — замах вверх-назад, удар вниз-вперёд с уходом в глубину (не за край кадра, не в землю). */
function sideGreat(P: Pose, k: { u: number }) {
  const keys: [number, V3][] = [[0, [0.12, -0.75, 0.62]], [0.35, [0.3, -0.82, -0.48]], [0.55, [0.74, 0.36, 0.46]], [0.72, [0.74, 0.38, 0.44]], [0.86, [0.66, -0.32, 0.4]], [1, [0.12, -0.75, 0.62]]];
  const eases = [(t: number) => t * t * (3 - 2 * t), (t: number) => t * t * t, (t: number) => t * t * (3 - 2 * t), (t: number) => t * t * (3 - 2 * t), (t: number) => t * t * (3 - 2 * t)];
  let i = 0; while (i < keys.length - 2 && k.u > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1], e = eases[i](cl((k.u - t0) / (t1 - t0)));
  if (P.weapon) P.weapon.dir = nrm([a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]);
}

/** Особый удар: широкий рубящий с разворотом — клинок обходит героя по кругу на уровне груди (θ — угол в плоскости XZ, 0 — вперёд). */
export function spinTheta(u: number): number {
  const keys: [number, number][] = [[0, 0.6], [0.3, -2.3], [0.62, 2.5], [0.76, 2.9], [1, 0.6]];
  const eases = [(t: number) => t * t * (3 - 2 * t), (t: number) => t * t, (t: number) => 1 - (1 - t) ** 2, (t: number) => t * t * (3 - 2 * t)];
  let i = 0; while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  return a + (b - a) * eases[i](cl((u - t0) / (t1 - t0)));
}
function spinGreat(P: Pose, k: { u: number; hipY: number; hipJ: number; b: Build }) {
  const th = spinTheta(k.u), r = 4.6, y = k.hipY - 6.2;
  P.weapon = { kind: "great", dir: nrm([Math.sin(th), -0.1, Math.cos(th)]) }; P.twoHand = true;
  P.hL = { abs: [Math.sin(th) * r, y, Math.cos(th) * r], pole: [0.7, 0.3, -0.7] }; P.hR = { pole: [-0.7, 0.3, -0.7] };
  P.twist = cl(th * 0.33, -0.9, 0.9); P.lean = 0.1;
  P.hip = [0, k.hipY + 1.1, 0]; P.ankL = [k.hipJ + 0.9, FY - k.b.ankle, 1.2]; P.ankR = [-k.hipJ - 0.9, FY - k.b.ankle, -0.9];
}

// ---- общие помощники рисования ----
function spike(ctx: GearCtx, z: Mz, base: V3, tip: V3, w: number) {
  const a = ctx.PJ(base), t = ctx.PJ(tip), dx = t[0] - a[0], dy = t[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const n: V2 = [(-dy / l) * w, (dx / l) * w];
  z.pg([[a[0] + n[0], a[1] + n[1]], t, [a[0] - n[0], a[1] - n[1]]]);
}
/** изогнутый шип (как рог): толстое основание, острый кончик, изгиб bend (доля длины, знак — в сторону) + светлый блик вдоль */
function hook(ctx: GearCtx, slot: { g: string; layer: number; far: number }, base: V3, tip: V3, w: number, bend: number, rp: C[]) {
  const a = ctx.PJ(base), t = ctx.PJ(tip), dx = t[0] - a[0], dy = t[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const c: V2 = [(a[0] + t[0]) / 2 + nx * bend * l, (a[1] + t[1]) / 2 + ny * bend * l], lf = lx(ctx);
  ctx.push({ g: slot.g, ramp: rp, o: { dome: 1, amp: 2.0, bias: slot.far + 0.6 }, layer: slot.layer, m: (z) => z.bz(a, c, t, w * 2, 0.35) });
  ctx.push({ g: slot.g, ramp: rp, o: { dome: 1, bias: slot.far + 2.6 }, layer: slot.layer + 0.00001, m: (z) => z.bz([a[0] - 0.5 * lf, a[1] - 0.35], [c[0] - 0.4 * lf, c[1] - 0.3], [t[0] + (a[0] - t[0]) * 0.18, t[1] + (a[1] - t[1]) * 0.18], 0.6, 0.45) });
}
/** блик вдоль детали: отрезок, сдвинутый на экране к свету (вверх-влево) */
const lx = (ctx: GearCtx) => (ctx.l.lightFlip ? -1 : 1);
function hiSeg(ctx: GearCtx, z: Mz, a: V3, b: V3, w: number, off: number) { const p = ctx.PJ(a), q = ctx.PJ(b), o = off * lx(ctx); z.seg([p[0] - o, p[1] - off * 0.4], [q[0] - o, q[1] - off * 0.4], w); }
const RIM: C[] = ["#0a0608", "#120a0e", "#1a0e14", "#22121a", "#2a1620"].map(hx);
function chain(ctx: GearCtx, z: Mz, pts: V3[], w: number) { for (let k = 0; k + 1 < pts.length; k++) z.seg(ctx.PJ(pts[k]), ctx.PJ(pts[k + 1]), w); }
function ellPts(c: V3, e1: V3, e2: V3, e3: V3, r: [number, number, number], keep: (q: V3) => boolean): V3[] {
  const o: V3[] = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j < 14; j++) {
    const th = (i / 8) * Math.PI, ph = (j / 14) * Math.PI * 2;
    const q: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
    if (!keep(q)) continue;
    o.push(sum(c, mul(e1, q[0] * r[0]), mul(e2, q[1] * r[1]), mul(e3, q[2] * r[2])));
  }
  return o;
}
/** Герб: щит-«капля» в плоскости (ax — вбок, ay — вверх), заряд по фракции. */
export function crestParts(ctx: GearCtx, c: V3, ax: V3, ay: V3, s: number, layer: number, id: CrestId, far = 0) {
  const cr = GD.crests[id], P = (x: number, y: number) => ctx.PJ(sum(c, mul(ax, x * s), mul(ay, y * s)));
  ctx.push({ g: "crestR", slot: "crest", ramp: ramp(cr.charge), o: { dome: 1, bias: -0.6 + far }, layer: layer - 0.0005, m: (z) => z.pg([P(-1.85, 1.95), P(1.85, 1.95), P(1.85, -0.15), P(0, -2.5), P(-1.85, -0.15)]) });
  ctx.push({ g: "crest", slot: "crest", ramp: ramp(cr.field), o: { dome: 2, amp: 1.2, bias: 0.2 + far }, layer, m: (z) => z.pg([P(-1.4, 1.6), P(1.4, 1.6), P(1.4, -0.1), P(0, -1.95), P(-1.4, -0.1)]) });
  if (cr.shape === "sun") ctx.push({ g: "crestC", slot: "crest", ramp: ramp(cr.charge), o: { dome: 1, bias: 0.6 + far }, layer: layer + 0.001, m: (z) => { z.dot(P(0, 0.3), 0.5 * s); if (s > 1.3) for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; z.seg(P(0, 0.3), P(Math.cos(a) * 1.05, 0.3 + Math.sin(a) * 1.05), 0.36 * s); } } });
  else ctx.push({ g: "crestC", slot: "crest", ramp: ramp(cr.charge), o: { dome: 1, bias: 0.9 + far }, layer: layer + 0.001, m: (z) => { const q = P(-0.15, 0.3), q2 = P(0.45, 0.6), r = 0.62 * s; z.dot(q, r); z.clip((x, y) => Math.hypot(x - q2[0], y - q2[1]) > r * 0.78); } });
}


// =============== ШЛЕМ (в системе головы: центр (0,0), y вниз; вбок — лицом вправо) ===============
function helm(ctx: GearCtx, it: any) {
  const { push, hv, hw, hh } = ctx;
  const P = ramp(it.plate), Ac = ramp(it.accent), Tr = ramp(it.trim);
  const loc = (g: string, rp: C[], layer: number, f: (z: Mz) => void, o: any = { dome: 3, amp: 1.7, bias: 0.2 }, emis = false) => push({ g, ramp: rp, layer, loc: f, o, emis });
  const tri = (z: Mz, a: V2, b: V2, t: V2) => z.pg([a, t, b]);
  if (it.style === "horned") {
    const Hn = ramp(it.horn), G = ramp(it.glow), k = it.horns ?? 1;
    const horn = (z: Mz, sg: number, dx = 0, dy = 0) => {
      const p0: V2 = [sg * hw * 0.7 + dx, -hh * 0.45 + dy], p1: V2 = [sg * hw * 1.75 * k + dx, -hh * 0.75 + dy], p2: V2 = [sg * hw * 1.2 * k + dx, -hh * 2.3 * k + dy];
      z.bz(p0, p1, p2, 2.6, 0.45);
    };
    // вбок: рог от виска вверх и назад (дугой)
    const hornS = (z: Mz, dx: number, dy: number) => z.bz([hw * 0.3 + dx, -hh * 0.5 + dy], [hw * 0.62 * k + dx, -hh * 1.75 * k + dy], [-hw * 0.5 * k + dx, -hh * 2.05 * k + dy], 2.6, 0.4);
    const ridge = (z: Mz, xs: number[], tilt = 0) => xs.forEach((x, j) => { const tall = j === Math.floor(xs.length / 2) ? 3.0 : 2.1; tri(z, [x - 0.8, -hh * 0.82], [x + 0.8, -hh * 0.82], [x + tilt, -hh - tall]); });
    if (hv === "front" || hv === "back") {
      loc("h_spk", P, 6.13, (z) => ridge(z, it.spikes >= 3 ? [-2.3, 0, 2.3] : [0]), { dome: 1, amp: 1.8, bias: 0.5 });
      loc("h_shell", P, 6.15, (z) => { z.el([0, -hh * 0.08], hw + 0.8, hh + 0.55); z.pg([[-hw - 0.75, -hh * 0.1], [hw + 0.75, -hh * 0.1], [hw * 0.82, hh + 1.0], [0, hh + 1.5], [-hw * 0.82, hh + 1.0]]); }, { dome: 3, amp: 1.8, bias: 0.3, kant: true });
      loc("h_horn", Hn, 6.19, (z) => { horn(z, 1); horn(z, -1); }, { dome: 2, amp: 1.8, bias: 0.3 });
      loc("h_hornK", Ac, 6.1905, (z) => { for (const sg of [1, -1]) z.bz([sg * hw * 0.85, -hh * 0.3], [sg * hw * 1.85 * k, -hh * 0.62], [sg * hw * 1.42 * k, -hh * 1.6 * k], 0.7, 0.45); }, { dome: 1, bias: 0.6 });
      loc("h_horn", Hn, 6.191, (z) => { for (const sg of [1, -1]) for (const t of [0.18, 0.34]) { const x = sg * hw * (0.72 + 1.0 * t), y = -hh * (0.5 + 0.55 * t); z.seg([x - 0.9, y - 0.5 * sg * 0], [x + 0.9 * 0.2, y + 1.0], 0.7); } }, { dome: 1, bias: -1.4 });
      if (hv === "front") {
        loc("h_face", Ac, 6.16, (z) => z.pg([[-hw * 0.8, -hh * 0.22], [hw * 0.8, -hh * 0.22], [hw * 0.6, hh * 0.55], [0, hh + 1.2], [-hw * 0.6, hh * 0.55]]), { dome: 2, amp: 1.8, bias: 0.25, kant: true });
        loc("h_face", Ac, 6.161, (z) => z.seg([0, -hh * 0.18], [0, hh + 0.8], 0.75), { dome: 1, bias: 1.4 });
        loc("h_slit", P, 6.17, (z) => { z.seg([-hw * 0.66, hh * 0.02], [-hw * 0.14, hh * 0.2], 1.0); z.seg([hw * 0.66, hh * 0.02], [hw * 0.14, hh * 0.2], 1.0); }, { dome: 1, bias: -2 });
        loc("h_eye", G, 6.18, (z) => { z.dot([-hw * 0.4, hh * 0.1], 0.55); z.dot([hw * 0.4, hh * 0.1], 0.55); }, { dome: 1, bias: 0.3 }, true);
        loc("h_trim", Tr, 6.165, (z) => z.bz([-hw * 0.9, -hh * 0.5], [0, -hh * 0.85], [hw * 0.9, -hh * 0.5], 0.75, 0.75), { dome: 1, bias: 0.4 });
      } else {
        loc("h_back", Ac, 6.16, (z) => z.seg([0, -hh * 0.95], [0, hh * 0.3], 1.4, 1.0), { dome: 1, amp: 1.6, bias: 0.2 });
        loc("h_back", P, 6.161, (z) => { z.bz([-hw * 0.8, hh * 0.45], [0, hh * 0.65], [hw * 0.8, hh * 0.45], 0.8, 0.8); z.bz([-hw * 0.7, hh * 0.85], [0, hh * 1.05], [hw * 0.7, hh * 0.85], 0.8, 0.8); }, { dome: 1, bias: -1.4 });
      }
    } else {
      // профиль: забрало «клювом» вперёд, гребень шипов назад, рог от виска вперёд-вверх, назатыльник
      loc("h_horn", Hn, 6.12, (z) => hornS(z, -1.3, 0.3), { dome: 2, amp: 1.6, bias: -0.5 });
      // гребень вбок убран: силуэт даёт рог
      loc("h_shell", P, 6.15, (z) => { z.el([-0.5, -hh * 0.1], hw + 0.6, hh + 0.5); z.pg([[-hw * 0.3, hh * 0.2], [-hw - 1.3, hh + 1.5], [-hw * 0.2, hh + 1.7], [hw * 0.3, hh + 0.9]]); }, { dome: 3, amp: 1.8, bias: 0.3, kant: true });
      loc("h_nape", P, 6.151, (z) => { z.seg([-hw * 0.9, hh * 0.55], [-hw * 0.15, hh * 0.95], 0.7); z.seg([-hw - 0.6, hh * 1.05], [-hw * 0.2, hh + 1.25], 0.7); }, { dome: 1, bias: -1.6 });
      loc("h_face", Ac, 6.16, (z) => z.pg([[hw * 0.1, -hh * 0.38], [hw + 0.9, -hh * 0.22], [hw + 2.6, hh * 0.3], [hw + 1.4, hh * 0.85], [hw * 0.7, hh + 1.3], [-hw * 0.05, hh + 1.0]]), { dome: 2, amp: 1.9, bias: 0.3, kant: true });
      loc("h_vrim", P, 6.161, (z) => z.seg([hw * 0.1, -hh * 0.36], [-hw * 0.05, hh + 0.95], 0.9), { dome: 1, bias: -0.4 });
      loc("h_slit", P, 6.17, (z) => { z.seg([hw * 0.35, hh * 0.06], [hw + 1.5, hh * 0.28], 1.0); z.dot([hw + 0.7, hh * 0.68], 0.45); z.dot([hw * 0.45, hh * 0.9], 0.45); }, { dome: 1, bias: -2 });
      loc("h_eye", G, 6.18, (z) => z.dot([hw * 0.72, hh * 0.14], 0.6), { dome: 1, bias: 0.3 }, true);
      loc("h_trim", Tr, 6.165, (z) => z.seg([hw * 0.15, -hh * 0.3], [hw + 0.85, -hh * 0.14], 0.75), { dome: 1, bias: 0.4 });
      loc("h_horn", Hn, 6.19, (z) => hornS(z, 0, 0), { dome: 2, amp: 1.9, bias: 0.35 });
      loc("h_hornK", Ac, 6.1905, (z) => z.bz([hw * 0.45, -hh * 0.5], [hw * 0.75 * k * 0.72 + hw * 0.1, -hh * 1.55], [-hw * 0.45 * k + 0.4, -hh * 1.95 * k + 0.5], 0.75, 0.45), { dome: 1, bias: 0.6 });
      loc("h_horn", Hn, 6.191, (z) => { z.seg([hw * 0.15, -hh * 0.85], [hw * 0.6, -hh * 0.92], 0.6); }, { dome: 1, bias: -1.5 });
      loc("h_horn", Hn, 6.192, (z) => z.bz([hw * 0.12, -hh * 0.75], [hw * 0.4, -hh * 1.6], [-hw * 0.3, -hh * 1.85], 0.55, 0.45), { dome: 1, bias: 2.4 });
      loc("h_boss", Ac, 6.192, (z) => z.dot([hw * 0.15, -hh * 0.55], 1.0), { dome: 1, bias: 0.5 });
    }
  } else if (it.style === "great") {
    // топфхельм: бочонок с плоским забралом и щелью; редкость — кант-крест, заклёпки, плюмаж, крылья, самоцвет
    const fancy = it.trim !== it.plate;
    if (hv === "front" || hv === "back") {
      if (it.plume) loc("h_plume", ramp(it.plume), 6.13, (z) => z.bz([0, -hh - 0.2], [hw * 0.5, -hh - 3.2], [hw * 1.3, -hh - 2.0], 2.6, 1.0), { dome: 2, amp: 1.7, bias: 0.3 });
      if (it.wings) loc("h_wing", Tr, 6.14, (z) => { for (const sg of [-1, 1]) z.pg([[sg * hw * 0.85, -hh * 0.2], [sg * (hw + 3.2), -hh - 2.6], [sg * (hw + 2.4), -hh * 0.6], [sg * (hw + 3.0), -hh * 0.35], [sg * hw, hh * 0.25]]); }, { dome: 2, amp: 1.8, bias: 0.3, kant: true });
      loc("h_shell", P, 6.15, (z) => { z.el([0, -hh * 0.2], hw + 0.75, hh * 0.85); z.pg([[-hw - 0.75, -hh * 0.2], [hw + 0.75, -hh * 0.2], [hw + 0.6, hh + 1.2], [-hw - 0.6, hh + 1.2]]); }, { dome: 3, amp: 1.8, bias: 0.3, kant: true });
      if (hv === "front") {
        loc("h_slit", P, 6.17, (z) => { z.seg([-hw * 0.85, hh * 0.05], [-hw * 0.12, hh * 0.05], 1.0); z.seg([hw * 0.12, hh * 0.05], [hw * 0.85, hh * 0.05], 1.0); z.dot([hw * 0.5, hh * 0.6], 0.4); z.dot([hw * 0.5, hh * 0.95], 0.4); }, { dome: 1, bias: -2.2 });
        if (it.gem) loc("h_gem", ramp(it.gem), 6.18, (z) => z.dot([0, -hh * 0.55], 0.8), { dome: 1, bias: 0.7 });
      }
      if (fancy) loc("h_band", Tr, 6.165, (z) => { z.seg([0, -hh - 0.5], [0, hh + 1.0], 0.95); if (hv === "front") z.seg([-hw - 0.6, -hh * 0.25], [hw + 0.6, -hh * 0.25], 0.8); }, { dome: 1, bias: 0.5 });
    } else {
      if (it.plume) loc("h_plume", ramp(it.plume), 6.13, (z) => z.bz([-hw * 0.1, -hh - 0.3], [-hw * 0.8, -hh - 3.0], [-hw * 1.9, -hh - 1.2], 2.6, 1.0), { dome: 2, amp: 1.7, bias: 0.3 });
      loc("h_shell", P, 6.15, (z) => { z.el([-0.3, -hh * 0.2], hw + 0.7, hh * 0.85); z.pg([[-hw - 0.7, -hh * 0.2], [hw + 0.9, -hh * 0.2], [hw + 0.9, hh + 1.1], [-hw - 0.5, hh + 1.3]]); }, { dome: 3, amp: 1.8, bias: 0.3, kant: true });
      if (it.wings) loc("h_wing", Tr, 6.17, (z) => z.pg([[-hw * 0.2, -hh * 0.3], [-hw * 1.4, -hh - 2.8], [-hw * 0.9, -hh * 0.7], [-hw * 1.5, -hh * 0.4], [-hw * 0.1, hh * 0.3]]), { dome: 2, amp: 1.8, bias: 0.3, kant: true });
      loc("h_slit", P, 6.17, (z) => { z.seg([hw * 0.2, hh * 0.05], [hw + 0.9, hh * 0.05], 1.0); z.dot([hw * 0.6, hh * 0.65], 0.4); }, { dome: 1, bias: -2.2 });
      if (fancy) loc("h_band", Tr, 6.165, (z) => z.seg([-hw * 0.6, -hh * 0.25], [hw + 0.85, -hh * 0.25], 0.8), { dome: 1, bias: 0.5 });
    }
  } else {
    // шапель: открытое лицо, поля, кольчужный капюшон
    const Ml = ramp(it.mail);
    if (hv === "front") {
      loc("h_mail", Ml, 6.12, (z) => { z.seg([-hw * 0.9, -hh * 0.1], [-hw * 0.75, hh * 0.95], 1.9, 1.5); z.seg([hw * 0.9, -hh * 0.1], [hw * 0.75, hh * 0.95], 1.9, 1.5); }, { dome: 1, bias: 0, dith: 0.6 });
      loc("h_shell", P, 6.15, (z) => { z.el([0, -hh * 0.3], hw + 0.5, hh * 0.85); z.clip((x, y) => y < -hh * 0.15); });
      loc("h_brim", P, 6.16, (z) => z.el([0, -hh * 0.18], hw + 1.7, 1.15), { dome: 1, amp: 1.6, bias: 0.1 });
    } else if (hv === "back") {
      loc("h_mail", Ml, 6.12, (z) => z.el([0, hh * 0.25], hw + 0.4, hh * 0.9), { dome: 2, bias: 0, dith: 0.6 });
      loc("h_shell", P, 6.15, (z) => { z.el([0, -hh * 0.3], hw + 0.5, hh * 0.85); z.clip((x, y) => y < -hh * 0.1); });
      loc("h_brim", P, 6.16, (z) => z.el([0, -hh * 0.13], hw + 1.7, 1.15), { dome: 1, amp: 1.6, bias: 0.1 });
    } else {
      loc("h_mail", Ml, 6.12, (z) => { z.el([-hw * 0.25, hh * 0.25], hw * 0.85, hh * 0.85); z.clip((x) => x < hw * 0.2); }, { dome: 2, bias: 0, dith: 0.6 });
      loc("h_shell", P, 6.15, (z) => { z.el([-0.3, -hh * 0.32], hw + 0.5, hh * 0.85); z.clip((x, y) => y < -hh * 0.12); });
      loc("h_brim", P, 6.16, (z) => z.el([-0.2, -hh * 0.18], hw + 1.9, 1.1), { dome: 1, amp: 1.6, bias: 0.1 });
    }
  }
}

// =============== ДОСПЕХ ===============
function armor(ctx: GearCtx, it: any, crest: CrestId) {
  const { sk, b, PJ, facing, loft, c, dW, push } = ctx, { A, U, F, waist } = sk;
  const P = ramp(it.plate), Ac = ramp(it.accent), Tr = ramp(it.trim), th = it.thick ?? 0.55;
  const S: Sec[] = ctx.secs.slice(0, 5).map((s) => ({ ...s, a: s.a + th, d: s.d + th * 0.9 }));
  S[0] = { ...S[0], h: -1.1 };
  const surf = mkSurf(waist, A, U, F, S), sw = b.shW;
  const fF = facing(F);
  push({ g: "a_cuir", ramp: P, o: { dome: 3, amp: 1.7, bias: 0.15, kant: true }, layer: 3.76, m: (z) => loft(z, waist, A, U, F, S) });
  // пластины пресса и спины
  if (fF > -0.25) push({ g: "a_cuir", ramp: P, o: { dome: 1, bias: -1.4 }, layer: 3.761, m: (z) => { for (const h of [c * 0.02, c * 0.17]) chain(ctx, z, [-0.8, -0.4, 0, 0.4, 0.8].map((a) => surf(a * sw * 0.86, h, 1, 0.2)), 0.85); } });
  if (fF < 0.25) push({ g: "a_cuir", ramp: P, o: { dome: 1, bias: -1.3 }, layer: 3.761, m: (z) => { for (const h of [c * 0.12, c * 0.4]) chain(ctx, z, [-0.8, -0.4, 0, 0.4, 0.8].map((a) => surf(a * sw * 0.86, h, -1, 0.2)), 0.85); } });
  // грудная пластина (акцент) и инкрустация
  if (it.chestPlate && fF > -0.2) {
    const pl = [surf(-sw * 0.95, c * 0.97), surf(sw * 0.95, c * 0.97), surf(sw * 0.66, c * 0.6), surf(sw * 0.22, c * 0.36), surf(0, c * 0.2), surf(-sw * 0.22, c * 0.36), surf(-sw * 0.66, c * 0.6)];
    push({ g: "a_plate", ramp: Ac, o: { dome: 2, amp: 1.8, bias: 0.25, kant: true }, layer: 3.762, m: (z) => z.pg(pl.map((p) => PJ(add(p, mul(F, 0.12))))) });
    if (it.inlay) push({ g: "a_inlay", ramp: Tr, o: { dome: 1, bias: 0.4 }, layer: 3.763, m: (z) => chain(ctx, z, [pl[6], pl[5], pl[4], pl[3], pl[2]].map((p) => add(p, mul(F, 0.2))), 0.95) });
  }
  if (it.chestPlate && fF < 0.2) {
    push({ g: "a_plate", ramp: Ac, o: { dome: 2, bias: -0.1 }, layer: 3.762, m: (z) => z.pg([surf(-sw * 0.62, c * 0.92, -1), surf(sw * 0.62, c * 0.92, -1), surf(sw * 0.3, c * 0.5, -1), surf(0, c * 0.3, -1), surf(-sw * 0.3, c * 0.5, -1)].map(PJ)) });
    push({ g: "a_plate", ramp: Ac, o: { dome: 1, bias: 1.0 }, layer: 3.763, m: (z) => z.seg(PJ(surf(0, c * 0.9, -1, 0.3)), PJ(surf(0, c * 0.34, -1, 0.3)), 0.8) });
  }
  if (fF > -0.2) push({ g: "a_plate", ramp: it.chestPlate ? Ac : P, o: { dome: 1, bias: 2.2 }, layer: 3.7625, m: (z) => z.seg(PJ(surf(-sw * 0.82, c * 0.9, 1, 0.3)), PJ(surf(-sw * 0.4, c * 0.66, 1, 0.3)), 0.8) });
  if (it.inlay && fF > 0.3) {
    // филигрань: завитки по бокам груди и самоцвет на горжете
    push({ g: "a_fil", ramp: Tr, o: { dome: 1, bias: 0.6 }, layer: 3.7632, m: (z) => { for (const sg of [-1, 1]) z.bz(PJ(add(surf(sg * sw * 0.72, c * 0.86), mul(F, 0.25))), PJ(add(surf(sg * sw * 0.42, c * 1.02), mul(F, 0.25))), PJ(add(surf(sg * sw * 0.3, c * 0.74), mul(F, 0.25))), 0.75, 0.6); } });
    push({ g: "a_riv", ramp: Tr, o: { dome: 1, bias: 1.2 }, layer: 3.7633, m: (z) => { for (const sg of [-1, 1]) z.dot(PJ(add(surf(sg * sw * 0.8, c * 0.66), mul(F, 0.25))), 0.5); } });
  }
  if (it.rivets && !it.inlay && fF > 0.3) push({ g: "a_riv", ramp: Tr, o: { dome: 1, bias: 1.2 }, layer: 3.7633, m: (z) => { for (const sg of [-1, 1]) for (const h of [0.9, 0.5]) z.dot(PJ(add(surf(sg * sw * 0.78, c * h), mul(F, 0.25))), 0.5); } });
  if (it.inlay && fF > 0.25) push({ g: "a_gem", ramp: ramp(it.gemColor ?? "eye_glow"), o: { dome: 1, bias: it.gemColor ? 0.7 : 0.4 }, layer: 3.825, emis: !it.gemColor, m: (z) => z.dot(PJ(add(surf(0, c + 0.2), mul(F, 0.9))), 1.0) });
  if (it.cracks) {
    // светящиеся прожилки-трещины: днём тёмно-алые, ночью светятся (emisColor)
    const CR = ramp(it.cracks), glowC = hx("#ff9a5a");
    const lines = (sd: number): [number, number][][] => sd > 0 ? [[[-0.62, 0.92], [-0.48, 0.72], [-0.58, 0.5], [-0.42, 0.3], [-0.5, 0.12]], [[0.62, 0.92], [0.5, 0.74], [0.6, 0.52], [0.44, 0.32]], [[0.08, 0.16], [-0.04, 0.02], [0.06, -0.1]]] : [[[-0.5, 0.95], [-0.3, 0.7], [-0.45, 0.45], [-0.25, 0.2]], [[0.5, 0.95], [0.32, 0.72], [0.46, 0.48]]];
    for (const sd of [1, -1]) {
      if (sd * fF < -0.2) continue;
      push({ g: "a_crack", ramp: CR, o: { dome: 1, bias: 0.4 }, layer: 3.7634, emis: true, emisColor: glowC, m: (z) => { for (const ln of lines(sd)) chain(ctx, z, ln.map(([a, h]) => add(surf(a * sw, h * c, sd), mul(F, sd * 0.3))), 0.7); } });
    }
  }
  if (it.crest && fF > 0.3) crestParts(ctx, add(surf(0, c * 0.4), mul(F, 0.35)), A, U, 1.5, 3.7655, crest);
  // боковые ремни кирасы с пряжками (все латы) и гравировка нагрудника (эпик и выше)
  for (const sg of [-1, 1]) {
    if (sg * facing(A) < -0.3 && Math.abs(fF) > 0.3) continue;
    push({ g: "a_sstrap", ramp: ramp("leather_dark"), o: { dome: 1, bias: 0.4 }, layer: 3.7636, m: (z) => { for (const h of [c * 0.3, c * 0.62]) z.seg(PJ(surf(sg * sw * 0.98, h, 1, 0.25)), PJ(surf(sg * sw * 0.98, h, -1, 0.25)), 0.9); } });
    if (fF > 0.2) push({ g: "a_sbuck", ramp: ramp(it.chestPlate || it.rivets ? (it.trim === "leather" ? "brass" : it.trim) : "iron"), o: { dome: 1, bias: 1.0 }, layer: 3.7637, m: (z) => { for (const h of [c * 0.3, c * 0.62]) z.dot(PJ(surf(sg * sw * 0.9, h, 1, 0.35)), 0.6); } });
  }
  if (it.inlay && it.chestPlate && fF > 0.3) push({ g: "a_engr", ramp: Ac, o: { dome: 1, bias: -1.2 }, layer: 3.7626, m: (z) => { for (const sg of [-1, 1]) z.bz(PJ(add(surf(sg * sw * 0.7, c * 0.92), mul(F, 0.2))), PJ(add(surf(sg * sw * 0.35, c * 0.8), mul(F, 0.2))), PJ(add(surf(sg * sw * 0.45, c * 0.62), mul(F, 0.2))), 0.6, 0.6); } });
  // горжет
  const nt = b.neckT;
  push({ g: "a_gorget", ramp: it.chestPlate ? Ac : P, o: { dome: 2, bias: 0.1 }, layer: 3.82, m: (z) => loft(z, waist, A, U, F, [{ h: c - 0.5, a: nt * 0.8 + 1.0, d: nt * 0.6 + 0.9, f: 0.1 }, { h: c + 0.75, a: nt * 0.7 + 0.75, d: nt * 0.55 + 0.7, f: 0.1 }]) });
  // пояс
  push({ g: "a_belt", ramp: it.chestPlate ? P : it.rivets ? ramp("leather") : Tr, o: { dome: 1, bias: -0.2 }, layer: 3.765, m: (z) => loft(z, waist, A, U, F, [{ h: -1.15, a: b.waist + th + 0.3, d: dW + th + 0.3, f: 0 }, { h: -0.25, a: b.waist + th + 0.25, d: dW + th + 0.25, f: 0 }]) });
  if (fF > 0.25) push({ g: "a_buckle", ramp: it.chestPlate || it.rivets ? Tr : ramp("iron"), o: { dome: 1, bias: 0.4 }, layer: 3.766, m: (z) => z.dot(PJ(add(surf(0, -0.7), mul(F, th * 0.5 + 0.3))), 1.0) });
  // набедренная юбка (фолды) на тазе
  const hp = sk.hip, Ap = sk.Ap, Up = sk.Up, Fp = sk.Fp;
  const Ml = ramp(it.mail ?? "mail");
  push({ g: "a_mail", ramp: Ml, o: { dome: 2, bias: -0.2, dith: 0.55 }, layer: 3.7545, m: (z) => loft(z, hp, Ap, Up, Fp, [{ h: -3.3, a: b.hipW + th * 0.4 + 0.35, d: dW * 1.0 + th * 0.4 + 0.3, f: 0 }, { h: -1.8, a: b.hipW + th + 0.6, d: dW * 1.05 + th + 0.5, f: 0 }]) });
  push({ g: "a_fauld", ramp: P, o: { dome: 2, bias: -0.1 }, layer: 3.755, m: (z) => loft(z, hp, Ap, Up, Fp, [{ h: -2.3, a: b.hipW + th + 0.85, d: dW * 1.05 + th + 0.7, f: 0 }, { h: b.pelvis, a: b.waist + th + 0.2, d: dW + th + 0.2, f: 0 }]) });
  push({ g: "a_fauld", ramp: P, o: { dome: 1, bias: -1.4 }, layer: 3.7551, m: (z) => { const sf = mkSurf(hp, Ap, Up, Fp, [{ h: -2.3, a: b.hipW + th + 0.85, d: dW * 1.05 + th + 0.7, f: 0 }, { h: b.pelvis, a: b.waist + th + 0.2, d: dW + th + 0.2, f: 0 }]); const sd = facing(Fp) >= 0 ? 1 : -1; chain(ctx, z, [-0.85, -0.4, 0, 0.4, 0.85].map((a) => sf(a * (b.hipW + 0.4), -0.9, sd, 0.2)), 0.8); } });
  // ноги: набедренники и тассеты
  for (const s of ["L", "R"] as const) {
    const H0 = s === "L" ? sk.hipL : sk.hipR, K = s === "L" ? sk.kneeL : sk.kneeR, lg = ctx.leg[s], L = lg.L0 + lg.sub0;
    push({ g: "a_cuisse" + s, ramp: P, o: { dome: 2, bias: lg.far + 0.1, kant: true }, layer: L + 0.00005, m: (z) => z.seg(PJ(lerp(H0, K, 0.1)), PJ(lerp(H0, K, 0.92)), b.thighT + 0.55, b.thighT * 0.86 + 0.45) });
    push({ g: "a_cuisse" + s, ramp: P, o: { dome: 1, bias: lg.far + 2.0 }, layer: L + 0.00006, m: (z) => hiSeg(ctx, z, lerp(H0, K, 0.35), lerp(H0, K, 0.85), 0.7, b.thighT * 0.32) });
    const Ts = ramp(it.tassets);
    // тассеты: две внахлёст пластины с кромкой-бликом и тенью снизу
    for (const [j, a0, a1, w0] of [[0, 0.0, 0.36, 1.6], [1, 0.3, 0.66, 1.25]] as [number, number, number, number][]) {
      const t0 = add(lerp(H0, K, a0), mul(Fp, 0.55 + 0.1 * j)), t1 = add(lerp(H0, K, a1), mul(Fp, 0.65 + 0.1 * j));
      push({ g: "a_tas" + s + j, ramp: Ts, o: { dome: 2, amp: 1.9, bias: lg.far + 0.3 - 0.15 * j, kant: true }, layer: L + 0.0008 + 0.00002 * j, m: (z) => z.seg(PJ(t0), PJ(t1), b.thighT + w0, b.thighT + w0 - 0.3) });
      push({ g: "a_tas" + s + j, ramp: Ts, o: { dome: 1, bias: lg.far + 2.0 }, layer: L + 0.00081 + 0.00002 * j, m: (z) => { const q = mul(sk.Ap, (b.thighT + w0) * 0.42); z.seg(PJ(sub(t0, q)), PJ(add(t0, q)), 0.7); } });
    }
  }
  // руки: наплечная часть рукава и налокотник
  for (const s of ["L", "R"] as const) {
    const Sh = s === "L" ? sk.shL : sk.shR, E = s === "L" ? sk.elL : sk.elR, ar = ctx.arm[s];
    push({ g: "a_mailA" + s, ramp: Ml, o: { dome: 2, bias: ar.far - 0.1, dith: 0.55 }, layer: ar.L0 + 0.004, m: (z) => { z.seg(PJ(Sh), PJ(lerp(Sh, E, 0.4)), b.armT + 0.45, b.armT + 0.35); z.dot(PJ(E), b.foreT * 0.5 + 0.55); } });
    push({ g: "a_arm" + s, ramp: P, o: { dome: 2, amp: 1.9, bias: ar.far + 0.15, kant: true }, layer: ar.L0 + 0.005, m: (z) => z.seg(PJ(lerp(Sh, E, 0.32)), PJ(lerp(Sh, E, 0.86)), b.armT + 0.75, b.armT + 0.5) });
    push({ g: "a_elb" + s, ramp: it.chestPlate ? Ac : P, o: { dome: 2, bias: ar.far + 0.35, kant: true }, layer: ar.L0 + 0.027, m: (z) => z.dot(PJ(E), b.foreT * 0.5 + 0.75) });
    if (it.spikes) { const sg = s === "L" ? 1 : -1, ad = nrm(sub(E, Sh)); hook(ctx, { g: "a_elbS" + s, layer: ar.L0 + 0.0275, far: ar.far }, E, sum(E, mul(ad, -1.4), mul(A, sg * 2.4), mul(F, -0.8)), 0.85, 0.25 * sg, ramp(it.spike ?? it.plate)); }
  }
  // табард спереди и сзади (рваная ткань)
  if (it.tabard) {
    const cloth = ramp(it.cloth), ky = (sk.kneeL[1] + sk.kneeR[1]) / 2;
    for (const sd of [1, -1]) {
      if (sd * fF < -0.3) continue;
      const top = add(add(waist, mul(U, -1.0)), mul(F, sd * (dW + th + 0.45)));
      const wv = mul(A, 1.7), bot = (x: number, d: number): V3 => [top[0] + x, ky + 2.2 - d, top[2] + sd * 0.6];
      const pts: V3[] = it.cracks ? [add(top, wv), bot(1.9, 0.6), bot(1.1, -0.6), bot(0.4, 0.8), bot(-0.4, -0.4), bot(-1.2, 0.9), bot(-1.9, 0.1), sub(top, wv)] : [add(top, wv), bot(1.8, 0), bot(-1.8, 0), sub(top, wv)];
      push({ g: "a_tabard", ramp: cloth, o: { dome: 2, bias: -0.1 }, layer: sd > 0 ? 3.95 : 3.0, m: (z) => z.pg(pts.map(PJ)) });
      push({ g: "a_tabard", ramp: cloth, o: { dome: 1, bias: -1.3 }, layer: (sd > 0 ? 3.95 : 3.0) + 0.001, m: (z) => z.seg(PJ(add(top, mul(U, -0.8))), PJ(bot(0.1, 1.6)), 0.7) });
      if (!it.cracks && it.trim !== it.plate) push({ g: "a_tabH", ramp: Tr, o: { dome: 1, bias: 0.5 }, layer: (sd > 0 ? 3.95 : 3.0) + 0.002, m: (z) => z.seg(PJ(bot(1.8, 0.3)), PJ(bot(-1.8, 0.3)), 0.8) });
    }
  }
}

// =============== НАПЛЕЧНИКИ ===============
function pauldrons(ctx: GearCtx, it: any) {
  const { sk, PJ, push } = ctx, { A, U, F } = sk;
  const P = ramp(it.plate), Ac = ramp(it.accent), Tr = ramp(it.trim), sz = it.size ?? 1;
  for (const s of ["L", "R"] as const) {
    const sg = s === "L" ? 1 : -1, Sh = s === "L" ? sk.shL : sk.shR, E = s === "L" ? sk.elL : sk.elR, ar = ctx.arm[s];
    // вбок ближний наплечник ближе к камере, чем голова, — поверх неё
    // наплечник — на плече, а не на кисти: вниз/вверх всегда поверх корпуса; вбок ближний поверх головы, дальний за телом
    const L = ctx.v === "side" ? (ar.L0 >= 5 && ar.far === 0 ? 6.4 : 1.22) : 5.22;
    const ad = nrm(sub(E, Sh)), out = nrm(add(mul(A, sg), mul(U, 0.35)));
    const C0 = sum(Sh, mul(A, sg * 1.05 * sz), mul(U, (ctx.v === "side" ? 0.35 : 0.75) * sz));
    const e2 = nrm(add(mul(ad, -1), mul(U, 0.3))); // «вверх» купола — против руки
    const keep = (q: V3) => q[1] > -0.35;
    // ламы под куполом (вниз по руке)
    for (let k = it.lames ?? 1; k >= 1; k--) {
      const ck = add(C0, mul(ad, 1.25 * k * sz));
      push({ g: "p_lame" + s + k, ramp: P, o: { dome: 2, amp: 1.9, bias: ar.far + 0.25 - 0.15 * k, kant: true }, layer: L + 0.001 * (3 - k), m: (z) => z.hull(ellPts(ck, mul(A, sg), e2, F, [2.45 * sz - 0.25 * k, 1.4 * sz, 2.35 * sz - 0.25 * k], keep).map(PJ)) });
    }
    // тёмная кромка вокруг купола — отделяет наплечник от кирасы и клинка
    push({ g: "p_rim" + s, ramp: RIM, o: { dome: 1, bias: 0.3 }, layer: L + 0.0035, m: (z) => z.hull(ellPts(C0, mul(A, sg), e2, F, [2.55 * sz + 0.55, 2.2 * sz + 0.5, 2.5 * sz + 0.55], (q) => q[1] > -0.75).map(PJ)) });
    // купол
    push({ g: "p_dome" + s, ramp: Ac, o: { dome: 3, amp: 1.9, bias: ar.far + 0.25, kant: true }, layer: L + 0.004, m: (z) => z.hull(ellPts(C0, mul(A, sg), e2, F, [2.55 * sz, 2.2 * sz, 2.5 * sz], (q) => q[1] > -0.75).map(PJ)) });
    push({ g: "p_dome" + s, ramp: Ac, o: { dome: 1, bias: 2.4 }, layer: L + 0.0041, m: (z) => { const c2 = PJ(add(C0, mul(e2, 1.1 * sz))), lf = lx(ctx); z.seg([c2[0] - 1.6 * sz * lf, c2[1] - 0.2], [c2[0] - 0.4 * sz * lf, c2[1] - 0.9 * sz], 0.75); } });
    // кромка (инкрустация) по низу купола
    push({ g: "p_trim" + s, ramp: Tr, o: { dome: 1, bias: ar.far + 0.3 }, layer: L + 0.005, m: (z) => { const rim: V3[] = []; for (let j = 0; j <= 8; j++) { const ph = Math.PI * (0.5 + 0.45 * (j / 8)); rim.push(sum(C0, mul(A, sg * -Math.cos(ph) * 2.5 * sz), mul(e2, -1.2 * sz), mul(F, Math.sin(ph) * 2.3 * sz * (ctx.v === "up" ? -1 : 1)))); } chain(ctx, z, rim, 0.8); } });
    if (it.spikes || it.rivets || it.filigree || it.gem) {
      if (it.spikes || it.rivets) push({ g: "p_riv" + s, ramp: Tr, o: { dome: 1, bias: 1.2 }, layer: L + 0.0052, m: (z) => { for (const j of [0.58, 0.75, 0.92]) { const ph = Math.PI * j; z.dot(PJ(sum(C0, mul(A, sg * -Math.cos(ph) * 2.5 * sz), mul(e2, -1.2 * sz), mul(F, Math.sin(ph) * 2.3 * sz * (ctx.v === "up" ? -1 : 1)))), 0.5); } } });
      if (it.spikes || it.filigree) push({ g: "p_fil" + s, ramp: Tr, o: { dome: 1, bias: 0.5 }, layer: L + 0.0051, m: (z) => { const a = PJ(add(C0, mul(e2, 1.7 * sz))), b2 = PJ(sum(C0, mul(A, sg * 1.6 * sz), mul(e2, 0.4 * sz))); z.bz(a, [(a[0] + b2[0]) / 2 + sg * 0.6, (a[1] + b2[1]) / 2 - 0.4], b2, 0.6, 0.6); } });
      if (it.spikes || it.gem) push({ g: "p_gem" + s, ramp: ramp(it.gem ?? "eye_glow"), o: { dome: 1, bias: it.gem ? 0.7 : 0.4 }, layer: L + 0.0053, emis: !it.gem, m: (z) => z.dot(PJ(sum(C0, mul(e2, 0.9 * sz), mul(A, sg * 0.9 * sz), mul(F, ctx.v === "up" ? -1.2 : 1.2))), 0.95) });
    }
    if (it.cracks) push({ g: "p_crack" + s, ramp: ramp(it.cracks), o: { dome: 1, bias: 0.4 }, layer: L + 0.0045, emis: true, emisColor: hx("#ff9a5a"), m: (z) => { const fz = ctx.v === "up" ? -1 : 1; const pts = (u0: number, v0: number) => PJ(sum(C0, mul(A, sg * u0 * 2.4 * sz), mul(e2, v0 * 2.0 * sz), mul(F, fz * Math.sqrt(Math.max(0, 1 - u0 * u0 - v0 * v0)) * 2.4 * sz))); z.seg(pts(0.15, 0.75), pts(0.35, 0.45), 0.65); z.seg(pts(0.35, 0.45), pts(0.25, 0.15), 0.65); z.seg(pts(0.55, 0.6), pts(0.7, 0.3), 0.65); } });
    // шипы
    const sp: [V3, number][] = [[nrm(sum(mul(U, 1), mul(A, sg * 0.85))), 5.6], [nrm(sum(mul(U, 0.15), mul(A, sg * 1.0), mul(F, 0.1))), 4.8], [nrm(sum(mul(U, 0.9), mul(A, sg * 0.3), mul(F, -0.7))), 4.2]];
    sp.slice(0, it.spikes ?? 0).forEach(([d, l], k) => {
      const base = add(C0, mul(d, 1.7 * sz)), tip = add(C0, mul(d, 1.7 * sz + l * (it.spikeScale ?? 1)));
      hook(ctx, { g: "p_spike" + s + k, layer: L + 0.0039 - 0.0001 * k, far: ar.far }, base, tip, 1.0 * sz * (it.spikeScale ? 0.75 : 1), 0.2 * sg * (ctx.v === "up" ? -1 : 1), ramp(it.spike ?? it.plate));
    });
  }
}

// =============== ПЕРЧАТКИ ===============
function gloves(ctx: GearCtx, it: any) {
  const { sk, b, PJ, push } = ctx, { A } = sk;
  const P = ramp(it.plate), Ac = ramp(it.accent);
  for (const s of ["L", "R"] as const) {
    const sg = s === "L" ? 1 : -1, E = s === "L" ? sk.elL : sk.elR, Hd = s === "L" ? sk.hdL : sk.hdR, ar = ctx.arm[s];
    const dir = nrm(sub(Hd, E));
    push({ g: "gl_v" + s, ramp: P, o: { dome: 2, bias: ar.far + 0.1, kant: true }, layer: ar.L0 + 0.025, m: (z) => z.seg(PJ(lerp(E, Hd, 0.22)), PJ(lerp(E, Hd, 0.95)), b.foreT + 0.75, b.foreT * 0.82 + 0.55) });
    if (it.cuff) push({ g: "gl_c" + s, ramp: Ac, o: { dome: 2, amp: 1.8, bias: ar.far + 0.2, kant: true }, layer: ar.L0 + 0.026, m: (z) => z.seg(PJ(lerp(E, Hd, 0.18)), PJ(lerp(E, Hd, 0.48)), b.foreT + 1.7, b.foreT + 0.8) });
    if (it.cuffSpike) hook(ctx, { g: "gl_s" + s, layer: ar.L0 + 0.0265, far: ar.far }, lerp(E, Hd, 0.4), sum(lerp(E, Hd, 0.4), mul(A, sg * 2.2), mul(dir, -1.8), [0, -0.5, 0]), 0.85, 0.25 * sg, ramp(it.spike ?? it.plate));
    if (false) push({ g: "gl_s" + s, ramp: P, o: { dome: 1, bias: ar.far + 0.5 }, layer: ar.L0 + 0.0255, m: (z) => { const bs = lerp(E, Hd, 0.3); spike(ctx, z, bs, sum(bs, mul(A, sg * 1.6), mul(dir, -1.3), [0, -0.6, 0]), 0.75); } });
    if (it.gem && it.cuff) push({ g: "gl_g" + s, ramp: ramp(it.gem), o: { dome: 1, bias: 0.7 }, layer: ar.L0 + 0.0262, m: (z) => z.dot(PJ(lerp(E, Hd, 0.32)), 0.6) });
    push({ g: "gl_h" + s, ramp: P, o: { dome: 2, bias: ar.far + 0.35, kant: true }, layer: ar.L0 + 0.31, m: (z) => z.seg(PJ(add(Hd, mul(dir, -0.2))), PJ(add(Hd, mul(dir, b.handR * 0.95))), b.handR * 1.9 + 0.55, b.handR * 1.6 + 0.4) });
  }
}

// =============== САПОГИ ===============
function boots(ctx: GearCtx, it: any) {
  const { sk, b, PJ, push, facing } = ctx;
  const P = ramp(it.plate), Ac = ramp(it.accent);
  for (const s of ["L", "R"] as const) {
    const K = s === "L" ? sk.kneeL : sk.kneeR, An = s === "L" ? sk.ankL : sk.ankR, Ft = s === "L" ? sk.footL : sk.footR, lg = ctx.leg[s], L = lg.L0 + lg.sub0;
    const fwd: V3 = nrm([sk.Fp[0], 0, sk.Fp[2]]);
    push({ g: "b_gr" + s, ramp: P, o: { dome: 2, bias: lg.far + 0.05, kant: true }, layer: L + 0.0005, m: (z) => z.seg(PJ(lerp(K, An, 0.1)), PJ(An), b.shinT * 1.08 + 0.75, b.shinT * 0.98 + 0.6) });
    push({ g: "b_gr" + s, ramp: P, o: { dome: 1, bias: lg.far + 0.9 }, layer: L + 0.00051, m: (z) => z.seg(PJ(lerp(K, An, 0.12)), PJ(lerp(K, An, 0.2)), b.shinT * 1.2 + 1.0) });
    push({ g: "b_gr" + s, ramp: P, o: { dome: 1, bias: lg.far + 2.1 }, layer: L + 0.00052, m: (z) => hiSeg(ctx, z, lerp(K, An, 0.25), lerp(K, An, 0.85), 0.7, b.shinT * 0.38) });
    const toe = add(Ft[1], mul(nrm(sub(Ft[1], Ft[0])), 0.5));
    push({ g: "b_ft" + s, ramp: P, o: { dome: 2, amp: 1.9, bias: lg.far + 0.45, kant: true }, layer: L + 0.0006, m: (z) => z.seg(PJ(Ft[0]), PJ(toe), b.shinT * 1.1 + 0.6, b.shinT * 0.9 + 0.15) });
    if (it.stitch) push({ g: "b_stitch" + s, ramp: ramp(it.stitch), o: { dome: 1, bias: 0.6 }, layer: L + 0.000535, m: (z) => { const o = mul(sk.Ap, (s === "L" ? 1 : -1) * (b.shinT * 0.5 + 0.2)); for (let k = 0; k < 4; k++) { const t0 = 0.2 + k * 0.17; z.seg(PJ(add(lerp(K, An, t0), o)), PJ(add(lerp(K, An, t0 + 0.08), o)), 0.6); } } });
    if (it.stripe && facing(sk.Fp) > -0.2) push({ g: "b_st" + s, ramp: Ac, o: { dome: 1, bias: lg.far + 0.55 }, layer: L + 0.00055, m: (z) => z.seg(PJ(add(lerp(K, An, 0.22), mul(fwd, b.shinT * 0.5 + 0.35))), PJ(add(lerp(K, An, 0.85), mul(fwd, b.shinT * 0.45 + 0.35))), 1.5) });
    if (it.stripe) push({ g: "b_strap" + s, ramp: ramp("grip"), o: { dome: 1, bias: 0.4 }, layer: L + 0.00056, m: (z) => { const m = lerp(K, An, 0.6), q = mul(sk.Ap, b.shinT * 0.62 + 0.4); z.seg(PJ(sub(m, q)), PJ(add(m, q)), 1.3); } });
    if (it.stripe && facing(sk.Fp) > -0.2) push({ g: "b_buck" + s, ramp: ramp(it.strapAccent ?? "gold"), o: { dome: 1, bias: 1.0 }, layer: L + 0.00057, m: (z) => z.dot(PJ(add(lerp(K, An, 0.6), mul(fwd, b.shinT * 0.5 + 0.4))), 0.95) });
    push({ g: "b_kn" + s, ramp: it.kneeAccent ? ramp(it.kneeAccent) : it.kneeSpike ? Ac : P, o: { dome: 2, amp: 1.8, bias: lg.far + 0.35, kant: true }, layer: L + 0.00065, m: (z) => z.dot(PJ(add(K, mul(fwd, 0.55))), b.thighT * 0.5 + 0.35) });
    if (it.kneeSpike) hook(ctx, { g: "b_ks" + s, layer: L + 0.00066, far: lg.far }, add(K, mul(fwd, 0.9)), sum(K, mul(fwd, 3.4), [0, -1.9, 0]), 0.9, -0.2, ramp(it.spike ?? it.plate));
  }
}

// =============== СПИНА (плащ, знамя, щит, мечи, ореол) ===============
/** Общая точка крепления слота «Спина»: кадр торса у лопаток и слой по направлению (data/gear147.json → back.layer). */
export function backMount(ctx: { sk: Sk; b: Build; v: View }) {
  const { sk, b } = ctx, dS = b.shW * 0.46;
  const L = GD.back.layer[ctx.v === "side" ? "side" : ctx.v];
  return { o: sum(sk.chest, mul(sk.U, -0.4), mul(sk.F, -(dS + 0.9))), A: sk.A, U: sk.U, F: sk.F, layer: L as number, head: sk.head };
}
const swingOf = (anim: AnimId, u: number): number => {
  const s = Math.sin;
  switch (anim) {
    case "idle": return 0.5 + 0.35 * s(2 * Math.PI * u);
    case "walk": return 1.9 + 0.6 * s(4 * Math.PI * u);
    case "run": return 4.2 + 0.8 * s(4 * Math.PI * u);
    case "atk2h": case "atk1h": { const k = [[0, 0.9], [0.35, 0.3], [0.55, 3.4], [0.75, 2.6], [1, 0.9]]; let i = 0; while (i < k.length - 2 && u > k[i + 1][0]) i++; const t = cl((u - k[i][0]) / (k[i + 1][0] - k[i][0])), e = t * t * (3 - 2 * t); return k[i][1] + (k[i + 1][1] - k[i][1]) * e; }
    case "hurt": return 0.8 + 1.8 * s(Math.PI * cl(u / 0.6));
    case "ride": return 2.6 + 0.5 * s(4 * Math.PI * u);
    default: return 0.9;
  }
};
function back(ctx: GearCtx, it: any, crest: CrestId) {
  if (it.kind === "cape") return cape(ctx, it, crest);
  if (it.kind === "scarf") return scarf(ctx, it);
  throw new Error("вид спины пока без шаблона: " + it.kind);
}
function cape(ctx: GearCtx, it: any, crest: CrestId) {
  const { sk, b, PJ, push, v, anim, u } = ctx, M = backMount(ctx);
  const sx = b.shW - b.armT * 0.3, dW = b.waist * 0.62, sw = swingOf(anim, u);
  const outer = ramp(it.outer), lin = ramp(it.lining), Tr = it.trim ? ramp(it.trim) : null;
  const N = 9, tat = [1.2, 3.6, 0.4, 4.6, 1.4, 3.4, 0.0, 5.0, 2.2].map((x) => x * (it.tatter ?? 1));
  const flutter = anim === "walk" || anim === "run" || anim === "ride" ? 1 : anim === "idle" ? 0.35 : 0.6;
  const top: V3[] = [], mid: V3[] = [], bot: V3[] = [];
  for (let k = 0; k < N; k++) {
    const t = (k / (N - 1)) * 2 - 1;
    top.push(add(M.o, mul(M.A, t * sx * 0.82)));
    const fl = flutter * 0.6 * Math.sin(2 * Math.PI * (u * 2 + k * 0.29)), bill = 0.5 + 0.5 * t; // правый край (герой) парусит сильнее
    mid.push(sum(sk.waist, mul(sk.Ap, t * sx * 1.2), mul(sk.Fp, -(dW + 2.1 + sw * (0.3 + 0.25 * bill)))));
    bot.push([sk.hip[0] + t * sx * 1.6 + fl * 0.4 + sw * 0.25 * bill, FY - 1.6 - tat[k] + Math.abs(fl) * 0.4 - (anim === "death" ? 4.8 * cl((u - 0.3) / 0.4) : 0), sk.hip[2] - (dW + 3.6 + sw * (0.7 + 0.6 * bill) + fl)]);
  }
  const ramp0 = v === "down" ? lin : outer, L = M.layer;
  for (let k = 0; k + 1 < N; k++) {
    const tooth: V3 = add(lerp(bot[k], bot[k + 1], 0.5), [0, (1.6 + 0.9 * hash(k, 3)) * (it.tatter ?? 1), -0.2]);
    const poly = [top[k], top[k + 1], mid[k + 1], bot[k + 1], tooth, bot[k], mid[k]].map(PJ);
    push({ g: "cape", ramp: ramp0, o: { dome: 2, amp: 1.4, bias: (k % 2 ? -0.45 : 0.35) + (v === "down" ? -0.2 : 0) }, layer: L + k * 0.00001, m: (z) => z.pg(poly) });
  }
  // складки
  push({ g: "cape", ramp: ramp0, o: { dome: 1, bias: -1.4 }, layer: L + 0.0002, m: (z) => { for (const k of [2, 4, 6]) z.bz(PJ(lerp(top[k], mid[k], 0.35)), PJ(mid[k]), PJ(lerp(mid[k], bot[k], 0.8)), 0.6, 0.85); } });
  if (v !== "down") {
    // воротник и кайма
    push({ g: "cape_col", ramp: outer, o: { dome: 2, bias: -0.2 }, layer: L + 0.0003, m: (z) => chain(ctx, z, top, 1.5) });
    // кайма по краям
    push({ g: "cape_hem", ramp: ramp(it.hem ?? it.outer), o: { dome: 1, bias: 0.9 }, layer: L + 0.00035, m: (z) => { chain(ctx, z, [top[0], mid[0], lerp(mid[0], bot[0], 0.75)], 0.7); chain(ctx, z, [top[N - 1], mid[N - 1], lerp(mid[N - 1], bot[N - 1], 0.75)], 0.7); } });
    // застёжки у плеч
    if (Tr) push({ g: "cape_trim", ramp: Tr, o: { dome: 1, bias: 0.4 }, layer: L + 0.0004, m: (z) => { z.dot(PJ(top[1]), 0.9); z.dot(PJ(top[N - 2]), 0.9); } });
    if (it.crest && v === "up") crestParts(ctx, sum(lerp(top[4], mid[4], 0.92), mul(sk.F, -0.2)), sk.A, sk.U, 2.5, L + 0.0005, crest);
  }
}

// =============== ОРУЖИЕ ===============
/** Где оружие в кадре: в руке (поза), за спиной (крепление «Спина») или выпало при гибели (в мире, без поворота тела). Общая для рендера и data/hero-skeleton-b.json. */
export function weaponPlace(k: { sk: Sk; b: Build; v: View; anim: AnimId; u: number; P: Pose }): { mode: "hand" | "back" | "drop"; Hd: V3; d: V3; world: boolean } {
  const { sk, v, anim, u, P } = k;
  if (P.weapon) return { mode: "hand", Hd: sk.hdL, d: nrm(P.weapon.dir), world: false };
  if (anim === "death") {
    const t = cl((u - DROP_U) / 0.32), e = t * t * (3 - 2 * t), side = v === "side";
    const h0: V3 = [4.5, FY - 13, 3.2], h1: V3 = side ? [3, FY - 2.6, 9] : [-3, FY - 2.6, 1.2];
    const d0 = nrm([0.44, -0.86, 0.28]), d1 = nrm(side ? [0.1, 0, -1] : [1, 0, -0.12]);
    const Hd: V3 = [h0[0] + (h1[0] - h0[0]) * e, h0[1] + (h1[1] - h0[1]) * e - 3.5 * Math.sin(Math.PI * t) * (1 - t), h0[2] + (h1[2] - h0[2]) * e];
    return { mode: "drop", Hd, d: nrm(lerp(d0, d1, e)), world: true };
  }
  const M = backMount(k), sx = k.b.shW - k.b.armT * 0.3;
  return { mode: "back", Hd: sum(M.o, mul(M.U, 5.6), mul(M.A, -sx * 1.25), mul(M.F, -0.8)), d: nrm(add(mul(M.A, 1.25), mul(M.U, -1))), world: false };
}
function weapon(ctx: GearCtx, it: any) {
  const { D, v } = ctx, w = weaponPlace(ctx);
  if (w.mode === "hand" && ctx.anim === "special2h") fireTrail(ctx, it, w.Hd);
  if (w.mode === "hand") {
    // вбок рукоять у груди — «за телом», если рука с оружием не ближе к зрителю, чем середина корпуса
    const th = v === "side" ? 0.6 : -1.2, layerAt = (p: V3) => (D(p) < th ? 1.2 : 5.2);
    return drawWeapon(ctx, it, w.Hd, w.d, layerAt(add(w.Hd, mul(w.d, 0.4))), layerAt(add(w.Hd, mul(w.d, 6))), ctx.PJ);
  }
  if (w.mode === "drop") {
    const Dr = (p: V3) => (v === "down" ? p[2] : v === "up" ? -p[2] : ctx.l.mirrorX ? -p[0] : p[0]);
    const L = Dr(add(w.Hd, mul(w.d, 6))) < -1.2 ? 1.2 : 5.2;
    const mx = (p: V3): V3 => (ctx.l.mirrorX ? [-p[0], p[1], p[2]] : p);
    return drawWeapon(ctx, it, w.Hd, w.d, L, L, (p: V3) => proj(mx(p), v));
  }
  const L = backMount(ctx).layer + 0.01;
  return drawWeapon(ctx, it, w.Hd, w.d, L, L, ctx.PJ);
}
/** Огненный след особого удара: дуга, которую конец клинка прошёл за последние кадры; ближняя к зрителю часть — перед телом, дальняя — за ним. */
function fireTrail(ctx: GearCtx, it: any, Hd: V3) {
  const { u, D, PJ, push } = ctx, th1 = spinTheta(u), th0 = spinTheta(Math.max(0, u - 0.16));
  if (u < 0.34 || u > 0.84 || th1 - th0 < 0.5) return; // только сам удар (вперёд по кругу), не замах
  const r = 4.6, R1 = r + 1.7 + (it.length ?? 16) + 0.5, Rm = r + 1.7 + (it.length ?? 16) * 0.72, y = Hd[1];
  const at = (t: number, R: number): V3 => [Math.sin(t) * R, y - 0.1 * (R - r), Math.cos(t) * R];
  const N = 12, fire = ramp(it.blade), glowC = hx("#ffb040");
  for (let j = 0; j < N; j++) {
    const ta = th0 + ((th1 - th0) * j) / N, tb = th0 + ((th1 - th0) * (j + 1)) / N, age = 1 - (j + 0.5) / N; // 0 — свежий край
    const R0 = Rm + (R1 - Rm) * age * 0.75, mid = at((ta + tb) / 2, (R0 + R1) / 2);
    const layer = D(mid) < -1.2 ? 1.25 : 5.25;
    push({ g: "w_trail", ramp: fire, o: { dome: 1, bias: 1.4 - 1.6 * age }, layer: layer + 0.0001 * j, emis: age < 0.7, emisColor: glowC, m: (z) => z.pg([PJ(at(ta, R0)), PJ(at(ta, R1)), PJ(at(tb, R1)), PJ(at(tb, R0))]) });
  }
}
function drawWeapon(ctx: GearCtx, it: any, Hd: V3, d: V3, Lg: number, Lb: number, PJ: (p: V3) => V2) {
  const { push, i } = ctx;
  const bl = it.length ?? 16, W0 = it.width ?? 3, glow = !!it.glow;
  const g0 = add(Hd, mul(d, 1.7)), tip = add(g0, mul(d, bl));
  const a2 = PJ(g0), t2 = PJ(tip), dx = t2[0] - a2[0], dy = t2[1] - a2[1], ln = Math.hypot(dx, dy) || 1;
  const ux = dx / ln, uy = dy / ln, nx = -uy, ny = ux;
  const at = (t: number, w: number): V2 => [a2[0] + dx * t + nx * w, a2[1] + dy * t + ny * w];
  const blade = ramp(it.blade), edge = ramp(it.edge), hilt = ramp(it.hilt), grip = ramp(it.grip), acc = ramp(it.accent);
  // клинок: широкий у гарды, к острию сужается; спинка — зубцы
  const n = it.wavy ? 20 : 10, L: V2[] = [], R: V2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, w = t < 0.8 ? W0 * 0.5 * (1 - 0.3 * t) : W0 * 0.5 * 0.76 * Math.max(0, 1 - (t - 0.8) / 0.2) ** 0.8;
    const wv = (it.wavy && t > 0.08 && t < 0.82 ? 0.45 * Math.sin(t * Math.PI * 8) : 0) + (it.bend ?? 0) * 1.6 * t * t;
    L.push(at(t, w + wv + (it.serrate && k % 2 === 1 && t < 0.85 ? 0.55 : 0))); R.push(at(t, -w + wv));
  }
  const bladePoly = [...L, ...R.reverse()];
  // тёмная обводка клинка: отделяет его от тела и красных лат тоном и контуром
  const rimPoly: V2[] = [], rw = W0 < 3 ? 0.45 : 0.7;
  for (let k = 0; k <= n; k++) { const t = k / n, w = t < 0.8 ? W0 * 0.5 * (1 - 0.3 * t) : W0 * 0.5 * 0.76 * Math.max(0, 1 - (t - 0.8) / 0.2) ** 0.8; rimPoly.push(at(t, w + rw + (it.serrate && k % 2 === 1 && t < 0.85 ? 0.55 : 0))); }
  rimPoly.push(at(1 + 0.8 / Math.max(1, ln), 0));
  for (let k = n; k >= 0; k--) { const t = k / n, w = t < 0.8 ? W0 * 0.5 * (1 - 0.3 * t) : W0 * 0.5 * 0.76 * Math.max(0, 1 - (t - 0.8) / 0.2) ** 0.8; rimPoly.push(at(t, -w - rw)); }
  // обводка — у любого оружия (читается на траве, снегу и на теле)
  push({ g: "w_rim", ramp: RIM, o: { dome: 1, bias: 0.4 }, layer: Lb - 0.0005, m: (z) => z.pg(rimPoly) });
  push({ g: "w_edge", ramp: edge, o: { dome: 1, bias: 0.3 }, layer: Lb, emis: glow, m: (z) => z.pg(bladePoly) });
  push({ g: "w_blade", ramp: blade, o: { dome: 3, amp: 1.2, bias: glow ? 0.2 : 0.75 }, layer: Lb + 0.001, emis: glow, m: (z) => { z.pg(bladePoly); const cx = a2[0] + dx * 0.4, cy = a2[1] + dy * 0.4; z.clip((x, y) => { const px = x - cx, py = y - cy, along = px * ux + py * uy, across = px * nx + py * ny; return Math.abs(across) < W0 * 0.5 * (1 - 0.3 * cl((along + ln * 0.4) / ln)) - 0.45 || along > ln * 0.45; }); } });
  push({ g: "w_blade", ramp: blade, o: { dome: 1, bias: 2.2 }, layer: Lb + 0.002, emis: glow, m: (z) => z.seg(at(0.04, 0), at(0.72, 0), glow ? 0.95 : 0.85) });
  // яркий блик по кромке к свету
  if (!glow) push({ g: "w_blik", ramp: blade, o: { dome: 1, bias: 2.8 }, layer: Lb + 0.0021, m: (z) => z.seg(at(0.06, W0 * 0.32), at(0.6, W0 * 0.22), 0.6) });
  if (glow) {
    if (it.flames) push({ g: "w_fire", ramp: blade, o: { dome: 1, bias: 1.2 }, layer: Lb + 0.004, emis: true, m: (z) => {
      for (let k = 0; k < 3; k++) {
        const t = 0.2 + 0.24 * k + 0.04 * Math.sin(i * 1.7 + k), side = k % 2 ? 1 : -1, l = 0.9 + 1.1 * (0.5 + 0.5 * Math.sin(i * 1.3 + k * 2.1));
        const base = at(t, side * W0 * 0.45), base2 = at(t + 0.07, side * W0 * 0.42);
        const tp: V2 = [base[0] + nx * side * l + ux * 1.4, base[1] + ny * side * l + uy * 1.4];
        z.pg([base, tp, base2]);
      }
    } });
  }
  // гарда, рукоять, навершие
  if (it.rune) push({ g: "w_rune", ramp: ramp(it.rune), o: { dome: 1, bias: 0.6 }, layer: Lb + 0.0025, emis: true, emisColor: hx("#ff5a3a"), m: (z) => z.seg(at(0.08, (it.bend ?? 0) * 0.02), at(0.34, (it.bend ?? 0) * 0.15), 0.6) });
  const gA = at(0, 0), gl = W0 * 0.5 + (it.kind === "dual" ? 1.1 : 2.0);
  const gp = (s: number): [V2, V2, V2] => [at(-0.005, s * 0.6), at(-0.02, s * gl * 0.7), [gA[0] + nx * s * gl + ux * (glow ? 2.0 : 0.4), gA[1] + ny * s * gl + uy * (glow ? 2.0 : 0.4)]];
  // тёмная обводка рукояти, гарды и навершия
  push({ g: "w_hrim", ramp: RIM, o: { dome: 1, bias: 0.4 }, layer: Lg - 0.0005, m: (z) => { const gr0 = it.kind === "great" ? 3.6 : 1.8; z.seg(PJ(add(Hd, mul(d, 1.6))), PJ(add(Hd, mul(d, -gr0))), 2.6); for (const s of [1, -1]) { const [p0, p1, p2] = gp(s); z.bz(p0, p1, p2, 2.9, 1.9); } z.dot(PJ(add(Hd, mul(d, -gr0 - 0.35))), 1.65); } });
  push({ g: "w_guard", ramp: hilt, o: { dome: 1, amp: 1.8, bias: 0.6 }, layer: Lg + 0.01, m: (z) => { for (const s of [1, -1]) { const [p0, p1, p2] = gp(s); z.bz(p0, p1, p2, 1.5, 0.55); } } });
  push({ g: "w_gem", ramp: acc, o: { dome: 2, bias: 0.5 }, layer: Lg + 0.011, emis: glow, m: (z) => z.dot(gA, glow ? 1.0 : 0.75) });
  const gr = it.kind === "great" ? 3.6 : 1.8, pm = add(Hd, mul(d, -gr - 0.35));
  push({ g: "w_grip", ramp: grip, o: { dome: 1, bias: 0.1 }, layer: Lg, m: (z) => z.seg(PJ(add(Hd, mul(d, 1.6))), PJ(add(Hd, mul(d, -gr))), 1.2) });
  push({ g: "w_grip", ramp: grip, o: { dome: 1, bias: -1.2 }, layer: Lg + 0.001, m: (z) => { for (const t of [0.15, 0.45, 0.75]) { const p = PJ(add(Hd, mul(d, 0.8 - t * (gr + 0.8)))); z.dot(p, 0.35); } } });
  push({ g: "w_pommel", ramp: hilt, o: { dome: 1, bias: 0.5 }, layer: Lg + 0.012, m: (z) => { z.dot(PJ(pm), 0.95); if (glow) { const a = PJ(pm), t = PJ(add(pm, mul(d, -1.8))), ex = t[0] - a[0], ey = t[1] - a[1], l = Math.hypot(ex, ey) || 1; z.pg([[a[0] - (ey / l) * 0.7, a[1] + (ex / l) * 0.7], t, [a[0] + (ey / l) * 0.7, a[1] - (ex / l) * 0.7]]); } } });
}

// ---------------- для монтажа ----------------
/** помощники для шаблонов в других модулях (rogue.ts) */
export const H = { hook, hiSeg, chain, mkSurf, lx, ellPts, spike };
export const ITEM_NAMES = (set: SetDef) => SLOTS.filter((s) => set.items[s]).map((s) => ({ slot: s, name: set.items[s].name as string }));
export const ramps = { add, sub, mul, nrm, lerp, sum, v2 };
