/**
 * Задача 142: кони по референсам tools/out/refs/mounts — тяжеловоз (17), парадный конь со стягом (07, герб), шипастый латный
 * (03, герб), лавовый (04), призрачный кошмар (05), механический бронзовый (02), фарфоровый механический (06), рогатый
 * драконоконь (21). Один каркас коня (kit.ts), у каждого свои материалы, броня, поведение в покое и эффекты: чем реже, тем больше
 * (тяжеловоз — без эффектов, парадный — светящийся хвост, лавовый — пламя гривы, хвоста, копыт и угли; призрачный — дух ног
 * и хвоста, молнии, перепончатые крылья; механический — горнило в груди, крутящиеся шестерни, пар).
 * Боевой конь со знаменем (20) — пилот war_horse.ts.
 */
import {
  add, mul, norm, lerpV, rot, rotAxis, cross, lerp, TAU, hash01, hex, R, M, G, X, Y, Z,
  FIRE, FIRE_DEEP, SPIRIT, STORM, GOLD, STEEL, IRON, BRONZE, LEATHER, ROPE, HOOF, CLAW, HORN_DK, GEM_AZ, GEM_RED,
  hairTex, scaleTex, shine, rimTex, crackTex, furTex,
  basePose, runPose, ctx, over, near, VB, body, legs4, neck, horseHead, headAxes, eyes, mane, hairTail, segTail, saddle, caparison,
  emblem, facKit, membraneWing, embers, flames, sparks, done, scaleFrom,
  actPaw, actShake, actGraze, actToss, actPrance, actRear, actTail, actEar, actLook, bump, win,
  type V3, type Mat, type TexFn, type Pose, type Layout, type Ctx, type Fac, type Frame, type MView, type Built,
} from "./kit";
import type { MountSpec } from "./lib";

const L0: Layout = { fx: 4.2, hx: 4.6, fy: 12.2, hy: -11.6 };
interface HorseCfg {
  coat: Mat; coatDk?: Mat; mane: Mat; tail?: Mat; maneGlow?: boolean; tailGlow?: boolean;
  lower?: Mat; feather?: Mat; hoof?: Mat; muzzle?: Mat; coatTex?: TexFn; eye?: string; eyeGlow?: boolean;
  heavy?: number; headK?: number;
  /** покой: свои действия по доле цикла u */
  idle: (p: Pose, u: number) => void;
  /** голова: броня и украшения (оси головы A, затылок) */
  head?: (c: Ctx, A: ReturnType<typeof headAxes>, poll: V3, crest: (t: number) => V3) => void;
  /** корпус: броня, седло, попона, эффекты */
  deco: (c: Ctx, legs: ReturnType<typeof legs4>, tail: V3[]) => void;
  /** без гривы-прядей (у механических — гребень) */
  noMane?: boolean;
  tailKind?: "hair" | "seg";
  banner?: (c: Ctx) => Omit<NonNullable<Built["banner"]>, "t" | "run">;
}
const tex0 = undefined;
function horseBuild(cfg: HorseCfg, f: Frame, view: MView): Built {
  const hv = cfg.heavy ?? 1;
  const L: Layout = { fx: L0.fx * hv, hx: L0.hx * hv, fy: L0.fy, hy: L0.hy };
  let p: Pose;
  if (f.anim === "run") p = runPose(f.i / f.n, L);
  else { p = basePose(L, f.i / f.n, false); cfg.idle(p, f.i / f.n); }
  const c = ctx(f, view, p, [0, 0, 22]);
  const coatDk = cfg.coatDk ?? ({ ...cfg.coat, base: cfg.coat.base - 0.3 } as Mat);
  const lg = legs4(c, {
    L, hipZ: [19.6, 20.6], len: [[9.3, 7.3], [11.4, 8.2]],
    r: [[3.4 * hv, 2.1 * hv, 1.65 * hv], [3.8 * hv, 2.0 * hv, 1.6 * hv]], foot: "hoof",
    coat: cfg.coat, coatDk, lower: cfg.lower, feather: cfg.feather, footMat: cfg.hoof ?? HOOF, tex: cfg.coatTex, layers: true,
  });
  body(c, { z: 22.2, len: 13.6, w: 8.0 * hv, h: 7.0 * hv, coat: cfg.coat, tex: cfg.coatTex, rumpOver: true });
  const nk = { base: [0, 12.4, 25.6] as V3, v: [0, 7.2, 12.4] as V3 };
  over(c, VB.down, () => {
    const N = neck(c, nk.base, nk.v, [6.0 * hv, 3.1], cfg.coat, cfg.coatTex);
    const i0 = c.sc.prims.length, s0 = c.sc.stamps.length;
    const A = horseHead(c, N.poll, N.nd, cfg.coat, { muzzle: cfg.muzzle, eye: cfg.eye, eyeGlow: cfg.eyeGlow });
    cfg.head?.(c, A, N.poll, N.crest);
    scaleFrom(c, i0, s0, N.poll, cfg.headK ?? 1.15);
    if (!cfg.noMane) {
      mane(c, N.crest, cfg.mane, cfg.maneGlow ? { glow: true, up: 5, r: 1.2, len: 1.2 } : {});
      c.sc.cone(c.sc.group(0.3), cfg.mane, A.H(0.4 * 1.15, 1.2, 0.2), 1.0, A.H(2.2, 2.9, 0.4), 0.55, { tex: cfg.maneGlow ? undefined : hairTex });
    }
  });
  const tb = c.T([0, -16.8, 26.4]);
  const tail = cfg.tailKind === "seg" ? segTail(c, tb, cfg.tail ?? cfg.mane, { r0: 1.6, r1: 0.5, droop: 1.2, n: 8, seg: 2.6 }) : hairTail(c, tb, cfg.tail ?? cfg.mane, { glow: cfg.tailGlow });
  cfg.deco(c, lg, tail);
  return done(c, [0, -0.8, 31.4], cfg.banner?.(c));
}
const horseSpec = (id: string, ru: string, cfg: HorseCfg, scale = 1.15, N = 120, GY = 98): MountSpec => ({ id, ru, N, GY, scale, build: (f, v) => horseBuild(cfg, f, v) });
void tex0; void lerp; void cross; void rot; void Y; void Z; void X; void hex; void hash01; void TAU;

// ---------------- 17. тяжеловоз (обычный) ----------------
export function draftHorse(): MountSpec {
  const coat = M("серо-буланая", R("#1a1816", "#34302c", "#57514a", "#7e766a", "#a49a8a", "#c8bfae"), 2.0, 2.5);
  const lower = M("тёмные чулки", R("#0c0c10", "#18181e", "#282a32", "#3c3e48", "#54566a"), 1.8, 2.4);
  const strap = M("ремни", R("#2a1408", "#4a2810", "#6e4020", "#94602e", "#b8844a"), 1.9, 2.3);
  const cushion = M("зелёная подушка", R("#1c2410", "#34401c", "#4e5c28", "#6e7c38", "#94a050"), 2.0, 2.3);
  const amber = mat2("янтарь фонаря", R("#5a2a08", "#a85a10", "#f0a020", "#ffd060", "#fff4c0"));
  return horseSpec("draft_horse", "Тяжеловоз", {
    coat, mane: M("тёмная грива", R("#0a0a0c", "#16161a", "#24242a", "#36363e", "#4c4c56"), 2.0, 2.3), lower, feather: M("щётки", R("#0c0c10", "#1c1c22", "#30303a", "#4a4a56", "#6a6a78"), 2.0, 2.3),
    heavy: 1.12, coatTex: furTex(0.08),
    idle: (p, u) => { actGraze(p, u, 2, 11); actTail(p, u, 11, 16, 0.6); actShake(p, u, 16, 22, 0.8); actEar(p, u, 0, 2); },
    head: (c, A) => {
      // уздечка: ремни по морде и щекам, кольца
      const H = A.H;
      c.sc.cone(c.sc.group(0), strap, H(7.4, 2.3, -2.3), 0.45, H(7.4, 2.3, 2.3), 0.45);
      for (const sx of [-1, 1]) {
        c.sc.cone(c.sc.group(0), strap, H(1.2, 1.0, sx * 2.8), 0.45, H(8.6, -1.2, sx * 2.4), 0.45);
        c.sc.ball(c.sc.group(0), STEEL, H(8.8, -1.0, sx * 2.3), 0.6, { tex: shine });
      }
    },
    deco: (c) => {
      saddle(c, { y: -0.8, z: 30.4, w: 6.2, leather: cushion, trim: STEEL, flapX: 9.4, pad: strap });
      // подпруга и вьюки за седлом, фонарь на левом боку
      for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0), strap, c.T([sx * 8.6, 1.5, 27]), 0.7, c.T([sx * 6.2, 1.8, 16.4]), 0.7);
      c.sc.box(c.sc.group(0.4), M("вьюк", R("#2a2018", "#463624", "#665036", "#8a6e4a", "#ac8e64"), 2.0, 2.3), c.T([0, -8.6, 31.2]), [6.4, 2.4, 1.8], c.ax(X, Y, Z), 0.9, { tex: (q) => (Math.abs(q.l[0]) % 2.2 < 0.4 ? -0.8 : 0) });
      c.sc.cone(c.sc.group(0), ROPE, c.T([-6.6, -8.6, 31.2]), 0.9, c.T([6.6, -8.6, 31.2]), 0.9, { tex: (q) => ((q.x + q.y) % 2 ? -0.5 : 0.3) });
      const lt = c.T([-9.6, -4.4, 25.4]);
      c.sc.box(c.sc.group(0), STEEL, add(lt, [0, 0, 2.0]), [1.0, 1.0, 0.4], c.ax(X, Y, Z), 0.2, { tex: shine });
      c.sc.ell(c.sc.group(0), amber, lt, [1.2, 1.1, 1.7], c.ax(X, Y, Z));
    },
  }, 1.2);
}
const mat2 = (n: string, r: ReturnType<typeof R>) => G(n, r, 2.6, 1.2);

// ---------------- 07. парадный конь со стягом (редкий, герб) ----------------
export function paradeHorse(fac: Fac): MountSpec {
  const K = facKit(fac);
  const coat = M("тёмно-гнедая", R("#140806", "#2a120a", "#4a2214", "#6c3620", "#904c2e", "#b4683e"), 2.0, 2.5);
  const quart = fac === "solgard" ? M("алое сукно", R("#2a0a10", "#4a1420", "#7e2230", "#b03a3e", "#d86a5a"), 1.9, 2.2) : K.hem;
  const tailGlow = fac === "solgard" ? SPIRIT : M("ядовитый", R("#1e5a1a", "#3fcf45", "#7aff6a", "#c0ff9a", "#efffe0"), 2.6, 1.2);
  return horseSpec(`parade_horse${fac === "umbrath" ? "_u" : ""}`, "Парадный конь со стягом", {
    coat, mane: M("чёрная грива", R("#0a0806", "#1a1410", "#2e241c", "#463a2e", "#625444"), 2.0, 2.3),
    idle: (p, u) => { actPrance(p, L0, u, 2, 12); actShake(p, u, 14, 21, 0.8); actTail(p, u, 20, 24, 0.5); },
    banner: (c) => ({ fac, kind: "streamer", base: c.T([3.6, -7.0, 32.6]), top: c.T([3.6, -7.0, 58]), hang: { down: -1, up: 1, side: -1, left: 1 } }),
    head: (c, A, poll, crest) => {
      const H = A.H;
      // золотой налобник с круглой решёткой глаз и гребнем; гривна — пластинами
      c.sc.box(c.sc.group(0.3), GOLD, H(5.4, 1.75, 0), [2.2, 0.7, 5.0], [A.s, A.fv, A.w], 0.6, { tex: shine });
      for (const sx of [-1, 1]) {
        c.sc.ell(c.sc.group(0), GOLD, H(2.6, 0.9, sx * 2.6), [0.5, 1.6, 1.6], [A.s, A.fv, A.w], { tex: (q) => (q.edge ? 0 : (q.x + q.y) % 2 ? -1.2 : 0.6) });
      }
      for (let k = 0; k < 3; k++) c.sc.cone(c.sc.group(0.2), GOLD, H(0.4 + k * 1.5, 2.5, 0), 0.8 - k * 0.12, add(H(0.4 + k * 1.5, 2.5, 0), add(mul(A.fv, 1.4 - k * 0.3), mul(A.w, -2.6 + k * 0.6))), 0.15, { tex: shine });
      c.sc.ball(c.sc.group(0), K.gem, H(2.4, 2.75, 0), 0.9);
      for (let k = 0; k < 4; k++) {
        const c0 = crest(0.05 + k * 0.22), c1 = crest(0.05 + k * 0.22 + 0.2);
        const al = norm(add(c1, mul(c0, -1))), nr = norm([0, -al[2], al[1]]);
        c.sc.box(c.sc.group(0.2), GOLD, add(lerpV(c0, c1, 0.5), mul(nr, 0.9)), [3.4 - k * 0.3, 2.2, 0.9], [X, al, nr], 0.5, { tex: rimTex(GOLD, 0.7) });
      }
      void poll;
    },
    deco: (c, _lg, tail) => {
      // попона на четверти: поле фракции и алое/пурпурное, золотой подол и герб
      caparison(c, { y0: -16.2, y1: 9.8, zc: 21.6, hz: 7.4, w: 9.4, cloth: K.cloth, hem: quart, trim: GOLD, fac });
      // нагрудная бляха с гербом
      const pc0 = c.T([0, 15.0, 22.4]);
      over(c, VB.down, () => {
        c.sc.ell(c.sc.group(0.6), GOLD, pc0, [7.6, 2.4, 5.0], c.ax(X, norm([0, 0.96, -0.28]), norm([0, 0.28, 0.96])), { tex: shine });
        emblem(c, fac, add(pc0, c.TD([0, 2.4, 0.4])), c.TD([0, 1, 0]), "down");
      });
      saddle(c, { y: -0.8, z: 31.2, w: 5.6, trim: GOLD, flapX: 9.8, cantle: 1.8 });
      c.sc.cone(c.sc.group(0.2), LEATHER, c.T([3.6, -7.0, 30.0]), 1.3, c.T([3.6, -7.0, 32.6]), 1.2);
      // кристалл-щиток на крупе, светится
      c.sc.ell(c.sc.group(0), K.gem, c.T([-7.6, -10.0, 26.0]), [0.8, 2.0, 2.6], c.ax(X, Y, Z));
      // хвост: светящийся кончик
      flames(c, tail.slice(-3), tailGlow, { len: 2.2, r: 1.1, back: 1.4, layer: VB.up });
    },
  });
}

// ---------------- 03. шипастый латный конь (редкий, герб) ----------------
export function spikedHorse(fac: Fac): MountSpec {
  const K = facKit(fac);
  const coat = M("тёмно-красная", R("#120406", "#26080c", "#421016", "#601a20", "#80262a", "#a0383a"), 2.0, 2.5);
  const plate = fac === "solgard" ? STEEL : IRON;
  const gold = fac === "solgard" ? GOLD : M("тёмное золото", R("#2a1606", "#4a2a0c", "#74461a", "#a06a2c", "#c89448", "#e8c070"), 2.4, 2.8);
  const spike = (c: Ctx, at: V3, dir: V3, len = 3.2, r = 0.9) => c.sc.cone(c.sc.group(0), gold, at, r, add(at, mul(norm(dir), len)), 0.12, { tex: shine });
  return horseSpec(`spiked_horse${fac === "umbrath" ? "_u" : ""}`, "Шипастый латный конь", {
    coat, mane: M("чёрная грива", R("#0a0406", "#18080c", "#2a1016", "#401a22", "#5a2430"), 2.0, 2.3), eye: "#ff3a2a", eyeGlow: true,
    tail: plate, tailKind: "seg",
    idle: (p, u) => { actPaw(p, L0, u, 1, 10, 0); actToss(p, u, 12, 18, 1.2); actTail(p, u, 18, 24, 0.5); },
    head: (c, A, _poll, crest) => {
      const H = A.H;
      // клетка-шлем из полос и шипы-рога
      c.sc.box(c.sc.group(0.3), plate, H(5.2, 1.8, 0), [2.3, 0.7, 4.8], [A.s, A.fv, A.w], 0.5, { tex: rimTex(gold, 0.85) });
      for (let k = 0; k < 3; k++) c.sc.cone(c.sc.group(0), plate, H(2 + k * 2.4, 2.0, -2.9), 0.45, H(2 + k * 2.4, 2.0, 2.9), 0.45, { tex: shine });
      spike(c, H(1.0, 2.6, 0), add(mul(A.fv, 0.8), mul(A.w, -0.6)), 4.2, 1.1);
      for (const sx of [-1, 1]) spike(c, H(0.6, 1.4, sx * 2.6), add(mul(A.s, sx), add(mul(A.w, -0.8), mul(A.fv, 0.3))), 3.0);
      for (let k = 0; k < 5; k++) { const q = crest(0.08 + k * 0.2); spike(c, add(q, [0, 0, 1.0]), [0, -0.6, 1], 3.0 - k * 0.3, 0.8); }
      // цепь от морды
      for (const sx of [-1, 1]) for (let k = 0; k <= 6; k++) {
        const t = k / 6, q = add(lerpV(H(8.6, -0.6, sx * 2.2), c.T([sx * 6.6, 15.0, 25.0]), t), [0, 0, -2.2 * 4 * t * (1 - t)]);
        c.sc.ball(c.sc.group(0), k % 2 ? gold : plate, q, 0.55, { big: false });
      }
    },
    deco: (c, lg, tail) => {
      const A = c.ax(X, Y, Z);
      // латы: пластины корпуса, круглые щиты с гербом на плече и бедре
      for (const sx of [-1, 1]) {
        c.sc.ell(c.sc.group(0.4), plate, c.T([sx * 8.4, 10.6, 22.8]), [1.8, 5.2, 5.6], A, { tex: rimTex(gold, 0.82) });
        over(c, VB.up, () => c.sc.ell(c.sc.group(0.4), plate, c.T([sx * 8.6, -11.2, 23.2]), [1.8, 5.8, 6.0], A, { tex: rimTex(gold, 0.82) }));
        for (const [y, z] of [[10.6, 23.2], [-11.2, 23.6]]) {
          const at = c.T([sx * 10.2, y, z]);
          c.sc.ell(c.sc.group(0), gold, at, [0.6, 3.0, 3.0], A, { tex: shine });
          c.sc.ball(c.sc.group(0), gold, add(at, [sx * 0.6, 0, 0]), 1.2, { tex: shine });
        }
        emblem(c, fac, c.T([sx * 10.8, -11.2, 23.6]), c.TD([sx, 0, 0]), "side");
      }
      c.sc.box(c.sc.group(0.4), plate, c.T([0, -0.4, 28.4]), [8.4, 10.4, 1.4], A, 1.2, { tex: rimTex(gold, 0.86) });
      over(c, VB.down, () => {
        const pc0 = c.T([0, 15.0, 22.0]);
        c.sc.ell(c.sc.group(0.6), plate, pc0, [8.0, 2.4, 5.4], c.ax(X, norm([0, 0.96, -0.28]), norm([0, 0.28, 0.96])), { tex: rimTex(gold, 0.8) });
        emblem(c, fac, add(pc0, c.TD([0, 2.4, 0.4])), c.TD([0, 1, 0]), "down");
      });
      for (let k = 0; k < 5; k++) spike(c, c.T([0, -8 + k * 3.8, 30.0]), [0, -0.5, 1], 2.6, 0.8);
      saddle(c, { y: -0.8, z: 31.0, w: 5.6, leather: M("алая подушка", R("#2a0606", "#4a0c0c", "#741818", "#a02a26", "#c8483a"), 1.9, 2.3), trim: gold, flapX: 9.8 });
      // наручи с шипами
      lg.forEach((l, i) => {
        c.sc.cone(c.sc.group(0.2), plate, lerpV(l.knee, l.fet, 0.25), 2.4, add(l.fet, [0, 0, -0.3]), 2.4, { tex: rimTex(gold, 0.75) });
        spike(c, lerpV(l.knee, l.fet, 0.4), [i % 2 ? 0.6 : -0.6, i < 2 ? 0.6 : -0.6, 0.9], 3.0, 0.8);
      });
      // шипы на хвосте-цепочке
      tail.slice(1).forEach((q, k) => k % 2 === 0 && spike(c, q, [0, -0.3, 1], 2.4 - k * 0.15, 0.7));
      void K;
    },
  });
}

// ---------------- 04. лавовый конь (эпический) ----------------
export function lavaHorse(): MountSpec {
  const stone = M("остывшая лава", R("#0c0a10", "#1a1620", "#2a2434", "#3e3648", "#56506a", "#706a86"), 2.0, 2.6);
  return horseSpec("lava_horse", "Лавовый конь", {
    coat: stone, coatTex: crackTex(FIRE_DEEP, 0.18), mane: FIRE, maneGlow: true, tail: FIRE, tailGlow: true, hoof: FIRE, eye: "#ffb03a", eyeGlow: true,
    lower: M("лава в трещинах", R("#140808", "#2a0c0a", "#4a1410", "#6a2014", "#8a3018"), 2.0, 2.4),
    idle: (p, u) => { actPaw(p, L0, u, 2, 11); actShake(p, u, 13, 21, 1.1); actTail(p, u, 20, 24, 0.6); },
    head: (c, A) => {
      // глаза и ноздри — жар
      for (const sx of [-1, 1]) c.sc.ball(c.sc.group(0), FIRE, A.H(9.6, -0.6, sx * 1.4), 0.55, { big: false });
    },
    deco: (c, lg, tail) => {
      saddle(c, { y: -0.8, z: 30.4, w: 5.8, leather: M("бордовая подушка", R("#1a0606", "#30100c", "#4c1a14", "#6a2820", "#8a3a2c"), 1.9, 2.3), trim: BRONZE, flapX: 9.0 });
      // свёртки по бокам седла
      for (const sx of [-1, 1]) c.sc.cone(c.sc.group(0.3), M("тёмная ткань", R("#1a140e", "#302418", "#4a3826", "#665038", "#86704e"), 2.0, 2.3), c.T([sx * 6.6, -6.4, 31.2]), 1.6, c.T([sx * 10.6, -6.4, 31.2]), 1.6);
      // копыта горят, угли летят от копыт и гривы
      flames(c, lg.map((l) => add(l.foot, [0, 0.4, 1.4])), FIRE, { len: 2.6, r: 1.6, back: 0.3 });
      embers(c, [...lg.map((l) => l.foot), c.T([0, 14, 36]), c.T([0, 10, 32]), c.T([0, 5, 31])], 14, FIRE, 14, 0.85);
      flames(c, tail.slice(2, 7), FIRE_DEEP, { len: 2.4, r: 1.2, back: 1.4, layer: VB.up });
    },
  });
}

// ---------------- 05. призрачный кошмар (эпический) ----------------
export function spectralHorse(): MountSpec {
  const armor = M("синие латы", R("#060a18", "#0e1630", "#1a2648", "#2a3c66", "#405a8a", "#6a86b4"), 1.9, 2.8);
  const red = M("алая кайма", R("#2a0408", "#4a0810", "#80141c", "#b4242a", "#e04a44"), 2.2, 2.4);
  const bone = M("кость черепа", R("#3a3024", "#6a5a40", "#9a8864", "#c8b88c", "#ece0b8"), 2.1, 2.5);
  const dark = M("тёмная шерсть", R("#04040a", "#0a0a16", "#141428", "#1e2240", "#2e3458"), 2.0, 2.4);
  return horseSpec("spectral_horse", "Призрачный кошмар", {
    coat: dark, lower: SPIRIT, hoof: M("призрачное копыто", R("#0a1a40", "#1a3a80", "#2e6ad0", "#5aa8ff", "#a8dcff"), 2.4, 2.0), mane: dark, tail: SPIRIT, tailGlow: true,
    eye: "#ff3a3a", eyeGlow: true,
    idle: (p, u) => { actRear(p, L0, u, 2, 13, 0.36); p.wing.forEach((w) => { w.spread += 0.5 * bump(win(u, 3 / 24, 14 / 24)); w.lift += 0.4 * bump(win(u, 3 / 24, 14 / 24)); }); actToss(p, u, 15, 21, 1); },
    head: (c, A) => {
      const H = A.H;
      c.sc.box(c.sc.group(0.3), armor, H(5.0, 1.8, 0), [2.4, 0.8, 5.2], [A.s, A.fv, A.w], 0.6, { tex: rimTex(red, 0.86) });
      // череп-налобник с рогами
      c.sc.ell(c.sc.group(0.4), bone, H(0.8, 2.6, 0), [1.8, 1.4, 2.0], [A.s, A.fv, A.w]);
      for (const sx of [-1, 1]) {
        c.sc.ball(c.sc.group(0), GEM_RED, H(1.0, 3.6, sx * 0.8), 0.5);
        c.sc.cone(c.sc.group(0), bone, H(-0.2, 2.6, sx * 1.6), 0.7, add(H(-0.2, 2.6, sx * 1.6), add(mul(A.w, -2.6), mul(A.s, sx * 1.2))), 0.15, { tex: shine });
      }
    },
    deco: (c, lg, tail) => {
      const A = c.ax(X, Y, Z);
      // латы и черепа на боках, лохмотья
      c.sc.box(c.sc.group(0.4), armor, c.T([0, -0.6, 27.6]), [8.6, 11.4, 2.0], A, 1.6, { tex: rimTex(red, 0.86) });
      for (const sx of [-1, 1]) {
        c.sc.ell(c.sc.group(0.4), armor, c.T([sx * 8.4, 10.6, 23.2]), [1.8, 5.0, 5.4], A, { tex: rimTex(red, 0.8) });
        const sk = c.T([sx * 9.4, -8.6, 23.0]);
        c.sc.ell(c.sc.group(0.4), bone, sk, [1.4, 2.6, 3.0], A);
        for (const dy of [-1, 1]) c.sc.ball(c.sc.group(0), GEM_RED, add(sk, [sx * 1.2, dy * 0.9, 0.6]), 0.55);
        for (let k = 0; k < 4; k++) c.sc.ell(c.sc.group(0), dark, c.T([sx * 8.6, -10 + k * 5, 16.4]), [0.6, 2.2, 3.0], A, { tex: hairTex });
      }
      saddle(c, { y: -0.8, z: 30.8, w: 5.6, leather: red, trim: armor, flapX: 9.6 });
      // призрачные крылья (перепонки), молнии у копыт, дух поднимается от ног
      for (const sx of [-1, 1]) membraneWing(c, sx, { root: [sx * 6.0, 4.0, 29.0], bone: armor, skin: M("призрачная перепонка", R("#0a1430", "#142450", "#203a78", "#3058a0", "#4a7ac8"), 2.1, 2.2), glowVein: SPIRIT, len: 0.95 });
      lg.forEach((l, k) => sparks(c, add(l.foot, [0, 0, 0.6]), add(l.fet, [k % 2 ? 2 : -2, 0, 2]), STORM, k, 3));
      embers(c, lg.map((l) => l.fet), 6, SPIRIT, 9, 0.6);
      void tail;
    },
  });
}

// ---------------- шестерня ----------------
const gearTex = (c: Ctx, k0 = 0): TexFn => (q) => {
  if (q.edge) return 0;
  const ang = Math.atan2(q.l[1], q.l[0]) + c.t * TAU * (c.p.run ? 2 : 1) + k0;
  const rr = Math.hypot(q.l[0], q.l[1]);
  if (rr < 0.9) return 0.6;
  return Math.cos(ang * 8) > 0.3 ? 0.4 : -1.2;
};

// ---------------- 02. механический бронзовый конь (эпический) ----------------
export function clockworkHorse(): MountSpec {
  const plate = M("воронёная сталь", R("#0e0c10", "#1c181e", "#2e282e", "#463c40", "#62565a", "#887a7a"), 1.9, 2.8);
  const tassel = M("алая кисть", R("#2a0606", "#4a0c0c", "#7a1414", "#a82a24", "#d04a3a"), 2.0, 2.3);
  return horseSpec("clockwork_horse", "Механический конь", {
    coat: plate, coatTex: rimTex(BRONZE, 0.86), mane: tassel, tail: tassel, noMane: true, eye: "#ff8a2a", eyeGlow: true, hoof: BRONZE,
    idle: (p, u) => {
      // механика: голова наклоняется рывками (ступени), копыто стучит
      const s = win(u, 2 / 24, 10 / 24);
      p.headY += 0.3 * Math.round(Math.sin(s * Math.PI * 2) * 2) / 2;
      p.neckP += 0.15 * Math.round(bump(s) * 2) / 2;
      actPaw(p, L0, u, 12, 20, 1); actTail(p, u, 18, 24, 0.6);
    },
    head: (c, A, _poll, crest) => {
      const H = A.H;
      c.sc.box(c.sc.group(0.3), BRONZE, H(5.2, 1.8, 0), [2.3, 0.7, 4.8], [A.s, A.fv, A.w], 0.5, { tex: shine });
      for (const sx of [-1, 1]) c.sc.ell(c.sc.group(0), BRONZE, H(2.4, 0.8, sx * 2.7), [0.5, 1.8, 1.8], [A.s, A.fv, A.w], { tex: gearTex(c, sx) });
      // гребень-пластины с кисточками
      for (let k = 0; k < 4; k++) {
        const q = crest(0.1 + k * 0.24);
        c.sc.box(c.sc.group(0.2), BRONZE, add(q, [0, 0, 0.8]), [1.4, 1.6, 1.0], c.ax(X, Y, Z), 0.4, { tex: shine });
        c.sc.cone(c.sc.group(0), tassel, add(q, [0, 0, 1.6]), 0.7, add(q, [0, -1.4, 3.6]), 0.35, { tex: hairTex });
      }
      // пар из ноздрей
      embers(c, [H(10.6, -1.2, 1.2), H(10.6, -1.2, -1.2)], 3, M("пар", R("#6a6a72", "#9a9aa4", "#c8c8d0", "#ececf2", "#ffffff"), 3.2, 0.8), 5, 0.8, [0, 1.2, 0], VB.down);
    },
    deco: (c, lg) => {
      const A = c.ax(X, Y, Z);
      // горнило в груди и на боку: светится сквозь решётку
      over(c, VB.down, () => {
        c.sc.ell(c.sc.group(0.4), FIRE, c.T([0, 13.6, 21.0]), [4.4, 3.0, 4.0], A);
        for (let k = 0; k < 4; k++) c.sc.cone(c.sc.group(0), BRONZE, c.T([-4.2, 15.6, 18.4 + k * 1.6]), 0.4, c.T([4.2, 15.6, 18.4 + k * 1.6]), 0.4, { tex: shine });
      });
      for (const sx of [-1, 1]) {
        c.sc.ell(c.sc.group(0), FIRE_DEEP, c.T([sx * 8.6, 1.0, 20.6]), [0.8, 4.6, 3.0], A);
        // шестерни на плече и бедре, крутятся
        for (const [y, z, r] of [[9.6, 23.4, 3.6], [-10.6, 23.4, 3.4], [-4, 19, 2.2]]) c.sc.ell(c.sc.group(0), BRONZE, c.T([sx * 9.0, y, z]), [r, r, 0.7], c.ax(norm([0, 1, 0]), Z, [sx, 0, 0]), { tex: gearTex(c, y) });
      }
      saddle(c, { y: -0.8, z: 30.0, w: 5.6, leather: M("алое сиденье", R("#2a0606", "#4a0c0c", "#741818", "#a02a26", "#c8483a"), 1.9, 2.3), trim: BRONZE, flapX: 9.0, cantle: 1.0 });
      // ключ завода на крупе
      c.sc.cone(c.sc.group(0), BRONZE, c.T([0, -10.4, 30.2]), 0.7, c.T([0, -10.4, 34.0]), 0.7, { tex: shine });
      c.sc.ell(c.sc.group(0), BRONZE, c.T([0, -10.4, 35.2]), [2.6, 0.5, 1.2], A, { tex: shine });
      embers(c, [c.T([0, 14, 24])], 4, FIRE, 8, 0.6);
      lg.forEach((l) => c.sc.cone(c.sc.group(0.2), BRONZE, lerpV(l.knee, l.fet, 0.5), 2.2, add(l.fet, [0, 0, -0.3]), 2.4, { tex: shine }));
    },
  });
}

// ---------------- 06. фарфоровый механический конь (эпический) ----------------
export function clockworkWhite(): MountSpec {
  const porc = M("фарфор", R("#4a4450", "#7a7484", "#a8a2b2", "#d0ccd8", "#ecebf2", "#ffffff"), 2.4, 2.6);
  const red = M("алый шёлк", R("#3a0606", "#6a0e0e", "#a01a18", "#d0342a", "#f06048", "#ffa080"), 2.2, 2.4);
  const filig: TexFn = (q) => (q.edge ? 0 : q.lum > 0.86 ? 1 : (Math.abs(Math.sin(q.l[0] * 1.6 + Math.sin(q.l[1] * 1.3) * 2)) < 0.14 ? { mat: GOLD, d: 0 } : 0));
  return horseSpec("clockwork_white", "Фарфоровый конь", {
    coat: porc, coatTex: filig, mane: red, tail: red, eye: "#3a86c8", hoof: GOLD,
    lower: M("шарниры", R("#1a1408", "#3a2c12", "#6a5020", "#9a7836", "#c8a458"), 2.2, 2.6),
    idle: (p, u) => { actPrance(p, L0, u, 3, 13); actLook(p, u, 14, 22, 0.5); actTail(p, u, 20, 24, 0.6); },
    head: (c, A) => {
      const H = A.H;
      c.sc.ell(c.sc.group(0), GOLD, H(2.2, 1.6, -2.6), [0.4, 1.7, 1.7], [A.s, A.fv, A.w], { tex: gearTex(c) });
      // алая лента у шеи
      for (let k = 0; k < 4; k++) c.sc.ell(c.sc.group(0), red, H(-1.4 - k * 0.5, -2.6 - k * 0.6, -2.4 + k * 1.6), [0.4, 1.6, 0.9], [A.s, A.w, A.fv], { big: false });
    },
    deco: (c, lg, tail) => {
      const A = c.ax(X, Y, Z);
      for (const sx of [-1, 1]) {
        c.sc.ell(c.sc.group(0.4), porc, c.T([sx * 8.6, 10.2, 23.0]), [1.8, 5.2, 5.6], A, { tex: rimTex(GOLD, 0.8) });
        over(c, VB.up, () => c.sc.ell(c.sc.group(0.4), porc, c.T([sx * 8.8, -11.2, 23.6]), [1.8, 5.6, 5.8], A, { tex: rimTex(GOLD, 0.8) }));
        // окно в боку: шестерни внутри
        for (const [y, z, r] of [[0, 21.6, 3.2], [3.8, 19.4, 2.0], [-3.4, 19.8, 2.2]]) c.sc.ell(c.sc.group(0), GOLD, c.T([sx * 8.4, y, z]), [r, r, 0.6], c.ax(norm([0, 1, 0]), Z, [sx, 0, 0]), { tex: gearTex(c, y) });
      }
      saddle(c, { y: -0.8, z: 30.4, w: 5.6, leather: red, trim: GOLD, flapX: 9.4, cantle: 1.2 });
      // кисть на хвосте: золотой зажим
      c.sc.cone(c.sc.group(0), GOLD, tail[0], 1.6, tail[1], 1.4, { tex: shine });
      lg.forEach((l) => c.sc.cone(c.sc.group(0.2), porc, lerpV(l.knee, l.fet, 0.45), 2.1, add(l.fet, [0, 0, -0.3]), 2.2, { tex: rimTex(GOLD, 0.7) }));
      embers(c, [c.T([0, 0, 22])], 3, M("золотая искра", R("#5a3a08", "#a8781c", "#f0c040", "#ffe890", "#fffbe0"), 3.2, 0.8), 6, 0.5);
    },
  });
}

// ---------------- 21. рогатый драконоконь (эпический) ----------------
export function dragonHorse(): MountSpec {
  const scl = M("бледная чешуя", R("#1a2030", "#2e3a50", "#4a5a74", "#6e809c", "#9aaac2", "#c8d4e6"), 2.1, 2.6);
  const fur = M("синяя грива", R("#04122a", "#0a2448", "#143c6e", "#1e5a96", "#3a82c0", "#6aaee0"), 2.1, 2.5);
  return horseSpec("dragonhorse", "Рогатый драконоконь", {
    coat: scl, coatTex: scaleTex(-0.8), mane: fur, tail: fur, eye: "#ffd040", eyeGlow: false, feather: fur,
    lower: M("тёмная чешуя", R("#0e1220", "#1c2234", "#2c3650", "#40506e", "#5a6c8e"), 2.0, 2.5), hoof: CLAW,
    idle: (p, u) => { actShake(p, u, 2, 10, 1.2); actToss(p, u, 12, 20, 1.3); actTail(p, u, 18, 24, 0.8); },
    head: (c, A) => {
      const H = A.H;
      // рога назад и золотой рог-клинок налобника
      for (const sx of [-1, 1]) {
        let q = H(0.2, 1.6, sx * 1.8), d = add(mul(A.w, -1), add(mul(A.fv, 0.6), mul(A.s, sx * 0.4)));
        for (let k = 0; k < 4; k++) {
          const nq = add(q, mul(norm(d), 1.6));
          c.sc.cone(c.sc.group(0.2), HORN_DK, q, 0.9 - k * 0.18, nq, 0.75 - k * 0.18, { tex: shine });
          q = nq; d = add(d, mul(A.fv, -0.5));
        }
      }
      c.sc.box(c.sc.group(0.3), GOLD, H(4.6, 1.9, 0), [2.0, 0.6, 4.0], [A.s, A.fv, A.w], 0.5, { tex: shine });
      c.sc.cone(c.sc.group(0), GOLD, H(4.0, 2.4, 0), 1.0, add(H(4.0, 2.4, 0), add(mul(A.fv, 3.4), mul(A.w, 2.4))), 0.15, { tex: shine });
      c.sc.ball(c.sc.group(0), GEM_AZ, H(2.6, 2.5, 0), 0.8);
    },
    deco: (c, lg) => {
      const A = c.ax(X, Y, Z);
      // золотые пластины с камнями и шипами
      for (const sx of [-1, 1]) {
        c.sc.ell(c.sc.group(0.4), M("белая эмаль", R("#3a4250", "#6a7484", "#98a2b2", "#c4ccda", "#e6ecf4"), 2.2, 2.4), c.T([sx * 8.6, 9.6, 23.4]), [1.6, 5.4, 6.0], A, { tex: rimTex(GOLD, 0.72) });
        over(c, VB.up, () => c.sc.ell(c.sc.group(0.4), M("белая эмаль", R("#3a4250", "#6a7484", "#98a2b2", "#c4ccda", "#e6ecf4"), 2.2, 2.4), c.T([sx * 8.8, -10.6, 23.6]), [1.6, 6.0, 6.0], A, { tex: rimTex(GOLD, 0.72) }));
        c.sc.ball(c.sc.group(0), GEM_AZ, c.T([sx * 10.2, 9.6, 20.0]), 0.7);
        c.sc.ball(c.sc.group(0), GEM_AZ, c.T([sx * 10.4, -10.6, 20.0]), 0.7);
        c.sc.cone(c.sc.group(0), GOLD, c.T([sx * 9.4, 6.8, 28.0]), 1.0, c.T([sx * 10.4, 3.0, 33.0]), 0.15, { tex: shine });
      }
      for (let k = 0; k < 4; k++) c.sc.cone(c.sc.group(0), HORN_DK, c.T([0, -9 - k * 2.4, 30.4 - k * 0.4]), 0.7, c.T([0, -10.4 - k * 2.4, 32.6 - k * 0.5]), 0.12);
      saddle(c, { y: -0.8, z: 30.4, w: 5.6, leather: M("тёмная кожа", R("#140c0a", "#26170f", "#3e2618", "#5a3a24", "#7a5636"), 1.9, 2.3), trim: GOLD, flapX: 9.6 });
      embers(c, [c.T([0, 12, 34])], 3, GEM_AZ, 7, 0.5);
      void lg;
    },
  });
}
void IRON; void LEATHER; void STEEL; void STORM; void eyes; void caparison; void near; void rot;
