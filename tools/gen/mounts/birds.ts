/**
 * Задача 142: крылатые по референсам — белый грифон в броне (13, герб), хрустальный грифон (14), ледяная сова (16).
 * Каркас грифона: передние лапы птичьи, задние львиные, перьевые крылья (kit.featherWing); сова — двуногая, стоит на когтях,
 * крылья сложены, длинный ледяной хвост. Покой: грифоны клюют землю и чистят перья, сова вертит головой и встряхивается.
 * Летающие стоят на земле (fly = 0), в беге — машут крыльями.
 */
import {
  add, mul, norm, lerpV, rotAxis, cross, lerp, TAU, R, M, X, Y, Z,
  GOLD, SILVER, STEEL, IRON, BRONZE, CLAW, FROST, SPIRIT, GEM_AZ,
  featherTex, furTex, shine, rimTex,
  basePose, runPose, ctx, over, near, VB, body, legs4, neck, headAxes, featherWing, embers, done,
  actGraze, actLook, actShake, actTail, bump, win, easeInOut,
  type V3, type Mat, type TexFn, type Pose, type Layout, type Ctx, type Fac, type Frame, type MView, type Built,
} from "./kit";
import { emblem, facKit } from "./kit";
import type { MountSpec } from "./lib";

// ---------------- грифон ----------------
interface GryphonOpt {
  feath: Mat; face: Mat; fur: Mat; cover: Mat; prim: Mat; beak: Mat; scale: Mat; eye: string;
  head?: (c: Ctx, A: ReturnType<typeof headAxes>) => void;
  deco: (c: Ctx, lg: ReturnType<typeof legs4>) => void;
  wingTex?: TexFn;
}
const GL: Layout = { fx: 4.4, hx: 4.8, fy: 12.6, hy: -12.0 };
function gryphonIdle(p: Pose, u: number) {
  // клюёт дважды, чистит правое крыло
  const sp = win(u, 2 / 24, 10 / 24);
  const peck = easeInOut(bump(sp)), tap = sp > 0 && sp < 1 ? Math.max(0, Math.sin(TAU * 2 * sp - 0.3)) * bump(sp) : 0;
  const pr = easeInOut(bump(win(u, 12 / 24, 22 / 24)));
  p.pitch -= 0.1 * peck;
  p.neckP += 1.15 * peck + 0.25 * tap + 0.35 * pr;
  p.neckY += 1.15 * pr;
  p.headP += 0.55 * peck + 0.2 * tap + 0.5 * pr;
  p.headY += 0.35 * pr;
  p.wing[1] = { spread: 0.25 * pr, lift: 0.35 * pr, ruffle: 0.8 * pr };
  p.tailY += 0.45 * Math.sin(TAU * u);
}
function gryphonBuild(o: GryphonOpt, f: Frame, view: MView): Built {
  let p: Pose;
  if (f.anim === "run") {
    p = runPose(f.i / f.n, GL, { stance: 0.44, phase: [0.5, 0.58, 0.0, 0.08], reach: [7.4, 7.0], lift: [5.0, 4.2], fold: [1.4, 1.2], bob: 1.5, pitch: 0.09 });
    const fl = Math.sin(TAU * p.t + 0.6);
    p.wing = [0, 1].map(() => ({ spread: 0.36 + 0.18 * fl, lift: 0.1 + 0.4 * fl, ruffle: 0 }));
    p.neckP = 0.12;
  } else { p = basePose(GL, f.i / f.n, false); gryphonIdle(p, f.i / f.n); }
  const c = ctx(f, view, p, [0, 2, 21]);
  const lg = legs4(c, { L: GL, hipZ: [19.4, 20.2], len: [[9.0, 8.4], [10.6, 8.6]], r: [[3.4, 2.4, 1.2], [3.8, 2.3, 1.8]], foot: ["talon", "paw"], coat: o.fur, lower: o.scale, footMat: CLAW, layers: true });
  // передние бёдра в перьях
  for (let i = 0; i < 2; i++) over(c, VB.down, () => c.sc.cone(c.sc.group(0.8), o.feath, lg[i].hip, 3.6, lerpV(lg[i].hip, lg[i].knee, 0.85), 2.6, { tex: featherTex() }));
  body(c, { z: 21.6, len: 12.6, w: 7.6, h: 6.8, coat: o.fur, tex: furTex(0.12), chest: [10.4, [7.6, 6.6, 7.0]], rumpOver: true });
  over(c, VB.down, () => {
    const gc = c.sc.group(2.4);
    c.sc.ell(gc, o.feath, c.T([0, 10.4, 22.4]), [7.6, 6.6, 7.0], c.ax(X, Y, Z), { tex: featherTex() });
    c.sc.ell(gc, o.face, c.T([0, 15.6, 18.8]), [4.6, 3.0, 4.4], c.ax(X, norm([0, 1, -0.3]), norm([0, 0.3, 1])), { tex: featherTex(-0.6) });
    const N = neck(c, [0, 11.6, 25.4], [0, 5.0, 9.6], [6.4, 4.4], o.feath, featherTex(), 0);
    const A = headAxes(c, N.poll, N.nd, [0, 1, -0.15]);
    const H = A.H, gh = c.sc.group(1.4);
    c.sc.ell(gh, o.feath, H(0.6, 0.8, 0), [4.4, 4.6, 4.4], [A.s, A.w, A.fv], { tex: featherTex() });
    c.sc.ell(gh, o.face, H(3.0, 0.4, 0), [3.6, 1.8, 3.2], [A.s, A.w, A.fv], { tex: featherTex(-0.5) });
    const gk = c.sc.group(0.5);
    c.sc.cone(gk, o.beak, H(4.6, -0.2, 0), 1.75, H(6.8, -0.6, 0), 1.15, { tex: shine });
    c.sc.cone(gk, o.beak, H(6.8, -0.6, 0), 1.15, H(7.6, -2.4, 0), 0.4, { tex: shine });
    c.sc.cone(gk, o.beak, H(5.0, -1.2, 0), 1.2, H(6.4, -1.6, 0), 0.7);
    for (const sx of [-1, 1]) c.sc.stamps.push({ at: H(3.6, 1.3, sx * 2.2), n: norm(add(mul(A.w, 0.8), mul(A.s, sx * 0.6))), colors: { K: [10, 6, 8, 255], A: hexA(o.eye), W: [255, 255, 255, 255] }, px: { down: [[0, 0, "A"], [1, 0, "W"], [0, 1, "A"], [1, 1, "K"]], side: [[0, 0, "A"], [1, 0, "A"], [2, 0, "W"], [0, 1, "A"], [1, 1, "K"], [2, 1, "K"]] }, depthTol: 2.5 });
    o.head?.(c, A);
  });
  for (const sx of [-1, 1]) featherWing(c, sx, { root: [sx * 7.0, 8.0, 26.4], cover: o.cover, prim: o.prim, tex: o.wingTex });
  // хвост льва с кисточкой
  over(c, VB.up, () => {
    let cur = c.T([0, -17.2, 24.6]);
    const pts: V3[] = [cur];
    for (let k = 1; k <= 6; k++) {
      const s = k / 6, sw = Math.sin(p.tailPh - k * 0.7) * (p.run ? 0.6 : 0.35) * s + p.tailY * s;
      cur = add(cur, mul(norm([sw, -1 + (p.run ? 0 : 0.6 * s), p.run ? 0.2 - 0.3 * s : -1.5 + 2.6 * s]), 3.0));
      pts.push(cur);
    }
    const gt = c.sc.group(0.8);
    for (let k = 0; k + 1 < pts.length; k++) c.sc.cone(gt, o.fur, pts[k], lerp(1.7, 1.0, k / 6), pts[k + 1], lerp(1.7, 1.0, (k + 1) / 6), { tex: furTex(0.12) });
    const last = pts[pts.length - 1], dir = norm(add(last, mul(pts[pts.length - 2], -1)));
    c.sc.ell(c.sc.group(0.6), o.feath, add(last, mul(dir, 1.6)), [1.7, 2.8, 1.9], [norm(cross(dir, Z)), dir, norm(cross(norm(cross(dir, Z)), dir))], { tex: featherTex() });
  });
  o.deco(c, lg);
  return done(c, [0, -0.8, 30.2]);
}
const hexA = (h: string): [number, number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
function gryphonSaddle(c: Ctx, strap: Mat, trim: Mat, gem: Mat) {
  const A = c.ax(X, Y, Z), gs = c.sc.group(0.6);
  c.sc.ell(gs, strap, c.T([0, -0.6, 27.6]), [7.4, 7.2, 1.5], A, { tex: (q) => (Math.hypot(q.l[0] / 7.4, q.l[1] / 7.2) > 0.84 ? { mat: trim, d: 0 } : 0) });
  c.sc.ell(gs, trim, c.T([0, -0.8, 29.0]), [4.6, 5.4, 1.4], A, { tex: shine });
  c.sc.box(gs, trim, c.T([0, 4.4, 30.4]), [2.4, 0.9, 1.6], A, 0.6, { tex: shine });
  over(c, VB.up, () => {
    c.sc.box(c.sc.group(0.3), trim, c.T([0, -6.4, 33.0]), [3.0, 0.8, 2.6], c.ax(X, norm([0, 0.94, 0.34]), norm([0, -0.34, 0.94])), 0.6, { tex: rimTex(trim, 0.8) });
    c.sc.ball(c.sc.group(0), gem, c.T([0, -5.6, 33.6]), 0.8);
  });
  for (const sx of [-1, 1]) over(c, near(sx), () => {
    c.sc.cone(c.sc.group(0), strap, c.T([sx * 7.4, 0, 26.6]), 0.8, c.T([sx * 7.8, 0.2, 21.2]), 0.8);
    c.sc.box(c.sc.group(0), trim, c.T([sx * 7.9, 0.2, 20.4]), [0.6, 1.4, 0.6], A, 0.3, { tex: shine });
  });
  for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), strap, c.T([sx * 7.0, 2.0, 22.0]), 0.9, c.T([sx * 5.6, 2.4, 16.6]), 0.9);
}
const gspec = (id: string, ru: string, o: GryphonOpt): MountSpec => ({ id, ru, N: 128, GY: 104, scale: 1.22, build: (f, v) => gryphonBuild(o, f, v) });

// ---------------- 13. белый грифон в броне (редкий, герб) ----------------
export function whiteGryphon(fac: Fac): MountSpec {
  const K = facKit(fac);
  const white = M("белые перья", R("#3a4050", "#6a7286", "#9aa2b6", "#c6ccdc", "#e8ecf6", "#ffffff"), 2.3, 2.5);
  const streak: TexFn = (q) => (q.edge ? 0 : (q.x + Math.floor((q.y - q.ay + 90) / 2)) % 5 === 0 ? -1.4 : featherTex()(q) as number);
  const navy = fac === "solgard" ? M("синяя броня", R("#060c1c", "#0e1830", "#18284a", "#243c6a", "#365890", "#5a80b8"), 1.9, 2.8) : K.metal;
  const fur = M("серо-бурая шерсть", R("#141016", "#262028", "#3a3240", "#524858", "#6c6274", "#8a8090"), 2.0, 2.5);
  return gspec("white_gryphon", "Белый грифон в броне", {
    feath: white, face: white, fur, cover: white, prim: white, beak: M("тёмный клюв", R("#060a14", "#0e1626", "#18243c", "#283a5a", "#3e5680"), 1.9, 2.6),
    scale: M("тёмная чешуя", R("#0a0a10", "#16161e", "#26262e", "#3a3a46", "#52525e"), 1.9, 2.4), eye: "#c8e8ff", wingTex: streak,
    head: (c, A) => {
      const H = A.H;
      // шлем: синие пластины с золотыми рёбрами и гребнем
      c.sc.ell(c.sc.group(0.3), navy, H(0.8, 2.4, 0), [4.0, 3.6, 2.0], [A.s, A.w, A.fv], { tex: rimTex(K.trim, 0.8) });
      for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), K.trim, H(0.6, 3.6, sx * 1.6), 0.8, add(H(0.6, 3.6, sx * 1.6), add(mul(A.fv, 2.8), add(mul(A.w, -1.8), mul(A.s, sx * 0.8)))), 0.15, { tex: shine });
      c.sc.box(c.sc.group(0), navy, H(4.6, 0.6, 0), [2.0, 1.4, 0.6], [A.s, A.w, A.fv], 0.4, { tex: rimTex(K.trim, 0.7) });
    },
    deco: (c, lg) => {
      const A = c.ax(X, Y, Z);
      over(c, VB.down, () => {
        const pc0 = c.T([0, 16.2, 21.4]);
        c.sc.ell(c.sc.group(0.6), navy, pc0, [5.6, 1.6, 5.6], c.ax(X, norm([0, 0.9, -0.42]), norm([0, 0.42, 0.9])), { tex: rimTex(K.trim, 0.8) });
        emblem(c, fac, add(pc0, c.TD([0, 1.6, 0])), c.TD([0, 1, 0]), "down");
      });
      for (const sx of [-1, 1]) {
        c.sc.ell(c.sc.group(0.3), navy, c.T([sx * 8.0, -11.6, 22.4]), [1.6, 5.4, 5.0], A, { tex: rimTex(K.trim, 0.8) });
        emblem(c, fac, c.T([sx * 9.6, -11.6, 22.6]), c.TD([sx, 0, 0]), "side");
      }
      lg.slice(2).forEach((l) => c.sc.cone(c.sc.group(0.2), navy, lerpV(l.knee, l.fet, 0.3), 2.4, l.fet, 2.3, { tex: rimTex(K.trim, 0.7) }));
      gryphonSaddle(c, navy, K.trim, K.gem);
    },
  });
}

// ---------------- 14. хрустальный грифон (легендарный) ----------------
export function crystalGryphon(): MountSpec {
  const crystal = M("хрусталь", R("#06143a", "#0c2a6a", "#1a4aa4", "#3a7ad8", "#7ab4f4", "#c8ecff"), 2.4, 2.8);
  const glowC = mat2("сияние хрусталя", R("#1a4aa4", "#3a7ad8", "#7ab4f4", "#c8ecff", "#ffffff"));
  const silver = M("серебристые перья", R("#3a4252", "#6a7488", "#9ca6ba", "#c8d0e0", "#eaf0fa", "#ffffff"), 2.3, 2.5);
  const facet: TexFn = (q) => (q.edge ? 0 : q.lum > 0.78 ? 2 : (Math.floor(q.l[0] * 0.9 + q.l[1] * 0.6 + 30) + Math.floor(q.l[2] * 0.8 + 30)) % 3 === 0 ? -1 : 0);
  return gspec("crystal_gryphon", "Хрустальный грифон", {
    feath: silver, face: silver, fur: crystal, cover: crystal, prim: glowC, beak: M("серебряный клюв", R("#1a1c26", "#343848", "#585e74", "#8890a6", "#c0c8da"), 2.1, 2.6),
    scale: crystal, eye: "#7ff0ff", wingTex: facet,
    head: (c, A) => {
      const H = A.H;
      for (let k = 0; k < 4; k++) c.sc.cone(c.sc.group(0), glowC, H(0.6 - k * 0.8, 3.6, (k - 1.5) * 1.2), 0.7, add(H(0.6 - k * 0.8, 3.6, (k - 1.5) * 1.2), add(mul(A.fv, 2.6), mul(A.w, -1.6))), 0.15);
      c.sc.cone(c.sc.group(0), BRONZE, H(2.6, 2.6, -2.8), 0.4, H(2.6, 2.6, 2.8), 0.4, { tex: shine });
    },
    deco: (c, lg) => {
      gryphonSaddle(c, M("бронзовые ремни", R("#1a0e06", "#30200e", "#4e3618", "#704e26", "#94683a"), 1.9, 2.3), BRONZE, GEM_AZ);
      // хрустальные шипы вдоль спины и искры вокруг
      for (let k = 0; k < 4; k++) c.sc.cone(c.sc.group(0), glowC, c.T([0, -8 - k * 2.6, 27 - k * 0.4]), 0.8, c.T([0, -9.4 - k * 2.6, 30.6 - k * 0.6]), 0.12);
      embers(c, [c.T([7, 0, 30]), c.T([-7, 0, 30]), c.T([0, -12, 26]), ...lg.map((l) => l.foot)], 12, glowC, 10, 0.6, [0, -0.4, 0]);
    },
  });
}
const mat2 = (n: string, r: ReturnType<typeof R>) => ({ ...M(n, r, 2.8, 1.2), crisp: true, glow: true }) as Mat;

// ---------------- 16. ледяная сова (легендарный) ----------------
const OL: Layout = { fx: 3.4, hx: 3.4, fy: 0.6, hy: 0.6 };
export function frostOwl(): MountSpec {
  const dark = M("тёмные перья", R("#04080c", "#0a141a", "#122028", "#1e3038", "#2c444e", "#3e5c66"), 2.0, 2.5);
  const white = M("иней перьев", R("#2a4048", "#4a6a76", "#7aa0ac", "#acd0da", "#d8f0f6", "#ffffff"), 2.3, 2.5);
  const chev: TexFn = (q) => (q.edge ? 0 : (Math.abs(q.x - q.ax) + q.y) % 4 === 0 ? { mat: dark, d: 0.5 } : 0);
  const ice = mat2("ледяные перья", R("#2a5a86", "#4a86b4", "#7ab8dc", "#b0e0f4", "#e6faff", "#ffffff"));
  const build = (f: Frame, view: MView): Built => {
    const t = f.i / f.n;
    const p = basePose(OL, t, f.anim === "run");
    if (f.anim === "run") {
      // бег вприпрыжку: ноги по очереди, корпус наклонён вперёд, крылья взмахивают
      const w = TAU * t;
      p.legs = [0, 1].map((k) => {
        const u = (t + k * 0.5) % 1, sw = u < 0.5;
        const dy = sw ? lerp(-4.4, 4.4, easeInOut(u * 2)) : lerp(4.4, -4.4, (u - 0.5) * 2);
        return { foot: [k ? 3.4 : -3.4, dy, sw ? 3.6 * Math.sin(Math.PI * u * 2) : 0] as V3, fold: sw ? 0.8 * Math.sin(Math.PI * u * 2) : 0 };
      });
      p.pitch = 0.32 + 0.04 * Math.sin(w * 2); p.bob = 1.2 * Math.abs(Math.sin(w));
      const fl = Math.sin(w * 2);
      p.wing = [0, 1].map(() => ({ spread: 0.5 + 0.3 * fl, lift: 0.3 + 0.5 * fl, ruffle: 0 }));
      p.tailPh = w * 2; p.a.stride = 17.6 / 0.5;
    } else {
      // поворачивает голову почти назад, моргает, встряхивается (перья топорщатся), переступает
      const lk = win(t, 2 / 24, 11 / 24);
      p.headY += 1.4 * Math.sin(TAU * lk) * bump(lk);
      actShake(p, t, 13, 19, 1.2);
      p.wing.forEach((wg) => { wg.ruffle = bump(win(t, 13 / 24, 19 / 24)); wg.spread += 0.25 * bump(win(t, 13 / 24, 19 / 24)); });
      const st = win(t, 20 / 24, 24 / 24);
      p.legs[1] = { foot: [3.4, 0.6, 2.2 * bump(st)], fold: 0.6 * bump(st) };
      p.tailPh = TAU * t;
    }
    const c = ctx(f, view, p, [0, 0, 14]);
    // ноги: оперённые штаны, тёмные лапы с белыми когтями
    for (let i = 0; i < 2; i++) {
      const sx = i ? 1 : -1, L = p.legs[i];
      over(c, VB.down, () => {
        const hip = c.T([sx * 3.4, 0.6, 12]);
        const ank = add(L.foot, rotAxis([0, -0.4, 3.0], X, -L.fold));
        c.sc.cone(c.sc.group(0.8), white, hip, 3.0, lerpV(hip, ank, 0.7), 2.0, { tex: featherTex() });
        c.sc.cone(c.sc.group(0.4), dark, lerpV(hip, ank, 0.6), 1.2, ank, 1.0);
        for (const [dx, dy, len] of [[-1.1, 1, 2.6], [0, 1, 3.0], [1.1, 1, 2.6], [0, -1, 1.3]]) {
          const tip = add(L.foot, rotAxis([dx, dy * len, 0.2], X, -L.fold * 0.6));
          c.sc.cone(c.sc.group(0.3), dark, add(ank, [0, 0, -1.2]), 0.85, tip, 0.65);
          c.sc.cone(c.sc.group(0.2), M("белые когти", R("#4a5a64", "#7a8e9a", "#acc0ca", "#d8e8ee", "#ffffff"), 2.3, 2.4), tip, 0.6, add(tip, rotAxis([0, dy * 1.0, -1.0], X, -L.fold * 0.6)), 0.12, { tex: shine });
        }
      });
    }
    // тело-«капля» наклонено вперёд, грудь в белых шевронах
    const A = c.ax(X, Y, Z);
    const gb = c.sc.group(2.4);
    c.sc.ell(gb, dark, c.T([0, -1.0, 20.0]), [7.6, 9.4, 8.6], c.ax(X, norm([0, 1, 0.25]), norm([0, -0.25, 1])), { tex: featherTex() });
    over(c, VB.down, () => c.sc.ell(gb, white, c.T([0, 4.6, 19.4]), [6.4, 4.4, 7.4], A, { tex: chev }));
    // голова: круглая, белый лицевой диск, ушные пучки, золотая корона
    over(c, VB.down, () => {
      const N = neck(c, [0, 3.6, 26.4], [0, 1.6, 3.0], [5.4, 5.0], dark, featherTex(), 0);
      const Ah = headAxes(c, N.poll, N.nd, [0, 1, -0.1]);
      const H = Ah.H, gh = c.sc.group(1.6);
      c.sc.ell(gh, dark, H(0, 1.6, 0), [5.6, 4.6, 5.2], [Ah.s, Ah.w, Ah.fv], { tex: featherTex() });
      c.sc.ell(gh, white, H(3.0, 1.0, 0), [4.6, 1.8, 3.8], [Ah.s, Ah.w, Ah.fv], { tex: featherTex(-0.6) });
      c.sc.cone(c.sc.group(0.4), dark, H(4.6, 0.8, 0), 1.0, H(5.4, -0.6, 0), 0.3, { tex: shine });
      for (const sx of [-1, 1]) {
        c.sc.stamps.push({ at: H(4.4, 1.8, sx * 2.0), n: norm(add(mul(Ah.w, 0.8), mul(Ah.s, sx * 0.5))), colors: { K: [10, 6, 8, 255], A: [140, 220, 255, 255], W: [255, 255, 255, 255] }, glow: ["A"], halo: [140, 220, 255, 255], px: { down: [[0, 0, "A"], [1, 0, "W"], [0, 1, "A"], [1, 1, "K"]], side: [[0, 0, "A"], [1, 0, "A"], [2, 0, "W"], [0, 1, "A"], [1, 1, "K"], [2, 1, "K"]] }, depthTol: 2.5 });
        c.sc.cone(c.sc.group(0.3), white, H(0.6, 4.4, sx * 3.0), 1.2, add(H(0.6, 4.4, sx * 3.0), add(mul(Ah.fv, 1.6), add(mul(Ah.s, sx * 3.2), mul(Ah.w, -1.6)))), 0.2, { tex: featherTex(-0.5) });
      }
      c.sc.ell(c.sc.group(0.3), GOLD, H(0.4, 5.6, 0), [2.6, 1.6, 0.9], [Ah.s, Ah.w, Ah.fv], { tex: shine });
      for (let k = -1; k <= 1; k++) c.sc.cone(c.sc.group(0), GOLD, H(0.4, 6.2, k * 1.6), 0.5, H(0.2, 8.2 - Math.abs(k) * 0.8, k * 1.9), 0.12, { tex: shine });
      c.sc.ball(c.sc.group(0), GEM_AZ, H(1.2, 6.2, 0), 0.6);
    });
    // крылья сложены, ледяной хвост — длинные светящиеся перья
    for (const sx of [-1, 1]) featherWing(c, sx, { root: [sx * 6.8, 3.4, 25.6], cover: dark, prim: white, base: [0.05, 0.12], len: 0.95 });
    over(c, VB.up, () => {
      for (let k = 0; k < 5; k++) {
        const a = (k - 2) * 0.16 + Math.sin(p.tailPh - k) * 0.06;
        const d = norm(c.TD([Math.sin(a), -1, -0.35 + (p.run ? 0.35 : 0)]));
        const st = c.T([(k - 2) * 0.9, -8.6, 16.0]);
        c.sc.ell(c.sc.group(0), ice, add(st, mul(d, 6.4 - Math.abs(k - 2) * 0.8)), [0.6, 6.4 - Math.abs(k - 2) * 0.8, 1.6], [norm(cross(d, Z)), d, norm(cross(norm(cross(d, Z)), d))], { big: false, tex: (q) => (q.edge ? 0 : Math.abs(q.l[2]) < 0.4 ? -1 : 0) });
      }
    });
    // седло с золотой лукой и пурпурной подушкой
    const gs = c.sc.group(0.6);
    c.sc.ell(gs, M("пурпурная подушка", R("#14081a", "#24102e", "#3a1c48", "#562a66", "#743e84"), 1.9, 2.3), c.T([0, -2.0, 28.0]), [5.4, 5.4, 1.4], A);
    over(c, VB.up, () => {
      for (let k = 0; k < 4; k++) c.sc.cone(c.sc.group(0), GOLD, c.T([(k - 1.5) * 1.6, -6.6, 29]), 0.5, c.T([(k - 1.5) * 2.4, -8.4, 35 - Math.abs(k - 1.5)]), 0.15, { tex: shine });
    });
    for (const sx of [-1, 1]) over(c, near(sx), () => c.sc.cone(c.sc.group(0), GOLD, c.T([sx * 7.6, -1, 26]), 0.6, c.T([sx * 8.0, -1, 20]), 0.6, { tex: shine }));
    embers(c, [c.T([0, -12, 12]), c.T([0, -16, 10]), c.T([5, -6, 18]), c.T([-5, -6, 18])], 12, FROST, 8, 0.6, [0, -1.0, 0]);
    return done(c, [0, -2.0, 29.4]);
  };
  return { id: "frost_owl", ru: "Ледяная сова", N: 144, GY: 118, scale: 1.55, build };
}
void SILVER; void STEEL; void IRON; void SPIRIT; void actGraze; void actLook; void actTail; void rimTex; void Y;
