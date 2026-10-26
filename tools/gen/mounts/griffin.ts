/**
 * Задача 142, пилот: королевский грифон (референсы tools/out/refs/mounts/11, 12 — золотой грифон-сова, 13 — белый грифон в броне).
 * Голова совы-орла: светлый лицевой диск, янтарные глаза, перьевые «уши», тёмный крючковатый клюв; шея и грудь — бурые перья
 * с золотистым отливом; тело льва — кремово-белое, задние лапы львиные, передние — птичьи с когтями; крылья сложены вдоль боков
 * (кроющие золотисто-бурые, маховые белые). Золотая броня: налобник, нагрудная пластина с гербом Сольгарда, высокое седло
 * с крылатой лукой, синие ремни.
 *
 * Анимации: бег — скачки 12 кадров (передние вместе, задние вместе, тело тянется), крылья приоткрыты и машут в такт;
 * покой — 24 кадра: стоит, дважды клюёт землю (шея и голова вниз, передние лапы чуть сгибаются), затем чистит перья правого
 * крыла (голова к крылу, крыло приподнимается и топорщится), хвост с кисточкой покачивается.
 */
import {
  Scene, R, mat, add, mul, norm, lerpV, ik, rot, rotAxis, easeInOut, clamp, lerp, TAU, hash01, hex, cross,
  type V3, type View, type Mat, type Prim, type TexFn,
} from "../mobs/lib";
import { factionEmblem } from "../heraldry";
import { front, pcStamp, VB, type Built, type Fac, type Frame, type MountSpec, type MView } from "./lib";

const M = {
  fur: mat("белая шерсть", R("#4c4438", "#7a7062", "#a89e8c", "#d0c8b4", "#ece6d6", "#fffcf2"), { base: 2.1, gain: 2.5, hi: 5 }),
  furDk: mat("белая шерсть тень", R("#3a342c", "#5e564a", "#857c6c", "#ada490", "#cfc7b2"), { base: 1.8, gain: 2.3 }),
  cover: mat("золотистые кроющие", R("#3a240c", "#6a4618", "#a07028", "#d0a048", "#f0cc78", "#fff0b8"), { base: 2.2, gain: 2.5, hi: 5 }),
  feath: mat("бурые перья", R("#2a1a0c", "#4a3018", "#74502a", "#a0763e", "#c8a060", "#ead090"), { base: 2.0, gain: 2.5, hi: 5 }),
  face: mat("лицевой диск", R("#6a6050", "#a49a84", "#d2c8b0", "#efe8d4", "#fffcf0"), { base: 2.3, gain: 2.0 }),
  prim: mat("маховые", R("#4a3416", "#7a5a2a", "#ac8642", "#d8b464", "#f2da98", "#fff6d8"), { base: 2.2, gain: 2.5, hi: 5 }),
  beak: mat("клюв", R("#141826", "#2a3042", "#465068", "#6a7690", "#98a6bc", "#d0daea"), { base: 2.1, gain: 2.6, hi: 5 }),
  cere: mat("восковица", R("#5a3a0a", "#9a6a14", "#d09a28", "#f0c850", "#fff0a0"), { base: 2.2, gain: 2.2 }),
  scale: mat("чешуя лап", R("#4a3410", "#7a5a1c", "#a8822e", "#d0aa48", "#ecd27a"), { base: 2.0, gain: 2.3 }),
  claw: mat("когти", R("#0c0a0a", "#1c1816", "#34302c", "#5a544c", "#8a8274", "#c8c0b0"), { base: 1.9, gain: 2.6, hi: 5 }),
  gold: mat("золото", R("#3a2006", "#5e380c", "#8e5816", "#c48424", "#eab040", "#ffd86a", "#fff4c0"), { base: 2.6, gain: 2.8, hi: 6 }),
  strap: mat("синие ремни", R("#0a1428", "#12223e", "#1e3660", "#2e5288", "#4a74b0"), { base: 1.9, gain: 2.2 }),
  gem: mat("лазурный камень", R("#1a3a8a", "#2e6ad0", "#5aa8ff", "#a8dcff", "#ffffff"), { base: 2.6, gain: 1.4, crisp: true, glow: true }),
};
/** Перья слоями: ряды по 3 px со сдвигом через ряд; у каждого пера светлая верхняя кромка и тёмный полумесяц нижнего края. */
const featherTex = (dk = -0.9): TexFn => (c) => {
  if (c.edge) return 0;
  const dy = c.y - c.ay + 90, row = Math.floor(dy / 3), yy = dy % 3;
  const ph = (c.x - c.ax + 90 + (row & 1) * 2) % 4;
  if (yy === 2 && ph !== 1 && ph !== 2) return dk;
  if (yy === 1 && ph === 0) return dk * 0.8;
  if (yy === 0 && (ph === 1 || ph === 2)) return 0.45;
  return 0;
};
const furTex: TexFn = (c) => (c.edge ? 0 : hash01(Math.floor(c.l[0] * 0.8 + 20), Math.floor(c.l[1] * 0.8 + 20) * 3 + Math.floor(c.l[2] * 0.8), 5) < 0.12 ? -0.6 : 0);
const shine: TexFn = (c) => (c.edge ? 0 : c.lum > 0.86 ? 2 : c.lum > 0.66 ? 1 : 0);
const rim = (k: number): TexFn => (c) => (c.edge ? 0 : c.lum > 0.86 ? 2 : c.lum > 0.66 ? 1 : Math.abs(c.u) > k ? -0.9 : 0);

interface Leg { foot: V3; fold: number }
interface Pose {
  bob: number; pitch: number; neckP: number; neckY: number; headP: number; headY: number; headR: number;
  legs: Leg[];
  wing: { spread: number; lift: number; ruffle: number }[];
  tail: number; tailPh: number; run: boolean;
}
const FX = 4.4, HX = 4.8, FY = 12.6, HY = -12.0;
const stand = (): Leg[] => [
  { foot: [-FX, FY, 0], fold: 0 }, { foot: [FX, FY, 0], fold: 0 }, { foot: [-HX, HY, 0], fold: 0 }, { foot: [HX, HY, 0], fold: 0 },
];
function runPose(t: number): Pose {
  const S = 0.44 * 0.85, ph = [0.5, 0.58, 0.0, 0.08];
  const legs = stand().map((l, i) => {
    const fr = i < 2;
    const reach = (fr ? 7.4 : 7.0) * 1.3, lift = (fr ? 5.0 : 4.2) * 1.15;
    const u = (((t + ph[i]) % 1) + 1) % 1;
    let dy = 0, z = 0, fold = 0;
    if (u < S) dy = reach * (1 - (2 * u) / S);
    else {
      const s = (u - S) / (1 - S);
      dy = -reach + 2 * reach * easeInOut(s);
      z = lift * Math.sin(Math.PI * s);
      fold = (fr ? 1.4 : 1.2) * Math.sin(Math.PI * s);
    }
    return { foot: [l.foot[0], l.foot[1] + dy, z] as V3, fold };
  });
  const w = TAU * t;
  const flap = Math.sin(w + 0.6);
  return {
    bob: 1.5 * Math.sin(w + 2.0), pitch: 0.09 * Math.sin(w + 0.3), neckP: 0.12, neckY: 0, headP: -0.05 * Math.sin(w), headY: 0, headR: 0,
    legs, wing: [0, 1].map(() => ({ spread: 0.36 + 0.18 * flap, lift: 0.1 + 0.4 * flap, ruffle: 0 })),
    tail: 0.3 * Math.sin(w * 2), tailPh: w * 2, run: true,
  };
}
const win = (u: number, a: number, b: number) => clamp((u - a) / (b - a), 0, 1);
const bump = (s: number) => (s <= 0 || s >= 1 ? 0 : Math.sin(Math.PI * s));
function idlePose(i: number, n: number): Pose {
  const u = i / n;
  const legs = stand();
  // клевок: кадры 2..9, два удара
  const sp = win(u, 2 / 24, 10 / 24);
  const peck = sp > 0 && sp < 1 ? easeInOut(bump(sp)) : 0;
  const tap = sp > 0 && sp < 1 ? Math.max(0, Math.sin(TAU * 2 * sp - 0.3)) * bump(sp) : 0;
  // чистка перьев: кадры 12..21
  const pr = win(u, 12 / 24, 22 / 24);
  const preen = easeInOut(bump(pr));
  const nib = pr > 0 && pr < 1 ? Math.sin(TAU * 3 * pr) * bump(pr) : 0;
  return {
    bob: 0, pitch: -0.1 * peck,
    neckP: 1.15 * peck + 0.25 * tap + 0.35 * preen, neckY: 1.15 * preen, headP: 0.55 * peck + 0.2 * tap + 0.5 * preen + 0.12 * nib, headY: 0.35 * preen, headR: 0,
    legs, wing: [{ spread: 0, lift: 0, ruffle: 0 }, { spread: 0.25 * preen, lift: 0.35 * preen, ruffle: 0.8 * preen }],
    tail: 0.45 * Math.sin(TAU * u), tailPh: TAU * u, run: false,
  };
}

const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];
export function griffin(fac: Fac = "solgard"): MountSpec {
  const em = pcStamp(factionEmblem(fac, "s16"));
  // ремни и чепрак по фракции всадника: Сольгард — синие, Умбрат — пурпурные
  const STRAP = fac === "solgard" ? M.strap : mat("пурпурные ремни", R("#140a20", "#24123a", "#3c2060", "#5a3488", "#8058b0"), { base: 1.9, gain: 2.2 });
  const build = (f: Frame, view: MView): Built => {
    void view;
    const p = f.anim === "run" ? runPose(f.i / f.n) : idlePose(f.i, f.n);
    const sc = new Scene();
    const b = { sc, bits: new Map<Prim, number>() };
    const PIV: V3 = [0, 2, 21];
    const c0 = Math.cos(p.pitch), s0 = Math.sin(p.pitch);
    const T = (q: V3): V3 => { const y = q[1] - PIV[1], z = q[2] - PIV[2]; return [q[0], PIV[1] + y * c0 - z * s0, PIV[2] + z * c0 + y * s0 + p.bob]; };
    const TD = (d: V3): V3 => [d[0], d[1] * c0 - d[2] * s0, d[2] * c0 + d[1] * s0];
    const ax = (a: V3, b2: V3, c: V3): [V3, V3, V3] => [TD(a), TD(b2), TD(c)];

    // ---- ноги: передние птичьи (поверх всадника при взгляде вниз), задние львиные (поверх со спины) ----
    for (let i = 0; i < 4; i++) {
      const fr = i < 2, sx = i % 2 === 0 ? -1 : 1;
      const L = p.legs[i];
      front(b, fr ? VB.down : VB.up, () => {
        const g = sc.group(0.8);
        const hip = T(fr ? [sx * FX, 11.6, 19.4] : [sx * HX, -11.8, 20.2]);
        if (fr) {
          // оперённое бедро, чешуйчатая цевка, пальцы с когтями
          const ank = add(L.foot, rotAxis([0, -0.6, 3.0], X, -L.fold));
          const knee = ik(hip, ank, 9.0, 8.4, [0, -1, -0.1]);
          sc.cone(g, M.feath, hip, 3.4, knee, 2.4, { tex: featherTex() });
          sc.cone(sc.group(0.5), M.scale, lerpV(knee, ank, 0.25), 1.35, ank, 1.15, { tex: (c) => (c.edge ? 0 : (c.y - c.ay) % 2 === 0 ? -0.6 : 0) });
          const gt = sc.group(0.3);
          const toe = (dx: number, dy: number, len: number) => {
            const tip = add(L.foot, rotAxis([dx, dy * len, 0.2], X, -L.fold * 0.6));
            sc.cone(gt, M.scale, add(ank, [0, 0, -1.4]), 1.05, tip, 0.85);
            const cm = add(tip, rotAxis([0, 1.0, 0.1], X, -L.fold * 0.6));
            sc.cone(sc.group(0.2), M.claw, tip, 0.75, cm, 0.5, { tex: shine });
            sc.cone(sc.group(0.2), M.claw, cm, 0.5, add(cm, rotAxis([0, 0.5, -1.1], X, -L.fold * 0.6)), 0.15, { tex: shine });
          };
          toe(-1.2, 1, 3.0); toe(0, 1, 3.4); toe(1.2, 1, 3.0); toe(0, -1, 1.5);
        } else {
          const paw = add(L.foot, [0, 0.8, 1.2]);
          const ank = add(L.foot, rotAxis([0, -1.2, 4.2], X, -L.fold));
          const knee = ik(hip, ank, 10.6, 8.6, [0, -1, -0.2]);
          const m = sx > 0 ? M.fur : M.furDk;
          sc.cone(g, m, hip, 3.8, knee, 2.3, { tex: furTex });
          sc.cone(g, m, knee, 2.1, ank, 1.7);
          sc.cone(g, m, ank, 1.7, paw, 1.9);
          sc.ell(g, m, add(paw, [0, 0.8, -0.2]), [2.2, 2.5, 1.4], [X, Y, Z]);
          for (const dx of [-1.2, 0, 1.2]) sc.cone(sc.group(0), M.claw, add(paw, [dx, 2.9, -0.4]), 0.55, add(paw, [dx, 4.0, -1.1]), 0.18, { tex: shine });
        }
      });
    }

    // ---- тело льва ----
    const gb = sc.group(2.6);
    sc.ell(gb, M.fur, T([0, -1.5, 21.6]), [7.6, 12.6, 6.8], ax(X, Y, Z), { tex: furTex });
    front(b, VB.up, () => {
      sc.ell(gb, M.fur, T([0, -11.2, 22.2]), [8.0, 6.8, 7.0], ax(X, Y, Z), { tex: furTex });
      for (const sx of [-1, 1]) sc.ell(gb, M.fur, T([sx * 4.4, -12.0, 20.6]), [3.6, 5.8, 7.0], ax(X, Y, Z), { tex: furTex });
    });
    // ---- грудь, шея и голова в перьях ----
    const NB = T([0, 11.6, 25.4]);
    const nd = (v: V3): V3 => TD(rot(v, p.neckP, p.neckY));
    const poll = add(NB, nd([0, 5.0, 9.6]));
    front(b, VB.down, () => {
      const gc = sc.group(2.4);
      sc.ell(gc, M.feath, T([0, 10.4, 22.4]), [7.6, 6.6, 7.0], ax(X, Y, Z), { tex: featherTex() });
      sc.ell(gc, M.face, T([0, 15.6, 18.8]), [4.6, 3.0, 4.4], ax(X, norm([0, 1, -0.3]), norm([0, 0.3, 1])), { tex: featherTex(-0.6) });
      sc.cone(gc, M.feath, NB, 6.4, add(NB, nd([0, 2.6, 5.0])), 5.4, { tex: featherTex() });
      sc.cone(gc, M.feath, add(NB, nd([0, 2.6, 5.0])), 5.4, poll, 4.4, { tex: featherTex() });
      // голова: оси — вперёд (w), вверх (u), вбок (s)
      const hr = (v: V3) => nd(rot(rot(v, p.headP, 0), 0, p.headY, p.headR));
      const w = norm(hr([0, 1, -0.15])), uu = norm(hr([0, 0.15, 1])), s = norm(cross(w, uu));
      const H = (a: number, c: number, d: number): V3 => add(poll, add(mul(w, a), add(mul(uu, c), mul(s, d))));
      const gh = sc.group(1.4);
      sc.ell(gh, M.feath, H(0.6, 0.8, 0), [4.6, 4.4, 4.4], [s, w, uu], { tex: featherTex() });
      // лицевой диск и брови
      sc.ell(gh, M.face, H(3.0, 0.4, 0), [3.8, 1.8, 3.4], [s, w, uu], { tex: featherTex(-0.5) });
      // перьевые «уши»
      for (const sx of [-1, 1]) {
        const e0 = H(0.4, 3.6, sx * 2.6);
        sc.cone(sc.group(0.6), M.feath, e0, 1.4, add(e0, add(mul(uu, 3.4), add(mul(s, sx * 1.0), mul(w, -1.4)))), 0.35, { tex: featherTex() });
      }
      // клюв: основание, крюк вниз
      const gk = sc.group(0.5);
      sc.ell(sc.group(0), M.cere, H(4.3, 0.1, 0), [1.7, 0.8, 1.4], [s, w, uu]);
      sc.cone(gk, M.beak, H(4.6, -0.2, 0), 1.75, H(6.8, -0.6, 0), 1.15, { tex: shine });
      sc.cone(gk, M.beak, H(6.8, -0.6, 0), 1.15, H(7.6, -2.4, 0), 0.4, { tex: shine });
      sc.cone(gk, M.beak, H(5.0, -1.2, 0), 1.2, H(6.4, -1.6, 0), 0.7);
      // глаза: янтарь со зрачком
      for (const sx of [-1, 1]) sc.stamps.push({ at: H(3.6, 1.3, sx * 2.2), n: norm(add(mul(w, 0.8), mul(s, sx * 0.6))), colors: { K: hex("#0a0608"), A: hex("#ffe070"), a: hex("#d89a18"), W: hex("#ffffff") }, px: { down: [[0, 0, "A"], [1, 0, "W"], [0, 1, "a"], [1, 1, "K"]], side: [[0, 0, "A"], [1, 0, "A"], [2, 0, "W"], [0, 1, "a"], [1, 1, "K"], [2, 1, "K"]] }, depthTol: 2.5 });
      // золотой налобник с камнем и гребнем
      const gm = sc.group(0.3);
      sc.ell(gm, M.gold, H(1.4, 3.2, 0), [2.4, 3.4, 1.2], [s, w, uu], { tex: rim(0.9) });
      sc.cone(sc.group(0), M.gold, H(-0.6, 4.0, 0), 0.7, H(-3.4, 6.2, 0), 0.2, { tex: shine });
      sc.ball(sc.group(0), M.gem, H(3.0, 3.6, 0), 0.9);
      // нагрудная пластина с гербом
      const pc0 = T([0, 16.2, 21.4]);
      const pax = ax(X, norm([0, 0.9, -0.42]), norm([0, 0.42, 0.9]));
      sc.ell(sc.group(0.6), M.gold, pc0, [5.4, 1.4, 5.4], [pax[0], pax[1], pax[2]], { tex: (c) => (c.lum > 0.72 && !c.edge ? 1 : Math.hypot(c.l[0] / 5.4, c.l[2] / 5.4) > 0.78 ? -0.9 : 0) });
      sc.stamps.push({ at: add(pc0, mul(pax[1], 1.4)), n: pax[1], colors: em.colors, px: { down: em.px }, depthTol: 3 });
      // ремни нагрудника к седлу
      for (const sx of [-1, 1]) sc.cone(sc.group(0), STRAP, T([sx * 5.4, 15.0, 22.0]), 0.9, T([sx * 7.6, 6.0, 25.4]), 0.9);
    });

    // ---- крылья: кроющие и маховые; ближнее — поверх всадника сбоку, концы — поверх со спины ----
    for (const sx of [-1, 1]) {
      const W = p.wing[sx < 0 ? 0 : 1];
      const root = T([sx * 7.0, 8.0, 26.4]);
      // сложенное: вдоль спины назад и чуть вверх; раскрытие — в сторону, подъём — вверх
      let a: V3 = TD(norm([0, -1, 0.08]));
      a = rotAxis(a, Z, sx * (0.12 + W.spread));
      const out = norm(cross(Z, a)) as V3;
      const lf = 0.32 + W.lift;
      a = norm(add(mul(a, Math.cos(lf)), mul(Z, Math.sin(lf))));
      void out;
      const nrm0 = norm(cross(a, Z));
      const nrm: V3 = mul(nrm0, Math.sign(nrm0[0] || sx) * sx) as V3;
      const dn = mul(norm(cross(nrm, a)), sx) as V3;
      const side = sx > 0 ? VB.side : VB.left;
      front(b, side, () => {
        const gw = sc.group(1.2);
        sc.ell(gw, M.cover, add(root, add(mul(a, 4.6), mul(dn, 1.2))), [1.5, 6.0, 3.0], [nrm, a, dn], { tex: featherTex() });
        sc.ell(gw, M.cover, add(root, add(mul(a, 8.6), mul(dn, 2.0))), [1.3, 4.6, 2.8], [nrm, a, dn], { tex: featherTex() });
        // ряды кроющих перьев: каждое — отдельная лопатка с кромкой
        for (let j = 0; j < 2; j++) for (let k = 0; k < 4; k++) {
          const c = add(root, add(mul(a, 3.4 + k * 2.4 + j * 1.2), add(mul(dn, 2.6 + j * 1.6), mul(nrm, 0.6 + j * 0.2))));
          const fd = rotAxis(a, nrm, sx * 0.35);
          sc.ell(sc.group(0), j ? M.prim : M.cover, c, [0.5, 1.9, 1.15], [nrm, fd, norm(cross(nrm, fd))], { big: false, tex: (q) => (q.edge ? 0 : q.l[1] < -1.1 ? 0.6 : 0) });
        }
      });
      front(b, side | VB.up, () => {
        for (let k = 0; k < 5; k++) {
          const fan = (k - 2) * (0.07 + 0.12 * W.spread) + (W.ruffle ? Math.sin(k * 2.1 + W.ruffle * 5) * 0.06 * W.ruffle : 0);
          const fd = rotAxis(a, nrm, sx * (fan + 0.05));
          const st = add(root, add(mul(a, 6.4), mul(dn, 0.4 + k * 0.75)));
          const len = 9.6 - Math.abs(k - 1) * 0.9;
          sc.ell(sc.group(0.2), M.prim, add(st, mul(fd, len)), [0.6, len, 1.55], [nrm, fd, norm(cross(nrm, fd))], { tex: (c) => (c.edge ? 0 : Math.abs(c.l[2]) < 0.35 ? -0.7 : 0), big: false });
        }
      });
    }

    // ---- хвост льва с кисточкой ----
    front(b, VB.up, () => {
      let cur = T([0, -17.2, 24.6]);
      const pts: V3[] = [cur];
      for (let k = 1; k <= 6; k++) {
        const s = k / 6;
        const sw = Math.sin(p.tailPh - k * 0.7) * (p.run ? 0.6 : 0.35) * s + p.tail * s;
        cur = add(cur, mul(norm([sw, -1 + (p.run ? 0 : 0.6 * s), p.run ? 0.2 - 0.3 * s : -1.5 + 2.6 * s]), 3.0));
        pts.push(cur);
      }
      const gt = sc.group(0.8);
      for (let k = 0; k + 1 < pts.length; k++) sc.cone(gt, M.fur, pts[k], lerp(1.7, 1.0, k / 6), pts[k + 1], lerp(1.7, 1.0, (k + 1) / 6), { tex: furTex });
      const last = pts[pts.length - 1], dir = norm(add(last, mul(pts[pts.length - 2], -1)));
      sc.ell(sc.group(0.6), M.feath, add(last, mul(dir, 1.6)), [1.7, 2.8, 1.9], [norm(cross(dir, Z)), dir, norm(cross(norm(cross(dir, Z)), dir))], { tex: featherTex() });
    });

    // ---- седло: синий чепрак, золотая чаша, высокая лука с крыльями ----
    const gs = sc.group(0.6);
    sc.ell(gs, STRAP, T([0, -0.6, 27.6]), [7.4, 7.2, 1.5], ax(X, Y, Z), { tex: (c) => (Math.hypot(c.l[0] / 7.4, c.l[1] / 7.2) > 0.84 ? { mat: M.gold, d: 0 } : 0) });
    sc.ell(gs, M.gold, T([0, -0.8, 29.0]), [4.6, 5.4, 1.4], ax(X, Y, Z), { tex: shine });
    sc.box(gs, M.gold, T([0, 4.4, 30.4]), [2.4, 0.9, 1.6], ax(X, Y, Z), 0.6, { tex: shine });
    sc.box(gs, M.gold, T([0, -5.6, 32.0]), [3.6, 0.9, 2.6], ax(X, norm([0, 0.9, 0.35]), norm([0, -0.35, 0.9])), 0.6, { tex: rim(0.8) });
    // крылатая лука (ref 11/12): золотые перья веером вверх-назад от высокой луки, в середине — щиток с камнем
    front(b, VB.up, () => {
    sc.box(sc.group(0.3), M.gold, T([0, -6.4, 35.0]), [1.6, 0.8, 3.6], ax(X, norm([0, 0.94, 0.34]), norm([0, -0.34, 0.94])), 0.6, { tex: rim(0.8) });
    sc.ball(sc.group(0), M.gem, T([0, -5.6, 35.6]), 0.8);
    for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
      const s0 = T([sx * (1.2 + k * 0.5), -6.6, 32.8]);
      const ang = 0.15 + k * 0.28, len = 4.6 - k * 0.45;
      const d = TD(norm([sx * Math.sin(ang), -0.35, Math.cos(ang)]));
      const sd = norm(cross(d, [0, 1, 0]));
      sc.ell(sc.group(0), M.gold, add(s0, mul(d, len)), [0.45, len, 0.95], [norm(cross(d, sd)), d, sd], { tex: shine, big: false });
    }
    });
    for (const sx of [-1, 1]) {
      const st = () => {
        sc.cone(sc.group(0), STRAP, T([sx * 7.4, 0, 26.6]), 0.8, T([sx * 7.8, 0.2, 21.2]), 0.8);
        sc.box(sc.group(0), M.gold, T([sx * 7.9, 0.2, 20.4]), [0.6, 1.4, 0.6], ax(X, Y, Z), 0.3, { tex: shine });
      };
      front(b, sx > 0 ? VB.side : VB.left, st);
    }
    // подпруга
    sc.cone(sc.group(0), STRAP, T([7.0, 2.0, 22.0]), 0.9, T([5.6, 2.4, 16.6]), 0.9);
    sc.cone(sc.group(0), STRAP, T([-7.0, 2.0, 22.0]), 0.9, T([-5.6, 2.4, 16.6]), 0.9);
    return { sc: b.sc, bits: b.bits, seat: T([0, -0.8, 30.2]), stride: (2 * 7.4 * 1.3) / (0.44 * 0.85) };
  };
  return { id: `griffin_${fac}`, ru: "Королевский грифон", N: 128, GY: 104, scale: 1.22, build };
}
void Y;
